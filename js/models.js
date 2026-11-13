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
// Echte Oberflächen: schwarz eloxiertes/brüniertes Metall, schwarzer Kunststoff, geöltes Walnussholz
const GUN_MATS = {
  metal: new THREE.MeshStandardMaterial({ map: GUN_TEX, color: 0x9da1a8, roughness: 0.46, metalness: 0.72 }),
  metalDS: new THREE.MeshStandardMaterial({ map: GUN_TEX, color: 0x9da1a8, roughness: 0.46, metalness: 0.72, side: THREE.DoubleSide }),
  polyGrip: new THREE.MeshStandardMaterial({ map: GRIP_TEX, color: 0x8a8c90, roughness: 0.92, metalness: 0 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0e0e0f, roughness: 0.95 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.3, metalness: 0.95 }),
  poly: new THREE.MeshStandardMaterial({ map: POLY_TEX, color: 0x6b6d72, roughness: 0.82, metalness: 0.05 }),
  tan: new THREE.MeshStandardMaterial({ map: POLY_TEX, color: new THREE.Color(2.2, 1.7, 0.9), roughness: 0.78, metalness: 0.05 }),
  wood: new THREE.MeshStandardMaterial({ map: WOOD_TEX, color: 0xd9b48c, roughness: 0.38, metalness: 0 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9, metalness: 0.2 }),   // Bohrungen, Öffnungen
  olive: new THREE.MeshStandardMaterial({ map: POLY_TEX, color: new THREE.Color(1.05, 1.25, 0.75), roughness: 0.7, metalness: 0.15 }),
  awm: new THREE.MeshStandardMaterial({ map: POLY_TEX, color: new THREE.Color(0.62, 0.78, 0.5), roughness: 0.75, metalness: 0.05 }),   // grüner Scharfschützen-Schaft
  white: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5, emissive: 0x333333 }),   // Visierpunkte
  glass: new THREE.MeshStandardMaterial({ color: 0x1d3a55, roughness: 0.03, metalness: 0.9, envMapIntensity: 2 }),
  red: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  shell: new THREE.MeshStandardMaterial({ color: 0xa3201a, roughness: 0.5 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc09a40, roughness: 0.3, metalness: 0.9 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x2c2b26, roughness: 0.9 }),
  flame: new THREE.MeshStandardMaterial({ color: 0xff8a20, emissive: 0xff6a10, emissiveIntensity: 2 }),
};
// Rakete (Raketenwerfer): Spitze zeigt nach +z, damit lookAt sie in Flugrichtung dreht
function makeRocketMesh() {
  const g = new THREE.Group(), m = GUN_MATS;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 10), m.tan); body.rotation.x = Math.PI / 2; g.add(body);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 10), m.red); tip.rotation.x = Math.PI / 2; tip.position.z = 0.36; g.add(tip);
  for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12, 0.1), m.metal); f.position.set(0, 0, -0.22); f.rotation.z = k * Math.PI / 2; f.translateY(0.06); g.add(f); }
  const fire = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m.flame); fire.position.z = -0.3; fire.scale.z = 1.8; g.add(fire);
  return g;
}
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
    const g = pt.geo.clone();   // Kopie: dieselbe Form (Radlauf, Speiche, Leuchte) wird oft mehrfach benutzt
    e.set(pt.r[0], pt.r[1], pt.r[2]); q.setFromEuler(e);
    m4.compose(_V(pt.p), q, pt.s ? _V(pt.s) : new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m4);
    if (!g.attributes.uv2) g.setAttribute('uv2', g.attributes.uv);
    if (!byMat.has(pt.mat)) byMat.set(pt.mat, []);
    byMat.get(pt.mat).push(g);
  }
  const grp = new THREE.Group(); grp.userData.meshes = [];
  for (const [mat, list] of byMat) {
    const geos = list.some(g => g.index) && list.some(g => !g.index) ? list.map(g => g.index ? g.toNonIndexed() : g) : list;   // gemischte Arten angleichen
    const m = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(geos), mat);
    m.castShadow = shadow; m.receiveShadow = shadow;
    if (userData) m.userData = Object.assign({}, userData);
    grp.add(m); grp.userData.meshes.push(m);
  }
  return grp;
}

// Seitenprofil: Umriss aus Punkten [z, y] (Lauf zeigt nach -z), Dicke in x – für echte Silhouetten (Schaft, Griff,
// Gehäuse, Magazin). [cz, cy, z, y] = Kurve dorthin. holes = Öffnungen (z. B. Abzugsbügel). Kanten leicht gefast.
function GPROF(pts, thick, mat, x = 0, holes = null, bevel, uvs = 7) {
  const mk = list => { const s = new THREE.Shape(); list.forEach((p, i) => { if (i === 0) s.moveTo(p[0], p[1]); else if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else s.lineTo(p[0], p[1]); }); return s; };
  const sh = mk(pts);
  if (holes) for (const h of holes) sh.holes.push(new THREE.Path(mk(h).getPoints()));
  const bv = bevel !== undefined ? Math.min(bevel, 0.0008) : Math.min(0.001, thick * 0.04), depth = Math.max(0.0005, thick - 2 * bv);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv * 0.8, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvs, uv.getY(i) * uvs);   // Textur fein genug
  return { geo: g, mat, p: [x, 0, 0], r: [0, 0, 0] };
}
// Abzug (gebogen) und Abzugsbügel als Ring
const TRIG = (mat, z, y) => GPROF([[z - 0.004, y + 0.012], [z + 0.003, y + 0.012], [z + 0.005, y - 0.004, z - 0.002, y - 0.016], [z - 0.007, y - 0.014], [z - 0.002, y - 0.002, z - 0.004, y + 0.012]], 0.006, mat, 0, null, 0.0008);
const GUARD = (mat, z0, z1, y0, y1, th = 0.012) => GPROF([[z0, y0], [z1, y0], [z1 + 0.004, y1 + 0.006, z1 - 0.008, y1], [z0 + 0.004, y1], [z0, y1 + 0.01]], th, mat, 0,
  [[[z0 + 0.006, y0 - 0.003], [z1 - 0.005, y0 - 0.003], [z1 - 0.002, y1 + 0.009, z1 - 0.011, y1 + 0.005], [z0 + 0.008, y1 + 0.005], [z0 + 0.006, y1 + 0.012]]], 0.0012);
// Pistolengriff (Gewehre): schräg nach hinten, Fingermulden vorne
const PGRIP = (mat, z, y, len = 0.13, th = 0.034) => GPROF([[z, y], [z + 0.045, y], [z + 0.045 + len * 0.42, y - len], [z + 0.032 + len * 0.42, y - len - 0.014], [z - 0.002 + len * 0.42, y - len - 0.012],
  [z + 0.008 + len * 0.3, y - len * 0.72, z + len * 0.22, y - len * 0.6], [z + len * 0.1, y - len * 0.35, z + len * 0.12, y - len * 0.25], [z + 0.002, y - 0.02]], th, mat);

