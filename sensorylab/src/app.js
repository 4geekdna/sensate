import { BluetoothManager } from "./bluetooth-manager.js";
import {
  APP_VERSION,
  ELEMENT_LABELS,
  SENSOR_ELEMENTS,
} from "./constants.js";
import { DemoSensors } from "./demo-sensors.js";
import { LiveSampleStore } from "./live-sample-store.js";
import { SettingsStore } from "./persistence.js";
import { createDefaultServices, ServiceEngine } from "./service-engine.js";
import { SessionLogger } from "./session-logger.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const elements = {
  supportBanner: $("#supportBanner"),
  offlineBadge: $("#offlineBadge"),
  installButton: $("#installButton"),
  addSensorButton: $("#addSensorButton"),
  demoButton: $("#demoButton"),
  deviceSummary: $("#deviceSummary"),
  devicesList: $("#devicesList"),
  addServiceButton: $("#addServiceButton"),
  servicesList: $("#servicesList"),
  monitorList: $("#monitorList"),
  recordingStatus: $("#recordingStatus"),
  recordButton: $("#recordButton"),
  sessionsList: $("#sessionsList"),
  refreshSessionsButton: $("#refreshSessionsButton"),
  diagnosticsList: $("#diagnosticsList"),
  copyDiagnosticsButton: $("#copyDiagnosticsButton"),
  clearDiagnosticsButton: $("#clearDiagnosticsButton"),
  serviceDialog: $("#serviceDialog"),
  serviceForm: $("#serviceForm"),
  serviceDialogTitle: $("#serviceDialogTitle"),
  serviceId: $("#serviceId"),
  serviceName: $("#serviceName"),
  serviceType: $("#serviceType"),
  serviceDevices: $("#serviceDevices"),
  serviceElements: $("#serviceElements"),
  elementFieldset: $("#elementFieldset"),
  windowField: $("#windowField"),
  stabilityWindow: $("#stabilityWindow"),
  serviceActive: $("#serviceActive"),
  serviceLogging: $("#serviceLogging"),
  serviceFormError: $("#serviceFormError"),
  saveServiceButton: $("#saveServiceButton"),
  toast: $("#toast"),
};

const bluetooth = new BluetoothManager();
const demo = new DemoSensors();
const sampleStore = new LiveSampleStore();
const serviceEngine = new ServiceEngine(sampleStore);
const logger = new SessionLogger();
const settingsStore = new SettingsStore();
const settings = settingsStore.load();
if (!settings.services.length) settings.services = createDefaultServices();

const diagnostics = [];
const derivedLogTimes = new Map();
let deferredInstallPrompt = null;
let toastTimer = null;
let lastDeviceRender = 0;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function saveSettings() {
  settingsStore.save(settings);
}

function allDevices() {
  const map = new Map();
  for (const device of bluetooth.devices) map.set(device.id, device);
  for (const device of demo.devices) map.set(device.id, device);
  return Array.from(map.values());
}

function deviceById(id) {
  return allDevices().find((device) => device.id === id) ?? null;
}

function deviceName(id) {
  const device = deviceById(id);
  return (
    settings.deviceNames[id] ||
    device?.advertisedName ||
    (id ? "Unknown sensor" : "No sensor")
  );
}

function showToast(message, duration = 3200) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  toastTimer = setTimeout(() => elements.toast.classList.add("hidden"), duration);
}

function addDiagnostic(level, message, details = {}) {
  diagnostics.unshift({
    timestamp: new Date().toISOString(),
    level,
    message,
    details,
  });
  diagnostics.splice(500);
  renderDiagnostics();
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 100) return value.toFixed(1);
  return value.toFixed(digits);
}

function formatValue(value, unit = "") {
  if (typeof value === "number") return formatNumber(value) + (unit ? " " + unit : "");
  if (!value || typeof value !== "object") return "—";
  if ("celsius" in value) return formatNumber(value.celsius) + " °C";
  if (["w", "x", "y", "z"].every((key) => key in value)) {
    return ["w", "x", "y", "z"]
      .map((key) => key + " " + formatNumber(value[key], 3))
      .join(" · ");
  }
  if (["x", "y", "z"].every((key) => key in value)) {
    return ["x", "y", "z"]
      .map((key) => key.toUpperCase() + " " + formatNumber(value[key]))
      .join(" · ") + (unit ? " " + unit : "");
  }
  return JSON.stringify(value);
}

