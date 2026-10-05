// ============================================================================
// THE MATCH CARD, REDESIGNED (2026-10-05) — DISPLAY ONLY
//
// Manny approved a layout: the terms in small type, the two sides in big type
// with a FINAL tag, and the ANSWER top right in the largest type on the card -
// "Reese +$100" with "won 5 of 5 bets" under it. Then one row per bet, its
// result on the left and its money on the right, and presses indented under the
// bet they belong to.
//
// NOT ONE FIGURE IS COMPUTED HERE. Every dollar comes out of the builders that
// already priced the round: sideMatchDecidedNet, sideMatchDecidedTally and the
// new sideMatchMoneyByKey, all of which read a receipt settlement-engine.js
// built. If this card and the Receipt ever disagree it is a bug in a string
// builder, never in two sums - and section 2 holds them to the cent.
//
// AND MID-ROUND THERE ARE NO DOLLARS ANYWHERE ON IT. That is the Receipt's own
// rule, and here it is true BY CONSTRUCTION rather than by the card remembering
// it: sideMatchLiveFinals returns an EMPTY money map until the bet's range is
// complete, so there is nothing for a row to print.
//
// CONTRAST. The old card drew a closed row at opacity 0.6, which measures 2.1:1
// against the card background - below the 4.5:1 WCAG asks of body text, and the
// thing Manny said he could not read. A finished bet is now told apart by its
// result and its money, both of which are the most readable things on the row.
//
// BASELINE, measured over the FINISHED file against main (7e61b66, index.html
// and side-match-lines.js swapped out and restored by sha), all 9 tests:
// 1 PASS / 8 FAIL. 1 + 8 = 9.
//   The one that passes is the arrival itself, which asserts nothing about the
//   redesign. Every claim about the card is red there, including the mid-round
//   rule - the old card had no top-right block at all, so there was nowhere for
//   a running total to appear OR for a live status to.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const IDX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const SML = fs.readFileSync(path.join(__dirname, 'side-match-lines.js'), 'utf8');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const P = [{ id: 101, name: 'Manny Orozco', hcp: '0' }, { id: 102, name: 'Reese Richards', hcp: '0' }];
const nassau = { teamAIds: ['101'], teamBIds: ['102'], format: 'nassau', scoring: 'net',
                 stake: 20, frontStake: 20, backStake: 20, overallStake: 20,
                 pressRule: '2down', startHole: 1, createdAt: 1 };
function scoresThrough(last, reeseWins) {
    const s = {};
    for (let h = 1; h <= last; h++) { s['p101_h' + h] = reeseWins ? 5 : 4; s['p102_h' + h] = reeseWins ? 4 : 5; }
    return s;
}
const round = (scores, sm) => ({
    eventName: 'Match', courseName: 'Dobson Ranch', players: P, courseData: CD, scores: scores,
    gameFormat: 'stroke', settlementMode: 'whole-dollar', groupSizeOverrides: { 0: 2 },
    ownerUid: 'anon-cold', sideMatches: { m1: Object.assign({}, nassau, sm || {}) } });

// The card as a golfer reads it: innerText, scoped to the card. textContent
// would match this page's own inline script, which holds every one of these
// words in source.
const CARD = `(function () {
  var c = document.querySelector('#fc-ticker-mount .lm-card') || document.querySelector('.lm-card');
  if (!c) return JSON.stringify({ none: true });
  var q = function (sel) { var e = c.querySelector(sel); return e ? String(e.innerText || '').trim() : null; };
  var all = function (sel) { return [].slice.call(c.querySelectorAll(sel))
      .map(function (e) { return String(e.innerText || '').trim(); }); };
  return JSON.stringify({
    terms: q('.lm-terms'), sides: q('.lm-sides'),
    finalTag: !!c.querySelector('.lm-final-tag'),
    topMoney: q('.lm-top-money'), topLive: q('.lm-top-live'), topSub: q('.lm-top-sub'),
    rowNames: all('.lm-seg-name'), rowStatus: all('.lm-seg-status'), rowMoney: all('.lm-row-money'),
    pressTags: all('.lm-press-tag'), pressStatus: all('.lm-press-status'),
    text: String(c.innerText || ''),
    // CONTRAST, measured rather than asserted from the stylesheet: a row that is
    // closed must not be drawn faded.
    closedOpacity: (function () {
      var r = c.querySelector('.lm-closed');
      return r ? Number(getComputedStyle(r).opacity) : null;
    })()
  });
})()`;

