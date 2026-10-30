'use strict';

const DB_NAME = 'vokabeln';
const DB_VERSION = 1;
const STORE = 'cards';
const UNDO_MS = 5000;

const $ = (id) => document.getElementById(id);

/* ---------- Datenbank ---------- */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      // Neue Versionen nur mit "if (e.oldVersion < n)" ergänzen. Nie Stores löschen.
      if (e.oldVersion < 1) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const dbReady = openDB();

async function tx(mode, fn) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const getAll = () => tx('readonly', (s) => s.getAll());
const putCard = (card) => tx('readwrite', (s) => s.put(card));
const addCard = (card) => tx('readwrite', (s) => s.add(card));
const deleteCard = (id) => tx('readwrite', (s) => s.delete(id));

const pairKey = (de, es) => de.trim().toLowerCase() + '\u0000' + es.trim().toLowerCase();

/* ---------- Navigation ---------- */

function showView(name) {
  $('view-search').hidden = name !== 'search';
  $('view-practice').hidden = name !== 'practice';
  $('tab-search').classList.toggle('active', name === 'search');
  $('tab-practice').classList.toggle('active', name === 'practice');
  if (name === 'practice') startPractice();
}
$('tab-search').onclick = () => showView('search');
$('tab-practice').onclick = () => showView('practice');

/* ---------- Suchen ---------- */

let dir = 'de-es';
try { if (localStorage.getItem('dir') === 'es-de') dir = 'es-de'; } catch (e) {}

function renderDir() {
  $('dir-btn').textContent = dir === 'de-es' ? 'Deutsch → Spanisch' : 'Spanisch → Deutsch';
  $('query').placeholder = dir === 'de-es' ? 'Wort auf Deutsch' : 'Wort auf Spanisch';
}
$('dir-btn').onclick = () => {
  dir = dir === 'de-es' ? 'es-de' : 'de-es';
  try { localStorage.setItem('dir', dir); } catch (e) {}
  renderDir();
};

function setMsg(text) { $('search-msg').textContent = text; }

function cleanTranslation(text, target) {
  let t = String(text || '').trim().replace(/[.!?\s]+$/, '').trim();
  if (target === 'es' && t && t !== t.toUpperCase()) t = t[0].toLowerCase() + t.slice(1);
  return t;
}

async function translate(word, from, to) {
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(word) +
    '&langpair=' + from + '|' + to;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const data = await res.json();
    if (Number(data.responseStatus) !== 200 || data.quotaFinished) return [];
    const raw = [data.responseData && data.responseData.translatedText]
      .concat((data.matches || []).map((m) => m.translation));
    const seen = new Set([word.trim().toLowerCase()]);
    const out = [];
    for (const r of raw) {
      if (/MYMEMORY|QUERY LENGTH|NO QUERY/i.test(String(r))) continue;
      const t = cleanTranslation(r, to);
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      out.push(t);
    }
    return out.slice(0, 3);
  } finally {
    clearTimeout(timer);
  }
}

function renderSuggestions(list, targetField) {
  const box = $('suggestions');
  box.textContent = '';
  for (const s of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s;
    b.onclick = () => { targetField.value = s; };
    box.appendChild(b);
  }
}

$('search-form').onsubmit = (e) => {
  e.preventDefault();
  const word = $('query').value.trim();
  if (!word) return;
  const [from, to] = dir === 'de-es' ? ['de', 'es'] : ['es', 'de'];
  runLookup(word, from, to);
};

async function runLookup(word, from, to) {
  hideRelated();
  const src = $('field-' + from);
  const dst = $('field-' + to);
  src.value = word;
  dst.value = '';
  renderSuggestions([], dst);
  setMsg('');
  if (!navigator.onLine) {
    setMsg('Übersetzen braucht Internet. Du kannst die Übersetzung selbst eintragen.');
    dst.focus();
    return;
  }
  $('translate-btn').disabled = true;
  setMsg('Suche …');
  try {
    const list = await translate(word, from, to);
    if (list.length) {
      dst.value = list[0];
      renderSuggestions(list, dst);
      setMsg('');
    } else {
      setMsg('Nichts gefunden. Trag die Übersetzung selbst ein.');
      dst.focus();
    }
  } catch (err) {
    setMsg('Übersetzen braucht Internet. Du kannst die Übersetzung selbst eintragen.');
    dst.focus();
  } finally {
    $('translate-btn').disabled = false;
  }
}

/* ---------- Verwandte Wörter (de.wiktionary.org) ---------- */

let relatedToken = 0;

