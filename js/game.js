'use strict';
/* ======================= Spielzustand ======================= */
const me = { pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: false, alive: false, hp: 100,
  weapon: 3, owned: WEAPONS.map((w, i) => i === 3), ammo: WEAPONS.map(w => w.mag), reloading: 0, lastShot: -9, trigger: false, firedPress: false,
  scoped: false, kick: 0, bob: 0, sprintTap: false, sprinting: false,
  // neu: Ducken/Rutschen/Schleichen, Granaten, Messer, Animationen, Rückstoß
  crouch: false, crouchT: 0, slideT: 0, slideDir: new THREE.Vector3(), sneak: false, h: PH, nades: 2,
  knifeT: 0, throwT: 0, drawT: 0, inspectT: 0, pumpT: 0, boltT: 0, recoilP: 0, recoilY: 0, swayX: 0, swayY: 0, landT: 0, shake: 0, airVy: 0 };
const START_WEAPON = 3;  // Pistole – alles andere muss man finden
const MAX_NADES = 2, KNIFE_W = 20, NADE_W = 21, CAR_W = 22;
const weaponShort = w => w === KNIFE_W ? 'MESSER' : w === NADE_W ? 'GRANATE' : w === CAR_W ? 'ÜBERFAHREN' : (WEAPONS[w] ? WEAPONS[w].short : '?');
let lastWTap = 0;
let myId = null, isHost = false, running = false, locked = false, roomCode = '';
let world = { players: {}, mode: 'ffa' };
const keys = {};
let fovBase = 75;
try { fovBase = parseFloat(localStorage.getItem('kz_fov')) || 75; } catch (e) {}

function spawnAt(pos) {
  if (typeof ride !== 'undefined' && ride.v >= 0) exitRide(true);
  me.pos.set(pos[0], pos[1], pos[2]); me.vel.set(0, 0, 0);
  me.alive = true; me.hp = 100; me.ammo = WEAPONS.map(w => w.mag); me.reloading = 0;
  me.owned = WEAPONS.map((w, i) => i === START_WEAPON); me.weapon = START_WEAPON; me.scoped = false;
  me.nades = MAX_NADES; me.crouch = false; me.slideT = 0; me.knifeT = me.throwT = me.inspectT = me.pumpT = me.boltT = 0;
  if (shopState.equip >= BASE_WEAPONS && shopState.bought.includes(shopState.equip)) { me.owned[shopState.equip] = true; me.weapon = shopState.equip; }
  buildViewGun(me.weapon); updateSlots(); me.drawT = 0.4;
  me.yaw = Math.atan2(pos[0] + 3, pos[2]);  // Richtung Kartenmitte schauen
  me.pitch = 0;
  $('center').classList.add('hidden');
}
function die(killerName) {
  if (typeof ride !== 'undefined' && ride.v >= 0) exitRide(true);
  me.alive = false; me.scoped = false; me.trigger = false; streak = 0;
  $('centerBig').textContent = 'ELIMINIERT';
  $('centerSmall').textContent = killerName ? `von ${killerName} · Wiederbelebung in 3 Sekunden` : 'Wiederbelebung in 3 Sekunden';
  $('center').classList.remove('hidden');
}

