// ============================================================================
// RYDER CUP PHASE 3B — CUP CREATION, TEAM ASSIGNMENT, PAIRING SETUP
//
// The end-to-end proof: build a competition through the SAME functions the
// organizer's Save button calls, persist it, reload it, and watch the Phase 3A
// scorecard card render it with no hand-written Firebase anywhere.
//
// Two rules only exist once play has started, and both are enforced here rather
// than by hiding a button:
//
//   a locked pairing cannot be re-rostered
//   a golfer inside a locked pairing cannot change teams
//
// The second is the subtle one. Without it an organizer could leave Match 1
// untouched, move Manny from Team Rattle to Team Chaos, and retroactively turn a
// finished match into an illegal one.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const RC = loadJsFile('ryder-cup.js', ['handicap.js', 'money-engine.js']);
const SETTLE = loadHtmlInlineScript('settlement.html',
    ['money-engine.js', 'action-model.js', 'settlement-engine.js']);

const PAGE_DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js',
    'ryder-cup.js'];
let _p = null;
const page = () => (_p || (_p = loadHtmlInlineScript('index.html', PAGE_DEPS)));

const PAR = [4,4,3,5,4,4,4,5,3,4,4,4,5,4,3,4,3,5];
const HCP = [3,9,15,13,5,7,1,17,11,4,8,18,14,2,16,10,6,12];
const CD = PAR.map((par, i) => ({ hole: i+1, par, hcpIndex: HCP[i] }));

const NAMES = { 101:'Manny', 102:'Matt', 103:'Marty', 104:'Scott',
                105:'Lance', 106:'Zach', 107:'Chris', 108:'Don' };
const players = () => Object.keys(NAMES).map(id => ({
    id: Number(id), name: NAMES[id], hcp: '0', playingForMoney: true }));

const evens = () => PAR.slice();
const card = d => { const c = PAR.slice(); Object.keys(d).forEach(h => { c[Number(h)-1] += d[h]; }); return c; };
function scoresFrom(cards) {
    const s = {};
    Object.keys(cards).forEach(id => (cards[id] || []).forEach((v, i) => {
        if (v != null) s[`p${id}_h${i+1}`] = v; }));
    return s;
}
const CARDS = { 101: card({1:-1,2:-1}), 102: evens(), 103: evens(), 104: evens(),
                105: evens(), 106: evens(), 107: evens(), 108: evens() };

// EXACTLY what the organizer types into the setup surface.
const DRAFT = () => ({
    name: 'Myrtle Cup', nameA: 'Team Rattle', nameB: 'Team Chaos',
    members: { '101':'A','102':'A','105':'A','106':'A',
               '103':'B','104':'B','107':'B','108':'B' },
    matches: [
        { id:'m1', format:'fourball', playersA:['101','102'], playersB:['103','104'] },
        { id:'m2', format:'fourball', playersA:['105','106'], playersB:['107','108'] }
    ]
});

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

// The organizer's Save button, exactly: build -> validate -> persist.
function save(d, draft) {
    const next = RC.buildRyderCupConfig(draft);
    const problems = RC.validateRyderCupSave(d, CD, d.scores, next);
    if (problems.length > 0) return { ok: false, problems: JSON.parse(JSON.stringify(problems)) };
    d.ryderCup = JSON.parse(JSON.stringify(next));
    return { ok: true };
}
const reload = d => JSON.parse(JSON.stringify(d));

function renderCard(d, ctxIds) {
    return vm.runInContext('(function(){'
        + 'currentData = ' + JSON.stringify(d) + ';'
        + 'window.__scFilteredPlayers = ' + JSON.stringify(
            (ctxIds || []).map(id => ({ id: id, name: NAMES[id] }))) + ';'
        + 'return renderRyderCupHtml(); })()', page());
}

