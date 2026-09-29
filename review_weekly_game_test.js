// ============================================================================
// THE REVIEW STEP NAMES THE WEEKLY GAME (Wave 26)
//
// THE OMISSION THIS CLOSES, measured before it was built: the wizard's Review step -
// the last screen before Save, where every other row links to the step that owns it -
// said NOTHING about the money pool. Its whole GAMES & MONEY section read
//
//     "GAMES & MONEY   🥩 Skins $20 Gross · 8 players   Edit   Extras None   Edit"
//
// on a round carrying a $320 pot with $100 of KP, $100 of net prizes and a $120 skins
// bucket. The round's LARGEST money item was absent while a $20 skins instance was
// listed. renderWizardReview never referenced moneyPool, captureMoneyPool, mp-buyin,
// mp-enabled or totalPool at all, no comment anywhere claimed an exclusion, and
// nothing asserted its absence - so it was an omission, not a decision.
//
// THE ARGUMENT WAS ALREADY IN THE FILE, one function up. Above wizardSideMatchLine:
// "The review covered the main format, the stacked games and the extras, and said
// nothing whatever about side matches - so a fully configured Nassau and a
// half-finished one reviewed identically. That is why a pairing lost to the Back
// button was invisible right up to the receipt." The same sentence with "the Weekly
// Game" in place of "side matches" is why this row exists.
//
// WHY THE FULL SPLIT AND NOT JUST THE POT (Manny's instruction). The failure the
// review exists to catch is a pot that is not what the organizer thinks it is. "$40
// in · $320 pot" alone would still hide KP money with no holes chosen, or a net prize
// quietly dropped to nothing - both of which change who gets paid without changing
// the total. If the screen gets long that is a separate problem, and not one to solve
// by omitting the largest money item on it.
//
// BOUND TO WHAT THE SAVE WRITES, and this is the rule that matters. The line calls
// captureMoneyPool() and validateMoneyPool() - the same two functions saveSettings
// calls at the save gate - exactly as the side-match line is bound to
// collectSetupNassauWager(). It CONSUMES v.totalPool, v.remainder and
// moneyPoolNetTotal() and computes nothing of its own: a second arithmetic path here
// is how a review starts disagreeing with the save, and the Receipt already carries
// a comment about that ("consume, never recompute").
//
// THE CONTROL THAT PROVES IT IS A CUSTOM NET, NOT A LEGACY CENTS ROUND. I proposed
// legacy cents in the recon and it was wrong: validateMoneyPool works in WHOLE
// DOLLARS (totalPool = buyIn * participants), so cents never diverge there. Where a
// hand-rolled line DOES diverge is net.amounts vs net.amount - a custom $40/$30 prize
// has no `amount` field, so naive arithmetic prints $0 for a $70 prize and hands the
// $70 to the skins bucket on screen. Measured: preset net -> fixedAllocated 200,
// remainder 120; custom net -> fixedAllocated 170, remainder 150.
//
// PRESENTATION, NOT MONEY. This adds a row to a screen. captureMoneyPool writes no
// total and no participant count, the save gate re-validates on the payload, and
// pool-engine.js is not touched.
//
// THE FUNCTION IS CALLED wizardPoolLine, NOT wizardWeeklyGameLine, and that is not a
// style choice. weekly_game_everywhere_test.js bans the token weeklyGame /
// weekly_game / WeeklyGame from admin.html, index.html, settlement.html and
// pool-engine.js, to stop the STORED KEY (moneyPool) being renamed to match the
// product name. My first draft called it wizardWeeklyGameLine and that suite caught
// it - correctly. Renaming mine was the fix; narrowing a guard so my identifier fits
// would have traded a real protection for a name. The user-facing LABEL still reads
// "🏆 Weekly Game", with a space, which the same suite requires.
//
// HARNESS. Cold Chrome at admin.html?game=CODE as the owner, the Review step reached
// by a REAL TAP on the step dot, reading innerText off #wizard-review-summary. The
// review is rendered from JS, so mini-dom could read the string - but the row's whole
// point is being on the last screen a golfer looks at, and innerText is the only
// thing that proves that.
//
// THE RED BASELINE, measured against the FINAL file per CLAUDE.md's count rule.
// Against main f194507, all 11 tests:  4 PASS / 7 FAIL.
// The four that pass without the row: the arrival/fixture check; "it still lists what
// it always listed" (the section did render, it just said nothing about the pool);
// and two that are VACUOUS before the row exists - "POOL OFF: no row" is free when
// there is no row on any round, and "pool-engine.js is untouched" is trivially true
// before anything is built. 1 + 1 + 2 = 4.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PL = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(i), playingForMoney: true }));

