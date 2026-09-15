// ============================================================================
// RESULTS: WEEKLY GAME, A TIE SPLIT ONE GOLFER AT A TIME, PLACE NUMBERS (v142).
// settlement.html only. Presentation, not numbers.
//
//   1. The pool's section header reads "Weekly Game" (the stored key stays
//      moneyPool). Nothing rendered on the page says "Main Pool" any more.
//   2. The payouts block has no title line ("hand out in this order" is gone);
//      the block and its by-game grouping are as they were.
//   3. A tied net place is one row PER GOLFER with that golfer's share. At v142
//      pool-engine.js exposed the group line only, and netTieShares() reproduced
//      the share by calling the engine's own allocators with the engine's own
//      inputs. Since Wave A fix 1 the engine puts {shares} on the line and
//      netTieShares() reads them (tie_shares_test.js) - the rows still sum to
//      the group amount exactly, match the Net Finish detail (which reads the
//      same function), and match the cents the engine actually paid.
//   4. Every Net Finish payout row carries its place: 1, 2, T3, T3 - the
//      engine's `place` (players ahead + 1; a tie consumes the places it
//      spans) with a T on a split line, the leaderboard's rule.
//
// THE PROOF, v136-v141's method: weekly_game_prev.fixture.json holds the
// tag-stripped text of the Weekly Game section (and the other sections) on
// four rounds, captured at 2485fd6 (v141). Today's text must equal the old
// text with exactly these substitutions: the header renamed, the title line
// removed, each net payout row replaced by its per-golfer rows with places,
// the "tied place is one row" note removed - and on a LEGACY round's tie
// detail, "$33.33 each" replaced by the cents the engine paid. Every other
// section is identical character for character.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makePlayers, makeCourseData } = require('./helpers/fixtures.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const strip = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const CD = makeCourseData(18); const J = v => JSON.parse(JSON.stringify(v));

