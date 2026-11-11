// ============================================================================
// E3 PACE OF PLAY RULES BLOCK, IN THE FIREBASE DATABASE EMULATOR (2026-11-09)
//
// Four namespaces on one emulator (local port 9563, nothing live, nothing
// published):
//   LIVE  = the LIVE rules read read-only on 2026-11-09, the E3 ROLLBACK file.
//   CAND  = LIVE + E3, the CANDIDATE file in the inbox (arm 1: == build(LIVE)).
//   PRIOR = LIVE + Stripe + E1 (tools/stripe-rules-candidate.js, then
//           tools/e1-rules-candidate.js): what live will hold before E3 in the
//           publish order Stripe, E1, E2, E3, E4. E2 is another helper's block
//           and is NOT in this branch, so it is not stacked here.
//   PCAND = PRIOR + E3.
// The repo's database.rules.json is NOT used and NOT changed.
//
// LIVE / PRIOR are the controls: what E3 refuses is accepted there (so E3 is
// what refuses it) and what E3 opens is closed there; every flow that exists
// today passes on all four.
//
// Skipped when the emulator jar, Java, or an inbox file is missing.
// Env E3_RULES_CANDIDATE points CAND at another file (the negative controls).
//
// BASELINE (final file, branch event-e1e3): CAND := the live file
//   (E3_RULES_CANDIDATE=<rollback>): all 7 tests: 2 PASS / 5 FAIL. Pass: 2
//   (existing flows) and 6 (refusals live already makes). Fail: 1, 3, 4, 5, 7.
//   Against the CANDIDATE: all 7 tests: 7 PASS / 0 FAIL.
// ============================================================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const E3 = require('./tools/e3-rules-candidate.js');
const E1 = require('./tools/e1-rules-candidate.js');
const STRIPE = require('./tools/stripe-rules-candidate.js');

const INBOX = path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'inbox');
const LIVE_FILE = path.join(INBOX, 'TOURNAMENTS-E3-RULES-ROLLBACK-live-20261109.json');
const CAND_FILE = process.env.E3_RULES_CANDIDATE || path.join(INBOX, 'TOURNAMENTS-E3-RULES-CANDIDATE.json');

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

const PORT = 9563, BASE = 'http://127.0.0.1:' + PORT;
const NS = { LIVE: 'e3live', CAND: 'e3cand', PRIOR: 'e3prior', PCAND: 'e3pcand' };
const ALL = Object.keys(NS), ON = ['CAND', 'PCAND'], OFF = ['LIVE', 'PRIOR'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (uid, provider) => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
    sub: uid, user_id: uid, aud: 'golfapp-9fb21', iss: 'https://securetoken.google.com/golfapp-9fb21',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    ...(provider === 'anonymous' ? {} : { email: uid + '@example.test', email_verified: true }),
    firebase: { sign_in_provider: provider || 'password' } }) + '.';
