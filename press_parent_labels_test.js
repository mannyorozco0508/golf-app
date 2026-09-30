// ============================================================================
// A BET THAT GOES THE DISTANCE IS "1 UP", AND A NASSAU PRESS BELONGS TO A BET
// (Wave 30, STRICT lane - two engine files, both approved per-file)
//
// TWO COPY DEFECTS, both found while building Wave 29 and both logged rather than
// fixed there:
//
//   1. match-engine.js printed `${winner} ${Math.abs(status)}&${hLeft}` for every
//      closed segment. "3&2" is three up with two to play - correct, and standard.
//      With no holes left the same template printed "1&0" and "2&0", which no golfer
//      says. A match that goes the distance is won "1 up". It reached every surface:
//      the Bets card, the Receipt, the PDF, Final Results, the scorecard's own match
//      pill and the MAIN game's "FINAL: ..." line.
//
//   2. match-engine.js numbers presses PER BASE, so a Nassau's Total press and its
//      Back 9 press are BOTH "Press 1". On a card that lists all three bases that is
//      two rows with one name, and it cannot be re-derived from the hole range: the
//      Total's press (H11-18) and a Back 9 press (H11-18) are identical in startHole
//      and endHole. The engine knows which base spawned it; the receipt never carried
//      it. settlement-engine.js now does - baseId, display only - and
//      side-match-lines.js turns it into "Back 9 press (H18)" and orders each press
//      under its own bet.
//
// A ONE-BET MATCH KEEPS ITS NUMBERS. Match Play has a single base and its presses
// CHAIN off each other - base pressed at H5, that press at H11, that one at H15 - so
// "Press 1 (H5) / Press 2 (H11) / Press 3 (H15)" is the true description, and
// "Overall press" three times would be worse than what it replaced.
//
// THE MONEY DOES NOT MOVE, and that is asserted rather than asserted-to: every
// segment amount, every toSideA and every match net on all four Wave 29 fixtures is
// pinned below by value, and match_engine_parity_test.js still holds the 13-fixture
// corpus the three old engine copies agreed on. One frozen STRING in
// helpers/match-engine-golden.json change ("Q 2&0" -> "Q 2 up" and two more); not one
// of its 70 numbers does.
//
// THE RED BASELINE, measured against the FINAL file per CLAUDE.md's count rule, with
// match-engine.js, settlement-engine.js, side-match-lines.js, settlement.html and
// helpers/match-engine-golden.json swapped back to main 4e35441 by sha, all 12 tests:
//
//     3 PASS / 9 FAIL
//
// THE THREE THAT PASS WITHOUT THE WAVE, and every one of them is a control on the
// change rather than evidence of it:
//   the "&N" form survives where it is CORRECT - a bet that closes early has always
//     read "3&2" and must still;
//   the money pin - the whole claim of this wave is that not one amount moves, so it
//     had better be green before as well as after;
//   a stroke bet is untouched - no baseId, no reordering, its own labels.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const F = require('./helpers/side-match-cards.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ENG = ['handicap.js', 'match-engine.js', 'action-model.js', 'money-engine.js', 'settlement-engine.js'];
const E = loadJsFile('settlement-engine.js', ['money-engine.js']);
let B = null;
try { B = loadJsFile('side-match-lines.js', ENG); } catch (e) { B = null; }
const needB = () => { assert.ok(B, 'side-match-lines.js must load'); return B; };
const here = a => Array.from(a);
const receiptFor = (d, id) => E.buildSideMatchReceipts(d, d.courseData, d.scores).find(r => r.matchId === id);
const lines = (d, id, complete) => needB().sideMatchBetLines(receiptFor(d, id), { complete: complete !== false });