function ago(timestamp) {
  if (!timestamp) return "No data";
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 1) return "Now";
  if (seconds < 60) return Math.floor(seconds) + "s ago";
  return Math.floor(seconds / 60) + "m ago";
}

function badgeClass(state) {
  if (state === "ready" || state === "live" || state === "complete") return "success";
  if (
    state === "failed" ||
    state === "invalid" ||
    state === "error" ||
    state === "interrupted"
  ) {
    return "error";
  }
  return "warning";
}

function switchTab(tab) {
  settings.activeTab = tab;
  saveSettings();
  $$(".tab").forEach((button) =>
    button.classList.toggle("active", button.dataset.tab === tab),
  );
  $$(".panel").forEach((panel) =>
    panel.classList.toggle("active", panel.dataset.panel === tab),
  );
  if (tab === "sessions") renderSessions();
}

function renderSupport() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSecure = window.isSecureContext;
  const hasBluetooth = bluetooth.supported;
  const messages = [];
  let warning = false;

  if (isIOS) {
    messages.push(
      "iPhone/iPad mode: use Demo Sensors to explore the app. Chrome on iOS does not expose Web Bluetooth, so WT901BLE connection requires Android or desktop Chrome.",
    );
    warning = true;
  } else if (!hasBluetooth) {
    messages.push(
      "Web Bluetooth is not available in this browser. Open this app in current Chrome on Android, macOS, Windows, or ChromeOS.",
    );
    warning = true;
  } else if (!isSecure) {
    messages.push(
      "Web Bluetooth requires HTTPS or localhost. Deploy to HTTPS before connecting a sensor.",
    );
    warning = true;
  } else {
    messages.push(
      "Web Bluetooth is available. Tap Add sensor once for each WT901BLE you want to use.",
    );
  }

  elements.supportBanner.textContent = messages.join(" ");
  elements.supportBanner.classList.add("visible");
  elements.supportBanner.classList.toggle("warning", warning);
  elements.addSensorButton.disabled = !hasBluetooth || !isSecure;
}

function renderSummary() {
  const devices = allDevices();
  const ready = devices.filter((device) => device.ready).length;
  const rates = devices.map((device) => sampleStore.health(device.id).sampleRateHz);
  const totalRate = rates.reduce((sum, rate) => sum + rate, 0);
  const activeServices = settings.services.filter((service) => service.active).length;

  elements.deviceSummary.innerHTML = `
    <article class="summary-card"><span>Known sensors</span><strong>${devices.length}</strong></article>
    <article class="summary-card"><span>Ready</span><strong>${ready}</strong></article>
    <article class="summary-card"><span>Packet rate</span><strong>${formatNumber(totalRate, 1)} Hz</strong></article>
    <article class="summary-card"><span>Active services</span><strong>${activeServices}</strong></article>
  `;
}

function renderDevices() {
  lastDeviceRender = Date.now();
  const devices = allDevices();
  renderSummary();

  if (!devices.length) {
    elements.devicesList.innerHTML = `
      <div class="empty-state">
        <strong>No sensors added</strong>
        <p>Tap Add sensor for a physical WT901BLE, or Start demo to exercise every Phase 1 screen.</p>
      </div>
    `;
    return;
  }

  elements.devicesList.innerHTML = devices
    .map((device) => {
      const health = sampleStore.health(device.id);
      const acceleration = sampleStore.latest(device.id, "acceleration");
      const attitude = sampleStore.latest(device.id, "attitude");
      const temperature = sampleStore.latest(device.id, "temperature");
      const state = device.ready ? "ready" : device.state;
      const actions =
        device.source === "demo"
          ? `<button class="button secondary" data-device-action="rename" data-id="${escapeHtml(device.id)}">Rename</button>`
          : `
              <button class="button ${device.connected ? "danger" : "primary"}" data-device-action="${device.connected ? "disconnect" : "connect"}" data-id="${escapeHtml(device.id)}">
                ${device.connected ? "Disconnect" : "Connect"}
              </button>
              <button class="button secondary" data-device-action="rename" data-id="${escapeHtml(device.id)}">Rename</button>
              <button class="button secondary" data-device-action="magnetic" data-id="${escapeHtml(device.id)}" ${device.ready ? "" : "disabled"}>Request magnetic</button>
              <button class="button secondary" data-device-action="forget" data-id="${escapeHtml(device.id)}">Forget</button>
            `;

      return `
        <article class="card">
          <div class="device-title">
            <div>
              <h3>${escapeHtml(deviceName(device.id))}</h3>
              <p>${escapeHtml(device.advertisedName)} · ${escapeHtml(device.source)}</p>
            </div>
            <span class="badge ${badgeClass(state)}">${escapeHtml(state)}</span>
          </div>
          <div class="device-meta">
            <span class="badge">${formatNumber(health.sampleRateHz, 1)} Hz</span>
            <span class="badge">${health.packetCount} packets</span>
            <span class="badge ${health.invalidCount ? "warning" : ""}">${health.invalidCount} invalid</span>
            <span class="badge">${ago(health.lastPacketAt)}</span>
          </div>
          <div class="device-readings">
            <div class="reading"><span>Acceleration</span><strong>${escapeHtml(formatValue(acceleration?.value, acceleration?.unit))}</strong></div>
            <div class="reading"><span>Attitude</span><strong>${escapeHtml(formatValue(attitude?.value, attitude?.unit))}</strong></div>
            <div class="reading"><span>Temperature</span><strong>${escapeHtml(formatValue(temperature?.value, temperature?.unit))}</strong></div>
            <div class="reading"><span>Device ID</span><strong title="${escapeHtml(device.id)}">${escapeHtml(device.id.slice(0, 14))}…</strong></div>
          </div>
          <div class="card-actions">${actions}</div>
        </article>
      `;
    })
    .join("");
}

