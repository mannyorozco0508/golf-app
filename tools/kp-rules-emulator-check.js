#!/usr/bin/env node
// ============================================================================
// THE KP RULES PROPOSAL, PROVED IN THE EMULATOR (Starkey settings 12-13; Manny 2026-11-19 "KPs 12-13 (rules
// publish later, my OK)"). NOTHING IS PUBLISHED: this builds the proposal from the LIVE rules (the 2026-11-16
// combined publish, read back) and runs the same writes against both in a local RTDB emulator.
//
// THE PROPOSAL (three additions, nothing else changes):
//   1. tournaments/$code/contests/$hole gains
//        winners: { $entryKey: true }      only an entry that exists on that hole
//        locks:   { $group: <number> }     'all', a flight id, or 'none'
//      (beside kind, fairwayOnly, allowGps, winner, lockedAt, which stay exactly as they are)
//   2. contestEntries/$code/$hole/$entryKey .write: a golfer may not enter once locks/all exists, or once the lock
//      of THEIR flight exists (players/<entryKey>/flightId). The old lockedAt check stays.
//      Limitation, said plainly: a team entry (team<N>_p<i>) has no players/<key> to read its flight from, so on a
//      team event a FLIGHT lock is the app's (the prompt stops asking) and not the rules'; locks/all still binds.
//   3. ROUNDS (KPs on a two-round event): the same three blocks one level down, nothing else -
//        tournaments/$code/rounds/$roundId/contests/$hole   the event-level contest block, its entry paths on the round
//        contestEntries/$code/r/$rid/$hole/$entryKey       the event-level entry rule, read against the round's hole
//        contestProofs/$code/r/$rid/$hole/$entryKey        the event-level proof rule, also accepting the ROUND's key
//                                                          (tournamentKeys/$code/r/$rid/<who>, as round scores do)
//      Today a round's contests are not validated at all (the round has no $other), and an entry on a round path
//      is refused (the hole pattern reads 'r').
//
//   node tools/kp-rules-emulator-check.js [--write-proposal <file>]    exit 0 = every expectation met
//   node tools/kp-rules-emulator-check.js --published <rules.json>
//       AFTER A PUBLISH (2.1.0, 2026-11-20): the same writes against the given rules file (a read-back of the
//       live rules), each expected to answer as the PROPOSAL did; then THE APP'S OWN WRITERS
//       (TournamentContests.winnerUpdate / clearWinnerUpdate, the payloads the Contests tab sends) on an event
//       with prizeSettings/kps per flight, and one with shared ties. Emulator only; nothing is written live.
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Emulator, sleep } = require('./sim/lib/emu-phone.js');

const LIVE = path.join(os.homedir(), 'Desktop', 'claude-mailbox-shared', 'tournaments', 'rules-publish-20261116-combined', 'readback.json');
const NS = 'golfapp-9fb21-default-rtdb';

