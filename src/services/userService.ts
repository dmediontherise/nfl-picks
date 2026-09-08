import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { UserPrediction, AgreementState } from "../types";

const COLLECTION_NAME = "users";

export function inferAgreementState(pred: Partial<UserPrediction>): AgreementState {
  if (pred.agreementState && ['agreed', 'deviated', 'unset'].includes(pred.agreementState)) {
    return pred.agreementState;
  }
  const hasUserHome = pred.userHomeScore !== undefined && pred.userHomeScore !== null && String(pred.userHomeScore).trim() !== '';
  const hasUserAway = pred.userAwayScore !== undefined && pred.userAwayScore !== null && String(pred.userAwayScore).trim() !== '';

  if (!hasUserHome || !hasUserAway) {
    return 'unset';
  }

  const userHome = String(pred.userHomeScore).trim();
  const userAway = String(pred.userAwayScore).trim();
  const engHome = String(pred.homeScore || '').trim();
  const engAway = String(pred.awayScore || '').trim();

  if (userHome === engHome && userAway === engAway) {
    return 'agreed';
  }
  return 'deviated';
}

export function migratePredictions(predictions: Record<string, any>): { migrated: Record<string, UserPrediction>; hasChanges: boolean } {
  const migrated: Record<string, UserPrediction> = {};
  let hasChanges = false;

  for (const [gameId, pred] of Object.entries(predictions || {})) {
    if (!pred || typeof pred !== 'object') continue;
    const inferredState = inferAgreementState(pred);
    const updated: UserPrediction = {
      ...pred,
      gameId: pred.gameId || gameId,
      agreementState: inferredState
    };
    if (pred.agreementState !== inferredState) {
      hasChanges = true;
    }
    migrated[gameId] = updated;
  }

  return { migrated, hasChanges };
}

export const userService = {
  // SAVE PREDICTIONS
  savePredictions: async (userId: string | undefined, predictions: Record<string, UserPrediction>) => {
    if (!userId) {
      // Fallback to LocalStorage
      localStorage.setItem('mediPicks_predictions', JSON.stringify(predictions));
      return;
    }

    try {
      const userRef = doc(db, COLLECTION_NAME, userId);
      await setDoc(userRef, { predictions }, { merge: true });
    } catch (e) {
      console.error("Error saving to cloud:", e);
      // Fallback to local on error?
      localStorage.setItem('mediPicks_predictions', JSON.stringify(predictions));
    }
  },

  // LOAD PREDICTIONS
  loadPredictions: async (userId: string | undefined): Promise<Record<string, UserPrediction>> => {
    let raw: Record<string, any> = {};
    if (!userId) {
      const saved = localStorage.getItem('mediPicks_predictions');
      raw = saved ? JSON.parse(saved) : {};
    } else {
      try {
        const userRef = doc(db, COLLECTION_NAME, userId);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          raw = data.predictions || {};
        } else {
          const local = localStorage.getItem('mediPicks_predictions');
          raw = local ? JSON.parse(local) : {};
        }
      } catch (e) {
        console.error("Error loading from cloud:", e);
        const saved = localStorage.getItem('mediPicks_predictions');
        raw = saved ? JSON.parse(saved) : {};
      }
    }

    const { migrated, hasChanges } = migratePredictions(raw);
    if (hasChanges) {
      await userService.savePredictions(userId, migrated);
    }
    return migrated;
  }
};
