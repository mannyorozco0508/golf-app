// ============================================================================
// 073 - END ROUND, DON'T SAVE, AGAINST A REAL DATABASE: the Firebase Realtime Database EMULATOR (local,
// port 9173, nothing live), the app's own Firebase web SDK, and the ruleset that IS live - the Oct 20
// publish's read-back, database.rules.layout-base.json (claude-code-reports/026/rules-deploy/
// live-after-2026-10-20.json, byte-identical). One e-mail regex the emulator cannot parse is loosened
// in the emulator's copy only, outside events/ (as urgent069_offline_emulator_test.js does).
//
// Each "phone" is a vm sandbox with the app's real files: the SDK, offline-queue, organizer-gate,
// front-door, offline-round, hp-index, gps-shot-log, gps-stats and gps-round (the Round Menu's End round).
//   1  the ask: the exact words; Keep playing does nothing (no write, nothing on the phone changes)
//   2  a solo round: one ask, then the round is gone from the server and from the phone - History copy,
//      queue, Resume, stats / SG / Index, marked shots, this round's shot-log records - while My bag and
//      every other round's shot-log records are byte-identical, and the OTHER round on the server too
//   3  a group round with a bet: asks twice; "Keep playing" on the second ask deletes nothing
//   4  another golfer: no row, nothing asked; the live rules refuse their delete (control); their phone
//      gets the marker and says "The organizer ended this round.", and after the delete their queued
//      score is refused (a deleted round cannot come back)
//   5  the organizer by link token on another uid: refused BEFORE any write - nothing deleted anywhere
//   6  an offline "L-" round: everything on the phone goes, nothing is ever written to the server;
//      and a sync already on its way when the round was ended takes its landed copy back
// Skipped when the emulator jar or Java is not on this machine.
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const JAR = path.join(os.homedir(), '.cache', 'firebase', 'emulators', 'firebase-database-emulator-v4.11.2.jar');
const JAVA = [process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java'), path.join(os.homedir(), 'jdks', 'jdk-21.0.12.1+1', 'Contents', 'Home', 'bin', 'java'), '/usr/bin/java']
    .filter(Boolean).find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
const GPS = fs.existsSync(path.join(__dirname, 'gps-round.js')) && fs.existsSync(path.join(__dirname, 'offline-round.js'));
const SKIP = !GPS ? { skip: 'Consumer tree' } : (!fs.existsSync(JAR) || !JAVA) ? { skip: 'no RTDB emulator on this machine' } : {};
const PORT = 9173, NS = 'demo-hp073-' + process.pid, BASE = 'http://127.0.0.1:' + PORT;
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let emu = null;
const rest = (p, opts) => fetch(BASE + '/' + p + '.json?ns=' + NS, Object.assign({ headers: { Authorization: 'Bearer owner' } }, opts || {})).then((r) => r.json());
const put = (p, v) => rest(p, { method: 'PUT', body: JSON.stringify(v) });

// The smallest document gps-round.js needs to boot and to draw its one notice.
function fakeDocument() {
    const els = {};
    function el(tag) {
        const e = { tagName: String(tag).toUpperCase(), style: {}, children: [], attrs: {}, id: '', textContent: '', _html: '', handlers: {},
            classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c, on) { if (on === undefined ? !this._s.has(c) : on) this._s.add(c); else this._s.delete(c); } },
            setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') { this.id = v; els[v] = this; } }, getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
            appendChild(c) { this.children.push(c); if (c.id) els[c.id] = c; return c; }, insertBefore(c) { return this.appendChild(c); },
            addEventListener(n, f) { this.handlers[n] = f; }, removeEventListener() {},
            querySelector(sel) { const m = /^\[([a-z-]+)\]$/.exec(sel); if (!m || this._html.indexOf(m[1]) < 0) return null; this._q = this._q || {}; return this._q[sel] = this._q[sel] || { onclick: null }; },
            querySelectorAll() { return []; }, getBoundingClientRect() { return { width: 0, height: 0 }; }
        };
        Object.defineProperty(e, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); this._q = {}; } });
        Object.defineProperty(e, 'innerText', { get() { return this._html.replace(/<[^>]+>/g, '\n').replace(/\n+/g, '\n').trim(); } });
        return e;
    }
    const doc = { readyState: 'complete', head: el('head'), body: el('body'), documentElement: el('html'),
        createElement: el, getElementById: (id) => els[id] || null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
    const add = doc.body.appendChild.bind(doc.body);
    doc.body.appendChild = (c) => { if (c.id) els[c.id] = c; return add(c); };
    const addH = doc.head.appendChild.bind(doc.head);
    doc.head.appendChild = (c) => { if (c.id) els[c.id] = c; return addH(c); };
    doc._els = els;
    return doc;
}

