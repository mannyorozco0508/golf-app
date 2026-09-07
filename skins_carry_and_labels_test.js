// ============================================================================
// SKINS: NOBODY'S MENTAL MODEL IS "CARRIES UNLESS STATED"
//
// 1. AN ABSENT CARRY RULE DEFAULTED TO CARRY. Every read was `!== false`, so a
//    round that never recorded a rule carried anyway - which is the likeliest
//    shape of a Monday game going wrong with nobody having chosen it. It now
//    defaults to NO carry, which is what a golfer assumes when nothing was said.
//
//    WHAT THAT MOVES, measured on a twelve-golfer $480 pool with the field absent:
//        before   $69 paid to three winners, $241 refunded to the field
//        after    $310 paid to three winners, nothing refunded
//    That is a real restatement, so it must not happen silently. Every current
//    writer records the field - saveSettings, the Money Pool capture and both
//    skins-instance writers - so no app-created round is affected; only legacy or
//    hand-edited data can lack it. When it does, the receipt SAYS which rule it
//    applied rather than quietly picking one.
//
//    ONE RULE, THREE SCOPES. data.skinsCarryOver (the round's own skins game),
//    each instance's skinsCarryOver (independent skins games with their own
//    buy-ins and participants) and moneyPool.skins.carryOver (the skins bucket of
//    a Main Pool) are genuinely DIFFERENT GAMES that can coexist in one round with
//    different rules - so they cannot collapse into one setting. What they can
//    share, and now do, is one function that decides what an absent rule means.
//
// 2. THE SUMMARY COUNTED A DIFFERENT THING FROM THE LINE. A hole line read
//    "H2 Scott Bell - Skin (2 skins) $35" while the Skins Summary said
//    "Scott Bell - 1 skin $35" - because the summary counted HOLES WON and the
//    line counted UNITS. Beside two golfers showing "1 skin $17", it reads as one
//    man being paid double for the same thing. Same class as the trip footer and
//    the read-only link: correct arithmetic, a label describing something else.
//    Both now count SKINS (units), which is what the money is divided by.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const NAMES = ['Marty Sharp', 'Scott Bell', 'Carp Dean', 'Randy Poe', 'Manny Orozco',
               'Matt Boyd', 'Lance Webb', 'Kopp Ellis', 'Marcus Reed', 'Rocco Vance',
               'Matt Hale', 'Jeremy Cole'];

// Everybody pars; the first five golfers each win one hole outright. Holes 6-18
// all tie, so under carry there is a large pending carry and under no-carry there
// is not - the two rules give visibly different money.
function round(skinsCfg) {
    const players = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: String((i % 4) * 3),
                                           playingForMoney: true }));
    const scores = {};
    players.forEach(p => CD.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4; }));
    [1, 2, 3, 4, 5].forEach((h, i) => { scores['p' + (101 + i) + '_h' + h] = 3; });
    return { players, courseData: CD, scores, settlementMode: 'whole-dollar',
             kpWinners: { h3: '101', h7: '105', h12: '109', h16: '102' },
             kpConfirmed: { confirmed: true },
             moneyPool: { enabled: true, buyIn: 40,
                 kp: { amount: 100, holes: [3, 7, 12, 16] },
                 net: { amount: 70, places: [100] },
                 skins: skinsCfg } };
}
const pool = cfg => {
    const sb = loadJsFile('pool-engine.js', ['handicap.js', 'money-engine.js',
        'action-model.js', 'settlement-engine.js']);
    const d = round(cfg);
    return vm.runInContext('computeMoneyPool', sb)(d, CD, d.scores);
};

