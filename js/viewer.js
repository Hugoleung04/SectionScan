import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { planeFromAxis, intersectMesh, projectSegments, bounds2d, worldPositions, stitchLoops } from "./section.js";

export class Viewer {
  constructor(canvas3d, canvas2d, showPlaneHelper = true, showGrid = false) {
    this.canvas3d = canvas3d;
    this.canvas2d = canvas2d;
    this.ctx = canvas2d.getContext("2d");
    this.axis = "y";
    this.planeValue = 0;
    this.showPlaneHelper = showPlaneHelper !== false;
    this.showGrid = showGrid === true;
    this.mmPerUnit = 280; // default: demo vase height 1 unit -> 280mm after fit
    this.modelHeightUnits = 1;
    this.lines2d = [];
    this.loops2d = [];
    this.open2d = [];
    this.measure = [];
    this.view2dZoom = 1;
    this.view2dPanX = 0;
    this.view2dPanY = 0;
    this._2dPointers = new Map();
    this._2dMode = null;
    this.pickScale = false;
    this.scalePts = [];
    this.savedSections = [];
    this.activeSectionId = null;
    this.shapeOnly = false;
    this.viewMode = "full"; // full | shape | below
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141821);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
    this.camera.position.set(1.6, 1.1, 1.8);
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    this.controls = new OrbitControls(this.camera, canvas3d);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(2, 3, 2);
    this.scene.add(dir);
    this.grid = new THREE.GridHelper(3, 12, 0x2a3344, 0x222a38);
    this.scene.add(this.grid);
    this.grid.visible = this.showGrid;

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);
    this.planeHelper = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({
        color: 0x6ee0c4,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    this.scene.add(this.planeHelper);
    this.applyPlaneVisibility();
    this.sectionLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffd36e })
    );
    this.scene.add(this.sectionLines);
    this.scaleMarks = new THREE.Group();
    this.scene.add(this.scaleMarks);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.loadDemo("vase");
    this.resize();
    addEventListener("resize", () => this.resize());
    canvas3d.addEventListener("pointerdown", (e) => this.on3dPointerDown(e));
    canvas3d.addEventListener("pointerup", (e) => this.on3dPointerUp(e));
    canvas2d.style.touchAction = "none";
    canvas2d.addEventListener("pointerdown", (e) => this.on2dPointerDown(e));
    canvas2d.addEventListener("pointermove", (e) => this.on2dPointerMove(e));
    canvas2d.addEventListener("pointerup", (e) => this.on2dPointerUp(e));
    canvas2d.addEventListener("pointercancel", (e) => this.on2dPointerUp(e));
    canvas2d.addEventListener("wheel", (e) => this.on2dWheel(e), { passive: false });
    this.loop();
  }

  resize() {
    const r3 = this.canvas3d.parentElement.getBoundingClientRect();
    const w = Math.max(1, r3.width);
    const h = Math.max(1, r3.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const r2 = this.canvas2d.parentElement.getBoundingClientRect();
    this.canvas2d.width = Math.max(1, r2.width) * devicePixelRatio;
    this.canvas2d.height = Math.max(1, r2.height) * devicePixelRatio;
    this.draw2d();
  }

  clearModel() {
    while (this.modelGroup.children.length) {
      const c = this.modelGroup.children.pop();
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose?.());
        }
      });
    }
    this.modelGroup.position.set(0, 0, 0);
    this.modelGroup.rotation.set(0, 0, 0);
    this.modelGroup.scale.set(1, 1, 1);
    this.modelGroup.updateMatrixWorld(true);
    this.cachedPositions = null;
  }

  vertexBox() {
    this.cachedPositions = null;
    this.modelGroup.updateMatrixWorld(true);
    const pos = this.collectPositions();
    const box = new THREE.Box3();
    if (!pos.length) return box;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    if (!Number.isFinite(minX)) return box;
    box.min.set(minX, minY, minZ);
    box.max.set(maxX, maxY, maxZ);
    return box;
  }

  fitAndScale() {
    this.cachedPositions = null;
    this.modelGroup.position.set(0, 0, 0);
    this.modelGroup.rotation.set(0, 0, 0);
    this.modelGroup.scale.set(1, 1, 1);
    this.modelGroup.updateMatrixWorld(true);
    let box = this.vertexBox();
    if (box.isEmpty()) box = new THREE.Box3().setFromObject(this.modelGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    this.modelGroup.scale.setScalar(1 / maxDim);
    this.modelGroup.position.copy(center).multiplyScalar(-1 / maxDim);
    this.modelGroup.updateMatrixWorld(true);
    box = this.vertexBox();
    if (!box.isEmpty()) {
      this.modelGroup.position.y += -0.5 - box.min.y;
      this.modelGroup.updateMatrixWorld(true);
      box = this.vertexBox();
    }
    this.modelBounds = box.clone();
    this.modelHeightUnits = Math.max(box.max.y - box.min.y, 1e-6);
    this.layoutGround(box);
    this.frameCamera(box);
    this.planeValue = (box.min.y + box.max.y) / 2;
    this.rebuildPositionCache();
    this.updateSection();
  }

  layoutGround(box) {
    const mid = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const xz = Math.max(size.x, size.z, 0.35) * 2.4;
    this.grid.scale.setScalar(xz / 3);
    this.grid.position.set(mid.x, box.min.y, mid.z);
    this.applyGridVisibility();
  }

  frameCamera(box) {
    const mid = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.55;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = (radius / Math.sin(fov * 0.5)) * 1.08;
    const dir = new THREE.Vector3(0.9, 0.55, 1.05).normalize();
    this.camera.position.copy(mid).addScaledVector(dir, dist);
    this.controls.target.copy(mid);
    this.controls.minDistance = dist * 0.25;
    this.controls.maxDistance = dist * 8;
    this.controls.update();
  }

  planeRange(axis) {
    const b = this.modelBounds;
    if (!b || b.isEmpty()) return { min: -0.5, max: 0.5 };
    const min = axis === "x" ? b.min.x : axis === "z" ? b.min.z : b.min.y;
    const max = axis === "x" ? b.max.x : axis === "z" ? b.max.z : b.max.y;
    const span = max - min;
    const pad = span > 1e-6 ? span * 0.02 : 0.01;
    return { min: min - pad, max: max + pad };
  }

  loadDemo(kind) {
    this.clearModel();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8fb4ff, roughness: 0.45, metalness: 0.05 });
    let mesh;
    if (kind === "box") {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1, 0.45), mat);
    } else if (kind === "bowl") {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        pts.push(new THREE.Vector2(0.08 + 0.42 * Math.sin(t * Math.PI), t - 0.5));
      }
      mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), mat);
    } else {
      const pts = [
        new THREE.Vector2(0.12, -0.5),
        new THREE.Vector2(0.18, -0.42),
        new THREE.Vector2(0.28, -0.1),
        new THREE.Vector2(0.22, 0.18),
        new THREE.Vector2(0.1, 0.32),
        new THREE.Vector2(0.12, 0.42),
        new THREE.Vector2(0.16, 0.5)
      ];
      mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), mat);
    }
    mesh.name = "scanMesh";
    this.modelGroup.add(mesh);
    this.enableClippingOnMaterials();
    this.fitAndScale();
    this.mmPerUnit = kind === "box" ? 400 : kind === "bowl" ? 220 : 280;
  }

  async loadGLB(file) {
    const { GLTFLoader } = await import("./vendor/GLTFLoader.js");
    const url = URL.createObjectURL(file);
    const gltf = await new GLTFLoader().loadAsync(url);
    URL.revokeObjectURL(url);
    this.clearModel();
    this.modelGroup.add(gltf.scene);
    this.enableClippingOnMaterials();
    this.fitAndScale();
    this.mmPerUnit = 1000;
  }

  async loadUSDZ(file) {
    const { USDLoader } = await import("./vendor/USDLoader.js");
    const url = URL.createObjectURL(file);
    let group;
    try {
      group = await new USDLoader().loadAsync(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    this.clearModel();
    this.modelGroup.add(group);
    let meshCount = 0;
    group.traverse((o) => {
      if (o.isMesh && o.geometry) meshCount++;
    });
    if (meshCount === 0) {
      throw new Error("這個 USDZ 沒有可顯示的網格（瀏覽器未能解出 mesh）。請改匯出 GLB，或用 Polycam／Scaniverse。");
    }
    this.enableClippingOnMaterials();
    this.fitAndScale();
    this.mmPerUnit = 1000;
  }

  async loadModel(file) {
    const name = (file.name || "").toLowerCase();
    const type = (file.type || "").toLowerCase();
    const isGlb =
      name.endsWith(".glb") ||
      name.endsWith(".gltf") ||
      type === "model/gltf-binary" ||
      type === "model/gltf+json";
    const isUsdz =
      name.endsWith(".usdz") ||
      type === "model/vnd.usdz+zip" ||
      type === "application/zip+usdz";
    if (isGlb) return this.loadGLB(file);
    if (isUsdz) return this.loadUSDZ(file);
    const hasExt = /\.[^./\\]+$/.test(name);
    if (!hasExt) {
      const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
      const isZip = header.length >= 2 && header[0] === 0x50 && header[1] === 0x4b;
      if (isZip) return this.loadUSDZ(file);
      return this.loadGLB(file);
    }
    throw new Error("unsupported model type");
  }

  setAxis(axis) {
    this.axis = axis;
    this.updateSection();
  }

  setHeightMm(mm) {
    const n = Number(mm);
    if (n > 0) this.mmPerUnit = n / this.modelHeightUnits;
  }

  collectPositions() {
    if (this.cachedPositions) return this.cachedPositions;
    return this.rebuildPositionCache();
  }

  rebuildPositionCache() {
    this.modelGroup.updateMatrixWorld(true);
    const chunks = [];
    this.modelGroup.traverse((o) => {
      if (o.isMesh && o.geometry?.attributes?.position) {
        chunks.push(worldPositions(o));
      }
    });
    let total = 0;
    chunks.forEach((c) => (total += c.length));
    const all = new Float32Array(total);
    let offset = 0;
    chunks.forEach((c) => {
      all.set(c, offset);
      offset += c.length;
    });
    this.cachedPositions = all;
    return all;
  }

  applyPlaneVisibility() {
    this.planeHelper.visible = this.showPlaneHelper && this.viewMode !== "shape";
  }

  applyGridVisibility() {
    this.grid.visible = this.showGrid && this.viewMode !== "shape";
  }

  setShowPlaneHelper(on) {
    this.showPlaneHelper = !!on;
    this.applyPlaneVisibility();
  }

  setShowGrid(on) {
    this.showGrid = !!on;
    this.applyGridVisibility();
  }

  updatePlaneHelper() {
    this.planeHelper.position.set(0, 0, 0);
    this.planeHelper.rotation.set(0, 0, 0);
    if (this.axis === "x") {
      this.planeHelper.rotation.y = Math.PI / 2;
      this.planeHelper.position.x = this.planeValue;
    } else if (this.axis === "z") {
      this.planeHelper.rotation.x = Math.PI / 2;
      this.planeHelper.position.z = this.planeValue;
    } else {
      this.planeHelper.rotation.x = Math.PI / 2;
      this.planeHelper.position.y = this.planeValue;
    }
  }

  setPlane(value, live) {
    this.planeValue = value;
    this.updatePlaneHelper();
    if (live) {
      this.sectionLines.visible = false;
      return;
    }
    this.sectionLines.visible = true;
    this.updateClipPlane();
    this.updateSection();
  }

  updateSection() {
    this.updatePlaneHelper();
    this.updateClipPlane();
    const plane = planeFromAxis(this.axis, this.planeValue);
    const positions = this.collectPositions();
    const segs = intersectMesh(positions, plane);
    const arr = new Float32Array(segs.length * 6);
    segs.forEach((s, i) => {
      arr.set(s[0], i * 6);
      arr.set(s[1], i * 6 + 3);
    });
    this.sectionLines.geometry.dispose();
    this.sectionLines.geometry = new THREE.BufferGeometry();
    this.sectionLines.geometry.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    this.lines2d = projectSegments(segs, plane);
    const stitched = stitchLoops(this.lines2d);
    this.loops2d = stitched.loops;
    this.open2d = stitched.open;
    this.resetView2d();
    this.draw2d();
  }

  selectCurrentSection() {
    if (!this.lines2d.length) return null;
    const id = Date.now();
    const item = {
      id,
      axis: this.axis,
      value: this.planeValue,
      lines: this.lines2d,
      loops: this.loops2d,
      open: this.open2d
    };
    this.savedSections.unshift(item);
    this.activeSectionId = id;
    return item;
  }

  showSavedSection(id) {
    const item = this.savedSections.find((s) => s.id === id);
    if (!item) return;
    this.activeSectionId = id;
    this.axis = item.axis;
    this.planeValue = item.value;
    this.lines2d = item.lines;
    this.loops2d = item.loops;
    this.open2d = item.open;
    this.updateSection();
    this.setViewMode(this.viewMode === "full" ? "shape" : this.viewMode);
  }

  enableClippingOnMaterials() {
    this.modelGroup.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m) return;
        m.clippingPlanes = [this.clipPlane];
        m.clipShadows = true;
        m.needsUpdate = true;
      });
    });
  }

  updateClipPlane() {
    if (this.axis === "x") this.clipPlane.set(new THREE.Vector3(-1, 0, 0), this.planeValue);
    else if (this.axis === "z") this.clipPlane.set(new THREE.Vector3(0, 0, -1), this.planeValue);
    else this.clipPlane.set(new THREE.Vector3(0, -1, 0), this.planeValue);
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.shapeOnly = mode === "shape";
    const clipOn = mode === "below";
    this.modelGroup.visible = mode !== "shape";
    this.applyGridVisibility();
    this.applyPlaneVisibility();
    this.sectionLines.visible = true;
    this.updateClipPlane();
    this.modelGroup.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m) return;
        m.clippingPlanes = clipOn ? [this.clipPlane] : [];
        m.needsUpdate = true;
      });
    });
    this.draw2d();
  }

  setShapeOnly(on) {
    this.setViewMode(on ? "shape" : "full");
  }

  toMm(units) {
    return units * this.mmPerUnit;
  }

  resetView2d() {
    this.view2dZoom = 1;
    this.view2dPanX = 0;
    this.view2dPanY = 0;
  }

  layout2d() {
    const w = this.canvas2d.width;
    const h = this.canvas2d.height;
    if (!this.lines2d.length) return null;
    const b = bounds2d(this.lines2d);
    const pad = 28 * devicePixelRatio;
    const sFit = Math.min(
      (w - pad * 2) / Math.max(b.w, 1e-6),
      (h - pad * 2) / Math.max(b.h, 1e-6)
    );
    return {
      w,
      h,
      b,
      pad,
      sFit,
      oxFit: (s) => pad + (w - pad * 2 - b.w * s) / 2,
      oyFit: (s) => pad + (h - pad * 2 - b.h * s) / 2
    };
  }

  setZoomAtClient(clientX, clientY, newZoom) {
    const layout = this.layout2d();
    newZoom = Math.min(16, Math.max(0.4, newZoom));
    if (!layout) {
      this.view2dZoom = newZoom;
      return;
    }
    const rect = this.canvas2d.getBoundingClientRect();
    const dpr = devicePixelRatio;
    const mx = (clientX - rect.left) * dpr;
    const my = (clientY - rect.top) * dpr;
    const s0 = Math.max(layout.sFit * this.view2dZoom, 1e-6);
    const s1 = layout.sFit * newZoom;
    const ox0 = layout.oxFit(s0) + this.view2dPanX;
    const oy0 = layout.oyFit(s0) + this.view2dPanY;
    this.view2dZoom = newZoom;
    this.view2dPanX = mx - layout.oxFit(s1) - (s1 / s0) * (mx - ox0);
    this.view2dPanY = my - layout.oyFit(s1) - (s1 / s0) * (my - oy0);
  }

  draw2d() {
    const ctx = this.ctx;
    const w = this.canvas2d.width;
    const h = this.canvas2d.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#141821";
    ctx.fillRect(0, 0, w, h);
    if (!this.lines2d.length) {
      ctx.fillStyle = "#9aa6b8";
      ctx.font = `${14 * devicePixelRatio}px sans-serif`;
      ctx.fillText("此位置沒有截面。移動切面再試。", 24, 40);
      return;
    }
    const layout = this.layout2d();
    const b = layout.b;
    const s = layout.sFit * this.view2dZoom;
    const ox = layout.oxFit(s) + this.view2dPanX;
    const oy = layout.oyFit(s) + this.view2dPanY;
    this._map2d = { b, s, ox, oy };

    const mapX = (x) => ox + (x - b.minX) * s;
    const mapY = (y) => oy + (b.maxY - y) * s;

    ctx.fillStyle = this.shapeOnly ? "rgba(110,224,196,0.28)" : "rgba(110,224,196,0.16)";
    ctx.strokeStyle = "#6ee0c4";
    ctx.lineWidth = 3 * devicePixelRatio;
    ctx.lineJoin = "round";
    const paths = this.loops2d.length ? this.loops2d : this.open2d;
    if (this.loops2d.length) {
      ctx.beginPath();
      this.loops2d.forEach((loop) => {
        loop.forEach((p, i) => {
          if (i === 0) ctx.moveTo(mapX(p[0]), mapY(p[1]));
          else ctx.lineTo(mapX(p[0]), mapY(p[1]));
        });
        ctx.closePath();
      });
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      paths.forEach((poly) => {
        poly.forEach((p, i) => {
          if (i === 0) ctx.moveTo(mapX(p[0]), mapY(p[1]));
          else ctx.lineTo(mapX(p[0]), mapY(p[1]));
        });
      });
      ctx.stroke();
    }

    const widthMm = this.toMm(b.w);
    const heightMm = this.toMm(b.h);
    ctx.fillStyle = "#f3f5f8";
    ctx.font = `${13 * devicePixelRatio}px sans-serif`;
    ctx.fillText(`截面寬 ${widthMm.toFixed(1)} mm   高 ${heightMm.toFixed(1)} mm`, 20 * devicePixelRatio, 24 * devicePixelRatio);
    ctx.fillStyle = "#9aa6b8";
    ctx.font = `${11 * devicePixelRatio}px sans-serif`;
    ctx.fillText("拖曳移動 · 雙指放大縮小 · 輕點量距離", 20 * devicePixelRatio, 42 * devicePixelRatio);

    if (this.measure.length) {
      ctx.fillStyle = "#ffd36e";
      const pts = this.measure.map((p) => ({ x: mapX(p.ux), y: mapY(p.uy), ux: p.ux, uy: p.uy }));
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 * devicePixelRatio, 0, Math.PI * 2);
        ctx.fill();
      });
      if (pts.length === 2) {
        ctx.strokeStyle = "#ffd36e";
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
        const mm = this.toMm(Math.hypot(pts[1].ux - pts[0].ux, pts[1].uy - pts[0].uy));
        ctx.fillText(`${mm.toFixed(1)} mm`, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2 - 8 * devicePixelRatio);
      }
    }
  }

  clientTo2d(e) {
    const rect = this.canvas2d.getBoundingClientRect();
    const x = (e.clientX - rect.left) * devicePixelRatio;
    const y = (e.clientY - rect.top) * devicePixelRatio;
    const { b, s, ox, oy } = this._map2d;
    return {
      x,
      y,
      ux: b.minX + (x - ox) / s,
      uy: b.maxY - (y - oy) / s
    };
  }

  addMeasureAt(e) {
    if (!this._map2d || !this.lines2d.length) return;
    const p = this.clientTo2d(e);
    this.measure.push({ ux: p.ux, uy: p.uy });
    if (this.measure.length > 2) this.measure = this.measure.slice(-1);
    this.draw2d();
  }

  on2dPointerDown(e) {
    if (!this.lines2d.length) return;
    e.preventDefault();
    try { this.canvas2d.setPointerCapture(e.pointerId); } catch (_) {}
    this._2dPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._2dPointers.size === 1) {
      this._2dMode = "maybe";
      this._2dStart = {
        x: e.clientX,
        y: e.clientY,
        panX: this.view2dPanX,
        panY: this.view2dPanY
      };
    } else if (this._2dPointers.size >= 2) {
      this._2dMode = "pinch";
      const pts = [...this._2dPointers.values()];
      this._2dPinch = {
        dist: Math.max(Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), 1),
        zoom: this.view2dZoom,
        mx: (pts[0].x + pts[1].x) / 2,
        my: (pts[0].y + pts[1].y) / 2
      };
    }
  }

  on2dPointerMove(e) {
    if (!this._2dPointers.has(e.pointerId)) return;
    this._2dPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._2dMode === "pinch" && this._2dPointers.size >= 2) {
      const pts = [...this._2dPointers.values()];
      const dist = Math.max(Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), 1);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      this.setZoomAtClient(midX, midY, this._2dPinch.zoom * (dist / this._2dPinch.dist));
      this.draw2d();
      return;
    }
    if (this._2dMode === "maybe" || this._2dMode === "pan") {
      const dx = e.clientX - this._2dStart.x;
      const dy = e.clientY - this._2dStart.y;
      if (this._2dMode === "maybe" && dx * dx + dy * dy > 36) this._2dMode = "pan";
      if (this._2dMode === "pan") {
        this.view2dPanX = this._2dStart.panX + dx * devicePixelRatio;
        this.view2dPanY = this._2dStart.panY + dy * devicePixelRatio;
        this.draw2d();
      }
    }
  }

  on2dPointerUp(e) {
    if (!this._2dPointers.has(e.pointerId)) return;
    const was = this._2dMode;
    this._2dPointers.delete(e.pointerId);
    if (was === "maybe") this.addMeasureAt(e);
    if (this._2dPointers.size >= 2) this._2dMode = "pinch";
    else if (this._2dPointers.size === 1) {
      const left = [...this._2dPointers.values()][0];
      this._2dMode = "pan";
      this._2dStart = {
        x: left.x,
        y: left.y,
        panX: this.view2dPanX,
        panY: this.view2dPanY
      };
    } else {
      this._2dMode = null;
    }
  }

  on2dWheel(e) {
    if (!this.lines2d.length) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.11;
    this.setZoomAtClient(e.clientX, e.clientY, this.view2dZoom * factor);
    this.draw2d();
  }

  clearScaleMarks() {
    while (this.scaleMarks && this.scaleMarks.children.length) {
      const c = this.scaleMarks.children.pop();
      c.geometry?.dispose();
      c.material?.dispose();
    }
  }

  addScaleMark(point) {
    const r = Math.max((this.modelHeightUnits || 1) * 0.018, 0.01);
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd36e, depthTest: false })
    );
    m.position.copy(point);
    m.renderOrder = 20;
    this.scaleMarks.add(m);
  }

  beginPickScale() {
    this.pickScale = true;
    this.scalePts = [];
    this.clearScaleMarks();
    this._ptr = null;
  }

  on3dPointerDown(e) {
    if (!this.pickScale) return;
    this._ptr = { x: e.clientX, y: e.clientY };
  }

  on3dPointerUp(e) {
    if (!this.pickScale || !this._ptr) return;
    const dx = e.clientX - this._ptr.x;
    const dy = e.clientY - this._ptr.y;
    this._ptr = null;
    if (dx * dx + dy * dy > 196) return;
    this.pickScaleAt(e);
  }

  pickScaleAt(e) {
    const rect = this.canvas3d.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.firstHitOnly = true;
    const meshes = [];
    const restore = [];
    this.modelGroup.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      meshes.push(o);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mat) => {
        if (!mat) return;
        restore.push([mat, mat.side]);
        mat.side = THREE.DoubleSide;
      });
    });
    let hits = [];
    try {
      hits = this.raycaster.intersectObjects(meshes, false);
    } finally {
      restore.forEach(([mat, side]) => {
        mat.side = side;
      });
    }
    if (!hits.length) {
      dispatchEvent(new CustomEvent("scalemiss"));
      return;
    }
    const pt = hits[0].point.clone();
    this.scalePts.push(pt);
    this.addScaleMark(pt);
    dispatchEvent(new CustomEvent("scalepoint", { detail: { n: this.scalePts.length } }));
    if (this.scalePts.length >= 2) {
      const d = this.scalePts[0].distanceTo(this.scalePts[1]);
      this.lastScaleUnits = d;
      this.pickScale = false;
      dispatchEvent(new CustomEvent("scalepicked", { detail: { units: d } }));
    }
  }

  exportSvg() {
    const b = bounds2d(this.lines2d);
    const scale = 4;
    const w = b.w * scale + 40;
    const h = b.h * scale + 40;
    let d = "";
    this.lines2d.forEach((l) => {
      const x1 = 20 + (l.a[0] - b.minX) * scale;
      const y1 = 20 + (b.maxY - l.a[1]) * scale;
      const x2 = 20 + (l.b[0] - b.minX) * scale;
      const y2 = 20 + (b.maxY - l.b[1]) * scale;
      d += `M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} `;
    });
    return `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">
  <rect width="100%" height="100%" fill="white"/>
  <path d="${d}" fill="none" stroke="black" stroke-width="0.8"/>
  <text x="12" y="14" font-size="10">寬 ${this.toMm(b.w).toFixed(1)} mm × 高 ${this.toMm(b.h).toFixed(1)} mm</text>
</svg>`;
  }

  loop() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.loop());
  }
}
