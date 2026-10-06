#!/usr/bin/env node
// ============================================================================
// DOES A WATCHER ACTUALLY SEE THE NEXT SCORE? (2026-10-06)
//
// Three people watch a round without keeping score, and the whole point of
// giving them a link is that the card moves while they look at it:
//
//   watching   the bare link, index.html?game=CODE
//   playing    the same link, having answered "I'm playing"
//   trip       trip.html?trip=CODE, the follower of a whole trip
//
// A LIVE CARD IS NOT PROVED BY A CARD THAT RENDERED ONCE. Every one of these
// arrives, renders from the first snapshot and looks perfect; whether the page
// is still LISTENING is a different question, and it is the one that decides
// whether a golfer standing on the 14th sees the 13th go in.
//
// SO THIS DELIVERS A SECOND SNAPSHOT. cold-arrival's { deliver } re-fires every
// value listener registered on a path - the stand-in records them - and the
// check reads the same element before and after. A frozen page renders the
// first snapshot and never changes; a live one moves.
//
// IT CALLS NOTHING THE PAGE DEFINES. Replace the data source, open the URL a
// golfer is sent, read rendered text. Exit 0 and print JSON; read `ok`.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const W = 390, H = 844;
const CODE = 'WATCHME';
const TRIP = 'TRIPME';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: i % 5 === 3 ? 3 : 4, hcpIndex: i });
const PLAYERS = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(2 + i * 4), playingForMoney: true }));

// ONE HOLE IN, then two. The second snapshot is the only difference.
const firstScores = {};
PLAYERS.forEach((p, i) => { firstScores['p' + p.id + '_h1'] = 4 + (i % 3); });
const secondScores = Object.assign({}, firstScores);
PLAYERS.forEach((p, i) => { secondScores['p' + p.id + '_h2'] = 3 + (i % 3); });

const roundWith = scores => ({
    eventName: 'Saturday Game', courseName: 'Dobson Ranch', players: PLAYERS,
    gameFormat: 'stroke', courseData: CD, scores: scores, settlementMode: 'whole-dollar',
    groupSizeOverrides: { 0: 4 }, ownerUid: 'somebody-else', roundDay: '2026-10-06'
});
const tripWith = scores => ({
    name: 'Myrtle', createdAt: 1, rounds: { [CODE]: { label: 'Saturday Game' } }
});

// THE NUMBER A WATCHER IS LOOKING AT: the compact line under Prev/Next and the
// leaderboard pop-up both read liveStandings(), so "thru" is the tell. Rendered
// text only - this page keeps its whole application in an inline script, so
// textContent would match the source of a page that rendered nothing.
const SCORECARD = `(function () {
  var live = document.getElementById('hole-live-mount');
  var body = String(document.body.innerText || '');
  return JSON.stringify({
    live: live ? String(live.innerText || '').replace(/\\s+/g, ' ').trim() : null,
    thru: (String(live && live.innerText || '').match(/thru (\\d+)/g) || []).join(','),
    // The role badge, which must say what this viewer is.
    badge: (function () { var b = document.getElementById('round-role-badge');
      return b && getComputedStyle(b).display !== 'none' ? String(b.innerText || '').trim() : null; })(),
    // NO PRIVILEGE: a read-only viewer has no writable box and no delete.
    writableBoxes: document.querySelectorAll('.score-input:not([disabled])').length,
    deleteButtons: document.querySelectorAll('#end-round-mount button').length,
    saysDelete: /Delete round for everyone/.test(body)
  });
})()`;

const TRIPPAGE = `(function () {
  var board = document.getElementById('trip-leaderboard');
  var money = document.getElementById('trip-money-settlement');
  var txt = function (el) { return el ? String(el.innerText || '').replace(/\\s+/g, ' ').trim() : ''; };
  return JSON.stringify({
    // THE TRIP LEADERBOARD IS THE TELL. A follower is watching the totals move;
    // the round rows carry only labels, so reading them would prove nothing.
    thru: txt(board),
    money: txt(money).slice(0, 120),
    rows: document.querySelectorAll('.rc-link').length,
    // A follower may not run the trip.
    organizerControls: document.querySelectorAll('.rc-counts-toggle:not(.rc-counts-static)').length
  });
})()`;

const deliver = (value) => ({ deliver: { path: 'events/' + CODE, value: value } });

