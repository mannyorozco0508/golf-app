// ============================================================================
// WATCHING, FOLLOWING, AND NOT TOUCHING ANYTHING (2026-10-06)
//
// Three people hold a link to a round they are not keeping score for:
//
//   watching   the bare link, index.html?game=CODE
//   playing    the same link, having answered "I'm playing"
//   trip       trip.html?trip=CODE, following a whole trip
//
// TWO CLAIMS, and the first is the one nobody checks until it is wrong:
//
//   1. THE CARD MOVES WHILE THEY LOOK AT IT. A page that rendered once and
//      stopped listening is indistinguishable from a live one in a screenshot,
//      and it is the difference between a watcher seeing the 13th go in and a
//      watcher seeing the round as it was when they opened it.
//   2. NOT ONE OF THEM GAINS A PRIVILEGE. No writable box, no delete, no
//      organizer control on the trip.
//
// AND THE FIRST ONE WAS BROKEN. Measured with tools/watch-live-check.js before
// the fix: trip.html read every linked round with once('value') - ONE SHOT - so
// a follower's trip leaderboard, money, awards and points race were frozen from
// the moment the page loaded. Zero value listeners on events/<code>, and a
// second snapshot changed nothing. The scorecard's two viewers were already
// live; the trip was not.
//
// A ONE-GROUP BARE LINK IS THE SCOREKEEPER, and that is not a leak. There is one
// card and whoever holds the round is keeping it - the rule since the app had
// groups. So the privilege claim is made on a TWO-GROUP round, where the bare
// link grants no group at all.
//
// BASELINE, measured over the FINISHED file (all 13 tests, after the last
// assertion was written) against main 21f9c7f - index.html sha 39861746a3be4069,
// admin.html e55ba8015e7441c8, trip.html 5290c9bea5434006 swapped in and restored
// by sha from this wave's own saved copies, never with git checkout:
//
//   7 PASS / 6 FAIL / 13 tests.   7 + 6 = 13.
//
// The seven that pass are claims that were ALREADY TRUE and must stay that way:
//   - the bare-link watcher was already live (1 listener, card moved);
//   - a spectator already had no writable box, no delete, no KP, no press;
//   - a trip follower already ran no organizer control;
//   - the editability binding passes on BOTH files - it is not a new behaviour,
//     it is the measurement the admin copy is held against (0 of 152 editable on
//     two groups, 76 of 76 on one), so that moving the gate in index.html turns
//     the words red instead of quietly making them lie;
//   - the badge's one-row height passes on both files (44px on main, 44px here on
//     the same fixture) - it is a budget, not a new behaviour, and it exists
//     because the FIRST version of the badge was 96px and pushed the hole view's
//     Next button under the fixed Round Menu pill;
//   - "ran" only says the four arms loaded;
//   - the tool pin is VACUOUS on main - tools/watch-live-check.js is added by this
//     wave, so there it reads the branch's own file. It is in the suite so the check
//     cannot quietly stop driving a second snapshot, not as evidence about main.
//
// The six reds, and WHICH of them is a behaviour and which is a sentence:
//   BEHAVIOUR  the trip follower is frozen (board identical after the second
//              snapshot, 0 listeners on events/<code>), and trip.html has no
//              per-round listener registry to detach.
//   BEHAVIOUR  no sticky badge exists, so a watcher who re-opens the link is told
//              nothing about which of the three they are.
//   BEHAVIOUR  a foursome is offered NO round-level link at all - the block sits
//              behind `boundaries.length > 1` - so an organizer of four has
//              nothing to send anybody except a scorekeeper link.
//   SENTENCE   the trip share button does not say anyone can follow.
//   COUPLED    the "I'm playing" arm goes red on main for the BADGE, not for
//              liveness - its own card moved there too. The badge assertion is in
//              that test on purpose: without it the arm cannot tell a golfer who
//              answered from a bare-link viewer wearing a label, and a liveness
//              claim about the wrong viewer is worth nothing.
//   COUPLED    "listens once per round" reads trip.html source, so it is red on
//              main for the same reason the trip arm is - no registry exists yet.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const CODE = 'WATCHT', TRIP = 'TRIPT';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const FOUR = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(2 + i * 4), playingForMoney: true }));
const EIGHT = FOUR.concat(['Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel']
    .map((n, i) => ({ id: 201 + i, name: n, hcp: '10', playingForMoney: true })));
const first = {}, second = {};
FOUR.forEach((p, i) => { first['p' + p.id + '_h1'] = 4 + (i % 3); });
Object.assign(second, first);
FOUR.forEach((p, i) => { second['p' + p.id + '_h2'] = 3 + (i % 3); });

