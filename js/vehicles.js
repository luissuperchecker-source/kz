'use strict';
/* ======================= Mopeds (im Stil der Simson S51) – fahrbar ======================= */
// Farben wie bei den klassischen Mopeds aus der DDR – glänzender Klarlack
const MOPED_PAINTS = [0x2a6fb5, 0xc0262b, 0x2f8f4a, 0xe8a92a, 0xd9c9a0, 0x1c1c1c, 0x6d8fb0, 0xd25a1e]
  .map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3 }));
// Texturen: Reifenprofil, genarbtes Sitzbank-Leder
const TREAD_TEX = canvasTex((g, s) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 8) { g.fillStyle = '#202020'; g.fillRect(x, 0, 3, s * 0.45); g.fillRect(x + 4, s * 0.55, 3, s * 0.45); }
}, 64);
TREAD_TEX.repeat.set(10, 1);
const SEAT_TEX = canvasTex((g, s) => {
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 10) { g.fillStyle = '#3a3a3a'; g.fillRect(0, y, s, 2); }
  speckle(g, s, 3000, '0,0,0', 0.25, 1.2);
}, 64);
const MOPED = {
  seat: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5, bumpMap: SEAT_TEX, bumpScale: 0.004 }),
  alu: new THREE.MeshStandardMaterial({ map: GUN_TEX, color: 0xeeeef0, roughness: 0.38, metalness: 0.85 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.9, bumpMap: TREAD_TEX, bumpScale: 0.01 }),
  lens: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 0.9, roughness: 0.05 }),
  rear: new THREE.MeshStandardMaterial({ color: 0x770000, emissive: 0xff2020, emissiveIntensity: 0.7, roughness: 0.1 }),
  blink: new THREE.MeshStandardMaterial({ color: 0xcc6a00, emissive: 0xff8a00, emissiveIntensity: 0.4, roughness: 0.1 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
  chain: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.8 }),
  mirror: new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.02, metalness: 1 }),
  dial: new THREE.MeshStandardMaterial({ color: 0xf0f0e8, emissive: 0x404038, roughness: 0.4 }),
  hose: new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.75, bumpMap: TREAD_TEX, bumpScale: 0.003 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.55, metalness: 0.6 }),
};
// Schriftzüge (Tank „SIMSON“, Seitendeckel „S51“) als Aufkleber
function decalMat(text, font, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = h * 0.12; g.strokeStyle = 'rgba(20,20,20,.9)'; g.strokeText(text, w / 2, h / 2 + 2);
  g.fillStyle = '#f4f1e6'; g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.25, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}
