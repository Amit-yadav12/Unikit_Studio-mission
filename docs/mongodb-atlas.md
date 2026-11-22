# MongoDB Atlas integration — status and setup

## Current status: BLOCKED BY CONFIGURATION

The application today persists to **PostgreSQL via Drizzle ORM** (`DATABASE_URL`).
MongoDB Atlas is **not** connected. Two blockers, both outside the codebase:

1. **No `MONGODB_URI` has been supplied.** There is no Atlas cluster, database user,
   or connection string available in this environment, and credentials must never
   be invented.
2. **This deployment platform's database contract is PostgreSQL** (connection via
   `DATABASE_URL`, schema in `src/db/schema.ts`). Swapping the driver without a
   verified Atlas target would replace a working, tested persistence layer with
   an unverifiable one.

Nothing in this document should be read as "MongoDB works". It is the exact,
ordered procedure to make it work, plus the code mapping a migration would use.
Persistence on the current stack is verified separately (see
`docs/deployment.md`): jobs survive process restarts and are owner-isolated.

## If you provide Atlas: setup (project owner steps)

1. **Create a project** in MongoDB Atlas and a cluster (M10+ for production;
   the free M0 tier is fine for staging).
2. **Create a dedicated database user** (e.g. `unikit_app`) with only
   `readWrite` on the application database. Never use your Atlas account
   credentials or an admin user in the app.
3. **Network access:**
   - Vercel serverless functions have **no fixed egress IPs**, so IP allowlisting
     alone does not work there. Either:
     - allow `0.0.0.0/0` **and** rely on the strong database-user password +
       TLS (documented risk: any host can attempt authentication), or
     - put the API on a host with static egress IPs and allowlist only those, or
     - use Atlas Private Endpoints / VPC peering on supported tiers.
   - Never leave `0.0.0.0/0` enabled without understanding the above.
4. **Get the connection string** (Connect → Drivers):
   `mongodb+srv://<USERNAME>:<PASSWORD>@<CLUSTER_HOST>/<DATABASE_NAME>?retryWrites=true&w=majority`
   URL-encode special characters in the password.
5. **Configure environments:**
   - Local: copy `.env.example` to `.env`, set `MONGODB_URI` (and optionally
     `MONGODB_DB_NAME` to override the database name in the URI).
   - Vercel: Project → Settings → Environment Variables → add `MONGODB_URI` for
     Production (and a *separate staging cluster/DB* for Preview).
6. **Verify before trusting it:**
   ```bash
   curl -s https://<host>/api/health        # database.connected must be true
   npm test                                  # API suite incl. ownership checks
   ```
   Then create a job, restart the service, and read the job back.

## Code mapping for the migration

The current data-access surface is deliberately small. All persistence flows
through `src/server/services/storageService.ts` and `src/db/schema.ts`.
A Mongoose migration replaces those two files; routes, controllers and the
REST contract (`/api/v1/**`) do not change.

| PostgreSQL table (today) | Mongoose model | Key fields | Indexes (matching real queries) |
| --- | --- | --- | --- |
| `jobs` | `OptimizationJob` | owner (`sessionId` today → `ownerId`), `kind` enum, `status` enum, input/output/saved bytes, timestamps | `{ ownerId: 1, createdAt: -1 }`, `{ ownerId: 1, kind: 1 }` |
| `job_items` | embedded in `OptimizationJob.items` **or** `JobItem` | per-file bytes, dimensions, status, produced filename | `{ jobId: 1 }` if separate |
| `job_artifacts` | `AssetArtifact` (metadata only) | `jobId`, `ownerId`, filename, contentType, byteSize, `expiresAt`, storage ref | `{ ownerId: 1, createdAt: -1 }`, `{ expiresAt: 1 }` (TTL, artifacts only) |
| `preferences` | `Preference` | `ownerId` unique, optimizer defaults | `{ ownerId: 1 }` unique |

Rules that already hold and must carry over:

- **No image bytes in history documents.** Binaries currently live in
  `job_artifacts.data` (bytea) with a TTL; the Mongo equivalent is object
  storage (S3-compatible) with only a metadata reference here, or — for small
  outputs only — a segregated artifacts collection. Do not base64 binaries
  into job documents.
- **TTL indexes apply to artifacts, never to history records.** An artifact may
  expire while its history row remains.
- **Ownership is enforced in every query** (`ownerId` / guest `sessionId`),
  never by trusting an ID from the request body. Guest session IDs are
  high-entropy (UUID in an httpOnly cookie); they are not cross-device
  identities — guest history does not follow a user to another browser.
- **Connection:** one cached `mongoose.connect()` promise per runtime instance
  (global cache, as serverless instances are reused and recycled), bounded
  pool (`MONGODB_MAX_POOL_SIZE`), explicit server-selection timeout, no
  unbounded retries, no per-request index creation.
- **Savings integrity:** `savedBytes = inputBytes − outputBytes` is computed
  server-side; schema validators reject negative file sizes.

## Migrating existing PostgreSQL data (optional)

History is session-scoped and artifacts expire (`OW_ARTIFACT_TTL_HOURS`, default
720 h), so for most deployments the correct migration is: deploy with Mongo,
let new jobs write there, and let old artifacts age out. If records must be
carried over:

1. Freeze writes, export with `psql --copy` (jobs/job_items as CSV, artifacts
   separately — they are binary).
2. Transform IDs (UUID → keep as string `_id` or map to ObjectId with a lookup
   table), then `mongoimport` per collection.
3. Re-run the API suite's ownership checks against the migrated data before
   opening traffic.

## What would change if `MONGODB_URI` is provided

1. Add `mongoose`, create `src/server/db/mongo.ts` (cached connection) and
   `src/server/models/*.ts` per the table above.
2. Reimplement `storageService.ts` against the models (same exported function
   signatures — callers do not change).
3. Point `GET /api/health` at a bounded `db.admin().ping()`.
4. Run the full suite (connection, CRUD, ownership, restart-persistence,
   failure paths) against a **staging** Atlas database — never destructive
   tests against production.
