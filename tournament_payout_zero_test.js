// ============================================================================
// THE PAYOUT CALCULATOR AT ZERO (polish wave item 2, 2026-09-18): no hollow
// $0.00 rows, with a pool or without, and a sentence that can actually render.
//
// MEASURED BEFORE THE WAVE (mini-dom, then read against the source): with
// entryFee 0 and three scored teams the results list rendered THREE ledger
// rows, every one "$0.00" - a finished-looking payout table for a pool that
// does not exist. With a pool the same happened for every rank past the paid
// spots, because allocatePlacePayouts (payouts.js, PROTECTED, shared with Trip
// Mode) returns every ranked entry with amount 0 for the unpaid ranks, and
// renderPayoutResults printed them all. And "No paid spots reached yet."
// (:2782) had never rendered: payouts is empty only when no row has scores,
// and that case returned "No scores yet" three lines earlier.
//
// NOW, a PAGE FILTER - the allocator is untouched (its sha is pinned here for
// that reason): rows with amount 0 are not printed. Three sentences, each
// reachable:
//   no row has scores            -> "No scores yet — payouts will show once teams start posting."
//   every spot amount is 0       -> "Enter spot amounts above to see payouts."
//   amounts set, nobody reaches  -> "No paid spots reached yet."   (e.g. 1st $0, 2nd $50, one team)
// The mismatch banner keeps its own rule (pool > 0 and amounts != pool).
//
// HARNESS. mini-dom does not parse the spot <input>s out of innerHTML, so every
// amount reads 0 here: this file proves the zero-amount rules and the
// sentences; the typed-amount rows and the "reached" sentence are Chrome's -
// tools/tournament-pool-and-flight-check.js TEST 18 (the fee-0 arm added with
// this wave). SAID PLAINLY: with the filter deleted, the behavioural tests in
// this file stay green (all-zero amounts take the sentence branch before the
// filter matters) and only the source test goes red; TEST 18 is what caught
// that control ("rows 3, zeros 2"). Do not read section 1 as a filter proof.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('tournament.html');
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

function arrive(entryFee, nTeams, scored) {
    const teams = {}, scores = {};
    for (let i = 1; i <= nTeams; i++) {
        teams['team' + i] = { num: i, name: 'T' + i, players: ['A' + i], handicap: 0 };
        if (scored) for (let h = 1; h <= 18; h++) scores['team' + i + '_h' + h] = 4 + (i % 3);
    }
    const rec = { name: 'PZ', format: 'scramble', courseName: 'C', courseData: COURSE, entryFee, teams, scores, createdAt: 1, ownerUid: 'u-org' };
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=PZ' });
    sb.__auth.setUser(ORGANIZER);
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/PZ$/.test(h.path)).forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    return sb;
}
const html = (sb, id) => String((sb.document.getElementById(id) || {}).innerHTML || '');
const text = (sb, id) => String((sb.document.getElementById(id) || {}).textContent || '');
const count = (s, re) => (String(s || '').match(re) || []).length;

describe('1. AT ZERO - fee 0, teams scored, nothing typed', () => {
    [3, 5].forEach((n) => {
        test(`${n} scored teams, fee 0: NO ledger rows, no $0.00, the "Enter spot amounts" sentence`, () => {
            const sb = arrive(0, n, true);
            const r = html(sb, 'payout-results');
            assert.equal(count(r, /ledger-row/g), 0, 'hollow rows: ' + r);
            assert.equal(count(r, /\$0\.00/g), 0);
            assert.match(r, /Enter spot amounts above to see payouts\./);
            assert.doesNotMatch(r, /add up to/, 'no mismatch banner without a pool');
            assert.match(text(sb, 'payout-pool-sub'), /No entry fee set for this tournament/, 'the separate-pool sentence stays');
        });
    });
    test('no scores at all keeps the "No scores yet" sentence (the first rule, unchanged)', () => {
        const sb = arrive(0, 3, false);
        assert.match(html(sb, 'payout-results'), /No scores yet — payouts will show once teams start posting\./);
        assert.doesNotMatch(html(sb, 'payout-results'), /Enter spot amounts/);
    });
});

describe('2. WITH A POOL - the same filter; the banner is the pool\'s own rule', () => {
    test('fee 100, 5 scored teams, amounts unreadable here (0): no $0.00 rows, the "Enter spot amounts" sentence, AND the mismatch banner', () => {
        const sb = arrive(100, 5, true);
        const r = html(sb, 'payout-results');
        assert.equal(count(r, /ledger-row/g), 0);
        assert.equal(count(r, /\$0\.00<\/span><\/div>/g), 0, 'no $0.00 ledger amounts');
        assert.match(r, /Enter spot amounts above to see payouts\./);
        assert.match(r, /add up to \$0\.00, but the pool is \$500\.00/, 'the banner still tells the truth about the pool');
        assert.match(text(sb, 'payout-pool-sub'), /Pool is \$500\.00/);
    });
});

describe('3. THE SOURCE - a page filter, three reachable sentences, the allocator untouched', () => {
    const at = SRC.indexOf('function renderPayoutResults()');
    const fn = SRC.slice(at, SRC.indexOf('\n    }', at));
    test('renderPayoutResults filters amount > 0 and prints only those', () => {
        assert.ok(fn.length > 300, 'the renderer exists');
        assert.match(fn, /\.filter\(\(?p\)? => p\.amount > 0\)/, 'the zero-amount filter');
        assert.match(fn, /Enter spot amounts above to see payouts\./);
        assert.match(fn, /No paid spots reached yet\./, 'the sentence stays, now reachable');
        assert.match(fn, /No scores yet — payouts will show once teams start posting\./);
        assert.match(fn, /spotAmounts\.some\(\(?v\)? => v > 0\)/, 'the all-zero test decides which sentence');
    });
    test('payouts.js is byte-identical to HEAD at the wave (PROTECTED; the filter is the page\'s)', () => {
        const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, 'payouts.js'))).digest('hex');
        assert.equal(sha, 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8', 'payouts.js changed - this wave was a page filter and may not touch the allocator');
    });
    test('the allocator still returns every rank (so the filter is doing the work, not the engine)', () => {
        const { allocatePlacePayouts } = loadJsFile('payouts.js');
        const out = allocatePlacePayouts([{ rank: 1 }, { rank: 2 }, { rank: 3 }], [50]);
        assert.deepEqual(JSON.parse(JSON.stringify(out.map((p) => p.amount))), [50, 0, 0]);
    });
});

describe('4. THE SEAMS', () => {
    test('the Chrome tool has the fee-0 arm (TEST 18) that types an amount and sees rows appear', () => {
        const t = read('tools/tournament-pool-and-flight-check.js');
        assert.match(t, /TEST 18/);
        assert.match(t, /entryFee: 0/);
        assert.match(t, /Enter spot amounts above to see payouts/);
    });
    test('HANDOFF records the filter, the dead sentence, and that payouts.js was not touched', () => {
        const h = read('HANDOFF.md');
        const at = h.indexOf('## The payout calculator at zero');
        assert.ok(at > 0, 'no payout section');
        const s = h.slice(at, at + 5000);
        ['$0.00', 'No paid spots reached yet', 'Enter spot amounts above', 'payouts.js', 'page filter'].forEach((k) => assert.ok(s.indexOf(k) > -1, 'HANDOFF misses ' + k));
    });
});
