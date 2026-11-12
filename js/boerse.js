/* ======================= Börse: echte Aktien & Krypto mit echten Kursen =======================
   Krypto + US-Aktien: live von CoinGecko (direkt im Browser, eine Anfrage pro Minute).
   Deutsche Aktien nur, falls eine kurse.json vom GitHub-Kursabruf existiert (optional).
   1 Coin = 1 €. US-Aktien werden mit dem echten Dollarkurs in Euro umgerechnet. Depot im Browser gespeichert. */
const BO_CRYPTO = [
  ['bitcoin', 'Bitcoin', 'BTC'], ['ethereum', 'Ethereum', 'ETH'], ['solana', 'Solana', 'SOL'], ['ripple', 'XRP', 'XRP'],
  ['binancecoin', 'BNB', 'BNB'], ['dogecoin', 'Dogecoin', 'DOGE'], ['cardano', 'Cardano', 'ADA'], ['litecoin', 'Litecoin', 'LTC'],
];
const BO = { tab: 'aktien', sel: null, stocks: null, stand: null, crypto: null, usdEur: null, err: { a: '', k: '' }, tA: 0, tK: 0, timer: 0 };
const boDepot = { pos: {}, cost: {} };   // pos: Stückzahl, cost: bezahlte Coins (für Gewinn/Verlust)
try { Object.assign(boDepot, JSON.parse(localStorage.getItem('kz_depot') || '{}')); } catch (e) {}
const boSave = () => { try { localStorage.setItem('kz_depot', JSON.stringify(boDepot)); } catch (e) {} };

const boEur = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
const boPct = p => (p >= 0 ? '+' : '') + p.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
const boQty = q => q.toLocaleString('de-DE', { maximumFractionDigits: q < 1 ? 6 : 3 });

