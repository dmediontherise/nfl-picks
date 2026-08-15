import React, { useState, useEffect } from 'react';
import { X, Trophy, AlertTriangle, Activity, User, BrainCircuit, Flame, Zap, RefreshCw, DollarSign, History, Target } from 'lucide-react';
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
  }, [game, userPrediction]);

  const handleRefresh = async () => {
    setLoading(true);
    setAnalysis(null);
    try {
      const result = await analyzeMatchup(game, true);
      setAnalysis(result);
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
                Medi Picks <span className="text-blue-400 hidden sm:inline">NFL Engine</span>
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
              <div className="text-[10px] md:text-xs text-slate-500 font-mono uppercase tracking-widest whitespace-nowrap">Stage {game.week}</div>
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
          
          {/* Left Column: Predictions & User Input */}
          <div className="space-y-6">
            
            {/* Predicted Score Card */}
            {analysis ? (
              <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 shadow-inner text-center">
                <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center justify-center gap-2">
                  <Activity className="w-4 h-4" /> Projected Final Score
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

            {/* Betting Intel */}
            {game.bettingData && (
              <div className="bg-slate-900/50 p-4 rounded-xl border border-green-900/30">
                <h3 className="text-sm font-bold text-green-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Market Lines
                </h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm text-slate-300">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase">Spread</span>
                    <span className="font-mono font-bold text-white">{game.bettingData.spread || "N/A"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase">Total</span>
                    <span className="font-mono font-bold text-white">{game.bettingData.total || "N/A"}</span>
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
          </div>

          {/* Center/Right Column: Engine Metrics & Analysis */}
          <div className="lg:col-span-2 space-y-6">
            {loading ? (
              <div className="space-y-4">
                <div className="h-40 bg-slate-800/50 rounded-xl animate-pulse"></div>
                <div className="h-64 bg-slate-800/50 rounded-xl animate-pulse"></div>
              </div>
            ) : analysis ? (
              <>
                {/* Pure Model Engine Metrics Panel (Task 002 & 003 Requirement 7) */}
                {analysis.prediction && (
                  <div className="bg-slate-900 p-5 rounded-xl border border-blue-500/40 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                        <Target className="w-4 h-4" /> Massey Decision Engine Outputs
                      </h3>
                      <span className="text-[10px] font-mono bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-800">
                        {analysis.prediction.modelVersion}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Win Probability</div>
                        <div className="text-lg font-black text-white font-mono">
                          {(analysis.prediction.homeWinProbability * 100).toFixed(1)}%
                        </div>
                        <div className="text-[9px] text-slate-400">{game.homeTeam.abbreviation} Win Prob</div>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Calibrated Confidence</div>
                        <div className="text-lg font-black text-yellow-400 font-mono">
                          {analysis.prediction.confidence.toFixed(1)}%
                        </div>
                        <div className="text-[9px] text-slate-400">Model Confidence</div>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Spread Pick</div>
                        <div className="text-xs font-bold text-green-400 font-mono truncate">
                          {analysis.prediction.spreadPick.team} {analysis.prediction.spreadPick.line >= 0 ? `+${analysis.prediction.spreadPick.line}` : analysis.prediction.spreadPick.line}
                        </div>
                        <div className="text-[9px] text-slate-400">Edge: +{analysis.prediction.spreadPick.edge.toFixed(1)} pts</div>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Total Pick</div>
                        {analysis.prediction.totalPick.edge < 1.0 ? (
                          <>
                            <div className="text-xs font-bold text-slate-400 font-mono truncate">
                              No Meaningful Edge
                            </div>
                            <div className="text-[9px] text-slate-400">Proj: {analysis.prediction.totalPick.projected} vs {analysis.prediction.totalPick.line}</div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs font-bold text-blue-400 font-mono truncate">
                              {analysis.prediction.totalPick.side.toUpperCase()} {analysis.prediction.totalPick.line}
                            </div>
                            <div className="text-[9px] text-slate-400">Proj: {analysis.prediction.totalPick.projected} pts (+{analysis.prediction.totalPick.edge.toFixed(1)} edge)</div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Machine-Readable Drivers List */}
                    {analysis.prediction.drivers && analysis.prediction.drivers.length > 0 && (
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1">
                          Model Drivers (Margin Component Breakdown)
                        </div>
                        <div className="space-y-1.5">
                          {analysis.prediction.drivers.map((driver, idx) => {
                            const signedMag = driver.direction === 'home' 
                              ? `+${driver.magnitude.toFixed(2)} pts`
                              : (driver.direction === 'away' ? `-${driver.magnitude.toFixed(2)} pts` : `0.00 pts`);
                            
                            const badgeColor = driver.direction === 'home'
                              ? 'bg-blue-900/50 text-blue-400 border-blue-700'
                              : (driver.direction === 'away' ? 'bg-orange-900/50 text-orange-400 border-orange-700' : 'bg-slate-800 text-slate-400 border-slate-700');

                            return (
                              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between text-xs p-2 rounded bg-slate-900/60 border border-slate-800/80 gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-200">{driver.label}</span>
                                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${badgeColor}`}>
                                    {signedMag}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 italic">
                                  {driver.detail}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Risk Factor Bar */}
                <div className="bg-slate-800/80 p-4 rounded-xl border border-orange-500/30 flex items-center justify-between shadow-lg relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent pointer-events-none"></div>
                  <div className="relative z-10 max-w-[70%]">
                    <h4 className="text-orange-400 font-bold flex items-center gap-2 uppercase text-xs tracking-widest mb-1">
                      <AlertTriangle className="w-4 h-4" /> Risk Factor
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

                {/* Retrospective (Post-Game Only) */}
                {analysis.retrospective && (
                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 border border-slate-700/50 shadow-xl mb-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <History className="w-16 h-16 text-white" />
                    </div>
                    
                    <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <History className="w-4 h-4" /> Retrospective
                    </h3>
                    
                    <div className="space-y-4 relative z-10">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Final Result</div>
                        <div className="text-lg font-bold text-white">{analysis.retrospective.result}</div>
                      </div>
                      
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Key to Victory</div>
                        <p className="text-sm text-slate-300 leading-relaxed italic">
                          "{analysis.retrospective.keyToVictory}"
                        </p>
                      </div>

                      {analysis.retrospective.standoutPerformers.length > 0 && (
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-2">Standout Performers</div>
                          <div className="flex flex-wrap gap-2">
                            {analysis.retrospective.standoutPerformers.map((player, idx) => (
                              <span key={idx} className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-blue-300 font-bold">
                                {player}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Narrative Card */}
                <div className="bg-slate-800/50 p-6 rounded-xl border-l-4 border-blue-500 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-4 relative z-10">
                    <BrainCircuit className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-bold text-white uppercase tracking-tight">The Medi Picks Intel</h3>
                  </div>
                  <div className="text-slate-300 leading-relaxed text-sm md:text-base space-y-3 relative z-10">
                    {analysis.narrativeDetails?.sentences ? (
                      analysis.narrativeDetails.sentences.map((sent: string, idx: number) => {
                        const sentenceCitations = analysis.narrativeDetails?.citations.filter(c => c.sentenceIndex === idx) || [];
                        return (
                          <div key={idx} className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-slate-800/60 pb-2">
                            <span className="leading-snug">{sent}</span>
                            {sentenceCitations.length > 0 && (
                              <span className="flex flex-wrap gap-1 flex-shrink-0 mt-1 sm:mt-0">
                                {sentenceCitations.map((cite, cIdx) => (
                                  <span 
                                    key={cIdx} 
                                    className="text-[9px] font-mono bg-blue-950/80 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800/60"
                                    title={`Driver: ${cite.driverKey} (${cite.value})`}
                                  >
                                    [{cite.driverKey}: {cite.value}]
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p>{analysis.narrative}</p>
                    )}
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