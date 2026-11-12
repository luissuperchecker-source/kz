'use strict';
/* ======================= Controller (Xbox, PlayStation, Switch … über die Gamepad-API) =======================
   Alle Spiel-Aktionen sind frei belegbar (Optionen → „Controller anpassen“), gespeichert im Browser.
   In Menüs gilt immer: Stick/Steuerkreuz = auswählen, A = drücken, B = zurück, ←/→ = Regler ändern, Start = weiter. */
const PAD_NAMES = ['A / ✕', 'B / ○', 'X / □', 'Y / △', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2', 'View / Share', 'Start / Options',
  'L3 (Stick)', 'R3 (Stick)', '▲ Kreuz', '▼ Kreuz', '◀ Kreuz', '▶ Kreuz', 'Home / PS'];
const PAD_SHORT = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Start', 'L3', 'R3', '▲', '▼', '◀', '▶', 'Home'];
const PAD_ACTIONS = [
  ['fire', 'Schießen', 7], ['aim', 'Zielen', 6], ['jump', 'Springen / Wheelie', 0], ['crouch', 'Ducken', 1],
  ['reload', 'Nachladen', 2], ['ride', 'Moped auf/ab', 3], ['nade', 'Granate', 4], ['knife', 'Messer', 5],
  ['sprint', 'Sprinten', 10], ['inspect', 'Waffe ansehen', 11], ['next', 'Nächste Waffe', 15], ['prev', 'Vorige Waffe', 14],
  ['shopW', 'Ladenwaffe', 12], ['inv', 'Inventar', 13], ['board', 'Punktestand', 8], ['pause', 'Pause', 9],
];
// Achsen: [Schlüssel, Name, Aufforderung, erwartetes Vorzeichen, Standard-Achse (-1 = nicht belegt)]
// Lenkrad: „Laufen links/rechts“ = Lenkrad drehen; Gas- und Bremspedal sind eigene (freiwillige) Achsen.
const PAD_AXES = [
  ['moveY', 'Laufen vor/zurück', 'nach VORNE (oben)', -1, 1], ['moveX', 'Laufen / Lenken links/rechts', 'nach RECHTS (Lenkrad nach rechts drehen)', 1, 0],
  ['lookY', 'Umsehen hoch/runter', 'nach OBEN', -1, 3], ['lookX', 'Umsehen links/rechts', 'nach RECHTS', 1, 2],
  ['gas', 'Gaspedal (optional)', '– Gaspedal ganz durchtreten', 1, -1], ['brake', 'Bremspedal (optional)', '– Bremspedal ganz durchtreten', 1, -1],
];
const AXIS_NAMES = ['L-Stick ↔', 'L-Stick ↕', 'R-Stick ↔', 'R-Stick ↕'];
/* ---------- Alle Geräte zu einem „virtuellen Controller“ zusammenfassen ----------
   Gerät 1 (normaler Controller) behält die üblichen Nummern, weitere Geräte (z. B. Arduino-Lenkrad) bekommen eigene:
   Tasten ab 32 / 64 …, Achsen ab 16 / 32 … So können Lenkrad und Controller gleichzeitig benutzt werden. */
