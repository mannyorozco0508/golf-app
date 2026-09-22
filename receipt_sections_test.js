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
// RE-PINNED 2026-09-22 (the results payout redesign, v196). receiptPool moved
// in all three variants: the Not-final line left the card (one mount above
// everything), the wrapper head and the per-game payouts block are one label
// "🏆 Weekly Game", each game is a card whose head reads title | pot, the
// skins bucket is a card per flight ("🥩 Skins — Flight A | $115 · 12
// golfers"), and the Skins Summary lists are gone - helpers/results-payout-
// v196.js poolV196 is exactly that, and skins_rows_widgets_test.js runs the
// whole chain (v133 capture -> … -> v197 -> poolV196) to today's text on this
// same round, character for character. liveResults moved by ONE edit: the
// gap line no longer leads the live head (the test below removes the held head
// and reaches the v182 sha with no other change). The v197 shas were
// receiptPool off/field ce69786ede69904c7c10928d9c6bcfa8a3f8dea6676fe13c22f28bc18f64e416,
// flight 6fa9c3a2c96d2914a69119fdf35d226f6d47d4bd747d7073cf98db3850d21c3d;
// liveResults off f0956cc3b441e989aaad33f87e5b10813f4362234e38acbfc081e72e658dc863,
// field e0192f452a8bf0e793b33aeac84f7c61d6eb44744f60fb7cd4cd7f8713a46543,
// flight d7dd4b9bbc09867de5ec990128f2a7fa491a24c91fbf4d0f446fdf0ac2b6e5c1.
const PREV_TEXT = {
    off:    { receiptPool: '89511730b8279260cdd2363898d40a2c1b306188c875ee26c3959684c4369421', liveResults: 'ef8221eff0800b793b2f5c5188e76ceaa10c61d42fa481e12ebc6a4c13ee85bf' },
    field:  { receiptPool: '89511730b8279260cdd2363898d40a2c1b306188c875ee26c3959684c4369421', liveResults: '599a59435ec11b5b4915c01940b73520df0a3d9c1c024a3f0e9d975cf4bbc35e' },
    flight: { receiptPool: '5ad878a05bf1cb66a27705945f910ae19509185e5b4dba15483191acd5696be2', liveResults: 'c296dec1a334a333067f0790214152770c692ab2dae7e117aa442bb7306b54b4' }
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
        test(k + ': LIVE RESULTS minus the KP hold\'s head IS the v182 text (2026-09-22; v196 took the gap line out of the head)', () => {
            const now = strip(R[k].live);
            const held = '|🏆 RESULTS — NOT FINAL|Every card is in. A KP is not recorded — its share stays in the pot, and final money appears once the winner is recorded.|';
            assert.ok(now.indexOf(held) === 0, 'the held head leads today\'s text (no gap line in the head since v196)');
            const back = now.replace(held, '|🏆 LIVE RESULTS — THRU 18|The round is still in play. Final money appears once every card is in.|');
            assert.equal(sha(back), V182_LIVE[k]);
        });
    });
});

