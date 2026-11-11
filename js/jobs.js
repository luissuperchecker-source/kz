'use strict';
/* ======================= Jobs bei Firmen (nur Karte „Welt“) – realistisch =======================
   🍕 Pizzeria: Pizza an der Theke abholen → zum Kunden fahren → absteigen, klingeln, übergeben. Trinkgeld je nach Temperatur/Zustand/Tempo.
   📦 Post: Pakete am Schalter laden → Tour fahren, an jeder Tür klingeln (manchmal beim Nachbarn abgeben).
   🚕 Taxi: mit einem Auto Fahrgast abholen (winkt am Straßenrand) → Taxameter läuft → Fahrstil wird mit Sternen bewertet.
   🌾 Hof Huber: Strohballen auf den Feldern aufladen (zu Fuß 1, Moped 1, Auto 3) und in der Scheune stapeln.
   Erfahrung je Firma → höhere Stufe = mehr Lohn. Nach jedem Auftrag kommt ein Folgeauftrag (Serienbonus).
   Annehmen/Abholen/Klingeln: E (Controller: Moped-Taste). Abbrechen: J. */
const JOB_INFO = {
  pizza: { name: 'Pizzeria Bella', icon: '🍕', title: 'Pizzabote', pay: '120–400', boss: 'Luigi' },
  post: { name: 'Post', icon: '📦', title: 'Paketzusteller', pay: '250–700', boss: 'Frau Becker' },
  taxi: { name: 'Taxi-Zentrale', icon: '🚕', title: 'Taxifahrer', pay: '150–550', boss: 'Herr Yilmaz' },
  farm: { name: 'Hof Huber', icon: '🌾', title: 'Erntehelfer', pay: '400–550', boss: 'Bauer Huber' },
  fire: { name: 'Feuerwehr Birkendorf', icon: '🚒', title: 'Feuerwehrmann', pay: '300–650', boss: 'Kommandant Weber' },
  trash: { name: 'Stadtreinigung', icon: '🗑️', title: 'Müllwerker', pay: '250–500', boss: 'Herr Kraus' },
};
const FIRE_TIME = 6;   // so lange muss man löschen (Sekunden)
const RANKS = ['Aushilfe', 'Mitarbeiter', 'Profi', 'Chef'];
const JOBS = { list: window.MAP_JOBS || [], cur: null, near: null, markers: [], done: 0, xp: {}, chain: 0, offer: null, uiT: 0 };
try { JOBS.done = parseInt(localStorage.getItem('kz_jobs')) || 0; JOBS.xp = JSON.parse(localStorage.getItem('kz_jobxp') || '{}'); } catch (e) {}
const jobLevel = id => { const x = JOBS.xp[id] || 0; return x >= 25 ? 3 : x >= 12 ? 2 : x >= 4 ? 1 : 0; };
const payMul = id => (1 + jobLevel(id) * 0.12) * (1 + Math.min(0.5, JOBS.chain * 0.1));
const coinsR = v => Math.max(5, Math.round(v / 5) * 5);
const WELT = MAP_ID === 'welt';

/* ---------- HUD-Elemente ---------- */
const mkDiv = (id, cls) => { const d = document.createElement('div'); d.id = id; if (cls) d.className = cls; document.getElementById('hud').appendChild(d); return d; };
const jobHud = mkDiv('jobHud', 'hidden'); jobHud.innerHTML = '<div id="jobArrow">▲</div><div id="jobText"></div>';
const jobHint = mkDiv('jobHint', 'hidden');
const jobReceipt = mkDiv('jobReceipt', 'hidden');
function showReceipt(html) {
  jobReceipt.innerHTML = html; jobReceipt.classList.remove('hidden');
  clearTimeout(jobReceipt._t); jobReceipt._t = setTimeout(() => jobReceipt.classList.add('hidden'), 6500);
}
const stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
const bar = (v, col) => `<span class="jbar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${col}"></i></span>`;