const SLOT_B = 32, SLOT_A = 16;
const isStdPad = p => p.mapping === 'standard' || (p.buttons.length >= 12 && p.buttons.length <= 20);
// vJoy = leeres virtuelles Gerät (Treiber-Rest) – würde sonst als „Controller 1“ zählen und echte Geräte verdrängen
const isJunkPad = p => /vjoy|virtual joystick/i.test(p.id);
function realPads() {
  const ps = navigator.getGamepads ? [...navigator.getGamepads()] : [];
  return ps.filter(p => p && p.connected && !isJunkPad(p) && ((p.axes && p.axes.length) || (p.buttons && p.buttons.length)))
    .sort((a, b) => (isStdPad(b) - isStdPad(a)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.index - b.index));
}
const padShortName = p => {
  if (!p) return 'Gerät';
  const w = p.id.replace(/\(.*?\)/g, '').replace(/\b(LLC|Inc|Corp|Co|Ltd|GmbH)\b\.?/gi, '').replace(/\s+/g, ' ').trim().split(' ');
  const u = w.filter((x, i) => i === 0 || x.toLowerCase() !== w[i - 1].toLowerCase());   // doppeltes Wort weglassen (Arduino Arduino Leonardo)
  return u.join(' ').slice(0, 24) || 'Gerät';
};
// Belegungen merken sich das Gerät (Name), damit sie stimmen, egal in welcher Reihenfolge Geräte angesteckt werden.
// Taste: Zahl = Taste eines normalen Controllers, { dev, k } = Taste k eines bestimmten Geräts. Achse: { a } oder { dev, k }.
function slotOf(dev) { const ps = realPads(); for (let s = 0; s < ps.length; s++) if (ps[s].id === dev) return s; return -1; }
function btnIndex(m) {
  if (m === undefined || m === null) return -1;
  if (typeof m === 'number') return m;
  const s = slotOf(m.dev); return s < 0 ? -1 : s * SLOT_B + m.k;
}
function axIndex(c) {
  if (!c) return -1;
  if (c.dev === undefined) return c.a;
  const s = slotOf(c.dev); return s < 0 ? -1 : s * SLOT_A + c.k;
}
function btnLabel(m) {
  if (m && typeof m === 'object' && slotOf(m.dev) < 0) return `${padShortName({ id: m.dev })} T${m.k + 1} (nicht da)`;
  return btnName(btnIndex(m));
}
function btnName(i) {
  if (i === undefined || i < 0) return '—';
  const s = Math.floor(i / SLOT_B), k = i % SLOT_B, p = realPads()[s];
  return (s === 0 && (!p || isStdPad(p)) && PAD_SHORT[k]) ? PAD_SHORT[k] : `${padShortName(p)} T${k + 1}`;
}
function axisName(a) {
  if (a === undefined || a < 0) return '— (nicht belegt)';
  const s = Math.floor(a / SLOT_A), k = a % SLOT_A, p = realPads()[s];
  return (s === 0 && (!p || isStdPad(p)) && AXIS_NAMES[k]) ? AXIS_NAMES[k] : `${padShortName(p)} Achse ${k + 1}`;
}
const PAD_DEFAULT = () => ({ map: Object.fromEntries(PAD_ACTIONS.map(a => [a[0], a[2]])), axes: Object.fromEntries(PAD_AXES.map(a => [a[0], { a: a[4], inv: false }])),
  sens: 1, dead: 0.15, invY: false, assist: true, rumble: true });
let PCFG = PAD_DEFAULT();
try {
  const s = JSON.parse(localStorage.getItem('kz_pad') || 'null');
  if (s && s.map) {
    PCFG = Object.assign(PAD_DEFAULT(), s); PCFG.map = Object.assign(PAD_DEFAULT().map, s.map); PCFG.axes = Object.assign(PAD_DEFAULT().axes, s.axes || {});
    if (s.swap && !s.axes) PCFG.axes = { moveX: { a: 2, inv: false }, moveY: { a: 3, inv: false }, lookX: { a: 0, inv: false }, lookY: { a: 1, inv: false } };   // alte Einstellung „Sticks tauschen“
    delete PCFG.swap;
  }
} catch (e) {}
// Achswert: Pedale (Ruhestellung bei ±1) werden auf 0 … 1 umgerechnet, normale Achsen bleiben -1 … 1
const padAxis = (gp, k) => {
  const c = PCFG.axes[k], ai = axIndex(c); if (!c || ai < 0) return 0;
  // Standard-Belegung nur für normale Controller – ein unbekanntes Gerät (Lenkrad) erst nach dem Einrichten benutzen
  if (!c.set && gp.pads && gp.pads[0] && !isStdPad(gp.pads[0]) && ai < SLOT_A) return 0;
  const raw = gp.axes[ai]; if (raw === undefined) return 0;
  const rest = c.r || 0, v = Math.abs(rest) > 0.5 ? (raw - rest) / 2 : raw;
  return v * (c.inv ? -1 : 1);
};
const savePad = () => { try { localStorage.setItem('kz_pad', JSON.stringify(PCFG)); } catch (e) {} };

// listen = { type: 'btn' | 'axis', key }; queue = weitere Schritte beim Einrichten der Reihe nach
const PAD = { prev: [], lastUse: -1e9, menuT: 0, menuDir: '', sprint: false, moved: false, focus: null, listen: null, listenT: 0, queue: [], base: [], waitRelease: false };
const padDz = v => Math.abs(v) < PCFG.dead ? 0 : (v - Math.sign(v) * PCFG.dead) / (1 - PCFG.dead);
function getPad() {
  const pads = realPads(); if (!pads.length) return null;
  const axes = [], buttons = [], off = { pressed: false, value: 0 };
  pads.forEach((p, s) => { p.axes.forEach((v, k) => { axes[s * SLOT_A + k] = v; }); p.buttons.forEach((b, k) => { buttons[s * SLOT_B + k] = b; }); });
  for (let i = 0; i < buttons.length; i++) if (!buttons[i]) buttons[i] = off;
  return { id: pads.map(padShortName).join(' + '), pads, axes, buttons, vibrationActuator: pads[0].vibrationActuator };
}
const padRecent = () => performance.now() - PAD.lastUse < 3000;

