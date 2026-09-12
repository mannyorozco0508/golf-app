// ============================================================================
// THE PAIRINGS SHEET NAMES EVERY GOLFER ONCE, AND COUNTS ONLY THE ONES COMING.
//
// A starter holds this at 6am and counts carts against it. The failure it
// exists to stop is a MISSING FOURSOME nobody notices until the shotgun - so
// nothing here asserts that the sheet "renders". Every assertion is a set or a
// count over the WHOLE record: the multiset of every printed name equals the
// multiset of every name in the record, every team and every group is a row,
// a golfer in no group is listed as such, and a withdrawn golfer is printed,
// flagged, and left OUT of the total the starter counts against.
//
// THE TWO WITHDRAWN DEFECTS ARE TWO ASSERTIONS. "Not flagged WD" and "counted
// in the total" are different mistakes with different consequences - one
// misleads the group, the other misleads the starter - and each has its own
// test so each has its own red.
//
// ----------------------------------------------------------------------------
// HOW THE SHEET IS REACHED. The page's own arrival: sb.loadTournament(code)
// registers the value handler production registers, the test fires it with the
// fixture through sandbox.__dbHandlers, and the page renders as it would on a
// snapshot. The print is then triggered through the function the BUTTON names -
// read out of the markup, not typed here - because mini-dom cannot run a static
// onclick and the wire from button to trigger is otherwise unproven.
//
// WHAT THIS FILE CANNOT PROVE. innerHTML is a string under mini-dom, so these
// are string counts, which is exactly right for a multiset claim - but nothing
// here can see @media print. That the three CSS rules hide everything except
// the sheet when THIS sheet is on the page is measured in Chrome by
// tools/tournament-pairings-check.js, on cold-arrival.js, with print media
// emulated. This file proves the content; that file proves the paper.
//
// THE CONTRACT THIS FILE PINS (tournament.html):
//   pairingsRows(data, roundId) -> {
//       kind: 'team' | 'player', shotgun: boolean,
//       rows: [{ label, hole: string|null, players: [{ name, wd: boolean }] }],
//       unassigned: [{ name, wd }],   // player mode; [] in team mode
//       missingHole: number,          // shotgun only; 0 on tee times
//       golferTotal: number           // active golfers in rows - wd excluded
//   }
//   rows sorted: shotgun -> blank hole FIRST, then hole label by number then
//   wave letter ("1","1A","1B","2",...,"10","10B"); tee times -> team num /
//   group createdAt.
//   buildPairingsPrintView() writes #tournament-print-view. Each golfer is one
//   <li>: `<li>Name</li>`, or `<li>Name <span class="wd">WD</span></li>`.
//   printSheet(build) is the ONE trigger; printTournamentResults() and
//   printTournamentPairings() are its two callers.
//
// NEGATIVE CONTROLS run this file against a temp copy of tournament.html with
// one defect injected (TPP_PAGE=<path>); see the report for the six controls
// and which assertion each one turns red.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = process.env.TPP_PAGE
    ? path.relative(REPO_ROOT, path.resolve(process.env.TPP_PAGE))
    : 'tournament.html';
const source = () => fs.readFileSync(path.join(REPO_ROOT, PAGE), 'utf8');

// ---------------------------------------------------------------------------
// FIXTURES. Names share no substrings with each other or with any word on the
// sheet ("golfers", "team", "hole"), so a count of occurrences is a count of
// that golfer and nothing else.
// ---------------------------------------------------------------------------
const NATO = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Gamma', 'Hotel',
    'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
    'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray'];
const FIRST = ['Ann', 'Bo', 'Cal', 'Dee', 'Ed', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kim', 'Lou',
    'Max', 'Nan', 'Oz', 'Pat', 'Quin', 'Rae', 'Sal', 'Tam', 'Uma', 'Vic', 'Wes', 'Xan'];
const golfer = (i) => `${FIRST[i]} ${NATO[i]}`;

const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

