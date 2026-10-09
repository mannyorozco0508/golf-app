// ============================================================================
// GolfApp - QR CODES FOR A ROUND (SHARED CORE, 2026-10-07)
//
// WHAT AN ORGANIZER DOES WITH THIS. Holds the phone up on the first tee. Each
// scorekeeper scans their own group's code and lands on their own card; anyone
// else scans Watch and follows the scores. No link typed, no code read aloud,
// no group chat.
//
// WHY IT IS A SHARED FILE AND NOT TWO COPIES. index.html's Round Menu and
// admin.html's share screen both show these codes. This project has already
// paid for a hand-written copy of one rule in each of two pages - a per-press
// stake that reached the engine and not the screens, and a $10 Nassau that
// showed $30 live against a Receipt that correctly paid $45. So the list of
// codes is built HERE and both pages call it.
//
// THE ONE RULE THAT MATTERS: THE ORGANIZER LINK IS NEVER A QR CODE.
//
// That link carries organizerToken, which grants the whole-field override in
// Finish Round - it can correct any score in the round. Copying it already
// warns ("keep it to yourself"). A QR is worse in kind: it is held up across a
// table, photographed by whoever is standing behind, and printed on paper that
// gets left in a cart. There is no paste step to think twice during.
//
// So this file is never handed the round record. It takes the code, the roster
// and a base URL - the token is not in its inputs, which is a stronger
// statement than a promise not to use it. qrTargetsAreSafe() is the belt, and
// qr_targets_test.js proves it refuses a list that does carry one rather than
// being true of everything.
//
// WATCH IS THE LEADERBOARD, AND THAT WORD IS MEASURED. "Read-only link" has
// been wrong in this app before: the bare ?game=CODE link is fully writable at
// four golfers (76 of 76 inputs) and shows nothing at eight, so it is not a
// read-only link at all. leaderboard.html has no score input at any roster
// size. tools/qr-decode-check.js opens the DECODED Watch URL and counts them,
// so the word stays bound to the behaviour rather than being re-typed.
//
// NO NETWORK, EVER. qr-encode.js is vendored and both files are in the offline
// shell and the native bundle: the code is drawn from the string, on the phone,
// with no signal. Nothing here fetches, and nothing here loads an image.
// ============================================================================
'use strict';

// The base a link is handed out from, with exactly one trailing slash. Callers
// pass shareBaseUrl() (product-links.js), which already keeps the directory so
// a subdirectory or Cloudflare preview deployment hands out links to itself.
function qrBaseUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.charAt(s.length - 1) === '/' ? s : s + '/';
}

// The first names in a group, for the line under its code - so an organizer
// holding the phone up knows which four to call over. golferLabel() lives in
// the pages and may carry a tee chip; this is deliberately just names.
function qrGroupNames(players, b) {
    return (players || []).slice(b.startIdx, b.startIdx + b.size)
        .map(p => String((p && p.name) || '').trim().split(' ')[0])
        .filter(n => n.length > 0)
        .join(', ');
}

// ONE PER SCOREKEEPER GROUP, THEN WATCH.
//
// The group URL is built to the same shape both pages' Copy buttons use -
// index.html?game=CODE&group=N - so the code and the link beside it are the
// same string. A single foursome is not a special case: one group is a group,
// and it gets ?group=1 exactly as the Copy button does.
function qrRoundTargets(opts) {
    const o = opts || {};
    const code = String(o.code || '').trim();
    const players = o.players || [];
    const base = qrBaseUrl(o.baseUrl);
    if (!code) return [];
    const boundaries = (typeof computeGroupBoundaries === 'function')
        ? computeGroupBoundaries(players.length, o.groupSizeOverrides || {})
        : [{ group: 1, startIdx: 0, size: players.length }];
    const out = boundaries.map(b => ({
        key: 'group-' + b.group,
        label: 'Group ' + b.group,
        sub: qrGroupNames(players, b),
        url: base + 'index.html?game=' + encodeURIComponent(code) + '&group=' + b.group
    }));
    out.push({
        key: 'watch',
        label: 'Watch',
        sub: 'Follow the scores — nothing to type in',
        url: base + 'leaderboard.html?game=' + encodeURIComponent(code)
    });
    return out;
}

