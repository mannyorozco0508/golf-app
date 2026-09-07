// ============================================================================
// TWO GOLFERS, ONE NAME, ON THE RECEIPT MONEY ACTUALLY CHANGES HANDS ON
//
// computeCombinedNetTotals keys every balance on the golfer's NAME:
//
//     const key = player.name.trim().toLowerCase();
//     netByName[key].net += amount;
//
// So two men called Mike Dunne in the same round are ONE row. Four golfers go in,
// three come out, and "Lance Webb -> Mike Dunne $10" names a man who could be
// either of them. Nothing says anything is wrong: the arithmetic is right, the
// total is zero-sum, and the receipt looks finished.
//
// v70 made the TRIP total refuse this. It is the same bug one level down, and it
// matters more, not less - the group settles per round on the day and totals at
// the end of the week, so the per-round receipt is the one that decides who hands
// over cash. The trip total is a summary of money already paid.
//
// PLACEHOLDERS ARE NOT PART OF THIS, and that is deliberate rather than an
// oversight. "Player 1" through "Player 4" cannot identify anyone ACROSS rounds,
// which is why the trip refuses them - but inside a single round they are
// distinct from one another and nothing merges. A round of unnamed golfers
// settles correctly among themselves. Refusing it would block money that is not
// in doubt.
//
// ONE DETECTOR, TWO SURFACES. The Receipt (settlement.html) and the scorecard's
// Finish Round money panel (index.html) both display this total, so the rule
// lives in action-model.js and both call it. A copy in each page is how the two
// come to disagree about whether a receipt is safe to pay from.
//
// THE ENGINE IS NOT TOUCHED. settlement-engine.js is off-limits by default and
// nothing here needs it: the merge is a property of keying on names, the refusal
// is a property of what the pages agree to show.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SETTLE_SRC = read('settlement.html');
const IDX_SRC = read('index.html');
const AM = loadJsFile('action-model.js', ['handicap.js', 'money-engine.js']);
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

const teamed = list => list.map((p, i) => Object.assign({}, p, {
    team: i < 2 ? 'Team 1' : 'Team 2', playingForMoney: true }));
const CLEAN = teamed([{ id: 101, name: 'Marty Sharp', hcp: '0' }, { id: 102, name: 'Manny Orozco', hcp: '0' },
                      { id: 103, name: 'Lance Webb', hcp: '0' }, { id: 104, name: 'Zach Hill', hcp: '0' }]);
const MIKES = teamed([{ id: 101, name: 'Mike Dunne', hcp: '0' }, { id: 102, name: 'Mike Dunne', hcp: '0' },
                      { id: 103, name: 'Lance Webb', hcp: '0' }, { id: 104, name: 'Zach Hill', hcp: '0' }]);
const BLANK = teamed([{ id: 101, name: 'Player 1', hcp: '0' }, { id: 102, name: 'Player 2', hcp: '0' },
                      { id: 103, name: 'Player 3', hcp: '0' }, { id: 104, name: 'Player 4', hcp: '0' }]);

function roundOf(players) {
    const scores = {};
    players.forEach(p => CD.forEach(h => {
        scores[`p${p.id}_h${h.hole}`] = p.team === 'Team 1' ? 4 : 5; }));
    return { eventName: 'Caledonia', gameFormat: 'match', matchStake: 20, players,
             courseData: CD, scores, settlementMode: 'whole-dollar' };
}

