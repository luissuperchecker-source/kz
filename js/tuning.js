'use strict';
/* ======================= Tuning-Menü für Autos (Taste U im Auto, Handy: 🔧) =======================
   Zwei Reiter: „Leistung“ (Motor, Fahrwerk, Lenkung, Bremsen, Reifen, Nitro) mit echten Fahrwerten
   (PS, 0–100 km/h, Höchsttempo – werden mit der Fahrphysik nachgerechnet) und „Optik“ (Folierung, Felgen,
   Neon-Unterboden, Heckflügel). Pro Autotyp im Browser gespeichert; gekaufte Stufen bleiben, herunterstellen ist gratis.
   Die Optik sieht nur man selbst. */
const TUNE_CATS = [
  ['eng', 'Motor', 'mehr Leistung und Beschleunigung', 3],
  ['susp', 'Sportfahrwerk', 'tiefer, weniger Wanken, dreht williger ein', 2],
  ['steer', 'Lenkeinschlag', 'mehr Einschlag – wichtig für große Driftwinkel', 2],
  ['brake', 'Bremsen', 'kürzerer Bremsweg', 2],
];
const NITRO_PRICE = 1500, NEON_PRICE = 600;
const TUI = { tab: 'perf' };
function tuneCar() { return ride.v >= 0 && ride.kind === 'car' ? vehicles[ride.v] : null; }
function openTuning() {
  if (!tuneCar()) { showMsg('Steig in ein Auto – dann ' + (TOUCH ? '🔧' : kbK('tune')) + ' = Tuning'); return; }
  if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} }
  renderTuning(); $('tune').classList.remove('hidden');
}
function closeTuning() { $('tune').classList.add('hidden'); if (running && tuneCar()) lockPointer(); }
function applyTuning() { const v = tuneCar(); if (!v) return; ride.carK = carParams(ride.ctype); applyLook(v, ride.ctype); }

/* ---------- Fahrwerte nachrechnen (gleiche Physik wie beim Fahren, im Hintergrund auf einer Kopie) ---------- */
const STAT_CACHE = {};
const SAVE_KEYS = ['cvx', 'cvz', 'yaw', 'yawRate', 'steerS', 'ax', 'wspin', 'wR', 'gasS', 'carK', 'onRoad', 'speed', 'slip', 'hand', 'lean', 'dive', 'st', 'nitroT'];
function carStats(K) {
  const key = JSON.stringify([K.P, K.Fmax, K.m, K.muR, K.muF, K.drag, K.brake, K.tc || 0, K.absD || 0, K.rev]);
  if (STAT_CACHE[key]) return STAT_CACHE[key];
  const save = {}; for (const k of SAVE_KEYS) save[k] = ride[k];
  const pos = ride.pos.clone(), vel = ride.vel.clone();
  Object.assign(ride, { cvx: 0, cvz: 0, yaw: 0, yawRate: 0, steerS: 0, ax: 0, wspin: 0, wR: 0, gasS: 1, carK: K, nitroT: 0 });
  const dt = 1 / 30; let t100 = 0, t200 = 0, t = 0, vmax = 0;
  for (let i = 0; i < 30 * 45; i++) {
    carDrive(dt, (ride.wspin || 0) > 0.3 ? 0.55 : 1, 0, false, true); t += dt;   // wie mit Launch-Control: Gas dosiert, damit die Räder nicht nur durchdrehen
    const u = Math.hypot(ride.cvx, ride.cvz); vmax = Math.max(vmax, u);
    if (!t100 && u > 27.78) t100 = t;
    if (!t200 && u > 55.56) t200 = t;
  }
  // Bremsweg aus 100 km/h
  Object.assign(ride, { cvx: 27.78, cvz: 0, yaw: 0, yawRate: 0, wR: 27.78, gasS: 0 });
  let br = 0; for (let i = 0; i < 30 * 10; i++) { carDrive(dt, -1, 0, false, true); const u = Math.hypot(ride.cvx, ride.cvz); br += u * dt; if (u < 0.3) break; }
  for (const k of SAVE_KEYS) ride[k] = save[k]; ride.pos.copy(pos); ride.vel.copy(vel);
  return (STAT_CACHE[key] = { ps: Math.round(K.P / 735.5), t100: t100 || 99, t200: t200 || 99, vmax: Math.round(vmax * 3.6), brake: Math.round(br), grip: (K.muR + K.muF) / 2 });
}
// Vorschau: was bringt die nächste Stufe?
function nextGain(type, k) {
  const T = tuneOf(type), before = carParams(type); T[k]++; const after = carParams(type); T[k]--;
  if (k === 'eng') { const a = carStats(before), b = carStats(after); return `+${Math.round((after.P - before.P) / 735.5)} PS · 0–200 ${b.t200 < 90 && a.t200 < 90 ? '−' + (a.t200 - b.t200).toFixed(1) + ' s' : ''} · +${b.vmax - a.vmax} km/h`; }
  if (k === 'susp') return 'tiefer & agiler';
  if (k === 'steer') return `+${Math.round((after.maxSteer - before.maxSteer) * 57.3)}° Einschlag`;
  if (k === 'brake') return `−${carStats(before).brake - carStats(after).brake} m Bremsweg`;
  return '';
}

