#!/usr/bin/env node
// ============================================================================
// PAY WITH VENMO + CHECK MY INDEX, IN CHROME (gps-venmo)
//
//   node tools/venmo-check.js [<old tree> ...]
//
// A finished round (tools/extra-games-backcompat.js's: Who Pays Who + the BBB and
// Vegas cards) opened cold on settlement.html as Ann (?me=11), in a trip whose
// Venmo list has Bob only. Nothing on the page is called; the taps are real.
//   - Ann's lines: Bob -> a Pay link with the exact app + web URLs; Cal -> "Ask Cal
//     Cole to add their Venmo in their profile."
//   - Dee's line (not Ann's): nothing.
//   - "Your Venmo": typing @ann-able + Save writes trips/<trip>/venmo/ann able.
//   - No trip: the same Save writes events/<round>/venmo/11.
//   - Round Setup (admin.html): every golfer row has "Check my Index" -> ghin.com/overview/.
// Each <old tree> (GPS beta build 12, the web app) opens the round with and without
// the Venmo data: the pages must read the same and throw nothing.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
const { round } = require('./extra-games-backcompat.js');
const ERR = "window.__vmErr = []; addEventListener('error', function (e) { window.__vmErr.push(String(e.message || e)); }); addEventListener('unhandledrejection', function (e) { window.__vmErr.push('rejection: ' + String(e.reason && e.reason.message || e.reason)); });";

function dbs() {
    const base = round(true);
    const withTrip = JSON.parse(JSON.stringify(base));
    withTrip.tripCode = 'TRIPVM';
    const plain = { events: { XGBACK: base }, global_courses: {}, trips: {}, tournaments: {} };
    const trip = { events: { XGBACK: withTrip }, global_courses: {}, tournaments: {},
        trips: { TRIPVM: { name: 'Venmo Test Trip', createdAt: 1, rounds: { XGBACK: { label: 'Sun', addedAt: 1 } }, venmo: { 'bob baker': '@bob-baker-1' } } } };
    const roundOnly = JSON.parse(JSON.stringify(plain));
    roundOnly.events.XGBACK.venmo = { 12: 'bob-baker-1' };
    return { plain, trip, roundOnly };
}