describe('THE DETECTOR, SHARED BY BOTH SURFACES', () => {

    const dupes = players => AM.duplicatePlayerNames(players);

    test('two golfers with one name are reported', () => {
        const d = dupes(MIKES);
        assert.equal(d.length, 1, 'expected one duplicated name, got ' + JSON.stringify(d));
        assert.match(d[0].name, /Mike Dunne/);
    });

    test('distinct names report nothing', () => {
        assert.deepEqual(Array.from(dupes(CLEAN)), []);
    });

    test('it ignores case and stray whitespace, like the engine does', () => {
        // The engine keys on name.trim().toLowerCase(), so these ARE one balance.
        // A detector that missed them would pass a receipt the engine merges.
        const d = dupes([{ id: 1, name: 'Mike Dunne' }, { id: 2, name: '  mike dunne ' }]);
        assert.equal(d.length, 1, 'a merge the engine WILL perform went undetected');
    });

    test('three of a name is still one problem', () => {
        const d = dupes([{ id: 1, name: 'Mike' }, { id: 2, name: 'Mike' }, { id: 3, name: 'Mike' }]);
        assert.equal(d.length, 1);
        assert.equal(d[0].count, 3, 'it does not say how many share the name');
    });

    test('two separate collisions are two problems', () => {
        const d = dupes([{ id: 1, name: 'Mike' }, { id: 2, name: 'Mike' },
                         { id: 3, name: 'Dave' }, { id: 4, name: 'Dave' }]);
        assert.equal(d.length, 2);
    });

    // PLACEHOLDERS ARE NOT THIS BUG. Player 1..4 are distinct within a round and
    // nothing merges; refusing would block money that is not in doubt.
    test('a round of placeholder names is NOT a duplicate problem', () => {
        assert.deepEqual(Array.from(dupes(BLANK)), [],
            'an unnamed round was refused for a merge that cannot happen');
    });

    test('blank names are not reported as duplicates of each other', () => {
        assert.deepEqual(Array.from(dupes([{ id: 1, name: '' }, { id: 2, name: '  ' }])), [],
            'two empty names were called a duplicate');
    });

    test('it survives junk input rather than throwing on a receipt', () => {
        assert.doesNotThrow(() => dupes(null));
        assert.doesNotThrow(() => dupes([{ id: 1 }, null, { id: 2, name: 5 }]));
    });
});

describe('THE MERGE IS REAL — this is what is being refused', () => {

    const SE = loadJsFile('settlement-engine.js',
        ['handicap.js', 'money-engine.js', 'action-model.js']);

    test('the engine really does collapse two Mikes into one balance', () => {
        const d = roundOf(MIKES);
        const r = SE.computeCombinedNetTotals(d, CD, d.scores);
        const names = Object.values(r.netByName).map(v => v.name);
        assert.equal(names.length, 3,
            'expected the merge this wave exists to refuse; got ' + JSON.stringify(names));
        assert.equal(names.filter(n => /Mike Dunne/.test(n)).length, 1);
    });

    test('and a clean round of four produces four balances', () => {
        const d = roundOf(CLEAN);
        const r = SE.computeCombinedNetTotals(d, CD, d.scores);
        assert.equal(Object.values(r.netByName).length, 4);
    });
});

// ---------------------------------------------------------------------------
// Both pages, driven through their own value handler with round data.
function arrive(page, deps, players) {
    const sb = loadHtmlInlineScript(page, deps, { search: '?game=RCPT' });
    vm.runInContext('alert = function () {}; confirm = function () { return true; };', sb);
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value');
    assert.ok(handlers.length > 0, page + ' registered no value handler');
    handlers.forEach(h => h.cb({ val: () => JSON.parse(JSON.stringify(roundOf(players))) }));
    return sb;
}
const run = (sb, e) => vm.runInContext(e, sb);
const SETTLE_DEPS = ['handicap.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js', 'payouts.js'];
const IDX_DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js',
    'ryder-cup.js'];

describe('THE RECEIPT REFUSES A NAME IT CANNOT TELL APART', () => {

    const summary = sb => run(sb, '(function(){'
        + 'var d = currentData || {};'
        + 'renderCombinedSummary(d, d.courseData || [], d.scores || {});'
        + 'var el = document.getElementById("combined-settlement-summary");'
        + 'return el ? el.innerHTML : "";})()');

    test('a clean round still gets its receipt', () => {
        const h = summary(arrive('settlement.html', SETTLE_DEPS, CLEAN));
        assert.match(h, /Marty Sharp/, 'a perfectly good receipt was refused');
        assert.ok(!/cannot be told apart/i.test(h));
    });

    test('THE REPORTED BUG: two Mikes get no totals', () => {
        const h = summary(arrive('settlement.html', SETTLE_DEPS, MIKES));
        assert.ok(!/NET</.test(h),
            'the receipt still prints a merged balance somebody will pay from');
    });

    test('and it says which name, and what to do', () => {
        const h = summary(arrive('settlement.html', SETTLE_DEPS, MIKES));
        assert.match(h, /Mike Dunne/, 'the refusal does not name the golfers');
        assert.match(h, /rename|told apart|same name/i,
            'the refusal does not say what to fix: ' + h.replace(/<[^>]*>/g, ' ').slice(0, 200));
    });

    // "Two golfers are all called Mike Dunne" is what the first version said. The
    // plural branch was written for three and the two-case borrowed it.
    test('it counts in English', () => {
        const h = summary(arrive('settlement.html', SETTLE_DEPS, MIKES));
        assert.match(h, /Two golfers are both called/, 'reads: ' + h.replace(/<[^>]*>/g, ' ').slice(0, 160));
        assert.ok(!/Two golfers are all called/.test(h));
    });

    test('and says how many when there are more than two', () => {
        const three = teamed([{ id: 101, name: 'Mike' }, { id: 102, name: 'Mike' },
                              { id: 103, name: 'Mike' }, { id: 104, name: 'Zach Hill' }]);
        const h = summary(arrive('settlement.html', SETTLE_DEPS, three));
        assert.match(h, /3 golfers are all called/, 'reads: ' + h.replace(/<[^>]*>/g, ' ').slice(0, 160));
    });

    test('an unnamed round is NOT refused — nothing merges inside one round', () => {
        const h = summary(arrive('settlement.html', SETTLE_DEPS, BLANK));
        assert.ok(!/cannot be told apart|rename/i.test(h),
            'a round of Player 1..4 was refused for a merge that cannot happen');
    });
});

