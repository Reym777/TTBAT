Resend without api.ttbat.fr (Cloudflare Worker)

Goal
- Keep frontend on GitHub Pages.
- Send contact emails with Resend only.
- Do not use api.ttbat.fr.

Deploy
1. Create a Cloudflare Worker.
2. Paste worker.js content.
3. Add Worker environment variables:
   - RESEND_API_KEY=RE_...
   - RESEND_FROM=TTBAT <contact@your-verified-domain>
  - CONTACT_TO=ttbatiso@gmail.com
   - ALLOWED_ORIGIN=https://ttbat.fr
4. Deploy Worker.
5. Copy Worker URL (example: https://ttbat-contact.yourname.workers.dev/contact).

Frontend
- In index.html set:
  <meta name="ttbat-api-contact" content="https://YOUR-WORKER.workers.dev/contact">

Notes
- RESEND_FROM must be a verified sender/domain in Resend.
- Keep API key only in Worker env vars, never in frontend.
