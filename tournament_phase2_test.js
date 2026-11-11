// PHASE 2, ORGANIZER SETUP IN THE APP (Manny's picks 2026-11-11: S1 A, S2 A +
// C's move sheet, S3 A shotgun / B tee times + C's QR), reached the way an
// organizer reaches it: arrive cold at tournament.html (?app=1 is the app's
// switch, as on the scorecard) signed in as the owner, touch nothing, then tap
// real elements (tools/lib/cold-arrival.js). No page function is called; the
// checks read innerText, visibility and the recorded writes.
//
//  1 app mode, no event, touches nothing: the app bar and "My events" (empty)
//    are there, the hero band is not; the create form has date, start, shotgun
//  2 the website (no ?app=1), touches nothing: hero yes, app bar and My events
//    no; the create form has the same date, start and shotgun boxes
//  3 CREATE: pick a course, name it, date, time, shotgun, one team, tap Save:
//    the page lands on the new event (still in app mode) and its details read
//    the date and time, its start list has the hole input, My events has it
//  4 shotgun event, owner: one start-and-links row a team, the hole input, a
//    stubbed share sheet receives the team's keyed link on Send; Send all shown
//  5 tee-time event with teeTimes {07:30, every 10}: 7:30, 7:40, 7:50 AM down
//    the list, the tee boxes shown, the shotgun box hidden; changing "every"
//    writes tournaments/<code>/teeTimes/every
//  6 MOVE: tap a golfer chip on a team with no scores: the sheet lists the other
//    teams (full ones disabled), tap one: ONE update moves the name across
//  7 a team with scores: the sheet offers nothing and says why
//  8 a golfer (not the owner), app mode: the app bar, no Setup, no chips
//  9 money = base: payouts.js, tournament-engine.js, handicap.js are
//    origin/main 97698412 byte for byte
//
// Baseline against main 97698412 (before the build): all 9 tests: 1 PASS / 8 FAIL.
// The 1 is test 9 (the money files are main's on both sides).
// With the build: all 9 tests: 9 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const KEY4 = 'k4-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const KEYS = { SCR: { on: true, t: { team4: KEY4, team5: 'k5-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } } };
const PARS = [4, 4, 4, 4, 5, 4, 4, 3, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];
// az_papago is the directory's own id for this course (course-data.js), so the
// picker row finds this card under the shared list's key.
const PAPAGO = { az_papago: { name: 'Papago Golf Club', data: PARS.map((par, i) => ({ hole: i + 1, par, hcpIndex: i + 1 })) } };

