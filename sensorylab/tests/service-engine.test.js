import test from "node:test";
import assert from "node:assert/strict";
import { LiveSampleStore } from "../src/live-sample-store.js";
import { quaternionFromAxisAngle } from "../src/quaternion.js";
import { ServiceEngine } from "../src/service-engine.js";

function quaternionSample(value, timestamp) {
  return {
    element: "quaternion",
    value,
    unit: "quaternion",
    timestamp,
    quality: "valid",
  };
}

test("AngleService requires two devices", () => {
  const engine = new ServiceEngine(new LiveSampleStore());
  const message = engine.validate({
    name: "Angle",
    type: "angle",
    deviceIds: ["one"],
    elements: ["quaternion"],
  });
  assert.equal(message, "Assign two quaternion sensors.");
});

test("AngleService computes a known relative angle", () => {
  const now = Date.now();
  const store = new LiveSampleStore();
  store.update("a", [quaternionSample({ w: 1, x: 0, y: 0, z: 0 }, now)]);
  store.update("b", [
    quaternionSample(
      quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, 45),
      now,
    ),
  ]);
  const engine = new ServiceEngine(store);
  const output = engine.evaluate(
    {
      name: "Angle",
      type: "angle",
      deviceIds: ["a", "b"],
      elements: ["quaternion"],
      active: true,
      config: { reference: null },
    },
    now,
  );
  assert.equal(output.valid, true);
  assert.ok(Math.abs(output.metrics[0].value - 45) < 1e-9);
});

test("StabilityService names engineering metrics and units", () => {
  const now = Date.now();
  const store = new LiveSampleStore();
  for (let index = 0; index < 4; index += 1) {
    const timestamp = now - 300 + index * 100;
    store.update("a", [
      quaternionSample(
        quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, index),
        timestamp,
      ),
      {
        element: "angularVelocity",
        value: { x: index, y: 0, z: 0 },
        unit: "°/s",
        timestamp,
        quality: "valid",
      },
    ]);
  }
  const engine = new ServiceEngine(store);
  const output = engine.evaluate(
    {
      name: "Stability",
      type: "stability",
      deviceIds: ["a"],
      elements: ["quaternion", "angularVelocity"],
      active: true,
      config: { windowMs: 1000 },
    },
    now,
  );
  assert.equal(output.valid, true);
  assert.deepEqual(
    output.metrics.map((item) => item.unit),
    ["°", "°/s"],
  );
});

