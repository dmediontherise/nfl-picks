import React, { useEffect, useState } from 'react';
import { Game, Team } from '../types';
import { TEAMS } from '../data/nfl_data';
import { espnApi } from '../services/espnAdapter';
import { Loader2, Shield, Trophy, GitCommit } from 'lucide-react';

const AFC_TEAMS = ['BAL', 'BUF', 'CIN', 'CLE', 'DEN', 'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LV', 'MIA', 'NE', 'NYJ', 'PIT', 'TEN'];

const getConference = (teamAbbr: string) => AFC_TEAMS.includes(teamAbbr) ? 'AFC' : 'NFC';

const getSeeds = (conf: 'AFC' | 'NFC') => {
    const confTeams = Object.values(TEAMS).filter(t => getConference(t.abbreviation) === conf);
    // Sort by wins (descending)
    return confTeams.sort((a, b) => {
        const winsA = parseInt(a.record?.split(/[- ]/)[0] || "0");
        const winsB = parseInt(b.record?.split(/[- ]/)[0] || "0");
        return winsB - winsA;
    });
};

const PlayoffBracket: React.FC = () => {
    const [bracket, setBracket] = useState<{
        afc: { wc: Game[], div: Game[], conf: Game | null, seed1: Team },
        nfc: { wc: Game[], div: Game[], conf: Game | null, seed1: Team },
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

                const filterConf = (games: Game[], conf: 'AFC' | 'NFC') => 
                    games.filter(g => getConference(g.homeTeam.abbreviation) === conf);

                setBracket({
                    afc: {
                        wc: filterConf(wc.data, 'AFC'),
                        div: filterConf(div.data, 'AFC'),
                        conf: filterConf(conf.data, 'AFC')[0] || null,
                        seed1: getSeeds('AFC')[0]
                    },
                    nfc: {
                        wc: filterConf(wc.data, 'NFC'),
                        div: filterConf(div.data, 'NFC'),
                        conf: filterConf(conf.data, 'NFC')[0] || null,
                        seed1: getSeeds('NFC')[0]
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

    const GameCard = ({ game, placeholder, teamOverride }: { game?: Game | null, placeholder: string, teamOverride?: Team }) => {
        if (teamOverride) {
             return (
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 w-64 shadow-lg relative z-10 flex items-center gap-3">
                    <div className="bg-green-500/20 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded absolute top-2 right-2">BYE</div>
                    <img src={teamOverride.logoUrl} className="w-10 h-10 object-contain" alt="" />
                    <div>
                        <div className="font-bold text-white text-sm">#{1} {teamOverride.name}</div>
                        <div className="text-[10px] text-slate-500">Waiting for Lowest Seed</div>
                    </div>
                </div>
             );
        }

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

    const ConferenceColumn = ({ title, games, color, conf, seed1 }: { title: string, games: any, color: string, conf: string, seed1: Team }) => (
        <div className="flex flex-col gap-8 min-w-max">
            <h3 className={`text-center font-black text-2xl uppercase tracking-tighter mb-4 ${color} flex items-center justify-center gap-2`}>
                <Shield className="w-6 h-6" /> {title}
            </h3>
            
            <div className="flex gap-8 items-start">
                {/* Wild Card Column */}
                <div className="flex flex-col gap-4">
                    <div className="text-center text-xs font-bold text-slate-500 uppercase mb-2">Wild Card</div>
                    {games.wc.length > 0 ? games.wc.map((g: Game) => (
                        <div key={g.id}>
                            <GameCard game={g} placeholder="" />
                            <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-500 px-2">
                                <GitCommit className="w-3 h-3" />
                                <span>Winner → Div Round (Reseeded)</span>
                            </div>
                        </div>
                    )) : 
                        [1,2,3].map(i => <GameCard key={i} placeholder={`${conf} Wild Card ${i}`} />)
                    }
                </div>

                <div className="w-8 h-px bg-slate-700 hidden md:block mt-16"></div>

                {/* Divisional Column */}
                <div className="flex flex-col gap-8 mt-8">
                     <div className="text-center text-xs font-bold text-slate-500 uppercase mb-2">Divisional</div>
                     {/* 1 Seed BYE Slot */}
                     <GameCard placeholder="1 Seed Bye" teamOverride={seed1} />
                     
                     {games.div.length > 0 ? games.div.map((g: Game) => <GameCard key={g.id} game={g} placeholder="" />) :
                        [1].map(i => <GameCard key={i} placeholder={`${conf} Divisional Matchup`} />)
                     }
                </div>

                <div className="w-8 h-px bg-slate-700 hidden md:block mt-16"></div>

                {/* Conference Championship */}
                <div className="flex flex-col justify-center h-full pt-16">
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
                <ConferenceColumn title="AFC" games={bracket.afc} color="text-red-500" conf="AFC" seed1={bracket.afc.seed1} />
                
                {/* NFC Bracket */}
                <ConferenceColumn title="NFC" games={bracket.nfc} color="text-blue-500" conf="NFC" seed1={bracket.nfc.seed1} />

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