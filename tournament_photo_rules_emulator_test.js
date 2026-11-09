// ============================================================================
// E4 PHOTO WALL - THE DATABASE RULES BLOCK, IN THE RTDB EMULATOR (2026-11-09)
//
// Local port 9483 (Stripe 9473/9474, E2 9481; nothing live, nothing published).
// Namespaces:
//   LIVE   the LIVE rules read read-only on 2026-11-09 (the inbox ROLLBACK file)
//   E4     LIVE + this block (the inbox CANDIDATE file; test 1: === build(LIVE))
//   SE24   LIVE + Stripe + E2 + E4, built in memory in the publish order (E1 and
//          E3 are the other helper's and are not here)
//
// The golfer's write is the scorecard's: signed out, ONE root PATCH carrying the
// pending meta and its proof, t and at as {".sv": "timestamp"}. Moving a photo to
// shown/ or hidden/ is the approvePhoto / hidePhoto callable's (Admin SDK) - no
// client may do it, and test 5 proves that for the owner too.
//
// CONTROLS. Every path here is new: on LIVE it falls to the root $other, so LIVE
// refuses every write and read (test 3) - that is what proves the block opens
// exactly the two it opens (create pending with a proof; read shown). Each
// refusal inside the block is proven by a negative control (a mutated candidate
// via E4_RULES_CANDIDATE), listed in TOURNAMENTS-E4-RULES-BLOCK.md.
//
// BASELINE (final file, branch event-e2e4):
//   LIVE as the candidate (E4_RULES_CANDIDATE := the rollback file):
//   all 9 tests: 2 PASS / 7 FAIL. Pass: 5 (no client moves a photo - LIVE
//   refuses that too, via root $other) and 9 (existing flows). Test 3 fails
//   there on its block half (the wall read is refused on LIVE).
//   against the CANDIDATE: all 9 tests: 9 PASS / 0 FAIL.
// NEGATIVE CONTROLS (8 mutated candidates in the scratchpad, inbox file
//   untouched; each caught by a test other than test 1): listed in
//   TOURNAMENTS-E4-RULES-BLOCK.md.
// ============================================================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { build } = require('./tools/event-photos-rules-candidate.js');
const e2 = require('./tools/event-contests-rules-candidate.js');
const stripe = require('./tools/stripe-rules-candidate.js');

const INBOX = path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'inbox');
const LIVE_FILE = process.env.E4_RULES_LIVE || path.join(INBOX, 'TOURNAMENTS-EVENT-RULES-ROLLBACK-live-20261109.json');
const CAND_FILE = process.env.E4_RULES_CANDIDATE || path.join(INBOX, 'TOURNAMENTS-E4-RULES-CANDIDATE.json');
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
const SKIP = !fs.existsSync(LIVE_FILE) ? { skip: 'no saved live rules' } : !fs.existsSync(CAND_FILE) ? { skip: 'no candidate' }
    : (!JAR || !JAVA) ? { skip: 'no RTDB emulator (jar/Java) on this machine' } : {};

const PORT = 9483, BASE = 'http://127.0.0.1:' + PORT;
const NS = { LIVE: 'e4live', E4: 'e4cand', SE24: 'e4all' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (uid, provider) => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
    sub: uid, user_id: uid, aud: 'golfapp-9fb21', iss: 'https://securetoken.google.com/golfapp-9fb21',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    ...(provider === 'anonymous' ? {} : { email: uid + '@example.test', email_verified: true }),
    firebase: { sign_in_provider: provider || 'password' } }) + '.';
