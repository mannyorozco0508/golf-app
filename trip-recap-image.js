// ============================================================================
// THE TRIP RECAP AS AN IMAGE (Wave C, 2026-10-08)
//
// Manny: one tap, straight into the iOS share sheet, for the group chat -
// standings, who owes who for the week, awards.
//
// IT IS BUILT FROM THE RENDERED CARD, NOT FROM THE ENGINES AGAIN, and that is
// native-export.js's rule rather than a shortcut: "the PDF is built by reading
// the ALREADY-RENDERED DOM - if the Receipt is wrong, the PDF is wrong in
// exactly the same way, which is the correct failure." A second path to the
// same money is how a $10 Nassau showed $30 live against a Receipt that
// correctly paid $45. So this draws the card the golfer is looking at.
//
// NO LIBRARY. html2canvas would have to be vendored (the artifact CSP forbids a
// CDN and the whole app has to work with no signal), and it is a megabyte to
// rasterise text this app already knows the strings of. The recap is headings
// and two-column rows, so it is drawn with the Canvas 2D API in a few hundred
// lines - the same trade native-export.js made for the PDF.
//
// THREE PARTS, AND ONLY THE MIDDLE ONE NEEDS A BROWSER:
//   tripRecapExtract(cardEl)  reads the card into {head, rows:[{left,right}]}
//   tripRecapModel(blocks)    PURE: where every line goes, and how tall
//   tripRecapDraw(model, cv)  puts it on a canvas
// trip_recap_image_test.js holds the middle one; tools/trip-recap-image-check.js
// taps the real button and decodes the PNG that comes out.
// ============================================================================
'use strict';

// A phone screenshot people pinch to read, so it is drawn at a generous width
// and scaled down by the chat rather than up.
var TRI_WIDTH = 1080;
var TRI_PAD = 56;
var TRI_TITLE = 64;
var TRI_HEAD = 38;
var TRI_ROW = 44;
var TRI_GAP = 26;
var TRI_TOP = 44;
var TRI_BOTTOM = 56;
// The widest a left-hand label may be before it is shortened: the row is two
// columns and the AMOUNT is the half that must never be cut, because it is the
// thing being settled.
var TRI_RIGHT_COL = 300;

function triTrim(text, maxChars) {
    var s = String(text === undefined || text === null ? '' : text);
    if (s.length <= maxChars) return s;
    return s.slice(0, Math.max(1, maxChars - 1)).replace(/[\s→,.-]+$/, '') + '…';
}

// A BLOCKED RECAP IS NOT A RECAP. tripAttributionBlocked() already replaces the
// card with a refusal when two golfers share a name - the money cannot be told
// apart - and drawing that refusal as an image would put it in the group chat
// looking like a result.
function triIsRefusal(blocks) {
    return (blocks || []).some(function (b) {
        return b && b.head && /RECAP NOT SHOWN|NOT SHOWN|⚠/.test(String(b.head));
    });
}

// PURE. Given the card's blocks, decide where every line goes and how tall the
// image is. Returns null rather than an empty canvas: a trip name on a blank
// card is worse in a chat than no image at all.
function tripRecapModel(blocks, opts) {
    var bs = blocks || [];
    if (bs.length === 0) return null;
    if (triIsRefusal(bs)) return null;
    var o = opts || {};
    var width = Number(o.width) || TRI_WIDTH;
    var pad = Number(o.pad) || TRI_PAD;
    // SOMETHING TO SAY, or nothing at all: at least one row somewhere.
    var rowCount = bs.reduce(function (n, b) { return n + ((b && b.rows) || []).length; }, 0);
    if (rowCount === 0) return null;

    var lines = [];
    var y = TRI_TOP;
    bs.forEach(function (b) {
        if (!b) return;
        if (b.title) {
            y += TRI_TITLE;
            lines.push({ kind: 'title', left: String(b.title), x: pad, y: y });
            y += TRI_GAP;
            return;
        }
        if (b.head) {
            y += TRI_GAP;
            y += TRI_HEAD;
            lines.push({ kind: 'head', left: String(b.head), x: pad, y: y });
        }
        ((b.rows) || []).forEach(function (r) {
            y += TRI_ROW;
            var hasRight = r && r.right !== undefined && r.right !== null && String(r.right) !== '';
            // The left column gets whatever the right-hand value does not need.
            var leftRoom = width - pad * 2 - (hasRight ? TRI_RIGHT_COL : 0);
            // ~2.05px per character at the row font size, measured in Chrome on
            // the drawn canvas rather than guessed - the draw step asserts the
            // real measurement and shortens again if a face is wider.
            var maxChars = Math.floor(leftRoom / 20.5);
            lines.push({
                kind: 'row',
                left: triTrim(r && r.left, maxChars),
                right: hasRight ? String(r.right) : null,
                x: pad, y: y,
                rightX: hasRight ? width - pad : undefined
            });
        });
    });
    y += TRI_BOTTOM;
    return { width: width, height: y, pad: pad, lines: lines,
             font: { title: TRI_TITLE, head: TRI_HEAD, row: TRI_ROW } };
}

