// ============================================================================
// THE RECEIPT'S PAYOUTS BLOCK - the answer before the proof.
//
// The Main Pool section used to open with the pot headers and eighteen hole
// rows per flight, so the person handing out cash scrolled past the proof to
// reach the answer. Now the section opens with a PAYOUTS block, grouped BY GAME
// in the order money is handed out - Skins, then Net Finish, then KP - and under
// each game only the golfers who are OWED money, name and amount, largest
// first. Skins per flight when the pool split it, one list otherwise. A golfer
// who wins under two games appears under both; the block is worked one game at
// a time, so there is deliberately NO per-golfer combined total. A game with
// nothing to pay yet says so in one line. Everything that was there before sits
// below it, unchanged.
//
// EVERY NUMBER IS THE ENGINE'S. Skins: the pool's allocated line cents, summed
// per golfer (the same sum the Skins Summary below already prints). Net Finish:
// r.net.lines[].cents. KP: r.kp.lines[].cents on 'paid' lines. A TIED net line
// is one row naming the tied golfers with the engine's combined amount - the
// engine does not expose the per-golfer share of a tie, and the block does not
// derive it (the Net Finish detail below still explains the split).
//
// WHAT THE HARNESS CAN PROVE. mini-dom does not parse innerHTML, so every
// assertion here is on the HTML string the page wrote to #money-pool-section.
// The PDF path reads innerText of that same node (native-export.js linesFrom;
// printReceipt's roots list), so the block ships in the PDF because it is
// inside the root - the Chrome block at the end reads that innerText cold.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const J = (v) => JSON.parse(JSON.stringify(v));
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = makeCourseData(18);

// The pool_flights_golden round: 23 golfers 12 A / 11 B, $20 buy-in = $460, KP
// $40 on 3/7/12/16 (unconfirmed), net $200 (60/40), skins bucket $220 gross.
// Birdies so H2 and H13 tie across the field but pay inside each flight.
function build(o) {
    const opt = o || {};
    const r = wizardSavedRound({ code: 'PAYOUT', courseData: CD, thru: opt.thru === undefined ? 18 : opt.thru,
        overrides: Object.assign({ additionalGames: {}, flights: opt.flights === false ? undefined : { enabled: true, scopes: { skins: opt.scope || 'flight', birdies: 'field' } } }, opt.overrides || {}) });
    if (opt.flights === false) delete r.flights;
    const byName = {}; r.players.forEach(p => { byName[p.name] = p.id; });
    const b = (name, hole) => { r.scores['p' + byName[name] + '_h' + hole] = CD[hole - 1].par - 1; };
    (opt.birdies || [['Ann Alpha', 1], ['Ben Bravo', 2], ['Max Mike', 2], ['Cal Charlie', 5], ['Ned November', 7], ['Dee Delta', 9],
        ['Oli Oscar', 11], ['Eli Echo', 13], ['Pat Papa', 13], ['Quy Quebec', 16]]).forEach(([n, h]) => b(n, h));
    if (opt.kpConfirmed) {
        r.kpWinners = opt.kpWinners; r.kpConfirmed = { confirmed: true };
    }
    return r;
}

const ENG = loadJsFile('pool-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
function engine(data) { ENG.__d = J(data); return J(vm.runInContext('computeMoneyPool(__d, __d.courseData, __d.scores)', ENG)); }
function receipt(data) {
    const st = loadHtmlInlineScript('settlement.html');
    st.__d = J(data);
    vm.runInContext('currentMode = "PAYOUT"; document.__mount(document.getElementById("money-pool-section")); renderMoneyPoolSection(__d, __d.courseData, __d.scores);', st);
    return String(vm.runInContext("document.getElementById('money-pool-section').innerHTML", st));
}
const $ = (c) => '$' + (c / 100).toFixed(c % 100 === 0 ? 0 : 2);
const text = (html) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/&amp;/g, '&');

