// ============================================================================
// A PLAYER'S ID MUST OUTLIVE THE ROW ABOVE IT
//
// captureCurrentPlayerInputs() built ids from DOM position - `id: idx + 101` -
// and recomputed them on every call. Every mutation in the wizard runs the same
// pipeline: capture, wipe #player-list, re-add every row. So a delete or a
// reorder renumbered everyone below it, silently.
//
// THAT ID IS THE PRIMARY KEY FOR MONEY. Scores live at `p{id}_h{hole}`, dots at
// dots/h{hole}/{id}, and side-match rosters and Cup membership are lists of ids.
// Renumbering does not lose data - it re-points it. Delete the second of four
// golfers and the third inherits the second's id, and with it the second's
// scorecard.
//
// Reproduced through the real handlers before this was written:
//
//     add Ann, Bob, Cal, Dee        ids 101 102 103 104
//     removePlayerRowAndRefresh(Bob) ids 101 102 103   <- Cal is now 102
//
// And on the load path, where it is worse because the data already exists:
//
//     a saved roster of 101, 105, 110  loads as  101, 102, 103
//     adding one golfer then issues    104        which may already be in use
//
// THE RULE UNDER TEST. An id is issued once, when the row is created, and never
// changes again for the life of that row. A row loaded from a saved round keeps
// the id it was saved with, verbatim. A genuinely new row draws the next id from
// a counter that starts ABOVE every id already present, so it can never collide
// with a stored one - which would be a second corruption path opened while
// closing the first.
//
// ---------------------------------------------------------------------------
// HOW THESE DRIVE THE APP, and why not more directly.
//
// Every test below mutates through the REAL handlers a user's taps reach -
// addNewPlayerAndRefresh(), removePlayerRowAndRefresh(), commitPastedPlayers(),
// renderPlayerList() - and never by calling the id helper itself. Calling
// captureCurrentPlayerInputs() twice in a row proves nothing: nothing moved
// between the calls, so positional ids come back identical and the suite passes
// against the bug. The mutation is the whole point.
//
// TWO HARNESS ACCOMMODATIONS, both stated rather than hidden:
//
//   1. removePlayerRowAndRefresh(btnEl) does btnEl.closest('.player-row'). The
//      real button lives inside the row's innerHTML, which mini-dom stores as a
//      string rather than parsing into nodes, so there is no button element to
//      click. The ROW is passed instead - row.closest('.player-row') returns the
//      row itself, so production takes exactly the path it takes in a browser.
//
//   2. mini-dom does not parse innerHTML into child nodes, so after any rebuild
//      captureCurrentPlayerInputs() reads '' for every name - the inputs are not
//      real elements here. Identity is therefore proven by the ID SEQUENCE, which
//      is exact and sufficient: if ids were positional, deleting the second of
//      four would leave [101,102,103] instead of [101,103,104]. The id-to-golfer
//      binding by NAME is verified separately in headless Chrome, where the
//      inputs are real and survive the rebuild.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const ADMIN = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
const DEPS = ['handicap.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js', 'score-marks.js'];

const run = (sb, expr) => vm.runInContext(expr, sb);

// A wizard with its player list mounted in the live tree, which is what makes
// document.querySelectorAll('.player-row') see the rows production appends.
function wizard() {
    const sb = loadHtmlInlineScript('admin.html', DEPS);
    run(sb, 'alert=function(){};');
    run(sb, 'document.__mount(document.getElementById("player-list"));');
    return sb;
}

// Array.from() rebuilds the result in THIS realm. The vm context has its own
// Array prototype, and .map() preserves that species - so a strict deepEqual
// against a host-realm literal fails on identity even when every value matches.
// It cost a confusing "actual [101,103,104], expected [101,103,104]" once already.
const ids = sb => Array.from(
    run(sb, 'captureCurrentPlayerInputs().map(function(p){return p.id;})')).map(Number);
const rowCount = sb => run(sb, 'document.querySelectorAll(".player-row").length');

function addPlayers(sb, names) {
    names.forEach(n => run(sb,
        'addPlayerRow(' + JSON.stringify(n) + ',"5","","red",false,true,'
        + names.length + ',true)'));
}

// The real delete handler. See harness note 1 above.
const removeAt = (sb, i) => run(sb,
    'removePlayerRowAndRefresh(document.querySelectorAll(".player-row")[' + i + '])');

function loadSavedRound(sb, players) {
    run(sb, 'storedPlayersTemp = ' + JSON.stringify(players) + ';');
    run(sb, 'renderPlayerList(true);');
}

