# Action Center alerts: Supabase setup

## Configure Supabase

1. Create a Supabase project and enable email/password sign-in.
2. Apply all SQL files in `supabase/migrations` in timestamp order (001, 002, then 003) using the Supabase SQL editor or CLI.
3. Copy `env.frontend.example` to `.env.local`; set the Supabase project URL and publishable/anon key. Set `VITE_ACTIONS_API_BASE_URL` to the Express backend URL. Keep `VITE_API_BASE_URL` aligned with the existing app configuration unless you intend to redirect all other app API calls too.
4. Copy `backend/env.example` to `backend/.env`; set the same project URL and anon key plus the service-role key. Never expose the service-role key to Vite or commit it.
5. Create/sign up a user with email and password, then set the Supabase Auth Site URL and allowed redirect URLs for local and deployed frontend origins.
6. Restart the Vite app and backend after changing environment variables.

The browser signs in through Supabase Auth. The Express API verifies each bearer token with Supabase Auth, then scopes every database request to the verified user ID. RLS is enabled as defense in depth. The service-role key is server-only.

## Alert behavior and current limit

The API supports listing, creating, and deleting user-owned alert conditions. The optional Express worker evaluates price conditions against Yahoo Finance VN quotes and records one-shot trigger events in Supabase. Enable it with `ALERT_WORKER_ENABLED=true`. Run exactly one continuously running backend service for this worker; serverless deployments that suspend processes cannot guarantee polling. A database lease prevents multiple app instances from polling simultaneously.

The worker ignores quotes older than `ALERT_MAX_QUOTE_AGE_MS` (default 30 minutes) and Radar snapshots older than `ALERT_MAX_RADAR_AGE_MS` (default 15 minutes), and records the source and timestamp with each event. Yahoo Finance quotes can be delayed and are not an exchange-grade execution feed. Trigger events are stored in-app and shown when the user returns; push/email delivery is not configured. New rules remain `pending` until the worker checks them, become `active` after a non-matching check, and become `triggered` once the threshold is crossed. Triggered rules are one-shot.

Supported conditions: price above, price below, percentage change above, and Radar convergence at least a selected score. Price thresholds use the application's displayed VND price units. Radar now reads `/api/sieu-quet-ai/scanner` from `VITE_RADAR_API_BASE_URL` (defaults to the existing scanner service), filters each row by `computedAt` (maximum age 26 hours), and falls back to demo data if the feed is unavailable, stale, or has too few usable rows. Core is the top 5 by SmartScore; Ring is ranks 6–16 among fresh rows. The six displayed checks are explicit thresholds on FA, TA, event impact, SmartScore, RS Rating, and positive trend confluence. The source scanner refreshes on its own schedule; only snapshots at most 15 minutes old can enter the alert pipeline. Radar snapshot synchronization and convergence alerts remain disabled by default at both frontend (`VITE_ENABLE_LIVE_RADAR_ALERTS=false`) and backend (`ALERT_RADAR_ENABLED=false`); enable both only when the scanner feed freshness is compatible with the alert interval and the backend worker is configured. The backend rejects snapshot writes and convergence alert creation while `ALERT_RADAR_ENABLED` is false, and the worker omits those alerts from evaluation.

## API

- `GET /api/alerts` — list the signed-in user's alerts.
- `GET /api/alerts/status` — show whether this backend has the evaluator enabled and recently completed a cycle.
- `POST /api/alerts` — create `{ "ticker": "FPT", "condition": "price_above", "threshold": 150000 }`.
- `DELETE /api/alerts/:id` — delete an alert owned by the signed-in user.
- `GET /api/alerts/events` — list recent trigger events for the signed-in user.
- `POST /api/alerts/radar-snapshots` — sync the authenticated user's current Radar scores for worker evaluation.
