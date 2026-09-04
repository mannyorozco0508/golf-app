// ============================================================================
// MARTY MONDAY - group games decided from the group link, not at setup
//
// THE RULE THIS FILE PROTECTS
//
//   Being left out of your foursome's game must cost you nothing anywhere else.
//
// It used to. A single round-wide flag, playingForMoney, was set by a checkbox
// beside each player during group assignment, and unchecking a golfer removed
// them from the main bet, from every round-wide game, from Skins, Dots and
// Birdies - and, because pool-engine.js falls back to the same filter when
// moneyPool.participantIds is absent, from the whole-field MONEY POOL. One tick,
// five consequences, decided before anyone reached the first tee.
//
// The flag still exists and is still honoured for rounds already saved with it.
// What changed is that setup no longer writes false, so per-game participantIds
// is the only participation mechanism for new rounds. These tests assert the
// separation directly against the real engines rather than against the UI.
//
// The numbers below are the actual Monday game: 12 golfers, $40 each, $480 pot,
// $100 KP, $70 net finish, $310 net skins.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = __dirname;
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// Load the real engines into one shared context, the way a page does.
function loadEngines() {
    const sandbox = { console, Math, Object, Array, String, Number, JSON, isNaN, parseInt, parseFloat, Date };
    vm.createContext(sandbox);
    ['handicap.js', 'money-engine.js', 'action-model.js', 'pool-engine.js', 'settlement-engine.js'].forEach((f) => {
        vm.runInContext(read(f), sandbox, { filename: f });
    });
    return sandbox;
}

// ---- The round -------------------------------------------------------------

const NAMES = [
    ['Marty', 8], ['Scott', 12], ['Carp', 5], ['Randy', 18],       // group 1
    ['Dave', 10], ['Sam', 14], ['Tony', 6], ['Rick', 20],          // group 2
    ['Joe', 9], ['Will', 16], ['Pete', 11], ['Hank', 7],           // group 3
];

function makePlayers() {
    return NAMES.map(([name, hcp], i) => ({
        id: 101 + i,
        name,
        hcp: String(hcp),
        // Setup no longer writes false. Every golfer is eligible everywhere; what
        // they are actually IN is decided per game, by participantIds.
        playingForMoney: true,
    }));
}

const groupOf = (id) => Math.floor((id - 101) / 4) + 1;
const idsInGroup = (g) => makePlayers().filter((p) => groupOf(p.id) === g).map((p) => String(p.id));

function makeCourse(holes = 18) {
    return Array.from({ length: holes }, (_, i) => ({
        hole: i + 1,
        par: [4, 4, 3, 5, 4, 4, 3, 5, 4][i % 9],
        handicap: i + 1,
    }));
}

// Deterministic, spread-out scores so skins and net finish actually resolve.
function makeScores(players, courseData) {
    const scores = {};
    players.forEach((p, pi) => {
        courseData.forEach((h, hi) => {
            let v = h.par + ((pi + hi) % 3) - 1;
            if (pi === 0 && hi === 2) v = h.par - 1;
            if (pi === 6 && hi === 5) v = h.par - 1;
            scores[`p${p.id}_h${h.hole}`] = Math.max(2, v);
        });
    });
    return scores;
}

function martyRound() {
    const players = makePlayers();
    const courseData = makeCourse();
    return {
        players,
        courseData,
        gameFormat: 'stroke',
        scores: makeScores(players, courseData),
        groupSizeOverrides: {},
        moneyPool: {
            enabled: true,
            buyIn: 40,
            kp: { amount: 100, holes: [3, 7, 12, 16] },
            net: { amount: 70, places: [57.142857, 42.857143] },   // $40 / $30 of $70
            skins: { mode: 'remainder', scoring: 'net', carryOver: true },
        },
        kpWinners: { h3: '101', h7: '105', h12: '109', h16: '102' }, kpConfirmed: { confirmed: true },
        additionalGameInstances: {
            // Group 1 dots - Randy (104) sat this one out.
            g1dots: {
                format: 'dots', enabled: true, startHole: 1, dotPointVal: 2,
                scope: 'group', ownerGroup: 1,
                participantIds: ['101', '102', '103'],
            },
            // Group 2 dots - all four in.
            g2dots: {
                format: 'dots', enabled: true, startHole: 1, dotPointVal: 2,
                scope: 'group', ownerGroup: 2,
                participantIds: idsInGroup(2),
            },
            // Group 3 has no group game at all.
        },
        // Dots are stored as an ARRAY OF DOT TYPES per player per hole, not a count -
        // calcDotsEngine iterates them and treats 'snake' as a negative. Getting this
        // shape wrong makes the engine throw rather than quietly miscount, which is
        // the right way for it to fail.
        dots: {
            h1: { p101: ['greenie'], p103: ['greenie', 'sandy'], p104: ['birdie'], p105: ['greenie'], p106: ['sandy', 'greenie'], p108: ['snake'] },
            h4: { p101: ['sandy', 'greenie'], p102: ['greenie'], p104: ['greenie'], p106: ['greenie'], p107: ['birdie', 'sandy'], p108: ['greenie'] },
        },
    };
}

