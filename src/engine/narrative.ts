import { Prediction, Narrative, Citation, NarrativeContext } from './types';

export type { NarrativeContext, Citation, Narrative };

export function formatPossessive(name: string): string {
  if (!name) return name;
  const trimmed = name.trim();
  if (trimmed.endsWith('s') || trimmed.endsWith('S')) {
    return `${trimmed}'`;
  }
  return `${trimmed}'s`;
}

export function getDriverHumanizedName(driverKey: string, homeName: string, awayName: string): string {
  if (driverKey === 'home_massey_rating') {
    return `${formatPossessive(homeName)} overall power rating`;
  }
  if (driverKey === 'away_massey_rating') {
    return `${formatPossessive(awayName)} opponent power rating`;
  }
  if (driverKey === 'home_field_advantage') {
    return `the venue advantage for ${homeName}`;
  }
  if (driverKey === 'roster_injury_modifier') {
    return `the roster availability adjustment for ${homeName}`;
  }
  return `the primary rating factor`;
}

export interface DriverPhrasing {
  formatPrimary: (home: string, away: string, mag: number) => string;
  formatSecondary: (home: string, away: string, mag: number) => string;
}

export const DRIVER_PHRASINGS: Record<string, DriverPhrasing> = {
  home_massey_rating: {
    formatPrimary: (home, away, mag) =>
      `${formatPossessive(home)} baseline power index supplies ${mag.toFixed(1)} points of rating support against ${away}.`,
    formatSecondary: (home, away, mag) =>
      `${formatPossessive(home)} power index adds a secondary strength factor of ${mag.toFixed(1)} points facing ${away}.`
  },
  away_massey_rating: {
    formatPrimary: (home, away, mag) =>
      `${formatPossessive(away)} opponent rating profile holds an evaluation magnitude of ${mag.toFixed(1)} points facing ${home}.`,
    formatSecondary: (home, away, mag) =>
      `${formatPossessive(away)} opponent rating adds a secondary strength factor of ${mag.toFixed(1)} points against ${home}.`
  },
  home_field_advantage: {
    formatPrimary: (home, away, mag) =>
      `Playing at home grants ${home} a venue edge of ${mag.toFixed(1)} points over ${away}.`,
    formatSecondary: (home, away, mag) =>
      `Venue advantage contributes ${mag.toFixed(1)} points to the home expectation for ${home} facing ${away}.`
  },
  roster_injury_modifier: {
    formatPrimary: (home, away, mag) =>
      `Roster availability adjustments indicate a net availability impact of ${mag.toFixed(1)} points for ${home} against ${away}.`,
    formatSecondary: (home, away, mag) =>
      `Roster availability adjustments provide an adjustment factor of ${mag.toFixed(1)} points for ${home} facing ${away}.`
  }
};

export interface SentenceStrategy {
  key: string;
  description: string;
  matches: (prediction: Prediction, context: NarrativeContext) => boolean;
  generate: (prediction: Prediction, context: NarrativeContext) => { text: string; citations: Citation[] };
}

