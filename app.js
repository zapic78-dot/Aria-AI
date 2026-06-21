// app.js — Lingua Companion AI
import {
  auth, db, AI_ENDPOINT, AI_MODEL,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile,
  doc, setDoc, getDoc, updateDoc, collection, addDoc,
  query, where, orderBy, getDocs, serverTimestamp, increment
} from "./firebase.js";
import { CIVICS_QUESTIONS, N400_QUESTIONS, READING_SENTENCES, WRITING_SENTENCES } from "./civics.js";

/* ---------- Helpers ---------- */
export const $ = (q,el=document)=>el.querySelector(q);
export const $$ = (q,el=document)=>[...el.querySelectorAll(q)];
export const toast=(msg,ms=2200)=>{
  const t=document.createElement("div");t.className="toast";t.textContent=msg;
  document.body.appendChild(t);setTimeout(()=>t.remove(),ms);
};
export const setBusy=(btn,busy=true,label="Loading")=>{
  if(!btn) return;
  if(busy){btn.dataset.label=btn.innerHTML;btn.innerHTML=`<span class="spin"></span> ${label}`;btn.disabled=true;}
  else{btn.innerHTML=btn.dataset.label||btn.innerHTML;btn.disabled=false;}
};
export const todayKey=()=>new Date().toISOString().slice(0,10);

/* ---------- Auth guards ---------- */
export function requireAuth(redirect="login.html"){
  return new Promise((resolve)=>{
    onAuthStateChanged(auth,(user)=>{
      if(user) resolve(user);
      else location.href=redirect;
    });
  });
}

export function redirectIfAuthed(target="dashboard.html"){
  onAuthStateChanged(auth,(user)=>{ if(user) location.href=target; });
}

