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
const PAD_DEFAULT = () => ({ map: Object.fromEntries(PAD_ACTIONS.map(a => [a[0], a[2]])), sens: 1, dead: 0.15, invY: false, swap: false, assist: true, rumble: true });
let PCFG = PAD_DEFAULT();
try { const s = JSON.parse(localStorage.getItem('kz_pad') || 'null'); if (s && s.map) { PCFG = Object.assign(PAD_DEFAULT(), s); PCFG.map = Object.assign(PAD_DEFAULT().map, s.map); } } catch (e) {}
const savePad = () => { try { localStorage.setItem('kz_pad', JSON.stringify(PCFG)); } catch (e) {} };

const PAD = { prev: [], lastUse: -1e9, menuT: 0, menuDir: '', sprint: false, moved: false, focus: null, listen: null, listenT: 0 };
const padDz = v => Math.abs(v) < PCFG.dead ? 0 : (v - Math.sign(v) * PCFG.dead) / (1 - PCFG.dead);
function getPad() {
  const ps = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of ps) if (p && p.connected && p.buttons && p.buttons.length >= 12) return p;
  return null;
}
const padRecent = () => performance.now() - PAD.lastUse < 3000;

/* ---------- Hinweis-Einblendung + Vibration ---------- */
const padToast = document.createElement('div');
padToast.id = 'padToast'; document.body.appendChild(padToast);
function showPadToast(t) { padToast.textContent = t; padToast.classList.add('on'); clearTimeout(padToast._t); padToast._t = setTimeout(() => padToast.classList.remove('on'), 2600); }
window.addEventListener('gamepadconnected', e => {
  showPadToast('🎮 Controller verbunden – ' + e.gamepad.id.replace(/\(.*\)/, '').trim().slice(0, 40));
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
function renderPadCfg() {
  const gp = getPad(), st = $('padStatus');
  st.textContent = PAD.listen ? `Drücke jetzt die neue Taste für „${PAD_ACTIONS.find(a => a[0] === PAD.listen)[1]}“ … (Esc/abwarten = abbrechen)`
    : gp ? '✅ Verbunden: ' + gp.id.replace(/\(.*\)/, '').trim().slice(0, 50) : 'Kein Controller erkannt – drücke einen Knopf am Controller.';
  st.classList.toggle('ok', !!gp && !PAD.listen);
  $('padList').innerHTML = PAD_ACTIONS.map(([k, label]) =>
    `<div class="padRow"><span>${label}</span><button class="${PAD.listen === k ? 'listen' : 'sec'}" data-pad="${k}">${PAD.listen === k ? '…' : PAD_SHORT[PCFG.map[k]] || '?'}</button></div>`).join('');
  $('padSensIn').value = PCFG.sens; $('padSensVal').textContent = PCFG.sens.toFixed(2);
  $('padDeadIn').value = PCFG.dead; $('padDeadVal').textContent = Math.round(PCFG.dead * 100) + ' %';
  $('padInvY').textContent = 'Y-Achse umkehren: ' + (PCFG.invY ? 'AN' : 'AUS');
  $('padSwap').textContent = 'Sticks tauschen: ' + (PCFG.swap ? 'AN' : 'AUS');
  $('padAssist').textContent = 'Zielhilfe: ' + (PCFG.assist ? 'AN' : 'AUS');
  $('padRumble').textContent = 'Vibration: ' + (PCFG.rumble ? 'AN' : 'AUS');
  renderPadHelp();
  if (PAD.focus && !document.body.contains(PAD.focus)) {   // Liste neu gebaut: Fokus wiederherstellen
    const k = PAD.focus.dataset && PAD.focus.dataset.pad;
    padSetFocus(k ? document.querySelector(`[data-pad="${k}"]`) : null);
  }
}
function renderPadHelp() {
  const s = k => `<b>${PAD_SHORT[PCFG.map[k]]}</b>`;
  const L = PCFG.swap ? 'R' : 'L', R = PCFG.swap ? 'L' : 'R';
  document.querySelectorAll('.padKeys').forEach(el => el.innerHTML = `<b>🎮 Controller</b><br>
    <b>${L}-Stick</b> laufen/fahren · ${s('sprint')} sprinten · <b>${R}-Stick</b> umsehen · ${s('fire')} schießen · ${s('aim')} zielen<br>
    ${s('jump')} springen/Wheelie · ${s('crouch')} ducken · ${s('reload')} nachladen · ${s('ride')} Moped · ${s('nade')} Granate · ${s('knife')} Messer<br>
    ${s('prev')} ${s('next')} Waffe · ${s('shopW')} Ladenwaffe · ${s('inspect')} ansehen · ${s('inv')} Inventar · ${s('board')} Punkte · ${s('pause')} Pause<br>
    <span style="opacity:.8">Belegung ändern: Optionen → Controller anpassen</span>`);
}
function startListen(k) { PAD.listen = k; PAD.listenT = 6; renderPadCfg(); }
function assignPad(btn) {
  const k = PAD.listen; PAD.listen = null;
  const old = PCFG.map[k];
  for (const a in PCFG.map) if (a !== k && PCFG.map[a] === btn) PCFG.map[a] = old;   // doppelt belegt → Tasten tauschen
  PCFG.map[k] = btn; savePad(); renderPadCfg();
  sndBeep(880, 0.08, 0.1, 'triangle');
  showPadToast(`${PAD_ACTIONS.find(a => a[0] === k)[1]} → ${PAD_NAMES[btn] || 'Taste ' + btn}`);
}
$('padList').addEventListener('click', e => { const b = e.target.closest('[data-pad]'); if (b) startListen(b.dataset.pad); });
$('padSensIn').oninput = e => { PCFG.sens = parseFloat(e.target.value); savePad(); $('padSensVal').textContent = PCFG.sens.toFixed(2); };
$('padDeadIn').oninput = e => { PCFG.dead = parseFloat(e.target.value); savePad(); $('padDeadVal').textContent = Math.round(PCFG.dead * 100) + ' %'; };
for (const [id, key] of [['padInvY', 'invY'], ['padSwap', 'swap'], ['padAssist', 'assist'], ['padRumble', 'rumble']])
  $(id).onclick = () => { PCFG[key] = !PCFG[key]; savePad(); renderPadCfg(); if (key === 'rumble' && PCFG.rumble) { PAD.lastUse = performance.now(); rumble(200, 0.6, 0.6); } };
$('padReset').onclick = () => { PCFG = PAD_DEFAULT(); PAD.listen = null; savePad(); renderPadCfg(); showPadToast('Standard-Belegung wiederhergestellt'); };
$('padClose').onclick = () => { PAD.listen = null; $('padCfg').classList.add('hidden'); };
$('btnPadCfg').onclick = () => { PAD.listen = null; renderPadCfg(); $('padCfg').classList.remove('hidden'); };
document.addEventListener('keydown', e => { if (e.code === 'Escape' && PAD.listen) { PAD.listen = null; renderPadCfg(); } });
renderPadCfg();

/* ---------- Menüs mit dem Controller bedienen ---------- */
function padLayer() {
  for (const id of ['padCfg', 'shop', 'settings', 'inv', 'pause', 'menu']) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none') return el;
  }
  return null;
}
function padItems(layer) {
  return [...layer.querySelectorAll('button, select, input[type=range]')].filter(e => !e.disabled && e.offsetWidth > 0 && e.offsetHeight > 0);
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
  const ax = padDz(gp.axes[0] || 0), ay = padDz(gp.axes[1] || 0), b = i => gp.buttons[i] && gp.buttons[i].pressed;
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
    const close = { padCfg: 'padClose', shop: 'shopClose', settings: 'setClose', inv: 'invClose' }[layer.id];
    if (close) $(close).click();
    else if (layer.id === 'pause') padResume();
  }
  if (pressed(9)) {   // Start
    if (layer.id === 'pause') padResume();
    else if (layer.id === 'menu') $('btnQuick').click();
  }
}

