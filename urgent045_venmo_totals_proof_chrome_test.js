// ============================================================================
// URGENT-045 #3 - SETTLE UP WITH VENMO / CASH APP MOVES NO SETTLEMENT NUMBER.
// IN REAL CHROME. The URGENT-038 #27 / POLISH #31 method (urgent038_27_totals_proof_chrome_test.js),
// on the same three saved-round fixtures (NASSAU, SIDES, FIELD; no Myrtle round, nothing
// written - the stub counts writes). Each round is rendered twice with the same data:
//
//   BEFORE  gps-simple 61f9eac (this branch's base): every file this branch changed put back
//   AFTER   this tree (045-venmo), with the Settle up card ON: this phone is golfer 1
//           (?me=), and the round carries Venmo / Cash App usernames and a "paid" tick
//
// The card's own copy of the payments is read first (it must be there and match the
// receipt's Settle up lines), then set aside, and every figure the #27 test reads is
// compared: receipt, Settle up, Pay out, Net +/-, game lines, match nets, ledger, the
// Full Scorecard, FINAL SCORES, the engines' own figures, what Share sends, the Bets page.
// V45_OUT=<dir> also writes the table to <dir>/totals-proof.md.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!fs.existsSync(path.join(__dirname, 'gps-config.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl, REPO_ROOT } = require('./tools/lib/cold-arrival.js');

const BASE = process.env.V45_BASE || '61f9eac';
const OUT_DIR = process.env.V45_OUT || '';

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
        sideMatches: { '-U38nassau': { format: 'nassau', scoring: 'net', stake: 5, frontStake: 5, backStake: 5, overallStake: 5, pressRule: 'none',
            startHole: 1, createdAt: 1792000000000, teamAIds: ['101'], teamBIds: ['102'] } } };
}
const load = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'));
const ROUNDS = [
    { code: 'U38NAS', label: 'NASSAU - 2 golfers, $5/$5/$5 net Nassau (Papago, synthetic)', data: nassauRound() },
    { code: 'U38SDE', label: 'SIDES - matches_tab_finished.fixture.json (4 golfers, 2 Nassaus + presses, 2v2 match)', data: load('matches_tab_finished.fixture.json') },
    { code: 'U38FLD', label: 'FIELD - carry_order_64654480.fixture.json (14 golfers, pool: KP, skins, flights)', data: (() => { const d = load('carry_order_64654480.fixture.json'); delete d._source; return d; })() }
];
// The Venmo / Cash App data a real round would carry (the before tree ignores it).
function withPay(d) {
    const x = JSON.parse(JSON.stringify(d)), ps = x.players || [];
    x.venmo = {}; x.cashapp = {};
    ps.forEach((p, i) => { x.venmo[p.id] = 'golfer-' + (i + 1); if (i % 2) x.cashapp[p.id] = 'Cash' + (i + 1); });
    x.settleUp = { 'zz~yy~100': { by: String(ps[0] && ps[0].id), at: 1792000000000 } };
    return x;
}
const DB = (r) => ({ events: { [r.code]: withPay(r.data) }, global_courses: { az_papago: { name: 'Papago Golf Club', location: { city: 'Phoenix', state: 'AZ' } } } });

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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v45-before-'));
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
  // URGENT-045: the Settle up card's own copy of the payments, read, then set aside
  const vmm = document.getElementById('vm-mount');
  const vm = { card: !!document.getElementById('vm-settle'), rows: vmm ? Array.from(vmm.querySelectorAll('.vm-row')).map((r) => T(r.querySelector('.vm-who')) + ' ' + T(r.querySelector('.vm-amt'))) : [],
    links: vmm ? vmm.querySelectorAll('a.vm-btn').length : 0, lines: window.HardPanVenmo ? window.HardPanVenmo.readLines(document).length : 0 };
  if (vmm) vmm.remove();
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
  const exportHasCard = !!captured && captured.roots.some((x) => /Pay with Venmo|Mark paid|vm-settle/.test(x.innerHTML || ''));
  return JSON.stringify({ vm, exportHasCard, look: A ? 'A' : 'old', shareButton: !!btn, screenMoney: money(main.innerText).sort(), settle, payout, poHead, netView, segMoney, matchNet, each, ledger,
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
    test('URGENT-045 venmo totals identical before/after: ' + r.label, { timeout: 180000 }, async (t) => {
        if (!before) { t.skip('no ' + BASE); return; }
        const me = '&me=' + r.data.players[0].id;
        const b = await receipt(r, 'file://' + path.join(before, 'settlement.html') + '?game=' + r.code + me);
        const a = await receipt(r, fileUrl('settlement.html', 'game=' + r.code + me));
        const bb = await bets(r, 'file://' + path.join(before, 'skins.html') + '?game=' + r.code);
        const ab = await bets(r, fileUrl('skins.html', 'game=' + r.code));
        results.push({ r, b, a, bb, ab });
        [b, ab, bb].forEach((x) => assert.equal(x.writes, 0, 'nothing written'));
        // After: this phone shares golfer 1's own usernames only if it has a profile (it has none here): nothing written.
        assert.equal(a.writes, 0, 'nothing written by the card');
        assert.equal(b.vm.card, false, 'no card before');
        if (a.settle.length) {
            assert.ok(a.vm.card, 'the Settle up card is on the after receipt');
            assert.equal(a.vm.rows.length, a.vm.lines, 'one card row per Settle up line');
            assert.deepEqual(a.vm.rows.map((x) => x.replace(/^You pay (.+) (\$\S+)$/, (m0, w, n) => r.data.players[0].name + ' → ' + w + ' ' + n).replace(/^(.+) pays you (\$\S+)$/, (m0, w, n) => w + ' → ' + r.data.players[0].name + ' ' + n).replace(' pays ', ' → ')).sort(),
                a.settle.map((x) => x.replace(/\s+/g, ' ')).sort(), 'the card shows exactly the receipt\'s Settle up lines');
        }
        assert.equal(a.exportHasCard, false, 'Share never carries the card');
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

test('the proof table (V45_OUT)', (t) => {
    if (before) try { fs.rmSync(before, { recursive: true, force: true }); } catch (e) {}
    if (!OUT_DIR || !results.length) { t.skip('V45_OUT not set'); return; }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const same = (x, y) => (JSON.stringify(x) === JSON.stringify(y) ? 'identical' : '**DIFFERS**');
    const L = [];
    L.push('# URGENT-045 #3 Settle up with Venmo / Cash App: settlement totals before vs after', '');
    L.push('Before = gps-simple ' + BASE + ' (every file branch 045-venmo changed put back as it was: ' + CHANGED.join(', ') + '). After = branch 045-venmo with the Settle up card ON (this phone = golfer 1, usernames and a paid tick on the round). Same stubbed round data, headless Chrome 393x852, HardPan simple flow on (the #31 receipt). Nothing written (stub write count 0 on every render). Test: urgent045_venmo_totals_proof_chrome_test.js (the #27 / #31 method). The card\'s rows are read first, checked against the receipt\'s Settle up lines, then set aside; Share never carries the card.', '');
    let all = true;
    for (const { r, b, a, bb, ab } of results) {
        L.push('## ' + r.code + ' - ' + r.label, '');
        L.push('| What | Before (' + BASE + ') | After (045-venmo) | Match |', '|---|---|---|---|');
        L.push('| Settle up card (after only) | - | ' + (a.vm.card ? a.vm.rows.join(' · ') : 'no card (no player-to-player payments)') + ' | ' + (a.vm.card ? 'rows = Settle up lines' : '-') + ' |');
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
