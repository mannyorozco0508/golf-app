// ============================================================================
// LIVE SKINS GOLDEN - the rendered live-skins output of the three surfaces,
// frozen to the byte, BEFORE the ledger-config wave touched any of them.
//
// THE SURFACES
//   index.html        renderSkinsWidgetHtml()  (the scorecard's SKINS WON card)
//                     renderSkinsWonHtml()     (the Finish Round SKINS WON list)
//                     renderLiveSkins()        (the live-skins mount, hole-by-hole open)
//   leaderboard.html  renderLiveSkinsBoard()   (#live-skins-mount, via renderBoard)
//   settlement.html   buildLiveResultsHtml()   (LIVE RESULTS incl. SKINS WON cards)
//
// THE ROUNDS
//   flat-main         flightless; a MAIN-FORMAT gross skins wager at $8
//   flighted-stacked  flights ON (skins per flight); a STACKED gross skins wager
//                     at $5; the round itself carries no skinsPotFormat and
//                     skinsBuyIn 0, exactly as the wizard writes a stroke round
//   pool-only         flights ON; NO wager; the Main Pool skins bucket, GROSS,
//                     $60 fixed, no carry
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. The fixture is what the surfaces
// rendered on 2026-09-13 before the change. flat-main must never move: a
// flightless main-format wager is the shape every round before flights had.
// flighted-stacked and pool-only were frozen KNOWING they are wrong today (NET
// under a gross wager; NET per flight for a gross field-wide pot) - so that the
// change to them is a visible, reviewed diff and not a silent one. When the
// wave re-pins them, the header comment records what moved and why.
//
// HARNESS. mini-dom does not parse innerHTML; every surface is read back as the
// HTML string the page wrote, which is precisely what is frozen.
//
// RE-PINNED 2026-09-13, the ledger-config wave (live-skins.js). flat-main: all
// five surfaces UNCHANGED, sha for sha (41ab5a0f, 40499e0f, f6027a6c, c4ab12cd,
// a64018191). What moved, and why:
//   flighted-stacked  index.skinsWon    Flight A only -> every flight listed
//                     index.liveMount   NET SKINS -> GROSS SKINS · $20 (the
//                                       wager's own mode and its $5 x 4 pot)
//                     leaderboard       the cards' basis word Net -> Gross
//                     index.widget, settlement: unchanged (hcp 0 all round, so
//                                       the net and gross ledgers name the same
//                                       winners; only the basis word differed)
//   pool-only         every index surface and the leaderboard now render the
//                     FIELD-WIDE GROSS ledger: no flight heads, WHOLE-FIELD
//                     GROSS SKINS · NO CARRY, the pool bucket's winners (Ann
//                     H1, Ben H3, Fay H5, Gus H7, Hal H9, Eli H11 - H2 and H13
//                     tie across the field). Identical to flat-main's widget
//                     and leaderboard sha for sha, as a gross field-wide pot on
//                     the same scores should be. settlement: one SKINS WON
//                     card, no flight, the same winners.
// Before the change flighted-stacked and pool-only were IDENTICAL on every
// surface (the same five shas) - the one-line proof no surface read a config.
//
// RE-PINNED 2026-09-13, the MAIN POOL SKINS PER FLIGHT wave (pool-engine.js,
// live-skins.js). flat-main and flighted-stacked: UNCHANGED, sha for sha (the
// diff of the fixture is the pool-only block only). What moved, and why:
//   pool-only         the round's skins scope is per flight, so the bucket now
//                     SPLITS into a pot per flight and each pot resolves on its
//                     own golfers. Every surface: WHOLE-FIELD -> FLIGHT A /
//                     FLIGHT B heads. Winners: A = Ann H1 H2, Ben H3;
//                     B = Eli H2 H11, Gus H7 H13, Fay H5, Hal H9. H2 (Ann v
//                     Eli) was a field-wide tie and is a skin in BOTH flights;
//                     H13 (Cal, Dee, Gus) was a field-wide tie, still a tie in
//                     A, Gus's skin in B. settlement: two SKINS WON cards.
//                     The same pool on a scope-'field' round keeps the old
//                     shape - live_skins_config_test's POOL_FIELD block.
//
// RE-PINNED 2026-09-14, the RESULTS SECTIONING wave (settlement.html only):
// settlement.liveResults moved on all three rounds - the SKINS WON cards now
// carry class "skins-card" and per-flight cards carry data-flight - and NOTHING
// else did (the four index/leaderboard surfaces are sha-identical; the
// tag-stripped text of liveResults is identical on every round, checked
// against the previous fixture before this re-pin).
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const FIXTURE = path.join(__dirname, 'live_skins_golden.fixture.json');

// 8 golfers, hcp 0, tagged A/A/A/A/B/B/B/B (the tags are inert on a flightless
// round). Birdies: Ann h1 h2, Ben h3, Eli h2, Fay h5, Gus h7, Hal h9, Eli h11;
// Cal, Dee and Gus all birdie h13 (a tie in A, a skin for Gus in B). 17 holes in.
const P = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'], [0, 0, 0, 0, 0, 0, 0, 0], 101,
    ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B']);
