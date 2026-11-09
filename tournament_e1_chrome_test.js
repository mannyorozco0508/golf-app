// ============================================================================
// E1 ANNOUNCEMENTS, IN A BROWSER - COLD (2026-11-09)
//
// tools/lib/cold-arrival.js: headless Chrome, the real page and its own init,
// only the data source replaced (and firebase.functions(), a recording stand-in
// injected before any page script; the vendored functions SDK is blocked).
// A DEVICE CHECK MAY NOT CALL A FUNCTION THE PAGE DEFINES: every arm navigates
// to the URL a golfer or organizer lands on, then only taps, types
// (Input.insertText), delivers a second snapshot, and reads innerText.
//
//   S1  a golfer's team link on an event with NO notes: no banner, no
//       "Older notes" - the card a golfer sees today (default state).
//   S2  the same link with three notes: the newest on top, "2 earlier from the
//       organizer", the tap opens them; a NEW note delivered live replaces the
//       banner. Then a group link on an individual event shows it too.
//   O1  the owner: the Announcements door on the board, the tool behind it,
//       the counts, the templates, Send writes the note then calls
//       sendAnnouncement with {code, id}, the history shows pushed as a bell.
//   O2  a signed-out visitor on the same event: no door, no tool.
//
//   EVENT_TOOLS_SHOTS=1 also writes 390x844 @2x screenshots to
//   ~/Desktop/claude-mailbox-shared/tournaments/screens-event-tools/.
//
// WHAT THIS CANNOT PROVE: the rules (tournament_e1_rules_emulator_test.js), the
// real callable and FCM (tournament_e1_announce_server_test.js), and the lock
// screen notification E1b (an iOS surface; the payload is pinned in the server
// test).
//
// Skipped when Chrome is not installed.
//
// BASELINE (final file, branch event-e1e3; measured in an exported copy of
// cf86caf8, whose pages have no banner, no door and no tool, with this file
// copied in): all 5 tests: 1 PASS / 4 FAIL. Pass: S1 (the default card has no
// banner - true before and after; it guards the default state). Fail: S2, O1,
// O1b, O2 (O2: no door exists in the tree to be hidden).
// Against the finished pages: all 5 tests: 5 PASS / 0 FAIL.
// Code negative controls (8, saved copy + sha + RESTORED-OK): 7 caught, 1 inert
// BY DESIGN - removing renderEventTools() from the gate leaves the door drawn
// by showTab (the owner reaches the board by a tab tap), a second wire.
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
const at = (h, m) => new Date(2026, 10, 21, h, m, 0).getTime();
const WEATHER = 'Lightning in the area. Horn sounded: stop play, mark your ball, head to the clubhouse.';
const NOTES = {
    a1: { text: 'Range is open, carts at bag drop.', tpl: 'custom', at: at(7, 15), by: 'u-org', pushed: 19 },
    a2: { text: 'Shotgun start at 8:00 AM. Head to your starting hole. Good luck!', tpl: 'start', at: at(8, 1), by: 'u-org', pushed: 22 },
    a3: { text: WEATHER, tpl: 'weather', at: at(10, 42), by: 'u-org', pushed: 22 }
};
const teams = {};
for (let n = 1; n <= 9; n++) teams['team' + n] = { num: n, name: 'Team ' + n, players: ['A' + n + ' Lopez', 'B' + n + ' Kim', 'C' + n + ' Ruiz', 'D' + n + ' Diaz'], handicap: 0, startingHole: n };
const base = {
    name: 'Rattle Classic', format: 'scramble', courseName: 'Papago', activeCourseKey: 'papago',
    courseData: course, entryFee: 0, createdAt: 1, ownerUid: 'u-org',
    eventDate: '2026-11-21', startTime: '08:00', startType: 'shotgun', teams
};
const followers = Object.fromEntries(Array.from({ length: 22 }, (_, i) => ['u' + i, { at: 1, team: 'team1' }]));
const db = {
    tournaments: {
        QUIET1: base,
        NOTES1: Object.assign({}, base, { announcements: NOTES }),
        INDV1: Object.assign({}, base, { format: 'individual', scoringModel: 'player-v1', teams: null, announcements: NOTES,
            players: { p1: { id: 'p1', name: 'Al Lopez', handicap: '12', addedAt: 2 }, p2: { id: 'p2', name: 'Jo Kim', handicap: '8', addedAt: 3 } },
            scoringGroups: { g1: { name: 'Group 1', playerIds: ['p1', 'p2'], startingHole: 4 } } })
    },
    tournamentFollowers: { NOTES1: followers },
    events: {}, trips: {}, global_courses: {}
};
const FN_STUB = `(function () {
  window.__fnCalls = [];
  window.firebase.functions = function () { return { httpsCallable: function (name) { return function (data) {
    var writes = (window.__coldWrites || []).map(function (w) { return w.op + ' ' + w.path; });
    window.__fnCalls.push({ name: name, data: data, writesBefore: writes });
    return Promise.resolve({ data: { pushed: 0 } });
  }; } }; };
})();`;
const BLOCK = ['*firebase-functions-compat.js'];
const txt = (sel) => `((document.querySelector(${JSON.stringify(sel)}) || {}).innerText || '')`;
const VIS = `(sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }`;

