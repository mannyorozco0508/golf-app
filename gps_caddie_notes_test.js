// ============================================================================
// URGENT-047 C: CADDIE NOTES PER HOLE (gps-stats.js HardPanGpsStats.caddie, the score sheet's Notes
// for the phone's own golfer; gps-view.js syncCaddieLine draws it on the GPS bar).
//
//   - kept by COURSE KEY + HOLE NUMBER, not by round: a note on Papago hole 3 is there on a new
//     round at Papago, on hole 3 only, and never at Dobson;
//   - on this phone only (localStorage hardpan_caddie_v1) - nothing here reaches Firebase;
//   - NO LOCATION: a note holds its text, when it was written, and (signed in) the account's uid;
//   - private to the account: another signed-in account on the same phone does not see it;
//   - one short line (140 characters, spaces folded); empty text removes it;
//   - the score sheet: Notes for the phone's own golfer = the caddie note; another golfer's Notes
//     (Track stats for others) = the round note, as before.
// Real Chrome: urgent047_caddie_notes_chrome_test.js.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-stats.js'));
const skip = ON ? false : 'Consumer tree: no GPS stats';

function sandbox(opts) {
    const o = opts || {};
    const store = o.ls || {};
    const localStorage = { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i], getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite };
    sb.window = sb;
    const calls = { db: 0, changed: 0 };
    let user = o.user === undefined ? null : o.user;
    // A Firebase that counts any database use - the notes must never touch it. The account comes from
    // the GPS screen (gps-view.js accountUid = bagUid: signed in, not anonymous).
    sb.firebase = { auth: () => ({ get currentUser() { return user; } }), database: () => { calls.db++; return { ref: () => { calls.db++; return {}; } }; } };
    sb.HardPanGps = { caddieChanged: () => { calls.changed++; }, courseKey: () => o.mounted || null, accountUid: () => (user && !user.isAnonymous && user.uid ? user.uid : null) };
    vm.createContext(sb);
    vm.runInContext(read('gps-stats.js'), sb);
    return { St: sb.HardPanGpsStats, C: sb.HardPanGpsStats.caddie, store, calls, setUser: (u) => { user = u; } };
}

test('a note is kept by course + hole, not by round: Papago hole 3 only, never Dobson', { skip }, () => {
    const { C, store, calls } = sandbox();
    assert.strictEqual(C.set('papago', 3, "don't go left"), "don't go left");
    assert.strictEqual(C.line('papago', 3), "don't go left");
    assert.strictEqual(C.line('papago', '3'), "don't go left", 'hole as a string too');
    assert.strictEqual(C.line('papago', 2), '');
    assert.strictEqual(C.line('papago', 4), '');
    assert.strictEqual(C.line('dobson_ranch', 3), '', 'not at Dobson');
    // A second phone session (a new round) reads the same store.
    const again = sandbox({ ls: store });
    assert.strictEqual(again.C.line('papago', 3), "don't go left", 'a new round at Papago: still there');
    assert.strictEqual(again.C.line('dobson_ranch', 3), '');
    assert.strictEqual(calls.changed, 1, 'the GPS bar was told');
    assert.strictEqual(calls.db, 0, 'nothing touched Firebase');
});

test('no location is stored: text, time, and (signed in) the uid - nothing else', { skip }, () => {
    const { C, store } = sandbox({ user: { uid: 'u-manny', isAnonymous: false } });
    C.set('papago', 3, "don't go left");
    C.set('papago', 7, 'club up, into the wind');
    const keys = Object.keys(store);
    assert.deepStrictEqual(keys, ['hardpan_caddie_v1'], 'one key on the phone');
    const rec = JSON.parse(store.hardpan_caddie_v1);
    assert.deepStrictEqual(Object.keys(rec).sort(), ['notes', 'v']);
    assert.deepStrictEqual(Object.keys(rec.notes), ['papago']);
    Object.values(rec.notes.papago).forEach((n) => assert.deepStrictEqual(Object.keys(n).sort(), ['at', 't', 'uid']));
    const raw = store.hardpan_caddie_v1;
    assert.ok(!/lat|lng|lon|coord|accuracy|"pt"|position|geo/i.test(raw), 'no location words: ' + raw);
    assert.ok(!/-?\d{1,3}\.\d{4,}/.test(raw), 'no coordinate-looking numbers: ' + raw);
});

