/* Размерные линии на 3D-картинках: точки заданы в координатах модели (как в build()). */
'use strict';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lin = (a, b, off, txt) => ({ a, b, off, txt });
const lab = (pt, txt) => ({ pt, txt });
const hx = s => (s.t === 'round' ? s.d / 2 : s.a / 2), hy = s => (s.t === 'round' ? s.d / 2 : s.b / 2);
const kk = (...m) => Math.max(35, Math.min(160, Math.max(...m) * 0.18));

/* размеры сечения на торце z (центр ox, oy) */
function sec(s, z, k, ox = 0, oy = 0) {
  if (s.t === 'round') return [lin(V(ox - s.d / 2, oy, z), V(ox + s.d / 2, oy, z), V(0, -k, 0), 'Ø' + n1(s.d))];
  return [lin(V(ox - s.a / 2, oy - s.b / 2, z), V(ox + s.a / 2, oy - s.b / 2, z), V(0, -k, 0), 'a=' + n1(s.a)),
    lin(V(ox + s.a / 2, oy - s.b / 2, z), V(ox + s.a / 2, oy + s.b / 2, z), V(k, 0, 0), 'b=' + n1(s.b))];
}
function xf(list, m) {   // перенос размеров в другую систему координат
  return list.map(d => d.pt ? lab(d.pt.clone().applyMatrix4(m), d.txt)
    : lin(d.a.clone().applyMatrix4(m), d.b.clone().applyMatrix4(m), d.off.clone().transformDirection(m).multiplyScalar(d.off.length()), d.txt));
}

