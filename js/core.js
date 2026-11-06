'use strict';
const $ = id => document.getElementById(id);
const PREFIX = 'kampfzone-arena-v1-';
// Handy/Tablet erkennen (Touchscreen ohne Maus) → Touch-Steuerung statt Maus & Tastatur
const TOUCH = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches);
if (TOUCH) document.body.classList.add('touch');

/* Update-Prüfung: beim Veröffentlichen wird 20261106-150934 durch eine Versionsnummer ersetzt */
const BUILD = '20261106-150934';
if (!BUILD.startsWith('__') && location.protocol.startsWith('http')) {
  const check = async () => {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      const j = await r.json();
      if (j.build && j.build !== BUILD) document.getElementById('updateBar').classList.remove('hidden');
    } catch (e) {}
  };
  setInterval(check, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
document.getElementById('btnUpdate').onclick = () => location.reload();
const KILL_LIMIT = 25;
const PR = 0.38, PH = 1.85, EYE = 1.65, STEP = 0.8, GRAV = 24;
const COLORS = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#ff6fb5','#ecf0f1','#a0522d','#00e5ff','#c0ff33'];
const BOT_NAMES = ['Rex','Blitz','Kobra','Falke','Wolf','Titan','Viper','Echo','Panzer','Jäger'];

const WEAPONS = [
  { name:'Sturmgewehr', short:'AR', dmg:20, head:2,   rate:0.1,  mag:30, reload:1.8, spread:0.01,  move:0.035, pellets:1, auto:true,  kick:0.012, zoom:55, snd:[1400,0.09] },
  { name:'Schrotflinte',short:'SG', dmg:12, head:1.5, rate:0.85, mag:6,  reload:2.2, spread:0.075, move:0.03,  pellets:9, auto:false, kick:0.06,  zoom:60, snd:[700,0.22] },
  { name:'Scharfschützengewehr', short:'SR', dmg:95, head:2.5, rate:1.3, mag:5, reload:2.6, spread:0.07, move:0.05, pellets:1, auto:false, kick:0.07, zoom:22, scope:true, snd:[500,0.3] },
  { name:'Pistole',     short:'P',  dmg:26, head:2,   rate:0.2,  mag:12, reload:1.3, spread:0.008, move:0.02,  pellets:1, auto:false, kick:0.025, zoom:60, snd:[1800,0.08] },
  // Ab hier: Waffen aus dem Waffenladen (je 10.000 Coins)
  { name:'Maschinenpistole', short:'MP', dmg:15, head:1.8, rate:0.065, mag:35, reload:1.6, spread:0.02, move:0.02, pellets:1, auto:true, kick:0.009, zoom:60, snd:[1700,0.07], price:10000,
    desc:'Sehr schnelles Dauerfeuer – stark auf kurze Distanz.' },
  { name:'Revolver', short:'REV', dmg:55, head:2.2, rate:0.5, mag:6, reload:2.0, spread:0.006, move:0.02, pellets:1, auto:false, kick:0.07, zoom:55, snd:[850,0.22], price:10000,
    desc:'Riesiger Schaden pro Schuss – zwei Treffer reichen.' },
  { name:'Kampfgewehr', short:'KG', dmg:40, head:2.2, rate:0.25, mag:15, reload:2.2, spread:0.025, move:0.04, pellets:1, auto:false, kick:0.035, zoom:35, scope:true, snd:[1100,0.15], price:10000,
    desc:'Präzise mit Zielfernrohr, schneller als das Scharfschützengewehr.' },
  { name:'Maschinengewehr', short:'MG', dmg:22, head:1.8, rate:0.085, mag:80, reload:3.6, spread:0.025, move:0.06, pellets:1, auto:true, kick:0.014, zoom:55, snd:[1200,0.11], price:10000,
    desc:'80 Schuss im Magazin – Dauerfeuer ohne Ende.' },
  // Günstige Einsteiger-Waffe
  { name:'Doppelflinte', short:'DF', dmg:11, head:1.5, rate:0.3, mag:2, reload:2.4, spread:0.085, move:0.03, pellets:10, auto:false, kick:0.075, zoom:60, snd:[600,0.25], price:1000,
    desc:'Zwei Läufe, zwei schnelle Schüsse – brutal aus nächster Nähe. Nur 1.000 Coins!' },
];
const BASE_WEAPONS = 4;   // 0–3 gibt es für alle, ab 4 kann man kaufen

/* ======================= Coins & Waffenladen (im Browser gespeichert) ======================= */
const shopState = { coins: 0, bought: [], equip: -1 };
try {
  shopState.coins = parseInt(localStorage.getItem('kz_coins')) || 0;
  shopState.bought = JSON.parse(localStorage.getItem('kz_bought') || '[]');
  shopState.equip = parseInt(localStorage.getItem('kz_equip'));
  if (isNaN(shopState.equip)) shopState.equip = -1;
} catch (e) {}
function saveShop() {
  try {
    localStorage.setItem('kz_coins', shopState.coins);
    localStorage.setItem('kz_bought', JSON.stringify(shopState.bought));
    localStorage.setItem('kz_equip', shopState.equip);
  } catch (e) {}
}
const fmt = n => n.toLocaleString('de-DE');
function updateCoins(bump) {
  $('coinVal').textContent = fmt(shopState.coins);
  $('menuCoins').textContent = fmt(shopState.coins);
  $('shopCoins').textContent = fmt(shopState.coins);
  if (bump) { const c = $('coinHud'); c.classList.add('bump'); setTimeout(() => c.classList.remove('bump'), 180); }
}
function renderShop() {
  updateCoins();
  const bar = (label, v) => `<div class="stat"><span>${label}</span><em><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></em></div>`;
  let html = '';
  for (let i = BASE_WEAPONS; i < WEAPONS.length; i++) {
    const w = WEAPONS[i], owned = shopState.bought.includes(i), eq = shopState.equip === i;
    let btn;
    if (!owned) btn = `<button data-buy="${i}" ${shopState.coins < w.price ? 'disabled' : ''}>Kaufen<br><small><span class="coin"></span> ${fmt(w.price)}</small></button>`;
    else if (eq) btn = `<button class="sec" data-unequip="${i}">✓ Ausgerüstet</button>`;
    else btn = `<button data-equip="${i}">Ausrüsten</button>`;
    html += `<div class="shopItem ${eq ? 'eq' : ''}"><div class="info"><div class="nm">${w.name}</div><div class="ds">${w.desc}</div>
      ${bar('Schaden', w.dmg * w.pellets / 60)}${bar('Feuerrate', 0.065 / w.rate)}${bar('Magazin', w.mag / 80)}</div>${btn}</div>`;
  }
  $('shopList').innerHTML = html;
}
$('shopList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.buy) {
    const i = +b.dataset.buy, w = WEAPONS[i];
    if (shopState.coins < w.price || shopState.bought.includes(i)) return;
    shopState.coins -= w.price; shopState.bought.push(i); shopState.equip = i;
    initAudio(); sndBeep(660, 0.1, 0.12, 'triangle'); setTimeout(() => sndBeep(990, 0.15, 0.12, 'triangle'), 90);
  } else if (b.dataset.equip) shopState.equip = +b.dataset.equip;
  else if (b.dataset.unequip) shopState.equip = -1;
  saveShop(); renderShop();
  // Im laufenden Spiel sofort in die Hand geben
  if (running && me.alive && shopState.equip >= BASE_WEAPONS) {
    for (let i = BASE_WEAPONS; i < WEAPONS.length; i++) me.owned[i] = false;
    me.owned[shopState.equip] = true; me.ammo[shopState.equip] = WEAPONS[shopState.equip].mag;
    me.weapon = -1; switchWeapon(shopState.equip);
  }
});
const openShop = () => { renderShop(); $('shop').classList.remove('hidden'); };
$('btnShop1').onclick = openShop; $('btnShop2').onclick = openShop;
$('shopClose').onclick = () => $('shop').classList.add('hidden');
updateCoins();

