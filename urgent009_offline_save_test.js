// ============================================================================
// URGENT-009 (013-1, HIGH): SAVE & START WITH NO SIGNAL, THEN THE APP IS KILLED.
//
// Measured by tools/sim/setup-shapes.js E-airplane-kill: the setup save was one
// Firebase update() held in memory, so a kill before the signal came back lost
// the whole round (20 golfers, the course, the Weekly Game). The rule now:
//
//   SAVED ON THIS PHONE FIRST  Save writes the round to the durable queue
//                              (golfapp_wq_v1) and its stored copy BEFORE the
//                              network write, plus the Resume pointer.
//   REOPEN SHOWS IT            Home offers Resume from this phone's copy, with
//                              no signal.
//   SENT WHEN ONLINE           front-door.js sendHeld: through the organizer
//                              gate (firstSeenAt, ownerUid), one update() to the
//                              same events/<code>, confirmed only on the ack.
//   NEVER TWICE                one op per code (coalesced), the same code and
//                              values on every send; a landed save leaves nothing.
//   NEVER "GONE"               a held round the server does not have yet is not
//                              forgotten, and its queue is not dropped.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ADMIN = read('admin.html');
const SLOW_MS = Number((ADMIN.match(/const SAVE_SLOW_MS = (\d+);/) || [])[1]) || 3000;