/* ======================= Waffen zum Aufsammeln ======================= */
const PICKUP_RESPAWN = 20; // Sekunden bis die Waffe wieder daliegt
const PICKUPS = MAP_PICKUPS;
let pickActive = PICKUPS.map(() => true);
const PICK_COLORS = [0x4fc3ff, 0xffa040, 0xff4f6a, 0xffffff];
const pickupObjs = PICKUPS.map((p, i) => {
  const g = new THREE.Group(); g.position.set(p.x, p.y, p.z);
  const gun = new THREE.Group();
  gun.add(partsToGroup(makeGun(p.w).parts.map(pt => Object.assign(pt, { mat: GUN_MATS.steel }))));
  gun.scale.setScalar(1.7); gun.position.y = 0.75; g.add(gun);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32),
    new THREE.MeshBasicMaterial({ color: PICK_COLORS[p.w], transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.4, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: PICK_COLORS[p.w], transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 1.2; g.add(beam);
  scene.add(g);
  return { g, gun, ring, beam, lastTry: 0 };
});
function updatePickups(now) {
  for (let i = 0; i < PICKUPS.length; i++) {
    const o = pickupObjs[i], p = PICKUPS[i], on = !!pickActive[i];
    o.gun.visible = on; o.beam.visible = on;
    o.ring.material.opacity = on ? 0.6 + Math.sin(now * 4 + i) * 0.2 : 0.12;
    o.gun.rotation.y = now * 1.6 + i;
    o.gun.position.y = 0.8 + Math.sin(now * 2 + i) * 0.1;
    if (on && me.alive && myId && (!me.owned[p.w] || me.ammo[p.w] < WEAPONS[p.w].mag) &&
        Math.hypot(me.pos.x - p.x, me.pos.z - p.z) < 1.1 && Math.abs(me.pos.y - p.y) < 1.3 && now - o.lastTry > 0.5) {
      o.lastTry = now;
      net.send({ t: 'pick', i });
    }
  }
}
function gotWeapon(w) {
  const isNew = !me.owned[w];
  me.owned[w] = true; me.ammo[w] = WEAPONS[w].mag;
  if (isNew) { me.weapon = w; me.reloading = 0; me.scoped = false; me.lastShot = performance.now() / 1000 - WEAPONS[w].rate + 0.3; buildViewGun(w); me.drawT = 0.4; }
  updateSlots();
  showMsg(isNew ? `${WEAPONS[w].name} aufgehoben!` : `${WEAPONS[w].name}: Munition aufgefüllt`);
  sndBeep(660, 0.08, 0.1, 'triangle'); setTimeout(() => sndBeep(990, 0.12, 0.1, 'triangle'), 80);
}
function showMsg(text) {
  const km = $('killMsg'); km.textContent = text; km.style.opacity = 1;
  clearTimeout(km._t); km._t = setTimeout(() => km.style.opacity = 0, 1600);
}

/* ======================= Eingabe ======================= */
const canvas = renderer.domElement;
canvas.addEventListener('click', () => { if (running && !locked && !TOUCH) lockPointer(); });
$('btnResume').onclick = () => lockPointer();
if (TOUCH) $('btnResume').textContent = 'Weiterspielen (tippen)';
function lockPointer() {
  initAudio();
  if (TOUCH) {   // Handy: keine Maus-Sperre, stattdessen Vollbild + Querformat
    try { const d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen;
      if (f && !document.fullscreenElement) { const r = f.call(d); if (r && r.then) r.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } } catch (e) {}
    setLocked(true); return;
  }
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}
const touchIn = { mx: 0, my: 0, sprint: false };
function setLocked(v) {
  locked = v;
  $('pause').classList.toggle('hidden', locked || !running);
  $('touchCtl').classList.toggle('hidden', !(TOUCH && locked && running));
  if (!locked) { me.trigger = false; me.scoped = false; for (const k in keys) keys[k] = false; touchIn.mx = touchIn.my = 0; touchIn.sprint = false; me.sprintTap = false; }
}
document.addEventListener('pointerlockchange', () => { if (!TOUCH) setLocked(document.pointerLockElement === canvas); });
document.addEventListener('visibilitychange', () => { if (TOUCH && document.hidden && locked) setLocked(false); });

/* ---------- Handy-Steuerung: Joystick links, Wischen rechts, Knöpfe ---------- */
function nextWeapon() {
  const N = WEAPONS.length; let n = me.weapon;
  for (let i = 0; i < N; i++) { n = (n + 1) % N; if (me.owned[n]) break; }
  switchWeapon(n);
}
if (TOUCH) {
  const tc = $('touchCtl'), stick = $('tStick'), knob = $('tKnob'), R = 55;
  let moveId = null, mx0 = 0, my0 = 0;
  const fingers = new Map();   // Finger-ID → { x, y, btn, look }
  const press = (name, down) => {
    if (name === 'fire') { me.trigger = down; if (down) me.firedPress = false; }
    else if (name === 'jump') keys.Space = down;
    else if (name === 'crouch') { if (down) startCrouch(); keys.KeyC = down; }
    else if (!down) { if (name === 'board') $('board').classList.add('hidden'); }
    else if (name === 'scope') me.scoped = !me.scoped;
    else if (name === 'reload') startReload();
    else if (name === 'swap') nextWeapon();
    else if (name === 'nade') throwNade();
    else if (name === 'knife') knifeAttack();
    else if (name === 'ride') toggleRide();
    else if (name === 'board') { $('board').classList.remove('hidden'); renderBoard(); }
    else if (name === 'pause') setLocked(false);
  };
  const resetStick = () => { moveId = null; touchIn.mx = touchIn.my = 0; touchIn.sprint = false; stick.classList.remove('on'); stick.style.left = stick.style.top = ''; knob.style.transform = ''; };
  tc.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!locked) return;
    for (const t of e.changedTouches) {
      const btn = t.target.closest ? t.target.closest('[data-t]') : null;
      if (btn) {
        btn.classList.add('on');
        fingers.set(t.identifier, { x: t.clientX, y: t.clientY, btn, look: btn.dataset.t === 'fire' });
        press(btn.dataset.t, true);
      } else if (t.clientX < innerWidth * 0.4 && moveId === null) {
        moveId = t.identifier; mx0 = t.clientX; my0 = t.clientY;
        stick.classList.add('on'); stick.style.left = mx0 + 'px'; stick.style.top = my0 + 'px'; knob.style.transform = '';
      } else fingers.set(t.identifier, { x: t.clientX, y: t.clientY, look: true });
    }
  }, { passive: false });
  tc.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!locked) return;
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        let dx = t.clientX - mx0, dy = t.clientY - my0;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        const m = Math.min(1, d / R);
        touchIn.mx = m < 0.15 ? 0 : dx / R; touchIn.my = m < 0.15 ? 0 : dy / R;
        touchIn.sprint = d > R * 1.15 && -dy > R * 0.7;   // Daumen weit nach vorne = sprinten
        continue;
      }
      const f = fingers.get(t.identifier);
      if (!f || !f.look) continue;
      const s = 0.0055 * sens * (me.scoped ? (WEAPONS[me.weapon].scope ? 0.3 : 0.7) : 1);
      me.yaw -= (t.clientX - f.x) * s; me.pitch -= (t.clientY - f.y) * s;
      me.pitch = Math.max(-1.55, Math.min(1.55, me.pitch));
      f.x = t.clientX; f.y = t.clientY;
    }
  }, { passive: false });
  const end = e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) { resetStick(); continue; }
      const f = fingers.get(t.identifier);
      if (f && f.btn) { f.btn.classList.remove('on'); press(f.btn.dataset.t, false); }
      fingers.delete(t.identifier);
    }
  };
  tc.addEventListener('touchend', end, { passive: false });
  tc.addEventListener('touchcancel', end, { passive: false });
}
document.addEventListener('mousemove', e => {
  if (!locked) return;
  const s = 0.0022 * sens * (me.scoped ? (WEAPONS[me.weapon].scope ? 0.3 : 0.7) : 1);
  me.yaw -= e.movementX * s; me.pitch -= e.movementY * s;
  me.pitch = Math.max(-1.55, Math.min(1.55, me.pitch));
  // Waffe schwingt der Mausbewegung leicht hinterher
  me.swayX = Math.max(-0.08, Math.min(0.08, me.swayX + e.movementX * 0.0006));
  me.swayY = Math.max(-0.06, Math.min(0.06, me.swayY + e.movementY * 0.0006));
});
document.addEventListener('mousedown', e => {
  if (!locked) return;
  if (e.button === 0) { me.trigger = true; me.firedPress = false; }
  if (e.button === 2) me.scoped = true;
});
document.addEventListener('mouseup', e => { if (e.button === 0) me.trigger = false; if (e.button === 2) me.scoped = false; });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('wheel', e => {
  if (!locked) return;
  const N = WEAPONS.length, dir = e.deltaY > 0 ? 1 : N - 1;
  let n = me.weapon;
  for (let i = 0; i < N; i++) { n = (n + dir) % N; if (me.owned[n]) break; }
  switchWeapon(n);
});
document.addEventListener('keydown', e => {
  if (!running) return;
  if (e.code === 'Tab') { e.preventDefault(); $('board').classList.remove('hidden'); renderBoard(); }
  if (e.code === 'KeyI') { e.preventDefault(); toggleInventory(); }
  if (!locked) return;
  if (e.code === 'ControlLeft' || e.code === 'KeyC') e.preventDefault();
  // Doppelt W tippen = Sprinten (solange W gehalten wird)
  if (e.code === 'KeyW' && !e.repeat) {
    const t = performance.now();
    if (t - lastWTap < 300) me.sprintTap = true;
    lastWTap = t;
  }
  if ((e.code === 'KeyC' || e.code === 'ControlLeft') && !e.repeat) startCrouch();
  keys[e.code] = true;
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5)) - 1;
    if (n >= 0 && n < BASE_WEAPONS) switchWeapon(n);
    if (n === 4) { const sp = me.owned.findIndex((o, i) => o && i >= BASE_WEAPONS); if (sp >= 0) switchWeapon(sp); }  // Taste 5 = Ladenwaffe
  }
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyV') knifeAttack();
  if (e.code === 'KeyG') throwNade();
  if (e.code === 'KeyF' && !e.repeat && me.alive && me.reloading <= 0) me.inspectT = 2.2;
  if (e.code === 'KeyE' && !e.repeat) toggleRide();
});
document.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'KeyW') me.sprintTap = false;
  if (e.code === 'Tab') $('board').classList.add('hidden');
});

