const DB_NAME = "sectionscan-library";
const DB_VERSION = 1;
const META_STORE = "meta";
const FILE_STORE = "files";
const LAST_KEY = "sectionscan.lastModelId";

function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function extOf(filename) {
  const m = String(filename || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function displayName(filename) {
  const base = String(filename || "").trim() || "未命名模型";
  return base.replace(/[/\\]/g, " ").slice(0, 80);
}

function mimeFromExt(ext) {
  if (ext === "glb") return "model/gltf-binary";
  if (ext === "gltf") return "model/gltf+json";
  if (ext === "usdz") return "model/vnd.usdz+zip";
  return "application/octet-stream";
}

function guessExt(file) {
  const type = ((file && file.type) || "").toLowerCase();
  if (type.includes("usdz")) return "usdz";
  if (type.includes("gltf+json")) return "gltf";
  if (type.includes("gltf")) return "glb";
  return "glb";
}

export function typeLabel(meta) {
  const ext = ((meta && meta.ext) || "").toUpperCase();
  if (ext === "USDZ" || ext === "GLB" || ext === "GLTF") return ext;
  return ext || "3D";
}

export function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(ts) {
  const d = new Date(ts);
  if (!ts || Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString("zh-Hant-HK", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function storageErrorMessage(err) {
  const name = (err && err.name) || "";
  const msg = (err && err.message) || "";
  const text = `${name} ${msg}`.toLowerCase();
  if (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    (err && err.code === 22) ||
    text.includes("quota")
  ) {
    return "儲存空間不足，無法把這個模型加入圖庫。請刪除圖庫裡較大的模型，或改用較小的 GLB。模型仍可在今次檢視，但重新整理後會消失。";
  }
  if (name === "UnknownError") {
    return "無法保存這個模型（檔案可能太大，或無痕模式限制 IndexedDB）。請改用較小的 GLB，或刪除圖庫中其他模型。模型仍可在今次檢視。";
  }
  if (name === "InvalidStateError" || text.includes("private") || text.includes("the user denied")) {
    return "無法使用本機圖庫（可能是無痕模式，或瀏覽器限制 IndexedDB）。模型可以今次檢視，但不會保存。";
  }
  return `無法保存到圖庫：${msg || name || "未知錯誤"}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("這個瀏覽器不支援 IndexedDB"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB 開啟失敗"));
    req.onblocked = () => reject(new Error("IndexedDB 被其他分頁佔用，請關閉舊分頁後再試"));
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB 操作失敗"));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB 交易失敗"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB 交易中止"));
  });
}

export async function list() {
  const db = await openDb();
  try {
    const tx = db.transaction(META_STORE, "readonly");
    const rowsP = reqToPromise(tx.objectStore(META_STORE).getAll());
    const done = txDone(tx);
    const rows = await rowsP;
    await done;
    const items = Array.isArray(rows) ? rows : [];
    items.sort((a, b) => (b.lastOpenedAt || b.createdAt || 0) - (a.lastOpenedAt || a.createdAt || 0));
    return items;
  } finally {
    db.close();
  }
}

export async function get(id) {
  if (!id) return null;
  const db = await openDb();
  try {
    const tx = db.transaction([META_STORE, FILE_STORE], "readonly");
    const metaP = reqToPromise(tx.objectStore(META_STORE).get(id));
    const fileP = reqToPromise(tx.objectStore(FILE_STORE).get(id));
    const done = txDone(tx);
    const [meta, file] = await Promise.all([metaP, fileP]);
    await done;
    if (!meta || !file || !file.blob) return null;
    return { ...meta, blob: file.blob };
  } finally {
    db.close();
  }
}

export async function addFromFile(file) {
  if (!file) throw new Error("沒有檔案可保存");
  const ext = extOf(file.name) || guessExt(file);
  const mime = file.type || mimeFromExt(ext);
  const blob = new Blob([file], { type: mime });
  const rec = {
    id: newId(),
    name: displayName(file.name),
    mime,
    ext,
    size: file.size || blob.size || 0,
    createdAt: Date.now(),
    lastOpenedAt: Date.now()
  };
  const db = await openDb();
  try {
    const tx = db.transaction([META_STORE, FILE_STORE], "readwrite");
    tx.objectStore(META_STORE).put(rec);
    tx.objectStore(FILE_STORE).put({ id: rec.id, blob });
    await txDone(tx);
  } finally {
    db.close();
  }
  await requestPersist();
  writeLastId(rec.id);
  return rec;
}

export async function rename(id, name) {
  const next = displayName(name);
  if (!next) throw new Error("名稱不能空白");
  const db = await openDb();
  try {
    const tx1 = db.transaction(META_STORE, "readonly");
    const recP = reqToPromise(tx1.objectStore(META_STORE).get(id));
    const done1 = txDone(tx1);
    const rec = await recP;
    await done1;
    if (!rec) throw new Error("找不到這個模型");
    rec.name = next;
    const tx2 = db.transaction(META_STORE, "readwrite");
    tx2.objectStore(META_STORE).put(rec);
    await txDone(tx2);
    return rec;
  } finally {
    db.close();
  }
}

export async function remove(id) {
  const db = await openDb();
  try {
    const tx = db.transaction([META_STORE, FILE_STORE], "readwrite");
    tx.objectStore(META_STORE).delete(id);
    tx.objectStore(FILE_STORE).delete(id);
    await txDone(tx);
  } finally {
    db.close();
  }
  if (readLastId() === id) writeLastId("");
}

export async function touch(id) {
  const db = await openDb();
  try {
    const tx1 = db.transaction(META_STORE, "readonly");
    const recP = reqToPromise(tx1.objectStore(META_STORE).get(id));
    const done1 = txDone(tx1);
    const rec = await recP;
    await done1;
    if (!rec) return null;
    rec.lastOpenedAt = Date.now();
    const tx2 = db.transaction(META_STORE, "readwrite");
    tx2.objectStore(META_STORE).put(rec);
    await txDone(tx2);
    writeLastId(id);
    return rec;
  } finally {
    db.close();
  }
}

export async function toFile(record) {
  if (!record || !record.blob) throw new Error("找不到模型檔案");
  const ext = record.ext || "glb";
  let name = record.name || `model.${ext}`;
  if (!/\.[a-z0-9]+$/i.test(name)) name += `.${ext}`;
  const type = record.mime || mimeFromExt(ext);
  try {
    return new File([record.blob], name, { type });
  } catch {
    const copy = record.blob.slice(0, record.blob.size, type);
    try {
      copy.name = name;
    } catch (_) {}
    return copy;
  }
}

export function readLastId() {
  try {
    return localStorage.getItem(LAST_KEY) || "";
  } catch {
    return "";
  }
}

export function writeLastId(id) {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch (_) {}
}

export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch (_) {}
}
