import { Viewer } from "./viewer.js";

const $ = (id) => document.getElementById(id);
const viewer = new Viewer($("view3d"), $("view2d"));
const photos = [];

function show(id) {
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelector(`.tab[data-panel="${id}"]`).classList.add("active");
  const mode = id.replace("panel-", "");
  document.querySelector(".app").className = `app mode-${mode}`;
  requestAnimationFrame(() => viewer.resize());
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => show(btn.dataset.panel));
});

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 2200);
}

function renderThumbs() {
  $("thumbs").innerHTML = "";
  photos.forEach((f) => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(f);
    $("thumbs").appendChild(img);
  });
  $("photoCount").textContent = `${photos.length} 張相片`;
}

$("photoInput").addEventListener("change", (e) => {
  photos.push(...Array.from(e.target.files || []));
  renderThumbs();
  toast("已加入拍攝相片");
});

$("clearPhotos").addEventListener("click", () => {
  photos.length = 0;
  renderThumbs();
});

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
$("useDemoBowl").addEventListener("click", () => {
  viewer.loadDemo("bowl");
  $("heightMm").value = "220";
  show("panel-model");
  toast("已載入示範碗（高 220 mm）");
});

$("glbInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    await viewer.loadGLB(file);
    $("heightMm").value = "1000";
    show("panel-model");
    toast("已匯入 GLB，請先定標真實高度");
  } catch (err) {
    toast("匯入失敗，請用 GLB 檔");
    console.error(err);
  }
});

$("buildFromPhotos").addEventListener("click", () => {
  if (photos.length < 8) {
    toast("建議至少 8 張、最好 30 張以上重疊相片");
    return;
  }
  $("reconNote").style.display = "block";
  viewer.loadDemo("vase");
  show("panel-model");
  toast("此網頁版先用示範模型。完整重建請用 iOS 專案或匯入 GLB");
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

function updateMetrics() {
  const b = viewer.lines2d?.length ? undefined : null;
  // metrics updated in draw2d; also fill cards
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

viewer.updateSection();
updateMetrics();
setAxis("y");
