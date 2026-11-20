#!/usr/bin/env node
// ============================================================================
// GOLFER CODES IN A REAL BROWSER (layout A "Codes on the Desk", Manny's pick
// 2026-11-19/20), at 390 x 844.
//
// Cold arrival (tools/lib/cold-arrival.js): the Firebase bundles blocked, the
// record handed in, the page's own init, listener and render. The only inputs
// are real taps (Input events on an element's centre) on the Desk tab. No page
// function is called. Text is innerText scoped to the element whose content is
// the claim, never the body's textContent.
//
// What mini-dom cannot prove and this does: the Desk's Golfer codes card is
// laid out and readable on a phone, with the codes the owner-only node holds;
// a fresh Desk mints the codes in ONE update in a real browser (crypto is the
// browser's); the golfer's personal link greets her and writes one join; My
// results with the offer is laid out, its price from the page's own
// site-pricing.js. Reissue is not tapped here: its confirm() is a dialog the
// harness dismisses (tournament_golfer_codes_test.js A3 taps it).
//
//   node tools/golfer-codes-check.js [--shots <dir>]   exit 0 all passed, 1 a check failed, 2 no browser
// ============================================================================
'use strict';
const path = require('path');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const GROUPS = [['Ana Diaz', 'Joe Fox', 'Sam Ortiz', 'Mia Chen'], ['Tom Reyes', 'Eva Lin', 'Ben Cruz', 'Liz Moore'],
    ['Dana Ruiz', 'Lee Park', 'Kim Vo', 'Ray Diaz'], ['Matt Cole', 'Amy Shaw', 'Dan Ito', 'Pat Webb']];
const CODES = { p1a: 'K7M4QP', p1b: 'H2TX9C', p1c: 'W8NF3R', p1d: 'P3JD6L', p2a: 'A2B3C4', p2b: 'D5E6F7', p2c: 'G8H9J2', p2d: 'K3L4M5',
    p3a: 'N6P7Q8', p3b: 'R9S2T3', p3c: 'U4V5W6', p3d: 'X7Y8Z9', p4a: 'AB23CD', p4b: 'EF45GH', p4c: 'JK67LM', p4d: 'NP89QR' };
function rec(extra) {
    const players = {}, groups = {};
    GROUPS.forEach((names, gi) => {
        const gid = 'g' + (gi + 1);
        groups[gid] = { name: 'Group ' + (gi + 1), playerIds: [], createdAt: gi + 1 };
        names.forEach((n, i) => { const pid = 'p' + (gi + 1) + String.fromCharCode(97 + i); players[pid] = { id: pid, name: n, handicap: '10', flightId: gi < 2 ? 'f1' : 'f2' }; groups[gid].playerIds.push(pid); });
    });
    return Object.assign({ name: 'Starkey Classic', ownerUid: OWNER.uid, courseName: 'Papago Golf Course', format: 'individual', scoringModel: 'player-v1',
        courseData: COURSE, players, scoringGroups: groups, flights: { f1: { name: 'Flight 1' }, f2: { name: 'Flight 2' } }, createdAt: 1, scores: {} }, extra || {});
}
const keys = (codes) => ({ on: true, g: { g1: 'c1'.repeat(16), g2: 'c2'.repeat(16), g3: 'c3'.repeat(16), g4: 'c4'.repeat(16) },
    c: Object.fromEntries(Object.keys(codes).map((p) => [p, { code: codes[p], issuedAt: 1763130000000 }])) });
const POSTED = { v: 1, postedAt: 1763140000000, prizeType: 'credit', host: 'Papago', basisTitle: 'Net',
    places: [{ flight: 'Flight 2', rows: [{ rank: 1, key: 'p3c', name: 'Kim Vo', amount: 50, toPar: -3 }, { rank: 2, key: 'p3a', name: 'Dana Ruiz', amount: 0, toPar: -1 }] }],
    skins: { perSkin: 0, carryover: false, skins: 0, total: 0, rounds: [] }, contests: { perContest: 0, multi: false, total: 0, rows: [] },
    placeTotal: 50, trophies: 1, total: 50, golfers: 16 };
const dbOf = (r, k) => Object.assign({ '.info': { connected: true }, tournaments: { STK: r }, contestEntries: {}, events: {}, trips: {}, global_courses: {}, registrations: { STK: {} } }, k ? { tournamentKeys: { STK: k } } : {});
const READ = (ids) => ({ expression: `JSON.stringify((function () { var o = {}; ${JSON.stringify(ids)}.forEach(function (id) { var e = document.getElementById(id);
  if (!e) { o[id] = null; return; } var b = e.getBoundingClientRect(); o[id] = { text: (e.innerText || '').replace(/\\s+/g, ' ').trim(), w: Math.round(b.width), h: Math.round(b.height) }; }); return o; })())` });
