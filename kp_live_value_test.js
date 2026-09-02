// ============================================================================
// KP LIVE VALUE + UNCLAIMED-CARRY EXPLANATION
//
// Part 2 changed what a golfer can SEE, and nothing about what they are PAID.
// Both halves are asserted here, and the money half is asserted by executing the
// engine rather than by reading source.
//
// WHY "EACH" IS NOT DECORATION. Dots are paid by every other player. A 2-unit KP
// at $5 a dot is $10 from each opponent, which is $30 to the winner in a foursome.
// Printing "$10" alone reads as a pot - which is exactly what the OTHER feature
// called KP (Money Pool) is, and what this one is not. Dropping the word would
// make two features that share a name also share a wrong meaning.
//
// WHY PENDING EXISTS. Carry completion is WHOLE-FIELD: a par 3 has not carried
// until every golfer in the Dots game has a gross score on it. Group 1 finishing
// hole 3 does not double hole 7 while Group 2 is still on hole 3. The banner shows
// the canonical value and says "Previous KP pending" instead of predicting.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const IDX = read('index.html');

const P = [101, 102, 103, 104].map((id, i) => ({ id, name: 'ABCD'[i], hcp: '0', playingForMoney: true }));
// Par 3s on 3, 7, 12, 16 - the holes the brief's worked examples use.
const CD = Array.from({ length: 18 }, (_, i) => ({
    hole: i + 1, par: [3, 7, 12, 16].includes(i + 1) ? 3 : 4, hcpIndex: i + 1
}));
const full = () => { const s = {}; P.forEach(p => CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; })); return s; };
const engine = loadJsFile('money-engine.js');

function round(extra, scores) {
    return Object.assign({
        gameFormat: 'dots', players: P, courseData: CD,
        scores: scores || full(), dotPointVal: 5, dots: {}
    }, extra || {});
}
const moneyOf = (d, s) => engine.computeRoundMoneyByPlayer(round(d, s), CD, s || full()).players.map(x => x.net);

// Drives the REAL presenter in index.html rather than re-deriving its output.
function kpLine(extra, hole, scores) {
    const sb = loadHtmlInlineScript('index.html',
        ['handicap.js', 'score-marks.js', 'money-engine.js', 'action-model.js',
            'settlement-engine.js', 'bet-strip.js', 'hole-events.js']);
    const data = round(extra, scores);
    data.additionalGameInstances = { d: { format: 'dots', enabled: true, startHole: 1, createdAt: 1 } };
    vm.runInContext(`currentData = ${JSON.stringify(data)};
        window.__kp = kpLiveLineHtml(${hole});
        window.__st = kpLiveState(${hole});`, sb);
    return { html: sb.window.__kp || '', state: sb.window.__st };
}

// ---------------------------------------------------------------------------
describe('THE LIVE KP VALUE IS PER OPPONENT, AND SAYS SO', () => {
    test('base KP reads "$5 each"', () => {
        const { html } = kpLine({}, 7);
        assert.match(html, /KP/);
        assert.match(html, /\$5 each/, 'the per-opponent value');
        assert.ok(!/riding/.test(html), 'nothing is riding at base');
    });

    test('NEGATIVE CONTROL — the word "each" is required, not incidental', () => {
        assert.ok(/each/.test(kpLine({}, 7).html),
            '"$5" alone reads as a pot, which is the OTHER KP feature');
    });

    test('one carry reads "$10 each" and "2 riding"', () => {
        const { html, state } = kpLine({ greenieCarryover: true }, 7);
        assert.match(html, /\$10 each/);
        assert.match(html, /2 riding/);
        assert.equal(state.units, 2);
    });

    test('two carries read "$15 each" and "3 riding"', () => {
        const { html, state } = kpLine({ greenieCarryover: true }, 12);
        assert.match(html, /\$15 each/);
        assert.match(html, /3 riding/);
        assert.equal(state.units, 3);
    });

    test('a win consumes the carry and the next KP resets to base', () => {
        const d = { greenieCarryover: true, dots: { h7: { p101: ['greenie'] } } };
        assert.match(kpLine(d, 12).html, /\$5 each/, 'hole 12 is back to base after hole 7 was won');
        assert.ok(!/riding/.test(kpLine(d, 12).html));
    });

    test('carryovers OFF never shows accumulated value or riding units', () => {
        assert.match(kpLine({}, 12).html, /\$5 each/);
        assert.ok(!/riding/.test(kpLine({}, 12).html));
        assert.equal(kpLine({}, 12).state.units, 1);
    });

    test('nothing renders on a hole that is not an eligible par 3', () => {
        assert.equal(kpLine({ greenieCarryover: true }, 5).html, '', 'par 4');
        assert.equal(kpLine({ greenieCarryover: true, startHole: 10 }, 7).html, '',
            'a par 3 before the start hole');
    });

    test('nothing renders without a Dots stake', () => {
        assert.equal(kpLine({ dotPointVal: 0 }, 7).html, '');
    });
});

