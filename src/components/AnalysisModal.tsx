import React, { useState, useEffect } from 'react';
import { X, Trophy, AlertTriangle, Activity, User, ExternalLink, Loader2, BrainCircuit, Cloud, Wind, Flame, Zap, RefreshCw, TrendingUp, DollarSign } from 'lucide-react';
import { Game, AnalysisResult, UserPrediction, Team } from '../types';
import { analyzeMatchup } from '../services/geminiService';

interface AnalysisModalProps {
  game: Game;
  onClose: () => void;
  userPrediction?: UserPrediction;
  onSavePrediction: (pred: UserPrediction) => void;
}

const TeamLogo: React.FC<{ team: Team, size?: "large" | "small" }> = ({ team, size = "large" }) => (
  <div className="relative group">
    <div 
      className="absolute -inset-2 rounded-full blur-sm opacity-25 group-hover:opacity-50 transition-all duration-300"
      style={{ backgroundColor: team.color }}
    ></div>
    <img 
      src={team.logoUrl} 
      className={`${size === "large" ? "w-12 h-12 md:w-16 md:h-16" : "w-8 h-8 md:w-12 md:h-12"} relative z-10 drop-shadow-2xl transition-all duration-300`}
      alt={team.name}
    />
  </div>
);

const TugOfWar: React.FC<{ homeColor: string, awayColor: string, label: string, value: number }> = ({ homeColor, awayColor, label, value }) => {
    return (
        <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1 uppercase font-bold tracking-wider">
               <span>{label}</span>
            </div>
            <div className="h-4 bg-slate-800 rounded-full relative overflow-hidden flex">
                <div style={{ width: `${100-value}%`, backgroundColor: awayColor }} className="h-full transition-all duration-1000"></div>
                <div style={{ width: `${value}%`, backgroundColor: homeColor }} className="h-full transition-all duration-1000"></div>
                <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-900 z-10"></div>
            </div>
        </div>
    );
};

