// ============================================================================
// E1 ANNOUNCEMENTS RULES BLOCK, IN THE FIREBASE DATABASE EMULATOR (2026-11-09)
//
// Four namespaces on one emulator (local port 9561, nothing live, nothing
// published):
//   LIVE  = the LIVE rules read read-only on 2026-11-09 (database:get
//           /.settings/rules), saved as the E1 ROLLBACK file in the inbox.
//   CAND  = LIVE + E1, the CANDIDATE file in the inbox (arm 1 proves it is
//           exactly tools/e1-rules-candidate.js build(LIVE)).
//   SLIVE = LIVE + the Stripe block (tools/stripe-rules-candidate.js), the state
//           live will be in when E1 is published (order: Stripe, E1, E2, E3, E4).
//   SCAND = SLIVE + E1, built here from the same two builders.
// The repo's database.rules.json is NOT used and NOT changed (it is behind live).
//
// Users go in ?auth=<unsigned token>; any Authorization: Bearer header is ADMIN
// on emulator 4.11.2, so only the 'admin' arms (the functions) use one.
// LIVE / SLIVE arms are the controls: each refusal E1 adds is shown accepted
// there (so E1, not an older rule, refuses it), and every flow that exists
// today is shown accepted on all four.
//
// Skipped when the emulator jar, Java, or an inbox file is missing.
// Env E1_RULES_CANDIDATE points the CAND namespace at another file (the
// negative controls load a mutated candidate from the scratchpad through it).
//
// BASELINE (final file, branch event-e1e3 on cf86caf8 + this wave):
//   CAND := the live file (E1_RULES_CANDIDATE=<rollback>): all 7 tests:
//   2 PASS / 5 FAIL. Pass: 2 (existing flows) and 6 (refusals live already
//   makes - kept so they cannot regress). Fail: 1 (file != build), 3 (nothing
//   E1 allows is open on live), 4 (live takes untyped notes / co-organizer
//   notes / a client pushed), 5 (followers closed), 7 (CAND half of the
//   controls).
//   Against the CANDIDATE: all 7 tests: 7 PASS / 0 FAIL.
// ============================================================================
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const E1 = require('./tools/e1-rules-candidate.js');
const STRIPE = require('./tools/stripe-rules-candidate.js');

const INBOX = path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'inbox');
const LIVE_FILE = path.join(INBOX, 'TOURNAMENTS-E1-RULES-ROLLBACK-live-20261109.json');
const CAND_FILE = process.env.E1_RULES_CANDIDATE || path.join(INBOX, 'TOURNAMENTS-E1-RULES-CANDIDATE.json');

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

const PORT = 9561, BASE = 'http://127.0.0.1:' + PORT;
const NS = { LIVE: 'e1live', CAND: 'e1cand', SLIVE: 'e1slive', SCAND: 'e1scand' };
const ALL = Object.keys(NS), E1ON = ['CAND', 'SCAND'], E1OFF = ['LIVE', 'SLIVE'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (uid, provider) => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
    sub: uid, user_id: uid, aud: 'golfapp-9fb21', iss: 'https://securetoken.google.com/golfapp-9fb21',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    ...(provider === 'anonymous' ? {} : { email: uid + '@example.test', email_verified: true }),
    firebase: { sign_in_provider: provider || 'password' } }) + '.';
const AS = { owner: token('u-org'), stranger: token('u-who'), co: token('u-co'), anon: token('u-anon', 'anonymous'), fan: token('u-fan', 'anonymous'), fan2: token('u-fan2') };

