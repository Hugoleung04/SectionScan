import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { planeFromAxis, intersectMesh, projectSegments, bounds2d, worldPositions, stitchLoops } from "./section.js";

export class Viewer {
  constructor(canvas3d, canvas2d) {
    this.canvas3d = canvas3d;
    this.canvas2d = canvas2d;
    this.ctx = canvas2d.getContext("2d");
    this.axis = "y";
    this.planeValue = 0;
    this.mmPerUnit = 280; // default: demo vase height 1 unit -> 280mm after fit
    this.modelHeightUnits = 1;
    this.lines2d = [];
    this.loops2d = [];
    this.open2d = [];
    this.measure = [];
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

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);
    this.planeHelper = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ color: 0x6ee0c4, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    );
    this.scene.add(this.planeHelper);
    this.sectionLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffd36e })
    );
    this.scene.add(this.sectionLines);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.loadDemo("vase");
    this.resize();
    addEventListener("resize", () => this.resize());
    canvas3d.addEventListener("pointerdown", (e) => this.on3dPointer(e));
    canvas2d.addEventListener("pointerdown", (e) => this.on2dPointer(e));
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
  }

  fitAndScale() {
    const box = new THREE.Box3().setFromObject(this.modelGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.modelGroup.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    this.modelGroup.scale.setScalar(1 / maxDim);
    this.modelHeightUnits = 1;
    this.modelGroup.updateMatrixWorld(true);
    this.camera.position.set(1.6, 1.1, 1.8);
    this.controls.target.set(0, 0, 0);
    this.updateSection();
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

  setAxis(axis) {
    this.axis = axis;
    this.updateSection();
  }

  setPlane(value) {
    this.planeValue = value;
    this.updateSection();
  }

  setHeightMm(mm) {
    const n = Number(mm);
    if (n > 0) this.mmPerUnit = n / this.modelHeightUnits;
  }

  collectPositions() {
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
    return all;
  }

  updateSection() {
    const plane = planeFromAxis(this.axis, this.planeValue);
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
    this.updateClipPlane();
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
    this.grid.visible = mode !== "shape";
    this.planeHelper.visible = mode !== "shape";
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
    const b = bounds2d(this.lines2d);
    const pad = 28 * devicePixelRatio;
    const sx = (w - pad * 2) / b.w;
    const sy = (h - pad * 2) / b.h;
    const s = Math.min(sx, sy);
    const ox = pad + (w - pad * 2 - b.w * s) / 2;
    const oy = pad + (h - pad * 2 - b.h * s) / 2;
    this._map2d = { b, s, ox, oy };

    const mapX = (x) => ox + (x - b.minX) * s;
    const mapY = (y) => oy + (b.maxY - y) * s;
    this._map2d = { b, s, ox, oy };

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

    if (this.measure.length) {
      ctx.fillStyle = "#ffd36e";
      this.measure.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 * devicePixelRatio, 0, Math.PI * 2);
        ctx.fill();
      });
      if (this.measure.length === 2) {
        ctx.strokeStyle = "#ffd36e";
        ctx.beginPath();
        ctx.moveTo(this.measure[0].x, this.measure[0].y);
        ctx.lineTo(this.measure[1].x, this.measure[1].y);
        ctx.stroke();
        const du = (this.measure[1].ux - this.measure[0].ux);
        const dv = (this.measure[1].uy - this.measure[0].uy);
        const mm = this.toMm(Math.hypot(du, dv));
        ctx.fillText(`${mm.toFixed(1)} mm`, (this.measure[0].x + this.measure[1].x) / 2, (this.measure[0].y + this.measure[1].y) / 2 - 8);
      }
    }
  }

  on2dPointer(e) {
    if (!this._map2d || !this.lines2d.length) return;
    const rect = this.canvas2d.getBoundingClientRect();
    const x = (e.clientX - rect.left) * devicePixelRatio;
    const y = (e.clientY - rect.top) * devicePixelRatio;
    const { b, s, ox, oy } = this._map2d;
    const ux = b.minX + (x - ox) / s;
    const uy = b.maxY - (y - oy) / s;
    this.measure.push({ x, y, ux, uy });
    if (this.measure.length > 2) this.measure = this.measure.slice(-1);
    this.draw2d();
  }

  on3dPointer(e) {
    if (!this.pickScale) return;
    const rect = this.canvas3d.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.modelGroup, true);
    if (!hits.length) return;
    this.scalePts.push(hits[0].point.clone());
    if (this.scalePts.length === 2) {
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
