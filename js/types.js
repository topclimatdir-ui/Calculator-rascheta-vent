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
/* валик на корпусе (дефлектор): тор радиусом rr и две линии по бокам — «двойная линия» как на чертеже */
function bead(g, r, z, rr) {
  const R = r + rr * 0.3, zl = rr * 0.8, rl = R + Math.sqrt(rr * rr - zl * zl) + 0.3, draw = VIEW.style === 'draw';
  const m = new THREE.Mesh(new THREE.TorusGeometry(R, rr, 10, 120),
    mat(draw ? 0xeef1f5 : 0x8aa3bc, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  m.position.z = z; g.add(m);
  const lm = new THREE.LineBasicMaterial({ color: draw ? 0x111111 : COL.edge });
  [-1, 1].forEach(s => g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts(rl, z + s * zl, 120)), lm)));
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
/* поперечные рёбра жёсткости (зиги) на сторонах короба: равный шаг по всей длине, высота SET.zigH */
function addRibs(g, p) {
  if (p.rib !== 'cross') return;
  const col = VIEW.style === 'draw' ? 0x111111 : 0x5f7893, rr = SET.zigH * 0.45, step = p.ribStep || 150;
  const n = Math.max(1, Math.floor(p.L / step)), z0 = -p.L / 2 + (p.L - (n - 1) * step) / 2;
  const face = (w, c, axis, sg) => {
    for (let i = 0; i < n; i++) {
      const z = z0 + i * step, off = c + sg * rr * 0.6, h = w / 2 - 15;
      const P = u => (axis === 'y' ? V(u, off, z) : V(off, u, z));
      g.add(rod(P(-h), P(h), rr, col));
    }
  };
  if (p.A >= p.ribMin) { face(p.A, p.B / 2, 'y', 1); face(p.A, -p.B / 2, 'y', -1); }
  if (p.B >= p.ribMin) { face(p.B, p.A / 2, 'x', 1); face(p.B, -p.A / 2, 'x', -1); }
}
def({
  id: 'box', name: 'Короб прямоугольный', fixed: { shape: 'rect', ribStep: 150, ribMin: 300 },
  fields: [numF('A', 'Ширина A, мм', 500, 20), numF('B', 'Высота B, мм', 300, 20), numF('L', 'Длина L, мм', 1250),
    selF('rib', 'Рёбра жёсткости', [['cross', 'Поперечные'], ['none', 'Нет']], 'cross')],
  label: p => `Короб прямоугольный ${p.A}×${p.B}, L=${p.L}` + (p.rib === 'cross' ? ', рёбра жёсткости' : ''),
  calc(p) {
    const r = ductCalc.call(this, p);
    if (p.rib === 'cross') r.dev.push(`Поперечные зиги: шаг ${p.ribStep} мм, высота ${SET.zigH} мм, на сторонах от ${p.ribMin} мм (${(p.A >= p.ribMin ? 2 : 0) + (p.B >= p.ribMin ? 2 : 0)} грани)`);
    return r;
  },
  build(p) { const g = ductBuild(p); addRibs(g, p); return g; },
});
def({
  id: 'pipe', name: 'Труба прямошовная', fixed: { shape: 'round' },
  fields: [numF('D', 'Диаметр D, мм', 315, 20), numF('L', 'Длина L, мм', 1250)],
  label: p => `Труба прямошовная Ø${p.D}, L=${p.L}`, calc: ductCalc, build: ductBuild,
});
def({
  id: 'snv', name: 'Труба СНВ (спирально-навивная)', fixed: { shape: 'round', L: 1000 }, perMp: true, unit: 'м.п.',
  fields: [numF('D', 'Диаметр D, мм', 315, 20)],
  label: p => `Труба СНВ Ø${p.D}` + (p.L === 1000 ? ' (1 м.п.)' : `, L=${p.L}`),
  calc(p) {
    const r = ductCalc.call(this, p);
    r.dev.unshift(p.L === 1000 ? 'Спирально-навивная. Площадь, вес и цена указаны за 1 м.п., количество в КП — в метрах погонных' : 'Спирально-навивная, цена за 1 м.п.');
    return r;
  },
  build(p) {
    const g = new THREE.Group(), r = p.D / 2 + 0.6, pitch = Math.max(40, p.D * 0.35), turns = p.L / pitch, n = Math.ceil(turns * 48), pts = [];
    for (let i = 0; i <= n; i++) { const u = i / n, a = 2 * PI * turns * u; pts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), -p.L / 2 + p.L * u)); }
    put(g, tube(shapeOf(p), -p.L / 2, p.L / 2));   // спиральная труба без зигов
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

/* 4. Тройник / врезка / крестовина.
   Ответвление строится только снаружи магистрали: нижнее кольцо лежит ровно на стенке (плоскость или цилиндр),
   ось ответвления проходит через центр стенки магистрали (z = 0, y = 0) под заданным углом, Lb — длина вдоль оси от стенки. */
