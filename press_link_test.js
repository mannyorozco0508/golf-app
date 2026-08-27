// ============================================================================
// PRESS FROM THE SCORECARD — WITHOUT A SECOND WRITE PATH
//
// A golfer watching the Live Matches widget go 2 down should be able to act on
// it. But the writer for a side-match press lives in sidematches.html, with its
// amount prompt, its permission gate and its offline guard:
//
//     sideMatches/{id}/presses/{key}  { baseId, startHole, stake }
//
// index.html has no such writer, and porting one in would mean TWO
// implementations of a money write. A read-side divergence shows the wrong
// number - we spent a long time repairing one. A write-side divergence puts the
// wrong number in the database permanently.
//
// So the scorecard's PRESS control is a LINK. It carries the golfer to the wager
// on the Matches tab with the card highlighted, and they press there with the
// amount in front of them. One extra tap; one write path.
//
// AND IT MUST NOT PRESS ANYTHING ON ARRIVAL. A press costs real money. Landing
// on a URL that writes a wager would mean money moving because a link was tapped.
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

function wager(over) {
    return Object.assign({
        format:'nassau', scoring:'net', teamAIds:['101'], teamBIds:['102'],
        startHole:1, stake:10, frontStake:5, backStake:5, overallStake:10,
        autoPressStake:null, pressRule:'2down',
    }, over || {});
}
function roundData({ thru = 6, wagers = { wager7: wager() } } = {}) {
    const ps = [{ id:101, name:'Marty', hcp:'0' }, { id:102, name:'Manny', hcp:'0' }];
    const sc = {};
    ps.forEach(p => cd18.forEach(h => { if (h.hole <= thru) sc['p'+p.id+'_h'+h.hole] = 4; }));
    [[1,101],[2,101],[3,102],[5,101],[6,101]].forEach(([h,w]) => {
        if (h <= thru) sc['p'+w+'_h'+h] = 3;
    });
    return { players: ps, courseData: cd18, scores: sc, gameFormat:'stroke', sideMatches: wagers };
}
const states = (d) => loadJsFile('money-engine.js')
    .buildLiveMatchStates(d, cd18, d.scores, null);

function scorecard(d, { group = null } = {}) {
    const sb = loadHtmlInlineScript('index.html', IDX);
    vm.runInContext(`
        window.location.pathname='/index.html'; window.location.origin='https://x.dev';
        currentMode='ABCD';
        ${group ? 'hasGroupLock=true; lockedGroup=' + group + ';' : ''}
        currentData=${JSON.stringify(d)};
        renderLiveTicker();
    `, sb);
    return { sb, html: () => sb.document.getElementById('live-ticker-mount').innerHTML };
}
function leaderboard(d) {
    const sb = loadHtmlInlineScript('leaderboard.html', LB);
    vm.runInContext(`
        window.location.pathname='/leaderboard.html'; window.location.origin='https://x.dev';
        window.location.search='?game=ABCD'; currentMode='ABCD';
        currentBoardData=${JSON.stringify(d)}; activeView='individual';
        groupViewMode='flat'; activeScoring='net'; renderBoard();
    `, sb);
    return sb.document.getElementById('live-matches-mount').innerHTML;
}
const hrefOf = (html) => (html.match(/href="([^"]*press=[^"]*)"/) || [])[1];

// ============================================================================

describe('ONE WRITE PATH — THE WHOLE POINT', () => {

    test('index.html writes NO side-match press', () => {
        assert.equal((read('index.html').match(/sideMatches\/[^)]*presses/g) || []).length, 0,
            'a second money-write implementation is what this design avoids');
    });

    test('leaderboard.html writes none either', () => {
        assert.equal((read('leaderboard.html').match(/sideMatches\/[^)]*presses/g) || []).length, 0);
    });

    test('sidematches.html remains the sole writer', () => {
        const src = read('sidematches.html');
        assert.equal((src.match(/presses\/\$\{pushKey\}`\)\.set/g) || []).length, 1,
            'exactly one side-match press write');
        assert.match(src, /stake: amt/, 'and it still persists the amount the golfer typed');
    });

    test('the scorecard control is a link, not a write', () => {
        const html = scorecard(roundData()).html();
        assert.match(html, /<a class="lm-press-link"/);
        assert.ok(!/db\.ref/.test(html), 'the widget must not write');
    });

    test('the existing round-format press writers are untouched', () => {
        const src = read('index.html');
        assert.match(src, /function confirmMatchPress\(\)/);
        assert.match(src, /function pressMatchBet\(baseId, nextHole\)/);
        assert.equal((src.match(/matchPresses\/\$\{pushKey\}`\)\.set/g) || []).length, 2,
            'both round-format writers still present, unchanged in number');
    });
});

describe('THE LINK CARRIES THE RIGHT CONTEXT', () => {

    test('it names the game and the wager', () => {
        const href = hrefOf(scorecard(roundData()).html());
        assert.match(href, /sidematches\.html\?game=ABCD/);
        assert.match(href, /press=wager7/, 'the wager to focus');
    });

    test('a group lock rides along, as the Add Action link already does', () => {
        const href = hrefOf(scorecard(roundData(), { group: 2 }).html());
        assert.match(href, /group=2/, 'a locked scorekeeper lands already scoped');
    });

    test('no group lock means no group param', () => {
        assert.ok(!/group=/.test(hrefOf(scorecard(roundData()).html())));
    });

    test('the wager id is URL-encoded', () => {
        const d = roundData({ wagers: { 'a b/c': wager() } });
        const href = hrefOf(scorecard(d).html());
        assert.ok(!/press=a b\/c/.test(href), 'raw spaces and slashes would break the link');
        assert.match(href, /press=a%20b%2Fc/);
    });

    test('the leaderboard links too, without a group', () => {
        const href = hrefOf(leaderboard(roundData()));
        assert.match(href, /press=wager7/);
        assert.ok(!/group=/.test(href), 'the leaderboard shows the whole field');
    });
});

