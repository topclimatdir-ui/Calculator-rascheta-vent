/* Фланец из шинорейки S20 / S30 на прямоугольных концах — опция.
   Квадратура с фланцем = квадратура изделия + шинорейка из штрипса (по умолчанию 88 мм × 0,5 мм).
   На каждый фланец: 4 отрезка шинорейки (по сторонам сечения) и 4 уголка. Крепёж не входит. */
'use strict';
const T4 = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const RY = a => new THREE.Matrix4().makeRotationY(a);
const at = (x, y, z, a) => T4(x, y, z).multiply(RY(a));   // торец: позиция + поворот вокруг Y, ось z — наружу

/* где стоят фланцы: [{ s: сечение, m: матрица торца (z — наружу) }] */
const PLACE = {
  box(p) { const s = shapeOf(p); return [{ s, m: at(0, 0, -p.L / 2, PI) }, { s, m: at(0, 0, p.L / 2, 0) }]; },
  elbow(p) {
    const s = shapeOf(p); if (s.t !== 'rect') return [];
    const al = p.ang * PI / 180, R = elbowR(p), e = p.ends, E = [R * (1 - Math.cos(al)), R * Math.sin(al)], t = [Math.sin(al), Math.cos(al)];
    return [{ s, m: at(0, 0, -e, PI) }, { s, m: at(E[0] + t[0] * e, 0, E[1] + t[1] * e, al) }];
  },
  transition(p) {
    const s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'), o = offs(p), out = [], l = p.fl || 0;
    if (s1.t === 'rect') out.push({ s: s1, m: at(0, 0, -l, PI) });
    if (s2.t === 'rect') out.push({ s: s2, m: at(o.ox, o.oy, p.L + l, 0) });
    return out;
  },
  tee(p) {
    const s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'), out = [];
    if (s1.t === 'rect' && p.kind !== 'saddle') out.push({ s: s1, m: at(0, 0, -p.L / 2, PI) }, { s: s1, m: at(0, 0, p.L / 2, 0) });
    if (s2.t === 'rect') teeAngles(p).forEach(a => out.push({ s: s2, m: teeFrame(p, a).multiply(T4(0, 0, teeBranch(p, a).tTop)) }));
    return out;
  },
  throttle(p) { const s = shapeOf(p); return s.t === 'rect' ? [{ s, m: at(0, 0, -p.L / 2, PI) }, { s, m: at(0, 0, p.L / 2, 0) }] : []; },
  checkv(p) { return PLACE.throttle(p); },
  cap(p) { const s = shapeOf(p); return s.t === 'rect' ? [{ s, m: at(0, 0, p.h, 0) }] : []; },
  mesh(p) { const s = shapeOf(p); return s.t === 'rect' ? [{ s, m: at(0, 0, 0, PI) }] : []; },
  silrect(p) { const s = { t: 'rect', a: p.A, b: p.B }, h = p.L / 2 + 40; return [{ s, m: at(0, 0, -h, PI) }, { s, m: at(0, 0, h, 0) }]; },
  filterbox(p) {
    const c = shapeOf(p, '', 'cs'); if (c.t !== 'rect') return [];
    const h = p.L / 2 + (p.fl || 0); return [{ s: c, m: at(0, 0, -h, PI) }, { s: c, m: at(0, 0, h, 0) }];
  },
  tap(p) { const s = shapeOf(p); return s.t === 'rect' ? [{ s, m: at(0, 0, p.Lb, 0) }] : []; },
  hood(p) { return p.ns === 'rect' ? [{ s: { t: 'rect', a: p.a, b: p.b }, m: at(0, 0, p.hs + p.H + p.hn, 0) }] : []; },
  flex(p) { const s = shapeOf(p); return s.t === 'rect' ? [{ s, m: at(0, 0, -p.L / 2, PI) }, { s, m: at(0, 0, p.L / 2, 0) }] : []; },
};
const FL_SHOW = {
  box: () => true, elbow: p => p.shape === 'rect', transition: p => p.s1 === 'rect' || p.s2 === 'rect', tee: p => p.s1 === 'rect' || p.s2 === 'rect',
  throttle: p => p.shape === 'rect', checkv: p => p.shape === 'rect', cap: p => p.shape === 'rect', mesh: p => p.shape === 'rect', tap: p => p.shape === 'rect', silrect: () => true, filterbox: p => p.cs === 'rect', hood: p => p.ns === 'rect',
};
const FL_OPTS = [['none', 'Без фланца'], ['S20', 'Фланец S20 (шинорейка)'], ['S30', 'Фланец S30 (шинорейка)']];
const flW = fg => (fg === 'S30' ? SET.sw30 : SET.sw20);

