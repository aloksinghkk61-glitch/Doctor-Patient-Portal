# Patient Portal

Node.js + Express API, PostgreSQL, vanilla-JS frontend (served by the same app).

## Run locally
    cp .env.example .env     # set JWT_SECRET (64+ random chars) and seed doctor credentials
    docker compose --env-file .env up --build
    # open http://localhost:3000

The schema is applied automatically on startup. The seed doctor account is created from `SEED_DOCTOR_*`.
Patients self-register; doctors/staff see all patients and can add labs, visit summaries, immunizations.

## Deploy (Render / Railway / Fly.io / any VPS)
1. Create a managed PostgreSQL database; copy its connection string.
2. Create a web service from this folder (uses the Dockerfile).
3. Set env vars: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, `DATABASE_SSL=true` (if the host requires TLS), `SEED_DOCTOR_EMAIL`, `SEED_DOCTOR_PASSWORD`.
4. Use HTTPS (the platforms do this for you). Health check path: `/healthz`.

## What's covered
- Profile, emergency contact, insurance; allergies, medications, immunizations, history, labs, visit summaries
- Appointments (request/confirm/cancel), secure messaging, refill requests, intake forms
- Auth: bcrypt, httpOnly JWT cookie (30 min), login rate limiting, role-based access (patient/doctor/staff)
- Audit log of every PHI read/write (`audit_log` table)
- `/fhir/Patient/:id` read endpoint as the starting point for EHR (FHIR) integration

## Before real patient data (not done here)
- MFA (TOTP) and password reset by email
- Encryption at rest, backups, hosting under a signed BAA (HIPAA) / DPA (GDPR)
- Card payments through Stripe or similar (never store card numbers)
- Staff account management UI, file uploads for imaging/PDF reports, HL7/FHIR sync with Epic/Cerner
- Legal/security review
