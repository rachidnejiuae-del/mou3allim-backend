# Mou3allim Backend — API for Tunisian Teachers App

Node.js + Express + PostgreSQL.

## Setup

```bash
npm install
cp .env.example .env   # then edit DATABASE_URL, JWT_SECRET
npm run migrate        # creates tables + seeds subjects
npm run dev            # starts on http://localhost:4000
```

Requires a running PostgreSQL instance. Quick local option:
```bash
docker run --name tn-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tn_teachers -p 5432:5432 -d postgres:16
```

## Auth
All protected routes need `Authorization: Bearer <token>` header (returned from register/login).

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | — | `{ phone, password, full_name, role }` role = parent\|teacher |
| POST | /api/auth/login | — | `{ phone, password }` |

## Teachers
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | /api/teachers/search?subject=&governorate=&q= | — | Public search (approved + paid only) |
| GET | /api/teachers/:id | — | Public profile detail |
| GET | /api/teachers/:id/ratings | — | List ratings/comments |
| PUT | /api/teachers/me | teacher | Update bio, governorate, subjects+prices |
| POST | /api/teachers/me/photo | teacher | multipart/form-data, field `photo` |
| POST | /api/teachers/:id/ratings | parent | `{ score: 1-5, comment }` |

## Subscriptions (prepaid code system)
No online payment yet — teachers activate their subscription with a code you generate and hand out (e.g. via a prepaid card, WhatsApp message, etc).

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | /api/subscriptions/redeem | teacher | `{ code: "MOU3-XXXX-XXXX" }` → activates subscription instantly |

## Admin — Codes
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/admin/codes/generate | `{ plan: "monthly"\|"yearly", count: 5 }` → returns generated codes |
| GET | /api/admin/codes | List all codes with status (unused/used/disabled) |
| PATCH | /api/admin/codes/:id/disable | Invalidate an unused code |

## Admin (role=admin)
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/admin/teachers/pending | List profiles awaiting approval |
| PATCH | /api/admin/teachers/:id/approve | Approve a profile |
| PATCH | /api/admin/teachers/:id/reject | `{ reason }` Reject a profile |

To create your first admin user: register normally, then manually run:
```sql
UPDATE users SET role = 'admin' WHERE phone = '+216XXXXXXXX';
```

## Lookups
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/subjects | List subject catalog |
| GET | /api/governorates | List all 24 Tunisian governorates |

## Notes / what's still missing for production
- OTP-based phone verification (currently plain password auth)
- No real money flow yet — codes are free to generate; if you eventually sell prepaid cards in stores, that's a separate offline process (you just generate the matching codes here)
- Rate limiting + input sanitization hardening
- Photo storage on S3/Cloudinary instead of local disk (local disk won't survive redeploys on most hosts)
- Automated subscription expiry checks (a cron job to flag expired teachers, currently just checked at query time via `ends_at > NOW()`)
