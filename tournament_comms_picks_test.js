// EVENT COMMS PICKS (Manny 2026-11-11), reached the way a golfer or organizer
// reaches them: arrive cold (tools/lib/cold-arrival.js) at 390x844, touch
// nothing, then tap real elements. No page function is called; the checks read
// innerText, computed visibility and the recorded writes.
//
//  EC1 A + B for Weather
//  1 a weather note is the newest: it takes the screen; the banner is behind it;
//    Got it closes it and the banner stays; a reload does not ask again
//  2 a non-weather note is the newest: no full screen, the banner only
//  EC4 C (the organizer's side)
//  3 owner, 3 photos waiting: Event day says "3 photos to check · Desk", tapping
//    it opens the Desk on its Photos chip with the 3 tiles; the chip reads
//    Photos 3; no Photos tab anywhere
//  EC3 C and EC2 A + C are proven in tournament_e3_chrome_test.js (P1, P2, N2)
//  and tournament_contests_test.js (C1, D3, D3b); the card's after-the-round
//  block in tournament_photos_test.js (P1, P2) and the EXIF check.
//  4 money = base: payouts.js, tournament-engine.js, handicap.js are
//    main 97698412 byte for byte
//
// Baseline against event-tools-picks 4e613fb1 (the merge, before the picks):
// all 4 tests: 2 PASS / 2 FAIL. The 2 are test 2 (a non-weather note never took
// the screen, before or after) and test 4 (the money files are main's on both).
// With the picks: all 4 tests: 4 PASS / 0 FAIL.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 5];
const COURSE = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 }));
const at = (h, m) => new Date(2026, 10, 21, h, m, 0).getTime();
const WEATHER = 'Lightning in the area. Horn sounded: stop play, mark your ball, head to the clubhouse.';
const NOTES = {
    a1: { text: 'Range is open, carts at bag drop.', tpl: 'custom', at: at(7, 15), by: 'u-org', pushed: 19 },
    a2: { text: 'Shotgun start at 8:00 AM. Head to your starting hole. Good luck!', tpl: 'start', at: at(8, 1), by: 'u-org', pushed: 22 },
    a3: { text: WEATHER, tpl: 'weather', at: at(10, 42), by: 'u-org', pushed: 22 }
};
const RESUMED = Object.assign({}, NOTES, { a4: { text: 'All clear. Resume play at 11:30 AM from where you stopped.', tpl: 'resume', at: at(11, 5), by: 'u-org' } });
const teams = {};
for (let n = 1; n <= 9; n++) teams['team' + n] = { num: n, name: 'Team ' + n, players: ['A' + n + ' Lopez', 'B' + n + ' Kim'], handicap: 0, startingHole: n };
const scores = { team4_h4: 4, team4_h5: 5, team9_h9: 4 };
const base = { name: 'Rattle Classic', format: 'scramble', courseName: 'Papago', courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid: 'u-org',
    eventDate: '2026-11-21', startTime: '08:00', startType: 'shotgun', teams, scores };
const PENDING = { '-Pa': { team: 'team4', caption: '7th tee', at: 1, w: 1600, h: 1200 }, '-Pb': { team: 'team9', caption: 'hole 12', at: 2, w: 1600, h: 1200 },
    '-Pc': { team: 'team3', caption: 'clubhouse', at: 3, w: 1200, h: 1600 } };
