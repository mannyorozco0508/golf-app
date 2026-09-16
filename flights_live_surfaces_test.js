// ============================================================================
// FLIGHTS ON THE LIVE SURFACES. (Flights, Wave 2, Step 5, 2026-09-13.)
//
// Every surface that shows skins live now reads PER FLIGHT:
//   bet-strip.js    skinsState runs its own official-only walk once per slice
//                   (pots from the engine per flight); the strip text is
//                   "A: Ann 2 \u00B7 Ben 1 / B: Eli 1"
//   hole-events.js  one SKIN_WON card per award on the hole, named by flight
//   skins.html      one Bets-ledger section per flight from
//                   computeSkinsPayoutLinesByFlight - never the flat view
//   index.html      the SKINS WON widget and the hole-by-hole modal read the
//                   ledger's `flights`; a hole can be a skin in A, a tie in B
//   settlement.html LIVE RESULTS lists per flight; SKINS WON cards per flight;
//                   the Main Pool bucket's ledger stays flight-blind
//
// THE FLAT VIEW IS NOT READ BY ANY HOLE-KEYED SURFACE. computeSkinsPayoutLines
// holds the same hole twice under flights (pinned in flights_engine_test.js);
// a surface keying by hole from it would keep one skin and lose the other.
// The last describe pins the source: the hole-keyed pages read ByFlight or the
// hole ledger's `flights`, and nothing reads the flat function but the engine
// itself and the flat per-golfer sums.
//
// Every surface is run on: a flighted round; the flightless golden round
// (unchanged - flights_absent_golden_test.js is the byte pin, this file
// re-asserts the strings); a flight of zero; a flight of one.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const J = (v) => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'flights_absent_golden.fixture.json'), 'utf8'));

const LIVE = (() => {
    const sb = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']);
    ['pool-engine.js', 'bet-strip.js', 'hole-events.js'].forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
})();

// The Step 3 split round: 8 golfers hcp 0, gross skins at $8 ($32 per flight).
// A = Ann Ben Cal Dee (Ann h1, Ann h2, Ben h3; Cal+Dee tie h13), B = Eli Fay
// Gus Hal (Eli h2, Fay h5, Gus h7, Hal h9, Eli h11, Gus h13). Everyone else par.
const P = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'], [0, 0, 0, 0, 0, 0, 0, 0], 101, ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B']);
function splitScores(players, thru) {
    const s = {};
    players.forEach(p => CD.slice(0, thru || 18).forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; }));
    const birdie = (idx, hole) => { if (players[idx] && (!thru || hole <= thru)) s[`p${players[idx].id}_h${hole}`] = CD[hole - 1].par - 1; };
    birdie(0, 1); birdie(0, 2); birdie(1, 3); birdie(4, 2); birdie(5, 5); birdie(6, 7); birdie(7, 9); birdie(4, 11);
    birdie(2, 13); birdie(3, 13); birdie(6, 13);
    return s;
}
const ON = { enabled: true, scopes: { skins: 'flight', birdies: 'flight' } };
const round = (players, scores, flights, extra) => Object.assign({ players, gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'gross',
    skinsCarryOver: false, courseData: CD, scores, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar' },
    flights === undefined ? {} : { flights }, extra || {});
const SPLIT = round(P, splitScores(P), ON);
const ONE = (() => { const p = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0], 101, ['A', 'B', 'B', 'B']); const s = {}; p.forEach(x => CD.forEach(h => { s[`p${x.id}_h${h.hole}`] = h.par; })); s['p101_h1'] = CD[0].par - 1; s['p102_h4'] = CD[3].par - 1; return round(p, s, ON); })();
const ZERO = (() => { const p = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0], 101, ['A', 'A', 'A', 'A']); return round(p, splitScores(p), ON); })();
// The Step 1 golden round, flightless.
const GP = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'], [2, 9, 15, 4, 20, 7, 11, 0]);
const GOLD = (() => {
    const s = {};
    GP.forEach(p => CD.slice(0, 17).forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; }));
    const birdie = (idx, hole) => { s[`p${GP[idx].id}_h${hole}`] = CD[hole - 1].par - 1; };
    birdie(0, 2); birdie(0, 9); birdie(1, 5); birdie(2, 14); birdie(6, 11); birdie(3, 13); birdie(7, 13);
    return { players: GP, gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'split', skinsCarryOver: false, birdieGameEnabled: true,
        birdieUnitVal: 2, birdieScoringType: 'gross', courseData: CD, scores: s, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar' };
})();
const game = (data) => ({ key: 'main', format: 'skins', role: 'main', config: data });
const field = (data) => LIVE.fieldParticipants(data);

