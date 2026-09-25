// ============================================================================
// THE BUTTON SYSTEM ON THE SETUP SCREEN, MEASURED IN REAL CHROME
//
// EVERY ASSERTION HERE IS A RENDERED SIZE. mini-dom cannot make one of them:
// getBoundingClientRect() there returns a hard-coded all-zero rect, and CLAUDE.md
// forbids teaching it a fake one because that asserts the mock instead of the
// runtime. So this file drives Chrome at a phone size, and says so.
//
// NOTHING CALLS A PAGE FUNCTION. It arrives at admin.html with no query string -
// the screen a golfer gets by opening Home and touching nothing - with a
// remembered round and a remembered season in localStorage so Resume and the
// season row are on screen the way they are on a used phone.
//
// WHAT WAS WRONG, MEASURED BEFORE THE WAVE:
//   document.scrollWidth 395 against a 390 viewport - the page could be dragged
//     sideways, because "Start a season" rendered 368px inside a 336px card
//   SEVEN widths and EIGHT heights across fifteen controls
//   FIVE controls under a 44px touch target
//   the three code rows - same two classes, meant to look identical - were three
//     different layouts: 194.9+87.5, 161.2+166.8 and 161.2+166.8 at three
//     different heights
//
// AND THE CAUSE OF THE OVERHANG WAS box-sizing, which is why the reset is the
// first thing the system declares. <button> and <input> get border-box from the
// UA stylesheet; an <a> does not, and #season-start-link is the only control on
// this screen styled as a button and written as an anchor.
//
// WHY THIS IS A TEST AND NOT ONLY tools/home-screen-check.js: the tool is run by
// hand, and it had been failing on main since the season row landed in v222
// because nobody ran it. A geometry guard that is not in the suite is a guard
// that reports nothing.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const ADMIN = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
const DB = { events: {}, global_courses: {}, trips: {}, tournaments: {}, seasons: {} };

// A phone that has been used: a round to resume and a season to reopen, so the
// optional rows render.
const SEED = `(function () { try {
    localStorage.setItem('lastRoomCode', 'SEED1');
    localStorage.setItem('hardpanSeasons', JSON.stringify([{ code: 'WNTR1', name: 'Winter League' }]));
} catch (e) {} })();`;

const MEASURE = `(function () {
    var screen = document.getElementById('lobby-screen');
    var cw = document.documentElement.clientWidth;
    var out = [];
    var nodes = screen.querySelectorAll('button, a, input, select, textarea');
    for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.offsetParent === null || el.getClientRects().length === 0) continue;
        var r = el.getBoundingClientRect();
        var cs = getComputedStyle(el);
        var p = el.parentElement;
        var pr = p.getBoundingClientRect();
        var pcs = getComputedStyle(p);
        var innerRight = pr.right - parseFloat(pcs.paddingRight) - parseFloat(pcs.borderRightWidth);
        var innerLeft = pr.left + parseFloat(pcs.paddingLeft) + parseFloat(pcs.borderLeftWidth);
        out.push({
            name: el.id ? '#' + el.id : el.tagName.toLowerCase()
                + (el.className && el.className.toString
                    ? '.' + String(el.className).trim().split(/\\s+/)[0] : ''),
            label: (el.innerText || el.getAttribute('placeholder') || '').replace(/\\s+/g, ' ').trim().slice(0, 24),
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
            left: Math.round(r.left * 10) / 10,
            right: Math.round((cw - r.right) * 10) / 10,
            overRight: Math.round((r.right - innerRight) * 10) / 10,
            overLeft: Math.round((innerLeft - r.left) * 10) / 10,
            boxSizing: cs.boxSizing
        });
    }
    var byId = {};
    out.forEach(function (c) { byId[c.name] = c; });
    return JSON.stringify({
        scrollW: document.documentElement.scrollWidth,
        clientW: cw,
        ctlMax: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ctl-max')) || 0,
        ctlH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ctl-h')) || 0,
        controls: out,
        byId: byId
    });
})()`;

let M = null;

