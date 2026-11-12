/* ======================= Börse: echte Aktien & Krypto mit echten Kursen =======================
   Aktien: ALLE tokenisierten Aktien bei CoinGecko (Kategorie „Tokenized Stocks“, mehrere Anbieter wie xStocks, Ondo,
   bStocks, Robinhood …). Pro Firma zählt der Anbieter mit dem meisten Handel (Ausreißer per Median aussortiert).
   Wenig gehandelte Werte bekommen einen Hinweis. Abruf direkt im Browser, Seite für Seite, alle 10 Minuten.
   Krypto: live, jede Minute. Deutsche DAX-Werte zusätzlich, falls eine kurse.json vom GitHub-Kursabruf existiert.
   1 Coin = 1 €. Depot im Browser gespeichert (pro Firma, nicht pro Anbieter → Anbieterwechsel stört nicht). */
const BO_CRYPTO = [
  ['bitcoin', 'Bitcoin', 'BTC'], ['ethereum', 'Ethereum', 'ETH'], ['solana', 'Solana', 'SOL'], ['ripple', 'XRP', 'XRP'],
  ['binancecoin', 'BNB', 'BNB'], ['dogecoin', 'Dogecoin', 'DOGE'], ['cardano', 'Cardano', 'ADA'], ['litecoin', 'Litecoin', 'LTC'],
];
const BO_EXTRA = [['sp500-xstock', 's&p 500', 'S&P 500 (500 größte US-Firmen)', 'SPY'], ['nasdaq-xstock', 'nasdaq 100', 'Nasdaq 100 (Technologie)', 'QQQ'], ['gold-xstock', 'gold', 'Gold', 'GOLD']];
const BO = { tab: 'aktien', sel: null, stocks: null, crypto: null, all: null, err: { a: '', k: '', s: '' }, tA: 0, tK: 0, tS: 0, timer: 0, q: '', sort: 'pop', show: 40, hist: {}, preIpo: null, loadingS: false };
const boDepot = { pos: {}, cost: {} };   // pos: Stückzahl, cost: bezahlte Coins (für Gewinn/Verlust)
try { Object.assign(boDepot, JSON.parse(localStorage.getItem('kz_depot') || '{}')); } catch (e) {}
const boSave = () => { try { localStorage.setItem('kz_depot', JSON.stringify(boDepot)); } catch (e) {} };
// alte Schlüssel (Version mit 22 festen US-Aktien) auf Firmen-Schlüssel umstellen
{ const OLD = { apple: 'apple', microsoft: 'microsoft', nvidia: 'nvidia', tesla: 'tesla', amazon: 'amazon', alphabet: 'alphabet', meta: 'meta', netflix: 'netflix', amd: 'amd', intel: 'intel',
    broadcom: 'broadcom', oracle: 'oracle', palantir: 'palantir', coinbase: 'coinbase', robinhood: 'robinhood', gamestop: 'gamestop', 'mcdonald-s': "mcdonald's", 'coca-cola': 'coca-cola',
    pepsico: 'pepsico', mastercard: 'mastercard', sp500: 's&p 500', gold: 'gold' };
  let ch = false;
  for (const k of Object.keys(boDepot.pos)) { const m = /^s:(.+)-xstock$/.exec(k); if (!m || !OLD[m[1]]) continue;
    const nk = 'k:' + OLD[m[1]]; boDepot.pos[nk] = (boDepot.pos[nk] || 0) + boDepot.pos[k]; boDepot.cost[nk] = (boDepot.cost[nk] || 0) + (boDepot.cost[k] || 0); delete boDepot.pos[k]; delete boDepot.cost[k]; ch = true; }
  if (ch) boSave(); }

const boEur = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
const boPct = p => (p >= 0 ? '+' : '') + p.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
const boQty = q => q.toLocaleString('de-DE', { maximumFractionDigits: q < 1 ? 6 : 3 });
const boEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const boSleep = ms => new Promise(r => setTimeout(r, ms));

