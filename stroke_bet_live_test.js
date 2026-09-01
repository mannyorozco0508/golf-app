// ============================================================================
// LIVE STROKE BET — $/hole and $/overall side matches
//
// A stroke side match settles, pays and is zero-sum, and during play the golfer
// saw only "NET TO PAR" - the round's standings, not the wager. The same failure
// that hid a real Nassau, then Hi-Lo. This was the last money game with no live
// status.
//
// A FOURTH SIBLING. buildLiveMatchStates is segments and presses;
// buildLivePointsState is a running total per player; buildLiveHiLoState is two
// team contests. A stroke bet is TWO INDEPENDENT WAGERS in one record, either of
// which may be off. Bending an existing shape to cover it would describe the
// wrong game.
//
// CARRY IS GAME STATE, NOT MONEY. A halved hole raises what the NEXT hole is
// worth, so "next hole $10" belongs on the card. A running payout does not -
// settlement is final only in Results.
//
// PARITY: calculateStrokeHeadToHead and calculateStrokePressSet are duplicated
// across money-engine.js and index.html and were ALREADY covered by
// parity_test.js. Verified in agreement before this batch; asserted again here.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const IDX = ['score-marks.js','money-engine.js','action-model.js','settlement-engine.js',
             'pool-engine.js','bet-strip.js','hole-events.js'];
const LB = ['handicap.js','money-engine.js','action-model.js','settlement-engine.js'];

