import { HISTORY_LIMIT } from "./constants.js";

export class LiveSampleStore extends EventTarget {
  #devices = new Map();
  #historyLimit;

  constructor(historyLimit = HISTORY_LIMIT) {
    super();
    this.#historyLimit = historyLimit;
  }

  #record(deviceId) {
    if (!this.#devices.has(deviceId)) {
      this.#devices.set(deviceId, {
        latest: new Map(),
        history: new Map(),
        packetCount: 0,
        invalidCount: 0,
        firstPacketAt: null,
        lastPacketAt: null,
        recentPacketTimes: [],
      });
    }
    return this.#devices.get(deviceId);
  }

  update(deviceId, samples, metadata = {}) {
    const record = this.#record(deviceId);
    const timestamp = samples[0]?.timestamp ?? Date.now();
    record.packetCount += 1;
    record.firstPacketAt ??= timestamp;
    record.lastPacketAt = timestamp;
    record.recentPacketTimes.push(timestamp);
    const cutoff = timestamp - 5000;
    while (record.recentPacketTimes[0] < cutoff) record.recentPacketTimes.shift();

    for (const sample of samples) {
      const enriched = { ...sample, deviceId, ...metadata };
      record.latest.set(sample.element, enriched);
      const history = record.history.get(sample.element) ?? [];
      history.push(enriched);
      if (history.length > this.#historyLimit) {
        history.splice(0, history.length - this.#historyLimit);
      }
      record.history.set(sample.element, history);
    }

    this.dispatchEvent(
      new CustomEvent("samples", { detail: { deviceId, samples, metadata } }),
    );
  }

  markInvalid(deviceId) {
    this.#record(deviceId).invalidCount += 1;
  }

  latest(deviceId, element) {
    return this.#devices.get(deviceId)?.latest.get(element) ?? null;
  }

  history(deviceId, element, since = -Infinity) {
    const samples = this.#devices.get(deviceId)?.history.get(element) ?? [];
    if (!Number.isFinite(since)) return [...samples];
    return samples.filter((sample) => sample.timestamp >= since);
  }

  health(deviceId) {
    const record = this.#devices.get(deviceId);
    if (!record) {
      return {
        packetCount: 0,
        invalidCount: 0,
        lastPacketAt: null,
        sampleRateHz: 0,
      };
    }
    const times = record.recentPacketTimes;
    const duration = times.length > 1 ? (times.at(-1) - times[0]) / 1000 : 0;
    const sampleRateHz = duration > 0 ? (times.length - 1) / duration : 0;
    return {
      packetCount: record.packetCount,
      invalidCount: record.invalidCount,
      lastPacketAt: record.lastPacketAt,
      sampleRateHz,
    };
  }

  clear(deviceId) {
    if (deviceId) this.#devices.delete(deviceId);
    else this.#devices.clear();
  }
}
