import React, { useState, useEffect } from 'react';
import AnalysisModal from './components/AnalysisModal';
import { StandingsModal } from './StandingsModal';
import { UserPrediction, Game } from './types';
import { espnApi } from './services/espnAdapter';
import { downloadPredictionsAsCSV } from './utils/csvExporter';
import { Calendar, MapPin, ChevronRight, RefreshCw, Server, Loader2, Download, Trophy } from 'lucide-react';

const App: React.FC = () => {
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [showStandings, setShowStandings] = useState(false);
  
  // Persistent State
  const [userPredictions, setUserPredictions] = useState<Record<string, UserPrediction>>(() => {
    const saved = localStorage.getItem('mediPicks_predictions');
    return saved ? JSON.parse(saved) : {};
  });

  const [gameResults, setGameResults] = useState<Record<string, any>>(() => {
    const saved = localStorage.getItem('mediPicks_results');
    return saved ? JSON.parse(saved) : {};
  });

  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<any>(null);

  // Initial Fetch & Auto-Refresh (Realtime)
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // 60s Refresh
    return () => clearInterval(interval);
  }, []);

  // Save Predictions
  useEffect(() => {
    localStorage.setItem('mediPicks_predictions', JSON.stringify(userPredictions));
  }, [userPredictions]);

  // Save & Update Results
  useEffect(() => {
    localStorage.setItem('mediPicks_results', JSON.stringify(gameResults));
  }, [gameResults]);

  // Check for Completed Games to Update Results Cache
  useEffect(() => {
    if (games.length === 0) return;
    
    setGameResults(prev => {
        const next = { ...prev };
        let changed = false;
        
        games.forEach(g => {
            if (g.status === 'post' && g.homeTeam.score !== undefined && g.awayTeam.score !== undefined) {
                // If result not saved or score changed (unlikely for final but possible for corrections)
                // We use game.id as key. 
                // Note: ID must be unique week-over-week. ESPN IDs usually are.
                if (!next[g.id]) {
                    next[g.id] = {
                        homeScore: g.homeTeam.score,
                        awayScore: g.awayTeam.score,
                        spread: g.bettingData?.spread || "",
                        homeAbbr: g.homeTeam.abbreviation,
                        awayAbbr: g.awayTeam.abbreviation,
                        homeName: g.homeTeam.name,
                        awayName: g.awayTeam.name
                    };
                    changed = true;
                }
            }
        });
        return changed ? next : prev;
    });
  }, [games]);

  const fetchData = async () => {
    // Silent update if we already have data
    if (games.length === 0) setLoading(true);
    try {
      const response = await espnApi.getSchedule();
      setGames(response.data);
      setMeta(response.meta);
    } catch (error) {
      console.error("Failed to fetch ESPN data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePrediction = (prediction: UserPrediction) => {
    setUserPredictions(prev => ({
      ...prev,
      [prediction.gameId]: prediction
    }));
    setSelectedGame(null);
  };

  const handleDownload = () => {
    if (games.length > 0) {
      downloadPredictionsAsCSV(games, userPredictions);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-blue-500/30">
      
      {/* App Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0">
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-white flex items-center gap-2">
              MEDI PICKS <span className="text-blue-500">2025</span>
              <span className="text-[10px] bg-red-600/20 text-red-400 px-2 py-0.5 rounded border border-red-600/30 font-mono tracking-widest animate-pulse">
                 LIVE
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-medium tracking-wide uppercase flex items-center gap-2 mt-1">
              Week {meta?.week || "..."} • Season {meta?.season || 2025}
              <span className="text-slate-600">|</span>
              <Server className="w-3 h-3 text-slate-500" />
              <span className="text-slate-500">ESPN Realtime</span>
            </p>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-bold text-slate-300 hidden md:block">
              {Object.keys(userPredictions).length} Predictions Saved
            </div>

            <button 
               onClick={() => setShowStandings(true)}
               className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-yellow-400 rounded-lg transition-colors text-xs font-bold border border-slate-700"
               title="View Standings"
             >
               <Trophy className="w-4 h-4" />
               <span className="hidden sm:inline">Standings</span>
             </button>
             
             <button 
               onClick={handleDownload}
               className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-xs font-bold shadow-lg shadow-blue-900/20 active:scale-95"
               title="Download Predictions CSV"
             >
               <Download className="w-4 h-4" />
               <span className="hidden sm:inline">Export</span>
             </button>

             <div className="w-px h-6 bg-slate-700 mx-1"></div>

             <button 
               onClick={fetchData}
               className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors border border-slate-700 text-slate-400 hover:text-white"
               title="Refresh Live Data"
             >
               <RefreshCw className={`w-4 h-4 ${loading && games.length === 0 ? 'animate-spin' : ''}`} />
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {loading && games.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="text-slate-400 animate-pulse text-sm uppercase tracking-widest">Connecting to Satellite...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {games.map((game) => {
              const prediction = userPredictions[game.id];
              
              return (
                <div 
                  key={game.id}
                  onClick={() => setSelectedGame(game)}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-900/20 transition-all duration-300 cursor-pointer group relative"
                >
                  {/* Prediction Overlay Badge */}
                  {prediction && (
                    <div className="absolute top-[44px] right-2 flex flex-col items-end gap-1 z-10">
                        <div className="bg-green-500/20 border border-green-500/50 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                        PICK LOCKED
                        </div>
                        {game.status === 'post' && (
                            <>
                                {/* Outright Accuracy */}
                                {(() => {
                                    const actualWinner = (game.homeTeam.score || 0) > (game.awayTeam.score || 0) ? game.homeTeam.name : game.awayTeam.name;
                                    const hit = actualWinner === prediction.predictedWinner;
                                    return (
                                        <div className={`px-2 py-0.5 rounded border text-[10px] font-bold ${hit ? 'bg-green-900/50 border-green-500 text-green-400' : 'bg-red-900/50 border-red-500 text-red-400'}`}>
                                            {hit ? 'WINNER ✅' : 'WINNER ❌'}
                                        </div>
                                    );
                                })()}
                                {/* ATS Accuracy */}
                                {(() => {
                                    if (!game.bettingData?.spread) return null;
                                    const parts = game.bettingData.spread.split(' ');
                                    if (parts.length < 2) return null;
                                    const favAbbr = parts[0];
                                    const line = parseFloat(parts[1]);
                                    
                                    const homeScore = game.homeTeam.score || 0;
                                    const awayScore = game.awayTeam.score || 0;
                                    const margin = favAbbr === game.homeTeam.abbreviation ? (homeScore - awayScore) : (awayScore - homeScore);
                                    
                                    // Check if Fav Covered
                                    const favCovered = (margin + line) > 0;
                                    const push = (margin + line) === 0;

                                    // Did we pick Fav?
                                    const favName = favAbbr === game.homeTeam.abbreviation ? game.homeTeam.name : game.awayTeam.name;
                                    const pickedFav = prediction.predictedWinner === favName;
                                    
                                    let result = "MISS";
                                    if (push) result = "PUSH";
                                    else if (favCovered && pickedFav) result = "HIT";
                                    else if (!favCovered && !pickedFav) result = "HIT";

                                    return (
                                        <div className={`px-2 py-0.5 rounded border text-[10px] font-bold ${result === 'HIT' ? 'bg-green-900/50 border-green-500 text-green-400' : result === 'PUSH' ? 'bg-yellow-900/50 border-yellow-500 text-yellow-400' : 'bg-red-900/50 border-red-500 text-red-400'}`}>
                                            ATS {result === 'HIT' ? '✅' : result === 'PUSH' ? '➖' : '❌'}
                                        </div>
                                    );
                                })()}
                            </>
                        )}
                    </div>
                  )}

                  {/* Date & Venue / Live Status */}
                  <div className="px-4 py-3 bg-slate-950/50 border-b border-slate-800 flex justify-between items-center text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(game.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                    {game.status === 'in' ? (
                        <div className="flex items-center gap-1 text-red-500 font-bold animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                            LIVE • {game.clock}
                        </div>
                    ) : game.status === 'post' ? (
                        <div className="font-bold text-slate-300">FINAL</div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {game.venue.split(' ')[0]}...
                        </div>
                    )}
                  </div>

                  {/* Matchup Content */}
                  <div className="p-5 flex flex-col justify-center gap-4">
                    
                    {/* Away Team */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={game.awayTeam.logoUrl} alt={game.awayTeam.abbreviation} className="w-10 h-10 object-contain drop-shadow-lg" />
                        <div>
                          <div className="text-xl font-bold text-white leading-none">{game.awayTeam.abbreviation}</div>
                          <div className="text-[10px] text-slate-500 font-bold">
                            {game.awayTeam.name.split(' ').pop()} <span className="text-slate-600 font-normal">({game.awayTeam.record})</span>
                          </div>
                        </div>
                      </div>
                      {/* Show Prediction OR Live Score */}
                      {(game.status !== 'pre' && game.awayTeam.score !== undefined) ? (
                          <span className="text-2xl font-mono font-black text-white">{game.awayTeam.score}</span>
                      ) : prediction && (
                        <span className="text-xl font-mono font-bold text-slate-500">{prediction.awayScore}</span>
                      )}
                    </div>

                    {/* VS Divider */}
                    <div className="w-full h-px bg-slate-800 relative">
                      <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 px-2 text-[10px] text-slate-600 font-bold">@</span>
                    </div>

                    {/* Home Team */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={game.homeTeam.logoUrl} alt={game.homeTeam.abbreviation} className="w-10 h-10 object-contain drop-shadow-lg" />
                        <div>
                          <div className="text-xl font-bold text-white leading-none">{game.homeTeam.abbreviation}</div>
                          <div className="text-[10px] text-slate-500 font-bold">
                            {game.homeTeam.name.split(' ').pop()} <span className="text-slate-600 font-normal">({game.homeTeam.record})</span>
                          </div>
                        </div>
                      </div>
                      {(game.status !== 'pre' && game.homeTeam.score !== undefined) ? (
                          <span className="text-2xl font-mono font-black text-white">{game.homeTeam.score}</span>
                      ) : prediction && (
                        <span className="text-xl font-mono font-bold text-slate-500">{prediction.homeScore}</span>
                      )}
                    </div>

                  </div>

                  {/* Call to Action Footer */}
                  <div className="px-4 py-3 bg-slate-800/30 border-t border-slate-800 flex items-center justify-between group-hover:bg-blue-600/10 transition-colors">
                    <span className="text-xs font-bold text-blue-400 group-hover:text-blue-300">
                      {prediction ? 'View Analysis' : 'Analyze Matchup'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Layers */}
      {selectedGame && (
        <AnalysisModal 
          game={selectedGame} 
          onClose={() => setSelectedGame(null)} 
          userPrediction={userPredictions[selectedGame.id]}
          onSavePrediction={handleSavePrediction}
        />
      )}
      
      {showStandings && (
        <StandingsModal 
            onClose={() => setShowStandings(false)} 
            predictions={userPredictions}
            results={gameResults}
        />
      )}

      {/* Footer Disclaimer */}
      <footer className="max-w-7xl mx-auto px-4 py-8 border-t border-slate-900 mt-8">
        <p className="text-[12px] leading-relaxed text-slate-600 text-center max-w-3xl mx-auto">
          Disclaimer: This application and the NFL picks provided herein are for educational and entertainment purposes only. 
          All information is intended to enhance the fan experience and should not be construed as professional financial or legal advice. 
          We do not offer real-money gambling or sports betting services. Betting involves significant risk, and we are not responsible 
          for any financial losses or damages resulting from the use of the information on this site. If you or someone you know 
          has a gambling problem, please call 1-800-GAMBLER. Must be 21+ to participate in sports wagering.
        </p>
      </footer>
    </div>
  );
};

export default App;