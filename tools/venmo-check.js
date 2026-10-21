#!/usr/bin/env node
// ============================================================================
// SETTLE UP WITH VENMO / CASH APP, IN CHROME (2.1 part D)
//
//   node tools/venmo-check.js [<shots dir>] [<width>x<height>]   (default 393x852)
//
// A finished round (tools/extra-games-backcompat.js's: Who Pays Who + the BBB and
// Vegas cards) opened cold on settlement.html at 393x852. Nothing on the page is
// called; the taps are real. The database stand-in re-fires the round's listener
// on every write, as another phone in the group would see it.
//   1. As Ann (?me=11), in a trip: the Settle up card shows EXACTLY the page's own
//      lines - Who Pays Who as is, and each BBB / Vegas "pays" line SEPARATE under
//      its game (URGENT-045: never netted); Ann's rows carry Pay with Venmo / Cash App / Request
//      on Venmo with the exact links and note; no "bet" / "wager" in it; "✓ Mark
//      paid" writes events/XGBACK/settleUp/<key> and the row shows "✓ Paid".
//   2. Save (Venmo + Cash App) writes trips/<trip>/venmo|cashapp/ann able.
//   3. No trip: the round's own lists; Save writes events/<round>/venmo|cashapp/11.
//   4. Not knowing who this phone is: "Which one are you?" and no links.
//   5. Every Results section reads the same with and without the card, and with
//      the switch off (venmo: false) there is no card at all.
//   6. URGENT-045: a golfer's phone the LIVE rules refuse (PERMISSION_DENIED): Mark
//      paid goes back and says only the organizer's phone can mark; Save keeps the
//      username on the phone and says the group can't see it yet.
// Screenshots (393x852) go to <shots dir> (default ~/Desktop/claude-code-reports/025/D-venmo).
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const HERE = path.join(__dirname, '..');
const { round } = require('./extra-games-backcompat.js');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const SHOTS = path.resolve(process.argv[2] || path.join(os.homedir(), 'Desktop/claude-code-reports/025/D-venmo'));
fs.mkdirSync(SHOTS, { recursive: true });
const VPA = /^(\d+)x(\d+)$/.exec(process.argv[3] || '393x852');
const VP = { width: Number(VPA[1]), height: Number(VPA[2]) };
const ERR = "window.__vmErr = []; addEventListener('error', function (e) { window.__vmErr.push(String(e.message || e)); }); addEventListener('unhandledrejection', function (e) { window.__vmErr.push('rejection: ' + String(e.reason && e.reason.message || e.reason)); });";
const OFF = "window.__vmOff = true; Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return window.__vmCfg; }, set: function (v) { if (v) v.venmo = false; window.__vmCfg = v; } });";

