'use strict';
/* ======================= Netzwerk (PeerJS, Host = Server) ======================= */
let peer = null, hostConn = null;
const MATCH_MIN = 10, TEAM_LIMIT = 50;
const H = { players: {}, conns: {}, bots: [], ended: false, colorIdx: 0, mode: 'ffa', endAt: 0 };
const net = {
  send(m) { if (isHost) hostHandle(myId, m); else if (hostConn && hostConn.open) hostConn.send(m); },
};
function broadcast(m, except) {
  for (const id in H.conns) if (id !== except && H.conns[id].open) H.conns[id].send(m);
  if (except !== myId) clientHandle(m);
}
function sendTo(id, m) { if (id === myId) clientHandle(m); else if (H.conns[id] && H.conns[id].open) H.conns[id].send(m); }
const PEER_OPTS = { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } };
const TEAM_NAMES = ['ROT', 'BLAU'];

function randCode() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
function playerName() {
  const n = ($('nameIn').value.trim() || 'Spieler' + Math.floor(Math.random() * 900 + 100)).slice(0, 16);
  try { localStorage.setItem('kz_name', n); } catch (e) {}
  return n;
}
function menuMsg(t, ok) { $('menuMsg').style.color = ok ? '#9fe09f' : '#ff8a7a'; $('menuMsg').textContent = t; }

function hostGame(mode, bots, autoLock) {
  initAudio();
  if (typeof Peer === 'undefined') return menuMsg('Netzwerk-Bibliothek konnte nicht geladen werden (Internet?).');
  const name = playerName();
  roomCode = randCode();
  menuMsg('Raum wird erstellt …', true);
  H.mode = mode; world.mode = mode;
  peer = new Peer(PREFIX + roomCode, PEER_OPTS);
  peer.on('open', id => {
    isHost = true; myId = id;
    H.endAt = performance.now() + MATCH_MIN * 60000;
    peer.on('connection', c => {
      c.on('open', () => { H.conns[c.peer] = c; });
      c.on('data', m => hostHandle(c.peer, m));
      c.on('close', () => hostDrop(c.peer));
      c.on('error', () => hostDrop(c.peer));
    });
    hostHandle(myId, { t: 'join', name, b: BUILD });
    startGame();
    for (let i = 0; i < bots; i++) addBot();
    if (autoLock) lockPointer();
  });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { peer.destroy(); hostGame(mode, bots, autoLock); return; }
    if (!running) menuMsg('Fehler: ' + e.type); else feed('Netzwerkfehler: ' + e.type);
  });
}
$('btnHost').onclick = () => hostGame($('modeIn').value, +$('botsIn').value, false);
$('btnQuick').onclick = () => hostGame('ffa', 5, true);
$('btnJoin').onclick = () => {
  initAudio();
  if (typeof Peer === 'undefined') return menuMsg('Netzwerk-Bibliothek konnte nicht geladen werden (Internet?).');
  const code = $('codeIn').value.trim().toUpperCase();
  if (code.length !== 5) return menuMsg('Bitte den 5-stelligen Raum-Code eingeben.');
  const name = playerName();
  roomCode = code;
  menuMsg('Verbinde …', true);
  peer = new Peer(PEER_OPTS);
  peer.on('open', () => {
    hostConn = peer.connect(PREFIX + code, { reliable: true });
    const to = setTimeout(() => { if (!running) menuMsg('Keine Antwort vom Host. Code richtig? Läuft der Raum noch?'); }, 12000);
    hostConn.on('open', () => hostConn.send({ t: 'join', name, b: BUILD }));
    hostConn.on('data', m => { if (m.t === 'welcome') clearTimeout(to); clientHandle(m); });
    hostConn.on('close', () => hostLost());
  });
  peer.on('error', e => {
    if (e.type === 'peer-unavailable') menuMsg('Raum nicht gefunden. Code prüfen!');
    else if (!running) menuMsg('Fehler: ' + e.type);
  });
};
// Warnung bei verschiedenen Versionen: alle sollen neu laden
function versionWarn(text) {
  const bar = $('updateBar');
  bar.firstChild.textContent = `⚠ ${text} Alle Spieler bitte neu laden (F5), sonst klappen z. B. die Mopeds nicht. `;
  bar.classList.remove('hidden');
  feed(esc(text + ' Bitte alle neu laden (F5).'));
}
function showMapSwitch(id) { const el = $('menuMsg'); if (el) el.textContent = `Der Host spielt „${id === 'hafen' ? 'Hafenviertel' : 'Tokio'}“ – Karte wird geladen und du trittst automatisch bei …`; }
// Nach dem Kartenwechsel automatisch wieder beitreten
try {
  const c = sessionStorage.getItem('kz_autojoin');
  if (c) { sessionStorage.removeItem('kz_autojoin'); $('codeIn').value = c; setTimeout(() => $('btnJoin').click(), 400); }
} catch (e) {}
function hostLost() {
  if (!running) return;
  alert('Die Verbindung zum Host wurde getrennt.');
  location.reload();
}
$('btnLeave').onclick = () => { try { peer && peer.destroy(); } catch (e) {} location.hash = ''; location.reload(); };
$('btnCopy').onclick = () => {
  const base = location.href.split('#')[0];
  const txt = location.protocol === 'file:' ? `Kampfzone Raum-Code: ${roomCode}` : `${base}#${roomCode}`;
  try { navigator.clipboard.writeText(txt); $('btnCopy').textContent = 'Kopiert!'; } catch (e) { $('btnCopy').textContent = txt; }
  setTimeout(() => $('btnCopy').textContent = 'Einladungslink kopieren', 1800);
};

