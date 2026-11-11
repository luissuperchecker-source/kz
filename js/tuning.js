'use strict';
/* ======================= Tuning-Menü für Autos (Taste U im Auto) =======================
   Pro Autotyp (Drift-Auto, Rennwagen, Muscle-Car) im Browser gespeichert. Gekaufte Stufen bleiben,
   man kann jederzeit kostenlos wieder herunterstellen. Die Folierung sieht nur man selbst. */
const TUNE_CATS = [
  ['eng', 'Motor', 'mehr Leistung und Beschleunigung', 3],
  ['susp', 'Sportfahrwerk', 'tiefer, weniger Wanken, dreht williger ein', 2],
  ['steer', 'Lenkeinschlag', 'mehr Einschlag – wichtig für große Driftwinkel', 2],
  ['brake', 'Bremsen', 'kürzerer Bremsweg', 2],
];
function tuneCar() { return ride.v >= 0 && ride.kind === 'car' ? vehicles[ride.v] : null; }
function openTuning() {
  if (!tuneCar()) { showMsg('Steig in ein Auto – dann ' + kbK('tune') + ' = Tuning'); return; }
  if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} }
  renderTuning(); $('tune').classList.remove('hidden');
}
function closeTuning() { $('tune').classList.add('hidden'); if (running && tuneCar() && !TOUCH) lockPointer(); }
function applyTuning() {
  const v = tuneCar(); if (!v) return;
  ride.carK = carParams(ride.ctype);
  const T = tuneOf(ride.ctype);
  setCarPaint(v, T.liv >= 0 ? paintFor(ride.ctype, T.liv) : v.origPaint || v.mesh.paint);
}
function renderTuning() {
  const v = tuneCar(); if (!v) return;
  if (!v.origPaint) v.origPaint = v.mesh.paint;
  const type = ride.ctype, ct = CAR_TYPES[type], T = tuneOf(type), K = carParams(type);
  T.max = T.max || { eng: T.eng, susp: T.susp, steer: T.steer, brake: T.brake };
  $('tuneCoins').textContent = fmt(shopState.coins);
  const bar = (label, val) => `<div class="stat"><span>${label}</span><em><i style="width:${Math.round(Math.max(0.03, Math.min(1, val)) * 100)}%"></i></em></div>`;
  let h = `<div style="font-size:18px;font-weight:800">${ct.name}</div><div style="color:#a8c0a8;font-size:12.5px;margin-bottom:8px">${ct.info}</div>`;
  h += bar('Leistung', K.P / 380000) + bar('Grip', (K.muR + K.muF) / 3.6) + bar('Gewicht', K.m / 1800) + bar('Lenkung', K.maxSteer / 0.85) + bar('Bremse', K.brake / 1.9);
  h += '<div class="tSec">LEISTUNG & FAHRWERK</div>';
  for (const [k, name, desc, max] of TUNE_CATS) {
    const lv = T[k], own = T.max[k], cost = own < max ? TUNE_COST[k][own] : 0;
    const dots = Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    const plus = lv < own ? `<button data-t="${k}" data-d="1" class="sec">+</button>`
      : own < max ? `<button data-t="${k}" data-d="1" ${shopState.coins < cost ? 'disabled' : ''}>+ <span class="coin"></span> ${fmt(cost)}</button>` : `<button class="sec" disabled>MAX</button>`;
    h += `<div class="tRow"><div class="nm">${name}<small>${desc}</small></div><span class="lv">${dots}</span>
      <button data-t="${k}" data-d="-1" class="sec" ${lv <= 0 ? 'disabled' : ''}>−</button>${plus}</div>`;
  }
  h += '<div class="tSec">REIFEN</div><div class="chips">';
  TIRES.forEach((t, i) => {
    const own = T.tires.includes(i);
    h += `<button data-tire="${i}" class="${T.tire === i ? 'on' : 'sec'}" ${!own && shopState.coins < t.price ? 'disabled' : ''}>${t.n}${own ? '' : ` · <span class="coin"></span> ${fmt(t.price)}`}</button>`;
  });
  h += '</div><div class="tSec">FOLIERUNG (nur bei dir sichtbar)</div><div class="chips">';
  const nLiv = type === 'drift' ? 8 : 4;
  h += `<button data-liv="-1" class="${T.liv < 0 ? 'on' : 'sec'}">Original</button>`;
  for (let i = 0; i < nLiv; i++) h += `<button data-liv="${i}" class="${T.liv === i ? 'on' : 'sec'}">Design ${i + 1}</button>`;
  h += '</div>';
  $('tuneBody').innerHTML = h;
}
$('tuneBody').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const type = ride.ctype, T = tuneOf(type); T.max = T.max || { eng: T.eng, susp: T.susp, steer: T.steer, brake: T.brake };
  if (b.dataset.t) {
    const k = b.dataset.t, d = +b.dataset.d, max = TUNE_CATS.find(c => c[0] === k)[3];
    if (d < 0) T[k] = Math.max(0, T[k] - 1);
    else if (T[k] < T.max[k]) T[k]++;
    else if (T.max[k] < max) {
      const cost = TUNE_COST[k][T.max[k]]; if (shopState.coins < cost) return;
      shopState.coins -= cost; T.max[k]++; T[k] = T.max[k]; saveShop(); updateCoins(true);
      initAudio(); sndBeep(660, 0.1, 0.12, 'triangle'); setTimeout(() => sndBeep(990, 0.15, 0.12, 'triangle'), 90);
    }
  } else if (b.dataset.tire !== undefined) {
    const i = +b.dataset.tire;
    if (!T.tires.includes(i)) { const p = TIRES[i].price; if (shopState.coins < p) return; shopState.coins -= p; T.tires.push(i); saveShop(); updateCoins(true); }
    T.tire = i;
  } else if (b.dataset.liv !== undefined) T.liv = +b.dataset.liv;
  saveTune(); applyTuning(); renderTuning();
});
$('tuneClose').onclick = closeTuning;
