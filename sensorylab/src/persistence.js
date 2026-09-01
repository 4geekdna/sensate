const SETTINGS_KEY = "sensorylab-phase1-settings-v1";
const DB_NAME = "sensorylab-phase1";
const DB_VERSION = 1;

export function makeId(prefix = "id") {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + "-" + id;
}

export class SettingsStore {
  load() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return {
        deviceNames: stored.deviceNames ?? {},
        services: Array.isArray(stored.services) ? stored.services : [],
        activeTab: stored.activeTab ?? "devices",
      };
    } catch {
      return { deviceNames: {}, services: [], activeTab: "devices" };
    }
  }

  save(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

let databasePromise;
export function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("sessions")) {
        database.createObjectStore("sessions", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("rows")) {
        const rows = database.createObjectStore("rows", {
          keyPath: "rowId",
          autoIncrement: true,
        });
        rows.createIndex("sessionId", "sessionId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

export async function putSession(session) {
  const database = await openDatabase();
  const transaction = database.transaction("sessions", "readwrite");
  transaction.objectStore("sessions").put(session);
  await transactionPromise(transaction);
  return session;
}

export async function getSession(id) {
  const database = await openDatabase();
  const transaction = database.transaction("sessions", "readonly");
  return requestPromise(transaction.objectStore("sessions").get(id));
}

export async function getSessions() {
  const database = await openDatabase();
  const transaction = database.transaction("sessions", "readonly");
  const sessions = await requestPromise(transaction.objectStore("sessions").getAll());
  return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function appendRows(rows) {
  if (!rows.length) return;
  const database = await openDatabase();
  const transaction = database.transaction("rows", "readwrite");
  const store = transaction.objectStore("rows");
  for (const row of rows) store.add(row);
  await transactionPromise(transaction);
}

export async function getSessionRows(sessionId) {
  const database = await openDatabase();
  const transaction = database.transaction("rows", "readonly");
  const index = transaction.objectStore("rows").index("sessionId");
  return requestPromise(index.getAll(IDBKeyRange.only(sessionId)));
}

export async function deleteSessionData(sessionId) {
  const database = await openDatabase();
  const transaction = database.transaction(["sessions", "rows"], "readwrite");
  transaction.objectStore("sessions").delete(sessionId);
  const index = transaction.objectStore("rows").index("sessionId");
  const cursorRequest = index.openKeyCursor(IDBKeyRange.only(sessionId));
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    transaction.objectStore("rows").delete(cursor.primaryKey);
    cursor.continue();
  };
  await transactionPromise(transaction);
}

export async function recoverInterruptedSessions() {
  const sessions = await getSessions();
  const interrupted = sessions.filter((session) => session.status === "recording");
  for (const session of interrupted) {
    await putSession({
      ...session,
      status: "interrupted",
      endedAt: session.endedAt ?? new Date().toISOString(),
    });
  }
  return interrupted.length;
}