function startGame() {
  running = true;
  document.body.classList.add('playing');
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('roomCode').textContent = roomCode; $('pauseCode').textContent = roomCode;
  $('botCtl').classList.toggle('hidden', !isHost);
  $('pause').classList.remove('hidden');
  buildViewGun(me.weapon); updateSlots();
  if (isHost) world.players = H.players;
}

/* ---------- Host-Logik ---------- */
function enemiesOf(p) { return id => { const q = H.players[id]; return q && q !== p && (H.mode !== 'tdm' || q.team !== p.team); }; }
function pickSpawn(forP) {
  let best = null, bestD = -1;
  for (let i = 0; i < 7; i++) {
    const s = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    let dmin = 1e9;
    for (const id in H.players) {
      const p = H.players[id];
      if (!p.alive || p === forP) continue;
      if (forP && H.mode === 'tdm' && p.team === forP.team) continue;   // Teamkameraden stören nicht
      dmin = Math.min(dmin, Math.hypot(p.x - s[0], p.z - s[1]));
    }
    if (dmin > bestD) { bestD = dmin; best = s; }
  }
  return [best[0], 0, best[1]];
}
function nextTeam() {
  const n = [0, 0]; for (const id in H.players) if (H.players[id].team >= 0) n[H.players[id].team]++;
  return n[0] <= n[1] ? 0 : 1;
}
function hostHandle(from, m) {
  const P = H.players;
  if (m.t === 'join') {
    if (P[from]) return;
    const p = P[from] = { id: from, name: String(m.name || 'Spieler').slice(0, 16), color: COLORS[H.colorIdx++ % COLORS.length],
      team: H.mode === 'tdm' ? nextTeam() : -1, x: 0, y: 0, z: 0, ry: 0, rx: 0, hp: 100, alive: true, k: 0, d: 0, w: 3, f: 0,
      prot: performance.now() + 1500, lastHit: 0 };
    const sp = pickSpawn(p); p.x = sp[0]; p.y = sp[1]; p.z = sp[2];
    sendTo(from, { t: 'welcome', id: from, spawn: sp, code: roomCode, mode: H.mode, b: BUILD, map: MAP_ID });
    broadcast({ t: 'feed', msg: `${p.name} ist beigetreten` + (p.team >= 0 ? ` (Team ${TEAM_NAMES[p.team]})` : '') });
    // Unterschiedliche Spielversionen → Mopeds, Karte usw. passen nicht zusammen
    if (m.b !== BUILD) versionWarn(`${p.name} hat eine andere Spielversion!`);
  } else if (m.t === 's') {
    const p = P[from]; if (!p || !p.alive) return;
    p.x = m.p[0]; p.y = m.p[1]; p.z = m.p[2]; p.ry = m.r[0]; p.rx = m.r[1];
    if (m.w !== undefined) p.w = m.w;
    p.f = m.f || 0;
    if (m.ay !== undefined) p.ay = m.ay;
    // Fahrer schickt die Position seines Mopeds mit
    if (m.vs && vehicles[m.vs[0]] && vehicles[m.vs[0]].d === from) {
      const v = vehicles[m.vs[0]]; v.x = m.vs[1]; v.y = m.vs[2]; v.z = m.vs[3]; v.yaw = m.vs[4]; v.lean = m.vs[5]; v.wh = m.vs[6] || 0; v.st = m.vs[7] || 0;
    }
  } else if (m.t === 'enter') {
    const v = vehicles[m.v], p = P[from];
    if (!v || !p || !p.alive) return;
    if (v.dead) return sendTo(from, { t: 'enterFail', r: 'wreck' });
    if (v.d && v.d !== from) return sendTo(from, { t: 'enterFail', r: 'busy' });
    // Abstand: Host kennt die Position ~50 ms verzögert, darum auch die mitgeschickte Position gelten lassen (wenn plausibel)
    let dist = Math.hypot(p.x - v.x, p.z - v.z);
    if (m.p && Math.hypot(m.p[0] - p.x, m.p[2] - p.z) < 4) dist = Math.min(dist, Math.hypot(m.p[0] - v.x, m.p[2] - v.z));
    if (dist > (v.kind === 'tank' || v.kind === 'heli' || v.kind === 'plane' ? 5.2 : v.kind === 'car' ? 4.6 : 3.6)) return sendTo(from, { t: 'enterFail', r: 'far' });
    for (const o of vehicles) if (o.d === from) o.d = 0;
    v.d = from;
    sendTo(from, { t: 'entered', v: m.v });
  } else if (m.t === 'exit') {
    const v = vehicles[m.v];
    if (v && v.d === from) { v.d = 0; v.lean = 0; if (m.s) { v.x = m.s[0]; v.y = m.s[1]; v.z = m.s[2]; v.yaw = m.s[3]; } }
  } else if (m.t === 'shot' || m.t === 'nade' || m.t === 'rkt') {
    m.id = from;
    broadcast(m, from);
  } else if (m.t === 'pick') {
    const pk = PICKUPS[m.i], p = P[from];
    if (!pk || !pickActive[m.i] || !p || !p.alive || Math.hypot(p.x - pk.x, p.z - pk.z) > 3) return;
    pickActive[m.i] = false;
    sendTo(from, { t: 'got', w: pk.w });
    setTimeout(() => { pickActive[m.i] = true; }, PICKUP_RESPAWN * 1000);
  } else if (m.t === 'hit') {
    applyDamage(m.target, Math.min(250, +m.dmg || 0), from, m.w, m.head);
  } else if (m.t === 'boom') {
    // Explosion (Granate, Rakete, Granatwerfer): Schaden im Umkreis, Wände schützen
    const o = new THREE.Vector3(m.o[0], m.o[1] + 0.3, m.o[2]);
    const isBomb = m.w === BOMB_W;   // Fliegerbombe: größerer Radius, mehr Schaden
    const R = Math.min(isBomb ? 12 : 9, +m.r || 7), DM = Math.min(isBomb ? 200 : 160, +m.dmg || 130), wq = WEAPONS[m.w] && (WEAPONS[m.w].rocket || WEAPONS[m.w].gl) ? m.w : (m.w === TANK_W || m.w === HELI_W || m.w === PLANE_W || isBomb ? m.w : NADE_W);
    for (const id in P) {
      const q = P[id]; if (!q.alive) continue;
      const c = new THREE.Vector3(q.x, q.y + 1.0, q.z), d = o.distanceTo(c);
      if (d > R) continue;
      const dir = c.clone().sub(o).normalize(), h = rayMap(o, dir, d);
      if (h && h.dist < d - 0.3) continue;
      applyDamage(id, Math.round(DM * Math.pow(1 - d / R, 1.1)), from, wq, false);
    }
    // Raketen (Raketenwerfer, Panzer, Heli) sprengen Fahrzeuge: Panzer nach 3 Treffern, alles andere sofort
    if (wq === TANK_W || wq === HELI_W || wq === PLANE_W || isBomb || (WEAPONS[wq] && WEAPONS[wq].rocket)) for (const v of vehicles) {
      if (v.dead || v.d === from) continue;   // Wrack / eigenes Fahrzeug
      const Hh = VEH_HIT[v.kind] || VEH_HIT.car;
      if (o.distanceTo(new THREE.Vector3(v.x, v.y + Hh.h, v.z)) > Hh.r + (isBomb ? 5 : 2.6)) continue;
      if (isBomb) v.hits = (v.hits || 0) + 1;   // Bombe zählt doppelt (Panzer: 2 Bomben)
      const drv = v.d && P[v.d];
      if (drv && H.mode === 'tdm' && P[from] && P[from].team === drv.team) continue;   // Team: kein Eigenbeschuss
      v.hits = (v.hits || 0) + 1;
      if (v.hits < (VEH_HP[v.kind] || 1)) broadcast({ t: 'vhit', v: v.i, h: v.hits });
      else destroyVehicle(v, from, wq);
    }
  }
}
// Fahrzeug explodiert: Insassen sterben, Wrack brennt, nach 30 s neues Fahrzeug am Startplatz (Heli: an der Absturzstelle)
function destroyVehicle(v, by, w) {
  const drv = v.d;
  v.dead = performance.now(); v.hits = 0;
  if (v.kind === 'heli' || v.kind === 'plane') v.y = groundH(v.x, v.z, v.y);   // Wrack stürzt ab
  broadcast({ t: 'vboom', v: v.i, o: [v.x, v.y, v.z], by, d: drv || 0 });
  if (drv) applyDamage(drv, 999, by, w, false);
  v.d = 0; v.lean = 0;
  setTimeout(() => {
    const s = MAP_VEHICLES[v.i]; if (!s) return;
    let sx = s.x, sz = s.z, syaw = s.yaw;
    if (v.kind === 'heli') { const p = heliFreeSpot(v.x, v.z); if (p) { sx = p[0]; sz = p[1]; syaw = v.yaw; } }   // Heli: neu an der Absturzstelle (am Boden)
    v.x = sx; v.z = sz; v.y = groundH(sx, sz); v.yaw = syaw; v.lean = 0; v.d = 0; v.dead = 0; v.hits = 0;
    broadcast({ t: 'vspawn', v: v.i, s: [v.x, v.y, v.z, v.yaw] });
  }, WRECK_TIME);
}
function hostDrop(id) {
  delete H.conns[id];
  const p = H.players[id];
  for (const v of vehicles) if (v.d === id) v.d = 0;   // Moped wird frei
  if (p) { delete H.players[id]; broadcast({ t: 'feed', msg: `${p.name} hat das Spiel verlassen` }); }
}
function applyDamage(target, dmg, attacker, w, head) {
  const p = H.players[target], a = H.players[attacker];
  if (!p || !p.alive || H.ended || performance.now() < (p.prot || 0) || dmg <= 0) return;
  if (H.mode === 'tdm' && a && a !== p && a.team === p.team) return;   // kein Eigenbeschuss im Team
  if (vehicles.some(v => v.d === target && (v.kind === 'tank' || v.kind === 'heli'))) dmg = Math.max(1, Math.round(dmg * (vehicles.some(v => v.d === target && v.kind === 'tank') ? 0.25 : 0.5)));   // Panzer/Heli schützen
  p.hp -= dmg; p.lastHit = performance.now();
  sendTo(target, { t: 'dmg', id: target, from: attacker });
  if (p.hp > 0) return;
  p.hp = 0; p.alive = false; p.d++;
  for (const v of vehicles) if (v.d === target) { v.d = 0; v.lean = 0; if (v.kind === 'heli' || v.kind === 'plane') v.y = groundH(v.x, v.z, v.y); }   // Fahrer fällt vom Moped, Heli landet
  if (a && a !== p) a.k++;
  const col = q => q ? (q.team >= 0 ? TEAM_COLORS[q.team] : q.color) : '#fff';
  broadcast({ t: 'kill', k: attacker, kn: a ? a.name : '?', kc: col(a), v: target, vn: p.name, vc: col(p), w, head });
  setTimeout(() => hostRespawn(target), 3000);
  checkMatchEnd();
}
function teamScore(t) { let s = 0; for (const id in H.players) if (H.players[id].team === t) s += H.players[id].k; return s; }
function checkMatchEnd(timeUp) {
  if (H.ended) return;
  let winner = null;
  const ps = Object.values(H.players);
  if (H.mode === 'tdm') {
    const s0 = teamScore(0), s1 = teamScore(1);
    if (s0 >= TEAM_LIMIT || s1 >= TEAM_LIMIT || timeUp) winner = s0 === s1 ? 'Unentschieden!' : `Team ${TEAM_NAMES[s0 > s1 ? 0 : 1]} gewinnt!`;
  } else {
    const top = ps.slice().sort((x, y) => y.k - x.k)[0];
    if (top && (top.k >= KILL_LIMIT || timeUp)) winner = `${top.name} gewinnt!`;
  }
  if (!winner) return;
  H.ended = true;
  const best = ps.slice().sort((x, y) => y.k - x.k || x.d - y.d).slice(0, 3).map(q => ({ n: q.name, k: q.k, d: q.d }));
  broadcast({ t: 'end', name: winner, top: best });
  setTimeout(() => {
    for (const id in H.players) { const q = H.players[id]; q.k = 0; q.d = 0; hostRespawn(id); }
    H.ended = false; H.endAt = performance.now() + MATCH_MIN * 60000;
    broadcast({ t: 'reset' });
  }, 10000);
}
function hostRespawn(id) {
  const p = H.players[id]; if (!p) return;
  const sp = pickSpawn(p);
  p.x = sp[0]; p.y = sp[1]; p.z = sp[2]; p.hp = 100; p.alive = true; p.prot = performance.now() + 1500;
  const b = H.bots.find(b => b.id === id); if (b) { b.pos.set(sp[0], sp[1], sp[2]); b.vel.set(0, 0, 0); b.wp = null; b.target = null; }
  broadcast({ t: 'respawn', id, pos: sp });
}