describe('THE BUTTON SYSTEM (setup screen, real Chrome at 390x844)', () => {

    before(async () => {
        const r = await arriveCold({
            url: fileUrl('admin.html', ''), db: DB, settleMs: 2600,
            viewport: { width: 390, height: 844 }, preScript: SEED,
            steps: [{ expression: MEASURE }]
        });
        assert.equal(r.ok, true, 'the arrival failed, so NOTHING is proven: ' + r.reason);
        const raw = (r.value || []).find(v => typeof v === 'string' && v.charAt(0) === '{');
        assert.ok(raw, 'no measurement came back');
        M = JSON.parse(raw);
        // THE POSITIVE HALF FIRST. Every assertion below is about a list of
        // controls, and an empty list satisfies all of them forever.
        //
        // A NAMED LIST RATHER THAN A COUNT. This was `>= 14`, which was the floor
        // for the screen before Option A moved the sign-in card into a panel - four
        // controls left the lobby, the count dropped to 12, and the whole file
        // errored in this hook. A number has to be re-edited every time the screen
        // changes shape; the controls that must be THERE do not.
        const MUST = ['#join-code-input', '#copy-code-input', '#season-open-input',
                      '#copy-code-btn', '#season-open-btn', '#season-start-link',
                      '#hw-trip', '#hw-quick'];
        const missing = MUST.filter(k => !M.byId[k]);
        assert.deepEqual(missing, [],
            'these controls did not render, so nothing below proves anything: '
            + missing.join(', '));
    }, { timeout: 90000 });

    test('THE PAGE FITS THE PHONE: nothing can be dragged sideways', () => {
        assert.equal(M.scrollW, M.clientW,
            'document.scrollWidth is ' + M.scrollW + ' against a ' + M.clientW
            + 'px viewport - something is wider than the phone');
    });

    test('nothing overflows its container', () => {
        const out = M.controls.filter(c => c.overRight > 0.5 || c.overLeft > 0.5)
            .map(c => c.name + ' +' + Math.max(c.overRight, c.overLeft) + 'px (' + c.boxSizing + ')');
        assert.deepEqual(out, [], 'these hang outside their card: ' + out.join(', '));
    });

    test('EVERY control is a 44px touch target, not just the game-code row', () => {
        // The old guard measured one row. Two 40px fields and a 58px button
        // shipped beside it.
        const small = M.controls.filter(c => c.h < 44).map(c => c.name + ' ' + c.h + 'px');
        assert.deepEqual(small, [], 'below a 44px target: ' + small.join(', '));
    });

    test('ONE HEIGHT: every control is exactly --ctl-h, bar the two named exceptions', () => {
        // THIS ASSERTION WAS MISSING AND A CONTROL FOUND IT. Turning the shared
        // rule's `height` back into a `min-height` leaves the paired buttons at 48
        // (they carry no vertical padding, so a 48px floor already clears the
        // tallest emoji line box) but lets a SINGLE button grow to 52 on its 14px
        // padding. One height quietly becomes two, and every other assertion here
        // still passed. So the promise is asserted directly.
        //
        // THE TWO EXCEPTIONS, both deliberate and both named rather than ranged
        // over: the theme chip is a 44px chip, not a widget, and the tiles keep the
        // card's full width and their own height.
        const EXEMPT = /theme-toggle-btn|hw-trip|hw-quick/;
        const odd = M.controls.filter(c => !EXEMPT.test(c.name) && c.h !== M.ctlH)
            .map(c => c.name + ' ' + c.h + 'px');
        assert.deepEqual(odd, [],
            'these are not --ctl-h (' + M.ctlH + 'px): ' + odd.join(', '));
        // And the exceptions are still there, so EXEMPT is not quietly excusing
        // the whole screen.
        assert.equal(M.controls.filter(c => EXEMPT.test(c.name)).length, 3,
            'the named exceptions are gone - the exemption now covers nothing or too much');
    });

    test('the system declares its width and height, and they are honoured', () => {
        assert.equal(M.ctlMax, 320, '--ctl-max moved');
        assert.equal(M.ctlH, 48, '--ctl-h moved');
        const tooWide = M.controls
            .filter(c => !/hw-trip|hw-quick/.test(c.name) && c.w > M.ctlMax + 1)
            .map(c => c.name + ' ' + c.w);
        assert.deepEqual(tooWide, [],
            'wider than --ctl-max: ' + tooWide.join(', '));
    });

    test('THE THREE CODE ROWS ARE ONE SHAPE — the defect this wave existed for', () => {
        const inputs = ['#join-code-input', '#copy-code-input', '#season-open-input'].map(k => M.byId[k]);
        const btns = ['#copy-code-btn', '#season-open-btn'].map(k => M.byId[k]);
        inputs.forEach((c, i) => assert.ok(c, 'code field ' + i + ' is not on screen'));
        btns.forEach((c, i) => assert.ok(c, 'paired button ' + i + ' is not on screen'));
        // One width, one height, one gutter, on all three.
        const shape = inputs.map(c => c.w + 'x' + c.h + '@' + c.left);
        assert.equal(new Set(shape).size, 1,
            'the three code fields are three different sizes: ' + shape.join(' | '));
        assert.equal(inputs[0].w, 182, 'the shared field width moved');
        assert.equal(inputs[0].h, 48);
        const bshape = btns.map(c => c.w + 'x' + c.h + '@' + c.right);
        assert.equal(new Set(bshape).size, 1,
            'the paired buttons are different sizes: ' + bshape.join(' | '));
        assert.equal(btns[0].w, 128, 'the paired button width moved off --ctl-pair-btn');
        // Centred: the same gutter on both sides, so the rows line up with the
        // single buttons above and below them.
        inputs.forEach(c => assert.equal(c.left, 35, c.name + ' is not on the 35px gutter'));
        btns.forEach(c => assert.equal(c.right, 35, c.name + ' is not on the 35px gutter'));
    });

    test('AN EMOJI IN A LABEL NO LONGER CHANGES A BUTTON HEIGHT', () => {
        // Measured before the wave, and proved by swapping the two labels:
        // "🔁 Start from it" rendered 58px and "Open ledger" 52px from the same
        // classes, because the emoji raises the line box 6px and line-height was
        // normal with no fixed height. The explicit height is what stops that.
        const emoji = M.byId['#copy-code-btn'];
        const plain = M.byId['#season-open-btn'];
        assert.ok(emoji && plain);
        assert.ok(/\p{Extended_Pictographic}/u.test(emoji.label),
            'the emoji label is gone, so this proves nothing: ' + JSON.stringify(emoji.label));
        assert.ok(!/\p{Extended_Pictographic}/u.test(plain.label),
            'the plain label gained an emoji, so this proves nothing: ' + JSON.stringify(plain.label));
        assert.equal(emoji.h, plain.h,
            'an emoji label is ' + emoji.h + 'px and a plain one ' + plain.h + 'px');
    });

    test('the anchor styled as a button is contained now, and it was the overhang', () => {
        const a = M.byId['#season-start-link'];
        assert.ok(a, 'Start a season is not on screen');
        assert.equal(a.boxSizing, 'border-box',
            'the anchor is back on content-box, which is what made it 368px wide');
        assert.equal(a.w, 320, 'Start a season is ' + a.w + 'px');
        assert.equal(a.h, 48);
        assert.equal(a.left, a.right, 'it is not centred: ' + a.left + ' / ' + a.right);
    });

    test('THE TILES ARE THE ONE DELIBERATE EXCEPTION, and they did not grow', () => {
        // .home-widgets keeps the card's full 336px rather than taking --ctl-max.
        // Measured: at 320 the tiles narrow to 155 and their description wraps one
        // more line, growing them from 129.3px to 143.4px tall. Asserted rather
        // than commented, so the exception cannot quietly become a drift.
        const t = [M.byId['#hw-trip'], M.byId['#hw-quick']];
        t.forEach(c => assert.ok(c, 'a home tile is not on screen'));
        assert.equal(t[0].w, 163, 'the tiles took --ctl-max: ' + t[0].w);
        assert.equal(t[1].w, 163);
        assert.ok(t[0].h < 140,
            'the tiles grew to ' + t[0].h + 'px - they are inside --ctl-max again');
        assert.equal(t[0].h, t[1].h, 'the two tiles are different heights');
    });

    test('and the system is declared ONCE, as a system', () => {
        // Source, not geometry: the five properties exist in one place, so there is
        // one thing to change. The repo has nine pages declaring .btn-primary in
        // seven different rule bodies, which is what this is the beginning of
        // fixing.
        const SYS = ADMIN.slice(ADMIN.indexOf('THE BUTTON SYSTEM (UI Wave 5)'));
        assert.ok(SYS.length > 800, 'the button system block is gone');
        ['--ctl-max', '--ctl-h', '--ctl-line', '--ctl-gap', '--ctl-pair-btn'].forEach(v =>
            assert.equal((ADMIN.match(new RegExp('\\' + v.slice(1) + ':', 'g')) || []).length, 1,
                v + ' is declared more than once, or not at all'));
        // The reset is SCOPED. A page-wide one would shrink .grid-input, which is
        // the custom course grid.
        assert.match(SYS, /#lobby-screen, #lobby-screen \*,/, 'the reset is gone');
        assert.ok(!/^\s*\*,?\s*\*::before/m.test(ADMIN),
            'a page-wide box-sizing reset appeared - it would shrink the course grid');
        // And .modal-content is covered, so the sign-in controls keep the system if
        // they move into a panel.
        assert.match(SYS, /\.modal-content \.btn-primary/,
            'the system does not reach a panel, so controls moved into one lose it');
    });
});
