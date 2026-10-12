import React from 'react';
import {
  TeamUnitSnapshot,
  TeamStatsSnapshot,
  NFLTeamAbbreviation,
  loadTeamStats,
  DATA_ATTRIBUTION,
} from './data/teamStats';

export interface StatComparisonProps {
  data?: any;
  homeColor?: string;
  awayColor?: string;
  homeTeamAbbr?: string;
  awayTeamAbbr?: string;
  customTeamStats?: any;
}

export interface UnitRanks {
  passOffense: number;
  rushOffense: number;
  passDefense: number;
  rushDefense: number;
}

export function computeUnitRanks(snapshot: TeamStatsSnapshot): Record<string, UnitRanks> {
  const teams = Object.keys(snapshot.teams || {}) as NFLTeamAbbreviation[];
  const teamRecord = snapshot.teams as Record<string, TeamUnitSnapshot>;
  
  // Higher offensive EPA/play is better (rank 1 is best)
  const sortedPassOff = [...teams].sort((a, b) => 
    (teamRecord[b]?.current?.offense?.pass?.epaPerPlay ?? -99) -
    (teamRecord[a]?.current?.offense?.pass?.epaPerPlay ?? -99)
  );
  const sortedRushOff = [...teams].sort((a, b) => 
    (teamRecord[b]?.current?.offense?.rush?.epaPerPlay ?? -99) -
    (teamRecord[a]?.current?.offense?.rush?.epaPerPlay ?? -99)
  );
  
  // Lower defensive EPA/play allowed is better (rank 1 is best)
  const sortedPassDef = [...teams].sort((a, b) => 
    (teamRecord[a]?.current?.defense?.pass?.epaPerPlay ?? 99) -
    (teamRecord[b]?.current?.defense?.pass?.epaPerPlay ?? 99)
  );
  const sortedRushDef = [...teams].sort((a, b) => 
    (teamRecord[a]?.current?.defense?.rush?.epaPerPlay ?? 99) -
    (teamRecord[b]?.current?.defense?.rush?.epaPerPlay ?? 99)
  );

  const ranks: Record<string, UnitRanks> = {};
  for (const t of teams) {
    ranks[t] = {
      passOffense: sortedPassOff.indexOf(t) + 1,
      rushOffense: sortedRushOff.indexOf(t) + 1,
      passDefense: sortedPassDef.indexOf(t) + 1,
      rushDefense: sortedRushDef.indexOf(t) + 1,
    };
  }
  return ranks;
}

export const SMALL_SAMPLE_THRESHOLD = 50;

