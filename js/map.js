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
// Wie stark Kanten je nach Material abgerundet werden (Meter)
function defaultRound(mat) {
  if (mat === MAT.sandbag) return 0.24;
  if (mat === MAT.crate) return 0.05;
  if (mat === MAT.ctrRed || mat === MAT.ctrBlue || mat === MAT.ctrGreen || mat === MAT.ctrOrange) return 0.05;
  if (mat === MAT.metal || mat === MAT.yellow || mat === MAT.dark) return 0.03;
  return 0.025;   // Beton, Ziegel, Putz …: leicht gebrochene Kanten
}
function addBox(x, y, z, w, h, d, mat, tile = 2, opts = {}) {
  const t = tile === 0 ? 0 : (mat.userData.tile || tile);
  const r = opts.round !== undefined ? opts.round : defaultRound(mat);
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
function wallRun(axis, from, to, at, y, h, t, mat, openings = []) {
  const seg = (a, b, y0, hh) => {
    if (b - a <= 0.02 || hh <= 0.02) return;
    const c = (a + b) / 2, len = b - a;
    if (axis === 'x') addBox(c, y0, at, len, hh, t, mat, 2); else addBox(at, y0, c, t, hh, len, mat, 2);
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
  return a[1] + (b[1] - a[1]) * Math.min(1, Math.max(0, t));
}
// Bodenhöhe an einer Stelle (0 = flach, sonst Schanze)
function groundH(x, z) {
  let h = 0;
  for (const r of RAMPS) {
    if (x < r.bx0 || x > r.bx1 || z < r.bz0 || z > r.bz1) continue;
    const hh = rampH(r, x, z); if (hh > h) h = hh;
  }
  return h;
}
function addRamp(x, z, a, w, prof, mat, tile = 2) {
  const fx = Math.cos(a), fz = Math.sin(a), L = prof[prof.length - 1][0];
  const r = { x, z, fx, fz, w, prof, L, H: Math.max(...prof.map(p => p[1])) };
  const P = (u, v, h) => [x + u * fx - v * fz, h, z + u * fz + v * fx];
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
const TREE_LAYERS = [[2.4, 2.6, 2.0], [2.0, 2.4, 3.2], [1.6, 2.2, 4.3], [1.2, 2.0, 5.3], [0.75, 1.7, 6.2]];
const trunkGeo = new THREE.CylinderGeometry(0.12, 0.26, 6.5, 12); trunkGeo.translate(0, 3.25, 0);
const layerGeos = TREE_LAYERS.map(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, 18, 1, true); g.translate(0, y, 0); return g; });
function tree(x, z, s = 1, solid = true) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.set(s, s * srnd(0.9, 1.15), s); g.rotation.y = srand() * 6;
  const tr = new THREE.Mesh(trunkGeo, treeTrunkMat); tr.castShadow = true; g.add(tr);
  for (const lg of layerGeos) { const c = new THREE.Mesh(lg, treeLeafMat); c.castShadow = true; c.receiveShadow = true; g.add(c); }
  scene.add(g);
  if (solid) collider(x, 0, z, 0.5 * s, 3 * s, 0.5 * s);
}
// Laubbaum (rundere Krone) für den Park
const leafMat2 = new THREE.MeshStandardMaterial({ map: TEX.needles, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, color: new THREE.Color(0.9, 1.0, 0.7) });
function leafTree(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 4, 12), treeTrunkMat); tr.position.y = 2; tr.castShadow = true; g.add(tr);
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(srnd(1.2, 1.8), 16, 12), leafMat2);
    c.position.set(srnd(-1, 1), srnd(3.8, 5.4), srnd(-1, 1)); c.castShadow = true; g.add(c);
  }
  scene.add(g);
  collider(x, 0, z, 0.55 * s, 3.5 * s, 0.55 * s);
}
// Haus mit Satteldach (geschlossen)
function house(x, z, w, d, h) {
  addBox(x, 0, z, w, h, d, MAT.brick, 2.5);
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
    const gm = new THREE.Mesh(withUv2(gg), MAT.brick);
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
      wallRun(S.axis, S.a0, S.a1, S.at, f * FH, FH, T, mat, ops);
    }
  }
  for (const k in sides) { const S = sides[k]; wallRun(S.axis, S.a0, S.a1, S.at, floors * FH, 1.0, T, mat); }  // Dachbrüstung
  // Treppen: abwechselnd in zwei Spuren an der Westwand, je 5 Stufen à 0,64 m
  const ix0 = x0 + T, ix1 = x1 - T, iz0 = z0 + T, iz1 = z1 - T;
  // Gegenläufige Treppen: gerade Stockwerke laufen nach +z (Spur A), ungerade nach -z (Spur B)
  const zs = iz0 + 1.2, ze = zs + 4.5;
  const colX = [ix0 + 0.6, ix0 + 1.95];
  for (let f = 0; f < floors; f++) {
    const cxs = colX[f % 2], up = f % 2 === 0;
    for (let k = 0; k < 5; k++) addBox(cxs, f * FH, up ? zs + (k + 0.5) * 0.9 : ze - (k + 0.5) * 0.9, 1.2, (k + 1) * 0.64, 0.9, MAT.concrete, 1);
  }
  // Decken mit Loch über der jeweiligen Treppe + Geländer
  for (let L = 1; L <= floors; L++) {
    const hx = colX[(L - 1) % 2], hx0 = hx - 0.65, hx1 = hx + 0.65, hz0 = zs, hz1 = ze;
    const y = L * FH - 0.2;
    const slab = (a, b, c, e) => { if (b - a > 0.05 && e - c > 0.05) addBox((a + b) / 2, y, (c + e) / 2, b - a, 0.2, e - c, MAT.concrete, 2); };
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
const SPOKE_GEO = [0.35, 0.37].map(R => withUv2(new THREE.BoxGeometry(0.032, R * 1.38, 0.025)));
// Statt Autos: Abstellplätze für fahrbare Mopeds (werden in vehicles.js gebaut und gesteuert)
const MAP_VEHICLES = [];
function car(x, z, alongX) {
  const yaw = (alongX ? 0 : -Math.PI / 2) + (srand() < 0.5 ? Math.PI : 0) + srnd(-0.25, 0.25);
  MAP_VEHICLES.push({ x, z, yaw });
}
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
function hedge(x, z, w, d) { addBox(x, 0, z, w, 1.1, d, HEDGE_MAT, 1, { round: 0.45 }); }
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

(function buildMap() {
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
})();

/* Alle festen Karten-Objekte pro Material zu einem Objekt zusammenfassen (viel weniger Zeichenaufrufe) */
(function mergeStatic() {
  scene.updateMatrixWorld(true);
  const byMat = new Map(), old = [];
  scene.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o === skyMesh || o.userData.noMerge) return;
    const g = o.geometry.clone();
    if (!g.attributes.uv2) g.setAttribute('uv2', g.attributes.uv);
    g.applyMatrix4(o.matrixWorld);
    let e = byMat.get(o.material);
    if (!e) byMat.set(o.material, e = { geos: [], cast: false });
    e.geos.push(g); e.cast = e.cast || o.castShadow;
    old.push(o);
  });
  for (const o of old) o.parent.remove(o);
  mapMeshes.length = 0;
  for (const [mat, e] of byMat) {
    // Gemischte Geometrie-Arten (mit/ohne Index) vorher angleichen
    if (e.geos.some(g => g.index) && e.geos.some(g => !g.index)) e.geos = e.geos.map(g => g.index ? g.toNonIndexed() : g);
    const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(e.geos);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = e.cast; m.receiveShadow = true;
    scene.add(m); mapMeshes.push(m);
  }
})();

