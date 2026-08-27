// ============================================================================
// THE ACTION-CREATED NASSAU MUST BE VISIBLE ON THE SCORECARD
//
// Nassau is a WAGER in this app, created from Action, not a round type. So a real
// $5/$5/$10 Nassau lives in sideMatches on an otherwise Stroke Play round.
//
// buildLiveMatchState() read only d.gameFormat - the ROUND format - so it returned
// null for exactly the configuration a golfer actually creates. The money was
// right, settlement was right, the Matches tab showed it, and the scorecard, the
// screen already in your hand, showed nothing. Batch A had made the DEPRECATED
// path visible and left the supported one dark.
//
// buildLiveMatchStates() returns every match-play wager visible to the viewer:
// the round format when it is one, plus each qualifying side match.
//
// SCOPE MIRRORS THE SCORECARD'S EXISTING RULE - a wager shows when any participant
// is among the players this viewer can see. Deliberately not "only matches I am
// in": a scorekeeper needs the bets in front of them, and a cross-group wager
// legitimately appears to both sides.
//
// STAKES ARE SHOWN, TOTALS ARE NOT. "$5 front, $10 overall" is the bet itself.
// A running payout is settlement's job and is not final mid-round.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const IDX = ['score-marks.js','money-engine.js','action-model.js','settlement-engine.js',
             'pool-engine.js','bet-strip.js','hole-events.js'];
const LB = ['money-engine.js','action-model.js','settlement-engine.js'];
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
const NAMES = ['Marty','Manny','Carp','Scott','Randy','Kopp','Lance','Matt B'];

// EXACTLY the payload sidematches.html writes for a Nassau wager.
function nassauWager(over) {
    return Object.assign({
        format: 'nassau', scoring: 'net',
        teamAIds: ['101'], teamBIds: ['102'], startHole: 1, createdAt: 1,
        stake: 10, frontStake: 5, backStake: 5, overallStake: 10,
        autoPressStake: null, pressRule: '2down',
    }, over || {});
}
// wins: hole -> playerId that won it
function roundData({ wagers = { m1: nassauWager() }, thru = 6, wins = {} } = {}) {
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:'0' }));
    const sc = {};
    ps.forEach(p => cd18.forEach(h => { if (h.hole <= thru) sc['p'+p.id+'_h'+h.hole] = 4; }));
    Object.keys(wins).forEach(h => { sc['p' + wins[h] + '_h' + h] = 3; });
    return { players: ps, courseData: cd18, scores: sc, gameFormat: 'stroke', sideMatches: wagers };
}
const states = (d, visible) =>
    loadJsFile('money-engine.js').buildLiveMatchStates(d, cd18, d.scores, visible || null);

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
    return sb.document.getElementById('live-matches-mount').innerHTML;
}
const seg = (st, id) => st.segments.find(s => s.id === id);

// ============================================================================

describe('THE BUG: an Action Nassau on a Stroke round', () => {

    test('the widget RENDERS — this returned null before', () => {
        const d = roundData({ wins: { 1:101, 2:101 } });
        assert.equal(d.gameFormat, 'stroke', 'the round itself is Stroke Play');
        assert.equal(states(d).length, 1, 'the side-match Nassau must be found');
        assert.match(strip(scorecard(d)), /LIVE MATCHES & PRESSES/);
    });

    test('it shows all three segments', () => {
        const t = strip(scorecard(roundData({ wins: { 1:101, 2:101 } })));
        assert.match(t, /FRONT 9/);
        assert.match(t, /BACK 9/);
        assert.match(t, /TOTAL/);
    });

    test('it names the two golfers', () => {
        assert.match(strip(scorecard(roundData({ wins:{1:101} }))), /Marty v Manny/);
    });

    test('the 2-down auto press appears', () => {
        const t = strip(scorecard(roundData({ wins: { 1:101, 2:101 } })));
        assert.match(t, /AUTO PRESS · H3/, 'the press the caddie could not see');
    });

    test('a round with no wagers grows no widget', () => {
        assert.equal(states(roundData({ wagers: {} })).length, 0);
        assert.ok(!/LIVE MATCHES/.test(strip(scorecard(roundData({ wagers: {} })))));
    });
});

describe('PER-SEGMENT STAKES ARE VISIBLE', () => {

    test('$5 front, $5 back, $10 overall each render their own amount', () => {
        const st = states(roundData({ wins:{1:101} }))[0];
        assert.equal(seg(st,'F9').stake, 5);
        assert.equal(seg(st,'B9').stake, 5);
        assert.equal(seg(st,'18').stake, 10);
        const html = scorecard(roundData({ wins:{1:101} }));
        assert.match(html, /class="lm-stake">\$5</);
        assert.match(html, /class="lm-stake">\$10</);
    });

    test('a $5 front press and a $10 overall press differ on screen', () => {
        const st = states(roundData({ wins:{1:101,2:101} }))[0];
        assert.equal(seg(st,'F9').presses[0].stake, 5);
        assert.equal(seg(st,'18').presses[0].stake, 10);
    });

    test('$5/$50/$10 stays independent', () => {
        const d = roundData({ wagers: { m1: nassauWager({ backStake: 50 }) }, wins:{10:101}, thru:14 });
        const st = states(d)[0];
        assert.equal(seg(st,'B9').stake, 50);
        assert.equal(seg(st,'F9').stake, 5);
    });

    test('a configured custom auto-press amount is shown', () => {
        const d = roundData({ wagers: { m1: nassauWager({ autoPressStake: 25 }) }, wins:{1:101,2:101} });
        const st = states(d)[0];
        seg(st,'F9').presses.forEach(p => assert.equal(p.stake, 25));
    });

    test('a legacy wager with only `stake` still renders', () => {
        const legacy = nassauWager({ frontStake: undefined, backStake: undefined,
                                     overallStake: undefined, stake: 20 });
        const st = states(roundData({ wagers: { m1: legacy }, wins:{1:101} }))[0];
        ['F9','B9','18'].forEach(id => assert.equal(seg(st,id).stake, 20));
    });

    test('NO running total or payout — that is settlement', () => {
        const t = strip(scorecard(roundData({ wins:{1:101,2:101} })));
        ['Who Pays Who','Player Payouts','TOTAL PAYOUT','buy-in','Final Ledger']
            .forEach(w => assert.ok(!new RegExp(w,'i').test(t), w + ' belongs in Results'));
        assert.ok(!/\+\$|-\$/.test(t), 'no signed running money');
    });
});

