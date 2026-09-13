#!/usr/bin/env node
// ============================================================================
// FLIGHTS ON leaderboard.html AND admin.html, IN A BROWSER, AT PHONE WIDTH.
//
// mini-dom has no layout, so the suite can prove what the page RENDERS and
// nothing about what a golfer SEES. This arrives cold on a real flighted round
// (390 x 844, mobile emulation, the Firebase bundles blocked, the stub round
// injected) and measures:
//
//   leaderboard.html   the pill row (three pills, each with a rect, the
//                      active one), both Flight cards with rects, the badges
//                      on All Players (after tapping that pill - the page's
//                      own button, the one allowed act), the live skins
//                      cards per flight, and that the body does not scroll
//                      sideways.
//   admin.html         the Step 5 flight control on a PLAIN row (skins
//                      format) and on a TEAM row (bestball): the name input's
//                      width, the A/B control's rect, and whether anything
//                      overflows the row. The column math in the Step 4
//                      addendum was computed; this is the measurement.
//
// A DEVICE CHECK MAY NOT CALL A FUNCTION THE PAGE DEFINES. Nothing here does:
// arrival renders the board; the All Players pill is clicked by its id; the
// admin round is arrived at with flights already ON in the stored round, so
// the page draws the control itself.
//
//   node tools/flights-leaderboard-check.js
//   exit 0   everything named above has a rect and says what it should
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const HCP = [7, 13, 17, 1, 9, 3, 15, 5, 11, 8, 14, 18, 2, 10, 4, 16, 6, 12];
const course = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: HCP[i] }));
const names = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'];
const flights = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'];
const players = names.map((n, i) => ({ id: 101 + i, name: n, hcp: '0', team: 'Team 1', squad: 'red', playingForMoney: true, flight: flights[i] }));
const scores = {};
players.forEach(p => course.forEach(h => { scores['p' + p.id + '_h' + h.hole] = h.par; }));
const birdie = (idx, hole) => { scores['p' + players[idx].id + '_h' + hole] = course[hole - 1].par - 1; };
birdie(0, 1); birdie(0, 2); birdie(2, 3); birdie(1, 2); birdie(3, 5); birdie(5, 7); birdie(7, 9); birdie(1, 11);
birdie(4, 13); birdie(6, 13); birdie(5, 13);
const round = { players, gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'gross', skinsCarryOver: false, courseName: 'Tidewater',
    activeCourseKey: 'tidewater', courseData: course, scores, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar',
    flights: { enabled: true, scopes: { skins: 'flight', birdies: 'flight' } }, organizerToken: 'tok-flt', roundDay: 'saturday' };
const teamRound = Object.assign({}, round, { gameFormat: 'bestball', players: players.map((p, i) => Object.assign({}, p, { team: i % 2 ? 'Team 2' : 'Team 1' })) });
// The admin plain-row round is STROKE (a format card; the wizard's Next refuses
// a legacy wager-as-format round at Step 1 - measured, see the report) with the
// same skins stacked on top, so the row is the plain "2fr 1fr" shape.
const plainRound = Object.assign({}, round, { gameFormat: 'stroke', additionalGames: { skins: { enabled: true, skinsBuyIn: 8, skinsPotFormat: 'gross', skinsCarryOver: false, startHole: 1 } } });
const db = { events: { FLTLB1: round, FLTAD1: plainRound, FLTAD2: teamRound }, global_courses: {
    tidewater: { name: 'Tidewater', data: course } }, trips: {}, tournaments: {} };

const rectOf = `(sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left) }; }`;

