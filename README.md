# Human Observation Worker

Serverless Cloudflare Worker that provisions a SaaS-style dashboard for first-time admin creation and ongoing psychological observation logging. Database schema and storage buckets are provisioned entirely in code (no manual console setup required beyond binding D1 and R2).

## Features
- **First-run admin provisioning**: POST `/api/setup-admin` only succeeds when no admin exists, locking down the dashboard after the initial creation.
- **Subject capture**: API endpoint to log observed individuals with contact details, habits, and researcher notes.
- **Media handling**: Upload subject photos to R2 with sanitized keys and preserved content types.
- **Automatic schema creation**: Tables, indexes, and foreign keys are created during Worker startup so you never touch the database manually.
- **Performance-conscious UI**: Root route serves a cached, SaaS-inspired dashboard shell that flips between setup and dashboard modes using live API calls.

## Endpoints
- `GET /` — Cached HTML dashboard shell that checks setup status and provides forms for admin provisioning and subject creation.
- `GET /api/status` — Returns `{ adminExists: boolean }` to drive the first-time setup flow.
- `POST /api/setup-admin` — Body `{ email, password }`. Creates the initial admin when none exists; enforced length checks.
- `POST /api/subjects` — Body `{ adminId, fullName, contact?, habits?, notes? }`. Persists a subject record and returns the new ID.
- `POST /api/upload-photo` — Body `{ subjectId, filename, contentType, data }` where `data` is Base64. Uploads to R2 with `httpMetadata.contentType` and records the object key.

## Data model (D1)
- `admins` — `email`, `password_hash`, timestamps. Indexed by email.
- `subjects` — Linked to `admins`, stores names, contact, habits, and notes with timestamps. Indexed by admin and name.
- `subject_media` — Records R2 object keys per subject with stored content types.

Schema creation happens on each request before any queries, and foreign key enforcement is explicitly enabled via `PRAGMA foreign_keys = ON;`. Essential columns are marked `NOT NULL`, timestamps are stored as ISO8601 `TEXT`, and booleans use integer flags when needed.

## Running locally
1. Install Wrangler if needed: `npm install -g wrangler`.
2. Start the Worker with live D1/R2 bindings:
   ```bash
   wrangler dev
   ```
3. Visit `http://localhost:8787/` to walk through first-time admin creation, then use the dashboard forms.

## Deployment notes
- `placement.mode` is set to `smart` in `wrangler.toml` to keep execution close to the D1 database.
- The Worker caches the dashboard shell with `caches.default` for 10 minutes to limit D1 reads.
- Media uploads always set `httpMetadata.contentType` and sanitize object keys for URL safety.