// ===========================================================================
describe('CUP CREATION', () => {

    test('an empty round accepts a new Cup', () => {
        const d = round({});
        assert.equal(RC.hasRyderCup(d), false);
        assert.equal(save(d, DRAFT()).ok, true);
        assert.equal(RC.hasRyderCup(d), true);
    });

    test('the Cup carries its own name, distinct from the side names', () => {
        const d = round({});
        save(d, DRAFT());
        assert.equal(RC.ryderCupName(d), 'Myrtle Cup');
        const cfg = RC.ryderCupConfig(d);
        assert.equal(cfg.sides.A.name, 'Team Rattle');
        assert.equal(cfg.sides.B.name, 'Team Chaos');
    });

    test('a Cup saved without a name falls back rather than storing empty', () => {
        const d = round({});
        const draft = DRAFT(); draft.name = '   ';
        save(d, draft);
        assert.equal(RC.ryderCupName(d), 'Ryder Cup');
    });

    test('memberships and pairings persist as given', () => {
        const d = round({});
        save(d, DRAFT());
        assert.equal(RC.ryderSideOfPlayer(d, 101), 'A');
        assert.equal(RC.ryderSideOfPlayer(d, 107), 'B');
        const cfg = RC.ryderCupConfig(d);
        assert.equal(cfg.matches.m1.playersA.join('/'), '101/102');
        assert.equal(cfg.matches.m2.playersB.join('/'), '107/108');
    });

    test('every match gets a valid sessionId', () => {
        const d = round({});
        save(d, DRAFT());
        const cfg = RC.ryderCupConfig(d);
        assert.equal(cfg.matches.m1.sessionId, 's1');
        assert.equal(cfg.matches.m2.sessionId, cfg.matches.m1.sessionId,
            'two matches in one setup must share a session, or exclusivity cannot work');
    });

    test('a golfer may sit the Cup out entirely', () => {
        // A trip has golfers who miss a session. Not being in the Cup is legal.
        const d = round({});
        const draft = DRAFT();
        delete draft.members['106'];
        draft.matches = [draft.matches[0]];
        assert.equal(save(d, draft).ok, true);
        assert.equal(RC.ryderSideOfPlayer(d, 106), null);
    });

    test('SINGLES can be created through the same path', () => {
        const d = round({});
        const draft = DRAFT();
        draft.matches = [{ id:'s1m', format:'singles', playersA:['101'], playersB:['103'] }];
        assert.equal(save(d, draft).ok, true);
        const r = RC.computeRyderMatchResult(d, CD, scoresFrom(CARDS), 's1m');
        assert.equal(r.format, 'singles');
    });
});

// ===========================================================================
describe('VALIDATION AT SAVE', () => {

    const bad = (mutate) => {
        const d = round({});
        const draft = DRAFT();
        mutate(draft);
        return save(d, draft);
    };

    test('a golfer cannot be on both sides', () => {
        // members is a map, so the real failure is a golfer PLAYING for the side
        // they are not a member of.
        const out = bad(d => { d.matches[0].playersA = ['101', '103']; });
        assert.equal(out.ok, false);
        assert.ok(out.problems.some(p => p.type === 'wrong-side'));
    });

    test('a golfer cannot be placed on side B they do not play for', () => {
        // The mirror of the side-A case. A negative control proved only one branch
        // was exercised: disabling the side-B check escaped every test.
        const out = bad(d => { d.matches[0].playersB = ['103', '101']; });
        assert.equal(out.ok, false);
        assert.ok(out.problems.some(p => p.type === 'wrong-side' && p.playerId === '101'),
            JSON.stringify(out.problems));
    });

    test('a golfer cannot be double-booked in one session', () => {
        const out = bad(d => { d.matches[1].playersA = ['101', '105']; });
        assert.equal(out.ok, false);
        assert.ok(out.problems.some(p => p.type === 'double-booked'));
    });

    test('Four-Ball with the wrong roster count is rejected', () => {
        const out = bad(d => { d.matches[0].playersA = ['101']; });
        assert.equal(out.ok, false);
        assert.ok(out.problems.some(p => p.type === 'roster-size'));
    });

    test('Singles with the wrong roster count is rejected', () => {
        const out = bad(d => {
            d.matches = [{ id:'x', format:'singles', playersA:['101','102'], playersB:['103'] }];
        });
        assert.equal(out.ok, false);
        assert.ok(out.problems.some(p => p.type === 'roster-size'));
    });

    test('an invalid save writes nothing at all', () => {
        const d = round({});
        const draft = DRAFT();
        draft.matches[0].playersA = ['101'];
        assert.equal(save(d, draft).ok, false);
        assert.equal(RC.hasRyderCup(d), false, 'a rejected save must not persist');
    });

    test('every problem carries a human-readable message', () => {
        const out = bad(d => { d.matches[1].playersA = ['101', '105']; });
        out.problems.forEach(p => {
            assert.ok(typeof p.message === 'string' && p.message.length > 10,
                'organizer-facing problems need a sentence, not just a type: ' + JSON.stringify(p));
        });
    });
});

