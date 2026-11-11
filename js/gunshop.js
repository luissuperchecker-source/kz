'use strict';
/* ======================= Waffenladen von innen (Karte „Welt“) =======================
   Anders als der Laden im Menü: Man geht hinein, schaut eine Waffe an der Wand oder auf der Theke an
   (sie wird hervorgehoben) und drückt E → Preisschild dieser Waffe mit Werten, Preis und Kaufen/Ausrüsten.
   An der Theke: E = mit dem Verkäufer sprechen (Munition und Granaten). */
const GS = { aim: null, t: 0, shop: null };
const gsRay = new THREE.Raycaster();
const GS_LINES = {
  4: 'Die MP – klein, schnell, perfekt für enge Gassen.',
  5: 'Der Revolver. Zwei Treffer und Ruhe ist.',
  6: 'Kampfgewehr mit Zielfernrohr – mein Favorit für die Hochhäuser.',
  7: 'Das MG hat 80 Schuss. Da hört der Gegner lange nichts mehr.',
  8: 'Die Doppelflinte – billig, aber aus der Nähe unschlagbar!',
  9: 'Die Minigun? Schweres Gerät. Damit räumst du jede Straße leer!',
  10: 'Raketenwerfer. Bitte nicht hier drin ausprobieren …',
  11: 'Granatwerfer – sechs Stück im Bogen, bumm bumm bumm.',
  12: 'Flammenwerfer. Kommt mir nicht zu nah an die Theke damit!',
};
// Steht man in einem Laden?
function shopInside() {
  if (!me.alive || ride.v >= 0) return null;
  for (const s of window.GUN_SHOPS || []) if (s.W && Math.abs(me.pos.x - s.cx) < s.W / 2 && Math.abs(me.pos.z - s.cz) < s.D / 2) return s;
  return null;
}
// Welche ausgestellte Waffe schaut man an (bis 8 m)?
function aimedGun(s) {
  const grp = window.SHOP_DISPLAYS[window.GUN_SHOPS.indexOf(s)]; if (!grp) return null;
  grp.updateMatrixWorld(true); camera.updateMatrixWorld();
  const o = camera.getWorldPosition(new THREE.Vector3()), f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  gsRay.set(o, f); gsRay.far = 8;   // Rückwand ist von der Theke aus ~5 m weg
  const hit = gsRay.intersectObjects(grp.children, true)[0]; if (!hit) return null;
  let g = hit.object; while (g && g.parent !== grp) g = g.parent;
  return g || null;
}
// Hinweis unten + angeschaute Waffe hervorheben (wird von ui.js jedes Bild aufgerufen, solange man im Laden ist)
function gunshopHint(s) {
  GS.t -= 1 / 60;
  if (GS.t <= 0) {
    GS.t = 0.08;
    const g = aimedGun(s);
    if (g !== GS.aim) { if (GS.aim) GS.aim.scale.setScalar(GS.aim.userData.s0); GS.aim = g; }
  }
  if (GS.aim) GS.aim.scale.setScalar(GS.aim.userData.s0 * (1.12 + Math.sin(performance.now() / 160) * 0.03));
  const key = `<b>${TOUCH ? 'EINSTEIGEN' : kbK('ride')}</b>`;
  if (GS.aim) {
    const W = WEAPONS[GS.aim.userData.w], own = shopState.bought.includes(GS.aim.userData.w);
    return `${key} – 🏷️ <b>${W.name}</b> ansehen · ${own ? 'schon gekauft' : fmt(W.price) + ' Coins'}`;
  }
  if (Math.hypot(me.pos.x - s.x, me.pos.z - s.z) < 2.6) return `${key} – 🧔 mit dem Verkäufer sprechen (Munition, Granaten)`;
  return '🔫 Schau eine Waffe an der Wand oder auf der Theke an und drück ' + key;
}
function gunshopInteract() {
  const s = shopInside(); if (!s) return;
  GS.shop = s;
  const g = aimedGun(s);
  if (g) openGunCard(g.userData.w);
  else if (Math.hypot(me.pos.x - s.x, me.pos.z - s.z) < 2.6) openCounter();
  else showMsg('Schau eine Waffe an und drück ' + (TOUCH ? 'EINSTEIGEN' : kbK('ride')) + ' – oder geh zur Theke');
}
function gcOpen(html) {
  if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} }
  $('gcBody').innerHTML = html; $('gunCard').classList.remove('hidden');
  initAudio(); sndBeep(990, 0.06, 0.08, 'sine');
}
function gcClose() { $('gunCard').classList.add('hidden'); if (running && !TOUCH) lockPointer(); }
// Preisschild einer Waffe
function openGunCard(w) {
  const W = WEAPONS[w], owned = shopState.bought.includes(w), eq = shopState.equip === w, miss = W.price - shopState.coins;
  const bar = (label, v) => `<div class="stat"><span>${label}</span><em><i style="width:${Math.round(Math.max(0.04, Math.min(1, v)) * 100)}%"></i></em></div>`;
  let btn;
  if (!owned) btn = miss > 0 ? `<button disabled>Zu teuer – dir fehlen ${fmt(miss)} Coins</button>` : `<button data-gc="buy" data-w="${w}">💰 Kaufen für ${fmt(W.price)} Coins</button>`;
  else if (!eq) btn = `<button data-gc="equip" data-w="${w}">In die Hand nehmen (Taste 5)</button>`;
  else btn = `<button class="sec" disabled>✓ Hast du in der Hand</button>`;
  gcOpen(`<div class="gcSay">🧔 „${GS_LINES[w] || 'Schönes Stück, oder?'}“</div>
    <div class="gcTag"><div class="gcHole"></div><div class="gcName">${W.name}</div><div class="gcPrice">${owned ? 'GEKAUFT' : fmt(W.price) + ' Coins'}</div></div>
    <div class="gcDesc">${W.desc || ''}</div>
    ${bar('Schaden', (W.rocket ? 150 : W.gl ? 110 : W.dmg * W.pellets) / 60)}${bar('Feuerrate', 0.065 / W.rate)}${bar('Magazin', W.mag / 80)}${bar('Nachladen', 1.3 / W.reload)}
    <div class="gcWallet">Dein Geld: <span class="coin"></span> ${fmt(shopState.coins)} Coins${shopState.equip >= BASE_WEAPONS && shopState.equip !== w ? ` · In der Hand: ${WEAPONS[shopState.equip].name}` : ''}</div>
    <div class="gcBtns">${btn}<button class="sec" data-gc="back">Zurück</button></div>`);
}
// Theke: Verkäufer verkauft Munition und Granaten
function openCounter() {
  const item = (act, icon, name, desc, price) => `<div class="shopItem"><div class="info"><div class="nm">${icon} ${name}</div><div class="ds">${desc}</div></div>
    <button data-gc="${act}" ${shopState.coins < price ? 'disabled' : ''}>Kaufen<br><small><span class="coin"></span> ${price}</small></button></div>`;
  gcOpen(`<div class="gcSay">🧔 „Moin! Was darf's sein? Die Waffen hängen an der Wand – schau sie dir einfach an.“</div>
    ${item('ammo', '📦', 'Munition auffüllen', 'Alle deine Waffen voll nachladen.', 100)}
    ${item('nades', '💣', 'Granaten auffüllen', 'Wieder ' + MAX_NADES + ' Granaten am Gürtel.', 150)}
    <div class="gcWallet">Dein Geld: <span class="coin"></span> ${fmt(shopState.coins)} Coins</div>
    <div class="gcBtns"><button class="sec" data-gc="back">Tschüss!</button></div>`);
}
const gcPay = n => { if (shopState.coins < n) return false; shopState.coins -= n; saveShop(); updateCoins(true); sndBeep(660, 0.1, 0.12, 'triangle'); setTimeout(() => sndBeep(990, 0.15, 0.12, 'triangle'), 90); return true; };
function gcEquip(w) {
  shopState.equip = w; saveShop();
  if (running && me.alive) {
    for (let i = BASE_WEAPONS; i < WEAPONS.length; i++) me.owned[i] = false;
    me.owned[w] = true; me.ammo[w] = WEAPONS[w].mag; me.weapon = -1; switchWeapon(w);
  }
}
/* ---------- Beim Laden alles vorbereiten: Shader für ALLE Objekte einmal übersetzen ----------
   Sonst übersetzt die Grafikkarte sie erst, wenn man etwas zum ersten Mal sieht → kurzes Ruckeln mitten im Spiel. */
setTimeout(() => {
  const el = $('loadInfo'); if (el) el.textContent = 'Grafik wird vorbereitet …';
  setTimeout(() => {
    const hidden = []; scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { renderer.compile(scene, camera); } catch (e) {}
    for (const o of hidden) o.visible = false;
    if (el) el.textContent = 'Grafik vorbereitet ✓';
  }, 50);
}, 400);
$('gcBody').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const a = b.dataset.gc, w = +b.dataset.w;
  if (a === 'back') return gcClose();
  if (a === 'buy') { if (!gcPay(WEAPONS[w].price)) return; shopState.bought.push(w); gcEquip(w); showMsg(`🔫 ${WEAPONS[w].name} gekauft!`); openGunCard(w); }
  else if (a === 'equip') { gcEquip(w); openGunCard(w); }
  else if (a === 'ammo') { if (!gcPay(100)) return; me.ammo = WEAPONS.map(x => x.mag); me.reloading = 0; showMsg('📦 Munition aufgefüllt'); openCounter(); }
  else if (a === 'nades') { if (!gcPay(150)) return; me.nades = MAX_NADES; showMsg('💣 Granaten aufgefüllt'); openCounter(); }
});