function proposal(live) {
    const R = JSON.parse(JSON.stringify(live));
    const root = R.rules || R;
    const tKey = Object.keys(root.tournaments).find((k) => k[0] === '$');
    const v = tKey;   // the tournament code variable on that branch
    const hole = root.tournaments[tKey].contests['$hole'];
    hole.winners = { '$entryKey': { '.validate': `newData.val() === true && root.child('contestEntries/' + ${v} + '/' + $hole + '/' + $entryKey).exists()` } };
    hole.locks = { '$group': { '.validate': `newData.isNumber() && ($group === 'all' || $group === 'none' || root.child('tournaments/' + ${v} + '/flights/' + $group).exists())` } };
    const e = root.contestEntries['$code']['$hole']['$entryKey'];
    const OLD = `!root.child('tournaments/' + $code + '/contests/' + $hole + '/lockedAt').exists()`;
    if (e['.write'].split(OLD).length !== 2) throw new Error('the live entry rule changed: the lockedAt check is not where it was');
    e['.write'] = e['.write'].replace(OLD, OLD
        + ` && !root.child('tournaments/' + $code + '/contests/' + $hole + '/locks/all').exists()`
        + ` && !root.child('tournaments/' + $code + '/contests/' + $hole + '/locks/' + root.child('tournaments/' + $code + '/players/' + $entryKey + '/flightId').val()).exists()`);
    // 3. rounds
    const SEP = (x, a, b) => { if (x.split(a).length < 2) throw new Error('live text moved: ' + a); return x.split(a).join(b); };
    const rc = JSON.parse(SEP(JSON.stringify(hole), "'contestEntries/' + $tourneyCode + '/' + $hole", "'contestEntries/' + $tourneyCode + '/r/' + $roundId + '/' + $hole"));
    root.tournaments[tKey].rounds['$roundId'].contests = { '$hole': rc };
    const er = JSON.parse(JSON.stringify(e));
    ['.write', '.validate'].forEach((k) => {
        er[k] = SEP(er[k], "'/contests/' + $hole", "'/rounds/' + $rid + '/contests/' + $hole");
    });
    er['.write'] = SEP(er['.write'], "newData.parent().parent().parent().parent().child('contestProofs/' + $code + '/' + $hole", "newData.parent().parent().parent().parent().parent().parent().child('contestProofs/' + $code + '/r/' + $rid + '/' + $hole");
    root.contestEntries['$code'].r = { '$rid': { '$hole': { '$entryKey': er } } };
    const pr = JSON.parse(JSON.stringify(root.contestProofs['$code']['$hole']['$entryKey']));
    const KP = "newData.child('k').val() === root.child('tournamentKeys/' + $code + '/p/' + newData.child('who').val()).val()";
    pr['.write'] = SEP(pr['.write'], KP, KP + " || newData.child('k').val() === root.child('tournamentKeys/' + $code + '/r/' + $rid + '/' + newData.child('who').val()).val()");
    root.contestProofs['$code'].r = { '$rid': { '$hole': { '$entryKey': pr } } };
    return R;
}

// An unsigned emulator token (the RTDB emulator accepts alg none).
function token(uid, email) {
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const t = Math.floor(Date.now() / 1000);
    return b({ alg: 'none', typ: 'JWT' }) + '.' + b(Object.assign({ sub: uid, user_id: uid, aud: 'golfapp-9fb21', iss: 'https://securetoken.google.com/golfapp-9fb21', iat: t, exp: t + 3600, auth_time: t,
        firebase: { sign_in_provider: email ? 'password' : 'anonymous' } }, email ? { email, email_verified: true } : {})) + '.';
}

const CODE = 'KPR1';
const OWNER = { uid: 'u-org', email: 'org@sim.example' };
function seed() {
    const COURSE = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 5].map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 }));
    return { name: 'KP rules check', scoringModel: 'player-v1', format: 'individual', ownerUid: OWNER.uid, courseName: 'Sim', courseData: COURSE, createdAt: 1,
        flights: { fA: { id: 'fA', name: 'A Flight', createdAt: 1 }, fB: { id: 'fB', name: 'B Flight', createdAt: 2 } },
        players: { pa: { id: 'pa', name: 'Ana', handicap: '8', flightId: 'fA' }, pb: { id: 'pb', name: 'Ben', handicap: '4', flightId: 'fB' }, pc: { id: 'pc', name: 'Cy', handicap: '2', flightId: 'fB' } },
        contests: { h7: { kind: 'kp', allowGps: true } } };
}
const entry = (name) => ({ name, team: 'g1', kind: 'kp', inches: 50, by: 'typed', at: { '.sv': 'timestamp' } });

