import { Game, UserPrediction } from '../types';

export const downloadPredictionsAsCSV = (schedule: Game[], predictions: Record<string, UserPrediction>) => {
  // 1. Define Headers
  const headers = [
    "Week", 
    "Date", 
    "Matchup", 
    "Away Team", 
    "Home Team", 
    "Predicted Winner", 
    "Predicted Score (Away)", 
    "Predicted Score (Home)", 
    "Spread", 
    "Total"
  ];

  // 2. Generate Rows
  const rows = schedule.map(game => {
    const pred = predictions[game.id];
    const away = game.awayTeam.abbreviation;
    const home = game.homeTeam.abbreviation;
    
    return [
      `Week ${game.week}`,
      `"${game.date}"`,
      `${away} @ ${home}`,
      game.awayTeam.name,
      game.homeTeam.name,
      pred ? pred.predictedWinner : "N/A",
      pred ? pred.awayScore : "N/A",
      pred ? pred.homeScore : "N/A",
      game.bettingData?.spread || "N/A",
      game.bettingData?.total || "N/A"
    ].join(",");
  });

  // 3. Combine into CSV Content
  const csvContent = [headers.join(","), ...rows].join("\n");

  // 4. Trigger Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "Medi_Jinx_Predictions_Week_16.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
