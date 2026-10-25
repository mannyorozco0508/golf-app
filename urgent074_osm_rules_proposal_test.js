// ============================================================================
// 074 PHASE 1 - CAN A PHONE SAVE A COURSE'S OPENSTREETMAP HOLES TO A SHARED RECORD?
//
// LIVE RULES (database.rules.layout-base.json = the URGENT-026 read-back, Oct 20): NO.
//   gps_courses, gps_links, course_gps/<key>/osm are .write false; there is no gps_osm node (root $other
//   is closed). global_courses is writable but it is the shared course LIST (read whole by every picker),
//   write-once, and needs an 18-hole par/HCP card - an OSM-only course has none (071 holds a par-4
//   stand-in on the phone only), so writing there would put a made-up card in everyone's list.
//
// PROPOSED (database.rules.074-proposed.json, NOT published - needs Manny's typed OK): ONE new node
// gps_osm/<osm_w123 | osm_r123>, nothing else changes. Any signed-in phone (anonymous counts):
//   - reads ONE record (no listing);
//   - writes only an osm_ key (never a GolfAPI / our course key), never deletes;
//   - first write, or a refresh only when the saved copy is older than 90 days, or a copy with MORE
//     holes mapped;
//   - a fixed shape: v, src 'osm', osm way/relation id, name, osmBase, fetched (ISO), fetchedAt (the
//     server's now, +-10 min), n, of, the exact ODbL attribution, holes 1-36 of course geometry only
//     (tee, end, mid, line, green, fairway: capped point counts), pick; anything else (a uid, a "by",
//     a golfer position) is refused.
// Run in memory (targaryen) and on the Realtime Database EMULATOR (local, nothing live).
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const targaryen = require('targaryen');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const LIVE = JSON.parse(read('database.rules.layout-base.json'));
const PROP_FILE = path.join(__dirname, 'database.rules.074-proposed.json');
const PROP = fs.existsSync(PROP_FILE) ? JSON.parse(fs.readFileSync(PROP_FILE, 'utf8')) : null;
const HAVE = PROP ? {} : { skip: 'no 074 proposal in this tree' };
const ATTR = { text: '© OpenStreetMap contributors, ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' };
const DAY = 24 * 3600 * 1000;

// A real record: Papago's OpenStreetMap answer (bundled), cleaned the way gps-match keeps a lookup.
function realHoles() {
    const sb = { console }; sb.window = sb; vm.createContext(sb);
    vm.runInContext(read('gps-geo.js'), sb, { filename: 'gps-geo.js' });
    const raw = JSON.parse(read('gps-osm/papago.json'));
    return JSON.parse(JSON.stringify(sb.HardPanGeo.cleanLookupHoles(raw.elements).holes));
}
const HOLES = realHoles();
function rec(over) {
    const n = Object.keys(HOLES).length;
    return Object.assign({ v: 1, src: 'osm', osm: 'way/123456', name: 'Shortys', osmBase: '2026-10-20T19:22:28Z', fetched: new Date().toISOString(), fetchedAt: Date.now(),
        n, of: 18, attribution: ATTR, holes: HOLES, pick: { step: 1, how: 'one course in the outline', candidates: 0 } }, over || {});
}
const less = (k) => { const h = JSON.parse(JSON.stringify(HOLES)); Object.keys(h).slice(k).forEach((x) => delete h[x]); return h; };