function switchWeapon(n) {
  if (n === me.weapon || !me.owned[n]) return;
  me.weapon = n; me.reloading = 0; me.lastShot = performance.now() / 1000 - WEAPONS[n].rate + 0.3; me.scoped = false;
  me.inspectT = 0; me.pumpT = me.boltT = 0;
  buildViewGun(n); updateSlots(); me.drawT = 0.35;
  sndClick(0.06);
}
function startReload() {
  const w = WEAPONS[me.weapon];
  if (me.reloading > 0 || me.ammo[me.weapon] === w.mag || !me.alive || me.knifeT > 0 || me.throwT > 0) return;
  me.reloading = w.reload; me.inspectT = 0; me.scoped = false;
  sndClick(0.08);
  setTimeout(() => sndClick(0.07, 0.6), w.reload * 400);
  setTimeout(() => sndClick(0.09, 1.4), w.reload * 750);
}
// Ducken (C / Strg). Beim Sprinten: Rutschen!
function startCrouch() {
  if (!me.alive) return;
  if (me.sprinting && me.onGround && Math.hypot(me.vel.x, me.vel.z) > 8) {
    me.slideT = 0.8; me.slideDir.set(me.vel.x, 0, me.vel.z).normalize();
    sndSlide();
  }
}

/* ======================= Schießen ======================= */
const ray = new THREE.Raycaster();
// Schadensabfall mit der Entfernung: [voll bis m, minimal ab m, Faktor]
const FALLOFF = { 0: [30, 80, 0.65], 1: [8, 30, 0.2], 3: [20, 60, 0.6], 4: [18, 50, 0.5], 5: [25, 70, 0.7], 7: [30, 80, 0.7], 8: [6, 26, 0.2] };
function avatarParts() {
  const t = [];
  for (const id in avatars) { const p = world.players[id]; if (id !== myId && p && p.alive) t.push(...avatars[id].parts); }
  return t;
}
function friendly(pid) {
  if (world.mode !== 'tdm') return false;
  const a = world.players[myId], b = world.players[pid];
  return a && b && a.team === b.team;
}
const _o = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
function tryShoot(now) {
  const w = WEAPONS[me.weapon];
  const riding = ride.v >= 0;
  if (!me.alive || me.reloading > 0 || me.knifeT > 0 || me.throwT > 0 || (me.drawT > 0.12 && !riding) || now - me.lastShot < w.rate) return;
  if (me.ammo[me.weapon] <= 0) { startReload(); sndClick(0.05, 2); return; }
  me.lastShot = now; me.ammo[me.weapon]--; me.firedPress = true; me.inspectT = 0;
  const moving = Math.hypot(me.vel.x, me.vel.z) > 1.5;
  let spread = w.spread + (moving ? w.move : 0) + (me.onGround ? 0 : 0.04) + (me.sprinting ? 0.03 : 0);
  if (me.crouch) spread *= 0.65; else if (me.sneak) spread *= 0.85;
  if (me.scoped) spread *= w.scope ? 0 : 0.5;
  if (w.scope && me.scoped && moving) spread = 0.02;
  if (riding) spread = spread * 0.6 + 0.006 + Math.min(0.02, Math.abs(ride.speed) * 0.0012);   // vom fahrenden Moped etwas ungenauer
  camera.updateMatrixWorld();
  const origin = camera.getWorldPosition(_o.clone());
  camera.matrixWorld.extractBasis(_r, _u, _f); _f.negate();
  // Auf dem Moped von hinten gesehen: Schuss kommt aus der Waffe des Fahrers (Kamera ist hinter ihm)
  const tp = riding && (ride.fp || 0) < 0.5;
  if (riding) me.rideAimT = now;
  const mz = tp ? new THREE.Vector3(me.pos.x, me.pos.y + 1.38, me.pos.z).addScaledVector(_f, 0.75).addScaledVector(_r, 0.12)
    : muzzle.getWorldPosition(new THREE.Vector3());
  if (tp) { const back = origin.distanceTo(mz); origin.addScaledVector(_f, Math.max(0, back - 0.3)); }   // nicht den eigenen Fahrer treffen
  const parts = avatarParts(), dmgBy = {}, ends = [];
  let anyHead = false, anyHit = false;
  for (let i = 0; i < w.pellets; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const dir = _f.clone().addScaledVector(_r, Math.cos(a) * r).addScaledVector(_u, Math.sin(a) * r).normalize();
    const mh = rayMap(origin, dir, 300);
    ray.set(origin, dir); ray.far = mh ? mh.dist : 300;
    const ah = parts.length ? ray.intersectObjects(parts, false)[0] : null;
    const end = ah ? ah.point.clone() : mh ? mh.point.clone() : origin.clone().addScaledVector(dir, 200);
    ends.push([+end.x.toFixed(2), +end.y.toFixed(2), +end.z.toFixed(2)]);
    if ((!me.scoped || !w.scope) && (i < 3)) addTracer(mz, end);
    if (ah && ah.object.userData.pid && !friendly(ah.object.userData.pid)) {
      const u = ah.object.userData, fo = FALLOFF[me.weapon];
      let dmg = w.dmg * (u.head ? w.head : 1);
      if (fo) { const t = Math.min(1, Math.max(0, (ah.distance - fo[0]) / (fo[1] - fo[0]))); dmg *= 1 - t * (1 - fo[2]); }
      dmgBy[u.pid] = dmgBy[u.pid] || { dmg: 0, head: false };
      dmgBy[u.pid].dmg += dmg;
      if (u.head) { dmgBy[u.pid].head = true; anyHead = true; }
      anyHit = true; bloodFx(end);
    } else if (mh && !ah) impactFx(mh.point, mh.normal);
  }
  for (const pid in dmgBy) net.send({ t: 'hit', target: pid, dmg: Math.round(dmgBy[pid].dmg), w: me.weapon, head: dmgBy[pid].head });
  if (anyHit) showHitmarker(anyHead);
  net.send({ t: 'shot', id: myId, w: me.weapon, o: [+mz.x.toFixed(2), +mz.y.toFixed(2), +mz.z.toFixed(2)], e: ends });
  // Rückstoß: ein Teil bleibt (Waffe steigt), ein Teil federt zurück
  const rk = w.kick * (me.crouch ? 0.6 : 1) * (0.8 + Math.random() * 0.4);
  me.pitch = Math.min(1.55, me.pitch + rk * 0.45);
  me.recoilP += rk * 0.9; me.recoilY += (Math.random() - 0.5) * w.kick * 0.6;
  me.kick = 1;
  sndShot(me.weapon, 0.5);
  puff(mz, 0xcfcfcf, 0.12, 0.5, _f.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 0.4, 0)), { opacity: 0.3, grow: 2.5 });
  if (tp) {   // Mündungsfeuer an der Waffe des Fahrers
    const fl = new THREE.Sprite(flashMat.clone()); fl.position.copy(mz); fl.scale.set(0.6, 0.6, 1); fl.material.rotation = Math.random() * 6;
    scene.add(fl); effects.push({ o: fl, life: 0.06, max: 0.06 });
    me.rideAimT = now;
    if (me.weapon !== 1 && me.weapon !== 2 && me.weapon !== 5 && me.weapon !== 8) ejectShell(mz.clone().addScaledVector(_f, -0.4), _r.clone());
    if (me.ammo[me.weapon] === 0) setTimeout(startReload, 250);
    return;
  }
  flashT = 0.05; flash.visible = true; flashMat.rotation = Math.random() * 6; flashLight.intensity = 2.5;
  if (me.weapon === 1) me.pumpT = 0.55;
  else if (me.weapon === 2) me.boltT = 0.9;
  else if (me.weapon !== 5 && me.weapon !== 8) ejectShell(vm.eject.getWorldPosition(new THREE.Vector3()), _r.clone().add(_u.clone().multiplyScalar(0.3)));
  if (me.ammo[me.weapon] === 0) setTimeout(startReload, 250);
}
let hmTimer = 0;
function showHitmarker(head) {
  const h = $('hitmarker'); h.classList.toggle('head', head); h.style.opacity = 1;
  clearTimeout(hmTimer); hmTimer = setTimeout(() => h.style.opacity = 0, 140);
  sndHit(head);
}

