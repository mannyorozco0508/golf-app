// ============================================================================
// THE RESULTS PAGE, SECTIONED SO IT CAN BE READ. Presentation only.
//
// THE PROBLEM (inventory, 2026-09-14). The Main Pool card was 4,068 px of 62
// bare .ledger-row children: the KP, Net Finish and Skins Pot headers were the
// same element, same weight, as the hole rows under them; no break between
// games; no break between Flight A's summary and "Flight B — $105". Below it
// eight sibling .settle-cards with identical chrome read as one stack, and the
// three mounts had nothing between them. The print button appeared twice,
// 2,300 px apart.
//
// THE SHAPE.
//   Inside the Main Pool card each GAME is a bordered .pool-game block with a
//   .pool-game-head that reads as a header (not a .ledger-row); the payouts
//   block stays first. Inside the Skins Pot block each FLIGHT is a bordered
//   .pool-flight block, its pot in a .pool-flight-head, holding that flight's
//   hole rows and summary. In LIVE RESULTS the SKINS WON cards carry
//   .skins-card and every per-flight card carries data-flight, so the flight is
//   a property of the card and not only words in its header. The mounts are
//   separated by a rule. ONE print button, at the top.
//
// NOTHING ABOUT THE MONEY CHANGES. The tag-stripped TEXT of the Receipt's Main
// Pool section and of LIVE RESULTS is pinned by sha to the pre-change golden:
// every number, name and row in the same order. Only markup moved.
//
// WHAT THE HARNESS PROVES: the HTML strings the page writes (mini-dom parses no
// innerHTML). Borders, distinctness and scroll are measured in Chrome below.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const J = (v) => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);
const strip = (h) => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();