/* --- Waffenmodelle (Maße in Metern, Lauf zeigt nach -z; Hände/Mündung/Visier wie bisher) --- */
function makeGun(w) {
  const { metal, metalDS, steel, poly, tan, wood, glass, red, shell, brass, polyGrip, rubber, dark, olive } = GUN_MATS;
  const P = [];
  // Waffen-Kästchen mit SCHARFEN Kanten (nur hauchdünne Glanzkante) statt weich abgerundet
  const B = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mn = Math.min(w, h, d);
    return { geo: mn < 0.012 ? withUv2(new THREE.BoxGeometry(w, h, d)) : roundedBoxGeo(w, h, d, Math.min(0.001, mn * 0.05), 1, 0.25), mat, p: [x, y, z], r: [rx, ry, rz] };
  };
  // Achteckiges Rohr mit flachen Seiten (z. B. eckiger Handschutz), entlang z
  const OCT = (r, len, mat, x, y, z) => { const g = new THREE.CylinderGeometry(r, r, len, 8).rotateY(Math.PI / 8).toNonIndexed(); g.computeVertexNormals(); return { geo: g, mat, p: [x, y, z], r: [Math.PI / 2, 0, 0] }; };
  const M = pt => (pt.mag = true, pt), PU = pt => (pt.pump = true, pt), BO = pt => (pt.bolt = true, pt), SP = pt => (pt.spin = true, pt);
  const rail =(z0, z1, y, x = 0, rot = 0) => {   // Picatinny-Schiene mit Querrillen
    const L = z1 - z0; P.push(B(0.022, 0.008, L, metal, x, y, (z0 + z1) / 2, 0, 0, rot));
    for (let z = z0 + 0.008; z < z1 - 0.004; z += 0.01) P.push(B(0.022, 0.004, 0.005, metal, x, y + 0.006, z, 0, 0, rot));
  };
  const scope = (zc, y, len = 0.3, r = 0.017) => {   // Zielfernrohr: Röhre, Objektiv, Okular, Türme, Ringe, Linsen
    P.push(C(r, r, len, metal, 0, y, zc), C(r, r * 1.55, 0.07, metal, 0, y, zc - len / 2 - 0.035), C(r * 1.55, r * 1.55, 0.03, metal, 0, y, zc - len / 2 - 0.085),
      C(r * 1.05, r * 1.35, 0.06, metal, 0, y, zc + len / 2 + 0.03), C(r * 1.42, r * 1.42, 0.003, glass, 0, y, zc - len / 2 - 0.1), C(r * 1.2, r * 1.2, 0.003, glass, 0, y, zc + len / 2 + 0.061),
      CY(r * 0.75, 0.028, metal, 0, y + r + 0.012, zc), CY(r * 0.85, 0.008, steel, 0, y + r + 0.028, zc), CX(r * 0.75, 0.028, metal, r + 0.012, y, zc), CX(r * 0.85, 0.008, steel, r + 0.028, y, zc));
    for (const dz of [-len * 0.32, len * 0.32]) P.push(B(0.03, 0.012, 0.016, metal, 0, y - r - 0.006, zc + dz), C(r + 0.004, r + 0.004, 0.016, metal, 0, y, zc + dz));
  };
  let info;
  if (w === 0) { // Sturmgewehr (AR-Bauart): Ober-/Unterschale, Schiene, M-LOK-Handschutz, Rotpunkt, gebogenes Magazin, Teleskopschaft
    P.push(B(0.056, 0.062, 0.3, metal, 0, 0.03, -0.03), B(0.003, 0.022, 0.065, steel, 0.0295, 0.032, 0.0), B(0.002, 0.018, 0.04, dark, 0.0305, 0.032, 0.0),
      CX(0.011, 0.03, metal, 0.037, 0.045, 0.07), B(0.052, 0.012, 0.03, metal, 0, 0.066, 0.118), B(0.012, 0.012, 0.04, metal, 0.03, 0.066, 0.13));
    rail(-0.175, 0.15, 0.066);   // Flat-Top-Schiene nur auf dem Obergehäuse (wie beim M4A1)
    // Eckiger Alu-Handschutz (achteckig, flache Seiten) mit durchgehender Schiene oben und M-LOK-Schlitzen
    P.push(OCT(0.034, 0.285, metal, 0, 0.03, -0.3275), B(0.05, 0.05, 0.01, metal, 0, 0.03, -0.18));
    rail(-0.47, -0.185, 0.066);
    for (let i = 0; i < 5; i++) { const z = -0.225 - i * 0.05; P.push(B(0.002, 0.009, 0.026, dark, 0.0316, 0.03, z), B(0.002, 0.009, 0.026, dark, -0.0316, 0.03, z), B(0.009, 0.002, 0.026, dark, 0, -0.0016, z)); }
    // Lauf, A2-Kornsockel (Dreieck mit Schutzohren, Bajonetthalter, Riemenbügel), Vogelkäfig-Mündungsfeuerdämpfer
    P.push(C(0.0105, 0.0105, 0.54, steel, 0, 0.03, -0.45), C(0.017, 0.017, 0.03, metal, 0, 0.03, -0.515),
      GPROF([[-0.531, 0.044], [-0.499, 0.044], [-0.507, 0.082], [-0.523, 0.082]], 0.02, metal),
      GPROF([[-0.528, 0.078], [-0.502, 0.078], [-0.508, 0.112], [-0.522, 0.112]], 0.004, metal, 0.009), GPROF([[-0.528, 0.078], [-0.502, 0.078], [-0.508, 0.112], [-0.522, 0.112]], 0.004, metal, -0.009),
      B(0.004, 0.024, 0.004, steel, 0, 0.094, -0.515), B(0.012, 0.022, 0.022, metal, 0, 0.006, -0.515), { geo: new THREE.TorusGeometry(0.009, 0.0025, 6, 12), mat: steel, p: [0, -0.008, -0.515], r: [0, Math.PI / 2, 0] },
      C(0.0115, 0.0115, 0.055, metal, 0, 0.03, -0.7475), C(0.0065, 0.0065, 0.002, dark, 0, 0.03, -0.776));
    for (let k = 0; k < 5; k++) { const a = Math.PI * (0.18 + k * 0.16); P.push(B(0.003, 0.007, 0.032, dark, Math.cos(a) * 0.0113, 0.03 + Math.sin(a) * 0.0113, -0.752, 0, 0, a + Math.PI / 2)); }
    // Kleinteile: Hülsenabweiser, Stifte, Magazinhalter, Verschlussfang, Feuerwahlhebel
    P.push(B(0.008, 0.02, 0.02, metal, 0.031, 0.045, 0.045), CX(0.0045, 0.054, steel, 0, -0.012, -0.155), CX(0.0045, 0.054, steel, 0, -0.012, 0.1),
      CX(0.006, 0.006, metal, 0.027, -0.028, -0.03), B(0.004, 0.032, 0.012, metal, -0.026, -0.018, -0.028), CX(0.007, 0.004, steel, -0.027, -0.024, 0.065), B(0.003, 0.006, 0.026, steel, -0.029, -0.024, 0.075),
      C(0.019, 0.019, 0.006, metal, 0, 0.02, 0.124));
    P.push(B(0.03, 0.026, 0.016, metal, 0, 0.087, 0.1),
      B(0.034, 0.022, 0.06, metal, 0, 0.087, -0.04), C(0.024, 0.024, 0.08, metalDS, 0, 0.115, -0.04, 18, true), CY(0.006, 0.014, metal, 0.028, 0.115, -0.04), B(0.004, 0.004, 0.002, red, 0, 0.115, -0.01),
      // Unterschale mit Magazinschacht
      GPROF([[-0.17, 0.001], [0.12, 0.001], [0.12, -0.03], [0.085, -0.035], [0.045, -0.035], [0.03, -0.05], [-0.035, -0.05], [-0.04, -0.104], [-0.116, -0.104], [-0.121, -0.05], [-0.17, -0.028]], 0.05, metal),
      GUARD(metal, -0.03, 0.04, -0.05, -0.078), TRIG(steel, 0.003, -0.056),
      M(GPROF([[-0.113, -0.098], [-0.044, -0.098], [-0.051, -0.2], [-0.068, -0.282], [-0.137, -0.272], [-0.12, -0.2]], 0.027, metal)),   // gebogenes Magazin
      M(GPROF([[-0.07, -0.278], [-0.138, -0.268], [-0.142, -0.283], [-0.07, -0.294]], 0.033, poly)),
      PGRIP(poly, 0.045, -0.034, 0.13), C(0.016, 0.016, 0.2, metal, 0, 0.02, 0.22), C(0.02, 0.02, 0.014, metal, 0, 0.02, 0.12),
      GPROF([[0.2, 0.045], [0.372, 0.05], [0.392, 0.06], [0.41, 0.052], [0.41, -0.086], [0.392, -0.092], [0.33, -0.032], [0.215, -0.01], [0.2, 0.0]], 0.046, poly),   // Teleskopschaft
      B(0.048, 0.142, 0.016, rubber, 0, -0.018, 0.418), { geo: new THREE.TorusGeometry(0.012, 0.003, 6, 12), mat: steel, p: [0, -0.05, 0.36], r: [0, Math.PI / 2, 0] });
    info = { len: 0.775, muzzleY: 0.03, grip: [0, -0.1, 0.1], fore: [0, -0.01, -0.33], foreNear: [0, -0.01, -0.22], sight: 0.115 };
  } else if (w === 1) { // Pumpgun: Stahlgehäuse, Laufschiene mit Korn, Röhrenmagazin, gerillter Vorderschaft (Pumpe), Holzschaft
    P.push(GPROF([[-0.12, 0.054], [0.098, 0.054], [0.124, 0.03], [0.124, -0.032], [-0.12, -0.032]], 0.058, metal),
      B(0.002, 0.024, 0.075, dark, 0.03, 0.012, -0.03), B(0.002, 0.018, 0.07, dark, -0.03, -0.01, 0.0),   // Auswurf, Ladeöffnung
      C(0.0175, 0.0175, 0.58, steel, 0, 0.035, -0.41), C(0.0075, 0.0075, 0.002, dark, 0, 0.035, -0.701), B(0.01, 0.006, 0.56, metal, 0, 0.056, -0.41), CY(0.003, 0.008, brass, 0, 0.062, -0.69),
      C(0.016, 0.016, 0.47, metal, 0, -0.005, -0.355), C(0.019, 0.019, 0.03, metal, 0, -0.005, -0.6), B(0.03, 0.03, 0.025, metal, 0, 0.012, -0.6),
      PU(C(0.03, 0.03, 0.2, wood, 0, -0.008, -0.3, 16)));
    for (let i = 0; i < 7; i++) P.push(PU(C(0.0312, 0.0312, 0.007, dark, 0, -0.008, -0.235 - i * 0.022, 16)));
    P.push(GUARD(metal, 0.02, 0.085, -0.032, -0.06), TRIG(steel, 0.05, -0.04), B(0.012, 0.008, 0.012, steel, 0, 0.0, 0.11),
      GPROF([[0.12, 0.048], [0.2, 0.032], [0.385, 0.022], [0.4, 0.032], [0.402, -0.13], [0.385, -0.142], [0.2, -0.058], [0.152, -0.075], [0.125, -0.034]], 0.046, wood),
      B(0.048, 0.18, 0.02, rubber, 0, -0.054, 0.41, 0.12), B(0.004, 0.05, 0.12, poly, 0.032, 0.012, -0.05));
    for (let i = 0; i < 4; i++) P.push(CY(0.009, 0.045, shell, 0.04, 0.012, -0.09 + i * 0.024), CY(0.0095, 0.01, brass, 0.04, -0.015, -0.09 + i * 0.024));
    P.push({ geo: new THREE.TorusGeometry(0.012, 0.003, 6, 12), mat: steel, p: [0, -0.1, 0.33], r: [0, Math.PI / 2, 0] });
    info = { len: 0.71, muzzleY: 0.035, grip: [0, -0.07, 0.09], fore: [0, -0.03, -0.3], foreNear: [0, -0.03, -0.25], sight: 0.07 };
  } else if (w === 2) { // Scharfschützengewehr: Repetierer, Schaft mit Wangenauflage, kannelierter Lauf, Mündungsbremse, großes Zielfernrohr, Zweibein
    P.push(C(0.022, 0.022, 0.28, steel, 0, 0.025, -0.0), C(0.016, 0.012, 0.73, steel, 0, 0.025, -0.505), C(0.0055, 0.0055, 0.002, dark, 0, 0.025, -0.931));
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; P.push(B(0.003, 0.003, 0.42, dark, Math.cos(a) * 0.0145, 0.025 + Math.sin(a) * 0.0145, -0.45)); }
    P.push(B(0.044, 0.036, 0.075, metal, 0, 0.025, -0.895));
    for (const zz of [-0.875, -0.895, -0.915]) P.push(B(0.048, 0.007, 0.01, dark, 0, 0.025, zz));
    P.push(GPROF([[-0.47, 0.004], [0.13, 0.004], [0.2, 0.034], [0.44, 0.05], [0.48, 0.056], [0.485, -0.13], [0.46, -0.138], [0.3, -0.078], [0.225, -0.076], [0.2, -0.165],
      [0.185, -0.178], [0.152, -0.176], [0.14, -0.1], [0.125, -0.06], [0.05, -0.056], [-0.45, -0.05], [-0.478, -0.03]], 0.064, GUN_MATS.awm, 0,
      [[[0.06, -0.012], [0.11, -0.012], [0.112, -0.048], [0.065, -0.046]], [[0.208, -0.008], [0.262, 0.0], [0.264, -0.056], [0.218, -0.062]]]),   // grüner Daumenloch-Schaft
      B(0.05, 0.03, 0.16, GUN_MATS.awm, 0, 0.065, 0.32), CY(0.005, 0.03, steel, 0, 0.045, 0.27), CY(0.005, 0.03, steel, 0, 0.045, 0.37),   // verstellbare Wangenauflage
      CY(0.007, 0.07, steel, 0, -0.16, 0.42), CY(0.014, 0.008, rubber, 0, -0.198, 0.42),   // Hinterschaft-Stütze
      B(0.058, 0.15, 0.022, rubber, 0, -0.04, 0.49), TRIG(steel, 0.088, -0.022),
      M(GPROF([[-0.045, -0.05], [0.025, -0.05], [0.025, -0.08], [-0.045, -0.08]], 0.04, metal)),
      BO(CX(0.006, 0.06, steel, 0.05, 0.03, 0.1)), BO(SPH(0.012, steel, 0.08, 0.025, 0.1)), BO(C(0.023, 0.023, 0.06, steel, 0, 0.025, 0.14)));
    rail(-0.16, 0.12, 0.052); scope(-0.02, 0.09, 0.26, 0.019);
    P.push(B(0.05, 0.02, 0.03, metal, 0, -0.06, -0.42), limbPart([0.018, -0.065, -0.42], [0.02, -0.07, -0.66], 0.006, 0.006, metal, 8), limbPart([-0.018, -0.065, -0.42], [-0.02, -0.07, -0.66], 0.006, 0.006, metal, 8));
    info = { len: 0.935, muzzleY: 0.025, grip: [0, -0.09, 0.14], fore: [0, -0.04, -0.25], foreNear: [0, -0.04, -0.2], sight: 0.09 };
  } else if (w === 4) { // Maschinenpistole mit integriertem Schalldämpfer: Gehäuse, Ladehebel-Rohr, gebogenes Magazin, Abzugsgruppe, Schubschaft
    P.push(GPROF([[-0.2, 0.05], [0.118, 0.05], [0.14, 0.034], [0.14, -0.016], [0.02, -0.02], [-0.2, -0.02]], 0.05, metal),
      C(0.012, 0.012, 0.19, metal, 0, 0.05, -0.2), B(0.008, 0.012, 0.03, metal, -0.016, 0.05, -0.27), B(0.002, 0.016, 0.05, dark, 0.026, 0.02, -0.02),
      B(0.054, 0.006, 0.3, metal, 0, 0.038, -0.04), B(0.054, 0.006, 0.3, metal, 0, 0.002, -0.04), B(0.01, 0.006, 0.02, metal, 0, 0.056, -0.05), B(0.01, 0.006, 0.02, metal, 0, 0.056, 0.05),   // Sicken + Klemmschienen-Aufnahmen
      C(0.025, 0.025, 0.26, metal, 0, 0.025, -0.33), C(0.027, 0.027, 0.012, metal, 0, 0.025, -0.46), C(0.006, 0.006, 0.002, dark, 0, 0.025, -0.467),
      GPROF([[-0.26, 0.004], [-0.12, 0.004], [-0.12, -0.03], [-0.15, -0.042], [-0.24, -0.04], [-0.262, -0.03]], 0.054, poly),   // schmaler Vorderschaft
      GPROF([[-0.02, -0.016], [0.122, -0.016], [0.122, -0.034], [0.07, -0.04], [0.112, -0.15], [0.098, -0.162], [0.062, -0.158], [0.044, -0.1], [0.034, -0.062], [-0.002, -0.054], [-0.02, -0.04]], 0.042, poly, 0,
        [[[0.004, -0.032], [0.036, -0.032], [0.034, -0.05], [0.006, -0.048]]]),
      TRIG(steel, 0.02, -0.036), B(0.034, 0.02, 0.05, metal, 0, -0.03, -0.05),
      M(GPROF([[-0.073, -0.032], [-0.028, -0.032], [-0.034, -0.11], [-0.058, -0.19], [-0.104, -0.18], [-0.08, -0.1]], 0.024, metal)),
      CX(0.012, 0.03, metal, 0, 0.072, 0.1), B(0.012, 0.02, 0.012, metal, 0, 0.058, 0.1),
      { geo: new THREE.TorusGeometry(0.011, 0.003, 6, 14), mat: metal, p: [0, 0.07, -0.17], r: [0, 0, 0] }, B(0.003, 0.016, 0.003, steel, 0, 0.068, -0.17),
      C(0.006, 0.006, 0.18, steel, 0.02, 0.0, 0.23), C(0.006, 0.006, 0.18, steel, -0.02, 0.0, 0.23),
      GPROF([[0.31, 0.04], [0.325, 0.04], [0.33, -0.07], [0.315, -0.075]], 0.05, poly), B(0.048, 0.11, 0.008, rubber, 0, -0.016, 0.334));
    info = { len: 0.46, muzzleY: 0.025, grip: [0, -0.08, 0.08], fore: [0, -0.09, -0.16], foreNear: [0, -0.09, -0.16], sight: 0.072 };
  } else if (w === 5) { // Revolver: Rahmen mit Trommelfenster, Lauf mit Unterlauf-Nase und Laufschiene, 6-Schuss-Trommel, Hahn, Holzgriff
    P.push(GPROF([[-0.06, 0.058], [0.034, 0.058], [0.05, 0.046], [0.056, 0.02], [0.05, -0.006], [0.03, -0.012], [-0.03, -0.012], [-0.05, 0.0], [-0.06, 0.012]], 0.032, steel, 0,
        [[[-0.036, 0.05], [0.022, 0.05], [0.022, -0.004], [-0.036, -0.004]]]),
      GPROF([[-0.222, 0.056], [-0.058, 0.056], [-0.058, 0.0], [-0.17, 0.004], [-0.222, 0.014]], 0.024, steel),
      GPROF([[-0.216, 0.056], [-0.205, 0.07], [-0.192, 0.07], [-0.19, 0.056]], 0.006, steel), C(0.0048, 0.0048, 0.002, dark, 0, 0.035, -0.2235),
      GPROF([[-0.212, 0.055], [-0.062, 0.055], [-0.062, 0.071], [-0.212, 0.071]], 0.01, steel, 0,
        [0, 1, 2, 3].map(k => { const z0 = -0.2 + k * 0.034; return [[z0, 0.059], [z0 + 0.022, 0.059], [z0 + 0.022, 0.067], [z0, 0.067]]; })),   // belüftete Laufschiene
      C(0.004, 0.004, 0.06, steel, 0, 0.004, -0.09),
      M(C(0.026, 0.026, 0.054, steel, 0, 0.024, -0.007, 20)));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; P.push(M(C(0.0055, 0.0055, 0.003, dark, Math.cos(a) * 0.015, 0.024 + Math.sin(a) * 0.015, -0.035)), M(B(0.004, 0.008, 0.036, dark, Math.cos(a + 0.52) * 0.025, 0.024 + Math.sin(a + 0.52) * 0.025, -0.007, 0, 0, a + 0.52))); }
    P.push(GPROF([[0.04, 0.05], [0.058, 0.076], [0.068, 0.073], [0.058, 0.044]], 0.01, steel), B(0.008, 0.006, 0.012, steel, 0, 0.061, 0.03),
      GUARD(steel, -0.02, 0.034, -0.012, -0.044, 0.008), TRIG(steel, 0.008, -0.016),
      GPROF([[0.032, -0.004], [0.058, 0.016], [0.076, 0.0], [0.092, -0.088], [0.082, -0.104], [0.046, -0.104], [0.04, -0.07, 0.03, -0.06], [0.034, -0.016]], 0.036, wood));
    info = { len: 0.22, muzzleY: 0.035, grip: [0, -0.05, 0.065], fore: [-0.012, -0.07, 0.055], foreNear: [-0.012, -0.07, 0.055], sight: 0.064 };
  } else if (w === 6) { // Kampfgewehr (7,62 mm) mit Zielfernrohr: langes Obergehäuse mit Schienen, Kunststoff-Unterschale, gerades Magazin, Klappschaft
    P.push(GPROF([[-0.52, 0.062], [0.14, 0.062], [0.14, 0.0], [-0.12, 0.0], [-0.14, 0.014], [-0.52, 0.014]], 0.062, metal),
      B(0.004, 0.02, 0.07, dark, 0.031, 0.034, 0.0), B(0.01, 0.014, 0.03, metal, -0.036, 0.04, -0.3));
    rail(-0.52, 0.14, 0.066);
    for (const s of [-1, 1]) rail(-0.5, -0.24, 0.036, s * 0.034, s * Math.PI / 2);
    P.push(C(0.013, 0.012, 0.3, steel, 0, 0.03, -0.67), C(0.017, 0.017, 0.06, metal, 0, 0.03, -0.85), C(0.006, 0.006, 0.002, dark, 0, 0.03, -0.881));
    for (let k = 0; k < 4; k++) P.push(B(0.002, 0.034, 0.04, dark, 0, 0.03, -0.855, 0, 0, k * Math.PI / 4));
    P.push(GPROF([[-0.15, 0.001], [0.13, 0.001], [0.13, -0.03], [0.045, -0.035], [0.03, -0.05], [-0.052, -0.05], [-0.056, -0.08], [-0.132, -0.08], [-0.14, -0.04]], 0.058, tan),
      GUARD(tan, -0.03, 0.04, -0.05, -0.078), TRIG(steel, 0.003, -0.056),
      M(GPROF([[-0.128, -0.075], [-0.06, -0.075], [-0.064, -0.215], [-0.134, -0.222]], 0.032, metal)), M(B(0.036, 0.01, 0.075, poly, 0, -0.222, -0.098)),
      PGRIP(poly, 0.05, -0.034, 0.12),
      GPROF([[0.14, 0.055], [0.36, 0.06], [0.4, 0.07], [0.422, 0.062], [0.422, -0.09], [0.4, -0.1], [0.3, -0.042], [0.2, -0.034], [0.14, -0.01]], 0.05, tan, 0, [[[0.2, 0.03], [0.33, 0.035], [0.3, -0.012], [0.21, -0.008]]]),
      B(0.05, 0.02, 0.12, tan, 0, 0.07, 0.33), B(0.052, 0.16, 0.014, rubber, 0, -0.015, 0.43));
    scope(-0.04, 0.094, 0.24, 0.017);
    info = { len: 0.88, muzzleY: 0.03, grip: [0, -0.09, 0.11], fore: [0, -0.01, -0.36], foreNear: [0, -0.01, -0.28], sight: 0.092 };
  } else if (w === 7) { // Maschinengewehr: Gehäuse mit Zuführdeckel, Tragegriff, Lauf mit Hitzeschild, Munitionskasten mit Gurt, Zweibein, Schaft
    P.push(GPROF([[-0.17, 0.055], [0.15, 0.055], [0.17, 0.034], [0.17, -0.03], [-0.17, -0.03]], 0.085, metal),
      GPROF([[-0.13, 0.055], [0.12, 0.055], [0.1, 0.086], [-0.11, 0.086]], 0.09, metal), B(0.03, 0.026, 0.02, metal, 0, 0.097, 0.08), B(0.02, 0.014, 0.02, steel, 0.04, 0.08, 0.1),
      GPROF([[-0.36, 0.06], [-0.345, 0.112], [-0.215, 0.112], [-0.2, 0.06], [-0.226, 0.06], [-0.236, 0.094], [-0.324, 0.094], [-0.334, 0.06]], 0.02, metal),
      C(0.019, 0.017, 0.52, steel, 0, 0.02, -0.44), C(0.025, 0.025, 0.04, metal, 0, 0.02, -0.72), C(0.007, 0.007, 0.002, dark, 0, 0.02, -0.741), C(0.012, 0.012, 0.42, metal, 0, -0.016, -0.39),
      GPROF([[-0.38, 0.0], [-0.17, 0.0], [-0.17, -0.044], [-0.36, -0.044], [-0.382, -0.025]], 0.07, poly), B(0.008, 0.035, 0.008, metal, 0, 0.05, -0.66));
    for (let k = 0; k < 5; k++) P.push(B(0.042, 0.004, 0.02, dark, 0, 0.043, -0.42 - k * 0.04));
    P.push(M(GPROF([[-0.1, -0.03], [0.03, -0.03], [0.03, -0.155], [-0.1, -0.155]], 0.1, tan)), M(B(0.104, 0.015, 0.136, metal, 0, -0.035, -0.035)));
    for (let k = 0; k < 6; k++) P.push(M(CX(0.0045, 0.03, brass, 0.045 + k * 0.002, -0.03 + k * 0.006, -0.06 + k * 0.012)));
    P.push(PGRIP(poly, 0.1, -0.03, 0.13), GUARD(metal, 0.06, 0.13, -0.03, -0.06), TRIG(steel, 0.09, -0.036),
      GPROF([[0.17, 0.04], [0.4, 0.03], [0.44, 0.04], [0.45, -0.1], [0.42, -0.112], [0.3, -0.064], [0.17, -0.03]], 0.06, poly), B(0.062, 0.15, 0.016, rubber, 0, -0.03, 0.457),
      B(0.05, 0.02, 0.03, metal, 0, -0.035, -0.6), limbPart([0.02, -0.04, -0.6], [0.022, -0.045, -0.38], 0.006, 0.006, metal, 8), limbPart([-0.02, -0.04, -0.6], [-0.022, -0.045, -0.38], 0.006, 0.006, metal, 8));
    info = { len: 0.74, muzzleY: 0.02, grip: [0, -0.1, 0.15], fore: [0, -0.02, -0.3], foreNear: [0, -0.02, -0.25], sight: 0.1 };
  } else if (w === 8) { // Doppelflinte: zwei Läufe nebeneinander mit Schiene, Basküle (Stahl), Hebel oben, Holz-Vorderschaft, Schaft mit Pistolengriff
    P.push(C(0.0175, 0.0175, 0.56, steel, 0.018, 0.03, -0.36), C(0.0175, 0.0175, 0.56, steel, -0.018, 0.03, -0.36),
      C(0.0075, 0.0075, 0.002, dark, 0.018, 0.03, -0.641), C(0.0075, 0.0075, 0.002, dark, -0.018, 0.03, -0.641),
      B(0.012, 0.01, 0.56, steel, 0, 0.05, -0.36), B(0.01, 0.012, 0.5, steel, 0, 0.008, -0.34), CY(0.003, 0.008, brass, 0, 0.058, -0.63),
      GPROF([[-0.08, 0.06], [0.02, 0.06], [0.06, 0.046], [0.08, 0.02], [0.08, -0.022], [0.04, -0.032], [-0.08, -0.01]], 0.068, steel),
      B(0.012, 0.01, 0.045, steel, 0, 0.064, 0.05, 0, 0.35, 0), B(0.01, 0.008, 0.016, steel, 0, 0.062, 0.03),
      GPROF([[-0.33, 0.012], [-0.08, 0.012], [-0.08, -0.016], [-0.12, -0.026], [-0.33, -0.012]], 0.06, wood),
      GUARD(steel, 0.02, 0.09, -0.03, -0.062, 0.01), TRIG(steel, 0.044, -0.034), TRIG(steel, 0.066, -0.034),
      GPROF([[0.07, 0.036], [0.14, 0.03], [0.38, 0.034], [0.392, 0.045], [0.4, -0.122], [0.382, -0.132], [0.2, -0.066], [0.15, -0.092], [0.112, -0.092], [0.09, -0.03]], 0.048, wood),
      B(0.05, 0.172, 0.018, rubber, 0, -0.044, 0.405, 0.04));
    info = { len: 0.64, muzzleY: 0.03, grip: [0, -0.07, 0.09], fore: [0, -0.03, -0.25], foreNear: [0, -0.03, -0.2], sight: 0.06 };
  } else if (w === 9) { // Minigun: 6 drehende Läufe mit Klemmen, Motorgehäuse, Tragegriff, Munitionskasten mit Zuführschacht
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; P.push(SP(C(0.011, 0.011, 0.62, steel, Math.cos(a) * 0.032, Math.sin(a) * 0.032, -0.43)), SP(C(0.0045, 0.0045, 0.002, dark, Math.cos(a) * 0.032, Math.sin(a) * 0.032, -0.741))); }
    P.push(SP(C(0.05, 0.05, 0.02, metal, 0, 0, -0.3)), SP(C(0.05, 0.05, 0.02, metal, 0, 0, -0.52)), SP(C(0.05, 0.05, 0.03, metal, 0, 0, -0.7)), SP(C(0.016, 0.016, 0.64, metal, 0, 0, -0.43)),
      C(0.058, 0.058, 0.2, metal, 0, 0, -0.04, 20), C(0.062, 0.062, 0.012, steel, 0, 0, -0.14, 20), B(0.11, 0.1, 0.16, metal, 0, 0, 0.14), C(0.04, 0.04, 0.08, poly, 0, 0, 0.26), C(0.03, 0.03, 0.02, steel, 0, 0, 0.31),
      GPROF([[-0.1, 0.07], [-0.09, 0.11], [0.14, 0.11], [0.15, 0.07], [0.13, 0.07], [0.12, 0.095], [-0.07, 0.095], [-0.08, 0.07]], 0.022, metal),
      PGRIP(poly, 0.17, -0.05, 0.11), TRIG(steel, 0.18, -0.056),
      M(GPROF([[-0.05, -0.09], [0.12, -0.09], [0.12, -0.23], [-0.05, -0.23]], 0.13, tan)), M(B(0.134, 0.012, 0.172, metal, 0.02, -0.092, 0.035)));
    for (let k = 0; k < 4; k++) P.push(B(0.05, 0.03, 0.03, metal, 0.03, -0.05 - k * 0.012, -0.03 - k * 0.025, 0.4));   // Zuführschacht
    info = { len: 0.74, muzzleY: 0, grip: [0, -0.07, 0.2], fore: [0, 0.1, 0.02], foreNear: [0, 0.1, 0.02], sight: 0.13 };
  } else if (w === 10) { // Panzerfaust-Rohr (RPG-Bauart): Rohr mit Holz-Hitzeschutz, Trichter hinten, Optik links, zwei Griffe, aufgesteckte Granate
    P.push(C(0.032, 0.032, 0.9, olive, 0, 0, -0.05, 18), C(0.042, 0.042, 0.3, wood, 0, 0, -0.03, 16), C(0.044, 0.044, 0.012, metal, 0, 0, -0.18), C(0.044, 0.044, 0.012, metal, 0, 0, 0.12),
      C(0.032, 0.062, 0.12, metal, 0, 0, 0.46, 18, true), C(0.036, 0.036, 0.03, metal, 0, 0, -0.49), C(0.028, 0.028, 0.002, dark, 0, 0, 0.52),
      M(C(0.026, 0.03, 0.08, olive, 0, 0, -0.54)), M(C(0.044, 0.03, 0.05, olive, 0, 0, -0.605)), M(C(0.044, 0.044, 0.09, olive, 0, 0, -0.675)),
      M({ geo: new THREE.ConeGeometry(0.044, 0.15, 16), mat: olive, p: [0, 0, -0.795], r: [-Math.PI / 2, 0, 0] }), M(C(0.008, 0.008, 0.05, steel, 0, 0, -0.89)),
      PGRIP(poly, 0.0, -0.03, 0.11), TRIG(steel, 0.012, -0.04), B(0.03, 0.03, 0.06, metal, 0, -0.03, 0.02),
      GPROF([[-0.3, -0.03], [-0.26, -0.03], [-0.25, -0.13], [-0.29, -0.135]], 0.03, poly),
      B(0.022, 0.05, 0.13, metal, -0.055, 0.055, 0.03), C(0.016, 0.016, 0.04, metal, -0.055, 0.06, 0.115), C(0.014, 0.014, 0.002, glass, -0.055, 0.06, -0.035), B(0.03, 0.02, 0.03, metal, -0.035, 0.035, 0.03),
      B(0.005, 0.03, 0.005, metal, 0, 0.044, -0.3), B(0.02, 0.022, 0.01, metal, 0, 0.042, -0.08));
    info = { len: 0.8, muzzleY: 0, grip: [0, -0.08, 0.02], fore: [0, -0.08, -0.28], foreNear: [0, -0.08, -0.28], sight: 0.1 };
  } else if (w === 11) { // Granatwerfer (6-Schuss-Trommel): Trommel mit Kammern, Rahmen, Lauf, Schiene mit Reflexvisier, Frontgriff, Schaft
    P.push(M(C(0.066, 0.066, 0.14, metal, 0, -0.015, -0.06, 20)));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; P.push(M(C(0.02, 0.02, 0.003, dark, Math.cos(a) * 0.036, -0.015 + Math.sin(a) * 0.036, -0.131)), M(B(0.006, 0.012, 0.13, dark, Math.cos(a + 0.52) * 0.064, -0.015 + Math.sin(a + 0.52) * 0.064, -0.06, 0, 0, a + 0.52))); }
    P.push(GPROF([[-0.15, 0.072], [0.07, 0.072], [0.08, 0.06], [0.08, 0.05], [-0.15, 0.05]], 0.05, metal), GPROF([[-0.15, -0.078], [0.07, -0.078], [0.07, -0.096], [-0.15, -0.096]], 0.05, metal),
      C(0.03, 0.03, 0.26, steel, 0, 0.02, -0.27), C(0.025, 0.025, 0.002, dark, 0, 0.02, -0.401), C(0.034, 0.034, 0.03, metal, 0, 0.02, -0.39));
    rail(-0.14, 0.06, 0.08);
    P.push(B(0.034, 0.03, 0.05, metal, 0, 0.1, -0.03), B(0.03, 0.026, 0.004, glass, 0, 0.11, -0.055), B(0.03, 0.02, 0.06, metal, 0, -0.012, -0.25), GPROF([[-0.27, -0.016], [-0.23, -0.016], [-0.225, -0.13], [-0.265, -0.135]], 0.032, poly),
      PGRIP(poly, 0.06, -0.06, 0.11), GUARD(metal, 0.02, 0.09, -0.06, -0.09), TRIG(steel, 0.045, -0.066),
      C(0.016, 0.016, 0.26, metal, 0, 0.0, 0.19), GPROF([[0.27, 0.03], [0.33, 0.03], [0.34, -0.09], [0.31, -0.095], [0.27, -0.03]], 0.05, poly), B(0.05, 0.13, 0.012, rubber, 0, -0.03, 0.345));
    info = { len: 0.46, muzzleY: 0.02, grip: [0, -0.09, 0.09], fore: [0, -0.08, -0.25], foreNear: [0, -0.08, -0.25], sight: 0.1 };
  } else if (w === 12) { // Flammenwerfer: Treibstoff- und Drucktank, Schlauch, Lauf mit gelochtem Hitzeschild, Düse mit Zündflamme, Ventilrad, zwei Griffe
    P.push(M(C(0.038, 0.038, 0.3, olive, 0.042, -0.095, 0.03)), M(C(0.03, 0.03, 0.28, steel, -0.04, -0.09, 0.03)),
      M(SPH(0.038, olive, 0.042, -0.095, -0.12, 1, 1, 0.5)), M(SPH(0.038, olive, 0.042, -0.095, 0.18, 1, 1, 0.5)), M(SPH(0.03, steel, -0.04, -0.09, -0.11, 1, 1, 0.5)), M(SPH(0.03, steel, -0.04, -0.09, 0.17, 1, 1, 0.5)),
      B(0.11, 0.02, 0.05, metal, 0, -0.05, 0.03), B(0.11, 0.02, 0.05, metal, 0, -0.05, -0.08),
      { geo: new THREE.TorusGeometry(0.05, 0.008, 6, 14, Math.PI), mat: rubber, p: [0.045, -0.05, 0.2], r: [0, Math.PI / 2, 0] },
      C(0.02, 0.022, 0.56, steel, 0, 0.02, -0.33), C(0.034, 0.034, 0.22, metal, 0, 0.02, -0.21, 16, true), C(0.026, 0.02, 0.06, metal, 0, 0.02, -0.63), C(0.008, 0.008, 0.002, dark, 0, 0.02, -0.661),
      B(0.014, 0.014, 0.04, metal, 0.022, 0.0, -0.62), SPH(0.01, GUN_MATS.flame, 0.022, -0.01, -0.645),
      GPROF([[-0.06, 0.05], [0.12, 0.05], [0.13, 0.03], [0.13, -0.01], [-0.06, -0.01]], 0.052, metal),
      { geo: new THREE.TorusGeometry(0.02, 0.004, 6, 16), mat: red, p: [0.032, 0.03, -0.02], r: [0, Math.PI / 2, 0] },
      PGRIP(poly, 0.08, -0.01, 0.1), TRIG(steel, 0.09, -0.016), GPROF([[-0.24, -0.0], [-0.2, -0.0], [-0.195, -0.1], [-0.235, -0.105]], 0.032, poly));
    for (let k = 0; k < 8; k++) P.push(C(0.0345, 0.0345, 0.008, dark, 0, 0.02, -0.12 - k * 0.022, 16, true));
    info = { len: 0.64, muzzleY: 0.02, grip: [0, -0.07, 0.12], fore: [0, -0.06, -0.22], foreNear: [0, -0.06, -0.22], sight: 0.07 };
  } else { // Pistole (Polymer-Pistole, 9 mm): kantiger Schlitten mit Griffrillen hinten, abgeschrägte Nase, Griffstück mit Schiene,
    // eckigem Abzugsbügel, Fingermulden und geraster Griffoberfläche, Abzug mit Sicherung, Verschlussfang, Zerlegehebel, weiße Visierpunkte
    P.push(GPROF([[-0.13, 0.017], [0.06, 0.017], [0.06, 0.044], [0.054, 0.051], [-0.115, 0.051], [-0.13, 0.04]], 0.03, metal));   // Schlitten mit abgeschrägter Nase
    for (let i = 0; i < 7; i++) P.push(B(0.0312, 0.024, 0.0025, dark, 0, 0.034, 0.024 + i * 0.0055));
    P.push(B(0.002, 0.014, 0.034, dark, 0.0152, 0.04, -0.012), B(0.016, 0.006, 0.032, steel, 0, 0.0515, -0.012), B(0.02, 0.004, 0.18, metal, 0, 0.052, -0.035),
      C(0.0085, 0.0085, 0.008, steel, 0, 0.03, -0.128), C(0.0045, 0.0045, 0.0025, dark, 0, 0.03, -0.1325),
      GPROF([[-0.122, 0.018], [0.055, 0.018], [0.062, 0.008], [0.074, -0.004], [0.075, -0.018], [0.09, -0.11], [0.083, -0.121], [0.04, -0.121], [0.03, -0.098, 0.024, -0.083], [0.02, -0.068, 0.022, -0.058],
        [0.016, -0.046], [0.012, -0.04], [-0.046, -0.038], [-0.05, -0.034], [-0.05, -0.006], [-0.122, -0.006]], 0.029, poly, 0, [[[-0.042, -0.008], [0.006, -0.008], [0.009, -0.031], [-0.038, -0.031]]]),
      GPROF([[0.074, -0.02], [0.088, -0.106], [0.081, -0.116], [0.044, -0.116], [0.03, -0.096, 0.025, -0.083], [0.021, -0.068, 0.023, -0.058], [0.019, -0.028]], 0.0304, polyGrip, 0, null, undefined, 40),   // geraster Griff (feine Struktur)
      TRIG(steel, -0.017, -0.012), B(0.0015, 0.012, 0.0025, poly, 0, -0.012, -0.0165),
      B(0.03, 0.004, 0.004, dark, 0, -0.006, -0.085), B(0.03, 0.004, 0.004, dark, 0, -0.006, -0.097), B(0.03, 0.004, 0.004, dark, 0, -0.006, -0.109),   // Zubehörschiene
      B(0.003, 0.006, 0.022, metal, -0.0158, 0.015, -0.018), B(0.0032, 0.005, 0.008, metal, 0.0156, 0.011, -0.046), B(0.0032, 0.005, 0.008, metal, -0.0156, 0.011, -0.046),
      B(0.004, 0.009, 0.006, poly, 0.0152, -0.022, 0.006),
      B(0.005, 0.008, 0.005, steel, 0, 0.0555, -0.115), SPH(0.0018, GUN_MATS.white, 0, 0.0575, -0.112),
      B(0.007, 0.01, 0.008, steel, 0.008, 0.056, 0.05), B(0.007, 0.01, 0.008, steel, -0.008, 0.056, 0.05), B(0.002, 0.003, 0.001, GUN_MATS.white, 0.008, 0.058, 0.046), B(0.002, 0.003, 0.001, GUN_MATS.white, -0.008, 0.058, 0.046),
      M(GPROF([[0.04, -0.118], [0.084, -0.118], [0.086, -0.128], [0.038, -0.128]], 0.03, poly)));
    info = { len: 0.145, muzzleY: 0.03, grip: [0, -0.05, 0.04], fore: [-0.012, -0.07, 0.035], foreNear: [-0.012, -0.07, 0.035], sight: 0.058 };
  }
  info.parts = P;
  return info;
}
/* --- alte Modelle (nicht mehr benutzt, nur als Rückfall) --- */
function makeGunOld(w) {
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
  } else if (w === 9) { // Minigun: 6 drehende Läufe (Achse bei y = 0), Motorgehäuse, Tragegriff oben, Munitionskasten
    const SP = pt => (pt.spin = true, pt);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; P.push(SP(C(0.011, 0.011, 0.62, steel, Math.cos(a) * 0.032, Math.sin(a) * 0.032, -0.43))); }
    P.push(SP(C(0.05, 0.05, 0.025, metal, 0, 0, -0.3)), SP(C(0.05, 0.05, 0.025, metal, 0, 0, -0.68)), SP(C(0.016, 0.016, 0.64, metal, 0, 0, -0.43)),
      C(0.055, 0.055, 0.2, metal, 0, 0, -0.03), B(0.1, 0.1, 0.16, metal, 0, 0, 0.14), C(0.04, 0.04, 0.06, poly, 0, 0, 0.25),
      B(0.022, 0.022, 0.24, metal, 0, 0.1, 0.02), B(0.02, 0.05, 0.02, metal, 0, 0.07, -0.08), B(0.02, 0.05, 0.02, metal, 0, 0.07, 0.12),   // Tragegriff
      B(0.035, 0.1, 0.045, poly, 0, -0.09, 0.2, -0.3), B(0.004, 0.025, 0.006, steel, 0, -0.05, 0.16),
      M(B(0.13, 0.13, 0.15, tan, 0.02, -0.15, 0.06)), B(0.035, 0.09, 0.035, metal, 0.05, -0.06, -0.04));
    info = { len: 0.74, muzzleY: 0, grip: [0, -0.07, 0.2], fore: [0, 0.1, 0.02], foreNear: [0, 0.1, 0.02], sight: 0.13 };
  } else if (w === 10) { // Raketenwerfer: Rohr mit Trichter, Rakete vorne (verschwindet beim Nachladen), Visier, Griffe
    P.push(C(0.055, 0.055, 1.0, tan, 0, 0, -0.2), C(0.075, 0.055, 0.08, metal, 0, 0, 0.33), C(0.062, 0.062, 0.05, metal, 0, 0, -0.66),
      M(C(0.045, 0.045, 0.1, tan, 0, 0, -0.74)), M({ geo: new THREE.ConeGeometry(0.045, 0.22, 12), mat: red, p: [0, 0, -0.89], r: [-Math.PI / 2, 0, 0] }),
      B(0.035, 0.1, 0.045, poly, 0, -0.09, 0.02, -0.3), B(0.032, 0.09, 0.04, poly, 0, -0.085, -0.28, -0.2), B(0.004, 0.025, 0.006, steel, 0, -0.05, -0.02),
      B(0.03, 0.05, 0.08, metal, 0.065, 0.05, -0.12), C(0.016, 0.016, 0.05, glass, 0.065, 0.075, -0.12), B(0.06, 0.03, 0.12, rubber, 0, 0.06, 0.15));
    info = { len: 0.8, muzzleY: 0, grip: [0, -0.08, 0.02], fore: [0, -0.08, -0.28], foreNear: [0, -0.08, -0.28], sight: 0.1 };
  } else if (w === 11) { // Granatwerfer: Trommel, kurzer dicker Lauf, Klappschaft
    P.push(M(C(0.072, 0.072, 0.13, metal, 0, -0.01, -0.06, 6)), C(0.03, 0.03, 0.06, steel, 0, -0.01, 0.03),
      C(0.032, 0.032, 0.3, steel, 0, 0.02, -0.3), C(0.038, 0.038, 0.04, metal, 0, 0.02, -0.44), B(0.05, 0.04, 0.32, metal, 0, 0.065, -0.2),
      B(0.035, 0.1, 0.045, poly, 0, -0.1, 0.09, -0.3), B(0.03, 0.08, 0.04, poly, 0, -0.08, -0.25), B(0.004, 0.025, 0.006, steel, 0, -0.06, 0.06),
      B(0.03, 0.03, 0.22, metal, 0, 0.0, 0.22), B(0.05, 0.09, 0.02, rubber, 0, -0.02, 0.33), B(0.02, 0.05, 0.02, metal, 0, 0.1, -0.1));
    info = { len: 0.46, muzzleY: 0.02, grip: [0, -0.09, 0.09], fore: [0, -0.08, -0.25], foreNear: [0, -0.08, -0.25], sight: 0.1 };
  } else if (w === 12) { // Flammenwerfer: zwei Tanks, lange Düse mit Hitzeschild, Zündflamme
    P.push(M(C(0.035, 0.035, 0.3, red, 0.04, -0.09, 0.03)), M(C(0.035, 0.035, 0.3, red, -0.04, -0.09, 0.03)), B(0.1, 0.02, 0.05, metal, 0, -0.05, 0.03),
      C(0.018, 0.022, 0.55, steel, 0, 0.02, -0.33), C(0.034, 0.034, 0.22, metal, 0, 0.02, -0.2), C(0.026, 0.02, 0.05, metal, 0, 0.02, -0.62),
      B(0.05, 0.06, 0.2, metal, 0, 0.02, 0.05), B(0.035, 0.1, 0.045, poly, 0, -0.07, 0.12, -0.3), B(0.032, 0.09, 0.04, poly, 0, -0.06, -0.22),
      B(0.004, 0.025, 0.006, steel, 0, -0.03, 0.09), SPH(0.012, GUN_MATS.flame || red, 0, -0.005, -0.64));
    info = { len: 0.64, muzzleY: 0.02, grip: [0, -0.07, 0.12], fore: [0, -0.06, -0.22], foreNear: [0, -0.06, -0.22], sight: 0.07 };
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
// Waffenläden (map.js): Waffen an der Wand und auf der Theke aufstellen (weit weg werden sie ausgeblendet, siehe cullChunks)
window.SHOP_DISPLAYS = [];
for (const s of window.GUN_SHOPS || []) {
  const grp = new THREE.Group();
  for (const d of s.displays || []) {
    const g = new THREE.Group(); makeGunParts(d.w, g, false); g.userData.w = d.w; g.userData.s0 = d.lie ? 1.25 : 1.45;
    g.position.set(d.x, d.y, d.z); g.rotation.set(0, d.ry, d.rz); g.scale.setScalar(d.lie ? 1.25 : 1.45); grp.add(g);
  }
  grp.userData.c = [s.x, s.z]; scene.add(grp); window.SHOP_DISPLAYS.push(grp);
}
let gunInfo = null;
// Waffe in der Hand: Hauptteil + bewegliche Teile (Magazin, Pumpe, Verschluss, linke Hand)
const vm = { main: null, mag: null, pump: null, bolt: null, left: null, eject: null };
function buildViewGun(w) {
  while (viewGun.children.length) viewGun.remove(viewGun.children[0]);
  gunInfo = makeGun(w);
  const all = gunInfo.parts, gr = gunInfo.grip, fo = gunInfo.fore;
  const main = all.filter(p => !p.mag && !p.pump && !p.bolt && !p.spin), left = [];
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
  const sp = all.filter(p => p.spin); vm.spin = sp.length ? partsToGroup(sp) : null; if (vm.spin) viewGun.add(vm.spin);
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
