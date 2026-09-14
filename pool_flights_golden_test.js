// ============================================================================
// MAIN POOL SKINS BUCKET - GOLDEN, frozen BEFORE the per-flight split.
//
// A pool round with a skins bucket, built from helpers/wizard-saved-round.js
// (the shape the wizard writes), in three variants:
//   off     flights absent
//   field   flights on, skins scope 'field'
//   flight  flights on, skins scope 'flight' - TODAY'S behaviour frozen: the
//           bucket was one field-wide pot regardless, so this variant was
//           identical to `field` on every surface. It is frozen KNOWING it
//           changes, so the change is a reviewed diff and not a silent one.
// What is frozen per variant: the pool engine's skins object (lines and
// dollars), perPlayerCents and refund; the Receipt's whole Main Pool section;
// every live skins surface (index widget / Finish Round list / hole-by-hole
// mount, leaderboard live skins, settlement LIVE RESULTS) - as HTML strings and
// sha256.
//
// `off` and `field` must never move. `flight` is re-pinned by the wave that
// splits the bucket, with the header saying what moved.
//
// RE-PINNED 2026-09-13, the MAIN POOL SKINS PER FLIGHT wave (pool-engine.js,
// live-skins.js, settlement.html). off and field: engine and all six surfaces
// UNCHANGED, sha for sha, against the copy taken before the change. flight:
//   engine   BEFORE one field-wide pot: 6 skins - H1 Ann $37, H5 Cal $37,
//            H7 Ned $37, H9 Dee $37, H11 Oli $36, H16 Quy $36 (H2 and H13
//            ties across the field). AFTER the $220 bucket splits by
//            headcount: A $115 (12 golfers), B $105 (11); A pays H1 Ann, H2
//            Ben, H5 Cal, H9 Dee, H13 Eli at $23 each; B pays H2 Max, H7 Ned,
//            H11 Oli, H13 Pat, H16 Quy at $21 each. 115 + 105 = 220, no
//            refund, nothing unwon. KP $40 and net $200 untouched.
//   Receipt  the Skins Pot header keeps its line; under it a "Split by
//            flight, by headcount" row, then a ledger per pot with its own
//            header, hole rows and summary.
//   live     every index surface, the leaderboard and settlement LIVE RESULTS
//            carry FLIGHT A / FLIGHT B heads and the per-flight winners.
//
// RE-PINNED 2026-09-14, the RECEIPT PAYOUTS wave (settlement.html only). The
// engine and the five live surfaces: UNCHANGED, sha for sha, all three
// variants. settlement.receiptPool moved in all three because the Main Pool
// section now OPENS with a PAYOUTS block (Skins / Net Finish / KP, who is owed
// what) before the detail. The detail did not move: the section with the
// block cut out is byte-identical to the previous capture - PREV_RECEIPT below
// holds those shas and "the detail under the block" asserts it on every run,
// so a change to the ledgers can never hide behind the block's own diff.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const J = (v) => JSON.parse(JSON.stringify(v));
const FIXTURE = path.join(__dirname, 'pool_flights_golden.fixture.json');
const CD = makeCourseData(18);

// 23 golfers, 12 A / 11 B, $20 buy-in = $460: KP $40 on 3/7/12/16, net $200,
// skins bucket = the remaining $220, gross, no carry. Scores: par everywhere
// through 18, with birdies placed so that some holes are a skin in BOTH
// flights but a tie across the field (holes 2 and 13), some a skin in one
// flight only, and one field-wide skin nobody in the other flight contests.
function build(flights) {
    const r = wizardSavedRound({ code: 'POOLGLD', courseData: CD, thru: 18,
        overrides: { additionalGames: {}, flights: flights === undefined ? undefined : flights } });
    if (flights === undefined) delete r.flights;
    const byName = {}; r.players.forEach(p => { byName[p.name] = p.id; });
    const b = (name, hole) => { r.scores['p' + byName[name] + '_h' + hole] = CD[hole - 1].par - 1; };
    // A: Ann Alpha, Ben Bravo, Cal Charlie ... Lee Lima (12); B: Max Mike ... Wes Whiskey (11)
    b('Ann Alpha', 1);                              // field-wide skin, A
    b('Ben Bravo', 2); b('Max Mike', 2);            // tie across the field; a skin in A and in B
    b('Cal Charlie', 5);                            // A only
    b('Ned November', 7);                           // B only
    b('Dee Delta', 9);
    b('Oli Oscar', 11);
    b('Eli Echo', 13); b('Pat Papa', 13);           // tie across the field again
    b('Quy Quebec', 16);
    return r;
}
const VARIANTS = {
    off: () => build(undefined),
    field: () => build({ enabled: true, scopes: { skins: 'field', birdies: 'field' } }),
    flight: () => build({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } })
};