// ---------------------------------------------------------------------------
// THE DOM HALF. Reads the card into the shape above. Kept separate so the
// layout can be tested without a browser.
// ---------------------------------------------------------------------------
function tripRecapExtract(cardEl) {
    if (!cardEl) return [];
    var out = [];
    var title = cardEl.querySelector('.rc-title');
    if (title) out.push({ title: String(title.innerText || '').trim() });
    var blocks = Array.prototype.slice.call(cardEl.querySelectorAll('.rc-block'));
    blocks.forEach(function (b) {
        var headEl = b.querySelector('.rc-head');
        var head = headEl ? String(headEl.innerText || '').trim() : '';
        var rows = [];
        // EVERY LEAF LINE IN THE BLOCK, in document order, minus the heading.
        // innerText, never textContent: this page keeps its whole application
        // in an inline script, and a hidden row has textContent and no
        // innerText - which is the right answer for a card nobody can see.
        Array.prototype.slice.call(b.children).forEach(function (child) {
            if (child === headEl) return;
            var txt = String(child.innerText || '').replace(/\s+/g, ' ').trim();
            if (!txt) return;
            // A two-column row renders its value in its own element; anything
            // else is one long line and goes in the left column.
            var kids = Array.prototype.slice.call(child.children);
            if (kids.length === 2) {
                rows.push({ left: String(kids[0].innerText || '').replace(/\s+/g, ' ').trim(),
                            right: String(kids[1].innerText || '').replace(/\s+/g, ' ').trim() });
            } else {
                rows.push({ left: txt, right: '' });
            }
        });
        if (head || rows.length) out.push({ head: head, rows: rows });
    });
    return out;
}

// ---------------------------------------------------------------------------
// THE CANVAS. Dark card, light text - what the recap already looks like, and
// what reads on a phone in a group chat.
// ---------------------------------------------------------------------------
function tripRecapDraw(model, canvas, opts) {
    if (!model || !canvas) return null;
    var o = opts || {};
    var scale = Number(o.scale) || 2;
    canvas.width = model.width * scale;
    canvas.height = model.height * scale;
    var g = canvas.getContext('2d');
    if (!g) return null;
    g.scale(scale, scale);
    g.fillStyle = o.bg || '#0f2a22';
    g.fillRect(0, 0, model.width, model.height);
    var FACE = '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
    model.lines.forEach(function (l) {
        if (l.kind === 'title') {
            g.font = '700 44px ' + FACE;
            g.fillStyle = o.title || '#ffffff';
            g.textAlign = 'left';
            g.fillText(l.left, l.x, l.y);
            return;
        }
        if (l.kind === 'head') {
            g.font = '700 24px ' + FACE;
            g.fillStyle = o.head || '#8fd6b4';
            g.textAlign = 'left';
            g.fillText(l.left, l.x, l.y);
            return;
        }
        g.font = '400 30px ' + FACE;
        g.fillStyle = o.text || '#eef5f1';
        g.textAlign = 'left';
        // MEASURED, THEN SHORTENED IF NEEDED. The model estimates from a
        // character count; this is the real face on the real device, so a wider
        // font cannot push a name under the amount.
        var room = (l.rightX !== undefined ? (l.rightX - 300) : (model.width - model.pad)) - l.x;
        var text = l.left;
        while (text.length > 2 && g.measureText(text).width > room) {
            text = text.slice(0, -2) + '…';
        }
        g.fillText(text, l.x, l.y);
        if (l.right) {
            g.font = '700 30px ' + FACE;
            g.fillStyle = o.value || '#ffffff';
            g.textAlign = 'right';
            g.fillText(l.right, l.rightX, l.y);
        }
    });
    return canvas;
}
