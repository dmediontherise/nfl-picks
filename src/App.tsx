import React, { useState, useEffect } from 'react';
import AnalysisModal from './temp_app';
import { UserPrediction, Game } from './types';
import { espnApi } from './services/espnAdapter';
import { downloadPredictionsAsCSV } from './utils/csvExporter';
import { Calendar, MapPin, ChevronRight, RefreshCw, Server, Loader2, Download } from 'lucide-react';

const App: React.FC = () => {
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [userPredictions, setUserPredictions] = useState<Record<string, UserPrediction>>({});
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
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
    console.log("Prediction saved:", prediction);
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
              MEDI JINX <span className="text-blue-500">2025</span>
              {meta && (
                <span className="text-[10px] bg-red-600/20 text-red-400 px-2 py-0.5 rounded border border-red-600/30 font-mono tracking-widest animate-pulse">
                  {meta.status}
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400 font-medium tracking-wide uppercase flex items-center gap-2 mt-1">
              Week {meta?.week || 16} • {meta?.season || 2025} Season
              <span className="text-slate-600">|</span>
              <Server className="w-3 h-3 text-slate-500" />
              <span className="text-slate-500">Source: {meta?.source || "ESPN_API"}</span>
            </p>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-bold text-slate-300 hidden md:block">
              {Object.keys(userPredictions).length} / {games.length} Picked
            </div>
             
             <button 
               onClick={handleDownload}
               className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-xs font-bold shadow-lg shadow-blue-900/20 active:scale-95"
               title="Download Predictions CSV"
             >
               <Download className="w-4 h-4" />
               <span className="hidden sm:inline">Export Picks</span>
             </button>

             <div className="w-px h-6 bg-slate-700 mx-1"></div>

             <button 
               onClick={fetchData}
               className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors border border-slate-700 text-slate-400 hover:text-white"
               title="Refresh Live Data"
             >
               <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="text-slate-400 animate-pulse text-sm uppercase tracking-widest">Connecting to ESPN Satellite...</p>
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
                    <div className="absolute top-2 right-2 bg-green-500/20 border border-green-500/50 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm z-10">
                      PICK LOCKED
                    </div>
                  )}

                  {/* Date & Venue */}
                  <div className="px-4 py-3 bg-slate-950/50 border-b border-slate-800 flex justify-between items-center text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {game.date.split('•')[0]}
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {game.venue.split(' ')[0]}...
                    </div>
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
                      {prediction && (
                        <span className="text-xl font-mono font-bold text-slate-300">{prediction.awayScore}</span>
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
                      {prediction && (
                        <span className="text-xl font-mono font-bold text-slate-300">{prediction.homeScore}</span>
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

      {/* Modal Layer */}
      {selectedGame && (
        <AnalysisModal 
          game={selectedGame} 
          onClose={() => setSelectedGame(null)} 
          userPrediction={userPredictions[selectedGame.id]}
          onSavePrediction={handleSavePrediction}
        />
      )}
    </div>
  );
};

export default App;