import { Viewer } from "./viewer.js";

const $ = (id) => document.getElementById(id);
const viewer = new Viewer($("view3d"), $("view2d"));
const photos = [];
let videoCount = 0;

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
  const parts = [];
  if (photos.length) parts.push(`${photos.length} 張相片／影片格`);
  if (videoCount) parts.push(`${videoCount} 段影片`);
  $("photoCount").textContent = parts.length ? `已準備：${parts.join("，")}` : "尚未加入相片或影片";
}

function addPhotos(list, label) {
  const files = Array.from(list || []).filter((f) => f.type.startsWith("image/") || f.name.match(/\.(jpg|jpeg|png|heic|webp)$/i));
  if (!files.length) return 0;
  photos.push(...files);
  renderThumbs();
  toast(`${label}：已加入 ${files.length} 張`);
  return files.length;
}

async function addVideos(list) {
  const files = Array.from(list || []).filter((f) => f.type.startsWith("video/") || f.name.match(/\.(mp4|mov|m4v|webm)$/i));
  if (!files.length) {
    toast("未揀到影片檔");
    return;
  }
  toast(`正在處理 ${files.length} 段影片…`);
  let total = 0;
  for (const file of files) {
    try {
      const frames = await extractFramesFromVideo(file);
      photos.push(...frames);
      videoCount += 1;
      total += frames.length;
    } catch (err) {
      console.error(err);
      toast(`${file.name} 抽格失敗`);
    }
  }
  renderThumbs();
  toast(total ? `影片處理完成，共抽出 ${total} 格` : "影片抽格失敗，試 MP4／較短影片");
}

function extractFramesFromVideo(file, intervalSec = 0.4, maxFrames = 60) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.preload = "auto";
    video.src = url;
    video.load();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const frames = [];

    const failTimer = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error("timeout"));
    }, 45000);

    const finish = (err) => {
      clearTimeout(failTimer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      if (err) reject(err);
      else resolve(frames);
    };

    video.addEventListener("error", () => finish(new Error("video")));

    const start = async () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      canvas.width = Math.min(1280, video.videoWidth || 1280);
      canvas.height = Math.min(1280, video.videoHeight || 720);
      try {
        await video.play();
        video.pause();
      } catch (_) {}
      const step = Math.max(intervalSec, duration / maxFrames);
      let t = 0;
      const grab = (time) => new Promise((ok) => {
        const done = () => {
          video.removeEventListener("seeked", done);
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              if (blob) frames.push(new File([blob], `video-frame-${Date.now()}-${frames.length}.jpg`, { type: "image/jpeg" }));
              ok();
            }, "image/jpeg", 0.82);
          } catch (e) {
            ok();
          }
        };
        video.addEventListener("seeked", done);
        try {
          video.currentTime = Math.min(time, Math.max(0, duration - 0.08));
        } catch (e) {
          setTimeout(done, 80);
        }
        setTimeout(() => {
          if (video.seeking) return;
        }, 1200);
      });
      while (t < duration && frames.length < maxFrames) {
        await grab(t);
        t += step;
      }
      finish();
    };

    if (video.readyState >= 1) start();
    else video.addEventListener("loadedmetadata", start, { once: true });
  });
}

$("photoInput").addEventListener("change", (e) => {
  addPhotos(e.target.files, "上傳相片");
  e.target.value = "";
});
$("cameraPhotoInput").addEventListener("change", (e) => {
  addPhotos(e.target.files, "拍攝相片");
  e.target.value = "";
});
$("videoInput").addEventListener("change", async (e) => {
  const files = e.target.files;
  e.target.value = "";
  await addVideos(files);
});
$("cameraVideoInput").addEventListener("change", async (e) => {
  const files = e.target.files;
  e.target.value = "";
  await addVideos(files);
});

$("clearPhotos").addEventListener("click", () => {
  photos.length = 0;
  videoCount = 0;
  renderThumbs();
  toast("已清空素材");
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
  if (photos.length < 3) {
    toast("請先上傳相片或影片。建議 20 張以上，或一段慢速繞行影片");
    return;
  }
  $("reconNote").style.display = "block";
  viewer.loadDemo("vase");
  show("panel-model");
  toast(`已接收 ${photos.length} 張素材。網頁版暫時用示範模型練習切面；精準模型請匯入 GLB`);
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