// ---- the rounds the capture used --------------------------------------------
function base(flights) {
    const r = wizardSavedRound({ code: 'WEEKLY', courseData: CD, thru: 18, overrides: { additionalGames: {}, flights: flights === undefined ? undefined : flights } });
    if (flights === undefined) delete r.flights;
    const byName = {}; r.players.forEach(p => { byName[p.name] = p.id; });
    r.__b = (name, hole) => { r.scores['p' + byName[name] + '_h' + hole] = CD[hole - 1].par - 1; };
    const id = i => String(r.players[i].id);
    r.kpWinners = { h3: id(0), h7: id(4), h12: id(8), h16: id(1) }; r.kpConfirmed = { confirmed: true, at: 1 };
    return r;
}
const GOLDEN = ['Ann Alpha', 1, 'Ben Bravo', 2, 'Max Mike', 2, 'Cal Charlie', 5, 'Ned November', 7, 'Dee Delta', 9, 'Oli Oscar', 11, 'Eli Echo', 13, 'Pat Papa', 13, 'Quy Quebec', 16];
function golden(flights) { const r = base(flights); for (let i = 0; i < GOLDEN.length; i += 2) r.__b(GOLDEN[i], GOLDEN[i + 1]); delete r.__b; return r; }
// Eight golfers, three tied for FIRST on net 71, one alone in 4th; a $100 purse
// over 50/30/20 so the tie consumes all three places: $100 -> 34/33/33
// whole-dollar, 33.34/33.33/33.33 on a legacy (cents) round.
function threeTied() {
    const players = makePlayers(['Bobby Blue', 'Tommy Teal', 'Sammy Sage', 'Danny Dune', 'Eddie Elm', 'Frankie Fir', 'Gerry Gold', 'Harry Hill'], [0, 0, 0, 0, 0, 0, 0, 0]);
    const scores = {}; players.forEach(p => CD.forEach(h => { scores[`p${p.id}_h${h.hole}`] = h.par; }));
    [[0, 2], [1, 6], [2, 11]].forEach(([i, h]) => { scores[`p${players[i].id}_h${h}`] = CD[h - 1].par - 1; });
    scores[`p${players[3].id}_h5`] = CD[4].par + 1;
    return { eventName: 'Weekly', players, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar',
        moneyPool: { enabled: true, buyIn: 20, kp: { amount: 0, holes: [] }, net: { amount: 100, places: [50, 30, 20] }, skins: { mode: 'fixed', amount: 60, scoring: 'gross', carryOver: false } } };
}
function threeTiedLegacy() { const r = threeTied(); delete r.settlementMode; delete r.skinsRounding; return r; }
// Two tied for SECOND after a clear winner: 1, T2, T2 - the place after the tie is consumed.
function twoTiedSecond() {
    const r = threeTied();
    r.scores[`p${r.players[0].id}_h9`] = CD[8].par - 1;   // Bobby: two birdies, alone in 1st
    return r;
}
const ROUNDS = { 'golden-off': () => golden(undefined), 'golden-flight': () => golden({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } }), 'three-tied-first': threeTied, 'three-tied-legacy': threeTiedLegacy };
const MOUNTS = ['money-pool-section', 'combined-settlement-summary', 'settle-content', 'receipt-scorecard'];
// Arrive the way a golfer does: the page loads with the link, the round through
// its own value listener.
function arrive(data) {
    const sb = loadHtmlInlineScript('settlement.html', [], { search: '?game=WEEKLY' });
    vm.runInContext(MOUNTS.map(m => 'document.__mount(document.getElementById("' + m + '"));').join(''), sb);
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/WEEKLY');
    assert.ok(h, 'settlement.html registered its round listener');
    h.cb({ val: () => J(data), exists: () => true });
    const raw = id => String(vm.runInContext("(document.getElementById('" + id + "')||{}).innerHTML || ''", sb));
    return { raw, text: id => strip(raw(id)), engine: JSON.parse(vm.runInContext('JSON.stringify(computeMoneyPool(__d, __d.courseData, __d.scores))', Object.assign(sb, { __d: J(data) }))) };
}
const block = html => { const a = html.indexOf('<div class="pool-payouts"'), tag = '<!-- /pool-payouts -->', e = html.indexOf(tag); return a > -1 ? html.slice(a, e + tag.length) : ''; };
const detail = html => { const a = html.indexOf('<div class="pool-payouts"'), tag = '<!-- /pool-payouts -->', e = html.indexOf(tag); return a > -1 ? html.slice(0, a) + html.slice(e + tag.length) : html; };
const rowsIn = html => [...html.matchAll(/<div class="ledger-row pp-row"><span>([^<]*)<\/span><span class="val-pos">([^<]*)<\/span><\/div>/g)].map(m => [m[1], m[2]]);
const netRowsOf = html => { const b = block(html); const a = b.indexOf('pp-game-head">Net Finish<'); const e = b.indexOf('<!-- /pp-game -->', a); return rowsIn(b.slice(a, e)); };
const cents = s => Math.round(parseFloat(s.replace(/[^0-9.]/g, '')) * 100);
const undate = t => t.replace(/\|[A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}, \d{4}\|/g, '|<date>|');

// ---------------------------------------------------------------------------
describe('1. WEEKLY GAME', () => {
    test('the section header says Weekly Game with the pot; "Main Pool" is nowhere in the rendered page', () => {
        const el = arrive(ROUNDS['golden-off']());
        const pool = el.text('money-pool-section');
        assert.match(pool, /\|🏆 Weekly Game — \$460\|/);
        MOUNTS.forEach(m => assert.doesNotMatch(el.text(m), /Main Pool/i, m));
    });
    test('the source renders no "Main Pool" outside comments; the stored key is still moneyPool', () => {
        const s = read('settlement.html').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
        assert.doesNotMatch(s, /Main Pool/);
        assert.match(read('settlement.html'), /data\.moneyPool|moneyPool/);
    });
});

describe('2. NO TITLE LINE', () => {
    test('the payouts block opens with its first game heading; "hand out in this order" is gone from the page and the source', () => {
        const el = arrive(ROUNDS['golden-off']());
        const b = block(el.raw('money-pool-section'));
        assert.ok(b.length > 200, 'the block is there');
        assert.match(b, /^<div class="pool-payouts"><div class="pp-game"><div class="pp-game-head">Skins<\/div>/);
        assert.doesNotMatch(b, /pp-title|PAYOUTS|hand out/);
        assert.doesNotMatch(read('settlement.html'), /hand out in this order|pp-title/);
        assert.match(b, /pp-game-head">Net Finish</); assert.match(b, /pp-game-head">KP</);
    });
});