// ---------------------------------------------------------------------------
describe('1. AN ABSENT CARRY RULE MEANS NO CARRY', () => {

    test('THE REPORTED DEFECT: omitting the field no longer carries', () => {
        const r = pool({ mode: 'remainder', scoring: 'net' });
        assert.equal(r.skins.carryOver, false,
            'a round that never said "carry" carried anyway');
        assert.equal(r.skins.pendingUnits, 0);
    });

    test('an explicit true still carries', () => {
        const r = pool({ mode: 'remainder', scoring: 'net', carryOver: true });
        assert.equal(r.skins.carryOver, true);
        assert.ok(r.skins.pendingUnits > 0, 'an explicit carry stopped carrying');
    });

    test('an explicit false still does not', () => {
        assert.equal(pool({ mode: 'remainder', scoring: 'net', carryOver: false })
            .skins.carryOver, false);
    });

    // The pot is fully allocated under either rule. That must not change.
    test('the pot still balances either way', () => {
        [undefined, true, false].forEach(v => {
            const cfg = { mode: 'remainder', scoring: 'net' };
            if (v !== undefined) cfg.carryOver = v;
            const r = pool(cfg);
            const paid = (r.skins.lines || []).reduce((s, l) => s + l.cents, 0);
            assert.equal(paid + r.skins.unwonCents, r.skins.amountCents,
                'carryOver=' + v + ' loses money out of the skins pot');
        });
    });

    test('the standalone skins game defaults the same way', () => {
        const sb = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js',
            'action-model.js']);
        const d = { players: NAMES.slice(0, 4).map((n, i) => ({ id: 101 + i, name: n, hcp: '0' })),
                    courseData: CD, scores: {}, skinsBuyIn: 5 };
        d.players.forEach(p => CD.forEach(h => { d.scores['p' + p.id + '_h' + h.hole] = 4; }));
        d.scores['p101_h2'] = 3;
        // computeSkinsHoleLedger is the real entry - buildSkinsLedger does not exist,
        // and an earlier draft asked for it, got undefined, and asserted nothing.
        const led = vm.runInContext('computeSkinsHoleLedger', sb)(d, CD, d.scores);
        assert.ok(led, 'the ledger did not build - nothing was measured');
        assert.equal(led.carryOver, false,
            'the round-level skins game still carries with no rule recorded');
    });

    // ONE RULE, not three copies of `!== false`.
    test('all three scopes read the absent case through one function', () => {
        assert.match(read('action-model.js'), /function skinsCarriesOver/,
            'the rule for an absent carry setting has no single home');
        ['pool-engine.js', 'settlement-engine.js'].forEach(f => {
            const src = read(f).replace(/\/\/.*$/gm, '');
            assert.match(src, /skinsCarriesOver\(/, f + ' does not ask the shared rule');
            assert.ok(!/carryOver !== false|skinsCarryOver !== false/.test(src),
                f + ' still has its own copy of the default');
        });
    });
});

