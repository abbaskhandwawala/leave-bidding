// IOCC Sharjah · Leave bidding 2027 · page logic
import { firebaseConfig } from './firebase-config.js';
import { DEFAULTS, TITLE, LOGIN_DOMAIN } from './settings.js';
let DEFAULT_PASSWORD = '';   // first-login password, kept in Firebase (config/initial), never in this public code

const DEMO = !firebaseConfig.apiKey || firebaseConfig.apiKey === 'PASTE_HERE';
const N = 365, Y0 = Date.UTC(2027, 0, 1), DAY = 864e5, LAST_START = N - 4;
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
const RL = { SL: 'Shift Lead', PO: 'Controller (Pre-Ops)', HUB: 'Hub & Station Coordinator' };
const RS = { SL: 'Lead', PO: 'Controller', HUB: 'Coordinator' };
let STAFF = [], BY = {};   // loaded from Firebase (config/staff) after sign-in
const setStaff = list => { STAFF = (list || []).slice().sort((a, b) => a.name.localeCompare(b.name)); BY = Object.fromEntries(STAFF.map(s => [s.name, s])); };

// ---------- helpers
const $ = id => document.getElementById(id);
const el = (t, a = {}, ...k) => { const e = document.createElement(t); for (const [x, y] of Object.entries(a)) { if (y == null || y === false) continue; if (x === 'class') e.className = y; else if (x === 'text') e.textContent = y; else if (x.startsWith('on')) e[x] = y; else e.setAttribute(x, y === true ? '' : y); } k.flat().forEach(c => c != null && c !== '' && e.append(c)); return e; };
const idx = iso => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Y0) / DAY);
const dd = i => new Date(Y0 + i * DAY);
const fmt = i => { const d = dd(i); return `${WD[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${MN[d.getUTCMonth()]}`; };
const blockLabel = iso => { const a = idx(iso); return `${fmt(a)} – ${fmt(a + 3)}`; };
const isoOf = i => dd(i).toISOString().slice(0, 10);
const DXB = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const when = ms => ms ? DXB.format(new Date(ms)) : '';
const isLead = p => p === 'SL' || p === 'PO';
const other = g => g === 'A' ? 'B' : 'A';
const loginEmail = id => { const v = String(id).trim().toLowerCase(); return v.includes('@') ? v : `${v}@${LOGIN_DOMAIN}`; };   // staff sign in with their staff number; a manager may use an email
const toast = t => { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 5000); };
const errText = e => { const c = (e && e.code) || ''; return ({ 'auth/invalid-credential': 'Staff number or password is wrong.', 'auth/wrong-password': 'Staff number or password is wrong.', 'auth/user-not-found': 'No login for this staff number. Ask the OCC Manager.', 'auth/invalid-email': 'Enter your staff number (digits only).', 'auth/weak-password': 'Use at least 8 characters.', 'auth/requires-recent-login': 'Please sign out, sign in again and then change your password.', 'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.', 'auth/email-already-in-use': 'A login already exists for this staff number.', 'permission-denied': 'Not allowed: bidding may be closed, or your password has not been changed yet.' })[c] || (e && e.message) || String(e); };

// ---------- state
let B = null, USER = null, ME = null, ADMIN = false, PWOK = false;
let CONF = { ...DEFAULTS }, SLOTS = [], AUDIT = [], STAFFMAP = [], PWMAP = {};
let unsub = [];
let VIEW = { month: 0, free: false, target: null };

// ---------- allocation: priority group first, then first come first served by slot time
function allocate(slots) {
  const pr = s => s.grp === CONF.prio ? 0 : 1;
  const rows = slots.filter(r => r.start && BY[r.name]).map(r => ({ ...r }));
  rows.sort((a, b) => pr(BY[a.name]) - pr(BY[b.name]) || a.ts - b.ts || a.name.localeCompare(b.name) || a.slot - b.slot);
  const off = Array.from({ length: N + 4 }, () => []), used = { A: 0, B: 0 }, mine = {};
  const budget = g => g === CONF.prio ? CONF.budgetP : CONF.budgetO;
  const key = CONF.key || [];
  rows.forEach((r, k) => {
    const s = BY[r.name]; r.queue = k + 1; r.ok = false; r.overlap = false; r.with = [];
    const a = idx(r.start), days = [a, a + 1, a + 2, a + 3];
    const why = (() => {
      if (a < 0 || a > LAST_START) return 'The block must start and end inside 2027.';
      if (days.some(d => (mine[r.name] || []).includes(d))) return 'Overlaps another of your own approved blocks.';
      for (const d of days) {
        const L = off[d];
        if (L.length + 1 > CONF.maxTotal) return `${fmt(d)}: ${L.map(x => x.name).join(', ')} already on leave (max ${CONF.maxTotal} a day).`;
        if (isLead(s.pos)) { const l = L.filter(x => isLead(x.pos)); if (l.length >= CONF.leadCap) return `${fmt(d)}: ${l.map(x => x.name).join(', ')} (Shift Lead/Controller) already on leave; only ${CONF.leadCap} at a time.`; }
        const hubs = L.filter(x => x.pos === 'HUB'); const keyOff = L.some(x => key.includes(x.name)) || key.includes(s.name);
        if (s.pos === 'HUB') { const cap = keyOff ? CONF.hubKeyCap : CONF.hubCap; if (hubs.length + 1 > cap) return `${fmt(d)}: ${hubs.map(x => x.name).join(', ')} already on leave${keyOff ? ` while ${key.join(' or ')} is on leave, so only ${cap} Coordinator at a time` : ` (max ${cap} Coordinators)`}.`; }
        if (key.includes(s.name) && hubs.length > CONF.hubKeyCap) return `${fmt(d)}: ${hubs.map(x => x.name).join(', ')} (Coordinators) are on leave, which needs ${s.name} at work.`;
      }
      return '';
    })();
    if (why) { r.why = why; return; }
    const w = new Set(); days.forEach(d => off[d].forEach(x => w.add(x.name))); r.with = [...w]; r.overlap = w.size > 0;
    if (r.overlap && used[s.grp] >= budget(s.grp)) { r.why = `Overlaps ${r.with.join(', ')} and Group ${s.grp} has used all ${budget(s.grp)} overlaps.`; return; }
    if (r.overlap) { used[s.grp]++; r.why = `Overlaps ${r.with.join(', ')}; overlap ${used[s.grp]} of ${budget(s.grp)} for Group ${s.grp}.`; }
    else r.why = 'No conflict.';
    r.ok = true; days.forEach(d => off[d].push({ name: s.name, pos: s.pos })); (mine[r.name] = mine[r.name] || []).push(...days);
  });
  return { order: rows, used, off };
}
const status = r => !r ? '' : r.ok ? (r.overlap ? 'Approved (overlap)' : 'Approved') : 'Refused';
function tryBlock(n, start) {
  const cur = SLOTS.find(x => x.name === ME.name && x.slot === n);
  if (cur && cur.start === start) return allocate(SLOTS).order.find(x => x.name === ME.name && x.slot === n);
  const rows = SLOTS.filter(x => !(x.name === ME.name && x.slot === n)).concat([{ name: ME.name, slot: n, start, ts: Date.now() + 1e9 }]);
  return allocate(rows).order.find(x => x.name === ME.name && x.slot === n);
}
const isOpenNow = () => CONF.open && (!CONF.closeAt || Date.now() < CONF.closeAt);
function chance(r) {
  if (!r || !r.ok) return 0;
  if (!isOpenNow()) return 100;
  let p = r.overlap ? 75 : 95;
  if (BY[r.name].grp !== CONF.prio) {
    const pendingPrio = STAFF.filter(s => s.grp === CONF.prio && SLOTS.filter(x => x.name === s.name && x.start).length < 4).length;
    p -= Math.min(25, pendingPrio * 2);
  }
  return p;
}
const chanceLabel = p => p >= 90 ? ['ok', 'Very likely'] : p >= 70 ? ['ok', 'Likely'] : p >= 45 ? ['warn', 'Possible'] : p > 0 ? ['warn', 'Unlikely'] : ['bad', 'Not possible'];

