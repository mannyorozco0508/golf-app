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
const PROBE = `(() => { const vis = ${VIS}; return JSON.stringify({ door: vis('#open-pace'), doorInTree: !!document.getElementById('open-pace'), toolInTree: !!document.getElementById('manage-tab-pace'),
    board: vis('#manage-tab-leaderboard'), sw: vis('#pace-on-switch + .toggle-slider'), on: !!(document.getElementById('pace-on-switch') || {}).checked, label: ${txt('#pace-on-label')}, target: (document.getElementById('pace-target') || {}).value || '',
    needs: Array.from(document.querySelectorAll('#eh-needs-list .eh-need')).map((b) => ({ key: b.dataset.need, text: (b.innerText || '').replace(/\\s+/g, ' ').trim() })),
    writes: (window.__coldWrites || []).filter((w) => /tournaments\\/[A-Z0-9]+\\/(pace|nudges)/.test(w.path)).map((w) => ({ op: w.op, path: w.path, value: w.value })) }); })()`;

async function run(opts) {
    const r = await arriveCold(Object.assign({ settleMs: 7000 }, opts));
    assert.ok(r.ok, 'the arrival ran: ' + r.reason);
    assert.deepEqual(r.dialogs || [], [], 'no native dialog');
    return { values: (r.value || []).filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v)), raw: r.value };
}
// EC3 C (Manny 2026-11-11): no pace door and no pace tab. The switch and the
// target are on Setup; a team that is behind is a row on Event day's Needs you,
// and its button is the E3b nudge. HOME and SETUP open those tabs.
const HOME = [{ tap: '#tab-btn-home' }, { sleep: 300 }];
const SETUP = [{ tap: '#tab-btn-setup' }, { sleep: 300 }];

test('P1. DEFAULT (EC3 C): pace is off until the organizer turns it on - no pace row on Needs you, no door, no tab; the Setup switch writes {on: true, targetMin: 255} only', SKIP, async () => {
    const { values: [v0, v1, v2] } = await run({ url: fileUrl('tournament.html', 'tourney=OFF1'), db, auth: OWNER,
        steps: [...HOME, { expression: PROBE }, ...SETUP, { expression: PROBE }, ...shot('E3a-pace-off-default.png'), { tap: '#pace-on-switch + .toggle-slider' }, { sleep: 300 }, { expression: PROBE }] });
    assert.ok(!v0.door && !v0.doorInTree && !v0.toolInTree, 'no pace door or tab anywhere: ' + JSON.stringify(v0));
    assert.deepEqual(v0.needs.filter((n) => /^pace-/.test(n.key)), [], 'off: no pace row');
    assert.deepEqual(v0.writes, [], 'arriving writes nothing');
    assert.equal(v1.sw, true, 'the switch is on Setup');
    assert.equal(v1.on, false); assert.equal(v1.label, 'Off');
    assert.equal(v1.target, '4:15', 'the default target is 4:15');
    assert.deepEqual(v2.writes, [{ op: 'set', path: 'tournaments/OFF1/pace', value: { on: true, targetMin: 255 } }]);
});

test('P2. pace on (EC3 C): Needs you names the one team behind (about 2 holes), its button writes the nudge {at, tpl, thru}; a sent note says so; 4:30 saves 270', SKIP, async () => {
    const { values: [v0, v1, v2] } = await run({ url: fileUrl('tournament.html', 'tourney=PACE1'), db, auth: OWNER,
        steps: [...HOME, { expression: PROBE }, ...shot('E3a-organizer-pace.png'),
            { tap: '#eh-needs-list .eh-need[data-need="pace-team7"]' }, { sleep: 300 }, { expression: PROBE },
            ...SETUP, { tap: '#pace-target' }, { cdp: { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, commands: ['selectAll'] } } },
            { cdp: { method: 'Input.insertText', params: { text: '4:30' } } }, { tap: '#pace-on-label' }, { sleep: 300 }, { expression: PROBE }] });
    const pace = v0.needs.filter((n) => /^pace-/.test(n.key));
    assert.deepEqual(pace.map((n) => n.key), ['pace-team7'], 'one row: only Team 7 is behind (22 min at 14.2 a hole)');
    assert.equal(pace[0].text, '2 Team 7 is about 2 holes behind Send a friendly pace note');
    assert.deepEqual(v1.writes, [{ op: 'set', path: 'tournaments/PACE1/nudges/team7', value: { at: { '.sv': 'timestamp' }, tpl: 'pace1', thru: 6 } }]);
    assert.deepEqual(v2.writes.slice(1), [{ op: 'set', path: 'tournaments/PACE1/pace', value: { on: true, targetMin: 270 } }]);
    const sent = await run({ url: fileUrl('tournament.html', 'tourney=NUDGE1'), db, auth: OWNER,
        steps: [...HOME, { expression: PROBE }, { tap: '#eh-needs-list .eh-need[data-need="pace-team7"]' }, { sleep: 300 }, { expression: PROBE }] });
    const row = sent.values[0].needs.find((n) => n.key === 'pace-team7');
    assert.equal(row && row.text, '2 Team 7 is about 2 holes behind Pace note sent \u00b7 thru 6');
    assert.deepEqual(sent.values[1].writes, [], 'a sent note is not sent again');
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

test('N2. a signed-out visitor (EC3 C): no pace switch, no door, no tab; the board is there', SKIP, async () => {
    const { values: [v] } = await run({ url: fileUrl('tournament.html', 'tourney=PACE1'), db, auth: 'signed-out', steps: [{ expression: PROBE }] });
    assert.ok(!v.sw && !v.door && !v.doorInTree && !v.toolInTree, JSON.stringify({ sw: v.sw, door: v.door, doorInTree: v.doorInTree, toolInTree: v.toolInTree }));
    assert.equal(v.board, true, 'positive: the visitor is on the board');
});
