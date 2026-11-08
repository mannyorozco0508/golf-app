#!/usr/bin/env node
// ============================================================================
// PRIZE RESULTS ARE THE SAME ON EVERY PHONE - two cold Chrome pages (audit #1, A1)
//
// The defect: the prize list on tournament.html followed the board tab the
// VIEWER had open, so on a multi-round event a phone on "Sunday" and a phone on
// "Event" showed two different prize lists. The fix pays on one saved basis
// (tournaments/<code>/payoutBasis), read by every phone.
//
// A DEVICE CHECK MAY NOT CALL A FUNCTION THE PAGE DEFINES. Each phone is a cold
// arrival (tools/lib/cold-arrival.js): the data source is replaced, the page
// runs its own init and listener, and the only inputs are real taps on rendered
// buttons. Text is read with innerText, scoped to #payout-results and
// #payout-basis-label - never textContent, never the body.
//
// ARMS
//   1 nothing saved   phone A taps "Sunday", phone B stays on "Event": the
//                     boards differ (positive: the tap did something) and the
//                     prize lists are identical, with $300.00 on them
//                     (positive: money actually displays).
//   2 saved = Sunday  phone A taps "Saturday", phone B on "Event": both pay
//                     Bob $300.00 and both say "Paid on Sunday".
//   3 team event      nothing saved, combined team total refused: the reason
//                     sentence, no dollar amount, before and after a round tap.
//   4 organizer       sees RESULTS ARE PAID ON with Event total on; tapping
//                     "Sunday" writes payoutBasis = 'r2' (the stand-in records
//                     it); the next snapshot moves the highlight to Sunday.
//
// SCREENSHOTS (A1_SHOTS=<dir>): organizer, watcher and not-available, each a
// 390x844 @2x crop around the prize section, cut from a full-page capture.
//
//   node tools/tournament-prize-basis-check.js
//   exit 0 every arm as expected   exit 1 an arm diverged   exit 2 could not run
//
// MEASURED 2026-11-08: 20/20 arms pass on the wired page. Controls (page
// mutated, restored by sha 9f630bc5): prize rows from the tab -> 8 arms fail;
// unavailable basis lists rows anyway -> 1; label never shown -> 2; no choice
// highlighted -> 2; every-phone sentence changed -> 1; prize render moved back
// into the row renderer -> 0 (INERT, honestly: applyManageGate re-renders the
// prize list on every snapshot, so nothing on screen changes).
// The rules half is tools/tournament-prize-basis-rules-check.js.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { arriveCold, REPO_ROOT } = require('./lib/cold-arrival.js');

const PAGE = process.env.TPBC_PAGE ? path.resolve(process.env.TPBC_PAGE) : path.join(REPO_ROOT, 'tournament.html');
const SHOTS = process.env.A1_SHOTS ? path.resolve(process.env.A1_SHOTS) : null;
const CODE = 'PRIZE1';
const url = 'file://' + PAGE + '?tourney=' + CODE;
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

const SI = [12, 8, 14, 6, 2, 16, 4, 10, 18, 15, 13, 9, 5, 7, 3, 1, 17, 11];
const CD18 = SI.map((si, i) => ({ hole: i + 1, par: 4, hcpIndex: si }));
const fill = (key, v) => { const o = {}; CD18.forEach((h) => { o[`${key}_h${h.hole}`] = v; }); return o; };
const round = (id, extra) => Object.assign({ id, name: 'Round', status: 'open', createdAt: 1, format: 'individual',
    scoringMode: 'gross', courseName: 'Test GC', courseData: CD18, courseIndexSynthetic: false, scoringGroups: {}, scores: {} }, extra);
const base = { ownerUid: OWNER.uid, courseName: 'Test GC', courseData: CD18, createdAt: 1, payoutSpots: [300, 150, 50], entryFee: 100 };
// Ann wins Saturday and the event; Bob wins Sunday; Cy is third everywhere.
// Five golfers at $100 is the $500 the three prizes add up to.
function individual(extra) {
    const p = (id, name) => ({ id, name, handicap: '0' });
    return Object.assign({}, base, { name: 'Club Championship', eventModel: 'round-v1', scoringModel: 'player-v1', format: 'individual',
        players: { pA: p('pA', 'Ann'), pB: p('pB', 'Bob'), pC: p('pC', 'Cy'), pD: p('pD', 'Dee'), pE: p('pE', 'Eve') },
        rounds: {
            r1: round('r1', { name: 'Saturday', status: 'closed', createdAt: 1, scores: Object.assign({}, fill('pA', 3), fill('pB', 5), fill('pC', 6), fill('pD', 7), fill('pE', 8)) }),
            r2: round('r2', { name: 'Sunday', createdAt: 2, scores: Object.assign({}, fill('pA', 5), fill('pB', 4), fill('pC', 6), fill('pD', 7), fill('pE', 8)) }) } }, extra || {});
}
function team(extra) {
    return Object.assign({}, base, { name: 'Two-Day Scramble', eventModel: 'round-v1', format: 'scramble',
        teams: { team1: { num: 1, name: 'Alpha', players: ['A', 'B'], handicap: 0 }, team2: { num: 2, name: 'Bravo', players: ['C', 'D'], handicap: 0 } },
        rounds: {
            r1: round('r1', { name: 'Day 1', format: 'scramble', createdAt: 1, scores: Object.assign({}, fill('team1', 3), fill('team2', 4)) }),
            r2: round('r2', { name: 'Day 2', format: 'scramble', createdAt: 2, scores: Object.assign({}, fill('team1', 5), fill('team2', 4)) }) } }, extra || {});
}
const dbOf = (rec) => ({ tournaments: { [CODE]: rec }, events: {}, trips: {}, global_courses: {} });

