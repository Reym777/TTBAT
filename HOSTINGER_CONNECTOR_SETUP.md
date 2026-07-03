Hostinger Connector - Deploiement API Contact

Objectif
- Garder le frontend sur GitHub Pages.
- Deployer un endpoint PHP sur Hostinger qui envoie les emails de contact vers eymericplaisant@gmail.com.

1. Dossier a deployer avec Hostinger Connector
- Source locale: hostinger-api/api/contact.php
- Cible distante recommandee: public_html/api/contact.php (ou dossier du sous-domaine api.ttbat.fr)

2. Configuration DNS
- Creer le sous-domaine api.ttbat.fr dans Hostinger.
- Pointer le sous-domaine vers le bon dossier web (souvent public_html ou public_html/api selon ton plan).

3. Configuration frontend
- Ouvrir index.html et definir:
  <meta name="ttbat-api-base" content="https://api.ttbat.fr">
- Optionnel: forcer endpoint exact:
  <meta name="ttbat-api-contact" content="https://api.ttbat.fr/api/contact.php">

4. Flux attendu
- Le formulaire appelle d'abord /api/contact, puis fallback /api/contact.php.
- Avec la meta ttbat-api-contact, il appellera uniquement l'URL configuree.

5. Test rapide
- Depuis ttbat.fr, soumettre le formulaire.
- Verifier reception sur eymericplaisant@gmail.com.
- Si echec: verifier logs d'erreur PHP et fonction mail() active chez Hostinger.

8. Activation email immediate
- Copier hostinger-api/api/.contact.env.example en hostinger-api/api/.contact.env
- Renseigner au minimum:
  CONTACT_TO=eymericplaisant@gmail.com
- Pour envoi SMTP fiable (recommande):
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE
- Uploader ensuite:
  - api/contact.php
  - api/.contact.env

9. Ordre d'envoi email dans contact.php
- PHPMailer SMTP (si present)
- SMTP natif (sans dependance externe)
- mail() PHP (fallback final)

10. Utiliser Resend (recommande)
- Dans api/.contact.env, definir:
  - RESEND_API_KEY=RE_xxx
  - RESEND_FROM=TTBAT <contact@ttbat.fr>
  - RESEND_ONLY=true
- Conserver CONTACT_TO=eymericplaisant@gmail.com
- Uploader contact.php et .contact.env

6. Securite incluse dans contact.php
- CORS restreint a ttbat.fr et www.ttbat.fr
- Validation stricte JSON + champs
- Honeypot website
- Verification temporelle form_ts
- Filtre anti-spam basique

7. Important
- Si mail() est limite sur ton offre Hostinger, passer a PHPMailer SMTP (recommande).