const LB_PROBE_1 = `
(() => {
  const rect = ${rectOf};
  const vis = (sel) => { const r = rect(sel); return !!(r && r.w > 0 && r.h > 0); };
  const cards = Array.prototype.slice.call(document.querySelectorAll('#board-content span')).filter(s => /Flight [AB]/.test(s.textContent)).map(s => ({ text: s.textContent.trim(), rect: (r => ({ w: Math.round(r.width), h: Math.round(r.height) }))(s.getBoundingClientRect()) }));
  return JSON.stringify({
    pills: ['group', 'flight', 'all'].map(m => ({ m, visible: vis('#pill-' + m + '-view'), active: document.getElementById('pill-' + m + '-view').classList.contains('active'), text: document.getElementById('pill-' + m + '-view').innerText })),
    toggleVisible: vis('#group-view-toggle'),
    flightCards: cards,
    badgesOnFlightView: document.querySelectorAll('#board-content .player-flight').length,
    skinsCards: Array.prototype.slice.call(document.querySelectorAll('#live-skins-mount .ls-head')).map(h => ({ text: h.innerText.trim(), visible: h.getBoundingClientRect().height > 0 })),
    skinsRows13: Array.prototype.slice.call(document.querySelectorAll('#live-skins-mount .ls-r')).map(r => r.innerText).filter(t => /Hole 13/.test(t)),
    boardText: (document.getElementById('board-content') || {}).innerText || '',
    scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth ? document.documentElement.scrollWidth : 0
  });
})()`;
const LB_PROBE_2 = `
(() => {
  const badges = Array.prototype.slice.call(document.querySelectorAll('#board-content .player-flight')).map(b => ({ t: b.innerText, visible: b.getBoundingClientRect().height > 0 }));
  const names = Array.prototype.slice.call(document.querySelectorAll('#board-content .player-name')).map(n => n.innerText.replace(/\\s+/g, ' ').trim());
  return JSON.stringify({ active: ['group', 'flight', 'all'].filter(m => document.getElementById('pill-' + m + '-view').classList.contains('active')), badges, names });
})()`;

const ADMIN_PROBE = `
(() => {
  const rect = ${rectOf};
  const rows = Array.prototype.slice.call(document.querySelectorAll('#player-list .player-row'));
  const first = rows[0];
  if (!first) return JSON.stringify({ rows: 0 });
  const name = first.querySelector('.p-name-input'), fb = first.querySelector('.p-flight-input'), line = first.querySelector('.p-flight-line'), team = first.querySelector('.p-team-input');
  const rr = first.getBoundingClientRect();
  const r = (el) => el ? (x => ({ w: Math.round(x.width), h: Math.round(x.height), x: Math.round(x.left), right: Math.round(x.right) }))(el.getBoundingClientRect()) : null;
  return JSON.stringify({
    rows: rows.length,
    flightsSwitchVisible: !!(rect('#flights-switch') || rect('#flights-block')),
    count: (document.getElementById('flights-count') || {}).innerText,
    row: { w: Math.round(rr.width), h: Math.round(rr.height), right: Math.round(rr.right), cols: first.style.gridTemplateColumns },
    name: r(name), flight: r(fb), flightText: fb ? fb.innerText : null, line: r(line), team: r(team), del: r(first.querySelector('.btn-del')),
    nameY: name ? Math.round(name.getBoundingClientRect().top) : null, flightY: fb ? Math.round(fb.getBoundingClientRect().top) : null,
    overflow: rows.some(row => Array.prototype.slice.call(row.children).some(c => c.getBoundingClientRect().right > row.getBoundingClientRect().right + 1)),
    headerText: (document.getElementById('player-header-row') || {}).innerText,
    viewport: document.documentElement.clientWidth
  });
})()`;

