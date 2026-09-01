import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeWT901BLEFrame,
  decodeWT901BLENotification,
  WT901DecodeError,
} from "../src/wt901ble.js";

function frame(type, register = null) {
  const bytes = new Uint8Array(20);
  bytes[0] = 0x55;
  bytes[1] = type;
  const view = new DataView(bytes.buffer);
  if (register !== null) view.setUint16(2, register, true);
  return { bytes, view };
}

test("decodes a 0x61 IMU frame using historical WT901BLE scaling", () => {
  const { bytes, view } = frame(0x61);
  view.setInt16(2, 2048, true);
  view.setInt16(4, -2048, true);
  view.setInt16(6, 0, true);
  view.setInt16(8, 16384, true);
  view.setInt16(10, -16384, true);
  view.setInt16(12, 0, true);
  view.setInt16(14, 8192, true);
  view.setInt16(16, -8192, true);
  view.setInt16(18, 0, true);

  const decoded = decodeWT901BLEFrame(bytes, 123);
  assert.equal(decoded.type, "imu");
  assert.equal(decoded.samples.length, 3);
  assert.ok(Math.abs(decoded.samples[0].value.x - 9.81) < 1e-10);
  assert.ok(Math.abs(decoded.samples[0].value.y + 9.81) < 1e-10);
  assert.equal(decoded.samples[1].value.x, 1000);
  assert.equal(decoded.samples[1].value.y, -1000);
  assert.equal(decoded.samples[2].value.x, 45);
  assert.equal(decoded.samples[2].value.y, -45);
});

test("decodes quaternion register 0x51", () => {
  const { bytes, view } = frame(0x71, 0x51);
  view.setInt16(4, 32767, true);
  view.setInt16(6, 0, true);
  view.setInt16(8, 0, true);
  view.setInt16(10, 0, true);
  const decoded = decodeWT901BLEFrame(bytes);
  assert.equal(decoded.type, "quaternion");
  assert.ok(Math.abs(decoded.samples[0].value.w - 32767 / 32768) < 1e-12);
});

test("decodes temperature register 0x40", () => {
  const { bytes, view } = frame(0x71, 0x40);
  view.setInt16(4, 2350, true);
  const decoded = decodeWT901BLEFrame(bytes);
  assert.equal(decoded.samples[0].value.celsius, 23.5);
});

test("decodes signed magnetic values and labels the unit unverified", () => {
  const { bytes, view } = frame(0x71, 0x3a);
  view.setInt16(4, -100, true);
  view.setInt16(6, 200, true);
  view.setInt16(8, -300, true);
  const decoded = decodeWT901BLEFrame(bytes);
  assert.deepEqual(decoded.samples[0].value, { x: -100, y: 200, z: -300 });
  assert.equal(decoded.samples[0].quality, "unit-unverified");
});

test("rejects short and unknown frames", () => {
  assert.throws(
    () => decodeWT901BLEFrame(new Uint8Array([0x55, 0x61])),
    (error) => error instanceof WT901DecodeError && error.code === "SHORT_FRAME",
  );
  const unknown = frame(0x22).bytes;
  assert.throws(
    () => decodeWT901BLEFrame(unknown),
    (error) => error instanceof WT901DecodeError && error.code === "UNKNOWN_FRAME",
  );
});

test("notification decoder accepts two concatenated frames", () => {
  const first = frame(0x61).bytes;
  const second = frame(0x71, 0x40);
  second.view.setInt16(4, 2100, true);
  const combined = new Uint8Array(40);
  combined.set(first, 0);
  combined.set(second.bytes, 20);
  const decoded = decodeWT901BLENotification(combined);
  assert.equal(decoded.frames.length, 2);
  assert.equal(decoded.errors.length, 0);
  assert.equal(decoded.remainder.length, 0);
});

test("notification decoder returns a partial frame for buffering", () => {
  const partial = frame(0x61).bytes.subarray(0, 12);
  const decoded = decodeWT901BLENotification(partial);
  assert.equal(decoded.frames.length, 0);
  assert.equal(decoded.errors[0].code, "PARTIAL_FRAME");
  assert.deepEqual(decoded.remainder, partial);
});
