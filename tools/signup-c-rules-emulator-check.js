#!/usr/bin/env node
// ============================================================================
// SIGN-UP C, THE SEAT RULES PROPOSAL, PROVED IN THE EMULATOR (Manny's pick
// 2026-11-21, "Event page with sign-up"). NOTHING IS PUBLISHED: this builds the
// proposal from the LIVE rules (iOS's 2.1.0 publish, read back:
// ~/Desktop/claude-mailbox/outbox/rules-publish-20261119-210/readback.json) and
// runs the same writes against both in a local RTDB emulator.
//
// THE PROPOSAL (one addition, nothing else changes):
//   signupSeats/$code            .read true (anyone may COUNT the seats)
//   signupSeats/$code/$entryId   = the server time of the sign-up (a number)
//     .write  CREATE: no seat there yet, the event exists (an ownerUid), the
//             registration with the SAME id does not exist yet and does exist
//             after this write - i.e. it is created in the same update;
//             DELETE: the owner or a co-organizer.
//     .validate  a number, equal to `now` (the server time) and to that
//             registration's createdAt - so the order the Desk keeps cannot be
//             bought with a phone's clock, and a seat cannot carry a name.
//   RULES CANNOT COUNT: nothing here stops a 73rd seat on a 72-golfer field.
//   The cap is the Desk's ordering (tournament.html, signupCapOf), not this.
//
// MUST BE MERGED with the golfer-code rules proposal
// (claude-mailbox-shared/outbox/TOURN-20261120-golfer-codes-rules-NOTE.md) into
// ONE publish, later, on Manny's typed OK.
//
//   node tools/signup-c-rules-emulator-check.js [--write-proposal <file> [--proposal-only]] [--live <readback.json>]
//   exit 0 = every expectation met
// Golfer writes carry NO auth at all (the public sign-up page); owner writes
// carry ?auth=<unsigned JWT> - a Bearer header is ADMIN in the emulator.
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Emulator } = require('./sim/lib/emu-phone.js');

const argv = process.argv;
const at = (flag) => { const i = argv.indexOf(flag); return i > -1 ? argv[i + 1] : null; };
const LIVE = at('--live') || path.join(os.homedir(), 'Desktop', 'claude-mailbox', 'outbox', 'rules-publish-20261119-210', 'readback.json');
const NS = 'golfapp-9fb21-default-rtdb';

const OWNER_OR_COORG = "auth != null && (auth.uid === root.child('tournaments/' + $code + '/ownerUid').val() || (auth.token.email != null && root.child('tournaments/' + $code + '/coOrganizers/' + auth.token.email.toLowerCase().replace('.', ',')).val() === true))";
const REG_NEW = "newData.parent().parent().parent().child('registrations/' + $code + '/' + $entryId + '";
function proposal(live) {
    const R = JSON.parse(JSON.stringify(live));
    const root = R.rules || R;
    if (root.signupSeats) throw new Error('the live rules already have signupSeats: re-read before proposing');
    if (!root.registrations || !root.registrations.$code || !root.registrations.$code.$entryId) throw new Error('the live registrations block moved');
    root.signupSeats = {
        $code: {
            '.read': true,
            $entryId: {
                '.write': "(!data.exists() && newData.exists()"
                    + " && root.child('tournaments/' + $code + '/ownerUid').exists()"
                    + " && !root.child('registrations/' + $code + '/' + $entryId).exists()"
                    + ' && ' + REG_NEW + "/createdAt').exists())"
                    + ' || (!newData.exists() && ' + OWNER_OR_COORG + ')',
                '.validate': 'newData.isNumber() && newData.val() === now && newData.val() === ' + REG_NEW + "/createdAt').val()"
            }
        }
    };
    return R;
}

function token(uid, email) {
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const t = Math.floor(Date.now() / 1000);
    return b({ alg: 'none', typ: 'JWT' }) + '.' + b(Object.assign({ sub: uid, user_id: uid, aud: 'golfapp-9fb21', iss: 'https://securetoken.google.com/golfapp-9fb21', iat: t, exp: t + 3600, auth_time: t,
        firebase: { sign_in_provider: email ? 'password' : 'anonymous' } }, email ? { email, email_verified: true } : {})) + '.';
}