/* ---------- Hinweis-Einblendung + Vibration ---------- */
const padToast = document.createElement('div');
padToast.id = 'padToast'; document.body.appendChild(padToast);
function showPadToast(t) { padToast.textContent = t; padToast.classList.add('on'); clearTimeout(padToast._t); padToast._t = setTimeout(() => padToast.classList.remove('on'), 2600); }
window.addEventListener('gamepadconnected', e => {
  if (isJunkPad(e.gamepad)) return;
  showPadToast((isStdPad(e.gamepad) ? '🎮 Controller' : '🕹 Gerät') + ' erkannt: ' + padShortName(e.gamepad) + ' (' + e.gamepad.axes.length + ' Achsen, ' + e.gamepad.buttons.length + ' Tasten)');
  document.body.classList.add('hasPad'); renderPadCfg();
});
window.addEventListener('gamepaddisconnected', () => {
  showPadToast('🎮 Controller getrennt');
  if (!getPad()) document.body.classList.remove('hasPad');
  touchIn.mx = touchIn.my = 0; touchIn.sprint = false; me.trigger = false; me.scoped = false; keys.Space = false; keys.KeyC = false;
  renderPadCfg();
});
function rumble(ms, strong, weak) {
  const gp = getPad(); if (!gp || !padRecent() || !PCFG.rumble) return;
  const v = gp.vibrationActuator;
  try { if (v && v.playEffect) v.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) {}
}
const _padTryShoot = tryShoot;
window.tryShoot = now => { const before = me.lastShot; _padTryShoot(now); if (me.lastShot !== before) rumble(70, 0.15 + WEAPONS[me.weapon].kick * 3, 0.45); };
const _padClient = clientHandle;
window.clientHandle = m => {
  if (m.t === 'dmg' && m.id === myId) rumble(160, 0.7, 0.4);
  else if (m.t === 'kill' && m.v === myId) rumble(450, 1, 1);
  return _padClient(m);
};

/* ---------- Leichte Zielhilfe beim Anvisieren ---------- */
function padAimSnap() {
  let best = null, bestA = 0.14;   // ~8° Kegel
  const fx = -Math.sin(me.yaw) * Math.cos(me.pitch), fy = Math.sin(me.pitch), fz = -Math.cos(me.yaw) * Math.cos(me.pitch);
  const eye = camera.position;
  for (const id in world.players) {
    if (id === myId || friendly(id)) continue;
    const p = world.players[id]; if (!p.alive) continue;
    const dx = p.x - eye.x, dy = p.y + 1.25 - eye.y, dz = p.z - eye.z, d = Math.hypot(dx, dy, dz);
    if (d < 1 || d > 90) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy + dz * fz) / d)));
    if (ang >= bestA) continue;
    const h = rayMap(eye, new THREE.Vector3(dx / d, dy / d, dz / d), d);
    if (h && h.dist < d - 0.5) continue;
    bestA = ang; best = { dx, dy, dz, d };
  }
  if (!best) return;
  const ty = Math.atan2(-best.dx, -best.dz), tp = Math.asin(best.dy / best.d);
  let dyaw = ty - me.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  me.yaw += dyaw * 0.6; me.pitch += (tp - me.pitch) * 0.6;
}