async function run(rulesFile, label) {
    const emu = new Emulator(9000 + Math.floor(Math.random() * 400), NS);
    await emu.start(rulesFile);
    const as = (who) => async (p, method, body) => {
        // ?auth=<unsigned token>: the emulator reads the user from it. (An Authorization: Bearer header with any
        // token is treated as an ADMIN by the emulator, which made every write pass in the first run of this tool.)
        const r = await fetch(emu.base + '/' + p + '.json?ns=' + NS + '&auth=' + token(who.uid, who.email), { method, body: body === undefined ? undefined : JSON.stringify(body) });
        return r.status === 200 ? 'ok' : 'DENIED';
    };
    const owner = as(OWNER), golfer = as({ uid: 'anon-1' });
    const out = {};
    const reset = async () => { await emu.admin('tournaments/' + CODE, 'PUT', seed()); await emu.admin('contestEntries/' + CODE, 'DELETE'); };
    await reset();
    out['golfer enters (nothing locked)'] = await golfer(`contestEntries/${CODE}/h7/pa`, 'PUT', entry('Ana'));
    await golfer(`contestEntries/${CODE}/h7/pb`, 'PUT', entry('Ben'));
    out['owner: old winner + lockedAt'] = await owner(`tournaments/${CODE}/contests/h7`, 'PATCH', { winner: 'pa', lockedAt: { '.sv': 'timestamp' } });
    out['golfer enters after lockedAt'] = await golfer(`contestEntries/${CODE}/h7/pc`, 'PUT', entry('Cy'));
    await reset();
    await golfer(`contestEntries/${CODE}/h7/pa`, 'PUT', entry('Ana')); await golfer(`contestEntries/${CODE}/h7/pb`, 'PUT', entry('Ben'));
    out['owner: B Flight winner (winners/pb + locks/fB)'] = await owner(`tournaments/${CODE}/contests/h7`, 'PATCH', { 'winners/pb': true, 'locks/fB': { '.sv': 'timestamp' } });
    out['B Flight golfer enters after B is locked'] = await golfer(`contestEntries/${CODE}/h7/pc`, 'PUT', entry('Cy'));
    out['A Flight golfer edits after B is locked'] = await golfer(`contestEntries/${CODE}/h7/pa`, 'PUT', entry('Ana'));
    out['owner: a winner with no entry'] = await owner(`tournaments/${CODE}/contests/h7`, 'PATCH', { 'winners/pzz': true });
    out['owner: a lock for a flight that does not exist'] = await owner(`tournaments/${CODE}/contests/h7`, 'PATCH', { 'locks/fZ': 1 });
    out['owner: shared tie (winners pa + pb, locks/all)'] = await owner(`tournaments/${CODE}/contests/h7`, 'PATCH', { 'winners/pa': true, 'locks/all': { '.sv': 'timestamp' } });
    out['golfer enters after locks/all'] = await golfer(`contestEntries/${CODE}/h7/pc`, 'PUT', entry('Cy'));
    out['a golfer cannot write winners'] = await golfer(`tournaments/${CODE}/contests/h7/winners/pc`, 'PUT', true);
    out['owner clears (nulls)'] = await owner(`tournaments/${CODE}/contests/h7`, 'PATCH', { 'winners/pa': null, 'winners/pb': null, 'locks/all': null, 'locks/fB': null });
    // ROUNDS: a two-round event, scoring keys on, the round's key for group g1 (who = pa on a golfer card)
    const KEY = 'k'.repeat(24), WRONG = 'w'.repeat(24);
    const multi = Object.assign(seed(), { eventModel: 'round-v1', rounds: { r1: { name: 'Cascade', status: 'open', format: 'individual', courseData: seed().courseData, createdAt: 1 } } });
    delete multi.contests;
    await emu.admin('tournaments/' + CODE, 'PUT', multi); await emu.admin('contestEntries/' + CODE, 'DELETE');
    await emu.admin('tournamentKeys/' + CODE, 'PUT', { on: true, r: { r1: { pa: KEY, pb: KEY } } });
    const roundEntry = (pid, k) => ({ ['contestEntries/' + CODE + '/r/r1/h7/' + pid]: entry(pid), ['contestProofs/' + CODE + '/r/r1/h7/' + pid]: { who: pid, k, t: { '.sv': 'timestamp' } } });
    out['round: owner marks hole 7 on Cascade'] = await owner(`tournaments/${CODE}/rounds/r1/contests/h7`, 'PUT', { kind: 'kp', allowGps: true });
    out['round: golfer enters with the round key'] = await golfer('', 'PATCH', roundEntry('pa', KEY));
    out['round: golfer enters with a wrong key'] = await golfer('', 'PATCH', roundEntry('pb', WRONG));
    out['round: owner names a winner with no entry'] = await owner(`tournaments/${CODE}/rounds/r1/contests/h7`, 'PATCH', { winner: 'pzz', lockedAt: 1 });
    out['round: owner confirms Ana'] = await owner(`tournaments/${CODE}/rounds/r1/contests/h7`, 'PATCH', { winner: 'pa', lockedAt: { '.sv': 'timestamp' } });
    out['round: golfer enters after the round hole is locked'] = await golfer('', 'PATCH', roundEntry('pb', KEY));
    await emu.stop();
    console.log('\n' + label); Object.keys(out).forEach((k) => console.log('  ' + out[k].padEnd(7) + k));
    return out;
}

