// ============================================================================
// LIVE PRESS VISIBILITY — rendered, both pages, both card states
//
// THE GAP THIS CLOSES
// The money was right everywhere it settled - storage, Final Results, Who Pays
// Who, Receipt - while the two LIVE surfaces hid part of it. The scorecard's
// press chips rendered only on a collapsed card, and a 1v1 auto-opens, so the
// golfer most likely to be looking at the card was the one who couldn't see his
// own $78 hole press. The Action page showed the CURRENT $/hole rate (the
// pressed number) with no history of the press that set it.
//
// The prior batch's tests passed because they rendered a collapsed card and
// never an auto-opened 1v1 with hole presses: the tests were narrower than the
// standard. These render the ACTUAL pages in the exact launch-standard shape.
//
// THE FIXTURE, everywhere: Marty vs Matt · Stroke · Gross · $10/hole + $200
// overall · HP H6 $78 · HP H10 $125 · OP H12 $33 · OP H15 $200.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PAGE = ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];
const CD = makeCourseData(18);

const P2 = makePlayers(['Marty', 'Matt'], [0, 0]);
const A = String(P2[0].id), B = String(P2[1].id);
const scoresThrough = (players, n) => {
    const s = {}; players.forEach((p, i) => { for (let h = 1; h <= n; h++) s[`p${p.id}_h${h}`] = i === 0 ? 4 : 5; });
    return s;
};
// The launch-standard match, exactly as Firebase stores it after the four presses.
const LAUNCH = () => JSON.parse(JSON.stringify({
    m1: { format: 'stroke', scoring: 'gross', holeStake: 10, overallStake: 200, overallMode: 'stroke',
          startHole: 1, createdAt: 1, teamAIds: [A], teamBIds: [B],
          holePresses: { a: { fromHole: 6, newStake: 78 }, b: { fromHole: 10, newStake: 125 } },
          overallPresses: { c: { startHole: 12, stake: 33 }, d: { startHole: 15, stake: 200 } } }
}));
const ALL_FOUR = html => {
    assert.match(html, /HP1 H6 \$78\/hole|HP1 \u00B7 H6 \u00B7 \$78\/hole/, '$78 hole press');
    assert.match(html, /HP2 H10 \$125\/hole|HP2 \u00B7 H10 \u00B7 \$125\/hole/, '$125 hole press');
    assert.match(html, /P1 H12 \$33|P1 \u00B7 H12 \u00B7 \$33/, '$33 overall press');
    assert.match(html, /P2 H15 \$200|P2 \u00B7 H15 \u00B7 \$200/, '$200 overall press');
};

function scorecard(sideMatches, opts) {
    const o = opts || {};
    const players = o.players || P2;
    const sb = loadHtmlInlineScript('index.html', PAGE);
    const gm = {}; players.forEach((pl, i) => { gm[pl.id] = Math.floor(i / 4) + 1; });
    vm.runInContext(`
        db.ref = function () { return { set: function () { return Promise.resolve(); }, on: function () {},
            push: function () { return { key: 'k' }; }, remove: function () { return Promise.resolve(); },
            update: function () { return Promise.resolve(); } }; };
        currentMode = 'ABCD';
        currentData = ${JSON.stringify({ players, courseData: CD, gameFormat: 'stroke',
            scores: o.scores || scoresThrough(players, 13), sideMatches })};
        window.__scPlayerGroupMap = ${JSON.stringify(gm)};
        window.__scFilteredPlayers = currentData.players;
        hasGroupLock = ${o.group !== undefined && o.group !== null};
        lockedGroup = ${o.group === undefined || o.group === null ? 'null' : o.group};
        selectedGroup = ${o.group === undefined || o.group === null ? "'all'" : o.group};
        actionCenterOpen = true;
        ${o.forceCollapsed ? "expandedMatches['m1'] = false;" : ''}
        renderActionCenter();
    `, sb);
    return sb.document.getElementById('action-center-mount').innerHTML || '';
}

function actionPage(sideMatches, opts) {
    const o = opts || {};
    const players = o.players || P2;
    const sb = loadHtmlInlineScript('sidematches.html', PAGE);
    vm.runInContext(`
        db.ref = function () { return { set: function () { return Promise.resolve(); }, on: function () {},
            push: function () { return { key: 'k' }; }, remove: function () { return Promise.resolve(); },
            update: function () { return Promise.resolve(); } }; };
        currentMode = 'ABCD';
        currentData = ${JSON.stringify({ players, courseData: CD, gameFormat: 'stroke',
            scores: o.scores || scoresThrough(players, 13), sideMatches })};
        hasGroupLock = ${o.group !== undefined && o.group !== null};
        lockedGroup = ${o.group === undefined || o.group === null ? 'null' : o.group};
        renderSideMatches();
    `, sb);
    return sb.document.getElementById('sidematches-list').innerHTML || '';
}