(async () => {
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };
    const failures = [];

    // ---- leaderboard, arrival: the default view (By Flight) and the skins cards
    const lb = await arriveCold({ url: fileUrl('leaderboard.html', 'game=FLTLB1'), db, settleMs: 6000,
        steps: [{ expression: LB_PROBE_1 }, { expression: "document.getElementById('pill-all-view').click(); 'clicked'" }, { expression: LB_PROBE_2 }] });
    if (!lb.ok) bail('leaderboard did not run: ' + lb.reason);
    let one, two;
    try { one = JSON.parse(lb.value[0]); two = JSON.parse(lb.value[2]); } catch (e) { bail('non-JSON from the leaderboard probe', lb.value); }
    if (!one.boardText || !/Ann/.test(one.boardText)) bail('the board rendered nothing, so nothing else can be held against anything', one);
    if (!one.pills.every(p => p.visible)) failures.push('a pill has no rect: ' + JSON.stringify(one.pills));
    if (one.toggleVisible) failures.push('the old two-position toggle is still visible on a flighted round');
    if (!(one.pills.find(p => p.m === 'flight') || {}).active) failures.push('By Flight is not the active default');
    if (one.flightCards.length !== 2 || !one.flightCards.every(c => c.rect.h > 0)) failures.push('both Flight cards should have rects: ' + JSON.stringify(one.flightCards));
    if (one.badgesOnFlightView !== 0) failures.push('badges appear in By Flight (' + one.badgesOnFlightView + ')');
    if (one.skinsCards.length !== 2 || !one.skinsCards.every(c => c.visible)) failures.push('two live skins cards expected: ' + JSON.stringify(one.skinsCards));
    if (!(one.skinsRows13.some(t => /No Skin/.test(t)) && one.skinsRows13.some(t => /Fay|Gus|Eli/.test(t) && !/No Skin/.test(t)))) failures.push('hole 13 should be a tie in one flight and a skin in the other: ' + JSON.stringify(one.skinsRows13));
    if (one.scrollX) failures.push('the leaderboard scrolls sideways at 390px: scrollWidth ' + one.scrollX);
    if (!two.active.includes('all')) failures.push('tapping All Players did not activate it: ' + JSON.stringify(two.active));
    if (two.badges.length !== 8 || !two.badges.every(b => b.visible)) failures.push('All Players should show 8 visible badges: ' + JSON.stringify(two.badges));
    if (two.names.length !== 8) failures.push('All Players should list 8 golfers: ' + two.names.length);

    // ---- admin, a PLAIN row (skins) and a TEAM row (bestball), flights on
    // An EXISTING round arrives on the Review step (7); Step 5 is display:none
    // until the page's own Back buttons are pressed (the one act a device check
    // may take): Review -> Games & Money -> Players, for both formats.
    const BACK = (n) => ({ expression: "(function(){ var b = document.getElementById('wizard-back-" + n + "'); if (b) b.click(); return 'back-" + n + "'; })()" });
    // A validation alert would hang CDP; capture instead of showing, and report
    // whatever the page said - an alert on the way to Step 5 is itself a finding.
    const MUTE = { expression: "window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); }; window.confirm = function () { return true; }; 'muted'" };
    const ALERTS = { expression: "JSON.stringify(window.__alerts || [])" };
    const adminSteps = [MUTE, BACK(7), BACK(6), { expression: ADMIN_PROBE }, ALERTS];
    const plain = await arriveCold({ url: fileUrl('admin.html', 'game=FLTAD1'), db, settleMs: 6000, steps: adminSteps });
    const team = await arriveCold({ url: fileUrl('admin.html', 'game=FLTAD2'), db, settleMs: 6000, steps: adminSteps });
    if (!plain.ok) bail('admin (plain) did not run: ' + plain.reason);
    if (!team.ok) bail('admin (team) did not run: ' + team.reason);
    let ap, at;
    try { ap = JSON.parse(plain.value[3]); at = JSON.parse(team.value[3]); ap.alerts = JSON.parse(plain.value[4]); at.alerts = JSON.parse(team.value[4]); } catch (e) { bail('non-JSON from the admin probe', [plain.value, team.value]); }
    [['plain', ap], ['team', at]].forEach(([k, a]) => {
        if (!a.rows) failures.push(k + ': no rows rendered');
        if (!a.flight) failures.push(k + ': no flight control on the first row');
        else if (a.flight.w < 36 || a.flight.h < 36) failures.push(k + ': the A/B control is under 36px: ' + JSON.stringify(a.flight));
        if (a.name && a.name.w < 100) failures.push(k + ': the name input is ' + a.name.w + 'px wide - too narrow to read a name');
        if (a.overflow) failures.push(k + ': a row child overflows the row');
    });
    if (ap.line) failures.push('plain row should use a column, not a second line');
    // THE COLUMN HAS TO BE ON THE NAME'S LINE. A control that lands on a second
    // grid row is a second line by another name, and the row grows to hold it.
    if (ap.flightY !== null && ap.nameY !== null && Math.abs(ap.flightY - ap.nameY) > 4) failures.push('plain row: the A/B control is not on the name\'s line (name y ' + ap.nameY + ', control y ' + ap.flightY + ', row ' + ap.row.h + 'px tall) - the delete button took column 3');
    if (!at.line) failures.push('team row should use the second line');

    console.log(JSON.stringify({ verdict: failures.length ? 'FAIL' : 'PASS', failures,
        measured: { leaderboard: { arrival: one, afterAllPlayers: two }, admin: { plainRow: ap, teamRow: at } } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2)); process.exit(2); });