// ===========================================================================
describe('LOCK-AWARE EDITING', () => {

    // Match 1 has played; Match 2 has not.
    function partlyPlayed() {
        const started = {};
        [101,102,103,104].forEach(id => { started[id] = CARDS[id]; });
        const d = round(started);
        save(d, DRAFT());
        RC.lockRyderMatch(d.ryderCup.matches.m1, 1000);
        return d;
    }

    test('the started match reports locked, the other does not', () => {
        const d = partlyPlayed();
        assert.equal(RC.ryderMatchLockState(d, CD, d.scores, d.ryderCup.matches.m1).locked, true);
        assert.equal(RC.ryderMatchLockState(d, CD, d.scores, d.ryderCup.matches.m2).locked, false);
    });

    test('re-rostering the STARTED match is rejected', () => {
        const d = partlyPlayed();
        const draft = DRAFT();
        draft.matches[0].playersA = ['101', '105'];
        draft.matches[0].lockedAt = d.ryderCup.matches.m1.lockedAt;
        draft.matches[0].lockedA = d.ryderCup.matches.m1.lockedA;
        draft.matches[0].lockedB = d.ryderCup.matches.m1.lockedB;
        const out = save(d, draft);
        assert.equal(out.ok, false);
        assert.ok(out.problems.some(p => p.type === 'locked-match-edited'));
    });

    test('editing the UNSTARTED match is accepted', () => {
        const d = partlyPlayed();
        const draft = DRAFT();
        Object.assign(draft.matches[0], {
            lockedAt: d.ryderCup.matches.m1.lockedAt,
            lockedA: d.ryderCup.matches.m1.lockedA,
            lockedB: d.ryderCup.matches.m1.lockedB });
        draft.matches[1].playersA = ['106', '105'];   // reorder, still legal
        const out = save(d, draft);
        assert.equal(out.ok, true, JSON.stringify(out.problems));
        assert.equal(RC.ryderCupConfig(d).matches.m2.playersA.join('/'), '106/105');
    });

    test('a golfer in a started match cannot change teams', () => {
        // The subtle one: Match 1 untouched, but Manny moved to the other side
        // would retroactively make a finished match illegal.
        const d = partlyPlayed();
        const draft = DRAFT();
        Object.assign(draft.matches[0], {
            lockedAt: d.ryderCup.matches.m1.lockedAt,
            lockedA: d.ryderCup.matches.m1.lockedA,
            lockedB: d.ryderCup.matches.m1.lockedB });
        draft.members['101'] = 'B';
        const out = save(d, draft);
        assert.equal(out.ok, false);
        // PINNED TO THE SPECIFIC RULE. An earlier draft accepted either this or a
        // wrong-side problem, and a negative control proved that too loose: removing
        // the locked-member rule entirely still passed on the wrong-side fallback.
        // Both fire here; this asserts the one that exists for started matches.
        assert.ok(out.problems.some(p => p.type === 'locked-member-moved'
            && p.playerId === '101'), JSON.stringify(out.problems));
    });

    test('a started match cannot be deleted', () => {
        const d = partlyPlayed();
        const draft = DRAFT();
        draft.matches = [draft.matches[1]];
        const out = save(d, draft);
        assert.equal(out.ok, false);
        assert.ok(out.problems.some(p => p.type === 'locked-match-removed'));
    });

    test('a rejected edit leaves the stored Cup untouched', () => {
        const d = partlyPlayed();
        const before = JSON.stringify(d.ryderCup);
        const draft = DRAFT();
        draft.matches[0].playersA = ['101', '105'];
        save(d, draft);
        assert.equal(JSON.stringify(d.ryderCup), before);
    });

    test('score CORRECTIONS remain legal after the lock', () => {
        const d = partlyPlayed();
        const before = RC.computeRyderMatchResult(d, CD, d.scores, 'm1');
        d.scores['p101_h1'] = 6;
        const after = RC.computeRyderMatchResult(d, CD, d.scores, 'm1');
        assert.notEqual(after.status, before.status, 'the corrected score must move the match');
        assert.equal(after.playersA.join('/'), 'Manny/Matt', 'the roster must not move with it');
    });
});

// ===========================================================================
describe('REMOVE / CANCEL', () => {

    test('a Cup with no scores can be removed', () => {
        const d = round({});
        save(d, DRAFT());
        assert.equal(RC.canRemoveRyderCup(d, CD, d.scores).ok, true);
    });

    test('a Cup with a started match CANNOT be removed', () => {
        const d = round(CARDS);
        save(d, DRAFT());
        const gate = RC.canRemoveRyderCup(d, CD, d.scores);
        assert.equal(gate.ok, false);
        assert.equal(gate.error, 'already-started');
        assert.ok(/cannot be removed/i.test(gate.message));
    });

    test('removal on a round with no Cup is a no-op, not a crash', () => {
        assert.equal(RC.canRemoveRyderCup(round({}), CD, {}).ok, false);
    });
});

