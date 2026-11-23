/**
 * ATTENDLY — Three-Location Geofence Module
 *
 * Requirements:
 * - Three-location geofencing (500 m radius each)
 * - Centres:
 *     1: (13.5215604, 79.999208)
 *     2: (13.5599611, 80.0229769)
 *     3: (13.5517808, 80.0202619)
 * - Inside ANY zone is an inside location signal. Outside all is outside.
 * - Denied, inaccurate, stale (> 5 min), or unavailable GPS is unknown/unverified.
 * - Browser GPS can be spoofed; never present it as proof of cheating.
 * - Never share or store precise coordinates with friends. Only store and share
 *   neutral unverified/inside/outside status.
 */

export const EARTH_RADIUS_METERS = 6371000;

export const CAMPUS_GEOFENCE_ZONES = [
  { id: "zone-1", name: "Campus Zone 1", latitude: 13.5215604, longitude: 79.999208, radiusMeters: 500 },
  { id: "zone-2", name: "Campus Zone 2", latitude: 13.5599611, longitude: 80.0229769, radiusMeters: 500 },
  { id: "zone-3", name: "Campus Zone 3", latitude: 13.5517808, longitude: 80.0202619, radiusMeters: 500 }
];

export const GEOFENCE_CONFIG = {
  radiusMeters: 500,
  maxAccuracyMeters: 200,      // Accuracy worse than 200m is too coarse to be trusted
  maxAgeMilliseconds: 5 * 60 * 1000 // 5 minutes freshness window
};

/**
 * Calculate the great-circle distance between two points in meters using the Haversine formula.
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Evaluate a location reading against the 3 campus zones.
 * Returns an evaluation object WITHOUT raw coordinates to preserve privacy.
 *
 * @param {Object|null} reading - { latitude, longitude, accuracy, timestamp }
 * @param {number} [currentTimeMs=Date.now()]
 * @returns {{ status: 'inside' | 'outside' | 'unknown', reason: string, accuracy: number|null, nearestDistanceMeters: number|null, zoneId: string|null }}
 */
export function evaluateLocationSignal(reading, currentTimeMs = Date.now()) {
  if (!reading || typeof reading !== "object") {
    return {
      status: "unknown",
      reason: "No location reading provided or GPS disabled",
      accuracy: null,
      nearestDistanceMeters: null,
      zoneId: null
    };
  }

  const { latitude, longitude, accuracy, timestamp } = reading;

  // Validate coordinates
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) {
    return {
      status: "unknown",
      reason: "Invalid coordinates received from device",
      accuracy: null,
      nearestDistanceMeters: null,
      zoneId: null
    };
  }

  // Validate accuracy
  const acc = typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null;
  if (acc === null || acc > GEOFENCE_CONFIG.maxAccuracyMeters) {
    return {
      status: "unknown",
      reason: acc === null
        ? "GPS accuracy reading missing"
        : `GPS accuracy too low (${Math.round(acc)}m > ${GEOFENCE_CONFIG.maxAccuracyMeters}m limit)`,
      accuracy: acc,
      nearestDistanceMeters: null,
      zoneId: null
    };
  }

  // Validate freshness
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    const ageMs = currentTimeMs - timestamp;
    if (ageMs > GEOFENCE_CONFIG.maxAgeMilliseconds || ageMs < -60000) {
      return {
        status: "unknown",
        reason: `GPS reading is stale (${Math.round(Math.max(0, ageMs) / 1000)}s old > 300s limit)`,
        accuracy: acc,
        nearestDistanceMeters: null,
        zoneId: null
      };
    }
  }

  // Calculate distance to all 3 zones
  let minDistance = Infinity;
  let closestZone = null;

  for (const zone of CAMPUS_GEOFENCE_ZONES) {
    const dist = haversineDistanceMeters(latitude, longitude, zone.latitude, zone.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      closestZone = zone;
    }
  }

  const isInside = minDistance <= GEOFENCE_CONFIG.radiusMeters;

  return {
    status: isInside ? "inside" : "outside",
    reason: isInside
      ? `Within 500m campus zone (${closestZone?.name})`
      : `Outside all 3 campus zones (${Math.round(minDistance)}m from nearest)`,
    accuracy: acc,
    nearestDistanceMeters: Math.round(minDistance),
    zoneId: isInside ? closestZone?.id : null
  };
}

/**
 * Capture current device location via browser Geolocation API.
 * Never throws; always resolves with a safe evaluation.
 */
export async function getCurrentLocationSignal() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      status: "unknown",
      reason: "Geolocation API not supported in this browser",
      accuracy: null,
      nearestDistanceMeters: null,
      zoneId: null
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const evaluation = evaluateLocationSignal({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now()
        });
        resolve(evaluation);
      },
      (err) => {
        let reason = "Location unavailable";
        if (err.code === 1) reason = "Location permission denied by user";
        else if (err.code === 2) reason = "Location position unavailable from device";
        else if (err.code === 3) reason = "Location acquisition timed out";

        resolve({
          status: "unknown",
          reason,
          accuracy: null,
          nearestDistanceMeters: null,
          zoneId: null
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
}