// THE BELT. Case-insensitive on purpose: a shouted parameter is the same
// parameter, and a guard that only catches the lower-case spelling is the kind
// of guard that reports green while the thing it names walks past.
function qrTargetsAreSafe(list) {
    return !(list || []).some(t => /organizer|token/i.test(String((t && t.url) || '')));
}

// ---------------------------------------------------------------------------
// DRAWING, as a string. The builders above and below touch no DOM, so a test
// can read them without a browser; the CONTROLLER at the bottom of this file
// is the one part that does, and it is here rather than in the pages for the
// same reason the list is: one implementation, two entry points.
//
// SVG rather than canvas, for two reasons measured on a phone: it stays crisp
// at any size (the whole point is a camera reading it from a metre away), and
// it survives a theme switch because the colours are attributes, not pixels.
// The quiet zone is 4 modules, which is what the QR spec requires - a code
// drawn edge to edge is one a scanner will not lock onto.
// ---------------------------------------------------------------------------
function qrSvgFor(text, opts) {
    const o = opts || {};
    if (typeof qrcode !== 'function') return '';
    const dark = o.dark || '#000000';
    const light = o.light || '#ffffff';
    const quiet = (o.quiet === undefined) ? 4 : o.quiet;
    // TYPE 0 IS "PICK THE SMALLEST THAT FITS" and M is the error correction a
    // phone camera wants: it tolerates a thumb over a corner and a crease,
    // without the module count a URL this long would reach at Q or H.
    const qr = qrcode(0, 'M');
    qr.addData(String(text || ''));
    qr.make();
    const n = qr.getModuleCount();
    const size = n + quiet * 2;
    let d = '';
    for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) {
            if (qr.isDark(r, c)) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
        }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '"'
        + ' width="100%" height="100%" shape-rendering="crispEdges" role="img"'
        + ' aria-label="' + String(o.alt || 'QR code').replace(/"/g, '') + '">'
        + '<rect width="' + size + '" height="' + size + '" fill="' + light + '"/>'
        + '<path fill="' + dark + '" d="' + d + '"/></svg>';
}

