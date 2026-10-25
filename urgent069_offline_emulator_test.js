// ============================================================================
// 069 C - THE CREATE-ONLY TRANSACTION AGAINST A REAL DATABASE: the Firebase Realtime Database EMULATOR
// (local, port 9078, nothing live), the app's own Firebase web SDK (firebase-*-compat.js), and the
// ruleset that is live (database.rules.push.json - see owner_delete_rules_test.js; one e-mail regex the
// emulator cannot parse is loosened in the emulator's copy only, outside events/).
//
//   1  an offline round with 4 holes, synced: the organizer gate, then ONE transaction - the rules
//      accept it (ownerUid === auth.uid, the organizer window), the round and its 16 scores are there,
//      and nothing was ever written under the L- code
//   2  the app killed while offline (a new SDK instance over the same storage), then signal: synced
//   3  a CODE CLASH: an unrelated round holds the group's code - untouched; the round lands elsewhere
//   4  TWO PHONES, the same group, two users: two rounds, never merged; the second knows the first's code
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
const GPS = fs.existsSync(path.join(__dirname, 'offline-round.js'));
const SKIP = !GPS ? { skip: 'Consumer tree' } : (!fs.existsSync(JAR) || !JAVA) ? { skip: 'no RTDB emulator on this machine' } : {};
const PORT = 9078, NS = 'demo-hp069-' + process.pid, BASE = 'http://127.0.0.1:' + PORT;
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let emu = null;
const rest = (p, opts) => fetch(BASE + '/' + p + '.json?ns=' + NS, Object.assign({ headers: { Authorization: 'Bearer owner' } }, opts || {})).then((r) => r.json());

function phone(mem, uid) {
    const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(String(k), String(v)), removeItem: (k) => mem.delete(String(k)), key: (i) => [...mem.keys()][i], get length() { return mem.size; } };
    const events = [];
    const sb = { console, setTimeout, clearTimeout, setInterval, clearInterval, WebSocket, fetch, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, Uint8Array, Promise, JSON, Math, Date, Object, Array,
        navigator: { onLine: true, userAgent: 'node' }, localStorage: store, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        location: { protocol: 'http:', hostname: 'localhost', href: 'http://localhost/home.html', search: '', pathname: '/home.html' },
        addEventListener() {}, removeEventListener() {}, dispatchEvent(ev) { events.push(ev); return true; },
        CustomEvent: function (n, i) { this.type = n; this.detail = i && i.detail; }, authReady: Promise.resolve(uid) };
    sb.window = sb; sb.self = sb; sb.globalThis = sb;
    vm.createContext(sb);
    ['firebase-app-compat.js', 'firebase-database-compat.js', 'code-issuer.js', 'offline-queue.js', 'organizer-gate.js', 'front-door.js', 'offline-round.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    vm.runInContext("firebase.initializeApp({ databaseURL: '" + BASE + "?ns=" + NS + "', projectId: '" + NS + "', apiKey: 'x' }); var __d = firebase.database(); __d.useEmulator('127.0.0.1', " + PORT + ", { mockUserToken: { sub: '" + uid + "' } }); window.db = firebase.database();", sb);
    sb.events = events;
    sb.close = () => { try { vm.runInContext('firebase.app().delete()', sb); } catch (e) {} };
    return sb;
}
const NAMES = ['Test Ann', 'Test Bob', 'Test Cal', 'Test Dee'];
const ROUND = (course) => ({ courseName: course || 'Papago Golf Club', activeCourseKey: course ? 'test_' + course.length : 'gapi_012141520636857668694', gameFormat: 'stroke', roundDay: 'Test 069',
    courseData: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 })), players: NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: String(i * 4) })) });
function startOffline(P, holes, course) {
    const L = P.HardPanOfflineRound.newCode();
    assert.ok(P.HardPanDoors.holdRound(L, ROUND(course), { exists: false }));
    for (let h = 1; h <= holes; h++) for (let i = 0; i < 4; i++) {
        const k = 'events/' + L + '/scores/p' + (101 + i) + '_h' + h;
        P.OfflineQueue.enqueue(P.localStorage, { path: k, type: 'set', value: 4 + ((i + h) % 3), coalesceKey: k });
    }
    return L;
}
const phones = [];

