import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// NOTE: Replace these values with your own from the Firebase Console
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSy_DEMO_KEY_PLACEHOLDER",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "medi-picks-demo.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "medi-picks-demo",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "medi-picks-demo.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:123456789:web:abcdef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const isFirebaseConfigured = () => {
    return process.env.REACT_APP_FIREBASE_API_KEY && 
           process.env.REACT_APP_FIREBASE_API_KEY !== "AIzaSy_DEMO_KEY_PLACEHOLDER";
};