/* ---------- Messer (V) ---------- */
function knifeAttack() {
  if (!me.alive || me.knifeT > 0 || me.throwT > 0 || ride.v >= 0) return;
  me.knifeT = 0.5; me.reloading = 0; me.inspectT = 0; me.scoped = false;
  sndSwish();
  setTimeout(() => {
    if (!me.alive) return;
    camera.updateMatrixWorld();
    const origin = camera.getWorldPosition(new THREE.Vector3());
    camera.matrixWorld.extractBasis(_r, _u, _f); _f.negate();
    const parts = avatarParts();
    for (const off of [0, -0.25, 0.25]) {
      const dir = _f.clone().addScaledVector(_r, off).normalize();
      ray.set(origin, dir); ray.far = 2.2;
      const h = parts.length ? ray.intersectObjects(parts, false)[0] : null;
      const mh = rayMap(origin, dir, 2.2);
      if (h && (!mh || mh.dist > h.distance) && !friendly(h.object.userData.pid)) {
        net.send({ t: 'hit', target: h.object.userData.pid, dmg: h.object.userData.head ? 100 : 60, w: KNIFE_W, head: h.object.userData.head });
        bloodFx(h.point); showHitmarker(h.object.userData.head); sndThud(); return;
      }
      if (mh && off === 0) { impactFx(mh.point, mh.normal); sndThud(0.5); return; }
    }
  }, 130);
}

/* ---------- Granaten (G) ---------- */
const nades = [];
let nadeSeq = 0;
function throwNade() {
  if (!me.alive || me.nades <= 0 || me.throwT > 0 || me.knifeT > 0 || ride.v >= 0) return;
  me.nades--; me.throwT = 0.65; me.reloading = 0; me.inspectT = 0; me.scoped = false;
  sndClick(0.08, 1.8);
  setTimeout(() => {
    if (!me.alive) return;
    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(_r, _u, _f); _f.negate();
    const o = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(_f, 0.5).addScaledVector(_r, -0.15);
    const v = _f.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0)).addScaledVector(me.vel, 0.5);
    const id = myId + '-' + (nadeSeq++);
    startNade(id, o, v, true);
    net.send({ t: 'nade', i: id, o: [o.x, o.y, o.z], v: [v.x, v.y, v.z] });
    sndSwish(0.6);
  }, 230);
}
function startNade(id, o, v, mine) {
  const m = makeGrenadeMesh(); m.position.copy(o); scene.add(m);
  nades.push({ id, m, pos: o.clone(), vel: v.clone(), t: 0, mine });
}
function pointInBoxes(p, list) {
  for (const b of list) if (p.x > b.min.x - 0.06 && p.x < b.max.x + 0.06 && p.y > b.min.y - 0.06 && p.y < b.max.y + 0.06 && p.z > b.min.z - 0.06 && p.z < b.max.z + 0.06) return true;
  return false;
}
function updateNades(dt) {
  for (let i = nades.length - 1; i >= 0; i--) {
    const n = nades[i]; n.t += dt;
    const near = nearBoxes(n.pos.x, n.pos.z, 3);
    for (let s = 0; s < 3; s++) {
      const h = dt / 3;
      n.vel.y -= 20 * h;
      for (const ax of ['x', 'y', 'z']) {
        const old = n.pos[ax]; n.pos[ax] += n.vel[ax] * h;
        if (pointInBoxes(n.pos, near) || (ax === 'y' && n.pos.y < 0.06)) {
          n.pos[ax] = ax === 'y' && n.pos.y < 0.06 && !pointInBoxes(n.pos, near) ? 0.06 : old;
          if (Math.abs(n.vel[ax]) > 2) sndThud(0.15);
          n.vel[ax] *= -0.35;
          if (ax === 'y') { n.vel.x *= 0.7; n.vel.z *= 0.7; }
        }
      }
    }
    n.m.position.copy(n.pos); n.m.rotation.x += n.vel.length() * dt * 2; n.m.rotation.z += n.vel.length() * dt;
    if (n.t >= 2.4) {
      explosionFx(n.pos.clone());
      const d = n.pos.distanceTo(me.pos);
      sndBoom(n.pos);
      me.shake = Math.max(me.shake, Math.max(0, 1 - d / 25));
      if (n.mine) net.send({ t: 'boom', i: n.id, o: [n.pos.x, n.pos.y, n.pos.z] });
      scene.remove(n.m); nades.splice(i, 1);
    }
  }
}

