/* Каталог изделий: поля формы, расчёт (площадь, вес, развёртка) и 3D-модель.
   Все размеры — в миллиметрах, площадь — в м², вес — в кг. */
'use strict';

const PI = Math.PI;
const SET = { density: 7850, meshW: 1.0, woolD: 80, t: 0.5, zig: 50, zigH: 5, sw20: 88, sw30: 108, stripT: 0.5, cornerP: 0 };   // обновляется из app.js

/* ---------- сечения ---------- */
const shapeOf = (p, sfx = '', key = 'shape') =>
  p[key] === 'round' ? { t: 'round', d: p['D' + sfx] } : { t: 'rect', a: p['A' + sfx], b: p['B' + sfx] };
const perim = s => (s.t === 'round' ? PI * s.d : 2 * (s.a + s.b));
const areaCS = s => (s.t === 'round' ? PI * s.d * s.d / 4 : s.a * s.b);
const dimStr = s => (s.t === 'round' ? 'Ø' + s.d : s.a + '×' + s.b);
const n1 = x => (Math.round(x * 10) / 10).toString();
const m2 = mm2 => mm2 / 1e6;
const wt = (a, t) => a * t / 1000 * SET.density;

/* ---------- геометрия ---------- */
const K = 24, N = 4 * K;   // N точек на контуре; углы прямоугольника — на индексах, кратных K

function profilePts(sh, z, ox = 0, oy = 0) {
  const pts = [];
  for (let i = 0; i < N; i++) {
    const j = Math.floor(i / K), u = (i % K) / K;
    let x, y;
    if (sh.t === 'round') {
      const ang = -PI / 4 + PI / 2 * (j + u);
      x = sh.d / 2 * Math.cos(ang); y = sh.d / 2 * Math.sin(ang);
    } else {
      const a = sh.a / 2, b = sh.b / 2;
      if (j === 0) { x = a; y = -b + 2 * b * u; }
      else if (j === 1) { x = a - 2 * a * u; y = b; }
      else if (j === 2) { x = -a; y = b - 2 * b * u; }
      else { x = -a + 2 * a * u; y = -b; }
    }
    pts.push(new THREE.Vector3(ox + x, oy + y, z));
  }
  return pts;
}

