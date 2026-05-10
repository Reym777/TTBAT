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

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "Method Not Allowed" }) };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.error("TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant");
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Configuration serveur incomplete" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Payload invalide" }) }; }

  const fullname = clean(body.fullname, 120);
  const phone    = clean(body.phone,    40);
  const email    = clean(body.email,    160).toLowerCase();
  const subject  = clean(body.subject,  200);
  const message  = clean(body.message, 1200);

  if (!fullname || fullname.length < 2)
    return { statusCode: 422, body: JSON.stringify({ ok: false, error: "Nom invalide" }) };
  if (!isValidPhone(phone))
    return { statusCode: 422, body: JSON.stringify({ ok: false, error: "Telephone invalide" }) };
  if (!isValidEmail(email))
    return { statusCode: 422, body: JSON.stringify({ ok: false, error: "Email invalide" }) };
  if (!subject || subject.length < 2)
    return { statusCode: 422, body: JSON.stringify({ ok: false, error: "Sujet invalide" }) };
  if (hasSpam([fullname, phone, subject, message].join(" ")))
    return { statusCode: 422, body: JSON.stringify({ ok: false, error: "Message rejete (spam)" }) };

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
    const tgRes = await fetch(
      "https://api.telegram.org/bot" + botToken + "/sendMessage",
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ chat_id: chatId, text }),
      }
    );
    const tgJson = await tgRes.json();
    if (!tgJson.ok) {
      console.error("Telegram error:", tgJson);
      return { statusCode: 502, body: JSON.stringify({ ok: false, error: "Erreur envoi Telegram" }) };
    }
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: true, message: "Message envoye avec succes" }),
    };
  } catch (err) {
    console.error("Fetch Telegram failed:", err);
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: "Service indisponible" }) };
  }
};
