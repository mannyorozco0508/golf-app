// ============================================================================
// E4 PHOTO WALL - storage.rules ON THE FIREBASE STORAGE EMULATOR, and the real
// Show / Hide move with the Admin SDK (local only, nothing live, 2026-11-09)
//
// The emulator runs as a demo- project (demo-hpphotos), so it never reaches a
// real Google service: `firebase emulators:start --only storage` from a scratch
// folder in the OS temp dir, on 127.0.0.1:9298 (the chat test uses 9198), hub
// 4429, logging 4529. Accounts are unsigned emulator tokens: 'anonymous' = the
// scorecard's session, 'apple.com' = a signed-in app account. Uploads use the
// REST call the scorecard makes (POST /v0/b/<bucket>/o?uploadType=media&name=...,
// Content-Type image/jpeg, Authorization: Firebase <token>).
//
// SAID PLAINLY: Storage rules cannot read the Realtime Database. A signed-in
// stranger with no team key CAN upload a JPEG to pending/ (test S3 asserts that
// truth) - and nobody can ever open it, and nothing points at it: Show needs the
// pending META, which the database accepts only with the team's key proof
// (tournament_photo_rules_emulator_test.js), and approvePhoto refuses a file with
// no meta (tournament_photo_handlers_test.js H4).
//
// The file under test is the repo's storage.rules, which also carries the ROUND
// CHAT block believed live since 2026-11-03 (S6 proves that block behaves as the
// chat test proved it: copied unchanged).
//
// Skipped when the firebase CLI or Java is missing.
// STORAGE_RULES=<file> runs the same tests against another rules file (controls).
// BASELINE (final file): against event-tools cf86caf8 (no storage.rules): the
// skip guard fires - all 8 tests skipped, which proves nothing. Control: the chat
// rules alone (storage.rules.chat21-proposed, i.e. LIVE as believed):
// all 8 tests: 2 PASS / 6 FAIL (S6 - the chat block - and S8 - everything else
// closed - pass; every tournament upload and shown read fails, and S4 fails on
// its positive upload).
// Against storage.rules: all 8 tests: 8 PASS / 0 FAIL.
// NEGATIVE CONTROLS (storage.rules mutated in place, restored by copying a
// saved file back, sha printed with RESTORED-OK), all 8 caught on the final
// file: overwrite allowed (S2), pending readable (S3, S4), shown listable (S5),
// shown client-writable (S2), a 10 MB cap (S2), any content type (S2), a
// signed-out upload (S2), shown not public (S5, S7).
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const RULES = process.env.STORAGE_RULES || path.join(__dirname, 'storage.rules');
const FN = path.join(__dirname, 'stripe-functions');
const JAVA_HOME = [process.env.JAVA_HOME, path.join(os.homedir(), 'jdks', 'jdk-21.0.12.1+1', 'Contents', 'Home')]
    .filter(Boolean).find((p) => { try { return fs.statSync(path.join(p, 'bin', 'java')).isFile(); } catch (e) { return false; } });
const FIREBASE = ['/usr/local/bin/firebase', '/opt/homebrew/bin/firebase'].find((p) => fs.existsSync(p))
    || (() => { try { return execFileSync('which', ['firebase'], { encoding: 'utf8' }).trim(); } catch (e) { return ''; } })();