/* ---------- Anzeige ---------- */
function renderTuning() {
  const v = tuneCar(); if (!v) return;
  const type = ride.ctype, ct = CAR_TYPES[type], T = tuneOf(type), K = carParams(type), S = carStats(K);
  T.max = T.max || { eng: T.eng, susp: T.susp, steer: T.steer, brake: T.brake };
  $('tuneCoins').textContent = fmt(shopState.coins);
  const coin = n => `<span class="coin"></span> ${fmt(n)}`;
  let h = `<div class="tHead"><div><div class="tName">${ct.name}</div><div class="tInfo">${ct.info}</div></div></div>
    <div class="tStats">
      <div><b>${S.ps}</b><span>PS</span></div><div><b>${S.t100 < 90 ? S.t100.toFixed(1) + ' s' : '–'}</b><span>0–100 km/h</span></div>
      <div><b>${S.t200 < 90 ? S.t200.toFixed(1) + ' s' : '–'}</b><span>0–200 km/h</span></div>
      <div><b>${S.vmax}</b><span>km/h max</span></div><div><b>${S.brake} m</b><span>Bremsweg</span></div><div><b>${S.grip.toFixed(2)}</b><span>Grip</span></div>
    </div>
    <div class="tTabs"><button data-tab="perf" class="${TUI.tab === 'perf' ? 'on' : 'sec'}">⚙ Leistung</button><button data-tab="look" class="${TUI.tab === 'look' ? 'on' : 'sec'}">🎨 Optik</button></div>`;
  if (TUI.tab === 'perf') {
    for (const [k, name, desc, max] of TUNE_CATS) {
      const lv = T[k], own = T.max[k], cost = own < max ? TUNE_COST[k][own] : 0;
      const dots = Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : i < own ? 'own' : ''}"></i>`).join('');
      const gain = lv < max ? `<em class="gain">${nextGain(type, k)}</em>` : '';
      const plus = lv < own ? `<button data-t="${k}" data-d="1" class="sec">+</button>`
        : own < max ? `<button data-t="${k}" data-d="1" ${shopState.coins < cost ? 'disabled' : ''}>+ ${coin(cost)}</button>` : `<button class="sec" disabled>MAX</button>`;
      h += `<div class="tRow"><div class="nm">${name}<small>${desc}</small>${gain}</div><span class="lv">${dots}</span>
        <button data-t="${k}" data-d="-1" class="sec" ${lv <= 0 ? 'disabled' : ''}>−</button>${plus}</div>`;
    }
    h += `<div class="tRow"><div class="nm">🔥 Nitro<small>Taste ${TOUCH ? '🔥' : kbK('nitro')}: 3 s Extra-Schub mit Flammen, dann 12 s aufladen</small></div>
      ${T.nitro ? '<button class="sec" disabled>✓ eingebaut</button>' : `<button data-nitro="1" ${shopState.coins < NITRO_PRICE ? 'disabled' : ''}>Einbauen ${coin(NITRO_PRICE)}</button>`}</div>`;
    h += '<div class="tSec">REIFEN</div><div class="chips">';
    TIRES.forEach((t, i) => {
      const own = T.tires.includes(i);
      h += `<button data-tire="${i}" class="${T.tire === i ? 'on' : 'sec'}" ${!own && shopState.coins < t.price ? 'disabled' : ''}>${t.n}${own ? '' : ' · ' + coin(t.price)}</button>`;
    });
    h += '</div>';
  } else {
    const nLiv = type === 'drift' ? 8 : 4, sw = (col, on, attr) => `<button ${attr} class="sw ${on ? 'on' : ''}" style="background:#${col.toString(16).padStart(6, '0')}"></button>`;
    h += '<div class="tSec">FOLIERUNG</div><div class="chips">';
    h += `<button data-liv="-1" class="${T.liv < 0 ? 'on' : 'sec'}">Original</button>`;
    for (let i = 0; i < nLiv; i++) h += `<button data-liv="${i}" class="${T.liv === i ? 'on' : 'sec'}">Design ${i + 1}</button>`;
    h += '</div><div class="tSec">FELGENFARBE</div><div class="chips">';
    h += `<button data-rim="-1" class="${T.rim < 0 ? 'on' : 'sec'}">Original</button>` + RIM_COLS.map((c, i) => sw(c, T.rim === i, `data-rim="${i}"`)).join('');
    h += `</div><div class="tSec">NEON-UNTERBODEN ${T.neonOwn ? '' : `· einmalig ${coin(NEON_PRICE)}`}</div><div class="chips">`;
    h += `<button data-neon="-1" class="${T.neon < 0 ? 'on' : 'sec'}">Aus</button>` + NEON_COLS.map((c, i) => sw(c, T.neon === i, `data-neon="${i}" ${!T.neonOwn && shopState.coins < NEON_PRICE ? 'disabled' : ''}`)).join('');
    h += '</div>';
    if (type !== 'muscle' && type !== 'f1') h += `<div class="tSec">HECKFLÜGEL</div><div class="chips"><button data-wing="1" class="${T.wing !== false ? 'on' : 'sec'}">Mit Flügel</button><button data-wing="0" class="${T.wing === false ? 'on' : 'sec'}">Ohne Flügel</button></div>`;
    h += '<div class="tNote">Tieferlegung: über das Sportfahrwerk (Reiter „Leistung“). Die Optik siehst nur du.</div>';
  }
  $('tuneBody').innerHTML = h;
}
$('tuneBody').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const type = ride.ctype, T = tuneOf(type); T.max = T.max || { eng: T.eng, susp: T.susp, steer: T.steer, brake: T.brake };
  const pay = (n) => { if (shopState.coins < n) return false; shopState.coins -= n; saveShop(); updateCoins(true); initAudio(); sndBeep(660, 0.1, 0.12, 'triangle'); setTimeout(() => sndBeep(990, 0.15, 0.12, 'triangle'), 90); return true; };
  if (b.dataset.tab) TUI.tab = b.dataset.tab;
  else if (b.dataset.t) {
    const k = b.dataset.t, d = +b.dataset.d, max = TUNE_CATS.find(c => c[0] === k)[3];
    if (d < 0) T[k] = Math.max(0, T[k] - 1);
    else if (T[k] < T.max[k]) T[k]++;
    else if (T.max[k] < max) { if (!pay(TUNE_COST[k][T.max[k]])) return; T.max[k]++; T[k] = T.max[k]; }
  } else if (b.dataset.tire !== undefined) {
    const i = +b.dataset.tire;
    if (!T.tires.includes(i)) { if (!pay(TIRES[i].price)) return; T.tires.push(i); }
    T.tire = i;
  } else if (b.dataset.nitro) { if (!pay(NITRO_PRICE)) return; T.nitro = true; }
  else if (b.dataset.liv !== undefined) T.liv = +b.dataset.liv;
  else if (b.dataset.rim !== undefined) T.rim = +b.dataset.rim;
  else if (b.dataset.neon !== undefined) { const n = +b.dataset.neon; if (n >= 0 && !T.neonOwn) { if (!pay(NEON_PRICE)) return; T.neonOwn = true; } T.neon = n; }
  else if (b.dataset.wing !== undefined) T.wing = b.dataset.wing === '1';
  saveTune(); applyTuning(); renderTuning();
});
$('tuneClose').onclick = closeTuning;
