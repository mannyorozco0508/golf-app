// ============================================================================
// POLISH #31 (OPTION A) - THE RECEIPT'S NEW LOOK MOVES NO NUMBER. IN REAL CHROME.
//
// Manny's pick (URGENT-031, "full page, sectioned cards"): the Round Receipt
// (settlement.html) in the GPS look - "‹ Back to round" + code chip, "Round
// Receipt", a course card, FINAL SCORES, one card per game, SETTLE UP, a lime
// "Share receipt". LOOK ONLY. His proof: before/after totals identical on three
// saved rounds. So each round is rendered twice with the same stubbed data:
//
//   BEFORE  settlement.html exactly as it was at 70bd31e (git show), beside the
//           same engines - the page before #31
//   AFTER   this tree's settlement.html, HardPan's simple flow on (the new look)
//
// and from each render this reads every money figure on screen (signed, as a
// multiset), every Settle up / Who Pays Who line, every Pay out row, every Net
// +/- row, every game line's money and match net, every golfer's OUT / IN /
// gross / net (the Full Scorecard before; FINAL SCORES and the Full Scorecard
// after) and every money figure the share/export hands the exporter. Any
// difference fails.
//
// THE THREE ROUNDS (no Myrtle round, nothing written - the stub records writes
// and this asserts there are none):
//   NASSAU   2 golfers, a $5/$5/$5 net Nassau on a stroke round - the mockup's
//            Test A (12) v Test B (5) at Papago (synthetic, built here)
//   SIDES    matches_tab_finished.fixture.json - 4 golfers, two Nassaus with
//            2-down presses and a 2v2 match (side bets)
//   FIELD    carry_order_64654480.fixture.json - 14 golfers as the app saved
//            them (sim J9AGDH): a $40 pool, KP x5, gross skins with carry, flights
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!fs.existsSync(path.join(__dirname, 'gps-config.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl, REPO_ROOT } = require('./tools/lib/cold-arrival.js');

const BASE = process.env.P31_BASE || 'dcb90df';   // on a branch that also has the #2 name fix, use the commit just before #31 (P31_BASE) so only the look differs
const OUT_DIR = process.env.P31_OUT || '';          // where the proof table / shots go (the report run)

// ---- the rounds -------------------------------------------------------------
const PAR = [5, 4, 4, 3, 4, 4, 4, 3, 5, 5, 3, 4, 4, 4, 3, 5, 4, 4];
const HCP = [15, 17, 3, 13, 11, 1, 7, 9, 5, 18, 12, 16, 2, 4, 6, 8, 10, 14];
const CD = PAR.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: HCP[i] }));
function nassauRound() {
    const A = [5, 5, 5, 4, 3, 5, 4, 6, 4, 5, 4, 4, 4, 4, 3, 5, 5, 4];   // 41 / 38
    const B = [4, 4, 4, 5, 3, 4, 5, 4, 4, 4, 5, 4, 4, 4, 3, 5, 4, 4];   // 37 / 37
    const scores = {};
    A.forEach((s, i) => { scores['p101_h' + (i + 1)] = s; });
    B.forEach((s, i) => { scores['p102_h' + (i + 1)] = s; });
    return { eventName: 'Single Round', courseName: 'Papago Golf Club', activeCourseKey: 'az_papago', gameFormat: 'stroke',
        settlementMode: 'whole-dollar', teeRating: { teeKey: 'male:1', teeName: 'Men · White', slope: 125, courseRating: 70.9, par: 72, allowance: 100 },
        courseData: CD, scores,
        players: [{ id: 101, name: 'Test A', hcp: '12', playingForMoney: true }, { id: 102, name: 'Test B', hcp: '5', playingForMoney: true }],
        sideMatches: { '-P31nassau': { format: 'nassau', scoring: 'net', stake: 5, frontStake: 5, backStake: 5, overallStake: 5, pressRule: 'none',
            startHole: 1, createdAt: 1792000000000, teamAIds: ['101'], teamBIds: ['102'] } } };
}
const load = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'));
const ROUNDS = [
    { code: 'P31NAS', label: 'NASSAU - 2 golfers, $5/$5/$5 net Nassau (Papago, synthetic)', data: nassauRound() },
    { code: 'P31SDE', label: 'SIDES - matches_tab_finished.fixture.json (4 golfers, 2 Nassaus + presses, 2v2 match)', data: load('matches_tab_finished.fixture.json') },
    { code: 'P31FLD', label: 'FIELD - carry_order_64654480.fixture.json (14 golfers, pool: KP, skins, flights)', data: (() => { const d = load('carry_order_64654480.fixture.json'); delete d._source; return d; })() }
];
const DB = (r) => ({ events: { [r.code]: r.data }, global_courses: { az_papago: { name: 'Papago Golf Club', location: { city: 'Phoenix', state: 'AZ' } } } });

