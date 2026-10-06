// ============================================================================
// ONE APPROVE IS ONE WRITE, AND A DOUBLE TAP IS ONE APPROVE
// (Tournaments Wave 1, A5)
//
// Approve was two sequential writes: the field (a set), then - only after the
// server answered - the registration entry (an update). The guard against a
// second approve read the entry, which said nothing until that second write.
// On one bar at a desk the gap is seconds; a second tap inside it put the
// golfer in the field twice. "New team" took its number from the record as
// last delivered, so two quick approvals both wrote teamN and the second
// overwrote the first - a golfer silently lost.
//
// THE ONE BAR IS MODELLED, NOT HOPED FOR. sandbox.__dbHold makes the stub
// return a promise the test settles - the SDK's queued write on a connection
// that has not answered. No echo is delivered while it is held, which is the
// worst case: the page has nothing but its own memory to stop the second tap.
//
// THE RULES HALF is read from this branch's database.rules.json through the
// targaryen library (nothing is published): the owner may make the multi-path
// write; a stranger and an anonymous user may not.
//
// BASELINE over the FINISHED file, all 8 tests: measured against 6d09df2 (A1
// to A4 committed, A5 not), tournament.html swapped back and restored by sha
// from a saved copy:
//
//   2 PASS / 6 FAIL / 8 tests.   2 + 6 = 8.
//
// THE TWO THAT PASS are the rules rows. They are about database.rules.json,
// which this wave does not touch, and they are green before and after: they
// prove the new single write is one the live rules accept, not that anything
// changed.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const CODE = 'APP1';
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const teamRec = () => ({ name: 'Desk Day', format: 'scramble', courseName: 'C', courseData: COURSE, createdAt: 1, ownerUid: OWNER.uid,
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 } } });
const indRec = () => ({ name: 'Medal', format: 'individual', scoringModel: 'player-v1', courseName: 'C', courseData: COURSE,
    createdAt: 1, ownerUid: OWNER.uid, players: {} });
const ENTRIES = {
    e1: { fullName: 'Bo Bravo', email: 'bo@example.com', phone: '555-0001', createdAt: 10 },
    e2: { fullName: 'Cal Charlie', email: 'cal@example.com', phone: '555-0002', createdAt: 11 }
};

