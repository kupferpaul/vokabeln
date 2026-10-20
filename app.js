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

$('search-form').onsubmit = async (e) => {
  e.preventDefault();
  const word = $('query').value.trim();
  if (!word) return;
  const [from, to] = dir === 'de-es' ? ['de', 'es'] : ['es', 'de'];
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
};

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
};

/* ---------- Üben ---------- */

let queue = [];
let current = null;
let showingBack = false;
let frontLang = 'de';
let undoCard = null;
let undoTimer = null;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function updateCount() {
  const n = (await getAll()).length;
  $('count').textContent = n === 1 ? '1 Karte' : n + ' Karten';
  return n;
}

async function startPractice() {
  queue = [];
  current = null;
  await nextCard();
}

async function nextCard() {
  const n = await updateCount();
  $('empty').hidden = n > 0;
  $('practice-body').hidden = n === 0;
  if (n === 0) { current = null; return; }
  if (!queue.length) {
    const prev = current;
    queue = shuffle(await getAll());
    if (queue.length > 1 && prev && queue[0].id === prev.id) queue.push(queue.shift());
  }
  current = queue.shift();
  frontLang = Math.random() < 0.5 ? 'de' : 'es';
  showingBack = false;
  renderCard();
}

function renderCard() {
  const lang = showingBack ? (frontLang === 'de' ? 'es' : 'de') : frontLang;
  $('card-lang').textContent = lang === 'de' ? 'Deutsch' : 'Spanisch';
  $('card-text').textContent = current[lang];
  $('card').classList.toggle('flipped', showingBack);
}

$('card').onclick = () => { if (current) { showingBack = !showingBack; renderCard(); } };
$('next-btn').onclick = nextCard;

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
