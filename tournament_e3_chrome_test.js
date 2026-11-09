// ============================================================================
// E3 PACE OF PLAY, IN A BROWSER - COLD (2026-11-09)
//
// tools/lib/cold-arrival.js: headless Chrome, the real pages and their own
// init; only the data source is replaced. A DEVICE CHECK MAY NOT CALL A
// FUNCTION THE PAGE DEFINES: each arm lands on the URL a golfer or organizer
// lands on and then only taps, types, delivers a second snapshot and reads
// innerText.
//
//   P1  DEFAULT: an owned event with no pace node. The tool says Opt-in: off,
//       shows no table and no nudge button; tapping "off" writes
//       pace {on: true, targetMin: 255} - and nothing else.
//   P2  pace on, a shotgun with proofs: the table (on pace / 22 min behind /
//       no scores yet / — for scores with no time), the callout naming the
//       group ahead, "Send a nudge" writes {at: server time, tpl, thru}; the
//       target edits to 4:30 = 270.
//   N1  the nudged team's card shows the fixed sentence and the footnote; a
//       score on the next hole, delivered live, takes it away. Another team's
//       card and an un-nudged event show nothing.
//   N2  a signed-out visitor: no Pace door, no tool.
//
//   EVENT_TOOLS_SHOTS=1 writes 390x844 @2x screenshots to
//   ~/Desktop/claude-mailbox-shared/tournaments/screens-event-tools/.
//
// WHAT THIS CANNOT PROVE: the rules (tournament_e3_rules_emulator_test.js) -
// in particular that the owner's real SDK read of scoreProofs/<code> is
// allowed is proven only there; and pace on a real course clock.
//
// Skipped when Chrome is not installed.
//
// BASELINE (final file, branch event-e1e3; measured in an exported copy of
// cf86caf8 - no pace tool, no nudge banner - with this file copied in): all 4
// tests: 0 PASS / 4 FAIL.
// Against the finished pages: all 4 tests: 4 PASS / 0 FAIL.
// Code negative controls (12, saved copy + sha + RESTORED-OK): 12 of 12 caught
// (Q11 "nudge shown on every team" was inert until the other-team check moved
// from Team 4, already past the nudge, to Team 15, inside it).
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SKIP = fs.existsSync(CHROME) ? {} : { skip: 'no Chrome' };
const SHOTS = process.env.EVENT_TOOLS_SHOTS === '1';
const SHOT_DIR = path.join(os.homedir(), 'Desktop', 'claude-mailbox-shared', 'tournaments', 'screens-event-tools');
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name) => SHOTS ? [{ shot: path.join(SHOT_DIR, name), viewportOnly: true }] : [];

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const course = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));
const START = new Date(2026, 10, 21, 8, 0, 0).getTime();
const min = (m) => START + m * 60000;
const KEY = 'a'.repeat(32);
// holes a team starting on `s` has played after `n` holes
const played = (s, n) => Array.from({ length: n }, (_, i) => ((s - 1 + i) % 18) + 1);
const scores = {}, proofs = {};
function team(n, s, thru, lastMin) {
    played(s, thru).forEach((h, i) => {
        scores[`team${n}_h${h}`] = PARS[h - 1];
        if (lastMin !== null && i === thru - 1) proofs[`team${n}_h${h}`] = { who: 'team' + n, k: KEY, t: min(lastMin) };
        if (lastMin !== null && i === 0) proofs[`team${n}_h${h}`] = { who: 'team' + n, k: KEY, t: min(10) };
    });
}
team(9, 9, 13, 180);    // target 13 x 14.17 = 184 -> on pace
team(4, 4, 11, 150);    // 155.8 -> on pace
team(7, 7, 6, 107);     // 6 x 14.17 = 85 -> 22 min behind
team(12, 12, 2, null);  // scores, no proof time -> —
const teams = {};
for (const [n, s] of [[4, 4], [7, 7], [9, 9], [12, 12], [15, 15]]) teams['team' + n] = { num: n, name: 'Team ' + n, players: ['Lopez', 'Kim'], handicap: 0, startingHole: s };
const base = { name: 'Rattle Classic', format: 'scramble', courseName: 'Papago', activeCourseKey: 'papago', courseData: course,
    entryFee: 0, createdAt: 1, ownerUid: 'u-org', eventDate: '2026-11-21', startTime: '08:00', startType: 'shotgun', teams, scores };
