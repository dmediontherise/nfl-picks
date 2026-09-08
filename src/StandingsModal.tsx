import React from 'react';
import { X, Trophy, Calendar, Swords, Bot, User } from 'lucide-react';
import { UserPrediction } from './types';

export interface GameResult {
  homeScore: number;
  awayScore: number;
  spread: string; // "BUF -10.5"
  homeAbbr: string;
  awayAbbr: string;
  homeName: string;
  awayName: string;
  week?: number;
}

export interface StandingsModalProps {
  onClose: () => void;
  predictions: Record<string, UserPrediction>;
  results: Record<string, GameResult>;
}

export interface RecordMetrics {
  w: number;
  l: number;
  atsW: number;
  atsL: number;
  atsP: number;
  marginErrorSum: number;
  marginCount: number;
}

export interface WeeklyRecord {
  week: number;
  user: { w: number; l: number };
  app: { w: number; l: number };
  deviatedCount: number;
  userH2HW: number;
  appH2HW: number;
}

export interface StandingsData {
  userOverall: RecordMetrics;
  appOverall: RecordMetrics;
  userH2H: RecordMetrics;
  appH2H: RecordMetrics;
  userMAE: string;
  appMAE: string;
  userH2HMAE: string;
  appH2HMAE: string;
  weeklyRecords: WeeklyRecord[];
  hasDeviations: boolean;
}