async function boLoadStocks() {
  try {
    const r = await fetch('kurse.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    BO.stocks = d.aktien; BO.standDE = d.stand; BO.err.a = '';
  } catch (e) { if (!BO.stocks) { BO.err.a = 'wait'; BO.noDE = true; } }   // keine kurse.json (GitHub-Abruf nicht eingerichtet): nicht weiter nachfragen
  BO.tA = Date.now();
}
// US-Aktien live über tokenisierte Aktien (xStocks) bei CoinGecko: Kurs folgt 1:1 der echten Aktie, direkt im Browser abrufbar.
// Nur Werte mit viel Handel (sonst weicht der Kurs ab). Alles kommt mit EINER Anfrage pro Minute zusammen mit Krypto.
const BO_US = [
  ['apple-xstock', 'Apple', 'AAPL'], ['microsoft-xstock', 'Microsoft', 'MSFT'], ['nvidia-xstock', 'NVIDIA', 'NVDA'], ['tesla-xstock', 'Tesla', 'TSLA'],
  ['amazon-xstock', 'Amazon', 'AMZN'], ['alphabet-xstock', 'Alphabet (Google)', 'GOOGL'], ['meta-xstock', 'Meta (Facebook)', 'META'], ['netflix-xstock', 'Netflix', 'NFLX'],
  ['amd-xstock', 'AMD', 'AMD'], ['intel-xstock', 'Intel', 'INTC'], ['broadcom-xstock', 'Broadcom', 'AVGO'], ['oracle-xstock', 'Oracle', 'ORCL'],
  ['palantir-xstock', 'Palantir', 'PLTR'], ['coinbase-xstock', 'Coinbase', 'COIN'], ['robinhood-xstock', 'Robinhood', 'HOOD'], ['gamestop-xstock', 'GameStop', 'GME'],
  ['mcdonald-s-xstock', "McDonald's", 'MCD'], ['coca-cola-xstock', 'Coca-Cola', 'KO'], ['pepsico-xstock', 'PepsiCo', 'PEP'], ['mastercard-xstock', 'Mastercard', 'MA'],
  ['sp500-xstock', 'S&P 500 (500 größte US-Firmen)', 'SPY'], ['gold-xstock', 'Gold', 'GOLD'],
];
async function boLoadCrypto() {
  try {
    const ids = BO_CRYPTO.map(c => c[0]).concat(BO_US.map(s => s[0])).join(',');
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&ids=${ids}&sparkline=true&price_change_percentage=24h&per_page=100`);
    if (!r.ok) throw new Error(r.status);
    const m = await r.json();   // bei „Throttled“ (zu viele Anfragen) wirft das → alte Kurse bleiben stehen
    const c = BO.crypto || {}, s = BO.us || {};
    for (const x of m) {
      if (!(x.current_price > 0)) continue;
      const e = { p: x.current_price, ch: x.price_change_percentage_24h || 0, hist: ((x.sparkline_in_7d || {}).price || []).filter((v, i) => i % 3 === 0), t: x.last_updated };
      if (x.id.endsWith('-xstock')) s[x.id] = e; else c[x.id] = e;
    }
    BO.crypto = c; BO.us = s; BO.err.k = ''; BO.stand = new Date();
  } catch (e) { BO.err.k = BO.crypto ? '' : 'Kurse gerade nicht erreichbar – in einer Minute nochmal versuchen.'; }
  BO.tK = Date.now();
}
// Ein einheitlicher Eintrag pro Wertpapier: Preis in € (= Coins)
function boItem(key) {
  if (key.startsWith('c:')) {
    const id = key.slice(2), c = BO.crypto && BO.crypto[id], def = BO_CRYPTO.find(x => x[0] === id);
    if (!c || !def) return null;
    return { key, name: def[1], sym: def[2], p: c.p, ch: c.ch, hist: c.hist, chLabel: '24 h', histLabel: '7 Tage' };
  }
  if (key.startsWith('s:')) {   // US-Aktie (live)
    const id = key.slice(2), s = BO.us && BO.us[id], def = BO_US.find(x => x[0] === id);
    if (!s || !def) return null;
    return { key, name: def[1], sym: def[2], p: s.p, ch: s.ch, hist: s.hist, chLabel: '24 h', histLabel: '7 Tage' };
  }
  const s = BO.stocks && BO.stocks[key]; if (!s) return null;
  const k = s.cur === 'USD' ? (BO.usdEur || 0.92) : 1;   // Dollar → Euro
  const ch = s.prev ? (s.p / s.prev - 1) * 100 : 0;
  return { key, name: s.name, sym: key.replace('.DE', ''), p: s.p * k, ch, hist: (s.hist || []).map(v => v * k), chLabel: 'heute', histLabel: '30 Tage',
    orig: s.cur === 'USD' ? `${s.p.toLocaleString('de-DE', { minimumFractionDigits: 2 })} $` : '' };
}
function boSpark(h, w = 100, hgt = 30, fill) {
  if (!h || h.length < 2) return '';
  let lo = Math.min(...h), hi = Math.max(...h); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pts = h.map((v, i) => `${(i / (h.length - 1) * w).toFixed(1)},${(hgt - 2 - (v - lo) / (hi - lo) * (hgt - 4)).toFixed(1)}`).join(' ');
  const col = h[h.length - 1] >= h[0] ? '#6bff7a' : '#ff6b6b';
  return `<svg class="spark" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">${fill ? `<polygon points="0,${hgt} ${pts} ${w},${hgt}" fill="${col}" opacity=".12"/>` : ''}<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${fill ? 1.2 : 1.6}" vector-effect="non-scaling-stroke"/></svg>`;
}
function boRow(it) {
  const own = boDepot.pos[it.key] || 0;
  return `<div class="bRow ${BO.sel === it.key ? 'sel' : ''}" data-k="${it.key}"><div class="nm">${it.name}<small>${it.sym}${own ? ` · du hast ${boQty(own)} = ${boEur(own * it.p)} €` : ''}</small></div>
    <div class="px">${boEur(it.p)} €</div><div class="sp">${boSpark(it.hist)}</div><div class="ch ${it.ch >= 0 ? 'up' : 'dn'}">${boPct(it.ch)}</div></div>`;
}
function boDetail(it) {
  const own = boDepot.pos[it.key] || 0, val = own * it.p, cost = boDepot.cost[it.key] || 0, c = shopState.coins;
  const buy = [100, 1000, 10000].map(n => `<button data-buy="${n}" ${c < Math.min(n, 1) || c < n ? 'disabled' : ''}>Kaufen<br><small>für ${fmt(n)}</small></button>`).join('')
    + `<button data-buy="max" ${c < 1 ? 'disabled' : ''}>Kaufen<br><small>alles (${fmt(Math.floor(c))})</small></button>`;
  const sell = [0.25, 0.5, 1].map(f => `<button class="sell" data-sell="${f}" ${own <= 0 ? 'disabled' : ''}>Verkaufen<br><small>${f === 1 ? 'alles' : f * 100 + ' %'}</small></button>`).join('');
  const gl = val - cost;
  return `<div class="bDet"><h3>${it.name} <small style="color:#a8c0a8;font-weight:400">${it.sym}</small></h3>
    <div><b style="font-size:20px">${boEur(it.p)} €</b> ${it.orig ? `<small style="color:#a8c0a8">(${it.orig})</small>` : ''} <span class="${it.ch >= 0 ? 'up' : 'dn'}">${boPct(it.ch)} ${it.chLabel}</span></div>
    ${boSpark(it.hist, 300, 110, true)}<div style="font-size:11px;color:#8fa88f;text-align:right">Verlauf: ${it.histLabel}</div>
    ${own ? `<div style="margin-top:4px">Im Depot: <b>${boQty(own)}</b> Stück = <b>${boEur(val)} €</b> · <span class="${gl >= 0 ? 'up' : 'dn'}">${gl >= 0 ? '+' : ''}${boEur(gl)} € (${cost ? boPct(gl / cost * 100) : '–'})</span></div>` : ''}
    <div class="bBtns">${buy}</div><div class="bBtns">${sell}</div></div>`;
}
function boWaitMsg() {
  return `<div class="bWait">⏳ Die Aktienkurse werden gerade eingerichtet und kommen automatisch, sobald der Kurs-Abruf auf GitHub läuft (alle 15 Minuten).<br>Bis dahin kannst du schon mit <b>Krypto</b> handeln – die Kurse sind live.</div>`;
}
function renderBoerse() {
  $('boCoins').textContent = fmt(Math.floor(shopState.coins));
  document.querySelectorAll('#boerse [data-bt]').forEach(b => b.classList.toggle('on', b.dataset.bt === BO.tab));
  let html = '';
  const selIt = BO.sel && boItem(BO.sel);
  if (BO.tab === 'aktien') {
    const sec = (t, ks) => ks.length ? `<div class="tSec" style="color:#ffcc33;font-weight:700;font-size:13px;margin:10px 0 6px">${t}</div>` + ks.map(k => { const it = boItem(k); return it ? (BO.sel === k ? boDetail(it) : '') + boRow(it) : ''; }).join('') : '';
    const us = BO_US.map(s => 's:' + s[0]).filter(k => boItem(k));
    if (!us.length) html = `<div class="bWait">${BO.err.k || 'Kurse werden geladen …'}</div>`;
    else {
      const st = BO.stand;
      html += `<div class="bInfo">🟢 Live-Kurse (Stand ${st ? st.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : '–'}, jede Minute neu), in Euro umgerechnet. Die Kurse kommen von tokenisierten Aktien und folgen dem echten Börsenkurs – nachts und am Wochenende kann er leicht abweichen.</div>`;
      html += sec('🇺🇸 USA', us);
    }
    if (BO.stocks) html += sec('🇩🇪 Deutschland (DAX)', Object.keys(BO.stocks).filter(k => BO.stocks[k].cur === 'EUR'));   // nur, wenn der GitHub-Kursabruf eingerichtet ist
  } else if (BO.tab === 'krypto') {
    if (!BO.crypto) html = `<div class="bWait">${BO.err.k || 'Kurse werden geladen …'}</div>`;
    else {
      html += '<div class="bInfo">Live-Kurse, alle 60 Sekunden neu. Krypto wird rund um die Uhr gehandelt.</div>';
      html += BO_CRYPTO.map(c => { const it = boItem('c:' + c[0]); return it ? (BO.sel === it.key ? boDetail(it) : '') + boRow(it) : ''; }).join('');
    }
  } else {
    const keys = Object.keys(boDepot.pos).filter(k => boDepot.pos[k] > 0);
    let val = 0, cost = 0, rows = '';
    for (const k of keys) {
      const it = boItem(k), c = boDepot.cost[k] || 0;
      cost += c;
      if (it) { val += boDepot.pos[k] * it.p; rows += (BO.sel === k ? boDetail(it) : '') + boRow(it); }
      else { val += c; rows += `<div class="bRow"><div class="nm">${k.replace(/^[cs]:/, '')}<small>Kurs wird geladen …</small></div></div>`; }
    }
    const gl = val - cost;
    html += `<div class="bSum"><div><b>${boEur(val)} €</b><span>Depotwert</span></div><div><b class="${gl >= 0 ? 'up' : 'dn'}">${gl >= 0 ? '+' : ''}${boEur(gl)} €</b><span>Gewinn / Verlust</span></div><div><b>${fmt(Math.floor(shopState.coins))}</b><span>Coins frei</span></div></div>`;
    html += rows || '<div class="bWait">Dein Depot ist noch leer. Kauf Aktien oder Krypto in den anderen Reitern!</div>';
  }
  if (selIt === null && BO.sel) BO.sel = null;
  $('boBody').innerHTML = html;
}
function boTrade(it, buy, arg) {
  if (!it || !(it.p > 0)) return;
  if (buy) {
    const amt = arg === 'max' ? Math.floor(shopState.coins) : +arg;
    if (amt <= 0 || shopState.coins < amt) { sndBeep(220, 0.15, 0.1, 'square'); return; }
    shopState.coins -= amt;
    boDepot.pos[it.key] = (boDepot.pos[it.key] || 0) + amt / it.p;
    boDepot.cost[it.key] = (boDepot.cost[it.key] || 0) + amt;
    showMsg(`📈 ${boQty(amt / it.p)} ${it.sym} gekauft für ${fmt(amt)} Coins`);
  } else {
    const own = boDepot.pos[it.key] || 0; if (own <= 0) return;
    const q = arg >= 1 ? own : own * arg, got = Math.floor(q * it.p);
    boDepot.cost[it.key] = (boDepot.cost[it.key] || 0) * (1 - q / own);
    boDepot.pos[it.key] = own - q;
    if (boDepot.pos[it.key] < 1e-9) { delete boDepot.pos[it.key]; delete boDepot.cost[it.key]; }
    shopState.coins += got;
    showMsg(`💰 ${boQty(q)} ${it.sym} verkauft für ${fmt(got)} Coins`);
  }
  boSave(); saveShop(); updateCoins(true);
  initAudio(); sndBeep(buy ? 660 : 520, 0.1, 0.12, 'triangle'); setTimeout(() => sndBeep(buy ? 990 : 780, 0.15, 0.12, 'triangle'), 90);
  renderBoerse();
}
async function boRefresh(force) {
  const now = Date.now(), jobs = [];
  if (force || now - BO.tK > 60000) jobs.push(boLoadCrypto());
  if (!BO.noDE && (force || now - BO.tA > 120000)) jobs.push(boLoadStocks());
  if (jobs.length) { await Promise.all(jobs); if (!$('boerse').classList.contains('hidden')) renderBoerse(); }
}
let boLock = false;   // nach dem Schließen wieder ins Spiel (wenn von der Karte aus geöffnet)
function openBoerse(fromWorld) {
  boLock = fromWorld === true;
  if (!BO.stocks && BO.crypto === null && BO.tab === 'aktien') BO.tab = 'aktien';
  renderBoerse(); $('boerse').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  boRefresh(!BO.tK);
  clearInterval(BO.timer); BO.timer = setInterval(() => { if ($('boerse').classList.contains('hidden')) clearInterval(BO.timer); else boRefresh(); }, 15000);
}
function closeBoerse() { $('boerse').classList.add('hidden'); clearInterval(BO.timer); if (boLock && running && !TOUCH) lockPointer(); boLock = false; }
$('boClose').onclick = closeBoerse;
$('btnBoerse1').onclick = () => openBoerse(); $('btnBoerse2').onclick = () => openBoerse();
document.querySelectorAll('#boerse [data-bt]').forEach(b => b.onclick = () => { BO.tab = b.dataset.bt; BO.sel = null; renderBoerse(); });
$('boBody').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) {
    if (b.disabled || !BO.sel) return;
    const it = boItem(BO.sel);
    if (b.dataset.buy) boTrade(it, true, b.dataset.buy === 'max' ? 'max' : +b.dataset.buy);
    else if (b.dataset.sell) boTrade(it, false, +b.dataset.sell);
    return;
  }
  const r = e.target.closest('.bRow[data-k]'); if (!r) return;
  BO.sel = BO.sel === r.dataset.k ? null : r.dataset.k; sndClick(0.03, 2.2); renderBoerse();
});
// Börsen-Terminal auf der Karte (Rathausplatz): davor stehen und E drücken
const BO_NEAR = { boerse: true };
function boNear() {
  const p = window.BOERSE_POS; if (!p || !me.alive) return null;
  return Math.hypot(me.pos.x - p[0], me.pos.z - p[1]) < 3.4 ? BO_NEAR : null;
}
function boHint() { return `<b>${TOUCH ? 'EINSTEIGEN' : kbK('ride')}</b> 📈 Börse öffnen – echte Aktien &amp; Krypto handeln`; }
// Kurse schon im Hintergrund laden, damit die Börse sofort etwas zeigt
setTimeout(() => boRefresh(true), 4000);