const AS = { owner: token('u-org'), stranger: token('u-who'), co: token('u-co'), anon: token('u-anon', 'anonymous') };
async function req(ns, method, p, body, who) {
    const headers = { 'Content-Type': 'application/json' };
    if (who === 'admin') headers.Authorization = 'Bearer owner';
    const q = AS[who] ? '&auth=' + AS[who] : '';
    const r = await fetch(`${BASE}/${p}.json?ns=${NS[ns]}${q}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.text() };
}
const st = async (...a) => (await req(...a)).status;
const OK = 200;
const emuRules = (s) => s.split('[^@\\\\s]').join('[^@ ]');
const SV = { '.sv': 'timestamp' };
const KEY = 'a'.repeat(32);
const NUDGE = (extra) => Object.assign({ at: SV, tpl: 'pace1', thru: 6 }, extra || {});

const SEED = {
    tournaments: {
        E3T: { name: 'Rattle Classic', ownerUid: 'u-org', createdAt: 1, format: 'scramble', startType: 'shotgun', startTime: '08:00',
            teams: { team7: { num: 7, name: 'Team 7', players: ['Ann'], startingHole: 7 } },
            coOrganizers: { 'u-co@example,test': true },
            nudges: { team9: { at: 5, tpl: 'pace1', thru: 3 } } }
    },
    tournamentKeys: { E3T: { on: true, t: { team7: KEY } } },
    scoreProofs: { E3T: { team7_h7: { who: 'team7', k: KEY, t: 1000 }, r: { r1: { team7_h1: { who: 'team7', k: KEY, t: 2000 } } } } }
};
let emu = null;
const reseed = async () => { for (const ns of ALL) assert.equal(await st(ns, 'PUT', '', SEED, 'admin'), OK); };

let RULES = {};
before(async () => {
    if (SKIP.skip) return;
    const live = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
    const prior = E1.build(STRIPE.build(live));
    RULES = { LIVE: fs.readFileSync(LIVE_FILE, 'utf8'), CAND: fs.readFileSync(CAND_FILE, 'utf8'), PRIOR: JSON.stringify(prior), PCAND: JSON.stringify(E3.build(prior)) };
    emu = spawn(JAVA, ['-jar', JAR, '--host', '127.0.0.1', '--port', String(PORT)], { stdio: 'ignore' });
    let up = false;
    for (let i = 0; i < 80 && !up; i++) { try { await fetch(`${BASE}/.json?ns=${NS.LIVE}`); up = true; } catch (e) { await sleep(250); } }
    if (!up) throw new Error('emulator did not start');
    for (const ns of ALL) {
        const r = await fetch(`${BASE}/.settings/rules.json?ns=${NS[ns]}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: emuRules(RULES[ns]) });
        assert.equal(r.status, OK, ns + ' rules refused by the emulator: ' + (await r.text()).slice(0, 200));
    }
});
after(() => { if (emu) emu.kill(); });

function leaves(o, p, out) {
    out = out || {};
    if (o && typeof o === 'object') for (const k of Object.keys(o)) leaves(o[k], p + '/' + k, out);
    else out[p] = o;
    return out;
}
const under = (p, roots) => roots.some((r) => p === r || p.startsWith(r + '/'));

test('1. CAND is exactly build(LIVE); PCAND is build(Stripe+E1(LIVE)); outside E3\'s three paths both are byte-identical to what they were built on', SKIP, () => {
    const live = JSON.parse(RULES.LIVE), cand = JSON.parse(RULES.CAND);
    assert.deepEqual(cand, E3.build(live), 'the inbox CANDIDATE is not build(ROLLBACK) - rebuild it');
    for (const [base, built] of [[live, cand], [JSON.parse(RULES.PRIOR), JSON.parse(RULES.PCAND)]]) {
        const a = leaves(base, ''), b = leaves(built, '');
        const moved = Object.keys(Object.assign({}, a, b)).filter((k) => a[k] !== b[k]);
        assert.ok(moved.length > 0, 'positive: the block adds something');
        assert.deepEqual(moved.filter((k) => !under(k, E3.PATHS)), [], 'E3 moved a rule outside its own paths');
        assert.ok(E3.PATHS.every((p) => moved.some((k) => under(k, [p]))), 'each of the three paths is added');
    }
    assert.throws(() => E3.build(cand), /LIVE HAS MOVED/, 'building twice refuses');
});

test('2. EXISTING FLOWS, all four namespaces: keyed golfer score (single and round proof), board read with nudges, owner edit, co-organizer edit; a golfer still cannot read proofs', SKIP, async () => {
    await reseed();
    for (const ns of ALL) {
        assert.equal(await st(ns, 'PATCH', '', { 'tournaments/E3T/scores/team7_h8': 4, 'scoreProofs/E3T/team7_h8': { who: 'team7', k: KEY, t: SV } }), OK, ns + ' keyed score');
        assert.equal(await st(ns, 'PUT', 'tournaments/E3T/rounds/r1', { name: 'Round 1', courseData: [] }, 'owner'), OK, ns + ' owner adds a round');
        assert.equal(await st(ns, 'PATCH', '', { 'tournaments/E3T/rounds/r1/scores/team7_h2': 4, 'scoreProofs/E3T/r/r1/team7_h2': { who: 'team7', k: KEY, t: SV } }), OK, ns + ' keyed round score');
        const read = await req(ns, 'GET', 'tournaments/E3T');
        assert.equal(read.status, OK); assert.match(read.body, /"pace1"/, ns + ' positive: the board read carries the nudge');
        assert.equal(await st(ns, 'PUT', 'tournaments/E3T/name', 'Renamed', 'owner'), OK, ns + ' owner edit');
        assert.equal(await st(ns, 'PUT', 'tournaments/E3T/venue', 'Papago', 'co'), OK, ns + ' co-organizer edit');
        assert.notEqual(await st(ns, 'GET', 'scoreProofs/E3T'), OK, ns + ' signed-out proof read');
        assert.notEqual(await st(ns, 'GET', 'scoreProofs/E3T/team7_h7', undefined, 'anon'), OK, ns + ' anonymous proof read');
    }
});