describe('THE SCORECARD MONEY PANEL REFUSES THE SAME WAY', () => {

    const panel = sb => {
        run(sb, 'renderFinishRoundMoney();');
        return run(sb, '(function(){var m=document.getElementById("fr-final-money");'
            + 'var p=document.getElementById("fr-who-pays-who");'
            + 'return (m?m.innerHTML:"") + "||" + (p?p.innerHTML:"");})()');
    };

    test('a clean round still shows its money', () => {
        const h = panel(arrive('index.html', IDX_DEPS, CLEAN));
        assert.ok(!/cannot be told apart/i.test(h), 'a good round was refused');
    });

    test('two Mikes are refused here too', () => {
        const h = panel(arrive('index.html', IDX_DEPS, MIKES));
        assert.match(h, /Mike Dunne/, 'the refusal does not name the golfers');
        assert.match(h, /rename|told apart|same name/i,
            'the money panel does not explain itself: ' + h.replace(/<[^>]*>/g, ' ').slice(0, 200));
    });

    test('and the pay list is emptied with it', () => {
        const h = panel(arrive('index.html', IDX_DEPS, MIKES));
        const pay = h.split('||')[1] || '';
        assert.ok(!/→/.test(pay),
            'somebody is still being told to pay a name that could be either man');
    });

    // THE STALE-RENDER CASE, and the only one where clearing the pay list matters.
    // On a first render there is nothing to leave behind, so a refusal that forgets
    // to clear looks correct. This panel re-renders on every score change: open it
    // with clean names, rename somebody in Setup to a duplicate, and the refusal
    // appears ABOVE the previous list still telling people who to pay.
    test('a refusal clears a pay list a previous render left behind', () => {
        const sb = arrive('index.html', IDX_DEPS, CLEAN);
        run(sb, 'renderFinishRoundMoney();');
        const before = run(sb, 'document.getElementById("fr-who-pays-who").innerHTML');
        assert.match(before, /→/, 'the clean render produced no pay list to leave behind');

        // The same page, the same panel, after the roster changed underneath it.
        run(sb, 'currentData = ' + JSON.stringify(roundOf(MIKES)) + ';');
        run(sb, 'renderFinishRoundMoney();');
        const after = run(sb, 'document.getElementById("fr-who-pays-who").innerHTML');
        assert.ok(!/→/.test(after),
            'the refusal was printed above a stale pay list: ' + after.replace(/<[^>]*>/g, ' ').slice(0, 160));
    });
});

describe('ONE DETECTOR, NOT THREE', () => {

    test('neither page carries its own duplicate-name logic', () => {
        [['settlement.html', SETTLE_SRC], ['index.html', IDX_SRC]].forEach(([name, src]) => {
            const code = src.replace(/\/\/.*$/gm, '');
            assert.match(code, /duplicatePlayerNames\(/, name + ' does not use the shared detector');
        });
    });

    test('and it is exported for them to use', () => {
        assert.equal(typeof AM.duplicatePlayerNames, 'function');
        assert.match(read('action-model.js'), /module\.exports\.duplicatePlayerNames/);
    });

    test('the money engine was not touched for this', () => {
        // The merge is a property of keying on names; the refusal is a property of
        // what the pages agree to show. settlement-engine.js is off-limits.
        assert.ok(!/duplicatePlayerNames/.test(read('settlement-engine.js')),
            'the refusal leaked into the protected engine');
    });
});