// The block, as a structure: [{ game, groups: [{ flight|null, rows: [[name, amount]] , note }] }]
function parseBlock(html) {
    const at = html.indexOf('<div class="pool-payouts"'), end = html.indexOf('<!-- /pool-payouts -->');
    if (at < 0 || end < 0) return null;
    const block = html.slice(at, end);
    const games = [];
    const re = /<div class="pp-game"[^>]*>([\s\S]*?)<\/div><!-- \/pp-game -->/g;
    let m;
    while ((m = re.exec(block))) {
        const g = m[1];
        const game = { game: (g.match(/<div class="pp-game-head">([^<]*)<\/div>/) || [])[1], groups: [] };
        const gre = /<div class="pp-group"(?: data-flight="([AB])")?>([\s\S]*?)<\/div><!-- \/pp-group -->/g;
        let gm;
        while ((gm = gre.exec(g))) {
            const grp = { flight: gm[1] || null, rows: [], note: null };
            const rre = /<div class="ledger-row pp-row"><span>([^<]*)<\/span><span class="val-pos">([^<]*)<\/span><\/div>/g;
            let rm;
            while ((rm = rre.exec(gm[2]))) grp.rows.push([rm[1], rm[2]]);
            const nm = gm[2].match(/<div class="ledger-row pp-note"><span>([^<]*)<\/span>/);
            if (nm) grp.note = nm[1];
            game.groups.push(grp);
        }
        games.push(game);
    }
    return { at, end, block, games, detail: html.slice(0, at) + html.slice(end + '<!-- /pool-payouts -->'.length) };
}
// The Skins Summary rows below the block, per pot, as [name, amount] in the
// ledger's own order.
function summaryRows(html, flight) {
    const head = flight ? 'Skins Summary \u2014 Flight ' + flight : 'Skins Summary<';
    const at = html.indexOf(head);
    if (at < 0) return null;
    const seg = html.slice(at, (() => { const n = html.indexOf('Skins Summary', at + 10); const u = html.indexOf('Unwon skins', at); const f = html.indexOf('Flight ', at + 30); return Math.min(...[n, u, f, html.length].filter(x => x > 0)); })());
    return [...seg.matchAll(/<span>([^<]*) \u2014 \d+ skins?<\/span><span class="val-pos">([^<]*)<\/span>/g)].map(x => [x[1], x[2]]);
}
const cents = (s) => Math.round(parseFloat(s.replace('$', '')) * 100);

