// ============================================================================
// CHECK-IN (CI-FINAL mockups, approved 2026-11-14) - the golfer's table page,
// the Desk's arrival state, the clubhouse TV check-in board.
//
// HOW EACH TEST ARRIVES. Through the URL a person opens - ?tourney=CODE&checkin=1
// (the table QR), ?tourney=CODE (the organizer, then a TAP on the Desk tab),
// tournament-tv.html?tourney=CODE&checkin=1 - with the page's OWN database
// listeners fired with a record, and TAPS: the onclick text of the element a
// person touches, read from the static markup or from the markup the page
// rendered, run with `this` bound. No test names a render or sync function the
// page defines. Every screen's first test is its DEFAULT state: nothing typed,
// nothing tapped.
//
// WHAT mini-dom CANNOT PROVE, said plainly: innerHTML is a string (a rendered
// button is found by its markup, not as a node), there is no layout (a shown
// element may still be 0x0, a TV grid may overflow), static attributes are not
// parsed, and a listener's error callback is never fired by the stub (so the
// "arrivals cannot be read" branch is not reached here). Those were measured in
// headless Chrome through tools/lib/cold-arrival.js - cold arrival, the page's
// own init, real taps - and photographed: claude-mailbox-shared/tournaments/
// build-ci/after-*.png.
//
// THE RULES ARE NOT IN THIS FILE: tournament_checkin_rules_test.js holds the
// candidate (unpublished). Until it is published every arrival write below is
// refused by the live database; these tests prove what the PAGE asks for.
//
// BASELINE (CLAUDE.md "a count comes from the FINAL run of the FINAL file"):
//   against main e1312cf2 (tournament.html sha256 fad16256 1b8f4db8..., the
//   page swapped in by cp with tournament-tv.html cbaca51e..., restored by
//   sha): 18 tests - 2 pass / 16 fail. The 2 that pass are B7 (a visitor's
//   board shows no arrival control) and C3 (the TV without ?checkin=1 is the
//   leaderboard it was) - both true of a page with no check-in at all; they
//   are guards that must STAY green.
//   on preview-ci after the build: 18 tests - 18 pass / 0 fail.
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

// THE SWITCH (merge to main, 2026-11-14): both pages ship `const CHECKIN_LIVE =
// false;` until the rules candidate is published, so a live device shows no
// check-in at all. These tests are about the feature, so every page here loads
// with the switch flipped ON (a source rewrite before the script runs);
// tournament_checkin_switch_test.js pins what a device sees while it is off.
const SWITCH_OFF = 'const CHECKIN_LIVE = false;';
function flipOn(code) {
    const on = code.replace(SWITCH_OFF, 'const CHECKIN_LIVE = true;');
    if (on === code) throw new Error('the page has no "' + SWITCH_OFF + '" line to flip');
    return on;
}
const loadLive = (page, deps, opts) => loadHtmlInlineScript(page, deps, Object.assign({ transform: flipOn }, opts || {}));

const PAGE = 'tournament.html';
const TV = 'tournament-tv.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const HTML = read(PAGE);
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const CODE = 'STK26';
const clone = (o) => JSON.parse(JSON.stringify(o));
function settle() { return Promise.resolve().then(() => new Promise((r) => setImmediate(r))); }

// ---- THE FIXTURE: the mockups' sample names, eight groups of four, two
// flights, shotgun 8:00, $85 a golfer, three unpaid, 22 arrived. -------------
const GROUPS = [
    ['A', 1, ['Ana Diaz', 'Joe Fox', 'Sam Ortiz', 'Mia Chen']],
    ['A', 3, ['Dana Ruiz', 'Lee Park', 'Kim Vo', 'Al Lopez']],
    ['A', 5, ['Ray Diaz', 'Jo Park', 'Tom Reyes', 'Eva Lin']],
    ['A', 7, ['Ben Cruz', 'Liz Moore', 'Nick Hall', 'Rosa Vega']],
    ['B', 9, ['Matt Cole', 'Amy Shaw', 'Dan Ito', 'Pat Webb']],
    ['B', 11, ['Gus Kerr', 'Ivy Tran', 'Ken Wolfe', 'Sue Gray']],
    ['B', 13, ['Carl Ames', 'Vic Soto', 'Max Bell', 'Tia Ford']],
    ['B', 15, ['Hal Young', 'Zoe King', 'Ross Day', 'Nina Cho']]
];
const ARRIVED = { 'Ana Diaz': '7:22', 'Joe Fox': '7:25', 'Sam Ortiz': '7:31', 'Mia Chen': '7:40', 'Lee Park': '7:28', 'Kim Vo': '7:39', 'Al Lopez': '7:12',
    'Ray Diaz': '7:41', 'Jo Park': '7:35', 'Eva Lin': '7:30', 'Ben Cruz': '7:18', 'Liz Moore': '7:20', 'Nick Hall': '7:33', 'Rosa Vega': '7:36',
    'Matt Cole': '7:27', 'Pat Webb': '7:29', 'Gus Kerr': '7:15', 'Ivy Tran': '7:37', 'Ken Wolfe': '7:38', 'Tia Ford': '7:34', 'Hal Young': '7:24', 'Ross Day': '7:32' };