describe('WHEN THE CONTROL APPEARS', () => {

    test('it shows the hole the press would start on', () => {
        assert.match(strip(scorecard(roundData({ thru: 6 })).html()), /Press · H7/);
        assert.match(strip(scorecard(roundData({ thru: 9 })).html()), /Press · H10/);
    });

    test('the presenter, not the page, decides eligibility', () => {
        const st = states(roundData({ thru: 6 }))[0];
        assert.equal(st.canPress, true);
        assert.equal(st.nextPressHole, 7);
    });

    test('a completed round cannot be pressed', () => {
        const st = states(roundData({ thru: 18 }))[0];
        assert.equal(st.canPress, false);
        assert.equal(st.nextPressHole, null);
        assert.ok(!/lm-press-link/.test(scorecard(roundData({ thru: 18 })).html()));
    });

    test('a wager with pressRule none offers nothing', () => {
        const d = roundData({ wagers: { w: wager({ pressRule: 'none' }) } });
        assert.equal(states(d)[0].canPress, false);
        assert.ok(!/lm-press-link/.test(scorecard(d).html()));
    });

    test('a wager nobody has played yet cannot be pressed', () => {
        const d = roundData({ thru: 0 });
        const st = states(d)[0];
        if (st) assert.equal(st.canPress, false);
    });

    test('the round-format match gets no side-match link', () => {
        // Its press control already exists in index.html and writes to matchPresses.
        const d = roundData({ wagers: {} });
        d.gameFormat = 'nassau'; d.nassauStake = 10; d.nassauPressRule = '2down';
        d.players = d.players.map((p,i) => Object.assign({}, p, { team: i ? 'Team 2' : 'Team 1' }));
        const st = states(d)[0];
        assert.ok(st, 'the round-format match still renders');
        assert.ok(!st.isSideMatch, 'and is not treated as a side match');
        assert.ok(!/lm-press-link/.test(scorecard(d).html()));
    });

    test('the control is a 44px target', () => {
        const rule = /\.lm-press-link \{([^}]*)\}/.exec(read('index.html'))[1];
        assert.match(rule, /min-height:\s*44px/);
    });
});

describe('THE RECEIVER FOCUSES, IT DOES NOT PRESS', () => {

    const SRC = () => read('sidematches.html');

    test('it reads ?press=', () => {
        assert.match(SRC(), /urlParams\.get\('press'\)/);
    });

    test('every match card is anchored so the link can find it', () => {
        assert.equal((SRC().match(/id="sm-card-\$\{matchId\}"/g) || []).length, 2,
            'both the match-play and stroke-play cards');
    });

    test('it scrolls to the wager and highlights it', () => {
        const src = SRC();
        assert.match(src, /scrollIntoView/);
        assert.match(src, /sm-card-focus/);
        assert.match(src, /\.sm-card-focus \{/, 'and the highlight is styled');
    });

    test('IT WRITES NOTHING ON ARRIVAL', () => {
        // The most important assertion in this file. A press costs real money; it
        // must never happen because a URL was opened.
        const src = SRC();
        const at = src.indexOf("urlParams.get('press')");
        const block = src.slice(at, at + 900);
        ['db.ref', 'pressSideMatch(', '.set(']
            .forEach(t => assert.ok(!block.includes(t),
                'the deep-link handler must not write; found ' + t));
    });

    test('it fires once, not on every re-render', () => {
        assert.match(SRC(), /__smPressFocused/);
    });

    test('the existing ?add=1 deep link still works', () => {
        assert.match(SRC(), /urlParams\.get\('add'\) === '1'/);
        assert.match(SRC(), /__smAutoOpened/);
    });
});

describe('THE WIDGET IS OTHERWISE UNCHANGED', () => {

    test('segment and press stakes still render', () => {
        const html = scorecard(roundData()).html();
        assert.match(html, /class="lm-stake">\$5</);
        assert.match(html, /class="lm-stake">\$10</);
    });

    test('match state is unchanged by adding the link', () => {
        const t = strip(scorecard(roundData()).html());
        assert.match(t, /FRONT 9 Marty 3 UP/);
        assert.match(t, /AUTO PRESS · H3 Marty 1 UP/);
    });

    test('no payout, Who Pays Who or buy-in', () => {
        const t = strip(scorecard(roundData()).html());
        ['Who Pays Who','TOTAL PAYOUT','buy-in','Player Payouts']
            .forEach(w => assert.ok(!new RegExp(w,'i').test(t), w + ' belongs in Results'));
    });

    test('both surfaces still share one presenter', () => {
        ['index.html','leaderboard.html'].forEach(f =>
            assert.match(read(f), /buildLiveMatchStates\(data, courseData, savedScores, visibleIds\)/, f));
        const defs = ['index.html','leaderboard.html','money-engine.js']
            .filter(f => /function buildLiveMatchStates\(/.test(read(f)));
        assert.deepEqual(defs, ['money-engine.js']);
    });
});
