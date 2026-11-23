# ATTENDLY — Production Edition (Firebase Spark $0 + Cloudflare Worker Free Tier)

**ATTENDLY** is a high-performance student attendance tracking platform engineered specifically for **₹0 budget operation**. It runs 100% on the **Firebase Spark Free Plan** with zero Cloud Functions (no Blaze credit card required) and uses **Cloudflare Workers Free Tier** for automated cron scheduling and Web Push notifications.

---

## ⚡ Core Features & Rules Implemented

1. **One Class Per Day Tracking**:
   - Timezone: `Asia/Kolkata` (IST) date standard (`YYYY-MM-DD`).
   - Exactly one attendance record per day per user.
   - **ATTEND** increments total by 1 and attended by 1.
   - **ABSENT** increments total by 1 and attended by 0.
   - **Transaction-safe corrections**: Correcting a response updates the day's record and **never adds a second class**.
   - **Holiday exclusion**: Holidays add 0 classes and suppress attendance logging.
   - Stable document path: `/attendance/{uid}/daily/{YYYY-MM-DD}`.
   - Named, sequential courses with configurable 1–365 day periods (10 days by default); only one course can be active, and each has a fixed 80% minimum attendance target.

2. **Three-Location Geofencing (500 m Radius)**:
   - Campus Zone 1: `(13.5215604, 79.999208)`
   - Campus Zone 2: `(13.5599611, 80.0229769)`
   - Campus Zone 3: `(13.5517808, 80.0202619)`
   - Haversine distance evaluation against 500m radius.
   - Explicit signal states: `inside`, `outside`, `unknown`.
   - **Privacy First**: Raw coordinates are **never shared with friends or stored in Firestore**. Only neutral verification status flags are stored.
   - **GPS Uncertainty Disclaimer**: Browser GPS can be delayed, inaccurate, or spoofed; it is never presented as proof of cheating. Readings with accuracy > 200m or age > 5 minutes are marked `unknown`.

3. **Friend-Only Location Mismatch Warnings**:
   - Mutual acceptance required (`friendships` collection).
   - If a friend marked `attended` but their location signal was `outside`, friends see a friendly/savage Tenglish alert with an explicit GPS uncertainty note.
   - Only accepted friends can view attendance.

4. **Automated Push Notifications & Reminders**:
   - Admins configure each notification's title, message, enabled state, and send time in IST from the Admin console.
   - The weekday attendance prompt includes native `ATTEND` and `ABSENT` actions and is suppressed on holidays.
   - Thursday and Sunday reminders are independently configurable.
   - An optional in-app welcome notice can be shown when a student signs in; this is separate from device push notifications.
   - Permission requested **only upon explicit user click** in Settings.

5. **Original ATTENDLY Branding & 65 Savage Tenglish Roasts**:
   - Preserves original dark-cyber aesthetic (`#ef1748`, `#09090d`, `#110b11`), DM Sans and Space Grotesk typography, and `attendly.` wordmark.
   - Complete 65 original Tenglish roasts preserved in `/calc` and integrated dynamically across the dashboard.
   - Preserves 100% target handling (`Infinity` classes needed if any previous class was missed).

6. **Secure Admin Custom Claims**:
   - Designated administrator: `jashusai1210@gmail.com`.
   - Strict authorization via verified Firebase Auth custom token claim `admin === true` (never email-only client checks).
   - Direct access to `/admin` is denied without claim; navigation link is hidden from normal users.
   - Notification center, semester start date, sequential course scheduling/start/completion, Holiday CRUD, and Announcements broadcast system.
   - User account moderation (disable/enable) running natively on Firestore rules without Blaze.

---

## 🔒 Security & Compromised Credential Warning

> **CRITICAL SECURITY NOTICE**:
> Any service-account private key previously exposed in conversations or commits is **permanently compromised and must be revoked immediately**.
> 
> 1. Go to **Firebase Console → Project settings → Service accounts**.
> 2. Delete the old key.
> 3. Click **Generate new private key** to download a fresh JSON key.
> 4. Store that key securely on your local computer. **NEVER** commit it, upload it, paste it in chat, or place it inside the web app code or repository.

---

## 🛠️ Step-by-Step Setup Guide

### 1. Prerequisites
- Node.js 20+ or 22+ (verified on Node v24)
- A Firebase project on the free **Spark plan** (configured for `attendence77`)
- A free **Cloudflare** account (for the Workers cron scheduler)

---

### 2. Firebase Console Configuration (100% Free Spark Plan)

1. **Authentication**:
   - Enable **Email/Password** and **Google** providers.
   - Add `localhost` to **Authorized domains**.
2. **Firestore Database**:
   - Start in production mode.
   - Deploy the current `firestore.rules` before using courses; it authorizes course reads, admin-only course controls, and active-course attendance writes.
3. **Web App Configuration**:
   - Open **Project settings → General → Your apps → Web app**.
   - Copy your config into `.env.local`:
     ```bash
     cp .env.example .env.local
     ```