export function calculateStandings(
  predictions: Record<string, UserPrediction>,
  results: Record<string, GameResult>
): StandingsData {
  const userOverall: RecordMetrics = { w: 0, l: 0, atsW: 0, atsL: 0, atsP: 0, marginErrorSum: 0, marginCount: 0 };
  const appOverall: RecordMetrics = { w: 0, l: 0, atsW: 0, atsL: 0, atsP: 0, marginErrorSum: 0, marginCount: 0 };
  const userH2H: RecordMetrics = { w: 0, l: 0, atsW: 0, atsL: 0, atsP: 0, marginErrorSum: 0, marginCount: 0 };
  const appH2H: RecordMetrics = { w: 0, l: 0, atsW: 0, atsL: 0, atsP: 0, marginErrorSum: 0, marginCount: 0 };
  const weeklyMap: Record<number, WeeklyRecord> = {};

  Object.keys(results).forEach(gameId => {
    const res = results[gameId];
    const pred = predictions[gameId];
    if (!pred) return;

    const actualWinnerName = res.homeScore > res.awayScore ? res.homeName : (res.awayScore > res.homeScore ? res.awayName : 'Tie');
    const actualMargin = res.homeScore - res.awayScore;
    const weekNum = res.week || pred.week || 1;

    if (!weeklyMap[weekNum]) {
      weeklyMap[weekNum] = {
        week: weekNum,
        user: { w: 0, l: 0 },
        app: { w: 0, l: 0 },
        deviatedCount: 0,
        userH2HW: 0,
        appH2HW: 0
      };
    }
    const weekRec = weeklyMap[weekNum];
    const isDeviated = pred.agreementState === 'deviated';

    // Helper: Check ATS (preserved verbatim per contract)
    const checkATS = (predHome: number, predAway: number) => {
      if (!res.spread) return null;
      const parts = res.spread.split(' ');
      if (parts.length < 2) return null;

      const favAbbr = parts[0];
      const rawVal = parseFloat(parts[parts.length - 1]);
      const homeLine = favAbbr === res.homeAbbr ? -Math.abs(rawVal) : Math.abs(rawVal);

      const actualMarginDiff = res.homeScore - res.awayScore;
      const actualDiff = actualMarginDiff + homeLine;

      if (actualDiff === 0) return 'PUSH';

      const homeCovered = actualDiff > 0;
      const predMargin = predHome - predAway;
      const predDiff = predMargin + homeLine;

      let pickedHomeToCover = predDiff > 0;
      if (predDiff === 0) {
        pickedHomeToCover = predHome > predAway;
      }

      if (homeCovered === pickedHomeToCover) return 'WIN';
      return 'LOSS';
    };

    // User calculations
    if (pred.userPredictedWinner) {
      const uWon = pred.userPredictedWinner === actualWinnerName;
      if (uWon) {
        userOverall.w++;
        weekRec.user.w++;
      } else {
        userOverall.l++;
        weekRec.user.l++;
      }

      const uHome = parseFloat(pred.userHomeScore || '0');
      const uAway = parseFloat(pred.userAwayScore || '0');

      if (pred.userHomeScore !== undefined && pred.userAwayScore !== undefined && pred.userHomeScore !== '' && pred.userAwayScore !== '') {
        const uMargin = uHome - uAway;
        const err = Math.abs(uMargin - actualMargin);
        userOverall.marginErrorSum += err;
        userOverall.marginCount++;
        if (isDeviated) {
          userH2H.marginErrorSum += err;
          userH2H.marginCount++;
        }
      }

      if (uHome || uAway) {
        const atsResult = checkATS(uHome, uAway);
        if (atsResult === 'WIN') {
          userOverall.atsW++;
          if (isDeviated) userH2H.atsW++;
        } else if (atsResult === 'LOSS') {
          userOverall.atsL++;
          if (isDeviated) userH2H.atsL++;
        } else if (atsResult === 'PUSH') {
          userOverall.atsP++;
          if (isDeviated) userH2H.atsP++;
        }
      }

      if (isDeviated) {
        if (uWon) {
          userH2H.w++;
          weekRec.userH2HW++;
        } else {
          userH2H.l++;
        }
      }
    }

    // App calculations
    if (pred.predictedWinner) {
      const aWon = pred.predictedWinner === actualWinnerName;
      if (aWon) {
        appOverall.w++;
        weekRec.app.w++;
      } else {
        appOverall.l++;
        weekRec.app.l++;
      }

      const aHome = parseFloat(pred.homeScore);
      const aAway = parseFloat(pred.awayScore);

      if (!isNaN(aHome) && !isNaN(aAway)) {
        const aMargin = aHome - aAway;
        const err = Math.abs(aMargin - actualMargin);
        appOverall.marginErrorSum += err;
        appOverall.marginCount++;
        if (isDeviated) {
          appH2H.marginErrorSum += err;
          appH2H.marginCount++;
        }
      }

      if (!isNaN(aHome) || !isNaN(aAway)) {
        const atsResult = checkATS(aHome, aAway);
        if (atsResult === 'WIN') {
          appOverall.atsW++;
          if (isDeviated) appH2H.atsW++;
        } else if (atsResult === 'LOSS') {
          appOverall.atsL++;
          if (isDeviated) appH2H.atsL++;
        } else if (atsResult === 'PUSH') {
          appOverall.atsP++;
          if (isDeviated) appH2H.atsP++;
        }
      }

      if (isDeviated) {
        weekRec.deviatedCount++;
        if (aWon) {
          appH2H.w++;
          weekRec.appH2HW++;
        } else {
          appH2H.l++;
        }
      }
    }
  });

  const weeklyRecords = Object.values(weeklyMap).sort((a, b) => a.week - b.week);
  const hasDeviations = userH2H.w + userH2H.l > 0;

  return {
    userOverall,
    appOverall,
    userH2H,
    appH2H,
    userMAE: userOverall.marginCount > 0 ? (userOverall.marginErrorSum / userOverall.marginCount).toFixed(1) : 'N/A',
    appMAE: appOverall.marginCount > 0 ? (appOverall.marginErrorSum / appOverall.marginCount).toFixed(1) : 'N/A',
    userH2HMAE: userH2H.marginCount > 0 ? (userH2H.marginErrorSum / userH2H.marginCount).toFixed(1) : 'N/A',
    appH2HMAE: appH2H.marginCount > 0 ? (appH2H.marginErrorSum / appH2H.marginCount).toFixed(1) : 'N/A',
    weeklyRecords,
    hasDeviations
  };
}

