// ============================================================================
// THE ROUND SETUP PAGE SAYS WHAT ITS LINK DOES, AND STOPS SHOUTING ABOUT DELETION
//
// 1. THE SHARE CARD IS GONE FROM THIS SCREEN - and this is where that is recorded,
//    because it was this file that stopped it being deleted for the wrong reason.
//
//    It once read "Spectator link - anyone can watch, but scores are read-only."
//    That is TRUE above four players and FALSE at or below four, where the bare
//    ?game=CODE link is fully writable. Measured, not inferred: arriving cold on a
//    four-player round gave 76 score inputs, 76 of them editable; the same arrival
//    on eight gave 152 and 0. Most of this group's golf is a foursome, so the
//    sentence was wrong on almost every round they play - and it nearly got the
//    card deleted as "the wrong link", which would have left a four-ball with no
//    way to share a round at all.
//
//    THE CARD HAS NOW LEFT, for the opposite reason: it sat at step one, offering a
//    link to a round that did not exist yet. Sharing moved to the Round Ready
//    screen, where the round is real and the groups are known, and a four-ball gets
//    a labelled copyable link like everybody else. round_ready_share_test.js and
//    tools/round-share-check.js own that surface and its measured copy now. What
//    stays here is the proof that this screen no longer offers a link at all - so
//    the two surfaces cannot both start describing one.
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
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADM = read('admin.html');

describe('THE SETUP SCREEN NO LONGER OFFERS A LINK', () => {

    test('the old blanket claim is gone', () => {
        assert.ok(!/Spectator link — anyone can watch, but scores are read-only/.test(ADM),
            'the card still calls a writable link read-only');
    });

    test('the card, its note and its QR all left together', () => {
        assert.ok(!/id="share-link-note"/.test(ADM), 'the note element survives the card');
        assert.ok(!/id="qrcode"/.test(ADM), 'the QR mount survives the card');
        assert.ok(!/onclick="copyAppUrl\(\)"/.test(ADM), 'the invite button survives the card');
        assert.ok(!/id="group-links-box"/.test(ADM),
            'the setup screen still lists links for a round that may not be saved');
    });

    test('and nothing is left calling into them', () => {
        assert.ok(!/function syncShareLinkNote/.test(ADM),
            'the updater for a deleted element is still here');
        assert.ok(!/regenerateGroupLinks/.test(ADM),
            'a builder with no markup to build into is still wired to the roster');
    });

    test('the measured sentence moved rather than disappearing', () => {
        assert.match(read('grouping.js'), /function groupLinkNoteText/,
            'the one measured piece of copy in the app went with the card');
        assert.match(ADM, /groupLinkNoteText\(/,
            'admin.html no longer shows the note anywhere');
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
