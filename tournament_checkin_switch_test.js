'use strict';
// THE CHECK-IN SWITCH: what a device on main sees while the check-in rules are
// a candidate (merge of the Nov 14 batch, Advisor relay ADVISOR-20261114-1851:
// "anything that needs an approval not given yet must be OFF/hidden on live").
//
// Both pages ship `const CHECKIN_LIVE = false;`. Off, a golfer who opens the
// table QR's address sees the ordinary board, the organizer's Desk shows no QR
// card, no Arrived / Not arrived chips or tiles and no Mark arrived, the TV on
// ?checkin=1 is the leaderboard it always was, and nothing ever writes
// arrivedAt. The feature itself is tournament_checkin_test.js, which runs with
// the switch flipped on; S5 and S6 here flip it the same way, so the off-state
// assertions above are proven to be about the switch and not about a missing
// screen.
//
// HOW EACH TEST ARRIVES: the URL a person opens (?tourney=CODE&checkin=1, the
// organizer's ?tourney=CODE and a Desk-tab tap, tournament-tv.html?...&checkin=1)
// with the page's own database listeners fed the record. No page function is
// called to reach a screen; S3's last line calls markArrived on purpose and says so.
//
// What mini-dom cannot prove: layout, and it does not parse a static style
// attribute. "Not shown" here is style.display as the page sets it (#checkin-card)
// or, for #checkin-screen, the static display:none in the markup plus the page
// never setting display on it (openCheckin sets block; S5 sees that).
//
// BASELINE against preview-batch 5033e24b (tournament.html blob f2129e07…, no switch),
// with this file and helpers/load-script.js copied in: 6 tests - 0 pass / 6 fail
// (S1 no switch line; S2-S4 the check-in screens show; S5-S6 the flip finds no
// line and throws). On preview-batch after the switch: 6 tests - 6 pass / 0 fail.

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'tournament.html';
const TV = 'tournament-tv.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const HTML = read(PAGE);
const TVHTML = read(TV);
const CODE = 'STK26';
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const SWITCH_OFF = 'const CHECKIN_LIVE = false;';
const SWITCH_ON = 'const CHECKIN_LIVE = true;';
// 2026-11-15 (local-checkin-flip, after Manny's go and the combined rules candidate): the page SHIPS the switch ON. S2-S4 now flip it
// OFF by transform (the control that the switch still gates everything); S5-S6 run the page as shipped.
function flipOff(code) {
    const off = code.replace(SWITCH_ON, SWITCH_OFF);
    if (off === code) throw new Error('the page has no "' + SWITCH_ON + '" line to flip');
    return off;
}

// A small individual event: one group of four, three approved, one arrived.
function fixture() {
    const names = ['Ana Diaz', 'Joe Fox', 'Sam Ortiz', 'Mia Chen'];
    const players = {}, regs = {}, index = {};
    const group = { name: 'Group 1', startingHole: '1', playerIds: [], createdAt: 1 };
    names.forEach((n, i) => {
        const pid = 'p0' + (i + 1), eid = 'e0' + (i + 1);
        players[pid] = { id: pid, name: n, handicap: '10', addedAt: i + 1 };
        group.playerIds.push(pid);
        regs[eid] = { fullName: n, email: n.toLowerCase().replace(/ /g, '.') + '@example.com', phone: '602555100' + i, createdAt: 1000 + i, approvedAt: 2000 + i, playerId: pid, paid: i !== 2 };
        if (i === 0) { regs[eid].arrivedAt = Date.now() - 600000; regs[eid].arrivedBy = 'golfer'; }
        index[eid] = { name: n, playerId: pid };
    });
    const rec = { name: 'Starkey Cup', eventModel: 'round-v1', scoringModel: 'player-v1', format: 'individual', ownerUid: 'u-org',
        eventDate: '2026-11-22', courseName: 'Papago Golf Course', courseData: [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 })),
        startType: 'shotgun', startTime: '08:00', entryFee: 85, entryFeePer: 'golfer',
        players, scoringGroups: { g1: group }, checkin: index, createdAt: 1 };
    return { rec, regs };
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const fire = (sb, re, val) => {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(val), exists: () => val !== null && val !== undefined }));
};
const el = (sb, id) => sb.document.getElementById(id);
const shown = (sb, id) => ((el(sb, id).style || {}).display || '') !== 'none';
const html = (sb, id) => String(el(sb, id).innerHTML || '');
function onclickOf(markup, pick) {
    const tags = markup.match(/<(button|a|input|span)\b[^>]*>/g) || [];
    const tag = tags.find(pick);
    if (!tag) return null;
    const m = /\bonclick="([^"]*)"/.exec(tag);
    return m ? m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : null;
}
function tap(sb, markup, pick) {
    const code = onclickOf(markup, pick);
    assert.ok(code, 'nothing to tap in that markup');
    sb.__tapEl = {};
    vm.runInContext('(function () { ' + code + ' }).call(__tapEl)', sb);
}
const byId = (id) => (tag) => new RegExp('\\bid="' + id + '"').test(tag);

