// ============================================================================
// LIVE MATCHES & PRESSES
//
// WHAT THIS EXISTS TO FIX. During a real Nassau - 2-down auto press - the engine
// correctly generated both auto-presses at Hole 3 and the caddie could not see
// any of it. The Live Action dashboard had been deleted in a consolidation, what
// survived sat behind a collapsed "View All Action", and the scorecard showed a
// stroke-play leaderboard for a match-play game.
//
// The engine was never wrong. A 25-case torture matrix confirmed press timing,
// start holes, independence, refresh reconstruction and settlement parity. This
// batch is presentation only: no golf and no money is computed here.
//
// ONE PRESENTER, TWO SURFACES. buildLiveMatchState() lives in money-engine.js and
// is called by both the scorecard and the leaderboard, so they cannot disagree
// about a match the way four hand-rolled skins predicates once did.
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

// wins: hole -> 'A' (team 1) | 'B' (team 2) | 'H' (halved)
function round({ wins = {}, thru = 6, pressRule = '2down', hcps = null,
                 format = 'nassau', manual = null, scoring = 'gross' } = {}) {
    const ps = [
        { id:101, name:'Marty', hcp: hcps ? String(hcps[0]) : '0', team:'Team 1', playingForMoney:true },
        { id:102, name:'Manny', hcp: hcps ? String(hcps[1]) : '0', team:'Team 2', playingForMoney:true },
    ];
    const sc = {};
    for (let h = 1; h <= thru; h++) {
        const w = wins[h] || 'H';
        sc['p101_h'+h] = 4 + (w === 'A' ? -1 : 0);
        sc['p102_h'+h] = 4 + (w === 'B' ? -1 : 0);
    }
    const d = { players: ps, courseData: cd18, scores: sc, gameFormat: format,
                settlementMode:'whole-dollar' };
    if (format === 'nassau') {
        d.nassauScoring = scoring; d.nassauStake = 10; d.nassauPressRule = pressRule;
    } else {
        d.matchScoring = scoring; d.matchStake = 10; d.matchPressRule = pressRule;
    }
    if (manual) d.matchPresses = manual;
    return d;
}
const state = (d) => loadJsFile('money-engine.js').buildLiveMatchState(d, cd18, d.scores);