describe('074 rules, in memory', () => {
    const live = (data, uid) => targaryen.database(LIVE, data || {}).as(uid === null ? null : { uid: uid || 'anonA', provider: 'anonymous' });
    const prop = (data, uid) => targaryen.database(PROP, data || {}).as(uid === null ? null : { uid: uid || 'anonA', provider: 'anonymous' });

    test('LIVE rules: no shared OSM record can be written by a phone', () => {
        const r = rec();
        assert.equal(live().write('/gps_osm/osm_w123456', r).allowed, false, 'gps_osm: closed by $other');
        assert.equal(live().write('/course_gps/osm_w123456/osm', r).allowed, false, 'course_gps/<key>/osm: .write false');
        assert.equal(live().write('/gps_courses/osm_w123456', r).allowed, false, 'gps_courses: .write false');
        assert.equal(live().write('/gps_links/osm_w123456', 'x').allowed, false, 'gps_links: .write false');
        assert.equal(live().write('/global_courses/osm_w123456', r).allowed, false, 'global_courses: needs name + an 18-hole card');
        // Positive control: the live global_courses door only takes a par/HCP card - what an OSM-only course doesn't have.
        const card = { name: 'Shortys', data: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 })) };
        assert.equal(live().write('/global_courses/osm_w123456', card).allowed, true, 'positive control: a (made-up) card would be accepted - not used');
    });

    test('PROPOSED: the proposal only ADDS gps_osm; every live node is the same', HAVE, () => {
        Object.keys(LIVE.rules).forEach((k) => assert.deepEqual(PROP.rules[k], LIVE.rules[k], k + ' unchanged'));
        assert.deepEqual(Object.keys(PROP.rules).filter((k) => !(k in LIVE.rules)), ['gps_osm']);
        const diff = read('database.rules.074-proposed.diff');
        assert.deepEqual(diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')), [], 'diff: no - lines');
        assert.ok(diff.includes('+    "gps_osm": {'));
    });

    test('PROPOSED: a signed-in phone saves the first copy; nobody signed-out; only osm_ keys', HAVE, () => {
        assert.equal(prop().write('/gps_osm/osm_w123456', rec()).allowed, true, prop().write('/gps_osm/osm_w123456', rec()).info);
        assert.equal(prop({}, 'emailUser').write('/gps_osm/osm_r77', rec({ osm: 'relation/77' })).allowed, true);
        assert.equal(prop({}, null).write('/gps_osm/osm_w123456', rec()).allowed, false, 'signed out');
        ['gapi_012141520636857668694', 'papago', 'osm_x1', 'osm_w', 'osm_w12a', 'gca_99'].forEach((k) =>
            assert.equal(prop().write('/gps_osm/' + k, rec()).allowed, false, k + ': not an osm_ key (a GolfAPI course is never touched)'));
    });

    test('PROPOSED: newer-only - no overwrite within 90 days unless more holes; refresh after 90; never a delete', HAVE, () => {
        const fresh = { gps_osm: { osm_w123456: rec({ fetchedAt: Date.now() - 10 * DAY, n: 18 }) } };
        assert.equal(prop(fresh).write('/gps_osm/osm_w123456', rec()).allowed, false, 'same holes, 10 days old');
        const partial = { gps_osm: { osm_w123456: rec({ fetchedAt: Date.now() - 10 * DAY, n: 9, holes: less(9) }) } };
        assert.equal(prop(partial).write('/gps_osm/osm_w123456', rec()).allowed, true, 'more holes mapped');
        const old = { gps_osm: { osm_w123456: rec({ fetchedAt: Date.now() - 91 * DAY }) } };
        assert.equal(prop(old).write('/gps_osm/osm_w123456', rec()).allowed, true, '91 days old: refresh');
        assert.equal(prop(old).write('/gps_osm/osm_w123456', null).allowed, false, 'no delete');
        assert.equal(prop(old).write('/gps_osm/osm_w123456/holes/1', null).allowed, false, 'no partial edit of a 91-day copy without the whole shape');
    });

    test('PROPOSED: no uid, "by", golfer position or any extra field; the exact ODbL attribution', HAVE, () => {
        [{ uid: 'anonA' }, { by: 'anonA' }, { me: [33.4, -111.9] }, { pos: { lat: 1, lng: 2 } }, { golfer: 'x' }, { loc: [33, -111] }].forEach((x) =>
            assert.equal(prop().write('/gps_osm/osm_w123456', rec(x)).allowed, false, JSON.stringify(x)));
        const h = JSON.parse(JSON.stringify(HOLES)); h['1'].osm.golfer = [33.4, -111.9];
        assert.equal(prop().write('/gps_osm/osm_w123456', rec({ holes: h })).allowed, false, 'a field inside a hole');
        const h2 = JSON.parse(JSON.stringify(HOLES)); h2['1'].me = 1;
        assert.equal(prop().write('/gps_osm/osm_w123456', rec({ holes: h2 })).allowed, false, 'a field beside osm');
        const noA = rec(); delete noA.attribution;
        assert.equal(prop().write('/gps_osm/osm_w123456', noA).allowed, false, 'attribution required');
        assert.equal(prop().write('/gps_osm/osm_w123456', rec({ attribution: { text: 'OSM', url: ATTR.url } })).allowed, false, 'exact text');
        assert.equal(prop().write('/gps_osm/osm_w123456', rec({ attribution: Object.assign({ who: 'x' }, ATTR) })).allowed, false);
        assert.equal(prop().write('/gps_osm/osm_w123456', rec({ src: 'golfapi' })).allowed, false, "src 'osm' only");
    });

    test('PROPOSED: size and shape caps; fetchedAt is the server time (no back- or forward-dating)', HAVE, () => {
        assert.equal(prop().write('/gps_osm/osm_w123456', rec({ fetchedAt: Date.now() - 2 * DAY })).allowed, false, 'backdated');
        assert.equal(prop().write('/gps_osm/osm_w123456', rec({ fetchedAt: Date.now() + 2 * DAY })).allowed, false, 'future');
        const big = JSON.parse(JSON.stringify(HOLES)); big['1'].osm.green = Array.from({ length: 51 }, () => [33.45, -111.95]);
        assert.equal(prop().write('/gps_osm/osm_w123456', rec({ holes: big })).allowed, false, '51 green points');
        const h37 = JSON.parse(JSON.stringify(HOLES)); h37['37'] = HOLES['1'];
        assert.equal(prop().write('/gps_osm/osm_w123456', rec({ holes: h37 })).allowed, false, 'hole 37');
        const bad = JSON.parse(JSON.stringify(HOLES)); bad['1'].osm.tee = [133, -111];
        assert.equal(prop().write('/gps_osm/osm_w123456', rec({ holes: bad })).allowed, false, 'a latitude out of range');
        assert.equal(prop().write('/gps_osm/osm_w123456', rec({ name: 'x'.repeat(121) })).allowed, false, 'long name');
        assert.equal(prop().write('/gps_osm/osm_w123456', rec({ n: 99 })).allowed, false);
    });

    test('PROPOSED: a signed-in phone reads ONE record; nobody lists them; signed-out reads nothing', HAVE, () => {
        const d = { gps_osm: { osm_w123456: rec() } };
        assert.equal(prop(d).read('/gps_osm/osm_w123456').allowed, true);
        assert.equal(prop(d).read('/gps_osm').allowed, false, 'no listing');
        assert.equal(prop(d, null).read('/gps_osm/osm_w123456').allowed, false);
    });
});

