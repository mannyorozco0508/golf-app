// ============================================================================
// URGENT-045 #2b - LONG DRIVE (gps-longdrive.js on the shared Mark button, gps-mark-distance.js).
//
//   1  the pure parts: which holes, the distance math, the fairway check (in / rough / no
//      fairway data / the saved line +-25 yds), who has the Long Drive (longest counting wins)
//   2  THE EXISTING KP FLOW: the longest drive is written by index.html's OWN saveKpLeader +
//      recordKpGroupAnswer (lifted out of index.html and run as they are), and pool-engine.js
//      pays that hole's KP share to that golfer - no engine changed
//   3  organizer: rough / fairway on a drive, "Rough counts", Make winner - logged
//   4  THE LOCATION GUARD: every write for a whole Long Drive hole - no latitude, no
//      longitude, no point anywhere; the file never stores or sends a point itself
//   5  + Bet > More > Long Drive: the Weekly Game sheet writes moneyPool.longDrive and the
//      hole into kp.holes
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const IDX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const LD_SRC = fs.readFileSync(path.join(ROOT, 'gps-longdrive.js'), 'utf8');
const MARK_SRC = fs.readFileSync(path.join(ROOT, 'gps-mark-distance.js'), 'utf8');
const GEO_SRC = fs.readFileSync(path.join(ROOT, 'gps-geo.js'), 'utf8');
const LD = require('./gps-longdrive.js');

