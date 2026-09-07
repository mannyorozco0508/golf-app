// ============================================================================
// A REFUSAL IS A PROPERTY OF THE TRIP, NOT OF EACH PANEL
//
// THE WORST INSTANCE OF THIS BUG WE HAVE FOUND. The trip money panel refused to
// show a total when two golfers could not be told apart - "would send money to the
// wrong person" - and the SHARED RECAP TEXT printed it anyway:
//
//     💵 FINAL SETTLEMENT
//     Zach Hill owes Mike Dunne $1
//
// That string goes on the clipboard, into a group chat, and gets used to settle up.
// The one surface that LEAVES THE APP was the one still publishing the merge.
//
// It happened because each panel asked the question for itself and the recap asked
// nobody. So the gate is computed ONCE for the trip, and everything that attributes
// anything to a golfer obeys it: money, awards, the cumulative board, the points
// race, the recap card and the recap text. If a trip cannot tell two golfers apart,
// nothing that names a golfer publishes.
//
// AND ONE LAYER DOWN. The cumulative board rendered "Mike Dunne · 4 rounds played"
// on a TWO-ROUND trip. Two men's rounds added together produced a number that
// cannot exist, and nothing looked at it. A golfer's round count can never exceed
// the number of counted rounds; that invariant is cheap, independent of the name
// rule, and would have caught this on its own.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const DEPS = ['money-engine.js', 'action-model.js', 'settlement-engine.js',
              'pool-engine.js', 'score-marks.js'];
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

function roundOf(label, names, tweak, extra) {
    const players = names.map((n, i) =>
        ({ id: 101 + i, name: n, hcp: String(i * 2), playingForMoney: true }));
    const scores = {};
    players.forEach(p => cd18.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4; }));
    if (tweak) tweak(scores);
    return Object.assign({ eventName: label, roundDay: label, courseName: 'Caledonia',
        gameFormat: 'stroke', courseData: cd18, players, scores,
        settlementMode: 'whole-dollar' }, extra || {});
}

const CLEAN = ['Marty Sharp', 'Carp Dean', 'Lance Webb', 'Zach Hill'];
const MIKES = ['Mike Dunne', 'Mike Dunne', 'Lance Webb', 'Zach Hill'];

// A trip with money on it, so the settlement block has something to publish.
function trip(names, opts) {
    const o = opts || {};
    const sb = loadHtmlInlineScript('trip.html', DEPS);
    const rounds = [
        roundOf('Day 1', names, s => { [1, 3].forEach(h => s['p101_h' + h] = 3); s['p102_h7'] = 11; },
            { sideMatches: { m1: { format: 'match', scoring: 'net', stake: 50, startHole: 1,
                                   createdAt: 1, teamAIds: ['101'], teamBIds: ['102'] } } }),
        roundOf('Day 2', names, s => { s['p101_h2'] = 3; }, o.day2 || {})
    ];
    const linked = rounds.map((r, i) => ({ code: 'R' + i, label: r.eventName,
        countsTowardTrip: o.exclude === i ? false : true, data: r }));
    vm.runInContext(`
        tripData = { name: 'Myrtle Beach 2026' };
        currentTripCode = 'TRIP1';
        cachedRoundResults = ${JSON.stringify(linked)};
        cachedCountedResults = cachedRoundResults.filter(r => r.countsTowardTrip);
        window.__alerts = []; alert = m => window.__alerts.push(String(m));
        renderCumulativeLeaderboard();
        renderTripMoneySettlement();
        renderTripAwards();
        renderPointsRace();
    `, sb);
    const el = id => strip(String((sb.document.getElementById(id) || {}).innerHTML || ''));
    return {
        sb,
        run: c => vm.runInContext(c, sb),
        money: () => el('trip-money-settlement'),
        awards: () => el('trip-awards'),
        board: () => el('trip-cumulative-leaderboard') || el('trip-leaderboard')
                     || el('trip-scores') || el('trip-standings'),
        points: () => el('trip-points-race'),
        text: () => String(vm.runInContext('buildShareRecapText()', sb)),
        card: () => { vm.runInContext('openTripRecap();', sb); return el('trip-recap-card'); },
    };
}