// THE APP'S WRITERS against a rules file. The payloads come from tournament-contests.js, not from this file.
async function runApp(rulesFile) {
    const TC = require('../tournament-contests.js');
    const emu = new Emulator(9000 + Math.floor(Math.random() * 400), NS);
    await emu.start(rulesFile);
    const as = (who) => async (p, method, body) => {
        const r = await fetch(emu.base + '/' + p + '.json?ns=' + NS + '&auth=' + token(who.uid, who.email), { method, body: body === undefined ? undefined : JSON.stringify(body) });
        return r.status === 200 ? 'ok' : 'DENIED';
    };
    const owner = as(OWNER), golfer = as({ uid: 'anon-1' });
    const getJson = async (p) => (await fetch(emu.base + '/' + p + '.json?ns=' + NS + '&auth=' + token(OWNER.uid, OWNER.email))).json();
    const mark = (name, inches) => ({ name, team: 'g1', kind: 'kp', inches, by: 'typed', at: { '.sv': 'timestamp' } });
    const TS = { '.sv': 'timestamp' };
    const out = {};
    const pick = async (key) => {
        const data = await getJson('tournaments/' + CODE);
        const entries = (await getJson('contestEntries/' + CODE + '/h7')) || {};
        return TC.winnerUpdate(data, TC.contestFor(data, 7), entries, key, TS);
    };
    // PER FLIGHT: Ana (A) 30 in, Ben (B) 20 in, Cy (B) 60 in. Make winner Ben: B Flight is locked, A is not.
    await emu.admin('tournaments/' + CODE, 'PUT', Object.assign(seed(), { prizeSettings: { kps: { perFlight: true } } }));
    await emu.admin('contestEntries/' + CODE, 'DELETE');
    await golfer(`contestEntries/${CODE}/h7/pa`, 'PUT', mark('Ana', 30));
    await golfer(`contestEntries/${CODE}/h7/pb`, 'PUT', mark('Ben', 20));
    const uB = await pick('pb');
    out['app per flight: payload is winners/pb + locks/fB'] = (uB['winners/pb'] === true && 'locks/fB' in uB && !('winner' in uB && uB.winner)) ? 'ok' : 'WRONG ' + JSON.stringify(uB);
    out['app per flight: owner sends Make winner Ben (B Flight)'] = await owner(`tournaments/${CODE}/contests/h7`, 'PATCH', uB);
    out['app per flight: a B Flight golfer enters after B is won'] = await golfer(`contestEntries/${CODE}/h7/pc`, 'PUT', mark('Cy', 10));
    out['app per flight: an A Flight golfer still enters'] = await golfer(`contestEntries/${CODE}/h7/pa`, 'PUT', mark('Ana', 25));
    const uA = await pick('pa');
    out['app per flight: owner sends Make winner Ana (A Flight), B stays won'] = await owner(`tournaments/${CODE}/contests/h7`, 'PATCH', uA);
    const h7 = (await getJson('tournaments/' + CODE + '/contests/h7')) || {};
    out['app per flight: two winners stored, one per flight'] = (h7.winners && h7.winners.pa === true && h7.winners.pb === true && h7.locks && h7.locks.fA && h7.locks.fB) ? 'ok' : 'WRONG ' + JSON.stringify(h7);
    const dataNow = await getJson('tournaments/' + CODE);
    out['app per flight: owner clears B Flight'] = await owner(`tournaments/${CODE}/contests/h7`, 'PATCH', TC.clearWinnerUpdate(dataNow, TC.contestFor(dataNow, 7), 'fB'));
    out['app per flight: a B Flight golfer enters again after the clear'] = await golfer(`contestEntries/${CODE}/h7/pc`, 'PUT', mark('Cy', 10));
    // SHARED TIES: Ana and Ben both 40 in, one field. Make winner Ana shares with Ben, locks/all.
    await emu.admin('tournaments/' + CODE, 'PUT', Object.assign(seed(), { prizeSettings: { kps: { ties: 'share' } } }));
    await emu.admin('contestEntries/' + CODE, 'DELETE');
    await golfer(`contestEntries/${CODE}/h7/pa`, 'PUT', mark('Ana', 40));
    await golfer(`contestEntries/${CODE}/h7/pb`, 'PUT', mark('Ben', 40));
    const uT = await pick('pa');
    out['app shared tie: payload is winners pa + pb + locks/all'] = (uT['winners/pa'] === true && uT['winners/pb'] === true && 'locks/all' in uT) ? 'ok' : 'WRONG ' + JSON.stringify(uT);
    out['app shared tie: owner sends Make winner (tie shared)'] = await owner(`tournaments/${CODE}/contests/h7`, 'PATCH', uT);
    out['app shared tie: a golfer enters after the tie is won'] = await golfer(`contestEntries/${CODE}/h7/pc`, 'PUT', mark('Cy', 5));
    // THE OLD WAY still works: no settings, one winner + lockedAt.
    await emu.admin('tournaments/' + CODE, 'PUT', seed());
    await emu.admin('contestEntries/' + CODE, 'DELETE');
    await golfer(`contestEntries/${CODE}/h7/pa`, 'PUT', mark('Ana', 30));
    const uL = await pick('pa');
    out['app default: payload is winner + lockedAt'] = (uL.winner === 'pa' && 'lockedAt' in uL) ? 'ok' : 'WRONG ' + JSON.stringify(uL);
    out['app default: owner sends Make winner'] = await owner(`tournaments/${CODE}/contests/h7`, 'PATCH', uL);
    out['app default: a golfer enters after it is won'] = await golfer(`contestEntries/${CODE}/h7/pb`, 'PUT', mark('Ben', 5));
    await emu.stop();
    return out;
}

