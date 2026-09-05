// ============================================================================
// RYDER CUP PHASE 3A — PRODUCTION SCORECARD UI + SCORE-WRITE LOCK
//
// The first phase where the Ryder Cup is reachable by a golfer, so these tests
// drive the REAL production render function out of index.html rather than a
// stand-in, and the REAL saveScore() path rather than a description of it.
//
// jsdom is deliberately not a dependency of this repo (see dot_context_test.js),
// so the card is asserted on its emitted markup: what renders, what does not, and
// what a 360px phone would be handed. Not pixel assertions - structure and text.
//
// The two invariants that matter most here:
//
//   1. A legacy `gameFormat: 'ryder'` round must NOT light up this card. Legacy
//      ryder is a field-wide money match with no sides and no pairings; showing a
//      Cup scoreboard for it would be inventing a competition that never existed.
//
//   2. Locking the PAIRING must never lock the SCORES. A 5 entered for a 4 stays
//      correctable forever. What freezes is who is playing the match.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE_DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js',
    'ryder-cup.js'];
let _p = null;
const page = () => (_p || (_p = loadHtmlInlineScript('index.html', PAGE_DEPS)));
const call = e => vm.runInContext(e, page());

const RC = loadJsFile('ryder-cup.js', ['handicap.js', 'money-engine.js']);
const SETTLE = loadHtmlInlineScript('settlement.html',
    ['money-engine.js', 'action-model.js', 'settlement-engine.js']);

const PAR = [4,4,3,5,4,4,4,5,3,4,4,4,5,4,3,4,3,5];
const HCP = [3,9,15,13,5,7,1,17,11,4,8,18,14,2,16,10,6,12];
const CD = PAR.map((par, i) => ({ hole: i+1, par, hcpIndex: HCP[i] }));

const NAMES = { 101:'Manny', 102:'Matt', 103:'Marty', 104:'Scott',
                105:'Lance', 106:'Zach', 107:'Chris', 108:'Don' };
const players = () => Object.keys(NAMES).map(id => ({
    id: Number(id), name: NAMES[id], hcp: '0',
    team: Number(id) % 2 ? 'Team 1' : 'Team 2', playingForMoney: true }));

const evens = () => PAR.slice();
const card = d => { const c = PAR.slice(); Object.keys(d).forEach(h => { c[Number(h)-1] += d[h]; }); return c; };
function scoresFrom(cards) {
    const s = {};
    Object.keys(cards).forEach(id => (cards[id] || []).forEach((v, i) => {
        if (v != null) s[`p${id}_h${i+1}`] = v; }));
    return s;
}
// m1 Manny/Matt beat Marty/Scott. m2 Lance/Zach v Chris/Don all square.
const CARDS = { 101: card({1:-1,2:-1}), 102: evens(), 103: evens(), 104: evens(),
                105: evens(), 106: evens(), 107: evens(), 108: evens() };

function cup(opts) {
    opts = opts || {};
    return { v: 1,
        sides: { A: { id:'A', name: opts.nameA || 'Team Rattle', color:'red' },
                 B: { id:'B', name: opts.nameB || 'Team Chaos',  color:'blue' } },
        members: { '101':'A','102':'A','105':'A','106':'A',
                   '103':'B','104':'B','107':'B','108':'B' },
        matches: opts.matches || {
            m1: { id:'m1', sessionId:'s1', format:'fourball', scoring:'net',
                  sideA:'A', sideB:'B', playersA:['101','102'], playersB:['103','104'] },
            m2: { id:'m2', sessionId:'s1', format:'fourball', scoring:'net',
                  sideA:'A', sideB:'B', playersA:['105','106'], playersB:['107','108'] }
        }};
}

