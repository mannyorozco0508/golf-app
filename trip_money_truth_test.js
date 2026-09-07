// ============================================================================
// THE TRIP TOTAL TELLS THE TRUTH, OR IT DOES NOT SHOW A NUMBER
//
// TWO BUGS, ONE CARD, AND THE SECOND ONE COSTS MORE.
//
// 1. THE FOOTER WAS FALSE. The money card ended with
//
//      "Main-format bets only for now - Side Games, Side Matches, and one-off
//       Side Bets aren't included yet."
//
//    Side matches ARE included: a $50 side match moves a golfer's trip total from
//    +$10 to +$60, through the same computeCombinedNetTotals the trip calls. The
//    sentence was stale copy from an older implementation, and the code comment
//    130 lines above it already said so.
//
//    A group reading that line settles their side matches SEPARATELY, on top of a
//    total that already contains them. They pay twice. And it looks exactly like
//    the app working correctly - nothing is broken on screen, the arithmetic is
//    right, and the number is real. Only the sentence explaining it is a lie.
//
//    IT NOW SAYS WHAT IS INCLUDED, NOT WHAT IS NOT - and a positive list can go
//    stale in silence the same way, so it is DECLARED IN CODE and held against
//    what the engine actually emits. Every label computeCombinedNetTotals can add
//    to a golfer's ledger must be covered by a category the footer names. Add a
//    new money source to the engine and this suite fails until the copy catches up.
//
// 2. TWO GOLFERS WITH ONE NAME MERGE INTO ONE BALANCE. The trip is stitched
//    together by NAME, so two men called Mike Dunne become a single +$20 line, and
//    "Lance Webb -> Mike Dunne $10" names a person who could be either of them.
//    Proven in a browser: four golfers in, three out, and nothing said so.
//
//    The trip-wide total now REFUSES rather than guessing, and says which name in
//    which round. A warning above an authoritative dollar figure is the worst of
//    both - nobody reads it, and the number decides who pays.
//
//    SCOPED DELIBERATELY: only the TRIP-WIDE total refuses. Scoring, the
//    leaderboard and each round's own money are untouched.
//
// KNOWN AND OUT OF SCOPE BY INSTRUCTION: a single round's own Results page merges
// two same-named golfers exactly the same way, because computeCombinedNetTotals
// keys on the name. That is a real defect and it is not fixed here.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const TRIP = read('trip.html');
const ENGINE = read('settlement-engine.js');

const AM = loadJsFile('action-model.js', ['handicap.js', 'money-engine.js']);
const SE = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']);
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

// The list the footer is built from, read out of the page.
function declaredList() {
    const sb = loadHtmlInlineScript('trip.html',
        ['handicap.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
         'pool-engine.js', 'payouts.js', 'course-data.js']);
    return vm.runInContext('TRIP_TOTAL_INCLUDES', sb);
}
// Does the declared list cover this label? Categories are matched loosely on
// purpose: "Skins" is covered by "side games", not by a category called "Skins".
function covered(list, label, catalogLabels, mainLabels) {
    const l = String(label);
    const has = re => list.some(x => re.test(x));
    if (/^Side Match/.test(l)) return has(/side match/i);
    if (l === 'Birdie Pool') return has(/birdie/i);
    if (l === 'KP') return has(/\bKP/i);
    if (l === 'Main Pool') return has(/main pool/i);
    if (catalogLabels.indexOf(l) !== -1) return has(/side game/i);
    if (mainLabels.indexOf(l) !== -1) return has(/main game/i);
    return false;
}

// WHAT THE LEDGER ACTUALLY CALLS THE MAIN GAME, which is not what the setup screen
// calls it. computeCombinedNetTotals labels a game from ADDITIONAL_GAME_CATALOG if
// it is in there, and otherwise from the FORMAT KEY with its first letter
// capitalised - so a Match Play round produces a line called "Match", not "Match
// Play". Derived here the same way the engine derives it, rather than assuming the
// pretty label, because assuming it is what made this test fail against correct code.
function mainGameLedgerLabels(AMsb) {
    const keys = Object.keys(vm.runInContext('MAIN_GAME_LABELS', AMsb));
    const pretty = Object.values(vm.runInContext('MAIN_GAME_LABELS', AMsb));
    return keys.map(k => k.charAt(0).toUpperCase() + k.slice(1)).concat(pretty);
}

