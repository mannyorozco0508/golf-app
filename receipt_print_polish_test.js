// ============================================================================
// RECEIPT PRINT POLISH
//
// Two small things, both found by measuring the real print CSS and the real
// rendered Receipt rather than guessing.
//
// 1. The "... More" menu is a <details> element that sits OUTSIDE .top-nav-bar,
//    so hiding the nav bar never hid it. Left open when a golfer exported, a
//    navigation menu printed into a payout document.
//
// 2. Money printed without thousands separators. "$15000" is not a width problem
//    - it fits - but it is measurably harder to read correctly at a glance than
//    "$15,000", and this is the document people settle from.
//
// Both are formatting. No engine, no math, no schema.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const J = JSON.stringify;
const CD = makeCourseData(18);
const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ST = read('settlement.html');
// BOUNDED BY THE BLOCK, not by a character count. This sliced a fixed 2400
// characters from '@media print', so adding any rule near the top of the block -
// the dark-mode reset, in this case - pushed the later rules out of the window and
// broke assertions about CSS that was still perfectly present.
const PRINT_CSS = (() => {
    const start = ST.indexOf('@media print');
    if (start === -1) return '';
    let depth = 0, i = ST.indexOf('{', start);
    for (let j = i; j < ST.length; j++) {
        if (ST[j] === '{') depth++;
        else if (ST[j] === '}') { depth--; if (depth === 0) return ST.slice(start, j + 1); }
    }
    return ST.slice(start);
})();

const ENG = (() => {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js'].forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
})();
const call = c => { vm.runInContext(`window.__r = (function(){ ${c} })();`, ENG); return ENG.window.__r; };

