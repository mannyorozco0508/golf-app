// ============================================================================
// v195b — THE RESULTS PAGE FOR A PAYER (2026-09-22)
//
// PART 1. On a Weekly Game round the "🏁 Final Results" card (a per-golfer
// "+$65 NET / -$38 NET" list) is gone from the Results page AND the printed
// Receipt / PDF - the card is simply not rendered, so it is in no export root.
// Buy-ins are collected in cash on the first tee; the payer needs PLAYER
// PAYOUTS. On a round WITHOUT the Weekly Game (a match, a Nassau, skins
// wagers) the net list IS the settlement and stays.
//
// PART 2. Three type sizes, top down, each with a rule under it and air above:
//   section  .settle-header / .pp-game-head / .pool-game-head   1.2rem, 2px rule
//   sub      .pp-flight-head / .pool-flight-head                 1rem,   1px rule
//   row      .ledger-row (0.95rem) / .pp-row                     under both
// Print keeps the hierarchy (14pt / 11.5pt / 9.5pt). No markup, number or
// row changed - the rendered-markup goldens hold by sha; this is CSS.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('settlement.html');
const CD = makeCourseData(18);
const P4 = makePlayers(['Ann A', 'Ben B', 'Cal C', 'Dee D'], [0, 0, 0, 0], 101);
function matchRound() {   // a 2v2 $25 gross match, Ann birdies every third hole - no Weekly Game
    const scores = {};
    P4.forEach((p, i) => CD.forEach(h => { scores['p' + p.id + '_h' + h.hole] = h.par + ((i === 0 && h.hole % 3 === 0) ? -1 : 0); }));
    return { eventName: 'Measure', players: P4, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        sideMatches: { m: { format: 'match', scoring: 'gross', stake: 25, startHole: 1, createdAt: 1, teamAIds: ['101', '103'], teamBIds: ['102', '104'] } },
        scoresVerified: { verified: true, verifiedAt: 1, verifiedBy: 'round' } };
}
const NAMES12 = ['Marty', 'Scott', 'Carp', 'Randy', 'Manny', 'Matt B', 'Lance', 'Kopp', 'Marcus', 'Rocco', 'Matt H', 'Jeremy'];
function poolRound() {
    const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const ps = NAMES12.map((n, i) => ({ id: 101 + i, name: n, hcp: '9', playingForMoney: true }));
    const sc = {};
    ps.forEach((p, pi) => cd.forEach((h, hi) => { sc['p' + p.id + '_h' + h.hole] = 4 + ((pi + hi) % 3) - 1; }));
    return { eventName: 'KP', players: ps, courseData: cd, scores: sc, gameFormat: 'stroke', settlementMode: 'whole-dollar',
        kpWinners: { h3: '101', h7: '105', h12: '109', h16: '102' },
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7, 12, 16] }, net: { amount: 70, places: [57.142857, 42.857143] }, skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
        scoresVerified: { verified: true, verifiedAt: 1, verifiedBy: 'organizer' } };
}
// The page's own load sequence on a stubbed round, then every export root's markup.
function receipt(d) {
    const sb = loadHtmlInlineScript('settlement.html');
    sb.__d = d;
    vm.runInContext("currentMode='ABCD'; currentData=__d; renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores); renderCombinedSummary(currentData, currentData.courseData, currentData.scores); renderSettlement(currentData); renderReceiptScorecard();", sb);
    const raw = id => String(sb.document.getElementById(id).innerHTML || '');
    const roots = ['receipt-export-head', 'settle-content', 'money-pool-section', 'combined-settlement-summary', 'receipt-scorecard'];
    return { sb, summary: raw('combined-settlement-summary'), all: roots.map(raw).join('\n') };
}