/* ---------- Menschen (Kunden, Fahrgäste, Chefs) ---------- */
const NPC_SKIN = [0xf1c7a5, 0xd9a47c, 0xa8704a, 0x6b4428].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
const NPC_SHIRT = [0xc0392b, 0x2e86de, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xecf0f1, 0x34495e, 0xe67e22].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
const NPC_PANTS = [0x2c3e50, 0x1e272e, 0x5d4037, 0x3d5a80].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
const NPC_HAIR = [0x2b1b10, 0x6b4423, 0xd8b26a, 0x1a1a1a, 0x9a9a9a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
const NPC_SHOE = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
const NPC_WHITE = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.8 });
function makeNPC(seed, outfit) {
  const r = k => (Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453 % 1 + 1) % 1;
  const skin = NPC_SKIN[Math.floor(r(1) * 4)], shirt = outfit === 'chef' ? NPC_WHITE : outfit === 'post' ? MAT.yellow : NPC_SHIRT[Math.floor(r(2) * 8)];
  const pants = NPC_PANTS[Math.floor(r(3) * 4)], hair = NPC_HAIR[Math.floor(r(4) * 5)];
  const g = new THREE.Group(), add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const leg = x => { const p = new THREE.Group(); p.position.set(x, 0.9, 0); g.add(p); add(roundedBoxGeo(0.16, 0.86, 0.18, 0.05), pants, 0, -0.45, 0, p); add(roundedBoxGeo(0.17, 0.09, 0.28, 0.04), NPC_SHOE, 0, -0.86, -0.04, p); return p; };
  const legL = leg(-0.1), legR = leg(0.1);
  add(roundedBoxGeo(0.44, 0.62, 0.26, 0.08), shirt, 0, 1.22, 0);
  if (outfit === 'chef') add(roundedBoxGeo(0.4, 0.5, 0.02, 0.01), NPC_WHITE, 0, 1.05, -0.14);
  const arm = x => { const p = new THREE.Group(); p.position.set(x, 1.48, 0); g.add(p); add(roundedBoxGeo(0.12, 0.58, 0.13, 0.05), shirt, 0, -0.28, 0, p); add(new THREE.SphereGeometry(0.06, 10, 8), skin, 0, -0.6, 0, p); return p; };
  const armL = arm(-0.29), armR = arm(0.29);
  add(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), skin, 0, 1.58, 0);
  const head = add(new THREE.SphereGeometry(0.13, 16, 12), skin, 0, 1.74, 0); head.scale.set(1, 1.12, 1.02);
  if (outfit === 'chef') add(new THREE.CylinderGeometry(0.13, 0.12, 0.2, 14), NPC_WHITE, 0, 1.94, 0);
  else if (outfit === 'post') add(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 14), MAT.yellow, 0, 1.86, 0);
  else { const h = add(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 1.77, 0.01); h.scale.set(1.02, 1.05, 1.08); }
  for (const e of [-0.045, 0.045]) add(new THREE.SphereGeometry(0.016, 6, 5), NPC_SHOE, e, 1.77, -0.12);
  g.visible = false; scene.add(g);
  return { g, armL, armR, legL, legR, t: Math.random() * 5, mode: 'idle', walkTo: null, onArrive: null };
}
function npcShow(n, x, z, lookX, lookZ) { n.g.position.set(x, 0, z); n.g.visible = true; n.mode = 'idle'; n.walkTo = null; npcLook(n, lookX, lookZ); }
function npcLook(n, x, z) { n.g.rotation.y = Math.atan2(-(x - n.g.position.x), -(z - n.g.position.z)); }
function npcWalk(n, x, z, done) { n.walkTo = new THREE.Vector3(x, 0, z); n.onArrive = done; n.mode = 'walk'; npcLook(n, x, z); }
function updateNPC(n, dt) {
  if (!n.g.visible) return;
  n.t += dt;
  let la = 0, ra = 0, ll = 0, lr = 0;
  if (n.mode === 'walk' && n.walkTo) {
    const p = n.g.position, dx = n.walkTo.x - p.x, dz = n.walkTo.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.15) { n.mode = 'idle'; const f = n.onArrive; n.onArrive = null; n.walkTo = null; if (f) f(); }
    else { const s = Math.min(d, 1.5 * dt); p.x += dx / d * s; p.z += dz / d * s; const w = Math.sin(n.t * 8) * 0.55; ll = w; lr = -w; la = -w * 0.7; ra = w * 0.7; }
  } else if (n.mode === 'wave') { ra = -2.6 + Math.sin(n.t * 9) * 0.35; }
  else if (n.mode === 'give') { ra = -1.3; la = -1.3; }
  else { la = Math.sin(n.t * 1.3) * 0.05; ra = -la; }
  n.armL.rotation.x += (la - n.armL.rotation.x) * Math.min(1, dt * 10); n.armR.rotation.x += (ra - n.armR.rotation.x) * Math.min(1, dt * 10);
  n.legL.rotation.x = ll; n.legR.rotation.x = lr;
  n.g.position.y = n.mode === 'walk' ? Math.abs(Math.sin(n.t * 8)) * 0.03 : 0;
}
const NPCS = [];
const customer = makeNPC(7), passenger = makeNPC(23); NPCS.push(customer, passenger);
const bosses = {};
if (WELT) {
  const mk = (id, pos, outfit, seed) => { if (!pos) return; const n = makeNPC(seed, outfit); NPCS.push(n); bosses[id] = n; npcShow(n, pos[0], pos[1], pos[0], pos[1] + 5); };
  mk('pizza', window.PIZZA_CHEF, 'chef', 3); mk('post', window.POST_CLERK, 'post', 11);
  mk('taxi', window.TAXI_BOSS, null, 17); mk('farm', window.FARM_BOSS, null, 29);
  mk('fire', window.FIRE_BOSS, null, 41); mk('trash', window.TRASH_BOSS, 'post', 53);
  (window.GUN_SHOPS || []).forEach((s, i) => { if (!s.keeper) return; const n = makeNPC(61 + i * 7, null); NPCS.push(n); npcShow(n, s.keeper[0], s.keeper[1], s.keeper[2], s.keeper[3]); });   // Verkäufer hinter der Theke
  if (bosses.pizza) npcLook(bosses.pizza, window.PIZZA_PICKUP[0], window.PIZZA_PICKUP[1]);
  if (bosses.post) npcLook(bosses.post, window.POST_PICKUP[0], window.POST_PICKUP[1]);
}

/* ---------- Ware in der Hand (Ego-Ansicht) ---------- */
const pizzaTex = canvasTex((g, s) => {
  g.fillStyle = '#d9b98a'; g.fillRect(0, 0, s, s); g.strokeStyle = '#a8865a'; g.lineWidth = 6; g.strokeRect(6, 6, s - 12, s - 12);
  g.fillStyle = '#c0262b'; g.font = `900 ${s * 0.16}px sans-serif`; g.textAlign = 'center'; g.fillText('PIZZA', s / 2, s * 0.48); g.font = `700 ${s * 0.1}px sans-serif`; g.fillText('BELLA', s / 2, s * 0.62);
}, 128, false);
const CARRY = {
  pizza: (() => { const g = new THREE.Group(); const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.42), [MAT.crate, MAT.crate, new THREE.MeshStandardMaterial({ map: pizzaTex, roughness: 0.9 }), MAT.crate, MAT.crate, MAT.crate]); g.add(box); return g; })(),
  parcel: (() => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.32), new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.9 }))); const tape = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.29, 0.06), new THREE.MeshStandardMaterial({ color: 0xd8c27a, roughness: 0.6 })); g.add(tape); return g; })(),
  hay: (() => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 14), new THREE.MeshStandardMaterial({ color: 0xd9b55a, roughness: 1, bumpMap: TEX.blades, bumpScale: 0.02 })); c.rotation.z = Math.PI / 2; g.add(c); return g; })(),
  hose: (() => {   // Strahlrohr der Feuerwehr
    const g = new THREE.Group(), red = new THREE.MeshStandardMaterial({ color: 0xb8231c, roughness: 0.5 }), al = new THREE.MeshStandardMaterial({ color: 0xbfc3c8, roughness: 0.3, metalness: 0.8 });
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.42, 12), al); a.rotation.x = Math.PI / 2; a.position.z = -0.12; g.add(a);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12), red); b.rotation.x = Math.PI / 2; b.position.z = 0.12; g.add(b);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), red); h.position.set(0, -0.09, 0.05); g.add(h);
    return g;
  })(),
};
// Mülltonne (grau mit grünem Deckel)
const BIN_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.7 }), BIN_LID = new THREE.MeshStandardMaterial({ color: 0x2f7a3c, roughness: 0.6 });
function binMesh(x, z) {
  const g = new THREE.Group(), y = hillH(x, z);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.0, 0.7), BIN_MAT); b.position.y = 0.5; b.castShadow = true; g.add(b);
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.07, 0.74), BIN_LID); l.position.y = 1.03; g.add(l);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), NPC_SHOE); w.rotation.z = Math.PI / 2; w.position.set(s * 0.33, 0.1, 0.3); g.add(w); }
  g.position.set(x, y, z); scene.add(g); return g;
}
for (const k in CARRY) { const m = CARRY[k]; m.visible = false; m.position.set(0.05, -0.42, -0.62); m.rotation.set(0.25, 0, 0); camera.add(m); }
function carryItem() {
  const j = JOBS.cur; if (!j) return null;
  if (j.id === 'pizza' && j.stage === 'deliver') return 'pizza';
  if (j.id === 'post' && j.stage === 'deliver') return 'parcel';
  if (j.id === 'farm' && j.hand) return 'hay';
  if (j.id === 'fire' && j.to && Math.hypot(j.to.door.x - me.pos.x, j.to.door.z - me.pos.z) < 30) return 'hose';
  return null;
}
// Mit vollen Händen kann man nicht schießen (mit dem Schlauch: Linksklick = löschen)
const _jobTryShoot = tryShoot;
window.tryShoot = now => {
  if (carryItem() === 'hose' && ride.v < 0) return;
  if (carryItem() && ride.v < 0) { if (!JOBS.handsMsg || now - JOBS.handsMsg > 2) { JOBS.handsMsg = now; showMsg(`Hände voll – erst abliefern (${kbK('jobCancel')} = Job abbrechen)`); } return; }
  return _jobTryShoot(now);
};