const CODE = 'SGC1';
const OWNER = { uid: 'u-org', email: 'org@sim.example' };
const COORG = { uid: 'u-co', email: 'co@sim.example' };
const STRANGER = { uid: 'u-str', email: 'str@sim.example' };
const TS = { '.sv': 'timestamp' };
const event = () => ({ name: 'Spring Invitational', ownerUid: OWNER.uid, format: 'individual', scoringModel: 'player-v1', courseName: 'Sim', createdAt: 1,
    signup: { cap: 72 }, coOrganizers: { 'co@sim,example': true }, players: { p1: { id: 'p1', name: 'Ray Holt', handicap: '8', addedAt: 1 } } });
const reg = (name, createdAt) => ({ fullName: name, email: name.split(' ')[0].toLowerCase() + '@example.com', phone: '602-555-0143', createdAt: createdAt === undefined ? TS : createdAt });
const both = (id, name, seat, created) => ({ [`registrations/${CODE}/${id}`]: reg(name, created), [`signupSeats/${CODE}/${id}`]: seat === undefined ? TS : seat });

async function run(rulesFile, label) {
    const emu = new Emulator(9400 + Math.floor(Math.random() * 400), NS);
    await emu.start(rulesFile);
    const call = (who) => async (p, method, body) => {
        const q = '?ns=' + NS + (who ? '&auth=' + token(who.uid, who.email) : '');
        const r = await fetch(emu.base + '/' + p + '.json' + q, { method, body: body === undefined ? undefined : JSON.stringify(body) });
        return r.status === 200 ? 'ok' : 'DENIED';
    };
    const golfer = call(null), owner = call(OWNER), coorg = call(COORG), stranger = call(STRANGER);
    const out = {};
    try {
        await emu.admin('tournaments/' + CODE, 'PUT', event());
        out['1 golfer: registration + seat in one update'] = await golfer('', 'PATCH', both('e1', 'Kim Vo'));
        out['2 anyone reads the seat list (count)'] = await golfer(`signupSeats/${CODE}`, 'GET');
        out['3 a seat with no registration'] = await golfer(`signupSeats/${CODE}/e2`, 'PUT', TS);
        out['4 a second write over an existing seat (seat alone)'] = await golfer(`signupSeats/${CODE}/e1`, 'PUT', TS);
        out['5 a second combined write over an existing entry'] = await golfer('', 'PATCH', both('e1', 'Kim Vo'));
        out['6 a seat carrying a name'] = await golfer('', 'PATCH', both('e3', 'Dana Ruiz', { name: 'Dana Ruiz', at: TS }));
        out['7 a seat with the phone clock, not the server time'] = await golfer('', 'PATCH', both('e4', 'Lee Park', 1763130000000, 1763130000000));
        out['8 a seat beside a registration that already existed'] = await (async () => {
            await golfer(`registrations/${CODE}/e5`, 'PUT', reg('Ann Old', 1763130000000));
            return golfer(`signupSeats/${CODE}/e5`, 'PUT', TS);
        })();
        out['9 the registration alone (no seat)'] = await golfer(`registrations/${CODE}/e6`, 'PUT', reg('Bo Alone', Date.now()));
        out['10 a seat on an event that does not exist'] = await golfer('', 'PATCH', { [`registrations/NOPE/e7`]: reg('Cy Ghost'), [`signupSeats/NOPE/e7`]: TS });
        out['11 a stranger deletes a seat'] = await stranger(`signupSeats/${CODE}/e1`, 'DELETE');
        out['12 an anonymous golfer deletes a seat'] = await golfer(`signupSeats/${CODE}/e1`, 'DELETE');
        out['13 the co-organizer deletes a seat'] = await (async () => {
            if (label === 'PROPOSAL') await emu.admin(`signupSeats/${CODE}/e8`, 'PUT', 1763130000000);
            return coorg(`signupSeats/${CODE}/e8`, 'DELETE');
        })();
        out['14 the owner deletes a seat'] = await owner(`signupSeats/${CODE}/e1`, 'DELETE');
        out['15 the owner removes a golfer: registration + player in one update'] = await owner('', 'PATCH', { [`registrations/${CODE}/e1`]: null, [`tournaments/${CODE}/players/pe1`]: null });
        out['16 the registrations stay private (a stranger reads)'] = await stranger(`registrations/${CODE}`, 'GET');
        out['17 the owner writes the field size'] = await owner(`tournaments/${CODE}/signup`, 'PATCH', { cap: 60, open: false });
        out['18 the owner\'s automatic add (player + approvedAt + playerId)'] = await owner('', 'PATCH', {
            [`tournaments/${CODE}/players/pe6`]: { id: 'pe6', name: 'Bo Alone', handicap: '0', addedAt: Date.now(), signupId: 'e6' },
            [`registrations/${CODE}/e6/approvedAt`]: Date.now(), [`registrations/${CODE}/e6/playerId`]: 'pe6' });
        const seats = await emu.admin(`signupSeats/${CODE}`);
        out['  (seats left in the db: ' + JSON.stringify(Object.keys(seats || {})) + ')'] = '--';
    } finally { emu.stop(); }
    console.log('\n' + label); Object.keys(out).forEach((k) => console.log('  ' + out[k].padEnd(7) + k));
    return out;
}