// ---------------------------------------------------------------------------
describe('ONE GATE, CHECKED ONCE', () => {

    test('the trip computes its identity problems in one place', () => {
        const src = read('trip.html').replace(/\/\/.*$/gm, '');
        assert.match(src, /cachedIdentityProblems/,
            'there is no single trip-level answer for every surface to obey');
        // Each surface must ASK, not re-run the detector for itself.
        assert.ok((src.match(/tripIdentityProblems\(/g) || []).length <= 2,
            'the detector is still being run per panel: '
            + (src.match(/tripIdentityProblems\(/g) || []).length + ' call sites');
    });

    test('every attributing surface asks the same question', () => {
        const src = read('trip.html').replace(/\/\/.*$/gm, '');
        ['renderCumulativeLeaderboard', 'renderTripMoneySettlement', 'renderTripAwards',
         'renderPointsRace', 'renderTripRecapCard', 'buildShareRecapText'].forEach(fn => {
            const at = src.indexOf('function ' + fn);
            assert.ok(at > -1, fn + ' is gone');
            const body = src.slice(at, src.indexOf('\n    function ', at + 30));
            assert.match(body, /tripAttributionBlocked\(\)|cachedIdentityProblems/,
                fn + ' publishes without asking whether the trip can name a golfer');
        });
    });
});

// ---------------------------------------------------------------------------
describe('NOTHING THAT NAMES A GOLFER PUBLISHES', () => {

    test('THE WORST ONE: the clipboard carries no money', () => {
        const t = trip(MIKES).text();
        assert.ok(!/owes/i.test(t), 'money the screen refused went to the group chat: ' + t);
        assert.ok(!/SETTLEMENT/i.test(t), 'a settlement block was published: ' + t);
    });

    // Asserted on the BLOCK HEADERS, not on bare words: the refusal legitimately
    // says "standings, money, points and awards would all be credited to the wrong
    // man", and an earlier draft failed on its own explanation.
    test('and no standings, points race or awards', () => {
        const t = trip(MIKES).text();
        assert.ok(!/\u{1F3C6} STANDINGS/u.test(t), 'standings published: ' + t);
        assert.ok(!/POINTS RACE\n/u.test(t), 'points race published: ' + t);
        assert.ok(!/\u{1F3C5} AWARDS/u.test(t), 'awards published: ' + t);
        assert.ok(!/Mike Dunne\s*—\s*\d/.test(t), 'a merged total was published: ' + t);
        assert.ok(!/\d+\. /.test(t), 'a ranked list was published: ' + t);
    });

    test('IT SAYS WHY, rather than arriving as an empty message', () => {
        const t = trip(MIKES).text();
        assert.match(t, /Mike Dunne/, 'the reason does not name the golfer: ' + t);
        assert.match(t, /same name|told apart|cannot be told/i, 'no reason given: ' + t);
        assert.match(t, /rename/i, 'it does not say what to do: ' + t);
    });

    test('the recap CARD refuses too — it is the screenshotted half', () => {
        const c = trip(MIKES).card();
        // Same reasoning: the card's reason names the categories it is withholding.
        assert.match(c, /RECAP NOT SHOWN/i, 'the card published as normal: ' + c);
        assert.ok(!/rc-award|POS |Net \d/.test(c), 'the card published rows: ' + c);
        assert.match(c, /told apart|same name/i, 'the card gives no reason: ' + c);
    });

    test('the cumulative board refuses, where it used to merge', () => {
        const b = trip(MIKES).board();
        assert.ok(!/4 rounds played/i.test(b), 'the impossible count is still on screen: ' + b);
        assert.ok(!/Net 287|287/.test(b), 'two golfers’ scores are still added together: ' + b);
    });

    // Asserted on a NAME, not on "pts": that word belongs to the shared text, not
    // to the panel, so an earlier draft of this passed against an empty panel and
    // proved nothing.
    // The refusal NAMES him, correctly - so this asserts on the attribution, not on
    // the name. An earlier draft forbade the name and would have failed on a correct
    // refusal.
    test('the points race refuses', () => {
        const p = trip(MIKES).points();
        assert.ok(!/Pos\s+Player\s+Points/i.test(p), 'a points table was published: ' + p);
        assert.match(p, /Not Shown/i, 'the panel went blank instead of explaining: ' + p);
    });

    // THE OTHER HALF. A gate that fires on a clean trip is a broken app.
    test('a clean trip publishes everything', () => {
        const t = trip(CLEAN);
        const text = t.text();
        assert.match(text, /STANDINGS/i);
        assert.match(text, /SETTLEMENT/i);
        assert.match(text, /POINTS RACE/i);
        assert.match(text, /AWARDS/i);
        assert.match(t.money(), /\$/, 'a clean trip lost its money panel');
        assert.match(t.board(), /Marty Sharp/, 'a clean trip lost its board');
        assert.match(t.points(), /Marty Sharp/, 'a clean trip lost its points race');
    });
});

// ---------------------------------------------------------------------------
describe('A ROUND COUNT CANNOT EXCEED THE ROUNDS THAT COUNT', () => {

    test('the invariant exists and is its own check, not a re-run of the name rule', () => {
        const src = read('trip.html').replace(/\/\/.*$/gm, '');
        assert.match(src, /function tripRoundCountProblems/,
            'nothing looks at an impossible round count');
    });

    test('two golfers under one name trip it', () => {
        const sb = loadHtmlInlineScript('trip.html', DEPS);
        const counted = [
            { label: 'Day 1', data: roundOf('Day 1', MIKES) },
            { label: 'Day 2', data: roundOf('Day 2', MIKES) }
        ];
        const out = JSON.parse(vm.runInContext(
            'JSON.stringify(tripRoundCountProblems(' + JSON.stringify(counted) + '))', sb));
        assert.ok(out.length > 0, 'a golfer playing 4 of 2 rounds was accepted');
        assert.match(JSON.stringify(out), /Mike Dunne/);
    });

    test('and a clean trip does not trip it', () => {
        const sb = loadHtmlInlineScript('trip.html', DEPS);
        const counted = [
            { label: 'Day 1', data: roundOf('Day 1', CLEAN) },
            { label: 'Day 2', data: roundOf('Day 2', CLEAN) }
        ];
        assert.deepEqual(JSON.parse(vm.runInContext(
            'JSON.stringify(tripRoundCountProblems(' + JSON.stringify(counted) + '))', sb)), []);
    });

    // IT MUST CONTRIBUTE TO THE GATE, not merely exist. On today's data the name
    // rule already fires on the same trip, so deleting this invariant from
    // recomputeTripGate() changed nothing and no test noticed - it was defence in
    // depth that nothing depended on. Here the NAME rule is switched off and the
    // invariant has to block the trip by itself, which is exactly the job it is kept
    // for: catching the next merge the name rule does not see.
    test('it blocks the trip on its own, with the name rule switched off', () => {
        const sb = loadHtmlInlineScript('trip.html', DEPS);
        const linked = [
            { code: 'R0', label: 'Day 1', countsTowardTrip: true, data: roundOf('Day 1', MIKES) },
            { code: 'R1', label: 'Day 2', countsTowardTrip: true, data: roundOf('Day 2', MIKES) }
        ];
        vm.runInContext(`
            tripData = { name: 'T' }; currentTripCode = 'T1';
            cachedRoundResults = ${JSON.stringify(linked)};
            cachedCountedResults = cachedRoundResults;
            alert = function () {};
            tripIdentityProblems = function () { return []; };
            recomputeTripGate();
        `, sb);
        assert.equal(vm.runInContext('tripAttributionBlocked()', sb), true,
            'with the name rule silent, an impossible round count published anyway');
        assert.match(vm.runInContext('JSON.stringify(cachedIdentityProblems)', sb),
            /impossible-rounds/);
    });

    test('and with the name rule silent, a clean trip still publishes', () => {
        const sb = loadHtmlInlineScript('trip.html', DEPS);
        const linked = [
            { code: 'R0', label: 'Day 1', countsTowardTrip: true, data: roundOf('Day 1', CLEAN) },
            { code: 'R1', label: 'Day 2', countsTowardTrip: true, data: roundOf('Day 2', CLEAN) }
        ];
        vm.runInContext(`
            tripData = { name: 'T' }; currentTripCode = 'T1';
            cachedRoundResults = ${JSON.stringify(linked)};
            cachedCountedResults = cachedRoundResults;
            alert = function () {};
            tripIdentityProblems = function () { return []; };
            recomputeTripGate();
        `, sb);
        assert.equal(vm.runInContext('tripAttributionBlocked()', sb), false,
            'the invariant blocks a trip that is perfectly fine');
    });

    test('a golfer who skips a day is not a problem', () => {
        const sb = loadHtmlInlineScript('trip.html', DEPS);
        const counted = [
            { label: 'Day 1', data: roundOf('Day 1', CLEAN) },
            { label: 'Day 2', data: roundOf('Day 2', ['Marty Sharp', 'Carp Dean']) }
        ];
        assert.deepEqual(JSON.parse(vm.runInContext(
            'JSON.stringify(tripRoundCountProblems(' + JSON.stringify(counted) + '))', sb)), []);
    });
});

// ---------------------------------------------------------------------------
describe('THE SHARED TEXT CARRIES ITS OWN CONTEXT', () => {

    test('it says how many rounds it covers', () => {
        assert.match(trip(CLEAN).text(), /2 rounds/i,
            'a recap lands in a chat with no idea how much golf it describes');
    });

    test('it says when a linked round is NOT in the totals', () => {
        const t = trip(CLEAN, { exclude: 1 }).text();
        assert.match(t, /1 round\b/i, 'the round count does not follow the exclusion');
        assert.match(t, /excluded|not counted|left out/i,
            'a round was silently dropped from the totals: ' + t);
    });

    test('a trip with nothing excluded says nothing about exclusions', () => {
        assert.ok(!/excluded|not counted|left out/i.test(trip(CLEAN).text()),
            'a caveat appears on a trip that has none');
    });

    test('the sandbagger carries his number, as the card does', () => {
        const t = trip(CLEAN).text();
        if (/Sandbagger/.test(t)) {
            assert.match(t, /Sandbagger[^\n]*\d/,
                'the text names him with no number while the card gives the strokes');
        }
    });

    // NOT CHANGED, AND HERE IS WHY. 🏆 heading both STANDINGS and POINTS RACE looks
    // like a duplicate, and the request was to stop it - but rattle_icon_system_test
    // holds the opposite position deliberately: 🏆 MEANS ranking, both blocks are
    // rankings, and 🎖️ is on the RETIRED list with the stated reason "duplicated 🏆
    // for standings". Swapping it back in reddens that suite.
    //
    // So the glyph is pinned here to what the icon system says, and changing it is an
    // icon-system decision rather than a recap one.
    test('both ranking blocks use the ranking glyph, per the icon system', () => {
        const t = trip(CLEAN).text();
        assert.match(t, /\u{1F3C6} STANDINGS/u);
        assert.match(t, /\u{1F3C6} POINTS RACE/u);
        assert.ok(!/\u{1F396}/u.test(t), 'the retired military medal is back');
    });
});

// ---------------------------------------------------------------------------
describe('FINAL IS EARNED IN THE SHARED TEXT TOO', () => {

    // An unconfirmed KP is real money nobody has resolved.
    // THE POOL MUST BE VALID OR THIS PROVES NOTHING. computeMoneyPool returns
    // valid:false when the pot is over-allocated - four golfers at $40 is $160, so a
    // $100 KP plus a $70 net prize cannot fit - and an invalid pool is never
    // unresolved, so the first draft of this fixture made the flag look broken when
    // it was the fixture that was. Asserted below rather than assumed.
    const unresolved = { moneyPool: { enabled: true, buyIn: 40,
        kp: { amount: 40, holes: [3, 7, 12, 16] },
        net: { amount: 70, places: [100] },
        skins: { mode: 'remainder', scoring: 'net', carryOver: false } } };

    test('the fixture really does leave money unresolved', () => {
        const t = trip(CLEAN, { day2: unresolved });
        assert.equal(t.run('cachedTripSettled'), false,
            'the trip reports itself settled, so the assertion below is vacuous');
    });

    test('an unconfirmed round is NOT called final', () => {
        const t = trip(CLEAN, { day2: unresolved });
        assert.ok(!/FINAL SETTLEMENT/.test(t.text()),
            'the recap calls the week final while money is still live: ' + t.text());
        assert.match(t.text(), /NOT FINAL|SO FAR/i);
    });

    test('and a resolved one still is', () => {
        assert.match(trip(CLEAN).text(), /FINAL SETTLEMENT/,
            'a settled trip is never called final, so the flag says nothing');
    });
});
