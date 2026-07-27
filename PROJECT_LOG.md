# Mou3allim — Project Log

A running record of what's built, why, and what's next. Update this as you go.
Newest entries at the top.

---

## 2026 — Security hardening pass (pre-launch)

### What changed and why

**Database (Neon, `production` branch)**
- Added `attempts` column to `otp_codes` — burns an OTP code after 5 wrong
  guesses. This survives a Render restart, unlike the in-memory rate limiter.
- Normalized all phone numbers to canonical `+216XXXXXXXX`. Previously the same
  person could exist as `00216...`, `216...`, or bare 8-digit — three separate
  rows AND three separate rate-limit buckets (a bypass).
- Took a backup branch `pre-security-backup` before making changes.

**Backend (repo: mou3allim-backend)**
- NEW `src/utils/phone.js` — normalizePhone() is the single source of truth for
  phone identity. Everything (login, register, OTP, rate-limit keys) uses it.
- NEW `src/middleware/rateLimit.js` — brute-force limits on login (8/15min per
  phone + 40/15min per IP), register (10/hr), OTP send/verify. IN-MEMORY, so
  Render free-tier spin-down wipes counters — acceptable only because bcrypt is
  slow and the DB attempts-column backs up the OTP path.
- `authController.js`:
  - Removed `bootstrapAdmin`. It promoted a user to admin via a GET request
    with the key in the query string → logged in Render request logs + browser
    history, on a PUBLIC repo. To make another admin now: run in Neon SQL editor
    `UPDATE users SET role='admin' WHERE phone='+216XXXXXXXX';`
  - Login is now timing-safe (runs a dummy bcrypt compare when the user doesn't
    exist) so response time doesn't reveal which numbers are registered.
  - Throws on startup if JWT_SECRET is missing — refuses to sign tokens with
    `undefined`. (JWT_SECRET IS set on Render.)
  - `resetPassword` returns 503 while OTP is disabled — see OTP note below.
  - register now returns `otp_required` so the frontend knows whether to show
    the SMS screen.
- `otpController.js`:
  - Gated behind `OTP_ENABLED` env var (currently false — no SMS provider yet).
    While false, OTP endpoints return 503 instead of silently "succeeding" with
    a code that only reached the server log.
  - OTP now generated with crypto.randomInt (CSPRNG), not Math.random.
  - Attempt-counting on verify (5 strikes, code burns).
- `server.js`:
  - Added helmet (security headers).
  - `app.set('trust proxy', 1)` — required so req.ip is the real client behind
    Render's proxy, otherwise all users share one rate-limit bucket. Value is 1,
    not true (true lets clients spoof X-Forwarded-For).
  - CORS locked to an allowlist: the Netlify site, localhost dev ports, and
    'null' (admin.html opened as a local file:// sends Origin: null).
  - 500 errors no longer leak internal messages to clients.
- `package.json` — added `helmet` and `express-rate-limit`.
- Fixed a latent bug: the `ratings` CREATE TABLE in schema.sql declared
  parent_id twice and never declared teacher_id — a rebuild-from-scratch would
  have failed silently. (Live table was fine; only matters for disaster recovery.)

**Website (repo: mou3allim-website)**
- `auth.html`: teacher registration checks `otp_required` — with SMS off,
  teachers skip the code screen and go straight to the dashboard. Admin approval
  is the real gate on search visibility, not OTP.
- `auth.html`: "forgot password" opens WhatsApp support (wa.me/21628357354)
  instead of the disabled OTP reset flow.

### Verified working
- Admin login with 0021628357354 / old formats (normalizer accepts them)
- bootstrap-admin route gone
- Rate limiting active behind Render proxy
- Teacher signup lands on dashboard (no dead-end)
- Forgot-password → WhatsApp
- Admin dashboard (local file) can reach the API (CORS 'null' allowed)

### Known state / gotchas
- OTP_ENABLED should be set to `false` explicitly in Render env (behaves as
  false regardless, but be explicit).
- One or more TEST TEACHER accounts may be half-registered from testing —
  clean up in Neon or approve as tests.
- admin phone is currently a placeholder (+21628000000). Real number is id 2
  (+21628357354). To swap: promote id 2 to admin, demote the placeholder.

---

## Still to do before real users (priority order)
1. SMS provider — nothing verifies phone ownership today. WhatsApp Business API
   likely cheaper/better-delivered into Tunisia than A2P SMS. When live, set
   OTP_ENABLED=true on Render (SMS won't send without provider creds anyway).
2. Neon backups — set a real cadence; check PITR retention on current plan.
3. Render paid tier — free tier cold-starts (~30-50s) and wipes rate-limit
   counters on spin-down.
4. admin.html hosting — keep OFF the public repo; password-protect if hosted.

---

## Reference
- Website: https://steady-puffpuff-806d91.netlify.app (auto-deploys from
  GitHub mou3allim-website via Netlify)
- Backend: https://mou3allim-backend-1.onrender.com (auto-deploys from
  GitHub mou3allim-backend via Render)
- Database: Neon, branch `production`
- Health check: https://mou3allim-backend-1.onrender.com/health
- Payment details (live): Flouci +216 28 357 354, CCP 13130593,
  WhatsApp 21628357354
- Admin dashboard: local admin.html file (not deployed)

---

## 2026 — Pre-launch round 3 (contact options, consent, safety, admin reset)