/* ---------- Fenster „Controller anpassen“ ---------- */
const axisLabel = k => {
  const c = PCFG.axes[k], p0 = realPads()[0], ai = axIndex(c);
  if (c.dev !== undefined && ai < 0) return `${padShortName({ id: c.dev })} Achse ${c.k + 1} (nicht da)`;
  if (!c.set && p0 && !isStdPad(p0) && ai < SLOT_A) return '— (nicht belegt)';
  return axisName(ai) + (ai >= 0 && c.inv ? ' ⇄' : '') + (ai >= 0 && Math.abs(c.r || 0) > 0.5 ? ' (Pedal)' : '');
};
function renderPadCfg() {
  const gp = getPad(), st = $('padStatus'), L = PAD.listen;
  const step = PAD.queue.length || (L && PAD.wizard) ? ` (noch ${PAD.queue.length} danach)` : '';
  st.textContent = L ? (L.type === 'axis'
      ? `Bewege jetzt den Stick für „${PAD_AXES.find(a => a[0] === L.key)[1]}“ ${PAD_AXES.find(a => a[0] === L.key)[2]} …${step}`
      : `Drücke jetzt die Taste für „${PAD_ACTIONS.find(a => a[0] === L.key)[1]}“ …${step}`) + '  (Esc = abbrechen)'
    : gp ? '✅ Erkannt: ' + gp.pads.map((q, i) => (i + 1) + '. ' + padShortName(q) + ' (' + q.axes.length + ' Achsen, ' + q.buttons.length + ' Tasten)').join(' · ') : 'Kein Gerät erkannt – drücke einen Knopf am Controller oder dreh das Lenkrad einmal GANZ nach links und rechts (der Browser gibt Geräte erst danach frei).';
  st.classList.toggle('ok', !!gp && !L);
  const isL = (t, k) => L && L.type === t && L.key === k;
  $('padAxList').innerHTML = PAD_AXES.map(([k, label]) =>
    `<div class="padRow" data-row-axis="${k}"><span>${label}</span><button class="${isL('axis', k) ? 'listen' : 'sec'}" data-axis="${k}">${isL('axis', k) ? '…' : axisLabel(k)}</button></div>`).join('');
  $('padList').innerHTML = PAD_ACTIONS.map(([k, label]) =>
    `<div class="padRow" data-row-btn="${btnIndex(PCFG.map[k])}"><span>${label}</span><button class="${isL('btn', k) ? 'listen' : 'sec'}" data-pad="${k}">${isL('btn', k) ? '…' : btnLabel(PCFG.map[k])}</button></div>`).join('');
  $('padWizard').textContent = PAD.wizard ? '■ Einrichten abbrechen' : '▶ Alles der Reihe nach einrichten (Sticks/Lenkrad/Pedale + Tasten)';
  $('padSkip').classList.toggle('hidden', !L);
  $('padSensIn').value = PCFG.sens; $('padSensVal').textContent = PCFG.sens.toFixed(2);
  $('padDeadIn').value = PCFG.dead; $('padDeadVal').textContent = Math.round(PCFG.dead * 100) + ' %';
  $('padInvY').textContent = 'Blick-Y umkehren: ' + (PCFG.invY ? 'AN' : 'AUS');
  $('padAssist').textContent = 'Zielhilfe: ' + (PCFG.assist ? 'AN' : 'AUS');
  $('padRumble').textContent = 'Vibration: ' + (PCFG.rumble ? 'AN' : 'AUS');
  renderPadHelp();
  if (PAD.focus && !document.body.contains(PAD.focus)) {   // Liste neu gebaut: Fokus wiederherstellen
    const d = PAD.focus.dataset || {};
    padSetFocus(d.pad ? document.querySelector(`[data-pad="${d.pad}"]`) : d.axis ? document.querySelector(`[data-axis="${d.axis}"]`) : null);
  }
}
function renderPadHelp() {
  const s = k => `<b>${btnLabel(PCFG.map[k])}</b>`;
  const L = axisLabel('moveY').split(' ')[0], R = axisLabel('lookX').split(' ')[0];
  document.querySelectorAll('.padKeys').forEach(el => el.innerHTML = `<b>🎮 Controller</b><br>
    <b>${L}</b> laufen/fahren · ${s('sprint')} sprinten · <b>${R}</b> umsehen · ${s('fire')} schießen · ${s('aim')} zielen<br>
    ${s('jump')} springen/Wheelie · ${s('crouch')} ducken · ${s('reload')} nachladen · ${s('ride')} Moped · ${s('nade')} Granate · ${s('knife')} Messer<br>
    ${s('prev')} ${s('next')} Waffe · ${s('shopW')} Ladenwaffe · ${s('inspect')} ansehen · ${s('inv')} Inventar · ${s('board')} Punkte · ${s('pause')} Pause<br>
    <span style="opacity:.8">Belegung ändern: Optionen → Controller anpassen</span>`);
}
function startListen(key, type = 'btn', keepRest = false) {
  const gp = getPad();
  PAD.listen = { type, key }; PAD.listenT = 8;
  if (!keepRest || !PAD.base.length) PAD.base = gp ? Array.from(gp.axes) : [];   // Ruhestellung merken (Trigger/Pedale ruhen oft bei -1)
  PAD.waitRelease = true;                  // erst loslassen, dann zählt die nächste Bewegung
  renderPadCfg();
}
function stopListen() { PAD.listen = null; PAD.queue = []; PAD.wizard = false; renderPadCfg(); }
function nextListen() {
  if (PAD.queue.length) { const [t, k] = PAD.queue.shift(); startListen(k, t, true); }
  else { if (PAD.wizard) showPadToast('✅ Fertig eingerichtet!'); PAD.listen = null; PAD.wizard = false; renderPadCfg(); }
}
function assignPad(btn) {
  const k = PAD.listen.key;
  const old = PCFG.map[k], s = Math.floor(btn / SLOT_B), p = realPads()[s];
  const entry = s === 0 && p && isStdPad(p) ? btn : { dev: p ? p.id : '', k: btn % SLOT_B };   // Lenkrad & Co.: Gerät merken
  // doppelt belegt → Tasten tauschen (aber nur echte Konflikte: Standard-Nummern gelten für normale Controller, nicht fürs Lenkrad)
  for (const a in PCFG.map) if (a !== k && btnIndex(PCFG.map[a]) === btn && (typeof PCFG.map[a] === 'object' || typeof entry === 'number')) PCFG.map[a] = old;
  PCFG.map[k] = entry; savePad();
  sndBeep(880, 0.08, 0.1, 'triangle');
  showPadToast(`${PAD_ACTIONS.find(a => a[0] === k)[1]} → ${btn < SLOT_B && PAD_NAMES[btn] && realPads()[0] && isStdPad(realPads()[0]) ? PAD_NAMES[btn] : btnName(btn)}`);
  nextListen();
}
function assignAxis(ax, val) {
  const k = PAD.listen.key, def = PAD_AXES.find(a => a[0] === k);
  const inv = Math.sign(val) !== def[3];
  const old = PCFG.axes[k];
  const rest = PAD.base[ax] || 0;   // Ruhestellung (Pedal bei -1/+1, Stick/Lenkrad bei 0)
  const s = Math.floor(ax / SLOT_A), p = realPads()[s], std = s === 0 && p && isStdPad(p);
  // Achse schon vergeben → tauschen (Standard-Belegungen eines normalen Controllers bleiben beim Lenkrad-Einrichten unangetastet)
  for (const o in PCFG.axes) { const c = PCFG.axes[o]; if (o !== k && axIndex(c) === ax && (std || c.dev !== undefined)) PCFG.axes[o] = Object.assign({}, old); }
  const r = Math.abs(rest) > 0.5 ? rest : 0;
  PCFG.axes[k] = s === 0 && p && isStdPad(p) ? { a: ax, inv, r, set: true } : { dev: p ? p.id : '', k: ax % SLOT_A, a: ax, inv, r, set: true }; savePad();
  sndBeep(880, 0.08, 0.1, 'triangle');
  showPadToast(`${def[1]} → ${axisLabel(k)}`);
  nextListen();
}
$('padList').addEventListener('click', e => { const b = e.target.closest('[data-pad]'); if (b) { PAD.queue = []; PAD.wizard = false; startListen(b.dataset.pad, 'btn'); } });
$('padAxList').addEventListener('click', e => { const b = e.target.closest('[data-axis]'); if (b) { PAD.queue = []; PAD.wizard = false; startListen(b.dataset.axis, 'axis'); } });
$('padSkip').onclick = () => { if (PAD.listen) { showPadToast('Übersprungen'); nextListen(); } };
$('padWizard').onclick = () => {
  if (PAD.wizard) return stopListen();
  PAD.queue = [...PAD_AXES.map(a => ['axis', a[0]]), ...PAD_ACTIONS.map(a => ['btn', a[0]])];
  PAD.wizard = true; PAD.base = []; nextListen();
};