// ---------------------------------------------------------------------------
// THE FULL-SCREEN SHEET, also as a string, and also shared.
//
// Both pages show the same sheet, so the MARKUP is built here too - not just
// the list. Only the wiring (open, close, swipe) is per page, because that is
// where each page's own event plumbing lives. If the markup were copied into
// two files, the two sheets would drift the way the two Nassau controls did.
//
// ONE SLIDE PER TARGET, all rendered up front. A QR is a few hundred path
// segments and the whole point is to swipe between them on a tee box with no
// signal: rendering on demand would stutter, and rendering them all costs a
// handful of milliseconds once.
// ---------------------------------------------------------------------------
function qrEsc(t) {
    return String(t === undefined || t === null ? '' : t)
        .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function qrSheetHtml(targets, opts) {
    const list = targets || [];
    const o = opts || {};
    if (list.length === 0) return '';
    // THE BELT, AT THE LAST POSSIBLE MOMENT. qrRoundTargets() cannot produce an
    // organizer link, but this function will draw whatever it is handed - so it
    // refuses rather than drawing it. A caller that assembles its own list and
    // slips one in gets nothing on screen instead of a token on a wall.
    if (!qrTargetsAreSafe(list)) return '';
    const slides = list.map((t, i) => '<div class="qr-slide" data-qr-key="' + qrEsc(t.key) + '"'
        + ' role="group" aria-roledescription="slide" aria-label="' + qrEsc(t.label)
        + ' (' + (i + 1) + ' of ' + list.length + ')">'
        + '<div class="qr-art">' + qrSvgFor(t.url, { alt: t.label + ' scan code', dark: o.dark, light: o.light }) + '</div>'
        + '<div class="qr-slide-label">' + qrEsc(t.label) + '</div>'
        + (t.sub ? '<div class="qr-slide-sub">' + qrEsc(t.sub) + '</div>' : '')
        + '</div>').join('');
    const dots = list.map((t, i) => '<span class="qr-dot' + (i === 0 ? ' on' : '') + '"></span>').join('');
    return '<div class="qr-sheet-head">'
        + '<div class="qr-round-name">' + qrEsc(o.roundName || '') + '</div>'
        + (o.courseName ? '<div class="qr-course-name">' + qrEsc(o.courseName) + '</div>' : '')
        + '<button type="button" class="qr-close" aria-label="Close">✕</button>'
        + '</div>'
        + '<div class="qr-track">' + slides + '</div>'
        + '<div class="qr-foot">'
        + '<button type="button" class="qr-arrow qr-prev" aria-label="Previous code">‹</button>'
        + '<div class="qr-dots" aria-hidden="true">' + dots + '</div>'
        + '<button type="button" class="qr-arrow qr-next" aria-label="Next code">›</button>'
        + '</div>'
        + '<div class="qr-hint">'
        + (list.length > 1 ? 'Swipe for the next code' : 'Point a camera at it')
        + '</div>';
}


// ===========================================================================
// THE CONTROLLER - the only part of this file that touches the DOM.
//
// WHY IT IS HERE AND NOT IN THE PAGES. index.html and admin.html both open
// this sheet. A copy in each means two swipe implementations, and the one that
// gets fixed is the one somebody happened to be looking at. Both pages call
// qrOpenSheet() and neither owns any of this.
//
// THE ELEMENT IS CREATED ON FIRST USE and kept, so re-opening is instant and
// no page needs static markup for it. It is appended to <body>, outside every
// other container, because a full-screen sheet inside a transformed or
// scrolling ancestor is positioned against that ancestor and not the screen -
// which is how a "full screen" overlay ends up two thirds of the way down.
// ===========================================================================

var qrSheetState = { el: null, index: 0, count: 0, drag: null };

function qrSheetEl() {
    if (qrSheetState.el && qrSheetState.el.parentNode) return qrSheetState.el;
    var el = document.createElement('div');
    el.className = 'qr-sheet';
    el.id = 'qr-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Scan to join this round');
    document.body.appendChild(el);
    qrSheetState.el = el;
    return el;
}

// WHICH SLIDE IS SHOWING. Translated rather than re-rendered: the codes are
// already drawn, and redrawing on every swipe is what would make it stutter.
function qrShowSlide(i) {
    var el = qrSheetState.el;
    if (!el) return;
    var slides = el.querySelectorAll('.qr-slide');
    if (slides.length === 0) return;
    var n = Math.max(0, Math.min(slides.length - 1, i));
    qrSheetState.index = n;
    for (var k = 0; k < slides.length; k++) {
        slides[k].style.transform = 'translateX(' + ((k - n) * 100) + '%)';
        // A slide that is not the one on screen is not announced and cannot be
        // tabbed into, so a screen reader does not read four codes out.
        slides[k].setAttribute('aria-hidden', k === n ? 'false' : 'true');
    }
    var dots = el.querySelectorAll('.qr-dot');
    for (var d = 0; d < dots.length; d++) dots[d].classList.toggle('on', d === n);
    var prev = el.querySelector('.qr-prev');
    var next = el.querySelector('.qr-next');
    if (prev) prev.disabled = (n === 0);
    if (next) next.disabled = (n === slides.length - 1);
}