/* ======================= Einstellungen ======================= */
let sens = 1;
try { sens = parseFloat(localStorage.getItem('kz_sens')) || 1; $('nameIn').value = localStorage.getItem('kz_name') || ''; } catch (e) {}
$('sensIn').value = sens; $('sensVal').textContent = sens.toFixed(2);
$('sensIn').oninput = e => { sens = parseFloat(e.target.value); $('sensVal').textContent = sens.toFixed(2); try { localStorage.setItem('kz_sens', sens); } catch (e) {} };
function codeFromHash() { if (location.hash.length > 1) $('codeIn').value = location.hash.slice(1).toUpperCase().slice(0, 5); }
codeFromHash(); addEventListener('hashchange', codeFromHash);
// Sichtfeld + Lautstärke
(function () {
  let fov = 75, vol = 0.8;
  try { fov = parseFloat(localStorage.getItem('kz_fov')) || 75; const v = parseFloat(localStorage.getItem('kz_vol')); if (!isNaN(v)) vol = v; } catch (e) {}
  $('fovIn').value = fov; $('fovVal').textContent = fov;
  $('volIn').value = vol; $('volVal').textContent = Math.round(vol * 100) + ' %';
  $('fovIn').oninput = e => { const v = +e.target.value; $('fovVal').textContent = v; fovBase = v; try { localStorage.setItem('kz_fov', v); } catch (e) {} };
  $('volIn').oninput = e => { const v = +e.target.value; $('volVal').textContent = Math.round(v * 100) + ' %'; setVolume(v); try { localStorage.setItem('kz_vol', v); } catch (e) {} };
})();

