// ============================================================================
// THE NASSAU FORM MUST BE USABLE, NOT MERELY PRESENT
//
// Every test we had asserted the three stake inputs EXISTED and that selecting
// Nassau set their container to display:block. All of that passed. On a real
// phone the fields were still unusable.
//
// The cause was layout, not logic. #sm-nassau-stake-group sits inside
// .control-grid, a TWO-column grid built so the single Stake box could sit
// beside Scoring. A three-column sub-grid dropped into one of those half-width
// cells left roughly 52px per box on a 390px screen - the bet could be entered
// and could not be read.
//
// A mini-DOM computes no widths, so no behavioural test can catch this. These
// are STRUCTURAL assertions on the CSS contract, and they are honest about that:
// they prove the rules that make the fields wide enough are present, not that
// the rendered result is legible. Only a device closes that.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const SRC = () => fs.readFileSync(path.join(REPO_ROOT, 'sidematches.html'), 'utf8');
const DEPS = ['money-engine.js','action-model.js','settlement-engine.js'];

function form() {
    const sb = loadHtmlInlineScript('sidematches.html', DEPS);
    return {
        sb,
        pick: f => vm.runInContext(
            `document.getElementById('sm-format').value='${f}'; onSideMatchFormatChange();`, sb),
        shown: id => vm.runInContext(
            `(document.getElementById('${id}')||{style:{}}).style.display`, sb),
        val: id => vm.runInContext(`document.getElementById('${id}').value`, sb),
        set: (id, v) => vm.runInContext(`document.getElementById('${id}').value='${v}';`, sb),
    };
}

// ============================================================================

describe('THE THREE FIELDS APPEAR WHEN NASSAU IS CHOSEN', () => {

    test('choosing Nassau reveals the three-stake group', () => {
        const f = form(); f.pick('nassau');
        assert.equal(f.shown('sm-nassau-stake-group'), 'block');
    });

    test('and hides the single Stake box, so there is one obvious answer', () => {
        const f = form(); f.pick('nassau');
        assert.equal(f.shown('sm-stake-group'), 'none',
            'two stake controls at once would be ambiguous');
    });

    test('Match Play keeps the single box and hides the three', () => {
        const f = form(); f.pick('match');
        assert.equal(f.shown('sm-stake-group'), 'block');
        assert.equal(f.shown('sm-nassau-stake-group'), 'none');
    });

    test('Stroke Play shows neither', () => {
        const f = form(); f.pick('stroke');
        assert.equal(f.shown('sm-nassau-stake-group'), 'none');
        assert.equal(f.shown('sm-stake-group'), 'none');
    });

    test('the auto-press amount control appears with Nassau', () => {
        const f = form(); f.pick('nassau');
        assert.equal(f.shown('sm-autopress-group'), 'block');
    });

    test('all three inputs exist and are independently settable', () => {
        const f = form(); f.pick('nassau');
        f.set('sm-front-stake', 10);
        f.set('sm-back-stake', 10);
        f.set('sm-overall-stake', 20);
        assert.equal(f.val('sm-front-stake'), '10');
        assert.equal(f.val('sm-back-stake'), '10');
        assert.equal(f.val('sm-overall-stake'), '20', '10 / 10 / 20 must be enterable');
    });
});

describe('THE LAYOUT GIVES THEM ROOM — the part tests could not see', () => {

    test('the group spans every column of .control-grid', () => {
        // Without this it occupies ONE cell of a two-column grid, and three boxes
        // divide a half-width column into ~52px each.
        assert.match(SRC(), /#sm-nassau-stake-group \{ grid-column: 1 \/ -1; \}/,
            'the three-stake group must span the full modal width');
    });

    test('.control-grid is still two columns for everything else', () => {
        // The span is a targeted exception, not a change to the shared layout.
        assert.match(SRC(), /\.control-grid \{ display: grid; grid-template-columns: 1fr 1fr;/);
    });

    test('the three boxes share that full width evenly', () => {
        assert.match(SRC(), /\.sm-nassau-stakes \{ display: grid; grid-template-columns: 1fr 1fr 1fr/);
    });

    test('grid children may shrink instead of overflowing', () => {
        // min-width:0 is what stops three number inputs pushing the modal sideways.
        assert.match(SRC(), /\.sm-nassau-stakes > div \{ min-width: 0; \}/);
    });

    test('inputs include their padding in their width', () => {
        assert.match(SRC(), /\.sm-nassau-stakes input \{ width: 100%; box-sizing: border-box; \}/,
            'without border-box the padding pushes each box past its column');
    });

    test('the markup uses the class, not an inline grid', () => {
        // An inline style would bypass every rule above.
        const src = SRC();
        assert.match(src, /<div class="sm-nassau-stakes">/);
        const at = src.indexOf('id="sm-nassau-stake-group"');
        const block = src.slice(at, at + 1200);
        assert.ok(!/style="display:grid/.test(block),
            'the inline three-column grid must be gone');
    });

    test('labels stay on one line', () => {
        assert.match(SRC(), /\.sm-nassau-stakes label \{[^}]*white-space: nowrap/,
            '"Overall 18" wrapping would push the boxes taller and look broken');
    });

    test('a numeric keypad opens on a phone', () => {
        const src = SRC();
        ['sm-front-stake','sm-back-stake','sm-overall-stake'].forEach(id => {
            const at = src.indexOf('id="' + id + '"');
            assert.match(src.slice(at, at + 120), /inputmode="numeric"/, id);
        });
    });
});

describe('WHAT THESE TESTS CANNOT PROVE', () => {

    test('no fixed pixel width traps the boxes', () => {
        // The most we can check without a browser: nothing hard-codes a width that
        // would defeat the grid.
        const src = SRC();
        const rules = src.match(/\.sm-nassau-stakes[^{]*\{[^}]*\}/g) || [];
        rules.forEach(r => assert.ok(!/width:\s*\d+px/.test(r),
            'a fixed px width would ignore the available space: ' + r));
    });

    test('the group is not nested inside another hidden container', () => {
        const f = form(); f.pick('nassau');
        assert.equal(f.shown('sm-nassau-stake-group'), 'block');
        const src = SRC();
        const at = src.indexOf('id="sm-nassau-stake-group"');
        const before = src.slice(Math.max(0, at - 400), at);
        // The enclosing .control-grid must not itself be hidden.
        assert.ok(!/class="control-grid"[^>]*display:\s*none/.test(before));
    });
});
