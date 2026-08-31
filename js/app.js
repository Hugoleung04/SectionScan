import { Viewer } from "./viewer.js?v=20";

const $ = (id) => document.getElementById(id);
let viewer = null;

function readShowPlane() {
  try {
    return localStorage.getItem("sectionscan.showPlane") !== "0";
  } catch {
    return true;
  }
}

try {
  viewer = new Viewer($("view3d"), $("view2d"), readShowPlane());
} catch (err) {
  console.error(err);
  if (window.SectionScanMedia) window.SectionScanMedia.toast("3D 預覽載入失敗，但上傳功能仍可用");
}
if (viewer) syncPlaneSlider();

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

$("useDemoVase").addEventListener("click", () => {
  viewer.loadDemo("vase");
  syncPlaneSlider();
  $("heightMm").value = "280";
  show("panel-model");
  toast("已載入示範花瓶（高 280 mm）");
});
$("useDemoBox").addEventListener("click", () => {
  viewer.loadDemo("box");
  syncPlaneSlider();
  $("heightMm").value = "400";
  show("panel-model");
  toast("已載入示範箱體（高 400 mm）");
});
if ($("useDemoBowl")) {
  $("useDemoBowl").addEventListener("click", () => {
    viewer.loadDemo("bowl");
    syncPlaneSlider();
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
    syncPlaneSlider();
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

$("axisX").addEventListener("click", () => setAxis("x"));
$("axisY").addEventListener("click", () => setAxis("y"));
$("axisZ").addEventListener("click", () => setAxis("z"));

function onPlaneSliderInput(e) {
  const v = Number(e.target.value);
  $("planeLabel").textContent = v.toFixed(2);
  viewer.setPlane(v, true);
}

let planeCommitTimer = 0;
function onPlaneSliderCommit(e) {
  const v = Number((e && e.target && e.target.value) || $("planeSlider").value);
  $("planeLabel").textContent = Number(v).toFixed(2);
  clearTimeout(planeCommitTimer);
  planeCommitTimer = setTimeout(() => {
    viewer.setPlane(v, false);
    updateMetrics();
  }, 50);
}

function syncPlaneSlider() {
  const slider = $("planeSlider");
  if (!slider || !viewer) return;
  const axis = viewer.axis || "y";
  const range = viewer.planeRange ? viewer.planeRange(axis) : { min: -0.5, max: 0.5 };
  const span = range.max - range.min;
  let v = Number(viewer.planeValue);
  if (!Number.isFinite(v)) v = (range.min + range.max) / 2;
  v = Math.min(range.max, Math.max(range.min, v));
  const next = slider.cloneNode(false);
  next.min = String(range.min);
  next.max = String(range.max);
  next.step = String(Math.max(span / 200, 0.001));
  next.value = String(v);
  slider.replaceWith(next);
  next.addEventListener("input", onPlaneSliderInput);
  next.addEventListener("change", onPlaneSliderCommit);
  $("planeLabel").textContent = v.toFixed(2);
  viewer.setPlane(v);
}

function setAxis(axis) {
  ["x", "y", "z"].forEach((a) => $(`axis${a.toUpperCase()}`).classList.toggle("on", a === axis));
  viewer.setAxis(axis);
  syncPlaneSlider();
}

if ($("planeSlider")) {
  $("planeSlider").addEventListener("input", onPlaneSliderInput);
  $("planeSlider").addEventListener("change", onPlaneSliderCommit);
}

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

function applyShowPlaneButton(on) {
  const btn = $("togglePlane");
  if (btn) btn.classList.toggle("on", on);
}

function setShowPlane(on) {
  try {
    localStorage.setItem("sectionscan.showPlane", on ? "1" : "0");
  } catch (_) {}
  if (viewer) viewer.setShowPlaneHelper(on);
  applyShowPlaneButton(on);
}

applyShowPlaneButton(readShowPlane());
if ($("togglePlane")) {
  $("togglePlane").addEventListener("click", () => {
    setShowPlane(!$("togglePlane").classList.contains("on"));
  });
}

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