/* ---------- Live-Anzeige: beide Sticks (wie belegt), alle Achsen und Tasten ---------- */
function drawPadViz(gp) {
  const cv = $('padViz'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const stick = (cx, title, kx, ky) => {
    const R = 46, cy = 66;
    g.strokeStyle = '#3f5a3f'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,204,51,.35)'; g.beginPath(); g.arc(cx, cy, R * PCFG.dead, 0, 7); g.stroke();   // toter Bereich
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    const x = gp ? padAxis(gp, kx) : 0, y = gp ? padAxis(gp, ky) : 0, on = Math.hypot(x, y) > PCFG.dead;
    g.fillStyle = on ? '#ffcc33' : '#8aa08a'; g.beginPath(); g.arc(cx + x * R, cy + y * R, 9, 0, 7); g.fill();
    g.fillStyle = '#cfe0cf'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText(title, cx, 138);
  };
  stick(62, 'Laufen', 'moveX', 'moveY');
  stick(178, 'Umsehen', 'lookX', 'lookY');
  // alle Achsen als Balken
  const axes = gp ? gp.axes : [], idx = [];
  for (let i = 0; i < axes.length; i++) if (axes[i] !== undefined) idx.push(i);
  if (!idx.length) idx.push(0, 1, 2, 3);
  g.textAlign = 'left'; g.font = '10px sans-serif';
  for (let r = 0; r < Math.min(idx.length, 8); r++) {
    const i = idx[r], y = 14 + r * 16, x0 = 262, w = 120, v = axes[i] || 0;
    const used = Object.values(PCFG.axes).some(c => axIndex(c) === i);
    g.fillStyle = used ? '#cfe0cf' : '#6f826f'; g.fillText(axisName(i).slice(0, 18), x0, y + 4);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x0 + 100, y - 5, w, 10);
    g.fillStyle = Math.abs(v) > 0.5 ? '#ffcc33' : '#5fa36a'; g.fillRect(x0 + 100 + w / 2, y - 5, v * w / 2, 10);
  }
  // Tasten als Punkte
  const bs = gp ? gp.buttons : [], bidx = [];
  for (let i = 0; i < bs.length; i++) if (gp.buttons[i] && (i < SLOT_B || i % SLOT_B < gp.pads[Math.floor(i / SLOT_B)].buttons.length)) bidx.push(i);
  for (let r = 0; r < Math.min(bidx.length || 17, 17); r++) {
    const i = bidx.length ? bidx[r] : r, on = bs[i] && (bs[i].pressed || bs[i].value > 0.35), x = 262 + (r % 9) * 28, y = 150 - (r < 9 ? 16 : 2) - 0;
    g.fillStyle = on ? '#ffcc33' : 'rgba(255,255,255,.1)'; g.beginPath(); g.arc(x + 8, y - 6, 8, 0, 7); g.fill();
    g.fillStyle = on ? '#1d1600' : '#8aa08a'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.fillText(i < SLOT_B && gp && isStdPad(gp.pads[0]) ? PAD_SHORT[i] || i : 'T' + (i % SLOT_B + 1), x + 8, y - 3);
  }
  // gedrückte Tasten in der Liste aufleuchten lassen
  document.querySelectorAll('#padList .padRow').forEach(r => { const b = bs[+r.dataset.rowBtn]; r.classList.toggle('hot', !!(b && (b.pressed || b.value > 0.35))); });
  document.querySelectorAll('#padAxList .padRow').forEach(r => r.classList.toggle('hot', !!gp && Math.abs(padAxis(gp, r.dataset.rowAxis)) > 0.5));
}
$('padSensIn').oninput = e => { PCFG.sens = parseFloat(e.target.value); savePad(); $('padSensVal').textContent = PCFG.sens.toFixed(2); };
$('padDeadIn').oninput = e => { PCFG.dead = parseFloat(e.target.value); savePad(); $('padDeadVal').textContent = Math.round(PCFG.dead * 100) + ' %'; };
for (const [id, key] of [['padInvY', 'invY'], ['padAssist', 'assist'], ['padRumble', 'rumble']])
  $(id).onclick = () => { PCFG[key] = !PCFG[key]; savePad(); renderPadCfg(); if (key === 'rumble' && PCFG.rumble) { PAD.lastUse = performance.now(); rumble(200, 0.6, 0.6); } };
