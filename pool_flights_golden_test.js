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
// RE-PINNED 2026-09-14 (later), the RESULTS SECTIONING wave (settlement.html
// only). Engine and the four index/leaderboard surfaces UNCHANGED sha for sha;
// settlement.receiptPool and settlement.liveResults moved in all three variants
// - wrappers only: each game in the Main Pool is a .pool-game block with a
// .pool-game-head, each flight a .pool-flight block with its pot in a
// .pool-flight-head; LIVE RESULTS skins cards carry .skins-card and per-flight
// cards data-flight. The tag-stripped TEXT of both surfaces is identical to the
// previous capture in every variant (receipt_sections_test.js pins it by sha).
//
// RE-PINNED 2026-09-14, the RECEIPT PAYOUTS wave (settlement.html only). The
// engine and the five live surfaces: UNCHANGED, sha for sha, all three
// variants. settlement.receiptPool moved in all three because the Main Pool
// section now OPENS with a PAYOUTS block (Skins / Net Finish / KP, who is owed
// what) before the detail. The detail did not move: the section with the
// block cut out is byte-identical to the previous capture - PREV_RECEIPT below
// holds those shas and "the detail under the block" asserts it on every run,
// so a change to the ledgers can never hide behind the block's own diff.
//
// RE-PINNED 2026-09-14, the SKINS ROWS wave (settlement.html only). Engine
// and the five live surfaces: UNCHANGED, sha for sha, all three variants.
// settlement.receiptPool moved in all three because the Main Pool's skins
// ledger now lists ONLY the holes that paid - the twelve (off/field) and
// twenty-six (flight) "Tie at Gross N — No Skin" rows are gone, and the hole
// label reads "Hole 5", not "H5". Every WINNING row is text-identical to the
// previous capture: skins_rows_widgets_test.js holds the pre-change text
// (skins_rows_prev.fixture.json) and proves on every run that the old text
// with its tie rows removed and H->Hole IS today's text, character for
// character. PREV_RECEIPT_TEXT below is re-pinned to the new text; the v134
// shas it replaced are recorded beside it.
//
// RE-PINNED 2026-09-14, the CARD SKINS wave (index.html, leaderboard.html;
// v137): index.liveMount and leaderboard.liveSkins moved in all three
// variants for the same reason the Receipt did in v136 - only the holes that
// paid are rows, labelled "Hole N". Engine, index.widget, index.skinsWon and
// settlement.receiptPool: UNCHANGED, sha for sha. card_skins_wave_test.js
// proves the text difference is exactly the dropped tie rows and the label.
//
// RE-PINNED 2026-09-15, the WEEKLY GAME wave (settlement.html only, v142).
// Engine and the five live surfaces: UNCHANGED, sha for sha. receiptPool moved
// in all three because the section header reads "Weekly Game", the payouts
// block lost its "hand out in this order" title, and each Net Finish payout
// row carries its place ("1 · Rae Romeo", "2 · Max Mike"). weekly_game_test.js
// holds the v141 text and proves those are the only differences.
//
// RE-PINNED 2026-09-19, the RECORDING PAYS wave (pool-engine.js and
// settlement-engine.js, approved per-file; settlement.html; v182). THE ENGINE
// MOVED, deliberately, and only in the KP figures: this round is thru 18 with
// hole 3 recorded (Ann Alpha) and 7/12/16 blank. Before, every KP dollar was
// withheld until an organizer confirmed - refund 0, the ledger short $40. Now
// the recorded hole is PAID ($10 to Ann) and the three blanks REFUND to the
// field ($30 across 23 golfers, $1 or $2 each) the moment the last card is in;
// refund.cents 0 -> 3000 with the reason "Unclaimed KP money refunded to the
// field.", perPlayerCents moved for all 23 (by +$1, +$2, and +$12 for Ann),
// and the ledger sums to 0 instead of -$40. Skins lines, dollars and the skins
// per-flight split: UNCHANGED, sha for sha (asserted below). index.widget,
// index.skinsWon, index.liveMount, leaderboard.liveSkins: UNCHANGED, sha for
// sha. settlement.receiptPool moved (the KP lines say paid / nobody recorded it
// / back to the field, the NOT CONFIRMED head and row are gone, the refund row
// gains the KP reason and $30 - skins_rows_widgets_test.js proves that is the
// whole text difference); settlement.liveResults moved BACK to its v148 text
// (the KP-only "RESULTS — NOT FINAL" head no longer exists). The previous
// fixture's sha was ead386e0; main_pool_settlement_parity_test.js and
// kp_settlement_test.js carry the rule change in figures.
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
// RE-PINNED 2026-09-15, the RECEIPT PREDICATE wave (settlement.html only,
// v149): settlement.liveResults moved in all three variants and NOTHING else
// did (engine blocks, index and leaderboard surfaces, settlement.receiptPool
// sha-identical). This round is thru 18 with its KPs unconfirmed, so the live
// head that read "LIVE RESULTS — THRU 18 / The round is still in play. Final
// money appears once every card is in." - blaming golfers whose cards were
// all in - now reads "RESULTS — NOT FINAL / Every card is in. KP results are
// still unconfirmed — final money appears once they are confirmed or
// cancelled." Text identical from char 96 on. Previous liveResults shas: off
// c2404162e1f0e90f..., field 878f5337b8acb4db..., flight 43b41a98d6374aeb....
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
    flight: () => build({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } }),
    // ADDED 2026-09-20 (v187): the same round with the bucket split EVENLY
    // (flights.skinsSplit 'even' - pool-engine.js skinsSplitMode). 'flight'
    // above carries no key and STAYS the headcount case, byte for byte; this
    // variant sits alongside it. $220 evenly on 12 A / 11 B is $110 / $110
    // (headcount: $115 / $105); the same ten skins, $22 each in both flights.
    even: () => build({ enabled: true, scopes: { skins: 'flight', birdies: 'field' }, skinsSplit: 'even' })
};

