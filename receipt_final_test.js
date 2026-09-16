// ============================================================================
// THE RECEIPT READS THE SAME PREDICATE AS THE TRIP (2026-09-15, Option A)
//
// THE GAP. settlement.html decided "is the round over" with two questions of
// its own - every ROSTER golfer's card complete, and pool-engine's `settled` -
// and never read scoresVerified. So a round with a picked-up ball or a golfer
// who left after nine stayed LIVE RESULTS forever: no Final receipt without
// typing scores that were not made. The trip (v148) called the same round
// finished once the organizer verified it. Now both read
// settlement-engine.js computeRoundSettlement (untouched by this wave).
//
// WHAT ELSE MOVED, all in settlement.html:
//   - the live head names who is still out (up to six, then "+ N more", the
//     trip's plural rule), and a KP-only hold gets its own head instead of
//     "The round is still in play" over a field whose cards are all in;
//   - the six per-game headings drop the word Final while the round is not
//     final ("Skins Settlement — Not Final (No Carry)") and read exactly as
//     they always did when it is;
//   - the dead "⏳ Results — Not Final" branch is gone (it re-asked a question
//     the gate had already passed, with the same inputs; it could never render).
//
// MONEY STAYS OUT OF THE LIVE BRANCH - Manny's decision, and live_results_test
// .js's design. This wave names the hold; it does not price it.
//
// THE FINISHED CASE DID NOT MOVE - proved the v136-v148 way:
// receipt_final_prev.fixture.json is the tag-stripped text of all four mounts
// captured at 8a02234 from HEAD's settlement.html on the two finished weekly
// rounds (helpers/trip-weekly-rounds.js), and Caledonia again with
// scoresVerified set. ONE LINE IS NORMALISED: buildReceiptHeader prints
// TODAY'S date (new Date(), settlement.html :618), not the round's date, so a
// literal capture would go red at midnight. The date line is replaced by
// <today> on both sides - the header still renders (asserted), it is just not
// compared by value. Nothing else is normalised.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');
const { linkedRounds } = require('./helpers/trip-weekly-rounds.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha8 = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, f))).digest('hex').slice(0, 8);
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');
const DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js'];

// strip0: the capture's stripper. TODAY: the one normalised line (see header).
const strip0 = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const TODAY = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const norm = t => t.split('|' + TODAY + '|').join('|<today>|');
// strip: for the rows below - whitespace beside a bar dropped so text can be matched across tags.
const strip = h => strip0(h).replace(/ ?\| ?/g, '|').replace(/\|+/g, '|');

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------
const CD = makeCourseData(18);
const P4 = makePlayers(['Ann A', 'Ben B', 'Cal C', 'Dee D'], [0, 0, 0, 0], 101);
// A 2v2 $25 gross match, Ann birdies every third hole. thruBy = holes scored
// per golfer; blank deletes one hole; verified writes what Finish Round writes.
function twoVtwo({ thruBy = [18, 18, 18, 18], verified = false, blank = null, extra = {} } = {}) {
    const scores = {};
    P4.forEach((p, i) => CD.forEach(h => { if (h.hole <= thruBy[i]) scores['p' + p.id + '_h' + h.hole] = h.par + ((i === 0 && h.hole % 3 === 0) ? -1 : 0); }));
    if (blank) delete scores[blank];
    const d = { eventName: 'Measure', players: P4, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        sideMatches: { m: { format: 'match', scoring: 'gross', stake: 25, startHole: 1, createdAt: 1, teamAIds: ['101', '103'], teamBIds: ['102', '104'] } } };
    if (verified) d.scoresVerified = { verified: true, verifiedAt: 1, verifiedBy: 'round' };
    return Object.assign(d, extra);
}
// The 12-golfer $480 Weekly Game from the gate suites; confirmed:false leaves $100 hanging.
const NAMES12 = ['Marty', 'Scott', 'Carp', 'Randy', 'Manny', 'Matt B', 'Lance', 'Kopp', 'Marcus', 'Rocco', 'Matt H', 'Jeremy'];
function poolRound({ confirmed = true, thru = 18, verified = false } = {}) {
    const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const ps = NAMES12.map((n, i) => ({ id: 101 + i, name: n, hcp: '9', playingForMoney: true }));
    const sc = {};
    ps.forEach((p, pi) => cd.forEach((h, hi) => { if (h.hole <= thru) sc['p' + p.id + '_h' + h.hole] = 4 + ((pi + hi) % 3) - 1; }));
    const d = { eventName: 'KP', players: ps, courseData: cd, scores: sc, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        kpWinners: confirmed ? { h3: '101', h7: '105', h12: '109', h16: '102' } : {},
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7, 12, 16] }, net: { amount: 70, places: [57.142857, 42.857143] }, skins: { mode: 'remainder', scoring: 'net', carryOver: false } } };
    if (confirmed) d.kpConfirmed = { confirmed: true };
    if (verified) d.scoresVerified = { verified: true, verifiedAt: 1, verifiedBy: 'organizer' };
    return d;
}