function dbs() {
    const base = round(true);
    base.date = '2026-10-20';
    base.courseName = 'Dobson Ranch';
    const withTrip = JSON.parse(JSON.stringify(base));
    withTrip.tripCode = 'TRIPVM';
    const plain = { events: { XGBACK: base }, global_courses: {}, trips: {}, tournaments: {} };
    const trip = { events: { XGBACK: withTrip }, global_courses: {}, tournaments: {},
        trips: { TRIPVM: { name: 'Venmo Test Trip', createdAt: 1, rounds: { XGBACK: { label: 'Sun', addedAt: 1 } },
            venmo: { 'bob baker': '@bob-baker-1', 'cal cole': 'cal-cole', 'dee dunn': 'dee-d' }, cashapp: { 'cal cole': '$CalCash', 'bob baker': 'BobCash' } } } };
    const roundOnly = JSON.parse(JSON.stringify(plain));
    roundOnly.events.XGBACK.venmo = { 12: 'bob-baker-1' };
    roundOnly.events.XGBACK.cashapp = { 13: 'CalCash' };
    return { plain, trip, roundOnly };
}
const LOOK = `JSON.stringify({ errs: window.__vmErr,
  results: (function () { var c = document.querySelector('.container') || document.body; var x = c.cloneNode(true); var m = x.querySelector('#vm-mount'); if (m) m.remove(); return x.innerText; })(),
  lines: window.HardPanVenmo ? window.HardPanVenmo.readLines(document) : [],
  card: !!document.getElementById('vm-settle'), cardText: (document.getElementById('vm-mount') || {}).innerText || '',
  after: (function () { var m = document.getElementById('vm-mount'); return m && m.previousElementSibling ? m.previousElementSibling.id : null; })(),
  rows: Array.prototype.map.call(document.querySelectorAll('#vm-mount .vm-row'), function (r) { return { key: r.getAttribute('data-vm-row'), who: r.querySelector('.vm-who').innerText, amt: r.querySelector('.vm-amt').innerText, done: r.classList.contains('vm-done'),
     links: Array.prototype.map.call(r.querySelectorAll('a.vm-btn'), function (a) { return { label: a.innerText, href: a.getAttribute('href'), target: a.getAttribute('target') }; }),
     paid: !!r.querySelector('[data-vm-paid]'), ask: (r.querySelector('.vm-ask') || {}).innerText || '' }; }),
  me: !!document.getElementById('vm-user'), pick: document.querySelectorAll('#vm-mount [data-vm-me]').length,
  writes: (window.__coldWrites || []).filter(function (w) { return /venmo|cashapp|settleUp/.test(w.path); }) })`;
const scrollTo = (sel) => ({ expression: `(function () { var e = document.querySelector(${JSON.stringify(sel)}); if (e) { e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -8); } return 'scrolled'; })()` });

