'use strict';
/* ======================= Controller (Xbox, PlayStation, Switch … über die Gamepad-API) =======================
   Belegung (Standard-Layout):
   linker Stick = laufen / Moped fahren, L3 = sprinten, rechter Stick = umsehen, R3 = Messer
   RT = schießen, LT = zielen (mit leichter Zielhilfe), A = springen / Wheelie, B = ducken, X = nachladen,
   Y = Moped auf-/absteigen, LB = Granate, RB = Messer, Steuerkreuz ←/→ = Waffe wechseln, ↑ = Ladenwaffe,
   ↓ = Waffe ansehen, Start = Pause, Select/View (halten) = Punktestand.
   In Menüs: Stick/Steuerkreuz = auswählen, A = drücken, B = zurück, ←/→ = Regler/Auswahl ändern. */
const PAD = { prev: [], dead: 0.15, lastUse: -1e9, menuT: 0, menuDir: '', sprint: false, moved: false, focus: null };
const padDz = v => Math.abs(v) < PAD.dead ? 0 : (v - Math.sign(v) * PAD.dead) / (1 - PAD.dead);
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
  document.body.classList.add('hasPad');
});
window.addEventListener('gamepaddisconnected', () => {
  showPadToast('🎮 Controller getrennt');
  if (!getPad()) document.body.classList.remove('hasPad');
  touchIn.mx = touchIn.my = 0; touchIn.sprint = false; me.trigger = false; me.scoped = false; keys.Space = false; keys.KeyC = false;
});
function rumble(ms, strong, weak) {
  const gp = getPad(); if (!gp || !padRecent()) return;
  const v = gp.vibrationActuator;
  try { if (v && v.playEffect) v.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) {}
}
// Rückmeldung beim Schießen, bei Treffern gegen dich und beim eigenen Tod
const _padTryShoot = tryShoot;
window.tryShoot = now => { const before = me.lastShot; _padTryShoot(now); if (me.lastShot !== before) rumble(70, 0.15 + WEAPONS[me.weapon].kick * 3, 0.45); };
const _padClient = clientHandle;
window.clientHandle = m => {
  if (m.t === 'dmg' && m.id === myId) rumble(160, 0.7, 0.4);
  else if (m.t === 'kill' && m.v === myId) rumble(450, 1, 1);
  return _padClient(m);
};

/* ---------- Leichte Zielhilfe beim Anvisieren (LT) ---------- */
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
    if (h && h.dist < d - 0.5) continue;   // Wand dazwischen
    bestA = ang; best = { dx, dy, dz, d };
  }
  if (!best) return;
  const ty = Math.atan2(-best.dx, -best.dz), tp = Math.asin(best.dy / best.d);
  let dyaw = ty - me.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  me.yaw += dyaw * 0.6; me.pitch += (tp - me.pitch) * 0.6;
}

