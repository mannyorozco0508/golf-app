// ============================================================================
// E4 PHOTO WALL - THE CALLABLES (stripe-functions/photo-handlers.js + index.js)
//
// Modelled on stripe_webhook_test.js. The Functions emulator is NOT used:
//   (a) makePhotoHandlers() with a firebase-admin Database on the RTDB emulator
//       (local port 9484, nothing live) and an IN-MEMORY bucket that records
//       every exists / getMetadata / copy / delete / getSignedUrl;
//   (b) index.js's exported onCall wrappers (.run()), driven only on paths that
//       never reach Storage: refusals and a report on a missing photo.
// The REAL Storage move (Admin SDK on the Storage emulator, then the public GET
// of shown/) is proven in tournament_photo_storage_rules_test.js.
//
// Skipped when stripe-functions/node_modules is not installed or the RTDB
// emulator jar / Java is missing.
//
// BASELINE (final file): with photo-handlers.js absent (as on event-tools
// cf86caf8), before() cannot require it: all 8 tests: 0 PASS / 8 FAIL - red,
// and nothing proven per assertion; the controls below are that proof.
// Against the build: all 8 tests: 8 PASS / 0 FAIL.
// NEGATIVE CONTROLS (photo-handlers.js mutated, restored by sha from a saved
// copy): owner check removed -> H2; co-organizer email key with only the first
// '.' replaced -> H3; approve without the pending meta check -> H4; approve
// that never deletes the pending file -> H1; hide that leaves the reports ->
// H5; report on a pending photo accepted -> H6; links for every photo
// including shown-and-unreported -> H7. All caught.
// ============================================================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');

const FN = path.join(__dirname, 'stripe-functions');
const HAS_MODULES = ['firebase-admin', 'firebase-functions'].every((m) => fs.existsSync(path.join(FN, 'node_modules', m)));
function findJar() {
    const dir = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
    const f = fs.existsSync(dir) && fs.readdirSync(dir).filter((x) => /^firebase-database-emulator-v[\d.]+\.jar$/.test(x)).sort().pop();
    return f ? path.join(dir, f) : null;
}
function findJava() {
    try { execSync('java -version', { stdio: 'ignore' }); return 'java'; } catch (e) { /* not on PATH */ }
    const jdks = path.join(os.homedir(), 'jdks');
    const d = fs.existsSync(jdks) && fs.readdirSync(jdks).sort().pop();
    const j = d && path.join(jdks, d, 'Contents', 'Home', 'bin', 'java');
    return j && fs.existsSync(j) ? j : null;
}
const JAR = findJar(), JAVA = findJava();
const SKIP = !HAS_MODULES ? { skip: 'stripe-functions/node_modules not installed' } : (!JAR || !JAVA) ? { skip: 'no RTDB emulator (jar/Java)' } : {};

const PORT = 9484, HOST = '127.0.0.1:' + PORT, BASE = 'http://' + HOST;
const NS = 'photohandlers', NSW = 'photowrap';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rest = async (ns, method, p, body) => (await fetch(`${BASE}/${p}.json?ns=${ns}`, { method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body) })).json();
const M = (o) => Object.assign({ team: 'team4', caption: 'Team 4 on the 7th tee', at: 5, w: 1600, h: 1200 }, o || {});
const SEED = () => ({
    tournaments: { PH1: { name: 'Rattle Classic', ownerUid: 'u-org', createdAt: 1, coOrganizers: { 'co@example,co,uk': true } } },
    tournamentPhotoMeta: { PH1: {
        pending: { '-Pa': M(), '-Pb': M({ team: 'team9', caption: 'hole 12' }), '-Pbig': M(), '-Pgone': M() },
        shown: { '-Sa': M({ caption: 'Awards' }), '-Srep': M({ caption: 'Reported one' }) },
        reports: { '-Srep': { count: 2, lastAt: 9 } } } }
});
// An in-memory bucket with the surface photo-handlers.js uses.
function memBucket(files) {
    const log = [];
    const meta = (n) => files[n];
    return { log, files, file: (name) => ({
        name,
        exists: async () => { log.push('exists ' + name); return [!!meta(name)]; },
        getMetadata: async () => { log.push('getMetadata ' + name); if (!meta(name)) throw new Error('404'); return [{ contentType: meta(name).type, size: String(meta(name).size) }]; },
        copy: async (dest) => { log.push('copy ' + name + ' -> ' + dest.name); files[dest.name] = Object.assign({}, meta(name)); },
        delete: async () => { log.push('delete ' + name); delete files[name]; },
        getSignedUrl: async (o) => { log.push('sign ' + name + ' ' + o.action + ' ' + o.version + ' ' + (o.expires - 1000)); return ['https://signed.example/' + encodeURIComponent(name)]; }
    }) };
}
const JPG = (size) => ({ type: 'image/jpeg', size: size || 400000 });
const FILES = () => ({
    'tournamentPhotos/PH1/pending/-Pa.jpg': JPG(), 'tournamentPhotos/PH1/pending/-Pb.jpg': JPG(),
    'tournamentPhotos/PH1/pending/-Pbig.jpg': JPG(5 * 1024 * 1024 + 1),
    'tournamentPhotos/PH1/shown/-Sa.jpg': JPG(), 'tournamentPhotos/PH1/shown/-Srep.jpg': JPG()
});

