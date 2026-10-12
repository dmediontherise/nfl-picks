#!/usr/bin/env bash
set -euo pipefail

# scripts/__tests__/publish-docs.test.sh
# Tests publish-docs.sh against real git in temporary directories.
# Verifies the 4 cases specified in Task 049:
#   Case a: job A pushes first; job B's first push is rejected; B's final remote commit contains B's snapshot, A's snapshot and a docs/ built from both.
#   Case b: both jobs edit the same snapshot file (C2 case); B ends with its own snapshot, no conflict markers anywhere, no rebase in progress, exit 0.
#   Case c: B's snapshot ends up identical to the remote's after reset; B exits 0 without a commit.
#   Case d: push always rejected (pre-receive hook); exit 1 after 3 attempts with a clean tree.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_UNDER_TEST="${REPO_ROOT}/scripts/publish-docs.sh"

TMP_BASE="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_BASE}"
}
trap cleanup EXIT

setup_repos() {
  local test_name="$1"
  local test_dir="${TMP_BASE}/${test_name}"
  mkdir -p "${test_dir}"

  local remote_dir="${test_dir}/remote.git"
  local clone_a="${test_dir}/clone_a"
  local clone_b="${test_dir}/clone_b"

  # Initialize bare remote
  git init --bare "${remote_dir}" -b main >/dev/null 2>&1

  # Create initial commit in a temp seed clone
  local seed_dir="${test_dir}/seed"
  git clone "${remote_dir}" "${seed_dir}" >/dev/null 2>&1
  mkdir -p "${seed_dir}/src/data" "${seed_dir}/docs" "${seed_dir}/scripts"
  echo '{"initial":"seed"}' > "${seed_dir}/src/data/rosterSnapshot.json"
  echo '{"initial":"seed"}' > "${seed_dir}/src/data/teamStats.json"
  echo 'Initial docs' > "${seed_dir}/docs/index.html"
  cp "${SCRIPT_UNDER_TEST}" "${seed_dir}/scripts/publish-docs.sh"
  chmod +x "${seed_dir}/scripts/publish-docs.sh"

  # Commit and push initial seed
  (
    cd "${seed_dir}"
    git config user.name "seed-bot"
    git config user.email "seed@example.com"
    git add .
    git commit -m "chore: initial commit" >/dev/null 2>&1
    git push origin main >/dev/null 2>&1
  )

  # Clone job A and job B
  git clone "${remote_dir}" "${clone_a}" >/dev/null 2>&1
  git clone "${remote_dir}" "${clone_b}" >/dev/null 2>&1

  # Create stub npm in a bin dir for each clone that writes build/index.html
  for dir in "${clone_a}" "${clone_b}"; do
    (
      cd "${dir}"
      git config user.name "test-bot"
      git config user.email "bot@example.com"
      mkdir -p bin
      cat << 'EOF' > bin/npm
#!/usr/bin/env bash
if [ "$1" = "run" ] && [ "$2" = "build" ]; then
  mkdir -p build
  # Write all current JSON snapshots in src/data into build/index.html
  echo "BUILD_START" > build/index.html
  for f in src/data/*.json; do
    if [ -f "$f" ]; then
      echo "FILE: $f" >> build/index.html
      cat "$f" >> build/index.html
    fi
  done
  echo "BUILD_END" >> build/index.html
  exit 0
fi
exit 0
EOF
      chmod +x bin/npm
    )
  done

  echo "${test_dir}"
}

echo "Running publish-docs.sh test suite..."

# --- Case a ---
# job A pushes first; job B's first push is rejected;
# B's final remote commit contains B's snapshot, A's snapshot and a docs/ built from both.
TEST_DIR_A="$(setup_repos "case_a")"
CLONE_A="${TEST_DIR_A}/clone_a"
CLONE_B="${TEST_DIR_A}/clone_b"

# Job A updates rosterSnapshot.json and publishes
(
  cd "${CLONE_A}"
  export PATH="${CLONE_A}/bin:${PATH}"
  echo '{"roster":"job_a_data"}' > src/data/rosterSnapshot.json
  bash scripts/publish-docs.sh src/data/rosterSnapshot.json "chore: update roster A" >/dev/null 2>&1
)

# Concurrently, Job B updates teamStats.json and tries to publish
(
  cd "${CLONE_B}"
  export PATH="${CLONE_B}/bin:${PATH}"
  echo '{"teamStats":"job_b_data"}' > src/data/teamStats.json
  bash scripts/publish-docs.sh src/data/teamStats.json "chore: update teamStats B" >/dev/null 2>&1
)

# Verify Case a
(
  cd "${CLONE_B}"
  git fetch origin >/dev/null 2>&1
  git reset --hard origin/main >/dev/null 2>&1

  ROSTER_CONTENT="$(cat src/data/rosterSnapshot.json)"
  STATS_CONTENT="$(cat src/data/teamStats.json)"
  DOCS_CONTENT="$(cat docs/index.html)"

  if [[ "${ROSTER_CONTENT}" == *"job_a_data"* ]] && \
     [[ "${STATS_CONTENT}" == *"job_b_data"* ]] && \
     [[ "${DOCS_CONTENT}" == *"job_a_data"* ]] && \
     [[ "${DOCS_CONTENT}" == *"job_b_data"* ]]; then
    echo "CASE_A: PASS - B reconciled A's snapshot and built docs containing both"
  else
    echo "CASE_A: FAIL - content missing in remote tip"
    exit 1
  fi
)

# --- Case b ---
# both jobs edit the same snapshot file (the C2 case);
# B ends with its own snapshot, no conflict markers anywhere, no rebase in progress, exit 0.
TEST_DIR_B="$(setup_repos "case_b")"
CLONE_A="${TEST_DIR_B}/clone_a"
CLONE_B="${TEST_DIR_B}/clone_b"

# Job A updates rosterSnapshot.json and publishes
(
  cd "${CLONE_A}"
  export PATH="${CLONE_A}/bin:${PATH}"
  echo '{"roster":"from_job_a"}' > src/data/rosterSnapshot.json
  bash scripts/publish-docs.sh src/data/rosterSnapshot.json "chore: update roster A" >/dev/null 2>&1
)

# Job B also updates the same file rosterSnapshot.json with its own data
B_EXIT=0
(
  cd "${CLONE_B}"
  export PATH="${CLONE_B}/bin:${PATH}"
  echo '{"roster":"from_job_b"}' > src/data/rosterSnapshot.json
  bash scripts/publish-docs.sh src/data/rosterSnapshot.json "chore: update roster B" >/dev/null 2>&1
) || B_EXIT=$?

(
  cd "${CLONE_B}"
  git fetch origin >/dev/null 2>&1
  git reset --hard origin/main >/dev/null 2>&1

  ROSTER_CONTENT="$(cat src/data/rosterSnapshot.json)"

  # Assert no conflict markers
  if grep -q "<<<<<<" src/data/rosterSnapshot.json docs/index.html; then
    echo "CASE_B: FAIL - conflict markers found"
    exit 1
  fi

  # Assert no rebase in progress
  if [ -d ".git/rebase-merge" ] || [ -d ".git/rebase-apply" ]; then
    echo "CASE_B: FAIL - rebase in progress"
    exit 1
  fi

  if [ "${B_EXIT}" -eq 0 ] && [[ "${ROSTER_CONTENT}" == *"from_job_b"* ]]; then
    echo "CASE_B: PASS - B cleanly overwrote conflicting file without conflict markers or rebase"
  else
    echo "CASE_B: FAIL - unexpected exit ${B_EXIT} or content mismatch"
    exit 1
  fi
)

# --- Case c ---
# B's snapshot ends up identical to the remote's after reset; B exits 0 without a commit.
TEST_DIR_C="$(setup_repos "case_c")"
CLONE_A="${TEST_DIR_C}/clone_a"
CLONE_B="${TEST_DIR_C}/clone_b"

# Job A updates rosterSnapshot.json with value X and pushes
(
  cd "${CLONE_A}"
  export PATH="${CLONE_A}/bin:${PATH}"
  echo '{"roster":"identical_data"}' > src/data/rosterSnapshot.json
  bash scripts/publish-docs.sh src/data/rosterSnapshot.json "chore: update roster A" >/dev/null 2>&1
)

# Job B also updated rosterSnapshot.json with value X before its first push
(
  cd "${CLONE_B}"
  export PATH="${CLONE_B}/bin:${PATH}"
  echo '{"roster":"identical_data"}' > src/data/rosterSnapshot.json

  OUTPUT="$(bash scripts/publish-docs.sh src/data/rosterSnapshot.json "chore: update roster B")"
  if echo "${OUTPUT}" | grep -q "identical to remote copy"; then
    echo "CASE_C: PASS - B detected identical snapshot after reset and exited 0 without committing"
  else
    echo "CASE_C: FAIL - did not detect identical snapshot: ${OUTPUT}"
    exit 1
  fi
)

# --- Case d ---
# push always rejected (e.g. pre-receive hook that rejects); exit 1 after 3 attempts with a clean tree.
TEST_DIR_D="$(setup_repos "case_d")"
REMOTE_D="${TEST_DIR_D}/remote.git"
CLONE_D="${TEST_DIR_D}/clone_b"

# Install rejecting pre-receive hook in remote that records attempt counts
mkdir -p "${REMOTE_D}/hooks"
COUNTER_FILE="${TEST_DIR_D}/push_count.txt"
echo "0" > "${COUNTER_FILE}"

cat << EOF > "${REMOTE_D}/hooks/pre-receive"
#!/usr/bin/env bash
COUNT=\$(cat "${COUNTER_FILE}")
echo \$((COUNT + 1)) > "${COUNTER_FILE}"
echo "Pre-receive hook: push attempt \$((COUNT + 1)) rejected by test." >&2
exit 1
EOF
chmod +x "${REMOTE_D}/hooks/pre-receive"

D_EXIT=0
(
  cd "${CLONE_D}"
  export PATH="${CLONE_D}/bin:${PATH}"
  echo '{"roster":"rejected_update"}' > src/data/rosterSnapshot.json
  bash scripts/publish-docs.sh src/data/rosterSnapshot.json "chore: rejected" >/dev/null 2>&1
) || D_EXIT=$?

(
  cd "${CLONE_D}"
  # Assert exit 1
  if [ "${D_EXIT}" -ne 1 ]; then
    echo "CASE_D: FAIL - expected exit 1, got ${D_EXIT}"
    exit 1
  fi

  # Assert push was attempted exactly 3 times (M2)
  FINAL_PUSH_COUNT="$(cat "${COUNTER_FILE}")"
  if [ "${FINAL_PUSH_COUNT}" -ne 3 ]; then
    echo "CASE_D: FAIL - expected exactly 3 push attempts, got ${FINAL_PUSH_COUNT}"
    exit 1
  fi

  # Assert clean tree
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "CASE_D: FAIL - tree is not clean"
    exit 1
  fi

  # Assert local HEAD equals origin/main (no unpushed commit left) (M1)
  LOCAL_HEAD="$(git rev-parse HEAD)"
  REMOTE_HEAD="$(git rev-parse origin/main)"
  if [ "${LOCAL_HEAD}" != "${REMOTE_HEAD}" ]; then
    echo "CASE_D: FAIL - local HEAD (${LOCAL_HEAD}) does not equal origin/main (${REMOTE_HEAD})"
    exit 1
  fi

  # Assert no rebase or merge in progress
  if [ -d ".git/rebase-merge" ] || [ -d ".git/rebase-apply" ] || [ -f ".git/MERGE_HEAD" ]; then
    echo "CASE_D: FAIL - rebase or merge in progress"
    exit 1
  fi

  echo "CASE_D: PASS - exited 1 after exactly 3 rejected attempts with clean tree at origin/main"
)

# --- Case e (M4) ---
# Running script with an unchanged snapshot exits 0 without building or committing
TEST_DIR_E="$(setup_repos "case_e")"
CLONE_E="${TEST_DIR_E}/clone_a"

(
  cd "${CLONE_E}"
  export PATH="${CLONE_E}/bin:${PATH}"

  HEAD_BEFORE="$(git rev-parse HEAD)"
  DOCS_BEFORE="$(cat docs/index.html)"

  # Run publish-docs.sh on an unchanged snapshot file
  NOOP_OUTPUT="$(bash scripts/publish-docs.sh src/data/rosterSnapshot.json "chore: should not commit")"
  NOOP_EXIT=$?

  if [ "${NOOP_EXIT}" -ne 0 ]; then
    echo "CASE_E: FAIL - expected exit 0 on unchanged snapshot, got ${NOOP_EXIT}"
    exit 1
  fi

  if ! echo "${NOOP_OUTPUT}" | grep -q "No changes detected"; then
    echo "CASE_E: FAIL - expected 'No changes detected' in output, got: ${NOOP_OUTPUT}"
    exit 1
  fi

  HEAD_AFTER="$(git rev-parse HEAD)"
  if [ "${HEAD_BEFORE}" != "${HEAD_AFTER}" ]; then
    echo "CASE_E: FAIL - unexpected new commit on unchanged snapshot"
    exit 1
  fi

  DOCS_AFTER="$(cat docs/index.html)"
  if [ "${DOCS_BEFORE}" != "${DOCS_AFTER}" ]; then
    echo "CASE_E: FAIL - docs/ was rebuilt on unchanged snapshot"
    exit 1
  fi

  echo "CASE_E: PASS - unchanged snapshot exited 0 without building or committing"
)

echo "All test cases passed successfully."
exit 0