const db = {
    tournaments: {
        OFF1: base,
        PACE1: Object.assign({}, base, { pace: { on: true, targetMin: 255 } }),
        NUDGE1: Object.assign({}, base, { pace: { on: true, targetMin: 255 }, nudges: { team7: { at: min(110), tpl: 'pace1', thru: 6 } } })
    },
    scoreProofs: { OFF1: proofs, PACE1: proofs, NUDGE1: proofs },
    tournamentKeys: {}, events: {}, trips: {}, global_courses: {}
};
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const txt = (sel) => `((document.querySelector(${JSON.stringify(sel)}) || {}).innerText || '')`;
const VIS = `(sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }`;
const PROBE = `(() => { const vis = ${VIS}; return JSON.stringify({ door: vis('#open-pace'), doorInTree: !!document.getElementById('open-pace'), tool: vis('#manage-tab-pace'),
    bar: ${txt('#hp-brand')}, sub: ${txt('#pace-sub')}, target: (document.getElementById('pace-target') || {}).value || '', table: vis('#pace-table') ? ${txt('#pace-table')} : '', calls: ${txt('#pace-calls')},
    foot: vis('#pace-foot') ? ${txt('#pace-foot')} : '', nudgeBtns: document.querySelectorAll('#pace-calls button').length,
    writes: (window.__coldWrites || []).filter((w) => /tournaments\\/[A-Z0-9]+\\/(pace|nudges)/.test(w.path)).map((w) => ({ op: w.op, path: w.path, value: w.value })) }); })()`;

async function run(opts) {
    const r = await arriveCold(Object.assign({ settleMs: 7000 }, opts));
    assert.ok(r.ok, 'the arrival ran: ' + r.reason);
    assert.deepEqual(r.dialogs || [], [], 'no native dialog');
    return { values: (r.value || []).filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v)), raw: r.value };
}
const OPEN = [{ tap: '#tab-btn-leaderboard' }, { sleep: 300 }, { tap: '#open-pace' }, { sleep: 300 }];

test('P1. DEFAULT: pace is off until the organizer turns it on - no table, no nudge; tapping "off" writes {on: true, targetMin: 255} only', SKIP, async () => {
    const { values: [v0, v1] } = await run({ url: fileUrl('tournament.html', 'tourney=OFF1'), db, auth: OWNER,
        steps: [...OPEN, { expression: PROBE }, ...shot('E3a-pace-off-default.png'), { tap: '#pace-switch' }, { sleep: 300 }, { expression: PROBE }] });
    assert.ok(v0.tool, 'the tool opened');
    assert.match(v0.bar, /Pace of play/);
    assert.equal(v0.target, '4:15', 'the default target is 4:15');
    assert.match(v0.sub, /^From last scored hole only\. No locations\. Target\s*for 18\. Opt-in: off for this event\.$/);
    assert.equal(v0.table, ''); assert.equal(v0.nudgeBtns, 0); assert.equal(v0.foot, '');
    assert.deepEqual(v0.writes, [], 'arriving writes nothing');
    assert.deepEqual(v1.writes, [{ op: 'set', path: 'tournaments/OFF1/pace', value: { on: true, targetMin: 255 } }]);
});

