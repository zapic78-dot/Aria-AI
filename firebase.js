// firebase.js - Firebase configuration & helpers
// Replace these placeholders with your own Firebase project keys from
// https://console.firebase.google.com -> Project Settings -> Web App
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, collection,
  addDoc, query, where, orderBy, getDocs, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDShL1yQhCIK4axeTTaBm1WWt3SAWPQqB4",
  authDomain: "lingua-companion-9b8d7.firebaseapp.com",
  projectId: "lingua-companion-9b8d7",
  storageBucket: "lingua-companion-9b8d7.firebasestorage.app",
  messagingSenderId: "93174188321",
  appId: "1:93174188321:web:5cff6f23bed89e564a9660"
};

// AI endpoint (OpenAI-compatible). Point this at your Cloudflare Worker.
// The Worker should forward to Gemini / OpenAI / etc. with your API key.
export const AI_ENDPOINT = "https://YOUR-WORKER.workers.dev/v1/chat/completions";
export const AI_MODEL = "gpt-4o-mini"; // or "gemini-1.5-flash" depending on your worker

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  app, auth, db,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile,
  doc, setDoc, getDoc, updateDoc, collection, addDoc, query, where,
  orderBy, getDocs, serverTimestamp, increment
};