// ---------- backends
async function firebaseBackend() {
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const { initializeApp, deleteApp } = await import(base + 'firebase-app.js');
  const A = await import(base + 'firebase-auth.js');
  const F = await import(base + 'firebase-firestore.js');
  const app = initializeApp(firebaseConfig), auth = A.getAuth(app), db = F.getFirestore(app);
  const conv = d => { const o = { ...d }; for (const k of ['ts', 'upd', 'at', 'closeAt']) if (o[k] && o[k].toMillis) o[k] = o[k].toMillis(); return o; };
  const data = s => conv(s.data({ serverTimestamps: 'estimate' }));
  return {
    demo: false,
    onAuth: cb => A.onAuthStateChanged(auth, u => cb(u ? { email: u.email.toLowerCase(), no: u.email.toLowerCase().split('@')[0] } : null)),
    signIn: (id, p) => A.signInWithEmailAndPassword(auth, loginEmail(id), p),
    changePassword: async (oldPw, newPw) => {
      const u = auth.currentUser; await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, oldPw)); await A.updatePassword(u, newPw);
      await F.setDoc(F.doc(db, 'pw', u.email.toLowerCase().split('@')[0]), { changed: true, at: F.serverTimestamp() });
    },
    createLogin: async (id, name) => {   // manager only: create a staff login with the default password without signing the manager out
      if (!DEFAULT_PASSWORD) throw new Error('Set the first-login password in Manager controls first.');
      const sec = initializeApp(firebaseConfig, 'creator-' + Date.now()); const sa = A.getAuth(sec);
      let created = true;
      try { await A.createUserWithEmailAndPassword(sa, loginEmail(id), DEFAULT_PASSWORD); }
      catch (e) { if (e.code === 'auth/email-already-in-use') created = false; else throw e; }
      finally { try { await A.signOut(sa); } catch (e) { } await deleteApp(sec); }
      await F.setDoc(F.doc(db, 'staff', String(id)), { name });
      if (created) await F.setDoc(F.doc(db, 'pw', String(id)), { changed: false });
      return created;
    },
    signOut: () => A.signOut(auth),
    get: async p => { const s = await F.getDoc(F.doc(db, p)); return s.exists() ? data(s) : null; },
    watchDoc: (p, cb, err) => F.onSnapshot(F.doc(db, p), s => cb(s.exists() ? data(s) : null), err),
    watchCol: (p, cb, err, no) => F.onSnapshot(no ? F.query(F.collection(db, p), F.where('no', '==', no)) : F.collection(db, p), q => cb(q.docs.map(d => ({ id: d.id, ...data(d) }))), err),
    audit: (who, e) => F.setDoc(F.doc(F.collection(db, 'audit')), { no: who.no, name: who.name, action: e.action, slot: e.slot ?? null, slotDoc: e.slotDoc ?? null, prev: e.prev ?? null, next: e.next ?? null, detail: e.detail ?? '', at: F.serverTimestamp() }),
    saveSlot: (who, n, start, prev) => {
      const id = `${who.no}__${n}`, ar = F.doc(F.collection(db, 'audit')), b = F.writeBatch(db);
      b.set(ar, { no: who.no, name: who.name, action: prev && prev.start ? (start ? 'Changed' : 'Withdrawn') : 'Added', slot: n, slotDoc: id, prev: prev ? prev.start ?? null : null, next: start, detail: '', at: F.serverTimestamp() });
      b.set(F.doc(db, 'slots', id), { no: who.no, name: who.name, slot: n, start, ts: F.serverTimestamp(), upd: F.serverTimestamp(), auditId: ar.id });
      return b.commit();
    },
    set: (p, d) => F.setDoc(F.doc(db, p), d),
    del: p => F.deleteDoc(F.doc(db, p)),
    stamp: ms => ms == null ? null : F.Timestamp.fromMillis(ms),
  };
}