// The pool_flights_golden round, three variants, exactly as that golden builds it.
function build(flights) {
    const r = wizardSavedRound({ code: 'POOLGLD', courseData: CD, thru: 18, overrides: { additionalGames: {}, flights: flights === undefined ? undefined : flights } });
    if (flights === undefined) delete r.flights;
    const byName = {}; r.players.forEach(p => { byName[p.name] = p.id; });
    const b = (name, hole) => { r.scores['p' + byName[name] + '_h' + hole] = CD[hole - 1].par - 1; };
    b('Ann Alpha', 1); b('Ben Bravo', 2); b('Max Mike', 2); b('Cal Charlie', 5); b('Ned November', 7); b('Dee Delta', 9); b('Oli Oscar', 11); b('Eli Echo', 13); b('Pat Papa', 13); b('Quy Quebec', 16);
    return r;
}
const VARIANTS = { off: () => build(undefined), field: () => build({ enabled: true, scopes: { skins: 'field', birdies: 'field' } }), flight: () => build({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } }) };
// The tag-stripped text of each surface BEFORE this wave (from the v133 golden
// fixture). The markup may move; this may not.
// RE-PINNED 2026-09-14 (skins rows, v136): receiptPool moved in all three
// variants - the tie rows left the Main Pool skins ledger and "H5" became
// "Hole 5" - and skins_rows_widgets_test.js proves that is the whole
// difference. liveResults is untouched. The v134 receiptPool shas were
// off/field 8d851e85a86b2aad160784411031081fcfdebd6f99f295e2774d13c148f4e557,
// flight 21a797e7460c81cb83415171d7ddd6af9ce6c2960556ee9cb1363d8efdb9ad9e.
// RE-PINNED 2026-09-15 (weekly game, v142): receiptPool moved in all three
// variants - "Weekly Game" in the header, the payouts title gone, places on the
// net rows; weekly_game_test.js proves that is the whole difference. liveResults
// untouched. The v136 receiptPool shas were off/field 6c4d1a6a8e2fc768e2c4ab7061e8dd4a64e58fcfc171c91f4a1dae3391ac36fe,
// flight 1276c8f4467a1937c39574a88b602b692ed0b40cb3511a2e0ac6289a4adaab3c.
// RE-PINNED 2026-09-15 (the Receipt predicate, v149): liveResults moved in all
// three variants and receiptPool did not. The round is thru 18 with KPs
// unconfirmed, so the live head "LIVE RESULTS — THRU 18 / The round is still
// in play. Final money appears once every card is in." became "RESULTS — NOT
// FINAL / Every card is in. KP results are still unconfirmed — final money
// appears once they are confirmed or cancelled." (receipt_final_test.js). The
// text is identical from char 96 on. The v148 liveResults shas were off
// c356897208f52fac57f99130c1ad5870d7ea21218376f95bfdee0723114effff, field
// b55349de443d8c2f908cc158f204c0552248b13a4c55db43c0043188e9e8c311, flight
// 4b35f8a839114cf7f30b8ac583cd744303be4214640c1acdf1f473f431e135a0.
// RE-PINNED 2026-09-19 (recording pays, v182). Both surfaces moved in all three
// variants. receiptPool: hole 3 (Ann Alpha) is PAID rather than "not confirmed",
// holes 7/12/16 read "nobody recorded it · $10 back to the field" rather than
// "no winner recorded · $10 pending", the "NOT CONFIRMED" head suffix and the
// "⚠️ KP results not confirmed" row are gone, and the field refund row gains
// "Unclaimed KP money refunded to the field." and $30 - skins_rows_shared_test.js
// and skins_rows_widgets_test.js prove that is the whole difference, character
// for character. liveResults: the KP-only "RESULTS — NOT FINAL" head no longer
// exists, so the text is BACK to the v148 shas recorded above, byte for byte.
// The v149 receiptPool shas were off/field 06308427bf4b16082be45a9da24f05f58f6e88c3f862b0e2f4a1bc9218b957f8,
// flight abc0fa8b98345cd26429fcf1611091196986149285fe42e0277191960701c6c3; the v149
// liveResults shas off 83ef04da18864a3ae4181eb52045cdd278f319fbcba9598611c70e72bc457cde,
// field c04d25b657b54f849ba0485ade3d88056a7631bf111e0a4a0ce91e6d780092f2, flight
// 2869f502b7658f73078158f2d35b04d92817a74138982c6e364a69c77b1d434f.
// RE-PINNED 2026-09-22 (KP never refunds, v197). Both surfaces moved in all
// three variants. receiptPool: holes 7/12/16 read "not recorded · $10 in the
// pot" rather than "nobody recorded it · $10 back to the field", the
// "↩️ Refunded to the field (Unclaimed KP money refunded to the field.)" row
// and its $30 are gone, and the head gains "Not final — KP on holes 7, 12, 16
// not recorded" - helpers/kp-never-refunds.js is exactly that, and the chain
// v133 capture -> skins rows -> v142 -> recording pays -> this rule reproduces
// BOTH the v182 sha below and today's (skins_rows_widgets_test.js, same round).
// liveResults: the gap line leads and the KP-only head is back - "RESULTS —
// NOT FINAL / Every card is in. A KP is not recorded — its share stays in the
// pot, and final money appears once the winner is recorded." in place of
// "LIVE RESULTS — THRU 18 / The round is still in play. Final money appears
// once every card is in." - and the inverse of those two edits on today's
// text IS the v148/v182 sha, byte for byte (the test below). The v182
// receiptPool shas were off/field d2868b4f7c08e99b703af0edc3e5d5718580c9f7c0b9d7ba6346e2d5495b6c17,
// flight cf22167ee045a47d6333d88dc3661c28878c743ed39797b0bc2d284fef2c3867; the
// v182 liveResults shas were the v148 ones recorded above.
const PREV_TEXT = {
    off:    { receiptPool: 'ce69786ede69904c7c10928d9c6bcfa8a3f8dea6676fe13c22f28bc18f64e416', liveResults: 'f0956cc3b441e989aaad33f87e5b10813f4362234e38acbfc081e72e658dc863' },
    field:  { receiptPool: 'ce69786ede69904c7c10928d9c6bcfa8a3f8dea6676fe13c22f28bc18f64e416', liveResults: 'e0192f452a8bf0e793b33aeac84f7c61d6eb44744f60fb7cd4cd7f8713a46543' },
    flight: { receiptPool: '6fa9c3a2c96d2914a69119fdf35d226f6d47d4bd747d7073cf98db3850d21c3d', liveResults: 'd7dd4b9bbc09867de5ec990128f2a7fa491a24c91fbf4d0f446fdf0ac2b6e5c1' }
};
const V182_LIVE = { off: 'c356897208f52fac57f99130c1ad5870d7ea21218376f95bfdee0723114effff', field: 'b55349de443d8c2f908cc158f204c0552248b13a4c55db43c0043188e9e8c311', flight: '4b35f8a839114cf7f30b8ac583cd744303be4214640c1acdf1f473f431e135a0' };
function render(data) {
    const st = loadHtmlInlineScript('settlement.html');
    st.__d = J(data);
    vm.runInContext('currentMode = "POOLGLD"; document.__mount(document.getElementById("money-pool-section")); document.__mount(document.getElementById("combined-settlement-summary")); document.__mount(document.getElementById("settle-content"));', st);
    vm.runInContext('renderMoneyPoolSection(__d, __d.courseData, __d.scores); renderCombinedSummary(__d, __d.courseData, __d.scores); renderSettlement(__d);', st);
    return {
        pool: String(vm.runInContext("document.getElementById('money-pool-section').innerHTML", st)),
        live: String(vm.runInContext('buildLiveResultsHtml(__d, __d.courseData, __d.scores)', st)),
        summary: String(vm.runInContext("document.getElementById('combined-settlement-summary').innerHTML", st)),
        content: String(vm.runInContext("document.getElementById('settle-content').innerHTML", st))
    };
}
const R = {}; Object.keys(VARIANTS).forEach(k => { R[k] = render(VARIANTS[k]()); });
const count = (h, re) => (h.match(re) || []).length;
const blocks = (h, cls) => { const out = []; const re = new RegExp('<div class="' + cls.trim() + '(?: [^"]*)?"([^>]*)>', 'g'); let m; while ((m = re.exec(h))) out.push({ at: m.index, attrs: m[1] }); return out; };