describe('3. A TIED PLACE, ONE ROW PER GOLFER', () => {
    test('three tied for first, $100 over three places (whole-dollar): T1 34 / 33 / 33, summing to the group amount, matching the detail and the engine', () => {
        const el = arrive(threeTied());
        const html = el.raw('money-pool-section');
        const rows = netRowsOf(html);
        assert.deepEqual(rows.map(r => r[0]), ['T1 · Bobby Blue', 'T1 · Sammy Sage', 'T1 · Tommy Teal']);
        assert.deepEqual(rows.map(r => r[1]), ['$34', '$33', '$33']);
        const line = el.engine.net.lines[0];
        assert.equal(line.cents, 10000); assert.equal(line.split, true);
        assert.equal(rows.reduce((a, r) => a + cents(r[1]), 0), line.cents, 'the split rows sum to the group amount exactly');
        // The detail below prints the same shares.
        assert.match(strip(detail(html)), /\|Bobby Blue \$34 · Sammy Sage \$33 · Tommy Teal \$33\|/);
        // And the engine paid exactly those cents: perPlayerCents is net of the
        // buy-in, plus each golfer's $20 skin.
        const skins = {}; el.engine.skins.lines.forEach(l => { skins[String(l.winnerId)] = (skins[String(l.winnerId)] || 0) + l.cents; });
        line.ids.forEach((id, i) => assert.equal(el.engine.perPlayerCents[String(id)], cents(rows[i][1]) + (skins[String(id)] || 0) - el.engine.buyInCents, line.names[i] + ' was paid what the row says'));
        assert.doesNotMatch(strip(html), /A tied place is one row/, 'the explainer went with the combined row');
    });
    test('the same tie on a LEGACY (cents) round: 33.34 / 33.33 / 33.33 - the cents the engine paid, in the block and the detail', () => {
        const el = arrive(threeTiedLegacy());
        const html = el.raw('money-pool-section');
        const rows = netRowsOf(html);
        assert.deepEqual(rows.map(r => r[1]), ['$33.34', '$33.33', '$33.33']);
        assert.equal(rows.reduce((a, r) => a + cents(r[1]), 0), 10000);
        assert.match(strip(detail(html)), /\|Bobby Blue \$33\.34 · Sammy Sage \$33\.33 · Tommy Teal \$33\.33\|/, 'the detail no longer rounds to "each"');
        const line = el.engine.net.lines[0];
        line.ids.forEach((id, i) => assert.equal(el.engine.perPlayerCents[String(id)], cents(rows[i][1]) + 2000 - el.engine.buyInCents, line.names[i]));
    });
    test('an untied place is one row, unchanged in amount', () => {
        const el = arrive(ROUNDS['golden-off']());
        assert.deepEqual(netRowsOf(el.raw('money-pool-section')), [['1 · Rae Romeo', '$120'], ['2 · Max Mike', '$80']]);
    });
});

describe('4. PLACE NUMBERS', () => {
    test('1, 2 on a clean finish; T1 T1 T1 on a three-way tie for first; 1, T2, T2 when two tie for second', () => {
        assert.deepEqual(netRowsOf(arrive(ROUNDS['golden-off']()).raw('money-pool-section')).map(r => r[0].split(' · ')[0]), ['1', '2']);
        assert.deepEqual(netRowsOf(arrive(threeTied()).raw('money-pool-section')).map(r => r[0].split(' · ')[0]), ['T1', 'T1', 'T1']);
        const el = arrive(twoTiedSecond());
        const rows = netRowsOf(el.raw('money-pool-section'));
        assert.deepEqual(rows.map(r => r[0]), ['1 · Bobby Blue', 'T2 · Sammy Sage', 'T2 · Tommy Teal']);
        assert.deepEqual(rows.map(r => r[1]), ['$50', '$25', '$25'], 'the tie consumed 2nd and 3rd: $30 + $20 split');
        assert.deepEqual(el.engine.net.lines.map(l => l.place), [1, 2], 'the engine\'s place is players ahead + 1');
    });
    test('the label is built from the engine\'s place and split, nothing recomputed', () => {
        const s = read('settlement.html');
        assert.match(s, /function netPlaceLabel\(l\) \{\s*return \(l\.split \? 'T' : ''\) \+ l\.place;\s*\}/);
    });
});