function demoBackend() {
  const KEY = 'iocc-bid2-demo-2027';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  const DEMO_STAFF = [['Demo Lead 1', 'SL', 'A'], ['Demo Lead 2', 'SL', 'B'], ['Demo Controller 1', 'PO', 'A'], ['Demo Controller 2', 'PO', 'B'], ['Demo Coordinator 1', 'HUB', 'A'], ['Demo Coordinator 2', 'HUB', 'B'], ['Demo Coordinator 3', 'HUB', 'A']].map(([name, pos, grp]) => ({ name, pos, grp }));
  let S = load() || { slots: {}, audit: [], staff: Object.fromEntries(DEMO_STAFF.map((s, i) => [String(900001 + i), { name: s.name }])), pw: {}, pass: {}, config: { ...DEFAULTS, open: true, key: ['Demo Controller 1'] }, staffList: { list: DEMO_STAFF }, initial: { password: 'Demo@2027' }, admins: { manager: {} }, user: null };
  const subs = new Set(); let authCb = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } subs.forEach(f => f()); };
  const col = c => c === 'slots' ? S.slots : c === 'staff' ? S.staff : c === 'admins' ? S.admins : c === 'pw' ? S.pw : c === 'config' ? { settings: S.config, staff: S.staffList, initial: S.initial } : Object.fromEntries(S.audit.map(a => [a.id, a]));
  const path = p => { const [c, d] = p.split('/'); return { c, d }; };
  const watch = fn => { subs.add(fn); fn(); return () => subs.delete(fn); };
  const addAudit = (who, e) => { const id = 'a' + Date.now() + Math.random().toString(36).slice(2, 6); S.audit.push({ id, no: who.no, name: who.name, action: e.action, slot: e.slot ?? null, slotDoc: e.slotDoc ?? null, prev: e.prev ?? null, next: e.next ?? null, detail: e.detail ?? '', at: Date.now() }); return id; };
  return {
    demo: true, demoIds: () => ({ ...Object.fromEntries(Object.entries(S.staff).map(([k, v]) => [v.name, k])) }),
    onAuth: cb => { authCb = cb; cb(S.user); },
    signIn: async (id, p) => { id = String(id).trim().toLowerCase(); const ok = (S.staff[id] || S.admins[id]) && p === (S.pass[id] || S.initial.password); if (!ok) throw { code: 'auth/invalid-credential' }; S.user = { email: loginEmail(id), no: id }; save(); authCb(S.user); },
    changePassword: async (o, n) => { const id = S.user.no; if (o !== (S.pass[id] || S.initial.password)) throw { code: 'auth/invalid-credential' }; S.pass[id] = n; S.pw[id] = { changed: true, at: Date.now() }; save(); },
    createLogin: async (id, name) => { const created = !S.staff[id] || !S.pw[id]; S.staff[id] = { name }; if (created) S.pw[id] = { changed: false }; save(); return created; },
    signOut: async () => { S.user = null; save(); authCb(null); },
    get: async p => { const { c, d } = path(p); const v = col(c)[d]; return v ? { ...v } : null; },
    watchDoc: (p, cb) => watch(() => { const { c, d } = path(p); const v = col(c)[d]; cb(v ? { ...v } : null); }),
    watchCol: (p, cb, err, no) => watch(() => cb(Object.entries(col(p)).map(([id, v]) => ({ id, ...v })).filter(x => !no || x.no === no))),
    audit: async (who, e) => { addAudit(who, e); save(); },
    saveSlot: async (who, n, start, prev) => {
      if (!(S.config.open && (!S.config.closeAt || Date.now() < S.config.closeAt)) || !(S.pw[who.no] || {}).changed) throw { code: 'permission-denied' };
      const id = `${who.no}__${n}`; const auditId = addAudit(who, { action: prev && prev.start ? (start ? 'Changed' : 'Withdrawn') : 'Added', slot: n, slotDoc: id, prev: prev ? prev.start ?? null : null, next: start });
      S.slots[id] = { no: who.no, name: who.name, slot: n, start, ts: Date.now(), upd: Date.now(), auditId }; save();
    },
    set: async (p, d) => { const { c, d: k } = path(p); if (c === 'config') { if (k === 'staff') S.staffList = d; else if (k === 'initial') S.initial = d; else S.config = d; } else col(c)[k] = d; save(); },
    del: async p => { const { c, d } = path(p); delete col(c)[d]; save(); },
    stamp: ms => ms,
    reset: () => { localStorage.removeItem(KEY); location.reload(); },
  };
}

// ---------- screens
function show(which) { for (const id of ['s-login', 's-pw', 's-nolist', 's-app']) $(id).hidden = id !== which; }

function renderLogin() {
  const id = el('input', { type: 'text', id: 'l-id', autocomplete: 'username', placeholder: 'e.g. 123456', 'aria-label': 'Staff number' });
  const pw = el('input', { type: 'password', id: 'l-pw', autocomplete: 'current-password', placeholder: 'Password', 'aria-label': 'Password' });
  const msg = el('p', { class: 'msg', role: 'status' });
  const form = el('form', { class: 'login' }, el('label', { class: 'lbl', for: 'l-id' }, 'Staff number (manager: email)'), id, el('label', { class: 'lbl', for: 'l-pw' }, 'Password'), pw,
    el('div', { class: 'row' }, el('button', { class: 'btn pri', type: 'submit', text: 'Sign in' })), msg);
  form.onsubmit = async e => { e.preventDefault(); msg.className = 'msg'; msg.textContent = 'Signing in…'; try { await B.signIn(id.value, pw.value); } catch (er) { msg.className = 'msg bad'; msg.textContent = errText(er); } };
  const extra = B.demo ? el('p', { class: 'note' }, `DEMO MODE: not connected to Firebase yet; data stays in this browser. Try staff number ${Object.values(B.demoIds())[0]} (${Object.keys(B.demoIds())[0]}) or "manager", password Demo@2027. `, el('button', { class: 'btn', type: 'button', text: 'Clear demo data', onclick: () => B.reset() })) : null;
  $('login-box').replaceChildren(el('p', { class: 'sub', text: 'Sign in with your staff number. First time: use the first-login password the OCC Manager gave you; you will be asked to choose your own password straight away. Forgot your password? Ask the OCC Manager to reset it.' }), form, ...(extra ? [extra] : []));
}

