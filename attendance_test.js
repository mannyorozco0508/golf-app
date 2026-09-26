// ============================================================================
// ATTENDANCE — Confirm / Can't before tee time.
//
// The headcount is events/<code>/attendance/<playerId>, a sibling of the roster.
// A round with no such node — every round saved before this — is "nobody has
// answered", not "everyone is out".
//
// THE ENTRY. index.html?game=CODE is the link a golfer already opens. This file
// fires the page's own value listener and then reads the card. It does not call
// renderAttendance. admin.html?game=CODE is how the organizer reopens a round;
// the card is painted by that arrival, not by a test calling showSetupAttendance.
// trip.html?trip=CODE loads the day and the page's own round read fills the line.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = makeCourseData(18);
const NAMES = ['Marty', 'Manny', 'Lance', 'Zach', 'Dee', 'Fay', 'Gus', 'Hal'];

function golfers(n, names) {
    const src = names || NAMES;
    return Array.from({ length: n }, (_, i) => ({
        id: 101 + i, name: src[i], hcp: '10', playingForMoney: true
    }));
}

function monday(extra) {
    return Object.assign({
        eventName: 'Monday', courseName: 'Caledonia', gameFormat: 'stroke',
        players: golfers(4), courseData: CD, scores: {}, settlementMode: 'whole-dollar',
        ownerUid: 'anon-org'
    }, extra || {});
}

function arriveScorecard(data, search) {
    const sb = loadHtmlInlineScript('index.html', [], { search: search || '?game=ATT1' });
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/ATT1');
    assert.ok(h, 'the scorecard did not register its round listener');
    h.cb({ val: () => JSON.parse(JSON.stringify(data)), exists: () => true });
    return sb;
}

const panel = sb => sb.document.getElementById('attendance-mount').innerHTML;
// innerHTML keeps the apostrophe as &#39;. The sentence the golfer reads is the
// decoded one; matching the raw entity would pass a card that never said it.
function plain(html) {
    return String(html || '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function waitFor(fn, ms) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        (function tick() {
            let ok = false;
            try { ok = fn(); } catch (e) { ok = false; }
            if (ok) return resolve();
            if (Date.now() - start > (ms || 800)) return reject(new Error('timed out'));
            setTimeout(tick, 15);
        })();
    });
}