function phone(mem, uid, answers) {
    const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(String(k), String(v)), removeItem: (k) => mem.delete(String(k)), key: (i) => [...mem.keys()][i], get length() { return mem.size; } };
    const smem = new Map();
    const session = { getItem: (k) => (smem.has(k) ? smem.get(k) : null), setItem: (k, v) => smem.set(String(k), String(v)), removeItem: (k) => smem.delete(String(k)), key: (i) => [...smem.keys()][i], get length() { return smem.size; } };
    const asked = [], fails = [];
    const loc = { protocol: 'http:', hostname: 'localhost', href: 'http://localhost/index.html', search: '', pathname: '/index.html', replace(u) { this.href = u; }, reload() {} };
    const sb = { console, setTimeout, clearTimeout, setInterval, clearInterval, WebSocket, fetch, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, Uint8Array, Promise, JSON, Math, Date, Object, Array,
        navigator: { onLine: true, userAgent: 'node' }, localStorage: store, sessionStorage: session, location: loc, document: fakeDocument(),
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
        CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; }, authReady: Promise.resolve(uid),
        authBootState: { status: 'signed-in', uid: uid },
        uiConfirm: (o) => { asked.push(o); return Promise.resolve(answers.length ? answers.shift() : false); },
        uiFail: (m) => { fails.push(m); } };
    sb.window = sb; sb.self = sb; sb.globalThis = sb;
    vm.createContext(sb);
    ['firebase-app-compat.js', 'firebase-database-compat.js', 'code-issuer.js', 'offline-queue.js', 'organizer-gate.js', 'front-door.js', 'offline-round.js',
        'hp-index.js', 'gps-shot-log.js', 'gps-stats.js', 'gps-round.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    vm.runInContext("firebase.initializeApp({ databaseURL: '" + BASE + "?ns=" + NS + "', projectId: '" + NS + "', apiKey: 'x' }); var __d = firebase.database(); __d.useEmulator('127.0.0.1', " + PORT + ", { mockUserToken: { sub: '" + uid + "' } }); var db = firebase.database(); window.db = db;"
        + ' var currentMode = null, currentData = null, __org = false; function canReachSetup() { return __org; }', sb);
    sb.asked = asked; sb.fails = fails;
    sb.open = (code, data, org) => { vm.runInContext('currentMode = ' + JSON.stringify(code) + '; currentData = ' + JSON.stringify(data) + '; __org = ' + !!org + ';', sb); };
    sb.close = () => { try { vm.runInContext('firebase.app().delete()', sb); } catch (e) {} };
    return sb;
}
const holes = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
function roundOf(owner, names, extra) {
    const players = names.map((n, i) => ({ id: 101 + i, name: n, hcp: String(i * 3) }));
    const scores = {}; players.forEach((p) => { for (let h = 1; h <= 3; h++) scores['p' + p.id + '_h' + h] = 4 + ((p.id + h) % 2); });
    return Object.assign({ ownerUid: owner, courseName: 'Papago Golf Club', activeCourseKey: 'papago', gameFormat: 'stroke', eventName: 'Saturday', courseData: holes, players, scores, organizerToken: 'tok-0123456789abcdef' }, extra || {});
}
// What this phone keeps of a round it has played (the shapes the app writes).
function seedPhone(mem, code, data) {
    mem.set('golfapp_snap_v1_' + code, JSON.stringify({ v: 1, at: Date.now(), data: data, meta: null }));
    mem.set('golfapp_me_' + code, '101');
    mem.set('golfapp_role_' + code, 'player');
    mem.set('hardpan_gps_golfer_' + code, '101');
    mem.set('hardpan_last_hole_' + code, '4');
    mem.set('hardpan_shots_v1_' + code, JSON.stringify({ v: 1, code: code, holes: { 1: [{ p: [33.45, -111.95], at: 1 }] } }));
    mem.set('hardpan_qstats_v1_' + code + '_p101', JSON.stringify({ v: 1, holes: { 1: { putts: 2 } } }));
    mem.set('hardpan_stats_v1_' + code, JSON.stringify({ v: 1 }));
    mem.set('hardpan_sg_v1_' + code, JSON.stringify({ v: 1, marks: {} }));
    mem.set('hardpan_last_round', JSON.stringify({ code: code, at: Date.now(), course: 'Papago Golf Club' }));
    mem.set('hardpan_round_side', 'gps|' + code);
    mem.set('lastRoomCode', code);
    const q = JSON.parse(mem.get('golfapp_wq_v1') || '[]');
    q.push({ id: 'q-' + code, v: 1, path: 'events/' + code + '/scores/p101_h4', type: 'set', value: 5, coalesceKey: 'events/' + code + '/scores/p101_h4' });
    mem.set('golfapp_wq_v1', JSON.stringify(q));
    const idx = JSON.parse(mem.get('hardpan_hp_index_v1') || '{"v":1,"rounds":[]}');
    idx.rounds.push({ code: code, at: Date.now(), diff: 10 }); mem.set('hardpan_hp_index_v1', JSON.stringify(idx));
}
// My bag + the shot log: an earlier round's records (no round tag, and one tagged with another round)
// and this round's records (tagged with its code, as 073's mark-chips writes them).
function seedBag(mem, code) {
    mem.set('hardpan_bag_v1', JSON.stringify({ v: 1, golfers: { me: { shots: { '7i': [150, 152, 149] }, set: { Dr: 255 }, alt: { mode: 'sea' } } } }));
    const rec = (club, carry, round, d) => Object.assign({ club, carry, windMph: 3, relAngle: 0, along: 3, across: 0, tempF: 80, elevFt: 0, course: 'Papago Golf Club', hole: 1, date: d, wxHour: null, windFromDeg: 10, bearingDeg: 10, src: 'nws', id: 'id' + d }, round ? { round } : {});
    mem.set('hardpan_shotlog_v1', JSON.stringify({ v: 1, golfers: { me: { shots: [rec('7i', 151, null, 1000), rec('8i', 140, 'OTHER1', 2000), rec('7i', 175, code, 3000), rec('PW', 120, code, 4000)] } } }));
}
const phones = [];
const bagBefore = (mem) => mem.get('hardpan_bag_v1');

