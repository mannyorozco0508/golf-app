// ============================================================================
// HARDPAN GPS - THE "MARK ..." BUTTON (URGENT-045: KP by GPS, Long Drive)
//
// One shared piece for every "Mark my KP" / "Mark my drive" style button on the GPS
// screen. A feature registers ONE button; this file draws it (layout D: beside Mark shot,
// in the same bottom row - no new row, no bubble over the map, URGENT-025), takes the GPS
// reading when it is tapped (the best fix over ~5 s, sooner when one is within 5 yds),
// hands that reading to the feature's measure(), and shows the feature's results sheet.
//
// PRIVACY: the reading is handed to measure() and then dropped. This file stores nothing
// and sends nothing; a feature records DISTANCES (gps_kp_test.js is the guard).
//
// API (window.HardPanMark):
//   button(spec)   register / replace a button. spec:
//     id           'kp', 'ld', ... (one button shows at a time: the first whose when() is true)
//     when(ctx)    -> true on the holes it belongs to
//     label(ctx)   -> the button's text ("⛳ Mark my KP"; a second step: "⛳ Cup is here")
//     measure(pos, ctx) -> what that reading measured, or why not. pos = { pt: [lat, lng], acc (m), at }.
//                  Return { yds, ft, extra } (a finished mark), { pending: 'message' } (a first step,
//                  e.g. the ball before the cup), or { error: 'message' }.
//     onMark(result, ctx)   the finished mark - the feature records it (distances only)
//     count(ctx)   -> a number for the small results button ("≡ 3"), or null for none
//     sheet(ctx)   -> the results sheet's HTML (optional); actions are [data-mark="..."] buttons
//     onAction(action, el, ctx)   a [data-mark] button in the sheet was tapped
//   sync(ctx)      gps-view.js render() calls it on every frame: { el, hole, par, on, fix(), tee,
//                  mid, fairway, savedLine, golfer, eventCode, flash }
//   readFix(done)  the same best-of-5-s reading, for a feature's own use
//   openSheet() / closeSheet() / sheetOpen() / refresh() / tap() / active() / busy()
//   feetInches(meters) -> { yds, ft, in, inches } (pure)
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : null;
    var M_PER_YD = 0.9144, M_PER_IN = 0.0254;
    var GOOD_ACC_M = 5 * M_PER_YD, READ_MS = 5000, STEP_MS = 250;
    var specs = [], ctx = null, st = { hole: null, id: null, busy: false, sheet: false };

    function feetInches(meters) {
        var m = Number(meters), inches = Math.max(0, Math.round(m / M_PER_IN));
        return { yds: Math.round(m / M_PER_YD), ft: Math.floor(inches / 12), in: inches % 12, inches: inches };
    }
    function button(spec) {
        if (!spec || !spec.id) return false;
        specs = specs.filter(function (s) { return s.id !== spec.id; }).concat([spec]);
        paint();
        return true;
    }
    function call(fn, a, b, c) { try { return typeof fn === 'function' ? fn(a, b, c) : null; } catch (e) { return null; } }
    function active() {
        if (!ctx || !ctx.on) return null;
        for (var i = 0; i < specs.length; i++) if (call(specs[i].when, ctx)) return specs[i];
        return null;
    }
    function flash(t) { try { if (ctx && typeof ctx.flash === 'function') ctx.flash(t); else if (typeof uiToast === 'function') uiToast(t); } catch (e) {} }   /* global uiToast */
    // The best fix over READ_MS (the lowest accuracy figure), sooner when one is good enough.
    function readFix(done) {
        var best = null, t0 = Date.now(), c = ctx;
        var take = function () {
            var f = null; try { f = c && typeof c.fix === 'function' ? c.fix() : null; } catch (e) { f = null; }
            if (f && f.pt && isFinite(f.pt[0]) && isFinite(f.pt[1]) && (!best || (Number(f.acc) || 99) < (Number(best.acc) || 99))) best = { pt: [f.pt[0], f.pt[1]], acc: Number(f.acc) || 0, at: f.at || Date.now() };
            if ((best && best.acc <= GOOD_ACC_M) || Date.now() - t0 >= READ_MS) { st.busy = false; paint(); done(best); return; }
            setTimeout(take, STEP_MS);
        };
        st.busy = true; paint();
        take();
    }
    function tap() {
        var s = active();
        if (!s || st.busy) return;
        if (typeof s.canMark === 'function') { var why = call(s.canMark, ctx); if (why) { flash(why); return; } }
        readFix(function (pos) {
            if (!pos) { flash('No GPS position yet'); return; }
            var res = call(s.measure, pos, ctx);
            pos = null;   // the reading is not kept
            if (!res) { paint(); return; }
            if (res.error) { flash(res.error); paint(); return; }
            if (res.pending) { flash(res.pending); paint(); return; }
            call(s.onMark, res, ctx);
            if (typeof s.sheet === 'function') st.sheet = true;
            paint();
        });
    }
    function ensureUi(el) {
        var box = el.querySelector('.gps-markd');
        if (!box) {
            ensureCss();
            box = document.createElement('div');
            box.className = 'gps-markd';
            box.setAttribute('role', 'group');
            box.innerHTML = '<button type="button" class="gps-markd-btn gps-float"></button><button type="button" class="gps-markd-list gps-float">≡</button>';
            var ms = el.querySelector('.gps-ld-bottom .gps-mark-shot') || el.querySelector('.gps-mark-shot');
            if (ms && ms.parentNode) ms.parentNode.insertBefore(box, ms); else el.appendChild(box);
            box.addEventListener('click', function (e) {
                var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b) return;
                e.preventDefault(); e.stopPropagation();
                if (b.classList.contains('gps-markd-list')) { st.sheet = !st.sheet; paint(); return; }
                tap();
            });
        }
        if (!el.querySelector('.gps-markd-sheet')) {
            var sh = document.createElement('div');
            sh.className = 'gps-markd-sheet gps-scroll-ok';
            sh.setAttribute('role', 'dialog');
            sh.style.display = 'none';
            el.appendChild(sh);
            sh.addEventListener('click', function (e) {
                var b = e.target && e.target.closest ? e.target.closest('[data-mark]') : null; if (!b) return;
                e.preventDefault(); e.stopPropagation();
                var a = b.getAttribute('data-mark');
                if (a === 'close') { st.sheet = false; paint(); return; }
                var s = active(); if (s) call(s.onAction, a, b, ctx);
                paint();
            });
        }
        return box;
    }
    function paint() {
        var el = ctx && ctx.el; if (!el || typeof document === 'undefined') return;
        var s = active(), box = el.querySelector('.gps-markd'), sh = el.querySelector('.gps-markd-sheet');
        if (!s) {
            if (box) box.style.display = 'none';
            if (sh) sh.style.display = 'none';
            el.classList.remove('gps-markd-on');
            return;
        }
        if (st.id !== s.id) { st.id = s.id; st.sheet = false; }
        box = ensureUi(el); sh = el.querySelector('.gps-markd-sheet');
        box.style.display = '';
        box.setAttribute('data-id', s.id);
        el.classList.add('gps-markd-on');
        var b = box.querySelector('.gps-markd-btn'), t = st.busy ? 'Reading GPS…' : String(call(s.label, ctx) || 'Mark');
        if (b.textContent !== t) b.textContent = t;
        b.disabled = !!st.busy;
        var n = call(s.count, ctx), lb = box.querySelector('.gps-markd-list');
        lb.style.display = typeof s.sheet === 'function' ? '' : 'none';
        var lt = n ? '≡ ' + n : '≡';
        if (lb.textContent !== lt) lb.textContent = lt;
        lb.setAttribute('aria-label', String(s.listName || 'Results'));
        var ms = el.querySelector('.gps-mark-shot');
        box.classList.toggle('solo', !(ms && ms.style.display !== 'none'));
        if (st.sheet && typeof s.sheet === 'function') {
            var html = String(call(s.sheet, ctx) || '');
            if (sh.__h !== html) { sh.innerHTML = html; sh.__h = html; }
            sh.setAttribute('aria-label', String(s.listName || 'Results'));
            sh.style.display = '';
        } else sh.style.display = 'none';
    }
    function sync(c) {
        ctx = c || null;
        if (!ctx) return;
        var h = Number(ctx.hole);
        if (h !== st.hole) {
            st.hole = h; st.sheet = false;
            specs.forEach(function (s) { call(s.onHole, h, ctx); });
        }
        paint();
    }

    var CSS = ''
        + '#gps-overlay .gps-markd{display:flex;gap:8px;}'
        + '#gps-overlay .gps-markd-btn{flex:1;min-height:52px;border-radius:16px;background:rgba(11,15,12,.95);border:0;color:#ffd54a;font:800 18px/1 -apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;white-space:nowrap;padding:0 10px;}'
        + '#gps-overlay .gps-markd-btn[disabled]{opacity:.7;}'
        + '#gps-overlay .gps-markd-list{width:56px;min-height:52px;border-radius:16px;background:rgba(11,15,12,.95);border:0;color:#f4f4ef;font:800 16px/1 -apple-system,system-ui,sans-serif;}'
        // Layout D: Mark shot and the Mark button share ONE row (no extra row over the map).
        + '#gps-overlay.gps-ld.gps-markd-on .gps-ld-bottom{display:grid;grid-template-columns:1fr 1fr;}'
        + '#gps-overlay.gps-ld.gps-markd-on .gps-ld-bottom > *:not(.gps-markd):not(.gps-mark-shot){grid-column:1 / -1;}'
        + '#gps-overlay.gps-ld.gps-markd-on .gps-ld-bottom .gps-markd.solo{grid-column:1 / -1;}'
        + '#gps-overlay.gps-ld.gps-markd-on .gps-ld-bottom .gps-mark-shot{font-size:16px;}'
        + '#gps-overlay:not(.gps-ld) .gps-markd{position:absolute;z-index:7;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom) + 150px);}'
        + '#gps-overlay .gps-markd-sheet{position:absolute;z-index:30;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom) + 150px);max-height:55%;overflow:auto;-webkit-overflow-scrolling:touch;background:#fff;color:#111;border-radius:18px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.35);font:15px/1.3 -apple-system,system-ui,sans-serif;}'
        + '#gps-overlay .gps-markd-sheet .mk-head{display:flex;justify-content:space-between;align-items:center;font-size:17px;margin-bottom:6px;}'
        + '#gps-overlay .gps-markd-sheet .mk-x{border:0;background:#eee;border-radius:50%;width:32px;height:32px;font-size:15px;}'
        + '#gps-overlay .gps-markd-sheet .mk-note{background:#fff7d6;border-radius:10px;padding:8px 10px;margin-bottom:8px;font-weight:700;}'
        + '#gps-overlay .gps-markd-sheet .mk-now{margin:4px 0 8px;}'
        + '#gps-overlay .gps-markd-sheet .mk-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 0;border-top:1px solid #eee;}'
        + '#gps-overlay .gps-markd-sheet .mk-row.off{color:#777;}'
        + '#gps-overlay .gps-markd-sheet .mk-row .n{font-weight:700;min-width:30%;}'
        + '#gps-overlay .gps-markd-sheet .mk-row .d{flex:1;}'
        + '#gps-overlay .gps-markd-sheet .mk-row small{color:#666;margin-left:4px;}'
        + '#gps-overlay .gps-markd-sheet .mk-tag{font-style:normal;font-size:12px;font-weight:700;border-radius:8px;padding:2px 6px;background:#e7f6e2;color:#1d6b12;margin-left:4px;}'
        + '#gps-overlay .gps-markd-sheet .mk-tag.warn{background:#fde7e2;color:#9a2a12;}'
        + '#gps-overlay .gps-markd-sheet .mk-row .a button,#gps-overlay .gps-markd-sheet .mk-wide{border:0;border-radius:10px;background:#111;color:#fff;font-weight:700;padding:8px 10px;min-height:36px;margin-left:4px;}'
        + '#gps-overlay .gps-markd-sheet .mk-wide{width:100%;margin:8px 0 0;}'
        + '#gps-overlay .gps-markd-sheet .mk-link{border:0;background:none;color:#555;text-decoration:underline;padding:8px 0;font-size:13px;}'
        + '#gps-overlay .gps-markd-sheet .mk-log{font-size:12px;color:#555;margin-top:6px;}'
        + '#gps-overlay .gps-markd-sheet .mk-foot{font-size:12px;color:#666;margin-top:4px;}';
    function ensureCss() {
        if (typeof document === 'undefined' || document.getElementById('gps-markd-css')) return;
        var s = document.createElement('style'); s.id = 'gps-markd-css'; s.textContent = CSS; document.head.appendChild(s);
    }

    var api = {
        button: button, sync: sync, readFix: readFix, tap: tap, feetInches: feetInches,
        refresh: paint, openSheet: function () { st.sheet = true; paint(); }, closeSheet: function () { st.sheet = false; paint(); },
        sheetOpen: function () { return !!st.sheet; }, busy: function () { return !!st.busy; },
        active: function () { var s = active(); return s ? s.id : null; }, context: function () { return ctx; },
        GOOD_ACC_M: GOOD_ACC_M, READ_MS: READ_MS
    };
    if (W) W.HardPanMark = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
