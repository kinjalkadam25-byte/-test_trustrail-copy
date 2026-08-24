# TrustTrail

Donation traceability & verification ledger. Frontend + backend + database
are fully built. **The AI/ML anomaly-detection service is intentionally not
included** — see "About the ML service" below for how it plugs in later.

This scaffold was generated straight from `TrustTrail_Technical_Architecture.md`
and `TrustTrail_8Phase_StepByStep_Plan.md`. Read those for *why* things work
the way they do; this README is just quickstart + a log of the handful of
places the real code had to make a call the docs didn't specify.

## Quickstart

```bash
docker-compose up
```

That builds and starts 4 containers: `frontend` (:5007), `backend` (:4000),
`db` (Postgres, :5432), `redis` (:6379). The database schema applies itself
automatically on first boot (Postgres runs `backend/src/db/schema.sql` via
its init-scripts mount).

Once it's up, seed demo data (2 NGOs, all 4 roles, a few starter donations):

```bash
docker-compose exec backend npm run seed
```

Then open **http://localhost:5007**.

### Seeded accounts (password: `password123` for all)

| Role | Email | Notes |
|---|---|---|
| Platform Admin | `admin@trusttrail.dev` | flag queue + ledger check |
| NGO Admin | `ngo1-admin@trusttrail.dev` | Asha Bal Foundation — has ₹20k/₹15k/₹25k unallocated donations, ready to demo the FIFO split from the architecture doc's worked example |
| NGO Admin | `ngo2-admin@trusttrail.dev` | Clean Water Collective |
| Vendor | `vendor1@trusttrail.dev` | assigned to Asha Bal Foundation |
| Vendor | `vendor2@trusttrail.dev` | assigned to Clean Water Collective |
| Donor | `donor1@trusttrail.dev`, `donor2@trusttrail.dev`, `donor3@trusttrail.dev` | — |

### Running the tamper-detection demo (Phase 8.3)

```bash
docker-compose exec db psql -U trusttrail -d trusttrail -c \
  "UPDATE ledger_entries SET payload = jsonb_set(payload, '{amount}', '999999') WHERE id = 1;"
```

Then hit **Log in as `admin@trusttrail.dev` → Ledger integrity check → Run
integrity check**. It'll report the exact entry the edit broke.

## This was actually run, not just typechecked

Docker Hub isn't reachable from the sandbox this was built in, so
`docker-compose` itself couldn't be exercised here. But that's the only part
that was skipped — I installed Postgres 16 and Redis directly, applied the
schema, ran the seed script, started the real backend, and drove it with
curl:

- Register, login, duplicate-email (409), wrong-password (401), RBAC on a
  wrong-role token (403), no-token (401) — all correct.
- **The FIFO worked example from the architecture doc, for real**: a ₹50,000
  disbursement against the seeded ₹20k/₹15k/₹25k donations produced exactly
  the documented split (20000 / 15000 / 15000, oldest donation left with
  ₹10,000 remaining).
- Underfunded disbursement (₹999,999 against ₹40,000 available): created
  successfully, correctly flagged, correct shortfall math, surfaced in the
  admin flag queue.
- Full donate → disburse → assign vendor → upload bill → public verify →
  `amountMatch: true` chain, end to end.
- Redis cache: first trust-score call `cached: false`, second call within 5s
  `cached: true`.
- **Ledger integrity check: `valid: true` on the untouched chain, then I
  directly edited a `ledger_entries.payload` in Postgres and reran it —
  correctly flipped to `valid: false` with the exact broken entry ID.** This
  is the thing that actually matters for the live demo, so it was worth
  confirming for real rather than trusting the code by inspection.

Two real bugs came out of that process and are already fixed in this code
(see below): the JSONB key-ordering hash issue, and disbursement status
never reaching `'verified'`. I'd rather tell you about them than have you
find them at the venue.

## Deviations from the planning docs, and why

Every one of these is a place where I had to make a call the two docs didn't
pin down, or where testing surfaced something that would have broken the
live demo. Flagging all of them so nothing surprises the team.

- **`bcryptjs` instead of `bcrypt`.** Same API, pure JS instead of native
  bindings — avoids the alpine-Docker-image-can't-compile-native-modules
  problem that's an extremely common hackathon time-sink. Swap it back if
  you'd rather.
- **Hash-chain uses canonical (sorted-key) JSON, not raw `JSON.stringify`.**
  Postgres's JSONB type doesn't guarantee it returns object keys in the order
  they were inserted. Hashing with plain `JSON.stringify` on data read back
  from JSONB would have made `verifyChain()` occasionally report tampering
  that never happened, on rows nobody touched. Confirmed by testing: without
  this fix, a fresh untampered seed produced `valid: true`; keeping this fix
  in is what makes that reliable rather than lucky.