function hideRelated() {
  relatedToken++;
  $('related').hidden = true;
}

function wikiLinks(text, section) {
  const m = text.match(new RegExp('\\{\\{' + section + '\\}\\}\\n([\\s\\S]*?)(?:\\n\\n|\\n\\{\\{)'));
  if (!m) return [];
  // Zeilen mit Stilangaben (ugs., salopp, veraltet ...) überspringen
  const clean = m[1].split('\n').filter((l) => !/''|\{\{/.test(l.replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '')))
    .join('\n')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[\s\S]*?<\/ref>/g, '');
  return Array.from(clean.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g), (x) => x[1].trim());
}

async function relatedWords(de, exclude) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const titles = [de, de[0].toUpperCase() + de.slice(1)];
    let text = '';
    for (const title of titles) {
      const url = 'https://de.wiktionary.org/w/api.php?action=query&prop=revisions&rvprop=content' +
        '&rvslots=main&format=json&formatversion=2&origin=*&titles=' + encodeURIComponent(title);
      const data = await (await fetch(url, { signal: ctrl.signal })).json();
      const page = data.query && data.query.pages && data.query.pages[0];
      if (page && page.revisions) { text = page.revisions[0].slots.main.content; break; }
    }
    const out = [];
    for (const w of wikiLinks(text, 'Synonyme').concat(wikiLinks(text, 'Oberbegriffe'))) {
      const k = w.toLowerCase();
      if (exclude.has(k) || /\d/.test(w) || w.length > 25 || w.split(/\s+/).length > 2) continue;
      exclude.add(k);
      out.push(w);
    }
    return out.slice(0, 3);
  } catch (err) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function showRelated(de, cards) {
  const token = ++relatedToken;
  $('related-chips').textContent = '';
  $('related').hidden = false;
  const exclude = new Set(cards.map((c) => c.de.toLowerCase()));
  exclude.add(de.toLowerCase());
  const words = await relatedWords(de, exclude);
  if (token !== relatedToken) return;
  for (const w of words) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = w;
    b.onclick = () => { $('query').value = w; runLookup(w, 'de', 'es'); };
    $('related-chips').appendChild(b);
  }
}

$('related-no').onclick = hideRelated;
$('related-own').onclick = () => { hideRelated(); $('query').focus(); };

$('save-btn').onclick = async () => {
  const de = $('field-de').value.trim();
  const es = $('field-es').value.trim();
  if (!de || !es) { setMsg('Bitte beide Seiten ausfüllen.'); return; }
  const key = pairKey(de, es);
  const cards = await getAll();
  if (cards.some((c) => pairKey(c.de, c.es) === key)) {
    setMsg('Diese Karte gibt es schon.');
    return;
  }
  await addCard({ de, es, createdAt: Date.now() });
  $('field-de').value = '';
  $('field-es').value = '';
  $('query').value = '';
  renderSuggestions([], $('field-de'));
  setMsg('Gespeichert. Karten: ' + (cards.length + 1));
  showRelated(de, cards);
};

/* ---------- Üben ---------- */

const MASTER_STREAK = 3;  // so oft in Folge gewusst, dann Nachfrage
const PAUSE_ROUNDS = 2;   // so viele Runden wird die Karte dann übersprungen

let queue = [];
let current = null;
let showingBack = false;
let frontLang = 'de';
let roundActive = false;
let roundTotal = 0;
let roundStats = { right: 0, wrong: 0 };
let undoCard = null;
let undoTimer = null;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function startRound(prev) {
  const all = await getAll();
  let eligible = all.filter((c) => !(c.pause > 0));
  for (const c of all.filter((x) => x.pause > 0)) {
    c.pause -= 1;
    await putCard(c);
  }
  if (!eligible.length) eligible = all;
  queue = shuffle(eligible.slice());
  if (queue.length > 1 && prev && queue[0].id === prev.id) queue.push(queue.shift());
  roundTotal = queue.length;
  roundStats = { right: 0, wrong: 0 };
  roundActive = true;
}

async function startPractice() {
  queue = [];
  current = null;
  roundActive = false;
  await nextCard();
}