function engines() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['handicap.js','money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const FOUR = ['Marty','Manny','Carp','Scott'].map((n,i) => ({ id:101+i, name:n, hcp:'0' }));

// EXACTLY the payload sidematches.html writes for a stroke wager.
function wager(over) {
    return Object.assign({
        format:'stroke', scoring:'gross', teamAIds:['101'], teamBIds:['102'],
        startHole:1, holeStake:5, overallStake:20,
        tieRule:'carry', overallMode:'stroke', segment:'full',
    }, over || {});
}
// wins: { hole: playerId } gives that player a 3 instead of a 4.
function round({ thru = 6, wins = { 1:101, 2:101, 4:102 }, wagers = null, hcps = null } = {}) {
    const ps = hcps ? FOUR.map((p,i) => Object.assign({}, p, { hcp: String(hcps[i]) })) : FOUR;
    const sc = {};
    ps.forEach(p => cd18.forEach(h => { if (h.hole <= thru) sc['p'+p.id+'_h'+h.hole] = 4; }));
    Object.keys(wins).forEach(h => { if (+h <= thru) sc['p'+wins[h]+'_h'+h] = 3; });
    return { players: ps, courseData: cd18, scores: sc, gameFormat: 'stroke',
             settlementMode: 'whole-dollar',
             sideMatches: wagers || { s1: wager() } };
}
const states = (d, visible) => engines()
    .buildLiveStrokeBetStates(d, cd18, d.scores, visible || null);
const one = (d, visible) => states(d, visible)[0];

function scorecard(d, groupIds) {
    const sb = loadHtmlInlineScript('index.html', IDX);
    vm.runInContext(`currentMode='A'; currentData=${JSON.stringify(d)};
        ${groupIds ? 'window.__scFilteredPlayers=' + JSON.stringify(groupIds.map(id => ({ id }))) + ';' : ''}
        renderLiveTicker();`, sb);
    return sb.document.getElementById('live-ticker-mount').innerHTML;
}
function leaderboard(d) {
    const sb = loadHtmlInlineScript('leaderboard.html', LB);
    vm.runInContext(`currentBoardData=${JSON.stringify(d)}; activeView='individual';
        groupViewMode='flat'; activeScoring='net'; renderBoard();`, sb);
    return sb.document.getElementById('live-strokebet-mount').innerHTML;
}
const lastCard = (html) => {
    const i = html.lastIndexOf('<div class="lg-card"');
    return i < 0 ? '' : html.slice(i, html.lastIndexOf('</div>'));
};

// ============================================================================

describe('THE ENGINES ARE CANONICAL AND IN AGREEMENT', () => {

    const CASES = {
        'p1 ahead':   { wins: { 1:101 } },
        'p2 ahead':   { wins: { 1:102 } },
        'all square': { wins: {} },
        'net strokes':{ wins: { 1:101 }, hcps: [0,18,0,0] },
        'plus hcp':   { wins: { 1:101 }, hcps: ['+2',10,0,0] },
        'partial 9':  { wins: { 1:101 }, thru: 9 },
        'blow-up':    { wins: {}, thru: 6 },
    };
    Object.keys(CASES).forEach(name => {
        test(name + ': money-engine and index.html agree exactly', () => {
            const d = round(CASES[name]);
            const E = engines();
            const ix = loadHtmlInlineScript('index.html', IDX);
            const ps = [d.players[0], d.players[1]];
            const a = E.calculateStrokeHeadToHead(ps, cd18, d.scores, 'gross', 20);
            const b = JSON.parse(JSON.stringify(
                vm.runInContext('calculateStrokeHeadToHead', ix)(ps, cd18, d.scores, 'gross', 20)));
            assert.equal(JSON.stringify(a), JSON.stringify(b));
        });
    });

    test('the press engine agrees too', () => {
        const d = round({ wins: { 6:101 } });
        const E = engines();
        const ix = loadHtmlInlineScript('index.html', IDX);
        const ps = [d.players[0], d.players[1]];
        const pr = [{ startHole: 5, stake: 50 }];
        assert.equal(
            JSON.stringify(E.calculateStrokePressSet(ps, cd18, d.scores, 'gross', 20, pr)),
            JSON.stringify(JSON.parse(JSON.stringify(
                vm.runInContext('calculateStrokePressSet', ix)(ps, cd18, d.scores, 'gross', 20, pr)))));
    });

    test('both copies still exist — this guard is not vacuous', () => {
        // Search list. handicap.js owns no stroke-bet presenter to check.
        ['money-engine.js','index.html'].forEach(f => {
            assert.match(read(f), /function calculateStrokeHeadToHead\(/, f);
            assert.match(read(f), /function calculateStrokePressSet\(/, f);
        });
    });

    test('the presenter reuses them rather than recomputing', () => {
        const src = read('money-engine.js');
        const fn = src.slice(src.indexOf('function buildLiveStrokeBetStates'));
        assert.match(fn, /calculateHoleBetEngine\(/);
        assert.match(fn, /calculateStrokeHeadToHead\(/);
    });
});

describe('TWO BETS, INDEPENDENTLY', () => {

    test('both bets render when both are set', () => {
        const st = one(round());
        assert.ok(st.hole, '$/hole present');
        assert.ok(st.overall, '$/overall present');
        assert.equal(st.hole.stake, 5);
        assert.equal(st.overall.stake, 20);
    });

    test('$/hole alone', () => {
        const st = one(round({ wagers: { s1: wager({ overallStake: 0 }) } }));
        assert.ok(st.hole);
        assert.equal(st.overall, null, 'no overall bet was struck');
    });

    test('$/overall alone', () => {
        const st = one(round({ wagers: { s1: wager({ holeStake: 0 }) } }));
        assert.equal(st.hole, null);
        assert.ok(st.overall);
    });

    test('neither means no card at all', () => {
        // The early return must be what stops it. Removing that guard still left
        // this passing, because with both stakes at 0 the sub-engines happen to
        // produce nothing either - so the sabotage sailed through. Asserting the
        // guard's OWN condition closes that.
        const d = round({ wagers: { s1: wager({ holeStake: 0, overallStake: 0 }) } });
        assert.equal(states(d).length, 0);
        assert.ok(!/STROKE BET/.test(strip(scorecard(d))));
        assert.match(read('money-engine.js'),
            /if \(holeStake <= 0 && overallStake <= 0\) return;/,
            'a wager with no money must be rejected explicitly, not by accident');
    });

    test('a zero stake on ONE side does not fabricate that bet', () => {
        // The sharper case: $/overall is real, $/hole is off. If the guard were
        // gone, an empty hole side could still render a $0 column.
        const st = one(round({ wagers: { s1: wager({ holeStake: 0 }) } }));
        assert.equal(st.hole, null, 'no $0 per-hole column');
        assert.ok(!/\$\/HOLE/.test(strip(lastCard(scorecard(
            round({ wagers: { s1: wager({ holeStake: 0 }) } }))))));
    });

    test('holes won come from the hole engine', () => {
        const st = one(round({ wins: { 1:101, 2:101, 4:102 } }));
        assert.equal(st.hole.p1Holes, 2, 'Marty won two holes');
        assert.equal(st.hole.p2Holes, 1, 'Manny won one');
    });

    test('the overall lead is by strokes, and lower wins', () => {
        const st = one(round({ wins: { 1:101, 2:101, 4:102 } }));
        assert.equal(st.overall.p1Total, 22);
        assert.equal(st.overall.p2Total, 23);
        assert.match(st.overall.leadText, /Marty by 1/, 'one stroke better');
    });

    test('all square reads as all square', () => {
        const st = one(round({ wins: {} }));
        assert.equal(st.overall.leadText, 'All square');
    });
});

describe('CARRY IS GAME STATE', () => {

    test('halved holes produce a carry', () => {
        // Only three holes are won, so the rest halve and carry.
        const st = one(round({ wins: { 1:101, 2:101, 4:102 } }));
        assert.ok(st.hole.carry > 0, 'halved holes must carry');
    });

    test('the card says what the NEXT hole is worth', () => {
        const st = one(round({ wins: { 1:101, 2:101, 4:102 } }));
        assert.ok(st.hole.currentStake >= st.hole.stake,
            'a carry can only raise the next hole, never lower it');
        assert.match(strip(scorecard(round({ wins: { 1:101, 2:101, 4:102 } }))), /next hole \$/);
    });

    test('no carry means no next-hole note', () => {
        // Every hole decided: nothing carries.
        const wins = {}; for (let h = 1; h <= 6; h++) wins[h] = h % 2 ? 101 : 102;
        const st = one(round({ wins }));
        assert.equal(st.hole.carry, 0);
        assert.ok(!/next hole/.test(strip(scorecard(round({ wins })))));
    });

    test('carry is state, never a payout', () => {
        const card = lastCard(scorecard(round()));
        assert.ok(!/\+\$|-\$/.test(card), 'no signed running money');
    });
});

describe('SCOPE, START HOLE AND SHAPE', () => {

    test('a wager struck on the 6th tee ignores holes 1-5', () => {
        const early = one(round({ wins: { 1:101 }, thru: 8 }));
        const late = one(round({ wins: { 1:101 }, thru: 8,
            wagers: { s1: wager({ startHole: 6 }) } }));
        assert.ok(early.hole.p1Holes > 0, 'hole 1 counts for the full-round wager');
        assert.equal(late.hole.p1Holes, 0, 'and not for one struck on the 6th');
    });

    test('only players this viewer can see', () => {
        const d = round({ wagers: {
            mine: wager({ teamAIds:['101'], teamBIds:['102'] }),
            far:  wager({ teamAIds:['103'], teamBIds:['104'] }),
        }});
        assert.equal(states(d, ['101','102']).length, 1, 'the distant wager is excluded');
        assert.equal(states(d, null).length, 2, 'no filter means everything');
    });

    test('several stroke bets each get their own card', () => {
        const d = round({ wagers: {
            a: wager({ teamAIds:['101'], teamBIds:['102'] }),
            b: wager({ teamAIds:['103'], teamBIds:['104'], holeStake: 10 }),
        }});
        const list = states(d);
        assert.equal(list.length, 2);
        assert.equal(new Set(list.map(s => s.wagerId)).size, 2, 'distinct wager ids');
        assert.equal((scorecard(d).match(/LIVE GAME · STROKE BET/g) || []).length, 2);
    });

    test('a 2v2 stroke bet is declined rather than described wrongly', () => {
        // The engines are 1v1; a team stroke bet settles by another path.
        const d = round({ wagers: { s1: wager({ teamAIds:['101','103'], teamBIds:['102','104'] }) } });
        assert.equal(states(d).length, 0);
    });

    test('non-stroke wagers are ignored', () => {
        const d = round({ wagers: {
            n: { format:'nassau', teamAIds:['101'], teamBIds:['102'], startHole:1, stake:10 },
            m: { format:'match',  teamAIds:['101'], teamBIds:['102'], startHole:1, stake:10 },
        }});
        assert.equal(states(d).length, 0, 'those have their own card');
    });
});

describe('NOT STARTED, PARTIAL, GROSS AND NET', () => {

    test('no holes played reads as not started', () => {
        const d = round({ thru: 0, wins: {} });
        const st = one(d);
        assert.equal(st.started, false);
        assert.equal(st.thru, 0);
        assert.match(strip(scorecard(d)), /No scoring yet/);
    });

    test('thru counts only holes BOTH golfers posted', () => {
        assert.equal(one(round({ thru: 9 })).thru, 9);
        assert.equal(one(round({ thru: 13 })).thru, 13);
    });

    test('handicap strokes change the overall totals', () => {
        const gross = one(round({ wins: { 1:101 } }));
        const net = one(round({ wins: { 1:101 }, hcps: [0,18,0,0],
            wagers: { s1: wager({ scoring: 'net' }) } }));
        assert.notEqual(gross.overall.p2Total, net.overall.p2Total,
            'a shot a hole must change Manny\u2019s net total');
    });

    test('a plus handicap is handled', () => {
        const st = one(round({ wins: { 1:101 }, hcps: ['+2',10,0,0],
            wagers: { s1: wager({ scoring: 'net' }) } }));
        assert.equal(typeof st.overall.p1Total, 'number');
        assert.ok(!isNaN(st.overall.p1Total));
    });

    test('no NaN, undefined or Infinity ever renders', () => {
        [round({ thru: 0, wins: {} }), round(), round({ thru: 18 })].forEach(d => {
            const t = strip(scorecard(d));
            ['NaN','undefined','Infinity'].forEach(bad => assert.ok(!t.includes(bad), bad));
        });
    });

    test('refresh reconstructs identical state', () => {
        const d = round();
        assert.equal(JSON.stringify(states(d)),
                     JSON.stringify(states(JSON.parse(JSON.stringify(d)))));
    });
});

describe('BOTH SURFACES, ONE STATE', () => {

    test('the Scorecard renders it', () => {
        const t = strip(scorecard(round()));
        assert.match(t, /LIVE GAME · STROKE BET/);
        assert.match(t, /\$\/HOLE/);
        assert.match(t, /OVERALL/);
    });

    test('the Leaderboard renders it too', () => {
        assert.match(strip(leaderboard(round())), /LIVE GAME · STROKE BET/);
    });

    test('the rendered cards are identical', () => {
        const card = lastCard(scorecard(round()));
        assert.equal(card, leaderboard(round()).slice(0, card.length));
    });

    test('one presenter, defined once', () => {
        // A SEARCH LIST, NOT A REALM. handicap.js is deliberately absent: this asks
        // which files DEFINE the presenter, and the answer must stay money-engine.js.
        const defs = ['money-engine.js','index.html','leaderboard.html','settlement-engine.js']
            .filter(f => /function buildLiveStrokeBetStates\(/.test(read(f)));
        assert.deepEqual(defs, ['money-engine.js']);
    });

    test('neither page computes the bet itself', () => {
        ['index.html','leaderboard.html'].forEach(f => {
            const src = read(f);
            const at = src.indexOf('function buildLiveStrokeBetHtml');
            assert.ok(at > -1, f + ' must have the formatter');
            const fn = src.slice(at, at + 2600);
            ['calculateHoleBetEngine(','calculateStrokeHeadToHead(']
                .forEach(t => assert.ok(!fn.includes(t), f + ' must not compute; found ' + t));
        });
    });

    test('NET TO PAR remains, separately', () => {
        const html = scorecard(round());
        assert.match(strip(html.replace(lastCard(html), '')), /NET TO PAR/);
        assert.ok(!/NET TO PAR/.test(lastCard(html)));
    });
});

describe('LIVE PLAY, NOT SETTLEMENT', () => {

    test('no running payout on the card', () => {
        const card = lastCard(scorecard(round()));
        ['Who Pays Who','payout','buy-in','owes','settle','Total:']
            .forEach(w => assert.ok(!new RegExp(w,'i').test(strip(card)), w));
        assert.ok(!/\+\$|-\$/.test(card), 'no signed money');
    });

    test('stakes ARE shown — they define the bet', () => {
        const t = strip(lastCard(scorecard(round())));
        assert.match(t, /\$\/HOLE · \$5/);
        assert.match(t, /OVERALL · \$20/);
    });

    test('the presenter settles nothing', () => {
        const src = read('money-engine.js');
        const fn = src.slice(src.indexOf('function buildLiveStrokeBetStates'));
        ['simplifyDebts(','allocateWholeDollars(','computeMoneyPool(','p1Money']
            .forEach(t => assert.ok(!fn.includes(t), 'found ' + t));
    });

    test('settlement is unchanged and still zero-sum', () => {
        const E = engines();
        const d = round({ thru: 18 });
        const c = E.computeCombinedNetTotals(d, cd18, d.scores);
        const vals = Object.values(c.netByName);
        assert.equal(vals.reduce((a,v) => a + v.net, 0), 0);
        assert.ok(vals.some(v => v.net !== 0), 'money actually moved');
    });
});

describe('DENSITY — THIS CARD STACKS', () => {

    test('the worst realistic stack is three cards', () => {
        // Unlike Hi-Lo, a stroke bet co-exists with the leaderboard and Skins.
        const d = round();
        d.additionalGames = { skins: true };
        d.skinsBuyIn = 5;
        const html = scorecard(d);
        assert.equal((html.match(/class="l[wmg]-card"/g) || []).length, 3,
            'leaderboard + skins + stroke bet');
    });

    test('the card is two short columns, not a table', () => {
        assert.match(read('index.html'),
            /\.sb-split \{ display: grid; grid-template-columns: 1fr 1fr/);
    });

    test('columns can shrink and names truncate', () => {
        assert.match(read('index.html'), /\.sb-line span:first-child \{[^}]*text-overflow: ellipsis/);
        assert.match(read('index.html'), /\.sb-line span:first-child \{[^}]*min-width: 0/);
    });

    test('no fixed widths that would force horizontal scroll', () => {
        const src = read('index.html');
        (src.match(/\.sb-[a-z-]+ \{[^}]*\}/g) || []).forEach(r =>
            assert.ok(!/width:\s*\d{3,}px/.test(r), 'fixed width: ' + r));
    });

    test('column titles stay on one line', () => {
        assert.match(read('index.html'), /\.sb-col-title \{[^}]*white-space: nowrap/);
    });
});