// ---------------------------------------------------------------------------
describe('1b. A ROUND THAT NEVER SAID SAYS SO ON THE RECEIPT', () => {

    const receipt = cfg => {
        const sb = loadHtmlInlineScript('settlement.html', ['score-marks.js', 'money-engine.js',
            'action-model.js', 'settlement-engine.js', 'pool-engine.js']);
        const d = round(cfg);
        // renderMoneyPoolSection, the same entry receipt_skins_test drives -
        // renderSettlement() needs page state the harness does not supply, and an
        // earlier draft died on it before rendering anything.
        vm.runInContext(`currentMode='POOL1'; currentData=${JSON.stringify(d)};
            alert=function(){};
            renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);`, sb);
        return String((sb.document.getElementById('money-pool-section') || {}).innerHTML || '')
            .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    test('an absent rule is stated, not silently chosen', () => {
        const t = receipt({ mode: 'remainder', scoring: 'net' });
        assert.match(t, /did not record|no carry rule|nothing was recorded/i,
            'a legacy round restates its money with no explanation: ' + t.slice(0, 300));
        assert.match(t, /No Carry/i, 'it does not say which rule it used');
    });

    test('a round that DID say carries no such notice', () => {
        const t = receipt({ mode: 'remainder', scoring: 'net', carryOver: true });
        assert.ok(!/did not record|no carry rule/i.test(t),
            'a round with an explicit rule is accused of not having one');
    });
});

// ---------------------------------------------------------------------------
describe('2. THE SUMMARY AND THE HOLE LINE COUNT THE SAME THING', () => {

    const receipt = () => {
        const sb = loadHtmlInlineScript('settlement.html', ['score-marks.js', 'money-engine.js',
            'action-model.js', 'settlement-engine.js', 'pool-engine.js']);
        // Explicit carry, so hole 1 ties and hole 2 pays TWO units to one golfer -
        // the exact shape that made the summary and the line disagree.
        const d = round({ mode: 'remainder', scoring: 'net', carryOver: true });
        vm.runInContext(`currentMode='POOL1'; currentData=${JSON.stringify(d)};
            alert=function(){};
            renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);`, sb);
        return String((sb.document.getElementById('money-pool-section') || {}).innerHTML || '')
            .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    test('THE REPORTED DEFECT: a 2-skin hole is not summarised as 1 skin', () => {
        const t = receipt();
        const line = /\(2 skins\)/.test(t);
        assert.ok(line, 'the fixture no longer produces a two-unit hole: ' + t.slice(0, 200));
        assert.ok(!/Scott Bell — 1 skin/.test(t),
            'the summary still counts holes while the line counts skins: ' + t.slice(0, 400));
    });

    test('the golfer who won two skins is summarised as two', () => {
        assert.match(receipt(), /Scott Bell — 2 skins/,
            'the summary does not agree with the hole line');
    });

    test('a one-skin winner still reads as one', () => {
        assert.match(receipt(), /Carp Dean — 1 skin\b/);
    });

    // BOUND TO WHAT IS COUNTED, so it cannot drift again.
    test('the summary counts units, the same number the money divides by', () => {
        const src = read('settlement.html').replace(/\/\/.*$/gm, '');
        const at = src.indexOf('countByPlayer[k]');
        assert.ok(at > -1, 'the summary tally is gone');
        const line = src.slice(at, src.indexOf('\n', at));
        assert.match(line, /unitsWon/,
            'the summary counts holes won, not skins won - the money divides by units');
    });
});

// ---------------------------------------------------------------------------
describe('3. ONE CANONICAL EXPORT', () => {

    const SM = read('settlement.html');

    // Read out of BUTTON tags. A bare >...< window spans the comments between them,
    // so an earlier draft "found" a label made of prose and failed on a correct page.
    test('there is exactly one print control label', () => {
        const labels = [...new Set((SM.match(/<button[^>]*printReceipt\(\)[^>]*>[^<]*</g) || [])
            .map(s => s.slice(s.lastIndexOf('>') + 1, -1))
            // Both spellings of the glyph are the same button: one is written as a
            // JS escape inside a template literal, one as a literal in markup.
            .map(s => s.replace(/\\u[0-9A-Fa-f]{4}/g, '').replace(/[^\x20-\x7E]/g, '').trim()))];
        assert.equal(labels.length, 1,
            'two competing export buttons: ' + JSON.stringify(labels));
        assert.match(labels[0], /Print \/ Save Receipt/);
    });

    test('the export carries a title block naming course, date and group', () => {
        const at = SM.indexOf('function printReceipt');
        const fn = SM.slice(at, SM.indexOf('\n    function ', at + 30));
        assert.match(SM, /id="receipt-export-head"/,
            'the receipt has no identified header block');
        const hd = SM.slice(SM.indexOf('function buildReceiptHeader'),
                            SM.indexOf('\n    function ', SM.indexOf('function buildReceiptHeader') + 30));
        assert.match(hd, /courseName/, 'the header does not name the course');
        assert.match(hd, /toLocaleDateString/, 'the header does not carry a date');
        assert.match(hd, /players/, 'the header does not say who it is for');
        assert.ok(fn.length > 0);
    });

    test('trip.html hides the recap overlay when printing', () => {
        const t = read('trip.html');
        const at = t.indexOf('@media print');
        assert.ok(at > -1, 'trip.html has no print block');
        const block = t.slice(at, t.indexOf('\n        }', at + 40));
        assert.match(block, /recap-overlay/,
            'printing the trip page with the recap open prints over it');
    });
});
