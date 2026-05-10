import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8787);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clean = (v, max = 200) => String(v || "").trim().replace(/\s+/g, " ").slice(0, max);
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const isValidPhone = (p) => /^[0-9+().\s-]{6,30}$/.test(p);
const hasSpam = (text) =>
  /https?:\/\//i.test(text) ||
  /(?:viagra|casino|escort|bitcoin giveaway|forex robot|onlyfans)/i.test(text) ||
  /(.)\1{9,}/.test(text);

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "30kb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Trop de tentatives. Reessayez plus tard." },
});
app.use("/api/", limiter);

app.use(express.static(__dirname, { extensions: ["html"] }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/contact", async (req, res) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return res.status(500).json({ ok: false, error: "Configuration serveur incomplete" });
  }

  const fullname = clean(req.body?.fullname, 120);
  const phone = clean(req.body?.phone, 40);
  const email = clean(req.body?.email, 160).toLowerCase();
  const subject = clean(req.body?.subject, 200);
  const message = clean(req.body?.message, 1200);

  if (!fullname || fullname.length < 2) {
    return res.status(422).json({ ok: false, error: "Nom invalide" });
  }
  if (!isValidPhone(phone)) {
    return res.status(422).json({ ok: false, error: "Telephone invalide" });
  }
  if (!isValidEmail(email)) {
    return res.status(422).json({ ok: false, error: "Email invalide" });
  }
  if (!subject || subject.length < 2) {
    return res.status(422).json({ ok: false, error: "Sujet invalide" });
  }
  if (hasSpam([fullname, phone, subject, message].join(" "))) {
    return res.status(422).json({ ok: false, error: "Message rejete (spam)" });
  }

  const text = [
    "NOUVELLE DEMANDE TTBAT",
    "",
    "Nom : " + fullname,
    "Telephone : " + phone,
    "Email : " + email,
    "Sujet : " + subject,
    message ? "\nMessage :\n" + message : "",
    "",
    new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" }),
  ].join("\n");

  try {
    const tgRes = await fetch("https://api.telegram.org/bot" + botToken + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const tgJson = await tgRes.json();

    if (!tgJson.ok) {
      console.error("Telegram error:", tgJson);
      return res.status(502).json({ ok: false, error: "Erreur envoi Telegram" });
    }

    return res.status(200).json({ ok: true, message: "Message envoye avec succes" });
  } catch (err) {
    console.error("Fetch Telegram failed:", err);
    return res.status(503).json({ ok: false, error: "Service indisponible" });
  }
});

app.listen(port, () => {
  console.log(`TTBAT backend listening on http://localhost:${port}`);
});