const db = () => ({
    tournaments: { NOTES1: Object.assign({}, base, { announcements: NOTES }), RESUME1: Object.assign({}, base, { announcements: RESUMED }), PH1: Object.assign({}, base) },
    tournamentPhotoMeta: { PH1: { pending: PENDING, shown: {}, hidden: {}, reports: {} } },
    tournamentKeys: {}, events: {}, trips: {}, global_courses: {}
});
const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const READ = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var shown = function (e) { if (!e) return false; if (getComputedStyle(e).display === 'none') return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return { alert: shown($('#org-alert')), alertText: t('#org-alert'), banner: shown($('#org-note')), bannerText: t('#org-note-text'), inputs: document.querySelectorAll('#holes-list input').length,
    needs: Array.prototype.map.call(document.querySelectorAll('#eh-needs-list .eh-need'), function (b) { return { key: b.dataset.need, text: (b.innerText || '').replace(/\\s+/g, ' ').trim() }; }),
    desk: shown($('#manage-tab-desk')), chips: t('#registration-chips'), queue: shown($('#photo-queue-wrap')), tiles: document.querySelectorAll('#photo-queue .pq-item').length,
    queueTitle: t('#photo-queue-title'), list: shown($('#registration-list')), photosPill: !!document.getElementById('tab-btn-photos'), photosTab: !!document.getElementById('manage-tab-photos') };
})())` };
const go = async (page, query, auth, steps, settleMs) => {
    const r = await arriveCold({ url: fileUrl(page, query), db: db(), auth, settleMs: settleMs || 3000, steps: steps || [READ] });
    assert.ok(r.ok, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
};

test('1 EC1: a weather note newest takes the screen; Got it closes it, the banner stays; a reload does not ask again', async () => {
    const [a, b, c] = await go('tournament-scorecard.html', 'tourney=NOTES1&team=4', 'anonymous',
        [READ, { tap: '#org-alert-ok' }, { sleep: 200 }, READ, { expression: 'location.reload(); "reloaded"' }, { sleep: 3000 }, READ]);
    assert.equal(a.inputs, 18, 'positive: the card rendered');
    assert.equal(a.alert, true, 'the weather note holds the screen');
    assert.match(a.alertText, /^FROM THE ORGANIZER · 10:42 AM ⚡ Stop play Lightning in the area\. Horn sounded: stop play, mark your ball, head to the clubhouse\. Got it$/i);
    assert.equal(a.banner, true, 'the banner is behind it');
    assert.equal(b.alert, false, 'Got it closed it');
    assert.equal(b.bannerText, WEATHER, 'the banner stays');
    assert.equal(c.inputs, 18, 'positive: reloaded');
    assert.equal(c.alert, false, 'remembered on this phone');
    assert.equal(c.bannerText, WEATHER);
});

test('2 EC1: a non-weather note newest: the banner only, no full screen', async () => {
    const [a] = await go('tournament-scorecard.html', 'tourney=RESUME1&team=4', 'anonymous');
    assert.equal(a.inputs, 18);
    assert.equal(a.alert, false);
    assert.equal(a.banner, true);
    assert.match(a.bannerText, /^All clear\. Resume play at 11:30 AM/);
});

test('3 EC4 C, owner: "3 photos to check" on Event day opens the Desk on its Photos chip with the 3 tiles; no Photos tab', async () => {
    const [a, b] = await go('tournament.html', 'tourney=PH1', OWNER,
        [{ tap: '#tab-btn-home' }, { sleep: 300 }, READ, { tap: '#eh-needs-list .eh-need[data-need="photos"]' }, { sleep: 400 }, READ], 4000);
    assert.equal(a.photosPill, false, 'no Photos pill');
    assert.equal(a.photosTab, false, 'no Photos tab');
    const row = a.needs.find((n) => n.key === 'photos');
    assert.equal(row && row.text, '3 3 photos to check Desk');
    assert.equal(b.desk, true, 'the Desk opened');
    assert.equal(b.queue, true, 'on its Photos chip');
    assert.equal(b.list, false, 'the signup list steps aside');
    assert.match(b.chips, /Photos 3/);
    assert.equal(b.queueTitle, 'Photos waiting · 3');
    assert.equal(b.tiles, 3);
});

test('4 money = base: the engines are main 97698412 byte for byte', () => {
    const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex');
    assert.equal(sha('payouts.js'), 'c35e34f571e564c025be2a509b8c0aa8cf165c765edc54a61a21987064a004e8');
    assert.equal(sha('tournament-engine.js'), '1c659c46d0f91ca3dc61beb231e1356ea0a572fd7c3c40399399d36e2ff89f57');
    assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b83a10491e822ece946203d2bbb11264962e7d888a7b450f17');
});