// ===========================================================================
describe('END TO END — created, saved, reloaded, rendered, scored', () => {

    test('a Cup built through setup renders on the scorecard after reload', () => {
        // The core Phase 3B proof: no hand-written Firebase anywhere.
        const d = round({});
        assert.equal(save(d, DRAFT()).ok, true);

        const re = reload(d);
        re.scores = scoresFrom(CARDS);

        const html = renderCard(re, [101, 102, 103, 104]);
        assert.ok(html.length > 0, 'the card did not render from a setup-created Cup');
        assert.ok(html.includes('Team Rattle'));
        assert.ok(html.includes('Team Chaos'));
        assert.ok(/YOUR MATCH/.test(html));
        assert.ok(/Manny \/ Matt/.test(html));
    });

    test('the Cup points are correct after a full round', () => {
        const d = round(CARDS);
        save(d, DRAFT());
        const st = RC.computeRyderCupStandings(reload(d), CD, d.scores);
        assert.equal(st.sides.A.official, 1.5, 'm1 won, m2 halved');
        assert.equal(st.sides.B.official, 0.5);
        assert.equal(st.pointsAvailable, 2);
    });

    test('reload preserves name, sides, memberships, pairings and lock', () => {
        const started = {};
        [101,102,103,104].forEach(id => { started[id] = CARDS[id]; });
        const d = round(started);
        save(d, DRAFT());
        RC.lockRyderMatch(d.ryderCup.matches.m1, 4242);

        const re = reload(d);
        assert.equal(RC.ryderCupName(re), 'Myrtle Cup');
        assert.equal(RC.ryderCupConfig(re).sides.A.name, 'Team Rattle');
        assert.equal(RC.ryderSideOfPlayer(re, 105), 'A');
        assert.equal(re.ryderCup.matches.m1.lockedAt, 4242);
        assert.equal(re.ryderCup.matches.m1.lockedA.join('/'), '101/102');
        assert.equal(re.ryderCup.matches.m2.sessionId, 's1');
        assert.equal(Object.keys(re.sideMatches).length, 3, 'wagers must survive too');
    });
});

// ===========================================================================
describe('MONEY ISOLATION THROUGH THE SETUP PATH', () => {

    function moneyShape(d) {
        const r = SETTLE.computeCombinedNetTotals(d, CD, d.scores);
        return JSON.parse(JSON.stringify({
            netByName: r.netByName, exact: r.exact, contributions: r.contributions,
            transactions: r.transactions,
            receipts: SETTLE.buildSideMatchReceipts(d, CD, d.scores) }));
    }

    test('creating a Cup through setup moves no money', () => {
        const A = round(CARDS);
        const B = round(CARDS);
        save(B, DRAFT());
        assert.deepEqual(moneyShape(B), moneyShape(A));
    });

    test('the stored Cup contains NO money field of any kind', () => {
        const d = round({});
        save(d, DRAFT());
        const raw = JSON.stringify(d.ryderCup);
        ['stake', 'holeBet', 'pressRule', 'payout', 'money', 'wager', 'presses']
            .forEach(f => assert.ok(!new RegExp('"' + f + '"').test(raw),
                `the Cup stored a "${f}" field: ` + raw));
    });

    test('the builder drops any money field an caller tries to smuggle in', () => {
        const d = round({});
        const draft = DRAFT();
        draft.matches[0].stake = 50;
        draft.matches[0].pressRule = '2down';
        draft.stake = 100;
        save(d, draft);
        const raw = JSON.stringify(d.ryderCup);
        assert.ok(!/stake|pressRule/.test(raw),
            'buildRyderCupConfig must whitelist fields, not copy the draft: ' + raw);
    });

    test('all three wagers still settle alongside the Cup', () => {
        const d = round(CARDS);
        save(d, DRAFT());
        const recs = SETTLE.buildSideMatchReceipts(d, CD, d.scores);
        assert.equal(recs.length, 3);
        assert.ok(recs.find(r => r.matchId === 'w3').segments.length > 1, 'presses lost');
    });

    test('money stays zero-sum', () => {
        const d = round(CARDS);
        save(d, DRAFT());
        const sum = Object.values(SETTLE.computeCombinedNetTotals(d, CD, d.scores).contributions)
            .reduce((a, c) => a + c.net, 0);
        assert.ok(Math.abs(sum) < 0.005);
    });
});