const round = (scores, players, overrides) => ({
    eventName: 'Saturday Game', courseName: 'Dobson Ranch', players: players || FOUR,
    gameFormat: 'stroke', courseData: CD, scores: scores, settlementMode: 'whole-dollar',
    groupSizeOverrides: overrides || { 0: 4 }, ownerUid: 'somebody-else'
});

const CARD = `(function () {
  var live = document.getElementById('hole-live-mount');
  return JSON.stringify({
    thru: (String(live && live.innerText || '').match(/thru (\\d+)/g) || []).join(','),
    badge: (function () { var b = document.getElementById('round-role-badge');
      return b && getComputedStyle(b).display !== 'none' ? String(b.innerText || '').trim() : null; })(),
    writableBoxes: document.querySelectorAll('.score-input:not([disabled])').length,
    deleteButtons: document.querySelectorAll('#end-round-mount button').length,
    // innerText, scoped: this page keeps its whole application in an inline
    // script, so textContent matches these words in SOURCE on a blank page.
    saysDelete: /Delete round for everyone/.test(String(document.body.innerText || '')),
    kpAnswerable: document.querySelectorAll('#kp-entry-mount button:not([disabled])').length,
    pressButtons: document.querySelectorAll('.lm-press-link').length
  });
})()`;
const TRIPPAGE = `(function () {
  var b = document.getElementById('trip-leaderboard');
  return JSON.stringify({
    board: b ? String(b.innerText || '').replace(/\\s+/g, ' ').trim() : '',
    organizerControls: document.querySelectorAll('.rc-counts-toggle:not(.rc-counts-static)').length,
    removeRound: (String(document.body.innerText || '').match(/Remove from trip/g) || []).length
  });
})()`;

async function arm(page, search, db, steps, probe, deliverValue, deliverPath) {
    const r = await arriveCold({
        url: fileUrl(page, search), db: db,
        viewport: { width: 390, height: 844 }, settleMs: 3200,
        steps: (steps || []).concat([{ expression: probe },
            { deliver: { path: deliverPath || ('events/' + CODE), value: deliverValue } },
            { sleep: 700 }, { expression: probe }])
    });
    if (!r.ok) return { error: r.reason };
    const seen = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(v => JSON.parse(v));
    const d = (r.value || []).filter(v => v && typeof v === 'object' && v.listeners !== undefined).pop();
    return { before: seen[0], after: seen[seen.length - 1], listeners: d ? d.listeners : 0 };
}

const S = {};
before(async () => {
    const scorecardDb = s => ({ events: { [CODE]: round(s) }, trips: {}, global_courses: {}, tournaments: {} });
    S.watching = await arm('index.html', 'game=' + CODE, scorecardDb(first), [], CARD, round(second));
    S.playing = await arm('index.html', 'game=' + CODE, scorecardDb(first),
        [{ tap: '.role-offer-btn' }, { sleep: 500 },
         { tap: '#group-pick-body [data-role="playing"]' }, { sleep: 600 },
         { tap: '#group-pick-body button' }, { sleep: 600 }], CARD, round(second));
    // TWO GROUPS: here the bare link grants nothing, which is where the
    // privilege claim can honestly be made.
    const twoGroup = s => round(s, EIGHT, { 0: 4, 1: 4 });
    S.spectator = await arm('index.html', 'game=' + CODE,
        { events: { [CODE]: twoGroup(first) }, trips: {}, global_courses: {}, tournaments: {} },
        [{ tap: '#group-pick-overlay [data-role="watching"]' }, { sleep: 600 }], CARD, twoGroup(second));
    // THE BADGE SITS ON A CARD THAT STILL HAS TO WORK. Measured separately
    // because only a browser has layout: the first version of the badge stacked
    // three lines, took the note from 32px to 96px, and pushed the hole view's
    // nav row down until the fixed Round Menu pill covered Next - a watcher could
    // not change holes. Scroll the way a thumb does, then ask what is actually at
    // Next's own centre.
    const SCROLLED = "document.querySelectorAll('#hole-view-card .score-input')[3]"
        + ".scrollIntoView({ block: 'center' }); var n = document.querySelector('.hole-view-nav-row');"
        + " if (n.getBoundingClientRect().bottom > window.innerHeight) n.scrollIntoView({ block: 'end' });"
        + " var b = n.querySelectorAll('button')[2]; var r = b.getBoundingClientRect();"
        + " var x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);"
        + " var hit = document.elementFromPoint(x, y); var note = document.getElementById('role-note');"
        + " JSON.stringify({ wanted: String(b.innerText || '').trim(),"
        + " hit: hit ? String(hit.innerText || '').trim().slice(0, 12) : null,"
        + " noteHeight: note ? Math.round(note.getBoundingClientRect().height) : -1 })";
    const reach = await arriveCold({
        url: fileUrl('index.html', 'game=' + CODE),
        db: { events: { [CODE]: round(first, EIGHT, { 0: 8 }) }, trips: {}, global_courses: {}, tournaments: {} },
        viewport: { width: 390, height: 844 }, settleMs: 3200,
        steps: [{ tap: '#group-pick-overlay [data-role="watching"]' }, { sleep: 600 },
                { expression: SCROLLED }]
    });
    S.reach = reach.ok ? JSON.parse(reach.value[2]) : { error: reach.reason };

    S.trip = await arm('trip.html', 'trip=' + TRIP,
        { events: { [CODE]: round(first) },
          trips: { [TRIP]: { name: 'Myrtle', createdAt: 1, ownerUid: 'somebody-else',
                             organizerToken: 'tok-theirs', rounds: { [CODE]: { label: 'Saturday Game' } } } },
          global_courses: {}, tournaments: {} },
        [], TRIPPAGE, round(second));
});

