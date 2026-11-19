#!/usr/bin/env node
// ============================================================================
// CARD TURN-IN, IN CHROME, COLD (C, ADVISOR-20261118-1533, Manny's pick 2026-11-18)
//
//   node tools/card-turn-in-cold.js [--shots <dir> --prefix <name>]
//
// tournament_card_turn_in_test.js drives both sides in mini-dom. What mini-dom
// cannot see is measured here, arriving COLD (tools/lib/cold-arrival.js): the
// Firebase bundles are blocked, a stand-in hands each page its record, and the
// page runs its own init. Nothing the page defines is called. The only things
// replaced are the DATA SOURCES: the database (the stand-in) and the two
// functions (window.fetch answers /api/scorecard-scan and /api/card-turn-in in
// their live response shapes and records what was sent). The camera is a real
// JPEG drawn on a canvas by this check and handed to the page's file input the
// way a picked file arrives.
//
//   golfer    tournament-scorecard.html?tourney=STK26&group=g2 at 390 x 844, the
//             organizer's switch on: the Turn in our card button (>= 44 px tall,
//             no sideways scroll); the photo picked: the check grid inside 390 px,
//             72 dotted digits, the two ✓ lines; Send tapped: Waiting for the
//             organizer; a second arrival whose state is approved: On the leaderboard
//   off       the same link, the switch off: no card on the page
//   desk      tournament.html?tourney=STK26 as the owner at 390 (Check now tapped: the
//             stand-in's user gains its token a tick after the first draw): the switch off,
//             unchecked, nothing asked of the function; the switch on with a card
//             waiting: the queue row, Open -> the grid and Approve · 72 holes,
//             See photo -> the JPEG, Approve -> 72 score writes through the page
//             and the check stored; the row reads On the leaderboard
//   laptop    the Desk at 1100 px with the card open
//
// EXIT 0 PASS, 1 FAIL, 2 could not run.
// ============================================================================
const path = require('path');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i === -1 ? null : args[i + 1]; };
const SHOTS = opt('--shots');
const PREFIX = opt('--prefix') || 'after';
const { arriveCold, fileUrl } = require(path.join(__dirname, 'lib', 'cold-arrival.js'));

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const PAR = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4];
const CD = PAR.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));
const sc = (pi, h, gi) => PAR[h - 1] + ((pi + h + gi) % 3 === 0 ? 1 : 0) - ((pi * 5 + h + gi) % 13 === 0 ? 1 : 0);
const G = [
    [1, ['Ana Diaz', 'Joe Fox', 'Sam Ortiz', 'Mia Chen']], [3, ['Dana Ruiz', 'Lee Park', 'Kim Vo', 'Ray Diaz']],
    [5, ['Al Lopez', 'Jo Park', 'Tom Reyes', 'Eva Lin']], [7, ['Ben Cruz', 'Liz Moore', 'Nick Hall', 'Rosa Vega']]
];
const HOLES = PAR.map((_, i) => i + 1);
const pid = (gi, i) => 'p' + String(gi * 4 + i + 1).padStart(2, '0');
// Group 2 kept score on paper: no scores in the app.
function record(turnIn) {
    const players = {}, groups = {}, scores = {};
    G.forEach(([hole, names], gi) => {
        const gid = 'g' + (gi + 1);
        groups[gid] = { name: 'Group ' + (gi + 1), startingHole: String(hole), playerIds: [], createdAt: gi + 1 };
        names.forEach((n, i) => {
            players[pid(gi, i)] = { id: pid(gi, i), name: n, handicap: String(6 + gi + i), addedAt: gi * 4 + i };
            groups[gid].playerIds.push(pid(gi, i));
            if (gi !== 1) HOLES.forEach((h) => { scores[`${pid(gi, i)}_h${h}`] = sc(i, h, gi); });
        });
    });
    const rec = { name: 'Starkey Classic', scoringModel: 'player-v1', format: 'individual', ownerUid: 'u-org', eventDate: '2026-11-22',
        courseName: 'Papago Golf Course', courseData: CD, startType: 'shotgun', startTime: '08:00', players, scoringGroups: groups, scores, createdAt: 1 };
    if (turnIn) rec.cardTurnIn = true;
    return rec;
}
const scanRows = () => G[1][1].map((n, i) => {
    const holes = HOLES.map((h) => ({ hole: h, score: sc(i, h, 1), confidence: i === 2 && h === 13 ? 0.55 : 0.96 }));
    return { name: n, row_label_as_written: n, holes, written_out: null, written_in: null, written_total: holes.reduce((s, c) => s + c.score, 0) };
});
const SCAN_ANSWER = { status: 'ok', model: 'gemini-2.5-flash', retried: false, paid: false, freeScansLeft: null, result: { players: scanRows(), notes: '' }, validation: {} };
const NOW = 1763500000000;
const card = (over) => Object.assign({ sk: 'g2', by: 'Dana Ruiz', at: NOW, state: 'sent', decidedAt: 0, photo: true }, over || {});
const db = (rec) => ({ tournaments: { STK26: rec } });