function ringsGeom(rings) {
  const pos = [], idx = [];
  rings.forEach(r => r.forEach(v => pos.push(v.x, v.y, v.z)));
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, a = r * N + i, b = r * N + j, c = (r + 1) * N + i, d = (r + 1) * N + j;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const loft = (sA, zA, sB, zB, ox = 0, oy = 0) => ringsGeom([profilePts(sA, zA), profilePts(sB, zB, ox, oy)]);
const tube = (sh, z0, z1) => loft(sh, z0, sh, z1);

function capGeom(pts) {      // заливка контура веером
  const c = new THREE.Vector3(); pts.forEach(v => c.add(v)); c.multiplyScalar(1 / pts.length);
  const pos = [c.x, c.y, c.z]; pts.forEach(v => pos.push(v.x, v.y, v.z));
  const idx = []; for (let i = 0; i < pts.length; i++) idx.push(0, 1 + i, 1 + (i + 1) % pts.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function geomArea(g) {
  const p = g.attributes.position, ix = g.index.array, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let s = 0;
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(p, ix[i]); b.fromBufferAttribute(p, ix[i + 1]); c.fromBufferAttribute(p, ix[i + 2]);
    s += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return s;   // мм²
}

function sweepRingsAt(sh, R, angs, e = 0) {   // колено: ось начинается вдоль +Z, изгиб в сторону +X
  const base = profilePts(sh, 0), rings = angs.map(f => {
    const cx = R * (1 - Math.cos(f)), cz = R * Math.sin(f);
    return base.map(v => new THREE.Vector3(cx + v.x * Math.cos(f), v.y, cz - v.x * Math.sin(f)));
  });
  if (e > 0) {
    const f = angs[angs.length - 1], t = new THREE.Vector3(Math.sin(f), 0, Math.cos(f)).multiplyScalar(e);
    rings.unshift(base.map(v => v.clone().add(new THREE.Vector3(0, 0, -e))));
    rings.push(rings[rings.length - 1].map(v => v.clone().add(t)));
  }
  return rings;
}

/* ---------- материалы и сборка ---------- */
const VIEW = { style: 'draw' };   // 'draw' — чертёж, 'metal' — металл
const COL = { steel: 0x9db3c8, dark: 0x4a5668, wool: 0xe0b84a, edge: 0x1f3345, mesh: 0x2d3b4a };
function mat(color, opts = {}) {
  const draw = VIEW.style === 'draw';
  if (draw && color === COL.steel) color = 0xf4f6f9;
  return new THREE.MeshStandardMaterial(Object.assign({ color, metalness: draw ? 0 : 0.35, roughness: draw ? 1 : 0.45, side: THREE.DoubleSide }, opts));
}
function put(grp, geom, o = {}) {
  const flat = o.flat !== undefined ? o.flat : false;
  const opacity = o.opacity !== undefined ? o.opacity : 1;
  const m = new THREE.Mesh(geom, mat(o.color || COL.steel, { flatShading: flat, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
  grp.add(m);
  if (o.edges !== false && opacity >= 0.9) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 30), new THREE.LineBasicMaterial({ color: VIEW.style === 'draw' ? 0x111111 : COL.edge }));
    grp.add(e);
  }
  return m;
}
const isFlat = (...sh) => sh.some(s => s.t === 'rect');
function rod(p1, p2, r, color = COL.dark) {
  const d = new THREE.Vector3().subVectors(p2, p1), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat(color));
  m.position.copy(p1).add(p2).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
function gridLines(sh, zf, step) {   // проволочная сетка в плоскости сечения
  const pos = [], P = (x, y) => pos.push(x, y, zf(x, y));
  if (sh.t === 'round') {
    const r = sh.d / 2;
    for (let x = -r + step; x < r - 1; x += step) { const h = Math.sqrt(r * r - x * x); P(x, -h); P(x, h); P(-h, x); P(h, x); }
  } else {
    const a = sh.a / 2, b = sh.b / 2;
    for (let x = -a + step; x < a - 1; x += step) { P(x, -b); P(x, b); }
    for (let y = -b + step; y < b - 1; y += step) { P(-a, y); P(a, y); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COL.mesh }));
}
const ringPts = (r, z, n = 64) => Array.from({ length: n }, (_, i) => new THREE.Vector3(r * Math.cos(2 * PI * i / n), r * Math.sin(2 * PI * i / n), z));
function cone(grp, r1, z1, r2, z2, o) {   // усечённый конус вдоль Z
  const g = loft({ t: 'round', d: 2 * r1 }, z1, { t: 'round', d: 2 * Math.max(r2, 0.01) }, z2);
  return put(grp, g, o);
}
function conicDev(D1, D2, L) {
  const r1 = Math.max(D1, D2) / 2, r2 = Math.min(D1, D2) / 2, s = Math.sqrt(L * L + (r1 - r2) * (r1 - r2));
  if (r1 - r2 < 0.01) return `Цилиндр: заготовка ${n1(PI * D1)} × ${n1(L)} мм`;
  const Rb = s * r1 / (r1 - r2);
  return `Развёртка-сектор: R=${n1(Rb)} мм, r=${n1(Rb - s)} мм, угол ${n1(360 * (r1 - r2) / s)}°`;
}

/* зиг (ребро жёсткости) по окружности на круглых деталях, SET.zig мм от края */
function zig(g, r, z, ox = 0, oy = 0) {
  if (!(SET.zig > 0)) return;
  const m = new THREE.Mesh(new THREE.TorusGeometry(r + SET.zigH * 0.3, SET.zigH * 0.6, 8, 96), mat(VIEW.style === "draw" ? 0xe3e8ee : 0x7a94ae));
  m.position.set(ox, oy, z); g.add(m);
}
function zigs(g, sh, z0, z1, ox = 0, oy = 0) {   // зиги на расстоянии SET.zig от обоих краёв участка
  if (sh.t !== 'round' || !(SET.zig > 0) || z1 - z0 < 2 * SET.zig) return;
  zig(g, sh.d / 2, z0 + SET.zig, ox, oy); zig(g, sh.d / 2, z1 - SET.zig, ox, oy);
}

/* ---------- описания полей ---------- */
const SH = [['round', 'Круглое'], ['rect', 'Прямоугольное']];
const selF = (k, l, sel, v) => ({ k, l, sel, v });
const numF = (k, l, v, min = 1, show) => ({ k, l, v, min, show });
function dims(sfx, lbl, key, dD, dA, dB) {
  return [
    numF('D' + sfx, `Диаметр ${lbl}, мм`, dD, 20, p => p[key] === 'round'),
    numF('A' + sfx, `Ширина A${lbl ? ' ' + lbl : ''}, мм`, dA, 20, p => p[key] === 'rect'),
    numF('B' + sfx, `Высота B${lbl ? ' ' + lbl : ''}, мм`, dB, 20, p => p[key] === 'rect'),
  ];
}
const TYPES = [];
const def = o => TYPES.push(o);
const res = (area, weight, dev, extra = {}) => Object.assign({ area, weight, dev }, extra);

/* 1. Прямой воздуховод */
def({
  id: 'duct', name: 'Прямой воздуховод', hidden: true,
  fields: [selF('shape', 'Сечение', SH, 'round'), ...dims('', '', 'shape', 315, 500, 300), numF('L', 'Длина L, мм', 1250)],
  label: p => `Воздуховод ${p.shape === 'round' ? 'круглый' : 'прямоугольный'} ${dimStr(shapeOf(p))}, L=${p.L}`,
  calc(p) {
    const s = shapeOf(p), P = perim(s), a = m2(P * p.L);
    return res(a, wt(a, p.t), [`Заготовка: ${n1(P)} × ${n1(p.L)} мм (${s.t === 'round' ? 'π·D' : '2·(A+B)'} × L)`]);
  },
  build(p) { const g = new THREE.Group(), s = shapeOf(p); put(g, tube(s, -p.L / 2, p.L / 2), { flat: isFlat(s) }); return g; },
});

/* 1а. Короб, труба прямошовная, труба СНВ */
const ductCalc = function (p) {
  const s = shapeOf(p), P = perim(s), a = m2(P * p.L);
  return res(a, wt(a, p.t), [`Заготовка: ${n1(P)} × ${n1(p.L)} мм (${s.t === 'round' ? 'π·D' : '2·(A+B)'} × L)`]);
};
const ductBuild = function (p) { const g = new THREE.Group(), s = shapeOf(p); put(g, tube(s, -p.L / 2, p.L / 2), { flat: isFlat(s) }); zigs(g, s, -p.L / 2, p.L / 2); return g; };
def({
  id: 'box', name: 'Короб прямоугольный', fixed: { shape: 'rect' },
  fields: [numF('A', 'Ширина A, мм', 500, 20), numF('B', 'Высота B, мм', 300, 20), numF('L', 'Длина L, мм', 1250)],
  label: p => `Короб прямоугольный ${p.A}×${p.B}, L=${p.L}`, calc: ductCalc, build: ductBuild,
});
def({
  id: 'pipe', name: 'Труба прямошовная', fixed: { shape: 'round' },
  fields: [numF('D', 'Диаметр D, мм', 315, 20), numF('L', 'Длина L, мм', 1250)],
  label: p => `Труба прямошовная Ø${p.D}, L=${p.L}`, calc: ductCalc, build: ductBuild,
});
def({
  id: 'snv', name: 'Труба СНВ (спирально-навивная)', fixed: { shape: 'round' }, perMp: true,
  fields: [numF('D', 'Диаметр D, мм', 315, 20), numF('L', 'Длина L, мм', 3000)],
  label: p => `Труба СНВ Ø${p.D}, L=${p.L}`,
  calc(p) { const r = ductCalc.call(this, p); r.dev.unshift('Спирально-навивная, цена за 1 м.п.'); return r; },
  build(p) {
    const g = ductBuild(p), r = p.D / 2 + 0.6, pitch = Math.max(40, p.D * 0.35), turns = p.L / pitch, n = Math.ceil(turns * 48), pts = [];
    for (let i = 0; i <= n; i++) { const u = i / n, a = 2 * PI * turns * u; pts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), -p.L / 2 + p.L * u)); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: VIEW.style === 'draw' ? 0x111111 : 0x5b6c80 })));
    return g;
  },
});

/* 1б. Ниппель */
def({
  id: 'nipple', name: 'Ниппель', fixed: { shape: 'round' },
  fields: [numF('D', 'Диаметр D, мм', 315, 20), numF('L', 'Длина L, мм', 120)],
  label: p => `Ниппель Ø${p.D}, L=${p.L}`,
  calc(p) {
    const a = m2(PI * p.D * p.L);
    return res(a, wt(a, p.t), [`Заготовка: ${n1(PI * p.D)} × ${p.L} мм`, 'Ограничительный зиг по середине']);
  },
  build(p) {
    const g = new THREE.Group(), s = { t: 'round', d: p.D };
    put(g, tube(s, -p.L / 2, p.L / 2)); const k = SET.zig; SET.zig = 1; zig(g, p.D / 2, 0); SET.zig = k;
    return g;
  },
});