// Firmenname aus dem Token-Namen: „Apple (Ondo Tokenized Stock)“, „Apple xStock“, „Meta Platforms • Robinhood Token“ → Apple / Meta
const BO_ALIAS = { 'meta platforms': 'meta', 'advanced micro devices': 'amd', 'alphabet class a': 'alphabet', 'alphabet class c': 'alphabet', 'palantir technologies': 'palantir',
  'taiwan semiconductor manufacturing': 'tsmc', 'microstrategy': 'strategy', 'robinhood markets': 'robinhood', 'nebius group': 'nebius', 'circle internet group': 'circle',
  'marvell technology': 'marvell', 'circle internet': 'circle', 'hims & hers health': 'hims & hers', 'palo alto': 'palo alto networks', 'eli lilly and company': 'eli lilly', 'eli lilly & co': 'eli lilly', 'dell technologies': 'dell', 'cisco systems': 'cisco', 'arm holdings': 'arm',
  'asml holding': 'asml', 'iren limited': 'iren', 'lumentum holdings': 'lumentum', 'credo technology group': 'credo technology', 'cerebras systems': 'cerebras', 'hims & hers health': 'hims & hers',
  'amc entertainment holdings': 'amc entertainment', 'take-two interactive software': 'take-two interactive', 'coinbase global': 'coinbase', 'coinbase global inc st0x': 'coinbase',
  'the walt disney': 'disney', 'walt disney': 'disney', 'the coca-cola': 'coca-cola', 'mcdonalds': "mcdonald's", 'exxon mobil': 'exxonmobil', 'berkshire hathaway class b': 'berkshire hathaway',
  'novartis ag': 'novartis', 'super micro computer': 'supermicro', 'jpmorgan chase & co': 'jpmorgan chase', 'jpmorgan': 'jpmorgan chase', 'rivian automotive': 'rivian', 'lockheed martin': 'lockheed' };