const S = {};
before(async () => {
    const go = async (code, data) => {
        const r = await arriveCold({ url: fileUrl('index.html', 'game=' + code),
            db: { events: { [code]: data }, global_courses: {}, trips: {}, tournaments: {} },
            viewport: { width: 390, height: 844 }, settleMs: 3400, steps: [{ expression: CARD }] });
        return r.ok ? JSON.parse((r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').pop())
                    : { error: r.reason };
    };
    S.done = await go('MDONE', round(scoresThrough(18, true)));
    S.mid = await go('MMID', round(scoresThrough(6, true)));
    S.push = await go('MPUSH', round((function () {
        // Every hole halved: three bets, no money, and no presses to muddy it.
        const s = {}; for (let h = 1; h <= 18; h++) { s['p101_h' + h] = 4; s['p102_h' + h] = 4; }
        return s;
    })(), { pressRule: 'none' }));
});

describe('1. THE SHAPE MANNY APPROVED', () => {

    test('ran', () => ['done', 'mid', 'push'].forEach(k =>
        assert.ok(S[k] && !S[k].error && !S[k].none, k + ': ' + JSON.stringify(S[k]))));

    test('the header: terms small, the sides big, the answer top right', () => {
        const v = S.done;
        assert.equal(v.terms, 'Nassau · NET · $20 · auto press 2 down',
            'the terms line reads: ' + v.terms);
        assert.match(v.sides, /^Manny v Reese/, 'the sides read: ' + v.sides);
        assert.equal(v.finalTag, true, 'a finished match has no FINAL tag');
        assert.match(v.topMoney, /^Reese \+\$\d+$/, 'the answer top right reads: ' + v.topMoney);
        assert.match(v.topSub, /^won \d+ of \d+ bets$/, 'the sub-line reads: ' + v.topSub);
    });

    test('one row per bet, result left and money right', () => {
        const v = S.done;
        assert.deepEqual(v.rowNames.slice(0, 3), ['FRONT 9', 'BACK 9', 'TOTAL']);
        assert.match(v.rowStatus[0], /Reese \d&\d|Reese \d up/, 'the row result reads: ' + v.rowStatus[0]);
        assert.match(v.rowMoney[0], /^Reese \+\$20$/, 'the row money reads: ' + v.rowMoney[0]);
        assert.equal(v.rowMoney.length, v.rowStatus.length + v.pressStatus.length,
            'a row is missing its money line');
    });

    test('presses are indented under the bet they belong to', () => {
        const v = S.done;
        assert.ok(v.pressTags.length > 0, 'the fixture made no presses');
        v.pressTags.forEach(t => assert.match(t, /^↳ (Auto press|Press) · hole \d+$/,
            'a press tag reads: ' + t));
        // AND AUTO IS STILL NAMED. Two earlier waves put that word there because a
        // caddie could not see a press had been created automatically; the mockup
        // shows one press and does not distinguish them, and matching the drawing
        // exactly would have taken that fix back.
        assert.ok(v.pressTags.some(t => /Auto press/.test(t)),
            'an automatic press no longer says it is automatic: ' + JSON.stringify(v.pressTags));
        // The indent is real, not a space in the string.
        assert.match(IDX, /\.lm-press \{[^}]*padding: 2px 0 2px 16px/);
    });

    test('a PUSH says so, and says what each side won', () => {
        const v = S.push;
        assert.equal(v.topMoney, 'All square', 'a halved match reads: ' + v.topMoney);
        assert.match(v.topSub, /every bet halved|nobody pays|each won/, 'the sub reads: ' + v.topSub);
        assert.ok(!/\+\$/.test(v.topMoney), 'a push printed a dollar figure');
    });
});

describe('2. THE MONEY IS THE RECEIPT’S, AND MID-ROUND THERE IS NONE', () => {

    test('MID-ROUND: a live status top right, and NOT ONE dollar anywhere', () => {
        const v = S.mid;
        assert.equal(v.topMoney, null, 'a running total appeared mid-round: ' + v.topMoney);
        assert.ok(v.topLive && v.topLive.length > 0, 'there is no live status either');
        assert.match(v.topLive, /UP|AS|DOWN|up|all square/i, 'the live line reads: ' + v.topLive);
        assert.equal(v.finalTag, false, 'an unfinished match is tagged FINAL');
        // THE ROWS TOO. The stake is what DEFINES a bet and stays; a WON figure
        // does not exist yet.
        v.rowMoney.forEach(m => assert.ok(!/\+\$/.test(m),
            'a row printed winnings mid-round: ' + m));
    });

    test('and it is true by construction, not by the card remembering', () => {
        // sideMatchLiveFinals hands back an EMPTY money map until the range is
        // complete, so a mid-round row has nothing to print even if the card
        // asked. A rule the renderer has to remember is a rule that gets
        // forgotten by the next renderer.
        const at = SML.indexOf('out[matchId] = {');
        const blk = SML.slice(at, SML.indexOf('};', at));
        assert.match(blk, /money: complete \? sideMatchMoneyByKey\(receipt\) : \{\}/);
        assert.match(blk, /net: complete \? sideMatchDecidedNet\(receipt\) : 0/);
        assert.match(blk, /tally: complete \? sideMatchDecidedTally\(receipt\) : null/);
    });

    test('NOTHING IS RECOMPUTED: the card consumes the priced builders only', () => {
        // THE CARD LIVES IN side-match-lines.js NOW. index.html and
        // leaderboard.html had a copy each - which is what this redesign
        // uncovered, when the parity test between the two surfaces went red - so
        // there is one builder to read and both pages call it.
        const at = SML.indexOf('function buildLiveMatchCardHtml(');
        const fn = SML.slice(at);
        assert.ok(fn.length > 800, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /sideMatchLiveFinals\(/, 'the card is not reading the priced receipts');
        // No arithmetic on money in the renderer: no summing, no multiplying.
        assert.ok(!/\bmoney\s*\+=|\btotal\s*\+=|reduce\(/.test(fn),
            'the card is adding money up itself');
        assert.match(SML, /function sideMatchMoneyByKey\(receipt\)/);
        assert.ok(!/seg\.money|toSideA/.test(fn),
            'the card is reading raw receipt fields instead of the builder');
        // AND NEITHER PAGE KEPT A COPY.
        [IDX, fs.readFileSync(path.join(__dirname, 'leaderboard.html'), 'utf8')].forEach((src, i) => {
            assert.ok(!/function buildLiveMatchCardHtml\(/.test(src),
                'page ' + i + ' still has its own card builder');
            assert.ok(!/lm-top-money|lm-seg-row/.test(src.replace(/<style>[\s\S]*?<\/style>/g, '')),
                'page ' + i + ' still renders card markup of its own');
        });
    });

    test('a closed row is READABLE, which is what started this', () => {
        // Measured in the browser, not read off the stylesheet.
        assert.equal(S.done.closedOpacity, 1,
            'a finished bet is drawn faded: opacity ' + S.done.closedOpacity);
        assert.match(IDX, /\.lm-closed \{ opacity: 1; \}/);
        assert.match(IDX, /\.lm-seg-status \{[^}]*color: var\(--text-main\)/);
        assert.match(IDX, /\.lm-press-status \{[^}]*color: var\(--text-main\)/);
    });
});
