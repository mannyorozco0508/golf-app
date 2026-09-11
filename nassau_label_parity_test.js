// ============================================================================
// ONE NASSAU LABEL, RENDERED THE SAME ON BOTH PAGES.
//
// A Nassau created at Step 6 carries frontStake / backStake / overallStake and
// leaves the legacy `stake` at 0. Measured on the live database: 8 rounds are
// shaped exactly like that. The Matches tab printed `$${sm.stake || 0}/match`,
// so every one of them read "$0/match" for a bet worth $25.
//
// Hole View had the opposite half of the same bug. Its inline builder coerced a
// missing segment to zero, so a LEGACY single-stake Nassau - `stake` set, no
// segments - printed "F $0 / B $0 / O $0" for a $20 bet. Neither page could
// state a Nassau's price correctly in both shapes.
//
// The rule both pages now use is money-engine.js's own: baseStakeFor() falls a
// blank segment back to the legacy single stake, which is what the golfer is
// actually charged. nassauStakeLabel() in action-model.js states that same
// fallback, and nothing else - it computes no money and decides no bet.
//
// ---------------------------------------------------------------------------
// WHY COLD CHROME AND NOT mini-dom
// ---------------------------------------------------------------------------
// The claim is what a golfer READS on two different pages. mini-dom parses no
// static markup and has no layout, so it cannot tell a rendered label from one
// that never reached the screen. These arrive at real URLs, touch nothing, and
// read innerText - which excludes hidden elements and script bodies, the trap
// CLAUDE.md records for textContent.
//
// EVERY EXPECTATION BELOW WAS MEASURED ON THE UNCHANGED PAGES FIRST. The Match
// Play strings are literal because "unchanged" is only meaningful against what
// today actually prints; they were captured before a line was edited.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

// NLP_INDEX / NLP_SIDE point an arm at a temp copy, which is how the negative
// controls revert one page at a time. Unset in normal use.
const INDEX_PAGE = process.env.NLP_INDEX || 'index.html';
const SIDE_PAGE = process.env.NLP_SIDE || 'sidematches.html';

const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const P = [
    { id: 101, name: 'Dale Whitmore', hcp: '0', playingForMoney: true, team: 'Team 1' },
    { id: 102, name: 'Ken Abbott', hcp: '0', playingForMoney: true, team: 'Team 2' }
];
function scores() {
    const s = {};
    for (let h = 1; h <= 18; h++) {
        s['p101_h' + h] = [1, 2, 3, 10, 11, 12].includes(h) ? 3 : 4;
        s['p102_h' + h] = 4;
    }
    return s;
}
// THE MAIN FORMAT IS STROKE ON PURPOSE. A Nassau round format would put a second
// Nassau label on the page and the assertions could match the wrong one.
const base = {
    eventName: 'Saturday', courseName: 'Caledonia', activeCourseKey: 'caledonia',
    courseData: CD, players: P, scores: scores(), settlementMode: 'whole-dollar',
    gameFormat: 'stroke'
};
const sm = (o) => Object.assign(
    { id: 'sm1', scoring: 'net', pressRule: 'none', createdAt: 1, teamAIds: [101], teamBIds: [102] }, o);

const FIX = {
    split: sm({ format: 'nassau', stake: 0, frontStake: 7, backStake: 7, overallStake: 11 }),
    splitPressed: sm({ format: 'nassau', stake: 0, frontStake: 7, backStake: 7, overallStake: 11,
        pressRule: '2down', autoPressStake: 25 }),
    single: sm({ format: 'nassau', stake: 20 }),
    matchPlay: sm({ format: 'match', stake: 20 })
};

const PROBE = `JSON.stringify((function () {
  var t = document.body.innerText || '';
  return t.split('\\n').map(function (x) { return x.trim(); })
          .filter(function (x) { return x && x.length < 120 && /Nassau|Match Play/.test(x); });
})())`;

const S = {};
before(async () => {
    let i = 0;
    for (const [name, match] of Object.entries(FIX)) {
        const CODE = 'NLP' + (i++);
        const db = { events: { [CODE]: Object.assign({}, base, { sideMatches: { sm1: match } }) },
            trips: {}, global_courses: {}, tournaments: {} };
        for (const [tag, page] of [['hole', INDEX_PAGE], ['matches', SIDE_PAGE]]) {
            const r = await arriveCold({ url: fileUrl(page, 'game=' + CODE), db,
                expression: PROBE, settleMs: 9000 });
            S[name + '.' + tag] = r.ok ? JSON.parse(r.value) : ['COULD NOT RUN: ' + r.reason];
        }
    }
});

const lines = (k) => {
    assert.ok(S[k], 'no capture for ' + k);
    assert.ok(!String(S[k][0] || '').startsWith('COULD NOT RUN'),
        k + ': ' + S[k][0]);
    return S[k];
};
const has = (k, needle) => lines(k).some((l) => l.indexOf(needle) > -1);
const dump = (k) => JSON.stringify(lines(k));

