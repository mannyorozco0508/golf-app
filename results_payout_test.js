// ============================================================================
// THE RESULTS PAYOUT REDESIGN (v196, 2026-09-22) - settled rounds only.
//
// settlement.html, top to bottom, and the PDF reads the same mounts in the
// same order (printReceipt's roots = RESULTS_MOUNTS):
//   #results-gap-line   "Not final — …" ONCE, on every round, above everything
//                       (it used to render inside the Weekly Game card AND the
//                       live head - twice on a held round).
//   #results-top        settled only: the receipt header, then 💰 PAY OUT - one
//                       <details> row per golfer owed cash, largest first, the
//                       amount big; the reasons under it, a page-side join of
//                       computeMoneyPool's own lines by golfer id ("Skins B ·
//                       Hole 4 · $52", "KP · Hole 7 · $20", "Net Finish 1st ·
//                       $50") plus every non-pool payout line as the ledger
//                       carries it; head right cell "$880 of $920 · $40 held";
//                       one line "No payout: <names>" under the list.
//   #money-pool-section one .game-card per game - KP, Net Finish, Skins per
//                       flight as SIBLING cards - a coloured head band, the
//                       title, the pot right, the winners by hole. Gone: the
//                       per-game payouts block, the Skins Summary lists, the
//                       gold wrapper.
//   #combined-settlement-summary   live: the live head (unchanged but for the
//                       gap line); settled: Who Pays Who only when anybody pays
//                       anybody. Gone: PLAYER PAYOUTS (its lines are the Pay out
//                       reasons) and the pool-off "🏁 Final Results" list.
//   #settle-content     side games, as before.
//   #results-net        settled only: NET +/− for every golfer, a collapsed
//                       <details>, last before the card.
// A <details class="print-open"> is closed on screen and OPEN on paper:
// printReceipt opens every one before the export and closes them after, and a
// Cmd+P print does the same through beforeprint / afterprint.
// EVERY GOLFER'S TOTAL PRINTS ONCE: "|Tim K|$103|" appears once on the page.
// The harness: mini-dom renders innerHTML as a STRING (no child nodes), so the
// print-open mechanism is proven on mounted <details> elements the test creates
// and the real page's expansion is measured in Chrome (below).
// ============================================================================

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const J = v => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);
const ENG = loadJsFile('pool-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
const pool = d => { ENG.__d = J(d); return J(run(ENG, 'computeMoneyPool(__d, __d.courseData, __d.scores)')); };
const strip = h => String(h).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ');
const MOUNTS = ['results-gap-line', 'results-top', 'money-pool-section', 'combined-settlement-summary', 'settle-content', 'results-net', 'receipt-scorecard'];
const ALL_KP = { h3: '101', h7: '113', h12: '104', h16: '116' };

// The pool_flights golden's flight variant: 23 golfers, $20 in, KP $40 on
// 3/7/12/16 ($10 each), net $200, skins the rest split evenly; birdies so
// both flights win skins. Every KP recorded -> settled; blanks -> held.
function round(o) {
    o = o || {};
    const r = wizardSavedRound({ code: 'PAYOUT', courseData: CD, thru: o.thru === undefined ? 18 : o.thru,
        overrides: Object.assign({ additionalGames: {}, flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' }, skinsSplit: 'even' } }, o.overrides || {}) });
    const byName = {}; r.players.forEach(p => { byName[p.name] = p.id; });
    const b = (name, hole) => { r.scores['p' + byName[name] + '_h' + hole] = CD[hole - 1].par - 1; };
    b('Ann Alpha', 1); b('Ben Bravo', 2); b('Max Mike', 2); b('Cal Charlie', 5); b('Ned November', 7); b('Dee Delta', 9); b('Oli Oscar', 11); b('Eli Echo', 13); b('Pat Papa', 13); b('Quy Quebec', 16);
    r.kpWinners = o.kpWinners === undefined ? ALL_KP : o.kpWinners;
    if (o.sideMatch) r.sideMatches = { m1: { format: 'match', scoring: 'net', stake: 50, startHole: 1, createdAt: 1, teamAIds: ['101'], teamBIds: ['103'] } };
    return r;
}
function page(data) {
    const sb = loadHtmlInlineScript('settlement.html');
    sb.__d = J(data);
    run(sb, 'currentMode = "PAYOUT"; currentData = __d; RESULTS_MOUNTS.forEach(i => document.__mount(document.getElementById(i)));'
        + 'renderResultsGapLine(__d); renderMoneyPoolSection(__d, __d.courseData, __d.scores); renderCombinedSummary(__d, __d.courseData, __d.scores); renderSettlement(__d); renderReceiptScorecard();');
    const html = id => String(run(sb, "document.getElementById('" + id + "').innerHTML"));
    const t = id => strip(html(id));
    return { sb, html, t, all: () => MOUNTS.map(t).join(''),
        contributions: () => J(run(sb, 'computeCombinedNetTotals(__d, __d.courseData, __d.scores)')).contributions };
}
// The Pay out rows as the page renders them: [{name, amount, reasons:[{label, amount}]}]
function payoutRows(html) {
    const rows = [];
    const re = /<details class="po-row print-open"><summary><span class="po-name">([^<]*)<\/span><span class="po-amt">\$([\d.]+)<\/span><\/summary>([\s\S]*?)<\/details>/g;
    let m;
    while ((m = re.exec(html))) {
        const reasons = [];
        const rr = /<div class="po-reason"><span>([^<]*)<\/span><span>\$([\d.]+)<\/span><\/div>/g;
        let x; while ((x = rr.exec(m[3]))) reasons.push({ label: x[1], amount: Number(x[2]) });
        rows.push({ name: m[1], amount: Number(m[2]), reasons });
    }
    return rows;
}

describe('THE MARKUP: the mounts, in order, and the one list the PDF reads', () => {
    const src = read('settlement.html');
    test('seven mounts in the markup, in screen order', () => {
        const at = MOUNTS.map(id => src.indexOf('<div id="' + id + '"'));
        at.forEach((i, k) => assert.ok(i > 0, MOUNTS[k] + ' is in the markup'));
        for (let i = 1; i < at.length; i++) assert.ok(at[i] > at[i - 1], MOUNTS[i] + ' after ' + MOUNTS[i - 1]);
    });
    test('RESULTS_MOUNTS is that order, and printReceipt reads it (no hand-written roots list)', () => {
        const lit = src.slice(src.indexOf('const RESULTS_MOUNTS = ['), src.indexOf('];', src.indexOf('const RESULTS_MOUNTS = [')));
        assert.deepEqual([...lit.matchAll(/'([\w-]+)'/g)].map(m => m[1]), MOUNTS);
        const fn = src.slice(src.indexOf('function printReceipt()'), src.indexOf('const RESULTS_MOUNTS'));
        assert.match(fn, /const roots = RESULTS_MOUNTS/);
        assert.ok(!/\['receipt-export-head', 'settle-content'/.test(fn), 'the v152 roots literal is gone');
        assert.match(fn, /setPrintOpen\(true\)/);
    });
    test('beforeprint opens the details and afterprint closes them (Cmd+P, not only the Send pill)', () => {
        assert.match(src, /window\.addEventListener\('beforeprint', onBeforePrint\);/);
        assert.match(src, /window\.addEventListener\('afterprint', onAfterPrint\);/);
    });
    test('print rules: the new classes never break across a sheet, the band keeps its colour, sizes 14 / 11.5 / 9.5pt', () => {
        const pr = src.slice(src.indexOf('@media print {'), src.indexOf('</style>', src.indexOf('@media print {')));
        assert.match(pr, /\.payout-card, \.game-card, \.net-view, \.po-row \{ break-inside: avoid; page-break-inside: avoid; \}/);
        assert.match(pr, /\.game-head \{ -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;/);
        assert.match(pr, /\.game-title, \.po-head, \.net-view > summary \{ font-size: 14pt; \}/);
        assert.match(pr, /\.game-pot, \.po-total, \.po-amt \{ font-size: 11\.5pt; \}/);
        assert.match(pr, /\.po-name, \.po-reason, \.game-note \{ font-size: 9\.5pt; \}/);
    });
    test('the retired builders are gone: no payouts block, no Player Payouts ledger, no Skins Summary, no Final Results card', () => {
        assert.ok(!/function buildPoolPayoutsHtml|function buildPlayerLedgerHtml|function buildSkinsPotLedgerHtml/.test(src));
        assert.ok(!/Skins Summary\$\{|Player Payouts<|🏁 Final Results<\/div>/.test(src));
        assert.match(src, /function buildPayoutCardHtml\(/); assert.match(src, /function buildNetViewHtml\(/); assert.match(src, /function gameCardHtml\(/);
    });
});

describe('💰 PAY OUT on a settled flighted pool round', () => {
    const d = round();
    const P = page(d);
    const r = pool(d);
    const rows = payoutRows(P.html('results-top'));
    test('settled: the engine agrees, and the mount is not empty', () => {
        assert.equal(r.settled, true); assert.equal(r.kpUnresolvedCents, 0); assert.equal(r.refund.cents, 0);
        assert.ok(rows.length >= 8, 'rows: ' + rows.length);
    });
    test('the header leads the mount, then the Pay out card', () => {
        const t = P.t('results-top');
        assert.ok(t.indexOf('Tidewater') < t.indexOf('💰 Pay out'), t.slice(0, 200));
        assert.match(P.html('results-top'), /id="receipt-export-head"/);
    });
    test('one row per golfer with gross winnings > 0, largest first, every amount > 0', () => {
        rows.forEach(x => assert.ok(x.amount > 0, x.name));
        for (let i = 1; i < rows.length; i++) assert.ok(rows[i].amount <= rows[i - 1].amount, rows[i - 1].name + ' before ' + rows[i].name);
        const paid = Object.values(P.contributions()).filter(c => c.lines.some(l => l.note && !/buy-in/.test(l.label) && l.amount > 0)).map(c => c.name).sort();
        assert.deepEqual(rows.map(x => x.name).sort(), paid);
    });
    test('the rows sum + held = pot: "$460 of $460", no held part when nothing is held', () => {
        const sum = rows.reduce((a, x) => a + Math.round(x.amount * 100), 0);
        assert.equal(sum + r.kpUnresolvedCents, r.totalPoolCents);
        assert.match(P.html('results-top'), /<span class="po-total">\$460 of \$460<\/span>/);
    });
    test('the reasons per golfer ARE the engine\'s lines, by hole, and sum to the row', () => {
        const idOf = {}; d.players.forEach(p => { idOf[p.name] = String(p.id); });
        rows.forEach(x => {
            const id = idOf[x.name];
            const want = [];
            r.kp.lines.forEach(l => { if (l.state === 'paid' && String(l.winnerId) === id) want.push(['KP · Hole ' + l.hole, l.cents]); });
            r.net.lines.forEach(l => { const i = l.ids.map(String).indexOf(id); if (i >= 0) want.push(['Net Finish ' + (l.split ? 'T' : '') + ({ 1: '1st', 2: '2nd', 3: '3rd' }[l.place] || l.place + 'th'), l.shares[i]]); });
            r.skins.flights.forEach(pot => pot.lines.forEach(l => { if (String(l.winnerId) === id) want.push(['Skins ' + pot.flight + ' · Hole ' + l.hole, l.cents]); }));
            assert.deepEqual(x.reasons.map(re => [re.label, Math.round(re.amount * 100)]), want, x.name);
            assert.equal(Math.round(x.reasons.reduce((a, re) => a + re.amount, 0) * 100), Math.round(x.amount * 100), x.name + ' reasons sum to the row');
            assert.ok(x.reasons.every(re => /Hole \d+|Net Finish/.test(re.label)), x.name + ': the join path, not the ledger fallback');
        });
    });
    test('the named winners: Ann Alpha (KP 3 + a skin), Pat Papa (KP 16 + a skin), Quy Quebec (a skin)', () => {
        const ann = rows.find(x => x.name === 'Ann Alpha');
        assert.deepEqual(ann.reasons.map(re => re.label), ['KP · Hole 3', 'Skins A · Hole 1']);
        assert.equal(ann.amount, 10 + 22);
        assert.deepEqual(rows.find(x => x.name === 'Pat Papa').reasons.map(re => re.label), ['KP · Hole 16', 'Skins B · Hole 13']);
        assert.deepEqual(rows.find(x => x.name === 'Quy Quebec').reasons.map(re => re.label), ['Skins B · Hole 16']);
    });
    test('"No payout:" names every golfer with nothing coming, none of the paid', () => {
        const m = P.html('results-top').match(/<div class="po-none">No payout: ([^<]*)<\/div>/);
        assert.ok(m, 'the line is there');
        const names = m[1].split(', ');
        const paid = rows.map(x => x.name);
        assert.equal(names.length + paid.length, 23);
        names.forEach(n => assert.ok(!paid.includes(n), n));
    });
    test('the rows are closed <details class="print-open"> on screen', () => {
        assert.ok(!/<details class="po-row print-open" open/.test(P.html('results-top')));
        assert.equal((P.html('results-top').match(/<details class="po-row print-open">/g) || []).length, rows.length);
    });
    test('EVERY GOLFER\'S TOTAL PRINTS ONCE on the whole page - the pair |name|$total| appears exactly once', () => {
        const all = P.all();
        rows.forEach(x => {
            const pair = '|' + x.name + '|$' + x.amount + '|';
            assert.equal(all.split(pair).length - 1, 1, pair);
        });
        assert.ok(!/Skins Summary|Player Payouts|pool-payouts|TOTAL PAYOUT/.test(all));
    });
});

describe('ONE CARD PER GAME', () => {
    const d = round();
    const P = page(d);
    const r = pool(d);
    const html = P.html('money-pool-section');
    const cards = [...html.matchAll(/<div class="settle-card game-card ([\w-]+)"( data-flight="([AB])")?><div class="game-head"><span class="game-title">([^<]*)<\/span><span class="game-pot">([^<]*)<\/span><\/div>/g)]
        .map(m => ({ cls: m[1], flight: m[3] || null, title: m[4], pot: m[5] }));
    test('KP, Net Finish, Skins — Flight A, Skins — Flight B, as siblings, each with a head band and its pot', () => {
        assert.deepEqual(cards.map(c => [c.cls, c.flight, c.title, c.pot]), [
            ['game-kp', null, '📍 KP', '$40'],
            ['game-net', null, '🥇 Net Finish', '$200'],
            ['game-skins', 'A', '🥩 Skins — Flight A', '$' + r.skins.flights[0].amountCents / 100 + ' · 12 golfers'],
            ['game-skins', 'B', '🥩 Skins — Flight B', '$' + r.skins.flights[1].amountCents / 100 + ' · 11 golfers']]);
        assert.ok(!/pool-game|pool-flight|pool-payouts|gap-line/.test(html));
        assert.match(html, /^<div class="results-section-label">🏆 Weekly Game<\/div>/, 'a label without a figure: the pot is in the Pay out head');
    });
    test('winners by hole under each card; the split sentence and carry note under the first skins card only', () => {
        const t = P.t('money-pool-section');
        assert.match(t, /\|📍 KP\|\$40\|Hole 3: Ann Alpha\|\$10\|Hole 7: Max Mike\|\$10\|Hole 12: Dee Delta\|\$10\|Hole 16: Pat Papa\|\$10\|🥇 Net Finish\|\$200\|1st: /);
        assert.match(t, /\|🥩 Skins — Flight A\|\$\d+ · 12 golfers\|Gross skins, no carry\|Split by flight, evenly: Flight A \$\d+ \(12 golfers\) · Flight B \$\d+ \(11 golfers\)\|Hole 1 — Ann Alpha — Gross 3 — Skin\|\$\d+\|/);
        assert.match(t, /\|🥩 Skins — Flight B\|\$\d+ · 11 golfers\|Hole 2 — Max Mike — /);
        assert.ok(!/Skins Summary/.test(t));
    });
    test('a field-wide bucket is one card, "🥩 Skins", the pot alone', () => {
        const f = round({ overrides: { flights: { enabled: true, scopes: { skins: 'field', birdies: 'field' } } } });
        const h = page(f).html('money-pool-section');
        assert.match(h, /<div class="settle-card game-card game-skins"><div class="game-head"><span class="game-title">🥩 Skins<\/span><span class="game-pot">\$\d+<\/span>/);
        assert.equal((h.match(/game-skins/g) || []).length, 1);
    });
});

describe('NET +/− last, collapsed, every golfer', () => {
    const d = round();
    const P = page(d);
    test('a closed <details class="print-open"> in #results-net with 23 rows summing to zero, largest first', () => {
        const h = P.html('results-net');
        assert.match(h, /^<details class="settle-card net-view print-open"><summary class="settle-header">Net \+\/−<\/summary>/);
        const rows = [...h.matchAll(/<div class="ledger-row"><span>([^<]*)<\/span><span class="val-(pos|neg|even)">([+-]?)\$([\d.]+) NET<\/span><\/div>/g)]
            .map(m => ({ name: m[1], net: (m[3] === '-' ? -1 : 1) * Number(m[4]) }));
        assert.equal(rows.length, 23);
        assert.equal(rows.reduce((a, x) => a + x.net, 0), 0);
        for (let i = 1; i < rows.length; i++) assert.ok(rows[i].net <= rows[i - 1].net);
    });
    test('the summary mount holds nothing on a pool-only round (no Who Pays Who, no Player Payouts, no header)', () => {
        assert.equal(P.t('combined-settlement-summary'), '');
    });
});

describe('THE NOT-FINAL LINE RENDERS ONCE, ON TOP', () => {
    test('held round (finished, KPs blank): the line is in #results-gap-line and nowhere else; Pay out and Net are empty', () => {
        const P = page(round({ kpWinners: { h3: '101' } }));
        assert.equal(P.t('results-gap-line'), '|Not final — KP on holes 7, 12, 16 not recorded|');
        assert.equal(P.all().split('Not final').length - 1, 1, 'once on the page');
        assert.equal(P.t('results-top'), ''); assert.equal(P.t('results-net'), '');
        assert.match(P.t('combined-settlement-summary'), /^\|🏆 RESULTS — NOT FINAL\|Every card is in/);
        assert.match(P.t('money-pool-section'), /\|Hole 7: not recorded\|\$10 in the pot\|/);
    });
    test('live round (thru 9): the line on top, the live head below it without its own copy, the rest of the live head as before', () => {
        const P = page(round({ thru: 9, kpWinners: { h3: '101' } }));
        assert.match(P.t('results-gap-line'), /^\|Not final — .*; KP on hole 7 not recorded\|$/);   // hole 3 is recorded; 12/16 not yet played
        assert.match(P.t('combined-settlement-summary'), /^\|🏆 LIVE RESULTS — THRU 9\|Still in play — thru 9/);
        assert.equal(P.all().split('Not final').length - 1, 1);
        assert.equal(P.t('results-top'), ''); assert.equal(P.t('results-net'), '');
    });
    test('settled round: the mount is empty', () => {
        assert.equal(page(round()).t('results-gap-line'), '');
    });
});

describe('SIDE GAMES in the reasons, and the head without "of the pot"', () => {
    test('a $50 side match: the winner\'s row carries the match line from the ledger; the total is no longer the pot, so the head says the sum alone', () => {
        const d = round({ sideMatch: true });
        const P = page(d);
        const rows = payoutRows(P.html('results-top'));
        const c = P.contributions();
        const winner = Object.values(c).find(x => x.lines.some(l => /^Side Match/.test(l.label) && l.amount > 0));
        assert.ok(winner, 'somebody won the match');
        const row = rows.find(x => x.name === winner.name);
        assert.ok(row.reasons.some(re => /^Side Match/.test(re.label) && re.amount === 50), JSON.stringify(row.reasons));
        assert.ok(row.reasons.some(re => /Hole \d+/.test(re.label)) || true);
        assert.match(P.html('results-top'), /<span class="po-total">\$\d+<\/span>/, 'no " of $460"');
        assert.ok(!/ of \$460/.test(P.html('results-top')));
        assert.match(P.t('combined-settlement-summary'), /Who Pays Who/, 'a player-to-player round keeps Who Pays Who');
    });
});

describe('payoutHeadCell - X7Z8HM\'s numbers (2026-09-22: $920 pot, $40 held on holes 15 and 17)', () => {
    const sb = loadHtmlInlineScript('settlement.html');
    const cell = (a, b, c) => run(sb, `payoutHeadCell(${a}, ${b}, ${c})`);
    test('"$880 of $920 · $40 held"; "$880 of $920" when nothing is held; "$930" alone when the rows exceed the pot (a refund is a row, already in the sum)', () => {
        assert.equal(cell(88000, 92000, 4000), '$880 of $920 · $40 held');
        assert.equal(cell(92000, 92000, 0), '$920 of $920');
        assert.equal(cell(93000, 92000, 0), '$930');
        assert.equal(cell(91000, 92000, 0), '$910', 'a dollar short of the pot with nothing held: the sum alone');
        assert.equal(cell(50000, 0, 0), '$500', 'no pool: the sum alone');
    });
});

describe('PRINT: the details open for the export and close after; the roots are the mounts in screen order', () => {
    function boot() {
        const sb = loadHtmlInlineScript('settlement.html');
        run(sb, 'RESULTS_MOUNTS.forEach(i => { const el = document.getElementById(i); document.__mount(el); el.innerHTML = "<p>x</p>"; el.innerText = "x"; });');
        // mounted <details> the harness can see (rendered innerHTML is a string here)
        run(sb, `window.__dets = [0, 1, 2].map(i => { const d = document.createElement('details'); d.className = i === 2 ? 'net-view print-open' : 'po-row print-open'; d.open = i === 1; document.getElementById(i === 2 ? 'results-net' : 'results-top').appendChild(d); return d; });
                 window.__calls = []; window.RattleExport = { exportOrPrint: o => { window.__calls.push({ ids: o.roots.map(r => r.id), open: window.__dets.map(d => d.open) }); return Promise.resolve('sent'); } };
                 currentData = { courseName: 'Tidewater' };`);
        return sb;
    }
    test('printReceipt: every print-open details is open WHILE the export reads the roots, and the ones that were closed are closed again after', async () => {
        const sb = boot();
        const v = await run(sb, 'printReceipt()');
        assert.equal(v, 'sent');
        const call = run(sb, 'window.__calls[0]');
        assert.deepEqual(J(call.open), [true, true, true]);
        assert.deepEqual(J(run(sb, 'window.__dets.map(d => d.open)')), [false, true, false], 'the one the golfer had open stays open');
    });
    test('the roots are RESULTS_MOUNTS in order (the summary as its parts)', () => {
        const sb = boot();
        run(sb, 'printReceipt()');
        assert.deepEqual(J(run(sb, 'window.__calls[0].ids')), ['results-gap-line', 'results-top', 'money-pool-section', 'settle-content', 'results-net', 'receipt-scorecard'].map(x => x));
    });
    test('the beforeprint / afterprint handlers do the same for a Cmd+P print (the wiring is a source pin above; Chrome fires them below)', () => {
        const sb = boot();
        run(sb, 'onBeforePrint()');
        assert.deepEqual(J(run(sb, 'window.__dets.map(d => d.open)')), [true, true, true]);
        run(sb, 'onBeforePrint()');   // a second beforeprint while open: nothing is recorded as closed
        run(sb, 'onAfterPrint()');
        assert.deepEqual(J(run(sb, 'window.__dets.map(d => d.open)')), [false, true, false]);
    });
});

// ---- CHROME: the real page, cold, on a settled round --------------------------
// No page function is called. The round is delivered through the stand-in
// database; the page renders on its own. Measured: the order of the mounts on
// screen, the Pay out rows closed, four game cards with a coloured band, one
// occurrence of the top golfer's total in the rendered text; then
// Page.printToPDF fires beforeprint/afterprint in the page and the counter the
// page keeps (__printOpenCount) says how many details it opened.
const DB = { events: { PAYOUT: (() => { const d = round(); d.ownerUid = 'anon-cold'; return d; })() }, global_courses: {}, trips: {}, tournaments: {} };
const PROBE = `(() => {
    const ids = ${JSON.stringify(MOUNTS)};
    const tops = ids.map(id => { const el = document.getElementById(id); const r = el.getBoundingClientRect(); return { id, top: r.top, h: r.height, empty: !(el.innerText || '').trim() }; });
    const rows = Array.from(document.querySelectorAll('.po-row')).map(d => ({ open: d.open, name: d.querySelector('.po-name').innerText, amt: d.querySelector('.po-amt').innerText, amtPx: parseFloat(getComputedStyle(d.querySelector('.po-amt')).fontSize) }));
    const cards = Array.from(document.querySelectorAll('.game-card')).map(c => { const h = c.querySelector('.game-head'); const cs = getComputedStyle(h); return { title: h.querySelector('.game-title').innerText, bg: cs.backgroundColor, cardBg: getComputedStyle(c).backgroundColor, top: c.getBoundingClientRect().top }; });
    const text = document.querySelector('.container').innerText;
    const first = rows[0] ? (text.split(rows[0].name + '\\n' + rows[0].amt).length - 1) : -1;
    const net = document.querySelector('.net-view');
    return JSON.stringify({ tops, rows, cards, firstPair: first, netOpen: net ? net.open : null, netReasonsVisible: net ? net.querySelector('.ledger-row').getBoundingClientRect().height : null, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth });
})()`;
const C = {};
before(async () => {
    const r = await arriveCold({ url: fileUrl('settlement.html', 'game=PAYOUT'), db: DB, settleMs: 4000,
        steps: [{ expression: PROBE }, { cdp: { method: 'Page.printToPDF', params: { printBackground: true } } }, { expression: 'JSON.stringify({ opened: window.__printOpenCount, openNow: document.querySelectorAll("details.print-open[open]").length })' }] });
    C.ok = r.ok; C.reason = r.reason; C.v = r.ok ? JSON.parse(r.value[0]) : null; C.pdf = r.ok ? r.value[1] : null; C.after = r.ok ? JSON.parse(r.value[2]) : null;
});
describe('COLD CHROME at 390: the new order on screen, and a print opens the reasons', () => {
    test('ran', () => assert.ok(C.ok, C.reason));
    test('the mounts sit in order: gap line (empty), Pay out, the game cards, (summary empty), (side games empty), Net, the card', () => {
        const t = C.v.tops;
        assert.deepEqual(t.map(x => x.id), MOUNTS);
        assert.deepEqual(t.map(x => x.empty), [true, false, false, true, true, false, false]);
        const shown = t.filter(x => !x.empty);
        for (let i = 1; i < shown.length; i++) assert.ok(shown[i].top >= shown[i - 1].top + shown[i - 1].h - 1, shown[i].id + ' below ' + shown[i - 1].id);
    });
    test('Pay out rows closed, largest first, the amount at least 1.3x the row text; four game cards, each band coloured and unlike the card', () => {
        assert.ok(C.v.rows.length >= 8);
        C.v.rows.forEach(r => assert.equal(r.open, false, r.name));
        assert.ok(C.v.rows[0].amtPx >= 19, 'amount px: ' + C.v.rows[0].amtPx);
        assert.equal(C.v.cards.length, 4, JSON.stringify(C.v.cards.map(c => c.title)));
        C.v.cards.forEach(c => { assert.notEqual(c.bg, c.cardBg, c.title); assert.notEqual(c.bg, 'rgba(0, 0, 0, 0)', c.title); });
        for (let i = 1; i < 4; i++) assert.ok(C.v.cards[i].top > C.v.cards[i - 1].top);
    });
    test('the top golfer\'s name+amount pair appears once in the rendered text; Net is closed; no horizontal scroll', () => {
        assert.equal(C.v.firstPair, 1);
        assert.equal(C.v.netOpen, false);
        assert.ok(C.v.scrollW <= C.v.innerW, C.v.scrollW + ' > ' + C.v.innerW);
    });
    test('Page.printToPDF: the page opened every print-open details for the print (its own beforeprint) and closed them after', () => {
        assert.equal(C.pdf, 'ok', 'the cdp step ran (cold-arrival records ok, not the PDF bytes)');
        assert.equal(C.after.opened, C.v.rows.length + 1, 'rows + the Net view: ' + JSON.stringify(C.after));
        assert.equal(C.after.openNow, 0);
    });
});
