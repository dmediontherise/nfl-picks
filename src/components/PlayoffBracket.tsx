import React, { useEffect, useState } from 'react';
import { Game } from '../types';
import { espnApi } from '../services/espnAdapter';
import { Loader2, Shield, Trophy } from 'lucide-react';

const AFC_TEAMS = ['BAL', 'BUF', 'CIN', 'CLE', 'DEN', 'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LV', 'MIA', 'NE', 'NYJ', 'PIT', 'TEN'];

const getConference = (teamAbbr: string) => AFC_TEAMS.includes(teamAbbr) ? 'AFC' : 'NFC';

const PlayoffBracket: React.FC = () => {
    const [bracket, setBracket] = useState<{
        afc: { wc: Game[], div: Game[], conf: Game | null },
        nfc: { wc: Game[], div: Game[], conf: Game | null },
        sb: Game | null
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

                // Helper to filter games by conference (checking home team)
                const filterConf = (games: Game[], conf: 'AFC' | 'NFC') => 
                    games.filter(g => getConference(g.homeTeam.abbreviation) === conf);

                setBracket({
                    afc: {
                        wc: filterConf(wc.data, 'AFC'),
                        div: filterConf(div.data, 'AFC'),
                        conf: filterConf(conf.data, 'AFC')[0] || null
                    },
                    nfc: {
                        wc: filterConf(wc.data, 'NFC'),
                        div: filterConf(div.data, 'NFC'),
                        conf: filterConf(conf.data, 'NFC')[0] || null
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

    if (!bracket) return null;

    const GameCard = ({ game, placeholder }: { game?: Game | null, placeholder: string }) => {
        if (!game) {
            return (
                <div className="bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-lg p-4 w-64 h-24 flex items-center justify-center text-slate-600 font-bold uppercase tracking-wider text-xs">
                    {placeholder}
                </div>
            );
        }

        const winner = game.status === 'post' 
            ? (game.homeTeam.score || 0) > (game.awayTeam.score || 0) ? game.homeTeam.id : game.awayTeam.id 
            : null;

        return (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 w-64 shadow-lg relative z-10 transition-transform hover:scale-105">
                 <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider flex justify-between">
                    <span>{new Date(game.date).toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'})}</span>
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
                    <span className="font-mono font-bold text-white">{game.awayTeam.score}</span>
                 </div>

                 {/* Home */}
                 <div className={`flex justify-between items-center ${winner && winner !== game.homeTeam.id ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2">
                        <img src={game.homeTeam.logoUrl} className="w-5 h-5 object-contain" alt="" />
                        <span className="font-bold text-sm truncate w-32">{game.homeTeam.name}</span>
                    </div>
                    <span className="font-mono font-bold text-white">{game.homeTeam.score}</span>
                 </div>
            </div>
        );
    };

    const ConferenceColumn = ({ title, games, color, conf }: { title: string, games: any, color: string, conf: string }) => (
        <div className="flex flex-col gap-8 min-w-max">
            <h3 className={`text-center font-black text-2xl uppercase tracking-tighter mb-4 ${color} flex items-center justify-center gap-2`}>
                <Shield className="w-6 h-6" /> {title}
            </h3>
            
            <div className="flex gap-8 items-center">
                {/* Wild Card Column */}
                <div className="flex flex-col gap-4">
                    <div className="text-center text-xs font-bold text-slate-500 uppercase mb-2">Wild Card</div>
                    {games.wc.length > 0 ? games.wc.map((g: Game) => <GameCard key={g.id} game={g} placeholder="" />) : 
                        [1,2,3].map(i => <GameCard key={i} placeholder={`${conf} Wild Card ${i}`} />)
                    }
                </div>

                <div className="w-8 h-px bg-slate-700 hidden md:block"></div>

                {/* Divisional Column */}
                <div className="flex flex-col gap-16">
                     <div className="text-center text-xs font-bold text-slate-500 uppercase mb-2">Divisional</div>
                     {games.div.length > 0 ? games.div.map((g: Game) => <GameCard key={g.id} game={g} placeholder="" />) :
                        [1,2].map(i => <GameCard key={i} placeholder={`${conf} Divisional ${i}`} />)
                     }
                </div>

                <div className="w-8 h-px bg-slate-700 hidden md:block"></div>

                {/* Conference Championship */}
                <div className="flex flex-col justify-center h-full pt-8">
                    <div className="text-center text-xs font-bold text-slate-500 uppercase mb-2">Championship</div>
                    <GameCard game={games.conf} placeholder={`${conf} Championship`} />
                </div>
            </div>
        </div>
    );

    return (
        <div className="overflow-x-auto pb-8 px-4">
            <div className="flex flex-col gap-16">
                {/* AFC Bracket */}
                <ConferenceColumn title="AFC" games={bracket.afc} color="text-red-500" conf="AFC" />
                
                {/* NFC Bracket */}
                <ConferenceColumn title="NFC" games={bracket.nfc} color="text-blue-500" conf="NFC" />

                {/* Super Bowl */}
                <div className="border-t border-slate-800 pt-12 flex flex-col items-center">
                    <h3 className="text-center font-black text-3xl text-yellow-500 uppercase tracking-widest mb-8 flex items-center gap-3">
                        <Trophy className="w-8 h-8" /> Super Bowl LIX
                    </h3>
                    <GameCard game={bracket.sb} placeholder="Super Bowl LIX" />
                </div>
            </div>
        </div>
    );
};

export default PlayoffBracket;