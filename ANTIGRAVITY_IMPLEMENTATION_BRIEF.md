# ATTENDLY — Antigravity implementation handoff

## Important
This package contains the original source project and this implementation brief. It is NOT a completed or production-tested implementation. Open the folder in Antigravity and follow this brief before producing a final ZIP.

## User requirements
- Budget ₹0. Do not require Firebase Blaze, paid APIs, subscriptions, or paid services.
- User has exactly one class per day.
- One attendance record per user per Asia/Kolkata date: ATTEND adds 1 total and 1 attended; ABSENT adds 1 total and 0 attended. Correcting a response updates the same record and must never add a second class. Holidays add no class and suppress attendance prompts.
- Preserve original ATTENDLY branding, wordmark, colours, design, navigation, calculator, and Tenglish roast content. Do not replace with generic dashboard. Savage Tenglish roasts are core.
- Preserve calculator logic including current 100% target handling.
- Admin email: jashusai1210@gmail.com. Admin authorization must use verified Firebase custom claim `admin === true`, not email-only client checks. Hide admin navigation from normal users and deny direct `/admin` access without claim.
- Friend relationships require mutual acceptance. Friend visibility and mismatch alerts are friends-only.
- Geofence centres (500 m radius each): (13.5215604,79.999208), (13.5599611,80.0229769), (13.5517808,80.0202619). Inside ANY zone is an inside location signal. Outside all is outside. Denied, inaccurate, stale or unavailable GPS is unknown/unverified, not proof of cheating. Browser GPS can be spoofed; never present it as proof.
- Do not share precise coordinates with friends. Only show neutral unverified/mismatch status and allow correction. Never publicly accuse users.
- Weekday attendance prompt: 9:00 AM Asia/Kolkata, Monday-Friday, with ATTEND/ABSENT actions where supported. Fallback opens app response route.
- Thursday 6:00 PM IST message: “Repu oka roju clg ki poo 2 day's holidays”.
- Sunday 6:00 PM IST message: “2 days rest tisukunav gaa inkem clg ki poo”.
- Admin holiday management suppresses scheduled prompts and excludes holidays from attendance totals.
- Friend-only mismatch warnings and Tenglish roasts when attendance conflicts with location signal, clearly explaining GPS uncertainty.
- Minimize user setup. Do not ask for Cloudflare account until implementation and local tests are ready.

## Security and architecture
- Inspect the existing Vite/Firebase source before editing.
- Firebase Spark only. Do not depend on Firebase Cloud Functions requiring Blaze. Proposed free scheduler is Cloudflare Workers Cron, but verify current limits before claiming compatibility.
- User exposed a service-account private key in chat. Treat it as compromised and revoked. NEVER reuse it. Never put private keys in frontend, source, ZIP, logs, or this brief. New key only as protected Cloudflare Worker secret; never ask user to paste it into chat.
- Worker must cryptographically verify Firebase ID tokens and claims; never trust decoded-but-unverified JWT.
- Email verification does not grant admin claim. Provide secure one-time custom-claim bootstrap using trusted local environment or protected secret.
- Web Push requires Firebase VAPID public key and service worker. Document how user gets VAPID key. Private service-account key stays secret.
- Respect Cloudflare Free CPU, subrequest, cron and execution limits. Implement bounded batches, idempotency, retries and pagination for FCM fan-out.
- Native notification action buttons vary by browser/OS; provide reliable click-to-open fallback. Never claim universal support.
- Use stable per-day attendance document IDs and transaction-safe writes; enforce owner, accepted-friend, and admin permissions in Firestore rules.
- Never expose precise location. Do not log PII or secrets.

## Implementation plan
1. Audit `src/main.js`, `src/firebase.js`, `src/style.css`, `firestore.rules`, `firebase.json`, `functions/`, package files and standalone calculator.
2. Implement one-class-per-day attendance with Asia/Kolkata date handling, idempotent updates, corrections and holiday exclusion.
3. Implement Haversine geofence helper with accuracy and freshness thresholds and explicit `inside`, `outside`, `unknown` states. Add unit tests for zone centres, boundaries, poor accuracy, denied and stale GPS.
4. Implement notification permission flow (only after user action), FCM token registration/refresh, service worker and action/click fallback.
5. Implement Cloudflare Worker cron scheduler with verified Firebase auth, holiday checks, FCM v1, bounded batches, idempotency and safe logs. Add config and placeholder-only `.dev.vars.example`.
6. Implement admin holiday CRUD and announcements with server-side authorization and Firestore rules.
7. Implement accepted-friends-only mismatch warnings without coordinates.
8. Convert schedule carefully: 9 AM IST = 03:30 UTC; 6 PM IST = 12:30 UTC. Ensure weekday mapping is correct.
9. Run `npm ci`, `npm run build`, tests and rules tests where practical. Report actual pass/fail. Do not claim build/deploy/push success unless verified.
10. Update README with Spark-only setup, secrets, VAPID, admin custom claim, deploy and rollback.
11. Remove Blaze-dependent Functions deploy path if no longer used.
12. Produce final source ZIP only after build/tests pass; exclude `node_modules`, `.git`, caches and reproducible build output.

## Expected result
Deliver working source, tests, setup guide and a factual verification report. Do not fabricate admin status, successful push delivery, build, or deployment.
