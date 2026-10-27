// ============================================================================
// 084 - THE PROPOSED organizers/<uid>/rounds/<code> RULE, ON THE RTDB EMULATOR (local port 9084,
// nothing live). Two namespaces: the LIVE ruleset (database.rules.layout-base.json - read back from
// production on Oct 26 2026 and identical) and database.rules.084-proposed.json (the same + one node).
// Each "phone" is a vm sandbox with the app's own Firebase SDK and my-rounds.js; the pointer is
// written by the app's remember(), not a hand-made write.
//   live     the owner's pointer is REFUSED (control: until the publish the app's writes fail, silently)
//   proposed owner writes + reads own pointers; a trip owner too; a round you don't own is refused;
//            another uid can neither read nor write your list; shape is held (fields, code, size);
//            deleting your own pointer works; the round itself and its save are unchanged.
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

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const JAR = path.join(os.homedir(), '.cache', 'firebase', 'emulators', 'firebase-database-emulator-v4.11.2.jar');
const JAVA = [process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java'), path.join(os.homedir(), 'jdks', 'jdk-21.0.12.1+1', 'Contents', 'Home', 'bin', 'java'), '/usr/bin/java']
    .filter(Boolean).find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
const HAVE = fs.existsSync(path.join(__dirname, 'database.rules.084-proposed.json')) && fs.existsSync(path.join(__dirname, 'database.rules.layout-base.json'));
const SKIP = !HAVE ? { skip: 'no 084 proposal in this tree' } : (!fs.existsSync(JAR) || !JAVA) ? { skip: 'no RTDB emulator on this machine' } : {};
const PORT = 9084, BASE = 'http://127.0.0.1:' + PORT;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The emulator cannot parse one e-mail regex in events/ - loosened in the emulator's copy only (as 074).
const emuRules = (s) => JSON.stringify(JSON.parse(s)).replace(/\[\^@\\\\s\]/g, '[^@ ]');
const admin = (ns, p, method, body) => fetch(BASE + '/' + p + '.json?ns=' + ns, { method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json());

function phone(ns, uid) {
    const sb = { console, setTimeout, clearTimeout, setInterval, clearInterval, WebSocket, fetch, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, Uint8Array, Promise, JSON, Math, Date, Object, Array,
        navigator: { onLine: true, userAgent: 'node' }, location: { protocol: 'http:', hostname: 'localhost', href: 'http://localhost/', search: '', pathname: '/' }, addEventListener() {}, removeEventListener() {} };
    sb.window = sb; sb.self = sb; sb.globalThis = sb;
    vm.createContext(sb);
    ['firebase-app-compat.js', 'firebase-database-compat.js', 'my-rounds.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    vm.runInContext("firebase.initializeApp({ databaseURL: '" + BASE + "?ns=" + ns + "', projectId: '" + ns + "', apiKey: 'x' }); var __d = firebase.database(); __d.useEmulator('127.0.0.1', " + PORT + ", { mockUserToken: { sub: '" + uid + "', firebase: { sign_in_provider: 'password' } } }); window.db = firebase.database();", sb);
    sb.close = () => { try { vm.runInContext('firebase.app().delete()', sb); } catch (e) {} };
    return sb;
}
const ok = (p) => Promise.resolve(p).then(() => true, () => false);
const SEED = {
    events: {
        OWN084: { ownerUid: 'acct', eventName: 'Tuesday Skins', courseName: 'Desert Palms GC', createdAt: 1, organizerToken: 'tok_test_084' },
        TRIP84: { ownerUid: 'cohost', tripCode: 'TRP084', eventName: 'Day 2', courseName: 'Coyote Ridge', createdAt: 1 },
        OTH084: { ownerUid: 'other', eventName: 'Not mine', courseName: 'Papago', createdAt: 1 }
    },
    trips: { TRP084: { ownerUid: 'acct', name: 'Test trip 084' } }
};

describe('084 organizers/<uid>/rounds on the RTDB emulator', SKIP, () => {
    let emu = null; const phones = [];
    const NS_LIVE = 'demo-hp084l-' + process.pid, NS_PROP = 'demo-hp084p-' + process.pid;
    const P = (ns, uid) => { const p = phone(ns, uid); phones.push(p); return p; };
    before(async () => {
        emu = spawn(JAVA, ['-jar', JAR, '--port', String(PORT)], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/.json?ns=' + NS_LIVE); break; } catch (e) { await wait(500); } }
        for (const [ns, file] of [[NS_LIVE, 'database.rules.layout-base.json'], [NS_PROP, 'database.rules.084-proposed.json']]) {
            const r = await fetch(BASE + '/.settings/rules.json?ns=' + ns, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: emuRules(read(file)) }).then((x) => x.json());
            assert.equal(r.status, 'ok', JSON.stringify(r));
            await admin(ns, '', 'PUT', SEED);
        }
    });
    after(() => { phones.forEach((p) => p.close()); if (emu) emu.kill('SIGKILL'); });

    test('LIVE rules (control): the owner\'s pointer is refused; the app\'s remember() resolves false, no throw', { timeout: 30000 }, async () => {
        const A = P(NS_LIVE, 'acct');
        assert.equal(await A.HardPanMyRounds.remember(A.db, 'acct', 'OWN084', SEED.events.OWN084), false);
        assert.equal(await ok(A.db.ref('organizers/acct/rounds/OWN084').set({ at: 1, name: 'x' })), false);
        assert.equal(await ok(A.db.ref('organizers/acct/rounds').once('value')), true, 'reading your own node was already allowed');
    });

    test('PROPOSED: the owner writes and reads own pointers (round owner, and trip owner)', { timeout: 30000 }, async () => {
        const A = P(NS_PROP, 'acct');
        assert.equal(await A.HardPanMyRounds.remember(A.db, 'acct', 'OWN084', SEED.events.OWN084), true, 'round owner');
        assert.equal(await A.HardPanMyRounds.remember(A.db, 'acct', 'TRIP84', SEED.events.TRIP84, { day: '2026-10-31' }), true, 'trip owner');
        const got = await A.HardPanMyRounds.load(A.db, 'acct');
        assert.deepEqual(Object.keys(got).sort(), ['OWN084', 'TRIP84']);
        assert.equal(got.OWN084.name, 'Tuesday Skins');
        assert.ok(got.OWN084.at > 1e12 && got.OWN084.at <= Date.now() + 5000, 'server time');
        assert.ok(!JSON.stringify(got).includes('tok_test_084'), 'no organizer token in a pointer');
    });

    test('PROPOSED: a round you do not own is refused; another uid can neither write nor read your list', { timeout: 30000 }, async () => {
        const A = P(NS_PROP, 'acct'), O = P(NS_PROP, 'other'), C = P(NS_PROP, 'cohost');
        assert.equal(await A.HardPanMyRounds.remember(A.db, 'acct', 'OTH084', SEED.events.OTH084), false, "someone else's round");
        assert.equal(await A.HardPanMyRounds.remember(A.db, 'acct', 'NONE84', {}), false, 'a round that does not exist');
        assert.equal(await ok(O.db.ref('organizers/acct/rounds/OTH084').set({ at: 1, name: 'x' })), false, "writing into acct's list");
        assert.equal(await ok(O.db.ref('organizers/acct/rounds').once('value')), false, "reading acct's list");
        assert.equal(await ok(O.db.ref('organizers/acct/rounds/OWN084').once('value')), false);
        assert.equal(await ok(O.db.ref('organizers/acct/rounds/OWN084').remove()), false, "deleting acct's pointer");
        assert.equal(await O.HardPanMyRounds.remember(O.db, 'other', 'OTH084', SEED.events.OTH084), true, 'other: own round');
        assert.equal(await C.HardPanMyRounds.remember(C.db, 'cohost', 'TRIP84', SEED.events.TRIP84), true, 'cohost owns the round itself');
        assert.equal(await C.HardPanMyRounds.remember(C.db, 'cohost', 'OWN084', SEED.events.OWN084), false, 'cohost does not own OWN084');
    });

    test('PROPOSED: shape is held - extra field, bad code, missing name, long name, future at; delete own works', { timeout: 30000 }, async () => {
        const A = P(NS_PROP, 'acct');
        const sv = { '.sv': 'timestamp' };
        assert.equal(await ok(A.db.ref('organizers/acct/rounds/OWN084').set({ at: sv, name: 'ok', token: 'x' })), false, 'extra field');
        assert.equal(await ok(A.db.ref('organizers/acct/rounds/own084').set({ at: sv, name: 'ok' })), false, 'lower-case code');
        assert.equal(await ok(A.db.ref('organizers/acct/rounds/OWN084').set({ at: sv })), false, 'no name');
        assert.equal(await ok(A.db.ref('organizers/acct/rounds/OWN084').set({ at: sv, name: 'x'.repeat(81) })), false, 'name > 80');
        assert.equal(await ok(A.db.ref('organizers/acct/rounds/OWN084').set({ at: Date.now() + 86400000, name: 'ok' })), false, 'future at');
        assert.equal(await ok(A.db.ref('organizers/acct/rounds').set({ OWN084: { at: sv, name: 'ok' } })), false, 'no write at the list level');
        assert.equal(await ok(A.db.ref('organizers/acct/rounds/OWN084').remove()), true, 'delete own pointer');
        assert.equal((await A.db.ref('organizers/acct/rounds/OWN084').once('value')).exists(), false);
    });

    test('PROPOSED: nothing else changed - the owner still saves the round, others still cannot; firstSeenAt write-once', { timeout: 30000 }, async () => {
        const A = P(NS_PROP, 'acct'), O = P(NS_PROP, 'other');
        assert.equal(await ok(A.db.ref('events/OWN084').update({ eventName: 'Tuesday Skins 2' })), true);
        assert.equal(await ok(O.db.ref('events/OWN084').update({ eventName: 'hijack' })), false);
        assert.equal(await ok(A.db.ref('organizers/acct/firstSeenAt').set({ '.sv': 'timestamp' })), true);
        assert.equal(await ok(A.db.ref('organizers/acct/firstSeenAt').set({ '.sv': 'timestamp' })), false, 'write-once unchanged');
        assert.equal(await ok(A.db.ref('organizers/acct/pass').set(1)), false, 'pass still server-only');
    });
});
