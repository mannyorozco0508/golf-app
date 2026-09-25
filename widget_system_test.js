// ============================================================================
// THE SETUP SCREEN AS WIDGETS, NOT FORM FIELDS (UI Wave 6)
//
// SIX GUARDS, and five of them exist because Wave 5's two could not see the thing
// Manny saw on his phone. Wave 5 asserted that every control's BOX is exactly
// --ctl-h and it was right; a label pinned 2px from the top of a correct 48px box
// passed both guards and shipped in v230.
//
//   1  WHERE THE TEXT SITS inside its own control, measured with a Range around
//      the control's own text node. This is the one that catches a label glued to
//      the top of a correct box, and it is the reason this file exists.
//   2  ONE LEFT EDGE for every block that spans the screen, so a helper sentence
//      cannot sit 8px outside the control it describes - which is what Wave 5's
//      own --ctl-max: 320 did to the three code rows.
//   3  ONE VERTICAL GAP between blocks. There were seven.
//   4  ONE TYPE across the three code fields. Wave 5 made the three boxes
//      identical and left the font, weight, tracking, alignment and case behind,
//      so three matching boxes held two different controls.
//   5  NO INLINE LAYOUT in the lobby markup, except display:none. An inline
//      declaration beats every rule, and three separate misalignments across two
//      waves trace back to one of them.
//   6  EVERY PLACEHOLDER FITS its own content box. "PREVIOUS ROUND CODE" needed
//      196.5px in a 160px field - 36.5px of it could not be shown.
//
// mini-dom can prove none of this: getBoundingClientRect returns a hard-coded zero
// rect there, and CLAUDE.md forbids teaching it a fake one. So this drives Chrome
// at a phone size. Nothing calls a page function - it arrives at admin.html with no
// query string, which is the screen a golfer gets by opening Home.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const ADMIN = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
const DB = { events: {}, global_courses: {}, trips: {}, tournaments: {}, seasons: {} };
const SEED = `(function () { try {
    localStorage.setItem('lastRoomCode', 'SEED1');
    localStorage.setItem('hardpanSeasons', JSON.stringify([{ code: 'WNTR1', name: 'Winter League' }]));
} catch (e) {} })();`;

// THE TWO NAMED EXCEPTIONS, and they are named rather than ranged over so the
// exemption cannot quietly grow:
//   .theme-toggle-btn is a centred chip of intrinsic width - it has no left edge
//     to line up with, by design.
//   the two home tiles are a two-column grid whose descriptions wrap on purpose,
//     so they are neither one width nor one line.
const CENTRED_CHIP = /theme-toggle-btn/;
const TILES = /hw-trip|hw-quick/;

