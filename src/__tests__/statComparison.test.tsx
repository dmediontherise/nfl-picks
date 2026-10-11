import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import StatComparison, { computeUnitRanks } from '../StatComparison';
import { NFL_TEAM_ABBREVIATIONS, TeamStatsSnapshot } from '../data/teamStats';

interface UnitFixture {
  passOff: number;
  rushOff: number;
  passDef: number;
  rushDef: number;
}

function buildSnapshot(units: Record<string, UnitFixture>): TeamStatsSnapshot {
  const teams: Record<string, any> = {};
  for (const [abbr, u] of Object.entries(units)) {
    teams[abbr] = {
      team: abbr,
      current: {
        season: 2026,
        gamesPlayed: 5,
        offense: {
          epaPerPlay: (u.passOff + u.rushOff) / 2,
          pass: { epaPerPlay: u.passOff },
          rush: { epaPerPlay: u.rushOff },
        },
        defense: {
          epaPerPlay: (u.passDef + u.rushDef) / 2,
          pass: { epaPerPlay: u.passDef },
          rush: { epaPerPlay: u.rushDef },
        },
      },
      priorSeason: { season: 2025 },
    };
  }
  return {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    season: 2026,
    dataAttribution: '',
    ftnJoinCoveragePct: 0,
    leagueAverage: { offense: {}, defense: {} },
    teams,
  } as unknown as TeamStatsSnapshot;
}

describe('computeUnitRanks (Task 031)', () => {
  test('rank 1 is the highest offensive EPA/play and the lowest defensive EPA/play allowed', () => {
    // Hand-built four-team fixture with distinct pass/rush EPA/play values.
    //   offense pass (higher better):  A 0.30 > B 0.20 > C 0.10 > D 0.00
    //   offense rush (higher better):  B 0.15 > D 0.10 > C 0.05 > A -0.05
    //   defense pass (lower better):   B -0.10 < C 0.00 < A 0.05 < D 0.10
    //   defense rush (lower better):   C -0.06 < A 0.02 < D 0.04 < B 0.08
    const snapshot = buildSnapshot({
      A: { passOff: 0.3, rushOff: -0.05, passDef: 0.05, rushDef: 0.02 },
      B: { passOff: 0.2, rushOff: 0.15, passDef: -0.1, rushDef: 0.08 },
      C: { passOff: 0.1, rushOff: 0.05, passDef: 0.0, rushDef: -0.06 },
      D: { passOff: 0.0, rushOff: 0.1, passDef: 0.1, rushDef: 0.04 },
    });

    const ranks = computeUnitRanks(snapshot);

    // rank 1 holders, per dimension
    expect(ranks.A.passOffense).toBe(1);
    expect(ranks.B.rushOffense).toBe(1);
    expect(ranks.B.passDefense).toBe(1);
    expect(ranks.C.rushDefense).toBe(1);

    // exact ranks for all four teams
    expect(ranks.A).toEqual({ passOffense: 1, rushOffense: 4, passDefense: 3, rushDefense: 2 });
    expect(ranks.B).toEqual({ passOffense: 2, rushOffense: 1, passDefense: 1, rushDefense: 4 });
    expect(ranks.C).toEqual({ passOffense: 3, rushOffense: 3, passDefense: 2, rushDefense: 1 });
    expect(ranks.D).toEqual({ passOffense: 4, rushOffense: 2, passDefense: 4, rushDefense: 3 });
  });
});

describe('StatComparison render (Task 031)', () => {
  test('renders the display-only disclaimer and the matchup reads with the fixture ranks', () => {
    // Valid 32-team snapshot (loadTeamStats validates all 32 teams):
    // KC is the best pass offense (#1) and best pass defense (#1);
    // BUF is second in both (#2).
    const units: Record<string, UnitFixture> = {};
    for (const abbr of NFL_TEAM_ABBREVIATIONS) {
      units[abbr] = { passOff: 0, rushOff: 0, passDef: 0, rushDef: 0 };
    }
    units.KC = { passOff: 0.5, rushOff: 0, passDef: -0.3, rushDef: 0 };
    units.BUF = { passOff: 0.4, rushOff: 0, passDef: -0.2, rushDef: 0 };

    const { container } = render(
      <StatComparison homeTeamAbbr="KC" awayTeamAbbr="BUF" customTeamStats={buildSnapshot(units)} />
    );

    expect(screen.getByText(/Does not affect pick/)).toBeInTheDocument();
    expect(screen.queryByText('Snapshot is stale (>7d)')).not.toBeInTheDocument();

    const text = (container.textContent || '').replace(/\s+/g, ' ');
    expect(text).toContain('BUF pass offense #2 vs KC pass defense #1');
    expect(text).toContain('KC pass offense #1 vs BUF pass defense #2');
  });
});

describe('StatComparison stale badge (Task 035)', () => {
  test('a 32-team fixture older than the staleness window shows "Snapshot is stale (>7d)"', () => {
    const units: Record<string, UnitFixture> = {};
    for (const abbr of NFL_TEAM_ABBREVIATIONS) {
      units[abbr] = { passOff: 0, rushOff: 0, passDef: 0, rushDef: 0 };
    }
    const snapshot = buildSnapshot(units);
    // 8 days old: past the 7-day window loadTeamStats uses (teamStats.ts:436-438).
    snapshot.fetchedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

    render(
      <StatComparison homeTeamAbbr="KC" awayTeamAbbr="BUF" customTeamStats={snapshot} />
    );

    expect(screen.getByText('Snapshot is stale (>7d)')).toBeInTheDocument();
  });
});