/* ---------- Steuerung im Spiel (frei belegbar) ---------- */
function padGame(gp, pressed, released, dt) {
  const M = PCFG.map, on = a => pressed(M[a]), off = a => released(M[a]);
  let lx = padDz(gp.axes[0] || 0), ly = padDz(gp.axes[1] || 0), rx = padDz(gp.axes[2] || 0), ry = padDz(gp.axes[3] || 0);
  if (PCFG.swap) [lx, ly, rx, ry] = [rx, ry, lx, ly];
  if (PCFG.invY) ry = -ry;
  if (lx || ly) { touchIn.mx = lx; touchIn.my = ly; PAD.moved = true; }
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
  if (on('jump')) keys.Space = true; else if (off('jump')) keys.Space = false;
  if (on('crouch')) { startCrouch(); keys.KeyC = true; PAD.sprint = false; } else if (off('crouch')) keys.KeyC = false;
  if (on('reload')) startReload();
  if (on('ride')) toggleRide();
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

function pollGamepad(dt) {
  const gp = getPad();
  if (PAD.listen) {   // wartet auf eine neue Taste
    PAD.listenT -= dt;
    if (PAD.listenT <= 0) { PAD.listen = null; renderPadCfg(); }
  }
  if (!gp) return;
  const cur = gp.buttons.map(x => !!(x.pressed || x.value > 0.35));
  const pressed = i => cur[i] && !PAD.prev[i], released = i => !cur[i] && PAD.prev[i];
  if (cur.some(Boolean) || gp.axes.slice(0, 4).some(a => Math.abs(a) > 0.3)) {
    PAD.lastUse = performance.now();
    if (!document.body.classList.contains('hasPad')) { document.body.classList.add('hasPad'); renderPadCfg(); }
  }
  if (PAD.listen) {
    const i = cur.findIndex((v, k) => v && !PAD.prev[k]);
    if (i >= 0) assignPad(i);
    PAD.prev = cur; return;
  }
  const overlay = ['padCfg', 'shop', 'settings', 'inv'].some(id => !$(id).classList.contains('hidden'));
  if (running && locked && !overlay) {
    if (PAD.focus) padSetFocus(null);
    padGame(gp, pressed, released, dt);
  } else {
    if (PAD.moved) { touchIn.mx = touchIn.my = 0; PAD.moved = false; }
    // Inventar im Spiel: gleiche Taste schließt es wieder
    if (running && !$('inv').classList.contains('hidden') && pressed(PCFG.map.inv)) { toggleInventory(false); PAD.prev = cur; return; }
    padMenu(gp, pressed, dt);
  }
  PAD.prev = cur;
}
// Im Controller-Modus (ohne Maussperre) öffnet Esc trotzdem die Pause
document.addEventListener('keydown', e => { if (e.code === 'Escape' && running && locked && !document.pointerLockElement && !TOUCH && !PAD.listen) setLocked(false); });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) document.body.classList.remove('padPlay'); });
window.pollGamepad = pollGamepad;
