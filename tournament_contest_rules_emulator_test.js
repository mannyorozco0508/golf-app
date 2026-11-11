// ============================================================================
// E2 CONTEST HOLES RULES BLOCK, IN THE FIREBASE DATABASE EMULATOR (2026-11-09)
//
// Three namespaces on one emulator (local port 9481 - the Stripe tests use
// 9473/9474 and the E1/E3 helper builds in parallel; nothing live, no rules
// published):
//   LIVE  = the LIVE rules read read-only on 2026-11-09 (database:get
//           /.settings/rules), saved as the ROLLBACK file in the inbox.
//   E2    = LIVE + this block: the CANDIDATE file in the inbox. Test 1 proves
//           it is exactly build(LIVE), so the file tested is the file published.
//   SE2   = LIVE + the Stripe block + this block (the publish order: Stripe, E1,
//           E2, ...; E1 is the other helper's and is not here), built in memory
//           with tools/stripe-rules-candidate.js then this builder.
// The repo's database.rules.json is NOT used and NOT changed (it is behind live).
//
// Golfers write the way tournament-scorecard.html does: signed out, ONE root
// multi-path PATCH carrying the entry and its proof, t and at as the server's
// timestamp ({".sv": "timestamp"}). The organizer is an email-signed-in uid.
// Measured on emulator 4.11.2: a Bearer header is ADMIN, so only seeding uses one.
//
// CONTROLS. contestEntries / contestProofs are NEW top-level paths: on LIVE they
// fall to the root $other (read false, write false), so LIVE refuses every
// golfer entry - test 4 shows that, which is what proves the block is what
// OPENS them. Each refusal INSIDE the block is then proven by a negative control
// (a mutated candidate via E2_RULES_CANDIDATE) rather than by LIVE. For
// tournaments/<code>/contests, which LIVE already lets the owner write with no
// typing at all, LIVE is the control (test 9).
//
// Skipped when the emulator jar, Java, or an inbox file is missing.
// Env: E2_RULES_LIVE / E2_RULES_CANDIDATE point elsewhere (negative controls).
//
// BASELINE (final file, branch event-e2e4 on cf86caf8 + the E2 commit's files):
//   against LIVE as the candidate (E2_RULES_CANDIDATE := the rollback file):
//   all 12 tests: 2 PASS / 10 FAIL. Pass: 3 (existing flows) and 12 (a
//   golfer can never write the winner - LIVE's own rule, kept). Fail: the
//   other 10 (no block: entries refused, contests untyped).
//   against the CANDIDATE: all 12 tests: 12 PASS / 0 FAIL.
// NEGATIVE CONTROLS (12, each a mutated candidate in the scratchpad via
//   E2_RULES_CANDIDATE; the inbox file untouched): all 12 caught by a test
//   other than test 1 - lockedAt ignored (8), k ignored (5), no proof needed
//   (5, 11), entry $other removed (7), inches unbounded (6, 10), yards
//   unbounded (6), allowGps unchecked (6), winner not an entry (9), proofs
//   readable (8), team label unchecked (5), contests $other removed (9),
//   entry write open to any signed-in uid (8, 11).
// ============================================================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { build } = require('./tools/event-contests-rules-candidate.js');
const stripe = require('./tools/stripe-rules-candidate.js');

const INBOX = path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'inbox');
const LIVE_FILE = process.env.E2_RULES_LIVE || path.join(INBOX, 'TOURNAMENTS-EVENT-RULES-ROLLBACK-live-20261109.json');
const CAND_FILE = process.env.E2_RULES_CANDIDATE || path.join(INBOX, 'TOURNAMENTS-E2-RULES-CANDIDATE.json');

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
const SKIP = !fs.existsSync(LIVE_FILE) ? { skip: 'no saved live rules ' + LIVE_FILE }
    : !fs.existsSync(CAND_FILE) ? { skip: 'no candidate ' + CAND_FILE }
    : (!JAR || !JAVA) ? { skip: 'no RTDB emulator (jar/Java) on this machine' } : {};