describe('1. THE CARD MOVES WHILE THEY WATCH IT', () => {

    test('ran', () => ['watching', 'playing', 'spectator', 'trip'].forEach(k =>
        assert.ok(S[k] && !S[k].error, k + ': ' + (S[k] && S[k].error))));

    test('a bare-link watcher sees the second score without refreshing', () => {
        assert.ok(S.watching.before.thru, 'the first snapshot rendered nothing to compare');
        assert.notEqual(S.watching.after.thru, S.watching.before.thru,
            'the card is frozen: ' + S.watching.before.thru);
        assert.equal(S.watching.listeners, 1, 'the page is not listening at all');
    });

    test('and so does a golfer who answered "I\'m playing"', () => {
        assert.match(String(S.playing.after.badge || ''), /Playing/,
            'this arm never actually answered, so it is a bare-link viewer wearing a label');
        assert.notEqual(S.playing.after.thru, S.playing.before.thru);
    });

    test('AND SO DOES A TRIP FOLLOWER, which is the one that was frozen', () => {
        // trip.html read every linked round with once('value') - one shot - so the
        // whole trip stopped at whatever had been posted when the page opened.
        assert.ok(S.trip.before.board.length > 20, 'the trip leaderboard rendered nothing');
        assert.notEqual(S.trip.after.board, S.trip.before.board,
            'the trip is frozen: ' + S.trip.before.board.slice(0, 120));
        assert.equal(S.trip.listeners, 1, 'the trip is not listening to its rounds');
    });

    test('and it listens once per round, and lets go when a round leaves', () => {
        const src = read('trip.html');
        assert.match(src, /function attachRoundListeners\(roundCodes, rounds\)/);
        assert.match(src, /if \(tripRoundRefs\[code\]\) return;/, 'it attaches a second listener per refresh');
        assert.match(src, /tripRoundRefs\[code\]\.off\('value'\)/, 'a round removed from the trip is leaked');
        // COALESCED: four rounds landing together must rebuild the trip once.
        assert.match(src, /if \(tripRerenderQueued\) return;/);
    });
});