// ---------------------------------------------------------------------------
describe('bet-strip.js - the strip per flight', () => {
    test('FLIGHTED: awards carry their flight, counts are per flight, the text is "A: ... / B: ..."', () => {
        const st = LIVE.skinsState(SPLIT, CD, SPLIT.scores, field(SPLIT));
        assert.equal(st.flighted, true);
        assert.deepEqual(J(st.flights.map(f => f.flight)), ['A', 'B']);
        assert.deepEqual(J(st.awards.map(a => [a.hole, a.flight, a.playerId])), [[1, 'A', 101], [2, 'A', 101], [2, 'B', 105], [3, 'A', 102], [5, 'B', 106], [7, 'B', 107], [9, 'B', 108], [11, 'B', 105], [13, 'B', 107]]);
        // pots are per flight: $32 over A's three official skins, $32 over B's six
        assert.deepEqual(J(st.flights[0].awards.map(a => a.value)), [11, 11, 10]);
        assert.deepEqual(J(st.flights[1].awards.map(a => a.value)), [6, 6, 5, 5, 5, 5]);
        const text = LIVE.skinsStatus(SPLIT, CD, SPLIT.scores, field(SPLIT));
        assert.equal(text.text, 'A: Ann 2 \u00B7 Ben 1 / B: Eli 2 \u00B7 Gus 2');
        assert.equal(text.tone, 'up');
    });
    test('FLIGHTLESS: the golden round\'s strip is exactly what the golden froze', () => {
        const st = LIVE.skinsState(GOLD, CD, GOLD.scores, field(GOLD));
        assert.equal(st.flighted, undefined);
        assert.deepEqual(J(LIVE.skinsStatus(GOLD, CD, GOLD.scores, field(GOLD))), FIX.engine.status);
    });
    test('a flight of ZERO: "B: No skins yet" and an empty B state', () => {
        const st = LIVE.skinsState(ZERO, CD, ZERO.scores, field(ZERO));
        assert.equal(st.flights[1].awards.length, 0);
        assert.equal(LIVE.skinsStatus(ZERO, CD, ZERO.scores, field(ZERO)).text, 'A: Ann 2 \u00B7 Ben 1 / B: No skins yet');
    });
    test('a flight of ONE: Ann alone in A wins every hole she posts; the text says so', () => {
        const st = LIVE.skinsState(ONE, CD, ONE.scores, field(ONE));
        assert.equal(st.flights[0].awards.length, 18);
        assert.equal(LIVE.skinsStatus(ONE, CD, ONE.scores, field(ONE)).text, 'A: Ann 18 / B: Ben 1');
    });
    test('MID-ROUND the divergence still holds per flight: an unposted hole is in neither flight\'s awards', () => {
        const partial = round(P, splitScores(P, 4), ON);
        partial.scores[`p101_h5`] = 3;    // Ann alone on hole 5
        const st = LIVE.skinsState(partial, CD, partial.scores, field(partial));
        assert.ok(st.awards.every(a => a.hole <= 4), 'hole 5 is official for nobody');
        const by = LIVE.computeSkinsPayoutLinesByFlight(partial, CD, partial.scores);
        assert.ok(by.flights[0].gross.lines.some(l => l.hole === 5), 'the engine counts the phantom; the strip does not');
    });
});