const PORT = 9481, BASE = 'http://127.0.0.1:' + PORT;
const NS = { LIVE: 'e2live', E2: 'e2cand', SE2: 'e2stripe' };
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
const emuRules = (s) => s.split('[^@\\\\s]').join('[^@ ]');   // emulator-only: it cannot load \s in a class (file on disk untouched)
const NOW = { '.sv': 'timestamp' };
const K4 = 'a'.repeat(32), K5 = 'b'.repeat(32), KP1 = 'c'.repeat(32), KG = 'd'.repeat(32);

const SEED = {
    tournaments: {
        CT1: { name: 'Rattle Classic', ownerUid: 'u-org', createdAt: 1, format: 'scramble',
            teams: { team4: { num: 4, name: 'Team 4', players: ['Al Lopez', 'Jo Kim'] }, team5: { num: 5, name: 'Team 5', players: ['Dee Nguyen'] } },
            contests: {
                h7: { kind: 'kp', allowGps: true },
                h12: { kind: 'ld', fairwayOnly: true, allowGps: true },
                h16: { kind: 'kp', allowGps: false },
                h3: { kind: 'kp', allowGps: true, winner: 'team5_p0', lockedAt: 5 }
            } },
        CTOPEN: { name: 'Unlocked', ownerUid: 'u-org', createdAt: 1, format: 'scramble',
            teams: { team1: { num: 1, players: ['Ann'] } }, contests: { h7: { kind: 'kp', allowGps: true } } },
        CTIND: { name: 'Individual', ownerUid: 'u-org', createdAt: 1, format: 'individual',
            players: { p1: { id: 'p1', name: 'Pat Reyes' }, p2: { id: 'p2', name: 'Sam Ortiz' } },
            scoringGroups: { g1: { playerIds: ['p1'] }, g2: { playerIds: ['p2'] } },
            contests: { h12: { kind: 'ld', allowGps: true } } }
    },
    tournamentKeys: {
        CT1: { on: true, t: { team4: K4, team5: K5 } },
        CTIND: { on: true, g: { g1: KP1, g2: KG }, p: { p1: KP1, p2: KG } }
    },
    contestEntries: { CT1: { h3: { team5_p0: { name: 'Dee Nguyen', team: 'team5', kind: 'kp', inches: 37, by: 'typed', at: 4 } } } }
};
let emu = null;
const reseed = async () => { for (const ns of Object.keys(NS)) assert.equal(await req(ns, 'PUT', '', SEED, 'admin'), OK); };

// The scorecard's write: one root update, entry + proof.
const KP = (o) => Object.assign({ name: 'Al Lopez', team: 'team4', kind: 'kp', inches: 100, by: 'typed', at: NOW }, o || {});
const LD = (o) => Object.assign({ name: 'Al Lopez', team: 'team4', kind: 'ld', yards: 287, by: 'typed', at: NOW }, o || {});
function entry(code, hole, key, rec, proof) {
    const u = { [`contestEntries/${code}/${hole}/${key}`]: rec };
    if (proof) u[`contestProofs/${code}/${hole}/${key}`] = Object.assign({ t: NOW }, proof);
    return u;
}
const golfer = (ns, body) => req(ns, 'PATCH', '', body, null);
const BLOCKS = ['E2', 'SE2'];

