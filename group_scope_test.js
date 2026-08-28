// ============================================================================
// THE SCORECARD IS A WORKING VIEW FOR ONE FOURSOME
//
// liveStandings() read currentData.players - the whole field - while every other
// widget on the same row scoped to __scFilteredPlayers. So a Group 1 scorekeeper
// on a two-foursome Monday saw Paul and Dan in their top card: golfers they are
// not tracking and cannot score.
//
// The product rule this encodes:
//
//   Scorecard          the group this scorekeeper is responsible for
//   Leaderboard page   the whole field
//   Skins              whole field, because a skins pot IS field-wide
//   Nassau / side bets unchanged - a cross-group wager still shows both sides
//
// A cross-group wager names its opponent on the MATCH card. It must not add that
// golfer to these standings: the leaderboard represents the group being scored,
// not everyone the group has money against.
//
// FIXTURES ARE REAL GROUP LOCKS. hasGroupLock, lockedGroup and
// __scPlayerGroupMap are all set the way index.html sets them from ?group=N.
// Filtering a player array by hand would prove the filter works, not that the
// lock reaches it.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const IDX = ['score-marks.js','money-engine.js','action-model.js','settlement-engine.js',
             'pool-engine.js','bet-strip.js','hole-events.js'];
const LB = ['money-engine.js','action-model.js','settlement-engine.js'];
const cd18 = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));

// Two foursomes: 101-104 in group 1, 105-108 in group 2.
const NAMES = ['Marty','Manny','Carp','Scott','Paul','Pete','Dan','Ray'];
const FIELD = Array.from({length:8},(_,i)=>({ id:101+i, name:NAMES[i], hcp:'0', group: i<4 ? 1 : 2 }));
const GROUP1 = NAMES.slice(0,4);
const GROUP2 = NAMES.slice(4);

const nassau = (a, b, stake) => ({
    format:'nassau', scoring:'net', teamAIds:[String(a)], teamBIds:[String(b)],
    startHole:1, stake, frontStake:stake, backStake:stake, overallStake:stake,
    autoPressStake:null, pressRule:'2down',
});
function round(over) {
    const scores = {};
    FIELD.forEach(p => cd18.forEach(h => { if (h.hole <= 6) scores['p'+p.id+'_h'+h.hole] = 4; }));
    scores.p101_h1 = 3;   // Marty, group 1
    scores.p105_h2 = 3;   // Paul, group 2
    return Object.assign({ players: FIELD, courseData: cd18, scores, gameFormat: 'stroke' }, over || {});
}

// Renders the scorecard exactly as a ?group=N link does.
function scorecard(d, lockedGroup) {
    const sb = loadHtmlInlineScript('index.html', IDX);
    const groupMap = FIELD.reduce((m,p) => (m[p.id] = p.group, m), {});
    vm.runInContext(`
        currentMode = 'A';
        hasGroupLock = ${lockedGroup ? 'true' : 'false'};
        lockedGroup = ${lockedGroup || 'null'};
        currentData = ${JSON.stringify(d)};
        window.__scPlayerGroupMap = ${JSON.stringify(groupMap)};
        // What index.html derives from the lock: the players this link may score.
        window.__scFilteredPlayers = ${lockedGroup
            ? `currentData.players.filter(function(p){ return p.group === ${lockedGroup}; })`
            : '[]'};
        renderLiveTicker();
    `, sb);
    const html = String(vm.runInContext(
        "document.getElementById('live-ticker-mount').innerHTML", sb));
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const cut = (marker) => {
        const i = text.indexOf(marker);
        return i === -1 ? '' : text.slice(i);
    };
    const boardText = (() => {
        const start = text.indexOf('LIVE LEADERBOARD');
        if (start === -1) return '';
        // Up to whichever card comes next.
        const ends = ['SKINS','LIVE MATCHES','LIVE GAME'].map(m => text.indexOf(m, start))
            .filter(i => i > -1);
        return text.slice(start, ends.length ? Math.min.apply(null, ends) : undefined);
    })();
    const namesIn = (t) => NAMES.filter(n => new RegExp('\\b' + n + '\\b').test(t));
    return {
        html,
        boardNames: namesIn(boardText),
        skinsNames: namesIn(cut('SKINS')),
        wagers: [...new Set(text.match(/[A-Z][a-z]+ v [A-Z][a-z]+/g) || [])],
        sb,
    };
}
function leaderboardPage(d) {
    const sb = loadHtmlInlineScript('leaderboard.html', LB);
    vm.runInContext(`
        currentBoardData = ${JSON.stringify(d)};
        activeView = 'individual'; groupViewMode = 'flat'; activeScoring = 'net';
        renderBoard();
    `, sb);
    const t = String(vm.runInContext("document.getElementById('board-content').innerHTML", sb))
        .replace(/<[^>]+>/g, ' ');
    return NAMES.filter(n => new RegExp('\\b' + n + '\\b').test(t));
}