export const STRATEGIES: Record<string, SentenceStrategy> = {
  dominant_driver_lead: {
    key: 'dominant_driver_lead',
    description: 'Lead narrative with dominant driver when top driver >= 60% of total magnitude',
    matches: (p) => {
      const sorted = [...p.drivers].sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude));
      const sum = sorted.reduce((acc, d) => acc + Math.abs(d.magnitude), 0);
      return sorted[0] && sum > 0 ? (Math.abs(sorted[0].magnitude) / sum) >= 0.60 : false;
    },
    generate: (p, c) => ({ text: '', citations: [] })
  },
  market_disagreement: {
    key: 'market_disagreement',
    description: 'Explicit disagreement beat when spread edge >= 3.0 points',
    matches: (p) => p.spreadPick.edge >= 3.0,
    generate: (p, c) => ({ text: '', citations: [] })
  },
  low_confidence_uncertainty: {
    key: 'low_confidence_uncertainty',
    description: 'Uncertainty beat when confidence < 55%',
    matches: (p) => p.confidence < 55.0,
    generate: (p, c) => ({ text: '', citations: [] })
  },
  total_edge_omission: {
    key: 'total_edge_omission',
    description: 'Omit total beat when total edge < 1.0 point',
    matches: (p) => p.totalPick.edge < 1.0,
    generate: (p, c) => ({ text: '', citations: [] })
  },
  standard_lede: {
    key: 'standard_lede',
    description: 'Standard scoreline lead strategy',
    matches: (p) => true,
    generate: (p, c) => ({ text: '', citations: [] })
  },
  high_confidence: {
    key: 'high_confidence',
    description: 'High confidence beat when confidence >= 80%',
    matches: (p) => p.confidence >= 80.0,
    generate: (p, c) => ({ text: '', citations: [] })
  },
  calibrated_confidence: {
    key: 'calibrated_confidence',
    description: 'Standard confidence beat',
    matches: (p) => p.confidence >= 55.0 && p.confidence < 80.0,
    generate: (p, c) => ({ text: '', citations: [] })
  },
  home_massey_driver: {
    key: 'home_massey_driver',
    description: 'Home power rating driver strategy',
    matches: (p) => p.drivers.some(d => d.key === 'home_massey_rating'),
    generate: (p, c) => ({ text: '', citations: [] })
  },
  away_massey_driver: {
    key: 'away_massey_driver',
    description: 'Away opponent rating driver strategy',
    matches: (p) => p.drivers.some(d => d.key === 'away_massey_rating'),
    generate: (p, c) => ({ text: '', citations: [] })
  },
  venue_advantage_driver: {
    key: 'venue_advantage_driver',
    description: 'Home field advantage driver strategy',
    matches: (p, c) => !c.isNeutralSite && p.drivers.some(d => d.key === 'home_field_advantage'),
    generate: (p, c) => ({ text: '', citations: [] })
  }
};

