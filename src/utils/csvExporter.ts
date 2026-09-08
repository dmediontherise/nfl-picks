import { Game, UserPrediction } from '../types';

export function determineGameVerdict(
  pred: UserPrediction | undefined,
  homeScore?: number,
  awayScore?: number,
  homeName?: string,
  awayName?: string
): string {
  if (!pred) return 'N/A';
  if (homeScore === undefined || awayScore === undefined || !homeName || !awayName) {
    return 'Pending';
  }

  const actualWinner = homeScore > awayScore ? homeName : (awayScore > homeScore ? awayName : 'Tie');
  const userHit = pred.userPredictedWinner === actualWinner;
  const appHit = pred.predictedWinner === actualWinner;

  if (pred.agreementState === 'deviated') {
    if (userHit && !appHit) return 'User Won';
    if (appHit && !userHit) return 'AI Won';
    if (userHit && appHit) return 'Both Won';
    return 'Both Missed';
  }

  return appHit ? 'Agreed (Won)' : 'Agreed (Missed)';
}

export function generateCSVContent(
  schedule: Game[],
  predictions: Record<string, UserPrediction>,
  results?: Record<string, any>
): string {
  const headers = [
    "Week", 
    "Date", 
    "Matchup", 
    "Away Team", 
    "Home Team",
    "Agreement State",
    "Verdict",
    "App Winner", 
    "App Score (Away)", 
    "App Score (Home)", 
    "User Winner",
    "User Score (Away)",
    "User Score (Home)",
    "Actual Score (Away)",
    "Actual Score (Home)",
    "Spread", 
    "Total"
  ];

  const rows = schedule.map(game => {
    const pred = predictions[game.id];
    const res = results ? results[game.id] : undefined;
    const away = game.awayTeam.abbreviation;
    const home = game.homeTeam.abbreviation;

    const finalHomeScore = res?.homeScore ?? game.homeTeam.score;
    const finalAwayScore = res?.awayScore ?? game.awayTeam.score;
    const finalHomeName = res?.homeName ?? game.homeTeam.name;
    const finalAwayName = res?.awayName ?? game.awayTeam.name;

    const agreementState = pred?.agreementState || (pred ? 'unset' : 'N/A');
    const verdict = determineGameVerdict(pred, finalHomeScore, finalAwayScore, finalHomeName, finalAwayName);

    return [
      `Week ${game.week}`,
      `"${new Date(game.date).toLocaleDateString()}"`,
      `${away} @ ${home}`,
      `"${game.awayTeam.name}"`,
      `"${game.homeTeam.name}"`,
      agreementState,
      verdict,
      pred ? `"${pred.predictedWinner}"` : "N/A",
      pred ? pred.awayScore : "N/A",
      pred ? pred.homeScore : "N/A",
      pred && pred.userPredictedWinner ? `"${pred.userPredictedWinner}"` : "N/A",
      pred && pred.userAwayScore ? pred.userAwayScore : "N/A",
      pred && pred.userHomeScore ? pred.userHomeScore : "N/A",
      finalAwayScore !== undefined ? finalAwayScore : "N/A",
      finalHomeScore !== undefined ? finalHomeScore : "N/A",
      game.bettingData?.spread ? `"${game.bettingData.spread}"` : "N/A",
      game.bettingData?.total !== undefined ? game.bettingData.total : "N/A"
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export const downloadPredictionsAsCSV = (
  schedule: Game[],
  predictions: Record<string, UserPrediction>,
  results?: Record<string, any>
) => {
  const csvContent = generateCSVContent(schedule, predictions, results);

  // Trigger Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "Medi_Picks_Predictions.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