/* ---------- Markierungen ---------- */
const JOB_RING_MAT = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.8 });
const JOB_BEAM_MAT = new THREE.MeshBasicMaterial({ color: 0x37c8ff, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
function jobRing(x, z, r, mat) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 8, 40), mat); m.rotation.x = Math.PI / 2; m.position.set(x, 0.15 + hillH(x, z), z); scene.add(m); return m; }
if (WELT) for (const c of JOBS.list) {
  const info = JOB_INFO[c.id];
  const ring = jobRing(c.x, c.z, 1.6, JOB_RING_MAT);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), tkSignMat(`${info.icon} JOBS`, '#111111', '#ffcc33', false));
  sign.position.set(c.x, 3.1, c.z); scene.add(sign);
  JOBS.markers.push({ c, ring, sign });
}
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 70, 20, 1, true), JOB_BEAM_MAT); beam.visible = false; scene.add(beam);
const beamRing = jobRing(0, 0, 1.2, new THREE.MeshBasicMaterial({ color: 0x37c8ff, transparent: true, opacity: 0.85 })); beamRing.visible = false;
const HAY_MAT = new THREE.MeshStandardMaterial({ color: 0xd9b55a, roughness: 1, emissive: 0x403010, bumpMap: TEX.blades, bumpScale: 0.02 });
const hayMesh = (x, y, z) => { const m = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 16)), HAY_MAT); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; scene.add(m); return m; };
const barnStack = [];

/* ---------- Hilfen ---------- */
const jdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const PIZZAS = ['Salami', 'Margherita', 'Hawaii', 'Funghi', 'Tonno', 'Diavolo', 'Quattro Formaggi', 'Prosciutto'];
const PERSONAS = [
  { id: 'eilig', text: 'Ich hab\'s eilig – bitte schnell!', icon: '⏱' },
  { id: 'angst', text: 'Bitte fahren Sie vorsichtig, ich hab Angst beim Autofahren.', icon: '😰' },
  { id: 'normal', text: 'Guten Tag! Ganz entspannt bitte.', icon: '🙂' },
  { id: 'tourist', text: 'Hallo! Ich bin zum ersten Mal hier – schöne Stadt!', icon: '📷' },
];
function pickAddr(from, dmin, dmax, area, not) {
  const all = (window.MAP_ADDR || []).filter(a => (!area || a.area === area) && a !== not);
  const ok = all.filter(a => { const d = jdist(a, from); return d > dmin && d < dmax; });
  const list = ok.length ? ok : all;
  return list[Math.floor(Math.random() * list.length)];
}
function jobSay(t) { showMsg(t); sndBeep(740, 0.08, 0.1, 'triangle'); }
function doorbell() { sndBeep(880, 0.25, 0.14, 'sine'); setTimeout(() => sndBeep(698, 0.4, 0.14, 'sine'), 280); }
function cash() { sndBeep(880, 0.1, 0.12, 'sine'); setTimeout(() => sndBeep(1320, 0.14, 0.12, 'sine'), 90); setTimeout(() => sndBeep(1760, 0.2, 0.1, 'triangle'), 200); }
function earn(v) { shopState.coins += v; saveShop(); updateCoins(true); }
function addXP(id) {
  const before = jobLevel(id);
  JOBS.xp[id] = (JOBS.xp[id] || 0) + 1; JOBS.done++;
  try { localStorage.setItem('kz_jobxp', JSON.stringify(JOBS.xp)); localStorage.setItem('kz_jobs', JOBS.done); } catch (e) {}
  if (jobLevel(id) > before) setTimeout(() => jobSay(`⬆ Beförderung bei ${JOB_INFO[id].name}: jetzt „${RANKS[jobLevel(id)]}“ – mehr Lohn!`), 2500);
}
const onFoot = () => ride.v < 0;
const inCar = () => ride.v >= 0 && ride.kind === 'car';