async function settle(tree, db, steps) {
    const { arriveCold, fileUrl } = require(path.join(tree, 'tools/lib/cold-arrival.js'));
    const r = await arriveCold({ url: fileUrl('settlement.html', 'game=XGBACK&me=11'), db, settleMs: 4000, viewport: { width: 390, height: 844 }, preScript: ERR, steps });
    if (!r.ok) throw new Error(tree + ': ' + r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
}
const LOOK = `JSON.stringify({ errs: window.__vmErr, text: document.body.innerText,
  pays: Array.prototype.map.call(document.querySelectorAll('.vm-pay'), function (a) { var row = a.closest('.vm-line').previousElementSibling; return { row: row ? row.innerText.replace(/\\s+/g, ' ') : '', app: a.getAttribute('href'), web: a.parentNode.querySelector('.vm-web').getAttribute('href'), blank: a.getAttribute('target') }; }),
  asks: Array.prototype.map.call(document.querySelectorAll('.vm-ask'), function (x) { return x.innerText; }),
  mine: !!document.getElementById('vm-user'), writes: (window.__coldWrites || []).filter(function (w) { return /venmo/.test(w.path); }) })`;

(async () => {
    const fails = [], report = {};
    const D = dbs();
    // 1. In a trip, as Ann.
    const [a, a2] = await settle(HERE, D.trip, [{ expression: LOOK },
        { expression: "(function () { var i = document.getElementById('vm-user'); i.value = '@ann-able'; return 'typed'; })()" }, { tap: '.vm-save' }, { sleep: 600 }, { expression: LOOK }]);
    report.trip = { pays: a.pays, asks: a.asks, mine: a.mine, writes: a2.writes, errs: a.errs.concat(a2.errs) };
    const bob = a.pays.find((p) => /Bob Baker/.test(p.row));
    const note = encodeURIComponent('HardPan · Venmo Test Trip');
    if (!bob) fails.push('trip: no Pay link on Ann -> Bob');
    else {
        const amt = (bob.row.match(/\$([0-9.]+)/) || [])[1];
        if (bob.app !== 'https://venmo.com/u/bob-baker-1?txn=pay&amount=' + amt + '&note=' + note) fails.push('trip: app link ' + bob.app);
        if (bob.web !== 'https://account.venmo.com/pay?txn=pay&recipients=bob-baker-1&amount=' + amt + '&note=' + note) fails.push('trip: web link ' + bob.web);
        if (bob.blank !== '_blank') fails.push('trip: the link does not leave the app');
    }
    if (a.pays.some((p) => /^Dee/.test(p.row) || /^(Bob|Cal|Dee)[^→]*→/.test(p.row))) fails.push('trip: a Pay link on a line that is not Ann’s: ' + JSON.stringify(a.pays));
    if (!a.asks.some((x) => /Ask Cal Cole to add their Venmo in their profile\./.test(x))) fails.push('trip: no "Ask Cal Cole" line: ' + JSON.stringify(a.asks));
    if (!a.mine) fails.push('trip: no "Your Venmo" box');
    if (!a2.writes.some((w) => w.op === 'set' && w.path === 'trips/TRIPVM/venmo/ann able' && w.value === 'ann-able')) fails.push('trip: Save did not write trips/TRIPVM/venmo/ann able: ' + JSON.stringify(a2.writes));
    if (report.trip.errs.length) fails.push('trip: errors ' + report.trip.errs.join(' | '));

    // 2. No trip: the round's own list, and Save writes there.
    const [b, b2] = await settle(HERE, D.roundOnly, [{ expression: LOOK },
        { expression: "(function () { var i = document.getElementById('vm-user'); i.value = 'ann-able'; return 'typed'; })()" }, { tap: '.vm-save' }, { sleep: 600 }, { expression: LOOK }]);
    report.round = { pays: b.pays.map((p) => p.app), writes: b2.writes };
    if (!b.pays.some((p) => /venmo\.com\/u\/bob-baker-1\?/.test(p.app))) fails.push('round: Bob’s link from events/<round>/venmo is missing');
    if (!b2.writes.some((w) => w.path === 'events/XGBACK/venmo/11' && w.value === 'ann-able')) fails.push('round: Save did not write events/XGBACK/venmo/11: ' + JSON.stringify(b2.writes));
    if (b.errs.length || b2.errs.length) fails.push('round: errors');

    // 3. Check my Index on every golfer row of Round Setup.
    {
        const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
        const r = await arriveCold({ url: fileUrl('admin.html', 'game=XGBACK'), db: D.plain, settleMs: 5000, viewport: { width: 390, height: 844 }, preScript: ERR,
            steps: [{ expression: "JSON.stringify({ errs: window.__vmErr, rows: document.querySelectorAll('#player-list .player-row, .player-row').length, ghin: Array.prototype.map.call(document.querySelectorAll('.player-row .p-ghin'), function (a) { return a.getAttribute('href') + '|' + a.getAttribute('target') + '|' + a.textContent; }) })" }] });
        const g = r.ok ? JSON.parse(r.value[0]) : { fail: r.reason };
        report.ghin = { rows: g.rows, links: (g.ghin || []).length, first: (g.ghin || [])[0], errs: g.errs };
        if (g.fail) fails.push('admin: ' + g.fail);
        else {
            if (!g.rows || g.ghin.length !== g.rows) fails.push('admin: ' + g.ghin.length + ' Check my Index links for ' + g.rows + ' golfer rows');
            if (!g.ghin.every((x) => x === 'https://www.ghin.com/overview/|_blank|Check my Index ↗')) fails.push('admin: link ' + g.ghin[0]);
            if (g.errs.length) fails.push('admin: errors ' + g.errs.join(' | '));
        }
    }

    // 4. Older apps: the same round with and without the Venmo data reads the same.
    for (const tree of process.argv.slice(2).map((t) => path.resolve(t))) {
        const name = path.basename(tree);
        for (const page of ['settlement.html', 'index.html']) {
            const { arriveCold, fileUrl } = require(path.join(tree, 'tools/lib/cold-arrival.js'));
            const look = async (db) => {
                const r = await arriveCold({ url: fileUrl(page, 'game=XGBACK'), db, settleMs: 4000, viewport: { width: 390, height: 844 }, preScript: ERR,
                    steps: [{ expression: "JSON.stringify({ errs: window.__vmErr, text: document.body.innerText })" }] });
                return r.ok ? JSON.parse(r.value[0]) : { fail: r.reason, errs: [], text: '' };
            };
            const A = await look(D.plain), B = await look(Object.assign(JSON.parse(JSON.stringify(D.trip)), {}));
            const norm = (t) => String(t).replace(/\b\d{1,2}:\d{2}\s?(AM|PM)?\b/gi, '#').replace(/[ \t]+/g, ' ').trim();
            report[name + ' ' + page] = { same: norm(A.text) === norm(B.text), errs: A.errs.length + B.errs.length, chars: A.text.length };
            if (A.fail || B.fail) fails.push(name + ' ' + page + ': did not load');
            if (A.errs.length || B.errs.length) fails.push(name + ' ' + page + ': errors ' + A.errs.concat(B.errs).join(' | '));
            if (norm(A.text) !== norm(B.text)) fails.push(name + ' ' + page + ': reads differently with the Venmo data');
        }
    }
    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
