/**
 * LinguaCall Worker — receives a short audio clip (Urdu or Pashto speech),
 * sends it to Gemini for transcription + English conversational reply,
 * and returns clean JSON. Retries on 429/503, surfaces real errors instead
 * of failing silently.
 *
 * SETUP: In Cloudflare dashboard → Workers & Pages → this worker →
 * Settings → Variables → make sure GEMINI_API_KEY is set there.
 * (If your existing variable has a different name, change every
 * "env.GEMINI_API_KEY" below to match it.)
 */

const MODEL = "gemini-2.5-flash"; // current, stable, supports audio input

const LANG_NAMES = { ur: "Urdu", ps: "Pashto" };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ error: "This endpoint only accepts POST requests." }, 405);
    }
    if (!env.GEMINI_API_KEY) {
      return json({ error: "Server is missing GEMINI_API_KEY. Set it in Cloudflare → Worker → Settings → Variables." }, 500);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Request body must be JSON." }, 400);
    }

    // Lightweight connectivity check the app pings on load — no Gemini call needed.
    if (payload.ping) {
      return json({ ok: true, hasApiKey: Boolean(env.GEMINI_API_KEY) });
    }

    const { audio, mimeType, sourceLang, history } = payload;
    if (!audio) {
      return json({ error: "No audio data was sent." }, 400);
    }

    const langName = LANG_NAMES[sourceLang] || "Urdu";
    const recentTurns = (history || [])
      .slice(-6)
      .map((h) => `${h.role === "user" ? "Student" : "Nova"}: ${h.text}`)
      .join("\n");

    const prompt = `You are Nova, a warm, patient spoken-English conversation partner for a ${langName} speaker who is learning English.

The attached audio is the student speaking in ${langName}.

Do exactly this:
1. Transcribe what they said, in ${langName} script.
2. Reply naturally in simple, encouraging spoken English (1-3 short sentences) as if continuing a real phone conversation. Ask a gentle follow-up question when it fits naturally, to keep them talking.

${recentTurns ? "Conversation so far:\n" + recentTurns : "This is the start of the conversation — greet them warmly."}

Reply with ONLY raw JSON (no markdown fences, no extra text), exactly in this shape:
{"transcript": "<what the student said, in ${langName}>", "reply": "<Nova's spoken English reply>"}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

    const geminiBody = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType || "audio/webm", data: audio } },
          ],
        },
      ],
      generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
    };

    let lastErrorDetail = "";

    for (let attempt = 1; attempt <= 3; attempt++) {
      let res;
      try {
        res = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody),
        });
      } catch (err) {
        lastErrorDetail = `Network error reaching Gemini: ${err.message}`;
        await sleep(600 * attempt);
        continue;
      }

      if (res.status === 429 || res.status === 503) {
        lastErrorDetail = `Gemini is busy (HTTP ${res.status}). Retrying...`;
        await sleep(700 * attempt);
        continue;
      }

      if (res.status === 404) {
        const body = await res.text();
        return json({ error: `Model "${MODEL}" was not found (HTTP 404). Google may have renamed/retired it. Details: ${body}` }, 502);
      }

      if (!res.ok) {
        const body = await res.text();
        return json({ error: `Gemini returned HTTP ${res.status}: ${body}` }, 502);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!text) {
        const blockReason = data.promptFeedback?.blockReason;
        return json({ error: blockReason ? `Gemini blocked the response: ${blockReason}` : "Gemini returned an empty response." }, 502);
      }

      const cleaned = text.replace(/```json|```/g, "").trim();
      try {
        const parsed = JSON.parse(cleaned);
        return json(parsed);
      } catch {
        // Model didn't follow the JSON format — still return something useful
        return json({ transcript: "(could not parse transcript)", reply: cleaned.slice(0, 300) });
      }
    }

    return json({ error: `Nova's AI brain didn't respond after 3 tries. Last issue: ${lastErrorDetail}` }, 503);
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