describe('SCOPE — whose bets show', () => {

    const FOUR = {
        g1:  nassauWager({ teamAIds:['101'], teamBIds:['102'] }),                    // in group
        g2:  nassauWager({ format:'match', teamAIds:['103'], teamBIds:['104'] }),    // in group
        x1:  nassauWager({ teamAIds:['101'], teamBIds:['105'] }),                    // cross-group
        far: nassauWager({ format:'match', teamAIds:['107'], teamBIds:['108'] }),    // elsewhere
    };
    const GROUP1 = ['101','102','103','104'];

    test('every wager involving a visible player is shown', () => {
        const list = states(roundData({ wagers: FOUR, wins:{1:101} }), GROUP1);
        assert.equal(list.length, 3, 'two local plus the cross-group one');
    });

    test('a wager between golfers this viewer cannot see is excluded', () => {
        const list = states(roundData({ wagers: FOUR, wins:{1:101} }), GROUP1);
        const names = list.map(w => w.t1Name + ' v ' + w.t2Name).join(' | ');
        assert.ok(!/Lance/.test(names), 'a distant match is not this scorekeeper\u2019s business');
    });

    test('a CROSS-GROUP wager appears to the group that can see one side', () => {
        const list = states(roundData({ wagers: FOUR, wins:{1:101} }), GROUP1);
        assert.ok(list.some(w => /Randy/.test(w.t2Name)), 'Marty v Randy must show');
    });

    test('the leaderboard sees the whole field', () => {
        const all = NAMES.map((_,i)=>String(101+i));
        assert.equal(states(roundData({ wagers: FOUR, wins:{1:101} }), all).length, 4);
    });

    test('multiple wagers render together, separated', () => {
        const html = scorecard(roundData({ wagers: FOUR, wins:{1:101} }), GROUP1);
        assert.match(strip(html), /3 wagers/);
        assert.equal((html.match(/lm-divider/g) || []).length, 2, 'two dividers for three wagers');
    });

    test('non-match wagers are ignored', () => {
        const d = roundData({ wagers: {
            s1: { format:'skins', teamAIds:['101'], teamBIds:['102'], stake:5 },
            d1: { format:'dots', teamAIds:['101'], teamBIds:['102'], stake:1 },
            k1: nassauWager(),
        }, wins:{1:101} });
        assert.equal(states(d).length, 1, 'only the Nassau is a match');
    });
});

describe('START HOLE IS HONOURED', () => {

    test('a wager struck on the 6th tee ignores holes 1-5', () => {
        // Marty won hole 1, but the bet did not exist yet.
        const d = roundData({ wagers: { m1: nassauWager({ startHole: 6 }) },
                              wins: { 1:101 }, thru: 8 });
        const st = states(d)[0];
        assert.equal(st.segments.length > 0, true);
        assert.equal(seg(st,'F9').status, 0, 'hole 1 predates the wager');
    });

    test('and counts holes after it', () => {
        const d = roundData({ wagers: { m1: nassauWager({ startHole: 6 }) },
                              wins: { 7:101 }, thru: 8 });
        assert.equal(seg(states(d)[0],'F9').status, 1);
    });
});

describe('SCORECARD AND LEADERBOARD AGREE', () => {

    const D = () => roundData({ wins:{1:101,2:101,3:102} });

    test('both render the same wager state', () => {
        const cut = h => { const t = strip(h); return t.slice(t.indexOf('LIVE MATCHES')); };
        assert.equal(cut(scorecard(D())), cut(leaderboard(D())));
    });

    test('both consume the one shared presenter', () => {
        ['index.html','leaderboard.html'].forEach(f =>
            assert.match(read(f), /buildLiveMatchStates\(data, courseData, savedScores, visibleIds\)/, f));
        const defs = ['index.html','leaderboard.html','money-engine.js']
            .filter(f => /function buildLiveMatchStates\(/.test(read(f)));
        assert.deepEqual(defs, ['money-engine.js']);
    });

    test('the presenter settles no money', () => {
        const src = read('money-engine.js');
        const at = src.indexOf('function buildLiveMatchStates');
        const fn = src.slice(at, src.indexOf('\nfunction buildLiveMatchState(', at));
        ['simplifyDebts(','allocateWholeDollars(','computeMoneyPool(','t1TotalMoney']
            .forEach(t => assert.ok(!fn.includes(t), 'presenter must not settle; found ' + t));
    });
});