describe('hole-events.js - one card per award, named by flight', () => {
    function cards(data, hole) {
        const after = data.scores;
        const before = Object.assign({}, after);
        data.players.forEach(p => { delete before[`p${p.id}_h${hole}`]; });
        const out = [];
        LIVE.skinsEvents(game(data), CD, after, before, field(data), hole, null, (type, icon, text) => out.push({ type, text }));
        return out.filter(e => e.type === 'SKIN_WON').map(e => e.text);
    }
    test('hole 2: TWO cards, "Ann wins 1 skin (Flight A)" and "Eli wins 1 skin (Flight B)"', () => {
        assert.deepEqual(cards(SPLIT, 2), ['Ann wins 1 skin (Flight A)', 'Eli wins 1 skin (Flight B)']);
    });
    test('hole 13: a tie in A, a skin in B - only Gus is announced, in B', () => {
        assert.deepEqual(cards(SPLIT, 13), ['Gus wins 1 skin (Flight B)']);
    });
    test('hole 1: Ann\'s skin is judged within A - B\'s four pars do not tie her', () => {
        assert.deepEqual(cards(SPLIT, 1), ['Ann wins 1 skin (Flight A)']);
    });
    test('FLIGHTLESS: the card is exactly what it was', () => {
        assert.deepEqual(cards(GOLD, 2), ['Ann wins 1 skin']);
    });
    test('a flight of one: her card names her flight', () => {
        assert.deepEqual(cards(ONE, 1), ['Ann wins 1 skin (Flight A)']);
    });
});

describe('skins.html - one Bets-ledger section per flight', () => {
    function render(data) {
        const sb = loadHtmlInlineScript('skins.html');
        sb.__testData = data;
        vm.runInContext('currentMode = "ABCD"; currentData = __testData;', sb);
        vm.runInContext('renderSkinsEngine();', sb);
        return String(sb.document.getElementById('skins-content').innerHTML || '');
    }
    const ledgerTotal = (html, section, name) => {
        const start = html.indexOf('Flight ' + section + ' Final Payout Ledger');
        const seg = html.slice(start);
        const m = new RegExp('<td class="winner-name">' + name + '</td>[\\s\\S]*?<td class="[^"]*">\\$([0-9.]+)</td>').exec(seg);
        return m ? m[1] : null;
    };
    test('FLIGHTED: two sections, each with its own pot, tables and ledger; Ann 22 in A, Eli 11 in B; hole 2 appears in BOTH', () => {
        const html = render(SPLIT);
        assert.match(html, /Flight A \u2014 4 golfers/);
        assert.match(html, /Flight B \u2014 4 golfers/);
        assert.equal((html.match(/Final Payout Ledger/g) || []).length, 2);
        assert.equal(ledgerTotal(html, 'A', 'Ann'), '22');
        assert.equal(ledgerTotal(html, 'B', 'Eli'), '11');
        assert.equal((html.match(/<td>2<\/td>\s*<td style="color:var\(--text-muted\);">/g) || []).length, 2, 'hole 2 is a skin in A and a skin in B - both hole rows drawn');
        assert.match(html, /Gross Pot<\/span>[\s\S]*?\$32 <span[^>]*>\/ 3 skins/);
        assert.match(html, /Gross Pot<\/span>[\s\S]*?\$32 <span[^>]*>\/ 6 skins/);
    });
    test('FLIGHTED mid-round: the Provisional sentence says the extra dollars are allocated within each flight', () => {
        const html = render(round(P, splitScores(P, 9), ON));
        assert.match(html, /Provisional \u2014 official through Hole 9\. Skins pay whole dollars, and the extra dollars follow the final skin count within each flight/);
    });
    test('FLIGHTLESS: one section, no flight heading, the golden totals (Ann 13 gross+net... the Step 1 numbers)', () => {
        const html = render(GOLD);
        assert.ok(!/Flight [AB]/.test(html));
        assert.equal((html.match(/Final Payout Ledger/g) || []).length, 1);
        assert.match(html, /Provisional \u2014 official through Hole 17\. Skins pay whole dollars, and the extra dollars follow the final skin count, so/);
    });
    test('a flight of ZERO renders "Nobody in this flight" and no ledger for B', () => {
        const html = render(ZERO);
        assert.match(html, /Flight B \u2014 0 golfers/);
        assert.match(html, /Nobody in this flight/);
        assert.equal((html.match(/Final Payout Ledger/g) || []).length, 1);
    });
});