// The two functions, replaced as data sources. STATE: the state a status read answers.
const apiStub = (o) => `(function () {
  var SCAN = ${JSON.stringify(SCAN_ANSWER)};
  var LIST = ${JSON.stringify(o.list || [])};
  var STATE = ${JSON.stringify(o.state || 'sent')};
  var real = window.fetch;
  window.__sent = [];
  function photoB64() { var c = document.createElement('canvas'); c.width = 600; c.height = 450; var g = c.getContext('2d'); g.fillStyle = '#f3f0e6'; g.fillRect(0, 0, 600, 450); g.fillStyle = '#123'; g.font = '40px sans-serif'; for (var i = 0; i < 60; i++) g.fillText(String((i * 7) % 6 + 3), 30 + (i % 12) * 46, 90 + Math.floor(i / 12) * 70); return c.toDataURL('image/jpeg', 0.8).split(',')[1]; }
  window.fetch = function (url, init) {
    var u = String(url), method = ((init && init.method) || 'GET').toUpperCase();
    var body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) {}
    var rec = { url: u, method: method, auth: !!(init && init.headers && /^Bearer /.test(init.headers.Authorization || '')) };
    if (body) rec.body = { action: body.action, code: body.code, sk: body.sk, by: body.by, photoChars: body.photo ? body.photo.length : 0, rows: body.scan ? body.scan.players.length : (body.round ? body.round.players.length : 0), event: body.event, imageBytes: body.image ? Math.round(body.image.data.length * 0.75) : 0 };
    var a = null;
    if (u.indexOf('/api/scorecard-scan') !== -1) a = SCAN;
    else if (u.indexOf('/api/card-turn-in') !== -1) {
      if (method === 'POST') a = body && body.action === 'send' ? { status: 'ok', card: ${JSON.stringify(card())} } : { status: 'ok', card: ${JSON.stringify(card({ decidedAt: NOW + 60000 }))} };
      else if (/[?&]photo=1/.test(u)) a = { status: 'ok', sk: 'g2', photo: photoB64() };
      else if (/[?&]read=1/.test(u)) a = { status: 'ok', card: ${JSON.stringify(card())} };
      else if (/[?&]sk=/.test(u)) a = { status: 'ok', card: ${JSON.stringify(card())} };
      else a = { status: 'ok', cards: LIST };
      if (a.card && method === 'POST' && body.action !== 'send') a.card.state = body.action === 'approve' ? 'approved' : 'declined';
      if (a.card && method === 'GET' && /[?&]sk=/.test(u) && !/read=1|photo=1/.test(u)) a.card.state = STATE;
      if (a.card && /read=1/.test(u)) a.card.scan = SCAN.result;
    }
    if (!a) return real.apply(this, arguments);
    window.__sent.push(rec);
    return Promise.resolve(new Response(JSON.stringify(a), { status: 200, headers: { 'content-type': 'application/json' } }));
  };
})();`;
// The stand-in's user is a plain object; the pages ask it for a token.
const tokenShim = `(function () { var t = setInterval(function () { try { var u = window.firebase && window.firebase.auth && window.firebase.auth().currentUser; if (u && !u.getIdToken) { u.getIdToken = function () { return Promise.resolve('cold-token'); }; } } catch (e) {} }, 20); })();`;
// The phone's camera: a real JPEG (a drawn card, 3000 x 2250) handed to the input.
const PICK = (inputId) => `(function () {
  var input = document.getElementById('${inputId}');
  if (!input) return 'no #${inputId}';
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
const got = (r, tag) => (r.value || []).filter((x) => typeof x === 'string' && x.indexOf(tag + ':') === 0).map((x) => x.slice(tag.length + 1));
const MEASURE_CARD = (tag) => `(function(){
  var c = document.getElementById('turnin-card'); var b = document.getElementById('turnin-start') || document.getElementById('turnin-send');
  var g = document.querySelectorAll('#turnin-grid table'); var widest = 0; Array.prototype.forEach.call(g, function (t) { widest = Math.max(widest, t.getBoundingClientRect().right); });
  return '${tag}:' + JSON.stringify({ shown: !!c && getComputedStyle(c).display !== 'none', text: c ? c.innerText : '', button: b ? { text: b.innerText, h: Math.round(b.getBoundingClientRect().height) } : null,
    tables: g.length, dotted: document.querySelectorAll('#turnin-grid td.ck-m').length, red: document.querySelectorAll('#turnin-grid td.ck-x').length, amber: document.querySelectorAll('#turnin-grid td.ck-u').length,
    gridRight: Math.round(widest), viewport: window.innerWidth, overflowX: document.documentElement.scrollWidth - window.innerWidth,
    sent: window.__sent || null, writes: (window.__coldWrites || []).length });
})()`;
const MEASURE_DESK = (tag) => `(function(){
  var sw = document.getElementById('ti-switch-box'); var q = document.getElementById('ti-queue'); var ap = document.querySelector('.ti-approve');
  var g = document.querySelectorAll('#ti-grid table'); var widest = 0; Array.prototype.forEach.call(g, function (t) { widest = Math.max(widest, t.getBoundingClientRect().right); });
  var w = (window.__coldWrites || []);
  return '${tag}:' + JSON.stringify({ switchOn: sw ? sw.checked : null, queue: q ? q.innerText : null, approve: ap ? { text: ap.innerText, h: Math.round(ap.getBoundingClientRect().height) } : null,
    tables: g.length, dotted: document.querySelectorAll('#ti-grid td.ck-m').length, gridRight: Math.round(widest), viewport: window.innerWidth, overflowX: document.documentElement.scrollWidth - window.innerWidth,
    photo: !!document.querySelector('#ti-photo img'), scoreWrites: w.filter(function (x) { return /\\/scores\\//.test(x.path); }).length, checkWrites: w.filter(function (x) { return /cardChecks/.test(x.path); }).length,
    switchWrites: w.filter(function (x) { return /cardTurnIn$/.test(x.path); }).map(function (x) { return x.value; }), photoStored: JSON.stringify(w).indexOf('base64') !== -1,
    sent: (window.__sent || []).map(function (s) { return s.method + ' ' + s.url.replace(/^.*\\/api\\//, '') + (s.body && s.body.action ? ' ' + s.body.action : ''); }) });
})()`;

async function main() {
    const results = {};
    const fails = [];
    const need = (ok, what) => { if (!ok) fails.push(what); };
    const run = (o) => arriveCold(Object.assign({ settleMs: 2500, closeBrowser: true }, o));
    const PHONE = { width: 390, height: 844 };
    const GOLFER = fileUrl('tournament-scorecard.html', 'tourney=STK26&group=g2');

    // GOLFER: the switch on - button, photo, check, Send, waiting
    let r = await run({ url: GOLFER, db: db(record(true)), viewport: PHONE, preScript: tokenShim + apiStub({}),
        steps: [scrollTo('#turnin-card'), { sleep: 200 }, { expression: MEASURE_CARD('BTN') }, ...shot('golfer-button-phone'),
            { expression: PICK('turnin-file') }, { sleep: 3000 }, scrollTo('#turnin-card'), { sleep: 200 }, { expression: MEASURE_CARD('CHECK') }, ...shot('golfer-check-phone'),
            { tap: '#turnin-send' }, { sleep: 1500 }, scrollTo('#turnin-card'), { sleep: 200 }, { expression: MEASURE_CARD('SENT') }, ...shot('golfer-waiting-phone')] });
    if (!r.ok) { console.log(JSON.stringify({ golfer: r.reason })); process.exit(2); }
    const btn = JSON.parse(got(r, 'BTN')[0] || '{}'), chk = JSON.parse(got(r, 'CHECK')[0] || '{}'), sent = JSON.parse(got(r, 'SENT')[0] || '{}');
    results.golfer = { picked: (r.value || []).find((x) => /^picked|^no #/.test(String(x))), button: btn.button, buttonText: (btn.text || '').slice(0, 160), check: { tables: chk.tables, dotted: chk.dotted, red: chk.red, amber: chk.amber, gridRight: chk.gridRight, viewport: chk.viewport, text: (chk.text || '').slice(0, 260), scan: (chk.sent || [])[0] }, sent: { text: (sent.text || '').slice(0, 200), send: (sent.sent || []).filter((s) => s.body && s.body.action === 'send')[0], polls: (sent.sent || []).filter((s) => s.method === 'GET').length, writes: sent.writes } };
    need(btn.shown && btn.button && /Turn in our card/.test(btn.button.text) && btn.button.h >= 44, 'golfer: the Turn in our card button, at least 44 px tall');
    need(btn.overflowX <= 0, 'golfer: no sideways scroll at 390');
    need(chk.tables === 2 && chk.dotted === 72 && chk.red === 0 && chk.amber === 0, 'golfer: the check grid - two nines, 72 dotted digits, nothing red or amber');
    need(chk.gridRight > 0 && chk.gridRight <= chk.viewport, 'golfer: the grid fits the screen (' + chk.gridRight + ' of ' + chk.viewport + ')');
    need(/Names matched to Group 2/.test(chk.text) && /Totals match the card/.test(chk.text), 'golfer: the two ✓ lines');
    need(/1 number the scanner was not sure about/.test(chk.text), 'golfer: the low-confidence count (Kim\'s 13th at 0.55)');
    const scan = (chk.sent || [])[0];
    need(scan && scan.auth && scan.body && scan.body.rows === 4 && scan.body.event && scan.body.event.code === 'STK26' && scan.body.imageBytes > 20 * 1024 && scan.body.imageBytes <= 600 * 1024, 'golfer: one signed scan with four names, event:{code}, a JPEG of 20-600 KB');
    const send = (sent.sent || []).filter((s) => s.body && s.body.action === 'send')[0];
    need(send && send.auth && send.body.code === 'STK26' && send.body.sk === 'g2' && send.body.rows === 4 && send.body.photoChars > 1000, 'golfer: one signed send with the read and the photo');
    need(/Waiting for the organizer/.test(sent.text) && /Keep the paper card/.test(sent.text), 'golfer: Waiting for the organizer');
    need(sent.writes === 0, 'golfer: nothing written to the record (saw ' + sent.writes + ' writes)');

    // GOLFER, APPROVED: the same link, the state the server answers is approved
    r = await run({ url: GOLFER, db: db(record(true)), viewport: PHONE, preScript: tokenShim + apiStub({ state: 'approved' }),
        steps: [{ expression: PICK('turnin-file') }, { sleep: 3000 }, { tap: '#turnin-send' }, { sleep: 2000 }, scrollTo('#turnin-card'), { sleep: 200 }, { expression: MEASURE_CARD('APPROVED') }, ...shot('golfer-approved-phone')] });
    if (!r.ok) { console.log(JSON.stringify({ approved: r.reason })); process.exit(2); }
    const ap = JSON.parse(got(r, 'APPROVED')[0] || '{}');
    results.approved = { text: (ap.text || '').slice(0, 160), writes: ap.writes };
    need(/CARD APPROVED/.test(ap.text) && /On the leaderboard/.test(ap.text), 'golfer: On the leaderboard once the server says approved');
    need(ap.writes === 0, 'golfer: still nothing written');

    // OFF: the switch off, no card
    r = await run({ url: GOLFER, db: db(record(false)), viewport: PHONE, preScript: tokenShim + apiStub({}),
        steps: [{ expression: MEASURE_CARD('OFF') }, ...shot('golfer-switch-off-phone')] });
    if (!r.ok) { console.log(JSON.stringify({ off: r.reason })); process.exit(2); }
    const off = JSON.parse(got(r, 'OFF')[0] || '{}');
    results.off = { shown: off.shown, sent: (off.sent || []).length };
    need(off.shown === false && (off.sent || []).length === 0, 'off: no card and nothing asked while the organizer\'s switch is off');

    // DESK, switch off
    const ORG = fileUrl('tournament.html', 'tourney=STK26');
    r = await run({ url: ORG, db: db(record(false)), auth: OWNER, viewport: PHONE, preScript: tokenShim + apiStub({ list: [card()] }),
        steps: [{ tap: '#tab-btn-desk' }, { sleep: 600 }, scrollTo('#cardcheck-wrap'), { sleep: 200 }, { expression: MEASURE_DESK('DOFF') }, ...shot('desk-switch-off-phone')] });
    if (!r.ok) { console.log(JSON.stringify({ deskOff: r.reason })); process.exit(2); }
    const doff = JSON.parse(got(r, 'DOFF')[0] || '{}');
    results.deskOff = { switchOn: doff.switchOn, queue: doff.queue, sent: doff.sent };
    need(doff.switchOn === false && doff.queue === null && (doff.sent || []).length === 0, 'desk: the switch off, no queue, the function not asked');

    // DESK, switch on with a card waiting: Open, See photo, Approve
    r = await run({ url: ORG, db: db(record(true)), auth: OWNER, viewport: PHONE, preScript: tokenShim + apiStub({ list: [card()] }),
        steps: [{ tap: '#tab-btn-desk' }, { sleep: 600 }, { tap: '#ti-refresh' }, { sleep: 1500 }, scrollTo('#cardcheck-wrap'), { sleep: 200 }, { expression: MEASURE_DESK('DQ') }, ...shot('desk-queue-phone'),
            { tap: '.ti-open[data-sk="g2"]' }, { sleep: 800 }, scrollTo('#ti-queue'), { sleep: 200 }, { expression: MEASURE_DESK('DOPEN') }, ...shot('desk-card-open-phone'),
            { tap: '.ti-photo-btn' }, { sleep: 800 }, scrollTo('#ti-photo'), { sleep: 200 }, { expression: MEASURE_DESK('DPHOTO') }, ...shot('desk-photo-phone'),
            { tap: '.ti-approve' }, { sleep: 1800 }, scrollTo('#cardcheck-wrap'), { sleep: 200 }, { expression: MEASURE_DESK('DAPP') }, ...shot('desk-approved-phone')] });
    if (!r.ok) { console.log(JSON.stringify({ desk: r.reason })); process.exit(2); }
    const dq = JSON.parse(got(r, 'DQ')[0] || '{}'), dopen = JSON.parse(got(r, 'DOPEN')[0] || '{}'), dphoto = JSON.parse(got(r, 'DPHOTO')[0] || '{}'), dapp = JSON.parse(got(r, 'DAPP')[0] || '{}');
    results.desk = { queue: (dq.queue || '').slice(0, 200), open: { approve: dopen.approve, tables: dopen.tables, dotted: dopen.dotted, gridRight: dopen.gridRight, viewport: dopen.viewport }, photo: dphoto.photo, approved: { scoreWrites: dapp.scoreWrites, checkWrites: dapp.checkWrites, photoStored: dapp.photoStored, queue: (dapp.queue || '').slice(0, 200), sent: dapp.sent } };
    need(dq.switchOn === true && /Cards turned in · 1 waiting/.test(dq.queue || '') && /Group 2/.test(dq.queue || '') && /New/.test(dq.queue || ''), 'desk: the queue lists Group 2 as New, 1 waiting');
    need(dopen.approve && /Approve · 72 holes to the board/.test(dopen.approve.text) && dopen.approve.h >= 44, 'desk: Approve · 72 holes, at least 44 px tall (saw ' + JSON.stringify(dopen.approve) + ')');
    need(dopen.tables === 2 && dopen.dotted === 72 && dopen.gridRight <= dopen.viewport, 'desk: the grid - two nines, 72 dotted, inside the screen');
    need(dopen.overflowX <= 0, 'desk: no sideways scroll at 390');
    need(dphoto.photo === true, 'desk: See photo shows the JPEG');
    need(dapp.scoreWrites === 72 && dapp.checkWrites >= 1, 'desk: Approve wrote 72 scores through the page and stored the check (saw ' + dapp.scoreWrites + ' / ' + dapp.checkWrites + ')');
    need(dapp.photoStored === false, 'desk: the photo is in no write');
    need(/On the leaderboard/.test(dapp.queue || ''), 'desk: the row reads On the leaderboard');
    need((dapp.sent || []).filter((s) => / approve$/.test(s)).length === 1, 'desk: one POST approve');

    // LAPTOP 1100, the card open
    r = await run({ url: ORG, db: db(record(true)), auth: OWNER, viewport: { width: 1100, height: 900 }, preScript: tokenShim + apiStub({ list: [card()] }),
        steps: [{ tap: '#tab-btn-desk' }, { sleep: 600 }, { tap: '#ti-refresh' }, { sleep: 1500 }, { tap: '.ti-open[data-sk="g2"]' }, { sleep: 800 }, scrollTo('#cardcheck-wrap'), { sleep: 200 }, { expression: MEASURE_DESK('LAP') }, ...shot('desk-card-open-laptop')] });
    if (!r.ok) { console.log(JSON.stringify({ laptop: r.reason })); process.exit(2); }
    const lap = JSON.parse(got(r, 'LAP')[0] || '{}');
    results.laptop = { tables: lap.tables, dotted: lap.dotted, approve: lap.approve };
    need(lap.tables === 2 && lap.dotted === 72, 'laptop: the open card');

    console.log(JSON.stringify(results, null, 1));
    if (fails.length) { console.log('FAIL\n- ' + fails.join('\n- ')); process.exit(1); }
    console.log('PASS');
}
main().catch((e) => { console.error(e); process.exit(2); });
