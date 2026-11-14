#!/usr/bin/env node
// ============================================================================
// SCORECARD SCAN CHECK, IN CHROME, COLD (SK, ADVISOR-20261114-1527)
//
//   node tools/card-check-cold.js [--shots <dir> --prefix <name>] [--tree <repo>]
//
// tournament_card_check_test.js drives the Desk's scan check in mini-dom. What
// mini-dom cannot see is measured here, arriving COLD at tournament.html?
// tourney=STK26 as the owner (tools/lib/cold-arrival.js): the Firebase bundles
// are blocked, a stand-in hands the page its record, and the page runs its own
// init. Nothing the page defines is called. The only things replaced are the
// DATA SOURCES: the database (the stand-in) and the scanner (window.fetch for
// /api/scorecard-scan answers a scripted read in the LIVE response shape and
// records what was sent). The camera is a real JPEG drawn on a canvas by this
// check and handed to the page's file input the way a picked file arrives
// (DataTransfer -> input.files, then a change event).
//
//   desk     the Desk tab tapped: #cardcheck-file is a real file input with
//            accept="image/*" capture="environment"; one Scan card per group;
//            the tiles; no sideways scroll at 390 px
//   result   Scan card tapped on Group 2, the photo picked: the page's own
//            canvas shrinks a 3000 x 2250 photo, the request carries a JPEG of
//            at most about 600 KB; the grid renders inside 390 px with one red
//            and one amber cell; nothing stores the photo
//   review   a field with three cards open: Verify cards tapped; Keep app /
//            Use card tapped on every open line; cardsVerified written
//            { count, at, by }; back on the Desk "All 8 cards verified at"
//   recap    ?recap=1 with that record: the footer line, by innerText
//   laptop   the Desk at 1100 px, mid-check: 8 cards, 2 verified, 3 with
//            mismatches, 3 to scan
//
// --tree points at another checkout (the "before" shots run the same steps
// against preview-batch 5033e24b, where the scan check does not exist; there
// the steps report what is missing instead of passing).
//
// EXIT 0 PASS, 1 FAIL, 2 could not run.
// ============================================================================
const path = require('path');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i === -1 ? null : args[i + 1]; };
const TREE = path.resolve(opt('--tree') || path.join(__dirname, '..'));
const SHOTS = opt('--shots');
const PREFIX = opt('--prefix') || 'after';
const { arriveCold, fileUrl } = require(path.join(TREE, 'tools', 'lib', 'cold-arrival.js'));
const SC = require(path.join(__dirname, '..', 'scan-compare.js'));

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const PAR = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4];
const CD = PAR.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));
const sc = (pi, h, gi) => PAR[h - 1] + ((pi + h + gi) % 3 === 0 ? 1 : 0) - ((pi * 5 + h + gi) % 13 === 0 ? 1 : 0);
const G = [
    [1, ['Ana Diaz', 'Joe Fox', 'Sam Ortiz', 'Mia Chen']], [3, ['Dana Ruiz', 'Lee Park', 'Kim Vo', 'Ray Diaz']],
    [5, ['Al Lopez', 'Jo Park', 'Tom Reyes', 'Eva Lin']], [7, ['Ben Cruz', 'Liz Moore', 'Nick Hall', 'Rosa Vega']],
    [9, ['Matt Cole', 'Amy Shaw', 'Dan Ito', 'Pat Webb']], [11, ['Gus Kerr', 'Ivy Tran', 'Ken Wolfe', 'Sue Gray']],
    [13, ['Carl Ames', 'Vic Soto', 'Max Bell', 'Tia Ford']], [15, ['Hal Young', 'Zoe King', 'Ross Day', 'Nina Cho']]
];
const HOLES = PAR.map((_, i) => i + 1);
const pid = (gi, i) => 'p' + String(gi * 4 + i + 1).padStart(2, '0');
function record() {
    const players = {}, groups = {}, scores = {};
    G.forEach(([hole, names], gi) => {
        const gid = 'g' + (gi + 1);
        groups[gid] = { name: 'Group ' + (gi + 1), startingHole: String(hole), playerIds: [], createdAt: gi + 1 };
        names.forEach((n, i) => {
            players[pid(gi, i)] = { id: pid(gi, i), name: n, handicap: String(6 + gi + i), addedAt: gi * 4 + i };
            groups[gid].playerIds.push(pid(gi, i));
            HOLES.forEach((h) => { scores[`${pid(gi, i)}_h${h}`] = sc(i, h, gi); });
        });
    });
    return { name: 'Starkey Classic', scoringModel: 'player-v1', format: 'individual', ownerUid: 'u-org', eventDate: '2026-11-22',
        courseName: 'Papago Golf Course', courseData: CD, startType: 'shotgun', startTime: '08:00', players, scoringGroups: groups, scores, createdAt: 1 };
}
function scanOf(gi, edit) {
    const rows = G[gi][1].map((n, i) => {
        const holes = HOLES.map((h) => ({ hole: h, score: sc(i, h, gi), confidence: 0.96 }));
        return { name: n, row_label_as_written: n, holes, written_out: null, written_in: null, written_total: holes.reduce((s, c) => s + c.score, 0) };
    });
    if (edit) edit(rows);
    return { players: rows, notes: '' };
}
// Group 2's card as the scanner reads it: Dana's 7th a 6 (the app has 5), and the
// total she wrote is the card's; Kim Vo's 13th a 5 read at 0.55 (the app has 4).
const G2 = (r) => { r[0].holes[6].score += 1; r[0].written_total += 1; r[2].holes[12].score += 1; r[2].holes[12].confidence = 0.55; r[2].written_total = null; };
const EDITS = { 1: G2, 4: (r) => { r[1].holes[13].score = 6; r[1].written_total = null; }, 6: (r) => { r[3].holes[2].confidence = 0.6; r[3].holes[2].score = 2; r[3].written_total = null; } };
function stored(which) {
    const out = {};
    which.forEach((gi) => {
        const players = G[gi][1].map((n, i) => ({ key: pid(gi, i), name: n }));
        const app = {}; players.forEach((p, i) => { app[p.key] = {}; HOLES.forEach((h) => { app[p.key][h] = sc(i, h, gi); }); });
        out['g' + (gi + 1)] = SC.compareCard({ scan: scanOf(gi, EDITS[gi]), players, holes: HOLES, app, at: Date.now() - (8 - gi) * 90000 });
    });
    return out;
}
const db = (rec) => ({ tournaments: { STK26: rec } });
const answer = (gi) => ({ status: 'ok', model: 'gemini-2.5-flash', retried: false, paid: true, freeScansLeft: null, result: scanOf(gi, EDITS[gi]), validation: {} });
// The scanner, replaced as a data source: the page's fetch to /api/scorecard-scan
// gets the scripted read; what it sent is kept for the check to read.
const scannerStub = (gi) => `(function () {
  var ANSWER = ${JSON.stringify(answer(gi))};
  var real = window.fetch;
  window.__scanSent = [];
  window.fetch = function (url, init) {
    if (String(url).indexOf('/api/scorecard-scan') !== -1) {
      var body = {}; try { body = JSON.parse(init.body); } catch (e) {}
      window.__scanSent.push({ url: String(url), auth: !!(init.headers && /^Bearer /.test(init.headers.Authorization || '')), bytes: Math.round(String(body.image && body.image.data || '').length * 0.75), mime: body.image && body.image.mimeType, round: body.round });
      return Promise.resolve(new Response(JSON.stringify(ANSWER), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return real.apply(this, arguments);
  };
  window.__firebaseIdToken = 'cold-token';
})();`;
// The organizer's account needs getIdToken; the stand-in's user is a plain object.
const tokenShim = `(function () { var t = setInterval(function () { try { var u = window.firebase && window.firebase.auth && window.firebase.auth().currentUser; if (u && !u.getIdToken) { u.getIdToken = function () { return Promise.resolve('cold-token'); }; } } catch (e) {} }, 20); })();`;
// The phone's camera: a real JPEG (a drawn card, 3000 x 2250) handed to the input.
const PICK = `(function () {
  var input = document.getElementById('cardcheck-file');
  if (!input) return 'no #cardcheck-file';
  var c = document.createElement('canvas'); c.width = 3000; c.height = 2250;
  var g = c.getContext('2d'); g.fillStyle = '#f3f0e6'; g.fillRect(0, 0, 3000, 2250);
  g.strokeStyle = '#333'; g.lineWidth = 4;
  for (var x = 200; x < 2900; x += 120) { g.beginPath(); g.moveTo(x, 300); g.lineTo(x, 1500); g.stroke(); }
  for (var y = 300; y < 1600; y += 200) { g.beginPath(); g.moveTo(200, y); g.lineTo(2840, y); g.stroke(); }
  g.fillStyle = '#123'; g.font = '90px sans-serif';
  for (var i = 0; i < 400; i++) g.fillText(String((i * 7) % 6 + 3), 220 + (i % 22) * 120, 420 + Math.floor(i / 22) % 6 * 200);
  for (var n = 0; n < 60000; n++) { g.fillStyle = 'rgba(0,0,0,' + ((n % 7) / 40) + ')'; g.fillRect((n * 37) % 3000, (n * 91) % 2250, 3, 3); }
  var url = c.toDataURL('image/jpeg', 0.95);
  var bin = atob(url.split(',')[1]); var bytes = new Uint8Array(bin.length);
  for (var k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  var file = new File([bytes], 'card.jpg', { type: 'image/jpeg' });
  var dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'picked ' + Math.round(bytes.length / 1024) + ' KB';
})()`;
const scrollTo = (sel) => ({ expression: `(function(){ var e = document.querySelector('${sel}'); if (e) { e.scrollIntoView({block:'start'}); window.scrollBy(0,-8); } return !!e; })()` });
const shot = (name) => SHOTS ? [{ shot: path.join(SHOTS, PREFIX + '-' + name + '.png'), viewportOnly: true }] : [];
const text = (sel, tag) => `(function(){ var e = document.querySelector('${sel}'); return '${tag || 'TEXT'}:' + (e ? e.innerText : ''); })()`;
// A step's value by its tag: the steps also push 'slept 200', 'tapped ...', true.
const got = (r, tag) => (r.value || []).filter((x) => typeof x === 'string' && x.indexOf(tag + ':') === 0).map((x) => x.slice(tag.length + 1));
const MEASURE_DESK = `(function(){
  var i = document.getElementById('cardcheck-file');
  return 'DESK:' + JSON.stringify({ input: i ? { type: i.type, accept: i.getAttribute('accept'), capture: i.getAttribute('capture') } : null,
    scanButtons: document.querySelectorAll('#cardcheck-wrap .ck-scan').length,
    tiles: Array.prototype.map.call(document.querySelectorAll('#ck-tiles .pay-tile'), function (t) { return t.innerText.replace(/\\s+/g, ' '); }),
    overflowX: document.documentElement.scrollWidth - window.innerWidth });
})()`;
const MEASURE_GRID = `(function(){
  var w = document.getElementById('cardcheck-wrap'); var g = document.querySelectorAll('#ck-grid table');
  var r = w ? w.getBoundingClientRect() : null;
  var widest = 0; Array.prototype.forEach.call(g, function (t) { widest = Math.max(widest, t.getBoundingClientRect().right); });
  var tick = document.querySelector('#ck-grid .ck-mk');
  return 'GRID:' + JSON.stringify({ tables: g.length, red: document.querySelectorAll('#ck-grid td.ck-x').length, amber: document.querySelectorAll('#ck-grid td.ck-u').length,
    gridRight: Math.round(widest), wrapRight: r ? Math.round(r.right) : null, viewport: window.innerWidth,
    tickColor: tick ? getComputedStyle(tick).color : null,
    sent: window.__scanSent || null, writes: (window.__coldWrites || []).map(function (x) { return x.path; }),
    storedPhoto: JSON.stringify(window.__coldWrites || []).indexOf('base64') !== -1,
    overflowX: document.documentElement.scrollWidth - window.innerWidth });
})()`;