async function run(opts) {
    const r = await arriveCold(Object.assign({ settleMs: 5000, blockUrls: BLOCK, preScript: FN_STUB }, opts));
    assert.ok(r.ok, 'the arrival ran: ' + r.reason);
    assert.deepEqual(r.dialogs || [], [], 'no native dialog');
    return { values: (r.value || []).filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v)), raw: r.value };
}

const CARD_PROBE = `(() => { const vis = ${VIS}; return JSON.stringify({ note: vis('#org-note'), head: ${txt('#org-note-head')}, text: ${txt('#org-note-text')},
    older: vis('#older-notes') ? ${txt('#older-notes')} : '', list: vis('#older-list') ? ${txt('#older-list')} : '',
    card: ${txt('#main-content')}, inputs: document.querySelectorAll('#holes-list input').length }); })()`;

test('S1. DEFAULT: a golfer link on an event with no notes shows no banner and no "Older notes" - the card as it was', SKIP, async () => {
    const { values: [v] } = await run({ url: fileUrl('tournament-scorecard.html', 'tourney=QUIET1&team=4'), db, steps: [{ expression: CARD_PROBE }] });
    assert.equal(v.note, false); assert.equal(v.older, '');
    assert.ok(!/from the organizer/i.test(v.card), v.card.slice(0, 200));
    assert.ok(v.inputs === 18 && /Team 4/.test(v.card), 'positive: the card itself rendered (' + v.inputs + ' inputs)');
});

test('S2. three notes: the newest on top, "2 earlier from the organizer" opens the rest, a note delivered live replaces the banner; a group link shows it too', SKIP, async () => {
    const newer = Object.assign({}, NOTES, { a4: { text: 'All clear. Resume play at 11:30 AM from where you stopped.', tpl: 'resume', at: at(11, 5), by: 'u-org' } });
    const { values: [v0, v1, v2], raw } = await run({ url: fileUrl('tournament-scorecard.html', 'tourney=NOTES1&team=4'), db,
        steps: [{ expression: CARD_PROBE }, ...shot('E1a-scorecard-banner.png'), { tap: '#older-notes-link' }, { sleep: 200 }, { expression: CARD_PROBE }, ...shot('E1a-older-notes-open.png'),
            { deliver: { path: 'tournaments/NOTES1', value: Object.assign({}, db.tournaments.NOTES1, { announcements: newer }) } }, { sleep: 300 }, { expression: CARD_PROBE }] });
    assert.ok(v0.note, 'the banner is on screen');
    assert.match(v0.head, /^⚡ FROM THE ORGANIZER · 10:42 AM$/i);
    assert.equal(v0.text, WEATHER);
    assert.equal(v0.older, 'Older notes: 2 earlier from the organizer');
    assert.equal(v0.list, '', 'closed until tapped');
    assert.match(v1.list, /8:01 AM · Shotgun start at 8:00 AM/); assert.match(v1.list, /7:15 AM · Range is open/);
    assert.ok(v1.list.indexOf('8:01') < v1.list.indexOf('7:15'), 'newest first');
    const delivery = raw.find((x) => x && typeof x === 'object' && 'listeners' in x);
    assert.ok(delivery && delivery.listeners > 0 && delivery.threw.length === 0, 'the live delivery reached the page: ' + JSON.stringify(delivery));
    assert.match(v2.head, /^FROM THE ORGANIZER · 11:05 AM$/i, 'no lightning mark on a non-weather note');
    assert.match(v2.text, /^All clear\. Resume play at 11:30 AM/);
    assert.equal(v2.older, 'Older notes: 3 earlier from the organizer');
    assert.ok(!/reply/i.test(v2.card), 'one-way: nothing offers a reply');
    const g = await run({ url: fileUrl('tournament-scorecard.html', 'tourney=INDV1&group=g1'), db, steps: [{ expression: CARD_PROBE }] });
    assert.equal(g.values[0].text, WEATHER, 'a group link shows the banner');
    assert.ok(g.values[0].inputs > 0, 'positive: the group card rendered');
});

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const ORG_PROBE = `(() => { const vis = ${VIS}; return JSON.stringify({ door: vis('#open-announce'), doorInTree: !!document.getElementById('open-announce'), tool: vis('#manage-tab-announce'), board: vis('#manage-tab-leaderboard'),
    bar: ${txt('#hp-brand')}, box: (document.getElementById('ann-text') || {}).value || '', meta: ${txt('#ann-meta')},
    send: !!(document.getElementById('ann-send') || {}).disabled, on: Array.from(document.querySelectorAll('#ann-chips .ann-chip.on')).map((b) => b.innerText),
    sent: vis('#ann-sent') ? ${txt('#ann-sent')} : '', tool_text: ${txt('#manage-tab-announce')},
    writes: (window.__coldWrites || []).filter((w) => /announcements/.test(w.path)).map((w) => ({ op: w.op, path: w.path, value: w.value })),
    calls: (window.__fnCalls || []).map((c) => ({ name: c.name, data: c.data, wroteFirst: c.writesBefore.some((w) => /announcements\\//.test(w)) })) }); })()`;

