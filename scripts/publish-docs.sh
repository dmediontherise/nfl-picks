#!/usr/bin/env bash
set -euo pipefail

# scripts/publish-docs.sh <snapshot-file> <commit-message>
# Publishes a fresh site build to docs/ and commits it together with the updated snapshot.
# If snapshot-file did not change, skips build and commit.

SNAPSHOT_FILE="${1:?Missing snapshot file argument}"
COMMIT_MSG="${2:?Missing commit message argument}"

if git diff --quiet "${SNAPSHOT_FILE}"; then
  echo "No changes detected in ${SNAPSHOT_FILE}. Skipping build and publish."
  exit 0
fi

# Save the new snapshot file to a temp path before any build or git modifications
TEMP_SNAPSHOT="$(mktemp)"
cleanup() {
  rm -f "${TEMP_SNAPSHOT}"
}
trap cleanup EXIT

cp "${SNAPSHOT_FILE}" "${TEMP_SNAPSHOT}"

# Identify current branch (fallback to HEAD)
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "${CURRENT_BRANCH}" = "HEAD" ]; then
  # If detached HEAD, determine branch or remote tracking branch
  CURRENT_BRANCH="main"
fi

# Configure git bot credentials if not already set
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

# Build site and commit snapshot + docs
build_and_commit() {
  # Set CI=false so react-scripts build treats ESLint warnings as warnings, not build errors.
  CI=false npm run build

  # Replace docs/ with contents of build/
  rm -rf docs
  cp -R build docs

  # Stage snapshot and docs
  git add "${SNAPSHOT_FILE}" docs

  # Commit snapshot and docs together
  git commit -m "${COMMIT_MSG}"
}

echo "Changes detected in ${SNAPSHOT_FILE}. Building and publishing to docs/..."
build_and_commit

# Bounded push retry (up to 3 attempts) from clean tree without rebasing
MAX_RETRIES=3
for attempt in $(seq 1 "${MAX_RETRIES}"); do
  if git push; then
    echo "Successfully pushed commit (attempt ${attempt})."
    exit 0
  fi

  echo "Push failed (attempt ${attempt}/${MAX_RETRIES}). Resetting to remote tip and re-applying snapshot..."

  # Abort rebase if one was somehow in progress
  git rebase --abort 2>/dev/null || true

  # Fetch origin and reset hard to remote tracking branch
  git fetch origin
  git reset --hard "origin/${CURRENT_BRANCH}"

  # Restore saved snapshot over file
  cp "${TEMP_SNAPSHOT}" "${SNAPSHOT_FILE}"

  # If restored snapshot is now identical to remote copy, exit 0
  if git diff --quiet "${SNAPSHOT_FILE}"; then
    echo "Snapshot is identical to remote copy. Nothing to publish."
    exit 0
  fi

  # Rebuild, replace docs, and recommit from the clean updated remote tree
  build_and_commit
done

# On exhausted retries, leave the working tree clean
git reset --hard "origin/${CURRENT_BRANCH}" 2>/dev/null || true

echo "Failed to push after ${MAX_RETRIES} attempts."
exit 1
