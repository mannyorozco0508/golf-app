// ============================================================================
// THE ROUND SETUP PAGE SAYS WHAT ITS LINK DOES, AND STOPS SHOUTING ABOUT DELETION
//
// 1. THE SHARE CARD LIED ABOUT ITS OWN LINK.
//
//    It read "Spectator link — anyone can watch, but scores are read-only." That
//    is TRUE above four players and FALSE at or below four, where the bare
//    ?game=CODE link is fully writable. Measured, not inferred: arriving cold on a
//    four-player round gives 76 score inputs, 76 of them editable; the same
//    arrival on eight players gives 152 inputs and 0 editable.
//
//    Most of this group's golf is a foursome, so the sentence was wrong on almost
//    every round they play - and it nearly got the card deleted as "the wrong
//    link". Removing it would have left a four-ball with NO way to share a round
//    at all: both group-link surfaces hide themselves when there is one group.
//
//    THE COPY IS NOW BOUND TO THE BEHAVIOUR, not to a group count that merely
//    correlates with it. index.html decides editability on players.length > 4;
//    this card must describe THAT. tools/round-setup-check.js measures what the
//    link actually permits and fails if the sentence disagrees - so if the gate
//    ever moves, the sentence goes red instead of quietly starting to lie again.
//
// 2. END CURRENT GAME WAS THE LOUDEST THING ON THE PAGE.
//
//    A full-width red button, 1rem bold, inside a 2px dashed red panel, and it
//    wipes the round. Prominence should track how often a control is wanted, not
//    how much damage it does. It is now the quietest control there. The
//    confirm() in front of it is untouched - that is the actual safeguard, and
//    making the button small is not a substitute for it.
//
// 3. AND THE PAGE HAD NO WAY BACK. admin.html was the last page in the round
//    journey without one. The wizard's step-Back moves between steps; it never
//    leaves the wizard.
//
// WHAT MINI-DOM CANNOT PROVE. Whether the link it describes is actually writable -
// that needs a layout-free browser to count editable inputs - and whether the End
// control is visually quiet. Both are measured in tools/round-setup-check.js. Here
// the row count is stubbed and the page's own roster-change handler is driven,
// which proves the wiring and the mapping.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADM = read('admin.html');

// The page with a roster of `rowCount` golfers, then its own roster-change
// handler run - the same call the Add Player button makes.
function withRoster(rowCount) {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js'],
        { search: '?game=RSETUP' });
    vm.runInContext(`
        alert = function () {}; confirm = function () { return true; };
        var __rows = ${rowCount};
        document.querySelectorAll = function (sel) {
            if (sel === '.player-row' || sel === '#player-list .player-row') return new Array(__rows);
            return { forEach: function () {}, length: 0 };
        };
        currentMode = 'RSETUP';
        regenerateGroupLinks();
    `, sb);
    return sb;
}
const note = sb => vm.runInContext(
    '(function(){var e=document.getElementById("share-link-note");'
    + 'return e ? (e.textContent || e.innerHTML || "") : null;})()', sb);

describe('THE SHARE CARD DESCRIBES ITS OWN LINK', () => {

    test('the old blanket claim is gone', () => {
        assert.ok(!/Spectator link — anyone can watch, but scores are read-only/.test(ADM),
            'the card still calls a writable link read-only');
    });

    test('the note is an element the page can update, not fixed markup', () => {
        assert.match(ADM, /id="share-link-note"/,
            'the sentence cannot change with the roster');
    });

    [1, 2, 3, 4].forEach(n => {
        test(n + ' golfer(s): it is called a scorekeeper link', () => {
            const t = note(withRoster(n));
            assert.match(t, /scorekeeper/i, 'reads: ' + JSON.stringify(t));
            assert.ok(!/read-only/i.test(t),
                'a writable link is still described as read-only: ' + JSON.stringify(t));
        });
    });

    [5, 8, 12].forEach(n => {
        test(n + ' golfers: it is called read-only and points below', () => {
            const t = note(withRoster(n));
            assert.match(t, /read-only/i, 'reads: ' + JSON.stringify(t));
            assert.match(t, /own link|below|each group/i,
                'it does not send them to the group links: ' + JSON.stringify(t));
        });
    });

    // The exact boundary index.html uses. Five is the first multi-group round.
    test('the switch happens at the same count index.html uses', () => {
        assert.match(note(withRoster(4)), /scorekeeper/i);
        assert.match(note(withRoster(5)), /read-only/i);
        assert.match(read('index.html'), /const isMultiGroupRound = players\.length > 4;/,
            'index.html moved the gate; this card now describes the wrong rule');
    });

    test('the QR and the copy button still exist', () => {
        assert.match(ADM, /id="qrcode"/, 'the only link a foursome has was removed');
        assert.match(ADM, /onclick="copyAppUrl\(\)"/);
    });

    test('and the group scorekeeper box is untouched', () => {
        assert.match(ADM, /id="group-links-box"/);
        assert.match(ADM, /Group Scorekeeper Links/);
    });
});

