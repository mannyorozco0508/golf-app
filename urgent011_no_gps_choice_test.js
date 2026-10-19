// ============================================================================
// URGENT-011 (sims bug 6, LOW): "Play without GPS (scorecard)" FROM THE GPS
// DOOR OPENS THE SCORECARD AFTER START SCORING, AND IS REMEMBERED.
//
// Measured by the nightly sims: the GPS door's "Play without GPS (scorecard)"
// went to Round Setup (admin.html?start=quick) carrying only the quick-start
// marker - the "📍 GPS round / Start GPS on hole 1" box - and nothing said
// "the Card" for the round, so START SCORING landed on the GPS screen
// (gps-view.js land(): front door 'gps', no stored side -> GPS).
//
// NOW: the marker says nogps; Round Setup (front-door.js quickGps) records
// hardpan_round_side = 'bets|<code>' for the minted round - the per-round
// memory gps-view.js reads - shows no GPS box, and spends the marker.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { REPO_ROOT } = require('./helpers/load-script.js');
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const GPS = fs.existsSync(path.join(REPO_ROOT, 'gps-view.js')) && fs.existsSync(path.join(REPO_ROOT, 'front-door.js'));
const GPS_ONLY = GPS ? {} : { skip: 'Consumer tree: GPS-only (front-door.js, gps-view.js)' };
const tick = () => new Promise((r) => setTimeout(r, 5));

function memStore(mem) {
    return {
        getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
        setItem: (k, v) => { mem.set(String(k), String(v)); },
        removeItem: (k) => { mem.delete(String(k)); },
        key: (i) => [...mem.keys()][i], get length() { return mem.size; }
    };
}
function el(id) {
    return { id, innerHTML: '', value: '', style: {}, classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
        addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, insertBefore() {}, appendChild() {}, parentNode: null, firstChild: null };
}
function page(pathname, search, local, session) {
    const made = [], clicks = [];
    const ids = new Map();
    const doc = {
        readyState: 'complete', referrer: '', visibilityState: 'visible', documentElement: { style: {} }, head: { appendChild() {} }, body: el('body'),
        getElementById(id) { if (!['lobby-screen', 'admin-screen', 'hp-resume', 'hp-resume-round', 'hp-draft-m', 'hp-setup'].includes(id)) return ids.get(id) || null; if (!ids.has(id)) ids.set(id, el(id)); return ids.get(id); },
        createElement() { const e = el(''); made.push(e); return e; },
        querySelector() { return null; }, querySelectorAll() { return []; },
        addEventListener(t, f) { if (t === 'click') clicks.push(f); }
    };
    const loc = { pathname, search, hash: '', _href: null };
    Object.defineProperty(loc, 'href', { get() { return 'file://' + pathname + search; }, set(v) { loc._href = v; } });
    loc.replace = (v) => { loc._href = v; };
    const sb = {
        localStorage: memStore(local), sessionStorage: memStore(session), navigator: { onLine: true },
        setTimeout, clearTimeout, setInterval() { return 0; }, clearInterval() {},
        console, JSON, Math, Date, Object, Array, Promise, URLSearchParams, Event: function (t) { this.type = t; },
        location: loc, history: { replaceState() {}, pushState() {}, back() {}, state: null },
        addEventListener() {}, dispatchEvent() {}, CustomEvent: function () {},
        __hardpanDoors: true, document: doc
    };
    sb.window = sb;
    vm.createContext(sb);
    ['offline-queue.js', 'front-door.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    return { sb, loc, made, clicks };
}
const tap = (p, attr, val) => p.clicks.forEach((f) => f({ target: { closest: (sel) => (sel === '[' + attr + ']' ? { getAttribute: () => val } : null) } }));

describe('URGENT-011 bug 6: "Play without GPS (scorecard)" opens the card and is remembered', GPS_ONLY, () => {
    test('the GPS door\'s "Play without GPS" (no card fetched) goes to Round Setup marked nogps', () => {
        const local = new Map([['hardpan_front_door', 'gps']]), session = new Map();
        const h = page('/home.html', '', local, session);
        h.sb.HardPanHome.start(null);
        tap(h, 'data-hp-su', 'nogps');
        assert.equal(h.loc._href, 'admin.html?start=quick');
        const q = JSON.parse(session.get('hardpan_quick_gps'));
        assert.equal(q.nogps, true);
    });

    test('Round Setup for the minted round: the Card side is stored for THAT round, no GPS box, the marker spent', async () => {
        const local = new Map([['hardpan_front_door', 'gps'], ['hardpan_round_side', 'gps|OLD111']]);
        const session = new Map([['hardpan_quick_gps', JSON.stringify({ key: null, name: 'Dobson Ranch', auto: false, nogps: true })]]);
        const a = page('/admin.html', '?game=ABC123&eventType=quick', local, session);
        await tick();
        assert.equal(local.get('hardpan_round_side'), 'bets|ABC123', 'START SCORING opens on the Card for this round');
        assert.equal(session.has('hardpan_quick_gps'), false, 'spent: a later Round Setup page is not a quick start');
        assert.equal(a.made.filter((e) => e.id === 'fd-quick').length, 0, 'no "Start GPS on hole 1" box');
    });

    test('a GPS quick start (no nogps) still gets its GPS box and stores no Card side', async () => {
        const local = new Map([['hardpan_front_door', 'gps']]);
        const session = new Map([['hardpan_quick_gps', JSON.stringify({ key: null, name: 'Dobson Ranch', auto: false })]]);
        const a = page('/admin.html', '?game=ABC123&eventType=quick', local, session);
        await tick();
        assert.equal(a.made.filter((e) => e.id === 'fd-quick').length, 1);
        assert.equal(local.has('hardpan_round_side'), false);
    });

    test('gps-view.js lands on the Card for a round stored as bets|<code> (the memory this writes)', () => {
        const gv = read('gps-view.js');
        const land = gv.slice(gv.indexOf('function land() {'), gv.indexOf('function land() {') + 1400);
        assert.ok(/if \(storedSide\(\) === 'bets'\) return;/.test(land));
        assert.ok(/var v = String\(localStorage\.getItem\(SIDE_KEY\) \|\| ''\), m = \/\^\(gps\|bets\)\(\?:\\\|\(\.\*\)\)\?\$\//.test(gv), 'per round: bets|CODE');
    });
});