const WRITES = { expression: `JSON.stringify((window.__coldWrites || []).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }))` };
const HREF = (sel) => ({ expression: `(function () { var e = document.querySelector(${JSON.stringify(sel)}); return e ? e.getAttribute('href') : null; })()` });
const SCROLL = (id) => ({ expression: `(function () { var e = document.getElementById(${JSON.stringify(id)}); if (e) { e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); } return !!e; })()` });
const WIDE = { expression: `document.documentElement.scrollWidth` };
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const shotsAt = (() => { const i = process.argv.indexOf('--shots'); return i > -1 ? path.resolve(process.argv[i + 1]) : null; })();
const shot = (name) => (shotsAt ? [{ shot: path.join(shotsAt, name), viewportOnly: true }] : []);
const json = (v) => JSON.parse(v);

(async () => {
    const results = [];
    const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n     ' + String(detail || '').slice(0, 500))); };
    const VP = { width: 390, height: 844 };

    // 1. The organizer, codes already held, Kim opened her link at 8:58, Ray reissued.
    const k1 = keys(CODES);
    k1.c.p3d = { code: CODES.p3d, issuedAt: 1763133000000, reissued: true };
    const desk = await arriveCold({ url: fileUrl('tournament.html', 'tourney=STK'), db: dbOf(rec({ joins: { g3: { p3c: { name: 'Kim Vo', at: 1763132280000 } } } }), k1), auth: OWNER, settleMs: 2500, viewport: VP,
        steps: [{ tap: '#tab-btn-desk' }, { sleep: 500 }, READ(['golfer-codes']), HREF('#golfer-codes .gc-row[data-pid="p3c"] .gc-text'), WIDE, SCROLL('golfer-codes'), { sleep: 200 }]
            .concat(shot('codes-A-desk.png'), [{ expression: `window.scrollBy(0, 600), 1` }, { sleep: 150 }], shot('codes-A-desk-rows.png')) });
    if (!desk.ok) { console.log('NO BROWSER RUN: ' + desk.reason); process.exit(2); }
    const d = json(desk.value[2])['golfer-codes'];
    console.log('DESK innerText (first 700): ' + (d && d.text || '').slice(0, 700));
    check('the Golfer codes card is laid out on the Desk at 390 px (non-zero box, no sideways scroll)', d && d.w > 300 && d.h > 400 && desk.value[4] <= 390, JSON.stringify(d && { w: d.w, h: d.h }) + ' scrollWidth ' + desk.value[4]);
    check('its head: Print code sheet and the counts', /^Golfer codes Print code sheet 16 golfers · 1 opened · 15 not yet/.test(d.text), d.text.slice(0, 200));
    check('Kim\'s row: her code and Opened', /Kim Vo U4V5W6 Opened \d{1,2}:\d\d\s?[AP]M Flight 2 · Group 3 Text it Reissue https?:\/\/\S+tourney=STK&group=g3&watch=1&me=p3c&c=U4V5W6/.test(d.text), d.text);
    check('Ray\'s row: Reissued', /Ray Diaz X7Y8Z9 Reissued \d{1,2}:\d\d\s?[AP]M/.test(d.text), d.text);
    check('Text it is an sms: link whose body ends in Kim\'s personal link', /^sms:\?&body=/.test(desk.value[3] || '') && /tourney%3DSTK%26group%3Dg3%26watch%3D1%26me%3Dp3c%26c%3DU4V5W6$/.test(desk.value[3] || ''), desk.value[3]);
    check('nothing on the card claims a code is checked or locked', !/lock|one use|one phone|old code off|stops working|verified/i.test(d.text), d.text);

    // 2. A fresh Desk: no codes held yet.
    const fresh = await arriveCold({ url: fileUrl('tournament.html', 'tourney=STK'), db: dbOf(rec(), keys({})), auth: OWNER, settleMs: 2500, viewport: VP,
        steps: [WRITES, { tap: '#tab-btn-desk' }, { sleep: 500 }, WRITES] });
    if (!fresh.ok) { console.log('NO BROWSER RUN: ' + fresh.reason); process.exit(2); }
    const cw = (v) => json(v).filter((w) => /^tournamentKeys\/STK\/c\b/.test(w.path) || (w.op === 'update' && Object.keys(w.value || {}).some((x) => /^tournamentKeys\/STK\/c\//.test(x))));
    const after = cw(fresh.value[3]);
    const vals = after.length ? Object.values(after[0].value) : [];
    check('a fresh Desk mints every code in ONE update when it is opened, none before', cw(fresh.value[0]).length === 0 && after.length === 1 && vals.length === 16
        && vals.every((x) => /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(x.code)) && new Set(vals.map((x) => x.code)).size === 16, JSON.stringify(after).slice(0, 400));

    // 3. Kim's personal link, results posted.
    const golfer = await arriveCold({ url: fileUrl('tournament-scorecard.html', 'tourney=STK&group=g3&watch=1&me=p3c&c=U4V5W6'), db: dbOf(rec({ prizeResults: POSTED })), settleMs: 2500, viewport: VP,
        steps: [READ(['sc-me', 'scoring-for', 'sc-gps']), WRITES, HREF('#sc-me-results'), WIDE, { expression: 'window.scrollTo(0, 0), 1' }].concat(shot('codes-A-golfer-card.png')) });
    if (!golfer.ok) { console.log('NO BROWSER RUN: ' + golfer.reason); process.exit(2); }
    const g = json(golfer.value[0]);
    console.log('GOLFER #sc-me innerText: ' + g['sc-me'].text);
    check('the personal link greets Kim and is laid out', /^Hi Kim You.re in Starkey Classic · Flight 2 · Group 3 Results are posted\. See my results$/.test(g['sc-me'].text) && g['sc-me'].h > 60 && golfer.value[3] <= 390, JSON.stringify(g['sc-me']) + ' scrollWidth ' + golfer.value[3]);
    check('her viewer card and the GPS door', /^You.re Kim Vo · watching Group 3/.test(g['scoring-for'].text) && /HardPan GPS/.test(g['sc-gps'].text), JSON.stringify(g));
    const gw = json(golfer.value[1]);
    check('ONE write: joins/g3/p3c = { name, at }; nothing to tournamentKeys', gw.length === 1 && gw[0].path === 'tournaments/STK/joins/g3/p3c' && gw[0].value.name === 'Kim Vo' && !gw.some((w) => /tournamentKeys/.test(w.path)), JSON.stringify(gw));
    check('See my results opens My results with her id and code', golfer.value[2] === 'tournament.html?tourney=STK&recap=1&me=p3c&c=U4V5W6', golfer.value[2]);

    // 4. My results from that link, the 58A offer on, an iPhone.
    const ua = `Object.defineProperty(navigator, 'userAgent', { get: function () { return ${JSON.stringify(UA_IPHONE)}; } });`;
    const mine = await arriveCold({ url: fileUrl('tournament.html', 'tourney=STK&recap=1&me=p3c&c=U4V5W6'), db: dbOf(rec({ prizeResults: POSTED, offer: { on: true, code: 'HERO2026', endsAt: '2099-01-31' } })), settleMs: 2500, viewport: VP, preScript: ua,
        steps: [READ(['my-results-card', 'my-results-offer']), HREF('#mr-offer-redeem'), { expression: `JSON.stringify(window.HARDPAN_SITE_PRICING && { e: window.HARDPAN_SITE_PRICING.eventOffer, y: window.HARDPAN_SITE_PRICING.pro.yearly })` }, WIDE, { expression: 'window.scrollTo(0, 0), 1' },
            { expression: `(function () { var b = document.getElementById('mr-offer-redeem'), c = document.getElementById('mr-offer'); if (!b || !c) return null; var x = b.getBoundingClientRect(), y = c.getBoundingClientRect(); return { inside: x.right <= y.right && x.left >= y.left, btn: [Math.round(x.left), Math.round(x.right)], card: [Math.round(y.left), Math.round(y.right)] }; })()` }]
            .concat(shot('codes-A-my-results-offer.png')) });
    if (!mine.ok) { console.log('NO BROWSER RUN: ' + mine.reason); process.exit(2); }
    const m = json(mine.value[0]);
    const P = json(mine.value[2]);
    console.log('MY RESULTS #my-results-card: ' + m['my-results-card'].text);
    console.log('MY RESULTS #my-results-offer: ' + m['my-results-offer'].text);
    check('her results first: 1st in Flight 2', /^Places 1st · Flight 2/i.test(m['my-results-card'].text), m['my-results-card'].text);
    check('then the offer, laid out, its price the page\'s own site-pricing.js eventOffer beside pro.yearly', P && P.e === '$19.99' && m['my-results-offer'].h > 80 && mine.value[3] <= 390
        && m['my-results-offer'].text.indexOf('Keep HardPan ' + P.e + ' your first year Regular price ' + P.y + '/yr') === 0, JSON.stringify(m['my-results-offer']) + ' ' + JSON.stringify(P));
    check('the Redeem button sits inside the offer card (its right edge within the card\'s)', mine.value[5] && mine.value[5].inside === true, JSON.stringify(mine.value[5]));
    check('Redeem in the App Store carries the event\'s offer code', mine.value[1] === 'https://apps.apple.com/redeem?ctx=offercodes&id=6808220335&code=HERO2026', mine.value[1]);

    const fails = results.filter((x) => !x).length;
    console.log('\n' + (results.length - fails) + ' / ' + results.length + ' PASS');
    process.exit(fails ? 1 : 0);
})();
