// ============================================================================
// URGENT-045 #4 - THE ROUND RECAP PICTURE, IN REAL CHROME.
//
// The Receipt (settlement.html, #31 option A) of a FINISHED round, opened cold
// with stubbed data, the way a golfer arrives. HardPanRecap.render(currentData)
// must produce a real PNG, and every number in it must be the Receipt's own. The
// test reads the Receipt itself - its Full Scorecard, FINAL SCORES, the game
// cards, Settle up - and the engines' scorecard cells, independently of
// round-recap.js, and compares them to the text the picture DREW (every
// fillText, recorded by the module and returned as `text`).
//
// THE BUTTONS ARE NOT HERE. Manny's split (URGENT-045): the after-round button,
// Home > History, the share sheet and Save to Photos belong to the share helper
// (branch 045-recap-share), whose own Chrome test taps them. This file proves
// the picture.
//
// Rounds (nothing written - the stub records writes and this asserts none):
//   NASSAU  Test A (12) v Test B (5), $5/$5/$5 net Nassau at Papago - the #31
//           proof round; two golfers whose names differ only by the last letter (#2)
//   SIDES   matches_tab_finished.fixture.json - two Nassaus + presses, a 2v2
//   FIELD   carry_order_64654480.fixture.json - 14 golfers, KP x5, skins in two
//           flights, a pool (no Settle up: the money is Pay out)
// Both 393x852 and 375x667, plus the refusals (another round; a Receipt not drawn).
// LOCATION GUARD: the recap asks for no location and sends nothing anywhere -
// every request the page makes is local (file:/data:/blob:), and the module's
// source names no network, storage-write or geolocation API.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-config.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl, REPO_ROOT } = require('./tools/lib/cold-arrival.js');

const OUT = process.env.U045_OUT || path.join(process.env.HOME || '', 'Desktop', 'claude-code-reports', '045', 'recap');
const SAVE = process.env.U045_SHOTS === '1';