describe('index.html - the SKINS WON widget and the hole-by-hole modal, per flight', () => {
    function page(data) {
        const sb = loadHtmlInlineScript('index.html', [], { search: '?game=LIVE1' });
        sb.__d = data;
        vm.runInContext('currentData = __d; liveSkinsOpen = true;', sb);
        return sb;
    }
    test('FLIGHTED widget: a block per flight; Gus in B does not appear under A', () => {
        const sb = page(SPLIT);
        const html = vm.runInContext('renderSkinsWidgetHtml()', sb);
        assert.match(html, /Flight A/); assert.match(html, /Flight B/);
        const a = html.slice(html.indexOf('Flight A'), html.indexOf('Flight B'));
        assert.ok(/Ann/.test(a) && !/Gus/.test(a), 'A lists Ann, not Gus');
        assert.match(html.slice(html.indexOf('Flight B')), /Gus/);
    });
    test('FLIGHTED modal: hole 13 is a TIE row under Flight A and a Gus skin row under Flight B', () => {
        const sb = page(SPLIT);
        vm.runInContext('document.__mount(document.getElementById("live-skins-mount")); renderLiveSkins();', sb);
        const html = vm.runInContext("document.getElementById('live-skins-mount').innerHTML", sb);
        const a = html.slice(html.indexOf('<div class="ls-flight-label">Flight A'), html.indexOf('<div class="ls-flight-label">Flight B'));
        const b = html.slice(html.indexOf('<div class="ls-flight-label">Flight B'));
        // v137 (card skins): a no-carry tie is not a row - hole 13 is simply absent
        // under A, and it is Gus's skin under B. The label reads "Hole 13".
        assert.ok(!/Hole 13 \u2014/.test(a), 'a tied hole on a no-carry round is not listed under A');
        assert.ok(!/No Skin/.test(a));
        assert.match(b, /Hole 13 \u2014 Gus \u2014 Gross \d+ \u2014 Skin/);
        assert.match(html, /FLIGHT A \u00B7 GROSS SKINS \u00B7 \$32/);
        assert.match(html, /FLIGHT B \u00B7 GROSS SKINS \u00B7 \$32/);
    });
    test('FLIGHTLESS modal: the title is WHOLE-FIELD, one ledger, no flight labels', () => {
        const sb = page(GOLD);
        vm.runInContext('document.__mount(document.getElementById("live-skins-mount")); renderLiveSkins();', sb);
        const html = vm.runInContext("document.getElementById('live-skins-mount').innerHTML", sb);
        assert.match(html, /WHOLE-FIELD NET SKINS/);
        assert.ok(!/ls-flight-label/.test(html));
        assert.match(html, /Official thru 17/);
    });
    test('a flight of ZERO: "Nobody in this flight" for B, A intact', () => {
        const sb = page(ZERO);
        const html = vm.runInContext('renderSkinsWidgetHtml()', sb);
        assert.match(html, /Nobody in this flight/);
        assert.match(html, /Ann/);
    });
    test('index.html no longer defines a birdie total of its own', () => {
        const src = read('index.html').replace(/<script src=[^>]*><\/script>/g, '');
        assert.ok(!/function calculateBirdieGameTotals(ForSettle)?\s*\(/.test(src));
    });
});

describe('settlement.html - LIVE RESULTS and SKINS WON per flight; the pool stays flight-blind', () => {
    function live(data) {
        const sb = loadHtmlInlineScript('settlement.html');
        sb.__d = data;
        vm.runInContext('currentMode = "SET1";', sb);
        return vm.runInContext('buildLiveResultsHtml(__d, __d.courseData, __d.scores)', sb);
    }
    test('FLIGHTED: two standings cards (FLIGHT A \u2014 NET, FLIGHT B \u2014 NET), ranked within the flight, and two SKINS WON cards', () => {
        const html = live(SPLIT);
        assert.match(html, /FLIGHT A \u2014 NET/); assert.match(html, /FLIGHT B \u2014 NET/);
        assert.ok(!/OVERALL \u2014 NET/.test(html));
        const a = html.slice(html.indexOf('FLIGHT A \u2014 NET'), html.indexOf('FLIGHT B \u2014 NET'));
        assert.ok(/Ann/.test(a) && !/Eli/.test(a));
        assert.equal((html.match(/SKINS WON \u2014 FLIGHT [AB]/g) || []).length, 2);
        const skB = html.slice(html.indexOf('SKINS WON \u2014 FLIGHT B'));
        assert.match(skB, /Gus/);
    });
    test('FLIGHTLESS: OVERALL \u2014 NET, one SKINS WON card, the golden\'s order (Eli first)', () => {
        const html = live(GOLD);
        assert.match(html, /OVERALL \u2014 NET/);
        assert.ok(!/FLIGHT [AB]/.test(html));
        // Re-pinned 2026-09-15 (v149): the live head now lists golfers still out in
        // roster order, so the order is read in the standings block alone.
        const standings = html.slice(html.indexOf('OVERALL \u2014 NET'), html.indexOf('View Full Leaderboard'));
        assert.ok(standings.length > 20, 'the standings block was sliced');
        assert.ok(standings.indexOf('Eli') < standings.indexOf('Cal'), 'Eli leads net');
        assert.equal((html.match(/SKINS WON/g) || []).length, 1);
    });
    test('a flight of ZERO: B says nobody, A ranks its four', () => {
        const html = live(ZERO);
        assert.match(html, /SKINS WON \u2014 FLIGHT B[\s\S]*?Nobody in this flight/);
        assert.match(html, /FLIGHT A \u2014 NET/);
    });
    test('the Main Pool skins bucket\'s ledger strips flights before asking for the hole ledger', () => {
        const src = read('settlement.html');
        const fn = src.slice(src.indexOf('function buildSkinsReceiptSection('), src.indexOf('function renderMoneyPoolSection('));
        assert.match(fn, /flights: undefined,/);
    });
});

// ---------------------------------------------------------------------------
describe('NO HOLE-KEYED SURFACE READS THE FLAT VIEW', () => {
    const strip = s => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    test('the pages and presenters that key by hole read ByFlight or the ledger\'s `flights`', () => {
        const skins = strip(read('skins.html'));
        assert.match(skins, /computeSkinsPayoutLinesByFlight\(/);
        assert.ok(!/computeSkinsPayoutLines\(/.test(skins), 'skins.html must not read the flat view');
        const index = strip(read('index.html'));
        assert.ok(!/computeSkinsPayoutLines\(/.test(index));
        // Since live-skins.js the flights loop lives there, shared by index.html,
        // leaderboard.html and settlement.html; each page reads the entries.
        assert.match(index, /liveSkinsLedgerEntries\(/, 'index.html reads the per-flight entries');
        assert.match(strip(read('live-skins.js')), /bundle\.flights \|\| \[bundle\]/, 'live-skins.js loops the hole ledger\'s flights');
        const settle = strip(read('settlement.html'));
        assert.ok(!/computeSkinsPayoutLines\(/.test(settle));
        assert.match(settle, /liveSkinsLedgerEntries\(/);
        const events = strip(read('hole-events.js'));
        assert.ok(!/computeSkinsPayoutLines/.test(events));
        assert.match(events, /now\.awards\.filter\(a => a\.hole === hole\)/, 'every award on the hole, not the first');
    });
    test('the only readers of the flat view are the engine itself and bet-strip\'s POTS read (scores withheld)', () => {
        const prod = fs.readdirSync(REPO_ROOT).filter(f => /\.(js|html)$/.test(f) && !/(_test|\.test)\.js$/.test(f) && !/^(firebase-|build-shell|sync-mobile-web)/.test(f));
        const readers = prod.filter(f => /computeSkinsPayoutLines\s*\(/.test(strip(read(f))));
        assert.deepEqual(readers.sort(), ['bet-strip.js', 'settlement-engine.js']);
        assert.match(strip(read('bet-strip.js')), /computeSkinsPayoutLines\(cfg, holes, \{\}\)/, 'bet-strip reads it for the pots only, with no scores');
    });
});