/* 2. Отвод / колено */
const elbowR = p => (p.shape === 'round' ? p.rr * p.D : (p.ri || 0) + p.A / 2);   // радиус по оси
const segN = p => (p.seg > 0 ? p.seg : p.ang <= 45 ? 3 : p.ang <= 90 ? 4 : 5);   // секций сегментного отвода: до 45° — 3, до 90° — 4
const elbowAngs = p => {
  const al = p.ang * PI / 180;
  if (p.bt === 'seg' && p.shape === 'round') {
    const k = Math.max(2, Math.round(segN(p))) - 1, a = [0];
    for (let i = 1; i <= k; i++) a.push((2 * i - 1) * al / (2 * k));
    a.push(al); return a;
  }
  const M = Math.max(8, Math.ceil(p.ang / 5)); return Array.from({ length: M + 1 }, (_, i) => al * i / M);
};
def({
  id: 'elbow', name: 'Отвод / колено',
  fields: [selF('shape', 'Сечение', SH, 'round'), ...dims('', '', 'shape', 315, 500, 300),
    numF('ang', 'Угол отвода α, °', 90, 5), numF('rr', 'Радиус по оси, × D', 1.5, 0.6, p => p.shape === 'round'),
    numF('ri', 'Внутренний радиус горловины, мм (0 = острый угол)', 0, 0, p => p.shape === 'rect'),
    numF('ends', 'Прямые участки по краям, мм', 50, 0),
    { k: 'bt', l: 'Тип (круглый)', sel: [['smooth', 'Плавный'], ['seg', 'Сегментный']], v: 'seg', show: p => p.shape === 'round' },
    numF('seg', 'Секций (0 = авто: 45° → 3, 90° → 4)', 0, 0, p => p.shape === 'round' && p.bt === 'seg')],
  label: p => `Отвод ${p.ang}° ${p.shape === 'round' ? (p.bt === 'seg' ? 'круглый сегментный' : 'круглый') : 'прямоугольный'} ${dimStr(shapeOf(p))}`,
  calc(p) {
    const s = shapeOf(p), al = p.ang * PI / 180, dim = s.t === 'round' ? s.d : s.a, R = elbowR(p);
    const a = m2((s.t === 'round' ? PI * s.d * R * al : 2 * al * R * (s.a + s.b)) + 2 * p.ends * perim(s));
    const dev = [`Радиус по оси R=${n1(R)} мм, длина дуги по оси ${n1(R * al)} мм`,
      `Внутренний радиус ${n1(R - dim / 2)} мм, наружный ${n1(R + dim / 2)} мм`];
    if (p.ends > 0) dev.push(`Прямые участки: 2 × ${p.ends} мм`);
    if (s.t === 'round' && p.bt === 'seg') dev.push(`Сегментный отвод: ${segN(p)} секции`);
    if (s.t === 'round' && R <= dim / 2) dev.push('⚠ Радиус слишком мал — увеличьте');
    return res(a, wt(a, p.t), dev);
  },
  build(p) {
    const g = new THREE.Group(), s = shapeOf(p), dim = s.t === 'round' ? s.d : s.a, angs = elbowAngs(p);
    const rings = sweepRingsAt(s, elbowR(p), angs, p.ends);
    put(g, ringsGeom(rings), { flat: isFlat(s) });
    if (s.t === 'round' && SET.zig > 0 && p.ends > 0) {
      const zz = Math.min(SET.zig, p.ends), R = elbowR(p), al = p.ang * PI / 180;
      zig(g, s.d / 2, -p.ends + zz);
      const E = new THREE.Vector3(R * (1 - Math.cos(al)), 0, R * Math.sin(al)), t = new THREE.Vector3(Math.sin(al), 0, Math.cos(al));
      const gz = new THREE.Group(); zig(gz, s.d / 2, 0); gz.rotation.y = al; gz.position.copy(E.add(t.multiplyScalar(p.ends - zz))); g.add(gz);
    }
    if (p.bt === 'seg' && s.t === 'round') {
      const o = p.ends > 0 ? 1 : 0;
      for (let i = 1 + o; i < angs.length - 1 + o; i++)
        g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rings[i]), new THREE.LineBasicMaterial({ color: VIEW.style === 'draw' ? 0x111111 : COL.edge })));
    }
    return g;
  },
});

