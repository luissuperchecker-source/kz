'use strict';
/* ======================= Spielfiguren ======================= */
function nameSprite(name, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(name, 128, 32);
  g.fillStyle = color; g.fillText(name, 128, 32);
  const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthWrite: false }));
  s.scale.set(1.8, 0.45, 1); s.position.y = 2.25;
  return s;
}
// Tarnmuster für die Uniform (Sand-/Brauntöne, einmal erzeugt, von allen Figuren genutzt)
const CAMO_TEX = canvasTex((g, s) => {
  g.fillStyle = '#8b7d5e'; g.fillRect(0, 0, s, s);
  const cols = ['#6b5f45', '#a39272', '#4f4636', '#7d7a5a', '#5d5a44'];
  for (let i = 0; i < 90; i++) {
    g.fillStyle = cols[i % cols.length]; g.beginPath();
    const x = Math.random() * s, y = Math.random() * s, r = rnd(6, 22);
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, rr = r * rnd(0.6, 1.3); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7); }
    g.fill();
  }
  speckle(g, s, 5000, '20,18,12', 0.18, 1.5);
}, 256);
const SOLDIER = {
  camo: new THREE.MeshStandardMaterial({ map: CAMO_TEX, roughness: 0.95 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xc69676, roughness: 0.65 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x3a2f24, roughness: 0.75 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x2c2b26, roughness: 0.9 }),
  strap: new THREE.MeshStandardMaterial({ color: 0x4a4434, roughness: 0.9 }),
  goggle: new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.1, metalness: 0.7 }),
  helmet: new THREE.MeshStandardMaterial({ color: 0x6b6248, roughness: 0.8 }),
};
const TEAM_COLORS = ['#d0402f', '#2f6fd6'];
// Zusätzliche Materialien für Gesicht und Ausrüstung
Object.assign(SOLDIER, {
  eyeWhite: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.3 }),
  iris: new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.2 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x2a1f16, roughness: 0.9 }),
  lip: new THREE.MeshStandardMaterial({ color: 0x8a4a3e, roughness: 0.6 }),
  sole: new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 0.9 }),
  buckle: new THREE.MeshStandardMaterial({ color: 0x9a8a5a, roughness: 0.35, metalness: 0.8 }),
  cap: new THREE.MeshStandardMaterial({ map: CAMO_TEX, roughness: 0.9, color: new THREE.Color(0.8, 0.8, 0.8) }),
  beanie: new THREE.MeshStandardMaterial({ color: 0x2c2f2a, roughness: 1 }),
  shades: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.05, metalness: 0.9 }),
});
// Hautfarben (je Spieler zufällig, aber fest)
const SKIN_MATS = [0xf3cfae, 0xe0ac7f, 0xc68a5c, 0x9a6440, 0x6e4529].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.62 }));
const HAIR_MATS = [0x2a1f16, 0x5a3a22, 0x111111, 0x8a6a3a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); }
// Spezialeinheit-Look: schwarze Uniform mit feinem Ripstop-Gewebe, schwarze Ausrüstung
const TAC_TEX = canvasTex((g, s) => {
  g.fillStyle = '#26282b'; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
  for (let i = 0; i < s; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
  speckle(g, s, 6000, '70,72,76', 0.25, 1.2); speckle(g, s, 3000, '0,0,0', 0.3, 1.5);
  for (let i = 0; i < 25; i++) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(Math.random() * s, Math.random() * s, rnd(10, 40), rnd(3, 10)); }   // leichte Abnutzung
}, 128);
const TAC = {
  fabric: new THREE.MeshStandardMaterial({ map: TAC_TEX, roughness: 0.92 }),
  vest: new THREE.MeshStandardMaterial({ map: TAC_TEX, color: new THREE.Color(0.75, 0.75, 0.78), roughness: 0.85 }),
  gear: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.8 }),
  pad: new THREE.MeshStandardMaterial({ color: 0x0f1011, roughness: 0.5, metalness: 0.1 }),
  helmet: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.55, metalness: 0.15 }),
  mask: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.95 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.6 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x0c1a22, roughness: 0.03, metalness: 0.95, envMapIntensity: 2 }),
};
function makeAvatar(p) {
  const g = new THREE.Group();
  const col = p.team !== undefined && p.team >= 0 ? TEAM_COLORS[p.team] : p.color;
  // Teamfarbe nur als Erkennungszeichen (Armbinden, Abzeichen, Helmband), leicht leuchtend
  const teamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(col), roughness: 0.5, emissive: new THREE.Color(col), emissiveIntensity: 0.35 });
  const S = SOLDIER, T = TAC;
  const h = hashStr(String(p.id || p.name));
  const skin = SKIN_MATS[h % SKIN_MATS.length];
  const gogglesDown = ((h >> 5) % 10) < 3;   // manche tragen die Brille vor den Augen
  const body = { pid: p.id, head: false }, headHit = { pid: p.id, head: true };
  // ---- Beine ----
  const knees = [];
  const leg = x => {
    const side = x > 0 ? 1 : -1;
    const hp = new THREE.Group(); hp.position.set(x, 0.92, 0); g.add(hp);
    const thigh = [limbPart([0, 0.03, 0], [0, -0.45, -0.02], 0.13, 0.1, T.fabric)];
    if (side > 0) thigh.push(   // Beinholster mit Pistole (rechts)
      B(0.06, 0.2, 0.12, T.gear, 0.13, -0.2, -0.01), B(0.035, 0.09, 0.05, GUN_MATS.poly, 0.13, -0.05, 0.0, 0.25),
      B(0.03, 0.03, 0.14, T.gear, 0.1, -0.12, 0.0), B(0.03, 0.03, 0.14, T.gear, 0.1, -0.28, 0.0));
    else thigh.push(B(0.09, 0.15, 0.08, T.gear, -0.12, -0.18, 0.0), B(0.095, 0.03, 0.085, T.gear, -0.12, -0.1, 0.0));   // Magazintasche
    hp.add(partsToGroup(thigh, true, body));
    const k = new THREE.Group(); k.position.set(0, -0.45, -0.02); hp.add(k);
    k.add(partsToGroup([
      SPH(0.092, T.fabric, 0, 0, 0),
      SPH(0.082, T.pad, 0, -0.01, -0.07, 1.05, 1.15, 0.55),                    // Knieschoner
      limbPart([0, 0, 0], [0, -0.33, 0.015], 0.092, 0.074, T.fabric),
      B(0.15, 0.2, 0.17, T.boot, 0, -0.32, 0.01),                               // hoher Einsatzstiefel
      B(0.14, 0.1, 0.29, T.boot, 0, -0.395, -0.05),
      B(0.155, 0.035, 0.31, S.sole, 0, -0.455, -0.05),
      B(0.05, 0.15, 0.012, GUN_MATS.poly, 0, -0.35, -0.08),
    ], true, body));
    knees.push(k);
    return hp;
  };
  const hipL = leg(-0.115), hipR = leg(0.115);
  // ---- Oberkörper: Plattenträger mit Taschen, Funkgerät, Rucksack ----
  const upper = new THREE.Group(); g.add(upper);
  upper.add(partsToGroup([
    B(0.36, 0.2, 0.25, T.fabric, 0, 0.95, 0),
    B(0.4, 0.07, 0.28, T.gear, 0, 1.04, 0), B(0.06, 0.045, 0.02, S.buckle, 0, 1.04, -0.145),         // Einsatzgürtel
    B(0.07, 0.1, 0.06, T.gear, 0.17, 0.99, -0.1), B(0.07, 0.1, 0.06, T.gear, -0.17, 0.99, -0.1),   // Gürteltaschen
    limbPart([0, 1.02, 0], [0, 1.25, 0], 0.165, 0.2, T.fabric),
    SPH(0.23, T.fabric, 0, 1.36, 0, 1.12, 0.85, 0.66),
    B(0.45, 0.36, 0.33, T.vest, 0, 1.3, 0),                                  // Plattenträger
    B(0.48, 0.13, 0.3, T.vest, 0, 1.15, 0),                                  // Kummerbund
    B(0.09, 0.05, 0.34, T.vest, 0.15, 1.5, 0), B(0.09, 0.05, 0.34, T.vest, -0.15, 1.5, 0),
    // Magazintaschen vorne (3 nebeneinander, mit Klappen) + Admin-Tasche darüber
    B(0.1, 0.14, 0.07, T.gear, -0.13, 1.2, -0.19), B(0.1, 0.14, 0.07, T.gear, 0, 1.2, -0.19), B(0.1, 0.14, 0.07, T.gear, 0.13, 1.2, -0.19),
    B(0.1, 0.03, 0.075, T.gear, -0.13, 1.28, -0.19), B(0.1, 0.03, 0.075, T.gear, 0, 1.28, -0.19), B(0.1, 0.03, 0.075, T.gear, 0.13, 1.28, -0.19),
    B(0.22, 0.1, 0.05, T.gear, 0, 1.39, -0.185), B(0.1, 0.035, 0.01, teamMat, 0, 1.4, -0.214),     // Namensschild in Teamfarbe
    B(0.06, 0.11, 0.05, GUN_MATS.poly, 0.2, 1.38, -0.17), CY(0.005, 0.26, GUN_MATS.poly, 0.215, 1.56, -0.16),
    B(0.32, 0.36, 0.14, T.gear, 0, 1.3, 0.24), B(0.26, 0.12, 0.06, T.gear, 0, 1.18, 0.32),        // Rückentasche
    CY(0.012, 0.14, GUN_MATS.poly, -0.12, 1.5, 0.24),                                             // Trinkschlauch
    SPH(0.1, T.fabric, 0.27, 1.46, 0, 1, 0.9, 1), SPH(0.1, T.fabric, -0.27, 1.46, 0, 1, 0.9, 1),
    B(0.014, 0.085, 0.11, teamMat, 0.37, 1.4, 0), B(0.014, 0.085, 0.11, teamMat, -0.37, 1.4, 0),     // Schulterabzeichen
    B(0.22, 0.05, 0.19, T.fabric, 0, 1.53, 0), CY(0.066, 0.12, T.mask, 0, 1.58, 0),
  ], true, body));
  // ---- Arme + Waffe (mit Ellbogenschonern und Armbinden in Teamfarbe) ----
  const aim = new THREE.Group(); aim.position.set(0, 1.45, 0); upper.add(aim);
  const go = [0.11, -0.04, -0.2], ref = makeGun(0);
  const grip = [ref.grip[0] + go[0], ref.grip[1] + go[1], ref.grip[2] + go[2]];
  const fore = [ref.foreNear[0] + go[0], ref.foreNear[1] + go[1], ref.foreNear[2] + go[2]];
  const elbowR = [0.27, -0.25, 0.0], elbowL = [-0.17, -0.22, -0.24];
  const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const hand = (pt, rx) => [B(0.07, 0.085, 0.095, S.glove, pt[0], pt[1], pt[2], rx), B(0.07, 0.03, 0.06, S.glove, pt[0], pt[1] - 0.035, pt[2] - 0.05, rx)];
  const shR = [0.27, 0.02, 0], shL = [-0.27, 0.02, 0];
  // Arme zum Mopedfahren: beide Hände an den Lenkergriffen (im Oberkörper-Raum, für ~24° Vorbeugen)
  const rideArms = new THREE.Group(); rideArms.visible = false; upper.add(rideArms);
  const rArm = sx => {
    const sh = [sx * 0.27, 1.47, 0], el = [sx * 0.35, 1.29, -0.35], hd = [sx * 0.34, 1.36, -0.66];
    return [limbPart(sh, el, 0.088, 0.076, T.fabric), SPH(0.078, T.pad, ...el, 1, 1, 1),
      limbPart(mid(sh, el, 0.25), mid(sh, el, 0.42), 0.092, 0.09, teamMat),
      limbPart(el, hd, 0.072, 0.055, T.fabric), B(0.08, 0.075, 0.1, S.glove, hd[0], hd[1], hd[2] - 0.02, -0.2)];
  };
  rideArms.add(partsToGroup([...rArm(1), ...rArm(-1)], true, body));
  const gunArms = partsToGroup([
    limbPart(shR, elbowR, 0.088, 0.076, T.fabric), SPH(0.078, T.pad, ...elbowR, 1, 1, 1),
    limbPart(mid(shR, elbowR, 0.25), mid(shR, elbowR, 0.42), 0.092, 0.09, teamMat),        // Armbinde
    limbPart(elbowR, [grip[0] + 0.01, grip[1] - 0.01, grip[2] + 0.05], 0.072, 0.055, T.fabric),
    ...hand(grip, -0.3),
    limbPart(shL, elbowL, 0.088, 0.076, T.fabric), SPH(0.078, T.pad, ...elbowL, 1, 1, 1),
    limbPart(mid(shL, elbowL, 0.25), mid(shL, elbowL, 0.42), 0.092, 0.09, teamMat),
    limbPart(elbowL, [fore[0] - 0.01, fore[1] - 0.05, fore[2] + 0.04], 0.072, 0.055, T.fabric),
    ...hand([fore[0], fore[1] - 0.045, fore[2]], 0),
  ], true, body);
  aim.add(gunArms);
  const gunHolder = new THREE.Group(); aim.add(gunHolder);
  // ---- Kopf: Sturmhaube (nur Augenpartie frei), Helm mit Brille und Nachtsicht-Halterung ----
  const head = new THREE.Group(); head.position.set(0, 1.6, 0); upper.add(head);
  const fz = -0.112;
  const face = [
    SPH(0.12, T.mask, 0, 0.13, 0, 0.93, 1.08, 1.0),                           // Sturmhaube
    SPH(0.097, T.mask, 0, 0.065, -0.02, 0.9, 0.72, 0.98),
    SPH(0.032, T.mask, 0.112, 0.12, 0.005, 0.45, 1, 0.8), SPH(0.032, T.mask, -0.112, 0.12, 0.005, 0.45, 1, 0.8),
    B(0.03, 0.05, 0.04, T.mask, 0, 0.112, fz - 0.012, -0.25),
    B(0.16, 0.05, 0.03, skin, 0, 0.142, fz + 0.004),                            // Augenschlitz (Haut)
  ];
  if (gogglesDown) face.push(B(0.19, 0.06, 0.05, T.lens, 0, 0.145, fz - 0.014), B(0.23, 0.02, 0.2, T.gear, 0, 0.145, -0.02));
  else face.push(
    SPH(0.016, S.eyeWhite, 0.04, 0.143, fz - 0.008, 1.15, 0.65, 0.5), SPH(0.016, S.eyeWhite, -0.04, 0.143, fz - 0.008, 1.15, 0.65, 0.5),
    SPH(0.0085, S.iris, 0.04, 0.143, fz - 0.015), SPH(0.0085, S.iris, -0.04, 0.143, fz - 0.015));
  face.push(
    { geo: new THREE.SphereGeometry(0.162, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), mat: T.helmet, p: [0, 0.16, 0.012], r: [0, 0, 0], s: [1.05, 0.98, 1.13] },
    { geo: new THREE.CylinderGeometry(0.171, 0.173, 0.022, 22, 1, true), mat: teamMat, p: [0, 0.185, 0.012], r: [0, 0, 0], s: [1.02, 1, 1.1] },   // Helmband
    B(0.012, 0.035, 0.12, T.gear, 0.16, 0.2, 0.0), B(0.012, 0.035, 0.12, T.gear, -0.16, 0.2, 0.0),        // Seitenschienen
    B(0.05, 0.06, 0.045, GUN_MATS.metal, 0, 0.24, -0.175),                                               // Nachtsicht-Halterung
    B(0.012, 0.11, 0.012, T.gear, 0.105, 0.06, -0.03), B(0.012, 0.11, 0.012, T.gear, -0.105, 0.06, -0.03),
    SPH(0.035, T.gear, 0.12, 0.13, 0.02, 0.6, 1, 1), SPH(0.035, T.gear, -0.12, 0.13, 0.02, 0.6, 1, 1),  // Gehörschutz
  );
  if (!gogglesDown) face.push(B(0.19, 0.055, 0.05, T.lens, 0, 0.27, -0.15, 0.35), B(0.21, 0.02, 0.1, T.gear, 0, 0.27, -0.1, 0.35));   // Brille hochgeschoben
  head.add(partsToGroup(face, true, headHit));
  const label = nameSprite(p.name, col); g.add(label);
  g.rotation.order = 'YXZ';
  g.userData.pid = p.id;
  scene.add(g);
  const a = { g, pivot: aim, head, upper, hipL, hipR, knees, label, gunHolder, gunW: -1, rideArms, gunArms, shoulderL: new THREE.Group(), parts: [],
    shown: false, spd: 0, phase: 0, lx: null, crouchT: 0, kick: 0 };
  setAvatarGun(a, p.w === undefined ? 0 : p.w);
  return a;
}
// Welche Waffe die Figur in der Hand hält (wird über das Netzwerk mitgeschickt)
function setAvatarGun(a, w) {
  if (a.gunW === w || !WEAPONS[w]) return;
  a.gunW = w;
  while (a.gunHolder.children.length) a.gunHolder.remove(a.gunHolder.children[0]);
  const gi = makeGun(w);
  a.gunHolder.add(partsToGroup(offsetParts(gi.parts, [0.11, -0.04, -0.2]), true, { pid: a.g.userData.pid, head: false }));
  a.parts = [];
  a.g.traverse(o => { if (o.isMesh && o.userData.pid) a.parts.push(o); });
}
const avatars = {};

