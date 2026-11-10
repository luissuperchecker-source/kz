'use strict';
/* ======================= Fenster „Tastatur & Maus anpassen“ =======================
   Die Belegung selbst (KB, kbDown/kbUp) steht in game.js. Hier: Liste anzeigen, neue Taste/Maustaste/Mausrad abfangen, speichern. */
function renderKbCfg() {
  const list = $('kbList'); list.innerHTML = '';
  const count = {};
  for (const a of KB_ACTIONS) for (const c of KB[a[0]]) if (c) count[c] = (count[c] || 0) + 1;
  const okPair = c => KB.jump.includes(c) && KB.handbrake.includes(c) && count[c] === 2;   // Springen + Handbremse dürfen sich eine Taste teilen
  for (const [id, label] of KB_ACTIONS) {
    const row = document.createElement('div'); row.className = 'padRow';
    if (KBL.listen && KBL.listen.a === id) row.classList.add('hot');
    const s = document.createElement('span'); s.textContent = label; row.appendChild(s);
    for (let slot = 0; slot < 2; slot++) {
      const code = KB[id][slot], b = document.createElement('button'); b.className = 'sec small';
      const listening = KBL.listen && KBL.listen.a === id && KBL.listen.slot === slot;
      b.textContent = listening ? 'Taste drücken…' : kbName(code);
      if (listening) b.classList.add('listen');
      else if (code && count[code] > 1 && !okPair(code)) { b.classList.add('dup'); b.title = 'Diese Taste ist mehrfach belegt'; }
      b.onclick = ev => { ev.stopPropagation(); KBL.listen = { a: id, slot }; KBL.t = performance.now(); renderKbCfg(); };
      row.appendChild(b);
    }
    list.appendChild(row);
  }
}
function kbAssign(code, label) {
  const L = KBL.listen; if (!L) return;
  KB[L.a][L.slot] = code;
  if (label) KB_LABEL[code] = label;
  KBL.listen = null; saveKB(); renderKbCfg();
}
const kbLabelOf = e => {
  if (e.code.startsWith('Key') && e.key && e.key.length === 1) return e.key.toUpperCase();   // echte Beschriftung (z. B. Y/Z auf deutscher Tastatur)
  if (e.code === 'Slash' && e.key && e.key.length === 1 && e.key !== '/') return e.key;
  return '';
};
// Abfangen, solange ein Feld auf eine neue Taste wartet (Capture: vor allen anderen Tasten-Funktionen)
document.addEventListener('keydown', e => {
  if (!KBL.listen) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.code === 'Escape') { KBL.listen = null; renderKbCfg(); return; }
  if (e.code === 'Delete' || e.code === 'Backspace') return kbAssign('', '');
  kbAssign(kbCode(e), kbLabelOf(e));
}, true);
document.addEventListener('mousedown', e => {
  if (!KBL.listen || performance.now() - KBL.t < 150) return;
  const btn = e.target.closest && e.target.closest('#kbClose, #kbReset, #kbList button:not(.listen)');
  if (btn) { KBL.listen = null; return; }   // anderes Feld / Fertig angeklickt: nur abbrechen
  e.preventDefault(); e.stopImmediatePropagation();
  kbAssign('Mouse' + e.button, '');
}, true);
document.addEventListener('mouseup', e => { if (e.button > 2) e.preventDefault(); }, true);
document.addEventListener('wheel', e => {
  if (!KBL.listen || !e.deltaY) return;
  e.preventDefault(); e.stopImmediatePropagation();
  kbAssign(e.deltaY > 0 ? 'WheelDown' : 'WheelUp', '');
}, { capture: true, passive: false });
$('btnKbCfg').onclick = () => { KBL.listen = null; renderKbCfg(); $('kbCfg').classList.remove('hidden'); };
$('kbClose').onclick = () => { KBL.listen = null; $('kbCfg').classList.add('hidden'); };
$('kbReset').onclick = () => { KB = KB_DEFAULT(); KB_LABEL = {}; KBL.listen = null; saveKB(); renderKbCfg(); };
