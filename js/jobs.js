'use strict';
/* ======================= Jobs bei Firmen (nur Karte „Welt“): Coins verdienen =======================
   Pizzeria: Pizza ausliefern · Post: 3 Pakete ausliefern · Taxi: Fahrgast abholen und hinbringen (Auto nötig)
   Hof Huber: 5 Strohballen auf den Feldern einsammeln und zur Scheune bringen.
   Annehmen: an der leuchtenden Markierung vor der Firma E drücken (Controller: Moped-Taste). Abbrechen: J. */
const JOB_INFO = {
  pizza: { name: 'Pizzeria Bella', icon: '🍕', title: 'Pizza ausliefern', pay: '100–350' },
  post: { name: 'Post', icon: '📦', title: '3 Pakete ausliefern', pay: '250–600' },
  taxi: { name: 'Taxi-Zentrale', icon: '🚕', title: 'Taxi fahren (Auto nötig)', pay: '150–450' },
  farm: { name: 'Hof Huber', icon: '🌾', title: 'Strohballen einsammeln', pay: '350' },
};
const JOBS = { list: window.MAP_JOBS || [], cur: null, near: null, markers: [], done: 0 };
try { JOBS.done = parseInt(localStorage.getItem('kz_jobs')) || 0; } catch (e) {}

/* ---------- HUD ---------- */
const jobHud = document.createElement('div'); jobHud.id = 'jobHud'; jobHud.className = 'hidden';
jobHud.innerHTML = '<div id="jobArrow">▲</div><div id="jobText"></div>';
document.getElementById('hud').appendChild(jobHud);
const jobHint = document.createElement('div'); jobHint.id = 'jobHint'; jobHint.className = 'hidden';
document.getElementById('hud').appendChild(jobHint);

/* ---------- Markierungen: Firmen (gelb) und Ziel (Lichtsäule) ---------- */
const JOB_RING_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.8 });
const JOB_BEAM_MAT = new THREE.MeshBasicMaterial({ color: 0x37c8ff, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
function jobRing(x, z, r, mat) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 8, 40), mat); m.rotation.x = Math.PI / 2; m.position.set(x, 0.15, z); m.userData.noMerge = true; scene.add(m); return m;
}
if (MAP_ID === 'welt') for (const c of JOBS.list) {
  const info = JOB_INFO[c.id];
  const ring = jobRing(c.x, c.z, 1.6, JOB_RING_MAT);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), tkSignMat(`${info.icon} JOBS`, '#111111', '#ffcc33', false));
  sign.position.set(c.x, 3.1, c.z); sign.userData.noMerge = true; scene.add(sign);
  JOBS.markers.push({ c, ring, sign });
}
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 70, 20, 1, true), JOB_BEAM_MAT); beam.visible = false; beam.userData.noMerge = true; scene.add(beam);
const beamRing = jobRing(0, 0, 3, new THREE.MeshBasicMaterial({ color: 0x37c8ff, transparent: true, opacity: 0.85 })); beamRing.visible = false;
const HAY_MAT = new THREE.MeshStandardMaterial({ color: 0xd9b55a, roughness: 1, emissive: 0x403010, bumpMap: TEX.blades, bumpScale: 0.02 });

/* ---------- Ziele auswählen ---------- */
const jdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function pickAddr(from, dmin, dmax, area) {
  const all = (window.MAP_ADDR || []).filter(a => (!area || a.area === area));
  const ok = all.filter(a => { const d = jdist(a, from); return d > dmin && d < dmax; });
  const list = ok.length ? ok : all;
  return list[Math.floor(Math.random() * list.length)];
}
function jobSay(t) { showMsg(t); sndBeep(740, 0.08, 0.1, 'triangle'); }

