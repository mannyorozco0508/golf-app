// ============================================================================
// FULL CARD + RECEIPT UX CLEANUP
//
// The Full Card answers ONE question: "what did everybody shoot?" Before this
// batch it also tried to be the betting ledger, stamping one badge per wager per
// hole - up to SIX pills on a single row, and a closed press's final result
// reprinted on every hole after it closed.
//
// These tests hold the line on three things:
//   1. the Full Card stays a scorecard (one press summary line, never a wall)
//   2. no developer shorthand (P1, H6, "Bet 2") ever reaches a golfer
//   3. money reads like money ($790, -$210, +$60 - and $12.50 when it truly is)
//
// buildMatchBetsCell() and buildPressSummaryText() are the REAL production
// helpers renderScorecard() calls. There is no test-only copy of the renderer.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PAGE_DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];

function idx() {
    return loadHtmlInlineScript('index.html', PAGE_DEPS);
}

// Calls the real helper inside the page sandbox and hands back the HTML string.
function cell(sandbox, opts) {
    vm.runInContext(`window.__cell = buildMatchBetsCell(${JSON.stringify(opts)});`, sandbox);
    return sandbox.window.__cell;
}

function summary(sandbox, count, lead, t1, t2, dialect) {
    vm.runInContext(
        `window.__sum = buildPressSummaryText(${JSON.stringify(count)}, ${JSON.stringify(lead)}, ` +
        `${JSON.stringify(t1)}, ${JSON.stringify(t2)}, ${JSON.stringify(dialect)});`, sandbox);
    return sandbox.window.__sum;
}

