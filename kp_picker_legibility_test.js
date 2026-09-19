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

describe('THE SELECT', () => {
    test('has its own type size: 17px, equal to the score boxes, and not under 16', () => {
        const sel = rule('.kp-select');
        const score = rule('.score-input');
        assert.equal(px(score, 'font-size'), 17, 'the score box is the reference');
        assert.equal(px(sel, 'font-size'), 17, 'the picker reads at the score boxes\' size');
        assert.ok(px(sel, 'font-size') >= 16, 'iOS Safari zooms a focused control under 16px');
    });
    test('is 48px tall with the block\'s border, corners and background - not the UA\'s', () => {
        const sel = rule('.kp-select');
        assert.equal(px(sel, 'min-height'), 48);
        assert.match(sel, /border:\s*1px solid var\(--border-mid\)/);
        assert.match(sel, /border-radius:\s*8px/);
        assert.match(sel, /background:\s*var\(--bg-card\)/);
        assert.match(sel, /color:\s*var\(--text-main\)/);
        assert.match(sel, /width:\s*100%/);
    });
    test('is NOT a primary bar: no brand-green fill, no bold; Save KP keeps both, unchanged', () => {
        const sel = rule('.kp-select');
        assert.doesNotMatch(sel, /brand-green|font-weight:\s*(bold|700)/);
        const btn = rule('.kp-btn');
        assert.match(btn, /background:\s*var\(--brand-green\)/);
        assert.match(btn, /font-weight:\s*bold/);
        assert.equal(px(btn, 'font-size'), 0.85 * 16);
        assert.equal(px(btn, 'min-height'), 44);
    });
});

describe('THE FT / IN BOXES BELONG WITH IT', () => {
    test('same type size, same height, same border, corners and background as the select', () => {
        const inp = rule('.kp-dist-input');
        const sel = rule('.kp-select');
        assert.equal(px(inp, 'font-size'), px(sel, 'font-size'));
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
        assert.match(t, /\{ tap: '\.kp-btn' \}/);
        assert.match(t, /fontPx: parseFloat\(cs\.fontSize\)/);
    });
    test('sw.js moved for this wave (v181) and has not moved back', () => {
        assert.match(read('sw.js'), /Moved to v181:/);
        const c = /const CACHE_VERSION = 'golfapp-v(\d+)-/.exec(read('sw.js'));
        assert.ok(c && Number(c[1]) >= 181, 'consumer key at or past v181: ' + (c && c[0]));
    });
});
