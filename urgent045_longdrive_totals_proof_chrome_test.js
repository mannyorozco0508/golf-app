// ============================================================================
// URGENT-045 #2b LONG DRIVE - SETTLEMENT TOTALS ON 3 SAVED ROUNDS IDENTICAL BEFORE / AFTER.
// IN REAL CHROME. A copy of urgent038_27_totals_proof_chrome_test.js (the #31 method). Long Drive
// changes no money code: it adds gps-longdrive.js, a "Long Drive" tile + a Long Drive row in the
// Weekly Game sheet (gps-bet.js) and the shared Mark button (gps-mark-distance.js, from 045-kp-gps).
// Each round is rendered twice with the same stubbed data:
//
//   BEFORE  gps-simple at 61f9eac (this branch's base): every file this branch changed is put
//           back as it was there (git show), beside the rest of this tree
//   AFTER   this tree (045-longdrive)
//
// on TWO pages: the Round Receipt (settlement.html) and the Bets page (skins.html). Any
// difference fails. THE THREE ROUNDS (no Myrtle round; nothing written - the stub counts writes):
//   NASSAU   2 golfers, a $5/$5/$5 net Nassau on a stroke round (synthetic, as #31)
//   SIDES    matches_tab_finished.fixture.json - 4 golfers, two Nassaus with 2-down presses and a 2v2 match
//   FIELD    carry_order_64654480.fixture.json - 14 golfers: $40 pool, KP x5, gross skins with carry, flights
// P45LD_OUT=<dir> also writes the table to <dir>/totals-proof.md.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!fs.existsSync(path.join(__dirname, 'gps-config.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl, REPO_ROOT } = require('./tools/lib/cold-arrival.js');

const BASE = process.env.P45LD_BASE || '61f9eac';
const OUT_DIR = process.env.P45LD_OUT || '';

// ---- the rounds (the #31 three) ---------------------------------------------
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
        sideMatches: { '-L45nassau': { format: 'nassau', scoring: 'net', stake: 5, frontStake: 5, backStake: 5, overallStake: 5, pressRule: 'none',
            startHole: 1, createdAt: 1792000000000, teamAIds: ['101'], teamBIds: ['102'] } } };
}
const load = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'));
const ROUNDS = [
    { code: 'L45NAS', label: 'NASSAU - 2 golfers, $5/$5/$5 net Nassau (Papago, synthetic)', data: nassauRound() },
    { code: 'L45SDE', label: 'SIDES - matches_tab_finished.fixture.json (4 golfers, 2 Nassaus + presses, 2v2 match)', data: load('matches_tab_finished.fixture.json') },
    { code: 'L45FLD', label: 'FIELD - carry_order_64654480.fixture.json (14 golfers, pool: KP, skins, flights)', data: (() => { const d = load('carry_order_64654480.fixture.json'); delete d._source; return d; })() }
];
const DB = (r) => ({ events: { [r.code]: r.data }, global_courses: { az_papago: { name: 'Papago Golf Club', location: { city: 'Phoenix', state: 'AZ' } } } });