function renderPw(first) {
  const cur = el('input', { type: 'password', id: 'p-cur', autocomplete: 'current-password', 'aria-label': 'Current password', value: first ? '' : '' });
  const n1 = el('input', { type: 'password', id: 'p-n1', autocomplete: 'new-password', 'aria-label': 'New password' });
  const n2 = el('input', { type: 'password', id: 'p-n2', autocomplete: 'new-password', 'aria-label': 'Repeat new password' });
  const msg = el('p', { class: 'msg', role: 'status' });
  const form = el('form', { class: 'login' },
    el('label', { class: 'lbl', for: 'p-cur' }, first ? 'Current password (the first-login password)' : 'Current password'), cur,
    el('label', { class: 'lbl', for: 'p-n1' }, 'New password (at least 8 characters)'), n1,
    el('label', { class: 'lbl', for: 'p-n2' }, 'Repeat new password'), n2,
    el('div', { class: 'row' }, el('button', { class: 'btn pri', type: 'submit', text: 'Change password' }), first ? null : el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => { $('s-pw').hidden = true; $('s-app').hidden = false; } })), msg);
  form.onsubmit = async e => {
    e.preventDefault(); msg.className = 'msg bad';
    if (n1.value.length < 8) { msg.textContent = 'Use at least 8 characters.'; return; }
    if (DEFAULT_PASSWORD && n1.value === DEFAULT_PASSWORD) { msg.textContent = 'Choose a password different from the first-login password.'; return; }
    if (n1.value !== n2.value) { msg.textContent = 'The two new passwords do not match.'; return; }
    msg.className = 'msg'; msg.textContent = 'Saving…';
    try { await B.changePassword(cur.value, n1.value); await B.audit(who(), { action: 'Password changed' }).catch(() => { }); PWOK = true; toast('Password changed. Only you can sign in with it now.'); enterApp(); }
    catch (er) { msg.className = 'msg bad'; msg.textContent = errText(er); }
  };
  $('pw-box').replaceChildren(el('p', { text: first ? 'Before you can bid, choose your own password. This makes sure nobody else can sign in as you and bid on your behalf.' : 'Choose a new password.' }), form);
  show('s-pw');
}
const who = () => ME ? { no: ME.no, name: ME.name } : { no: USER.no, name: 'Manager' };

async function onAuth(u) {
  unsub.forEach(f => { try { f(); } catch (e) { } }); unsub = []; VIEW = { month: 0, free: false, target: null };
  USER = u; ME = null; ADMIN = false; PWOK = false; SLOTS = []; AUDIT = []; STAFFMAP = []; PWMAP = {};
  $('who').replaceChildren(); $('admin').hidden = true;
  if (!u) { show('s-login'); renderLogin(); setSync(B.demo ? 'Demo mode' : 'Signed out', B.demo ? 'warn' : 'mut'); return; }
  setSync('Checking your access…', 'mut');
  let st = null, ad = null, pw = null;
  try { [st, ad, pw] = await Promise.all([B.get('staff/' + u.no), B.get('admins/' + u.no), B.get('pw/' + u.no)]); } catch (e) { }
  try { const l = await B.get('config/staff'); setStaff(l && l.list); } catch (e) { setStaff([]); }
  try { const ip = await B.get('config/initial'); DEFAULT_PASSWORD = (ip && ip.password) || ''; } catch (e) { DEFAULT_PASSWORD = ''; }
  ADMIN = !!ad; PWOK = !!(pw && pw.changed);
  if (st && BY[st.name]) ME = { no: u.no, name: st.name, s: BY[st.name] };
  $('who').replaceChildren(el('span', { class: 'sub', text: ME ? ME.name : ADMIN ? 'OCC Manager' : u.no }), el('button', { class: 'btn', type: 'button', text: 'Change password', onclick: () => renderPw(false) }), el('button', { class: 'btn', type: 'button', text: 'Sign out', onclick: () => B.signOut() }));
  if (!ME && !ADMIN) { show('s-nolist'); $('nolist-box').replaceChildren(el('p', { text: `Staff number ${u.no} is not on the IOCC Sharjah bidding list. Ask the OCC Manager.` })); setSync('Not on the list', 'bad'); return; }
  if (!PWOK) { setSync('Change your password to continue', 'warn'); renderPw(true); return; }
  enterApp();
}
function enterApp() {
  show('s-app');
  if (!sessionStorage.getItem('iocc-signed-' + USER.no)) { sessionStorage.setItem('iocc-signed-' + USER.no, '1'); B.audit(who(), { action: 'Signed in', detail: ADMIN && !ME ? 'manager' : '' }).catch(() => { }); }
  const fail = e => setSync('Connection problem: ' + errText(e), 'bad');
  unsub.push(B.watchDoc('config/settings', d => { CONF = { ...DEFAULTS, ...(d || {}) }; render(); }, fail));
  unsub.push(B.watchDoc('config/staff', d => { setStaff(d && d.list); render(); }, fail));
  unsub.push(B.watchCol('slots', list => { SLOTS = list.map(x => ({ ...x, ts: x.ts || Date.now() })); setSync('Live · updates as colleagues bid', 'ok'); render(); }, fail));
  unsub.push(B.watchCol('audit', list => { AUDIT = list.sort((a, b) => (b.at || 0) - (a.at || 0)); render(); }, fail, ADMIN ? null : USER.no));
  if (ADMIN) { unsub.push(B.watchCol('staff', list => { STAFFMAP = list; render(); }, fail)); unsub.push(B.watchCol('pw', list => { PWMAP = Object.fromEntries(list.map(x => [x.id, x])); render(); }, fail)); }
}
function setSync(t, c) { const s = $('sync'); s.textContent = t; s.className = 'pill ' + c; }

