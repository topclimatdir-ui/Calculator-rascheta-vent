/* Запасной 3D-рендерер без WebGL (для окон, где WebGL отключён, например просмотрщик в приложении Claude).
   Рисует сцену three.js на обычном 2D-холсте: треугольники и линии сортируются по глубине (алгоритм художника),
   заливка с простым освещением, прозрачность и контуры поддерживаются. Интерфейс совпадает с WebGLRenderer, который нужен калькулятору. */
'use strict';

class SoftRenderer {
  constructor() {
    this.domElement = document.createElement('canvas');
    this.ctx = this.domElement.getContext('2d');
    this.w = 300; this.h = 150; this.pr = 1;
    this.light = new THREE.Vector3(0.35, 0.6, 0.75).normalize();
  }
  setPixelRatio(r) { this.pr = r || 1; }
  setSize(w, h) {
    this.w = w; this.h = h;
    this.domElement.width = Math.max(1, Math.round(w * this.pr)); this.domElement.height = Math.max(1, Math.round(h * this.pr));
    this.domElement.style.width = w + 'px'; this.domElement.style.height = h + 'px';
  }
  render(scene, camera) {
    const ctx = this.ctx, W = this.domElement.width, H = this.domElement.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const view = camera.matrixWorldInverse, proj = camera.projectionMatrix, near = camera.near;
    const mv = new THREE.Matrix4(), v4 = new THREE.Vector4(), prims = [];
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), E1 = new THREE.Vector3(), E2 = new THREE.Vector3();
    const toScreen = (p) => {   // p — точка в системе камеры
      v4.set(p.x, p.y, p.z, 1).applyMatrix4(proj);
      return [(v4.x / v4.w * 0.5 + 0.5) * W, (1 - (v4.y / v4.w * 0.5 + 0.5)) * H];
    };
    const light = this.light;
    scene.traverse(obj => {
      if (!obj.visible || !obj.geometry || !obj.geometry.attributes || !obj.geometry.attributes.position) return;
      const g = obj.geometry, pos = g.attributes.position, mat = obj.material;
      mv.multiplyMatrices(view, obj.matrixWorld);
      const col = mat && mat.color ? mat.color : { r: 0.5, g: 0.5, b: 0.5 };
      const verts = [], n = pos.count;
      for (let i = 0; i < n; i++) verts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mv));
      if (obj.isMesh) {
        const idx = g.index ? g.index.array : null, count = idx ? idx.length : n;
        const alpha = mat.transparent ? (mat.opacity === undefined ? 1 : mat.opacity) : 1, basic = mat.type === 'MeshBasicMaterial';
        for (let i = 0; i < count; i += 3) {
          const a = verts[idx ? idx[i] : i], b = verts[idx ? idx[i + 1] : i + 1], c = verts[idx ? idx[i + 2] : i + 2];
          if (a.z > -near || b.z > -near || c.z > -near) continue;
          let shade = 1;
          if (!basic) {
            E1.subVectors(b, a); E2.subVectors(c, a); C.crossVectors(E1, E2).normalize();
            shade = 0.5 + 0.5 * Math.abs(C.dot(light));
          }
          const pa = toScreen(a), pb = toScreen(b), pc = toScreen(c);
          prims.push({ t: 0, d: -(a.z + b.z + c.z) / 3, p: [pa[0], pa[1], pb[0], pb[1], pc[0], pc[1]],
            c: `rgb(${Math.round(col.r * 255 * shade)},${Math.round(col.g * 255 * shade)},${Math.round(col.b * 255 * shade)})`, a: alpha });
        }
      } else if (obj.isLine) {
        const idx = g.index ? g.index.array : null, color = `rgb(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)})`;
        const get = k => verts[idx ? idx[k] : k], count = idx ? idx.length : n;
        const seg = (a, b) => {
          if (a.z > -near || b.z > -near) return;
          const pa = toScreen(a), pb = toScreen(b);
          prims.push({ t: 1, d: -(a.z + b.z) / 2 * 0.994, p: [pa[0], pa[1], pb[0], pb[1]], c: color, a: 1 });
        };
        if (obj.isLineSegments) { for (let i = 0; i + 1 < count; i += 2) seg(get(i), get(i + 1)); }
        else { for (let i = 0; i + 1 < count; i++) seg(get(i), get(i + 1)); if (obj.isLineLoop && count > 2) seg(get(count - 1), get(0)); }
      }
    });
    prims.sort((x, y) => y.d - x.d);   // дальние первыми
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const sc = this.pr;
    for (const q of prims) {
      ctx.globalAlpha = q.a;
      if (q.t === 0) {
        // каждый треугольник чуть расширяем от центра, чтобы между соседними не оставалось просветов
        const cx = (q.p[0] + q.p[2] + q.p[4]) / 3, cy = (q.p[1] + q.p[3] + q.p[5]) / 3, e = q.a >= 1 ? 0.4 * sc : 0, P = q.p, X = new Array(6);
        for (let k = 0; k < 6; k += 2) { const dx = P[k] - cx, dy = P[k + 1] - cy, l = Math.hypot(dx, dy) || 1; X[k] = P[k] + dx / l * e; X[k + 1] = P[k + 1] + dy / l * e; }
        ctx.fillStyle = q.c;
        ctx.strokeStyle = q.c; ctx.lineWidth = 1.2 * sc;
        ctx.beginPath(); ctx.moveTo(X[0], X[1]); ctx.lineTo(X[2], X[3]); ctx.lineTo(X[4], X[5]); ctx.closePath(); ctx.fill(); if (q.a >= 1) ctx.stroke();
      } else {
        ctx.strokeStyle = q.c; ctx.lineWidth = 1.1 * sc;
        ctx.beginPath(); ctx.moveTo(q.p[0], q.p[1]); ctx.lineTo(q.p[2], q.p[3]); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