function boCompany(name) {
  let s = String(name).replace(/\s*[•(\[].*$/, '').replace(/\s+(tokenized|xstock|xstocks|token|ondo|bstock|astock|on-chain)\b.*$/i, '');
  for (let i = 0; i < 3; i++) s = s.replace(/[,.]?\s+(inc|corp|corporation|ltd|limited|plc|n\.?v|s\.?a|ag|se|holdings?|co|company|group|common stock|class [abc])\.?$/i, '').replace(/\s+(and|&)$/i, '').replace(/[,\s]+$/, '');
  s = s.trim(); if (!s || /^wrapped\b/i.test(s) || /pre[- ]?ipo/i.test(name)) return null;
  const l = s.toLowerCase(), a = BO_ALIAS[l] || l;
  // „Spotify Technology“ = „Spotify“, „Uber Technologies“ = „Uber“ … (nur für die Zuordnung, der Name bleibt)
  return { key: a.replace(/\s+(technologies|technology|platforms|systems|networks|entertainment|industries|international|enterprises|incorporated)$/, '') || a, label: s };
}
async function boLoadStocks() {   // optionale kurse.json (deutsche Aktien)
  try {
    const r = await fetch('kurse.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json(); BO.stocks = d.aktien; BO.err.a = '';
  } catch (e) { if (!BO.stocks) { BO.err.a = 'wait'; BO.noDE = true; } }   // keine kurse.json: nicht weiter nachfragen
  BO.tA = Date.now();
}
async function boLoadCrypto() {   // Krypto + Index/Gold: eine Anfrage mit 7-Tage-Verlauf
  try {
    const ids = BO_CRYPTO.map(c => c[0]).concat(BO_EXTRA.map(x => x[0])).join(',');
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&ids=${ids}&sparkline=true&price_change_percentage=24h&per_page=100`);
    if (!r.ok) throw new Error(r.status);
    const m = await r.json();   // bei „Throttled“ (zu viele Anfragen) wirft das → alte Kurse bleiben stehen
    const c = BO.crypto || {};
    for (const x of m) {
      if (!(x.current_price > 0)) continue;
      const e = { p: x.current_price, ch: x.price_change_percentage_24h || 0, hist: ((x.sparkline_in_7d || {}).price || []).filter((v, i) => i % 3 === 0), img: x.image };
      const ex = BO_EXTRA.find(z => z[0] === x.id);
      if (ex) BO.hist['k:' + ex[1]] = e.hist, BO.extra = Object.assign(BO.extra || {}, { [ex[1]]: Object.assign(e, { id: x.id, label: ex[2], sym: ex[3], vol: 1e12 }) });
      else c[x.id] = e;
    }
    BO.crypto = c; BO.err.k = '';
  } catch (e) { BO.err.k = BO.crypto ? '' : 'Kurse gerade nicht erreichbar – in einer Minute nochmal versuchen.'; }
  BO.tK = Date.now();
}
// Alle Aktien: Seite für Seite (je 250 Token, nach Größe sortiert), bis zu 8 Seiten. Zwischen den Seiten 5 s Pause
// (Anfrage-Limit von CoinGecko); die Liste wächst sichtbar mit. Bei einer Sperre geht es 1 Minute später an derselben Seite weiter.
const BO_PAGES = 8, BO_REFRESH = 600000, BO_LOWVOL = 20000;
async function boLoadAll() {
  if (BO.loadingS) return; BO.loadingS = true;
  const base = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&per_page=250&price_change_percentage=24h&category=';
  const open = () => !$('boerse').classList.contains('hidden');
  try {
    if (!BO.preIpo) { try { const r = await fetch(base + 'tokenized-pre-ipo-stocks&page=1'); if (r.ok) BO.preIpo = new Set((await r.json()).map(x => x.id)); } catch (e) {} await boSleep(2500); }
    if (!BO.pg || BO.pg > BO_PAGES) { BO.pg = 1; BO.raw = []; }   // neuer Durchlauf
    while (BO.pg <= BO_PAGES && open()) {
      let d = null;
      try { const r = await fetch(base + 'tokenized-stock&page=' + BO.pg); if (r.ok) d = await r.json(); } catch (e) {}
      if (!Array.isArray(d)) break;   // Sperre (zu viele Anfragen): später an dieser Seite weitermachen
      BO.raw.push(...d); boMerge(BO.raw);
      BO.pg = d.length < 250 ? BO_PAGES + 1 : BO.pg + 1;
      if (open()) renderBoerse(true);
      if (BO.pg <= BO_PAGES) await boSleep(5000);
    }
    if (BO.pg > BO_PAGES) {   // alle Seiten geladen
      BO.all = null; boMerge(BO.raw);   // Liste frisch aufbauen (keine veralteten Einträge)
      BO.err.s = ''; BO.stand = new Date(); BO.tS = Date.now(); BO.raw = [];
      try { localStorage.setItem('kz_aktien', JSON.stringify({ t: Date.now(), a: [...BO.all] })); } catch (e) {}   // für später (schneller Start, Anfrage-Sperre)
    } else {
      if (!BO.all || !BO.all.size) BO.err.s = 'Aktienkurse gerade nicht erreichbar (zu viele Anfragen) – in einer Minute geht es automatisch weiter.';
      BO.tS = Date.now() - BO_REFRESH + 60000;   // in 1 Minute weiter
    }
  } finally { BO.loadingS = false; }
}
// Zuletzt geladene Aktienkurse (max. 1 Tag alt) sofort anzeigen; jünger als 10 Minuten → gar nicht neu laden
try { const c = JSON.parse(localStorage.getItem('kz_aktien') || 'null'); if (c && Date.now() - c.t < 864e5) { BO.all = new Map(c.a); BO.stand = new Date(c.t); BO.tS = c.t; } } catch (e) {}
// Pro Firma alle Anbieter sammeln; Preis = Anbieter mit dem meisten Handel, dessen Preis nahe am Mittelwert (Median) aller
// Anbieter liegt – so fallen falsch bepreiste Token heraus
function boMerge(raw) {
  const all = BO.all || new Map(), groups = new Map();
  for (const x of raw) {
    // alle Firmen mit Kurs; nur Token ohne Handel UND ohne aktuellen Kurs (älter als 3 Tage) fallen weg
    const fresh = x.total_volume > 0 || (x.last_updated && Date.now() - Date.parse(x.last_updated) < 2592e5);
    if (!(x.current_price > 0) || x.current_price > 1e6 || !fresh || (BO.preIpo && BO.preIpo.has(x.id))) continue;
    const c = boCompany(x.name); if (!c) continue;
    let sym = String(x.symbol || '').toUpperCase();
    const remora = /remora|rstock/i.test(x.name + ' ' + x.id);
    if (remora) sym = sym.replace(/^R/, '');   // Remora-Kürzel tragen ein „R“ davor
    if (/\bastock\b/i.test(x.name)) sym = sym.replace(/^A(?=[A-Z]{2})/, '');   // aStock-Kürzel tragen ein „A“ davor
    sym = sym.replace(/(ON|X|B)$/, '');
    let g = groups.get(c.key); if (!g) groups.set(c.key, g = { label: c.label, list: [] });
    if (c.label.length < g.label.length) g.label = c.label;   // kürzester Name: „Spotify“ statt „Spotify Technology“
    g.list.push({ id: x.id, p: x.current_price, ch: x.price_change_percentage_24h || 0, vol: x.total_volume || 0, img: x.image, sym, remora });
  }
  for (const [k, g] of groups) {
    const ps = g.list.map(e => e.p).sort((a, b) => a - b), med = ps[Math.floor((ps.length - 1) / 2)];
    const ok = g.list.length < 3 ? g.list : g.list.filter(e => Math.abs(e.p / med - 1) < 0.15);
    const b = (ok.length ? ok : g.list).slice().sort((a, b) => b.vol - a.vol)[0];
    const symE = g.list.find(e => !e.remora) || b;
    const sum = g.list.reduce((s, e) => s + e.vol, 0);
    all.set(k, { label: g.label, sym: symE.sym, id: b.id, p: b.p, ch: b.ch, vol: b.vol, sum, low: sum < BO_LOWVOL, img: b.img || (g.list.find(e => e.img) || {}).img, n: g.list.length });
  }
  BO.all = all;
}
// Ein einheitlicher Eintrag pro Wertpapier: Preis in € (= Coins)
function boItem(key) {
  if (key.startsWith('c:')) {
    const id = key.slice(2), c = BO.crypto && BO.crypto[id], def = BO_CRYPTO.find(x => x[0] === id);
    if (!c || !def) return null;
    return { key, id, name: def[1], sym: def[2], p: c.p, ch: c.ch, hist: c.hist, img: c.img, chLabel: '24 h', histLabel: '7 Tage' };
  }
  if (key.startsWith('k:')) {
    const k = key.slice(2), s = (BO.extra && BO.extra[k]) || (BO.all && BO.all.get(k)); if (!s) return null;
    return { key, name: s.label, sym: s.sym, p: s.p, ch: s.ch, hist: BO.hist[key], img: s.img, id: s.id, vol: s.sum || s.vol, low: s.low, chLabel: '24 h', histLabel: '7 Tage' };
  }
  const s = BO.stocks && BO.stocks[key]; if (!s || s.cur !== 'EUR') return null;   // kurse.json (DAX)
  const ch = s.prev ? (s.p / s.prev - 1) * 100 : 0;
  return { key, name: s.name, sym: key.replace('.DE', ''), p: s.p, ch, hist: s.hist, chLabel: 'heute', histLabel: '30 Tage' };
}
// Kursverlauf erst beim Anklicken laden (Zeitraum 1 Tag / 1 Woche / 1 Monat) – spart Daten
BO.tf = 7; BO.chart = {}; BO.amt = '';
async function boLoadHist(it, days = BO.tf) {
  const ck = it && it.key + '|' + days;
  if (!it || !it.id || BO.chart[ck] || BO.histBusy) return;
  BO.histBusy = true;
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${it.id}/market_chart?vs_currency=eur&days=${days}`);
    if (r.ok) { const d = await r.json(), pr = d.prices || [], step = Math.max(1, Math.floor(pr.length / 120)); BO.chart[ck] = pr.filter((v, i) => i % step === 0 || i === pr.length - 1); if (days === 7) BO.hist[it.key] = BO.chart[ck].map(p => p[1]); }
  } catch (e) {}
  BO.histBusy = false;
  if (!$('boerse').classList.contains('hidden') && BO.sel === it.key) renderBoerse(true);
}
// Großer Chart wie in einer Trading-App: Fläche, Linie, Preisachse (Hoch/Mitte/Tief), Zeitachse, aktueller Kurs
function boChart(data, days) {
  const W = 340, H = 140, pr = data.map(p => p[1]);
  let lo = Math.min(...pr), hi = Math.max(...pr); if (hi - lo < 1e-9) { hi *= 1.001; lo *= 0.999; }
  const X = i => (i / (data.length - 1) * (W - 52)).toFixed(1), Y = v => (8 + (hi - v) / (hi - lo) * (H - 26)).toFixed(1);
  const pts = data.map((p, i) => `${X(i)},${Y(p[1])}`).join(' '), up = pr[pr.length - 1] >= pr[0], col = up ? '#3ddc84' : '#ff5c5c';
  const grid = [hi, (hi + lo) / 2, lo].map(v => `<line x1="0" x2="${W - 52}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ffffff" stroke-opacity=".08"/><text x="${W - 48}" y="${+Y(v) + 4}" fill="#9fb0a0" font-size="10">${boEur(v)}</text>`).join('');
  const fmtT = t => { const d = new Date(t); return days <= 1 ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }); };
  const ly = Y(pr[pr.length - 1]);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;margin:6px 0">${grid}
    <defs><linearGradient id="bg${days}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <polygon points="0,${H - 18} ${pts} ${X(data.length - 1)},${H - 18}" fill="url(#bg${days})"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round"/>
    <line x1="0" x2="${W - 52}" y1="${ly}" y2="${ly}" stroke="${col}" stroke-dasharray="3 3" stroke-opacity=".6"/><circle cx="${X(data.length - 1)}" cy="${ly}" r="3.2" fill="${col}"/>
    <text x="0" y="${H - 4}" fill="#9fb0a0" font-size="10">${fmtT(data[0][0])}</text><text x="${W - 56}" y="${H - 4}" fill="#9fb0a0" font-size="10" text-anchor="end">${fmtT(data[data.length - 1][0])}</text></svg>`;
}
function boSpark(h, w = 100, hgt = 30, fill) {
  if (!h || h.length < 2) return '';
  let lo = Math.min(...h), hi = Math.max(...h); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pts = h.map((v, i) => `${(i / (h.length - 1) * w).toFixed(1)},${(hgt - 2 - (v - lo) / (hi - lo) * (hgt - 4)).toFixed(1)}`).join(' ');
  const col = h[h.length - 1] >= h[0] ? '#6bff7a' : '#ff6b6b';
  return `<svg class="spark" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">${fill ? `<polygon points="0,${hgt} ${pts} ${w},${hgt}" fill="${col}" opacity=".12"/>` : ''}<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${fill ? 1.2 : 1.6}" vector-effect="non-scaling-stroke"/></svg>`;
}
// Bekannte Marken unter dem Firmennamen anzeigen (wem gehört was?)
const BO_BRANDS = { 'take-two interactive': '🎮 GTA · Rockstar Games · 2K · NBA 2K', alphabet: 'Google · YouTube · Android', meta: 'Facebook · Instagram · WhatsApp',
  microsoft: 'Xbox · Windows · Minecraft · Call of Duty', sony: 'PlayStation', 'electronic arts': 'EA Sports FC · Battlefield · Die Sims', roblox: 'Roblox',
  apple: 'iPhone · Mac · AirPods', amazon: 'Amazon · Prime Video · AWS', disney: 'Marvel · Pixar · Star Wars', tesla: 'Elektroautos', nvidia: 'GeForce-Grafikkarten',
  netflix: 'Streaming', spotify: 'Musik-Streaming', pepsico: 'Pepsi · Lay’s · 7UP', 'coca-cola': 'Coca-Cola · Fanta · Sprite', unity: 'Spiele-Engine Unity',
  'berkshire hathaway': 'Warren Buffett', gamestop: 'Videospiel-Läden', nintendo: 'Switch · Mario · Pokémon', ferrari: 'Sportwagen' };
function boRow(it) {
  const own = boDepot.pos[it.key] || 0, logo = it.img ? `<img src="${boEsc(it.img)}" loading="lazy" alt="">` : '';
  const mid = it.hist ? boSpark(it.hist) : `<span class="vol">${it.vol ? 'Handel ' + boShort(it.vol) : ''}</span>`;
  const brand = BO_BRANDS[it.key.slice(2)];
  return `<div class="bRow ${BO.sel === it.key ? 'sel' : ''}" data-k="${boEsc(it.key)}"><div class="nm">${logo}<span>${boEsc(it.name)}<small>${boEsc(it.sym)}${brand ? ` · ${boEsc(brand)}` : ''}${own ? ` · du hast ${boQty(own)} = ${boEur(own * it.p)} €` : ''}</small></span></div>
    <div class="px">${boEur(it.p)} €</div><div class="sp">${mid}</div><div class="ch ${it.ch >= 0 ? 'up' : 'dn'}">${boPct(it.ch)}</div></div>`;
}
const boShort = n => n >= 1e9 ? (n / 1e9).toFixed(1).replace('.', ',') + ' Mrd. €' : n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' Mio. €' : Math.round(n / 1000) + ' Tsd. €';
function boDetail(it) {
  const own = boDepot.pos[it.key] || 0, val = own * it.p, cost = boDepot.cost[it.key] || 0, c = shopState.coins;
  const buy = [100, 1000, 10000].map(n => `<button data-buy="${n}" ${c < n ? 'disabled' : ''}>Kaufen<br><small>für ${fmt(n)}</small></button>`).join('')
    + `<button data-buy="max" ${c < 1 ? 'disabled' : ''}>Kaufen<br><small>alles (${fmt(Math.floor(c))})</small></button>`;
  const sell = [0.25, 0.5, 1].map(f => `<button class="sell" data-sell="${f}" ${own <= 0 ? 'disabled' : ''}>Verkaufen<br><small>${f === 1 ? 'alles' : f * 100 + ' %'}</small></button>`).join('');
  const gl = val - cost;
  const brand = it.key.startsWith('k:') && BO_BRANDS[it.key.slice(2)];
  // Chart: gewählter Zeitraum (live geladen) – bei DAX-Werten aus kurse.json nur der 30-Tage-Verlauf
  const data = it.id ? BO.chart[it.key + '|' + BO.tf] : (it.hist ? it.hist.map((p, i) => [Date.now() - (it.hist.length - 1 - i) * 864e5, p]) : null);
  if (it.id && !data) setTimeout(() => boLoadHist(it, BO.tf), 0);
  let stats = '';
  if (data && data.length > 1) { const pr = data.map(p => p[1]), chg = (pr[pr.length - 1] / pr[0] - 1) * 100; stats = `<div class="bStats"><span>Hoch <b>${boEur(Math.max(...pr))} €</b></span><span>Tief <b>${boEur(Math.min(...pr))} €</b></span><span>Zeitraum <b class="${chg >= 0 ? 'up' : 'dn'}">${boPct(chg)}</b></span></div>`; }
  const tfs = it.id ? `<div class="bTf">${[[1, '1 Tag'], [7, '1 Woche'], [30, '1 Monat'], [365, '1 Jahr']].map(([d, l]) => `<button data-tf="${d}" class="${BO.tf === d ? 'on' : 'sec'}">${l}</button>`).join('')}</div>` : '';
  return `<div class="bDet"><h3>${it.img ? `<img src="${boEsc(it.img)}" alt="" style="width:22px;height:22px;border-radius:50%;vertical-align:-4px;margin-right:6px;background:#fff">` : ''}${boEsc(it.name)} <small style="color:#a8c0a8;font-weight:400">${boEsc(it.sym)}</small></h3>${brand ? `<div style="font-size:12.5px;color:#ffcf6b;margin-bottom:2px">Dazu gehört: ${boEsc(brand)}</div>` : ''}
    <div><b style="font-size:22px">${boEur(it.p)} €</b> <span class="${it.ch >= 0 ? 'up' : 'dn'}">${it.ch >= 0 ? '▲' : '▼'} ${boPct(it.ch)} ${it.chLabel}</span></div>${it.low ? '<div style="font-size:11.5px;color:#ffcf6b;margin-top:2px">⚠ Wird wenig gehandelt – der Kurs kann etwas vom echten Börsenkurs abweichen.</div>' : ''}
    ${tfs}${data && data.length > 1 ? boChart(data, it.id ? BO.tf : 30) + stats : '<div class="bWait" style="padding:24px 8px">📈 Chart wird geladen …</div>'}
    ${own ? `<div class="bPos">Im Depot: <b>${boQty(own)}</b> Stück · Wert <b>${boEur(val)} €</b> · Einstand ${boEur(cost)} € · <span class="${gl >= 0 ? 'up' : 'dn'}">${gl >= 0 ? '+' : ''}${boEur(gl)} € (${cost ? boPct(gl / cost * 100) : '–'})</span></div>` : ''}
    <div class="bOrder"><input id="boAmt" type="number" min="1" step="1" inputmode="numeric" placeholder="Betrag in Coins" value="${boEsc(BO.amt)}"><button data-buy="custom" ${c < 1 ? 'disabled' : ''}>Kaufen</button>
      <span class="bOrderInfo">${+BO.amt > 0 ? `≈ ${boQty(+BO.amt / it.p)} Stück` : '1 Coin = 1 €'}</span></div>
    <div class="bBtns">${buy}</div><div class="bBtns">${sell}</div></div>`;
}
const boNorm = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
// Zusätzliche Suchwörter: Marken, Spiele, Produkte → Firma
const BO_WORDS = { alphabet: 'Google YouTube Android', meta: 'Facebook Instagram WhatsApp', 'take-two interactive': 'Take 2 Take2 GTA Grand Theft Auto Rockstar Red Dead 2K NBA', microsoft: 'Xbox Windows Minecraft',
  apple: 'iPhone Mac', amazon: 'Prime AWS', sony: 'PlayStation', nvidia: 'Grafikkarten GeForce', tesla: 'Elon Musk', 'electronic arts': 'EA FIFA FC', roblox: 'Robux',
  disney: 'Marvel Pixar Star Wars', netflix: 'Serien', 'coca-cola': 'Cola Coke', pepsico: 'Pepsi Lays', "mcdonald's": 'McDonalds Burger', spotify: 'Musik', uber: 'Taxi',
  'berkshire hathaway': 'Warren Buffett', strategy: 'MicroStrategy Bitcoin', 'eli lilly': 'Lilly', gamestop: 'GME', amc: 'Kino', toyota: 'Auto', ferrari: 'Auto' };
// Aktienliste: Suche + Sortierung, je 40 Stück („mehr anzeigen“)
function boStockKeys() {
  let list = [];
  if (BO.extra) for (const k in BO.extra) list.push('k:' + k);
  if (BO.all) for (const k of BO.all.keys()) list.push('k:' + k);
  if (BO.stocks) for (const k in BO.stocks) if (BO.stocks[k].cur === 'EUR') list.push(k);
  const items = list.map(boItem).filter(Boolean);
  const q = BO.q.trim().toLowerCase();
  // Suche ohne Leerzeichen/Bindestriche („take two“ = „Take-Two“), dazu bekannte Namen (Google, Facebook, GTA …)
  const nq = boNorm(q);
  const hit = it => !nq || boNorm(it.name).includes(nq) || boNorm(it.sym).startsWith(nq) || boNorm(it.key.slice(2)).includes(nq) || boNorm(BO_WORDS[it.key.slice(2)] || '').includes(nq);
  const res = items.filter(hit);
  const S = { pop: (a, b) => (b.vol || 0) - (a.vol || 0), az: (a, b) => a.name.localeCompare(b.name, 'de'), up: (a, b) => b.ch - a.ch, dn: (a, b) => a.ch - b.ch }[BO.sort] || ((a, b) => 0);
  return { res: res.sort(S), total: items.length };
}
// Laufband oben (wie an der echten Börse): meist gehandelte Aktien + Krypto mit Kurs und Veränderung
function boTicker() {
  const el = $('boTicker'); if (!el) return;
  const stamp = (BO.stand ? +BO.stand : 0) + '|' + BO.tK;
  if (el.dataset.s === stamp) return; el.dataset.s = stamp;   // nur bei neuen Kursen neu bauen (sonst springt das Band)
  const items = [];
  if (BO.all) [...BO.all.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, 16).forEach(([k]) => { const it = boItem('k:' + k); if (it) items.push(it); });
  BO_CRYPTO.slice(0, 4).forEach(c => { const it = boItem('c:' + c[0]); if (it) items.push(it); });
  if (!items.length) { el.innerHTML = ''; return; }
  const html = items.map(it => `<span><b>${boEsc(it.sym)}</b> ${boEur(it.p)} € <i class="${it.ch >= 0 ? 'up' : 'dn'}">${it.ch >= 0 ? '▲' : '▼'} ${boPct(it.ch)}</i></span>`).join('');
  el.innerHTML = `<div class="bTape">${html}${html}</div>`;
}
function renderBoerse(auto) {
  if (auto && document.activeElement && document.activeElement.id === 'boAmt') return;   // nicht neu zeichnen, während man einen Betrag tippt
  boTicker();
  $('boCoins').textContent = fmt(Math.floor(shopState.coins));
  document.querySelectorAll('#boerse [data-bt]').forEach(b => b.classList.toggle('on', b.dataset.bt === BO.tab));
  $('boTools').classList.toggle('hidden', BO.tab !== 'aktien');
  let html = '';
  const selIt = BO.sel && boItem(BO.sel);
  if (BO.tab === 'aktien') {
    const { res, total } = boStockKeys();
    if (!total) html = `<div class="bWait">${BO.err.s || 'Aktienkurse werden geladen … (alle Aktien, kann ein paar Sekunden dauern)'}</div>`;
    else {
      const st = BO.stand, today = st && st.toDateString() === new Date().toDateString();
      const stT = st ? st.toLocaleString('de-DE', today ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr' : '';
      html += `<div class="bInfo">🟢 <b>${total} Aktien</b> mit Live-Kursen in Euro${BO.loadingS ? ` – lade weitere … (Teil ${Math.min(BO.pg || 1, BO_PAGES)} von bis zu ${BO_PAGES})` : stT ? ` (Stand ${stT}, alle 10 Min. neu)` : ''}. Such einfach nach dem Namen! <b>Prozent = Veränderung der letzten 24 Stunden (in Euro)</b> – kann daher etwas von „seit gestern Abend“ in Finanz-Apps abweichen. Die Kurse kommen von tokenisierten Aktien und folgen dem echten Börsenkurs – nachts und am Wochenende kann er leicht abweichen. <span style="opacity:.6">Kursdaten: CoinGecko</span></div>`;
      if (!res.length) html += `<div class="bWait">Keine Aktie gefunden für „${boEsc(BO.q)}“.</div>`;
      const shown = res.slice(0, BO.show);
      if (selIt && !shown.some(it => it.key === BO.sel)) html += boDetail(selIt) + boRow(selIt);
      html += shown.map(it => (BO.sel === it.key ? boDetail(it) : '') + boRow(it)).join('');
      if (res.length > BO.show) html += `<button class="sec" data-more="1">Mehr anzeigen (${res.length - BO.show} weitere)</button>`;
    }
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
      else { val += c; rows += `<div class="bRow"><div class="nm"><span>${boEsc(k.replace(/^[cks]:/, ''))}<small>Kurs wird geladen …</small></span></div></div>`; }
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
    showMsg(`📈 ${boQty(amt / it.p)} ${it.name} gekauft für ${fmt(amt)} Coins`);
  } else {
    const own = boDepot.pos[it.key] || 0; if (own <= 0) return;
    const q = arg >= 1 ? own : own * arg, got = Math.floor(q * it.p);
    boDepot.cost[it.key] = (boDepot.cost[it.key] || 0) * (1 - q / own);
    boDepot.pos[it.key] = own - q;
    if (boDepot.pos[it.key] < 1e-9) { delete boDepot.pos[it.key]; delete boDepot.cost[it.key]; }
    shopState.coins += got;
    showMsg(`💰 ${boQty(q)} ${it.name} verkauft für ${fmt(got)} Coins`);
  }
  boSave(); saveShop(); updateCoins(true);
  initAudio(); sndBeep(buy ? 660 : 520, 0.1, 0.12, 'triangle'); setTimeout(() => sndBeep(buy ? 990 : 780, 0.15, 0.12, 'triangle'), 90);
  renderBoerse();
}
async function boRefresh(force) {
  const now = Date.now(), jobs = [];
  if (!BO.loadingS && (force || now - BO.tK > 60000)) jobs.push(boLoadCrypto());   // während die Aktien laden: Pause (Anfrage-Limit)
  if (!BO.noDE && (force || now - BO.tA > 300000)) jobs.push(boLoadStocks());
  if (jobs.length) { await Promise.all(jobs); if (!$('boerse').classList.contains('hidden')) renderBoerse(true); }
  // alle Aktien nur, solange die Börse offen ist (viele Daten), alle 10 Minuten; kurz nach dem Krypto-Abruf (Anfrage-Limit)
  if (!$('boerse').classList.contains('hidden') && !BO.loadingS && (!BO.tS || Date.now() - BO.tS > BO_REFRESH)) {
    await boSleep(1500); await boLoadAll(); if (!$('boerse').classList.contains('hidden')) renderBoerse(true);
  }
}
let boLock = false;   // nach dem Schließen wieder ins Spiel (wenn von der Karte aus geöffnet)
function openBoerse(fromWorld) {
  boLock = fromWorld === true;
  renderBoerse(); $('boerse').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  boRefresh(!BO.tK);
  clearInterval(BO.timer); BO.timer = setInterval(() => { if ($('boerse').classList.contains('hidden')) clearInterval(BO.timer); else boRefresh(); }, 15000);
}
function closeBoerse() { $('boerse').classList.add('hidden'); clearInterval(BO.timer); if (boLock && running && !TOUCH) lockPointer(); boLock = false; }
$('boClose').onclick = closeBoerse;
$('btnBoerse1').onclick = () => openBoerse(); $('btnBoerse2').onclick = () => openBoerse();
document.querySelectorAll('#boerse [data-bt]').forEach(b => b.onclick = () => { BO.tab = b.dataset.bt; BO.sel = null; renderBoerse(); });
// Suche: Tasten nicht ans Spiel weitergeben
{ const si = $('boSearch');
  si.addEventListener('input', () => { BO.q = si.value; BO.show = 40; BO.sel = null; renderBoerse(); });
  for (const ev of ['keydown', 'keyup']) si.addEventListener(ev, e => { e.stopPropagation(); if (e.key === 'Escape') si.blur(); });
  $('boSort').addEventListener('change', e => { BO.sort = e.target.value; BO.show = 40; renderBoerse(); }); }
// Betragsfeld: Tasten nicht ans Spiel geben, Enter = kaufen, Stückzahl live anzeigen
$('boBody').addEventListener('keydown', e => { if (e.target.id !== 'boAmt') return; e.stopPropagation(); if (e.key === 'Enter') { const b = $('boBody').querySelector('[data-buy="custom"]'); if (b) b.click(); } });
$('boBody').addEventListener('keyup', e => { if (e.target.id === 'boAmt') e.stopPropagation(); });
$('boBody').addEventListener('input', e => {
  if (e.target.id !== 'boAmt') return; BO.amt = e.target.value;
  const it = BO.sel && boItem(BO.sel), inf = $('boBody').querySelector('.bOrderInfo');
  if (it && inf) inf.textContent = +BO.amt > 0 ? `≈ ${boQty(+BO.amt / it.p)} Stück` : '1 Coin = 1 €';
});
$('boBody').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) {
    if (b.dataset.more) { BO.show += 40; renderBoerse(); return; }
    if (b.dataset.tf) { BO.tf = +b.dataset.tf; renderBoerse(); return; }
    if (b.disabled || !BO.sel) return;
    const it = boItem(BO.sel);
    if (b.dataset.buy === 'custom') { const a = Math.floor(+BO.amt); if (!(a > 0)) { showMsg('Betrag eingeben (in Coins)'); return; } if (a > shopState.coins) { showMsg('So viele Coins hast du nicht'); sndBeep(220, 0.15, 0.1, 'square'); return; } BO.amt = ''; boTrade(it, true, a); return; }
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
// Krypto-Kurse schon im Hintergrund laden (die vielen Aktien erst beim Öffnen der Börse)
setTimeout(() => boRefresh(true), 4000);
