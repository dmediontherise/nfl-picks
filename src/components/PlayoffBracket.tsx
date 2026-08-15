import React, { useEffect, useState } from 'react';
import { Game, Team } from '../types';
import { TEAMS, CURRENT_SEASON } from '../data/nfl_data';
import { espnApi } from '../services/espnAdapter';
import { Loader2, Shield, Trophy, GitCommit, Calendar } from 'lucide-react';

const AFC_TEAMS = ['BAL', 'BUF', 'CIN', 'CLE', 'DEN', 'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LV', 'MIA', 'NE', 'NYJ', 'PIT', 'TEN'];
const NFC_TEAMS = ['ARI', 'ATL', 'CAR', 'CHI', 'DAL', 'DET', 'GB', 'LAR', 'MIN', 'NO', 'NYG', 'PHI', 'SEA', 'SF', 'TB', 'WAS'];

export const getConference = (teamAbbr: string): 'AFC' | 'NFC' | 'UNKNOWN' => {
  if (AFC_TEAMS.includes(teamAbbr)) return 'AFC';
  if (NFC_TEAMS.includes(teamAbbr)) return 'NFC';
  return 'UNKNOWN';
};

export const getGameConference = (g: Game): 'AFC' | 'NFC' | 'UNKNOWN' => {
  const homeConf = getConference(g.homeTeam.abbreviation);
  if (homeConf !== 'UNKNOWN') return homeConf;
  const awayConf = getConference(g.awayTeam.abbreviation);
  if (awayConf !== 'UNKNOWN') return awayConf;
  return 'UNKNOWN';
};

export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number;
  totalGames: number;
  winPct: number;
}

export function parseTeamRecord(summary?: string): TeamRecord {
  if (!summary) return { wins: 0, losses: 0, ties: 0, totalGames: 0, winPct: 0 };
  const parts = summary.trim().split(/[- ]/).map(p => parseInt(p, 10)).filter(n => !isNaN(n));
  const wins = parts[0] || 0;
  const losses = parts[1] || 0;
  const ties = parts[2] || 0;
  const totalGames = wins + losses + ties;
  const winPct = totalGames > 0 ? (wins + 0.5 * ties) / totalGames : 0;
  return { wins, losses, ties, totalGames, winPct };
}

export function getResolvedSeed1(conf: 'AFC' | 'NFC', teamSource?: Record<string, Team>): Team | null {
  const teamsObj = teamSource || TEAMS;
  const confTeams = Object.values(teamsObj).filter(t => getConference(t.abbreviation) === conf);

  const anyGamesPlayed = confTeams.some(t => {
    const rec = parseTeamRecord(t.record);
    return rec.totalGames > 0;
  });

  if (!anyGamesPlayed) {
    return null;
  }

  const sorted = [...confTeams].sort((a, b) => {
    const recA = parseTeamRecord(a.record);
    const recB = parseTeamRecord(b.record);
    if (recB.winPct !== recA.winPct) return recB.winPct - recA.winPct;
    if (recB.wins !== recA.wins) return recB.wins - recA.wins;
    return recB.totalGames - recA.totalGames;
  });

  const topTeam = sorted[0];
  const secondTeam = sorted[1];

  if (!topTeam) return null;

  const recTop = parseTeamRecord(topTeam.record);
  const recSecond = secondTeam ? parseTeamRecord(secondTeam.record) : null;

  if (recSecond && recTop.winPct === recSecond.winPct && recTop.wins === recSecond.wins) {
    return null;
  }

  return topTeam;
}

