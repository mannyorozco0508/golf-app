// ============================================================================
// 084 - ROUNDS I'M RUNNING (my-rounds.js) and where it is wired.
//   1 the pointer: name / course / day only - never the organizer token, players or scores
//   2 the window and the order: today, upcoming (soonest first), the last 14 days (newest first)
//   3 this phone's evidence: owner from a History copy, a remembered token is only a yes/no
//   4 which button: Edit setup only for the uid that owns it; Sign in to edit for a link-held round
//   5 the card: 1 row (web) / 3 rows (GPS) + "See all N", today first, no token anywhere in the HTML,
//     signed out = Sign in to edit + how to get the organizer link
//   6 remember(): the exact path, a server timestamp, and a refusal never rejects
//   7 the wiring: admin.html save chain (not returned), the owner's heal on open, trip.html's batch,
//     the shell lists (the app bundle copies only listed files), the Home slots
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const M = require('./my-rounds.js');

const NOW = new Date(2026, 9, 26, 14, 0).getTime();          // Mon Oct 26 2026, 2 PM local
const day = (d) => new Date(2026, 9, d).getTime();
const TOKEN = 'tok_SECRET_084_never_shown';

test('1 the pointer carries name / course / day only - no token, no players, no scores', () => {
    const p = M.pointerFor('TQ7M4K', { eventName: 'Tuesday Skins', courseName: 'Desert Palms GC', createdAt: day(27) + 3600e3,
        organizerToken: TOKEN, ownerUid: 'u1', players: [{ name: 'Test A' }], scores: { p1_h1: 4 } }, { at: 123 });
    assert.deepEqual(p, { at: 123, name: 'Tuesday Skins', course: 'Desert Palms GC', day: day(27) });
    assert.ok(!JSON.stringify(p).includes(TOKEN));
    // a trip's tee date wins over createdAt; "Single Round" is not a name
    const t = M.pointerFor('R8HZ2W', { eventName: 'Single Round', courseName: 'Coyote Ridge', createdAt: day(20) }, { at: 1, day: '2026-10-31' });
    assert.equal(t.name, 'Coyote Ridge'); assert.equal(t.day, day(31));
    assert.equal(M.pointerFor('AB12CD', {}, { at: 1 }).name, 'Round AB12CD');
    assert.equal(M.pointerFor('AB12CD', { eventName: 'x'.repeat(200) }, { at: 1 }).name.length, 80);
});

test('2 window and order: today first, upcoming soonest first, past 14 days newest first, older hidden', () => {
    const ptrs = {
        OLD15A: { at: 1, name: 'Old', day: day(11) },          // 15 days ago - out
        PAST14: { at: 1, name: 'Edge', day: day(12) },         // 14 days ago - in
        PAST01: { at: 1, name: 'Yesterday', day: day(25) },
        TODAY1: { at: 1, name: 'Monday Game', day: day(26) },
        UPC031: { at: 1, name: 'Saturday', day: day(31) },
        UPC027: { at: 1, name: 'Tuesday', day: day(27) },
        bad: { at: 1, name: 'lower-case key ignored', day: day(26) }
    };
    const r = M.rows(ptrs, [], NOW);
    assert.deepEqual(r.map((x) => x.code), ['TODAY1', 'UPC027', 'UPC031', 'PAST01', 'PAST14']);
    assert.deepEqual(r.map((x) => x.when), ['today', 'upcoming', 'upcoming', 'past', 'past']);
    assert.equal(M.dayLabel(day(26), NOW), 'Today');
    assert.equal(M.dayLabel(day(27), NOW), 'Tomorrow');
    assert.equal(M.dayLabel(day(25), NOW), 'Yesterday');
    assert.equal(M.dayLabel(day(31), NOW), 'Sat Oct 31');
});

function store(obj) {
    const keys = Object.keys(obj);
    return { length: keys.length, key: (i) => keys[i], getItem: (k) => (k in obj ? obj[k] : null) };
}