/* ======================= Lokale Spiellogik ======================= */
let streak = 0, multiN = 0, multiT = 0;
function updateLocal(dt, now) {
  const w = WEAPONS[me.weapon];
  // Auf dem Moped: eigene Steuerung und Kamera (vehicles.js)
  if (ride.v >= 0) {
    if (!me.alive) exitRide(true);
    else { updateRide(dt); updateNades(dt); flashT -= dt; if (flashT <= 0) { flash.visible = false; flashLight.intensity = 0; } return; }
  }
  if (me.alive) {
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    let iF = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), iR = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), analog = 1;
    if (touchIn.mx || touchIn.my) {   // Handy-Joystick / Controller / Lenkrad: nur die benutzte Richtung ersetzen
      if (touchIn.my) iF = -touchIn.my;
      if (touchIn.mx) iR = touchIn.mx;
      analog = Math.min(1, Math.hypot(iF, iR));
    }
    let wx = fx * iF + rx * iR, wz = fz * iF + rz * iR;
    const len = Math.hypot(wx, wz);
    // Ducken: Taste gehalten (oder Rutschen). Aufstehen nur, wenn über dem Kopf Platz ist.
    const wantCrouch = keys.KeyC || keys.ControlLeft || me.slideT > 0;
    if (wantCrouch) me.crouch = true;
    else if (me.crouch) {
      _near = nearBoxes(me.pos.x, me.pos.z, 2); _h = PH;
      const blocked = anyOverlap(me.pos); _near = boxes;
      if (!blocked) me.crouch = false;
    }
    me.h = me.crouch ? 1.25 : PH;
    me.sneak = !!keys.ShiftLeft && !me.crouch;
    let speed = 6.8;
    me.sprinting = (me.sprintTap || touchIn.sprint) && iF > 0 && !me.scoped && !me.trigger && !me.crouch && !me.sneak && me.reloading <= 0;
    if (me.sprinting) { speed = 10.2; analog = 1; }
    if (me.sneak) speed = 3.4;
    if (me.crouch) speed = 3.0;
    if (me.scoped) speed = Math.min(speed, 3.6);
    if (len > 0) { wx = wx / len * speed * analog; wz = wz / len * speed * analog; }
    if (me.slideT > 0) {   // Rutschen: Schwung in Rutschrichtung, langsam ausbremsen
      me.slideT -= dt;
      const sp = 5 + 8 * Math.max(0, me.slideT / 0.8);
      wx = me.slideDir.x * sp; wz = me.slideDir.z * sp;
    }
    const acc = 1 - Math.exp(-(me.onGround ? (me.slideT > 0 ? 30 : 14) : 3) * dt);
    me.vel.x += (wx - me.vel.x) * acc; me.vel.z += (wz - me.vel.z) * acc;
    if (keys.Space && me.onGround && !me.crouch) { me.vel.y = 8.2; me.onGround = false; sndStep(0.06); }
    if (keys.Space && me.slideT > 0 && me.onGround) { me.slideT = 0; me.crouch = false; me.h = PH; me.vel.y = 8.2; me.onGround = false; }  // Sprung aus dem Rutschen
    const wasAir = !me.onGround, vyBefore = me.vel.y;
    me.vel.y = Math.max(-30, me.vel.y - GRAV * dt);
    moveBody(me, me.vel.x * dt, me.vel.y * dt, me.vel.z * dt);
    if (wasAir && me.onGround && vyBefore < -7) { me.landT = Math.min(0.3, -vyBefore * 0.025); sndStep(Math.min(0.2, -vyBefore * 0.012)); }
    if (me.pos.y < -10) me.pos.set(0, 5, 0);

    // Timer der Animationen
    me.drawT = Math.max(0, me.drawT - dt); me.knifeT = Math.max(0, me.knifeT - dt); me.throwT = Math.max(0, me.throwT - dt);
    me.inspectT = Math.max(0, me.inspectT - dt); me.landT = Math.max(0, me.landT - dt);
    if (me.pumpT > 0) { const b = me.pumpT; me.pumpT = Math.max(0, me.pumpT - dt); if (b > 0.3 && me.pumpT <= 0.3) sndClick(0.08, 0.7); }
    if (me.boltT > 0) { const b = me.boltT; me.boltT = Math.max(0, me.boltT - dt); if (b > 0.55 && me.boltT <= 0.55) sndClick(0.08, 0.9); }
    if (me.reloading > 0) { me.reloading -= dt; if (me.reloading <= 0) { me.reloading = 0; me.ammo[me.weapon] = w.mag; } }
    if (me.trigger && (w.auto || !me.firedPress)) tryShoot(now);
    if (len > 0 && me.onGround && me.slideT <= 0) {
      const before = Math.sin(me.bob);
      me.bob += dt * Math.max(3, Math.hypot(me.vel.x, me.vel.z)) * 1.4;
      // Schleichen = lautlos, Ducken = sehr leise
      if (Math.sign(before) !== Math.sign(Math.sin(me.bob))) sndStep(me.sneak ? 0 : me.crouch ? 0.025 : me.sprinting ? 0.1 : 0.07);
    }
  }
  updateNades(dt);
  flashT -= dt;
  if (flashT <= 0) { flash.visible = false; flashLight.intensity = 0; }
  // ---------- Kamera ----------
  if (me.camY === undefined || !me.onGround || me.pos.y < me.camY || me.pos.y - me.camY > 1.5) me.camY = me.pos.y;
  else me.camY += (me.pos.y - me.camY) * Math.min(1, dt * 14);
  me.eyeH = (me.eyeH || EYE) + ((me.crouch ? 1.05 : EYE) - (me.eyeH || EYE)) * Math.min(1, dt * 12);
  me.recoilP *= Math.exp(-9 * dt); me.recoilY *= Math.exp(-9 * dt);
  me.shake = Math.max(0, me.shake - dt * 1.6);
  const sh = me.shake * me.shake * 0.06;
  const strafe = ((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0)) * (me.alive ? 1 : 0);
  me.roll = (me.roll || 0) + ((-strafe * 0.012 + (me.slideT > 0 ? 0.07 : 0)) - (me.roll || 0)) * Math.min(1, dt * 8);
  camera.position.set(me.pos.x + rnd(-sh, sh), me.camY + me.eyeH - Math.sin(Math.min(1, me.landT / 0.3) * Math.PI) * 0.12 + rnd(-sh, sh), me.pos.z + rnd(-sh, sh));
  camera.rotation.set(me.pitch + me.recoilP, me.yaw + me.recoilY, me.roll);
  if (!me.alive) {   // Todesanimation: zu Boden sinken und zur Seite kippen
    me.deathT = (me.deathT || 0) + dt;
    const k = Math.min(1, me.deathT / 0.7), e = 1 - (1 - k) * (1 - k);
    camera.position.y = me.camY + EYE - (EYE - 0.3) * e;
    camera.rotation.z = 0.55 * e;
    camera.rotation.x = me.pitch * (1 - e) + 0.25 * e;
  } else me.deathT = 0;
  const targetFov = me.scoped && me.alive ? w.zoom : fovBase + (me.sprinting && me.alive && Math.hypot(me.vel.x, me.vel.z) > 8 ? 8 : 0) + (me.slideT > 0 ? 6 : 0);
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-18 * dt));
  camera.updateProjectionMatrix();
  animateViewModel(dt, w);
}

