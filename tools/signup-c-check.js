#!/usr/bin/env node
// ============================================================================
// SIGN-UP C IN A REAL BROWSER (Manny's pick 2026-11-21, "Event page with
// sign-up"), at 390 x 844.
//
// Cold arrival (tools/lib/cold-arrival.js): the Firebase bundles blocked, the
// record handed in, the page's own init, once() read, listener and render. The
// only inputs are real taps (Input events on an element's centre) and real
// typing (Input.insertText into the box the tap focused). No page function is
// called. Text is innerText scoped to the element whose content is the claim.
//
// THE RULE STATES are a preScript over the stand-in database (the data source,
// not the page): PROPOSAL turns the server-time placeholder into a number as a
// server would, so a seat the page writes is a seat the page can count; LIVE
// refuses the seat read and any write naming signupSeats, as the published
// 2.1.0 rules do (proved in the emulator by tools/signup-c-rules-emulator-check.js).
//
//   1  event page, open: 58 of 72, Kim signs up -> "You're in, Kim", spot 59 of 72
//   2  event page, full: 72 of 72, Join the waiting list -> number 3 on the waiting list
//   3  event page, LIVE rules: no spots line, the registration alone, no place
//   4  the Desk: field size 3, Ray added on Setup, Kim / Dana / Lee signed up ->
//      two field writes (Lee waits), then the writes delivered back: tiles,
//      "Signed up online", In the field, Waiting list · 1, Move into the field
//
//   node tools/signup-c-check.js [--shots <dir>]   exit 0 all passed, 1 a check failed, 2 no browser
// ============================================================================
'use strict';
const path = require('path');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const RAY = { id: 'p1', name: 'Ray Holt', handicap: '8.1', addedAt: 1, flightId: 'f1' };
const event = (extra) => Object.assign({ name: 'Spring Invitational', ownerUid: OWNER.uid, format: 'individual', scoringModel: 'player-v1', scoringMode: 'net',
    courseName: 'Papago Golf Course', venue: 'The Home Course', courseData: COURSE, createdAt: 1, eventDate: '2026-04-18', startTime: '08:00', startType: 'shotgun',
    entryFee: 45, payoutSpots: [300, 150, 0], flights: { f1: { name: 'A Flight', createdAt: 1 }, f2: { name: 'B Flight', createdAt: 2 } }, players: { p1: RAY } }, extra || {});
const seats = (n) => { const o = {}; for (let i = 1; i <= n; i++) o['eseat' + String(i).padStart(3, '0')] = 1763130000000 + i; return o; };
const dbOf = (rec, extra) => Object.assign({ '.info': { connected: true }, tournaments: { SPR: rec }, events: {}, trips: {}, global_courses: {}, contestEntries: {} }, extra || {});

const PROPOSAL = `(function () { var d = firebase.database; firebase.database = Object.assign(function () { var db = d(); var ref = db.ref;
  var fix = function (v) { if (v && typeof v === 'object' && v['.sv'] === 'timestamp') return Date.now(); if (v && typeof v === 'object' && !Array.isArray(v)) { var o = {}; Object.keys(v).forEach(function (k) { o[k] = fix(v[k]); }); return o; } return v; };
  return { ref: function (p) { var r = ref(p); var u = r.update, s = r.set; r.update = function (v) { return u(fix(v)); }; r.set = function (v) { return s(fix(v)); }; return r; } }; }, d); })();`;
const LIVE = `(function () { var d = firebase.database; firebase.database = Object.assign(function () { var db = d(); var ref = db.ref;
  var no = function () { var e = new Error('PERMISSION_DENIED: Permission denied'); e.code = 'PERMISSION_DENIED'; return e; };
  return { ref: function (p) { var r = ref(p); var s = String(p == null ? '' : p);
    if (/^signupSeats/.test(s)) { r.once = function () { return Promise.reject(no()); }; r.remove = function () { return Promise.reject(no()); }; }
    var u = r.update; r.update = function (v) { if (v && Object.keys(v).some(function (k) { return /^signupSeats/.test(k); })) { window.__coldWrites.push({ op: 'update', path: s, value: v, refused: true }); return Promise.reject(no()); } return u(v); };
    return r; } }; }, d); })();`;

