// ============================================================================
// 💰 PAY OUT - the answer before the proof, ONE ROW PER GOLFER (v196, 2026-09-22).
//
// Until v196 the Weekly Game section opened with a PAYOUTS block grouped BY
// GAME - Skins, Net Finish, KP - with the golfers owed money under each and
// deliberately no per-golfer total. The redesign turns that inside out: the
// receipt now opens (#results-top, above the game cards) with one row per
// golfer owed cash, largest first, the amount big, and the reasons under it
// on a tap - "Skins B · Hole 2 · $21", "Net Finish 2nd · $80", "KP · Hole 3 ·
// $10" - so Max Mike is ONE row of $101 with two reasons, not two rows in two
// lists. The game cards below are the proof, unchanged in every figure.
//
// EVERY NUMBER IS THE ENGINE'S. A row's amount is the canonical ledger's
// (computeCombinedNetTotals contributions: every positive line but the buy-in,
// the Main Pool aggregate and an explained side-match rollup); the pool
// reasons are computeMoneyPool's own lines joined by golfer id - r.kp.lines
// (paid), r.net.lines (the shares the engine put on the line), r.skins.flights
// [].lines / r.skins.lines, r.refund.perPlayerCents - so a reason carries the
// hole. If the joined reasons ever fail to sum to the row, the row prints the
// ledger's lines instead (buildPayoutCardHtml's guard); these fixtures take
// the join, and say so.
//
// The list renders on a SETTLED round only (results_payout_test.js holds the
// held and live cases); the golden's round is re-used here with its four KPs
// recorded so it settles.
//
// WHAT THE HARNESS CAN PROVE. mini-dom does not parse innerHTML, so every
// assertion is on the HTML string the page wrote to #results-top. The PDF
// path reads innerText of that same node (printReceipt's roots =
// RESULTS_MOUNTS) - the Chrome block at the end reads that innerText cold.
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
// $40 on 3/7/12/16 (hole 3 recorded, the rest blank), net $200 (60/40), skins bucket $220 gross.
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
const { payoutRowsFromHtml } = require('./helpers/results-payout-v196.js');
const ALL_KP = { h3: '101', h7: '113', h12: '104', h16: '116' };
function page(data) {
    const st = loadHtmlInlineScript('settlement.html');
    st.__d = J(data);
    vm.runInContext('currentMode = "PAYOUT"; RESULTS_MOUNTS.forEach(i => document.__mount(document.getElementById(i))); renderResultsGapLine(__d); renderMoneyPoolSection(__d, __d.courseData, __d.scores); renderCombinedSummary(__d, __d.courseData, __d.scores);', st);
    const top = String(vm.runInContext("document.getElementById('results-top').innerHTML", st));
    return { top, pool: String(vm.runInContext("document.getElementById('money-pool-section').innerHTML", st)), rows: payoutRowsFromHtml(top) };
}
const nameOf = (d, id) => d.players.find(p => String(p.id) === String(id)).name;
const byGolfer = lines => { const acc = {}; lines.forEach(l => { const k = String(l.winnerId); acc[k] = (acc[k] || 0) + l.cents; }); return acc; };