/* ---------- Animationen der Waffe in der Hand ---------- */
const bell = (t, a, b) => t <= a || t >= b ? 0 : Math.sin((t - a) / (b - a) * Math.PI);
const ramp = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
function animateViewModel(dt, w) {
  me.kick = Math.max(0, me.kick - dt * 8);
  me.swayX *= Math.exp(-8 * dt); me.swayY *= Math.exp(-8 * dt);
  const ads = me.scoped && !w.scope && me.reloading <= 0;
  const adsY = gunInfo ? -gunInfo.sight * viewGun.scale.y : -0.17;
  me.adsT = (me.adsT || 0) + ((ads ? 1 : 0) - (me.adsT || 0)) * (1 - Math.exp(-16 * dt));
  const bobAmt = (1 - me.adsT * 0.85) * (me.crouch ? 0.6 : 1);
  let px = GUN_POS.x * (1 - me.adsT), py = GUN_POS.y + (adsY - GUN_POS.y) * me.adsT, pz = GUN_POS.z + me.adsT * 0.08;
  let rx = 0, ry = 0, rz = 0;
  // Gehen + Atmen
  px += Math.cos(me.bob) * 0.012 * bobAmt; py += Math.sin(me.bob * 2) * 0.012 * bobAmt + Math.sin(performance.now() / 900) * 0.003;
  // Mausschwung
  ry += me.swayX * 0.8 * (1 - me.adsT * 0.7); rx += me.swayY * 0.6 * (1 - me.adsT * 0.7); px -= me.swayX * 0.15;
  // Rückstoß
  pz += me.kick * 0.08 * (1 - me.adsT * 0.4); rx += me.kick * 0.15;
  // Landen
  py -= Math.sin(Math.min(1, me.landT / 0.3) * Math.PI) * 0.05;
  // Sprinten
  me.sprintPose = (me.sprintPose || 0) + (((me.sprinting && me.alive) ? 1 : 0) - (me.sprintPose || 0)) * (1 - Math.exp(-10 * dt));
  rx -= me.sprintPose * 0.25; ry += me.sprintPose * 0.7; rz += me.sprintPose * 0.25; py -= me.sprintPose * 0.05;
  // Rutschen: Waffe zur Seite
  if (me.slideT > 0) { rz += 0.35; px += 0.03; }
  // Ziehen (Waffenwechsel)
  if (me.drawT > 0) { const e = Math.pow(me.drawT / 0.4, 2); py -= 0.35 * e; rx -= 0.9 * e; rz += 0.3 * e; }
  // Nachladen: kippen, Magazin raus/rein, linke Hand holt neues Magazin
  let magY = 0, magZ = 0, leftY = 0, leftZ = 0;
  if (me.reloading > 0) {
    const t = 1 - me.reloading / w.reload;
    const tilt = bell(t, 0, 1);
    rz += 0.5 * tilt; rx += 0.12 * tilt; py -= 0.04 * tilt;
    const hasMag = vm.mag && vm.mag.children.length;
    if (hasMag) {
      magY = -0.4 * ramp(t, 0.12, 0.32) * (1 - ramp(t, 0.55, 0.78));
      leftY = magY * (t > 0.3 ? 1 : 0.4); leftZ = magZ;
      if (t > 0.78 && t < 0.92) { pz += 0.03 * bell(t, 0.78, 0.92); rx += 0.1 * bell(t, 0.78, 0.92); }   // Durchladen
    } else { rx += 0.55 * tilt; leftY = -0.15 * tilt; }   // Doppelflinte: Kipplauf öffnen
  }
  // Pumpgun durchladen / Repetierer
  if (vm.pump) vm.pump.position.z = me.pumpT > 0 ? 0.09 * bell(1 - me.pumpT / 0.55, 0.15, 0.95) : 0;
  if (vm.bolt) { const b = me.boltT > 0 ? bell(1 - me.boltT / 0.9, 0.25, 0.85) : 0; vm.bolt.position.z = 0.06 * b; vm.bolt.position.y = 0.01 * b; rz += 0.15 * b; }
  if (vm.mag) { vm.mag.position.y = magY; vm.mag.position.z = magZ; }
  if (vm.left) {
    vm.left.position.y = leftY; vm.left.position.z = leftZ;
    if (me.weapon === 1 && me.pumpT > 0) vm.left.position.z += vm.pump.position.z;
  }
  // Waffe ansehen (F)
  if (me.inspectT > 0) {
    const t = 1 - me.inspectT / 2.2, b = bell(t, 0, 1);
    ry += 1.0 * b * (t < 0.55 ? 1 : 1 - (t - 0.55) * 2.2); rz -= 0.5 * b; rx -= 0.25 * bell(t, 0.5, 1); px -= 0.12 * b; py += 0.04 * b;
  }
  // Messer / Granate: Waffe senken
  const lower = Math.max(bell(1 - me.knifeT / 0.5, 0, 1) * (me.knifeT > 0 ? 1 : 0), me.throwT > 0 ? bell(1 - me.throwT / 0.65, 0, 1) : 0);
  py -= lower * 0.35; rx -= lower * 0.6;
  viewGun.position.set(px, py, pz);
  viewGun.rotation.set(rx, ry, rz);
  viewGun.visible = me.alive && !(me.scoped && w.scope && camera.fov < 40) && lower < 0.85;
  // Messer-Schwung
  viewKnife.visible = me.alive && me.knifeT > 0;
  if (viewKnife.visible) {
    const t = 1 - me.knifeT / 0.5;
    viewKnife.position.set(0.28 - 0.5 * ramp(t, 0.15, 0.5), -0.22 + 0.08 * bell(t, 0.1, 0.6), -0.42 - 0.12 * bell(t, 0.15, 0.55));
    viewKnife.rotation.set(-0.3 + 0.2 * bell(t, 0, 1), 0.6 - 1.6 * ramp(t, 0.15, 0.5), -0.7 + 0.5 * ramp(t, 0.1, 0.5));
  }
  // Granate werfen
  viewNade.visible = me.alive && me.throwT > 0.3;
  if (viewNade.visible) {
    const t = 1 - me.throwT / 0.65;
    viewNade.position.set(-0.18 + 0.1 * ramp(t, 0.2, 0.4), -0.2 + 0.25 * ramp(t, 0, 0.3), -0.45 - 0.4 * ramp(t, 0.3, 0.45));
  }
}