describe('IDS SURVIVE A DELETE — the defect itself', () => {

    test('four rows get four distinct ids', () => {
        const sb = wizard();
        addPlayers(sb, ['Ann', 'Bob', 'Cal', 'Dee']);
        const got = ids(sb);
        assert.equal(got.length, 4);
        assert.equal(new Set(got).size, 4, 'ids must be distinct');
    });

    // THE CORE ASSERTION. Delete the second of four; the other three keep the
    // ids they already had. Positional ids give [101,102,103] here, which hands
    // Cal the id Bob's scores are filed under.
    test('deleting a middle row leaves every survivor’s id untouched', () => {
        const sb = wizard();
        addPlayers(sb, ['Ann', 'Bob', 'Cal', 'Dee']);
        const before = ids(sb);

        removeAt(sb, 1);

        assert.equal(rowCount(sb), 3);
        assert.deepEqual(ids(sb), [before[0], before[2], before[3]],
            'a survivor was renumbered — its scores now belong to a different golfer');
    });

    test('the deleted id is gone and is not handed to anyone else', () => {
        const sb = wizard();
        addPlayers(sb, ['Ann', 'Bob', 'Cal', 'Dee']);
        const before = ids(sb);
        const removed = before[1];

        removeAt(sb, 1);

        assert.ok(!ids(sb).includes(removed),
            'the removed golfer’s id was reassigned to a survivor');
    });

    test('deleting the FIRST row does not shift the rest', () => {
        const sb = wizard();
        addPlayers(sb, ['Ann', 'Bob', 'Cal']);
        const before = ids(sb);
        removeAt(sb, 0);
        assert.deepEqual(ids(sb), [before[1], before[2]]);
    });

    test('deleting the LAST row leaves the others alone', () => {
        const sb = wizard();
        addPlayers(sb, ['Ann', 'Bob', 'Cal']);
        const before = ids(sb);
        removeAt(sb, 2);
        assert.deepEqual(ids(sb), [before[0], before[1]]);
    });

    test('two deletes in a row still do not renumber', () => {
        const sb = wizard();
        addPlayers(sb, ['Ann', 'Bob', 'Cal', 'Dee', 'Eve']);
        const before = ids(sb);
        removeAt(sb, 1);            // Bob
        removeAt(sb, 1);            // Cal, now at index 1
        assert.deepEqual(ids(sb), [before[0], before[3], before[4]]);
    });
});

describe('IDS SURVIVE THE REBUILD SITES', () => {

    // Every one of these tears #player-list down to '' and re-adds every row
    // through addPlayerRow. An id that is not carried through that round-trip is
    // regenerated even when nothing was deleted.
    // Deliberately started from a GAPPED roster. Appending to 101,102,103 leaves
    // positional ids looking correct, so that shape proves nothing; 101,105,110
    // separates a preserved id from a recomputed one.
    test('addNewPlayerAndRefresh keeps existing ids and issues one new one', () => {
        const sb = wizard();
        loadSavedRound(sb, [
            { id: 101, name: 'Ann', hcp: '5', team: '', squad: 'red', playingForMoney: true },
            { id: 105, name: 'Bob', hcp: '6', team: '', squad: 'blue', playingForMoney: true },
            { id: 110, name: 'Cal', hcp: '7', team: '', squad: 'red', playingForMoney: true }]);
        // Compared against the STORED ids, not against a capture taken after the
        // load - a post-load capture bakes in any renumbering the load itself did
        // and cannot then see it.
        run(sb, 'addNewPlayerAndRefresh();');

        const after = ids(sb);
        assert.equal(after.length, 4);
        assert.deepEqual(after.slice(0, 3), [101, 105, 110],
            'existing rows were renumbered by an ADD');
        assert.ok(!after.slice(0, 3).includes(after[3]), 'the new row reused an existing id');
    });

    test('commitPastedPlayers keeps the ids already on screen', () => {
        const sb = wizard();
        loadSavedRound(sb, [
            { id: 101, name: 'Ann', hcp: '5', team: '', squad: 'red', playingForMoney: true },
            { id: 109, name: 'Bob', hcp: '6', team: '', squad: 'blue', playingForMoney: true }]);
        run(sb, 'document.getElementById("paste-players-textarea").value = "Cal, 7\\nDee, 9";');
        run(sb, 'commitPastedPlayers();');

        const after = ids(sb);
        assert.equal(after.length, 4);
        assert.deepEqual(after.slice(0, 2), [101, 109],
            'a bulk paste renumbered existing golfers');
        assert.equal(new Set(after).size, 4);
    });

    // On a contiguous roster this would be a tautology - capture, re-render,
    // capture, and positional ids come back identical having proved nothing. The
    // gapped roster is what makes a rebuild observable.
    test('a plain re-render changes nothing at all', () => {
        const sb = wizard();
        loadSavedRound(sb, [
            { id: 101, name: 'Ann', hcp: '5', team: '', squad: 'red', playingForMoney: true },
            { id: 105, name: 'Bob', hcp: '6', team: '', squad: 'blue', playingForMoney: true },
            { id: 110, name: 'Cal', hcp: '7', team: '', squad: 'red', playingForMoney: true }]);
        run(sb, 'renderPlayerList(false);');
        assert.deepEqual(ids(sb), [101, 105, 110]);
    });
});