const teeHalf = p => { const s1 = shapeOf(p, '1', 's1'); return (s1.t === 'round' ? s1.d : s1.a) / 2; };
const teeFrame = (p, a) => T4(Math.sin(a) < 0 ? -teeHalf(p) : teeHalf(p), 0, 0).multiply(RY(a));   // система координат ответвления: начало на стенке, ось z вдоль ответвления
function teeBranch(p, a) {
  const s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'), sin = Math.sin(a), cos = Math.cos(a), sg = sin < 0 ? -1 : 1, half = teeHalf(p);
  const d = new THREE.Vector3(sin, 0, cos), xp = new THREE.Vector3(cos, 0, -sin), O = new THREE.Vector3(sg * half, 0, 0), pts = [];
  let tooWide = false, zExt = 0, ext = { t: -Infinity, x: 0, y: 0 };
  profilePts(s2, 0).forEach(v => {
    if (s1.t === 'round' && Math.abs(v.y) > half) tooWide = true;
    const xw = s1.t === 'round' ? sg * Math.sqrt(Math.max(0, half * half - v.y * v.y)) : sg * half;   // стенка магистрали в точке с высотой y
    const t = (xw - O.x - v.x * cos) / sin, base = O.clone().addScaledVector(xp, v.x).add(new THREE.Vector3(0, v.y, 0));
    pts.push({ base, t, pb: base.clone().addScaledVector(d, t) });
    zExt = Math.max(zExt, Math.abs(pts[pts.length - 1].pb.z));
    if (t > ext.t) ext = { t, x: v.x, y: v.y };
  });
  const tTop = ext.t + p.Lb;   // торец ответвления — плоскость ⟂ оси; Lb отсчитывается от самой дальней точки стенки (короткая сторона)
  return { geom: ringsGeom([pts.map(q => q.pb), pts.map(q => q.base.clone().addScaledVector(d, tTop))]), tTop, ext, zExt, tooWide };
}
/* отверстие в стенке магистрали под ответвление: тёмная «заплатка» по контуру врезки на наружной и внутренней стороне стенки */
function teeHole(p, a, lift) {   // набор колец от края отверстия к центру (на стенке магистрали)
  const s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'), sin = Math.sin(a), cos = Math.cos(a), sg = sin < 0 ? -1 : 1, half = teeHalf(p);
  const d = new THREE.Vector3(sin, 0, cos), xp = new THREE.Vector3(cos, 0, -sin), O = new THREE.Vector3(sg * half, 0, 0);
  return [1, 0.94, 0.88].map(f => profilePts(s2, 0).map(v => {
    v.x *= f; v.y *= f;
    const xw = s1.t === 'round' ? sg * Math.sqrt(Math.max(0, half * half - v.y * v.y)) : sg * half, t = (xw - O.x - v.x * cos) / sin;
    const q = O.clone().addScaledVector(xp, v.x).add(new THREE.Vector3(0, v.y, 0)).addScaledVector(d, t); q.x += sg * lift; return q;
  }));
}
function teeHoleMeshes(p, a, lift) {   // вид внутрь магистрали: мягкий градиент без чёрного (по краю светлее, к центру глубже)
  const rings = teeHole(p, a, lift), draw = VIEW.style === 'draw', c0 = new THREE.Color(draw ? 0xdfe4ea : 0x8497ad), c1 = new THREE.Color(draw ? 0xaeb8c4 : 0x56677c);
  const out = [];
  for (let k = 0; k < rings.length - 1; k++) {
    const mt = new THREE.MeshBasicMaterial({ color: c0.clone().lerp(c1, k / (rings.length - 2)), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    out.push(new THREE.Mesh(ringsGeom([rings[k], rings[k + 1]]), mt));
  }
  return out;
}
/* стенка магистрали тройника: мелкая сетка с настоящими отверстиями под ответвления (видна полость внутри) */
function teeWall(p, s, L, angs) {
  const KK = s.t === 'round' ? 96 : Math.max(24, Math.min(80, Math.ceil(Math.max(s.a, s.b) / 4 / 1))), nz = Math.max(8, Math.min(200, Math.ceil(L / 3)));
  const ring = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < KK; i++) {
    const u = i / KK;
    if (s.t === 'round') { const ang = -PI / 4 + PI / 2 * (j + u); ring.push([s.d / 2 * Math.cos(ang), s.d / 2 * Math.sin(ang)]); }
    else { const a = s.a / 2, b = s.b / 2; ring.push(j === 0 ? [a, -b + 2 * b * u] : j === 1 ? [a - 2 * a * u, b] : j === 2 ? [-a, b - 2 * b * u] : [-a + 2 * a * u, -b]); }
  }
  const n = ring.length, pos = [], idx = [];
  for (let r = 0; r <= nz; r++) ring.forEach(([x, y]) => pos.push(x, y, -L / 2 + L * r / nz));
  const s2 = shapeOf(p, '2', 's2'), inv = angs.map(a => ({ m: new THREE.Matrix4().copy(teeFrame(p, a)).invert(), sg: Math.sin(a) < 0 ? -1 : 1 }));   // отверстие только на стороне своего ответвления
  const inHole = (x, y, z) => inv.some(({ m, sg }) => {
    if (x * sg <= 0) return false;
    const q = new THREE.Vector3(x, y, z).applyMatrix4(m);
    return s2.t === 'round' ? q.x * q.x + q.y * q.y < (s2.d / 2 * 0.93) ** 2 : Math.abs(q.x) < s2.a / 2 * 0.93 && Math.abs(q.y) < s2.b / 2 * 0.93;
  });
  const P = k => [pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]];
  const tri = (a, b, c) => { const A = P(a), B = P(b), C = P(c); if (!inHole((A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3)) idx.push(a, b, c); };
  for (let r = 0; r < nz; r++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = r * n + i, b = r * n + j, c = (r + 1) * n + i, d = (r + 1) * n + j; tri(a, b, c); tri(b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function tubeEdges(g, s, L) {   // контур торцов и рёбра прямоугольного сечения (линии по сетке с отверстиями не нужны)
  const m = new THREE.LineBasicMaterial({ color: VIEW.style === 'draw' ? 0x111111 : COL.edge });
  [-L / 2, L / 2].forEach(z => g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(profilePts(s, z)), m)));
  if (s.t === 'rect') [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, y]) => g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(x * s.a / 2, y * s.b / 2, -L / 2), V(x * s.a / 2, y * s.b / 2, L / 2)]), m)));
}
const teeAngles = p => { const al = Math.min(Math.max(p.ang, 20), 160) * PI / 180; return p.kind === 'cross' ? [al, -al] : [al]; };
/* длина магистрали: по умолчанию по 80 мм с каждой стороны от места врезки (arm); у старых позиций — прежнее поле L */
const teeL = p => (p.arm != null ? 2 * (Math.max(...teeAngles(p).map(a => teeBranch(p, a).zExt)) + p.arm) : p.L);
def({
  id: 'tee', name: 'Тройник / врезка / крестовина',
  fields: [selF('kind', 'Вид', [['tee', 'Тройник'], ['cross', 'Крестовина'], ['saddle', 'Врезка (седло)']], 'tee'),
    selF('s1', 'Сечение магистрали', SH, 'round'),
    ...dims('1', 'магистрали', 's1', 315, 500, 300), numF('arm', 'Участок магистрали с каждой стороны от врезки, мм', 80, 0),
    selF('s2', 'Сечение ответвления', SH, 'round'),
    ...dims('2', 'ответвления', 's2', 200, 300, 200), numF('Lb', 'Длина ответвления по короткой стороне, мм', 80),
    numF('ang', 'Угол ответвления, ° (20…160)', 90, 20)],
  label: p => `${{ tee: 'Тройник', cross: 'Крестовина', saddle: 'Врезка' }[p.kind]} ${''} ${dimStr(shapeOf(p, '1', 's1'))} / ответвление ${dimStr(shapeOf(p, '2', 's2'))}, ${p.ang}°`,
  calc(p) {
    const s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'), angs = teeAngles(p), brs = angs.map(a => teeBranch(p, a));
    const areaB = brs.reduce((t, b) => t + geomArea(b.geom), 0), hole = angs.reduce((t, a) => t + areaCS(s2) / Math.abs(Math.sin(a)), 0);
    let a, dev;
    if (p.kind === 'saddle') {
      a = m2(areaB);
      dev = [`Ответвление: ${n1(perim(s2))} × ${n1(p.Lb)} мм по короткой стороне`, 'Отверстие в воздуховоде и седло — по месту'];
    } else {
      a = m2(perim(s1) * teeL(p) + areaB - hole);
      dev = [`Магистраль: ${n1(perim(s1))} × ${n1(teeL(p))} мм (по ${p.arm != null ? p.arm : '—'} мм с каждой стороны от ответвления)`, `Ответвление: ${n1(perim(s2))} × ${n1(p.Lb)} мм по короткой стороне${brs.length > 1 ? ' (2 шт.)' : ''}, угол ${p.ang}°`,
        `Отверстие(я) в магистрали: ${n1(areaCS(s2) / Math.abs(Math.sin(angs[0])))} мм² (каждое)`];
    }
    if (brs.some(b => b.tooWide)) dev.push('⚠ Ответвление шире круглой магистрали — уменьшите размер');
    if (p.kind !== 'saddle' && p.arm == null && brs.some(b => b.zExt > teeL(p) / 2)) dev.push('⚠ Ответвление выходит за длину магистрали — увеличьте L');
    return res(a, wt(a, p.t), dev);
  },
  build(p) {
    const g = new THREE.Group(), s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'), ghost = p.kind === 'saddle';
    const L = teeL(p);
    const wall = teeWall(p, s1, L, teeAngles(p)), flatW = isFlat(s1), ghostO = ghost ? 0.22 : 1;
    g.add(new THREE.Mesh(wall, mat(COL.steel, { flatShading: flatW, transparent: ghost, opacity: ghostO, depthWrite: !ghost })));
    if (!ghost) tubeEdges(g, s1, L);
    if (!ghost) zigs(g, s1, -L / 2, L / 2);
    teeAngles(p).forEach(a => {
      const br = teeBranch(p, a); put(g, br.geom, { flat: isFlat(s2) });
      [0.6, -0.6].forEach(l => teeHoleMeshes(p, a, l).forEach(m => g.add(m)));   // отверстие в стенке магистрали
      if (s2.t === 'round' && p.Lb > SET.zig + 10) { const b = new THREE.Group(); zig(b, s2.d / 2, br.tTop - SET.zig); b.applyMatrix4(teeFrame(p, a)); g.add(b); }
    });
    return g;
  },
});