describe('THE FOOTER SAYS WHAT IS IN THE TOTAL', () => {

    test('the false sentence is gone', () => {
        assert.ok(!/Main-format bets only/.test(TRIP),
            'the trip still tells the group their side matches are not counted');
        assert.ok(!/aren't included yet/.test(TRIP));
    });

    test('it is built from a declared list, not a hand-written sentence', () => {
        const list = declaredList();
        assert.ok(Array.isArray(list) && list.length >= 4,
            'TRIP_TOTAL_INCLUDES is not a list: ' + JSON.stringify(list));
        assert.match(TRIP, /TRIP_TOTAL_INCLUDES/,
            'the footer does not render from the declared list');
    });

    test('it names the main game, side games and side matches at minimum', () => {
        const list = declaredList().join(' ').toLowerCase();
        ['main game', 'side game', 'side match'].forEach(c =>
            assert.ok(list.indexOf(c) !== -1, 'the footer never mentions ' + c));
    });

    // THE DRIFT GUARD. Every place the engine can add money to a golfer's ledger.
    // A new source added to settlement-engine.js changes this set and fails here,
    // which is the point: the copy cannot quietly stop describing the total.
    test('every money source the engine has is one this set knows about', () => {
        // Comments stripped first. addAmount is explained at length in prose right
        // above its own definition, and scanning that made this fail on the essay
        // rather than on the code.
        const code = ENGINE.replace(/\/\/.*$/gm, '');
        const args = (code.match(/addAmount\(\s*[^,()]+,\s*[^,()]+,\s*([^)]+)\)/g) || [])
            .map(m => m.replace(/.*,\s*([^)]+)\)$/, '$1').trim())
            .filter(Boolean);
        const seen = Array.from(new Set(args)).sort();
        assert.deepEqual(seen,
            ["'Birdie Pool'", "'KP'", 'MAIN_POOL_LEDGER_LABEL', 'label', 'smLabel', 'smLabel2'],
            'settlement-engine gained or renamed a money source; the trip footer '
            + 'must name it too. Found: ' + JSON.stringify(seen));
    });

    test('every SIDE GAME the catalog can produce is covered', () => {
        const cat = vm.runInContext('ADDITIONAL_GAME_CATALOG', AM);
        const catalogLabels = Object.keys(cat).map(k => cat[k].label);
        const mainLabels = mainGameLedgerLabels(AM);
        const list = declaredList();
        catalogLabels.forEach(l => assert.ok(covered(list, l, catalogLabels, mainLabels),
            'the footer does not cover the side game "' + l + '"'));
    });

    test('every MAIN GAME format is covered', () => {
        const cat = vm.runInContext('ADDITIONAL_GAME_CATALOG', AM);
        const catalogLabels = Object.keys(cat).map(k => cat[k].label);
        const mainLabels = mainGameLedgerLabels(AM);
        const list = declaredList();
        mainLabels.forEach(l => assert.ok(covered(list, l, catalogLabels, mainLabels),
            'the footer does not cover the main format "' + l + '"'));
    });

    test('the fixed sources are covered', () => {
        const list = declaredList();
        ['Birdie Pool', 'KP', 'Main Pool', 'Side Match · A vs B']
            .forEach(l => assert.ok(covered(list, l, [], []),
                'the footer does not cover "' + l + '"'));
    });

    // END TO END. Not "the list mentions side matches" but "a real side match
    // produces a label this list covers".
    test('a real round\'s emitted labels are all covered', () => {
        const P = [
            { id: 101, name: 'A', hcp: '0', team: 'Team 1', playingForMoney: true },
            { id: 102, name: 'B', hcp: '0', team: 'Team 1', playingForMoney: true },
            { id: 103, name: 'C', hcp: '0', team: 'Team 2', playingForMoney: true },
            { id: 104, name: 'D', hcp: '0', team: 'Team 2', playingForMoney: true }];
        const scores = {};
        P.forEach((p, i) => CD.forEach(h => { scores[`p${p.id}_h${h.hole}`] = i >= 2 ? 5 : 4; }));
        const data = { players: P, gameFormat: 'match', matchStake: 20, courseData: CD,
            scores, settlementMode: 'whole-dollar',
            sideMatches: { sm1: { format: 'match', scoring: 'gross', teamAIds: ['101'],
                                  teamBIds: ['103'], stake: 50, pressRule: 'none' } } };
        const r = SE.computeCombinedNetTotals(data, CD, scores);
        const labels = [];
        Object.keys(r.contributions).forEach(k =>
            (r.contributions[k].lines || []).forEach(l => {
                if (!l.rounding && labels.indexOf(l.label) === -1) labels.push(l.label);
            }));
        assert.ok(labels.length >= 2, 'the fixture produced no money: ' + JSON.stringify(labels));
        const cat = vm.runInContext('ADDITIONAL_GAME_CATALOG', AM);
        const catalogLabels = Object.keys(cat).map(k => cat[k].label);
        const mainLabels = mainGameLedgerLabels(AM);
        const list = declaredList();
        labels.forEach(l => assert.ok(covered(list, l, catalogLabels, mainLabels),
            'the engine produced "' + l + '" and the footer does not cover it'));
    });

    // The bug that started this: the side match must actually be IN the number.
    test('and a side match genuinely moves the total', () => {
        const P = [
            { id: 101, name: 'A', hcp: '0', team: 'Team 1', playingForMoney: true },
            { id: 102, name: 'B', hcp: '0', team: 'Team 1', playingForMoney: true },
            { id: 103, name: 'C', hcp: '0', team: 'Team 2', playingForMoney: true },
            { id: 104, name: 'D', hcp: '0', team: 'Team 2', playingForMoney: true }];
        const scores = {};
        P.forEach((p, i) => CD.forEach(h => { scores[`p${p.id}_h${h.hole}`] = i >= 2 ? 5 : 4; }));
        const base = { players: P, gameFormat: 'match', matchStake: 20, courseData: CD,
            scores, settlementMode: 'whole-dollar' };
        const withSide = Object.assign({}, base, {
            sideMatches: { sm1: { format: 'match', scoring: 'gross', teamAIds: ['101'],
                                  teamBIds: ['103'], stake: 50, pressRule: 'none' } } });
        const netOf = d => Object.values(SE.computeCombinedNetTotals(d, CD, scores).netByName)
            .filter(v => v.name === 'A')[0].net;
        assert.equal(netOf(base), 10);
        assert.equal(netOf(withSide), 60,
            'the side match is not in the total after all - then the old footer was right');
    });
});