async function main() {
    const results = {};
    const fails = [];
    const need = (ok, what) => { if (!ok) fails.push(what); };
    const run = (o) => arriveCold(Object.assign({ auth: OWNER, settleMs: 2500, preScript: tokenShim, closeBrowser: true }, o));

    // DESK, nothing scanned
    let r = await run({ url: fileUrl('tournament.html', 'tourney=STK26'), db: db(record()), viewport: { width: 390, height: 844 },
        steps: [{ tap: '#tab-btn-desk' }, { sleep: 500 }, scrollTo('#manage-tab-desk'), { sleep: 200 }, { expression: MEASURE_DESK }, scrollTo('#cardcheck-wrap'), { sleep: 150 }, ...shot('desk-phone')] });
    if (!r.ok) { console.log(JSON.stringify({ desk: r.reason })); process.exit(2); }
    const desk = JSON.parse(got(r, 'DESK')[0] || 'null') || {};
    results.desk = desk;
    need(desk.input && desk.input.type === 'file' && desk.input.accept === 'image/*' && desk.input.capture === 'environment', 'desk: a file input with accept image/* and capture environment');
    need(desk.scanButtons === 8, 'desk: 8 Scan card buttons (saw ' + desk.scanButtons + ')');
    need(desk.overflowX <= 0, 'desk: no sideways scroll at 390');

    // RESULT: Scan card on Group 2, the photo picked
    r = await run({ url: fileUrl('tournament.html', 'tourney=STK26'), db: db(record()), viewport: { width: 390, height: 844 },
        preScript: tokenShim + scannerStub(1),
        steps: [{ tap: '#tab-btn-desk' }, { sleep: 500 }, { tap: '#cardcheck-wrap .ck-scan[data-sk="g2"]' }, { sleep: 200 }, { expression: PICK }, { sleep: 2500 },
            scrollTo('#cardcheck-wrap'), { sleep: 200 }, { expression: MEASURE_GRID }, { expression: text('#cardcheck-wrap') }, ...shot('result-phone'),
            scrollTo('#ck-issues'), { sleep: 150 }, ...shot('result-phone-issues')] });
    if (!r.ok) { console.log(JSON.stringify({ result: r.reason })); process.exit(2); }
    const grid = JSON.parse(got(r, 'GRID')[0] || '{}');
    const fullText = String(got(r, 'TEXT')[0] || '');
    results.result = { picked: (r.value || []).find((x) => /^picked|^no #/.test(String(x))), grid, text: fullText.slice(0, 400) };
    need(grid.tables === 2 && grid.red === 1 && grid.amber === 1, 'result: two nines, one red cell, one amber cell');
    need(grid.gridRight > 0 && grid.gridRight <= grid.viewport, 'result: the grid fits the screen (' + grid.gridRight + ' of ' + grid.viewport + ')');
    need(grid.sent && grid.sent.length === 1 && grid.sent[0].auth && grid.sent[0].mime === 'image/jpeg' && grid.sent[0].bytes <= 600 * 1024 && grid.sent[0].bytes > 20 * 1024, 'result: one signed request with a JPEG of 20-600 KB');
    need(grid.sent && grid.sent[0] && grid.sent[0].round && grid.sent[0].round.players.length === 4 && grid.sent[0].round.holes === 18, 'result: the group\'s round and four names sent');
    need(!grid.storedPhoto, 'result: no photo in any write');
    need(/card 6, app 5/.test(fullText) && /reads 5\?, app 4/.test(fullText), 'result: the two lines on screen');
    need(grid.overflowX <= 0, 'result: no sideways scroll at 390');

    // REVIEW: five cards matched, three open (Group 2, 5, 7) -> answer them all
    const rec = record(); rec.cardChecks = stored([0, 1, 2, 3, 4, 5, 6, 7]);
    const open = Object.keys(rec.cardChecks).reduce((n, k) => n + SC.openIssues(rec.cardChecks[k]).length, 0);
    const answerAll = [];
    for (let i = 0; i < open; i++) answerAll.push({ tap: '#ck-review-list .ck-keep' }, { sleep: 250 });
    r = await run({ url: fileUrl('tournament.html', 'tourney=STK26'), db: db(rec), viewport: { width: 390, height: 844 },
        steps: [{ tap: '#tab-btn-desk' }, { sleep: 500 }, scrollTo('#cardcheck-wrap'), { sleep: 150 }, ...shot('desk-midcheck-phone'),
            { tap: '#ck-review-open' }, { sleep: 300 }, scrollTo('#cardcheck-wrap'), { sleep: 150 }, { expression: text('#cardcheck-wrap', 'LIST') }, ...shot('verify-list-phone'),
            ...answerAll, scrollTo('#cardcheck-wrap'), { sleep: 150 }, { expression: text('#cardcheck-wrap', 'DONE') }, ...shot('verify-done-phone'),
            { tap: '#ck-back' }, { sleep: 300 }, scrollTo('#cardcheck-wrap'), { sleep: 150 }, { expression: text('#cardcheck-wrap', 'DESKV') }, ...shot('desk-verified-phone'),
            { expression: "'VER:' + JSON.stringify((window.__coldWrites || []).filter(function (w) { return /cardsVerified/.test(w.path); }))" }] });
    if (!r.ok) { console.log(JSON.stringify({ review: r.reason })); process.exit(2); }
    const listText = got(r, 'LIST')[0] || '';
    const doneText = got(r, 'DONE')[0] || '';
    const deskText = got(r, 'DESKV')[0] || '';
    const verWrites = JSON.parse(got(r, 'VER')[0] || '[]');
    results.review = { open, list: listText.slice(0, 300), done: doneText.slice(0, 200), desk: deskText.slice(0, 300), cardsVerified: verWrites.map((w) => Object.keys(w.value || {}).sort()) };
    need(/5 of 8 cards match/.test(listText), 'review: "5 of 8 cards match"');
    need(verWrites.length === 1 && verWrites[0].value.count === 8 && verWrites[0].value.by === 'organizer', 'review: cardsVerified { count: 8, by: organizer } written once');
    need(/All 8 cards verified at \d{1,2}:\d{2}\s?(AM|PM)/.test(deskText), 'review: the Desk says All 8 cards verified at <time>');

    // RECAP with that record
    const recV = Object.assign(record(), { cardsVerified: verWrites[0] ? verWrites[0].value : { count: 8, at: Date.now(), by: 'organizer' } });
    r = await run({ url: fileUrl('tournament.html', 'tourney=STK26&recap=1'), db: db(recV), auth: undefined, viewport: { width: 390, height: 844 },
        steps: [{ expression: text('#recap-verified', 'RECAP') }, scrollTo('#recap-share'), { sleep: 150 }, ...shot('recap-phone')] });
    if (!r.ok) { console.log(JSON.stringify({ recap: r.reason })); process.exit(2); }
    results.recap = got(r, 'RECAP')[0];
    need(/^All 8 cards verified at \d{1,2}:\d{2}\s?(AM|PM)$/.test(String(results.recap || '')), 'recap: the footer line, by innerText');

    // LAPTOP 1100, mid-check
    const rec2 = record(); rec2.cardChecks = stored([0, 1, 3, 4, 6]);
    r = await run({ url: fileUrl('tournament.html', 'tourney=STK26'), db: db(rec2), viewport: { width: 1100, height: 900 },
        steps: [{ tap: '#tab-btn-desk' }, { sleep: 500 }, scrollTo('#manage-tab-desk'), { sleep: 150 }, { expression: MEASURE_DESK }, ...shot('desk-laptop')] });
    if (!r.ok) { console.log(JSON.stringify({ laptop: r.reason })); process.exit(2); }
    results.laptop = JSON.parse(got(r, 'DESK')[0] || 'null') || { tiles: [] };
    need(results.laptop.tiles.join(' | ') === '8 cards | 2 verified | 3 with mismatches | 3 to scan', 'laptop: tiles 8 / 2 / 3 / 3 (saw ' + results.laptop.tiles.join(' | ') + ')');

    console.log(JSON.stringify(results, null, 1));
    if (fails.length) { console.log('FAIL\n- ' + fails.join('\n- ')); process.exit(1); }
    console.log('PASS');
}
main().catch((e) => { console.error(e); process.exit(2); });
