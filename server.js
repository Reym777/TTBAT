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

const DEFAULT_ALLOWED_ORIGINS = [
  "https://ttbat.fr",
  "https://www.ttbat.fr",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
];
const DEFAULT_ALLOWED_HOSTS = ["ttbat.fr", "www.ttbat.fr", "localhost", "127.0.0.1"];
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .concat(DEFAULT_ALLOWED_ORIGINS)
);
const ALLOWED_HOSTS = new Set(
  String(process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .concat(DEFAULT_ALLOWED_HOSTS)
);

const clean = (v, max = 200) => String(v || "").trim().replace(/\s+/g, " ").slice(0, max);
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const isValidPhone = (p) => /^[0-9+().\s-]{6,30}$/.test(p);
const hasSpam = (text) =>
  /https?:\/\//i.test(text) ||
  /(?:viagra|casino|escort|bitcoin giveaway|forex robot|onlyfans)/i.test(text) ||
  /(.)\1{9,}/.test(text);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: "10kb", type: "application/json" }));

app.use((req, res, next) => {
  const hostHeader = String(req.headers.host || "").toLowerCase();
  const host = hostHeader.split(":")[0];
  if (!host || !ALLOWED_HOSTS.has(host)) {
    return res.status(400).json({ ok: false, error: "Host invalide" });
  }
  return next();
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    if (!allowedOrigin) {
      return res.status(403).json({ ok: false, error: "Origine non autorisee" });
    }
    return res.status(204).end();
  }
  return next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Trop de tentatives. Reessayez plus tard." },
});
app.use("/api/", limiter);

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Trop de demandes. Reessayez dans quelques minutes." },
});

app.use(express.static(__dirname, { extensions: ["html"] }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/contact", contactLimiter, async (req, res) => {
  const origin = req.headers.origin || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ ok: false, error: "Origine non autorisee" });
  }
  if (!req.is("application/json")) {
    return res.status(415).json({ ok: false, error: "Type de contenu invalide" });
  }

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
  const website = clean(req.body?.website, 80);
  const formTs = Number(req.body?.form_ts || 0);
  const formAge = Date.now() - formTs;

  if (website) {
    return res.status(200).json({ ok: true, message: "Message envoye avec succes" });
  }
  if (!Number.isFinite(formTs) || formAge < 2000 || formAge > 1000 * 60 * 60 * 2) {
    return res.status(422).json({ ok: false, error: "Validation temporelle invalide" });
  }

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
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 9000);
    let tgRes;
    try {
      tgRes = await fetch("https://api.telegram.org/bot" + botToken + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
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