const ENG = (() => {
    const sb = loadJsFile('pool-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
    return sb;
})();
function engine(data) {
    ENG.__d = J(data);
    const r = vm.runInContext('computeMoneyPool(__d, __d.courseData, __d.scores)', ENG);
    // kpUnresolvedCents and settled joined the block 2026-09-22 (KP money never refunds): the held money is the fact.
    return J({ valid: r.valid, skins: r.skins, refund: r.refund, perPlayerCents: r.perPlayerCents, kpAmount: r.kp && r.kp.amountCents, netAmount: r.net && r.net.amountCents, kpUnresolvedCents: r.kpUnresolvedCents, settled: r.settled });
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
            assert.match(exp.html['settlement.receiptPool'], /game-title">🥩 Skins/);   // v196: a skins card
            // Since the skins-rows wave only the holes that paid are listed: one
            // "Hole N —" row per engine line, and never a tie row.
            assert.equal((exp.html['settlement.receiptPool'].match(/Hole \d+ — /g) || []).length,
                exp.engine.skins.lines.length, 'one row per skin the engine paid');
            assert.ok(!/No Skin/.test(exp.html['settlement.receiptPool']), 'no tie rows on a no-carry round');
            Object.keys(exp.html).forEach(s => assert.match(exp.html[s], /SKINS|Skins/, s));
        });
    });
});