// Reads only the DOM: innerText of the elements whose content is the claim.
const READ = `JSON.stringify((function () {
  var t = function (id) { var e = document.getElementById(id); return e ? (e.innerText || '').trim() : null; };
  var lb = document.getElementById('manage-tab-leaderboard');
  var basis = Array.prototype.slice.call(document.querySelectorAll('#payout-basis-control button'));
  return { lbShown: !!(lb && lb.offsetParent !== null), board: t('leaderboard-list'), prize: t('payout-results'),
           label: t('payout-basis-label'), note: t('payout-basis-note'), control: t('payout-basis-control'),
           on: basis.filter(function (b) { return b.className === 'on'; }).map(function (b) { return b.innerText.trim(); }),
           writes: (window.__coldWrites || []).filter(function (w) { return /payoutBasis/.test(w.path); }) };
})())`;
// The prize section's box in page coordinates, for the crop. DOM API only.
const BOX = `JSON.stringify((function () {
  var a = document.getElementById('payout-owner-controls'), h = document.getElementById('payout-public-heading');
  var top = [a, h].filter(function (e) { return e && e.offsetParent !== null; }).map(function (e) { return e.getBoundingClientRect().top + window.scrollY; });
  var n = document.getElementById('payout-basis-note'), r = document.getElementById('payout-results');
  var end = [n, r].filter(function (e) { return e && e.offsetParent !== null; }).map(function (e) { return e.getBoundingClientRect().bottom + window.scrollY; });
  return { top: Math.min.apply(null, top), bottom: Math.max.apply(null, end) };
})())`;

const failures = [], arms = [];
const check = (name, ok, detail) => { arms.push(`${ok ? 'pass' : 'FAIL'}  ${name}${ok ? '' : '  ' + JSON.stringify(detail)}`); if (!ok) failures.push(name); };
const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };

async function phone(rec, steps, auth) {
    const r = await arriveCold({ url, db: dbOf(rec), steps, settleMs: 4000, auth: auth === undefined ? 'anonymous' : auth });
    if (!r.ok) bail('the page did not run: ' + r.reason, r.value);
    return r.value.map((v) => { try { return typeof v === 'string' && v[0] === '{' ? JSON.parse(v) : v; } catch (e) { return v; } });
}
// Crop a 390x844 window (@2x) starting a little above the prize section.
function crop(full, box, out) {
    const H = 844 * 2, W = 390 * 2;
    // Never past the bottom of the page: a crop beyond it is black, not page.
    const fullH = Number((/pixelHeight:\s*(\d+)/.exec(execFileSync('sips', ['-g', 'pixelHeight', full]).toString()) || [])[1]);
    const y = Math.max(0, Math.min(Math.round((box.top - 60) * 2), fullH - H));
    execFileSync('sips', ['-c', String(H), String(W), '--cropOffset', String(y), '0', full, '--out', out], { stdio: 'ignore' });
    fs.unlinkSync(full);
    return out;
}
const tmpShot = (name) => SHOTS ? path.join(SHOTS, '.full-' + name + '.png') : null;
const shotSteps = (name) => SHOTS ? [{ expression: BOX }, { shot: tmpShot(name) }] : [];