test('3 this phone: owner from History copies, a token is a yes/no (its value never read into a row)', () => {
    const s = store({
        golfapp_snap_v1_TQ7M4K: JSON.stringify({ at: day(26), data: { ownerUid: 'acct', eventName: 'Tuesday Skins', courseName: 'Desert Palms', createdAt: day(26), organizerToken: TOKEN } }),
        golfapp_snap_v1_JOIN01: JSON.stringify({ at: day(25), data: { ownerUid: 'someone-else', courseName: 'Papago' } }),
        'golfapp_snap_v1_L-ABCD': JSON.stringify({ at: day(26), data: { courseName: 'offline' } }),
        golfapp_organizer_LINK01: TOKEN,
        lastRoomCode: 'LAST01',
        unrelated: 'x'
    });
    const ev = M.localEvidence(s);
    assert.ok(!JSON.stringify(ev).includes(TOKEN), 'no token value in the evidence');
    const by = Object.fromEntries(ev.map((r) => [r.code, r]));
    assert.equal(by.TQ7M4K.owner, 'acct'); assert.equal(by.TQ7M4K.name, 'Tuesday Skins');
    assert.equal(by.LINK01.token, true); assert.equal(by.LINK01.needsRead, true);
    assert.equal(by.LAST01.last, true);
    assert.ok(!by['L-ABCD'], 'an offline L- round is not a server round');
});

test('4 which button: Edit setup only for the owning uid; signed out a link-held round asks to sign in', () => {
    const ev = [
        { code: 'MINE01', name: 'Mine', day: day(26), owner: 'acct' },
        { code: 'ANON01', name: 'Anon-made', day: day(26), owner: 'anon-uid' },
        { code: 'LINK01', name: 'By link', day: day(26), owner: 'acct', token: true },
        { code: 'JOIN01', name: 'Joined', day: day(26), owner: 'other' }
    ];
    // signed in as acct: only acct's rounds, all editable; joined + others' not listed
    assert.deepEqual(M.localRows(ev, 'acct', true).map((r) => [r.code, r.editable]), [['MINE01', true], ['LINK01', true]]);
    // signed out (anonymous uid): the anon-made round edits (it saves); a link-held one asks to sign in
    assert.deepEqual(M.localRows(ev, 'anon-uid', false).map((r) => [r.code, r.editable]), [['ANON01', true], ['LINK01', false]]);
    // NEGATIVE: no uid at all lists only link-held rounds, none editable
    assert.deepEqual(M.localRows(ev, null, false).map((r) => [r.code, r.editable]), [['LINK01', false]]);
    // a server pointer makes a row editable even when the phone only had it by link
    const merged = M.rows({ LINK01: { at: 1, name: 'By link', day: day(26) } }, M.localRows(ev, 'x', false), NOW);
    assert.equal(merged.find((r) => r.code === 'LINK01').editable, true);
});

test('5 the card: today first, 1 or 3 rows + See all N, Edit setup href, no token; signed out = sign in + how-to', () => {
    const list = M.rows({
        TODAY1: { at: 1, name: 'Monday Game', course: 'Dobson', day: day(26) },
        UPC027: { at: 1, name: 'Tuesday', day: day(27) },
        UPC031: { at: 1, name: 'Saturday', day: day(31) },
        PAST01: { at: 1, name: 'Sunday', day: day(25) }
    }, [], NOW);
    const web = M.cardHtml({ rows: list, signedIn: true, email: 'manny@example.com' }, { show: 1 });
    assert.equal((web.match(/data-mr-code=/g) || []).length, 1);
    assert.match(web, /data-mr-code="TODAY1"/);
    assert.match(web, /href="admin\.html\?game=TODAY1"[^>]*>Edit setup</);
    assert.match(web, /See all 4/);
    assert.doesNotMatch(web, /Sign in to edit|organizer=|Organizer Link/);
    const gps = M.cardHtml({ rows: list, signedIn: true }, { show: 3 });
    assert.equal((gps.match(/data-mr-code=/g) || []).length, 3);
    const all = M.cardHtml({ rows: list, signedIn: true, expanded: true }, { show: 3 });
    assert.equal((all.match(/data-mr-code=/g) || []).length, 4);
    assert.match(all, /Show fewer/);
    assert.equal(M.cardHtml({ rows: [], signedIn: true }, { show: 3 }), '', 'no rows, no card');
    const out = M.cardHtml({ rows: M.rows({}, [{ code: 'LINK01', name: 'By link', day: day(26), editable: false }], NOW), signedIn: false }, { show: 3 });
    assert.match(out, /data-mr-signin>Sign in to edit</);
    assert.match(out, /How to get the organizer link/);
    assert.match(out, /Round Menu/); assert.match(out, /Group Links/);
    assert.doesNotMatch(out, /admin\.html\?game=LINK01/, 'a link-held round is not an Edit setup link');
    // escaping: a hostile round name stays text
    const x = M.cardHtml({ rows: M.rows({ EVIL01: { at: 1, name: '<img src=x onerror=1>', day: day(26) } }, [], NOW), signedIn: true }, { show: 3 });
    assert.doesNotMatch(x, /<img/);
});

