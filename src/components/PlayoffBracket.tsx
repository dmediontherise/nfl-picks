import React, { useEffect, useState } from 'react';
import { Game } from '../types';
import { espnApi } from '../services/espnAdapter';
import { Loader2 } from 'lucide-react';

const PlayoffBracket: React.FC = () => {
    const [rounds, setRounds] = useState<{
        wildCard: Game[];
        divisional: Game[];
        conference: Game[];
        superBowl: Game[];
    } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchBracket = async () => {
            try {
                const [wc, div, conf, sb] = await Promise.all([
                    espnApi.getSchedule(1, 3), // Wild Card
                    espnApi.getSchedule(2, 3), // Divisional
                    espnApi.getSchedule(3, 3), // Conference
                    espnApi.getSchedule(5, 3)  // Super Bowl
                ]);

                setRounds({
                    wildCard: wc.data,
                    divisional: div.data,
                    conference: conf.data,
                    superBowl: sb.data
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

    if (!rounds) return null;

    const renderGame = (game: Game) => {
        const winner = game.status === 'post' 
            ? (game.homeTeam.score || 0) > (game.awayTeam.score || 0) ? game.homeTeam.id : game.awayTeam.id 
            : null;

        return (
            <div key={game.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 w-64 shadow-lg relative z-10">
                 <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider flex justify-between">
                    <span>{new Date(game.date).toLocaleDateString(undefined, {weekday: 'short'})}</span>
                    <span className={game.status === 'in' ? 'text-red-500 font-bold animate-pulse' : ''}>
                        {game.status === 'post' ? 'FINAL' : game.clock}
                    </span>
                 </div>
                 
                 {/* Away */}
                 <div className={`flex justify-between items-center mb-1 ${winner && winner !== game.awayTeam.id ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2">
                        <img src={game.awayTeam.logoUrl} className="w-5 h-5 object-contain" alt="" />
                        <span className="font-bold text-sm truncate w-32">{game.awayTeam.name}</span>
                    </div>
                    <span className="font-mono font-bold">{game.awayTeam.score}</span>
                 </div>

                 {/* Home */}
                 <div className={`flex justify-between items-center ${winner && winner !== game.homeTeam.id ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2">
                        <img src={game.homeTeam.logoUrl} className="w-5 h-5 object-contain" alt="" />
                        <span className="font-bold text-sm truncate w-32">{game.homeTeam.name}</span>
                    </div>
                    <span className="font-mono font-bold">{game.homeTeam.score}</span>
                 </div>
            </div>
        );
    };

    return (
        <div className="overflow-x-auto pb-8">
            <div className="flex gap-12 min-w-max px-8">
                {/* Wild Card */}
                <div className="flex flex-col">
                    <h3 className="text-center text-slate-500 font-bold uppercase tracking-widest mb-6">Wild Card</h3>
                    <div className="flex flex-col justify-around h-full gap-8">
                        {rounds.wildCard.map(renderGame)}
                    </div>
                </div>

                {/* Divisional */}
                <div className="flex flex-col pt-16">
                     <h3 className="text-center text-slate-500 font-bold uppercase tracking-widest mb-6">Divisional</h3>
                     <div className="flex flex-col justify-around h-full gap-16">
                        {rounds.divisional.length > 0 ? rounds.divisional.map(renderGame) : (
                            Array(4).fill(0).map((_, i) => (
                                <div key={i} className="w-64 h-24 border-2 border-dashed border-slate-800 rounded-lg flex items-center justify-center text-slate-600 text-sm">TBD</div>
                            ))
                        )}
                     </div>
                </div>

                {/* Conference */}
                <div className="flex flex-col pt-32">
                    <h3 className="text-center text-slate-500 font-bold uppercase tracking-widest mb-6">Conf Champ</h3>
                    <div className="flex flex-col justify-around h-full gap-32">
                        {rounds.conference.length > 0 ? rounds.conference.map(renderGame) : (
                            Array(2).fill(0).map((_, i) => (
                                <div key={i} className="w-64 h-24 border-2 border-dashed border-slate-800 rounded-lg flex items-center justify-center text-slate-600 text-sm">TBD</div>
                            ))
                        )}
                    </div>
                </div>

                {/* Super Bowl */}
                <div className="flex flex-col pt-64">
                    <h3 className="text-center text-yellow-500 font-bold uppercase tracking-widest mb-6">Super Bowl</h3>
                    <div className="flex flex-col justify-center h-full">
                        {rounds.superBowl.length > 0 ? rounds.superBowl.map(renderGame) : (
                            <div className="w-64 h-24 border-2 border-dashed border-yellow-900/50 rounded-lg flex items-center justify-center text-yellow-700 text-sm font-bold">LIX</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlayoffBracket;