import { Game, PredictionResult, SpreadPick } from './models/types';
import { predictMassey } from './models/massey';
import { NFLTeamAbbreviation } from '../src/data/teamStats';

// A-priori shrinkage constants and coefficients - NONE tuned on 2024 or 2025 outcomes
export const M1_K_PASS = 150; // Dropbacks to 50% shrinkage
export const M1_K_RUSH = 100; // Carries to 50% shrinkage
export const M1_W_PASS = 0.65; // Play weight for passing
export const M1_W_RUSH = 0.35; // Play weight for rushing
export const M1_SCALE = 15.0; // Margin scaling factor (~15 plays leverage)

export const M2_K_SCHEME = 100; // Prior-season blend weight constant (plays)
export const M2_SCALE = 10.0; // Scheme margin scaling factor

export const M3_K_RZ = 30; // Red-zone trips heavy shrinkage (~10 games equivalent)
export const M3_SCALE = 1.5; // Red-zone margin multiplier (points differential)

export interface TeamUnitCumulative {
  passOffPlays: number;
  passOffEpa: number;
  rushOffPlays: number;
  rushOffEpa: number;
  passDefPlays: number;
  passDefEpa: number;
  rushDefPlays: number;
  rushDefEpa: number;

  // Scheme - Man/Zone pass plays
  passManOffPlays: number;
  passManOffEpa: number;
  passZoneOffPlays: number;
  passZoneOffEpa: number;

  passManDefPlays: number;
  passZoneDefPlays: number;
  passCover2DefPlays: number;
  passCover3DefPlays: number;
  passDefTotalCharted: number;

  // Personnel & Fronts
  p11OffPlays: number;
  p11OffEpa: number;
  p12OffPlays: number;
  p12OffEpa: number;
  offTotalPersonnelCharted: number;

  nickelDefPlays: number;
  baseDefPlays: number;
  defTotalFrontCharted: number;

  // Red Zone
  rzOffTrips: number;
  rzOffPoints: number; // TD=7, FG=3
  rzDefTrips: number;
  rzDefPoints: number;
}

export interface SeasonCumulativeState {
  teams: Record<string, TeamUnitCumulative>;
  league: {
    passPlays: number;
    passEpa: number;
    rushPlays: number;
    rushEpa: number;
    rzTrips: number;
    rzPoints: number;
  };
}

export function createEmptyCumulativeState(): SeasonCumulativeState {
  return {
    teams: {},
    league: {
      passPlays: 0,
      passEpa: 0,
      rushPlays: 0,
      rushEpa: 0,
      rzTrips: 0,
      rzPoints: 0,
    },
  };
}

export function getOrCreateTeamStats(state: SeasonCumulativeState, team: string): TeamUnitCumulative {
  if (!state.teams[team]) {
    state.teams[team] = {
      passOffPlays: 0,
      passOffEpa: 0,
      rushOffPlays: 0,
      rushOffEpa: 0,
      passDefPlays: 0,
      passDefEpa: 0,
      rushDefPlays: 0,
      rushDefEpa: 0,
      passManOffPlays: 0,
      passManOffEpa: 0,
      passZoneOffPlays: 0,
      passZoneOffEpa: 0,
      passManDefPlays: 0,
      passZoneDefPlays: 0,
      passCover2DefPlays: 0,
      passCover3DefPlays: 0,
      passDefTotalCharted: 0,
      p11OffPlays: 0,
      p11OffEpa: 0,
      p12OffPlays: 0,
      p12OffEpa: 0,
      offTotalPersonnelCharted: 0,
      nickelDefPlays: 0,
      baseDefPlays: 0,
      defTotalFrontCharted: 0,
      rzOffTrips: 0,
      rzOffPoints: 0,
      rzDefTrips: 0,
      rzDefPoints: 0,
    };
  }
  return state.teams[team];
}

/**
 * Calculates candidate M1 (Unit Efficiency) margin adjustment.
 */
export function calculateM1Adjustment(
  homeTeam: string,
  awayTeam: string,
  state: SeasonCumulativeState
): number {
  const h = getOrCreateTeamStats(state, homeTeam);
  const a = getOrCreateTeamStats(state, awayTeam);

  const lPassEpa = state.league.passPlays > 0 ? state.league.passEpa / state.league.passPlays : 0.05;
  const lRushEpa = state.league.rushPlays > 0 ? state.league.rushEpa / state.league.rushPlays : -0.05;

  const hPassOffEpa = h.passOffPlays > 0 ? h.passOffEpa / h.passOffPlays : lPassEpa;
  const hRushOffEpa = h.rushOffPlays > 0 ? h.rushOffEpa / h.rushOffPlays : lRushEpa;
  const aPassDefEpa = a.passDefPlays > 0 ? a.passDefEpa / a.passDefPlays : lPassEpa;
  const aRushDefEpa = a.rushDefPlays > 0 ? a.rushDefEpa / a.rushDefPlays : lRushEpa;

  const aPassOffEpa = a.passOffPlays > 0 ? a.passOffEpa / a.passOffPlays : lPassEpa;
  const aRushOffEpa = a.rushOffPlays > 0 ? a.rushOffEpa / a.rushOffPlays : lRushEpa;
  const hPassDefEpa = h.passDefPlays > 0 ? h.passDefEpa / h.passDefPlays : lPassEpa;
  const hRushDefEpa = h.rushDefPlays > 0 ? h.rushDefEpa / h.rushDefPlays : lRushEpa;

  // Shrinkage factors n / (n + k)
  const sHPassOff = h.passOffPlays / (h.passOffPlays + M1_K_PASS);
  const sHRushOff = h.rushOffPlays / (h.rushOffPlays + M1_K_RUSH);
  const sAPassDef = a.passDefPlays / (a.passDefPlays + M1_K_PASS);
  const sARushDef = a.rushDefPlays / (a.rushDefPlays + M1_K_RUSH);

  const sAPassOff = a.passOffPlays / (a.passOffPlays + M1_K_PASS);
  const sARushOff = a.rushOffPlays / (a.rushOffPlays + M1_K_RUSH);
  const sHPassDef = h.passDefPlays / (h.passDefPlays + M1_K_PASS);
  const sHRushDef = h.rushDefPlays / (h.rushDefPlays + M1_K_RUSH);

  // Matchup advantages
  const hPassAdv = sHPassOff * (hPassOffEpa - lPassEpa) - sAPassDef * (aPassDefEpa - lPassEpa);
  const hRushAdv = sHRushOff * (hRushOffEpa - lRushEpa) - sARushDef * (aRushDefEpa - lRushEpa);
  const hAdv = M1_W_PASS * hPassAdv + M1_W_RUSH * hRushAdv;

  const aPassAdv = sAPassOff * (aPassOffEpa - lPassEpa) - sHPassDef * (hPassDefEpa - lPassEpa);
  const aRushAdv = sARushOff * (aRushOffEpa - lRushEpa) - sHRushDef * (hRushDefEpa - lRushEpa);
  const aAdv = M1_W_PASS * aPassAdv + M1_W_RUSH * aRushAdv;

  const netAdv = hAdv - aAdv;
  return M1_SCALE * netAdv;
}

/**
 * Calculates candidate M2 (Scheme Matchup) margin adjustment with prior season blending.
 */
export function calculateM2Adjustment(
  homeTeam: string,
  awayTeam: string,
  currentState: SeasonCumulativeState,
  priorState: SeasonCumulativeState | null,
  options?: {
    ablateManZone?: boolean;
    ablateCoverageType?: boolean;
    ablatePersonnel?: boolean;
    ablateFront?: boolean;
  }
): number {
  const hCur = getOrCreateTeamStats(currentState, homeTeam);
  const aCur = getOrCreateTeamStats(currentState, awayTeam);

  const hPrior = priorState ? getOrCreateTeamStats(priorState, homeTeam) : null;
  const aPrior = priorState ? getOrCreateTeamStats(priorState, awayTeam) : null;

  // Blending helper: blends current and prior season statistics
  const blend = (curVal: number, curN: number, priorVal: number, priorN: number): number => {
    if (curN === 0 && priorN === 0) return 0;
    const wPrior = M2_K_SCHEME / (curN + M2_K_SCHEME);
    if (!priorState || priorN === 0) return curN > 0 ? curVal : 0;
    return (1 - wPrior) * curVal + wPrior * priorVal;
  };

  // Home offense vs Away defense scheme
  const hManEpa = blend(
    hCur.passManOffPlays > 0 ? hCur.passManOffEpa / hCur.passManOffPlays : 0,
    hCur.passManOffPlays,
    hPrior && hPrior.passManOffPlays > 0 ? hPrior.passManOffEpa / hPrior.passManOffPlays : 0,
    hPrior ? hPrior.passManOffPlays : 0
  );
  const hZoneEpa = blend(
    hCur.passZoneOffPlays > 0 ? hCur.passZoneOffEpa / hCur.passZoneOffPlays : 0,
    hCur.passZoneOffPlays,
    hPrior && hPrior.passZoneOffPlays > 0 ? hPrior.passZoneOffEpa / hPrior.passZoneOffPlays : 0,
    hPrior ? hPrior.passZoneOffPlays : 0
  );
  const hPassAllEpa = blend(
    hCur.passOffPlays > 0 ? hCur.passOffEpa / hCur.passOffPlays : 0,
    hCur.passOffPlays,
    hPrior && hPrior.passOffPlays > 0 ? hPrior.passOffEpa / hPrior.passOffPlays : 0,
    hPrior ? hPrior.passOffPlays : 0
  );

  const aDefCharted = aCur.passDefTotalCharted;
  const aDefPriorCharted = aPrior ? aPrior.passDefTotalCharted : 0;
  const aManRate = blend(
    aDefCharted > 0 ? aCur.passManDefPlays / aDefCharted : 0.35,
    aDefCharted,
    aDefPriorCharted > 0 && aPrior ? aPrior.passManDefPlays / aDefPriorCharted : 0.35,
    aDefPriorCharted
  );
  const aZoneRate = blend(
    aDefCharted > 0 ? aCur.passZoneDefPlays / aDefCharted : 0.65,
    aDefCharted,
    aDefPriorCharted > 0 && aPrior ? aPrior.passZoneDefPlays / aDefPriorCharted : 0.65,
    aDefPriorCharted
  );

  // Coverage advantage for Home offense
  let hCovAdv = 0;
  if (!options?.ablateManZone) {
    hCovAdv = aManRate * hManEpa + aZoneRate * hZoneEpa - hPassAllEpa;
  }

  // Personnel vs Front for Home offense
  let hPersAdv = 0;
  if (!options?.ablatePersonnel && !options?.ablateFront) {
    const h11Epa = blend(
      hCur.p11OffPlays > 0 ? hCur.p11OffEpa / hCur.p11OffPlays : hPassAllEpa,
      hCur.p11OffPlays,
      hPrior && hPrior.p11OffPlays > 0 ? hPrior.p11OffEpa / hPrior.p11OffPlays : hPassAllEpa,
      hPrior ? hPrior.p11OffPlays : 0
    );
    const h12Epa = blend(
      hCur.p12OffPlays > 0 ? hCur.p12OffEpa / hCur.p12OffPlays : hPassAllEpa,
      hCur.p12OffPlays,
      hPrior && hPrior.p12OffPlays > 0 ? hPrior.p12OffEpa / hPrior.p12OffPlays : hPassAllEpa,
      hPrior ? hPrior.p12OffPlays : 0
    );
    const h11Rate = blend(
      hCur.offTotalPersonnelCharted > 0 ? hCur.p11OffPlays / hCur.offTotalPersonnelCharted : 0.6,
      hCur.offTotalPersonnelCharted,
      hPrior && hPrior.offTotalPersonnelCharted > 0
        ? hPrior.p11OffPlays / hPrior.offTotalPersonnelCharted
        : 0.6,
      hPrior ? hPrior.offTotalPersonnelCharted : 0
    );
    const h12Rate = blend(
      hCur.offTotalPersonnelCharted > 0 ? hCur.p12OffPlays / hCur.offTotalPersonnelCharted : 0.2,
      hCur.offTotalPersonnelCharted,
      hPrior && hPrior.offTotalPersonnelCharted > 0
        ? hPrior.p12OffPlays / hPrior.offTotalPersonnelCharted
        : 0.2,
      hPrior ? hPrior.offTotalPersonnelCharted : 0
    );
    hPersAdv = h11Rate * (h11Epa - hPassAllEpa) + h12Rate * (h12Epa - hPassAllEpa);
  }

  const hScheme = 0.7 * hCovAdv + 0.3 * hPersAdv;

  // Away offense vs Home defense scheme
  const aManEpa = blend(
    aCur.passManOffPlays > 0 ? aCur.passManOffEpa / aCur.passManOffPlays : 0,
    aCur.passManOffPlays,
    aPrior && aPrior.passManOffPlays > 0 ? aPrior.passManOffEpa / aPrior.passManOffPlays : 0,
    aPrior ? aPrior.passManOffPlays : 0
  );
  const aZoneEpa = blend(
    aCur.passZoneOffPlays > 0 ? aCur.passZoneOffEpa / aCur.passZoneOffPlays : 0,
    aCur.passZoneOffPlays,
    aPrior && aPrior.passZoneOffPlays > 0 ? aPrior.passZoneOffEpa / aPrior.passZoneOffPlays : 0,
    aPrior ? aPrior.passZoneOffPlays : 0
  );
  const aPassAllEpa = blend(
    aCur.passOffPlays > 0 ? aCur.passOffEpa / aCur.passOffPlays : 0,
    aCur.passOffPlays,
    aPrior && aPrior.passOffPlays > 0 ? aPrior.passOffEpa / aPrior.passOffPlays : 0,
    aPrior ? aPrior.passOffPlays : 0
  );

  const hDefCharted = hCur.passDefTotalCharted;
  const hDefPriorCharted = hPrior ? hPrior.passDefTotalCharted : 0;
  const hManRate = blend(
    hDefCharted > 0 ? hCur.passManDefPlays / hDefCharted : 0.35,
    hDefCharted,
    hDefPriorCharted > 0 && hPrior ? hPrior.passManDefPlays / hDefPriorCharted : 0.35,
    hDefPriorCharted
  );
  const hZoneRate = blend(
    hDefCharted > 0 ? hCur.passZoneDefPlays / hDefCharted : 0.65,
    hDefCharted,
    hDefPriorCharted > 0 && hPrior ? hPrior.passZoneDefPlays / hDefPriorCharted : 0.65,
    hDefPriorCharted
  );

  let aCovAdv = 0;
  if (!options?.ablateManZone) {
    aCovAdv = hManRate * aManEpa + hZoneRate * aZoneEpa - aPassAllEpa;
  }

  let aPersAdv = 0;
  if (!options?.ablatePersonnel && !options?.ablateFront) {
    const a11Epa = blend(
      aCur.p11OffPlays > 0 ? aCur.p11OffEpa / aCur.p11OffPlays : aPassAllEpa,
      aCur.p11OffPlays,
      aPrior && aPrior.p11OffPlays > 0 ? aPrior.p11OffEpa / aPrior.p11OffPlays : aPassAllEpa,
      aPrior ? aPrior.p11OffPlays : 0
    );
    const a12Epa = blend(
      aCur.p12OffPlays > 0 ? aCur.p12OffEpa / aCur.p12OffPlays : aPassAllEpa,
      aCur.p12OffPlays,
      aPrior && aPrior.p12OffPlays > 0 ? aPrior.p12OffEpa / aPrior.p12OffPlays : aPassAllEpa,
      aPrior ? aPrior.p12OffPlays : 0
    );
    const a11Rate = blend(
      aCur.offTotalPersonnelCharted > 0 ? aCur.p11OffPlays / aCur.offTotalPersonnelCharted : 0.6,
      aCur.offTotalPersonnelCharted,
      aPrior && aPrior.offTotalPersonnelCharted > 0
        ? aPrior.p11OffPlays / aPrior.offTotalPersonnelCharted
        : 0.6,
      aPrior ? aPrior.offTotalPersonnelCharted : 0
    );
    const a12Rate = blend(
      aCur.offTotalPersonnelCharted > 0 ? aCur.p12OffPlays / aCur.offTotalPersonnelCharted : 0.2,
      aCur.offTotalPersonnelCharted,
      aPrior && aPrior.offTotalPersonnelCharted > 0
        ? aPrior.p12OffPlays / aPrior.offTotalPersonnelCharted
        : 0.2,
      aPrior ? aPrior.offTotalPersonnelCharted : 0
    );
    aPersAdv = a11Rate * (a11Epa - aPassAllEpa) + a12Rate * (a12Epa - aPassAllEpa);
  }

  const aScheme = 0.7 * aCovAdv + 0.3 * aPersAdv;

  const netAdv = hScheme - aScheme;
  return M2_SCALE * netAdv;
}

