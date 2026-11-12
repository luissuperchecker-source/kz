'use strict';
/* ======================= Karte "Hafenviertel" ======================= */
// Spielfläche: x -60 … 55 (Osten = Hafenbecken), z -60 … 60
const boxes = [];
// Zufall mit festem Startwert: alle Spieler bekommen exakt die gleiche Karte
let _seed = 1337;
const srand = () => { _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0; let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const srnd = (a, b) => a + srand() * (b - a);

// Box mit Texturkoordinaten in Weltgröße (Texturen werden nicht verzerrt)
function boxGeo(w, h, d, tile, round = 0) {
  // kleine Radien: 1 Segment (sieht gleich aus, viel schneller), große: 2–3 Segmente
  if (round > 0) return roundedBoxGeo(w, h, d, round, round > 0.15 ? 3 : round > 0.045 ? 2 : 1, tile);
  const g = new THREE.BoxGeometry(w, h, d);
  if (tile) {
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  }
  return withUv2(g);
}
function collider(x, y, z, w, h, d) { boxes.push({ min: { x: x - w / 2, y, z: z - d / 2 }, max: { x: x + w / 2, y: y + h, z: z + d / 2 } }); }
// Baumstämme merken: in der Grafikstufe „Klar & schnell“ sind Bäume samt Kollision weg
const TREE_BOXES = [];
function treeCollider(x, y, z, w, h, d) { collider(x, y, z, w, h, d); TREE_BOXES.push(boxes[boxes.length - 1]); }
// Wie stark Kanten je nach Material abgerundet werden (Meter)
function defaultRound(mat) {
  if (mat === MAT.sandbag) return 0.24;
  if (mat === MAT.crate) return 0.045;
  if (mat === MAT.ctrRed || mat === MAT.ctrBlue || mat === MAT.ctrGreen || mat === MAT.ctrOrange) return 0.05;
  if (mat === MAT.metal || mat === MAT.yellow || mat === MAT.dark) return 0.03;
  return 0.025;   // Beton, Ziegel, Putz …: leicht gebrochene Kanten
}
function addBox(x, y, z, w, h, d, mat, tile = 2, opts = {}) {
  const t = tile === 0 ? 0 : (mat.userData.tile || tile);
  let r = opts.round !== undefined ? opts.round : defaultRound(mat);
  // Große Wände/Decken: die feine Kantenrundung sieht man nicht, kostet aber viele Dreiecke
  if (opts.round === undefined && r <= 0.03 && Math.max(w, h, d) > 3.5) r = 0;
  const m = new THREE.Mesh(boxGeo(w, h, d, t, r), mat);
  m.position.set(x, y + h / 2, z);
  if (opts.rotY) m.rotation.y = opts.rotY;
  m.castShadow = opts.shadow !== false; m.receiveShadow = true;
  scene.add(m);
  if (!opts.decor) collider(x, y, z, w, h, d);
  return m;
}
// Bodenfläche mit Textur in Weltgröße
function decalT(x, z, w, d, mat, tile, rot = 0, y = 0.012) {
  const g = new THREE.PlaneGeometry(w, d);
  if (tile) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile); }
  const m = new THREE.Mesh(withUv2(g), mat);
  m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, y, z); m.receiveShadow = true;
  scene.add(m); return m;
}
// Mauer mit Öffnungen: openings = [[von, bis, unten, oben], …] (Höhen relativ zu y)
function wallRun(axis, from, to, at, y, h, t, mat, openings = [], opts = {}) {
  const seg = (a, b, y0, hh) => {
    if (b - a <= 0.02 || hh <= 0.02) return;
    const c = (a + b) / 2, len = b - a;
    if (axis === 'x') addBox(c, y0, at, len, hh, t, mat, 2, opts); else addBox(at, y0, c, t, hh, len, mat, 2, opts);
  };
  let cur = from;
  for (const [a, b, bot, top] of openings.slice().sort((p, q) => p[0] - q[0])) {
    seg(cur, a, y, h);
    if (bot > 0) seg(a, b, y, bot);
    if (top < h) seg(a, b, y + top, h - top);
    cur = b;
  }
  seg(cur, to, y, h);
}
/* ---------- Sprungschanzen / Erdhügel (befahrbare Schrägen) ----------
   Profil = [[u, h], …]: u = Meter in Fahrtrichtung, h = Höhe. a = Richtung (0 = +x, π/2 = +z). */
const RAMPS = [];
const P_KICK = (L, H, e = 1.4) => Array.from({ length: 10 }, (_, i) => { const t = i / 9; return [t * L, H * Math.pow(t, e)]; });
const P_LAND = (L, H) => Array.from({ length: 10 }, (_, i) => { const t = i / 9; return [t * L, H * Math.pow(1 - t, 1.25)]; });
const P_BUMP = (L, H) => Array.from({ length: 9 }, (_, i) => { const t = i / 8; return [t * L, H * Math.sin(t * Math.PI)]; });
const P_TABLE = (up, top, down, H) => [...P_KICK(up, H, 1.15), ...P_LAND(down, H).map(([u, h]) => [u + up + top, h])];
function rampH(r, x, z) {
  const dx = x - r.x, dz = z - r.z, u = dx * r.fx + dz * r.fz, v = -dx * r.fz + dz * r.fx;
  if (u < 0 || u > r.L || Math.abs(v) > r.w / 2) return 0;
  const p = r.prof; let i = 1; while (i < p.length - 1 && p[i][0] < u) i++;
  const a = p[i - 1], b = p[i], t = (u - a[0]) / ((b[0] - a[0]) || 1);
  return r.base + a[1] + (b[1] - a[1]) * Math.min(1, Math.max(0, t));
}
// Bodenhöhe an einer Stelle (0 = flach, sonst Schanze). y = Höhe des Körpers: Schanzen weit darüber
// (z. B. auf der Hochstraße) zählen für jemanden unten auf der Straße nicht.
/* ---------- Hügel & Berg (nur Karte „Welt“, im Wald im Nordwesten) ----------
   Höhe = Summe weicher Buckel, an Wegen, See, Hütte, Turm und am Gebietsrand sanft auf 0 abgeflacht. */
// Mehrere Hügel-Gebiete (Rechtecke, überlappen sich nicht); HILL = true, sobald es welche gibt
const HILLS = []; let HILL = null;
const _sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hillH(x, z) {
  for (const H of HILLS) if (x >= H.x0 && x <= H.x1 && z >= H.z0 && z <= H.z1) return hillRegionH(H, x, z);
  return 0;
}
function hillRegionH(H, x, z) {
  if (H.fn) return H.fn(x, z);   // Berge am Kartenrand: Höhe = sichtbares Außengelände
  let m =_sst(0, H.edge || 22, Math.min(x - H.x0, H.x1 - x, z - H.z0, H.z1 - z));
  for (const [cx, cz, r] of H.flatC) { const d = Math.hypot(x - cx, z - cz); if (d < r + 14) m *= _sst(r, r + 14, d); }
  for (const [ax, v] of H.flatL) m *= _sst(5, 18, Math.abs((ax === 'x' ? x : z) - v));
  if (H.track && m > 0) { const d = trackDist(x, z); if (d < TRK_CELL) m *= _sst(9, TRK_CELL, d); }   // Drift-Strecke: flacher Korridor, Hügel steigen daneben an
  if (m <= 0) return 0;
  let h = 0;
  for (const [cx, cz, a, s] of H.bumps) { const dx = x - cx, dz = z - cz; h += a * Math.exp(-(dx * dx + dz * dz) / (2 * s * s)); }
  return h * m;
}
// Drift-Strecken durch die Hügel: Mittellinien-Punkte in einem Raster (schnelle Abstands-Suche bis 20 m)
const TRK_CELL = 20, TRK_GRID = new Map();
const trkKey = (cx, cz) => (cx + 500) * 1000 + cz + 500;
function addTrackPts(pts) {
  for (const p of pts) { const k = trkKey(Math.floor(p.x / TRK_CELL), Math.floor(p.z / TRK_CELL)); let a = TRK_GRID.get(k); if (!a) TRK_GRID.set(k, a = []); a.push(p.x, p.z); }
}
function trackDist(x, z) {
  const cx = Math.floor(x / TRK_CELL), cz = Math.floor(z / TRK_CELL); let best = TRK_CELL * TRK_CELL;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = TRK_GRID.get(trkKey(cx + i, cz + j)); if (!a) continue;
    for (let k = 0; k < a.length; k += 2) { const dx = a[k] - x, dz = a[k + 1] - z, d = dx * dx + dz * dz; if (d < best) best = d; }
  }
  return Math.sqrt(best);
}
// Geschlossener Rundkurs aus Stützpunkten [x, z] → gleichmäßig verteilte Mittellinien-Punkte
function driftLoop(P) {
  const curve = new THREE.CatmullRomCurve3(P.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const L = curve.getLength(), N = Math.round(L / 1.2), pts = curve.getSpacedPoints(N); pts.pop();
  return { pts, N, L };
}
function groundH(x, z, y = Infinity) {
  let h = HILL ? hillH(x, z) : 0;
  for (const r of RAMPS) {
    if (x < r.bx0 || x > r.bx1 || z < r.bz0 || z > r.bz1 || r.base > y + 1) continue;
    const hh = rampH(r, x, z); if (hh > h) h = hh;
  }
  return h;
}
function addRamp(x, z, a, w, prof, mat, tile = 2, base = 0) {
  const fx = Math.cos(a), fz = Math.sin(a), L = prof[prof.length - 1][0];
  const r = { x, z, fx, fz, w, prof, L, base, H: base + Math.max(...prof.map(p => p[1])) };
  const P = (u, v, h) => [x + u * fx - v * fz, base + h, z + u * fz + v * fx];
  const cs = [P(0, -w / 2, 0), P(0, w / 2, 0), P(L, -w / 2, 0), P(L, w / 2, 0)];
  r.bx0 = Math.min(...cs.map(c => c[0])); r.bx1 = Math.max(...cs.map(c => c[0]));
  r.bz0 = Math.min(...cs.map(c => c[2])); r.bz1 = Math.max(...cs.map(c => c[2]));
  RAMPS.push(r);
  // Mesh (Oberseite, Seiten, Stirnflächen) – Dreiecke werden automatisch nach außen gedreht
  const pos = [], uv = [];
  const tri = (A, B, C, ta, tb, tc, out) => {
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) { [B, C] = [C, B]; [tb, tc] = [tc, tb]; }
    pos.push(...A, ...B, ...C); uv.push(...ta, ...tb, ...tc);
  };
  const quad = (A, B, C, D, ta, tb, tc, td, out) => { tri(A, B, C, ta, tb, tc, out); tri(A, C, D, ta, tc, td, out); };
  let s = 0;
  for (let i = 0; i < prof.length - 1; i++) {
    const [u0, h0] = prof[i], [u1, h1] = prof[i + 1], ds = Math.hypot(u1 - u0, h1 - h0);
    quad(P(u0, -w / 2, h0), P(u0, w / 2, h0), P(u1, w / 2, h1), P(u1, -w / 2, h1),
      [0, s / tile], [w / tile, s / tile], [w / tile, (s + ds) / tile], [0, (s + ds) / tile], [0, 1, 0]);
    s += ds;
    for (const sv of [-1, 1]) {
      if (h0 < 0.01 && h1 < 0.01) continue;
      quad(P(u0, sv * w / 2, 0), P(u1, sv * w / 2, 0), P(u1, sv * w / 2, h1), P(u0, sv * w / 2, h0),
        [u0 / tile, 0], [u1 / tile, 0], [u1 / tile, h1 / tile], [u0 / tile, h0 / tile], [-fz * sv, 0, fx * sv]);
    }
  }
  for (const [u, h, o] of [[0, prof[0][1], -1], [L, prof[prof.length - 1][1], 1]]) {
    if (h < 0.01) continue;
    quad(P(u, -w / 2, 0), P(u, w / 2, 0), P(u, w / 2, h), P(u, -w / 2, h), [0, 0], [w / tile, 0], [w / tile, h / tile], [0, h / tile], [fx * o, 0, fz * o]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); withUv2(g);
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; scene.add(m);
  return r;
}
// Alte Schreibweise (Türen) für bestehenden Code
function wallLine(axis, from, to, at, y, h, t, mat, doors = []) { wallRun(axis, from, to, at, y, h, t, mat, doors.map(([a, b, top]) => [a, b, 0, top])); }
function windowAt(x, y, z, rotY, w = 1.3, h = 1.2) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), MAT.window);
  m.position.set(x, y, z); m.rotation.y = rotY; scene.add(m);
  const sill = new THREE.Mesh(boxGeo(w + 0.2, 0.08, 0.16, 2.7), MAT.concrete);
  sill.position.set(x, y - h / 2 - 0.04, z); sill.rotation.y = rotY; sill.castShadow = true; scene.add(sill);
}
function barrel(x, z, mat) {
  const m = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(0.32, 0.32, 0.95, 20)), mat);
  m.position.set(x, 0.475, z); m.castShadow = m.receiveShadow = true; scene.add(m);
  for (const yy of [0.25, 0.7]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.02, 6, 20), MAT.dark); r.rotation.x = Math.PI / 2; r.position.set(x, yy, z); scene.add(r); }
  collider(x, 0, z, 0.64, 0.95, 0.64);
}
function crate(x, y, z, s) { return addBox(x, y, z, s, s, s, MAT.crate, 0); }
function sandbags(x, z, len, alongX) { return alongX ? addBox(x, 0, z, len, 1.05, 0.8, MAT.sandbag, 1.2) : addBox(x, 0, z, 0.8, 1.05, len, MAT.sandbag, 1.2); }
function jersey(x, z, alongX) {
  addBox(x, 0, z, alongX ? 3 : 0.6, 0.35, alongX ? 0.6 : 3, MAT.concrete, 2, { round: 0.1 });
  addBox(x, 0.3, z, alongX ? 3 : 0.32, 0.6, alongX ? 0.32 : 3, MAT.concrete, 2, { decor: true, round: 0.12 });
  collider(x, 0.35, z, alongX ? 3 : 0.32, 0.55, alongX ? 0.32 : 3);
}
function container(x, y, z, alongX, mat) {
  const w = alongX ? 6.1 : 2.44, d = alongX ? 2.44 : 6.1;
  const m = addBox(x, y, z, w, 2.6, d, mat, 2.6);
  const door = new THREE.Mesh(roundedBoxGeo(alongX ? 0.06 : 2.3, 2.4, alongX ? 2.3 : 0.06, 0.025), MAT.dark);
  door.position.set(alongX ? x + w / 2 : x, y + 1.3, alongX ? z : z + d / 2); scene.add(door);
  for (const o of [-0.5, 0.5]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 10), MAT.dark);
    bar.position.set(alongX ? x + w / 2 + 0.05 : x + o, y + 1.3, alongX ? z + o : z + d / 2 + 0.05); scene.add(bar);
  }
  return m;
}
function lamp(x, z, dir = 1) {
  addBox(x, 0, z, 0.18, 5.5, 0.18, MAT.metal, 1, { round: 0.085 });
  const arm = new THREE.Mesh(roundedBoxGeo(0.1, 0.1, 1.4, 0.045), MAT.dark); arm.position.set(x, 5.45, z + 0.6 * dir); arm.castShadow = true; scene.add(arm);
  const head = new THREE.Mesh(roundedBoxGeo(0.3, 0.15, 0.6, 0.07, 3), LAMP_MAT);
  head.position.set(x, 5.35, z + 1.2 * dir); scene.add(head);
}
const LAMP_MAT = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.8 });

/* Nadelbäume aus Ästen mit Nadel-Textur */
const treeLeafMat = new THREE.MeshStandardMaterial({ map: TEX.needles, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, color: new THREE.Color(0.75, 0.85, 0.7) });
const treeTrunkMat = new THREE.MeshStandardMaterial({ map: TEX.bark, roughness: 1 });
const LOG_MAT = treeTrunkMat.clone();   // umgestürzte Stämme / Brennholz (bleiben auch in „Klar & schnell“ sichtbar)
const TREE_LAYERS = [[2.4, 2.6, 2.0], [2.0, 2.4, 3.2], [1.6, 2.2, 4.3], [1.2, 2.0, 5.3], [0.75, 1.7, 6.2]];
const trunkGeo = new THREE.CylinderGeometry(0.12, 0.26, 6.5, 12); trunkGeo.translate(0, 3.25, 0);
const layerGeos = TREE_LAYERS.map(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, 18, 1, true); g.translate(0, y, 0); return g; });
function tree(x, z, s = 1, solid = true) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.set(s, s * srnd(0.9, 1.15), s); g.rotation.y = srand() * 6;
  const tr = new THREE.Mesh(trunkGeo, treeTrunkMat); tr.castShadow = true; g.add(tr);
  for (const lg of layerGeos) { const c = new THREE.Mesh(lg, treeLeafMat); c.castShadow = true; c.receiveShadow = true; g.add(c); }
  scene.add(g);
  if (solid) treeCollider(x, 0, z, 0.5 * s, 3 * s, 0.5 * s);
}
// Laubbaum (rundere Krone) für den Park
const leafMat2 = new THREE.MeshStandardMaterial({ map: TEX.needles, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, color: new THREE.Color(0.9, 1.0, 0.7) });
function leafTree(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 4, 12), treeTrunkMat); tr.position.y = 2; tr.castShadow = true; g.add(tr);
  const lowT = MAP_ID === 'welt';   // große Karte: einfachere Baumkronen
  for (let i = 0; i < (lowT ? 4 : 6); i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(srnd(1.2, 1.8), lowT ? 8 : 11, lowT ? 6 : 8), leafMat2);
    c.position.set(srnd(-1, 1), srnd(3.8, 5.4), srnd(-1, 1)); c.castShadow = true; g.add(c);
  }
  scene.add(g);
  treeCollider(x, 0, z, 0.55 * s, 3.5 * s, 0.55 * s);
}
// Haus mit Satteldach (geschlossen)
function house(x, z, w, d, h, wallMat = MAT.brick) {
  addBox(x, 0, z, w, h, d, wallMat, 2.5);
  addBox(x, h, z, w + 0.3, 0.2, d + 0.3, MAT.concrete, 2, { decor: true });
  const rise = d * 0.35, slope = Math.hypot(d / 2 + 0.4, rise), ang = Math.atan2(rise, d / 2 + 0.4);
  for (const s of [1, -1]) {
    const r = new THREE.Mesh(boxGeo(w + 0.6, 0.15, slope, 2.5), MAT.roof);
    r.position.set(x, h + 0.2 + rise / 2, z + s * (d / 4 + 0.2)); r.rotation.x = s * ang; r.castShadow = true; r.receiveShadow = true; scene.add(r);
  }
  const gable = new THREE.Shape(); gable.moveTo(-d / 2, 0); gable.lineTo(d / 2, 0); gable.lineTo(0, rise); gable.closePath();
  for (const s of [1, -1]) {
    const gg = new THREE.ShapeGeometry(gable);
    const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, gg.attributes.position.getX(i) / 2.5, gg.attributes.position.getY(i) / 2.5);
    const gm = new THREE.Mesh(withUv2(gg), wallMat);
    gm.position.set(x + s * (w / 2), h + 0.2, z); gm.rotation.y = s * Math.PI / 2; gm.receiveShadow = true; scene.add(gm);
  }
  for (const s of [1, -1]) {
    for (const ox of [-w / 3, w / 3]) windowAt(x + ox, 1.9, z + s * (d / 2 + 0.01), s > 0 ? 0 : Math.PI);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), MAT.door);
    door.position.set(x, 1.1, z + s * (d / 2 + 0.012)); door.rotation.y = s > 0 ? 0 : Math.PI; scene.add(door);
  }
}

/* ---------- Begehbares mehrstöckiges Gebäude mit Treppenhaus, Fensteröffnungen und Dach ---------- */
const FLOOR_H = 3.2;
function building(cx, cz, w, d, floors, mat, doors = {}, opt = {}) {
  const BW = MAP_ID === 'welt' ? { round: 0 } : {};   // große Karte: Wände ohne Kantenrundung (weniger Dreiecke)
  const T = 0.3, FH = FLOOR_H, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const sides = {
    n: { axis: 'x', a0: x0, a1: x1, at: z0 + T / 2, c: cx },
    s: { axis: 'x', a0: x0, a1: x1, at: z1 - T / 2, c: cx },
    w: { axis: 'z', a0: z0 + T, a1: z1 - T, at: x0 + T / 2, c: cz },
    e: { axis: 'z', a0: z0 + T, a1: z1 - T, at: x1 - T / 2, c: cz },
  };
  for (let f = 0; f < floors; f++) {
    for (const k in sides) {
      const S = sides[k], ops = [], dl = f === 0 ? (doors[k] || []) : [];
      const n = Math.max(1, Math.floor((S.a1 - S.a0) / 3.2));
      for (let i = 0; i < n; i++) {
        const c = S.a0 + (i + 0.5) * (S.a1 - S.a0) / n;
        if (dl.some(o => Math.abs(S.c + o - c) < 1.9)) continue;
        if (k === 'w' && c < z0 + 6.2) continue;                 // keine Fenster am Treppenhaus
        ops.push([c - 0.6, c + 0.6, 1.0, 2.2]);
      }
      for (const o of dl) ops.push([S.c + o - 0.85, S.c + o + 0.85, 0, 2.5]);
      wallRun(S.axis, S.a0, S.a1, S.at, f * FH, FH, T, mat, ops, BW);
    }
  }
  for (const k in sides) { const S = sides[k]; wallRun(S.axis, S.a0, S.a1, S.at, floors * FH, 1.0, T, mat, [], BW); }  // Dachbrüstung
  if (MAP_ID === 'welt') {   // außen: Gesimsbänder zwischen den Etagen und Abdeckung der Brüstung (nur Kulisse)
    const trim = MAT.concrete, o = { decor: true, round: 0, shadow: false };
    for (let L = 1; L <= floors + 1; L++) {
      const y = L <= floors ? L * FH - 0.14 : floors * FH + 1.0, hh = L <= floors ? 0.2 : 0.18, p = L <= floors ? 0.08 : 0.14;
      addBox(cx, y, z0 - p / 2, w + 2 * p, hh, p, trim, 1, o); addBox(cx, y, z1 + p / 2, w + 2 * p, hh, p, trim, 1, o);
      addBox(x0 - p / 2, y, cz, p, hh, d, trim, 1, o); addBox(x1 + p / 2, y, cz, p, hh, d, trim, 1, o);
    }
    addBox(cx + w / 5, floors * FH, cz + d / 6, 1.8, 1.1, 1.3, MAT.metal, 1, { decor: true, round: 0.03 });   // Klimagerät auf dem Dach
    if (w > 12) addBox(cx - w / 6, floors * FH, cz - d / 5, 0.6, 1.5, 0.6, MAT.hallMetal, 1, { decor: true, round: 0 });   // Lüftung
  }
  // Treppen: abwechselnd in zwei Spuren an der Westwand, je 5 Stufen à 0,64 m
  const ix0 = x0 + T, ix1 = x1 - T, iz0 = z0 + T, iz1 = z1 - T;
  // Gegenläufige Treppen: gerade Stockwerke laufen nach +z (Spur A), ungerade nach -z (Spur B)
  const zs = iz0 + 1.2, ze = zs + 4.5;
  const colX = [ix0 + 0.6, ix0 + 1.95];
  for (let f = 0; f < floors; f++) {
    const cxs = colX[f % 2], up = f % 2 === 0;
    for (let k = 0; k < 5; k++) addBox(cxs, f * FH, up ? zs + (k + 0.5) * 0.9 : ze - (k + 0.5) * 0.9, 1.2, (k + 1) * 0.64, 0.9, MAT.concrete, 1, BW);
  }
  // Decken mit Loch über der jeweiligen Treppe + Geländer
  for (let L = 1; L <= floors; L++) {
    const hx = colX[(L - 1) % 2], hx0 = hx - 0.65, hx1 = hx + 0.65, hz0 = zs, hz1 = ze;
    const y = L * FH - 0.2;
    const slab = (a, b, c, e) => { if (b - a > 0.05 && e - c > 0.05) addBox((a + b) / 2, y, (c + e) / 2, b - a, 0.2, e - c, MAT.concrete, 2, BW); };
    slab(ix0, hx0, iz0, iz1); slab(hx1, ix1, iz0, iz1); slab(hx0, hx1, iz0, hz0); slab(hx0, hx1, hz1, iz1);
    // Geländer an der offenen Längsseite und am Kopfende
    // Geländer: sichtbar 1 m hoch, aber unsichtbar bis zur Decke gesperrt (man kann nicht draufsteigen).
    // Längsseiten zum Raum hin + das untere Ende der Treppe; das obere Ende bleibt offen (Ausgang).
    const rail = (x, z, w, d) => { addBox(x, L * FH, z, w, 1.0, d, MAT.metal, 1, { decor: true }); collider(x, L * FH, z, w, FH - 0.2, d); };
    const wasUp = (L - 1) % 2 === 0;
    if (wasUp) rail(hx1 + 0.03, (hz0 + hz1) / 2, 0.06, hz1 - hz0);
    else { rail(hx0 - 0.03, (hz0 + hz1) / 2, 0.06, hz1 - hz0); rail(hx1 + 0.03, (hz0 + hz1) / 2, 0.06, hz1 - hz0); }
    rail(hx, wasUp ? hz0 - 0.03 : hz1 + 0.03, 1.3, 0.06);
  }
  // Innenboden
  decalT(cx, cz, w - 0.6, d - 0.6, MAT.concreteFloor, 2.7, 0, 0.01);
  // Einrichtung: ein paar Kisten pro Etage (nicht vor der Treppe)
  for (let f = 0; f < floors; f++) {
    const cnt = opt.crates === undefined ? 2 : opt.crates;
    for (let i = 0; i < cnt; i++) {
      const x = srnd(ix0 + 3.5, ix1 - 1.2), z = srnd(iz0 + 1.2, iz1 - 1.2);
      crate(x, f * FH, z, srnd(0.9, 1.3));
    }
  }
  return { roofY: floors * FH };
}
// Sportwagen mit glatter, fließender Karosserie (aus Querschnitten "modelliert")
const CAR_GLASS = new THREE.MeshStandardMaterial({ color: 0x0a0f14, roughness: 0.03, metalness: 0.75, envMapIntensity: 1.8 });
const TIRE = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 });
const CHROME = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.12, metalness: 1 });
const CAR_BLACK = new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.4, metalness: 0.35 });
const CARBON = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.25, metalness: 0.5 });
const RIM = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.25, metalness: 0.95 });
const CALIPER = new THREE.MeshStandardMaterial({ color: 0xd01a1a, roughness: 0.35, metalness: 0.3 });
const HEADLIGHT = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 1.4 });
const TAILLIGHT = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 1.2 });
const carPaints = [0x5cc21c, 0xff7300, 0xffc300, 0xd3141c, 0x1f5fe0, 0xf2f2f2, 0x18191b, 0x7d2fd6, 0x00b3a4, 0xff4fa0]
  .map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.18, metalness: 0.6, envMapIntensity: 1.4 }));
// Weiche Kurve durch Stützpunkte [[t, Wert], …]
function curve(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) {
    const a = pts[i - 1], b = pts[i], k = (t - a[0]) / (b[0] - a[0]), s = (1 - Math.cos(k * Math.PI)) / 2;
    return a[1] + (b[1] - a[1]) * s;
  }
  return pts[pts.length - 1][1];
}
// Körper aus Querschnitten: fn(u -1…1) → { x, bottom, top, halfW, p }
function loftGeo(nU, nV, fn, closeK) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nU; i++) {
    const u = -1 + 2 * i / nU, s = fn(u);
    const close = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), closeK)), 0.5);   // Enden schließen sich rund
    const yc = (s.top + s.bottom) / 2, hy = (s.top - s.bottom) / 2 * close, hw = s.halfW * close;
    for (let j = 0; j <= nV; j++) {
      const th = -Math.PI / 2 + j / nV * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th), e = 2 / s.p;
      pos.push(s.x, yc + hy * Math.sign(sn) * Math.pow(Math.abs(sn), e), hw * Math.sign(c) * Math.pow(Math.abs(c), e));
      uv.push(i / nU, j / nV);
    }
  }
  for (let i = 0; i < nU; i++) for (let j = 0; j < nV; j++) {
    const a = i * (nV + 1) + j, b = a + nV + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return withUv2(g);
}
const CAR_L = 4.6;
const CAR_TOP = [[-1, 0.8], [-0.86, 0.97], [-0.45, 0.97], [0.0, 0.88], [0.45, 0.74], [0.85, 0.6], [1, 0.5]];
const CAR_BOTTOM = [[-1, 0.34], [-0.85, 0.22], [0.85, 0.2], [1, 0.3]];
const CAR_WIDTH = [[-1, 0.88], [-0.82, 0.99], [-0.45, 1.01], [0.3, 0.99], [0.8, 0.93], [1, 0.82]];
const CAR_BODY_GEO = loftGeo(44, 30, u => ({ x: u * CAR_L / 2, bottom: curve(CAR_BOTTOM, u), top: curve(CAR_TOP, u), halfW: curve(CAR_WIDTH, u), p: 3.6 }), 12);
// Kanzel (dunkles Glas): von hinter der Mitte bis zur flachen Frontscheibe
const CAB_X0 = -1.4, CAB_X1 = 0.7;
const CAR_CABIN_GEO = loftGeo(30, 22, u => {
  const x = CAB_X0 + (u + 1) / 2 * (CAB_X1 - CAB_X0), bu = x / (CAR_L / 2), base = curve(CAR_TOP, bu) - 0.06;
  return { x, bottom: base - 0.15, top: base + curve([[-1, 0.05], [-0.55, 0.22], [-0.05, 0.3], [0.45, 0.24], [0.85, 0.1], [1, 0.0]], u), halfW: curve([[-1, 0.6], [-0.2, 0.7], [1, 0.62]], u), p: 2.6 };
}, 5);
const ARCH_GEO = new THREE.TorusGeometry(0.43, 0.05, 8, 20, Math.PI);
/* Japanisches 90er-Sportcoupé (Skyline-Form): kantig, lange flache Motorhaube, steile Kabine, kurzes hohes Heck,
   ausgestellte Kotflügel über den Rädern (x = ±1,42 / -1,45) */
// Gerade Verbindung zwischen Stützpunkten [[x, Wert], …] (für flache Flächen)
const lin = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
  return pts[pts.length - 1][1];
};
// Kantiger Körper: an jeder Station xs ein konvexer Querschnitt ring(x) = [[z, y], …]; flache Flächen, harte Kanten, flache Enden
function prismGeo(xs, ring) {
  const R = xs.map(x => ring(x)), pos = [], uv = [];
  const tri = (a, b, c, out) => {   // Dreieck so drehen, dass die Fläche nach außen zeigt
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { const t = b; b = c; c = t; }
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); uv.push(p[0] / 4.6 + 0.5, p[1]); }
  };
  const P = (i, k) => [xs[i], R[i][k][1], R[i][k][0]];
  for (let i = 0; i < xs.length - 1; i++) {
    const n = R[i].length;
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n, a = P(i, k), b = P(i, k2), c = P(i + 1, k), d = P(i + 1, k2);
      const cy = (R[i].reduce((s, q) => s + q[1], 0)) / n, out = [0, (a[1] + b[1]) / 2 - cy, (a[2] + b[2]) / 2];
      tri(a, b, c, out); tri(b, d, c, out);
    }
  }
  for (const [i, dir] of [[0, -1], [xs.length - 1, 1]]) {   // Deckel vorne/hinten
    const n = R[i].length, c = [xs[i], R[i].reduce((s, q) => s + q[1], 0) / n, 0];
    for (let k = 0; k < n; k++) tri(c, P(i, k), P(i, (k + 1) % n), [dir, 0, 0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return withUv2(g);
}
// Seitenlinie: Unterkante, Oberkante (Kofferraum – Gürtellinie – flache Motorhaube), Breite mit Kotflügel-Verbreiterungen
const SKY_TOP = [[-2.3, 0.94], [-2.2, 1.01], [-1.5, 1.02], [0.85, 0.99], [2.15, 0.8], [2.32, 0.74]];
const SKY_BOTTOM = [[-2.3, 0.3], [-2.15, 0.19], [2.1, 0.17], [2.32, 0.28]];
const SKY_WIDTH = [[-2.3, 0.86], [-2.15, 0.9], [-1.9, 0.95], [-1.0, 0.95], [-0.8, 0.9], [0.95, 0.9], [1.1, 0.95], [1.9, 0.95], [2.15, 0.9], [2.32, 0.86]];
const SKY_BODY_GEO = prismGeo([-2.3, -2.2, -2.15, -1.9, -1.5, -1.0, -0.8, 0.85, 0.95, 1.1, 1.9, 2.15, 2.32], x => {
  const y0 = lin(SKY_BOTTOM, x), y1 = lin(SKY_TOP, x), w = lin(SKY_WIDTH, x), c = 0.07;
  return [[w * 0.93, y0], [w, y0 + 0.12], [w, y1 - c], [w - c * 1.3, y1], [-(w - c * 1.3), y1], [-w, y1 - c], [-w, y0 + 0.12], [-w * 0.93, y0]];
});
// Kabine (Glas): flache Front- und Heckscheibe, Seitenscheiben nach innen geneigt
const SKY_CAB_TOP = [[-1.55, 1.0], [-0.85, 1.37], [0.05, 1.37], [0.8, 0.98]];
const skyCabRing = (x, grow = 0) => { const y1 = lin(SKY_CAB_TOP, x) + grow; return [[0.8 + grow, 0.9], [0.62 + grow, y1], [-0.62 - grow, y1], [-0.8 - grow, 0.9]]; };
const SKY_CABIN_GEO = prismGeo([-1.55, -0.85, 0.05, 0.8], x => skyCabRing(x));
// Dach (lackiert): dünne Platte auf dem Glas
const SKY_ROOF_GEO = prismGeo([-0.85, 0.05], x => [[0.64, 1.36], [0.6, 1.385], [-0.6, 1.385], [-0.64, 1.36]]);
const SPOKE_GEO = [0.35, 0.37].map(R => withUv2(new THREE.BoxGeometry(0.032, R * 1.38, 0.025)));
// Statt Autos: Abstellplätze für fahrbare Mopeds (werden in vehicles.js gebaut und gesteuert)
const MAP_VEHICLES = [];
function car(x, z, alongX) {
  const yaw = (alongX ? 0 : -Math.PI / 2) + (srand() < 0.5 ? Math.PI : 0) + srnd(-0.25, 0.25);
  MAP_VEHICLES.push({ x, z, yaw });
}
// Fahrbares Auto abstellen (yaw: Fahrtrichtung, 0 = +x)
/* Begehbarer Waffenladen: Tür und Schaufenster vorne, innen Holzboden, Waffenwand (hinten und an den Seiten),
   Verkaufstheke mit Waffen darauf, Verkäufer dahinter. face = Seite der Tür (+1 = +z, -1 = -z).
   Die Waffen-Modelle kommen aus models.js (werden dort an den gespeicherten Plätzen aufgestellt). */
window.GUN_SHOPS = [];
const SHOP_LAMP = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff1d0, emissiveIntensity: 1.2 });
function gunKiosk(x, z, f) {
  const W = 9, D = 8, H = 3.6, T = 0.25, NR = { round: 0 };
  const zF = z + f * (D / 2 - T / 2), zB = z - f * (D / 2 - T / 2);
  wallRun('x', x - W / 2, x + W / 2, zF, 0, H, T, MAT.brick, [[x - 1.1, x + 1.1, 0, 2.6], [x - 3.7, x - 2.0, 0.9, 2.5], [x + 2.0, x + 3.7, 0.9, 2.5]], NR);
  wallRun('x', x - W / 2, x + W / 2, zB, 0, H, T, MAT.brick, [], NR);
  for (const s of [-1, 1]) wallRun('z', z - D / 2 + T, z + D / 2 - T, x + s * (W / 2 - T / 2), 0, H, T, MAT.brick, [], NR);
  addBox(x, H, z, W + 0.5, 0.3, D + 0.5, MAT.dark, 1, NR);
  decalT(x, z, W - 0.5, D - 0.5, TKM.wood, 2, 0, 0.015);
  // Schaufensterglas, Türrahmen, Schild und Markise außen
  const glassM = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.3, depthWrite: false });
  for (const s of [-1, 1]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.6), glassM); g.position.set(x + s * 2.85, 1.7, zF); g.userData.noMerge = true; scene.add(g); }
  for (const s of [-1, 1]) addBox(x + s * 1.18, 0, zF + f * 0.08, 0.16, 2.7, 0.2, MAT.dark, 1, { decor: true, round: 0 });
  addBox(x, 2.6, zF + f * 0.08, 2.5, 0.16, 0.2, MAT.dark, 1, { decor: true, round: 0 });
  tkSign(x, 3.1, zF + f * 0.15, 6.5, 0.8, f > 0 ? 0 : Math.PI, tkSignMat('🔫 WAFFENLADEN', '#1b1b1b', '#ffcc33', false));
  addBox(x, 2.75, zF + f * 0.75, 8, 0.08, 1.3, MAT.ctrRed, 2.6, { decor: true, round: 0 });
  // Innen: Holzverkleidung hinten, Theke mit Glasplatte, Lampen
  const zBi = zB + f * (T / 2 + 0.04);
  addBox(x, 0.8, zBi + f * 0.03, W - 1.2, 2.5, 0.06, TKM.wood, 2, { decor: true, round: 0 });
  for (const s of [-1, 1]) addBox(x + s * (W / 2 - T - 0.03), 1.1, z - f * 0.6, 0.06, 1.8, 5.2, TKM.wood, 2, { decor: true, round: 0 });
  const zC = z - f * 1.0;
  addBox(x, 0, zC, 5.4, 1.05, 0.85, TKM.wood, 2, { round: 0.02 });
  addBox(x, 1.05, zC, 5.5, 0.05, 0.95, MAT.dark, 1, { decor: true, round: 0 });
  for (const s of [-2.2, 0, 2.2]) addBox(x + s, H - 0.12, z, 1.2, 0.08, 0.35, SHOP_LAMP, 0, { decor: true, round: 0, shadow: false });
  // Plätze für die ausgestellten Waffen: Wand hinten (2 Reihen), Seitenwände, Theke
  const displays = [];
  let w = 0; const NB = WEAPONS.length - BASE_WEAPONS, nextW = () => BASE_WEAPONS + ((w++ * 4 + 2) % NB);   // nur Waffen, die man kaufen kann
  for (const y of [1.45, 2.35]) for (const ox of [-3, -1, 1, 3]) displays.push({ w: nextW(), x: x + ox, y, z: zBi + f * 0.14, ry: Math.PI / 2, rz: 0 });
  for (const s of [-1, 1]) for (const oz of [-1.9, -0.3]) displays.push({ w: nextW(), x: x + s * (W / 2 - T - 0.16), y: 1.75, z: z + f * oz, ry: 0, rz: 0 });
  for (const ox of [-1.7, 0, 1.7]) displays.push({ w: nextW(), x: x + ox, y: 1.13, z: zC, ry: Math.PI / 2 + (ox ? 0.25 : -0.15), rz: Math.PI / 2, lie: true });
  window.GUN_SHOPS.push({ x, z: zC + f * 1.25, cx: x, cz: z, W, D, displays, keeper: [x + 0.8, zC - f * 1.0, x, zC + f * 3] });
}
function carSpot(x, z, yaw, ctype) { MAP_VEHICLES.push({ x, z, yaw, kind: 'car', ctype }); }
function truck(x, z, alongZ) {
  // Fahrerhaus + Kofferaufbau
  const cab = MAT.ctrRed;
  if (alongZ) {
    addBox(x, 0.5, z - 4.2, 2.4, 2.4, 2.2, cab, 2.6, { round: 0.3 }); addBox(x, 1.6, z - 5.25, 2.1, 0.9, 0.15, CAR_GLASS, 0, { decor: true, round: 0.06 });
    addBox(x, 0.6, z + 0.9, 2.5, 3.0, 7.5, MAT.ctrBlue, 2.6, { round: 0.1 }); collider(x, 0, z - 1.6, 2.4, 0.6, 9.8);
  } else {
    addBox(x - 4.2, 0.5, z, 2.2, 2.4, 2.4, cab, 2.6, { round: 0.3 });
    addBox(x + 0.9, 0.6, z, 7.5, 3.0, 2.5, MAT.ctrBlue, 2.6, { round: 0.1 }); collider(x - 1.6, 0, z, 9.8, 0.6, 2.4);
  }
  for (const t of [-4.2, -0.5, 3.4]) for (const s of [-1, 1]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 22), TIRE);
    if (alongZ) { wh.rotation.z = Math.PI / 2; wh.position.set(x + s * 1.15, 0.5, z + t); } else { wh.rotation.x = Math.PI / 2; wh.position.set(x + t, 0.5, z + s * 1.15); }
    wh.castShadow = true; scene.add(wh);
  }
}
function dumpster(x, z, alongX) {
  addBox(x, 0, z, alongX ? 2 : 1.3, 1.3, alongX ? 1.3 : 2, MAT.ctrGreen, 1, { round: 0.1 });
  addBox(x, 1.3, z, alongX ? 2.05 : 1.35, 0.08, alongX ? 1.35 : 2.05, MAT.dark, 1, { decor: true });
}
function hedge(x, z, w, d) { addBox(x, 0, z, w, 1.1, d, HEDGE_MAT, 1, { round: MAP_ID === 'welt' ? 0.12 : 0.45 }); }
const HEDGE_MAT = new THREE.MeshStandardMaterial({ map: TEX.needles, color: new THREE.Color(0.55, 0.75, 0.4), roughness: 1, bumpMap: TEX.needles, bumpScale: 0.05 });
function bench(x, z, alongX) {
  addBox(x, 0.42, z, alongX ? 1.8 : 0.45, 0.08, alongX ? 0.45 : 1.8, MAT.crate, 0, { decor: true });
  for (const o of [-0.7, 0.7]) addBox(x + (alongX ? o : 0), 0, z + (alongX ? 0 : o), 0.08, 0.42, 0.08, MAT.metal, 1, { decor: true });
  collider(x, 0, z, alongX ? 1.8 : 0.45, 0.5, alongX ? 0.45 : 1.8);
}
// Wachturm: Betonsockel 5×5×4 m mit Treppe und Sandsäcken oben
function watchtower(x, z, stairDir) {
  addBox(x, 0, z, 5, 4, 5, MAT.concrete, 2);
  for (let i = 0; i < 4; i++) addBox(x + stairDir * (3 + i), 0, z, 1, 3.2 - i * 0.8, 2.5, MAT.concrete, 1);
  addBox(x, 4, z + 2.2, 5, 1, 0.6, MAT.sandbag, 1.2); addBox(x, 4, z - 2.2, 5, 1, 0.6, MAT.sandbag, 1.2);
  addBox(x - stairDir * 2.2, 4, z, 0.6, 1, 3.8, MAT.sandbag, 1.2);
  for (const p of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) addBox(x + p[0] * 2.3, 4, z + p[1] * 2.3, 0.15, 2.6, 0.15, MAT.metal, 1, { decor: true });
  addBox(x, 6.6, z, 5.6, 0.15, 5.6, MAT.metal, 2, { decor: true });
}

/* ---------- Wasser im Hafenbecken (bewegte Wellen) ---------- */
const waterNormal = (() => {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), img = g.createImageData(s, s);
  const hgt = (x, y) => Math.sin(x * 0.098) * 0.5 + Math.sin(y * 0.073 + x * 0.03) * 0.6 + Math.sin((x + y) * 0.147) * 0.3 + Math.sin((x - y) * 0.245) * 0.2;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
    const l = Math.hypot(dx, dy, 1), i = (y * s + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 140);
  return t;
})();
window.waterNormal = waterNormal;

/* ======================= Aufbau der Karte ======================= */
MAT.concreteFloor = pbr('concrete', 2.7, { mat: { color: new THREE.Color(0.8, 0.8, 0.78) } });
MAT.plaster = pbr('concrete', 2.7, { mat: { color: new THREE.Color(1.05, 0.92, 0.75) } });
MAT.plaster2 = pbr('concrete', 2.7, { mat: { color: new THREE.Color(0.8, 0.88, 0.95) } });
MAT.hallMetal = pbr('container', 2.6, { mat: { color: new THREE.Color(0.75, 0.78, 0.8) } });
const BRONZE = new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.35, metalness: 0.9 });
const MAP_PICKUPS = [];

/* ======================= Karte „Tokio“: x/z -100 … 100, im Osten die Bucht ======================= */
const TK_FONT = '"Yu Gothic UI","Yu Gothic","Meiryo","Hiragino Sans","Noto Sans JP",sans-serif';
// Hochhaus-Fassade mit Fensterraster (512 px = 16 m, 4 Etagen); einzelne Fenster leuchten
function tkFacade(base, glass, frame, lit, style) {
  const s = 512, c = document.createElement('canvas'), e = document.createElement('canvas'); c.width = c.height = e.width = e.height = s;
  const g = c.getContext('2d'), ge = e.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, s, s); ge.fillStyle = '#000'; ge.fillRect(0, 0, s, s);
  const isGlass = style === 'glass', cols = isGlass ? 8 : 5, fh = s / 4, cw = s / cols;
  for (let f = 0; f < 4; f++) for (let k = 0; k < cols; k++) {
    const x = k * cw + (isGlass ? 2 : cw * 0.18), y = f * fh + (isGlass ? 3 : fh * 0.22);
    const w = isGlass ? cw - 4 : cw * 0.64, h = isGlass ? fh - 6 : fh * 0.56;
    const on = Math.random() < lit;
    g.fillStyle = on ? '#f1dca4' : glass; g.fillRect(x, y, w, h);
    if (!on) { const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(255,255,255,.2)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, w, h); }
    else { ge.fillStyle = '#ffe2a0'; ge.fillRect(x, y, w, h); }
    g.strokeStyle = frame; g.lineWidth = isGlass ? 3 : 4; g.strokeRect(x, y, w, h);
  }
  speckle(g, s, 4000, '0,0,0', 0.07, 2);
  const t = new THREE.CanvasTexture(halfOnTouch(c)), te = new THREE.CanvasTexture(halfOnTouch(e));   // Handy: halbe Auflösung (Speicher)
  for (const q of [t, te]) { q.wrapS = q.wrapT = THREE.RepeatWrapping; q.anisotropy = MAX_ANISO; q.encoding = THREE.sRGBEncoding; }
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: te, emissiveIntensity: 0.5,
    roughness: isGlass ? 0.18 : 0.75, metalness: isGlass ? 0.55 : 0.1, envMapIntensity: isGlass ? 1.5 : 1 });
}
const TKM = {
  glassBlue: tkFacade('#3a4a5c', '#1c2d43', '#61728a', 0.12, 'glass'),
  glassGreen: tkFacade('#2f4442', '#173130', '#58736e', 0.1, 'glass'),
  office: tkFacade('#b8b2a5', '#2a3440', '#8e887c', 0.25, 'office'),
  officeDark: tkFacade('#4a4c52', '#1e2530', '#34363b', 0.3, 'office'),
  tile: tkFacade('#d6d0c2', '#2b3541', '#aaa498', 0.2, 'office'),
  lobby: new THREE.MeshStandardMaterial({ color: 0x141a20, roughness: 0.1, metalness: 0.7, envMapIntensity: 1.5 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc8321e, roughness: 0.55 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.6 }),
  white: new THREE.MeshStandardMaterial({ color: 0xe9e8e2, roughness: 0.6 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc9a43a, roughness: 0.3, metalness: 0.9 }),
  wood: pbr('wood', 2, { mat: { color: new THREE.Color(0.8, 0.5, 0.33) } }),
  stone: pbr('concrete', 2, { mat: { color: new THREE.Color(0.78, 0.77, 0.72) } }),
  gravel: pbr('asphalt', 3, { mat: { color: new THREE.Color(1.6, 1.55, 1.45) } }),
  roofTile: pbr('roof', 2.5, { mat: { color: new THREE.Color(0.42, 0.45, 0.52) } }),
  water: new THREE.MeshStandardMaterial({ color: 0x23464f, roughness: 0.05, metalness: 0.3, normalMap: waterNormal, envMapIntensity: 1.3 }),
  sakura: new THREE.MeshStandardMaterial({ map: canvasTex((g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = rnd(2, 5), l = rnd(0.75, 1);
      g.fillStyle = `rgb(${255 * l | 0},${(170 + Math.random() * 60) * l | 0},${(195 + Math.random() * 40) * l | 0})`;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }, 256), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 }),
  lantern: new THREE.MeshStandardMaterial({ color: 0xd8301c, emissive: 0xff4a20, emissiveIntensity: 0.7, roughness: 0.6 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.3, metalness: 0.8 }),
  green: new THREE.MeshStandardMaterial({ color: 0x2f7a3c, roughness: 0.45, metalness: 0.2 }),
  signal: new THREE.MeshStandardMaterial({ color: 0x30ff70, emissive: 0x30ff70, emissiveIntensity: 1.2 }),
  signalR: new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff3020, emissiveIntensity: 1.2 }),
};
// Leuchtschild (waagerecht oder senkrecht) mit japanischer Schrift
// Handy: Bild auf halbe Größe verkleinern (Schilder, Fassaden) – spart Grafikspeicher, sonst stürzt der Browser-Tab ab
function halfOnTouch(c) {
  if (!TOUCH || c.width < 128) return c;
  const h = document.createElement('canvas'); h.width = c.width / 2; h.height = c.height / 2; h.getContext('2d').drawImage(c, 0, 0, h.width, h.height); return h;
}
function tkSignMat(text, bg, fg, vertical, wpx = 512, hpx = 128) {
  const c = document.createElement('canvas'); c.width = vertical ? hpx : wpx; c.height = vertical ? wpx : hpx;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (vertical) {
    const ch = [...text], step = (c.height - 30) / ch.length, fs = Math.min(c.width * 0.7, step * 0.9);
    g.font = `900 ${fs}px ${TK_FONT}`; ch.forEach((k, i) => g.fillText(k, c.width / 2, 15 + (i + 0.5) * step));
  } else {
    let fs = c.height * 0.62; g.font = `900 ${fs}px ${TK_FONT}`;
    while (g.measureText(text).width > c.width - 40 && fs > 10) { fs -= 4; g.font = `900 ${fs}px ${TK_FONT}`; }
    g.fillText(text, c.width / 2, c.height / 2 + 3);
  }
  const t = new THREE.CanvasTexture(halfOnTouch(c)); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.7, roughness: 0.4 });
}
const TK_COLORS = [['#d41f3a', '#ffffff'], ['#ffd21f', '#c0141e'], ['#1b6fd8', '#ffffff'], ['#12a05a', '#ffffff'], ['#ff6a00', '#ffffff'], ['#6a2bd6', '#ffe14d'], ['#111111', '#ff3b7a'], ['#ffffff', '#d41f3a']];
const TK_WORDS = ['ラーメン', 'カラオケ', '寿司', '居酒屋', 'ゲーム', 'ホテル', 'カフェ', '焼肉', '電器', '本屋', 'うどん', 'バー', '薬局', '定食', '餃子', '喫茶'];
let tkSignN = 0;
function tkSign(x, y, z, w, h, rotY, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = rotY; scene.add(m); return m;
}
// Senkrechtes Schild an einer Fassade (zufälliges Wort/Farbe)
function tkVSign(x, y, z, rotY, h = 3.2) {
  const [bg, fg] = TK_COLORS[tkSignN % TK_COLORS.length], word = TK_WORDS[(tkSignN * 7) % TK_WORDS.length]; tkSignN++;
  return tkSign(x, y, z, h / 4, h, rotY, tkSignMat(word, bg, fg, true));
}
function tkHSign(x, y, z, w, rotY, word) {
  const [bg, fg] = TK_COLORS[tkSignN % TK_COLORS.length]; tkSignN++;
  return tkSign(x, y, z, w, w / 4, rotY, tkSignMat(word || TK_WORDS[(tkSignN * 5) % TK_WORDS.length], bg, fg, false));
}
// Hochhaus (nicht begehbar): Fassade, dunkle Lobby, Technik auf dem Dach
function tkTower(x, z, w, d, h, mat) {
  addBox(x, 0, z, w, h, d, mat, 16, { round: 0 });
  addBox(x, 0, z, w + 0.2, 4.2, d + 0.2, TKM.lobby, 4, { decor: true, round: 0 });
  addBox(x, h, z, w, 0.9, d, MAT.concrete, 2, { decor: true, round: 0, shadow: false });
  if (w > 9) { addBox(x + w * 0.2, h + 0.9, z - d * 0.15, 3, 2.2, 3, MAT.metal, 1, { decor: true }); addBox(x - w * 0.25, h + 0.9, z + d * 0.2, 2.2, 3.2, 2.2, MAT.hallMetal, 2, { decor: true }); }
  if (h > 40) addBox(x, h + 0.9, z, 0.3, 9, 0.3, MAT.metal, 1, { decor: true });
}
function tkLamp(x, z, dx, dz) {
  addBox(x, 0, z, 0.18, 6, 0.18, MAT.metal, 1, { round: 0.085 });
  addBox(x + dx * 0.7, 5.9, z + dz * 0.7, dx ? 1.4 : 0.1, 0.1, dz ? 1.4 : 0.1, MAT.dark, 1, { decor: true });
  addBox(x + dx * 1.4, 5.75, z + dz * 1.4, dx ? 0.6 : 0.3, 0.15, dz ? 0.6 : 0.3, LAMP_MAT, 0, { decor: true, round: 0.05 });
}
function tkSignal(x, z, dx, dz) {
  addBox(x, 0, z, 0.16, 4.6, 0.16, MAT.dark, 1, { round: 0.07 });
  addBox(x + dx * 0.25, 4.0, z + dz * 0.25, dz ? 1.1 : 0.32, 0.38, dx ? 1.1 : 0.32, MAT.dark, 1, { decor: true, round: 0.05 });
  addBox(x + dx * 0.42, 4.08, z + dz * 0.42, 0.22, 0.22, 0.22, (Math.abs(x + z) | 0) % 2 ? TKM.signal : TKM.signalR, 0, { decor: true, round: 0.1 });
}
function tkZebra(cx, cz, alongX, width, len) {
  // Streifen quer zur Gehrichtung; alongX = Fußgänger laufen entlang x
  for (let o = -width / 2 + 0.4; o < width / 2; o += 1.2)
    alongX ? decalT(cx, cz + o, len, 0.6, MAT.zebra, 0, 0, 0.016) : decalT(cx + o, cz, 0.6, len, MAT.zebra, 0, 0, 0.016);
}
function tkPlanter(x, z, w, d) {
  addBox(x, 0, z, w, 0.9, d, MAT.concrete, 2);
  addBox(x, 0.9, z, w - 0.2, 0.55, d - 0.2, HEDGE_MAT, 1, { decor: true, round: 0.22 });
}
const VEND_MAT = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#1e2a36'; g.fillRect(10, 14, 108, 120);
  const cols = ['#d63031', '#0984e3', '#00b894', '#fdcb6e', '#e17055', '#6c5ce7'];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) { g.fillStyle = cols[(r * 6 + k * 5) % 6]; g.fillRect(16 + k * 17, 20 + r * 29, 11, 22); g.fillStyle = '#fff'; g.fillRect(17 + k * 17, 21 + r * 29, 3, 6); }
  g.fillStyle = '#c0392b'; g.fillRect(0, 140, 128, 30); g.fillStyle = '#222'; g.fillRect(36, 190, 56, 40);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.45, roughness: 0.4 });
})();
// Getränkeautomat; rot = Blickrichtung (0 = +z, π/2 = +x …)
function tkVend(x, z, rot) {
  const side = Math.abs(Math.sin(rot)) > 0.5;
  addBox(x, 0, z, side ? 0.8 : 1.0, 1.85, side ? 1.0 : 0.8, TKM.white, 1, { round: 0.04 });
  tkSign(x + Math.sin(rot) * 0.41, 0.95, z + Math.cos(rot) * 0.41, 0.95, 1.8, rot, VEND_MAT);
}
function tkLantern(x, y, z) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), TKM.lantern); m.scale.y = 1.35; m.position.set(x, y, z); scene.add(m);
  addBox(x, y + 0.33, z, 0.22, 0.06, 0.22, TKM.black, 0, { decor: true, round: 0.02 }); addBox(x, y - 0.39, z, 0.22, 0.06, 0.22, TKM.black, 0, { decor: true, round: 0.02 });
}
function tkStoneLantern(x, z) {
  addBox(x, 0, z, 0.8, 0.35, 0.8, TKM.stone, 1); addBox(x, 0.35, z, 0.3, 0.9, 0.3, TKM.stone, 1, { decor: true });
  addBox(x, 1.25, z, 0.65, 0.5, 0.65, TKM.stone, 1, { decor: true }); addBox(x, 1.75, z, 1.0, 0.18, 1.0, TKM.stone, 1, { decor: true, round: 0.06 });
  collider(x, 0, z, 0.7, 1.9, 0.7);
}
function tkTorii(x, z, alongX, s = 1) {
  const o = 3 * s;
  for (const k of [-1, 1]) {
    const px = alongX ? x + k * o : x, pz = alongX ? z : z + k * o;
    const post = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(0.3 * s, 0.36 * s, 5.6 * s, 16)), TKM.red); post.position.set(px, 2.8 * s, pz); post.castShadow = true; scene.add(post);
    addBox(px, 0, pz, 0.9 * s, 0.5 * s, 0.9 * s, TKM.black, 1, { decor: true, round: 0.05 }); collider(px, 0, pz, 0.75 * s, 5.6 * s, 0.75 * s);
  }
  addBox(x, 4.4 * s, z, alongX ? 7.4 * s : 0.4 * s, 0.38 * s, alongX ? 0.4 * s : 7.4 * s, TKM.red, 0, { decor: true });
  addBox(x, 5.55 * s, z, alongX ? 8.6 * s : 0.8 * s, 0.4 * s, alongX ? 0.8 * s : 8.6 * s, TKM.red, 0, { decor: true });
  addBox(x, 5.95 * s, z, alongX ? 9.2 * s : 0.95 * s, 0.32 * s, alongX ? 0.95 * s : 9.2 * s, TKM.black, 0, { decor: true });
}
function tkPagoda(x, z) {
  addBox(x, 0, z, 9, 1, 9, TKM.stone, 2);
  for (let i = 0; i < 5; i++) {
    const bw = 5.4 - i * 0.7, y = 1 + i * 2.7;
    addBox(x, y, z, bw, 2.3, bw, TKM.red, 2);
    addBox(x, y + 2.3, z, bw + 2.8, 0.35, bw + 2.8, TKM.roofTile, 2.5, { decor: true, round: 0.1 });
    addBox(x, y + 2.15, z, bw + 0.6, 0.15, bw + 0.6, TKM.black, 0, { decor: true });
  }
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 5, 10), TKM.gold); sp.position.set(x, 1 + 5 * 2.7 + 2.6, z); scene.add(sp);
}
function tkSakura(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, 3.2, 10), treeTrunkMat); tr.position.y = 1.6; tr.castShadow = true; g.add(tr);
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(srnd(1.1, 1.7), 11, 8), TKM.sakura);
    c.position.set(srnd(-1.3, 1.3), srnd(3.0, 4.4), srnd(-1.3, 1.3)); c.scale.y = 0.75; c.castShadow = true; g.add(c);
  }
  scene.add(g); treeCollider(x, 0, z, 0.5 * s, 3 * s, 0.5 * s);
}
function tkTrainCar(cx, z, mat = TKM.silver) {
  addBox(cx, 0.55, z, 17, 3.2, 2.9, mat, 2, { round: 0.25 });
  addBox(cx, 1.9, z, 16.4, 0.95, 2.96, CAR_GLASS, 0, { decor: true, round: 0.08 });
  addBox(cx, 1.45, z, 17.05, 0.22, 2.97, mat === TKM.green ? TKM.white : TKM.green, 0, { decor: true, round: 0 });
  for (const o of [-6, 6]) addBox(cx + o, 0.05, z, 2.6, 0.55, 2.2, MAT.dark, 1, { decor: true });
  collider(cx, 0, z, 17, 0.6, 2.9);
}

MAT.zebra = new THREE.MeshStandardMaterial({ color: 0xe2e0d6, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 });
window.MAP_STREETS = [[-7, -100, 7, 100], [-100, -7, 100, 7], [-57, -100, -47, 100], [47, -100, 57, 100], [-100, -57, 100, -47], [-100, 47, 100, 57]];
window.FIRE_POS = [40, -2.5];
window.SHIP_SMOKE = [152, 16, 19];

function buildTokyoMap() {
  const WALL_H = 7;
  const white = new THREE.MeshStandardMaterial({ color: 0xd8d6cc, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
  const yel = new THREE.MeshStandardMaterial({ color: 0xc8a232, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
  MAT.rampWood = pbr('wood', 2, { mat: { color: new THREE.Color(1.35, 1.2, 1.0) } });
  MAT.dirt = pbr('asphalt', 3, { map: tintedTex('asphalt', 0x6e5034), mat: { color: new THREE.Color(0.68, 0.6, 0.52) }, normalScale: 1.6 });

  /* --- Außengrenzen: Mauern N/W/S, Kaimauer zur Bucht im Osten --- */
  addBox(0, 0, -100.5, 202, WALL_H, 1, MAT.concrete, 3); addBox(0, 0, 100.5, 202, WALL_H, 1, MAT.concrete, 3);
  addBox(-100.5, 0, 0, 1, WALL_H, 202, MAT.concrete, 3);
  for (let i = -96; i <= 96; i += 12) {
    addBox(i, 0, -100, 1.1, WALL_H + 0.4, 1.1, MAT.concrete, 2, { decor: true }); addBox(i, 0, 100, 1.1, WALL_H + 0.4, 1.1, MAT.concrete, 2, { decor: true });
    addBox(-100, 0, i, 1.1, WALL_H + 0.4, 1.1, MAT.concrete, 2, { decor: true });
  }
  addBox(100.9, -2.2, 0, 0.8, 2.45, 202, MAT.concrete, 2, { decor: true });
  for (let z = -95; z <= 95; z += 10) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 12), MAT.dark); b.position.set(99.6, 0.35, z); b.castShadow = true; scene.add(b);
    collider(99.6, 0, z, 0.5, 0.7, 0.5);
  }
  for (let z = -99; z < 100; z += 2.5) addBox(100.6, 0.25, z, 0.06, 1.0, 0.06, MAT.yellow, 1, { decor: true });
  addBox(100.6, 1.2, 0, 0.06, 0.06, 200, MAT.yellow, 1, { decor: true });
  collider(101.5, 0, 0, 1, 14, 202);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(800, 1600), new THREE.MeshStandardMaterial({ color: 0x1b3c48, roughness: 0.08, metalness: 0.2, normalMap: waterNormal, envMapIntensity: 1.3 }));
  water.material.normalScale.set(0.5, 0.5); water.rotation.x = -Math.PI / 2; water.position.set(101 + 400, -0.9, 0); water.userData.noMerge = true; scene.add(water);
  // Frachtschiff in der Bucht
  const hull = new THREE.MeshStandardMaterial({ color: 0x3a1a16, roughness: 0.6, metalness: 0.3 });
  addBox(152, -3, -10, 18, 9, 90, hull, 3, { decor: true, shadow: false }); addBox(152, 6, -10, 17, 0.3, 88, MAT.dark, 3, { decor: true, shadow: false });
  addBox(152, 6.3, 27, 14, 9, 10, MAT.plaster2, 2.7, { decor: true, shadow: false });
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) for (let h = 0; h < 1 + ((r * 7 + c * 3) % 3); h++)
    addBox(146.5 + c * 3.6, 6.3 + h * 2.6, -47 + r * 13, 2.44, 2.6, 12.2, [MAT.ctrRed, MAT.ctrBlue, MAT.ctrGreen, MAT.ctrOrange][(r + c + h) % 4], 2.6, { decor: true, shadow: false });

  /* --- Straßen: zwei Hauptstraßen (x=0, z=0) mit großer Kreuzung, vier Nebenstraßen (±52) --- */
  const BX = [[-100, -57], [-47, -7], [7, 47], [57, 100]];
  for (const [x0, x1] of BX) for (const [z0, z1] of BX) decalT((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, MAT.concreteFloor, 2.7, 0, 0.008);   // Gehwege/Blöcke
  const crossings = [0, -52, 52];
  const nearX = v => crossings.some(c => Math.abs(v - c) < (c === 0 ? 8.5 : 6.5));
  for (let t = -98; t < 98; t += 4) {
    if (!nearX(t)) {
      decalT(t, -3.5, 2.2, 0.16, white, 0, 0, 0.014); decalT(t, 3.5, 2.2, 0.16, white, 0, 0, 0.014); decalT(t, 0, 4, 0.22, yel, 0, 0, 0.014);
      decalT(-3.5, t, 0.16, 2.2, white, 0, 0, 0.014); decalT(3.5, t, 0.16, 2.2, white, 0, 0, 0.014); decalT(0, t, 0.22, 4, yel, 0, 0, 0.014);
      for (const s of [-52, 52]) { decalT(t, s, 2.2, 0.16, white, 0, 0, 0.014); decalT(s, t, 0.16, 2.2, white, 0, 0, 0.014); }
    }
  }
  // Große „Scramble“-Kreuzung in der Mitte: Zebrastreifen in alle Richtungen + diagonal
  tkZebra(0, -9, false, 14, 3.4); tkZebra(0, 9, false, 14, 3.4); tkZebra(-9, 0, true, 14, 3.4); tkZebra(9, 0, true, 14, 3.4);
  for (const sgn of [1, -1]) for (let k = -8.4; k <= 8.4; k += 1.3) decalT(k * 0.707, sgn * k * 0.707, 0.6, 3.2, MAT.zebra, 0, -sgn * Math.PI / 4, 0.017);
  for (const cx of [0, -52, 52]) for (const cz of [0, -52, 52]) {
    if (!cx && !cz) continue;
    const hw = cx === 0 || cz === 0 ? 7 : 5;
    tkZebra(cx, cz - hw - 1.8, false, cx === 0 ? 14 : 10, 3); tkZebra(cx, cz + hw + 1.8, false, cx === 0 ? 14 : 10, 3);
    tkZebra(cx - hw - 1.8, cz, true, cz === 0 ? 14 : 10, 3); tkZebra(cx + hw + 1.8, cz, true, cz === 0 ? 14 : 10, 3);
  }
  // Ampeln und Laternen
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) tkSignal(sx * 8.3, sz * 8.3, -sx, -sz * 0);
  for (const c of [-52, 52]) for (const [sx, sz] of [[1, 1], [-1, -1]]) { tkSignal(c + sx * 6, sz * 8.3, -sx, 0); tkSignal(sx * 8.3, c + sz * 6, 0, -sz); }
  for (let t = -92; t <= 92; t += 16) {
    if (nearX(t)) continue;
    tkLamp(t, -7.6, 0, 1); tkLamp(t + 8, 7.6, 0, -1); tkLamp(-7.6, t, 1, 0); tkLamp(7.6, t + 8, -1, 0);
  }
  // Bäume an der Hauptstraße
  for (let t = -90; t <= 90; t += 14) { if (nearX(t) || nearX(t - 3) || nearX(t + 3)) continue; leafTree(9.6, t, 0.8); leafTree(-9.6, t + 7, 0.8); }
  // Deckung auf den Straßen (Barrikaden, Wrack, LKW)
  const burnt = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9, metalness: 0.4 });
  addBox(40, 0.3, -2.5, 11, 2.7, 2.6, burnt, 0); collider(40, 0, -2.5, 11, 0.3, 2.6);
  for (let i = 0; i < 5; i++) addBox(36 + i * 2.1, 1.6, -1.19, 1.5, 0.9, 0.05, CAR_GLASS, 0, { decor: true });
  jersey(20, -3, true); jersey(-24, 3, true); jersey(-64, -2, true); jersey(70, 3, true); jersey(52, 14, false); jersey(-52, -34, false); jersey(3, 66, false); jersey(-3, -70, false);
  sandbags(-3, 24, 3, false); sandbags(3, -32, 3, false); sandbags(30, 52, 3, true); sandbags(-36, -52, 3, true); sandbags(-52, 36, 3, false); sandbags(52, -70, 3, false);
  truck(-30, 54, false); truck(52, 78, true);

  /* --- Hochstraße über der Nordstraße (z=-52): Auffahrten im Westen/Osten, Lücke über der Hauptstraße --- */
  const HY = 7;
  addRamp(-97, -52, 0, 8, [[0, 0], [27, HY]], MAT.concrete, 3);
  addRamp(70, -52, 0, 8, [[0, HY], [27, 0]], MAT.concrete, 3);
  for (const cx of [-38, 38]) {
    addBox(cx, HY - 0.6, -52, 64, 0.6, 9, MAT.concrete, 3);
    for (const sz of [-1, 1]) addBox(cx, HY, -52 + sz * 4.35, 64, 1.0, 0.3, MAT.concrete, 2);
    tkSign(cx, HY - 1.6, -52 + 4.52, 10, 1.6, 0, tkSignMat('首都高速', '#1d6b3a', '#ffffff', false));
  }
  for (const x of [-62, -46, -30, -14, 14, 30, 46, 62]) addBox(x, 0, -52, 1.4, HY - 0.6, 1.8, MAT.concrete, 2);
  addRamp(-10.5, -52, 0, 5, P_KICK(4.5, 1.2), MAT.rampWood, 2, HY);         // Sprung über die Lücke (West → Ost)
  addRamp(10.5, -52, Math.PI, 5, P_KICK(4.5, 1.2), MAT.rampWood, 2, HY);    // und zurück

  /* --- Mitte NW: Glasturm mit Riesenbildschirm zur Kreuzung --- */
  tkTower(-30, -30, 24, 24, 46, TKM.glassBlue);
  const screen = tkSignMat('東京 TOKYO', '#0a1440', '#38f2ff', false, 1024, 512); screen.emissiveIntensity = 1.1;
  tkSign(-17.85, 22, -26, 16, 8, Math.PI / 2, screen);
  tkSign(-26, 16, -17.85, 12, 3, 0, tkSignMat('カラオケ', '#d41f3a', '#ffffff', false));
  tkPlanter(-12, -14, 4, 1.2); tkPlanter(-14, -11.5, 1.2, 4); tkPlanter(-12, -22, 3, 1.2);
  addBox(-13, 0, -30, 3, 2.6, 2.5, MAT.plaster2, 2.7); addBox(-13, 2.6, -30, 3.6, 0.15, 3, MAT.ctrRed, 2.6, { decor: true });   // Kiosk
  tkVend(-14.9, -26, Math.PI / 2); tkVend(-14.9, -24.9, Math.PI / 2);

  /* --- Mitte NO: Kaufhaus (begehbar, 3 Etagen + Dach) --- */
  const DS = building(30, -28, 24, 18, 3, MAT.plaster2, { s: [-5, 5], w: [5] }, { crates: 2 });
  tkSign(30, DS.roofY + 3, -28, 14, 3.5, Math.PI / 2 * 0, tkSignMat('百貨店', '#ffffff', '#d41f3a', false));
  addBox(30, DS.roofY + 1, -28, 0.3, 1.6, 0.3, MAT.metal, 1, { decor: true });
  tkVSign(18.2 + 0, 6, -19.2 + 0.05, 0, 4); tkVSign(41.5, 6, -18.8, 0, 4); tkVSign(17.8, 5.5, -33, -Math.PI / 2, 4);
  tkTower(12.5, -41, 9, 10, 22, TKM.tile);
  tkPlanter(20, -12, 5, 1.2); tkPlanter(36, -12, 5, 1.2);

  /* --- Mitte SW: Bahnhofsvorplatz mit Hundestatue, alter Waggon, kleiner Bahnhof --- */
  decalT(-27, 22, 38, 28, MAT.concreteFloor, 2.7, 0, 0.011);
  addBox(-14, 0, 14, 2.2, 1.2, 1.6, MAT.concrete, 2);
  addBox(-14, 1.2, 14, 0.5, 0.75, 1.1, BRONZE, 0, { decor: true }); addBox(-14, 1.85, 14.45, 0.32, 0.36, 0.42, BRONZE, 0, { decor: true });
  addBox(-14, 1.6, 13.5, 0.14, 0.4, 0.14, BRONZE, 0, { decor: true });   // Hund aus Bronze
  tkTrainCar(-32, 18, TKM.green);
  const ST = building(-36, 38, 18, 10, 1, MAT.brick, { n: [-4, 4] }, { crates: 1 });
  tkSign(-36, 3.9, 32.85, 6, 1.5, Math.PI, tkSignMat('駅 STATION', '#1b3a6d', '#ffffff', false));
  for (const [x, z] of [[-42, 12], [-22, 12], [-44, 26], [-20, 28]]) leafTree(x, z, 0.85);
  tkPlanter(-24, 24, 4, 1.2); tkPlanter(-40, 24, 1.2, 4);
  addBox(-11, 0, 42, 2.4, 2.8, 2.4, TKM.white, 2); addBox(-11, 2.8, 42, 2.8, 0.25, 2.8, TKM.black, 0, { decor: true });   // Polizeihäuschen
  const pl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), TKM.signalR); pl.position.set(-11, 3.25, 42); scene.add(pl);
  bench(-26, 14, true); bench(-18, 30, false);

  /* --- Mitte SO: Hochhaus, Spielhalle (begehbar), Karaoke-Turm --- */
  tkTower(36, 36, 18, 18, 54, TKM.glassGreen);
  tkSign(26.85, 30, 36, 12, 6, -Math.PI / 2, tkSignMat('KAMPFZONE', '#111111', '#ff3b7a', false, 1024, 512));
  building(16, 20, 10, 12, 2, MAT.brick, { w: [0], n: [0] }, { crates: 1 });
  tkSign(10.85, 4.5, 20, 8, 2, -Math.PI / 2, tkSignMat('ゲーム', '#6a2bd6', '#ffe14d', false));
  tkVSign(21.2, 4, 15, Math.PI / 2, 4);
  tkTower(17, 39, 12, 12, 26, TKM.officeDark);
  tkVSign(10.9, 9, 36, -Math.PI / 2, 6); tkVSign(10.9, 9, 42, -Math.PI / 2, 6); tkVSign(17, 12, 32.9, Math.PI, 6);
  tkVend(25.5, 12, Math.PI / 2); tkVend(25.5, 13.1, Math.PI / 2);

  /* --- NW: Schrein mit Torii, Pagode, Steinlaternen, Kirschbäumen --- */
  decalT(-78.5, -78.5, 42, 42, TKM.gravel, 3, 0, 0.012);
  decalT(-78.5, -71, 4, 28, TKM.stone, 2, 0, 0.014);
  tkTorii(-78.5, -60, true, 1.15); tkTorii(-78.5, -72, true, 0.9);
  addBox(-78.5, 0, -89, 18, 0.8, 12, TKM.stone, 2);
  addBox(-78.5, 0.8, -89, 15, 5.2, 9, TKM.wood, 2);
  addBox(-78.5, 6.0, -89, 19, 0.5, 13, TKM.roofTile, 2.5, { decor: true, round: 0.15 });
  addBox(-78.5, 6.5, -89, 15, 0.7, 9.5, TKM.roofTile, 2.5, { decor: true, round: 0.15 });
  addBox(-78.5, 7.2, -89, 10, 0.8, 5, TKM.roofTile, 2.5, { decor: true, round: 0.15 });
  addBox(-78.5, 8.0, -89, 11, 0.25, 0.6, TKM.black, 0, { decor: true });
  for (const k of [-3, 3]) tkLantern(-78.5 + k, 4.6, -84.3);
  tkPagoda(-93, -72);
  for (const z of [-64, -68, -76, -80]) { tkStoneLantern(-81.6, z); tkStoneLantern(-75.4, z); }
  for (const [x, z, s] of [[-93, -93, 1], [-64, -93, 1.1], [-64, -66, 0.9], [-93, -60, 1], [-64, -78, 1], [-70, -96, 0.9], [-88, -82, 0.8]]) tkSakura(x, z, s);
  // Holzzaun mit Eingang
  addBox(-78.5, 0, -99.3, 42, 1.2, 0.3, TKM.wood, 2); addBox(-99.3, 0, -78.5, 0.3, 1.2, 42, TKM.wood, 2); addBox(-57.7, 0, -78.5, 0.3, 1.2, 42, TKM.wood, 2);
  addBox(-90.5, 0, -57.7, 18, 1.2, 0.3, TKM.wood, 2); addBox(-66.5, 0, -57.7, 18, 1.2, 0.3, TKM.wood, 2);

  /* --- N: enge Kneipengassen mit kleinen Häusern, Laternen, Schildern --- */
  const ggMats = [MAT.plaster, MAT.plaster2, MAT.brick, MAT.concrete];
  let gi = 0;
  for (const z of [-93, -81, -69]) for (const x of [-41, -31, -21, -11]) {
    building(x, z, 7, 8, 2, ggMats[gi++ % 4], { s: [0] }, { crates: 1 });
    tkVSign(x + 2.7, 4.6, z + 4.02, 0, 3.4);
    tkLantern(x - 1.5, 2.7, z + 4.4); tkLantern(x + 1.5, 2.7, z + 4.4);
  }
  for (const [x, z] of [[-36, -75], [-16, -87], [-26, -63]]) tkVend(x, z, Math.PI);
  tkSign(-27, 6.5, -57.4, 12, 2, 0, tkSignMat('横丁 GASSEN', '#111111', '#ffcc33', false));

  /* --- N-Ost: Büro-Hochhäuser mit Platz --- */
  tkTower(17, -90, 16, 14, 58, TKM.glassBlue);
  tkTower(38, -88, 14, 18, 44, TKM.office);
  tkTower(24, -68, 18, 10, 30, TKM.officeDark);
  tkSign(24, 18, -62.85, 10, 2.5, 0, tkSignMat('ホテル', '#1b6fd8', '#ffffff', false));
  tkPlanter(40, -70, 6, 1.2); tkPlanter(40, -64, 1.2, 4); bench(36, -62, true);

  /* --- NO: Bahnhof mit Zügen, Bahnsteig, Bahnhofsgebäude --- */
  decalT(78.5, -84, 43, 30, TKM.gravel, 3, 0, 0.012);
  for (const z of [-95, -85, -77]) {
    decalT(78.5, z, 43, 2.6, MAT.dirt, 3, 0, 0.014);
    for (const o of [-0.72, 0.72]) decalT(78.5, z + o, 43, 0.1, MAT.metal, 1.5, 0, 0.018);
  }
  addBox(78.5, 0, -90, 40, 1.0, 5, MAT.concrete, 2);
  for (const x of [58, 99]) addBox(x, 0, -90, 1.2, 0.5, 4, MAT.concrete, 1);
  for (let x = 62; x <= 96; x += 8) addBox(x, 1, -90, 0.2, 3.2, 0.2, MAT.metal, 1, { decor: true });
  addBox(78.5, 4.2, -90, 40, 0.2, 5.5, MAT.hallMetal, 2.6, { decor: true });
  tkSign(78.5, 3.4, -87.4, 4, 0.8, 0, tkSignMat('東京駅 1', '#ffffff', '#1d1d1d', false));
  for (const cx of [67, 84.5]) tkTrainCar(cx, -95);
  for (const cx of [62, 79.5, 97]) tkTrainCar(cx, -85);
  for (const cx of [66, 82, 95]) { addBox(cx, 0.2, -77, 12.5, 0.6, 2.6, MAT.dark, 1); container(cx, 0.8, -77, true, [MAT.ctrRed, MAT.ctrBlue, MAT.ctrOrange][Math.abs(cx) % 3]); }
  building(88, -64, 16, 10, 1, MAT.plaster2, { s: [-3, 3] }, { crates: 1 });
  tkSign(88, 3.7, -58.85, 8, 1.6, 0, tkSignMat('駅 STATION', '#1b3a6d', '#ffffff', false));

  /* --- W-Nord: Supermarkt, Tankstelle, Parkplatz --- */
  building(-88, -40, 14, 10, 1, MAT.plaster2, { e: [0] }, { crates: 2 });
  tkSign(-80.85, 3.6, -40, 8, 1.4, Math.PI / 2, tkSignMat('MART 24', '#12a05a', '#ffffff', false));
  for (const z of [-45.8, -44.7, -34.3]) tkVend(-80.2, z, Math.PI / 2);
  for (let z = -42; z <= -12; z += 3) decalT(-70, z, 8, 0.12, white, 0, 0, 0.014);
  truck(-64, -22, true);
  for (const [x, z] of [[-93, -24], [-83, -24], [-93, -12], [-83, -12]]) addBox(x, 0, z, 0.4, 5, 0.4, MAT.metal, 1);
  addBox(-88, 5, -18, 14, 0.5, 16, TKM.white, 2, { decor: true });
  tkSign(-88, 5.25, -9.95, 6, 0.5, 0, tkSignMat('GAS', '#d41f3a', '#ffffff', false));
  for (const z of [-21, -15]) { addBox(-90.5, 0, z, 0.8, 1.6, 0.6, MAT.ctrRed, 1); addBox(-85.5, 0, z, 0.8, 1.6, 0.6, MAT.ctrRed, 1); }

  /* --- W-Süd: Wohnviertel mit kleinen Häusern --- */
  for (const z of [16, 29, 41]) for (const x of [-93, -81, -68]) {
    if (x === -68 && z === 41) continue;
    house(x, z, 8, 7, 3.6, MAT.plaster);
  }
  for (const [x, z] of [[-76.4, 34], [-87, 35], [-62, 10]]) tkVend(x, z, Math.PI / 2);
  leafTree(-68, 41, 0.9); bench(-64, 44, true); hedge(-72, 45.5, 6, 1);

  /* --- O-Nord: Baustelle mit Kran, Rohbau, Bauzaun --- */
  decalT(78.5, -27, 42, 39, MAT.dirt, 4.5, 0, 0.012);
  wallRun('x', 58, 99, -46, 0, 2.4, 0.15, MAT.hallMetal, []);
  wallRun('x', 58, 99, -8, 0, 2.4, 0.15, MAT.hallMetal, [[64, 72, 0, 2.4]]);
  wallRun('z', -46, -8, 58, 0, 2.4, 0.15, MAT.hallMetal, [[-32, -22, 0, 2.4]]);
  building(84, -30, 16, 14, 3, MAT.concrete, { w: [0] }, { crates: 0 });
  for (let y = 0; y < 9.6; y += 3.2) addBox(92.6, y + 3.0, -30, 1.2, 0.08, 14, MAT.crate, 0, { decor: true });
  for (const z of [-37, -30, -23]) addBox(93.1, 0, z, 0.08, 10, 0.08, MAT.metal, 1, { decor: true });
  addBox(68, 0, -40, 2, 36, 2, MAT.yellow, 2);
  addBox(76, 36, -40, 36, 1.4, 1.4, MAT.yellow, 2, { decor: true }); addBox(66.5, 34.5, -40, 3, 3, 3, MAT.concrete, 2, { decor: true });
  addBox(70, 37.4, -40, 2.4, 2.4, 2.4, MAT.plaster2, 2.7, { decor: true });
  addBox(88, 26, -40, 0.06, 10, 0.06, MAT.dark, 1, { decor: true }); container(88, 23.5, -40, true, MAT.ctrOrange);
  container(66, 0, -14, true, MAT.ctrBlue); container(82, 0, -14, true, MAT.ctrGreen);
  for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(0.5, 0.5, 6, 16)), MAT.hallMetal); p.rotation.z = Math.PI / 2; p.position.set(74, 0.5 + (i > 2 ? 0.9 : 0), -18 + (i % 3) * 1.05); p.castShadow = true; scene.add(p); }
  collider(74, 0, -17, 6, 1.4, 3.2);
  addRamp(62, -24, 0, 5, P_TABLE(4, 3, 5, 1.6), MAT.dirt, 3);

  /* --- O-Süd: Fischmarkt-Halle --- */
  const HX0 = 62, HX1 = 96, HZ0 = 12, HZ1 = 42, HH = 8, T = 0.4;
  wallRun('x', HX0, HX1, HZ0 + T / 2, 0, HH, T, MAT.hallMetal, [[70, 76, 0, 5], [84, 90, 0, 5]]);
  wallRun('x', HX0, HX1, HZ1 - T / 2, 0, HH, T, MAT.hallMetal, [[76, 82, 0, 5]]);
  wallRun('z', HZ0 + T, HZ1 - T, HX0 + T / 2, 0, HH, T, MAT.hallMetal, [[20, 26, 0, 5], [30, 34, 0, 5]]);
  wallRun('z', HZ0 + T, HZ1 - T, HX1 - T / 2, 0, HH, T, MAT.hallMetal, [[24, 30, 0, 5]]);
  addBox((HX0 + HX1) / 2, HH, (HZ0 + HZ1) / 2, HX1 - HX0 + 0.4, 0.3, HZ1 - HZ0 + 0.4, MAT.hallMetal, 2.6);
  decalT((HX0 + HX1) / 2, (HZ0 + HZ1) / 2, HX1 - HX0 - 0.8, HZ1 - HZ0 - 0.8, MAT.concreteFloor, 2.7, 0, 0.013);
  tkSign(61.75, 6.3, 27, 10, 2, -Math.PI / 2, tkSignMat('魚市場', '#ffffff', '#1b3a6d', false));
  for (const z of [18, 24, 30, 36]) for (const x of [70, 82]) { addBox(x, 0, z, 7, 0.9, 1.6, MAT.crate, 0); if (srand() < 0.7) crate(x + srnd(-2.5, 2.5), 0.9, z, 0.7); }
  for (const [x, z] of [[90, 16], [91.2, 17.1], [66, 39], [92, 38]]) crate(x, 0, z, 1.1);

  /* --- SW: Kirschblüten-Park mit Teich und roter Brücke --- */
  decalT(-78.5, 78.5, 42, 42, MAT.grass, 2, 0, 0.011);
  decalT(-78.5, 78.5, 3, 42, MAT.concreteFloor, 2.7, 0, 0.013); decalT(-78.5, 66, 42, 3, MAT.concreteFloor, 2.7, 0, 0.013);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(9, 32), TKM.water); pond.rotation.x = -Math.PI / 2; pond.position.set(-86, 0.03, 86); pond.userData.noMerge = true; scene.add(pond);
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; addBox(-86 + Math.cos(a) * 9.3, 0, 86 + Math.sin(a) * 9.3, 1.2, 0.35, 1.2, TKM.stone, 1, { decor: true, round: 0.15 }); }
  addBox(-86, 0, 86, 22, 0.5, 2.6, TKM.red, 2);
  for (const sz of [-1, 1]) addBox(-86, 0.5, 86 + sz * 1.2, 22, 0.8, 0.12, TKM.red, 0, { decor: true });
  for (const [x, z, s] of [[-96, 62, 1], [-62, 62, 1.1], [-70, 72, 0.9], [-96, 72, 1], [-62, 92, 1], [-70, 96, 0.9], [-75, 85, 0.8], [-88, 72, 0.9], [-66, 80, 1], [-96, 96, 1]]) tkSakura(x, z, s);
  for (const [x, z] of [[-81.5, 62], [-75.5, 62], [-81.5, 72], [-75.5, 72]]) tkStoneLantern(x, z);
  bench(-70, 66, true); bench(-87, 66, true); bench(-78.5, 92, false);
  house(-64, 96, 8, 6, 3.2, TKM.wood);

  /* --- S: Moto-Park mit Schanzen --- */
  decalT(-27, 78.5, 40, 42, MAT.dirt, 4.5, 0, 0.012);
  addRamp(-40, 64, Math.PI / 2, 4, P_KICK(6, 2.0), MAT.rampWood);
  addRamp(-40, 82, Math.PI / 2, 5, P_TABLE(3, 0.8, 10, 2.0), MAT.dirt, 3);
  for (const [x, z] of [[-40.5, 73], [-39, 74.5], [-41, 76], [-39.5, 77.5], [-40.5, 79]]) barrel(x, z, [MAT.ctrRed, MAT.ctrBlue, MAT.ctrOrange][Math.floor(z) % 3]);
  addRamp(-24, 61, Math.PI / 2, 7, P_TABLE(5, 6, 7, 1.8), MAT.dirt, 3);
  for (let i = 0; i < 9; i++) addRamp(-12, 60 + i * 3.2, Math.PI / 2, 5, P_BUMP(3.2, 0.45), MAT.dirt, 3);
  addRamp(-24, 86, Math.PI / 2, 3, P_KICK(3, 0.8), MAT.rampWood);
  const hay = new THREE.MeshStandardMaterial({ color: 0xc9a54e, roughness: 1, bumpMap: TEX.blades, bumpScale: 0.02 });
  const bale = (x, z) => { const m = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 16)), hay); m.rotation.set(Math.PI / 2, 0, 0); m.position.set(x, 0.6, z); m.castShadow = m.receiveShadow = true; scene.add(m); collider(x, 0, z, 1.2, 1.2, 1.2); };
  for (let z = 64; z <= 96; z += 8) bale(-31.5, z);
  for (const x of [-44, -18]) bale(x, 98);
  tkSign(-27, 5.6, 57.6, 12, 1.6, Math.PI, tkSignMat('MOTO PARK', '#c0262b', '#ffffff', false));
  for (const x of [-33.5, -20.5]) addBox(x, 0, 57.6, 0.3, 6.4, 0.3, MAT.metal, 1);

  /* --- S-Ost: Türme, Platz mit Brunnen, Karaoke-Haus (begehbar) --- */
  tkTower(18, 88, 16, 16, 64, TKM.glassBlue);
  tkTower(38, 72, 14, 14, 40, TKM.tile);
  const KB = building(38, 92, 14, 10, 3, MAT.plaster, { n: [0] }, { crates: 1 });
  tkVSign(31.0, 6, 86.9, Math.PI, 5); tkVSign(45.0, 6, 86.9, Math.PI, 5);
  tkSign(38, KB.roofY + 2.2, 92, 10, 2.5, Math.PI, tkSignMat('カラオケ', '#ff3b7a', '#ffffff', false));
  const basin = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(3, 3.1, 0.7, 28, 1, true)), MAT.concrete); basin.position.set(18, 0.35, 68); scene.add(basin);
  const wdisk = new THREE.Mesh(new THREE.CircleGeometry(2.9, 28), TKM.water); wdisk.rotation.x = -Math.PI / 2; wdisk.position.set(18, 0.5, 68); scene.add(wdisk);
  collider(18, 0, 68, 5.2, 0.7, 5.2); addBox(18, 0.7, 68, 0.6, 1.6, 0.6, MAT.concrete, 2);
  tkPlanter(10, 62, 1.2, 5); tkPlanter(26, 62, 1.2, 5); bench(18, 75, true);

  /* --- SO: Containerhafen mit Kran am Kai --- */
  decalT(78.5, 78.5, 42, 42, MAT.concreteFloor, 2.7, 0, 0.012);
  const ctrMats = [MAT.ctrRed, MAT.ctrBlue, MAT.ctrGreen, MAT.ctrOrange];
  const forced = { '62,62': 1, '74,76': 2, '86,90': 1 };
  for (const z of [62, 69, 76, 83, 90]) for (const x of [62, 74, 86]) {
    let h = forced[x + ',' + z];
    if (h === undefined) { const r = srand(); h = r < 0.25 ? 0 : r < 0.6 ? 1 : r < 0.88 ? 2 : 3; }
    for (let k = 0; k < h; k++) container(x, k * 2.6, z, true, ctrMats[Math.floor(srand() * 4)]);
  }
  for (const [x, z] of [[62, 62], [74, 76], [86, 90]]) for (let i = 0; i < 3; i++) addBox(x - 1.1 + i * 1.1, 0, z + 2.0, 1.1, 0.8 * (i + 1), 1.0, MAT.crate, 0);
  for (const [x, z] of [[93, 68], [99, 68], [93, 86], [99, 86]]) addBox(x, 0, z, 1.2, 22, 1.2, MAT.yellow, 2);
  addBox(96, 22, 68, 8, 1.4, 1.4, MAT.yellow, 2, { decor: true }); addBox(96, 22, 86, 8, 1.4, 1.4, MAT.yellow, 2, { decor: true });
  addBox(93, 23.4, 77, 1.2, 1.2, 20, MAT.yellow, 2, { decor: true }); addBox(99, 23.4, 77, 1.2, 1.2, 20, MAT.yellow, 2, { decor: true });
  addBox(118, 24.6, 77, 46, 1.2, 2.2, MAT.yellow, 2, { decor: true });

  /* --- Mopeds überall --- */
  for (const [x, z, ax] of [[4, -20, false], [-4, 35, false], [20, 4.5, true], [-35, -4.5, true], [54.5, -25, false], [-49.5, 20, false], [30, 49.5, true], [-20, -48.5, true],
    [-70, -30, true], [-70, -25, true], [-66, -14, false], [-20, 30, true], [-12, 24, false], [-33, 60, true], [-16, 96, true], [-70, -60, true], [-8, -62, false],
    [70, -60, true], [95, -60, true], [62, -28, false], [60, 20, false], [70, 96, true], [-61, 70, true], [44, -60, true], [40, -12, true], [-49.5, 70, false]]) car(x, z, ax);

  /* --- Skyline rund um die Stadt (nur Kulisse) --- */
  const skyMats = [TKM.glassBlue, TKM.office, TKM.officeDark, TKM.tile, TKM.glassGreen];
  const skyBox = (x, z) => { if (srand() < 0.22) return; const w = srnd(10, 18), d = srnd(10, 18), h = srnd(18, 95) * (1 - Math.max(0, Math.hypot(x, z) - 160) / 260); addBox(x, 0, z, w, h, d, skyMats[Math.floor(srand() * 5)], 16, { decor: true, shadow: false, round: 0 }); };
  for (let a = -230; a <= 100; a += 21) for (let r = 116; r <= 220; r += 22) { skyBox(a, -r); skyBox(a, r); }
  for (let a = -94; a <= 94; a += 21) for (let r = 116; r <= 220; r += 22) skyBox(-r, a);
  // rot-weißer Funkturm und ferner Vulkanberg
  for (let i = 0; i < 9; i++) addBox(-170, i * 14, -160, 12 - i * 1.2, 14, 12 - i * 1.2, i % 2 ? TKM.white : TKM.red, 0, { decor: true, shadow: false, round: 0 });
  addBox(-170, 126, -160, 0.6, 22, 0.6, TKM.red, 0, { decor: true, shadow: false, round: 0 });
  const mtn = new THREE.MeshBasicMaterial({ color: 0x8c9db6, fog: false }), snow = new THREE.MeshBasicMaterial({ color: 0xe8eef6, fog: false });
  const fuji = new THREE.Mesh(new THREE.ConeGeometry(430, 240, 48, 1, true), mtn); fuji.position.set(-720, 80, -260); fuji.userData.noMerge = true; scene.add(fuji);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(108, 61, 48, 1, true), snow); cap.position.set(-720, 80 + 120 - 30, -260); cap.userData.noMerge = true; scene.add(cap);

  /* --- Bäume außerhalb (Wald auf den Hügeln) und Gras in den Parks --- */
  const N = 240, dummy = new THREE.Object3D();
  const farLeafMat = new THREE.MeshLambertMaterial({ map: TEX.needles, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(0.75, 0.85, 0.7) });
  const farTrunkMat = new THREE.MeshLambertMaterial({ map: TEX.bark });
  const trunks = new THREE.InstancedMesh(trunkGeo, farTrunkMat, N);
  const layers = layerGeos.map(g => new THREE.InstancedMesh(g, farLeafMat, N));
  for (let i = 0; i < N; i++) {
    let x, z; do { x = rnd(-420, 100); z = rnd(-420, 420); } while (window.mapEdge(x, z) < 70);
    const s = rnd(1.2, 2.2);
    dummy.position.set(x, window.terrainHeight(x, z) - 0.2, z); dummy.scale.set(s, s * rnd(0.9, 1.3), s); dummy.rotation.y = Math.random() * 6;
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix); for (const l of layers) l.setMatrixAt(i, dummy.matrix);
  }
  for (const l of layers) scene.add(l);
  scene.add(trunks);
  const bladeGeo = (() => {
    const g1 = new THREE.PlaneGeometry(0.7, 0.45); g1.translate(0, 0.225, 0);
    const g2 = g1.clone(); g2.rotateY(Math.PI / 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...g1.attributes.position.array, ...g2.attributes.position.array], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([...g1.attributes.uv.array, ...g2.attributes.uv.array], 2));
    const nrm = []; for (let i = 0; i < 8; i++) nrm.push(0, 1, 0);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5]); return g;
  })();
  const bladeMat = new THREE.MeshLambertMaterial({ map: TEX.blades, alphaTest: 0.5, side: THREE.DoubleSide });
  const NG = 2200, grassI = window.grassI = new THREE.InstancedMesh(bladeGeo, bladeMat, NG);
  for (let i = 0; i < NG; i++) {
    let x, z;
    do { x = rnd(-99, -58); z = rnd(58, 99); } while (Math.hypot(x + 86, z - 86) < 9.8 || Math.abs(x + 78.5) < 2 || Math.abs(z - 66) < 2);
    const s = rnd(0.7, 1.4);
    dummy.position.set(x, 0.01, z); dummy.scale.set(s, s, s); dummy.rotation.set(0, Math.random() * 6, 0);
    dummy.updateMatrix(); grassI.setMatrixAt(i, dummy.matrix);
  }
  scene.add(grassI);

  /* --- Waffen zum Aufsammeln (Position + Höhe) --- */
  MAP_PICKUPS.push(
    { w: 2, x: 30, y: DS.roofY, z: -28 }, { w: 2, x: 84, y: 9.6, z: -30 }, { w: 2, x: 38, y: KB.roofY, z: 92 }, { w: 2, x: -38, y: HY, z: -52 }, { w: 2, x: 74, y: 5.2, z: 76 },
    { w: 0, x: 0, y: 0, z: -20 }, { w: 0, x: -26, y: 0, z: -75 }, { w: 0, x: 16, y: 0, z: -78 }, { w: 0, x: -74.5, y: 0, z: 22 }, { w: 0, x: 79, y: 0, z: 27 },
    { w: 0, x: -30, y: 0, z: 70 }, { w: 0, x: 68, y: 0, z: 72 }, { w: 0, x: -12, y: 0, z: 30 }, { w: 0, x: 50, y: 0, z: 30 },
    { w: 1, x: -31, y: 0, z: -87 }, { w: 1, x: -82.5, y: 0, z: -40 }, { w: 1, x: 16, y: 3.2, z: 20 }, { w: 1, x: -36, y: 0, z: 38 }, { w: 1, x: 92, y: 1, z: -90 },
    { w: 1, x: -86, y: 0.5, z: 86 }, { w: 1, x: 62, y: 0, z: -34 }, { w: 1, x: -78.5, y: 0, z: -66 },
  );
}

/* ======================= Alte Karte „Hafenviertel“ (mit Simson-Crosspark im Süden) ======================= */
function buildHafenMap() {
  const WALL_H = 6;
  /* --- Außengrenzen: Mauern im Norden, Westen, Süden; Kaimauer im Osten --- */
  addBox(-3, 0, -61, 118, WALL_H, 1, MAT.concrete, 3);
  // Südmauer mit drei Toren zum Crosspark
  const GATES = [[-48, -40], [-14, -6], [22, 32]];
  wallRun('x', -62, 56, 61, 0, WALL_H, 1, MAT.concrete, GATES.map(([a, b]) => [a, b, 0, WALL_H]));
  addBox(-61, 0, 0, 1, WALL_H, 122, MAT.concrete, 3);
  for (let i = -60; i <= 54; i += 10) for (const z of [-60.3, 60.3]) {
    if (z > 0 && GATES.some(([a, b]) => i > a - 1 && i < b + 1)) continue;
    addBox(i, 0, z, 1.1, WALL_H + 0.4, 1.1, MAT.concrete, 2, { decor: true });
  }
  for (const [a, b] of GATES) for (const x of [a - 0.6, b + 0.6]) addBox(x, 0, 61, 1.3, WALL_H + 0.8, 1.4, MAT.concrete, 2);
  for (let i = -60; i <= 60; i += 10) addBox(-60.3, 0, i, 1.1, WALL_H + 0.4, 1.1, MAT.concrete, 2, { decor: true });
  // Kai: Kante, Poller, Geländer + unsichtbare Sperre
  addBox(55.4, -2.2, 0, 0.8, 2.45, 122, MAT.concrete, 2, { decor: true });
  for (let z = -56; z <= 56; z += 8) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 12), MAT.dark); b.position.set(54.6, 0.35, z); b.castShadow = true; scene.add(b);
    collider(54.6, 0, z, 0.5, 0.7, 0.5);
  }
  for (let z = -60; z < 60; z += 2.5) addBox(55.6, 0.25, z, 0.06, 1.0, 0.06, MAT.yellow, 1, { decor: true });
  addBox(55.6, 1.2, 0, 0.06, 0.06, 120, MAT.yellow, 1, { decor: true });
  collider(56, 0, 0, 1, 12, 122);
  // Wasser
  const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 1600), new THREE.MeshStandardMaterial({ color: 0x1b3c48, roughness: 0.08, metalness: 0.2, normalMap: waterNormal, envMapIntensity: 1.3 }));
  water.normalMap = waterNormal; water.material.normalScale.set(0.5, 0.5);
  water.rotation.x = -Math.PI / 2; water.position.set(55 + 350, -0.9, 0); water.userData.noMerge = true; scene.add(water);
  // Frachtschiff draußen im Wasser (nur Kulisse)
  const hull = new THREE.MeshStandardMaterial({ color: 0x3a1a16, roughness: 0.6, metalness: 0.3 });
  const deck = new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.7 });
  addBox(92, -3, -5, 18, 9, 90, hull, 3, { decor: true, shadow: false });
  addBox(92, 6, -5, 17, 0.3, 88, deck, 3, { decor: true, shadow: false });
  addBox(92, 6.3, 32, 14, 9, 10, MAT.plaster2, 2.7, { decor: true, shadow: false });
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) for (let h = 0; h < 1 + ((r * 7 + c * 3) % 3); h++) {
    const mats = [MAT.ctrRed, MAT.ctrBlue, MAT.ctrGreen, MAT.ctrOrange];
    addBox(86.5 + c * 3.6, 6.3 + h * 2.6, -42 + r * 13, 2.44, 2.6, 12.2, mats[(r + c + h) % 4], 2.6, { decor: true, shadow: false });
  }

  /* --- Straßen: Hauptstraße (z=0) und Querstraße (x=-10) --- */
  const white = new THREE.MeshStandardMaterial({ color: 0xd8d6cc, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
  const yel = new THREE.MeshStandardMaterial({ color: 0xc8a232, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
  for (let x = -58; x < 52; x += 4) if (Math.abs(x + 10) > 7) decalT(x, 0, 2.2, 0.16, white, 0, 0, 0.014);
  for (let z = -58; z < 58; z += 4) if (Math.abs(z) > 7) decalT(-10, z, 0.16, 2.2, white, 0, 0, 0.014);
  for (let i = -3; i <= 3; i++) { decalT(-18, i * 1.1, 2.6, 0.55, white, 0, 0, 0.014); decalT(-2, i * 1.1, 2.6, 0.55, white, 0, 0, 0.014); }
  // Gehwege (Beton) entlang der Straßen
  decalT(-3, -6.5, 116, 3, MAT.concreteFloor, 2.7, 0, 0.008); decalT(-3, 6.5, 116, 3, MAT.concreteFloor, 2.7, 0, 0.008);
  decalT(-15.5, -33.5, 3, 53, MAT.concreteFloor, 2.7, 0, 0.009); decalT(-4.5, -33.5, 3, 53, MAT.concreteFloor, 2.7, 0, 0.009);
  decalT(-15.5, 33.5, 3, 53, MAT.concreteFloor, 2.7, 0, 0.009); decalT(-4.5, 33.5, 3, 53, MAT.concreteFloor, 2.7, 0, 0.009);
  // Laternen
  for (let x = -52; x <= 48; x += 16) { lamp(x, -7.6, 1); lamp(x + 8, 7.6, -1); }
  // Kreisverkehr mit Denkmal
  const isl = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(4.2, 4.3, 0.3, 32)), MAT.concrete); isl.position.set(-10, 0.15, 0); isl.receiveShadow = true; scene.add(isl);
  const islG = new THREE.Mesh(withUv2(new THREE.CircleGeometry(3.9, 32)), MAT.grass); islG.rotation.x = -Math.PI / 2; islG.position.set(-10, 0.31, 0); scene.add(islG);
  collider(-10, 0, 0, 6, 0.3, 6);
  addBox(-10, 0, 0, 2.2, 2.4, 2.2, MAT.concrete, 2);
  addBox(-10, 2.4, 0, 1.6, 0.3, 1.6, MAT.concrete, 2);
  // Bronzestatue (Soldat mit Fahne)
  addBox(-10, 2.7, 0, 0.55, 0.9, 0.35, BRONZE, 0, { decor: true }); addBox(-10, 3.6, 0, 0.7, 0.8, 0.4, BRONZE, 0, { decor: true });
  addBox(-10, 4.4, 0, 0.3, 0.32, 0.3, BRONZE, 0, { decor: true }); addBox(-9.6, 3.4, 0, 0.08, 3.2, 0.08, BRONZE, 0, { decor: true });
  addBox(-9.0, 5.6, 0, 1.1, 0.7, 0.04, BRONZE, 0, { decor: true });
  collider(-10, 2.4, 0, 1.2, 2.5, 1.2);
  // Deckung auf der Hauptstraße
  car(-44, -2.6, true); car(-28, 2.6, true); car(10, -2.6, true); car(24, 2.4, true); car(-50, 2.5, true);
  // Ausgebrannter Bus
  const burnt = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9, metalness: 0.4 });
  addBox(38, 0.3, -1.2, 11, 2.7, 2.6, burnt, 0); collider(38, 0, -1.2, 11, 0.3, 2.6);
  for (let i = 0; i < 5; i++) addBox(34 + i * 2.1, 1.6, 0.11, 1.5, 0.9, 0.05, CAR_GLASS, 0, { decor: true });
  jersey(-36, 0, false); jersey(2, -2, true); jersey(18, 3, true); jersey(46, 2, false);
  sandbags(-20, 3.6, 3, true); sandbags(5, 2.2, 3, true); sandbags(28, -3.4, 3, true);
  // Bushaltestelle
  addBox(-30, 0, -7.4, 4, 0.08, 1.4, MAT.dark, 1, { decor: true });
  for (const o of [-1.9, 1.9]) addBox(-30 + o, 0, -7.9, 0.1, 2.6, 0.1, MAT.metal, 1);
  addBox(-30, 2.6, -7.4, 4.2, 0.1, 1.6, MAT.dark, 1, { decor: true });
  addBox(-30, 0.5, -8.0, 3.8, 1.9, 0.05, MAT.window, 0, { decor: true }); collider(-30, 0, -8.0, 3.8, 2.4, 0.1);
  bench(-30, -7.6, true);

  /* --- NORDWEST: Altstadt mit begehbaren Häusern --- */
  const B1 = building(-46, -46, 16, 12, 3, MAT.plaster, { e: [2], s: [3] });
  const B2 = building(-24, -50, 12, 10, 2, MAT.brick, { s: [1], w: [1.5] });
  const B3 = building(-46, -22, 12, 12, 2, MAT.plaster2, { e: [-2], n: [2] });
  // Ruine: zerbrochene Mauern ohne Dach
  const ru = MAT.brick;
  addBox(-27, 0, -29, 10, 3.4, 0.4, ru, 2.5); addBox(-31.5, 3.4, -29, 1.0, 1.2, 0.4, ru, 2.5);
  addBox(-32, 0, -24, 0.4, 2.6, 10, ru, 2.5); addBox(-22, 0, -21.5, 0.4, 1.6, 5, ru, 2.5);
  addBox(-25, 0, -19.2, 4, 2.2, 0.4, ru, 2.5);
  for (let i = 0; i < 9; i++) addBox(srnd(-31, -23), 0, srnd(-28, -20), srnd(0.4, 1.2), srnd(0.2, 0.6), srnd(0.4, 1.2), MAT.concrete, 2);
  // Gassen-Details
  dumpster(-36, -46, false); dumpster(-36, -42.5, false); barrel(-34.8, -50, MAT.ctrRed); barrel(-34.5, -51, MAT.ctrGreen);
  crate(-33, 0, -34, 1.2); crate(-32, 0, -35.3, 1); car(-21.5, -38, true); car(-40, -31.5, true, carPaints[2]);
  dumpster(-55, -32, true); jersey(-27, -12, true); sandbags(-38, -12, 3, true);
  car(-12.2, -24, false); car(-7.8, -42, false, carPaints[1]); car(-12.2, -54, false);

  /* --- SÜDWEST: Park und Wohnhäuser --- */
  house(-48, 22, 9, 7, 3.6); house(-48, 44, 9, 7, 3.6); house(-28, 53, 9, 7, 3.6);
  decalT(-31, 27, 22, 26, MAT.grass, 2, 0, 0.008);
  // Wege im Park
  decalT(-31, 27, 2, 26, MAT.concreteFloor, 2.7, 0, 0.011); decalT(-31, 27, 22, 2, MAT.concreteFloor, 2.7, 0, 0.011);
  // Brunnen in der Mitte
  const basin = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(3, 3.1, 0.7, 28, 1, true)), MAT.concrete); basin.position.set(-31, 0.35, 27); scene.add(basin);
  const wdisk = new THREE.Mesh(new THREE.CircleGeometry(2.9, 28), new THREE.MeshStandardMaterial({ color: 0x1e4652, roughness: 0.05, metalness: 0.3, normalMap: waterNormal }));
  wdisk.rotation.x = -Math.PI / 2; wdisk.position.set(-31, 0.5, 27); scene.add(wdisk);
  collider(-31, 0, 27, 5.2, 0.7, 5.2);
  addBox(-31, 0.7, 27, 0.6, 1.6, 0.6, MAT.concrete, 2);
  for (const [x, z, s] of [[-40, 17, 1.0], [-22, 18, 1.1], [-40, 36, 0.9], [-23, 37, 1.0], [-36, 22, 0.8], [-26, 31, 0.85], [-44, 30, 1.0], [-18, 26, 0.9]]) leafTree(x, z, s);
  hedge(-36, 14.5, 8, 1); hedge(-24, 39.5, 8, 1); hedge(-42.5, 27, 1, 6); hedge(-19.5, 31, 1, 6);
  bench(-31, 21.5, true); bench(-31, 32.5, true); bench(-25.5, 27, false); bench(-36.5, 27, false);
  watchtower(-56, 32, 1);
  for (const [x, z] of [[-58, 52], [-55, 58], [-20, 58], [-14, 46], [-58, 14]]) tree(x, z, srnd(0.7, 0.9));
  car(-7.8, 22, false); car(-12.2, 40, false, carPaints[4]); jersey(-40, 50, true); sandbags(-52, 36, 3, false);

  /* --- NORDOST: Containerhafen --- */
  decalT(25, -33.5, 60, 53, MAT.concreteFloor, 2.7, 0, 0.007);
  const ctrMats = [MAT.ctrRed, MAT.ctrBlue, MAT.ctrGreen, MAT.ctrOrange];
  const cols = [2.5, 8.7, 18.5, 24.7, 34.5, 40.7], rows = [-14, -21, -28, -35, -42, -49, -56];
  const forced = { '2.5,-14': 1, '24.7,-35': 1, '40.7,-49': 1, '8.7,-28': 2, '34.5,-21': 3 };
  for (const z of rows) for (const x of cols) {
    const key = x + ',' + z;
    let h = forced[key];
    if (h === undefined) { const r = srand(); h = r < 0.22 ? 0 : r < 0.6 ? 1 : r < 0.88 ? 2 : 3; }
    for (let k = 0; k < h; k++) container(x, k * 2.6, z, true, ctrMats[Math.floor(srand() * 4)]);
  }
  // Kisten-Treppen auf einige Container
  for (const [x, z] of [[2.5, -14], [24.7, -35], [40.7, -49]]) for (let i = 0; i < 3; i++) addBox(x - 1.1 + i * 1.1, 0, z + 2.0, 1.1, 0.8 * (i + 1), 1.0, MAT.crate, 0);
  // Hafenkran über dem Kai
  const yellow = MAT.yellow;
  for (const [x, z] of [[47, -45], [53, -45], [47, -25], [53, -25]]) addBox(x, 0, z, 1.2, 20, 1.2, yellow, 2);
  addBox(50, 20, -45, 8, 1.4, 1.4, yellow, 2, { decor: true }); addBox(50, 20, -25, 8, 1.4, 1.4, yellow, 2, { decor: true });
  addBox(47, 21.4, -35, 1.2, 1.2, 22, yellow, 2, { decor: true }); addBox(53, 21.4, -35, 1.2, 1.2, 22, yellow, 2, { decor: true });
  addBox(70, 22.6, -35, 50, 1.2, 2.2, yellow, 2, { decor: true });
  addBox(52, 16.5, -35, 3, 3, 3, MAT.plaster2, 2.7, { decor: true });
  addBox(68, 15.5, -35, 0.08, 7, 0.08, MAT.dark, 1, { decor: true }); addBox(68, 13.5, -35, 6.1, 2.6, 2.44, MAT.ctrOrange, 2.6, { decor: true });
  // Hafenbüro (Container mit Treppe) + Kisten
  container(50, 0, -55, true, MAT.ctrBlue);
  for (let i = 0; i < 3; i++) addBox(47.8 + i * 1.1, 0, -52.7, 1.1, 0.8 * (i + 1), 1.0, MAT.crate, 0);
  crate(46, 0, -18, 1.3); crate(47.2, 0, -17.6, 1.1); barrel(50, -15, MAT.ctrRed); barrel(50.7, -15.6, MAT.ctrBlue);
  jersey(15, -9.5, true); jersey(30, -9.5, true);

  /* --- SÜDOST: Lagerhalle, LKWs, Parkplatz, Tanks --- */
  const HX0 = 9, HX1 = 43, HZ0 = 25, HZ1 = 47, HH = 9, T = 0.4;
  wallRun('x', HX0, HX1, HZ0 + T / 2, 0, HH, T, MAT.hallMetal, [[15.5, 21, 0, 5], [31, 36.5, 0, 5], [24, 28, 6.2, 7.8], [38, 41, 6.2, 7.8], [11, 13.5, 6.2, 7.8]]);
  wallRun('x', HX0, HX1, HZ1 - T / 2, 0, HH, T, MAT.hallMetal, [[14, 17, 6.2, 7.8], [24, 27, 6.2, 7.8], [34, 37, 6.2, 7.8]]);
  wallRun('z', HZ0 + T, HZ1 - T, HX0 + T / 2, 0, HH, T, MAT.hallMetal, [[33.5, 36, 0, 2.6]]);
  wallRun('z', HZ0 + T, HZ1 - T, HX1 - T / 2, 0, HH, T, MAT.hallMetal, [[37.5, 42.5, 0, 5]]);
  addBox((HX0 + HX1) / 2, HH, (HZ0 + HZ1) / 2, HX1 - HX0 + 0.4, 0.3, HZ1 - HZ0 + 0.4, MAT.hallMetal, 2.6);
  decalT((HX0 + HX1) / 2, (HZ0 + HZ1) / 2, HX1 - HX0 - 0.8, HZ1 - HZ0 - 0.8, MAT.concreteFloor, 2.7, 0, 0.01);
  // Laufsteg an der Südwand (Höhe 4,5 m) mit Treppe
  const CW = 4.5;
  addBox(26, CW - 0.2, 45.5, 32, 0.2, 2.2, MAT.metal, 1.5);
  for (let x = 11; x <= 41; x += 6) addBox(x, 0, 45.5, 0.2, CW - 0.2, 0.2, MAT.metal, 1);
  for (let i = 0; i < 7; i++) addBox(10.4 + i * 0.9 + 0.45, 0, 43.6, 0.9, (i + 1) * 0.643, 1.4, MAT.metal, 1.5);
  addBox(29.6, CW, 44.38, 24.8, 1.0, 0.06, MAT.metal, 1);   // Geländer (Treppenende frei)
  // Regale mit Kisten (Deckung, man kann durchschießen)
  for (const z of [31, 36.5]) for (const [xa, xb] of [[13, 21], [27, 37]]) {
    const xc = (xa + xb) / 2, L = xb - xa;
    for (const y of [0, 1.5, 3.0]) addBox(xc, y, z, L, 0.1, 1.2, MAT.metal, 1.5);
    for (const x of [xa, xb]) for (const o of [-0.55, 0.55]) addBox(x, 0, z + o, 0.1, 3.5, 0.1, MAT.metal, 1);
    for (let i = 0; i < 4; i++) for (const y of [0.1, 1.6]) if (srand() < 0.75) crate(xa + 1 + i * 2, y, z, srnd(0.9, 1.1));
  }
  // Gabelstapler
  addBox(22, 0.2, 41, 1.3, 1.2, 2.2, MAT.yellow, 1); addBox(22, 1.4, 41.4, 1.1, 1.0, 1.0, CAR_GLASS, 0, { decor: true });
  addBox(22, 0, 39.6, 1.0, 2.6, 0.12, MAT.dark, 1);
  // Draußen: LKWs an der Rampe, Parkplatz, Tanks
  truck(18.2, 16.5, true); truck(33.7, 15, true);
  jersey(26, 18, false); sandbags(12, 20, 3, true); crate(40, 0, 20, 1.2); crate(41.2, 0, 21, 1);
  for (let z = 12; z <= 40; z += 4) decalT(50, z - 2, 8, 0.12, white, 0, 0, 0.014);
  car(49.5, 12, true); car(49.5, 20, true, carPaints[3]); car(49.5, 28, true); car(49.5, 36, true, carPaints[6]);
  for (const z of [50.5, 56.5]) {
    const tank = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(2.2, 2.2, 6, 24)), MAT.hallMetal); tank.position.set(49.5, 3, z); tank.castShadow = true; scene.add(tank);
    collider(49.5, 0, z, 4.2, 6, 4.2);
  }
  dumpster(14, 54, true); dumpster(17, 54, true); jersey(30, 52, true); crate(36, 0, 55, 1.3);
  // Beton-Gebäude und Werkstatt zwischen Straße und Halle
  const B4 = building(2.5, 24, 10, 12, 2, MAT.concrete, { w: [2], s: [2] });
  building(2, 47, 10, 10, 1, MAT.brick, { n: [0], w: [2] }, { crates: 3 });
  // Kiosk an der Straße
  addBox(2, 0, 11, 3.5, 2.6, 2.5, MAT.plaster2, 2.7); addBox(2, 2.6, 11, 4, 0.15, 3, MAT.ctrRed, 2.6, { decor: true });
  car(-7.8, 52, false, carPaints[0]);

  /* --- Schanzen in der Stadt (Querstraße) --- */
  MAT.rampWood = pbr('wood', 2, { mat: { color: new THREE.Color(1.35, 1.2, 1.0) } });
  MAT.dirt = pbr('asphalt', 3, { map: tintedTex('asphalt', 0x6e5034), mat: { color: new THREE.Color(0.68, 0.6, 0.52) }, normalScale: 1.6 });
  addRamp(-10, -14, -Math.PI / 2, 3, P_KICK(4, 1.1), MAT.rampWood);
  addRamp(-10, 27, Math.PI / 2, 3, P_KICK(4, 1.1), MAT.rampWood);

  /* --- SÜDEN: Simson-Crosspark (z 62 … 131) mit Schanzen --- */
  decalT(-3.5, 96.5, 115, 69, MAT.dirt, 4.5, 0, 0.004);
  addBox(-3.5, 0, 131, 116, WALL_H, 1, MAT.concrete, 3);
  addBox(-61, 0, 96, 1, WALL_H, 70, MAT.concrete, 3);
  addBox(54.5, 0, 96, 1, WALL_H, 70, MAT.concrete, 3);
  for (let i = -60; i <= 54; i += 10) addBox(i, 0, 130.3, 1.1, WALL_H + 0.4, 1.1, MAT.concrete, 2, { decor: true });
  for (let z = 70; z <= 130; z += 10) { addBox(-60.3, 0, z, 1.1, WALL_H + 0.4, 1.1, MAT.concrete, 2, { decor: true }); addBox(53.8, 0, z, 1.1, WALL_H + 0.4, 1.1, MAT.concrete, 2, { decor: true }); }
  // Zufahrt: Betonpiste mit Schanze, Tor mit Banner
  decalT(-10, 78, 8, 32, MAT.concreteFloor, 2.7, 0, 0.012);
  for (let z = 64; z < 94; z += 4) decalT(-10, z, 0.16, 2.2, white, 0, 0, 0.014);
  addRamp(-10, 71, Math.PI / 2, 3.5, P_KICK(5, 1.4), MAT.rampWood);
  for (const x of [-15.5, -4.5]) addBox(x, 0, 64, 0.3, 5.2, 0.3, MAT.metal, 1);
  const bc = document.createElement('canvas'); bc.width = 1024; bc.height = 128;
  const bg = bc.getContext('2d'); bg.fillStyle = '#c0262b'; bg.fillRect(0, 0, 1024, 128);
  bg.fillStyle = '#fff'; bg.font = 'italic 900 84px Arial'; bg.textAlign = 'center'; bg.textBaseline = 'middle'; bg.fillText('SIMSON  CROSSPARK', 512, 68);
  const btex = new THREE.CanvasTexture(bc); btex.encoding = THREE.sRGBEncoding; btex.anisotropy = MAX_ANISO;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(11, 1.2, 0.08), new THREE.MeshStandardMaterial({ map: btex, roughness: 0.7 }));
  banner.position.set(-10, 4.5, 64); scene.add(banner);
  // Tabletop (Erdhügel) und Buckelpiste
  addRamp(-40, 74, Math.PI / 2, 7, P_TABLE(5, 6, 7, 1.8), MAT.dirt, 3);
  for (let i = 0; i < 9; i++) addRamp(-52, 70 + i * 3.2, Math.PI / 2, 5, P_BUMP(3.2, 0.45), MAT.dirt, 3);
  // Lückensprung über Fässer
  addRamp(5, 105, 0, 4, P_KICK(7, 2.2), MAT.rampWood);
  addRamp(21, 105, 0, 5, P_TABLE(3, 0.8, 12, 2.2), MAT.dirt, 3);
  for (const [x, z] of [[14.5, 104], [16, 105.6], [17.5, 104.2], [19, 105.8], [20.5, 104.5], [15.5, 106.4]]) barrel(x, z, [MAT.ctrRed, MAT.ctrBlue, MAT.ctrOrange][Math.floor(x) % 3]);
  // Mega-Schanze mit Landehügel
  addRamp(-21, 121, 0, 6, P_KICK(10, 3.2), MAT.rampWood);
  addRamp(-1, 121, 0, 7, P_TABLE(3.5, 1.5, 16, 3.2), MAT.dirt, 3);
  // kleine Kicker
  addRamp(22, 76, 0, 3, P_KICK(3, 0.8), MAT.rampWood);
  addRamp(45, 113, -Math.PI / 2, 3, P_KICK(4, 1.2), MAT.rampWood);
  addRamp(-30, 98, 0, 3, P_KICK(3.5, 0.9), MAT.rampWood);
  // Strohballen, Reifenstapel, Fahnen
  const hay = new THREE.MeshStandardMaterial({ color: 0xc9a54e, roughness: 1, bumpMap: TEX.blades, bumpScale: 0.02 });
  const tireM = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const bale = (x, z, rot) => { const m = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 16)), hay); m.rotation.set(Math.PI / 2, rot, 0); m.position.set(x, 0.6, z); m.castShadow = m.receiveShadow = true; scene.add(m); collider(x, 0, z, 1.2, 1.2, 1.2); };
  const tires = (x, z, n) => { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.14, 8, 18), tireM); m.rotation.x = Math.PI / 2; m.position.set(x, 0.14 + i * 0.27, z); m.castShadow = true; scene.add(m); } collider(x, 0, z, 1, n * 0.27 + 0.05, 1); };
  for (let x = -34; x <= 36; x += 6) if (x < -25 || x > -4) bale(x, 113, Math.PI / 2);
  for (let z = 68; z <= 100; z += 8) bale(-46, z, 0);
  for (const [x, z, n] of [[-57, 66, 3], [-57, 126, 4], [50, 66, 3], [50, 126, 3], [-24, 66, 2], [3, 66, 3], [38, 92, 4], [-35, 106, 3], [26, 96, 2], [-58, 104, 3]]) tires(x, z, n);
  const flagMats = [MAT.ctrRed, MAT.yellow, MAT.ctrBlue];
  for (const [x, z] of [[4.5, 103], [4.5, 107], [-21.5, 118], [-21.5, 124], [-44.2, 74], [-35.8, 74]]) {
    addBox(x, 0, z, 0.06, 3.2, 0.06, MAT.metal, 1, { decor: true });
    addBox(x + 0.45, 2.6, z, 0.9, 0.55, 0.03, flagMats[Math.abs(Math.round(x + z)) % 3], 0, { decor: true, round: 0 });
  }
  // Tribüne an der Südmauer (Stufen = erhöhte Schussposition)
  for (let i = 0; i < 4; i++) addBox(-45, 0, 129.9 - i * 1.1, 18, 0.55 * (4 - i), 1.1, MAT.concrete, 2);
  addBox(-45, 5.4, 128.6, 19, 0.15, 4.2, MAT.hallMetal, 2.6, { decor: true });
  for (const x of [-53.5, -45, -36.5]) addBox(x, 2.2, 127, 0.15, 3.2, 0.15, MAT.metal, 1, { decor: true });
  // Deckung: Container, Sandsäcke, Werkstatt
  container(-25, 0, 84, false, MAT.ctrOrange); container(35, 0, 70, true, MAT.ctrBlue); container(35, 2.6, 70, true, MAT.ctrRed);
  container(46, 0, 88, false, MAT.ctrGreen);
  for (let i = 0; i < 3; i++) addBox(33.4 + i * 1.1, 0, 72.2, 1.1, 0.8 * (i + 1), 1.0, MAT.crate, 0);
  sandbags(8, 88, 3, true); sandbags(-30, 110, 3, false); sandbags(30, 124, 3, true); sandbags(-4, 98, 3, false);
  building(18, 88, 8, 6, 1, MAT.brick, { n: [0], s: [1] });
  for (const z of [80, 96]) lamp(-14.6, z, 1);
  // Mopeds im Crosspark
  car(-6.5, 66, false); car(-13.5, 67.5, false); car(-50, 120, true); car(0, 109, true); car(30, 82, true);

  /* --- Bäume außerhalb (Wald) und Gras --- */
  const N = 240, dummy = new THREE.Object3D();
  const farLeafMat = new THREE.MeshLambertMaterial({ map: TEX.needles, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(0.75, 0.85, 0.7) });
  const farTrunkMat = new THREE.MeshLambertMaterial({ map: TEX.bark });
  const trunks = new THREE.InstancedMesh(trunkGeo, farTrunkMat, N);
  const layers = layerGeos.map(g => new THREE.InstancedMesh(g, farLeafMat, N));
  for (let i = 0; i < N; i++) {
    let x, z; do { x = rnd(-240, 50); z = rnd(-240, 240); } while (window.mapEdge(x, z) < 68);
    const s = rnd(0.9, 1.8);
    dummy.position.set(x, window.terrainHeight(x, z) - 0.2, z); dummy.scale.set(s, s * rnd(0.9, 1.3), s); dummy.rotation.y = Math.random() * 6;
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix); for (const l of layers) l.setMatrixAt(i, dummy.matrix);
  }
  for (const l of layers) scene.add(l);
  scene.add(trunks);
  const bladeGeo = (() => {
    const g1 = new THREE.PlaneGeometry(0.7, 0.45); g1.translate(0, 0.225, 0);
    const g2 = g1.clone(); g2.rotateY(Math.PI / 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...g1.attributes.position.array, ...g2.attributes.position.array], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([...g1.attributes.uv.array, ...g2.attributes.uv.array], 2));
    const nrm = []; for (let i = 0; i < 8; i++) nrm.push(0, 1, 0);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5]); return g;
  })();
  const bladeMat = new THREE.MeshLambertMaterial({ map: TEX.blades, alphaTest: 0.5, side: THREE.DoubleSide });
  const NG = 2600, grassI = window.grassI = new THREE.InstancedMesh(bladeGeo, bladeMat, NG);
  for (let i = 0; i < NG; i++) {
    let x, z, y = 0.01;
    if (i < 1300) { x = rnd(-41.5, -20.5); z = rnd(14.5, 39.5); if (Math.abs(x + 31) < 1.4 || Math.abs(z - 27) < 1.4 || Math.hypot(x + 31, z - 27) < 3.3) { x = rnd(-41.5, -33); } }
    else if (i < 2000) { const side = i % 3; const t = rnd(-59, 59); [x, z] = side === 0 ? [rnd(-60, -58.5), t] : side === 1 ? [t * 0.95 - 3, rnd(-60, -58.6)] : [t * 0.95 - 3, rnd(58.6, 60)]; }
    else { do { x = rnd(-110, 50); z = rnd(-110, 180); } while (window.mapEdge(x, z) < 63); y = window.terrainHeight(x, z); }
    const s = rnd(0.7, 1.5);
    dummy.position.set(x, y, z); dummy.scale.set(s, s, s); dummy.rotation.set(0, Math.random() * 6, 0);
    dummy.updateMatrix(); grassI.setMatrixAt(i, dummy.matrix);
  }
  scene.add(grassI);

  /* --- Waffen zum Aufsammeln (Position + Höhe) --- */
  MAP_PICKUPS.push(
    { w: 0, x: -34, y: 0, z: -38 }, { w: 0, x: 14, y: 0, z: -31.5 }, { w: 0, x: 30, y: CW, z: 45.6 }, { w: 0, x: -24, y: 0, z: 22 }, { w: 0, x: 0, y: 0, z: 8.5 },
    { w: 1, x: -44, y: 0, z: -46 }, { w: 1, x: -44, y: 0, z: -22 }, { w: 1, x: 4, y: 0, z: 24 }, { w: 1, x: -27, y: 0, z: -24 },
    { w: 2, x: -44, y: B1.roofY, z: -46 }, { w: 2, x: -56, y: 4, z: 32 }, { w: 2, x: 50, y: 2.6, z: -55 }, { w: 2, x: 40, y: CW, z: 45.6 },
    { w: 1, x: 26, y: 0, z: 28 }, { w: 0, x: 50, y: 0, z: -20 },
    { w: 0, x: -25, y: 0, z: 108 }, { w: 1, x: 40, y: 0, z: 76 }, { w: 2, x: -45, y: 2.2, z: 129.9 }, { w: 0, x: 18, y: 0, z: 88 },
  );
}

/* ======================= Riesige Karte „Welt“ (x/z -300 … 300): Großstadt, Dorf, Bauernhof, Wald, Landstraßen ======================= */
window.MAP_ADDR = [];   // Lieferadressen (Haustüren) für Jobs
window.MAP_JOBS = [];   // Firmen mit Jobs
const STREET_NAMES = ['Hauptstraße', 'Lindenstraße', 'Bahnhofstraße', 'Schulstraße', 'Gartenweg', 'Kirchplatz', 'Bergstraße', 'Mühlenweg', 'Rosenstraße',
  'Am Markt', 'Goethestraße', 'Parkallee', 'Dorfstraße', 'Feldweg', 'Industriestraße', 'Schillerstraße', 'Ahornweg', 'Brunnenstraße', 'Ringstraße', 'Talweg',
  'Eichenweg', 'Mozartstraße', 'Sonnenweg', 'Kastanienallee', 'Hafenstraße', 'Wiesenweg', 'Birkenstraße', 'Marktgasse', 'Uhlandstraße', 'Tannenweg', 'Am Bach', 'Lessingstraße'];
// x/z = Punkt an der Straße (Taxi hält hier), dx/dz = Haustür (hier wird geklingelt)
// Straßenname nach Straße (Häuserzeile), Hausnummern fortlaufend: eine Seite ungerade, die andere gerade
const STREET_N = {};
function addAddr(x, z, area, dx = x, dz = z) {
  const alongX = Math.abs(dz - z) >= Math.abs(dx - x);   // Tür liegt in z-Richtung von der Straße → Häuserzeile entlang x
  const line = alongX ? Math.round(z / 6) : Math.round(x / 6), side = alongX ? Math.sign(dz - z) : Math.sign(dx - x);
  const key = area + (alongX ? 'x' : 'z') + Math.round(line / 12);
  if (STREET_N['name' + key] === undefined) STREET_N['name' + key] = (STREET_N.next = (STREET_N.next || 0) + 1) - 1;
  const h = STREET_N['name' + key] % STREET_NAMES.length;
  STREET_N[key + side] = (STREET_N[key + side] || 0) + 1;
  const num = STREET_N[key + side] * 2 - (side > 0 ? 1 : 0);
  window.MAP_ADDR.push({ x, z, area, door: { x: dx, z: dz }, label: STREET_NAMES[h] + ' ' + num });
}
/* ---------- Begehbares Einfamilienhaus mit Einrichtung ----------
   face = +1: Haustür zeigt nach +z, -1: nach -z. Vorne Wohnzimmer + Küche, hinten Schlafzimmer. */
const FURN = {
  sofa: new THREE.MeshStandardMaterial({ color: 0x4f6582, roughness: 0.9 }), sofa2: new THREE.MeshStandardMaterial({ color: 0x8a4b3a, roughness: 0.9 }),
  bed: new THREE.MeshStandardMaterial({ color: 0xece8de, roughness: 0.85 }), blanket: new THREE.MeshStandardMaterial({ color: 0x3f6f8f, roughness: 0.9 }),
  tv: new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.15, metalness: 0.5, emissive: 0x15253a, emissiveIntensity: 0.6 }),
  flowerR: new THREE.MeshStandardMaterial({ color: 0xd8324a, roughness: 0.8 }), flowerY: new THREE.MeshStandardMaterial({ color: 0xf2c531, roughness: 0.8 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.32, envMapIntensity: 1.5, depthWrite: false }),
};
const NR = { round: 0 };
// Fensterläden: grün, blau, braun oder keine
const SHUTTERS = [new THREE.MeshStandardMaterial({ color: 0x3f6b45, roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: 0x3d5f80, roughness: 0.7 }),
  new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.75 }), null];
function weltHouse(cx, cz, face, wallMat, roofMat = TKM.roofTile) {
  const W = 10, D = 8, H = 3.0, T = 0.25, x0 = cx - W / 2, x1 = cx + W / 2;
  const fz = cz + face * D / 2, bzW = cz - face * D / 2;
  const win = (a) => [a - 0.7, a + 0.7, 0.9, 2.05];
  // Außenwände mit Haustür, Hintertür und Fenstern
  wallRun('x', x0, x1, fz - face * T / 2, 0, H, T, wallMat, [win(cx - 3.3), win(cx - 0.9), [cx + 1.0, cx + 2.3, 0, 2.2], win(cx + 3.6)], NR);
  wallRun('x', x0, x1, bzW + face * T / 2, 0, H, T, wallMat, [win(cx - 3.2), win(cx + 0.4), [cx + 2.9, cx + 4.1, 0, 2.2]], NR);
  const zA = Math.min(fz, bzW) + T, zB = Math.max(fz, bzW) - T;
  wallRun('z', zA, zB, x0 + T / 2, 0, H, T, wallMat, [[cz - 2.3, cz - 1.1, 0.9, 2.05], [cz + 1.1, cz + 2.3, 0.9, 2.05]], NR);
  wallRun('z', zA, zB, x1 - T / 2, 0, H, T, wallMat, [[cz - 0.7, cz + 0.7, 0.9, 2.05]], NR);
  // Innenwand zwischen Wohn- und Schlafzimmer mit Durchgang
  wallRun('x', x0 + T, x1 - T, cz, 0, H, 0.15, MAT.plaster, [[cx - 1.6, cx - 0.5, 0, 2.15]], NR);
  decalT(cx, cz, W - 0.5, D - 0.5, TKM.wood, 2, 0, 0.014);
  addBox(cx, H, cz, W + 0.3, 0.2, D + 0.3, MAT.concrete, 2);   // Decke
  // Satteldach (Kulisse)
  const rise = D * 0.38, slope = Math.hypot(D / 2 + 0.5, rise), ang = Math.atan2(rise, D / 2 + 0.5);
  for (const s of [1, -1]) {
    const r = new THREE.Mesh(boxGeo(W + 0.8, 0.16, slope, 2.5), roofMat);
    r.position.set(cx, H + 0.2 + rise / 2, cz + s * (D / 4 + 0.25)); r.rotation.x = s * ang; r.castShadow = true; r.receiveShadow = true; scene.add(r);
  }
  const gable = new THREE.Shape(); gable.moveTo(-D / 2, 0); gable.lineTo(D / 2, 0); gable.lineTo(0, rise); gable.closePath();
  for (const s of [1, -1]) {
    const gg = new THREE.ShapeGeometry(gable), uv = gg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, gg.attributes.position.getX(i) / 2.5, gg.attributes.position.getY(i) / 2.5);
    const gm = new THREE.Mesh(withUv2(gg), wallMat); gm.position.set(cx + s * W / 2, H + 0.2, cz); gm.rotation.y = s * Math.PI / 2; scene.add(gm);
  }
  // offene Haustür (Türblatt nach innen gedreht) + Glas in den Fenstern
  addBox(cx + 1.05, 0, fz - face * 0.75, 0.06, 2.15, 1.25, TKM.wood, 0, { decor: true, round: 0 });
  for (const a of [cx - 3.3, cx - 0.9, cx + 3.6]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.15), FURN.glass); g.position.set(a, 1.475, fz - face * 0.05); g.userData.noMerge = true; scene.add(g); }
  // Außen: Fensterbänke, Fensterläden, Vordach über der Haustür, Schornstein (nur Kulisse)
  const DEC = { decor: true, round: 0, shadow: false }, shut = SHUTTERS[Math.floor(srand() * SHUTTERS.length)];
  for (const a of [cx - 3.3, cx - 0.9, cx + 3.6]) {
    addBox(a, 0.8, fz + face * 0.1, 1.65, 0.08, 0.22, TKM.white, 1, DEC);
    addBox(a, 2.05, fz + face * 0.04, 1.6, 0.14, 0.1, TKM.white, 1, DEC);
    if (shut) for (const s of [-1, 1]) addBox(a + s * 0.97, 0.88, fz + face * 0.05, 0.5, 1.2, 0.05, shut, 1, DEC);
  }
  for (const a of [cx - 3.2, cx + 0.4]) addBox(a, 0.8, bzW - face * 0.1, 1.65, 0.08, 0.22, TKM.white, 1, DEC);
  addBox(cx + 1.65, 2.3, fz + face * 0.55, 2.0, 0.1, 1.1, roofMat, 2.5, { decor: true, round: 0 });
  for (const s of [-1, 1]) addBox(cx + 1.65 + s * 0.9, 2.12, fz + face * 1.0, 0.06, 0.18, 0.06, MAT.metal, 1, DEC);
  const chH = D * 0.38 + 1.0;
  addBox(cx - 2.6, H + 0.2, cz - face * 1.3, 0.62, chH, 0.62, MAT.brick, 1, { decor: true, round: 0 });
  addBox(cx - 2.6, H + 0.2 + chH, cz - face * 1.3, 0.78, 0.1, 0.78, MAT.dark, 1, DEC);
  // Wohnzimmer (vorne): Sofa, Couchtisch, Fernseher, Küchenzeile, Kühlschrank, Esstisch
  const lz = cz + face * D / 4, sz = cz - face * D / 4;
  addBox(cx - 3.3, 0, lz + face * 0.2, 2.2, 0.45, 0.9, srand() < 0.5 ? FURN.sofa : FURN.sofa2, 0, { round: 0.12 });
  addBox(cx - 3.3, 0.45, lz + face * 0.55, 2.2, 0.45, 0.2, FURN.sofa, 0, { decor: true, round: 0.08 });
  addBox(cx - 3.3, 0, lz - face * 1.0, 1.0, 0.42, 0.55, MAT.crate, 0);
  addBox(cx - 4.7, 0.7, lz - face * 0.2, 0.08, 0.7, 1.2, FURN.tv, 0, { decor: true, round: 0.02 });
  addBox(x1 - 0.6, 0, lz - face * 0.2, 0.7, 0.92, 2.0, TKM.white, 1, { round: 0 }); addBox(x1 - 0.6, 0.92, lz - face * 0.2, 0.74, 0.05, 2.04, MAT.dark, 1, { decor: true, round: 0 });
  addBox(x1 - 0.6, 0, lz + face * 1.35, 0.7, 1.85, 0.66, TKM.white, 1, { round: 0.03 });
  addBox(cx + 0.9, 0, lz - face * 0.6, 1.3, 0.76, 0.85, MAT.crate, 0);
  // Schlafzimmer (hinten): Bett mit Decke und Kissen, Schrank, Nachttisch
  addBox(cx - 3.2, 0, sz, 2.0, 0.5, 1.6, FURN.bed, 0, { round: 0.08 });
  addBox(cx - 3.0, 0.5, sz, 1.4, 0.08, 1.62, FURN.blanket, 0, { decor: true, round: 0.03 });
  addBox(cx - 4.0, 0.5, sz, 0.35, 0.14, 1.1, FURN.bed, 0, { decor: true, round: 0.06 });
  addBox(cx - 4.7, 0, sz, 0.2, 1.0, 1.7, MAT.crate, 0, { decor: true });
  addBox(x1 - 0.55, 0, sz, 0.6, 2.0, 1.6, MAT.crate, 0);
  addBox(cx - 1.8, 0, sz - face * 0.6, 0.45, 0.5, 0.45, MAT.crate, 0);
}
// Grundstück mit Haus: Zaun mit Gartentor, Vorgarten, Plattenweg, Einfahrt, Garten mit Baum/Gartenhaus/Beet
function weltPlot(px0, px1, zs, face, zMid, wallMat) {
  const hx = (px0 + px1) / 2 - 1.5, frontZ = zs - face * 2.4;   // zs = Grundstücksrand an der Straße
  const hz = zs - face * 10.6;
  weltHouse(hx, hz, face, wallMat, srand() < 0.5 ? TKM.roofTile : MAT.roof);
  const doorX = hx + 1.65, white = srand() < 0.5, fm = white ? TKM.white : TKM.wood;
  // Vorderzaun mit Lücke fürs Gartentor und die Einfahrt
  const gate0 = doorX - 0.8, gate1 = doorX + 0.8, drive0 = px1 - 3.6, drive1 = px1 - 0.4;
  for (const [a, b] of [[px0, gate0], [gate1, drive0]]) if (b - a > 0.2) addBox((a + b) / 2, 0, frontZ, b - a, 0.85, 0.08, fm, 1, { round: 0 });
  addBox(px0, 0, (frontZ + zMid) / 2, 0.08, 0.85, Math.abs(zMid - frontZ), fm, 1, { round: 0 });   // Seitenzaun
  // Wege
  decalT(doorX, (frontZ + hz + face * 4) / 2, 1.3, Math.abs(frontZ - (hz + face * 4)), TKM.stone, 2, 0, 0.016);
  decalT((drive0 + drive1) / 2, (zs + hz) / 2, drive1 - drive0, Math.abs(zs - hz), MAT.concreteFloor, 2.7, 0, 0.015);
  if (srand() < 0.3) carSpot((drive0 + drive1) / 2, hz + face * 1.5, face > 0 ? -Math.PI / 2 : Math.PI / 2);
  // Briefkasten am Tor
  addBox(gate0 - 0.35, 0, frontZ - face * 0.1, 0.08, 1.0, 0.08, MAT.dark, 1, { decor: true, round: 0 }); addBox(gate0 - 0.35, 1.0, frontZ - face * 0.1, 0.35, 0.3, 0.25, srand() < 0.5 ? MAT.yellow : MAT.ctrBlue, 1, { decor: true, round: 0.04 });
  // Vorgarten: Hecke + Blumenbeet unter dem Fenster
  hedge((px0 + gate0) / 2, frontZ - face * 0.7, Math.max(1, gate0 - px0 - 1), 0.8);
  decalT(hx - 2, hz + face * 4.7, 4, 0.9, MAT.dirt, 2, 0, 0.016);
  for (let k = 0; k < 6; k++) addBox(hx - 3.7 + k * 0.7, 0, hz + face * 4.7, 0.25, 0.35, 0.25, k % 2 ? FURN.flowerR : FURN.flowerY, 0, { decor: true, round: 0 });
  // Garten hinten: Baum, Gartenhaus, Wäschespinne
  const gz = (hz - face * 4 + zMid) / 2;
  leafTree(px0 + 3, gz + face * 2, srnd(0.7, 0.95));
  if (srand() < 0.6) { addBox(px1 - 3, 0, zMid + face * 2.2, 2.4, 2.1, 2, TKM.wood, 2); addBox(px1 - 3, 2.1, zMid + face * 2.2, 2.8, 0.12, 2.4, MAT.roof, 2.5, { decor: true }); }
  else { addBox(px1 - 3.5, 0, gz, 0.08, 1.8, 0.08, MAT.metal, 1, { decor: true, round: 0 }); addBox(px1 - 3.5, 1.8, gz, 2.4, 0.04, 2.4, MAT.metal, 1, { decor: true, round: 0 }); }
  addAddr(doorX, zs + face * 0.6, 'dorf', doorX, hz + face * 4.65);
}
// Begehbares Geschäftshaus: Laden im Erdgeschoss mit Theke und Regalen, Treppen nach oben, Markise, Schild
function cityShop(bx, bz, w, d, floors, mat, faceS, shopName, colors) {
  building(bx, bz, w, d, floors, mat, faceS ? { s: [-w / 4, w / 4] } : { n: [-w / 4, w / 4] }, { crates: 0 });
  const fz = faceS ? bz + d / 2 : bz - d / 2, out = faceS ? 1 : -1, rot = faceS ? 0 : Math.PI;
  tkSign(bx, 3.0, fz + out * 0.06, Math.min(w - 2, 9), 0.9, rot, tkSignMat(shopName, colors[0], colors[1], false));
  addBox(bx, 2.55, fz + out * 0.9, w - 1, 0.1, 1.8, colors[0] === '#ffffff' ? MAT.ctrRed : MAT.ctrOrange, 2.6, { decor: true, round: 0 });   // Markise
  // Einrichtung: Theke, Regale an der Ostwand (Treppenhaus ist im Westen)
  const ix1 = bx + w / 2 - 0.3;
  addBox(ix1 - 3, 0, bz, 0.7, 1.05, 3.2, MAT.crate, 0);
  for (let k = 0; k < 2; k++) addBox(ix1 - 0.4, 0, bz - d / 4 + k * (d / 2), 0.6, 2.0, d / 3, MAT.metal, 1);
  addBox(bx + 1, 0, bz + (faceS ? -1 : 1) * (d / 2 - 2), w / 3, 1.2, 0.6, MAT.metal, 1);
  addAddr(bx + w / 4, fz + out * 3, 'stadt', bx + w / 4, fz + out * 0.7);
}
// Hochhaus mit begehbarer Eingangshalle (Glas, Drehtüren-Öffnungen, Empfang, Aufzüge); oben massiv
function towerLobby(x, z, w, d, h, mat, faceS) {
  const T = 0.3, LH = 4.4, x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, out = faceS ? 1 : -1;
  const doors = [[x - w / 5 - 1.2, x - w / 5 + 1.2, 0, 2.8], [x + w / 5 - 1.2, x + w / 5 + 1.2, 0, 2.8]];
  wallRun('x', x0, x1, faceS ? z1 - T / 2 : z0 + T / 2, 0, LH, T, TKM.lobby, doors);
  wallRun('x', x0, x1, faceS ? z0 + T / 2 : z1 - T / 2, 0, LH, T, MAT.concrete, []);
  wallRun('z', z0 + T, z1 - T, x0 + T / 2, 0, LH, T, TKM.lobby, [[z - 1.2, z + 1.2, 0, 2.8]]);
  wallRun('z', z0 + T, z1 - T, x1 - T / 2, 0, LH, T, TKM.lobby, []);
  addBox(x, LH, z, w, 0.4, d, MAT.concrete, 2, { round: 0 });
  addBox(x, LH + 0.4, z, w, h - LH - 0.4, d, mat, 16, { round: 0 });
  addBox(x, h, z, w, 0.9, d, MAT.concrete, 2, { decor: true, round: 0, shadow: false });
  if (h > 40) addBox(x, h + 0.9, z, 0.3, 9, 0.3, MAT.metal, 1, { decor: true });
  // Dachtechnik: Aufzugsraum, Klimageräte, Wassertank
  addBox(x - w * 0.22, h + 0.9, z + d * 0.18, w * 0.3, 2.6, d * 0.28, MAT.concrete, 2, { decor: true, round: 0 });
  addBox(x + w * 0.22, h + 0.9, z - d * 0.2, 2.2, 1.2, 1.6, MAT.metal, 1, { decor: true, round: 0.03 });
  addBox(x + w * 0.25, h + 0.9, z + d * 0.22, 1.6, 1.2, 1.6, MAT.metal, 1, { decor: true, round: 0.03 });
  if (srand() < 0.5) { const tk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 14), MAT.hallMetal); tk.position.set(x - w * 0.25, h + 2.9, z - d * 0.22); scene.add(tk); }
  addBox(x, LH - 0.05, z + out * (d / 2 + 0.9), w * 0.5, 0.15, 1.8, MAT.metal, 1, { decor: true, round: 0 });   // Vordach über dem Eingang
  decalT(x, z, w - 0.6, d - 0.6, TKM.stone, 2, 0, 0.014);
  // Empfangstheke, Aufzugstüren an der Rückwand, Pflanzen, Sitzbank
  const bz = faceS ? z0 + T + 0.06 : z1 - T - 0.06;
  addBox(x, 0, z + out * (d / 2 - 4.5), 4, 1.1, 0.8, MAT.crate, 0);
  for (const k of [-1, 0, 1]) addBox(x + k * 2.4, 0, bz, 1.6, 2.4, 0.05, MAT.metal, 1, { decor: true, round: 0 });
  tkPlanter(x0 + 1.4, z + out * (d / 2 - 2), 1.2, 1.2); tkPlanter(x1 - 1.4, z + out * (d / 2 - 2), 1.2, 1.2);
  bench(x - w / 4, z - out * 1, true);
  addAddr(x - w / 5, faceS ? z1 + 3 : z0 - 3, 'stadt', x - w / 5, faceS ? z1 + 0.7 : z0 - 0.7);
}
/* ---------- Altbau-Fassaden für die Stadt: Putz/Ziegel, Fenster mit Rahmen, Sprossen, Fensterbank, Gesims ----------
   512 px = 12,8 m: 4 Fensterachsen (je 3,2 m) × 4 Etagen (je 3,2 m) → Häuser in Vielfachen von 3,2 m passen genau */
function euFacade(base, frame, style) {
  const s = 512, c = document.createElement('canvas'), e = document.createElement('canvas'); c.width = c.height = e.width = e.height = s;
  const g = c.getContext('2d'), ge = e.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, s, s); ge.fillStyle = '#000'; ge.fillRect(0, 0, s, s);
  if (style === 'brick') {   // Ziegelmauer
    for (let y = 0; y < s; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < s; x += 16) {
      const l = 0.82 + Math.random() * 0.3; g.fillStyle = `rgba(${150 * l | 0},${70 * l | 0},${52 * l | 0},1)`; g.fillRect(x + 1, y + 1, 14, 6);
    }
  }
  speckle(g, s, 7000, '0,0,0', 0.06, 2); speckle(g, s, 2500, '255,255,255', 0.05, 2);
  const fh = s / 4, cw = s / 4;
  for (let f = 0; f < 4; f++) {
    const y0 = f * fh;
    if (style === 'shop') {   // Erdgeschoss: große Schaufenster, Tür, dunkles Band oben
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y0 + 4, s, fh * 0.14);
      for (let k = 0; k < 4; k++) {
        const x = k * cw + 9, w = cw - 18, y = y0 + fh * 0.22, h = fh * 0.74;
        g.fillStyle = frame; g.fillRect(x - 4, y - 4, w + 8, h + 4);
        const lit = Math.random() < 0.5;
        g.fillStyle = lit ? '#cdbf98' : '#24303a'; g.fillRect(x, y, w, h);
        const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(255,255,255,.28)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, w, h);
        if (lit) { ge.fillStyle = '#7a6a48'; ge.fillRect(x, y, w, h); }
        if (k === 1) { g.fillStyle = frame; g.fillRect(x + w * 0.62, y, 4, h); g.fillStyle = '#3a2a1c'; g.fillRect(x + w * 0.66, y + 4, w * 0.3, h - 4); }   // Tür
      }
      continue;
    }
    // Gesims zwischen den Etagen
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, y0 + fh - 9, s, 5); g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, y0 + fh - 4, s, 4);
    for (let k = 0; k < 4; k++) {
      const w = cw * 0.4, h = fh * 0.5, x = k * cw + (cw - w) / 2, y = y0 + fh * 0.18;
      if (style === 'deco') { g.fillStyle = frame; g.fillRect(x - 10, y - 16, w + 20, 7); g.beginPath(); g.moveTo(x - 6, y - 16); g.lineTo(x + w / 2, y - 28); g.lineTo(x + w + 6, y - 16); g.fill(); }
      g.fillStyle = frame; g.fillRect(x - 6, y - 6, w + 12, h + 12);   // Rahmen
      const on = Math.random() < 0.16;
      g.fillStyle = on ? '#f1d89c' : '#26323d'; g.fillRect(x, y, w, h);
      if (on) { ge.fillStyle = '#ffd890'; ge.fillRect(x, y, w, h); }
      else { const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(255,255,255,.3)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, w, h); }
      if (!on && Math.random() < 0.35) { g.fillStyle = 'rgba(235,230,215,.8)'; g.fillRect(x, y, w, h * 0.3); }   // Gardine/Rollo
      g.fillStyle = frame; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h * 0.33, w, 3);   // Sprossen
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x - 9, y + h + 9, w + 18, 5); g.fillStyle = frame; g.fillRect(x - 10, y + h + 5, w + 20, 6);   // Fensterbank
    }
  }
  const t = new THREE.CanvasTexture(halfOnTouch(c)), te = new THREE.CanvasTexture(halfOnTouch(e));   // Handy: halbe Auflösung (Speicher)
  for (const q of [t, te]) { q.wrapS = q.wrapT = THREE.RepeatWrapping; q.anisotropy = MAX_ANISO; q.encoding = THREE.sRGBEncoding; }
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: te, emissiveIntensity: 0.45, roughness: 0.85 });
}
let EU = null;
function euMats() {
  if (EU) return EU;
  const plain = hex => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.9 });
  // wenige Varianten: jede Variante ist ein eigenes Material und damit ein eigener Zeichenaufruf pro Kartenstück
  const trim = plain('#f1eee4');
  const F = (base, style) => ({ mat: euFacade(base, '#f1eee4', style), gable: plain(style === 'brick' ? '#94503c' : base), trim });
  EU = {
    facades: [F('#e8dcbc', 'deco'), F('#e3c97e', 'plain'), F('#d79a7e', 'deco'), F('#b8c8d3', 'plain'), F('#9c4a36', 'brick')],
    shops: [euFacade('#4b4d52', '#202226', 'shop'), euFacade('#e7e2d6', '#3a3c40', 'shop')],
    roofs: [TKM.roofTile, MAT.roof, pbr('roof', 2.5, { mat: { color: new THREE.Color(0.75, 0.38, 0.28) } })],
    awn: [MAT.ctrRed, MAT.ctrGreen, MAT.ctrBlue, MAT.ctrOrange],
    pave: new THREE.MeshStandardMaterial({ map: canvasTex((g, s) => {
      g.fillStyle = '#6a6862'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const l = 0.9 + Math.random() * 0.14; g.fillStyle = `rgb(${132 * l | 0},${129 * l | 0},${122 * l | 0})`; g.fillRect(x * s / 4 + 2, y * s / 4 + 2, s / 4 - 4, s / 4 - 4); }
      speckle(g, s, 3000, '0,0,0', 0.08, 2);
    }, 256), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }),
    curb: new THREE.MeshStandardMaterial({ color: 0xb4b2ab, roughness: 0.85 }),
    zebra: new THREE.MeshStandardMaterial({ map: (() => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 32; const g = c.getContext('2d');
      for (let k = 0; k < 9; k++) { g.fillStyle = 'rgba(238,238,232,.95)'; g.fillRect(k * 512 / 9 + 8, 0, 512 / 9 - 16, 32); }
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO; return t;
    })(), alphaTest: 0.5, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }),
  };
  EU.plaza = new THREE.MeshStandardMaterial({ map: canvasTex((g, s) => {
    g.fillStyle = '#5a5853'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { const l = 0.92 + Math.random() * 0.12; g.fillStyle = `rgb(${112 * l | 0},${109 * l | 0},${103 * l | 0})`; g.fillRect(x * s / 2 + 2, y * s / 2 + 2, s / 2 - 4, s / 2 - 4); }
    speckle(g, s, 4000, '0,0,0', 0.07, 2);
  }, 256), roughness: 0.9 });
  for (const m of [EU.pave, EU.plaza]) m.map.encoding = THREE.sRGBEncoding;
  // Haustür: Holz mit Kassetten, Glaseinsatz oben, Messinggriff, Hausnummer
  EU.door = new THREE.MeshStandardMaterial({ map: canvasTex((g, s) => {
    g.fillStyle = '#4a2c1a'; g.fillRect(0, 0, s, s * 2);
    g.fillStyle = '#5c3822'; g.fillRect(14, 18, s - 28, s * 0.42); g.fillRect(14, s * 0.62, s - 28, s * 0.32);
    g.fillStyle = '#9fb4c4'; g.fillRect(30, 30, s - 60, s * 0.3); g.strokeStyle = '#2a1a10'; g.lineWidth = 6; g.strokeRect(30, 30, s - 60, s * 0.3);
    g.fillStyle = '#d4af37'; g.fillRect(s - 44, s * 0.55, 18, 6);
    speckle(g, s, 600, '0,0,0', 0.12, 2);
  }, 128, false), roughness: 0.6 });
  EU.door.map.encoding = THREE.sRGBEncoding;
  EU.pipe = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.45, metalness: 0.6 });   // Regenfallrohr (Zink)
  return EU;
}
const EU_SHOPS = ['METZGEREI', 'BLUMEN', 'EISCAFÉ', 'OPTIKER', 'SCHUHE', 'HANDYSHOP', 'REISEBÜRO', 'BIOLADEN', 'DROGERIE', 'IMBISS', 'BOUTIQUE', 'SPIELWAREN', 'BÄCKER', 'WEINHANDEL'];
let euShopN = 0; const EU_SIGN = {};
/* Altbau-Stadthaus (nicht begehbar) an der Straße: Läden im Erdgeschoss, Fassade, Gesims, Balkone, Sattel- oder Flachdach.
   alongX = Front verläuft entlang x (Straße an z-Seite), face = Richtung der Straße (+1/-1). w = Breite an der Straße, d = Tiefe */
function euHouse(cx, cz, w, d, floors, alongX, face) {
  const E = euMats(), F = E.facades[Math.floor(srand() * E.facades.length)], shop = srand() < 0.6;
  const bx = alongX ? w : d, bz = alongX ? d : w, top = floors * FLOOR_H, NRD = { round: 0 };
  addBox(cx, 0, cz, bx, FLOOR_H, bz, shop ? E.shops[Math.floor(srand() * E.shops.length)] : F.mat, 12.8, NRD);
  addBox(cx, FLOOR_H, cz, bx, top - FLOOR_H, bz, F.mat, 12.8, NRD);
  addBox(cx, FLOOR_H - 0.12, cz, bx + 0.16, 0.24, bz + 0.16, F.trim, 2, { decor: true, round: 0, shadow: false });   // Band über dem Erdgeschoss
  addBox(cx, top, cz, bx + 0.45, 0.4, bz + 0.45, F.trim, 2, { decor: true, round: 0 });                            // Kranzgesims / Dachkante
  // Front-Hilfen: Punkt auf der Fassade zur Straße, Richtung entlang der Fassade
  const fx = alongX ? 0 : face, fz = alongX ? face : 0, ax = alongX ? 1 : 0, az = alongX ? 0 : 1, half = d / 2;
  const at = (u, out, y, W, H, D, mat, o = {}) => addBox(cx + fx * (half + out) + ax * u, y, cz + fz * (half + out) + az * u,
    alongX ? W : D, H, alongX ? D : W, mat, 1, Object.assign({ decor: true, round: 0, shadow: false }, o));
  if (shop) {   // Markise + Ladenschild
    const awn = E.awn[Math.floor(srand() * E.awn.length)];
    at(0, 0.7, 2.55, w - 0.6, 0.12, 1.4, awn, { shadow: true });
    const n = euShopN++ % EU_SHOPS.length, name = EU_SHOPS[n], col = TK_COLORS[n % TK_COLORS.length];
    const rot = alongX ? (face > 0 ? 0 : Math.PI) : (face > 0 ? Math.PI / 2 : -Math.PI / 2);
    const sm = EU_SIGN[name] || (EU_SIGN[name] = tkSignMat(name, col[0], col[1], false));   // gleiches Schild = gleiches Material
    tkSign(cx + fx * (half + 0.05), 2.95, cz + fz * (half + 0.05), Math.min(w - 1, 6), 0.55, rot, sm);
  } else {   // Wohnhaus: Haustür mit Stufe und Lampe
    const du = w > 4 ? -w / 2 + 1.6 + Math.floor(srand() * Math.max(1, Math.round(w / 3.2) - 1)) * 3.2 : 0;
    at(du, 0.03, 0, 1.15, 2.3, 0.06, E.door);
    at(du, 0.4, 0, 1.8, 0.16, 0.8, F.trim, { shadow: false });
    at(du + 0.85, 0.08, 2.35, 0.14, 0.2, 0.14, LAMP_MAT);
  }
  at(w / 2 - 0.14, 0.07, 0, 0.1, top + 0.3, 0.1, E.pipe);   // Regenfallrohr an der Hausecke
  // Balkone an manchen Fensterachsen (Achsen liegen bei 1,6 + k·3,2 m vom Rand)
  const axes = Math.round(w / 3.2);
  for (let f = 1; f < floors; f++) for (let k = 0; k < axes; k++) {
    if (srand() > 0.22) continue;
    const u = -w / 2 + 1.6 + k * 3.2, y = f * FLOOR_H + 0.05;
    at(u, 0.5, y, 2.2, 0.14, 1.0, F.trim);
    at(u, 0.97, y + 0.14, 2.2, 0.9, 0.05, MAT.metal);
  }
  // Dach
  if (srand() < 0.6) {
    const roof = E.roofs[Math.floor(srand() * E.roofs.length)], rise = d * 0.3, run = d / 2 + 0.35, slope = Math.hypot(run, rise), ang = Math.atan2(rise, run), y0 = top + 0.4;
    for (const s of [1, -1]) {
      const r = new THREE.Mesh(boxGeo(alongX ? bx + 0.3 : slope, 0.16, alongX ? slope : bz + 0.3, 2.5), roof);
      if (alongX) { r.position.set(cx, y0 + rise / 2, cz + s * run / 2); r.rotation.x = s * ang; }
      else { r.position.set(cx + s * run / 2, y0 + rise / 2, cz); r.rotation.z = -s * ang; }
      r.castShadow = true; r.receiveShadow = true; scene.add(r);
    }
    const gable = new THREE.Shape(); gable.moveTo(-d / 2, 0); gable.lineTo(d / 2, 0); gable.lineTo(0, rise); gable.closePath();
    for (const s of [1, -1]) {
      const gm = new THREE.Mesh(withUv2(new THREE.ShapeGeometry(gable)), F.gable);
      if (alongX) { gm.position.set(cx + s * bx / 2, y0, cz); gm.rotation.y = s * Math.PI / 2; }
      else { gm.position.set(cx, y0, cz + s * bz / 2); gm.rotation.y = s > 0 ? 0 : Math.PI; }
      scene.add(gm);
    }
    if (srand() < 0.6) addBox(cx + (alongX ? srnd(-w / 3, w / 3) : -face * d / 5), y0, cz + (alongX ? -face * d / 5 : srnd(-w / 3, w / 3)), 0.6, rise * 0.75 + 0.9, 0.6, MAT.brick, 1, { decor: true, round: 0 });   // Schornstein
  } else {   // Flachdach mit Technik
    addBox(cx + srnd(-bx / 4, bx / 4), top + 0.4, cz + srnd(-bz / 4, bz / 4), 1.6, 1.0, 1.2, MAT.metal, 1, { decor: true, round: 0.03 });
    if (srand() < 0.5) addBox(cx + srnd(-bx / 4, bx / 4), top + 0.4, cz + srnd(-bz / 4, bz / 4), 0.5, 1.4, 0.5, MAT.hallMetal, 1, { decor: true, round: 0 });
  }
}
// Häuserzeile in einer Lücke [a0, a1] entlang einer Straße: Breiten in Vielfachen von 3,2 m, mittig ausgerichtet
function euRow(a0, a1, front, alongX, face, depth, keepFree) {
  let n = Math.floor((a1 - a0) / 3.2); if (n < 2) return;
  let a = (a0 + a1) / 2 - n * 3.2 / 2;
  while (n >= 2) {
    const k = n <= 4 ? n : Math.min(n - 2, 2 + Math.floor(srand() * 3)), w = k * 3.2, c = a + w / 2;
    const cx = alongX ? c : front - face * depth / 2, cz = alongX ? front - face * depth / 2 : c;
    const bx = alongX ? w : depth, bz = alongX ? depth : w;
    if (!keepFree.some(([px, pz]) => Math.abs(px - cx) < bx / 2 + 1 && Math.abs(pz - cz) < bz / 2 + 1)) euHouse(cx, cz, w, depth, 3 + Math.floor(srand() * 4), alongX, face);
    a += w; n -= k;
  }
}
// Gehweg mit Pflaster und Bordstein rund um einen Block
function sidewalkRing(x0, x1, z0, z1, wd = 3) {
  const E = euMats(), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0, D = z1 - z0;
  decalT(cx, z0 + wd / 2, W, wd, E.pave, 2, 0, 0.011); decalT(cx, z1 - wd / 2, W, wd, E.pave, 2, 0, 0.011);
  decalT(x0 + wd / 2, cz, wd, D - 2 * wd, E.pave, 2, 0, 0.011); decalT(x1 - wd / 2, cz, wd, D - 2 * wd, E.pave, 2, 0, 0.011);
  const o = { decor: true, round: 0, shadow: false };
  addBox(cx, 0, z0 + 0.1, W, 0.13, 0.2, E.curb, 1, o); addBox(cx, 0, z1 - 0.1, W, 0.13, 0.2, E.curb, 1, o);
  addBox(x0 + 0.1, 0, cz, 0.2, 0.13, D, E.curb, 1, o); addBox(x1 - 0.1, 0, cz, 0.2, 0.13, D, E.curb, 1, o);
}
/* ---------- Bauernhof: Fachwerkhaus, Kühe, Hühner, Weide, Obstgarten … ---------- */
// Fachwerk-Fassade: 512 px = 6 m breit × 6 m hoch (2 Etagen à 3 m), weißer Putz, dunkle Balken, Fenster mit Läden
const FACHWERK = (() => {
  const s = 512, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
  g.fillStyle = '#eee7d6'; g.fillRect(0, 0, s, s); speckle(g, s, 5000, '0,0,0', 0.05, 2);
  const beam = '#4a3122', B = 12, fl = s / 2, col = s / 4;
  for (let f = 0; f < 2; f++) {
    const y0 = f * fl;
    for (let k = 0; k < 4; k++) {
      const x0 = k * col, win = k === 1 || k === 3;
      if (win) {   // Fenster mit Sprossen, Fensterladen links/rechts
        const w = col * 0.5, h = fl * 0.42, x = x0 + (col - w) / 2, y = y0 + fl * 0.24;
        g.fillStyle = '#f4f1ea'; g.fillRect(x - 6, y - 6, w + 12, h + 12);
        g.fillStyle = '#2a343c'; g.fillRect(x, y, w, h);
        const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(255,255,255,.3)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, w, h);
        g.fillStyle = '#f4f1ea'; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h / 2 - 2, w, 4);
        g.fillStyle = '#2f5a3a'; g.fillRect(x - 6 - w * 0.38, y - 4, w * 0.36, h + 8); g.fillRect(x + w + 8, y - 4, w * 0.36, h + 8);
      } else {   // Andreaskreuz zwischen den Fenstern
        g.strokeStyle = beam; g.lineWidth = B; g.beginPath(); g.moveTo(x0 + B, y0 + B); g.lineTo(x0 + col - B, y0 + fl - B); g.moveTo(x0 + col - B, y0 + B); g.lineTo(x0 + B, y0 + fl - B); g.stroke();
      }
      g.fillStyle = beam; g.fillRect(x0, y0, B, fl);   // Ständer
    }
    g.fillStyle = beam; g.fillRect(0, y0, s, B); g.fillRect(0, y0 + fl - B, s, B); g.fillRect(0, y0 + fl * 0.72, s, B * 0.7);   // Rähm, Schwelle, Riegel
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); m.userData.tile = 6; return m;
})();
const FARM = {
  cow: new THREE.MeshStandardMaterial({ roughness: 0.85, map: (() => {
    const s = 128, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    g.fillStyle = '#f2efe8'; g.fillRect(0, 0, s, s); g.fillStyle = '#1c1a18';
    for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, 10 + Math.random() * 18, 8 + Math.random() * 14, Math.random() * 3, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })() }),
  cowDark: new THREE.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.85 }),
  pink: new THREE.MeshStandardMaterial({ color: 0xe8a0a0, roughness: 0.7 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1a1918, roughness: 0.8 }),
  hen: new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.9 }),
  comb: new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.6 }),
  beak: new THREE.MeshStandardMaterial({ color: 0xe8a42a, roughness: 0.6 }),
  barnRed: new THREE.MeshStandardMaterial({ color: 0x8e2a1e, roughness: 0.85 }),
  veg: new THREE.MeshStandardMaterial({ color: 0x4f8a34, roughness: 0.9 }),
  meadow: pbr('grass', 3, { map: tintedTex('grass', 0x5a7a36), mat: { color: new THREE.Color(1, 1, 1) } }),
};
// Teil-Box in einer Gruppe (für gedrehte Tiere/Geräte)
function gBox(grp, x, y, z, w, h, d, mat) { const m = new THREE.Mesh(boxGeo(w, h, d, 1, 0), mat); m.position.set(x, y + h / 2, z); m.castShadow = true; grp.add(m); return m; }
function cow(x, z, rot, dark) {
  const g = new THREE.Group(), body = dark ? FARM.cowDark : FARM.cow;
  gBox(g, 0, 0.75, 0, 2.1, 0.95, 0.9, body);                         // Rumpf
  gBox(g, 1.2, 1.2, 0, 0.55, 0.5, 0.45, body);                       // Kopf
  gBox(g, 1.5, 1.22, 0, 0.18, 0.28, 0.4, FARM.pink);                 // Maul
  for (const s of [-1, 1]) { gBox(g, 1.15, 1.62, s * 0.3, 0.08, 0.06, 0.22, FARM.hen); gBox(g, 1.1, 1.5, s * 0.3, 0.12, 0.08, 0.16, body); }   // Hörner, Ohren
  for (const [lx, lz] of [[0.75, 0.3], [0.75, -0.3], [-0.8, 0.3], [-0.8, -0.3]]) { gBox(g, lx, 0, lz, 0.18, 0.78, 0.18, body); gBox(g, lx, 0, lz, 0.2, 0.12, 0.2, FARM.black); }
  gBox(g, -0.5, 0.58, 0, 0.35, 0.2, 0.35, FARM.pink);                // Euter
  gBox(g, -1.08, 0.7, 0, 0.06, 0.85, 0.06, body);                    // Schwanz
  g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  collider(x, 0, z, 1.6, 1.6, 1.6);
}
function hen(x, z, rot) {
  const g = new THREE.Group();
  gBox(g, 0, 0.12, 0, 0.36, 0.26, 0.24, FARM.hen); gBox(g, 0.2, 0.3, 0, 0.14, 0.16, 0.14, FARM.hen);
  gBox(g, 0.21, 0.46, 0, 0.1, 0.07, 0.03, FARM.comb); gBox(g, 0.3, 0.34, 0, 0.07, 0.04, 0.05, FARM.beak); gBox(g, -0.2, 0.26, 0, 0.1, 0.16, 0.18, FARM.hen);
  for (const s of [-1, 1]) gBox(g, 0, 0, s * 0.06, 0.03, 0.12, 0.03, FARM.beak);
  g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
}
// Holzzaun mit Pfosten und zwei Latten zwischen zwei Punkten (achsparallel), gesperrt bis 1,2 m
function railFence(x0, z0, x1, z1) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, o = { decor: true, round: 0 };
  for (let t = 0; t <= L + 0.01; t += 3) addBox(alongX ? Math.min(x0, x1) + t : cx, 0, alongX ? cz : Math.min(z0, z1) + t, 0.14, 1.15, 0.14, TKM.wood, 1, o);
  for (const y of [0.45, 0.9]) addBox(cx, y, cz, alongX ? L : 0.07, 0.12, alongX ? 0.07 : L, TKM.wood, 1, o);
  collider(cx, 0, cz, alongX ? L : 0.2, 1.2, alongX ? 0.2 : L);
}
// Fachwerk-Bauernhaus (geschlossen): 2 Etagen, steiles Ziegeldach, Schornstein, Haustür nach Norden
function fachwerkHouse(x, z, w, d) {
  const h = 6;
  addBox(x, 0, z, w, 0.5, d, MAT.concrete, 2, { round: 0 });   // Sockel
  addBox(x, 0.5, z, w, h - 0.5, d, FACHWERK, 6, { round: 0 });
  const roof = pbr('roof', 2.5, { mat: { color: new THREE.Color(0.78, 0.36, 0.26) } });
  const rise = d * 0.55, run = d / 2 + 0.6, slope = Math.hypot(run, rise), ang = Math.atan2(rise, run);
  for (const s of [1, -1]) { const r = new THREE.Mesh(boxGeo(w + 1.0, 0.2, slope, 2.5), roof); r.position.set(x, h + rise / 2, z + s * run / 2); r.rotation.x = s * ang; r.castShadow = true; r.receiveShadow = true; scene.add(r); }
  const gable = new THREE.Shape(); gable.moveTo(-d / 2, 0); gable.lineTo(d / 2, 0); gable.lineTo(0, rise); gable.closePath();
  for (const s of [1, -1]) {
    const gg = new THREE.ShapeGeometry(gable), uv = gg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, gg.attributes.position.getX(i) / 6, gg.attributes.position.getY(i) / 6 + 0.5);
    const gm = new THREE.Mesh(withUv2(gg), FACHWERK); gm.position.set(x + s * w / 2, h, z); gm.rotation.y = s * Math.PI / 2; scene.add(gm);
  }
  addBox(x + w / 4, h + rise * 0.4, z + d / 6, 0.8, rise * 0.8, 0.8, MAT.brick, 1, { decor: true, round: 0 });
  for (const s of [1, -1]) {   // Haustüren + Vordach
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.3), MAT.door); door.position.set(x, 0.5 + 1.15, z + s * (d / 2 + 0.012)); door.rotation.y = s > 0 ? 0 : Math.PI; scene.add(door);
    addBox(x, 3.0, z + s * (d / 2 + 0.6), 2.4, 0.12, 1.2, roof, 2.5, { decor: true, round: 0 });
    addBox(x, 0, z + s * (d / 2 + 0.6), 2.2, 0.25, 1.2, MAT.concrete, 2, { round: 0 });   // Stufe
  }
  for (const s of [1, -1]) for (const o of [-w / 2 + 2.2, w / 2 - 2.2]) for (let k = 0; k < 4; k++) addBox(x + o + (k - 1.5) * 0.4, 1.5, z + s * (d / 2 + 0.2), 0.3, 0.25, 0.25, k % 2 ? FURN.flowerR : FURN.flowerY, 0, { decor: true, round: 0 });   // Blumenkästen
}
function farmExtras() {
  const o = { decor: true, round: 0 };
  // Kuhweide mit Zaun (Tor nach Osten), Unterstand, Tränke, 7 Kühe
  const PX0 = 163, PX1 = 200, PZ0 = 248, PZ1 = 287;
  railFence(PX0, PZ0, PX1, PZ0); railFence(PX0, PZ1, PX1, PZ1); railFence(PX0, PZ0, PX0, PZ1);
  railFence(PX1, PZ0, PX1, 262); railFence(PX1, 268, PX1, PZ1);
  for (const [x, z] of [[PX0 + 3, PZ1 - 2], [PX0 + 9, PZ1 - 2], [PX0 + 3, PZ1 - 7], [PX0 + 9, PZ1 - 7]]) addBox(x, 0, z, 0.25, 2.6, 0.25, TKM.wood, 1, { round: 0 });
  addBox(PX0 + 6, 2.6, PZ1 - 4.5, 7.6, 0.18, 6.4, MAT.roof, 2.5, { decor: true, round: 0 });
  addBox(PX1 - 4, 0, PZ0 + 4, 3.2, 0.7, 0.9, MAT.concrete, 2, { round: 0 });
  const tw = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.6), TKM.water); tw.rotation.x = -Math.PI / 2; tw.position.set(PX1 - 4, 0.62, PZ0 + 4); scene.add(tw);
  for (const [x, z, r, dk] of [[172, 256, 0.4, 0], [180, 262, 2.1, 1], [191, 270, -0.6, 0], [176, 274, 1.2, 0], [186, 280, 3.0, 1], [194, 254, -2.0, 0], [168, 268, 0.9, 0]]) cow(x, z, r, dk);
  // Hühnerstall mit Auslauf und Hühnern
  addBox(182, 0.5, 228, 3.2, 2.0, 2.2, TKM.wood, 2, { round: 0 }); addBox(182, 2.5, 228, 3.8, 0.12, 2.8, FARM.barnRed, 1, { decor: true, round: 0 });
  for (const [x, z] of [[180.7, 227.2], [183.3, 227.2], [180.7, 228.8], [183.3, 228.8]]) addBox(x, 0, z, 0.15, 0.5, 0.15, TKM.wood, 1, o);
  addBox(182, 0, 230.2, 0.6, 0.06, 1.4, TKM.wood, 1, { decor: true, round: 0, rotY: 0 });
  for (const [a, b, c2, d2] of [[176, 231, 188, 231], [176, 238, 188, 238], [176, 231, 176, 238], [188, 231, 188, 238]]) {
    const ax = Math.abs(c2 - a) > 0.1; addBox((a + c2) / 2, 0, (b + d2) / 2, ax ? c2 - a : 0.05, 0.9, ax ? 0.05 : d2 - b, MAT.metal, 1, o);
  }
  for (let k = 0; k < 7; k++) hen(srnd(177, 187), srnd(232, 237), srand() * 6);
  // Gemüsegarten neben dem Haus
  decalT(186, 206, 14, 10, MAT.dirt, 2, 0, 0.012);
  for (let r = 0; r < 5; r++) for (let k = 0; k < 12; k++) addBox(180 + k * 1.05, 0, 202.5 + r * 1.8, 0.45, 0.32 + srand() * 0.2, 0.45, FARM.veg, 1, { decor: true, round: 0.08, shadow: false });
  // Obstgarten (4 × 4 Apfelbäume)
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) leafTree(266 + a * 7.5, 256 + b * 8.5, 0.62 + srand() * 0.1);
  // Maschinenhalle (offen) mit Anhänger
  const HX = 276, HZ = 228;
  for (const dx of [-10, 0, 10]) for (const dz of [-5, 5]) addBox(HX + dx, 0, HZ + dz, 0.3, 4.2, 0.3, TKM.wood, 1, { round: 0 });
  addBox(HX, 4.2, HZ, 21.5, 0.2, 11.5, MAT.hallMetal, 2.6, { decor: true, round: 0 });
  addBox(HX, 0, HZ + 5.4, 20.6, 4.2, 0.2, TKM.wood, 2, { round: 0 });   // Rückwand
  addBox(HX - 4, 0.7, HZ, 5, 0.25, 2.3, MAT.ctrGreen, 2.6, { round: 0 }); addBox(HX - 4, 0.95, HZ, 5, 0.7, 2.3, MAT.ctrGreen, 2.6, { decor: true, round: 0 });
  for (const s of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16), TIRE); wh.rotation.x = Math.PI / 2; wh.position.set(HX - 4, 0.45, HZ + s * 1.25); scene.add(wh); }
  addBox(HX + 5, 0, HZ - 1, 2.6, 1.0, 1.4, MAT.ctrRed, 2.6, { round: 0.05 });   // Pflug/Gerät
  // Brunnen auf dem Hof
  const well = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(1.1, 1.15, 0.9, 16, 1, true)), TKM.stone); well.position.set(214, 0.45, 213); scene.add(well); collider(214, 0, 213, 2.2, 0.9, 2.2);
  for (const s of [-1, 1]) addBox(214 + s * 1.0, 0.9, 213, 0.14, 1.6, 0.14, TKM.wood, 1, o);
  addBox(214, 2.5, 213, 2.6, 0.12, 1.8, FARM.barnRed, 1, o); addBox(214, 1.9, 213, 2.1, 0.12, 0.12, TKM.wood, 1, o);
  // Strohballen-Stapel neben der Scheune
  const hay = new THREE.MeshStandardMaterial({ color: 0xc9a54e, roughness: 1, bumpMap: TEX.blades, bumpScale: 0.02 });
  for (let row = 0; row < 3; row++) for (let k = 0; k < 3 - row; k++) {
    const m = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 16)), hay); m.rotation.x = Math.PI / 2; m.position.set(257 + (k - (2 - row) / 2) * 1.55, 0.75 + row * 1.32, 226); m.castShadow = true; scene.add(m);
  }
  collider(257, 0, 226, 4.8, 3.9, 1.4);
  // Holzstapel am Haus
  for (let k = 0; k < 3; k++) addBox(213.6, k * 0.42, 190, 0.9, 0.42, 4, TKM.wood, 1, { round: 0.06 });
  // Vogelscheuche im Weizenfeld
  { const sx = 34, sz = 66, y = hillH(sx, sz);
    addBox(sx, y, sz, 0.12, 2.1, 0.12, TKM.wood, 1, { round: 0 }); addBox(sx, y + 1.5, sz, 1.6, 0.1, 0.1, TKM.wood, 1, o);
    addBox(sx, y + 1.0, sz, 0.55, 0.75, 0.3, MAT.ctrBlue, 1, o); addBox(sx, y + 1.85, sz, 0.32, 0.32, 0.3, FARM.hen, 1, o); addBox(sx, y + 2.15, sz, 0.7, 0.06, 0.7, hay, 1, o); addBox(sx, y + 2.2, sz, 0.35, 0.22, 0.35, hay, 1, o); }
}
/* ---------- Wald: Laubbäume, Birken, Büsche, Steine, umgefallene Stämme; See mit Schilf, Steg und Boot; Hütte mit Feuerstelle ---------- */
function forestExtras(LX, LZ, LR) {
  // freie Stelle im Wald? (Wege, See, Hütte, Turm, Gipfel, Drift-Strecke, Waffen)
  const free = (x, z, pad = 0) => !(Math.abs(x + 150) < 6 + pad || Math.abs(z + 150) < 6 + pad || x > -16 || z > -16 || x < -290 || z < -290
    || Math.hypot(x - LX, z - LZ) < LR + 3 + pad || Math.hypot(x - LX - 34, z - LZ - 22) < 14 + pad || Math.hypot(x + 95, z + 230) < 9 + pad
    || Math.hypot(x + 240, z + 242) < 8 + pad || Math.hypot(x + 228, z + 228) < 15 || trackDist(x, z) < 9 + pad || hillH(x, z) > 24
    || WELT_PICKS.some(p => Math.hypot(p.x - x, p.z - z) < 3 + pad) || Math.hypot(x + 150, z + 60) < 5);
  const td = new THREE.Object3D(), place = (inst, i, x, y, z, sx, sy, sz, ry, rx = 0, rz = 0) => {
    td.position.set(x, y, z); td.scale.set(sx, sy, sz); td.rotation.set(rx, ry, rz); td.updateMatrix(); inst.setMatrixAt(i, td.matrix);
  };
  // Laubbäume (Buchen) und Birken
  const barkB = new THREE.MeshStandardMaterial({ roughness: 0.9, map: (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#e8e5dc'; g.fillRect(0, 0, 64, 256); g.fillStyle = '#26221e';
    for (let i = 0; i < 26; i++) g.fillRect(Math.random() * 54, Math.random() * 256, 4 + Math.random() * 14, 2 + Math.random() * 4);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })() });
  barkB.userData.trunk = true;   // Birkenstämme: in „Klar & schnell“ ausblenden
  // Kronen: mehrere massive Blätter-Kugeln (Blätter-Textur als Relief, keine Löcher)
  const leafy = c => new THREE.MeshStandardMaterial({ map: TEX.needles, bumpMap: TEX.needles, bumpScale: 0.06, roughness: 1, color: c, flatShading: true });
  const crownMat = leafy(new THREE.Color(0.36, 0.55, 0.24)), crownMat2 = leafy(new THREE.Color(0.5, 0.68, 0.28));
  const trunkG = new THREE.CylinderGeometry(0.18, 0.3, 5, 8); trunkG.translate(0, 2.5, 0);
  const blob = (r, x, y, z, sy = 1) => { const g = new THREE.IcosahedronGeometry(r, 1); g.scale(1, sy, 1); g.translate(x, y, z); return g; };
  const crownG = THREE.BufferGeometryUtils.mergeBufferGeometries([blob(2.0, 0, 5.6, 0, 0.85), blob(1.5, 1.1, 6.6, 0.4, 0.85), blob(1.4, -0.9, 6.3, -0.7, 0.85)]);
  const crownG2 = THREE.BufferGeometryUtils.mergeBufferGeometries([blob(1.2, 0, 5.6, 0, 1.3), blob(0.95, 0.5, 7.0, 0.3, 1.3), blob(0.9, -0.4, 6.6, -0.4, 1.2)]);
  const kinds = [{ n: 160, trunk: treeTrunkMat, crown: crownG, cm: crownMat }, { n: 100, trunk: barkB, crown: crownG2, cm: crownMat2 }];
  for (const K of kinds) {
    const T = new THREE.InstancedMesh(trunkG, K.trunk, K.n), C = new THREE.InstancedMesh(K.crown, K.cm, K.n);
    let n = 0, tries = 0;
    while (n < K.n && tries++ < 5000) {
      const x = srnd(-288, -18), z = srnd(-288, -18); if (!free(x, z, 3)) continue;
      const s = srnd(0.8, 1.25), y = hillH(x, z) - 0.15, ry = srand() * 6;
      place(T, n, x, y, z, s, s * srnd(0.9, 1.2), s, ry); place(C, n, x, y, z, s * srnd(0.9, 1.15), s * srnd(0.9, 1.2), s * srnd(0.9, 1.15), ry);
      treeCollider(x, y - 0.3, z, 0.6 * s, 4.5, 0.6 * s); n++;
    }
    T.count = C.count = n; T.castShadow = C.castShadow = true; C.receiveShadow = true; scene.add(T); scene.add(C);
  }
  // Büsche (Unterholz, man kann hindurchlaufen)
  { const N = 420, B = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ map: TEX.needles, color: new THREE.Color(0.42, 0.6, 0.3), roughness: 1, bumpMap: TEX.needles, bumpScale: 0.05 }), N);
    let n = 0, tries = 0;
    while (n < N && tries++ < 6000) { const x = srnd(-289, -17), z = srnd(-289, -17); if (!free(x, z)) continue;
      const s = srnd(0.6, 1.4); place(B, n++, x, hillH(x, z) + s * 0.25, z, s * srnd(1, 1.6), s * srnd(0.55, 0.8), s * srnd(1, 1.6), srand() * 6); }
    B.count = n; B.receiveShadow = true; scene.add(B); }
  // Steine (größere sind fest)
  { const N = 170, rockM = new THREE.MeshStandardMaterial({ color: 0x7d7b72, roughness: 0.95, flatShading: true }), R = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockM, N);
    let n = 0, tries = 0;
    while (n < N && tries++ < 4000) { const x = srnd(-289, -17), z = srnd(-289, -17); if (!free(x, z)) continue;
      const s = srand() < 0.8 ? srnd(0.25, 0.7) : srnd(0.8, 1.6), y = hillH(x, z);
      place(R, n++, x, y + s * 0.2, z, s * srnd(1, 1.4), s * srnd(0.5, 0.8), s * srnd(1, 1.4), srand() * 6, srand() * 0.5);
      if (s > 0.75) collider(x, y - 0.3, z, s * 1.6, s * 0.9, s * 1.6); }
    R.count = n; R.castShadow = true; R.receiveShadow = true; scene.add(R); }
  // umgefallene Baumstämme (fest), nur auf flachem Boden
  { const N = 34, L = 6, G = new THREE.CylinderGeometry(0.34, 0.4, L, 10), LG = new THREE.InstancedMesh(G, LOG_MAT, N);
    let n = 0, tries = 0;
    while (n < N && tries++ < 3000) { const x = srnd(-286, -20), z = srnd(-286, -20), ax = srand() < 0.5;
      if (!free(x, z, 3) || !free(x + (ax ? 3.5 : 0), z + (ax ? 0 : 3.5), 1) || !free(x - (ax ? 3.5 : 0), z - (ax ? 0 : 3.5), 1)) continue;
      const y = hillH(x, z); if (Math.abs(hillH(x + (ax ? 3 : 0), z + (ax ? 0 : 3)) - y) > 0.3 || Math.abs(hillH(x - (ax ? 3 : 0), z - (ax ? 0 : 3)) - y) > 0.3) continue;
      place(LG, n++, x, y + 0.34, z, 1, 1, 1, 0, ax ? 0 : Math.PI / 2, ax ? Math.PI / 2 : 0);
      collider(x, y, z, ax ? L : 0.8, 0.72, ax ? 0.8 : L); }
    LG.count = n; LG.castShadow = true; scene.add(LG); }
  // See: Sandufer, Schilf, Steg mit Ruderboot
  const sand = pbr('asphalt', 3, { map: tintedTex('asphalt', 0xc4a874), mat: { color: new THREE.Color(1.05, 0.98, 0.86) } });
  { const rg = new THREE.RingGeometry(LR - 1, LR + 3.5, 64, 1), p = rg.attributes.position, uv = rg.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3, p.getY(i) / 3);
    const ring = new THREE.Mesh(withUv2(rg), sand); ring.rotation.x = -Math.PI / 2; ring.position.set(LX, 0.012, LZ); ring.receiveShadow = true; scene.add(ring); }
  { const N = 380, reedG = new THREE.ConeGeometry(0.05, 1.7, 4, 1); reedG.translate(0, 0.85, 0);
    const reed = new THREE.InstancedMesh(reedG, new THREE.MeshStandardMaterial({ color: 0x6f7f3a, roughness: 0.9 }), N);
    let n = 0;
    while (n < N) { const a = srand() * Math.PI * 2; if (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.22) continue;   // am Steg frei
      const cl = srnd(0, 6.28); for (let k = 0; k < 8 && n < N; k++) { const aa = a + srnd(-0.04, 0.04), r = LR + srnd(-2.2, 0.6);
        place(reed, n++, LX + Math.cos(aa) * r, 0, LZ + Math.sin(aa) * r, 1, srnd(0.7, 1.25), 1, cl, srnd(-0.12, 0.12), srnd(-0.12, 0.12)); } }
    scene.add(reed); }
  const jx0 = LX + LR + 3, jx1 = LX + LR - 3.5, jz = LZ;   // Steg ragt nach Westen in den See
  addBox((jx0 + jx1) / 2, 0, jz, jx0 - jx1, 0.35, 1.8, TKM.wood, 2, { round: 0 });
  for (let x = jx1 + 0.3; x <= jx0; x += 2) for (const s of [-1, 1]) addBox(x, -0.3, jz + s * 0.85, 0.16, 0.85, 0.16, TKM.wood, 1, { decor: true, round: 0 });
  { const bx = jx1 + 1.6, bz = jz - 2.0, BW = { decor: true, round: 0 };   // Ruderboot
    addBox(bx, 0.02, bz, 3.4, 0.5, 1.2, TKM.wood, 1, BW); addBox(bx, 0.3, bz, 3.0, 0.24, 0.9, FARM.black, 1, BW); addBox(bx, 0.42, bz, 0.25, 0.08, 1.15, TKM.wood, 1, BW);
    for (const s of [-1, 1]) addBox(bx + 0.2, 0.55, bz + s * 0.75, 2.2, 0.05, 0.08, TKM.wood, 1, BW); }
  // Hütte: Holzstapel, Feuerstelle mit Sitz-Stämmen, Picknicktisch
  const hx = LX + 34, hz = LZ + 18;
  for (let k = 0; k < 3; k++) addBox(hx - 4.3, k * 0.42, hz, 0.9, 0.42, 4.2, TKM.wood, 1, { round: 0.06 });
  { const fx = hx + 9, fz = hz - 7, stoneM = new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: 0.95, flatShading: true });
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), stoneM); st.position.set(fx + Math.cos(a) * 0.9, 0.12, fz + Math.sin(a) * 0.9); st.scale.y = 0.7; scene.add(st); }
    decalT(fx, fz, 1.3, 1.3, FARM.black, 0, 0, 0.02);
    for (let k = 0; k < 3; k++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), LOG_MAT); lg.rotation.z = Math.PI / 2; lg.rotation.y = k; lg.position.set(fx, 0.1, fz); scene.add(lg); }
    for (const [dx, dz, ax] of [[0, 3, true], [3, 0, false]]) {
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 2.4, 10), LOG_MAT); lg.rotation.z = ax ? Math.PI / 2 : 0; lg.rotation.x = ax ? 0 : Math.PI / 2;
      lg.position.set(fx + dx, 0.3, fz + dz); lg.castShadow = true; scene.add(lg); collider(fx + dx, 0, fz + dz, ax ? 2.4 : 0.6, 0.55, ax ? 0.6 : 2.4); } }
  { const px = hx + 8.5, pz = hz + 4.5, W = { round: 0 };
    addBox(px, 0.72, pz, 2.2, 0.08, 0.9, TKM.wood, 1, W);
    for (const s of [-1, 1]) { addBox(px, 0.42, pz + s * 0.85, 2.2, 0.06, 0.3, TKM.wood, 1, { decor: true, round: 0 }); for (const t of [-0.9, 0.9]) addBox(px + t, 0, pz + s * 0.3, 0.1, 0.72, 0.1, TKM.wood, 1, { decor: true, round: 0 }); } }
  // Wegweiser an der Waldkreuzung
  { const sx = -144.5, sz = -144.5, B = { decor: true, round: 0 };
    addBox(sx, 0, sz, 0.14, 2.6, 0.14, TKM.wood, 1, { round: 0 });
    const sgn = (t, y, rot) => { const m = tkSignMat(t, '#6b4a2c', '#f4ecd8', false); m.side = THREE.DoubleSide; tkSign(sx, y, sz, 1.8, 0.4, rot, m); };
    sgn('WALDSEE ↑', 2.35, Math.PI / 2); sgn('GIPFEL ↑', 1.85, 0); sgn('HÜTTE', 1.4, Math.PI / 2 + 0.4); }
}
/* ===== DRIFT-ARENA auf dem Feld im Südosten (x 155 … 292, z 52 … 145) =====
   Rundkurs mit S-Kurven, Haarnadeln, rot-weißen Randsteinen an den Kurven, Reifenstapeln außen
   und einer großen Drift-Fläche mit Donut-Kreis. Die Mittellinie (window.DRIFT_TRACK) nutzt die Rundenzeit. */
function weltDriftArena() {
  const X0 = 160, Z0 = 56, SX = 128 / 497, SZ = 86 / 338, W = 11;
  // Streckenverlauf nach Vorlage (Bild-Pixel → Meter), im Uhrzeigersinn; Start/Ziel auf der langen Geraden oben
  const P = [[140, 38], [260, 35], [380, 45], [440, 72], [462, 140], [452, 235], [412, 293], [330, 305], [270, 282], [240, 232], [228, 182],
    [195, 150], [148, 160], [118, 212], [82, 250], [42, 240], [25, 180], [30, 95], [70, 48]].map(([px, pz]) => new THREE.Vector3(X0 + px * SX, 0, Z0 + pz * SZ));
  const curve = new THREE.CatmullRomCurve3(P, true, 'centripetal');
  const N = 720, L = curve.getLength(), pts = curve.getSpacedPoints(N); pts.pop();
  const { nrm, curv, band } = trackKit({ pts, N, L });
  const seg = L / N;
  const { CURB, LINE } = trackMats();
  const SAND = pbr('asphalt', 3, { map: tintedTex('asphalt', 0xc4a874), mat: { color: new THREE.Color(1.05, 0.98, 0.86) }, normalScale: 1.4 });
  const PAD = pbr('asphalt', 3, { map: tintedTex('asphalt', 0x3c8c84), mat: { color: new THREE.Color(0.85, 1, 0.98), polygonOffset: true, polygonOffsetFactor: -1 } });

  // Untergrund: Sand mit ein paar Grasinseln
  decalT(223.5, 98.5, 137, 93, SAND, 4, 0, 0.007);
  for (const [x, z, w, d] of [[176, 78, 8, 6], [190, 118, 9, 7], [210, 140, 12, 4], [168, 140, 7, 5]]) decalT(x, z, w, d, MAT.grass, 2, 0, 0.009);
  // Asphalt, weiße Randlinien, Randsteine an den Kurven
  band(-W / 2, W / 2, 0.02, MAT.road, 3, 3);
  band(W / 2 - 0.5, W / 2 - 0.35, 0.026, LINE, 0, 0); band(-W / 2 + 0.35, -W / 2 + 0.5, 0.026, LINE, 0, 0);
  const sharp = i => Math.abs(curv[i]) > 1 / 38;
  band(W / 2, W / 2 + 1.3, 0.03, CURB, 2, 0, sharp); band(-W / 2 - 1.3, -W / 2, 0.03, CURB, 2, 0, sharp);
  // Drift-Fläche (türkis) rechts im Innenfeld, mit Donut-Kreis aus Randsteinen und Reifen in der Mitte
  const pcx = X0 + 368 * SX, pcz = Z0 + 172 * SZ, rx = 22.5, rz = 20;
  const pg = new THREE.CircleGeometry(1, 64), pp = pg.attributes.position, puv = pg.attributes.uv;
  for (let i = 0; i < pp.count; i++) { pp.setXY(i, pp.getX(i) * rx, pp.getY(i) * rz); puv.setXY(i, pp.getX(i) / 3, pp.getY(i) / 3); }
  const pad = new THREE.Mesh(withUv2(pg), PAD); pad.rotation.x = -Math.PI / 2; pad.position.set(pcx, 0.018, pcz); pad.receiveShadow = true; scene.add(pad);
  const K = 48, ringPos = [], ringUv = [];
  for (let k = 0; k < K; k++) for (const [a, b, r, u] of [[k, k, 3.6, 0], [k, k, 4.8, 0], [k + 1, k + 1, 3.6, 1], [k, k, 4.8, 0], [k + 1, k + 1, 4.8, 1], [k + 1, k + 1, 3.6, 1]]) {
    const ang = a / K * Math.PI * 2; ringPos.push(pcx + Math.cos(ang) * r, 0.03, pcz - Math.sin(ang) * r); ringUv.push((k + u) / 2, r > 4 ? 1 : 0);
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(ringPos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ringUv, 2)); rg.computeVertexNormals();
  scene.add(new THREE.Mesh(withUv2(rg), CURB));
  const tireStack = (x, z, n) => {
    for (let k = 0; k < n; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.17, 6, 12), TIRE); t.rotation.x = Math.PI / 2; t.position.set(x, 0.17 + k * 0.32, z); t.castShadow = true; scene.add(t); }
    collider(x, 0, z, 1.1, n * 0.32 + 0.1, 1.1);
  };
  tireStack(pcx, pcz, 4);
  // Reifenstapel außen an den engen Kurven (Abstand halten zu anderen Streckenteilen)
  let lastT = -99;
  for (let i = 0; i < N; i++) {
    if (Math.abs(curv[i]) < 1 / 26 || (i - lastT) * seg < 5) continue;
    const s = -Math.sign(curv[i]), x = pts[i].x + nrm[i][0] * s * (W / 2 + 3.2), z = pts[i].z + nrm[i][1] * s * (W / 2 + 3.2);
    let clear = x > 157 && x < 290 && z > 54 && z < 143 && Math.hypot(x - pcx, (z - pcz) * rx / rz) > rx + 2;
    for (let k = 0; clear && k < N; k += 3) if (Math.hypot(pts[k].x - x, pts[k].z - z) < W / 2 + 2.5) clear = false;
    if (clear) { tireStack(x, z, 2); lastT = i; }
  }
  // Start/Ziel: Schachbrett-Linie + Torbogen
  const st = pts[0];
  const chk = document.createElement('canvas'); chk.width = 128; chk.height = 32; const cg = chk.getContext('2d');
  for (let a = 0; a < 16; a++) for (let b = 0; b < 4; b++) { cg.fillStyle = (a + b) % 2 ? '#111' : '#f4f4f4'; cg.fillRect(a * 8, b * 8, 8, 8); }
  const ct = new THREE.CanvasTexture(chk); ct.encoding = THREE.sRGBEncoding;
  decalT(st.x, st.z, W, 1.6, new THREE.MeshStandardMaterial({ map: ct, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }), 0, Math.atan2(-nrm[0][1], nrm[0][0]), 0.032);
  for (const s of [-1, 1]) addBox(st.x + nrm[0][0] * s * (W / 2 + 1.2), 0, st.z + nrm[0][1] * s * (W / 2 + 1.2), 0.5, 6, 0.5, MAT.metal, 1, { round: 0.05 });
  addBox(st.x, 5.6, st.z, 0.5, 0.9, W + 3, MAT.metal, 1, { decor: true, round: 0 });
  for (const s of [-1, 1]) tkSign(st.x + s * 0.27, 6.05, st.z, W + 2, 1.6, s * Math.PI / 2, tkSignMat('🏁 DRIFT-ARENA', '#111111', '#ffd23f', false));
  // Zuschauer-Tribüne an der Startgeraden, Fahnen, Autos zum Losfahren
  addBox(st.x + 16, 0, Z0 - 0.5, 30, 0.6, 3, MAT.concrete, 2); addBox(st.x + 16, 0.6, Z0 - 1.2, 30, 0.6, 1.6, MAT.concrete, 2);
  for (let k = 0; k < 6; k++) { addBox(st.x + 3 + k * 5, 0, Z0 + 1.1, 0.1, 3, 0.1, MAT.metal, 1, { decor: true, round: 0 }); addBox(st.x + 3.5 + k * 5, 2.2, Z0 + 1.1, 0.9, 0.6, 0.03, [MAT.ctrRed, TKM.white][k % 2], 0, { decor: true, round: 0 }); }
  tkSign(X0 - 2.5, 1.6, 96, 6, 1.2, -Math.PI / 2, tkSignMat('DRIFT-ARENA →', '#d42a2a', '#ffffff', false));
  carSpot(st.x - 10, st.z - 2.5, 0, 'drift'); carSpot(st.x - 10, st.z + 2.5, 0, 'race'); carSpot(pcx, pcz + 12, 0, 'drift');
  window.DRIFT_TRACK = { pts: pts.map(p => [p.x, p.z]), W, box: [155, 52, 292, 145], start: [st.x, st.z], name: 'Drift-Arena', key: '' };
  (window.DRIFT_TRACKS = window.DRIFT_TRACKS || []).push(window.DRIFT_TRACK);
}
/* Bausteine für Drift-Strecken: Seitenrichtung, Krümmung und Bänder entlang der Mittellinie */
function trackKit(T) {
  const { pts, N, L } = T, seg = L / N;
  const nrm = pts.map((p, i) => { const a = pts[(i + N - 1) % N], b = pts[(i + 1) % N], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz); return [-dz / l, dx / l]; });
  const curv = nrm.map((_, i) => { const a = nrm[(i + N - 4) % N], b = nrm[(i + 4) % N]; return Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) / (8 * seg); });
  // Band zwischen seitlichem Abstand o0 … o1 (u = Länge / uS, v = Abstand / vS)
  const band = (o0, o1, y, mat, uS, vS, keep) => {
    const pos = [], uv = [];
    for (let i = 0; i < N; i++) {
      if (keep && !keep(i)) continue;
      const j = (i + 1) % N, q = [[i, o0], [i, o1], [j, o0], [j, o1]].map(([k, o]) => [pts[k].x + nrm[k][0] * o, pts[k].z + nrm[k][1] * o]);
      const u0 = i * seg / uS, u1 = (i + 1) * seg / uS, vv0 = vS ? o0 / vS : 0, vv1 = vS ? o1 / vS : 1;
      const Q = [[0, u0, vv0], [1, u0, vv1], [2, u1, vv0], [1, u0, vv1], [3, u1, vv1], [2, u1, vv0]];
      for (const [k, u, v] of Q) { pos.push(q[k][0], y, q[k][1]); uv.push(u, v); }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    const m = new THREE.Mesh(withUv2(g), mat); m.receiveShadow = true; scene.add(m);
  };
  return { nrm, curv, seg, band };
}
let TRACK_MATS = null;
function trackMats() {
  if (TRACK_MATS) return TRACK_MATS;
  const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d');
  for (let k = 0; k < 2; k++) { g.fillStyle = k % 2 ? '#f2f2f2' : '#d42a2a'; g.fillRect(k * 32, 0, 32, 8); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  const chk = document.createElement('canvas'); chk.width = 128; chk.height = 32; const cg = chk.getContext('2d');
  for (let a = 0; a < 16; a++) for (let b = 0; b < 4; b++) { cg.fillStyle = (a + b) % 2 ? '#111' : '#f4f4f4'; cg.fillRect(a * 8, b * 8, 8, 8); }
  const ct = new THREE.CanvasTexture(chk); ct.encoding = THREE.sRGBEncoding;
  return TRACK_MATS = {
    CURB: new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }),
    LINE: new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }),
    CHECK: new THREE.MeshStandardMaterial({ map: ct, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }),
  };
}
/* Drift-Rundkurs zwischen den Hügeln (Wald, Felder): Asphalt mit Randlinien, Schotter-Auslauf, Randsteine und Reifenstapel
   an den engen Kurven, Start-/Zieltor mit Namen und zwei Autos. Die Hügel sind entlang der Strecke flach (H.track). */
function driftTrackBuild(T, name, key, sideMat) {
  const { pts, N } = T, W = 10, { nrm, curv, seg, band } = trackKit(T), { CURB, LINE, CHECK } = trackMats();
  band(-W / 2 - 3, W / 2 + 3, 0.014, sideMat, 3, 3);   // Auslauf (Schotter/Erde)
  band(-W / 2, W / 2, 0.02, MAT.road, 3, 3);
  band(W / 2 - 0.5, W / 2 - 0.35, 0.026, LINE, 0, 0); band(-W / 2 + 0.35, -W / 2 + 0.5, 0.026, LINE, 0, 0);
  const sharp = i => Math.abs(curv[i]) > 1 / 32;
  band(W / 2, W / 2 + 1.3, 0.03, CURB, 2, 0, sharp); band(-W / 2 - 1.3, -W / 2, 0.03, CURB, 2, 0, sharp);
  const tireStack = (x, z, n) => {
    const y = hillH(x, z);
    for (let k = 0; k < n; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.17, 6, 12), TIRE); t.rotation.x = Math.PI / 2; t.position.set(x, y + 0.17 + k * 0.32, z); t.castShadow = true; scene.add(t); }
    collider(x, y, z, 1.1, n * 0.32 + 0.1, 1.1);
  };
  let lastT = -99;
  for (let i = 0; i < N; i++) {
    if (Math.abs(curv[i]) < 1 / 22 || (i - lastT) * seg < 6) continue;
    const s = -Math.sign(curv[i]), x = pts[i].x + nrm[i][0] * s * (W / 2 + 3.4), z = pts[i].z + nrm[i][1] * s * (W / 2 + 3.4);
    let clear = true;
    for (let k = 0; clear && k < N; k += 2) if (Math.hypot(pts[k].x - x, pts[k].z - z) < W / 2 + 2.5) clear = false;
    if (clear) { tireStack(x, z, 2); lastT = i; }
  }
  // Start/Ziel
  const st = pts[0], dx = pts[2].x - pts[0].x, dz = pts[2].z - pts[0].z, dl = Math.hypot(dx, dz), fx = dx / dl, fz = dz / dl;
  decalT(st.x, st.z, W, 1.6, CHECK, 0, Math.atan2(-nrm[0][1], nrm[0][0]), 0.032);
  for (const s of [-1, 1]) addBox(st.x + nrm[0][0] * s * (W / 2 + 1.2), 0, st.z + nrm[0][1] * s * (W / 2 + 1.2), 0.5, 6, 0.5, MAT.metal, 1, { round: 0.05 });
  addBox(st.x, 5.6, st.z, 0.5, 0.9, W + 3, MAT.metal, 1, { decor: true, round: 0 });
  for (const s of [-1, 1]) tkSign(st.x + s * 0.27, 6.05, st.z, W + 2, 1.6, s * Math.PI / 2, tkSignMat('🏁 ' + name.toUpperCase(), '#111111', '#ffd23f', false));
  const yaw = Math.atan2(-fz, fx);
  for (const s of [-1, 1]) carSpot(st.x - fx * 10 + nrm[0][0] * s * 3.7, st.z - fz * 10 + nrm[0][1] * s * 3.7, yaw, s < 0 ? 'drift' : 'muscle');   // am Rand, Mitte bleibt frei
  const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
  (window.DRIFT_TRACKS = window.DRIFT_TRACKS || []).push({ pts: pts.map(p => [p.x, p.z]), W, name, key, start: [st.x, st.z],
    box: [Math.min(...xs) - 12, Math.min(...zs) - 12, Math.max(...xs) + 12, Math.max(...zs) + 12] });
}

// Hügel-Gebiet anlegen (max. Höhe wird für die Schuss-Prüfung gemessen)
function addHillRegion(H) {
  H.max = 0; HILLS.push(H); HILL = true;
  for (let x = H.x0; x <= H.x1; x += 2) for (let z = H.z0; z <= H.z1; z += 2) H.max = Math.max(H.max, hillRegionH(H, x, z));
}
// Boden-Netz über einem Rechteck: folgt den Hügeln; wo es flach ist, liegt es unter dem normalen Boden (dort sieht man Straßen/Felder)
function hillMeshRect(x0, x1, z0, z1, mat, tile, S = 2) {
  const nx = Math.max(1, Math.round((x1 - x0) / S)), nz = Math.max(1, Math.round((z1 - z0) / S)), pos = [], uv = [], idx = [];
  let any = false;
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= nx; j++) {
    const x = x0 + (x1 - x0) * j / nx, z = z0 + (z1 - z0) * i / nz, h = hillH(x, z);
    if (h > 0.02) any = true;
    pos.push(x, h > 0.02 ? h + 0.03 : -0.08, z); uv.push(x / tile, -z / tile);
  }
  if (!any) return;
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) { const a = i * (nx + 1) + j, b = a + nx + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(withUv2(g), mat); m.receiveShadow = true; scene.add(m);
}
/* ======================= Erweiterung der Karte „Welt“: Ring 300–380 m + Berge 380–440 m =======================
   Ringstraße (345 m), Industriegebiet (Norden), Windpark (Osten), Weiler mit Kapelle (Süden), Campingplatz am Teich (Westen),
   Wälder und Wiesen dazwischen; in den Bergen Wald und Almhütten. */
window.WINDMILLS = [];   // drehende Teile (Windräder, Windmühle) – werden in cullChunks gedreht
const noMergeDeep = o => o.traverse(c => { if (c.isMesh) c.userData.noMerge = true; });
// Almhütte am Hang: Steinsockel bis in den Boden, Holzwände, Satteldach, Schornstein, Bank
function almHut(x, z, rot = 0) {
  const y = hillH(x, z), w = 7, d = 5.5, ax = Math.abs(Math.sin(rot)) > 0.5;
  const W = ax ? d : w, D = ax ? w : d;
  addBox(x, y - 3, z, W + 0.4, 3.6, D + 0.4, TKM.stone, 2, { round: 0 });
  addBox(x, y + 0.6, z, W, 2.8, D, TKM.wood, 2, { round: 0 });
  const rise = 2.2, roof = MAT.roof;
  for (const s of [1, -1]) {
    const run = (ax ? W : D) / 2 + 0.6, slope = Math.hypot(run, rise), ang = Math.atan2(rise, run);
    const r = new THREE.Mesh(boxGeo(ax ? slope : W + 0.8, 0.18, ax ? D + 0.8 : slope, 2.5), roof);
    if (ax) { r.position.set(x + s * run / 2, y + 3.4 + rise / 2, z); r.rotation.z = -s * ang; } else { r.position.set(x, y + 3.4 + rise / 2, z + s * run / 2); r.rotation.x = s * ang; }
    r.castShadow = true; scene.add(r);
  }
  addBox(x + (ax ? 0 : W / 4), y + 3.4, z + (ax ? D / 4 : 0), 0.6, 2.4, 0.6, TKM.stone, 1, { decor: true, round: 0 });
  // Fenster/Tür als dunkle Flächen auf der Vorderseite
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.1), MAT.door);
  if (ax) { front.position.set(x + W / 2 + 0.01, y + 1.65, z); front.rotation.y = Math.PI / 2; } else { front.position.set(x, y + 1.65, z + D / 2 + 0.01); }
  scene.add(front);
}
// Windrad: Turm, Gondel, Nabe, 3 Flügel (drehen sich)
function windTurbine(x, z, face) {
  const white = TKM.white, h = 44;
  const tower = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(0.9, 1.5, h, 16)), white); tower.position.set(x, h / 2, z); tower.castShadow = true; scene.add(tower);
  collider(x, 0, z, 2.6, h, 2.6);
  addBox(x, h - 0.6, z, 5, 2.4, 2.4, white, 1, { decor: true, round: 0.3, rotY: face });
  const rotor = new THREE.Group(); rotor.position.set(x + Math.cos(face) * 2.8, h + 0.6, z - Math.sin(face) * 2.8); rotor.rotation.y = face; scene.add(rotor);
  const spin = new THREE.Group(); rotor.add(spin);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), white); hub.scale.x = 1.3; spin.add(hub);
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(boxGeo(0.25, 19, 1.0, 0), white); b.position.y = 9.6; const arm = new THREE.Group(); arm.rotation.x = k * Math.PI * 2 / 3; arm.add(b); spin.add(arm); }
  noMergeDeep(rotor); window.WINDMILLS.push({ o: spin, axis: 'x', s: 0.9 + srand() * 0.4 });
}
// Zelt (Satteldachform) und Wohnwagen
function tent(x, z, col, rot = 0) {
  const g = new THREE.Shape(); g.moveTo(-1.3, 0); g.lineTo(1.3, 0); g.lineTo(0, 1.6); g.closePath();
  const geo = new THREE.ExtrudeGeometry(g, { depth: 2.8, bevelEnabled: false }); geo.translate(0, 0, -1.4);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, side: THREE.DoubleSide })); m.position.set(x, 0, z); m.rotation.y = rot; m.castShadow = true; scene.add(m);
  collider(x, 0, z, 2.8, 1.5, 2.8);
}
function caravan(x, z) {
  addBox(x, 0.5, z, 6, 2.4, 2.3, TKM.white, 2, { round: 0.25 });
  addBox(x, 1.6, z + 1.16, 3.5, 0.7, 0.04, MAT.dark, 1, { decor: true, round: 0 });
  addBox(x - 1.5, 2.2, z, 2.5, 0.08, 2.3, MAT.ctrOrange, 1, { decor: true, round: 0 });
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 14), TIRE); w.rotation.x = Math.PI / 2; w.position.set(x + 0.5, 0.35, z + s * 1.15); scene.add(w); }
}
// Industriehalle mit Rolltoren und Firmenschild
function hall(x, z, w, d, h, name, doorSide) {
  addBox(x, 0, z, w, h, d, MAT.hallMetal, 2.6, { round: 0 });
  addBox(x, h, z, w + 0.6, 0.5, d + 0.6, MAT.dark, 1, { decor: true, round: 0 });
  const fz = z + doorSide * (d / 2 + 0.02);
  for (let k = 0; k < 3; k++) { const door = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.5), MAT.dark); door.position.set(x - w / 3 + k * w / 3, 2.25, fz); door.rotation.y = doorSide > 0 ? 0 : Math.PI; scene.add(door); }
  tkSign(x, h - 1.2, fz + doorSide * 0.02, Math.min(w - 4, 14), 1.4, doorSide > 0 ? 0 : Math.PI, tkSignMat(name, '#1f3b5c', '#ffffff', false));
}
function weltRing(road, S) {
  const R = 345, O = 378;   // Ringstraße, Beginn der Berge
  for (const [x0, z0, x1, z1] of [[-R, -R, R, -R], [-R, R, R, R], [-R, -R, -R, R], [R, -R, R, R]]) road(x0, z0, x1, z1, 9);
  window.MAP_STREETS.push([-R - 4.5, -R - 4.5, R + 4.5, -R + 4.5], [-R - 4.5, R - 4.5, R + 4.5, R + 4.5], [-R - 4.5, -R - 4.5, -R + 4.5, R + 4.5], [R - 4.5, -R - 4.5, R + 4.5, R + 4.5], [-6.5, -S, 6.5, S], [-S, -6.5, WELT_XE, 6.5]);
  const busy = [];   // belegte Flächen (keine Bäume)
  const reserve = (x0, z0, x1, z1) => busy.push([x0, z0, x1, z1]);
  const isBusy = (x, z, pad = 0) => busy.some(([a, b, c, d]) => x > a - pad && x < c + pad && z > b - pad && z < d + pad);
  // Straßen und Ringstraße frei halten
  reserve(-8, -S, 8, S); reserve(-S, -10, WELT_XE, 10);
  for (const s of [-1, 1]) { reserve(-R - 7, s * R - 7, R + 7, s * R + 7); reserve(s * R - 7, -R - 7, s * R + 7, R + 7); }

  /* --- Industriegebiet (Norden über der Stadt): Hallen, Container, Lkw --- */
  const names = ['LOGISTIK NORD', 'SPEDITION KRAUSE', 'METALLBAU', 'GETRÄNKE-GROSSHANDEL', 'BAUSTOFFE', 'KÜHLHAUS', 'RECYCLING', 'AUTOTEILE'];
  let ni = 0;
  for (const x of [70, 125, 180, 235, 290]) { hall(x, -365, 40, 22, 9, names[ni++ % names.length], 1); reserve(x - 22, -378, x + 22, -352); }
  for (const x of [85, 150, 215, 275]) { hall(x, -322, 34, 24, 8, names[ni++ % names.length], -1); reserve(x - 19, -336, x + 19, -306); }
  const ctr = [MAT.ctrRed, MAT.ctrBlue, MAT.ctrGreen, MAT.ctrOrange];
  for (const [x, z] of [[110, -322], [175, -322], [240, -322], [93, -365], [148, -365], [203, -365], [258, -365]]) {   // Containerstapel in den Lücken zwischen den Hallen
    for (let k = 0; k < 3; k++) addBox(x + k * 2.6, 0, z, 2.4, 2.6, 6, ctr[(k + x) % 4], 2.6, { round: 0.05 });
    addBox(x + 2.6, 2.6, z, 2.4, 2.6, 6, ctr[(x + 1) % 4], 2.6, { round: 0.05 });
  }
  truck(152, -340.8, false); truck(262, -349.2, false);

  /* --- Windpark (Osten) --- */
  for (const z of [-290, -60, 90, 230]) { windTurbine(1068, z, Math.PI); reserve(1060, z - 6, 1076, z + 6); }   // auf den Ost-Bergen
  weltRingstadt(road, reserve);   // Stadtteil zwischen Ringstraße und F1-Ring / Flughafen

  /* --- Weiler mit Kapelle (Süden) --- */
  const mats = [MAT.plaster, MAT.plaster2, MAT.brick];
  for (let x = -235; x <= 235; x += 34) {
    if (Math.abs(x) < 22) continue;
    house(x, 330, 10, 8, 4, mats[Math.floor(srand() * 3)]); reserve(x - 8, 322, x + 8, 340);
    hedge(x, 338, 9, 0.8); leafTree(x + 7, 324, 0.8);
  }
  { const cx = 60, cz = 366;   // Kapelle
    addBox(cx, 0, cz, 7, 6, 12, MAT.plaster, 2.7); addBox(cx, 0, cz - 7.5, 3.4, 13, 3.4, MAT.plaster, 2.7);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5, 4), TKM.roofTile); sp.position.set(cx, 15.5, cz - 7.5); sp.rotation.y = Math.PI / 4; scene.add(sp);
    for (const s of [1, -1]) { const r = new THREE.Mesh(boxGeo(0.15, 4.6, 12.6, 2.5), MAT.roof); r.position.set(cx + s * 1.9, 7.2, cz); r.rotation.z = s * 0.95; scene.add(r); }
    reserve(cx - 6, cz - 11, cx + 6, cz + 8); }
  const field = hex => pbr('grass', 4, { map: tintedTex('grass', hex), mat: { color: new THREE.Color(1, 1, 1) } });
  const crops = [field(0xcfae55), field(0xd9cf3a), field(0x7aa645)];
  for (const [x0, x1] of [[-240, -130], [-110, -20], [90, 200], [215, 300]]) {
    decalT((x0 + x1) / 2, 364, x1 - x0, 24, crops[Math.floor(srand() * 3)], 4, 0, 0.007); reserve(x0, 352, x1, 377);
    railFence(x0, 351, x1, 351);
  }

  /* --- Campingplatz am Teich (Westen) --- */
  { const px = -362, pz = -130, pr = 14;
    const pond = new THREE.Mesh(new THREE.CircleGeometry(pr, 40), TKM.water); pond.rotation.x = -Math.PI / 2; pond.position.set(px, 0.03, pz); pond.userData.noMerge = true; scene.add(pond);
    for (let gx = -pr + 4; gx < pr; gx += 7) for (let gz = -pr + 4; gz < pr; gz += 7) if (Math.hypot(gx, gz) < pr - 4) collider(px + gx, 0, pz + gz, 7.5, 3, 7.5);
    reserve(px - pr - 3, pz - pr - 3, px + pr + 3, pz + pr + 3);
    const cols = [0xd8432a, 0x2e7dd6, 0x3fa34d, 0xf2b81f, 0x8e44ad];
    let k = 0;
    for (let z = -80; z <= 80; z += 16) { if (Math.abs(z) < 12) continue; tent(-326, z, cols[k++ % 5], srand() * 6); }
    for (const z of [-100, 100]) caravan(-320, z);
    reserve(-340, -110, -306, 110);
    tkSign(-341.1, 2.2, -14, 5, 1, -Math.PI / 2, tkSignMat('⛺ CAMPING', '#2e6b3a', '#ffffff', false));
    addBox(-341, 0, -14, 0.15, 2.4, 0.15, TKM.wood, 1, { round: 0 }); }

  /* --- Wälder im Ring und in den Bergen (instanziert, mit Stamm-Kollision) --- */
  const TN = 1500, td = new THREE.Object3D();
  const leafM = new THREE.MeshLambertMaterial({ map: TEX.needles, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(0.72, 0.84, 0.66), emissive: new THREE.Color(0.07, 0.12, 0.05), emissiveMap: TEX.needles });
  // vier Streifen (Nord/Süd/West/Ost) → weit entfernte Streifen werden ausgeblendet (cullChunks)
  const stripOf = (x, z) => x > 520 ? 4 : Math.abs(z) >= Math.abs(x) ? (z < 0 ? 0 : 1) : (x < 0 ? 2 : 3);   // 4 = neues Gebiet im Osten
  const strips = [0, 1, 2, 3, 4].map(() => ({ t: new THREE.InstancedMesh(trunkGeo, treeTrunkMat, TN), l: layerGeos.map(g => new THREE.InstancedMesh(g, leafM, TN)), n: 0 }));
  let placed = 0, tries = 0;
  while (placed < TN && tries++ < 40000) {
    const x = srnd(-S + 4, WELT_XE - 4), z = srnd(-S + 4, S - 4), e = window.mapEdge(x, z);   // e: Abstand zum flachen Inneren (Ring ab -8, Berge ab 66)
    if (e < -8 || isBusy(x, z, 2)) continue;
    if (x > 500 && (e < 30 || trackDist(x, z) < 16)) continue;   // Osten: F1-Strecke und Flughafen frei lassen
    const y = hillH(x, z); if (y > 45) continue;
    // im flachen Ring lichter (Wiesen bleiben), in den Bergen dichter
    if (e < 66 && srand() < 0.45) continue;
    const s = srnd(0.85, 1.4), st = strips[stripOf(x, z)];
    td.position.set(x, y - 0.15, z); td.scale.set(s, s * srnd(0.9, 1.25), s); td.rotation.y = srand() * 6; td.updateMatrix();
    st.t.setMatrixAt(st.n, td.matrix); for (const l of st.l) l.setMatrixAt(st.n, td.matrix);
    st.n++; treeCollider(x, y - 0.3, z, 0.6 * s, 4.3, 0.6 * s); placed++;
  }
  for (const st of strips) { st.t.count = st.n; scene.add(st.t); for (const l of st.l) { l.count = st.n; scene.add(l); } }   // ohne eigenen Schatten (spart viel Grafikleistung)

  /* --- Gras: Büschel auf Wiesen, im Wald, auf den Hügeln (nicht auf Straßen, in Stadt/Dorf, Strecken, See) --- */
  { const bg = (() => {
      const g1 = new THREE.PlaneGeometry(0.8, 0.5); g1.translate(0, 0.25, 0);
      const g2 = g1.clone(); g2.rotateY(Math.PI / 2);
      return THREE.BufferGeometryUtils.mergeBufferGeometries([g1, g2]);
    })();
    const NG = 7000, gi = window.grassI = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial({ map: TEX.blades, alphaTest: 0.45, side: THREE.DoubleSide, color: new THREE.Color(0.75, 0.95, 0.55), emissive: new THREE.Color(0.16, 0.26, 0.07), emissiveMap: TEX.blades }), NG);   // leicht selbstleuchtend: Rückseiten sonst schwarz
    const blocked = (x, z) => Math.abs(x) < 8 || Math.abs(z) < 8 || Math.abs(Math.abs(x) - 150) < 5 || Math.abs(Math.abs(z) - 150) < 5 || (x > 26 && x < 294 && z > -294 && z < -26) || (x < -26 && x > -294 && z > 26 && z < 294)
      || (x > 153 && x < 294 && z > 50 && z < 147) || (x > 6 && x < 48 && z > 6 && z < 48) || Math.hypot(x + 205, z + 95) < 30 || trackDist(x, z) < 8 || isBusy(x, z, 1)
      || (x > 188 && x < 276 && z > 182 && z < 242);
    let n = 0, tries = 0;
    while (n < NG && tries++ < 40000) {
      const x = srnd(-400, 400), z = srnd(-400, 400); if (blocked(x, z)) continue;
      const y = hillH(x, z); if (y > 40) continue;
      const s = srnd(1.0, 1.9);
      td.position.set(x, y - 0.03, z); td.scale.set(s, s * srnd(0.8, 1.3), s); td.rotation.set(0, srand() * 6, 0); td.updateMatrix(); gi.setMatrixAt(n++, td.matrix);
    }
    gi.count = n; gi.receiveShadow = true; scene.add(gi); }   // Sichtbarkeit je nach Grafikstufe: applyGfx

  /* --- Almhütten in den Bergen (bebaut) --- */
  for (const [x, z, r] of [[-250, -400, 0], [120, -405, 0], [640, -410, 0], [900, 408, 0], [1070, -150, Math.PI / 2], [230, 402, 0], [-160, 404, 0], [-404, 210, Math.PI / 2], [-408, -90, Math.PI / 2]]) almHut(x, z, r);
}
// Waffen zum Aufsammeln auf der Karte „Welt“ (vorab festgelegt, damit dort keine Häuser gebaut werden)
const WELT_PICKS = [
  { w: 0, x: 10, y: 0, z: -14 }, { w: 1, x: -14, y: 0, z: 10 }, { w: 0, x: 70, y: 0, z: -50 }, { w: 2, x: 130, y: 0, z: -150 }, { w: 1, x: 190, y: 0, z: -130 },
  { w: 0, x: 250, y: 0, z: -250 }, { w: 2, x: 70, y: 6.4, z: -68 }, { w: 0, x: -75, y: 0, z: 68 }, { w: 1, x: -145, y: 0, z: 177 }, { w: 0, x: -215, y: 0, z: 192 },
  { w: 2, x: -95, y: 4, z: -230 }, { w: 0, x: -170, y: 0, z: -95 }, { w: 1, x: -150, y: 0, z: -200 }, { w: 0, x: 205, y: 0, z: 180 }, { w: 1, x: 100, y: 0, z: 80 },
  { w: 2, x: 230, y: 0, z: 240 }, { w: 0, x: 24, y: 0, z: 24 }, { w: 1, x: -250, y: 0, z: 30 }, { w: 2, x: -226, y: 0, z: -232 },
];
/* ======================= Osten der Karte „Welt“ (hinter dem Bergrücken, x 500 … 1040) =======================
   Norden: großer Formel-1-Ring (~2,6 km) mit Boxengasse, Tribünen, Startampel, Kiesbetten und Reifenstapeln.
   Süden: Flughafen mit Start- und Landebahn, Rollweg, Vorfeld, Terminal, Tower, Hangar und Flugzeugen. */
const EAST_METAL = new THREE.MeshStandardMaterial({ color: 0xb4b9c0, roughness: 0.45, metalness: 0.55 });   // Dächer, Hangar, Fluggastbrücken (silbergrau)
// Tribüne: Stufen aus Beton mit farbigen Sitzreihen, Dach auf Stützen; face = Blickrichtung (+1/-1), alongX = Länge entlang x
function grandstand(x, z, len, alongX, face, rows = 9) {
  const seats = [MAT.ctrRed, TKM.white, MAT.ctrBlue], D = rows * 0.9, H = rows * 0.5 + 3.6;
  for (let r = 0; r < rows; r++) {
    const off = -face * (r * 0.9 + 0.45), h = 0.5 + r * 0.5;
    if (alongX) { addBox(x, 0, z + off, len, h, 0.9, MAT.concrete, 2, { round: 0 }); addBox(x, h, z + off + face * 0.15, len, 0.14, 0.4, seats[r % 3], 1, { decor: true, round: 0 }); }
    else { addBox(x + off, 0, z, 0.9, h, len, MAT.concrete, 2, { round: 0 }); addBox(x + off + face * 0.15, h, z, 0.4, 0.14, len, seats[r % 3], 1, { decor: true, round: 0 }); }
  }
  const bx = alongX ? x : x - face * D, bz = alongX ? z - face * D : z;
  if (alongX) addBox(x, H, z - face * D / 2, len + 1, 0.3, D + 2, EAST_METAL, 2, { decor: true, round: 0 });
  else addBox(x - face * D / 2, H, z, D + 2, 0.3, len + 1, EAST_METAL, 2, { decor: true, round: 0 });
  for (let t = -len / 2 + 2; t <= len / 2 - 2; t += 12) addBox(alongX ? x + t : bx, 0, alongX ? bz : z + t, 0.4, H, 0.4, MAT.metal, 1, { round: 0 });
}
function weltF1(road) {
  // Streckenverlauf (im Uhrzeigersinn von oben gesehen): lange Start-Ziel-Gerade, schnelle Kurven im Osten,
  // Gegengerade im Norden, Schikane, Haarnadel, schnelle Diagonale, kurvige Westseite
  const T = driftLoop([[700, -75], [920, -75], [975, -90], [995, -140], [985, -200], [1000, -260], [990, -320], [950, -350], [880, -345], [800, -350],
    [740, -330], [720, -290], [760, -250], [800, -230], [830, -200], [820, -160], [780, -150], [720, -190], [670, -240], [620, -300], [575, -340],
    [535, -320], [525, -260], [545, -200], [530, -140], [540, -95], [565, -78], [610, -75]]);
  addTrackPts(T.pts);
  const { pts, N } = T, W = 14, { nrm, curv, band } = trackKit(T), { CURB, LINE, CHECK } = trackMats();
  const GRAVEL = pbr('asphalt', 3, { map: tintedTex('asphalt', 0xc9b48a), mat: { color: new THREE.Color(1.08, 1.02, 0.92) }, normalScale: 1.5 });
  const RUNOFF = pbr('asphalt', 3, { map: tintedTex('asphalt', 0x8a8c90), mat: { color: new THREE.Color(1.1, 1.1, 1.1) } });
  band(-W / 2 - 3, W / 2 + 3, 0.016, RUNOFF, 3, 3);
  band(-W / 2, W / 2, 0.02, MAT.road, 3, 3);
  band(W / 2 - 0.6, W / 2 - 0.35, 0.026, LINE, 0, 0); band(-W / 2 + 0.35, -W / 2 + 0.6, 0.026, LINE, 0, 0);
  const STANDS = [[655, -100, 865, -84], [1006, -215, 1030, -125], [770, -116, 830, -100]];   // Tribünen (dort keine Reifenstapel)
  const turn = i => Math.abs(curv[i]) > 1 / 90;
  band(W / 2, W / 2 + 1.6, 0.03, CURB, 2, 0, turn); band(-W / 2 - 1.6, -W / 2, 0.03, CURB, 2, 0, turn);
  band(W / 2 + 3, W / 2 + 16, 0.014, GRAVEL, 4, 4, i => curv[i] < -1 / 70); band(-W / 2 - 16, -W / 2 - 3, 0.014, GRAVEL, 4, 4, i => curv[i] > 1 / 70);   // Kiesbett außen
  // Reifenstapel (rot-weiß) hinter den Kiesbetten
  let last = -99;
  for (let i = 0; i < N; i++) {
    if (Math.abs(curv[i]) < 1 / 70 || i - last < 4) continue;
    const s = -Math.sign(curv[i]), o = W / 2 + 17, x = pts[i].x + nrm[i][0] * s * o, z = pts[i].z + nrm[i][1] * s * o;
    let clear = z > -372 && z < -20 && x > 505 && x < 1030 && !STANDS.some(([a, b, c, d]) => x > a && x < c && z > b && z < d);
    for (let k = 0; clear && k < N; k += 3) if (Math.hypot(pts[k].x - x, pts[k].z - z) < W / 2 + 6) clear = false;
    if (!clear) continue;
    addBox(x, 0, z, 1.3, 1.0, 4.4, (i >> 2) % 2 ? MAT.ctrRed : TKM.white, 1, { decor: true, round: 0.25, rotY: Math.atan2(nrm[i][1], -nrm[i][0]) });
    collider(x, 0, z, 2.6, 1.0, 2.6); last = i;
  }
  // Start/Ziel, Startampel, Startaufstellung
  const st = pts[0];
  decalT(st.x, st.z, W, 1.6, CHECK, 0, -Math.PI / 2, 0.032);
  for (const s of [-1, 1]) addBox(st.x, 0, st.z + s * (W / 2 + 2), 0.7, 7.5, 0.7, MAT.metal, 1, { round: 0.05 });
  addBox(st.x, 7.0, st.z, 1.0, 1.4, W + 5, MAT.dark, 1, { decor: true, round: 0 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a1a, emissiveIntensity: 1.6 });
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) addBox(st.x + s * 0.52, 7.25, st.z - 2.4 + k * 1.2, 0.06, 0.7, 0.7, lamp, 0, { decor: true, round: 0 });
  for (const s of [-1, 1]) tkSign(st.x + s * 0.53, 9.1, st.z, W + 4, 1.8, s * Math.PI / 2, tkSignMat('KAMPFZONE GRAND PRIX', '#111111', '#ffffff', false));
  for (let k = 0; k < 10; k++) {   // Startplätze (weiße Winkel), versetzt
    const gx = st.x - 12 - k * 8, gz = st.z + (k % 2 ? 3.2 : -3.2);
    decalT(gx, gz, 0.3, 3.6, LINE, 0, 0, 0.03); decalT(gx - 0.9, gz, 1.8, 0.3, LINE, 0, 0, 0.03);
  }
  for (let k = 0; k < 4; k++) carSpot(st.x - 14 - k * 8, st.z + (k % 2 ? 3.2 : -3.2), 0, 'f1');
  // Boxengasse (südlich der Geraden), Boxenmauer, Garagen mit Toren, Rennleitung
  const PZ = -54;
  decalT(760, PZ, 320, 10, MAT.road, 3, 0, 0.012);
  for (const [x0, x1] of [[560, 600], [920, 960]]) decalT((x0 + x1) / 2, -63.5, x1 - x0, 10, MAT.road, 3, 0, 0.011);   // Ein- und Ausfahrt
  decalT(760, PZ - 4.7, 320, 0.25, LINE, 0, 0, 0.02); decalT(760, PZ + 4.7, 320, 0.25, LINE, 0, 0, 0.02);
  addBox(760, 0, -64, 300, 1.1, 0.6, MAT.concrete, 2, { round: 0 });
  for (let x = 615; x <= 905; x += 10) addBox(x, 1.1, -64, 0.12, 2.4, 0.12, MAT.metal, 1, { decor: true, round: 0 });   // Zaun auf der Boxenmauer
  addBox(760, 2.0, -64, 300, 0.06, 0.06, MAT.metal, 1, { decor: true, round: 0 }); addBox(760, 3.4, -64, 300, 0.06, 0.06, MAT.metal, 1, { decor: true, round: 0 });
  decalT(760, -47, 320, 4, MAT.concreteFloor, 2.7, 0, 0.011);
  addBox(760, 0, -37, 300, 8, 16, MAT.plaster2, 2.5, { round: 0 });
  addBox(760, 8, -37, 302, 0.4, 18, MAT.dark, 1, { decor: true, round: 0 });
  const TEAMC = ['#c8102e', '#1a2a6c', '#ff8000', '#00a19c', '#2b2b2b', '#f2f2f2', '#0a5c2b', '#ffd21f', '#6a1b9a', '#d81b60'];
  for (let k = 0; k < 10; k++) {
    const gx = 625 + k * 30, door = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), MAT.dark); door.position.set(gx, 2.5, -44.97); door.rotation.y = Math.PI; scene.add(door);
    tkSign(gx, 6.2, -44.95, 9, 1.4, Math.PI, tkSignMat('BOX ' + (k + 1), TEAMC[k], k === 5 || k === 7 ? '#111111' : '#ffffff', false));
  }
  tkSign(760, 10.5, -45.9, 40, 3, Math.PI, tkSignMat('🏁 FORMEL-1-RING', '#111111', '#ffd23f', false));
  carSpot(745, PZ, 0, 'f1'); carSpot(835, PZ, 0, 'f1'); carSpot(790, PZ, 0, 'race');
  road(580, 6.5, 580, -49, 9);   // Zufahrt von der Hauptstraße ins Fahrerlager
  // Tribünen: gegenüber der Boxengasse, an der ersten Kurve, an der Haarnadel
  grandstand(760, -88, 200, true, 1, 10);
  grandstand(1018, -170, 80, false, -1, 8);
  grandstand(800, -112, 50, true, -1, 7);
  // Werbetafeln an der Geraden
  const ads = [['TURBO', '#ffd21f', '#111'], ['APEX OIL', '#c8102e', '#fff'], ['GRIP', '#111', '#ffd21f'], ['NITRO', '#1a2a6c', '#fff']];
  for (let k = 0; k < 8; k++) { const a = ads[k % 4]; tkSign(640 + k * 34, 0.7, -85.6, 20, 1.2, 0, tkSignMat(a[0], a[1], a[2], false)); }
  const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
  (window.DRIFT_TRACKS = window.DRIFT_TRACKS || []).push({ pts: pts.map(p => [p.x, p.z]), W, name: 'Formel-1-Ring', key: 'f1', start: [st.x, st.z],
    box: [Math.min(...xs) - 14, Math.min(...zs) - 14, Math.max(...xs) + 14, Math.max(...zs) + 14] });
  window.MAP_STREETS.push([600, PZ - 5, 920, PZ + 5], [575.5, -49, 584.5, 6.5]);
}
// Verkehrsflugzeug (vorne = +x, ~37 m lang, 34 m Spannweite); s = Maßstab (Privatjet kleiner)
function airliner(x, z, rot, col, s = 1) {
  const g = new THREE.Group(), white = TKM.white, tail = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.2 });
  const add = (geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); };
  add(new THREE.CylinderGeometry(2, 2, 26, 20), white, 0, 3.4, 0, 0, 0, Math.PI / 2);
  const nose = new THREE.SphereGeometry(2, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2); add(nose, white, 13, 3.4, 0, 0, 0, -Math.PI / 2); g.children[1].scale.y = 2.0;
  add(new THREE.ConeGeometry(2, 9, 20), white, -17.5, 3.8, 0, 0, 0, Math.PI / 2); g.children[2].scale.set(1, 1, 0.85);
  add(new THREE.BoxGeometry(22, 0.5, 4.06), MAT.dark, 0.5, 4.3, 0); g.children[3].scale.y = 0.6;   // Fensterband
  add(new THREE.BoxGeometry(1.2, 0.7, 2.6), MAT.dark, 13.6, 4.4, 0, 0, 0, 0.5);                   // Cockpitscheiben
  add(new THREE.BoxGeometry(26, 0.3, 4.1), tail, 0.5, 2.6, 0);                                     // Zierstreifen
  for (const sd of [-1, 1]) {
    add(new THREE.BoxGeometry(7, 0.45, 16), white, -3, 2.3, sd * 9, 0, -sd * 0.5, 0);              // Flügel (gepfeilt)
    add(new THREE.CylinderGeometry(1.1, 1.0, 4.4, 16), tail, 1.6, 1.3, sd * 6.5, 0, 0, Math.PI / 2);   // Triebwerk
    add(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 16), MAT.dark, 3.85, 1.3, sd * 6.5, 0, 0, Math.PI / 2);
    add(new THREE.BoxGeometry(3.2, 0.25, 6), white, -16.5, 4.4, sd * 3.6, 0, -sd * 0.45, 0);       // Höhenleitwerk
    add(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 12), TIRE, -2, 0.55, sd * 2.6, Math.PI / 2, 0, 0);
  }
  add(new THREE.BoxGeometry(5.5, 7.5, 0.35), tail, -16.5, 8.2, 0, 0, 0, 0.42);                    // Seitenleitwerk
  add(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 12), TIRE, 10, 0.45, 0, Math.PI / 2, 0, 0);
  add(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8), MAT.metal, 10, 1.3, 0);
  g.scale.setScalar(s); g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  const along = Math.abs(Math.sin(rot)) > 0.5;   // Rumpf entlang z?
  collider(x, 0, z, along ? 4.2 * s : 36 * s, 5.6 * s, along ? 36 * s : 4.2 * s);
  collider(x - (along ? 0 : 3 * s * Math.cos(rot)), 1.8 * s, z + (along ? 3 * s * Math.sin(rot) : 0), along ? 34 * s : 8 * s, 0.8 * s, along ? 8 * s : 34 * s);
}
function weltAirport(road) {
  const YEL = new THREE.MeshStandardMaterial({ color: 0xe0b532, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), { LINE } = trackMats();
  // Start- und Landebahn 09/27 (480 m × 45 m) mit Mittellinie, Randlinien, Schwellen-Streifen, Nummern, Befeuerung
  const RZ = 300, RX0 = 530, RX1 = 1015, RW = 45, rcx = (RX0 + RX1) / 2, RL = RX1 - RX0;
  decalT(rcx, RZ, RL, RW, MAT.road, 3, 0, 0.01);
  for (let x = RX0 + 50; x < RX1 - 50; x += 30) decalT(x, RZ, 15, 0.9, LINE, 0, 0, 0.02);
  for (const sd of [-1, 1]) decalT(rcx, RZ + sd * (RW / 2 - 1.2), RL - 4, 0.9, LINE, 0, 0, 0.02);
  for (const tx of [RX0 + 14, RX1 - 14]) for (let k = 0; k < 6; k++) for (const sd of [-1, 1]) decalT(tx, RZ + sd * (3.5 + k * 3), 22, 1.8, LINE, 0, 0, 0.021);
  const num = (txt, x, rot) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#ececec'; g.font = '900 112px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 128, 68);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    decalT(x, RZ, 14, 28, new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }), 0, rot, 0.022);
  };
  num('09', RX0 + 42, -Math.PI / 2); num('27', RX1 - 42, Math.PI / 2);
  const RL_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 1.2 });
  for (let x = RX0 + 5; x <= RX1 - 5; x += 30) for (const sd of [-1, 1]) addBox(x, 0, RZ + sd * (RW / 2 + 1), 0.35, 0.3, 0.35, RL_MAT, 0, { decor: true, round: 0 });
  // Rollweg mit gelber Mittellinie und drei Verbindungen zur Bahn
  decalT(775, 240, 440, 20, MAT.road, 3, 0, 0.01); decalT(775, 240, 440, 0.4, YEL, 0, 0, 0.02);
  for (const x of [575, 785, 990]) { decalT(x, 260, 20, 40, MAT.road, 3, 0, 0.009); decalT(x, 262, 0.4, 36, YEL, 0, 0, 0.02); }
  // Vorfeld mit Standplätzen
  decalT(780, 170, 360, 112, MAT.concreteFloor, 2.7, 0, 0.011);
  for (const x of [680, 760, 840]) { decalT(x, 165, 0.4, 70, YEL, 0, 0, 0.02); decalT(x, 132, 8, 0.4, YEL, 0, 0, 0.02); }
  // Terminal (Glasfront zum Vorfeld), Fluggastbrücken, Vorfahrt und Parkplatz an der Hauptstraße
  addBox(770, 0, 90, 260, 12, 38, MAT.concrete, 2.6, { round: 0 });
  addBox(770, 12, 90, 264, 0.6, 44, EAST_METAL, 2, { decor: true, round: 0 });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(250, 8.5), TKM.glassBlue); glass.position.set(770, 6, 109.05); scene.add(glass);
  const glassN = new THREE.Mesh(new THREE.PlaneGeometry(250, 8.5), TKM.glassBlue); glassN.position.set(770, 6, 70.95); glassN.rotation.y = Math.PI; scene.add(glassN);
  tkSign(770, 14.2, 109.4, 60, 3.6, 0, tkSignMat('✈ FLUGHAFEN KAMPFZONE', '#0d2b52', '#ffffff', false));
  tkSign(770, 14.2, 70.6, 60, 3.6, Math.PI, tkSignMat('✈ FLUGHAFEN KAMPFZONE', '#0d2b52', '#ffffff', false));
  for (const [i, d] of [['A', 70.6], ['B', 70.6]].entries()) { const door = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), MAT.dark); door.position.set(700 + i * 140, 2, d[1] - 0.02); door.rotation.y = Math.PI; scene.add(door); }
  for (const x of [680, 760, 840]) { addBox(x - 4.5, 3.2, 120.5, 3, 3, 21, EAST_METAL, 2, { decor: true, round: 0 }); addBox(x - 4.5, 0, 128, 0.6, 3.2, 0.6, MAT.metal, 1, { round: 0 }); }
  road(640, 6.5, 640, 50, 9); road(900, 6.5, 900, 50, 9); road(635.5, 56, 904.5, 56, 12);   // Vorfahrt
  for (let k = 0; k < 8; k++) { decalT(660 + k * 7, 30, 0.15, 5, LINE, 0, 0, 0.012); if (k % 3 === 0) carSpot(663.5 + k * 7, 30, Math.PI / 2); }
  // Tower, Hangar, Windsack, Hubschrauber-Landeplatz
  addBox(935, 0, 75, 5, 34, 5, MAT.concrete, 2.6, { round: 0 });
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 4.5, 4.5, 10), TKM.glassBlue); cab.position.set(935, 36.3, 75); scene.add(cab);
  addBox(935, 38.5, 75, 11.5, 0.6, 11.5, MAT.dark, 1, { decor: true, round: 0 });
  tkSign(935, 30, 77.6, 4.6, 1.2, 0, tkSignMat('TOWER', '#ffffff', '#0d2b52', false));
  addBox(1000, 0, 175, 50, 9, 58, EAST_METAL, 2.6, { round: 0 });
  { const rg = new THREE.CylinderGeometry(29, 29, 50, 20, 1, true, 0, Math.PI); rg.rotateZ(Math.PI / 2); rg.scale(1, 0.33, 1);
    const roof = new THREE.Mesh(withUv2(rg), EAST_METAL); roof.position.set(1000, 9, 175); roof.castShadow = true; scene.add(roof); }
  const hd = new THREE.Mesh(new THREE.PlaneGeometry(44, 8), MAT.dark); hd.position.set(974.97, 4, 175); hd.rotation.y = -Math.PI / 2; scene.add(hd);
  tkSign(974.9, 11, 175, 24, 2.4, -Math.PI / 2, tkSignMat('HANGAR 1', '#ffffff', '#0d2b52', false));
  addBox(1003, 0, 262, 0.2, 6, 0.2, MAT.metal, 1, { round: 0 });
  { const sock = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.8, side: THREE.DoubleSide })); sock.rotation.z = Math.PI / 2 + 0.25; sock.position.set(1004.5, 5.6, 262); scene.add(sock); }
  // Flugzeuge: drei an den Gates, eines auf dem Rollweg, eines an der Bahnschwelle, ein Privatjet vor dem Hangar
  airliner(680, 147, Math.PI / 2, 0xc8102e); airliner(760, 147, Math.PI / 2, 0x0d2b52); airliner(840, 147, Math.PI / 2, 0xffb300);
  airliner(700, 240, 0, 0x00897b); airliner(RX0 + 36, RZ, 0, 0x6a1b9a); airliner(945, 200, Math.PI, 0x2b2b2b, 0.45);
  window.MAP_STREETS.push([RX0, RZ - RW / 2, RX1, RZ + RW / 2], [555, 230, 995, 250], [600, 114, 960, 226], [635.5, 6.5, 644.5, 56], [895.5, 6.5, 904.5, 56], [635.5, 50, 904.5, 62]);
  (window.MAP_POIS = window.MAP_POIS || []).push({ x: 770, z: 90, t: '✈' }, { x: 935, z: 75, t: '🗼' });
  // Fliegbare Kleinflugzeuge: drei auf dem Vorfeld (Nase zum Rollweg), eines startbereit am Ostende der Bahn (Start nach Westen)
  MAP_VEHICLES.push({ x: 895, z: 140, yaw: -Math.PI / 2, kind: 'plane' }, { x: 918, z: 140, yaw: -Math.PI / 2, kind: 'plane' },
    { x: 905, z: 178, yaw: -Math.PI / 2, kind: 'plane' }, { x: 995, z: RZ + 8, yaw: Math.PI, kind: 'plane' });
}
/* Ringstadt: Stadtteil zwischen Ringstraße (x 345) und Ostallee (x 480) – Altbau-Häuserzeilen, Hotels, Fan-Shops;
   verbindet die alte Karte nahtlos mit F1-Ring und Flughafen. Dazu Bebauung rund um Rennstrecke und Flughafen. */
function weltRingstadt(road, reserve) {
  const AX = 480, X0 = 352, X1 = 473;
  road(AX, -345, AX, 345, 9);                                   // Ostallee
  road(345, -345, AX, -345, 9); road(345, 345, AX, 345, 9);     // Ringstraße bis zur Ostallee verlängert
  for (const z of [-240, -120, 120, 240]) road(349.5, z, 475.5, z, 9);
  window.MAP_STREETS.push([AX - 4.5, -349.5, AX + 4.5, 349.5], [345, -349.5, AX, -340.5], [345, 340.5, AX, 349.5],
    ...[-240, -120, 120, 240].map(z => [349.5, z - 4.5, 475.5, z + 4.5]));
  reserve(AX - 7, -352, AX + 7, 352); reserve(340, -352, AX, -338); reserve(340, 338, AX, 352);   // Straßen frei von Bäumen
  const E = euMats(), blocks = [[-340, -245], [-235, -125], [-115, -7], [7, 115], [125, 235], [245, 340]];
  for (let b = 0; b < blocks.length; b++) {
    const [z0, z1] = blocks[b], cz = (z0 + z1) / 2;
    decalT((X0 + X1) / 2, cz, X1 - X0, z1 - z0, E.plaza, 2, 0, 0.008); sidewalkRing(X0, X1, z0, z1); reserve(X0 - 2, z0 - 2, X1 + 2, z1 + 2);
    const rowN = () => euRow(X0 + 4, X1 - 4, z0 + 3.5, true, -1, 11, []), rowS = () => euRow(X0 + 4, X1 - 4, z1 - 3.5, true, 1, 11, []);
    const rowE = () => euRow(z0 + 16, z1 - 16, X1 - 3.5, false, 1, 11, []), rowW = () => euRow(z0 + 16, z1 - 16, X0 + 3.5, false, -1, 11, []);
    if (b === 0) {   // Hotel am F1-Ring + Häuser
      towerLobby(400, cz + 6, 30, 18, 40, TKM.glassBlue, true);
      tkSign(400, 36, cz + 15.1, 18, 2.6, 0, tkSignMat('HOTEL PODIUM', '#0d2b52', '#ffd23f', false));
      rowN(); euRow(425, X1 - 4, z1 - 3.5, true, 1, 11, []);
    } else if (b === 2) {   // Fan-Meile an der Hauptstraße: Läden, Fan-Shop, Imbiss
      rowN(); rowW();
      cityShop(390, z1 - 12, 18, 14, 2, MAT.plaster2, true, '🏁 F1 FANSHOP', ['#c8102e', '#ffffff']);
      cityShop(432, z1 - 12, 16, 13, 2, MAT.brick, true, 'IMBISS BOXENSTOPP', ['#ffd21f', '#111111']);
      for (let k = 0; k < 4; k++) leafTree(458, z0 + 20 + k * 22, 0.9);
    } else if (b === 3) {   // Flughafen-Hotel + Mietwagen
      towerLobby(405, cz - 6, 32, 18, 34, TKM.office, false);
      tkSign(405, 30, cz - 15.1, 20, 2.6, Math.PI, tkSignMat('✈ AIRPORT HOTEL', '#ffffff', '#0d2b52', false));
      cityShop(452, z1 - 10, 16, 12, 1, MAT.plaster, true, 'AUTOVERMIETUNG', ['#1b6fd8', '#ffffff']);
      euRow(X0 + 4, 440, z1 - 3.5, true, 1, 11, []);
    } else { rowN(); rowS(); if (b !== 5) rowE(); }
    for (let x = X0 + 10; x < X1; x += 30) { lamp(x, z0 + 1.2, -1); lamp(x, z1 - 1.2, 1); }
  }
  // Wegweiser an der Ostallee
  addBox(AX - 6, 0, 9, 0.15, 3.4, 0.15, MAT.metal, 1, { round: 0.05 });
  tkSign(AX - 6, 3.0, 9.1, 5.5, 1.2, 0, tkSignMat('🏁 F1-RING  ✈ FLUGHAFEN →', '#0d5a2b', '#ffffff', false));
  weltOstDeko();
}
// Bebauung am F1-Ring (Fahrerlager, Innenfeld) und am Flughafen (Parkhaus, Feuerwache, Tanklager, Frachtzentrum)
const F1_TEAM_COL = ['#c8102e', '#1a2a6c', '#ff8000', '#00a19c'];
function weltOstDeko() {
  const used = [], FP = window.DRIFT_TRACKS.find(t => t.key === 'f1').pts;
  const trackFar = (x, z, d) => { const d2 = d * d; for (let i = 0; i < FP.length; i += 2) { const dx = FP[i][0] - x, dz = FP[i][1] - z; if (dx * dx + dz * dz < d2) return false; } return true; };
  const free = (x, z, r, trk = r + 9) => trackFar(x, z, trk) && !used.some(([a, b, q]) => Math.hypot(a - x, b - z) < q + r)
    && !(x > 655 && x < 865 && z > -100 && z < -84) && !(x > 1004 && z > -215 && z < -125) && !(x > 770 && x < 830 && z > -116 && z < -100);
  const take = (x, z, r) => used.push([x, z, r]);
  // Fahrerlager: Team-Lkw hinter den Boxen, Parkplatz an der Einfahrt
  for (let x = 625; x <= 895; x += 30) truck(x, -18, false);
  decalT(540, -27, 60, 34, MAT.road, 3, 0, 0.009);
  for (let k = 0; k < 8; k++) decalT(515 + k * 7, -27, 0.15, 5, trackMats().LINE, 0, 0, 0.012);
  carSpot(518.5, -27, Math.PI / 2); carSpot(546.5, -27, Math.PI / 2, 'race');
  // Infield: Medienzentrum, Hospitality-Zelte, Riesenrad, Bäume
  if (free(925, -160, 18)) { towerLobby(925, -160, 26, 18, 22, TKM.glassBlue, true); tkSign(925, 19, -150.9, 18, 2.4, 0, tkSignMat('MEDIA CENTER', '#111111', '#ffffff', false)); take(925, -160, 18); }
  const marquee = (x, z) => {
    addBox(x, 0, z, 16, 3.2, 9, TKM.white, 1, { round: 0 });
    const r = new THREE.Mesh(new THREE.ConeGeometry(9.6, 2.6, 4), TKM.white); r.rotation.y = Math.PI / 4; r.scale.set(1.15, 1, 0.65); r.position.set(x, 4.5, z); r.castShadow = true; scene.add(r);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.4), MAT.dark); door.position.set(x, 1.2, z + 4.52); scene.add(door);
  };
  for (const [x, z] of [[870, -205], [880, -235], [660, -150], [690, -120], [610, -205]]) if (free(x, z, 10)) { marquee(x, z); take(x, z, 10); }
  // Riesenrad
  const ferris = (x, z) => {
    const R = 17, H = R + 3, wm = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, roughness: 0.4, metalness: 0.6 });
    const g = new THREE.Group(); g.position.set(x, H, z);
    for (const s of [-1.2, 1.2]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.25, 6, 40), wm); ring.position.z = s; g.add(ring); }
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, sp = new THREE.Mesh(new THREE.BoxGeometry(0.18, R, 0.18), wm); sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0); sp.rotation.z = a - Math.PI / 2; g.add(sp);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 2.2), [MAT.ctrRed, MAT.ctrBlue, MAT.yellow, MAT.ctrGreen][k % 4]); cab.position.set(Math.cos(a) * R, Math.sin(a) * R - 1.2, 0); g.add(cab);
    }
    scene.add(g);
    for (const s of [-1, 1]) for (const lean of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, H / Math.cos(0.32), 0.5), wm); leg.position.set(x + lean * H * Math.tan(0.32) / 2, H / 2, z + s * 2); leg.rotation.z = -lean * 0.32; leg.castShadow = true; scene.add(leg); }
    collider(x, 0, z, 16, 3, 6);
    tkSign(x, 2.2, z + 3.4, 6, 1.1, 0, tkSignMat('RIESENRAD', '#6a1b9a', '#ffffff', false));
  };
  // Weitere Bebauung: zufällig (für alle gleich) auf freie Plätze verteilen
  const place = (r, fn, x0, x1, z0, z1, trk) => { for (let t = 0; t < 300; t++) { const x = srnd(x0, x1), z = srnd(z0, z1); if (free(x, z, r, trk)) { fn(x, z); take(x, z, r); return true; } } return false; };
  const W_ = [560, 1000, -335, -105];
  place(20, ferris, ...W_, 26);   // Riesenrad (vor den anderen Bauten: braucht den meisten Platz)
  place(16, (x, z) => { towerLobby(x, z, 24, 18, 32, TKM.office, true); tkSign(x, 29, z + 9.1, 16, 2.4, 0, tkSignMat('RACE HOTEL', '#c8102e', '#ffffff', false)); }, ...W_);
  const hosp = ['TEAM ROT', 'TEAM BLAU', 'TEAM PAPAYA', 'TEAM PETROL'];
  for (let k = 0; k < 4; k++) place(13, (x, z) => {   // Hospitality: Glasbau mit Dachterrasse
    addBox(x, 0, z, 20, 7, 12, TKM.glassBlue, 2.6, { round: 0 }); addBox(x, 7, z, 21, 0.4, 13, TKM.white, 1, { decor: true, round: 0 });
    for (let s = -1; s <= 1; s += 2) addBox(x + s * 10.3, 7.4, z, 0.08, 1.0, 13, MAT.metal, 1, { decor: true, round: 0 });
    tkSign(x, 5.6, z + 6.06, 14, 1.4, 0, tkSignMat(hosp[k], F1_TEAM_COL[k], '#ffffff', false));
  }, ...W_);
  place(15, (x, z) => {   // Fan-Bühne mit Videowand
    addBox(x, 0, z, 18, 1.4, 10, MAT.dark, 1, { round: 0 }); for (const s of [-1, 1]) addBox(x + s * 9, 1.4, z - 4.5, 0.5, 8, 0.5, MAT.metal, 1, { round: 0 });
    addBox(x, 9.4, z - 1, 19, 0.5, 11, MAT.dark, 1, { decor: true, round: 0 });
    tkSign(x, 6, z - 4.7, 14, 6, 0, tkSignMat('🏁 FAN ZONE', '#111111', '#ffd23f', false));
  }, ...W_);
  const stallCols = [MAT.ctrRed, MAT.ctrBlue, MAT.yellow, MAT.ctrGreen, MAT.ctrOrange];
  const stallTxt = ['POMMES', 'BRATWURST', 'GETRÄNKE', 'PIZZA', 'EIS', 'MERCH'];
  for (let k = 0; k < 8; k++) place(4, (x, z) => {   // Imbissbuden
    addBox(x, 0, z, 4, 2.6, 3, TKM.white, 1, { round: 0.05 }); addBox(x, 2.6, z + 0.4, 4.4, 0.15, 3.8, stallCols[k % 5], 1, { decor: true, round: 0 });
    tkSign(x, 2.2, z + 1.52, 3.4, 0.6, 0, tkSignMat(stallTxt[k % 6], '#ffffff', '#c8102e', false));
  }, ...W_);
  const carCols = [0xc8102e, 0x1a2a6c, 0xe9e8e2, 0x1b1b1b, 0x8a8f96, 0x2e7dd6, 0xffd21f, 0x0a5c2b].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.5 }));
  const parked = (x, z, rot, k) => {   // einfaches abgestelltes Auto (Deko)
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
    const b = new THREE.Mesh(boxGeo(4.3, 0.75, 1.8, 0, 0.18), carCols[k % 8]); b.position.y = 0.65; g.add(b);
    const c = new THREE.Mesh(boxGeo(2.3, 0.6, 1.6, 0, 0.15), CAR_GLASS); c.position.set(-0.2, 1.3, 0); g.add(c);
    for (const [wx, wz] of [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10), TIRE); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.34, wz); g.add(w); }
    scene.add(g); collider(x, 0, z, Math.abs(Math.sin(rot)) > 0.5 ? 1.8 : 4.3, 1.4, Math.abs(Math.sin(rot)) > 0.5 ? 4.3 : 1.8);
  };
  let pk = 0;
  for (let k = 0; k < 3; k++) place(17, (x, z) => {   // Besucher-Parkplätze
    decalT(x, z, 30, 22, MAT.road, 3, 0, 0.009);
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) { decalT(x - 14 + i * 3.4, z + s * 5.5, 0.12, 5, trackMats().LINE, 0, 0, 0.012); if ((i * 7 + s + k) % 3) parked(x - 12.3 + i * 3.4, z + s * 5.5, Math.PI / 2, pk++); }
  }, ...W_);
  const tcols = [0xd8432a, 0x2e7dd6, 0x3fa34d, 0xf2b81f, 0x8e44ad];
  for (let k = 0; k < 14; k++) place(3, (x, z) => tent(x, z, tcols[k % 5], srand() * 6), 540, 760, -340, -250, 12);   // Fan-Camping
  for (let k = 0; k < 5; k++) place(5, (x, z) => caravan(x, z), 540, 760, -340, -250, 12);
  for (const [x, z] of [[600, -95], [990, -300]]) if (free(x, z, 4, 10)) {   // Videowände an der Strecke
    for (const s of [-1, 1]) addBox(x + s * 3.5, 0, z, 0.4, 6, 0.4, MAT.metal, 1, { round: 0 });
    tkSign(x, 6.5, z, 9, 4, 0, tkSignMat('LIVE ▶ P1 #16', '#0a0a0a', '#ffd23f', false)); tkSign(x, 6.5, z - 0.02, 9, 4, Math.PI, tkSignMat('LIVE ▶ P1 #16', '#0a0a0a', '#ffd23f', false)); take(x, z, 4);
  }
  // Bäume im Innenfeld und rund um die Strecke
  let n = 0, tries = 0;
  while (n < 110 && tries++ < 3000) {
    const x = srnd(520, 1030), z = srnd(-372, -95);
    if (!free(x, z, 3, 13)) continue;
    leafTree(x, z, srnd(0.85, 1.2)); take(x, z, 3); n++;
  }
  // Brücke mit Werbung über die Gegengerade
  { const i0 = (() => { let b = 0, bd = 1e9; const P = window.DRIFT_TRACKS.find(t => t.key === 'f1').pts; P.forEach(([px, pz], i) => { const d = Math.hypot(px - 860, pz + 347); if (d < bd) { bd = d; b = i; } }); return P[b]; })();
    for (const s of [-1, 1]) addBox(i0[0], 0, i0[1] + s * 11, 1, 7, 1, MAT.concrete, 2, { round: 0 });
    addBox(i0[0], 6, i0[1], 2.4, 2.2, 23, MAT.concrete, 2, { decor: true, round: 0 });
    for (const s of [-1, 1]) tkSign(i0[0] + s * 1.22, 7.1, i0[1], 20, 1.8, s * Math.PI / 2, tkSignMat('KAMPFZONE GP · APEX OIL', '#ffd21f', '#111111', false)); }
  // Flughafen: Parkhaus, Feuerwache, Tanklager, Frachtzentrum, Zaun an der Bahn
  { const px = 580, pz = 80, W = 40, D = 34;
    for (let l = 0; l < 4; l++) addBox(px, l * 3.2, pz, W, 0.35, D, MAT.concrete, 2.6, { round: 0 });
    for (let l = 1; l < 4; l++) for (const s of [-1, 1]) addBox(px, l * 3.2 + 0.35, pz + s * (D / 2 - 0.2), W, 1.0, 0.3, MAT.concrete, 2.6, { decor: true, round: 0 });
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) addBox(px + sx * (W / 2 - 1), 0, pz + sz * (D / 2 - 1), 0.8, 9.9, 0.8, MAT.concrete, 2.6, { round: 0 });
    tkSign(px, 11.2, pz + D / 2 + 0.05, 10, 2, 0, tkSignMat('P  PARKHAUS', '#1b6fd8', '#ffffff', false)); }
  hall(995, 110, 30, 18, 8, '🚒 FLUGHAFEN-FEUERWEHR', -1);
  for (const [x, z] of [[1022, 30], [1022, 58]]) { const t = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(6, 6, 10, 20)), TKM.white); t.position.set(x, 5, z); t.castShadow = true; scene.add(t); collider(x, 0, z, 10, 10, 10); }
  for (const x of [640, 740, 840]) hall(x, 357, 60, 22, 10, 'AIR CARGO', -1);
  for (let x = 535; x <= 1010; x += 5) addBox(x, 0, 338, 0.1, 2.2, 0.1, MAT.metal, 1, { decor: true, round: 0 });
  addBox(772, 2.1, 338, 475, 0.06, 0.06, MAT.metal, 1, { decor: true, round: 0 }); addBox(772, 1.0, 338, 475, 0.06, 0.06, MAT.metal, 1, { decor: true, round: 0 });
  for (let k = 0; k < 12; k++) leafTree(625 + k * 24, 64, 0.9);   // Allee an der Vorfahrt
}
const WELT_XE = 1100;   // Ostrand der Karte Welt (x); Westrand bleibt -440
function buildWeltMap() {
  const S = 440;   // Spielfläche ±440 m: innen das alte Gebiet (±300), dann ein flacher Ring, außen Berge (ab ~380 m)
  // Berge am Rand (begehbar): vier Streifen, Höhe = sichtbares Außengelände (core.js terrainHeight)
  const XE = WELT_XE;   // Ostrand: dort liegen hinter einem Bergrücken die Formel-1-Strecke und der Flughafen
  const outerH = (x, z) => window.mapEdge(x, z) < 66 ? 0 : Math.max(0, window.terrainHeight(x, z));
  for (const [x0, x1, z0, z1] of [[-S, XE, -S, -376], [-S, XE, 376, S], [-S, -376, -376, 376], [1036, XE, -376, 376]]) addHillRegion({ x0, x1, z0, z1, fn: outerH });
  /* --- Hügel: Wald (Berg), Felder beim Bauernhof --- */
  const LX0 = -205, LZ0 = -95, LR0 = 26;   // Waldsee (gleiche Werte wie unten)
  // Drift-Strecken zwischen den Hügeln (Verlauf zuerst, damit die Hügel entlang der Strecke flach werden)
  const TRK_WALD = driftLoop([[-128, -132], [-96, -136], [-60, -130], [-38, -114], [-31, -90], [-42, -72], [-60, -60], [-64, -40], [-78, -26], [-98, -27], [-108, -44], [-122, -60], [-132, -82], [-138, -108]]);
  const TRK_FELD = driftLoop([[36, 166], [64, 161], [94, 163], [104, 178], [99, 200], [86, 224], [72, 250], [52, 272], [33, 268], [27, 244], [23, 216], [25, 188]]);
  addTrackPts(TRK_WALD.pts); addTrackPts(TRK_FELD.pts);
  addHillRegion({ x0: -292, x1: -12, z0: -292, z1: -12, track: true,
    flatC: [[LX0, LZ0, LR0 + 6], [LX0 + 34, LZ0 + 20, 16], [-95, -230, 10]], flatL: [['x', -150], ['z', -150]],
    bumps: [[-228, -228, 32, 30], [-200, -258, 13, 17], [-258, -196, 12, 17],                      // Berg mit Schultern
      [-60, -205, 12, 20], [-112, -268, 9, 15], [-38, -262, 8, 14],                                  // Hügel nördlich
      [-262, -40, 11, 18], [-264, -128, 8, 14],                                                     // Hügel westlich vom See
      [-92, -92, 10, 20], [-45, -48, 6, 14], [-130, -34, 8, 13]] });                                 // Hügel nahe der Kreuzung
  addHillRegion({ x0: 14, x1: 147, z0: 48, z1: 294, edge: 16, flatC: [], flatL: [['z', 150]], track: true,      // sanfte Hügel auf den Feldern
    bumps: [[58, 95, 11, 20], [112, 82, 7, 15], [88, 122, 6, 13], [48, 215, 13, 22], [112, 232, 9, 18], [78, 272, 7, 14], [122, 186, 6, 12]] });
  const white = new THREE.MeshStandardMaterial({ color: 0xe0ded4, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
  const yel = new THREE.MeshStandardMaterial({ color: 0xd8b23a, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
  MAT.road = pbr('asphalt', 3, { mat: { polygonOffset: true, polygonOffsetFactor: -1 } });
  MAT.rampWood = pbr('wood', 2, { mat: { color: new THREE.Color(1.35, 1.2, 1.0) } });
  MAT.dirt = pbr('asphalt', 3, { map: tintedTex('asphalt', 0x6e5034), mat: { color: new THREE.Color(0.68, 0.6, 0.52) }, normalScale: 1.6 });
  const field = hex => pbr('grass', 4, { map: tintedTex('grass', hex), mat: { color: new THREE.Color(1, 1, 1) } });
  const F_WHEAT = field(0xcfae55), F_GREEN = field(0x7aa645), F_PLOW = field(0x6a4a30), F_RAPE = field(0xd9cf3a);

  /* --- Rand: Hecke + unsichtbare Wand --- */
  for (const s of [-1, 1]) {
    const ex = s < 0 ? -S : XE, mx = (XE - S) / 2, wx = XE + S;
    addBox(mx, 0, s * (S + 1), wx + 4, 1.6, 1.2, HEDGE_MAT, 1, { decor: true, round: 0.4 }); addBox(ex + s, 0, 0, 1.2, 1.6, 2 * S + 4, HEDGE_MAT, 1, { decor: true, round: 0.4 });
    collider(mx, 0, s * (S + 1.5), wx + 6, 160, 2); collider(ex + s * 1.5, 0, 0, 2, 160, 2 * S + 6);
  }

  /* --- Straßen-Werkzeug: Asphalt + Mittellinie + Randlinien (achsparallel) --- */
  const road = (x0, z0, x1, z1, w, center = 'dash', mat = MAT.road) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    decalT(cx, cz, alongX ? L : w, alongX ? w : L, mat, 3, 0, 0.006);
    if (mat !== MAT.road) return;
    for (const sd of [-1, 1]) alongX ? decalT(cx, cz + sd * (w / 2 - 0.4), L, 0.15, white, 0, 0, 0.012) : decalT(cx + sd * (w / 2 - 0.4), cz, 0.15, L, white, 0, 0, 0.012);
    if (center === 'dash') for (let t = -L / 2 + 2; t < L / 2 - 2; t += 6) alongX ? decalT(cx + t, cz, 3, 0.15, white, 0, 0, 0.013) : decalT(cx, cz + t, 0.15, 3, white, 0, 0, 0.013);
    if (center === 'solid') alongX ? decalT(cx, cz, L, 0.2, yel, 0, 0, 0.013) : decalT(cx, cz, 0.2, L, yel, 0, 0, 0.013);
  };
  // Bundesstraßen durch die ganze Karte (Leitplanken an den Landstücken)
  road(-S, 0, XE, 0, 13, 'solid'); road(0, -S, 0, S, 13, 'solid');
  for (let t = -376; t < 376; t += 4) {
    if (Math.abs(t) < 14 || Math.abs(Math.abs(t) - 345) < 8) continue;   // Kreuzungen (Mitte, Ringstraße) frei
    const rural = (x, z) => !(x > 25 && z < -25) && !(x < -25 && z > 25);   // nicht in Stadt/Dorf
    if (rural(t, -7.5)) { addBox(t, 0.5, -7.3, 4, 0.3, 0.15, MAT.metal, 1, { decor: true, round: 0 }); }
    if (rural(t, 7.5)) { addBox(t, 0.5, 7.3, 4, 0.3, 0.15, MAT.metal, 1, { decor: true, round: 0 }); }
    if (rural(-7.5, t)) addBox(-7.3, 0.5, t, 0.15, 0.3, 4, MAT.metal, 1, { decor: true, round: 0 });
    if (rural(7.5, t)) addBox(7.3, 0.5, t, 0.15, 0.3, 4, MAT.metal, 1, { decor: true, round: 0 });
  }
  // Ortsschilder
  const townSign = (x, z, rot, txt) => { addBox(x, 0, z, 0.12, 2.2, 0.12, MAT.metal, 1, { round: 0.05 }); tkSign(x, 2.3, z, 2.6, 0.9, rot, tkSignMat(txt, '#f2d21b', '#111111', false)); };
  townSign(32, -10, Math.PI / 2, 'GROSSSTADT'); townSign(-32, 10, -Math.PI / 2, 'BIRKENDORF'); townSign(10, 32, 0, 'HOF HUBER'); townSign(-10, -32, Math.PI, 'WALDSEE');

  /* ===== GROSSSTADT (Nordosten, x 30 … 290, z -290 … -30) ===== */
  const CX = [40, 100, 160, 220, 280], CZ = [-40, -100, -160, -220, -280];
  for (const x of CX) road(x, -290, x, -30, 9);
  for (const z of CZ) road(30, z, 290, z, 9);
  const cityMats = [TKM.glassBlue, TKM.office, TKM.officeDark, TKM.tile, TKM.glassGreen];
  const germanShops = ['BÄCKEREI', 'APOTHEKE', 'SUPERMARKT', 'CAFÉ', 'BANK', 'KIOSK', 'FRISEUR', 'HOTEL', 'KINO', 'BUCHLADEN', 'ELEKTRO', 'DÖNER'];
  let shopN = 0;
  const KEEP_FREE = WELT_PICKS.map(p => [p.x, p.z]);   // Waffen am Boden bleiben erreichbar
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x0 = CX[i] + 4.5, x1 = CX[i + 1] - 4.5, z1 = CZ[j] - 4.5, z0 = CZ[j + 1] + 4.5, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    decalT(cx, cz, x1 - x0, z1 - z0, euMats().plaza, 2, 0, 0.008);
    sidewalkRing(x0, x1, z0, z1);
    const key = i + ',' + j;
    if (key === '0,0') {   // POST (Firma)
      building(cx - 6, cz + 2, 22, 14, 2, MAT.plaster, { s: [-4, 4] }, { crates: 0 });
      addBox(cx - 2, 0, cz + 3, 5, 1.1, 0.8, MAT.crate, 0); addBox(cx - 2, 1.1, cz + 3, 5.1, 0.06, 0.9, MAT.yellow, 1, { decor: true, round: 0 });   // Schalter
      for (let k = 0; k < 3; k++) { addBox(cx + 3.6, 0, cz - 2 + k * 2.2, 0.8, 2.2, 1.8, MAT.metal, 1); for (let s = 0; s < 3; s++) crate(cx + 3.6, 0.1 + s * 0.7, cz - 2 + k * 2.2, 0.5); }   // Paketregale
      window.POST_PICKUP = [cx - 2, cz + 5]; window.POST_CLERK = [cx - 2, cz + 1.8];
      tkSign(cx - 6, 6.9, cz + 9.05, 9, 1.6, 0, tkSignMat('📦 POST', '#ffcc00', '#1a1a1a', false));
      window.MAP_JOBS.push({ id: 'post', x: cx - 6, z: cz + 13 });
      for (let k = 0; k < 2; k++) carSpot(cx + 14, cz - 6 + k * 6, Math.PI / 2);
      towerLobby(cx + 12, cz - 14, 14, 12, 34, TKM.office, false);
      gunKiosk(cx + 18, cz + 18, 1);   // Waffenladen am Stadteingang (Tür zur Hauptstraße)
    } else if (key === '1,0') {   // TAXI-ZENTRALE (Firma)
      building(cx, cz - 10, 16, 10, 1, MAT.plaster2, { s: [0] }, { crates: 1 });
      tkSign(cx, 3.7, cz - 4.95, 8, 1.4, 0, tkSignMat('🚕 TAXI', '#ffd21f', '#111111', false));
      window.MAP_JOBS.push({ id: 'taxi', x: cx, z: cz - 1 });
      window.TAXI_BOSS = [cx + 3, cz - 3.5];
      for (let k = 0; k < 4; k++) { carSpot(cx - 15 + k * 7, cz + 12, -Math.PI / 2); decalT(cx - 15 + k * 7 + 3.5, cz + 12, 0.15, 5, white, 0, 0, 0.012); }
    } else if (key === '2,1') {   // Rathaus mit Platz und Brunnen
      building(cx, cz - 8, 24, 14, 3, MAT.plaster, { s: [0] }, { crates: 1 });
      tkSign(cx, 10.4, cz - 0.95, 10, 1.6, 0, tkSignMat('RATHAUS', '#ffffff', '#1b3a6d', false));
      const basin = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(3, 3.1, 0.7, 24, 1, true)), MAT.concrete); basin.position.set(cx, 0.35, cz + 12); scene.add(basin);
      const wd = new THREE.Mesh(new THREE.CircleGeometry(2.9, 24), TKM.water); wd.rotation.x = -Math.PI / 2; wd.position.set(cx, 0.5, cz + 12); scene.add(wd);
      collider(cx, 0, cz + 12, 5.2, 0.7, 5.2); addBox(cx, 0.7, cz + 12, 0.6, 1.6, 0.6, MAT.concrete, 2);
      for (const sx of [-1, 1]) { bench(cx + sx * 8, cz + 12, false); leafTree(cx + sx * 16, cz + 16, 0.9); }
      gunKiosk(cx - 18, cz + 4, 1);   // Waffenladen am Rathausplatz
      { // Börsen-Terminal: Säule mit Bildschirm (E = Börse öffnen)
        const bx = cx + 16, bz = cz + 4;
        addBox(bx, 0, bz, 3.4, 3.2, 0.7, MAT.dark, 1, { round: 0.08 });
        const c = document.createElement('canvas'); c.width = 512; c.height = 448; const g = c.getContext('2d');
        g.fillStyle = '#071a2e'; g.fillRect(0, 0, 512, 448); g.fillStyle = '#ffd23f'; g.font = '900 64px Arial Black, sans-serif'; g.textAlign = 'center'; g.fillText('📈 BÖRSE', 256, 80);
        g.strokeStyle = '#2ee66b'; g.lineWidth = 6; g.beginPath();
        for (let k = 0; k <= 24; k++) g.lineTo(40 + k * 18, 300 - k * 5 - Math.sin(k * 1.3) * 28 - (k % 4) * 6); g.stroke();
        g.fillStyle = '#cfe3f5'; g.font = 'bold 30px Arial, sans-serif'; g.fillText('Aktien · Krypto · echte Kurse', 256, 380); g.fillStyle = '#ffd23f'; g.fillText('Taste E drücken', 256, 425);
        const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
        const scr = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.55, roughness: 0.3 });
        tkSign(bx, 1.75, bz + 0.37, 2.9, 2.55, 0, scr); tkSign(bx, 1.75, bz - 0.37, 2.9, 2.55, Math.PI, scr);
        window.BOERSE_POS = [bx, bz]; (window.MAP_POIS = window.MAP_POIS || []).push({ x: bx, z: bz, t: '📈' });
      }
    } else if (key === '3,3') {   // Stadtpark
      decalT(cx, cz, x1 - x0 - 2, z1 - z0 - 2, MAT.grass, 2, 0, 0.01);
      decalT(cx, cz, 3, z1 - z0 - 2, MAT.concreteFloor, 2.7, 0, 0.012); decalT(cx, cz, x1 - x0 - 2, 3, MAT.concreteFloor, 2.7, 0, 0.012);
      for (let k = 0; k < 10; k++) leafTree(cx + srnd(-20, 20) + (srand() < 0.5 ? 0 : 0), cz + srnd(-20, 20), srnd(0.8, 1.1));
      bench(cx + 4, cz, false); bench(cx - 4, cz, false); bench(cx, cz + 4, true);
    } else if (key === '1,2') {   // Parkplatz mit Autos
      for (let k = 0; k < 6; k++) { decalT(x0 + 6 + k * 7, cz, 0.15, 5, white, 0, 0, 0.012); if (k % 2 === 0) carSpot(x0 + 9.5 + k * 7, cz, Math.PI / 2); }
      towerLobby(cx, z0 + 9, 30, 12, 22, TKM.tile, false);
    } else {   // normale Blöcke: 2–4 Häuser/Türme mit Läden im Erdgeschoss
      // 4 Bauplätze: Geschäftshäuser (begehbar, 2–4 Etagen) oder Hochhäuser mit begehbarer Eingangshalle
      const slots = [[x0 + 12, z0 + 11, false], [x1 - 12, z0 + 11, false], [x0 + 12, z1 - 11, true], [x1 - 12, z1 - 11, true]];
      const shopMats = [MAT.plaster, MAT.plaster2, MAT.brick, MAT.concrete];
      const half = [], halfD = [];   // halbe Breite/Tiefe der Häuser an den 4 Ecken (für die Lücken dazwischen)
      for (const [bx, bz, faceS] of slots) {
        if (srand() < 0.15) { tkPlanter(bx, bz, 4, 1.2); bench(bx, bz + 2, true); leafTree(bx + 4, bz, 0.8); half.push(8); halfD.push(7); continue; }   // kleiner Platz
        if (srand() < 0.35) {
          const w = srnd(15, 18), d = srnd(14, 17), h = srnd(28, 45) + (i + (3 - j)) * srnd(2, 6);
          towerLobby(bx, bz, w, d, h, cityMats[Math.floor(srand() * cityMats.length)], faceS); half.push(w / 2); halfD.push(d / 2);
        } else {
          const name = germanShops[shopN++ % germanShops.length], col = TK_COLORS[shopN % 8], w = srnd(14, 18), d = srnd(12, 15);
          cityShop(bx, bz, w, d, 2 + Math.floor(srand() * 3), shopMats[Math.floor(srand() * shopMats.length)], faceS, name, col); half.push(w / 2); halfD.push(d / 2);
        }
      }
      // Westseite des Blocks: Häuserzeile zwischen den Eckhäusern (Ostseite bleibt Zugang zum Hinterhof)
      euRow(z0 + 11 + halfD[0] + 0.6, z1 - 11 - halfD[2] - 0.6, x0 + 3.5, false, -1, 11, KEEP_FREE);
      // Altbau-Häuserzeilen in den Lücken zwischen den Eckhäusern (Straßenseite), Hinterhof in der Mitte bleibt offen
      euRow(x0 + 12 + half[0] + 0.6, x1 - 12 - half[1] - 0.6, z0 + 3.5, true, -1, 11, KEEP_FREE);
      euRow(x0 + 12 + half[2] + 0.6, x1 - 12 - half[3] - 0.6, z1 - 3.5, true, 1, 11, KEEP_FREE);
      // grüner Hinterhof mit Baum und Bank (Zugang von West und Ost)
      decalT(cx, cz, 10, 12, MAT.grass, 2, 0, 0.012);
      leafTree(cx - 2.5, cz + 3, 0.8); bench(cx + 2, cz - 2, false);
    }
    // Sonderblöcke: Häuserzeilen an freien Straßenseiten (Eingänge von Post und Taxi bleiben frei)
    if (key === '0,0') euRow(x0 + 3.5, cx + 4.4, z0 + 3.5, true, -1, 10, KEEP_FREE);
    if (key === '1,0') { euRow(x0 + 3.5, cx - 8.6, z0 + 3.5, true, -1, 9, KEEP_FREE); euRow(cx + 8.6, x1 - 3.5, z0 + 3.5, true, -1, 9, KEEP_FREE); }
    // Straßenbäume und Laternen auf dem Gehweg (nicht an Haltepunkten von Taxi/Lieferungen und nicht auf Waffen)
    const sTree = (x, z) => { if (!window.MAP_ADDR.some(a => Math.hypot(a.x - x, a.z - z) < 3) && !KEEP_FREE.some(([px, pz]) => Math.hypot(px - x, pz - z) < 3) && !window.GUN_SHOPS.some(s => Math.hypot(s.cx - x, s.cz - z) < 9)) leafTree(x, z, 0.75); };
    for (const tx of [x0 + 8, x0 + 25.5, x1 - 8]) { sTree(tx, z0 + 1.6); sTree(tx, z1 - 1.6); }
    for (const tz of [z0 + 10, z1 - 10]) { sTree(x0 + 1.6, tz); sTree(x1 - 1.6, tz); }
    tkLamp(x0 + 1, cz, 1, 0); tkLamp(x1 - 1, cz, -1, 0);
    // Laternen an den Ecken
    tkLamp(x0 + 1, z0 + 1, 1, 0); tkLamp(x1 - 1, z1 - 1, -1, 0);
  }
  for (const x of CX) for (const z of CZ) if (srand() < 0.6) tkSignal(x + 5, z + 5, -1, 0);
  // Zebrastreifen an allen Kreuzungen der Stadt (nur wo die Straße weitergeht)
  { const ZB = euMats().zebra;
    for (const x of CX) for (const z of CZ) for (const s of [-1, 1]) {
      if (z + s * 6.5 > -290 && z + s * 6.5 < -30) decalT(x, z + s * 6.5, 9, 3, ZB, 0, 0, 0.014);                    // über die Nord-Süd-Straße
      if (x + s * 6.5 > 30 && x + s * 6.5 < 290) decalT(x + s * 6.5, z, 9, 3, ZB, 0, Math.PI / 2, 0.014);           // über die Ost-West-Straße
    }
  }
  // Tankstelle an der großen Kreuzung (Südost-Ecke)
  for (const [x, z] of [[16, 16], [32, 16], [16, 30], [32, 30]]) addBox(x, 0, z, 0.4, 5, 0.4, MAT.metal, 1);
  addBox(24, 5, 23, 22, 0.5, 20, TKM.white, 2, { decor: true });
  tkSign(24, 5.25, 33.05, 8, 0.5, 0, tkSignMat('TANKSTELLE', '#d41f3a', '#ffffff', false));
  for (const x of [20, 28]) { addBox(x, 0, 21, 0.8, 1.6, 0.6, MAT.ctrRed, 1); addBox(x, 0, 26, 0.8, 1.6, 0.6, MAT.ctrRed, 1); }
  building(24, 42, 14, 8, 1, MAT.plaster2, { n: [0] }, { crates: 2 });
  tkSign(24, 3.7, 37.95, 6, 1.1, Math.PI, tkSignMat('SHOP 24/7', '#12a05a', '#ffffff', false));
  carSpot(24, 18.5, 0); car(36, 24, false); car(36, 27, false);
  // Recyclinghof der Stadtreinigung (Firma) neben der Tankstelle: Container + Schild
  for (const [x, mat] of [[38.5, MAT.ctrGreen], [41.5, MAT.ctrBlue], [44.5, MAT.yellow]]) addBox(x, 0, 44, 2.6, 1.7, 2.2, mat, 2.6, { round: 0.05 });
  tkSign(41.5, 2.6, 42.85, 7, 0.8, Math.PI, tkSignMat('♻ STADTREINIGUNG', '#1d6b3a', '#ffffff', false));
  addBox(41.5, 0, 42.9, 0.12, 2.2, 0.12, MAT.metal, 1, { decor: true, round: 0 });
  window.MAP_JOBS.push({ id: 'trash', x: 41.5, z: 38.5 }); window.TRASH_BOSS = [44, 39.5];
  decalT(24, 26, 34, 26, MAT.concreteFloor, 2.7, 0, 0.009);

  /* ===== DORF „Birkendorf“ (Südwesten, x -290 … -30, z 30 … 290) ===== */
  const DX = [-40, -110, -180, -250], DZ = [40, 110, 180, 250];
  for (const x of DX) road(x, 30, x, 290, 8);
  for (const z of DZ) road(-290, z, -30, z, 8);
  const tint = (r, g, b) => pbr('concrete', 2.7, { mat: { color: new THREE.Color(r, g, b) } });
  const houseMats = [MAT.plaster, MAT.plaster2, MAT.brick, tint(1.12, 1.02, 0.68), tint(0.86, 0.96, 0.78), tint(1.1, 1.08, 1.02), tint(1.1, 0.84, 0.74)];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const x1 = DX[i] - 4, x0 = DX[i + 1] + 4, z0 = DZ[j] + 4, z1 = DZ[j + 1] - 4, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (i === 0 && j === 0) {   // Dorfmitte: Marktplatz, Kirche, Pizzeria, Feuerwehr
      decalT(cx, cz, x1 - x0, z1 - z0, MAT.concreteFloor, 2.7, 0, 0.008);
      // Kirche mit Turm und Spitze
      addBox(cx - 14, 0, cz - 9, 12, 9, 22, MAT.plaster, 2.7);
      addBox(cx - 14, 9, cz - 9, 13, 0.3, 23, MAT.roof, 2.5, { decor: true });
      addBox(cx - 14, 0, cz - 23, 6, 22, 6, MAT.plaster, 2.7);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(4.3, 10, 4), TKM.roofTile); spire.position.set(cx - 14, 27, cz - 23); spire.rotation.y = Math.PI / 4; spire.castShadow = true; scene.add(spire);
      tkSign(cx - 14, 16, cz - 26.05, 2.2, 2.2, Math.PI, tkSignMat('🕒', '#ffffff', '#111111', false, 128, 128));
      // Pizzeria (Firma)
      building(cx + 12, cz - 16, 14, 10, 1, MAT.brick, { s: [0] }, { crates: 0 });
      addBox(cx + 16, 0, cz - 17.5, 3.2, 1.05, 0.8, MAT.crate, 0); addBox(cx + 16, 1.05, cz - 17.5, 3.3, 0.06, 0.9, TKM.white, 1, { decor: true, round: 0 });   // Theke
      addBox(cx + 17.5, 0, cz - 20, 2.4, 1.9, 1.2, TKM.stone, 2); addBox(cx + 17.5, 0.6, cz - 19.38, 1.0, 0.55, 0.05, TKM.lantern, 0, { decor: true, round: 0 });   // Pizzaofen
      window.PIZZA_PICKUP = [cx + 16, cz - 16]; window.PIZZA_CHEF = [cx + 16, cz - 18.6];
      tkSign(cx + 12, 3.6, cz - 10.95, 8, 1.4, 0, tkSignMat('🍕 PIZZERIA BELLA', '#c0262b', '#ffffff', false));
      window.MAP_JOBS.push({ id: 'pizza', x: cx + 12, z: cz - 7 });
      // Feuerwehr
      addBox(cx + 12, 0, cz + 18, 16, 6, 10, MAT.ctrRed, 2.6);
      tkSign(cx + 12, 4.5, cz + 12.95, 9, 1.2, Math.PI, tkSignMat('FEUERWEHR', '#ffffff', '#c0262b', false));
      window.MAP_JOBS.push({ id: 'fire', x: cx + 12, z: cz + 9.5 }); window.FIRE_BOSS = [cx + 15, cz + 11];   // Feuerwehr (Firma)
      // Marktbrunnen + Stände
      addBox(cx, 0, cz, 4, 0.8, 4, TKM.stone, 2); addBox(cx, 0.8, cz, 0.5, 1.6, 0.5, TKM.stone, 1);
      for (const k of [-1, 1]) { addBox(cx + k * 7, 0, cz + 4, 3, 1, 1.6, MAT.crate, 0); addBox(cx + k * 7, 2.2, cz + 4, 3.4, 0.1, 2.2, MAT.ctrOrange, 2.6, { decor: true }); }
      for (const [x, z] of [[cx + 6, cz - 6], [cx - 6, cz + 10]]) leafTree(x, z, 0.8);
      car(cx + 2, cz + 8, true); car(cx - 2, cz + 8, true); car(cx + 20, cz - 6, false);
      continue;
    }
    if (i === 2 && j === 2) {   // Badesee-Wiese
      decalT(cx, cz, x1 - x0, z1 - z0, MAT.grass, 2, 0, 0.009);
      const pond = new THREE.Mesh(new THREE.CircleGeometry(14, 32), TKM.water); pond.rotation.x = -Math.PI / 2; pond.position.set(cx, 0.03, cz); pond.userData.noMerge = true; scene.add(pond);
      for (let gx = -10; gx <= 10; gx += 5) for (let gz = -10; gz <= 10; gz += 5) if (Math.hypot(gx, gz) < 11) collider(cx + gx, 0, cz + gz, 5.5, 3, 5.5);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.3; leafTree(cx + Math.cos(a) * 21, cz + Math.sin(a) * 21, 0.9); }
      continue;
    }
    // Wohnstraße: Gehwege rundum, je 4 Grundstücke an der Nord- und Südseite (Haus begehbar, Zaun, Vorgarten, Garten)
    decalT(cx, cz, x1 - x0, z1 - z0, MAT.grass, 2, 0, 0.009);
    const SW = 2.2;
    decalT(cx, z0 + SW / 2, x1 - x0, SW, MAT.concreteFloor, 2.7, 0, 0.012); decalT(cx, z1 - SW / 2, x1 - x0, SW, MAT.concreteFloor, 2.7, 0, 0.012);
    decalT(x0 + SW / 2, cz, SW, z1 - z0, MAT.concreteFloor, 2.7, 0, 0.012); decalT(x1 - SW / 2, cz, SW, z1 - z0, MAT.concreteFloor, 2.7, 0, 0.012);
    const px0 = x0 + SW + 0.2, pw = (x1 - SW - 0.2 - px0) / 4;
    for (const [zs, face] of [[z0, -1], [z1, 1]]) {
      for (let k = 0; k < 4; k++) weltPlot(px0 + k * pw, px0 + (k + 1) * pw, zs, face, cz, houseMats[Math.floor(srand() * houseMats.length)]);
      const zf = zs - face * 2.4;
      addBox(px0 + 4 * pw, 0, (zf + cz) / 2, 0.08, 0.85, Math.abs(cz - zf), TKM.wood, 1, { round: 0 });   // Zaun am Blockende
      for (let k = 1; k < 4; k++) leafTree(px0 + k * pw, zs - face * 1.1, 0.7);   // Straßenbäume
    }
    addBox((px0 + x1 - SW - 0.2) / 2, 0, cz, x1 - SW - 0.2 - px0, 1.0, 0.08, TKM.wood, 1, { round: 0 });   // Gartenzaun hinten
    tkLamp(x0 + 1, z0 + 1, 1, 0); tkLamp(x1 - 1, z1 - 1, -1, 0);
    if (srand() < 0.5) car(x0 + 1.1, cz + srnd(-12, 12), false);
  }

  /* ===== BAUERNHOF „Hof Huber“ (Südosten) ===== */
  road(150, 8, 150, 290, 6, 'none', MAT.dirt); road(8, 150, 290, 150, 6, 'none', MAT.dirt);
  const FIELDS = window.FARM_FIELDS = [];
  const fieldMats = [F_WHEAT, F_GREEN, F_PLOW, F_RAPE, F_WHEAT, F_GREEN];
  let fi = 0;
  for (const [x0, x1] of [[16, 145], [155, 292]]) for (const [z0, z1] of [[52, 145], [155, 292]]) {
    if (x0 === 155 && z0 === 155) continue;   // Hofgelände
    if (x0 === 155 && z0 === 52) continue;    // Drift-Arena
    const fm = fieldMats[fi++ % fieldMats.length];
    decalT((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, fm, 4, 0, 0.007);
    FIELDS.push([x0 + 6, z0 + 6, x1 - 6, z1 - 6]);
    hillMeshRect(x0, x1, z0, z1, fm, 4);   // Hügel im Feld (gleiche Feld-Oberfläche)
    for (let z = z0 + 3; z < z1; z += 3) if (hillH((x0 + x1) / 2, z) < 0.05 && hillH(x0 + 10, z) < 0.05 && hillH(x1 - 10, z) < 0.05) decalT((x0 + x1) / 2, z, x1 - x0 - 2, 0.25, F_PLOW, 4, 0, 0.009);   // Furchen (nur wo es flach ist)
  }
  // Hofgebäude
  decalT(223.5, 223.5, 137, 137, FARM.meadow, 3, 0, 0.007);    // Wiese
  decalT(232, 212, 84, 56, MAT.dirt, 4.5, 0, 0.008);          // Hofplatz
  decalT(172, 190, 44, 6, MAT.dirt, 4.5, 0, 0.009);           // Zufahrt vom Feldweg
  fachwerkHouse(205, 190, 14, 10);   // Bauernhaus (Fachwerk)
  addAddr(205, 180, 'hof', 205, 184.4);
  // Scheune (begehbar, großes Tor nach Norden), innen Stellfläche für die Strohballen
  wallRun('x', 228, 252, 202.2, 0, 9, 0.4, MAT.ctrRed, [[234, 246, 0, 6]], { round: 0 });
  wallRun('x', 228, 252, 217.8, 0, 9, 0.4, MAT.ctrRed, [], { round: 0 });
  wallRun('z', 202.4, 217.6, 228.2, 0, 9, 0.4, MAT.ctrRed, [], { round: 0 });
  wallRun('z', 202.4, 217.6, 251.8, 0, 9, 0.4, MAT.ctrRed, [], { round: 0 });
  // Scheunendach: Satteldach (innen bleibt die Decke bei 9 m), weiße Ecken/Kanten, Tor-Rahmen, Heuluke
  collider(240, 9, 210, 25, 0.4, 17);
  { const rise = 5.5, run = 8.4 + 0.6, slope = Math.hypot(run, rise), ang = Math.atan2(rise, run);
    for (const s of [1, -1]) { const r = new THREE.Mesh(boxGeo(25.6, 0.22, slope, 2.5), MAT.roof); r.position.set(240, 9 + rise / 2, 210 + s * run / 2); r.rotation.x = s * ang; r.castShadow = true; r.receiveShadow = true; scene.add(r); }
    const gs = new THREE.Shape(); gs.moveTo(-8.2, 0); gs.lineTo(8.2, 0); gs.lineTo(0, rise); gs.closePath();
    for (const s of [1, -1]) { const gm = new THREE.Mesh(withUv2(new THREE.ShapeGeometry(gs)), FARM.barnRed); gm.position.set(240 + s * 12, 9, 210); gm.rotation.y = s * Math.PI / 2; scene.add(gm); }
    const W = { decor: true, round: 0, shadow: false };
    for (const [x, z] of [[227.9, 201.9], [252.1, 201.9], [227.9, 218.1], [252.1, 218.1]]) addBox(x, 0, z, 0.35, 9, 0.35, TKM.white, 1, W);
    addBox(240, 0, 201.9, 0.3, 6.2, 0.3, TKM.white, 1, W);
    for (const x of [233.85, 246.15]) addBox(x, 0, 201.9, 0.3, 6.2, 0.3, TKM.white, 1, W);
    addBox(240, 6.0, 201.9, 12.6, 0.3, 0.3, TKM.white, 1, W);
    addBox(240, 6.9, 201.95, 3, 1.8, 0.1, FARM.black, 1, W); addBox(240, 6.75, 201.9, 3.4, 0.2, 0.2, TKM.white, 1, W);
    for (const [a, b] of [[234, 240], [240, 246]]) {   // Torflügel stehen offen (nach außen gedreht)
      addBox(a === 234 ? 233.2 : 246.8, 0, 199, 0.15, 5.8, 5.6, FARM.barnRed, 1, { round: 0 });
    }
  }
  decalT(240, 210, 23, 15, MAT.dirt, 4.5, 0, 0.013);
  for (const [x, z] of [[231, 215], [232.4, 215], [231, 213.6]]) crate(x, 0, z, 1.1);
  tkSign(240, 7, 201.95, 10, 1.5, Math.PI, tkSignMat('HOF HUBER', '#ffffff', '#7a1e12', false));
  window.MAP_JOBS.push({ id: 'farm', x: 228, z: 198 });
  window.FARM_BARN = [240, 207]; window.FARM_BOSS = [224, 198];
  for (const [x, z] of [[262, 200], [262, 212]]) {
    const silo = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(3, 3, 16, 24)), MAT.hallMetal); silo.position.set(x, 8, z); silo.castShadow = true; scene.add(silo);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.hallMetal); cap.position.set(x, 16, z); scene.add(cap);
    collider(x, 0, z, 5.6, 16, 5.6);
  }
  // Traktor (Kulisse + Deckung)
  addBox(215, 0.6, 230, 3.2, 1.4, 1.9, MAT.ctrGreen, 2.6, { round: 0.15 }); addBox(214.3, 2.0, 230, 1.6, 1.4, 1.6, CAR_GLASS, 0, { decor: true, round: 0.1 });
  for (const [x, r] of [[213.8, 0.85], [216.6, 0.5]]) for (const s of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 20), TIRE); wh.rotation.x = Math.PI / 2; wh.position.set(x, r, 230 + s * 1.1); wh.castShadow = true; scene.add(wh); }
  // Zäune und Strohballen
  for (let x = 160; x < 290; x += 4) addBox(x, 0.5, 156, 4, 0.12, 0.12, TKM.wood, 1, { decor: true, round: 0 });
  for (let z = 160; z < 290; z += 4) if (z < 184 || z > 196) addBox(156, 0.5, z, 0.12, 0.12, 4, TKM.wood, 1, { decor: true, round: 0 });   // Lücke für die Zufahrt
  for (const z of [186.6, 193.4]) addBox(156, 0, z, 0.3, 1.6, 0.3, TKM.wood, 1, { round: 0 });   // Torpfosten
  { const hs = tkSignMat('HOF HUBER', '#ffffff', '#7a1e12', false); tkSign(155.9, 2.05, 190, 3.4, 0.7, -Math.PI / 2, hs); tkSign(156.1, 2.05, 190, 3.4, 0.7, Math.PI / 2, hs); }
  addBox(156, 1.6, 190, 0.2, 0.2, 7.2, TKM.wood, 1, { decor: true, round: 0 });
  farmExtras();
  // Windmühle auf dem großen Feldhügel, Kapelle auf dem Hügel im Hügel-Ring
  { const wx = 58, wz = 95, y = hillH(wx, wz);
    const tw = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(2.3, 3.3, 11, 12)), MAT.plaster); tw.position.set(wx, y + 5.3, wz); tw.castShadow = true; scene.add(tw);
    collider(wx, y - 1, wz, 6, 12, 6);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.8, 3.2, 12), MAT.roof); cap.position.set(wx, y + 12.3, wz); scene.add(cap);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.3), MAT.door); door.position.set(wx, y + 1.15, wz - 3.12); door.rotation.y = Math.PI; scene.add(door);
    const sails = new THREE.Group(); sails.position.set(wx, y + 10.3, wz - 3.2); scene.add(sails);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; sails.add(arm);
      const spar = new THREE.Mesh(boxGeo(0.25, 7.5, 0.2, 0), TKM.wood); spar.position.y = 3.9; arm.add(spar);
      const sail = new THREE.Mesh(boxGeo(1.4, 6, 0.05, 0), TKM.white); sail.position.set(0.8, 4.4, 0); arm.add(sail);
    }
    noMergeDeep(sails); window.WINDMILLS.push({ o: sails, axis: 'z', s: 0.6 }); }
  { const cx = 46, cz = 214, y = hillH(cx, cz);
    addBox(cx, y - 1.5, cz, 6, 6.3, 9, MAT.plaster, 2.7);
    for (const s of [1, -1]) { const r = new THREE.Mesh(boxGeo(0.15, 4.2, 9.6, 2.5), MAT.roof); r.position.set(cx + s * 1.6, y + 5.7, cz); r.rotation.z = s * 0.95; scene.add(r); }
    addBox(cx, y - 1.5, cz - 5.4, 2.6, 10, 2.6, MAT.plaster, 2.7);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 4), TKM.roofTile); sp.position.set(cx, y + 10.5, cz - 5.4); sp.rotation.y = Math.PI / 4; scene.add(sp);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), MAT.door); door.position.set(cx, y + 1.1, cz - 6.72); door.rotation.y = Math.PI; scene.add(door); }
  const hay = new THREE.MeshStandardMaterial({ color: 0xc9a54e, roughness: 1, bumpMap: TEX.blades, bumpScale: 0.02 });
  for (const [x, z] of [[230, 230], [232, 232], [250, 240], [195, 215], [197, 217]]) { const m = new THREE.Mesh(withUv2(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 16)), hay); m.rotation.z = Math.PI / 2; m.position.set(x, 0.75, z); m.castShadow = true; scene.add(m); collider(x, 0, z, 1.3, 1.5, 1.5); }
  carSpot(222, 196, Math.PI); car(200, 200, true);
  // Moto-Hügel am Feldrand
  addRamp(60, 152, 0, 5, P_TABLE(5, 5, 6, 1.6), MAT.dirt, 3); addRamp(100, 152, 0, 4, P_KICK(4, 1.2), MAT.rampWood);

  weltDriftArena();
  driftTrackBuild(TRK_FELD, 'Hügel-Ring', 'feld', MAT.dirt);

  /* ===== WALD mit See (Nordwesten) ===== */
  road(-150, -290, -150, -8, 6, 'none', MAT.dirt); road(-290, -150, -8, -150, 6, 'none', MAT.dirt);
  const LX = -205, LZ = -95, LR = 26;   // Waldsee
  // Hügel und ein Berg (ca. 32 m) in der Waldecke; Wege, See, Hütte und Aussichtsturm bleiben flach
  // Waldboden (dunkles Moos/Nadeln) – flach als Bodenbelag, auf den Hügeln als Gelände
  const F_FOREST = pbr('grass', 3, { map: tintedTex('grass', 0x3c4a2a), mat: { color: new THREE.Color(0.62, 0.66, 0.56) } });
  decalT(-152, -152, 280, 280, F_FOREST, 3, 0, 0.004);
  hillMeshRect(-292, -12, -292, -12, F_FOREST, 3);
  {
    // Felsen auf dem Gipfel
    const rock = new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: 0.95, flatShading: true });
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2 + srnd(-0.3, 0.3), r = srnd(4, 13), x = -228 + Math.cos(a) * r, z = -228 + Math.sin(a) * r, s = srnd(1.2, 2.6);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rock); m.position.set(x, hillH(x, z) + s * 0.25, z); m.rotation.set(srand() * 3, srand() * 3, 0); m.scale.y = 0.7; m.castShadow = true; scene.add(m);
      collider(x, hillH(x, z) - 0.5, z, s * 1.4, s * 1.1, s * 1.4);
    }
    // Gipfelkreuz
    const top = hillH(-228, -228);
    addBox(-228, top, -228, 0.25, 4.2, 0.25, TKM.wood, 1, { round: 0 }); addBox(-228, top + 2.9, -228, 0.2, 0.22, 1.8, TKM.wood, 1, { decor: true, round: 0 });
    almHut(-214, -214, 0);   // Berghütte knapp unter dem Gipfel
  }
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LR, 48), TKM.water); lake.rotation.x = -Math.PI / 2; lake.position.set(LX, 0.03, LZ); lake.userData.noMerge = true; scene.add(lake);
  for (let gx = -LR + 4; gx < LR; gx += 8) for (let gz = -LR + 4; gz < LR; gz += 8) if (Math.hypot(gx, gz) < LR - 5) collider(LX + gx, 0, LZ + gz, 8.5, 3, 8.5);
  house(LX + 34, LZ + 18, 7, 6, 3, TKM.wood);   // Hütte
  addAddr(LX + 34, LZ + 25, 'wald', LX + 34, LZ + 21.6);
  watchtower(-95, -230, 1);
  driftTrackBuild(TRK_WALD, 'Wald-Ring', 'wald', MAT.dirt);
  for (const [x, z] of [[-240, -240], [-236, -246], [-246, -238]]) { const y = hillH(x, z), t = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.2, 4), MAT.ctrOrange); t.position.set(x, y + 1.0, z); t.rotation.y = Math.PI / 4; scene.add(t); collider(x, y - 0.3, z, 2, 2.3, 2); }
  carSpot(LX + 34, LZ + 30, 0); car(-150, -60, false);
  // Bäume (instanziert) mit Stamm-Kollision
  const TN = 700, td = new THREE.Object3D();
  const leafM = new THREE.MeshLambertMaterial({ map: TEX.needles, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(0.75, 0.85, 0.7) });
  const trunksI = new THREE.InstancedMesh(trunkGeo, treeTrunkMat, TN), layersI = layerGeos.map(g => new THREE.InstancedMesh(g, leafM, TN));
  let placed = 0, tries = 0;
  while (placed < TN && tries++ < 14000) {
    const x = srnd(-292, -14), z = srnd(-292, -14);
    if (Math.abs(x + 150) < 7 || Math.abs(z + 150) < 7 || Math.abs(x) < 12 || Math.abs(z) < 12) continue;   // Wege frei
    if (Math.hypot(x - LX, z - LZ) < LR + 6 || Math.hypot(x - LX - 34, z - LZ - 22) < 12) continue;
    if (Math.hypot(x + 95, z + 230) < 10 || Math.hypot(x + 240, z + 242) < 10) continue;
    if (trackDist(x, z) < 11) continue;   // Drift-Strecke frei
    if (WELT_PICKS.some(p => Math.hypot(p.x - x, p.z - z) < 3)) continue;
    const s = srnd(0.8, 1.35), y = hillH(x, z);
    if (Math.hypot(x + 228, z + 228) < 11 || Math.hypot(x + 214, z + 214) < 8) continue;   // bis zum Gipfel bewaldet, nur Gipfelfelsen und Berghütte frei
    td.position.set(x, y - 0.15, z); td.scale.set(s, s * srnd(0.9, 1.25), s); td.rotation.y = srand() * 6; td.updateMatrix();
    trunksI.setMatrixAt(placed, td.matrix); for (const l of layersI) l.setMatrixAt(placed, td.matrix);
    treeCollider(x, y - 0.3, z, 0.6 * s, 4.3, 0.6 * s);
    placed++;
  }
  trunksI.count = placed; for (const l of layersI) { l.count = placed; l.castShadow = true; scene.add(l); }
  trunksI.castShadow = true; scene.add(trunksI);
  forestExtras(LX, LZ, LR);
  // Bäume entlang der Landstraßen
  for (let t = 52; t <= 280; t += 22) { leafTree(t, 13, 0.9); leafTree(-13, t, 0.9); }

  /* --- Wald außerhalb + Gras --- */
  const N = 260, dummy = new THREE.Object3D();
  const farLeafMat = new THREE.MeshLambertMaterial({ map: TEX.needles, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(0.75, 0.85, 0.7) });
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ map: TEX.bark }), N);
  const layers = layerGeos.map(g => new THREE.InstancedMesh(g, farLeafMat, N));
  for (let i = 0; i < N; i++) {
    let x, z; do { x = srnd(-560, 560); z = srnd(-560, 560); } while (window.mapEdge(x, z) < 74 || Math.abs(z) < 12);   // fester Zufall: bei allen Spielern gleich (Hauptstraße im Tal frei)
    const s = srnd(1.3, 2.3), y = window.terrainHeight(x, z);
    dummy.position.set(x, y - 0.2, z); dummy.scale.set(s, s * srnd(0.9, 1.3), s); dummy.rotation.y = srand() * 6;
    dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); for (const l of layers) l.setMatrixAt(i, dummy.matrix);
    if (Math.abs(x) < S && Math.abs(z) < S) treeCollider(x, y - 0.3, z, 0.6 * s, 5, 0.6 * s);   // jetzt erreichbar → fest
  }
  for (const l of layers) scene.add(l);
  scene.add(trunks);

  /* --- Panzer (an der Hauptstraße, beide Seiten) und Helikopter auf Landeplätzen --- */
  MAP_VEHICLES.push({ x: -60, z: 21, yaw: 0, kind: 'tank' }, { x: 66, z: 24, yaw: Math.PI, kind: 'tank' });
  { const hp = new THREE.MeshStandardMaterial({ map: (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      g.fillStyle = '#5d6168'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
      g.lineWidth = 10; g.strokeStyle = '#f2d21b'; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
      g.fillStyle = '#f4f4f4'; g.fillRect(78, 64, 22, 128); g.fillRect(156, 64, 22, 128); g.fillRect(78, 117, 100, 22);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })(), transparent: true, alphaTest: 0.5, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const [x, z] of [[129, 28], [-130, 21], [985, 45]]) {   // dritter Platz: am Flughafen
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), hp); pad.rotation.x = -Math.PI / 2; pad.position.set(x, 0.02, z); scene.add(pad);
      MAP_VEHICLES.push({ x, z, yaw: Math.PI / 2, kind: 'heli' });
    }
  }
  weltF1(road); weltAirport(road);   // vor dem Ring: Strecke frei halten (Bäume)
  weltRing(road, S);

  /* --- Mopeds --- */
  for (const [x, z, ax] of [[-6, -20, false], [6, 40, false], [-60, 8, true], [70, -6, true], [-55, 70, false], [-110, 62, false], [120, -35, true], [230, -100, true], [-150, -20, false], [160, 140, true]]) car(x, z, ax);

  /* --- Waffen zum Aufsammeln --- */
  MAP_PICKUPS.push(...WELT_PICKS);
  for (const p of MAP_PICKUPS) if (!p.y) p.y = hillH(p.x, p.z);   // auf die Hügel setzen
}

// gewählte Karte bauen (Auswahl im Menü, wird beim Laden festgelegt)
if (MAP_ID === 'hafen') {
  window.MAP_STREETS = [[-14, -62, -6, 131], [-62, -5, 56, 5]]; window.FIRE_POS = [38, -1.2]; window.SHIP_SMOKE = [92, 16, 34];
  buildHafenMap();
} else if (MAP_ID === 'welt') {
  window.MAP_STREETS = [[-300, -6.5, 300, 6.5], [-6.5, -300, 6.5, 300], ...[40, 100, 160, 220, 280].map(x => [x - 4.5, -290, x + 4.5, -30]), ...[-40, -100, -160, -220, -280].map(z => [30, z - 4.5, 290, z + 4.5]),
    ...[-40, -110, -180, -250].map(x => [x - 4, 30, x + 4, 290]), ...[40, 110, 180, 250].map(z => [-290, z - 4, -30, z + 4])];
  window.FIRE_POS = [9999, 9999]; window.SHIP_SMOKE = [9999, 16, 9999];
  buildWeltMap();
} else buildTokyoMap();

/* Alle festen Karten-Objekte pro Material zu einem Objekt zusammenfassen (viel weniger Zeichenaufrufe) */
// Auf der großen Karte „Welt“ in 70-m-Stücken zusammenfassen: dann zeichnet die Grafikkarte nur, was im Blick und nah genug ist
const CHUNK = MAP_ID === 'welt' ? 160 : 0;
let CULL_DIST = 250;
(function mergeStatic() {
  scene.updateMatrixWorld(true);
  const byMat = new Map(), old = [], bb = new THREE.Box3(), ctr = new THREE.Vector3();
  scene.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o === skyMesh || o.userData.noMerge) return;
    const g = o.geometry.clone();
    if (!g.attributes.uv2) g.setAttribute('uv2', g.attributes.uv);
    g.applyMatrix4(o.matrixWorld);
    let key = o.material;
    if (CHUNK) {
      g.computeBoundingBox(); bb.copy(g.boundingBox).getCenter(ctr);
      const big = bb.max.x - bb.min.x > CHUNK * 2 || bb.max.z - bb.min.z > CHUNK * 2;   // Boden, Straßen, Mauern: ein Stück
      key = big ? o.material.uuid + '|big' : o.material.uuid + '|' + Math.floor(ctr.x / CHUNK) + ',' + Math.floor(ctr.z / CHUNK);
    }
    let e = byMat.get(key);
    if (!e) byMat.set(key, e = { mat: o.material, geos: [], cast: false, big: CHUNK && key.endsWith('|big') });
    e.geos.push(g); e.cast = e.cast || o.castShadow;
    old.push(o);
  });
  for (const o of old) o.parent.remove(o);
  mapMeshes.length = 0;
  for (const e of byMat.values()) {
    // Gemischte Geometrie-Arten (mit/ohne Index) vorher angleichen
    if (e.geos.some(g => g.index) && e.geos.some(g => !g.index)) e.geos = e.geos.map(g => g.index ? g.toNonIndexed() : g);
    const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(e.geos);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, e.mat);
    m.castShadow = e.cast; m.receiveShadow = true;
    if (CHUNK && !e.big) { merged.computeBoundingSphere(); m.userData.cull = merged.boundingSphere; }
    scene.add(m); mapMeshes.push(m);
  }
})();
// Weit entfernte Stücke ausblenden (liegen im Nebel)
let cullT = 0;
// Große instanzierte Gruppen (Wälder, Büsche, Gras): Bereich aus den Positionen bestimmen → weit weg (im Nebel) ausblenden
const FAR_GROUPS = [];
if (CHUNK) {
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3();
  scene.traverse(o => {
    if (!o.isInstancedMesh || o.count < 30) return;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    o.frustumCulled = false;   // three.js r128 kennt die Lage der Instanzen nicht → selbst per Entfernung ausblenden
    FAR_GROUPS.push({ o, r: [x0, z0, x1, z1] });
  });
}
// Einfachere Baumformen (weniger Ecken, gleiche Größe/Lage) für „Leistung“ und darunter – schon beim Laden vorbereitet
const LOD_GEO = new Map(), _ca = new THREE.Vector3(), _cb = new THREE.Vector3();
function lowGeo(g) {
  if (LOD_GEO.has(g)) return LOD_GEO.get(g);
  const p = g.parameters || {}; let n = null;
  if (g.type === 'ConeGeometry' && p.radialSegments > 8) n = new THREE.ConeGeometry(p.radius, p.height, Math.round(p.radialSegments / 2.5), 1, p.openEnded);
  else if (g.type === 'CylinderGeometry' && p.radialSegments > 8) n = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, Math.round(p.radialSegments / 2), 1, p.openEnded);
  else if (g.type === 'IcosahedronGeometry' && p.detail > 0) n = new THREE.IcosahedronGeometry(p.radius, 0);
  if (n) { g.computeBoundingBox(); n.computeBoundingBox(); g.boundingBox.getCenter(_ca); n.boundingBox.getCenter(_cb); n.translate(_ca.x - _cb.x, _ca.y - _cb.y, _ca.z - _cb.z); withUv2(n); }
  LOD_GEO.set(g, n); return n;
}
for (const fg of FAR_GROUPS) { fg.geoHi = fg.o.geometry; fg.geoLo = lowGeo(fg.o.geometry); }
window.setTreeLOD = lo => { for (const fg of FAR_GROUPS) if (fg.geoLo) fg.o.geometry = lo ? fg.geoLo : fg.geoHi; };
// Feste Kartenteile (zusammengefasste Häuser/Boden, Wälder, Gras) bewegen sich nie: Lage einmal berechnen,
// danach nicht mehr in jedem Bild (spart Rechenzeit)
for (const m of mapMeshes) { m.updateMatrix(); m.updateMatrixWorld(true); m.matrixAutoUpdate = false; }
for (const g of FAR_GROUPS) { g.o.updateMatrix(); g.o.updateMatrixWorld(true); g.o.matrixAutoUpdate = false; }
// Aufräumen nach dem Zusammenfassen: leere Hüllen (Gruppen ohne Inhalt) entfernen – sie würden sonst jedes Bild mitgerechnet
{ const hasMesh = o => o.isMesh || o.isLight || o.isSprite || o.isLine || o.isPoints || o.children.some(hasMesh);
  const empty = []; for (const c of scene.children) if (c.type === 'Group' && !hasMesh(c)) empty.push(c);
  for (const c of empty) scene.remove(c); }
// Alles, was die Karte bis hierher gebaut hat, bewegt sich nie (außer Windrad-Flügel): Lage einfrieren
{ const DYN = new Set([camera, sun, sun.target, skyMesh, ...(window.WINDMILLS || []).map(w => w.o)]);
  const freeze = o => { if (DYN.has(o)) return; o.updateMatrix(); o.matrixAutoUpdate = false; for (const c of o.children) freeze(c); };
  for (const c of scene.children) if (!c.isLight) freeze(c);
  scene.updateMatrixWorld(true); }
window.cullChunks = dt => {
  for (const w of window.WINDMILLS || []) w.o.rotation[w.axis] += w.s * dt;   // Windräder / Windmühle
  if (gfx === 'potato') potatoTick(dt);
  if (!CHUNK) return;
  cullT -= dt; if (cullT > 0) return; cullT = 0.2;
  const c = camera.position;
  for (const g of window.SHOP_DISPLAYS || []) g.visible = Math.hypot(g.userData.c[0] - c.x, g.userData.c[1] - c.z) < 70;   // Waffen im Laden nur in der Nähe zeichnen
  for (const g of FAR_GROUPS) {
    const dx = Math.max(g.r[0] - c.x, 0, c.x - g.r[2]), dz = Math.max(g.r[1] - c.z, 0, c.z - g.r[3]);
    g.o.visible = Math.hypot(dx, dz) < CULL_DIST + 70 && (g.o !== window.grassI || !gfxLow()) && !(g.o.userData.foliage && gfxClean());
  }
  for (const m of mapMeshes) { const s = m.userData.cull; if (s) m.visible = c.distanceTo(s.center) - s.radius < CULL_DIST && !(m.userData.foliage && gfxClean()); }
};

/* „Sehr niedrig“ für schwache PCs: einfache Licht-Berechnung (Lambert statt PBR), halbe Auflösung, kurze Sichtweite.
   Die Original-Materialien bleiben gespeichert und kommen beim Umschalten zurück. */
const LAMB = new Map(), FOG0 = { near: scene.fog.near, far: scene.fog.far, cam: camera.far, cull: CULL_DIST };
const MAT_DEFAULT_OBC = THREE.Material.prototype.onBeforeCompile;
function toLambert(m) {
  if (!m || !(m.isMeshStandardMaterial || m.isMeshPhongMaterial) || m.onBeforeCompile !== MAT_DEFAULT_OBC) return m;   // eigene Shader (Lackierung) bleiben
  let l = LAMB.get(m); if (l) return l;
  l = new THREE.MeshLambertMaterial({ map: m.map, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity,
    side: m.side, alphaTest: m.alphaTest, vertexColors: m.vertexColors, depthWrite: m.depthWrite, depthTest: m.depthTest, fog: m.fog, skinning: m.skinning,
    morphTargets: m.morphTargets, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits, visible: m.visible });
  l.color = m.color; l.emissive = m.emissive;   // gleiche Farb-Objekte → Farbwechsel (Treffer, Tag/Nacht) wirken weiter
  l.userData.orig = m; l.userData.last = [m.opacity, m.visible, m.transparent, m.map, m.emissiveIntensity];
  LAMB.set(m, l); return l;
}
function swapMats(toLow) {
  scene.traverse(o => {
    if (!o.material || o === skyMesh) return;
    if (toLow) {
      if (Array.isArray(o.material)) o.material = o.material.map(toLambert); else o.material = toLambert(o.material);
    } else {
      const back = m => (m && m.userData && m.userData.orig) || m;
      if (Array.isArray(o.material)) o.material = o.material.map(back); else o.material = back(o.material);
    }
  });
}
let potatoT = 0;
function potatoTick(dt) {
  // Änderungen am Original (Ausblenden, Durchsichtigkeit) übernehmen
  for (const [m, l] of LAMB) {
    const L = l.userData.last;
    if (m.opacity !== L[0]) { l.opacity = L[0] = m.opacity; }
    if (m.visible !== L[1]) { l.visible = L[1] = m.visible; }
    if (m.transparent !== L[2]) { l.transparent = L[2] = m.transparent; l.needsUpdate = true; }
    if (m.map !== L[3]) { l.map = L[3] = m.map; l.needsUpdate = true; }
    if (m.emissiveIntensity !== L[4]) { l.emissiveIntensity = L[4] = m.emissiveIntensity; }
  }
  potatoT -= dt; if (potatoT > 0) return; potatoT = 1;   // neue Objekte (Spieler, Autos, Effekte) jede Sekunde umstellen
  swapMats(true);
}
const gfxLow = () => gfx === 'low' || gfx === 'potato';
const gfxClean = () => gfx === 'clean';
/* „Klar & schnell“: Laub, Nadeln, Gras, Büsche und Schilf ausblenden (Stämme, Steine und Hecken bleiben – die sind fest)
   und Relief-Texturen (Normal-/Rauheits-/AO-Karten) abschalten. Beim Wechsel zurück kommt alles wieder. */
let FOLIAGE = null;
function foliageList() {
  if (FOLIAGE) return FOLIAGE;
  FOLIAGE = [];
  // Laub, Nadeln, Gras, Baumstämme (normal, Birke, Kulisse), Kirschblüten, Fensterscheiben – nicht: Hecken, umgestürzte Stämme
  const leafy = m => {
    if (!m) return false; const o = (m.userData && m.userData.orig) || m;
    if (o === HEDGE_MAT || o === LOG_MAT) return false;
    return o === leafMat2 || o === treeLeafMat || o === treeTrunkMat || o.userData.trunk || o === TKM.sakura || o === FURN.glass
      || o.map === TEX.needles || o.map === TEX.blades || o.map === TEX.bark;
  };
  scene.traverse(o => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    const p = o.geometry && o.geometry.parameters, reed = o.isInstancedMesh && o.geometry.type === 'ConeGeometry' && p && p.radius < 0.1;
    if (leafy(o.material) || reed) { o.userData.foliage = true; FOLIAGE.push(o); }
  });
  return FOLIAGE;
}
// Baum-Kollision an/aus (nur bei dir; in „Klar & schnell“ läuft und schießt man durch die – unsichtbaren – Bäume)
let TREE_ON = true;
function setTreeBoxes(on) {
  if (on === TREE_ON) return; TREE_ON = on;
  if (on) boxes.push(...TREE_BOXES);
  else { const s = new Set(TREE_BOXES), keep = boxes.filter(b => !s.has(b)); boxes.length = 0; boxes.push(...keep); }
  if (window.GRID_READY) gridIndex();
}
let RELIEF = null;
function setRelief(off) {
  if (!RELIEF) { RELIEF = new Set(); scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) if (m.normalMap || m.aoMap || m.roughnessMap || m.metalnessMap || m.bumpMap) RELIEF.add(m); }); }
  for (const m of RELIEF) {
    if (off && !m.userData.relief) {
      m.userData.relief = { n: m.normalMap, a: m.aoMap, r: m.roughnessMap, mt: m.metalnessMap, b: m.bumpMap, rough: m.roughness, metal: m.metalness };
      if (m.metalnessMap) { m.metalness = 0; m.roughness = 0.85; }   // Foto-Materialien: ohne ARM-Karte nicht metallisch
      m.normalMap = m.aoMap = m.roughnessMap = m.metalnessMap = m.bumpMap = null; m.needsUpdate = true;
    } else if (!off && m.userData.relief) {
      const s = m.userData.relief; m.normalMap = s.n; m.aoMap = s.a; m.roughnessMap = s.r; m.metalnessMap = s.mt; m.bumpMap = s.b; m.roughness = s.rough; m.metalness = s.metal;
      delete m.userData.relief; m.needsUpdate = true;
    }
  }
}
// Grafikstufen: Hoch / Mittel / Leistung / Klar & schnell / Niedrig / Sehr niedrig
function applyGfx(v) {
  const wasPotato = gfx === 'potato' && LAMB.size, wasClean = gfx === 'clean';
  gfx = v;
  const dpr = devicePixelRatio || 1, C = v === 'clean', thr = v === 'perf' || C;
  renderer.setPixelRatio(v === 'high' ? Math.min(dpr, 1.5) : v === 'medium' || C ? 1 : v === 'perf' ? 0.9 : v === 'low' ? 0.7 : 0.5);
  // „Leistung“/„Klar & schnell“: Schattenbild nicht in jedem Bild neu zeichnen (ui.js stößt es ~10× pro Sekunde an)
  renderer.shadowMap.autoUpdate = !thr; renderer.shadowMap.needsUpdate = true;
  // einfachere Schattenkanten (PCF statt weich gefiltert) – braucht neu übersetzte Shader
  const shType = C ? THREE.BasicShadowMap : thr ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;   // „Klar & schnell“: harte Schatten (1 Messpunkt pro Pixel)
  if (renderer.shadowMap.type !== shType) { renderer.shadowMap.type = shType; scene.traverse(o => { if (o.material) for (const mt of [].concat(o.material)) mt.needsUpdate = true; }); }
  if (window.setTreeLOD) window.setTreeLOD(thr || v === 'low' || v === 'potato');   // einfachere Baumformen
  sun.castShadow = !gfxLow();
  if (window.grassI) window.grassI.visible = !gfxLow() && !C;
  const P = v === 'potato';
  scene.fog.near = P ? FOG0.near * 0.45 : FOG0.near; scene.fog.far = P ? FOG0.far * 0.55 : FOG0.far;
  camera.far = P ? scene.fog.far + 10 : FOG0.cam; camera.updateProjectionMatrix();
  CULL_DIST = P ? 150 : v === 'low' ? 200 : C ? 190 : thr ? 215 : FOG0.cull;
  if (P) swapMats(true); else if (wasPotato) swapMats(false);
  if (C || wasClean) { for (const o of foliageList()) o.visible = !C; setRelief(C); setTreeBoxes(!C); }   // „Klar & schnell“ an/aus
  const size = v === 'high' ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  $('gfxIn').value = v;
  try { localStorage.setItem('kz_gfx2', v); } catch (e) {}
}
let gfx = TOUCH ? 'low' : 'medium';   // Handys starten mit niedriger Grafik
try { gfx = localStorage.getItem('kz_gfx2') || gfx; } catch (e) {}
applyGfx(gfx);
$('gfxIn').onchange = e => applyGfx(e.target.value);
// Startpunkte (auch Wegpunkte der Bots): Straßen, Plätze, Gassen
const SPAWNS_TOKIO = [[-12, -12], [12, -12], [-12, 12], [12, 12], [0, -40], [0, 40], [-40, 0], [40, 0], [-52, -25], [52, -25], [-52, 25], [52, 25],
  [-25, -52], [25, -52], [-25, 52], [25, 52], [-78, -66], [-26, -75], [-16, -63], [35, -66], [90, -73], [-88, -28], [-74.5, 22], [-14, 30], [24, 22],
  [64, -35], [59.5, 27], [79, 27], [-78, 78], [-84, 66], [-30, 64], [18, 62], [70, 72], [88, -58], [94, 0], [-94, 0], [0, 94], [0, -94], [-62, 52], [62, -4]];
const SPAWNS_HAFEN = [[-34, -40], [-55, -30], [-20, -36], [-52, -11], [-36, 18], [-24, 33], [-54, 52], [-40, 56],
  [-20, -10], [-20, 10], [0, 8.5], [0, -9], [6, -17.5], [29.6, -24.5], [13.6, -45.5], [50, -22], [26, 28], [5, 38], [40, 12], [20, 56],
  [-4, -56], [52, 45], [-58, 6], [30, -11],
  [-30, 72], [0, 82], [30, 95], [-45, 112], [12, 127], [46, 72], [-56, 90]];
const SPAWNS_WELT = [[0, -20], [0, 20], [-20, 0], [20, 0], [70, -35], [130, -45], [190, -100], [250, -160], [160, -220], [100, -260], [280, -60], [45, -150],
  [-75, 40], [-40, 75], [-110, 150], [-180, 110], [-250, 200], [-140, 250], [-60, 250], [150, 40], [150, 120], [200, 150], [260, 150], [150, 250], [100, 100],
  [-150, -40], [-150, -120], [-150, -250], [-60, -150], [-250, -150], [-171, -65]];
const SPAWNS = MAP_ID === 'hafen' ? SPAWNS_HAFEN : MAP_ID === 'welt' ? SPAWNS_WELT : SPAWNS_TOKIO;

/* ======================= Kollision (mit Raster für schnelle Suche) ======================= */
const GRID = 8, grid = new Map();
let gridStamp = 0;
function gridIndex() {
  grid.clear();
  for (const b of boxes) {
    for (let ix = Math.floor(b.min.x / GRID); ix <= Math.floor(b.max.x / GRID); ix++)
      for (let iz = Math.floor(b.min.z / GRID); iz <= Math.floor(b.max.z / GRID); iz++) {
        const k = ix * 4096 + iz; let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(b);
      }
  }
}
gridIndex(); window.GRID_READY = true;
function nearBoxes(x, z, r) {
  gridStamp++;
  const out = [];
  for (let ix = Math.floor((x - r) / GRID); ix <= Math.floor((x + r) / GRID); ix++)
    for (let iz = Math.floor((z - r) / GRID); iz <= Math.floor((z + r) / GRID); iz++) {
      const c = grid.get(ix * 4096 + iz); if (!c) continue;
      for (const b of c) if (b._s !== gridStamp) { b._s = gridStamp; out.push(b); }
    }
  return out;
}
let _near = boxes, _h = PH, _bodyR = PR;   // _h = Körperhöhe (kleiner beim Ducken), _r = Körperradius (Auto größer)
function overlap(p, b) {
  return p.x + _bodyR > b.min.x && p.x - _bodyR < b.max.x && p.y + _h > b.min.y && p.y < b.max.y && p.z + _bodyR > b.min.z && p.z - _bodyR < b.max.z;
}
function anyOverlap(p) { for (const b of _near) if (overlap(p, b)) return true; return false; }
function moveH(e, ax, amt, grounded) {
  if (!amt) return;
  e.pos[ax] += amt;
  // Schanzen: hohe Seiten-/Stirnflächen sind Wände, flache Schrägen kann man hochfahren
  if ((RAMPS.length || HILL) && groundH(e.pos.x, e.pos.z, e.pos.y) - e.pos.y > STEP * 0.6) { e.pos[ax] -= amt; e.blocked = true; return; }
  for (const b of _near) {
    if (!overlap(e.pos, b)) continue;
    const rise = b.max.y - e.pos.y;
    if (grounded && rise > 0 && rise <= STEP) {
      const oy = e.pos.y; e.pos.y = b.max.y + 0.001;
      if (!anyOverlap(e.pos)) continue;
      e.pos.y = oy;
    }
    e.pos[ax] = amt > 0 ? b.min[ax] - _bodyR - 0.001 : b.max[ax] + _bodyR + 0.001;
    e.blocked = true;
  }
}
function moveBody(e, dx, dy, dz) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.3));
  _near = nearBoxes(e.pos.x, e.pos.z, 2 + Math.abs(dx) + Math.abs(dz));
  _h = e.h || PH; _bodyR = e.r || PR;
  e.blocked = false;
  for (let i = 0; i < n; i++) {
    const was = e.onGround; e.onGround = false;
    e.pos.y += dy / n;
    const gh = groundH(e.pos.x, e.pos.z, e.pos.y);
    if (e.pos.y < gh) { e.pos.y = gh; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; }
    for (const b of _near) if (overlap(e.pos, b)) {
      if (dy <= 0) { e.pos.y = b.max.y; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; }
      else { e.pos.y = b.min.y - _h - 0.001; e.vel.y = 0; }
    }
    moveH(e, 'x', dx / n, was || e.onGround);
    moveH(e, 'z', dz / n, was || e.onGround);
  }
  const gEnd = groundH(e.pos.x, e.pos.z, e.pos.y);
  if (e.pos.y < gEnd) { e.pos.y = gEnd; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; }
  _near = boxes; _h = PH; _bodyR = PR;
}
/* Strahl gegen Kartenboxen + Boden: liefert {dist, point, normal} (für Schüsse und Sichtlinien) */
// Nur die Boxen in den Rasterzellen entlang des Strahls prüfen (viel schneller auf großen Karten)
let rayStamp = 0;
function rayCandidates(o, d, maxDist) {
  rayStamp++;
  const out = [], hx = Math.hypot(d.x, d.z);
  const len = hx < 1e-6 ? 0 : maxDist * hx, steps = Math.ceil(len / (GRID * 0.5)) + 1;
  for (let s = 0; s <= steps; s++) {
    const t = hx < 1e-6 ? 0 : Math.min(maxDist, (s * GRID * 0.5) / hx);
    const ix = Math.floor((o.x + d.x * t) / GRID), iz = Math.floor((o.z + d.z * t) / GRID);
    for (let ax = ix - 1; ax <= ix + 1; ax++) for (let az = iz - 1; az <= iz + 1; az++) {
      const c = grid.get(ax * 4096 + az); if (!c) continue;
      for (const b of c) if (b._ray !== rayStamp) { b._ray = rayStamp; out.push(b); }
    }
  }
  return out;
}
function rayMap(o, d, maxDist = 300) {
  let best = maxDist, nrm = null;
  if (d.y < -1e-6) { const t = -o.y / d.y; if (t > 0 && t < best) { best = t; nrm = [0, 1, 0]; } }
  for (const b of rayCandidates(o, d, maxDist)) {
    let tmin = 0, tmax = best, ax = -1, sgn = 0;
    for (let a = 0; a < 3; a++) {
      const k = a === 0 ? 'x' : a === 1 ? 'y' : 'z';
      const od = o[k], dd = d[k];
      if (Math.abs(dd) < 1e-9) { if (od < b.min[k] || od > b.max[k]) { tmin = Infinity; break; } continue; }
      let t1 = (b.min[k] - od) / dd, t2 = (b.max[k] - od) / dd, s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; ax = a; sgn = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) { tmin = Infinity; break; }
    }
    if (tmin < best && tmin > 0 && ax >= 0) { best = tmin; nrm = [0, 0, 0]; nrm[ax] = sgn; }
  }
  // Schanzen: Strahl in kleinen Schritten durch den Bereich der Schanze verfolgen
  for (const r of RAMPS) {
    let t0 = 0, t1 = best;
    const mn = [r.bx0, r.base, r.bz0], mx = [r.bx1, r.H, r.bz1], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    for (let a = 0; a < 3 && t0 <= t1; a++) {
      if (Math.abs(dd[a]) < 1e-9) { if (oo[a] < mn[a] || oo[a] > mx[a]) t0 = Infinity; continue; }
      let ta = (mn[a] - oo[a]) / dd[a], tb = (mx[a] - oo[a]) / dd[a]; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (!(t0 <= t1)) continue;
    const below = t => o.y + d.y * t <= rampH(r, o.x + d.x * t, o.z + d.z * t) - 0.001;
    for (let t = Math.max(t0, 0.001); t <= t1 + 0.2; t += 0.2) {
      if (!below(t)) continue;
      let lo = Math.max(0, t - 0.2), hi = t;
      for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; if (below(mid)) hi = mid; else lo = mid; }
      if (hi < best) { best = hi; nrm = [0, 1, 0]; }
      break;
    }
  }
  // Hügel: Strahl in 1-m-Schritten durch das Hügelgebiet verfolgen, dann genau nachsuchen
  for (const H of HILLS) {
    let t0 = 0, t1 = best;
    const mn = [H.x0, -1, H.z0], mx = [H.x1, H.max + 0.5, H.z1], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    for (let a = 0; a < 3 && t0 <= t1; a++) {
      if (Math.abs(dd[a]) < 1e-9) { if (oo[a] < mn[a] || oo[a] > mx[a]) t0 = Infinity; continue; }
      let ta = (mn[a] - oo[a]) / dd[a], tb = (mx[a] - oo[a]) / dd[a]; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (t0 <= t1) {
      const below = t => o.y + d.y * t <= hillRegionH(H, o.x + d.x * t, o.z + d.z * t) - 0.001;
      for (let t = Math.max(t0, 0.001); t <= t1 + 1; t += 1) {
        if (!below(t)) continue;
        let lo = Math.max(0, t - 1), hi = t;
        for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2; if (below(mid)) hi = mid; else lo = mid; }
        if (hi < best && hi > 0.02) { best = hi; nrm = [0, 1, 0]; }
        break;
      }
    }
  }
  if (!nrm) return null;
  return { dist: best, point: new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best), normal: new THREE.Vector3(nrm[0], nrm[1], nrm[2]) };
}