/* ---------- Bots (laufen beim Host) ---------- */
let botN = 0;
// Schwierigkeit: Reaktionszeit, Treffsicherheit, Sichtweite, Feuerpause, Kopfschuss-Chance, Schaden, Tempo, Ausweichen
const BOT_DIFF = {
  easy:   { name: 'Leicht', react: [0.9, 0.6], aim: 0.45, cap: 0.32, see: 35, rate: 1.5, head: 0.04, dmg: 0.7, speed: 5.0, think: 0.45, strafe: 0.5 },
  normal: { name: 'Normal', react: [0.45, 0.4], aim: 1.0, cap: 0.55, see: 55, rate: 1.0, head: 0.12, dmg: 1.0, speed: 6.0, think: 0.25, strafe: 1.0 },
  hard:   { name: 'Schwer', react: [0.25, 0.2], aim: 1.35, cap: 0.7, see: 70, rate: 0.9, head: 0.2, dmg: 1.0, speed: 6.3, think: 0.18, strafe: 1.3 },
  pro:    { name: 'Profi', react: [0.12, 0.12], aim: 1.75, cap: 0.85, see: 90, rate: 0.8, head: 0.3, dmg: 1.1, speed: 6.6, think: 0.12, strafe: 1.6 },
};
let botDiff = 'normal';
try { if (BOT_DIFF[localStorage.getItem('kz_botdiff')]) botDiff = localStorage.getItem('kz_botdiff'); } catch (e) {}
function setBotDiff(v) {
  if (!BOT_DIFF[v]) return;
  botDiff = v; try { localStorage.setItem('kz_botdiff', v); } catch (e) {}
  for (const id of ['diffIn', 'diffIn2']) if ($(id)) $(id).value = v;
}
for (const id of ['diffIn', 'diffIn2']) if ($(id)) $(id).onchange = e => { setBotDiff(e.target.value); if (running && H.bots.length) showMsg('Bots: ' + BOT_DIFF[botDiff].name); };
setBotDiff(botDiff);
// Bot-Waffen: [Waffe, Schaden, Pause zwischen Schüssen, beste Entfernung]
const BOT_GUNS = [[0, 14, 0.32, 18], [4, 10, 0.18, 10], [1, 34, 0.95, 6], [7, 13, 0.22, 20], [6, 30, 0.6, 30]];
function addBot() {
  if (H.bots.length >= 10) return;
  const id = 'bot' + (botN++);
  const g = BOT_GUNS[botN % BOT_GUNS.length];
  const p = H.players[id] = { id, name: '[BOT] ' + BOT_NAMES[botN % BOT_NAMES.length], color: COLORS[H.colorIdx++ % COLORS.length],
    team: H.mode === 'tdm' ? nextTeam() : -1, x: 0, y: 0, z: 0, ry: 0, rx: 0, hp: 100, alive: true, k: 0, d: 0, bot: true, w: g[0], f: 0, lastHit: 0 };
  const sp = pickSpawn(p); p.x = sp[0]; p.z = sp[2];
  H.bots.push({ id, gun: g, pos: new THREE.Vector3(sp[0], 0, sp[2]), vel: new THREE.Vector3(), onGround: false, yaw: 0, pitch: 0,
    wp: null, target: null, think: 0, nextShot: 0, strafe: 1, strafeT: 0, stuckT: 0, lastPos: new THREE.Vector3(sp[0], 0, sp[2]), crouchT: 0 });
  $('botCount').textContent = H.bots.length;
}
function removeBot() {
  const b = H.bots.pop(); if (!b) return;
  delete H.players[b.id]; $('botCount').textContent = H.bots.length;
}
$('botAdd').onclick = addBot; $('botDel').onclick = removeBot;

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function lineOfSight(ax, ay, az, bx, by, bz) {
  _a.set(ax, ay, az); _b.set(bx - ax, by - ay, bz - az);
  const dist = _b.length(); _b.normalize();
  const h = rayMap(_a, _b, dist);
  return !h || h.dist >= dist - 0.2;
}
function pickWaypoint(b) {
  // bevorzugt Punkte, die man von hier aus sehen kann (dann kommt der Bot auch hin)
  for (let i = 0; i < 6; i++) {
    const s = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    const x = s[0] + Math.random() * 4 - 2, z = s[1] + Math.random() * 4 - 2;
    if (i === 5 || lineOfSight(b.pos.x, b.pos.y + 1.2, b.pos.z, x, 1.2, z)) return [x, z];
  }
}
function updateBots(dt, now) {
  const D = BOT_DIFF[botDiff];
  for (const b of H.bots) {
    const p = H.players[b.id];
    if (!p || !p.alive) continue;
    const isEnemy = enemiesOf(p);
    b.think -= dt;
    if (b.think <= 0) {
      b.think = D.think + Math.random() * 0.2;
      let best = null, bd = D.see;
      for (const id in H.players) {
        if (!isEnemy(id)) continue;
        const q = H.players[id]; if (!q.alive) continue;
        const d = Math.hypot(q.x - b.pos.x, q.z - b.pos.z);
        const sneaky = (q.f & 2) || (q.f & 1) ? 0.6 : 1;   // Schleichende/geduckte werden später entdeckt
        if (d < bd * sneaky && lineOfSight(b.pos.x, b.pos.y + EYE, b.pos.z, q.x, q.y + 1.3, q.z)) { bd = d; best = id; }
      }
      if (best && best !== b.target) b.nextShot = Math.max(b.nextShot, now + D.react[0] + Math.random() * D.react[1]);   // Reaktionszeit
      b.target = best;
      // Feststecken erkennen
      if (b.pos.distanceTo(b.lastPos) < 0.3 && !best) { b.stuckT += 0.3; if (b.stuckT > 1.5) { b.wp = null; b.stuckT = 0; b.vel.y = 8.2; } } else b.stuckT = 0;
      b.lastPos.copy(b.pos);
    }
    let wx = 0, wz = 0;
    const t = b.target && H.players[b.target];
    const [gw, gdmg, grate, grange] = b.gun;
    if (t && t.alive) {
      const dx = t.x - b.pos.x, dz = t.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
      b.yaw = Math.atan2(-dx, -dz);
      b.pitch = Math.atan2((t.y + 1.3) - (b.pos.y + EYE), d);
      b.strafeT -= dt; if (b.strafeT <= 0) { b.strafe = (Math.random() < 0.5 ? -1 : 1) * (Math.random() < D.strafe ? 1 : 0); b.strafeT = (0.6 + Math.random() * 1.2) / Math.max(1, D.strafe); b.crouchT = Math.random() < 0.25 ? 1.2 : 0; }
      const fwd = d > grange * 1.3 ? 1 : d < grange * 0.5 ? -0.7 : 0;
      wx = dx / d * fwd + (-dz / d) * b.strafe; wz = dz / d * fwd + (dx / d) * b.strafe;
      if (now > b.nextShot) {
        b.nextShot = now + grate * D.rate * (0.9 + Math.random() * 0.5);
        const moving = Math.hypot(t.x - (t._px || t.x), t.z - (t._pz || t.z)) > 0.2;
        let chance = Math.max(0.06, Math.min(D.cap, (0.6 - Math.max(0, d - grange) * 0.02 - d * 0.004) * D.aim)) * (moving ? 0.8 : 1) * ((t.f & 1) ? 0.75 : 1);
        const hit = Math.random() < chance;
        const end = [t.x + (hit ? 0 : (Math.random() - 0.5) * 2), t.y + 1.2 + (hit ? 0 : Math.random() * 1.2 - 0.3), t.z + (hit ? 0 : (Math.random() - 0.5) * 2)];
        broadcast({ t: 'shot', id: b.id, w: gw, o: [b.pos.x, b.pos.y + 1.3, b.pos.z], e: [end] });
        if (hit) applyDamage(b.target, Math.round(gdmg * D.dmg * (Math.random() < D.head ? 2 : 1)), b.id, gw, false);
      }
    } else {
      b.crouchT = 0;
      if (!b.wp || Math.hypot(b.wp[0] - b.pos.x, b.wp[1] - b.pos.z) < 2) b.wp = pickWaypoint(b);
      const dx = b.wp[0] - b.pos.x, dz = b.wp[1] - b.pos.z, d = Math.hypot(dx, dz) || 1;
      wx = dx / d; wz = dz / d;
      let dy = Math.atan2(-dx, -dz) - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      b.yaw += dy * Math.min(1, dt * 6); b.pitch *= 0.9;
    }
    b.crouchT = Math.max(0, b.crouchT - dt);
    const l = Math.hypot(wx, wz) || 1, sp = b.crouchT > 0 ? D.speed / 2 : D.speed;
    const acc = 1 - Math.exp(-10 * dt);
    b.vel.x += (wx / l * sp - b.vel.x) * acc; b.vel.z += (wz / l * sp - b.vel.z) * acc;
    b.vel.y = Math.max(-30, b.vel.y - GRAV * dt);
    b.h = b.crouchT > 0 ? 1.25 : PH;
    moveBody(b, b.vel.x * dt, b.vel.y * dt, b.vel.z * dt);
    if (b.blocked && b.onGround) { b.vel.y = 8.2; if (!t) b.wp = null; }
    p._px = p.x; p._pz = p.z;
    p.x = b.pos.x; p.y = b.pos.y; p.z = b.pos.z; p.ry = b.yaw; p.rx = b.pitch; p.f = b.crouchT > 0 ? 1 : 0;
  }
}