test('one short line: spaces folded, 140 characters at most; empty removes it (and an empty course goes)', { skip }, () => {
    const { C, store } = sandbox();
    assert.strictEqual(C.set('papago', 3, '  don\'t   go\n left  '), "don't go left");
    const long = 'x'.repeat(300);
    assert.strictEqual(C.set('papago', 5, long).length, 140);
    assert.strictEqual(C.max, 140);
    C.set('papago', 5, '   ');
    assert.strictEqual(C.line('papago', 5), '');
    C.set('papago', 3, '');
    assert.deepStrictEqual(JSON.parse(store.hardpan_caddie_v1).notes, {}, 'nothing left for Papago');
    assert.strictEqual(C.set('', 3, 'x'), '', 'no course: nothing saved');
    assert.strictEqual(C.set('papago', 0, 'x'), '', 'no hole: nothing saved');
    assert.strictEqual(C.line(null, 3), '');
});

test('private to the account: another signed-in account on this phone does not see it; signed out still does', { skip }, () => {
    const s = sandbox({ user: { uid: 'u-manny', isAnonymous: false } });
    s.C.set('papago', 3, "don't go left");
    assert.strictEqual(s.C.line('papago', 3), "don't go left");
    s.setUser({ uid: 'u-other', isAnonymous: false });
    assert.strictEqual(s.C.line('papago', 3), '', 'another account');
    s.setUser({ uid: 'anon-1', isAnonymous: true });
    assert.strictEqual(s.C.line('papago', 3), "don't go left", 'an anonymous session on his phone (not another account)');
    s.setUser(null);
    assert.strictEqual(s.C.line('papago', 3), "don't go left", 'signed out / not loaded yet: his phone');
    // Saved signed out: no uid on it - any session on this phone.
    const t = sandbox();
    t.C.set('papago', 4, 'aim at the bunker');
    assert.ok(!('uid' in JSON.parse(t.store.hardpan_caddie_v1).notes.papago['4']));
});

test('the code: the caddie store reads/writes localStorage only - no db / ref / fetch / navigator.geolocation in it', { skip }, () => {
    const src = read('gps-stats.js');
    const a = src.indexOf('URGENT-047 C: CADDIE NOTES PER HOLE'), b = src.indexOf('function setTrackOthers');
    assert.ok(a > 0 && b > a, 'the caddie section');
    const sec = src.slice(a, b);
    assert.ok(!/\.ref\(|database\(|fetch\(|XMLHttpRequest|geolocation|\.set\(\s*['"]events/.test(sec), 'no Firebase / network / location in the caddie code');
    assert.ok(/hardpan_caddie_v1/.test(sec));
});

// ---- THE SCORE SHEET, in a tiny DOM ------------------------------------------------------------
function matches(n, sel) {
    return String(sel).split(',').some((s) => { s = s.trim(); const a = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(s); if (a) return a[1] in n.attrs && (a[2] == null || n.attrs[a[1]] === a[2]);
        if (s[0] === '.') return s.slice(1).split('.').every((c) => n.classList.contains(c)); return n.tagName === s.toUpperCase(); });
}
function el(tag) {
    const e = { tagName: String(tag).toUpperCase(), children: [], attrs: {}, style: {}, parentNode: null, _text: '', value: '',
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c, on) { if (on === undefined) on = !this._s.has(c); if (on) this._s.add(c); else this._s.delete(c); return on; } },
        set className(v) { this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); }, get className() { return [...this.classList._s].join(' '); },
        set textContent(v) { this._text = String(v); this.children = []; }, get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
        appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = e; e.children.push(c); return c; },
        insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = e; const i = e.children.indexOf(ref); if (i < 0) e.children.push(c); else e.children.splice(i, 0, c); return c; },
        removeChild(c) { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); c.parentNode = null; return c; },
        setAttribute(k, v) { e.attrs[k] = String(v); }, getAttribute(k) { return k in e.attrs ? e.attrs[k] : null }, removeAttribute(k) { delete e.attrs[k]; },
        addEventListener(t, f) { (e._ls = e._ls || {})[t] = f; },
        querySelector(sel) { return e.querySelectorAll(sel)[0] || null; },
        querySelectorAll(sel) { const out = []; const walk = (n) => n.children.forEach((c) => { if (matches(c, sel)) out.push(c); walk(c); }); walk(e); return out; },
        closest(sel) { let n = e; while (n) { if (matches(n, sel)) return n; n = n.parentNode; } return null; },
        contains(x) { let n = x; while (n) { if (n === e) return true; n = n.parentNode; } return false; },
        scrollIntoView() {}, focus() {}, scrollTop: 0, scrollHeight: 0, disabled: false };
    return e;
}