const AS = { owner: token('u-org'), stranger: token('u-who'), anon: token('u-anon', 'anonymous') };
async function req(ns, method, p, body, who) {
    const headers = { 'Content-Type': 'application/json' };
    if (who === 'admin') headers.Authorization = 'Bearer owner';
    const q = AS[who] ? '&auth=' + AS[who] : '';
    const r = await fetch(`${BASE}/${p}.json?ns=${NS[ns]}${q}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    await r.text();
    return r.status;
}
const OK = 200;
const emuRules = (s) => s.split('[^@\\\\s]').join('[^@ ]');
const NOW = { '.sv': 'timestamp' };
const K4 = 'a'.repeat(32), K5 = 'b'.repeat(32), KP = 'c'.repeat(32);
const SEED = {
    tournaments: {
        PH1: { name: 'Rattle Classic', ownerUid: 'u-org', createdAt: 1, format: 'scramble', teams: { team4: { num: 4, players: ['Al'] }, team5: { num: 5, players: ['Dee'] } } },
        PHOPEN: { name: 'Unlocked', ownerUid: 'u-org', createdAt: 1, format: 'scramble', teams: { team1: { num: 1, players: ['Ann'] } } },
        PHIND: { name: 'Medal', ownerUid: 'u-org', createdAt: 1, format: 'individual', players: { pat: { id: 'pat', name: 'Pat' } } }
    },
    tournamentKeys: { PH1: { on: true, t: { team4: K4, team5: K5 } }, PHIND: { on: true, p: { pat: KP } } },
    tournamentPhotoMeta: { PH1: {
        pending: { '-Pseed': { team: 'team5', at: 1, w: 1600, h: 1200 } },
        shown: { '-Sseed': { team: 'team5', caption: 'Awards', at: 1, w: 1200, h: 1600 } },
        hidden: { '-Hseed': { team: 'team4', at: 1, w: 10, h: 10, hiddenAt: 2 } },
        reports: { '-Sseed': { count: 1, lastAt: 3 } } } },
    photoProofs: { PH1: { '-Pseed': { who: 'team5', k: K5, t: 1 } } }
};
let emu = null;
const reseed = async () => { for (const ns of Object.keys(NS)) assert.equal(await req(ns, 'PUT', '', SEED, 'admin'), OK); };
const META = (o) => Object.assign({ team: 'team4', caption: 'Team 4 on the 7th tee', at: NOW, w: 1600, h: 1200 }, o || {});
function post(code, id, meta, proof) {
    const u = { [`tournamentPhotoMeta/${code}/pending/${id}`]: meta };
    if (proof) u[`photoProofs/${code}/${id}`] = Object.assign({ t: NOW }, proof);
    return u;
}
const golfer = (ns, body, who) => req(ns, 'PATCH', '', body, who || null);
const BLOCKS = ['E4', 'SE24'];

before(async () => {
    if (SKIP.skip) return;
    emu = spawn(JAVA, ['-jar', JAR, '--host', '127.0.0.1', '--port', String(PORT)], { stdio: 'ignore' });
    let up = false;
    for (let i = 0; i < 80 && !up; i++) { try { await fetch(`${BASE}/.json?ns=${NS.LIVE}`); up = true; } catch (e) { await sleep(250); } }
    if (!up) throw new Error('emulator did not start');
    const live = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
    const all = process.env.E4_RULES_CANDIDATE ? JSON.parse(fs.readFileSync(CAND_FILE, 'utf8')) : build(e2.build(stripe.build(live)));
    for (const [ns, text] of [['LIVE', fs.readFileSync(LIVE_FILE, 'utf8')], ['E4', fs.readFileSync(CAND_FILE, 'utf8')], ['SE24', JSON.stringify(all)]]) {
        const r = await fetch(`${BASE}/.settings/rules.json?ns=${NS[ns]}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: emuRules(text) });
        assert.equal(r.status, OK, ns + ' rules refused: ' + (await r.text()).slice(0, 200));
    }
});
after(() => { if (emu) emu.kill(); });

test('1. the candidate is exactly build(LIVE); it also applies after Stripe and E2; it touches only its two paths', SKIP, () => {
    const live = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
    const cand = JSON.parse(fs.readFileSync(CAND_FILE, 'utf8'));
    assert.deepEqual(cand, build(live));
    assert.ok(cand.rules.tournamentPhotoMeta.$code.pending.$photoId['.write'] && cand.rules.photoProofs.$code.$photoId['.write'], 'positive: the block is in the file');
    const strip = (r) => { const c = JSON.parse(JSON.stringify(r)); delete c.rules.tournamentPhotoMeta; delete c.rules.photoProofs; return c; };
    assert.deepEqual(strip(cand), live);
    const before = e2.build(stripe.build(live));
    assert.deepEqual(strip(build(before)), before, 'after Stripe + E2: everything else identical');
});

test('2. a golfer posts a pending photo from their own card, with their key, in one update', SKIP, async () => {
    for (const ns of BLOCKS) {
        await reseed();
        assert.equal(await golfer(ns, post('PH1', '-Nphoto1', META(), { who: 'team4', k: K4 })), OK, ns + ' team 4');
        assert.equal(await golfer(ns, post('PH1', '-Nphoto2', META({ caption: undefined }), { who: 'team4', k: K4 })), OK, ns + ' no caption');
        assert.equal(await golfer(ns, post('PHIND', '-Nphoto3', META({ team: 'pat', w: 1, h: 1600 }), { who: 'pat', k: KP }), 'anon'), OK, ns + ' individual, anonymous session');
        assert.equal(await golfer(ns, post('PH1', '-Nphoto4', META({ caption: 'x'.repeat(120) }), { who: 'team4', k: K4 })), OK, ns + ' caption 120');
    }
});