// ---------------------------------------------------------------------------
describe('SCORECARD — the AUTO-OPENED 1v1 card shows every press', () => {
    // Items 1-4: the exact card that hid the money. A 1v1 auto-opens; each of the
    // four stakes must be visible on it.
    test('open card renders HP1 H6 $78', () => {
        const html = scorecard(LAUNCH());
        assert.match(html, /match-card open/, 'the fixture must exercise the OPEN card');
        assert.match(html, /HP1 H6 \$78\/hole/);
    });
    test('open card renders HP2 H10 $125', () => {
        assert.match(scorecard(LAUNCH()), /HP2 H10 \$125\/hole/);
    });
    test('open card renders overall P1 H12 $33', () => {
        assert.match(scorecard(LAUNCH()), /P1 H12 \$33/);
    });
    test('open card renders overall P2 H15 $200', () => {
        assert.match(scorecard(LAUNCH()), /P2 H15 \$200/);
    });

    // Item 5: collapsing may change layout, never disclosure.
    test('the COLLAPSED card shows the same four stakes', () => {
        const html = scorecard(LAUNCH(), { forceCollapsed: true });
        assert.ok(!/match-card open/.test(html), 'the fixture must exercise the collapsed card');
        ALL_FOUR(html);
    });

    test('the partial money figure says WHICH wager it belongs to', () => {
        // bet-strip's cockpit figure covers the overall bet only. On a match that
        // also carries a $/hole bet, an unlabelled figure reads as the whole ledger
        // - "up $433" on a $1,920 position. The label is the fix; the combined truth
        // lives on the Action page and the Receipt.
        const html = scorecard(LAUNCH(), { scores: scoresThrough(P2, 18) });
        assert.match(html, /Overall: /, 'a component figure must not wear the whole ledger\'s label');
    });

    test('a stroke match with NO hole bet keeps its plain money label', () => {
        const sm = LAUNCH(); delete sm.m1.holePresses; sm.m1.holeStake = 0;
        const html = scorecard(sm, { scores: scoresThrough(P2, 18) });
        assert.ok(!/Overall: /.test(html), 'one wager needs no disambiguation');
    });
});

// ---------------------------------------------------------------------------
describe('ACTION PAGE — the stored press history, not just the current rate', () => {
    // Item 6.
    test('all four presses render with start holes and stakes', () => {
        const html = actionPage(LAUNCH());
        assert.match(html, /HP1 \u00B7 H6 \u00B7 \$78\/hole/);
        assert.match(html, /HP2 \u00B7 H10 \u00B7 \$125\/hole/);
        assert.match(html, /P1 \u00B7 H12 \u00B7 \$33/);
        assert.match(html, /P2 \u00B7 H15 \u00B7 \$200/);
    });

    test('the current rate still shows beside the history that produced it', () => {
        const html = actionPage(LAUNCH());
        assert.match(html, /\$125\/hole/, 'the live rate the golfers are playing at');
        assert.match(html, /\$78\/hole/, 'and the press that preceded it');
    });

    test('a legacy overall press with no stake shows the original wager', () => {
        const sm = LAUNCH(); sm.m1.overallPresses = { c: { startHole: 12 } };
        assert.match(actionPage(sm), /P1 \u00B7 H12 \u00B7 \$200/,
            'what it displays is what it settles at');
    });

    test('MATCH and NASSAU action cards are untouched — no stroke terminology leaks', () => {
        // Part 5 contract: the match/nassau Action cards keep their existing engine
        // rows (label + status; the header carries the match stake). Their custom
        // press stakes surface LIVE on the scorecard chips, and always on the
        // Receipt - asserted below and in press_stake_money_test.
        const sm = { n1: { format: 'nassau', scoring: 'gross', stake: 50, pressRule: 'anytime',
            startHole: 1, createdAt: 1, teamAIds: [A], teamBIds: [B],
            presses: { k: { baseId: '18', startHole: 6, stake: 78 } } } };
        const html = actionPage(sm);
        assert.ok(!/HP\d/.test(html), 'hole-press labels are Stroke-only');
        assert.match(html, /Press/, 'the press row itself still renders');
        assert.match(html, /\$50\/match/, 'and the card header is unchanged');
    });

    test('a NASSAU custom stake is live on the scorecard chips, open or closed', () => {
        const sm = { n1: { format: 'nassau', scoring: 'gross', stake: 50, pressRule: 'anytime',
            startHole: 1, createdAt: 1, teamAIds: [A], teamBIds: [B],
            presses: { k: { baseId: '18', startHole: 6, stake: 78 } } } };
        assert.match(scorecard(JSON.parse(JSON.stringify(sm))), /P1 H6 \$78/);
    });
});

