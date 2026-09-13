// ============================================================================
// THE LIVE SURFACES CONSUME THE ENGINE'S DOLLARS - and know when not to show them.
// (Skins odd-dollar wave, Step 4, 2026-09-13.)
//
// After Step 3 the engine owns the skins dollar: computeSkinsPayoutLines() is
// the per-skin ledger and allocateSkinsOddDollar() the only allocation. Step 4
// made the three surfaces that used to do their own arithmetic consume it:
//
//   skins.html      the Bets tab ledger - takes the engine's lines whole
//   bet-strip.js    the live strip - takes the engine's POTS and its allocator
//                   over the strip's OWN official-only awards (see below)
//   hole-events.js  the end-of-hole recap card - prints NO dollar on an
//                   odd-dollar round, because the dollar is not final
//
// WHY bet-strip DOES NOT TAKE THE ENGINE'S SKIN LIST. The settlement resolvers
// decide a hole from whoever has posted (settlement-engine.js, the note above
// buildSkinsLedgerFor: "wrong the moment anyone looks mid-round"). On a hole
// three golfers have not played they report a skin for the one who has. The
// strip's walk requires every participant, which is the live truth. The two
// lists therefore DIFFER mid-round, deliberately, and this file pins that
// difference so a refactor cannot "unify" them and put a phantom skin on the
// scorecard. On a finished round they agree, and that is pinned too.
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
const FLAG = { skinsRounding: 'odd-dollar' };

// The engine plus the two presenters, in index.html's load order.
const LIVE = (() => {
    const sb = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']);
    ['pool-engine.js', 'bet-strip.js', 'hole-events.js'].forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
})();

// Four golfers at $8, gross: a $32 pot. `wins` = hole -> roster index shoots 4.
// `posted` limits which holes have every score in; `partial` posts ONE golfer
// (roster index 0) on a hole nobody else has played.
function round({ wins, posted, partial, flag = true, carry = false, mode = 'gross', buyIn = 8, n = 4, hcps }) {
    const names = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay'].slice(0, n);
    const players = makePlayers(names, hcps || names.map(() => 0));
    const scores = {};
    const holes = posted || CD.map(h => h.hole);
    players.forEach(p => holes.forEach(h => { scores[`p${p.id}_h${h}`] = 5; }));
    Object.entries(wins || {}).forEach(([h, idx]) => { scores[`p${players[idx].id}_h${h}`] = 4; });
    if (partial) scores[`p${players[0].id}_h${partial}`] = 4;
    const data = Object.assign({ players, gameFormat: 'skins', skinsBuyIn: buyIn, skinsPotFormat: mode, skinsCarryOver: carry,
        courseData: CD, scores, settlementMode: 'whole-dollar' }, flag ? FLAG : {});
    return { data, players, scores };
}
const game = (data) => ({ key: 'main', format: 'skins', role: 'main', config: data });