describe('2. AND NOT ONE OF THEM GAINS A PRIVILEGE', () => {

    test('a spectator has no writable box, no delete, no KP answer and no press', () => {
        const v = S.spectator.after;
        assert.equal(v.writableBoxes, 0, 'a spectator can type a score');
        assert.equal(v.deleteButtons, 0, 'a spectator was offered the delete');
        assert.equal(v.saysDelete, false, 'the delete sentence is on a spectator page');
        assert.equal(v.kpAnswerable, 0, 'a spectator can answer a KP');
        assert.equal(v.pressButtons, 0, 'a spectator was offered a press');
    });

    test('and the badge says which of the three they are, every time they open it', () => {
        // STICKY COMES FROM THE STORED ROLE (golfapp_role_<code>), which Wave 39
        // already wrote; the badge is what makes it visible.
        assert.match(String(S.spectator.after.badge || ''), /Just watching/,
            'the badge reads: ' + S.spectator.after.badge);
        const src = read('index.html');
        assert.match(src, /id="round-role-badge" class="role-badge"/);
        assert.match(src, /class="role-change-btn" onclick="openRoleSheet\(\)"/,
            'a sticky badge with no way to change it is a trap');
    });

    test('AND THE BADGE COSTS ONE ROW, not three - the card still has to work under it', () => {
        assert.ok(!S.reach.error, S.reach.error);
        assert.match(S.reach.wanted, /Next/, 'the nav row is not where this thinks it is');
        // WHY A HEIGHT IS THE ASSERTION HERE AND A TAP IS NOT.
        //
        // The first badge stacked three lines and took #role-note from 32px to
        // 96px. On the eight-golfer fixture in hole_view_landing_test.js that was
        // enough to push the hole view's nav row past the bottom of the screen, and
        // a tap at Next's own centre then hit the fixed "Round Menu" pill and
        // opened the sheet instead of advancing the hole. That test went red and is
        // the live guard for it. One wrapping row instead of three put it back.
        //
        // BUT THE COLLISION ITSELF IS NOT THIS WAVE'S, and asserting it away here
        // would be a false claim. Measured on BOTH files, same fixture, eight
        // golfers scrolled so the nav row sits flush with the bottom edge:
        //
        //   main 21f9c7f   hit "Round Menu", note 44px
        //   this branch    hit "Round Menu", note 44px
        //
        // Whenever the nav row ends flush with the viewport bottom the fixed pill
        // covers Next, badge or no badge. That is the Round Menu pill's, it needs
        // bottom inset on the page rather than a copy change, and it is Manny's to
        // approve. So this test guards the one thing the wave owns: the badge is a
        // row, not a stack.
        assert.ok(S.reach.noteHeight > 0 && S.reach.noteHeight < 56,
            'the role note is ' + S.reach.noteHeight + 'px - it is stacking again, and '
            + 'at 96px it pushed Next under the pill');
    });

    test('a trip follower runs nothing: no counts toggle, no remove, no organizer link', () => {
        assert.equal(S.trip.after.organizerControls, 0, 'a follower can re-count rounds');
        assert.equal(S.trip.after.removeRound, 0, 'a follower can remove a round from the trip');
    });
});

describe('3. THE LINKS SAY WHAT THEY ARE', () => {

    test('the bare link is offered on EVERY round, and only called read-only where it is', () => {
        const src = read('admin.html');
        // OFFERED ON EVERY ROUND: the block used to sit behind
        // `boundaries.length > 1`, so a foursome had nothing to send anybody but a
        // scorekeeper link.
        const at = src.indexOf('const roundUrl = scorecardUrlFor(currentMode);');
        assert.ok(at > -1, 'the round link block is gone');
        assert.ok(!/if \(boundaries\.length > 1\) \{\s*$/.test(src.slice(at - 200, at)),
            'the round link is still gated on a multi-group round');
        // AND THE WORDS ARE PER SHAPE, because the LINK is per shape - see below.
        assert.match(src, /many \? 'Watch this round · Send this link to everyone' : 'Send this link to everyone'/);
        // The sentence is split across concatenated literals in source; the
        // RENDERED form is pinned whole by group_picker_test.js.
        assert.match(src, /On one group this link also carries the /);
        assert.match(src, /scorecard, so whoever opens it can enter scores/);
    });

    test('AND THE READ-ONLY SENTENCE IS BOUND TO EDITABILITY, measured at both shapes', () => {
        // THE DEFECT CLAUDE.md RECORDS TWICE is a confident sentence about a link
        // nobody re-measured after the shape changed. These two numbers come from
        // the arms above, opening the SAME URL - index.html?game=CODE, no group:
        assert.equal(S.spectator.after.writableBoxes, 0,
            'two groups: the bare link is the watch link, and that is where the '
            + '"nobody can enter a score" sentence is allowed to appear');
        assert.ok(S.watching.after.writableBoxes > 0,
            'one group: if this ever reaches 0, the foursome copy ("carries the '
            + 'scorecard") is the thing that is now lying, and it must change');
        // AND A ROLE DOES NOT REVOKE IT. The gate is group SCOPE; with one group
        // everybody is in scope, so "Just watching" on a foursome still leaves a
        // fully writable card. Giving a foursome a genuinely read-only link is a
        // scorecard behaviour change and is deferred to Manny.
        assert.equal(S.watching.after.writableBoxes, S.watching.before.writableBoxes,
            'something now revokes entry on one group - re-measure the admin copy');
    });

    test('and the trip link says anyone can follow', () => {
        assert.match(read('trip.html'), /Share Trip Link <span class="trip-share-sub">— anyone can follow<\/span>/);
    });

    test('the check that proves all of this drives a SECOND snapshot', () => {
        const tool = read('tools/watch-live-check.js');
        assert.match(tool, /deliver: \{ path: 'events\/' \+ CODE, value: value \}/,
            'it never delivers a second snapshot, so it cannot tell live from frozen');
        ['watching', 'playing', 'trip', 'spectator'].forEach(k =>
            assert.ok(tool.indexOf("'" + k + "'") > -1, 'the check lost its ' + k + ' arm'));
    });
});
