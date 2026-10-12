'use strict';
/* Интерфейс: конструктор изделий + коммерческое предложение */

const LS = 'ventfactory-kp-v1';
const THICK = [0.5, 0.7, 1.0];
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = x => x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (x, d = 3) => x.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });

const TXT = {
  uk: { title: 'КОМЕРЦІЙНА ПРОПОЗИЦІЯ', no: '№', from: 'від', obj: "Об'єкт:", cust: 'Замовник:', n: '№', name: 'Найменування', qty: 'К-сть',
    pr: 'Ціна роздріб, грн', sr: 'Сума роздріб, грн', pd: 'Ціна зі знижкою, грн', sd: 'Сума зі знижкою, грн', area: 'Площа, м²', w: 'Вага, кг',
    section: 'Розділ', secTotal: 'Разом по розділу', conds: 'УМОВИ', total: 'ПІДСУМОК', all: 'ВСЬОГО, грн', vat: 'у т.ч. ПДВ', disc: 'Знижка',
    comm: 'Коментарі', sk: 'ЕСКІЗ ВИРОБУ ДЛЯ ПОГОДЖЕННЯ', params: 'Параметри', ag: 'Погоджено замовником', dt: 'Дата', sign: 'підпис', mp: 'М.П.', unit: 'шт.', sumArea: 'Загальна площа, м²', sumW: 'Загальна вага, кг', retail: 'Разом роздріб, грн' },
  ru: { title: 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', no: '№', from: 'от', obj: 'Объект:', cust: 'Заказчик:', n: '№', name: 'Наименование', qty: 'Кол-во',
    pr: 'Цена розница, грн', sr: 'Сумма розница, грн', pd: 'Цена со скидкой, грн', sd: 'Сумма со скидкой, грн', area: 'Площадь, м²', w: 'Вес, кг',
    section: 'Раздел', secTotal: 'Итого по разделу', conds: 'УСЛОВИЯ', total: 'ИТОГО', all: 'ВСЕГО, грн', vat: 'в т.ч. НДС', disc: 'Скидка',
    comm: 'Комментарии', sk: 'ЭСКИЗ ИЗДЕЛИЯ ДЛЯ СОГЛАСОВАНИЯ', params: 'Параметры', ag: 'Согласовано заказчиком', dt: 'Дата', sign: 'подпись', mp: 'М.П.', unit: 'шт.', sumArea: 'Общая площадь, м²', sumW: 'Общий вес, кг', retail: 'Итого розница, грн' },
};

const today = new Date(), iso = d => d.toISOString().slice(0, 10);
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

const DOC0 = {
  company: 'ВЕНТ ФЕКТОРІ', legal: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ',
  contacts: '+38 067 8866 255\nventfactory.kr@gmail.com\nм. Кривий Ріг, вул. Вільної Ічкерії, 15',
  b1: 'СУЧАСНЕ ВИРОБНИЦТВО ПОВІТРОВОДІВ', b2: 'ВИРОБНИЦТВО ВЕНТИЛЯЦІЙНИХ РЕШІТОК', b3: 'ПОСТАЧАННЯ ВЕНТИЛЯЦІЙНОГО ОБЛАДНАННЯ', b4: 'МОНТАЖ ВЕНТИЛЯЦІЇ',
  kpno: '', date: iso(today), obj: '', cust: '', intro: 'Пропонуємо виготовлення та постачання повітроводів і фасонних виробів.',
  term: '__ робочих днів', pay: '__% передоплата', warr: '__ місяців', valid: plus(10), delivery: 'Самовивіз зі складу виробника / доставка за домовленістю',
  comments: '', boss: 'Директор ТОВ «ВЕНТ ФЕКТОРІ»', bossName: '[ПІБ]',
  foot1: 'ТОВ «ВЕНТ ФЕКТОРІ» · Повітроводи та вентиляційні системи', foot2: '+38 067 8866 255 · ventfactory.kr@gmail.com',
};
const SET0 = { snv: {}, lang: 'uk', disc: 10, vat: 20, rate: { '0.5': 650, '0.7': 850, '1': 1200 }, density: 7850, meshW: 1, woolD: 80 };