const ANN = {
  duct(p) {
    const s = shapeOf(p), k = kk(hx(s) * 2, hy(s) * 2), h = p.L / 2;
    return [...sec(s, h, k), lin(V(0, hy(s), -h), V(0, hy(s), h), V(0, k, 0), 'L=' + p.L)];
  },
  elbow(p) {
    const s = shapeOf(p), al = p.ang * PI / 180, dim = s.t === 'round' ? s.d : s.a, R = elbowR(p), e = p.ends, k = kk(dim, R);
    const E = V(R * (1 - Math.cos(al)), 0, R * Math.sin(al)), t = V(Math.sin(al), 0, Math.cos(al)), nn = V(Math.cos(al), 0, -Math.sin(al));
    const hm = al / 2, P = V(R * (1 - Math.cos(hm)), 0, R * Math.sin(hm)), nm = V(Math.cos(hm), 0, -Math.sin(hm));
    const M = new THREE.Matrix4().makeTranslation(E.x, 0, E.z).multiply(new THREE.Matrix4().makeRotationY(al));
    const out = xf(sec(s, e, k), M);
    if (e > 0) {
      out.push(lin(V(0, hy(s), -e), V(0, hy(s), 0), V(0, k, 0), String(e)));
      const a = E.clone().add(V(0, hy(s), 0));
      out.push(lin(a, a.clone().add(t.clone().multiplyScalar(e)), V(0, k, 0), String(e)));
    }
    out.push(lab(P.clone().add(nm.clone().multiplyScalar(dim / 2 + k * 1.3)).add(V(0, hy(s), 0)), `α=${p.ang}°`));
    out.push(lab(P.clone().sub(nm.clone().multiplyScalar(dim / 2 + k * 0.6)), s.t === 'rect' ? 'Rвн=' + n1(p.ri || 0) : 'R' + n1(R)));
    return out;
  },
  transition(p) {
    const s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'), k = kk(hx(s1) * 2, hx(s2) * 2, p.L * 0.6), o = offs(p), m = Math.max(hx(s1), hx(s2) + Math.abs(o.ox));
    const out = [...sec(s1, 0, k), ...sec(s2, p.L, k, o.ox, o.oy), lin(V(m, 0, 0), V(m, 0, p.L), V(k, 0, 0), 'L=' + p.L)];
    const nl = nipsOf(p);
    if (nl.length) {
      const zs = [0, p.L, ...nl.flatMap(n => [n.z0, n.z1])], z0 = Math.min(...zs), z1 = Math.max(...zs), ym = Math.max(hy(s1), hy(s2) + Math.abs(o.oy));
      out.push(lin(V(0, ym, z0), V(0, ym, z1), V(0, k * 1.1, 0), 'Lобщ=' + (z1 - z0)));
    }
    nl.forEach(n => out.push(lin(V(n.ox, n.oy + hy(n.s), n.z0), V(n.ox, n.oy + hy(n.s), n.z1), V(0, k, 0), String(n.len))));
    return out;
  },
  tee(p) {
    const s1 = shapeOf(p, '1', 's1'), s2 = shapeOf(p, '2', 's2'), h = teeL(p) / 2, k = kk(hx(s1) * 2, hx(s2) * 2);
    const out = [...sec(s1, h, k), lin(V(0, hy(s1), -h), V(0, hy(s1), h), V(0, k, 0), 'L=' + n1(teeL(p)))];
    teeAngles(p).forEach(a => {
      const tb = teeBranch(p, a), br = [...sec(s2, tb.tTop, k), lin(V(tb.ext.x, tb.ext.y, tb.ext.t), V(tb.ext.x, tb.ext.y, tb.tTop), V(0, k, 0), 'l=' + p.Lb)];
      out.push(...xf(br, teeFrame(p, a)));
    });
    out.push(lab(V(0, hy(s1) + k * 1.4, h * 0.6), '∠' + p.ang + '°'));
    return out;
  },
  throttle(p) {
    const s = shapeOf(p), k = kk(hx(s) * 2, hy(s) * 2), h = p.L / 2;
    return [...sec(s, h, k), lin(V(0, hy(s), -h), V(0, hy(s), h), V(0, k, 0), 'L=' + p.L)];
  },
  mushroom(p) {
    const Rk = p.kd * p.D / 2, hc = p.kh * p.D, zc = p.Hs + 0.25 * p.D, k = kk(p.D, Rk * 2);
    return [lin(V(-p.D / 2, 0, 0), V(p.D / 2, 0, 0), V(0, -k, 0), 'Ø' + p.D), lin(V(-Rk, 0, zc), V(Rk, 0, zc), V(0, -k, 0), 'Ø' + n1(2 * Rk)),
      lin(V(Rk, 0, 0), V(Rk, 0, zc + hc), V(k, 0, 0), 'H=' + n1(zc + hc))];
  },
  tsagi(p) {
    const q = TYPES.find(t => t.id === 'tsagi').parts(p), k = kk(p.D, q.D1);
    const out = [lin(V(-p.D / 2, 0, 0), V(p.D / 2, 0, 0), V(0, -k, 0), 'Ø' + p.D), lin(V(-q.D1 / 2, 0, q.zk), V(q.D1 / 2, 0, q.zk), V(0, -k, 0), 'Ø' + n1(q.D1)),
      lin(V(q.D1 / 2, 0, 0), V(q.D1 / 2, 0, q.zt), V(k, 0, 0), 'H=' + n1(q.zt))];
    if (q.hs > 0) out.push(lin(V(-p.D / 2, 0, 0), V(-p.D / 2, 0, q.hs), V(-k, 0, 0), String(q.hs)));
    return out;
  },
  exhaust45(p) {
    const k = kk(p.D);
    return [lin(V(-p.D / 2, 0, 0), V(p.D / 2, 0, 0), V(0, -k, 0), 'Ø' + p.D), lin(V(p.D / 2, 0, 0), V(p.D / 2, 0, p.H + p.D), V(k, 0, 0), 'H=' + p.H + ' … ' + (p.H + p.D))];
  },
  nozzle(p) {
    const q = TYPES.find(t => t.id === 'nozzle').parts(p), k = kk(p.D, q.Dm), R = Math.max(q.Dm, p.d) / 2;
    const out = [lin(V(-p.D / 2, 0, 0), V(p.D / 2, 0, 0), V(0, -k, 0), 'Ø' + p.D), lin(V(-q.Dm / 2, 0, q.z1), V(q.Dm / 2, 0, q.z1), V(0, -k, 0), 'Ø' + n1(q.Dm)),
      lin(V(-p.d / 2, 0, p.L), V(p.d / 2, 0, p.L), V(0, -k, 0), 'Ø' + p.d), lin(V(-R, 0, 0), V(-R, 0, p.L), V(-k, 0, 0), 'H=' + p.L)];
    if (q.hs > 0) out.push(lin(V(R, 0, 0), V(R, 0, q.hs), V(k, 0, 0), String(q.hs)));
    return out;
  },
  cap(p) {
    const s = shapeOf(p), k = kk(hx(s) * 2, hy(s) * 2);
    return [...sec(s, 0, k), lin(V(hx(s), 0, 0), V(hx(s), 0, p.h), V(k, 0, 0), String(p.h))];
  },
  mesh(p) { const s = shapeOf(p), k = kk(hx(s) * 2, hy(s) * 2); return [...sec(s, p.fw, k), lin(V(hx(s), 0, 0), V(hx(s), 0, p.fw), V(k, 0, 0), String(p.fw))]; },
  silround(p) {
    const Dk = p.D + 2 * p.s, h = p.L / 2, hb = h - p.st, k = kk(Dk);
    return [lin(V(-Dk / 2, 0, hb), V(Dk / 2, 0, hb), V(0, -k, 0), 'Ø' + Dk), lin(V(-p.D / 2, 0, h), V(p.D / 2, 0, h), V(0, -k * 1.8, 0), 'Ø' + p.D),
      lin(V(0, Dk / 2, -h), V(0, Dk / 2, h), V(0, k, 0), 'L=' + p.L), lin(V(Dk / 2, 0, -hb), V(Dk / 2, 0, hb), V(k, 0, 0), String(p.L - 2 * p.st))];
  },
  silrect(p) {
    const h = p.L / 2, k = kk(p.A, p.B);
    return [...sec({ t: 'rect', a: p.A, b: p.B }, h + 40, k), lin(V(0, p.B / 2, -h), V(0, p.B / 2, h), V(0, k, 0), 'L=' + p.L)];
  },
  clamp(p) {
    const r = p.D / 2 + p.t, k = kk(p.D), out = [lin(V(-r, 0, p.w / 2), V(r, 0, p.w / 2), V(0, -k, 0), 'Ø' + p.D), lin(V(-r, 0, -p.w / 2), V(-r, 0, p.w / 2), V(-k * 0.7, 0, 0), 'w=' + p.w)];
    if (p.hang === 'm8') out.push(lin(V(0, r, p.w / 2 + 12), V(0, r + p.hl, p.w / 2 + 12), V(0, 0, k * 0.6), 'М8 L=' + p.hl));
    return out;
  },
  roofsq(p) {
    const q = TYPES.find(t => t.id === 'roofsq').geoms(p), k = kk(q.base.a, q.base.b) * 0.8, H = q.zb + p.hr;
    return [lin(V(-q.base.a / 2, -q.base.b / 2, q.zb), V(q.base.a / 2, -q.base.b / 2, q.zb), V(0, -k, 0), 'A=' + q.base.a), lin(V(q.base.a / 2, -q.base.b / 2, q.zb), V(q.base.a / 2, q.base.b / 2, q.zb), V(k, 0, 0), 'B=' + q.base.b),
      lin(V(q.base.a / 2, q.base.b / 2, 0), V(q.base.a / 2, q.base.b / 2, H), V(k, 0, 0), 'H=' + H), ...sec(q.neck, 0, k)];
  },
  louver(p) {
    const k = kk(p.D, p.Dc), H = p.hs + p.nl * p.pt + 10 + p.Dc * 0.18, R = p.Dc / 2 + 30;
    return [lin(V(-p.D / 2, 0, 0), V(p.D / 2, 0, 0), V(0, -k, 0), 'Ø' + p.D), lin(V(-p.Dc / 2, 0, p.hs + 10), V(p.Dc / 2, 0, p.hs + 10), V(0, -k, 0), 'Ø' + p.Dc), lin(V(R, 0, 0), V(R, 0, Math.round(H)), V(k, 0, 0), 'H=' + Math.round(H))];
  },
  hood(p) {
    const q = TYPES.find(t => t.id === 'hood').dimsOf(p), k = kk(p.A, p.B) * 0.8, top = q.zt + p.hn;
    return [lin(V(-p.A / 2, -p.B / 2, 0), V(p.A / 2, -p.B / 2, 0), V(0, -k, 0), 'A=' + p.A), lin(V(p.A / 2, -p.B / 2, 0), V(p.A / 2, p.B / 2, 0), V(k, 0, 0), 'B=' + p.B),
      lin(V(p.A / 2, p.B / 2, 0), V(p.A / 2, p.B / 2, top), V(k, 0, 0), 'H=' + top), ...sec(q.neck, top, k * 0.8, 0, q.oy)];
  },
};
ANN.filterbox = function (p) {
  const { c, b } = TYPES.find(t => t.id === 'filterbox').body(p), h = p.L / 2, k = kk(b.a, b.b);
  return [...sec(c, h + p.fl, k), lin(V(0, b.b / 2, -h), V(0, b.b / 2, h), V(0, k, 0), 'L=' + p.L),
    lin(V(-b.a / 2, -b.b / 2, h), V(b.a / 2, -b.b / 2, h), V(0, -k * 1.9, 0), 'A=' + n1(b.a)), lin(V(b.a / 2, -b.b / 2, -h), V(b.a / 2, b.b / 2, -h), V(k, 0, 0), 'B=' + n1(b.b))];
};
ANN.cassette = p => { const k = kk(p.A, p.B); return [lin(V(-p.A / 2, -p.B / 2, p.th / 2), V(p.A / 2, -p.B / 2, p.th / 2), V(0, -k, 0), 'A=' + p.A), lin(V(p.A / 2, -p.B / 2, p.th / 2), V(p.A / 2, p.B / 2, p.th / 2), V(k, 0, 0), 'B=' + p.B), lin(V(p.A / 2, p.B / 2, -p.th / 2), V(p.A / 2, p.B / 2, p.th / 2), V(0, k, 0), String(p.th))]; };
ANN.pocketf = p => { const k = kk(p.A, p.B); return [lin(V(-p.A / 2, -p.B / 2, 12), V(p.A / 2, -p.B / 2, 12), V(0, -k, 0), 'A=' + p.A), lin(V(p.A / 2, -p.B / 2, 12), V(p.A / 2, p.B / 2, 12), V(k, 0, 0), 'B=' + p.B), lin(V(p.A / 2, p.B / 2, 12), V(p.A / 2, p.B / 2, 12 + p.pk), V(0, k, 0), 'L=' + p.pk)]; };
ANN.flex = function (p) {
  const s = shapeOf(p), k = kk(hx(s) * 2, hy(s) * 2), h = p.L / 2;
  if (s.t === 'round') {
    const e = h + p.lk;
    return [...sec(s, e, k), lin(V(0, hy(s), -e), V(0, hy(s), e), V(0, k, 0), 'L=' + (p.L + 2 * p.lk)), lin(V(hx(s), 0, h), V(hx(s), 0, e), V(k, 0, 0), String(p.lk)), lin(V(hx(s), 0, -h), V(hx(s), 0, h), V(k, 0, 0), String(p.L))];
  }
  const fo = p.fg && p.fg !== 'none' ? FL_T : 0, z = h + fo;
  const out = [...sec(s, z, k), lin(V(0, hy(s) + fo, -h), V(0, hy(s) + fo, h), V(0, k, 0), 'L=' + p.L)];
  if (fo) out.push(lab(V(hx(s) + 60, hy(s) + fo, -h - 10), p.fg));
  return out;
};
ANN.tap = function (p) {
  const s = shapeOf(p), k = kk(hx(s) * 2, hy(s) * 2);
  const out = [...sec(s, p.Lb, k), lin(V(0, hy(s), 0), V(0, hy(s), p.Lb), V(0, k, 0), 'h=' + p.Lb)];
  if (p.ob > 0) out.push(lin(V(hx(s), 0, 0), V(hx(s) + p.ob, 0, 0), V(0, -k * 0.9, 0), 'отб. ' + p.ob));
  if (p.end === 'saddle') out.push(lab(V(-hx(s) - k * 1.2, 0, -p.Dm / 2), 'труба Ø' + p.Dm));
  return out;
};
ANN.box = ANN.pipe = ANN.snv = ANN.nipple = ANN.duct; ANN.checkv = ANN.throttle;
TYPES.forEach(t => { t.annot = ANN[t.id]; });