(async () => {
    const pi = process.argv.indexOf('--published');
    if (pi > -1) {
        const file = process.argv[pi + 1];
        const a = await run(file, 'PUBLISHED RULES (' + file.split('/').slice(-2).join('/') + ')');
        const want = {
            'golfer enters (nothing locked)': 'ok', 'owner: old winner + lockedAt': 'ok', 'golfer enters after lockedAt': 'DENIED',
            'owner: B Flight winner (winners/pb + locks/fB)': 'ok', 'B Flight golfer enters after B is locked': 'DENIED',
            'A Flight golfer edits after B is locked': 'ok', 'owner: a winner with no entry': 'DENIED',
            'owner: a lock for a flight that does not exist': 'DENIED', 'owner: shared tie (winners pa + pb, locks/all)': 'ok',
            'golfer enters after locks/all': 'DENIED', 'a golfer cannot write winners': 'DENIED', 'owner clears (nulls)': 'ok',
            'round: owner marks hole 7 on Cascade': 'ok', 'round: golfer enters with the round key': 'ok',
            'round: golfer enters with a wrong key': 'DENIED', 'round: owner names a winner with no entry': 'DENIED',
            'round: owner confirms Ana': 'ok', 'round: golfer enters after the round hole is locked': 'DENIED',
        };
        const b = await runApp(file);
        const wantApp = {
            'app per flight: payload is winners/pb + locks/fB': 'ok', 'app per flight: owner sends Make winner Ben (B Flight)': 'ok',
            'app per flight: a B Flight golfer enters after B is won': 'DENIED', 'app per flight: an A Flight golfer still enters': 'ok',
            'app per flight: owner sends Make winner Ana (A Flight), B stays won': 'ok', 'app per flight: two winners stored, one per flight': 'ok',
            'app per flight: owner clears B Flight': 'ok', 'app per flight: a B Flight golfer enters again after the clear': 'ok',
            'app shared tie: payload is winners pa + pb + locks/all': 'ok', 'app shared tie: owner sends Make winner (tie shared)': 'ok',
            'app shared tie: a golfer enters after the tie is won': 'DENIED',
            'app default: payload is winner + lockedAt': 'ok', 'app default: owner sends Make winner': 'ok', 'app default: a golfer enters after it is won': 'DENIED',
        };
        let bad = 0;
        console.log('\nEXPECTED (as the proposal answered):');
        Object.keys(want).forEach((k) => { const ok = a[k] === want[k]; if (!ok) bad++; console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + k + '  got ' + a[k] + ' (want ' + want[k] + ')'); });
        console.log('\nTHE APP\'S OWN WRITERS:');
        Object.keys(wantApp).forEach((k) => { const ok = b[k] === wantApp[k]; if (!ok) bad++; console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + k + '  got ' + b[k] + ' (want ' + wantApp[k] + ')'); });
        const n = Object.keys(want).length + Object.keys(wantApp).length;
        console.log('\n' + (n - bad) + ' / ' + n + ' as expected');
        process.exit(bad ? 1 : 0);
    }
    const live = JSON.parse(fs.readFileSync(LIVE, 'utf8'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-rules-'));
    const liveFile = path.join(tmp, 'live.json'), propFile = path.join(tmp, 'proposal.json');
    fs.writeFileSync(liveFile, JSON.stringify(live));
    const P = proposal(live);
    fs.writeFileSync(propFile, JSON.stringify(P, null, 1));
    const wi = process.argv.indexOf('--write-proposal');
    if (wi > -1) fs.writeFileSync(process.argv[wi + 1], JSON.stringify(P, null, 1));
    const a = await run(liveFile, 'LIVE RULES (2026-11-16 combined, read back)');
    const b = await run(propFile, 'PROPOSAL');
    const want = {
        'golfer enters (nothing locked)': ['ok', 'ok'],
        'owner: old winner + lockedAt': ['ok', 'ok'],
        'golfer enters after lockedAt': ['DENIED', 'DENIED'],
        'owner: B Flight winner (winners/pb + locks/fB)': ['DENIED', 'ok'],
        'B Flight golfer enters after B is locked': ['ok', 'DENIED'],
        'A Flight golfer edits after B is locked': ['ok', 'ok'],
        'owner: a winner with no entry': ['DENIED', 'DENIED'],
        'owner: a lock for a flight that does not exist': ['DENIED', 'DENIED'],
        'owner: shared tie (winners pa + pb, locks/all)': ['DENIED', 'ok'],
        'golfer enters after locks/all': ['ok', 'DENIED'],
        'a golfer cannot write winners': ['DENIED', 'DENIED'],
        'owner clears (nulls)': ['ok', 'ok'],
        'round: owner marks hole 7 on Cascade': ['ok', 'ok'],
        'round: golfer enters with the round key': ['DENIED', 'ok'],
        'round: golfer enters with a wrong key': ['DENIED', 'DENIED'],
        'round: owner names a winner with no entry': ['ok', 'DENIED'],
        'round: owner confirms Ana': ['ok', 'ok'],
        'round: golfer enters after the round hole is locked': ['DENIED', 'DENIED'],
    };
    let bad = 0;
    console.log('\nEXPECTED (live / proposal):');
    Object.keys(want).forEach((k) => { const ok = a[k] === want[k][0] && b[k] === want[k][1]; if (!ok) bad++; console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + k + '  live ' + a[k] + ' (want ' + want[k][0] + '), proposal ' + b[k] + ' (want ' + want[k][1] + ')'); });
    console.log('\n' + (Object.keys(want).length - bad) + ' / ' + Object.keys(want).length + ' as expected');
    process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