/* ======================= Sound (mit Richtung: links/rechts, nah/fern) ======================= */
let actx = null, noiseBuf = null, master = null, volume = 0.8;
try { const v = parseFloat(localStorage.getItem('kz_vol')); if (!isNaN(v)) volume = v; } catch (e) {}
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    master = actx.createGain(); master.gain.value = volume;
    const comp = actx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(actx.destination);
  } catch (e) { actx = null; }
}
function setVolume(v) { volume = v; if (master) master.gain.value = v; }
// Position → Lautstärke (Entfernung) und Stereo-Richtung (relativ zur Blickrichtung)
function spatialOut(pos, maxD = 80) {
  if (!pos || typeof me === 'undefined') return { node: master, g: 1, d: 0 };
  const dx = pos.x - camera.position.x, dy = pos.y - camera.position.y, dz = pos.z - camera.position.z;
  const d = Math.hypot(dx, dy, dz);
  const g = Math.pow(Math.max(0, 1 - d / maxD), 1.4);
  let node = master;
  if (actx.createStereoPanner && d > 0.5) {
    const rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    const p = actx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.85;
    p.connect(master); node = p;
  }
  return { node, g, d };
}
function noiseSrc() { const s = actx.createBufferSource(); s.buffer = noiseBuf; return s; }
function sndShot(w, vol = 0.5, pos) {
  if (!actx) return;
  const o = spatialOut(pos, 120); if (o.g <= 0.01) return;
  const [freq, len] = WEAPONS[w] ? WEAPONS[w].snd : [1400, 0.09], t = actx.currentTime, v = vol * o.g;
  const far = Math.min(1, o.d / 60);   // ferne Schüsse klingen dumpfer
  const src = noiseSrc(), f = actx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(freq * 3.5 * (1 - far * 0.7), t); f.frequency.exponentialRampToValueAtTime(freq * 0.35, t + len);
  const g = actx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + len * 1.2);
  src.connect(f); f.connect(g); g.connect(o.node); src.start(t, Math.random() * 0.5); src.stop(t + len * 1.3);
  const osc = actx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  const g2 = actx.createGain(); g2.gain.setValueAtTime(v * 0.9 * (1 - far * 0.5), t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.connect(g2); g2.connect(o.node); osc.start(t); osc.stop(t + 0.16);
  const tail = noiseSrc(), f3 = actx.createBiquadFilter(); f3.type = 'bandpass'; f3.frequency.value = 420; f3.Q.value = 0.6;
  const g3 = actx.createGain(); g3.gain.setValueAtTime(0.0001, t); g3.gain.linearRampToValueAtTime(v * 0.2, t + 0.04); g3.gain.exponentialRampToValueAtTime(0.001, t + 0.6 + far * 0.6);
  tail.connect(f3); f3.connect(g3); g3.connect(o.node); tail.start(t, Math.random() * 0.4); tail.stop(t + 1.3);
}
function sndStep(vol, pos) {
  if (!actx || vol < 0.005) return;
  const o = spatialOut(pos, 30), v = vol * (pos ? 1 : 1);
  const t = actx.currentTime, src = noiseSrc();
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260 + Math.random() * 120;
  const g = actx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  src.connect(f); f.connect(g); g.connect(o.node); src.start(t, Math.random() * 1.5); src.stop(t + 0.1);
}
function sndBeep(freq, len, vol = 0.15, type = 'square') {
  if (!actx) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + len);
}
// Metallisches Klicken (Nachladen, Waffe wechseln, Durchladen)
function sndClick(vol = 0.08, pitch = 1) {
  if (!actx) return;
  const t = actx.currentTime, src = noiseSrc(), f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600 * pitch; f.Q.value = 3;
  const g = actx.createGain(); g.gain.setValueAtTime(vol * 2.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random()); src.stop(t + 0.06);
}
function sndSwish(vol = 1) {
  if (!actx) return;
  const t = actx.currentTime, src = noiseSrc(), f = actx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5;
  f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.15);
  const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18 * vol, t + 0.06); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random()); src.stop(t + 0.22);
}
function sndThud(vol = 1) {
  if (!actx) return;
  const t = actx.currentTime, osc = actx.createOscillator(); osc.frequency.setValueAtTime(120, t); osc.frequency.exponentialRampToValueAtTime(50, t + 0.1);
  const g = actx.createGain(); g.gain.setValueAtTime(0.3 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + 0.13);
}
function sndSlide() {
  if (!actx) return;
  const t = actx.currentTime, src = noiseSrc(), f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = actx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random()); src.stop(t + 0.75);
}
function sndHit(head) {
  if (!actx) return;
  sndBeep(head ? 1700 : 1100, 0.05, 0.1, 'triangle');
  if (head) setTimeout(() => sndBeep(2400, 0.12, 0.06, 'sine'), 30);
}
function sndBoom(pos) {
  if (!actx) return;
  const o = spatialOut(pos, 160), t = actx.currentTime, v = 0.9 * Math.max(0.15, o.g);
  const src = noiseSrc(), f = actx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(90, t + 1.2);
  const g = actx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
  src.connect(f); f.connect(g); g.connect(o.node); src.start(t); src.stop(t + 1.7);
  const osc = actx.createOscillator(); osc.frequency.setValueAtTime(90, t); osc.frequency.exponentialRampToValueAtTime(25, t + 0.6);
  const g2 = actx.createGain(); g2.gain.setValueAtTime(v, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  osc.connect(g2); g2.connect(o.node); osc.start(t); osc.stop(t + 0.72);
}

/* ======================= Three.js Szene ======================= */
// Farben werden wie in Bildprogrammen (sRGB) angegeben und intern linear berechnet
(function () {
  const sh = THREE.Color.prototype.setHex, ss = THREE.Color.prototype.setStyle;
  THREE.Color.prototype.setHex = function (h) { sh.call(this, h); return this.convertSRGBToLinear(); };
  THREE.Color.prototype.setStyle = function (s) { ss.call(this, s); return this.convertSRGBToLinear(); };
})();
THREE.Cache.enabled = true;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.prepend(renderer.domElement);
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9cde0);
scene.fog = new THREE.Fog(0xb9cde0, 90, 380);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 900);
camera.rotation.order = 'YXZ';
scene.add(camera);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

