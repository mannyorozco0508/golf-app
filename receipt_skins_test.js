// ============================================================================
// RECEIPT — SKINS HOLE-BY-HOLE
//
// WHAT WAS WRONG
//
// The Receipt walked r.skins.lines, which contains one entry per WON skin. A
// tied hole produced no line, so it vanished. A golfer could not tell "hole 7
// was tied" from "hole 7 is missing", and the only way to find out was the paper
// scorecard - which this batch exists to retire.
//
// It now consumes computeSkinsHoleLedger(), the canonical ledger Wave 1 added,
// so the Receipt and the live scorecard card describe the same holes with the
// same winners. Dollars still come from the pool engine's own allocated lines,
// so the printed money is the allocated money and nothing here rounds anything.
//
// THE CONFIG SHIM is the subtle part and is tested explicitly below. The ledger
// takes its basis from data.skinsPotFormat and its field from
// fieldParticipants(); the money pool's skins bucket takes neither, using
// moneyPool.skins.scoring and moneyPoolParticipants(). Handing the ledger the raw
// round would print a ledger for a different game than the money came from.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'settlement.html';
const DEPS = ['money-engine.js', 'action-model.js', 'pool-engine.js', 'settlement-engine.js', 'score-marks.js'];
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

const NAMES = ['Avery', 'Blake', 'Casey', 'Devon', 'Ellis', 'Finley',
    'Gray', 'Harper', 'Indigo', 'Jordan', 'Kendall', 'Logan'];

