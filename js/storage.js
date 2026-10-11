// storage.js — saves the app's data on this device. Uses IndexedDB (large, durable);
// falls back to localStorage when IndexedDB is unavailable (some private modes).
// Nothing ever leaves the device.

const DB_NAME = "invogen";
const STORE = "kv";
const KEY = "state";
const LS_KEY = "invogen.state.v4";

let dbPromise = null;
let mode = "idb";

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("no indexedDB")); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
  return dbPromise;
}

function idb(method, ...args) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, method === "get" ? "readonly" : "readwrite");
    const req = tx.objectStore(STORE)[method](...args);
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("aborted"));
  }));
}

export async function loadData() {
  try {
    const v = await idb("get", KEY);
    mode = "idb";
    if (v) return v;
    // A previous session may have fallen back to localStorage; pick that up once.
    const ls = readLS();
    return ls;
  } catch {
    mode = "local";
    return readLS();
  }
}

function readLS() {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

// Returns true when the data reached storage.
export async function saveData(data) {
  if (mode === "idb") {
    try {
      await idb("put", data, KEY);
      try { localStorage.removeItem(LS_KEY); } catch {}
      return true;
    } catch { mode = "local"; }
  }
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

export async function clearData() {
  try { await idb("delete", KEY); } catch {}
  try { localStorage.removeItem(LS_KEY); } catch {}
}

export const storageMode = () => mode;

// Ask the browser not to clear this site's data when the device runs low on space.
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {}
}