const HAS_ADMIN = fs.existsSync(path.join(FN, 'node_modules', 'firebase-admin'));
const SKIP = !fs.existsSync(RULES) ? { skip: 'no storage.rules' } : (!JAVA_HOME || !FIREBASE) ? { skip: 'no Java or firebase CLI on this machine' } : {};
const PROJECT = 'demo-hpphotos', PORT = 9298;
const BUCKET = 'golfapp-9fb21.firebasestorage.app';
const BASE = 'http://127.0.0.1:' + PORT + '/v0/b/' + BUCKET + '/o';
const MB = 1024 * 1024;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(uid, provider) {
    const now = Math.floor(Date.now() / 1000);
    return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ sub: uid, user_id: uid, aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT,
        iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: provider, identities: {} } }) + '.';
}
const ANON = () => token('anon-golfer', 'anonymous');
const STRANGER = () => token('who', 'google.com');
const APP = () => token('member1', 'apple.com');
const jpeg = (n) => { const b = Buffer.alloc(n, 0x20); b[0] = 0xff; b[1] = 0xd8; b[n - 2] = 0xff; b[n - 1] = 0xd9; return b; };
function upload(name, tok, type, bytes) {
    const h = { 'Content-Type': type };
    if (tok) h.Authorization = 'Firebase ' + tok;
    return fetch(BASE + '?uploadType=media&name=' + encodeURIComponent(name), { method: 'POST', headers: h, body: bytes }).then((r) => r.status);
}
function get(name, tok, media) {
    const h = tok ? { Authorization: 'Firebase ' + tok } : {};
    return fetch(BASE + '/' + encodeURIComponent(name) + (media ? '?alt=media' : ''), { headers: h }).then((r) => r.status);
}
const OK = (s) => s >= 200 && s < 300;
let n = 0;
const ID = () => '-Nph' + Date.now().toString(36) + (n++);
const P = (state, id, code) => 'tournamentPhotos/' + (code || 'PH1ABC') + '/' + state + '/' + id + '.jpg';