// The page's own load sequence (settlement.html :488-492), on a stubbed round.
function receipt(d) {
    const sb = loadHtmlInlineScript('settlement.html', DEPS);
    vm.runInContext(`currentMode='ABCD'; currentData=${JSON.stringify(d)};
        renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);
        renderCombinedSummary(currentData, currentData.courseData, currentData.scores);
        renderSettlement(currentData); renderReceiptScorecard();`, sb);
    const raw = id => sb.document.getElementById(id).innerHTML;
    return {
        sb,
        summary: () => strip(raw('combined-settlement-summary')),
        settle: () => strip(raw('settle-content')),
        mounts0: () => ({ pool: norm(strip0(raw('money-pool-section'))), summary: norm(strip0(raw('combined-settlement-summary'))), settle: norm(strip0(raw('settle-content'))), scorecard: norm(strip0(raw('receipt-scorecard'))) }),
        isFinal: () => /🏁 Final Results/.test(strip(raw('combined-settlement-summary'))),
    };
}
const HEAD_NOTE = 'Final money appears once every card is in, or once the scores are confirmed in Finish Round.';

// ---------------------------------------------------------------------------
// THE FINISHED CASE DID NOT MOVE
// ---------------------------------------------------------------------------
// SEND RESULTS (2026-09-16): the export button left the summary for #receipt-actions
// on the title row. The capture below still holds it as one cell,
// "|📄 Print / Save Receipt|". That ONE cell is removed from the OLD text before
// comparing - the fixture file is untouched, its sha still pins the capture, and a
// second difference anywhere is still red. sendMove asserts the cell was there.
const sendMove = t => { const n = t.split('|📄 Print / Save Receipt|').length - 1; if (n !== 1) throw new Error('sendMove: expected the old button cell once, found ' + n); return t.replace('|📄 Print / Save Receipt|', '|'); };
const sendMoved = m => Object.assign({}, m, { summary: sendMove(m.summary) });

