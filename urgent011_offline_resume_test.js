// ============================================================================
// URGENT-011 (sims bug 2, HIGH): WITH NO SIGNAL, HOME SHOWS "Resume" FOR THE
// ROUND IN PROGRESS.
//
// Measured by the nightly sims (seeds 55688190, 84157995, 88411480, 65911228):
// the app killed (or Back to Home) mid-round with airplane mode on, Home showed
// no Resume. front-door.js mainDecor painted the tile only after a read of
// events/<code> answered - with no signal it never does (6 s timeout, then
// nothing) - though hardpan_last_round and the round's own copy
// (golfapp_snap_v1_<code>) were on the phone all along.
//
// NOW: Resume is painted AT ONCE from the phone's copy (with its unsent scores
// on top); the server read only refreshes it, and removes it only when the
// server positively says the round is gone (null) or finished. No answer, or
// an error, leaves it standing.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { REPO_ROOT } = require('./helpers/load-script.js');
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
// GPS-ONLY BY DESIGN: front-door.js / home.html are GPS files; a Consumer tree
// (tools/gps-flag-tree.js) does not ship them, so these cases skip there.
const GPS = fs.existsSync(path.join(REPO_ROOT, 'gps-view.js')) && fs.existsSync(path.join(REPO_ROOT, 'front-door.js'));
const GPS_ONLY = GPS ? {} : { skip: 'Consumer tree: GPS-only (front-door.js)' };
const tick = () => new Promise((r) => setImmediate(r));