// ---- a phone: storage that survives a "kill", and the three files Home runs ----
function memStore(mem) {
    return {
        getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
        setItem: (k, v) => { mem.set(String(k), String(v)); },
        removeItem: (k) => { mem.delete(String(k)); },
        key: (i) => [...mem.keys()][i],
        get length() { return mem.size; }
    };
}
function home(mem, o) {
    const sb = {
        localStorage: memStore(mem), sessionStorage: memStore(new Map()),
        navigator: { onLine: !(o && o.offline) },
        setTimeout, clearTimeout, setInterval, clearInterval, console, JSON, Math, Date, Object, Array, Promise, URLSearchParams,
        location: { search: '', pathname: '/home.html', href: 'file:///home.html' },
        addEventListener() {}, dispatchEvent() {}, CustomEvent: function () {},
        authReady: Promise.resolve('uid-1')
    };
    sb.window = sb;
    vm.createContext(sb);
    ['offline-queue.js', 'organizer-gate.js', 'front-door.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
// A database that is offline (writes never settle) until `online()`, then acks.
function fakeDb() {
    const st = { on: false, writes: [], hung: [] };
    st.db = { ref(p) { return {
        on() {}, once() { return new Promise(() => {}); },
        set(v) { return st.write(p, 'set', v); }, update(v) { return st.write(p, 'update', v); }
    }; } };
    st.write = (p, op, v) => { st.writes.push({ path: p, op, value: JSON.parse(JSON.stringify(v)) }); if (st.on) return Promise.resolve(); return new Promise((res) => st.hung.push(res)); };
    st.online = () => { st.on = true; };
    return st;
}
const PAYLOAD = () => ({ courseName: 'Dobson Ranch Golf Course', activeCourseKey: 'gca_zgkynkan', gameFormat: 'stroke',
    courseData: [{ hole: 1, par: 4, hcpIndex: 1 }, { hole: 2, par: 3, hcpIndex: 2 }],
    players: Array.from({ length: 20 }, (_, i) => ({ id: 'p' + i, name: 'Golfer ' + (i + 1), hcp: String(i) })),
    moneyPool: { enabled: true }, flights: { on: true } });

describe('front-door.js holdRound / sendHeld: the round lives on the phone until the server has it', () => {
    test('held, killed, reopened with no signal: the round is on the phone and Resume points at it', () => {
        const mem = new Map();
        const a = home(mem, { offline: true });
        const op = a.HardPanDoors.holdRound('abc123', PAYLOAD(), { uid: 'uid-1', exists: false, ownerUid: null });
        assert.ok(op, 'held');
        // THE KILL: a new realm over the same storage.
        const b = home(mem, { offline: true });
        const q = JSON.parse(mem.get('golfapp_wq_v1'));
        assert.equal(q.length, 1);
        assert.equal(q[0].path, 'events/ABC123'); assert.equal(q[0].type, 'update'); assert.equal(q[0].coalesceKey, 'round-setup:ABC123');
        assert.equal(q[0].value.players.length, 20); assert.equal(q[0].value.ownerUid, 'uid-1', 'stamped like the organizer gate does');
        assert.ok(b.HardPanDoors.heldFor('ABC123'));
        const snap = b.OfflineQueue.loadSnapshot(b.localStorage, 'ABC123');
        assert.equal(snap.data.players.length, 20, 'the scorecard and Resume open this copy with no signal');
        assert.equal(snap.data.courseData.length, 2);
        assert.equal(JSON.parse(mem.get('hardpan_last_round')).code, 'ABC123', 'Home offers Resume');
        assert.equal(mem.get('lastRoomCode'), 'ABC123', 'Games > YOUR ROUND');
        assert.equal(b.OfflineQueue.localRounds(b.localStorage)[0].code, 'ABC123');
    });

    test('signal back: ONE update to the same code, through the organizer gate, confirmed - and a second send writes nothing', async () => {
        const mem = new Map();
        home(mem).HardPanDoors.holdRound('ABC123', PAYLOAD(), { uid: null, exists: false, ownerUid: null });
        const b = home(mem, { offline: true });
        const st = fakeDb();
        await b.HardPanDoors.sendHeld(st.db);
        assert.equal(st.writes.length, 0, 'not while the phone says it has no signal');
        b.navigator.onLine = true; st.online();
        const r = await b.HardPanDoors.sendHeld(st.db);
        assert.equal(r.sent, 1);
        assert.deepEqual(st.writes.map((w) => w.op + ' ' + w.path), ['set organizers/uid-1/firstSeenAt', 'update events/ABC123']);
        assert.equal(st.writes[1].value.ownerUid, 'uid-1', 'no uid when held: stamped at send');
        assert.equal(st.writes[1].value.players.length, 20);
        assert.equal(JSON.parse(mem.get('golfapp_wq_v1')).length, 0, 'confirmed by the ack: out of the queue');
        assert.equal(b.HardPanDoors.heldFor('ABC123'), null);
        await b.HardPanDoors.sendHeld(st.db);
        assert.equal(st.writes.length, 2, 'nothing sent twice');
    });

    test('a send that never settles (one dead bar) keeps the round queued for the next try', async () => {
        const mem = new Map();
        const a = home(mem);
        a.HardPanDoors.holdRound('ABC123', PAYLOAD(), { uid: 'uid-1' });
        const st = fakeDb();   // never acks
        // the drain's own 15 s bound is the product's; here the organizer write simply hangs
        const p = a.HardPanDoors.sendHeld(st.db);
        await wait(30);
        assert.equal(JSON.parse(mem.get('golfapp_wq_v1')).length, 1, 'still held while unacked');
        assert.equal(st.writes.length, 1);
        void p;
    });

    test('Save again before it is sent: still ONE op for the code, with the newest setup', () => {
        const mem = new Map();
        const a = home(mem);
        a.HardPanDoors.holdRound('ABC123', PAYLOAD(), { uid: 'uid-1' });
        const p2 = PAYLOAD(); p2.players = p2.players.slice(0, 8);
        a.HardPanDoors.holdRound('ABC123', p2, { uid: 'uid-1' });
        const q = JSON.parse(mem.get('golfapp_wq_v1'));
        assert.equal(q.length, 1);
        assert.equal(q[0].value.players.length, 8);
    });

    test('the server not having a held round is not "gone": nothing is forgotten or dropped', () => {
        const mem = new Map();
        const a = home(mem);
        a.HardPanDoors.holdRound('ABC123', PAYLOAD(), { uid: 'uid-1' });
        a.HardPanDoors.forgetRound('ABC123', true);
        assert.equal(JSON.parse(mem.get('golfapp_wq_v1')).length, 1);
        assert.ok(mem.get('golfapp_snap_v1_ABC123'));
        assert.equal(JSON.parse(mem.get('hardpan_last_round')).code, 'ABC123');
    });

    test('Round Setup\'s own save landed (page still open): the held copy leaves the queue', () => {
        const mem = new Map();
        const a = home(mem);
        const op = a.HardPanDoors.holdRound('ABC123', PAYLOAD(), { uid: 'uid-1' });
        a.HardPanDoors.heldLanded('ABC123', op);
        assert.equal(JSON.parse(mem.get('golfapp_wq_v1')).length, 0);
        assert.ok(mem.get('golfapp_snap_v1_ABC123'), 'the copy stays: Resume and the offline card still open it');
    });

    test('other rounds\' queued scores are not this send\'s', async () => {
        const mem = new Map();
        const a = home(mem);
        a.OfflineQueue.enqueue(a.localStorage, { path: 'events/OTHER1/scores/p1_h1', type: 'set', value: 4, coalesceKey: 'events/OTHER1/scores/p1_h1' });
        a.HardPanDoors.holdRound('ABC123', PAYLOAD(), { uid: 'uid-1' });
        const st = fakeDb(); st.online();
        await a.HardPanDoors.sendHeld(st.db);
        assert.deepEqual(st.writes.map((w) => w.path), ['organizers/uid-1/firstSeenAt', 'events/ABC123']);
        assert.equal(JSON.parse(mem.get('golfapp_wq_v1')).length, 1, 'the other round\'s score is left for its own card');
    });
});

// ---- Round Setup's own Save, driven to the write in the page's realm -------------------
function pageReadyToSave(o) {
    const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=SAVE01', localStorage: true,
        // the page it is (the harness defaults to /index.html, where the scorecard arms its own retry)
        beforeRun: (s) => { s.location.pathname = '/admin.html'; } });
    vm.runInContext(`
        window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); }; uiRefuse = alert; uiFail = alert; uiToast = alert;
        window.__ups = [];
        db.ref = function (p) { return {
            once: function () { if (p.indexOf('organizers/') === 0) return Promise.resolve({ val: function () { return null; }, exists: function () { return false; } }); return new Promise(function () {}); }, on: function () {},
            push: function () { return { key: 'K1' }; },
            update: function (v) { window.__ups.push(p); return new Promise(function (res) { ${o && o.ack !== undefined ? 'setTimeout(res, ' + o.ack + ');' : ''} }); },
            set: function () { return Promise.resolve(); }
        }; };
        var key = Object.keys(coursePresets)[0];
        courseHiddenSelect.value = key; courseSearchInput.value = coursePresets[key].name;
        window.__btn = document.getElementById('main-save-btn'); window.__btn.innerText = '\\uD83D\\uDCBE Save & Start Round';
    `, sb);
    return sb;
}
const queueOf = (sb) => JSON.parse(sb.localStorage.getItem('golfapp_wq_v1') || '[]');