const PlayoffBracket: React.FC = () => {
  const [bracket, setBracket] = useState<{
    afc: { wc: Game[], div: Game[], conf: Game | null, seed1: Team | null },
    nfc: { wc: Game[], div: Game[], conf: Game | null, seed1: Team | null },
    sb: Game | null
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBracket = async () => {
      try {
        const [wc, div, conf, sb] = await Promise.all([
          espnApi.getSchedule(1, 3),
          espnApi.getSchedule(2, 3),
          espnApi.getSchedule(3, 3),
          espnApi.getSchedule(4, 3)
        ]);

        const filterConf = (games: Game[], confName: 'AFC' | 'NFC') => {
          const resolved = games.filter(g => getGameConference(g) === confName);
          if (resolved.length > 0) return resolved;

          const unknownGames = games.filter(g => getGameConference(g) === 'UNKNOWN');
          if (unknownGames.length > 0) {
            const half = Math.ceil(unknownGames.length / 2);
            return confName === 'AFC' ? unknownGames.slice(0, half) : unknownGames.slice(half);
          }

          return [];
        };

        setBracket({
          afc: {
            wc: filterConf(wc.data, 'AFC'),
            div: filterConf(div.data, 'AFC'),
            conf: filterConf(conf.data, 'AFC')[0] || null,
            seed1: getResolvedSeed1('AFC')
          },
          nfc: {
            wc: filterConf(wc.data, 'NFC'),
            div: filterConf(div.data, 'NFC'),
            conf: filterConf(conf.data, 'NFC')[0] || null,
            seed1: getResolvedSeed1('NFC')
          },
          sb: sb.data[0] || null
        });
      } catch (error) {
        console.error("Failed to load bracket", error);
      } finally {
        setLoading(false);
      }
    };
    fetchBracket();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!bracket || (bracket.afc.wc.length === 0 && bracket.nfc.wc.length === 0 && !bracket.sb)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center max-w-lg mx-auto">
        <Calendar className="w-12 h-12 text-slate-600 mb-4" />
        <h3 className="text-lg font-bold text-white mb-2">Playoff Bracket TBD</h3>
        <p className="text-sm text-slate-400">Playoff seeding TBD — Season {CURRENT_SEASON} Regular Season in progress. Bracket will populate as seeding is determined.</p>
      </div>
    );
  }

  const GameCard = ({ game, placeholder, teamOverride }: { game?: Game | null, placeholder: string, teamOverride?: Team | null }) => {
    if (teamOverride) {
      return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 w-56 shadow-lg relative z-10 flex items-center gap-3">
          <div className="bg-green-500/20 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded absolute top-2 right-2">BYE</div>
          <img
            src={teamOverride.logoUrl}
            className="w-10 h-10 object-contain"
            alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div>
            <div className="font-bold text-white text-sm">#1 {teamOverride.name}</div>
            <div className="text-[10px] text-slate-500">Waiting for Lowest Seed</div>
          </div>
        </div>
      );
    }

    if (!game) {
      return (
        <div className="bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-lg p-4 w-56 h-24 flex items-center justify-center text-slate-600 font-bold uppercase tracking-wider text-xs">
          {placeholder}
        </div>
      );
    }

    const winner = game.status === 'post' 
      ? (game.homeTeam.score || 0) > (game.awayTeam.score || 0) ? game.homeTeam.id : game.awayTeam.id 
      : null;

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 w-56 shadow-lg relative z-10 transition-transform hover:scale-105">
        <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider flex justify-between">
          <span>{new Date(game.date).toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'})}</span>
          <span className={game.status === 'in' ? 'text-red-500 font-bold animate-pulse' : ''}>
            {game.status === 'post' ? 'FINAL' : game.clock}
          </span>
        </div>
        
        {/* Away */}
        <div className={`flex justify-between items-center mb-1 ${winner && winner !== game.awayTeam.id ? 'opacity-40' : ''}`}>
          <div className="flex items-center gap-2">
            <img
              src={game.awayTeam.logoUrl}
              className="w-5 h-5 object-contain"
              alt=""
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <span className="font-bold text-sm truncate w-28">{game.awayTeam.name}</span>
          </div>
          <span className="font-mono font-bold text-white">{game.awayTeam.score !== undefined ? game.awayTeam.score : '--'}</span>
        </div>

        {/* Home */}
        <div className={`flex justify-between items-center ${winner && winner !== game.homeTeam.id ? 'opacity-40' : ''}`}>
          <div className="flex items-center gap-2">
            <img
              src={game.homeTeam.logoUrl}
              className="w-5 h-5 object-contain"
              alt=""
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <span className="font-bold text-sm truncate w-28">{game.homeTeam.name}</span>
          </div>
          <span className="font-mono font-bold text-white">{game.homeTeam.score !== undefined ? game.homeTeam.score : '--'}</span>
        </div>
      </div>
    );
  };

  const ConferenceColumn = ({ title, games, color, conf, seed1 }: { title: string, games: any, color: string, conf: string, seed1: Team | null }) => {
    const isSeed1InGame = (g: Game) => seed1 ? (g.homeTeam.abbreviation === seed1.abbreviation || g.awayTeam.abbreviation === seed1.abbreviation) : false;
    const divGame1 = games.div.find(isSeed1InGame);
    const divGame2 = games.div.find((g: Game) => !isSeed1InGame(g));

    return (
      <div className="flex-shrink-0 flex flex-col gap-6 border p-6 rounded-2xl border-slate-800 bg-slate-900/40 backdrop-blur-sm shadow-2xl">
        <h3 className={`text-center font-black text-2xl uppercase tracking-widest mb-4 ${color} flex items-center justify-center gap-3 border-b border-slate-800 pb-3`}>
          <Shield className="w-6 h-6" /> {title}
        </h3>
        
        <div className="flex gap-8 items-center">
          {/* Wild Card Column */}
          <div className="flex flex-col gap-6">
            <div className="text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 bg-slate-800/50 py-1 rounded">Wild Card</div>
            {games.wc.length > 0 ? games.wc.map((g: Game) => (
              <div key={g.id} className="relative group">
                <GameCard game={g} placeholder="" />
                <div className="mt-2 flex items-center justify-center gap-1 text-[9px] font-bold text-slate-600 uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                  <GitCommit className="w-3 h-3" />
                  <span>Re-seeds to lowest</span>
                </div>
              </div>
            )) : 
              [1,2,3].map(i => <GameCard key={i} placeholder={`${conf} Wild Card ${i}`} />)
            }
          </div>

          <div className="flex flex-col justify-around h-[400px]">
            <div className="w-8 h-px bg-gradient-to-r from-slate-700 to-slate-800"></div>
            <div className="w-8 h-px bg-gradient-to-r from-slate-700 to-slate-800"></div>
            <div className="w-8 h-px bg-gradient-to-r from-slate-700 to-slate-800"></div>
          </div>

          {/* Divisional Column */}
          <div className="flex flex-col gap-24 py-12">
            <div className="text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 bg-slate-800/50 py-1 rounded">Divisional</div>
            
            {divGame1 ? (
              <GameCard game={divGame1} placeholder="" />
            ) : (
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 w-56 shadow-xl relative z-10 transition-all hover:border-slate-500">
                <div className="text-[10px] text-slate-500 mb-3 uppercase tracking-wider flex justify-between border-b border-slate-800 pb-2">
                  <span>TBD</span>
                  <span className="text-slate-600 font-mono">{seed1 ? 'Reseeded' : 'TBD #1 Seed'}</span>
                </div>
                <div className="flex justify-between items-center mb-3 opacity-40">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700"></div>
                    <span className="font-bold text-sm text-slate-500">Lowest Remaining</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    {seed1 ? (
                      <img
                        src={seed1.logoUrl}
                        className="w-8 h-8 object-contain drop-shadow-lg"
                        alt=""
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
                        <Shield className="w-4 h-4" />
                      </div>
                    )}
                    <span className="font-black text-sm text-white">{seed1 ? seed1.name : `${conf} TBD #1 Seed`}</span>
                  </div>
                  {seed1 && (
                    <span className="bg-green-500/10 text-green-400 text-[8px] font-black px-2 py-0.5 rounded border border-green-500/20 uppercase tracking-widest">Bye</span>
                  )}
                </div>
              </div>
            )}

            {divGame2 ? (
              <GameCard game={divGame2} placeholder="" />
            ) : (
              <div className="relative group">
                <GameCard placeholder={`${conf} Divisional Matchup`} />
                <div className="absolute inset-0 bg-slate-900/40 rounded-lg pointer-events-none"></div>
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center">
            <div className="w-8 h-px bg-gradient-to-r from-slate-700 to-slate-800"></div>
          </div>

          {/* Conference Championship */}
          <div className="flex flex-col gap-4">
            <div className="text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 bg-slate-800/50 py-1 rounded">Conference</div>
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-b from-transparent via-slate-700/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"></div>
              <GameCard game={games.conf} placeholder={`${conf} Championship`} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-full overflow-x-auto pb-12">
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-6 min-w-max px-6 justify-center items-start">
        <ConferenceColumn title="AFC" games={bracket.afc} color="text-red-500" conf="AFC" seed1={bracket.afc.seed1} />
        <ConferenceColumn title="NFC" games={bracket.nfc} color="text-blue-500" conf="NFC" seed1={bracket.nfc.seed1} />
      </div>

      <div className="border-t border-slate-800 pt-16 mt-16 flex flex-col items-center">
        <div className="relative">
          <div className="absolute -inset-4 bg-yellow-500/10 blur-xl rounded-full"></div>
          <h3 className="relative z-10 text-center font-black text-4xl text-yellow-500 uppercase tracking-[0.2em] mb-10 flex items-center gap-4">
            <Trophy className="w-10 h-10" /> Super Bowl LX
          </h3>
        </div>
        <GameCard game={bracket.sb} placeholder="Super Bowl LX" />
      </div>
    </div>
  );
};

export default PlayoffBracket;