/* ---------- Auftrag annehmen ---------- */
function acceptJob(c, chained) {
  const info = JOB_INFO[c.id];
  if (!chained) JOBS.chain = 0;
  const j = { id: c.id, c, info, stage: '', t: 0, tMax: 0, pay: 0, cond: 100, temp: 100, stars: 5, log: [] };
  const boss = bosses[c.id];
  if (c.id === 'pizza') {
    j.stage = 'pickup'; j.t = 90;
    jobSay(`${info.icon} ${info.boss}: „Eine Bestellung ist fertig – hol sie an der Theke ab!“`);
  } else if (c.id === 'post') {
    j.stage = 'load'; j.t = 90;
    jobSay(`${info.icon} ${info.boss}: „Deine Tour liegt am Schalter bereit.“`);
  } else if (c.id === 'taxi') {
    j.stage = inCar() ? 'pickup' : 'car'; j.t = 240;
    if (j.stage === 'pickup') startTaxiPickup(j);
    else jobSay(`${info.icon} ${info.boss}: „Nimm dir ein Auto vom Hof, dann schicke ich dir einen Fahrgast.“`);
  } else if (c.id === 'farm') {
    j.stage = 'collect'; j.t = 330; j.load = []; j.hand = false; j.bales = []; j.stacked = 0;
    const F = window.FARM_FIELDS || [];
    for (let k = 0; k < 6; k++) {
      const f = F[Math.floor(Math.random() * F.length)], x = f[0] + Math.random() * (f[2] - f[0]), z = f[1] + Math.random() * (f[3] - f[1]);
      j.bales.push({ x, z, m: hayMesh(x, 0.75 + hillH(x, z), z), got: false });   // auf dem Hügel liegen
    }
    jobSay(`${info.icon} ${info.boss}: „6 Strohballen liegen auf den Feldern – bring sie in die Scheune!“`);
  } else if (c.id === 'fire') {   // Alarm: ein Haus brennt → hinfahren, aussteigen, löschen
    j.to = pickAddr(c, 80, 320); j.stage = 'drive'; j.prog = 0; j.fx = 0;
    j.t = jdist(j.to, c) / 7 + 55;
    jobSay(`🚨 ${info.boss}: „Alarm! Feuer in der ${j.to.label} – fahr sofort hin und lösch es!“`); sndBeep(990, 0.3, 0.12, 'square'); setTimeout(() => sndBeep(740, 0.3, 0.12, 'square'), 320);
  } else if (c.id === 'trash') {   // 4 Mülltonnen leeren, dann zurück zum Recyclinghof
    j.stage = 'collect'; j.bins = []; j.emptied = 0; j.earned = 0; let p = c;
    for (let k = 0; k < 4; k++) { const a = pickAddr(p, 40, 220, null, j.bins[k - 1] && j.bins[k - 1].a); j.bins.push({ a, m: binMesh(a.x, a.z), done: false }); p = a; }
    j.t = 60 + j.bins.reduce((s, b, k) => s + jdist(b.a, k ? j.bins[k - 1].a : c) / 6, 0) + jdist(j.bins[3].a, c) / 6 + 40;
    jobSay(`🗑️ ${info.boss}: „4 Tonnen warten auf dich – danach alles hier zum Recyclinghof!“`);
  }
  if (boss) { boss.mode = 'wave'; setTimeout(() => { if (boss.mode === 'wave') boss.mode = 'idle'; }, 1600); }
  j.tMax = j.t;
  JOBS.cur = j; JOBS.offer = null;
  updateJobTarget();
}
function startTaxiPickup(j) {
  const a = pickAddr(j.c, 60, 220);
  j.from = a; j.persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
  j.stage = 'pickup'; j.t = jdist(a, j.c) / 8 + 60; j.tMax = j.t;
  npcShow(passenger, a.x, a.z, a.x + 1, a.z); passenger.mode = 'wave';
  jobSay('🚕 Zentrale: „Fahrgast wartet an der ' + a.label + '.“');
}
function cancelJob(reason) {
  const j = JOBS.cur; if (!j) return;
  if (j.bales) for (const b of j.bales) if (b.m) scene.remove(b.m);
  if (j.bins) for (const b of j.bins) if (b.m) scene.remove(b.m);
  customer.g.visible = false; passenger.g.visible = false;
  JOBS.cur = null; JOBS.chain = 0; beam.visible = beamRing.visible = false; window.JOB_TGT = null;
  for (const k in CARRY) CARRY[k].visible = false;
  if (reason) { showMsg(reason); sndBeep(220, 0.2, 0.1, 'square'); }
}
// Auftrag fertig → Lieferschein, Folgeauftrag anbieten
function finishJob(lines, total, shown = total) {
  const j = JOBS.cur;
  earn(total); addXP(j.id); cash();
  const lv = RANKS[jobLevel(j.id)];
  showReceipt(`<div class="rTitle">${j.info.icon} ${j.info.name} – Lieferschein</div>${lines.map(l => `<div class="rRow"><span>${l[0]}</span><b>${l[1]}</b></div>`).join('')}
    <div class="rRow rSum"><span>Gesamt</span><b>+${shown} Coins</b></div><div class="rFoot">${lv} · ${JOBS.xp[j.id]} Aufträge · Serie ×${JOBS.chain + 1}</div>`);
  const c = j.c;
  JOBS.cur = null; beam.visible = beamRing.visible = false; window.JOB_TGT = null;
  for (const k in CARRY) CARRY[k].visible = false;
  JOBS.chain++;
  JOBS.offer = { c, t: 12 };
}

/* ---------- Ziele ---------- */
function currentTarget() {
  const j = JOBS.cur; if (!j) return null;
  if (j.id === 'pizza') return j.stage === 'pickup' ? { x: window.PIZZA_PICKUP[0], z: window.PIZZA_PICKUP[1], label: 'Theke in der Pizzeria', door: true }
    : { x: j.to.door.x, z: j.to.door.z, label: j.to.label, door: true };
  if (j.id === 'post') return j.stage === 'load' ? { x: window.POST_PICKUP[0], z: window.POST_PICKUP[1], label: 'Paketschalter in der Post', door: true }
    : { x: j.list[j.idx].door.x, z: j.list[j.idx].door.z, label: j.list[j.idx].label + (j.list[j.idx].neighbor ? ' (Nachbar)' : ''), door: true };
  if (j.id === 'taxi') {
    if (j.stage === 'car') { const cars = vehicles.filter(v => v.kind === 'car' && !v.d); let best = cars[0], bd = 1e9; for (const v of cars) { const d = Math.hypot(v.x - me.pos.x, v.z - me.pos.z); if (d < bd) { bd = d; best = v; } } return best ? { x: best.x, z: best.z, label: 'Freies Auto' } : null; }
    return j.stage === 'pickup' ? { x: j.from.x, z: j.from.z, label: 'Fahrgast: ' + j.from.label } : { x: j.to.x, z: j.to.z, label: 'Ziel: ' + j.to.label };
  }
  if (j.id === 'fire') return { x: j.to.door.x, z: j.to.door.z, label: '🔥 Brand: ' + j.to.label };
  if (j.id === 'trash') {
    let best = null, bd = 1e9; for (const b of j.bins) if (!b.done) { const d = Math.hypot(b.a.x - me.pos.x, b.a.z - me.pos.z); if (d < bd) { bd = d; best = b; } }
    return best ? { x: best.a.x, z: best.a.z, label: 'Mülltonne: ' + best.a.label, door: true } : { x: j.c.x, z: j.c.z, label: 'Recyclinghof (abladen)' };
  }
  if (j.id === 'farm') {
    const full = j.hand || j.load.length >= (inCar() ? 3 : 1) || j.bales.every(b => b.got);
    if (full || (j.load.length && j.bales.every(b => b.got))) return { x: window.FARM_BARN[0], z: window.FARM_BARN[1], label: 'Scheune vom Hof Huber', door: true };
    let best = null, bd = 1e9; for (const b of j.bales) if (!b.got) { const d = Math.hypot(b.x - me.pos.x, b.z - me.pos.z); if (d < bd) { bd = d; best = b; } }
    return best && { x: best.x, z: best.z, label: 'Strohballen' };
  }
}
function updateJobTarget() {
  const t = currentTarget(); window.JOB_TGT = t;
  beam.visible = beamRing.visible = !!t;
  if (t) { const r = t.door ? 0.55 : 1.2; beam.scale.set(r, 1, r); beam.position.set(t.x, 35, t.z); beamRing.position.set(t.x, 0.15 + hillH(t.x, t.z), t.z); beamRing.scale.setScalar(t.door ? 0.9 : 2.2); }
}

