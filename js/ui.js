'use strict';
/* ======================= HUD ======================= */
function updateSlots() {
  $('slots').innerHTML = WEAPONS.map((w, i) => {
    if (i >= BASE_WEAPONS && !me.owned[i]) return '';           // Ladenwaffen nur zeigen, wenn man sie hat
    const key = i >= BASE_WEAPONS ? 5 : i + 1;
    return `<span class="${i === me.weapon ? 'on' : (me.owned[i] ? '' : 'off')}">${key} ${w.short}</span>`;
  }).join('');
}
const pColor = p => p.team >= 0 ? TEAM_COLORS[p.team] : p.color;
function renderBoard() {
  const all = Object.values(world.players).sort((a, b) => b.k - a.k || a.d - b.d);
  const row = p => `<tr class="${p.id === myId ? 'me' : ''}"><td><span class="dot" style="background:${pColor(p)}"></span>${esc(p.name)}</td><td class="n">${p.k}</td><td class="n">${p.d}</td><td class="n">${p.d ? (p.k / p.d).toFixed(1) : p.k}</td></tr>`;
  if (world.mode === 'tdm') {
    let html = '';
    for (const t of [0, 1]) {
      const ps = all.filter(p => p.team === t), sc = ps.reduce((s, p) => s + p.k, 0);
      html += `<tr class="teamRow"><td colspan="4" style="color:${TEAM_COLORS[t]}">TEAM ${TEAM_NAMES[t]} · ${sc}</td></tr>` + ps.map(row).join('');
    }
    $('boardBody').innerHTML = html;
  } else $('boardBody').innerHTML = all.map(row).join('');
}
let hudT = 0;
// Anzeige nur ändern, wenn sich der Wert wirklich ändert (spart Rechenzeit)
const hudCache = {};
function hudSet(id, prop, val) {
  const key = id + prop;
  if (hudCache[key] === val) return;
  hudCache[key] = val;
  const el = $(id);
  if (prop === 'text') el.textContent = val; else if (prop === 'html') el.innerHTML = val; else el.style[prop] = val;
}
function updateHUD(dt) {
  const w = WEAPONS[me.weapon];
  const mine = world.players[myId];
  if (mine) me.hp = mine.hp;
  const hp = me.alive ? Math.max(0, Math.round(me.hp)) : 0;
  hudSet('hpText', 'text', String(hp));
  hudSet('hpFill', 'width', hp + '%');
  hudSet('hpFill', 'background', hp > 50 ? 'linear-gradient(90deg,#3ddc5a,#a8ff60)' : hp > 25 ? 'linear-gradient(90deg,#e6a020,#ffd040)' : 'linear-gradient(90deg,#d02020,#ff6040)');
  hudSet('lowHp', 'opacity', me.alive && hp < 35 ? String(0.25 + (35 - hp) / 60 + Math.sin(performance.now() / 180) * 0.08) : '0');
  hudSet('wName', 'text', w.name);
  hudSet('ammoText', 'html', `${me.ammo[me.weapon]} <small>/ ${w.mag}</small>`);
  hudSet('nadeHud', 'html', `<span class="nd">G</span> ${'●'.repeat(me.nades)}${'○'.repeat(MAX_NADES - me.nades)} &nbsp; <span class="nd">V</span> Messer`);
  hudSet('stance', 'text', !me.alive ? '' : me.slideT > 0 ? 'RUTSCHEN' : me.crouch ? 'GEDUCKT' : me.sneak ? 'SCHLEICHEN (lautlos)' : me.sprinting ? 'SPRINT' : '');
  hudSet('reloadMsg', 'text', me.reloading > 0 ? 'Nachladen …' : (me.alive && me.ammo[me.weapon] === 0 ? 'R zum Nachladen' : ''));
  const scoped = me.alive && me.scoped && w.scope && camera.fov < 40;
  hudSet('scope', 'display', scoped ? 'block' : 'none');
  // Fadenkreuz-Größe je nach Streuung
  const moving = Math.hypot(me.vel.x, me.vel.z) > 1.5;
  let spr = w.spread + (moving ? w.move : 0) + (me.onGround ? 0 : 0.04) + (me.sprinting ? 0.03 : 0);
  if (me.crouch) spr *= 0.65; else if (me.sneak) spr *= 0.85;
  const gap = Math.round(4 + spr * (me.scoped ? 0.5 : 1) * 260 + me.kick * 6);
  const show = me.alive && !scoped && !(me.scoped && !w.scope && me.adsT > 0.8);
  const c = [['c1', -1, 0], ['c2', 1, 0], ['c3', 0, -1], ['c4', 0, 1]];
  for (const [id, x, y] of c) {
    hudSet(id, 'display', show ? 'block' : 'none');
    if (x) { hudSet(id, 'width', '10px'); hudSet(id, 'height', '2px'); hudSet(id, 'left', (x < 0 ? -gap - 10 : gap) + 'px'); hudSet(id, 'top', '-1px'); }
    else { hudSet(id, 'width', '2px'); hudSet(id, 'height', '10px'); hudSet(id, 'top', (y < 0 ? -gap - 10 : gap) + 'px'); hudSet(id, 'left', '-1px'); }
  }
  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.25;
    const ps = Object.values(world.players);
    $('pCount').textContent = ps.filter(p => !p.bot).length;
    if (world.mode === 'tdm') {
      const s = [0, 1].map(t => ps.filter(p => p.team === t).reduce((a, p) => a + p.k, 0));
      const myT = mine ? mine.team : 0;
      $('topScore').innerHTML = `<b style="color:${TEAM_COLORS[0]}">ROT ${s[0]}</b> : <b style="color:${TEAM_COLORS[1]}">${s[1]} BLAU</b> <small>(bis ${TEAM_LIMIT}) · Dein Team: ${TEAM_NAMES[myT]}</small>`;
    } else {
      const lead = ps.slice().sort((a, b) => b.k - a.k)[0];
      $('topScore').textContent = lead ? `Führung: ${lead.name} (${lead.k}/${KILL_LIMIT})  ·  Du: ${mine ? mine.k : 0}` : '';
    }
    const tl = world.timeLeft;
    $('timer').textContent = tl === undefined ? '' : `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
    $('timer').classList.toggle('urgent', tl !== undefined && tl <= 30);
    if (!$('board').classList.contains('hidden')) renderBoard();
  }
  drawRadar(dt);
  // Handy: Fahrzeug-Knöpfe ein-/ausblenden (nur bei Wechsel)
  const vk = ride.v >= 0 ? ride.kind : '';
  { const aimV = ride.v >= 0 && riderAiming(); if (document.body.classList.contains('vAim') !== aimV) document.body.classList.toggle('vAim', aimV); }   // schießt gerade aus dem Fahrzeug
  if (document.body.dataset.vk !== vk) {
    document.body.dataset.vk = vk; const cl = document.body.classList;
    cl.toggle('inVeh', !!vk); cl.toggle('vCar', vk === 'car'); cl.toggle('vHeli', vk === 'heli' || vk === 'plane'); cl.toggle('vTank', vk === 'tank');
    const lbl = { car: 'HAND-<br>BREMSE', moped: 'WHEELIE', heli: '▲<br><small>HOCH</small>', plane: '▲<br><small>ZIEHEN</small>' }[vk]; if (lbl) $('tbVh').innerHTML = lbl;
    const rb = document.querySelector('.tb[data-t=ride]'); if (rb) rb.innerHTML = vk ? 'AUS-<br>STEIGEN' : 'EIN-<br>STEIGEN';
    if (!vk) for (const k of ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'Handbrake', 'KeyC']) if (TOUCH) keys[k] = false;
  }
  // Moped: Hinweis zum Aufsteigen bzw. Tacho
  const near = me.alive && ride.v < 0 ? nearestFreeVehicle() : -1, gshop = ride.v < 0 ? nearGunShop() : null;
  if (gshop) { hudSet('rideHint', 'html', gshop.boerse ? boHint() : gunshopHint(gshop)); hudSet('rideHint', 'display', 'block'); hudSet('speedo', 'display', 'none'); return; }
  if (GS.aim) { GS.aim.scale.setScalar(GS.aim.userData.s0); GS.aim = null; }   // Laden verlassen: Hervorhebung weg
  if (ride.v >= 0 && (ride.kind === 'tank' || ride.kind === 'heli' || ride.kind === 'plane')) {
    const nowS = performance.now() / 1000;
    if (ride.kind === 'tank') {
      const rl = Math.max(0, TANK_RELOAD - (nowS - (ride.tankShot || -9)));
      hudSet('rideHint', 'html', `🛡️ <b>Panzer</b> · Maus = Turm · <b>Linksklick</b> = Kanone ${rl > 0 ? `<span style="color:#ff9a3a">(lädt … ${rl.toFixed(1)} s)</span>` : '<span style="color:#7dff7a">(BEREIT)</span>'} · <b>${kbK('forward')}/${kbK('back')}</b> fahren · <b>${kbK('left')}/${kbK('right')}</b> drehen · <b>${kbK('ride')}</b> aussteigen`);
    } else hudSet('rideHint', 'html', ride.kind === 'plane' ? planeHint() : heliHint());
    hudSet('rideHint', 'display', 'block'); hudSet('speedo', 'display', 'block');
    hudSet('speedo', 'html', ride.kind === 'plane' ? `${Math.round((ride.planeV || 0) * 3.6)}<small>km/h · ${Math.max(0, Math.round(ride.pos.y - groundH(ride.pos.x, ride.pos.z, ride.pos.y)))} m Höhe</small>` : ride.kind === 'heli' ? `${Math.round(Math.hypot(ride.vel.x, ride.vel.z) * 3.6)}<small>km/h · ${Math.round(ride.pos.y)} m</small>` : `${Math.round(Math.abs(ride.speed) * 3.6)}<small>km/h</small>`);
    return;
  }
  hudSet('rideHint', 'html', ride.v >= 0 ? (ride.kind === 'car' ? (TOUCH ? `<b>AUSSTEIGEN</b> oben rechts` : `<b>${kbK('ride')}</b> aussteigen · <b>${kbK('gas')}</b> Gas · <b>${kbK('back')}</b> Bremse/rückwärts · <b>${kbK('left')}/${kbK('right')}</b> lenken · <b>${kbK('handbrake')}</b> Handbremse`) : TOUCH ? `<b>AUSSTEIGEN</b> oben rechts · <b>SPRUNG</b> Wheelie` : `<b>${kbK('ride')}</b> absteigen · <b>${kbK('gas')}</b> Gas · <b>${kbK('back')}</b> Bremse · <b>${kbK('left')}/${kbK('right')}</b> lenken · <b>${kbK('jump')}</b> Wheelie`)
    : near >= 0 ? `<b>${TOUCH ? 'EINSTEIGEN' : 'E'}</b> – ${({ car: 'ins Auto einsteigen', tank: 'in den Panzer steigen', heli: 'in den Helikopter steigen', plane: 'ins Flugzeug steigen' })[vehicles[near].kind] || 'auf das Moped steigen'}` : '');
  hudSet('rideHint', 'display', ride.v >= 0 || near >= 0 ? 'block' : 'none');
  hudSet('speedo', 'display', ride.v >= 0 ? 'block' : 'none');
  if (ride.v >= 0) {
    const nit = ride.kind === 'car' && tuneOf(ride.ctype).nitro ? (ride.nitroT > 0 ? ' <small style="color:#4aa8ff">🔥 NITRO!</small>' : ride.nitroCd > 0 ? ` <small style="opacity:.6">🔥 ${Math.ceil(ride.nitroCd)} s</small>` : ` <small style="color:#7dff7a">🔥 ${TOUCH ? 'bereit' : kbK('nitro')}</small>`) : '';
    hudSet('speedo', 'html', `${Math.round(Math.abs(ride.speed) * 3.6)}<small>km/h</small>${nit}`);
  }
}

/* ---------- Radar (Minikarte): Teamkameraden immer, Gegner nur wenn sie schießen ---------- */
const RADAR = MAP_ID === 'hafen' ? { img: null, x0: -62, z0: -62, w: 118, h: 194, ppm: 4, t: 0 } : MAP_ID === 'welt' ? { img: null, x0: -444, z0: -444, w: 1548, h: 888, ppm: TOUCH ? 1 : 2, t: 0 }
  : { img: null, x0: -102, z0: -102, w: 204, h: 204, ppm: 3, t: 0 };
(function buildRadarMap() {
  const c = document.createElement('canvas'); c.width = RADAR.w * RADAR.ppm; c.height = RADAR.h * RADAR.ppm;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(40,46,40,0.9)'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(78,82,78,0.95)';   // Straßen
  for (const [x0, z0, x1, z1] of window.MAP_STREETS || []) g.fillRect((x0 - RADAR.x0) * RADAR.ppm, (z0 - RADAR.z0) * RADAR.ppm, (x1 - x0) * RADAR.ppm, (z1 - z0) * RADAR.ppm);
  const seaX = MAP_ID === 'hafen' ? 55.5 : MAP_ID === 'welt' ? 9999 : 101;
  g.fillStyle = 'rgba(30,70,95,0.95)'; g.fillRect((seaX - RADAR.x0) * RADAR.ppm, 0, c.width, c.height);
  if (MAP_ID === 'hafen') { g.fillStyle = 'rgba(92,72,48,0.95)'; g.fillRect(0, (62 - RADAR.z0) * RADAR.ppm, (54 - RADAR.x0) * RADAR.ppm, 69 * RADAR.ppm); }   // Crosspark (Erde)
  if (typeof HILLS !== 'undefined') for (const H of HILLS) {   // Hügel/Berg: je höher, desto dunkler
    for (let x = H.x0; x < H.x1; x += 4) for (let z = H.z0; z < H.z1; z += 4) {
      const h = hillH(x + 2, z + 2); if (h < 1.5) continue;
      g.fillStyle = `rgba(40,70,35,${Math.min(0.65, h / 40).toFixed(2)})`; g.fillRect((x - RADAR.x0) * RADAR.ppm, (z - RADAR.z0) * RADAR.ppm, 4 * RADAR.ppm, 4 * RADAR.ppm);
    }
  }
  for (const T of window.DRIFT_TRACKS || []) {   // Drift-Strecken als Linie
    g.strokeStyle = 'rgba(70,70,74,0.95)'; g.lineWidth = T.W * RADAR.ppm; g.lineJoin = 'round'; g.beginPath();
    for (const [x, z] of T.pts) g.lineTo((x - RADAR.x0) * RADAR.ppm, (z - RADAR.z0) * RADAR.ppm);
    g.closePath(); g.stroke();
  }
  g.fillStyle = 'rgba(205,150,80,0.9)';   // Schanzen
  for (const r of RAMPS) g.fillRect((r.bx0 - RADAR.x0) * RADAR.ppm, (r.bz0 - RADAR.z0) * RADAR.ppm, (r.bx1 - r.bx0) * RADAR.ppm, (r.bz1 - r.bz0) * RADAR.ppm);
  const sorted = boxes.slice().sort((a, b) => a.max.y - b.max.y);
  for (const b of sorted) {
    if (b.max.y < 0.5 || b.max.x - b.min.x > 100 && b.max.y > 10) continue;
    const l = Math.min(1, b.max.y / 10);
    g.fillStyle = `rgb(${120 + l * 90 | 0},${125 + l * 90 | 0},${118 + l * 80 | 0})`;
    g.fillRect((b.min.x - RADAR.x0) * RADAR.ppm, (b.min.z - RADAR.z0) * RADAR.ppm, Math.max(1, (b.max.x - b.min.x) * RADAR.ppm), Math.max(1, (b.max.z - b.min.z) * RADAR.ppm));
  }
  RADAR.img = c;
})();
function drawRadar(dt) {
  RADAR.t -= dt; if (RADAR.t > 0) return; RADAR.t = 0.08;
  const cv = $('radar'), g = cv.getContext('2d'), S = cv.width, R = S / 2, scale = S / 70;   // 70 m Durchmesser
  g.clearRect(0, 0, S, S);
  g.save(); g.beginPath(); g.arc(R, R, R - 1, 0, 7); g.clip();
  g.fillStyle = 'rgba(10,14,12,0.75)'; g.fillRect(0, 0, S, S);
  g.translate(R, R); g.rotate(me.yaw); g.scale(scale / RADAR.ppm, scale / RADAR.ppm);
  g.drawImage(RADAR.img, -(me.pos.x - RADAR.x0) * RADAR.ppm, -(me.pos.z - RADAR.z0) * RADAR.ppm);
  g.restore();
  // Spieler-Punkte
  const now = performance.now(), mine = world.players[myId];
  const toR = (x, z) => {
    const dx = x - me.pos.x, dz = z - me.pos.z, c = Math.cos(me.yaw), s = Math.sin(me.yaw);
    return [R + (dx * c - dz * s) * scale, R + (dx * s + dz * c) * scale];
  };
  for (const id in world.players) {
    if (id === myId) continue;
    const p = world.players[id]; if (!p.alive) continue;
    const mate = world.mode === 'tdm' && mine && p.team === mine.team;
    const shooting = now - (radarPing[id] || -1e9) < 2000;
    if (!mate && !shooting) continue;
    let [x, y] = toR(p.x, p.z);
    const d = Math.hypot(x - R, y - R); if (d > R - 5) { x = R + (x - R) / d * (R - 5); y = R + (y - R) / d * (R - 5); }
    g.fillStyle = mate ? '#4aa3ff' : '#ff3b30'; g.beginPath(); g.arc(x, y, mate ? 3.5 : 4, 0, 7); g.fill();
  }
  // Waffen am Boden (kleine gelbe Punkte)
  for (let i = 0; i < PICKUPS.length; i++) if (pickActive[i]) {
    const [x, y] = toR(PICKUPS[i].x, PICKUPS[i].z);
    if (Math.hypot(x - R, y - R) < R - 4) { g.fillStyle = 'rgba(255,210,80,.8)'; g.fillRect(x - 1.5, y - 1.5, 3, 3); }
  }
  // Firmen mit Jobs (gelb) und aktuelles Job-Ziel (blau, am Rand wenn weiter weg)
  for (const T of window.DRIFT_TRACKS || []) { const [x, y] = toR(...T.start); if (Math.hypot(x - R, y - R) < R - 6) { g.font = '12px sans-serif'; g.textAlign = 'center'; g.fillText('🏁', x, y + 4); } }
  for (const s of window.MAP_POIS || []) { const [x, y] = toR(s.x, s.z); if (Math.hypot(x - R, y - R) < R - 6) { g.font = '13px sans-serif'; g.textAlign = 'center'; g.fillText(s.t, x, y + 4); } }
  for (const s of window.GUN_SHOPS || []) { const [x, y] = toR(s.x, s.z); if (Math.hypot(x - R, y - R) < R - 6) { g.font = '12px sans-serif'; g.textAlign = 'center'; g.fillText('🔫', x, y + 4); } }
  for (const c of window.MAP_JOBS || []) { const [x, y] = toR(c.x, c.z); if (Math.hypot(x - R, y - R) < R - 6) { g.fillStyle = '#ffcc33'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.fillText('$', x, y + 4); } }
  if (window.JOB_TGT) {
    let [x, y] = toR(window.JOB_TGT.x, window.JOB_TGT.z); const d = Math.hypot(x - R, y - R); if (d > R - 7) { x = R + (x - R) / d * (R - 7); y = R + (y - R) / d * (R - 7); }
    g.fillStyle = '#37c8ff'; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fill();
  }
  // Eigener Pfeil + Sichtkegel
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(R, R); g.arc(R, R, R, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); g.fill();
  g.fillStyle = '#ffcc33'; g.beginPath(); g.moveTo(R, R - 7); g.lineTo(R - 5, R + 5); g.lineTo(R, R + 2); g.lineTo(R + 5, R + 5); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(R, R, R - 1, 0, 7); g.stroke();
}

/* ---------- Trefferrichtung, Killserien, Endbildschirm, Inventar ---------- */
function showDamageDir(ax, az) {
  const dx = ax - me.pos.x, dz = az - me.pos.z;
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
  const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz) * 180 / Math.PI;
  const el = document.createElement('div'); el.className = 'dmgArc'; el.style.transform = `rotate(${ang}deg)`;
  $('dmgDir').appendChild(el);
  setTimeout(() => el.classList.add('fade'), 50); setTimeout(() => el.remove(), 1300);
}
function showStreak(text, sub) {
  const el = $('streakMsg'); el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
function showEndScreen(m) {
  $('endName').textContent = '🏆 ' + m.name;
  $('endTop').innerHTML = (m.top || []).map((p, i) => `<div><b>${i + 1}.</b> ${esc(p.n)} <span>${p.k} Elim. · ${p.d} Tode</span></div>`).join('');
  $('endScreen').classList.remove('hidden');
}
function renderInventory() {
  const bar = (label, v) => `<div class="stat"><span>${label}</span><em><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></em></div>`;
  let html = '';
  WEAPONS.forEach((w, i) => {
    const inGame = running && me.owned[i], bought = i >= BASE_WEAPONS && shopState.bought.includes(i);
    const where = i < BASE_WEAPONS ? (i === START_WEAPON ? 'Startwaffe' : 'Auf der Karte finden') : bought ? (shopState.equip === i ? 'Gekauft · ausgerüstet' : 'Gekauft') : `Im Laden: ${fmt(w.price)} Coins`;
    const key = i < BASE_WEAPONS ? i + 1 : 5;
    html += `<div class="invItem ${inGame ? 'have' : ''} ${running && me.weapon === i ? 'cur' : ''}" data-w="${i}">
      <div class="invKey">${key}</div><div class="info"><div class="nm">${w.name} ${inGame ? '<span class="tag">dabei</span>' : ''}</div>
      <div class="ds">${where}${inGame ? ` · Munition ${me.ammo[i]}/${w.mag}` : ''}</div>
      ${bar('Schaden', w.dmg * w.pellets / 60)}${bar('Feuerrate', 0.065 / w.rate)}${bar('Magazin', w.mag / 80)}</div></div>`;
  });
  html += `<div class="invItem have"><div class="invKey">G</div><div class="info"><div class="nm">Splittergranate</div><div class="ds">${running ? me.nades : MAX_NADES} von ${MAX_NADES} · explodiert nach 2,4 s, Schaden im Umkreis von 7 m</div></div></div>`;
  html += `<div class="invItem have"><div class="invKey">V</div><div class="info"><div class="nm">Kampfmesser</div><div class="ds">Immer dabei · 60 Schaden, Kopf 100</div></div></div>`;
  $('invList').innerHTML = html;
}
function toggleInventory(force) {
  const el = $('inv'), show = force !== undefined ? force : el.classList.contains('hidden');
  if (show) renderInventory();
  el.classList.toggle('hidden', !show);
}
$('invList').addEventListener('click', e => {
  const it = e.target.closest('[data-w]'); if (!it || !running) return;
  const i = +it.dataset.w; if (me.owned[i]) { switchWeapon(i); renderInventory(); }
});
$('invClose').onclick = () => toggleInventory(false);
$('btnInv1').onclick = () => toggleInventory(true); $('btnInv2').onclick = () => toggleInventory(true);
$('btnSet1').onclick = () => $('settings').classList.remove('hidden'); $('btnSet2').onclick = () => $('settings').classList.remove('hidden');
$('setClose').onclick = () => $('settings').classList.add('hidden');

/* ======================= Atmosphäre: Sonnenblendung, Staub, Feuer ======================= */
const glare = sprite(GLOW_TEX, 0xfff0d0, 140, true, 0.55); glare.material.fog = false; scene.add(glare);
const dust = (() => {
  const N = 260, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = rnd(-15, 15); pos[i * 3 + 1] = rnd(0, 8); pos[i * 3 + 2] = rnd(-15, 15); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ map: GLOW_TEX, size: 0.06, transparent: true, opacity: 0.45, depthWrite: false, color: 0xfff3dd, blending: THREE.AdditiveBlending }));
  p.frustumCulled = false; scene.add(p); return p;
})();
let fireT = 0;
function updateAtmosphere(dt) {
  glare.position.copy(camera.position).addScaledVector(SUN_DIR, 450);
  // Staubteilchen schweben um die Kamera
  const a = dust.geometry.attributes.position, c = camera.position;
  for (let i = 0; i < a.count; i++) {
    let x = a.getX(i) + Math.sin(performance.now() / 3000 + i) * 0.003, y = a.getY(i) + 0.004 * Math.sin(i), z = a.getZ(i) + 0.002;
    if (x - c.x > 15) x -= 30; if (x - c.x < -15) x += 30; if (z - c.z > 15) z -= 30; if (z - c.z < -15) z += 30;
    if (y > c.y + 6) y -= 9; if (y < c.y - 3) y += 9;
    a.setXYZ(i, x, y, z);
  }
  a.needsUpdate = true;
  dust.visible = !gfxLow() && gfx !== 'clean';
  // Brennender Bus auf der Hauptstraße + Schornstein des Schiffs
  fireT -= dt;
  if (fireT <= 0) {
    fireT = 0.07;
    const [fx, fz] = window.FIRE_POS || [38, -1], [sx, sy, sz] = window.SHIP_SMOKE || [92, 16, 34];
    if (camera.position.distanceTo(new THREE.Vector3(fx, 2, fz)) < 90) {
      const f = sprite(FIRE_TEX, 0xffffff, rnd(0.8, 1.4), true); f.position.set(fx + rnd(-3, 3), 3.0, fz + rnd(-0.6, 0.6));
      addFx(f, rnd(0.4, 0.7), { vel: new THREE.Vector3(rnd(-0.2, 0.2), rnd(1.5, 2.5), rnd(-0.2, 0.2)), grow: 0.4, fadeIn: 0.08 });
      if (Math.random() < 0.6) puff(new THREE.Vector3(fx + rnd(-2.5, 2.5), 3.6, fz + rnd(-0.4, 0.4)), 0x2b2724, rnd(1, 1.8), rnd(3, 4.5),
        new THREE.Vector3(rnd(0.3, 0.8), rnd(1.8, 2.6), rnd(-0.2, 0.2)), { opacity: 0.55, grow: 0.45, fadeIn: 0.4 });
    }
    if (Math.random() < 0.35) puff(new THREE.Vector3(sx, sy, sz), 0x6b6b6b, rnd(2, 3), 6, new THREE.Vector3(rnd(0.8, 1.4), rnd(1.5, 2.2), 0), { opacity: 0.5, grow: 0.3, fadeIn: 0.5 });
  }
}

/* ======================= Hauptschleife ======================= */
const SHADOW = { t: 0 };
// FPS-Anzeige oben rechts (2× pro Sekunde aktualisiert; grün ≥ 55, gelb ≥ 30, rot darunter)
const FPS = { n: 0, t0: performance.now(), on: true };
try { FPS.on = localStorage.getItem('kz_fps') !== '0'; } catch (e) {}
const fpsLabel = () => { $('btnFps').textContent = '📊 FPS-Anzeige: ' + (FPS.on ? 'AN' : 'AUS'); $('fpsBox').classList.toggle('off', !FPS.on); };
$('btnFps').onclick = () => { FPS.on = !FPS.on; try { localStorage.setItem('kz_fps', FPS.on ? '1' : '0'); } catch (e) {} fpsLabel(); };
fpsLabel();
function fpsTick(t) {
  FPS.n++;
  if (t - FPS.t0 < 500) return;
  const fps = Math.round(FPS.n * 1000 / (t - FPS.t0)); FPS.n = 0; FPS.t0 = t;
  if (!FPS.on) return;
  const el = $('fpsBox'); el.textContent = fps + ' FPS';
  el.classList.toggle('mid', fps < 55 && fps >= 30); el.classList.toggle('bad', fps < 30);
}
let last = performance.now();
camera.position.set(0, 18, 34); camera.lookAt(0, 0, 0);
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  const now = t / 1000;
  if (window.pollGamepad) pollGamepad(dt);   // Controller (gamepad.js)
  if (window.cullChunks) cullChunks(dt);     // große Karte: ferne Stücke ausblenden
  if (running && myId) {
    updateLocal(dt, now);
    netTick(now);
    updateAvatars(dt);
    updatePickups(now);
    updateHUD(dt);
    if (window.updateJobs) updateJobs(dt);   // Jobs (jobs.js)
  } else if (!running) {
    // Kamerafahrt im Menü: langsamer Flug über das Hafenviertel
    const a = now * 0.05;
    const hf = MAP_ID === 'hafen', wl = MAP_ID === 'welt', cx = hf ? -3 : wl ? 120 : 0, R = hf ? 58 : wl ? 150 : 75;
    camera.position.set(cx + Math.sin(a) * R, (hf ? 24 : 32) + Math.sin(now * 0.13) * 5, Math.cos(a) * R);
    camera.lookAt(cx + Math.sin(a + 1.2) * 13, hf ? 3 : 6, Math.cos(a + 1.2) * 13);
  }
  updateEffects(dt);
  updateVehicles(dt);
  updateAtmosphere(dt);
  ambientTick(dt);   // Wind, Vögel, Stadtrauschen
  const sunMoved = followSun(camera.position.x, camera.position.z);
  // Grafik „Leistung“: Schatten nur ~10× pro Sekunde neu zeichnen (und sofort, wenn der Schattenbereich mitwandert)
  if (gfx === 'perf' || gfx === 'clean') { SHADOW.t -= dt; if (sunMoved || SHADOW.t <= 0) { renderer.shadowMap.needsUpdate = true; SHADOW.t = 0.1; } }
  if (window.waterNormal) { window.waterNormal.offset.x += dt * 0.004; window.waterNormal.offset.y += dt * 0.0025; }
  skyMesh.position.copy(camera.position);
  renderer.render(scene, camera);
  fpsTick(t);
}
requestAnimationFrame(frame);
