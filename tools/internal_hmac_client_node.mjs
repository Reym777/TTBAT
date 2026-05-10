import crypto from "crypto";

const endpoint = process.env.INTERNAL_CONTACT_URL || "http://localhost:8787/api/internal/contact";
const secret = process.env.INTERNAL_HMAC_SECRET || "";

if (!secret) {
  console.error("Missing INTERNAL_HMAC_SECRET environment variable.");
  process.exit(1);
}

const payload = {
  name: "Client Interne",
  company: "TTBAT",
  email: "interne@ttbat.fr",
  phone: "+33123456789",
  projectType: "Bardage",
  message: "Message interne signe pour validation du flux HMAC.",
  website: ""
};

const rawBody = JSON.stringify(payload);
const timestamp = Date.now().toString();
const signature = crypto
  .createHmac("sha256", secret)
  .update(`${timestamp}.${rawBody}`)
  .digest("hex");

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-TTBAT-Internal": "1",
    "X-TTBAT-Timestamp": timestamp,
    "X-TTBAT-Signature": signature
  },
  body: rawBody
});

const data = await response.json().catch(() => ({}));
console.log("status:", response.status);
console.log("response:", data);