/**
 * Calculates candidate M3 (Red Zone) margin adjustment.
 */
export function calculateM3Adjustment(
  homeTeam: string,
  awayTeam: string,
  state: SeasonCumulativeState
): number {
  const h = getOrCreateTeamStats(state, homeTeam);
  const a = getOrCreateTeamStats(state, awayTeam);

  const lPpt = state.league.rzTrips > 0 ? state.league.rzPoints / state.league.rzTrips : 4.8;

  const hPptOff = h.rzOffTrips > 0 ? h.rzOffPoints / h.rzOffTrips : lPpt;
  const aPptDef = a.rzDefTrips > 0 ? a.rzDefPoints / a.rzDefTrips : lPpt;

  const aPptOff = a.rzOffTrips > 0 ? a.rzOffPoints / a.rzOffTrips : lPpt;
  const hPptDef = h.rzDefTrips > 0 ? h.rzDefPoints / h.rzDefTrips : lPpt;

  const sHOff = h.rzOffTrips / (h.rzOffTrips + M3_K_RZ);
  const sADef = a.rzDefTrips / (a.rzDefTrips + M3_K_RZ);

  const sAOff = a.rzOffTrips / (a.rzOffTrips + M3_K_RZ);
  const sHDef = h.rzDefTrips / (h.rzDefTrips + M3_K_RZ);

  const adjHOff = lPpt + sHOff * (hPptOff - lPpt);
  const adjADef = lPpt + sADef * (aPptDef - lPpt);

  const adjAOff = lPpt + sAOff * (aPptOff - lPpt);
  const adjHDef = lPpt + sHDef * (hPptDef - lPpt);

  const netDiff = (adjHOff - adjAOff) + (adjADef - adjHDef);
  return M3_SCALE * netDiff;
}

/**
 * Formats a predicted margin into standard PredictionResult.
 */
export function marginToPrediction(margin: number, game: Game): PredictionResult {
  const homeScore = Math.max(0, Math.round(22.0 + margin / 2));
  const awayScore = Math.max(0, Math.round(22.0 - margin / 2));
  const homeWinProb = 1 / (1 + Math.exp(-margin / 7.0));

  let spreadPick: SpreadPick = 'home';
  if (game.market.spread !== null) {
    const coverMargin = margin + game.market.spread;
    if (coverMargin > 0) spreadPick = 'home';
    else if (coverMargin < 0) spreadPick = 'away';
    else spreadPick = 'push';
  } else {
    spreadPick = margin >= 0 ? 'home' : 'away';
  }

  return { homeScore, awayScore, homeWinProb, spreadPick };
}