// A round whose skins outcomes are dictated exactly.
//   spec   overrides individual hole scores
//   thru   how far each group has played (for the mid-round preview case)
function boot({ holes = 18, spec = {}, carry = false, scoring = 'net',
                thru = null, hcps = null, n = 12, mode = 'whole-dollar' } = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const cd = Array.from({ length: holes }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const ps = NAMES.slice(0, n).map((name, i) => ({
        id: 101 + i, name, hcp: String(hcps ? hcps[i] : 0), playingForMoney: true }));
    const groupOf = (id) => Math.floor((Number(id) - 101) / 4) + 1;

    const scores = {};
    ps.forEach(p => cd.forEach(h => {
        const k = 'p' + p.id + '_h' + h.hole;
        if (spec[k] !== undefined) { scores[k] = spec[k]; return; }
        if (thru && h.hole > (thru[groupOf(p.id)] || 0)) return;
        scores[k] = h.par;
    }));

    const data = {
        players: ps, courseData: cd, gameFormat: 'stroke', scores,
        settlementMode: mode,
        moneyPool: { enabled: true, buyIn: 40,
            kp: { amount: 100, holes: [3, 7, 12, 16] },
            net: { amount: 70, places: [57.142857, 42.857143] },
            skins: { mode: 'remainder', scoring, carryOver: carry } },
        kpWinners: { h3: '101', h7: '105', h12: '109', h16: '102' },
    };

    vm.runInContext(`
        currentMode = 'ABCD';
        currentData = ${JSON.stringify(data)};
    `, sb);
    vm.runInContext(`renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);`, sb);

    return {
        sb, ps, cd, data,
        html: () => sb.document.getElementById('money-pool-section').innerHTML,
        run: c => vm.runInContext(c, sb),
    };
}

// ============================================================================

describe('THE RECEIPT PRINTS EVERY HOLE', () => {

    test('all 18 holes appear once the round is complete', () => {
        const b = boot({ spec: { p101_h1: 3, p102_h5: 3, p103_h9: 3 } });
        const h = b.html();
        for (let i = 1; i <= 18; i++) {
            assert.match(h, new RegExp('H' + i + ' \\u2014'), 'hole ' + i + ' is missing from the Receipt');
        }
    });

    test('a WON hole names the winner, the score and the word Skin', () => {
        const b = boot({ spec: { p101_h1: 3 } });
        assert.match(b.html(), /H1 \u2014 Avery \u2014 Net 3 \u2014 Skin/);
    });

    test('a TIED hole is printed, with the score, and says No Skin', () => {
        // The whole point: this row did not exist before, so a tied hole simply
        // vanished from the Receipt.
        const b = boot({ spec: { p101_h1: 3 } });
        assert.match(b.html(), /H2 \u2014 Tie at Net 4 \u2014 No Skin/);
    });

    test('a carried hole shows how many skins it was worth', () => {
        const b = boot({ carry: true, spec: { p101_h2: 3 } });
        assert.match(b.html(), /H2 \u2014 Avery \u2014 Net 3 \u2014 Skin \(2 skins\)/,
            'H1 tied and carried into H2');
    });

    test('WAITING rows appear only when the Receipt is previewed mid-round', () => {
        const done = boot({ spec: { p101_h1: 3 } });
        assert.ok(!/Waiting on/.test(done.html()), 'a finished round must have no waiting rows');

        const mid = boot({ thru: { 1: 14, 2: 14, 3: 13 }, spec: { p101_h1: 3 } });
        const h = mid.html();
        assert.match(h, /H14 \u2014 Waiting on/, 'a previewed round must say which holes are unresolved');
        assert.match(h, /Indigo/, 'and who it is waiting on');
    });
});

describe('SCORING BASIS', () => {

    test('NET skins print the NET score, after handicap strokes', () => {
        // Avery plays off 18 so takes a stroke on every hole. Gross 4 is net 3 and
        // wins outright; printing gross would show 4 and look like a tie.
        const hcps = [18, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const b = boot({ scoring: 'net', hcps });
        assert.match(b.html(), /H1 \u2014 Avery \u2014 Net 3 \u2014 Skin/);
    });

    test('GROSS skins print the GROSS score and ignore strokes', () => {
        const hcps = [18, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const b = boot({ scoring: 'gross', hcps, spec: { p102_h1: 3 } });
        const h = b.html();
        assert.match(h, /Gross skins/);
        assert.match(h, /H1 \u2014 Blake \u2014 Gross 3 \u2014 Skin/,
            'on gross, Avery\'s stroke must not win the hole');
    });

    test('the header states the basis and the carry rule', () => {
        assert.match(boot({ carry: false }).html(), /Net skins, ties void/);
        assert.match(boot({ carry: true }).html(), /Net skins, carries/);
    });

    test('THE CONFIG SHIM: the ledger follows the POOL basis, not skinsPotFormat', () => {
        // The round is deliberately contradictory - the pool pays gross skins while
        // the standalone skins config says net. Handing the ledger the raw round
        // would print net rows against gross money.
        const hcps = [18, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const b = boot({ scoring: 'gross', hcps, spec: { p102_h1: 3 } });
        b.run(`currentData.skinsPotFormat = 'net'; currentData.skinsCarryOver = true;`);
        b.run(`renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores);`);
        const h = b.html();
        assert.match(h, /Gross skins, ties void/, 'the pool basis must win');
        assert.match(h, /H1 \u2014 Blake \u2014 Gross 3/, 'and the rows must follow it');
        assert.ok(!/Net \d+ \u2014 Skin/.test(h), 'no net rows on a gross pool bucket');
    });
});

describe('SUMMARY AND MONEY', () => {

    test('a per-golfer summary lists skins won and dollars', () => {
        const b = boot({ spec: { p101_h1: 3, p101_h5: 3, p102_h9: 3 } });
        const h = b.html();
        assert.match(h, /Skins Summary/);
        assert.match(h, /Avery \u2014 2 skins/);
        assert.match(h, /Blake \u2014 1 skin\b/);
    });

    test('every printed dollar amount is a whole dollar', () => {
        const b = boot({ spec: { p101_h1: 3, p101_h5: 3, p102_h9: 3, p103_h13: 3 } });
        const h = b.html();
        const amounts = [...h.matchAll(/\$[\d,]+(\.\d+)?/g)].map(m => m[0]);
        assert.ok(amounts.length > 0, 'the Receipt should print money');
        amounts.forEach(a => assert.ok(!/\./.test(a), 'cents on the Receipt: ' + a));
    });

    test('the summary dollars sum to the paid part of the bucket', () => {
        const b = boot({ spec: { p101_h1: 3, p101_h5: 3, p102_h9: 3, p103_h13: 3 } });
        const sb = b.sb;
        const r = sb.computeMoneyPool(b.data, b.data.courseData, b.data.scores);
        const paid = r.skins.lines.reduce((a, l) => a + l.cents, 0);
        assert.equal(paid + r.skins.unwonCents, r.skins.amountCents,
            'paid + unwon must equal the bucket, so the summary can never disagree with it');
    });

    test('unwon skins money is stated explicitly, never omitted', () => {
        // Every hole tied: nothing is won, the whole bucket refunds.
        const b = boot({ carry: true });
        const h = b.html();
        assert.match(h, /No skins were won/);
        assert.match(h, /Unwon skins money/);
        assert.match(h, /refunded to the field/);
    });

    test('a carried-but-unwon amount says how many skins carried', () => {
        const b = boot({ carry: true, spec: { p101_h1: 3 } });
        const h = b.html();
        if (/Unwon skins money/.test(h)) {
            assert.match(h, /unwon skins? carried to the end/);
        }
    });
});

describe('NO DUPLICATE SKINS LOGIC IN THE PAGE', () => {

    const fnSrc = () => {
        const src = read('settlement.html');
        const at = src.indexOf('function buildSkinsReceiptSection');
        return src.slice(at, src.indexOf('\n    function renderMoneyPoolSection', at));
    };

    test('it calls the canonical ledger', () => {
        assert.match(fnSrc(), /computeSkinsHoleLedger\(/);
    });

    test('it does no handicap or low-score arithmetic of its own', () => {
        const fn = fnSrc();
        assert.doesNotMatch(fn, /getStrokes\(/, 'no second handicap calculator');
        assert.doesNotMatch(fn, /parseHcp\(/);
        assert.doesNotMatch(fn, /Math\.min\(/, 'no second low-score calculator');
        assert.doesNotMatch(fn, /computeSkinsCarryOverForSettle|computeSkinsVoidForSettle/,
            'it must go through the ledger, not reach past it into the resolvers');
    });

    test('it does not round money - dollars come from the pool allocation', () => {
        const fn = fnSrc();
        assert.doesNotMatch(fn, /Math\.round\(/, 'the Receipt must print allocated dollars, not rounded ones');
        assert.match(fn, /r\.skins\.lines\.forEach/, 'amounts must come from the allocated lines');
    });

    test('it passes the pool basis and participants to the ledger explicitly', () => {
        const fn = fnSrc();
        assert.match(fn, /participantIds: r\.participants\.map/);
        assert.match(fn, /skinsPotFormat: scoring/);
        assert.match(fn, /skinsCarryOver: r\.skins\.carryOver/);
    });
});