function scorecard(d) {
    const sb = loadHtmlInlineScript('index.html', IDX);
    vm.runInContext(`currentMode='A'; currentData=${JSON.stringify(d)}; renderLiveTicker();`, sb);
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

describe('THE THREE NASSAU SEGMENTS RENDER', () => {

    test('Front, Back and Overall all appear', () => {
        const t = strip(scorecard(round({ wins:{1:'A'} })));
        assert.match(t, /FRONT 9/);
        assert.match(t, /BACK 9/);
        assert.match(t, /TOTAL/);
    });

    test('a segment nobody has played says Not Started, not All Square', () => {
        // Asserted on the STATE as well as the rendered text. Forcing started:true
        // still printed "Not Started" through the render path alone, so the string
        // check passed while the flag was wrong - the sabotage proved it.
        const st = state(round({ wins:{1:'A'}, thru:6 }));
        const back = seg(st, 'B9');
        assert.equal(back.started, false, 'the back nine has not been played');
        assert.equal(back.statusText, 'Not Started', 'AS on an unplayed nine would be a lie');
        const front = seg(st, 'F9');
        assert.equal(front.started, true, 'the front HAS been played');
        assert.match(strip(scorecard(round({ wins:{1:'A'}, thru:6 }))), /BACK 9 Not Started/);
    });

    test('AS renders when level', () => {
        assert.equal(seg(state(round({ wins:{1:'A',2:'B'} })), 'F9').statusText, 'AS');
    });

    test('1 UP and 2 UP render with the leader named', () => {
        assert.equal(seg(state(round({ wins:{1:'A'} })), 'F9').statusText, 'Marty 1 UP');
        assert.equal(seg(state(round({ wins:{1:'A',2:'A'} })), 'F9').statusText, 'Marty 2 UP');
    });

    test('the trailing side is named when THEY lead', () => {
        assert.equal(seg(state(round({ wins:{1:'B',2:'B'} })), 'F9').statusText, 'Manny 2 UP');
    });

    test('Match Play renders a single Overall segment', () => {
        const t = strip(scorecard(round({ format:'match', wins:{1:'A'} })));
        assert.match(t, /LIVE MATCHES/);
        assert.ok(!/FRONT 9/.test(t), 'Match Play is one match, not three');
    });
});

describe('THE 2-DOWN AUTO PRESS IS VISIBLE', () => {

    test('it appears as soon as a side goes 2 down', () => {
        const t = strip(scorecard(round({ wins:{1:'A',2:'A'} })));
        assert.match(t, /AUTO PRESS · H3/, 'this is what the caddie could not see');
    });

    test('it does NOT appear before the trigger', () => {
        // The card HEADER contains the word "PRESSES", so a bare /PRESS/ match always
        // hits. What must be absent is a press ROW.
        const t = strip(scorecard(round({ wins:{1:'A'} })));
        assert.ok(!/(AUTO|MANUAL) PRESS ·/.test(t), 'a press shown early is worse than none');
        assert.equal(state(round({ wins:{1:'A'} })).pressCount, 0);
    });

    test('it starts on the NEXT hole', () => {
        const st = state(round({ wins:{1:'A',2:'A'} }));
        seg(st, 'F9').presses.forEach(p => assert.equal(p.startHole, 3));
    });

    test('the base match keeps running underneath it', () => {
        const st = state(round({ wins:{1:'A',2:'A',3:'A'}, thru:6 }));
        const f = seg(st, 'F9');
        assert.equal(f.statusText, 'Marty 3 UP');
        assert.equal(f.closed, false);
        assert.ok(f.presses.length > 0);
    });

    test('base and press hold DIFFERENT states', () => {
        // The press starts level at H3; a hole won after that moves them apart.
        const st = state(round({ wins:{1:'A',2:'A',3:'B'}, thru:6 }));
        const f = seg(st, 'F9');
        assert.equal(f.statusText, 'Marty 1 UP');
        assert.equal(f.presses[0].statusText, 'Manny 1 UP');
    });

    test('a press on a press renders independently', () => {
        const st = state(round({ wins:{1:'A',2:'A',3:'A',4:'A',5:'A',6:'A'}, thru:9 }));
        const f = seg(st, 'F9');
        assert.ok(f.presses.length >= 2, 'expected a second press; got ' + f.presses.length);
        const holes = f.presses.map(p => p.startHole);
        assert.equal(new Set(holes).size, holes.length, 'each press has its own start hole');
    });

    test('Front and Overall press independently', () => {
        const st = state(round({ wins:{1:'A',2:'A'} }));
        assert.ok(seg(st,'F9').presses.length > 0);
        assert.ok(seg(st,'18').presses.length > 0);
        assert.equal(seg(st,'B9').presses.length, 0, 'the back nine has not started');
    });

    test('no presses at all when the rule is off', () => {
        const st = state(round({ wins:{1:'A',2:'A',3:'A'}, pressRule:'none' }));
        st.segments.forEach(s => assert.equal(s.presses.length, 0));
    });
});

describe('MANUAL VS AUTO', () => {

    test('a manual press is labelled MANUAL', () => {
        const d = round({ wins:{1:'A'}, thru:9, pressRule:'none',
                          manual:{ m1:{ baseId:'F9', startHole:5, stake:25 } } });
        const t = strip(scorecard(d));
        assert.match(t, /MANUAL PRESS · H5/);
    });

    test('manual and auto coexist and are distinguished', () => {
        const d = round({ wins:{1:'A',2:'A'}, thru:9, pressRule:'2down',
                          manual:{ m1:{ baseId:'F9', startHole:6, stake:25 } } });
        const f = seg(state(d), 'F9');
        assert.ok(f.presses.length >= 2, 'expected both; got ' + f.presses.length);
        assert.ok(f.presses.some(p => p.auto), 'the auto press');
        assert.ok(f.presses.some(p => !p.auto), 'the manual press');
    });

    test('a manual press keeps its own stake', () => {
        const d = round({ wins:{1:'A'}, thru:9, pressRule:'none',
                          manual:{ m1:{ baseId:'F9', startHole:5, stake:25 } } });
        assert.equal(seg(state(d), 'F9').presses[0].stake, 25);
    });
});

describe('DERIVED STATE FOLLOWS THE SCORES', () => {

    test('a correction that removes the deficit removes the press', () => {
        const before = state(round({ wins:{1:'A',2:'A'} }));
        const after  = state(round({ wins:{1:'A',2:'H'} }));
        assert.ok(seg(before,'F9').presses.length > 0);
        assert.equal(seg(after,'F9').presses.length, 0, 'no stale press may survive');
    });

    test('a correction that flips a hole flips the status', () => {
        assert.equal(seg(state(round({ wins:{1:'A'} })), 'F9').statusText, 'Marty 1 UP');
        assert.equal(seg(state(round({ wins:{1:'B'} })), 'F9').statusText, 'Manny 1 UP');
    });

    test('refresh reconstructs identical state', () => {
        const d = round({ wins:{1:'A',2:'A',3:'B'}, thru:9 });
        const a = JSON.stringify(state(d));
        const b = JSON.stringify(state(JSON.parse(JSON.stringify(d))));
        assert.equal(a, b, 'reloading from persisted data must not drift');
    });

    test('refresh creates no duplicate press', () => {
        const d = round({ wins:{1:'A',2:'A'} });
        assert.equal(state(d).pressCount, state(JSON.parse(JSON.stringify(d))).pressCount);
    });

    test('handicap strokes change the match', () => {
        const gross = state(round({ wins:{}, thru:6, scoring:'gross' }));
        const net   = state(round({ wins:{}, thru:6, scoring:'net', hcps:[0,18] }));
        assert.notEqual(seg(gross,'F9').statusText, seg(net,'F9').statusText);
    });
});

describe('SCORECARD AND LEADERBOARD AGREE', () => {

    const D = () => round({ wins:{1:'A',2:'A',3:'B'}, thru:6 });

    test('both render the widget', () => {
        assert.match(strip(scorecard(D())), /LIVE MATCHES & PRESSES/);
        assert.match(strip(leaderboard(D())), /LIVE MATCHES & PRESSES/);
    });

    test('they render IDENTICAL match state', () => {
        const cut = h => strip(h).slice(strip(h).indexOf('LIVE MATCHES'));
        assert.equal(cut(scorecard(D())), cut(leaderboard(D())),
            'two surfaces, one match - they must not disagree');
    });

    test('both consume the SAME shared presenter', () => {
        // The presenter is now buildLiveMatchStates() - plural - because a round can
        // carry several wagers and the supported Nassau lives in sideMatches, not in
        // the round format. Both pages still consume ONE shared implementation.
        ['index.html','leaderboard.html'].forEach(f =>
            assert.match(read(f), /buildLiveMatchStates\(data, courseData, savedScores, visibleIds\)/,
                f + ' must call the shared presenter'));
        ['buildLiveMatchState','buildLiveMatchStates'].forEach(fn => {
            const defs = ['index.html','leaderboard.html','money-engine.js']
                .filter(f => new RegExp('function ' + fn + '\\(').test(read(f)));
            assert.deepEqual(defs, ['money-engine.js'], fn + ': exactly one implementation');
        });
    });

    test('NET TO PAR stays clearly labelled and separate', () => {
        // The header row only renders once golfers have posted; a 2-player fixture
        // thru 6 qualifies, but the label lives in the standings table, not the mount.
        const sb = loadHtmlInlineScript('leaderboard.html', LB);
        vm.runInContext(`currentBoardData=${JSON.stringify(D())}; activeView='individual';
            groupViewMode='flat'; activeScoring='net'; renderBoard();`, sb);
        const board = sb.document.getElementById('board-content').innerHTML;
        // The standings table labels its own columns; the page-level "Ranking: Net /
        // Gross" toggle says what the ranking basis is. Both are stroke-play framing.
        assert.match(strip(board), /Pos Player Score To Par Thru/,
            'the general standings keep stroke-play column headers');
        assert.match(read('leaderboard.html'), /Ranking:/,
            'and the basis is stated on the page');
        const mm = sb.document.getElementById('live-matches-mount').innerHTML;
        assert.ok(!/NET TO PAR/.test(mm), 'the two answers stay in separate boxes');
    });
});

describe('LIVE MEANS LIVE — NO SETTLEMENT', () => {

    test('STAKES are shown — they define the bet', () => {
        // Reversed deliberately. A golfer must be able to see WHICH bet is running:
        // "$5 front, $10 overall" is the wager itself, not settlement. What stays out
        // is any running total or payout, which is not final mid-round.
        const html = scorecard(round({ wins:{1:'A',2:'A'} }));
        assert.match(html, /class="lm-stake">\$\d+</, 'the segment stake must be visible');
        assert.match(strip(html), /\$10/, 'the $10 wager in this fixture');
    });

    test('no Who Pays Who, payouts or buy-in', () => {
        const t = strip(scorecard(round({ wins:{1:'A',2:'A'} })));
        ['Who Pays Who','Player Payouts','buy-in','TOTAL PAYOUT','Final Ledger']
            .forEach(w => assert.ok(!new RegExp(w,'i').test(t), w + ' belongs in Results'));
    });

    test('the presenter computes no money', () => {
        const src = read('money-engine.js');
        const at = src.indexOf('function buildLiveMatchState');
        const fn = src.slice(at);
        ['simplifyDebts(','allocateWholeDollars(','computeMoneyPool(','t1TotalMoney']
            .forEach(t => assert.ok(!fn.includes(t), 'presenter must not settle; found ' + t));
    });

    test('and it reuses the canonical engine rather than its own', () => {
        const src = read('money-engine.js');
        const fn = src.slice(src.indexOf('function buildLiveMatchState'));
        assert.match(fn, /calculateMatchEngine\(moneyPlayers, holes, savedScores/);
    });
});

describe('THE WIDGET APPEARS ONLY WHEN THERE IS A MATCH', () => {

    test('a stroke-play round grows no match widget', () => {
        const d = round({ wins:{1:'A'} }); d.gameFormat = 'stroke';
        assert.equal(state(d), null);
        assert.ok(!/LIVE MATCHES/.test(strip(scorecard(d))));
    });

    test('one player is not a match', () => {
        const d = round({ wins:{1:'A'} });
        d.players = [d.players[0]];
        assert.equal(state(d), null);
    });

    test('the mounts exist in the real markup', () => {
        // Structural, as text: the harness returns an element for ANY id, so a DOM
        // check alone proves nothing - that is how a broken modal once shipped.
        assert.match(read('index.html'), /html \+= '<div id="live-ticker-mount"><\/div>'/);
        assert.match(read('leaderboard.html'), /<div id="live-matches-mount"><\/div>/);
    });

    test('existing widgets survive', () => {
        const d = round({ wins:{1:'A',2:'A'} });
        d.skinsBuyIn = 5; d.additionalGames = { skins: true };
        const t = strip(scorecard(d));
        assert.match(t, /LIVE LEADERBOARD/, 'the standings widget must remain');
        assert.match(t, /LIVE MATCHES/);
    });

    test('no fixed-width overflow on a phone', () => {
        const src = read('index.html');
        const rules = ['.lm-card','.lm-seg-name','.lm-press'];
        rules.forEach(r => {
            const m = new RegExp('\\' + r + ' \\{([^}]*)\\}').exec(src);
            if (m) assert.ok(!/min-width:\s*[0-9]{3,}px/.test(m[1]), r + ' would overflow 375px');
        });
    });
});
