// ============================================================================
// THE MATCHES TAB AND THE SCORECARD CANNOT DISAGREE (2026-10-07)
//
// FOUND SETTING UP SCREENSHOTS: on a FINISHED round the Matches tab showed
// "All square - Thru 18" for every match. Manny had won 7&6.
//
// MEASURED ON THE REAL ROUND (NA4EZB, Myrtle Day 1, 72 scores, three side bets
// - saved here as matches_tab_finished.fixture.json so this needs no network):
//
//   the scorecard card   "Manny v Reese - FINAL - Manny +$120 - won 8 of 9
//                         bets ... TOTAL Manny 7&6 - FINAL - Manny +$20"
//   the Matches tab      "ALL SQUARE", tone even, thru 18   <- all three rows
//
// THE MONEY WAS NEVER WRONG. Measured against main 04f5fd1, the three rows
// carried $120 / $60 / $60 - the receipt's own figures, fixed in v258. Only the
// WORDS and the TONE lied, which is the worse half: a row reading "ALL SQUARE"
// beside $120 reads as a bug in the money.
//
// WHY. buildSideActionRows asked the live bet strip for a headline:
//     const live = strip.chips.find(c => !c.closed) || strip.chips[0];
//     status = live.statusText;
// `closed` is "the lead exceeds the holes left", which at the 18th is |0| > 0 -
// false. So on a match that went the distance the chip picked is the level one,
// and its "all square" is reported as the whole match's state. The scorecard
// does not do this: side-match-lines.js reads the RECEIPT - the one
// settlement-engine already priced - and prints seg.result and seg.money.
//
// THE RULE: one source. When the bet is over, the row says what the receipt
// says, in the same words as the card, with the same money. Nothing is
// re-derived here and no money is summed anywhere new.
//
// BASELINE, against main 04f5fd1 (bet-strip.js sha 783d2659e556c95a) with this
// finished file: 6 tests, 3 pass / 3 fail. The three that pass there are the
// card's own positive control, the money (right all along, above), and the
// mid-round control - correctly inert against main, which does not mark a
// running match final either.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile } = require('./helpers/load-script.js');

const ROUND = JSON.parse(fs.readFileSync(path.join(__dirname, 'matches_tab_finished.fixture.json'), 'utf8'));
const DEPS = ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
              'settlement-engine.js', 'side-match-lines.js'];

function rowsFor(round) {
    const sb = loadJsFile('bet-strip.js', DEPS);
    return JSON.parse(vm.runInContext('JSON.stringify(buildSideActionRows('
        + JSON.stringify(round) + ',' + JSON.stringify(round.courseData) + ','
        + JSON.stringify(round.scores) + ',' + JSON.stringify(round.players) + '))', sb));
}
function rows() { return rowsFor(ROUND); }
// THE SAME ROUND, STILL BEING PLAYED: every score past the 7th taken away.
function midRound() {
    const mid = JSON.parse(JSON.stringify(ROUND));
    mid.scores = {};
    Object.keys(ROUND.scores).forEach((k) => {
        if (Number(String(k).split('_h')[1]) <= 7) mid.scores[k] = ROUND.scores[k];
    });
    return mid;
}
// THE CARD'S OWN TEXT, from the builder the scorecard and the leaderboard share.
function cardText() {
    const sb = loadJsFile('side-match-lines.js',
        ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
         'settlement-engine.js', 'bet-strip.js']);
    const ids = ROUND.players.map(p => String(p.id));
    const html = vm.runInContext('buildLiveMatchCardHtml(' + JSON.stringify(ROUND) + ','
        + JSON.stringify(ROUND.courseData) + ',' + JSON.stringify(ROUND.scores) + ','
        + JSON.stringify(ids) + ', {})', sb);
    return String(html).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