const UNPAID = ['Kim Vo', 'Amy Shaw', 'Vic Soto'];
const ms = (hm) => { const [h, m] = hm.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
function fixture(opts) {
    opts = opts || {};
    const arrived = Object.assign({}, ARRIVED); (opts.notArrived || []).forEach((n) => delete arrived[n]);
    const players = {}, groups = {}, regs = {}, index = {}, ids = {};
    let k = 0;
    GROUPS.forEach(([fl, hole, names], gi) => {
        const gid = 'g' + (gi + 1);
        groups[gid] = { name: 'Group ' + (gi + 1), startingHole: String(hole), playerIds: [], createdAt: gi + 1 };
        names.forEach((n) => {
            k++;
            const pid = 'p' + String(k).padStart(2, '0'), eid = 'e' + String(k).padStart(2, '0');
            ids[n] = eid;
            players[pid] = { id: pid, name: n, handicap: '10', flightId: 'f' + fl, addedAt: k };
            groups[gid].playerIds.push(pid);
            const r = { fullName: n, email: n.toLowerCase().replace(/ /g, '.') + '@example.com', phone: '602555' + String(1000 + k), createdAt: 1000 + k, approvedAt: 2000 + k, playerId: pid };
            if (UNPAID.indexOf(n) === -1) { r.paid = true; r.paidAt = 3000 + k; }
            if (arrived[n]) { r.arrivedAt = ms(arrived[n]); r.arrivedBy = n === 'Lee Park' ? 'organizer' : 'golfer'; }
            regs[eid] = r;
            index[eid] = { name: n, playerId: pid };
        });
    });
    const rec = { name: 'Starkey Cup', eventModel: 'round-v1', scoringModel: 'player-v1', format: 'individual', ownerUid: 'u-org',
        eventDate: '2026-11-22', courseName: 'Papago Golf Course', courseData: [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 })),
        startType: 'shotgun', startTime: '08:00', entryFee: 85, entryFeePer: 'golfer',
        flights: { fA: { id: 'fA', name: 'Flight A', createdAt: 1 }, fB: { id: 'fB', name: 'Flight B', createdAt: 2 } },
        players, scoringGroups: groups, createdAt: 1 };
    if (opts.index !== false) rec.checkin = index;
    return { rec, regs, ids };
}

// ---- TAPS AND LISTENERS (the stripe guard's helpers, same contract) -------
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
const fire = (sb, re, val) => {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(val), exists: () => val !== null && val !== undefined }));
};
const el = (sb, id) => sb.document.getElementById(id);
const shown = (sb, id) => ((el(sb, id).style || {}).display || '') !== 'none';
const html = (sb, id) => String(el(sb, id).innerHTML || '');
const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

// The table page: arrive on the QR's URL (an anonymous visitor, the default),
// the record lands, then each arrival the page asked for.
function arriveTable(f, opts) {
    opts = opts || {};
    const sb = loadLive(PAGE, [], { search: '?tourney=' + CODE + '&checkin=1', beforeRun(s) { s.__dbReads = Object.assign({}, opts.reads || {}); } });
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), f.rec);
    sb.__dbHandlers.filter((h) => /^registrations\/STK26\/[^/]+\/arrivedAt$/.test(h.path)).forEach((h) => {
        const id = h.path.split('/')[2];
        const v = f.regs[id] && f.regs[id].arrivedAt;
        h.cb({ val: () => (v === undefined ? null : v), exists: () => v !== undefined });
    });
    return sb;
}
function rowOf(markup, id) {
    const at = markup.indexOf('data-entry-id="' + id + '"');
    assert.ok(at !== -1, 'row ' + id + ' rendered');
    const next = markup.indexOf('data-entry-id="', at + 10);
    return markup.slice(at, next === -1 ? undefined : next);
}

