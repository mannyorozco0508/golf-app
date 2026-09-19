#!/usr/bin/env node
// ============================================================================
// THE LIVE LEADERBOARD, AFTER THE FIRST PAINT: a second snapshot reaches the
// board for everyone who is not the organizer.
//
// THE DEFECT (found 2026-09-18, shipped since 7d5866d on 2026-09-12): on an
// owned record, for anyone who is not the owner - signed out, anonymous, another
// account, and since the narrowing everyone on a legacy record - applyManageGate
// REMOVED the Setup tab, and every later snapshot of the record threw inside
// loadTournament's value callback (tournament.html:4094, manage-room-badge
// lives in the removed tab) before renderLeaderboard ran. The first paint was
// complete; nothing after it landed. A spectator watching a live board saw the
// state at page load, forever. Re-derived in Chrome: 14 throwing sites in that
// one callback. Fixed by HIDING the gated tabs instead of removing them, so
// every element the callback writes stays in the tree.
//
// WHY NO CHECK CAUGHT IT - harness fault #6: tools/lib/cold-arrival.js fired
// each listener ONCE and never again, so all 27 tournament tools measured the
// first paint and nothing after; tools/lib/journey.js re-fired but SWALLOWED a
// listener that threw. One snapshot proves the first paint, not the page. Now
// cold-arrival has an opt-in { deliver: { path, value } } step and journey
// records a thrown listener and raises it; this check uses both.
//
// ARMS (all cold, tools/lib/cold-arrival.js, calling nothing the page defines):
//   1. six arrivals on tournament.html?tourney=...: signed out / anonymous /
//      another account / THE OWNER (control) on an owned record; the owner /
//      signed out on a legacy record. Each: the first paint is read, then a
//      SECOND snapshot carrying two holes of scores is delivered to the record
//      listener, then a THIRD with five. The board must change each time, no
//      error may reach window.onerror, and the delivery must have reached at
//      least one listener - a delivery that reached none PROVES NOTHING and
//      the check says so (exit 2), rather than passing on a stale board.
//   2. the gate is HIDDEN, not removed: the Setup and Desk pills and panels
//      exist for a non-owner with no rect, and the owner's are on screen.
//   3. the HARNESS SELF-TEST: a journey (tools/lib/journey.js) on the owned
//      record, signed out; a value listener that throws is registered from the
//      probe (that is the harness's listener, not the page's), a write fires
//      it, and journey must RAISE 'page threw in a listener'. A harness that
//      swallows it fails this arm - that is the control for fault #6's
//      second half.
//
// EXIT 0 PASS, 1 FAIL, 2 could not run / proved nothing.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { openJourney, fileUrl: journeyUrl } = require('./lib/journey.js');

const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const base = { name: 'Live Board Scramble', format: 'scramble', courseName: 'Camas Meadows', courseData: COURSE, entryFee: 0, createdAt: 1,
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann', 'Bo'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Cal'], handicap: 0 } }, scores: {} };
const OWNED = Object.assign({}, base, { ownerUid: 'u-org' });
const LEGACY = Object.assign({}, base);
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const STRANGER = { uid: 'u-other', email: 'other@example.com', isAnonymous: false };
const withScores = (rec, holes) => { const r = JSON.parse(JSON.stringify(rec)); r.scores = {}; for (let h = 1; h <= holes; h++) { r.scores['team1_h' + h] = 3; r.scores['team2_h' + h] = 5; } return r; };

const PRE = `window.__errs = []; window.addEventListener('error', function (e) { window.__errs.push(String(e.message) + ' @' + e.lineno); });`;
const BOARD = `(function () {
  var R = function (el) { if (!el) return null; var b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
  var rows = Array.from(document.querySelectorAll('#leaderboard-list .lb-row')).map(function (r) { return r.innerText.replace(/\\s+/g, ' ').trim(); });
  var ex = function (id) { return !!document.getElementById(id); };
  return JSON.stringify({ rows: rows, errs: window.__errs.slice(),
    setupPill: { exists: ex('tab-btn-setup'), rect: R(document.getElementById('tab-btn-setup')) }, deskPill: { exists: ex('tab-btn-desk'), rect: R(document.getElementById('tab-btn-desk')) },
    setupPanel: { exists: ex('manage-tab-setup'), rect: R(document.getElementById('manage-tab-setup')) }, deskPanel: { exists: ex('manage-tab-desk'), rect: R(document.getElementById('manage-tab-desk')) },
    leaderboardPill: R(document.getElementById('tab-btn-leaderboard')), badge: ex('manage-room-badge'), activePill: (document.querySelector('.top-nav-item.active') || {}).id || null });
})()`;

