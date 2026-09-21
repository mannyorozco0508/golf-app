// ============================================================================
// THE GAME TAB SHOWS THE NAME THE BOARD SHOWS (2026-09-21, v190)
//
// THE BUG (display only): the Game tab (v186) cut every golfer's name to its
// first whitespace token - game.html's own `first` formatter - so a roster
// stored as Randy T / Randy C / Matt M / Matt B / Matt H read as two Randys
// and three Matts in the Flights card, the Groups-in-tee-order card and the
// side-match team names. The leaderboard has always drawn those names with
// getSmartDisplayName: a first name unique in the roster stands alone
// ("Marty"); shared first names carry the last initial and a dot ("Randy T.",
// "Randy C."); same first AND same initial, the full stored name.
//
// THE FIX: getSmartDisplayName lifted VERBATIM from leaderboard.html into
// text-safe.js (one builder, two pages); leaderboard.html's inline copy
// deleted, its call sites unchanged; game.html's `first` calls it against the
// round's roster. The Weekly Game card prints no names and is asserted to have
// rendered without any - the positive control for "no names" being true.
//
// HARNESS: game.html is loaded at its URL and the round delivered through the
// listener it registered; the cards are read from innerHTML. The leaderboard's
// rendering of the same roster is compared string for string.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = makeCourseData(18);
// Two Randys, three Matts, each with a distinct initial; the rest unique.
const NAMES = ['Randy T', 'Ryan H', 'Anthony', 'Danny', 'Andy', 'Tim K', 'Jim B', 'Chris S', 'Randy C', 'Marty', 'Mike', 'Tanner', 'Glen', 'Manny', 'Kopp', 'Dalen', 'Matt M', 'Lance', 'Matt B', 'Paul', 'Bobby', 'Rocco', 'Matt H', 'Jeremy', 'Carl'];
// What the Board shows for each, spelled out: a shared first name carries its
// initial and a dot; a unique first name stands alone - so the stored "Ryan H",
// "Tim K", "Jim B", "Chris S" read Ryan, Tim, Jim, Chris here exactly as on the
// leaderboard (their initials are not needed to tell them apart).
const SHOWN = ['Randy T.', 'Ryan', 'Anthony', 'Danny', 'Andy', 'Tim', 'Jim', 'Chris', 'Randy C.', 'Marty', 'Mike', 'Tanner', 'Glen', 'Manny', 'Kopp', 'Dalen', 'Matt M.', 'Lance', 'Matt B.', 'Paul', 'Bobby', 'Rocco', 'Matt H.', 'Jeremy', 'Carl'];
const shown = n => SHOWN[NAMES.indexOf(n)];