const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var rows = Array.prototype.slice.call(document.querySelectorAll('#start-links-list .sl-row'));
  return { app: document.body.classList.contains('app-mode'), hero: shown($('.tourney-hero')), barSetup: shown($('#ap-top-setup')), barManage: shown($('#ap-top-manage')),
    myEvents: shown($('#app-my-events')), myEventsText: t('#app-my-events'), date: shown($('#t-date')), time: shown($('#t-time')), shotgun: shown($('#t-shotgun')),
    setupScreen: shown($('#setup-screen')), manageScreen: shown($('#manage-screen')), tabSetup: shown($('#tab-btn-setup')), title: t('#ap-m-title'), details: t('#manage-t-details'),
    rows: rows.length, whens: rows.map(function (r) { var i = r.querySelector('input'); return i ? 'input:' + i.value : (r.querySelector('.sl-tee') || {}).innerText; }),
    teeBox: shown($('#tee-times-box')), shotgunBox: shown($('#shotgun-assignments-box')), sendAll: shown($('#send-all-links-btn')),
    chips: Array.prototype.filter.call(document.querySelectorAll('#team-cards-list .golfer-chip'), shown).length, sheet: shown($('#move-sheet')), sheetTitle: t('#move-sheet-title'), sheetBody: t('#move-sheet-body'),
    moveTo: Array.prototype.map.call(document.querySelectorAll('#move-sheet .move-to'), function (b) { return (b.dataset.to || '') + (b.disabled ? ':off' : ''); }),
    shared: window.__shared || null, writes: (window.__coldWrites || []).map(function (w) { return { op: w.op, path: w.path, value: w.value }; }) };
})())` };
const STUB_SHARE = { expression: `(function () { navigator.share = function (d) { window.__shared = d; return Promise.resolve(); }; return 'stubbed'; })()` };
const go = async (db, query, auth, steps, settleMs) => {
    const r = await arriveCold({ url: fileUrl('tournament.html', query), db, auth, settleMs: settleMs || 2500, steps: steps || [READ] });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};
const empty = () => ({ tournaments: {}, events: {}, trips: {}, global_courses: PAPAGO });
const owned = (extra) => Object.assign(F.scrambleDb(Object.assign({ ownerUid: 'u-org' }, extra || {})), { tournamentKeys: KEYS });

test('1 app mode, no event, touches nothing: app bar + My events, no hero; date, start, shotgun on the form', async () => {
    const [a] = await go(empty(), 'app=1', OWNER);
    assert.equal(a.app, true);
    assert.equal(a.setupScreen, true, 'the create form (positive)');
    assert.equal(a.hero, false, 'the hero band is the website\'s');
    assert.equal(a.barSetup, true);
    assert.equal(a.myEvents, true);
    assert.match(a.myEventsText, /^MY EVENTS No events on this phone yet\./);
    assert.deepEqual([a.date, a.time, a.shotgun], [true, true, true]);
});

test('2 the website, touches nothing: hero, no app bar, no My events; the same boxes', async () => {
    const [a] = await go(empty(), '', OWNER);
    assert.equal(a.app, false);
    assert.equal(a.hero, true);
    assert.equal(a.barSetup, false);
    assert.equal(a.myEvents, false);
    assert.deepEqual([a.date, a.time, a.shotgun], [true, true, true]);
});

test('3 create: course, name, date, time, shotgun, one team, Save: lands on the event, still in app mode, with its details', async () => {
    // THE STAND-IN DATABASE LIVES IN THE DOCUMENT, so the record Save writes
    // would be gone the moment the page moves to the new event. This preScript
    // (injected into every document after the stand-in, before any page
    // script) carries the writes across: it stores them at pagehide and
    // replays them into the next document's stand-in before the page reads.
    // The page itself is untouched; nothing it defines is called.
    const CARRY = `(function () {
        try {
            var saved = JSON.parse(sessionStorage.getItem('__p2w') || '[]');
            saved.forEach(function (x) { var r = firebase.database().ref(x.path); if (x.op === 'set') r.set(x.value); else if (x.op === 'update') r.update(x.value); });
            window.__coldWrites = [];
            window.addEventListener('pagehide', function () {
                try { sessionStorage.setItem('__p2w', JSON.stringify(saved.concat(window.__coldWrites || []))); } catch (e) {}
            });
        } catch (e) {}
    })();`;
    const FILL = { expression: `(function () {
        document.getElementById('t-name').value = 'Hope Foundation Scramble';
        document.getElementById('t-date').value = '2026-11-21';
        document.getElementById('t-time').value = '08:00';
        var p = document.querySelector('#teams-list .team-card .team-name-inputs input'); if (!p) return 'no team input';
        p.value = 'Al Lopez'; return 'filled';
    })()` };
    const CARRIED = { expression: `(function () { try { return JSON.stringify({ carried: JSON.parse(sessionStorage.getItem('__p2w') || '[]'), search: location.search }); } catch (e) { return 'no storage'; } })()` };
    const steps = [
        { tap: '#course-search-input' }, { cdp: { method: 'Input.insertText', params: { text: 'pap' } } }, { sleep: 250 },
        { tap: '#course-dropdown .custom-select-option' }, { sleep: 300 },
        FILL, { tap: '#t-shotgun' }, { sleep: 100 },
        { tap: 'button.btn-primary[onclick^="saveTournament"]' }, { sleep: 3500 }, READ, CARRIED,
    ];
    const r = await arriveCold({ url: fileUrl('tournament.html', 'app=1'), db: empty(), auth: OWNER, settleMs: 3000, preScript: CARRY, steps });
    assert.ok(r.ok, r.reason);
    assert.ok(r.value.includes('filled'), JSON.stringify(r.value.slice(0, 8)));
    const objs = r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    const a = objs[0], c = objs[1];
    assert.match(c.search, /^\?tourney=[A-Z2-9]{6}&app=1$/, 'moved to the new event, ?app=1 kept: ' + c.search);
    const create = c.carried.find((w) => w.op === 'update' && w.path === '' && Object.keys(w.value).some((k) => /^tournaments\/[A-Z2-9]{6}$/.test(k)));
    assert.ok(create, 'the creating write was carried: ' + JSON.stringify(c.carried.map((w) => w.path)));
    const rec = create.value[Object.keys(create.value).find((k) => /^tournaments\//.test(k))];
    assert.equal(rec.name, 'Hope Foundation Scramble');
    assert.equal(rec.eventDate, '2026-11-21');
    assert.equal(rec.startTime, '08:00');
    assert.equal(rec.startType, 'shotgun');
    assert.equal(rec.courseName, 'Papago Golf Club');
    assert.deepEqual(rec.teams.team1.players, ['Al Lopez']);
    assert.equal(a.manageScreen, true, 'the page shows the new event');
    assert.equal(a.app, true);
    assert.equal(a.barManage, true);
    assert.equal(a.title, 'Hope Foundation Scramble');
    // Re-pinned 2026-11-11 (Manny): the venue auto-fills from the picked course, so the details line carries it.
    assert.equal(a.details, 'Sat, Nov 21, 2026 \u2022 8:00 AM Papago Golf Club');
    assert.equal(a.rows, 1, 'one team, one start row');
    assert.deepEqual(a.whens, ['input:'], 'shotgun: a hole input, not yet assigned');
    assert.equal(a.shotgunBox, true);
});

test('4 shotgun event: one row a team with its hole; Send hands the share sheet the keyed link; Send all shown', async () => {
    const [a] = await go(owned(), 'app=1&tourney=SCR', OWNER, [STUB_SHARE, { tap: '.sl-row[data-team="4"] .sl-send' }, { sleep: 200 }, READ]);
    assert.equal(a.manageScreen, true);
    assert.equal(a.rows, 18);
    assert.ok(a.whens.includes('input:4'), 'Team 4 starts on 4: ' + JSON.stringify(a.whens.slice(0, 6)));
    assert.equal(a.teeBox, false);
    assert.equal(a.sendAll, true);
    assert.ok(a.shared && a.shared.url, 'the share sheet got a link');
    assert.match(a.shared.url, /tournament-scorecard\.html\?tourney=SCR&team=4&k=k4-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$/);
    assert.equal(a.shared.title, 'Team 4 — scorecard');
});

test('5 tee times: first tee + every 10 down the list; "every" change writes teeTimes/every', async () => {
    const db = owned({ teeTimes: { first: '07:30', every: 10 } });
    delete db.tournaments.SCR.startType;
    const SET_EVERY = { expression: `(function () { var e = document.getElementById('tee-every'); e.value = '15'; e.dispatchEvent(new Event('change')); return 'changed'; })()` };
    const [a] = await go(db, 'app=1&tourney=SCR', OWNER, [SET_EVERY, { sleep: 150 }, READ]);
    assert.equal(a.teeBox, true);
    assert.equal(a.shotgunBox, false);
    assert.deepEqual(a.whens.slice(0, 3), ['7:30 AM', '7:40 AM', '7:50 AM']);
    assert.equal(a.rows, 18);
    const w = a.writes.find((x) => x.path === 'tournaments/SCR/teeTimes/every');
    assert.deepEqual(w && { op: w.op, value: w.value }, { op: 'set', value: 15 });
});

test('6 move: a chip on a team with no scores opens the sheet; tapping a team writes one update with both rosters', async () => {
    const db = owned({ scores: {} });
    const [a, b] = await go(db, 'app=1&tourney=SCR', OWNER, [{ tap: '.golfer-chip[data-team="4"][data-idx="1"]' }, { sleep: 200 }, READ, { tap: '#move-sheet .move-to[data-to="5"]' }, { sleep: 200 }, READ]);
    assert.equal(a.chips, 21, '17 one-golfer teams + Team 4\'s four');
    assert.equal(a.sheet, true);
    assert.equal(a.sheetTitle, 'Move Jo Kim to…');
    assert.ok(a.moveTo.includes('5') && a.moveTo.includes('new'), JSON.stringify(a.moveTo));
    assert.ok(!a.moveTo.includes('4'), 'not its own team');
    assert.match(a.sheetBody, /Check both team handicaps after the move\./);
    assert.equal(b.sheet, false, 'the sheet closed');
    const upd = b.writes.filter((x) => x.op === 'update' && x.path === '');
    assert.equal(upd.length, 1, 'one multi-path update');
    assert.deepEqual(upd[0].value, {
        'tournaments/SCR/teams/team5/players': ['P5', 'Jo Kim'],
        'tournaments/SCR/teams/team4/players': ['Al Lopez', 'Ed Ruiz', 'Bo Diaz'],
    });
});

test('7 a team with scores: the sheet offers nothing and says why', async () => {
    const [a] = await go(owned(), 'app=1&tourney=SCR', OWNER, [{ tap: '.golfer-chip[data-team="4"][data-idx="0"]' }, { sleep: 200 }, READ]);
    assert.equal(a.sheet, true);
    assert.deepEqual(a.moveTo, []);
    assert.match(a.sheetBody, /Team 4 has scores, so its golfers stay put\./);
    assert.equal(a.writes.filter((x) => x.op === 'update').length, 0, 'nothing written');
});

test('8 a golfer (not the owner) in app mode: the app bar, no Setup tab, no chips', async () => {
    const [a] = await go(owned(), 'app=1&tourney=SCR', { uid: 'u-golfer', isAnonymous: true });
    assert.equal(a.manageScreen, true, 'the board loaded (positive)');
    assert.equal(a.barManage, true);
    assert.equal(a.title, 'Saturday Scramble');
    assert.equal(a.tabSetup, false);
    assert.equal(a.chips, 0);
});

test('9 money = base: the engines are origin/main 97698412 byte for byte', () => {
    // By sha, not git diff, so the same file gives the same answer in a bare
    // copy of the tree (the baseline run) as in the repo.
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