export function buildNarrative(prediction: Prediction, context: NarrativeContext): Narrative {
  const homeName = context.homeTeamName;
  const awayName = context.awayTeamName;

  // Requirement 1 & 2: Winner resolution is independent of optional context abbrs
  const homeWon = prediction.margin > 0 || prediction.homeScore > prediction.awayScore;
  const winnerName = homeWon ? homeName : awayName;
  const loserName = homeWon ? awayName : homeName;
  const winScore = homeWon ? prediction.homeScore : prediction.awayScore;
  const loseScore = homeWon ? prediction.awayScore : prediction.homeScore;

  const marginAbs = Math.abs(prediction.margin);
  const marginStr = marginAbs.toFixed(1);
  const confStr = prediction.confidence.toFixed(1);

  const sortedDrivers = [...prediction.drivers].sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude));
  const sumAbsDrivers = sortedDrivers.reduce((sum, d) => sum + Math.abs(d.magnitude), 0);
  const topDriver = sortedDrivers[0];

  const isDominantDriver = topDriver && sumAbsDrivers > 0 && (Math.abs(topDriver.magnitude) / sumAbsDrivers) >= 0.60;

  const beats: string[] = [];
  const sentences: string[] = [];
  const citations: Citation[] = [];

  let currentSentenceIndex = 0;

  // Beat 1: Dominant Driver Lead OR Standard Lede
  if (isDominantDriver) {
    beats.push('dominant_driver_lead');
    const phrasing = DRIVER_PHRASINGS[topDriver.key];
    const driverSentence = phrasing
      ? phrasing.formatPrimary(homeName, awayName, topDriver.magnitude)
      : `${topDriver.label} supplies ${topDriver.magnitude.toFixed(1)} points of rating support against ${awayName}.`;

    const humanizedName = getDriverHumanizedName(topDriver.key, homeName, awayName);
    sentences.push(`Model projections for ${winnerName} (${winScore}) over ${loserName} (${loseScore}) are led by ${humanizedName}.`);
    citations.push(
      { sentenceIndex: currentSentenceIndex, driverKey: 'home_score', value: prediction.homeScore },
      { sentenceIndex: currentSentenceIndex, driverKey: 'away_score', value: prediction.awayScore }
    );
    currentSentenceIndex++;

    sentences.push(driverSentence);
    citations.push(
      { sentenceIndex: currentSentenceIndex, driverKey: topDriver.key, value: topDriver.magnitude }
    );
    currentSentenceIndex++;
  } else {
    // Beat 1: Standard Lede
    beats.push('standard_lede');
    let ledeText = "";
    if (marginAbs >= 10.0) {
      ledeText = `The decision engine projects a commanding victory for ${winnerName} (${winScore}) over ${loserName} (${loseScore}).`;
    } else if (marginAbs < 7.0) {
      ledeText = `Metrics forecast a tight one-score contest with ${winnerName} (${winScore}) edging ${loserName} (${loseScore}).`;
    } else {
      ledeText = `Model calculations favor ${winnerName} (${winScore}) over ${loserName} (${loseScore}) in expected execution.`;
    }
    sentences.push(ledeText);
    citations.push(
      { sentenceIndex: currentSentenceIndex, driverKey: 'home_score', value: prediction.homeScore },
      { sentenceIndex: currentSentenceIndex, driverKey: 'away_score', value: prediction.awayScore }
    );
    currentSentenceIndex++;
  }

  // Confidence level (Uncertainty vs High vs Standard)
  if (prediction.confidence < 55.0) {
    beats.push('uncertainty');
    sentences.push(`Projected margin for ${winnerName} stands at ${marginStr} points with an uncertain, elevated-variance confidence rating of ${confStr}%.`);
    citations.push(
      { sentenceIndex: currentSentenceIndex, driverKey: 'margin', value: marginAbs },
      { sentenceIndex: currentSentenceIndex, driverKey: 'confidence', value: prediction.confidence }
    );
    currentSentenceIndex++;
  } else if (prediction.confidence >= 80.0) {
    beats.push('high_confidence');
    sentences.push(`Projected margin for ${winnerName} reaches ${marginStr} points backed by a robust confidence score of ${confStr}%.`);
    citations.push(
      { sentenceIndex: currentSentenceIndex, driverKey: 'margin', value: marginAbs },
      { sentenceIndex: currentSentenceIndex, driverKey: 'confidence', value: prediction.confidence }
    );
    currentSentenceIndex++;
  } else {
    beats.push('confidence');
    sentences.push(`Projected margin for ${winnerName} maps to ${marginStr} points with a calibrated confidence score of ${confStr}%.`);
    citations.push(
      { sentenceIndex: currentSentenceIndex, driverKey: 'margin', value: marginAbs },
      { sentenceIndex: currentSentenceIndex, driverKey: 'confidence', value: prediction.confidence }
    );
    currentSentenceIndex++;
  }

  // Driver Primary (if not already led by dominant driver)
  if (!isDominantDriver && topDriver) {
    beats.push('driver_primary');
    const phrasing = DRIVER_PHRASINGS[topDriver.key];
    const sText = phrasing
      ? phrasing.formatPrimary(homeName, awayName, topDriver.magnitude)
      : `${topDriver.label} supplies ${topDriver.magnitude.toFixed(1)} points of rating support against ${awayName}.`;
    sentences.push(sText);
    citations.push({ sentenceIndex: currentSentenceIndex, driverKey: topDriver.key, value: topDriver.magnitude });
    currentSentenceIndex++;
  }

  // Secondary Driver
  const d1 = sortedDrivers[1];
  if (d1) {
    beats.push('driver_secondary');
    const phrasing = DRIVER_PHRASINGS[d1.key];
    const sText = phrasing
      ? phrasing.formatSecondary(homeName, awayName, d1.magnitude)
      : `${d1.label} supplies an additional ${d1.magnitude.toFixed(1)} points to the rating matrix for ${homeName} facing ${awayName}.`;
    sentences.push(sText);
    citations.push({ sentenceIndex: currentSentenceIndex, driverKey: d1.key, value: d1.magnitude });
    currentSentenceIndex++;
  } else {
    beats.push('driver_secondary_fallback');
    sentences.push(`Secondary evaluation parameters confirm overall baseline alignment for ${homeName} facing ${awayName}.`);
    currentSentenceIndex++;
  }

  // Tertiary Driver / Squad Health Fallback
  const d2 = sortedDrivers[2];
  if (d2) {
    beats.push('driver_tertiary');
    const phrasing = DRIVER_PHRASINGS[d2.key];
    const sText = phrasing
      ? phrasing.formatSecondary(homeName, awayName, d2.magnitude)
      : `${d2.label} provides an additional ${d2.magnitude.toFixed(1)} points of adjustment for ${homeName} facing ${awayName}.`;
    sentences.push(sText);
    citations.push({ sentenceIndex: currentSentenceIndex, driverKey: d2.key, value: d2.magnitude });
    currentSentenceIndex++;
  } else {
    beats.push('driver_tertiary_fallback');
    const hasInjury = prediction.drivers.some(d => d.key === 'roster_injury_modifier');
    if (!hasInjury) {
      sentences.push(`Squad availability metrics reflect complete squad health for both ${homeName} and ${awayName}.`);
    } else {
      sentences.push(`Tertiary evaluation metrics confirm overall rating alignment for ${homeName} facing ${awayName}.`);
    }
    currentSentenceIndex++;
  }

  // Market Disagreement Beat vs Standard ATS Pick
  const spreadEdge = prediction.spreadPick.edge;
  const spreadLine = prediction.spreadPick.line;
  const spreadLineStr = spreadLine >= 0 ? `+${spreadLine.toFixed(1)}` : spreadLine.toFixed(1);
  const spreadEdgeStr = spreadEdge.toFixed(1);

  if (spreadEdge >= 3.0) {
    beats.push('market_disagreement');
    sentences.push(`On the spread, metrics highlight strong contrarian disagreement on ${prediction.spreadPick.team} at ${spreadLineStr} with a notable edge of ${spreadEdgeStr} points.`);
    citations.push(
      { sentenceIndex: currentSentenceIndex, driverKey: 'spread_line', value: Math.abs(spreadLine) },
      { sentenceIndex: currentSentenceIndex, driverKey: 'spread_edge', value: spreadEdge }
    );
    currentSentenceIndex++;
  } else if (spreadEdge >= 1.0) {
    beats.push('ats_pick');
    sentences.push(`Against the spread in ${homeName} vs ${awayName}, the model favors ${prediction.spreadPick.team} at ${spreadLineStr} with an edge of ${spreadEdgeStr} points.`);
    citations.push(
      { sentenceIndex: currentSentenceIndex, driverKey: 'spread_line', value: Math.abs(spreadLine) },
      { sentenceIndex: currentSentenceIndex, driverKey: 'spread_edge', value: spreadEdge }
    );
    currentSentenceIndex++;
  }

  // Total Pick Beat (Omitted when edge < 1.0)
  const totalEdge = prediction.totalPick.edge;
  if (totalEdge >= 1.0) {
    beats.push('total_pick');
    const totalLineStr = prediction.totalPick.line.toFixed(1);
    const totalProjStr = prediction.totalPick.projected.toFixed(1);
    sentences.push(`For the game total, the model recommends ${prediction.totalPick.side.toUpperCase()} ${totalLineStr} based on a projected total of ${totalProjStr} points in ${homeName} vs ${awayName}.`);
    citations.push(
      { sentenceIndex: currentSentenceIndex, driverKey: 'total_line', value: prediction.totalPick.line },
      { sentenceIndex: currentSentenceIndex, driverKey: 'total_projected', value: prediction.totalPick.projected }
    );
    currentSentenceIndex++;
  }

  const text = sentences.join(' ');

  return {
    beats,
    sentences,
    text,
    citations
  };
}
