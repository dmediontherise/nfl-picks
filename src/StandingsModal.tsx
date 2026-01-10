import React from 'react';
import { X, Trophy, TrendingUp } from 'lucide-react';
import { UserPrediction } from './types';

interface GameResult {
    homeScore: number;
    awayScore: number;
    spread: string; // "BUF -10.5"
    homeAbbr: string;
    awayAbbr: string;
    homeName: string;
    awayName: string;
}

interface StandingsModalProps {
    onClose: () => void;
    predictions: Record<string, UserPrediction>;
    results: Record<string, GameResult>;
}

export const StandingsModal: React.FC<StandingsModalProps> = ({ onClose, predictions, results }) => {
    
    // Logic:
    let userRecord = { w: 0, l: 0, atsW: 0, atsL: 0, atsP: 0 };
    let appRecord = { w: 0, l: 0, atsW: 0, atsL: 0, atsP: 0 };

    Object.keys(results).forEach(gameId => {
        const res = results[gameId];
        const pred = predictions[gameId];
        if (!pred) return; // No prediction for this game

        const actualWinnerName = res.homeScore > res.awayScore ? res.homeName : res.awayName;

        // --- Helper: Check ATS ---
        const checkATS = (predHome: number, predAway: number) => {
             if (!res.spread) return null;
             const parts = res.spread.split(' ');
             if (parts.length < 2) return null;
             
             // 1. Determine Line from Home Perspective
             const favAbbr = parts[0];
             const rawVal = parseFloat(parts[parts.length - 1]);
             // If Home is Fav, line is negative. If Away is Fav, Home line is positive.
             const homeLine = favAbbr === res.homeAbbr ? -Math.abs(rawVal) : Math.abs(rawVal);

             // 2. Determine Actual Result (Did Home Cover?)
             const actualMargin = res.homeScore - res.awayScore;
             const actualDiff = actualMargin + homeLine;
             
             if (actualDiff === 0) return 'PUSH';

             const homeCovered = actualDiff > 0;

             // 3. Determine Prediction Pick (Did Pred pick Home to cover?)
             const predMargin = predHome - predAway;
             const predDiff = predMargin + homeLine;
             
             // If prediction is exactly on the line, we can't really score it as a W/L unless we default to "Winner Pick".
             // But for now, let's say if predDiff > 0, they picked Home. 
             // If predDiff == 0 (rare), let's fallback to the winner pick direction.
             let pickedHomeToCover = predDiff > 0;
             if (predDiff === 0) {
                 pickedHomeToCover = predHome > predAway; 
             }

             if (homeCovered === pickedHomeToCover) return 'WIN';
             return 'LOSS';
        };

        // --- User ---
        if (pred.userPredictedWinner) {
            if (pred.userPredictedWinner === actualWinnerName) userRecord.w++; else userRecord.l++;
            
            // ATS (User)
            // Parse User Scores (default to 0 if missing, but they should be there)
            const uHome = parseInt(pred.userHomeScore || "0");
            const uAway = parseInt(pred.userAwayScore || "0");
            
            if (uHome || uAway) {
                const result = checkATS(uHome, uAway);
                if (result === 'WIN') userRecord.atsW++;
                else if (result === 'LOSS') userRecord.atsL++;
                else if (result === 'PUSH') userRecord.atsP++;
            }
        }

        // --- App ---
        if (pred.predictedWinner) {
            if (pred.predictedWinner === actualWinnerName) appRecord.w++; else appRecord.l++;
            
            // ATS (App)
            const aHome = parseFloat(pred.homeScore);
            const aAway = parseFloat(pred.awayScore);
            
            const result = checkATS(aHome, aAway);
            if (result === 'WIN') appRecord.atsW++;
            else if (result === 'LOSS') appRecord.atsL++;
            else if (result === 'PUSH') appRecord.atsP++;
        }
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 w-full max-w-2xl rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <Trophy className="w-6 h-6 text-yellow-500" /> Season Standings
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
                </div>
                
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* User Card */}
                    <div className="bg-slate-950 p-6 rounded-xl border border-blue-500/30 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Trophy className="w-24 h-24" /></div>
                        <h3 className="text-blue-400 font-bold uppercase tracking-widest mb-4">Your Record</h3>
                        <div className="space-y-4 relative z-10">
                            <div>
                                <span className="text-slate-500 text-xs uppercase font-bold">Straight Up</span>
                                <div className="text-4xl font-black text-white">{userRecord.w}-{userRecord.l}</div>
                                <div className="text-xs text-slate-400">{((userRecord.w / (userRecord.w + userRecord.l || 1))*100).toFixed(1)}%</div>
                            </div>
                            <div>
                                <span className="text-slate-500 text-xs uppercase font-bold">Against The Spread</span>
                                <div className="text-3xl font-bold text-slate-300">{userRecord.atsW}-{userRecord.atsL}<span className="text-slate-600 text-base">-{userRecord.atsP}</span></div>
                            </div>
                        </div>
                    </div>

                    {/* App Card */}
                    <div className="bg-slate-950 p-6 rounded-xl border border-slate-700 relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp className="w-24 h-24" /></div>
                        <h3 className="text-slate-400 font-bold uppercase tracking-widest mb-4">Medi Picks AI</h3>
                        <div className="space-y-4 relative z-10">
                            <div>
                                <span className="text-slate-500 text-xs uppercase font-bold">Straight Up</span>
                                <div className="text-4xl font-black text-white">{appRecord.w}-{appRecord.l}</div>
                                <div className="text-xs text-slate-400">{((appRecord.w / (appRecord.w + appRecord.l || 1))*100).toFixed(1)}%</div>
                            </div>
                            <div>
                                <span className="text-slate-500 text-xs uppercase font-bold">Against The Spread</span>
                                <div className="text-3xl font-bold text-slate-300">{appRecord.atsW}-{appRecord.atsL}<span className="text-slate-600 text-base">-{appRecord.atsP}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};