describe('THE FLIGHTED POOL ROUND (the golden\'s, KPs recorded): one row per golfer, the reasons the engine\'s lines', () => {
    const d = build({ kpConfirmed: true, kpWinners: ALL_KP });
    const r = engine(d);
    const P = page(d);
    test('the list is first on the page (in #results-top, after the header), and the game cards hold no name-and-total row', () => {
        assert.ok(P.rows.rows.length >= 10, 'rows: ' + P.rows.rows.length);
        assert.ok(P.top.indexOf('id="receipt-export-head"') < P.top.indexOf('<div class="settle-card payout-card">'));
        assert.ok(!/pool-payouts|Skins Summary|pp-row/.test(P.pool));
    });
    test('largest first; every row > 0; the rows sum to the pot ("$460 of $460")', () => {
        const rows = P.rows.rows;
        for (let i = 1; i < rows.length; i++) assert.ok(rows[i].total <= rows[i - 1].total);
        rows.forEach(x => assert.ok(x.total > 0, x.name));
        assert.equal(rows.reduce((a, x) => a + Math.round(x.total * 100), 0), r.totalPoolCents);
        assert.equal(P.rows.head, '$460 of $460');
    });
    test('Skins reasons per flight: A five golfers at $23 (Hole N), B five at $21, and they sum to each pot', () => {
        r.skins.flights.forEach(pot => {
            const want = byGolfer(pot.lines);
            let sum = 0;
            Object.keys(want).forEach(id => {
                const row = P.rows.rows.find(x => x.name === nameOf(d, id));
                const mine = row.reasons.filter(re => re.label.indexOf('Skins ' + pot.flight + ' · Hole ') === 0);
                assert.equal(mine.reduce((a, re) => a + Math.round(re.amount * 100), 0), want[id], nameOf(d, id) + ' flight ' + pot.flight);
                sum += want[id];
            });
            assert.equal(sum, pot.amountCents, 'flight ' + pot.flight + ' pays its pot');
            assert.deepEqual([...new Set(pot.lines.map(l => l.cents))], [pot.flight === 'A' ? 2300 : 2100]);
        });
    });
    test('Net Finish: "Net Finish 1st · $120" on Rae Romeo, "Net Finish 2nd · $80" on Max Mike', () => {
        assert.deepEqual(P.rows.rows.find(x => x.name === 'Rae Romeo').reasons.filter(re => /^Net Finish/.test(re.label)), [{ label: 'Net Finish 1st', amount: 120 }]);
        assert.deepEqual(P.rows.rows.find(x => x.name === 'Max Mike').reasons.filter(re => /^Net Finish/.test(re.label)), [{ label: 'Net Finish 2nd', amount: 80 }]);
    });
    test('KP: each recorded hole is one reason "KP · Hole N · $10" on its winner', () => {
        r.kp.lines.forEach(l => {
            assert.equal(l.state, 'paid');
            const row = P.rows.rows.find(x => x.name === nameOf(d, l.winnerId));
            assert.ok(row.reasons.some(re => re.label === 'KP · Hole ' + l.hole && re.amount === 10), row.name + ' hole ' + l.hole);
        });
    });
    test('a golfer who wins under three games is ONE row with every reason and the combined total - Max Mike $111 (KP 7 $10 + Net Finish $80 + Skins B $21)', () => {
        const mm = P.rows.rows.find(x => x.name === 'Max Mike');
        assert.deepEqual(mm.reasons, [{ label: 'KP · Hole 7', amount: 10 }, { label: 'Net Finish 2nd', amount: 80 }, { label: 'Skins B · Hole 2', amount: 21 }]);
        assert.equal(mm.total, 111);
        assert.equal(P.rows.rows.filter(x => x.name === 'Max Mike').length, 1);
    });
    test('nobody who is owed nothing has a row; "No payout:" names exactly the rest of the 23', () => {
        const paid = new Set(Object.keys(r.perPlayerCents).filter(id => r.perPlayerCents[id] > -r.buyInCents).map(id => nameOf(d, id)));
        assert.deepEqual(new Set(P.rows.rows.map(x => x.name)), paid);
        assert.equal(P.rows.none.length + P.rows.rows.length, 23);
        P.rows.none.forEach(n => assert.ok(!paid.has(n), n));
    });
    test('every reason carries a hole or a place - the join path, not the ledger fallback - and sums to its row', () => {
        P.rows.rows.forEach(x => {
            assert.ok(x.reasons.every(re => /· Hole \d+$|^Net Finish/.test(re.label)), x.name + ': ' + JSON.stringify(x.reasons));
            assert.equal(Math.round(x.reasons.reduce((a, re) => a + re.amount, 0) * 100), Math.round(x.total * 100), x.name);
        });
    });
});

describe('FLIGHTS OFF: the same list, skins reasons without a flight letter, summing to the bucket', () => {
    const d = build({ flights: false, kpConfirmed: true, kpWinners: ALL_KP });
    const r = engine(d);
    const P = page(d);
    test('six skins, "Skins · Hole N", the golfers\' skins reasons sum to the bucket', () => {
        assert.equal(r.skins.flights, undefined);
        const all = [].concat(...P.rows.rows.map(x => x.reasons.filter(re => /^Skins · Hole \d+$/.test(re.label))));
        assert.equal(all.length, 6);
        assert.equal(all.reduce((a, re) => a + Math.round(re.amount * 100), 0), r.skins.amountCents);
        assert.ok(!/Skins [AB] ·/.test(P.top));
    });
});