test('3. LIVE control: every write and read here is refused on LIVE today (root $other)', SKIP, async () => {
    await reseed();
    assert.notEqual(await golfer('LIVE', post('PH1', '-Nphoto1', META(), { who: 'team4', k: K4 })), OK, 'LIVE refuses a keyed post');
    assert.notEqual(await req('LIVE', 'GET', 'tournamentPhotoMeta/PH1/shown', undefined, null), OK, 'LIVE refuses the wall read');
    for (const ns of BLOCKS) assert.equal(await req(ns, 'GET', 'tournamentPhotoMeta/PH1/shown', undefined, null), OK, ns + ' the wall is public');
});

test('4. a post needs the right key, its own team, a fresh t, a locked event, and stays inside the shape', SKIP, async () => {
    for (const ns of BLOCKS) {
        await reseed();
        const no = async (body, why) => assert.notEqual(await golfer(ns, body), OK, ns + ' ' + why);
        await no(post('PH1', '-Na', META(), { who: 'team4', k: K5 }), 'wrong key');
        await no(post('PH1', '-Nb', META(), { who: 'team5', k: K5 }), 'meta says team4, proof is team5');
        await no(post('PH1', '-Nc', META(), null), 'no proof');
        await no(post('PH1', '-Nd', META(), { who: 'team4', k: K4, t: 1 }), 'a stored t');
        await no(post('PHOPEN', '-Ne', META({ team: 'team1' }), { who: 'team1', k: K4 }), 'an unlocked event (no keys): no photos');
        await no(post('PH1', '-Pseed', META({ team: 'team5' }), { who: 'team5', k: K5 }), 'overwrite an existing pending photo');
        await no(post('PH1', '-Nf', META({ caption: 'x'.repeat(121) }), { who: 'team4', k: K4 }), 'caption 121');
        await no(post('PH1', '-Ng', META({ caption: '' }), { who: 'team4', k: K4 }), 'empty caption');
        await no(post('PH1', '-Nh', META({ w: 1601 }), { who: 'team4', k: K4 }), 'width 1601');
        await no(post('PH1', '-Ni', META({ h: 0 }), { who: 'team4', k: K4 }), 'height 0');
        await no(post('PH1', '-Nj', META({ lat: 33.45, lng: -111.95 }), { who: 'team4', k: K4 }), 'a location in the meta');
        await no(post('PH1', '-Nk', META({ url: 'https://x' }), { who: 'team4', k: K4 }), 'any other field');
        await no(post('PH1', 'bad/id', META(), { who: 'team4', k: K4 }), 'a path in the id');
        assert.equal(await golfer(ns, post('PH1', '-Nok', META(), { who: 'team4', k: K4 })), OK, ns + ' positive');
    }
});

test('5. NO CLIENT moves a photo - not the owner, not a golfer: shown, hidden and reports are the callable\'s', SKIP, async () => {
    for (const ns of ['LIVE', ...BLOCKS]) {
        await reseed();
        for (const who of ['owner', 'stranger', 'anon', null]) {
            const w = who || 'signed-out';
            assert.notEqual(await req(ns, 'PUT', 'tournamentPhotoMeta/PH1/shown/-Pseed', { team: 'team5', at: 1, w: 1, h: 1 }, who), OK, ns + ' shown write by ' + w);
            assert.notEqual(await req(ns, 'PATCH', '', { 'tournamentPhotoMeta/PH1/shown/-Pseed': { team: 'team5', at: 1, w: 1, h: 1 }, 'tournamentPhotoMeta/PH1/pending/-Pseed': null }, who), OK, ns + ' a client move by ' + w);
            assert.notEqual(await req(ns, 'PUT', 'tournamentPhotoMeta/PH1/hidden/-Sseed', { team: 'team5', at: 1, w: 1, h: 1 }, who), OK, ns + ' hidden write by ' + w);
            assert.notEqual(await req(ns, 'PUT', 'tournamentPhotoMeta/PH1/reports/-Sseed', { count: 0 }, who), OK, ns + ' reports write by ' + w);
            assert.notEqual(await req(ns, 'DELETE', 'tournamentPhotoMeta/PH1/pending/-Pseed', undefined, who), OK, ns + ' pending delete by ' + w);
            assert.notEqual(await req(ns, 'DELETE', 'tournamentPhotoMeta/PH1/shown/-Sseed', undefined, who), OK, ns + ' shown delete by ' + w);
        }
        assert.equal(await req(ns, 'PUT', 'tournamentPhotoMeta/PH1/shown/-Pseed', { team: 'team5', at: 1, w: 1, h: 1 }, 'admin'), OK, ns + ' positive: the Admin SDK (the callable) can');
    }
});