$('padReset').onclick = () => { PCFG = PAD_DEFAULT(); savePad(); stopListen(); showPadToast('Standard-Belegung wiederhergestellt'); };
$('padClose').onclick = () => { stopListen(); $('padCfg').classList.add('hidden'); };
$('btnPadCfg').onclick = () => { stopListen(); $('padCfg').classList.remove('hidden'); };
document.addEventListener('keydown', e => { if (e.code === 'Escape' && PAD.listen) stopListen(); });
renderPadCfg();

/* ---------- Menüs mit dem Controller bedienen ---------- */
function padLayer() {
  for (const id of ['gunCard', 'boerse', 'tune', 'kbCfg', 'padCfg', 'shop', 'settings', 'inv', 'pause', 'menu']) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none') return el;
  }
  return null;
}
function padItems(layer) {
  return [...layer.querySelectorAll('button, select, input[type=range], .bRow[data-k]')].filter(e => !e.disabled && e.offsetWidth > 0 && e.offsetHeight > 0);
}
function padSetFocus(el) {
  if (PAD.focus) PAD.focus.classList.remove('padFocus');
  PAD.focus = el;
  if (el) { el.classList.add('padFocus'); try { el.focus({ preventScroll: true }); } catch (e) {} el.scrollIntoView({ block: 'nearest' }); }
}
function padMove(items, dir) {
  const cur = items.includes(PAD.focus) ? PAD.focus : null;
  if (!cur) return padSetFocus(items[0]);
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bestS = Infinity;
  for (const it of items) {
    if (it === cur) continue;
    const q = it.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2;
    const dx = x - cx, dy = y - cy;
    const main = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    const side = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    if (main <= 4) continue;
    const s = main + side * 2.2;
    if (s < bestS) { bestS = s; best = it; }
  }
  if (best) { padSetFocus(best); sndClick(0.03, 2.2); }
}
function padAdjust(el, dir) {
  if (el.tagName === 'SELECT') {
    el.selectedIndex = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + dir));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    const st = parseFloat(el.step) || 1, v = Math.max(+el.min, Math.min(+el.max, parseFloat(el.value) + dir * st * 2));
    el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  sndClick(0.03, 2.2);
}
function padResume() { initAudio(); setLocked(true); document.body.classList.add('padPlay'); }
function padMenu(gp, pressed, dt) {
  const layer = padLayer(); if (!layer) return;
  const items = padItems(layer); if (!items.length) return;
  if (!items.includes(PAD.focus)) padSetFocus(layer.id === 'pause' ? (items.find(e => e.id === 'btnResume') || items[0]) : layer.id === 'menu' ? (items.find(e => e.id === 'btnQuick') || items[0]) : items[0]);
  const ax = padDz(padAxis(gp, 'moveX')), ay = padDz(padAxis(gp, 'moveY')), b = i => gp.buttons[i] && gp.buttons[i].pressed;
  const dir = b(12) || ay < -0.5 ? 'up' : b(13) || ay > 0.5 ? 'down' : b(14) || ax < -0.5 ? 'left' : b(15) || ax > 0.5 ? 'right' : '';
  PAD.menuT -= dt;
  if (dir && (dir !== PAD.menuDir || PAD.menuT <= 0)) {
    PAD.menuT = dir !== PAD.menuDir ? 0.32 : 0.12;
    const f = PAD.focus;
    if ((dir === 'left' || dir === 'right') && f && (f.tagName === 'SELECT' || f.type === 'range')) padAdjust(f, dir === 'right' ? 1 : -1);
    else padMove(items, dir);
  }
  PAD.menuDir = dir;
  if (pressed(0) && PAD.focus) {   // A
    if (PAD.focus.id === 'btnResume') padResume();
    else if (PAD.focus.tagName === 'SELECT') padAdjust(PAD.focus, 1);
    else if (PAD.focus.type !== 'range') PAD.focus.click();
  }
  if (pressed(1)) {   // B = zurück
    const close = { boerse: 'boClose', tune: 'tuneClose', kbCfg: 'kbClose', padCfg: 'padClose', shop: 'shopClose', settings: 'setClose', inv: 'invClose' }[layer.id];
    if (layer.id === 'gunCard') gcClose();
    else if (close) $(close).click();
    else if (layer.id === 'pause') padResume();
  }
  if (pressed(9)) {   // Start
    if (layer.id === 'pause') padResume();
    else if (layer.id === 'menu') $('btnQuick').click();
  }
}

