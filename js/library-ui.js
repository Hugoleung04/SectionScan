import * as Lib from "./library.js?v=1.11";

let api = null;
let activeLibraryId = "";
const $ = (id) => document.getElementById(id);

export function getActiveLibraryId() { return activeLibraryId; }
export function clearActiveLibraryId() { activeLibraryId = ""; }
export function refreshLibrary() { return renderLibrary(); }

export function initLibraryUi(deps) {
  api = deps;
  bindLibraryUi();
  return restoreLastModel()
    .then(() => renderLibrary())
    .catch((err) => {
      console.error(err);
      return renderLibrary();
    });
}

function toast(msg, ms) { return api.toast(msg, ms); }
function show(id) { return api.show(id); }
function viewer() { return api.getViewer(); }
function syncPlaneSlider() { return api.syncPlaneSlider(); }
function updateMetrics() { return api.updateMetrics(); }
function setShowPlane(on) { return api.setShowPlane(on); }

async function importModelFile(file, inputEl) {
  if (!file || !viewer()) {
    if (inputEl) inputEl.value = "";
    return;
  }
  let stable = file;
  try {
    stable = new File([file], file.name || "model", { type: file.type || "" });
  } catch (_) {
    stable = file;
  }
  if (inputEl) inputEl.value = "";
  try {
    const name = (stable.name || "").toLowerCase();
    const type = (stable.type || "").toLowerCase();
    const isUsdz =
      name.endsWith(".usdz") ||
      type === "model/vnd.usdz+zip" ||
      type === "application/zip+usdz";
    toast(isUsdz ? "正在載入 USDZ…" : "正在載入模型…", 8000);
    await viewer().loadModel(stable);
    syncPlaneSlider();
    $("heightMm").value = "1000";
    show("panel-model");
    try {
      const rec = await Lib.addFromFile(stable);
      activeLibraryId = rec.id;
      toast("已匯入並加入圖庫，請先定標真實高度");
      renderLibrary();
    } catch (saveErr) {
      console.error(saveErr);
      toast(Lib.storageErrorMessage(saveErr), 6000);
    }
  } catch (err) {
    const msg = (err && err.message) || "";
    if (msg.includes("這個 USDZ 沒有可顯示的網格")) toast(msg, 5000);
    else toast("匯入失敗，請用 GLB 或 USDZ");
    console.error(err);
  }
}

async function renderLibrary() {
  const listEl = $("libraryList");
  const emptyEl = $("libraryEmpty");
  if (!listEl) return;
  let items = [];
  try {
    items = await Lib.list();
  } catch (err) {
    listEl.innerHTML = "";
    if (emptyEl) {
      emptyEl.hidden = false;
      const p = emptyEl.querySelector("[data-empty-msg]") || emptyEl.querySelector("p");
      if (p) p.textContent = Lib.storageErrorMessage(err);
    }
    return;
  }
  if (emptyEl) emptyEl.hidden = items.length > 0;
  listEl.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "lib-item" + (item.id === activeLibraryId ? " on" : "");
    const main = document.createElement("button");
    main.type = "button";
    main.className = "lib-item-main";
    const nameEl = document.createElement("span");
    nameEl.className = "lib-item-name";
    nameEl.textContent = item.name;
    const metaEl = document.createElement("span");
    metaEl.className = "lib-item-meta";
    metaEl.textContent = [Lib.typeLabel(item), Lib.formatSize(item.size), "加入 " + Lib.formatTime(item.createdAt)]
      .filter(Boolean)
      .join(" · ");
    main.append(nameEl, metaEl);
    main.addEventListener("click", () => openLibraryModel(item.id));
    const actions = document.createElement("div");
    actions.className = "lib-item-actions";
    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "ghost";
    renameBtn.textContent = "改名";
    renameBtn.addEventListener("click", (e) => {
      e.preventDefault();
      askRename(item);
    });
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "ghost lib-danger";
    delBtn.textContent = "刪除";
    delBtn.addEventListener("click", (e) => {
      e.preventDefault();
      askDelete(item);
    });
    actions.append(renameBtn, delBtn);
    card.append(main, actions);
    listEl.appendChild(card);
  });
}