function typeLabel(type) {
  return {
    display: "Display",
    angle: "Relative angle",
    stability: "Engineering stability",
  }[type] ?? type;
}

function renderServices() {
  if (!settings.services.length) {
    elements.servicesList.innerHTML = `
      <div class="empty-state"><strong>No services</strong><p>Add a service to turn sensor samples into live outputs.</p></div>
    `;
    return;
  }

  elements.servicesList.innerHTML = settings.services
    .map((service, index) => {
      const validation = serviceEngine.validate(service);
      const names = service.deviceIds.map(deviceName);
      return `
        <article class="service-row">
          <div class="service-title">
            <div>
              <h3>${escapeHtml(service.name)}</h3>
              <p>${escapeHtml(typeLabel(service.type))}</p>
            </div>
            <span class="badge ${validation ? "warning" : service.active ? "success" : ""}">
              ${validation ? "Needs setup" : service.active ? "Active" : "Inactive"}
            </span>
          </div>
          <div class="service-meta">
            <span class="badge">${service.deviceIds.length} device${service.deviceIds.length === 1 ? "" : "s"}</span>
            <span class="badge">${service.loggingEnabled ? "Derived logging on" : "Derived logging off"}</span>
            ${names.map((name) => `<span class="badge">${escapeHtml(name)}</span>`).join("")}
          </div>
          <p>${escapeHtml(validation ?? service.elements.map((item) => ELEMENT_LABELS[item] ?? item).join(", "))}</p>
          <div class="service-actions">
            <button class="button secondary" data-service-action="edit" data-id="${service.id}">Edit</button>
            <button class="button secondary" data-service-action="up" data-id="${service.id}" ${index === 0 ? "disabled" : ""}>Move up</button>
            <button class="button secondary" data-service-action="down" data-id="${service.id}" ${index === settings.services.length - 1 ? "disabled" : ""}>Move down</button>
            <button class="button danger" data-service-action="delete" data-id="${service.id}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMetric(item) {
  const label = item.deviceId
    ? deviceName(item.deviceId) + " · " + item.label
    : item.label;
  return `
    <div class="metric ${item.stale ? "stale" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatValue(item.value, item.unit))}</strong>
    </div>
  `;
}

function renderMonitor() {
  const services = settings.services.filter((service) => service.active);
  if (!services.length) {
    elements.monitorList.innerHTML = `
      <div class="empty-state"><strong>No active services</strong><p>Activate a service from the Services screen.</p></div>
    `;
    return;
  }

  const now = Date.now();
  elements.monitorList.innerHTML = services
    .map((service) => {
      const output = serviceEngine.evaluate(service, now);
      const previous = derivedLogTimes.get(service.id) ?? 0;
      if (logger.current && output.valid && now - previous >= 250) {
        logger.recordDerived(service, output, now);
        derivedLogTimes.set(service.id, now);
      }

      const angleActions =
        service.type === "angle"
          ? `
              <div class="card-actions">
                <button class="button secondary" data-monitor-action="capture-reference" data-id="${service.id}" ${output.valid ? "" : "disabled"}>Capture reference</button>
                <button class="button secondary" data-monitor-action="clear-reference" data-id="${service.id}" ${service.config?.reference ? "" : "disabled"}>Clear reference</button>
              </div>
            `
          : "";

      return `
        <article class="monitor-card">
          <header>
            <div>
              <h3>${escapeHtml(service.name)}</h3>
              <p>${escapeHtml(output.message)}</p>
            </div>
            <span class="badge ${badgeClass(output.state)}">${escapeHtml(output.state)}</span>
          </header>
          <div class="metric-grid">
            ${
              output.metrics.length
                ? output.metrics.map(renderMetric).join("")
                : `<div class="empty-state"><p>${escapeHtml(output.message)}</p></div>`
            }
          </div>
          ${angleActions}
        </article>
      `;
    })
    .join("");
}

function renderRecording() {
  if (logger.current) {
    elements.recordingStatus.textContent =
      "Recording · " + logger.current.rowCount.toLocaleString() + " rows";
    elements.recordingStatus.className = "badge error";
    elements.recordButton.textContent = "Stop recording";
    elements.recordButton.classList.add("recording");
  } else {
    elements.recordingStatus.textContent = "Not recording";
    elements.recordingStatus.className = "badge";
    elements.recordButton.textContent = "Start recording";
    elements.recordButton.classList.remove("recording");
  }
}

async function renderSessions() {
  try {
    const sessions = await logger.list();
    if (!sessions.length) {
      elements.sessionsList.innerHTML = `
        <div class="empty-state"><strong>No recorded sessions</strong><p>Start recording from Monitor. Data is written incrementally to this browser.</p></div>
      `;
      return;
    }
    elements.sessionsList.innerHTML = sessions
      .map((session) => {
        const start = Date.parse(session.startedAt);
        const end = session.endedAt ? Date.parse(session.endedAt) : Date.now();
        const duration = Math.max(0, (end - start) / 1000);
        return `
          <article class="session-row">
            <div class="session-title">
              <div>
                <h3>${escapeHtml(session.name)}</h3>
                <p>${new Date(session.startedAt).toLocaleString()}</p>
              </div>
              <span class="badge ${badgeClass(session.status)}">${escapeHtml(session.status)}</span>
            </div>
            <div class="session-meta">
              <span class="badge">${formatNumber(duration, 1)} seconds</span>
              <span class="badge">${Number(session.rowCount || 0).toLocaleString()} rows</span>
              <span class="badge">${session.devices?.length ?? 0} devices</span>
            </div>
            <div class="session-actions">
              <button class="button primary" data-session-action="csv" data-id="${session.id}">Export CSV</button>
              <button class="button secondary" data-session-action="json" data-id="${session.id}">Export metadata</button>
              <button class="button danger" data-session-action="delete" data-id="${session.id}">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");
  } catch (error) {
    elements.sessionsList.innerHTML = `
      <div class="empty-state"><strong>Sessions unavailable</strong><p>${escapeHtml(error.message)}</p></div>
    `;
  }
}

function renderDiagnostics() {
  if (!diagnostics.length) {
    elements.diagnosticsList.innerHTML = `
      <div class="empty-state"><strong>No diagnostic events</strong><p>Connection, decoder, and storage events will appear here.</p></div>
    `;
    return;
  }
  elements.diagnosticsList.innerHTML = diagnostics
    .map((event) => {
      const details = Object.keys(event.details).length
        ? " · " + JSON.stringify(event.details)
        : "";
      return `
        <div class="diagnostic-row">
          <span>${escapeHtml(event.timestamp)}</span>
          <strong class="level-${escapeHtml(event.level)}">${escapeHtml(event.level)}</strong>
          <span>${escapeHtml(event.message + details)}</span>
        </div>
      `;
    })
    .join("");
}

function renderServiceOptions(service) {
  const devices = allDevices();
  elements.serviceDevices.innerHTML = devices.length
    ? devices
        .map(
          (device) => `
            <label class="choice">
              <input type="checkbox" value="${escapeHtml(device.id)}" ${service.deviceIds.includes(device.id) ? "checked" : ""} />
              <span>${escapeHtml(deviceName(device.id))}</span>
            </label>
          `,
        )
        .join("")
    : `<p>No sensors are known yet. You can save and assign them later.</p>`;

  const type = elements.serviceType.value;
  const allowed =
    type === "display"
      ? SENSOR_ELEMENTS
      : type === "angle"
        ? ["quaternion"]
        : ["quaternion", "angularVelocity"];
  elements.serviceElements.innerHTML = allowed
    .map(
      (element) => `
        <label class="choice">
          <input type="checkbox" value="${element}" ${service.elements.includes(element) || type !== "display" ? "checked" : ""} ${type !== "display" ? "disabled" : ""} />
          <span>${escapeHtml(ELEMENT_LABELS[element])}</span>
        </label>
      `,
    )
    .join("");
  elements.elementFieldset.classList.toggle("hidden", false);
  elements.windowField.classList.toggle("hidden", type !== "stability");
}

function openServiceDialog(existing = null) {
  const service =
    existing ??
    {
      id: "",
      name: "",
      type: "display",
      deviceIds: [],
      elements: ["acceleration", "angularVelocity", "attitude"],
      active: true,
      loggingEnabled: true,
      config: {},
    };
  elements.serviceDialogTitle.textContent = existing ? "Edit service" : "Add service";
  elements.serviceId.value = service.id;
  elements.serviceName.value = service.name;
  elements.serviceType.value = service.type;
  elements.serviceType.disabled = Boolean(existing);
  elements.serviceActive.checked = service.active;
  elements.serviceLogging.checked = service.loggingEnabled;
  elements.stabilityWindow.value = String(service.config?.windowMs ?? 2000);
  elements.serviceFormError.textContent = "";
  renderServiceOptions(service);
  elements.serviceDialog.showModal();
  setTimeout(() => elements.serviceName.focus(), 50);
}

function selectedValues(container) {
  return $$("input[type=checkbox]", container)
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function saveServiceFromDialog() {
  const existing = settings.services.find(
    (service) => service.id === elements.serviceId.value,
  );
  const type = elements.serviceType.value;
  const deviceIds = selectedValues(elements.serviceDevices);
  let selectedElements = selectedValues(elements.serviceElements);
  if (type === "angle") selectedElements = ["quaternion"];
  if (type === "stability") selectedElements = ["quaternion", "angularVelocity"];

  const service = {
    id: existing?.id || (crypto.randomUUID?.() ?? String(Date.now())),
    name: elements.serviceName.value.trim(),
    type,
    deviceIds: type === "angle" ? deviceIds.slice(0, 2) : deviceIds,
    elements: selectedElements,
    active: elements.serviceActive.checked,
    loggingEnabled: elements.serviceLogging.checked,
    config: {
      ...(existing?.config ?? {}),
      windowMs:
        type === "stability" ? Number(elements.stabilityWindow.value) : undefined,
      reference: type === "angle" ? existing?.config?.reference ?? null : undefined,
    },
  };
  const validation = serviceEngine.validate(service);
  const hardError =
    !service.name
      ? "Enter a service name."
      : type === "display" && !selectedElements.length
        ? "Select at least one sensor element."
        : null;
  if (hardError) {
    elements.serviceFormError.textContent = hardError;
    return;
  }

  if (existing) Object.assign(existing, service);
  else settings.services.push(service);
  saveSettings();
  elements.serviceDialog.close();
  renderServices();
  renderMonitor();
  if (validation) showToast("Saved. " + validation);
  else showToast("Service saved.");
}

function moveService(id, direction) {
  const index = settings.services.findIndex((service) => service.id === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= settings.services.length) return;
  const [service] = settings.services.splice(index, 1);
  settings.services.splice(destination, 0, service);
  saveSettings();
  renderServices();
  renderMonitor();
}

function autoAssignDemoServices() {
  const demoIds = demo.devices.map((device) => device.id);
  for (const service of settings.services) {
    if (service.deviceIds.length) continue;
    if (service.type === "angle") service.deviceIds = demoIds.slice(0, 2);
    else service.deviceIds = demoIds.slice(0, 1);
  }
  saveSettings();
}

async function toggleRecording() {
  try {
    if (logger.current) {
      const finished = await logger.stop();
      addDiagnostic("info", "Recording stopped.", {
        sessionId: finished.id,
        rows: finished.rowCount,
      });
      showToast("Recording saved locally.");
    } else {
      const proposed = "Sensor Session " + new Date().toLocaleString();
      const name = prompt("Session name", proposed);
      if (name === null) return;
      const devices = allDevices().map((device) => ({
        id: device.id,
        name: deviceName(device.id),
        advertisedName: device.advertisedName,
        source: device.source,
      }));
      await logger.start({
        name,
        devices,
        services: clone(settings.services),
      });
      addDiagnostic("info", "Recording started.", { name });
    }
    renderRecording();
    renderSessions();
  } catch (error) {
    addDiagnostic("error", "Recording operation failed.", { error: error.message });
    showToast(error.message);
  }
}

function handleSamples({ deviceId, samples, frameType, rawHex }) {
  sampleStore.update(deviceId, samples, { frameType, rawHex });
  logger.recordSamples(deviceId, deviceName(deviceId), samples);
  if (Date.now() - lastDeviceRender > 500) renderDevices();
}

function setupEvents() {
  $$(".tab").forEach((button) =>
    button.addEventListener("click", () => switchTab(button.dataset.tab)),
  );

  elements.addSensorButton.addEventListener("click", async () => {
    try {
      addDiagnostic("info", "Opening Chrome Bluetooth chooser.");
      const device = await bluetooth.requestAndConnect();
      settings.deviceNames[device.id] ??= device.advertisedName;
      saveSettings();
      renderDevices();
      renderServiceOptions({
        deviceIds: [],
        elements: [],
      });
    } catch (error) {
      const cancelled = error.name === "NotFoundError";
      addDiagnostic(cancelled ? "warning" : "error", cancelled ? "Bluetooth chooser cancelled." : "Add sensor failed.", {
        error: error.message,
      });
      if (!cancelled) showToast(error.message);
    }
  });

  elements.demoButton.addEventListener("click", () => {
    if (demo.running) {
      demo.stop();
      elements.demoButton.textContent = "Start demo";
      addDiagnostic("info", "Demo sensors stopped.");
    } else {
      demo.start();
      autoAssignDemoServices();
      elements.demoButton.textContent = "Stop demo";
      addDiagnostic("info", "Two demo WT901BLE sensors started.");
      switchTab("monitor");
    }
    renderDevices();
    renderServices();
    renderMonitor();
  });

  elements.devicesList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-device-action]");
    if (!button) return;
    const id = button.dataset.id;
    try {
      if (button.dataset.deviceAction === "connect") await bluetooth.connect(id);
      if (button.dataset.deviceAction === "disconnect") bluetooth.disconnect(id);
      if (button.dataset.deviceAction === "magnetic") {
        await bluetooth.requestMagneticField(id);
        showToast("Magnetic-field request sent.");
      }
      if (button.dataset.deviceAction === "rename") {
        const name = prompt("Sensor name", deviceName(id));
        if (name?.trim()) {
          settings.deviceNames[id] = name.trim();
          saveSettings();
        }
      }
      if (button.dataset.deviceAction === "forget") {
        if (confirm("Forget " + deviceName(id) + "?")) {
          await bluetooth.forget(id);
          delete settings.deviceNames[id];
          for (const service of settings.services) {
            service.deviceIds = service.deviceIds.filter((item) => item !== id);
          }
          saveSettings();
        }
      }
      renderDevices();
      renderServices();
      renderMonitor();
    } catch (error) {
      addDiagnostic("error", "Device action failed.", {
        action: button.dataset.deviceAction,
        error: error.message,
      });
      showToast(error.message);
    }
  });

  elements.addServiceButton.addEventListener("click", () => openServiceDialog());
  elements.serviceType.addEventListener("change", () => {
    const service = {
      deviceIds: selectedValues(elements.serviceDevices),
      elements: selectedValues(elements.serviceElements),
    };
    renderServiceOptions(service);
  });
  elements.saveServiceButton.addEventListener("click", saveServiceFromDialog);

  elements.servicesList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-service-action]");
    if (!button) return;
    const service = settings.services.find((item) => item.id === button.dataset.id);
    if (!service) return;
    if (button.dataset.serviceAction === "edit") openServiceDialog(service);
    if (button.dataset.serviceAction === "up") moveService(service.id, -1);
    if (button.dataset.serviceAction === "down") moveService(service.id, 1);
    if (
      button.dataset.serviceAction === "delete" &&
      confirm('Delete service "' + service.name + '"?')
    ) {
      settings.services = settings.services.filter((item) => item.id !== service.id);
      saveSettings();
      renderServices();
      renderMonitor();
    }
  });

  elements.monitorList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-monitor-action]");
    if (!button) return;
    const service = settings.services.find((item) => item.id === button.dataset.id);
    if (!service) return;
    try {
      if (button.dataset.monitorAction === "capture-reference") {
        serviceEngine.captureReference(service);
        showToast("Relative-angle reference captured.");
      } else {
        serviceEngine.clearReference(service);
        showToast("Relative-angle reference cleared.");
      }
      saveSettings();
      renderMonitor();
    } catch (error) {
      showToast(error.message);
    }
  });

  elements.recordButton.addEventListener("click", toggleRecording);
  elements.refreshSessionsButton.addEventListener("click", renderSessions);
  elements.sessionsList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-session-action]");
    if (!button) return;
    try {
      if (button.dataset.sessionAction === "csv") await logger.exportCsv(button.dataset.id);
      if (button.dataset.sessionAction === "json") {
        await logger.exportMetadata(button.dataset.id);
      }
      if (
        button.dataset.sessionAction === "delete" &&
        confirm("Delete this recorded session and all of its rows?")
      ) {
        await logger.delete(button.dataset.id);
        await renderSessions();
      }
    } catch (error) {
      addDiagnostic("error", "Session action failed.", { error: error.message });
      showToast(error.message);
    }
  });

  elements.copyDiagnosticsButton.addEventListener("click", async () => {
    const text = diagnostics
      .map(
        (event) =>
          event.timestamp +
          " " +
          event.level.toUpperCase() +
          " " +
          event.message +
          " " +
          JSON.stringify(event.details),
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Diagnostics copied.");
    } catch {
      showToast("Clipboard permission was unavailable.");
    }
  });
  elements.clearDiagnosticsButton.addEventListener("click", () => {
    diagnostics.length = 0;
    renderDiagnostics();
  });

  bluetooth.addEventListener("devicechanged", renderDevices);
  bluetooth.addEventListener("deviceremoved", renderDevices);
  bluetooth.addEventListener("samples", (event) => handleSamples(event.detail));
  bluetooth.addEventListener("decodeerror", (event) =>
    sampleStore.markInvalid(event.detail.deviceId),
  );
  bluetooth.addEventListener("diagnostic", (event) => {
    const { level, message, ...details } = event.detail;
    addDiagnostic(level, message, details);
  });

  demo.addEventListener("changed", renderDevices);
  demo.addEventListener("removed", (event) => {
    event.detail.forEach((id) => sampleStore.clear(id));
    renderDevices();
  });
  demo.addEventListener("samples", (event) => handleSamples(event.detail));

  logger.addEventListener("changed", () => {
    renderRecording();
    renderSessions();
  });

  window.addEventListener("online", renderOnlineState);
  window.addEventListener("offline", renderOnlineState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && logger.current) logger.flush();
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.classList.remove("hidden");
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.installButton.classList.add("hidden");
    showToast("SensoryLab installed.");
  });
  elements.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    elements.installButton.classList.add("hidden");
  });
}