describe('SCOPE FIELD on a flighted round: one pot too (the pool did not split)', () => {
    test('no flight letter on any skins reason', () => {
        const P = page(build({ scope: 'field', kpConfirmed: true, kpWinners: ALL_KP }));
        assert.ok(P.rows.rows.some(x => x.reasons.some(re => /^Skins · Hole/.test(re.label))));
        assert.ok(!/Skins [AB] ·/.test(P.top));
    });
});

describe('A GOLFER WITH TWO KPs: two reasons, both holes, one row', () => {
    test('Ann Alpha: KP · Hole 3 and KP · Hole 7, with her skin', () => {
        const d = build({ kpConfirmed: true, kpWinners: { h3: '101', h7: '101', h12: '104', h16: '116' } });
        const P = page(d);
        const ann = P.rows.rows.find(x => x.name === 'Ann Alpha');
        assert.deepEqual(ann.reasons.map(re => re.label), ['KP · Hole 3', 'KP · Hole 7', 'Skins A · Hole 1']);
        assert.equal(ann.total, 10 + 10 + 23);
    });
});

describe('A GAME WITH NO WINNERS is handled, not blank', () => {
    test('Skins with every hole tied, every KP declared nobody\'s: the unwon money refunds, and the rows are refund + net reasons', () => {
        const d = build({ birdies: [], kpConfirmed: true, kpWinners: {} });
        d.kpNoWinner = { h3: true, h7: true, h12: true, h16: true };
        const r = engine(d);
        assert.equal(r.skins.lines.length, 0); assert.ok(r.refund.cents > 0, 'the unwon skins money refunds');
        const P = page(d);
        assert.ok(P.rows.rows.length >= 20, 'every golfer with a refund has a row: ' + P.rows.rows.length);
        assert.ok(P.rows.rows.every(x => x.reasons.some(re => /^Pool refund/.test(re.label))), 'a refund reason on each');
        assert.equal(P.rows.rows.reduce((a, x) => a + Math.round(x.total * 100), 0), r.totalPoolCents, 'net places + refunds = the pot');
        assert.equal(P.rows.head, '$460 of $460');
    });
});

describe('A TIED NET PLACE: one row PER GOLFER with that golfer\'s share, from the engine\'s own line (v142 → v196)', () => {
    test('the engine has one tied line for places 1-2 ($200); the two golfers each carry "Net Finish T1st · $100"', () => {
        const d = build({ kpConfirmed: true, kpWinners: ALL_KP });
        // Rae Romeo (id 118) and Max Mike (id 113) tie for first: give Max Mike Rae's card
        const rae = d.players.find(p => p.name === 'Rae Romeo').id, max = d.players.find(p => p.name === 'Max Mike').id;
        CD.forEach(h => { d.scores['p' + max + '_h' + h.hole] = d.scores['p' + rae + '_h' + h.hole]; });
        d.players.find(p => p.name === 'Max Mike').hcp = d.players.find(p => p.name === 'Rae Romeo').hcp;
        const r = engine(d);
        assert.equal(r.net.lines.length, 1); assert.equal(r.net.lines[0].cents, 20000); assert.equal(r.net.lines[0].split, true);
        const P = page(d);
        const tied = P.rows.rows.filter(x => x.reasons.some(re => re.label === 'Net Finish T1st'));
        assert.deepEqual(tied.map(x => x.name).sort(), ['Max Mike', 'Rae Romeo']);
        tied.forEach(x => assert.equal(x.reasons.find(re => re.label === 'Net Finish T1st').amount, 100));
    });
});