// ---- the page before #31, beside today's engines ---------------------------------
// Only settlement.html changed in #31, so the before page is 70bd31e's file in a folder
// whose every other entry is a link to this tree.
function beforeTree() {
    let html;
    try { html = cp.execSync('git show ' + BASE + ':settlement.html', { cwd: REPO_ROOT, maxBuffer: 1 << 26 }).toString(); }
    catch (e) { return null; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p31-before-'));
    fs.readdirSync(REPO_ROOT).forEach((n) => { if (n !== 'settlement.html' && n !== '.git') fs.symlinkSync(path.join(REPO_ROOT, n), path.join(dir, n)); });
    fs.writeFileSync(path.join(dir, 'settlement.html'), html);
    return dir;
}

// ---- what is read from a render ---------------------------------------------------
const EXTRACT = `(() => {
  const T = (e) => (e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : '');
  const MONEY = /[+\\-\\u2212]?\\$[0-9][0-9,]*(?:\\.[0-9][0-9])?/g;
  const money = (s) => (String(s || '').match(MONEY) || []).map((m) => m.replace('\\u2212', '-'));
  const main = document.getElementById('main-content');
  // every collapsed card open (Pay out reasons, Net +/-), as the export opens them, so their figures are read too
  document.querySelectorAll('details').forEach((x) => { x.open = true; });
  const A = document.documentElement.classList.contains('hp-rcpt');
  // Settle up (after) / Who Pays Who (before)
  let settle = [];
  if (A) settle = Array.from(document.querySelectorAll('.hp-rc-pay')).map(T);
  else Array.from(document.querySelectorAll('#combined-settlement-summary .settle-card')).filter((c) => /Who Pays Who/i.test(T(c.querySelector('.settle-header'))))
      .forEach((c) => c.querySelectorAll('.ledger-row').forEach((r) => settle.push(T(r))));
  const payout = Array.from(document.querySelectorAll('.po-row > summary')).map(T);
  const poHead = Array.from(document.querySelectorAll('.po-total')).map(T);
  const netView = Array.from(document.querySelectorAll('.net-view .ledger-row')).map(T);
  // game lines: segment money and the match net, in order
  const segMoney = A ? Array.from(document.querySelectorAll('.hp-rc-game .hp-rc-ln .r')).map(T).filter(Boolean)
                     : Array.from(document.querySelectorAll('.receipt-seg-money')).map(T);
  const noEach = (s) => s.replace(/\\(\\$[0-9,.]+ each\\)/g, '').trim();
  const matchNet = A ? Array.from(document.querySelectorAll('.hp-rc-game .hp-rc-tot > span:last-child')).map((e) => money(noEach(T(e))).join(' '))
                     : Array.from(document.querySelectorAll('.receipt-net')).map((e) => money(noEach(T(e).split(' \\u2014 ')[0])).join(' '));
  const each = Array.from(document.querySelectorAll(A ? '.hp-rc-each' : '.receipt-each')).map(T);
  const ledger = Array.from(document.querySelectorAll('#money-pool-section .ledger-row, #settle-content .settle-card > .ledger-row')).map(T);
  // the Full Scorecard: per golfer OUT / IN / TOT (gross) and the net row's when drawn
  const card = {};
  const rows = Array.from(document.querySelectorAll('#receipt-scorecard .receipt-table tr'));
  let last = null;
  rows.forEach((tr) => {
    const cells = Array.from(tr.children).map(T); const name = cells[0];
    if (!name || /^(HOLE|PAR|HCP)$/.test(name)) return;
    const secs = Array.from(tr.querySelectorAll('.rt-sec')).map(T);
    if (tr.classList.contains('rt-net')) { if (last) card[last].net = secs; return; }
    last = name; card[name] = { gross: secs };
  });
  // the engine's own figures for every golfer, from this page's own globals (the before page
  // draws no net row when net does not matter on the round)
  const d = (typeof currentData !== 'undefined' && currentData) || {};
  const cells = window.ScorecardRows ? ScorecardRows.scorecardCells({ courseData: d.courseData || [], scores: d.scores || {}, players: d.players || [], showNet: true }) : { golfers: [] };
  const stand = {}; try { computeNetToParStandings(d.players || [], d.courseData || [], d.scores || {}, { basis: 'net' }).forEach((x) => { stand[x.name] = x.started ? formatToPar(x.toParNet) : '\\u2013'; }); } catch (e) {}
  const engine = cells.golfers.map((g) => ({ name: g.name, out: g.gross.out, in: g.gross.in, gross: g.gross.tot, net: g.net.tot, par: stand[g.name] }));
  const finalScores = Array.from(document.querySelectorAll('#hp-rc-scores tbody tr')).map((tr) => {
    const t = (s) => T(tr.querySelector(s));
    return { name: T(tr.querySelector('td.nm')).replace(/ [+]?[0-9.]+$/, ''), out: t('td.o'), in: t('td.i'), gross: t('td.g'), net: t('td.n'), par: t('td.p') };
  });
  // the share: the page's own button, the exporter stubbed - what the export would carry
  let exportMoney = null;
  const real = window.RattleExport; let captured = null;
  window.RattleExport = { exportOrPrint: (o) => { captured = o; return true; } };
  const btn = A ? document.querySelector('#hp-rc-foot:not([hidden]) .hp-rc-share') : document.querySelector('#receipt-actions .receipt-send');
  if (btn) btn.click();
  window.RattleExport = real;
  if (captured) exportMoney = money(captured.roots.map((x) => x.innerText).join(' ')).sort();
  return JSON.stringify({ look: A ? 'A' : 'old', shareButton: !!btn, screenMoney: money(main.innerText).sort(), settle, payout, poHead, netView, segMoney, matchNet, each, ledger,
    card, engine, finalScores, exportMoney, writes: (window.__coldWrites || []).length, title: T(document.getElementById(A ? 'hp-rc-title' : 'main-title')),
    scrollW: document.documentElement.scrollWidth, innerW: innerWidth });
})()`;

async function render(r, url, shots) {
    const steps = [{ waitFor: "!!document.querySelector('#settle-content') && !/Calculating/.test(document.getElementById('settle-content').innerText) && !!document.querySelector('#receipt-scorecard table')", timeout: 20000 },
        { sleep: 400 }].concat(shots || [], [{ expression: EXTRACT }]);
    const res = await arriveCold({ url, db: DB(r), viewport: (shots && shots.vp) || { width: 393, height: 852 }, steps, settleMs: 1500,
        preScript: 'window.__simpleFlow = true; try { localStorage.setItem("hardpan_simple_flow", "on"); } catch (e) {}' });
    assert.ok(res.ok, 'render ' + r.code + ': ' + res.reason);
    return JSON.parse(res.value[res.value.length - 1]);
}

const results = [];
let before = null;
test('setup: the before page (70bd31e settlement.html)', () => {
    before = beforeTree();
    if (!before) console.log('git object ' + BASE + ' not here - the before/after half is skipped');
});

for (const r of ROUNDS) {
    test('POLISH #31 totals identical before/after: ' + r.label, { timeout: 120000 }, async (t) => {
        if (!before) { t.skip('no ' + BASE); return; }
        const b = await render(r, 'file://' + path.join(before, 'settlement.html') + '?game=' + r.code);
        const a = await render(r, fileUrl('settlement.html', 'game=' + r.code));
        results.push({ r, b, a });
        assert.equal(b.look, 'old', 'the before page is the old look');
        assert.equal(a.look, 'A', 'the after page is option A');
        assert.equal(a.title, 'Round Receipt');
        assert.equal(a.writes, 0, 'nothing written'); assert.equal(b.writes, 0, 'nothing written');
        assert.ok(b.screenMoney.length > 0, 'the round has money on its receipt');
        assert.deepEqual(a.screenMoney, b.screenMoney, 'every money figure on screen');
        assert.deepEqual(a.settle.map((s) => s.replace(/\s+/g, ' ')), b.settle, 'Settle up = Who Pays Who, line for line');
        assert.deepEqual(a.payout, b.payout, 'Pay out rows');
        assert.deepEqual(a.poHead, b.poHead, 'Pay out total');
        assert.deepEqual(a.netView, b.netView, 'Net +/- rows');
        assert.deepEqual(a.segMoney, b.segMoney, 'every game line\'s money');
        assert.deepEqual(a.matchNet, b.matchNet, 'every match net');
        assert.deepEqual(a.each, b.each, 'every 2v2 "($N each)"');
        assert.deepEqual(a.ledger, b.ledger, 'every pool / side-game ledger row');
        assert.deepEqual(a.card, b.card, 'the Full Scorecard OUT / IN / TOT, gross and net');
        assert.deepEqual(a.engine, b.engine, 'every golfer\'s out / in / gross / net / +/- from the engines');
        assert.ok(b.exportMoney && a.exportMoney, 'both pages share');
        assert.deepEqual(a.exportMoney, b.exportMoney, 'every money figure the share sends');
        // FINAL SCORES = the engines' figures = the Full Scorecard
        assert.equal(a.finalScores.length, a.engine.length, 'a FINAL SCORES row per golfer');
        a.finalScores.forEach((f, i) => {
            const e = a.engine[i];
            const s = (v) => (v ? String(v) : '–');
            assert.equal(f.name, e.name);
            assert.deepEqual([f.out, f.in, f.gross, f.net, f.par], [s(e.out), s(e.in), s(e.gross), s(e.net), e.par], 'FINAL SCORES row ' + e.name);
            const c = b.card[e.name];
            assert.ok(c, 'the before Full Scorecard has ' + e.name);
            assert.deepEqual([f.out, f.in, f.gross], c.gross.map((x) => x === '' ? '–' : x), 'FINAL SCORES OUT/IN/TOT = the before scorecard, ' + e.name);
            if (c.net) assert.equal(f.net, c.net[2], 'FINAL SCORES net = the before net row, ' + e.name);
        });
        assert.ok(a.scrollW <= a.innerW, 'no sideways scroll');
    });
}

test('the proof table and the after-shots (P31_OUT)', { timeout: 300000 }, async (t) => {
    if (before) try { fs.rmSync(before, { recursive: true, force: true }); } catch (e) {}
    if (!OUT_DIR || !results.length) { t.skip('P31_OUT not set'); return; }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const same = (x, y) => (JSON.stringify(x) === JSON.stringify(y) ? 'identical' : '**DIFFERS**');
    const L = [];
    L.push('# POLISH #31 (option A) - Round Receipt totals, before vs after', '');
    L.push('Before = settlement.html at ' + BASE + ' (the old look). After = branch polish-receipt (option A, HardPan simple flow on). Same stubbed round data, headless Chrome 393x852. Nothing written (stub write count 0 on every render).', '');
    for (const { r, b, a } of results) {
        L.push('## ' + r.code + ' - ' + r.label, '');
        L.push('| What | Before (70bd31e) | After (option A) | Match |', '|---|---|---|---|');
        const row = (what, x, y) => L.push('| ' + what + ' | ' + (Array.isArray(x) ? x.join(' · ') : x) + ' | ' + (Array.isArray(y) ? y.join(' · ') : y) + ' | ' + same(x, y) + ' |');
        row('Every money figure on screen (' + b.screenMoney.length + ')', b.screenMoney, a.screenMoney);
        row('Settle up / Who Pays Who', b.settle, a.settle.map((s) => s.replace(/\s+/g, ' ')));
        row('Pay out total', b.poHead, a.poHead);
        row('Pay out rows', b.payout, a.payout);
        row('Net +/- rows', b.netView, a.netView);
        row('Game lines (money)', b.segMoney, a.segMoney);
        row('Match nets', b.matchNet, a.matchNet);
        row('2v2 each', b.each, a.each);
        row('Pool / side-game ledger rows', b.ledger, a.ledger);
        row('What Share sends (money)', b.exportMoney, a.exportMoney);
        L.push('', '| Golfer | Out | In | Gross | Net | +/- | Before (scorecard / engine) | After (FINAL SCORES) | Match |', '|---|---|---|---|---|---|---|---|---|');
        a.engine.forEach((e, i) => {
            const f = a.finalScores[i] || {}, be = b.engine[i] || {};
            const bt = [be.out, be.in, be.gross, be.net, be.par].join(' / '), at = [f.out, f.in, f.gross, f.net, f.par].join(' / ');
            L.push('| ' + e.name + ' | ' + f.out + ' | ' + f.in + ' | ' + f.gross + ' | ' + f.net + ' | ' + f.par + ' | ' + bt + ' | ' + at + ' | ' + (bt === at.replace(/–/g, '0') || bt === at ? 'identical' : '**DIFFERS**') + ' |');
        });
        L.push('');
    }
    fs.writeFileSync(path.join(OUT_DIR, '31-totals-proof.md'), L.join('\n') + '\n');
    // after-shots: the screen as the phone shows it, and the whole page
    const shotDir = process.env.P31_SHOTS || OUT_DIR;
    for (const [w, h] of [[393, 852], [375, 667]]) {
        for (const r of ROUNDS) {
            const tag = r.code === 'P31NAS' ? '' : '-' + r.code.slice(3).toLowerCase();
            const steps = [{ waitFor: "!!document.querySelector('#receipt-scorecard table')", timeout: 20000 }, { sleep: 600 },
                { shot: path.join(shotDir, '31-after' + tag + (w === 375 ? '-375x667' : '') + '.png'), viewportOnly: true },
                { shot: path.join(shotDir, '31-after' + tag + (w === 375 ? '-375x667' : '') + '-full.png') }];
            const res = await arriveCold({ url: fileUrl('settlement.html', 'game=' + r.code), db: DB(r), viewport: { width: w, height: h }, steps, settleMs: 1500,
                preScript: 'window.__simpleFlow = true; try { localStorage.setItem("hardpan_simple_flow", "on"); } catch (e) {}' });
            assert.ok(res.ok, res.reason);
        }
    }
});