/* 5. Дроссель-клапан */
def({
  id: 'throttle', name: 'Дроссель-клапан',
  fields: [selF('shape', 'Сечение', SH, 'round'), ...dims('', '', 'shape', 315, 500, 300),
    numF('L', 'Длина корпуса L, мм', 150), numF('open', 'Показать угол открытия, ° (для картинки)', 35, 0),
    selF('drive', 'Управление', [['hand', 'Ручной рычаг'], ['act', 'Под привод']], 'hand')],
  label: p => `${p.drive === 'act' ? 'Клапан под привод' : 'Дроссель-клапан'} ${p.shape === 'round' ? 'круглый' : 'прямоугольный'} ${dimStr(shapeOf(p))}, L=${p.L}`,
  calc(p) {
    const s = shapeOf(p), a = m2(perim(s) * p.L + areaCS(s)), act = p.drive === 'act', w = wt(a, p.t) + (act ? 0.5 : 0.3);
    return res(a, w, [`Корпус: ${n1(perim(s))} × ${n1(p.L)} мм`, `Заслонка: ${s.t === 'round' ? 'Ø' + n1(s.d - 4) : n1(s.a - 4) + '×' + n1(s.b - 4)} мм`,
      act ? 'Под привод: кронштейн с площадкой и удлинённая ось (привод в комплект не входит). В вес включено 0,5 кг' : 'В вес включено 0,3 кг на ось и ручку']);
  },
  build(p) {
    const g = new THREE.Group(), s = shapeOf(p);
    put(g, tube(s, -p.L / 2, p.L / 2), { flat: isFlat(s) }); zigs(g, s, -p.L / 2, p.L / 2);
    const disc = s.t === 'round' ? new THREE.CircleGeometry(s.d / 2 - 2, 48) : new THREE.PlaneGeometry(s.a - 4, s.b - 4);
    const dm = new THREE.Mesh(disc, mat(0x6f8aa6)); dm.rotation.y = p.open * PI / 180; g.add(dm);
    const op = p.open * PI / 180;
    if (p.drive === 'act') {   // под привод: удлинённая ось и кронштейн-площадка (как у КВК)
      const r = (s.t === 'round' ? s.d : s.b) / 2, steel = mat(COL.steel), top = r + 38, bw = Math.min(110, (s.t === 'round' ? s.d : s.a) * 0.5), bl = Math.min(p.L * 0.9, 120);
      g.add(rod(V(0, -r - 5, 0), V(0, top + 110, 0), 5, 0x39414b));
      const plate = new THREE.Mesh(new THREE.BoxGeometry(bw, 3, bl), steel); plate.position.set(0, top, 0); g.add(plate);
      [-1, 1].forEach(sg => { const leg = new THREE.Mesh(new THREE.BoxGeometry(3, top - r, bl * 0.7), steel); leg.position.set(sg * bw * 0.3, (top + r) / 2, 0); g.add(leg); });
      const ex = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.35, 3, 28), steel); ex.position.set(-bw * 0.65, top, 0); g.add(ex);
    } else if (s.t === 'round') {   // как на образце: ось с квадратным концом, секторная пластина с дугой и рычаг с барашком
      const r = s.d / 2, len = Math.max(70, s.d * 0.5), steel = mat(COL.steel), dk = mat(0x39414b);
      g.add(rod(V(0, -r - 5, 0), V(0, r + 14, 0), 4, 0x39414b));
      const plate = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 3, Math.min(p.L, len * 0.8)), steel); plate.position.set(len * 0.3, r + 1.5, 0); g.add(plate);
      const arc = []; for (let i = 0; i <= 20; i++) { const ar = PI / 2 * i / 20; arc.push(V(len * 0.62 * Math.cos(ar), r + 3.2, -len * 0.62 * Math.sin(ar) * 0.55)); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc), new THREE.LineBasicMaterial({ color: 0x1b222a })));
      const lg = new THREE.BoxGeometry(len, 3, Math.min(26, p.L * 0.35)); lg.translate(len / 2 - 8, 0, 0);
      const lever = new THREE.Mesh(lg, steel); lever.position.set(0, r + 6, 0); lever.rotation.y = -op * 0.8; g.add(lever);
      const sq = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), dk); sq.position.set(0, r + 14, 0); g.add(sq);
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 6, 16), steel); nut.position.set(len * 0.55 * Math.cos(-op * 0.8), r + 10, -len * 0.55 * Math.sin(-op * 0.8)); g.add(nut);
    } else {
      const h = s.b / 2;
      g.add(rod(new THREE.Vector3(0, -h - 5, 0), new THREE.Vector3(0, h + 45, 0), 4));
      g.add(rod(new THREE.Vector3(0, h + 45, 0), new THREE.Vector3(Math.max(60, h * 0.5), h + 45, 0), 5, 0xc0392b));
    }
    return g;
  },
});