describe('THE SEAM: the list consumes the engine and the ledger and derives nothing; the PDF root contains it', () => {
    const src = read('settlement.html');
    const fn = (name) => { const at = src.indexOf('function ' + name + '('); assert.ok(at > 0, name); return src.slice(at, src.indexOf('\n    function ', at + 30)); };
    test('buildPayoutCardHtml exists, renders into #results-top from the settled branch, reads contributions and r.*, and calls no allocator', () => {
        const f = fn('buildPayoutCardHtml'), j = fn('poolReasonsFor');
        assert.match(src, /topMount\.innerHTML = buildReceiptHeader\(\) \+ buildPayoutCardHtml\(contributions, sorted, pool, data\);/);
        assert.match(j, /r\.kp\.lines/); assert.match(j, /r\.net\.lines/); assert.match(j, /r\.skins\.flights/); assert.match(j, /r\.refund\.perPlayerCents/);
        assert.match(j, /netTieShares\(l\)\[i\]/, 'the tie share is the engine\'s, read from the line');
        assert.ok(!/allocateWholeDollars|splitCentsEvenly|computeSkinsHoleLedger|Math\.round\([^)]*\/ *[^)]*\)/.test(f + j), 'no allocation');
        assert.match(f, /if \(cents\(joined\) !== cents\(total\)\) \{/, 'the guard: reasons that do not sum to the row fall back to the ledger');
    });
    test('the list is inside #results-top, the second root printReceipt exports (RESULTS_MOUNTS), and the native PDF reads it by innerText', () => {
        assert.match(src, /const RESULTS_MOUNTS = \['results-gap-line', 'results-top', 'money-pool-section',/);
        assert.match(src, /const roots = RESULTS_MOUNTS/);
        assert.match(read('native-export.js'), /innerText/);
    });
});

// ---- COLD CHROME: no page function called; the round through the stand-in
// database; innerText of #results-top and #money-pool-section, the text the PDF
// is built from.
const DATA = (() => { const d = build({ kpConfirmed: true, kpWinners: ALL_KP }); d.ownerUid = 'anon-cold'; return d; })();
const DB = { events: { PAYOUT: DATA }, global_courses: {}, trips: {}, tournaments: {} };
const PROBE = `(() => { const top = document.getElementById('results-top'), pool = document.getElementById('money-pool-section'); const t = top ? top.innerText : '', p = pool ? pool.innerText : '';
  return JSON.stringify({ len: t.length, payout: t.search(/Pay out/i), header: t.indexOf('TIDEWATER'), maxMike: t.indexOf('Max Mike'), a101: (t.match(/\\$111/g) || []).length, head: t.slice(0, 80), poolTop: pool.getBoundingClientRect().top, topBottom: top.getBoundingClientRect().bottom,
    reasonsVisible: Array.from(document.querySelectorAll('.po-row')).filter(d => d.getBoundingClientRect().height > d.querySelector('summary').getBoundingClientRect().height + 2).length, a23: (p.match(/\\$23/g) || []).length, h1: p.search(/Hole 1 \\u2014/) }); })()`;
const C = {};
before(async () => {
    const r = await arriveCold({ url: fileUrl('settlement.html', 'game=PAYOUT'), db: DB, settleMs: 4000, steps: [{ expression: PROBE }] });
    C.r = r.ok ? JSON.parse(r.value[0]) : { reason: r.reason };
});
describe('COLD CHROME: the exported text', () => {
    test('ran, and the list rendered', () => { assert.ok(C.r && !C.r.reason, 'did not run: ' + (C.r && C.r.reason)); assert.ok(C.r.len > 200, 'rendered text: ' + C.r.len); });
    test('the header, then Pay out, above the game cards; the reasons are folded on screen; $23 is in the flight card rows (5) and nowhere else in the pool section', () => {
        assert.ok(C.r.header >= 0 && C.r.header < C.r.payout, 'header before Pay out: ' + JSON.stringify(C.r.head));
        assert.ok(C.r.maxMike > C.r.payout, 'a row under the head');
        assert.equal(C.r.a101, 1, 'Max Mike\'s $111 once');
        assert.ok(C.r.poolTop >= C.r.topBottom - 1, 'the game cards below the list');
        // a closed <details> is exactly its summary tall (Chrome keeps layout boxes for the hidden reasons, so a reason's own rect is not the measure)
        assert.equal(C.r.reasonsVisible, 0, 'closed on screen: no row taller than its summary');
        assert.equal(C.r.a23, 5, '$23: the five Flight A hole rows: ' + C.r.a23);
        assert.ok(C.r.h1 >= 0);
    });
});
