export const APP_NAME = "SensoryLab";
export const APP_VERSION = "1.0.0-phase1";

export const WT901BLE = Object.freeze({
  service: "0000ffe5-0000-1000-8000-00805f9a34fb",
  notify: "0000ffe4-0000-1000-8000-00805f9a34fb",
  write: "0000ffe9-0000-1000-8000-00805f9a34fb",
  magneticFieldCommand: new Uint8Array([0xff, 0xaa, 0x27, 0x3a, 0x00]),
});

export const SENSOR_ELEMENTS = Object.freeze([
  "acceleration",
  "angularVelocity",
  "attitude",
  "magneticField",
  "quaternion",
  "temperature",
]);

export const ELEMENT_LABELS = Object.freeze({
  acceleration: "Acceleration",
  angularVelocity: "Angular velocity",
  attitude: "Attitude",
  magneticField: "Magnetic field",
  quaternion: "Quaternion",
  temperature: "Temperature",
});

export const STALE_AFTER_MS = 2000;
export const HISTORY_LIMIT = 5000;