describe('A. THE TABLE PAGE, ?tourney=CODE&checkin=1 (a golfer with the phone camera)', () => {
    test('A1 DEFAULT, nothing typed: the name list by flight and group, starting holes, "21 of 32 checked in", full groups folded, I\'m here only beside golfers not in, no money word, nothing written', () => {
        const f = fixture({ notArrived: ['Ray Diaz'] });
        const sb = arriveTable(f);
        assert.equal(shown(sb, 'checkin-screen'), true, 'the check-in screen is shown');
        assert.equal(shown(sb, 'manage-screen'), false, 'the console is not');
        assert.equal(el(sb, 'ci-title').textContent, 'Starkey Cup · Check in');
        assert.equal(el(sb, 'ci-sub').textContent, 'Papago Golf Course · Shotgun 8:00 AM');
        assert.match(el(sb, 'ci-count').textContent, /Tap I'm here beside your own name\. 21 of 32 checked in\./);
        const list = html(sb, 'ci-list');
        assert.match(plain(list), /Flight A Group 1 · Hole 1 · all 4 checked in ✓ Group 2 · Hole 3 3 of 4 in Dana Ruiz I'm here Lee Park Checked in 7:28/);
        assert.match(plain(list), /Flight B .*Group 7 · Hole 13 1 of 4 in Carl Ames I'm here/);
        assert.ok(!/Ana Diaz/.test(list), 'a full group is folded to one line');
        assert.match(rowOf(list, f.ids['Ray Diaz']), /onclick="checkInHere\('e09'\)"[^>]*>I'm here</);
        assert.ok(!/<button/.test(rowOf(list, f.ids['Lee Park'])), 'no button beside a golfer already in');
        assert.equal((list.match(/class="btn-primary ci-here"/g) || []).length, 11, 'one button for each of the eleven golfers still to come');
        assert.ok(!/\$|paid|unpaid|Pay\b/i.test(plain(list) + el(sb, 'ci-count').textContent), 'no money on the list');
        assert.equal(sb.__dbWrites.length, 0, 'arriving writes nothing');
        assert.ok(!sb.__dbHandlers.some((h) => h.path === 'registrations/' + CODE), 'never asks for the whole signup list');
        assert.ok(!sb.__dbHandlers.some((h) => /\/(email|phone|fullName|paid)$/.test(h.path)), 'listens to arrivedAt only');
    });

    test('A2 tapping I\'m here writes arrivedAt + arrivedBy golfer on that one entry and nothing else, then "You\'re checked in, Ray" with group, hole, shotgun time and the group\'s state', async () => {
        const f = fixture({ notArrived: ['Ray Diaz'] });
        const sb = arriveTable(f, { reads: { ['registrations/' + CODE + '/e09/paid']: true } });
        tap(sb, rowOf(html(sb, 'ci-list'), 'e09'), (t) => /ci-here/.test(t));
        await settle();
        assert.equal(sb.__dbWrites.length, 1, 'one write');
        const w = sb.__dbWrites[0];
        assert.equal(w.path, 'registrations/' + CODE + '/e09');
        assert.equal(w.op, 'update');
        assert.deepEqual(Object.keys(w.value).sort(), ['arrivedAt', 'arrivedBy']);
        assert.equal(w.value.arrivedBy, 'golfer');
        assert.ok(typeof w.value.arrivedAt === 'number' && w.value.arrivedAt > 0);
        assert.equal(shown(sb, 'ci-done'), true); assert.equal(shown(sb, 'ci-pick'), false);
        const done = plain(html(sb, 'ci-done'));
        assert.match(done, /You're checked in, Ray Group 3 · starts on hole 5 · shotgun 8:00 AM Checked in \d{1,2}:\d{2} · Flight A/);
        assert.match(done, /Your group Ray Diaz \(you\) Checked in \d{1,2}:\d{2} Jo Park Checked in 7:35 Tom Reyes Not here yet Eva Lin Checked in 7:30/);
        assert.match(done, /Tapped the wrong name\? Tell the desk; they can undo it\. Done/);
        assert.ok(!/unpaid/i.test(done), 'a paid golfer sees no unpaid line');
        assert.ok(!/<button[^>]*onclick="[^"]*(Pay|pay|checkout|Checkout)/.test(html(sb, 'ci-done')), 'no payment action');
    });

    test('A3 an entry that reads unpaid gets the amber line with the fee, and still no payment action', async () => {
        const f = fixture();
        const sb = arriveTable(f);   // no paid in the reads: the entry reads unpaid
        tap(sb, rowOf(html(sb, 'ci-list'), f.ids['Amy Shaw']), (t) => /ci-here/.test(t));
        await settle();
        const done = html(sb, 'ci-done');
        assert.match(plain(done), /You're checked in, Amy/);
        assert.match(done, /<div class="ci-unpaid" id="ci-unpaid">Your \$85 entry shows unpaid\. Please see the desk\.<\/div>/);
        assert.deepEqual((done.match(/onclick="([^"]*)"/g) || []), ['onclick="checkinDone()"'], 'the only control is Done');
    });

    test('A4 a refused write (the rules today) says so and shows no confirmation', async () => {
        const f = fixture({ notArrived: ['Ray Diaz'] });
        const sb = arriveTable(f);
        sb.__dbRefuse = () => Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' });
        tap(sb, rowOf(html(sb, 'ci-list'), 'e09'), (t) => /ci-here/.test(t));
        await settle();
        assert.equal(el(sb, 'ci-msg').textContent, 'That did not go through. Please check in at the desk.');
        assert.equal(shown(sb, 'ci-msg'), true);
        assert.notEqual(shown(sb, 'ci-done'), true, 'no "checked in" after a refusal');
        assert.match(html(sb, 'ci-list'), /checkInHere\('e09'\)/, 'Ray still has his button');
    });

    test('A5 typing a name filters the list (a folded group opens for a match); a miss says so', () => {
        const f = fixture({ notArrived: ['Ray Diaz'] });
        const sb = arriveTable(f);
        el(sb, 'ci-search').value = 'ray d';
        assert.equal(typeof el(sb, 'ci-search').oninput, 'function', 'the box is wired');
        el(sb, 'ci-search').oninput();
        const list = plain(html(sb, 'ci-list'));
        assert.match(list, /^Flight A Group 3 · Hole 5 2 of 4 in Ray Diaz I'm here$/);
        el(sb, 'ci-search').value = 'ana';
        el(sb, 'ci-search').oninput();
        assert.match(plain(html(sb, 'ci-list')), /Group 1 · Hole 1 4 of 4 in Ana Diaz Checked in 7:22/, 'a folded group opens when searched');
        el(sb, 'ci-search').value = 'zzz';
        el(sb, 'ci-search').oninput();
        assert.equal(plain(html(sb, 'ci-list')), 'No name matches. Check the spelling, or see the desk.');
    });

    test('A6 Done goes back to the name list, the golfer now shown as checked in', async () => {
        const f = fixture({ notArrived: ['Ray Diaz'] });
        const sb = arriveTable(f, { reads: { ['registrations/' + CODE + '/e09/paid']: true } });
        tap(sb, rowOf(html(sb, 'ci-list'), 'e09'), (t) => /ci-here/.test(t));
        await settle();
        tap(sb, html(sb, 'ci-done'), byId('ci-done-btn'));
        assert.equal(shown(sb, 'ci-pick'), true); assert.equal(shown(sb, 'ci-done'), false);
        assert.match(el(sb, 'ci-count').textContent, /22 of 32 checked in/);
        assert.match(plain(rowOf(html(sb, 'ci-list'), 'e09')), /Ray Diaz Checked in/);
    });

    test('A7 an event whose Desk has not listed anyone yet says so instead of an empty page', () => {
        const sb = arriveTable(fixture({ index: false }));
        assert.equal(plain(html(sb, 'ci-list')), 'No names to check in yet. Please see the desk.');
        assert.equal(el(sb, 'ci-count').textContent, '');
    });
});

// The organizer: ?tourney=CODE signed in, the record, then the signup list.
function arriveOwner(f, opts) {
    opts = opts || {};
    const sb = loadLive(PAGE, [], { search: '?tourney=' + CODE });
    sb.__auth.setUser(ORGANIZER);
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), f.rec);
    if (opts.regs !== false) fire(sb, new RegExp('^registrations/' + CODE + '$'), f.regs);
    return sb;
}
const deskTab = (sb) => tap(sb, HTML, byId('tab-btn-desk'));

describe('B. THE DESK (the organizer, a tap on the Desk tab)', () => {
    test('B1 DEFAULT: three tiles 22 arrived / 10 not arrived / 3 unpaid $85, Arrived and Not arrived chips beside today\'s, each row\'s arrival and its one control, the table QR card', () => {
        const f = fixture();
        const sb = arriveOwner(f);
        deskTab(sb);
        assert.equal(shown(sb, 'manage-tab-desk'), true);
        const counts = html(sb, 'checkin-tiles');
        assert.match(counts, /<b id="ci-tile-arrived">22<\/b><span>arrived<\/span>/);
        assert.match(counts, /<b id="ci-tile-notarrived">10<\/b><span>not arrived<\/span>/);
        assert.match(counts, /<b id="ci-tile-unpaid">3<\/b><span>unpaid · \$85 entry<\/span>/);
        assert.match(plain(html(sb, 'registration-counts')), /^32 signups · 29 paid · 32 in the field/, 'today\'s counts line is still there, first');
        const chips = plain(html(sb, 'registration-chips'));
        assert.equal(chips, 'All 32 Arrived 22 Not arrived 10 Unpaid 3 Paid 29 Approved 32 Not yet approved 0 Photos 0');
        const list = html(sb, 'registration-list');
        assert.match(plain(rowOf(list, f.ids['Lee Park'])), /In the field Arrived 7:28 by the organizer Undo arrival/);
        assert.match(plain(rowOf(list, f.ids['Ray Diaz'])), /Arrived 7:41 at the table Undo arrival/);
        assert.match(plain(rowOf(list, f.ids['Dana Ruiz'])), /In the field Not arrived Mark arrived Correct Remove/);
        assert.match(rowOf(list, f.ids['Kim Vo']), /reg-state-unpaid">Unpaid</, 'the payment badge is still there');
        assert.equal(shown(sb, 'checkin-card'), true, 'the table QR card is shown');
        assert.match(onclickOf(HTML, byId('checkin-print')), /printCheckinQr\(\)/);
        assert.match(String(el(sb, 'checkin-tv').href), /tournament-tv\.html\?tourney=STK26&checkin=1$/);
    });

    test('B2 Mark arrived writes arrivedAt + arrivedBy organizer on that entry, and nothing about money', () => {
        const f = fixture();
        const sb = arriveOwner(f);
        deskTab(sb);
        const before = sb.__dbWrites.length;
        tap(sb, rowOf(html(sb, 'registration-list'), f.ids['Dana Ruiz']), (t) => /ci-mark/.test(t));
        const ws = sb.__dbWrites.slice(before);
        assert.equal(ws.length, 1);
        assert.equal(ws[0].path, 'registrations/' + CODE + '/' + f.ids['Dana Ruiz']);
        assert.deepEqual(Object.keys(ws[0].value).sort(), ['arrivedAt', 'arrivedBy']);
        assert.equal(ws[0].value.arrivedBy, 'organizer');
        assert.ok(ws[0].value.arrivedAt > 0);
    });

    test('B3 Undo arrival removes both keys and nothing else', () => {
        const f = fixture();
        const sb = arriveOwner(f);
        deskTab(sb);
        const before = sb.__dbWrites.length;
        tap(sb, rowOf(html(sb, 'registration-list'), f.ids['Lee Park']), (t) => /ci-undo/.test(t));
        const ws = sb.__dbWrites.slice(before);
        assert.equal(ws.length, 1);
        assert.equal(ws[0].path, 'registrations/' + CODE + '/' + f.ids['Lee Park']);
        assert.deepEqual(clone(ws[0].value), { arrivedAt: null, arrivedBy: null });
    });

    test('B4 the Arrived chip lists the 22, latest arrival first; Not arrived lists the 10', () => {
        const f = fixture();
        const sb = arriveOwner(f);
        deskTab(sb);
        tap(sb, html(sb, 'registration-chips'), (t) => /setRegistrationFilter\('arrived'\)/.test(t));
        const rows = (html(sb, 'registration-list').match(/data-entry-id="(e\d+)"/g) || []).map((s) => s.slice(15, -1));
        assert.equal(rows.length, 22);
        assert.deepEqual(rows.slice(0, 3), [f.ids['Ray Diaz'], f.ids['Mia Chen'], f.ids['Kim Vo']]);
        tap(sb, html(sb, 'registration-chips'), (t) => /setRegistrationFilter\('notarrived'\)/.test(t));
        assert.equal((html(sb, 'registration-list').match(/data-entry-id=/g) || []).length, 10);
        assert.ok(!/Undo arrival/.test(html(sb, 'registration-list')));
    });

    test('B5 the name list the table reads: written with the Desk open once the signups arrive (approved only, name + player id), never before them, never from another tab, and not again when the record already holds it', () => {
        const f = fixture({ index: false });
        f.regs.e99 = { fullName: 'Not Approved', email: 'na@example.com', phone: '6025559999', createdAt: 5000 };
        const sb = arriveOwner(f, { regs: false });
        deskTab(sb);
        assert.ok(!sb.__dbWrites.some((w) => /checkin/.test(w.path)), 'nothing written before the signup list arrives');
        fire(sb, new RegExp('^registrations/' + CODE + '$'), f.regs);
        const ws = sb.__dbWrites.filter((w) => w.path === 'tournaments/' + CODE + '/checkin');
        assert.equal(ws.length, 1, 'one write of the list');
        assert.equal(Object.keys(ws[0].value).length, 32, 'the 32 approved, not the pending one');
        assert.deepEqual(clone(ws[0].value.e09), { name: 'Ray Diaz', playerId: 'p09' });
        assert.ok(!JSON.stringify(ws[0].value).match(/@|602|paid/), 'no email, phone or payment in the public list');
        const g = fixture();
        const sb2 = arriveOwner(g);
        deskTab(sb2);
        assert.ok(!sb2.__dbWrites.some((w) => /checkin/.test(w.path)), 'an index that already matches is not rewritten');
        const h = fixture({ index: false });
        const sb3 = arriveOwner(h);
        assert.ok(!sb3.__dbWrites.some((w) => /checkin/.test(w.path)), 'the organizer on Setup (the Desk not open) writes nothing');
    });

    test('B6 a refused Mark arrived (the rules today) says so under the card', async () => {
        const f = fixture();
        const sb = arriveOwner(f);
        deskTab(sb);
        sb.__dbRefuse = (p) => /^registrations\//.test(p) ? new Error('PERMISSION_DENIED: Permission denied') : null;
        tap(sb, rowOf(html(sb, 'registration-list'), f.ids['Dana Ruiz']), (t) => /ci-mark/.test(t));
        await settle();
        assert.equal(el(sb, 'checkin-desk-msg').textContent, 'Arrival not saved: PERMISSION_DENIED: Permission denied');
        assert.equal(shown(sb, 'checkin-desk-msg'), true);
    });

    test('B7 a visitor on the board link (not the owner) gets no arrival control and no table QR', () => {
        const f = fixture();
        const sb = loadLive(PAGE, [], { search: '?tourney=' + CODE });
        fire(sb, new RegExp('^tournaments/' + CODE + '$'), f.rec);
        assert.ok(!/markArrived|undoArrival/.test(html(sb, 'registration-list')), 'no arrival control');
        assert.notEqual(shown(sb, 'checkin-card') && /markArrived/.test(html(sb, 'registration-list')), true);
        assert.ok(!sb.__dbWrites.some((w) => /arrived|checkin/.test(w.path + JSON.stringify(w.value))), 'nothing written');
    });
});

// The TV: tournament-tv.html?tourney=CODE&checkin=1. Its 15-second clock and
// page timer are real intervals; the realm gets no-op ones so a test can end.
function arriveTv(f, search) {
    const sb = loadLive(TV, [], { search: search || '?tourney=' + CODE + '&checkin=1', beforeRun(s) { s.setInterval = () => 0; } });
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), f.rec);
    sb.__dbHandlers.filter((h) => /^registrations\/STK26\/[^/]+\/arrivedAt$/.test(h.path)).forEach((h) => {
        const v = f.regs[h.path.split('/')[2]].arrivedAt;
        h.cb({ val: () => (v === undefined ? null : v), exists: () => v !== undefined });
    });
    return sb;
}

describe('C. THE TV CHECK-IN BOARD (tournament-tv.html?tourney=CODE&checkin=1)', () => {
    test('C1 DEFAULT: event, course, shotgun time, "22 / 32 arrived · 10 to come", every group by flight with a tick and time or "not yet", All here / n / 4, Just arrived newest first, the table QR address; NO payment anywhere', () => {
        const f = fixture();
        const sb = arriveTv(f);
        assert.equal(el(sb, 'tv-name').textContent, 'Starkey Cup · Check in here');
        assert.equal(el(sb, 'tv-sub').textContent, 'Papago Golf Course · Shotgun 8:00 AM · 32 golfers, 8 groups');
        const main = html(sb, 'tv-main');
        const text = plain(main);
        assert.match(text, /22 \/ 32 arrived · 10 to come/);
        assert.match(text, /tournaments\.rattlegolf\.com\/tournament\?tourney=STK26&checkin=1/);
        assert.match(text, /Flight A Group 1 · Hole 1 All here Ana Diaz ✓7:22 Joe Fox ✓7:25 Sam Ortiz ✓7:31 Mia Chen ✓7:40 Group 2 · Hole 3 3 \/ 4 Dana Ruiz not yet Lee Park ✓7:28/);
        assert.match(text, /Flight B Group 5 · Hole 9 2 \/ 4 Matt Cole ✓7:27 Amy Shaw not yet/);
        assert.match(text, /Group 8 · Hole 15 2 \/ 4 Hal Young ✓7:24 Zoe King not yet Ross Day ✓7:32 Nina Cho not yet/);
        assert.match(text, /Just arrived Ray Diaz 7:41 Mia Chen 7:40 Kim Vo 7:39 Ken Wolfe 7:38 Ivy Tran 7:37$/);
        assert.equal((main.match(/class="ci-g full"/g) || []).length, 2, 'two groups all here');
        assert.ok(!/\$|paid|unpaid|owe/i.test(text + el(sb, 'tv-sub').textContent), 'no payment status on the TV');
        assert.ok(!sb.__dbHandlers.some((h) => /paid|registrations\/STK26$|\/(email|phone|fullName)$/.test(h.path)), 'the TV never listens to payment or contact data');
        assert.equal(sb.__dbWrites.length, 0, 'the TV writes nothing');
    });

    test('C2 one builder: the roster block in tournament.html and tournament-tv.html is byte-identical', () => {
        const block = (src) => {
            const a = src.indexOf('    // CHECKIN-ROSTER-BEGIN'), b = src.indexOf('    // CHECKIN-ROSTER-END');
            assert.ok(a !== -1 && b > a, 'markers present');
            return src.slice(a, b);
        };
        const page = block(HTML), tv = block(read(TV));
        assert.match(page, /function checkinRoster\(data, arrivals\)/, 'positive: the block holds the builder');
        assert.match(page, /function checkinClock\(ms\)/, 'positive: and the clock');
        assert.equal(tv, page, 'the two copies differ - change both, or move the block to a shared file');
    });

    test('C3 without ?checkin=1 the TV is the leaderboard it was (no check-in board)', () => {
        const f = fixture();
        const sb = loadLive(TV, [], { search: '?tourney=' + CODE, beforeRun(s) { s.setInterval = () => 0; } });
        fire(sb, new RegExp('^tournaments/' + CODE + '$'), f.rec);
        assert.equal(el(sb, 'tv-name').textContent, 'Starkey Cup');
        assert.ok(!/ci-side|Check in here/.test(html(sb, 'tv-main') + el(sb, 'tv-name').textContent));
        assert.match(html(sb, 'tv-board'), /Waiting for first scores/, 'positive: the old board drew');
        assert.ok(!sb.__dbHandlers.some((h) => /^registrations\//.test(h.path)), 'the leaderboard TV reads no registrations');
    });
});

describe('D. COPY', () => {
    test('D1 no new string says protected, secure or locked, and no cash prize wording', () => {
        const pick = (src) => {
            const a = src.indexOf('// ===== CHECK-IN'), b = src.indexOf('// ===== E4c: THE RECAP');
            return a !== -1 && b > a ? src.slice(a, b) : src.slice(src.indexOf('// ===== CHECK-IN BOARD'), src.indexOf('    function start() {'));
        };
        const page = pick(HTML), tv = pick(read(TV));
        assert.match(page, /You're checked in/, 'positive: the page block is the check-in code');
        assert.match(tv, /Check in here/, 'positive: the TV block is the check-in code');
        const strings = (s) => (s.match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*\1/g) || []).join(' ');
        for (const s of [strings(page), strings(tv)]) {
            assert.ok(!/\b(protected|secure|locked)\b/i.test(s), 'a forbidden word in a string');
            assert.ok(!/cash prize|prize money|\$\d+ prize/i.test(s), 'cash prize wording');
        }
    });
});