describe('THE BASELINE: finished receipts read exactly as they did at 8a02234', () => {
    const prev = JSON.parse(read('receipt_final_prev.fixture.json'));
    const rounds = linkedRounds();
    test('the fixture is the one captured at 8a02234, and it carries the normalised date token', () => {
        assert.equal(sha8('receipt_final_prev.fixture.json'), 'daa9193f');
        assert.equal(prev.capturedAt, '8a02234');
        assert.equal((JSON.stringify(prev).match(/<today>/g) || []).length, 3, 'one header per captured receipt');
        assert.ok(!/September 15, 2026/.test(JSON.stringify(prev)), 'no literal capture date survives');
    });
    test('the header still renders a date today (the token replaces a real line, not a missing one)', () => {
        const r = receipt(rounds[0].data);
        assert.match(strip0(r.sb.document.getElementById('combined-settlement-summary').innerHTML), new RegExp('\\|' + TODAY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\|'));
    });
    test('Caledonia (finished, KPs confirmed): all four mounts identical', () => {
        assert.deepEqual(receipt(rounds[0].data).mounts0(), sendMoved(prev.caledonia));
    });
    test('True Blue (finished): all four mounts identical', () => {
        assert.deepEqual(receipt(rounds[1].data).mounts0(), sendMoved(prev.trueBlue));
    });
    test('Caledonia with scoresVerified set: identical to the unverified capture - verification adds no line to a finished receipt', () => {
        const d = Object.assign({}, rounds[0].data, { scoresVerified: { verified: true, verifiedAt: 1, verifiedBy: 'organizer' } });
        assert.deepEqual(receipt(d).mounts0(), sendMoved(prev.caledoniaVerified));
        assert.deepEqual(prev.caledoniaVerified, prev.caledonia);
    });
});

// ---------------------------------------------------------------------------
// THE LIVE HEAD NAMES WHO IS OUT
// ---------------------------------------------------------------------------
describe('A ROUND THRU 9: named, standings shown, no money, not called final', () => {
    const r = receipt(twoVtwo({ thruBy: [18, 18, 18, 9] }));
    test('the head', () => {
        assert.match(r.summary(), /^\|🏆 LIVE RESULTS — THRU 9\|Still in play — thru 9, 1 golfer still has holes left: Dee D \(9 of 18\)\. Final money appears once every card is in, or once the scores are confirmed in Finish Round\.\|OVERALL — NET\|/);
        assert.equal(r.isFinal(), false);
    });
    test('no money in the live branch: no Payouts, no Who Pays Who, no Print button, no NET figure', () => {
        const s = r.summary();
        ['Player Payouts', 'Who Pays Who', 'Print / Save', 'TOTAL PAYOUT'].forEach(t => assert.ok(!s.includes(t), 'live branch must not carry ' + t));
        assert.ok(!/\$\d/.test(s), 'not one dollar figure in the live branch: ' + s);
        assert.match(s, /\|1\|Ann A\|-6\|/, 'the standings are there (positive control)');
    });
    test('the per-game card under it does not say Final either: "Ledger — Not Final"', () => {
        const stroke = receipt(twoVtwo({ thruBy: [18, 18, 18, 9], extra: { gameFormat: 'skins', sideMatches: null } }));
        assert.match(stroke.settle(), /^\|🥩 Skins Settlement — Not Final \(No Carry\)\|/);
    });
    test('twelve golfers out: six named, then "+ 6 more", plural verbs', () => {
        const s = receipt(poolRound({ thru: 9 })).summary();
        assert.match(s, /Still in play — thru 9, 12 golfers still have holes left: Marty \(9 of 18\), Scott \(9 of 18\), Carp \(9 of 18\), Randy \(9 of 18\), Manny \(9 of 18\), Matt B \(9 of 18\) \+ 6 more\. Final money appears once every card is in, or once the scores are confirmed in Finish Round\./);
    });
});

describe('A GOLFER WHO PICKED UP (one blank hole), unverified: same - named with 17 of 18', () => {
    const r = receipt(twoVtwo({ blank: 'p104_h12' }));
    test('the head names the blank, the receipt is not final', () => {
        assert.match(r.summary(), /^\|🏆 LIVE RESULTS — THRU 17\|Still in play — thru 17, 1 golfer still has holes left: Dee D \(17 of 18\)\. Final money/);
        assert.equal(r.isFinal(), false);
        assert.ok(!r.summary().includes('Player Payouts'));
    });
});

describe('THE SAME ROUND VERIFIED: a finished receipt, for the first time', () => {
    const full = receipt(twoVtwo());
    const vBlank = receipt(twoVtwo({ blank: 'p104_h12', verified: true }));
    const v9 = receipt(twoVtwo({ thruBy: [18, 18, 18, 9], verified: true }));
    test('verified with a blank hole: Final Results, Payouts, Who Pays Who, the Print button', () => {
        assert.equal(vBlank.isFinal(), true);
        const s = vBlank.summary();
        ['🏁 Final Results', '💰 Player Payouts', '🤝 Who Pays Who'].forEach(t => assert.ok(s.includes(t), 'missing ' + t));
        // The button is on the title row now (2026-09-16), not in the summary.
        assert.ok(!s.includes('Print / Save'), 'no button inside the summary');
        assert.match(vBlank.sb.document.getElementById('receipt-actions').innerHTML.replace(/\\uD83D\\uDCE4/g, '📤'), /📤 Send<\/button>/);
        assert.ok(!/Still in play|LIVE RESULTS/.test(s));
    });
    test('the three money mounts are byte-identical to the fully scored round; only the scorecard shows the blank as a dash', () => {
        const a = full.mounts0(), b = vBlank.mounts0();
        assert.equal(b.pool, a.pool); assert.equal(b.summary, a.summary); assert.equal(b.settle, a.settle);
        assert.notEqual(b.scorecard, a.scorecard, 'the card is honest about the blank');
        assert.match(b.scorecard, /\|Dee D\|4\|4\|3\|5\|4\|4\|3\|5\|4\|36\|4\|4\|–\|5\|4\|4\|3\|5\|4\|33\|69\|/);
    });
    test('verified after leaving at nine: final too, receipt identical on the money mounts', () => {
        assert.equal(v9.isFinal(), true);
        const a = full.mounts0(), b = v9.mounts0();
        assert.equal(b.summary, a.summary); assert.equal(b.settle, a.settle);
        assert.match(b.scorecard, /\|Dee D\|4\|4\|3\|5\|4\|4\|3\|5\|4\|36\|–\|–\|–\|–\|–\|–\|–\|–\|–\|–\|36\|/);
    });
    test('the per-game heading reads exactly as today when final: "Final Skins Settlement (No Carry)"', () => {
        const s = receipt(twoVtwo({ blank: 'p104_h12', verified: true, extra: { gameFormat: 'skins', sideMatches: null } }));
        assert.match(s.settle(), /^\|🥩 Final Skins Settlement \(No Carry\)\|/);
    });
});

describe('A ROSTER NAME THAT NEVER TEED OFF is not waited for', () => {
    test('three cards complete, one name with no score: final', () => {
        const r = receipt(twoVtwo({ thruBy: [18, 18, 18, 0] }));
        assert.equal(r.isFinal(), true);
        assert.ok(!/Still in play/.test(r.summary()));
    });
});

describe('KP UNCONFIRMED, every card in: its own head, and it stops blaming the golfers', () => {
    const r = receipt(poolRound({ confirmed: false }));
    test('RESULTS — NOT FINAL, the KP sentence, no money summary, the KP line as today', () => {
        const s = r.summary();
        assert.match(s, /^\|🏆 RESULTS — NOT FINAL\|Every card is in\. KP results are still unconfirmed — final money appears once they are confirmed or cancelled\.\|OVERALL — NET\|/);
        assert.ok(!/still in play/i.test(s), 'nobody has holes left');
        assert.ok(!/Player Payouts|Who Pays Who|Print \/ Save/.test(s));
        assert.match(s, /\|📍 KP\|4 KPs today · none confirmed yet\|/);
        assert.equal(r.isFinal(), false);
    });
    test('verification does NOT settle KP money: verified + KP unconfirmed is still not final', () => {
        const v = receipt(poolRound({ confirmed: false, verified: true }));
        assert.equal(v.isFinal(), false);
        assert.match(v.summary(), /^\|🏆 RESULTS — NOT FINAL\|/);
    });
    test('KP confirmed: Final Results, as today', () => {
        assert.equal(receipt(poolRound()).isFinal(), true);
    });
});

describe('BOTH AT ONCE: golfers out AND KPs unconfirmed', () => {
    test('the in-play head, the KP clause, and the combined closing sentence', () => {
        const s = receipt(poolRound({ confirmed: false, thru: 9 })).summary();
        assert.match(s, /^\|🏆 LIVE RESULTS — THRU 9\|Still in play — thru 9, 12 golfers still have holes left: Marty \(9 of 18\), Scott \(9 of 18\), Carp \(9 of 18\), Randy \(9 of 18\), Manny \(9 of 18\), Matt B \(9 of 18\) \+ 6 more\. KP results are still unconfirmed\. Final money appears once every card is in and the KPs are confirmed\.\|/);
    });
});

describe('NOT STARTED: today\'s head, unchanged', () => {
    test('no scores: LIVE RESULTS with the generic sentence, nobody named', () => {
        const s = receipt(twoVtwo({ thruBy: [0, 0, 0, 0] })).summary();
        assert.match(s, /^\|🏆 LIVE RESULTS\|The round is still in play\. Final money appears once every card is in\.\|/);
    });
});

// ---------------------------------------------------------------------------
// THE SEAMS (source, comments stripped)
// ---------------------------------------------------------------------------
describe('THE SEAMS', () => {
    const page = stripComments(read('settlement.html'));
    test('the gate and every heading read the engine\'s predicate; the page\'s own two questions are gone', () => {
        assert.match(page, /function receiptSettlement\(data, courseData, savedScores\) \{/);
        assert.match(page, /return computeRoundSettlement\(data, courseData \|\| \[\], savedScores \|\| \{\}\);/);
        assert.match(page, /const settlement = receiptSettlement\(data, courseData, savedScores\);\s*if \(!settlement\.settled\) \{/);
        assert.match(page, /const isFinal = receiptSettlement\(data, courseData, savedScores\)\.settled;/);
        assert.ok(!/function roundScoresComplete|function moneyIsSettled/.test(page), 'the two local predicates are gone');
        assert.equal((page.match(/settleHeading\(/g) || []).length, 11, 'one definition + ten heading sites');
        assert.equal((page.match(/settle-header">[^<]*Final /g) || []).length, 1, 'the only literal "Final " heading left is 🏁 Final Results, behind the gate');
    });
    test('the dead branch is gone, and its epitaph names why it could never render', () => {
        assert.ok(!/Results — Not Final/.test(page), 'no such string in code');
        assert.match(read('settlement.html'), /it could\n\s*\/\/ never be chosen/);
        assert.ok(!/\.settled === false/.test(page), 'the page no longer asks pool-engine itself - the engine does');
    });
    test('money stays out of the live branch (no ledger builders, no transactions)', () => {
        const at = page.indexOf('function buildLiveResultsHtml');
        const fn = page.slice(at, page.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 2000, 'the live builder was sliced: ' + fn.length);
        assert.match(fn, /Still in play/);
        ['computeCombinedNetTotals(', 'simplifyDebts(', 'buildPlayerLedgerHtml(', 'TOTAL PAYOUT', 'Who Pays Who'].forEach(t => assert.ok(!fn.includes(t), 'live branch must not carry ' + t));
    });
    test('settlement-engine.js is untouched by this wave (sha 42923121, v148)', () => {
        assert.equal(sha8('settlement-engine.js'), '42923121');
    });
    test('HANDOFF no longer says the Receipt decides Final from computeMoneyPool alone', () => {
        const h = read('HANDOFF.md');
        assert.ok(!/still decides "Final" from `computeMoneyPool\(\)\.settled` alone/.test(h), 'the false sentence is gone');
        assert.match(h, /receiptSettlement/);
    });
});
