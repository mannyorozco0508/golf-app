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
    vm.runInContext("currentMode='ABCD'; currentData=__d; renderResultsGapLine(currentData); renderMoneyPoolSection(currentData, currentData.courseData, currentData.scores); renderCombinedSummary(currentData, currentData.courseData, currentData.scores); renderSettlement(currentData); renderReceiptScorecard();", sb);
    const raw = id => String(sb.document.getElementById(id).innerHTML || '');
    // v196: the roots are the seven mounts in screen order
    const roots = ['results-gap-line', 'results-top', 'money-pool-section', 'combined-settlement-summary', 'settle-content', 'results-net', 'receipt-scorecard'];
    return { sb, summary: raw('combined-settlement-summary'), top: raw('results-top'), net: raw('results-net'), pool: raw('money-pool-section'), all: roots.map(raw).join('\n') };
}

describe('PART 1 - no Final Results card; the NET list is the collapsed NET +/− view (v196), on every round', () => {
    // v195b dropped the "🏁 Final Results" NET list from a Weekly Game receipt so
    // the payer read PLAYER PAYOUTS. v196 goes further on every round: the payer
    // reads 💰 PAY OUT first, and the NET list survives as NET +/− - a collapsed
    // <details> in #results-net, last before the card, for the golfer who wants it.
    test('the pool round: no 🏁 Final Results card in any export root; Pay out first; NET +/− collapsed and last', () => {
        const r = receipt(poolRound());
        assert.doesNotMatch(r.all, /Final Results/);
        assert.match(r.top, /💰 Pay out/);
        assert.match(r.net, /^<details class="settle-card net-view print-open"><summary class="settle-header">Net \+\/−<\/summary>/);
        assert.match(r.net, /\d NET</, 'the NET lines live in the collapsed view');
        assert.doesNotMatch(r.top + r.summary + r.pool, /\d NET</, 'and nowhere else');
    });
    test('the match round (no Weekly Game): the same - no card, the NET +/− view with the lines', () => {
        const r = receipt(matchRound());
        assert.doesNotMatch(r.all, /🏁 Final Results/);
        assert.match(r.net, /Ann A<\/span><span class="val-pos">\+\$1[23] NET<\/span>/);   // $25 split across the two winners
    });
    test('the poolIsOn gate that chose the card is gone: one view for every round (source)', () => {
        assert.doesNotMatch(SRC, /const poolIsOn = !!\(data\.moneyPool && data\.moneyPool\.enabled !== false\);\s*if \(!poolIsOn\) \{/);
        assert.match(SRC, /if \(netMount\) netMount\.innerHTML = buildNetViewHtml\(sorted\);/);
    });
    test('the export roots are the mounts in screen order, the one list (RESULTS_MOUNTS)', () => {
        assert.match(SRC, /const roots = RESULTS_MOUNTS/);
    });
});

describe('PART 2 - the heading hierarchy (v196: section heads and game bands; the flight sub-heads became cards)', () => {
    const rule = sel => { const at = SRC.indexOf(sel + ' {'); assert.ok(at > -1, sel); return SRC.slice(at, SRC.indexOf('}', at)); };
    const rem = css => { const m = /font-size:\s*([\d.]+)rem/.exec(css); return m ? parseFloat(m[1]) : null; };
    const printBlock = SRC.slice(SRC.indexOf('@media print {'), SRC.indexOf('\n    </style>', SRC.indexOf('@media print {')));
    test('section heads (.settle-header) 1.2rem, bold, a 2px green rule, air above; a game card\'s title (.game-title) the same size, on its band', () => {
        const css = rule('.settle-header');
        assert.equal(rem(css), 1.2); assert.match(css, /font-weight: bold/); assert.match(css, /border-bottom: 2px solid var\(--brand-green\)/);
        assert.equal(rem(rule('.game-title')), 1.2); assert.match(rule('.game-title'), /font-weight: bold/);
        assert.match(rule('.game-head'), /background: var\(--brand-green\); color: #fff;/);
        assert.match(SRC, /\.settle-card \{ margin-top: 22px; \}/);
        assert.doesNotMatch(SRC, /\.pool-flight-head \{|\.pool-game-head \{|\.pool-payouts \.pp-game-head \{/, 'the retired heads have no rules');
    });
    test('rows stay under the heads: .ledger-row 0.95rem; the pot cell 1rem; the Pay out amount larger than either', () => {
        assert.equal(rem(rule('.ledger-row')), 0.95);
        assert.equal(rem(rule('.game-pot')), 1);
        assert.ok(rem(rule('.po-amt')) > rem(rule('.game-pot')));
    });
    test('print keeps the hierarchy: 14pt sections and titles, 11.5pt pots, 9.5pt rows, rules and air', () => {
        assert.match(printBlock, /\.settle-header \{ font-size: 14pt; border-bottom: 2px solid #0f4c3a;[^}]*margin-top: 14pt; \}/);
        assert.match(printBlock, /\.game-title, \.po-head, \.net-view > summary \{ font-size: 14pt; \}/);
        assert.match(printBlock, /\.game-pot, \.po-total, \.po-amt \{ font-size: 11\.5pt; \}/);
        assert.match(printBlock, /\.ledger-row \{ font-size: 9\.5pt; \}/);
        assert.match(printBlock, /\.settle-card \{ margin-top: 18px; \}/);
    });
    test('every section on a pool receipt carries one of the heading classes (the rendered markup: Pay out, the Weekly Game label, KP, Net Finish, Skins — Flight A / B, Net +/−)', () => {
        const d = poolRound(); d.flights = { enabled: true, scopes: { skins: 'flight', birdies: 'field' } }; d.players.forEach((p, i) => { p.flight = i < 6 ? 'A' : 'B'; });
        const r = receipt(d);
        assert.match(r.all, /<div class="settle-header po-head"><span>💰 Pay out<\/span>/);
        assert.match(r.all, /<div class="results-section-label">🏆 Weekly Game<\/div>/);
        ['📍 KP', '🥇 Net Finish', '🥩 Skins — Flight A', '🥩 Skins — Flight B'].forEach(h => assert.match(r.all, new RegExp('<span class="game-title">' + h + '</span>'), h));
        assert.match(r.all, /<summary class="settle-header">Net \+\/−<\/summary>/);
        assert.doesNotMatch(r.all, /pp-game-head|pool-game-head|pool-flight-head|Skins Pot/);
    });
});