/* 3. Переход */
const offs = p => {   // смещение оси выхода: односторонний переход совмещает верхнюю/правую стенку
  const s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2');
  const hx = s => (s.t === 'round' ? s.d : s.a) / 2, hy = s => (s.t === 'round' ? s.d : s.b) / 2;
  return { ox: p.tp === 'x' ? hx(s1) - hx(s2) : 0, oy: p.tp === 'y' ? hy(s1) - hy(s2) : 0 };
};
const transTotal = p => p.L + nipsOf(p).reduce((t, n) => t + n.len, 0);
const nipsOf = p => {   // прямые участки на концах: круглая гильза (nip) и прямоугольный под фланец (fl)
  const s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'), o = offs(p), out = [];
  const len = s => (s.t === 'round' ? p.nip : p.fl) || 0;
  if (len(s1) > 0) out.push({ s: s1, len: len(s1), z0: -len(s1), z1: 0, ox: 0, oy: 0 });
  if (len(s2) > 0) out.push({ s: s2, len: len(s2), z0: p.L, z1: p.L + len(s2), ox: o.ox, oy: o.oy });
  return out;
};
def({
  id: 'transition', name: 'Переход',
  fields: [selF('s1', 'Сечение на входе', SH, 'round'), ...dims('1', 'входа', 's1', 315, 500, 300),
    selF('s2', 'Сечение на выходе', SH, 'round'), ...dims('2', 'выхода', 's2', 200, 400, 200),
    numF('L', 'Длина L, мм', 400), selF('tp', 'Тип перехода', [['c', 'Центральный'], ['x', 'Односторонний (по ширине)'], ['y', 'Односторонний (по высоте)']], 'c'),
    { k: 'nip', l: 'Круглая врезка (гильза), мм', v: 80, min: 0, show: p => p.s1 === 'round' || p.s2 === 'round' },
    { k: 'fl', l: 'Прямой участок под фланец, мм', v: 30, min: 0, show: p => p.s1 === 'rect' || p.s2 === 'rect' }],
  label: p => `Переход ${dimStr(shapeOf(p, '1', 's1'))} → ${dimStr(shapeOf(p, '2', 's2'))}, L=${p.L}` + (nipsOf(p).length ? `, Lобщ=${transTotal(p)}` : '') + (p.tp === 'c' || !p.tp ? ', центральный' : ', односторонний') + (p.s1 === 'round' || p.s2 === 'round' ? (p.nip > 0 ? `, врезка ${p.nip}` : '') : '') + (p.s1 === 'rect' || p.s2 === 'rect' ? (p.fl > 0 ? `, фланец-участок ${p.fl}` : '') : ''),
  geom(p) { const s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'); const o = offs(p); return loft(s1, 0, s2, p.L, o.ox, o.oy); },
  calc(p) {
    const s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'), nips = nipsOf(p);
    const a = m2(geomArea(this.geom(p)) + nips.reduce((t, n) => t + perim(n.s) * n.len, 0));
    const dev = [`Периметры: вход ${n1(perim(s1))} мм, выход ${n1(perim(s2))} мм`];
    if (nips.length) dev.push(`Длина: переход ${p.L} мм + прямые участки ${nips.map(n => n.len).join(' + ')} мм = общая ${transTotal(p)} мм`);
    if (s1.t === 'round' && s2.t === 'round' && (p.tp === 'c' || !p.tp)) dev.push(conicDev(s1.d, s2.d, p.L));
    else dev.push('Площадь — по 3D-модели; развёртка — по лекалу');
    nips.forEach(n => dev.push(n.s.t === 'round' ? `Круглая врезка Ø${n1(n.s.d)} × ${n.len} мм: заготовка ${n1(perim(n.s))} × ${n.len} мм` : `Прямой участок под фланец ${n.s.a}×${n.s.b} × ${n.len} мм: заготовка ${n1(perim(n.s))} × ${n.len} мм`));
    return res(a, wt(a, p.t), dev);
  },
  build(p) {
    const g = new THREE.Group(), s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2');
    put(g, this.geom(p), { flat: isFlat(s1, s2) });
    nipsOf(p).forEach(n => { const t = new THREE.Group(); put(t, tube(n.s, n.z0, n.z1), { flat: n.s.t === 'rect' }); if (n.s.t === 'round' && n.len > SET.zig) zig(t, n.s.d / 2, n.z0 < 0 ? n.z0 + SET.zig : n.z1 - SET.zig); t.position.set(n.ox, n.oy, 0); g.add(t); });
    return g;
  },
});

/* 4. Тройник / врезка / крестовина */
def({
  id: 'tee', name: 'Тройник / врезка / крестовина',
  fields: [selF('kind', 'Вид', [['tee', 'Тройник'], ['cross', 'Крестовина'], ['saddle', 'Врезка (седло)']], 'tee'),
    selF('s1', 'Сечение магистрали', SH, 'round'),
    ...dims('1', 'магистрали', 's1', 315, 500, 300), numF('L', 'Длина магистрали L, мм', 600),
    selF('s2', 'Сечение ответвления', SH, 'round'),
    ...dims('2', 'ответвления', 's2', 200, 300, 200), numF('Lb', 'Длина ответвления от стенки, мм', 300),
    numF('ang', 'Угол ответвления, °', 90, 20)],
  label: p => `${{ tee: 'Тройник', cross: 'Крестовина', saddle: 'Врезка' }[p.kind]} ${''} ${dimStr(shapeOf(p, '1', 's1'))} / ответвление ${dimStr(shapeOf(p, '2', 's2'))}, ${p.ang}°`,
  calc(p) {
    const s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'), sin = Math.sin(p.ang * PI / 180), n = p.kind === 'cross' ? 2 : 1;
    let a, dev;
    if (p.kind === 'saddle') {
      a = m2(perim(s2) * p.Lb);
      dev = [`Ответвление: ${n1(perim(s2))} × ${n1(p.Lb)} мм`, 'Отверстие в воздуховоде и седло — по месту'];
    } else {
      const hole = areaCS(s2) / sin * n;
      a = m2(perim(s1) * p.L + perim(s2) * p.Lb * n - hole);
      dev = [`Магистраль: ${n1(perim(s1))} × ${n1(p.L)} мм`, `Ответвление: ${n1(perim(s2))} × ${n1(p.Lb)} мм` + (n > 1 ? ' (2 шт.)' : ''),
        `Отверстие(я) в магистрали: ${n1(areaCS(s2) / sin)} мм² (каждое)`];
    }
    return res(a, wt(a, p.t), dev);
  },
  build(p) {
    const g = new THREE.Group(), s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'), al = p.ang * PI / 180, sin = Math.sin(al);
    const ghost = p.kind === 'saddle';
    put(g, tube(s1, -p.L / 2, p.L / 2), { flat: isFlat(s1), opacity: ghost ? 0.22 : 1, edges: !ghost });
    if (!ghost) zigs(g, s1, -p.L / 2, p.L / 2);
    const half = (s1.t === 'round' ? s1.d : s1.a) / 2, len = p.Lb + half / sin;
    const dirs = p.kind === 'cross' ? [al, -al] : [al];
    dirs.forEach(a => {
      const b = new THREE.Group(); put(b, tube(s2, 0, len), { flat: isFlat(s2) }); if (s2.t === 'round' && p.Lb > SET.zig) zig(b, s2.d / 2, len - SET.zig); b.rotation.y = a; g.add(b);
    });
    return g;
  },
});

/* 5. Дроссель-клапан */
def({
  id: 'throttle', name: 'Дроссель-клапан',
  fields: [selF('shape', 'Сечение', SH, 'round'), ...dims('', '', 'shape', 315, 500, 300),
    numF('L', 'Длина корпуса L, мм', 150), numF('open', 'Показать угол открытия, ° (для картинки)', 35, 0)],
  label: p => `Дроссель-клапан ${p.shape === 'round' ? 'круглый' : 'прямоугольный'} ${dimStr(shapeOf(p))}, L=${p.L}`,
  calc(p) {
    const s = shapeOf(p), a = m2(perim(s) * p.L + areaCS(s)), w = wt(a, p.t) + 0.3;
    return res(a, w, [`Корпус: ${n1(perim(s))} × ${n1(p.L)} мм`, `Заслонка: ${s.t === 'round' ? 'Ø' + n1(s.d - 4) : n1(s.a - 4) + '×' + n1(s.b - 4)} мм`,
      'В вес включено 0,3 кг на ось и ручку']);
  },
  build(p) {
    const g = new THREE.Group(), s = shapeOf(p);
    put(g, tube(s, -p.L / 2, p.L / 2), { flat: isFlat(s) }); zigs(g, s, -p.L / 2, p.L / 2);
    const disc = s.t === 'round' ? new THREE.CircleGeometry(s.d / 2 - 2, 48) : new THREE.PlaneGeometry(s.a - 4, s.b - 4);
    const dm = new THREE.Mesh(disc, mat(0x6f8aa6)); dm.rotation.y = p.open * PI / 180; g.add(dm);
    const h = (s.t === 'round' ? s.d : s.b) / 2;
    g.add(rod(new THREE.Vector3(0, -h - 5, 0), new THREE.Vector3(0, h + 45, 0), 4));
    g.add(rod(new THREE.Vector3(0, h + 45, 0), new THREE.Vector3(Math.max(60, h * 0.5), h + 45, 0), 5, 0xc0392b));
    return g;
  },
});

/* 6. Грибок (флюгарка) */
def({
  id: 'mushroom', name: 'Грибок (флюгарка)', up: true,
  fields: [numF('D', 'Диаметр патрубка D, мм', 315), numF('Hs', 'Высота патрубка, мм', 100),
    numF('kd', 'Диаметр зонта, × D', 1.5, 1), numF('kh', 'Высота зонта, × D', 0.3, 0.05)],
  label: p => `Грибок (флюгарка) Ø${p.D}`,
  calc(p) {
    const Rk = p.kd * p.D / 2, hc = p.kh * p.D, sl = Math.sqrt(Rk * Rk + hc * hc);
    const a = m2(PI * p.D * p.Hs + PI * Rk * sl), ang = 360 * Rk / sl;
    return res(a, wt(a, p.t), [`Патрубок: ${n1(PI * p.D)} × ${p.Hs} мм`, `Зонт Ø${n1(2 * Rk)} мм, высота ${n1(hc)} мм`,
      `Развёртка зонта: сектор R=${n1(sl)} мм, угол ${n1(ang)}°`]);
  },
  build(p) {
    const g = new THREE.Group(), s = { t: 'round', d: p.D }, Rk = p.kd * p.D / 2, hc = p.kh * p.D, gap = 0.25 * p.D;
    put(g, tube(s, 0, p.Hs)); if (p.Hs > SET.zig) zig(g, p.D / 2, SET.zig);
    cone(g, Rk, p.Hs + gap, 0, p.Hs + gap + hc);
    for (let i = 0; i < 3; i++) {
      const a = 2 * PI * i / 3 + 0.5;
      g.add(rod(new THREE.Vector3(p.D / 2 * Math.cos(a), p.D / 2 * Math.sin(a), p.Hs),
        new THREE.Vector3(Rk * 0.7 * Math.cos(a), Rk * 0.7 * Math.sin(a), p.Hs + gap + hc * 0.3), 3));
    }
    return g;
  },
});

/* 7. Дефлектор Цаги */
def({
  id: 'tsagi', name: 'Дефлектор Цаги', up: true,
  fields: [numF('D', 'Диаметр патрубка D, мм', 315)],
  label: p => `Дефлектор Цаги Ø${p.D}`,
  parts(p) {
    const D = p.D;
    return { h0: 0.3 * D, h1: 0.9 * D, Dd: 1.3 * D, Dc: 1.5 * D, zc0: 0.55 * D, zc1: 1.15 * D, Dz: 1.9 * D, zz0: 1.25 * D, zz1: 1.55 * D };
  },
  calc(p) {
    const q = this.parts(p), D = p.D;
    const frus = (d1, d2, h) => PI * (d1 + d2) / 2 * Math.sqrt(h * h + ((d2 - d1) / 2) ** 2);
    const a = m2(PI * D * q.h0 + frus(D, q.Dd, q.h1 - q.h0) + PI * q.Dc * (q.zc1 - q.zc0) + frus(q.Dz, 0, q.zz1 - q.zz0));
    return res(a, wt(a, p.t), [`Типовые пропорции от D: патрубок ${n1(q.h0)}, диффузор до Ø${n1(q.Dd)}, корпус Ø${n1(q.Dc)}×${n1(q.zc1 - q.zc0)}, зонт Ø${n1(q.Dz)} мм`,
      'Общая высота ≈ ' + n1(q.zz1) + ' мм']);
  },
  build(p) {
    const q = this.parts(p), g = new THREE.Group(), D = p.D;
    put(g, tube({ t: 'round', d: D }, 0, q.h0)); if (q.h0 > SET.zig) zig(g, D / 2, SET.zig);
    cone(g, D / 2, q.h0, q.Dd / 2, q.h1);
    put(g, tube({ t: 'round', d: q.Dc }, q.zc0, q.zc1));
    cone(g, q.Dz / 2, q.zz0, 0, q.zz1);
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + PI / 2 * i;
      g.add(rod(new THREE.Vector3(q.Dd / 2 * Math.cos(a), q.Dd / 2 * Math.sin(a), q.h1),
        new THREE.Vector3(q.Dz * 0.3 * Math.cos(a), q.Dz * 0.3 * Math.sin(a), q.zz0 + 10), 4));
    }
    return g;
  },
});