// ============================================================================

describe('THE SCORECARD LEADERBOARD FOLLOWS THE GROUP LOCK', () => {

    const twoNassaus = () => round({ sideMatches: {
        g1: nassau(101, 102, 10),   // group 1's own
        g2: nassau(105, 106, 20),   // group 2's own
    }});

    test('Group 1 sees only Group 1 golfers', () => {
        const r = scorecard(twoNassaus(), 1);
        assert.ok(r.boardNames.length > 0, 'the board must render something');
        r.boardNames.forEach(n => assert.ok(GROUP1.includes(n),
            n + ' is not in Group 1 and must not appear'));
    });

    test('Group 2 sees only Group 2 golfers', () => {
        const r = scorecard(twoNassaus(), 2);
        assert.ok(r.boardNames.length > 0);
        r.boardNames.forEach(n => assert.ok(GROUP2.includes(n),
            n + ' is not in Group 2 and must not appear'));
    });

    test('an unlocked scorecard may show the whole field', () => {
        // No lock means no foursome to scope to - the organizer's view is unchanged.
        const r = scorecard(twoNassaus(), null);
        assert.ok(r.boardNames.some(n => GROUP1.includes(n)));
        assert.ok(r.boardNames.some(n => GROUP2.includes(n)),
            'without a lock the board is not restricted');
    });

    test('it uses the SAME scoped set as the other cards, not a second rule', () => {
        const src = read('index.html');
        const at = src.indexOf('function liveStandings');
        const fn = src.slice(at, at + 1400);
        assert.match(fn, /window\.__scFilteredPlayers/,
            'the standings must read the canonical scoped set');
        assert.match(fn, /currentData && currentData\.players/,
            'and fall back to the whole field when there is no lock');
    });
});

describe('WAGER VISIBILITY IS UNCHANGED', () => {

    const mixed = () => round({ sideMatches: {
        g1: nassau(101, 102, 10),   // group 1 private
        g2: nassau(105, 106, 20),   // group 2 private
        x:  nassau(101, 105, 50),   // cross-group
    }});

    test("Group 2's private Nassau is invisible to Group 1", () => {
        const r = scorecard(mixed(), 1);
        assert.ok(!r.wagers.includes('Paul v Pete'),
            'another foursome\u2019s private bet is none of their business');
    });

    test("and Group 1's private Nassau is invisible to Group 2", () => {
        assert.ok(!scorecard(mixed(), 2).wagers.includes('Marty v Manny'));
    });

    test('a cross-group wager appears to BOTH groups', () => {
        assert.ok(scorecard(mixed(), 1).wagers.includes('Marty v Paul'));
        assert.ok(scorecard(mixed(), 2).wagers.includes('Marty v Paul'));
    });

    test('but it does NOT widen the scorecard leaderboard', () => {
        // The match card names the opponent; the standings still represent the
        // group being scored. This is the distinction the batch turns on.
        const r = scorecard(mixed(), 1);
        assert.ok(r.wagers.includes('Marty v Paul'), 'the wager is visible');
        assert.ok(!r.boardNames.includes('Paul'),
            'yet Paul must not join Group 1\u2019s standings');
        r.boardNames.forEach(n => assert.ok(GROUP1.includes(n), n));
    });

    test('each group still sees its own wager', () => {
        assert.ok(scorecard(mixed(), 1).wagers.includes('Marty v Manny'));
        assert.ok(scorecard(mixed(), 2).wagers.includes('Paul v Pete'));
    });
});

