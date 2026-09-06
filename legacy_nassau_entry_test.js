// ============================================================================
// LEGACY NASSAU ENTRY CLARITY + COPYFROM NORMALIZATION
//
// A golfer opened the app to start a $10/$10/$20 Nassau and landed on
// "Step 4 - Format Settings" with a SINGLE "Nassau Bet ($)" field. That is the
// legacy round-format screen, and it looked exactly like the way to create one.
//
// There is only one line in the app that selects a round format:
//
//     admin.html   document.getElementById("game-format-select").value = data.gameFormat
//
// inside loadModeData(). It runs in two situations, and only one of them is right:
//
//   GENUINE LOAD  (?game=OLD)      - an old round must stay editable. Correct.
//   COPY          (?copyFrom=OLD)  - a BRAND NEW round, pre-filled from an old
//                                    one. Carrying a legacy wager-format here
//                                    created ANOTHER legacy round, which is how
//                                    the deprecated path kept reproducing itself.
//
// So: a copy normalizes to stroke and points at Action. A genuine load keeps every
// field exactly as it was - no conversion, no rewriting, no hidden settings - and
// gains one line saying what the screen is.
//
// Nassau is a WAGER in this app. The supported path is Action -> Add Wager ->
// Nassau, with separate Front / Back / Overall amounts.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = ['money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','score-marks.js'];
const SM = ['money-engine.js','action-model.js','settlement-engine.js'];

// Runs admin.html's OWN format-selection block, extracted from the file at test
// time rather than reimplemented here.
//
// This matters: the first version of this helper pasted a copy of the logic into
// the test. Sabotaging admin.html then changed nothing, because the test was
// executing its own duplicate - three negative controls passed while the
// production code was broken. A test that reimplements the thing it is testing
// proves only that the test agrees with itself.
function adminFormatBlock() {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
    const start = src.indexOf('if (data.gameFormat && document.getElementById("game-format-select"))');
    assert.ok(start > -1, 'admin.html no longer contains the format-selection block');
    // Walk braces from the first { so the whole if/else is captured verbatim.
    const open = src.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    assert.ok(end > -1, 'unbalanced braces in the format-selection block');
    return src.slice(start, end);
}
function loadRound(data, { asCopy = false } = {}) {
    const sb = loadHtmlInlineScript('admin.html', ADMIN);
    vm.runInContext(`alert=function(){}; copyFromCode=${asCopy ? "'SRC1'" : 'null'};`, sb);
    vm.runInContext(`var data = ${JSON.stringify(data)};\n` + adminFormatBlock(), sb);
    return {
        format: vm.runInContext('document.getElementById("game-format-select").value', sb),
        legacyGroup: vm.runInContext('document.getElementById("legacy-format-group").style.display', sb),
        legacyNotice: vm.runInContext('(document.getElementById("legacy-round-notice")||{style:{}}).style.display', sb),
        copyNotice: vm.runInContext('(document.getElementById("copied-legacy-notice")||{style:{}}).style.display', sb),
        noticeText: vm.runInContext('(document.getElementById("legacy-round-notice")||{}).innerHTML || ""', sb),
        copyText: vm.runInContext('(document.getElementById("copied-legacy-notice")||{}).innerHTML || ""', sb),
    };
}
function wagerForm() {
    const sb = loadHtmlInlineScript('sidematches.html', SM);
    return {
        pick: f => vm.runInContext(`document.getElementById('sm-format').value='${f}'; onSideMatchFormatChange();`, sb),
        shown: id => vm.runInContext(`(document.getElementById('${id}')||{style:{}}).style.display`, sb),
        val: id => vm.runInContext(`document.getElementById('${id}').value`, sb),
        set: (id, v) => vm.runInContext(`document.getElementById('${id}').value='${v}';`, sb),
    };
}

// ============================================================================

