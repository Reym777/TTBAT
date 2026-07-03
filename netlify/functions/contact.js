// Netlify Function – formulaire TTBAT vers Telegram
// Variables a configurer dans le dashboard Netlify :
//   TELEGRAM_BOT_TOKEN  (ton token bot)
//   TELEGRAM_CHAT_ID    (id de ton canal ou chat)

const clean = (v, max = 200) => String(v || "").trim().replace(/\s+/g, " ").slice(0, max);
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const isValidPhone = (p) => /^[0-9+().\s-]{6,30}$/.test(p);
const hasSpam = (text) =>
  /https?:\/\//i.test(text) ||
  /(?:viagra|casino|escort|bitcoin giveaway|forex robot|onlyfans)/i.test(text) ||
  /(.)\1{9,}/.test(text);

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://ttbat.fr",
  "https://www.ttbat.fr",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
]);

function allowedOrigins() {
  const envOrigins = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins]);
}

function makeCorsHeaders(origin) {
  const base = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
  if (origin) {
    return {
      ...base,
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    };
  }
  return base;
}

export const handler = async (event) => {
  const reqOrigin = event.headers?.origin || event.headers?.Origin || "";
  const allowed = allowedOrigins();
  const origin = reqOrigin && allowed.has(reqOrigin) ? reqOrigin : "";

  if (event.httpMethod === "OPTIONS") {
    if (!origin) {
      return {
        statusCode: 403,
        headers: makeCorsHeaders(""),
        body: JSON.stringify({ ok: false, error: "Origine non autorisee" }),
      };
    }
    return {
      statusCode: 204,
      headers: makeCorsHeaders(origin),
    };
  }

  if (reqOrigin && !origin) {
    return {
      statusCode: 403,
      headers: makeCorsHeaders(""),
      body: JSON.stringify({ ok: false, error: "Origine non autorisee" }),
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: makeCorsHeaders(origin),
      body: JSON.stringify({ ok: false, error: "Method Not Allowed" }),
    };
  }

  const ctype = String(event.headers?.["content-type"] || event.headers?.["Content-Type"] || "").toLowerCase();
  if (!ctype.includes("application/json")) {
    return {
      statusCode: 415,
      headers: makeCorsHeaders(origin),
      body: JSON.stringify({ ok: false, error: "Type de contenu invalide" }),
    };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.error("TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant");
    return {
      statusCode: 500,
      headers: makeCorsHeaders(origin),
      body: JSON.stringify({ ok: false, error: "Configuration serveur incomplete" }),
    };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch {
    return {
      statusCode: 400,
      headers: makeCorsHeaders(origin),
      body: JSON.stringify({ ok: false, error: "Payload invalide" }),
    };
  }

  const fullname = clean(body.fullname, 120);
  const phone    = clean(body.phone,    40);
  const email    = clean(body.email,    160).toLowerCase();
  const subject  = clean(body.subject,  200);
  const message  = clean(body.message, 1200);
  const website  = clean(body.website, 80);
  const formTs   = Number(body.form_ts || 0);
  const formAge  = Date.now() - formTs;

  if (website) {
    return {
      statusCode: 200,
      headers: makeCorsHeaders(origin),
      body: JSON.stringify({ ok: true, message: "Message envoye avec succes" }),
    };
  }
  if (!Number.isFinite(formTs) || formAge < 2000 || formAge > 1000 * 60 * 60 * 2) {
    return {
      statusCode: 422,
      headers: makeCorsHeaders(origin),
      body: JSON.stringify({ ok: false, error: "Validation temporelle invalide" }),
    };
  }

  if (!fullname || fullname.length < 2)
    return { statusCode: 422, headers: makeCorsHeaders(origin), body: JSON.stringify({ ok: false, error: "Nom invalide" }) };
  if (!isValidPhone(phone))
    return { statusCode: 422, headers: makeCorsHeaders(origin), body: JSON.stringify({ ok: false, error: "Telephone invalide" }) };
  if (!isValidEmail(email))
    return { statusCode: 422, headers: makeCorsHeaders(origin), body: JSON.stringify({ ok: false, error: "Email invalide" }) };
  if (!subject || subject.length < 2)
    return { statusCode: 422, headers: makeCorsHeaders(origin), body: JSON.stringify({ ok: false, error: "Sujet invalide" }) };
  if (hasSpam([fullname, phone, subject, message].join(" ")))
    return { statusCode: 422, headers: makeCorsHeaders(origin), body: JSON.stringify({ ok: false, error: "Message rejete (spam)" }) };

  const text = [
    "NOUVELLE DEMANDE TTBAT",
    "",
    "Nom : "       + fullname,
    "Telephone : " + phone,
    "Email : "     + email,
    "Sujet : "     + subject,
    message ? "\nMessage :\n" + message : "",
    "",
    new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" }),
  ].join("\n");

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 9000);
    let tgRes;
    try {
      tgRes = await fetch(
        "https://api.telegram.org/bot" + botToken + "/sendMessage",
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ chat_id: chatId, text }),
          signal: ac.signal,
        }
      );
    } finally {
      clearTimeout(timer);
    }
    const tgJson = await tgRes.json();
    if (!tgJson.ok) {
      console.error("Telegram error:", tgJson);
      return {
        statusCode: 502,
        headers: makeCorsHeaders(origin),
        body: JSON.stringify({ ok: false, error: "Erreur envoi Telegram" }),
      };
    }
    return {
      statusCode: 200,
      headers: makeCorsHeaders(origin),
      body: JSON.stringify({ ok: true, message: "Message envoye avec succes" }),
    };
  } catch (err) {
    console.error("Fetch Telegram failed:", err);
    return {
      statusCode: 503,
      headers: makeCorsHeaders(origin),
      body: JSON.stringify({ ok: false, error: "Service indisponible" }),
    };
  }
};
