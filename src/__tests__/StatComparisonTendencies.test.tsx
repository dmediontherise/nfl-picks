import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import StatComparison from '../StatComparison';
import { NFL_TEAM_ABBREVIATIONS, TeamStatsSnapshot } from '../data/teamStats';

function createBaseSnapshot(): TeamStatsSnapshot {
  const teams: Record<string, any> = {};
  for (const abbr of NFL_TEAM_ABBREVIATIONS) {
    teams[abbr] = {
      team: abbr,
      current: {
        season: 2026,
        gamesPlayed: 5,
        offense: {
          epaPerPlay: 0.1,
          pass: { epaPerPlay: 0.15 },
          rush: { epaPerPlay: 0.05 },
          thirdDownConversion: 0.42,
          redZone: { tdRate: 0.65 },
          ftn: {
            blitzRate: 0.25,
            playActionRate: 0.22,
            motionRate: 0.55,
            box8PlusRate: 0.08,
          },
        },
        defense: {
          epaPerPlay: -0.05,
          pass: { epaPerPlay: -0.1 },
          rush: { epaPerPlay: 0.0 },
          ftn: {
            blitzRate: 0.3,
            box8PlusRate: 0.1,
          },
        },
        tendencies: {
          formation: {
            shotgun: { share: 0.62, plays: 150 },
            underCenter: { share: 0.33, plays: 80 },
            pistol: { share: 0.05, plays: 12 },
          },
          playAction: { share: 0.24, plays: 58 },
          motion: { share: 0.58, plays: 140 },
          noHuddle: { share: 0.05, plays: 12 },
          screen: { share: 0.08, plays: 19 },
          rpo: { share: 0.09, plays: 22 },
          box8Plus: { share: 0.11, plays: 26 },
          blitz: { share: 0.29, plays: 45 },
          passRushersMean: { mean: 4.25, plays: 155 },
        },
      },
      priorSeason: {
        season: 2025,
        gamesPlayed: 17,
        totalPlays: 1050,
        offensivePersonnel: {
          p11: { share: 0.6, plays: 630 },
          topPersonnelEpa: [{ group: '11', share: 0.6, epaPerPlay: 0.08, plays: 630 }],
        },
        formation: {
          shotgun: { share: 0.55, plays: 577 },
        },
        defensiveFront: {
          nickelPlus: { share: 0.7, plays: 735 },
          f43: { share: 0.2, plays: 210 },
          f34: { share: 0.1, plays: 105 },
        },
        coverage: {
          zone: { share: 0.68, plays: 400 },
          man: { share: 0.32, plays: 188 },
        },
      },
      priorSeasonTendencies: {
        formation: {
          shotgun: { share: 0.575, plays: 604 },
          underCenter: { share: 0.38, plays: 399 },
          pistol: { share: 0.045, plays: 47 },
        },
        playAction: { share: 0.185, plays: 300 },
        motion: { share: 0.52, plays: 546 },
        noHuddle: { share: 0.03, plays: 32 },
        screen: { share: 0.07, plays: 74 },
        rpo: { share: 0.1, plays: 105 },
        box8Plus: { share: 0.08, plays: 84 },
        blitz: { share: 0.31, plays: 326 },
        passRushersMean: { mean: 4.3, plays: 1050 },
      },
    };
  }

  return {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    season: 2026,
    dataAttribution: 'Test Attribution CC-BY-SA 4.0',
    ftnJoinCoveragePct: 100,
    leagueAverage: { offense: {}, defense: {} },
    teams,
  } as unknown as TeamStatsSnapshot;
}