before(async () => {
    if (SKIP.skip) return;
    emu = spawn(JAVA, ['-jar', JAR, '--host', '127.0.0.1', '--port', String(PORT)], { stdio: 'ignore' });
    let up = false;
    for (let i = 0; i < 80 && !up; i++) { try { await fetch(`${BASE}/.json?ns=${NS.LIVE}`); up = true; } catch (e) { await sleep(250); } }
    if (!up) throw new Error('emulator did not start');
    const live = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
    const se2 = process.env.E2_RULES_CANDIDATE ? JSON.parse(fs.readFileSync(CAND_FILE, 'utf8')) : build(stripe.build(live));
    for (const [ns, text] of [['LIVE', fs.readFileSync(LIVE_FILE, 'utf8')], ['E2', fs.readFileSync(CAND_FILE, 'utf8')], ['SE2', JSON.stringify(se2)]]) {
        const r = await fetch(`${BASE}/.settings/rules.json?ns=${NS[ns]}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: emuRules(text) });
        assert.equal(r.status, OK, ns + ' rules refused by the emulator: ' + (await r.text()).slice(0, 200));
    }
});
after(() => { if (emu) emu.kill(); });

const stripBlock = (r) => { const c = JSON.parse(JSON.stringify(r)); delete c.rules.contestEntries; delete c.rules.contestProofs; delete c.rules.tournaments.$tourneyCode.contests; return c; };

test('1. the candidate is exactly build(LIVE); built on the Stripe candidate it applies too; the block touches only its three paths', SKIP, () => {
    const live = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
    const cand = JSON.parse(fs.readFileSync(CAND_FILE, 'utf8'));
    assert.deepEqual(cand, build(live));
    // Positive: the block is really in the file.
    assert.ok(cand.rules.contestEntries.$code.$hole.$entryKey['.write'] && cand.rules.contestProofs.$code.$hole.$entryKey['.write'] && cand.rules.tournaments.$tourneyCode.contests.$hole);
    assert.deepEqual(stripBlock(cand), live, 'everything else is identical to LIVE');
    const st = stripe.build(live);
    const se2 = build(st);
    assert.deepEqual(stripBlock(se2), st, 'on top of Stripe: everything else is identical to LIVE + Stripe');
    assert.ok(se2.rules.payments && se2.rules.contestEntries, 'both blocks present');
});

test('2. a golfer enters for their OWN card with their key: KP and long drive, team and individual, on E2 and Stripe+E2', SKIP, async () => {
    for (const ns of BLOCKS) {
        await reseed();
        assert.equal(await golfer(ns, entry('CT1', 'h7', 'team4_p0', KP(), { who: 'team4', k: K4 })), OK, ns + ' KP 8 ft 4 in');
        assert.equal(await golfer(ns, entry('CT1', 'h7', 'team4_p1', KP({ name: 'Jo Kim', inches: 492 }), { who: 'team4', k: K4 })), OK, ns + ' second golfer on the card');
        assert.equal(await golfer(ns, entry('CT1', 'h7', 'team4_p0', KP({ inches: 90 }), { who: 'team4', k: K4 })), OK, ns + ' a golfer corrects their own entry');
        assert.equal(await golfer(ns, entry('CT1', 'h12', 'team4_p0', LD(), { who: 'team4', k: K4 })), OK, ns + ' long drive 287');
        assert.equal(await golfer(ns, entry('CT1', 'h7', 'team5_p0', KP({ name: 'Dee', team: 'team5', inches: 0, by: 'gps', accFt: 9 }), { who: 'team5', k: K5 })), OK, ns + ' a GPS mark (app) on an allowGps hole, 0 in');
        assert.equal(await golfer(ns, entry('CTIND', 'h12', 'p1', LD({ name: 'Pat Reyes', team: 'p1', yards: 450 }), { who: 'p1', k: KP1 })), OK, ns + ' individual, its group key, 450 yds');
        assert.equal(await golfer(ns, entry('CTIND', 'h12', 'p2', LD({ name: 'Sam', team: 'p2', yards: 50 }), { who: 'p2', k: KG })), OK, ns + ' individual, 50 yds');
        const got = await (await fetch(`${BASE}/contestEntries/CT1/h7/team4_p0.json?ns=${NS[ns]}`)).json();
        assert.equal(got.inches, 90, 'public read returns the entry');
        assert.equal(typeof got.at, 'number', 'at is the server time');
    }
});

test('3. existing flows are unchanged on LIVE, E2 and Stripe+E2: keyed score, owner edit, public read', SKIP, async () => {
    await reseed();
    for (const ns of ['LIVE', 'E2', 'SE2']) {
        assert.equal(await golfer(ns, { 'tournaments/CT1/scores/team4_h7': 3, 'scoreProofs/CT1/team4_h7': { who: 'team4', k: K4, t: NOW } }), OK, ns + ' keyed score');
        assert.notEqual(await golfer(ns, { 'tournaments/CT1/scores/team4_h8': 3, 'scoreProofs/CT1/team4_h8': { who: 'team4', k: K5, t: NOW } }), OK, ns + ' score with the wrong key');
        assert.equal(await req(ns, 'PATCH', 'tournaments/CT1', { name: 'Renamed' }, 'owner'), OK, ns + ' owner edit');
        assert.equal(await req(ns, 'GET', 'tournaments/CT1', undefined, null), OK, ns + ' public read of the event');
    }
});

test('4. LIVE control: today every contest entry and proof is refused (root $other), so the block is what opens them', SKIP, async () => {
    await reseed();
    assert.notEqual(await golfer('LIVE', entry('CT1', 'h7', 'team4_p0', KP(), { who: 'team4', k: K4 })), OK, 'LIVE refuses a keyed KP');
    assert.notEqual(await req('LIVE', 'GET', 'contestEntries/CT1', undefined, null), OK, 'LIVE refuses the board read');
    for (const ns of BLOCKS) assert.equal(await req(ns, 'GET', 'contestEntries/CT1', undefined, null), OK, ns + ' the board is public');
});

test('5. the key decides the card: wrong key, another team, no proof, a stale t, a proof alone - all refused', SKIP, async () => {
    for (const ns of BLOCKS) {
        await reseed();
        const no = async (body, why) => assert.notEqual(await golfer(ns, body), OK, ns + ' ' + why);
        await no(entry('CT1', 'h7', 'team4_p0', KP(), { who: 'team4', k: K5 }), 'team 5 key on team 4');
        await no(entry('CT1', 'h7', 'team5_p0', KP({ team: 'team5' }), { who: 'team4', k: K4 }), 'team 4 enters for team 5 (who team4)');
        await no(entry('CT1', 'h7', 'team5_p0', KP({ team: 'team5' }), { who: 'team5', k: K4 }), 'team 4 key, claiming team 5');
        await no(entry('CT1', 'h7', 'team4_p0', KP({ team: 'team5' }), { who: 'team4', k: K4 }), 'own card, entry labelled with another team');
        await no(entry('CT1', 'h7', 'team4_p0', KP(), null), 'no proof on a locked event');
        await no(entry('CT1', 'h7', 'team4_p0', KP(), { who: 'team4', k: K4, t: 1 }), 'a stored t (not now)');
        await no(entry('CTIND', 'h12', 'p2', LD({ team: 'p2' }), { who: 'p2', k: KP1 }), 'individual: p1 key for p2');
        await no({ 'contestEntries/CT1/h7/team4_p0': KP(), 'scoreProofs/CT1/team4_h7': { who: 'team4', k: K4, t: NOW } }, 'a SCORE proof does not admit an entry');
        // positive in the same block: the right key on the same path is accepted
        assert.equal(await golfer(ns, entry('CT1', 'h7', 'team4_p0', KP(), { who: 'team4', k: K4 })), OK, ns + ' positive');
    }
});

test('6. the numbers are bounded and typed, and the kind matches the hole', SKIP, async () => {
    for (const ns of BLOCKS) {
        await reseed();
        const P = { who: 'team4', k: K4 };
        const no = async (hole, rec, why) => assert.notEqual(await golfer(ns, entry('CT1', hole, 'team4_p0', rec, P)), OK, ns + ' ' + why);
        await no('h7', KP({ inches: 1201 }), 'inches 1201');
        await no('h7', KP({ inches: -1 }), 'inches -1');
        await no('h7', KP({ inches: 8.5 }), 'inches 8.5');
        await no('h7', KP({ inches: '100' }), 'inches as a string');
        await no('h12', LD({ yards: 49 }), 'yards 49');
        await no('h12', LD({ yards: 451 }), 'yards 451');
        await no('h12', LD({ yards: 287.5 }), 'yards 287.5');
        await no('h7', LD(), 'yards on a KP hole');
        await no('h12', KP(), 'inches on a long-drive hole');
        await no('h7', KP({ yards: 287 }), 'both inches and yards');
        await no('h9', KP(), 'a hole that is not a contest hole');
        await no('h16', KP({ by: 'gps', accFt: 5 }), 'a GPS mark where allowGps is false');
        await no('h7', KP({ by: 'laser' }), 'by outside typed/gps');
        await no('h7', KP({ name: '' }), 'empty name');
        await no('h7', KP({ name: 'x'.repeat(61) }), 'name over 60');
        await no('h7', KP({ accFt: 301, by: 'gps' }), 'accFt over 300');
        assert.equal(await golfer(ns, entry('CT1', 'h7', 'team4_p0', KP({ inches: 1200 }), P)), OK, ns + ' positive: 1200 in');
        assert.equal(await golfer(ns, entry('CT1', 'h16', 'team4_p0', KP({ inches: 12 }), P)), OK, ns + ' positive: typed on the no-GPS hole');
    }
});

test('7. NO COORDINATE CAN BE STORED: any field beyond the eight is refused - lat, lng, a point, a nested position', SKIP, async () => {
    for (const ns of BLOCKS) {
        await reseed();
        const P = { who: 'team4', k: K4 };
        for (const [why, extra] of [['lat', { lat: 33.45 }], ['lng', { lng: -111.95 }], ['latitude/longitude', { latitude: 33.45, longitude: -111.95 }],
            ['pt', { pt: [33.45, -111.95] }], ['ball', { ball: { lat: 33.45, lng: -111.95 } }], ['cup', { cup: '33.45,-111.95' }]]) {
            assert.notEqual(await golfer(ns, entry('CT1', 'h7', 'team4_p0', KP(Object.assign({ by: 'gps', accFt: 9 }, extra)), P)), OK, ns + ' entry with ' + why);
        }
        assert.notEqual(await golfer(ns, entry('CT1', 'h7', 'team4_p0', KP(), Object.assign({ lat: 33.45 }, P))), OK, ns + ' a proof with lat');
        assert.equal(await golfer(ns, entry('CT1', 'h7', 'team4_p0', KP({ by: 'gps', accFt: 9 }), P)), OK, ns + ' positive: the eight fields');
    }
});

test('8. "Make winner" locks the hole: a confirmed hole takes no new entry, even with the right key; the owner can still remove', SKIP, async () => {
    for (const ns of BLOCKS) {
        await reseed();
        assert.notEqual(await golfer(ns, entry('CT1', 'h3', 'team4_p0', KP({ inches: 1 }), { who: 'team4', k: K4 })), OK, ns + ' a later entry on a locked hole');
        assert.notEqual(await golfer(ns, entry('CT1', 'h3', 'team5_p0', KP({ name: 'Dee', team: 'team5', inches: 1 }), { who: 'team5', k: K5 })), OK, ns + ' the winner rewrites their own entry after the lock');
        assert.equal(await golfer(ns, entry('CT1', 'h7', 'team4_p0', KP(), { who: 'team4', k: K4 })), OK, ns + ' an open hole still takes entries');
        assert.equal(await req(ns, 'PATCH', 'tournaments/CT1/contests/h7', { winner: 'team4_p0', lockedAt: NOW }, 'owner'), OK, ns + ' owner Make winner');
        assert.notEqual(await golfer(ns, entry('CT1', 'h7', 'team4_p1', KP({ name: 'Jo', inches: 1 }), { who: 'team4', k: K4 })), OK, ns + ' entry after Make winner');
        assert.equal(await req(ns, 'DELETE', 'contestEntries/CT1/h7/team4_p1', undefined, 'owner'), OK, ns + ' owner Remove');
        assert.notEqual(await req(ns, 'DELETE', 'contestEntries/CT1/h3/team5_p0', undefined, null), OK, ns + ' a signed-out visitor cannot remove');
        assert.notEqual(await req(ns, 'DELETE', 'contestEntries/CT1/h3/team5_p0', undefined, 'stranger'), OK, ns + ' a stranger cannot remove');
        assert.notEqual(await req(ns, 'GET', 'contestProofs/CT1', undefined, 'stranger'), OK, ns + ' proofs (they hold keys) are unreadable');
        assert.notEqual(await req(ns, 'GET', 'contestProofs/CT1', undefined, 'owner'), OK, ns + ' proofs unreadable even to the owner (no client needs them)');
    }
});

test('9. contests/<hole> is typed for the owner; LIVE (the control) accepts every one of these today', SKIP, async () => {
    const BAD = [['kind xx', 'h7', { kind: 'xx', allowGps: true }], ['hole h19', 'h19', { kind: 'kp', allowGps: true }], ['no allowGps', 'h8', { kind: 'kp' }],
        ['allowGps string', 'h8', { kind: 'kp', allowGps: 'yes' }], ['extra field', 'h8', { kind: 'kp', allowGps: true, prize: 50 }],
        ['winner without lockedAt', 'h7', { kind: 'kp', allowGps: true, winner: 'team5_p0' }],
        ['winner not an entry', 'h7', { kind: 'kp', allowGps: true, winner: 'team9_p0', lockedAt: 1 }]];
    for (const ns of ['LIVE', ...BLOCKS]) {
        await reseed();
        for (const [why, hole, rec] of BAD) {
            const s = await req(ns, 'PUT', 'tournaments/CT1/contests/' + hole, rec, 'owner');
            if (ns === 'LIVE') assert.equal(s, OK, 'LIVE accepts ' + why);
            else assert.notEqual(s, OK, ns + ' refuses ' + why);
        }
        assert.equal(await req(ns, 'PUT', 'tournaments/CT1/contests/h8', { kind: 'ld', fairwayOnly: true, allowGps: false }, 'owner'), OK, ns + ' positive: owner adds a hole');
        assert.equal(await req(ns, 'DELETE', 'tournaments/CT1/contests/h8', undefined, 'owner'), OK, ns + ' positive: owner removes a hole');
    }
});

test('10. an UNLOCKED event takes an entry as it takes a score - no key needed (the scorecard lock is what binds a card)', SKIP, async () => {
    for (const ns of BLOCKS) {
        await reseed();
        assert.equal(await golfer(ns, entry('CTOPEN', 'h7', 'team1_p0', KP({ name: 'Ann', team: 'team1' }), null)), OK, ns + ' unlocked: entry without a proof');
        assert.equal(await golfer(ns, { 'tournaments/CTOPEN/scores/team1_h7': 3 }), OK, ns + ' unlocked: a score without a proof (LIVE rule, for comparison)');
        assert.notEqual(await golfer(ns, entry('CTOPEN', 'h7', 'team1_p0', KP({ name: 'Ann', team: 'team1', inches: 5000 }), null)), OK, ns + ' unlocked: still bounded');
    }
});

test('11. the owner and a co-organizer manage entries; a stranger and an anonymous session cannot write one', SKIP, async () => {
    for (const ns of BLOCKS) {
        await reseed();
        assert.equal(await req(ns, 'PUT', 'contestEntries/CT1/h7/team4_p0', KP({ at: 9 }), 'owner'), OK, ns + ' owner writes an entry by hand');
        assert.equal(await req(ns, 'PUT', 'tournaments/CT1/coOrganizers/u-who@example,test', true, 'admin'), OK);
        assert.equal(await req(ns, 'DELETE', 'contestEntries/CT1/h7/team4_p0', undefined, 'stranger'), OK, ns + ' a co-organizer removes');
        assert.notEqual(await req(ns, 'PUT', 'contestEntries/CT1/h7/team4_p0', KP({ at: 9 }), 'anon'), OK, ns + ' an anonymous session without a proof');
    }
});

test('12. only the owner sets the winner: a golfer (signed out or anonymous) cannot write contests at all, on LIVE or with the block', SKIP, async () => {
    await reseed();
    for (const ns of ['LIVE', ...BLOCKS]) {
        for (const who of [null, 'anon', 'stranger']) {
            assert.notEqual(await req(ns, 'PATCH', 'tournaments/CT1/contests/h3', { winner: 'team4_p0' }, who), OK, ns + ' winner by ' + (who || 'signed-out'));
            assert.notEqual(await req(ns, 'PATCH', '', { 'tournaments/CT1/contests/h7/winner': 'team4_p0', 'tournaments/CT1/contests/h7/lockedAt': NOW,
                'scoreProofs/CT1/team4_h7': { who: 'team4', k: K4, t: NOW } }, who), OK, ns + ' winner riding a keyed update, by ' + (who || 'signed-out'));
        }
    }
});