/* ---------- Menüs mit dem Controller bedienen ---------- */
function padLayer() {
  for (const id of ['shop', 'settings', 'inv', 'pause', 'menu']) {
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
function padAdjust(el, dir) {   // Regler / Auswahlliste mit ←/→ ändern
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
    const close = { shop: 'shopClose', settings: 'setClose', inv: 'invClose' }[layer.id];
    if (close) $(close).click();
    else if (layer.id === 'pause') padResume();
  }
  if (pressed(9)) {   // Start
    if (layer.id === 'pause') padResume();
    else if (layer.id === 'menu') $('btnQuick').click();
  }
}

/* ---------- Steuerung im Spiel ---------- */
function padGame(gp, pressed, released, dt) {
  const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.35));
  const lx = padDz(gp.axes[0] || 0), ly = padDz(gp.axes[1] || 0), rx = padDz(gp.axes[2] || 0), ry = padDz(gp.axes[3] || 0);
  // Laufen / Fahren über den gleichen Weg wie der Handy-Joystick
  if (lx || ly) { touchIn.mx = lx; touchIn.my = ly; PAD.moved = true; }
  else if (PAD.moved) { touchIn.mx = touchIn.my = 0; PAD.moved = false; }
  if (pressed(10)) PAD.sprint = !PAD.sprint;
  if (ly > -0.3 || b(1)) PAD.sprint = false;
  touchIn.sprint = PAD.sprint;
  // Umsehen: Kurve für feines Zielen, langsamer beim Anvisieren
  if (rx || ry) {
    const w = WEAPONS[me.weapon], sc = me.scoped ? (w.scope ? 0.32 : 0.55) : 1;
    const curve = v => Math.sign(v) * Math.pow(Math.abs(v), 1.7);
    const rate = 3.1 * sens * sc;
    me.yaw -= curve(rx) * rate * dt; me.pitch -= curve(ry) * rate * 0.72 * dt;
    me.pitch = Math.max(-1.55, Math.min(1.55, me.pitch));
    me.swayX = Math.max(-0.08, Math.min(0.08, me.swayX + curve(rx) * 0.012));
    me.swayY = Math.max(-0.06, Math.min(0.06, me.swayY + curve(ry) * 0.01));
    if (ride.v >= 0) ride.lastMouse = performance.now();
  }
  // Schultertasten / Trigger
  if (pressed(7)) { me.trigger = true; me.firedPress = false; } else if (released(7)) me.trigger = false;
  if (pressed(6)) { me.scoped = true; if (me.alive) padAimSnap(); } else if (released(6)) me.scoped = false;
  if (pressed(0)) keys.Space = true; else if (released(0)) keys.Space = false;
  if (pressed(1)) { startCrouch(); keys.KeyC = true; } else if (released(1)) keys.KeyC = false;
  if (pressed(2)) startReload();
  if (pressed(3)) toggleRide();
  if (pressed(4)) throwNade();
  if (pressed(5) || pressed(11)) knifeAttack();
  // Steuerkreuz: Waffen
  const N = WEAPONS.length, step = d => { let n = me.weapon; for (let i = 0; i < N; i++) { n = (n + d + N) % N; if (me.owned[n]) break; } switchWeapon(n); };
  if (pressed(15)) step(1);
  if (pressed(14)) step(-1);
  if (pressed(12)) { const sp = me.owned.findIndex((o, i) => o && i >= BASE_WEAPONS); if (sp >= 0) switchWeapon(sp); }
  if (pressed(13) && me.alive && me.reloading <= 0) me.inspectT = 2.2;
  // Punktestand halten, Start = Pause
  if (pressed(8)) { $('board').classList.remove('hidden'); renderBoard(); } else if (released(8)) $('board').classList.add('hidden');
  if (pressed(9)) { if (document.pointerLockElement) document.exitPointerLock(); setLocked(false); }
}

function pollGamepad(dt) {
  const gp = getPad(); if (!gp) return;
  const cur = gp.buttons.map(x => !!(x.pressed || x.value > 0.35));
  const pressed = i => cur[i] && !PAD.prev[i], released = i => !cur[i] && PAD.prev[i];
  const axesUsed = gp.axes.slice(0, 4).some(a => Math.abs(a) > 0.3);
  if (cur.some(Boolean) || axesUsed) { PAD.lastUse = performance.now(); document.body.classList.add('hasPad'); }
  const overlay = ['shop', 'settings', 'inv'].some(id => !$(id).classList.contains('hidden'));
  if (running && locked && !overlay) {
    if (PAD.focus) padSetFocus(null);
    padGame(gp, pressed, released, dt);
  } else {
    if (PAD.moved) { touchIn.mx = touchIn.my = 0; PAD.moved = false; }
    // Pause: erster Knopfdruck während des Spiels aktiviert den Controller-Modus (ohne Maussperre)
    padMenu(gp, pressed, dt);
  }
  PAD.prev = cur;
}
// Im Controller-Modus (ohne Maussperre) öffnet Esc trotzdem die Pause
document.addEventListener('keydown', e => { if (e.code === 'Escape' && running && locked && !document.pointerLockElement && !TOUCH) setLocked(false); });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) document.body.classList.remove('padPlay'); });
window.pollGamepad = pollGamepad;