const DECAL_TANK = decalMat('SIMSON', 'italic 900 92px Arial', 512, 128);
const DECAL_S51 = decalMat('S51', 'italic 900 100px Arial', 256, 128);
const mDecal = (mat, w, h, x, y, z, side, tilt = 0) => ({ geo: new THREE.PlaneGeometry(w, h), mat, p: [x, y, z], r: [0, side > 0 ? 0 : Math.PI, tilt * side] });
// Bausteine: gebogene Rohre, Spiralfedern, geformte Teile
const tube = (pts, r, mat, seg = 32, radial = 10) => ({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), Math.min(seg, 18), r, Math.min(radial, r > 0.015 ? 7 : 5), false), mat, p: [0, 0, 0], r: [0, 0, 0] });
class HelixCurve extends THREE.Curve {
  constructor(r, h, turns) { super(); this.rad = r; this.h = h; this.turns = turns; }
  getPoint(u, t = new THREE.Vector3()) { const a = u * this.turns * Math.PI * 2; return t.set(Math.cos(a) * this.rad, u * this.h, Math.sin(a) * this.rad); }
}
const spring = (x, y, z, h, tilt, mat) => ({ geo: new THREE.TubeGeometry(new HelixCurve(0.028, h, 8), 56, 0.0055, 4, false), mat, p: [x, y, z], r: [0, 0, tilt] });
const WHEEL_R = 0.3, STEER_RAKE = 0.27;   // Lenkkopfwinkel (Gabel ist nach hinten geneigt)
function makeWheel(front) {
  const g = new THREE.Group();
  const parts = [
    { geo: new THREE.TorusGeometry(WHEEL_R - 0.046, 0.046, 12, 40), mat: MOPED.tire, p: [0, 0, 0], r: [0, 0, 0] },        // Reifen mit Profil
    { geo: new THREE.TorusGeometry(WHEEL_R - 0.088, 0.011, 6, 40), mat: CHROME, p: [0, 0, 0], r: [0, 0, 0] },             // Felge
    { geo: new THREE.CylinderGeometry(WHEEL_R - 0.078, WHEEL_R - 0.078, 0.03, 40, 1, true), mat: CHROME, p: [0, 0, 0], r: [Math.PI / 2, 0, 0] },
    C(0.07, 0.07, 0.08, MOPED.alu, 0, 0, 0, 20), C(0.075, 0.075, 0.012, MOPED.alu, 0, 0, front ? 0.042 : -0.042, 20),     // Trommelbremse
    C(0.022, 0.022, 0.13, CHROME, 0, 0, 0, 10),                                                                           // Achse
  ];
  for (let i = 0; i < 28; i++) {   // 28 gekreuzte Speichen
    const a = i / 28 * Math.PI * 2, s = i % 2 ? 1 : -1, o = s * 0.5;
    parts.push(limbPart([Math.cos(a + o) * 0.055, Math.sin(a + o) * 0.055, s * 0.035], [Math.cos(a) * (WHEEL_R - 0.09), Math.sin(a) * (WHEEL_R - 0.09), 0], 0.0025, 0.0025, CHROME, 4));
  }
  g.add(partsToGroup(parts, true));
  return g;
}
// Moped-Modell: vorne = +x, Räder bei x = +0.62 / -0.6
function makeMoped(paint) {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const P = MOPED, pt = paint;
  const fender = (cx, start, len, w) => ({ geo: new THREE.CylinderGeometry(WHEEL_R + 0.045, WHEEL_R + 0.045, w, 24, 1, true, start, len), mat: pt, p: [cx, WHEEL_R, 0], r: [Math.PI / 2, 0, 0] });
  // Tank: geformt, unten breiter, mit Knieschutz und Chromleiste
  const tank = { geo: loftGeo(24, 20, u => ({ x: 0.17 + u * 0.26, bottom: 0.71 + 0.03 * u, top: curve([[-1, 0.86], [-0.4, 0.935], [0.5, 0.93], [1, 0.87]], u),
    halfW: curve([[-1, 0.1], [-0.3, 0.145], [0.6, 0.14], [1, 0.09]], u), p: 2.5 }), 6), mat: pt, p: [0, 0, 0], r: [0, 0, 0] };
  const seat = { geo: loftGeo(24, 18, u => ({ x: -0.46 + u * 0.4, bottom: 0.79, top: curve([[-1, 0.875], [-0.6, 0.93], [0.6, 0.94], [1, 0.9]], u),
    halfW: curve([[-1, 0.1], [0, 0.125], [1, 0.115]], u), p: 3.2 }), 8), mat: P.seat, p: [0, 0, 0], r: [0, 0, 0] };
  const body = [
    tank, seat,
    B(0.1, 0.055, 0.01, P.rubber, 0.02, 0.785, 0.133), B(0.1, 0.055, 0.01, P.rubber, 0.02, 0.785, -0.133),        // Knieschutz
    tube([[-0.05, 0.93, 0], [0.18, 0.95, 0], [0.38, 0.9, 0]], 0.006, CHROME, 12, 5),                                 // Zierleiste
    CY(0.028, 0.02, CHROME, 0.25, 0.935, 0, 18),                                                                       // Tankdeckel
    tube([[-0.86, 0.79, 0.12], [-0.46, 0.79, 0.128], [-0.07, 0.79, 0.118]], 0.008, CHROME, 12, 5),                 // Sitzbank-Zierleiste
    tube([[-0.86, 0.79, -0.12], [-0.46, 0.79, -0.128], [-0.07, 0.79, -0.118]], 0.008, CHROME, 12, 5),
    // Rohrrahmen (gebogen)
    tube([[0.43, 0.98, 0], [0.32, 0.86, 0], [0.12, 0.7, 0], [-0.04, 0.56, 0], [-0.06, 0.4, 0]], 0.03, pt),
    tube([[-0.04, 0.6, 0.09], [-0.35, 0.74, 0.1], [-0.84, 0.8, 0.1]], 0.017, pt), tube([[-0.04, 0.6, -0.09], [-0.35, 0.74, -0.1], [-0.84, 0.8, -0.1]], 0.017, pt),
    B(0.34, 0.2, 0.3, pt, -0.27, 0.66, 0),                                                                            // Seitendeckel
    ...[0, 1].map(i => B(0.2, 0.012, 0.31, P.rubber, -0.27, 0.6 + i * 0.03, 0)),                                      // Lüftungsschlitze
    mDecal(DECAL_S51, 0.12, 0.06, -0.27, 0.705, 0.152, 1), mDecal(DECAL_S51, 0.12, 0.06, -0.27, 0.705, -0.152, -1),
    mDecal(DECAL_TANK, 0.16, 0.04, 0.26, 0.845, 0.1465, 1, 0.08), mDecal(DECAL_TANK, 0.16, 0.04, 0.26, 0.845, -0.1465, -1, 0.08),
    // Sitzbank-Haltegurt, Benzinhahn + Spritschlauch, Zündkerzenstecker + Kabel, Hupe, Zündschloss
    tube([[-0.36, 0.84, -0.128], [-0.36, 0.925, -0.09], [-0.36, 0.947, 0], [-0.36, 0.925, 0.09], [-0.36, 0.84, 0.128]], 0.007, P.rubber, 14, 4),
    CY(0.012, 0.04, CHROME, 0.03, 0.69, -0.075, 8), tube([[0.03, 0.67, -0.075], [0.06, 0.62, -0.08], [0.05, 0.58, -0.07]], 0.006, P.hose, 8, 5),
    CY(0.014, 0.045, P.rubber, 0.285, 0.73, 0, 10), tube([[0.285, 0.75, 0], [0.3, 0.8, 0.03], [0.2, 0.74, 0.07], [0.05, 0.7, 0.08]], 0.005, P.rubber, 14, 5),
    // Gepäckträger aus Rohr
    tube([[-0.6, 0.86, 0.11], [-0.92, 0.88, 0.11], [-0.94, 0.88, 0], [-0.92, 0.88, -0.11], [-0.6, 0.86, -0.11]], 0.008, CHROME, 24, 6),
    tube([[-0.68, 0.87, 0.11], [-0.68, 0.87, -0.11]], 0.006, CHROME, 4, 5), tube([[-0.8, 0.875, 0.11], [-0.8, 0.875, -0.11]], 0.006, CHROME, 4, 5),
    tube([[0.44, 1.05, 0.05], [0.4, 0.95, 0.1], [0.2, 0.72, 0.1], [0.05, 0.55, 0.08]], 0.004, P.rubber, 16, 4),       // Bowdenzug
    // Schutzbleche + Streben + Schmutzfänger
    fender(-0.6, Math.PI * 0.86, Math.PI * 0.82, 0.12),
    B(0.012, 0.12, 0.1, P.rubber, -0.97, 0.38, 0),
    // Motor: Kurbelgehäuse, Seitendeckel, Zylinder mit Kühlrippen, Zylinderkopf, Kerze, Vergaser, Luftfilter
    B(0.3, 0.22, 0.2, P.alu, 0.0, 0.42, 0), C(0.11, 0.11, 0.035, P.alu, -0.02, 0.42, 0.11, 24), C(0.095, 0.095, 0.03, P.alu, 0.06, 0.4, -0.11, 24),
    { geo: new THREE.CylinderGeometry(0.045, 0.045, 0.2, 18), mat: P.alu, p: [0.17, 0.54, 0], r: [0, 0, -0.55] },
    ...[0, 1, 2, 3, 4, 5, 6].map(i => ({ geo: new THREE.CylinderGeometry(0.085 - i * 0.002, 0.085 - i * 0.002, 0.007, 20), mat: P.alu, p: [0.13 + i * 0.016, 0.48 + i * 0.024, 0], r: [0, 0, -0.55] })),
    { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.04, 18), mat: P.alu, p: [0.255, 0.665, 0], r: [0, 0, -0.55] }, CY(0.006, 0.04, CHROME, 0.27, 0.7, 0),
    C(0.025, 0.025, 0.07, P.alu, 0.05, 0.56, -0.07, 14), B(0.12, 0.1, 0.1, P.rubber, -0.08, 0.58, -0.07),
    // Auspuff: gebogenes Krümmerrohr + Schalldämpfer mit Endkappe und Hitzeschutz
    tube([[0.24, 0.53, 0.05], [0.33, 0.44, 0.09], [0.3, 0.3, 0.15], [0.12, 0.24, 0.17], [-0.25, 0.27, 0.18], [-0.38, 0.29, 0.18]], 0.022, CHROME, 40, 10),
    { geo: new THREE.CylinderGeometry(0.045, 0.052, 0.5, 20), mat: CHROME, p: [-0.62, 0.32, 0.18], r: [0, 0, Math.PI / 2 - 0.06] },
    { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), mat: P.rubber, p: [-0.875, 0.335, 0.18], r: [0, 0, Math.PI / 2 - 0.06] },
    B(0.3, 0.02, 0.07, P.rubber, -0.58, 0.39, 0.19, 0, 0, -0.06),
    // Schwinge, Federbeine mit echten Spiralfedern, Kette mit Ritzeln, Kettenschutz
    tube([[-0.08, 0.42, 0.11], [-0.35, 0.36, 0.115], [-0.6, WHEEL_R, 0.115]], 0.019, pt, 12, 8), tube([[-0.08, 0.42, -0.11], [-0.35, 0.36, -0.115], [-0.6, WHEEL_R, -0.115]], 0.019, pt, 12, 8),
    limbPart([-0.55, 0.36, 0.125], [-0.64, 0.82, 0.125], 0.012, 0.012, CHROME), limbPart([-0.55, 0.36, -0.125], [-0.64, 0.82, -0.125], 0.012, 0.012, CHROME),
    spring(-0.565, 0.42, 0.125, 0.33, 0.19, CHROME), spring(-0.565, 0.42, -0.125, 0.33, 0.19, CHROME),
    CY(0.03, 0.04, P.rubber, -0.555, 0.39, 0.125, 14), CY(0.03, 0.04, P.rubber, -0.555, 0.39, -0.125, 14),
    // vollgekapselte Kette wie bei der S51: Ritzelgehäuse + zwei Gummi-Kettenschutzschläuche
    C(0.075, 0.075, 0.045, P.alu, 0.04, 0.38, -0.135, 20), C(0.125, 0.125, 0.045, P.dark, -0.6, WHEEL_R, -0.145, 28),
    tube([[0.04, 0.45, -0.15], [-0.2, 0.43, -0.155], [-0.45, 0.41, -0.155], [-0.6, 0.41, -0.15]], 0.02, P.hose, 16, 8),
    tube([[0.04, 0.31, -0.15], [-0.2, 0.27, -0.155], [-0.45, 0.21, -0.155], [-0.6, 0.19, -0.15]], 0.02, P.hose, 16, 8),
    // Rücklicht, Kennzeichen, hintere Blinker, Fußrasten, Bremspedal, Kickstarter
    B(0.08, 0.07, 0.11, P.rubber, -0.92, 0.79, 0), B(0.02, 0.05, 0.09, P.rear, -0.965, 0.79, 0), B(0.012, 0.13, 0.17, P.plate, -0.97, 0.62, 0),
    limbPart([-0.88, 0.8, 0.07], [-0.88, 0.8, 0.17], 0.006, 0.006, CHROME, 6), limbPart([-0.88, 0.8, -0.07], [-0.88, 0.8, -0.17], 0.006, 0.006, CHROME, 6),
    SPH(0.024, P.blink, -0.88, 0.8, 0.19, 1.3, 1, 1), SPH(0.024, P.blink, -0.88, 0.8, -0.19, 1.3, 1, 1),
    limbPart([-0.05, 0.33, 0.12], [-0.05, 0.33, 0.25], 0.014, 0.014, P.rubber, 8), limbPart([-0.05, 0.33, -0.12], [-0.05, 0.33, -0.25], 0.014, 0.014, P.rubber, 8),
    limbPart([-0.42, 0.45, 0.13], [-0.42, 0.45, 0.22], 0.01, 0.01, P.rubber, 8), limbPart([-0.42, 0.45, -0.13], [-0.42, 0.45, -0.22], 0.01, 0.01, P.rubber, 8),
    limbPart([0.0, 0.36, 0.13], [0.16, 0.3, 0.16], 0.008, 0.008, P.alu, 6), limbPart([-0.06, 0.45, -0.13], [-0.2, 0.38, -0.17], 0.008, 0.008, P.alu, 6),
  ];
  root.add(partsToGroup(body, true));
  // Vorderbau (Gabel, Scheinwerfer, Lenker, Spiegel, Schutzblech, Vorderrad) – dreht sich beim Lenken um die schräge Lenkachse
  const front = [
    // Gabel: Gabelbrücke, Standrohre, Faltenbälge, Tauchrohre
    B(0.07, 0.04, 0.2, pt, 0.43, 0.99, 0),
    limbPart([0.47, 0.84, 0.075], [0.43, 0.99, 0.075], 0.019, 0.019, CHROME), limbPart([0.47, 0.84, -0.075], [0.43, 0.99, -0.075], 0.019, 0.019, CHROME),
    ...[0, 1, 2, 3, 4, 5, 6].flatMap(i => { const y = 0.6 + i * 0.033, x = 0.555 - i * 0.008; return [0.075, -0.075].map(z => ({ geo: new THREE.TorusGeometry(0.024, 0.009, 4, 10), mat: P.rubber, p: [x, y, z], r: [Math.PI / 2, 0, 0.25] })); }),
    limbPart([0.62, WHEEL_R, 0.075], [0.56, 0.58, 0.075], 0.024, 0.026, P.alu), limbPart([0.62, WHEEL_R, -0.075], [0.56, 0.58, -0.075], 0.024, 0.026, P.alu),
    // Scheinwerfer: Gehäuse, Chromring, Glas; Tacho; Blinker
    SPH(0.095, pt, 0.49, 0.94, 0, 0.75, 1, 1), { geo: new THREE.TorusGeometry(0.083, 0.01, 8, 28), mat: CHROME, p: [0.56, 0.94, 0], r: [0, Math.PI / 2, 0] },
    { geo: new THREE.CircleGeometry(0.078, 28), mat: P.lens, p: [0.562, 0.94, 0], r: [0, Math.PI / 2, 0] },
    CY(0.038, 0.035, P.rubber, 0.45, 1.06, 0, 20), { geo: new THREE.CircleGeometry(0.032, 20), mat: P.dial, p: [0.45, 1.078, 0], r: [-Math.PI / 2 + 0.3, 0, 0] },
    limbPart([0.48, 0.94, 0.08], [0.48, 0.94, 0.17], 0.006, 0.006, CHROME, 6), limbPart([0.48, 0.94, -0.08], [0.48, 0.94, -0.17], 0.006, 0.006, CHROME, 6),
    SPH(0.025, P.blink, 0.49, 0.94, 0.19, 1.3, 1, 1), SPH(0.025, P.blink, 0.49, 0.94, -0.19, 1.3, 1, 1),
    // Lenker (hochgezogen), Griffe, Hebel, Spiegel
    tube([[0.36, 1.1, -0.33], [0.39, 1.09, -0.2], [0.44, 1.03, -0.07], [0.44, 1.03, 0.07], [0.39, 1.09, 0.2], [0.36, 1.1, 0.33]], 0.011, CHROME, 30, 8),
    limbPart([0.36, 1.1, -0.34], [0.37, 1.1, -0.23], 0.017, 0.017, P.rubber), limbPart([0.37, 1.1, 0.23], [0.36, 1.1, 0.34], 0.017, 0.017, P.rubber),
    limbPart([0.39, 1.1, -0.22], [0.42, 1.1, -0.33], 0.005, 0.005, P.alu, 6), limbPart([0.39, 1.1, 0.22], [0.42, 1.1, 0.33], 0.005, 0.005, P.alu, 6),
    tube([[0.39, 1.1, -0.2], [0.38, 1.25, -0.26], [0.36, 1.33, -0.3]], 0.005, CHROME, 10, 5), tube([[0.39, 1.1, 0.2], [0.38, 1.25, 0.26], [0.36, 1.33, 0.3]], 0.005, CHROME, 10, 5),
    C(0.045, 0.045, 0.012, P.mirror, 0.36, 1.35, -0.31, 18), C(0.045, 0.045, 0.012, P.mirror, 0.36, 1.35, 0.31, 18),
    C(0.038, 0.038, 0.03, P.dark, 0.5, 0.8, 0, 18), C(0.022, 0.022, 0.032, CHROME, 0.5, 0.8, 0, 14),
    CY(0.012, 0.015, CHROME, 0.5, 1.03, 0.04, 10),
    fender(0.62, Math.PI * 0.62, Math.PI * 0.72, 0.1),
    limbPart([0.62, WHEEL_R, 0.065], [0.42, 0.52, 0.065], 0.005, 0.005, CHROME, 6), limbPart([0.62, WHEEL_R, -0.065], [0.42, 0.52, -0.065], 0.005, 0.005, CHROME, 6),
  ];
  const steerPivot = new THREE.Group(); steerPivot.position.set(0.43, 0.99, 0); steerPivot.rotation.z = STEER_RAKE; root.add(steerPivot);
  const steer = new THREE.Group(); steerPivot.add(steer);
  const unRake = new THREE.Group(); unRake.rotation.z = -STEER_RAKE; steer.add(unRake);
  const frontG = new THREE.Group(); frontG.position.set(-0.43, -0.99, 0); unRake.add(frontG);
  frontG.add(partsToGroup(front, true));
  const stand = partsToGroup([limbPart([-0.12, 0.32, -0.12], [-0.2, 0.0, -0.26], 0.012, 0.012, P.rubber), B(0.05, 0.01, 0.04, P.rubber, -0.2, 0.005, -0.26)], true);
  root.add(stand);
  const wf = makeWheel(true); wf.position.set(0.62, WHEEL_R, 0); frontG.add(wf);
  const wr = makeWheel(false); wr.position.set(-0.6, WHEEL_R, 0); root.add(wr);
  scene.add(root);
  return { root, wf, wr, stand, steer };
}
/* ---------- Auto (Sportwagen-Karosserie aus map.js), vorne = +x, 4,6 m lang ---------- */
const CAR_WHEEL_R = 0.36;
function makeCar(paint) {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const body = [
    { geo: CAR_BODY_GEO, mat: paint, p: [0, 0, 0], r: [0, 0, 0] }, { geo: CAR_CABIN_GEO, mat: CAR_GLASS, p: [0, 0, 0], r: [0, 0, 0] },
    B(0.3, 0.04, 1.7, CARBON, 2.08, 0.2, 0), B(0.4, 0.18, 1.6, CARBON, -2.2, 0.3, 0),
    B(0.06, 0.03, 0.7, TAILLIGHT, -2.28, 0.82, 0), B(0.4, 0.045, 1.95, CARBON, -1.95, 1.33, 0, 0, 0, 0.12),
  ];
  for (const s of [-1, 1]) body.push(
    B(0.85, 0.26, 0.06, CAR_BLACK, -0.75, 0.6, s * 0.985, 0, 0, 0.18), B(2.3, 0.07, 0.05, CARBON, 0.05, 0.23, s * 0.95),
    B(0.42, 0.035, 0.2, HEADLIGHT, 1.9, 0.62, s * 0.62, 0, s * 0.4, -0.26), B(0.08, 0.13, 0.5, CAR_BLACK, 2.27, 0.36, s * 0.55),
    B(0.04, 0.04, 0.62, TAILLIGHT, -2.27, 0.8, s * 0.48), B(0.16, 0.08, 0.1, paint, 0.5, 0.93, s * 0.97), B(0.04, 0.04, 0.16, CAR_BLACK, 0.5, 0.9, s * 0.87),
    B(0.05, 0.36, 0.05, CARBON, -1.92, 1.12, s * 0.48), B(0.4, 0.17, 0.035, CARBON, -1.95, 1.3, s * 1.0),
    { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.18, 12), mat: CHROME, p: [-2.3, 0.5, s * 0.12], r: [0, 0, Math.PI / 2] },
    { geo: ARCH_GEO, mat: CAR_BLACK, p: [1.42, CAR_WHEEL_R, s * 0.97], r: [0, 0, 0] }, { geo: ARCH_GEO, mat: CAR_BLACK, p: [-1.45, CAR_WHEEL_R, s * 0.97], r: [0, 0, 0] });
  root.add(partsToGroup(body, true));
  // Räder: Lenk-Gelenk (vorne) → drehendes Rad mit Reifen, Felge, Speichen
  const spinners = [], fronts = [];
  for (const wx of [1.42, -1.45]) for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(wx, CAR_WHEEL_R, s * 0.9); root.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const parts = [
      { geo: new THREE.CylinderGeometry(CAR_WHEEL_R, CAR_WHEEL_R, 0.3, 24), mat: TIRE, p: [0, 0, 0], r: [Math.PI / 2, 0, 0] },
      { geo: new THREE.CylinderGeometry(CAR_WHEEL_R * 0.74, CAR_WHEEL_R * 0.74, 0.31, 24), mat: RIM, p: [0, 0, 0], r: [Math.PI / 2, 0, 0] },
      { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), mat: CAR_BLACK, p: [0, 0, s * 0.16], r: [Math.PI / 2, 0, 0] },
    ];
    for (let k = 0; k < 10; k++) parts.push({ geo: SPOKE_GEO[0], mat: CHROME, p: [0, 0, s * 0.15], r: [0, 0, k / 10 * Math.PI] });
    spin.add(partsToGroup(parts, true));
    pivot.add(partsToGroup([B(0.16, 0.1, 0.06, CALIPER, 0.13, 0.08, s * 0.1, 0, 0, 0.6)], true));
    spinners.push(spin); if (wx > 0) fronts.push(pivot);
  }
  scene.add(root);
  const dummy = new THREE.Group();
  return { root, spinners, fronts, steer: dummy, stand: dummy, wf: dummy, wr: dummy, car: true };
}
const CAR_PAINTS = [0xc0262b, 0x1f5fe0, 0xf2f2f2, 0x18191b, 0x5cc21c, 0xffc300, 0x7a7f86, 0xff7300]
  .map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3 }));