async function nextCard() {
  const total = (await getAll()).length;
  $('empty').hidden = total > 0;
  $('done').hidden = true;
  $('practice-body').hidden = true;
  if (total === 0) { current = null; $('count').textContent = ''; return; }
  const prev = current;
  if (!roundActive) {
    await startRound(prev);
  } else if (!queue.length) {
    current = null;
    roundActive = false;
    const { right, wrong } = roundStats;
    $('done-stats').textContent = right + wrong
      ? 'Gewusst: ' + right + ' · Nicht gewusst: ' + wrong
      : 'Alle Karten einmal durch.';
    $('count').textContent = total === 1 ? '1 Karte' : total + ' Karten';
    $('done').hidden = false;
    return;
  }
  current = queue.shift();
  frontLang = Math.random() < 0.5 ? 'de' : 'es';
  showingBack = false;
  $('practice-body').hidden = false;
  let count = 'Karte ' + (roundTotal - queue.length) + ' von ' + roundTotal;
  if (total !== roundTotal) count += ' · ' + total + ' im Stapel';
  $('count').textContent = count;
  renderCard();
}

function renderCard() {
  const lang = showingBack ? (frontLang === 'de' ? 'es' : 'de') : frontLang;
  $('card-lang').textContent = lang === 'de' ? 'Deutsch' : 'Spanisch';
  $('card-text').textContent = current[lang];
  $('card').classList.toggle('flipped', showingBack);
  $('next-btn').hidden = showingBack;
  $('rate').hidden = !showingBack;
  $('mastered').hidden = true;
}

$('card').onclick = () => {
  if (!current || !$('mastered').hidden) return;
  showingBack = !showingBack;
  renderCard();
};
$('next-btn').onclick = nextCard;
$('again-btn').onclick = nextCard;

async function rate(known) {
  const card = current;
  if (!card) return;
  card.streak = known ? (card.streak || 0) + 1 : 0;
  roundStats[known ? 'right' : 'wrong']++;
  await putCard(card);
  if (known && card.streak >= MASTER_STREAK) {
    $('rate').hidden = true;
    $('mastered').hidden = false;
    return;
  }
  await nextCard();
}
$('right-btn').onclick = () => rate(true);
$('wrong-btn').onclick = () => rate(false);

$('mastered-yes').onclick = async () => {
  current.streak = 0;
  current.pause = PAUSE_ROUNDS;
  await putCard(current);
  await nextCard();
};
$('mastered-no').onclick = async () => {
  current.streak = 0;
  await putCard(current);
  await nextCard();
};

function hideUndo() {
  clearTimeout(undoTimer);
  undoTimer = null;
  undoCard = null;
  $('undo').hidden = true;
}

$('remove-btn').onclick = async () => {
  if (!current) return;
  const removed = current;
  await deleteCard(removed.id);
  roundTotal--;
  undoCard = removed;
  $('undo').hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, UNDO_MS);
  await nextCard();
};

$('undo-btn').onclick = async () => {
  if (!undoCard) return;
  const card = undoCard;
  hideUndo();
  await putCard(card);
  roundActive = true;
  roundTotal++;
  queue.unshift(card);
  current = null;
  await nextCard();
};

/* ---------- Backup ---------- */

function menuMsg(text) { $('menu-msg').textContent = text; }

$('menu-btn').onclick = () => { menuMsg(''); $('menu').showModal(); };
$('menu-close').onclick = () => $('menu').close();

$('export-btn').onclick = async () => {
  const cards = await getAll();
  const stamp = new Date().toISOString().slice(0, 10);
  const name = 'vokabeln-' + stamp + '.json';
  const payload = JSON.stringify({
    app: 'vokabeln',
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: cards.map(({ de, es, createdAt }) => ({ de, es, createdAt })),
  }, null, 2);
  const file = new File([payload], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      menuMsg('Exportiert: ' + cards.length + ' Karten.');
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  menuMsg('Exportiert: ' + cards.length + ' Karten.');
};

$('import-btn').onclick = () => $('import-file').click();

$('import-file').onchange = async () => {
  const input = $('import-file');
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data && data.cards;
    if (!Array.isArray(list)) throw new Error('format');
    const seen = new Set((await getAll()).map((c) => pairKey(c.de, c.es)));
    let added = 0;
    let skipped = 0;
    for (const c of list) {
      const de = c && typeof c.de === 'string' ? c.de.trim() : '';
      const es = c && typeof c.es === 'string' ? c.es.trim() : '';
      if (!de || !es) { skipped++; continue; }
      const key = pairKey(de, es);
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      await addCard({ de, es, createdAt: Number(c.createdAt) || Date.now() });
      added++;
    }
    menuMsg(added + ' neu, ' + skipped + ' übersprungen.');
  } catch (err) {
    menuMsg('Die Datei konnte nicht gelesen werden.');
  }
};

/* ---------- Start ---------- */

renderDir();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