function round() {
    const r = wizardSavedRound({ code: 'NAMES1', courseData: CD, thru: 18, golfers: 25, names: NAMES, hcps: NAMES.map((_, i) => (i * 7) % 20),
        overrides: { additionalGames: {}, flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' }, skinsSplit: 'even' } } });
    r.players.forEach((p, i) => { p.flight = i < 12 ? 'A' : 'B'; });
    const id = n => r.players[NAMES.indexOf(n)].id;
    r.sideMatches = { sm1: { enabled: true, format: 'nassau', scoring: 'net', stake: 10, teamAIds: [id('Randy T'), id('Matt M')], teamBIds: [id('Randy C'), id('Matt H')], nassauPressRule: '2down' } };
    return r;
}
function gameTab(data) {
    const sb = loadHtmlInlineScript('game.html', [], { search: '?game=names1' });
    vm.runInContext("document.__mount(document.getElementById('game-content'))", sb);
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/NAMES1');
    h.cb({ val: () => JSON.parse(JSON.stringify(data)), exists: () => true });
    const html = String(vm.runInContext("document.getElementById('game-content').innerHTML", sb));
    const card = head => { const a = html.indexOf(head); assert.ok(a > -1, 'no card ' + head); const e = html.indexOf('<div class="game-card">', a); return html.slice(a, e === -1 ? html.length : e); };
    const text = h => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    return { html, card: head => text(card(head)) };
}

describe('EVERY GAME-TAB CARD renders the name the Board would', () => {
    const g = gameTab(round());
    test('the Flights card: Randy T. and Randy C., Matt M. / Matt B. / Matt H.; every unique first name bare (Ryan H -> Ryan, as on the Board)', () => {
        const c = g.card('Flights');
        assert.match(c, /Flight A \(12\): Randy T\., Ryan, Anthony, Danny, Andy, Tim, Jim, Chris, Randy C\., Marty, Mike, Tanner/);
        assert.match(c, /Flight B \(13\): Glen, Manny, Kopp, Dalen, Matt M\., Lance, Matt B\., Paul, Bobby, Rocco, Matt H\., Jeremy, Carl/);
    });
    test('the Groups-in-tee-order card: the same names, group by group', () => {
        const c = g.card('Groups, in tee order');
        const groups = [];
        for (let i = 0; i < 25; i += 4) groups.push(NAMES.slice(i, i + 4).map(shown).join(', '));
        groups.forEach((names, i) => assert.match(c, new RegExp('Group ' + (i + 1) + ' ' + names.replace(/\./g, '\\.') + '(?: YOUR GROUP)?' + (i < 6 ? ' Group' : '$'))));
    });
    test('the side-match teams: "Randy T. & Matt M. vs Randy C. & Matt H."', () => {
        assert.match(g.card('Side action'), /Randy T\. & Matt M\. vs Randy C\. & Matt H\. — Nassau/);
    });
    test('NO bare "Randy" or "Matt" anywhere on the page - the initials survived every card', () => {
        const t = g.html.replace(/<[^>]+>/g, ' ');
        assert.doesNotMatch(t, /\bRandy\b(?! [TC]\.)/);
        assert.doesNotMatch(t, /\bMatt\b(?! [MBH]\.)/);
    });
    test('the Weekly Game card rendered and carries no golfer names (so the assertions above are not satisfied by an empty page)', () => {
        const c = g.card('Weekly Game');
        assert.match(c, /\$20 each · 25 golfers in · \$500 pot/);
        NAMES.forEach(n => assert.doesNotMatch(c, new RegExp('\\b' + n.split(' ')[0] + '\\b')));
    });
    test('the same roster on the leaderboard, string for string (text-safe.js getSmartDisplayName)', () => {
        const ts = require('./text-safe.js');
        const P = NAMES.map(n => ({ name: n }));
        assert.deepEqual(P.map(p => ts.getSmartDisplayName(p, P)), NAMES.map(shown));
        // and the leaderboard's own realm resolves the same function to the same answers
        const lb = loadHtmlInlineScript('leaderboard.html');
        lb.__P = P;
        assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(__P.map(p => getSmartDisplayName(p, __P)))', lb)), NAMES.map(shown));
    });
    test('a name is still escaped on the way in', () => {
        const d = round(); d.players[9].name = 'Mar<b>ty';
        const g2 = gameTab(d);
        assert.doesNotMatch(g2.html, /Mar<b>ty/); assert.match(g2.html, /Mar&lt;b&gt;ty/);
    });
});

describe('ONE BUILDER: the formatter lives in text-safe.js and nowhere else', () => {
    test('text-safe.js defines and exports it; leaderboard.html and game.html call it and define no copy', () => {
        const ts = read('text-safe.js');
        assert.match(ts, /^function getSmartDisplayName\(player, allPlayers\) \{/m);
        assert.match(ts, /module\.exports = \{ escapeHtml, getSmartDisplayName \};/);
        const lb = read('leaderboard.html'), gm = read('game.html');
        assert.doesNotMatch(lb, /function getSmartDisplayName/); assert.doesNotMatch(gm, /function getSmartDisplayName/);
        assert.equal((lb.match(/getSmartDisplayName\(p, players\)/g) || []).length, 2, "the leaderboard's two call sites, unchanged");
        assert.match(gm, /const first = \(p, players\) => escapeHtml\(getSmartDisplayName\(p, players \|\| \(currentData && currentData\.players\) \|\| \[\]\)\);/);
        assert.doesNotMatch(gm, /split\(' '\)\[0\]/, 'the first-token cut is gone');
        assert.match(lb, /<script src="text-safe\.js"><\/script>/); assert.match(gm, /<script src="text-safe\.js"><\/script>/);
    });
    test('the body is the leaderboard\'s, verbatim (the 2026-09-21 lift)', () => {
        const ts = read('text-safe.js');
        const fn = ts.slice(ts.indexOf('function getSmartDisplayName'), ts.indexOf('\n}\n', ts.indexOf('function getSmartDisplayName')) + 3);
        assert.match(fn, /if \(sameFirstAndInitial\.length === 1\) return `\$\{first\} \$\{lastInitial\}\.`;/);
        assert.match(fn, /return `\$\{first\} \$\{last\}`;/);
        assert.match(fn, /if \(sameFirstName\.length === 1\) return first;/);
    });
});