// ---------------------------------------------------------------------------
describe('bet-strip.js - the live strip prices from the engine', () => {

    test('on a FINISHED odd-dollar round the strip\'s award values ARE the engine\'s line values, hole for hole', () => {
        const { data, players } = round({ wins: { 2: 0, 5: 1, 9: 0 } });     // $32, 3 skins: 11, 11, 10
        const st = LIVE.skinsState(data, CD, data.scores, players);
        const L = LIVE.computeSkinsPayoutLines(data, CD, data.scores);
        assert.equal(st.oddDollar, true);
        assert.deepEqual(J(st.awards.map(a => [a.hole, a.value])), J(L.gross.lines.map(l => [l.hole, l.value])));
        assert.deepEqual(J(st.awards.map(a => a.value)), [11, 11, 10]);
    });

    test('the pots come from the engine: an odd split buy-in is $3/$2 per golfer, not the pot halved', () => {
        // 5 golfers at $5 split. Legacy strip priced each half at 12.50; the engine says 15 / 10.
        const { data, players } = round({ n: 5, buyIn: 5, mode: 'split', wins: { 1: 0, 2: 1 } });
        const st = LIVE.skinsState(data, CD, data.scores, players);
        const gross = st.awards.filter(a => a.pot === 'gross').map(a => a.value);
        const net = st.awards.filter(a => a.pot === 'net').map(a => a.value);
        assert.deepEqual(J(gross), [8, 7], 'gross half $15 over two skins');
        assert.deepEqual(J(net), [5, 5], 'net half $10 over two skins');
        assert.equal(gross.reduce((a, b) => a + b, 0) + net.reduce((a, b) => a + b, 0), 25);
    });

    test('a LEGACY round prices exactly as before: pot / skins so far, floats', () => {
        const { data, players } = round({ wins: { 2: 0, 5: 1, 9: 0 }, flag: false });
        const st = LIVE.skinsState(data, CD, data.scores, players);
        assert.equal(st.oddDollar, false);
        assert.deepEqual(J(st.awards.map(a => a.value)), [32 / 3, 32 / 3, 32 / 3]);
        assert.equal(st.skinValue, 32 / 3);
    });

    test('a flagged CARRY round is legacy on the strip too, gated by skinsCarriesOver()', () => {
        const { data, players } = round({ wins: { 2: 0, 5: 1 }, carry: true });
        const st = LIVE.skinsState(data, CD, data.scores, players);
        assert.equal(st.oddDollar, false);
        assert.equal(st.skinValue, 32 / 18, 'carry prices per hole, as today');
    });

    // THE DIVERGENCE, PINNED ON PURPOSE. Read the file header before "fixing" this.
    test('MID-ROUND: an unposted hole is NOT in the strip\'s awards, and IS in the engine\'s lines', () => {
        // Holes 1-4 complete (Ann wins 1, Ben wins 3); hole 5 posted by Ann alone.
        const { data, players } = round({ wins: { 1: 0, 3: 1 }, posted: [1, 2, 3, 4], partial: 5 });
        const st = LIVE.skinsState(data, CD, data.scores, players);
        const L = LIVE.computeSkinsPayoutLines(data, CD, data.scores);
        assert.deepEqual(J(st.awards.map(a => a.hole)), [1, 3], 'the strip requires every participant; hole 5 is not decided');
        assert.deepEqual(J(L.gross.lines.map(l => l.hole)), [1, 3, 5], 'the engine decides hole 5 from the one score posted - the phantom');
        // and because the counts differ, so do the dollars each side would show:
        assert.deepEqual(J(st.awards.map(a => a.value)), [16, 16], 'strip: $32 over its two official skins');
        assert.deepEqual(J(L.gross.lines.map(l => l.value)), [11, 11, 10], 'engine: $32 over three');
        // The strip's values still came from the engine's allocator, over ITS list.
        assert.deepEqual(J(LIVE.allocateSkinsOddDollar(32, 2)), [16, 16]);
    });

    test('the strip TEXT never prints a dollar under no-carry, flagged or not (counts only)', () => {
        const { data, players } = round({ wins: { 2: 0, 5: 1, 9: 0 } });
        const flagged = LIVE.skinsStatus(data, CD, data.scores, players);
        const legacy = LIVE.skinsStatus(Object.assign({}, data, { skinsRounding: undefined }), CD, data.scores, players);
        assert.equal(flagged.text, 'Ann 2 \u00B7 Ben 1');
        assert.equal(legacy.text, flagged.text);
        assert.ok(!/\$/.test(flagged.text));
    });
});

// ---------------------------------------------------------------------------
describe('hole-events.js - the SKIN_WON recap card', () => {
    function cardFor(data, players, hole) {
        const after = data.scores;
        const before = Object.assign({}, after);
        delete before[`p${players[players.length - 1].id}_h${hole}`];   // the last score of the hole arrives
        const out = [];
        LIVE.skinsEvents(game(data), CD, after, before, players, hole, null, (type, icon, text) => out.push({ type, text }));
        return out.find(e => e.type === 'SKIN_WON');
    }

    test('FLAGGED non-carry: "Ben wins 1 skin" - no dollar, because the dollar is not final', () => {
        const { data, players } = round({ wins: { 1: 0, 3: 1 }, posted: [1, 2, 3, 4] });
        const card = cardFor(data, players, 3);
        assert.ok(card, 'the skin was announced');
        assert.equal(card.text, 'Ben wins 1 skin');
        assert.ok(!/\$/.test(card.text), 'no dollar on an odd-dollar round');
    });

    test('LEGACY: the same hole still prints today\'s figure, "Ben wins 1 skin \u00B7 $16"', () => {
        const { data, players } = round({ wins: { 1: 0, 3: 1 }, posted: [1, 2, 3, 4], flag: false });
        const card = cardFor(data, players, 3);
        assert.equal(card.text, 'Ben wins 1 skin \u00B7 $16');
    });

    test('a flagged CARRY round keeps the legacy card (excluded this wave)', () => {
        const { data, players } = round({ wins: { 1: 0, 3: 1 }, posted: [1, 2, 3, 4], carry: true });
        const card = cardFor(data, players, 3);
        // hole 2 tied and carried, so Ben's hole 3 is worth two units - and it is priced.
        assert.match(card.text, /Ben wins 2 skins \u00B7 \$\d+/);
    });
});