describe('THE FLIGHTED POOL ROUND (the golden\'s): the block first, per flight, every figure the engine\'s', () => {
    const data = build();
    const r = engine(data);
    const html = receipt(data);
    const P = parseBlock(html);

    test('the block exists and sits at the top: after the Main Pool header, before every pot header and hole row', () => {
        assert.ok(P, 'no payouts block in the section');
        assert.ok(P.at < html.indexOf('KP \u2014 $'), 'before the KP header');
        assert.ok(P.at < html.indexOf('Net Finish \u2014 $'), 'before the Net Finish header');
        assert.ok(P.at < html.indexOf('Skins Pot'), 'before the Skins Pot header');
        assert.ok(P.at < html.indexOf('H1 \u2014'), 'before the first hole row');
        assert.ok(html.indexOf('Main Pool \u2014 $460') < P.at, 'after the section header');
        assert.match(P.block, /PAYOUTS/);
    });
    test('grouped by game, in the order money is handed out: Skins, Net Finish, KP', () => {
        assert.deepEqual(P.games.map(g => g.game), ['Skins', 'Net Finish', 'KP']);
    });
    test('Skins is per flight - A then B - and each list is exactly the Skins Summary rows below it, largest first', () => {
        const sk = P.games[0];
        assert.deepEqual(sk.groups.map(g => g.flight), ['A', 'B']);
        sk.groups.forEach(g => {
            const below = summaryRows(html, g.flight);
            assert.ok(below && below.length >= 5, 'the ledger summary for flight ' + g.flight + ': ' + JSON.stringify(below));
            assert.deepEqual([...g.rows].sort(), [...below].sort(), 'flight ' + g.flight + ' names and amounts');
            const amts = g.rows.map(x => cents(x[1]));
            assert.deepEqual(amts, [...amts].sort((a, b) => b - a), 'largest first');
        });
    });
    test('Skins amounts are the engine\'s allocated lines summed per golfer: A five at $23, B five at $21, and they sum to each pot', () => {
        const sk = P.games[0];
        r.skins.flights.forEach((f, i) => {
            const byGolfer = {};
            f.lines.forEach(l => { byGolfer[l.winnerName] = (byGolfer[l.winnerName] || 0) + l.cents; });
            assert.deepEqual(Object.fromEntries(sk.groups[i].rows.map(x => [x[0], cents(x[1])])), byGolfer, 'flight ' + f.flight);
            assert.equal(sk.groups[i].rows.reduce((a, x) => a + cents(x[1]), 0), f.amountCents, 'sums to the pot');
        });
        assert.deepEqual(sk.groups[0].rows.map(x => x[1]), ['$23', '$23', '$23', '$23', '$23']);
        assert.deepEqual(sk.groups[1].rows.map(x => x[1]), ['$21', '$21', '$21', '$21', '$21']);
    });
    test('Net Finish is one list (never flighted): the engine\'s lines, name and amount', () => {
        const nf = P.games[1];
        assert.equal(nf.groups.length, 1); assert.equal(nf.groups[0].flight, null);
        assert.deepEqual(nf.groups[0].rows, r.net.lines.map(l => [l.names.join(' / '), $(l.cents)]));
        assert.deepEqual(nf.groups[0].rows, [['Rae Romeo', '$120'], ['Max Mike', '$80']]);
    });
    test('KP is unconfirmed on this round: ONE line saying so, no rows', () => {
        const kp = P.games[2];
        assert.equal(kp.groups.length, 1);
        assert.deepEqual(kp.groups[0].rows, []);
        assert.match(kp.groups[0].note, /not confirmed/);
        assert.match(kp.groups[0].note, /\$40/);
    });
    test('nobody who is owed nothing appears: every name in the block is a positive engine payout under that game', () => {
        const owedSkins = new Set(r.skins.lines.map(l => l.winnerName));
        const owedNet = new Set(r.net.lines.flatMap(l => l.names));
        P.games[0].groups.forEach(g => g.rows.forEach(x => { assert.ok(owedSkins.has(x[0]), x[0] + ' under Skins'); assert.ok(cents(x[1]) > 0); }));
        P.games[1].groups[0].rows.forEach(x => { assert.ok(owedNet.has(x[0]), x[0] + ' under Net Finish'); assert.ok(cents(x[1]) > 0); });
        // And the losers are not there: Wes Whiskey won nothing anywhere.
        assert.ok(!/Wes Whiskey/.test(P.block));
        assert.ok(r.perPlayerCents[String(data.players.find(p => p.name === 'Wes Whiskey').id)] < 0, 'Wes owes on the round');
    });
    test('a golfer who wins under two games appears under both - Max Mike: Skins (B) $21 and Net Finish $80 - and there is NO combined total', () => {
        const under = (i) => P.games[i].groups.flatMap(g => g.rows).filter(x => x[0] === 'Max Mike');
        assert.deepEqual(under(0), [['Max Mike', '$21']]);
        assert.deepEqual(under(1), [['Max Mike', '$80']]);
        assert.ok(!/\$101/.test(P.block), 'no $21 + $80 anywhere in the block');
        assert.ok(!/Total|TOTAL|total/.test(P.block), 'no total line of any kind');
    });
    test('the detail below is exactly what was there before: the block removed, the section is the pre-wave receipt', () => {
        // The pre-wave receipt for this round is pool_flights_golden's flight
        // variant; its detail did not move. The golden re-pins the whole section
        // and this test pins the part that must not have changed.
        assert.match(P.detail, /Skins Pot \u2014 \$220 \(Gross skins, no carry\)/);
        assert.match(P.detail, /Split by flight, by headcount: Flight A \$115 \(12 golfers\) \u00B7 Flight B \$105 \(11 golfers\)/);
        assert.equal((P.detail.match(/H\d+ \u2014/g) || []).length, 36, '18 hole rows per flight');
        assert.equal((P.detail.match(/Skins Summary/g) || []).length, 2);
        assert.ok(!/pool-payouts|pp-row|PAYOUTS/.test(P.detail), 'nothing of the block leaks into the detail');
    });
});

