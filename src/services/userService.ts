import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { UserPrediction } from "../types";

const COLLECTION_NAME = "users";

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
    if (!userId) {
      const saved = localStorage.getItem('mediPicks_predictions');
      return saved ? JSON.parse(saved) : {};
    }

    try {
      const userRef = doc(db, COLLECTION_NAME, userId);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return data.predictions || {};
      } else {
        // Migration: If user just signed up, maybe check local storage and merge?
        // For now, return empty or check local as fallback
        const local = localStorage.getItem('mediPicks_predictions');
        return local ? JSON.parse(local) : {};
      }
    } catch (e) {
      console.error("Error loading from cloud:", e);
      const saved = localStorage.getItem('mediPicks_predictions');
      return saved ? JSON.parse(saved) : {};
    }
  }
};