const sideMatches = () => ({
    w1: { format:'match', scoring:'net', stake:20, pressRule:'2down',
          teamAIds:['101'], teamBIds:['103'], presses:{} },
    w2: { format:'stroke', scoring:'net', overallStake:20, holeStake:0, tieRule:'push',
          overallMode:'stroke', segment:'full', teamAIds:['102'], teamBIds:['104'],
          overallPresses:{} },
    w3: { format:'match', scoring:'net', stake:50, pressRule:'2down',
          teamAIds:['101','102'], teamBIds:['103','104'], presses:{} }
});

function round(cards, opts) {
    opts = opts || {};
    const d = { gameFormat: opts.gameFormat || 'stroke', players: players(),
        courseData: CD, scores: scoresFrom(cards),
        sideMatches: opts.noWagers ? {} : sideMatches() };
    if (opts.cup) d.ryderCup = opts.cup;
    if (opts.matchStake) d.matchStake = opts.matchStake;
    return d;
}

// Drives the REAL production render function, with the REAL group-scoping global.
function render(d, ctxIds) {
    return call('(function(){'
        + 'currentData = ' + JSON.stringify(d) + ';'
        + 'window.__scFilteredPlayers = ' + JSON.stringify(
            (ctxIds || []).map(id => ({ id: id, name: NAMES[id] }))) + ';'
        + 'return renderRyderCupHtml();'
        + '})()');
}

const G1 = [101, 102, 103, 104];
const G2 = [105, 106, 107, 108];

// ===========================================================================
describe('WHEN THE CARD RENDERS', () => {

    test('no ryderCup node yields no card at all', () => {
        assert.equal(render(round(CARDS), G1), '');
    });

    test('a LEGACY gameFormat:ryder round yields no card', () => {
        // The single most important gate in this phase. Legacy ryder is a
        // field-wide money match with no sides and no pairings.
        const d = round(CARDS, { gameFormat: 'ryder', matchStake: 50, noWagers: true });
        assert.equal(render(d, G1), '',
            'legacy ryder must never display the new Cup card');
    });

    test('the legacy gate is present in source, not merely implied', () => {
        // DEFENCE IN DEPTH MADE THIS INVISIBLE. Removing the hasRyderCup() guard
        // changed no test result, because computeRyderCupStandings() returns null
        // for a legacy round and the next line catches it. Two guards is correct;
        // an unpinned one that can be deleted silently is not.
        const src = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
        const fn = src.slice(src.indexOf('function renderRyderCupHtml'));
        assert.ok(/!hasRyderCup\(currentData\)\) return '';/.test(fn.slice(0, 800)),
            'the explicit legacy gate must remain the first thing this function does');
    });

    test('a valid competition renders the card', () => {
        const html = render(round(CARDS, { cup: cup() }), G1);
        assert.ok(html.length > 0);
        assert.ok(/RYDER CUP/.test(html));
    });

    test('the STORED side names render, never hardcoded ones', () => {
        const html = render(round(CARDS, { cup: cup({ nameA:'Myrtle', nameB:'Beach' }) }), G1);
        assert.ok(html.includes('Myrtle'), 'stored side name missing');
        assert.ok(html.includes('Beach'));
        ['Team USA', 'Team Europe', 'Team 1', 'Team 2'].forEach(bad =>
            assert.ok(!html.includes(bad), `hardcoded "${bad}" leaked into the card`));
    });

    test('a competition with no matches renders nothing', () => {
        assert.equal(render(round(CARDS, { cup: cup({ matches: {} }) }), G1), '');
    });
});