let emu, admin, db, makePhotoHandlers, PhotoError;
const OWNER = { uid: 'u-org', email: 'org@example.com' };
function H(files) { const bucket = memBucket(files || FILES()); return { h: makePhotoHandlers({ db, bucket, now: () => 1000 }), bucket }; }
async function refused(p, reason) { await assert.rejects(p, (e) => { assert.ok(e instanceof PhotoError, String(e)); assert.equal(e.reason, reason); return true; }); }

before(async () => {
    if (SKIP.skip) return;
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = HOST;
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-photos', databaseURL: `${BASE}?ns=${NSW}`, storageBucket: 'demo-photos.appspot.com' });
    process.env.GCLOUD_PROJECT = 'demo-photos';
    emu = spawn(JAVA, ['-jar', JAR, '--host', '127.0.0.1', '--port', String(PORT)], { stdio: 'ignore' });
    let up = false;
    for (let i = 0; i < 80 && !up; i++) { try { await fetch(`${BASE}/.json?ns=${NS}`); up = true; } catch (e) { await sleep(250); } }
    if (!up) throw new Error('emulator did not start');
    admin = require(path.join(FN, 'node_modules', 'firebase-admin'));
    ({ makePhotoHandlers, PhotoError } = require(path.join(FN, 'photo-handlers.js')));
    db = admin.initializeApp({ projectId: 'demo-photos', databaseURL: `${BASE}?ns=${NS}` }, 'photo-handlers-test').database();
});
after(async () => {
    try { if (admin) await Promise.all(admin.apps.map((a) => a.delete())); } catch (e) { /* closing */ }
    if (emu) emu.kill();
});
const reseed = (ns) => rest(ns || NS, 'PUT', '', SEED());
const read = (p, ns) => rest(ns || NS, 'GET', p);

test('H1. Show: the file moves pending -> shown (copy, then delete), the meta moves in one update, shownAt is the server\'s', SKIP, async () => {
    await reseed();
    const { h, bucket } = H();
    assert.deepEqual(await h.approvePhoto({ code: 'PH1', photoId: '-Pa' }, OWNER), { state: 'shown' });
    assert.deepEqual(bucket.log.filter((l) => /^(copy|delete)/.test(l)), ['copy tournamentPhotos/PH1/pending/-Pa.jpg -> tournamentPhotos/PH1/shown/-Pa.jpg', 'delete tournamentPhotos/PH1/pending/-Pa.jpg']);
    assert.ok(bucket.files['tournamentPhotos/PH1/shown/-Pa.jpg'] && !bucket.files['tournamentPhotos/PH1/pending/-Pa.jpg']);
    assert.equal(await read('tournamentPhotoMeta/PH1/pending/-Pa'), null);
    assert.deepEqual(await read('tournamentPhotoMeta/PH1/shown/-Pa'), Object.assign(M(), { shownAt: 1000 }));
});

