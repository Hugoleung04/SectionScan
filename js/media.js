(function () {
  const photos = [];
  let videoCount = 0;
  const listeners = [];

  function $(id) {
    return document.getElementById(id);
  }

  function toast(msg) {
    const el = $("toast");
    if (!el) {
      console.log(msg);
      return;
    }
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.style.display = "none";
    }, 2800);
  }

  function setStatus(text) {
    const el = $("photoCount");
    if (el) el.textContent = text;
  }

  function notify() {
    listeners.forEach((fn) => {
      try { fn(photos.slice()); } catch (e) { console.error(e); }
    });
  }

  function renderThumbs() {
    const box = $("thumbs");
    if (!box) return;
    box.innerHTML = "";
    photos.forEach((f) => {
      if (f.type.startsWith("video/")) {
        const v = document.createElement("video");
        v.src = URL.createObjectURL(f);
        v.muted = true;
        v.playsInline = true;
        v.setAttribute("playsinline", "true");
        box.appendChild(v);
        return;
      }
      const img = document.createElement("img");
      img.src = URL.createObjectURL(f);
      img.alt = f.name || "photo";
      box.appendChild(img);
    });
    const parts = [];
    if (photos.length) parts.push(photos.length + " 個檔案");
    if (videoCount) parts.push(videoCount + " 段影片");
    setStatus(parts.length ? "已加入：" + parts.join("，") : "尚未加入相片或影片");
    notify();
  }

  function addFiles(fileList, label) {
    const files = Array.from(fileList || []);
    if (!files.length) {
      toast("沒有選到檔案");
      return;
    }
    toast(label + "：收到 " + files.length + " 個檔案");
    setStatus("正在加入 " + files.length + " 個檔案…");
    files.forEach((file) => {
      photos.push(file);
      if ((file.type || "").startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name || "")) {
        videoCount += 1;
      }
    });
    renderThumbs();
    const videos = files.filter((f) => (f.type || "").startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(f.name || ""));
    videos.forEach((file) => extractLater(file));
  }

  function extractLater(file) {
    setStatus("正在由影片抽格：" + (file.name || "video"));
    extractFramesFromVideo(file)
      .then((frames) => {
        if (frames.length) {
          photos.push(...frames);
          renderThumbs();
          toast((file.name || "影片") + " 抽出 " + frames.length + " 格");
        } else {
          toast((file.name || "影片") + " 已保存，但抽格失敗。仍可保留原影片");
        }
      })
      .catch((err) => {
        console.error(err);
        toast("影片抽格失敗，已先保存原影片");
        renderThumbs();
      });
  }

  function extractFramesFromVideo(file, intervalSec, maxFrames) {
    intervalSec = intervalSec || 0.45;
    maxFrames = maxFrames || 40;
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
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const frames = [];
      let settled = false;

      const done = (err) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        if (err && !frames.length) reject(err);
        else resolve(frames);
      };

      setTimeout(() => done(new Error("timeout")), 20000);

      video.onerror = () => done(new Error("video"));

      const start = async () => {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        canvas.width = Math.max(16, Math.min(960, video.videoWidth || 640));
        canvas.height = Math.max(16, Math.min(960, video.videoHeight || 360));
        try {
          await video.play();
          video.pause();
        } catch (_) {}

        const step = Math.max(intervalSec, duration / maxFrames);
        let t = 0;
        while (t < duration && frames.length < maxFrames && !settled) {
          await new Promise((ok) => {
            const finishSeek = () => {
              video.removeEventListener("seeked", finishSeek);
              try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                  if (blob) {
                    frames.push(new File([blob], "frame-" + frames.length + ".jpg", { type: "image/jpeg" }));
                  }
                  ok();
                }, "image/jpeg", 0.8);
              } catch (e) {
                ok();
              }
            };
            video.addEventListener("seeked", finishSeek);
            try {
              video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
            } catch (e) {
              setTimeout(finishSeek, 60);
            }
            setTimeout(finishSeek, 1500);
          });
          t += step;
        }
        done();
      };

      if (video.readyState >= 1) start();
      else video.addEventListener("loadedmetadata", start);
      video.load();
    });
  }

  function hook(id, handler) {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", (e) => {
      try {
        handler(e);
      } catch (err) {
        console.error(err);
        toast("加入檔案時發生錯誤");
      }
    });
  }

  function openPicker(id) {
    const el = $(id);
    if (!el) return;
    el.value = "";
    el.click();
  }

  function bind() {
    const pairs = [
      ["photoBtn", "photoInput"],
      ["videoBtn", "videoInput"],
      ["cameraPhotoBtn", "cameraPhotoInput"],
      ["cameraVideoBtn", "cameraVideoInput"],
      ["glbBtn", "glbInput"]
    ];
    pairs.forEach(([btnId, inputId]) => {
      const btn = $(btnId);
      if (btn) btn.addEventListener("click", () => openPicker(inputId));
    });
    hook("photoInput", (e) => {
      addFiles(e.target.files, "上傳相片");
      e.target.value = "";
    });
    hook("cameraPhotoInput", (e) => {
      addFiles(e.target.files, "拍攝相片");
      e.target.value = "";
    });
    hook("videoInput", (e) => {
      addFiles(e.target.files, "上傳影片");
      e.target.value = "";
    });
    hook("cameraVideoInput", (e) => {
      addFiles(e.target.files, "錄影");
      e.target.value = "";
    });
    const clearBtn = $("clearPhotos");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        photos.length = 0;
        videoCount = 0;
        renderThumbs();
        toast("已清空素材");
      });
    }
    renderThumbs();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  window.SectionScanMedia = {
    getPhotos: () => photos.slice(),
    onChange: (fn) => listeners.push(fn),
    toast,
    setStatus
  };
})();