/* ---------- Interaktion (E): abholen, klingeln, aufladen, abladen ---------- */
function jobInteract() {
  const j = JOBS.cur; if (!j || j.busy) return false;
  const t = currentTarget(); if (!t) return false;
  const d = Math.hypot(t.x - me.pos.x, t.z - me.pos.z);
  if (j.id === 'pizza' && j.stage === 'pickup' && d < 2.4 && onFoot()) {
    const n = 1 + Math.floor(Math.random() * 3), names = Array.from({ length: n }, () => PIZZAS[Math.floor(Math.random() * PIZZAS.length)]);
    j.order = names; j.to = pickAddr(t, 70, 280);
    j.stage = 'deliver'; j.t = jdist(j.to, t) / 6.5 + 45 + n * 8; j.tMax = j.t; j.temp = 100; j.cond = 100;
    if (bosses.pizza) { bosses.pizza.mode = 'give'; setTimeout(() => bosses.pizza.mode = 'idle', 900); }
    jobSay(`🍕 ${names.join(' + ')} für ${j.to.label} – noch heiß, beeil dich!`); updateJobTarget(); return true;
  }
  if (j.id === 'post' && j.stage === 'load' && d < 2.4 && onFoot()) {
    const n = 3 + Math.floor(Math.random() * 3); let p = t; j.list = [];
    for (let k = 0; k < n; k++) { const a = pickAddr(p, 30, 200, null, j.list[k - 1]); j.list.push(Object.assign({}, a, { fragile: Math.random() < 0.3 })); p = a; }
    j.idx = 0; j.stage = 'deliver'; j.t = 60 + j.list.reduce((s, a, k) => s + jdist(a, k ? j.list[k - 1] : t) / 6, 0) + n * 20; j.tMax = j.t; j.earned = 0; j.cond = 100;
    if (bosses.post) { bosses.post.mode = 'give'; setTimeout(() => bosses.post.mode = 'idle', 900); }
    jobSay(`📦 ${n} Pakete geladen${j.list.some(a => a.fragile) ? ' – Vorsicht, Zerbrechliches dabei!' : ''}`); updateJobTarget(); return true;
  }
  if ((j.id === 'pizza' || j.id === 'post') && j.stage === 'deliver' && d < 2.4) {
    if (!onFoot()) { showMsg('Erst absteigen, dann klingeln'); return false; }
    j.busy = true; doorbell(); showMsg('🔔 Ding-Dong …');
    const a = j.id === 'pizza' ? j.to : j.list[j.idx];
    const nobody = j.id === 'post' && !a.neighbor && Math.random() < 0.22;
    setTimeout(() => {
      if (JOBS.cur !== j) return;
      if (nobody) {
        j.busy = false;
        const nb = (window.MAP_ADDR || []).filter(q => q !== a && jdist(q, a) < 45 && !j.list.includes(q)).sort((p, q) => jdist(p, a) - jdist(q, a))[0];
        if (nb) { j.list[j.idx] = Object.assign({}, nb, { neighbor: true, fragile: a.fragile, label: nb.label }); jobSay(`📦 Niemand zu Hause – gib das Paket beim Nachbarn ab (${nb.label}).`); }
        else { j.list[j.idx].neighbor = true; jobSay('📦 Niemand zu Hause – lege es vor die Tür (nochmal E).'); }
        updateJobTarget(); return;
      }
      npcShow(customer, a.door.x, a.door.z, me.pos.x, me.pos.z); customer.mode = 'give';
      setTimeout(() => {
        if (JOBS.cur !== j) return;
        j.busy = false;
        if (j.id === 'pizza') pizzaDone(j); else parcelDone(j, a);
        setTimeout(() => { if (customer.g.visible) { customer.mode = 'idle'; customer.g.visible = false; } }, 2500);
      }, 1100);
    }, 1300);
    return true;
  }
  if (j.id === 'trash' && t.door && d < 2.6) {   // Tonne in den (gedachten) Müllwagen kippen
    if (!onFoot()) { showMsg('Erst aussteigen, dann die Tonne leeren'); return false; }
    const b = j.bins.find(q => !q.done && q.a.x === t.x && q.a.z === t.z); if (!b) return false;
    j.busy = true; sndThud(0.5); showMsg('🗑️ Tonne wird geleert …');
    const m = b.m; let k = 0; const tilt = setInterval(() => { k++; m.rotation.x = -Math.sin(Math.min(1, k / 10) * Math.PI) * 1.6; if (k >= 20) { clearInterval(tilt); m.rotation.x = 0; } }, 50);
    setTimeout(() => {
      if (JOBS.cur !== j) return;
      j.busy = false; b.done = true; j.emptied++;
      const pay = coinsR(40 * payMul('trash')); earn(pay); j.earned += pay; j.log.push([`Tonne ${j.emptied} · ${b.a.label}`, '+' + pay]);
      sndBeep(660, 0.08, 0.1, 'triangle');
      showMsg(j.emptied < j.bins.length ? `🗑️ Geleert +${pay} Coins · noch ${j.bins.length - j.emptied}` : '🗑️ Alle Tonnen leer – zurück zum Recyclinghof!');
      updateJobTarget();
    }, 1000);
    return true;
  }
  if (j.id === 'farm') {
    if (j.stage === 'collect' && onFoot() && !j.hand && t.label === 'Strohballen' && d < 2.4) {
      const b = j.bales.find(q => !q.got && q.x === t.x && q.z === t.z); if (!b) return false;
      b.got = true; scene.remove(b.m); b.m = null; j.hand = true; jobSay('🌾 Strohballen aufgehoben – ab in die Scheune!'); updateJobTarget(); return true;
    }
    if (onFoot() && j.hand && d < 4 && t.label.startsWith('Scheune')) { j.hand = false; stackBale(j); updateJobTarget(); return true; }
  }
  return false;
}
function stackBale(j) {
  const k = barnStack.length, x = 236 + (k % 4) * 1.5, y = 0.75 + Math.floor(k / 8) * 1.5, z = 211 + (Math.floor(k / 4) % 2) * 1.6;
  if (k < 24) barnStack.push(hayMesh(x, y, z));
  j.stacked++;
  const per = coinsR(55 * payMul('farm')); earn(per); sndBeep(660, 0.08, 0.1, 'triangle');
  j.log.push(['Strohballen ' + j.stacked, '+' + per]);
  if (j.stacked >= 6) {
    const bonus = coinsR((60 + Math.max(0, j.t) * 0.5) * payMul('farm'));
    finishJob([...j.log, ['Pünktlich-Bonus', '+' + bonus]], bonus, j.log.reduce((s, l) => s + parseInt(l[1]), 0) + bonus);
  } else showMsg(`🌾 Ballen ${j.stacked}/6 gestapelt  +${per} Coins`);
}
function pizzaDone(j) {
  const base = coinsR((80 + jdist(j.to, { x: window.PIZZA_PICKUP[0], z: window.PIZZA_PICKUP[1] }) * 0.8 + j.order.length * 25) * payMul('pizza'));
  const quick = Math.max(0, j.t / j.tMax);
  const score = j.temp * 0.45 + j.cond * 0.35 + quick * 100 * 0.2;
  const st = Math.max(1, Math.min(5, Math.round(score / 20)));
  const tip = coinsR(base * [0, 0, 0.05, 0.12, 0.2, 0.3][st]);
  const say = st >= 5 ? 'Wow, superschnell und noch heiß – danke!' : st >= 4 ? 'Danke, sieht lecker aus!' : st >= 3 ? 'Na ja, geht so.' : 'Die ist ja kalt und zerdrückt …';
  jobSay(`🧑 „${say}“`);
  finishJob([[j.order.join(' + '), base], ['Wärme ' + Math.round(j.temp) + ' % · Zustand ' + Math.round(j.cond) + ' %', ''], ['Bewertung', stars(st)], ['Trinkgeld', '+' + tip]], base + tip);
}
function parcelDone(j, a) {
  const prev = j.idx ? j.list[j.idx - 1] : { x: window.POST_PICKUP[0], z: window.POST_PICKUP[1] };
  let pay = coinsR((45 + jdist(a, prev) * 0.55) * payMul('post'));
  if (a.fragile && j.cond < 70) { pay = coinsR(pay * 0.5); jobSay('🧑 „Oh nein, da hat was geklirrt …“ – halber Lohn'); }
  else jobSay(a.neighbor ? '🧑 „Klar, ich geb\'s weiter!“' : '🧑 „Danke, hier ist meine Unterschrift.“');
  earn(pay); j.earned += pay; j.log.push([`Paket ${j.idx + 1}${a.fragile ? ' (zerbrechlich)' : ''} → ${a.label}`, '+' + pay]);
  j.cond = Math.min(100, j.cond + 15);
  j.idx++;
  if (j.idx >= j.list.length) {
    const bonus = coinsR((50 + Math.max(0, j.t) * 0.4) * payMul('post'));
    finishJob([...j.log, ['Tour-Bonus', '+' + bonus]], bonus, j.earned + bonus);
  } else { showMsg(`📦 Zugestellt  +${pay} Coins · noch ${j.list.length - j.idx}`); updateJobTarget(); }
}