4. **Web Push VAPID Key**:
   - Open **Project settings → Cloud Messaging → Web configuration**.
   - Under **Web Push certificates**, click **Generate key pair**.
   - Copy the public key string into `.env.local`:
     ```env
     VITE_FIREBASE_VAPID_KEY=your_public_vapid_key_here
     ```

---

### 3. Grant Administrator Custom Claim

Admin access is granted via Firebase Authentication custom claims, executed locally on your machine with your fresh service account JSON:

```bash
# In PowerShell:
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure\fresh-service-account.json"
npm run admin:claim

# Or specify a different email:
npm run admin:claim -- user@example.com

# To verify claims:
npm run admin:claim -- --check

# To revoke admin claims:
npm run admin:claim -- --revoke
```

After granting the claim, sign out and sign back into the web app to refresh your ID token.

---

### 4. Run the Web App Locally

```bash
# Install dependencies
npm install

# Run unit tests (51 tests covering attendance, courses, geofencing, timetable, calendar dates, calculator, and worker)
npm test

# Run local development server
npm run dev
```

Open `http://localhost:5173`. Vite SPA fallback routes:
- `/` — Dashboard (Today's class, Geofence check, Target progress, Friends summary, Announcements)
- `/calc` — Attendance Calculator with all 65 Tenglish roasts
- `/calendar` — Attendance history, streaks, holidays, and personal exam, assignment, and campus-event reminders
- `/timetable` — Weekly class schedule with room details, end times, and overlap checks
- `/reports` — Attendance history, CSV export, and print/PDF
- `/friends` — Friend discovery, mutual requests, and friend-only attendance & mismatch alerts
- `/settings` — Profile management and Web Push notification toggle
- `/admin` — Admin control center (notification content and schedules, semester start date, courses, holidays, announcements, student accounts, audit log)

---

### 5. Deploy Cloudflare Worker Cron Scheduler (Free Tier)

The scheduler checks admin-configured notification schedules once per minute and sends only when the configured IST day and minute match. The weekday prompt is automatically suppressed for holidays.

1. Install Wrangler if not already installed:
   ```bash
   npm install -g wrangler
   ```
2. Log in to Cloudflare:
   ```bash
   wrangler login
   ```
3. Set your production secrets (store your new service account credentials safely):
   ```bash
   cd worker
   npx wrangler secret put FIREBASE_PROJECT_ID
   # Enter: attendence77

   npx wrangler secret put FIREBASE_CLIENT_EMAIL
   # Enter: your-service-account-email@attendence77.iam.gserviceaccount.com

   npx wrangler secret put FIREBASE_PRIVATE_KEY
   # Paste the full private key including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----
   ```
4. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```
5. Verify the `* * * * *` cron trigger in the Cloudflare dashboard. This checks schedules; notifications are sent only at their configured times.

The Worker changes in `worker/index.js` and `worker/wrangler.toml` must be deployed for admin-edited push schedules and content to take effect. Firestore rules must also be deployed before admins can save settings.

---

### 6. Deploy Web App to Firebase Hosting

```bash
# 1. Build production assets
npm run build

# 2. Deploy Firestore Security Rules and Hosting
firebase login
firebase use attendence77
firebase deploy --only firestore:rules,hosting
```

---

## 🧪 Verification & Test Suite

Run the automated test suite anytime:

```bash
npm test
```

### Test Coverage
- `tests/geofence.test.js`:
  - Three campus zone centers (`zone-1`, `zone-2`, `zone-3`) within 500m radius.
  - Haversine distance accuracy.
  - Boundary checks (inside at 490m, outside at 520m).
  - Coarse GPS accuracy threshold (> 200m marked `unknown`).
  - Stale readings (> 5 minutes marked `unknown`).
  - Zero coordinate leakage (privacy validation).
- `tests/attendance.test.js`:
  - Asia/Kolkata date generator across UTC/IST midnight boundaries.
  - First-time ATTEND (+1 total, +1 attended).
  - First-time ABSENT (+1 total, +0 attended).
  - Correction from ABSENT to ATTEND (+1 attended, total unchanged).
  - Correction from ATTEND to ABSENT (-1 attended, total unchanged).
  - Idempotent resubmission.
  - Admin holiday suppression.
- `tests/calculator.test.js`:
  - Attendance percentage and classes needed.
  - Target reached vs target not reached.
  - Bunkable classes calculation.
  - 100% target handling (`Infinity` when attended < total).
  - Error validation on zero total, negative numbers, floats, attended > total.
  - Complete 65 Tenglish roasts coverage across all percentage brackets.
- `tests/worker.test.js`:
  - UTC to IST timezone conversion.
  - Configurable schedules, titles, messages, and enable/disable defaults.
  - Exact weekday/day-and-minute dispatch matching.

---

## 🔄 Rollback Procedures

- **Web Hosting**:
  In Firebase Console → Hosting → Release history, click the three dots on any previous release and select **Rollback**.
- **Firestore Rules**:
  In Firebase Console → Firestore Database → Rules, click **History** to restore a previous revision.
- **Cloudflare Worker**:
  In Cloudflare Dashboard → Workers & Pages → `attendly-scheduler` → Deployments, click **Rollback** to instantly restore a previous worker deployment.