describe('A BLANK NEW ROUND CANNOT BECOME A LEGACY NASSAU', () => {

    test('an empty round selects nothing and reveals nothing', () => {
        const r = loadRound({});
        assert.notEqual(r.format, 'nassau');
        assert.notEqual(r.legacyGroup, '', 'the legacy optgroup must stay hidden');
    });

    test('a stroke round leaves the legacy group hidden', () => {
        const r = loadRound({ gameFormat: 'stroke' });
        assert.equal(r.format, 'stroke');
        assert.notEqual(r.legacyGroup, '');
    });

    test('the legacy optgroup ships hidden in the markup', () => {
        // OBSOLETE UI: the hidden legacy optgroup was deleted with the editor, so
        // there is nothing left to hide. The contract it protected - a new round
        // cannot choose a legacy money format - is asserted directly instead.
        const src = read('admin.html');
        ['nassau','match','skins','dots'].forEach(f =>
            assert.ok(!new RegExp('<option value="' + f + '"').test(src),
                'legacy ' + f + ' must not be selectable anywhere'));
    });

    test('only one line in admin.html selects a format', () => {
        // If a second writer appears, this whole analysis stops holding.
        const hits = (read('admin.html').match(/game-format-select"\)\.value = /g) || []).length;
        assert.equal(hits, 2, 'exactly the copy branch and the genuine-load branch');
    });
});

describe('A GENUINE LEGACY ROUND STILL LOADS, UNCHANGED', () => {

    test('it keeps its own format, represented without exposing the others', () => {
        // This used to assert the whole "Legacy round types" optgroup was unhidden.
        // That pinned an implementation, not the contract: unhiding it put TWO
        // options both labelled "Nassau" in front of the golfer and offered legacy
        // Match/Skins/Dots as things to switch to. The saved value is now
        // represented by a single dedicated option instead.
        //
        // The contract this protects is unchanged: an old round keeps its format
        // and stays editable. Option-level coverage lives in legacy_option_test.js.
        const r = loadRound({ gameFormat: 'nassau', nassauStake: 10 });
        assert.equal(r.format, 'nassau', 'an old round keeps its own format');
        assert.notEqual(r.legacyGroup, '',
            'and the four-option legacy group is NOT thrown open to do it');
    });

    test('it is NOT converted to stroke', () => {
        assert.equal(loadRound({ gameFormat: 'nassau', nassauStake: 10 }).format, 'nassau');
        assert.equal(loadRound({ gameFormat: 'match', matchStake: 20 }).format, 'match');
        assert.equal(loadRound({ gameFormat: 'skins', skinsBuyIn: 5 }).format, 'skins');
        assert.equal(loadRound({ gameFormat: 'dots', dotPointVal: 1 }).format, 'dots');
    });

    test('every legacy field is still populated from the saved round', () => {
        // The screen must stay fully editable; the notice explains, it does not remove.
        const src = read('admin.html');
        ['data.nassauStake','data.nassauPressRule','data.nassauScoring','data.nassauType']
            .forEach(k => assert.ok(src.includes(k), k + ' must still be loaded'));
    });

    test('and it says plainly what the screen is', () => {
        const r = loadRound({ gameFormat: 'nassau', nassauStake: 10 });
        assert.equal(r.legacyNotice, 'block');
        assert.match(r.noticeText, /Legacy Nassau round/);
        assert.match(r.noticeText, /Action/, 'and points at where new wagers are made');
        assert.match(r.noticeText, /Front, Back and Overall/);
    });

    test('a stroke round gets no notice', () => {
        assert.notEqual(loadRound({ gameFormat: 'stroke' }).legacyNotice, 'block');
    });
});

describe('A COPIED ROUND IS A NEW ROUND', () => {

    test('copying a legacy Nassau does NOT create another legacy Nassau', () => {
        const r = loadRound({ gameFormat: 'nassau', nassauStake: 10 }, { asCopy: true });
        assert.equal(r.format, 'stroke', 'the new round is an ordinary scoring round');
        assert.notEqual(r.legacyGroup, '', 'and the legacy option stays hidden');
    });

    test('the same applies to Match, Skins and Dots', () => {
        ['match','skins','dots'].forEach(f =>
            assert.equal(loadRound({ gameFormat: f }, { asCopy: true }).format, 'stroke', f));
    });

    test('the golfer is told where the wager now lives', () => {
        const r = loadRound({ gameFormat: 'nassau', nassauStake: 10 }, { asCopy: true });
        assert.equal(r.copyNotice, 'block');
        assert.match(r.copyText, /Round setup copied/);
        assert.match(r.copyText, /Nassau/);
        assert.match(r.copyText, /Action/);
    });

    test('it names the right game for each format', () => {
        assert.match(loadRound({ gameFormat: 'skins' }, { asCopy: true }).copyText, /Skins/);
        assert.match(loadRound({ gameFormat: 'dots' }, { asCopy: true }).copyText, /Dots/);
    });

    test('copying a NON-legacy round is untouched', () => {
        const r = loadRound({ gameFormat: 'bestball' }, { asCopy: true });
        assert.equal(r.format, 'bestball', 'Best Ball is a real scoring format, not a wager');
        assert.notEqual(r.copyNotice, 'block');
    });

    test('and a copied round gets no LEGACY notice — it is not one', () => {
        assert.notEqual(loadRound({ gameFormat: 'nassau' }, { asCopy: true }).legacyNotice, 'block');
    });

    test('safe non-wager setup is still copied', () => {
        // The point is to drop the deprecated format, not the useful setup.
        const src = read('admin.html');
        ['data.courseName','data.courseData','data.activeCourseKey','data.groupSizeOverrides','data.roundDay']
            .forEach(k => assert.ok(src.includes(k), k + ' must still be carried over'));
    });

    test('no silent money game is created by the copy', () => {
        const src = read('admin.html');
        const at = src.indexOf('function showCopiedLegacyNotice');
        const fn = src.slice(at, at + 700);
        ['sideMatches','db.ref','.set('].forEach(t => assert.ok(!fn.includes(t),
            'normalizing must not invent a wager; found ' + t));
    });
});

describe('THE MODERN FORM — Action → Add Wager → Nassau', () => {

    test('choosing Nassau shows three stake inputs', () => {
        const f = wagerForm(); f.pick('nassau');
        assert.equal(f.shown('sm-nassau-stake-group'), 'block');
        ['sm-front-stake','sm-back-stake','sm-overall-stake']
            .forEach(id => assert.equal(typeof f.val(id), 'string', id + ' must exist'));
    });

    test('the old single Stake box is hidden for Nassau', () => {
        const f = wagerForm(); f.pick('nassau');
        assert.equal(f.shown('sm-stake-group'), 'none');
    });

    test('other formats keep their own controls', () => {
        const f = wagerForm();
        f.pick('match');
        assert.equal(f.shown('sm-stake-group'), 'block');
        assert.equal(f.shown('sm-nassau-stake-group'), 'none');
        f.pick('stroke');
        assert.equal(f.shown('sm-nassau-stake-group'), 'none');
    });

    test('10 / 10 / 20 can be entered', () => {
        const f = wagerForm(); f.pick('nassau');
        f.set('sm-front-stake', 10); f.set('sm-back-stake', 10); f.set('sm-overall-stake', 20);
        assert.equal(f.val('sm-front-stake'), '10');
        assert.equal(f.val('sm-back-stake'), '10');
        assert.equal(f.val('sm-overall-stake'), '20');
    });

    test('editing Back leaves Front and Overall alone', () => {
        const f = wagerForm(); f.pick('nassau');
        f.set('sm-front-stake', 10); f.set('sm-back-stake', 10); f.set('sm-overall-stake', 20);
        f.set('sm-back-stake', 50);
        assert.equal(f.val('sm-front-stake'), '10');
        assert.equal(f.val('sm-back-stake'), '50');
        assert.equal(f.val('sm-overall-stake'), '20');
    });

    test('editing Overall leaves Front and Back alone', () => {
        const f = wagerForm(); f.pick('nassau');
        f.set('sm-front-stake', 10); f.set('sm-back-stake', 50); f.set('sm-overall-stake', 20);
        f.set('sm-overall-stake', 60);
        assert.equal(f.val('sm-front-stake'), '10');
        assert.equal(f.val('sm-back-stake'), '50');
        assert.equal(f.val('sm-overall-stake'), '60');
    });

    test('press rule and auto-press amount are on the form', () => {
        const f = wagerForm(); f.pick('nassau');
        assert.equal(f.shown('sm-autopress-group'), 'block');
        const src = read('sidematches.html');
        assert.match(src, /<option value="2down">Auto @ 2 Down<\/option>/);
        assert.match(src, /<option value="same">Same as each bet<\/option>/);
        assert.match(src, /<option value="custom">Custom Amount<\/option>/);
    });

    test('the form says Match Play without confusing it with Net/Gross', () => {
        const src = read('sidematches.html');
        assert.match(src, /Nassau \u2014 Match Play/);
        assert.match(src, /Scoring basis \(Net\/Gross\) is set above/);
    });

    test('there is exactly one modern Nassau creation surface', () => {
        ['index.html','leaderboard.html','stats.html','admin.html'].forEach(f =>
            assert.ok(!read(f).includes('sm-front-stake'),
                f + ' must not carry a second Nassau wager form'));
        assert.ok(read('sidematches.html').includes('sm-front-stake'));
    });
});

describe('THE THREE BOXES HAVE ROOM ON A PHONE', () => {

    // Measured, not guessed. modal 420px max-width - 40px padding = 380 content.
    // Inside one .control-grid column: (380-10)/2 = 185, minus two 6px gaps / 3
    // = ~57px per box, minus 8px padding each side and 1px border each side
    // = ~40px usable. Spanning both columns: ~122 per box, ~105 usable.
    // A mini-DOM computes no widths, so these assert the CSS contract that
    // produces the second number - not the rendered pixels. Only a device can
    // confirm those.

    test('the stake group spans the full modal width', () => {
        assert.match(read('sidematches.html'), /#sm-nassau-stake-group \{ grid-column: 1 \/ -1; \}/);
    });

    test('the fix is scoped — .control-grid still has two columns', () => {
        assert.match(read('sidematches.html'),
            /\.control-grid \{ display: grid; grid-template-columns: 1fr 1fr;/);
    });

    test('legacy Step 4 in admin.html is NOT restyled', () => {
        assert.ok(!read('admin.html').includes('sm-nassau-stake-group'),
            'the legacy screen must not be touched to fix the modern one');
    });

    test('the three boxes divide that width evenly and may shrink', () => {
        const src = read('sidematches.html');
        assert.match(src, /\.sm-nassau-stakes \{ display: grid; grid-template-columns: 1fr 1fr 1fr/);
        assert.match(src, /\.sm-nassau-stakes > div \{ min-width: 0; \}/);
        assert.match(src, /\.sm-nassau-stakes input \{ width: 100%; box-sizing: border-box; \}/);
    });

    test('the markup uses the class, not an inline grid', () => {
        const src = read('sidematches.html');
        assert.match(src, /<div class="sm-nassau-stakes">/);
        const at = src.indexOf('id="sm-nassau-stake-group"');
        assert.ok(!/style="display:grid/.test(src.slice(at, at + 1200)));
    });

    test('a numeric keypad opens for each box', () => {
        const src = read('sidematches.html');
        ['sm-front-stake','sm-back-stake','sm-overall-stake'].forEach(id => {
            const at = src.indexOf('id="' + id + '"');
            assert.match(src.slice(at, at + 120), /inputmode="numeric"/, id);
        });
    });
});