/* 8. Выброс 45° с сеткой */
def({
  id: 'exhaust45', name: 'Выброс 45° с сеткой', up: true,
  fields: [numF('D', 'Диаметр D, мм', 315), numF('H', 'Высота короткой стороны H, мм', 250)],
  label: p => `Выброс 45° с сеткой Ø${p.D}, H=${p.H}`,
  calc(p) {
    const a = m2(PI * p.D * (p.H + p.D / 2)), mesh = m2(PI * p.D * p.D / 4 * Math.SQRT2);
    return res(a, wt(a, p.t) + mesh * SET.meshW, [`Обечайка: ${n1(PI * p.D)} × (${p.H} … ${n1(p.H + p.D)}) мм, срез под 45°`,
      `Сетка в плоскости среза: ${n1(mesh * 1e6)} мм² (${(mesh).toFixed(3)} м²), вес сетки включён`]);
  },
  build(p) {
    const g = new THREE.Group(), s = { t: 'round', d: p.D };
    const top = profilePts(s, 0).map(v => { v.z = p.H + p.D / 2 + v.x; return v; });
    put(g, ringsGeom([profilePts(s, 0), top])); if (p.H > SET.zig) zig(g, p.D / 2, SET.zig);
    g.add(gridLines(s, (x) => p.H + p.D / 2 + x, p.D / 14));
    return g;
  },
});

/* 9. Реактивное сопло */
def({
  id: 'nozzle', name: 'Реактивное сопло',
  fields: [numF('D', 'Диаметр входа D, мм', 315), numF('d', 'Диаметр выхода d, мм', 160), numF('L', 'Длина L, мм', 500)],
  label: p => `Реактивное сопло Ø${p.D}→Ø${p.d}, L=${p.L}`,
  calc(p) {
    const sl = Math.sqrt(p.L * p.L + ((p.D - p.d) / 2) ** 2), a = m2(PI * (p.D + p.d) / 2 * sl);
    return res(a, wt(a, p.t), [conicDev(p.D, p.d, p.L), `Образующая ${n1(sl)} мм`]);
  },
  build(p) { const g = new THREE.Group(); put(g, loft({ t: 'round', d: p.D }, 0, { t: 'round', d: p.d }, p.L));
    if (SET.zig > 0 && p.L > 2 * SET.zig) { const rz = z => p.D / 2 + (p.d / 2 - p.D / 2) * z / p.L; zig(g, rz(SET.zig), SET.zig); zig(g, rz(p.L - SET.zig), p.L - SET.zig); }
    return g; },
});

/* 10. Заглушка */
def({
  id: 'cap', name: 'Заглушка',
  fields: [selF('shape', 'Сечение', SH, 'round'), ...dims('', '', 'shape', 315, 500, 300), numF('h', 'Высота борта / гильзы, мм', 30)],
  label: p => `Заглушка ${p.shape === 'round' ? 'круглая' : 'прямоугольная'} ${dimStr(shapeOf(p))}`,
  calc(p) {
    const s = shapeOf(p), a = m2(areaCS(s) + perim(s) * p.h);
    return res(a, wt(a, p.t), [`Дно: ${s.t === 'round' ? 'Ø' + n1(s.d) : n1(s.a) + '×' + n1(s.b)} мм, ${s.t === 'round' ? 'гильза' : 'борт'} ${p.h} мм`]);
  },
  build(p) {
    const g = new THREE.Group(), s = shapeOf(p);
    put(g, tube(s, 0, p.h), { flat: isFlat(s) });
    put(g, capGeom(profilePts(s, 0)), { flat: true, edges: false });
    if (s.t === 'round' && p.h > SET.zig + 10) zig(g, s.d / 2, p.h - SET.zig);
    return g;
  },
});