test('6. reads: shown is public; pending, hidden and reports are the owner\'s (and a co-organizer\'s); proofs are nobody\'s', SKIP, async () => {
    for (const ns of BLOCKS) {
        await reseed();
        for (const who of [null, 'anon', 'stranger', 'owner']) assert.equal(await req(ns, 'GET', 'tournamentPhotoMeta/PH1/shown', undefined, who), OK, ns + ' shown read by ' + (who || 'signed-out'));
        for (const p of ['pending', 'hidden', 'reports']) {
            assert.equal(await req(ns, 'GET', 'tournamentPhotoMeta/PH1/' + p, undefined, 'owner'), OK, ns + ' owner reads ' + p);
            for (const who of [null, 'anon', 'stranger']) assert.notEqual(await req(ns, 'GET', 'tournamentPhotoMeta/PH1/' + p, undefined, who), OK, ns + ' ' + p + ' by ' + (who || 'signed-out'));
        }
        assert.notEqual(await req(ns, 'GET', 'tournamentPhotoMeta/PH1', undefined, null), OK, ns + ' the whole node is not one read');
        assert.notEqual(await req(ns, 'GET', 'photoProofs/PH1', undefined, 'owner'), OK, ns + ' proofs unreadable');
        assert.equal(await req(ns, 'PUT', 'tournaments/PH1/coOrganizers/u-who@example,test', true, 'admin'), OK);
        assert.equal(await req(ns, 'GET', 'tournamentPhotoMeta/PH1/pending', undefined, 'stranger'), OK, ns + ' a co-organizer reads pending');
    }
});

test('7. a proof is used once: the same photo id cannot be re-posted, and a proof alone does nothing visible', SKIP, async () => {
    for (const ns of BLOCKS) {
        await reseed();
        assert.equal(await golfer(ns, post('PH1', '-Nonce', META(), { who: 'team4', k: K4 })), OK, ns + ' first post');
        assert.notEqual(await golfer(ns, post('PH1', '-Nonce', META({ caption: 'again' }), { who: 'team4', k: K4 })), OK, ns + ' the same id again');
        assert.notEqual(await golfer(ns, { 'photoProofs/PH1/-Nseed2': { who: 'team4', k: K4, t: NOW, extra: 1 } }), OK, ns + ' a proof with an extra field');
    }
});

test('8. built after Stripe and E2: the E2 contest entry and the E4 post both still work in one namespace', SKIP, async () => {
    await reseed();
    assert.equal(await req('SE24', 'PUT', 'tournaments/PH1/contests/h7', { kind: 'kp', allowGps: true }, 'owner'), OK);
    assert.equal(await golfer('SE24', { 'contestEntries/PH1/h7/team4_p0': { name: 'Al', team: 'team4', kind: 'kp', inches: 50, by: 'typed', at: NOW },
        'contestProofs/PH1/h7/team4_p0': { who: 'team4', k: K4, t: NOW } }), OK, 'E2 entry');
    assert.equal(await golfer('SE24', post('PH1', '-Nboth', META(), { who: 'team4', k: K4 })), OK, 'E4 post');
});

test('9. existing flows are unchanged on LIVE and with the block: keyed score, owner edit, public read', SKIP, async () => {
    await reseed();
    for (const ns of ['LIVE', ...BLOCKS]) {
        assert.equal(await golfer(ns, { 'tournaments/PH1/scores/team4_h7': 3, 'scoreProofs/PH1/team4_h7': { who: 'team4', k: K4, t: NOW } }), OK, ns + ' keyed score');
        assert.equal(await req(ns, 'PATCH', 'tournaments/PH1', { name: 'Renamed' }, 'owner'), OK, ns + ' owner edit');
        assert.equal(await req(ns, 'GET', 'tournaments/PH1', undefined, null), OK, ns + ' public read');
    }
});