/* ---------- Zustand ---------- */
// Für alle Spieler gleich (Abstellplätze aus der Karte); Host verteilt Position/Fahrer per Snapshot
const vehicles = MAP_VEHICLES.map((v, i) => {
  const kind = v.kind || 'moped';
  const m = kind === 'car' ? makeCar(CAR_PAINTS[i % CAR_PAINTS.length]) : makeMoped(MOPED_PAINTS[i % MOPED_PAINTS.length]);
  return { i, kind, x: v.x, y: 0, z: v.z, yaw: v.yaw, lean: 0, d: 0, mesh: m, spin: 0, rx: v.x, rz: v.z, ry: 0 };
});
const RIDER_BACK = 0.42, RIDER_UP = 0.1;   // Sitzposition des Fahrers relativ zum Moped
const RIDE_GRAV = 15;   // etwas weniger Schwerkraft fürs Moped = schönere Sprünge
// Fahrzeug-Eigenschaften: Sitz, Größe, Tempo, Lenkung, Kamera, Ein-/Ausstieg
const VK = {
  moped: { name: 'Moped', back: RIDER_BACK, up: RIDER_UP, r: PR, h: 1.3, max: 16.8, acc: 6.5, top: 18, brake: 14, rev: -3.5, coast: 1.6, steer: 2.1, steerHi: 14,
    camD: 4.2, camH: 1.55, eyeUp: 1.5, eyeF: 0.08, eyeSide: 0, exitSide: 1.1, exitBack: 1.5, enter: 3.0, farDraw: 70 },
  car: { name: 'Auto', back: 0.1, up: 0, r: 1.25, h: 1.4, max: 32, acc: 8.5, top: 35, brake: 22, rev: -7, coast: 2.6, steer: 1.6, steerHi: 34,
    camD: 7.2, camH: 2.4, eyeUp: 1.08, eyeF: -0.15, eyeSide: -0.38, exitSide: 2.0, exitBack: 3.3, enter: 3.8, farDraw: 140 },
};
const ride = { v: -1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, speed: 0, lean: 0, onGround: true, h: 1.3, lastMouse: 0 };
let myRider = null;