const AnalysisModal: React.FC<AnalysisModalProps> = ({ game, onClose, userPrediction, onSavePrediction }) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  
  // Custom User Inputs
  const [customHomeScore, setCustomHomeScore] = useState(userPrediction?.userHomeScore || "");
  const [customAwayScore, setCustomAwayScore] = useState(userPrediction?.userAwayScore || "");
  const [customWinner, setCustomWinner] = useState(userPrediction?.userPredictedWinner || "");

  // Auto-analyze on mount
  useEffect(() => {
    let isMounted = true;
    const runAnalysis = async () => {
      setLoading(true);
      try {
        const result = await analyzeMatchup(game);
        if (isMounted) {
            setAnalysis(result);
            // Pre-fill user inputs with AI prediction if empty
            if (!userPrediction) {
                setCustomHomeScore(result.homeScorePrediction.toString());
                setCustomAwayScore(result.awayScorePrediction.toString());
                setCustomWinner(result.winnerPrediction);
            }
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    runAnalysis();
    return () => { isMounted = false; };
  }, [game]);

  const handleRefresh = async () => {
    setLoading(true);
    setAnalysis(null);
    try {
      const result = await analyzeMatchup(game, true);
      setAnalysis(result);
      // Don't overwrite user custom inputs on refresh unless empty? Let's leave them.
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePredict = () => {
    if (!analysis) return;
    onSavePrediction({
      gameId: game.id,
      homeScore: analysis.homeScorePrediction.toString(),
      awayScore: analysis.awayScorePrediction.toString(),
      predictedWinner: analysis.winnerPrediction,
      userHomeScore: customHomeScore,
      userAwayScore: customAwayScore,
      userPredictedWinner: customWinner
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm overflow-hidden">
      <div className="bg-slate-900 w-full h-full md:h-[90vh] md:max-w-5xl md:rounded-2xl overflow-hidden flex flex-col shadow-2xl border-0 md:border border-slate-700">
        
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-slate-800 bg-slate-900 sticky top-0 z-20 shrink-0">
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center space-x-2">
                <div className="bg-blue-600 p-1.5 rounded-lg">
                  <BrainCircuit className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">
                  Medi Jinx <span className="text-blue-400 hidden sm:inline">NFL Predictions</span>
                </h1>
                {analysis?.quickTake && (
                    <span className="ml-2 px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-xs font-bold text-yellow-400 uppercase tracking-widest animate-pulse">
                        {analysis.quickTake}
                    </span>
                )}
             </div>
             <div className="flex items-center space-x-2">
               <button 
                 onClick={handleRefresh}
                 disabled={loading}
                 className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors disabled:opacity-50"
               >
                 <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-blue-500' : ''}`} />
               </button>
               <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
             </div>
          </div>
          
          <div className="flex items-center justify-between max-w-3xl mx-auto px-2 md:px-0">
            <div className="flex flex-col items-center">
              <TeamLogo team={game.awayTeam} size="large" />
              <div className="text-2xl md:text-3xl font-black text-white tracking-tighter mt-2">{game.awayTeam.abbreviation}</div>
              <div className="text-[10px] font-mono text-slate-500 mt-1">{game.awayTeam.record || "0-0"}</div>
            </div>
            <div className="flex flex-col items-center px-4 md:px-8">
               <div className="text-slate-500 text-2xl md:text-3xl font-light italic mb-1">VS</div>
               <div className="text-[10px] md:text-xs text-slate-500 font-mono uppercase tracking-widest whitespace-nowrap">Week {game.week}</div>
            </div>
            <div className="flex flex-col items-center">
              <TeamLogo team={game.homeTeam} size="large" />
              <div className="text-2xl md:text-3xl font-black text-white tracking-tighter mt-2">{game.homeTeam.abbreviation}</div>
              <div className="text-[10px] font-mono text-slate-500 mt-1">{game.homeTeam.record || "0-0"}</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 bg-slate-950">
          
          {/* Left Column: Predictions & Stats */}
          <div className="space-y-6">
            
            {/* Predicted Score Card */}
            {analysis ? (
              <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 shadow-inner text-center">
                <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center justify-center gap-2">
                  <Activity className="w-4 h-4" /> Medi Jinx Projection
                </h3>
                <div className="flex items-center justify-center gap-6 mb-6">
                  <div>
                    <div className="text-4xl font-black text-white">{analysis.awayScorePrediction}</div>
                    <div className="text-[10px] text-slate-500 uppercase">{game.awayTeam.abbreviation}</div>
                  </div>
                  <div className="text-2xl text-slate-600">-</div>
                  <div>
                    <div className="text-4xl font-black text-white">{analysis.homeScorePrediction}</div>
                    <div className="text-[10px] text-slate-500 uppercase">{game.homeTeam.abbreviation}</div>
                  </div>
                </div>

                {/* User Input Section */}
                <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-center gap-2">
                        <User className="w-3 h-3" /> Your Prediction
                    </h4>
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <div className="flex flex-col w-16">
                            <label className="text-[8px] text-slate-500 uppercase mb-1">{game.awayTeam.abbreviation}</label>
                            <input 
                                type="number" 
                                value={customAwayScore}
                                onChange={(e) => setCustomAwayScore(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded text-center text-white font-mono p-1 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <span className="text-slate-600">-</span>
                        <div className="flex flex-col w-16">
                            <label className="text-[8px] text-slate-500 uppercase mb-1">{game.homeTeam.abbreviation}</label>
                            <input 
                                type="number" 
                                value={customHomeScore}
                                onChange={(e) => setCustomHomeScore(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded text-center text-white font-mono p-1 focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>
                    <select 
                        value={customWinner}
                        onChange={(e) => setCustomWinner(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white outline-none focus:border-blue-500"
                    >
                        <option value="">Select Winner</option>
                        <option value={game.awayTeam.name}>{game.awayTeam.name}</option>
                        <option value={game.homeTeam.name}>{game.homeTeam.name}</option>
                    </select>
                </div>

                <button 
                  onClick={handlePredict}
                  className="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-all shadow-lg shadow-blue-900/20 active:scale-95 text-xs uppercase tracking-wide"
                >
                  Save Prediction
                </button>
              </div>
            ) : (
              <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 h-48 animate-pulse"></div>
            )}

            {/* Action Network Betting Intel */}
            {game.bettingData && (
              <div className="bg-slate-900/50 p-4 rounded-xl border border-green-900/30">
                <h3 className="text-sm font-bold text-green-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Action Network Intel
                </h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm text-slate-300">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase">Spread</span>
                    <span className="font-mono font-bold text-white">{game.bettingData.spread}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase">Total</span>
                    <span className="font-mono font-bold text-white">{game.bettingData.total}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] text-slate-500 uppercase">Public Money</span>
                    <div className="w-full bg-slate-800 h-2 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${game.bettingData.publicBettingPct}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[10px] mt-1 text-slate-400">
                      <span>{game.bettingData.publicBettingPct}% on Fav</span>
                      <span>{100 - game.bettingData.publicBettingPct}% on Dog</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Leverage */}
            {analysis && (
              <div className="p-4 md:p-6 rounded-xl border border-slate-700/50 backdrop-blur-sm" style={{ backgroundColor: `${game.homeTeam.color}10` }}>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <Activity className="w-5 h-5 mr-2 text-green-400" /> Leverage
                </h3>
                 <TugOfWar label="Offensive Efficiency" value={analysis.leverage.offense} homeColor={game.homeTeam.color} awayColor={game.awayTeam.color} />
                 <TugOfWar label="Defensive Solidity" value={analysis.leverage.defense} homeColor={game.homeTeam.color} awayColor={game.awayTeam.color} />
                 <TugOfWar label="QB Play" value={analysis.leverage.qb} homeColor={game.homeTeam.color} awayColor={game.awayTeam.color} />
              </div>
            )}
          </div>

          {/* Center/Right Column: AI Analysis */}
          <div className="lg:col-span-2 space-y-6">
            {loading ? (
              <div className="space-y-4">
                 <div className="h-40 bg-slate-800/50 rounded-xl animate-pulse"></div>
                 <div className="h-64 bg-slate-800/50 rounded-xl animate-pulse"></div>
              </div>
            ) : analysis ? (
              <>
                {/* Jinx Meter */}
                <div className="bg-slate-800/80 p-4 rounded-xl border border-orange-500/30 flex items-center justify-between shadow-lg relative overflow-hidden">
                   <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-events-none"></div>
                  <div className="relative z-10 max-w-[70%]">
                    <h4 className="text-orange-400 font-bold flex items-center gap-2 uppercase text-xs tracking-widest mb-1">
                      <AlertTriangle className="w-4 h-4" /> Jinx Probability
                    </h4>
                    <p className="text-slate-300 text-sm leading-snug">{analysis.jinxAnalysis}</p>
                  </div>
                  <div className="flex flex-col items-center justify-center border-l border-slate-700 pl-4 md:pl-6 relative z-10">
                    <span className={`text-3xl md:text-4xl font-black ${analysis.jinxScore > 7 ? 'text-red-500' : analysis.jinxScore > 4 ? 'text-orange-400' : 'text-green-400'}`}>
                      {analysis.jinxScore}<span className="text-lg md:text-xl text-slate-500">/10</span>
                    </span>
                    <span className="text-[8px] md:text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">Danger Level</span>
                  </div>
                </div>

                {/* Narrative Card */}
                 <div className="bg-slate-800/50 p-6 rounded-xl border-l-4 border-blue-500 relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full pointer-events-none"></div>
                  <div className="flex items-center gap-2 mb-4 relative z-10">
                    <BrainCircuit className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-bold text-white uppercase tracking-tight">The Medi Jinx Intel</h3>
                  </div>
                  <div className="text-slate-300 leading-relaxed text-sm md:text-base space-y-4 whitespace-pre-wrap relative z-10">
                    {analysis.narrative}
                  </div>
                  <div className="mt-6 pt-6 border-t border-slate-700 grid grid-cols-2 gap-4 relative z-10">
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500 uppercase font-bold flex items-center mb-2">
                        <Flame className="w-3 h-3 mr-1 text-blue-400" /> Execution Rating
                      </span>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${analysis.executionRating}%` }}></div>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500 uppercase font-bold flex items-center mb-2">
                         <Zap className="w-3 h-3 mr-1 text-orange-500" /> Explosive Play Potential
                      </span>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 transition-all duration-1000" style={{ width: `${analysis.explosiveRating}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Insights Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-900/50 p-4 md:p-5 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors">
                    <h4 className="text-white font-semibold mb-3 flex items-center">
                      <Trophy className="w-4 h-4 mr-2 text-yellow-500" /> Keys to Victory
                    </h4>
                    <ul className="space-y-3">
                      {analysis.keyFactors.map((factor, i) => (
                        <li key={i} className="text-sm text-slate-300 flex items-start">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 mr-3 flex-shrink-0"></span>
                          <span className="leading-snug">{factor}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-slate-900/50 p-4 md:p-5 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors">
                    <h4 className="text-white font-semibold mb-3 flex items-center">
                      <AlertTriangle className="w-4 h-4 mr-2 text-red-500" /> Critical Variables
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Injury Impact</span>
                        <p className="text-sm text-slate-300 mt-1 leading-snug">{analysis.injuryImpact}</p>
                      </div>
                      <div className="border-t border-slate-800 pt-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Scheme Mismatches</span>
                        <p className="text-sm text-slate-300 mt-1 leading-snug">{analysis.coachingMatchup}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-xl p-8">
                <BrainCircuit className="w-16 h-16 mb-4 opacity-20" />
                <p>Waiting for analysis...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisModal;