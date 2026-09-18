// ============================================================================
// course-import-rules.js - THE PURE HALF OF ONLINE COURSE SEARCH, SHARED.
//
// Lifted out of admin.html on 2026-09-17 so tournament.html could search the
// same proxy without copying the rules that decide what a valid card is. A
// copy that drifted would make a card valid on one page and refused on the
// other. This file holds the module on its own; course_import_test.js still
// reaches the same functions THROUGH admin.html, by name, as it always did -
// which is the proof the page really loads them rather than re-declaring them.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const R = require('./course-import-rules.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const good = () => [7, 13, 17, 1, 5, 11, 15, 9, 3, 8, 14, 18, 2, 6, 12, 16, 10, 4].map((si) => ({ par: 4, handicap: si }));

describe('THE CARD', () => {
    test('a clean 18 is accepted as hole/par/hcpIndex', () => {
        const r = R.importCardOrRefuse({ holes: good() });
        assert.equal(r.ok, true);
        assert.equal(r.data.length, 18);
        assert.deepEqual(r.data[0], { hole: 1, par: 4, hcpIndex: 7 });
    });
    test('17 holes, a par 7, an index 0, a duplicate index, a missing index: each refused with its own reason', () => {
        assert.match(R.importCardOrRefuse({ holes: good().slice(0, 17) }).reason, /no complete 18-hole card/);
        const p7 = good(); p7[2].par = 7;
        assert.match(R.importCardOrRefuse({ holes: p7 }).reason, /Hole 3 has par 7, which is outside 3-6/);
        const i0 = good(); i0[4].handicap = 0;
        assert.match(R.importCardOrRefuse({ holes: i0 }).reason, /Hole 5 has handicap 0, which is outside 1-18/);
        const dup = good(); dup[1].handicap = 7;
        assert.match(R.importCardOrRefuse({ holes: dup }).reason, /Handicap 7 is used on both hole 1 and hole 2/);
        assert.match(R.importCardOrRefuse(null).reason, /no complete 18-hole card/);
    });
});

describe('THE TEES', () => {
    const detail = { tees: { male: [{ tee_name: 'White', total_yards: 6300 }, { tee_name: 'Blue', total_yards: 6800 }], female: [{ tee_name: 'Red', total_yards: 5400 }] } };
    test('the canonical tee is the longest men\'s, else the longest women\'s, else null', () => {
        assert.deepEqual(R.pickCanonicalTee(detail), { gender: 'male', tee: detail.tees.male[1] });
        assert.deepEqual(R.pickCanonicalTee({ tees: { female: detail.tees.female } }), { gender: 'female', tee: detail.tees.female[0] });
        assert.equal(R.pickCanonicalTee({ tees: {} }), null);
    });
    test('allTeeSets lists men\'s by length then women\'s by length, each with its gender', () => {
        assert.deepEqual(R.allTeeSets(detail).map((t) => t.gender + '/' + t.tee.tee_name), ['male/Blue', 'male/White', 'female/Red']);
        assert.deepEqual(R.allTeeSets({}), []);
    });
});

describe('THE MESSAGES', () => {
    const REASONS = ['query_too_short', 'not_configured', 'bad_course_id', 'rate_limited', 'daily_limit', 'upstream_error', 'network'];
    test('every reason the Function emits has a sentence, all distinct, none about what exists', () => {
        const seen = new Set();
        REASONS.forEach((r) => {
            const m = R.courseImportMessage(r);
            assert.ok(m.length > 10 && !seen.has(m), r); seen.add(m);
            assert.doesNotMatch(m, /no courses? found|does ?n.t exist|no (such )?course|nothing (matched|found)/i);
        });
        assert.equal(R.courseImportMessage('made-up'), R.ONLINE_SEARCH_MESSAGES.upstream_error);
        assert.equal(R.ONLINE_SEARCH_CEILING, 25);
    });
    test('the shared daily_limit says when it comes back and NOTHING about typing a card - that is admin.html\'s own suffix', () => {
        assert.match(R.courseImportMessage('daily_limit'), /tomorrow/);
        assert.doesNotMatch(R.courseImportMessage('daily_limit'), /type|below|yourself/i);
        const admin = loadHtmlInlineScript('admin.html', [], { only: false });
        assert.match(admin.onlineSearchMessage('daily_limit'), /^Online search has used up today's lookups\. It works again tomorrow — you can still type the card in below\.$/);
        assert.equal(admin.onlineSearchMessage('network'), R.courseImportMessage('network'));
    });
});

describe('ONE BUILDER, TWO ENTRY POINTS', () => {
    test('admin.html no longer declares the four; both pages load the module; the module declares with var/function, never const', () => {
        const a = read('admin.html');
        ['function importCardOrRefuse(', 'function pickCanonicalTee(', 'const ONLINE_SEARCH_MESSAGES', 'const ONLINE_SEARCH_CEILING'].forEach((s) =>
            assert.ok(!a.includes(s), 'admin.html still declares ' + s));
        assert.ok(a.includes('importCardOrRefuse(') && a.includes('pickCanonicalTee('), 'admin.html still CALLS them');
        assert.match(a, /<script src="course-import-rules\.js"><\/script>/);
        assert.match(read('tournament.html'), /<script src="course-import-rules\.js"><\/script>/);
        const m = read('course-import-rules.js');
        assert.doesNotMatch(m, /^\s*const (ONLINE_SEARCH|importCardOrRefuse|pickCanonicalTee)/m, 'a const here collides with any page that ever re-declares');
        assert.match(m, /^var ONLINE_SEARCH_CEILING = 25;/m);
    });
});