/* 11. Сетка защитная */
def({
  id: 'mesh', name: 'Сетка защитная',
  fields: [selF('shape', 'Сечение', SH, 'round'), ...dims('', '', 'shape', 315, 500, 300), numF('fw', 'Ширина рамки / гильзы, мм', 20)],
  label: p => `Сетка защитная ${p.shape === 'round' ? 'круглая' : 'прямоугольная'} ${dimStr(shapeOf(p))}`,
  calc(p) {
    const s = shapeOf(p), mesh = m2(areaCS(s)), fr = m2(perim(s) * p.fw);
    return res(mesh + fr, wt(fr, p.t) + mesh * SET.meshW, [`Сетка: ${(mesh).toFixed(3)} м², рамка: ${n1(perim(s))} × ${p.fw} мм`]);
  },
  build(p) {
    const g = new THREE.Group(), s = shapeOf(p);
    put(g, tube(s, 0, p.fw), { flat: isFlat(s) });
    if (s.t === 'round' && p.fw > SET.zig + 10) zig(g, s.d / 2, SET.zig);
    g.add(gridLines(s, () => p.fw, Math.min(40, (s.t === 'round' ? s.d : Math.min(s.a, s.b)) / 12)));
    return g;
  },
});

/* 12. Шумоглушитель круглый */
def({
  id: 'silround', name: 'Шумоглушитель круглый',
  fields: [numF('D', 'Диаметр D, мм', 315), numF('L', 'Общая длина с патрубками, мм (станд. 1000 / 600 / 500)', 1000),
    numF('st', 'Патрубок с каждой стороны, мм', 50, 0), numF('s', 'Толщина изоляции, мм', 100)],
  label: p => `Шумоглушитель круглый Ø${p.D}, L=${p.L} (корпус ${p.L - 2 * p.st}), изоляция ${p.s}`,
  calc(p) {
    const Lb = p.L - 2 * p.st, Dk = p.D + 2 * p.s, ann = PI * (Dk * Dk - p.D * p.D) / 4;
    const a = m2(PI * Dk * Lb + PI * p.D * p.L + 2 * ann), wool = ann * Lb / 1e9 * SET.woolD;
    const dev = [`Корпус без патрубков ${Lb} мм + патрубки 2 × ${p.st} мм = ${p.L} мм`, `Кожух: Ø${Dk} × ${Lb} мм, перфотруба Ø${p.D} × ${p.L} мм`, `Изоляция: ${(ann * Lb / 1e9).toFixed(3)} м³, ${n1(wool)} кг`];
    if (Lb <= 0) dev.push('⚠ Длина меньше патрубков');
    return res(a, wt(a, p.t) + wool, dev);
  },
  build(p) {
    const g = new THREE.Group(), Dk = p.D + 2 * p.s, h = (p.L - 2 * p.st) / 2, inner = { t: 'round', d: p.D };
    put(g, tube({ t: 'round', d: Dk }, -h, h), { opacity: 0.35, edges: false });
    put(g, tube(inner, -p.L / 2, p.L / 2));
    if (p.st > SET.zig) { zig(g, p.D / 2, p.L / 2 - SET.zig); zig(g, p.D / 2, -p.L / 2 + SET.zig); }
    [-h, h].forEach(z => {
      const outer = ringPts(Dk / 2, z), inn = ringPts(p.D / 2, z).reverse();
      const m = new THREE.Mesh(ringsGeom_flat(outer, inn), mat(COL.wool, { roughness: 0.9, metalness: 0 })); g.add(m);
    });
    return g;
  },
});
function ringsGeom_flat(outer, inner) {   // кольцо между двумя контурами
  const n = outer.length, pos = [], idx = [];
  outer.forEach(v => pos.push(v.x, v.y, v.z));
  inner.slice().reverse().forEach(v => pos.push(v.x, v.y, v.z));
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, j, n + i, j, n + j, n + i); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* 13. Шумоглушитель прямоугольный */
def({
  id: 'silrect', name: 'Шумоглушитель прямоугольный',
  fields: [numF('A', 'Ширина A, мм', 600), numF('B', 'Высота B, мм', 400), numF('L', 'Длина L, мм (станд. 1000 / 500)', 1000),
    numF('n', 'Кол-во пластин', 2, 0), numF('ph', 'Толщина пластины, мм', 100)],
  label: p => `Шумоглушитель прямоугольный ${p.A}×${p.B}, L=${p.L}, пластин ${p.n}`,
  calc(p) {
    const casing = 2 * (p.A + p.B) * p.L, pl = p.n * 2 * (p.B * p.L + p.B * p.ph + p.ph * p.L), a = m2(casing + pl);
    const wool = p.n * p.ph * p.B * p.L / 1e9 * SET.woolD, gap = (p.A - p.n * p.ph) / (p.n + 1);
    const dev = [`Кожух: ${n1(2 * (p.A + p.B))} × ${p.L} мм`, `Пластины: ${p.n} шт. ${p.ph}×${p.B}×${p.L} мм, зазор между ними ${n1(gap)} мм`, `Вата: ${n1(wool)} кг`];
    if (gap <= 0) dev.push('⚠ Пластины не помещаются — уменьшите их число или толщину');
    return res(a, wt(a, p.t) + wool, dev);
  },
  build(p) {
    const g = new THREE.Group(), s = { t: 'rect', a: p.A, b: p.B }, h = p.L / 2;
    put(g, tube(s, -h, h), { flat: true, opacity: 0.35, edges: false });
    const gap = (p.A - p.n * p.ph) / (p.n + 1);
    for (let i = 0; i < p.n; i++) {
      const x = -p.A / 2 + gap * (i + 1) + p.ph * (i + 0.5);
      const m = new THREE.Mesh(new THREE.BoxGeometry(p.ph, p.B - 4, p.L), mat(COL.wool, { roughness: 0.9, metalness: 0 }));
      m.position.x = x; g.add(m);
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: VIEW.style === 'draw' ? 0x111111 : COL.edge })).translateX(x));
    }
    put(g, tube(s, -h - 40, -h), { flat: true }); put(g, tube(s, h, h + 40), { flat: true });
    return g;
  },
});