const FL_T = 5;   // толщина фланца из шинорейки, мм
function drawFlange(g, s, m, fg) {
  /* четыре рейки шинорейки вокруг торца (толщина FL_T) и четыре уголка с отверстиями по углам */
  const w = fg === 'S30' ? 30 : 20, grp = new THREE.Group(), draw = VIEW.style === 'draw';
  const railMat = () => mat(draw ? 0xeef1f5 : 0x8394a8), edge = () => new THREE.LineBasicMaterial({ color: draw ? 0x111111 : COL.edge });
  const box = (sx, sy, sz, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material); mesh.position.set(x, y, z); grp.add(mesh);
    const ln = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edge()); ln.position.copy(mesh.position); grp.add(ln);
    return mesh;
  };
  const a = s.a, b = s.b, zc = FL_T / 2, zt = FL_T;
  box(a + 2 * w, w, FL_T, 0, b / 2 + w / 2, zc, railMat()); box(a + 2 * w, w, FL_T, 0, -b / 2 - w / 2, zc, railMat());   // верхняя и нижняя рейки
  box(w, b, FL_T, a / 2 + w / 2, 0, zc, railMat()); box(w, b, FL_T, -a / 2 - w / 2, 0, zc, railMat());                  // боковые рейки
  const hr = fg === 'S30' ? 6 : 4.5, dark = new THREE.MeshBasicMaterial({ color: 0x1b222a, side: THREE.DoubleSide });
  [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) => {
    const cx = sx * (a / 2 + w / 2), cy = sy * (b / 2 + w / 2);
    box(w + 6, w + 6, 2, cx, cy, zt + 1, mat(draw ? 0xdfe5ec : 0x6d7d91));                                            // уголок
    const hole = new THREE.Mesh(new THREE.CircleGeometry(hr, 24), dark); hole.position.set(cx, cy, zt + 2.1); grp.add(hole);
  });
  grp.applyMatrix4(m); g.add(grp);
}

/* добавляет к результату расчёта квадратуру с фланцем */
function withFlange(type, p, r) {
  if (!type.place || !p.fg || p.fg === 'none') return r;
  const list = type.place(p); if (!list.length) return r;
  const perims = list.reduce((t, x) => t + perim(x.s), 0), w = flW(p.fg), n = list.length;
  const areaF = perims * w / 1e6, weightF = areaF * SET.stripT / 1000 * SET.density, f = x => x.toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return Object.assign({}, r, {
    areaSheet: r.area, area: r.area + areaF, weight: r.weight + weightF,
    flange: { type: p.fg, n, mp: perims / 1000, area: areaF, weight: weightF, corners: 4 * n, w },
    dev: [...r.dev,
      `Квадратура изделия ${f(r.area)} м² + фланец ${p.fg} ${f(areaF)} м² = ${f(r.area + areaF)} м²`,
      `Фланец ${p.fg}: ${n} шт., шинорейка из штрипса ${w}×${SET.stripT} мм — ${(perims / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} м.п.`,
      `Уголки ${p.fg}: ${4 * n} шт. (по 4 на фланец). Крепёж не входит`],
  });
}

TYPES.forEach(t => {
  if (!PLACE[t.id]) return;
  t.place = PLACE[t.id];
  if (t.id !== 'flex' && FL_SHOW[t.id]) {
    t.fields.push({ k: 'fg', l: 'Фланец (шинорейка)', sel: FL_OPTS, v: 'none', show: FL_SHOW[t.id] });
    const label = t.label, build = t.build, annot = t.annot;
    t.label = p => label.call(t, p) + (p.fg && p.fg !== 'none' && t.place(p).length ? ', фланец ' + p.fg : '');
    t.build = function (p) {
      const g = build.call(this, p);
      if (p.fg && p.fg !== 'none') t.place(p).forEach(x => drawFlange(g, x.s, x.m, p.fg));
      return g;
    };
    t.annot = p => {
      const out = annot ? annot(p) : [];
      if (p.fg && p.fg !== 'none') { const l = t.place(p); if (l.length) { const o = new THREE.Vector3().setFromMatrixPosition(l[0].m); out.push(lab(o.add(V(hx(l[0].s) + 70, hy(l[0].s) + 20, 0)), p.fg)); } }
      return out;
    };
  }
});