const MEASURE = `(function () {
    var lobby = document.getElementById('lobby-screen');
    var cw = document.documentElement.clientWidth;

    // WHERE THE GLYPHS ARE, not where the box is. A Range around the element's own
    // text node gives the text's rect; the difference between that and the box is
    // what says a label is pinned to an edge.
    function textRect(el) {
        var node = null;
        for (var i = 0; i < el.childNodes.length; i++) {
            var n = el.childNodes[i];
            if (n.nodeType === 3 && (n.textContent || '').trim().length) { node = n; break; }
        }
        if (!node) return null;
        var rg = document.createRange();
        rg.selectNodeContents(node);
        var b = rg.getBoundingClientRect();
        return b.height ? b : null;
    }
    function oneLineWidth(el, text) {
        var cs = getComputedStyle(el);
        var p = document.createElement('span');
        p.style.cssText = 'position:absolute;left:-9999px;white-space:pre;font-family:'
            + cs.fontFamily + ';font-weight:' + cs.fontWeight + ';font-size:' + cs.fontSize
            + ';letter-spacing:' + cs.letterSpacing + ';text-transform:' + cs.textTransform;
        p.textContent = text;
        document.body.appendChild(p);
        var w = p.getBoundingClientRect().width;
        p.parentNode.removeChild(p);
        return Math.round(w * 10) / 10;
    }

    var controls = [];
    var nodes = lobby.querySelectorAll('button, a, input');
    for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.offsetParent === null || el.getClientRects().length === 0) continue;
        var r = el.getBoundingClientRect();
        var cs = getComputedStyle(el);
        var tr = textRect(el);
        var ph = el.getAttribute('placeholder');
        var label = ph || (el.innerText || '').replace(/\\s+/g, ' ').trim();
        var contentW = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
            - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
        controls.push({
            name: el.id ? '#' + el.id : el.tagName.toLowerCase()
                + (el.className && el.className.toString
                    ? '.' + String(el.className).trim().split(/\\s+/)[0] : ''),
            label: label.slice(0, 26),
            w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
            left: Math.round(r.left * 10) / 10,
            above: tr ? Math.round((tr.top - r.top) * 10) / 10 : null,
            below: tr ? Math.round((r.bottom - tr.bottom) * 10) / 10 : null,
            fontSize: cs.fontSize, fontWeight: cs.fontWeight,
            letterSpacing: cs.letterSpacing, textAlign: cs.textAlign,
            textTransform: cs.textTransform,
            contentW: Math.round(contentW * 10) / 10,
            needs: label ? oneLineWidth(el, ph ? ph : label) : 0
        });
    }

    // The top-level blocks, and the gap between each and the one above it.
    var blocks = [];
    var prevBottom = null;
    var kids = lobby.children;
    for (var k = 0; k < kids.length; k++) {
        var b = kids[k];
        if (b.getClientRects().length === 0) continue;
        var br = b.getBoundingClientRect();
        if (br.height === 0) continue;
        blocks.push({
            sel: b.tagName.toLowerCase() + (b.id ? '#' + b.id : '')
                + (b.className && b.className.toString ? '.' + String(b.className).trim().split(/\\s+/)[0] : ''),
            w: Math.round(br.width * 10) / 10, h: Math.round(br.height * 10) / 10,
            left: Math.round(br.left * 10) / 10,
            gapAbove: prevBottom === null ? null : Math.round((br.top - prevBottom) * 10) / 10
        });
        prevBottom = br.bottom;
    }

    var root = getComputedStyle(document.documentElement);
    return JSON.stringify({
        clientW: cw, scrollW: document.documentElement.scrollWidth,
        screenH: Math.round(lobby.getBoundingClientRect().height),
        widgetMax: parseFloat(root.getPropertyValue('--widget-max')) || 0,
        widgetGap: parseFloat(root.getPropertyValue('--widget-gap')) || 0,
        widgetPad: parseFloat(root.getPropertyValue('--widget-pad')) || 0,
        controls: controls, blocks: blocks
    });
})()`;

let M = null;