/* ---------- Steuerung im Spiel (frei belegbar) ---------- */
function padGame(gp, pressed, released, dt) {
  const M = PCFG.map, on = a => pressed(btnIndex(M[a])), off = a => released(btnIndex(M[a]));
  // Im Fahrzeug: Lenken fast ohne Totzone (Lenkrad soll sofort reagieren)
  const rawX = padAxis(gp, 'moveX'), lx = ride.v >= 0 ? (Math.abs(rawX) < 0.02 ? 0 : (rawX - Math.sign(rawX) * 0.02) / 0.98) : padDz(rawX), ly = padDz(padAxis(gp, 'moveY')), rx = padDz(padAxis(gp, 'lookX'));
  let ry = padDz(padAxis(gp, 'lookY'));
  if (PCFG.invY) ry = -ry;
  // Pedale (Lenkrad): Gas nach vorne, Bremse nach hinten – überschreiben den Stick, wenn getreten
  const gasP = Math.max(0, padAxis(gp, 'gas')), brkP = Math.max(0, padAxis(gp, 'brake'));
  let my = ly; if (gasP > 0.04 || brkP > 0.04) my = brkP - gasP;
  if (lx || my) { touchIn.mx = lx; touchIn.my = my; PAD.moved = true; }
  else if (PAD.moved) { touchIn.mx = touchIn.my = 0; PAD.moved = false; }
  if (on('sprint')) PAD.sprint = !PAD.sprint;
  if (ly > -0.3) PAD.sprint = false;
  touchIn.sprint = PAD.sprint;
  if (rx || ry) {
    const w = WEAPONS[me.weapon], sc = me.scoped ? (w.scope ? 0.32 : 0.55) : 1;
    const curve = v => Math.sign(v) * Math.pow(Math.abs(v), 1.7);
    const rate = 3.1 * PCFG.sens * sc;
    me.yaw -= curve(rx) * rate * dt; me.pitch -= curve(ry) * rate * 0.72 * dt;
    me.pitch = Math.max(-1.55, Math.min(1.55, me.pitch));
    me.swayX = Math.max(-0.08, Math.min(0.08, me.swayX + curve(rx) * 0.012));
    me.swayY = Math.max(-0.06, Math.min(0.06, me.swayY + curve(ry) * 0.01));
    if (ride.v >= 0) ride.lastMouse = performance.now();
  }
  if (on('fire')) { me.trigger = true; me.firedPress = false; } else if (off('fire')) me.trigger = false;
  if (on('aim')) { me.scoped = true; if (me.alive && PCFG.assist) padAimSnap(); } else if (off('aim')) me.scoped = false;
  if (on('jump')) keys.Space = keys.Handbrake = true; else if (off('jump')) keys.Space = keys.Handbrake = false;   // Sprung-Taste = auch Handbremse im Auto
  if (on('crouch')) { startCrouch(); keys.KeyC = true; PAD.sprint = false; } else if (off('crouch')) keys.KeyC = false;
  if (on('reload')) startReload();
  if (on('ride')) { if (ride.v < 0 && nearGunShop()) openGunShop(); else toggleRide(); }
  if (on('nade')) throwNade();
  if (on('knife')) knifeAttack();
  const N = WEAPONS.length, step = d => { let n = me.weapon; for (let i = 0; i < N; i++) { n = (n + d + N) % N; if (me.owned[n]) break; } switchWeapon(n); };
  if (on('next')) step(1);
  if (on('prev')) step(-1);
  if (on('shopW')) { const sp = me.owned.findIndex((o, i) => o && i >= BASE_WEAPONS); if (sp >= 0) switchWeapon(sp); }
  if (on('inspect') && me.alive && me.reloading <= 0) me.inspectT = 2.2;
  if (on('inv')) toggleInventory();
  if (on('board')) { $('board').classList.remove('hidden'); renderBoard(); } else if (off('board')) $('board').classList.add('hidden');
  if (on('pause')) { if (document.pointerLockElement) document.exitPointerLock(); setLocked(false); }
}