// ---------------------------------------------------------------------------
describe('RELOAD, CORRECTION, CROSS-GROUP', () => {
    // Item 7: no in-memory-only display. The fixture IS the persisted JSON, so
    // rendering a fresh page from a re-parse is a reload.
    test('RELOAD: both pages render all four from re-parsed persisted JSON', () => {
        const persisted = JSON.parse(JSON.stringify(LAUNCH()));
        ALL_FOUR(scorecard(persisted, { forceCollapsed: true }));
        const ap = actionPage(JSON.parse(JSON.stringify(persisted)));
        assert.match(ap, /\$78\/hole/); assert.match(ap, /\$125\/hole/);
        assert.match(ap, /\$33/); assert.match(ap, /P2 \u00B7 H15 \u00B7 \$200/);
    });

    // Item 8: fixing a card moves results, never the press ledger.
    test('SCORE CORRECTION: presses and start holes survive; status may move', () => {
        const wrong = scoresThrough(P2, 13);
        const fixed = Object.assign({}, wrong);
        for (let h = 1; h <= 13; h++) fixed[`p${A}_h${h}`] = 6;   // Marty's card was wrong
        const before = actionPage(LAUNCH(), { scores: wrong });
        const after = actionPage(LAUNCH(), { scores: fixed });
        [before, after].forEach(html => {
            assert.match(html, /HP1 \u00B7 H6 \u00B7 \$78\/hole/);
            assert.match(html, /P2 \u00B7 H15 \u00B7 \$200/);
        });
        assert.notEqual(before, after, 'the live result moved with the corrected card');
    });

    // Items 9-10.
    test('CROSS-GROUP: both involved groups see the $78 press live after reload', () => {
        const P12 = makePlayers(['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James',
            'Ryan', 'Dalen', 'Nick', 'Paul'], new Array(12).fill(0));
        const M = String(P12[0].id), S = String(P12[4].id);
        const persisted = JSON.parse(JSON.stringify({
            x1: { format: 'stroke', scoring: 'gross', holeStake: 10, startHole: 1, createdAt: 1,
                  scope: 'cross', teamAIds: [M], teamBIds: [S],
                  holePresses: { k: { fromHole: 6, newStake: 78 } } } }));
        [1, 2].forEach(g => {
            const html = actionPage(persisted, { players: P12, group: g,
                scores: scoresThrough(P12, 13) });
            assert.match(html, /HP1 \u00B7 H6 \u00B7 \$78\/hole/, `Group ${g} sees the $78 live`);
        });
    });

    test('an unrelated group still cannot manage it', () => {
        const P12 = makePlayers(['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James',
            'Ryan', 'Dalen', 'Nick', 'Paul'], new Array(12).fill(0));
        const M = String(P12[0].id), S = String(P12[4].id);
        const sb = loadHtmlInlineScript('sidematches.html', PAGE);
        vm.runInContext(`
            db.ref = function () { return { set: function () { return Promise.resolve(); }, on: function () {},
                push: function () { return { key: 'k' }; }, remove: function () { return Promise.resolve(); } }; };
            currentMode = 'ABCD';
            currentData = ${JSON.stringify({ players: P12, courseData: CD, gameFormat: 'stroke',
                scores: scoresThrough(P12, 13),
                sideMatches: { x1: { format: 'stroke', scoring: 'gross', holeStake: 10, startHole: 1,
                    scope: 'cross', teamAIds: [M], teamBIds: [S],
                    holePresses: { k: { fromHole: 6, newStake: 78 } } } } })};
            hasGroupLock = true; lockedGroup = 3;
        `, sb);
        assert.equal(vm.runInContext(`canManageSideMatch(sideMatchById('x1'))`, sb), false);
        assert.equal(vm.runInContext(`canPressSideMatch(sideMatchById('x1'))`, sb), false);
    });
});

// ---------------------------------------------------------------------------
describe('WHAT THIS FIX DID NOT TOUCH', () => {
    test('the Receipt still prints all four and nets $1,920 for the launch fixture', () => {
        const { loadJsFile } = require('./helpers/load-script.js');
        const E = loadJsFile('money-engine.js');
        ['action-model.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js']
            .forEach(f => vm.runInContext(read(f), E, { filename: f }));
        const round = { players: P2, courseData: CD, sideMatches: LAUNCH() };
        vm.runInContext(`window.__r = buildSideMatchReceipts(${JSON.stringify(round)},
            ${JSON.stringify(CD)}, ${JSON.stringify(scoresThrough(P2, 18))});`, E);
        const r = E.window.__r[0];
        [78, 125, 33, 200].forEach(v => assert.ok(r.segments.some(s => s.stake === v), `$${v} line`));
        assert.equal(r.net, 1920, 'the verified fixture figure');
    });

    test('no engine file changed for a display fix', () => {
        // Display reads storage; it never earns the right to touch the math.
        ['money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'action-model.js', 'hole-events.js']
            .forEach(f => assert.ok(!/strokePressHistory|pressChips/.test(read(f)),
                `${f} must know nothing about the ledger rendering`));
    });
});
