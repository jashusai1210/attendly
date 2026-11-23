import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  haversineDistanceMeters,
  evaluateLocationSignal,
  CAMPUS_GEOFENCE_ZONES,
  GEOFENCE_CONFIG
} from "../src/geofence.js";

describe("Geofence - Three 500m Campus Zones & Haversine Formula", () => {
  it("has exactly 3 campus zones with 500m radius", () => {
    assert.equal(CAMPUS_GEOFENCE_ZONES.length, 3);
    assert.deepEqual(
      CAMPUS_GEOFENCE_ZONES.map((z) => ({ lat: z.latitude, lon: z.longitude })),
      [
        { lat: 13.5215604, lon: 79.999208 },
        { lat: 13.5599611, lon: 80.0229769 },
        { lat: 13.5517808, lon: 80.0202619 }
      ]
    );
    assert.equal(GEOFENCE_CONFIG.radiusMeters, 500);
    assert.equal(GEOFENCE_CONFIG.maxAccuracyMeters, 200);
  });

  it("calculates 0 meters distance for identical coordinates", () => {
    const dist = haversineDistanceMeters(13.5215604, 79.999208, 13.5215604, 79.999208);
    assert.equal(Math.round(dist), 0);
  });

  it("evaluates Zone 1 center as inside", () => {
    const now = Date.now();
    const res = evaluateLocationSignal(
      {
        latitude: 13.5215604,
        longitude: 79.999208,
        accuracy: 15,
        timestamp: now
      },
      now
    );
    assert.equal(res.status, "inside");
    assert.equal(res.zoneId, "zone-1");
    assert.equal(res.nearestDistanceMeters, 0);
  });

  it("evaluates Zone 2 center as inside", () => {
    const now = Date.now();
    const res = evaluateLocationSignal(
      {
        latitude: 13.5599611,
        longitude: 80.0229769,
        accuracy: 20,
        timestamp: now
      },
      now
    );
    assert.equal(res.status, "inside");
    assert.equal(res.zoneId, "zone-2");
    assert.equal(res.nearestDistanceMeters, 0);
  });

  it("evaluates Zone 3 center as inside", () => {
    const now = Date.now();
    const res = evaluateLocationSignal(
      {
        latitude: 13.5517808,
        longitude: 80.0202619,
        accuracy: 10,
        timestamp: now
      },
      now
    );
    assert.equal(res.status, "inside");
    assert.equal(res.zoneId, "zone-3");
    assert.equal(res.nearestDistanceMeters, 0);
  });

  it("evaluates a point ~250m from Zone 1 as inside", () => {
    // 0.002 degrees latitude is approx 222 meters
    const now = Date.now();
    const res = evaluateLocationSignal(
      {
        latitude: 13.5215604 + 0.002,
        longitude: 79.999208,
        accuracy: 25,
        timestamp: now
      },
      now
    );
    assert.equal(res.status, "inside");
    assert.ok(res.nearestDistanceMeters < 500);
  });

  it("evaluates boundary points (inside at 490m, outside at 520m)", () => {
    const now = Date.now();
    // Move along longitude at latitude 13.52156: 1 deg lon is ~108 km => 0.0044 deg is ~475m
    const insidePoint = evaluateLocationSignal(
      {
        latitude: 13.5215604,
        longitude: 79.999208 + 0.0044,
        accuracy: 10,
        timestamp: now
      },
      now
    );
    assert.equal(insidePoint.status, "inside");
    assert.ok(insidePoint.nearestDistanceMeters <= 500);

    // 0.0055 deg lon is ~595m
    const outsidePoint = evaluateLocationSignal(
      {
        latitude: 13.5215604,
        longitude: 79.999208 + 0.0055,
        accuracy: 10,
        timestamp: now
      },
      now
    );
    assert.equal(outsidePoint.status, "outside");
    assert.ok(outsidePoint.nearestDistanceMeters > 500);
  });

  it("evaluates distant locations as outside all zones", () => {
    const now = Date.now();
    // Hyderabad coordinates (~17.385, 78.486)
    const hyd = evaluateLocationSignal(
      {
        latitude: 17.385,
        longitude: 78.486,
        accuracy: 15,
        timestamp: now
      },
      now
    );
    assert.equal(hyd.status, "outside");
    assert.ok(hyd.nearestDistanceMeters > 100000); // > 100 km
  });

  it("evaluates poor accuracy (> 200m) as unknown", () => {
    const now = Date.now();
    const res = evaluateLocationSignal(
      {
        latitude: 13.5215604,
        longitude: 79.999208,
        accuracy: 350, // 350m accuracy is too coarse
        timestamp: now
      },
      now
    );
    assert.equal(res.status, "unknown");
    assert.match(res.reason, /accuracy too low/i);
  });

  it("evaluates stale GPS readings (> 5 minutes) as unknown", () => {
    const now = Date.now();
    const sixMinutesAgo = now - 6 * 60 * 1000;
    const res = evaluateLocationSignal(
      {
        latitude: 13.5215604,
        longitude: 79.999208,
        accuracy: 10,
        timestamp: sixMinutesAgo
      },
      now
    );
    assert.equal(res.status, "unknown");
    assert.match(res.reason, /stale/i);
  });

  it("evaluates missing, denied or null location readings as unknown", () => {
    assert.equal(evaluateLocationSignal(null).status, "unknown");
    assert.equal(evaluateLocationSignal(undefined).status, "unknown");
    assert.equal(evaluateLocationSignal({}).status, "unknown");
    assert.equal(
      evaluateLocationSignal({ latitude: "invalid", longitude: 80.0 }).status,
      "unknown"
    );
  });

  it("never includes raw latitude or longitude in the returned object (privacy)", () => {
    const res = evaluateLocationSignal({
      latitude: 13.5215604,
      longitude: 79.999208,
      accuracy: 10,
      timestamp: Date.now()
    });
    assert.equal(res.latitude, undefined);
    assert.equal(res.longitude, undefined);
    assert.ok(["inside", "outside", "unknown"].includes(res.status));
  });
});