describe('admin.html Save & Start: saved on this phone before the network write', () => {
    test('with no signal: the round is queued at once, and after the threshold the button says no signal - saved on this phone', { timeout: SLOW_MS + 3000 }, async () => {
        const sb = pageReadyToSave({});
        const conn = sb.__dbHandlers.filter((h) => h.path === '.info/connected');
        assert.equal(conn.length, 1, 'the page watches its own socket');
        conn[0].cb({ val: () => false });
        vm.runInContext('saveSettings()', sb);
        const q = queueOf(sb);
        assert.equal(q.length, 1, 'queued synchronously, before anything is sent');
        assert.equal(q[0].path, 'events/SAVE01'); assert.equal(q[0].coalesceKey, 'round-setup:SAVE01');
        assert.equal(q[0].value.ownerUid, 'anon-stub');
        assert.ok(q[0].value.courseData.length >= 9, 'the whole card');
        assert.ok(sb.localStorage.getItem('golfapp_snap_v1_SAVE01'), 'the stored copy');
        assert.equal(JSON.parse(sb.localStorage.getItem('hardpan_last_round')).code, 'SAVE01');
        await wait(SLOW_MS + 300);
        assert.equal(sb.__btn.disabled, true, 'still in flight: no second tap');
        assert.match(sb.__btn.innerText, /No signal/);
        assert.match(sb.__btn.innerText, /saved on this phone/);
        assert.match(sb.__btn.innerText, /back online/);
        assert.equal(sb.__alerts.length, 0);
    });
    test('a normal save (ack in 100 ms) leaves nothing queued and never shows the no-signal words', { timeout: SLOW_MS + 3000 }, async () => {
        const sb = pageReadyToSave({ ack: 100 });
        vm.runInContext('saveSettings()', sb);
        await wait(300);
        assert.equal(queueOf(sb).length, 0, 'confirmed by the ack');
        assert.equal(sb.document.getElementById('round-ready-screen').style.display, 'block');
        await wait(SLOW_MS);
        assert.ok(!/saved on this phone/.test(sb.__btn.innerText), sb.__btn.innerText);
    });
});

describe('the scorecard sends nothing of a held round ahead of it (source pins, index.html is pinned outside GPS blocks)', () => {
    const idx = read('index.html');
    const gps = idx.split('// GPS:BEGIN').slice(1).map((b) => b.split('// GPS:END')[0]).join('\n');
    test('its drain skips this round while the round itself is held', () => {
        assert.match(gps, /const only0 = only; only = function \(op\) \{ return only0\(op\) && !hpRoundHeld\(\); \};/);
        assert.match(gps, /addEventListener\('hardpan:held-sent', function \(\) \{ drainQueue\('held-sent'\); \}\)/);
    });
    test('a score typed on a held round is queued, not sent live (the rules refuse a score for a round not there yet)', () => {
        assert.match(gps, /if \(op && hpRoundHeld\(\)\) \{[\s\S]*?return new Promise\(function \(\) \{\}\);/);
    });
    test('a held round the server does not have yet is shown from the phone, never "gone"', () => {
        assert.match(gps, /window\.HardPanDoors\.heldFor\(currentMode\)\) \{\s*try \{ currentData = window\.OfflineQueue\.applyQueued\(\{\}/);
        assert.match(gps, /else if \(!incoming && window\.OfflineQueue && window\.OfflineQueue\.loadSnapshot/);
    });
    test('Home loads the queue it reads', () => {
        const h = read('home.html');
        assert.ok(h.indexOf('<script src="offline-queue.js"></script>') !== -1 && h.indexOf('<script src="offline-queue.js"></script>') < h.indexOf('<script src="front-door.js"></script>'));
    });
});
