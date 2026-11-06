'use strict';
/* ======================= Mopeds (im Stil der Simson S51) – fahrbar ======================= */
// Farben wie bei den klassischen Mopeds aus der DDR
const MOPED_PAINTS = [0x2a6fb5, 0xc0262b, 0x2f8f4a, 0xe8a92a, 0xd9c9a0, 0x1c1c1c, 0x6d8fb0, 0xd25a1e]
  .map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.28, metalness: 0.45, envMapIntensity: 1.2 }));
const MOPED = {
  seat: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.55 }),
  alu: new THREE.MeshStandardMaterial({ map: GUN_TEX, color: 0xe8e8ea, roughness: 0.45, metalness: 0.8 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 }),
  lens: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 0.9, roughness: 0.1 }),
  rear: new THREE.MeshStandardMaterial({ color: 0x660000, emissive: 0xff2020, emissiveIntensity: 0.8 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
};
const WHEEL_R = 0.3;
function makeWheel() {
  const g = new THREE.Group();
  const parts = [
    { geo: new THREE.TorusGeometry(WHEEL_R - 0.045, 0.045, 10, 26), mat: MOPED.rubber, p: [0, 0, 0], r: [0, 0, 0] },   // Reifen
    { geo: new THREE.TorusGeometry(WHEEL_R - 0.085, 0.012, 6, 26), mat: CHROME, p: [0, 0, 0], r: [0, 0, 0] },        // Felge
    C(0.065, 0.065, 0.09, MOPED.alu, 0, 0, 0, 16),                                                                      // Trommelbremse/Nabe
  ];
  for (let i = 0; i < 16; i++) {   // Speichen (abwechselnd links/rechts an der Nabe)
    const a = i / 16 * Math.PI * 2, s = i % 2 ? 1 : -1;
    parts.push(limbPart([Math.cos(a + 0.3) * 0.05, Math.sin(a + 0.3) * 0.05, s * 0.035], [Math.cos(a) * (WHEEL_R - 0.09), Math.sin(a) * (WHEEL_R - 0.09), 0], 0.003, 0.003, CHROME, 4));
  }
  g.add(partsToGroup(parts, true));
  return g;
}
// Moped-Modell: vorne = +x, Räder bei x = +0.62 / -0.6
function makeMoped(paint) {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const P = MOPED, pt = paint;
  // Schutzblech-Bogen über dem Rad (Winkel: π/2 = vorne, π = oben, 3π/2 = hinten)
  const fenderGeo = (start, len) => new THREE.CylinderGeometry(WHEEL_R + 0.04, WHEEL_R + 0.04, 0.11, 18, 1, true, start, len);
  const body = [
    // Rahmen, Tank, Sitzbank, Seitendeckel
    limbPart([0.42, 0.95, 0], [-0.02, 0.55, 0], 0.035, 0.035, pt),
    B(0.46, 0.2, 0.27, pt, 0.16, 0.82, 0, 0, 0, -0.15),                               // Tank
    B(0.1, 0.04, 0.12, CHROME, 0.2, 0.93, 0, 0, 0, -0.15),                           // Tankdeckel-Zierleiste
    B(0.78, 0.09, 0.25, P.seat, -0.38, 0.86, 0, 0, 0, 0.04),                         // Sitzbank
    B(0.34, 0.22, 0.32, pt, -0.26, 0.66, 0),                                         // Seitendeckel
    limbPart([-0.05, 0.62, 0.1], [-0.78, 0.84, 0.1], 0.02, 0.02, pt), limbPart([-0.05, 0.62, -0.1], [-0.78, 0.84, -0.1], 0.02, 0.02, pt),
    B(0.32, 0.015, 0.2, CHROME, -0.76, 0.92, 0),                                     // Gepäckträger
    // Gabel, Scheinwerfer, Tacho, Lenker
    limbPart([0.62, 0.3, 0.075], [0.43, 0.98, 0.075], 0.022, 0.024, CHROME), limbPart([0.62, 0.3, -0.075], [0.43, 0.98, -0.075], 0.022, 0.024, CHROME),
    limbPart([0.6, 0.38, 0.075], [0.55, 0.56, 0.075], 0.03, 0.03, P.rubber), limbPart([0.6, 0.38, -0.075], [0.55, 0.56, -0.075], 0.03, 0.03, P.rubber),
    CX(0.088, 0.13, pt, 0.5, 0.95, 0, 22),                                            // Scheinwerfergehäuse
    { geo: new THREE.CylinderGeometry(0.075, 0.075, 0.012, 22), mat: P.lens, p: [0.566, 0.95, 0], r: [0, 0, Math.PI / 2] },
    { geo: new THREE.TorusGeometry(0.08, 0.008, 6, 22), mat: CHROME, p: [0.565, 0.95, 0], r: [0, Math.PI / 2, 0] },
    CY(0.035, 0.03, CHROME, 0.47, 1.05, 0, 16),                                       // Tacho
    limbPart([0.38, 1.08, -0.32], [0.4, 1.06, 0], 0.012, 0.012, CHROME), limbPart([0.4, 1.06, 0], [0.38, 1.08, 0.32], 0.012, 0.012, CHROME),
    limbPart([0.38, 1.08, -0.33], [0.38, 1.08, -0.24], 0.018, 0.018, P.rubber), limbPart([0.38, 1.08, 0.24], [0.38, 1.08, 0.33], 0.018, 0.018, P.rubber),
    // Schutzbleche
    { geo: fenderGeo(Math.PI * 0.62, Math.PI * 0.72), mat: pt, p: [0.62, WHEEL_R, 0], r: [Math.PI / 2, 0, 0] },
    { geo: fenderGeo(Math.PI * 0.85, Math.PI * 0.8), mat: pt, p: [-0.6, WHEEL_R, 0], r: [Math.PI / 2, 0, 0] },
    // Motor mit Kühlrippen, Auspuff
    B(0.32, 0.24, 0.24, P.alu, 0.0, 0.42, 0),
    ...[0, 1, 2, 3, 4, 5].map(i => B(0.17, 0.012, 0.19, P.alu, 0.18 + i * 0.012, 0.5 + i * 0.026, 0, 0, 0, -0.55)),
    limbPart([0.26, 0.5, 0.06], [0.2, 0.26, 0.15], 0.022, 0.022, CHROME),
    limbPart([0.2, 0.26, 0.15], [-0.35, 0.3, 0.16], 0.022, 0.022, CHROME),
    { geo: new THREE.CylinderGeometry(0.045, 0.05, 0.48, 16), mat: CHROME, p: [-0.6, 0.33, 0.16], r: [0, 0, Math.PI / 2 - 0.06] },
    // Schwinge, Federbeine, Kettenschutz, Rücklicht, Kennzeichen, Fußrasten, Ständer
    limbPart([-0.08, 0.42, 0.11], [-0.6, WHEEL_R, 0.11], 0.022, 0.02, pt), limbPart([-0.08, 0.42, -0.11], [-0.6, WHEEL_R, -0.11], 0.022, 0.02, pt),
    limbPart([-0.54, 0.34, 0.12], [-0.64, 0.82, 0.12], 0.025, 0.025, CHROME), limbPart([-0.54, 0.34, -0.12], [-0.64, 0.82, -0.12], 0.025, 0.025, CHROME),
    limbPart([-0.56, 0.45, 0.12], [-0.61, 0.68, 0.12], 0.034, 0.034, P.rubber), limbPart([-0.56, 0.45, -0.12], [-0.61, 0.68, -0.12], 0.034, 0.034, P.rubber),
    B(0.55, 0.06, 0.035, P.rubber, -0.33, 0.33, -0.12),
    B(0.06, 0.05, 0.09, P.rear, -0.93, 0.78, 0), B(0.012, 0.12, 0.17, P.plate, -0.95, 0.63, 0),
    limbPart([-0.05, 0.33, 0.12], [-0.05, 0.33, 0.24], 0.012, 0.012, P.rubber), limbPart([-0.05, 0.33, -0.12], [-0.05, 0.33, -0.24], 0.012, 0.012, P.rubber),
  ];
  root.add(partsToGroup(body, true));
  const stand = partsToGroup([limbPart([-0.12, 0.32, -0.12], [-0.2, 0.0, -0.26], 0.012, 0.012, P.rubber)], true);
  root.add(stand);
  const wf = makeWheel(); wf.position.set(0.62, WHEEL_R, 0); root.add(wf);
  const wr = makeWheel(); wr.position.set(-0.6, WHEEL_R, 0); root.add(wr);
  scene.add(root);
  return { root, wf, wr, stand };
}

/* ---------- Zustand ---------- */
// Für alle Spieler gleich (Abstellplätze aus der Karte); Host verteilt Position/Fahrer per Snapshot
const vehicles = MAP_VEHICLES.map((v, i) => {
  const m = makeMoped(MOPED_PAINTS[i % MOPED_PAINTS.length]);
  return { i, x: v.x, y: 0, z: v.z, yaw: v.yaw, lean: 0, d: 0, mesh: m, spin: 0, rx: v.x, rz: v.z, ry: 0 };
});
const RIDER_BACK = 0.22, RIDER_UP = 0.06;   // Sitzposition des Fahrers relativ zum Moped
const ride = { v: -1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, speed: 0, lean: 0, onGround: true, h: 1.3, lastMouse: 0 };
let myRider = null;

function nearestFreeVehicle() {
  let best = -1, bd = 2.6;
  for (const v of vehicles) {
    if (v.d) continue;
    const d = Math.hypot(v.x - me.pos.x, v.z - me.pos.z);
    if (d < bd && Math.abs(v.y - me.pos.y) < 1.5) { bd = d; best = v.i; }
  }
  return best;
}
// E: auf-/absteigen
function toggleRide() {
  if (!me.alive) return;
  if (ride.v >= 0) return exitRide();
  const i = nearestFreeVehicle();
  if (i >= 0) net.send({ t: 'enter', v: i });
}
function startRide(i) {
  const v = vehicles[i]; if (!v) return;
  ride.v = i; ride.pos.set(v.x, v.y, v.z); ride.vel.set(0, 0, 0); ride.yaw = v.yaw; ride.speed = 0; ride.lean = 0;
  me.scoped = false; me.trigger = false; me.reloading = 0; me.sprintTap = false;
  me.yaw = ride.yaw - Math.PI / 2; me.pitch = -0.15;
  if (!myRider) { const mp = world.players[myId] || {}; myRider = makeAvatar({ id: '__me', name: '', color: mp.color || '#ffcc33', team: mp.team, w: me.weapon }); myRider.label.visible = false; myRider.parts.forEach(p => p.userData = {}); }
  myRider.g.visible = true;
  engineSound(true);
  showMsg('Aufgestiegen!  W Gas · S Bremse · A/D lenken · E absteigen');
}
function exitRide(silent) {
  if (ride.v < 0) return;
  const v = vehicles[ride.v];
  // neben dem Moped absteigen (links)
  const lx = Math.sin(ride.yaw) * -1.1, lz = Math.cos(ride.yaw) * -1.1;
  me.pos.set(ride.pos.x + lx, ride.pos.y + 0.1, ride.pos.z + lz); me.vel.set(0, 0, 0);
  net.send({ t: 'exit', v: ride.v, s: [ride.pos.x, ride.pos.y, ride.pos.z, ride.yaw] });
  v.x = ride.pos.x; v.y = ride.pos.y; v.z = ride.pos.z; v.yaw = ride.yaw; v.d = 0; v.lean = 0;
  ride.v = -1; ride.speed = 0;
  if (myRider) myRider.g.visible = false;
  engineSound(false);
  if (!silent) sndThud(0.4);
}

/* ---------- Fahrphysik (eigenes Moped) ---------- */
function updateRide(dt) {
  let thr = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
  if (touchIn.mx || touchIn.my) { thr = -touchIn.my; steer = -touchIn.mx; }
  // Gas / Bremse / Rückwärts
  if (thr > 0) ride.speed += (ride.speed < 0 ? 14 : 6.5 * (1 - ride.speed / 18)) * thr * dt;
  else if (thr < 0) ride.speed += (ride.speed > 0.3 ? -14 : -3) * -thr * dt;
  else ride.speed -= Math.sign(ride.speed) * Math.min(Math.abs(ride.speed), 1.6 * dt);
  ride.speed = Math.max(-3.5, Math.min(16.8, ride.speed));   // ca. 60 km/h Spitze
  // Lenken: bei Tempo weniger stark, rückwärts umgekehrt
  const sp = Math.abs(ride.speed);
  const turn = steer * Math.min(1, sp / 3) * (2.1 - Math.min(1.2, sp / 14)) * Math.sign(ride.speed || 1);
  ride.yaw += turn * dt;
  ride.lean += ((-steer * Math.min(1, sp / 9) * 0.42) - ride.lean) * Math.min(1, dt * 6);
  ride.vel.x = Math.cos(ride.yaw) * ride.speed; ride.vel.z = -Math.sin(ride.yaw) * ride.speed;
  ride.vel.y = Math.max(-30, ride.vel.y - GRAV * dt);
  moveBody(ride, ride.vel.x * dt, ride.vel.y * dt, ride.vel.z * dt);
  if (ride.blocked && sp > 2.5) { if (sp > 8) { sndThud(0.8); me.shake = Math.max(me.shake, 0.4); } ride.speed *= 0.25; }
  if (ride.pos.y < -10) ride.pos.set(0, 2, 0);
  // Spielerposition = auf dem Sitz
  me.pos.set(ride.pos.x - Math.cos(ride.yaw) * RIDER_BACK, ride.pos.y + RIDER_UP, ride.pos.z + Math.sin(ride.yaw) * RIDER_BACK);
  me.vel.set(ride.vel.x, 0, ride.vel.z); me.onGround = true;
  const v = vehicles[ride.v]; v.x = ride.pos.x; v.y = ride.pos.y; v.z = ride.pos.z; v.yaw = ride.yaw; v.lean = ride.lean;
  // Kamera: hinter dem Fahrer, Maus schaut sich um; ohne Maus richtet sie sich langsam nach vorne aus
  if (performance.now() - ride.lastMouse > 1500 && sp > 3) {
    let d = (ride.yaw - Math.PI / 2) - me.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    me.yaw += d * Math.min(1, dt * 2.5); me.pitch += (-0.15 - me.pitch) * Math.min(1, dt * 2);
  }
  const target = new THREE.Vector3(ride.pos.x, ride.pos.y + 1.55, ride.pos.z);
  const back = new THREE.Vector3(Math.sin(me.yaw) * Math.cos(me.pitch), -Math.sin(me.pitch), Math.cos(me.yaw) * Math.cos(me.pitch));
  let dist = 4.2;
  const hit = rayMap(target, back, dist + 0.3); if (hit) dist = Math.max(0.6, hit.dist - 0.3);   // nicht durch Wände schauen
  camera.position.copy(target).addScaledVector(back, dist);
  camera.rotation.set(me.pitch, me.yaw, 0);
  const targetFov = fovBase + Math.min(10, sp * 0.6);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix();
  engineSound(true, ride.speed, thr);
  viewGun.visible = false; viewKnife.visible = false; viewNade.visible = false;
}
document.addEventListener('mousemove', () => { if (ride.v >= 0) ride.lastMouse = performance.now(); });

/* ---------- Darstellung aller Mopeds ---------- */
function updateVehicles(dt) {
  for (const v of vehicles) {
    const m = v.mesh;
    let x = v.x, y = v.y, z = v.z, yaw = v.yaw, lean = v.lean;
    if (v.i === ride.v) { x = ride.pos.x; y = ride.pos.y; z = ride.pos.z; yaw = ride.yaw; lean = ride.lean; }
    else if (v.d && avatars[v.d] && avatars[v.d].g.visible) {
      // Fremdes Moped: an die (weich abgespielte) Figur des Fahrers koppeln
      const a = avatars[v.d].g; yaw = a.rotation.y + Math.PI / 2;
      x = a.position.x + Math.cos(yaw) * RIDER_BACK; z = a.position.z - Math.sin(yaw) * RIDER_BACK; y = a.position.y - RIDER_UP;
    }
    // Geschwindigkeit fürs Raddrehen
    const moved = Math.hypot(x - v.rx, z - v.rz); v.rx = x; v.rz = z;
    const fwd = Math.cos(yaw) * 1, dirSign = ((x - (m.root.position.x)) * Math.cos(yaw) - (z - m.root.position.z) * Math.sin(yaw)) >= 0 ? 1 : -1;
    v.spin += moved / WHEEL_R * dirSign;
    m.wf.rotation.z = m.wr.rotation.z = -v.spin;
    const parked = !v.d && v.i !== ride.v;
    m.stand.visible = parked;
    m.root.position.set(x, y, z);
    m.root.rotation.set(parked ? 0.12 : lean, yaw, 0);
    void fwd;
  }
  // eigene Figur auf dem Moped (nur in der Außenansicht sichtbar)
  if (myRider && ride.v >= 0) {
    myRider.g.position.copy(me.pos); myRider.g.rotation.set(0, ride.yaw - Math.PI / 2, ride.lean * 0.8);
    myRider.flags = 8; myRider.pivot.rotation.x = -0.3;
    animateAvatar(myRider, dt);
  }
}

/* ---------- Motorgeräusch (Zweitakter: knatternd) ---------- */
let eng = null;
function engineSound(on, speed = 0, thr = 0) {
  if (!actx) return;
  if (!on) { if (eng) { const t = actx.currentTime; eng.g.gain.setTargetAtTime(0, t, 0.1); const e = eng; setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch (x) {} }, 600); eng = null; } return; }
  if (!eng) {
    const o = actx.createOscillator(), o2 = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain(), am = actx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0;
    o2.frequency.value = 20; am.gain.value = 0.035;   // „Knattern“ des Zweitakters
    o.connect(f); f.connect(g); g.connect(master); o2.connect(am); am.connect(g.gain);
    o.start(); o2.start();
    eng = { o, o2, f, g };
  }
  const t = actx.currentTime, sp = Math.abs(speed);
  eng.o.frequency.setTargetAtTime(38 + sp * 7 + thr * 14, t, 0.08);
  eng.o2.frequency.setTargetAtTime(14 + sp * 2.2 + thr * 5, t, 0.08);
  eng.f.frequency.setTargetAtTime(600 + sp * 80 + thr * 500, t, 0.1);
  eng.g.gain.setTargetAtTime(0.05 + thr * 0.05 + sp * 0.003, t, 0.1);
}