describe('NOTHING ABOUT THE MONEY CHANGES: the text of every surface is the pre-change text, byte for byte', () => {
    Object.keys(VARIANTS).forEach(k => {
        test(k + ': Main Pool section text unchanged', () => assert.equal(sha(strip(R[k].pool)), PREV_TEXT[k].receiptPool));
        test(k + ': LIVE RESULTS text unchanged', () => assert.equal(sha(strip(R[k].live)), PREV_TEXT[k].liveResults));
        test(k + ': LIVE RESULTS minus the KP hold\'s two edits IS the v182 text (2026-09-22)', () => {
            const now = strip(R[k].live);
            const gap = '|Not final — KP on holes 7, 12, 16 not recorded';
            const held = '|🏆 RESULTS — NOT FINAL|Every card is in. A KP is not recorded — its share stays in the pot, and final money appears once the winner is recorded.|';
            assert.ok(now.indexOf(gap) === 0 && now.indexOf(held) > 0, 'both edits are in today\'s text');
            const back = now.slice(gap.length).replace(held, '|🏆 LIVE RESULTS — THRU 18|The round is still in play. Final money appears once every card is in.|');
            assert.equal(sha(back), V182_LIVE[k]);
        });
    });
});

describe('THE MAIN POOL CARD: a bordered block per game, a header that is a header', () => {
    const h = R.flight.pool;
    test('three .pool-game blocks in hand-out order - KP, Net Finish, Skins Pot - each with a .pool-game-head', () => {
        const games = blocks(h, 'pool-game ');
        assert.equal(games.length, 3, 'game blocks: ' + games.length);
        const heads = [...h.matchAll(/<div class="pool-game-head">([^<]*)</g)].map(m => m[1]);
        assert.deepEqual(heads.map(t => t.replace(/\s+/g, ' ').trim()), ['📍 KP — $40', '🥇 Net Finish — $200', '🥩 Skins Pot — $220 (Gross skins, no carry)']);   // 2026-09-19: no NOT CONFIRMED suffix
        assert.ok(!/<div class="ledger-row"[^>]*><span>📍 KP/.test(h), 'the KP header is no longer a ledger row');
        assert.ok(!/<div class="ledger-row"[^>]*><span>🥇 Net Finish/.test(h) && !/<div class="ledger-row"[^>]*><span>🥩 Skins Pot/.test(h));
    });
    test('the payouts block is still first, before any game block', () => {
        assert.ok(h.indexOf('<div class="pool-payouts"') > 0 && h.indexOf('<div class="pool-payouts"') < blocks(h, 'pool-game ')[0].at);
    });
    test('each game keeps its own rows: KP holes inside KP, net places inside Net Finish, the split row and the flights inside Skins Pot', () => {
        const g = blocks(h, 'pool-game '); const seg = (i) => h.slice(g[i].at, i + 1 < g.length ? g[i + 1].at : h.length);
        assert.equal(count(seg(0), /Hole \d+: /g), 4, 'four KP holes in the KP block');
        assert.match(seg(1), /1st: Rae Romeo/); assert.match(seg(1), /2nd: Max Mike/);
        assert.match(seg(2), /Split by flight, by headcount/);
        // Since the skins-rows wave (v136) only the holes that paid are rows:
        // five per flight in this round, ten in the block, none outside it.
        assert.equal(count(seg(2), /Hole \d+ —/g), 10, '10 winning-hole rows inside the Skins Pot block');
        assert.equal(count(seg(0) + seg(1), /Hole \d+ —/g), 0, 'and none outside it');
    });
});