describe('069 C: the create-only transaction, on the emulator with the live rules', SKIP, () => {
    before(async () => {
        emu = spawn(JAVA, ['-jar', JAR, '--port', String(PORT)], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/.json?ns=' + NS); break; } catch (e) { await wait(500); } }
        const rules = read('database.rules.push.json').replace(/\[\^@\\\\s\]/g, '[^@ ]');
        const r = await fetch(BASE + '/.settings/rules.json?ns=' + NS, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rules }).then((x) => x.json());
        assert.equal(r.status, 'ok', JSON.stringify(r));
    });
    after(() => { phones.forEach((p) => p.close()); if (emu) emu.kill('SIGKILL'); });

    test('an offline round with 4 holes, synced: one transaction the live rules accept; nothing under L-', { timeout: 60000 }, async () => {
        const P = phone(new Map(), 'uid-a1'); phones.push(P);
        const L = startOffline(P, 4);
        const res = await P.HardPanOfflineRound.sync(P.db);
        assert.equal(res.length, 1, JSON.stringify(P.events.map((e) => [e.type, e.detail])));
        const r = await rest('events/' + res[0].to);
        assert.equal(r.ownerUid, 'uid-a1');
        assert.equal(r.players.length, 4);
        assert.equal(Object.keys(r.scores).length, 16);
        assert.equal(r.offlineStart.from, L);
        assert.equal(res[0].holes, 4);
        assert.equal(await rest('events/' + L), null, 'never written under the local code');
        assert.ok((await rest('organizers/uid-a1/firstSeenAt')) > 0, 'the organizer gate ran first');
    });

    test('the app killed while offline, then signal: synced from the stored queue', { timeout: 60000 }, async () => {
        const mem = new Map();
        let P = phone(mem, 'uid-k'); P.navigator.onLine = false;
        const L = startOffline(P, 3);
        assert.equal(await P.HardPanOfflineRound.sync(P.db), null, 'nothing while offline');
        P.close();
        P = phone(mem, 'uid-k'); phones.push(P);   // reopened, signal back
        const res = await P.HardPanOfflineRound.sync(P.db);
        const r = await rest('events/' + res[0].to);
        assert.equal(Object.keys(r.scores).length, 12);
        assert.equal(r.offlineStart.from, L);
        assert.equal(mem.get('lastRoomCode'), res[0].to);
    });

    test('a CODE CLASH: the group\'s code is an unrelated round - untouched; the round lands elsewhere', { timeout: 60000 }, async () => {
        const P = phone(new Map(), 'uid-c'); phones.push(P);
        startOffline(P, 2, 'Clash Course');
        const op = JSON.parse(P.localStorage.getItem('golfapp_wq_v1'))[0];
        const first = P.HardPanOfflineRound.keyCode(P.HardPanOfflineRound.groupKey(op.value, op.ts));
        const other = { ownerUid: 'uid-someone', players: [{ id: 1, name: 'Someone Else' }], courseName: 'Elsewhere' };
        await rest('events/' + first, { method: 'PUT', body: JSON.stringify(other) });
        const res = await P.HardPanOfflineRound.sync(P.db);
        assert.notEqual(res[0].to, first);
        assert.deepEqual(await rest('events/' + first), other, 'untouched');
        assert.ok(P.events.some((e) => e.type === 'hardpan:offline-clash' && e.detail.code === first));
        assert.equal(Object.keys((await rest('events/' + res[0].to)).scores).length, 8);
    });

    test('TWO PHONES, the same group, two users: two rounds, never merged; the second knows the first', { timeout: 60000 }, async () => {
        const A = phone(new Map(), 'uid-pa'), B = phone(new Map(), 'uid-pb'); phones.push(A, B);
        startOffline(A, 4, 'Two Phones Course'); startOffline(B, 1, 'Two Phones Course');
        const ra = (await A.HardPanOfflineRound.sync(A.db))[0];
        const rb = (await B.HardPanOfflineRound.sync(B.db))[0];
        assert.notEqual(ra.to, rb.to);
        assert.equal(rb.theirs.code, ra.to);
        const a = await rest('events/' + ra.to), b = await rest('events/' + rb.to);
        assert.equal(Object.keys(a.scores).length, 16);
        assert.equal(Object.keys(b.scores).length, 4);
        assert.equal(a.ownerUid, 'uid-pa'); assert.equal(b.ownerUid, 'uid-pb');
    });
});
