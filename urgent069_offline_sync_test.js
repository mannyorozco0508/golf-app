// ============================================================================
// 069 C - AN OFFLINE GAME DAY ROUND: ON THE PHONE, THEN ONE CREATE-ONLY TRANSACTION (offline-round.js).
// A stand-in database (a tree with set/update/once/transaction, writes logged); ZERO live writes.
//
//   1  the local code: "L-" + 10 of the issuer's characters - never a real 6-character code
//   2  THE FIREWALL: nothing under an L- code is ever written (set/update/push/transaction/child/root
//      multi-path all stay pending); reads answer from this phone's copy
//   3  offline: held + 4 holes scored, the app KILLED, reopened - the round and its 4 holes are there,
//      Resume points at it, and sync does nothing while the phone says offline
//   4  signal back: the organizer gate, then ONE transaction creates the round + its 4 holes under a real
//      code (ownerUid, offlineStart.from); the phone moves to it (queue, copy, Resume, pointers)
//   5  a score typed while the transaction was out follows the round to its real code
//   6  a CODE CLASH: the code is taken by another round - it is left untouched, another is drawn
//   7  TWO PHONES, the same group: two rounds, never merged; the second learns the first's code ("theirs")
//   8  a transaction that did not answer, then landed late: the next try adopts it - no second round
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GPS = fs.existsSync(path.join(__dirname, 'offline-round.js'));
const GPS_ONLY = GPS ? {} : { skip: 'Consumer tree' };
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function memStore(mem) {
    return { getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null), setItem: (k, v) => { mem.set(String(k), String(v)); },
        removeItem: (k) => { mem.delete(String(k)); }, key: (i) => [...mem.keys()][i], get length() { return mem.size; } };
}
// A stand-in database. mode: 'up' (answers), 'hang' (transactions never answer; the value can be made
// to land later with landHung()).
function standIn(seed) {
    const st = { tree: JSON.parse(JSON.stringify(seed || {})), writes: [], tx: [], mode: 'up', hung: [] };
    const parts = (p) => String(p).split('/').filter(Boolean);
    const get = (p) => { let n = st.tree; for (const k of parts(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : JSON.parse(JSON.stringify(n)); };
    const put = (p, v) => { const ks = parts(p); let n = st.tree; for (let i = 0; i < ks.length - 1; i++) { if (n[ks[i]] == null || typeof n[ks[i]] !== 'object') n[ks[i]] = {}; n = n[ks[i]]; } if (v === null) delete n[ks[ks.length - 1]]; else n[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v)); };
    const snap = (p) => { const v = get(p); return { val: () => v, exists: () => v != null, key: parts(p).pop() }; };
    st.get = get;
    st.landHung = () => { st.hung.splice(0).forEach((h) => { if (get(h.p) === null) put(h.p, h.v); }); };
    st.db = { ref(p) { p = p == null ? '' : String(p); return {
        key: parts(p).pop() || null,
        child: (c) => st.db.ref(p + '/' + c),
        on(ev, cb) { setTimeout(() => cb(snap(p)), 0); return cb; }, off() {},
        once: () => Promise.resolve(snap(p)),
        set: (v) => { st.writes.push({ path: p, op: 'set' }); put(p, v); return Promise.resolve(); },
        update: (v) => { st.writes.push({ path: p, op: 'update', keys: Object.keys(v || {}) }); Object.keys(v || {}).forEach((k) => put(p + '/' + k, v[k])); return Promise.resolve(); },
        transaction(fn) {
            st.tx.push(p);
            const cur = get(p), v = fn(cur);
            if (st.mode === 'hang') { if (v !== undefined) st.hung.push({ p, v }); return new Promise(() => {}); }
            if (v === undefined) return Promise.resolve({ committed: false, snapshot: snap(p) });
            st.writes.push({ path: p, op: 'transaction' }); put(p, v);
            return Promise.resolve({ committed: true, snapshot: snap(p) });
        }
    }; } };
    return st;
}
// A phone: the files the scorecard / Home run, over storage that survives a kill.
function phone(mem, o) {
    const events = [];
    const sb = {
        localStorage: memStore(mem), sessionStorage: memStore(new Map()), navigator: { onLine: !(o && o.offline) },
        setTimeout, clearTimeout, setInterval, clearInterval, console, JSON, Math, Date, Object, Array, Promise, URLSearchParams, Uint8Array,
        crypto: globalThis.crypto,
        location: { search: '', pathname: '/home.html', href: 'file:///home.html' },
        addEventListener() {}, dispatchEvent(ev) { events.push(ev); return true; },
        CustomEvent: function (name, init) { this.type = name; this.detail = init && init.detail; },
        authReady: Promise.resolve((o && o.uid) || 'uid-1')
    };
    sb.window = sb;
    vm.createContext(sb);
    ['code-issuer.js', 'offline-queue.js', 'organizer-gate.js', 'front-door.js', 'offline-round.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    sb.events = events;
    return sb;
}
const NAMES = ['Test Ann', 'Test Bob', 'Test Cal', 'Test Dee'];
const ROUND = (names) => ({ courseName: 'Papago Golf Club', activeCourseKey: 'gapi_012141520636857668694', gameFormat: 'stroke', roundDay: 'Test 069',
    courseData: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 })),
    players: (names || NAMES).map((n, i) => ({ id: 'p' + i, name: n, hcp: String(i * 4) })) });