/* 5а. Обратный клапан */
def({
  id: 'checkv', name: 'Обратный клапан',
  fields: [selF('shape', 'Сечение', SH, 'round'), ...dims('', '', 'shape', 315, 500, 300),
    numF('L', 'Длина корпуса L, мм', 200), numF('open', 'Показать угол открытия, ° (для картинки)', 30, 0)],
  label: p => `Обратный клапан ${p.shape === 'round' ? 'круглый' : 'прямоугольный'} ${dimStr(shapeOf(p))}, L=${p.L}`,
  nBlades: p => Math.max(2, Math.min(5, Math.round(p.B / 100))),
  calc(p) {
    const s = shapeOf(p), a = m2(perim(s) * p.L + areaCS(s));
    return res(a, wt(a, p.t) + 0.4, [`Корпус: ${n1(perim(s))} × ${n1(p.L)} мм`,
      s.t === 'round' ? `Створки: 2 полудиска Ø${n1(s.d - 4)} на оси` : `Ламели: ${this.nBlades(p)} шт. ${n1(s.a - 4)}×${n1(s.b / this.nBlades(p) - 2)} мм`, 'В вес включено 0,4 кг на оси и пружины']);
  },
  build(p) {
    const g = new THREE.Group(), s = shapeOf(p), op = p.open * PI / 180;
    put(g, tube(s, -p.L / 2, p.L / 2), { flat: isFlat(s) }); zigs(g, s, -p.L / 2, p.L / 2);
    const fm = mat(0x6f8aa6);
    if (s.t === 'round') {
      const r = s.d / 2 - 2;
      [[-PI / 2, -1], [PI / 2, 1]].forEach(([th, sg]) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48, th, PI), fm); m.rotation.y = sg * op; g.add(m); });
      g.add(rod(V(0, -s.d / 2 - 5, 0), V(0, s.d / 2 + 5, 0), 4));
    } else {
      const n = this.nBlades(p), bh = s.b / n;
      for (let i = 0; i < n; i++) {
        const geo = new THREE.PlaneGeometry(s.a - 4, bh - 2); geo.translate(0, -bh / 2 + 1, 0);
        const m = new THREE.Mesh(geo, fm); m.position.set(0, -s.b / 2 + bh * (i + 1), 0); m.rotation.x = -op; g.add(m);
        g.add(rod(V(-s.a / 2 - 4, -s.b / 2 + bh * (i + 1), 0), V(s.a / 2 + 4, -s.b / 2 + bh * (i + 1), 0), 2.5));
      }
    }
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

/* 7. Дефлектор ЦАГИ. Устройство по чертежу (Вородиз Вент): патрубок Ø D, он же внутренняя труба; корпус — цилиндр Ø D1
   с валиками у обоих краёв и нижним конусом к патрубку; внутри воронка-диффузор от трубы к стенке корпуса;
   сверху зонт (конус, вершина на уровне кромки корпуса) с воротником Ø D2 на четырёх S-образных лапках.
   Пропорции по типовым изделиям: корпус d1 = 2 D, зонт 1,7 D, высота ≈ 1,75 D (уточним по вашим размерам). */
def({
  id: 'tsagi', name: 'Дефлектор ЦАГИ', up: true,
  fields: [numF('D', 'Диаметр патрубка D, мм', 315), numF('hs', 'Длина патрубка снизу, мм', 120, 0)],
  label: p => `Дефлектор ЦАГИ Ø${p.D}`,
  parts(p) {
    const D = p.D, hs = p.hs === undefined || p.hs === '' ? 120 : Math.max(0, +p.hs || 0), r = x => Math.round(x * D);   // размеры круглые, в мм
    return {
      hs, D1: r(2.0), D2: r(1.7),
      zk: hs + r(0.35),      // низ корпуса (снизу открыт, держится на лапках)
      zl: hs + r(0.35) - r(0.27),   // низ лапок корпуса: отсюда патрубок расширяется конусом
      Dd: r(1.25),           // диаметр трубы вверху конуса
      zp: hs + r(0.90),      // верх внутренней трубы (начало воронки)
      zf: hs + r(1.20),      // воронка упирается в стенку корпуса
      zc: hs + r(1.40),      // низ воротника зонта
      zu: hs + r(1.45),      // кромка зонта
      za: hs + r(1.72),      // вершина зонта (чуть ниже кромки корпуса)
      zt: hs + r(1.75),      // верхняя кромка корпуса = общая высота H
      rr: Math.min(SET.zigH * 0.8, D * 0.03),   // радиус валика
    };
  },
  calc(p) {
    const q = this.parts(p), D = p.D;
    const frus = (d1, d2, h) => PI * (d1 + d2) / 2 * Math.hypot(h, (d2 - d1) / 2);
    const pipe = PI * D * q.zl + frus(D, q.Dd, q.zp - q.zl), funnel = frus(q.Dd, q.D1, q.zf - q.zp), body = PI * q.D1 * (q.zt - q.zk);
    const umb = frus(0, q.D2, q.za - q.zu) + PI * q.D2 * (q.zu - q.zc), legs = 8 * 30 * 0.48 * D;   // 4 лапки зонта + 4 лапки корпуса, полоса 30 мм
    const a = m2(pipe + funnel + body + umb + legs);
    return res(a, wt(a, p.t), [`Патрубок ${n1(PI * D)} × ${n1(q.zl)} мм, выше расширяется конусом до Ø${n1(q.Dd)} (патрубок снизу ${n1(q.hs)} мм)`,
      `Корпус: Ø${n1(q.D1)} × ${n1(q.zt - q.zk)} мм, по валику у каждого края, снизу открыт, внутри воронка диффузора`,
      `Зонт Ø${n1(q.D2)} мм на 4 лапках, ещё 4 лапки держат корпус (полоса 30 мм)`, `Общая высота H = ${n1(q.zt)} мм (пропорции от D по чертежу)`]);
  },
  build(p) {
    const q = this.parts(p), g = new THREE.Group(), D = p.D, rd = d => ({ t: 'round', d });
    put(g, tube(rd(D), 0, q.zl)); cone(g, D / 2, q.zl, q.Dd / 2, q.zp); if (q.hs > SET.zig) zig(g, D / 2, SET.zig);            // патрубок + внутренняя труба
    cone(g, q.Dd / 2, q.zp, q.D1 / 2 - 8, q.zf);                                               // воронка диффузора (кромка чуть внутри стенки)
    put(g, tube(rd(q.D1), q.zk, q.zt));                                                     // корпус
    [0.14].forEach(k => bead(g, q.D1 / 2, q.zt - k * D, q.rr));                            // валик у верхней кромки
    [0.12].forEach(k => bead(g, q.D1 / 2, q.zk + k * D, q.rr));                            // …и у нижней
    for (let i = 0; i < 4; i++) {                                                           // лапки корпуса: от нижней кромки к трубе
      const a = 2 * PI * i / 4, P = (r, z) => V(r * Math.cos(a), r * Math.sin(a), z);
      const p1 = P(q.D1 / 2 - 4, q.zk + 0.04 * D), p2 = P(D / 2 + 2, q.zk - 0.27 * D), dv = p2.clone().sub(p1);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.11 * D, 3, dv.length()), mat(COL.dark));   // плоская лапка шириной ≈ 0,11 D
      m.position.copy(p1).add(p2).multiplyScalar(0.5); const zz = dv.clone().normalize(), xx = V(-Math.sin(a), Math.cos(a), 0);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, zz.clone().cross(xx), zz)); g.add(m);
    }
    bead(g, D / 2, q.zk - 0.27 * D, q.rr);
    bead(g, q.D1 / 2, q.zt - q.rr * 0.5, q.rr * 1.3);                                       // закатанная кромка
    put(g, tube(rd(q.D2), q.zc, q.zu));                                                     // воротник зонта
    cone(g, q.D2 / 2, q.zu, 0, q.za);                                                       // зонт
    const rb = Math.max(2.5, D * 0.01), rA = q.D2 / 2 - rb * 1.5, rC = q.Dd / 2 + 0.03 * D;
    for (let i = 0; i < 4; i++) {                                                           // S-образные лапки зонта
      const a = PI / 4 + PI / 2 * i, P = (r, z) => V(r * Math.cos(a), r * Math.sin(a), z);
      const pts = [P(rA, q.zu - 0.02 * D), P(rA, q.zu - 0.14 * D), P(rC, q.zp + 0.09 * D), P(rC, q.zp + 0.01 * D)];
      for (let j = 0; j < 3; j++) g.add(rod(pts[j], pts[j + 1], rb));
    }
    return g;
  },
});