function lift(name) {
    const i = IDX.indexOf('function ' + name + '(');
    assert.ok(i > -1, name + ' is in index.html');
    let j = IDX.indexOf('{', i), depth = 0, k = j;
    for (; k < IDX.length; k++) { const c = IDX[k]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
    return IDX.slice(i, k + 1);
}
const LIFTED = ['canSetKpLeader', 'kpDistanceInches', 'saveKpLeader', 'recordKpGroupAnswer', 'kpGroupAnswerKey', 'kpSessionAnswerKey'].map(lift).join('\n');

// A par 5 heading due north from the tee. 1 yd north = 0.9144 m / 111195 m per degree.
const YD = 0.9144 / (6371008.8 * Math.PI / 180);
const TEE = [33.45, -111.95];
const north = (yds, eastYds) => [TEE[0] + yds * YD, TEE[1] + (eastYds || 0) * YD / Math.cos(TEE[0] * Math.PI / 180)];
const FAIRWAY = [north(150, -20), north(150, 20), north(320, 20), north(320, -20)];   // 40 yds wide, 150-320 out
const LINE = [TEE, north(250), north(520)];
const BALL_FW = north(260, 5);          // in the fairway, 260 out
const BALL_RGH = north(275, 40);        // 20 yds right of the fairway's edge, 40 off the line
const BALL_NEAR_LINE = north(240, 22);  // outside the polygon, 22 yds off the line

function round(extra) {
    return Object.assign({
        players: [{ id: 1, name: 'Test Alpha' }, { id: 2, name: 'Test Bravo' }, { id: 3, name: 'Test Charlie' }, { id: 4, name: 'Test Delta' }],
        courseData: [{ hole: 1, par: 4 }, { hole: 2, par: 3 }, { hole: 3, par: 5 }],
        moneyPool: { enabled: true, buyIn: 20, kp: { amount: 40, holes: [2, 3] }, longDrive: { holes: [3], allowRough: false }, skins: { mode: 'remainder', scoring: 'net', carryOver: true } },
        scores: {}
    }, extra || {});
}

// ---- 1. pure ------------------------------------------------------------------
test('Long Drive holes: moneyPool.longDrive.holes; none when the pool is off or KP is cancelled; pays only as a KP hole with KP money', () => {
    assert.deepEqual(LD.ldHoles(round()), [3]);
    assert.equal(LD.isLdHole(round(), 3), true);
    assert.equal(LD.isLdHole(round(), 2), false);
    assert.deepEqual(LD.ldHoles(round({ moneyPool: { enabled: false, longDrive: { holes: [3] } } })), []);
    assert.deepEqual(LD.ldHoles(round({ kpCancelled: { cancelled: true } })), []);
    assert.equal(LD.pays(round(), 3), true);
    assert.equal(LD.pays(round({ moneyPool: { enabled: true, kp: { amount: 0, holes: [3] }, longDrive: { holes: [3] } } }), 3), false);
    assert.equal(LD.pays(round({ moneyPool: { enabled: true, kp: { amount: 20, holes: [2] }, longDrive: { holes: [3] } } }), 3), false);
});
test('distance math: haversine from the tee, whole yards', () => {
    assert.equal(LD.driveYards(TEE, north(260)), 260);
    assert.equal(LD.driveYards(TEE, north(0, 300)), 300);
    assert.equal(LD.driveYards(TEE, BALL_FW), 260);
    // 3-4-5: 240 out and 100 across is 260 yds
    assert.equal(LD.driveYards(TEE, north(240, 100)), 260);
});
test('fairway check: in the OSM polygon = fairway; outside = rough; within 25 yds of the saved line = fairway; no fairway data = nomap', () => {
    assert.equal(LD.lieOf(BALL_FW, [FAIRWAY], null), 'fairway');
    assert.equal(LD.lieOf(BALL_RGH, [FAIRWAY], null), 'rough');
    assert.equal(LD.lieOf(BALL_RGH, [FAIRWAY], LINE), 'rough', '40 yds off the line is rough');
    assert.equal(LD.lieOf(BALL_NEAR_LINE, [FAIRWAY], null), 'rough');
    assert.equal(LD.lieOf(BALL_NEAR_LINE, [FAIRWAY], LINE), 'fairway', '22 yds off the saved line');
    assert.equal(LD.lieOf(BALL_NEAR_LINE, null, LINE), 'fairway');
    assert.equal(LD.lieOf(north(260, 26), null, LINE), 'rough', '26 yds off the line');
    assert.equal(LD.lieOf(BALL_FW, null, null), 'nomap');
    assert.equal(LD.lieOf(BALL_FW, [], null), 'nomap');
    assert.equal(LD.lieOf(BALL_FW, [[north(1), north(2)]], null), 'nomap', 'a broken ring is not fairway data');
});
test('the record: yards, lie, accuracy, time, who - nothing else', () => {
    const m = LD.ldMark(260.4, 'fairway', 4, 1792000000000, { name: 'Test Alpha', group: 1 });
    assert.deepEqual(Object.keys(m).sort(), ['accYd', 'at', 'by', 'group', 'kind', 'lie', 'lieBy', 'name', 'yds']);
    assert.equal(m.yds, 260); assert.equal(m.accYd, 4);
});
test('longest wins: rough does not count unless the organizer allows it; no map counts; a tie goes to the earlier mark', () => {
    const mk = (pid, yds, lie, at) => ({ pid, kind: 'ld', yds, lie, at });
    const marks = [mk('1', 262, 'fairway', 10), mk('2', 290, 'rough', 20), mk('3', 255, 'nomap', 30)];
    assert.equal(LD.longest(marks, false).pid, '1');
    assert.equal(LD.longest(marks, true).pid, '2');
    assert.equal(LD.longest([mk('1', 262, 'fairway', 30), mk('4', 262, 'fairway', 10)], false).pid, '4');
    assert.equal(LD.longest([mk('2', 290, 'rough', 20)], false), null);
    const d = round({ ldGps: { h3: { marks: { 1: { kind: 'ld', yds: 262, lie: 'fairway', at: 10 }, 2: { kind: 'ld', yds: 290, lie: 'rough', at: 20 } } } } });
    let v = LD.decide(d, 3);
    assert.equal(v.best.pid, '1'); assert.equal(v.change, true);
    v = LD.decide(Object.assign({}, d, { moneyPool: Object.assign({}, d.moneyPool, { longDrive: { holes: [3], allowRough: true } }) }), 3);
    assert.equal(v.best.pid, '2');
    // typed by hand (the KP block) stands; organizer "nobody" and override block
    assert.equal(LD.decide(Object.assign({}, d, { kpLeaders: { h3: { playerId: '4', distanceInches: null } }, kpWinners: { h3: '4' } }), 3).blocked, 'typed');
    assert.equal(LD.decide(Object.assign({}, d, { kpNoWinner: { h3: true } }), 3).blocked, 'nobody');
    assert.equal(LD.decide(Object.assign({}, d, { ldGps: { h3: Object.assign({}, d.ldGps.h3, { override: { playerId: '2' } }) } }), 3).best.pid, '2');
});

// ---- the page: index.html's own KP writers + the files, every write recorded ----------
function page(data, opts) {
    const o = opts || {};
    const writes = [], stores = [], flashes = [];
    const rec = (kind) => (p, v) => { writes.push({ kind, path: p, v: JSON.parse(JSON.stringify(v === undefined ? null : v)) }); return Promise.resolve(); };
    let pushN = 0;
    const db = { ref: (p) => ({ update: (v) => rec('update')(p, v), set: (v) => rec('set')(p, v), remove: () => rec('remove')(p, null), push: () => ({ key: '-push' + (++pushN) }), once: () => Promise.resolve({ val: () => null }) }) };
    const storage = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { stores.push({ k, v: String(v) }); m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; };
    const sb = {
        console, Math, Date, JSON, Object, Array, String, Number, isFinite, isNaN, parseInt, parseFloat, Promise, Error, RegExp,
        setTimeout: (f) => { f(); return 0; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
        localStorage: storage(), sessionStorage: storage(),
        currentData: data, currentMode: 'TLD045', db,
        hasGroupLock: o.group != null, lockedGroup: o.group != null ? o.group : null,
        durableWrite: (p, type, v, key) => { writes.push({ kind: 'durable:' + type, path: p, key, v: JSON.parse(JSON.stringify(v)) }); return Promise.resolve(); },
        playerGroupOf: (id) => (Number(id) <= 2 ? 1 : 2),
        renderKpEntryMount: () => {}, uiFail: (m) => flashes.push('fail:' + m), uiRefuse: (m) => flashes.push('refuse:' + m), uiToast: (m) => flashes.push(m),
        hasOrganizerAuthority: () => !!o.organizer, canReachSetup: () => false, requireOnlineForMoney: () => true
    };
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext('var kpEntryOpenHole = null;\n' + LIFTED, sb);
    vm.runInContext(GEO_SRC, sb);
    vm.runInContext(MARK_SRC, sb);
    vm.runInContext(LD_SRC, sb);
    let fixNow = null;
    const ctx = (hole, golferId, extra) => Object.assign({ el: null, hole, par: hole === 2 ? 3 : 5, on: true, eventCode: 'TLD045', golfer: { id: golferId, player: data.players.find((p) => p.id === golferId) },
        flash: (t) => flashes.push(t), fix: () => (fixNow ? { pt: fixNow.slice(), acc: 3, at: Date.now() } : null), tee: TEE.slice(), mid: north(520), fairway: [FAIRWAY], savedLine: null }, extra || {});
    return {
        sb, writes, stores, flashes, M: sb.HardPanMark, L: sb.HardPanGpsLd,
        at: (hole, golferId, extra) => sb.HardPanMark.sync(ctx(hole, golferId, extra)),
        stand: (pt) => { fixNow = pt; },
        tap: () => sb.HardPanMark.tap()
    };
}

// ---- 2. the existing KP flow --------------------------------------------------------------
test('Mark my drive: the button on the Long Drive hole only; 260 yds in the fairway -> saveKpLeader writes kpLeaders + kpWinners in ONE update', () => {
    const d = round();
    const P = page(d, { group: 1 });
    P.at(2, 1);
    assert.notEqual(P.M.active(), 'ld', 'not on the par 3 (a KP hole)');
    P.at(1, 1);
    assert.equal(P.M.active(), null, 'not on a hole with no game');
    P.at(3, 1);
    assert.equal(P.M.active(), 'ld');
    P.stand(BALL_FW); P.tap();
    const mark = d.ldGps.h3.marks['1'];
    assert.equal(mark.yds, 260); assert.equal(mark.lie, 'fairway');
    const kp = P.writes.find((w) => w.v['kpWinners/h3'] !== undefined);
    assert.ok(kp, 'the KP write');
    assert.equal(kp.key, 'kp:TLD045:h3', 'saveKpLeader\'s own queue key');
    assert.equal(kp.v['kpWinners/h3'], '1');
    assert.equal(kp.v['kpLeaders/h3'].playerId, '1');
    assert.ok('kpLeaders/h3' in kp.v && 'kpWinners/h3' in kp.v, 'both keys in one update');
    assert.equal(d.kpGroupAnswers.h3.g1.answer, '1', 'the group\'s KP question is answered');
    assert.equal(P.L.leaderYards(d, 3), 260);
});
test('a longer drive in the rough does not take it; a longer fairway drive does; rough counts when the organizer allows', () => {
    const d = round();
    const P = page(d, { group: 1 });
    P.at(3, 1); P.stand(BALL_FW); P.tap();
    P.at(3, 2); P.stand(BALL_RGH); P.tap();
    assert.equal(d.ldGps.h3.marks['2'].lie, 'rough');
    assert.equal(d.ldGps.h3.marks['2'].yds, 278);
    assert.equal(d.kpWinners.h3, '1', 'rough does not count');
    P.at(3, 2); P.stand(north(285, -3)); P.tap();
    assert.equal(d.kpWinners.h3, '2', 'the longer fairway drive wins');
    assert.equal(d.kpLeaders.h3.playerId, '2');
    // the organizer turns on "Rough counts"
    const O = page(d, { organizer: true });
    O.at(3, 1);
    d.ldGps.h3.marks['1'] = Object.assign({}, d.ldGps.h3.marks['1'], { yds: 300, lie: 'rough' });
    assert.equal(O.L.setAllowRough(true), true);
    assert.equal(d.moneyPool.longDrive.allowRough, true);
    assert.equal(d.kpWinners.h3, '1');
    const w = O.writes.find((x) => x.path === 'events/TLD045/moneyPool/longDrive');
    assert.deepEqual(w.v, { allowRough: true });
});
test('the organizer calls the leader\'s drive rough: the next counting drive takes it; nobody left clears the GPS winner; logged', () => {
    const d = round();
    const P = page(d, { group: 1 });
    P.at(3, 1); P.stand(BALL_FW); P.tap();
    P.at(3, 2); P.stand(north(250, 0)); P.tap();
    assert.equal(d.kpWinners.h3, '1');
    const O = page(d, { organizer: true });
    O.at(3, 1);
    assert.equal(O.L.setLie(3, '1', 'rough'), true);
    assert.equal(d.kpWinners.h3, '2');
    assert.equal(d.ldGps.h3.marks['1'].lieBy, 'organizer');
    O.L.setLie(3, '2', 'rough');
    assert.equal(d.kpWinners.h3, undefined, 'no counting drive: the GPS winner is cleared');
    assert.equal(d.kpLeaders.h3, undefined);
    const clr = O.writes.find((w) => w.v['kpWinners/h3'] === null);
    assert.ok(clr && 'kpLeaders/h3' in clr.v, 'cleared with both keys in one update');
    const acts = Object.keys(d.ldGpsLog).map((k) => d.ldGpsLog[k].action);
    assert.ok(acts.includes('lie-rough'));
    // override and back
    O.L.override(3, '2');
    assert.equal(d.kpWinners.h3, '2');
    assert.equal(LD.decide(d, 3).blocked, 'override');
    O.L.clearOverride(3);
    assert.equal(d.kpWinners.h3, undefined);
});
test('refusals: no tee, still on the tee, way past the hole, another group\'s golfer', () => {
    const d = round();
    const P = page(d, { group: 1 });
    P.at(3, 1, { tee: null }); P.stand(BALL_FW); P.tap();
    assert.ok(P.flashes.some((f) => /No tee/.test(f)));
    P.at(3, 1); P.stand(north(20)); P.tap();
    assert.ok(P.flashes.some((f) => /walk to your ball/.test(f)));
    P.at(3, 1); P.stand(north(600)); P.tap();
    assert.ok(P.flashes.some((f) => /are you on hole 3/.test(f)));
    P.at(3, 3); P.stand(BALL_FW); P.tap();
    assert.ok(P.flashes.some((f) => /your group/.test(f)));
    assert.equal((d.ldGps || {}).h3, undefined, 'nothing recorded');
});
test('payout via the EXISTING KP engine: pool-engine.js pays the Long Drive hole\'s KP share to the longest drive', () => {
    const d = round({ scores: {} });
    d.courseData = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: i === 2 ? 5 : (i === 1 ? 3 : 4), hcpIndex: i + 1 }));
    d.players.forEach((p) => { p.hcp = '10'; p.playingForMoney = true; d.courseData.forEach((h) => { d.scores['p' + p.id + '_h' + h.hole] = 4 + (p.id % 2); }); });
    d.settlementMode = 'whole-dollar'; d.gameFormat = 'stroke';
    const P = page(d, { group: 1 });
    P.at(3, 1); P.stand(BALL_FW); P.tap();
    P.at(3, 2); P.stand(north(250)); P.tap();
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN, parseInt, parseFloat, Date, Set };
    vm.createContext(sb);
    ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js', 'pool-engine.js', 'settlement-engine.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }));
    const r = sb.computeMoneyPool(JSON.parse(JSON.stringify(d)), d.courseData, d.scores);
    const line = r.kp.lines.find((l) => l.hole === 3);
    assert.equal(line.state, 'paid');
    assert.equal(line.winnerId, '1');
    assert.equal(line.cents, 2000, '$40 KP money over 2 holes (KP 2 + Long Drive 3) = $20');
});