const READ = (ids) => ({ expression: `JSON.stringify((function () { var o = {}; ${JSON.stringify(ids)}.forEach(function (id) { var e = document.getElementById(id);
  if (!e) { o[id] = null; return; } var b = e.getBoundingClientRect(); o[id] = { text: (e.innerText || '').replace(/\\s+/g, ' ').trim(), w: Math.round(b.width), h: Math.round(b.height), shown: b.width > 0 && b.height > 0 }; }); return o; })())` });
const WRITES = { expression: `JSON.stringify((window.__coldWrites || []).map(function (w) { return { op: w.op, path: w.path, keys: w.value && typeof w.value === 'object' ? Object.keys(w.value) : null, refused: !!w.refused }; }))` };
const WIDE = { expression: `document.documentElement.scrollWidth` };
const TOP = { expression: `window.scrollTo(0, 0), 1` };
const type = (sel, text) => [{ tap: sel }, { sleep: 80 }, { cdp: { method: 'Input.insertText', params: { text } } }];
const FILL = [].concat(type('#reg-name', 'Kim Vo'), type('#reg-email', 'kim@example.com'), type('#reg-phone', '(602) 555-0143'));
const shotsAt = (() => { const i = process.argv.indexOf('--shots'); return i > -1 ? path.resolve(process.argv[i + 1]) : null; })();
const shot = (name) => (shotsAt ? [{ shot: path.join(shotsAt, name), viewportOnly: true }] : []);
const json = (v) => JSON.parse(v);
const ANON = { uid: 'anon-golfer', isAnonymous: true, email: null };