/* рисование размеров на 2D-холсте поверх 3D-картинки */
function drawDims(ctx, cam, w, h, model, dims, fs) {
  if (!dims || !dims.length) return;
  cam.updateMatrixWorld(true); model.updateMatrixWorld(true);
  const P = v => { const q = model.localToWorld(v.clone()).project(cam); return { x: (q.x + 1) / 2 * w, y: (1 - q.y) / 2 * h }; };
  ctx.save(); ctx.lineWidth = Math.max(1, fs / 12); ctx.strokeStyle = ctx.fillStyle = '#1f5fbf'; ctx.font = `${fs}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const text = (x, y, s) => {
    const tw = ctx.measureText(s).width + 6;
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(x - tw / 2, y - fs / 2 - 1, tw, fs + 2); ctx.fillStyle = '#1f5fbf'; ctx.fillText(s, x, y);
  };
  const arrow = (x, y, dx, dy) => {
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * fs * .6 + dy * fs * .22, y - dy * fs * .6 - dx * fs * .22); ctx.lineTo(x - dx * fs * .6 - dy * fs * .22, y - dy * fs * .6 + dx * fs * .22); ctx.closePath(); ctx.fill();
  };
  dims.forEach(d => {
    if (d.pt) { const q = P(d.pt); text(q.x, q.y, d.txt); return; }
    const a = P(d.a), b = P(d.b), a2 = P(d.a.clone().add(d.off)), b2 = P(d.b.clone().add(d.off));
    ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a2.x, a2.y); ctx.moveTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
    arrow(a2.x, a2.y, a2.x - b2.x, a2.y - b2.y); arrow(b2.x, b2.y, b2.x - a2.x, b2.y - a2.y);
    text((a2.x + b2.x) / 2, (a2.y + b2.y) / 2, d.txt);
  });
  ctx.restore();
}