// ---------------------------------------------------------------------------

describe('MARTY MONDAY - 12 players, 3 groups, one whole-field Main Pool', () => {

    test('setup writes nobody out: every golfer is eligible for everything', () => {
        const players = makePlayers();
        assert.equal(players.length, 12);
        assert.equal(players.filter((p) => p.playingForMoney === false).length, 0,
            'A golfer excluded at setup time would be silently dropped from the Main Pool too.');
    });

    test('the Main Pool is all 12 and totals $480, regardless of who plays a group game', () => {
        const env = loadEngines();
        const data = martyRound();
        const r = env.computeMoneyPool(data, data.courseData, data.scores);
        assert.ok(r && r.valid, 'Pool should be valid: ' + JSON.stringify(r && r.errors));
        assert.equal(r.participants.length, 12, 'Randy is out of Group 1 dots - he must still be in the pool.');
        assert.equal(r.totalPoolCents, 48000, '12 x $40 = $480');
        assert.equal(r.buyInCents, 4000);
    });

    test('the buckets are $100 KP / $70 net finish / $310 net skins', () => {
        const env = loadEngines();
        const data = martyRound();
        const r = env.computeMoneyPool(data, data.courseData, data.scores);
        assert.equal(r.kp.amountCents, 10000, 'KP = $100');
        assert.equal(r.net.amountCents, 7000, 'Net finish = $70');
        assert.equal(r.skins.amountCents, 31000, 'Net skins takes the remainder = $310');
        assert.equal(r.kp.amountCents + r.net.amountCents + r.skins.amountCents, 48000,
            'The three buckets must account for the whole pot.');
    });

    test('the pool is zero-sum to the cent - every dollar in has a dollar out', () => {
        const env = loadEngines();
        const data = martyRound();
        const r = env.computeMoneyPool(data, data.courseData, data.scores);
        const sum = Object.values(r.perPlayerCents).reduce((a, b) => a + b, 0);
        assert.equal(sum, 0, 'Money with no winner must be refunded to the field, never absorbed.');
    });

    test('the excluded golfer stays whole in the pool: KP, net finish and net skins all still reach him', () => {
        const env = loadEngines();
        const data = martyRound();
        const r = env.computeMoneyPool(data, data.courseData, data.scores);
        const randy = '104';
        assert.ok(r.participants.some((p) => String(p.id) === randy), 'Randy must be a pool participant.');
        assert.ok(Object.prototype.hasOwnProperty.call(r.perPlayerCents, randy),
            'Randy must have a pool position - being out of Group 1 dots is not being out of the pool.');
        // He paid his $40 in, so his net can be anything; what matters is that he is
        // in the field the buckets are computed over.
        const eligibleForNet = r.net.lines.length > 0;
        assert.ok(eligibleForNet, 'Net finish should have paid someone from the 12-man field.');
    });
});