/* ---------- jede Bildwiederholung ---------- */
let lastSpeed = 0, lastLand = 0;
function updateJobs(dt) {
  for (const n of NPCS) updateNPC(n, dt);
  if (!WELT || !running) return;
  const tnow = performance.now() / 1000;
  // Firmen in der Nähe
  JOBS.near = null;
  for (const mk of JOBS.markers) {
    mk.ring.scale.setScalar(1 + Math.sin(tnow * 3) * 0.06); mk.sign.lookAt(camera.position.x, mk.sign.position.y, camera.position.z);
    if (me.alive && Math.hypot(mk.c.x - me.pos.x, mk.c.z - me.pos.z) < (ride.v >= 0 ? 5 : 3.2)) JOBS.near = mk.c;
  }
  const key = TOUCH ? 'EINSTEIGEN' : (typeof PCFG !== 'undefined' && document.body.classList.contains('hasPad') ? btnLabel(PCFG.map.ride) : 'E');
  const j = JOBS.cur;
  // Hinweise unten
  let hint = '';
  if (JOBS.offer) {
    JOBS.offer.t -= dt;
    if (JOBS.offer.t <= 0) { JOBS.offer = null; JOBS.chain = 0; }
    else hint = `📱 Neuer Auftrag von <b>${JOB_INFO[JOBS.offer.c.id].name}</b>! Serienbonus +${Math.min(50, JOBS.chain * 10)}% · <b>${key}</b> = annehmen (${Math.ceil(JOBS.offer.t)} s)`;
  } else if (JOBS.near && !j) {
    const i = JOB_INFO[JOBS.near.id], lv = jobLevel(JOBS.near.id);
    hint = `${i.icon} <b>${i.name}</b> sucht: ${i.title} · ${i.pay} Coins · deine Stufe: ${RANKS[lv]}<br><b>${key}</b> = Job annehmen`;
  }
  if (j && !j.busy) {
    const t = currentTarget();
    if (t) {
      const d = Math.hypot(t.x - me.pos.x, t.z - me.pos.z);
      if (j.id === 'pizza' && j.stage === 'pickup' && d < 2.4) hint = `<b>${key}</b> = Pizza abholen`;
      else if (j.id === 'post' && j.stage === 'load' && d < 2.4) hint = `<b>${key}</b> = Pakete einladen`;
      else if ((j.id === 'pizza' || j.id === 'post') && j.stage === 'deliver' && d < 6) hint = onFoot() ? (d < 2.4 ? `<b>${key}</b> = klingeln & übergeben` : 'Geh zur Haustür') : `<b>${key}</b> = absteigen, dann zur Tür gehen`;
      else if (j.id === 'farm' && onFoot() && !j.hand && t.label === 'Strohballen' && d < 2.4) hint = `<b>${key}</b> = Strohballen aufheben`;
      else if (j.id === 'farm' && onFoot() && j.hand && d < 4) hint = `<b>${key}</b> = Ballen abstellen`;
      else if (j.id === 'fire' && d < 15) hint = onFoot() ? (d < 12 ? `🧯 <b>Linksklick halten</b> und aufs Feuer zielen = löschen · ${Math.round(j.prog / FIRE_TIME * 100)} %` : 'Näher ran ans Feuer!') : `<b>${kbK('ride')}</b> = aussteigen und löschen!`;
      else if (j.id === 'trash' && t.door && d < 2.6) hint = onFoot() ? `<b>${key}</b> = Tonne leeren` : `<b>${kbK('ride')}</b> = aussteigen, dann Tonne leeren`;
    }
  }
  if (hint) { jobHint.innerHTML = hint; jobHint.classList.remove('hidden'); } else jobHint.classList.add('hidden');
  // Ware in der Hand
  const item = me.alive && onFoot() ? carryItem() : null;
  for (const k in CARRY) CARRY[k].visible = k === item;
  if (item) { viewGun.visible = false; CARRY[item].position.y = -0.42 + Math.sin(me.bob * 2) * 0.01; }
  if (!j) { jobHud.classList.add('hidden'); return; }
  if (!me.alive) return cancelJob('❌ Auftrag verloren – du wurdest ausgeschaltet');
  // Fahrstil: harte Landungen und Unfälle
  const sp = ride.v >= 0 ? Math.abs(ride.speed) : 0;
  let hit = 0;
  if (ride.v >= 0) {
    if ((ride.land || 0) > 0.3 && (ride.land || 0) > lastLand + 0.2) hit = 1;
    if (lastSpeed - sp > 5.5 && ride.blocked) hit = 2;
  }
  lastSpeed = sp; lastLand = ride.land || 0;
  if (hit) {
    j.cond = Math.max(0, j.cond - (hit === 2 ? 18 : 12));
    if (j.id === 'taxi' && j.stage === 'ride') { j.stars = Math.max(1, j.stars - (hit === 2 ? 1 : 0.75)); jobSay(hit === 2 ? '😠 Fahrgast: „Hey! Passen Sie doch auf!“' : '😨 Fahrgast: „Uaah – nicht so wild!“'); }
    else if (j.id === 'pizza' && j.stage === 'deliver') showMsg('🍕 Autsch – die Pizza ist verrutscht!');
    else if (j.id === 'post' && j.stage === 'deliver') showMsg('📦 Die Pakete sind durchgerüttelt worden!');
  }
  // Zeit / Wärme
  j.t -= dt;
  if (j.id === 'pizza' && j.stage === 'deliver') j.temp = Math.max(0, j.temp - dt * (100 / (j.tMax * 1.25)));
  if (j.t <= 0) {
    if (j.id === 'taxi' && j.stage === 'ride') { j.stars = Math.max(1, j.stars - dt * 0.2); j.t = 0; }   // Taxi: zu spät = schlechtere Bewertung
    else return cancelJob(j.id === 'pizza' && j.stage === 'deliver' ? '⏱ Zu spät – der Kunde hat die Pizza storniert' : j.id === 'fire' ? '🔥 Zu spät – das Haus ist abgebrannt' : '⏱ Zeit abgelaufen – Auftrag nicht geschafft');
  }
  // Taxi-Ablauf
  if (j.id === 'taxi') {
    if (j.stage === 'car' && inCar()) startTaxiPickup(j), updateJobTarget();
    else if (j.stage === 'pickup') {
      const d = Math.hypot(j.from.x - me.pos.x, j.from.z - me.pos.z);
      if (d < 22) npcLook(passenger, me.pos.x, me.pos.z);
      if (!inCar() && d < 10) showMsg('🚕 Der Fahrgast steigt nur in ein Auto ein!');
      if (inCar() && d < 9 && sp < 1.5 && !j.busy) {
        j.busy = true; passenger.mode = 'idle';
        npcWalk(passenger, ride.pos.x, ride.pos.z, () => {
          passenger.g.visible = false; j.busy = false;
          j.to = pickAddr(j.from, 150, 420, null, j.from);
          j.stage = 'ride'; j.meterM = 0; j.meterT = 0; j.stars = 5; j.speedT = 0; j.lastPos = ride.pos.clone();
          j.t = jdist(j.to, j.from) / (j.persona.id === 'eilig' ? 11 : 8) + 40; j.tMax = j.t;
          jobSay(`${j.persona.icon} „${j.persona.text}“ – Ziel: ${j.to.label}`); updateJobTarget();
        });
      }
    } else if (j.stage === 'ride') {
      if (!inCar()) { cancelJob('🚕 Du bist ausgestiegen – der Fahrgast ist sauer gegangen'); return; }
      j.meterM += ride.pos.distanceTo(j.lastPos); j.lastPos.copy(ride.pos); j.meterT += dt;
      if (j.persona.id === 'angst' && sp * 3.6 > 65) { j.speedT += dt; if (j.speedT > 4) { j.speedT = 0; j.stars = Math.max(1, j.stars - 0.5); jobSay('😰 „Zu schnell! Bitte langsamer!“'); } }
      const d = Math.hypot(j.to.x - me.pos.x, j.to.z - me.pos.z);
      if (d < 9 && sp < 1.5 && !j.busy) {
        j.busy = true;
        const fare = coinsR((30 + j.meterM * 0.42 + j.meterT * 0.35) * payMul('taxi'));
        let st = j.stars; if (j.persona.id === 'eilig') st += j.t > 0 ? 0.5 : -1;
        st = Math.max(1, Math.min(5, st));
        const tip = coinsR(fare * [0, 0, 0, 0.05, 0.12, 0.22][Math.round(st)]);
        npcShow(passenger, ride.pos.x + Math.sin(ride.yaw) * 1.8, ride.pos.z + Math.cos(ride.yaw) * 1.8, j.to.door.x, j.to.door.z);
        npcWalk(passenger, j.to.door.x, j.to.door.z, () => { passenger.g.visible = false; });
        jobSay(st >= 4 ? '🙂 „Danke für die angenehme Fahrt!“' : st >= 3 ? '😐 „Danke.“' : '😠 „Nie wieder mit Ihnen!“');
        finishJob([[`Taxameter (${(j.meterM / 1000).toFixed(1)} km · ${Math.floor(j.meterT / 60)}:${String(Math.floor(j.meterT % 60)).padStart(2, '0')} min)`, fare], ['Bewertung', stars(st)], ['Trinkgeld', '+' + tip]], fare + tip);
        return;
      }
    }
  }
  // Feuerwehr: Flammen + Rauchsäule am Haus; zu Fuß mit Linksklick aufs Feuer halten = löschen
  if (j.id === 'fire') {
    const fp = j.to.door, gy = hillH(fp.x, fp.z), inten = Math.max(0, 1 - j.prog / FIRE_TIME), dCam = Math.hypot(fp.x - camera.position.x, fp.z - camera.position.z);
    j.fx -= dt;
    if (j.fx <= 0 && dCam < 260) {
      j.fx = 0.07;
      const base = new THREE.Vector3(fp.x + rnd(-2.5, 2.5), gy + rnd(0.5, 3.5), fp.z + rnd(-1.5, 1.5));
      if (inten > 0.05) puff(base, [0xff7a1a, 0xffb02a, 0xff4a10][Math.floor(Math.random() * 3)], 0.9 * inten + 0.25, 0.7, new THREE.Vector3(rnd(-0.3, 0.3), rnd(2, 3.5), rnd(-0.3, 0.3)), { opacity: 0.9, grow: 3 });
      puff(base.clone().add(new THREE.Vector3(0, 3, 0)), inten > 0.05 ? 0x2a2a2a : 0xa8a8a8, 1.2, 3.2, new THREE.Vector3(rnd(-0.5, 0.5), rnd(2.5, 4), rnd(-0.5, 0.5)), { opacity: 0.45 * Math.max(0.3, inten), grow: 5 });
    }
    const dFire = Math.hypot(fp.x - me.pos.x, fp.z - me.pos.z);
    if (onFoot() && dFire < 12 && me.trigger && me.alive && !j.busy) {
      camera.updateMatrixWorld();
      const o = camera.getWorldPosition(new THREE.Vector3()), f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      for (let k = 0; k < 2; k++) puff(o.clone().addScaledVector(f, 0.8).add(new THREE.Vector3(0, -0.25, 0)), 0xd8ecff, 0.18, 0.7, f.clone().multiplyScalar(rnd(13, 17)).add(new THREE.Vector3(rnd(-0.6, 0.6), rnd(0.5, 1.5), rnd(-0.6, 0.6))), { opacity: 0.7, grow: 4 });
      const toF = new THREE.Vector3(fp.x - o.x, gy + 1.8 - o.y, fp.z - o.z).normalize();
      if (f.dot(toF) > 0.82) { j.prog += dt; j.stage = 'extinguish'; }   // nur wer aufs Feuer zielt, löscht
      j.hiss = (j.hiss || 0) - dt; if (j.hiss <= 0) { j.hiss = 0.22; sndClick(0.04, 0.4); }
      if (j.prog >= FIRE_TIME) {
        j.busy = true;
        const base = coinsR((230 + jdist(j.to, j.c) * 0.6) * payMul('fire')), quick = coinsR(Math.max(0, j.t) * 2.2 * payMul('fire'));
        jobSay('🧑 „Danke! Sie haben unser Haus gerettet!“');
        finishJob([['Brand gelöscht · ' + j.to.label, base], ['Schnell vor Ort', '+' + quick]], base + quick);
        return;
      }
    }
  }
  // Stadtreinigung: alle Tonnen leer → am Recyclinghof abladen (zu Fuß oder mit Fahrzeug)
  if (j.id === 'trash' && j.emptied >= j.bins.length && Math.hypot(j.c.x - me.pos.x, j.c.z - me.pos.z) < 7 && (ride.v < 0 || Math.abs(ride.speed) < 3)) {
    for (const b of j.bins) if (b.m) { scene.remove(b.m); b.m = null; }
    const bonus = coinsR((60 + Math.max(0, j.t) * 0.5) * payMul('trash'));
    jobSay('🗑️ Herr Kraus: „Sauber gemacht, danke!“');
    finishJob([...j.log, ['Recyclinghof-Bonus', '+' + bonus]], bonus, j.earned + bonus);
    return;
  }
  // Hof: Ballen mit Fahrzeug einsammeln / in der Scheune abladen
  if (j.id === 'farm' && ride.v >= 0) {
    const cap = inCar() ? 3 : 1;
    for (const b of j.bales) if (!b.got && j.load.length < cap && Math.hypot(b.x - ride.pos.x, b.z - ride.pos.z) < (inCar() ? 4 : 2.6)) {
      b.got = true; scene.remove(b.m); b.m = null; j.load.push(b); jobSay(`🌾 Aufgeladen (${j.load.length}/${cap}${inCar() ? ' im Kofferraum' : ' auf dem Gepäckträger'})`); updateJobTarget();
    }
    if (j.load.length && Math.hypot(window.FARM_BARN[0] - ride.pos.x, window.FARM_BARN[1] - ride.pos.z) < 7 && sp < 3) {
      while (j.load.length && JOBS.cur === j) { j.load.pop(); stackBale(j); }
      if (JOBS.cur === j) updateJobTarget();
      if (JOBS.cur !== j) return;
    }
  }
  if (!JOBS.cur) return;
  // Ziel-Anzeige (nur 10× pro Sekunde neu schreiben)
  const tt = currentTarget();
  if (tt) {
    const dx = tt.x - me.pos.x, dz = tt.z - me.pos.z, d = Math.hypot(dx, dz);
    let rel = Math.atan2(-dx, -dz) - camera.rotation.y; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    $('jobArrow').style.transform = `rotate(${-rel * 180 / Math.PI}deg)`;
    beam.material.opacity = 0.2 + Math.sin(tnow * 4) * 0.08;
    JOBS.uiT -= dt;
    if (JOBS.uiT <= 0) {
      JOBS.uiT = 0.1;
      const mm = Math.floor(Math.max(0, j.t) / 60), ss = Math.floor(Math.max(0, j.t) % 60), time = `⏱ ${mm}:${String(ss).padStart(2, '0')}`;
      let task = '', info = '';
      if (j.id === 'pizza') { task = j.stage === 'pickup' ? 'Pizza an der Theke abholen' : `${j.order.join(' + ')} → ${tt.label}`; if (j.stage === 'deliver') info = `🌡 ${bar(j.temp, j.temp > 50 ? '#ff8a3d' : '#7fb3ff')} 📦 ${bar(j.cond, '#7dff8a')}`; }
      else if (j.id === 'post') { task = j.stage === 'load' ? 'Pakete am Schalter einladen' : `Paket ${j.idx + 1}/${j.list.length}${j.list[j.idx].fragile ? ' ⚠ zerbrechlich' : ''} → ${tt.label}`; if (j.stage === 'deliver') info = `📦 ${bar(j.cond, '#7dff8a')} · verdient ${j.earned}`; }
      else if (j.id === 'taxi') {
        task = j.stage === 'car' ? 'Steig in ein Auto' : j.stage === 'pickup' ? `Fahrgast abholen → ${j.from.label} (halten!)` : `${j.persona.icon} Fahrgast nach ${j.to.label} bringen`;
        if (j.stage === 'ride') info = `🚖 Taxameter <b>${coinsR((30 + j.meterM * 0.42 + j.meterT * 0.35) * payMul('taxi'))}</b> · ${stars(j.stars)}`;
      } else if (j.id === 'fire') { task = j.stage === 'drive' ? `🔥 Feuer in der ${j.to.label} – schnell hin!` : 'Feuer löschen!'; info = `🧯 ${bar(j.prog / FIRE_TIME * 100, '#5ab8ff')}`; }
      else if (j.id === 'trash') { task = `Tonnen ${j.emptied}/${j.bins.length} → ${tt.label}`; info = `verdient ${j.earned}`; }
      else if (j.id === 'farm') { task = tt.label === 'Strohballen' ? `Strohballen einsammeln (${j.stacked}/6 in der Scheune)` : `Zur Scheune bringen (${j.hand ? 1 : j.load.length} dabei)`; }
      $('jobText').innerHTML = `<div class="jTop">${j.info.icon} <b>${j.info.title}</b> · ${RANKS[jobLevel(j.id)]}${JOBS.chain ? ' · Serie ×' + (JOBS.chain + 1) : ''}</div>
        <div>${task}</div><div class="jInfo">${Math.round(d)} m · ${time}${info ? ' · ' + info : ''} · <span style="opacity:.65">${kbK('jobCancel')} = abbrechen</span></div>`;
    }
  }
  jobHud.classList.toggle('late', j.t < 20 && !(j.id === 'taxi' && j.stage === 'ride'));
  jobHud.classList.remove('hidden');
}
window.updateJobs = updateJobs;

/* ---------- Eingabe: E = annehmen / abholen / klingeln / aufladen, J = abbrechen ---------- */
const _jobToggleRide = toggleRide;
window.toggleRide = () => {
  if (WELT && running && me.alive) {
    if (JOBS.offer && !JOBS.cur) { const o = JOBS.offer; JOBS.offer = null; return acceptJob(o.c, true); }
    if (jobInteract()) return;
    if (JOBS.near && !JOBS.cur && (ride.v < 0 || Math.abs(ride.speed) < 3)) return acceptJob(JOBS.near);
    if (JOBS.near && JOBS.cur && ride.v < 0) { showMsg(`Du hast schon einen Auftrag · ${kbK('jobCancel')} = abbrechen`); return; }
  }
  return _jobToggleRide();
};
document.addEventListener('kzaction', e => { if (e.detail === 'jobCancel' && running && locked && (JOBS.cur || JOBS.offer)) { JOBS.offer = null; cancelJob('Auftrag abgebrochen'); } });