describe('PART 1 - no Final Results net list on a Weekly Game round', () => {
    test('the pool round: no 🏁 Final Results, no "NET" line, on screen or in any export root; Player Payouts is there', () => {
        const r = receipt(poolRound());
        assert.doesNotMatch(r.all, /Final Results/);
        assert.doesNotMatch(r.all, /\d NET</);
        assert.match(r.all, /Player Payouts/);
        assert.match(r.all, /Who Pays Who|pl-block/, 'the per-golfer ledger and payouts remain');
    });
    test('CONTROL - the match round (no Weekly Game): 🏁 Final Results with the NET lines, as before', () => {
        const r = receipt(matchRound());
        assert.match(r.summary, /<div class="settle-header">🏁 Final Results<\/div>/);
        assert.match(r.summary, /Ann A<\/span><span class="val-pos">\+\$1[23] NET<\/span>/);   // $25 split across the two winners
    });
    test('the gate is the Weekly Game switch, not the pool\'s presence: a DISABLED pool on the match round keeps the card', () => {
        const d = matchRound(); d.moneyPool = { enabled: false, buyIn: 40, kp: { amount: 100, holes: [3] }, net: { amount: 0 }, skins: { mode: 'none' } };
        assert.match(receipt(d).summary, /Final Results/);
    });
    test('the export roots are the same five the Send button reads (source)', () => {
        assert.match(SRC, /const roots = \['receipt-export-head', 'settle-content', 'money-pool-section',/);
        assert.match(SRC, /const poolIsOn = !!\(data\.moneyPool && data\.moneyPool\.enabled !== false\);\s*if \(!poolIsOn\) \{/);   // (weekly_game_everywhere_test forbids a weeklyGame-shaped name: the stored key is moneyPool)
    });
});

describe('PART 2 - the heading hierarchy', () => {
    const rule = sel => { const at = SRC.indexOf(sel + ' {'); assert.ok(at > -1, sel); return SRC.slice(at, SRC.indexOf('}', at)); };
    const rem = css => { const m = /font-size:\s*([\d.]+)rem/.exec(css); return m ? parseFloat(m[1]) : null; };
    const printBlock = SRC.slice(SRC.indexOf('@media print {'), SRC.indexOf('\n    </style>', SRC.indexOf('@media print {')));
    test('section heads (.settle-header, .pp-game-head, .pool-game-head): 1.2rem, bold, a 2px green rule, air above', () => {
        ['.settle-header', '.pool-payouts .pp-game-head', '.pool-game-head'].forEach(sel => {
            const css = rule(sel);
            assert.equal(rem(css), 1.2, sel); assert.match(css, /font-weight: bold/, sel);
            assert.match(css, /border-bottom: 2px solid var\(--brand-green\)/, sel);
            assert.match(css, /margin(-top)?: (18px|0 0 12px 0|22px)/, sel + ' spacing');
        });
        assert.match(SRC, /\.settle-card \{ margin-top: 22px; \}/);
    });
    test('sub heads (.pp-flight-head, .pool-flight-head): 1rem, bold, a 1px teal rule - larger than rows, smaller than Skins', () => {
        ['.pool-payouts .pp-flight-head', '.pool-flight-head'].forEach(sel => {
            const css = rule(sel);
            assert.equal(rem(css), 1, sel); assert.match(css, /font-weight: bold/, sel); assert.match(css, /border-bottom: 1px solid var\(--accent-teal\)/, sel);
        });
        assert.ok(rem(rule('.pool-payouts .pp-flight-head')) < rem(rule('.pool-payouts .pp-game-head')));
    });
    test('rows stay under both: .ledger-row 0.95rem; no row size moved', () => {
        assert.equal(rem(rule('.ledger-row')), 0.95);
        assert.ok(rem(rule('.ledger-row')) < rem(rule('.pool-payouts .pp-flight-head')));
        assert.match(rule('.pool-payouts .pp-row'), /^\.pool-payouts \.pp-row \{ padding: 8px 12px; margin-bottom: 6px; $/m);
    });
    test('print keeps the hierarchy: 14pt sections, 11.5pt sub-heads, 9.5pt rows, rules and air', () => {
        assert.match(printBlock, /\.settle-header, \.pool-game-head, \.pool-payouts \.pp-game-head \{ font-size: 14pt; border-bottom: 2px solid #0f4c3a;[^}]*margin-top: 14pt; \}/);
        assert.match(printBlock, /\.pool-flight-head, \.pool-payouts \.pp-flight-head \{ font-size: 11\.5pt; border-bottom: 1px solid #2a9d8f;[^}]*margin-top: 8pt; \}/);
        assert.match(printBlock, /\.ledger-row, \.pool-payouts \.pp-row \{ font-size: 9\.5pt; \}/);
        assert.match(printBlock, /\.settle-card \{ margin-top: 18px; \}/);
    });
    test('every section on a pool receipt carries one of the heading classes (the rendered markup: Player Payouts, Weekly Game, KP, Net Finish, Skins, Flight A / B)', () => {
        const d = poolRound(); d.flights = { enabled: true, scopes: { skins: 'flight', birdies: 'field' } }; d.players.forEach((p, i) => { p.flight = i < 6 ? 'A' : 'B'; });
        const r = receipt(d);
        assert.match(r.all, /<div class="settle-header">💰 Player Payouts<\/div>|<div class="settle-header">💰 Player Payouts<\/div>/);
        assert.match(r.all, /class="settle-header">🏆 Weekly Game — \$480</);
        ['Skins', 'Net Finish', 'KP'].forEach(h => assert.match(r.all, new RegExp('<div class="pp-game-head">' + h + '</div>'), h));
        assert.match(r.all, /<div class="pp-flight-head">Flight A<\/div>/); assert.match(r.all, /<div class="pp-flight-head">Flight B<\/div>/);
        assert.match(r.all, /class="pool-game-head">🥩 Skins Pot/); assert.match(r.all, /class="pool-flight-head"/);
    });
});