describe('FLIGHTS OFF: the same block, one Skins list, no flight headers', () => {
    const data = build({ flights: false });
    const r = engine(data);
    const html = receipt(data);
    const P = parseBlock(html);
    test('one Skins group, flight null, the field-wide winners largest first, summing to the bucket', () => {
        assert.ok(P);
        assert.deepEqual(P.games.map(g => g.game), ['Skins', 'Net Finish', 'KP']);
        assert.equal(P.games[0].groups.length, 1); assert.equal(P.games[0].groups[0].flight, null);
        assert.ok(!/Flight [AB]/.test(P.block), 'no flight header in the block');
        const below = summaryRows(html, null);
        assert.deepEqual([...P.games[0].groups[0].rows].sort(), [...below].sort());
        assert.equal(P.games[0].groups[0].rows.reduce((a, x) => a + cents(x[1]), 0), r.skins.amountCents);
        assert.deepEqual(P.games[0].groups[0].rows.map(x => x[1]), ['$37', '$37', '$37', '$37', '$36', '$36']);
    });
});

describe('SCOPE FIELD on a flighted round: one Skins list too (the pool did not split)', () => {
    const html = receipt(build({ scope: 'field' }));
    const P = parseBlock(html);
    test('one Skins group, no flight header', () => {
        assert.equal(P.games[0].groups.length, 1); assert.equal(P.games[0].groups[0].flight, null);
        assert.equal(P.games[0].groups[0].rows.length, 6);
    });
});

describe('KP CONFIRMED: a list, like the other games; a golfer with two KPs is one row with both', () => {
    const data = build({ kpConfirmed: true, kpWinners: { h3: '101', h7: '102', h12: '101', h16: '105' } });
    const r = engine(data);
    const html = receipt(data);
    const P = parseBlock(html);
    test('KP rows are the engine\'s paid lines summed per golfer, largest first', () => {
        const paid = r.kp.lines.filter(l => l.state === 'paid');
        assert.equal(paid.length, 4);
        const byGolfer = {};
        paid.forEach(l => { byGolfer[l.winnerName] = (byGolfer[l.winnerName] || 0) + l.cents; });
        const kp = P.games[2];
        assert.equal(kp.groups.length, 1); assert.equal(kp.groups[0].note, null);
        assert.deepEqual(Object.fromEntries(kp.groups[0].rows.map(x => [x[0], cents(x[1])])), byGolfer);
        assert.deepEqual(kp.groups[0].rows[0], ['Ann Alpha', '$20'], 'Ann holds two of the four');
        const amts = kp.groups[0].rows.map(x => cents(x[1]));
        assert.deepEqual(amts, [...amts].sort((a, b) => b - a));
    });
});

describe('A GAME WITH NO WINNERS is handled, not blank', () => {
    test('Skins with every hole tied: one line per pot, no rows', () => {
        const html = receipt(build({ birdies: [] }));
        const P = parseBlock(html);
        assert.deepEqual(P.games[0].groups.map(g => [g.flight, g.rows.length, g.note]), [['A', 0, 'No skins won \u2014 nothing to pay'], ['B', 0, 'No skins won \u2014 nothing to pay']]);
    });
    test('Net Finish with no scores posted: one line; KP confirmed with no winners: one line', () => {
        const d = build({ thru: 0, birdies: [], kpConfirmed: true, kpWinners: {} });
        d.kpNoWinner = { h3: true, h7: true, h12: true, h16: true };
        const html = receipt(d);
        const P = parseBlock(html);
        assert.equal(P.games[1].groups[0].rows.length, 0);
        assert.match(P.games[1].groups[0].note, /No scores/);
        assert.equal(P.games[2].groups[0].rows.length, 0);
        assert.match(P.games[2].groups[0].note, /no winner|refunded/i);
    });
});

describe('A TIED NET PLACE: one row naming the tied golfers with the engine\'s combined amount - nothing derived', () => {
    // Rae and Max tie: give Max the same net as Rae by taking one stroke off him
    // nowhere and instead handing Rae one more. Simpler: read the standings and
    // craft the tie from the engine's own numbers.
    const data = build();
    const r0 = engine(data);
    const first = r0.net.standings[0], second = r0.net.standings[1];
    const diff = second.net - first.net;
    // Lower `second` by `diff` strokes on hole 18 (par elsewhere untouched).
    data.scores['p' + second.id + '_h18'] = data.scores['p' + second.id + '_h18'] - diff;
    const r = engine(data);
    const html = receipt(data);
    const P = parseBlock(html);
    test('the engine now has one tied line for places 1-2 and the block prints it as one row with the combined $200', () => {
        assert.equal(r.net.lines.length, 1); assert.equal(r.net.lines[0].ids.length, 2); assert.equal(r.net.lines[0].cents, 20000);
        assert.deepEqual(P.games[1].groups[0].rows, [[r.net.lines[0].names.join(' / '), '$200']]);
        assert.match(P.games[1].groups[0].note || '', /tie|split|Net Finish below/i, 'says the amount is shared and where the split is explained');
    });
});