describe('THE WIDGET SYSTEM (setup screen, real Chrome at 390x844)', () => {

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
        // THE POSITIVE HALF FIRST, by name rather than by count: every assertion
        // below is about a list, and an empty list satisfies all of them forever.
        // A count has to be re-edited every time the screen changes shape - which
        // is exactly what happened to button_system_test.js when Option A moved
        // four controls off this screen.
        const MUST = ['#join-code-input', '#copy-code-input', '#season-open-input',
                      '#copy-code-btn', '#season-open-btn', '#season-start-link',
                      '#hw-trip', '#hw-quick'];
        const missing = MUST.filter(k => !M.controls.some(c => c.name === k));
        assert.deepEqual(missing, [],
            'these controls did not render, so nothing below proves anything: ' + missing.join(', '));
    }, { timeout: 90000 });

    // ---- 1 --------------------------------------------------------------------
    test('1. EVERY LABEL IS VERTICALLY CENTRED IN ITS OWN CONTROL', () => {
        // The guard Wave 5 did not have. "Start a season" measured 2px below the
        // top of its box and 26px above the bottom - a correct 48px box with the
        // text glued to the ceiling - and both v230 guards passed it.
        const off = M.controls
            .filter(c => c.above !== null)
            .filter(c => Math.abs(c.above - c.below) > 1.5)
            .map(c => c.name + ' (' + c.above + ' above, ' + c.below + ' below)');
        assert.deepEqual(off, [], 'text is not centred in: ' + off.join(', '));
        // And the measurement is live: at least a few controls DO have a text node,
        // or this passes on a screen it never read.
        assert.ok(M.controls.filter(c => c.above !== null).length >= 5,
            'only ' + M.controls.filter(c => c.above !== null).length
            + ' controls had a readable text node - the Range measurement is not working');
    });

    // ---- 2 --------------------------------------------------------------------
    test('2. ONE LEFT EDGE for every block that spans the screen', () => {
        const spanning = M.blocks.filter(b => !CENTRED_CHIP.test(b.sel));
        const lefts = [...new Set(spanning.map(b => b.left))];
        assert.deepEqual(lefts.length === 1 ? [] : spanning.map(b => b.sel + '@' + b.left), [],
            'blocks sit on ' + lefts.length + ' different left edges: [' + lefts.join(', ') + ']');
        // And every one is the same width, so a sentence cannot be wider than the
        // control it describes.
        const widths = [...new Set(spanning.map(b => b.w))];
        assert.equal(widths.length, 1,
            'blocks are ' + widths.length + ' different widths: [' + widths.join(', ') + ']');
        assert.equal(widths[0], M.widgetMax,
            'the shared width is ' + widths[0] + ', not --widget-max (' + M.widgetMax + ')');
        // The named exception is still there, so CENTRED_CHIP is not excusing the
        // whole screen.
        assert.equal(M.blocks.filter(b => CENTRED_CHIP.test(b.sel)).length, 1,
            'the centred chip is gone - that exemption now covers nothing or too much');
    });

    // ---- 3 --------------------------------------------------------------------
    test('3. ONE VERTICAL GAP between blocks', () => {
        assert.ok(M.widgetGap >= 8, '--widget-gap is ' + M.widgetGap + ' - not declared');
        const gaps = M.blocks.map(b => b.gapAbove).filter(g => g !== null);
        assert.ok(gaps.length >= 6, 'only ' + gaps.length + ' gaps measured');
        const odd = M.blocks.filter(b => b.gapAbove !== null && Math.abs(b.gapAbove - M.widgetGap) > 1)
            .map(b => b.sel + ' ' + b.gapAbove + 'px');
        assert.deepEqual(odd, [],
            'these are not --widget-gap (' + M.widgetGap + 'px): ' + odd.join(', '));
    });

    // ---- 4 --------------------------------------------------------------------
    test('4. ONE TYPE across the three code fields', () => {
        const f = ['#join-code-input', '#copy-code-input', '#season-open-input']
            .map(k => M.controls.find(c => c.name === k));
        f.forEach((c, i) => assert.ok(c, 'code field ' + i + ' is not on screen'));
        const shape = c => [c.fontSize, c.fontWeight, c.letterSpacing, c.textAlign, c.textTransform].join(' / ');
        const shapes = f.map(shape);
        assert.equal(new Set(shapes).size, 1,
            'the three code fields are set in different type:\n      '
            + f.map((c, i) => c.name + '  ' + shapes[i]).join('\n      '));
        // And it is the deliberate one, not whatever the generic input rule gives:
        // bold, tracked, centred and uppercased, so a typed code reads as a code.
        assert.equal(f[0].fontWeight, '700', 'a game code is not set bold');
        assert.equal(f[0].textAlign, 'center', 'a game code is not centred in its field');
        assert.equal(f[0].textTransform, 'uppercase', 'a game code is not uppercased');
        assert.ok(parseFloat(f[0].letterSpacing) > 0, 'a game code has no tracking');
        // The three paired buttons too.
        const b = ['#copy-code-btn', '#season-open-btn'].map(k => M.controls.find(c => c.name === k));
        assert.equal(new Set(b.map(shape)).size, 1, 'the paired buttons are set in different type');
    });

    // ---- 5 --------------------------------------------------------------------
    test('5. NO INLINE LAYOUT in the lobby markup, except display:none', () => {
        // An inline declaration beats every rule. It has cost three separate
        // misalignments across two waves: the three rows' display:flex and gap
        // (Wave 5 had to strip them), #season-start-link's display:inline-block
        // (the label pinned to the top of its box), and #event-type-framing's
        // margin shorthand, which beats margin-left:auto and holds that one block
        // 8px left of everything else.
        //
        // display:none STAYS. That is a visibility state the page's own JS owns,
        // not layout.
        // SCOPED TO WHAT THIS SYSTEM ACTUALLY LAYS OUT, and said plainly rather
        // than left to be over-read: the DIRECT CHILDREN of #lobby-screen (the
        // blocks whose width, left edge and gap the system owns) and everything
        // inside a .w-card. Inner spacing deeper than that - a margin on a line
        // inside a hidden context banner, or inside the five-tap organizer panel -
        // is not something this wave positions, and sweeping it would be churn
        // dressed up as a rule.
        const lobby = ADMIN.slice(ADMIN.indexOf('<div class="container" id="lobby-screen">'),
                                 ADMIN.indexOf('<div class="container" id="admin-screen"'));
        assert.ok(lobby.length > 4000, 'the lobby slice collapsed - this would pass on nothing');
        // The elements the system positions: depth-1 tags, plus the card interiors.
        const GOVERNED = (function () {
            const out = [];
            let depth = 0;
            const tagRe = /<(\/?)([a-z][a-z0-9]*)([^>]*)>/gi;
            let mm, inCard = 0;
            while ((mm = tagRe.exec(lobby)) !== null) {
                const closing = mm[1] === '/';
                const attrs = mm[3] || '';
                const selfClose = /\/$/.test(attrs) || /^(input|img|br|hr|meta|link)$/i.test(mm[2]);
                if (!closing) {
                    const isCard = /class="[^"]*\bw-card\b/.test(attrs);
                    if (depth === 1 || inCard > 0 || isCard) out.push(mm[0]);
                    if (!selfClose) { depth++; if (isCard || inCard > 0) inCard++; }
                } else {
                    if (!selfClose) { depth--; if (inCard > 0) inCard--; }
                }
            }
            return out.join('\n');
        })();
        assert.ok(GOVERNED.length > 600,
            'the governed-element slice collapsed to ' + GOVERNED.length + ' chars - it would pass on nothing');
        const LAYOUT = /^\s*(display|margin|margin-left|margin-right|margin-top|margin-bottom|padding|width|max-width|min-width|gap|flex|text-align|justify-content|align-items)\s*:/i;
        const offenders = [];
        const re = /<([a-z]+)([^>]*\bstyle="([^"]*)"[^>]*)>/gi;
        let m;
        while ((m = re.exec(GOVERNED)) !== null) {
            const id = (m[2].match(/id="([^"]+)"/) || [])[1] || '(no id)';
            m[3].split(';').forEach(decl => {
                if (!LAYOUT.test(decl)) return;
                if (/^\s*display\s*:\s*none\s*$/i.test(decl)) return;   // a JS-owned state
                offenders.push('<' + m[1] + ' ' + id + '> ' + decl.trim());
            });
        }
        assert.deepEqual(offenders, [],
            'inline layout beats every rule:\n      ' + offenders.join('\n      '));
    });

    // ---- 6 --------------------------------------------------------------------
    test('6. EVERY PLACEHOLDER AND LABEL FITS ITS OWN CONTENT BOX', () => {
        // Measured against the control's own font, weight, tracking and casing, not
        // estimated from a character count. The two home tiles are excluded BY NAME:
        // their descriptions wrap over three lines on purpose, so a one-line fit
        // test is meaningless there - and my first recon probe reported them
        // "CLIPPED by 259.8px" for exactly that reason.
        const singleLine = M.controls.filter(c => !TILES.test(c.name) && c.label);
        assert.ok(singleLine.length >= 8, 'only ' + singleLine.length + ' controls measured');
        const clipped = singleLine
            .filter(c => c.needs > c.contentW + 0.5)
            .map(c => c.name + ' "' + c.label + '" needs ' + c.needs + ' has ' + c.contentW);
        assert.deepEqual(clipped, [], 'cut off mid-word: ' + clipped.join(', '));
        // And the exclusion is still excluding something real.
        assert.equal(M.controls.filter(c => TILES.test(c.name)).length, 2,
            'the two tiles are gone - that exemption now covers nothing or too much');
    });

    // ---- and the system itself ------------------------------------------------
    test('the three properties are declared once, and the page still fits the phone', () => {
        ['--widget-max', '--widget-pad', '--widget-gap'].forEach(v =>
            assert.equal((ADMIN.match(new RegExp('\\' + v.slice(1) + ':', 'g')) || []).length, 1,
                v + ' is declared more than once, or not at all'));
        assert.equal(M.widgetMax, 320, '--widget-max moved');
        assert.equal(M.scrollW, M.clientW,
            'the page can be dragged sideways: ' + M.scrollW + ' against ' + M.clientW);
    });
});