function acceptJob(c) {
  const info = JOB_INFO[c.id], from = { x: c.x, z: c.z };
  if (c.id === 'taxi' && !(ride.v >= 0 && ride.kind === 'car')) { showMsg('🚕 Für den Taxi-Job brauchst du ein Auto – vor der Taxi-Zentrale stehen welche!'); return; }
  const j = { id: c.id, c, info, stage: 0, targets: [], idx: 0, pay: 0, t: 0, hay: [] };
  if (c.id === 'pizza') {
    const a = pickAddr(from, 60, 260); j.targets = [a]; j.pay = Math.round((90 + jdist(a, from) * 0.95) / 10) * 10; j.t = jdist(a, from) / 6 + 45;
  } else if (c.id === 'post') {
    let p = from; for (let k = 0; k < 3; k++) { const a = pickAddr(p, 40, 220); j.targets.push(a); j.pay += 50 + jdist(a, p) * 0.7; p = a; }
    j.pay = Math.round((j.pay + 60) / 10) * 10; j.t = 0;   // Post: keine Zeitgrenze pro Job, Zeit läuft je Paket
    j.t = jdist(j.targets[0], from) / 6 + 40;
  } else if (c.id === 'taxi') {
    const a = pickAddr(from, 70, 200), b = pickAddr(a, 140, 400);
    j.targets = [a, b]; j.pay = Math.round((110 + jdist(a, b) * 0.85) / 10) * 10; j.t = jdist(a, from) / 9 + 45;
  } else if (c.id === 'farm') {
    const F = window.FARM_FIELDS || [];
    for (let k = 0; k < 5; k++) {
      const f = F[Math.floor(Math.random() * F.length)], x = f[0] + Math.random() * (f[2] - f[0]), z = f[1] + Math.random() * (f[3] - f[1]);
      const m = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 16)), HAY_MAT); m.rotation.z = Math.PI / 2; m.position.set(x, 0.75, z); m.castShadow = true; scene.add(m);
      j.hay.push({ x, z, m, got: false });
    }
    j.pay = 350; j.t = 240;
  }
  JOBS.cur = j;
  jobSay(`${info.icon} Job angenommen: ${info.title} – Lohn ${j.pay} Coins`);
  updateJobTarget();
}
function cancelJob(reason) {
  const j = JOBS.cur; if (!j) return;
  for (const h of j.hay) scene.remove(h.m);
  JOBS.cur = null; beam.visible = beamRing.visible = false; window.JOB_TGT = null;
  if (reason) { showMsg(reason); sndBeep(220, 0.2, 0.1, 'square'); }
}
function finishJob() {
  const j = JOBS.cur;
  shopState.coins += j.pay; saveShop(); updateCoins(true);
  JOBS.done++; try { localStorage.setItem('kz_jobs', JOBS.done); } catch (e) {}
  cancelJob();
  showMsg(`✅ Job erledigt! +${j.pay} Coins (${JOBS.done} Jobs insgesamt)`);
  sndBeep(880, 0.12, 0.12, 'sine'); setTimeout(() => sndBeep(1320, 0.15, 0.12, 'sine'), 100); setTimeout(() => sndBeep(1760, 0.2, 0.1, 'triangle'), 220);
}
// aktuelles Ziel (für Lichtsäule, Pfeil, Radar)
function currentTarget() {
  const j = JOBS.cur; if (!j) return null;
  if (j.id === 'farm') {
    if (j.stage === 0) { let best = null, bd = 1e9; for (const h of j.hay) if (!h.got) { const d = Math.hypot(h.x - me.pos.x, h.z - me.pos.z); if (d < bd) { bd = d; best = h; } } return best && { x: best.x, z: best.z, label: 'Strohballen' }; }
    return { x: window.FARM_BARN[0], z: window.FARM_BARN[1], label: 'Scheune vom Hof Huber' };
  }
  if (j.id === 'taxi') return j.stage === 0 ? Object.assign({}, j.targets[0], { label: 'Fahrgast abholen: ' + j.targets[0].label }) : Object.assign({}, j.targets[1], { label: 'Fahrgast hinbringen: ' + j.targets[1].label });
  return j.targets[j.idx];
}
function updateJobTarget() {
  const t = currentTarget(); window.JOB_TGT = t;
  beam.visible = beamRing.visible = !!t;
  if (t) { beam.position.set(t.x, 35, t.z); beamRing.position.set(t.x, 0.15, t.z); }
}

