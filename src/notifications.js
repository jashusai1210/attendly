/**
 * ATTENDLY — Push Notifications Manager
 *
 * Requirements:
 * - Notification permission flow ONLY after user action (never unprompted).
 * - FCM token registration and refresh.
 * - Service worker registration (/firebase-messaging-sw.js).
 * - Stores device registration tokens in Firestore for Cloudflare Worker cron fan-out.
 */

import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { app, db, VAPID_KEY } from "./firebase.js";

/**
 * Check if Web Push and Service Workers are supported in current browser.
 */
export async function isPushNotificationSupported() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

/**
 * Get current browser notification permission status.
 */
export function getNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/**
 * Register the Service Worker.
 */
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker is not supported in this browser.");
  }
  return await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/"
  });
}

/**
 * Request notification permission and register FCM device token.
 * MUST be invoked directly from a user interaction (e.g. button click).
 *
 * @param {Object} user - Firebase Auth user object
 * @param {string} [customVapidKey] - Optional VAPID key override
 */
export async function enablePushNotifications(user, customVapidKey = VAPID_KEY) {
  if (!user?.uid) throw new Error("Sign in first to enable push notifications.");

  const supported = await isPushNotificationSupported();
  if (!supported) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  // 1. Request browser permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  // 2. Register Service Worker
  const swReg = await registerServiceWorker();
  await navigator.serviceWorker.ready;

  // 3. Obtain FCM token
  const messaging = getMessaging(app);
  const vapidKeyToUse = customVapidKey || VAPID_KEY;

  if (!vapidKeyToUse) {
    throw new Error("Firebase VAPID key is not configured. Please set VITE_FIREBASE_VAPID_KEY or configure it in Settings.");
  }

  const token = await getToken(messaging, {
    serviceWorkerRegistration: swReg,
    vapidKey: vapidKeyToUse
  });

  if (!token) {
    throw new Error("Could not acquire FCM push token from Firebase.");
  }

  // 4. Save token to Firestore for Cloudflare Worker scheduler
  // Stable ID based on token prefix to avoid collisions
  const tokenDocId = btoa(token.slice(0, 32)).replace(/[/+=]/g, "_");
  const tokenRef = doc(db, "fcmTokens", `${user.uid}_${tokenDocId}`);

  await setDoc(tokenRef, {
    uid: user.uid,
    token,
    userAgent: navigator.userAgent.slice(0, 100),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  });

  // Store in localStorage so the client knows it is active on this browser
  localStorage.setItem(`attendly_fcm_${user.uid}`, token);

  return token;
}

/**
 * Disable push notifications on this device.
 */
export async function disablePushNotifications(user) {
  if (!user?.uid) return;

  const storedToken = localStorage.getItem(`attendly_fcm_${user.uid}`);
  if (storedToken) {
    const tokenDocId = btoa(storedToken.slice(0, 32)).replace(/[/+=]/g, "_");
    try {
      await deleteDoc(doc(db, "fcmTokens", `${user.uid}_${tokenDocId}`));
    } catch (e) {
      console.warn("Could not remove token doc from Firestore:", e);
    }
    localStorage.removeItem(`attendly_fcm_${user.uid}`);
  }
}