describe('FIELD-WIDE GAMES STAY FIELD-WIDE', () => {

    const skinsRound = () => round({ additionalGames: { skins: true }, skinsBuyIn: 5 });

    test('Skins still shows golfers from both groups', () => {
        // A skins pot is genuinely field-wide, so scoping it would be wrong.
        const r = scorecard(skinsRound(), 1);
        assert.ok(r.skinsNames.includes('Paul'),
            'Paul is in Group 2 and must still appear in a field-wide pool');
    });

    test('while the standings beside it stay scoped', () => {
        const r = scorecard(skinsRound(), 1);
        r.boardNames.forEach(n => assert.ok(GROUP1.includes(n),
            n + ' must not be in Group 1\u2019s standings'));
    });

    test('the dedicated Leaderboard page remains whole-field', () => {
        const names = leaderboardPage(round());
        assert.equal(names.length, 8, 'every golfer must appear: ' + names.join(', '));
    });

    test('leaderboard.html was not touched by this batch', () => {
        assert.ok(!read('leaderboard.html').includes('__scFilteredPlayers'),
            'the whole-field page has no business knowing about a scorecard lock');
    });
});

describe('PERMISSIONS AND MONEY ARE UNTOUCHED', () => {

    test('press permission still checks the stored participants', () => {
        const src = read('index.html');
        const at = src.indexOf('function canPressSideMatch');
        const fn = src.slice(at, at + 1200);
        assert.match(fn, /__scPlayerGroupMap/, 'still group-checked');
        assert.match(fn, /teamAIds/, 'against the stored wager, not the rendering');
        assert.ok(!fn.includes('__scFilteredPlayers'),
            'permission must not be derived from what happens to be on screen');
    });

    test('a group scorekeeper may press their own wager, not another group\u2019s', () => {
        const r = scorecard(round({ sideMatches: {
            g1: nassau(101, 102, 10), g2: nassau(105, 106, 20) } }), 1);
        const can = (key) => vm.runInContext(
            `canPressSideMatch(currentData.sideMatches['${key}'])`, r.sb);
        assert.equal(can('g1'), true, 'their own foursome\u2019s wager');
        assert.equal(can('g2'), false, 'another foursome\u2019s wager');
    });

    test('no engine or settlement file was touched', () => {
        ['money-engine.js','settlement-engine.js','pool-engine.js','action-model.js']
            .forEach(f => assert.ok(!read(f).includes('__scFilteredPlayers'),
                f + ' must know nothing about scorecard scoping'));
    });

    test('settlement still counts the whole field', () => {
        // Scoping is presentation. The money is unchanged, and covers everyone.
        const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                     parseInt, parseFloat, Date, Set, Map };
        vm.createContext(sb);
        ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
            .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
        const compute = vm.runInContext('computeCombinedNetTotals', sb);
        const d = round({ settlementMode: 'whole-dollar',
            sideMatches: { g1: nassau(101, 102, 10), g2: nassau(105, 106, 20) } });
        const vals = Object.values(compute(d, cd18, d.scores).netByName);
        assert.equal(vals.reduce((a, v) => a + v.net, 0), 0, 'zero-sum across the field');
        assert.ok(vals.some(v => GROUP1.includes(v.name) && v.net !== 0), 'group 1 settled');
        assert.ok(vals.some(v => GROUP2.includes(v.name) && v.net !== 0), 'group 2 settled');
    });
});