// Gerade abgestiegen: dieses Moped gilt kurz als frei, auch wenn ein älteres Netzwerk-Update noch „besetzt“ meldet
const rideLeft = { v: -1, t: 0 };
const freeForMe = v => !v.d || v.d === myId && ride.v !== v.i || (rideLeft.v === v.i && performance.now() - rideLeft.t < 1500);
function nearestFreeVehicle() {
  let best = -1, bd = 1e9;
  for (const v of vehicles) {
    if (!freeForMe(v)) continue;
    const d = Math.hypot(v.x - me.pos.x, v.z - me.pos.z);
    if (d < VK[v.kind].enter && d < bd && Math.abs(v.y - me.pos.y) < 2.2) { bd = d; best = v.i; }
  }
  return best;
}
// E: auf-/absteigen
let enterPending = 0;
function toggleRide() {
  if (!me.alive) return;
  if (ride.v >= 0) return exitRide();
  if (performance.now() - enterPending < 400) return;   // Anfrage läuft noch
  const i = nearestFreeVehicle();
  if (i < 0) {
    // Moped in der Nähe, aber besetzt?
    const busy = vehicles.find(v => v.d && v.d !== myId && Math.hypot(v.x - me.pos.x, v.z - me.pos.z) < VK[v.kind].enter); if (busy) showMsg(busy.kind === 'car' ? 'Dieses Auto ist besetzt' : 'Dieses Moped ist besetzt');
    return;
  }
  const t0 = enterPending = performance.now();
  net.send({ t: 'enter', v: i, p: [+me.pos.x.toFixed(2), +me.pos.y.toFixed(2), +me.pos.z.toFixed(2)] });
  // Keine Antwort vom Host (z. B. alte Spielversion beim Host)
  setTimeout(() => { if (enterPending === t0 && ride.v < 0) { enterPending = 0; showMsg('Keine Antwort vom Host – alle Spieler bitte neu laden (F5)'); } }, 1500);
}
// Antwort vom Host, wenn das Aufsteigen nicht geklappt hat
function enterFailed(reason) {
  enterPending = 0;
  showMsg(reason === 'busy' ? 'Das ist schon besetzt' : 'Zu weit weg – näher rangehen');
}
function startRide(i) {
  const v = vehicles[i]; if (!v || ride.v === i || !me.alive) return;
  enterPending = 0; rideLeft.v = -1;
  ride.v = i; ride.pos.set(v.x, v.y, v.z); ride.vel.set(0, 0, 0); ride.yaw = v.yaw; ride.speed = 0; ride.lean = 0; ride.fp = 0;
  ride.wh = 0; ride.whT = 0; ride.whCreep = 0;
  ride.kind = v.kind; const K = VK[v.kind]; ride.h = K.h; ride.r = K.r; ride.runT = {};
  me.scoped = false; me.trigger = false; me.sprintTap = false; me.rideAimT = -9;
  me.yaw = ride.yaw - Math.PI / 2; me.pitch = -0.15;
  if (!myRider) { const mp = world.players[myId] || {}; myRider = makeAvatar({ id: '__me', name: '', color: mp.color || '#ffcc33', team: mp.team, w: me.weapon }); myRider.label.visible = false; myRider.parts.forEach(p => p.userData = {}); }
  myRider.g.visible = v.kind !== 'car'; setAvatarGun(myRider, me.weapon);
  engineSound(true);
  showMsg(v.kind === 'car' ? 'Eingestiegen!  W Gas · S Bremse/rückwärts · A/D lenken · E aussteigen' : 'Aufgestiegen!  W Gas · S Bremse · A/D lenken · Leertaste Wheelie · E absteigen');
}
function exitRide(silent) {
  if (ride.v < 0) return;
  const v = vehicles[ride.v];
  // neben dem Moped absteigen: links, sonst rechts, hinten, vorne – nie in eine Wand oder Schanze
  const fx = Math.cos(ride.yaw), fz = -Math.sin(ride.yaw), sx = Math.sin(ride.yaw), sz = Math.cos(ride.yaw), K = VK[v.kind], S = K.exitSide, Bk = K.exitBack;
  const spots = [[-sx * S, -sz * S], [sx * S, sz * S], [-fx * Bk, -fz * Bk], [fx * Bk * 1.05, fz * Bk * 1.05], [-sx * S * 1.6, -sz * S * 1.6], [sx * S * 1.6, sz * S * 1.6]];
  const p = new THREE.Vector3();
  let placed = false;
  for (const [ox, oz] of spots) {
    p.set(ride.pos.x + ox, 0, ride.pos.z + oz);
    p.y = Math.max(ride.pos.y + 0.05, groundH(p.x, p.z, ride.pos.y));
    if (p.y - ride.pos.y > 0.8) continue;
    _near = nearBoxes(p.x, p.z, 2); _h = PH;
    const blocked = anyOverlap(p) || rayMap(new THREE.Vector3(ride.pos.x, ride.pos.y + 1, ride.pos.z), new THREE.Vector3(ox, 0, oz).normalize(), Math.hypot(ox, oz) + PR);
    _near = boxes;
    if (!blocked) { placed = true; break; }
  }
  if (!placed) p.set(ride.pos.x, ride.pos.y + 0.05, ride.pos.z);
  me.pos.copy(p); me.vel.set(0, 0, 0);
  net.send({ t: 'exit', v: ride.v, s: [ride.pos.x, ride.pos.y, ride.pos.z, ride.yaw] });
  v.x = ride.pos.x; v.y = ride.pos.y; v.z = ride.pos.z; v.yaw = ride.yaw; v.d = 0; v.lean = 0;
  rideLeft.v = ride.v; rideLeft.t = performance.now();
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
  const K = VK[ride.kind || 'moped'], isCar = ride.kind === 'car';
  if (thr > 0) ride.speed += (ride.speed < 0 ? K.brake : K.acc * (1 - ride.speed / K.top)) * thr * dt;
  else if (thr < 0) ride.speed += (ride.speed > 0.3 ? -K.brake : -K.acc * 0.45) * -thr * dt;
  else ride.speed -= Math.sign(ride.speed) * Math.min(Math.abs(ride.speed), K.coast * dt);
  ride.speed = Math.max(K.rev, Math.min(K.max, ride.speed));   // Moped ca. 60 km/h, Auto ca. 115 km/h
  // Lenken: bei Tempo weniger stark, rückwärts umgekehrt
  const sp = Math.abs(ride.speed);
  // Wheelie: Leertaste (Handy: SPRUNG) während der Fahrt → Vorderrad hoch. Mit W geht es höher,
  // S drückt es runter. Wer zu lange Vollgas gibt, kippt nach hinten über.
  const now0 = performance.now() / 1000;
  const wantW = !isCar && keys.Space && ride.onGround && ride.speed > 2.2 && now0 > (ride.whBlock || 0);
  ride.whCreep = wantW && thr > 0 ? (ride.whCreep || 0) + dt * 0.045 : Math.max(0, (ride.whCreep || 0) - dt * 0.3);
  let wt = wantW ? 0.42 + Math.max(0, thr) * 0.24 + Math.min(0.08, sp * 0.005) + ride.whCreep + Math.sin(now0 * 2.3) * 0.03 : 0;
  if (thr < 0) wt = Math.min(wt, 0.08);
  ride.wh = (ride.wh || 0) + (wt - (ride.wh || 0)) * Math.min(1, dt * (wt > (ride.wh || 0) ? 2.2 : 3.2));
  if (ride.wh > 0.98) {   // Überschlag
    ride.wh = 0; ride.whCreep = 0; ride.whBlock = now0 + 1.2; ride.speed *= 0.15;
    sndThud(0.9); me.shake = Math.max(me.shake, 0.6); showMsg('Überschlag! Nicht zu lange Vollgas beim Wheelie');
    ride.whT = 0;
  }
  if (ride.wh > 0.3 && ride.onGround) {
    const before = ride.whT || 0; ride.whT = before + dt;
    if (Math.floor(ride.whT / 5) > Math.floor(before / 5)) { shopState.coins += 10; saveShop(); updateCoins(true); showMsg(`WHEELIE ${Math.floor(ride.whT)} s!  +10 Coins`); }
  } else if (ride.wh < 0.15 && (ride.whT || 0) > 0) {
    if (ride.whT > 1.5 && ride.whT < 5) showMsg(`Wheelie ${ride.whT.toFixed(1)} s`);
    ride.whT = 0;
  }
  const turn = steer * Math.min(1, sp / 3) * (K.steer - Math.min(K.steer * 0.57, sp / K.steerHi)) * Math.sign(ride.speed || 1) * (1 - Math.min(0.5, ride.wh * 0.6));
  ride.yaw += turn * dt;
  ride.lean += ((isCar ? steer * Math.min(1, sp / 15) * 0.05 : -steer * Math.min(1, sp / 9) * 0.42) - ride.lean) * Math.min(1, dt * 6);
  // Lenker sichtbar einschlagen: langsam weit, schnell nur wenig
  ride.st = (ride.st || 0) + (steer * (isCar ? 0.1 + 0.42 * Math.max(0, 1 - sp / 16) : 0.1 + 0.36 * Math.max(0, 1 - sp / 9)) - (ride.st || 0)) * Math.min(1, dt * 9);
  // Eintauchen beim Bremsen, Heck runter beim Gasgeben
  const diveT = (thr < 0 && ride.speed > 1 ? -0.045 : thr > 0 && sp < 12 ? 0.018 : 0) * (isCar ? 0.45 : 1);
  ride.dive = (ride.dive || 0) + (diveT - (ride.dive || 0)) * Math.min(1, dt * 6);
  ride.thr = thr;
  ride.vel.x = Math.cos(ride.yaw) * ride.speed; ride.vel.z = -Math.sin(ride.yaw) * ride.speed;
  // Schanzen: am Boden übernimmt das Moped die Steigung als Aufwärtstempo → an der Kante hebt es ab
  const gh0 = groundH(ride.pos.x, ride.pos.z, ride.pos.y), wasAir = !ride.onGround;
  if (ride.onGround) ride.vel.y = ride.climb || 0;
  ride.vel.y = Math.max(-30, ride.vel.y - RIDE_GRAV * dt);
  const vyBefore = ride.vel.y;
  moveBody(ride, ride.vel.x * dt, ride.vel.y * dt, ride.vel.z * dt);
  ride.climb = ride.onGround ? Math.max(-12, Math.min(12, (groundH(ride.pos.x, ride.pos.z, ride.pos.y) - gh0) / Math.max(dt, 1e-3))) : 0;
  if (!ride.onGround) ride.air = (ride.air || 0) + dt;
  else {
    if (wasAir && ride.air > 0.25) {   // Landung
      const hard = Math.min(1, -vyBefore / 16);
      sndThud(0.3 + hard * 0.6); me.shake = Math.max(me.shake, hard * 0.5); ride.land = hard;
      if (ride.air > 0.6) showMsg(ride.air > 1.2 ? 'MEGA-SPRUNG! ' + ride.air.toFixed(1) + ' s' : 'Sprung! ' + ride.air.toFixed(1) + ' s');
    }
    ride.air = 0;
  }
  ride.land = Math.max(0, (ride.land || 0) - dt * 3);
  // Neigung nach vorne/hinten: am Boden = Steigung, in der Luft langsam nach vorne kippen
  const fx = Math.cos(ride.yaw), fz = -Math.sin(ride.yaw);
  const pitchT = ride.onGround ? Math.atan2(groundH(ride.pos.x + fx * 0.6, ride.pos.z + fz * 0.6, ride.pos.y) - groundH(ride.pos.x - fx * 0.6, ride.pos.z - fz * 0.6, ride.pos.y), 1.2)
    : Math.atan2(ride.vel.y, Math.max(4, sp)) * 0.7;
  ride.pitch = (ride.pitch || 0) + (pitchT - (ride.pitch || 0)) * Math.min(1, dt * (ride.onGround ? 14 : 3));
  if (ride.blocked && sp > 2.5) { if (sp > 8) { sndThud(0.8); me.shake = Math.max(me.shake, 0.4); } ride.speed *= 0.25; }
  if (ride.pos.y < -10) ride.pos.set(0, 2, 0);
  // Spielerposition = auf dem Sitz
  me.pos.set(ride.pos.x - Math.cos(ride.yaw) * K.back, ride.pos.y + K.up, ride.pos.z + Math.sin(ride.yaw) * K.back);
  me.vel.set(ride.vel.x, 0, ride.vel.z); me.onGround = true;
  const v = vehicles[ride.v]; v.x = ride.pos.x; v.y = ride.pos.y; v.z = ride.pos.z; v.yaw = ride.yaw; v.lean = ride.lean; v.wh = ride.wh; v.st = ride.st;
  // Kamera: hinter dem Fahrer, Maus schaut sich um; ohne Maus richtet sie sich langsam nach vorne aus
  const aiming = riderAiming();
  if (performance.now() - ride.lastMouse > 1500 && sp > 3 && !aiming) {
    let d = (ride.yaw - Math.PI / 2) - me.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    me.yaw += d * Math.min(1, dt * 2.5); me.pitch += (-0.15 - me.pitch) * Math.min(1, dt * 2);
  }
  // Zielen (Schießen / Rechtsklick) = Ego-Ansicht mit der Waffe direkt neben dir, sonst Ansicht von hinten
  ride.fp = (ride.fp || 0) + ((aiming ? 1 : 0) - (ride.fp || 0)) * Math.min(1, dt * 11);
  const fpK = ride.fp * ride.fp * (3 - 2 * ride.fp);
  const target = new THREE.Vector3(ride.pos.x, ride.pos.y + K.camH - (ride.land || 0) * 0.3 + (ride.wh || 0) * 0.5, ride.pos.z);
  const back = new THREE.Vector3(Math.sin(me.yaw) * Math.cos(me.pitch), -Math.sin(me.pitch), Math.cos(me.yaw) * Math.cos(me.pitch));
  let dist = K.camD;
  const hit = rayMap(target, back, dist + 0.3); if (hit) dist = Math.max(0.6, hit.dist - 0.3);   // nicht durch Wände schauen
  camera.position.copy(target).addScaledVector(back, dist);
  const [ef0, eu] = wheelieShift(ride.wh || 0, 0.6 - RIDER_BACK, RIDER_UP + 1.5), ef = ef0 + K.eyeF - 0.08;
  const eyeSx = Math.sin(ride.yaw) * K.eyeSide, eyeSz = Math.cos(ride.yaw) * K.eyeSide;
  const eye = new THREE.Vector3(me.pos.x + Math.cos(ride.yaw) * (0.08 + ef) + eyeSx, me.pos.y + (isCar ? K.eyeUp : 1.5 + eu) + Math.sin(performance.now() / 45) * 0.003 * Math.min(1, sp / 4), me.pos.z - Math.sin(ride.yaw) * (0.08 + ef) + eyeSz);  camera.position.lerp(eye, fpK);
  camera.rotation.set(me.pitch, me.yaw, ride.lean * 0.45 * fpK);
  // Schießen und Nachladen während der Fahrt
  const w = WEAPONS[me.weapon], now = performance.now() / 1000;
  me.drawT = Math.max(0, me.drawT - dt); me.inspectT = 0; me.landT = 0; me.shake = Math.max(0, me.shake - dt * 1.6);
  if (me.pumpT > 0) { const b = me.pumpT; me.pumpT = Math.max(0, me.pumpT - dt); if (b > 0.3 && me.pumpT <= 0.3) sndClick(0.08, 0.7); }
  if (me.boltT > 0) { const b = me.boltT; me.boltT = Math.max(0, me.boltT - dt); if (b > 0.55 && me.boltT <= 0.55) sndClick(0.08, 0.9); }
  if (me.reloading > 0) { me.reloading -= dt; if (me.reloading <= 0) { me.reloading = 0; me.ammo[me.weapon] = w.mag; } }
  if (me.trigger && (w.auto || !me.firedPress)) tryShoot(now);
  me.recoilP *= Math.exp(-9 * dt); me.recoilY *= Math.exp(-9 * dt);
  camera.rotation.x += me.recoilP; camera.rotation.y += me.recoilY;
  const targetFov = ride.fp > 0.5 ? (me.scoped ? w.zoom : fovBase + Math.min(4, sp * 0.25)) : fovBase + Math.min(10, sp * 0.6);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10); camera.updateProjectionMatrix();
  engineSound(true, ride.speed, thr, ride.kind);
  if (isCar && sp > 7) runOver(sp);
  viewKnife.visible = false; viewNade.visible = false;
  if (ride.fp > 0.6) { me.bob += dt * sp * 0.6; animateViewModel(dt, w); }   // Waffe in der Hand wie zu Fuß
  else viewGun.visible = false;
}
document.addEventListener('mousemove', () => { if (ride.v >= 0) ride.lastMouse = performance.now(); });
// Mit dem Auto Gegner anfahren: je nach Tempo viel Schaden (pro Gegner höchstens einmal pro Sekunde)
function runOver(sp) {
  const now = performance.now();
  for (const id in world.players) {
    if (id === myId || friendly(id)) continue;
    const p = world.players[id]; if (!p.alive) continue;
    if (Math.hypot(p.x - ride.pos.x, p.z - ride.pos.z) > 2.1 || Math.abs(p.y - ride.pos.y) > 1.6) continue;
    if (now - (ride.runT[id] || 0) < 1000) continue;
    ride.runT[id] = now;
    net.send({ t: 'hit', target: id, dmg: Math.round(Math.min(150, sp * 6)), w: CAR_W, head: false });
    showHitmarker(false); sndThud(0.9); me.shake = Math.max(me.shake, 0.35); ride.speed *= 0.85;
  }
}

