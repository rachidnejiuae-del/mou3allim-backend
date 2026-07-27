# Mou3allim — Where we are (session summary)

## Live system
- Website: https://steady-puffpuff-806d91.netlify.app (GitHub mou3allim-website → Netlify auto-deploy)
- Backend: https://mou3allim-backend-1.onrender.com (GitHub mou3allim-backend → Render auto-deploy)
- Health check: https://mou3allim-backend-1.onrender.com/health  → {"status":"ok"}
- Database: Neon, branch `production`
- Admin login: +21628357354 (its password) — admin.html is a LOCAL file (not in any repo)

## DONE this session (all deployed & tested)
Security: rate limiting (login/register/OTP), phone normalization (+216 canonical),
  bootstrap-admin backdoor removed, helmet, trust proxy, CORS locked to site+admin,
  OTP attempt-counting, timing-safe login, JWT_SECRET boot guard, no error leaks,
  8-char password minimum, ratings schema bug fixed.
Accounts: teacher security question (hashed) + admin "Vérifier identité" tab +
  admin password-reset button (verify → set temp password → send via WhatsApp).
Product: parents register to rate (no more guest ratings), can add a comment,
  reviews show "Mr/Mme + first name" only (never phone), Mr/Mme titles for parents,
  WhatsApp + Call buttons on teacher profiles, safety disclaimers (search + profile),
  teacher consent checkbox linking to Terms, certificate upload removed (CV kept),
  dashboard photo consistent with public view.
Pages: conditions.html (Terms + Privacy, French, general draft) linked from consent
  checkbox + homepage footer. Contact section on homepage (WhatsApp live + EMAIL
  PLACEHOLDER contact@mou3allim.tn — replace when ready). Arabic switcher hidden
  (French forced; i18n machinery kept).
Decisions: one account per phone number (kept strict). OTP_ENABLED=false on Render.
Cleanup done: test accounts deleted; only real accounts remain; admins removed from
  teacher directory.

## LAST STEP TO CONFIRM
- src/nav.js (Arabic hidden) — make sure this was committed. index.html (Contact) done.

## OPEN DECISION FOR TOMORROW: go public?
Not one switch — options discussed:
  A) Soft launch: seed 5–10 real approved teachers FIRST (directory is empty now),
     keep backend warm, then invite parents.
  B) Go fully public now.
  C) Detailed pre-public checklist.
Before ANY public traffic, address:
  1. Empty teacher directory → seed real teachers or first visitors see nothing.
  2. Render cold-start (~40s on free tier) → free uptime pinger OR $7/mo Render upgrade.
  3. Netlify credits at 75% this month (deploys cost ~15 each) → batch commits; if 100%
     site pauses till month reset. Free plan never charges.
  4. Deferred: real legal review of Terms; no phone verification (SMS/WhatsApp OTP).

## HOUSEKEEPING
- Back up admin.html off your computer (only file not in GitHub).
- Netlify rename / custom domain: FREE rename or ~$10–15/yr domain, BUT must update
  backend CORS ALLOWED_ORIGINS (server.js) in the same step or site breaks.

## DEFERRED (before real public launch)
- Legal review of Terms/Privacy (minors + data).
- Arabic done properly (native speaker + RTL).
- SMS/WhatsApp OTP, Neon backup cadence, Render paid tier, real contact email.