function arriveTable(f, opts) {
    const sb = loadHtmlInlineScript(PAGE, [], Object.assign({ search: '?tourney=' + CODE + '&checkin=1', beforeRun(s) { s.__dbReads = {}; } }, opts || {}));
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), f.rec);
    return sb;
}
function arriveOwnerDesk(f, opts) {
    const sb = loadHtmlInlineScript(PAGE, [], Object.assign({ search: '?tourney=' + CODE }, opts || {}));
    sb.__auth.setUser(ORGANIZER);
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), f.rec);
    fire(sb, new RegExp('^registrations/' + CODE + '$'), f.regs);
    tap(sb, HTML, byId('tab-btn-desk'));
    return sb;
}
function arriveTv(f, opts) {
    const sb = loadHtmlInlineScript(TV, [], Object.assign({ search: '?tourney=' + CODE + '&checkin=1', beforeRun(s) { s.setInterval = () => 0; } }, opts || {}));
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), f.rec);
    return sb;
}

describe('THE CHECK-IN SWITCH FLIPPED OFF BY TRANSFORM (the control: the switch still gates every check-in screen)', () => {
    test('S1 SOURCE: each page declares the switch ON exactly once (and never off), and the two entry points read it', () => {
        assert.equal(HTML.split(SWITCH_ON).length - 1, 1, 'tournament.html: one switch line');
        assert.equal(TVHTML.split(SWITCH_ON).length - 1, 1, 'tournament-tv.html: one switch line');
        assert.equal(HTML.split(SWITCH_OFF).length - 1, 0); assert.equal(TVHTML.split(SWITCH_OFF).length - 1, 0);
        assert.match(HTML, /tourneyParam && CHECKIN_LIVE && urlParams\.get\('checkin'\) === '1'/, 'the router asks the switch first');
        assert.match(TVHTML, /const CHECKIN = CHECKIN_LIVE && params\.get\('checkin'\) === '1';/, 'the TV asks the switch first');
        // Positive: the feature is behind the switch, not removed.
        assert.match(HTML, /function openCheckin\(code\)/);
        assert.match(TVHTML, /function startCheckin\(\)/);
        assert.match(HTML, /const on = CHECKIN_LIVE && !!\(currentCode && registrationAllowed\(\)\);/, 'the Desk QR card asks it');
        assert.match(HTML, /if \(!CHECKIN_LIVE \|\| !regInField\(e\)\) return '';/, 'the row control asks it');
    });

    test('S2 the table QR address, ?tourney=CODE&checkin=1, opens the ordinary board: no check-in screen, no arrival listeners', () => {
        const sb = arriveTable(fixture(), { transform: flipOff });
        // mini-dom does not parse the static style="display:none;" on #checkin-screen,
        // so the hidden state is the markup (asserted in source) plus "the page never
        // set display on it" - openCheckin is what sets it to block (S5 sees that).
        assert.match(HTML, /id="checkin-screen" style="display:none;"/);
        assert.equal((el(sb, 'checkin-screen').style || {}).display || '', '', 'the page never touched #checkin-screen');
        assert.equal(el(sb, 'ci-title').textContent, '');
        assert.equal(html(sb, 'ci-list'), '');
        assert.ok(!sb.__dbHandlers.some((h) => /^registrations\//.test(h.path)), 'the board reads no registrations');
        // Positive: the board path ran - the page listens on the record as the board does.
        assert.ok(sb.__dbHandlers.some((h) => h.event === 'value' && h.path === 'tournaments/' + CODE));
        assert.equal(sb.__dbWrites.filter((w) => /arrived/.test(w.path + JSON.stringify(w.value))).length, 0);
    });

    test('S3 the organizer\'s Desk: no QR card, no Arrived chips or tiles, no Mark arrived; the roster itself is there', () => {
        const sb = arriveOwnerDesk(fixture(), { transform: flipOff });
        assert.equal(shown(sb, 'manage-tab-desk'), true, 'positive: the Desk opened');
        assert.equal(shown(sb, 'checkin-card'), false);
        assert.equal(html(sb, 'checkin-tiles'), '');
        assert.doesNotMatch(html(sb, 'registration-chips'), /Arrived/);
        assert.match(html(sb, 'registration-chips'), /Unpaid/, 'positive: the money chips drew');
        const list = html(sb, 'registration-list');
        assert.match(list, /Ana Diaz/, 'positive: the roster drew');
        assert.doesNotMatch(list, /Mark arrived|markArrived|Undo arrival|Not arrived|reg-state-arrived/);
        // Belt: even a stale call into the arrival writer writes nothing while the switch is off.
        // (This line calls a page function on purpose; everything above arrived through the page.)
        const before = sb.__dbWrites.length;
        sb.markArrived('e02');
        assert.equal(sb.__dbWrites.length, before, 'markArrived wrote nothing');
    });

    test('S4 the TV on ?checkin=1 is the leaderboard it always was', () => {
        const sb = arriveTv(fixture(), { transform: flipOff });
        assert.equal(el(sb, 'tv-name').textContent, 'Starkey Cup');
        assert.ok(!/ci-side|Check in here/.test(html(sb, 'tv-main') + el(sb, 'tv-name').textContent));
        assert.match(html(sb, 'tv-board'), /Waiting for first scores/, 'positive: the board drew');
        assert.ok(!sb.__dbHandlers.some((h) => /^registrations\//.test(h.path)), 'the leaderboard TV reads no registrations');
    });
});

describe('THE PAGE AS SHIPPED, SWITCH ON: the check-in screens appear', () => {
    test('S5 table page and TV: the check-in screens appear', () => {
        const f = fixture();
        const sb = arriveTable(f);
        assert.equal((el(sb, 'checkin-screen').style || {}).display, 'block', 'openCheckin ran and showed the screen');
        assert.equal(el(sb, 'ci-title').textContent, 'Starkey Cup · Check in');
        const tv = arriveTv(f);
        assert.equal(el(tv, 'tv-name').textContent, 'Starkey Cup · Check in here');
    });

    test('S6 the Desk: QR card, Arrived and Not arrived chips, Mark arrived on a row', () => {
        const sb = arriveOwnerDesk(fixture());
        assert.equal(shown(sb, 'checkin-card'), true);
        assert.match(html(sb, 'registration-chips'), /Arrived \d+<\/button><button[^>]*>Not arrived \d+</);
        assert.notEqual(html(sb, 'checkin-tiles'), '');
        assert.match(html(sb, 'registration-list'), /Mark arrived/);
    });
});