describe('THE DESTRUCTIVE CONTROL IS THE QUIETEST ONE', () => {

    const endBox = () => {
        const at = ADM.indexOf('onclick="endAndClearRound()"');
        assert.ok(at > -1, 'the End control is gone entirely');
        return ADM.slice(Math.max(0, at - 700), at + 200);
    };
    const rule = sel => {
        const at = ADM.indexOf(sel + ' {');
        return at === -1 ? '' : ADM.slice(at, ADM.indexOf('}', at));
    };

    test('it still exists and still wipes the round', () => {
        assert.match(ADM, /onclick="endAndClearRound\(\)"/);
        assert.match(ADM, /function endAndClearRound/);
    });

    test('the confirmation in front of it is untouched', () => {
        const fn = ADM.slice(ADM.indexOf('function endAndClearRound'),
                             ADM.indexOf('function endAndClearRound') + 700);
        assert.match(fn, /confirm\(/,
            'a small button is not a substitute for asking');
        assert.match(fn, /db\.ref\(`events\/\$\{currentMode\}`\)\.remove\(\)/);
    });

    test('it is no longer a full-width block', () => {
        assert.ok(!/class="btn-danger"/.test(endBox()),
            'the End control still uses the full-width danger button');
    });

    test('the dashed red panel around it is gone', () => {
        assert.ok(!/class="end-box"/.test(ADM),
            'the loudest container on the page still frames the delete');
        assert.ok(!/\.end-box \{/.test(ADM), 'and its rule is left behind');
    });

    test('it is smaller than the primary action on the page', () => {
        const end = rule('.end-round-btn');
        assert.ok(end, 'the End control has no rule of its own');
        const endSize = parseFloat((/font-size:\s*([\d.]+)rem/.exec(end) || [0, 1])[1]);
        const primary = rule('.btn-primary');
        const primarySize = parseFloat((/font-size:\s*([\d.]+)rem/.exec(primary) || [0, 1])[1]);
        assert.ok(endSize < primarySize,
            'End (' + endSize + 'rem) is not quieter than Save (' + primarySize + 'rem)');
        assert.ok(!/width:\s*100%/.test(end), 'it is still full width');
    });

    // Quiet is not the same as unhittable.
    test('but it is still a usable touch target', () => {
        const m = /min-height:\s*(\d+)px/.exec(rule('.end-round-btn'));
        assert.ok(m && Number(m[1]) >= 40,
            'the End control is below a usable touch target');
    });
});

describe('THE PAGE HAS A WAY BACK', () => {

    test('there is a back control', () => {
        assert.equal((ADM.match(/class="back-btn"/g) || []).length, 1);
        assert.match(ADM, /onclick="goBack\(\)"/);
    });

    test('goBack is defined once and falls back to a real destination', () => {
        assert.equal((ADM.match(/function goBack\(\)/g) || []).length, 1);
        const fn = ADM.slice(ADM.indexOf('function goBack()'),
                             ADM.indexOf('function goBack()') + 400);
        assert.match(fn, /document\.referrer/);
        assert.match(fn, /history\.back\(\)/);
        assert.match(fn, /admin\.html/, 'a cold arrival would have nowhere to go');
    });

    test('and it is a usable touch target', () => {
        const at = ADM.indexOf('.back-btn {');
        assert.ok(at > -1, 'no .back-btn rule');
        const m = /min-height:\s*(\d+)px/.exec(ADM.slice(at, ADM.indexOf('}', at)));
        assert.ok(m && Number(m[1]) >= 40);
    });

    test('the wizard step-Back is untouched — it is a different control', () => {
        assert.equal((ADM.match(/wizardBack\(\d\)/g) || []).length, 7,
            'the wizard lost or gained a step Back');
    });
});