async function openLibraryModel(id) {
  if (!viewer()) return;
  try {
    toast("正在從圖庫載入…", 8000);
    const rec = await Lib.get(id);
    if (!rec) {
      toast("圖庫裡找不到這個模型");
      await renderLibrary();
      return;
    }
    const file = await Lib.toFile(rec);
    await viewer().loadModel(file);
    await Lib.touch(id);
    activeLibraryId = id;
    syncPlaneSlider();
    $("heightMm").value = "1000";
    show("panel-model");
    toast("已從圖庫開啟「" + rec.name + "」，請確認定標");
    renderLibrary();
  } catch (err) {
    console.error(err);
    toast("從圖庫載入失敗", 5000);
  }
}

let dialogMode = null;
let dialogTarget = null;

function closeLibraryDialog() {
  const el = $("libraryDialog");
  if (el) el.hidden = true;
  dialogMode = null;
  dialogTarget = null;
}

function askRename(item) {
  dialogMode = "rename";
  dialogTarget = item;
  const title = $("libraryDialogTitle");
  const row = $("libraryDialogRow");
  const input = $("libraryDialogInput");
  const ok = $("libraryDialogOk");
  const dlg = $("libraryDialog");
  if (!dlg) return;
  if (title) title.textContent = "重新命名模型";
  if (row) row.hidden = false;
  if (ok) ok.textContent = "確定";
  if (input) input.value = item.name || "";
  dlg.hidden = false;
  setTimeout(() => input && input.focus(), 50);
}

function askDelete(item) {
  dialogMode = "delete";
  dialogTarget = item;
  const title = $("libraryDialogTitle");
  const row = $("libraryDialogRow");
  const ok = $("libraryDialogOk");
  const dlg = $("libraryDialog");
  if (!dlg) return;
  if (title) title.textContent = "刪除「" + item.name + "」？此裝置上保存的檔案會被移除。";
  if (row) row.hidden = true;
  if (ok) ok.textContent = "刪除";
  dlg.hidden = false;
}

async function confirmLibraryDialog() {
  if (!dialogMode || !dialogTarget) {
    closeLibraryDialog();
    return;
  }
  try {
    if (dialogMode === "rename") {
      const input = $("libraryDialogInput");
      await Lib.rename(dialogTarget.id, (input && input.value) || "");
      toast("已重新命名");
    } else if (dialogMode === "delete") {
      const id = dialogTarget.id;
      await Lib.remove(id);
      if (activeLibraryId === id) activeLibraryId = "";
      toast("已從圖庫刪除");
    }
  } catch (err) {
    toast((err && err.message) || "操作失敗", 4000);
  }
  closeLibraryDialog();
  renderLibrary();
}

function bindLibraryUi() {
  ["glbInput", "libraryModelInput", "libraryDockInput"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", (e) => importModelFile(e.target.files && e.target.files[0], e.target));
  });
  if ($("libraryDialogOk")) $("libraryDialogOk").addEventListener("click", confirmLibraryDialog);
  if ($("libraryDialogCancel")) $("libraryDialogCancel").addEventListener("click", closeLibraryDialog);
  if ($("libraryDialogInput")) {
    $("libraryDialogInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmLibraryDialog();
      }
    });
  }
}

async function restoreLastModel() {
  if (!viewer()) return;
  const lastId = Lib.readLastId();
  if (!lastId) {
    viewer().loadDemo("vase");
    syncPlaneSlider();
    return;
  }
  try {
    const rec = await Lib.get(lastId);
    if (!rec) {
      Lib.writeLastId("");
      viewer().loadDemo("vase");
      syncPlaneSlider();
      return;
    }
    const file = await Lib.toFile(rec);
    await viewer().loadModel(file);
    await Lib.touch(lastId);
    activeLibraryId = lastId;
    syncPlaneSlider();
    $("heightMm").value = "1000";
    show("panel-model");
    toast("已還原上次的模型「" + rec.name + "」", 2800);
  } catch (err) {
    console.error(err);
    viewer().loadDemo("vase");
    syncPlaneSlider();
  }
}

$("axisX").addEventListener("click", () => setAxis("x"));
$("axisY").addEventListener("click", () => setAxis("y"));
$("axisZ").addEventListener("click", () => setAxis("z"));