// THE FINGER. Horizontal only, and the slop is what keeps a tap a tap: a
// thumb that moves less than 8px has not swiped, so the close button and the
// arrows still work normally. touchmove must preventDefault or the page
// scrolls under the drag on iOS, and a passive listener may not - so move is
// the one non-passive listener here, exactly as the round sheet does it.
function qrBindSwipe(el) {
    if (el.getAttribute('data-qr-bound') === '1') return;
    el.setAttribute('data-qr-bound', '1');
    var track = el.querySelector('.qr-track');
    if (!track) return;
    var SLOP = 8;
    track.addEventListener('touchstart', function (e) {
        if (!e.touches || e.touches.length !== 1) return;
        qrSheetState.drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false, w: track.offsetWidth || 1 };
    }, { passive: true });
    track.addEventListener('touchmove', function (e) {
        var d = qrSheetState.drag;
        if (!d || !e.touches || e.touches.length !== 1) return;
        var dx = e.touches[0].clientX - d.x;
        var dy = e.touches[0].clientY - d.y;
        // A VERTICAL DRAG IS NOT OURS. Without this, trying to scroll the page
        // behind a tall slide dragged the carousel sideways instead.
        if (!d.moved && Math.abs(dy) > Math.abs(dx)) { qrSheetState.drag = null; return; }
        if (Math.abs(dx) < SLOP && !d.moved) return;
        d.moved = true;
        e.preventDefault();
        el.classList.add('dragging');
        var slides = el.querySelectorAll('.qr-slide');
        var pct = (dx / d.w) * 100;
        for (var k = 0; k < slides.length; k++) {
            slides[k].style.transform = 'translateX(' + (((k - qrSheetState.index) * 100) + pct) + '%)';
        }
    }, { passive: false });
    var end = function (e) {
        var d = qrSheetState.drag;
        qrSheetState.drag = null;
        el.classList.remove('dragging');
        if (!d || !d.moved) return;
        var t = (e.changedTouches && e.changedTouches[0]) || null;
        var dx = t ? (t.clientX - d.x) : 0;
        // PAST A THIRD OF THE WIDTH MOVES ON; anything less snaps back where it
        // came from, so a hesitant thumb never half-changes the code on screen.
        if (dx < -d.w / 3) qrShowSlide(qrSheetState.index + 1);
        else if (dx > d.w / 3) qrShowSlide(qrSheetState.index - 1);
        else qrShowSlide(qrSheetState.index);
    };
    track.addEventListener('touchend', end, { passive: true });
    track.addEventListener('touchcancel', end, { passive: true });
}

function qrCloseSheet() {
    var el = qrSheetState.el;
    if (!el) return;
    el.classList.remove('open');
    // The codes are left in place: re-opening the same round is instant, and a
    // sheet that is display:none renders nothing.
    document.removeEventListener('keydown', qrSheetKey);
}

function qrSheetKey(e) {
    if (!qrSheetState.el || !qrSheetState.el.classList.contains('open')) return;
    if (e.key === 'Escape') qrCloseSheet();
    else if (e.key === 'ArrowRight') qrShowSlide(qrSheetState.index + 1);
    else if (e.key === 'ArrowLeft') qrShowSlide(qrSheetState.index - 1);
}

// THE ONE CALL A PAGE MAKES.
//
// It is handed the round's code, roster and base URL - not the round record -
// so the organizer token cannot arrive here even by accident. Returns the
// number of codes shown, which is what a check can read back.
function qrOpenSheet(opts) {
    var o = opts || {};
    var targets = qrRoundTargets(o);
    if (targets.length === 0 || !qrTargetsAreSafe(targets)) return 0;
    var el = qrSheetEl();
    el.innerHTML = qrSheetHtml(targets, { roundName: o.roundName, courseName: o.courseName });
    qrSheetState.count = targets.length;
    var close = el.querySelector('.qr-close');
    if (close) close.onclick = qrCloseSheet;
    var prev = el.querySelector('.qr-prev');
    var next = el.querySelector('.qr-next');
    if (prev) prev.onclick = function () { qrShowSlide(qrSheetState.index - 1); };
    if (next) next.onclick = function () { qrShowSlide(qrSheetState.index + 1); };
    qrBindSwipe(el);
    el.classList.add('open');
    qrShowSlide(0);
    document.addEventListener('keydown', qrSheetKey);
    return targets.length;
}