// A WATCHER IS NOT A ONE-GROUP SCOREKEEPER. On a round with ONE group the bare
// link has always been the scorekeeper - there is one card and whoever holds the
// round is keeping it - so a privilege check on that fixture proves nothing. The
// privilege arms use a TWO-GROUP round, where the bare link grants no group, and
// the viewer answers "just watching" the way a golfer does.
const TWO_GROUP = PLAYERS.concat(['Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel']
    .map((n, i) => ({ id: 201 + i, name: n, hcp: '10', playingForMoney: true })));

async function watch(label, query, steps, probe, db, second) {
    const r = await arriveCold({
        url: fileUrl(query.page, query.search),
        db: db || { events: { [CODE]: roundWith(firstScores) }, trips: { [TRIP]: tripWith() },
                    global_courses: {}, tournaments: {} },
        viewport: { width: W, height: H }, settleMs: 3200,
        steps: (steps || []).concat([{ expression: probe },
                                     deliver(second || roundWith(secondScores)),
                                     { sleep: 700 }, { expression: probe }])
    });
    if (!r.ok) return { label, error: r.reason };
    const seen = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(v => JSON.parse(v));
    const delivery = (r.value || []).filter(v => v && typeof v === 'object' && v.listeners !== undefined).pop();
    return { label, before: seen[0], after: seen[seen.length - 1], delivery: delivery || null };
}

(async () => {
    const watching = await watch('watching', { page: 'index.html', search: 'game=' + CODE },
        [], SCORECARD);
    const playing = await watch('playing', { page: 'index.html', search: 'game=' + CODE },
        // ANSWER "I'M PLAYING" THE WAY A GOLFER DOES. On a foursome the three
        // choices are one tappable line on the card (.role-offer-btn), which
        // opens the same sheet a multi-group round gets; then the row, then the
        // name - a playing follower is a specific roster entry, which is what
        // makes their bets and their result theirs.
        [{ tap: '.role-offer-btn' }, { sleep: 500 },
         { tap: '#group-pick-body [data-role="playing"]' }, { sleep: 600 },
         { tap: '#group-pick-body button' }, { sleep: 600 }], SCORECARD);
    const trip = await watch('trip', { page: 'trip.html', search: 'trip=' + TRIP },
        [], TRIPPAGE, { events: { [CODE]: roundWith(firstScores) },
                        // AN ORGANIZER TOKEN THIS DEVICE DOES NOT HOLD is what makes a trip
        // somebody else's: a trip with no token at all is a LEGACY trip and is
        // open to everyone, by the rule hasTripOrganizerAuthority has always had.
        trips: { [TRIP]: Object.assign(tripWith(), { ownerUid: 'somebody-else', organizerToken: 'tok-theirs' }) },
                        global_courses: {}, tournaments: {} });

    // ---- AND NOT ONE OF THEM GAINS A PRIVILEGE ---------------------------
    const twoGroup = scores => Object.assign(roundWith(scores),
        { players: TWO_GROUP, groupSizeOverrides: { 0: 4, 1: 4 } });
    const spectator = await watch('spectator', { page: 'index.html', search: 'game=' + CODE },
        [{ tap: '#group-pick-overlay [data-role="watching"]' }, { sleep: 600 }], SCORECARD,
        { events: { [CODE]: twoGroup(firstScores) }, trips: {}, global_courses: {}, tournaments: {} },
        twoGroup(secondScores));

    // THE ONE-GROUP ARMS ARE NOT READ-ONLY, AND THAT IS NOT A LEAK. On a round
    // with ONE group the bare link has always been the scorekeeper: there is one
    // card and whoever holds the round is keeping it. The privilege claim is made
    // by the `spectator` arm, on a round where the bare link grants no group.
    const moved = (v) => !!(v && v.before && v.after && v.before.thru !== v.after.thru);
    const readOnly = (v) => !!(v && v.after && v.after.writableBoxes === 0
                               && v.after.deleteButtons === 0 && !v.after.saysDelete);
    const ok = !!(moved(watching) && moved(playing) && moved(trip)
                  && readOnly(spectator) && spectator.after && spectator.after.badge
                  && moved(spectator)
                  // The playing follower must have ACTUALLY answered, or this arm
                  // is a bare-link viewer wearing a label.
                  && playing.after && /Playing/.test(String(playing.after.badge || ''))
                  && trip.after && trip.after.organizerControls === 0);
    console.log(JSON.stringify({ ok, watching, playing, trip, spectator }, null, 2));
})().catch(e => { console.error(String(e && e.message || e)); process.exit(2); });
