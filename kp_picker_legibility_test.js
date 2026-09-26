// ============================================================================
// THE KP PICKER IS LEGIBLE (2026-09-19, v181).
//
// The "Who is closest?" select had no type size of its own: Chrome's UA default,
// measured at 13.33 px, with the UA's grey 1 px border and square corners, next
// to ft/in boxes at 15.2 px with 8 px corners - three controls, two looks, and
// the smallest type in the block on the control that names who gets the money.
// This is tapped on a green in sun by a golfer who may not see well.
//
//   .kp-select      17px, the SAME size as the score boxes (.score-input) a
//                   golfer already reads on this screen, and at/over 16 px so
//                   iOS Safari does not zoom the page when it is focused;
//                   48 px tall (the Prev/Next buttons' height); the block's own
//                   border, corners and card background instead of the UA's.
//
// WAVE 16 REPLACED THE SELECT WITH NAME BUTTONS, and this suite followed the CLAIM
// rather than the element. The select is gone: "Yes" now opens the group's names two
// to a row and one tap records the KP, so .kp-name is the control that names who gets
// the money and it inherits every rule the select had to satisfy - 17px, the score
// boxes' size, and 48px tall. It is what caught the first draft of that wave, which
// used .kp-btn's 13.6px and would have put the smallest type in the block back on the
// money control, which is the exact defect this file was written for.
// The >= 16px iOS-zoom rule stays with the ft/in INPUTS, since only a focused input
// zooms the page - a button cannot.
// MEASURED at 390x844, two columns: 158x48 per name, no overflow at 3, 4 or 6 golfers
// or on a 22-character name (which wraps to two lines inside its own 48px button).
//   .kp-dist-input  the same 17 px, 48 px and border/corners/background - the
//                   ft/in boxes belong with the select now.
//   .kp-dist-label  0.85rem, up from 0.72rem, so "Distance (optional)" is read
//                   with the boxes it labels.
//   .kp-btn         UNTOUCHED. Save KP stays the loudest thing in the block by
//                   colour and weight (solid brand green, bold white); the select
//                   is not a primary bar.
//
// HARNESS. mini-dom has no layout and no computed style; this pins the
// stylesheet's rules and their relationship to the score box rule. The rendered
// sizes and heights before/after, and the landing, are Chrome's:
// tools/kp-entry-position-check.js index.html picker.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('index.html');
const rule = (selector) => {
    const re = new RegExp('\\n\\s*' + selector.replace(/[.\-]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
    const m = re.exec(SRC);
    assert.ok(m, 'rule exists: ' + selector);
    return m[1];
};
const px = (body, prop) => { const m = new RegExp(prop + ':\\s*([\\d.]+)(px|rem)').exec(body); return m ? (m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1])) : null; };