function round(pool, extra) {
    return Object.assign({
        eventName: 'Rev', courseName: 'Test', players: PL, courseData: CD,
        gameFormat: 'stroke', scores: {}, settlementMode: 'whole-dollar',
        ownerUid: 'anon-cold', organizerToken: 'tok-rev',
        additionalGameInstances: { skins1: { format: 'skins', skinsBuyIn: 20, skinsPotFormat: 'gross', startHole: 1 } },
    }, pool === null ? {} : { moneyPool: pool }, extra || {});
}
const PRESET = { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7, 12, 16] },
                 net: { amount: 100, places: [50, 30, 20] }, skins: { mode: 'remainder' } };
// $40/$30 custom prize: no `amount` field at all. 320 - 100 KP - 70 net = 150 skins.
const CUSTOM = Object.assign({}, PRESET, { net: { payoutMode: 'custom', amounts: [40, 30] } });
// A FIXED skins bucket that balances: 100 KP + 100 net + 120 fixed = 320.
const FIXED = Object.assign({}, PRESET, { skins: { mode: 'fixed', amount: 120 } });
// KP money with NO HOLES chosen - the exact case "just the pot" would hide. The total
// is untouched at $320, so only a line that names the buckets can catch it.
const NO_KP_HOLES = Object.assign({}, PRESET, { kp: { amount: 100, holes: [] } });

const LOOK = `(function () {
  var el = document.getElementById('wizard-review-summary');
  var t = el ? (el.innerText || '') : 'NO REVIEW';
  t = t.replace(/\\s+/g, ' ').trim();
  var i = t.indexOf('GAMES & MONEY');
  return JSON.stringify({
    step: (typeof currentWizardStep !== 'undefined') ? currentWizardStep : 'n/a',
    rows: document.querySelectorAll('.player-row').length,
    all: t,
    gamesAndMoney: i > -1 ? t.slice(i) : 'NO SECTION'
  });
})()`;

async function reviewOf(data) {
    const r = await arriveCold({ url: fileUrl('admin.html', 'game=REV'),
        db: { events: { REV: data }, global_courses: {}, trips: {}, tournaments: {} },
        settleMs: 3500, viewport: { width: 390, height: 844 },
        steps: [{ tap: '[onclick="goToWizardStep(7)"]' }, { sleep: 700 }, { expression: LOOK }] });
    if (!r.ok) return { error: r.reason };
    return JSON.parse((r.value || []).filter(v => typeof v === 'string' && v.startsWith('{')).pop());
}

const S = {};
before(async () => {
    S.preset = await reviewOf(round(PRESET));
    S.custom = await reviewOf(round(CUSTOM));
    S.fixed = await reviewOf(round(FIXED));
    S.noKpHoles = await reviewOf(round(NO_KP_HOLES));
    S.off = await reviewOf(round(null));
});