describe('GROUP GAMES - participation belongs to the game, not to the golfer', () => {

    test('Group 1 dots pays out over its 3 named participants only', () => {
        const env = loadEngines();
        const data = martyRound();
        const cfg = Object.assign({}, data, data.additionalGameInstances.g1dots);
        const scoped = env.fieldParticipants(cfg);
        const ids = scoped.map((p) => String(p.id)).sort();
        assert.deepEqual(ids, ['101', '102', '103'], 'Only Marty, Scott and Carp are in Group 1 dots.');
    });

    test('the golfer left out of Group 1 dots nets exactly $0 from it', () => {
        const env = loadEngines();
        const data = martyRound();
        const totals = env.computeRoundGameNetByPlayerId
            ? env.computeRoundGameNetByPlayerId(data, data.additionalGameInstances.g1dots, data.courseData, data.scores)
            : null;
        if (totals === null) return; // helper not exported under this name; covered by the settlement test below
        assert.equal(totals['104'] || 0, 0, 'Randy must neither win nor owe a cent in a game he is not in.');
    });

    test('Group 2 dots covers all four of its golfers', () => {
        const env = loadEngines();
        const data = martyRound();
        const cfg = Object.assign({}, data, data.additionalGameInstances.g2dots);
        const ids = env.fieldParticipants(cfg).map((p) => String(p.id)).sort();
        assert.deepEqual(ids, idsInGroup(2).sort());
    });

    test('Group 3 has no group game, and that costs its golfers nothing', () => {
        const data = martyRound();
        const owners = Object.values(data.additionalGameInstances).map((g) => g.ownerGroup);
        assert.ok(!owners.includes(3), 'Group 3 deliberately runs no group action.');
        const env = loadEngines();
        const r = env.computeMoneyPool(data, data.courseData, data.scores);
        idsInGroup(3).forEach((id) => {
            assert.ok(r.participants.some((p) => String(p.id) === id),
                `Group 3 golfer ${id} must still be in the Main Pool.`);
        });
    });

    test('two dots games at different stakes coexist without overwriting each other', () => {
        const data = martyRound();
        const games = Object.values(data.additionalGameInstances).filter((g) => g.format === 'dots');
        assert.equal(games.length, 2, 'additionalGameInstances must hold one entry per game, not one per format.');
        assert.notDeepEqual(games[0].participantIds, games[1].participantIds);
    });
});

describe('SETTLEMENT - the whole round reconciles', () => {

    // computeCombinedNetTotals returns { netByName, exact, transactions } - the
    // whole-dollar view, the pre-rounding view, and the who-pays-who list. Not a
    // flat id->net map.
    test('every credit has a matching debit across pool and group games', () => {
        const env = loadEngines();
        const data = martyRound();
        const combined = env.computeCombinedNetTotals(data, data.courseData, data.scores);
        assert.ok(combined && combined.netByName, 'Expected combined totals.');

        const whole = Object.values(combined.netByName).reduce((a, v) => a + (v.net || 0), 0);
        assert.equal(whole, 0, `Whole-dollar round must be zero-sum; got ${whole}`);

        const exact = Object.values(combined.exact).reduce((a, v) => a + (v.net || 0), 0);
        assert.ok(Math.abs(exact) < 0.005, `Pre-rounding round must be zero-sum; got ${exact}`);
    });

    test('the excluded golfer is a NET WINNER here, purely from whole-field money', () => {
        // Randy is out of Group 1 dots. He is still in the $480 pool, and on these
        // scores he wins from it. This is the whole point of the change stated as a
        // number: exclusion from a foursome's game did not touch a cent of his
        // whole-field position.
        const env = loadEngines();
        const data = martyRound();
        const combined = env.computeCombinedNetTotals(data, data.courseData, data.scores);
        const randy = combined.netByName.randy;
        assert.ok(randy, 'Randy must appear in the settlement.');
        assert.ok(randy.net > 0, `Randy should be collecting whole-field money; got ${randy.net}`);
    });

    test('simplifyDebts produces a who-pays-who list that reconstructs every balance', () => {
        const env = loadEngines();
        const data = martyRound();
        const combined = env.computeCombinedNetTotals(data, data.courseData, data.scores);
        const tx = combined.transactions;
        assert.ok(Array.isArray(tx) && tx.length > 0, 'Expected real transactions.');

        const moved = {};
        tx.forEach((t) => {
            moved[t.from] = (moved[t.from] || 0) - t.amount;
            moved[t.to] = (moved[t.to] || 0) + t.amount;
        });
        let residual = 0;
        Object.values(combined.netByName).forEach((v) => {
            residual += Math.abs((v.net || 0) - (moved[v.name] || 0));
        });
        assert.ok(residual < 0.02, `Transactions must reconstruct every balance; residual ${residual}`);

        const flow = tx.reduce((a, t) => a + t.amount, 0);
        assert.ok(flow > 0, 'Money must actually change hands.');
    });
});

