// ============================================================================
// THE ORGANIZER'S PICKED-GROUP SCORE - DO THE RULES TAKE IT? (2.0.4, RTDB emulator, local port 9141, nothing live)
// The fix (index.html canWritePlayer honours "Score for: Group N" on a bare link) is client-side only. Before
// shipping it, this asks the database the one question that matters: does a signed-in OWNER with no ?group=,
// no scorekeeper claim and no sk key get his set on events/<code>/scores/p<id>_h<n> accepted?
//   1  database.rules.json (this tree)            - owner write lands
//   2  the saved LIVE copy (outbox/scores-lock/rules-proposal/live-rules.json, read Nov 3 2026) - owner write lands
//   3  the scores-lock PROPOSAL (database.rules.scorelock-proposed.json), round with scoreLock: true - the owner
//      clause lets him in without a claim; the same write from another signed-in account with no claim is refused
//      (the control that proves the emulator is enforcing anything at all)
//   4  the same proposal, an unlocked round - owner write lands
// The rules are READ, never changed. Each file not on this machine is skipped, as is the whole file without the
// emulator jar or Java.
// FINAL: 4 pass / 0 fail.
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
const REPO = path.join(__dirname, 'database.rules.json');
const LIVE = process.env.ORGSCORE_LIVE || path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'outbox', 'scores-lock', 'rules-proposal', 'live-rules.json');
const PROP = path.join(__dirname, 'database.rules.scorelock-proposed.json');
const SKIP = (!fs.existsSync(JAR) || !JAVA) ? { skip: 'no RTDB emulator on this machine' } : {};
const PORT = 9141, BASE = 'http://127.0.0.1:' + PORT;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const emuRules = (s) => JSON.stringify(JSON.parse(s)).replace(/\[\^@\\\\s\]/g, '[^@ ]');
const admin = (ns, p, method, body) => fetch(BASE + '/' + p + '.json?ns=' + ns, { method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json());
const ok = (p) => Promise.resolve(p).then(() => true, () => false);

function phone(ns, uid, provider) {
    const sb = { console, setTimeout, clearTimeout, setInterval, clearInterval, WebSocket, fetch, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, Uint8Array, Promise, JSON, Math, Date, Object,
        navigator: { onLine: true, userAgent: 'node' }, location: { protocol: 'http:', hostname: 'localhost', href: 'http://localhost/', search: '', pathname: '/' }, addEventListener() {}, removeEventListener() {} };
    sb.window = sb; sb.self = sb; sb.globalThis = sb;
    sb.document = { readyState: 'complete', getElementById: () => null, addEventListener() {} };
    vm.createContext(sb);
    ['firebase-app-compat.js', 'firebase-database-compat.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    vm.runInContext("firebase.initializeApp({ databaseURL: '" + BASE + "?ns=" + ns + "', projectId: '" + ns + "', apiKey: 'x' }, 'p" + Math.random().toString(36).slice(2) + "'); var __d = firebase.apps[firebase.apps.length - 1].database(); __d.useEmulator('127.0.0.1', " + PORT
        + (uid ? ", { mockUserToken: { sub: '" + uid + "', firebase: { sign_in_provider: '" + (provider || 'apple.com') + "' } } }" : '') + "); window.db = __d;", sb);
    sb.close = () => { try { vm.runInContext('firebase.apps.forEach(function (a) { a.delete(); })', sb); } catch (e) {} };
    return sb;
}

const PLAYERS = [101, 102, 103, 104, 105, 106, 107, 108].map((id, i) => ({ id, name: 'Test Golfer ' + (i + 1) }));
const round = (extra) => Object.assign({ eventName: 'Test Org Score Round', players: PLAYERS, courseName: 'Test Course', ownerUid: 'org', groupSizeOverrides: { 0: 4, 1: 4 } }, extra || {});

describe('the organizer\'s picked-group score write, on the RTDB emulator', SKIP, () => {
    let emu = null; const phones = [];
    const NS = { repo: 'demo-orgsc-r-' + process.pid, live: 'demo-orgsc-l-' + process.pid, prop: 'demo-orgsc-p-' + process.pid };
    const FILES = { repo: REPO, live: LIVE, prop: PROP };
    const P = (ns, uid, prov) => { const p = phone(ns, uid, prov); phones.push(p); return p; };
    before(async () => {
        emu = spawn(JAVA, ['-jar', JAR, '--port', String(PORT)], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/.json?ns=' + NS.repo); break; } catch (e) { await wait(500); } }
        for (const k of Object.keys(NS)) {
            if (!fs.existsSync(FILES[k])) continue;
            const r = await fetch(BASE + '/.settings/rules.json?ns=' + NS[k], { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: emuRules(fs.readFileSync(FILES[k], 'utf8')) }).then((x) => x.json());
            assert.equal(r.status, 'ok', FILES[k] + ': ' + JSON.stringify(r));
            await admin(NS[k], 'events/ORGOP1', 'PUT', round());
            await admin(NS[k], 'events/ORGLK1', 'PUT', round({ scoreLock: true }));
        }
    });
    after(() => { phones.forEach((p) => p.close()); if (emu) emu.kill('SIGKILL'); });

    test('1 database.rules.json (this tree): the owner on a bare link writes a Group 1 score', { timeout: 30000 }, async () => {
        const O = P(NS.repo, 'org');
        assert.equal(await ok(O.db.ref('events/ORGOP1/scores/p101_h1').set(4)), true);
        assert.equal((await admin(NS.repo, 'events/ORGOP1/scores/p101_h1', 'GET')), 4);
    });

    test('2 the saved LIVE rules: the owner on a bare link writes a Group 1 score', fs.existsSync(LIVE) ? { timeout: 30000 } : { skip: 'no saved live copy' }, async () => {
        const O = P(NS.live, 'org');
        assert.equal(await ok(O.db.ref('events/ORGOP1/scores/p101_h1').set(4)), true);
        assert.equal((await admin(NS.live, 'events/ORGOP1/scores/p101_h1', 'GET')), 4);
    });

    test('3 scores-lock PROPOSAL, locked round: the owner writes with no claim; another account with no claim is refused', fs.existsSync(PROP) ? { timeout: 30000 } : { skip: 'no proposal file' }, async () => {
        const O = P(NS.prop, 'org'), B = P(NS.prop, 'bob');
        assert.equal(await ok(B.db.ref('events/ORGLK1/scores/p102_h1').set(5)), false, 'control: the lock refuses a non-owner with no claim');
        assert.equal(await ok(O.db.ref('events/ORGLK1/scores/p101_h1').set(4)), true, 'the owner clause takes his write');
        assert.equal((await admin(NS.prop, 'events/ORGLK1/scores/p101_h1', 'GET')), 4);
    });

    test('4 scores-lock PROPOSAL, unlocked round: the owner on a bare link writes', fs.existsSync(PROP) ? { timeout: 30000 } : { skip: 'no proposal file' }, async () => {
        const O = P(NS.prop, 'org');
        assert.equal(await ok(O.db.ref('events/ORGOP1/scores/p101_h1').set(4)), true);
    });
});