/* ---------- Ladeanzeige ---------- */
const loadMgr = new THREE.LoadingManager();
loadMgr.onProgress = (url, n, total) => { const el = $('loadInfo'); if (el) el.textContent = `Grafik wird geladen … ${Math.round(n / total * 100)} %`; };
loadMgr.onLoad = () => { const el = $('loadInfo'); if (el) el.textContent = 'Grafik geladen ✓'; };

/* ---------- Licht ---------- */
const SUN_DIR = new THREE.Vector3(0.45, 0.7, 0.55).normalize();
const hemi = new THREE.HemisphereLight(0xd6e6ff, 0x5a5040, 0.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 240 });
scene.add(sun); scene.add(sun.target);
// Schattenbereich wandert mit dem Spieler mit (auf 4 m gerastert, damit Schatten nicht flimmern)
const sunCenter = new THREE.Vector3();
function placeSun() { sun.target.position.copy(sunCenter); sun.position.copy(sunCenter).addScaledVector(SUN_DIR, 110); }
function followSun(x, z) {
  const sx = Math.round(x / 4) * 4, sz = Math.round(z / 4) * 4;
  if (sx === sunCenter.x && sz === sunCenter.z) return;
  sunCenter.set(sx, 0, sz); placeSun();
}
placeSun();