describe('THE SEAM: the block consumes the engine and derives nothing; the PDF root contains it', () => {
    const src = read('settlement.html');
    const at = src.indexOf('function buildPoolPayoutsHtml(');
    const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
    test('buildPoolPayoutsHtml exists, is called by renderMoneyPoolSection before any game section, and reads only r.*', () => {
        assert.ok(at > 0, 'no buildPoolPayoutsHtml');
        const render = src.slice(src.indexOf('function renderMoneyPoolSection('), src.indexOf('\n    function ', src.indexOf('function renderMoneyPoolSection(') + 30));
        const call = render.indexOf('buildPoolPayoutsHtml(');
        assert.ok(call > 0, 'not called from renderMoneyPoolSection');
        assert.ok(call < render.indexOf('r.valid && r.kp'), 'called before the KP section');
        assert.match(fn, /r\.skins\.flights/); assert.match(fn, /r\.net\.lines/); assert.match(fn, /r\.kp\.lines/);
        assert.match(fn, /l\.cents/, 'amounts are the lines\' cents');
        ['allocateWholeDollars', 'splitCentsEvenly', 'moneyPoolNetPlaceCents', 'computeMoneyPool', 'computeSkins', 'Math.round', 'Math.floor', '* ', 'toFixed'].forEach(bad =>
            assert.ok(!fn.includes(bad), 'the block must not compute money: ' + bad));
        assert.ok(!/[\w)\]]\s*\/\s*[\w(]/.test(fn), 'no division of anything (a "/" between operands)');
        assert.ok(/\+= l\.cents/.test(fn), 'the only arithmetic is summing a golfer\'s engine lines');
        assert.ok(!/ids\.length/.test(fn), 'no per-golfer split of a tie');
    });
    test('the block is inside #money-pool-section, which printReceipt exports and the native PDF reads by innerText', () => {
        assert.match(src, /const roots = \['receipt-export-head', 'settle-content', 'money-pool-section',/);
        assert.match(read('native-export.js'), /clone\.innerText/);
    });
});

// ---- COLD CHROME: what the PDF reads, in order ------------------------------
// printReceipt hands #money-pool-section to the exporter, which reads its
// innerText (the browser path prints the same DOM). This arrives on
// settlement.html cold with the flighted round in the database, touches nothing,
// and reads that innerText: the PAYOUTS block must come before the first hole
// row, and both must be present.
const DATA = build();
const DB = { events: { PAYOUT: DATA }, global_courses: {}, trips: {}, tournaments: {} };
const PROBE = `(() => { const el = document.getElementById('money-pool-section'); const t = el ? el.innerText : ''; return JSON.stringify({ len: t.length, payouts: t.indexOf('PAYOUTS'), h1: t.search(/H1 \\u2014/), skinsPot: t.indexOf('Skins Pot'), a23: (t.match(/\\$23/g) || []).length, flightA: t.indexOf('Flight A'), text: t.slice(0, 400) }); })()`;
const C = {};
before(async () => {
    const r = await arriveCold({ url: fileUrl('settlement.html', 'game=PAYOUT'), db: DB, settleMs: 4000, steps: [{ expression: PROBE }] });
    C.r = r.ok ? JSON.parse(r.value[0]) : { reason: r.reason };
});
describe('COLD CHROME: the exported text of the Main Pool section', () => {
    test('ran, and the section rendered', () => { assert.ok(C.r && !C.r.reason, 'did not run: ' + (C.r && C.r.reason)); assert.ok(C.r.len > 500, 'rendered text: ' + C.r.len); });
    test('PAYOUTS comes first, then the pot and hole detail - both in the text the PDF is built from', () => {
        assert.ok(C.r.payouts >= 0, 'PAYOUTS in innerText');
        assert.ok(C.r.h1 > C.r.payouts, 'hole rows after the block'); assert.ok(C.r.skinsPot > C.r.payouts, 'Skins Pot after the block');
        assert.ok(C.r.a23 >= 10, '$23 appears in the block (5) and the ledger (5+): ' + C.r.a23);
    });
});