// ---- 4. the guard ----------------------------------------------------------------------
test('GUARD: a whole Long Drive hole (fairway, rough, organizer calls, override) writes no latitude, no longitude, no point', () => {
    const d = round();
    const P = page(d, { group: 1 });
    P.at(3, 1); P.stand(BALL_FW); P.tap();
    P.at(3, 2); P.stand(BALL_RGH); P.tap();
    P.at(3, 2); P.stand(BALL_NEAR_LINE); P.at(3, 2, { savedLine: LINE }); P.tap();
    const O = page(d, { organizer: true });
    O.at(3, 1); O.L.setLie(3, '1', 'rough'); O.L.setAllowRough(true); O.L.override(3, '2'); O.L.clearOverride(3);
    const all = P.writes.concat(O.writes).concat(P.stores.map((s) => ({ path: 'storage:' + s.k, v: s.v }))).concat(O.stores.map((s) => ({ path: 'storage:' + s.k, v: s.v })));
    assert.ok(all.length >= 10, 'the flow wrote (' + all.length + ')');
    const coords = [TEE, BALL_FW, BALL_RGH, BALL_NEAR_LINE].flat();
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
        Object.keys(v).forEach((k) => { if (/(^|\/)(lat|lng|lon|latitude|longitude|pt|coords|pos|position|point|ball|tee)$/i.test(k)) bad.push(where + '.' + k); walk(v[k], where + '.' + k); });
    };
    all.forEach((w, i) => { walk(w.v, '#' + i + ' ' + w.path); walk(w.path, '#' + i + ' path'); });
    assert.deepEqual(bad, [], 'no position anywhere');
    // positive: the guard saw the marks
    assert.ok(all.some((w) => w.v && typeof w.v === 'object' && Object.keys(w.v).some((k) => /^ldGps\/h3\/marks\/1$/.test(k))), 'the mark write was seen');
    P.writes.concat(O.writes).forEach((w) => {
        if (w.path === 'events/TLD045/moneyPool/longDrive') { assert.deepEqual(Object.keys(w.v), ['allowRough']); return; }
        assert.equal(w.path, 'events/TLD045');
        Object.keys(w.v).forEach((k) => assert.match(k, /^(kpLeaders|kpWinners|kpGroupAnswers|ldGps|ldGpsLog)\//, k));
    });
});
test('GUARD (source): gps-longdrive.js sends and stores nothing itself and reads no location itself', () => {
    const code = LD_SRC.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|\.setItem\(/);
    assert.doesNotMatch(code, /navigator\.geolocation/);
    assert.match(LD_SRC, /u\['ldGps\/h' \+ h \+ '\/marks\/' \+ g\.id\] = mark;/, 'positive: the one mark write');
    assert.match(LD_SRC, /var mark = ldMark\(res\.yds, res\.extra\.lie, res\.extra\.accM, Date\.now\(\), g\);/);
    // measure() hands back yards + lie only (no point in its result)
    assert.match(LD_SRC, /return \{ yds: yds, ft: null, extra: \{ lie: lie, accM: pos\.acc, golfer: g \} \};/);
});
test('no money engine reads the new records; no money engine changed on this branch', () => {
    for (const f of ['money-engine.js', 'settlement-engine.js', 'pool-engine.js', 'payouts.js', 'match-engine.js']) {
        const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
        assert.doesNotMatch(s, /ldGps|longDrive/, f);
        assert.match(s, /function /, f + ' (positive: read)');
    }
});

// ---- 5. + Bet > Long Drive, the Weekly Game sheet --------------------------------------
test('wiring: index.html only LOADS gps-longdrive.js (inside the GPS block, before the Mark button); the KP words are changed from the GPS file; sw.js lists it', () => {
    const tag = IDX.indexOf('<script src="gps-longdrive.js"></script>');
    assert.ok(tag > -1);
    assert.ok(IDX.lastIndexOf('<!-- GPS:BEGIN -->', tag) > IDX.lastIndexOf('<!-- GPS:END -->', tag), 'inside a GPS block');
    assert.doesNotMatch(IDX, /HardPanGpsLd|kpLdWord/, 'no Long Drive code in index.html itself');
    assert.match(LD_SRC, /wrapAfter\('renderKpEntryMount'/);
    assert.match(LD_SRC, /wrapAfter\('renderKpForcedModal'/);
    assert.match(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), /'\.\/gps-longdrive\.js'/);
    const bet = fs.readFileSync(path.join(ROOT, 'gps-bet.js'), 'utf8');
    assert.match(bet, /data-hb="longdrive"/);
    assert.match(bet, /openWeekly\(\{ turnOn: true, longDrive: true, returnTo: rtl \}\)/);
    assert.equal(LD.holeWord(round(), 3), 'Long Drive');
    assert.equal(LD.holeWord(round(), 2), null);
});