// Start offline, save, score `holes` holes for every golfer (the scorecard's queue ops, behind the held round).
function startOffline(P, holes, names) {
    const L = P.HardPanOfflineRound.newCode();
    assert.ok(P.HardPanDoors.holdRound(L, ROUND(names), { uid: 'uid-1', exists: false }), 'held');
    for (let h = 1; h <= holes; h++) for (let i = 0; i < 4; i++) {
        P.OfflineQueue.enqueue(P.localStorage, { path: 'events/' + L + '/scores/p' + i + '_h' + h, type: 'set', value: 4 + ((i + h) % 3), coalesceKey: 'events/' + L + '/scores/p' + i + '_h' + h });
    }
    return L;
}
const noLocalWrites = (st) => st.writes.concat(st.tx.map((p) => ({ path: p }))).filter((w) => /(^|\/)L-/.test(w.path));

describe('069 C offline round: the phone first, then one create-only transaction', GPS_ONLY, () => {
    test('the local code: L- + 10 of the issuer\'s characters, never a real code', () => {
        const P = phone(new Map());
        const seen = new Set();
        for (let i = 0; i < 200; i++) {
            const c = P.HardPanOfflineRound.newCode();
            assert.match(c, /^L-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
            assert.ok(P.HardPanOfflineRound.isLocal(c) && !P.HardPanOfflineRound.isLocal(c.slice(2, 8)));
            seen.add(c);
        }
        assert.equal(seen.size, 200);
        assert.equal(P.HardPanOfflineRound.isLocal('K7QX2M'), false);
    });

    test('the firewall: nothing under an L- code is ever written; reads answer from this phone', async () => {
        const mem = new Map(), P = phone(mem, { offline: true }), st = standIn({});
        const L = startOffline(P, 2);
        const g = P.HardPanOfflineRound.guardDb(st.db);
        let settled = 0;
        const mark = (p) => { Promise.resolve(p).then(() => settled++, () => settled++); };
        mark(g.ref('events/' + L).update({ x: 1 }));
        mark(g.ref('events/' + L + '/scores/p0_h3').set(5));
        mark(g.ref('events/' + L + '/scores').push({ a: 1 }));
        mark(g.ref('events/' + L).transaction(() => ({ a: 1 })));
        mark(g.ref('events').child(L).child('scores/p1_h3').set(6));
        mark(g.ref().update({ ['events/' + L + '/scores/p2_h3']: 4, 'trips/T1/x': 1 }));
        mark(g.ref('organizers/' + L).set(1));
        await wait(50);
        assert.equal(settled, 0, 'every write under an L- code stays pending, like a write with no signal');
        assert.deepEqual(noLocalWrites(st), [], 'and none reached the database');
        const s = await g.ref('events/' + L).once('value');
        assert.equal(s.exists(), true);
        assert.equal(s.val().players.length, 4);
        assert.equal(Object.keys(s.val().scores).length, 8, '2 holes x 4 golfers, from the queue');
        assert.equal((await g.ref('events/' + L + '/players/0/name').once('value')).val(), 'Test Ann');
        // Real codes are untouched by the guard.
        await g.ref('events/ABCDEF/x').set(1);
        assert.equal(st.get('events/ABCDEF/x'), 1);
    });

    test('offline: 4 holes, the app killed and reopened - the round and its 4 holes are there; no sync while offline', async () => {
        const mem = new Map(), st = standIn({});
        let P = phone(mem, { offline: true });
        const L = startOffline(P, 4);
        P = phone(mem, { offline: true });   // killed, reopened
        const d = P.HardPanOfflineRound.localData(L);
        assert.equal(d.players.length, 4);
        assert.equal(P.HardPanOfflineRound.holesOf(d), 4);
        assert.equal(mem.get('lastRoomCode'), L, 'Resume points at the offline round');
        assert.ok(P.HardPanDoors.heldFor(L), 'still held');
        assert.deepEqual(await P.HardPanOfflineRound.sync(st.db), null);
        assert.equal(await P.HardPanDoors.sendHeld(st.db), null);
        assert.deepEqual(st.writes, [], 'nothing sent with no signal');
    });

    test('signal back: ONE transaction creates the round + its 4 holes under a real code; the phone moves to it', async () => {
        const mem = new Map(), st = standIn({});
        let P = phone(mem, { offline: true });
        const L = startOffline(P, 4);
        P = phone(mem);   // signal back (a fresh page, as after a kill)
        await P.HardPanDoors.sendHeld(st.db);
        await wait(30);
        const synced = P.events.filter((e) => e.type === 'hardpan:offline-synced').map((e) => e.detail);
        assert.equal(synced.length, 1, JSON.stringify(P.events.map((e) => e.type)));
        const m = synced[0];
        assert.match(m.to, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
        assert.equal(m.holes, 4);
        const r = st.get('events/' + m.to);
        assert.equal(r.players.length, 4);
        assert.equal(Object.keys(r.scores).length, 16, 'the 4 holes went up inside the round');
        assert.equal(r.ownerUid, 'uid-1');
        assert.equal(r.offlineStart.from, L);
        assert.deepEqual(st.tx, ['events/' + m.to], 'one create-only transaction');
        assert.ok(st.writes.some((w) => w.path === 'organizers/uid-1/firstSeenAt'), 'through the organizer gate first');
        assert.deepEqual(noLocalWrites(st), [], 'never written under the local code');
        // On the phone: nothing left under the local code; everything points at the real one.
        assert.deepEqual(P.OfflineQueue.peek(P.localStorage).filter((o) => o.path.indexOf(L) >= 0), []);
        assert.equal(mem.get('lastRoomCode'), m.to);
        assert.equal(mem.has('golfapp_snap_v1_' + L), false);
        assert.equal(P.OfflineQueue.loadSnapshot(P.localStorage, m.to).data.players.length, 4);
        assert.equal(P.HardPanOfflineRound.syncedTo(L).code, m.to);
        assert.equal(P.HardPanDoors.heldFor(L), null);
        assert.equal(P.HardPanOfflineRound.hasLocal(), false);
    });

    test('a score typed while the transaction was out follows the round to its real code', async () => {
        const mem = new Map(), st = standIn({});
        const P = phone(mem);
        const L = startOffline(P, 2);
        const realTx = st.db.ref;
        st.db.ref = function (p) { const r = realTx.call(this, p); const t = r.transaction; r.transaction = function (fn) { P.OfflineQueue.enqueue(P.localStorage, { path: 'events/' + L + '/scores/p3_h3', type: 'set', value: 7, coalesceKey: 'events/' + L + '/scores/p3_h3' }); return t.call(r, fn); }; return r; };
        const res = await P.HardPanOfflineRound.sync(st.db);
        const to = res[0].to;
        const left = P.OfflineQueue.peek(P.localStorage);
        assert.deepEqual(left.map((o) => o.path), ['events/' + to + '/scores/p3_h3'], 'the late score waits under the real code (the scorecard sends it)');
        assert.equal(st.get('events/' + to + '/scores/p3_h3'), null, 'not inside the created round');
    });

    test('a CODE CLASH: the code is taken by another round - left untouched, another code drawn', async () => {
        const mem = new Map();
        const P = phone(mem);
        const L = startOffline(P, 3);
        const key = P.HardPanOfflineRound.groupKey(ROUND(), JSON.parse(mem.get('golfapp_wq_v1'))[0].ts);
        const first = P.HardPanOfflineRound.keyCode(key);
        const other = { players: [{ name: 'Someone Else' }], ownerUid: 'uid-9', scores: { p0_h1: 5 } };
        const st = standIn({ events: { [first]: other } });
        const res = await P.HardPanOfflineRound.sync(st.db);
        assert.equal(res.length, 1);
        assert.notEqual(res[0].to, first);
        assert.deepEqual(st.get('events/' + first), other, 'the other round is untouched');
        assert.equal(st.tx[0], 'events/' + first, 'the group code was tried first');
        assert.ok(P.events.some((e) => e.type === 'hardpan:offline-clash' && e.detail.code === first), 'said: drawing another');
        assert.equal(st.get('events/' + res[0].to).offlineStart.from, L);
        assert.equal(res[0].theirs, null);
    });

    test('TWO PHONES, the same group: two rounds, never merged; the second learns the first\'s code', async () => {
        const st = standIn({});
        const A = phone(new Map(), { uid: 'uid-a' }), B = phone(new Map(), { uid: 'uid-b' });
        const LA = startOffline(A, 4), LB = startOffline(B, 2);
        const ra = (await A.HardPanOfflineRound.sync(st.db))[0];
        const rb = (await B.HardPanOfflineRound.sync(st.db))[0];
        assert.notEqual(ra.to, rb.to, 'two rounds');
        assert.equal(rb.theirs.code, ra.to, 'B is told about A\'s round ("Open theirs")');
        assert.deepEqual(rb.theirs.names, NAMES);
        const a = st.get('events/' + ra.to), b = st.get('events/' + rb.to);
        assert.equal(a.offlineStart.from, LA); assert.equal(b.offlineStart.from, LB);
        assert.equal(Object.keys(a.scores).length, 16, 'A keeps its own 4 holes');
        assert.equal(Object.keys(b.scores).length, 8, 'B keeps its own 2 holes - nothing merged');
        assert.equal(a.ownerUid, 'uid-a'); assert.equal(b.ownerUid, 'uid-b');
        assert.equal(B.events.filter((e) => e.type === 'hardpan:offline-clash').length, 0, 'the same group is "theirs", not a clash');
    });

    test('a transaction that did not answer, then landed late: the next try adopts it - no second round', async () => {
        const mem = new Map(), st = standIn({});
        const P = phone(mem);
        const L = startOffline(P, 2);
        st.mode = 'hang';
        const r1 = await P.HardPanOfflineRound.sync(st.db, { txMs: 80 });
        assert.equal(r1.length, 0);
        assert.ok(P.events.some((e) => e.type === 'hardpan:offline-sync-stopped'));
        assert.ok(P.HardPanOfflineRound.hasLocal(), 'still on the phone');
        st.landHung(); st.mode = 'up';   // it landed after all
        const landed = st.tx[0].replace('events/', '');
        const r2 = await P.HardPanOfflineRound.sync(st.db);
        assert.equal(r2[0].to, landed, 'adopted - the same round');
        assert.equal(Object.keys(st.tree.events).length, 1, 'one round on the server');
        assert.equal(P.HardPanOfflineRound.hasLocal(), false);
        assert.equal(st.get('events/' + landed).offlineStart.from, L);
    });
});