describe('BOTH PAGES ACTUALLY RENDERED A LABEL', () => {

    // POSITIVE FIRST. Every assertion below is about the CONTENT of a label, and
    // all of them would pass against a page that rendered no label at all.
    test('every fixture produced a label on both pages', () => {
        Object.keys(FIX).forEach((f) => {
            ['hole', 'matches'].forEach((tag) => {
                assert.ok(lines(f + '.' + tag).length > 0,
                    `${f} on ${tag} rendered no Nassau/Match Play line at all - every content `
                    + 'assertion in this file would pass vacuously');
            });
        });
    });
});

describe('A STEP-6 NASSAU STATES ITS REAL PRICE, NOT $0', () => {

    test('MATCHES TAB: split stakes are named', () => {
        assert.ok(has('split.matches', 'F $7 / B $7 / O $11'),
            'the Matches tab does not name the three stakes. Before this wave it printed '
            + '"$0/match" for this $25 match, because the Step-6 shape leaves the legacy '
            + 'stake at 0.\n  lines: ' + dump('split.matches'));
        assert.ok(!has('split.matches', '$0/match'),
            'the Matches tab still prints $0/match: ' + dump('split.matches'));
    });

    test('HOLE VIEW: split stakes are named, exactly as before', () => {
        assert.ok(has('split.hole', 'F $7 / B $7 / O $11'),
            'Hole View lost its stake label: ' + dump('split.hole'));
    });

    test('the two pages state the SAME amounts', () => {
        // The guard that would have caught this class of bug in the first place.
        const pick = (k) => (lines(k).find((l) => /F \$/.test(l)) || '').replace(/^.*?(F \$)/, '$1');
        assert.equal(pick('split.matches'), pick('split.hole'),
            'the Matches tab and Hole View disagree about what the same bet costs.\n  matches: '
            + dump('split.matches') + '\n  hole: ' + dump('split.hole'));
    });
});

describe('THE AUTO-PRESS AMOUNT IS SHOWN WHEN IT IS SET', () => {

    test('MATCHES TAB: the press rule and its price', () => {
        assert.ok(has('splitPressed.matches', 'Auto @ 2 Down ($25)'),
            'the Matches tab does not price the auto press: ' + dump('splitPressed.matches'));
    });

    test('HOLE VIEW: the press rule and its price', () => {
        // Hole View named the RULE before this wave and never the amount.
        assert.ok(has('splitPressed.hole', 'Auto @ 2 Down ($25)'),
            'Hole View does not price the auto press: ' + dump('splitPressed.hole'));
    });

    test('no price is invented when autoPressStake is unset', () => {
        // The split fixture has pressRule 'none' and no autoPressStake. A builder
        // that printed "($0)" here would be stating a bet nobody made.
        assert.ok(!/\(\$/.test(lines('split.matches').join(' ')),
            'a press price appeared with no press configured: ' + dump('split.matches'));
        assert.ok(!/\(\$/.test(lines('split.hole').join(' ')),
            'a press price appeared with no press configured: ' + dump('split.hole'));
    });
});

describe('A LEGACY SINGLE-STAKE NASSAU NEVER READS $0', () => {

    // money-engine.js baseStakeFor() falls a blank segment back to the single
    // `stake`, so that is what the golfer is charged on all three bets. Hole View
    // printed "F $0 / B $0 / O $0" for this $20 match before this wave.
    test('HOLE VIEW: the single stake fills all three', () => {
        assert.ok(has('single.hole', 'F $20 / B $20 / O $20'),
            'Hole View does not state the legacy stake on all three bets: ' + dump('single.hole'));
        assert.ok(!has('single.hole', '$0'),
            'Hole View still prints $0 for a $20 Nassau: ' + dump('single.hole'));
    });

    test('MATCHES TAB: the same', () => {
        assert.ok(has('single.matches', 'F $20 / B $20 / O $20'),
            'the Matches tab does not state the legacy stake on all three bets: '
            + dump('single.matches'));
    });
});

describe('EVERY NON-NASSAU LABEL IS BYTE-IDENTICAL TO BEFORE THE WAVE', () => {

    // CAPTURED FROM THE UNCHANGED PAGES, before anything was edited. These are
    // literals rather than a computed expectation because "unchanged" can only be
    // measured against what the page actually printed on the day.
    test('MATCHES TAB: Match Play is untouched', () => {
        assert.ok(has('matchPlay.matches', 'Match Play • NET • $20/match'),
            'the Match Play label changed. Only Nassau was in scope.\n  lines: '
            + dump('matchPlay.matches'));
    });

    test('HOLE VIEW: Match Play is untouched', () => {
        assert.ok(has('matchPlay.hole', 'Match Play · Dale v Ken · thru 18'),
            'the Hole View Match Play line changed: ' + dump('matchPlay.hole'));
    });

    test('a Match Play match is never given Nassau segments', () => {
        assert.ok(!/F \$/.test(lines('matchPlay.matches').join(' ')),
            'Match Play got a Nassau stake label: ' + dump('matchPlay.matches'));
        assert.ok(!/F \$/.test(lines('matchPlay.hole').join(' ')),
            'Match Play got a Nassau stake label: ' + dump('matchPlay.hole'));
    });
});