test('the score sheet: Notes for the phone\'s own golfer is the caddie note for this course\'s hole; another golfer\'s is the round note', { skip }, () => {
    const store = {};
    const localStorage = { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i], getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const body = el('body');
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite, document: { body, createElement: el } };
    sb.window = sb;
    sb.HardPanGps = { courseKey: () => 'papago', caddieChanged: () => {} };
    sb.HardPanFeature = () => true;
    vm.createContext(sb);
    vm.runInContext(read('gps-stats.js'), sb);
    const St = sb.HardPanGpsStats;
    localStorage.setItem('hardpan_stats_others', '1');   // Track stats for others: so Bravo has Notes too
    const ctx = { code: 'TC047A', course: 'Papago Golf Club', hole: 3, par: 4, golfers: [{ id: '101', name: 'Manny' }, { id: '102', name: 'Bravo' }],
        pick: '101', own: '101', stats: true, score: () => 0, save: () => {}, host: body };
    assert.ok(St.sheet.open(ctx));
    const w = body.querySelector('.hp-ss').parentNode;
    const click = (t) => w._ls.click({ target: t });
    const type = (t, v) => { t.value = v; w._ls.input({ target: t }); };
    click(w.querySelector('[data-ss-notes]'));
    let ta = w.querySelector('.hp-ss-notes');
    assert.ok(ta, 'Notes opened a box');
    assert.strictEqual(ta.getAttribute('data-ss-caddie'), 'papago', 'own golfer: the caddie note for Papago');
    assert.ok(/Caddie note/.test(w.querySelector('.hp-ss-body').textContent), 'titled Caddie note');
    assert.ok(/every time you play here\. Only on this phone\./.test(w.querySelector('.hp-ss-body').textContent));
    type(ta, "don't go left");
    assert.strictEqual(St.caddie.line('papago', 3), "don't go left");
    assert.strictEqual(St.quick.hole('TC047A', '101', 3, 0, 4).note, '', 'not a round note');
    // Bravo (another golfer, Track stats for others): the round note, as before.
    click(w.querySelector('[data-ss-golfer="102"]'));
    click(w.querySelector('[data-ss-notes]'));
    ta = w.querySelector('.hp-ss-notes');
    assert.strictEqual(ta.getAttribute('data-ss-caddie'), null, 'another golfer: no caddie note');
    type(ta, 'Bravo three-putted');
    assert.strictEqual(St.quick.hole('TC047A', '102', 3, 0, 4).note, 'Bravo three-putted');
    assert.strictEqual(St.caddie.line('papago', 3), "don't go left", 'the caddie note untouched');
    // Reopened on a new round at Papago, hole 3: the box holds the note.
    St.sheet.close();
    assert.ok(St.sheet.open(Object.assign({}, ctx, { code: 'TC047B' })));
    click(w.querySelector('[data-ss-notes]'));
    assert.strictEqual(w.querySelector('.hp-ss-notes').value, "don't go left");
});

test('the wiring: the GPS bar line is drawn only while the hole has a note, only from the phone, in layouts D and C', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/function syncCaddieLine\(\)/.test(v));
    assert.ok(/caddieChanged: function \(\)/.test(v), 'gps-stats tells the bar');
    assert.ok(/accountUid: function \(\) \{ return bagUid\(\); \}/.test(v), 'the account from the GPS screen');
    assert.ok(/if \(!t\) \{ if \(e && e\.parentNode\) e\.parentNode\.removeChild\(e\); return; \}/.test(v), 'no note - no element (URGENT-030\'s bar children unchanged)');
    const a = v.indexOf('function caddieNow'), b = v.indexOf('function syncCourseLine');
    assert.ok(!/\.ref\(|fetch\(|geolocation/.test(v.slice(a, b)), 'the line reads the phone only');
    // Nothing new in the shell lists: the notes live in gps-stats.js (already shipped).
    assert.ok(!fs.readdirSync(__dirname).some((f) => /^gps-caddie/.test(f)), 'no new shell file');
});
