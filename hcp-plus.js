// ============================================================================
// THE "+ Plus" CHIP ON EVERY HANDICAP BOX (2.0 (23), ADVISOR-1306, Manny on TestFlight 22: "I'm a plus
// handicap and can't enter it" - the decimal number pad has no "+" key).
//
// One builder for every handicap entry (CLAUDE.md "two entry points means one builder"): while a
// handicap box has the keyboard, a "+ Plus" toggle chip sits right under it (a keyboard accessory -
// it floats, so no row, grid or column of any screen changes). The box keeps its decimal pad.
// On = the box's own value gets a leading "+" ("+2"), off = it is taken away; the box then fires its
// own input and change events, so each screen saves exactly what it already saved for a typed "+2" -
// the format handicap.js parseHcp reads ("+2" -> -2: a plus handicap gives strokes back). Nothing here
// parses, rounds or stores a handicap, and no engine is touched.
//
// The boxes:
//   Profile > Handicap (hp-account-ui.js)        .hpa-edit[data-hpa-editing="hcp"] input
//   Round setup golfer rows (simple-flow.js)      input.sf-thcp
//   Round setup golfer rows (admin.html wizard)   input.p-hcp-input
//   Players sheet / organizer edit (index.html)   input.ps-hcp
//   Trip: add a golfer (trip.html)                #trip-add-hcp
//   Trip builder golfers (trip-builder-ui.js)     input[data-tb-hcp]
// The GPS "Add golfer" sheet (gps-add-golfer.js) already has its own "+" key and is left as it is.
// A box can opt out with data-hcp-plus="off".
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : null;
    var SEL = '.hpa-edit[data-hpa-editing="hcp"] input, input.sf-thcp, input.p-hcp-input, input.ps-hcp, #trip-add-hcp, input[data-tb-hcp]';
    var CSS = ''
        + '#hcp-plus-chip{position:fixed;z-index:2147483600;display:none;min-height:40px;min-width:76px;padding:0 14px;border-radius:999px;'
        + 'border:1.5px solid #1f6f43;background:#ffffff;color:#1f6f43;font:800 15px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
        + 'white-space:nowrap;cursor:pointer;-webkit-appearance:none;appearance:none;box-shadow:0 2px 10px rgba(0,0,0,.25);touch-action:manipulation;}'
        + '#hcp-plus-chip[aria-pressed="true"]{background:#1f6f43;color:#ffffff;}';

    // Pure: the box's value with the plus turned on / off.
    function withPlus(v, on) {
        var s = String(v == null ? '' : v).trim().replace(/^\+\s*/, '');
        return on ? '+' + s : s;
    }
    function isPlus(v) { return /^\s*\+/.test(String(v == null ? '' : v)); }
    function isBox(el) {
        try { return !!(el && el.tagName === 'INPUT' && el.matches(SEL) && el.getAttribute('data-hcp-plus') !== 'off'); } catch (e) { return false; }
    }

    var chip = null, box = null, hideT = null;
    function chipEl() {
        var d = W.document;
        if (chip && d.body.contains(chip)) return chip;
        if (!d.getElementById('hcp-plus-css')) {
            var st = d.createElement('style'); st.id = 'hcp-plus-css'; st.textContent = CSS;
            (d.head || d.documentElement).appendChild(st);
        }
        chip = d.createElement('button');
        chip.type = 'button'; chip.id = 'hcp-plus-chip';
        chip.textContent = '+ Plus';
        chip.setAttribute('aria-label', 'Plus handicap');
        // The keyboard stays up: the chip never takes the focus from the box.
        ['mousedown', 'pointerdown'].forEach(function (ev) { chip.addEventListener(ev, function (e) { e.preventDefault(); }); });
        chip.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            var b = box; if (!b) return;
            b.value = withPlus(b.value, !isPlus(b.value));
            // The screen's own handlers save / mirror it, as for a typed value.
            b.dispatchEvent(new Event('input', { bubbles: true }));
            b.dispatchEvent(new Event('change', { bubbles: true }));
            if (!W.document.body.contains(b)) { hide(); return; }   // the screen repainted its row
            try { b.focus(); var n = b.value.length; b.setSelectionRange(n, n); } catch (err) {}
            show(b);
        });
        d.body.appendChild(chip);
        return chip;
    }
    // Under the box, its right edge on the box's right edge (clear of a hint line, which is left-aligned),
    // kept on screen.
    function place() {
        if (!chip || !box) return;
        var r = box.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) { chip.style.display = 'none'; return; }
        chip.style.display = 'block';
        var w = chip.offsetWidth || 80, vw = W.innerWidth || 375;
        var left = Math.max(6, Math.min(r.right - w, vw - w - 6));
        chip.style.left = Math.round(left) + 'px';
        chip.style.top = Math.round(r.bottom + 6) + 'px';
    }
    function show(b) {
        clearTimeout(hideT);
        box = b;
        var c = chipEl();
        c.setAttribute('aria-pressed', isPlus(b.value) ? 'true' : 'false');
        place();
    }
    function hide() { box = null; if (chip) chip.style.display = 'none'; }

    var api = { withPlus: withPlus, isPlus: isPlus, SELECTOR: SEL };
    if (W && W.document) {
        W.HardPanHcpPlus = api;
        var d = W.document;
        d.addEventListener('focusin', function (e) { if (isBox(e.target)) show(e.target); else if (e.target !== chip) hide(); }, true);
        d.addEventListener('focusout', function (e) {
            if (e.target !== box) return;
            clearTimeout(hideT);
            hideT = setTimeout(function () { if (!box || d.activeElement !== box) hide(); }, 250);
        }, true);
        d.addEventListener('input', function (e) { if (e.target === box && chip) chip.setAttribute('aria-pressed', isPlus(box.value) ? 'true' : 'false'); }, true);
        W.addEventListener('scroll', function () { if (box) place(); }, true);
        W.addEventListener('resize', function () { if (box) place(); });
        try { if (W.visualViewport) W.visualViewport.addEventListener('resize', function () { if (box) place(); }); } catch (e) {}
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