const PAR = [5, 4, 4, 3, 4, 4, 4, 3, 5, 5, 3, 4, 4, 4, 3, 5, 4, 4];
const HCP = [15, 17, 3, 13, 11, 1, 7, 9, 5, 18, 12, 16, 2, 4, 6, 8, 10, 14];
const CD = PAR.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: HCP[i] }));
function nassauRound() {
    const A = [5, 5, 5, 4, 3, 5, 4, 6, 4, 5, 4, 4, 4, 4, 3, 5, 5, 4];
    const B = [4, 4, 4, 5, 3, 4, 5, 4, 4, 4, 5, 4, 4, 4, 3, 5, 4, 4];
    const scores = {};
    A.forEach((s, i) => { scores['p101_h' + (i + 1)] = s; });
    B.forEach((s, i) => { scores['p102_h' + (i + 1)] = s; });
    return { eventName: 'Single Round', courseName: 'Papago Golf Club', activeCourseKey: 'az_papago', gameFormat: 'stroke',
        settlementMode: 'whole-dollar', teeRating: { teeKey: 'male:1', teeName: 'Men · White', slope: 125, courseRating: 70.9, par: 72, allowance: 100 },
        courseData: CD, scores,
        players: [{ id: 101, name: 'Test A', hcp: '12', playingForMoney: true }, { id: 102, name: 'Test B', hcp: '5', playingForMoney: true }],
        sideMatches: { '-U045nassau': { format: 'nassau', scoring: 'net', stake: 5, frontStake: 5, backStake: 5, overallStake: 5, pressRule: 'none',
            startHole: 1, createdAt: 1792000000000, teamAIds: ['101'], teamBIds: ['102'] } } };
}
const load = (f) => { const d = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')); delete d._source; return d; };
const ROUNDS = [
    { code: 'U45NAS', tag: 'nassau', data: nassauRound(), settle: true },
    { code: 'U45SDE', tag: 'sides', data: load('matches_tab_finished.fixture.json'), settle: true },
    { code: 'U45FLD', tag: 'field', data: load('carry_order_64654480.fixture.json'), settle: false }
];
const DB = (r) => ({ events: { [r.code]: r.data }, global_courses: { az_papago: { name: 'Papago Golf Club', location: { city: 'Phoenix', state: 'AZ' } } } });
const PRE = 'window.__simpleFlow = true; try { localStorage.setItem("hardpan_simple_flow", "on"); } catch (e) {}';

// ---- THE RECEIPT, READ BY THIS TEST (not by the module) --------------------------
const READ = `(() => {
  const T = (e) => (e ? String(e.innerText || '').replace(/\\u00A0/g, ' ').replace(/\\s+/g, ' ').trim() : '');
  const MONEY = /[+\\-\\u2212]?\\$[0-9][0-9,]*(?:\\.[0-9][0-9])?/g;
  const money = (s) => (String(s || '').match(MONEY) || []).map((m) => m.replace('\\u2212', '-'));
  const card = {}; const order = [];
  let hole = [];
  document.querySelectorAll('#receipt-scorecard .receipt-table tr').forEach((tr) => {
    const c = Array.from(tr.children).map(T);
    if (c[0] === 'HOLE') { hole = c.slice(1); return; }
    if (c[0] === 'PAR' || c[0] === 'HCP' || tr.classList.contains('rt-net')) return;
    order.push(c[0]); const g = {}; hole.forEach((h, i) => { g[h] = c[i + 1]; }); card[c[0]] = g;
  });
  const fsr = Array.from(document.querySelectorAll('#hp-rc-scores tbody tr')).map((tr) => ({
    name: T(tr.querySelector('td.nm')).replace(/ [+]?[0-9.]+$/, ''), net: T(tr.querySelector('td.n')), gross: T(tr.querySelector('td.g')) }));
  const d = (typeof currentData !== 'undefined' && currentData) || {};
  const cells = ScorecardRows.scorecardCells({ courseData: d.courseData || [], scores: d.scores || {}, players: d.players || [], showNet: true });
  const engine = cells.golfers.map((g) => ({ name: g.name, front: g.gross.front.map((x) => x.value), back: g.gross.back.map((x) => x.value), out: g.gross.out, in: g.gross.in, tot: g.gross.tot, net: g.net.tot }));
  const gameLines = Array.from(document.querySelectorAll('.hp-rc-game .hp-rc-ln .r')).map(T)
    .concat(Array.from(document.querySelectorAll('#money-pool-section .settle-card > .ledger-row:not(.skins-carry-row), #settle-content .settle-card > .ledger-row:not(.skins-carry-row)'))
      .map((r) => T(r.lastElementChild)).filter(Boolean));
  const matchNet = Array.from(document.querySelectorAll('.hp-rc-game .hp-rc-tot > span:last-child')).map(T);
  const settle = Array.from(document.querySelectorAll('.hp-rc-pay')).map((p) => [T(p.children[0]), T(p.children[1])]);
  const payout = Array.from(document.querySelectorAll('#results-top .payout-card .po-row > summary')).map((s) => [T(s.querySelector('.po-name')), T(s.querySelector('.po-amt'))]);
  // every $ the drawn sections hold on the Receipt: the game cards, then Settle up (or Pay out)
  const secMoney = [];
  document.querySelectorAll('#money-pool-section .settle-card, #settle-content .hp-rc-game, #settle-content .settle-card').forEach((c) => {
    if (c.closest('.hp-rc-game') && !c.classList.contains('hp-rc-game')) return;
    c.querySelectorAll('.hp-rc-k, .game-head, .settle-header, .hp-rc-ln, .hp-rc-note, .hp-rc-tot, .hp-rc-why, :scope > .ledger-row:not(.skins-carry-row)').forEach((e) => secMoney.push(...money(e.textContent.replace(/\\u00A0/g, ' '))));
  });
  if (settle.length) settle.forEach((s) => secMoney.push(...money(s[1])));
  else { const po = document.querySelector('#results-top .payout-card'); if (po) { secMoney.push(...money(T(po.querySelector('.po-total')))); payout.forEach((p) => secMoney.push(...money(p[1]))); } }
  const foot = Array.from(document.querySelectorAll('#hp-rc-foot button')).map((b) => { const r = b.getBoundingClientRect(); return { t: T(b), l: r.left, r: r.right, w: r.width }; });
  return JSON.stringify({ course: T(document.querySelector('.receipt-head-course')), date: T(document.querySelector('.receipt-head-date')).replace(/ \\u00B7 .*$/, ''),
    order, card, fsr, engine, gameLines, matchNet, settle, payout, secMoney: secMoney.sort(), foot, writes: (window.__coldWrites || []).length });
})()`;
const RUN = `(() => { window.__rr = null; HardPanRecap.render(currentData).then((x) => {
    const fr = new FileReader();
    fr.onload = () => { window.__rr = JSON.stringify({ ok: true, blobType: x.blob && x.blob.type, blobSize: x.blob && x.blob.size,
        blobSame: fr.result === x.dataUrl, dataUrl: x.dataUrl, width: x.width, height: x.height, name: x.name, text: x.text,
        writes: (window.__coldWrites || []).length, scrollW: document.documentElement.scrollWidth, innerW: innerWidth }); };
    fr.readAsDataURL(x.blob);
  }, (e) => { window.__rr = JSON.stringify({ ok: false, err: String(e && e.message) }); }); return 1; })()`;
// the refusals: a Receipt for another round, and a page with no Receipt drawn
const REFUSE = `(() => { window.__rf = null; const out = {};
  HardPanRecap.render(Object.assign({}, currentData, { courseName: 'Some Other Course' })).then(() => { out.other = 'drew'; }, (e) => { out.other = e.message; })
  .then(() => HardPanRecap.render(currentData, { doc: document.implementation.createHTMLDocument('x') })).then(() => { out.blank = 'drew'; }, (e) => { out.blank = e.message; })
  .then(() => { window.__rf = JSON.stringify(out); }); return 1; })()`;

function pngSize(b64) {
    const b = Buffer.from(b64, 'base64');
    assert.equal(b.slice(0, 8).toString('hex'), '89504e470d0a1a0a', 'a real PNG');
    assert.equal(b.slice(12, 16).toString(), 'IHDR');
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length, buf: b };
}
const MONEY = /[+\-−]?\$[0-9][0-9,]*(?:\.[0-9][0-9])?/g;