function memStore(mem) {
    return {
        getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
        setItem: (k, v) => { mem.set(String(k), String(v)); },
        removeItem: (k) => { mem.delete(String(k)); },
        key: (i) => [...mem.keys()][i],
        get length() { return mem.size; }
    };
}
// Just enough document for mainDecor: elements by id, created on first ask.
function fakeDoc() {
    const els = new Map();
    const el = (id) => ({ id, innerHTML: '', style: {}, classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
        addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, parentNode: null });
    return {
        els,
        getElementById(id) { if (id !== 'hp-resume' && id !== 'hp-resume-round' && id !== 'hp-draft-m') return null; if (!els.has(id)) els.set(id, el(id)); return els.get(id); },
        querySelector() { return null; }, querySelectorAll() { return []; },
        addEventListener() {}, createElement() { return el(''); }, visibilityState: 'visible',
        head: { appendChild() {} }
    };
}
// fast: the page's own 6 s read timeout runs in 6 ms here
function home(mem, o) {
    const doc = fakeDoc();
    const sb = {
        localStorage: memStore(mem), sessionStorage: memStore(new Map()),
        navigator: { onLine: !(o && o.offline) },
        setTimeout: (f, ms) => setTimeout(f, Math.min(ms || 0, 6000) / 1000), clearTimeout, setInterval() { return 0; }, clearInterval() {},
        console, JSON, Math, Date, Object, Array, Promise, URLSearchParams,
        location: { search: '', hash: '', pathname: '/home.html', href: 'file:///home.html' },
        history: { replaceState() {} },
        addEventListener() {}, dispatchEvent() {}, CustomEvent: function () {},
        document: doc
    };
    sb.window = sb;
    vm.createContext(sb);
    ['offline-queue.js', 'front-door.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    sb.HardPanHome.start(o && 'db' in o ? o.db : null);
    return { sb, tile: () => (doc.els.get('hp-resume-round') || {}).innerHTML || '' };
}
// A database whose read of the round answers `val` (undefined: never answers - no signal).
function db(val, o) {
    return { ref() { return {
        on() {}, off() {},
        once() { if (o && o.fail) return Promise.reject(new Error('permission')); return val === undefined ? new Promise(() => {}) : Promise.resolve({ val: () => val, exists: () => val != null }); },
        set() { return new Promise(() => {}); }, update() { return new Promise(() => {}); }
    }; } };
}
const ROUND = (scored) => {
    const sc = {};
    (scored || []).forEach((h) => { sc['p1_h' + h] = 4; sc['p2_h' + h] = 5; });
    return { courseName: 'Dobson Ranch Golf Course (Mesa)', gameFormat: 'stroke',
        courseData: [1, 2, 3].map((h) => ({ hole: h, par: 4, hcpIndex: h })),
        players: [{ id: 1, name: 'Manny' }, { id: 2, name: 'Joe' }], scores: sc };
};
function phone(o) {
    const mem = new Map();
    mem.set('hardpan_last_round', JSON.stringify({ code: 'ABC123', at: Date.now() - 60000, course: 'Dobson Ranch Golf Course', group: 1 }));
    if (!(o && o.noCopy)) mem.set('golfapp_snap_v1_ABC123', JSON.stringify({ at: Date.now(), data: ROUND(o && o.scored || [1]), meta: { group: 1 } }));
    return mem;
}

describe('URGENT-011 bug 2: Home offers Resume from the phone with no signal', GPS_ONLY, () => {
    test('no signal (the read never answers): Resume is there at once, and still there after the read gives up', async () => {
        const mem = phone();
        const h = home(mem, { offline: true, db: db(undefined) });
        assert.match(h.tile(), /class="hp-resume" data-hp-open="ABC123"/, 'painted before any answer');
        assert.match(h.tile(), /Resume Dobson Ranch Golf Course · thru 1</);
        await new Promise((r) => setTimeout(r, 30)); await tick();
        assert.match(h.tile(), /Resume Dobson Ranch/, 'the 6 s timeout does not take it away');
        assert.ok(mem.get('hardpan_last_round'), 'the pointer is kept');
        assert.ok(mem.get('golfapp_snap_v1_ABC123'), 'the copy is kept');
    });

    test('no database at all (the SDK never came up): Resume from the phone still shows', () => {
        const h = home(phone(), { offline: true, db: null });
        assert.match(h.tile(), /Resume Dobson Ranch Golf Course/);
    });

    test('a read that fails (an error, not an answer) leaves Resume standing', async () => {
        const mem = phone();
        const h = home(mem, { db: db(null, { fail: true }) });
        await tick(); await tick();
        assert.match(h.tile(), /Resume Dobson Ranch/);
        assert.ok(mem.get('hardpan_last_round'));
    });

    test("the phone's unsent scores count: thru follows the queue, not only the stored copy", () => {
        const mem = phone();
        const Q = home(new Map()).sb.OfflineQueue;
        Q.enqueue(memStore(mem), { path: 'events/ABC123/scores/p1_h2', type: 'set', value: 5 });
        Q.enqueue(memStore(mem), { path: 'events/ABC123/scores/p2_h2', type: 'set', value: 4 });
        const h = home(mem, { offline: true, db: db(undefined) });
        assert.match(h.tile(), /thru 2</);
    });

    test('the server answers: the tile is refreshed from it', async () => {
        const h = home(phone(), { db: db(ROUND([1, 2])) });
        assert.match(h.tile(), /thru 1</, 'the phone first');
        await tick(); await tick();
        assert.match(h.tile(), /Resume Dobson Ranch Golf Course · thru 2</, 'then the server');
    });

    test('the server POSITIVELY says the round is gone: Resume is removed and the pointer forgotten', async () => {
        const mem = phone();
        const h = home(mem, { db: db(null) });
        assert.match(h.tile(), /Resume/);
        await tick(); await tick();
        assert.equal(h.tile(), '');
        assert.equal(mem.get('hardpan_last_round'), undefined);
    });

    test('the server says the round is finished: no Resume', async () => {
        const h = home(phone(), { db: db(ROUND([1, 2, 3])) });
        await tick(); await tick();
        assert.equal(h.tile(), '');
    });

    test('finished on the phone, or no copy on the phone and no signal: nothing to resume offline', () => {
        assert.equal(home(phone({ scored: [1, 2, 3] }), { offline: true, db: db(undefined) }).tile(), '');
        assert.equal(home(phone({ noCopy: true }), { offline: true, db: db(undefined) }).tile(), '', 'a round the phone never had cannot open offline');
    });

    test('older than 12 hours: no Resume', () => {
        const mem = phone();
        mem.set('hardpan_last_round', JSON.stringify({ code: 'ABC123', at: Date.now() - 13 * 3600 * 1000, course: 'x' }));
        assert.equal(home(mem, { offline: true, db: db(undefined) }).tile(), '');
    });
});
