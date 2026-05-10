# TTBAT - Contact Telegram securise

Le token Telegram n'est plus expose dans le front.

## 1) Variables d'environnement

Copiez `.env.example` vers `.env` puis renseignez:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ALLOWED_ORIGINS_DEVELOPMENT`
- `ALLOWED_ORIGINS_STAGING`
- `ALLOWED_ORIGINS_PRODUCTION`
- `INTERNAL_HMAC_SECRET`
- `HMAC_MAX_SKEW_MS`
- `SPAM_PATTERN_BLOCKLIST` (optionnel)
- `NODE_ENV`
- `PORT`

## 2) Mode backend local (Express)

1. Installer les dependances: `npm install`
2. Lancer: `npm start`
3. Ouvrir: `http://localhost:8787`

Le formulaire appelle `POST /api/contact` sur le meme serveur.

## 3) Mode serverless Netlify

Le fichier `netlify.toml` route `/api/contact` vers `netlify/functions/contact.js`.

Configurer les variables Netlify:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ALLOWED_ORIGINS_STAGING`
- `ALLOWED_ORIGINS_PRODUCTION`
- `INTERNAL_HMAC_SECRET`
- `HMAC_MAX_SKEW_MS`
- `SPAM_PATTERN_BLOCKLIST` (optionnel)

Aucune cle Telegram n'est visible dans le navigateur.

## 4) Protection anti-spam deja active

- Honeypot (champ cache `website`)
- Validation serveur (email, telephone, message)
- Limitation de debit (backend Express)
- Blocage de patterns spam (liens, mots suspects, repetitions abusives)

## 5) Verification d'origine stricte par environnement

- Le backend refuse les origins non declares.
- En local, utiliser `ALLOWED_ORIGINS_DEVELOPMENT=http://localhost:8787`.
- En staging/prod, definir explicitement les domaines autorises.

## 6) Signature HMAC pour requetes internes

Endpoint interne dedie:

- `POST /api/internal/contact`

Headers requis:

- `X-TTBAT-Internal: 1`
- `X-TTBAT-Timestamp: <epoch_ms>`
- `X-TTBAT-Signature: <hmac_sha256_hex>`

Signature a calculer:

- message signe: `<timestamp>.<raw_json_body>`
- algo: `HMAC-SHA256`
- secret: `INTERNAL_HMAC_SECRET`

Les signatures hors fenetre temporelle (`HMAC_MAX_SKEW_MS`) sont rejetees.

## 7) Clients HMAC prets a executer

Exemples fournis:

- [tools/internal_hmac_client_node.mjs](tools/internal_hmac_client_node.mjs)
- [tools/internal_hmac_client.py](tools/internal_hmac_client.py)

Variables a definir avant execution:

- `INTERNAL_HMAC_SECRET`
- `INTERNAL_CONTACT_URL` (optionnel, defaut: `http://localhost:8787/api/internal/contact`)

Execution Node:

1. `set INTERNAL_HMAC_SECRET=votre_secret_hmac`
2. `set INTERNAL_CONTACT_URL=http://localhost:8787/api/internal/contact`
3. `node tools/internal_hmac_client_node.mjs`

Execution Python:

1. `set INTERNAL_HMAC_SECRET=votre_secret_hmac`
2. `set INTERNAL_CONTACT_URL=http://localhost:8787/api/internal/contact`
3. `python tools/internal_hmac_client.py`

Resultat attendu:

- `status: 200`
- `response: {"ok":true}`