async function recap(r, vp, shotTag) {
    const shots = SAVE && shotTag ? [{ shot: path.join(OUT, shotTag + '-receipt.png'), viewportOnly: true }] : [];
    const res = await arriveCold({ url: fileUrl('settlement.html', 'game=' + r.code), db: DB(r), viewport: vp, settleMs: 1500, preScript: PRE,
        steps: [{ waitFor: "!!document.querySelector('#receipt-scorecard table') && !!document.querySelector('#hp-rc-scores table') && !!document.querySelector('#hp-rc-foot:not([hidden])')", timeout: 20000 },
            { sleep: 400 }].concat(shots, [{ expression: READ }, { expression: RUN }, { waitFor: '!!window.__rr', timeout: 15000 }, { expression: 'window.__rr' },
            { expression: REFUSE }, { waitFor: '!!window.__rf', timeout: 15000 }, { expression: 'window.__rf' }]) });
    assert.ok(res.ok, r.code + ': ' + res.reason);
    const v = res.value.filter((x) => typeof x === 'string' && x[0] === '{').map((x) => JSON.parse(x));
    const pick = (k) => v.find((x) => k in x);
    return { rcpt: pick('order'), out: pick('ok'), refuse: pick('other'), requests: res.requests || [] };
}

function checkRound(r, got) {
    const { rcpt, out, refuse, requests } = got;
    assert.ok(out.ok, 'render resolved: ' + out.err);
    // THE PICTURE EXISTS: a PNG blob, the same bytes as the data URL, its stated size
    assert.equal(out.blobType, 'image/png');
    assert.ok(out.blobSame, 'the blob is the data URL\'s PNG');
    assert.match(out.dataUrl, /^data:image\/png;base64,/);
    const p = pngSize(out.dataUrl.split(',')[1]);
    assert.equal(p.w, out.width); assert.equal(p.h, out.height);
    assert.ok(p.w >= 1080 && p.h > 1000, 'a phone-sized picture: ' + p.w + 'x' + p.h);
    assert.ok(p.w * p.h <= 16777216, 'under the iOS canvas limit');
    assert.match(out.name, /^hardpan-recap-[a-z0-9-]+\.png$/);
    const D = out.text;
    const of = (role) => D.filter((x) => x.role === role).map((x) => x.text);
    // COURSE AND DAY
    assert.equal(of('course').join(' '), rcpt.course, 'the course, as the Receipt names it');
    assert.equal(of('date')[0].split(' \u00B7 ')[0], rcpt.date, 'the day, as the Receipt dates it (no History stamp on this phone)');
    // THE SCORECARD: golfers x holes, OUT / IN / TOT, net
    const names = D.filter((x) => x.role === 'name');
    const n = rcpt.order.length;
    assert.ok(n > 0);
    const firstNine = names.slice(0, n).map((x) => x.text);
    assert.deepEqual(firstNine, rcpt.order, 'every golfer, in the Receipt\'s order');
    assert.equal(new Set(firstNine).size, firstNine.length, 'every name tellable apart (#2)');
    rcpt.order.forEach((name, gi) => {
        const cell = (col) => { const c = D.filter((x) => x.gi === gi && x.col === col && /hole|sec|net/.test(x.role)); return c.length ? c[0].text : undefined; };
        const e = rcpt.engine[gi];
        assert.equal(e.name, name, 'engine golfer ' + gi);
        const cols = Object.keys(rcpt.card[name]);
        assert.ok(cols.length >= 10, 'the Full Scorecard row was read');
        cols.forEach((col) => assert.equal(cell(col), rcpt.card[name][col], name + ' ' + col + ': the picture = the Full Scorecard'));
        e.front.concat(e.back).forEach((v, i) => {
            const col = String(i + 1);
            assert.equal(cell(col), v === null || v === undefined ? '\u2013' : String(v), name + ' hole ' + col + ': the picture = the engine');
        });
        if (e.front.length && e.back.length) { assert.equal(cell('OUT'), String(e.out)); assert.equal(cell('IN'), String(e.in)); }
        assert.equal(cell('TOT'), String(e.tot), name + ' TOT = the engine');
        assert.equal(cell('NET'), rcpt.fsr[gi].net, name + ' NET = FINAL SCORES');
        assert.equal(cell('NET'), String(e.net), name + ' NET = the engine');
    });
    // WHO WON WHAT
    assert.deepEqual(of('game-money'), rcpt.gameLines, 'every game line\'s figure, in order');
    assert.deepEqual(of('game-total-money'), rcpt.matchNet, 'every match net');
    // THE MONEY
    const lines = of('money-line').map((t, i) => [t, of('money-amount')[i]]);
    if (r.settle) {
        assert.ok(rcpt.settle.length > 0, 'the round has a Settle up');
        assert.deepEqual(lines, rcpt.settle, 'Settle up, line for line');
        assert.equal(of('money-head')[0], 'SETTLE UP');
    } else {
        assert.equal(rcpt.settle.length, 0);
        assert.ok(rcpt.payout.length > 0);
        assert.deepEqual(lines, rcpt.payout, 'Pay out, line for line');
    }
    // EVERY $ IN THE PICTURE IS ONE THE RECEIPT SHOWS, AND NONE IS MISSING
    const drawnMoney = D.filter((x) => !/chip|brand|course|date|foot/.test(x.role)).map((x) => x.text).join('  ').match(MONEY) || [];
    assert.ok(drawnMoney.length > 0);
    assert.deepEqual(drawnMoney.map((m) => m.replace('\u2212', '-')).sort(), rcpt.secMoney, 'the picture\'s money = the Receipt\'s money');
    // REFUSALS
    assert.equal(refuse.other, 'wrong-round', 'a Receipt for another round is not drawn');
    assert.equal(refuse.blank, 'not-ready', 'no Receipt, no picture');
    // NOTHING WRITTEN, NOTHING SENT
    assert.equal(rcpt.writes, 0); assert.equal(out.writes, 0, 'the recap wrote nothing');
    const remote = requests.filter((u) => !/^(file|data|blob|chrome|about):/.test(u));
    assert.deepEqual(remote, [], 'no request leaves the phone (no location, nothing)');
    assert.ok(out.scrollW <= out.innerW, 'the Receipt page still has no sideways scroll');
    return { p, D };
}