/* ---------- User profile in Firestore ---------- */
export async function loadProfile(uid){
  const snap = await getDoc(doc(db,"users",uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveProfile(uid,data){
  await setDoc(doc(db,"users",uid), data, { merge:true });
}

export async function updateStreak(uid){
  const ref = doc(db,"users",uid);
  const snap = await getDoc(ref);
  const today = todayKey();
  if(!snap.exists()){
    await setDoc(ref,{ streak:1, lastActive:today },{merge:true});
    return 1;
  }
  const d = snap.data();
  if(d.lastActive === today) return d.streak||1;
  const yest = new Date(Date.now()-86400000).toISOString().slice(0,10);
  const newStreak = d.lastActive === yest ? (d.streak||0)+1 : 1;
  await updateDoc(ref,{ streak:newStreak, lastActive:today });
  return newStreak;
}

/* ---------- AI Chat (OpenAI-compatible) ---------- */
export const PERSONALITIES = {
  friendly: {
    name:"Friendly Girl",
    emoji:"💖",
    desc:"A warm, supportive friend who chats casually",
    system:"You are a warm, friendly, supportive female friend named Lia. You speak like a real person — casual, kind, encouraging. Keep replies short (1-3 sentences). Ask questions to keep the chat going. Gently correct English mistakes by repeating the right way naturally. Never sound robotic."
  },
  teacher: {
    name:"English Teacher",
    emoji:"📚",
    desc:"Corrects grammar and teaches vocabulary",
    system:"You are an English teacher named Mr. Hayes. For every user message: 1) Reply normally. 2) If there are grammar/spelling errors, add a separate line starting with 'Correction:' showing the corrected sentence with a short explanation. 3) Occasionally introduce a useful new word with definition. Keep it warm and motivating."
  },
  citizenship: {
    name:"Citizenship Coach",
    emoji:"🇺🇸",
    desc:"Prepares you for the USCIS test and N-400 interview",
    system:"You are a US Citizenship coach helping someone prepare for the naturalization interview and civics test. Use simple clear English. Ask USCIS civics or N-400 interview questions, accept their answer, give the correct answer if needed, and offer a memory tip. Encourage confidence."
  },
  business: {
    name:"Business Mentor",
    emoji:"💼",
    desc:"Coaches business English and professional skills",
    system:"You are a professional business English mentor. Help the user practice workplace English: meetings, emails, interviews, presentations, negotiations. Correct mistakes politely. Suggest stronger professional vocabulary. Keep replies practical and concise."
  }
};

export async function aiChat(messages, personalityKey="friendly"){
  const persona = PERSONALITIES[personalityKey] || PERSONALITIES.friendly;
  const body = {
    model: AI_MODEL,
    messages: [
      { role:"system", content: persona.system },
      ...messages
    ],
    temperature: 0.8,
    max_tokens: 350
  };
  const res = await fetch(AI_ENDPOINT, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error("AI request failed: "+res.status);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "Sorry, I had trouble replying.";
}

/* ---------- Voice (Web Speech API) ---------- */
export function speak(text, lang="en-US"){
  if(!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  u.pitch = 1.05;
  const voices = speechSynthesis.getVoices();
  const female = voices.find(v=>/female|samantha|google.*us|zira/i.test(v.name) && v.lang.startsWith("en"));
  if(female) u.voice = female;
  speechSynthesis.speak(u);
}

export function createRecognizer(onResult, onEnd){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return null;
  const r = new SR();
  r.lang = "en-US"; r.continuous = false; r.interimResults = false;
  r.onresult = (e)=> onResult(e.results[0][0].transcript);
  r.onend = ()=> onEnd && onEnd();
  return r;
}

/* ---------- Conversation history ---------- */
export async function saveChatMessage(uid, role, content, personality){
  return addDoc(collection(db,"users",uid,"chats"),{
    role, content, personality, createdAt: serverTimestamp()
  });
}

export async function loadRecentChats(uid, n=30){
  const q = query(collection(db,"users",uid,"chats"), orderBy("createdAt","desc"));
  const snap = await getDocs(q);
  return snap.docs.slice(0,n).map(d=>({id:d.id,...d.data()})).reverse();
}

/* ---------- Quiz / civics ---------- */
export function getRandomCivics(n=10){
  return [...CIVICS_QUESTIONS].sort(()=>Math.random()-.5).slice(0,n);
}

export function makeChoices(question){
  const correct = question.a[0];
  // Pick distractors from other questions' answers in the same category if possible
  const pool = CIVICS_QUESTIONS
    .filter(x=>x.id!==question.id)
    .flatMap(x=>x.a)
    .filter(a=>a && !a.startsWith("Answers will vary") && !a.startsWith("Check ") && a !== correct);
  const distractors = [...new Set(pool)].sort(()=>Math.random()-.5).slice(0,3);
  return [...distractors,correct].sort(()=>Math.random()-.5);
}

export async function saveQuizScore(uid, score, total){
  await addDoc(collection(db,"users",uid,"quizzes"),{
    score, total, percent: Math.round((score/total)*100),
    createdAt: serverTimestamp()
  });
  await updateDoc(doc(db,"users",uid),{
    citizenshipScore: Math.round((score/total)*100),
    totalQuizzes: increment(1)
  });
}

/* ---------- Daily goals ---------- */
export async function logDailyGoal(uid, type){
  // type: "chat" | "quiz" | "flashcards"
  const ref = doc(db,"users",uid,"goals",todayKey());
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : { chat:0, quiz:0, flashcards:0 };
  data[type] = (data[type]||0)+1;
  await setDoc(ref,data,{merge:true});
}

export async function getTodayGoals(uid){
  const ref = doc(db,"users",uid,"goals",todayKey());
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : { chat:0, quiz:0, flashcards:0 };
}

/* ---------- Data exports for pages ---------- */
export { CIVICS_QUESTIONS, N400_QUESTIONS, READING_SENTENCES, WRITING_SENTENCES };
export { auth, db, signOut, sendPasswordResetEmail, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, onAuthStateChanged };

/* ---------- Install prompt (PWA) ---------- */
let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",(e)=>{
  e.preventDefault();
  deferredPrompt=e;
  if(localStorage.getItem("installDismissed")) return;
  showInstallBanner();
});
function showInstallBanner(){
  if(document.querySelector(".install-banner")) return;
  const b=document.createElement("div");
  b.className="install-banner";
  b.innerHTML=`<div style="flex:1"><strong>Install Lingua</strong><div style="font-size:12px;opacity:.9">Add to home screen for quick access</div></div>
    <button id="installBtn">Install</button>
    <button class="x" id="installX">×</button>`;
  document.body.appendChild(b);
  $("#installBtn",b).onclick=async()=>{
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt=null; b.remove();
    if(outcome==="accepted") toast("App installed");
  };
  $("#installX",b).onclick=()=>{
    localStorage.setItem("installDismissed","1");
    b.remove();
  };
}

/* ---------- Service worker register ---------- */
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  });
}

/* ---------- Bottom nav builder ---------- */
export function bottomNav(active){
  const items=[
    {h:"dashboard.html", i:"🏠", l:"Home", k:"home"},
    {h:"chat.html", i:"💬", l:"Chat", k:"chat"},
    {h:"learn.html", i:"📖", l:"Learn", k:"learn"},
    {h:"citizenship.html", i:"🇺🇸", l:"Civics", k:"civics"},
    {h:"profile.html", i:"👤", l:"Profile", k:"profile"}
  ];
  return `<nav class="tabbar">${items.map(i=>
    `<a href="${i.h}" class="${i.k===active?"active":""}"><span class="ic">${i.i}</span>${i.l}</a>`
  ).join("")}</nav>`;
}