/* 8. Выброс 45° с сеткой */
def({
  id: 'exhaust45', name: 'Выброс 45° с сеткой', up: true,
  fields: [numF('D', 'Диаметр D, мм', 315), numF('H', 'Высота короткой (нижней) стороны H, мм', 100)],
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

/* 9. Реактивное сопло (факельный выброс): патрубок D, нижний конус до самого широкого места Dm, верхний конус сужается к выходу d с сеткой,
   сбоку трубка дренажа. L — полная высота от низа патрубка. */
def({
  id: 'nozzle', name: 'Реактивное сопло', up: true,
  fields: [numF('D', 'Диаметр патрубка D, мм', 315), numF('hs', 'Длина патрубка, мм', 100, 0), numF('Dm', 'Диаметр в самом широком месте, мм', 600),
    numF('d', 'Диаметр выхода d (с сеткой), мм', 500), numF('L', 'Полная высота L, мм', 650)],
  label: p => `Реактивное сопло Ø${p.D}→Ø${p.d}, L=${p.L}`,
  parts(p) {
    const hs = p.hs === undefined || p.hs === '' ? 100 : Math.max(0, +p.hs || 0), Dm = +p.Dm || Math.round(1.8 * p.D), rest = Math.max(10, p.L - hs), h1 = Math.round(rest * 0.45);
    return { hs, Dm, z1: hs + h1, h1, h2: rest - h1 };
  },
  calc(p) {
    const q = this.parts(p), frus = (d1, d2, h) => PI * (d1 + d2) / 2 * Math.hypot(h, (d2 - d1) / 2);
    const mesh = m2(PI * p.d * p.d / 4), rf = 0.32 * q.Dm, a = m2(PI * p.D * q.hs + frus(p.D, q.Dm, q.h1) + frus(q.Dm, p.d, q.h2) + frus(16, 2 * rf, q.h1 * 0.45));
    return res(a, wt(a, p.t) + mesh * SET.meshW + 0.1, [`Патрубок Ø${p.D} × ${n1(q.hs)} мм`, `Нижний конус Ø${p.D}→Ø${n1(q.Dm)}, высота ${n1(q.h1)} мм`, `Верхний конус Ø${n1(q.Dm)}→Ø${p.d}, высота ${n1(q.h2)} мм`,
      `Сетка на выходе Ø${p.d}: ${(mesh).toFixed(3)} м²; внутри воронка слива и дренажная трубка; вес сетки и трубки включён`]);
  },
  build(p) {
    const q = this.parts(p), g = new THREE.Group(), rd = d => ({ t: 'round', d });
    put(g, tube(rd(p.D), 0, q.hs)); if (q.hs > SET.zig) zig(g, p.D / 2, SET.zig);
    cone(g, p.D / 2, q.hs, q.Dm / 2, q.z1); cone(g, q.Dm / 2, q.z1, p.d / 2, p.L);
    bead(g, q.Dm / 2, q.z1, Math.min(SET.zigH * 0.6, p.D * 0.02));
    g.add(gridLines(rd(p.d), () => p.L, p.d / 14));
    bead(g, p.D / 2, q.hs - 15, Math.min(SET.zigH * 0.8, p.D * 0.02));   // бандаж на патрубке
    const rw = z => p.D / 2 + (q.Dm - p.D) / 2 * (z - q.hs) / q.h1, rf = 0.32 * q.Dm, zb = q.hs + q.h1 * 0.35, zr = q.hs + q.h1 * 0.8;   // воронка слива внутри
    cone(g, 8, zb, rf, zr);
    for (let i = 0; i < 3; i++) { const a = 2 * PI * i / 3 + 0.6; g.add(rod(V(rf * Math.cos(a), rf * Math.sin(a), zr), V((rw(zr) - 3) * Math.cos(a), (rw(zr) - 3) * Math.sin(a), zr), 3)); }
    const zw = q.hs + q.h1 * 0.12, pts = [V(0, 0, zb), V(0, 0, zb - 20), V(rw(zw) - 2, 0, zw), V(rw(zw) + 55, 0, zw - 22)];   // дренаж из воронки наружу
    for (let j = 0; j < 3; j++) g.add(rod(pts[j], pts[j + 1], 5, 0xd9d2c5));
    return g;
  },
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
  fields: [numF('D', 'Диаметр воздуховода D, мм', 315), numF('w', 'Ширина ленты, мм', 40),
    selF('hang', 'Подвес', [['m8', 'Шпилька М8 сверху'], ['none', 'Без подвеса']], 'm8'),
    numF('hl', 'Длина шпильки М8, мм', 120, 10, p => p.hang === 'm8')],
  label: p => `Хомут Ø${p.D}, лента ${p.w} мм, стяжка болтом М8` + (p.hang === 'm8' ? `, подвес шпилька М8 L=${p.hl}` : ''),
  calc(p) {
    const len = PI * (p.D + 2 * p.t) + 80, a = m2(len * p.w), stud = p.hang === 'm8' ? PI * 0.004 ** 2 * (p.hl / 1000) * SET.density + 0.012 : 0;
    const dev = [`Лента: ${n1(len)} × ${p.w} мм (с ушками 2×40), δ=${p.t}`, 'Стяжка болтом М8×40 с гайкой и шайбами, вес 0,05 кг'];
    if (p.hang === 'm8') dev.push(`Подвес: шпилька М8 длиной ${p.hl} мм и приваренная гайка, вес ${n1(stud * 1000)} г`);
    return res(a, wt(a, p.t) + 0.05 + stud, dev);
  },
  build(p) {
    /* лента разомкнута сбоку (+X); концы ленты загнуты наружу двумя ушками, они стоят напротив друг друга вдоль окружности
       (по вертикали), болт М8 идёт поперёк ушек; сверху (+Y) приварена гайка и вкручена шпилька М8 для подвеса */
    const g = new THREE.Group(), r = p.D / 2 + p.t, w = p.w, gap = 10, tt = 3, lug = 26, ae = (gap / 2) / r, n = 140, pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const ang = ae + (2 * PI - 2 * ae) * i / n, c = r * Math.cos(ang), sn = r * Math.sin(ang);
      pos.push(c, sn, -w / 2, c, sn, w / 2);
    }
    for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const band = new THREE.BufferGeometry(); band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); band.setIndex(idx); band.computeVertexNormals();
    put(g, band);
    [-1, 1].forEach(sg => { const l = new THREE.Group(); put(l, new THREE.BoxGeometry(lug, tt, w), { flat: true }); l.position.set(r + lug / 2 - 1, sg * (gap / 2 + tt / 2), 0); g.add(l); });
    const bx = r + lug * 0.55, ext = gap / 2 + tt, bolt = mat(0x56657a);   // болт М8: стержень Ø8, шестигранные головка и гайка, шайбы
    g.add(rod(V(bx, -ext - 6, 0), V(bx, ext + 8, 0), 4, 0x56657a));
    const hex = (rad, h, y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h, 6), bolt); m.position.set(bx, y, 0); g.add(m); };
    const washer = y => { const m = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 1.6, 20), mat(COL.steel)); m.position.set(bx, y, 0); g.add(m); };
    washer(-ext - 0.8); hex(7.5, 5.3, -ext - 1.6 - 2.65); washer(ext + 0.8); hex(7.5, 6.5, ext + 1.6 + 3.25);
    if (p.hang === 'm8') {   // подвес: гайка М8 на верхней точке ленты и шпилька с резьбой
      const nutH = 6.5, y0 = r - 0.5;
      const nm = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, nutH, 6), bolt); nm.position.set(0, y0 + nutH / 2, 0); g.add(nm);
      g.add(rod(V(0, y0 - 2, 0), V(0, r + p.hl, 0), 4, 0xaab5c4));
      const pts = [], pitch = 1.25, steps = Math.round(p.hl / pitch) * 8;   // видимая резьба: винтовая линия с шагом 1,25 мм
      for (let i = 0; i <= steps; i++) { const y = y0 + nutH + (p.hl - nutH) * i / steps, a = 2 * PI * (y / pitch); pts.push(V(4.2 * Math.cos(a), y, 4.2 * Math.sin(a))); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: VIEW.style === 'draw' ? 0x111111 : 0x3f4c5e })));
    }
    return g;
  },
});

