// ============================================================================
// URGENT-045 #2 - KP BY GPS (gps-kp.js on the shared Mark button, gps-mark-distance.js).
//
//   1  the pure parts: which holes are KP holes, feet / inches, the record, who has the KP
//   2  THE EXISTING KP FLOW: the closest mark is written by index.html's OWN saveKpLeader +
//      recordKpGroupAnswer (the functions are lifted out of index.html and run as they are) -
//      the same keys and values a tap on the name with the feet / inches typed in writes
//   3  organizer override: same two keys, logged, locks the hole; "back to the GPS result"
//   4  THE LOCATION GUARD: every write, every storage write, for a whole KP hole (ball, cup,
//      a second golfer, an override) - no latitude, no longitude, no point anywhere; and the
//      two files never store or send a point (no fetch / XHR / beacon / socket / localStorage)
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const IDX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const KP_SRC = fs.readFileSync(path.join(ROOT, 'gps-kp.js'), 'utf8');
const MARK_SRC = fs.readFileSync(path.join(ROOT, 'gps-mark-distance.js'), 'utf8');
const GEO_SRC = fs.readFileSync(path.join(ROOT, 'gps-geo.js'), 'utf8');

// A function declaration out of index.html, braces matched (strings and comments are simple there).
function lift(name) {
    const i = IDX.indexOf('function ' + name + '(');
    assert.ok(i > -1, name + ' is in index.html');
    let j = IDX.indexOf('{', i), depth = 0, k = j;
    for (; k < IDX.length; k++) { const c = IDX[k]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
    return IDX.slice(i, k + 1);
}
const LIFTED = ['canSetKpLeader', 'kpDistanceInches', 'saveKpLeader', 'recordKpGroupAnswer', 'kpGroupAnswerKey', 'kpSessionAnswerKey'].map(lift).join('\n');

// A Papago-ish par 3: the cup, and a ball 9 ft 10 in short of it (3 m due south).
const CUP = [33.45001, -111.95002];
const BALL = [CUP[0] - 3 / 111320, CUP[1]];
const BALL2 = [CUP[0] - 6 / 111320, CUP[1]];   // 19 ft 8 in

function round(extra) {
    return Object.assign({
        players: [{ id: 1, name: 'Test Alpha' }, { id: 2, name: 'Test Bravo' }, { id: 3, name: 'Test Charlie' }, { id: 4, name: 'Test Delta' }],
        courseData: [{ hole: 1, par: 4 }, { hole: 2, par: 3 }, { hole: 3, par: 5 }],
        moneyPool: { enabled: true, buyIn: 20, kp: { amount: 20, holes: [2] }, skins: { mode: 'remainder', scoring: 'net', carryOver: true } },
        scores: {}
    }, extra || {});
}

// The page: index.html's own KP writers + the two files, the database and the storage recorded.
function page(data, opts) {
    const o = opts || {};
    const writes = [], stores = [];
    const rec = (kind) => (path0, v) => { writes.push({ kind, path: path0, v: JSON.parse(JSON.stringify(v === undefined ? null : v)) }); return Promise.resolve(); };
    let pushN = 0;
    const db = { ref: (p) => ({ update: (v) => rec('update')(p, v), set: (v) => rec('set')(p, v), remove: () => rec('remove')(p, null), push: () => ({ key: '-push' + (++pushN) }), once: () => Promise.resolve({ val: () => null }) }) };
    const storage = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { stores.push({ k, v: String(v) }); m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; };
    const flashes = [];
    const sb = {
        console, Math, Date, JSON, Object, Array, String, Number, isFinite, isNaN, parseInt, parseFloat, Promise, Error, RegExp,
        setTimeout: (f) => { f(); return 0; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
        localStorage: storage(), sessionStorage: storage(),
        currentData: data, currentMode: 'TKP045', db,
        hasGroupLock: o.group != null, lockedGroup: o.group != null ? o.group : null, organizerTokenParam: o.organizer ? 'tok' : null,
        durableWrite: (p, type, v, key) => { writes.push({ kind: 'durable:' + type, path: p, key, v: JSON.parse(JSON.stringify(v)) }); return Promise.resolve(); },
        playerGroupOf: (id) => (Number(id) <= 2 ? 1 : 2),
        renderKpEntryMount: () => {}, uiFail: (m) => flashes.push('fail:' + m), uiRefuse: (m) => flashes.push('refuse:' + m), uiToast: (m) => flashes.push(m),
        hasOrganizerAuthority: () => !!o.organizer, canReachSetup: () => false,
        kpEntryOpenHole: null
    };
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext('var kpEntryOpenHole = null;\n' + LIFTED, sb);
    vm.runInContext(GEO_SRC, sb);
    vm.runInContext(MARK_SRC, sb);
    vm.runInContext(KP_SRC, sb);
    let fixNow = null;
    const ctx = (hole, golferId) => ({ el: null, hole, par: hole === 2 ? 3 : 4, on: true, eventCode: 'TKP045', golfer: { id: golferId, player: data.players.find((p) => p.id === golferId) },
        flash: (t) => flashes.push(t), fix: () => (fixNow ? { pt: fixNow.slice(), acc: 3, at: Date.now() } : null), tee: [33.449, -111.951], mid: CUP.slice(), fairway: null, savedLine: null });
    return {
        sb, writes, stores, flashes, M: sb.HardPanMark, K: sb.HardPanGpsKp,
        at: (hole, golferId) => sb.HardPanMark.sync(ctx(hole, golferId)),
        stand: (pt) => { fixNow = pt; },
        tap: () => sb.HardPanMark.tap()
    };
}

// ---- 1. pure ------------------------------------------------------------------
test('KP holes: the Weekly Game KP holes with KP money; none when cancelled, off, or $0; a Long Drive hole is not a KP hole', () => {
    const K = require('./gps-kp.js');
    assert.deepEqual(K.kpHoles(round()), [2]);
    assert.deepEqual(K.kpHoles(round({ kpCancelled: { cancelled: true } })), []);
    assert.deepEqual(K.kpHoles(round({ moneyPool: { enabled: false, kp: { amount: 20, holes: [2] } } })), []);
    assert.deepEqual(K.kpHoles(round({ moneyPool: { enabled: true, kp: { amount: 0, holes: [2] } } })), []);
    assert.deepEqual(K.kpHoles(round({ moneyPool: { enabled: true, kp: { amount: 30, holes: { 0: 2, 1: 3 } }, longDrive: { holes: [3] } } })), [2]);
    assert.equal(K.isKpHole(round(), 2), true);
    assert.equal(K.isKpHole(round(), 1), false);
});
test('distance: yards and feet + inches; the record is a distance and a time, nothing else', () => {
    const K = require('./gps-kp.js');
    assert.deepEqual(K.kpDistance(3), { inches: 118, ft: 9, in: 10, yd: 3 });
    assert.equal(K.kpLabel(118), '9 ft 10 in');
    const m = K.kpMark(3, 4, 1792000000000, { name: 'Test Alpha', group: 1 });
    assert.deepEqual(Object.keys(m).sort(), ['accFt', 'at', 'by', 'ft', 'group', 'in', 'inches', 'kind', 'name', 'yd']);
    assert.equal(m.accFt, 13);
});
test('who has the KP: closest GPS mark; a typed KP WITH a distance competes, WITHOUT one stands; nobody / override block', () => {
    const K = require('./gps-kp.js');
    const marks = { 1: { kind: 'kp', inches: 118, at: 10 }, 3: { kind: 'kp', inches: 90, at: 20 } };
    let v = K.decide(round({ kpGps: { h2: { marks } } }), 2);
    assert.equal(v.best.pid, '3'); assert.equal(v.change, true);
    v = K.decide(round({ kpGps: { h2: { marks } }, kpLeaders: { h2: { playerId: '2', distanceInches: 60, updatedAt: 5 } } }), 2);
    assert.equal(v.best.pid, '2'); assert.equal(v.best.src, 'typed'); assert.equal(v.change, false, 'a typed 5 ft beats a GPS 7 ft 6 in');
    v = K.decide(round({ kpGps: { h2: { marks } }, kpLeaders: { h2: { playerId: '2', distanceInches: 200, updatedAt: 5 } } }), 2);
    assert.equal(v.best.pid, '3'); assert.equal(v.change, true, 'a GPS 7 ft 6 in beats a typed 16 ft 8 in');
    v = K.decide(round({ kpGps: { h2: { marks } }, kpLeaders: { h2: { playerId: '2', distanceInches: null } } }), 2);
    assert.equal(v.blocked, 'typed'); assert.equal(v.change, false);
    v = K.decide(round({ kpGps: { h2: { marks } }, kpNoWinner: { h2: true } }), 2);
    assert.equal(v.blocked, 'nobody');
    v = K.decide(round({ kpGps: { h2: { marks, override: { playerId: '1', at: 30 } } } }), 2);
    assert.equal(v.blocked, 'override'); assert.equal(v.best.pid, '1');
    // The leader the GPS put there is not "typed": a closer mark replaces it.
    v = K.decide(round({ kpGps: { h2: { marks, win: { playerId: '1' } } }, kpLeaders: { h2: { playerId: '1', distanceInches: 118 } } }), 2);
    assert.equal(v.best.pid, '3'); assert.equal(v.change, true);
    // A tie: the earlier mark.
    v = K.decide(round({ kpGps: { h2: { marks: { 1: { kind: 'kp', inches: 90, at: 30 }, 3: { kind: 'kp', inches: 90, at: 20 } } } } }), 2);
    assert.equal(v.best.pid, '3');
});

// ---- 2. the existing KP flow ----------------------------------------------------------
test('THE EXISTING FLOW: ball, then "Cup is here" -> index.html saveKpLeader writes kpLeaders + kpWinners in ONE update, and the group answer', () => {
    const d = round();
    const P = page(d, { group: 1 });
    P.at(1, 1);
    assert.equal(P.M.active(), null, 'no button on a par 4 that is not a KP hole');
    P.at(2, 1);
    assert.equal(P.M.active(), 'kp', 'the button on the KP hole');
    P.stand(BALL); P.tap();
    assert.equal(P.K.state().pendingBall, true, 'the ball first, then the cup');
    assert.ok(P.flashes.some((f) => /walk to the cup/.test(f)));
    assert.equal(P.writes.length, 0, 'nothing written until the cup');
    P.stand(CUP); P.tap();
    const kp = P.writes.find((w) => w.kind === 'durable:update' && w.v['kpWinners/h2'] !== undefined);
    assert.ok(kp, 'the KP write');
    assert.equal(kp.path, 'events/TKP045');
    assert.equal(kp.key, 'kp:TKP045:h2', 'saveKpLeader\'s own queue key');
    assert.deepEqual(Object.keys(kp.v).sort(), ['kpLeaders/h2', 'kpWinners/h2'], 'exactly the two keys the KP block writes, together');
    assert.equal(kp.v['kpWinners/h2'], '1');
    const L = kp.v['kpLeaders/h2'];
    assert.deepEqual(Object.keys(L).sort(), ['distanceInches', 'group', 'playerId', 'playerName', 'updatedAt']);
    assert.equal(L.playerId, '1'); assert.equal(L.playerName, 'Test Alpha'); assert.equal(L.group, 1);
    assert.equal(L.distanceInches, 118, '9 ft 10 in - as if "9" and "10" were typed');
    const ans = P.writes.find((w) => w.kind === 'update' && w.v['kpGroupAnswers/h2/g1']);
    assert.ok(ans, 'the group\'s KP question is answered (recordKpGroupAnswer)');
    assert.equal(ans.v['kpGroupAnswers/h2/g1'].answer, '1');
    const mark = P.writes.find((w) => w.v['kpGps/h2/marks/1']);
    assert.equal(mark.v['kpGps/h2/marks/1'].inches, 118);
    assert.equal(mark.v['kpGps/h2/marks/1'].yd, 3);
    assert.ok(mark.v['kpGps/h2/marks/1'].at > 0, 'the time');
});
test('the SAME as typing it: the KP block\'s pickKpLeader path with "9" / "10" writes the identical kpLeaders / kpWinners', () => {
    const a = page(round(), { group: 1 }), b = page(round(), { group: 1 });
    a.at(2, 1); a.stand(BALL); a.tap(); a.stand(CUP); a.tap();
    vm.runInContext("saveKpLeader(2, '1', '9', '10')", b.sb);
    const strip = (w) => { const v = JSON.parse(JSON.stringify(w.v)); delete v['kpLeaders/h2'].updatedAt; return { path: w.path, key: w.key, v }; };
    const wa = a.writes.find((w) => w.v['kpWinners/h2'] !== undefined), wb = b.writes.find((w) => w.v['kpWinners/h2'] !== undefined);
    assert.deepEqual(strip(wa), strip(wb));
});
test('closest wins: a second golfer farther away changes nothing; the cup is reused on this phone; a closer one takes it', () => {
    const d = round();
    const P = page(d, { group: 1 });
    P.at(2, 1); P.stand(BALL); P.tap(); P.stand(CUP); P.tap();
    const n0 = P.writes.filter((w) => w.v['kpWinners/h2'] !== undefined).length;
    P.at(2, 2); P.stand(BALL2); P.tap();
    assert.equal(P.K.state().pendingBall, false, 'the cup this phone already has - one tap');
    assert.equal(P.writes.filter((w) => w.v['kpWinners/h2'] !== undefined).length, n0, 'Bravo at 19 ft 8 in does not take it');
    assert.ok(d.kpGps.h2.marks['2'], 'his mark is recorded');
    P.stand([CUP[0] - 1 / 111320, CUP[1]]); P.tap();   // Bravo again, 3 ft 3 in
    const last = P.writes.filter((w) => w.v['kpWinners/h2'] !== undefined).pop();
    assert.equal(last.v['kpWinners/h2'], '2');
    assert.equal(last.v['kpLeaders/h2'].distanceInches, 39);
});
test('"Cup is here" finishes the ball\'s golfer\'s mark, even if the screen\'s golfer changed in between', () => {
    const d = round();
    const P = page(d, { group: 1 });
    P.at(2, 1); P.stand(BALL2); P.tap();
    P.at(2, 2); P.stand(CUP); P.tap();
    assert.ok(d.kpGps.h2.marks['1'], 'Alpha\'s mark');
    assert.equal(d.kpGps.h2.marks['1'].inches, 236);
    assert.equal(d.kpGps.h2.marks['2'], undefined);
    assert.equal(P.K.state().pendingBall, false);
});
test('a typed KP with no distance is not overruled by GPS; a mark from another group is refused on this phone', () => {
    const d = round({ kpLeaders: { h2: { playerId: '3', playerName: 'Test Charlie', distanceInches: null, updatedAt: 1 } }, kpWinners: { h2: '3' } });
    const P = page(d, { group: 1 });
    P.at(2, 1); P.stand(BALL); P.tap(); P.stand(CUP); P.tap();
    assert.equal(P.writes.filter((w) => w.v['kpWinners/h2'] !== undefined).length, 0);
    assert.equal(P.K.decide(d, 2).blocked, 'typed');
    P.at(2, 3); P.stand(BALL); P.tap();
    assert.ok(P.flashes.some((f) => /Only a golfer in your group/.test(f)));
});
test('far from the cup is not a KP', () => {
    const P = page(round(), { group: 1 });
    P.at(2, 1); P.stand(CUP); P.tap();   // the cup first? no - the first tap is the ball
    P.stand([CUP[0] + 0.001, CUP[1]]); P.tap();   // ~111 m away
    assert.ok(P.flashes.some((f) => /yds from the cup/.test(f)));
    assert.equal(P.writes.filter((w) => w.v['kpWinners/h2'] !== undefined).length, 0);
});

// ---- 3. organizer override ---------------------------------------------------------------
test('organizer override: same two keys in one update, logged, locks the hole; back to the GPS result', () => {
    const d = round({ players: round().players.concat([{ id: 5, name: 'Test Echo' }, { id: 6, name: 'Test Fox' }]) });   // 6 golfers: a field link
    const G1 = page(d, { group: 1 });
    G1.at(2, 1); G1.stand(BALL); G1.tap(); G1.stand(CUP); G1.tap();
    const O = page(d, { organizer: true });   // the organizer, bare link of a multi-group round: canSetKpLeader is false
    O.at(2, 1);
    assert.equal(O.K.override(2, '4'), true);
    const w = O.writes.find((x) => x.v['kpWinners/h2'] === '4');
    assert.ok(w, 'the winner write');
    assert.equal(w.key, 'kp:TKP045:h2');
    assert.ok(w.v['kpLeaders/h2'] && w.v['kpLeaders/h2'].playerId === '4' && w.v['kpLeaders/h2'].playerName === 'Test Delta');
    const logs = Object.keys(d.kpGpsLog || {}).map((k) => d.kpGpsLog[k]).filter((e) => e.action === 'override');
    assert.equal(logs.length, 1, 'the override is logged');
    assert.deepEqual([logs[0].hole, logs[0].playerId, logs[0].prevPlayerId, logs[0].by], [2, '4', '1', 'organizer']);
    assert.ok(O.writes.some((x) => Object.keys(x.v).some((k) => /^kpGpsLog\//.test(k) && x.v[k].action === 'override')), 'the log is written to the round');
    // Locked: a closer GPS mark afterwards does not move it.
    const before = G1.writes.filter((x) => x.v['kpWinners/h2'] !== undefined).length;
    G1.at(2, 2); G1.stand([CUP[0] - 0.5 / 111320, CUP[1]]); G1.tap();
    assert.equal(G1.writes.filter((x) => x.v['kpWinners/h2'] !== undefined).length, before, 'the override holds');
    assert.equal(G1.K.decide(d, 2).blocked, 'override');
    // A golfer cannot override.
    assert.equal(G1.K.override(2, '1'), false);
    // Back to the GPS result: the closest mark (Bravo, 1 ft 8 in), logged.
    O.K.clearOverride(2);
    const back = O.writes.filter((x) => x.v['kpWinners/h2'] !== undefined).pop();
    assert.equal(back.v['kpWinners/h2'], '2');
    assert.ok(Object.keys(d.kpGpsLog).some((k) => d.kpGpsLog[k].action === 'override-off'));
});

// ---- 4. THE LOCATION GUARD ----------------------------------------------------------------
test('GUARD: a whole KP hole writes no latitude, no longitude, no point - to the round or to storage', () => {
    const d = round({ players: round().players.concat([{ id: 5, name: 'Test Echo' }]) });
    const P = page(d, { group: 1 });
    P.at(2, 1); P.stand(BALL); P.tap(); P.stand(CUP); P.tap();
    P.at(2, 2); P.stand(BALL2); P.tap();
    const O = page(d, { organizer: true });
    O.at(2, 1); O.K.override(2, '2'); O.K.clearOverride(2);
    const all = P.writes.concat(O.writes).map((w) => ({ path: w.path, key: w.key, v: w.v }))
        .concat(P.stores.concat(O.stores).map((s) => ({ path: 'storage:' + s.k, v: s.v })));
    assert.ok(all.length >= 8, 'the flow wrote (' + all.length + ')');
    const coords = [CUP, BALL, BALL2].flat();
    const bad = [];
    const walk = (v, where) => {
        if (v == null) return;
        if (typeof v === 'number') { if (Math.abs(v) > 30 && Math.abs(v) <= 180 && !Number.isInteger(v)) bad.push(where + '=' + v); return; }
        if (typeof v === 'string') {
            if (/-?\d{1,3}\.\d{4,}/.test(v)) bad.push(where + ' "' + v + '"');
            coords.forEach((c) => { if (v.indexOf(String(c).slice(0, 7)) > -1) bad.push(where + ' has ' + c); });
            return;
        }
        if (Array.isArray(v)) { if (v.length === 2 && v.every((x) => typeof x === 'number')) bad.push(where + ' is a point'); v.forEach((x, i) => walk(x, where + '[' + i + ']')); return; }
        Object.keys(v).forEach((k) => { if (/(^|\/)(lat|lng|lon|latitude|longitude|pt|p|coords|pos|position|point|cup|ball|tee)$/i.test(k)) bad.push(where + '.' + k); walk(v[k], where + '.' + k); });
    };
    all.forEach((w, i) => { walk(w.v, '#' + i + ' ' + w.path); walk(w.path, '#' + i + ' path'); });
    assert.deepEqual(bad, [], 'no position anywhere');
    // Every write is under this round, at a KP path or the KP answer log.
    P.writes.concat(O.writes).forEach((w) => {
        assert.equal(w.path, 'events/TKP045');
        Object.keys(w.v).forEach((k) => assert.match(k, /^(kpLeaders|kpWinners|kpGroupAnswers|kpGps|kpGpsLog)\//, k));
    });
});
test('GUARD (source): the two files never send or store anything themselves - no fetch, XHR, beacon, socket, storage write, coordinates in a record', () => {
    for (const [name, src] of [['gps-kp.js', KP_SRC], ['gps-mark-distance.js', MARK_SRC]]) {
        const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
        assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|\.setItem\(/, name);
        assert.doesNotMatch(code, /navigator\.geolocation/, name + ' reads no location itself (the GPS screen hands it the fix)');
    }
    // The only round write in gps-kp.js goes through write() / saveKpLeader, and a mark is kpMark().
    assert.match(KP_SRC, /u\['kpGps\/h' \+ h \+ '\/marks\/' \+ g\.id\] = mark;/);
    assert.doesNotMatch(KP_SRC.replace(/\/\/.*$/gm, ''), /\.pt\b[^;]*\]\s*=|kpGps[^;]*\.pt/, 'no point is put in a kpGps record');
});
test('no money engine reads the new records', () => {
    for (const f of ['money-engine.js', 'settlement-engine.js', 'pool-engine.js', 'payouts.js', 'match-engine.js']) {
        assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /kpGps/, f);
    }
});
test('wiring: index.html loads the button then KP; the GPS screen calls the button every frame', () => {
    const a = IDX.indexOf('<script src="gps-mark-distance.js"></script>'), b = IDX.indexOf('<script src="gps-kp.js"></script>');
    assert.ok(a > -1 && b > a);
    const view = fs.readFileSync(path.join(ROOT, 'gps-view.js'), 'utf8');
    assert.match(view, /markTick\(r\);/);
    assert.match(view, /var K = window\.HardPanMark;/);
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    assert.match(sw, /'\.\/gps-mark-distance\.js'/); assert.match(sw, /'\.\/gps-kp\.js'/);
});