const StatComparison: React.FC<StatComparisonProps> = ({
  homeColor = '#3b82f6',
  awayColor = '#f97316',
  homeTeamAbbr,
  awayTeamAbbr,
  customTeamStats,
}) => {
  const { snapshot, isStale } = loadTeamStats(customTeamStats);

  if (!snapshot || !snapshot.teams || !homeTeamAbbr || !awayTeamAbbr) {
    return null;
  }

  const teamRecord = snapshot.teams as Record<string, TeamUnitSnapshot>;
  const homeStats: TeamUnitSnapshot | undefined = teamRecord[homeTeamAbbr];
  const awayStats: TeamUnitSnapshot | undefined = teamRecord[awayTeamAbbr];

  if (!homeStats || !awayStats) {
    return null;
  }

  const ranks = computeUnitRanks(snapshot);
  const homeRanks = ranks[homeTeamAbbr];
  const awayRanks = ranks[awayTeamAbbr];

  const formatPct = (val?: number) => (val !== undefined ? `${(val * 100).toFixed(1)}%` : '—');

  // Participation-only scheme tendency sources (currentScheme if present, else priorSeason)
  const homeScheme = homeStats.currentScheme || homeStats.priorSeason;
  const awayScheme = awayStats.currentScheme || awayStats.priorSeason;
  const homeSchemeIs2026 = Boolean(homeStats.currentScheme);
  const awaySchemeIs2026 = Boolean(awayStats.currentScheme);

  // Coverage tendency: zone share
  const homeActiveCoverage = homeScheme?.coverage;
  const awayActiveCoverage = awayScheme?.coverage;
  const homeCoverageIs2026 = homeSchemeIs2026;
  const awayCoverageIs2026 = awaySchemeIs2026;

  // 2025 FTN+PBP baseline for the FTN-derived tendency rows. Falls back to the
  // participation-only priorSeason formation shotgun when priorSeasonTendencies is
  // absent (snapshots predating that field still render a baseline where possible).
  const homeTendPrior = homeStats.priorSeasonTendencies;
  const awayTendPrior = awayStats.priorSeasonTendencies;
  const homeShotgunPrior =
    homeTendPrior?.formation?.shotgun ?? homeStats.priorSeason?.formation?.shotgun;
  const awayShotgunPrior =
    awayTendPrior?.formation?.shotgun ?? awayStats.priorSeason?.formation?.shotgun;

  // Helpers to get top personnel and front label and samples
  const getTopPersonnel = (scheme?: typeof homeScheme) => {
    if (!scheme?.offensivePersonnel?.topPersonnelEpa?.length) return '—';
    const top = scheme.offensivePersonnel.topPersonnelEpa[0];
    const groupName = top.group === 'other' ? 'Other' : `${top.group} Personnel`;
    return `${groupName} (${(top.share * 100).toFixed(0)}%)`;
  };

  const getTopPersonnelDetails = (scheme?: typeof homeScheme) => {
    if (!scheme?.offensivePersonnel?.topPersonnelEpa?.length) return null;
    const top = scheme.offensivePersonnel.topPersonnelEpa[0];
    const groupName = top.group === 'other' ? 'Other' : `${top.group} Personnel`;
    return {
      label: `${groupName} (${(top.share * 100).toFixed(0)}%)`,
      plays: top.plays,
      totalPlays: scheme.totalPlays,
    };
  };

  const getTopFront = (scheme?: typeof homeScheme) => {
    if (!scheme?.defensiveFront) return '—';
    const { f43, f34, nickelPlus } = scheme.defensiveFront;
    const candidates = [
      { name: 'Nickel+', share: nickelPlus?.share ?? 0, plays: nickelPlus?.plays ?? 0 },
      { name: '4-3 Front', share: f43?.share ?? 0, plays: f43?.plays ?? 0 },
      { name: '3-4 Front', share: f34?.share ?? 0, plays: f34?.plays ?? 0 },
    ];
    candidates.sort((a, b) => b.share - a.share);
    const top = candidates[0];
    return `${top.name} (${(top.share * 100).toFixed(0)}%)`;
  };

  const getTopFrontDetails = (scheme?: typeof homeScheme) => {
    if (!scheme?.defensiveFront) return null;
    const { f43, f34, nickelPlus } = scheme.defensiveFront;
    const candidates = [
      { name: 'Nickel+', share: nickelPlus?.share ?? 0, plays: nickelPlus?.plays ?? 0 },
      { name: '4-3 Front', share: f43?.share ?? 0, plays: f43?.plays ?? 0 },
      { name: '3-4 Front', share: f34?.share ?? 0, plays: f34?.plays ?? 0 },
    ];
    candidates.sort((a, b) => b.share - a.share);
    const top = candidates[0];
    return {
      label: `${top.name} (${(top.share * 100).toFixed(0)}%)`,
      plays: top.plays,
      totalPlays: scheme.totalPlays,
    };
  };

  // Helper to render a 2026 tendency cell: 2026 with sample and muted 2025 baseline
  const renderTendencyCell = (
    currentRate?: { share: number; plays: number },
    priorRate?: { share: number; plays?: number }
  ) => {
    if (!currentRate) {
      // Old snapshot without tendencies block: fallback to priorSeason baseline
      if (priorRate) {
        return (
          <div className="flex flex-col">
            <span className="text-slate-300">{formatPct(priorRate.share)}</span>
            <span className="text-[10px] text-slate-500 italic">2025 baseline</span>
          </div>
        );
      }
      return <span className="text-slate-500">—</span>;
    }

    const { share, plays } = currentRate;
    const priorPctStr = priorRate !== undefined ? formatPct(priorRate.share) : '—';

    // Small sample rule: plays < SMALL_SAMPLE_THRESHOLD; 2025 becomes the primary figure when a 2025 baseline exists
    if (plays < SMALL_SAMPLE_THRESHOLD) {
      return (
        <div className="flex flex-col">
          {priorRate !== undefined ? (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-200 font-semibold">{priorPctStr}</span>
              <span className="text-[10px] text-slate-500">(2025)</span>
            </div>
          ) : (
            <span className="text-slate-200 font-semibold">—</span>
          )}
          <span className="text-[10px] text-amber-400/80">
            {formatPct(share)} (n={plays}) <span className="italic">small sample</span>
          </span>
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        <span className="text-slate-200 font-semibold">
          {formatPct(share)} <span className="text-[10px] text-slate-400 font-normal">(n={plays})</span>
        </span>
        <span className="text-[10px] text-slate-500">
          2025: {priorPctStr}
        </span>
      </div>
    );
  };

  // Participation labeled rows (personnel, defensive front)
  const renderParticipationLabeledCell = (
    currentDetails: { label: string; plays: number; totalPlays: number } | null,
    priorLabel: string
  ) => {
    if (!currentDetails) {
      return (
        <div className="flex flex-col">
          <span className="text-slate-300">{priorLabel}</span>
          <span className="text-[10px] text-slate-500 italic">2026 not yet published</span>
        </div>
      );
    }

    const { label, plays, totalPlays } = currentDetails;

    if (totalPlays < SMALL_SAMPLE_THRESHOLD) {
      return (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-200 font-semibold">{priorLabel}</span>
            <span className="text-[10px] text-slate-500">(2025)</span>
          </div>
          <span className="text-[10px] text-amber-400/80">
            {label} (n={plays}) <span className="italic">small sample</span>
          </span>
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        <span className="text-slate-200 font-semibold">
          {label} <span className="text-[10px] text-slate-400 font-normal">(n={plays})</span>
        </span>
        <span className="text-[10px] text-slate-500">
          2025: {priorLabel}
        </span>
      </div>
    );
  };

  return (
    <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-700/60 shadow-lg space-y-4">
      {/* Header & Display-Only Disclaimer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-white text-sm font-bold uppercase tracking-wider">
            Unit Efficiency & Matchup Context
          </h4>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            Display-Only Context • Does not affect pick
          </span>
        </div>
        {isStale && (
          <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded">
            Snapshot is stale (&gt;7d)
          </span>
        )}
      </div>

      {/* Explanatory data currency notice */}
      <div className="text-[11px] text-slate-400 bg-slate-950/70 p-2.5 rounded border border-slate-800/80 space-y-1">
        <p>
          <strong className="text-slate-300">Live 2026 Season Data:</strong> Formation shotgun share, play-action, motion, blitz, and 8+ box rates come from 2026 FTN charting + PBP. Unit efficiency (EPA ranks), 3rd-down %, and red-zone TD rate come from 2026 PBP.
        </p>
        <p>
          <strong className="text-slate-300">2025 Baseline:</strong> The muted 2025 column shows the prior-season value. Formation, play-action, motion, blitz, and 8+ box baselines come from 2025 FTN charting + PBP. Coverage scheme (man/zone), personnel packages, and defensive front alignment are participation-only: they reflect 2025 until 2026 participation data is published, then switch automatically.
        </p>
      </div>

      {/* Matchup Reads */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/70">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
            Pass Attack vs Pass Defense
          </div>
          <div className="text-xs text-slate-200">
            <span style={{ color: awayColor }} className="font-bold">{awayTeamAbbr}</span> pass offense #{awayRanks?.passOffense ?? '—'} vs{' '}
            <span style={{ color: homeColor }} className="font-bold">{homeTeamAbbr}</span> pass defense #{homeRanks?.passDefense ?? '—'}
          </div>
          {homeActiveCoverage?.zone?.share !== undefined && (
            <div className="text-[11px] text-slate-400 mt-1 italic">
              {homeCoverageIs2026 ? '2026 tendency' : '2025 tendency'}: {homeTeamAbbr} plays zone {formatPct(homeActiveCoverage.zone.share)} of pass snaps
            </div>
          )}
        </div>

        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/70">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
            Pass Attack vs Pass Defense
          </div>
          <div className="text-xs text-slate-200">
            <span style={{ color: homeColor }} className="font-bold">{homeTeamAbbr}</span> pass offense #{homeRanks?.passOffense ?? '—'} vs{' '}
            <span style={{ color: awayColor }} className="font-bold">{awayTeamAbbr}</span> pass defense #{awayRanks?.passDefense ?? '—'}
          </div>
          {awayActiveCoverage?.zone?.share !== undefined && (
            <div className="text-[11px] text-slate-400 mt-1 italic">
              {awayCoverageIs2026 ? '2026 tendency' : '2025 tendency'}: {awayTeamAbbr} plays zone {formatPct(awayActiveCoverage.zone.share)} of pass snaps
            </div>
          )}
        </div>
      </div>

      {/* Detailed Side-by-Side Stat Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase font-mono">
              <th className="py-2 text-left" style={{ color: awayColor }}>{awayTeamAbbr}</th>
              <th className="py-2 text-center text-slate-400">Metric (2026 Live)</th>
              <th className="py-2 text-right" style={{ color: homeColor }}>{homeTeamAbbr}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
            <tr>
              <td className="py-2">#{awayRanks?.passOffense ?? '—'}</td>
              <td className="py-2 text-center text-slate-400 font-sans">Pass Offense Rank</td>
              <td className="py-2 text-right">#{homeRanks?.passOffense ?? '—'}</td>
            </tr>
            <tr>
              <td className="py-2">#{awayRanks?.rushOffense ?? '—'}</td>
              <td className="py-2 text-center text-slate-400 font-sans">Rush Offense Rank</td>
              <td className="py-2 text-right">#{homeRanks?.rushOffense ?? '—'}</td>
            </tr>
            <tr>
              <td className="py-2">#{awayRanks?.passDefense ?? '—'}</td>
              <td className="py-2 text-center text-slate-400 font-sans">Pass Defense Rank</td>
              <td className="py-2 text-right">#{homeRanks?.passDefense ?? '—'}</td>
            </tr>
            <tr>
              <td className="py-2">#{awayRanks?.rushDefense ?? '—'}</td>
              <td className="py-2 text-center text-slate-400 font-sans">Rush Defense Rank</td>
              <td className="py-2 text-right">#{homeRanks?.rushDefense ?? '—'}</td>
            </tr>
            <tr>
              <td className="py-2">{formatPct(awayStats.current?.offense?.thirdDownConversion)}</td>
              <td className="py-2 text-center text-slate-400 font-sans">3rd Down Conversion %</td>
              <td className="py-2 text-right">{formatPct(homeStats.current?.offense?.thirdDownConversion)}</td>
            </tr>
            <tr>
              <td className="py-2">{formatPct(awayStats.current?.offense?.redZone?.tdRate)}</td>
              <td className="py-2 text-center text-slate-400 font-sans">Red Zone TD Rate</td>
              <td className="py-2 text-right">{formatPct(homeStats.current?.offense?.redZone?.tdRate)}</td>
            </tr>
            <tr>
              <td className="py-2">{formatPct(awayStats.current?.defense?.ftn?.blitzRate)}</td>
              <td className="py-2 text-center text-slate-400 font-sans">Defensive Blitz Rate</td>
              <td className="py-2 text-right">{formatPct(homeStats.current?.defense?.ftn?.blitzRate)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tendencies Table (Task 050: 2026 update over 2025 baseline) */}
      <div className="overflow-x-auto pt-2 border-t border-slate-800">
        <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
          Scheme Tendencies (2026 vs 2025 Baseline)
        </div>
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase font-mono">
              <th className="py-2 text-left" style={{ color: awayColor }}>{awayTeamAbbr}</th>
              <th className="py-2 text-center text-slate-400">Tendency</th>
              <th className="py-2 text-right" style={{ color: homeColor }}>{homeTeamAbbr}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
            {/* 1. Coverage Zone Share */}
            <tr>
              <td className="py-2">
                {awaySchemeIs2026
                  ? renderTendencyCell(
                      awayStats.currentScheme?.coverage?.zone,
                      awayStats.priorSeason?.coverage?.zone
                    )
                  : renderTendencyCell(undefined, awayStats.priorSeason?.coverage?.zone)}
              </td>
              <td className="py-2 text-center text-slate-400 font-sans">Coverage Zone Share</td>
              <td className="py-2 text-right">
                {homeSchemeIs2026
                  ? renderTendencyCell(
                      homeStats.currentScheme?.coverage?.zone,
                      homeStats.priorSeason?.coverage?.zone
                    )
                  : renderTendencyCell(undefined, homeStats.priorSeason?.coverage?.zone)}
              </td>
            </tr>

            {/* 2. Top Personnel Group */}
            <tr>
              <td className="py-2">
                {renderParticipationLabeledCell(
                  awaySchemeIs2026 ? getTopPersonnelDetails(awayStats.currentScheme) : null,
                  getTopPersonnel(awayStats.priorSeason)
                )}
              </td>
              <td className="py-2 text-center text-slate-400 font-sans">Top Personnel Group</td>
              <td className="py-2 text-right">
                {renderParticipationLabeledCell(
                  homeSchemeIs2026 ? getTopPersonnelDetails(homeStats.currentScheme) : null,
                  getTopPersonnel(homeStats.priorSeason)
                )}
              </td>
            </tr>

            {/* 3. Defensive Front */}
            <tr>
              <td className="py-2">
                {renderParticipationLabeledCell(
                  awaySchemeIs2026 ? getTopFrontDetails(awayStats.currentScheme) : null,
                  getTopFront(awayStats.priorSeason)
                )}
              </td>
              <td className="py-2 text-center text-slate-400 font-sans">Defensive Front</td>
              <td className="py-2 text-right">
                {renderParticipationLabeledCell(
                  homeSchemeIs2026 ? getTopFrontDetails(homeStats.currentScheme) : null,
                  getTopFront(homeStats.priorSeason)
                )}
              </td>
            </tr>

            {/* 4. Formation Shotgun Share */}
            <tr>
              <td className="py-2">
                {renderTendencyCell(
                  awayStats.current?.tendencies?.formation?.shotgun,
                  awayShotgunPrior
                )}
              </td>
              <td className="py-2 text-center text-slate-400 font-sans">Formation Shotgun Share</td>
              <td className="py-2 text-right">
                {renderTendencyCell(
                  homeStats.current?.tendencies?.formation?.shotgun,
                  homeShotgunPrior
                )}
              </td>
            </tr>

            {/* 5. Play-Action */}
            <tr>
              <td className="py-2">
                {renderTendencyCell(awayStats.current?.tendencies?.playAction, awayTendPrior?.playAction)}
              </td>
              <td className="py-2 text-center text-slate-400 font-sans">Play-Action Rate</td>
              <td className="py-2 text-right">
                {renderTendencyCell(homeStats.current?.tendencies?.playAction, homeTendPrior?.playAction)}
              </td>
            </tr>

            {/* 6. Motion */}
            <tr>
              <td className="py-2">
                {renderTendencyCell(awayStats.current?.tendencies?.motion, awayTendPrior?.motion)}
              </td>
              <td className="py-2 text-center text-slate-400 font-sans">Pre-Snap Motion Rate</td>
              <td className="py-2 text-right">
                {renderTendencyCell(homeStats.current?.tendencies?.motion, homeTendPrior?.motion)}
              </td>
            </tr>

            {/* 7. Blitz */}
            <tr>
              <td className="py-2">
                {renderTendencyCell(awayStats.current?.tendencies?.blitz, awayTendPrior?.blitz)}
              </td>
              <td className="py-2 text-center text-slate-400 font-sans">Defensive Blitz Rate</td>
              <td className="py-2 text-right">
                {renderTendencyCell(homeStats.current?.tendencies?.blitz, homeTendPrior?.blitz)}
              </td>
            </tr>

            {/* 8. 8+ Box */}
            <tr>
              <td className="py-2">
                {renderTendencyCell(awayStats.current?.tendencies?.box8Plus, awayTendPrior?.box8Plus)}
              </td>
              <td className="py-2 text-center text-slate-400 font-sans">8+ In Box Rate</td>
              <td className="py-2 text-right">
                {renderTendencyCell(homeStats.current?.tendencies?.box8Plus, homeTendPrior?.box8Plus)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Attribution footer inside modal */}
      <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 leading-normal">
        {DATA_ATTRIBUTION}
      </div>
    </div>
  );
};

export default StatComparison;