// ---------------------------------------------------------------------------
describe('skins.html - the Bets ledger is the engine\'s ledger', () => {
    function render(data) {
        const sb = loadHtmlInlineScript('skins.html');
        sb.__testData = data;
        vm.runInContext('currentMode = "ABCD"; currentData = __testData;', sb);
        vm.runInContext('renderSkinsEngine();', sb);
        return { sb, html: String(sb.document.getElementById('skins-content').innerHTML || '') };
    }
    // The per-golfer total from the LEDGER table (the skins tables above it
    // also name winners, so the search starts at the ledger).
    const cell = (html, name) => {
        const ledger = html.slice(html.indexOf('ledger-table'));
        const m = new RegExp('<td class="winner-name">' + name + '</td>[\\s\\S]*?<td class="[^"]*">\\$([0-9.]+)</td>').exec(ledger);
        return m ? m[1] : null;
    };

    test('FLAGGED, finished: every ledger total is the engine\'s whole-dollar sum for that golfer', () => {
        const { data, players } = round({ wins: { 2: 0, 5: 1, 9: 0 } });     // Ann 21, Ben 11
        const { html } = render(data);
        const L = LIVE.computeSkinsPayoutLines(data, CD, data.scores);
        const won = {}; players.forEach(p => { won[p.name] = 0; });
        L.gross.lines.forEach(l => { won[l.playerName] += l.value; });
        assert.equal(cell(html, 'Ann'), '21'); assert.equal(cell(html, 'Ben'), '11');
        assert.equal(won.Ann, 21); assert.equal(won.Ben, 11);
        assert.ok(!/\$21\.00|\$10\.67|\$32\.00/.test(html), 'whole dollars, not the legacy toFixed(2)');
        assert.ok(!/Provisional/.test(html), 'a finished round is not provisional');
        // the per-skin column carries each skin's own dollars, in hole order
        assert.ok(/<td>\$11<\/td>[\s\S]*<td>\$11<\/td>[\s\S]*<td>\$10<\/td>/.test(html), 'the Won column shows 11, 11, 10');
    });

    test('FLAGGED, mid-round: the ledger says "Provisional \u2014 official through Hole N"', () => {
        const { data } = round({ wins: { 1: 0, 3: 1 }, posted: [1, 2, 3, 4], partial: 5 });
        const { html } = render(data);
        assert.match(html, /Provisional \u2014 official through Hole 4/);
    });

    test('LEGACY, finished: the ledger is today\'s float ledger, byte-comparable to the engine\'s legacy lines', () => {
        const { data } = round({ wins: { 2: 0, 5: 1, 9: 0 }, flag: false });
        const { html } = render(data);
        assert.equal(cell(html, 'Ann'), '21.33'); assert.equal(cell(html, 'Ben'), '10.67');
        assert.ok(!/Provisional/.test(html));
    });

    test('the page defines no resolver and no allocation of its own, and loads the engine', () => {
        const src = read('skins.html');
        assert.ok(!/function (computeSkinsVoid|computeSkinsCarryOver|getSkinsHoleScores)\s*\(/.test(src));
        assert.match(src, /computeSkinsPayoutLines\(currentData, courseData, savedScores\)/);
        assert.match(src, /<script src="settlement-engine\.js"><\/script>/);
    });
});

// ---------------------------------------------------------------------------
// NO SURFACE REIMPLEMENTS THE ALLOCATION. The rule is one function in one file;
// everything else calls it or reads its output. A second floor/remainder loop,
// a second ceil/floor split, or a page reading the flag by name instead of
// asking skinsOddDollarApplies() is how the four calculateMatchEngine copies
// happened.
// ---------------------------------------------------------------------------
describe('ONE ALLOCATION, ONE FILE', () => {
    const SURFACES = ['bet-strip.js', 'hole-events.js', 'skins.html', 'index.html', 'leaderboard.html', 'settlement.html', 'sidematches.html', 'trip.html', 'stats.html', 'pool-engine.js', 'money-engine.js', 'action-model.js'];
    const stripComments = s => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

    test('allocateSkinsOddDollar is DEFINED once, in settlement-engine.js, and CALLED only there and in bet-strip.js', () => {
        const defs = (read('settlement-engine.js').match(/function allocateSkinsOddDollar\s*\(/g) || []).length;
        assert.equal(defs, 1);
        SURFACES.forEach(f => {
            const code = stripComments(read(f));
            assert.ok(!/function allocateSkinsOddDollar/.test(code), f + ' defines the allocator');
            const calls = (code.match(/allocateSkinsOddDollar\s*\(/g) || []).length;
            if (f === 'bet-strip.js') assert.equal(calls, 1, 'bet-strip calls it once, over its own awards');
            else assert.equal(calls, 0, f + ' must consume lines, not call the allocator');
        });
    });

    test('no surface splits a buy-in or reads the flag by name - only the engine does', () => {
        SURFACES.forEach(f => {
            const code = stripComments(read(f));
            assert.ok(!/Math\.(ceil|floor)\(\s*buyIn\s*\/\s*2/.test(code), f + ' splits the buy-in itself');
            assert.ok(!/skinsRounding/.test(code), f + ' reads skinsRounding directly');
            // The literal may appear only as a comparison against the engine's
            // ledger `rule` field - never against round data.
            const literals = code.match(/[^\n]{0,40}['"]odd-dollar['"]/g) || [];
            literals.forEach(l => assert.match(l, /rule === ['"]odd-dollar['"]/, f + ' reads the flag by name instead of asking skinsOddDollarApplies(): ' + l.trim()));
        });
        const eng = stripComments(read('settlement-engine.js'));
        assert.equal((eng.match(/skinsRounding/g) || []).length, 1, 'the engine reads the flag in exactly one place');
    });

    test('the rule itself lives in exactly one function (one floor-and-remainder loop in the tree)', () => {
        const eng = stripComments(read('settlement-engine.js'));
        assert.equal((eng.match(/remainder -= 1/g) || []).length, 1);
        SURFACES.forEach(f => assert.ok(!/remainder -= 1/.test(stripComments(read(f))), f + ' has its own remainder loop'));
    });
});
