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

## 2026 — Account security additions (pre-launch, part 2)

### What changed
- **Password minimum raised 6 → 8 characters** (authController.js + auth.html).
- **Security question at signup.** New DB columns `users.security_question` and
  `users.security_answer_hash`. The answer is HASHED (bcrypt, normalized to
  lowercase/trimmed) — never stored or displayed in plaintext, not even to admin.
- **Admin "Vérifier identité" tab** (admin.html, local file). Two admin-only
  endpoints in adminRoutes.js:
  - GET  /api/admin/verify-identity?phone=  → returns the account's QUESTION
    (plus name/role/signup date) so admin knows what to ask. Never returns the answer.
  - POST /api/admin/verify-identity {phone, answer} → returns {match:true/false}.
    Server hashes the submitted answer and compares; admin sees only ✓ / ✗.
- Existing pre-change accounts have blank security questions; the admin panel
  detects this and tells the admin to verify another way.

### IMPORTANT — how to verify identity for a WhatsApp password reset
Security questions alone are WEAK (an acquaintance may know "school name" /
"mother's name"). Do NOT reset on the question alone. Stack signals, strongest first:
  1. **Number control** — is the person messaging from the WhatsApp number ON the
     account? Best signal. Different number = red flag, require much more.
  2. **Payment trail** — for teachers who bought a code: which number/method/date/
     amount did they pay from? Hard for an impostor to fake.
  3. **Security question** — supporting signal only, via the admin Vérifier tab.
Rule of thumb: reset only if (number control) AND (payment OR question) check out.

### Deliberate design notes
- Answer is irreversible: if a teacher forgets their own answer, it CANNOT be
  recovered — fall back to number-control + payment checks.
- Because the admin can't read answers either, dashboard access can't leak them.

### Deferred (do after launch, low risk)
- **Option A: custom security questions.** Let teachers write their OWN question
  instead of picking from the fixed list — makes answers much harder to guess.
  Small edit to auth.html. Not a launch blocker.
- **Option C (stronger, later): manual OTP resets.** WhatsApp a 6-digit code to
  the REGISTERED number and have them read it back — proves control, not just
  knowledge. Gold standard once volume grows.
