import { quaternionFromAxisAngle } from "./quaternion.js";

export class DemoSensors extends EventTarget {
  #timer = null;
  #startedAt = 0;
  devices = [];

  get running() {
    return Boolean(this.#timer);
  }

  start() {
    if (this.running) return;
    this.#startedAt = performance.now();
    this.devices = [
      {
        id: "demo-left-ankle",
        advertisedName: "Demo WT901BLE A",
        state: "ready",
        connected: true,
        ready: true,
        source: "demo",
      },
      {
        id: "demo-right-ankle",
        advertisedName: "Demo WT901BLE B",
        state: "ready",
        connected: true,
        ready: true,
        source: "demo",
      },
    ];
    this.dispatchEvent(new CustomEvent("changed", { detail: this.devices }));
    this.#timer = setInterval(() => this.#tick(), 50);
  }

  stop() {
    clearInterval(this.#timer);
    this.#timer = null;
    const removed = this.devices.map((device) => device.id);
    this.devices = [];
    this.dispatchEvent(new CustomEvent("changed", { detail: this.devices }));
    this.dispatchEvent(new CustomEvent("removed", { detail: removed }));
  }

  #tick() {
    const t = (performance.now() - this.#startedAt) / 1000;
    this.#emit("demo-left-ankle", t, 0);
    this.#emit("demo-right-ankle", t, 14);
  }

  #emit(deviceId, t, phaseDegrees) {
    const phase = (phaseDegrees * Math.PI) / 180;
    const swing = Math.sin(t * 2.2 + phase);
    const sway = Math.sin(t * 0.7 + phase) * 2;
    const quaternion = quaternionFromAxisAngle(
      { x: 0.2, y: 1, z: 0.1 },
      swing * 22 + sway,
    );
    const timestamp = Date.now();
    const samples = [
      {
        element: "acceleration",
        value: {
          x: Math.sin(t * 2.2 + phase) * 1.4,
          y: Math.cos(t * 2.2 + phase) * 0.8,
          z: 9.81 + Math.sin(t * 4.4 + phase) * 0.5,
        },
        unit: "m/s²",
        timestamp,
        quality: "simulated",
      },
      {
        element: "angularVelocity",
        value: {
          x: Math.cos(t * 2.2 + phase) * 42,
          y: Math.sin(t * 1.1 + phase) * 8,
          z: Math.cos(t * 0.7 + phase) * 3,
        },
        unit: "°/s",
        timestamp,
        quality: "simulated",
      },
      {
        element: "attitude",
        value: { x: swing * 22, y: sway, z: Math.sin(t * 0.4) * 3 },
        unit: "°",
        timestamp,
        quality: "simulated",
      },
      {
        element: "quaternion",
        value: quaternion,
        unit: "quaternion",
        timestamp,
        quality: "simulated",
      },
      {
        element: "temperature",
        value: { celsius: 24 + Math.sin(t * 0.03) * 0.4 },
        unit: "°C",
        timestamp,
        quality: "simulated",
      },
    ];
    this.dispatchEvent(
      new CustomEvent("samples", { detail: { deviceId, samples, frameType: "demo" } }),
    );
  }
}