test('O1. the owner: the door on the board, the tool, the counts, a template, Send writes the note then calls sendAnnouncement; the history shows the bells', SKIP, async () => {
    const { values: [v0, v1, v2, v3, v4] } = await run({ url: fileUrl('tournament.html', 'tourney=NOTES1'), db, auth: OWNER, settleMs: 7000,
        steps: [{ tap: '#tab-btn-leaderboard' }, { sleep: 300 }, { expression: ORG_PROBE },
            { tap: '#open-announce' }, { sleep: 300 }, { expression: ORG_PROBE },
            { tap: '#ann-chips .ann-chip[data-tpl="results"]' }, { sleep: 200 }, { expression: ORG_PROBE },
            { tap: '#ann-chips .ann-chip[data-tpl="weather"]' }, { sleep: 200 }, { expression: ORG_PROBE }, ...shot('E1c-organizer-announce.png'),
            { tap: '#ann-send' }, { sleep: 600 }, { expression: ORG_PROBE }, ...shot('E1c-after-send.png')] });
    assert.ok(v0.door && v0.board && !v0.tool, 'the door is on the owner\'s board: ' + JSON.stringify(v0));
    assert.match(v0.bar, /by Rattle Golf/, 'the bar keeps its company line off the tool');
    assert.ok(v1.tool && !v1.board, 'the tool opened');
    assert.match(v1.bar, /HardPan Tournaments\s*Announcements/);
    assert.match(v1.tool_text, /Send to the field/);
    assert.equal(v1.box, ''); assert.equal(v1.send, true, 'Send is off on an empty box');
    assert.equal(v1.meta, '0 / 200 characters · goes to 36 golfers (22 by notification, all on the scorecard banner)');
    assert.match(v1.sent, /^SENT\s*10:42 AM · Lightning in the area[\s\S]*22 🔔[\s\S]*8:01 AM · Shotgun start at 8:00 AM[\s\S]*7:15 AM · Range is open[\s\S]*19 🔔/i);
    assert.equal(v2.box, 'Results and awards at {time} in the {place}.');
    assert.equal(v2.send, true, 'a blank the template leaves keeps Send off');
    assert.deepEqual(v3.on, ['Weather / lightning']);
    assert.equal(v3.box, WEATHER);
    assert.equal(v3.meta, '86 / 200 characters · goes to 36 golfers (22 by notification, all on the scorecard banner)');
    assert.equal(v3.send, false);
    assert.equal(v4.writes.length, 1, JSON.stringify(v4.writes));
    const w = v4.writes[0];
    assert.match(w.path, /^tournaments\/NOTES1\/announcements\/a[a-z0-9]{6,}$/);
    assert.deepEqual(w.value, { text: WEATHER, tpl: 'weather', at: { '.sv': 'timestamp' }, by: 'u-org' });
    assert.equal(v4.calls.length, 1);
    assert.deepEqual(v4.calls[0].data, { code: 'NOTES1', id: w.path.split('/').pop() });
    assert.equal(v4.calls[0].name, 'sendAnnouncement');
    assert.equal(v4.calls[0].wroteFirst, true, 'the note is written before the push is asked for');
    assert.equal(v4.box, '', 'the box clears after Send');
});

test('O1b. Start time fills the event\'s start time; typing with no template is "custom"', SKIP, async () => {
    const { values: [v0, v1] } = await run({ url: fileUrl('tournament.html', 'tourney=NOTES1'), db, auth: OWNER, settleMs: 7000,
        steps: [{ tap: '#tab-btn-leaderboard' }, { sleep: 200 }, { tap: '#open-announce' }, { sleep: 200 },
            { tap: '#ann-chips .ann-chip[data-tpl="start"]' }, { sleep: 200 }, { expression: ORG_PROBE },
            { tap: '#ann-chips .ann-chip[data-tpl="custom"]' }, { sleep: 200 }, { tap: '#ann-text' }, { cdp: { method: 'Input.insertText', params: { text: 'Lunch at the turn.' } } },
            { tap: '#ann-send' }, { sleep: 500 }, { expression: ORG_PROBE }] });
    assert.equal(v0.box, 'Shotgun start at 8:00 AM. Head to your starting hole. Good luck!');
    assert.equal(v1.writes.length, 1);
    assert.equal(v1.writes[0].value.tpl, 'custom'); assert.equal(v1.writes[0].value.text, 'Lunch at the turn.');
});

test('O2. a signed-out visitor on the same event: no door, no tool, the board as before', SKIP, async () => {
    const { values: [v] } = await run({ url: fileUrl('tournament.html', 'tourney=NOTES1'), db, auth: 'signed-out', settleMs: 7000,
        steps: [{ expression: ORG_PROBE }] });
    assert.ok(!v.door && !v.tool, 'no door and no tool for a visitor: ' + JSON.stringify({ door: v.door, tool: v.tool }));
    assert.ok(v.board, 'positive: the visitor sees the board');
    assert.equal(v.doorInTree, true, 'the door exists in the tree (hidden, not removed)');
});