### What changed
**Website**
- **WhatsApp contact** on teacher profiles (teacher.html), next to the Call
  button. Link: https://wa.me/<digits> built from the teacher's normalized phone.
- **Teacher consent checkbox** at registration (auth.html) — required. Text:
  number will be visible to parents + accept terms. Parents don't see it.
- **Parent Mr/Mme title** instead of male/female (auth.html). Stored in the
  existing gender column (Mr=male, Mme=female). Teachers keep 👨/👩 (avatar).
- **Reviews show "Mr/Mme + first name"** (ratingController.js list query).
  Never full name, never phone.
- **Safety disclaimer** for parents on search.html (banner) and teacher.html
  (box near contact): Mou3allim does not verify teacher identity; parents are
  responsible for checking identity/references before lessons.
- **Certificate upload removed** from dashboard (CV kept, visible to parents).
- **Dashboard photo** now shows the same avatar parents see (was a 👤 emoji).
- **Security question is teacher-only** (parents don't set one).
- Parents can now **comment** when rating (comment box + send button); the
  guest-rating path was already removed (registration required to rate).

**Backend**
- adminRoutes.js: new POST /api/admin/reset-password {phone, new_password}
  (admin-only). Sets a new bcrypt hash. Used to close the manual-reset loop.
- ratingController.js: registration required to rate; first-name + title only.

### Parent phone privacy — VERIFIED
No public endpoint returns a parent's phone. Reviews expose only title+first
name. Teacher phones ARE public by design (parents call/WhatsApp them).

### PROCEDURE — how to reset a teacher's password (no SMS)
1. Teacher contacts you on WhatsApp saying they forgot their password.
2. Verify identity FIRST (strongest signals): are they messaging from the
   number ON the account? + payment detail (Flouci/CCP date/amount) + the
   security question via admin "Vérifier identité" tab.
3. In the Vérifier identité tab: enter their phone → Charger la question →
   ask it → type their answer → Vérifier. Green ✓ = verified.
4. A "Réinitialiser le mot de passe" box appears. Enter a temporary password
   (8+ chars) → Réinitialiser.
5. Send that temporary password to the teacher via WhatsApp. They log in with it.
Do NOT reset on the security question alone — require number control + one more
signal. For accounts with no security question, verify via number + payment.

### BACKUP REMINDERS
- All code lives in GitHub (mou3allim-backend, mou3allim-website) — recoverable.
- admin.html is a LOCAL file, NOT in any repo. Keep a backup copy (email/Drive/
  private repo). Losing it loses the whole admin dashboard.
- Neon: keep an occasional branch/snapshot before big DB changes.

### Still deferred (after launch)
- Proper Terms of Service + Privacy Policy (real legal text — the in-page
  disclaimer is NOT a substitute, especially re: minors + personal data).
- SMS/WhatsApp OTP for phone verification + self-service reset.
- Neon backup cadence, Render paid tier, teacher photo upload (optional).

---

## 2026 — Pre-launch round 4 (terms, contact, Arabic hidden, ops notes)

### What changed / decisions
- **Terms + Privacy page** `conditions.html` (French, general draft). Linked from:
  the teacher-registration consent checkbox AND the homepage footer.
  Covers: platform = connector (not employer), no identity verification (parent
  responsible), teacher phone public / parent phone private, prepaid codes,
  acceptable use, liability limit, data collected + usage. NOT legally reviewed.
- **Contact Us section** on homepage (index.html): WhatsApp (+216 28 357 354)
  live; EMAIL IS A PLACEHOLDER — replace `contact@mou3allim.tn` with the real
  address when ready.
- **Arabic hidden** (src/nav.js): FR/عربي switcher removed, French forced.
  Translation machinery (i18n.js) left intact. To re-enable: restore the
  lang-switch block + its two listeners in nav.js, translate strings in
  i18n.js, handle RTL layout. (Arabic was poor quality — deferred, do properly.)
- **Decision: one account per phone number** (kept strict). A teacher cannot
  also hold a parent account on the same number. Prevents review-gaming and
  self-rating. Revisit only if real users need dual roles.

### Netlify credits (IMPORTANT ops note)
- Free plan = 300 credits/month, HARD CAP, can never incur charges (site just
  pauses until next month if 100% hit). Warns at 50/75/90/100%.
- Deploys cost ~15 credits EACH — the main drain. Heavy editing days (many
  commits) burn credits fast. Hit 75% during round 3+4 editing.
- FIX: batch changes / commit less once stable. Deploy rate → ~0 after editing
  phase, so 300/mo is plenty for a small friends test.
- If paused mid-test: wait for month reset, or upgrade Personal ($9/mo, 1000 cr).

### Netlify URL / custom domain (TODO when going public)
- Renaming the netlify subdomain (e.g. mou3allim.netlify.app) is FREE and gives
  a nicer share link — BUT the site URL is in the backend CORS allowlist
  (server.js ALLOWED_ORIGINS). Renaming breaks the site until the backend
  allowlist is updated to the new URL. Coordinate both together.
- Custom domain (.com/.tn) ≈ $10–15/year, free HTTPS on Netlify. Same allowlist
  caveat: add the new domain to ALLOWED_ORIGINS in server.js.

### Still deferred (before real public launch)
- Proper legal review of Terms/Privacy (minors + personal data).
- Arabic translation done properly (native speaker + RTL).
- SMS/WhatsApp OTP, Neon backup cadence, Render paid tier ($7/mo always-on).
- Real contact email (replace placeholder).