describe('A SAVED ROUND KEEPS THE IDS IT WAS SAVED WITH', () => {

    // This is the path that makes the bug expensive. The round already has scores
    // filed under these ids; re-issuing them positionally re-points live money.
    test('a contiguous saved roster loads unchanged', () => {
        const sb = wizard();
        loadSavedRound(sb, [
            { id: 101, name: 'Ann', hcp: '5', team: '', squad: 'red', playingForMoney: true },
            { id: 102, name: 'Bob', hcp: '6', team: '', squad: 'blue', playingForMoney: true },
            { id: 103, name: 'Cal', hcp: '7', team: '', squad: 'red', playingForMoney: true },
            { id: 104, name: 'Dee', hcp: '8', team: '', squad: 'blue', playingForMoney: true }]);
        assert.deepEqual(ids(sb), [101, 102, 103, 104]);
    });

    // The sharp case: a roster that has ALREADY been through a delete has gaps.
    // Positional loading renumbers it to 101,102,103 and orphans every score
    // filed under 105 and 110.
    test('a saved roster with GAPS loads verbatim, gaps and all', () => {
        const sb = wizard();
        loadSavedRound(sb, [
            { id: 101, name: 'Ann', hcp: '5', team: '', squad: 'red', playingForMoney: true },
            { id: 105, name: 'Bob', hcp: '6', team: '', squad: 'blue', playingForMoney: true },
            { id: 110, name: 'Cal', hcp: '7', team: '', squad: 'red', playingForMoney: true }]);
        assert.deepEqual(ids(sb), [101, 105, 110],
            'a saved roster was renumbered on load — every score under 105 and 110 is orphaned');
    });

    test('reloading and re-capturing is idempotent', () => {
        const sb = wizard();
        const roster = [
            { id: 101, name: 'Ann', hcp: '5', team: '', squad: 'red', playingForMoney: true },
            { id: 107, name: 'Bob', hcp: '6', team: '', squad: 'blue', playingForMoney: true }];
        loadSavedRound(sb, roster);
        const once = ids(sb);
        run(sb, 'renderPlayerList(false);');
        assert.deepEqual(ids(sb), once);
        assert.deepEqual(once, [101, 107]);
    });

    test('deleting from a loaded round does not renumber the survivors', () => {
        const sb = wizard();
        loadSavedRound(sb, [
            { id: 101, name: 'Ann', hcp: '5', team: '', squad: 'red', playingForMoney: true },
            { id: 102, name: 'Bob', hcp: '6', team: '', squad: 'blue', playingForMoney: true },
            { id: 103, name: 'Cal', hcp: '7', team: '', squad: 'red', playingForMoney: true }]);
        removeAt(sb, 1);
        assert.deepEqual(ids(sb), [101, 103],
            'Cal inherited Bob’s id, and with it Bob’s scorecard');
    });
});

describe('THE NEW-ID COUNTER STARTS ABOVE EVERY ID PRESENT', () => {

    // The second corruption path, opened by a careless fix to the first: a fresh
    // counter that starts at 101 hands a NEW golfer an id an EXISTING golfer's
    // scores are already filed under.
    test('load 101-104, add a player, and the new id is 105', () => {
        const sb = wizard();
        loadSavedRound(sb, [
            { id: 101, name: 'Ann', hcp: '5', team: '', squad: 'red', playingForMoney: true },
            { id: 102, name: 'Bob', hcp: '6', team: '', squad: 'blue', playingForMoney: true },
            { id: 103, name: 'Cal', hcp: '7', team: '', squad: 'red', playingForMoney: true },
            { id: 104, name: 'Dee', hcp: '8', team: '', squad: 'blue', playingForMoney: true }]);

        run(sb, 'addNewPlayerAndRefresh();');

        const after = ids(sb);
        assert.deepEqual(after.slice(0, 4), [101, 102, 103, 104], 'the loaded roster moved');
        assert.equal(after[4], 105, 'the new golfer must not take an id already in use');
    });

    test('a gapped roster issues above the HIGHEST id, not the count', () => {
        const sb = wizard();
        loadSavedRound(sb, [
            { id: 101, name: 'Ann', hcp: '5', team: '', squad: 'red', playingForMoney: true },
            { id: 105, name: 'Bob', hcp: '6', team: '', squad: 'blue', playingForMoney: true },
            { id: 110, name: 'Cal', hcp: '7', team: '', squad: 'red', playingForMoney: true }]);

        run(sb, 'addNewPlayerAndRefresh();');

        const after = ids(sb);
        assert.deepEqual(after.slice(0, 3), [101, 105, 110]);
        assert.ok(after[3] > 110,
            'the new id must clear the highest stored id, not merely the row count');
        assert.equal(new Set(after).size, 4, 'the new id collided with a stored one');
    });

    test('adding several in a row keeps them all distinct and climbing', () => {
        const sb = wizard();
        loadSavedRound(sb, [
            { id: 120, name: 'Ann', hcp: '5', team: '', squad: 'red', playingForMoney: true }]);
        run(sb, 'addNewPlayerAndRefresh();');
        run(sb, 'addNewPlayerAndRefresh();');
        run(sb, 'addNewPlayerAndRefresh();');
        const after = ids(sb);
        assert.equal(after.length, 4);
        assert.equal(new Set(after).size, 4);
        assert.equal(after[0], 120);
        after.slice(1).forEach(v => assert.ok(v > 120, 'a new id landed at or below a stored one'));
    });
});

