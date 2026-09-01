const FRAME_LENGTH = 20;
const HEADER = 0x55;
const IMU_FRAME = 0x61;
const REGISTER_FRAME = 0x71;

const REGISTER_MAGNETIC_FIELD = 0x003a;
const REGISTER_QUATERNION = 0x0051;
const REGISTER_TEMPERATURE = 0x0040;

export class WT901DecodeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "WT901DecodeError";
    this.code = code;
    this.details = details;
  }
}

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof DataView) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("Expected DataView, ArrayBuffer, or typed array.");
}

function dataViewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function bytesToHex(value) {
  return Array.from(bytesOf(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join(" ");
}

function vector(view, offset, scale) {
  return {
    x: view.getInt16(offset, true) * scale,
    y: view.getInt16(offset + 2, true) * scale,
    z: view.getInt16(offset + 4, true) * scale,
  };
}

function sample(element, value, unit, timestamp, quality = "valid") {
  return { element, value, unit, timestamp, quality };
}

export function decodeWT901BLEFrame(value, timestamp = Date.now()) {
  const bytes = bytesOf(value);
  if (bytes.byteLength < FRAME_LENGTH) {
    throw new WT901DecodeError(
      "SHORT_FRAME",
      "WT901BLE frame is shorter than 20 bytes.",
      { length: bytes.byteLength },
    );
  }
  if (bytes[0] !== HEADER) {
    throw new WT901DecodeError("BAD_HEADER", "WT901BLE frame does not start with 0x55.", {
      header: bytes[0],
    });
  }

  const frame = bytes.subarray(0, FRAME_LENGTH);
  const view = dataViewOf(frame);
  const type = frame[1];
  const rawHex = bytesToHex(frame);

  if (type === IMU_FRAME) {
    const accelerationScale = (16 * 9.81) / 32768;
    const angularVelocityScale = 2000 / 32768;
    const attitudeScale = 180 / 32768;
    return {
      type: "imu",
      rawHex,
      samples: [
        sample(
          "acceleration",
          vector(view, 2, accelerationScale),
          "m/s²",
          timestamp,
        ),
        sample(
          "angularVelocity",
          vector(view, 8, angularVelocityScale),
          "°/s",
          timestamp,
        ),
        sample(
          "attitude",
          vector(view, 14, attitudeScale),
          "°",
          timestamp,
        ),
      ],
    };
  }

  if (type === REGISTER_FRAME) {
    const register = view.getUint16(2, true);
    if (register === REGISTER_MAGNETIC_FIELD) {
      return {
        type: "magneticField",
        register,
        rawHex,
        samples: [
          sample(
            "magneticField",
            vector(view, 4, 1),
            "raw",
            timestamp,
            "unit-unverified",
          ),
        ],
      };
    }
    if (register === REGISTER_QUATERNION) {
      return {
        type: "quaternion",
        register,
        rawHex,
        samples: [
          sample(
            "quaternion",
            {
              w: view.getInt16(4, true) / 32768,
              x: view.getInt16(6, true) / 32768,
              y: view.getInt16(8, true) / 32768,
              z: view.getInt16(10, true) / 32768,
            },
            "quaternion",
            timestamp,
          ),
        ],
      };
    }
    if (register === REGISTER_TEMPERATURE) {
      return {
        type: "temperature",
        register,
        rawHex,
        samples: [
          sample(
            "temperature",
            { celsius: view.getInt16(4, true) / 100 },
            "°C",
            timestamp,
          ),
        ],
      };
    }
    throw new WT901DecodeError(
      "UNKNOWN_REGISTER",
      "Unknown WT901BLE 0x71 register response.",
      { register, rawHex },
    );
  }

  throw new WT901DecodeError("UNKNOWN_FRAME", "Unknown WT901BLE frame type.", {
    type,
    rawHex,
  });
}

export function decodeWT901BLENotification(value, timestamp = Date.now()) {
  const bytes = bytesOf(value);
  const frames = [];
  const errors = [];
  let remainder = new Uint8Array();

  let offset = 0;
  while (offset < bytes.byteLength) {
    if (bytes[offset] !== HEADER) {
      const next = bytes.indexOf(HEADER, offset + 1);
      errors.push(
        new WT901DecodeError("DESYNC", "Skipped bytes before a WT901BLE header.", {
          offset,
          skipped: next === -1 ? bytes.byteLength - offset : next - offset,
        }),
      );
      if (next === -1) break;
      offset = next;
    }

    if (bytes.byteLength - offset < FRAME_LENGTH) {
      remainder = bytes.slice(offset);
      errors.push(
        new WT901DecodeError("PARTIAL_FRAME", "Notification ended with a partial frame.", {
          offset,
          remaining: bytes.byteLength - offset,
        }),
      );
      break;
    }

    try {
      frames.push(
        decodeWT901BLEFrame(bytes.subarray(offset, offset + FRAME_LENGTH), timestamp),
      );
    } catch (error) {
      errors.push(error);
    }
    offset += FRAME_LENGTH;
  }

  return { frames, errors, remainder };
}

export const WT901BLEProtocol = Object.freeze({
  frameLength: FRAME_LENGTH,
  header: HEADER,
  imuFrame: IMU_FRAME,
  registerFrame: REGISTER_FRAME,
  registers: {
    magneticField: REGISTER_MAGNETIC_FIELD,
    quaternion: REGISTER_QUATERNION,
    temperature: REGISTER_TEMPERATURE,
  },
});
