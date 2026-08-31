import { Viewer } from "./viewer.js";
import { reconstructFromPhotos, getMeshyKey, setMeshyKey, pickStillImages } from "./recon.js?v=15";

const $ = (id) => document.getElementById(id);
let viewer = null;
let building = false;
try {
  viewer = new Viewer($("view3d"), $("view2d"));
} catch (err) {
  console.error(err);
  if (window.SectionScanMedia) window.SectionScanMedia.toast("3D 預覽載入失敗，但上傳功能仍可用");
}
function photos() {
  return window.SectionScanMedia ? window.SectionScanMedia.getPhotos() : [];
}
function selectedPhotos() {
  return window.SectionScanMedia && window.SectionScanMedia.getSelectedPhotos
    ? window.SectionScanMedia.getSelectedPhotos()
    : [];
}

function show(id) {
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelector(`.tab[data-panel="${id}"]`).classList.add("active");
  const mode = id.replace("panel-", "");
  document.querySelector(".app").className = `app mode-${mode}`;
  requestAnimationFrame(() => viewer && viewer.resize());
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => show(btn.dataset.panel));
});

function toast(msg, ms) {
  const el = $("toast");
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.style.display = "none"), ms || 2200);
}

function setReconNote(text, showNote) {
  const el = $("reconNote");
  if (!el) return;
  el.textContent = text || "";
  el.style.display = showNote === false || !text ? "none" : "block";
}

function refreshKeyStatus() {
  const el = $("meshyKeyStatus");
  if (!el) return;
  if (getMeshyKey()) {
    el.textContent = "已儲存 API key（只留在這部手機，不會上傳到本站）";
    el.classList.add("ok");
  } else {
    el.textContent = "尚未儲存 API key";
    el.classList.remove("ok");
  }
}

if ($("saveMeshyKey")) {
  $("saveMeshyKey").addEventListener("click", () => {
    const input = $("meshyKeyInput");
    const val = (input && input.value ? input.value : "").trim();
    if (!val) {
      toast("請貼上 Meshy API key");
      return;
    }
    try {
      setMeshyKey(val);
      if (input) input.value = "";
      refreshKeyStatus();
      toast("已儲存 API key");
    } catch (err) {
      toast(err.message || "無法儲存 API key");
    }
  });
}
refreshKeyStatus();

$("useDemoVase").addEventListener("click", () => {
  viewer.loadDemo("vase");
  $("heightMm").value = "280";
  show("panel-model");
  toast("已載入示範花瓶（高 280 mm）");
});
$("useDemoBox").addEventListener("click", () => {
  viewer.loadDemo("box");
  $("heightMm").value = "400";
  show("panel-model");
  toast("已載入示範箱體（高 400 mm）");
});
if ($("useDemoBowl")) {
  $("useDemoBowl").addEventListener("click", () => {
    viewer.loadDemo("bowl");
    $("heightMm").value = "220";
    show("panel-model");
    toast("已載入示範碗（高 220 mm）");
  });
}

$("glbInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const name = (file.name || "").toLowerCase();
    const type = (file.type || "").toLowerCase();
    const isUsdz =
      name.endsWith(".usdz") ||
      type === "model/vnd.usdz+zip" ||
      type === "application/zip+usdz";
    if (isUsdz) toast("正在載入 USDZ…", 8000);
    await viewer.loadModel(file);
    $("heightMm").value = "1000";
    show("panel-model");
    toast("已匯入 USDZ／GLB，請先定標真實高度");
  } catch (err) {
    const msg = (err && err.message) || "";
    if (msg.includes("這個 USDZ 沒有可顯示的網格")) toast(msg, 5000);
    else toast("匯入失敗，請用 GLB 或 USDZ");
    console.error(err);
  }
});