// Six teams, 24 golfers. Holes deliberately out of order and one blank, so the
// sort has something to do and a lexical sort has something to get wrong.
function teamRecord(overrides) {
    const holes = { 1: '2', 2: '10', 3: '1A', 4: '', 5: '1', 6: '10B' };
    const names = { 1: 'Eagles', 2: 'Hawks', 3: 'Owls', 4: 'Falcons', 5: 'Ospreys', 6: 'Kites' };
    const teams = {};
    for (let n = 1; n <= 6; n++) {
        teams['team' + n] = {
            num: n, name: names[n], handicap: 0, startingHole: holes[n],
            players: [0, 1, 2, 3].map(k => golfer((n - 1) * 4 + k))
        };
    }
    return Object.assign({
        name: 'Member Guest', format: 'scramble', courseName: 'Camas Meadows',
        courseData: COURSE, entryFee: 0, teams, startType: 'shotgun', createdAt: 1
    }, overrides || {});
}
const TEAM_NAMES_ALL = [...Array(24)].map((_, i) => golfer(i));

// Individual: nine golfers. g1 holds four including one WITHDRAWN, g2 three,
// two are in no group at all. The withdrawn golfer stays in playerIds - that
// is what withdrawPlayer() does - so the sheet has to handle it, not the data.
function playerRecord(overrides) {
    const players = {};
    for (let i = 0; i < 9; i++) players['p' + i] = { id: 'p' + i, name: golfer(i), handicap: '0', addedAt: i };
    players.p3.status = 'withdrawn';
    return Object.assign({
        name: 'Club Championship', format: 'individual', scoringModel: 'player-v1', scoringMode: 'gross',
        courseName: 'Camas Meadows', courseData: COURSE, entryFee: 0, teams: {}, players,
        scoringGroups: {
            g1: { id: 'g1', name: 'Group 1', playerIds: ['p0', 'p1', 'p2', 'p3'], startingHole: '3', createdAt: 10 },
            g2: { id: 'g2', name: 'Group 2', playerIds: ['p4', 'p5', 'p6'], startingHole: '', createdAt: 20 }
        },
        startType: 'shotgun', createdAt: 1
    }, overrides || {});
}

// ---------------------------------------------------------------------------
// ARRIVAL AND PRINT, THE WAY THE PAGE DOES THEM
// ---------------------------------------------------------------------------
function arrive(record) {
    const sb = loadHtmlInlineScript(PAGE);
    sb.loadTournament('PAIR');
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value' && /tournaments\/PAIR$/.test(h.path));
    assert.ok(handlers.length > 0, 'the page registered no value handler for the tournament');
    handlers.forEach(h => h.cb({ val: () => JSON.parse(JSON.stringify(record)), exists: () => true }));
    return sb;
}

// The function the button names, read from the markup. If the button is
// missing or names something else, this is where it shows.
function pairingsTrigger() {
    const m = /<button[^>]*onclick="(\w+)\(\)"[^>]*>[^<]*Print Pairings/.exec(source());
    assert.ok(m, 'no button labelled "Print Pairings" with an onclick="fn()" in ' + PAGE);
    return m[1];
}

function printPairings(sb) {
    const calls = { print: 0, listeners: [] };
    sb.print = () => { calls.print++; };
    sb.addEventListener = (ev, fn) => { calls.listeners.push({ ev, fn }); };
    const fn = pairingsTrigger();
    assert.equal(typeof sb[fn], 'function', fn + ' is named by the button but not defined on the page');
    sb[fn]();
    const view = sb.document.getElementById('tournament-print-view');
    return { html: String(view.innerHTML || ''), calls, sb };
}

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const count = (hay, needle) => hay.split(needle).length - 1;