// ---------------------------------------------------------------------------
describe('THE PROOF — the old text with exactly this wave\'s substitutions IS the new text; everything else identical', () => {
    const PREV = JSON.parse(read('weekly_game_prev.fixture.json')).rounds;
    test('the previous capture is pinned', () => {
        assert.equal(sha(PREV['golden-off'].pool).slice(0, 8), '097d5f75');
        assert.equal(sha(PREV['three-tied-first'].pool).slice(0, 8), '5296ae23');
        assert.match(PREV['three-tied-first'].pool, /\|Bobby Blue \/ Sammy Sage \/ Tommy Teal\|\$100\|A tied place is one row with the combined amount/, 'before: one combined row and the note');
        assert.match(PREV['golden-off'].pool, /\|💵 PAYOUTS — hand out in this order\|/);
    });
    Object.keys(ROUNDS).forEach(k => {
        test(k + ': the other sections are character for character the same', () => {
            const el = arrive(ROUNDS[k]());
            assert.equal(undate(el.text('combined-settlement-summary')), undate(PREV[k].summary));
            assert.equal(el.text('settle-content'), PREV[k].content);
            assert.equal(undate(el.text('receipt-scorecard')), undate(PREV[k].scorecard));
        });
        test(k + ': the Weekly Game section is the old text with only the four substitutions', () => {
            const el = arrive(ROUNDS[k]());
            const now = el.text('money-pool-section');
            // Build the expected text from the OLD text and the engine's lines.
            let expected = PREV[k].pool
                .replace('|🏆 Main Pool — ', '|🏆 Weekly Game — ')
                .replace('|💵 PAYOUTS — hand out in this order', '')
                .replace('|A tied place is one row with the combined amount — the split is under Net Finish below', '');
            const oldRows = el.engine.net.lines.map(l => '|' + l.names.join(' / ') + '|' + (l.cents % 100 === 0 ? '$' + (l.cents / 100) : '$' + (l.cents / 100).toFixed(2)));
            const newRows = netRowsOf(el.raw('money-pool-section')).map(r => '|' + r[0] + '|' + r[1]);
            const a = expected.indexOf('|Net Finish|') + '|Net Finish'.length;
            const head = expected.slice(0, a), tail = expected.slice(a);
            const joinedOld = oldRows.join('');
            assert.ok(tail.startsWith(joinedOld), 'the old net rows are where expected: ' + tail.slice(0, 80));
            expected = head + newRows.join('') + tail.slice(joinedOld.length);
            if (k === 'three-tied-legacy') expected = expected.replace('|$33.33 each|', '|Bobby Blue $33.34 · Sammy Sage $33.33 · Tommy Teal $33.33|');
            assert.equal(now, expected);
        });
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAM', () => {
    // Wave A fix 1: netTieShares no longer calls the allocators - pool-engine.js
    // puts the shares on the line and the page reads them (tie_shares_test.js).
    test('netTieShares reads the shares the engine put on the line, and both the block and the detail read it', () => {
        const s = read('settlement.html');
        const fn = s.slice(s.indexOf('function netTieShares('), s.indexOf('\n    function ', s.indexOf('function netTieShares(') + 30));
        assert.match(fn, /l\.shares/);
        assert.ok(!/allocateWholeDollars|splitCentsEvenly|isWholeDollarRound/.test(fn), 'no allocator, no predicate of its own');
        assert.equal((s.match(/= netTieShares\(l\)/g) || []).length, 2, 'the block and the detail');
    });
    test('the engines were not touched', () => {
        const h = f => sha(read(f)).slice(0, 8);
        // Wave A fix 1: pool-engine.js re-pinned - net lines now carry {shares}, the array the engine paid a tie from; additive, every figure unchanged (tie_shares_test.js).
        assert.equal(h('pool-engine.js'), 'd47a1e0a');
        assert.equal(h('settlement-engine.js'), '42923121');   // 42923121: computeRoundSettlement appended (trip money, 2026-09-15, approved); no arithmetic changed
        assert.equal(h('money-engine.js'), '3c960947');
        assert.equal(h('live-skins.js'), '632bbb1a');
    });
});