test('3. ALLOWED with E3: owner turns pace on (120 / 255 / 360), sends a nudge to a team and a group with server time, deletes one, reads the proofs (event and round)', SKIP, async () => {
    for (const ns of ON) {
        await reseed();
        for (const m of [120, 255, 360]) assert.equal(await st(ns, 'PUT', 'tournaments/E3T/pace', { on: true, targetMin: m }, 'owner'), OK, ns + ' pace ' + m);
        assert.equal(await st(ns, 'PUT', 'tournaments/E3T/pace', { on: false, targetMin: 255 }, 'owner'), OK, ns + ' pace off');
        assert.equal(await st(ns, 'PUT', 'tournaments/E3T/nudges/team7', NUDGE(), 'owner'), OK, ns + ' nudge team');
        assert.equal(await st(ns, 'PUT', 'tournaments/E3T/nudges/gk3j9abc', NUDGE({ thru: 0 }), 'owner'), OK, ns + ' nudge group');
        assert.equal(await st(ns, 'PUT', 'tournaments/E3T/nudges/team7', NUDGE({ thru: 18 }), 'owner'), OK, ns + ' thru 18');
        assert.equal(await st(ns, 'DELETE', 'tournaments/E3T/nudges/team9', undefined, 'owner'), OK, ns + ' delete nudge');
        const p = await req(ns, 'GET', 'scoreProofs/E3T', undefined, 'owner');
        assert.equal(p.status, OK, ns + ' owner reads proofs'); assert.match(p.body, /"t":1000/); assert.match(p.body, /"t":2000/);
        assert.equal(await st(ns, 'GET', 'scoreProofs/E3T/r/r1', undefined, 'owner'), OK, ns + ' owner reads a round');
        const whole = JSON.parse((await req(ns, 'GET', 'tournaments/E3T', undefined, 'admin')).body);
        assert.equal(await st(ns, 'PUT', 'tournaments/E3T', whole, 'owner'), OK, ns + ' owner full set keeps pace and nudges');
    }
});

test('4. REFUSED with E3: pace by stranger / co-organizer / anonymous; untyped pace; nudge by stranger / co-organizer / signed out; free text, other tpl, bad thru, future at, bad key, extra field', SKIP, async () => {
    for (const ns of ON) {
        await reseed();
        const no = async (p, body, who, why) => assert.notEqual(await st(ns, 'PUT', p, body, who), OK, ns + ' ' + why);
        await no('tournaments/E3T/pace', { on: true, targetMin: 255 }, 'stranger', 'stranger pace');
        await no('tournaments/E3T/pace', { on: true, targetMin: 255 }, 'co', 'co-organizer pace');
        await no('tournaments/E3T/pace', { on: true, targetMin: 255 }, 'anon', 'anonymous pace');
        for (const bad of [{ on: true, targetMin: 119 }, { on: true, targetMin: 361 }, { on: true, targetMin: 255.5 }, { on: true, targetMin: '255' }, { on: 'yes', targetMin: 255 }, { on: true }, { targetMin: 255 }, { on: true, targetMin: 255, lat: 33.4 }])
            await no('tournaments/E3T/pace', bad, 'owner', 'pace ' + JSON.stringify(bad));
        await no('tournaments/E3T/nudges/team7', NUDGE(), 'stranger', 'stranger nudge');
        await no('tournaments/E3T/nudges/team7', NUDGE(), 'co', 'co-organizer nudge');
        await no('tournaments/E3T/nudges/team7', NUDGE(), undefined, 'signed-out nudge');
        for (const bad of [NUDGE({ tpl: 'pace2' }), NUDGE({ text: 'Hurry up, Team 7' }), NUDGE({ thru: 19 }), NUDGE({ thru: -1 }), NUDGE({ thru: 2.5 }), NUDGE({ at: Date.now() + 3600000 }), { at: SV, tpl: 'pace1' }, 'pace1'])
            await no('tournaments/E3T/nudges/team7', bad, 'owner', 'nudge ' + JSON.stringify(bad));
        await no('tournaments/E3T/nudges/Team-7', NUDGE(), 'owner', 'bad key');
        await no('tournaments/E3T/nudges/team7/tpl', 'free text', 'owner', 'tpl rewritten');
        assert.equal(await st(ns, 'PUT', 'tournaments/E3T/nudges/team7', NUDGE(), 'owner'), OK, ns + ' positive');
    }
});