describe('THE BUILDER', () => {
    const A = loadJsFile('attendance.js', ['text-safe.js']);
    const four = golfers(4);

    test('a round with no attendance node is entirely unanswered', () => {
        const s = A.summarizeAttendance(four, undefined);
        assert.equal(s.playing, 0);
        assert.equal(s.out, 0);
        assert.equal(s.waiting, 4);
        assert.equal(A.attendanceCountLine(s), "4 haven't answered");
        assert.ok(s.rows.every(r => r.status === 'open'));
    });

    test('the count is the rows, and a stale id or a Maybe does not count', () => {
        const s = A.summarizeAttendance(four, {
            '101': { status: 'in', at: 1 },
            '102': { status: 'out', at: 2 },
            '103': { status: 'maybe', at: 3 },
            '999': { status: 'in', at: 4 }
        });
        assert.equal(s.playing, 1);
        assert.equal(s.out, 1);
        assert.equal(s.waiting, 2);
        assert.equal(s.playing, s.rows.filter(r => r.status === 'in').length);
        assert.equal(s.out, s.rows.filter(r => r.status === 'out').length);
        assert.equal(A.attendanceCountLine(s), "1 confirmed \u00B7 1 can't make it \u00B7 2 haven't answered");
        assert.ok(!s.rows.some(r => r.id === '999'));
    });

    test('a bad record is not a write, and the path is the player id under the round', () => {
        assert.equal(A.attendanceRecord('maybe', 1), null);
        assert.equal(A.attendanceRecord('in', 0), null);
        const rec = A.attendanceRecord('out', 5);
        assert.equal(rec.status, 'out');
        assert.equal(rec.at, 5);
        assert.equal(A.attendanceWritePath('ATT1', 101), 'events/ATT1/attendance/101');
        assert.equal(A.attendanceWritePath('ATT1', 'Marty'), null);
        assert.equal(A.attendanceWritePath('', '101'), null);
    });

    test('a hostile name is escaped, and the button carries the id only', () => {
        const html = A.attendancePanelHtml(
            [{ id: 101, name: 'Bob <the Hammer>' }, { id: 102, name: "Mike & Dave" }],
            null,
            { heading: "Who's playing" });
        assert.match(html, /att-panel/);
        assert.match(html, /Bob &lt;the Hammer&gt;/);
        assert.ok(!html.includes('<the Hammer>'));
        assert.match(html, /Mike &amp; Dave/);
        assert.match(html, /onclick="confirmAttendance\('101','in'\)"/);
        assert.ok(!/onclick="confirmAttendance\('[^']*< /.test(html));
        assert.match(plain(html), /2 haven't answered/);
        assert.ok(!/att-on/.test(html), 'nobody has answered, so no button is pressed');
    });
});

describe('THE SCORECARD DOES NOT ASK (UI Wave 9)', () => {

    // WHY IT WENT. On a bare link with eight golfers the panel measured 504x342 at
    // y=824 with SIXTEEN buttons on it, sitting directly above the hole view, which
    // did not start until y=1334; the first score input was at y=1414. On a group
    // link it was 319x342 with eight buttons. It read as an unfilled form beside
    // score entry, and it asked a question that is already answered by the time a
    // golfer is looking at a scorecard: they are standing on the tee.
    //
    // THE FEATURE IS NOT GONE. attendance.js stays, and so do the organizer's two
    // surfaces and the Road Trip day line - the four blocks below this one still
    // pass unchanged, which is the positive half of this wave: the removal took the
    // scorecard panel and nothing else. What changes is WHO writes: after this wave
    // the organizer marks people from setup, and a golfer no longer self-confirms.
    //
    // THE PLAYERS SHEET IS A DIFFERENT THING and is asserted here so a future sweep
    // for the word "attendance" cannot take it too. Its Out box writes
    // players[i].out on the ROSTER and clears playingForMoney; attendance writes
    // events/<code>/attendance/<id> = { status, at }. Two separate ideas that both
    // happen to say "out".

    test('the panel, its note and its renderer are gone from the scorecard', () => {
        const src = read('index.html');
        assert.ok(!/id="attendance-mount"/.test(src), 'the panel mount is still on the scorecard');
        assert.ok(!/id="attendance-note"/.test(src), 'the panel\'s error line is still on the scorecard');
        assert.ok(!/function renderAttendance/.test(src), 'renderAttendance is still defined');
        assert.ok(!/renderAttendance\(\)/.test(src), 'something still calls renderAttendance');
        assert.ok(!/function confirmAttendance/.test(src), 'confirmAttendance is still defined');
        assert.ok(!/function sayAttendance/.test(src), 'sayAttendance is still defined');
    });

    test('the scorecard no longer loads attendance.js, and nothing on it calls in', () => {
        const src = read('index.html');
        assert.ok(!/<script src="attendance\.js"><\/script>/.test(src),
            'index.html still loads attendance.js for a panel it no longer has');
        // Every function the module exports, checked by name against the page with
        // comments stripped - a leftover caller would throw at runtime now that the
        // script tag is gone, and a typeof guard would hide it instead.
        const code = src.replace(/<!--[\s\S]*?-->/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
        ['attendancePanelHtml', 'commitAttendance', 'applyLocalAttendance', 'attendanceWriteError',
         'summarizeAttendance', 'attendanceCountLine', 'attendanceChoiceButtons',
         'attendanceStatusWord', 'attendancePlayerId', 'watchAttendance'].forEach(fn =>
            assert.ok(!new RegExp('\\b' + fn + '\\s*\\(').test(code),
                'index.html still calls ' + fn + ', and no longer loads the file that defines it'));
    });

    test('a golfer arrives, the panel is gone, and the page still paints its widgets', () => {
        // THE BEHAVIOURAL HALF, AS FAR AS THIS HARNESS CAN TAKE IT. A source scan
        // cannot tell a removed panel from a page that stopped rendering, so this
        // arrives the way a golfer does and fires the page's own listener.
        //
        // WHAT mini-dom CANNOT PROVE, said plainly rather than faked: the hole view
        // renders NOTHING here - #hole-view-container is 0 characters on arrival,
        // measured, before and after this wave - so "score entry still works" is not
        // a claim this file can make. It is made in Chrome, in
        // scorecard_attendance_removed_test.js, where the rects are real.
        // #whoami-mount is a widget mini-dom DOES fill, so it is the positive here.
        //
        // AND WHAT IT CANNOT PROVE EITHER: that the mount is GONE. mini-dom hands
        // back a detached stub for any id that exists nowhere in the tree
        // (helpers/mini-dom.js:295, deliberate, so production code finds its
        // controls), so getElementById('attendance-mount') is never null here - it
        // was not null before this wave and it is not null after. Asserting on it
        // would have been a test that could never pass, which is worse than one that
        // can never fail. The DOM-absence claim is made in Chrome; here the proof is
        // that NOTHING FILLS IT, which is a real difference the stub does show.
        const sb = arriveScorecard(monday());
        const mount = sb.document.getElementById('attendance-mount');
        assert.equal(String((mount && mount.innerHTML) || ''), '',
            'something still paints an attendance panel on the scorecard');
        const who = String(sb.document.getElementById('whoami-mount').innerHTML || '');
        assert.ok(who.length > 100, 'the page painted no widgets at all: ' + who.length);
        assert.match(who, /Marty/, 'the golfers are not on the page');
        assert.equal(sb.__dbWrites.filter(w => /attendance/.test(w.path)).length, 0,
            'something still writes attendance from the scorecard');
    });

    test('a group link still scopes to its own four - the panel was not what did that', () => {
        const sb = arriveScorecard(monday({ players: golfers(8) }), '?game=ATT1&group=1');
        const who = String(sb.document.getElementById('whoami-mount').innerHTML || '');
        assert.match(who, /Marty/, 'group 1 is not on its own link');
        assert.ok(!/\bDee\b/.test(who), 'a group-1 link is showing group 2: ' + who);
    });

    test('the Players sheet is untouched, and it is a different thing entirely', () => {
        const src = read('index.html');
        // POSITIVE, and the reason this block is not just six negatives: the sheet a
        // golfer actually uses to edit names, handicaps and flights is still here.
        assert.match(src, /id="players-sheet"/, 'the Players sheet is gone');
        assert.match(src, /id="players-sheet-save"/, 'the sheet cannot be saved');
        assert.match(src, /class="ps-out-box"/, 'the sheet lost its Out box');
        assert.match(src, /p\.out = true/, 'the Out box no longer writes the roster flag');
        // And it is roster truth, not the RSVP: no attendance path anywhere near it.
        // Sliced from the renderer to the money refresher - the whole sheet, and
        // endpoints that exist rather than ones I assumed: my first attempt named a
        // buildPlayersSheetDraft that this page has never had, and a slice that
        // truncates to nothing satisfies the negative below it forever.
        const from = src.indexOf('function renderPlayersSheet');
        const to = src.indexOf('function psRefreshMoney', from);
        assert.ok(from > -1 && to > from, 'the Players sheet renderer is gone');
        const sheet = src.slice(from, to);
        assert.ok(sheet.length > 500, 'the sheet could not be sliced: ' + sheet.length);
        assert.match(sheet, /ps-out-box/, 'the slice does not contain the sheet');
        assert.ok(!/attendance/i.test(sheet), 'the Players sheet now reads attendance');
    });
});

describe('AND THE ORGANIZER\'S CARD DOES NOT DESCRIBE A SURFACE THAT IS GONE', () => {

    // WRITTEN BECAUSE A CONTROL WAS INERT. UI Wave 9's fourth negative control put
    // the old sentence back - "Golfers confirm from the scorecard link. You can mark
    // someone here too" - and NOTHING in the suite noticed. The scorecard no longer
    // asks, so the first half of that is false, and a confident wrong sentence about
    // where to tap is the exact defect CLAUDE.md records twice: the trip money card
    // that made a group pay twice, and the QR called "read-only" that was fully
    // writable. Copy that describes behaviour IS behaviour, so it is tested here
    // rather than left to whoever reads the diff.
    //
    // It asserts the SHAPE of the claim, not one wording: the note may not send
    // anybody to the scorecard to confirm, and it must still say something, because
    // an empty note would satisfy every negative in here.

    test('the setup card does not send a golfer to the scorecard to confirm', () => {
        const src = read('admin.html');
        const at = src.indexOf('function paintSetupAttendance');
        assert.ok(at > -1, 'the setup card renderer is gone - this test guards nothing');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 200, 'the renderer could not be sliced: ' + fn.length);
        // POSITIVE FIRST: there is a heading and a note, so the negatives below are
        // not being satisfied by an empty string.
        const note = (fn.match(/note:\s*'([^']+)'/) || [])[1];
        assert.ok(note && note.length > 20, 'the setup card has no note: ' + note);
        assert.match(fn, /heading:\s*"Who's playing"/, 'the setup card lost its heading');
        // THE CLAIM. No pointing at the scorecard, and no "golfers confirm".
        assert.ok(!/scorecard/i.test(note),
            'the setup note still points at the scorecard, which no longer asks: "' + note + '"');
        assert.ok(!/golfers confirm/i.test(note),
            'the setup note still says golfers confirm, and they have no surface to do '
            + 'it on: "' + note + '"');
    });

    test('and neither does the guide', () => {
        // instructions.html is the one page that describes every other page, and its
        // card said the same thing. Same shape of assertion, same reason.
        const card = (read('instructions.html')
            .match(/Who is playing<\/div>\s*<div class="i-desc">([\s\S]*?)<\/div>/) || [])[1];
        assert.ok(card && card.length > 80, 'the guide lost its who-is-playing card: ' + card);
        assert.ok(!/confirm themselves from the scorecard/i.test(card),
            'the guide still says golfers confirm from the scorecard link: "' + card + '"');
        assert.ok(!/from the scorecard link/i.test(card),
            'the guide still points at the scorecard link: "' + card + '"');
    });
});

describe('THE ORGANIZER, reopening the round', () => {
    function admin(search, data) {
        const code = (search.match(/game=([^&]+)/) || [])[1].toUpperCase();
        return loadHtmlInlineScript('admin.html', [], {
            search: search,
            beforeRun(sb) {
                if (data) sb.__dbReads = { ['events/' + code]: JSON.parse(JSON.stringify(data)) };
            }
        });
    }

    test('an existing round shows the unanswered count on arrival', async () => {
        const sb = admin('?game=ATT1', monday({ ownerUid: 'anon-stub' }));
        await waitFor(() => /4 haven't answered/.test(plain(sb.document.getElementById('setup-attendance').innerHTML)));
        const html = sb.document.getElementById('setup-attendance').innerHTML;
        assert.equal(sb.document.getElementById('setup-attendance').style.display, 'block');
        assert.match(html, /att-panel/);
        assert.match(html, /Marty/);
        assert.match(html, /onclick="confirmAttendance\('102','out'\)"/);
        sb.confirmAttendance('102', 'out');
        await new Promise(r => setTimeout(r, 0));
        const w = sb.__dbWrites.filter(x => x.path === 'events/ATT1/attendance/102');
        assert.equal(w.length, 1, JSON.stringify(sb.__dbWrites.map(x => x.path)));
        assert.equal(w[0].value.status, 'out');
        assert.match(plain(sb.document.getElementById('setup-attendance').innerHTML), /1 can't make it/);
    });

    test('a golfer who is not the organizer does not get the setup card', async () => {
        const sb = admin('?game=ATT1', monday({ ownerUid: 'someone-else', organizerToken: 'secret' }));
        await waitFor(() => sb.document.getElementById('setup-refused-screen').style.display === 'block');
        assert.equal(sb.document.getElementById('setup-attendance').innerHTML, '');
    });

    test('a brand-new code, nothing saved, shows no headcount', async () => {
        const sb = admin('?game=NEW1', null);
        await new Promise(r => setTimeout(r, 80));
        assert.equal(sb.document.getElementById('setup-attendance').innerHTML, '');
    });

    test('Round Ready, after the save lands, states the count from the round it just read', async () => {
        const sb = admin('?game=ATT1', monday({ ownerUid: 'anon-stub' }));
        await waitFor(() => /4 haven't answered/.test(plain(sb.document.getElementById('setup-attendance').innerHTML)));
        sb.showRoundReadyScreen('ATT1');
        await waitFor(() => /4 haven't answered/.test(sb.document.getElementById('rr-attendance-count').textContent || ''));
        const list = sb.document.getElementById('rr-players-list').innerHTML;
        assert.match(list, /Marty/);
        assert.match(list, /No answer yet/);
        assert.match(list, /onclick="confirmAttendance\('101','in'\)"/);
    });
});

describe('A ROAD TRIP DAY', () => {
    test('the round card says the headcount once the page has loaded the round', async () => {
        const sb = loadHtmlInlineScript('trip.html', [], {
            search: '?trip=beach',
            beforeRun(sandbox) {
                sandbox.__dbReads = {
                    'events/DAY1': monday({
                        attendance: { '101': { status: 'in', at: 1 } }
                    })
                };
            }
        });
        const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'trips/BEACH');
        assert.ok(h, 'trip.html did not listen for the trip');
        h.cb({
            val: () => ({ name: 'Myrtle', rounds: { DAY1: { label: 'Monday', addedAt: 1, countsTowardTrip: true } } }),
            exists: () => true
        });
        await waitFor(() => /rc-attendance/.test(sb.document.getElementById('rounds-list').innerHTML));
        const html = sb.document.getElementById('rounds-list').innerHTML;
        assert.match(html, /1 confirmed/);
        assert.match(html, /3 haven/);
        assert.match(html, /Monday/);
    });
});