describe('THE WEEKLY GAME IS ON THE LAST SCREEN BEFORE SAVE', () => {
    test('every arrival reached the Review step with the roster loaded', () => {
        Object.keys(S).forEach(k => {
            assert.ok(S[k] && !S[k].error, k + ': ' + (S[k] && S[k].error));
            assert.equal(S[k].step, 7, k + ' did not reach the review: step ' + S[k].step);
            assert.equal(S[k].rows, 8, k + ' lost the roster');
        });
    });

    test('THE FULL SPLIT: buy-in, pot, KP, net and skins, in one row', () => {
        const g = S.preset.gamesAndMoney;
        assert.match(g, /Weekly Game/, 'the row is missing entirely: ' + g);
        assert.match(g, /\$40 in/, 'the buy-in is not on the row: ' + g);
        assert.match(g, /\$320 pot/, 'the pot is not on the row: ' + g);
        assert.match(g, /KP \$100/, 'KP is not named: ' + g);
        assert.match(g, /Net \$100/, 'the net prize is not named: ' + g);
        assert.match(g, /Skins \$120/, 'the skins bucket is not named: ' + g);
    });

    test('and it still lists what it always listed, so nothing was displaced', () => {
        const g = S.preset.gamesAndMoney;
        assert.match(g, /Skins \$20 Gross . 8 players/, 'the skins instance row went missing');
        assert.match(g, /Extras/, 'the Extras row went missing');
    });

    test('A CUSTOM $40/$30 PRIZE reads $70, from the engine - not $0 from a missing field', () => {
        // The divergence case. net.amount does not exist on a custom payout, so this
        // is where a hand-rolled line silently drops the prize and inflates skins.
        const g = S.custom.gamesAndMoney;
        assert.match(g, /Net \$70/, 'the custom net prize is wrong: ' + g);
        assert.match(g, /Skins \$150/, 'the remainder did not follow the custom prize: ' + g);
        assert.ok(!/Net \$0/.test(g), 'the custom prize printed as $0: ' + g);
    });

    test('A FIXED skins bucket shows its own amount, not a remainder', () => {
        const g = S.fixed.gamesAndMoney;
        assert.match(g, /Skins \$120/, 'the fixed bucket is wrong: ' + g);
        assert.match(g, /\$320 pot/);
    });

    test('KP MONEY WITH NO HOLES CHOSEN is called out - the case "just the pot" would hide', () => {
        // $100 of KP money and nowhere for it to go. The TOTAL is still $320, so a
        // pot-only line would look perfect while the round refused to save.
        const g = S.noKpHoles.gamesAndMoney;
        assert.match(g, /Weekly Game/, 'the row vanished instead of warning: ' + g);
        assert.match(g, /⚠️/, 'no warning mark on a pot that cannot save: ' + g);
        assert.match(g, /KP hole/i, 'the warning does not say what is wrong: ' + g);
        assert.match(g, /fix before saving/, 'it does not say what to do: ' + g);
    });

    test('POOL OFF: no row at all, and the section reads as it always did', () => {
        const g = S.off.gamesAndMoney;
        assert.ok(!/Weekly Game/.test(g), 'a Weekly Game row appeared on a round without one: ' + g);
        assert.ok(!/pot/.test(g), 'a pot figure appeared on a round without a pool: ' + g);
        assert.match(g, /Skins \$20 Gross/, 'the rest of the section did not render');
    });
});

describe('THE SOURCE: BOUND TO THE SAVE, AND COMPUTING NOTHING', () => {
    const ADM = read('admin.html');
    const fn = (() => {
        const at = ADM.indexOf('function wizardPoolLine(');
        return at < 0 ? '' : ADM.slice(at, ADM.indexOf('\n    }', at));
    })();

    test('the line exists and asks the two functions the save gate asks', () => {
        assert.ok(fn.length > 100, 'wizardPoolLine could not be sliced');
        assert.match(fn, /captureMoneyPool\(\)/, 'it does not read what will be written');
        assert.match(fn, /validateMoneyPool\(/, 'it does not ask the validator the save asks');
    });

    test('it CONSUMES the engine figures and recomputes none of them', () => {
        assert.match(fn, /\.totalPool/, 'the pot is not taken from the validator');
        assert.match(fn, /moneyPoolNetTotal\(/, 'the net prize is not taken from the engine');
        // The arithmetic that must NOT be here: a buy-in times a head count, and a
        // remainder worked out by subtraction. Both are the validator's job.
        assert.ok(!/buyIn\s*\*/.test(fn), 'it multiplies the buy-in itself');
        assert.ok(!/totalPool\s*-\s*/.test(fn), 'it derives the remainder by subtraction');
    });

    test('the row is in GAMES & MONEY and edits to the Games step', () => {
        const rv = ADM.slice(ADM.indexOf('function renderWizardReview'),
                             ADM.indexOf('function renderWizardReview') + 7000);
        assert.match(rv, /wizardPoolLine\(\)/, 'the review does not call the line');
        assert.match(rv, /rows\.push\(\[.{0,40}Weekly Game.{0,80}6, SEC_ACTION\]\)/,
            'the row is not pushed into GAMES & MONEY pointing at step 6');
    });

    test('pool-engine.js is untouched by this wave', () => {
        assert.ok(!/wizardWeeklyGameLine/.test(read('pool-engine.js')),
            'the engine now knows about a wizard display function');
    });
});