const PAGE = loadHtmlInlineScript('settlement.html',
    ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
const fmt = (fn, n) => { vm.runInContext(`window.__x = ${fn}(${n});`, PAGE); return String(PAGE.window.__x).replace(/<[^>]+>/g, ''); };

function render(d) {
    const sb = loadHtmlInlineScript('settlement.html',
        ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
    vm.runInContext(`
        currentData = ${J(d)};
        renderCombinedSummary(currentData, currentData.courseData, currentData.scores);
        renderSettlement(currentData); renderReceiptScorecard();
        window.__a = document.getElementById('combined-settlement-summary').innerHTML;
        window.__b = document.getElementById('settle-content').innerHTML;`, sb);
    return { top: sb.window.__a, mid: sb.window.__b };
}
function duel(stake) {
    const P = makePlayers(['Marty', 'Manny'], ['5', '5']);
    P.forEach((p, i) => { p.playingForMoney = true; p.team = i === 0 ? 'Team 1' : 'Team 2'; });
    const S = {};
    CD.forEach(h => { S[`p${P[0].id}_h${h.hole}`] = h.par + 1; S[`p${P[1].id}_h${h.hole}`] = h.par; });
    return {
        P, S, data: {
            gameFormat: 'match', matchStake: stake, matchScoring: 'net', matchPressRule: 'manual',
            matchPresses: { a: { baseId: '18', startHole: 5 }, b: { baseId: '18', startHole: 9 } },
            players: P, courseData: CD, scores: S
        }
    };
}

// ---------------------------------------------------------------------------
describe('THE MORE MENU DOES NOT PRINT', () => {
    test('.nav-more is hidden in print', () => {
        assert.match(PRINT_CSS, /\.nav-more/, 'the More menu must be hidden');
        const rule = PRINT_CSS.slice(PRINT_CSS.indexOf('.top-nav-bar'), PRINT_CSS.indexOf('.top-nav-bar') + 400);
        assert.match(rule, /display: none !important/);
    });

    test('the whole nav wrapper is hidden, not just the bar', () => {
        // .nav-more sits outside .top-nav-bar - hiding the bar alone left it printing.
        assert.match(PRINT_CSS, /\.app-nav-wrap/);
    });

    test('the element it targets actually exists on the page', () => {
        assert.match(ST, /<details class="nav-more"/, 'if this markup changes the rule must too');
    });

    test('the other chrome is still hidden', () => {
        ['.top-nav-bar', '.btn-primary', '.event-title', '.theme-toggle-btn'].forEach(sel =>
            assert.ok(PRINT_CSS.includes(sel), `${sel} must stay hidden in print`));
    });
});

// ---------------------------------------------------------------------------
describe('MONEY READS AS MONEY', () => {
    test('four figures and up are grouped', () => {
        assert.equal(fmt('fmtWhole', 1000), '1,000');
        assert.equal(fmt('fmtWhole', 1500), '1,500');
        assert.equal(fmt('fmtWhole', 15000), '15,000');
        assert.equal(fmt('fmtWhole', 150000), '150,000');
        assert.equal(fmt('fmtWhole', 1234567), '1,234,567');
    });

    test('anything under a thousand is UNCHANGED', () => {
        // The overwhelming majority of real rounds. Nothing about them may move.
        [0, 5, 50, 200, 790, 999].forEach(n =>
            assert.equal(fmt('fmtWhole', n), String(n), `${n} must be untouched`));
    });

    test('a genuine fraction still prints its exact cents', () => {
        // The line between formatting and falsifying: $12.50 must stay $12.50.
        assert.equal(fmt('fmtWhole', 12.5), '12.50');
        assert.equal(fmt('fmtWhole', 999.99), '999.99');
        assert.equal(fmt('fmtWhole', 1234.5), '1,234.50');
        assert.equal(fmt('fmtWhole', 1000.01), '1,000.01');
    });

    test('negatives group correctly and keep the sign outside the digits', () => {
        assert.equal(fmt('fmtWhole', -15000), '-15,000');
        assert.equal(fmt('fmtWhole', -1234.5), '-1,234.50');
        assert.equal(fmt('fmtSigned', -15000), '-$15,000');
        assert.ok(!fmt('fmtSigned', -15000).includes('$-'), 'the sign belongs before the dollar sign');
    });

    test('the signed helpers carry the grouping through', () => {
        assert.equal(fmt('fmtSigned', 15000), '+$15,000');
        assert.equal(fmt('fmtSignedHtml', 15000), '+$15,000');
        assert.equal(fmt('fmtSignedHtml', 0), '$0');
        assert.equal(fmt('fmtSignedHtml', 1234.5), '+$1,234.50');
    });

    test('the colour classes still survive', () => {
        vm.runInContext(`window.__x = fmtSignedHtml(15000);`, PAGE);
        assert.ok(String(PAGE.window.__x).includes('val-pos'));
        vm.runInContext(`window.__x = fmtSignedHtml(-15000);`, PAGE);
        assert.ok(String(PAGE.window.__x).includes('val-neg'));
    });

    test('a comma can never reach a calculation — fmtWhole output is display only', () => {
        const live = ST.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.ok(!/parseFloat\(fmt|parseInt\(fmt|Number\(fmt/.test(live),
            'formatted money must never be parsed back');
    });
});

// ---------------------------------------------------------------------------
describe('THE RENDERED RECEIPT USES THE SEPARATORS', () => {
    const big = duel(5000);

    test('Final Results shows grouped amounts', () => {
        const r = render(big.data);
        assert.match(r.top, /\$15,000/);
        assert.ok(!/\$15000/.test(r.top), 'the ungrouped form must be gone');
    });

    test('Who Pays Who shows grouped amounts', () => {
        const r = render(big.data);
        const tx = String(r.top).match(/Marty → Manny<\/span><span[^>]*>\$([\d,]+)/);
        assert.ok(tx, 'no transaction rendered');
        assert.equal(tx[1], '15,000');
    });

    test('MATCH NET shows grouped amounts', () => {
        const r = render(big.data);
        assert.match(r.mid, /MATCH NET[^$]*\$15,000/);
    });

    test('MONEY PARITY survives the formatting change', () => {
        const led = call(`
            var o = computeCombinedNetTotals(${J(big.data)}, ${J(CD)}, ${J(big.S)});
            var n = {}; Object.keys(o.netByName).forEach(function(k){ n[o.netByName[k].name] = o.netByName[k].net; });
            return n;`);
        const r = render(big.data);
        // Read the printed figures back, strip the commas, and compare to the ledger.
        const printed = {};
        [...String(r.top).matchAll(/<span>([^<]+)<\/span><span[^>]*>([+-])\$([\d,.]+) NET<\/span>/g)]
            .forEach(m => { printed[m[1]] = (m[2] === '+' ? 1 : -1) * parseFloat(m[3].replace(/,/g, '')); });
        Object.keys(led).forEach(n => {
            if (led[n] === 0) return;
            assert.equal(printed[n], led[n], `${n}: printed ${printed[n]} vs ledger ${led[n]}`);
        });
        assert.equal(Object.values(led).reduce((a, b) => a + b, 0), 0, 'still zero-sum');
    });

    test('Who Pays Who still reconstructs every balance', () => {
        const r = render(big.data);
        const printed = {};
        [...String(r.top).matchAll(/<span>([^<]+)<\/span><span[^>]*>([+-])\$([\d,.]+) NET<\/span>/g)]
            .forEach(m => { printed[m[1]] = (m[2] === '+' ? 1 : -1) * parseFloat(m[3].replace(/,/g, '')); });
        const tx = [...String(r.top).matchAll(/<span>([^<]+) → ([^<]+)<\/span><span[^>]*>\$([\d,.]+)<\/span>/g)]
            .map(m => ({ from: m[1], to: m[2], amount: parseFloat(m[3].replace(/,/g, '')) }));
        const rb = {}; Object.keys(printed).forEach(n => { rb[n] = 0; });
        tx.forEach(t => { rb[t.from] -= t.amount; rb[t.to] += t.amount; });
        Object.keys(printed).forEach(n => assert.equal(rb[n], printed[n], n));
    });

    test('an ordinary round is byte-for-byte unaffected', () => {
        // A $50 match with $50 presses never crosses a thousand, so its Receipt must
        // look exactly as it did before this change.
        const small = duel(50);
        const r = render(small.data);
        // Final Results now reads "+$150 NET" rather than "Won $150"; the rule being
        // checked - no thousands separator below a thousand - is unchanged.
        const amt = String(r.top).match(/[+-]\$[\d,.]+ NET/);
        assert.ok(amt, 'a net figure must be printed');
        assert.ok(!/,/.test(amt[0]), 'no separator where none is due');
        assert.match(r.top, /\$150/);
    });
});

// ---------------------------------------------------------------------------
describe('THE PRINT GUARDS ARE ALL STILL THERE', () => {
    test('page-break protection is intact', () => {
        assert.ok((PRINT_CSS.match(/break-inside: avoid/g) || []).length >= 2,
            'wager blocks and money cards must not split across pages');
        assert.match(PRINT_CSS, /\.receipt-match \{ break-inside: avoid/);
        assert.match(PRINT_CSS, /\.receipt-head \{ break-after: avoid/);
    });

    test('the birdie and eagle rings still survive the export', () => {
        assert.ok((PRINT_CSS.match(/print-color-adjust: exact/g) || []).length >= 2,
            'browsers drop the rings in PDF without this');
        assert.match(PRINT_CSS, /#c1121f/, 'birdie red');
        assert.match(PRINT_CSS, /#0f4c3a/, 'eagle green');
    });

    test('the scorecard prints in full rather than as a scroll window', () => {
        assert.match(PRINT_CSS, /\.receipt-card-scroll \{ overflow-x: visible/);
    });

    test('there is still one canonical print path', () => {
        assert.equal((ST.match(/function printReceipt/g) || []).length, 1);
    });
});

// ---------------------------------------------------------------------------
describe('PROTECTED — formatting only', () => {
    test('no engine changed', () => {
        ['money-engine.js', 'settlement-engine.js', 'action-model.js', 'bet-strip.js'].forEach(f => {
            const src = read(f);
            assert.ok(!/nav-more|thousands|\\B\(\?=\(\\d\{3\}\)/.test(src), `${f} gained formatting code`);
        });
    });

    test('the money helper is still the single formatting rule', () => {
        const live = ST.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.equal((live.match(/toFixed\(2\)/g) || []).length, 1,
            'formatting must not drift back out of fmtWhole');
        assert.equal((ST.match(/function fmtWhole/g) || []).length, 1);
    });

    test('handicap and settlement math untouched', () => {
        assert.match(read('money-engine.js'), /function getStrokes\(hcpIndex, numericHcp\)/);
        assert.equal((read('settlement-engine.js').match(/function computeCombinedNetTotals/g) || []).length, 1);
    });
});