describe('E4 storage.rules on the Storage emulator', SKIP, () => {
    let emu = null, dir = null;
    before(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-photo-storage-'));
        fs.copyFileSync(RULES, path.join(dir, 'storage.rules'));
        fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify({ storage: { rules: 'storage.rules' },
            emulators: { storage: { port: PORT, host: '127.0.0.1' }, ui: { enabled: false }, hub: { port: 4429 }, logging: { port: 4529 }, singleProjectMode: true } }));
        const env = Object.assign({}, process.env, { JAVA_HOME, PATH: path.join(JAVA_HOME, 'bin') + ':' + process.env.PATH });
        emu = spawn(FIREBASE, ['emulators:start', '--only', 'storage', '--project', PROJECT], { cwd: dir, env, stdio: 'ignore', detached: true });
        for (let i = 0; i < 90; i++) { try { await fetch('http://127.0.0.1:' + PORT + '/'); return; } catch (e) { await wait(1000); } }
        throw new Error('the Storage emulator did not start');
    });
    after(async () => {
        if (emu) { try { process.kill(-emu.pid, 'SIGINT'); } catch (e) {} await wait(1500); try { process.kill(-emu.pid, 'SIGKILL'); } catch (e) {} }
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
    });

    test('S1. the scorecard\'s anonymous session uploads a JPEG (up to 5 MB) to pending/', async () => {
        assert.equal(OK(await upload(P('pending', ID()), ANON(), 'image/jpeg', jpeg(400 * 1024))), true);
        assert.equal(OK(await upload(P('pending', ID()), ANON(), 'image/jpeg', jpeg(5 * MB))), true, 'exactly 5 MB');
        assert.equal(OK(await upload(P('pending', ID()), APP(), 'image/jpeg', jpeg(2048))), true, 'an app account too');
    });

    test('S2. refused uploads: signed out, over 5 MB, empty, not a JPEG, overwrite, shown/, hidden/, bad names', async () => {
        assert.equal(OK(await upload(P('pending', ID()), null, 'image/jpeg', jpeg(2048))), false, 'signed out');
        assert.equal(OK(await upload(P('pending', ID()), ANON(), 'image/jpeg', jpeg(5 * MB + 1))), false, '5 MB + 1');
        assert.equal(OK(await upload(P('pending', ID()), ANON(), 'image/jpeg', Buffer.alloc(0))), false, 'empty');
        for (const t of ['image/png', 'image/heic', 'image/gif', 'video/mp4']) assert.equal(OK(await upload(P('pending', ID()), ANON(), t, jpeg(2048))), false, t);
        const same = P('pending', ID());
        assert.equal(OK(await upload(same, ANON(), 'image/jpeg', jpeg(2048))), true, 'positive: first upload');
        assert.equal(OK(await upload(same, ANON(), 'image/jpeg', jpeg(4096))), false, 'overwrite');
        assert.equal(OK(await upload(P('shown', ID()), ANON(), 'image/jpeg', jpeg(2048))), false, 'straight to the wall');
        assert.equal(OK(await upload(P('shown', ID()), APP(), 'image/jpeg', jpeg(2048))), false, 'straight to the wall, app account');
        assert.equal(OK(await upload(P('hidden', ID()), ANON(), 'image/jpeg', jpeg(2048))), false, 'hidden/');
        for (const name of ['tournamentPhotos/PH1ABC/' + ID() + '.jpg', 'tournamentPhotos/P!/pending/' + ID() + '.jpg', 'tournamentPhotos/PH1ABC/pending/' + ID() + '.png',
            'tournamentPhotos/PH1ABC/pending/sub/' + ID() + '.jpg', 'tournamentPhotos/' + 'A'.repeat(13) + '/pending/' + ID() + '.jpg'])
            assert.equal(OK(await upload(name, ANON(), 'image/jpeg', jpeg(2048))), false, name);
    });

    test('S3. said plainly: a stranger with no team key CAN park a JPEG in pending/ - and cannot read it back', async () => {
        const name = P('pending', ID());
        assert.equal(OK(await upload(name, STRANGER(), 'image/jpeg', jpeg(2048))), true);
        assert.equal(OK(await get(name, STRANGER(), true)), false);
    });

    test('S4. pending/ and hidden/ are unreadable to every client (file, metadata, list); the uploader too', async () => {
        const name = P('pending', ID());
        assert.equal(OK(await upload(name, ANON(), 'image/jpeg', jpeg(4096))), true, 'positive: the file exists');
        for (const t of [ANON(), STRANGER(), APP(), null]) {
            assert.equal(OK(await get(name, t, true)), false, 'download');
            assert.equal(OK(await get(name, t, false)), false, 'metadata');
        }
        const list = await fetch(BASE + '?prefix=' + encodeURIComponent('tournamentPhotos/PH1ABC/pending/') + '&delimiter=%2F', { headers: { Authorization: 'Firebase ' + ANON() } }).then((r) => r.status);
        assert.equal(OK(list), false, 'list pending');
    });

    test('S5. THE REAL MOVE: approvePhoto (Admin SDK on this emulator) puts the file in shown/, which anyone can GET by name and nobody can list; hidePhoto takes it down', { skip: !HAS_ADMIN && 'stripe-functions/node_modules not installed' }, async () => {
        process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:' + PORT;
        const admin = require(path.join(FN, 'node_modules', 'firebase-admin'));
        const { makePhotoHandlers } = require(path.join(FN, 'photo-handlers.js'));
        const app = admin.initializeApp({ projectId: PROJECT, storageBucket: BUCKET }, 'photo-storage-e2e');
        try {
            // A database stand-in with the four calls the handlers make (the real
            // database side is proven on the RTDB emulator in the handlers test).
            const tree = { tournaments: { PH1ABC: { ownerUid: 'u-org' } }, tournamentPhotoMeta: { PH1ABC: { pending: {} } } };
            const at = (p) => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), tree);
            const put = (p, v) => { const ks = p.split('/'); let o = tree; ks.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; }); if (v === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = v; };
            const db = { ref: (p) => ({ once: async () => ({ val: () => { const v = at(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }),
                update: async (u) => { Object.keys(u).forEach((k) => put(k, u[k])); }, remove: async () => put(p, null),
                transaction: async (fn) => { put(p, fn(at(p) || null)); return { committed: true }; } }) };
            const h = makePhotoHandlers({ db, bucket: app.storage().bucket(BUCKET), now: () => 1000 });
            const id = ID();
            const bytes = jpeg(3000);
            assert.equal(OK(await upload(P('pending', id), ANON(), 'image/jpeg', bytes)), true, 'the golfer uploads');
            tree.tournamentPhotoMeta.PH1ABC.pending[id] = { team: 'team4', at: 1, w: 1600, h: 1200 };   // the keyed meta write
            assert.equal(OK(await get(P('shown', id), null, true)), false, 'not public before Show');
            assert.deepEqual(await h.approvePhoto({ code: 'PH1ABC', photoId: id }, { uid: 'u-org' }), { state: 'shown' });
            const r = await fetch(BASE + '/' + encodeURIComponent(P('shown', id)) + '?alt=media');
            assert.equal(r.status, 200, 'shown: a signed-out GET by exact name');
            assert.deepEqual(Buffer.from(await r.arrayBuffer()), bytes, 'the same bytes the golfer sent');
            assert.equal(OK(await get(P('pending', id), null, true)), false, 'pending copy gone');
            const list = await fetch(BASE + '?prefix=' + encodeURIComponent('tournamentPhotos/PH1ABC/shown/') + '&delimiter=%2F').then((x) => x.status);
            assert.equal(OK(list), false, 'the wall cannot be listed from Storage (the meta lists it)');
            assert.deepEqual(await h.hidePhoto({ code: 'PH1ABC', photoId: id }, { uid: 'u-org' }), { state: 'hidden' });
            assert.equal(OK(await get(P('shown', id), null, true)), false, 'hidden: no longer public');
            assert.equal(OK(await get(P('hidden', id), APP(), true)), false, 'hidden/ unreadable');
            const [exists] = await app.storage().bucket(BUCKET).file(P('hidden', id)).exists();
            assert.equal(exists, true, 'kept in hidden/ for the 7-day delete by hand');
        } finally { await app.delete(); }
    });

    test('S6. the ROUND CHAT block is unchanged: an app account uploads; anonymous refused; nothing readable', async () => {
        const name = 'chat/TCHAT1/' + ID() + '.jpg';
        assert.equal(OK(await upload(name, APP(), 'image/jpeg', jpeg(300 * 1024))), true);
        assert.equal(OK(await upload('chat/TCHAT1/' + ID() + '.jpg', ANON(), 'image/jpeg', jpeg(2048))), false);
        assert.equal(OK(await upload('chat/TCHAT1/' + ID() + '.jpg', APP(), 'image/jpeg', jpeg(Math.floor(1.5 * MB)))), false, '1.5 MB still refused for chat');
        assert.equal(OK(await get(name, APP(), true)), false);
    });

    test('S7. the shown/ positive on its own: a file the Admin SDK put there is a public GET, metadata too', { skip: !HAS_ADMIN && 'stripe-functions/node_modules not installed' }, async () => {
        process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:' + PORT;
        const admin = require(path.join(FN, 'node_modules', 'firebase-admin'));
        const app = admin.initializeApp({ projectId: PROJECT, storageBucket: BUCKET }, 'photo-storage-s7');
        try {
            const name = P('shown', ID());
            await app.storage().bucket(BUCKET).file(name).save(jpeg(1024), { contentType: 'image/jpeg' });
            assert.equal(OK(await get(name, null, true)), true);
            assert.equal(OK(await get(name, null, false)), true);
        } finally { await app.delete(); }
    });

    test('S8. everything else is closed', async () => {
        assert.equal(OK(await upload('anything.jpg', APP(), 'image/jpeg', jpeg(2048))), false);
        assert.equal(OK(await upload('tournamentPhotos/x.jpg', APP(), 'image/jpeg', jpeg(2048))), false);
        assert.equal(OK(await upload('users/member1/a.jpg', ANON(), 'image/jpeg', jpeg(2048))), false);
    });
});