describe('1. A FINISHED ROUND IS FINISHED ON EVERY SCREEN', () => {

    test('the round really is finished and the card really does show a result', () => {
        // POSITIVE CONTROL FIRST: if the fixture were mid-round or the card drew
        // nothing, every assertion below would be true of a blank screen.
        const txt = cardText();
        assert.match(txt, /FINAL/, 'the card shows no FINAL, so this fixture is not a finished round');
        assert.match(txt, /7&6/, 'the card no longer shows the 7&6 Manny won: ' + txt.slice(0, 200));
        assert.equal(rows().length, 3, 'three side bets expected on this round');
        rows().forEach(r => assert.equal(r.thru, 18, 'every bet should be thru 18'));
    });

    test('NOT ONE ROW SAYS "ALL SQUARE" on a decided match', () => {
        const bad = rows().filter(r => /all square/i.test(String(r.status || '') + ' ' + String(r.sentence || '')));
        assert.deepEqual(bad.map(r => r.label + ': ' + r.status), [],
            'the Matches tab calls a decided match all square');
    });

    test('and every row reads FINAL, so the tab and the card agree', () => {
        rows().forEach((r) => {
            assert.equal(r.tone, 'final',
                r.label + ' is tone "' + r.tone + '" on a round that is over - the tab prints the '
                + 'progress instead of the result');
        });
    });

    test('THE WORDS ARE THE CARD’S WORDS, not a second opinion', () => {
        const txt = cardText();
        rows().forEach((r) => {
            const s = String(r.status || '');
            assert.ok(s.length > 0, r.label + ' has no status at all');
            assert.ok(txt.indexOf(s) !== -1,
                r.label + ': the tab says "' + s + '" and the card does not contain that anywhere. '
                + 'One of them is making it up.');
        });
    });

    test('and the money is the receipt’s money, not zero', () => {
        // A POSITIVE CONTROL, NOT A CAUGHT DEFECT: main already paid $120 here.
        // It sits in the file so a fix to the words cannot quietly cost the
        // dollars - the two come from the same receipt and must travel together.
        const mine = rows().find(r => /Manny v/i.test(r.label));
        assert.ok(mine, 'Manny’s match is not in the rows: ' + rows().map(r => r.label).join(' | '));
        assert.notEqual(mine.netMoney, 0,
            'a decided match is worth $0 on the Matches tab while the card prints its dollars');
    });
    // ------------------------------------------------------------------------
    // THE CONTROL IN THE OTHER DIRECTION, and it caught a real regression of
    // mine. The first version of the fix keyed on the receipt segment carrying
    // a result string. Measured on this same wager through seven holes, the
    // Total segment reads "Manny 3 up" and HAS a result string - the receipt
    // falls back to the live status until the bet closes - so every row on a
    // round in progress went tone "final" and one of them announced "Manny
    // +$10" with eleven holes to play. That is the Receipt's oldest defect
    // (money printed on an unfinished match) reintroduced on the tab.
    // ------------------------------------------------------------------------
    test('A ROUND STILL BEING PLAYED IS NOT FINAL ANYWHERE ON THE TAB', () => {
        const mid = rowsFor(midRound());
        assert.equal(mid.length, 3, 'the mid-round fixture lost its wagers');
        mid.forEach((r) => {
            assert.notEqual(r.tone, 'final',
                r.label + ' reads FINAL through seven holes: "' + r.status + '"');
            assert.ok(!/\+\$/.test(String(r.status || '')),
                r.label + ' puts money in the headline of a match still being played: "'
                + r.status + '"');
        });
        // AND NOT VACUOUS: the mid-round rows do say something, so "not final"
        // is not merely true of three empty rows.
        assert.ok(mid.every(r => String(r.status || '').length > 0),
            'the mid-round rows have no status at all, so this test proves nothing');
        assert.ok(mid.some(r => /UP|DOWN|ALL SQUARE/i.test(String(r.status || ''))),
            'no mid-round row reads like a live match: ' + mid.map(r => r.status).join(' | '));
    });
});