describe('AN ID IS NEVER REUSED WITHIN A SESSION', () => {

    test('a deleted golfer’s id does not come back on the next add', () => {
        const sb = wizard();
        addPlayers(sb, ['Ann', 'Bob', 'Cal']);
        const before = ids(sb);
        const removed = before[1];

        removeAt(sb, 1);
        run(sb, 'addNewPlayerAndRefresh();');

        const after = ids(sb);
        assert.ok(!after.includes(removed),
            'the new golfer was handed the id of the one just removed — their scores would merge');
        assert.equal(new Set(after).size, after.length);
    });

    // Checking only that the LIVE roster is duplicate-free passes against
    // positional ids, which are always internally consistent - they just point at
    // the wrong people. The real guarantee is that no id is ever ISSUED TWICE in a
    // session, so every id ever seen is remembered and a repeat is a failure.
    // THE CASE A "highest LIVE id + 1" COUNTER GETS WRONG. Removing a middle row
    // leaves the maximum untouched, so that shape cannot tell a correct counter
    // from a recycling one. Removing the LAST row lowers the live maximum, and a
    // counter derived from it hands the next golfer the id just retired - merging
    // two players' scorecards. A control that recycled ids walked past every other
    // test in this file.
    test('deleting the LAST golfer then adding does not recycle their id', () => {
        const sb = wizard();
        addPlayers(sb, ['Ann', 'Bob', 'Cal']);
        const before = ids(sb);
        const retired = before[2];

        removeAt(sb, 2);
        run(sb, 'addNewPlayerAndRefresh();');

        const after = ids(sb);
        assert.ok(!after.includes(retired),
            'the new golfer was handed the id of the golfer just removed from the end');
        assert.ok(after[2] > retired, 'the counter fell back to the live maximum');
    });

    test('delete-then-add repeatedly never reissues a retired id', () => {
        const sb = wizard();
        addPlayers(sb, ['Ann', 'Bob', 'Cal']);
        const seen = new Set(ids(sb));
        for (let i = 0; i < 4; i++) {
            removeAt(sb, 1);
            run(sb, 'addNewPlayerAndRefresh();');
            const now = ids(sb);
            const fresh = now.filter(v => !seen.has(v));
            assert.equal(fresh.length, 1,
                'the added golfer was handed an id this session had already used');
            fresh.forEach(v => seen.add(v));
            assert.equal(new Set(now).size, now.length, 'the live roster has a duplicate id');
        }
    });
});

describe('ONE PLACE ISSUES IDS', () => {

    // There were two independent copies of `id: idx + 101` - one in
    // captureCurrentPlayerInputs, one inside saveSettings. Two writers of a
    // primary key is how they drift; the save path must read what the rows
    // already carry rather than recomputing anything.
    test('no positional id expression survives anywhere in admin.html', () => {
        assert.ok(!/id:\s*idx\s*\+\s*101/.test(ADMIN),
            'a positional id assignment is still in the file');
    });

    test('the save path does not recompute ids of its own', () => {
        const save = ADMIN.slice(ADMIN.indexOf('const playersList = [];'),
                                 ADMIN.indexOf('const playersList = [];') + 1600);
        assert.ok(save.length > 0, 'the save loop moved — re-anchor this test');
        assert.ok(!/idx\s*\+\s*101/.test(save),
            'saveSettings still derives ids from row position');
    });
});
