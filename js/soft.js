/* Запасной 3D-рендерер без WebGL (для окон, где WebGL отключён, например просмотрщик в приложении Claude).
   Растеризует сцену three.js на процессоре: буфер глубины (правильные перекрытия), плавное освещение по вершинам,
   прозрачность, контурные линии с проверкой глубины и сглаживание (рисуем в 2× разрешении и уменьшаем).
   Интерфейс совпадает с тем, что калькулятор использует у WebGLRenderer. */
'use strict';

class SoftRenderer {
  constructor() {
    this.domElement = document.createElement('canvas');
    this.ctx = this.domElement.getContext('2d');
    this.off = document.createElement('canvas');
    this.w = 300; this.h = 150; this.pr = 1; this.IW = 0; this.IH = 0;
    const L = new THREE.Vector3(0.35, 0.6, 0.75).normalize(); this.L = [L.x, L.y, L.z];
  }
  setPixelRatio(r) { this.pr = r || 1; }
  setSize(w, h) {
    this.w = w; this.h = h;
    this.domElement.width = Math.max(1, Math.round(w * this.pr)); this.domElement.height = Math.max(1, Math.round(h * this.pr));
    this.domElement.style.width = w + 'px'; this.domElement.style.height = h + 'px';
  }

  render(scene, camera) {
    const ss = this.pr >= 2 ? 1 : 2;   // внутреннее разрешение не меньше 2× от экранного
    const IW = Math.max(1, Math.round(this.w * this.pr * ss)), IH = Math.max(1, Math.round(this.h * this.pr * ss));
    if (this.IW !== IW || this.IH !== IH) { this.IW = IW; this.IH = IH; this.rgba = new Uint8ClampedArray(IW * IH * 4); this.zb = new Float32Array(IW * IH); }
    const rgba = this.rgba, zb = this.zb; rgba.fill(0); zb.fill(0);
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const view = camera.matrixWorldInverse, P = camera.projectionMatrix.elements, near = camera.near, L = this.L, AMB = 0.5;
    const mvM = new THREE.Matrix4(), trans = [], lines = [];

    /* закраска треугольника: плоскости для 1/w и яркости, построчное заполнение */
    function fillTri(x0, y0, z0, s0, x1, y1, z1, s1, x2, y2, z2, s2, cr, cg, cb, alpha, depthWrite) {
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-9) return;
      const dzdx = ((z1 - z0) * (y2 - y0) - (z2 - z0) * (y1 - y0)) / area, dzdy = ((z2 - z0) * (x1 - x0) - (z1 - z0) * (x2 - x0)) / area;
      const dsdx = ((s1 - s0) * (y2 - y0) - (s2 - s0) * (y1 - y0)) / area, dsdy = ((s2 - s0) * (x1 - x0) - (s1 - s0) * (x2 - x0)) / area;
      const ymin = Math.max(0, Math.ceil(Math.min(y0, y1, y2) - 0.5)), ymax = Math.min(IH - 1, Math.floor(Math.max(y0, y1, y2) - 0.5));
      for (let y = ymin; y <= ymax; y++) {
        const yc = y + 0.5; let xl = Infinity, xr = -Infinity;
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) { const x = x0 + (yc - y0) * (x1 - x0) / (y1 - y0); if (x < xl) xl = x; if (x > xr) xr = x; }
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) { const x = x1 + (yc - y1) * (x2 - x1) / (y2 - y1); if (x < xl) xl = x; if (x > xr) xr = x; }
        if ((y2 <= yc && y0 > yc) || (y0 <= yc && y2 > yc)) { const x = x2 + (yc - y2) * (x0 - x2) / (y0 - y2); if (x < xl) xl = x; if (x > xr) xr = x; }
        if (xl > xr) continue;
        const xs = Math.max(0, Math.ceil(xl - 0.5 - 0.001)), xe = Math.min(IW - 1, Math.floor(xr - 0.5 + 0.001));
        let z = z0 + dzdx * (xs + 0.5 - x0) + dzdy * (yc - y0), s = s0 + dsdx * (xs + 0.5 - x0) + dsdy * (yc - y0), o = y * IW + xs;
        for (let x = xs; x <= xe; x++, o++, z += dzdx, s += dsdx) {
          if (z <= zb[o]) continue;
          const k = o * 4, sh = s < 0 ? 0 : s > 1 ? 1 : s, r = cr * sh, g = cg * sh, b = cb * sh;
          if (alpha >= 1) { rgba[k] = r; rgba[k + 1] = g; rgba[k + 2] = b; rgba[k + 3] = 255; }
          else {
            const da = rgba[k + 3] / 255, oa = alpha + da * (1 - alpha);
            rgba[k] = (r * alpha + rgba[k] * da * (1 - alpha)) / oa; rgba[k + 1] = (g * alpha + rgba[k + 1] * da * (1 - alpha)) / oa;
            rgba[k + 2] = (b * alpha + rgba[k + 2] * da * (1 - alpha)) / oa; rgba[k + 3] = oa * 255;
          }
          if (depthWrite) zb[o] = z;
        }
      }
    }
    /* линия толщиной в 3 пикселя внутреннего разрешения с проверкой глубины */
    function drawLine(l) {
      const dx = l[3] - l[0], dy = l[4] - l[1], n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
      if (n > 4000) return;
      for (let i = 0; i <= n; i++) {
        const t = n ? i / n : 0, px = Math.round(l[0] + dx * t), py = Math.round(l[1] + dy * t), z = l[2] + (l[5] - l[2]) * t;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const X = px + ox, Y = py + oy; if (X < 0 || Y < 0 || X >= IW || Y >= IH) continue;
          const o = Y * IW + X; if (z < zb[o] * 0.9975) continue;
          const k = o * 4; rgba[k] = l[6]; rgba[k + 1] = l[7]; rgba[k + 2] = l[8]; rgba[k + 3] = 255;
        }
      }
    }

    scene.traverse(obj => {
      if (!obj.visible || !obj.geometry || !obj.geometry.attributes || !obj.geometry.attributes.position) return;
      const g = obj.geometry, pos = g.attributes.position, nor = g.attributes.normal, mat = obj.material, n = pos.count;
      mvM.multiplyMatrices(view, obj.matrixWorld);
      const m = mvM.elements, col = mat && mat.color ? mat.color : { r: 0.5, g: 0.5, b: 0.5 };
      const sx = new Float32Array(n), sy = new Float32Array(n), sz = new Float32Array(n), ok = new Uint8Array(n);
      const smooth = !!(obj.isMesh && nor && !mat.flatShading && mat.type !== 'MeshBasicMaterial'), sv = smooth ? new Float32Array(n) : null;
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = m[2] * x + m[6] * y + m[10] * z + m[14], w = -vz;
        if (w <= near) continue;
        ok[i] = 1; sx[i] = (P[0] * vx / w * 0.5 + 0.5) * IW; sy[i] = (1 - (P[5] * vy / w * 0.5 + 0.5)) * IH; sz[i] = 1 / w;
        if (smooth) {
          const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
          const ax = m[0] * nx + m[4] * ny + m[8] * nz, ay = m[1] * nx + m[5] * ny + m[9] * nz, az = m[2] * nx + m[6] * ny + m[10] * nz, l = Math.hypot(ax, ay, az) || 1;
          sv[i] = AMB + (1 - AMB) * Math.abs((ax * L[0] + ay * L[1] + az * L[2]) / l);
        }
      }
      const idx = g.index ? g.index.array : null, count = idx ? idx.length : n;
      if (obj.isMesh) {
        const alpha = mat.transparent ? (mat.opacity === undefined ? 1 : mat.opacity) : 1, basic = mat.type === 'MeshBasicMaterial';
        const cr = col.r * 255, cg = col.g * 255, cb = col.b * 255;
        for (let i = 0; i < count; i += 3) {
          const a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, c = idx ? idx[i + 2] : i + 2;
          if (!(ok[a] && ok[b] && ok[c])) continue;
          let s0, s1, s2;
          if (basic) s0 = s1 = s2 = 1;
          else if (smooth) { s0 = sv[a]; s1 = sv[b]; s2 = sv[c]; }
          else {   // плоская закраска по нормали грани (в системе камеры)
            const px = pos.getX(a), py = pos.getY(a), pz = pos.getZ(a);
            const e1x = pos.getX(b) - px, e1y = pos.getY(b) - py, e1z = pos.getZ(b) - pz, e2x = pos.getX(c) - px, e2y = pos.getY(c) - py, e2z = pos.getZ(c) - pz;
            const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
            const ax = m[0] * nx + m[4] * ny + m[8] * nz, ay = m[1] * nx + m[5] * ny + m[9] * nz, az = m[2] * nx + m[6] * ny + m[10] * nz, l = Math.hypot(ax, ay, az) || 1;
            s0 = s1 = s2 = AMB + (1 - AMB) * Math.abs((ax * L[0] + ay * L[1] + az * L[2]) / l);
          }
          if (alpha < 1) trans.push({ d: sz[a] + sz[b] + sz[c], a: [sx[a], sy[a], sz[a], s0, sx[b], sy[b], sz[b], s1, sx[c], sy[c], sz[c], s2, cr, cg, cb, alpha] });
          else fillTri(sx[a], sy[a], sz[a], s0, sx[b], sy[b], sz[b], s1, sx[c], sy[c], sz[c], s2, cr, cg, cb, 1, true);
        }
      } else if (obj.isLine) {
        const get = k => (idx ? idx[k] : k), cr = col.r * 255, cg = col.g * 255, cb = col.b * 255;
        const seg = (p, q) => { if (ok[p] && ok[q]) lines.push([sx[p], sy[p], sz[p], sx[q], sy[q], sz[q], cr, cg, cb]); };
        if (obj.isLineSegments) { for (let i = 0; i + 1 < count; i += 2) seg(get(i), get(i + 1)); }
        else { for (let i = 0; i + 1 < count; i++) seg(get(i), get(i + 1)); if (obj.isLineLoop && count > 2) seg(get(count - 1), get(0)); }
      }
    });
    // порядок: непрозрачное (выше) → контурные линии → прозрачное от дальнего к ближнему
    for (const l of lines) drawLine(l);
    trans.sort((p, q) => p.d - q.d);
    for (const t of trans) { const a = t.a; fillTri(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13], a[14], a[15], false); }

    const oc = this.off; if (oc.width !== IW || oc.height !== IH) { oc.width = IW; oc.height = IH; }
    oc.getContext('2d').putImageData(new ImageData(rgba, IW, IH), 0, 0);
    const ctx = this.ctx, W = this.domElement.width, H = this.domElement.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(oc, 0, 0, W, H);
  }
}