/* ---------- Ersatzhimmel (bis das Foto geladen ist) ---------- */
const skyTop = new THREE.Color(0x3a78c8).convertLinearToSRGB(), skyHor = new THREE.Color(0xc4d6e6).convertLinearToSRGB();
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: skyTop }, horizon: { value: skyHor } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main(){ float h = clamp(normalize(vDir).y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0); }'
}));
skyMesh.renderOrder = -10;
scene.add(skyMesh);

/* ---------- Foto-Himmel (HDRI): Hintergrund, Umgebungslicht, Reflexionen, Sonnenstand ---------- */
const pmrem = new THREE.PMREMGenerator(renderer);
function halfToFloat(h) {
  const s = (h & 0x8000) >> 15, e = (h & 0x7C00) >> 10, f = h & 0x03FF;
  if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  if (e === 0x1F) return f ? NaN : (s ? -1 : 1) * Infinity;
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}
function analyzeSky(tex) {
  try {
    const { data, width: w, height: h } = tex.image;
    const ch = data.length / (w * h);
    const px = (r, c) => { const i = (r * w + c) * ch; return [halfToFloat(data[i]), halfToFloat(data[i + 1]), halfToFloat(data[i + 2])]; };
    // Hellster Punkt in der oberen Hälfte = Sonne
    let best = -1, br = 0, bc = 0;
    for (let r = 0; r < h / 2; r += 2) for (let c = 0; c < w; c += 2) {
      const p = px(r, c), l = p[0] * 0.2126 + p[1] * 0.7152 + p[2] * 0.0722;
      if (l > best) { best = l; br = r; bc = c; }
    }
    const el = (0.5 - (br + 0.5) / h) * Math.PI, az = ((bc + 0.5) / w - 0.5) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    if (dir.y > 0.15) { SUN_DIR.copy(dir); placeSun(); }
    // Horizontfarbe für den Dunst
    let acc = [0, 0, 0], n = 0;
    const row = Math.floor(h * 0.47);
    for (let c = 0; c < w; c += 4) { const p = px(row, c); acc[0] += p[0]; acc[1] += p[1]; acc[2] += p[2]; n++; }
    const aces = x => Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
    const toS = x => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    const f = acc.map(v => toS(aces(v / n * 0.6)));
    scene.fog.color.setRGB(f[0], f[1], f[2]);
  } catch (e) { /* Standardwerte behalten */ }
}
new THREE.RGBELoader(loadMgr).setDataType(THREE.HalfFloatType).load('textures/sky.hdr', tex => {
  tex.mapping = THREE.EquirectangularReflectionMapping;
  analyzeSky(tex);
  scene.environment = pmrem.fromEquirectangular(tex).texture;
  scene.background = tex;
  skyMesh.visible = false;
});