describe('ONE CARD PER GAME (v196): KP, Net Finish, Skins per flight - siblings, each a head band with title and pot', () => {
    const h = R.flight.pool;
    const cards = h => [...h.matchAll(/<div class="settle-card game-card ([\w-]+)"( data-flight="([AB])")?><div class="game-head"><span class="game-title">([^<]*)<\/span><span class="game-pot">([^<]*)<\/span><\/div>/g)]
        .map(m => ({ cls: m[1], flight: m[3] || null, title: m[4], pot: m[5], at: m.index }));
    test('four .game-card blocks in order - KP, Net Finish, Skins — Flight A, Skins — Flight B - under the "Weekly Game" label; no payouts block, no .pool-game', () => {
        const c = cards(h);
        assert.deepEqual(c.map(x => [x.cls, x.flight, x.title, x.pot]), [
            ['game-kp', null, '📍 KP', '$40'], ['game-net', null, '🥇 Net Finish', '$200'],
            ['game-skins', 'A', '🥩 Skins — Flight A', '$115 · 12 golfers'], ['game-skins', 'B', '🥩 Skins — Flight B', '$105 · 11 golfers']]);
        assert.match(h, /^<div class="results-section-label">🏆 Weekly Game<\/div>/);
        assert.ok(!/pool-payouts|pool-game|pool-flight|Skins Summary|gap-line/.test(h));
    });
    test('each card keeps its own rows: KP holes inside KP, net places inside Net Finish, the split note and five winning holes inside each flight card', () => {
        const c = cards(h); const seg = i => h.slice(c[i].at, i + 1 < c.length ? c[i + 1].at : h.length);
        assert.equal(count(seg(0), /Hole \d+: /g), 4, 'four KP holes in the KP card');
        assert.match(seg(1), /1st: Rae Romeo/); assert.match(seg(1), /2nd: Max Mike/);
        assert.match(seg(2), /Split by flight, by headcount/); assert.ok(!/Split by flight/.test(seg(3)), 'the split note once, on the first flight card');
        assert.equal(count(seg(2), /Hole \d+ —/g), 5); assert.equal(count(seg(3), /Hole \d+ —/g), 5);
        assert.equal(count(seg(0) + seg(1), /Hole \d+ —/g), 0, 'and none outside the skins cards');
    });
    test('field and off: one skins card, "🥩 Skins", no flight, six winning-hole rows', () => {
        ['field', 'off'].forEach(k => {
            const c = cards(R[k].pool).filter(x => x.cls === 'game-skins');
            assert.equal(c.length, 1, k); assert.equal(c[0].flight, null, k); assert.equal(c[0].title, '🥩 Skins', k); assert.equal(c[0].pot, '$220', k);
            assert.equal(count(R[k].pool, /Hole \d+ —/g), 6, k);
            assert.ok(!/Split by flight/.test(R[k].pool), k);
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
        ['.game-card {', '.game-head {', '.game-title {', '.game-pot {', '.skins-card {', '[data-flight="A"]', '[data-flight="B"]'].forEach(c => assert.ok(src.includes(c), c));   // v196: .game-card replaced .pool-game / .pool-flight
        assert.equal(count(src, /\n\s*\.ledger-row \{/g), 2, 'the original rule and its print size (v195b\'s "9.5pt" row, alone on its selector since v196 retired .pp-row)');
    });
    test('print: a game head never ends a sheet; a flight block avoids breaking; the mounts\' rule prints', () => {
        const at = src.indexOf('@media print {'); const print = src.slice(at, src.indexOf('\n        }\n', src.indexOf('.receipt-card-scroll', at)));
        assert.match(print, /\.game-head \{ -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; break-after: avoid; page-break-after: avoid; \}/);
        assert.match(print, /\.payout-card, \.game-card, \.net-view, \.po-row \{ break-inside: avoid; page-break-inside: avoid; \}/);
    });
    test('the mounts are separated by a rule, only when they hold something', () => {
        assert.match(src, /#combined-settlement-summary:not\(:empty\), #settle-content:not\(:empty\), #results-net:not\(:empty\), #receipt-scorecard:not\(:empty\)/);
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
  var games = Array.from(document.querySelectorAll('#money-pool-section .game-card')).map(function (g) { var cs = getComputedStyle(g); var hd = g.querySelector('.game-head'); var t = g.querySelector('.game-title'); return Object.assign(rect(g), { border: cs.borderTopWidth + ' ' + cs.borderTopStyle, head: t.innerText, headWeight: getComputedStyle(t).fontWeight, headSize: getComputedStyle(t).fontSize, bandBg: getComputedStyle(hd).backgroundColor, cardBg: cs.backgroundColor, flight: g.getAttribute('data-flight'), rowSize: g.querySelector('.ledger-row') ? getComputedStyle(g.querySelector('.ledger-row')).fontSize : null }); });
  var flights = games.filter(function (g) { return g.flight; });
  var skins = Array.from(document.querySelectorAll('#combined-settlement-summary .skins-card')).map(function (c) { var cs = getComputedStyle(c); var s = Array.from(document.querySelectorAll('#combined-settlement-summary .settle-card:not(.skins-card)'))[1]; var cs2 = s ? getComputedStyle(s) : {}; return { flight: c.getAttribute('data-flight'), borderLeft: cs.borderLeftWidth + ' ' + cs.borderLeftColor, bg: cs.backgroundColor, standingsBorderLeft: cs2.borderLeftWidth + ' ' + cs2.borderLeftColor, standingsBg: cs2.backgroundColor }; });
  var top = document.getElementById('results-top');
  return JSON.stringify({ games: games, flights: flights, skins: skins, topEmpty: !(top.innerText || '').trim(), docScrollW: document.documentElement.scrollWidth, vw: window.innerWidth,
    mountsRule: getComputedStyle(document.getElementById('combined-settlement-summary')).borderTopWidth }); })()`;
const C = {};
before(async () => {
    const r = await arriveCold({ url: fileUrl('settlement.html', 'game=POOLGLD'), db: DB, settleMs: 4000, steps: [{ expression: PROBE }] });
    C.v = r.ok ? JSON.parse(r.value[0]) : { reason: r.reason };
});
describe('COLD CHROME at 390: the blocks are distinct on screen', () => {
    test('ran', () => assert.ok(C.v && !C.v.reason, C.v && C.v.reason));
    test('four game cards (v196), each bordered with a coloured band unlike the card, each below the last with a gap, titles heavier and larger than the rows; no Pay out on a live round', () => {
        const g = C.v.games;
        assert.equal(g.length, 4, JSON.stringify(g));
        g.forEach(x => { assert.notEqual(x.bandBg, x.cardBg, x.head + ' band'); assert.notEqual(x.bandBg, 'rgba(0, 0, 0, 0)', x.head + ' band painted'); });
        assert.equal(C.v.topEmpty, true, 'no Pay out list while the round is held');
        g.forEach(x => { assert.match(x.border, /^[1-9]\d*(\.\d+)?px solid$/, x.head + ' border: ' + x.border); assert.ok(Number(x.headWeight) >= 600, x.head + ' weight ' + x.headWeight); assert.ok(parseFloat(x.headSize) > parseFloat(x.rowSize || '0'), x.head + ' head ' + x.headSize + ' vs row ' + x.rowSize); });
        for (let i = 1; i < g.length; i++) assert.ok(g[i].top - g[i - 1].bottom >= 6, 'a visible gap between ' + g[i - 1].head + ' and ' + g[i].head + ': ' + (g[i].top - g[i - 1].bottom));
    });
    test('the two flight cards, A above B, are the third and fourth cards (v196: siblings, not blocks inside a Skins Pot block)', () => {
        const f = C.v.flights;
        assert.equal(f.length, 2); assert.deepEqual(f.map(x => x.flight), ['A', 'B']);
        assert.deepEqual(C.v.games.map(x => x.flight), [null, null, 'A', 'B']);
        assert.ok(f[1].top - f[0].bottom >= 6, 'gap between the flights: ' + (f[1].top - f[0].bottom));
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