const ENG = (() => {
    const sb = loadJsFile('pool-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
    return sb;
})();
function engine(data) {
    ENG.__d = J(data);
    const r = vm.runInContext('computeMoneyPool(__d, __d.courseData, __d.scores)', ENG);
    return J({ valid: r.valid, skins: r.skins, refund: r.refund, perPlayerCents: r.perPlayerCents, kpAmount: r.kp && r.kp.amountCents, netAmount: r.net && r.net.amountCents });
}
function surfaces(data) {
    const out = {};
    const ix = loadHtmlInlineScript('index.html', [], { search: '?game=POOLGLD' });
    ix.__d = J(data);
    vm.runInContext('currentData = __d; liveSkinsOpen = true; document.__mount(document.getElementById("live-skins-mount")); renderLiveSkins();', ix);
    out['index.widget'] = String(vm.runInContext('renderSkinsWidgetHtml()', ix));
    out['index.skinsWon'] = String(vm.runInContext('renderSkinsWonHtml()', ix));
    out['index.liveMount'] = String(vm.runInContext("document.getElementById('live-skins-mount').innerHTML", ix));
    const lb = loadHtmlInlineScript('leaderboard.html');
    lb.__d = J(data);
    vm.runInContext("currentMode = 'POOLGLD'; currentBoardData = __d; activeView = 'individual'; activeScoring = 'net'; document.__mount(document.getElementById('live-skins-mount')); renderBoard();", lb);
    out['leaderboard.liveSkins'] = String(vm.runInContext("document.getElementById('live-skins-mount').innerHTML || ''", lb));
    const st = loadHtmlInlineScript('settlement.html');
    st.__d = J(data);
    vm.runInContext('currentMode = "POOLGLD"; document.__mount(document.getElementById("money-pool-section"));', st);
    out['settlement.liveResults'] = String(vm.runInContext('buildLiveResultsHtml(__d, __d.courseData, __d.scores)', st));
    vm.runInContext('renderMoneyPoolSection(__d, __d.courseData, __d.scores)', st);
    out['settlement.receiptPool'] = String(vm.runInContext("document.getElementById('money-pool-section').innerHTML", st));
    return out;
}
function capture(k) {
    const data = VARIANTS[k]();
    const eng = engine(data);
    const html = surfaces(data);
    return { engine: eng, html, sha256: Object.fromEntries(Object.keys(html).map(s => [s, sha(html[s])])) };
}

if (process.env.POOL_FLIGHTS_GOLDEN_WRITE === '1') {
    const fx = { capturedAt: new Date().toISOString(), variants: {} };
    Object.keys(VARIANTS).forEach(k => { fx.variants[k] = capture(k); });
    fs.writeFileSync(FIXTURE, JSON.stringify(fx, null, 1) + '\n');
    console.log('wrote ' + FIXTURE);
}
const FX = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

Object.keys(VARIANTS).forEach(k => {
    describe('POOL GOLDEN, ' + k, () => {
        const got = capture(k);
        const exp = FX.variants[k];
        test('the engine: skins lines, dollars, refund and every golfer\'s net are the frozen literals', () => {
            assert.deepEqual(got.engine, exp.engine);
        });
        Object.keys(exp.html).forEach(surface => {
            test(surface + ' byte-identical', () => {
                assert.equal(sha(got.html[surface]), exp.sha256[surface], 'sha moved');
                assert.equal(got.html[surface], exp.html[surface]);
            });
        });
        test('not vacuous: the bucket paid skins, the Receipt lists holes, every surface mentions skins', () => {
            assert.ok(exp.engine.valid, 'the pool validates');
            assert.ok(exp.engine.skins.lines.length >= 5, 'skins paid: ' + exp.engine.skins.lines.length);
            assert.match(exp.html['settlement.receiptPool'], /Skins Pot/);
            assert.ok((exp.html['settlement.receiptPool'].match(/H\d+ /g) || []).length >= 18, 'every hole on the Receipt');
            Object.keys(exp.html).forEach(s => assert.match(exp.html[s], /SKINS|Skins/, s));
        });
    });
});

// The Receipt's Main Pool section BEFORE the payouts block, by sha (the v126
// capture, 2026-09-14T01:20:20Z). The block is cut out of today's render and the
// remainder must equal these exactly.
const PREV_RECEIPT = {
    off: 'df5e371e13a19931b44dd257cc5361903b13d698d5ed0760e65c5efd977c7e30',
    field: 'df5e371e13a19931b44dd257cc5361903b13d698d5ed0760e65c5efd977c7e30',
    flight: '214f6588ef7d4b9ac1d412718aea92985a61576f4cbd0e075e7c0feaf3a426d8'
};
describe('the detail under the payouts block is the pre-block Receipt, byte for byte', () => {
    Object.keys(VARIANTS).forEach(k => {
        test(k + ': cut the block out and the section is the previous capture', () => {
            const html = FX.variants[k].html['settlement.receiptPool'];
            const a = html.indexOf('<div class="pool-payouts"'), tag = '<!-- /pool-payouts -->', e = html.indexOf(tag);
            assert.ok(a > 0 && e > a, 'the block is in the section');
            assert.ok(html.slice(a, e).length > 1000, 'and it is not empty: ' + html.slice(a, e).length);
            assert.equal(sha(html.slice(0, a) + html.slice(e + tag.length)), PREV_RECEIPT[k]);
        });
    });
});

describe('the goldens differ where they should', () => {
    test('off and field are identical on every surface and in the engine (the scope does not touch a field-wide bucket)', () => {
        assert.deepEqual(FX.variants.off.engine.skins, FX.variants.field.engine.skins);
        ['index.widget', 'index.skinsWon', 'leaderboard.liveSkins', 'settlement.receiptPool'].forEach(s =>
            assert.equal(FX.variants.field.sha256[s], FX.variants.off.sha256[s], s));
    });
    test('flight: the bucket splits $115 / $105 by headcount, ten skins at $23 / $21, pots sum to the bucket; off and field carry no split', () => {
        const f = FX.variants.flight.engine.skins;
        assert.deepEqual(f.flights.map(x => [x.flight, x.golfers, x.amountCents, x.lines.length]), [['A', 12, 11500, 5], ['B', 11, 10500, 5]]);
        assert.equal(f.flights[0].amountCents + f.flights[1].amountCents, f.amountCents);
        assert.deepEqual(f.flights.map(x => [...new Set(x.lines.map(l => l.cents))]), [[2300], [2100]]);
        assert.equal(FX.variants.flight.engine.refund.cents, 0);
        assert.equal(FX.variants.off.engine.skins.flights, undefined); assert.equal(FX.variants.field.engine.skins.flights, undefined);
        assert.match(FX.variants.flight.html['settlement.receiptPool'], /Split by flight, by headcount: Flight A \$115 \(12 golfers\) · Flight B \$105 \(11 golfers\)/);
        assert.ok(!/Split by flight/.test(FX.variants.field.html['settlement.receiptPool']));
    });
    test('the bucket is $220 = $460 - $40 KP - $200 net, in every variant', () => {
        Object.keys(VARIANTS).forEach(k => { assert.equal(FX.variants[k].engine.skins.amountCents, 22000, k); assert.equal(FX.variants[k].engine.kpAmount, 4000); assert.equal(FX.variants[k].engine.netAmount, 20000); });
    });
});