function renderOnlineState() {
  elements.offlineBadge.classList.toggle("hidden", navigator.onLine);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    addDiagnostic("info", "Offline app cache registered.", { version: APP_VERSION });
  } catch (error) {
    addDiagnostic("warning", "Offline cache registration failed.", {
      error: error.message,
    });
  }
}

async function initialize() {
  setupEvents();
  renderSupport();
  renderOnlineState();
  renderDevices();
  renderServices();
  renderMonitor();
  renderRecording();
  renderDiagnostics();
  switchTab(settings.activeTab);

  try {
    const interrupted = await logger.initialize();
    if (interrupted) {
      addDiagnostic("warning", "Recovered interrupted recording sessions.", {
        count: interrupted,
      });
    }
  } catch (error) {
    addDiagnostic("error", "Local session database could not initialize.", {
      error: error.message,
    });
  }

  await registerServiceWorker();
  if (bluetooth.supported) {
    const restored = await bluetooth.restoreGrantedDevices();
    if (restored.length) {
      addDiagnostic("info", "Restored previously granted Bluetooth devices.", {
        count: restored.length,
      });
    }
    renderDevices();
  }

  setInterval(() => {
    renderMonitor();
    renderRecording();
    if (Date.now() - lastDeviceRender > 1000) renderDevices();
  }, 250);
}

initialize();