// Grafikstufen: Hoch / Mittel / Niedrig
function applyGfx(v) {
  gfx = v;
  const dpr = devicePixelRatio || 1;
  renderer.setPixelRatio(v === 'high' ? Math.min(dpr, 1.5) : v === 'medium' ? 1 : 0.7);
  sun.castShadow = v !== 'low';
  if (window.grassI) window.grassI.visible = v !== 'low';
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
const SPAWNS = [[-34, -40], [-55, -30], [-20, -36], [-52, -8], [-36, 18], [-24, 33], [-54, 52], [-40, 56],
  [-20, -10], [-20, 10], [0, 8.5], [0, -9], [6, -17.5], [29.6, -24.5], [13.6, -45.5], [50, -22], [26, 28], [5, 38], [40, 12], [20, 56],
  [-4, -56], [52, 45], [-58, 6], [30, -11],
  [-30, 72], [0, 82], [30, 95], [-45, 112], [12, 127], [46, 72], [-56, 90]];

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
gridIndex();
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
let _near = boxes, _h = PH;   // _h = Körperhöhe (kleiner beim Ducken)
function overlap(p, b) {
  return p.x + PR > b.min.x && p.x - PR < b.max.x && p.y + _h > b.min.y && p.y < b.max.y && p.z + PR > b.min.z && p.z - PR < b.max.z;
}
function anyOverlap(p) { for (const b of _near) if (overlap(p, b)) return true; return false; }
function moveH(e, ax, amt, grounded) {
  if (!amt) return;
  e.pos[ax] += amt;
  // Schanzen: hohe Seiten-/Stirnflächen sind Wände, flache Schrägen kann man hochfahren
  if (RAMPS.length && groundH(e.pos.x, e.pos.z) - e.pos.y > STEP * 0.6) { e.pos[ax] -= amt; e.blocked = true; return; }
  for (const b of _near) {
    if (!overlap(e.pos, b)) continue;
    const rise = b.max.y - e.pos.y;
    if (grounded && rise > 0 && rise <= STEP) {
      const oy = e.pos.y; e.pos.y = b.max.y + 0.001;
      if (!anyOverlap(e.pos)) continue;
      e.pos.y = oy;
    }
    e.pos[ax] = amt > 0 ? b.min[ax] - PR - 0.001 : b.max[ax] + PR + 0.001;
    e.blocked = true;
  }
}
function moveBody(e, dx, dy, dz) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.3));
  _near = nearBoxes(e.pos.x, e.pos.z, 2 + Math.abs(dx) + Math.abs(dz));
  _h = e.h || PH;
  e.blocked = false;
  for (let i = 0; i < n; i++) {
    const was = e.onGround; e.onGround = false;
    e.pos.y += dy / n;
    const gh = groundH(e.pos.x, e.pos.z);
    if (e.pos.y < gh) { e.pos.y = gh; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; }
    for (const b of _near) if (overlap(e.pos, b)) {
      if (dy <= 0) { e.pos.y = b.max.y; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; }
      else { e.pos.y = b.min.y - _h - 0.001; e.vel.y = 0; }
    }
    moveH(e, 'x', dx / n, was || e.onGround);
    moveH(e, 'z', dz / n, was || e.onGround);
  }
  const gEnd = groundH(e.pos.x, e.pos.z);
  if (e.pos.y < gEnd) { e.pos.y = gEnd; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; }
  _near = boxes; _h = PH;
}
/* Strahl gegen Kartenboxen + Boden: liefert {dist, point, normal} (für Schüsse und Sichtlinien) */
function rayMap(o, d, maxDist = 300) {
  let best = maxDist, nrm = null;
  if (d.y < -1e-6) { const t = -o.y / d.y; if (t > 0 && t < best) { best = t; nrm = [0, 1, 0]; } }
  for (const b of boxes) {
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
    const mn = [r.bx0, 0, r.bz0], mx = [r.bx1, r.H, r.bz1], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
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
  if (!nrm) return null;
  return { dist: best, point: new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best), normal: new THREE.Vector3(nrm[0], nrm[1], nrm[2]) };
}
