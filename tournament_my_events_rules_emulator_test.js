// ============================================================================
// MY EVENTS BY ACCOUNT - the rules block, proven on the RTDB emulator against
// the saved LIVE rules and against LIVE + the candidate
// (tools/my-events-rules-candidate.js). Nothing live, nothing published.
//
//   LIVE = the saved copy of the live rules (the ROLLBACK file in the inbox).
//   CAND = LIVE + organizers/$uid/tournaments (built here, from LIVE).
//
//  1 LIVE refuses the pointer (so the page's write today is a no-op, not a leak)
//  2 CAND: the owner writes organizers/<own uid>/tournaments/<own code> {at, name, course}
//  3 CAND: the same shape for a code the uid does NOT own is refused
//  4 CAND: a stranger cannot write under the owner's node; an anonymous uid
//    cannot write a pointer to an event it does not own
//  5 CAND: shape - a missing name, a name over 80, an unknown field, a bad code
//    are refused; a pointer may be removed (null)
//  6 CAND: the owner reads its own list; a stranger cannot read it
//  7 CAND changes NOTHING else: a golfer's keyed score still lands; a
//    stranger's score still does not (the scorecard lock, unchanged)
//
// Skipped when the emulator jar, Java, or the saved live rules are missing.
// ============================================================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const ME = require('./tools/my-events-rules-candidate.js');

const INBOX = path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'inbox');
const LIVE_FILE = process.env.ME_RULES_LIVE || path.join(INBOX, 'TOURNAMENTS-ALL-RULES-STACK-ROLLBACK-live-20261109.json');

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
    : (!JAR || !JAVA) ? { skip: 'no RTDB emulator (jar/Java) on this machine' } : {};

const PORT = 9483, BASE = 'http://127.0.0.1:' + PORT;
const NS = { LIVE: 'melive', CAND: 'mecand' };
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
const emuRules = (s) => s.split('[^@\\\\s]').join('[^@ ]');   // emulator-only: it cannot load \s in a class
const NOW = { '.sv': 'timestamp' };
const K4 = 'a'.repeat(32);
const SEED = {
    tournaments: {
        OWN1: { name: 'Hope Foundation Scramble', ownerUid: 'u-org', createdAt: 1, format: 'scramble', courseName: 'Papago', teams: { team4: { num: 4, name: 'Team 4', players: ['Al'] } } },
        OTH1: { name: 'Someone Else\'s Event', ownerUid: 'u-who', createdAt: 1, format: 'scramble', teams: { team1: { num: 1, players: ['Bo'] } } }
    },
    tournamentKeys: { OWN1: { on: true, t: { team4: K4 } } },
    organizers: { 'u-org': { firstSeenAt: 1 }, 'u-who': { firstSeenAt: 1 } }
};
let emu = null;
const reseed = async () => { for (const ns of Object.keys(NS)) assert.equal(await req(ns, 'PUT', '', SEED, 'admin'), OK); };
const ptr = (o) => Object.assign({ at: NOW, name: 'Hope Foundation Scramble', course: 'Papago' }, o || {});
const put = (ns, uid, code, body, who) => req(ns, 'PUT', `organizers/${uid}/tournaments/${code}`, body, who);

before(async () => {
    if (SKIP.skip) return;
    emu = spawn(JAVA, ['-jar', JAR, '--host', '127.0.0.1', '--port', String(PORT)], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/.json?ns=x'); break; } catch (e) { await sleep(500); } }
    const live = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
    const cand = ME.build(live);
    for (const [ns, rules] of [['LIVE', live], ['CAND', cand]]) {
        const r = await fetch(`${BASE}/.settings/rules.json?ns=${NS[ns]}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: emuRules(JSON.stringify(rules)) });
        assert.equal(r.status, OK, ns + ' rules loaded: ' + await r.text());
    }
    await reseed();
});
after(() => { if (emu) emu.kill(); });

test('1 LIVE refuses the pointer: the page\'s write before the publish is a refusal, not a stray record', SKIP, async () => {
    assert.equal(await put('LIVE', 'u-org', 'OWN1', ptr(), 'owner'), 401);
});

test('2 CAND: the owner writes a pointer to its own event', SKIP, async () => {
    assert.equal(await put('CAND', 'u-org', 'OWN1', ptr(), 'owner'), OK);
    assert.equal(await put('CAND', 'u-org', 'OWN1', ptr({ at: NOW }), 'owner'), OK, 'and may update it');
});

test('3 CAND: a pointer to an event the uid does not own is refused', SKIP, async () => {
    assert.equal(await put('CAND', 'u-org', 'OTH1', ptr({ name: 'Someone Else\'s Event' }), 'owner'), 401);
    assert.equal(await put('CAND', 'u-org', 'NOPE1', ptr(), 'owner'), 401, 'nor to an event that does not exist');
});

test('4 CAND: a stranger cannot write under the owner\'s node; an anonymous uid gets no pointer to an event it does not own', SKIP, async () => {
    assert.equal(await put('CAND', 'u-org', 'OWN1', ptr(), 'stranger'), 401);
    assert.equal(await put('CAND', 'u-anon', 'OWN1', ptr(), 'anon'), 401);
    assert.equal(await put('CAND', 'u-org', 'OWN1', ptr(), null), 401, 'signed out: refused');
});

test('5 CAND: the shape - missing name, long name, unknown field, bad code refused; removal allowed', SKIP, async () => {
    assert.equal(await put('CAND', 'u-org', 'OWN1', { at: NOW }, 'owner'), 401, 'no name');
    assert.equal(await put('CAND', 'u-org', 'OWN1', ptr({ name: 'x'.repeat(81) }), 'owner'), 401, 'name over 80');
    assert.equal(await put('CAND', 'u-org', 'OWN1', ptr({ extra: 1 }), 'owner'), 401, 'unknown field');
    assert.equal(await put('CAND', 'u-org', 'own1', ptr(), 'owner'), 401, 'lower-case code');
    assert.equal(await put('CAND', 'u-org', 'OWN1', ptr(), 'owner'), OK, 'positive: the good shape lands');
    assert.equal(await put('CAND', 'u-org', 'OWN1', null, 'owner'), OK, 'and can be removed');
    await reseed();
});

test('6 CAND: the owner reads its list; a stranger cannot', SKIP, async () => {
    assert.equal(await put('CAND', 'u-org', 'OWN1', ptr(), 'owner'), OK);
    assert.equal(await req('CAND', 'GET', 'organizers/u-org/tournaments', undefined, 'owner'), OK);
    assert.equal(await req('CAND', 'GET', 'organizers/u-org/tournaments', undefined, 'stranger'), 401);
    assert.equal(await req('CAND', 'GET', 'organizers/u-org/tournaments', undefined, null), 401);
    await reseed();
});

test('7 CAND changes nothing else: a keyed score lands, a stranger\'s does not (the lock, unchanged)', SKIP, async () => {
    const keyed = { 'tournaments/OWN1/scores/team4_h1': 4, 'scoreProofs/OWN1/team4_h1': { who: 'team4', k: K4, t: NOW } };
    for (const ns of ['LIVE', 'CAND']) {
        assert.equal(await req(ns, 'PATCH', '', keyed, 'anon'), OK, ns + ': the keyed score');
        assert.equal(await req(ns, 'PUT', 'tournaments/OWN1/scores/team4_h2', 5, 'stranger'), 401, ns + ': a bare score');
        assert.equal(await req(ns, 'PUT', 'tournaments/OWN1/name', 'Renamed', 'stranger'), 401, ns + ': a stranger\'s rename');
    }
    await reseed();
});
