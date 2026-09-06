// ============================================================================
// A BADGE THAT ANSWERS TWO QUESTIONS MUST NOT ANSWER THEM THE SAME WAY
//
// Each session on the Classic schedule carries one small badge, and it has two
// entirely different jobs:
//
//   CAPACITY   how many matches this session SEATS, given who is assigned.
//              It is a property of the roster and never changes when you set a
//              lineup somewhere else.
//   LINEUPS    how many pairings you have actually created in this session.
//
// It used to render them as "1 matches" and "1 set". On a four-golfer Cup every
// session seats exactly one match, so all five read "1 matches" from the moment
// the sides were picked - and "1 matches" reads exactly like a count of matches
// that exist. Setting one lineup therefore looked like it had written pairings
// into every session on the schedule. It had not; nothing but the tapped session
// was touched. The screen was answering "how many does this seat" in the words of
// "how many have you made".
//
// This was reported from a real device as a suspected fan-out bug. That is the
// cost being measured here: the reader could not tell which question was answered,
// so they concluded the app had silently changed things they had not asked about.
//
// THE GUARANTEE. Capacity says "seats". A created lineup says "lineup set".
// Neither string can be read as the other, and both count in correct English.
//
// HOW THIS IS TESTED. Every assertion below reads the markup the page produced
// after the buttons were pressed - the Classic preset, the side chips, Set Lineup.
// rcSessionBadge is never called by name here. A test that called it would prove
// the builder formats a string, which was never in doubt; what shipped broken was
// which string the schedule chose to show.
//
// WHAT MINI-DOM CANNOT PROVE: nothing needed here. These are string assertions on
// generated markup, which is exactly what a browser would parse. Geometry and
// select state are asserted cold in tools/ryder-arrival-check.js instead.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const DEPS = ['handicap.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'ryder-cup.js'];
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

const roster = n => Array.from({ length: n }, (_, i) =>
    ({ id: 101 + i, name: 'Golfer ' + String.fromCharCode(65 + i), hcp: '10' }));

// Arrives the way an organizer sent by Game Day does, then presses the buttons
// they press. No render function is called by name.
function cupScreen(playerCount, { assign = true } = {}) {
    const P = roster(playerCount);
    const sb = loadHtmlInlineScript('sidematches.html', DEPS,
        { search: '?game=BADGE&setup=ryder' });
    vm.runInContext('alert = function () {}; confirm = function () { return true; };'
        + ' isOrganizerView = function () { return true; };', sb);
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value');
    assert.ok(handlers.length > 0, 'the page registered no value handler');
    handlers.forEach(h => h.cb({ val: () => ({ players: P, courseData: CD, scores: {} }) }));

    const run = e => vm.runInContext(e, sb);
    run('rcOpen()');
    run('rcOpenClassic()');
    if (assign) P.forEach((p, i) => run(`rcToggle(${p.id}, '${i % 2 === 0 ? 'A' : 'B'}')`));
    return { run, players: P };
}

// The badges, in schedule order, read out of the markup the page rendered.
function badges(scr) {
    const html = scr.run('document.getElementById("ryder-cup-setup").innerHTML');
    return (html.match(/<span class="rcs-cap">([\s\S]*?)<\/span>/g) || [])
        .map(s => s.replace(/<[^>]*>/g, '').trim());
}

// The label of a session, so a test can name the one it taps.
const sessionIds = scr => JSON.parse(scr.run(
    'JSON.stringify(Object.keys(rcDraft.sessions)'
    + '.sort((a,b)=>rcDraft.sessions[a].order-rcDraft.sessions[b].order))'));

describe('CAPACITY DOES NOT PRETEND TO BE A COUNT', () => {

    test('an unseeded session says what it SEATS', () => {
        const b = badges(cupScreen(4));
        assert.ok(b.length >= 5, 'the Classic schedule did not render its five sessions');
        b.forEach(text => assert.match(text, /^seats /,
            'a session with no lineups reads "' + text + '", which reads like a count'));
    });

    test('and it never uses the word that means a lineup exists', () => {
        badges(cupScreen(4)).forEach(text =>
            assert.ok(!/\bset\b/.test(text),
                'capacity badge "' + text + '" claims something was set'));
    });

    test('one match seated is singular', () => {
        // Four golfers, two a side: every pairs format seats exactly one match.
        assert.ok(badges(cupScreen(4)).includes('seats 1 match'),
            'no session read "seats 1 match" — got ' + JSON.stringify(badges(cupScreen(4))));
    });

    test('"1 matches" is gone', () => {
        [4, 6, 8, 12].forEach(n => badges(cupScreen(n)).forEach(text =>
            assert.ok(!/\b1 matches\b/.test(text),
                'the ungrammatical capacity label survives at ' + n + ' golfers')));
    });

    test('several seated is plural', () => {
        // Twelve golfers, six a side: Four-Ball and Foursomes seat 3, Singles 6.
        const b = badges(cupScreen(12));
        assert.ok(b.includes('seats 3 matches'), 'expected a 3-match session, got ' + JSON.stringify(b));
        assert.ok(b.includes('seats 6 matches'), 'expected a 6-match session, got ' + JSON.stringify(b));
    });

    test('a session that seats nothing says so in words', () => {
        // Nobody assigned yet. "seats 0 matches" is a number where there is
        // nothing to count.
        const b = badges(cupScreen(4, { assign: false }));
        assert.ok(b.length > 0, 'the schedule did not render');
        b.forEach(text => assert.equal(text, 'seats no matches',
            'an empty session reads "' + text + '"'));
    });
});