for (const vp of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    for (const r of ROUNDS) {
        test('recap ' + r.tag + ' at ' + vp.width + 'x' + vp.height + ': a PNG, and every number = the Receipt', { timeout: 120000 }, async () => {
            if (SAVE) fs.mkdirSync(OUT, { recursive: true });
            const got = await recap(r, vp, r.tag + '-' + vp.width);
            const { p, D } = checkRound(r, got);
            if (SAVE && vp.width === 393) fs.writeFileSync(path.join(OUT, 'recap-' + r.tag + '.png'), p.buf);
            if (r.tag === 'nassau') {
                const names = D.filter((x) => x.role === 'name').map((x) => x.text);
                assert.ok(names.includes('Test A') && names.includes('Test B'), 'Test A and Test B, whole (#2): ' + names);
                const money = D.filter((x) => /money-/.test(x.role)).map((x) => x.text);
                assert.deepEqual(money, ['SETTLE UP', 'Test B \u2192 Test A', '$10', 'One payment settles everything']);
                assert.deepEqual(D.filter((x) => x.role === 'game-money').map((x) => x.text), ['$0 \u00B7 halved', 'Test A +$5', 'Test A +$5']);
                assert.deepEqual(D.filter((x) => x.role === 'game-total-money').map((x) => x.text), ['Test A +$10']);
            }
        });
    }
}