// ===========================================================================
describe('OFFICIAL vs LIVE', () => {

    test('official points render for decided matches', () => {
        const html = render(round(CARDS, { cup: cup() }), G1);
        assert.ok(/Team Rattle<\/span><span class="rc-spts">1\.5</.test(html), html.slice(0, 400));
        assert.ok(/Team Chaos<\/span><span class="rc-spts">0\.5</.test(html));
    });

    test('an in-progress match is labelled LIVE, never merged into official', () => {
        const partial = {};
        [101,102,103,104].forEach(id => { partial[id] = CARDS[id]; });
        [105,106,107,108].forEach(id => { partial[id] = CARDS[id].slice(0, 9); });
        const html = render(round(partial, { cup: cup() }), G1);
        // Official banks only m1.
        assert.ok(/rc-spts">1</.test(html), 'official should show 1, not 1.5');
        assert.ok(/LIVE/.test(html), 'a live projection must be labelled');
        assert.ok(/Team Rattle 1\.5/.test(html), 'projection should read 1.5');
    });

    test('with nothing live, no LIVE row is printed at all', () => {
        const html = render(round(CARDS, { cup: cup() }), G1);
        assert.ok(!/LIVE/.test(html),
            'a finished session must show one unambiguous score');
    });

    test('the count of final matches is stated', () => {
        assert.ok(/2 of 2 final/.test(render(round(CARDS, { cup: cup() }), G1)));
    });
});

// ===========================================================================
describe('YOUR MATCH', () => {

    test('group 1 sees its own pairing', () => {
        const html = render(round(CARDS, { cup: cup() }), G1);
        assert.ok(/YOUR MATCH/.test(html));
        assert.ok(/rc-mside">Manny \/ Matt</.test(html));
        assert.ok(/rc-mside">Marty \/ Scott</.test(html));
    });

    test('group 2 sees ITS own pairing, not group 1s', () => {
        const html = render(round(CARDS, { cup: cup() }), G2);
        assert.ok(/rc-mside">Lance \/ Zach</.test(html));
        assert.ok(!/rc-mside">Manny \/ Matt</.test(html),
            'group 2 must not be shown group 1 as YOUR MATCH');
    });

    test('a spectator with no group context gets NO fabricated YOUR MATCH', () => {
        const html = render(round(CARDS, { cup: cup() }), []);
        assert.ok(html.length > 0, 'the scoreboard should still render');
        assert.ok(!/YOUR MATCH/.test(html),
            'naming a match "yours" to someone not in it is worse than showing none');
        assert.ok(/All Matches/.test(html), 'All Matches must still be reachable');
    });

    test('YOUR MATCH works for a singles pairing', () => {
        const c = cup({ matches: { sg: { id:'sg', sessionId:'s1', format:'singles',
            scoring:'net', sideA:'A', sideB:'B', playersA:['101'], playersB:['103'] } } });
        const html = render(round(CARDS, { cup: c }), G1);
        assert.ok(/YOUR MATCH/.test(html));
        assert.ok(/rc-mside">Manny</.test(html));
        assert.ok(/rc-mside">Marty</.test(html));
    });
});

// ===========================================================================
describe('ALL MATCHES', () => {

    test('every pairing appears exactly once', () => {
        const html = render(round(CARDS, { cup: cup() }), G1);
        const rows = (html.match(/rc-arow/g) || []).length;
        assert.equal(rows, 2, `expected 2 match rows, found ${rows}`);
        assert.equal((html.match(/Lance \/ Zach/g) || []).length, 1);
    });

    test('it is collapsed by default so a 12-match Cup cannot bury scoring', () => {
        const many = {};
        for (let i = 0; i < 4; i++) {
            many['x' + i] = { id:'x'+i, sessionId:'s1', format:'singles', scoring:'net',
                sideA:'A', sideB:'B', playersA:[String(101+i)], playersB:[String(105+i)] };
        }
        const html = render(round(CARDS, { cup: cup({ matches: many }) }), G1);
        assert.ok(/<details class="rc-all">/.test(html));
        assert.ok(!/<details class="rc-all" open>/.test(html),
            'All Matches must be collapsed by default');
    });

    test('a halved final reads HALVED', () => {
        const html = render(round(CARDS, { cup: cup() }), G2);
        assert.ok(/HALVED/.test(html));
    });

    test('an early closeout reads as a closeout', () => {
        const cards = Object.assign({}, CARDS, { 101: card({1:-1,2:-1,3:-1,4:-1,5:-1,6:-1,7:-1}) });
        const html = render(round(cards, { cup: cup() }), G1);
        assert.ok(/FINAL/.test(html), html.slice(0, 600));
        assert.ok(/&/.test(html), 'a closeout should print like 7 & 6');
    });

    test('a live match reads "AS thru N"', () => {
        const partial = {};
        [105,106,107,108].forEach(id => { partial[id] = CARDS[id].slice(0, 12); });
        const html = render(round(partial, { cup: cup() }), G2);
        assert.ok(/AS thru 12/.test(html), html.slice(0, 600));
    });
});

// ===========================================================================
describe('360px LAYOUT', () => {

    test('nothing in the card can force horizontal overflow', () => {
        // The one realistic way a phone gets a sideways scrollbar is a long
        // unbroken partner pair widening the flex row.
        const src = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
        assert.ok(/\.rc-card, \.rc-card \* \{[^}]*min-width:0/.test(src),
            'card children must be allowed to shrink');
        assert.ok(/\.rc-card, \.rc-card \* \{[^}]*overflow-wrap:anywhere/.test(src),
            'long names must wrap rather than widen the card');
    });

    test('no fixed pixel width is introduced anywhere in the card styles', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
        const block = src.slice(src.indexOf('.rc-srow'), src.indexOf('.rc-card, .rc-card *'));
        assert.ok(!/width:\s*\d{3,}px/.test(block),
            'a fixed width of 100px or more would overflow a 360px phone');
    });

    test('the card stays compact: no match list in the closed height', () => {
        const html = render(round(CARDS, { cup: cup() }), G1);
        const closed = html.slice(0, html.indexOf('<details'));
        assert.ok(!/rc-arow/.test(closed),
            'the match list must live inside the collapsed section');
    });
});

// ===========================================================================
describe('SCORE-WRITE LOCK INTEGRATION', () => {

    const SRC = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

    test('saveScore calls the lock on the one canonical write path', () => {
        const fn = SRC.slice(SRC.indexOf('function saveScore('),
                             SRC.indexOf('// ---- PERSISTENT VERIFICATION STATE'));
        assert.ok(/maybeLockRyderMatches\(playerId, holeNum\)/.test(fn),
            'the lock must fire from saveScore, the app\'s one score-writing function');
    });

    test('the lock fires regardless of whether the value CHANGED', () => {
        // Re-entering the same score is still the first score of the match if it
        // arrived from another device. Sitting the lock inside the oldVal !== newVal
        // branch would miss that.
        const fn = SRC.slice(SRC.indexOf('function saveScore('),
                             SRC.indexOf('// ---- PERSISTENT VERIFICATION STATE'));
        const lockAt = fn.indexOf('maybeLockRyderMatches');
        const branchAt = fn.indexOf('if (oldVal !== newVal)');
        assert.ok(lockAt < branchAt && lockAt !== -1,
            'the lock must sit outside the changed-value branch');
    });

    test('no scores means the pairing is still editable', () => {
        // Single-match cup so 105 is genuinely free. With m2 present this same edit
        // is rejected as a double-booking - correctly, and it caught me twice.
        const one = cup({ matches: { m1: { id:'m1', sessionId:'s1', format:'fourball',
            scoring:'net', sideA:'A', sideB:'B',
            playersA:['101','102'], playersB:['103','104'] } } });
        const d = round({}, { cup: one });
        const st = RC.ryderMatchLockState(d, CD, d.scores, d.ryderCup.matches.m1);
        assert.equal(st.locked, false);
        assert.equal(RC.applyRyderPairingChange(d, CD, d.scores, 'm1',
            { playersA:['101','105'], playersB:['103','104'] }).ok, true);
    });

    test('one relevant score locks that match', () => {
        const d = round({}, { cup: cup() });
        d.scores = { 'p101_h1': 4 };
        assert.equal(RC.ryderMatchLockState(d, CD, d.scores, d.ryderCup.matches.m1).locked, true);
    });

    test('a score from a golfer OUTSIDE the match does not lock it', () => {
        const d = round({}, { cup: cup() });
        d.scores = { 'p105_h1': 4 };          // group 2 golfer
        assert.equal(RC.ryderMatchLockState(d, CD, d.scores, d.ryderCup.matches.m1).locked,
            false, 'match 1 must not lock on a golfer who is not in it');
        assert.equal(RC.ryderMatchLockState(d, CD, d.scores, d.ryderCup.matches.m2).locked, true);
    });

    test('group 1 scoring locks match 1 only', () => {
        const g1 = {}; [101,102,103,104].forEach(id => { g1[id] = CARDS[id]; });
        const d = round(g1, { cup: cup() });
        assert.equal(RC.ryderMatchLockState(d, CD, d.scores, d.ryderCup.matches.m1).locked, true);
        assert.equal(RC.ryderMatchLockState(d, CD, d.scores, d.ryderCup.matches.m2).locked, false);
    });

    test('a locked pairing rejects a roster change', () => {
        const d = round(CARDS, { cup: cup() });
        const out = RC.applyRyderPairingChange(d, CD, d.scores, 'm1',
            { playersA:['101','105'], playersB:['103','104'] });
        assert.equal(out.ok, false);
        assert.equal(out.error, 'match-locked');
    });

    test('SCORE CORRECTIONS remain allowed after the lock', () => {
        // What locks is WHO plays, never the numbers.
        const d = round(CARDS, { cup: cup() });
        RC.lockRyderMatch(d.ryderCup.matches.m1, 500);
        const before = RC.computeRyderMatchResult(d, CD, d.scores, 'm1');
        d.scores['p101_h1'] = 5;              // 4 corrected to 5
        const after = RC.computeRyderMatchResult(d, CD, d.scores, 'm1');
        assert.notEqual(after.status, before.status,
            'a corrected score must still move the match');
        assert.equal(after.playersA.join('/'), 'Manny/Matt',
            'the roster must not have moved with it');
    });

    test('the snapshot survives a config rewrite', () => {
        const d = round(CARDS, { cup: cup() });
        RC.lockRyderMatch(d.ryderCup.matches.m1, 500);
        d.ryderCup.matches.m1.playersA = ['105','106'];
        assert.equal(RC.computeRyderMatchResult(d, CD, d.scores, 'm1').playersA.join('/'),
            'Manny/Matt');
    });

    test('reload preserves the lock', () => {
        const d = round(CARDS, { cup: cup() });
        RC.lockRyderMatch(d.ryderCup.matches.m1, 777);
        const re = JSON.parse(JSON.stringify(d));
        assert.equal(re.ryderCup.matches.m1.lockedAt, 777);
        assert.equal(RC.applyRyderPairingChange(re, CD, re.scores, 'm1',
            { playersA:['105','106'], playersB:['103','104'] }).error, 'match-locked');
    });

    test('a singles match locks on its own first score', () => {
        const c = cup({ matches: { sg: { id:'sg', sessionId:'s1', format:'singles',
            scoring:'net', sideA:'A', sideB:'B', playersA:['101'], playersB:['103'] } } });
        const d = round({}, { cup: c });
        assert.equal(RC.ryderMatchLockState(d, CD, d.scores, d.ryderCup.matches.sg).locked, false);
        d.scores = { 'p103_h1': 4 };
        assert.equal(RC.ryderMatchLockState(d, CD, d.scores, d.ryderCup.matches.sg).locked, true);
    });

    test('side-match activity alone cannot alter Ryder roster state', () => {
        const d = round(CARDS, { cup: cup() });
        const before = JSON.stringify(d.ryderCup);
        SETTLE.buildSideMatchReceipts(d, CD, d.scores);
        SETTLE.computeCombinedNetTotals(d, CD, d.scores);
        assert.equal(JSON.stringify(d.ryderCup), before,
            'settling money must not touch the competition');
    });
});

// ===========================================================================
describe('PRODUCTION WIRING', () => {

    test('index.html loads ryder-cup.js AFTER money-engine.js', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
        const me = src.indexOf('src="money-engine.js"');
        const rc = src.indexOf('src="ryder-cup.js"');
        assert.ok(rc > -1, 'index.html must load ryder-cup.js');
        assert.ok(rc > me, 'ryder-cup.js depends on money-engine.js and must load after it');
    });

    test('the service worker precaches it and the cache key was bumped', () => {
        const sw = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');
        assert.ok(/'\.\/ryder-cup\.js'/.test(sw), 'ryder-cup.js is not precached');
        assert.ok(!/golfapp-v45/.test(sw),
            'the cache key must move, or installed PWAs keep a shell without the engine');
    });

    test('the iOS bundle receives the same engine as the browser', () => {
        const sync = fs.readFileSync(path.join(REPO_ROOT, 'sync-mobile-web.js'), 'utf8');
        assert.ok(/'ryder-cup\.js'/.test(sync),
            'the native bundle would ship a scorecard that cannot render the Cup card');
    });

    test('the card is mounted in the live ticker grid', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
        const fn = src.slice(src.indexOf('function renderLiveTicker'));
        assert.ok(/renderRyderCupHtml\(\)/.test(fn.slice(0, 3000)),
            'the card must be assembled into the existing widget grid');
    });
});

// ===========================================================================
describe('SIDE MATCH + MONEY REGRESSION', () => {

    function moneyShape(d) {
        const r = SETTLE.computeCombinedNetTotals(d, CD, d.scores);
        return JSON.parse(JSON.stringify({
            netByName: r.netByName, exact: r.exact, contributions: r.contributions,
            transactions: r.transactions,
            receipts: SETTLE.buildSideMatchReceipts(d, CD, d.scores) }));
    }

    test('adding a production-visible Cup moves no money at all', () => {
        assert.deepEqual(moneyShape(round(CARDS, { cup: cup() })),
                         moneyShape(round(CARDS)));
    });

    test('all three wagers still settle with the Cup on screen', () => {
        const d = round(CARDS, { cup: cup() });
        const recs = SETTLE.buildSideMatchReceipts(d, CD, d.scores);
        assert.equal(recs.length, 3);
        assert.ok(recs.find(r => r.matchId === 'w3').segments.length > 1, 'presses lost');
    });

    test('money stays zero-sum', () => {
        const d = round(CARDS, { cup: cup() });
        const sum = Object.values(SETTLE.computeCombinedNetTotals(d, CD, d.scores).contributions)
            .reduce((a, c) => a + c.net, 0);
        assert.ok(Math.abs(sum) < 0.005);
    });

    test('the Ryder card never prints a dollar sign', () => {
        const html = render(round(CARDS, { cup: cup() }), G1);
        assert.ok(!/\$/.test(html), 'a Cup point must never be shown as money');
    });

    test('the scorecard still renders Side Match and Press affordances', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
        // THE ANCHOR ELEMENT, not the class name. A negative control proved the
        // earlier check useless: "matches-nav-link" also appears twice in CSS, so
        // deleting the actual <a> still left the string in the file.
        assert.ok(/<a href="sidematches\.html"[^>]*matches-nav-link[^>]*>/.test(src),
            'the Matches tab link element disappeared');
        assert.ok(/sideMatchPressHref/.test(src), 'the press link builder disappeared');
    });
});

// ===========================================================================
describe('LEGACY `ryder` — engine untouched', () => {

    test('legacy ryder still settles its money', () => {
        const d = round(CARDS, { gameFormat:'ryder', matchStake:50, noWagers:true });
        const c = SETTLE.computeCombinedNetTotals(d, CD, d.scores).contributions;
        assert.ok(Object.values(c).some(x => x.lines.some(l => /ryder/i.test(l.label))),
            'legacy ryder lost its money line');
    });

    test('legacy ryder is not a Cup and renders no card', () => {
        const d = round(CARDS, { gameFormat:'ryder', matchStake:50, noWagers:true });
        assert.equal(RC.hasRyderCup(d), false);
        assert.equal(render(d, G1), '');
    });
});
