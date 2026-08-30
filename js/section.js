export function planeFromAxis(axis, value) {
  if (axis === "x") return { normal: [1, 0, 0], constant: -value };
  if (axis === "z") return { normal: [0, 0, 1], constant: -value };
  return { normal: [0, 1, 0], constant: -value };
}

function dist(p, plane) {
  return plane.normal[0] * p[0] + plane.normal[1] * p[1] + plane.normal[2] * p[2] + plane.constant;
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function intersectEdge(a, b, da, db) {
  const t = da / (da - db);
  return lerp(a, b, t);
}

export function intersectMesh(positions, plane) {
  const segments = [];
  for (let i = 0; i < positions.length; i += 9) {
    const a = [positions[i], positions[i + 1], positions[i + 2]];
    const b = [positions[i + 3], positions[i + 4], positions[i + 5]];
    const c = [positions[i + 6], positions[i + 7], positions[i + 8]];
    const da = dist(a, plane);
    const db = dist(b, plane);
    const dc = dist(c, plane);
    const pts = [];
    if (da * db < 0) pts.push(intersectEdge(a, b, da, db));
    if (db * dc < 0) pts.push(intersectEdge(b, c, db, dc));
    if (dc * da < 0) pts.push(intersectEdge(c, a, dc, da));
    if (pts.length === 2) segments.push(pts);
  }
  return segments;
}

function basis(plane) {
  const n = plane.normal;
  const tmp = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = [
    n[1] * tmp[2] - n[2] * tmp[1],
    n[2] * tmp[0] - n[0] * tmp[2],
    n[0] * tmp[1] - n[1] * tmp[0]
  ];
  const ul = Math.hypot(u[0], u[1], u[2]) || 1;
  u[0] /= ul; u[1] /= ul; u[2] /= ul;
  const v = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0]
  ];
  return { u, v };
}

function key(p, digits = 5) {
  return `${p[0].toFixed(digits)},${p[1].toFixed(digits)}`;
}

export function stitchLoops(lines) {
  const unused = lines.map((l) => ({ a: l.a, b: l.b }));
  const loops = [];
  const open = [];
  while (unused.length) {
    const start = unused.pop();
    const pts = [start.a, start.b];
    let changed = true;
    while (changed) {
      changed = false;
      const head = pts[0];
      const tail = pts[pts.length - 1];
      for (let i = 0; i < unused.length; i++) {
        const s = unused[i];
        if (key(s.a) === key(tail)) {
          pts.push(s.b);
          unused.splice(i, 1);
          changed = true;
          break;
        }
        if (key(s.b) === key(tail)) {
          pts.push(s.a);
          unused.splice(i, 1);
          changed = true;
          break;
        }
        if (key(s.a) === key(head)) {
          pts.unshift(s.b);
          unused.splice(i, 1);
          changed = true;
          break;
        }
        if (key(s.b) === key(head)) {
          pts.unshift(s.a);
          unused.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    const closed = pts.length > 2 && key(pts[0]) === key(pts[pts.length - 1]);
    if (closed) loops.push(pts);
    else open.push(pts);
  }
  return { loops, open };
}

export function projectSegments(segments, plane) {
  const { u, v } = basis(plane);
  return segments.map(([p, q]) => ({
    a: [p[0] * u[0] + p[1] * u[1] + p[2] * u[2], p[0] * v[0] + p[1] * v[1] + p[2] * v[2]],
    b: [q[0] * u[0] + q[1] * u[1] + q[2] * u[2], q[0] * v[0] + q[1] * v[1] + q[2] * v[2]]
  }));
}

export function bounds2d(lines) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of lines) {
    minX = Math.min(minX, l.a[0], l.b[0]);
    minY = Math.min(minY, l.a[1], l.b[1]);
    maxX = Math.max(maxX, l.a[0], l.b[0]);
    maxY = Math.max(maxY, l.a[1], l.b[1]);
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1, w: 1, h: 1 };
  return { minX, minY, maxX, maxY, w: Math.max(1e-6, maxX - minX), h: Math.max(1e-6, maxY - minY) };
}

export function worldPositions(mesh) {
  mesh.updateWorldMatrix(true, true);
  const geom = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = geom.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const vec = { x: 0, y: 0, z: 0 };
  const e = mesh.matrixWorld.elements;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const w = e[3] * x + e[7] * y + e[11] * z + e[15] || 1;
    vec.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
    vec.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
    vec.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) / w;
    out[i * 3] = vec.x;
    out[i * 3 + 1] = vec.y;
    out[i * 3 + 2] = vec.z;
  }
  return out;
}