// ===========================================================================
describe('ORGANIZER GATING AND PAGE WIRING', () => {

    const SM = fs.readFileSync(path.join(REPO_ROOT, 'sidematches.html'), 'utf8');

    test('sidematches.html loads the Ryder engine', () => {
        assert.ok(/<script src="ryder-cup\.js">/.test(SM));
    });

    test('every Cup mutation refuses a group-locked link', () => {
        // Not a hidden button - each entry point calls the same gate the page
        // already uses for cross-group wager setup.
        ['function rcToggle', 'function rcAddMatch', 'function rcDropMatch',
         'function rcSave', 'function rcRemove'].forEach(fn => {
            const at = SM.indexOf(fn);
            assert.ok(at > -1, fn + ' missing');
            const body = SM.slice(at, at + 400);
            assert.ok(/isOrganizerView\(\)/.test(body) && /refuseGroupWrite/.test(body),
                fn + ' does not refuse a group-locked link');
        });
    });

    test('the setup surface renders nothing for a group-locked link', () => {
        const fn = SM.slice(SM.indexOf('function renderRyderCupSetup'));
        assert.ok(/if \(!isOrganizerView\(\)\) \{ mount\.innerHTML = ''; return; \}/.test(fn.slice(0, 500)));
    });

    test('the UI asks the engine for legality rather than deciding itself', () => {
        const fn = SM.slice(SM.indexOf('function rcSave'), SM.indexOf('function rcRemove'));
        assert.ok(/validateRyderCupSave\(/.test(fn), 'rcSave must call the engine gate');
        assert.ok(!/roster-size|double-booked/.test(fn),
            'the UI must not re-implement validation rules');
    });

    test('no money input exists anywhere in the Cup surface', () => {
        const at = SM.indexOf('RYDER CUP SETUP');
        const surface = SM.slice(at, SM.indexOf('function renderSideMatches'));
        assert.ok(!/\$|stake|wager|press/i.test(surface.replace(/\/\/.*$/gm, '')),
            'the Cup setup must offer no money field');
    });

    test('the service worker cache moved for this change', () => {
        const sw = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');
        assert.ok(!/golfapp-v46/.test(sw),
            'sidematches.html changed, so installed shells must drop theirs');
    });
});

// ===========================================================================
describe('MOBILE LAYOUT', () => {

    const SM = fs.readFileSync(path.join(REPO_ROOT, 'sidematches.html'), 'utf8');

    test('nothing in the setup card can force horizontal overflow', () => {
        assert.ok(/\.rcs-card, \.rcs-card \* \{[^}]*min-width: 0/.test(SM));
        assert.ok(/\.rcs-card, \.rcs-card \* \{[^}]*overflow-wrap: anywhere/.test(SM));
    });

    test('no fixed pixel width is introduced', () => {
        const block = SM.slice(SM.indexOf('.rcs-card {'), SM.indexOf('.rcs-card, .rcs-card *'));
        assert.ok(!/width:\s*\d{3,}px/.test(block));
    });

    test('touch targets are at least 40px', () => {
        assert.ok(/\.rcs-chip \{[^}]*min-height: 40px/.test(SM), 'player chips too small to tap');
        assert.ok(/min-height: 44px/.test(SM), 'action buttons too small to tap');
    });

    test('player assignment uses chips, not a 24-golfer dropdown', () => {
        const fn = SM.slice(SM.indexOf('function renderRyderCupSetup'),
                            SM.indexOf('function rcOpen'));
        assert.ok(/rcs-chip/.test(fn));
        assert.ok(!/<select/.test(fn), 'a long select is the wrong picker on a phone');
    });
});

// ===========================================================================
describe('LEGACY `ryder` — untouched by setup', () => {

    test('a legacy round is not a Cup and offers no setup state', () => {
        const d = round(CARDS, { gameFormat:'ryder', matchStake:50, noWagers:true });
        assert.equal(RC.hasRyderCup(d), false);
        assert.equal(RC.ryderCupName(d), null);
        assert.equal(renderCard(d, [101,102,103,104]), '');
    });

    test('legacy ryder still settles its money unchanged', () => {
        // Legacy ryder splits on p.team; this suite's players carry none, so the
        // engine correctly finds one side and pays nothing. Teams assigned here.
        const d = round(CARDS, { gameFormat:'ryder', matchStake:50, noWagers:true });
        d.players.forEach((p, i) => { p.team = i % 2 === 0 ? 'Team 1' : 'Team 2'; });
        const c = SETTLE.computeCombinedNetTotals(d, CD, d.scores).contributions;
        assert.ok(Object.values(c).some(x => x.lines.some(l => /ryder/i.test(l.label))));
    });
});
