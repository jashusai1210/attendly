/**
 * ATTENDLY — Secure Admin Custom Claim Bootstrap Script
 *
 * Requirements:
 * - Admin authorization must use verified Firebase custom claim `admin === true`.
 * - Admin email: jashusai1210@gmail.com.
 * - Local trusted execution only via GOOGLE_APPLICATION_CREDENTIALS.
 * - Never reuse any compromised service-account key.
 * - Never put private keys in frontend, source code, or repository.
 *
 * Usage:
 *   1) Download a fresh, uncompromised Service Account JSON from Firebase Console:
 *      Project Settings > Service accounts > Generate new private key.
 *   2) Set environment variable in your terminal:
 *      PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure\attendence77-service-account.json"
 *      Bash:       export GOOGLE_APPLICATION_CREDENTIALS="/secure/attendence77-service-account.json"
 *   3) Run:
 *      npm run admin:claim                      # Grants admin to jashusai1210@gmail.com
 *      npm run admin:claim -- user@example.com  # Grants admin to specific email
 *      npm run admin:claim -- --check           # Checks claims of jashusai1210@gmail.com
 *      npm run admin:claim -- --revoke          # Revokes admin claim
 */

import admin from "firebase-admin";
import fs from "node:fs";

const args = process.argv.slice(2);
let isCheck = false;
let isRevoke = false;
let email = "jashusai1210@gmail.com"; // Default requested administrator email

for (const arg of args) {
  if (arg === "--check") isCheck = true;
  else if (arg === "--revoke") isRevoke = true;
  else if (!arg.startsWith("--")) email = arg.toLowerCase().trim();
}

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error("\n❌ ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.");
  console.error("Please point it to your private Firebase service-account JSON file:");
  console.error('  PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\secure\\service-account.json"');
  console.error('  Bash:       export GOOGLE_APPLICATION_CREDENTIALS="/secure/service-account.json"\n');
  process.exit(1);
}

if (!fs.existsSync(credPath)) {
  console.error(`\n❌ ERROR: Service account file does not exist at: ${credPath}\n`);
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });

  const auth = admin.auth();
  const user = await auth.getUserByEmail(email);

  if (isCheck) {
    console.log(`\n🔍 Checking custom claims for: ${email} (${user.uid})`);
    console.log("Current claims:", user.customClaims || "No custom claims set.");
    console.log(`Admin status: ${user.customClaims?.admin === true ? "✅ ACTIVE ADMIN" : "❌ NOT ADMIN"}\n`);
  } else if (isRevoke) {
    const updatedClaims = { ...(user.customClaims || {}) };
    delete updatedClaims.admin;
    await auth.setCustomUserClaims(user.uid, updatedClaims);
    console.log(`\n🚫 Admin claim revoked for: ${email} (${user.uid}).\n`);
  } else {
    const updatedClaims = { ...(user.customClaims || {}), admin: true };
    await auth.setCustomUserClaims(user.uid, updatedClaims);
    console.log("\n=======================================================");
    console.log(`✅ SUCCESS: Granted { admin: true } custom claim to:`);
    console.log(`   Email: ${email}`);
    console.log(`   UID:   ${user.uid}`);
    console.log("=======================================================");
    console.log("⚠️ IMPORTANT: If the user is currently signed in, they must");
    console.log("   sign out and sign back in for the new ID token with the");
    console.log("   verified admin claim to take effect.\n");
  }

  await admin.app().delete();
} catch (error) {
  console.error("\n❌ Error executing admin claim operation:", error.message || error);
  process.exit(1);
}
