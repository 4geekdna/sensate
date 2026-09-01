import {
  appendRows,
  deleteSessionData,
  getSessionRows,
  getSessions,
  makeId,
  putSession,
  recoverInterruptedSessions,
} from "./persistence.js";

function iso(timestamp) {
  return new Date(timestamp).toISOString();
}

function rowComponents(value) {
  if (typeof value === "number") return [["scalar", value]];
  return Object.entries(value).filter(([, item]) => Number.isFinite(item));
}

function csvCell(value) {
  const string = value == null ? "" : String(value);
  return /[",\n]/.test(string) ? '"' + string.replaceAll('"', '""') + '"' : string;
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class SessionLogger extends EventTarget {
  current = null;
  #buffer = [];
  #flushPromise = Promise.resolve();
  #flushTimer = null;

  async initialize() {
    return recoverInterruptedSessions();
  }

  async start({ name, devices, services }) {
    if (this.current) throw new Error("A recording session is already active.");
    const startedAt = new Date().toISOString();
    this.current = {
      id: makeId("session"),
      name: name?.trim() || "Sensor Session",
      startedAt,
      endedAt: null,
      status: "recording",
      rowCount: 0,
      devices,
      services,
      appVersion: "1.0.0-phase1",
    };
    await putSession(this.current);
    this.#flushTimer = setInterval(() => this.flush(), 1000);
    this.dispatchEvent(new CustomEvent("changed", { detail: this.current }));
    return this.current;
  }

  recordSamples(deviceId, deviceName, samples) {
    if (!this.current) return;
    for (const sample of samples) {
      for (const [component, value] of rowComponents(sample.value)) {
        this.#buffer.push({
          sessionId: this.current.id,
          timestampUtc: iso(sample.timestamp),
          elapsedSeconds:
            (sample.timestamp - Date.parse(this.current.startedAt)) / 1000,
          deviceId,
          deviceName,
          serviceId: "",
          serviceName: "",
          measurement: sample.element,
          component,
          value,
          unit: sample.unit,
          quality: sample.quality ?? "valid",
        });
      }
    }
    if (this.#buffer.length >= 250) this.flush();
  }

  recordDerived(service, output, timestamp = Date.now()) {
    if (!this.current || !service.loggingEnabled || !output.valid) return;
    for (const item of output.metrics) {
      if (typeof item.value !== "number") continue;
      this.#buffer.push({
        sessionId: this.current.id,
        timestampUtc: iso(timestamp),
        elapsedSeconds: (timestamp - Date.parse(this.current.startedAt)) / 1000,
        deviceId: item.deviceId ?? item.deviceIds?.join("+") ?? "",
        deviceName: "",
        serviceId: service.id,
        serviceName: service.name,
        measurement: item.key,
        component: "scalar",
        value: item.value,
        unit: item.unit,
        quality: output.state,
      });
    }
    if (this.#buffer.length >= 250) this.flush();
  }

  flush() {
    if (!this.#buffer.length || !this.current) return this.#flushPromise;
    const rows = this.#buffer.splice(0);
    this.current.rowCount += rows.length;
    const sessionSnapshot = { ...this.current };
    this.#flushPromise = this.#flushPromise
      .then(() => appendRows(rows))
      .then(() => putSession(sessionSnapshot));
    return this.#flushPromise;
  }

  async stop(status = "complete") {
    if (!this.current) return null;
    clearInterval(this.#flushTimer);
    this.#flushTimer = null;
    await this.flush();
    await this.#flushPromise;
    const finished = {
      ...this.current,
      endedAt: new Date().toISOString(),
      status,
    };
    await putSession(finished);
    this.current = null;
    this.dispatchEvent(new CustomEvent("changed", { detail: null }));
    return finished;
  }

  list() {
    return getSessions();
  }

  async exportCsv(sessionId) {
    const sessions = await getSessions();
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) throw new Error("Session not found.");
    const rows = await getSessionRows(sessionId);
    const columns = [
      "session_id",
      "timestamp_utc",
      "elapsed_seconds",
      "device_id",
      "device_name",
      "service_id",
      "service_name",
      "measurement",
      "component",
      "value",
      "unit",
      "quality",
    ];
    const lines = [columns.join(",")];
    for (const row of rows) {
      lines.push(
        [
          row.sessionId,
          row.timestampUtc,
          row.elapsedSeconds,
          row.deviceId,
          row.deviceName,
          row.serviceId,
          row.serviceName,
          row.measurement,
          row.component,
          row.value,
          row.unit,
          row.quality,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    const safeName = session.name.replace(/[^a-z0-9_-]+/gi, "-");
    download(safeName + ".csv", lines.join("\n"), "text/csv;charset=utf-8");
  }

  async exportMetadata(sessionId) {
    const sessions = await getSessions();
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) throw new Error("Session not found.");
    const safeName = session.name.replace(/[^a-z0-9_-]+/gi, "-");
    download(
      safeName + "-metadata.json",
      JSON.stringify(session, null, 2),
      "application/json",
    );
  }

  delete(sessionId) {
    return deleteSessionData(sessionId);
  }
}