/* 14. Хомут */
def({
  id: 'clamp', name: 'Хомут', t0: 1.0,
  fields: [numF('D', 'Диаметр воздуховода D, мм', 315), numF('w', 'Ширина ленты, мм', 30)],
  label: p => `Хомут Ø${p.D}, лента ${p.w} мм`,
  calc(p) {
    const len = PI * (p.D + 2 * p.t) + 80, a = m2(len * p.w);
    return res(a, wt(a, p.t) + 0.05, [`Лента: ${n1(len)} × ${p.w} мм (с ушками 2×40), δ=${p.t}`, 'В вес включён крепёж 0,05 кг']);
  },
  build(p) {
    const g = new THREE.Group(), r = p.D / 2 + p.t;
    put(g, tube({ t: 'round', d: 2 * r }, -p.w / 2, p.w / 2));
    [-1, 1].forEach(k => { const e = new THREE.Mesh(new THREE.BoxGeometry(30, p.w, 6), mat(COL.steel)); e.position.set(r + 15, 0, k * 14); g.add(e); });
    g.rotation.x = 0;
    const bolt = rod(new THREE.Vector3(r + 15, 0, -30), new THREE.Vector3(r + 15, 0, 30), 4); g.add(bolt);
    return g;
  },
});

/* 15. Зонт вытяжной кухонный */
def({
  id: 'hood', name: 'Зонт вытяжной кухонный', up: true,
  fields: [numF('A', 'Ширина A (по низу), мм', 1000), numF('B', 'Глубина B (по низу), мм', 800), numF('H', 'Высота зонта H, мм', 350),
    selF('ns', 'Патрубок', SH, 'round'),
    numF('D', 'Диаметр патрубка, мм', 315, 20, p => p.ns === 'round'),
    numF('a', 'Патрубок A, мм', 400, 20, p => p.ns === 'rect'), numF('b', 'Патрубок B, мм', 300, 20, p => p.ns === 'rect'),
    numF('hn', 'Высота патрубка, мм', 120), numF('hs', 'Борт по низу, мм', 30)],
  label: p => `Зонт вытяжной ${p.A}×${p.B}×${p.H}, патрубок ${p.ns === 'round' ? 'Ø' + p.D : p.a + '×' + p.b}`,
  geoms(p) {
    const bot = { t: 'rect', a: p.A, b: p.B }, neck = p.ns === 'round' ? { t: 'round', d: p.D } : { t: 'rect', a: p.a, b: p.b };
    return { bot, neck, skirt: tube(bot, 0, p.hs), body: loft(bot, p.hs, neck, p.hs + p.H), neckT: tube(neck, p.hs + p.H, p.hs + p.H + p.hn) };
  },
  calc(p) {
    const q = this.geoms(p), a = m2(geomArea(q.skirt) + geomArea(q.body) + geomArea(q.neckT));
    return res(a, wt(a, p.t), [`Борт: ${n1(perim(q.bot))} × ${p.hs} мм`, `Корпус: из ${p.A}×${p.B} в ${dimStr(q.neck)}, высота ${p.H} мм`,
      `Патрубок: ${n1(perim(q.neck))} × ${p.hn} мм`, 'Жировые фильтры в расчёт не включены']);
  },
  build(p) {
    const q = this.geoms(p), g = new THREE.Group();
    put(g, q.skirt, { flat: true }); put(g, q.body, { flat: true }); put(g, q.neckT, { flat: q.neck.t === 'rect' }); if (q.neck.t === 'round' && p.hn > SET.zig) zig(g, q.neck.d / 2, p.hs + p.H + p.hn - SET.zig);
    return g;
  },
});

/* 16. Фильтр-бокс */
const wideDoor = (b, door) => (door === 'wide') === (b.a >= b.b) ? 'y' : 'x';   // нормаль к стенке с дверцей
def({
  id: 'filterbox', name: 'Фильтр-бокс',
  fields: [selF('cs', 'Присоединение', SH, 'rect'), ...dims('', 'присоединения', 'cs', 315, 500, 300),
    numF('L', 'Длина корпуса L, мм', 500), numF('mg', 'Запас корпуса от сечения, мм (с каждой стороны)', 50, 0),
    selF('ft', 'Фильтр', [['cass', 'Кассета'], ['pocket', 'Карманный фильтр']], 'cass'),
    numF('th', 'Толщина кассеты, мм', 50, 10, p => p.ft === 'cass'),
    numF('pk', 'Длина карманов, мм', 600, 100, p => p.ft === 'pocket'), numF('np', 'Кол-во карманов', 3, 1, p => p.ft === 'pocket'),
    selF('door', 'Дверца', [['wide', 'По широкой стороне'], ['narrow', 'По узкой стороне']], 'wide'),
    numF('fl', 'Патрубок присоединения, мм', 30, 0)],
  label: p => `Фильтр-бокс ${dimStr(shapeOf(p, '', 'cs'))}, корпус L=${p.L}, ${p.ft === 'pocket' ? 'карманный фильтр ' + p.pk : 'кассета ' + p.th}, дверца на замках`,
  body(p) { const c = shapeOf(p, '', 'cs'), w = (c.t === 'round' ? c.d : c.a) + 2 * p.mg, h = (c.t === 'round' ? c.d : c.b) + 2 * p.mg; return { c, b: { t: 'rect', a: w, b: h } }; },
  calc(p) {
    const { c, b } = this.body(p), plates = 2 * (areaCS(b) - areaCS(c));
    const a = m2(perim(b) * p.L + plates + 2 * perim(c) * p.fl);
    const dev = [`Корпус: ${b.a}×${b.b}×${p.L} мм, торцы с отверстием под ${dimStr(c)}`, `Патрубки: 2 × ${p.fl} мм`,
      `Дверца по ${p.door === 'wide' ? 'широкой' : 'узкой'} стороне, на замках`,
      p.ft === 'pocket' ? `Карманный фильтр: ${p.np} карм. × ${p.pk} мм (заказывается отдельно)` : `Кассета ${p.th} мм (${b.a - 10}×${b.b - 10}) — отдельной позицией`];
    if (p.ft === 'pocket' && p.pk > p.L - 100) dev.push('⚠ Длина корпуса мала для таких карманов — увеличьте L');
    return res(a, wt(a, p.t), dev);
  },
  build(p) {
    const g = new THREE.Group(), { c, b } = this.body(p), h = p.L / 2, edge = new THREE.LineBasicMaterial({ color: VIEW.style === 'draw' ? 0x111111 : COL.edge });
    put(g, tube(b, -h, h), { flat: true, opacity: 0.4, edges: false });
    [-h, h].forEach(z => put(g, loft(b, z, c, z), { flat: true }));
    if (p.fl > 0) { put(g, tube(c, -h - p.fl, -h), { flat: isFlat(c) }); put(g, tube(c, h, h + p.fl), { flat: isFlat(c) }); }
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.a, b.b, p.L)), edge));
    if (p.ft === 'pocket') {
      const z0 = -h + 80, w = (b.a - 10) / p.np;
      for (let i = 0; i < p.np; i++) {
        const x = -(b.a - 10) / 2 + w * (i + 0.5);
        const pocket = ringsGeom([profilePts({ t: 'rect', a: w - 4, b: b.b - 10 }, z0, x), profilePts({ t: 'rect', a: 8, b: b.b - 10 }, Math.min(z0 + p.pk, h - 10), x)]);
        put(g, pocket, { flat: true, color: 0xe9eff5 });
      }
      put(g, tube({ t: 'rect', a: b.a - 6, b: b.b - 6 }, z0 - 12, z0), { flat: true });
    } else {
      const cs = new THREE.Mesh(new THREE.BoxGeometry(b.a - 10, b.b - 10, p.th), mat(0xdde8ef, { roughness: 0.9, metalness: 0 })); g.add(cs);
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(cs.geometry), edge));
    }
    /* дверца на замках по широкой (или узкой) стороне */
    const nrm = wideDoor(b, p.door), span = nrm === 'y' ? b.a : b.b, dl = Math.max(160, p.L * 0.6), dw = span * 0.8;
    const d = new THREE.Group(); put(d, new THREE.BoxGeometry(dw, 6, dl), { flat: true });
    [-1, 1].forEach(k => { const lk = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 18), mat(0x333c48)); lk.position.set(k * (dw / 2 - 30), 8, 0); d.add(lk); });
    d.add(rod(V(-dw * 0.2, 9, -dl * 0.35), V(-dw * 0.2, 9, dl * 0.35), 4, 0x333c48));
    d.position.set(nrm === 'y' ? 0 : b.a / 2 + 3, nrm === 'y' ? b.b / 2 + 3 : 0, 0);
    if (nrm === 'x') { d.rotation.z = -PI / 2; }
    g.add(d);
    return g;
  },
});