describe('THE NAME BUTTONS (Wave 16: they replaced the select)', () => {
    test('a name reads at 17px, equal to the score boxes - not at .kp-btn\'s 13.6px', () => {
        const name = rule('.kp-names .kp-name');
        const score = rule('.score-input');
        assert.equal(px(score, 'font-size'), 17, 'the score box is the reference');
        assert.equal(px(name, 'font-size'), 17,
            'the control that names who gets the money reads at the score boxes\' size');
    });
    test('48px tall, two to a row, and the select is gone', () => {
        const name = rule('.kp-names .kp-name');
        assert.equal(px(name, 'min-height'), 48);
        const wrap = rule('.kp-names');
        assert.match(wrap, /grid-template-columns:\s*1fr 1fr/, 'two columns');
        const src = read('index.html');
        assert.ok(!/class="kp-select"/.test(src), 'the select is still in the markup');
        assert.ok(!/kp-pick-/.test(src), 'the select id is still built');
        assert.ok(!/Save KP/.test(src), 'the Save step this wave cut is still there');
    });
    test('a name IS the primary action now, because tapping one writes the money', () => {
        // The select deliberately was NOT a primary bar: it selected, and Save wrote.
        // A name button writes, so it carries what Save carried - the brand-green fill
        // and the bold - inherited from .kp-btn, which is unchanged.
        const btn = rule('.kp-btn');
        assert.match(btn, /background:\s*var\(--brand-green\)/);
        assert.match(btn, /font-weight:\s*bold/);
        assert.equal(px(btn, 'font-size'), 0.85 * 16);
        assert.equal(px(btn, 'min-height'), 44);
    });
    test('THE TWO ANSWERS ARE EQUAL WEIGHT, in ONE rule that names both, so they cannot drift', () => {
        // Wave 16. "Yes — pick who" was the filled button and "No — leave it" the
        // outline one, on a hole where most answers are No: measured against the
        // block's background, 9.16:1 against 1.08:1, so the rarer answer was 8.5x more
        // prominent than the common one. Neither is a primary action - the block is a
        // question, and kp-ask-now's 2px brand-green border is what says "answer now".
        // ONE rule naming both classes is the point: two rules with the same body would
        // pass today and drift on the next edit.
        const src = read('index.html');
        const m = /\.kp-answers \.kp-no,\s*\.kp-answers \.kp-yes \{([^}]*)\}/.exec(src);
        assert.ok(m, 'the two answers are not styled by one shared rule');
        assert.match(m[1], /background:\s*var\(--bg-card\)/);
        assert.match(m[1], /color:\s*var\(--text-main\)/);
        assert.match(m[1], /border:\s*1px solid var\(--border-mid\)/);
        assert.ok(!/\.kp-answers \.kp-yes \{/.test(src.replace(m[0], '')),
            'a separate .kp-yes rule is back, which is how the weights drifted apart before');
        assert.equal(px(rule('.kp-answers .kp-btn'), 'min-height'), 48, 'both answers stay 48px');
    });
});

describe('THE FT / IN BOXES BELONG WITH IT', () => {
    test('same type size, same height, same border, corners and background as the names', () => {
        // Compared against .kp-name since Wave 16: the select they used to match is gone,
        // and the claim is that the picker reads as ONE control, whatever that control is.
        const inp = rule('.kp-dist-input');
        const name = rule('.kp-names .kp-name');
        assert.equal(px(inp, 'font-size'), px(name, 'font-size'));
        assert.ok(px(inp, 'font-size') >= 16, 'iOS Safari zooms a focused INPUT under 16px');
        assert.equal(px(inp, 'height'), 48);
        assert.match(inp, /border:\s*1px solid var\(--border-mid\)/);
        assert.match(inp, /border-radius:\s*8px/);
        assert.match(inp, /background:\s*var\(--bg-card\)/);
        assert.match(inp, /color:\s*var\(--text-main\)/);
        assert.equal(px(inp, 'width'), 64);
    });
    test('the "Distance (optional)" label reads with them', () => {
        assert.equal(px(rule('.kp-dist-label'), 'font-size'), 0.85 * 16);
    });
});

describe('THE LINE THAT CARRIES THE ANSWER', () => {
    // "No leader yet" / "Current: Ann Adams - 8' 4"" is what a golfer reads when
    // somebody has already claimed the hole - the state most of them look at.
    // 0.95rem (15.2px), up from 0.82rem; the head (0.7rem) and Save KP (0.85rem
    // bold, filled) stay where they were.
    test('.kp-current is 0.95rem; the head and Save KP did not move', () => {
        assert.equal(px(rule('.kp-current'), 'font-size'), 0.95 * 16);
        assert.equal(px(rule('.kp-head'), 'font-size'), 0.7 * 16);
        assert.equal(px(rule('.kp-btn'), 'font-size'), 0.85 * 16);
    });
});

describe('THE SEAMS', () => {
    test('the Chrome check has a picker arm that opens the picker with a real tap', () => {
        const t = read('tools/kp-entry-position-check.js');
        assert.match(t, /ARM === 'picker'/);
        assert.match(t, /\{ tap: '\.kp-yes' \}/);   // v193: the picker opens from "Yes — pick who"
        assert.match(t, /fontPx: parseFloat\(cs\.fontSize\)/);
    });
    test('sw.js moved for this wave (v181) and has not moved back', () => {
        assert.match(read('sw.js'), /Moved to v181:/);
        const c = /const CACHE_VERSION = 'golfapp-v(\d+)-/.exec(read('sw.js'));
        assert.ok(c && Number(c[1]) >= 181, 'consumer key at or past v181: ' + (c && c[0]));
    });
});