// ---------------------------------------------------------------------------
describe('THE BANNER NEVER PREDICTS A CARRY', () => {
    test('a partially entered par 3 does not raise the next KP', () => {
        const partial = full();
        delete partial['p104_h3'];
        const { html, state } = kpLine({ greenieCarryover: true }, 7, partial);
        assert.match(html, /\$5 each/, 'hole 3 has not carried yet');
        assert.equal(state.units, 1);
    });

    test('and it says so, instead of staying silent', () => {
        const partial = full();
        delete partial['p104_h3'];
        assert.match(kpLine({ greenieCarryover: true }, 7, partial).html, /Previous KP pending/);
        assert.equal(kpLine({ greenieCarryover: true }, 7, partial).state.pendingEarlier, true);
    });

    test('MULTI-GROUP — Group 1 is not told the KP doubled while Group 2 is behind', () => {
        // Whole-field completion: two golfers have finished hole 3, two have not.
        const partial = full();
        delete partial['p103_h3']; delete partial['p104_h3'];
        const { html } = kpLine({ greenieCarryover: true }, 7, partial);
        assert.match(html, /\$5 each/);
        assert.ok(!/2 riding/.test(html), 'that carry has not been established yet');
    });

    test('the pot corrects the moment the last score lands', () => {
        const partial = full();
        delete partial['p104_h3'];
        assert.equal(kpLine({ greenieCarryover: true }, 7, partial).state.units, 1);
        assert.equal(kpLine({ greenieCarryover: true }, 7).state.units, 2);
    });

    test('a future par 3 generates no carry for an earlier one', () => {
        const none = {};
        assert.equal(kpLine({ greenieCarryover: true }, 3, none).state.units, 1);
    });

    test('a manual KP on a par 4 does not enter the par-3 carry chain', () => {
        const d = { greenieCarryover: true, dots: { h5: { p101: ['greenie'] } } };
        assert.equal(kpLine(d, 7).state.units, 2, 'hole 3 still carried; hole 5 is irrelevant');
        assert.deepEqual(moneyOf(d), [15, -5, -5, -5], 'and it still pays as a flat 1-unit dot');
    });
});