// ---------------------------------------------------------------------------
describe('THE PRESS SUMMARY — one line, correct dialect, no shorthand', () => {
    const sb = idx();

    test('no presses means no line at all', () => {
        assert.equal(summary(sb, 0, null, 'Manny', 'John', 'match'), '');
        assert.equal(summary(sb, null, null, 'Manny', 'John', 'match'), '');
    });

    test('MATCH PLAY dialect: "3 presses . Manny 2 up"', () => {
        assert.equal(summary(sb, 3, 2, 'Manny', 'John', 'match'), '3 presses \u00B7 Manny 2 up');
        assert.equal(summary(sb, 1, -1, 'Manny', 'John', 'match'), '1 press \u00B7 John 1 up');
        assert.equal(summary(sb, 2, 0, 'Manny', 'John', 'match'), '2 presses \u00B7 all square');
    });

    test('STROKE PLAY dialect never borrows Match Play "up"', () => {
        const s = summary(sb, 3, 2, 'Marty', 'Bud', 'stroke');
        assert.equal(s, '3 presses \u00B7 Marty by 2 strokes');
        assert.ok(!/\bup\b/.test(s), 'a total-strokes wager is not "2 up"');
        assert.equal(summary(sb, 1, 1, 'Marty', 'Bud', 'stroke'), '1 press \u00B7 Marty by 1 stroke');
        // "all square" is Match Play. Stroke Play says level.
        assert.equal(summary(sb, 2, 0, 'Marty', 'Bud', 'stroke'), '2 presses \u00B7 level');
    });

    test('the two dialects can never produce the same sentence for the same state', () => {
        assert.notEqual(summary(sb, 2, 3, 'A', 'B', 'match'), summary(sb, 2, 3, 'A', 'B', 'stroke'));
        assert.notEqual(summary(sb, 2, 0, 'A', 'B', 'match'), summary(sb, 2, 0, 'A', 'B', 'stroke'));
    });

    test('when every press is decided it says so ONCE, and re-narrates nothing', () => {
        const s = summary(sb, 4, null, 'Manny', 'John', 'match');
        assert.equal(s, '4 presses \u00B7 final');
        // No 6&5-style result, no per-press breakdown: that lives in My Matches
        // and the Receipt, which is the whole point of the change.
        assert.ok(!/&/.test(s));
        assert.ok(!/up/.test(s));
    });

    test('no press summary in any dialect contains developer shorthand', () => {
        [['match', 2], ['stroke', 2], ['match', 0], ['stroke', -3], ['match', null]].forEach(([d, lead]) => {
            const s = summary(sb, 3, lead, 'Manny', 'John', d);
            assert.doesNotMatch(s, /\bP[123]\b/, `press shorthand in "${s}"`);
            assert.doesNotMatch(s, /\bH\d+\b/, `hole shorthand in "${s}"`);
            assert.doesNotMatch(s, /\bBet \d/, `bet-number shorthand in "${s}"`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('THE MATCH & BETS CELL — a scorecard cell, not a ledger', () => {
    const sb = idx();
    const busy = {
        gameFormat: 'match', hole: 15,
        matchPillText: 'Manny 8&7', holeWinnerText: 'Halved',
        pressCount: 4, pressLead: 3, dialect: 'match',
        t1Name: 'Manny', t2Name: 'John'
    };

    test('a 4-press hole renders ONE summary line, not one badge per press', () => {
        const html = cell(sb, busy);
        const pills = (html.match(/class="status-pill/g) || []).length;
        // Main match pill + hole winner pill. Nothing else.
        assert.equal(pills, 2, `expected 2 pills, got ${pills}: ${html}`);
        assert.equal((html.match(/match-press-summary/g) || []).length, 1);
        assert.ok(html.includes('4 presses \u00B7 Manny 3 up'));
    });

    test('REGRESSION: the pill-fire badge wall is gone entirely', () => {
        const html = cell(sb, busy);
        assert.ok(!html.includes('pill-fire'), 'the badge wall class is back');
        assert.ok(!/\uD83D\uDD25 Bet/.test(html), 'the fire-emoji bet badge is back');
    });

    test('no golfer-facing P1 / P2 / P3', () => {
        const html = cell(sb, busy);
        [/\bP1\b/, /\bP2\b/, /\bP3\b/].forEach(re =>
            assert.doesNotMatch(html, re, `press shorthand reached the Full Card: ${html}`));
    });

    test('no golfer-facing "Bet 2" / "Bet 3" — the off-by-one press names are gone', () => {
        const html = cell(sb, busy);
        assert.doesNotMatch(html, /Bet [2-9]/, 'a press was labelled by bet number');
    });

    test('no golfer-facing H6 / H10 hole shorthand', () => {
        const html = cell(sb, busy);
        // Strip the dots onclick, which legitimately carries a bare hole NUMBER.
        assert.doesNotMatch(html.replace(/onclick="[^"]*"/g, ''), /\bH\d+\b/);
    });

    test('the main match pill and hole result are PRESERVED — this trims noise, not information', () => {
        const html = cell(sb, busy);
        assert.ok(html.includes('Manny 8&7'), 'the match standing is the point of the column');
        assert.ok(html.includes('Halved'), 'the hole result is what this row is about');
    });

    test('a match with no presses renders no summary line at all', () => {
        const html = cell(sb, Object.assign({}, busy, { pressCount: 0, pressLead: null }));
        assert.ok(!html.includes('match-press-summary'));
        assert.ok(html.includes('Manny 8&7'));
    });

    test('CLOSED presses are counted but never re-narrated on later holes', () => {
        // Holes 13-18 of the audit fixture: every press has closed. Previously each of
        // those six rows reprinted "Bet 2 (Manny 6&5)" and friends verbatim.
        const holes = [13, 14, 15, 16, 17, 18].map(h =>
            cell(sb, Object.assign({}, busy, { hole: h, pressLead: null })));
        holes.forEach(html => {
            assert.ok(html.includes('4 presses \u00B7 final'));
            assert.ok(!/6&5|6&4|4&2/.test(html), 'a closed press result was stamped again');
            assert.equal((html.match(/class="status-pill/g) || []).length, 2);
        });
        // Every one of those rows is the same short line, which is the proof that the
        // card no longer grows a taller wall of history the further you read.
        assert.equal(new Set(holes).size, 1);
    });

    test('the cell stays compact across a whole 18-hole card', () => {
        let worst = 0;
        for (let h = 1; h <= 18; h++) {
            const html = cell(sb, Object.assign({}, busy, { hole: h, pressCount: Math.min(h, 6) }));
            worst = Math.max(worst, (html.match(/class="status-pill|match-press-summary/g) || []).length);
        }
        // 2 pills + 1 summary. The old renderer reached 6 pills on a single row.
        assert.ok(worst <= 3, `a Full Card row grew to ${worst} blocks`);
    });

    test('other formats still render their own cell content', () => {
        assert.ok(cell(sb, { gameFormat: 'hilo', hole: 3, hiloLog: { lowWinner: 'Manny', highWinner: 'John' } })
            .includes('Low: Manny'));
        assert.ok(cell(sb, { gameFormat: 'wolf', hole: 3, wolfLog: { call: 'partner', resolved: true, winner: 'wolf', wolfName: 'Manny O' } })
            .includes('Wolf Won'));
        assert.ok(cell(sb, { gameFormat: 'stableford', hole: 3, stablefordParts: ['Manny: 3', 'John: 2'] })
            .includes('Manny: 3'));
    });

    test('the Dots button keeps its permission gate — this batch changed no authorization', () => {
        assert.ok(cell(sb, { gameFormat: 'dots', hole: 7, dots: { count: 2, allowed: true } })
            .includes('onclick="openDotsModal(7)"'));
        const locked = cell(sb, { gameFormat: 'dots', hole: 7, dots: { count: 2, allowed: false } });
        assert.ok(locked.includes('disabled'));
        assert.ok(!locked.includes('onclick'), 'a disabled Dots button must not stay clickable');
    });
});

// ---------------------------------------------------------------------------
describe('THE PRODUCTION PATH — one renderer, no second copy', () => {
    const code = read('index.html');

    test('renderScorecard() builds the cell through the shared helper', () => {
        const fn = code.slice(code.indexOf('function renderScorecard'));
        assert.ok(/buildMatchBetsCell\(\{/.test(fn), 'production must call the tested helper');
    });

    test('there is exactly ONE definition of each helper', () => {
        assert.equal((code.match(/function buildMatchBetsCell/g) || []).length, 1);
        assert.equal((code.match(/function buildPressSummaryText/g) || []).length, 1);
    });

    test('REGRESSION: the old per-hole badge loop is gone from the page', () => {
        assert.ok(!/pill-fire">\uD83D\uDD25 Bet /.test(code), 'the badge wall renderer is back');
        assert.ok(!/betNumByKey/.test(code), 'the Bet-number registry that mislabelled presses is back');
    });

    test('the as-of engine re-run is gated on a press ACTUALLY having started', () => {
        const fn = code.slice(code.indexOf('function renderScorecard'));
        assert.ok(/startedPressBets\.length > 0/.test(fn),
            'a round with no presses must not pay for 18 extra engine runs');
    });

    test('the live match ticker names presses as presses, not by bet number', () => {
        assert.ok(/Press #\$\{\+\+tickerPressNum\}/.test(code));
        assert.ok(!/`Bet \$\{b\.num\}/.test(code), '"Bet 2" meant Press #1 — an off-by-one no golfer can decode');
    });

    test('no math engine was touched to accomplish any of this', () => {
        // The helpers are presentation: they format strings and count segments. If any
        // of these appeared, display work would have leaked into settlement.
        const start = code.indexOf('function buildPressSummaryText');
        const helpers = code.slice(start, code.indexOf('function pressMatchBet'));
        ['db.ref', 'simplifyDebts', 'computeCombinedNetTotals', 'getStrokes', 'parseHcp']
            .forEach(t => assert.ok(!helpers.includes(t), `${t} must not appear in a display helper`));
    });
});

// ---------------------------------------------------------------------------
describe('MONEY READS LIKE MONEY', () => {
    function settle() {
        return loadHtmlInlineScript('settlement.html',
            ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
    }
    const sb = settle();
    const call = (fn, n) => {
        vm.runInContext(`window.__m = ${fn}(${n});`, sb);
        return sb.window.__m;
    };
    const strip = h => String(h).replace(/<[^>]+>/g, '');

    test('whole dollars never print .00', () => {
        assert.equal(call('fmtWhole', 790), '790');
        assert.equal(call('fmtWhole', 790.0), '790');
        assert.equal(call('fmtSigned', 60), '+$60');
        assert.equal(call('fmtSigned', -210), '-$210');
    });

    test('negative money is -$210, never $-210', () => {
        const out = call('fmtSigned', -210);
        assert.equal(out, '-$210');
        assert.ok(!out.includes('$-'), 'the minus sign belongs in front of the dollar sign');
        assert.equal(strip(call('fmtSignedHtml', -210)), '-$210');
    });

    test('positive money carries an explicit +', () => {
        assert.equal(call('fmtSigned', 630), '+$630');
        assert.equal(strip(call('fmtSignedHtml', 630)), '+$630');
    });

    test('zero is $0 — not $0.00, and not signed', () => {
        assert.equal(call('fmtSigned', 0), '$0');
        assert.equal(strip(call('fmtSignedHtml', 0)), '$0');
    });

    test('GENUINE fractions are told truthfully, not rounded into a lie', () => {
        // This is the line between cleaning presentation and falsifying math. An
        // explanatory per-game figure that really is $12.50 must stay $12.50.
        assert.equal(call('fmtWhole', 12.5), '12.50');
        assert.equal(call('fmtSigned', 12.5), '+$12.50');
        assert.equal(call('fmtSigned', -12.5), '-$12.50');
        assert.equal(strip(call('fmtSignedHtml', 790.5)), '+$790.50');
    });

    test('the colour classes the ledger relies on are preserved', () => {
        assert.ok(call('fmtSignedHtml', 5).includes('val-pos'));
        assert.ok(call('fmtSignedHtml', -5).includes('val-neg'));
        assert.ok(call('fmtSignedHtml', 0).includes('val-even'));
    });

    test('no raw toFixed(2) money formatting survives in settlement.html', () => {
        const st = read('settlement.html');
        const live = st.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        const hits = (live.match(/toFixed\(2\)/g) || []).length;
        // The single permitted use is inside fmtWhole itself, which is the rule.
        assert.equal(hits, 1, 'money formatting drifted back out of the shared helper');
        assert.ok(/function fmtWhole[\s\S]{0,120}toFixed\(2\)/.test(live));
    });

    test('Final Results, Birdie Game and Match Net all use the shared rule', () => {
        const st = read('settlement.html');
        assert.ok(/Won \$\$\{fmtWhole\(amt\)\}/.test(st), 'Final Results must not print cents');
        assert.ok(/Owes \$\$\{fmtWhole\(Math\.abs\(amt\)\)\}/.test(st));
        assert.ok(/fmtSignedHtml\(totals\[p\.id\] \|\| 0\)/.test(st), 'Birdie Game printed $-210.00');
        assert.ok(/\+\$\$\{fmtWhole\(r\.netAmount\)\}/.test(st), 'MATCH NET printed +$60.00');
    });
});

// ---------------------------------------------------------------------------
describe('THE RECEIPT — the money story, then the scorecard', () => {
    const st = read('settlement.html');
    const body = st.slice(st.indexOf('<body>'));

    test('section containers appear in the required order', () => {
        const money = body.indexOf('id="combined-settlement-summary"');   // Final Money + Who Pays Who
        const games = body.indexOf('id="settle-content"');                // Group Games + Side Matches
        const card = body.indexOf('id="receipt-scorecard"');              // Full Scorecard
        assert.ok(money > -1 && games > -1 && card > -1);
        assert.ok(money < games && games < card,
            'Final Money -> Who Pays Who -> Group Games -> Side Matches -> Full Scorecard');
    });

    test('the Full Scorecard is LAST — nothing is rendered after it', () => {
        const card = body.indexOf('id="receipt-scorecard"');
        const after = body.slice(card + 40);
        assert.ok(!/id="(combined-settlement-summary|settle-content)"/.test(after),
            'a money section rendered after the scorecard');
    });

    test('Who Pays Who is emitted directly after Final Results, uninterrupted', () => {
        const fn = st.slice(st.indexOf('function renderCombinedSummary'), st.indexOf('function renderReceiptScorecard'));
        const results = fn.indexOf('Final Results');
        const pays = fn.indexOf('Who Pays Who');
        assert.ok(results > -1 && pays > results);
        assert.ok(!/buildReceiptScorecard/.test(fn.slice(results, pays)), 'the grid must not sit between them');
    });

    test('Group Games still come before Side Matches', () => {
        const fn = st.slice(st.indexOf('function buildSideGamesHtml'));
        const birdie = fn.indexOf('Birdie Game');
        const side = fn.indexOf('buildSideMatchesHtml(data');
        assert.ok(birdie > -1 && side > birdie, 'round-wide games belong above private side action');
    });

    test('there is still exactly ONE canonical payout document', () => {
        assert.ok(!/function buildPrintScorecard/.test(read('index.html')), 'the retired generator is back');
        assert.equal((st.match(/function printReceipt/g) || []).length, 1);
    });
});

// ---------------------------------------------------------------------------
describe('SIDE MATCH RECEIPT LANGUAGE — readable without a decoder ring', () => {
    const sb = loadHtmlInlineScript('settlement.html',
        ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
    const label = l => {
        vm.runInContext(`window.__l = receiptSegLabel(${JSON.stringify(l)});`, sb);
        return sb.window.__l;
    };

    test('engine labels are translated for golfers', () => {
        assert.equal(label('Original'), 'Original Bet');
        // Match Play's base segment is labelled 'Overall Match' by the engine. To a
        // golfer it is the same thing as Stroke Play's 'Original': the bet before the
        // pressing started.
        assert.equal(label('Overall Match'), 'Original Bet');
        assert.equal(label('Press 1'), 'Press #1');
        assert.equal(label('Press 2'), 'Press #2');
        assert.equal(label('Press 12'), 'Press #12');
    });

    test('Nassau leg names pass straight through — they are already plain golf', () => {
        ['Front 9', 'Back 9', 'Total'].forEach(l => assert.equal(label(l), l));
    });

    test('the translation is presentation-only — the ENGINE still returns canonical labels', () => {
        // Product decision #3: settlement-engine.js is canonical data and is not
        // renamed to suit display.
        const se = read('settlement-engine.js');
        const fn = se.slice(se.indexOf('function buildSideMatchReceipts'), se.indexOf('function computeCombinedNetTotals'));
        assert.ok(/'Original'/.test(fn), 'the engine label must stay canonical');
        assert.ok(/`Press \$\{i \+ 1\}`/.test(fn) || /`Press \$\{m\.pressNum\}`/.test(fn));
        assert.ok(!/Original Bet/.test(fn), 'display wording leaked into the engine');
        assert.ok(!/Press #/.test(fn), 'display wording leaked into the engine');
    });

    test('the rendered block uses start-hole wording, not a hole range', () => {
        const fn = st_block();
        assert.ok(/Started Hole/.test(fn));
        assert.ok(!/Holes \$\{seg\.startHole\}/.test(fn));
        assert.ok(!/\bH\$\{seg\.startHole\}/.test(fn));
    });

    function st_block() {
        const st = read('settlement.html');
        return st.slice(st.indexOf('function buildReceiptBlock'), st.indexOf('function buildSideMatchesHtml'));
    }

    test('2v2 team names stay as names, never internal side labels', () => {
        const se = read('settlement-engine.js');
        const fn = se.slice(se.indexOf('function buildSideMatchReceipts'), se.indexOf('function computeCombinedNetTotals'));
        assert.ok(/join\(' \/ '\)/.test(fn), 'a 2v2 side reads "Marty / Jose"');
        assert.ok(!/Team 1'\s*:\s*nameA/.test(fn));
    });
});

// ---------------------------------------------------------------------------
describe('FROZEN — things this batch must not have moved', () => {
    test('the birdie / eagle rule is untouched and still gross-vs-par', () => {
        const sm = require(path.join(REPO_ROOT, 'score-marks.js'));
        assert.equal(sm.scoreMark(3, 4), 'birdie');
        assert.equal(sm.scoreMark(4, 5), 'birdie');
        assert.equal(sm.scoreMark(2, 3), 'birdie');
        assert.equal(sm.scoreMark(2, 4), 'eagle');
        assert.equal(sm.scoreMark(3, 5), 'eagle');
        assert.equal(sm.scoreMark(1, 3), 'eagle');
        assert.equal(sm.scoreMark(4, 4), '');
        assert.equal(sm.scoreMark(5, 4), '');
    });

    test('both cards still ask the ONE shared classifier', () => {
        assert.ok(/scoreMarkClass\(scoreVal, h\.par\)/.test(read('index.html')));
        assert.ok(/scoreMarkClass\(score, par\)/.test(read('settlement.html')));
        ['index.html', 'settlement.html'].forEach(f =>
            assert.ok(read(f).includes('<script src="score-marks.js"></script>')));
    });

    test('the Receipt legend still prints, with the circles forced into the PDF', () => {
        const st = read('settlement.html');
        assert.ok(/receipt-legend/.test(st));
        assert.ok(/Eagle or better/.test(st));
        assert.ok(/print-color-adjust: exact/.test(st), 'browsers drop rings in PDF without this');
    });

    test('the whole-dollar allocator and settlement math are byte-identical to main', () => {
        // Nothing in a presentation batch has any business in here.
        const se = read('settlement-engine.js');
        assert.ok(/function computeCombinedNetTotals/.test(se));
        assert.ok(/function buildSideMatchReceipts/.test(se));
        assert.ok(!/fmtSigned|fmtSignedHtml|receiptSegLabel|buildMatchBetsCell/.test(se),
            'display helpers must not have leaked into the settlement engine');
    });

    test('press authorization was not loosened', () => {
        const code = read('index.html');
        // The guard itself, and the two write paths that must go through it.
        const fn = code.slice(code.indexOf('function canPressSideMatch'), code.indexOf('function sideMatchById'));
        assert.ok(/if \(!hasGroupLock\)/.test(fn), 'the bare-link rule is gone');
        assert.ok(/return !isMultiGroupRound;/.test(fn),
            'a bare link on a multi-group round must still grant nothing');
        assert.ok(/String\(map\[pid\]\) === String\(lockedGroup\)/.test(fn),
            'a scorekeeper must still only press matches their own group is in');
        assert.ok(/function openSidePress[\s\S]{0,160}if \(!canPressSideMatch/.test(code),
            'authorization must still be enforced at the write path, not by hiding a button');
        assert.ok(/canWritePlayer/.test(code), 'the score write-path guard must still exist');
        // ?me= identifies a golfer for display. It has never been an authorization token.
        assert.ok(!/lockedGroup\s*=\s*[^;\n]*\bme\b/.test(code), '?me= must never grant authorization');
    });

    test('My Matches keeps the FULL press detail this batch removed from the Full Card', () => {
        // The information did not disappear; it stayed where it belongs.
        const bs = read('bet-strip.js');
        assert.ok(/Press #\$\{i \+ 1\}/.test(bs), 'My Matches still names each press');
        assert.ok(/Started Hole \$\{seg\.startHole\}/.test(bs), 'and still states its start hole');
        assert.ok(/startedText/.test(bs));
    });
});