describe('the distance is "1 up", and a press belongs to a bet', () => {

    test('a bet that goes all eighteen reads "N up", not "N&0"', () => {
        const r = receiptFor(F.matchRound(), 'mm');
        // Both presses ran to the last hole; the base closed at 16 with two to play.
        assert.deepEqual(here(r.segments).map(s => s.result),
            ['Manny 3&2', 'Marty 1 up', 'Manny 3&2', 'Marty 1 up']);
        assert.ok(!/&0/.test(JSON.stringify(r)), 'not one "&0" survives anywhere in the receipt');
    });

    test('CONTROL the "&N" form survives where it is CORRECT - a bet that closes early', () => {
        const r = receiptFor(F.matchRound(), 'mm');
        assert.equal(r.segments[0].result, 'Manny 3&2',
            'three up with two to play is the standard form and must not have changed');
        assert.match(read('match-engine.js'), /\$\{Math\.abs\(m\.status\)\}&\$\{hLeft\}/,
            'the & template is still there for every segment that closes early');
    });

    test('the MAIN game gets it too, through the one engine', () => {
        const M = loadJsFile('money-engine.js', ['handicap.js', 'match-engine.js', 'action-model.js']);
        const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
        const p = [{ id: 1, name: 'Ann', hcp: '0', team: 'Team 1' }, { id: 2, name: 'Ben', hcp: '0', team: 'Team 2' }];
        const sc = {};
        // Ann wins the last hole only: 1 up, with nothing left to play.
        cd.forEach(h => { sc['p1_h' + h.hole] = h.hole === 18 ? 3 : 4; sc['p2_h' + h.hole] = 4; });
        const calc = M.calculateMatchEngine(p, cd, sc, 'gross', 'match', 'none', 20, 0, []);
        const closed = calc.activeMatches.find(m => m.closed);
        assert.ok(closed, 'a 1-up win on the 18th closes the match');
        assert.equal(closed.finalResult, 'Ann 1 up');
        // index.html prints this string straight into "FINAL: ..." for the round's own
        // match, which is why one engine line reaches every surface at once.
        assert.match(read('index.html'), /FINAL: \$\{escapeHtml\(t18\.finalResult\)\}/);
    });

    test('the receipt carries baseId and pressNum, and nothing computes with them', () => {
        const r = receiptFor(F.nassauRound(), 'mr');
        assert.deepEqual(here(r.segments).map(s => s.baseId), ['F9', 'B9', '18', '18', 'B9']);
        assert.deepEqual(here(r.segments).filter(s => s.pressNum > 0).map(s => s.baseId), ['18', 'B9'],
            'the H11 press is the TOTAL bet; the H18 press is the BACK 9');
        // DISPLAY ONLY: no money code reads either field.
        ['money-engine.js', 'match-engine.js', 'pool-engine.js', 'action-model.js'].forEach(f =>
            assert.ok(!/receipt[^\n]*baseId|seg\.baseId/.test(read(f)), f + ' must not read it'));
    });

    test('a NASSAU press is named by the bet it came off', () => {
        const ls = lines(F.nassauRound(), 'mr');
        assert.deepEqual(here(ls).map(l => l.label),
            ['Front 9', 'Back 9', 'Back 9 press (H18)', 'Total', 'Total press (H11)']);
    });

    test('and it sits UNDER that bet, not in the order it was struck', () => {
        const ls = lines(F.nassauRound(), 'mr');
        // Engine order is F9, B9, Total, press(H11), press(H18) - which put a Back 9
        // press below the Total it has nothing to do with.
        assert.equal(here(ls).findIndex(l => l.label === 'Back 9 press (H18)'),
            here(ls).findIndex(l => l.label === 'Back 9') + 1);
        assert.equal(here(ls).findIndex(l => l.label === 'Total press (H11)'),
            here(ls).findIndex(l => l.label === 'Total') + 1);
    });

    test('a ONE-BET match keeps its press numbers, and gains the start hole', () => {
        assert.deepEqual(here(lines(F.matchRound(), 'mm')).map(l => l.label),
            ['Overall Match', 'Press 1 (H5)', 'Press 2 (H11)', 'Press 3 (H15)']);
    });

    test('PIN the money: not one amount moved on any of the four fixtures', () => {
        const pin = (d, id, money, toA, net) => {
            const r = receiptFor(d, id);
            assert.deepEqual(here(r.segments).map(s => s.money), money, id + ' amounts');
            assert.deepEqual(here(r.segments).map(s => s.toSideA), toA, id + ' sides');
            assert.equal(r.net, net, id + ' net');
        };
        pin(F.matchRound(), 'mm', [20, 20, 20, 20], [true, false, true, false], 0);
        pin(F.nassauRound(), 'mr', [20, 20, 20, 20, 20], [false, false, false, false, false], -100);
        pin(F.netRound(), 'netm', [0], [false], 0);
        pin(F.netRound(), 'grossm', [20], [true], 20);
        const mc = F.mixedCardsRound();
        pin(mc, 'rd', [30], [true], 30);
        pin(mc, 'ef', [0], [false], 0);
    });

    test('RECEIPT: the rows are the builder rows - labelled and ordered', () => {
        const { loadHtmlInlineScript } = require('./helpers/load-script.js');
        const vm = require('vm');
        const sb = loadHtmlInlineScript('settlement.html', [], { search: '?game=' + F.CODE, only: false });
        const h = (sb.__dbHandlers || []).find(x => x.event === 'value' && x.path === 'events/' + F.CODE);
        assert.ok(h, 'settlement.html must register its round listener');
        h.cb({ val: () => F.nassauRound(), exists: () => true });
        const c = String(sb.document.getElementById('settle-content').innerHTML || '');
        ['Front 9', 'Back 9', 'Back 9 press (H18)', 'Total', 'Total press (H11)'].forEach(l =>
            assert.ok(c.includes('>' + l + '<'), 'the Receipt must print "' + l + '"'));
        assert.ok(c.indexOf('Back 9 press (H18)') < c.indexOf('>Total<'),
            'the Back 9 press belongs above Total, under its own bet');
        assert.ok(!/1&0|2&0/.test(c), 'and no "&0" reaches the document people settle from');
    });

    test('BETS TAB: the same labels, from the same builder', () => {
        const { loadHtmlInlineScript } = require('./helpers/load-script.js');
        const sb = loadHtmlInlineScript('skins.html', [], { search: '?game=' + F.CODE, only: false });
        const h = (sb.__dbHandlers || []).find(x => x.event === 'value' && x.path === 'events/' + F.CODE);
        h.cb({ val: () => F.nassauRound(), exists: () => true });
        const m = String(sb.document.getElementById('bets-matches').innerHTML || '');
        assert.match(m, /Back 9 press \(H18\)/);
        assert.match(m, /Total press \(H11\)/);
    });

    test('a stroke bet is untouched: no baseId, no reordering, its own labels', () => {
        const data = {
            players: F.netRound().players, courseData: F.netRound().courseData, scores: F.netRound().scores,
            sideMatches: { s: { format: 'stroke', scoring: 'net', holeStake: 5, overallStake: 50,
                overallMode: 'stroke', segment: 'full', tieRule: 'carry',
                teamAIds: [String(F.netRound().players[0].id)], teamBIds: [String(F.netRound().players[1].id)] } }
        };
        const r = receiptFor(data, 's');
        assert.ok(r.segments.every(s => s.baseId === undefined), 'a stroke segment has no base');
        assert.deepEqual(here(needB().sideMatchBetLines(r, { complete: true })).map(l => l.label),
            here(r.segments).map(s => s.label), 'same labels, same order');
    });

    test('the golden corpus changed by exactly one STRING and no number', () => {
        const g = JSON.parse(read('helpers/match-engine-golden.json'));
        const s = JSON.stringify(g);
        assert.ok(!/\d+&0/.test(s), 'no "N&0" survives in the frozen corpus');
        assert.match(s, /Q 2 up/, 'the affected fixtures read "2 up" now - three strings, no numbers');
        assert.match(s, /&2|&3|&4|&5|&6|&7|&8/, 'and every early close still uses the & form');
    });
});