export const StandingsModal: React.FC<StandingsModalProps> = ({ onClose, predictions, results }) => {
  const standings = calculateStandings(predictions, results);
  const { userOverall, appOverall, userH2H, appH2H, userMAE, appMAE, weeklyRecords, hasDeviations } = standings;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 w-full max-w-3xl rounded-2xl border border-slate-700 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 md:p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900 sticky top-0 z-10">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" /> Season Standings
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {/* Scrollable Body */}
        <div className="p-5 md:p-6 overflow-y-auto space-y-6 bg-slate-950">
          {/* Prominent Scoreboard Block (Requirements 3 & Scoring Model) */}
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3 shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs uppercase font-mono tracking-widest text-slate-400 font-bold flex items-center gap-1.5">
                <Swords className="w-4 h-4 text-blue-400" /> Head-to-Head Scoreboard
              </span>
              <span className="text-[10px] bg-blue-950/80 text-blue-300 border border-blue-800 px-2 py-0.5 rounded font-mono uppercase">
                Active Competition
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-1">
              {/* Overall Row */}
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Overall</span>
                <div className="text-xl font-black font-mono mt-1 text-white">
                  You <span className="text-blue-400">{userOverall.w}-{userOverall.l}</span>
                  <span className="text-slate-600 mx-2">|</span>
                  AI <span className="text-slate-300">{appOverall.w}-{appOverall.l}</span>
                </div>
              </div>

              {/* When You Disagreed Row (Deviations only) */}
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">When you disagreed</span>
                <div className="mt-1">
                  {hasDeviations ? (
                    <div className="text-xl font-black font-mono text-white">
                      You <span className="text-amber-400">{userH2H.w}-{userH2H.l}</span>
                      <span className="text-slate-600 mx-2">|</span>
                      AI <span className="text-slate-300">{appH2H.w}-{appH2H.l}</span>
                    </div>
                  ) : (
                    <div className="text-xs font-medium text-slate-400 italic py-1">
                      You've taken every engine pick
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Cards Grid: User vs App */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* User Card */}
            <div className="bg-slate-900 p-6 rounded-xl border border-blue-500/30 relative overflow-hidden space-y-4">
              <div className="absolute top-0 right-0 p-4 opacity-10"><User className="w-24 h-24 text-blue-500" /></div>
              <h3 className="text-blue-400 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                <User className="w-4 h-4" /> Your Record
              </h3>
              <div className="space-y-3 relative z-10">
                <div>
                  <span className="text-slate-500 text-xs uppercase font-bold">Straight Up</span>
                  <div className="text-3xl font-black text-white font-mono">{userOverall.w}-{userOverall.l}</div>
                  <div className="text-xs text-slate-400 font-mono">{((userOverall.w / (userOverall.w + userOverall.l || 1))*100).toFixed(1)}%</div>
                </div>
                <div>
                  <span className="text-slate-500 text-xs uppercase font-bold">Against The Spread</span>
                  <div className="text-2xl font-bold text-slate-300 font-mono">
                    {userOverall.atsW}-{userOverall.atsL}<span className="text-slate-600 text-base">-{userOverall.atsP}</span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-xs uppercase font-bold">Score Accuracy (MAE Margin)</span>
                  <div className="text-lg font-bold text-slate-200 font-mono">
                    {userMAE !== 'N/A' ? `${userMAE} pts error` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* App Card */}
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 relative overflow-hidden space-y-4">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Bot className="w-24 h-24 text-slate-400" /></div>
              <h3 className="text-slate-400 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                <Bot className="w-4 h-4" /> Medi Picks AI
              </h3>
              <div className="space-y-3 relative z-10">
                <div>
                  <span className="text-slate-500 text-xs uppercase font-bold">Straight Up</span>
                  <div className="text-3xl font-black text-white font-mono">{appOverall.w}-{appOverall.l}</div>
                  <div className="text-xs text-slate-400 font-mono">{((appOverall.w / (appOverall.w + appOverall.l || 1))*100).toFixed(1)}%</div>
                </div>
                <div>
                  <span className="text-slate-500 text-xs uppercase font-bold">Against The Spread</span>
                  <div className="text-2xl font-bold text-slate-300 font-mono">
                    {appOverall.atsW}-{appOverall.atsL}<span className="text-slate-600 text-base">-{appOverall.atsP}</span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-xs uppercase font-bold">Score Accuracy (MAE Margin)</span>
                  <div className="text-lg font-bold text-slate-200 font-mono">
                    {appMAE !== 'N/A' ? `${appMAE} pts error` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Weekly Breakdown Strip (Requirement 6 / D5) */}
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" /> Weekly Performance Breakdown
            </h4>

            {weeklyRecords.length > 0 ? (
              <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-slate-700">
                {weeklyRecords.map((w) => (
                  <div key={w.week} className="bg-slate-950 border border-slate-800 rounded-lg p-3 min-w-[100px] text-center shrink-0">
                    <div className="text-[10px] uppercase font-mono text-slate-400 font-bold mb-1">Week {w.week}</div>
                    <div className="text-sm font-black text-blue-400 font-mono">{w.user.w}-{w.user.l}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">AI: {w.app.w}-{w.app.l}</div>
                    {w.deviatedCount > 0 && (
                      <div className="mt-1 text-[9px] text-amber-400 font-mono border-t border-slate-800 pt-1">
                        H2H: {w.userH2HW}-{w.appH2HW}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic py-3 text-center">
                No completed game results recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};