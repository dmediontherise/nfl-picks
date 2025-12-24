import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Keys provided by user. Hardcoding to ensure build picks them up correctly.
const firebaseConfig = {
  apiKey: "AIzaSyDQmNHSsGtd_pbVqXTC4uYva56qYEJWye8",
  authDomain: "medi-nfl-picks.firebaseapp.com",
  projectId: "medi-nfl-picks",
  storageBucket: "medi-nfl-picks.firebasestorage.app",
  messagingSenderId: "193206998364",
  appId: "1:193206998364:web:aa09c854be69c450d0dd99",
  measurementId: "G-8JWNSHTJ05"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const isFirebaseConfigured = () => {
    return true; // We know it's configured now
};