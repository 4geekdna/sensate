import { ELEMENT_LABELS, SENSOR_ELEMENTS, STALE_AFTER_MS } from "./constants.js";
import {
  deltaFromReference,
  orientationSwayRmsDegrees,
  quaternionAngleDegrees,
  relativeQuaternion,
} from "./quaternion.js";
import { makeId } from "./persistence.js";

function metric(key, label, value, unit, options = {}) {
  return { key, label, value, unit, ...options };
}

function ageOf(sample, now) {
  return sample ? now - sample.timestamp : Infinity;
}

function vectorMagnitude(value) {
  return Math.hypot(value.x, value.y, value.z);
}

export function createDefaultServices() {
  return [
    {
      id: makeId("service"),
      name: "Live IMU",
      type: "display",
      deviceIds: [],
      elements: ["acceleration", "angularVelocity", "attitude", "temperature"],
      active: true,
      loggingEnabled: true,
      config: {},
    },
    {
      id: makeId("service"),
      name: "Relative Angle",
      type: "angle",
      deviceIds: [],
      elements: ["quaternion"],
      active: true,
      loggingEnabled: true,
      config: { reference: null },
    },
    {
      id: makeId("service"),
      name: "Engineering Stability",
      type: "stability",
      deviceIds: [],
      elements: ["quaternion", "angularVelocity"],
      active: true,
      loggingEnabled: true,
      config: { windowMs: 2000 },
    },
  ];
}

export class ServiceEngine {
  constructor(sampleStore) {
    this.sampleStore = sampleStore;
  }

  validate(service) {
    if (!service.name?.trim()) return "Service name is required.";
    if (!["display", "angle", "stability"].includes(service.type)) {
      return "Unknown service type.";
    }
    if (service.type === "display" && !service.deviceIds.length) {
      return "Assign at least one device.";
    }
    if (service.type === "display" && !service.elements.length) {
      return "Select at least one sensor element.";
    }
    if (service.type === "angle" && service.deviceIds.length < 2) {
      return "Assign two quaternion sensors.";
    }
    if (service.type === "stability" && service.deviceIds.length < 1) {
      return "Assign one sensor.";
    }
    return null;
  }

  evaluate(service, now = Date.now()) {
    const validation = this.validate(service);
    if (validation) return { valid: false, state: "configuration", message: validation, metrics: [] };
    if (!service.active) {
      return { valid: false, state: "inactive", message: "Service is inactive.", metrics: [] };
    }

    if (service.type === "display") return this.#display(service, now);
    if (service.type === "angle") return this.#angle(service, now);
    if (service.type === "stability") return this.#stability(service, now);
    return { valid: false, state: "unknown", message: "Unknown service.", metrics: [] };
  }

  #display(service, now) {
    const metrics = [];
    const missing = [];
    for (const deviceId of service.deviceIds) {
      for (const element of service.elements.filter((item) =>
        SENSOR_ELEMENTS.includes(item),
      )) {
        const sample = this.sampleStore.latest(deviceId, element);
        if (!sample) {
          missing.push(element + " on " + deviceId);
          continue;
        }
        metrics.push(
          metric(
            deviceId + "-" + element,
            ELEMENT_LABELS[element] ?? element,
            sample.value,
            sample.unit,
            {
              deviceId,
              timestamp: sample.timestamp,
              stale: ageOf(sample, now) > STALE_AFTER_MS,
              quality: sample.quality,
            },
          ),
        );
      }
    }
    if (!metrics.length) {
      return {
        valid: false,
        state: "waiting",
        message: "No selected sensor data is available yet.",
        details: missing,
        metrics: [],
      };
    }
    return {
      valid: true,
      state: metrics.some((item) => item.stale) ? "stale" : "live",
      message: missing.length ? "Some selected data is not available." : "Live",
      metrics,
    };
  }

  #angle(service, now) {
    const [primaryId, secondaryId] = service.deviceIds;
    const primary = this.sampleStore.latest(primaryId, "quaternion");
    const secondary = this.sampleStore.latest(secondaryId, "quaternion");
    if (!primary || !secondary) {
      return {
        valid: false,
        state: "waiting",
        message: "Waiting for quaternion data from both sensors.",
        metrics: [],
      };
    }
    if (
      ageOf(primary, now) > STALE_AFTER_MS ||
      ageOf(secondary, now) > STALE_AFTER_MS
    ) {
      return {
        valid: false,
        state: "stale",
        message: "Quaternion data is stale.",
        metrics: [],
      };
    }

    try {
      const currentRelative = relativeQuaternion(primary.value, secondary.value);
      const delta = service.config?.reference
        ? deltaFromReference(service.config.reference, currentRelative)
        : currentRelative;
      const angle = quaternionAngleDegrees(delta);
      return {
        valid: true,
        state: "live",
        message: service.config?.reference
          ? "Angle from captured reference"
          : "Absolute relative orientation",
        metrics: [
          metric("relative-angle", "Relative angle", angle, "°", {
            timestamp: Math.min(primary.timestamp, secondary.timestamp),
            deviceIds: [primaryId, secondaryId],
          }),
        ],
        currentRelative,
      };
    } catch (error) {
      return { valid: false, state: "invalid", message: error.message, metrics: [] };
    }
  }

  captureReference(service, now = Date.now()) {
    const output = this.#angle({ ...service, config: { ...service.config, reference: null } }, now);
    if (!output.valid || !output.currentRelative) {
      throw new Error(output.message);
    }
    service.config = { ...service.config, reference: output.currentRelative };
    return service;
  }

  clearReference(service) {
    service.config = { ...service.config, reference: null };
    return service;
  }

  #stability(service, now) {
    const deviceId = service.deviceIds[0];
    const windowMs = Math.max(500, Number(service.config?.windowMs) || 2000);
    const since = now - windowMs;
    const quaternions = this.sampleStore
      .history(deviceId, "quaternion", since)
      .map((sample) => sample.value);
    const gyro = this.sampleStore.history(deviceId, "angularVelocity", since);

    if (quaternions.length < 2 && gyro.length < 2) {
      return {
        valid: false,
        state: "waiting",
        message: "Collecting samples for the stability window.",
        metrics: [],
      };
    }

    const metrics = [];
    const sway = orientationSwayRmsDegrees(quaternions);
    if (sway !== null) {
      metrics.push(
        metric("orientation-sway-rms", "Orientation sway RMS", sway, "°", {
          deviceId,
          windowMs,
        }),
      );
    }
    if (gyro.length >= 2) {
      const squares = gyro.map((sample) => vectorMagnitude(sample.value) ** 2);
      const gyroRms = Math.sqrt(
        squares.reduce((sum, value) => sum + value, 0) / squares.length,
      );
      metrics.push(
        metric("gyro-rms", "Angular velocity RMS", gyroRms, "°/s", {
          deviceId,
          windowMs,
        }),
      );
    }

    return {
      valid: metrics.length > 0,
      state: "live",
      message: "Engineering metrics only — not a clinical score.",
      metrics,
    };
  }
}