async function settle(db, steps, opts) {
    const r = await arriveCold(Object.assign({ url: fileUrl('settlement.html', 'game=XGBACK' + ((opts && opts.me) ? '&me=' + opts.me : '')), db, settleMs: 4000, viewport: VP, preScript: ERR + ((opts && opts.pre) || ''), steps }, {}));
    if (!r.ok) throw new Error(r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
}
const cents = (a) => Math.round(Number(a) * 100);
function net(ls) { const n = {}; ls.forEach((l) => { n[l.from] = (n[l.from] || 0) - cents(l.amount); n[l.to] = (n[l.to] || 0) + cents(l.amount); }); const o = {}; Object.keys(n).sort().forEach((k) => { if (n[k]) o[k] = n[k]; }); return o; }
function rowsAsLines(rows, me) { return rows.map((r) => { const amount = parseFloat(r.amt.replace(/[^0-9.]/g, '')); let m; if ((m = /^You pay (.+)$/.exec(r.who))) return { from: me, to: m[1], amount }; if ((m = /^(.+) pays you$/.exec(r.who))) return { from: m[1], to: me, amount }; m = /^(.+) pays (.+)$/.exec(r.who); return { from: m[1], to: m[2], amount }; }); }

(async () => {
    const fails = [], report = {};
    const D = dbs();
    const NOTE = encodeURIComponent('HardPan · Dobson Ranch Oct 20');
    // 1 + 2. In a trip, as Ann.
    const [a, a2, a3] = await settle(D.trip, [{ expression: LOOK }, scrollTo('#vm-mount'), { shot: path.join(SHOTS, '1-settle-up-as-ann.png'), viewportOnly: true },
        { tap: '#vm-mount [data-vm-paid]' }, { sleep: 500 }, { expression: LOOK }, scrollTo('#vm-mount'), { shot: path.join(SHOTS, '2-after-mark-paid.png'), viewportOnly: true },
        { expression: "(function () { document.getElementById('vm-user').value = '@ann-able'; document.getElementById('vm-cash').value = '$AnnCash'; return 'typed'; })()" },
        { tap: '.vm-save' }, { sleep: 600 }, { expression: LOOK }, scrollTo('#vm-mine'), { shot: path.join(SHOTS, '3-your-venmo-cash-app.png'), viewportOnly: true }], { me: 11 });
    report.trip = { lines: a.lines, rows: a.rows.map((r) => r.who + ' ' + r.amt + ' [' + r.links.map((l) => l.label).join(', ') + (r.paid ? ', Mark paid' : '') + ']'), after: a.after };
    if (!a.card) fails.push('trip: no Settle up card');
    if (a.after !== 'combined-settlement-summary') fails.push('trip: the card is not right after Who Pays Who: ' + a.after);
    if (!a.lines.some((l) => l.src === 'wpw') || !a.lines.some((l) => l.src === 'exg')) fails.push('trip: fixture has no Who Pays Who + BBB/Vegas lines: ' + JSON.stringify(a.lines));
    const shown = rowsAsLines(a.rows, 'Ann Able');
    // Every line on the page is one row, nothing combined: Who Pays Who as is, BBB / Vegas separate.
    const asText = (ls) => ls.map((l) => l.from + '>' + l.to + '>' + cents(l.amount)).sort();
    if (JSON.stringify(asText(shown)) !== JSON.stringify(asText(a.lines))) fails.push('trip: Settle up rows are not exactly the page\'s lines: ' + JSON.stringify({ shown: asText(shown), page: asText(a.lines) }));
    const gameRows = a.rows.filter((r) => /^(bbb|vegas)~/.test(r.key)), exgLines = a.lines.filter((l) => l.src === 'exg');
    if (gameRows.length !== exgLines.length) fails.push('trip: BBB / Vegas rows ' + gameRows.length + ' v their lines ' + exgLines.length);
    if (!/Bingo Bango Bongo · settled separately/i.test(a.cardText) || !/Vegas · settled separately/i.test(a.cardText)) fails.push('trip: no "settled separately" game headings');
    report.trip.games = gameRows.map((r) => r.key);
    if (/\bbets?\b|\bwagers?\b/i.test(a.cardText)) fails.push('trip: "bet" / "wager" on the Settle up card');
    if (!/No money passes through HardPan/.test(a.cardText)) fails.push('trip: no "No money passes through HardPan"');
    const venmoFor = { 'Bob Baker': 'bob-baker-1', 'Cal Cole': 'cal-cole', 'Dee Dunn': 'dee-d' }, cashFor = { 'Bob Baker': 'BobCash', 'Cal Cole': 'CalCash' };
    a.rows.forEach((r, i) => {
        const l = shown[i], amt = r.amt.replace('$', '');
        const want = [];
        if (l.from === 'Ann Able') { if (venmoFor[l.to]) want.push('Pay with Venmo|https://venmo.com/u/' + venmoFor[l.to] + '?txn=pay&amount=' + amt + '&note=' + NOTE); if (cashFor[l.to]) want.push('Cash App|https://cash.app/$' + cashFor[l.to] + '/' + amt); }
        else if (l.to === 'Ann Able' && venmoFor[l.from]) want.push('Request on Venmo|https://venmo.com/u/' + venmoFor[l.from] + '?txn=charge&amount=' + amt + '&note=' + NOTE);
        const got = r.links.map((x) => x.label + '|' + x.href);
        if (JSON.stringify(got) !== JSON.stringify(want)) fails.push('trip: row "' + r.who + '" links ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
        if (r.links.some((x) => x.target !== '_blank')) fails.push('trip: a link does not leave the app');
        const mine = l.from === 'Ann Able' || l.to === 'Ann Able';
        if (r.paid !== mine) fails.push('trip: Mark paid on "' + r.who + '" is ' + r.paid);
    });
    if (!a.rows.some((r) => r.links.length)) fails.push('trip: Ann has no links at all');
    const tick = a2.writes.filter((w) => /settleUp/.test(w.path));
    const firstMine = a.rows.find((r) => r.paid);
    if (!(tick.length === 1 && tick[0].path === 'events/XGBACK/settleUp/' + firstMine.key && tick[0].value && tick[0].value.by === '11' && typeof tick[0].value.at === 'number' && Object.keys(tick[0].value).length === 2)) fails.push('trip: Mark paid wrote ' + JSON.stringify(tick));
    const doneRow = a2.rows.find((r) => r.key === firstMine.key);
    if (!doneRow || !doneRow.done || doneRow.links.length) fails.push('trip: the row is not shown paid after the tick: ' + JSON.stringify(doneRow));
    if (!/✓ Paid · marked by Ann Able/.test(a2.cardText)) fails.push('trip: no "✓ Paid · marked by Ann Able"');
    const saved = a3.writes.filter((w) => /^trips\/TRIPVM\/(venmo|cashapp)\/ann able$/.test(w.path)).map((w) => w.path + '=' + w.value);
    if (JSON.stringify(saved) !== JSON.stringify(['trips/TRIPVM/venmo/ann able=ann-able', 'trips/TRIPVM/cashapp/ann able=AnnCash'])) fails.push('trip: Save wrote ' + JSON.stringify(a3.writes));
    if (!/✓ Saved · Venmo @ann-able · Cash App \$AnnCash/.test(a3.cardText)) fails.push('trip: no saved line');
    if (a.results !== a2.results) fails.push('trip: a Results section changed with the tick');
    const errsA = a.errs.concat(a2.errs, a3.errs);
    if (errsA.length) fails.push('trip: errors ' + errsA.join(' | '));

    // 3. No trip: the round's own lists, and Save writes there.
    const [b, b2] = await settle(D.roundOnly, [{ expression: LOOK },
        { expression: "(function () { document.getElementById('vm-user').value = 'ann-able'; document.getElementById('vm-cash').value = ''; return 'typed'; })()" }, { tap: '.vm-save' }, { sleep: 600 }, { expression: LOOK }], { me: 11 });
    report.round = { rows: b.rows.map((r) => r.who + ' ' + r.links.map((l) => l.href).join(' ')) };
    const bobRow = b.rows.find((r) => /^You pay Bob Baker$/.test(r.who));
    if (bobRow && !bobRow.links.some((l) => /^https:\/\/venmo\.com\/u\/bob-baker-1\?txn=pay/.test(l.href))) fails.push('round: Bob’s link from events/<round>/venmo is missing');
    const calRow = b.rows.find((r) => /^You pay Cal Cole$/.test(r.who));
    if (calRow && !calRow.links.some((l) => /^https:\/\/cash\.app\/\$CalCash\//.test(l.href))) fails.push('round: Cal’s Cash App link from events/<round>/cashapp is missing');
    const deeRow = b.rows.find((r) => /^You pay Dee Dunn$/.test(r.who));
    if (deeRow && !/Ask Dee Dunn to add their Venmo or Cash App/.test(deeRow.ask)) fails.push('round: no "Ask Dee Dunn" line');
    const bw = b2.writes.map((w) => w.path + '=' + w.value);
    if (JSON.stringify(bw) !== JSON.stringify(['events/XGBACK/venmo/11=ann-able', 'events/XGBACK/cashapp/11=null'])) fails.push('round: Save wrote ' + JSON.stringify(bw));
    if (b.errs.length || b2.errs.length) fails.push('round: errors');

    // 4. Who is this phone? Not known: the picker, no links, no ticks.
    const [c, c2] = await settle(D.trip, [{ expression: LOOK }, scrollTo('#vm-mount'), { shot: path.join(SHOTS, '4-which-one-are-you.png'), viewportOnly: true },
        { tap: '#vm-mount [data-vm-me="12"]' }, { sleep: 400 }, { expression: LOOK }, scrollTo('#vm-mount'), { shot: path.join(SHOTS, '5-settle-up-as-bob.png'), viewportOnly: true }]);
    report.unknown = { pick: c.pick, rowsWithLinks: c.rows.filter((r) => r.links.length || r.paid).length, bob: c2.rows.map((r) => r.who + ' [' + r.links.map((l) => l.label).join(', ') + ']') };
    if (c.pick !== 4) fails.push('unknown: ' + c.pick + ' golfers to pick from');
    if (c.rows.some((r) => r.links.length || r.paid)) fails.push('unknown: links or ticks for a phone that is nobody');
    if (!c2.rows.some((r) => /^(You pay|.+ pays you)/.test(r.who))) fails.push('unknown: picking Bob did not give Bob his rows');
    // Bob picked on this phone with no profile: nothing written.
    if (c2.writes.length) fails.push('unknown: wrote ' + JSON.stringify(c2.writes));

    // 6. The LIVE rules refuse this golfer's phone (not the organizer): honest, nothing breaks.
    const REF = "window.__coldRefuse = 'settleUp|/venmo/|/cashapp/';";
    const [r1, r2, r3] = await settle(D.roundOnly, [{ expression: LOOK }, { tap: '#vm-mount [data-vm-paid]' }, { sleep: 600 }, { expression: LOOK }, scrollTo('#vm-mount'), { shot: path.join(SHOTS, '6-refused-mark-paid.png'), viewportOnly: true },
        { expression: "(function () { document.getElementById('vm-user').value = 'ann-able'; return 'typed'; })()" }, { tap: '.vm-save' }, { sleep: 600 }, { expression: LOOK }], { me: 11, pre: REF });
    report.refused = { msg: (r2.cardText.match(/Only the organizer.*/) || [''])[0], save: (r3.cardText.match(/Kept on this phone\. The group.*/) || [""])[0] };
    if (r2.rows.some((r) => r.done)) fails.push('refused: a row still shows paid after the server said no');
    if (!/Only the organizer’s phone can mark payments for now\./.test(r2.cardText)) fails.push('refused: no "Only the organizer’s phone" line');
    if (!/Kept on this phone\. The group can’t see it yet/.test(r3.cardText)) fails.push('refused: no "Kept on this phone" line on Save');
    if (r1.errs.length || r2.errs.length || r3.errs.length) fails.push('refused: errors ' + r1.errs.concat(r2.errs, r3.errs).join(' | '));

    // 7. URGENT-045: today's phone look - the #31 receipt (option A, simple flow on). Who Pays
    //    Who is the receipt's own "Settle up" block; the card reads it and sits after it.
    const SIMPLE = 'window.__simpleFlow = true; try { localStorage.setItem("hardpan_simple_flow", "on"); } catch (e) {}';
    const [q] = await settle(D.trip, [{ expression: LOOK }, { expression: "JSON.stringify({ A: document.documentElement.classList.contains('hp-rcpt'), rc: Array.prototype.map.call(document.querySelectorAll('.hp-rc-settle .hp-rc-pay'), function (r) { return r.innerText.replace(/\\s+/g, ' '); }), head: (document.querySelector('#vm-settle .settle-header') || {}).innerText || '' })" },
        scrollTo('.hp-rc-settle'), { shot: path.join(SHOTS, '7-receipt-option-a.png'), viewportOnly: true }, scrollTo('#vm-mount'), { shot: path.join(SHOTS, '8-receipt-option-a-card.png'), viewportOnly: true }], { me: 11, pre: SIMPLE });
    report.receiptA = { lines: q.lines.length, rows: q.rows.map((r) => r.who + ' ' + r.amt) };
    if (!q.card) fails.push('receipt A: no card on the #31 receipt');
    if (!q.lines.some((l) => l.src === 'wpw')) fails.push('receipt A: the receipt\'s Settle up lines were not read');
    if (q.errs.length) fails.push('receipt A: errors ' + q.errs.join(' | '));

    // 5. Switch off, and the Results without the card.
    const [o] = await settle(D.trip, [{ expression: LOOK }], { me: 11, pre: OFF });
    const [p] = await settle(D.plain, [{ expression: LOOK }], { me: 11, pre: OFF });
    report.off = { card: o.card, mount: o.cardText.length };
    if (o.card || o.cardText) fails.push('off: a card with venmo: false');
    if (o.results !== a.results) fails.push('off: the Results read differently with the card on');
    if (o.results !== p.results) fails.push('off: the Results read differently with the Venmo / Cash App data');
    if (o.errs.length || p.errs.length) fails.push('off: errors');

    console.log(JSON.stringify({ report, shots: fs.readdirSync(SHOTS).filter((f) => /\.png$/.test(f)), fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