$("buildFromPhotos").addEventListener("click", async () => {
  if (building) return;
  if (!viewer) {
    toast("3D 預覽尚未載入");
    return;
  }
  if (!getMeshyKey()) {
    toast("請先儲存 Meshy API key");
    show("panel-capture");
    return;
  }
  const all = photos();
  const selected = selectedPhotos();
  const stills = pickStillImages(all, selected);
  if (!stills.length) {
    toast("請先加入最少 1 張靜態相片");
    return;
  }
  const btn = $("buildFromPhotos");
  const prevLabel = btn.textContent;
  building = true;
  btn.disabled = true;
  btn.textContent = "建模中…";
  setReconNote("正在準備 " + stills.length + " 張相片送去 Meshy…");
  toast("開始雲端建模（最多 4 張）");
  try {
    const file = await reconstructFromPhotos({
      files: all,
      selected,
      onProgress: (msg) => setReconNote(msg)
    });
    await viewer.loadGLB(file);
    $("heightMm").value = "1000";
    show("panel-model");
    setReconNote("雲端模型已載入。請輸入真實高度或用兩點定標。");
    toast("已載入模型，請定標高度／毫米", 4000);
  } catch (err) {
    console.error(err);
    const msg = (err && err.message) || "雲端建模失敗";
    setReconNote(msg);
    toast(msg, 4200);
  } finally {
    building = false;
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
});

$("axisX").addEventListener("click", () => setAxis("x"));
$("axisY").addEventListener("click", () => setAxis("y"));
$("axisZ").addEventListener("click", () => setAxis("z"));

function setAxis(axis) {
  ["x", "y", "z"].forEach((a) => $(`axis${a.toUpperCase()}`).classList.toggle("on", a === axis));
  viewer.setAxis(axis);
}

$("planeSlider").addEventListener("input", (e) => {
  const v = Number(e.target.value);
  $("planeLabel").textContent = v.toFixed(2);
  viewer.setPlane(v);
  updateMetrics();
});

$("heightMm").addEventListener("change", () => {
  viewer.setHeightMm($("heightMm").value);
  viewer.draw2d();
  updateMetrics();
});

$("pickScale").addEventListener("click", () => {
  viewer.pickScale = true;
  viewer.scalePts = [];
  show("panel-model");
  toast("在 3D 模型上點兩個已知距離的位置");
});

addEventListener("scalepicked", (e) => {
  const known = Number(prompt("這兩點的真實距離是多少毫米？", "100"));
  if (known > 0 && e.detail.units > 0) {
    viewer.mmPerUnit = known / e.detail.units;
    $("heightMm").value = String(Math.round(viewer.mmPerUnit * viewer.modelHeightUnits));
    viewer.draw2d();
    updateMetrics();
    toast("已用兩點距離完成定標");
  }
});

$("exportSvg").addEventListener("click", () => {
  const svg = viewer.exportSvg();
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "section.svg";
  a.click();
});

$("clearMeasure").addEventListener("click", () => {
  viewer.measure = [];
  viewer.draw2d();
});

function renderSectionList() {
  const box = $("sectionList");
  if (!box) return;
  box.innerHTML = "";
  viewer.savedSections.forEach((item, i) => {
    const btn = document.createElement("button");
    btn.textContent = `${item.axis.toUpperCase()} ${item.value.toFixed(2)}`;
    if (item.id === viewer.activeSectionId) btn.classList.add("on");
    btn.addEventListener("click", () => {
      viewer.showSavedSection(item.id);
      $("planeSlider").value = String(item.value);
      $("planeLabel").textContent = item.value.toFixed(2);
      setAxis(item.axis);
      viewer.showSavedSection(item.id);
      show("panel-section");
      updateMetrics();
    });
    box.appendChild(btn);
    if (i === 0 && !btn.textContent) btn.textContent = "截面 1";
  });
}

function setModeButtons(mode) {
  ["modeShape", "modeShape2", "modeBelow", "modeBelow2"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    const isShape = id.startsWith("modeShape");
    el.classList.toggle("on", mode === "shape" ? isShape : !isShape && mode === "below");
  });
}

function applyViewMode(mode) {
  viewer.setViewMode(mode);
  setModeButtons(mode);
  if (mode === "shape") {
    show("panel-section");
    toast("只顯示你選取嘅截面形狀");
  } else if (mode === "below") {
    show("panel-model");
    toast("已隱藏切面以上，保留以下部分");
  } else {
    show("panel-model");
  }
  updateMetrics();
}

$("selectSection").addEventListener("click", () => {
  const item = viewer.selectCurrentSection();
  if (!item) {
    toast("呢個位置未切開到物件，試下郁切面");
    return;
  }
  renderSectionList();
  applyViewMode(viewer.viewMode === "below" ? "below" : "shape");
});

$("modeShape").addEventListener("click", () => applyViewMode("shape"));
$("modeShape2").addEventListener("click", () => applyViewMode("shape"));
$("modeBelow").addEventListener("click", () => applyViewMode("below"));
$("modeBelow2").addEventListener("click", () => applyViewMode("below"));

$("backToModel").addEventListener("click", () => {
  applyViewMode("full");
  viewer.updateSection();
});

function updateMetrics() {
  if (!viewer || !$("metricBox")) return;
  requestAnimationFrame(() => {
    const text = $("metricBox");
    if (!viewer.lines2d.length) {
      text.innerHTML = `<div class="metric"><b>--</b><span>截面寬</span></div><div class="metric"><b>--</b><span>截面高</span></div>`;
      return;
    }
    // reused from last draw via export bounds
    const svgHint = viewer.exportSvg();
    const m = svgHint.match(/寬 ([0-9.]+) mm × 高 ([0-9.]+) mm/);
    if (m) {
      text.innerHTML = `<div class="metric"><b>${m[1]} mm</b><span>截面寬</span></div><div class="metric"><b>${m[2]} mm</b><span>截面高</span></div>`;
    }
  });
}

if (viewer) {
  viewer.updateSection();
  updateMetrics();
  setAxis("y");
}