// Every <li> on the sheet, as its visible text, with the WD marker stripped so
// what remains is exactly a name - or is not, and the multiset check says so.
function printedNames(html) {
    return [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
        .map(m => text(m[1]).replace(/\s*WD$/, ''));
}
const sorted = (a) => a.slice().sort();

// ===========================================================================
describe('THE HARNESS REACHED THE SHEET', () => {

    test('arrival renders the manage screen from the fixture, not from a stub', () => {
        const sb = arrive(teamRecord());
        assert.equal(sb.document.getElementById('manage-t-name').textContent, '🏆 Member Guest');
    });

    test('the button names a trigger, and the trigger is printSheet with two callers', () => {
        const src = source();
        assert.equal(pairingsTrigger(), 'printTournamentPairings');
        assert.match(src, /onclick="printTournamentResults\(\)"/, 'the results button must still exist');
        // ONE trigger. Both callers hand printSheet their builder; neither
        // adds the class or calls window.print itself.
        assert.match(src, /function printSheet\(build\)/);
        assert.match(src, /function printTournamentResults\(\)\s*\{\s*printSheet\(buildResultsPrintView\);\s*\}/);
        assert.match(src, /function printTournamentPairings\(\)\s*\{\s*printSheet\(buildPairingsPrintView\);\s*\}/);
        assert.equal(count(src, 'window.print()'), 1, 'window.print is called from exactly one place');
    });

    test('printing adds the class the print CSS keys on, prints once, and removes it after', () => {
        const { calls, sb } = printPairings(arrive(teamRecord()));
        assert.equal(calls.print, 1);
        assert.ok(sb.document.body.classList.contains('printing-results'),
            'body.printing-results is what the three @media print rules key on');
        const after = calls.listeners.find(l => l.ev === 'afterprint');
        assert.ok(after, 'an afterprint listener must restore the screen');
        after.fn();
        assert.ok(!sb.document.body.classList.contains('printing-results'));
    });
});

// ===========================================================================
describe('TEAM MODE, SHOTGUN - COMPLETENESS', () => {

    test('pairingsRows: every team is a row and every golfer is in exactly one', () => {
        const sb = arrive(teamRecord());
        const out = sb.pairingsRows(teamRecord(), null);
        assert.equal(out.kind, 'team');
        assert.equal(out.shotgun, true);
        assert.equal(out.rows.length, 6, 'six teams, six rows');
        const names = out.rows.flatMap(r => r.players.map(p => p.name));
        assert.deepEqual(sorted(names), sorted(TEAM_NAMES_ALL), 'the multiset of row names is the record');
        // .length, not deepEqual([]): the array was made in the page's vm realm
        // and strict deepEqual refuses a foreign Array prototype.
        assert.equal(out.unassigned.length, 0);
        assert.equal(out.golferTotal, 24);
        assert.equal(out.missingHole, 1);
    });

    test('the SHEET names every golfer exactly once - multiset, not sample', () => {
        const { html } = printPairings(arrive(teamRecord()));
        assert.deepEqual(sorted(printedNames(html)), sorted(TEAM_NAMES_ALL),
            'every <li> on the sheet is a record golfer and every record golfer is one <li>');
        TEAM_NAMES_ALL.forEach(n => assert.equal(count(html, n), 1, n + ' must appear exactly once'));
    });

    test('every team name is on the sheet once', () => {
        const { html } = printPairings(arrive(teamRecord()));
        ['Eagles', 'Hawks', 'Owls', 'Falcons', 'Ospreys', 'Kites'].forEach(t =>
            assert.equal(count(html, t), 1, t + ' must appear exactly once'));
    });

    test('rows sort by starting hole - blank FIRST, then number, then wave letter', () => {
        const { html } = printPairings(arrive(teamRecord()));
        // Falcons (blank), Ospreys 1, Owls 1A, Eagles 2, Hawks 10, Kites 10B.
        const order = ['Falcons', 'Ospreys', 'Owls', 'Eagles', 'Hawks', 'Kites'].map(t => html.indexOf(t));
        for (let i = 1; i < order.length; i++) {
            assert.ok(order[i] > order[i - 1], `sheet order wrong at position ${i}: ${JSON.stringify(order)}`);
        }
        const sb = arrive(teamRecord());
        assert.deepEqual(sb.pairingsRows(teamRecord(), null).rows.map(r => r.hole),
            [null, '1', '1A', '2', '10', '10B']);
    });

    test('a blank starting hole prints HOLE NOT SET in its row and is counted at the top', () => {
        const { html } = printPairings(arrive(teamRecord()));
        assert.equal(count(html, 'HOLE NOT SET'), 1);
        assert.match(text(html), /\b1 team has no starting hole\b/);
        // The row is the Falcons row: HOLE NOT SET sits closer to Falcons than to any other team.
        const at = html.indexOf('HOLE NOT SET');
        const nearest = ['Eagles', 'Hawks', 'Owls', 'Falcons', 'Ospreys', 'Kites']
            .map(t => ({ t, d: Math.abs(html.indexOf(t) - at) })).sort((a, b) => a.d - b.d)[0].t;
        assert.equal(nearest, 'Falcons');
    });

    test('the header carries the words a starter reads first, and the totals', () => {
        const t = text(printPairings(arrive(teamRecord())).html);
        assert.match(t, /Member Guest/);
        assert.match(t, /Camas Meadows/);
        assert.match(t, /\bSHOTGUN\b/);
        assert.match(t, /\b6 teams\b/);
        assert.match(t, /\b24 golfers\b/);
        assert.match(t, /Printed /, 'a print stamp, so a stale sheet can be told from a fresh one');
    });

    test('one golfer per line: every golfer is its own <li>, no comma runs', () => {
        const { html } = printPairings(arrive(teamRecord()));
        assert.equal([...html.matchAll(/<li\b/g)].length, 24);
        TEAM_NAMES_ALL.forEach(n => assert.ok(!new RegExp(n + ',\\s*[A-Z]').test(html), n + ' is in a comma run'));
        // A foursome never splits across a page, and the column heads repeat.
        assert.match(html, /page-break-inside:\s*avoid/);
        assert.match(html, /display:\s*table-header-group/);
    });
});

// ===========================================================================
describe('TEAM MODE, TEE TIMES', () => {

    test('no hole column, no HOLE NOT SET, no count - every team starts on 1', () => {
        const rec = teamRecord({ startType: 'normal' });
        const { html } = printPairings(arrive(rec));
        const t = text(html);
        assert.match(t, /\bTEE TIMES\b/);
        assert.ok(!/HOLE NOT SET/.test(html));
        assert.ok(!/no starting hole/.test(t));
        assert.deepEqual(sorted(printedNames(html)), sorted(TEAM_NAMES_ALL), 'completeness holds on tee times too');
        const sb = arrive(rec);
        const out = sb.pairingsRows(rec, null);
        assert.equal(out.shotgun, false);
        assert.equal(out.missingHole, 0);
        assert.deepEqual(out.rows.map(r => r.label), ['Eagles', 'Hawks', 'Owls', 'Falcons', 'Ospreys', 'Kites'],
            'tee times sort by team number');
    });
});

// ===========================================================================
describe('INDIVIDUAL MODE - GROUPS, THE WITHDRAWN GOLFER, AND THE UNASSIGNED', () => {

    const ALL_NINE = [...Array(9)].map((_, i) => golfer(i));
    const WD = golfer(3);          // Dee Delta, in Group 1, withdrawn
    const UNASSIGNED = [golfer(7), golfer(8)];

    test('pairingsRows: two groups, seven in rows, two unassigned, and the partition is the whole field', () => {
        const sb = arrive(playerRecord());
        const out = sb.pairingsRows(playerRecord(), null);
        assert.equal(out.kind, 'player');
        assert.equal(out.rows.length, 2);
        const inRows = out.rows.flatMap(r => r.players.map(p => p.name));
        const un = out.unassigned.map(p => p.name);
        assert.deepEqual(sorted(inRows.concat(un)), sorted(ALL_NINE),
            'rows + unassigned must partition the player map - nobody missing, nobody twice');
        assert.deepEqual(sorted(un), sorted(UNASSIGNED));
    });

    test('the SHEET names all nine exactly once, including the withdrawn and the unassigned', () => {
        const { html } = printPairings(arrive(playerRecord()));
        assert.deepEqual(sorted(printedNames(html)), sorted(ALL_NINE));
        ALL_NINE.forEach(n => assert.equal(count(html, n), 1, n + ' must appear exactly once'));
    });

    test('WITHDRAWN, DEFECT 1: the golfer is on the sheet and flagged WD', () => {
        const { html } = printPairings(arrive(playerRecord()));
        const li = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(m => text(m[1]));
        const mine = li.filter(s => s.startsWith(WD));
        assert.equal(mine.length, 1, 'the withdrawn golfer is printed once');
        assert.match(mine[0], /\bWD$/, 'and flagged WD - the group must know their fourth is not coming');
        // Nobody else is flagged.
        assert.equal(li.filter(s => /\bWD$/.test(s)).length, 1);
        const sb = arrive(playerRecord());
        const out = sb.pairingsRows(playerRecord(), null);
        const p = out.rows.flatMap(r => r.players).find(x => x.name === WD);
        assert.ok(p && p.wd === true);
    });

    test('WITHDRAWN, DEFECT 2: the golfer is EXCLUDED from the total the starter counts against', () => {
        const sb = arrive(playerRecord());
        const out = sb.pairingsRows(playerRecord(), null);
        assert.equal(out.golferTotal, 6, 'seven in groups, one withdrawn: six carts');
        const t = text(printPairings(arrive(playerRecord())).html);
        assert.match(t, /\b6 golfers\b/);
        assert.ok(!/\b7 golfers\b/.test(t), 'a starter counting carts against 7 waits for a golfer who is not coming');
    });

    test('UNASSIGNED: a golfer in no group is listed under a counted heading, one per line', () => {
        const { html } = printPairings(arrive(playerRecord()));
        const t = text(html);
        assert.match(t, /UNASSIGNED \(2\)/);
        const at = html.indexOf('UNASSIGNED');
        UNASSIGNED.forEach(n => assert.ok(html.indexOf(n) > at, n + ' must be listed under the UNASSIGNED heading'));
        // And the group golfers are NOT under it.
        [golfer(0), golfer(4)].forEach(n => assert.ok(html.indexOf(n) < at));
    });

    test('with nobody unassigned, no UNASSIGNED block prints at all', () => {
        const rec = playerRecord();
        rec.scoringGroups.g2.playerIds.push('p7', 'p8');
        const { html } = printPairings(arrive(rec));
        assert.ok(!/UNASSIGNED/.test(html));
        assert.deepEqual(sorted(printedNames(html)), sorted(ALL_NINE));
    });

    test('groups sort by hole with the blank first; header says groups and golfers', () => {
        const { html } = printPairings(arrive(playerRecord()));
        assert.ok(html.indexOf('Group 2') < html.indexOf('Group 1'), 'Group 2 has no hole and prints first');
        assert.equal(count(html, 'HOLE NOT SET'), 1);
        const t = text(html);
        assert.match(t, /\b1 group has no starting hole\b/);
        assert.match(t, /\b2 groups\b/);
    });
});

// ===========================================================================
describe('INDIVIDUAL MODE, MULTI-ROUND - THE DRAW IS PER ROUND', () => {

    function multiRound() {
        const base = playerRecord();
        const r1Groups = base.scoringGroups;
        const r2Groups = {
            h1: { id: 'h1', name: 'Sunday A', playerIds: ['p0', 'p4', 'p7'], startingHole: '5', createdAt: 30 },
            h2: { id: 'h2', name: 'Sunday B', playerIds: ['p1', 'p5', 'p8'], startingHole: '6', createdAt: 40 }
        };
        return Object.assign(base, {
            eventModel: 'round-v1', scoringGroups: undefined,
            rounds: {
                r1: { id: 'r1', name: 'Saturday', status: 'setup', createdAt: 100, format: 'individual', scoringMode: 'gross',
                      courseName: 'Camas Meadows', courseData: COURSE, scoringGroups: r1Groups, scores: {} },
                r2: { id: 'r2', name: 'Sunday', status: 'setup', createdAt: 200, format: 'individual', scoringMode: 'gross',
                      courseName: 'Bandon Trails', courseData: COURSE, scoringGroups: r2Groups, scores: {} }
            }
        });
    }

    test('the sheet is the round being edited, by name and course, and its own draw', () => {
        const sb = arrive(multiRound());
        sb.editRound('r2');
        const { html } = printPairings(sb);
        const t = text(html);
        assert.match(t, /Sunday/);
        assert.match(t, /Bandon Trails/);
        assert.ok(html.indexOf('Sunday A') > -1 && html.indexOf('Sunday B') > -1);
        assert.ok(!/Group 1|Group 2/.test(html), 'Saturday\'s groups must not leak onto Sunday\'s sheet');
        // Sunday's draw: six in groups, three unassigned - still the whole field once each.
        assert.deepEqual(sorted(printedNames(html)), sorted([...Array(9)].map((_, i) => golfer(i))));
        assert.match(t, /UNASSIGNED \(3\)/);
    });

    test('with no round selected the organizer is told, and nothing prints', () => {
        const sb0 = arrive(multiRound());
        const alerts = [];
        sb0.alert = (m) => { alerts.push(String(m)); };
        const { html, calls } = printPairings(sb0);
        assert.equal(calls.print, 0, 'nothing to print: window.print must not open on an empty sheet');
        assert.equal([...html.matchAll(/<li\b/g)].length, 0);
        assert.equal(alerts.length, 1, 'the organizer is told once');
        assert.match(alerts[0], /round/i, 'and told what to do: pick a round');
        assert.ok(!sb0.document.body.classList.contains('printing-results'), 'the screen is not left hidden');
        const sb = arrive(multiRound());
        assert.equal(sb.pairingsRows(multiRound(), null).rows.length, 0);
    });
});