test('P2. pace on: on pace / 22 min behind / no scores yet / — ; the callout names the group ahead; Send a nudge writes {at, tpl, thru}; 4:30 saves 270', SKIP, async () => {
    const { values: [v0, v1, v2] } = await run({ url: fileUrl('tournament.html', 'tourney=PACE1'), db, auth: OWNER,
        steps: [...OPEN, { expression: PROBE }, ...shot('E3a-organizer-pace.png'),
            { tap: '#pace-calls button' }, { sleep: 300 }, { expression: PROBE },
            { tap: '#pace-target' }, { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] } } },
            { cdp: { method: 'Input.insertText', params: { text: '4:30' } } }, { tap: '#pace-table' }, { sleep: 300 }, { expression: PROBE }] });
    const rows = v0.table.split('\n').map((l) => l.trim()).filter(Boolean).join(' | ');
    assert.match(rows, /^TEAM \| THRU \| VS TARGET \| Team 9 · started 9 \| 13 \| on pace \| Team 4 · started 4 \| 11 \| on pace \| Team 7 · started 7 \| 6 \| 22 min behind \| Team 12 · started 12 \| 2 \| — \| Team 15 · started 15 \| — \| no scores yet$/i, rows);
    assert.match(v0.sub, /Opt-in: on for this event\./);
    assert.equal(v0.nudgeBtns, 1, 'one callout: only Team 7 is behind');
    assert.match(v0.calls, /^Team 7 is a hole behind Team 9\s*Send a nudge$/);
    assert.equal(v0.foot, '"Behind" can be wrong when a group simply has not entered scores yet. It is a hint, not a ruling.');
    assert.deepEqual(v1.writes, [{ op: 'set', path: 'tournaments/PACE1/nudges/team7', value: { at: { '.sv': 'timestamp' }, tpl: 'pace1', thru: 6 } }]);
    assert.deepEqual(v2.writes.slice(1), [{ op: 'set', path: 'tournaments/PACE1/pace', value: { on: true, targetMin: 270 } }]);
});

const CARD = `(() => { const vis = ${VIS}; return JSON.stringify({ note: vis('#pace-note') ? ${txt('#pace-note')} : '', foot: vis('#pace-note-foot') ? ${txt('#pace-note-foot')} : '',
    status: ${txt('#status-main')}, inputs: document.querySelectorAll('#holes-list input').length }); })()`;

test('N1. the nudged team\'s card: the fixed sentence and the footnote until it scores the next hole (delivered live); other cards and an un-nudged event show nothing', SKIP, async () => {
    const after = Object.assign({}, db.tournaments.NUDGE1, { scores: Object.assign({}, scores, { team7_h13: 4 }) });
    const { values: [v0, v1], raw } = await run({ url: fileUrl('tournament-scorecard.html', 'tourney=NUDGE1&team=7'), db, settleMs: 5000,
        steps: [{ expression: CARD }, ...(SHOTS ? [{ sleep: 400 }, { expression: 'window.scrollTo(0, 0); "top"' }] : []), ...shot('E3b-pace-nudge-banner.png'), { deliver: { path: 'tournaments/NUDGE1', value: after } }, { sleep: 300 }, { expression: CARD }] });
    assert.match(v0.note, /^⏱️ FRIENDLY PACE NOTE\s*You're about a hole behind the group ahead\. Ready golf helps everyone\. Thanks!$/i);
    assert.equal(v0.foot, 'Only your team sees this. It goes away after you score the next hole.');
    const d = raw.find((x) => x && typeof x === 'object' && 'listeners' in x);
    assert.ok(d && d.listeners > 0 && d.threw.length === 0, JSON.stringify(d));
    assert.equal(v1.note, ''); assert.equal(v1.foot, '');
    assert.ok(v1.inputs === 18, 'positive: the card is still there');
    const other = await run({ url: fileUrl('tournament-scorecard.html', 'tourney=NUDGE1&team=15'), db, settleMs: 5000, steps: [{ expression: CARD }] });
    assert.equal(other.values[0].note, '', 'another team (Team 15, thru 0, inside the nudge thru) never sees it');
    assert.ok(other.values[0].inputs === 18, 'positive: that card rendered');
    const plain = await run({ url: fileUrl('tournament-scorecard.html', 'tourney=PACE1&team=7'), db, settleMs: 5000, steps: [{ expression: CARD }] });
    assert.equal(plain.values[0].note, '', 'no nudge, no note (default)');
});

test('N2. a signed-out visitor: no Pace door, no tool; the door is in the tree, hidden', SKIP, async () => {
    const { values: [v] } = await run({ url: fileUrl('tournament.html', 'tourney=PACE1'), db, auth: 'signed-out', steps: [{ expression: PROBE }] });
    assert.ok(!v.door && !v.tool, JSON.stringify({ door: v.door, tool: v.tool }));
    assert.equal(v.doorInTree, true);
});