test('H2. only the owner: signed out, a stranger, a bad code or id - refused, nothing moved', SKIP, async () => {
    await reseed();
    const { h, bucket } = H();
    await refused(h.approvePhoto({ code: 'PH1', photoId: '-Pa' }, {}), 'unauthenticated');
    await refused(h.approvePhoto({ code: 'PH1', photoId: '-Pa' }, { uid: 'u-who', email: 'who@example.com' }), 'not-owner');
    await refused(h.hidePhoto({ code: 'PH1', photoId: '-Sa' }, { uid: 'u-who' }), 'not-owner');
    await refused(h.photoLinks({ code: 'PH1' }, { uid: 'u-who' }), 'not-owner');
    await refused(h.approvePhoto({ code: 'NOPE1', photoId: '-Pa' }, OWNER), 'not-found');
    await refused(h.approvePhoto({ code: '../x', photoId: '-Pa' }, OWNER), 'bad-request');
    await refused(h.approvePhoto({ code: 'PH1', photoId: '../shown/-Sa' }, OWNER), 'bad-request');
    assert.equal(bucket.log.filter((l) => /^(copy|delete|sign)/.test(l)).length, 0, 'no file touched');
    assert.ok(await read('tournamentPhotoMeta/PH1/pending/-Pa'), 'positive: still pending');
});

test('H3. a co-organizer (email key, EVERY "." as ",") may approve', SKIP, async () => {
    await reseed();
    const { h } = H();
    assert.deepEqual(await h.approvePhoto({ code: 'PH1', photoId: '-Pb' }, { uid: 'u-co', email: 'Co@Example.co.uk' }), { state: 'shown' });
});

test('H4. Show needs the pending META (the database\'s key proof), a real file, a JPEG within 5 MB', SKIP, async () => {
    await reseed();
    const files = FILES();
    files['tournamentPhotos/PH1/pending/-Porphan.jpg'] = JPG();   // uploaded, but no meta: nobody's key posted it
    files['tournamentPhotos/PH1/pending/-Pb.jpg'] = { type: 'image/png', size: 100 };
    const { h, bucket } = H(files);
    await refused(h.approvePhoto({ code: 'PH1', photoId: '-Porphan' }, OWNER), 'not-found');
    await refused(h.approvePhoto({ code: 'PH1', photoId: '-Pgone' }, OWNER), 'not-found');      // meta, no file
    await refused(h.approvePhoto({ code: 'PH1', photoId: '-Pbig' }, OWNER), 'bad-file');
    await refused(h.approvePhoto({ code: 'PH1', photoId: '-Pb' }, OWNER), 'bad-file');
    assert.equal(bucket.log.filter((l) => /^(copy|delete)/.test(l)).length, 0);
    assert.ok(await read('tournamentPhotoMeta/PH1/pending/-Pbig'), 'still pending');
});

test('H5. Hide: from pending or shown, file and meta to hidden/ with hiddenAt; reports cleared; a missing file still hides the meta', SKIP, async () => {
    await reseed();
    const { h, bucket } = H();
    assert.deepEqual(await h.hidePhoto({ code: 'PH1', photoId: '-Pa' }, OWNER), { state: 'hidden' });
    assert.deepEqual(await h.hidePhoto({ code: 'PH1', photoId: '-Srep' }, OWNER), { state: 'hidden' });
    assert.deepEqual(await h.hidePhoto({ code: 'PH1', photoId: '-Pgone' }, OWNER), { state: 'hidden' });
    assert.ok(bucket.files['tournamentPhotos/PH1/hidden/-Pa.jpg'] && bucket.files['tournamentPhotos/PH1/hidden/-Srep.jpg']);
    assert.ok(!bucket.files['tournamentPhotos/PH1/shown/-Srep.jpg'], 'gone from the public folder');
    assert.equal(await read('tournamentPhotoMeta/PH1/shown/-Srep'), null);
    assert.equal(await read('tournamentPhotoMeta/PH1/reports/-Srep'), null);
    const hid = await read('tournamentPhotoMeta/PH1/hidden');
    assert.deepEqual(Object.keys(hid).sort(), ['-Pa', '-Pgone', '-Srep']);
    assert.equal(hid['-Srep'].hiddenAt, 1000); assert.equal(hid['-Srep'].from, 'shown');
    await refused(h.hidePhoto({ code: 'PH1', photoId: '-Pnone' }, OWNER), 'not-found');
});