const SCORES = (() => {
    const s = {};
    P.forEach(p => CD.slice(0, 17).forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; }));
    const b = (i, h) => { s[`p${P[i].id}_h${h}`] = CD[h - 1].par - 1; };
    b(0, 1); b(0, 2); b(1, 3); b(4, 2); b(5, 5); b(6, 7); b(7, 9); b(4, 11); b(2, 13); b(3, 13); b(6, 13);
    return s;
})();
const ON = { enabled: true, scopes: { skins: 'flight', birdies: 'field' } };
const ROUNDS = {
    'flat-main': { players: P, gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'gross', skinsCarryOver: false,
        courseData: CD, scores: SCORES, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar' },
    'flighted-stacked': { players: P, gameFormat: 'stroke', skinsBuyIn: 0, skinsCarryOver: false, flights: ON,
        additionalGames: { skins: { enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: false, startHole: 1 } },
        courseData: CD, scores: SCORES, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar' },
    'pool-only': { players: P, gameFormat: 'stroke', skinsBuyIn: 0, skinsCarryOver: false, flights: ON,
        moneyPool: { enabled: true, buyIn: 20, kp: { amount: 0, holes: [] }, net: { amount: 100, places: [100] },
            skins: { mode: 'fixed', amount: 60, scoring: 'gross', carryOver: false } },
        courseData: CD, scores: SCORES, settlementMode: 'whole-dollar' }
};
const J = (v) => JSON.parse(JSON.stringify(v));

function renderAll(data) {
    const out = {};
    const ix = loadHtmlInlineScript('index.html', [], { search: '?game=GOLD1' });
    ix.__d = J(data);
    vm.runInContext('currentData = __d; liveSkinsOpen = true; document.__mount(document.getElementById("live-skins-mount"));', ix);
    out['index.widget'] = String(vm.runInContext('renderSkinsWidgetHtml()', ix));
    out['index.skinsWon'] = String(vm.runInContext('renderSkinsWonHtml()', ix));
    vm.runInContext('renderLiveSkins()', ix);
    out['index.liveMount'] = String(vm.runInContext("document.getElementById('live-skins-mount').innerHTML", ix));

    const lb = loadHtmlInlineScript('leaderboard.html');
    lb.__d = J(data);
    vm.runInContext("currentMode = 'GOLD1'; currentBoardData = __d; activeView = 'individual'; activeScoring = 'net';"
        + " document.__mount(document.getElementById('live-skins-mount')); renderBoard();", lb);
    out['leaderboard.liveSkins'] = String(vm.runInContext("document.getElementById('live-skins-mount').innerHTML || ''", lb));

    const st = loadHtmlInlineScript('settlement.html');
    st.__d = J(data);
    vm.runInContext('currentMode = "GOLD1";', st);
    out['settlement.liveResults'] = String(vm.runInContext('buildLiveResultsHtml(__d, __d.courseData, __d.scores)', st));
    return out;
}

if (process.env.LIVE_SKINS_GOLDEN_WRITE === '1') {
    const fx = { capturedAt: new Date().toISOString(), rounds: {} };
    Object.keys(ROUNDS).forEach(k => {
        const r = renderAll(ROUNDS[k]);
        fx.rounds[k] = { html: r, sha256: Object.fromEntries(Object.keys(r).map(s => [s, sha(r[s])])) };
    });
    fs.writeFileSync(FIXTURE, JSON.stringify(fx, null, 2) + '\n');
    console.log('wrote ' + FIXTURE);
}

const FX = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

describe('LIVE SKINS GOLDEN - three rounds, five rendered surfaces, to the byte', () => {
    Object.keys(ROUNDS).forEach(k => {
        const got = renderAll(ROUNDS[k]);
        const exp = FX.rounds[k];
        Object.keys(exp.html).forEach(surface => {
            test(`${k} / ${surface}`, () => {
                assert.equal(sha(got[surface]), exp.sha256[surface], 'sha moved');
                assert.equal(got[surface], exp.html[surface]);
            });
        });
        test(`${k}: every surface rendered something (the golden is not vacuous)`, () => {
            Object.keys(exp.html).forEach(surface => {
                assert.ok(exp.html[surface].length > 200, surface + ': ' + exp.html[surface].length + ' chars');
                assert.match(exp.html[surface], /SKINS/i, surface + ' mentions skins');
            });
        });
    });
    test('the fixture froze the three rounds and five surfaces named above', () => {
        assert.deepEqual(Object.keys(FX.rounds).sort(), Object.keys(ROUNDS).sort());
        Object.keys(FX.rounds).forEach(k => assert.deepEqual(Object.keys(FX.rounds[k].html).sort(),
            ['index.liveMount', 'index.skinsWon', 'index.widget', 'leaderboard.liveSkins', 'settlement.liveResults']));
    });
});