/* ======================= Andere Spieler darstellen ======================= */
function updateAvatars(dt) {
  const ps = world.players;
  for (const id in avatars) if (!ps[id]) { scene.remove(avatars[id].g); delete avatars[id]; }
  for (const id in ps) {
    if (id === myId) continue;
    const p = ps[id];
    let a = avatars[id];
    if (!a) a = avatars[id] = makeAvatar(p);
    if (p.w !== undefined) setAvatarGun(a, p.w);
    // --- Tod: Figur kippt um, bleibt kurz liegen und versinkt ---
    if (!p.alive) {
      if (a.wasAlive !== false) { a.wasAlive = false; a.deadT = 0; a.fallDir = Math.random() < 0.6 ? 1 : -1; a.fallSide = (Math.random() - 0.5) * 0.5; }
      a.deadT += dt;
      const k = Math.min(1, a.deadT / 0.6), e = k * k;
      a.g.rotation.x = a.fallDir * e * (Math.PI / 2 - 0.1);
      a.g.rotation.z = a.fallSide * e;
      a.g.position.y = (a.baseY || 0) + 0.12 * e - Math.max(0, a.deadT - 2.2) * 0.6;
      a.pivot.rotation.x += (-0.9 - a.pivot.rotation.x) * Math.min(1, dt * 8);
      a.hipL.rotation.x += (0.35 * a.fallDir - a.hipL.rotation.x) * Math.min(1, dt * 8);
      a.hipR.rotation.x += (-0.15 * a.fallDir - a.hipR.rotation.x) * Math.min(1, dt * 8);
      a.g.visible = a.shown && a.deadT < 3.2;
      if (a.label) a.label.visible = false;
      continue;
    }
    if (a.wasAlive === false) { a.wasAlive = true; a.shown = false; a.g.rotation.x = 0; a.g.rotation.z = 0; a.buf = []; a.lx = null; if (a.label) a.label.visible = true; }
    a.g.visible = true;
    // Teamkameraden: Name immer sichtbar; Gegner: Name nur in der Nähe
    if (a.label) {
      const mate = world.mode === 'tdm' && ps[myId] && ps[myId].team === p.team;
      a.label.visible = mate || a.g.position.distanceTo(me.pos) < 30;
    }
    // --- Flüssige Bewegung: Positionen puffern und ~0,1 s verzögert weich abspielen ---
    const t = performance.now(), INTERP = 110;
    a.buf = a.buf || [];
    const lastS = a.buf[a.buf.length - 1];
    if (!lastS || lastS.x !== p.x || lastS.y !== p.y || lastS.z !== p.z || lastS.ry !== p.ry || lastS.rx !== p.rx) {
      if (lastS && t - lastS.t > 160) a.buf.push(Object.assign({}, lastS, { t: t - 50 }));
      a.buf.push({ t, x: p.x, y: p.y, z: p.z, ry: p.ry, rx: p.rx });
    }
    const rt = t - INTERP;
    while (a.buf.length > 2 && a.buf[1].t <= rt) a.buf.shift();
    let s0 = a.buf[0], s1 = a.buf[1] || a.buf[0];
    const f = s1.t > s0.t ? Math.min(1, Math.max(0, (rt - s0.t) / (s1.t - s0.t))) : 1;
    let dry = s1.ry - s0.ry; dry = Math.atan2(Math.sin(dry), Math.cos(dry));
    const tx = s0.x + (s1.x - s0.x) * f, ty = s0.y + (s1.y - s0.y) * f, tz = s0.z + (s1.z - s0.z) * f;
    const tRy = s0.ry + dry * f, tRx = s0.rx + (s1.rx - s0.rx) * f;
    if (!a.shown) { a.g.position.set(p.x, p.y, p.z); a.g.rotation.y = p.ry; a.shown = true; a.buf = [{ t, x: p.x, y: p.y, z: p.z, ry: p.ry, rx: p.rx }]; }
    else {
      a.g.position.x = tx; a.g.position.z = tz;
      a.g.position.y += (ty - a.g.position.y) * Math.min(1, dt * 12);
      let d = tRy - a.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      a.g.rotation.y += d * Math.min(1, dt * 20);
      a.pivot.rotation.x += (tRx - a.pivot.rotation.x) * Math.min(1, dt * 15);
    }
    a.baseY = a.g.position.y;
    a.flags = p.f || 0;
    animateAvatar(a, dt);
    // Fahrer auf dem Moped: Oberkörper dreht in Zielrichtung
    if (a.flags & 8) riderTwist(a, (a.flags & 16) && p.ay !== undefined ? p.ay : a.g.rotation.y, dt);
    else a.upper.rotation.y *= Math.max(0, 1 - dt * 10);
    if (a.head) a.head.rotation.x = a.pivot.rotation.x * 0.7;
  }
}