// ---------- render
function render() {
  if (!USER || (!ME && !ADMIN) || $('s-app').hidden) return;
  const A = allocate(SLOTS);
  renderState(); renderHero(A); renderMine(A); renderPick(); renderCal(A); renderResults(A); renderMyAudit(); renderRules(); renderAdmin(A);
}
function renderState() { const o = isOpenNow(); $('state').className = 'pill ' + (o ? 'ok' : 'bad'); $('state').textContent = o ? (CONF.closeAt ? `Bidding open until ${when(CONF.closeAt)}` : 'Bidding open') : 'Bidding closed'; }
function renderHero(A) {
  const h = $('hero');
  if (!ME) { h.replaceChildren(el('div', { class: 'who' }, el('span', { class: 'big', text: 'OCC Manager' }), el('span', { class: 'sub', text: 'You can see every bid and the audit log, change settings and create staff logins. You cannot bid for anyone.' }))); return; }
  const s = ME.s, prio = s.grp === CONF.prio, n = SLOTS.filter(x => x.name === ME.name && x.start).length;
  const ahead = A.order.filter(r => BY[r.name].grp === CONF.prio).length;
  h.replaceChildren(el('div', { class: 'who' }, el('span', { class: 'big', text: ME.name }), el('span', { class: 'sub', text: `${RL[s.pos]} · staff no. ${ME.no}` })),
    el('div', { class: 'prioBanner' }, el('span', { class: 'chip ' + s.grp, text: s.grp }), el('span', {}, el('b', { text: `Group ${s.grp}` }), prio ? ` has leave priority in 2027: your requests come before every Group ${other(s.grp)} request.` : ` follows Group ${CONF.prio}: ${ahead} Group ${CONF.prio} block${ahead === 1 ? '' : 's'} are ahead of you in the queue.`)),
    el('div', { class: 'sub', text: `${n} of 4 slots chosen` }));
}
function renderMine(A) {
  if (!ME) { $('mine-card').hidden = true; $('pick-card').hidden = true; return; }
  $('mine-card').hidden = false; $('pick-card').hidden = false;
  if (!VIEW.target) VIEW.target = [1, 2, 3, 4].find(k => !SLOTS.find(x => x.name === ME.name && x.slot === k && x.start)) || 1;
  const open = isOpenNow();
  $('mine').replaceChildren(...[1, 2, 3, 4].map(n => {
    const d = SLOTS.find(x => x.name === ME.name && x.slot === n); const r = d && d.start ? A.order.find(x => x.name === ME.name && x.slot === n) : null;
    const [, t] = chanceLabel(chance(r));
    return el('div', { class: 'slot' + (VIEW.target === n ? ' target' : '') },
      el('span', { class: 'n', text: 'Slot ' + n }), el('span', { class: 'dt', text: d && d.start ? blockLabel(d.start) : '—' }),
      el('span', {}, d && d.start ? el('span', { class: 'pill ' + (r.ok ? (r.overlap ? 'warn' : 'ok') : 'bad'), text: status(r) + (r.ok && open ? ` · ${t}` : '') }) : el('span', { class: 'sub', text: 'empty' })),
      el('span', { class: 'why sub' }, d && d.start ? `${r.why} Time-stamped ${when(d.ts)} (queue #${r.queue}).` : 'Not chosen yet.'),
      el('span', { class: 'row' }, el('button', { class: 'btn' + (VIEW.target === n ? ' pri' : ''), type: 'button', text: d && d.start ? 'Change' : 'Choose', disabled: !open, onclick: () => { VIEW.target = n; render(); $('pick-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }),
        el('button', { class: 'btn', type: 'button', text: 'Withdraw', disabled: !open || !(d && d.start), onclick: () => saveSlot(n, null) })));
  }));
}
function renderPick() {
  if (!ME) return;
  const n = VIEW.target; $('pick-title').textContent = `Choose a block for slot ${n}`;
  const msel = $('f-month'); if (!msel.options.length) MN.forEach((m, i) => msel.append(el('option', { value: i, text: m + ' 2027' })));
  msel.value = VIEW.month; msel.onchange = () => { VIEW.month = +msel.value; renderPick(); };
  $('f-free').checked = VIEW.free; $('f-free').onchange = e => { VIEW.free = e.target.checked; renderPick(); };
  const di = $('f-date'); di.onchange = () => { if (!di.value) return; const i = idx(di.value); VIEW.month = MS.findIndex((m, k) => i >= m && i < MS[k + 1]); renderPick(); setTimeout(() => { const r = document.querySelector(`[data-start="${di.value}"]`); if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('flash'); } }, 50); };
  const open = isOpenNow();
  const mineDays = new Set(); SLOTS.filter(x => x.name === ME.name && x.start && x.slot !== n).forEach(x => { for (let k = 0; k < 4; k++) mineDays.add(idx(x.start) + k); });
  let list = []; for (let a = MS[VIEW.month]; a < MS[VIEW.month + 1] && a <= LAST_START; a++) {
    const x = isoOf(a); const own = [0, 1, 2, 3].some(k => mineDays.has(a + k)); const r = own ? null : tryBlock(n, x);
    list.push({ x, r, p: chance(r), cat: own ? 3 : r.ok ? (r.overlap ? 1 : 0) : 2 });
  }
  if (VIEW.free) list = list.filter(o => o.cat === 0);
  const cur = SLOTS.find(x => x.name === ME.name && x.slot === n);
  $('blocks').replaceChildren(...(list.length ? list.map(o => {
    const [c, t] = chanceLabel(o.p); const isCur = cur && cur.start === o.x;
    return el('div', { class: 'blk ' + (o.cat === 0 ? 'free' : o.cat === 1 ? 'ovl' : 'no'), 'data-start': o.x },
      el('span', { class: 'mono', text: blockLabel(o.x) }),
      el('span', {}, o.cat === 3 ? el('span', { class: 'pill mut', text: 'Overlaps your other slot' }) : el('span', { class: 'pill ' + c, text: o.r.ok ? `${t} · ${o.p}%` : 'Not possible' })),
      el('span', { class: 'why sub', text: o.cat === 3 ? 'These days are already in another of your slots.' : o.r.why }),
      isCur ? el('span', { class: 'pill info', text: 'Current choice' }) : el('button', { class: 'btn' + (o.cat === 0 ? ' pri' : ''), type: 'button', text: `Use for slot ${n}`, disabled: !open || o.cat === 3, onclick: () => saveSlot(n, o.x) }));
  }) : [el('p', { class: 'sub', style: 'padding:10px', text: 'No conflict-free blocks start in this month. Untick the filter to see the others.' })]));
}
async function saveSlot(n, start) {
  const prev = SLOTS.find(x => x.name === ME.name && x.slot === n) || null;
  if (prev && prev.start === start) return;
  if (prev && prev.start && start && !confirm(`Replace slot ${n} (${blockLabel(prev.start)}) with ${blockLabel(start)}? The slot gets a new timestamp, so it joins the queue from now.`)) return;
  if (!start && !confirm(`Withdraw slot ${n} (${blockLabel(prev.start)})? You lose its place in the queue.`)) return;
  try { await B.saveSlot({ no: ME.no, name: ME.name }, n, start, prev); toast(start ? `Slot ${n} saved: ${blockLabel(start)}. Time-stamped now.` : `Slot ${n} withdrawn.`); const next = [1, 2, 3, 4].find(k => k !== n && !SLOTS.find(x => x.name === ME.name && x.slot === k && x.start)); if (start && next) VIEW.target = next; render(); }
  catch (e) { toast('Not saved: ' + errText(e)); }
}
function renderCal(A) {
  const mine = new Set(); if (ME) A.order.filter(r => r.ok && r.name === ME.name).forEach(r => { for (let k = 0; k < 4; k++) mine.add(idx(r.start) + k); });
  $('cal').replaceChildren(...MN.map((m, mi) => {
    const a = MS[mi], b = MS[mi + 1], cells = []; for (let k = 0; k < dd(a).getUTCDay(); k++) cells.push(el('span', {}));
    for (let d = a; d < b; d++) { const c = A.off[d].length; cells.push(el('span', { class: 'cald' + (c ? ' l' + Math.min(3, c) : '') + (mine.has(d) ? ' me' : ''), text: d - a + 1, title: `${fmt(d)}: ${c ? A.off[d].map(x => x.name).join(', ') : 'nobody'} on leave` })); }
    return el('div', { class: 'calm' }, el('div', { class: 'sub', style: 'font-weight:600', text: m }), el('div', { class: 'calg' }, ...['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => el('span', { class: 'cald sub', text: x })), ...cells));
  }));
}
const RES_HEAD = ['Queue', 'Name', 'Group', 'Role', 'Slot', 'Leave block', 'Time-stamped (Dubai)', 'Status', 'Reason'];
const resRow = r => { const s = BY[r.name]; return [r.queue, r.name, s.grp, RS[s.pos], r.slot, blockLabel(r.start), when(r.ts), status(r), r.why]; };
function renderResults(A) {
  $('res-sub').textContent = `Group ${CONF.prio} first, then Group ${other(CONF.prio)}; within a group, first come first served. Overlaps used: Group ${CONF.prio} ${A.used[CONF.prio]} of ${CONF.budgetP} · Group ${other(CONF.prio)} ${A.used[other(CONF.prio)]} of ${CONF.budgetO}.`;
  $('results').replaceChildren(el('thead', {}, el('tr', {}, ...RES_HEAD.map(h => el('th', { text: h })))),
    el('tbody', {}, ...(A.order.length ? A.order.map(r => { const s = BY[r.name]; return el('tr', { class: ME && r.name === ME.name ? 'meRow' : '' }, el('td', { class: 'mono', text: r.queue }), el('td', { text: r.name }), el('td', {}, el('span', { class: 'chip ' + s.grp, text: s.grp })), el('td', { text: RS[s.pos] }), el('td', { class: 'mono', text: r.slot }), el('td', { class: 'mono', text: blockLabel(r.start) }), el('td', { class: 'mono', text: when(r.ts) }), el('td', {}, el('span', { class: 'pill ' + (r.ok ? (r.overlap ? 'warn' : 'ok') : 'bad'), text: status(r) })), el('td', { class: 'sub', text: r.why })); }) : [el('tr', {}, el('td', { colspan: 9, class: 'sub', text: 'No bids yet.' }))])));
}
const AUD_HEAD = ['When (Dubai)', 'Staff no.', 'Name', 'Action', 'Slot', 'Previous block', 'New block', 'Detail'];
const audRow = a => [when(a.at), a.no, a.name, a.action, a.slot ?? '', a.prev ? blockLabel(a.prev) : '', a.next ? blockLabel(a.next) : '', a.detail || ''];
const audTable = list => [el('thead', {}, el('tr', {}, ...AUD_HEAD.map(h => el('th', { text: h })))), el('tbody', {}, ...(list.length ? list.map(a => el('tr', {}, ...audRow(a).map((v, i) => el('td', { class: [0, 1, 4, 5, 6].includes(i) ? 'mono' : '', text: v })))) : [el('tr', {}, el('td', { colspan: 8, class: 'sub', text: 'Nothing recorded yet.' }))]))];
function renderMyAudit() { if (!ME) { $('myaudit-card').hidden = true; return; } $('myaudit-card').hidden = false; $('myaudit').replaceChildren(...audTable(AUDIT.filter(a => a.no === ME.no))); }
function rulesList() {
  const P = CONF.prio, O = other(P), key = (CONF.key || []).join(' or ');
  return [
    'Leave blocks. You can bid for up to 4 blocks of 4 consecutive days of annual leave in 2027. Choose the first day of each block; the block runs for 4 days from that date.',
    `Priority order. First by group: Group ${P} has leave priority in 2027, so every Group ${P} request is considered before any Group ${O} request. Second, within each group: first come, first served, by the time each slot was saved.`,
    'Each slot has its own timestamp, set by the server when you save it. Changing or withdrawing a slot gives up its old time; the new choice joins the queue from the moment you save it. Slots you leave alone keep their time.',
    `Coverage limits. A block is refused if, on any of its 4 days, it would put more than ${CONF.maxTotal} Sharjah staff on leave, more than ${CONF.leadCap} Shift Lead or Controller (Pre-Ops) on leave, or more than ${CONF.hubCap} Hub & Station Coordinators on leave (only ${CONF.hubKeyCap} while ${key} is on leave).`,
    `Overlaps. A block that overlaps leave already approved for someone else uses one of your group's overlaps: ${CONF.budgetP} for Group ${P} and ${CONF.budgetO} for Group ${O} for the whole year, in queue order. Once a group has used them all, its overlapping blocks are refused.`,
    `Live chance. Each block shows its chance of approval right now. Results are provisional until bidding closes: because Group ${P} comes first, a Group ${P} request made later can still take a block provisionally approved for Group ${O}.`,
    'Refused blocks show the reason. Choose another block for that slot; it is time-stamped when you save it.',
    `Your own login. Sign in with your staff number. On first sign-in you must choose your own password before you can bid, so nobody else can bid on your behalf. Nobody, including the manager, can place or change a bid for someone else. Every sign-in, password change and slot change is recorded with its date and time in an audit log that cannot be edited or deleted.`,
    'Final plan. After bidding closes, management confirms the plan. Scheduled training and operational needs take precedence; if an approved block clashes, you will be contacted to agree an alternative.',
  ];
}
function renderRules() { $('rules').replaceChildren(...rulesList().map(t => el('li', { text: t }))); }

// ---------- manager controls
let XLSXP = null;
function loadXLSX() { if (window.XLSX) return Promise.resolve(); if (XLSXP) return XLSXP; XLSXP = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the Excel library.')); document.head.append(s); }); return XLSXP; }
async function download(name, sheets) { await loadXLSX(); const wb = XLSX.utils.book_new(); sheets.forEach(([n, aoa]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n)); XLSX.writeFile(wb, name); }
function renderAdmin(A) {
  if (!ADMIN) { $('admin').hidden = true; return; } $('admin').hidden = false;
  const ae = document.activeElement; const busy = ae && ae.matches('input,select') && ($('adm-set').contains(ae) || $('adm-staff').contains(ae) || $('adm-staff-add').contains(ae) || $('adm-staff-pw').contains(ae));
  if (!busy) renderAdminForms(A);
  renderAudit(A);
}
async function saveList(list, what) {
  try { await B.set('config/staff', { list: list.map(({ name, pos, grp }) => ({ name, pos, grp })) }); await B.audit(who(), { action: 'Staff list changed', detail: what }); toast('Saved: ' + what); }
  catch (e) { toast('Not saved: ' + errText(e)); }
}
function renderAdminForms(A) {
  const me = who(); const c = { ...CONF };
  const num = (lab, k, min, max) => { const i = el('input', { type: 'number', min, max, value: c[k], 'aria-label': lab, style: 'width:70px' }); i.onchange = () => c[k] = Math.max(min, Math.min(max, +i.value || 0)); return el('label', { class: 'lbl' }, lab, i); };
  const openSel = el('select', { 'aria-label': 'Bidding open' }, el('option', { value: '1', text: 'Open' }), el('option', { value: '0', text: 'Closed' })); openSel.value = c.open ? '1' : '0'; openSel.onchange = () => c.open = openSel.value === '1';
  const pad = n => String(n).padStart(2, '0'); const lv = ms => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const close = el('input', { type: 'datetime-local', value: lv(c.closeAt), 'aria-label': 'Closing date and time' }); close.onchange = () => c.closeAt = close.value ? new Date(close.value).getTime() : null;
  const prio = el('select', { 'aria-label': 'Priority group' }, el('option', { value: 'A', text: 'Group A' }), el('option', { value: 'B', text: 'Group B' })); prio.value = c.prio; prio.onchange = () => c.prio = prio.value;
  const keySel = el('select', { multiple: true, size: 4, 'aria-label': 'Key people' }, ...STAFF.filter(s => isLead(s.pos)).map(s => { const o = el('option', { value: s.name, text: s.name }); o.selected = (c.key || []).includes(s.name); return o; })); keySel.onchange = () => c.key = [...keySel.selectedOptions].map(o => o.value);
  const save = el('button', { class: 'btn pri', type: 'button', text: 'Save settings', onclick: async () => {
    const out = { open: !!c.open, closeAt: B.stamp(c.closeAt || null), prio: c.prio, maxTotal: c.maxTotal, leadCap: c.leadCap, hubCap: c.hubCap, hubKeyCap: c.hubKeyCap, key: c.key || [], budgetP: c.budgetP, budgetO: c.budgetO };
    try { await B.set('config/settings', out); await B.audit(me, { action: 'Settings changed', detail: JSON.stringify({ ...out, closeAt: c.closeAt ? when(c.closeAt) : null }) }); toast('Settings saved.'); } catch (e) { toast('Not saved: ' + errText(e)); } } });
  $('adm-set').replaceChildren(el('div', { class: 'row' }, el('label', { class: 'lbl' }, 'Bidding', openSel), el('label', { class: 'lbl' }, 'Closes (optional)', close), el('label', { class: 'lbl' }, 'Priority group', prio)),
    el('div', { class: 'row' }, num('Max on leave a day', 'maxTotal', 1, 8), num('Leads/Controllers at once', 'leadCap', 1, 4), num('Coordinators at once', 'hubCap', 1, 4), num('…while a key person is off', 'hubKeyCap', 0, 4), num('Overlaps, priority group', 'budgetP', 0, 40), num('Overlaps, other group', 'budgetO', 0, 40)),
    el('div', { class: 'row' }, el('label', { class: 'lbl' }, 'Key people (Coordinator rule)', keySel), save));
  // staff logins
  const noOf = {}; STAFFMAP.forEach(x => noOf[x.name] = x.id);
  const lastSeen = {}; AUDIT.forEach(a => { if (a.action === 'Signed in' && !lastSeen[a.no]) lastSeen[a.no] = a.at; });
  const create = async (s, v) => {
    if (!/^[0-9a-z]{3,20}$/i.test(v)) { toast('Enter the staff number (letters/digits only).'); return false; }
    const taken = STAFFMAP.find(x => x.id === v && x.name !== s.name); if (taken) { toast(`${v} is already ${taken.name}'s login.`); return false; }
    try { if (noOf[s.name] && noOf[s.name] !== v) await B.del('staff/' + noOf[s.name]); const created = await B.createLogin(v, s.name); await B.audit(me, { action: created ? 'Login created' : 'Login linked', detail: `${s.name}: staff no. ${v}` }); return true; }
    catch (e) { toast(`${s.name}: ${errText(e)}`); return false; }
  };
  const inputs = {};
  const rows = STAFF.map(s => {
    const cur = noOf[s.name] || ''; const inp = el('input', { type: 'text', value: cur, placeholder: 'staff no.', 'aria-label': 'Staff number for ' + s.name, style: 'width:110px' }); inputs[s.name] = inp;
    const pw = cur ? (PWMAP[cur] && PWMAP[cur].changed ? el('span', { class: 'pill ok', text: 'Changed ' + when(PWMAP[cur].at) }) : el('span', { class: 'pill warn', text: 'Still ' + DEFAULT_PASSWORD })) : el('span', { class: 'sub', text: '—' });
    const btn = el('button', { class: 'btn', type: 'button', text: cur ? 'Update' : 'Create login', onclick: async () => { if (await create(s, inp.value.trim())) toast(`${s.name} can sign in with staff no. ${inp.value.trim()} and ${DEFAULT_PASSWORD}.`); } });
    const roleSel = el('select', { 'aria-label': 'Role of ' + s.name }, ...Object.entries(RS).map(([k, v]) => el('option', { value: k, text: v }))); roleSel.value = s.pos; roleSel.onchange = () => saveList(STAFF.map(x => x.name === s.name ? { ...x, pos: roleSel.value } : x), `${s.name} role → ${RS[roleSel.value]}`);
    const grpSel = el('select', { 'aria-label': 'Group of ' + s.name }, el('option', { value: 'A', text: 'A' }), el('option', { value: 'B', text: 'B' })); grpSel.value = s.grp; grpSel.onchange = () => saveList(STAFF.map(x => x.name === s.name ? { ...x, grp: grpSel.value } : x), `${s.name} group → ${grpSel.value}`);
    const rm = el('button', { class: 'btn', type: 'button', text: 'Remove', onclick: () => { if (confirm(`Remove ${s.name} from the bidding list? Their bids stay in the records but no longer count.`)) saveList(STAFF.filter(x => x.name !== s.name), `${s.name} removed`); } });
    return el('tr', {}, el('td', { text: s.name }), el('td', {}, roleSel), el('td', {}, grpSel), el('td', {}, inp), el('td', {}, btn), el('td', {}, pw), el('td', { class: 'mono', text: cur && lastSeen[cur] ? when(lastSeen[cur]) : '—' }), el('td', { class: 'mono', text: SLOTS.filter(x => x.name === s.name && x.start).length }), el('td', {}, rm));
  });
  const nn = el('input', { type: 'text', placeholder: 'Full name', 'aria-label': 'New person name', style: 'width:220px' });
  const np = el('select', { 'aria-label': 'New person role' }, ...Object.entries(RS).map(([k, v]) => el('option', { value: k, text: v })));
  const ng = el('select', { 'aria-label': 'New person group' }, el('option', { value: 'A', text: 'Group A' }), el('option', { value: 'B', text: 'Group B' }));
  const add = el('button', { class: 'btn', type: 'button', text: 'Add person', onclick: () => { const n = nn.value.trim(); if (!n) return; if (BY[n]) { toast(`${n} is already on the list.`); return; } saveList(STAFF.concat([{ name: n, pos: np.value, grp: ng.value }]), `${n} added (${RS[np.value]}, Group ${ng.value})`); } });
  const all = el('button', { class: 'btn pri', type: 'button', text: 'Create all missing logins', onclick: async () => { let n = 0; for (const s of STAFF) { const v = inputs[s.name].value.trim(); if (v && !noOf[s.name]) { if (await create(s, v)) n++; } } toast(`${n} login${n === 1 ? '' : 's'} created with password ${DEFAULT_PASSWORD}.`); } });
  const ipw = el('input', { type: 'text', value: DEFAULT_PASSWORD, 'aria-label': 'First-login password for new logins', style: 'width:140px' });
  const ipwSave = el('button', { class: 'btn', type: 'button', text: 'Save', onclick: async () => { const v = ipw.value.trim(); if (v.length < 6) { toast('Use at least 6 characters.'); return; } try { await B.set('config/initial', { password: v }); DEFAULT_PASSWORD = v; await B.audit(me, { action: 'First-login password changed', detail: 'for new logins' }); toast('First-login password saved.'); render(); } catch (e) { toast('Not saved: ' + errText(e)); } } });
  $('adm-staff-pw').replaceChildren(el('b', { text: 'First-login password for new logins' }), ipw, ipwSave, el('span', { class: 'sub', text: 'Kept in Firebase, not in the public code. Tell staff in person or by email.' }));
  $('adm-staff-add').replaceChildren(el('b', { text: 'Add a person' }), nn, np, ng, add);
  $('adm-staff-bar').replaceChildren(all, el('span', { class: 'sub', text: `New logins use password ${DEFAULT_PASSWORD}; each person must change it at first sign-in. To reset a forgotten password: delete the user in Firebase console > Authentication, then press "Update" here to recreate it with ${DEFAULT_PASSWORD}.` }));
  $('adm-staff').replaceChildren(el('thead', {}, el('tr', {}, ...['Name', 'Role', 'Group', 'Staff no. (login)', '', 'Password', 'Last sign-in', 'Slots', ''].map(h => el('th', { text: h })))), el('tbody', {}, ...rows));
  $('adm-dl').onclick = () => download('IOCC_Sharjah_Leave_Bids_2027.xlsx', [['Results', [RES_HEAD, ...allocate(SLOTS).order.map(resRow)]], ['Audit log', [AUD_HEAD, ...AUDIT.slice().reverse().map(audRow)]], ['Rules', rulesList().map((t, i) => [`${i + 1}. ${t}`])]]).catch(e => toast(e.message));
}
function renderAudit() {
  const f = $('adm-filter'); if (!f.options.length) { f.append(el('option', { value: '', text: 'Everyone' }), ...STAFF.map(s => el('option', { value: s.name, text: s.name })), el('option', { value: 'Manager', text: 'Manager' })); f.onchange = () => renderAudit(); }
  const list = AUDIT.filter(a => !f.value || a.name === f.value);
  $('adm-audit').replaceChildren(...audTable(list.slice(0, 400)));
  $('adm-audit-n').textContent = `${list.length} entr${list.length === 1 ? 'y' : 'ies'}${list.length > 400 ? ' (latest 400 shown; download for all)' : ''}`;
}

// ---------- start
document.title = TITLE; $('title').textContent = TITLE;
(async () => {
  try { B = DEMO ? demoBackend() : await firebaseBackend(); }
  catch (e) { setSync('Could not load Firebase. Check your internet connection.', 'bad'); return; }
  if (DEMO) $('banner').hidden = false;
  renderRules();
  B.onAuth(onAuth);
})();