(async () => {
    const failures = [];
    const bail = (why, extra) => { process.stdout.write(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2) + '\n', () => process.exit(2)); };
    const J = (r, i) => { try { return JSON.parse(r.value[i]); } catch (e) { return null; } };
    const measured = {};

    // ---- 1 + 2: six arrivals, three snapshots each --------------------------------
    const arms = [
        ['signedOut_owned', OWNED, 'signed-out', false], ['anonymous_owned', OWNED, 'anonymous', false], ['stranger_owned', OWNED, STRANGER, false],
        ['OWNER_owned_control', OWNED, OWNER, true], ['owner_legacy', LEGACY, OWNER, false], ['signedOut_legacy', LEGACY, 'signed-out', false]
    ];
    for (const [label, rec, auth, manages] of arms) {
        const code = 'LB' + label.length;
        const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=' + code), db: { tournaments: { [code]: rec } }, auth, viewport: { width: 390, height: 844 }, preScript: PRE, settleMs: 4500, steps: [
            { expression: BOARD },                                                                    // 0 first paint
            { deliver: { path: 'tournaments/' + code, value: withScores(rec, 2) } }, { sleep: 300 }, { expression: BOARD },   // 1-3 second snapshot
            { deliver: { path: 'tournaments/' + code, value: withScores(rec, 5) } }, { sleep: 300 }, { expression: BOARD }    // 4-6 third snapshot
        ] });
        if (!r.ok) return bail(label + ': ' + r.reason);
        const first = J(r, 0), d2 = r.value[1], second = J(r, 3), d3 = r.value[4], third = J(r, 6);
        if (!first || !second || !third) return bail(label + ': a probe did not parse', r.value.map((v) => String(v).slice(0, 80)));
        // THE DELIVERY MUST HAVE REACHED THE PAGE, or this arm proves nothing.
        if (!d2 || typeof d2 !== 'object' || !(d2.listeners >= 1)) return bail(label + ': THE SECOND SNAPSHOT REACHED NO LISTENER - this arm proves nothing about the board', d2);
        if (!d3 || !(d3.listeners >= 1)) return bail(label + ': the third snapshot reached no listener', d3);
        measured[label] = { first: first.rows.slice(1), second: second.rows.slice(1), third: third.rows.slice(1), errs: third.errs, listeners: [d2.listeners, d3.listeners], threw: [d2.threw, d3.threw],
            setupPill: second.setupPill, setupPanel: second.setupPanel, deskPill: second.deskPill, deskPanel: second.deskPanel, activePill: second.activePill };
        if (!/Eagles/.test(first.rows.join(' '))) failures.push(label + ': the first paint does not list Eagles: ' + JSON.stringify(first.rows));
        if (first.rows.some((x) => /^1 Eagles/.test(x))) failures.push(label + ': the first paint already carries scores - the fixture is wrong');
        if (!second.rows.some((x) => /^1 Eagles 2 -2$/.test(x))) failures.push(label + ': THE BOARD DID NOT MOVE ON THE SECOND SNAPSHOT (2 holes): ' + JSON.stringify(second.rows));
        if (!third.rows.some((x) => /^1 Eagles 5 -5$/.test(x))) failures.push(label + ': the board did not move on the third snapshot (5 holes): ' + JSON.stringify(third.rows));
        if (third.errs.length) failures.push(label + ': the page threw after the first paint: ' + JSON.stringify(third.errs));
        if (d2.threw.length || d3.threw.length) failures.push(label + ": the record listener threw on delivery: " + JSON.stringify([d2.threw, d3.threw]));
        // THE GATE: hidden, not removed.
        for (const k of ['setupPill', 'deskPill', 'setupPanel', 'deskPanel']) {
            const x = second[k];
            if (!x.exists) failures.push(label + ': ' + k + ' was REMOVED - the gate must hide, so the value callback can still write into it');
            const shown = !!(x.rect && x.rect.w > 0 && x.rect.h > 0);
            if (manages && !shown && /Pill/.test(k)) failures.push(label + ': the owner\'s ' + k + ' has no rect');
            if (!manages && shown) failures.push(label + ': ' + k + ' has a rect for a non-owner: ' + JSON.stringify(x.rect));
        }
        if (!second.badge) failures.push(label + ': manage-room-badge is not in the tree (the first throwing site)');
        if (!manages && second.activePill !== 'tab-btn-leaderboard') failures.push(label + ': a non-owner is not on the Leaderboard pill: ' + second.activePill);
        if (!(second.leaderboardPill && second.leaderboardPill.w > 0)) failures.push(label + ': the Leaderboard pill has no rect');
    }

    // ---- 3: the harness self-test - journey must raise a thrown listener ---------------
    const j = await openJourney({ db: { tournaments: { LBJ1: OWNED }, trips: {}, global_courses: {} }, auth: 'signed-out' });
    let raised = null, swallowed = null;
    try {
        await j.goto(journeyUrl('tournament.html', 'tourney=LBJ1'), 3000);
        // the harness's own listener, not the page's: it throws on the next snapshot
        await j.evaluate(`window.firebase.database().ref('tournaments/LBJ1/probe').on('value', function (s) { if (s.val() === 'second') throw new Error('LISTENER-PROBE-THREW'); }); 'registered'`);
        try {
            await j.evaluate(`window.firebase.database().ref('tournaments/LBJ1/probe').set('second'); 'written'`);
            // the write fired notify() synchronously; the throw must have been raised by THAT evaluate or this one
            await j.evaluate(`'after'`);
            swallowed = 'journey returned normally after a listener threw';
        } catch (e) { raised = String(e.message); }
    } catch (e) { return bail('journey self-test could not run: ' + (e && e.message)); }
    finally { try { await j.close(); } catch (e) {} }
    measured.journeySelfTest = { raised, swallowed };
    if (!raised || !/page threw in a listener/.test(raised) || !/LISTENER-PROBE-THREW/.test(raised)) failures.push('HARNESS: journey did not raise the thrown listener (' + (swallowed || raised) + ') - a page dying on every snapshot would read as stale');

    const verdict = failures.length ? 'FAIL' : 'PASS';
    process.stdout.write(JSON.stringify({ verdict, failures, measured }, null, 2) + '\n', () => process.exit(failures.length ? 1 : 0));
})().catch((e) => { process.stdout.write(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.stack || e) }, null, 2) + '\n', () => process.exit(2)); });
