// ============================================================================
// THE EVENT NAME AND ENTRY FEE CAN BE CORRECTED AFTER SAVE
// (Tournaments Wave 1, A6)
//
// The only post-create writers were setEventDetail (date, time, venue,
// beneficiary) and the round editor. A typo in the name, or a $100 fee typed
// as $1000, meant rebuilding the event - and losing every signup on it. Two
// boxes now sit at the top of Setup's Event details card and each writes its
// own key on change, the same shape setEventDetail uses. Course and format are
// deliberately NOT editable here: they change how the event scores (Wave 2).
//
// THE PATH IS THE USER'S: the owner's page arrives through its own listener,
// each box's onchange is run exactly as the markup declares it, with `this`
// bound to the box, and the write is echoed back through the listener to read
// the header and the pool the way everyone else would see them.
//
// BASELINE over the FINISHED file, all 7 tests: measured against 4475672 (A1
// to A5 committed, A6 not), tournament.html swapped back and restored by sha
// from a saved copy:
//
//   1 PASS / 6 FAIL / 7 tests.   1 + 6 = 7.
//
// THE ONE THAT PASSES is "a stranger cannot", vacuous on the base: there was no
// box and no writer, so nothing could be written. Kept for what it will catch -
// a writer that forgets canManage().
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const CODE = 'EDIT1';
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const STRANGER = { uid: 'u-who', email: 'who@example.com', isAnonymous: false };
const SRC = fs.readFileSync('tournament.html', 'utf8');
const rec = () => ({ name: 'Charity Clasic', format: 'scramble', courseName: 'Cameron Park', courseData: COURSE,
    entryFee: 1000, createdAt: 1, ownerUid: OWNER.uid,
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Bo'], handicap: 0 } } });

function arrive(user) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=' + CODE });
    sb.__fire = (r) => sb.__dbHandlers.filter((x) => x.event === 'value' && new RegExp('tournaments/' + CODE + '$').test(x.path))
        .forEach((x) => x.cb({ val: () => JSON.parse(JSON.stringify(r)), exists: () => true }));
    sb.__fire(rec());
    sb.__auth.setUser(user);
    return sb;
}
// The box's own onchange, as the markup declares it, with `this` = the box.
function change(sb, id, value) {
    const m = new RegExp('id="' + id + '"[^>]*onchange="([^"]+)"').exec(SRC);
    assert.ok(m, '#' + id + ' has no onchange in the markup');
    const box = sb.document.getElementById(id);
    box.value = value;
    sb.__box = box;
    vm.runInContext(`(function () { ${m[1]} }).call(__box)`, sb);
}
const writes = (sb, key) => sb.__dbWrites.filter((w) => w.path === `tournaments/${CODE}/${key}`);

describe('A6. the event name', () => {
    test('the box opens holding the saved name', () => {
        const sb = arrive(OWNER);
        assert.equal(sb.document.getElementById('ev-name').value, 'Charity Clasic');
    });

    test('a correction writes the name, and the headers everyone reads follow it', () => {
        const sb = arrive(OWNER);
        change(sb, 'ev-name', '  Charity Classic ');
        const w = writes(sb, 'name');
        assert.equal(w.length, 1);
        assert.equal(w[0].value, 'Charity Classic');
        const r = rec(); r.name = w[0].value; sb.__fire(r);
        assert.equal(sb.document.getElementById('manage-t-name').textContent, '🏆 Charity Classic');
        assert.equal(sb.document.getElementById('lb-t-name').textContent, '🏆 Charity Classic');
    });

    test('an emptied box writes nothing and puts the name back', () => {
        const sb = arrive(OWNER);
        change(sb, 'ev-name', '   ');
        assert.equal(writes(sb, 'name').length, 0);
        assert.equal(sb.document.getElementById('ev-name').value, 'Charity Clasic');
    });
});

describe('A6. the entry fee', () => {
    test('the box opens holding the saved fee', () => {
        const sb = arrive(OWNER);
        assert.equal(String(sb.document.getElementById('ev-fee').value), '1000');
    });

    test('a correction writes a number, and the pool follows it', () => {
        const sb = arrive(OWNER);
        assert.match(sb.document.getElementById('manage-t-pool').textContent, /\$2000\.00/, 'premise: $1000 x 2 teams');
        change(sb, 'ev-fee', '100');
        const w = writes(sb, 'entryFee');
        assert.equal(w.length, 1);
        assert.equal(w[0].value, 100);
        assert.equal(typeof w[0].value, 'number');
        const r = rec(); r.entryFee = w[0].value; sb.__fire(r);
        assert.match(sb.document.getElementById('manage-t-pool').textContent, /\$200\.00/);
    });

    test('a negative or unreadable fee writes nothing', () => {
        const sb = arrive(OWNER);
        change(sb, 'ev-fee', '-5');
        change(sb, 'ev-fee', 'abc');
        assert.equal(writes(sb, 'entryFee').length, 0);
    });
});

describe('A6. only the owner', () => {
    test('a stranger cannot change the name or the fee', () => {
        const sb = arrive(STRANGER);
        try { change(sb, 'ev-name', 'Hijacked'); } catch (e) { /* base: no box */ }
        try { change(sb, 'ev-fee', '1'); } catch (e) { /* base: no box */ }
        assert.equal(writes(sb, 'name').length + writes(sb, 'entryFee').length, 0);
    });
});