test('the day: History\'s stamp for the round when this phone has one, not today', { timeout: 120000 }, async () => {
    const r = ROUNDS[0];
    const at = new Date(2026, 9, 13, 9, 30).getTime();
    const res = await arriveCold({ url: fileUrl('settlement.html', 'game=' + r.code), db: DB(r), viewport: { width: 393, height: 852 }, settleMs: 1500,
        preScript: PRE + 'try { localStorage.setItem("hardpan_round_seen_v1", JSON.stringify({ U45NAS: ' + at + ' })); } catch (e) {}',
        steps: [{ waitFor: "!!document.querySelector('#receipt-scorecard table') && !!document.querySelector('#hp-rc-scores table')", timeout: 20000 },
            { expression: RUN }, { waitFor: '!!window.__rr', timeout: 15000 }, { expression: 'window.__rr' }] });
    assert.ok(res.ok, res.reason);
    const out = res.value.filter((x) => typeof x === 'string' && x[0] === '{').map((x) => JSON.parse(x)).find((x) => 'ok' in x);
    assert.equal(out.text.find((x) => x.role === 'date').text.split(' \u00B7 ')[0], 'Tuesday, October 13, 2026');
});

test('LOCATION / NETWORK GUARD: round-recap.js names no network, write or location API', () => {
    const src = fs.readFileSync(path.join(__dirname, 'round-recap.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(/HardPanRecap/.test(src) && /fillText/.test(src), 'positive: the module was read');
    ['geolocation', 'getCurrentPosition', 'watchPosition', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'firebase', '.set(', '.update(', '.push(', 'setItem', 'removeItem']
        .forEach((bad) => { if (bad === '.push(') return; assert.ok(src.indexOf(bad) === -1, 'round-recap.js must not use ' + bad); });
    assert.ok(!/\.ref\(/.test(src), 'no database ref');
});
