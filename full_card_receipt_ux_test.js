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

// The helper takes a COUNT and nothing else now. Extra arguments are passed in the
// negative tests below to prove they cannot influence the output.
function summary(sandbox, count, ...rest) {
    const args = [count].concat(rest).map(a => JSON.stringify(a)).join(', ');
    vm.runInContext(`window.__sum = buildPressSummaryText(${args});`, sandbox);
    return sandbox.window.__sum;
}

// ---------------------------------------------------------------------------
describe('THE PRESS SUMMARY — one line, correct dialect, no shorthand', () => {
    const sb = idx();

    test('no presses means no line at all', () => {
        assert.equal(summary(sb, 0, null, 'Manny', 'John', 'match'), '');
        assert.equal(summary(sb, null, null, 'Manny', 'John', 'match'), '');
    });

    // BEHAVIOUR CHANGE: the Full Card used to append a press STATUS
    // ("4 presses . all square"). That reads as though the four presses were
    // collectively all square, when in reality #1 may be won, #2 lost, #3 tied and
    // #4 still live. One status word cannot honestly stand for four independent
    // wagers. The count is the only thing the Full Card claims now.
    test('it states a COUNT and nothing else', () => {
        assert.equal(summary(sb, 1), '1 press');
        assert.equal(summary(sb, 2), '2 presses');
        assert.equal(summary(sb, 3), '3 presses');
        assert.equal(summary(sb, 4), '4 presses');
        assert.equal(summary(sb, 11), '11 presses');
    });

    test('singular / plural grammar is correct', () => {
        assert.equal(summary(sb, 1), '1 press');
        assert.ok(summary(sb, 2).endsWith('presses'));
    });

    test('NO status language survives, in any vocabulary', () => {
        // The exact words the old implementation could emit, plus the Stroke Play set.
        const banned = [/all square/i, /\bfinal\b/i, /\bup\b/i, /\bdown\b/i, /\btied\b/i,
            /\blevel\b/i, /\bstrokes?\b/i, /\blead/i, /\bwon\b/i, /\blost\b/i, /&/];
        for (let n = 0; n <= 12; n++) {
            const s = summary(sb, n);
            banned.forEach(re => assert.doesNotMatch(s, re, `status language "${re}" survived in "${s}"`));
        }
    });

    test('NO player name can reach the summary, even if one is passed in', () => {
        // Proves the removal is structural rather than a caller that merely stopped
        // supplying names: the helper ignores everything after the count.
        ['Manny', 'John', 'Marty', 'Bud'].forEach(name => {
            const s = summary(sb, 3, 2, name, name, 'match');
            assert.ok(!s.includes(name), `player name "${name}" reached the Full Card`);
        });
        assert.equal(summary(sb, 3, 2, 'Manny', 'John', 'match'), '3 presses');
        assert.equal(summary(sb, 3, 2, 'Marty', 'Bud', 'stroke'), '3 presses');
    });

    test('a count needs no dialect — Match Play and Stroke Play read identically', () => {
        // Deliberately the OPPOSITE of the old assertion. The dialect split belonged to
        // status wording; a count is equally true of both formats, so a divergence here
        // would mean format-specific language crept back in.
        assert.equal(summary(sb, 3, 2, 'A', 'B', 'match'), summary(sb, 3, 2, 'A', 'B', 'stroke'));
        assert.equal(summary(sb, 2, 0, 'A', 'B', 'match'), summary(sb, 2, 0, 'A', 'B', 'stroke'));
        assert.equal(summary(sb, 4, null, 'A', 'B', 'match'), summary(sb, 4, null, 'A', 'B', 'stroke'));
    });

    test('no press summary contains developer shorthand', () => {
        for (let n = 0; n <= 12; n++) {
            const s = summary(sb, n);
            assert.doesNotMatch(s, /\bP[123]\b/, `press shorthand in "${s}"`);
            assert.doesNotMatch(s, /\bH\d+\b/, `hole shorthand in "${s}"`);
            assert.doesNotMatch(s, /\bBet \d/, `bet-number shorthand in "${s}"`);
        }
    });
});