/* ---------- Darstellung aller Mopeds ---------- */
function updateVehicles(dt) {
  for (const id in avatars) { const a = avatars[id]; if (!(a.flags & 8) && a.g.rotation.x) a.g.rotation.x = 0; }   // abgestiegen: wieder aufrecht
  for (const v of vehicles) {
    const m = v.mesh, K = VK[v.kind], isCar = v.kind === 'car';
    let x = v.x, y = v.y, z = v.z, yaw = v.yaw, lean = v.lean, pitch = 0, wh = 0, rider = null, st = 0;
    if (v.i === ride.v) { x = ride.pos.x; y = ride.pos.y; z = ride.pos.z; yaw = ride.yaw; lean = ride.lean; pitch = (ride.pitch || 0) + (ride.dive || 0); wh = ride.wh || 0; st = ride.st || 0; }
    else if (v.d && avatars[v.d] && avatars[v.d].g.visible) {
      // Fremdes Moped: an die (weich abgespielte) Figur des Fahrers koppeln
      rider = avatars[v.d];
      const a = rider.g; yaw = a.rotation.y + Math.PI / 2;
      x = a.position.x + Math.cos(yaw) * K.back; z = a.position.z - Math.sin(yaw) * K.back; y = a.position.y - K.up;
      v.whS = (v.whS || 0) + ((v.wh || 0) - (v.whS || 0)) * Math.min(1, dt * 10); wh = v.whS;
      v.stS = (v.stS || 0) + ((v.st || 0) - (v.stS || 0)) * Math.min(1, dt * 10); st = v.stS;
    }
    m.steer.rotation.y = st;
    if (isCar) for (const f of m.fronts) f.rotation.y = st;
    // Geschwindigkeit fürs Raddrehen
    const moved = Math.hypot(x - v.rx, z - v.rz);
    if (v.i !== ride.v) {   // fremde Mopeds: Neigung aus Bewegung (Schanze hoch/runter, Sprünge)
      const pt = v.d && moved > 0.01 ? Math.atan2(y - (v.ry || y), moved) * 0.8 : 0;
      v.pitch = (v.pitch || 0) + (Math.max(-0.6, Math.min(0.6, pt)) - (v.pitch || 0)) * Math.min(1, dt * 6);
      pitch = v.pitch;
    }
    v.rx = x; v.rz = z; v.ry = y;
    const fwd = Math.cos(yaw) * 1, dirSign = ((x - (m.root.position.x)) * Math.cos(yaw) - (z - m.root.position.z) * Math.sin(yaw)) >= 0 ? 1 : -1;
    v.spin += moved / (isCar ? CAR_WHEEL_R : WHEEL_R) * dirSign;
    if (isCar) for (const s of m.spinners) s.rotation.z = -v.spin; else m.wf.rotation.z = m.wr.rotation.z = -v.spin;
    const parked = !v.d && v.i !== ride.v;
    m.stand.visible = parked;
    // Weit entfernte Mopeds nicht zeichnen (sie sind sehr detailliert, aus 70 m sieht man sie kaum)
    const dCam = Math.hypot(x - camera.position.x, z - camera.position.z), far = dCam > K.farDraw && v.i !== ride.v;
    m.root.visible = !far;
    const shadow = dCam < 32 || v.i === ride.v;   // Schatten nur bei nahen Mopeds
    if (m.shadow !== shadow) { m.shadow = shadow; m.root.traverse(o => { if (o.isMesh) o.castShadow = shadow; }); }
    // Wheelie: um den Hinterrad-Aufstandspunkt nach hinten kippen
    const [wf, wu] = wheelieShift(wh, 0.6, 0);
    // Motor läuft: leichtes Zittern (Zweitakter)
    const vib = !parked && !far ? Math.sin(performance.now() * 0.09 + v.i) * (isCar ? 0.0008 : 0.0025) : 0;
    const landDip = v.i === ride.v ? -(ride.land || 0) * 0.07 : 0;
    m.root.position.set(x + Math.cos(yaw) * wf, y + wu + vib + landDip, z - Math.sin(yaw) * wf);
    m.root.rotation.set(parked && !isCar ? 0.12 : lean, yaw, pitch + wh);
    if (rider && isCar) rider.g.visible = false;   // im Auto sitzt man drinnen
    else if (rider) {   // fremder Fahrer kippt mit, Fuß runter im Stand, Hände am Lenker
      const [sf] = wheelieShift(wh, 0.6 - RIDER_BACK, RIDER_UP);
      rider.g.rotation.order = 'YXZ'; rider.g.rotation.x = wh * 0.9;
      rider.g.position.x += Math.cos(yaw) * sf; rider.g.position.z -= Math.sin(yaw) * sf;
      rider.footDown = moved / Math.max(dt, 1e-3) < 0.6; rider.steerVis = st;
    }
    // Abgaswolken aus dem Auspuff (nur in der Nähe)
    if (!parked && dCam < 30) {
      v.smokeT = (v.smokeT || 0) - dt;
      const gas = v.i === ride.v ? (ride.thr || 0) > 0 : moved / Math.max(dt, 1e-3) > 1;
      if (v.smokeT <= 0) {
        v.smokeT = gas ? 0.09 : 0.35;
        const ex = m.root.localToWorld(isCar ? new THREE.Vector3(-2.4, 0.5, 0.12) : new THREE.Vector3(-0.9, 0.335, 0.18));
        puff(ex, 0xc8c8c8, gas ? 0.22 : 0.14, gas ? 1.1 : 0.8, new THREE.Vector3(-Math.cos(yaw) * 0.6, 0.35, Math.sin(yaw) * 0.6), { opacity: gas ? 0.28 : 0.16, grow: 2.2, fadeIn: 0.05 });
      }
    }
    void fwd;
  }
  // eigene Figur auf dem Moped (nur in der Außenansicht sichtbar)
  if (myRider && ride.v >= 0 && ride.kind === 'car') myRider.g.visible = false;
  else if (myRider && ride.v >= 0) {
    myRider.g.visible = (ride.fp || 0) < 0.45;   // in der Ego-Ansicht eigene Figur ausblenden
    myRider.g.rotation.order = 'YXZ';
    const [sf, su] = wheelieShift(ride.wh || 0, 0.6 - RIDER_BACK, RIDER_UP);
    myRider.g.position.set(me.pos.x + Math.cos(ride.yaw) * sf, me.pos.y + su, me.pos.z - Math.sin(ride.yaw) * sf);
    myRider.g.rotation.set((ride.pitch || 0) * 0.8 + (ride.wh || 0) * 0.9, ride.yaw - Math.PI / 2, ride.lean * 0.8);
    const aiming = riderAiming();
    myRider.flags = 8 | (aiming ? 16 : 0);
    myRider.footDown = Math.abs(ride.speed) < 0.6 && ride.onGround; myRider.steerVis = ride.st || 0;
    setAvatarGun(myRider, me.weapon);
    myRider.pivot.rotation.x = aiming ? me.pitch : -0.3;
    animateAvatar(myRider, dt);
    riderTwist(myRider, aiming ? me.yaw : ride.yaw - Math.PI / 2, dt);
  }
}