/* ======================= Waffe in der Hand ======================= */
const viewGun = new THREE.Group();
viewGun.scale.setScalar(0.8);
camera.add(viewGun);
const muzzle = new THREE.Object3D();
const flashTex = canvasTex((g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,210,90,.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = gr; g.beginPath();
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = (i % 2 ? 0.22 : 0.5) * s; g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); }
  g.fill();
}, 128, false);
const flashMat = new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const flash = new THREE.Sprite(flashMat);
flash.scale.set(0.45, 0.45, 1); flash.visible = false; muzzle.add(flash);
const flashLight = new THREE.PointLight(0xffc070, 0, 10, 2);
flashLight.position.set(0.2, -0.1, -0.9); camera.add(flashLight);
let flashT = 0;
const WOOD_TEX = canvasTex((g, s) => {
  g.fillStyle = '#6a4326'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${rnd(30, 70) | 0},${rnd(15, 35) | 0},5,${rnd(0.15, 0.45)})`; g.lineWidth = rnd(0.5, 2.5);
    const y = Math.random() * s; g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * rnd(1, 4));
    g.stroke();
  }
}, 128);
// Realistische Oberflächen: brüniertes Metall mit Schliff, Kratzern und abgewetzten Stellen; genarbter Kunststoff
const GUN_TEX = canvasTex((g, s) => {
  g.fillStyle = '#4a4d52'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 400; i++) { g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${rnd(0.02, 0.07)})`; g.lineWidth = 1; const y = Math.random() * s; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + rnd(-2, 2)); g.stroke(); }
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(200,205,210,${rnd(0.15, 0.4)})`; g.lineWidth = rnd(0.5, 1.2); const x = Math.random() * s, y = Math.random() * s, a = Math.random() * 6.28, l = rnd(4, 18); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  speckle(g, s, 1500, '170,175,180', 0.18, 1.5); speckle(g, s, 2500, '0,0,0', 0.2, 1.5);
}, 256);
const POLY_TEX = canvasTex((g, s) => {
  g.fillStyle = '#4e5054'; g.fillRect(0, 0, s, s);
  speckle(g, s, 9000, '0,0,0', 0.3, 1.6); speckle(g, s, 4000, '255,255,255', 0.08, 1.2);
}, 128);
const GRIP_TEX = canvasTex((g, s) => {
  g.fillStyle = '#3a3c40'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 6) for (let x = (y / 6) % 2 * 3; x < s; x += 6) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, y, 3, 3); }
}, 64);
const GUN_MATS = {
  metal: new THREE.MeshStandardMaterial({ map: GUN_TEX, color: 0xc4c8ce, roughness: 0.42, metalness: 0.85 }),
  metalDS: new THREE.MeshStandardMaterial({ map: GUN_TEX, color: 0xc4c8ce, roughness: 0.42, metalness: 0.85, side: THREE.DoubleSide }),
  polyGrip: new THREE.MeshStandardMaterial({ map: GRIP_TEX, color: 0xb0b2b6, roughness: 0.9, metalness: 0 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x101011, roughness: 0.95 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x6a6f76, roughness: 0.28, metalness: 0.95 }),
  poly: new THREE.MeshStandardMaterial({ map: POLY_TEX, color: 0x8a8c90, roughness: 0.78, metalness: 0.05 }),
  tan: new THREE.MeshStandardMaterial({ map: POLY_TEX, color: new THREE.Color(2.4, 1.85, 0.95), roughness: 0.75, metalness: 0.05 }),
  wood: new THREE.MeshStandardMaterial({ map: WOOD_TEX, roughness: 0.45, metalness: 0 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1d3a55, roughness: 0.03, metalness: 0.9, envMapIntensity: 2 }),
  red: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  shell: new THREE.MeshStandardMaterial({ color: 0xa3201a, roughness: 0.5 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc09a40, roughness: 0.3, metalness: 0.9 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x2c2b26, roughness: 0.9 }),
};
/* --- Bausteine: Teile werden gesammelt und pro Material zu einem Objekt verschmolzen (flüssiger) --- */
const _V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
// Kästchen mit abgerundeten Kanten (Radius ~30 % der kleinsten Seite, max. 9 cm)
// (sehr kleine Teile: einfache Abschrägung statt Rundung → viel weniger Flächen)
const B = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const mn = Math.min(w, h, d);
  return { geo: mn < 0.015 ? withUv2(new THREE.BoxGeometry(w, h, d)) : roundedBoxGeo(w, h, d, Math.min(0.09, mn * 0.3), mn < 0.05 ? 1 : 2, 0.25), mat, p: [x, y, z], r: [rx, ry, rz] };
};
const C = (r1, r2, len, mat, x, y, z, seg = 18, open = false) => ({ geo: new THREE.CylinderGeometry(r1, r2, len, seg, 1, open), mat, p: [x, y, z], r: [Math.PI / 2, 0, 0] }); // entlang z
const CY = (r, len, mat, x, y, z, seg = 16) => ({ geo: new THREE.CylinderGeometry(r, r, len, seg), mat, p: [x, y, z], r: [0, 0, 0] });          // senkrecht
const CX = (r, len, mat, x, y, z, seg = 16) => ({ geo: new THREE.CylinderGeometry(r, r, len, seg), mat, p: [x, y, z], r: [0, 0, Math.PI / 2] }); // entlang x
// Kugel; kleine Kugeln (Augen usw.) mit weniger Flächen, damit es flüssig bleibt
const SPH = (r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => ({ geo: new THREE.SphereGeometry(r, r < 0.03 ? 8 : r < 0.08 ? 12 : 18, r < 0.03 ? 6 : r < 0.08 ? 9 : 12), mat, p: [x, y, z], r: [0, 0, 0], s: [sx, sy, sz] });
function limbPart(a, b, r1, r2, mat, seg = 16) {
  const A = _V(a), Bv = _V(b), len = A.distanceTo(Bv);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return { geo: new THREE.CylinderGeometry(r2, r1, len, seg), mat, p: A.add(Bv).multiplyScalar(0.5).toArray(), r: [e.x, e.y, e.z] };
}
function offsetParts(parts, d) { return parts.map(pt => Object.assign({}, pt, { p: [pt.p[0] + d[0], pt.p[1] + d[1], pt.p[2] + d[2]] })); }
function partsToGroup(parts, shadow = false, userData = null) {
  const byMat = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const pt of parts) {
    const g = pt.geo;
    e.set(pt.r[0], pt.r[1], pt.r[2]); q.setFromEuler(e);
    m4.compose(_V(pt.p), q, pt.s ? _V(pt.s) : new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m4);
    if (!g.attributes.uv2) g.setAttribute('uv2', g.attributes.uv);
    if (!byMat.has(pt.mat)) byMat.set(pt.mat, []);
    byMat.get(pt.mat).push(g);
  }
  const grp = new THREE.Group(); grp.userData.meshes = [];
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(geos), mat);
    m.castShadow = shadow; m.receiveShadow = shadow;
    if (userData) m.userData = Object.assign({}, userData);
    grp.add(m); grp.userData.meshes.push(m);
  }
  return grp;
}

/* --- Die vier Waffen (Maße in Metern, Lauf zeigt nach -z) --- */
function makeGun(w) {
  const { metal, metalDS, steel, poly, tan, wood, glass, red, shell, brass, polyGrip, rubber } = GUN_MATS;
  const P = [];
  // Markierungen für bewegliche Teile (Nachlade-Animation)
  const M = pt => (pt.mag = true, pt), PU = pt => (pt.pump = true, pt), BO = pt => (pt.bolt = true, pt);
  let info;
  if (w === 0) { // Sturmgewehr: Ober-/Unterschale, Schiene, M-LOK-Handschutz, Rotpunkt, Mündungsbremse
    P.push(
      B(0.056, 0.062, 0.3, metal, 0, 0.03, -0.03),                                  // Oberschale
      B(0.05, 0.055, 0.19, metal, 0, -0.025, 0.0),                                  // Unterschale
      B(0.054, 0.05, 0.085, metal, 0, -0.06, -0.065),                               // Magazinschacht
      B(0.003, 0.022, 0.065, steel, 0.0295, 0.03, 0.0),                             // Staubschutzdeckel
      CX(0.011, 0.03, metal, 0.037, 0.045, 0.07),                                   // Schließhilfe
      B(0.052, 0.012, 0.03, metal, 0, 0.066, 0.118), B(0.012, 0.012, 0.04, metal, 0.03, 0.066, 0.13),  // Ladehebel
      B(0.03, 0.01, 0.64, metal, 0, 0.066, -0.17));                                 // Picatinny-Schiene
    for (let i = 0; i < 18; i++) P.push(B(0.034, 0.007, 0.012, metal, 0, 0.074, 0.13 - i * 0.036));
    P.push(B(0.068, 0.068, 0.33, metal, 0, 0.03, -0.345));                          // Handschutz
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) P.push(B(0.004, 0.014, 0.04, poly, s * 0.034, 0.03, -0.24 - i * 0.07));   // M-LOK-Schlitze
    P.push(
      C(0.011, 0.011, 0.2, steel, 0, 0.03, -0.6),                                   // Lauf
      C(0.017, 0.017, 0.075, metal, 0, 0.03, -0.735),                               // Mündungsbremse
      B(0.038, 0.008, 0.014, poly, 0, 0.03, -0.72), B(0.038, 0.008, 0.014, poly, 0, 0.03, -0.75),
      B(0.022, 0.012, 0.02, metal, 0, 0.078, -0.47), B(0.006, 0.03, 0.006, metal, 0, 0.097, -0.47),   // Klappkorn
      B(0.03, 0.026, 0.016, metal, 0, 0.087, 0.1),                                  // Klappkimme
      B(0.034, 0.022, 0.06, metal, 0, 0.087, -0.04), C(0.024, 0.024, 0.08, metalDS, 0, 0.115, -0.04, 18, true),   // Rotpunkt-Montage + Röhre
      CY(0.006, 0.014, metal, 0.028, 0.115, -0.04), B(0.004, 0.004, 0.002, red, 0, 0.115, -0.01),
      M(B(0.044, 0.065, 0.07, metal, 0, -0.105, -0.068, 0.1)), M(B(0.044, 0.06, 0.07, metal, 0, -0.16, -0.058, 0.22)),   // gebogenes Magazin
      M(B(0.044, 0.055, 0.07, metal, 0, -0.208, -0.042, 0.36)), M(B(0.05, 0.014, 0.078, poly, 0, -0.238, -0.03, 0.36)),
      B(0.036, 0.11, 0.046, poly, 0, -0.098, 0.105, -0.35), B(0.037, 0.06, 0.03, polyGrip, 0, -0.105, 0.11, -0.35),   // Pistolengriff
      B(0.006, 0.008, 0.07, metal, 0, -0.058, 0.035), B(0.006, 0.02, 0.006, metal, 0, -0.05, 0.068),   // Abzugsbügel
      B(0.004, 0.024, 0.006, steel, 0, -0.04, 0.03),                                // Abzug
      C(0.017, 0.017, 0.17, metal, 0, 0.018, 0.2), C(0.021, 0.021, 0.014, metal, 0, 0.018, 0.12),   // Puffer + Schlossmutter
      B(0.048, 0.078, 0.18, poly, 0, -0.005, 0.31), B(0.04, 0.02, 0.12, poly, 0, 0.04, 0.3),   // Schaft + Wangenauflage
      B(0.052, 0.096, 0.02, rubber, 0, -0.01, 0.405),                               // Schaftkappe
      { geo: new THREE.TorusGeometry(0.012, 0.003, 6, 12), mat: steel, p: [0, -0.05, 0.36], r: [0, Math.PI / 2, 0] });   // Riemenöse
    info = { len: 0.775, muzzleY: 0.03, grip: [0, -0.1, 0.1], fore: [0, -0.01, -0.33], foreNear: [0, -0.01, -0.22], sight: 0.115 };
  } else if (w === 1) { // Pumpgun: Laufschiene, Seitensattel mit Patronen, Geisterring-Visier
    P.push(B(0.058, 0.076, 0.25, metal, 0, 0.01, 0.0), B(0.002, 0.03, 0.085, poly, 0.0295, 0.0, 0.0),
      B(0.003, 0.02, 0.07, steel, -0.0295, 0.02, -0.02),                            // Auswurf
      C(0.018, 0.018, 0.58, steel, 0, 0.035, -0.41), B(0.012, 0.006, 0.56, metal, 0, 0.056, -0.41),   // Lauf + Laufschiene
      C(0.016, 0.016, 0.48, metal, 0, -0.008, -0.36), C(0.02, 0.02, 0.03, metal, 0, -0.008, -0.6),
      PU(B(0.058, 0.05, 0.2, wood, 0, -0.012, -0.3)));
    for (let i = 0; i < 6; i++) P.push(PU(B(0.062, 0.052, 0.006, poly, 0, -0.012, -0.22 - i * 0.03)));
    P.push(CY(0.004, 0.008, brass, 0, 0.062, -0.69),                                // Korn
      B(0.026, 0.024, 0.014, metal, 0, 0.062, 0.08), B(0.008, 0.018, 0.012, metal, 0.009, 0.072, 0.08), B(0.008, 0.018, 0.012, metal, -0.009, 0.072, 0.08),   // Geisterring
      B(0.048, 0.1, 0.28, wood, 0, -0.035, 0.25, -0.12), B(0.05, 0.11, 0.022, rubber, 0, -0.06, 0.39, -0.12),
      B(0.006, 0.008, 0.065, metal, 0, -0.04, 0.05), B(0.006, 0.02, 0.006, metal, 0, -0.03, 0.08), B(0.004, 0.025, 0.006, steel, 0, -0.025, 0.045),
      B(0.004, 0.05, 0.12, poly, 0.032, 0.012, -0.05));                             // Seitensattel
    for (let i = 0; i < 4; i++) P.push(CY(0.009, 0.045, shell, 0.04, 0.012, -0.09 + i * 0.024), CY(0.0095, 0.01, brass, 0.04, -0.015, -0.09 + i * 0.024));
    P.push({ geo: new THREE.TorusGeometry(0.012, 0.003, 6, 12), mat: steel, p: [0, -0.1, 0.33], r: [0, Math.PI / 2, 0] });
    info = { len: 0.71, muzzleY: 0.035, grip: [0, -0.07, 0.09], fore: [0, -0.03, -0.3], foreNear: [0, -0.03, -0.25], sight: 0.07 };
  } else if (w === 2) { // Scharfschützengewehr: kannelierter Lauf, Mündungsbremse, großes Zielfernrohr, Zweibein
    P.push(B(0.056, 0.06, 0.3, metal, 0, 0.02, 0), C(0.016, 0.012, 0.72, steel, 0, 0.025, -0.5));
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; P.push(B(0.004, 0.004, 0.5, metal, Math.cos(a) * 0.0145, 0.025 + Math.sin(a) * 0.0145, -0.45)); }   // Kanneluren
    P.push(B(0.042, 0.036, 0.075, metal, 0, 0.025, -0.895));
    for (const zz of [-0.88, -0.9, -0.92]) P.push(B(0.046, 0.008, 0.01, poly, 0, 0.025, zz));   // Bremsöffnungen
    P.push(
      B(0.072, 0.07, 0.38, tan, 0, -0.015, -0.27), B(0.06, 0.06, 0.16, tan, 0, -0.02, 0.08),
      B(0.04, 0.1, 0.06, tan, 0, -0.08, 0.14, -0.3), B(0.041, 0.06, 0.04, polyGrip, 0, -0.085, 0.145, -0.3),
      B(0.056, 0.12, 0.3, tan, 0, -0.03, 0.32), B(0.05, 0.035, 0.16, tan, 0, 0.045, 0.3), CY(0.005, 0.03, steel, 0, 0.025, 0.25),   // Wangenauflage verstellbar
      B(0.058, 0.13, 0.022, rubber, 0, -0.03, 0.475),
      M(B(0.04, 0.05, 0.08, metal, 0, -0.05, -0.02)),
      B(0.006, 0.008, 0.06, metal, 0, -0.04, 0.09), B(0.004, 0.024, 0.006, steel, 0, -0.03, 0.08),
      BO(CX(0.006, 0.06, steel, 0.05, 0.025, 0.1)), BO(SPH(0.013, steel, 0.08, 0.02, 0.1)),
      B(0.05, 0.03, 0.018, metal, 0, 0.06, -0.1), B(0.05, 0.03, 0.018, metal, 0, 0.06, 0.06),   // Ringe
      C(0.019, 0.019, 0.26, metal, 0, 0.09, -0.02), C(0.019, 0.031, 0.08, metal, 0, 0.09, -0.19),
      C(0.025, 0.022, 0.07, metal, 0, 0.09, 0.13), C(0.029, 0.029, 0.004, glass, 0, 0.09, -0.231),
      C(0.021, 0.021, 0.004, glass, 0, 0.09, 0.167),
      CY(0.013, 0.03, metal, 0, 0.122, -0.02), CY(0.015, 0.006, steel, 0, 0.138, -0.02),   // Höhenturm
      CX(0.013, 0.03, metal, 0.033, 0.09, -0.02), CX(0.015, 0.006, steel, 0.049, 0.09, -0.02),   // Seitenturm
      C(0.006, 0.006, 0.25, metal, 0.02, -0.06, -0.33), C(0.006, 0.006, 0.25, metal, -0.02, -0.06, -0.33),
      B(0.05, 0.02, 0.03, metal, 0, -0.05, -0.45));                                 // Zweibein-Halter
    info = { len: 0.935, muzzleY: 0.025, grip: [0, -0.09, 0.14], fore: [0, -0.04, -0.25], foreNear: [0, -0.04, -0.2], sight: 0.09 };
  } else if (w === 4) { // Maschinenpistole mit Schalldämpfer
    P.push(B(0.055, 0.065, 0.24, metal, 0, 0.02, -0.02), C(0.02, 0.02, 0.12, poly, 0, 0.025, -0.2),
      C(0.025, 0.025, 0.2, metal, 0, 0.025, -0.36), M(B(0.034, 0.2, 0.05, metal, 0, -0.13, -0.06)),
      B(0.036, 0.1, 0.045, poly, 0, -0.08, 0.08, -0.3), B(0.03, 0.08, 0.035, poly, 0, -0.05, -0.16),
      C(0.006, 0.006, 0.18, steel, 0.02, 0.0, 0.22), C(0.006, 0.006, 0.18, steel, -0.02, 0.0, 0.22),
      B(0.05, 0.08, 0.015, poly, 0, -0.01, 0.31), B(0.022, 0.015, 0.01, metal, 0, 0.06, 0.07),
      B(0.006, 0.02, 0.006, metal, 0, 0.065, -0.12), B(0.004, 0.022, 0.006, steel, 0, -0.03, 0.03),
      B(0.006, 0.012, 0.05, metal, 0, -0.045, 0.035));
    info = { len: 0.46, muzzleY: 0.025, grip: [0, -0.08, 0.08], fore: [0, -0.09, -0.16], foreNear: [0, -0.09, -0.16], sight: 0.072 };
  } else if (w === 5) { // Revolver
    P.push(B(0.03, 0.05, 0.12, steel, 0, 0.02, 0), M(C(0.028, 0.028, 0.055, steel, 0, 0.02, 0.0, 8)),
      C(0.012, 0.012, 0.17, steel, 0, 0.035, -0.13), B(0.012, 0.012, 0.17, steel, 0, 0.05, -0.13),
      B(0.01, 0.025, 0.02, metal, 0, 0.055, 0.06), B(0.032, 0.1, 0.045, wood, 0, -0.05, 0.065, -0.35),
      B(0.005, 0.01, 0.04, steel, 0, -0.012, 0.015), B(0.006, 0.012, 0.006, steel, 0, 0.062, -0.205));
    info = { len: 0.22, muzzleY: 0.035, grip: [0, -0.05, 0.065], fore: [-0.012, -0.07, 0.055], foreNear: [-0.012, -0.07, 0.055], sight: 0.064 };
  } else if (w === 6) { // Kampfgewehr mit Zielfernrohr
    P.push(B(0.058, 0.065, 0.32, metal, 0, 0.025, -0.03), B(0.068, 0.07, 0.36, tan, 0, 0.025, -0.36),
      C(0.014, 0.012, 0.3, steel, 0, 0.03, -0.68), B(0.035, 0.035, 0.06, metal, 0, 0.03, -0.85),
      M(B(0.045, 0.12, 0.08, metal, 0, -0.1, -0.06, 0.12)), B(0.038, 0.11, 0.048, poly, 0, -0.09, 0.11, -0.35),
      B(0.052, 0.09, 0.26, tan, 0, -0.01, 0.3), B(0.054, 0.1, 0.02, poly, 0, -0.015, 0.44),
      B(0.004, 0.025, 0.006, steel, 0, -0.04, 0.03), B(0.006, 0.012, 0.06, metal, 0, -0.055, 0.04),
      B(0.04, 0.025, 0.02, metal, 0, 0.068, -0.12), B(0.04, 0.025, 0.02, metal, 0, 0.068, 0.04),
      C(0.017, 0.017, 0.22, metal, 0, 0.092, -0.04), C(0.017, 0.026, 0.06, metal, 0, 0.092, -0.18),
      C(0.024, 0.024, 0.004, glass, 0, 0.092, -0.211), C(0.019, 0.019, 0.004, glass, 0, 0.092, 0.071));
    info = { len: 0.88, muzzleY: 0.03, grip: [0, -0.09, 0.11], fore: [0, -0.01, -0.36], foreNear: [0, -0.01, -0.28], sight: 0.092 };
  } else if (w === 7) { // Maschinengewehr mit Munitionskasten
    P.push(B(0.08, 0.09, 0.32, metal, 0, 0.01, -0.02), B(0.082, 0.03, 0.28, metal, 0, 0.065, -0.02),
      C(0.021, 0.021, 0.48, steel, 0, 0.02, -0.45), B(0.055, 0.035, 0.3, metal, 0, 0.05, -0.36),
      B(0.02, 0.04, 0.12, poly, 0, 0.09, -0.22), C(0.026, 0.024, 0.06, metal, 0, 0.02, -0.71),
      M(B(0.09, 0.11, 0.13, tan, 0.0, -0.1, -0.03)), M(B(0.092, 0.015, 0.135, metal, 0, -0.04, -0.03)),
      B(0.06, 0.1, 0.26, poly, 0, -0.01, 0.3), B(0.062, 0.11, 0.02, poly, 0, -0.015, 0.43),
      B(0.04, 0.11, 0.05, poly, 0, -0.1, 0.15, -0.35), B(0.004, 0.025, 0.006, steel, 0, -0.04, 0.09),
      B(0.03, 0.03, 0.02, metal, 0, 0.09, 0.08), B(0.008, 0.035, 0.008, metal, 0, 0.06, -0.62),
      C(0.007, 0.007, 0.26, metal, 0.025, -0.03, -0.42), C(0.007, 0.007, 0.26, metal, -0.025, -0.03, -0.42));
    info = { len: 0.74, muzzleY: 0.02, grip: [0, -0.1, 0.15], fore: [0, -0.02, -0.3], foreNear: [0, -0.02, -0.25], sight: 0.1 };
  } else if (w === 8) { // Doppelflinte: zwei Läufe nebeneinander, Holzschaft
    P.push(B(0.064, 0.07, 0.16, metal, 0, 0.012, 0.0),
      C(0.017, 0.017, 0.56, steel, 0.018, 0.03, -0.36), C(0.017, 0.017, 0.56, steel, -0.018, 0.03, -0.36),
      B(0.012, 0.01, 0.56, metal, 0, 0.05, -0.36), B(0.006, 0.008, 0.006, brass, 0, 0.058, -0.63),
      B(0.06, 0.045, 0.24, wood, 0, -0.005, -0.25),
      B(0.05, 0.095, 0.3, wood, 0, -0.035, 0.24, -0.12), B(0.052, 0.105, 0.02, poly, 0, -0.055, 0.395, -0.12),
      B(0.006, 0.012, 0.06, metal, 0, -0.04, 0.05), B(0.004, 0.025, 0.006, steel, 0, -0.025, 0.04),
      B(0.004, 0.025, 0.006, steel, 0, -0.025, 0.065), B(0.012, 0.018, 0.02, steel, 0, 0.055, 0.07));
    info = { len: 0.64, muzzleY: 0.03, grip: [0, -0.07, 0.09], fore: [0, -0.03, -0.25], foreNear: [0, -0.03, -0.2], sight: 0.06 };
  } else { // Pistole: Schlitten mit Griffrillen vorne/hinten, Laufhaube, Unterschiene, Abzugsbügel, Kimme mit Kerbe
    P.push(B(0.03, 0.034, 0.19, metal, 0, 0.034, -0.035));
    for (let i = 0; i < 6; i++) P.push(B(0.032, 0.024, 0.003, poly, 0, 0.034, 0.03 + i * 0.008));
    for (let i = 0; i < 4; i++) P.push(B(0.032, 0.024, 0.003, poly, 0, 0.034, -0.1 - i * 0.008));
    P.push(B(0.002, 0.014, 0.034, steel, 0.0155, 0.04, -0.01), B(0.016, 0.006, 0.032, steel, 0, 0.0515, -0.01),   // Auswurf + Laufhaube
      C(0.0085, 0.0085, 0.02, steel, 0, 0.03, -0.132), C(0.0045, 0.0045, 0.021, poly, 0, 0.03, -0.132),   // Mündung
      B(0.028, 0.022, 0.17, poly, 0, 0.006, -0.04), B(0.026, 0.012, 0.06, poly, 0, -0.008, -0.09),   // Griffstück + Schiene
      B(0.006, 0.006, 0.05, poly, 0, -0.026, -0.03), B(0.006, 0.026, 0.006, poly, 0, -0.014, -0.055),   // Abzugsbügel
      B(0.004, 0.02, 0.005, steel, 0, -0.008, -0.022),                             // Abzug
      B(0.03, 0.105, 0.048, poly, 0, -0.06, 0.045, -0.22), B(0.031, 0.06, 0.036, polyGrip, 0, -0.064, 0.047, -0.22),   // Griff mit Textur
      B(0.005, 0.009, 0.005, steel, 0, 0.055, -0.12),                              // Korn
      B(0.007, 0.01, 0.008, steel, 0.008, 0.055, 0.05), B(0.007, 0.01, 0.008, steel, -0.008, 0.055, 0.05),   // Kimme mit Kerbe
      M(B(0.026, 0.02, 0.045, metal, 0, -0.118, 0.067, -0.22)));
    info = { len: 0.145, muzzleY: 0.03, grip: [0, -0.05, 0.04], fore: [-0.012, -0.07, 0.035], foreNear: [-0.012, -0.07, 0.035], sight: 0.058 };
  }
  info.parts = P;
  return info;
}
// Für Waffen am Boden: Modell in "parent" einsetzen
function makeGunParts(w, parent, shadow = false) {
  const g = makeGun(w); parent.add(partsToGroup(g.parts, shadow)); return g.len;
}
let gunInfo = null;
// Waffe in der Hand: Hauptteil + bewegliche Teile (Magazin, Pumpe, Verschluss, linke Hand)
const vm = { main: null, mag: null, pump: null, bolt: null, left: null, eject: null };
function buildViewGun(w) {
  while (viewGun.children.length) viewGun.remove(viewGun.children[0]);
  gunInfo = makeGun(w);
  const all = gunInfo.parts, gr = gunInfo.grip, fo = gunInfo.fore;
  const main = all.filter(p => !p.mag && !p.pump && !p.bolt), left = [];
  main.push(B(0.055, 0.08, 0.1, GUN_MATS.glove, gr[0] + 0.005, gr[1] - 0.005, gr[2] + 0.01, -0.3),
    limbPart([gr[0] + 0.01, gr[1] - 0.02, gr[2] + 0.06], [0.16, -0.3, 0.5], 0.05, 0.065, TAC.fabric));
  if (w === 3 || w === 5) {   // Pistole/Revolver: beide Hände am Griff
    left.push(B(0.05, 0.07, 0.09, GUN_MATS.glove, fo[0], fo[1], fo[2], -0.3),
      limbPart([fo[0] - 0.01, fo[1] - 0.02, fo[2] + 0.05], [-0.2, -0.32, 0.45], 0.05, 0.065, TAC.fabric));
  } else {
    left.push(B(0.085, 0.045, 0.11, GUN_MATS.glove, fo[0], fo[1] - 0.04, fo[2]),
      limbPart([fo[0] - 0.02, fo[1] - 0.06, fo[2] + 0.04], [-0.42, -0.36, 0.12], 0.045, 0.06, TAC.fabric));
  }
  vm.main = partsToGroup(main); viewGun.add(vm.main);
  vm.mag = partsToGroup(all.filter(p => p.mag)); viewGun.add(vm.mag);
  vm.pump = partsToGroup(all.filter(p => p.pump)); viewGun.add(vm.pump);
  vm.bolt = partsToGroup(all.filter(p => p.bolt)); viewGun.add(vm.bolt);
  vm.left = partsToGroup(left); viewGun.add(vm.left);
  muzzle.position.set(0, gunInfo.muzzleY, -gunInfo.len);
  viewGun.add(muzzle);
  vm.eject = new THREE.Object3D(); vm.eject.position.set(0.035, gunInfo.muzzleY + 0.01, -0.02); viewGun.add(vm.eject);
}
const GUN_POS = new THREE.Vector3(0.24, -0.24, -0.45);

// Messer (Nahkampf, Taste V)
const viewKnife = new THREE.Group();
viewKnife.add(partsToGroup([
  B(0.006, 0.032, 0.17, GUN_MATS.steel, 0, 0.004, -0.13), B(0.006, 0.018, 0.04, GUN_MATS.steel, 0, 0.0, -0.235, 0.5),
  B(0.05, 0.014, 0.018, GUN_MATS.metal, 0, 0, -0.04), C(0.015, 0.017, 0.1, GUN_MATS.poly, 0, 0, 0.015),
  B(0.06, 0.08, 0.1, GUN_MATS.glove, 0, -0.012, 0.02), limbPart([0, -0.03, 0.06], [0.15, -0.3, 0.5], 0.05, 0.065, TAC.fabric),
]));
viewKnife.visible = false; viewKnife.scale.setScalar(0.85); camera.add(viewKnife);

// Granate
const NADE_MAT = new THREE.MeshStandardMaterial({ color: 0x3d4a2e, roughness: 0.6, metalness: 0.3 });
function makeGrenadeMesh() {
  return partsToGroup([SPH(0.045, NADE_MAT, 0, 0, 0, 1, 1.15, 1), CY(0.014, 0.03, GUN_MATS.steel, 0, 0.055, 0), B(0.012, 0.07, 0.01, GUN_MATS.steel, 0.022, 0.02, 0, 0, 0, 0.15),
    { geo: new THREE.TorusGeometry(0.012, 0.003, 6, 12), mat: GUN_MATS.steel, p: [-0.015, 0.075, 0], r: [0, Math.PI / 2, 0] }], true);
}
const viewNade = makeGrenadeMesh(); viewNade.visible = false; camera.add(viewNade);

/* ======================= Effekte (Partikel, Einschusslöcher, Hülsen, Explosionen) ======================= */
const effects = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
function addTracer(a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(geo, tracerMat.clone());
  scene.add(l); effects.push({ o: l, life: 0.07, max: 0.07 });
}
const IMPACT_GEO = new THREE.BoxGeometry(0.06, 0.06, 0.06);
function addImpact(pt, color) {
  const m = new THREE.Mesh(IMPACT_GEO, new THREE.MeshBasicMaterial({ color, transparent: true }));
  m.position.copy(pt); scene.add(m); effects.push({ o: m, life: 0.35, max: 0.35, shrink: true, sharedGeo: true });
}
// Allgemeiner Effekt: o = 3D-Objekt, life = Sekunden; Optionen: vel, grav, drag, grow, spin, bounce, floor, fadeIn, opacity0, onUpdate
function addFx(o, life, opt = {}) { scene.add(o); effects.push(Object.assign({ o, life, max: life }, opt)); return o; }
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.life -= dt;
    const k = Math.max(0, e.life / e.max);
    if (e.vel) {
      e.o.position.addScaledVector(e.vel, dt);
      if (e.grav) e.vel.y -= e.grav * dt;
      if (e.drag) e.vel.multiplyScalar(Math.max(0, 1 - e.drag * dt));
      if (e.bounce !== undefined && e.o.position.y < e.floor) { e.o.position.y = e.floor; e.vel.y = Math.abs(e.vel.y) * e.bounce; e.vel.x *= 0.5; e.vel.z *= 0.5; if (e.spin) e.spin *= 0.5; }
    }
    if (e.spin) { e.o.rotation.x += e.spin * dt; e.o.rotation.y += e.spin * 0.6 * dt; }
    if (e.grow) e.o.scale.multiplyScalar(1 + e.grow * dt);
    if (e.shrink) e.o.scale.setScalar(0.4 + k);
    if (e.onUpdate) e.onUpdate(e, k, dt);
    if (e.o.material && e.fade !== false) {
      const fin = e.fadeIn ? Math.min(1, (e.max - e.life) / e.fadeIn) : 1;
      e.o.material.opacity = (e.opacity0 || 1) * fin * (e.hold ? Math.min(1, e.life / (e.max * 0.35)) : k);
    }
    if (e.life <= 0) {
      scene.remove(e.o);
      if (e.o.geometry && !e.sharedGeo && !e.o.isSprite) e.o.geometry.dispose();
      if (e.o.material && !e.sharedMat) e.o.material.dispose();
      if (e.onEnd) e.onEnd(e);
      effects.splice(i, 1);
    }
  }
}
// Texturen für Partikel
const PUFF_TEX = canvasTex((g, s) => {
  for (let i = 0; i < 7; i++) {
    const x = s / 2 + rnd(-s * 0.15, s * 0.15), y = s / 2 + rnd(-s * 0.15, s * 0.15), r = rnd(s * 0.25, s * 0.42);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
}, 128, false);
const GLOW_TEX = canvasTex((g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,240,200,.8)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
}, 64, false);
const FIRE_TEX = canvasTex((g, s) => {
  for (let i = 0; i < 10; i++) {
    const x = s / 2 + rnd(-s * 0.18, s * 0.18), y = s / 2 + rnd(-s * 0.18, s * 0.18), r = rnd(s * 0.15, s * 0.4);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,250,210,0.9)'); gr.addColorStop(0.35, 'rgba(255,170,50,0.7)'); gr.addColorStop(1, 'rgba(200,40,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
}, 128, false);
const HOLE_TEX = canvasTex((g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(10,8,6,1)'); gr.addColorStop(0.25, 'rgba(20,18,15,.95)'); gr.addColorStop(0.5, 'rgba(60,55,50,.5)'); gr.addColorStop(1, 'rgba(60,55,50,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(20,18,15,.6)'; g.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28; g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(a) * s * 0.42, s / 2 + Math.sin(a) * s * 0.42); g.stroke(); }
}, 64, false);
function sprite(tex, color, size, additive, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, opacity, fog: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  s.scale.set(size, size, 1); s.material.rotation = Math.random() * 6.28;
  return s;
}
function puff(pos, color, size, life, vel, opt = {}) {
  const s = sprite(PUFF_TEX, color, size, false, opt.opacity || 0.8); s.position.copy(pos);
  return addFx(s, life, Object.assign({ vel: vel || new THREE.Vector3(rnd(-0.3, 0.3), rnd(0.2, 0.6), rnd(-0.3, 0.3)), grow: opt.grow || 1.2, drag: 1.5, opacity0: opt.opacity || 0.8, fadeIn: opt.fadeIn }, opt));
}
function sparks(pos, normal, n = 5) {
  for (let i = 0; i < n; i++) {
    const s = sprite(GLOW_TEX, 0xffc070, rnd(0.04, 0.08), true); s.position.copy(pos);
    const v = normal.clone().multiplyScalar(rnd(2, 5)).add(new THREE.Vector3(rnd(-2.5, 2.5), rnd(-1, 3), rnd(-2.5, 2.5)));
    addFx(s, rnd(0.15, 0.35), { vel: v, grav: 12 });
  }
}
// Einschusslöcher (die letzten 70 bleiben sichtbar)
const holeMat = new THREE.MeshBasicMaterial({ map: HOLE_TEX, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
const holeGeo = new THREE.PlaneGeometry(0.13, 0.13);
const holes = [];
function bulletHole(point, normal) {
  let m = holes.length < 70 ? null : holes.shift();
  if (!m) { m = new THREE.Mesh(holeGeo, holeMat); scene.add(m); }
  m.position.copy(point).addScaledVector(normal, 0.01);
  m.lookAt(point.clone().add(normal)); m.rotateZ(Math.random() * 6.28);
  const sc = rnd(0.8, 1.3); m.scale.set(sc, sc, 1);
  holes.push(m);
}
function impactFx(point, normal) {
  bulletHole(point, normal);
  sparks(point, normal, 4);
  puff(point.clone().addScaledVector(normal, 0.05), 0xb8ad98, 0.25, 0.5, normal.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.3, 0)), { opacity: 0.55, grow: 2.2 });
}
function bloodFx(point) {
  for (let i = 0; i < 3; i++) puff(point, 0x7a0a0a, rnd(0.15, 0.3), 0.35, new THREE.Vector3(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)), { opacity: 0.85, grow: 2.5 });
}
// Patronenhülsen
const SHELL_GEO = new THREE.CylinderGeometry(0.006, 0.006, 0.024, 6), SHELL_MAT = GUN_MATS.brass;
function ejectShell(pos, dirRight) {
  const m = new THREE.Mesh(SHELL_GEO, SHELL_MAT); m.position.copy(pos);
  const hit = rayMap(pos, new THREE.Vector3(0, -1, 0), 4);
  const v = dirRight.clone().multiplyScalar(rnd(1.6, 2.6)).add(new THREE.Vector3(0, rnd(1.5, 2.5), 0));
  addFx(m, 1.4, { vel: v, grav: 12, spin: 25, bounce: 0.35, floor: hit ? hit.point.y + 0.006 : pos.y - 1.6, sharedGeo: true, sharedMat: true, fade: false });
}
// Explosion (Granate)
const boomLight = new THREE.PointLight(0xffa040, 0, 28, 2); scene.add(boomLight);
function explosionFx(pos) {
  boomLight.position.copy(pos).add(new THREE.Vector3(0, 1, 0)); boomLight.intensity = 8;
  addFx(new THREE.Object3D(), 0.5, { onUpdate: (e, k) => { boomLight.intensity = 8 * k * k; } });
  for (let i = 0; i < 4; i++) {
    const s = sprite(FIRE_TEX, 0xffffff, rnd(1.5, 2.5), true); s.position.copy(pos).add(new THREE.Vector3(rnd(-0.4, 0.4), rnd(0.3, 1.0), rnd(-0.4, 0.4)));
    addFx(s, rnd(0.35, 0.55), { grow: 2.4, vel: new THREE.Vector3(0, 1.5, 0) });
  }
  for (let i = 0; i < 10; i++) puff(pos.clone().add(new THREE.Vector3(rnd(-0.8, 0.8), rnd(0.2, 1.2), rnd(-0.8, 0.8))), 0x3a3632, rnd(1.2, 2.2), rnd(1.6, 2.6),
    new THREE.Vector3(rnd(-1.2, 1.2), rnd(0.8, 2.2), rnd(-1.2, 1.2)), { opacity: 0.75, grow: 0.6, fadeIn: 0.15 });
  for (let i = 0; i < 14; i++) {
    const s = sprite(GLOW_TEX, 0xffb050, rnd(0.08, 0.16), true); s.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
    addFx(s, rnd(0.4, 0.8), { vel: new THREE.Vector3(rnd(-9, 9), rnd(3, 11), rnd(-9, 9)), grav: 14 });
  }
  bulletHole(new THREE.Vector3(pos.x, Math.max(0.005, pos.y - 0.05), pos.z), new THREE.Vector3(0, 1, 0));
  holes[holes.length - 1].scale.set(14, 14, 1);
}