/* 15. Зонт вытяжной кухонный */
def({
  id: 'hood', name: 'Зонт вытяжной кухонный', up: true,
  fields: [selF('kind', 'Вид зонта', [['wall', 'Пристенный'], ['island', 'Островной']], 'wall'),
    numF('A', 'Ширина A (по низу), мм', 1000), numF('B', 'Глубина B (по низу), мм', 800), numF('H', 'Высота зонта H, мм', 350),
    selF('ns', 'Патрубок', SH, 'round'),
    numF('D', 'Диаметр патрубка, мм', 315, 20, p => p.ns === 'round'),
    numF('a', 'Патрубок A, мм', 400, 20, p => p.ns === 'rect'), numF('b', 'Патрубок B, мм', 300, 20, p => p.ns === 'rect'),
    numF('hn', 'Высота патрубка, мм', 120), numF('hs', 'Борт по низу, мм', 30),
    selF('flt', 'Жироулавливающие фильтры', [['yes', 'Показать (отдельной позицией)'], ['no', 'Нет']], 'yes')],
  label: p => `Зонт вытяжной ${p.kind === 'wall' ? 'пристенный' : 'островной'} ${p.A}×${p.B}×${p.H}, патрубок ${p.ns === 'round' ? 'Ø' + p.D : p.a + '×' + p.b}`,
  dimsOf(p) {   // пристенный: задняя стенка вертикальная (y = +B/2), остальные грани наклонные; островной: все четыре грани наклонные
    const wall = p.kind === 'wall', neck = p.ns === 'round' ? { t: 'round', d: p.D } : { t: 'rect', a: p.a, b: p.b }, nw = neck.t === 'round' ? neck.d : neck.a, nb = neck.t === 'round' ? neck.d : neck.b;
    const ia = Math.min(0.45 * p.H, 0.22 * p.A), a2 = Math.max(p.A - 2 * ia, nw + 60);
    const b2 = wall ? Math.max(p.B * 0.5, nb + 60) : Math.max(p.B - 2 * Math.min(0.45 * p.H, 0.22 * p.B), nb + 60), oy = wall ? p.B / 2 - b2 / 2 : 0;
    return { wall, neck, bot: { t: 'rect', a: p.A, b: p.B }, top: { t: 'rect', a: a2, b: b2 }, oy, zt: p.hs + p.H };
  },
  geoms(p) {
    const d = this.dimsOf(p);
    return Object.assign(d, { skirt: tube(d.bot, 0, p.hs), body: loft(d.bot, p.hs, d.top, d.zt, 0, d.oy), cap: capGeom(profilePts(d.top, d.zt, 0, d.oy)), neckT: tube(d.neck, d.zt, d.zt + p.hn) });
  },
  nFilters(p) { return Math.ceil((p.A - 30) / 500) * (p.kind === 'wall' ? 1 : 2); },
  calc(p) {
    const q = this.geoms(p), a = m2(geomArea(q.skirt) + geomArea(q.body) + (areaCS(q.top) - areaCS(q.neck)) + geomArea(q.neckT));
    return res(a, wt(a, p.t), [`Борт: ${n1(perim(q.bot))} × ${p.hs} мм`, `Корпус: из ${p.A}×${p.B} в ${n1(q.top.a)}×${n1(q.top.b)}, высота ${p.H} мм, ${q.wall ? 'задняя стенка вертикальная' : 'все грани наклонные'}`,
      `Верх: ${n1(q.top.a)}×${n1(q.top.b)} с отверстием под патрубок ${dimStr(q.neck)}`, `Патрубок: ${n1(perim(q.neck))} × ${p.hn} мм`,
      `Жироулавливающие фильтры: ${this.nFilters(p)} шт. (500 мм), в расчёт не включены`]);
  },
  build(p) {
    const q = this.geoms(p), g = new THREE.Group();
    put(g, q.skirt, { flat: true }); put(g, q.body, { flat: true }); put(g, q.cap, { flat: true });
    const n = new THREE.Group(); n.position.set(0, q.oy, 0); g.add(n);
    put(n, q.neckT, { flat: q.neck.t === 'rect' }); if (q.neck.t === 'round' && p.hn > SET.zig) zig(n, q.neck.d / 2, q.zt + p.hn - SET.zig);
    if (p.flt === 'yes') {   // блок жироулавливающих фильтров в нижней части наклонной грани: пристенный — спереди, островной — с обеих длинных сторон
      const ia = (p.A - q.top.a) / 2, hw = z => p.A / 2 - ia * (z - p.hs) / p.H - 14, dark = VIEW.style === 'draw' ? 0x111111 : 0x2d3b4a;
      const slope = sg => sg < 0 ? (q.oy - q.top.b / 2 + p.B / 2) : (p.B / 2 - (q.oy + q.top.b / 2)), yAt = (sg, z, o = 1.5) => sg * (p.B / 2) - sg * (z - p.hs) / p.H * slope(sg) + sg * o;
      (q.wall ? [-1] : [-1, 1]).forEach(sg => {
        const z0 = p.hs + 12, z1 = p.hs + 0.55 * p.H, w0 = hw(z0), w1 = hw(z1);
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-w0, yAt(sg, z0), z0, w0, yAt(sg, z0), z0, w1, yAt(sg, z1), z1, -w1, yAt(sg, z1), z1], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
        g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: VIEW.style === 'draw' ? 0xdfe4ea : 0x7d8a9a, side: THREE.DoubleSide })));
        const nl = Math.max(8, Math.floor(2 * w0 / 22)), pos = []; for (let i = 0; i <= nl; i++) { const u = i / nl; pos.push(-w0 + 2 * w0 * u, yAt(sg, z0, 4), z0, -w1 + 2 * w1 * u, yAt(sg, z1, 4), z1); }
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: dark })));
      });
    }
    return g;
  },
});

