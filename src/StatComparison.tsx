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

  // Coverage tendency: zone share from 2025 prior-season
  const homeZoneShare = homeStats.priorSeason?.coverage?.zone?.share;
  const awayZoneShare = awayStats.priorSeason?.coverage?.zone?.share;

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
          <strong className="text-slate-300">Live 2026 Season Data:</strong> Unit efficiency (EPA ranks), 3rd-down %, red-zone TD rate, and blitz rate.
        </p>
        <p>
          <strong className="text-slate-300">2025 Prior-Season Tendencies:</strong> Scheme tendencies (man/zone coverage, personnel packages, front alignment). Scheme stats reflect 2025 tendencies.
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
          {homeZoneShare !== undefined && (
            <div className="text-[11px] text-slate-400 mt-1 italic">
              2025 tendency: {homeTeamAbbr} plays zone {formatPct(homeZoneShare)} of pass snaps
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
          {awayZoneShare !== undefined && (
            <div className="text-[11px] text-slate-400 mt-1 italic">
              2025 tendency: {awayTeamAbbr} plays zone {formatPct(awayZoneShare)} of pass snaps
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

      {/* Attribution footer inside modal */}
      <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 leading-normal">
        {DATA_ATTRIBUTION}
      </div>
    </div>
  );
};

export default StatComparison;