describe('THE SKINS POT: a bordered block per flight, its pot in the header', () => {
    test('flight: two .pool-flight blocks, A then B, data-flight set, each holding its five winning-hole rows and its own summary', () => {
        const h = R.flight.pool;
        const fl = blocks(h, 'pool-flight ');
        assert.equal(fl.length, 2, 'flight blocks: ' + fl.length);
        assert.deepEqual(fl.map(f => (f.attrs.match(/data-flight="([AB])"/) || [])[1]), ['A', 'B']);
        const heads = [...h.matchAll(/<div class="pool-flight-head">([^<]*)</g)].map(m => m[1].trim());
        assert.deepEqual(heads, ['Flight A — $115', 'Flight B — $105']);
        const segA = h.slice(fl[0].at, fl[1].at), segB = h.slice(fl[1].at, h.indexOf('</div><!-- /pool-game -->', fl[1].at));
        assert.equal(count(segA, /Hole \d+ —/g), 5); assert.equal(count(segB, /Hole \d+ —/g), 5);
        assert.match(segA, /Skins Summary — Flight A/); assert.match(segB, /Skins Summary — Flight B/);
        assert.ok(!/Skins Summary — Flight B/.test(segA), 'B\'s summary is not in A\'s block');
        assert.ok(!/<div class="ledger-row"[^>]*><span>Flight [AB] —/.test(h), 'the flight header is no longer a ledger row');
    });
    test('field and off: one pot, no flight block, the hole rows sit directly in the Skins Pot block', () => {
        ['field', 'off'].forEach(k => {
            const h = R[k].pool;
            assert.equal(blocks(h, 'pool-flight ').length, 0, k);
            assert.equal(count(h, /Hole \d+ —/g), 6, k);
            assert.ok(!/Split by flight/.test(h), k);
        });
    });
});

describe('LIVE RESULTS: skins cards are a different kind of thing, and the flight is on the card', () => {
    test('flight: two standings cards and two SKINS WON cards (one pool section, A and B); the skins cards carry .skins-card; every per-flight card carries data-flight', () => {
        const h = R.flight.live;
        const skins = blocks(h, 'settle-card skins-card');
        assert.equal(skins.length, 2, 'skins cards: ' + skins.length);
        skins.forEach(c => assert.match(c.attrs, /data-flight="[AB]"/, 'flight on the card: ' + c.attrs));
        assert.equal(count(h, /class="settle-card"[^>]*data-flight="A"/g) + count(h, /class="settle-card"[^>]*data-flight="B"/g), 2, 'the two standings cards carry their flight too');
        assert.equal(count(h, /class="settle-card skins-card"[^>]*data-flight="A"/g), 1);
        assert.equal(count(h, /class="settle-card skins-card"[^>]*data-flight="B"/g), 1);
    });
    test('off: the skins card is still a .skins-card, with no flight', () => {
        const h = R.off.live;
        const skins = blocks(h, 'settle-card skins-card');
        assert.equal(skins.length, 1);
        assert.ok(!/data-flight/.test(skins[0].attrs));
        assert.ok(!/data-flight/.test(h), 'no flight anywhere on a flightless round');
    });
});