/* ---------- Hilfsfunktionen für Texturen ---------- */
function canvasTex(draw, size = 256, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAX_ANISO;
  t.encoding = THREE.sRGBEncoding;
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function speckle(g, s, n, rgb, aMax, size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${rgb},${Math.random() * aMax})`;
    const r = Math.random() * size + 0.5;
    g.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
}
const texLoader = new THREE.TextureLoader(loadMgr);
function ptex(file, srgb, rx = 1, ry = rx) {
  const t = texLoader.load('textures/' + file);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = MAX_ANISO;
  if (srgb) t.encoding = THREE.sRGBEncoding;
  return t;
}
// Foto-Material: Farbe + Relief (Normal Map) + Rauheit/Metall/Schatten (ARM)
function pbr(name, tile, opts = {}, rx = 1, ry = rx) {
  const arm = ptex(name + '_arm.jpg', false, rx, ry);
  const m = new THREE.MeshStandardMaterial(Object.assign({
    map: opts.map || ptex(name + '_diff.jpg', true, rx, ry),
    normalMap: ptex(name + '_nor.jpg', false, rx, ry),
    roughnessMap: arm, metalnessMap: arm, aoMap: arm,
    roughness: 1, metalness: 1, aoMapIntensity: 1,
  }, opts.mat || {}));
  if (opts.normalScale) m.normalScale.set(opts.normalScale, opts.normalScale);
  m.userData.tile = tile;
  return m;
}
// Container-Foto in andere Farbe umfärben (Details bleiben erhalten)
function tintedTex(name, hex) {
  const c = document.createElement('canvas'); c.width = c.height = 4;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAX_ANISO; t.encoding = THREE.sRGBEncoding;
  loadMgr.itemStart('tint-' + hex);
  const img = new Image();
  img.onload = () => {
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    let sum = 0; for (let i = 0; i < p.length; i += 4) sum += p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
    const avg = sum / (p.length / 4);
    const tr = (hex >> 16) & 255, tg = (hex >> 8) & 255, tb = hex & 255;
    for (let i = 0; i < p.length; i += 4) {
      const l = (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) / avg;
      p[i] = Math.min(255, tr * l); p[i + 1] = Math.min(255, tg * l); p[i + 2] = Math.min(255, tb * l);
    }
    g.putImageData(d, 0, 0); t.needsUpdate = true;
    loadMgr.itemEnd('tint-' + hex);
  };
  img.onerror = () => loadMgr.itemEnd('tint-' + hex);
  img.src = 'textures/' + name + '_diff.jpg';
  return t;
}

/* ---------- Selbst erzeugte Texturen (Sandsäcke, Fenster, Türen, Bäume, Gras) ---------- */
const TEX = {
  sandbag: canvasTex((g, s) => {
    g.fillStyle = '#6f6248'; g.fillRect(0, 0, s, s);
    const rows = 4, w = s / 2, h = s / rows;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 3; c++) {
      const x = c * w + (r % 2 ? w / 2 : 0) + 3, y = r * h + 3;
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#b8a882'); gr.addColorStop(0.6, '#9c8c66'); gr.addColorStop(1, '#6b5d40');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x + w / 2 - 3, y + h / 2 - 3, w / 2 - 3, h / 2 - 3, 0, 0, 7); g.fill();
    }
    speckle(g, s, 6000, '50,40,25', 0.25, 1.5); speckle(g, s, 2000, '220,210,180', 0.12, 1);
  }, 256),
  window: canvasTex((g, s) => {
    g.fillStyle = '#c9c5bd'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#1c2630'; g.fillRect(s * 0.08, s * 0.08, s * 0.84, s * 0.84);
    g.fillStyle = '#c9c5bd'; g.fillRect(s * 0.47, 0, s * 0.06, s); g.fillRect(0, s * 0.47, s, s * 0.06);
  }, 128, false),
  door: canvasTex((g, s) => {
    g.fillStyle = '#3d4a52'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 4; g.strokeRect(s * .1, s * .08, s * .8, s * .38); g.strokeRect(s * .1, s * .54, s * .8, s * .38);
    g.fillStyle = '#b8b8b0'; g.fillRect(s * .78, s * .5, s * .08, s * .04);
    speckle(g, s, 1500, '0,0,0', 0.3, 2);
  }, 128, false),
  needles: canvasTex((g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * s, y = Math.random() * s * 0.92;
      const len = rnd(6, 16), a = Math.PI / 2 + rnd(-0.6, 0.6);
      const v = rnd(0.6, 1.1);
      g.strokeStyle = `rgba(${32 * v | 0},${58 * v | 0},${28 * v | 0},0.95)`; g.lineWidth = rnd(1, 2.2);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(0, s);
    for (let x = 0; x <= s; x += 8) g.lineTo(x, s - rnd(4, 40));
    g.lineTo(s, s); g.closePath(); g.fill();
  }, 256, true),
  bark: canvasTex((g, s) => {
    g.fillStyle = '#4a3a2c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 300; i++) { g.strokeStyle = `rgba(${rnd(20, 50) | 0},${rnd(15, 35) | 0},10,.7)`; g.lineWidth = rnd(1, 4); const x = Math.random() * s; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + rnd(-8, 8), s); g.stroke(); }
    speckle(g, s, 3000, '90,75,60', 0.3, 2);
  }, 128),
  blades: canvasTex((g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const x = rnd(4, s - 4), h = rnd(s * 0.4, s * 0.98), lean = rnd(-14, 14);
      const v = rnd(0.7, 1.15);
      g.fillStyle = `rgb(${70 * v | 0},${100 * v | 0},${38 * v | 0})`;
      g.beginPath(); g.moveTo(x - 2.5, s); g.quadraticCurveTo(x + lean * 0.3, s - h * 0.6, x + lean, s - h); g.lineTo(x + 2.5, s); g.fill();
    }
  }, 128, false),
  stain: canvasTex((g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) {
      const x = rnd(s * 0.3, s * 0.7), y = rnd(s * 0.3, s * 0.7), r = rnd(s * 0.12, s * 0.3);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(12,12,10,.55)'); gr.addColorStop(1, 'rgba(12,12,10,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }
  }, 128, false),
};

/* ---------- Materialien ---------- */
const MAT = {
  concrete: pbr('concrete', 2.7),
  brick: pbr('brick', 2.5),
  crate: pbr('wood', 0, { mat: { color: new THREE.Color(1.6, 1.45, 1.25) } }),
  metal: pbr('metal', 1.5),
  roof: pbr('roof', 2.5),
  sandbag: new THREE.MeshStandardMaterial({ map: TEX.sandbag, roughness: 1, bumpMap: TEX.sandbag, bumpScale: 0.015 }),
  grass: pbr('grass', 2),
  window: new THREE.MeshStandardMaterial({ map: TEX.window, roughness: 0.06, metalness: 0.5, envMapIntensity: 1.4 }),
  door: new THREE.MeshStandardMaterial({ map: TEX.door, roughness: 0.6, metalness: 0.3 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2e3236, roughness: 0.6, metalness: 0.5 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xd9b23a, roughness: 0.8 }),
  ctrGreen: pbr('container', 2.6),
  ctrRed: pbr('container', 2.6, { map: tintedTex('container', 0x9b3226) }),
  ctrBlue: pbr('container', 2.6, { map: tintedTex('container', 0x2d5a8a) }),
  ctrOrange: pbr('container', 2.6, { map: tintedTex('container', 0xc06a22) }),
};

/* ---------- Boden: Asphalt in der Arena, Hügellandschaft außen ---------- */
const mapMeshes = [];
function withUv2(geo) { geo.setAttribute('uv2', geo.attributes.uv); return geo; }
/* Box mit abgerundeten Kanten und Ecken (r = Radius). Die Rundung bekommt m eigene Segmente,
   die flachen Flächen bleiben flach. tile = Texturgröße in Metern (0 = Textur passt auf jede Fläche). */
function roundedBoxGeo(w, h, d, r, m = 2, tile = 0) {
  r = Math.max(0.0005, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const n = 2 * m + 1, g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const half = [w / 2, h / 2, d / 2], size = [w, h, d];
  const map = (t, a) => { const i = Math.round((t + 0.5) * n), L = half[a]; return i <= m ? -L + r * (i / m) : L - r * ((n - i) / m); };
  const p = [0, 0, 0], inner = [0, 0, 0], dv = [0, 0, 0];
  for (let k = 0; k < pos.count; k++) {
    p[0] = map(pos.getX(k), 0); p[1] = map(pos.getY(k), 1); p[2] = map(pos.getZ(k), 2);
    // Fläche dieser Ecke (vor dem Abrunden) → Texturkoordinaten in Weltgröße
    const nx = Math.abs(nor.getX(k)), ny = Math.abs(nor.getY(k));
    const fa = nx > 0.5 ? 0 : ny > 0.5 ? 1 : 2;
    const ua = fa === 0 ? 2 : 0, va = fa === 1 ? 2 : 1;
    if (tile) uv.setXY(k, (p[ua] + half[ua]) / tile, (p[va] + half[va]) / tile);
    else uv.setXY(k, (p[ua] + half[ua]) / size[ua], (p[va] + half[va]) / size[va]);
    // Auf die Rundung projizieren
    let len = 0;
    for (let a = 0; a < 3; a++) { inner[a] = Math.max(-half[a] + r, Math.min(half[a] - r, p[a])); dv[a] = p[a] - inner[a]; len += dv[a] * dv[a]; }
    len = Math.sqrt(len);
    if (len > 1e-7) {
      pos.setXYZ(k, inner[0] + dv[0] / len * r, inner[1] + dv[1] / len * r, inner[2] + dv[2] / len * r);
      nor.setXYZ(k, dv[0] / len, dv[1] / len, dv[2] / len);
    } else pos.setXYZ(k, p[0], p[1], p[2]);
  }
  return withUv2(g);
}
(function ground() {
  // Asphalt über die ganze Spielfläche (x -62…56, z -62…62)
  const floor = new THREE.Mesh(withUv2(new THREE.PlaneGeometry(118, 124)), pbr('asphalt', 3, {}, 118 / 3, 124 / 3));
  floor.rotation.x = -Math.PI / 2; floor.position.x = -3; floor.receiveShadow = true;
  scene.add(floor); mapMeshes.push(floor);
  // Hügel per Rauschfunktion
  const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, z) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += vnoise(x * f, z * f) * a; f *= 2; a *= 0.5; } return s; };
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Hügel rund um die (quadratische) Karte, im Osten Hafenbecken
  const heightAt = (x, z) => {
    const edge = Math.max(Math.abs(x + 3), Math.abs(z));
    const hills = sstep(68, 200, edge) * (fbm(x * 0.008 + 3, z * 0.008) * 70 + 4) + sstep(63, 85, edge) * fbm(x * 0.06, z * 0.06) * 2;
    const sea = sstep(54, 62, x);
    return hills * (1 - sea) - 6 * sea - 0.06;
  };
  const geo = new THREE.PlaneGeometry(1000, 1000, 120, 120); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals(); withUv2(geo);
  // Einfacheres Material für die weite Landschaft (schneller)
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: ptex('grass_diff.jpg', true, 250, 250), color: new THREE.Color(0.62, 0.85, 0.45) }));
  scene.add(terrain);
  window.terrainHeight = heightAt;
})();
function decal(x, z, w, d, mat, rot = 0, y = 0.012) {
  const m = new THREE.Mesh(withUv2(new THREE.PlaneGeometry(w, d)), mat);
  m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, y, z); m.receiveShadow = true;
  scene.add(m); return m;
}