/* 17. Кассета фильтра (отдельно) */
def({
  id: 'cassette', name: 'Кассета фильтра', fixed: { shape: 'rect' },
  fields: [numF('A', 'Ширина A, мм', 490, 50), numF('B', 'Высота B, мм', 290, 50), numF('th', 'Толщина, мм', 50, 10)],
  label: p => `Кассета фильтра ${p.A}×${p.B}×${p.th}`,
  calc(p) {
    const a = m2(2 * (p.A + p.B) * p.th), media = p.A * p.B / 1e6 * 0.35;
    return res(a, wt(a, p.t) + media, [`Рамка: ${n1(2 * (p.A + p.B))} × ${p.th} мм`, `Фильтрующий материал: ${num(p.A * p.B / 1e6)} м² (в вес включён 0,35 кг/м²)`, 'Цену задайте в КП вручную']);
  },
  build(p) {
    const g = new THREE.Group(), s = { t: 'rect', a: p.A, b: p.B };
    put(g, tube(s, -p.th / 2, p.th / 2), { flat: true });
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.A - 6, p.B - 6, p.th - 8), mat(0xe7eef4, { roughness: 0.95, metalness: 0 })); g.add(m);
    for (let i = 1; i < 14; i++) { const x = -p.A / 2 + p.A * i / 14; g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([V(x, -p.B / 2 + 3, p.th / 2 - 3), V(x, p.B / 2 - 3, p.th / 2 - 3)]), new THREE.LineBasicMaterial({ color: 0x9fb0c0 }))); }
    return g;
  },
});

/* 18. Карманный фильтр (отдельно) */
def({
  id: 'pocketf', name: 'Фильтр карманный', fixed: { shape: 'rect' },
  fields: [numF('A', 'Ширина рамки A, мм', 490, 50), numF('B', 'Высота рамки B, мм', 290, 50), numF('pk', 'Длина карманов, мм', 600, 100), numF('np', 'Кол-во карманов', 3, 1)],
  label: p => `Фильтр карманный ${p.A}×${p.B}, ${p.np} карм. × ${p.pk}`,
  calc(p) {
    const frame = m2(2 * (p.A + p.B) * 25), media = p.np * 2 * p.pk * p.B / 1e6;
    return res(frame, wt(frame, p.t) + media * 0.35, [`Рамка: ${n1(2 * (p.A + p.B))} × 25 мм`, `Карманов: ${p.np} шт., материал ${num(media)} м² (в вес включён 0,35 кг/м²)`, 'Цену задайте в КП вручную']);
  },
  build(p) {
    const g = new THREE.Group(), w = (p.A - 10) / p.np;
    put(g, tube({ t: 'rect', a: p.A, b: p.B }, -12, 12), { flat: true });
    for (let i = 0; i < p.np; i++) {
      const x = -(p.A - 10) / 2 + w * (i + 0.5);
      put(g, ringsGeom([profilePts({ t: 'rect', a: w - 4, b: p.B - 10 }, 12, x), profilePts({ t: 'rect', a: 8, b: p.B - 10 }, 12 + p.pk, x)]), { flat: true, color: 0xe9eff5 });
    }
    return g;
  },
});

/* 19. Гибкая вставка */
const grow = (s, d) => (s.t === 'round' ? { t: 'round', d: s.d + 2 * d } : { t: 'rect', a: s.a + 2 * d, b: s.b + 2 * d });
def({
  id: 'flex', name: 'Гибкая вставка',
  fields: [selF('shape', 'Сечение', SH, 'rect'), ...dims('', '', 'shape', 500, 500, 300), numF('L', 'Длина вставки L, мм', 200),
    { k: 'fg', l: 'Фланец (шинорейка)', sel: [['S20', 'Фланец S20'], ['S30', 'Фланец S30'], ['none', 'Без фланца']], v: 'S20', show: p => p.shape === 'rect' }],
  label: p => `Гибкая вставка ${p.shape === 'round' ? 'круглая' : 'прямоугольная'} ${dimStr(shapeOf(p))}, L=${p.L}${p.fg && p.fg !== 'none' && p.shape === 'rect' ? ', фланец ' + p.fg : ''}`,
  calc(p) {
    const s = shapeOf(p), fab = m2(perim(s) * p.L);
    return res(fab, fab * 0.6, [`Ткань: ${n1(perim(s))} × ${p.L} мм (${num(fab)} м²), вес ткани 0,6 кг/м²`, 'Цену задайте в КП вручную']);
  },
  build(p) {
    const g = new THREE.Group(), s = shapeOf(p), h = p.L / 2, n = Math.max(4, Math.round(p.L / 25)), rings = [];
    for (let i = 0; i <= n; i++) {
      const z = -h + p.L * i / n, k = i % 2 ? 1 : 0, q = k ? shrink(s, 6) : s;
      rings.push(profilePts(q, z));
    }
    put(g, ringsGeom(rings), { flat: isFlat(s), color: VIEW.style === 'draw' ? 0xeceff3 : 0x4a5668 });
    if (p.shape === 'rect' && p.fg && p.fg !== 'none') { drawFlange(g, s, at(0, 0, -h, PI), p.fg); drawFlange(g, s, at(0, 0, h, 0), p.fg); }
    return g;
  },
});
const shrink = (s, d) => (s.t === 'round' ? { t: 'round', d: s.d - 2 * d } : { t: 'rect', a: s.a - 2 * d, b: s.b - 2 * d });

/* общие помощники для интерфейса */
function defaultsOf(type) {
  const p = {};
  type.fields.forEach(f => { p[f.k] = f.v; });
  Object.assign(p, type.fixed || {});
  p.t = type.t0 || SET.t;
  return p;
}
