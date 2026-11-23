import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase web config is public client configuration.
// Access control is enforced by Firebase Authentication and Firestore Security Rules.
const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyAu6VmFrVkUoN32AEljEUBEgAv_4J6sCqI",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "attendence77.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "attendence77",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "attendence77.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "638266921914",
  appId: env.VITE_FIREBASE_APP_ID || "1:638266921914:web:f4cb27d7c2c9b1b0c68383",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || "G-YVJGWRJMS6"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const VAPID_KEY = env.VITE_FIREBASE_VAPID_KEY || "";