/* ---------- Client-Logik (läuft bei allen, auch beim Host) ---------- */
const radarPing = {};
function clientHandle(m) {
  if (m.t === 'welcome') {
    // Host spielt eine andere Karte → diese laden und automatisch wieder beitreten
    if (m.map && m.map !== MAP_ID) {
      showMapSwitch(m.map); try { peer && peer.destroy(); } catch (e) {}
      return switchMap(m.map, roomCode);
    }
    myId = m.id; world.mode = m.mode || 'ffa'; spawnAt(m.spawn);
    if (!running) startGame();
    if (m.b !== BUILD) versionWarn('Der Host hat eine andere Spielversion!');
  } else if (m.t === 'snap') {
    world.players = m.p;
    if (m.vh) m.vh.forEach((s, i) => {
      const v = vehicles[i]; if (!v || i === ride.v) return;
      v.x = s[0]; v.y = s[1]; v.z = s[2]; v.yaw = s[3]; v.d = s[4] || 0; v.lean = s[5]; v.wh = s[6] || 0; v.st = s[7] || 0;
      if (s[8] !== undefined) { setWreck(v, s[8] === -1); v.hitsN = Math.max(0, s[8]); }   // Wrack / angeschossen (auch für später Beigetretene)
    });
    if (m.m) world.mode = m.m;
    if (m.tl !== undefined) world.timeLeft = m.tl;
    if (m.k) pickActive = Array.from(m.k, v => !!v);
  } else if (m.t === 'entered') {
    startRide(m.v);
  } else if (m.t === 'enterFail') {
    enterFailed(m.r);
  } else if (m.t === 'got') {
    gotWeapon(m.w);
  } else if (m.t === 'shot') {
    if (m.id === myId) return;
    const o = new THREE.Vector3(...m.o);
    const fl = new THREE.Sprite(flashMat.clone()); fl.position.copy(o); fl.scale.set(0.7, 0.7, 1); fl.material.rotation = Math.random() * 6;
    scene.add(fl); effects.push({ o: fl, life: 0.06, max: 0.06 });
    if (WEAPONS[m.w] && WEAPONS[m.w].flame && m.e[0]) flameFx(o, new THREE.Vector3(...m.e[0]).sub(o).normalize());
    else for (const e of m.e) {
      const end = new THREE.Vector3(...e); addTracer(o, end);
      const dir = end.clone().sub(o); const len = dir.length(); dir.normalize();
      const h = rayMap(o, dir, len + 0.1);
      if (h && h.dist > len - 0.3) impactFx(h.point, h.normal);
    }
    sndShot(m.w || 0, 0.5, o);
    radarPing[m.id] = performance.now();
    if (avatars[m.id]) avatars[m.id].kick = 1;
  } else if (m.t === 'nade') {
    if (m.id !== myId) startNade(m.i, new THREE.Vector3(...m.o), new THREE.Vector3(...m.v), false, m.imp);
  } else if (m.t === 'rkt') {
    if (m.id !== myId) fireRocket(new THREE.Vector3(...m.o), new THREE.Vector3(...m.v), false, m.w, vehicles.findIndex(x => x.d === m.id));
  } else if (m.t === 'vboom') {   // Fahrzeug explodiert
    const v = vehicles[m.v]; if (!v) return;
    if (ride.v === m.v) exitRide(true);
    v.x = m.o[0]; v.y = m.o[1]; v.z = m.o[2]; v.d = 0; v.hitsN = 0;
    vehicleBoomFx(m.o); setWreck(v, true);
    if (m.by === myId) showMsg(`💥 ${VK[v.kind].name} zerstört!`);
  } else if (m.t === 'vhit') {   // Panzer angeschossen (hält 3 Treffer aus)
    const v = vehicles[m.v]; if (!v) return;
    v.hitsN = m.h;
    if (ride.v === m.v) { showMsg(`⚠ Panzer getroffen! Noch ${VEH_HP[v.kind] - m.h} Treffer bis zur Explosion`); me.shake = Math.max(me.shake, 0.6); sndThud(0.9); }
  } else if (m.t === 'vspawn') {   // neues Fahrzeug am Startplatz
    const v = vehicles[m.v]; if (!v) return;
    setWreck(v, false); v.x = m.s[0]; v.y = m.s[1]; v.z = m.s[2]; v.yaw = m.s[3]; v.lean = 0; v.d = 0; v.hitsN = 0;
  } else if (m.t === 'kill') {
    const head = m.head ? ' ◎' : '';
    feed(`<span style="color:${m.kc}">${esc(m.kn)}</span> <b class="fw">${weaponShort(m.w || 0)}${head}</b> <span style="color:${m.vc}">${esc(m.vn)}</span>`, m.k === myId || m.v === myId, true);
    if (m.v === myId) die(m.k === myId ? '' : m.kn);
    const va = avatars[m.v];
    if (va) bloodFx(va.g.position.clone().add(new THREE.Vector3(0, 1.3, 0)));
    if (m.k === myId && m.v !== myId) onMyKill(m);
  } else if (m.t === 'respawn') {
    if (m.id === myId) spawnAt(m.pos);
  } else if (m.t === 'dmg') {
    if (m.id === myId) {
      $('dmgFlash').style.opacity = 1; setTimeout(() => $('dmgFlash').style.opacity = 0, 140);
      sndThud(0.6); me.recoilP += 0.025; me.shake = Math.max(me.shake, 0.25);
      const a = world.players[m.from];
      if (a && m.from !== myId) showDamageDir(a.x, a.z);
    }
  } else if (m.t === 'feed') {
    feed(esc(m.msg));
  } else if (m.t === 'end') {
    showEndScreen(m);
  } else if (m.t === 'reset') {
    $('endScreen').classList.add('hidden');
  }
}
// Eigene Eliminierung: Coins, Serien, Mehrfach-Kills
function onMyKill(m) {
  streak++;
  const now = performance.now();
  multiN = now - multiT < 4000 ? multiN + 1 : 1; multiT = now;
  let reward = m.head ? 150 : 100, bonus = '';
  if (streak === 5) { reward += 250; bonus = 'KILLSERIE 5!'; }
  else if (streak === 10) { reward += 500; bonus = 'UNAUFHALTSAM! (10)'; }
  else if (streak > 0 && streak % 5 === 0) { reward += 300; bonus = `KILLSERIE ${streak}!`; }
  const multi = ['', '', 'DOPPELKILL!', 'DREIFACHKILL!', 'VIERFACHKILL!', 'MONSTERKILL!'][Math.min(5, multiN)];
  shopState.coins += reward; saveShop(); updateCoins(true);
  showMsg(`${m.head ? 'KOPFSCHUSS! ' : ''}${m.vn} eliminiert  +${reward} Coins`);
  if (multi || bonus) showStreak(multi || bonus, bonus && multi ? bonus : '');
  const h = $('hitmarker'); h.classList.add('head'); h.style.opacity = 1; h.style.transform = 'scale(1.5)';
  setTimeout(() => { h.style.opacity = 0; h.style.transform = ''; }, 300);
  sndBeep(880, 0.12, 0.12, 'sine'); setTimeout(() => sndBeep(1320, 0.15, 0.12, 'sine'), 90);
  setTimeout(() => sndBeep(1760, 0.18, 0.08, 'triangle'), 200);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function feed(html, mine, isKill) {
  const d = document.createElement('div'); d.innerHTML = html; if (mine) d.className = 'me';
  const f = $('feed'); f.prepend(d);
  while (f.children.length > 6) f.lastChild.remove();
  setTimeout(() => d.remove(), isKill ? 7000 : 5000);
}

let lastNet = 0;
function netTick(now) {
  if (now - lastNet < 0.05 || !myId) return;
  lastNet = now;
  if (!me.alive) return;
  const riding = ride.v >= 0;
  const msg = { t: 's', p: [+me.pos.x.toFixed(2), +me.pos.y.toFixed(2), +me.pos.z.toFixed(2)],
    r: riding ? [+(ride.yaw - Math.PI / 2).toFixed(3), riderAiming() ? +me.pitch.toFixed(3) : -0.3] : [+me.yaw.toFixed(3), +me.pitch.toFixed(3)],
    w: me.weapon, f: riding ? 8 | (riderAiming() ? 16 : 0) : (me.crouch ? 1 : 0) | (me.sneak ? 2 : 0) | (me.sprinting ? 4 : 0) };
  if (riding) msg.ay = +me.yaw.toFixed(3);   // Zielrichtung des Fahrers
  if (riding) msg.vs = [ride.v, +ride.pos.x.toFixed(2), +ride.pos.y.toFixed(2), +ride.pos.z.toFixed(2), +ride.yaw.toFixed(3), +ride.lean.toFixed(2), +(ride.wh || 0).toFixed(2), +(ride.st || 0).toFixed(2)];
  net.send(msg);
}
// Host-Simulation läuft über einen Timer, damit sie auch weiterläuft, wenn der Host-Tab im Hintergrund ist
let hostLast = performance.now();
setInterval(() => {
  if (!isHost || !running) return;
  const t = performance.now(), dt = Math.min(0.1, (t - hostLast) / 1000); hostLast = t;
  updateBots(dt, t / 1000);
  // Heilung: nach 5 Sekunden ohne Treffer
  for (const id in H.players) { const p = H.players[id]; if (p.alive && p.hp < 100 && t - (p.lastHit || 0) > 5000) p.hp = Math.min(100, p.hp + 25 * dt); }
  const tl = Math.max(0, Math.round((H.endAt - t) / 1000));
  if (tl <= 0 && !H.ended) checkMatchEnd(true);
  world.timeLeft = tl;
  const r2 = n => Math.round(n * 100) / 100;
  const snap = { t: 'snap', p: H.players, k: pickActive.map(v => v ? 1 : 0), m: H.mode, tl,
    vh: vehicles.map(v => [r2(v.x), r2(v.y), r2(v.z), r2(v.yaw), v.d || 0, r2(v.lean), v.d ? r2(v.wh || 0) : 0, v.d ? r2(v.st || 0) : 0, v.dead ? -1 : (v.hits || 0)]) };   // letzter Wert: -1 = Wrack, sonst Treffer
  for (const id in H.conns) if (H.conns[id].open) H.conns[id].send(snap);
}, 50);
