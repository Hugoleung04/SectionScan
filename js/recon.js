const KEY_STORAGE = "sectionscan.meshyKey";
const CREATE_URL = "https://api.meshy.ai/openapi/v1/multi-image-to-3d";
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.85;
const POLL_MS = 3000;
const TIMEOUT_MS = 8 * 60 * 1000;

export function getMeshyKey() {
  try {
    return (localStorage.getItem(KEY_STORAGE) || "").trim();
  } catch {
    return "";
  }
}

export function setMeshyKey(key) {
  const value = String(key || "").trim();
  try {
    if (value) localStorage.setItem(KEY_STORAGE, value);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    throw new Error("無法儲存 API key（瀏覽器可能停用了本機儲存）");
  }
}

export function isVideoFile(file) {
  const type = (file && file.type) || "";
  const name = (file && file.name) || "";
  return type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(name);
}

export function isStillImage(file) {
  if (!file || isVideoFile(file)) return false;
  const type = file.type || "";
  const name = file.name || "";
  if (type.startsWith("image/")) return true;
  if (/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(name)) return true;
  if (!type && name) return true;
  return false;
}

export function pickStillImages(files, selected) {
  const all = Array.from(files || []).filter(isStillImage);
  const chosen = Array.from(selected || []).filter(isStillImage);
  const source = chosen.length ? chosen : all;
  if (source.length <= 4) return source.slice();
  const last = source.length - 1;
  const idxs = [0, Math.round(last / 3), Math.round((2 * last) / 3), last];
  const seen = new Set();
  const out = [];
  for (const i of idxs) {
    if (!seen.has(i)) {
      seen.add(i);
      out.push(source[i]);
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        /* fall through to img element */
      }
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fileToJpegDataUri(file) {
  let bitmap;
  try {
    bitmap = await decodeImage(file);
  } catch {
    throw new Error("無法轉換相片（HEIC 可能不被此瀏覽器支援），請改用 JPEG／PNG");
  }
  const width = bitmap.width || bitmap.naturalWidth || 0;
  const height = bitmap.height || bitmap.naturalHeight || 0;
  if (!width || !height) {
    if (bitmap.close) bitmap.close();
    throw new Error("相片尺寸無效，請換一張再試");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const cw = Math.max(1, Math.round(width * scale));
  const ch = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if (bitmap.close) bitmap.close();
    throw new Error("無法處理相片");
  }
  ctx.drawImage(bitmap, 0, 0, cw, ch);
  if (bitmap.close) bitmap.close();
  let uri;
  try {
    uri = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    throw new Error("相片轉換失敗，請換一張較小的圖");
  }
  if (!uri || !uri.startsWith("data:image/jpeg")) {
    throw new Error("相片轉換失敗，請換一張 JPEG／PNG");
  }
  return uri;
}

async function readErrorBody(res) {
  try {
    const data = await res.json();
    return data.message || data.error || (data.task_error && data.task_error.message) || "";
  } catch {
    try {
      return (await res.text()).slice(0, 200);
    } catch {
      return "";
    }
  }
}

async function httpError(res) {
  if (res.status === 401) return new Error("API key 無效，請到 meshy.ai 重新複製");
  if (res.status === 402) return new Error("Meshy 額度不足，請到 meshy.ai 加值");
  if (res.status === 429) return new Error("請求過於頻繁，請稍後再試");
  const extra = await readErrorBody(res);
  return new Error("Meshy 請求失敗（" + res.status + "）" + (extra ? "：" + extra : ""));
}

async function createTask(key, imageUrls, onProgress) {
  onProgress && onProgress("正在送出相片到 Meshy…");
  let res;
  try {
    res = await fetch(CREATE_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image_urls: imageUrls,
        should_texture: true,
        enable_pbr: true,
        target_formats: ["glb"],
        auto_size: true,
        ai_model: "latest"
      })
    });
  } catch (err) {
    throw new Error("無法連接 Meshy，請檢查網絡");
  }
  if (!res.ok) throw await httpError(res);
  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error("Meshy 回傳格式無效");
  }
  const id = data && data.result;
  if (!id) throw new Error("Meshy 沒有回傳工作編號");
  return id;
}

async function fetchTask(key, taskId) {
  let res;
  try {
    res = await fetch(CREATE_URL + "/" + encodeURIComponent(taskId), {
      headers: { Authorization: "Bearer " + key }
    });
  } catch (err) {
    throw new Error("無法查詢 Meshy 進度，請檢查網絡");
  }
  if (!res.ok) throw await httpError(res);
  try {
    return await res.json();
  } catch (err) {
    throw new Error("Meshy 進度回傳格式無效");
  }
}

async function pollTask(key, taskId, onProgress) {
  const started = Date.now();
  while (true) {
    if (Date.now() - started > TIMEOUT_MS) {
      throw new Error("雲端建模逾時（約 8 分鐘），請稍後再試");
    }
    const task = await fetchTask(key, taskId);
    const status = task.status;
    const progress = Number(task.progress);
    const pct = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
    if (status === "PENDING" || status === "IN_PROGRESS") {
      let queue = "";
      if (status === "PENDING" && task.preceding_tasks) {
        queue = "（前面還有 " + task.preceding_tasks + " 個工作）";
      }
      if (onProgress) onProgress("雲端建模中… " + pct + "%" + queue);
      await sleep(POLL_MS);
      continue;
    }
    if (status === "SUCCEEDED") return task;
    if (status === "FAILED") {
      const msg = (task.task_error && task.task_error.message) || "建模失敗";
      throw new Error("Meshy 建模失敗：" + msg);
    }
    if (status === "CANCELED") throw new Error("建模工作已取消");
    throw new Error("未知狀態：" + (status || "（空白）"));
  }
}

async function downloadGlb(url, onProgress) {
  if (onProgress) onProgress("正在下載 GLB…");
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error("模型已生成，但瀏覽器被跨域（CORS）限制，無法下載 GLB。請稍後再試，或用 Polycam／Scaniverse 匯出 GLB 再匯入。");
  }
  if (!res.ok) throw new Error("下載 GLB 失敗（" + res.status + "）");
  const blob = await res.blob();
  if (!blob || blob.size < 100) throw new Error("下載的 GLB 檔案無效");
  return new File([blob], "scan.glb", { type: "model/gltf-binary" });
}

export async function reconstructFromPhotos(opts) {
  opts = opts || {};
  const key = getMeshyKey();
  if (!key) throw new Error("請先儲存 Meshy API key");
  const images = pickStillImages(opts.files, opts.selected);
  if (!images.length) throw new Error("請先加入最少 1 張靜態相片（影片不會直接送去 Meshy）");
  if (opts.onProgress) opts.onProgress("正在壓縮 " + images.length + " 張相片…");
  const dataUris = [];
  for (let i = 0; i < images.length; i++) {
    dataUris.push(await fileToJpegDataUri(images[i]));
  }
  const taskId = await createTask(key, dataUris, opts.onProgress);
  if (opts.onProgress) opts.onProgress("已建立雲端工作，等待 Meshy…");
  const task = await pollTask(key, taskId, opts.onProgress);
  const glbUrl = task && task.model_urls && task.model_urls.glb;
  if (!glbUrl) throw new Error("建模成功但沒有 GLB 下載網址");
  return downloadGlb(glbUrl, opts.onProgress);
}
