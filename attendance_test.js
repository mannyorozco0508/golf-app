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

describe('THE SCORECARD, the way a golfer opens the link', () => {
    test('the markup is on the page', () => {
        const src = read('index.html');
        assert.match(src, /id="attendance-mount"/);
        assert.match(src, /<script src="attendance\.js"><\/script>/);
        assert.match(src, /renderAttendance\(\)/);
    });

    test('touching nothing: four golfers, no answers, Confirm and Can\'t on each name', () => {
        const sb = arriveScorecard(monday());
        const html = panel(sb);
        const text = plain(html);
        assert.match(html, /att-count/);
        assert.match(text, /4 haven't answered/);
        assert.match(text, /Who's playing/);
        assert.match(html, /data-att-id="101"/);
        assert.match(html, /Marty/);
        assert.match(html, />Confirm</);
        assert.match(html, />Can't</);
        assert.match(html, /No answer yet/);
        assert.ok(!/att-on/.test(html));
        assert.equal(sb.__dbWrites.filter(w => /attendance/.test(w.path)).length, 0);
    });

    test('a group link confirms its four, not the rest of the field', () => {
        const sb = arriveScorecard(monday({ players: golfers(8) }), '?game=ATT1&group=1');
        const html = panel(sb);
        const text = plain(html);
        assert.match(html, /Your group/);
        assert.match(text, /4 haven't answered/);
        assert.match(html, /data-att-id="101"/);
        assert.match(html, /data-att-id="104"/);
        assert.ok(!/data-att-id="105"/.test(html), html);
        assert.ok(!/>Dee</.test(html));
    });

    test('the listener paints a later answer without anyone calling the renderer', () => {
        const sb = arriveScorecard(monday());
        const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/ATT1');
        const next = monday({
            attendance: {
                '101': { status: 'in', at: 10 },
                '102': { status: 'out', at: 11 }
            }
        });
        h.cb({ val: () => JSON.parse(JSON.stringify(next)), exists: () => true });
        const html = panel(sb);
        const text = plain(html);
        assert.match(text, /1 confirmed/);
        assert.match(text, /1 can't make it/);
        assert.match(text, /2 haven't answered/);
        assert.match(html, /data-att-id="101"[\s\S]*att-on/);
        assert.match(text, /Confirmed/);
        assert.match(text, /Can't make it/);
    });

    test('Confirm writes only that golfer\'s attendance node', async () => {
        const sb = arriveScorecard(monday());
        const html = panel(sb);
        assert.match(html, /onclick="confirmAttendance\('101','in'\)"/);
        sb.confirmAttendance('101', 'in');
        await new Promise(r => setTimeout(r, 0));
        const w = sb.__dbWrites.filter(x => x.path === 'events/ATT1/attendance/101');
        assert.equal(w.length, 1, JSON.stringify(sb.__dbWrites));
        assert.equal(w[0].op, 'set');
        assert.equal(w[0].value.status, 'in');
        assert.ok(w[0].value.at > 0);
        assert.equal(Object.keys(w[0].value).sort().join(','), 'at,status');
        assert.match(panel(sb), /1 confirmed/);
        assert.match(panel(sb), /data-att-id="101"[\s\S]*att-on/);
        assert.equal(sb.__dbWrites.filter(x => x.path === 'events/ATT1').length, 0, 'the round itself was not rewritten');
    });

    test('a refused confirm says so and does not show the golfer as confirmed', async () => {
        const sb = arriveScorecard(monday());
        sb.__dbRefuse = () => Object.assign(new Error('PERMISSION_DENIED: attendance'), { code: 'PERMISSION_DENIED' });
        sb.confirmAttendance('101', 'in');
        await new Promise(r => setTimeout(r, 0));
        assert.match(sb.document.getElementById('attendance-note').textContent, /Ask the organizer to mark you for now/);
        assert.ok(!/att-on/.test(panel(sb)));
        assert.match(plain(panel(sb)), /4 haven't answered/);
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