async function req(ns, method, p, body, who) {
    const headers = { 'Content-Type': 'application/json' };
    if (who === 'admin') headers.Authorization = 'Bearer owner';
    const q = AS[who] ? '&auth=' + AS[who] : '';
    const r = await fetch(`${BASE}/${p}.json?ns=${NS[ns]}${q}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, body: text };
}
const st = async (...a) => (await req(...a)).status;
const OK = 200;
const emuRules = (s) => s.split('[^@\\\\s]').join('[^@ ]');   // emulator-only: it cannot load \s in a class (files on disk untouched)
const SV = { '.sv': 'timestamp' };
const KEY = 'a'.repeat(32);
const NOTE = (extra) => Object.assign({ text: 'Lightning in the area. Horn sounded: stop play, mark your ball, head to the clubhouse.', tpl: 'weather', at: SV, by: 'u-org' }, extra || {});

const SEED = {
    tournaments: {
        E1T: { name: 'Rattle Classic', ownerUid: 'u-org', createdAt: 1, format: 'scramble',
            teams: { team1: { num: 1, name: 'Team 1', players: ['Ann'] } },
            coOrganizers: { 'u-co@example,test': true },
            announcements: { aOld: { text: 'Range is open, carts at bag drop.', tpl: 'custom', at: 5, by: 'u-org', pushed: 19 }, aNew: { text: 'Shotgun start at 8:00 AM. Head to your starting hole. Good luck!', tpl: 'start', at: 6, by: 'u-org' } } },
        OPEN: { name: 'Unlocked Open', ownerUid: 'u-org', createdAt: 1, format: 'scramble', teams: { team1: { num: 1, name: 'Team 1', players: ['Bo'] } } }
    },
    tournamentKeys: { E1T: { on: true, t: { team1: KEY } } },
    tournamentFollowers: { E1T: { 'u-fan2': { at: 7, team: 'team1' } } },
    pushTokens: { 'u-fan2': { d1: { token: 'tok-fan2', playerId: 'p1', at: 1 } } },
    announcementSends: { E1T: { lastAt: 1 } }
};
let emu = null;
const reseed = async () => { for (const ns of ALL) assert.equal(await st(ns, 'PUT', '', SEED, 'admin'), OK); };

let RULES = {};
before(async () => {
    if (SKIP.skip) return;
    const live = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
    const slive = STRIPE.build(live);
    RULES = { LIVE: fs.readFileSync(LIVE_FILE, 'utf8'), CAND: fs.readFileSync(CAND_FILE, 'utf8'), SLIVE: JSON.stringify(slive), SCAND: JSON.stringify(E1.build(slive)) };
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

// Every leaf path of a rules tree, as /a/b/.write -> value.
function leaves(o, p, out) {
    out = out || {};
    if (o && typeof o === 'object') for (const k of Object.keys(o)) leaves(o[k], p + '/' + k, out);
    else out[p] = o;
    return out;
}
const under = (p, roots) => roots.some((r) => p === r || p.startsWith(r + '/'));

test('1. CAND is exactly build(LIVE); SCAND is build(Stripe(LIVE)); outside E1\'s three paths both are byte-identical to what they were built on', SKIP, () => {
    const live = JSON.parse(RULES.LIVE), cand = JSON.parse(RULES.CAND);
    assert.deepEqual(cand, E1.build(live), 'the inbox CANDIDATE is not build(ROLLBACK) - rebuild it');
    for (const [base, built] of [[live, cand], [JSON.parse(RULES.SLIVE), JSON.parse(RULES.SCAND)]]) {
        const a = leaves(base, ''), b = leaves(built, '');
        const moved = Object.keys(Object.assign({}, a, b)).filter((k) => a[k] !== b[k]);
        assert.ok(moved.length > 0, 'positive: the block adds something');
        const outside = moved.filter((k) => !under(k, E1.PATHS));
        assert.deepEqual(outside, [], 'E1 moved a rule outside its own paths');
        assert.ok(E1.PATHS.every((p) => moved.some((k) => under(k, [p]))), 'each of the three paths is added');
    }
    assert.throws(() => E1.build(cand), /LIVE HAS MOVED/, 'building twice refuses');
});

test('2. EXISTING FLOWS, all four namespaces: keyed golfer score, unlocked score, public board read, owner edit, co-organizer edit, owner removes a team', SKIP, async () => {
    await reseed();
    for (const ns of ALL) {
        assert.equal(await st(ns, 'PATCH', '', { 'tournaments/E1T/scores/team1_h1': 4, 'scoreProofs/E1T/team1_h1': { who: 'team1', k: KEY, t: SV } }), OK, ns + ' keyed score');
        assert.equal(await st(ns, 'PUT', 'tournaments/OPEN/scores/team1_h2', 5), OK, ns + ' unlocked score');
        const read = await req(ns, 'GET', 'tournaments/E1T');
        assert.equal(read.status, OK, ns + ' board read');
        assert.match(read.body, /Shotgun start at 8:00 AM/, ns + ' positive: the signed-out read carries the announcements');
        assert.equal(await st(ns, 'PUT', 'tournaments/E1T/name', 'Rattle Classic II', 'owner'), OK, ns + ' owner edit');
        assert.equal(await st(ns, 'PUT', 'tournaments/E1T/venue', 'Papago', 'co'), OK, ns + ' co-organizer edit ($coField)');
        assert.equal(await st(ns, 'DELETE', 'tournaments/OPEN/teams/team1', undefined, 'owner'), OK, ns + ' owner removes a team');
        assert.notEqual(await st(ns, 'PATCH', '', { 'tournaments/E1T/scores/team1_h3': 4, 'scoreProofs/E1T/team1_h3': { who: 'team1', k: 'b'.repeat(32), t: SV } }), OK, ns + ' positive: a wrong key is still refused');
    }
});

test('3. ALLOWED with E1: owner sends a note (server time), anyone reads it, owner deletes one, a follower writes its own row, the owner reads the list, the server writes pushed', SKIP, async () => {
    for (const ns of E1ON) {
        await reseed();
        assert.equal(await st(ns, 'PUT', 'tournaments/E1T/announcements/aX1', NOTE(), 'owner'), OK, ns + ' owner note');
        const back = JSON.parse((await req(ns, 'GET', 'tournaments/E1T/announcements/aX1')).body);
        assert.equal(back.tpl, 'weather'); assert.equal(typeof back.at, 'number');
        assert.equal(await st(ns, 'PUT', 'tournaments/E1T/announcements/aX2', NOTE({ text: 'x'.repeat(200), tpl: 'custom' }), 'owner'), OK, ns + ' 200 characters');
        for (const tpl of ['start', 'resume', 'results']) assert.equal(await st(ns, 'PUT', 'tournaments/E1T/announcements/t' + tpl, NOTE({ tpl }), 'owner'), OK, ns + ' tpl ' + tpl);
        assert.equal(await st(ns, 'DELETE', 'tournaments/E1T/announcements/aX2', undefined, 'owner'), OK, ns + ' owner deletes a note');
        assert.equal(await st(ns, 'PUT', 'tournaments/E1T/name', 'Renamed', 'owner'), OK, ns + ' an edit beside a pushed note');
        assert.equal(await st(ns, 'PUT', 'tournamentFollowers/E1T/u-fan', { at: SV, team: 'team1' }, 'fan'), OK, ns + ' anonymous app golfer follows');
        assert.equal(await st(ns, 'PUT', 'tournamentFollowers/E1T/u-fan', { at: SV, team: 'gk3j9abc' }, 'fan'), OK, ns + ' group key');
        assert.equal(await st(ns, 'DELETE', 'tournamentFollowers/E1T/u-fan', undefined, 'fan'), OK, ns + ' unfollow');
        const list = await req(ns, 'GET', 'tournamentFollowers/E1T', undefined, 'owner');
        assert.equal(list.status, OK, ns + ' owner reads followers'); assert.match(list.body, /u-fan2/);
        assert.equal(await st(ns, 'PUT', 'tournaments/E1T/announcements/aNew/pushed', 22, 'admin'), OK, ns + ' server writes pushed');
        assert.equal(await st(ns, 'PUT', 'announcementSends/E1T', { lastAt: 9 }, 'admin'), OK, ns + ' server rate clock');
        // The owner rewrites the whole tournament with pushed UNCHANGED (a full set()).
        const whole = JSON.parse((await req(ns, 'GET', 'tournaments/E1T', undefined, 'admin')).body);
        assert.equal(await st(ns, 'PUT', 'tournaments/E1T', whole, 'owner'), OK, ns + ' owner full set keeps pushed');
    }
});

test('4. REFUSED with E1, notes: stranger, anonymous, signed out, co-organizer; 201 chars, empty, bad tpl, someone else as by, future at, extra field, missing field, client pushed (create, change, delete), bad id', SKIP, async () => {
    for (const ns of E1ON) {
        await reseed();
        const no = async (p, body, who, why, method) => assert.notEqual(await st(ns, method || 'PUT', p, body, who), OK, ns + ' ' + why);
        await no('tournaments/E1T/announcements/z1', NOTE(), 'stranger', 'stranger');
        await no('tournaments/E1T/announcements/z1', NOTE(), 'anon', 'anonymous');
        await no('tournaments/E1T/announcements/z1', NOTE(), undefined, 'signed out');
        await no('tournaments/E1T/announcements/z1', NOTE({ by: 'u-co' }), 'co', 'co-organizer');
        await no('tournaments/E1T/announcements/z1', NOTE({ text: 'x'.repeat(201) }), 'owner', '201 chars');
        await no('tournaments/E1T/announcements/z1', NOTE({ text: '' }), 'owner', 'empty text');
        await no('tournaments/E1T/announcements/z1', NOTE({ text: 5 }), 'owner', 'number text');
        await no('tournaments/E1T/announcements/z1', NOTE({ tpl: 'chat' }), 'owner', 'bad tpl');
        await no('tournaments/E1T/announcements/z1', NOTE({ by: 'u-who' }), 'owner', 'by another uid');
        await no('tournaments/E1T/announcements/z1', NOTE({ at: Date.now() + 3600000 }), 'owner', 'future at');
        await no('tournaments/E1T/announcements/z1', NOTE({ reply: 'hi' }), 'owner', 'extra field');
        await no('tournaments/E1T/announcements/z1', { text: 'x', tpl: 'custom', at: SV }, 'owner', 'missing by');
        await no('tournaments/E1T/announcements/z1', NOTE({ pushed: 500 }), 'owner', 'client pushed on create');
        await no('tournaments/E1T/announcements/aOld/pushed', 999, 'owner', 'client changes pushed');
        await no('tournaments/E1T/announcements/aOld/pushed', undefined, 'owner', 'client deletes pushed', 'DELETE');
        await no('tournaments/E1T/announcements/aNew/pushed', 22, 'owner', 'client adds pushed');
        await no('', { 'tournaments/E1T/announcements/aOld/pushed': 0 }, 'owner', 'root multi-path pushed', 'PATCH');
        await no('tournaments/E1T/announcements/' + 'x'.repeat(41), NOTE(), 'owner', 'id over 40');
        await no('tournaments/E1T/announcements/aNew/text', 'Edited by a golfer', 'stranger', 'stranger edits text');
        // positive in the same arm: the owner's well-formed note goes in.
        assert.equal(await st(ns, 'PUT', 'tournaments/E1T/announcements/z2', NOTE(), 'owner'), OK, ns + ' positive');
    }
});

test('5. REFUSED with E1, followers and the rate clock: another uid\'s row, bad team, extra field, no event, signed out; list read by stranger / follower / signed out; announcementSends read and write', SKIP, async () => {
    for (const ns of E1ON) {
        await reseed();
        const no = async (p, body, who, why, method) => assert.notEqual(await st(ns, method || 'PUT', p, body, who), OK, ns + ' ' + why);
        await no('tournamentFollowers/E1T/u-fan2', { at: SV, team: 'team1' }, 'fan', 'writes another uid');
        await no('tournamentFollowers/E1T/u-fan2', undefined, 'fan', 'deletes another uid', 'DELETE');
        await no('tournamentFollowers/E1T/u-fan', { at: SV, team: 'team1; drop' }, 'fan', 'bad team');
        await no('tournamentFollowers/E1T/u-fan', { at: SV, team: 'team1', token: 'x' }, 'fan', 'extra field');
        await no('tournamentFollowers/E1T/u-fan', { at: SV }, 'fan', 'missing team');
        await no('tournamentFollowers/E1T/u-fan', { at: Date.now() + 3600000, team: 'team1' }, 'fan', 'future at');
        await no('tournamentFollowers/NOPE/u-fan', { at: SV, team: 'team1' }, 'fan', 'no such event');
        await no('tournamentFollowers/E1T/u-fan', { at: SV, team: 'team1' }, undefined, 'signed out');
        for (const who of ['stranger', 'fan2', undefined, 'co']) await no('tournamentFollowers/E1T', undefined, who, 'list read by ' + who, 'GET');
        await no('tournamentFollowers', undefined, 'owner', 'root list read', 'GET');
        await no('announcementSends/E1T', undefined, 'owner', 'owner reads the clock', 'GET');
        await no('announcementSends/E1T', { lastAt: 0 }, 'owner', 'owner resets the clock');
        await no('announcementSends/E1T', undefined, 'owner', 'owner deletes the clock', 'DELETE');
        assert.equal(await st(ns, 'PUT', 'tournamentFollowers/E1T/u-fan', { at: SV, team: 'team1' }, 'fan'), OK, ns + ' positive');
    }
});

test('6. Refusals LIVE already makes, kept on every namespace: a stranger or signed-out note, a stranger reading the clock', SKIP, async () => {
    await reseed();
    for (const ns of ALL) {
        assert.notEqual(await st(ns, 'PUT', 'tournaments/E1T/announcements/z9', NOTE(), 'stranger'), OK, ns + ' stranger note');
        assert.notEqual(await st(ns, 'PUT', 'tournaments/E1T/announcements/z9', NOTE()), OK, ns + ' signed-out note');
        assert.notEqual(await st(ns, 'GET', 'announcementSends/E1T', undefined, 'stranger'), OK, ns + ' clock read');
    }
});

test('7. LIVE CONTROLS: what E1 refuses is accepted on LIVE and SLIVE (so E1 is what refuses it); what E1 opens is closed there', SKIP, async () => {
    await reseed();
    for (const ns of E1OFF) {
        assert.equal(await st(ns, 'PUT', 'tournaments/E1T/announcements/c1', NOTE({ text: 'x'.repeat(201), tpl: 'chat', reply: 1 }), 'owner'), OK, ns + ' untyped note accepted today');
        assert.equal(await st(ns, 'PUT', 'tournaments/E1T/announcements/c2', NOTE({ by: 'u-co' }), 'co'), OK, ns + ' co-organizer note accepted today ($coField)');
        assert.equal(await st(ns, 'PUT', 'tournaments/E1T/announcements/aOld/pushed', 999, 'owner'), OK, ns + ' client pushed accepted today');
        assert.notEqual(await st(ns, 'PUT', 'tournamentFollowers/E1T/u-fan', { at: SV, team: 'team1' }, 'fan'), OK, ns + ' follow closed today');
        assert.notEqual(await st(ns, 'GET', 'tournamentFollowers/E1T', undefined, 'owner'), OK, ns + ' list closed today');
    }
    for (const ns of E1ON) {
        await reseed();
        assert.notEqual(await st(ns, 'PUT', 'tournaments/E1T/announcements/c1', NOTE({ text: 'x'.repeat(201), tpl: 'chat', reply: 1 }), 'owner'), OK, ns);
        assert.notEqual(await st(ns, 'PUT', 'tournaments/E1T/announcements/c2', NOTE({ by: 'u-co' }), 'co'), OK, ns);
        assert.notEqual(await st(ns, 'PUT', 'tournaments/E1T/announcements/aOld/pushed', 999, 'owner'), OK, ns);
        assert.equal(await st(ns, 'PUT', 'tournamentFollowers/E1T/u-fan', { at: SV, team: 'team1' }, 'fan'), OK, ns);
        assert.equal(await st(ns, 'GET', 'tournamentFollowers/E1T', undefined, 'owner'), OK, ns);
    }
});