/* ---------- jede Bildwiederholung ---------- */
function updateJobs(dt) {
  if (MAP_ID !== 'welt' || !running) return;
  // Firma in der Nähe?
  JOBS.near = null;
  const tnow = performance.now() / 1000;
  for (const mk of JOBS.markers) {
    mk.ring.scale.setScalar(1 + Math.sin(tnow * 3) * 0.06); mk.sign.lookAt(camera.position.x, mk.sign.position.y, camera.position.z);
    if (me.alive && Math.hypot(mk.c.x - me.pos.x, mk.c.z - me.pos.z) < (ride.v >= 0 ? 5 : 3.2)) JOBS.near = mk.c;
  }
  const n = JOBS.near, key = TOUCH ? 'MOPED' : (typeof PCFG !== 'undefined' && document.body.classList.contains('hasPad') ? PAD_SHORT[PCFG.map.ride] : 'E');
  if (n && !JOBS.cur) { const i = JOB_INFO[n.id]; jobHint.innerHTML = `${i.icon} <b>${i.name}</b> – ${i.title} · Lohn ${i.pay} Coins<br><b>${key}</b> = Job annehmen`; jobHint.classList.remove('hidden'); }
  else if (n && JOBS.cur) { jobHint.innerHTML = `Du hast schon einen Job · <b>J</b> = abbrechen`; jobHint.classList.remove('hidden'); }
  else jobHint.classList.add('hidden');
  const j = JOBS.cur;
  if (!j) { jobHud.classList.add('hidden'); return; }
  if (!me.alive) return cancelJob('❌ Job verloren – du wurdest ausgeschaltet');
  j.t -= dt;
  if (j.t <= 0) return cancelJob('⏱ Zeit abgelaufen – Job nicht geschafft');
  // Fortschritt prüfen
  const sp = ride.v >= 0 ? Math.abs(ride.speed) : 0;
  const t = currentTarget();
  if (t) {
    const d = Math.hypot(t.x - me.pos.x, t.z - me.pos.z);
    if (j.id === 'farm' && j.stage === 0 && d < 3.2) {
      const h = j.hay.find(q => !q.got && q.x === t.x && q.z === t.z); if (h) { h.got = true; scene.remove(h.m); }
      const left = j.hay.filter(q => !q.got).length;
      if (left) jobSay(`🌾 Strohballen eingesammelt – noch ${left}`); else { j.stage = 1; jobSay('🌾 Alle Ballen! Jetzt zur Scheune bringen'); }
      updateJobTarget();
    } else if (j.id === 'farm' && j.stage === 1 && d < 6) finishJob();
    else if (j.id === 'taxi' && d < 7 && sp < 4) {
      if (!(ride.v >= 0 && ride.kind === 'car')) { if (Math.random() < 0.02) showMsg('🚕 Der Fahrgast steigt nur in ein Auto ein!'); }
      else if (j.stage === 0) { j.stage = 1; j.t = jdist(j.targets[0], j.targets[1]) / 8 + 50; jobSay('🚕 Fahrgast eingestiegen – fahr zum Ziel!'); updateJobTarget(); }
      else finishJob();
    } else if ((j.id === 'pizza' || j.id === 'post') && d < 4.5) {
      if (j.id === 'pizza') finishJob();
      else if (++j.idx >= j.targets.length) finishJob();
      else { j.t = jdist(j.targets[j.idx], j.targets[j.idx - 1]) / 6 + 35; jobSay(`📦 Paket abgegeben – noch ${j.targets.length - j.idx}`); updateJobTarget(); }
    }
  }
  if (!JOBS.cur) return;
  // Anzeige: Text + Pfeil
  const tt = currentTarget(); if (!tt) return;
  const dx = tt.x - me.pos.x, dz = tt.z - me.pos.z, d = Math.hypot(dx, dz);
  let rel = Math.atan2(-dx, -dz) - (ride.v >= 0 && !riderAiming() ? camera.rotation.y : me.yaw); rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  $('jobArrow').style.transform = `rotate(${-rel * 180 / Math.PI}deg)`;
  const mm = Math.floor(j.t / 60), ss = Math.floor(j.t % 60);
  const extra = j.id === 'post' ? ` (${j.idx + 1}/3)` : j.id === 'farm' && j.stage === 0 ? ` (${j.hay.filter(q => q.got).length}/5)` : '';
  $('jobText').innerHTML = `${j.info.icon} <b>${j.info.title}${extra}</b> · ${tt.label}<br>${Math.round(d)} m · ⏱ ${mm}:${String(ss).padStart(2, '0')} · Lohn <b>${j.pay}</b> Coins · <span style="opacity:.7">J = abbrechen</span>`;
  jobHud.classList.toggle('late', j.t < 20);
  jobHud.classList.remove('hidden');
  beam.material.opacity = 0.2 + Math.sin(tnow * 4) * 0.08;
}
window.updateJobs = updateJobs;

/* ---------- Eingabe: E an der Firma = Job annehmen, J = abbrechen ---------- */
const _jobToggleRide = toggleRide;
window.toggleRide = () => {
  if (MAP_ID === 'welt' && running && me.alive && JOBS.near && !JOBS.cur && (ride.v < 0 || Math.abs(ride.speed) < 3)) return acceptJob(JOBS.near);
  if (MAP_ID === 'welt' && JOBS.near && JOBS.cur && ride.v < 0) { showMsg('Du hast schon einen Job · J = abbrechen'); return; }
  return _jobToggleRide();
};
document.addEventListener('keydown', e => { if (e.code === 'KeyJ' && running && locked && JOBS.cur) cancelJob('Job abgebrochen'); });