(async () => {
    const results = [];
    const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n     ' + String(detail || '').slice(0, 600))); };
    const VP = { width: 390, height: 844 };
    const FIELDS = ['reg-event-name', 'reg-event-sub', 'reg-spots', 'reg-submit', 'reg-form', 'reg-done', 'reg-closed'];

    // 1. OPEN: 57 seats + Ray = 58 of 72.
    const open = await arriveCold({ url: fileUrl('tournament.html', 'register=SPR'), db: dbOf(event({ signup: { cap: 72 } }), { signupSeats: { SPR: seats(57) } }), auth: ANON,
        preScript: PROPOSAL, settleMs: 2000, viewport: VP,
        steps: [READ(FIELDS), WIDE].concat(shot('C1-event-page-open.png'), FILL, [{ tap: '#reg-submit' }, { sleep: 600 }, TOP, { sleep: 100 }, READ(FIELDS), WRITES], shot('C2-youre-in.png')) });
    if (!open.ok) { console.log('NO BROWSER RUN: ' + open.reason); process.exit(2); }
    const o1 = json(open.value[0]), o2 = json(open.value[open.value.length - 2]), w1 = json(open.value[open.value.length - 1]);
    console.log('OPEN innerText: ' + ['reg-event-name', 'reg-event-sub', 'reg-spots', 'reg-submit'].map((k) => o1[k].text).join(' | '));
    console.log('AFTER innerText: ' + o2['reg-done'].text);
    check('1a the event page at 390 px: no sideways scroll', open.value[1] <= 390, 'scrollWidth ' + open.value[1]);
    check('1b the facts', o1['reg-event-sub'].text === 'When Sat, Apr 18, 2026 · Shotgun 8:00 AM Where The Home Course Format Individual Stroke Play · Net · 2 flights Entry fee $45 per golfer Prizes Pro shop credit', o1['reg-event-sub'].text);
    check('1c "58 of 72 spots taken" and Sign up', o1['reg-spots'].text === '58 of 72 spots taken' && o1['reg-submit'].text === 'Sign up', o1['reg-spots'].text + ' / ' + o1['reg-submit'].text);
    const s1 = w1.filter((w) => /^registrations\/|^signupSeats\//.test(w.path) || (w.keys || []).some((k) => /^registrations\/|^signupSeats\//.test(k)));
    check('1d ONE update: the registration and its seat', s1.length === 1 && s1[0].op === 'update' && s1[0].keys.length === 2 && /^registrations\/SPR\//.test(s1[0].keys.join(' ')) && /signupSeats\/SPR\//.test(s1[0].keys.join(' ')), JSON.stringify(s1));
    check('1e "You\'re in, Kim" and spot 59 of 72; the form gives way', /^You're in, Kim Spring Invitational · Sat, Apr 18, 2026 You're spot 59 of 72\. Your group and your own link come before the day\. Start Shotgun 8:00 AM Add to my calendar Sign up another golfer$/.test(o2['reg-done'].text) && !o2['reg-form'].shown, o2['reg-done'].text);

    // 2. FULL: 73 seats + Ray = 74 taken.
    const full = await arriveCold({ url: fileUrl('tournament.html', 'register=SPR'), db: dbOf(event({ signup: { cap: 72 } }), { signupSeats: { SPR: seats(73) } }), auth: ANON,
        preScript: PROPOSAL, settleMs: 2000, viewport: VP,
        steps: [READ(FIELDS)].concat(shot('C3-event-page-full.png'), FILL, [{ tap: '#reg-submit' }, { sleep: 600 }, TOP, { sleep: 100 }, READ(FIELDS)], shot('C4-waiting-list.png')) });
    const f1 = json(full.value[0]), f2 = json(full.value[full.value.length - 1]);
    console.log('FULL innerText: ' + f1['reg-spots'].text + ' | ' + f1['reg-submit'].text);
    console.log('FULL AFTER innerText: ' + f2['reg-done'].text);
    check('2a the full field says so, and the button is "Join the waiting list"', f1['reg-spots'].text === '72 of 72 spots taken. The field is full: you can join the waiting list.' && f1['reg-submit'].text === 'Join the waiting list', f1['reg-spots'].text + ' / ' + f1['reg-submit'].text);
    check('2b the golfer is told their place on the waiting list', /^You're on the waiting list, Kim .* You're number 3 on the waiting list\. If a spot opens/.test(f2['reg-done'].text), f2['reg-done'].text);

    // 3. LIVE RULES: the seat read refused.
    const live = await arriveCold({ url: fileUrl('tournament.html', 'register=SPR'), db: dbOf(event({ signup: { cap: 72 } }), { signupSeats: { SPR: seats(57) } }), auth: ANON,
        preScript: LIVE, settleMs: 2000, viewport: VP,
        steps: [READ(FIELDS)].concat(shot('C5-live-rules-page.png'), FILL, [{ tap: '#reg-submit' }, { sleep: 600 }, TOP, { sleep: 100 }, READ(FIELDS), WRITES], shot('C6-live-rules-signed-up.png')) });
    const l1 = json(live.value[0]), l2 = json(live.value[live.value.length - 2]), lw = json(live.value[live.value.length - 1]);
    console.log('LIVE innerText: spots shown=' + l1['reg-spots'].shown + ' | ' + l1['reg-submit'].text + ' | after: ' + l2['reg-done'].text);
    check('3a LIVE: no spots line, "Sign up"', !l1['reg-spots'].shown && l1['reg-submit'].text === 'Sign up', JSON.stringify(l1['reg-spots']));
    const ls = lw.filter((w) => /^registrations\/|^signupSeats\//.test(w.path) || (w.keys || []).some((k) => /^signupSeats\//.test(k)));
    check('3b LIVE: the registration alone, nothing names signupSeats', ls.length === 1 && ls[0].op === 'set' && /^registrations\/SPR\/e[a-z0-9]+$/.test(ls[0].path), JSON.stringify(ls));
    check('3c LIVE: "You\'re signed up", no place claimed', /^You're signed up, Kim .* It puts you in the field, or on the waiting list if the field is already full/.test(l2['reg-done'].text) && !/spot \d|number \d/.test(l2['reg-done'].text), l2['reg-done'].text);

    // 4. THE DESK.
    const regs = { ekim0001: { fullName: 'Kim Vo', email: 'kim@example.com', phone: '602-555-0143', createdAt: 2001, ghinOrHandicap: '22.0' },
        edana002: { fullName: 'Dana Ruiz', email: 'dana@example.com', phone: '602-555-0144', createdAt: 2002, ghinOrHandicap: '14.2' },
        elee0003: { fullName: 'Lee Park', email: 'lee@example.com', phone: '602-555-0145', createdAt: 2003 } };
    const landedRegs = JSON.parse(JSON.stringify(regs));
    landedRegs.ekim0001.approvedAt = 3000; landedRegs.ekim0001.playerId = 'pekim0001';
    landedRegs.edana002.approvedAt = 3000; landedRegs.edana002.playerId = 'pedana002';
    const landedRec = event({ signup: { cap: 3 }, players: { p1: RAY, pekim0001: { id: 'pekim0001', name: 'Kim Vo', handicap: '22.0', addedAt: 3000, signupId: 'ekim0001' },
        pedana002: { id: 'pedana002', name: 'Dana Ruiz', handicap: '14.2', addedAt: 3000, signupId: 'edana002' } } });
    const desk = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SPR'), db: dbOf(event({ signup: { cap: 3 } }), { registrations: { SPR: regs } }), auth: OWNER,
        settleMs: 2500, viewport: VP,
        steps: [{ tap: '#tab-btn-desk' }, { sleep: 400 }, WRITES,
            { deliver: { path: 'tournaments/SPR', value: landedRec } }, { deliver: { path: 'registrations/SPR', value: landedRegs } }, { sleep: 300 },
            READ(['signup-desk-bar', 'registration-desk-note', 'registration-chips', 'registration-list']), WIDE,
            { expression: `(function () { var e = document.getElementById('manage-tab-desk'); e.scrollIntoView({ block: 'start' }); return 1; })()` }, { sleep: 150 }]
            .concat(shot('C7-desk.png'), [{ expression: `(function () { var e = document.getElementById('registration-chips'); e.scrollIntoView({ block: 'start' }); return 1; })()` }, { sleep: 150 }], shot('C8-desk-list.png'), [WRITES]) });
    const dw = json(desk.value[1]);
    const dk = json(desk.value[4]);
    console.log('DESK bar innerText: ' + dk['signup-desk-bar'].text);
    console.log('DESK note innerText: ' + dk['registration-desk-note'].text);
    console.log('DESK chips innerText: ' + dk['registration-chips'].text);
    console.log('DESK list innerText: ' + dk['registration-list'].text);
    const adds = dw.filter((w) => w.op === 'update' && (w.keys || []).some((k) => /\/playerId$/.test(k)));
    check('4a the page wrote Kim and Dana into the field, one update each, and not Lee', adds.length === 2 && adds.every((w) => w.keys.some((k) => /^tournaments\/SPR\/players\/pe(kim0001|dana002)$/.test(k))), JSON.stringify(adds));
    const dw2 = json(desk.value[desk.value.length - 1]);
    check('4b nothing more after the writes came back', dw2.filter((w) => w.op === 'update' && (w.keys || []).some((k) => /\/playerId$/.test(k))).length === 2, JSON.stringify(dw2.slice(-4)));
    check('4c the tiles: 3 of 3, 0 spots left, 1 waiting', /^3 golfers in the field 3 of 3 0 spots left 1 waiting 2 signed up online Close sign-up now$/.test(dk['signup-desk-bar'].text), dk['signup-desk-bar'].text);
    check('4d one list: Kim and Dana "Signed up online In the field", Ray from Setup, Lee on the waiting list with Move into the field; no Approve',
        /Kim Vo .*Signed up online In the field/.test(dk['registration-list'].text) && /Ray Holt In the field Hcp 8\.1 · A Flight · Added on Setup/.test(dk['registration-list'].text)
        && /WAITING LIST · 1 Lee Park .*Signed up online Waiting list · 1 Move into the field/i.test(dk['registration-list'].text) && !/Approve/.test(dk['registration-list'].text), dk['registration-list'].text);
    check('4e the Desk at 390 px: no sideways scroll', desk.value[5] <= 390, 'scrollWidth ' + desk.value[5]);

    const bad = results.filter((x) => !x).length;
    console.log('\n' + (results.length - bad) + ' / ' + results.length + ' passed');
    process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