describe('ONE PRINT BUTTON, at the top', () => {
    test('LIVE (this round is unsettled): no print button anywhere - the Receipt belongs to the finished round', () => {
        const s = R.flight.summary, c = R.flight.content, p = R.flight.pool;
        assert.equal(count(s + c + p, /onclick="printReceipt\(\)"/g), 0, 'the bottom button that used to print a live round is gone');
    });
    test('SETTLED: exactly one, at the top of the receipt (source pin over every format branch)', () => {
        const src = read('settlement.html');
        const settle = src.slice(src.indexOf('function buildSideGamesHtml('), src.indexOf('function renderCombinedSummary('))
            + src.slice(src.indexOf('function renderSettlement('));
        assert.equal(count(settle, /onclick="printReceipt\(\)"/g), 0, 'renderSettlement and buildSideGamesHtml emit no print button');
        const combined = src.slice(src.indexOf('function renderCombinedSummary('), src.indexOf('function renderReceiptScorecard('));
        assert.equal(count(combined, /onclick="printReceipt\(\)"/g), 1, 'the settled branch of renderCombinedSummary, once');
        assert.equal(count(src, /onclick="printReceipt\(\)"/g), 1, 'one button in the whole page');
    });
});

describe('THE SEAM: classes, print rules, no global .ledger-row change', () => {
    const src = read('settlement.html');
    test('new classes are styled; .ledger-row itself is untouched', () => {
        ['.pool-game {', '.pool-game-head {', '.pool-flight {', '.pool-flight-head {', '.skins-card {', '[data-flight="A"]', '[data-flight="B"]'].forEach(c => assert.ok(src.includes(c), c));
        assert.equal(count(src, /\n\s*\.ledger-row \{/g), 1, 'one .ledger-row rule, the original');
    });
    test('print: a game head never ends a sheet; a flight block avoids breaking; the mounts\' rule prints', () => {
        const at = src.indexOf('@media print {'); const print = src.slice(at, src.indexOf('\n        }\n', src.indexOf('.receipt-card-scroll', at)));
        assert.match(print, /\.pool-game-head, \.pool-flight-head \{ break-after: avoid; page-break-after: avoid; \}/);
        assert.match(print, /\.pool-flight \{ break-inside: avoid; page-break-inside: avoid; \}/);
    });
    test('the mounts are separated by a rule, only when they hold something', () => {
        assert.match(src, /#combined-settlement-summary:not\(:empty\), #settle-content:not\(:empty\), #receipt-scorecard:not\(:empty\)/);
    });
});

// ---- COLD CHROME at 390: distinct blocks, no sideways scroll, payouts first ---
// The Chrome arm measures LIVE RESULTS' skins cards as well as the Main Pool
// blocks. Since 2026-09-19 a thru-18 round is FINAL (its unrecorded KPs refund),
// so the page shows Final Results and no live skins cards; the arm therefore
// arrives on the same flighted round with every card stopped at hole 17 - live,
// so both surfaces are on the page. The mini-dom text pins above stay thru 18.
const DATA = (() => { const d = VARIANTS.flight(); Object.keys(d.scores).forEach(k => { if (parseInt(k.split('_h')[1], 10) === 18) delete d.scores[k]; }); return d; })();
const DB = { events: { POOLGLD: DATA }, global_courses: {}, trips: {}, tournaments: {} };
const PROBE = `(function(){ var rect = function (el) { var r = el.getBoundingClientRect(); return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), h: Math.round(r.height) }; };
  var games = Array.from(document.querySelectorAll('#money-pool-section .pool-game')).map(function (g) { var cs = getComputedStyle(g); return Object.assign(rect(g), { border: cs.borderTopWidth + ' ' + cs.borderTopStyle, head: (g.querySelector('.pool-game-head') || {}).innerText, headWeight: getComputedStyle(g.querySelector('.pool-game-head')).fontWeight, headSize: getComputedStyle(g.querySelector('.pool-game-head')).fontSize, rowSize: g.querySelector('.ledger-row') ? getComputedStyle(g.querySelector('.ledger-row')).fontSize : null }); });
  var flights = Array.from(document.querySelectorAll('#money-pool-section .pool-flight')).map(function (f) { var cs = getComputedStyle(f); return Object.assign(rect(f), { border: cs.borderTopWidth + ' ' + cs.borderTopStyle, flight: f.getAttribute('data-flight'), head: (f.querySelector('.pool-flight-head') || {}).innerText }); });
  var skins = Array.from(document.querySelectorAll('#combined-settlement-summary .skins-card')).map(function (c) { var cs = getComputedStyle(c); var s = Array.from(document.querySelectorAll('#combined-settlement-summary .settle-card:not(.skins-card)'))[1]; var cs2 = s ? getComputedStyle(s) : {}; return { flight: c.getAttribute('data-flight'), borderLeft: cs.borderLeftWidth + ' ' + cs.borderLeftColor, bg: cs.backgroundColor, standingsBorderLeft: cs2.borderLeftWidth + ' ' + cs2.borderLeftColor, standingsBg: cs2.backgroundColor }; });
  var pay = document.querySelector('#money-pool-section .pool-payouts');
  return JSON.stringify({ games: games, flights: flights, skins: skins, payoutsTop: pay ? rect(pay).top : null, docScrollW: document.documentElement.scrollWidth, vw: window.innerWidth,
    mountsRule: getComputedStyle(document.getElementById('combined-settlement-summary')).borderTopWidth }); })()`;
const C = {};
before(async () => {
    const r = await arriveCold({ url: fileUrl('settlement.html', 'game=POOLGLD'), db: DB, settleMs: 4000, steps: [{ expression: PROBE }] });
    C.v = r.ok ? JSON.parse(r.value[0]) : { reason: r.reason };
});
describe('COLD CHROME at 390: the blocks are distinct on screen', () => {
    test('ran', () => assert.ok(C.v && !C.v.reason, C.v && C.v.reason));
    test('three game blocks, each bordered, each below the last with a gap, headers heavier and larger than the rows', () => {
        const g = C.v.games;
        assert.equal(g.length, 3, JSON.stringify(g));
        g.forEach(x => { assert.match(x.border, /^[1-9]\d*(\.\d+)?px solid$/, x.head + ' border: ' + x.border); assert.ok(Number(x.headWeight) >= 600, x.head + ' weight ' + x.headWeight); assert.ok(parseFloat(x.headSize) > parseFloat(x.rowSize || '0'), x.head + ' head ' + x.headSize + ' vs row ' + x.rowSize); });
        for (let i = 1; i < g.length; i++) assert.ok(g[i].top - g[i - 1].bottom >= 6, 'a visible gap between ' + g[i - 1].head + ' and ' + g[i].head + ': ' + (g[i].top - g[i - 1].bottom));
        assert.ok(C.v.payoutsTop < g[0].top, 'payouts first');
    });
    test('two flight blocks, A above B, bordered, with a gap between them, inside the Skins Pot block', () => {
        const f = C.v.flights, skinsGame = C.v.games[2];
        assert.equal(f.length, 2); assert.deepEqual(f.map(x => x.flight), ['A', 'B']);
        f.forEach(x => assert.match(x.border, /^[1-9]\d*(\.\d+)?px solid$/, 'flight ' + x.flight + ' border ' + x.border));
        assert.ok(f[1].top - f[0].bottom >= 6, 'gap between the flights: ' + (f[1].top - f[0].bottom));
        assert.ok(f[0].top >= skinsGame.top && f[1].bottom <= skinsGame.bottom, 'both inside the Skins Pot block');
    });
    test('skins cards differ from standings cards in chrome, and carry a flight edge', () => {
        const s = C.v.skins;
        assert.equal(s.length, 2, JSON.stringify(s));
        s.forEach(c => { assert.notEqual(c.bg, c.standingsBg, 'skins card background differs from a standings card: ' + c.bg); assert.match(c.borderLeft, /^[3-9]px/, 'a flight edge: ' + c.borderLeft); });
        assert.notEqual(s[0].borderLeft, s[1].borderLeft, 'A and B edges differ');
    });
    test('no horizontal scroll; the mounts are separated by a rule', () => {
        assert.ok(C.v.docScrollW <= C.v.vw, 'document scrollWidth ' + C.v.docScrollW);
        assert.match(C.v.mountsRule, /^[1-9]/, 'rule above the combined summary: ' + C.v.mountsRule);
    });
});