let state = { set: structuredClone(SET0), doc: structuredClone(DOC0), items: [], logo: null, sections: ['Повітроводи та фасонні вироби'] };
try { const s = JSON.parse(localStorage.getItem(LS)); if (s) { Object.assign(state, s); state.set = Object.assign(structuredClone(SET0), s.set); state.doc = Object.assign(structuredClone(DOC0), s.doc); } } catch (e) { }
const save = () => { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { } };
const syncSet = () => { SET.density = +state.set.density; SET.meshW = +state.set.meshW; SET.woolD = +state.set.woolD; };
syncSet();

/* ---------- 3D-просмотр ---------- */
function makeScene() {
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x6b7a8c, 0.9));
  const d = new THREE.DirectionalLight(0xffffff, 0.8); d.position.set(3, 5, 4); sc.add(d);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.35); d2.position.set(-4, -2, -3); sc.add(d2);
  return sc;
}
function frame(root, cam) {
  root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root), m = root.userData.m;
  (root.userData.dims || []).forEach(d => (d.pt ? [d.pt] : [d.a, d.b, d.a.clone().add(d.off), d.b.clone().add(d.off)]).forEach(v => b.expandByPoint(m.localToWorld(v.clone()))));
  const c = b.getCenter(new THREE.Vector3()), sph = b.getBoundingSphere(new THREE.Sphere());
  root.position.sub(c);
  const dist = sph.radius / Math.sin(cam.fov * PI / 360) * 1.12;
  cam.position.set(0.8, 0.6, 1).normalize().multiplyScalar(dist);
  cam.near = dist / 100; cam.far = dist * 20; cam.updateProjectionMatrix(); cam.lookAt(0, 0, 0);
  return dist;
}
function buildModel(type, p) {
  const m = type.build(p), root = new THREE.Group();
  if (type.up) m.rotation.x = -PI / 2;
  root.add(m); root.userData.m = m; root.userData.dims = type.annot ? type.annot(p) : [];
  return root;
}

const view = { el: $('#view') };
view.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
view.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
view.el.appendChild(view.renderer.domElement);
view.dim = document.createElement('canvas'); view.dim.className = 'dimcv'; view.el.appendChild(view.dim);
view.scene = makeScene();
view.cam = new THREE.PerspectiveCamera(35, 1, 1, 1000);
view.controls = new THREE.OrbitControls(view.cam, view.renderer.domElement);
view.controls.enableDamping = true; view.controls.autoRotate = true; view.controls.autoRotateSpeed = 2.2;
function resizeView() {
  const w = view.el.clientWidth, h = view.el.clientHeight;
  view.renderer.setSize(w, h); view.dim.width = w * 2; view.dim.height = h * 2; view.cam.aspect = w / h; view.cam.updateProjectionMatrix();
}
new ResizeObserver(resizeView).observe(view.el);
(function loop() {
  requestAnimationFrame(loop); view.controls.update(); view.renderer.render(view.scene, view.cam);
  const c = view.dim.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, view.dim.width, view.dim.height);
  if (view.model && $('#dimsOn').checked) drawDims(c, view.cam, view.el.clientWidth, view.el.clientHeight, view.model.userData.m, view.model.userData.dims, 12);
})();

const thumb = { renderer: null };
function snapshot(type, p, w = 960, h = 720, fs = 28) {
  if (!thumb.renderer) {
    thumb.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumb.renderer.setPixelRatio(1); thumb.scene = makeScene(); thumb.cam = new THREE.PerspectiveCamera(35, 1, 1, 1000);
    thumb.cv = document.createElement('canvas');
  }
  thumb.renderer.setSize(w, h); thumb.cv.width = w; thumb.cv.height = h; thumb.cam.aspect = w / h; thumb.cam.updateProjectionMatrix();
  const root = buildModel(type, p); frame(root, thumb.cam); thumb.scene.add(root);
  thumb.renderer.render(thumb.scene, thumb.cam);
  const c = thumb.cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.drawImage(thumb.renderer.domElement, 0, 0);
  drawDims(c, thumb.cam, w, h, root.userData.m, root.userData.dims, fs);
  thumb.scene.remove(root);
  return thumb.cv.toDataURL('image/png');
}

/* ---------- конструктор ---------- */
VIEW.style = 'metal';
const cur = { type: TYPES.find(t => t.id === 'pipe'), p: defaultsOf(TYPES.find(t => t.id === 'pipe')), editId: null };
let timer;