// ---- the tree before this branch, beside nothing else changed -----------------------
// Every file this branch changed against BASE (committed or not) as it was at BASE;
// every other entry a link to this tree. A file new on this branch is left out.
let CHANGED = [];
function beforeTree() {
    let names;
    try {
        cp.execSync('git cat-file -e ' + BASE + '^{commit}', { cwd: REPO_ROOT, stdio: 'ignore' });
        names = cp.execSync('git diff --name-only ' + BASE, { cwd: REPO_ROOT }).toString().split('\n').filter(Boolean);
    } catch (e) { return null; }
    CHANGED = names.filter((n) => !/_test\.js$|\.test\.js$/.test(n) && n.indexOf('/') === -1);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p45ld-before-'));
    fs.readdirSync(REPO_ROOT).forEach((n) => { if (n !== '.git' && CHANGED.indexOf(n) === -1) fs.symlinkSync(path.join(REPO_ROOT, n), path.join(dir, n)); });
    CHANGED.forEach((n) => {
        let txt = null;
        try { txt = cp.execSync('git show ' + BASE + ':' + n, { cwd: REPO_ROOT, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { /* new on this branch */ }
        if (txt) fs.writeFileSync(path.join(dir, n), txt);
    });
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

// The Bets page: every money figure in it, every match's segment money and ledger line.
const BETS_EXTRACT = `(() => {
  const T = (e) => (e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : '');
  const MONEY = /[+\\-\\u2212]?\\$[0-9][0-9,]*(?:\\.[0-9][0-9])?/g;
  const money = (s) => (String(s || '').match(MONEY) || []).map((m) => m.replace('\\u2212', '-'));
  const main = document.getElementById('main-content');
  return JSON.stringify({ screenMoney: money(main.innerText).sort(),
    matches: Array.from(document.querySelectorAll('#bets-matches > *')).map((c) => money(T(c))),
    games: money(T(document.getElementById('bets-games'))), writes: (window.__coldWrites || []).length });
})()`;
const PRE = 'window.__simpleFlow = true; try { localStorage.setItem("hardpan_simple_flow", "on"); } catch (e) {}';
async function receipt(r, url) {
    const steps = [{ waitFor: "!!document.querySelector('#settle-content') && !/Calculating/.test(document.getElementById('settle-content').innerText) && !!document.querySelector('#receipt-scorecard table')", timeout: 20000 },
        { sleep: 400 }, { expression: EXTRACT }];
    const res = await arriveCold({ url, db: DB(r), viewport: { width: 393, height: 852 }, steps, settleMs: 1500, preScript: PRE });
    assert.ok(res.ok, 'receipt ' + r.code + ': ' + res.reason);
    return JSON.parse(res.value[res.value.length - 1]);
}
async function bets(r, url) {
    const steps = [{ waitFor: "!!document.getElementById('main-content') && getComputedStyle(document.getElementById('main-content')).display !== 'none'", timeout: 20000 },
        { sleep: 900 }, { expression: BETS_EXTRACT }];
    const res = await arriveCold({ url, db: DB(r), viewport: { width: 393, height: 852 }, steps, settleMs: 1500, preScript: PRE });
    assert.ok(res.ok, 'bets ' + r.code + ': ' + res.reason);
    return JSON.parse(res.value[res.value.length - 1]);
}

const results = [];
let before = null;
test('setup: the tree before this branch (' + BASE + ')', () => {
    before = beforeTree();
    if (!before) console.log('git object ' + BASE + ' not here - the before/after half is skipped');
    else console.log('put back as at ' + BASE + ': ' + CHANGED.join(', '));
});

for (const r of ROUNDS) {
    test('URGENT-045 Long Drive totals identical before/after: ' + r.label, { timeout: 180000 }, async (t) => {
        if (!before) { t.skip('no ' + BASE); return; }
        const b = await receipt(r, 'file://' + path.join(before, 'settlement.html') + '?game=' + r.code);
        const a = await receipt(r, fileUrl('settlement.html', 'game=' + r.code));
        const bb = await bets(r, 'file://' + path.join(before, 'skins.html') + '?game=' + r.code);
        const ab = await bets(r, fileUrl('skins.html', 'game=' + r.code));
        results.push({ r, b, a, bb, ab });
        [a, b, ab, bb].forEach((x) => assert.equal(x.writes, 0, 'nothing written'));
        assert.ok(b.screenMoney.length > 0, 'the round has money on its receipt');
        assert.deepEqual(a.screenMoney, b.screenMoney, 'every money figure on the receipt');
        assert.deepEqual(a.settle, b.settle, 'Settle up, line for line');
        assert.deepEqual(a.payout, b.payout, 'Pay out rows');
        assert.deepEqual(a.poHead, b.poHead, 'Pay out total');
        assert.deepEqual(a.netView, b.netView, 'Net +/- rows');
        assert.deepEqual(a.segMoney, b.segMoney, 'every game line\'s money');
        assert.deepEqual(a.matchNet, b.matchNet, 'every match net');
        assert.deepEqual(a.each, b.each, 'every 2v2 "($N each)"');
        assert.deepEqual(a.ledger, b.ledger, 'every pool / side-game ledger row');
        assert.deepEqual(a.card, b.card, 'the Full Scorecard');
        assert.deepEqual(a.finalScores, b.finalScores, 'FINAL SCORES');
        assert.deepEqual(a.engine, b.engine, 'every golfer\'s out / in / gross / net / +/- from the engines');
        assert.deepEqual(a.exportMoney, b.exportMoney, 'every money figure the share sends');
        if (Object.keys(r.data.sideMatches || {}).length) assert.ok(bb.screenMoney.length > 0, 'the round has money on its Bets page');
        else console.log(r.code + ' Bets page (no side matches): before ' + JSON.stringify(bb) + ' / after ' + JSON.stringify(ab));
        assert.deepEqual(ab.screenMoney, bb.screenMoney, 'every money figure on the Bets page');
        assert.deepEqual(ab.matches, bb.matches, 'every match card\'s money on the Bets page');
        assert.deepEqual(ab.games, bb.games, 'every round game\'s money on the Bets page');
    });
}

test('the proof table (P45LD_OUT)', (t) => {
    if (before) try { fs.rmSync(before, { recursive: true, force: true }); } catch (e) {}
    if (!OUT_DIR || !results.length) { t.skip('P45LD_OUT not set'); return; }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const same = (x, y) => (JSON.stringify(x) === JSON.stringify(y) ? 'identical' : '**DIFFERS**');
    const L = [];
    L.push('# URGENT-045 #2b Long Drive: settlement totals before vs after', '');
    L.push('Before = gps-simple ' + BASE + ' (every file branch 045-longdrive changed put back as it was: ' + CHANGED.join(', ') + '; new files left out). After = branch 045-longdrive. Same stubbed round data, headless Chrome 393x852, HardPan simple flow on. Nothing written (stub write count 0 on every render). Test: urgent045_longdrive_totals_proof_chrome_test.js (a copy of urgent038_27, the #31 method).', '');
    let all = true;
    for (const { r, b, a, bb, ab } of results) {
        L.push('## ' + r.code + ' - ' + r.label, '');
        L.push('| What | Before (' + BASE + ') | After (045-longdrive) | Match |', '|---|---|---|---|');
        const row = (what, x, y) => { const s = same(x, y); if (s !== 'identical') all = false; L.push('| ' + what + ' | ' + (Array.isArray(x) ? x.join(' · ') : x) + ' | ' + (Array.isArray(y) ? y.join(' · ') : y) + ' | ' + s + ' |'); };
        row('Receipt: every money figure on screen (' + b.screenMoney.length + ')', b.screenMoney, a.screenMoney);
        row('Settle up', b.settle, a.settle);
        row('Pay out total', b.poHead, a.poHead);
        row('Pay out rows', b.payout, a.payout);
        row('Net +/- rows', b.netView, a.netView);
        row('Game lines (money)', b.segMoney, a.segMoney);
        row('Match nets', b.matchNet, a.matchNet);
        row('2v2 each', b.each, a.each);
        row('Pool / side-game ledger rows', b.ledger, a.ledger);
        row('What Share sends (money)', b.exportMoney, a.exportMoney);
        row('Bets page: every money figure (' + bb.screenMoney.length + ')', bb.screenMoney, ab.screenMoney);
        L.push('', '| Golfer | Before out / in / gross / net / +/- (engines) | After | Match |', '|---|---|---|---|');
        b.engine.forEach((e, i) => {
            const f = a.engine[i] || {};
            const bt = [e.out, e.in, e.gross, e.net, e.par].join(' / '), at = [f.out, f.in, f.gross, f.net, f.par].join(' / ');
            if (bt !== at) all = false;
            L.push('| ' + e.name + ' | ' + bt + ' | ' + at + ' | ' + (bt === at ? 'identical' : '**DIFFERS**') + ' |');
        });
        L.push('');
    }
    L.splice(4, 0, '**Result: ' + (all ? 'every figure identical on all ' + results.length + ' rounds.' : 'A FIGURE DIFFERS - see the rows marked DIFFERS.') + '**', '');
    fs.writeFileSync(path.join(OUT_DIR, 'totals-proof.md'), L.join('\n') + '\n');
});