// ---------------------------------------------------------------------------
// Arrives the way a golfer opening a shared trip link does: the page reads its own
// ?trip= parameter, registers its own listener, and fetches its own rounds. Only
// the data source is replaced.
function arriveOnTrip(rounds, counted) {
    const sb = loadHtmlInlineScript('trip.html',
        ['handicap.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js',
         'pool-engine.js', 'payouts.js', 'course-data.js'],
        { search: '?trip=MYR1', localStorage: true });
    vm.runInContext('alert = function () {}; confirm = function () { return true; };', sb);

    const tripRounds = {};
    Object.keys(rounds).forEach(code => {
        tripRounds[code] = { label: rounds[code].eventName || code, addedAt: 1,
            countsTowardTrip: counted ? counted[code] !== false : true };
    });
    // The page's OWN once() calls hit this, because it fetches each round from
    // inside the trip handler below.
    vm.runInContext(`
        __ROUNDS = ${JSON.stringify(rounds)};
        db.ref = function (p) {
            var parts = String(p).split('/').filter(Boolean);
            return {
                on: function () {}, set: function () { return Promise.resolve(); },
                update: function () { return Promise.resolve(); },
                remove: function () { return Promise.resolve(); },
                push: function () { return { key: 'K1' }; },
                once: function () {
                    var v = (parts[0] === 'events') ? (__ROUNDS[parts[1]] || null) : null;
                    return Promise.resolve({ val: function () { return v; },
                                             exists: function () { return v != null; } });
                }
            };
        };
    `, sb);

    const handlers = sb.__dbHandlers.filter(h => h.event === 'value' && /^trips\//.test(h.path));
    assert.ok(handlers.length > 0, 'the page registered no trip listener');
    handlers.forEach(h => h.cb({ val: () => ({ name: 'Myrtle Beach', createdAt: 1, rounds: tripRounds }) }));
    return sb;
}
const money = sb => vm.runInContext('document.getElementById("trip-money-settlement").innerHTML', sb);
const settle = () => new Promise(r => setTimeout(r, 30));

const teamed = list => list.map(p => Object.assign({}, p, {
    team: ['a', 'b', 'mike dunne'].indexOf(p.name.trim().toLowerCase()) !== -1 ? 'Team 1' : 'Team 2',
    playingForMoney: true }));
const roundOf = (players, name) => {
    const scores = {};
    players.forEach(p => CD.forEach(h => {
        scores[`p${p.id}_h${h.hole}`] = p.team === 'Team 1' ? 4 : 5; }));
    return { eventName: name, gameFormat: 'match', matchStake: 20, players,
             courseData: CD, scores, settlementMode: 'whole-dollar' };
};
const CLEAN = teamed([{ id: 101, name: 'A', hcp: '0' }, { id: 102, name: 'B', hcp: '0' },
                      { id: 103, name: 'C', hcp: '0' }, { id: 104, name: 'D', hcp: '0' }]);
const MIKES = teamed([{ id: 101, name: 'Mike Dunne', hcp: '0' }, { id: 102, name: 'Mike Dunne', hcp: '0' },
                      { id: 103, name: 'C', hcp: '0' }, { id: 104, name: 'D', hcp: '0' }]);
const BLANK = teamed([{ id: 101, name: 'A', hcp: '0' }, { id: 102, name: 'Player 2', hcp: '0' },
                      { id: 103, name: 'C', hcp: '0' }, { id: 104, name: 'D', hcp: '0' }]);

describe('A NAME THAT CANNOT IDENTIFY A GOLFER REFUSES THE TRIP TOTAL', () => {

    test('a clean trip shows its total', async () => {
        const sb = arriveOnTrip({ DAY1: roundOf(CLEAN, 'Caledonia') });
        await settle();
        const h = money(sb);
        assert.match(h, /Net Across the Trip/, 'a perfectly good trip was refused');
        assert.match(h, /Who Pays Who/);
    });

    test('THE REPORTED BUG: two golfers with one name refuse it', async () => {
        const sb = arriveOnTrip({ DAY1: roundOf(MIKES, 'Caledonia') });
        await settle();
        const h = money(sb);
        assert.ok(!/Net Across the Trip/.test(h),
            'two men called Mike Dunne were still merged into one balance');
        assert.ok(!/Who Pays Who/.test(h),
            'the trip still tells somebody to pay a name that could be either man');
    });

    // SCOPED TO THE REFUSAL CARD ITSELF. The round's name also appears in the
    // per-round breakdown below, so asserting it anywhere in the html passes even
    // when the refusal names no round at all - which is exactly what a control
    // removing it proved.
    const refusalCard = h => {
        const at = h.indexOf('Trip Total Not Shown');
        if (at === -1) return '';
        const end = h.indexOf('Per-Round Breakdown', at);
        return h.slice(at, end === -1 ? h.length : end);
    };

    test('and it says which name, in which round', async () => {
        const sb = arriveOnTrip({ DAY1: roundOf(MIKES, 'Caledonia') });
        await settle();
        const card = refusalCard(money(sb));
        assert.ok(card, 'there is no refusal card at all');
        assert.match(card, /Mike Dunne/i, 'the refusal does not name the golfer');
        assert.match(card, /Caledonia/, 'the refusal does not say which round to fix');
        assert.match(card, /rename|same name|told apart/i,
            'the refusal does not say what to do: ' + card.replace(/<[^>]*>/g, ' ').slice(0, 200));
    });

    test('a placeholder refusal names its round too', async () => {
        const sb = arriveOnTrip({ DAY1: roundOf(BLANK, 'Caledonia') });
        await settle();
        const card = refusalCard(money(sb));
        assert.match(card, /Player 2/, 'the refusal does not name the placeholder');
        assert.match(card, /Caledonia/, 'the refusal does not say which round to fix');
    });

    test('placeholder names refuse it too', async () => {
        const sb = arriveOnTrip({ DAY1: roundOf(BLANK, 'Caledonia') });
        await settle();
        const h = money(sb);
        assert.ok(!/Net Across the Trip/.test(h),
            'a trip total was built on a golfer called "Player 2"');
        assert.match(h, /Player 2/, 'the refusal does not name the placeholder');
    });

    // SCOPED. Only the trip-wide total refuses.
    test('the per-round breakdown still shows — per-round money is unblocked', async () => {
        const sb = arriveOnTrip({ DAY1: roundOf(MIKES, 'Caledonia') });
        await settle();
        assert.match(money(sb), /Per-Round Breakdown/,
            'a name problem blocked a round its own Results page would still show');
    });

    test('and the leaderboard is untouched — scoring is unblocked', async () => {
        const sb = arriveOnTrip({ DAY1: roundOf(MIKES, 'Caledonia') });
        await settle();
        const lb = vm.runInContext('document.getElementById("trip-leaderboard").innerHTML', sb);
        assert.ok(lb && lb.length > 0, 'a name problem stopped the trip showing scores');
    });

    test('a clean round is not refused because ANOTHER round is dirty… it is', async () => {
        // Deliberate: the TRIP total spans every counted round, so one bad round
        // makes the whole total unsafe. The per-round breakdown still carries the
        // clean round's own money.
        const sb = arriveOnTrip({ DAY1: roundOf(CLEAN, 'Caledonia'),
                                  DAY2: roundOf(MIKES, 'True Blue') });
        await settle();
        const h = money(sb);
        assert.ok(!/Net Across the Trip/.test(h), 'one unsafe round did not stop the total');
        assert.match(refusalCard(h), /True Blue/,
            'the refusal does not name the round at fault');
        assert.match(h, /Per-Round Breakdown/, 'the clean round lost its own money too');
    });

    test('an EXCLUDED dirty round does not refuse the trip', async () => {
        const sb = arriveOnTrip({ DAY1: roundOf(CLEAN, 'Caledonia'),
                                  DAY2: roundOf(MIKES, 'True Blue') }, { DAY2: false });
        await settle();
        assert.match(money(sb), /Net Across the Trip/,
            'a round nobody counts blocked the total anyway');
    });
});

describe('ONE DEFINITION OF WHAT A NAME IS', () => {

    test('the trip uses action-model’s normaliser, not a fourth regex', () => {
        assert.ok(!/\/\^player \\d\+\$\//.test(TRIP),
            'the hand-rolled placeholder regex is still here - it demands a space, '
            + 'so "Player3" slips past it');
        assert.match(TRIP, /isPlaceholderPlayerName/,
            'the trip does not use the shared placeholder rule');
        assert.match(TRIP, /normalisePlayerName/,
            'the trip does not use the shared normaliser');
    });

    test('and the shared rule catches what the old regex missed', () => {
        assert.equal(AM.isPlaceholderPlayerName('Player3'), true);
        assert.equal(AM.isPlaceholderPlayerName('Player 3'), true);
        assert.equal(AM.isPlaceholderPlayerName('Mike Dunne'), false);
    });
});