/* Зонт крышный прямоугольный: прямоугольный патрубок, сверху четырёхскатная крыша на четырёх стойках с вылетом ov */
def({
  id: 'roofsq', name: 'Зонт крышный прямоугольный', up: true,
  fields: [numF('a', 'Патрубок A, мм', 500, 20), numF('b', 'Патрубок B, мм', 400, 20), numF('hn', 'Высота патрубка, мм', 100), numF('gap', 'Зазор под крышей, мм', 80),
    numF('ov', 'Вылет крыши с каждой стороны, мм', 100), numF('hr', 'Высота крыши, мм', 120)],
  label: p => `Зонт крышный прямоугольный ${p.a}×${p.b}, крыша ${p.a + 2 * p.ov}×${p.b + 2 * p.ov}×${p.hr}`,
  geoms(p) {
    const neck = { t: 'rect', a: p.a, b: p.b }, base = { t: 'rect', a: p.a + 2 * p.ov, b: p.b + 2 * p.ov }, top = { t: 'rect', a: Math.max(20, base.a * 0.12), b: Math.max(20, base.b * 0.12) }, zb = p.hn + p.gap;
    return { neck, base, top, zb, roof: loft(base, zb, top, zb + p.hr), neckT: tube(neck, 0, p.hn) };
  },
  calc(p) {
    const q = this.geoms(p), legs = 4 * 25 * (p.gap + p.hr * 0.5), a = m2(geomArea(q.neckT) + geomArea(q.roof) + legs);
    return res(a, wt(a, p.t), [`Патрубок: ${n1(perim(q.neck))} × ${p.hn} мм`, `Крыша: ${n1(q.base.a)}×${n1(q.base.b)} мм по низу, высота ${p.hr} мм, четырёхскатная`, 'Стойки: 4 полосы 25 мм, в расчёт включены']);
  },
  build(p) {
    const q = this.geoms(p), g = new THREE.Group(), hx2 = q.base.a / 2, hy2 = q.base.b / 2, tx = q.top.a / 2, ty = q.top.b / 2;
    put(g, q.neckT, { flat: true }); put(g, q.roof, { flat: true }); put(g, capGeom(profilePts(q.top, q.zb + p.hr)), { flat: true, edges: false });
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sy]) => {
      const x = sx * p.a / 2, y = sy * p.b / 2, k = Math.min((hx2 - Math.abs(x)) / (hx2 - tx), (hy2 - Math.abs(y)) / (hy2 - ty));
      g.add(rod(V(x, y, p.hn), V(x, y, q.zb + p.hr * Math.max(0, Math.min(1, k))), 4));
    });
    return g;
  },
});