test('H6. Report: anyone, no sign-in; only a SHOWN photo; counted, capped; Show on a reported photo keeps it and clears the count', SKIP, async () => {
    await reseed();
    const { h } = H();
    assert.deepEqual(await h.reportPhoto({ code: 'PH1', photoId: '-Sa' }), { reported: true });
    assert.deepEqual(await h.reportPhoto({ code: 'PH1', photoId: '-Sa' }), { reported: true });
    assert.deepEqual(await read('tournamentPhotoMeta/PH1/reports/-Sa'), { count: 2, lastAt: 1000 });
    await refused(h.reportPhoto({ code: 'PH1', photoId: '-Pa' }), 'not-found');   // pending: nobody can see it to report it
    await refused(h.reportPhoto({ code: 'PH1', photoId: '-Nope' }), 'not-found');
    assert.deepEqual(await h.approvePhoto({ code: 'PH1', photoId: '-Srep' }, OWNER), { state: 'shown' });
    assert.equal(await read('tournamentPhotoMeta/PH1/reports/-Srep'), null, 'Keep clears the reports');
    assert.ok(await read('tournamentPhotoMeta/PH1/shown/-Srep'), 'and the photo stays up');
});

test('H7. photoLinks: the owner gets 10-minute v4 read links for pending and REPORTED shown photos only', SKIP, async () => {
    await reseed();
    const { h, bucket } = H();
    const out = await h.photoLinks({ code: 'PH1' }, OWNER);
    assert.deepEqual(Object.keys(out.links).sort(), ['-Pa', '-Pb', '-Pbig', '-Srep'], '-Pgone has no file; -Sa is shown and unreported (public anyway)');
    assert.ok(bucket.log.includes('sign tournamentPhotos/PH1/pending/-Pa.jpg read v4 600000'), bucket.log.join('\n'));
    assert.match(out.links['-Srep'], /shown%2F-Srep\.jpg$/);
});

test('H8. index.js wrappers: us-central1 callables, no secrets; refusals carry details.reason (paths that never reach Storage)', SKIP, async () => {
    await reseed(NSW);
    const m = require(path.join(FN, 'index.js'));
    const reason = async (p) => { try { await p; return 'resolved'; } catch (e) { return e.code + '/' + (e.details && e.details.reason); } };
    for (const k of ['photoLinks', 'approvePhoto', 'hidePhoto', 'reportPhoto']) {
        assert.ok(m[k].__endpoint.callableTrigger, k);
        assert.deepEqual(m[k].__endpoint.region, ['us-central1']);
        assert.ok(!(m[k].__endpoint.secretEnvironmentVariables || []).length, k + ' binds no secret');
    }
    assert.equal(await reason(m.approvePhoto.run({ data: { code: 'PH1', photoId: '-Pa' }, rawRequest: { headers: {} } })), 'unauthenticated/unauthenticated');
    assert.equal(await reason(m.hidePhoto.run({ data: { code: 'PH1', photoId: '-Pa' }, auth: { uid: 'u-who', token: { email: 'who@example.com' } }, rawRequest: { headers: {} } })), 'permission-denied/not-owner');
    assert.equal(await reason(m.photoLinks.run({ data: { code: 'x' }, auth: { uid: 'u-org', token: {} }, rawRequest: { headers: {} } })), 'invalid-argument/bad-request');
    assert.equal(await reason(m.reportPhoto.run({ data: { code: 'PH1', photoId: '-Pa' }, rawRequest: { headers: {} } })), 'not-found/not-found');
    assert.equal(await reason(m.reportPhoto.run({ data: { code: 'PH1', photoId: '-Sa' }, rawRequest: { headers: {} } })), 'resolved', 'positive: a report on a shown photo, signed out');
    assert.equal((await read('tournamentPhotoMeta/PH1/reports/-Sa', NSW)).count, 1);
});