(async () => {
    const live = JSON.parse(fs.readFileSync(LIVE, 'utf8'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'signup-c-rules-'));
    const liveFile = path.join(tmp, 'live.json'), propFile = path.join(tmp, 'proposal.json');
    fs.writeFileSync(liveFile, JSON.stringify(live));
    const P = proposal(live);
    fs.writeFileSync(propFile, JSON.stringify(P, null, 1));
    const wp = at('--write-proposal');
    if (wp) fs.writeFileSync(wp, JSON.stringify(P, null, 2) + '\n');
    if (argv.includes('--proposal-only')) { console.log('proposal written: ' + wp); process.exit(0); }
    const a = await run(liveFile, 'LIVE RULES (2.1.0 publish, read back)');
    const b = await run(propFile, 'PROPOSAL');
    const want = {
        '1 golfer: registration + seat in one update': ['DENIED', 'ok'],
        '2 anyone reads the seat list (count)': ['DENIED', 'ok'],
        '3 a seat with no registration': ['DENIED', 'DENIED'],
        '4 a second write over an existing seat (seat alone)': ['DENIED', 'DENIED'],
        '5 a second combined write over an existing entry': ['DENIED', 'DENIED'],
        '6 a seat carrying a name': ['DENIED', 'DENIED'],
        '7 a seat with the phone clock, not the server time': ['DENIED', 'DENIED'],
        '8 a seat beside a registration that already existed': ['DENIED', 'DENIED'],
        '9 the registration alone (no seat)': ['ok', 'ok'],
        '10 a seat on an event that does not exist': ['DENIED', 'DENIED'],
        '11 a stranger deletes a seat': ['DENIED', 'DENIED'],
        '12 an anonymous golfer deletes a seat': ['DENIED', 'DENIED'],
        '13 the co-organizer deletes a seat': ['DENIED', 'ok'],
        '14 the owner deletes a seat': ['DENIED', 'ok'],
        '15 the owner removes a golfer: registration + player in one update': ['ok', 'ok'],
        '16 the registrations stay private (a stranger reads)': ['DENIED', 'DENIED'],
        '17 the owner writes the field size': ['ok', 'ok'],
        '18 the owner\'s automatic add (player + approvedAt + playerId)': ['ok', 'ok'],
    };
    let bad = 0;
    console.log('\nEXPECTED (live / proposal):');
    Object.keys(want).forEach((k) => { const ok = a[k] === want[k][0] && b[k] === want[k][1]; if (!ok) bad++; console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + k + '  live ' + a[k] + ' (want ' + want[k][0] + '), proposal ' + b[k] + ' (want ' + want[k][1] + ')'); });
    console.log('\n' + (Object.keys(want).length - bad) + ' / ' + Object.keys(want).length + ' as expected');
    process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