// ---- the same, on the Realtime Database emulator (local, nothing live) ------------------------------
const JAR = path.join(os.homedir(), '.cache', 'firebase', 'emulators', 'firebase-database-emulator-v4.11.2.jar');
const JAVA = [process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java'), path.join(os.homedir(), 'jdks', 'jdk-21.0.12.1+1', 'Contents', 'Home', 'bin', 'java'), '/usr/bin/java']
    .filter(Boolean).find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
const ESKIP = !PROP ? HAVE : (!fs.existsSync(JAR) || !JAVA) ? { skip: 'no RTDB emulator on this machine' } : {};
const PORT = 9074, BASE = 'http://127.0.0.1:' + PORT;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The emulator cannot parse one e-mail regex in events/ - loosened in the emulator's copy only.
const emuRules = (o) => JSON.stringify(o).replace(/\[\^@\\\\s\]/g, '[^@ ]');
function phone(ns, uid) {
    const sb = { console, setTimeout, clearTimeout, setInterval, clearInterval, WebSocket, fetch, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, Uint8Array, Promise, JSON, Math, Date, Object, Array,
        navigator: { onLine: true, userAgent: 'node' }, location: { protocol: 'http:', hostname: 'localhost', href: 'http://localhost/', search: '', pathname: '/' }, addEventListener() {}, removeEventListener() {} };
    sb.window = sb; sb.self = sb; sb.globalThis = sb;
    vm.createContext(sb);
    ['firebase-app-compat.js', 'firebase-database-compat.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    vm.runInContext("firebase.initializeApp({ databaseURL: '" + BASE + "?ns=" + ns + "', projectId: '" + ns + "', apiKey: 'x' }); var __d = firebase.database(); __d.useEmulator('127.0.0.1', " + PORT + ", { mockUserToken: { sub: '" + uid + "', firebase: { sign_in_provider: 'anonymous' } } }); window.db = firebase.database();", sb);
    sb.close = () => { try { vm.runInContext('firebase.app().delete()', sb); } catch (e) {} };
    return sb;
}
const ok = (p) => p.then(() => true, () => false);

describe('074 rules, on the RTDB emulator', ESKIP, () => {
    let emu = null; const phones = [];
    const NS_LIVE = 'demo-hp074l-' + process.pid, NS_PROP = 'demo-hp074p-' + process.pid;
    before(async () => {
        emu = spawn(JAVA, ['-jar', JAR, '--port', String(PORT)], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/.json?ns=' + NS_LIVE); break; } catch (e) { await wait(500); } }
        for (const [ns, rules] of [[NS_LIVE, LIVE], [NS_PROP, PROP]]) {
            const r = await fetch(BASE + '/.settings/rules.json?ns=' + ns, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: emuRules(rules) }).then((x) => x.json());
            assert.equal(r.status, 'ok', JSON.stringify(r));
        }
    });
    after(() => { phones.forEach((p) => p.close()); if (emu) emu.kill('SIGKILL'); });

    test('live rules: every shared OSM path is refused', { timeout: 30000 }, async () => {
        const P = phone(NS_LIVE, 'anon-1'); phones.push(P);
        assert.equal(await ok(P.db.ref('gps_osm/osm_w123456').set(rec())), false);
        assert.equal(await ok(P.db.ref('course_gps/osm_w123456/osm').set(rec())), false);
        assert.equal(await ok(P.db.ref('gps_courses/osm_w123456').set(rec())), false);
    });

    test('proposed rules: save, second golfer reads it, overwrite refused, a uid field refused, a GolfAPI key refused', { timeout: 30000 }, async () => {
        const A = phone(NS_PROP, 'anon-a'), B = phone(NS_PROP, 'anon-b'); phones.push(A, B);
        assert.equal(await ok(A.db.ref('gps_osm/osm_w123456').set(rec())), true, 'first save');
        const got = (await B.db.ref('gps_osm/osm_w123456').once('value')).val();
        assert.equal(got.src, 'osm'); assert.equal(got.attribution.text, ATTR.text); assert.equal(Object.keys(got.holes).length, Object.keys(HOLES).length);
        assert.equal(await ok(B.db.ref('gps_osm/osm_w123456').set(rec())), false, 'no overwrite of a fresh copy');
        assert.equal(await ok(B.db.ref('gps_osm/osm_w9').set(rec({ uid: 'anon-b' }))), false, 'no uid');
        assert.equal(await ok(B.db.ref('gps_osm/gapi_012141520636857668694').set(rec())), false, 'GolfAPI key');
        assert.equal(await ok(B.db.ref('gps_osm').once('value')), false, 'no listing');
    });
});