(async () => {
    if (!fs.existsSync(PAGE)) bail('no page ' + PAGE);
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const shots = [];

    // ---- ARM 1: nothing saved, two tabs ----
    const a1 = await phone(individual(), [{ expression: READ }, { tap: '#lb-round-filter button', nth: 2 }, { sleep: 300 }, { expression: READ }]);
    const b1 = await phone(individual(), [{ expression: READ }].concat(shotSteps('watcher')));
    const [aBefore, , , aAfter] = a1, [b] = b1;
    if (!aAfter || !b || !b.lbShown) bail('a watcher did not land on the Leaderboard', { aAfter, b });
    check('1 positive: phone A\'s tap moved its board', aBefore.board !== aAfter.board && /Bob/.test(aAfter.board.split('\n').slice(0, 8).join(' ')), { before: aBefore.board, after: aAfter.board });
    check('1 positive: the two boards differ', aAfter.board !== b.board, null);
    check('1 positive: money displays ($300.00 on the list)', /\$300\.00/.test(b.prize || ''), b.prize);
    check('1 the prize lists are identical on both phones', aAfter.prize === b.prize, { A: aAfter.prize, B: b.prize });
    check('1 Ann is paid 1st (event total)', /1st\s+—\s+Ann\s+\$300\.00/.test(b.prize || ''), b.prize);
    check('1 both say "Paid on Event total"', aAfter.label === 'Paid on Event total' && b.label === 'Paid on Event total', [aAfter.label, b.label]);
    check('1 the every-phone note is on screen', b.note === 'Same list on every phone. Changing the board tab above does not change it.', b.note);
    check('1 a watcher has no basis control', !b.control, b.control);
    if (SHOTS) shots.push(crop(tmpShot('watcher'), b1[1], path.join(SHOTS, 'A1-wired-watcher.png')));

    // ---- ARM 2: saved basis = Sunday ----
    const a2 = await phone(individual({ payoutBasis: 'r2' }), [{ tap: '#lb-round-filter button', nth: 1 }, { sleep: 300 }, { expression: READ }]);
    const b2 = await phone(individual({ payoutBasis: 'r2' }), [{ expression: READ }]);
    const A2 = a2[2], B2 = b2[0];
    check('2 the prize lists are identical on both phones', A2.prize === B2.prize, { A: A2.prize, B: B2.prize });
    check('2 Bob is paid 1st (Sunday)', /1st\s+—\s+Bob\s+\$300\.00/.test(B2.prize || ''), B2.prize);
    check('2 both say "Paid on Sunday"', A2.label === 'Paid on Sunday' && B2.label === 'Paid on Sunday', [A2.label, B2.label]);

    // ---- ARM 3: team event, no basis the engine can pay on ----
    const t3 = await phone(team(), [{ expression: READ }].concat(shotSteps('na'), [{ tap: '#lb-round-filter button', nth: 1 }, { sleep: 300 }, { expression: READ }]));
    const T = t3[0], T2 = t3[t3.length - 1];
    check('3 the reason is shown', T.prize === 'Choose which result the prizes are paid on.', T.prize);
    check('3 no dollar amount, no label', !/\$\d/.test(T.prize || '') && !T.label, T);
    check('3 a round tap does not invent a list', !/\$\d/.test(T2.prize || '') && T2.prize === T.prize, T2.prize);
    if (SHOTS) shots.push(crop(tmpShot('na'), t3[1], path.join(SHOTS, 'A1-wired-not-available.png')));

    // ---- ARM 4: the organizer ----
    const steps4 = [{ tap: '#tab-btn-leaderboard' }, { sleep: 300 }, { expression: READ },
        { tap: '#payout-basis-control button', nth: 2 }, { sleep: 300 }, { expression: READ },
        { deliver: { path: 'tournaments/' + CODE, value: individual({ payoutBasis: 'r2' }) } }, { sleep: 300 }, { expression: READ },
        { deliver: { path: 'tournaments/' + CODE, value: individual() } }, { sleep: 300 }].concat(shotSteps('organizer'));
    const o = await phone(individual(), steps4, OWNER);
    const O1 = o[2], O2 = o[5], D = o[6], O3 = o[8];
    check('4 the organizer sees the control with every choice', /RESULTS ARE PAID ON/i.test(O1.control || '') && /Event total/.test(O1.control) && /Saturday/.test(O1.control) && /Sunday/.test(O1.control), O1.control);
    check('4 Event total is on with nothing saved', JSON.stringify(O1.on) === '["Event total"]', O1.on);
    check('4 positive: the organizer\'s list shows money', /\$300\.00/.test(O1.prize || ''), O1.prize);
    check('4 the tap wrote payoutBasis = r2, once', O2.writes.length === 1 && O2.writes[0].path === 'tournaments/' + CODE + '/payoutBasis' && O2.writes[0].value === 'r2', O2.writes);
    check('4 the next snapshot reached the page', D && D.listeners > 0 && D.threw.length === 0, D);
    check('4 after it, Sunday is on and Bob is paid 1st', JSON.stringify(O3.on) === '["Sunday"]' && /1st\s+—\s+Bob\s+\$300\.00/.test(O3.prize || ''), O3);
    if (SHOTS) shots.push(crop(tmpShot('organizer'), o[o.length - 2], path.join(SHOTS, 'A1-wired-organizer.png')));

    console.log(JSON.stringify({ verdict: failures.length ? 'FAIL' : 'PASS', page: path.relative(REPO_ROOT, PAGE), failures, arms, shots }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => bail(String((e && e.stack) || e)));