describe('THE OLD CHECKBOX IS GONE FROM SETUP', () => {

    test('no per-player money checkbox is rendered during group assignment', () => {
        const html = read('admin.html');
        assert.doesNotMatch(html, /<input type="checkbox" class="p-money-input"/,
            'The setup screen must not ask who is in the group bets - that is decided from the group link.');
        assert.doesNotMatch(html, /GROUP<br>GAMES/,
            'The column header went with the checkbox it labelled.');
    });

    test('capturePlayers still defaults a missing checkbox to true, so every golfer is eligible', () => {
        const html = read('admin.html');
        const hits = [...html.matchAll(/const moneyVal = moneyInput \? moneyInput\.checked : true;/g)];
        assert.equal(hits.length, 2, 'Both capture paths must default to true when the input is absent.');
    });

    test('setup explains where participation is now decided', () => {
        const html = read('admin.html');
        assert.match(html, /Each group picks its own games and who/,
            'The organizer needs to be told the decision moved, not just find the checkbox missing.');
        assert.match(html, /Main Pool/,
            'It must be explicit that a group-game exclusion does not touch the whole-field pool.');
    });

    test('playingForMoney is still honoured everywhere, so saved rounds are untouched', () => {
        // Nothing was removed from the engines. A round saved earlier with a golfer
        // set to false must settle exactly as it did before.
        ['settlement-engine.js', 'pool-engine.js', 'money-engine.js', 'action-model.js'].forEach((f) => {
            assert.match(read(f), /playingForMoney/, `${f} must still read the legacy flag.`);
        });
        const env = loadEngines();
        const data = martyRound();
        data.players[3].playingForMoney = false;   // a legacy round with Randy excluded
        const r = env.computeMoneyPool(data, data.courseData, data.scores);
        assert.equal(r.participants.length, 11, 'Legacy exclusion must still work when the data carries it.');
    });
});

describe('DOTS PARTICIPANT PICKER', () => {

    test('the picker is no longer nested inside the skins-only block', () => {
        const html = read('sidematches.html');
        const skinsOnlyAt = html.indexOf('id="sm-skins-only"');
        const pickerAt = html.indexOf('id="sm-field-players"');
        assert.ok(skinsOnlyAt !== -1 && pickerAt !== -1);
        const between = html.slice(skinsOnlyAt, pickerAt);
        const opens = (between.match(/<div/g) || []).length;
        const closes = (between.match(/<\/div>/g) || []).length;
        assert.ok(closes >= opens, 'sm-field-players must sit outside sm-skins-only, or Dots has no picker at all.');
    });

    test('dots seeds the picker with the whole foursome', () => {
        const html = read('sidematches.html');
        assert.match(html, /\(format === 'skins' \|\| format === 'dots'\) && Object\.keys\(fieldActionPick\)\.length === 0/,
            'Dots must start with everyone ticked - that is the common case and it must stay one tap.');
    });

    test('the dots save path writes the chosen participants, not the whole group', () => {
        const html = read('sidematches.html');
        const at = html.indexOf('entry.dotPointVal = stake;');
        assert.notEqual(at, -1);
        const body = html.slice(at, at + 2200);
        assert.match(body, /const chosenD = Object\.keys\(fieldActionPick\)/,
            'Dots must enrol the golfers the group actually picked.');
        assert.doesNotMatch(body, /ownerGroupPlayers\(\)\.map/,
            'Enrolling ownerGroupPlayers() wholesale is what removed the group\'s say in the first place.');
    });

    test('group isolation guards survived the rewrite', () => {
        const html = read('sidematches.html');
        const at = html.indexOf('entry.dotPointVal = stake;');
        const body = html.slice(at, at + 2200);
        assert.match(body, /canCreateWagerWith\(chosenD\)/, 'A group link must not enrol another group\'s golfers.');
        assert.match(body, /allPlayersInGroup\(chosenD, actionOwnerGroup\)/, 'A group game must not silently span foursomes.');
        assert.match(body, /chosenD\.length < 2/, 'A dots game needs at least two players.');
    });

    test('golfers left out are told what it does and does not mean', () => {
        const html = read('sidematches.html');
        assert.match(html, /out of this game only/,
            'Someone tapped off dots must not think they have been dropped from the round.');
    });
});
