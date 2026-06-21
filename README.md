# Lingua Companion AI

A mobile-first PWA that helps users learn English and pass the US citizenship test, with an AI companion that supports voice in/out and four personalities.

## Files

```
index.html        Landing page
login.html        Email/password login
signup.html       Sign up (name, DOB, email, password)
dashboard.html    Home: greeting, streak, daily goals, tiles
chat.html         AI chat (4 personalities, voice in/out)
learn.html        English lessons (Beginner / Intermediate / Advanced)
citizenship.html  Flashcards, quiz, reading, writing, test simulator
interview.html    N-400 mock interview with AI feedback
profile.html      Profile + log out
admin.html        Admin panel (only visible if isAdmin=true)
style.css         Blue/white mobile-first theme
app.js            Shared logic (auth, AI, voice, goals, streak)
firebase.js       Firebase config + helpers (edit this!)
civics.js         Full 100 USCIS questions + N-400 list + reading/writing
manifest.json     PWA manifest
service-worker.js Offline caching
icons/            App icons
```

## Setup — 3 steps

### 1) Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → create a project.
2. Add a Web App → copy the config.
3. Open `firebase.js` and replace the placeholders in `firebaseConfig`.
4. In Firebase Console → **Authentication** → enable **Email/Password**.
5. In Firebase Console → **Firestore** → create database in production mode, then paste these rules:

```
rules_version='2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /{sub=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
    // Admin read-all (your admin user sets isAdmin=true manually in Firestore)
    match /users/{uid} {
      allow read: if request.auth != null &&
        get(/databases/$(db)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
  }
}
```

To make yourself admin: sign up, then in Firestore console open your `users/{uid}` doc and set `isAdmin: true`.

### 2) AI endpoint (OpenAI-compatible)

The app calls `AI_ENDPOINT` in `firebase.js`. Since the API key shouldn't be in the browser, use a Cloudflare Worker (or any proxy) that adds the key server-side and accepts the standard OpenAI `/v1/chat/completions` body.

You already have a Worker pattern from LinguaCall — point the new one at Gemini or OpenAI and update:

```js
export const AI_ENDPOINT = "https://YOUR-WORKER.workers.dev/v1/chat/completions";
export const AI_MODEL = "gpt-4o-mini"; // or "gemini-1.5-flash"
```

Minimal Worker (Gemini → OpenAI-compatible response):

```js
export default {
  async fetch(req, env) {
    if (req.method !== "POST") return new Response("POST only", { status: 405 });
    const { messages, temperature = 0.8, max_tokens = 350 } = await req.json();
    const system = messages.find(m => m.role === "system")?.content || "";
    const contents = messages.filter(m => m.role !== "system").map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { temperature, maxOutputTokens: max_tokens }
        })
      }
    );
    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return Response.json({
      choices: [{ message: { role: "assistant", content: text } }]
    }, { headers: { "Access-Control-Allow-Origin": "*" } });
  }
};
```

Add `GEMINI_KEY` as a Worker secret. Set CORS to allow your GitHub Pages origin.

### 3) Deploy

- Push these files to a GitHub repo.
- Settings → Pages → deploy from `main` / root.
- Visit your URL on Android Chrome → menu → **Install app**.

That's it. Streaks, goals, quiz scores, and chat history all persist to Firestore per user.

## Personalities

| Key | Name | Use it for |
| --- | --- | --- |
| friendly | Lia 💖 | Daily casual conversation practice |
| teacher | Mr. Hayes 📚 | Grammar corrections, vocabulary |
| citizenship | USCIS Coach 🇺🇸 | N-400 + civics drilling |
| business | Business Mentor 💼 | Workplace English, interviews |

## Voice

Uses the Web Speech API. Works best on Chrome / Edge Android. iOS Safari supports speech synthesis but recognition is limited.

## Offline

App shell is cached by the service worker. Firebase + AI calls always go to the network. First load online, then chat & civics flashcards work offline; new AI replies need a connection.