// Verschiebung (vorwärts, hoch) eines Punktes, der dx vor / dy über dem Hinterrad-Aufstandspunkt liegt,
// wenn das Moped um den Winkel a nach hinten kippt
function wheelieShift(a, dx, dy) {
  if (!a) return [0, 0];
  const c = Math.cos(a), s = Math.sin(a);
  return [dx * c - dy * s - dx, dx * s + dy * c - dy];
}
// Fahrer zielt gerade (Abzug, Zoom oder vor kurzem geschossen)?
function riderAiming() { return ride.v >= 0 && (me.trigger || me.scoped || performance.now() / 1000 - (me.rideAimT || -9) < 1.5); }
// Oberkörper des Fahrers in Zielrichtung drehen (Beine bleiben auf dem Moped)
function riderTwist(a, aimYaw, dt) {
  let d = aimYaw - a.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  d = Math.max(-1.9, Math.min(1.9, d));
  a.upper.rotation.y += (d - a.upper.rotation.y) * Math.min(1, dt * 12);
}

/* ---------- Motorgeräusch (Zweitakter: knatternd) ---------- */
let eng = null;
function engineSound(on, speed = 0, thr = 0, kind = 'moped') {
  if (!actx) return;
  if (!on || (eng && eng.kind !== kind)) { if (eng) { const t = actx.currentTime; eng.g.gain.setTargetAtTime(0, t, 0.1); const e = eng; setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch (x) {} }, 600); eng = null; } if (!on) return; }
  const car = kind === 'car';
  if (!eng) {
    const o = actx.createOscillator(), o2 = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain(), am = actx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0;
    o2.frequency.value = 20; am.gain.value = car ? 0.012 : 0.035;   // Moped: „Knattern“ des Zweitakters, Auto: ruhiges Brummen
    o.connect(f); f.connect(g); g.connect(master); o2.connect(am); am.connect(g.gain);
    o.start(); o2.start();
    eng = { o, o2, f, g, kind };
  }
  const t = actx.currentTime, sp = Math.abs(speed);
  // Auto: Gänge – die Drehzahl fällt bei jedem Gangwechsel wieder ab
  const rpm = car ? (sp % 8.5) / 8.5 + Math.min(1, sp / 30) * 0.4 : 0;
  eng.o.frequency.setTargetAtTime(car ? 32 + rpm * 46 + thr * 8 : 38 + sp * 7 + thr * 14, t, 0.08);
  eng.o2.frequency.setTargetAtTime(car ? 10 + rpm * 14 : 14 + sp * 2.2 + thr * 5, t, 0.08);
  eng.f.frequency.setTargetAtTime(car ? 320 + rpm * 420 + thr * 260 : 600 + sp * 80 + thr * 500, t, 0.1);
  eng.g.gain.setTargetAtTime(car ? 0.05 + thr * 0.035 : 0.05 + thr * 0.05 + sp * 0.003, t, 0.1);
}