/* Laufanimation mit Knien, Ducken, Rückstoß */
function animateAvatar(a, dt) {
  const pos = a.g.position;
  if (a.lx === null || dt <= 0) { a.lx = pos.x; a.ly = pos.y; a.lz = pos.z; return; }
  const inst = Math.min(12, Math.hypot(pos.x - a.lx, pos.z - a.lz) / dt);
  const vy = (pos.y - a.ly) / dt;
  a.lx = pos.x; a.ly = pos.y; a.lz = pos.z;
  a.spd += (inst - a.spd) * Math.min(1, dt * 8);
  a.vy = (a.vy || 0) + (vy - (a.vy || 0)) * Math.min(1, dt * 10);
  const amt = Math.min(1, a.spd / 5);
  const air = a.vy > 5.8 || a.vy < -6.5;
  const crouch = (a.flags & 1) ? 1 : 0, sneak = (a.flags & 2) ? 1 : 0;
  a.crouchT += (crouch - a.crouchT) * Math.min(1, dt * 10);
  const c = a.crouchT;
  const prev = Math.sin(a.phase);
  a.phase += dt * (1.5 + a.spd * 1.35);
  const sw = Math.sin(a.phase) * (0.35 + 0.45 * Math.min(1, a.spd / 9)) * amt * (1 - c * 0.5);
  let tL = sw, tR = -sw, kL = -Math.max(0, -sw) * 1.1 - 0.08 * amt, kR = -Math.max(0, sw) * 1.1 - 0.08 * amt;
  let bob = Math.abs(Math.cos(a.phase)) * 0.07 * amt, lean = -0.07 * amt;
  if (air) { tL = 0.7; tR = -0.2; kL = -1.2; kR = -0.4; bob = 0; lean = 0; }
  // Ducken: Oberschenkel nach vorne, Knie stark gebeugt, Körper tiefer
  tL = tL * (1 - c) + (1.2 + sw * 0.3) * c; tR = tR * (1 - c) + (1.2 - sw * 0.3) * c;
  kL = kL * (1 - c) - 2.0 * c; kR = kR * (1 - c) - 2.0 * c;
  // Auf dem Moped: sitzen, Knie angewinkelt, nach vorne gebeugt, Hände am Lenker (Waffe weg)
  const riding = (a.flags & 8) ? 1 : 0, rideAim = riding && (a.flags & 16) > 0;
  if (riding) {
    tL = tR = 1.3; kL = kR = -1.45; bob = 0; lean = rideAim ? -0.14 : -0.42;
    if (a.footDown) { tL = 0.12; kL = -0.1; }   // im Stand: linker Fuß auf dem Boden
  }
  if (a.gunHolder) a.gunHolder.visible = !riding || rideAim;   // auf dem Moped: Waffe nur beim Zielen
  if (a.rideArms) { a.rideArms.visible = riding && !rideAim; a.gunArms.visible = !riding || rideAim; a.rideArms.rotation.y += ((riding ? (a.steerVis || 0) * 0.3 : 0) - a.rideArms.rotation.y) * Math.min(1, dt * 12); }
  a.hipL.rotation.z += ((riding && a.footDown ? -0.22 : 0) - a.hipL.rotation.z) * Math.min(1, dt * 10);
  const s = 1 - Math.exp(-18 * dt);
  a.hipL.rotation.x += (tL - a.hipL.rotation.x) * s; a.hipR.rotation.x += (tR - a.hipR.rotation.x) * s;
  if (a.knees) { a.knees[0].rotation.x += (kL - a.knees[0].rotation.x) * s; a.knees[1].rotation.x += (kR - a.knees[1].rotation.x) * s; }
  a.hipL.position.y = a.hipR.position.y = riding ? 0.86 : 0.92 - 0.42 * c;
  // Auf dem Moped dreht sich der Oberkörper um die Hüfte (nicht um die Füße), damit er auf dem Sitz bleibt
  const pivY = riding ? 0.95 : 0, L = a.upper.rotation.x;
  a.upper.position.y += (((riding ? -0.06 : bob - 0.42 * c) + pivY * (1 - Math.cos(L))) - a.upper.position.y) * s;
  a.upper.position.z += ((riding ? -pivY * Math.sin(L) : 0) - a.upper.position.z) * s;
  a.upper.rotation.x += ((lean - 0.12 * c) - a.upper.rotation.x) * s;
  // Rückstoß beim Schießen
  a.kick = Math.max(0, (a.kick || 0) - dt * 8);
  a.pivot.position.z = a.kick * 0.06; a.pivot.rotation.x += a.kick * 0.05;
  // Schritte (lautlos beim Schleichen/Ducken) – kommen aus der Richtung des Spielers
  if (!air && !riding && amt > 0.4 && !sneak && !crouch && Math.sign(prev) !== Math.sign(Math.sin(a.phase))) {
    const d = pos.distanceTo(me.pos);
    if (d < 30) sndStep(0.11 * (1 - d / 30), pos);
  }
}