test('5. REFUSED with E3, the proofs: only the owner reads them - stranger, co-organizer, anonymous, signed out refused; nobody lists every event\'s proofs', SKIP, async () => {
    for (const ns of ON) {
        await reseed();
        for (const who of ['stranger', 'co', 'anon', undefined]) assert.notEqual(await st(ns, 'GET', 'scoreProofs/E3T', undefined, who), OK, ns + ' proofs read by ' + who);
        assert.notEqual(await st(ns, 'GET', 'scoreProofs', undefined, 'owner'), OK, ns + ' root list');
        assert.notEqual(await st(ns, 'GET', 'scoreProofs/NOPE', undefined, 'owner'), OK, ns + ' an event the reader does not own');
        assert.equal(await st(ns, 'GET', 'scoreProofs/E3T', undefined, 'owner'), OK, ns + ' positive');
    }
});

test('6. Refusals LIVE already makes, kept on every namespace: a stranger pace or nudge, a signed-out proof read', SKIP, async () => {
    await reseed();
    for (const ns of ALL) {
        assert.notEqual(await st(ns, 'PUT', 'tournaments/E3T/pace', { on: true, targetMin: 255 }, 'stranger'), OK, ns);
        assert.notEqual(await st(ns, 'PUT', 'tournaments/E3T/nudges/team7', NUDGE(), 'stranger'), OK, ns);
        assert.notEqual(await st(ns, 'GET', 'scoreProofs/E3T'), OK, ns);
    }
});

test('7. LIVE CONTROLS: untyped pace / free-text nudge / co-organizer pace accepted on LIVE and PRIOR (so E3 refuses them); the owner\'s proof read closed there (E3 opens it)', SKIP, async () => {
    await reseed();
    for (const ns of OFF) {
        assert.equal(await st(ns, 'PUT', 'tournaments/E3T/pace', { on: 'yes', targetMin: 9999, lat: 33.4 }, 'owner'), OK, ns + ' untyped pace accepted today');
        assert.equal(await st(ns, 'PUT', 'tournaments/E3T/nudges/team7', { text: 'Hurry up, Team 7' }, 'owner'), OK, ns + ' free-text nudge accepted today');
        assert.equal(await st(ns, 'PUT', 'tournaments/E3T/pace', { on: true, targetMin: 255 }, 'co'), OK, ns + ' co-organizer pace accepted today');
        assert.notEqual(await st(ns, 'GET', 'scoreProofs/E3T', undefined, 'owner'), OK, ns + ' proofs closed today');
    }
    for (const ns of ON) {
        await reseed();
        assert.notEqual(await st(ns, 'PUT', 'tournaments/E3T/pace', { on: 'yes', targetMin: 9999, lat: 33.4 }, 'owner'), OK, ns);
        assert.notEqual(await st(ns, 'PUT', 'tournaments/E3T/nudges/team7', { text: 'Hurry up, Team 7' }, 'owner'), OK, ns);
        assert.notEqual(await st(ns, 'PUT', 'tournaments/E3T/pace', { on: true, targetMin: 255 }, 'co'), OK, ns);
        assert.equal(await st(ns, 'GET', 'scoreProofs/E3T', undefined, 'owner'), OK, ns);
    }
});