const GROUPS = [
  { title: 'Круглое сечение', items: [['pipe'], ['snv'], ['elbow', { shape: 'round' }, 'Отвод'], ['transition', { s1: 'round', s2: 'round' }, 'Переход'],
    ['tee', { s1: 'round', s2: 'round' }, 'Тройник / врезка / крестовина'], ['throttle', { shape: 'round' }], ['cap', { shape: 'round' }], ['mesh', { shape: 'round' }],
    ['clamp'], ['mushroom'], ['tsagi'], ['exhaust45'], ['nozzle'], ['silround']] },
  { title: 'Прямоугольное сечение', items: [['box'], ['elbow', { shape: 'rect' }, 'Отвод'], ['transition', { s1: 'rect', s2: 'rect' }, 'Переход'],
    ['tee', { s1: 'rect', s2: 'rect' }, 'Тройник / врезка / крестовина'], ['throttle', { shape: 'rect' }], ['cap', { shape: 'rect' }], ['mesh', { shape: 'rect' }],
    ['silrect'], ['hood']] },
  { title: 'Комбинированные: круг и прямоугольник', items: [['transition', { s1: 'round', s2: 'rect' }, 'Переход круг → прямоугольник'],
    ['transition', { s1: 'rect', s2: 'round' }, 'Переход прямоугольник → круг'], ['tee', { s1: 'rect', s2: 'round' }, 'Тройник: магистраль прямоуг., ответвление круглое'],
    ['tee', { s1: 'round', s2: 'rect' }, 'Тройник: магистраль круглая, ответвление прямоуг.']] },
];
const ENTRIES = []; GROUPS.forEach((g, gi) => g.items.forEach(([id, preset, label]) => ENTRIES.push({ gi, id, preset: preset || {}, label: label || TYPES.find(t => t.id === id).name })));
cur.entry = 0; cur.lock = Object.keys(ENTRIES[0].preset);
function renderTypes() {
  $('#types').innerHTML = GROUPS.map((g, gi) => `<div class="tg"><h3>${g.title}</h3><div class="tb">` +
    ENTRIES.map((e, i) => e.gi === gi ? `<button type="button" data-i="${i}" class="${i === cur.entry ? 'on' : ''}">${esc(e.label)}</button>` : '').join('') + '</div></div>').join('');
}
function renderForm() {
  const html = cur.type.fields.filter(f => !cur.lock.includes(f.k)).filter(f => !f.show || f.show(cur.p)).map(f => {
    if (f.sel) return `<label>${f.l}<select data-k="${f.k}">${f.sel.map(o => `<option value="${o[0]}" ${cur.p[f.k] === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>`;
    return `<label>${f.l}<input type="number" step="any" min="${f.min}" data-k="${f.k}" value="${cur.p[f.k]}"></label>`;
  }).join('');
  const thick = `<label>Толщина металла, мм<select data-k="t">${THICK.map(t => `<option value="${t}" ${+cur.p.t === t ? 'selected' : ''}>${String(t).replace('.', ',')}</option>`).join('')}</select></label>`;
  $('#fields').innerHTML = html + thick;
}
function numericOk() {
  return cur.type.fields.every(f => (f.show && !f.show(cur.p)) || f.sel || (isFinite(cur.p[f.k]) && cur.p[f.k] >= f.min));
}
function rateFor(t) { return +state.set.rate[String(+t)] || 0; }
function compute(type, p) { return type.calc(p); }
const SNV_D = [100, 125, 160, 200, 250, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000];
function autoPrice(type, p, area) {   // цена за единицу (шт.)
  if (type.perMp) {
    const mp = +(state.set.snv || {})[p.D] || (area / (p.L / 1000)) * rateFor(p.t);
    return Math.round(mp * p.L / 1000 * 100) / 100;
  }
  return Math.round(area * rateFor(p.t) * 100) / 100;
}

function update() {
  const ok = numericOk();
  $('#warn').textContent = ok ? '' : 'Проверьте размеры: значения должны быть положительными';
  if (!ok) { $('#result').innerHTML = ''; return; }
  const r = compute(cur.type, cur.p);
  cur.r = r;
  const unit = autoPrice(cur.type, cur.p, r.area);
  $('#result').innerHTML = `
    <div class="kpis"><div><span>Площадь</span><b>${num(r.area)} м²</b></div><div><span>Вес</span><b>${num(r.weight, 2)} кг</b></div>
    <div><span>Цена (авто)</span><b>${money(unit)} грн</b></div></div>
    <ul class="dev">${r.dev.map(d => `<li>${esc(d)}</li>`).join('')}</ul>`;
  $('#price').placeholder = money(unit);
  clearTimeout(timer);
  timer = setTimeout(rebuild, 60);
}
function rebuild() {
  if (view.model) { view.scene.remove(view.model); }
  try {
    view.model = buildModel(cur.type, cur.p);
    resizeView(); frame(view.model, view.cam); view.scene.add(view.model);
  } catch (e) { console.error(e); }
}
function setEntry(i) {
  const e = ENTRIES[i]; cur.entry = i; cur.type = TYPES.find(t => t.id === e.id);
  cur.p = Object.assign(defaultsOf(cur.type), e.preset); cur.lock = Object.keys(e.preset); cur.editId = null;
  $('#add').textContent = '＋ Добавить в КП'; $('#cancel').hidden = true; $('#price').value = '';
  renderTypes(); renderForm(); update();
}

$('#types').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setEntry(+b.dataset.i); });
$('#fields').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  const f = cur.type.fields.find(f => f.k === k);
  cur.p[k] = (f && f.sel) ? e.target.value : (k === 't' ? +e.target.value : parseFloat(e.target.value));
  if (f && f.sel) { renderForm(); }
  update();
});
$('#style').addEventListener('change', e => { VIEW.style = e.target.value; rebuild(); });
$('#rot').addEventListener('change', e => { view.controls.autoRotate = e.target.checked; });

$('#add').addEventListener('click', () => {
  if (!numericOk()) return;
  const sec = $('#section').value.trim() || state.sections[0];
  const manual = parseFloat($('#price').value.replace(',', '.'));
  const it = { id: cur.editId || Date.now(), type: cur.type.id, p: { ...cur.p }, qty: Math.max(1, parseInt($('#qty').value) || 1),
    price: isFinite(manual) && manual > 0 ? manual : null, section: sec, thumb: snapshot(cur.type, cur.p) };
  if (!state.sections.includes(sec)) state.sections.push(sec);
  const i = state.items.findIndex(x => x.id === cur.editId);
  if (i >= 0) state.items[i] = it; else state.items.push(it);
  cur.editId = null; $('#add').textContent = '＋ Добавить в КП'; $('#cancel').hidden = true; $('#price').value = '';
  save(); renderKP();
});
$('#cancel').addEventListener('click', () => setEntry(cur.entry));

/* ---------- КП ---------- */
function rowsData() {
  const L = state.set, disc = (+L.disc || 0) / 100;
  return state.items.map(it => {
    const type = TYPES.find(t => t.id === it.type), r = compute(type, it.p);
    const price = it.price != null ? it.price : autoPrice(type, it.p, r.area);
    const pd = Math.round(price * (1 - disc) * 100) / 100;
    return { it, name: type.label(it.p), th: it.p.t, r, price, pd, sr: price * it.qty, sd: pd * it.qty, area: r.area * it.qty, w: r.weight * it.qty };
  });
}
function renderKP() {
  const T = TXT[state.set.lang], rows = rowsData();
  const secs = []; rows.forEach(r => { if (!secs.includes(r.it.section)) secs.push(r.it.section); });
  let body = '', no = 0, S = { sr: 0, sd: 0, area: 0, w: 0 };
  const secSum = [];
  secs.forEach((s, si) => {
    body += `<tr class="sec"><td colspan="9">${T.section} ${si + 1}. ${esc(s)}</td></tr>`;
    const t = { sr: 0, sd: 0, area: 0, w: 0 };
    rows.filter(r => r.it.section === s).forEach(r => {
      no++; ['sr', 'sd', 'area', 'w'].forEach(k => { t[k] += r[k]; });
      body += `<tr data-id="${r.it.id}">
        <td class="c">${no}</td>
        <td class="nm"><img src="${r.it.thumb}" alt=""><div><b>${esc(r.name)}</b><small>δ ${String(r.th).replace('.', ',')} мм</small></div>
          <span class="rowbtn no-print"><button data-act="sk" title="Печать эскиза для заказчика">🖨</button><button data-act="edit" title="Изменить">✎</button><button data-act="del" title="Удалить">✕</button></span></td>
        <td class="c"><input class="qty" type="number" min="1" value="${r.it.qty}" data-f="qty"> <small>${T.unit}</small></td>
        <td class="r"><input class="pr" type="text" value="${money(r.price)}" data-f="price"></td>
        <td class="r">${money(r.sr)}</td><td class="r">${money(r.pd)}</td><td class="r">${money(r.sd)}</td>
        <td class="r">${num(r.area)}</td><td class="r">${num(r.w, 2)}</td></tr>`;
    });
    body += `<tr class="tot"><td colspan="4">${T.secTotal} «${esc(s)}»</td><td class="r">${money(t.sr)}</td><td></td><td class="r">${money(t.sd)}</td><td class="r">${num(t.area)}</td><td class="r">${num(t.w, 2)}</td></tr>`;
    secSum.push([s, t]); ['sr', 'sd', 'area', 'w'].forEach(k => { S[k] += t[k]; });
  });
  if (!rows.length) body = `<tr><td colspan="9" class="empty">Добавьте изделия из конструктора</td></tr>`;
  const vr = (+state.set.vat || 0) / 100, vat = Math.round(S.sd * vr / (1 + vr) * 100) / 100;
  $('#tbl').innerHTML = `<thead><tr><th>${T.n}</th><th>${T.name}</th><th>${T.qty}</th><th>${T.pr}</th><th>${T.sr}</th><th>${T.pd}<br><small>−${state.set.disc}%</small></th><th>${T.sd}</th><th>${T.area}</th><th>${T.w}</th></tr></thead><tbody>${body}</tbody>`;
  $('#sum').innerHTML = `${secSum.map(([s, t], i) => `<tr><td>${esc(s)}</td><td class="r">${money(t.sd)}</td></tr>`).join('')}
    <tr><td>${T.retail}</td><td class="r">${money(S.sr)}</td></tr>
    <tr><td>${T.disc} ${state.set.disc}%</td><td class="r">−${money(S.sr - S.sd)}</td></tr>
    <tr class="all"><td>${T.all}</td><td class="r">${money(S.sd)}</td></tr>
    <tr><td>${T.vat} ${state.set.vat}%</td><td class="r">${money(vat)}</td></tr>
    <tr><td>${T.sumArea}</td><td class="r">${num(S.area)}</td></tr><tr><td>${T.sumW}</td><td class="r">${num(S.w, 2)}</td></tr>`;
  $('#sectionList').innerHTML = state.sections.map(s => `<option value="${esc(s)}">`).join('');
  document.querySelectorAll('[data-i]').forEach(el => { el.textContent = T[el.dataset.i]; });
  $('#kpMeta').dataset.lang = state.set.lang;
  state._rows = rows; state._S = S;
}
$('#tbl').addEventListener('change', e => {
  const tr = e.target.closest('tr[data-id]'); if (!tr) return;
  const it = state.items.find(x => x.id == tr.dataset.id), f = e.target.dataset.f;
  if (f === 'qty') it.qty = Math.max(1, parseInt(e.target.value) || 1);
  if (f === 'price') { const v = parseFloat(e.target.value.replace(/\s/g, '').replace(',', '.')); it.price = v > 0 ? v : null; }
  save(); renderKP();
});
$('#tbl').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const id = b.closest('tr').dataset.id, it = state.items.find(x => x.id == id);
  if (b.dataset.act === 'sk') { printSketch(TYPES.find(t => t.id === it.type), it.p, it.qty); return; }
  if (b.dataset.act === 'del') { state.items = state.items.filter(x => x !== it); save(); renderKP(); return; }
  cur.type = TYPES.find(t => t.id === it.type); cur.p = { ...it.p }; cur.editId = it.id; cur.lock = [];
  cur.entry = ENTRIES.findIndex(e => e.id === it.type && Object.entries(e.preset).every(([k, v]) => it.p[k] === v)); 
  $('#qty').value = it.qty; $('#section').value = it.section; $('#price').value = it.price || '';
  $('#add').textContent = '✓ Сохранить изменения'; $('#cancel').hidden = false;
  renderTypes(); renderForm(); update(); $('#constructor').scrollIntoView({ behavior: 'smooth' });
});

/* ---------- печать эскиза для заказчика ---------- */
function printSketch(type, p, qty) {
  const T = TXT[state.set.lang], r = compute(type, p), D = state.doc;
  const rows = type.fields.filter(f => !f.show || f.show(p)).filter(f => !(f.k === 'shape' || f.k === 's1' || f.k === 's2') || true).map(f => {
    const v = f.sel ? (f.sel.find(o => o[0] === p[f.k]) || [, p[f.k]])[1] : p[f.k];
    return `<tr><td>${esc(f.l)}</td><td>${esc(v)}</td></tr>`;
  }).join('') + `<tr><td>Толщина металла, мм</td><td>${String(p.t).replace('.', ',')}</td></tr>` + (qty ? `<tr><td>${T.qty}</td><td>${qty} ${T.unit}</td></tr>` : '') +
    `<tr><td>${T.area}</td><td>${num(r.area)}</td></tr><tr><td>${T.w}</td><td>${num(r.weight, 2)}</td></tr>`;
  $('#sketch').innerHTML = `<div class="skh"><img src="${state.logo || LOGO}" alt=""><div><b>${esc(D.company)}</b><br><small>${esc(D.legal)}</small></div><div class="skc">${esc(D.contacts).replace(/\n/g, '<br>')}</div></div>
    <h2>${T.sk}</h2><p class="skm">${T.obj} ${esc(D.obj)} &nbsp; ${T.cust} ${esc(D.cust)}</p><h3>${esc(type.label(p))}</h3>
    <div class="skb"><img class="skimg" src="${snapshot(type, p, 1500, 1050, 40)}" alt=""><div><h4>${T.params}</h4><table>${rows}</table>
    <ul>${r.dev.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div></div>
    <div class="sks"><span>${T.ag}: ______________________</span><span>${T.dt}: ______________</span></div>`;
  document.body.classList.add('sk');
  const done = () => { document.body.classList.remove('sk'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); setTimeout(() => window.print(), 150);
}
$('#sketchBtn').addEventListener('click', () => { if (numericOk()) printSketch(cur.type, cur.p, 0); });

/* ---------- поля документа, настройки, логотип ---------- */
function bindDoc() {
  document.querySelectorAll('[data-key]').forEach(el => {
    const k = el.dataset.key, v = state.doc[k] ?? '';
    if (el.tagName === 'INPUT') el.value = v; else el.innerText = v;
    el.addEventListener('input', () => { state.doc[k] = el.tagName === 'INPUT' ? el.value : el.innerText; save(); });
  });
}
function snvTable() {
  $('#snvPrices').innerHTML = SNV_D.map(d => `<label>Ø${d}<input type="number" data-set="snv/${d}" placeholder="авто"></label>`).join('');
}
function bindSettings() {
  snvTable();
  document.querySelectorAll('[data-set]').forEach(el => {
    const path = el.dataset.set.split('/'), get = () => path.reduce((o, k) => o[k], state.set);
    el.value = get();
    el.addEventListener('input', () => {
      let o = state.set; for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
      o[path.at(-1)] = el.type === 'number' ? parseFloat(el.value) || 0 : el.value;
      syncSet(); save(); renderKP(); update();
    });
  });
}
const LOGO = 'img/logo.png';
function showLogo() { $('#logo').src = state.logo || LOGO; }
$('#logoFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    const k = Math.min(1, 300 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    state.logo = c.toDataURL('image/png'); save(); showLogo(); URL.revokeObjectURL(url);
  };
  img.src = url;
});
$('#logoReset').addEventListener('click', () => { state.logo = null; save(); showLogo(); });
$('#print').addEventListener('click', () => window.print());
$('#clear').addEventListener('click', () => { if (confirm('Удалить все позиции из КП?')) { state.items = []; save(); renderKP(); } });
$('#csv').addEventListener('click', () => {
  const T = TXT[state.set.lang], rows = state._rows || [], q = v => '"' + String(v).replace(/"/g, '""') + '"', f = v => String(v).replace('.', ',');
  const out = [[T.n, T.name, 'δ, мм', T.qty, T.pr, T.sr, T.pd, T.sd, T.area, T.w, T.section].map(q).join(';')];
  rows.forEach((r, i) => out.push([i + 1, q(r.name), f(r.th), r.it.qty, f(r.price.toFixed(2)), f(r.sr.toFixed(2)), f(r.pd.toFixed(2)), f(r.sd.toFixed(2)), f(r.area.toFixed(3)), f(r.w.toFixed(2)), q(r.it.section)].join(';')));
  const S = state._S; out.push(['', q(T.all), '', '', '', f(S.sr.toFixed(2)), '', f(S.sd.toFixed(2)), f(S.area.toFixed(3)), f(S.w.toFixed(2)), ''].join(';'));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'KP-' + (state.doc.kpno || 'ventfactory') + '.csv'; a.click();
});

$('#section').value = state.sections[0];
renderTypes(); renderForm(); bindDoc(); bindSettings(); showLogo(); renderKP(); resizeView(); update();
