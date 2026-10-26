// ============================================================================
// 074 (server save) - THE LIVE RULES ALREADY FIT: on the Realtime Database EMULATOR (local, nothing live)
// with database.rules.layout-base.json (= the URGENT-026 read-back, the rules live today), a record the
// server saved (admin) at gps_courses/osm_w<id>:
//   - a signed-in phone (anonymous counts) reads it - ONE record, through the app's own Firebase SDK;
//   - no phone writes it or deletes it; nobody lists gps_courses; signed out reads nothing.
// So gpsCourse's OSM mode needs no rules publish. Skipped when the emulator jar or Java is not here.
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { spawn } = require('child_process');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const JAR = path.join(os.homedir(), '.cache', 'firebase', 'emulators', 'firebase-database-emulator-v4.11.2.jar');
const JAVA = [process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java'), path.join(os.homedir(), 'jdks', 'jdk-21.0.12.1+1', 'Contents', 'Home', 'bin', 'java'), '/usr/bin/java']
    .filter(Boolean).find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
const SKIP = (!fs.existsSync(JAR) || !JAVA) ? { skip: 'no RTDB emulator on this machine' } : {};
const PORT = 9075, BASE = 'http://127.0.0.1:' + PORT, NS = 'demo-hp074r-' + process.pid;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = 'osm_w1540940976';
const REC = { v: 1, src: 'osm', key: KEY, osm: 'way/1540940976', name: 'Shortys', fetched: '2026-10-25T18:00:00.000Z', fetchedAt: 1793037600000,
    attribution: { text: '© OpenStreetMap contributors, ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' }, n: 1,
    course: { type: 'way', id: 1540940976, tags: { name: 'Shortys' } }, elements: [{ type: 'way', id: 901, tags: { golf: 'hole', ref: '1' }, geometry: [{ lat: 43.18, lon: -124.39 }, { lat: 43.181, lon: -124.39 }] }] };
function phone(uid) {
    const sb = { console, setTimeout, clearTimeout, setInterval, clearInterval, WebSocket, fetch, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, Uint8Array, Promise, JSON, Math, Date, Object, Array,
        navigator: { onLine: true, userAgent: 'node' }, location: { protocol: 'http:', hostname: 'localhost', href: 'http://localhost/', search: '', pathname: '/' }, addEventListener() {}, removeEventListener() {} };
    sb.window = sb; sb.self = sb; sb.globalThis = sb; vm.createContext(sb);
    ['firebase-app-compat.js', 'firebase-database-compat.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    const tok = uid ? ", { mockUserToken: { sub: '" + uid + "', firebase: { sign_in_provider: 'anonymous' } } }" : '';
    vm.runInContext("firebase.initializeApp({ databaseURL: '" + BASE + "?ns=" + NS + "', projectId: '" + NS + "', apiKey: 'x' }); var __d = firebase.database(); __d.useEmulator('127.0.0.1', " + PORT + tok + "); window.db = __d;", sb);
    sb.close = () => { try { vm.runInContext('firebase.app().delete()', sb); } catch (e) {} };
    return sb;
}
const ok = (p) => p.then(() => true, () => false);
describe('074: gps_courses/osm_ under the LIVE rules (emulator)', SKIP, () => {
    let emu = null; const phones = [];
    before(async () => {
        emu = spawn(JAVA, ['-jar', JAR, '--port', String(PORT)], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/.json?ns=' + NS); break; } catch (e) { await wait(500); } }
        const rules = read('database.rules.layout-base.json').replace(/\[\^@\\\\s\]/g, '[^@ ]');
        const r = await fetch(BASE + '/.settings/rules.json?ns=' + NS, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rules }).then((x) => x.json());
        assert.equal(r.status, 'ok', JSON.stringify(r));
        // the server's admin write (gpsCourse) - stood in by the emulator's owner
        const w = await fetch(BASE + '/gps_courses/' + KEY + '.json?ns=' + NS, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(REC) });
        assert.equal(w.status, 200);
    });
    after(() => { phones.forEach((p) => p.close()); if (emu) emu.kill('SIGKILL'); });
    test('a signed-in phone reads the saved course; no phone writes, deletes or lists; signed out reads nothing', { timeout: 30000 }, async () => {
        const A = phone('anon-a'), Z = phone(null); phones.push(A, Z);
        const got = (await A.db.ref('gps_courses/' + KEY).once('value')).val();
        assert.equal(got.src, 'osm'); assert.equal(got.attribution.text, REC.attribution.text); assert.equal(got.elements[0].tags.golf, 'hole');
        assert.equal(await ok(A.db.ref('gps_courses/' + KEY).set(REC)), false, 'no overwrite');
        assert.equal(await ok(A.db.ref('gps_courses/osm_w9').set(REC)), false, 'no new record');
        assert.equal(await ok(A.db.ref('gps_courses/' + KEY).remove()), false, 'no delete');
        assert.equal(await ok(A.db.ref('gps_courses').once('value')), false, 'no listing');
        assert.equal(await ok(Z.db.ref('gps_courses/' + KEY).once('value')), false, 'signed out');
    });
});
