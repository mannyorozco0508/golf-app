// ============================================================================
// FLIGHTS - WAVE 2, STEP 7: THE (A)/(B) LABELS ON THE PLAYER PAYOUTS LEDGER
//
// A ledger line earned inside a flight says which one - "Skins (A) +$13",
// "Birdie Pool (B) +$2" - under each golfer on settlement.html's Player Payouts.
// The suffix is PRESENTATION: settlement-engine.js still writes 'Skins' and
// 'Birdie Pool' (the flightless golden pins those strings to the byte), and
// settlement.html adds the flight beside a label only when the round scopes
// THAT wager per flight. A field-wide birdie game on a flighted round stays
// "Birdie Pool" because it was paid across the whole field. Final Results and
// Who Pays Who carry no badge - a total is a total.
//
// THE USER'S PATH. Every rendering test here arrives the way a golfer does:
// settlement.html is loaded with ?game=CODE, and the page's OWN value handler
// is fired with the round. Nothing calls renderCombinedSummary or the ledger
// builder by name. (CLAUDE.md: a test that calls the function proves the
// function, not the feature.)
//
// WHAT THE HARNESS CANNOT PROVE. mini-dom does not parse innerHTML, so the
// ledger is read back out of the container's HTML string with a regex, exactly
// as player_payouts_render_test.js does. That is enough for "which words are
// in the label"; it says nothing about layout.
//
// THE FLIGHTLESS PROOF. The engine's labels on a flightless round are pinned
// by flights_absent_golden_test.js (contributions, to the byte - 'Skins',
// 'Birdie Pool', no suffix). The RENDERED ledger is not in that golden; the
// test below pins that the rendered labels on the golden round are the
// engine's labels verbatim, so a suffix on a flightless round would show as a
// label the engine never wrote.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const DEPS = ['money-engine.js', 'action-model.js', 'pool-engine.js', 'settlement-engine.js', 'score-marks.js'];
const CD = makeCourseData(18);
const J = (v) => JSON.parse(JSON.stringify(v));
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// The Step 1 golden round: eight golfers, $8 split skins, $2 gross birdies,
// odd-dollar, no flights. The same players and scores, tagged A/A/A/A/B/B/B/B,
// are the flighted rounds.
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'flights_absent_golden.fixture.json'), 'utf8'));
const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];
const HCPS = [2, 9, 15, 4, 20, 7, 11, 0];
// HOLE 18 IS PLAYED HERE. The golden stops at 17 so its ledger can show a pending
// skin; settlement.html shows LIVE RESULTS, not the receipt, until every card is
// in. Hole 18 is par for everybody - a tie, no skin, no birdie - so the engine's
// contribution lines are the golden's to the byte (asserted below, not assumed).
const scoresFor = (players) => {
    const s = {};
    players.forEach(p => CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; }));
    const birdie = (idx, hole) => { s[`p${players[idx].id}_h${hole}`] = CD[hole - 1].par - 1; };
    birdie(0, 2); birdie(0, 9); birdie(1, 5); birdie(2, 14); birdie(6, 11); birdie(3, 13); birdie(7, 13);
    return s;
};
function round(flights, tags) {
    const players = makePlayers(NAMES, HCPS, 101, tags);
    const data = { players, gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'split', skinsCarryOver: false,
        birdieGameEnabled: true, birdieUnitVal: 2, birdieScoringType: 'gross', courseData: CD, scores: scoresFor(players),
        settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar' };
    if (flights !== undefined) data.flights = flights;
    return data;
}
const TAGS = ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'];
const FLIGHT_OF = { Ann: 'A', Ben: 'A', Cal: 'A', Dee: 'A', Eli: 'B', Fay: 'B', Gus: 'B', Hal: 'B' };

// ARRIVE. ?game=FLT7, then the page's own listener fires with the round.
function arrive(data) {
    const sb = loadHtmlInlineScript('settlement.html', DEPS, { search: '?game=FLT7' });
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value' && h.path === 'events/FLT7');
    assert.equal(handlers.length, 1, 'the page registered exactly one value handler for the round');
    handlers.forEach(h => h.cb({ val: () => J(data) }));
    return sb.document.getElementById('combined-settlement-summary').innerHTML;
}

// The three sections of the combined summary, split on their headers.
function sections(html) {
    const pay = html.indexOf('Player Payouts');
    const wpw = html.indexOf('\uD83E\uDD1D', pay);
    assert.ok(pay > 0, 'Player Payouts rendered');
    return { results: html.slice(0, pay), payouts: html.slice(pay, wpw > 0 ? wpw : undefined), whoPays: wpw > 0 ? html.slice(wpw) : '' };
}
// { Ann: ['Skins (A)', 'Birdie Pool (A)', 'TOTAL PAYOUT'], ... }
function labels(payoutsHtml) {
    const out = {};
    payoutsHtml.split('<div class="pl-block">').slice(1).forEach(b => {
        const name = (b.match(/pl-name">([^<]*)</) || [])[1];
        out[name] = [...b.matchAll(/<div class="pl-row[^"]*"><span>([^<]*)<\/span>/g)].map(m => m[1]);
    });
    return out;
}
const ENGINE = (() => loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']))();

describe('7.1 a wager scoped per flight is labelled with the golfer\'s flight', () => {
    const data = round({ enabled: true, scopes: { skins: 'flight', birdies: 'flight' } }, TAGS);
    const html = arrive(data);
    const S = sections(html);
    const L = labels(S.payouts);

    test('every golfer\'s block rendered', () => {
        assert.deepEqual(Object.keys(L).sort(), NAMES.slice().sort());
    });
    test('each payout line under a golfer carries THEIR flight: "Skins (A)" for A, "Birdie Pool (B)" for B', () => {
        let skinsSeen = 0, birdiesSeen = 0;
        NAMES.forEach(nm => {
            const f = FLIGHT_OF[nm];
            L[nm].forEach(label => {
                if (label === 'TOTAL PAYOUT' || label === 'No payout') return;
                if (/^Skins/.test(label)) { skinsSeen++; assert.equal(label, 'Skins (' + f + ')', nm); }
                else if (/^Birdie Pool/.test(label)) { birdiesSeen++; assert.equal(label, 'Birdie Pool (' + f + ')', nm); }
                else assert.fail(nm + ' has an unexpected line: ' + label);
            });
        });
        // Positive: the round actually paid skins and birdies in BOTH flights.
        assert.ok(skinsSeen >= 2, 'skins lines rendered: ' + skinsSeen);
        assert.ok(birdiesSeen >= 2, 'birdie lines rendered: ' + birdiesSeen);
        const withB = NAMES.filter(nm => L[nm].some(l => / \(B\)$/.test(l)));
        const withA = NAMES.filter(nm => L[nm].some(l => / \(A\)$/.test(l)));
        assert.ok(withA.length > 0 && withA.every(nm => FLIGHT_OF[nm] === 'A'), 'A labels only under A golfers: ' + withA);
        assert.ok(withB.length > 0 && withB.every(nm => FLIGHT_OF[nm] === 'B'), 'B labels only under B golfers: ' + withB);
    });
    test('the amounts beside the labels are the engine\'s own contribution lines, unchanged', () => {
        const c = ENGINE.computeCombinedNetTotals(data, CD, data.scores);
        NAMES.forEach(nm => {
            const engineWins = J(c.contributions[nm.toLowerCase()].lines).filter(l => l.amount > 0.005)
                .map(l => l.label + ' (' + FLIGHT_OF[nm] + ')');
            const shown = L[nm].filter(l => l !== 'TOTAL PAYOUT' && l !== 'No payout');
            assert.deepEqual(shown, engineWins, nm);
        });
    });
    test('the badge is on the per-line ledger ONLY: Final Results totals and Who Pays Who carry none', () => {
        assert.ok(/Final Results|FINAL RESULTS/i.test(S.results), 'Final Results rendered');
        assert.ok(!/\((A|B)\)/.test(S.results), 'no (A)/(B) in Final Results');
        assert.ok(S.whoPays.length > 0, 'Who Pays Who rendered');
        assert.ok(!/\((A|B)\)/.test(S.whoPays), 'no (A)/(B) in Who Pays Who');
        assert.ok(/\((A|B)\)/.test(S.payouts), 'and the ledger does carry them');
    });
});

describe('7.1 a FIELD-WIDE wager on a flighted round gets NO label', () => {
    // Skins per flight, birdies across the field.
    const data = round({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } }, TAGS);
    const L = labels(sections(arrive(data)).payouts);

    test('"Skins (A)"/"Skins (B)" beside plain "Birdie Pool" under the same golfers', () => {
        let skins = 0, birdies = 0;
        NAMES.forEach(nm => L[nm].forEach(label => {
            if (/^Skins/.test(label)) { skins++; assert.equal(label, 'Skins (' + FLIGHT_OF[nm] + ')', nm); }
            if (/^Birdie Pool/.test(label)) { birdies++; assert.equal(label, 'Birdie Pool', nm + ': a field-wide birdie game is paid across the field and says so by carrying no flight'); }
        }));
        assert.ok(skins >= 2 && birdies >= 1, 'both wagers paid somebody: skins ' + skins + ', birdies ' + birdies);
    });
    test('the mirror: skins across the field, birdies per flight', () => {
        const d2 = round({ enabled: true, scopes: { skins: 'field', birdies: 'flight' } }, TAGS);
        const L2 = labels(sections(arrive(d2)).payouts);
        let skins = 0, birdies = 0;
        NAMES.forEach(nm => L2[nm].forEach(label => {
            if (/^Skins/.test(label)) { skins++; assert.equal(label, 'Skins', nm); }
            if (/^Birdie Pool/.test(label)) { birdies++; assert.equal(label, 'Birdie Pool (' + FLIGHT_OF[nm] + ')', nm); }
        }));
        assert.ok(skins >= 1 && birdies >= 2, 'both wagers paid somebody: skins ' + skins + ', birdies ' + birdies);
    });
});

describe('7.1 a FLIGHTLESS round renders the engine\'s labels verbatim', () => {
    test('flights absent: no (A)/(B) anywhere in the summary; every rendered label is one the golden engine wrote', () => {
        const data = round(undefined, undefined);
        const html = arrive(data);
        assert.ok(!/\((A|B)\)/.test(html), 'no flight suffix on a flightless round');
        const L = labels(sections(html).payouts);
        const E = FIX.engine.contributions;
        // The 18-hole round's engine lines ARE the golden's 17-hole lines.
        assert.deepEqual(J(ENGINE.computeCombinedNetTotals(data, CD, data.scores).contributions), E);
        NAMES.forEach(nm => {
            const shown = L[nm].filter(l => l !== 'TOTAL PAYOUT' && l !== 'No payout');
            const golden = E[nm.toLowerCase()].lines.filter(l => l.amount > 0.005).map(l => l.label);
            assert.deepEqual(shown, golden, nm);
        });
        // Positive: the golden round pays lines, so "no suffix" is not vacuous.
        assert.ok(Object.values(L).some(ls => ls.includes('Skins')), 'a plain "Skins" line rendered');
        assert.ok(Object.values(L).some(ls => ls.includes('Birdie Pool')), 'a plain "Birdie Pool" line rendered');
    });
    test('flights { enabled: false }: identical to absent', () => {
        const a = arrive(round(undefined, undefined));
        const b = arrive(round({ enabled: false }, undefined));
        assert.equal(a, b);
        assert.ok(!/\((A|B)\)/.test(b));
    });
});

describe('7.1 the seam: the suffix is presentation in settlement.html, gated on the resolver; the engine strings are untouched', () => {
    const src = read('settlement.html');
    test('flightLabelSuffix reads flightScopeApplies() per scope and playerFlight() per golfer, and never a note line', () => {
        const at = src.indexOf('function flightLabelSuffix(');
        assert.ok(at > 0);
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.match(fn, /flightScopeApplies\(data, rule\.scope\)/);
        assert.match(fn, /playerFlight\(p\)/);
        assert.match(fn, /line\.note/);
    });
    test('the ONE line output in buildPlayerLedgerHtml carries the suffix; the caller hands the round in', () => {
        assert.match(src, /\$\{l\.label\}\$\{flightLabelSuffix\(data, c\.name, l\)\}/);
        assert.match(src, /buildPlayerLedgerHtml\(contributions, sorted, data\)/);
    });
    test('settlement-engine.js writes no flight into a contribution label', () => {
        const eng = read('settlement-engine.js');
        const at = eng.indexOf('function computeCombinedNetTotals(');
        const fn = eng.slice(at, eng.indexOf('\nfunction ', at + 30));
        assert.ok(fn.length > 2000, 'the combiner was found: ' + fn.length);
        assert.ok(!/playerFlight|\(A\)|\(B\)/.test(fn), 'labels are the engine\'s plain strings; the flight is added on the page');
    });
});