describe('A LINEUP THAT EXISTS SAYS SO, AND ONLY WHERE IT EXISTS', () => {

    test('the session you set reads as a lineup, not a capacity', () => {
        const scr = cupScreen(4);
        scr.run(`rcSeedSession(${JSON.stringify(sessionIds(scr)[0])})`);
        const b = badges(scr);
        assert.equal(b[0], '1 lineup set',
            'the seeded session reads "' + b[0] + '"');
        assert.ok(!/seats/.test(b[0]), 'a created lineup still talks about seating');
    });

    test('THE REPORTED BUG: the sessions you did not touch are unchanged', () => {
        // This is the whole point. Set Lineup writes one session; the other four
        // must still be visibly answering a different question.
        const scr = cupScreen(4);
        const before = badges(scr);
        scr.run(`rcSeedSession(${JSON.stringify(sessionIds(scr)[0])})`);
        const after = badges(scr);
        assert.deepEqual(Array.from(after.slice(1)), Array.from(before.slice(1)),
            'setting one lineup changed how the other sessions read');
        after.slice(1).forEach(text => assert.match(text, /^seats /,
            'an untouched session reads "' + text + '", which looks like a lineup'));
    });

    test('and the record agrees with the screen', () => {
        const scr = cupScreen(4);
        const first = sessionIds(scr)[0];
        scr.run(`rcSeedSession(${JSON.stringify(first)})`);
        const written = JSON.parse(scr.run(
            'JSON.stringify((rcDraft.matches||[]).map(m=>m.sessionId))'));
        assert.deepEqual(Array.from(written), [first],
            'Set Lineup wrote into a session it was not tapped on');
    });

    test('several lineups is plural', () => {
        const scr = cupScreen(12);
        scr.run(`rcSeedSession(${JSON.stringify(sessionIds(scr)[0])})`);
        assert.equal(badges(scr)[0], '3 lineups set');
    });

    // A ONE-TAP SCHEDULE PROVES ALMOST NOTHING, and this is where the first
    // version of these tests stopped. Seeding once from an empty schedule cannot
    // see a second tap CLOBBERING the first: with nothing else set, there is
    // nothing to lose. A real Cup is built session by session over three days,
    // so the state that matters is the one with lineups already standing.
    test('setting a SECOND lineup leaves the first one standing', () => {
        const scr = cupScreen(4);
        const ids = sessionIds(scr);
        scr.run(`rcSeedSession(${JSON.stringify(ids[0])})`);
        scr.run(`rcSeedSession(${JSON.stringify(ids[1])})`);
        const b = badges(scr);
        assert.equal(b[0], '1 lineup set', 'the first session lost its lineup to the second');
        assert.equal(b[1], '1 lineup set', 'the second session did not take');
        assert.deepEqual(Array.from(b.slice(2)), ['seats 1 match', 'seats 1 match', 'seats 2 matches'],
            'sessions nobody touched were disturbed');
    });

    test('and the record keeps both, in their own sessions', () => {
        const scr = cupScreen(4);
        const ids = sessionIds(scr);
        scr.run(`rcSeedSession(${JSON.stringify(ids[0])})`);
        scr.run(`rcSeedSession(${JSON.stringify(ids[1])})`);
        const written = JSON.parse(scr.run(
            'JSON.stringify((rcDraft.matches||[]).map(m=>m.sessionId).sort())'));
        assert.deepEqual(Array.from(written), [ids[0], ids[1]].sort(),
            'the two lineups did not land one per session');
    });

    // Re-tapping the SAME session is a legitimate thing to do - the organizer
    // moved somebody between sides and wants the pairing redrawn. It must redraw
    // that session and still leave every other one alone.
    test('re-tapping a session redraws it without touching the others', () => {
        const scr = cupScreen(4);
        const ids = sessionIds(scr);
        scr.run(`rcSeedSession(${JSON.stringify(ids[0])})`);
        scr.run(`rcSeedSession(${JSON.stringify(ids[1])})`);
        scr.run(`rcSeedSession(${JSON.stringify(ids[1])})`);
        const b = badges(scr);
        assert.equal(b[1], '1 lineup set', 're-seeding doubled or dropped its own lineup');
        assert.equal(b[0], '1 lineup set', 're-seeding one session emptied another');
    });
});

describe('THE TWO STATES CANNOT BE CONFUSED FOR ONE ANOTHER', () => {

    // The defect was not a wrong number. Both numbers were right. It was that one
    // shape carried two meanings, so the reader could not tell which they had.
    test('no capacity badge and lineup badge ever read alike', () => {
        const scr = cupScreen(12);
        const capacity = badges(scr);
        scr.run(`rcSeedSession(${JSON.stringify(sessionIds(scr)[0])})`);
        const lineup = badges(scr)[0];
        capacity.forEach(c => assert.notEqual(c, lineup,
            'a seated session and a set lineup both read "' + c + '"'));
        assert.ok(/seats/.test(capacity[0]) && !/seats/.test(lineup),
            'the two states are not distinguished by their words');
    });
});
