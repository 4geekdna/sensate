import test from "node:test";
import assert from "node:assert/strict";
import {
  angleBetweenQuaternions,
  deltaFromReference,
  normalizeQuaternion,
  orientationSwayRmsDegrees,
  quaternionAngleDegrees,
  quaternionFromAxisAngle,
  relativeQuaternion,
} from "../src/quaternion.js";

const identity = { w: 1, x: 0, y: 0, z: 0 };

test("identical orientations produce zero degrees", () => {
  assert.ok(angleBetweenQuaternions(identity, identity) < 1e-10);
});

test("known axis rotations produce expected total angle", () => {
  for (const degrees of [30, 45, 90, 180]) {
    const q = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, degrees);
    assert.ok(Math.abs(angleBetweenQuaternions(identity, q) - degrees) < 1e-9);
  }
});

test("q and negative q describe the same physical orientation", () => {
  const q = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, 67);
  const negative = { w: -q.w, x: -q.x, y: -q.y, z: -q.z };
  assert.ok(angleBetweenQuaternions(q, negative) < 1e-9);
});

test("captured reference resets delta and measures later change", () => {
  const a = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, 20);
  const bReference = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, 50);
  const bCurrent = quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, 80);
  const reference = relativeQuaternion(a, bReference);
  const current = relativeQuaternion(a, bCurrent);
  assert.ok(quaternionAngleDegrees(deltaFromReference(reference, reference)) < 1e-9);
  assert.ok(
    Math.abs(quaternionAngleDegrees(deltaFromReference(reference, current)) - 30) <
      1e-9,
  );
});

test("normalization rejects zero quaternions", () => {
  assert.throws(() => normalizeQuaternion({ w: 0, x: 0, y: 0, z: 0 }));
});

test("orientation sway RMS is zero for identical samples", () => {
  const samples = [identity, identity, identity];
  assert.ok(orientationSwayRmsDegrees(samples) < 1e-9);
});