// ---------------------------------------------------------------------------
describe('WINNER REMOVAL AND CHANGE RECOMPUTE FROM SOURCE', () => {
    test('removing a winner puts the carry back', () => {
        const withWin = { greenieCarryover: true, dots: { h7: { p101: ['greenie'] } } };
        const removed = { greenieCarryover: true, dots: { h7: {} } };
        assert.equal(kpLine(withWin, 12).state.units, 1);
        assert.equal(kpLine(removed, 12).state.units, 3, 'holes 3 and 7 both unwon again');
    });

    test('changing the winner moves the money, not the carry', () => {
        const a = { greenieCarryover: true, dots: { h7: { p101: ['greenie'] } } };
        const b = { greenieCarryover: true, dots: { h7: { p102: ['greenie'] } } };
        assert.equal(kpLine(a, 12).state.units, kpLine(b, 12).state.units);
        assert.deepEqual(moneyOf(a), [30, -10, -10, -10]);
        assert.deepEqual(moneyOf(b), [-10, 30, -10, -10]);
    });

    test('no cached carry — the presenter reads canonical state every call', () => {
        const region = IDX.slice(IDX.indexOf('function kpLiveState'), IDX.indexOf('function kpLiveLineHtml'));
        assert.match(region, /greenieCarryMap\(/, 'must call the canonical map');
        assert.ok(!/riding \+= 1|pending\.push/.test(region),
            'the presenter must not run carry arithmetic of its own');
    });
});

// ---------------------------------------------------------------------------
describe('BOTH SCORECARD VIEWS USE THE ONE PRESENTER', () => {
    test('Hole View and Full Card both call kpLiveLineHtml', () => {
        // Comments stripped first: prose that NAMES the presenter is not a call site,
        // and counting it made this fail the moment another comment referred to it.
        const code = IDX.replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.equal((code.match(/kpLiveLineHtml\(/g) || []).length, 3,
            'one definition plus exactly two call sites');
        assert.match(IDX, /html \+= kpLiveLineHtml\(holeNum\);/, 'Hole View');
        assert.match(IDX, /inner \+= kpLiveLineHtml\(o\.hole\);/, 'Full Card');
    });

    test('there is exactly one carry presenter', () => {
        assert.equal((IDX.match(/function kpLiveState/g) || []).length, 1);
        assert.equal((IDX.match(/function kpLiveLineHtml/g) || []).length, 1);
    });
});

// ---------------------------------------------------------------------------
describe('THE MONEY DID NOT MOVE', () => {
    const EXPECTED = {
        'base KP won by A': [{ dots: { h7: { p101: ['greenie'] } } }, [15, -5, -5, -5]],
        'one carry then A wins': [{ greenieCarryover: true, dots: { h7: { p101: ['greenie'] } } }, [30, -10, -10, -10]],
        'two carries then A wins': [{ greenieCarryover: true, dots: { h12: { p101: ['greenie'] } } }, [45, -15, -15, -15]],
        'h3 missed, h7 A, h12 B': [{ greenieCarryover: true, dots: { h7: { p101: ['greenie'] }, h12: { p102: ['greenie'] } } }, [25, 5, -15, -15]],
        'nobody wins any KP': [{ greenieCarryover: true }, [0, 0, 0, 0]],
        'carryovers OFF, final unwon': [{ dots: { h7: { p101: ['greenie'] } } }, [15, -5, -5, -5]],
    };
    Object.keys(EXPECTED).forEach(name => {
        test(name, () => {
            const [d, expect] = EXPECTED[name];
            assert.deepEqual(moneyOf(d), expect);
            assert.equal(moneyOf(d).reduce((a, b) => a + b, 0), 0, 'zero-sum');
        });
    });

    test('an unclaimed carry creates no debt for anybody', () => {
        assert.deepEqual(moneyOf({ greenieCarryover: true, dots: {} }), [0, 0, 0, 0]);
    });
});

// ---------------------------------------------------------------------------
describe('SETTLEMENT EXPLAINS WHAT DIED, WITHOUT PAYING IT', () => {
    const SET = read('settlement.html');

    test('the note is descriptive and sits inside the Dots card', () => {
        assert.match(SET, /function unclaimedKpNoteHtml/);
        assert.match(SET, /\$\{unclaimedKpNoteHtml\(data, courseData, savedScores\)\}/,
            'rendered after the ledger that was already built');
        assert.match(SET, /No payout/);
    });

    test('it is silent when carryovers are OFF', () => {
        const fn = SET.slice(SET.indexOf('function unclaimedKpNoteHtml'));
        assert.match(fn, /data\.greenieCarryover !== true\) return ''/);
    });

    test('it is silent when nothing is outstanding', () => {
        const fn = SET.slice(SET.indexOf('function unclaimedKpNoteHtml'));
        assert.match(fn, /if \(unwon < 1\) return ''/);
    });

    test('singular and plural are both handled', () => {
        const fn = SET.slice(SET.indexOf('function unclaimedKpNoteHtml'));
        assert.match(fn, /1 KP unclaimed at finish/);
        assert.match(fn, /KPs unclaimed at finish/);
    });

    test('it says "each riding", never a pot total', () => {
        const fn = SET.slice(SET.indexOf('function unclaimedKpNoteHtml'));
        assert.match(fn, /each riding/);
    });

    test('it never enters the money — no total, net or receipt figure', () => {
        // Comments stripped first: the function's own prose explains that it touches
        // no net and no totals, and matching that prose would pass for the wrong reason.
        // Bounded by the function's own closing brace, not a character count - a fixed
        // slice ran past the end into neighbouring code and matched ITS use of 'net'.
        const at = SET.indexOf('function unclaimedKpNoteHtml');
        const whole = SET.slice(at, SET.indexOf('\n        }', at) + 10);
        const code = whole.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.ok(!/\bnet\b|totals\[|perPlayer|simplifyDebts|\+=/.test(code),
            'the explanation must not touch settlement arithmetic');
        assert.match(code, /return `<div class="settle-row"/, 'it returns markup and nothing else');
    });

    test('the canonical unwon count comes from riding, not a second ledger', () => {
        const map = engine.greenieCarryMap(
            round({ greenieCarryover: true, dots: { h7: { p101: ['greenie'] } } }), CD, full(), P);
        // h7 won -> reset; h12 and h16 unwon -> riding 3, so 2 KPs died unclaimed.
        assert.equal(map.riding, 3);
        assert.equal(map.riding - 1, 2);
    });
});

// ---------------------------------------------------------------------------
describe('NOTHING ELSE MOVED', () => {
    test('the recap now says "each" too, so the app agrees with itself', () => {
        const he = read('hole-events.js');
        assert.ok(he.includes('.toFixed(0)} each`'),
            'the carried-KP event must state a per-opponent value, like the tee banner');
    });

    test('persisted identifiers are untouched', () => {
        ['money-engine.js', 'index.html', 'stats.html'].forEach(f => {
            assert.match(read(f), /'greenie'/);
            assert.match(read(f), /data\.greenieCarryover === true/);
        });
        assert.match(read('admin.html'), /greenieCarryover: greenieCarryover,/);
    });

    test('no kpCarryover, kpPot, kpStake or second engine appeared', () => {
        const prod = ['index.html', 'admin.html', 'settlement.html', 'stats.html',
            'money-engine.js', 'hole-events.js', 'action-model.js'].map(read).join('\n');
        assert.ok(!/kpCarryover|kpCarryMap|kpPot\b|kpStake|kpDotVal/i.test(prod));
    });

    test('Money Pool KP accounting is untouched', () => {
        assert.match(read('admin.html'), /id="mp-kp-amount"/);
        assert.match(read('pool-engine.js'), /kpWinners/);
        assert.match(read('money-engine.js'), /const dotVal = data\.dotPointVal \|\| 0;/);
    });

    test('the score-box geometry fix is intact and the banner sits outside the rows', () => {
        assert.match(IDX, /class="cell-dots"/, 'the reserved junk strip');
        const css = IDX.replace(/\/\*[\s\S]*?\*\//g, '');
        const rule = /\.kp-live\s*\{[^}]*\}/.exec(css);
        assert.ok(rule, '.kp-live must be styled');
        // THE LAST DECLARATION WINS. Asserting that "nowrap" appears somewhere passed
        // even when a later `white-space: normal` in the same rule overrode it, which
        // is exactly the mutation that would let a long carry label reflow the block.
        const ws = rule[0].match(/white-space:\s*([a-z-]+)/g) || [];
        assert.ok(ws.length > 0, '.kp-live must pin white-space');
        assert.match(ws[ws.length - 1], /nowrap/, 'a longer carry label must not reflow');
        const ov = rule[0].match(/overflow:\s*([a-z-]+)/g) || [];
        assert.match(ov[ov.length - 1], /hidden/, 'and must not spill');
        // The banner is its own block above score entry, never inside a player row.
        assert.ok(!/hv-player-cell[^`]*kpLiveLineHtml/.test(IDX),
            'the banner must not render inside a score-entry row');
    });
});