// Lenkrad & Co. (kein normaler Controller) beim ersten Erkennen automatisch einrichten: erste Achse = Lenken
function autoSetupDevices() {
  for (const p of realPads()) {
    if (isStdPad(p) || !p.axes.length) continue;
    PCFG.auto = PCFG.auto || {};
    if (PCFG.auto[p.id]) continue;
    PCFG.auto[p.id] = true;
    const used = Object.values(PCFG.axes).some(c => c.dev === p.id);
    if (!used) {
      const rest = p.axes[0] || 0;
      // Arduino-Lenkrad (Hersteller 2341) meldet links/rechts vertauscht
      PCFG.axes.moveX = { dev: p.id, k: 0, a: 0, inv: /2341/.test(p.id), r: Math.abs(rest) > 0.5 ? rest : 0, set: true };
      showPadToast(`🕹 ${padShortName(p)} als Lenkrad eingerichtet (Achse 1 = lenken, Gas mit /, Bremse S). Ändern: Optionen → Controller anpassen`);
    }
    savePad(); renderPadCfg();
  }
}
function pollGamepad(dt) {
  if (realPads().length) autoSetupDevices();
  const gp = getPad();
  if (!$('padCfg').classList.contains('hidden')) drawPadViz(gp);
  if (PAD.listen) {   // wartet auf eine neue Taste / Stick-Bewegung
    PAD.listenT -= dt;
    if (PAD.listenT <= 0) { stopListen(); showPadToast('Abgebrochen (keine Eingabe)'); }
  }
  if (!gp) return;
  const cur = gp.buttons.map(x => !!(x.pressed || x.value > 0.35));
  const pressed = i => cur[i] && !PAD.prev[i], released = i => !cur[i] && PAD.prev[i];
  if (cur.some(Boolean) || gp.axes.slice(0, 4).some(a => Math.abs(a) > 0.3)) {
    PAD.lastUse = performance.now();
    if (!document.body.classList.contains('hasPad')) { document.body.classList.add('hasPad'); renderPadCfg(); }
  }
  if (PAD.listen) {
    for (let k = 0; k < gp.axes.length; k++) if (gp.axes[k] !== undefined && PAD.base[k] === undefined) PAD.base[k] = gp.axes[k];   // neu angestecktes Gerät: Ruhestellung übernehmen
    const moved = gp.axes.map((v, k) => v - (PAD.base[k] || 0));
    if (PAD.waitRelease) {   // erst alles loslassen (Stick in Ruhe, keine Taste), dann zählt die nächste Eingabe
      if (!cur.some(Boolean) && moved.every(d => Math.abs(d) < 0.3)) PAD.waitRelease = false;
    } else if (PAD.listen.type === 'btn') {
      const i = cur.findIndex((v, k) => v && !PAD.prev[k]);
      if (i >= 0) assignPad(i);
    } else {
      let best = -1, bv = 0.6;
      moved.forEach((d, k) => { if (Math.abs(d) > bv) { bv = Math.abs(d); best = k; } });
      if (best >= 0) assignAxis(best, gp.axes[best] - (PAD.base[best] || 0));
    }
    PAD.prev = cur; return;
  }
  const overlay = ['gunCard', 'boerse', 'tune', 'kbCfg', 'padCfg', 'shop', 'settings', 'inv'].some(id => !$(id).classList.contains('hidden'));
  if (running && locked && !overlay) {
    if (PAD.focus) padSetFocus(null);
    padGame(gp, pressed, released, dt);
  } else {
    if (PAD.moved) { touchIn.mx = touchIn.my = 0; PAD.moved = false; }
    // Inventar im Spiel: gleiche Taste schließt es wieder
    if (running && !$('inv').classList.contains('hidden') && pressed(btnIndex(PCFG.map.inv))) { toggleInventory(false); PAD.prev = cur; return; }
    padMenu(gp, pressed, dt);
  }
  PAD.prev = cur;
}
// Im Controller-Modus (ohne Maussperre) öffnet Esc trotzdem die Pause
document.addEventListener('keydown', e => { if (e.code === 'Escape' && running && locked && !document.pointerLockElement && !TOUCH && !PAD.listen) setLocked(false); });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) document.body.classList.remove('padPlay'); });
window.pollGamepad = pollGamepad;