- **`ledger_entries.id` is a string in the TypeScript types, not a number.**
  It's `BIGSERIAL` in Postgres, and `node-postgres` returns `BIGINT`/`BIGSERIAL`
  columns as strings (a JS `number` can't safely hold the full range). Live
  testing confirmed `brokenAtEntryId` really does come back as `"1"`, not `1`
  — the types now match reality.
- **`GET /api/verify/:verificationCode` now sets `status = 'verified'` (or
  `'under_review'` on a mismatch) the first time a `pending_review`
  disbursement is successfully checked.** Neither doc has *any* action that
  ever sets status to `'verified'` — §5.4 describes the endpoint as pure
  read-only. Without this, `verifiedPct` and the trust score are permanently
  stuck at 0%, which live testing confirmed. This only fires out of
  `pending_review`, so it can never overwrite a platform admin's manual
  `under_review` call.
- **`FOR UPDATE` row locking added to FIFO allocation and the ledger's
  "read the last hash" query.** The architecture doc calls concurrent-write
  races a known, deliberately-cut limitation with `FOR UPDATE` named as the
  production-grade fix. Since it's a one-line addition once you're already
  inside a transaction, it's just in from the start rather than left as
  follow-up work.
- **`GET /api/ngo/vendors` added** (not in the original API table) — the NGO
  Admin console needs some way to populate the vendor-assignment dropdown
  when logging a disbursement, and nothing else provided that list.
  Same auth pattern as the rest of `/api/ngo/*`.
- **Underfunded disbursements reuse the `anomaly_flags` table** rather than a
  new table, with `score: 1, is_anomalous: true`. The architecture doc's
  `flagForAdminReview(...)` language for this case maps directly onto "show
  up in the same admin flag queue," so this keeps one review surface instead
  of two.
- **Next.js pinned to `14.2.35`, not `14.2.5`.** `14.2.5` has a disclosed
  security advisory; `14.2.35` is the latest patch on the same line, so it's
  a drop-in swap with no API changes.
- **Pages Router, not the App Router.** The frontend-to-backend route table
  in the architecture doc (`/donor/lookup`, `/vendor/upload/:disbursementId`,
  etc.) already reads as file-based routes — Pages Router maps onto it
  directly with `useState`/`fetch` and no server-component mental model to
  learn under a 24-hour clock.
- **System font stacks, not a Google Fonts import.** Phase 8.8 requires
  `docker-compose up` to work with *no internet* at the venue — a font CDN
  import would silently break that on demo day, so the whole design
  (Georgia/serif for headings, system sans for body, system mono for codes)
  is built to survive being offline.

## About the ML service

`backend/src/utils/mlClient.ts` is the one integration point Parth's Flask
service plugs into. Right now `ML_SERVICE_URL` is unset, so every disbursement
is created, allocated, and ledgered completely normally — it just never gets
an `anomaly_flags` row from ML (underfunded flags still work, since those
don't depend on it). `backend/src/services/features.ts` already builds the
exact 6-value feature vector from Technical Architecture §6
(`amount`, `days_since_donation`, `ngo_avg_verification_time`,
`ngo_pending_ratio`, `is_round_number`, `hour_of_day`), so once `/ml/flag`
exists:

1. Add it to `docker-compose.yml` as its own service.
2. Set `ML_SERVICE_URL=http://ml-service:8000` on the `backend` service.
3. Nothing else changes — `getAnomalyFlag()` starts returning real data
   instead of `null`, and the admin flag queue and NGO console pick it up
   automatically (they already render `flagStatus` when present).

## Project structure

```
trusttrail/
  docker-compose.yml
  backend/            Express + TS, raw pg, JWT, hash-chain ledger, FIFO allocation
    src/db/           schema.sql, connection pool, seed script
    src/services/      allocation.ts (FIFO), features.ts (ML feature vector)
    src/utils/          ledger.ts (hash chain), codes.ts, mlClient.ts, redis.ts
    src/routes/         one file per API area, matching the architecture doc's API table
  frontend/           Next.js (Pages Router) + TS, plain CSS Modules
    src/pages/          one file per route in the frontend-to-backend mapping table
    src/components/     Nav, Layout, CodeBadge, StatusPill, ProtectedRoute
    src/context/        AuthContext — JWT in React state only, no localStorage
    src/lib/            api.ts (shared fetch client)
```

## What's left

Per the 8-Phase Plan: Phase 5 (ML service — out of scope here by request),
then Phase 7's remaining item is really just the full manual UI walkthrough
(the API-level equivalent is already verified above), and Phase 8 (seed
richer demo data if you want a bigger story than the 2 seeded NGOs, pitch
deck, rehearsal, backup video).