// The Receipt's Main Pool section BEFORE the payouts block. The block is cut out
// of today's render and the remainder's TEXT - tags stripped, every number, name
// and row in order - must equal these. RE-PINNED 2026-09-14 (the sectioning
// wave): this used to be a byte sha of the markup; the game and flight wrappers
// that wave added change the markup and not one character of the text, which
// is what this guard is for. Previous byte shas, for the record: off/field
// df5e371e13a19931b44dd257cc5361903b13d698d5ed0760e65c5efd977c7e30, flight
// 214f6588ef7d4b9ac1d412718aea92985a61576f4cbd0e075e7c0feaf3a426d8.
const stripTags = (h) => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
// RE-PINNED 2026-09-14 (skins rows): the v134 text shas were off/field
// 7cb97d4d892a21cfb7657b26b7cc4c22d8fcfc7e1fda957d3c8241d27db61be5, flight
// 99f5c4b80952e8bc08784ae8e51a186f239644057649667049ade0faabd01703. The tie
// rows left and the label changed; skins_rows_widgets_test.js proves nothing
// else did.
// RE-PINNED 2026-09-15 (weekly game): the header rename sits inside the
// block-cut text. The v136 shas were off/field
// 01c73193699c6bbd4399235efb30a1bd2500370d8353d7f418d0060e182b76d5, flight
// 334fa8edaf560725194ea4e81724e84a8594f5c6b7e69d1e668b9562588fccb4.
// RE-PINNED 2026-09-19 (recording pays): the KP lines and the refund row sit
// inside the block-cut text. The v142 shas were off/field
// 24e8815570e0894b8e29857f970cf4bd6c3e77a60d59f82e20499b3587e1da17, flight
// 92c5d2e9522ddc715f6ee7f1c7ed9270a995a4a847d67cd22e9c86aed91ca3bc.
// RE-PINNED 2026-09-22 (KP money never refunds, kp_never_refunds_test.js): the
// three blank KP holes on this finished round are HELD, not refunded - the KP
// lines read "Hole 7: not recorded / $10 in the pot", the "↩️ Refunded" row is
// gone, the "Not final — KP on holes 7, 12, 16 not recorded" line leads the
// card, and the refund's $1/$2 per golfer are out of every ledger. The engine
// block: refund.cents 3000 -> 0, kpUnresolvedCents 0 -> 3000, settled false,
// perPlayerCents sum -3000 (the money is in the pot). The v182 shas were
// off/field 0cfd654ae21ae75795460d7b54d53243fd7e6f267d1277c75f03fcb8d158cad7,
// flight 15eb59952d337a5a9fe9f8d9a3f8184f284622a5852b8c875deb170bbf0d6102;
// the fixture was b9f57565 (v182) / 34d06a07 (v187). Captured twice this wave:
// the second capture (the fixture as committed) has settlement.liveResults
// under the KP-only head - "🏆 RESULTS — NOT FINAL / Every card is in. A KP is
// not recorded — its share stays in the pot, and final money appears once the
// winner is recorded." in place of "LIVE RESULTS — THRU 18 / The round is
// still in play." - because every card IS in on this round and the first
// capture's head blamed golfers who had finished (receipt_sections_test.js
// proves the inverse edit gives the v182 text). The first capture's
// liveResults shas were off b7510b60…, field 74963a3b…, flight/even 666b9d72….
//
// RE-PINNED 2026-09-22 (the RESULTS PAYOUT REDESIGN, v196; settlement.html only).
// Engine and the four index/leaderboard surfaces: UNCHANGED, sha for sha, all
// four variants. settlement.receiptPool moved in all four: the Weekly Game is
// one .game-card per game - KP, Net Finish, Skins per flight as siblings, a
// coloured head band with the title and the pot - under a "🏆 Weekly Game"
// label; the Not-final line (one mount above everything), the per-game
// payouts block and the Skins Summary lists are gone from this section. Every
// hole row, KP line, net line and note is the same text - helpers/results-
// payout-v196.js poolV196 is the edit, and skins_rows_widgets_test.js runs the
// whole chain to today's text on this same round. settlement.liveResults moved
// by one edit: the gap line no longer leads the head (receipt_sections_test.js
// reaches the v182 sha from today's text with the head swap alone). The
// PREV_RECEIPT_TEXT shas below are of today's tag-stripped section (the
// payouts block that used to be cut out no longer exists); the v197 ones were
// off/field 7719747fc624571c7071f5c2ad4c537757ae46103deefb4ddcf4567e70ad4884,
// flight 6facd73aa7a8269698cfe6a6b0457ee597fffa7971bc4427775cf881c247cf6e.
const PREV_RECEIPT_TEXT = {
    off: '89511730b8279260cdd2363898d40a2c1b306188c875ee26c3959684c4369421',     // = receipt_sections_test.js PREV_TEXT.off.receiptPool, the same strip
    field: '89511730b8279260cdd2363898d40a2c1b306188c875ee26c3959684c4369421',
    flight: '5ad878a05bf1cb66a27705945f910ae19509185e5b4dba15483191acd5696be2'
};
const cutBlock = (html) => {
    assert.ok(html.indexOf('<div class="pool-payouts"') < 0, 'no payouts block since v196');
    return stripTags(html);
};
describe('the Weekly Game section, text for text', () => {
    Object.keys(PREV_RECEIPT_TEXT).forEach(k => {
        test(k + ': the section\'s tag-stripped text is the pinned capture (the chain from the v133 text is skins_rows_widgets_test.js)', () => {
            assert.equal(sha(cutBlock(FX.variants[k].html['settlement.receiptPool'])), PREV_RECEIPT_TEXT[k]);
        });
    });
    // The even variant has no previous capture - it was born 2026-09-20. Its
    // Receipt is held against the HEADCOUNT one instead: the only cells that may
    // differ are the split line, the two pot heads and the per-skin dollars
    // ($23 / $21 -> $22 / $22). Every other cell - the KP lines, the net places,
    // the refund row, the golfers' names - is the same text, cell for cell.
    test('even: the same Receipt as flight, except the split line, the pot heads and the per-skin dollars', () => {
        const f = cutBlock(FX.variants.flight.html['settlement.receiptPool']).split('|');
        const e = cutBlock(FX.variants.even.html['settlement.receiptPool']).split('|');
        assert.equal(e.length, f.length, 'same number of cells');
        const moved = [];
        f.forEach((cell, i) => { if (cell !== e[i]) moved.push([cell, e[i]]); });
        assert.deepEqual(moved.filter(([a]) => !/^\$2[13]$/.test(a)), [
            ['$115 · 12 golfers', '$110 · 12 golfers'],   // v196: the pot sits in the card head's right cell
            ['Split by flight, by headcount: Flight A $115 (12 golfers) · Flight B $105 (11 golfers)', 'Split by flight, evenly: Flight A $110 (12 golfers) · Flight B $110 (11 golfers)'],
            ['$105 · 11 golfers', '$110 · 11 golfers']
        ]);
        const skins = moved.filter(([a]) => /^\$2[13]$/.test(a));
        assert.equal(skins.length, 10, 'five skins per flight, every one re-priced (v196: the Skins Summary rows that doubled this to 20 are gone)');
        assert.ok(skins.every(([, b]) => b === '$22'), '$22 each in both flights');
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
        // 2026-09-22: the $30 of unrecorded KP is HELD - nothing refunds, the round is not settled
        assert.equal(FX.variants.flight.engine.refund.cents, 0);
        assert.deepEqual(FX.variants.flight.engine.refund.reasons, []);
        assert.equal(FX.variants.flight.engine.kpUnresolvedCents, 3000); assert.equal(FX.variants.flight.engine.settled, false);
        assert.equal(Object.values(FX.variants.flight.engine.perPlayerCents).reduce((a, c) => a + c, 0), -3000, 'the ledger sums to minus the money in the pot');
        assert.equal(FX.variants.off.engine.skins.flights, undefined); assert.equal(FX.variants.field.engine.skins.flights, undefined);
        assert.match(FX.variants.flight.html['settlement.receiptPool'], /Split by flight, by headcount: Flight A \$115 \(12 golfers\) · Flight B \$105 \(11 golfers\)/);
        assert.ok(!/Split by flight/.test(FX.variants.field.html['settlement.receiptPool']));
    });
    test('even: the bucket splits $110 / $110, ten skins at $22 in both flights, pots sum to the bucket; the same winners as flight', () => {
        const e = FX.variants.even.engine.skins, f = FX.variants.flight.engine.skins;
        assert.deepEqual(e.flights.map(x => [x.flight, x.golfers, x.amountCents, x.lines.length]), [['A', 12, 11000, 5], ['B', 11, 11000, 5]]);
        assert.equal(e.flights[0].amountCents + e.flights[1].amountCents, e.amountCents);
        assert.deepEqual(e.flights.map(x => [...new Set(x.lines.map(l => l.cents))]), [[2200], [2200]]);
        assert.deepEqual(e.lines.map(l => [l.hole, l.winnerId, l.units]), f.lines.map(l => [l.hole, l.winnerId, l.units]), 'same skins, same winners - only the dollars moved');
        assert.equal(FX.variants.even.engine.refund.cents, 0, 'nothing refunds (2026-09-22)');
        assert.match(FX.variants.even.html['settlement.receiptPool'], /Split by flight, evenly: Flight A \$110 \(12 golfers\) · Flight B \$110 \(11 golfers\)/);
        assert.ok(!/by headcount/.test(FX.variants.even.html['settlement.receiptPool']));
    });
    test('the bucket is $220 = $460 - $40 KP - $200 net, in every variant', () => {
        Object.keys(VARIANTS).forEach(k => { assert.equal(FX.variants[k].engine.skins.amountCents, 22000, k); assert.equal(FX.variants[k].engine.kpAmount, 4000); assert.equal(FX.variants[k].engine.netAmount, 20000); });
    });
});