/* Колпак-жалюзи круглый: патрубок, корпус из наклонных ламелей (скат вниз-наружу), сверху крышка-конус */
def({
  id: 'louver', name: 'Колпак-жалюзи', up: true,
  fields: [numF('D', 'Диаметр патрубка D, мм', 315), numF('hs', 'Длина патрубка, мм', 100, 0), numF('Dc', 'Диаметр колпака, мм', 450), numF('nl', 'Число ламелей, шт.', 7, 2), numF('pt', 'Шаг ламелей, мм', 45, 15)],
  label: p => `Колпак-жалюзи Ø${p.D}, колпак Ø${p.Dc}, ламелей ${p.nl}`,
  calc(p) {
    const frus = (d1, d2, h) => PI * (d1 + d2) / 2 * Math.hypot(h, (d2 - d1) / 2), Rin = p.Dc - 24, Rout = p.Dc + 24, hb = p.nl * p.pt + 10, hl = p.Dc * 0.18;
    const a = m2(PI * p.D * p.hs + p.nl * frus(Rin, Rout, p.pt * 0.9) + frus(p.Dc + 60, 0, hl) + PI * Rin * hb + PI * Rin * Rin / 4);
    return res(a, wt(a, p.t), [`Патрубок Ø${p.D} × ${p.hs} мм`, `Ламели: ${p.nl} шт., шаг ${p.pt} мм, скат вниз-наружу`, `Внутренний корпус Ø${n1(p.Dc - 24)} × ${n1(hb)} мм, крышка-конус Ø${p.Dc + 60}`]);
  },
  build(p) {
    const g = new THREE.Group(), rd = d => ({ t: 'round', d }), hb = p.nl * p.pt + 10, z0 = p.hs;
    put(g, tube(rd(p.D), 0, p.hs)); if (p.hs > SET.zig) zig(g, p.D / 2, SET.zig);
    put(g, tube(rd(p.Dc - 24), z0, z0 + hb), { color: COL.dark });
    for (let i = 0; i < p.nl; i++) { const zt = z0 + 10 + (i + 1) * p.pt; cone(g, (p.Dc - 24) / 2, zt, (p.Dc + 24) / 2, zt - p.pt * 0.9); }
    cone(g, (p.Dc + 60) / 2, z0 + hb, 0, z0 + hb + p.Dc * 0.18);
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
  fields: [selF('shape', 'Сечение', SH, 'rect'), ...dims('', '', 'shape', 500, 500, 300), numF('L', 'Длина ткани L, мм', 200),
    numF('lk', 'Металлические обечайки по краям, мм', 45, 0, p => p.shape === 'round'),
    { k: 'fg', l: 'Фланец (шинорейка)', sel: [['S20', 'Фланец S20'], ['S30', 'Фланец S30'], ['none', 'Без фланца']], v: 'S20', show: p => p.shape === 'rect' }],
  label: p => `Гибкая вставка ${p.shape === 'round' ? 'круглая' : 'прямоугольная'} ${dimStr(shapeOf(p))}, ` + (p.shape === 'round' ? `${p.lk}×${p.L}×${p.lk} (L=${p.L + 2 * p.lk})` : `L=${p.L}`) + `${p.fg && p.fg !== 'none' && p.shape === 'rect' ? ', фланец ' + p.fg : ''}`,
  calc(p) {
    const s = shapeOf(p), fab = m2(perim(s) * p.L);
    if (s.t === 'round') {
      const col = m2(2 * perim(s) * p.lk);
      return res(fab + col, fab * 0.6 + wt(col, p.t), [`Ткань: ${n1(perim(s))} × ${p.L} мм (${num(fab)} м²), вес ткани 0,6 кг/м²`,
        `Обечайки: 2 × ${n1(perim(s))} × ${p.lk} мм из металла (${num(col)} м²)`, `Общая длина ${p.L + 2 * p.lk} мм (${p.lk}×${p.L}×${p.lk})`, 'Цену задайте в КП вручную']);
    }
    return res(fab, fab * 0.6, [`Ткань: ${n1(perim(s))} × ${p.L} мм (${num(fab)} м²), вес ткани 0,6 кг/м²`, 'Цену задайте в КП вручную']);
  },
  build(p) {
    const g = new THREE.Group(), s = shapeOf(p), h = p.L / 2, n = Math.max(4, Math.round(p.L / 25)), rings = [], round = s.t === 'round';
    for (let i = 0; i <= n; i++) {
      const z = -h + p.L * i / n, k = i % 2 ? 1 : 0, q = k ? shrink(s, round ? 1.5 : 6) : s;
      rings.push(profilePts(q, z));
    }
    put(g, ringsGeom(rings), { flat: isFlat(s), color: VIEW.style === 'draw' ? 0xeceff3 : (round ? 0x4a4d5a : 0x2d3138) });
    if (round && p.lk > 0) {   // металлические обечайки с закатанным краем и зигом у ткани
      [-1, 1].forEach(sg => {
        const z0 = sg * h, z1 = sg * (h + p.lk);
        put(g, tube(s, Math.min(z0, z1), Math.max(z0, z1)));
        const nt = Math.min(140, Math.round(PI * s.d / 12));   // зубчатое обжимное кольцо ткани у обечайки
        for (let i = 0; i < nt; i++) {
          const th = 2 * PI * i / nt, tooth = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 5), mat(0xa9b4c1));
          tooth.position.set((s.d / 2 + 1.5) * Math.cos(th), (s.d / 2 + 1.5) * Math.sin(th), sg * (h + 3)); tooth.rotation.z = th; g.add(tooth);
        }
      });
    }
    if (p.shape === 'rect' && p.fg && p.fg !== 'none') { drawFlange(g, s, at(0, 0, -h, PI), p.fg); drawFlange(g, s, at(0, 0, h, 0), p.fg); }
    return g;
  },
});
const shrink = (s, d) => (s.t === 'round' ? { t: 'round', d: s.d - 2 * d } : { t: 'rect', a: s.a - 2 * d, b: s.b - 2 * d });

/* 20. Врезка: ровная или седло под трубу (круглая и прямоугольная) с отбортовкой по контуру.
   Труба лежит вдоль оси X: у прямоугольной врезки сторона A идёт вдоль трубы, B — поперёк (по окружности). */
const tapDepth = (r, y) => r - Math.sqrt(Math.max(0, r * r - y * y));   // на сколько поверхность трубы уходит вниз на расстоянии y от верхней линии
const tapZ = (p, v) => (p.end === 'saddle' ? -tapDepth(p.Dm / 2, Math.min(Math.abs(v.y), p.Dm / 2)) : 0);
def({
  id: 'tap', name: 'Врезка',
  fields: [selF('shape', 'Сечение', SH, 'round'), ...dims('', '', 'shape', 200, 300, 200),
    selF('end', 'Торец', [['flat', 'Ровная'], ['saddle', 'Седло (в трубу)']], 'flat'),
    numF('Lb', 'Высота врезки, мм', 80), numF('ob', 'Отбортовка, мм', 10, 0), numF('Dm', 'Диаметр трубы, мм', 315, 50, p => p.end === 'saddle')],
  label: p => `Врезка ${p.shape === 'round' ? 'круглая' : 'прямоугольная'} ${dimStr(shapeOf(p))}, ${p.end === 'saddle' ? 'седло в трубу Ø' + p.Dm : 'ровная'}, h=${p.Lb}, отбортовка ${p.ob}`,
  geom(p) {
    const s = shapeOf(p), bot = profilePts(s, 0), top = profilePts(s, p.Lb);
    bot.forEach(v => { v.z = tapZ(p, v); });
    const lip = p.ob > 0 ? profilePts(grow(s, p.ob), 0) : null;
    if (lip) lip.forEach(v => { v.z = tapZ(p, v); });
    return { body: ringsGeom([bot, top]), lip: lip ? ringsGeom([bot, lip]) : null };
  },
  calc(p) {
    const s = shapeOf(p), r = p.Dm / 2, G = this.geom(p), a = m2(geomArea(G.body) + (G.lip ? geomArea(G.lip) : 0));
    const dev = [`Врезка: ${n1(perim(s))} × ${p.Lb} мм по короткой стороне`, `Отбортовка по контуру: ${p.ob} мм`];
    if (p.end === 'saddle') {
      const y = (s.t === 'round' ? s.d : s.b) / 2;
      dev.push(`Седло под трубу Ø${p.Dm}, развёрнуто по трубе: глубина выреза ${n1(tapDepth(r, Math.min(y, r)))} мм`);
      if (y > r) dev.push('⚠ Врезка шире трубы — уменьшите размер');
    } else dev.push('Торец ровный (на плоскую стенку)');
    return res(a, wt(a, p.t), dev);
  },
  build(p) {
    const g = new THREE.Group(), s = shapeOf(p), G = this.geom(p);
    put(g, G.body, { flat: isFlat(s) });
    if (G.lip) put(g, G.lip, { flat: true, color: VIEW.style === 'draw' ? 0xf4f6f9 : 0x8fa7bf });
    if (s.t === 'round' && p.Lb > SET.zig + 10) zig(g, s.d / 2, p.Lb - SET.zig);   // зиг от свободного края врезки
    if (p.end === 'saddle') {
      const r = p.Dm / 2, len = (s.t === 'round' ? s.d : s.a) + 200;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 64, 1, true), mat(COL.steel, { transparent: true, opacity: 0.28, depthWrite: false }));
      pipe.rotation.z = PI / 2; pipe.position.set(0, 0, -r); g.add(pipe);   // ось трубы вдоль X
    }
    return g;
  },
});

/* общие помощники для интерфейса */
function defaultsOf(type) {
  const p = {};
  type.fields.forEach(f => { p[f.k] = f.v; });
  Object.assign(p, type.fixed || {});
  p.t = type.t0 || SET.t;
  return p;
}