describe('StatComparison Tendencies (Task 050 Requirement 5)', () => {
  test('(a) renders 2026 tendencies and shows "2026 not yet published" when currentScheme is absent', () => {
    const snapshot = createBaseSnapshot();
    // currentScheme is absent by default
    render(<StatComparison homeTeamAbbr="KC" awayTeamAbbr="BUF" customTeamStats={snapshot} />);

    // Table title
    expect(screen.getByText('Scheme Tendencies (2026 vs 2025 Baseline)')).toBeInTheDocument();

    // Row headers
    expect(screen.getByText('Coverage Zone Share')).toBeInTheDocument();
    expect(screen.getByText('Top Personnel Group')).toBeInTheDocument();
    expect(screen.getByText('Defensive Front')).toBeInTheDocument();
    expect(screen.getByText('Formation Shotgun Share')).toBeInTheDocument();
    expect(screen.getByText('Play-Action Rate')).toBeInTheDocument();
    expect(screen.getByText('Pre-Snap Motion Rate')).toBeInTheDocument();
    expect(screen.getAllByText('Defensive Blitz Rate').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('8+ In Box Rate')).toBeInTheDocument();

    // Participation-only rows note "2026 not yet published" and show 2025 baseline labels (M4)
    const notPublishedBadges = screen.getAllByText('2026 not yet published');
    expect(notPublishedBadges.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('11 Personnel (60%)').length).toBeGreaterThanOrEqual(1); // 2025 personnel baseline
    expect(screen.getAllByText('Nickel+ (70%)').length).toBeGreaterThanOrEqual(1); // 2025 defensive front baseline
    expect(screen.getAllByText('2025 baseline').length).toBeGreaterThanOrEqual(1); // 2025 coverage zone baseline tag
    expect(screen.getAllByText('68.0%').length).toBeGreaterThanOrEqual(1); // 2025 coverage zone value

    // 2026 tendencies with sample counts
    expect(screen.getAllByText('(n=150)').length).toBeGreaterThan(0); // shotgun
    expect(screen.getAllByText('(n=58)').length).toBeGreaterThan(0); // play action
    expect(screen.getAllByText('(n=140)').length).toBeGreaterThan(0); // motion

    // 2025 FTN baselines are shown in the muted column for FTN-derived rows
    expect(screen.getAllByText('2025: 57.5%').length).toBeGreaterThan(0); // shotgun baseline
    expect(screen.getAllByText('2025: 18.5%').length).toBeGreaterThan(0); // play-action baseline
    expect(screen.getAllByText('2025: 52.0%').length).toBeGreaterThan(0); // motion baseline
  });

  test('(b) renders currentScheme when present', () => {
    const snapshot = createBaseSnapshot();
    snapshot.teams.KC.currentScheme = {
      season: 2026,
      gamesPlayed: 5,
      totalPlays: 320,
      offensivePersonnel: {
        p11: { share: 0.75, plays: 240 },
        p12: { share: 0.15, plays: 48 },
        p21: { share: 0.05, plays: 16 },
        other: { share: 0.05, plays: 16 },
        topPersonnelEpa: [{ group: '11', share: 0.75, epaPerPlay: 0.12, plays: 240 }],
      },
      formation: {
        shotgun: { share: 0.8, plays: 256 },
        underCenter: { share: 0.15, plays: 48 },
        pistol: { share: 0.05, plays: 16 },
        other: { share: 0, plays: 0 },
      },
      defensiveFront: {
        nickelPlus: { share: 0.85, plays: 272 },
        f43: { share: 0.1, plays: 32 },
        f34: { share: 0.05, plays: 16 },
        other: { share: 0, plays: 0 },
      },
      coverage: {
        passPlaysCharted: 250,
        zone: { share: 0.72, plays: 180 },
        man: { share: 0.28, plays: 70 },
        cover1: { share: 0.15, plays: 38 },
        cover2: { share: 0.25, plays: 63 },
        cover3: { share: 0.35, plays: 88 },
        cover4: { share: 0.12, plays: 30 },
        cover6: { share: 0.08, plays: 20 },
        other: { share: 0.05, plays: 11 },
      },
      offenseVsCoverage: {
        vsMan: { epaPerPlay: 0.1, plays: 70 },
        vsZone: { epaPerPlay: 0.05, plays: 180 },
      },
    } as any;

    render(<StatComparison homeTeamAbbr="KC" awayTeamAbbr="BUF" customTeamStats={snapshot} />);

    // KC has currentScheme with ample plays (totalPlays=320, passPlaysCharted=250):
    // Coverage zone: 2026 72.0% (n=180) and 2025: 68.0%
    expect(screen.getByText('72.0%')).toBeInTheDocument();
    expect(screen.getByText('(n=180)')).toBeInTheDocument();
    expect(screen.getByText('2025: 68.0%')).toBeInTheDocument();

    // Personnel: 11 Personnel (75%) (n=240) and 2025: 11 Personnel (60%)
    expect(screen.getByText('11 Personnel (75%)')).toBeInTheDocument();
    expect(screen.getByText('(n=240)')).toBeInTheDocument();
    expect(screen.getByText('2025: 11 Personnel (60%)')).toBeInTheDocument();

    // Front: Nickel+ (85%) (n=272) and 2025: Nickel+ (70%)
    expect(screen.getByText('Nickel+ (85%)')).toBeInTheDocument();
    expect(screen.getByText('(n=272)')).toBeInTheDocument();
    expect(screen.getByText('2025: Nickel+ (70%)')).toBeInTheDocument();
  });

  describe('Task 052 Requirements', () => {
    test('5a: currentScheme present with ample plays shows 2026 value, n=, and 2025 value on all participation rows', () => {
      const snapshot = createBaseSnapshot();
      snapshot.teams.KC.currentScheme = {
        season: 2026,
        gamesPlayed: 5,
        totalPlays: 300,
        offensivePersonnel: {
          p11: { share: 0.70, plays: 210 },
          topPersonnelEpa: [{ group: '11', share: 0.70, epaPerPlay: 0.1, plays: 210 }],
        },
        formation: { shotgun: { share: 0.75, plays: 225 } },
        defensiveFront: {
          nickelPlus: { share: 0.80, plays: 240 },
          f43: { share: 0.20, plays: 60 },
        },
        coverage: {
          passPlaysCharted: 200,
          zone: { share: 0.63, plays: 130 },
          man: { share: 0.37, plays: 70 },
        },
      } as any;

      render(<StatComparison homeTeamAbbr="KC" awayTeamAbbr="BUF" customTeamStats={snapshot} />);

      // Coverage zone share: 2026 value, its n=, and 2025 value
      expect(screen.getByText('63.0%')).toBeInTheDocument();
      expect(screen.getByText('(n=130)')).toBeInTheDocument();
      expect(screen.getByText('2025: 68.0%')).toBeInTheDocument();

      // Top personnel group: 2026 value, its n=, and 2025 value
      expect(screen.getByText('11 Personnel (70%)')).toBeInTheDocument();
      expect(screen.getByText('(n=210)')).toBeInTheDocument();
      expect(screen.getByText('2025: 11 Personnel (60%)')).toBeInTheDocument();

      // Defensive front: 2026 value, its n=, and 2025 value
      expect(screen.getByText('Nickel+ (80%)')).toBeInTheDocument();
      expect(screen.getByText('(n=240)')).toBeInTheDocument();
      expect(screen.getByText('2025: Nickel+ (70%)')).toBeInTheDocument();
    });

    test('5b: currentScheme present with totalPlays and coverage plays under 50: 2025 values are primary and "small sample" appears', () => {
      const snapshot = createBaseSnapshot();
      snapshot.teams.KC.currentScheme = {
        season: 2026,
        gamesPlayed: 1,
        totalPlays: 40,
        offensivePersonnel: {
          p11: { share: 0.75, plays: 30 },
          topPersonnelEpa: [{ group: '11', share: 0.75, epaPerPlay: 0.05, plays: 30 }],
        },
        formation: { shotgun: { share: 0.8, plays: 32 } },
        defensiveFront: {
          nickelPlus: { share: 0.85, plays: 34 },
          f43: { share: 0.15, plays: 6 },
        },
        coverage: {
          passPlaysCharted: 25,
          zone: { share: 0.60, plays: 15 },
          man: { share: 0.40, plays: 10 },
        },
      } as any;

      render(<StatComparison homeTeamAbbr="KC" awayTeamAbbr="BUF" customTeamStats={snapshot} />);

      // 2025 values are primary (BUF also renders 2025 baseline because its currentScheme is absent)
      expect(screen.getAllByText('68.0%').length).toBeGreaterThanOrEqual(1); // 2025 coverage zone
      expect(screen.getAllByText('11 Personnel (60%)').length).toBeGreaterThanOrEqual(1); // 2025 personnel
      expect(screen.getAllByText('Nickel+ (70%)').length).toBeGreaterThanOrEqual(1); // 2025 front

      // Scope assertions to the "Top Personnel Group" and "Defensive Front" rows (Task 058)
      const personnelRow = screen.getByText('Top Personnel Group').closest('tr');
      expect(personnelRow).not.toBeNull();
      const personnelWithin = within(personnelRow!);
      expect(personnelWithin.getByText('(2025)')).toBeInTheDocument();
      expect(personnelWithin.getByText('small sample')).toBeInTheDocument();

      const frontRow = screen.getByText('Defensive Front').closest('tr');
      expect(frontRow).not.toBeNull();
      const frontWithin = within(frontRow!);
      expect(frontWithin.getByText('(2025)')).toBeInTheDocument();
      expect(frontWithin.getByText('small sample')).toBeInTheDocument();

      // "small sample" appears on those rows and other small-sample tendency rows
      const smallSampleBadges = screen.getAllByText(/small sample/);
      expect(smallSampleBadges.length).toBeGreaterThanOrEqual(3);

      // 2026 values are present with sample in the muted small-sample label
      expect(screen.getByText(/60\.0% \(n=15\)/)).toBeInTheDocument();
      expect(screen.getByText(/11 Personnel \(75%\) \(n=30\)/)).toBeInTheDocument();
      expect(screen.getByText(/Nickel\+ \(85%\) \(n=34\)/)).toBeInTheDocument();
    });

    test('5c: boundary on an FTN row, coverage row, and participation rows: 49 plays shows "small sample", 50 plays does not', () => {
      // First, test with 49 plays (FTN row plays: 49, coverage plays: 49, currentScheme totalPlays: 49)
      const snapshot49 = createBaseSnapshot();
      if (snapshot49.teams.KC.current.tendencies) {
        snapshot49.teams.KC.current.tendencies.playAction = { share: 0.235, plays: 49 };
      }
      snapshot49.teams.KC.currentScheme = {
        season: 2026,
        gamesPlayed: 1,
        totalPlays: 49,
        defensiveFront: { nickelPlus: { share: 0.7, plays: 34 } },
        offensivePersonnel: {
          p11: { share: 0.6, plays: 29 },
          topPersonnelEpa: [{ group: '11', share: 0.6, epaPerPlay: 0.1, plays: 29 }],
        },
        coverage: {
          passPlaysCharted: 49,
          zone: { share: 0.77, plays: 49 },
        },
      } as any;

      const { unmount } = render(
        <StatComparison homeTeamAbbr="KC" awayTeamAbbr="BUF" customTeamStats={snapshot49} />
      );

      // FTN playAction at 49 plays: shows "small sample"
      expect(screen.getByText(/23\.5% \(n=49\)/)).toBeInTheDocument();
      // Coverage at 49 plays: shows "small sample"
      expect(screen.getByText(/77\.0% \(n=49\)/)).toBeInTheDocument();
      // Personnel and defensive front at totalPlays 49: show "small sample"
      expect(screen.getByText(/11 Personnel \(60%\) \(n=29\)/)).toBeInTheDocument();
      expect(screen.getByText(/Nickel\+ \(70%\) \(n=34\)/)).toBeInTheDocument();
      expect(screen.getAllByText('small sample').length).toBeGreaterThanOrEqual(4);

      unmount();

      // Now test with 50 plays
      // Ensure other tendency rows for KC and BUF have >= 50 plays so they don't produce extra "small sample"
      const snapshot50 = createBaseSnapshot();
      for (const t of ['KC', 'BUF'] as const) {
        const tend = snapshot50.teams[t]?.current.tendencies;
        if (tend) {
          tend.formation.pistol = { share: 0.05, plays: 50 };
          tend.noHuddle = { share: 0.05, plays: 50 };
          tend.screen = { share: 0.08, plays: 50 };
          tend.rpo = { share: 0.09, plays: 50 };
          tend.box8Plus = { share: 0.11, plays: 50 };
          tend.blitz = { share: 0.29, plays: 50 };
        }
      }
      if (snapshot50.teams.KC.current.tendencies) {
        snapshot50.teams.KC.current.tendencies.playAction = { share: 0.235, plays: 50 };
      }
      snapshot50.teams.KC.currentScheme = {
        season: 2026,
        gamesPlayed: 1,
        totalPlays: 50,
        defensiveFront: { nickelPlus: { share: 0.72, plays: 36 } },
        offensivePersonnel: {
          p11: { share: 0.62, plays: 31 },
          topPersonnelEpa: [{ group: '11', share: 0.62, epaPerPlay: 0.1, plays: 31 }],
        },
        coverage: {
          passPlaysCharted: 50,
          zone: { share: 0.77, plays: 50 },
        },
      } as any;

      render(<StatComparison homeTeamAbbr="KC" awayTeamAbbr="BUF" customTeamStats={snapshot50} />);

      // At 50 plays / totalPlays 50, none of the tested rows should have "small sample" (M1)
      expect(screen.queryByText(/23\.5% \(n=50\)/)).not.toBeInTheDocument();
      expect(screen.queryByText(/77\.0% \(n=50\)/)).not.toBeInTheDocument();
      expect(screen.getByText('23.5%')).toBeInTheDocument();
      expect(screen.getByText('77.0%')).toBeInTheDocument();
      expect(screen.getAllByText('(n=50)').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('11 Personnel (62%)')).toBeInTheDocument();
      expect(screen.getByText('(n=31)')).toBeInTheDocument();
      expect(screen.getByText('Nickel+ (72%)')).toBeInTheDocument();
      expect(screen.getByText('(n=36)')).toBeInTheDocument();
      expect(screen.queryByText('small sample')).not.toBeInTheDocument();
    });

    test('5d: participation rows with totalPlays >= 50 but top package plays < 50 shows no "small sample" and shows 2025: <label> (M2)', () => {
      const snapshot = createBaseSnapshot();
      for (const t of ['KC', 'BUF'] as const) {
        const tend = snapshot.teams[t]?.current.tendencies;
        if (tend) {
          tend.formation.pistol = { share: 0.05, plays: 50 };
          tend.noHuddle = { share: 0.05, plays: 50 };
          tend.screen = { share: 0.08, plays: 50 };
          tend.rpo = { share: 0.09, plays: 50 };
          tend.box8Plus = { share: 0.11, plays: 50 };
          tend.blitz = { share: 0.29, plays: 50 };
        }
      }
      snapshot.teams.KC.currentScheme = {
        season: 2026,
        gamesPlayed: 1,
        totalPlays: 60,
        offensivePersonnel: {
          p11: { share: 0.40, plays: 24 },
          topPersonnelEpa: [{ group: '11', share: 0.40, epaPerPlay: 0.05, plays: 24 }],
        },
        defensiveFront: {
          nickelPlus: { share: 0.45, plays: 27 },
          f43: { share: 0.35, plays: 21 },
        },
        coverage: {
          passPlaysCharted: 55,
          zone: { share: 0.70, plays: 50 },
        },
      } as any;

      render(<StatComparison homeTeamAbbr="KC" awayTeamAbbr="BUF" customTeamStats={snapshot} />);

      // Top personnel group (plays=24 < 50) and front (plays=27 < 50), but totalPlays=60 >= 50
      // Must NOT show "small sample"
      expect(screen.queryByText('small sample')).not.toBeInTheDocument();

      // Must show 2026 values with sample count
      expect(screen.getByText('11 Personnel (40%)')).toBeInTheDocument();
      expect(screen.getByText('(n=24)')).toBeInTheDocument();
      expect(screen.getByText('Nickel+ (45%)')).toBeInTheDocument();
      expect(screen.getByText('(n=27)')).toBeInTheDocument();

      // Must show 2025: <label> on those rows
      expect(screen.getByText('2025: 11 Personnel (60%)')).toBeInTheDocument();
      expect(screen.getByText('2025: Nickel+ (70%)')).toBeInTheDocument();
    });
  });

  test('(c) renders 2026 under 50 plays with 2025 primary and 2026 muted + "small sample"', () => {
    const snapshot = createBaseSnapshot();
    // Set KC shotgun plays to 30 (< 50)
    if (snapshot.teams.KC.current.tendencies) {
      snapshot.teams.KC.current.tendencies.formation.shotgun = { share: 0.5, plays: 30 };
    }

    render(<StatComparison homeTeamAbbr="KC" awayTeamAbbr="BUF" customTeamStats={snapshot} />);

    // 2026 is muted with "small sample"
    expect(screen.getAllByText('small sample').length).toBeGreaterThan(0);
    expect(screen.getAllByText('(2025)').length).toBeGreaterThan(0);
  });

  test('(d) renders gracefully for an old snapshot without tendencies', () => {
    const snapshot = createBaseSnapshot();
    for (const abbr of NFL_TEAM_ABBREVIATIONS) {
      delete snapshot.teams[abbr].current.tendencies;
      delete snapshot.teams[abbr].currentScheme;
    }

    render(<StatComparison homeTeamAbbr="KC" awayTeamAbbr="BUF" customTeamStats={snapshot} />);

    // Baseline labels should be visible
    expect(screen.getAllByText('2025 baseline').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026 not yet published').length).toBeGreaterThan(0);
  });

  test('(e) old snapshot without the optional priorSeasonTendencies still renders (shotgun falls back to priorSeason)', () => {
    const snapshot = createBaseSnapshot();
    for (const abbr of NFL_TEAM_ABBREVIATIONS) {
      delete snapshot.teams[abbr].current.tendencies;
      delete snapshot.teams[abbr].priorSeasonTendencies;
      delete snapshot.teams[abbr].currentScheme;
    }

    render(<StatComparison homeTeamAbbr="KC" awayTeamAbbr="BUF" customTeamStats={snapshot} />);

    // Shotgun baseline comes from participation priorSeason.formation.shotgun
    expect(screen.getAllByText('2025 baseline').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('2025: 18.5%')).toHaveLength(0);
    expect(screen.getAllByText('2026 not yet published').length).toBeGreaterThan(0);
  });
});