function desk(rec, opts) {
    const held = [];
    const sb = loadHtmlInlineScript('tournament.html', [], {
        search: '?tourney=' + CODE,
        beforeRun(s) {
            if (opts && opts.hold) s.__dbHold = () => new Promise((res, rej) => held.push({ res, rej }));
        }
    });
    sb.__dbHandlers.filter((x) => x.event === 'value' && new RegExp('tournaments/' + CODE + '$').test(x.path))
        .forEach((x) => x.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    sb.__auth.setUser(OWNER);
    sb.__dbHandlers.filter((x) => x.event === 'value' && new RegExp('registrations/' + CODE + '$').test(x.path))
        .forEach((x) => x.cb({ val: () => JSON.parse(JSON.stringify(ENTRIES)), exists: () => true }));
    const desk = String(sb.document.getElementById('registration-list').innerHTML);
    assert.match(desk, /approveRegistration\('e1'\)/, 'the desk offered no Approve');
    return { sb, held };
}
// The row's own button: onclick="approveRegistration('<id>')".
const tap = (sb, id) => vm.runInContext(`approveRegistration('${id}')`, sb);
const tick = () => new Promise((r) => setImmediate(r));
const approveWrites = (sb) => sb.__dbWrites.filter((w) => /^tournaments\/|^registrations\/|^$/.test(String(w.path || '')) || w.path === undefined);

describe('A5. one approve, one write', () => {
    test('a new team and the entry’s mark travel in ONE update', () => {
        const { sb } = desk(teamRec());
        tap(sb, 'e1');
        const w = approveWrites(sb);
        assert.equal(w.length, 1, 'approve sent ' + w.length + ' writes: ' + JSON.stringify(w));
        assert.equal(w[0].op, 'update');
        assert.ok(w[0].path === undefined || w[0].path === '', 'not a root multi-path update: ' + w[0].path);
        const keys = Object.keys(w[0].value).sort();
        assert.deepEqual(keys, ['registrations/APP1/e1/approvedAt', 'registrations/APP1/e1/teamNum', 'tournaments/APP1/teams/team2']);
        assert.equal(w[0].value['tournaments/APP1/teams/team2'].players[0], 'Bo Bravo');
        assert.equal(w[0].value['registrations/APP1/e1/teamNum'], 2);
    });

    test('so does an individual approve: the player and the entry’s playerId together', () => {
        const { sb } = desk(indRec());
        tap(sb, 'e1');
        const w = approveWrites(sb);
        assert.equal(w.length, 1, JSON.stringify(w));
        const pKey = Object.keys(w[0].value).find((k) => /^tournaments\/APP1\/players\//.test(k));
        assert.ok(pKey, 'no player in the write');
        assert.equal(w[0].value['registrations/APP1/e1/playerId'], pKey.split('/').pop());
    });
});

describe('A5. on one bar', () => {
    test('a double tap while the write is held sends ONE write', async () => {
        const { sb, held } = desk(teamRec(), { hold: true });
        tap(sb, 'e1'); tap(sb, 'e1');
        await tick();
        assert.equal(approveWrites(sb).length, 1, 'the second tap wrote again: ' + JSON.stringify(approveWrites(sb)));
        assert.equal(held.length, 1);
    });

    test('two quick New-team approvals get two different team numbers', async () => {
        const { sb } = desk(teamRec(), { hold: true });
        tap(sb, 'e1'); tap(sb, 'e2');
        await tick();
        const w = approveWrites(sb);
        assert.equal(w.length, 2);
        const teamKeys = w.map((x) => Object.keys(x.value).find((k) => /teams\/team\d+$/.test(k)));
        assert.deepEqual(teamKeys, ['tournaments/APP1/teams/team2', 'tournaments/APP1/teams/team3'],
            'the second approval overwrote the first team');
        assert.deepEqual(w.map((x) => x.value[Object.keys(x.value).find((k) => /teamNum$/.test(k))]), [2, 3]);
    });

    test('a refused write releases its lock and its number, so the desk can try again', async () => {
        const { sb, held } = desk(teamRec(), { hold: true });
        sb.alert = () => {};
        vm.runInContext('alert = function () {};', sb);
        tap(sb, 'e1');
        held[0].rej(new Error('PERMISSION_DENIED'));
        await tick(); await tick();
        tap(sb, 'e1');
        const w = approveWrites(sb);
        assert.equal(w.length, 2, 'the retry was refused by a lock that never released');
        assert.ok(Object.keys(w[1].value).includes('tournaments/APP1/teams/team2'), 'the retry skipped a number nobody holds');
    });

    test('once settled, the same entry cannot be approved again (the echo marks it)', async () => {
        const { sb, held } = desk(teamRec(), { hold: true });
        tap(sb, 'e1');
        held[0].res(); await tick(); await tick();
        const marked = JSON.parse(JSON.stringify(ENTRIES));
        marked.e1.approvedAt = 99; marked.e1.teamNum = 2;
        sb.__dbHandlers.filter((x) => x.event === 'value' && /registrations\/APP1$/.test(x.path))
            .forEach((x) => x.cb({ val: () => marked, exists: () => true }));
        tap(sb, 'e1');
        assert.equal(approveWrites(sb).length, 1);
    });
});

describe('A5. the live rules accept the single write (read, never published)', () => {
    const targaryen = require('targaryen');
    const rules = require('./database.rules.json');
    const data = { tournaments: { APP1: { name: 'x', ownerUid: OWNER.uid, teams: { team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 } } } },
        registrations: { APP1: { e1: { fullName: 'Bo Bravo', email: 'bo@example.com', phone: '555-0001', createdAt: 10 } } } };
    const change = { 'tournaments/APP1/teams/team2': { num: 2, name: 'Team 2', players: ['Bo Bravo'], handicap: 0 },
        'registrations/APP1/e1/approvedAt': 5, 'registrations/APP1/e1/teamNum': 2 };
    const as = (uid) => targaryen.database(rules, data).as(uid ? { uid, provider: 'password', token: { firebase: { sign_in_provider: 'password' } } } : null);
    test('the owner may', () => { assert.equal(as(OWNER.uid).update('/', change).allowed, true); });
    test('a stranger and an anonymous visitor may not', () => {
        assert.equal(as('u-stranger').update('/', change).allowed, false);
        assert.equal(as(null).update('/', change).allowed, false);
    });
});