describe('073: End round - don\'t save, on the emulator with the LIVE rules', SKIP, () => {
    before(async () => {
        emu = spawn(JAVA, ['-jar', JAR, '--port', String(PORT)], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/.json?ns=' + NS); break; } catch (e) { await wait(500); } }
        const rules = read('database.rules.layout-base.json').replace(/\[\^@\\\\s\]/g, '[^@ ]');
        const r = await fetch(BASE + '/.settings/rules.json?ns=' + NS, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rules }).then((x) => x.json());
        assert.equal(r.status, 'ok', JSON.stringify(r));
    });
    after(() => { phones.forEach((p) => p.close()); if (emu) emu.kill('SIGKILL'); });

    test('1 the ask is word for word; Keep playing does nothing', { timeout: 30000 }, async () => {
        const R = roundOf('uid-o1', ['Ray Ortiz']);
        await put('events/SOLO11', R);
        const mem = new Map(); seedPhone(mem, 'SOLO11', R); seedBag(mem, 'SOLO11');
        const before = JSON.stringify([...mem.entries()]);
        const P = phone(mem, 'uid-o1', [false]); phones.push(P);
        P.open('SOLO11', R, true);
        assert.equal(P.HardPanRound.canEnd(), true);
        const out = await P.HardPanRound.endRoundAsk();
        assert.equal(out, false);
        assert.equal(P.asked.length, 1);
        assert.deepEqual({ title: P.asked[0].title, body: P.asked[0].body, yes: P.asked[0].confirmText, no: P.asked[0].cancelText }, {
            title: 'End this round and delete it?',
            body: 'Scores, stats and shots from this round won’t be saved. This can’t be undone.',
            yes: 'Delete round', no: 'Keep playing' });
        await wait(300);
        assert.deepEqual(await rest('events/SOLO11'), R, 'the server round is untouched');
        assert.equal(JSON.stringify([...mem.entries()]), before, 'nothing on the phone changed');
        assert.equal(P.location.href, 'http://localhost/index.html', 'still on the round');
    });

    test('2 a solo round: one ask, then gone from the server and the phone; My bag and other rounds untouched', { timeout: 40000 }, async () => {
        const R = roundOf('uid-o2', ['Ray Ortiz']);
        const OTHER = roundOf('uid-o2', ['Ray Ortiz', 'Dan Kim'], { sideMatches: { M1: { format: 'match', scoring: 'gross', teamAIds: ['101'], teamBIds: ['102'], startHole: 1, createdAt: 1, stake: 10, pressRule: 'none' } } });
        await put('events/SOLO22', R); await put('events/KEEP22', OTHER);
        const mem = new Map(); seedPhone(mem, 'KEEP22', OTHER); seedPhone(mem, 'SOLO22', R); seedBag(mem, 'SOLO22');
        mem.set('hardpan_caddie_v1', '{"v":1}');
        const keepKeys = [...mem.keys()].filter((k) => k.indexOf('KEEP22') >= 0).map((k) => [k, mem.get(k)]);
        const bag = bagBefore(mem);
        const P = phone(mem, 'uid-o2', [true]); phones.push(P);
        P.open('SOLO22', R, true);
        assert.equal(P.HardPanRound.needsTwice(R), false, 'a solo round with no games asks once');
        assert.equal(await P.HardPanRound.endRoundAsk(), true);
        assert.equal(P.asked.length, 1);
        assert.equal(await rest('events/SOLO22'), null, 'the round is gone from the server');
        assert.deepEqual(await rest('events/KEEP22'), OTHER, 'the other round (and its $10 match) is byte-identical');
        assert.equal(P.location.href, 'home.html');
        // Nothing of SOLO22 is left on the phone except the one-word "never back into My stats" marker.
        const left = [...mem.keys()].filter((k) => k.indexOf('SOLO22') >= 0);
        assert.deepEqual(left, ['hardpan_nostats_SOLO22']);
        assert.equal(mem.get('hardpan_nostats_SOLO22'), 'removed');
        const q = JSON.parse(mem.get('golfapp_wq_v1'));
        assert.deepEqual(q.map((o) => o.path), ['events/KEEP22/scores/p101_h4'], 'only the other round’s queued score is left');
        assert.equal(mem.get('hardpan_last_round'), undefined); assert.equal(mem.get('hardpan_round_side'), undefined); assert.equal(mem.get('lastRoomCode'), undefined);
        assert.deepEqual(JSON.parse(mem.get('hardpan_hp_index_v1')).rounds.map((r) => r.code), ['KEEP22']);
        // My bag: byte-identical. Shot log: this round's two records gone, the earlier rounds' two exactly as they were.
        assert.equal(mem.get('hardpan_bag_v1'), bag);
        const log = JSON.parse(mem.get('hardpan_shotlog_v1')).golfers.me.shots;
        assert.deepEqual(log.map((s) => s.id), ['id1000', 'id2000']);
        assert.deepEqual(log[0], { club: '7i', carry: 151, windMph: 3, relAngle: 0, along: 3, across: 0, tempF: 80, elevFt: 0, course: 'Papago Golf Club', hole: 1, date: 1000, wxHour: null, windFromDeg: 10, bearingDeg: 10, src: 'nws', id: 'id1000' });
        assert.equal(mem.get('hardpan_caddie_v1'), '{"v":1}');
        keepKeys.filter(([k]) => k !== 'golfapp_wq_v1').forEach(([k, v]) => assert.equal(mem.get(k), v, k + ' untouched'));
    });

    test('3 a group round with a bet asks twice; Keep playing on the second ask deletes nothing; yes twice deletes', { timeout: 40000 }, async () => {
        const R = roundOf('uid-o3', ['Ray Ortiz', 'Dan Kim', 'Luis Vega'], { sideMatches: { M1: { format: 'match', scoring: 'gross', teamAIds: ['101'], teamBIds: ['102'], startHole: 1, createdAt: 1, stake: 10, pressRule: 'none' } } });
        await put('events/GRP333', R);
        const mem = new Map(); seedPhone(mem, 'GRP333', R);
        const before = JSON.stringify([...mem.entries()]);
        const P = phone(mem, 'uid-o3', [true, false]); phones.push(P);
        P.open('GRP333', R, true);
        assert.equal(P.HardPanRound.needsTwice(R), true);
        assert.equal(await P.HardPanRound.endRoundAsk(), false);
        assert.equal(P.asked.length, 2);
        assert.equal(P.asked[1].title, 'Delete it for everyone?');
        assert.equal(P.asked[1].confirmText, 'Delete for everyone'); assert.equal(P.asked[1].cancelText, 'Keep playing');
        assert.match(P.asked[1].body, /2 other golfers and games or bets/);
        assert.deepEqual(await rest('events/GRP333'), R); assert.equal(JSON.stringify([...mem.entries()]), before);
        // Golfers only (no bet) also ask twice; games only (a solo round with skins) too.
        assert.equal(P.HardPanRound.needsTwice(roundOf('x', ['A b', 'C d'])), true);
        assert.equal(P.HardPanRound.needsTwice(roundOf('x', ['A b'], { skinsBuyIn: 5 })), true);
        const P2 = phone(mem, 'uid-o3', [true, true]); phones.push(P2);
        P2.open('GRP333', R, true);
        assert.equal(await P2.HardPanRound.endRoundAsk(), true);
        assert.equal(P2.asked.length, 2);
        assert.equal(await rest('events/GRP333'), null);
    });

    test('4 another golfer: no row, never asked, the live rules refuse their delete; their phone hears "The organizer ended this round."', { timeout: 40000 }, async () => {
        const R = roundOf('uid-o4', ['Ray Ortiz', 'Dan Kim']);
        await put('events/OTH444', R);
        const memB = new Map(); seedPhone(memB, 'OTH444', R);
        const B = phone(memB, 'uid-b4', [true, true]); phones.push(B);
        B.open('OTH444', R, false);
        assert.equal(B.HardPanRound.canEnd(), false, 'no row for another golfer');
        assert.equal(await B.HardPanRound.endRoundAsk(), false); assert.equal(B.asked.length, 0, 'never asked');
        // CONTROL: the live rules refuse a non-owner's delete outright.
        const denied = await vm.runInContext('db.ref("events/OTH444").remove().then(function(){return "ok";}, function(e){return String(e && e.message);})', B);
        assert.match(denied, /permission_denied/i);
        assert.deepEqual(await rest('events/OTH444'), R);
        // B listens like the scorecard (index.html calls endedCheck with every copy the server sends).
        vm.runInContext('db.ref("events/OTH444").on("value", function (s) { window.__lastEnded = HardPanRound.endedCheck("OTH444", s.val()) || window.__lastEnded || false; });', B);
        await wait(800);
        assert.equal(B.__lastEnded, false, 'a live round says nothing');
        const memA = new Map(); seedPhone(memA, 'OTH444', R);
        const A = phone(memA, 'uid-o4', [true, true]); phones.push(A);
        A.open('OTH444', R, true);
        assert.equal(await A.HardPanRound.endRoundAsk(), true);
        await wait(1200);
        assert.equal(await rest('events/OTH444'), null);
        assert.equal(B.__lastEnded, true);
        const note = B.document.getElementById('hp-ended-round');
        assert.ok(note && note.style.display === 'flex');
        assert.match(note.innerHTML, /The organizer ended this round\./);
        // A deleted round cannot come back: B's late score is refused by the live rules.
        const late = await vm.runInContext('db.ref("events/OTH444/scores/p102_h4").set(5).then(function(){return "ok";}, function(e){return String(e && e.message);})', B);
        assert.match(late, /permission_denied/i);
        assert.equal(await rest('events/OTH444'), null);
        // Go Home: B's phone forgets the round (its History copy and queued scores).
        note.querySelector('[data-hp-ended-home]').onclick();
        assert.equal(memB.get('golfapp_snap_v1_OTH444'), undefined);
        assert.equal(B.location.href, 'home.html');
    });

    test('5 the organizer by link token on another uid: refused before any write - nothing deleted anywhere', { timeout: 30000 }, async () => {
        const R = roundOf('uid-o5', ['Ray Ortiz', 'Dan Kim']);
        await put('events/TOK555', R);
        const mem = new Map(); seedPhone(mem, 'TOK555', R);
        const before = JSON.stringify([...mem.entries()]);
        const P = phone(mem, 'uid-second-phone', [true, true]); phones.push(P);
        P.open('TOK555', R, true);   // canReachSetup: true (the organizer token)
        assert.equal(await P.HardPanRound.endRoundAsk(), false);
        assert.deepEqual(await rest('events/TOK555'), R, 'no marker, no delete');
        assert.equal(JSON.stringify([...mem.entries()]), before);
        assert.match(P.fails[0], /isn’t signed in as the account that started this round.*Nothing was deleted/);
    });

    test('6 an offline "L-" round: everything on the phone goes, nothing reaches the server; a sync on its way is taken back', { timeout: 60000 }, async () => {
        const mem = new Map(); seedBag(mem, 'X');
        const P = phone(mem, 'uid-o6', [true, true]); phones.push(P);
        const L = P.HardPanOfflineRound.newCode();
        const R = roundOf(undefined, ['Ray Ortiz', 'Dan Kim']); delete R.ownerUid; delete R.organizerToken;
        assert.ok(P.HardPanDoors.holdRound(L, R, { exists: false }));
        P.OfflineQueue.enqueue(P.localStorage, { path: 'events/' + L + '/scores/p101_h1', type: 'set', value: 4, coalesceKey: 'events/' + L + '/scores/p101_h1' });
        mem.set('hardpan_shots_v1_' + L, '{"v":1,"holes":{}}'); mem.set('hardpan_sg_v1_' + L, '{"v":1}');
        const bag = bagBefore(mem);
        P.open(L, R, false);   // not canReachSetup: the held round is what makes this phone its organizer
        assert.equal(P.HardPanRound.canEnd(), true);
        assert.equal(await P.HardPanRound.endRoundAsk(), true);
        assert.equal(P.asked.length, 2, 'two golfers: asked twice');
        assert.deepEqual([...mem.keys()].filter((k) => k.indexOf(L) >= 0), ['hardpan_nostats_' + L]);
        assert.deepEqual(JSON.parse(mem.get('golfapp_wq_v1') || '[]'), []);
        assert.equal(mem.get('hardpan_bag_v1'), bag);
        assert.equal(P.HardPanDoors.heldFor(L), null);
        const synced = await P.HardPanOfflineRound.sync(P.db);
        assert.ok(!synced || synced.length === 0, 'nothing left to sync');
        const all = await rest('events') || {};
        assert.deepEqual(Object.keys(all).filter((k) => all[k] && all[k].offlineStart && all[k].offlineStart.from === L), [], 'never written');

        // A sync already on its way: the round is held, the phone ends it, the transaction lands - taken back.
        const mem2 = new Map();
        const Q = phone(mem2, 'uid-o7', []); phones.push(Q);
        const L2 = Q.HardPanOfflineRound.newCode();
        assert.ok(Q.HardPanDoors.holdRound(L2, R, { exists: false }));
        mem2.set('hardpan_ended_rounds_v1', JSON.stringify({ [L2]: Date.now() }));   // ended while the try was in flight
        const res = await Q.HardPanOfflineRound.sync(Q.db);
        assert.ok(!res || res.length === 0, 'it never moves to a real code');
        await wait(500);
        const all2 = await rest('events') || {};
        assert.deepEqual(Object.keys(all2).filter((k) => all2[k] && all2[k].offlineStart && all2[k].offlineStart.from === L2), [], 'the landed copy was taken back');
        // CONTROL: the same held round, not ended, does land (so the check above proves the take-back).
        const mem3 = new Map();
        const C = phone(mem3, 'uid-o8', []); phones.push(C);
        const L3 = C.HardPanOfflineRound.newCode();
        assert.ok(C.HardPanDoors.holdRound(L3, R, { exists: false }));
        const res3 = await C.HardPanOfflineRound.sync(C.db);
        assert.equal(res3.length, 1);
        const landed = await rest('events/' + res3[0].to);
        assert.equal(landed.offlineStart.from, L3);
    });
});