test('6 remember(): organizers/<uid>/rounds/<CODE>, a server timestamp, and a refusal resolves false', async () => {
    const writes = [];
    const fakeDb = (fail) => ({ ref: (p) => ({ set: (v) => { writes.push([p, v]); return fail ? Promise.reject(Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' })) : Promise.resolve(); } }) });
    assert.equal(await M.remember(fakeDb(false), 'acct', 'tq7m4k', { eventName: 'Tuesday Skins', organizerToken: TOKEN }), true);
    assert.equal(writes[0][0], 'organizers/acct/rounds/TQ7M4K');
    assert.ok(!JSON.stringify(writes[0][1]).includes(TOKEN));
    assert.equal(await M.remember(fakeDb(true), 'acct', 'TQ7M4K', {}), false, 'refused (rules not published) -> false, no throw');
    assert.equal(await M.remember(fakeDb(false), null, 'TQ7M4K', {}), false, 'no uid, no write');
    assert.equal(await M.remember(fakeDb(false), 'acct', 'L-ABCD', {}), false, 'an offline code, no write');
    assert.equal(writes.length, 2);
});

test('7 wiring: save chain (not returned), heal on open, trip batch, shell lists, Home slot', () => {
    const admin = read('admin.html');
    assert.match(admin, /<script src="organizer-gate\.js"><\/script>\n[^\n]*\n\s*<script src="my-rounds\.js"><\/script>/);
    const i = admin.indexOf("localStorage.setItem('lastRoomCode', currentMode);");
    const chunk = admin.slice(i, i + 1200);
    assert.match(chunk, /window\.HardPanMyRounds\.remember\(db, mrUid, currentMode, payload\)/);
    assert.doesNotMatch(chunk.slice(0, chunk.indexOf('remember(')), /return\s+window\.HardPanMyRounds/, 'never returned into the save chain');
    assert.match(admin, /mrUid === mrData\.ownerUid\) window\.HardPanMyRounds\.remember/);
    const trip = read('trip.html');
    assert.match(trip, /<script src="my-rounds\.js"><\/script>/);
    assert.match(trip, /window\.HardPanMyRounds\.remember\(db, mrPlanUid, m\[1\], updates\[k\], \{ day: row\.date \}\)/);
    assert.match(read('sync-mobile-web.js'), /'my-rounds\.js',/);
    assert.match(read('sw.js'), /'\.\/my-rounds\.js',/);
    const gps = fs.existsSync(path.join(__dirname, 'home.html'));
    if (gps) {
        const home = read('home.html');
        assert.match(home, /<div id="hs-mine" class="hs-mine" style="display:none;"><\/div>/);
        assert.match(home, /<script src="my-rounds\.js"><\/script>/);
        assert.match(home, /HardPanMyRounds\.mount\(box, \{ db: db, auth: auth[^\n]*show: 3/);
    } else {
        assert.match(admin, /<div id="my-rounds" class="my-rounds" style="display:none;"><\/div>/);
        assert.match(admin, /HardPanMyRounds\.mount\(box, \{[^\n]*show: 1/);
    }
    // the module never reads or prints a token value
    const src = read('my-rounds.js');
    assert.doesNotMatch(src, /organizerToken/);
    assert.doesNotMatch(src, /remember\(env\./, 'Home reads only - it never writes a pointer');
    assert.doesNotMatch(src, /getItem\(k\)\s*[;)]\s*$/m);
});