// ---------------------------------------------------------------------------
describe('THE MATCH & BETS CELL — a scorecard cell, not a ledger', () => {
    const sb = idx();
    const busy = {
        gameFormat: 'match', hole: 15,
        matchPillText: 'Manny 8&7', holeWinnerText: 'Halved',
        pressCount: 4
    };

    test('a 4-press hole renders ONE summary line, not one badge per press', () => {
        const html = cell(sb, busy);
        const pills = (html.match(/class="status-pill/g) || []).length;
        // Main match pill + hole winner pill. Nothing else.
        assert.equal(pills, 2, `expected 2 pills, got ${pills}: ${html}`);
        assert.equal((html.match(/match-press-summary/g) || []).length, 1);
        // BEHAVIOUR CHANGE: a bare count, with no status appended.
        const line = /<div class="match-press-summary">([^<]*)<\/div>/.exec(html);
        assert.ok(line, 'the summary line is missing');
        assert.equal(line[1], '4 presses');
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
        // Holes 13-18 of the audit fixture: every press has closed. Originally each of
        // those six rows reprinted "Bet 2 (Manny 6&5)" and friends verbatim. Now not
        // even the word "final" appears - only the count.
        const holes = [13, 14, 15, 16, 17, 18].map(h =>
            cell(sb, Object.assign({}, busy, { hole: h })));
        holes.forEach(html => {
            const line = /<div class="match-press-summary">([^<]*)<\/div>/.exec(html);
            assert.equal(line[1], '4 presses');
            assert.ok(!/6&5|6&4|4&2/.test(html.replace(/pill-main">[^<]*/, '')),
                'a closed press result was stamped again');
            assert.ok(!/\bfinal\b/i.test(line[1]), 'lifecycle language belongs in My Matches');
            assert.equal((html.match(/class="status-pill/g) || []).length, 2);
        });
        // Identical on every row: the card cannot grow a taller wall of history the
        // further down you read.
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

    // BEHAVIOUR CHANGE: the per-hole as-of engine re-run existed ONLY to work out where
    // the newest open press stood, for status text the Full Card no longer prints. The
    // count comes off the registry's start holes, so the re-run is gone entirely - not
    // merely gated. This is a stronger assertion than the gate it replaces.
    test('NO per-hole as-of engine re-run survives in the Full Card path', () => {
        const fn = code.slice(code.indexOf('function renderScorecard'));
        assert.ok(!/scoresThru/.test(fn), 'the truncated-scores rebuild is back');
        assert.ok(!/asOfMatchCalc|asOfSet/.test(fn), 'an as-of engine call is back');
        // Comments are stripped first: this must assert on CODE, not on prose that
        // happens to name the functions it is explaining the removal of.
        const row = fn.slice(fn.indexOf('courseData.forEach'))
            .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.ok(!/calculateMatchEngine\(/.test(row), 'the match engine is being re-run per hole');
        assert.ok(!/calculateStrokePressSet\(/.test(row), 'the stroke engine is being re-run per hole');
    });

    test('the press count is DERIVED from start holes, so it counts only running presses', () => {
        const fn = code.slice(code.indexOf('function renderScorecard'));
        assert.ok(/globalBets\.filter\(b => !b\.isPrimaryMatch && b\.startHole <= h\.hole\)\.length/.test(fn));
        assert.ok(/strokePressResults\.filter\(pr => pr\.startHole <= h\.hole\)\.length/.test(fn));
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
// A press counts on a hole when it has STARTED. Under an automatic press rule the
// engine creates the segment on the hole the trigger fires and sets its startHole to
// the NEXT hole, so an as-of segment count reports a press one hole before it begins.
// Deriving from startHole is both free and correct.
describe('PRESS COUNT — only presses that have actually started', () => {
    const sb = idx();

    function autoPressCounts() {
        const cd = makeCourseData(18);
        const P = makePlayers(['Manny', 'Marty', 'John'], [0, 6, 12]);
        P[0].team = 'Team 1'; P[1].team = 'Team 2'; P[2].team = 'Team 2';
        P.forEach(p => { p.playingForMoney = true; });
        const S = {};
        cd.forEach(h => P.forEach((p, pi) => {
            S[`p${p.id}_h${h.hole}`] = h.par - (pi === 0 ? 1 : 0) + (pi === 2 ? 1 : 0);
        }));
        vm.runInContext(`{
            var P = ${JSON.stringify(P)}, CD = ${JSON.stringify(cd)}, S = ${JSON.stringify(S)};
            var full = calculateMatchEngine(P, CD, S, 'net', 'match', '2down', 50, 0, []);
            var gb = buildBetEntries(full, CD);
            window.__pc = CD.map(function (h) {
                return {
                    hole: h.hole,
                    derived: gb.filter(function (b) { return !b.isPrimaryMatch && b.startHole <= h.hole; }).length,
                    starts: gb.filter(function (b) { return !b.isPrimaryMatch; }).map(function (b) { return b.startHole; })
                };
            });
        }`, sb);
        return sb.window.__pc;
    }

    test('a press is not counted on the hole BEFORE it starts', () => {
        const rows = autoPressCounts();
        const starts = rows[0].starts;
        assert.ok(starts.length > 0, 'the fixture must auto-generate presses');
        starts.forEach(sh => {
            const before = rows.find(r => r.hole === sh - 1);
            const on = rows.find(r => r.hole === sh);
            if (before) {
                assert.ok(before.derived < on.derived,
                    `a press starting on hole ${sh} was already counted on hole ${sh - 1}`);
            }
        });
    });

    test('the count never decreases as the round goes on', () => {
        const rows = autoPressCounts();
        rows.reduce((prev, r) => {
            assert.ok(r.derived >= prev, `count fell at hole ${r.hole}`);
            return r.derived;
        }, 0);
    });

    test('the count equals exactly the presses whose start hole has been reached', () => {
        const rows = autoPressCounts();
        rows.forEach(r => {
            assert.equal(r.derived, r.starts.filter(sh => sh <= r.hole).length);
        });
    });
});

// ---------------------------------------------------------------------------
describe('FROZEN — the surfaces that OWN press detail are untouched', () => {
    test('My Matches still names every press, with stake and start hole', () => {
        const bs = read('bet-strip.js');
        assert.ok(/Press #\$\{i \+ 1\}/.test(bs), 'My Matches must still name each press');
        assert.ok(/Started Hole \$\{seg\.startHole\}/.test(bs), 'and state its start hole');
        assert.ok(/rangeText: `Started Hole \$\{m\.startHole\}`/.test(bs));
        assert.ok(/matchChip\(bases\[0\], 'Main Bet'/.test(bs), 'the Bet Status strip is unchanged');
        assert.ok(/`Press #\$\{i \+ 1\}`/.test(bs));
    });

    test('My Matches still reports live press STATUS — the thing the Full Card gave up', () => {
        const bs = read('bet-strip.js');
        assert.ok(/statusText/.test(bs) && /AT STAKE/.test(bs));
        assert.ok(/strokeStatusWords|matchStatusWords/.test(bs),
            'the per-format status vocabulary must still live here');
    });

    test('the Receipt still tells the complete press history', () => {
        const st = read('settlement.html');
        const fn = st.slice(st.indexOf('function buildReceiptBlock'), st.indexOf('function buildSideMatchesHtml'));
        assert.ok(/receiptSegLabel\(seg\.label\)/.test(fn));
        assert.ok(/Started Hole \$\{seg\.startHole\}/.test(fn));
        assert.ok(/seg\.result/.test(fn));
        assert.ok(/MATCH NET/.test(fn));
    });

    test('press CREATION and start-hole logic were not touched', () => {
        const code = read('index.html');
        assert.ok(/function pressMatchBet/.test(code));
        assert.ok(/startHole: hNum \+ 1/.test(code), 'the engine still starts a press on the next hole');
        assert.ok(/function confirmMatchPress|function openPressPanel/.test(code));
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
        // Scoped to the function body rather than a fixed character window: fmtWhole
        // gained thousands-separator handling and a comment explaining it, which pushed
        // toFixed past an arbitrary 120-char cutoff without weakening the rule.
        const fn = live.slice(live.indexOf('function fmtWhole'), live.indexOf('function fmtSigned'));
        assert.ok(/toFixed\(2\)/.test(fn), 'the one permitted toFixed must live inside fmtWhole');
    });

    test('Final Results, Birdie Game and Match Net all use the shared rule', () => {
        const st = read('settlement.html');
        // The wording moved from "Won $X" to "+$X NET"; the rule is unchanged - Final
        // Results goes through fmtWhole and must not print cents.
        assert.ok(/\+\$\$\{fmtWhole\(amt\)\} NET/.test(st), 'Final Results must not print cents');
        assert.ok(/-\$\$\{fmtWhole\(Math\.abs\(amt\)\)\} NET/.test(st),
            'the negative branch must go through fmtWhole too');
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
