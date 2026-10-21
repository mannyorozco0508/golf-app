// ============================================================================
// HARDPAN GPS - LAUNCH MONITOR QUICK ENTRY (URGENT-047 part B, Bushnell Launch Pro)
//
// My bag > "Enter carries from my Bushnell": ONE grid, a row per club in My bag, the golfer
// types the carry the launch monitor showed. "Update my bag" writes the typed carries into
// the EXISTING My bag with gps-shots.js HardPanGpsBag.set - the same { set: { <club>: yd } }
// a number typed in My bag writes (and the same call Range, 047 part A, uses), so My bag
// shows them as "entered" and the account sync (clubsSync, off today) carries them exactly
// as it carries any typed number. A blank row keeps that club's number as it is.
//
// WHY TYPING: the Launch Pro's iPhone app is Foresight Sports' "Foresight" app; its export
// format is not documented anywhere public (see claude-code-reports/047/bushnell/FACTS.md),
// so there is no file import and no screenshot reading here.
//
// PRIVACY: yards only. Nothing is stored here (the numbers go straight into My bag on this
// phone), nothing is sent anywhere, and no Bushnell / Foresight sign-in is ever asked for
// (gps_bushnell_test.js is the guard).
//
// API (window.HardPanLaunchEntry):
//   open(ctx) / close() / isOpen()   ctx = { el, golfer, units(), flash(t), saved(), openBag() }
//   parse(values, metres) -> { carries: { <club>: yd }, bad: [<club>] }   (pure)
//   applyToBag(B, golfer, carries) -> { <club>: yd } written with B.set
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var M_PER_YD = 0.9144, MIN_YD = 1, MAX_YD = 449;
    var CLUBS = ['Dr', '3w', '5w', 'Hy', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];
    var NAMES = { Dr: 'Driver', '3w': '3-wood', '5w': '5-wood', Hy: 'Hybrid', '4i': '4-iron', '5i': '5-iron', '6i': '6-iron', '7i': '7-iron',
        '8i': '8-iron', '9i': '9-iron', PW: 'Pitching wedge', GW: 'Gap wedge', SW: 'Sand wedge', LW: 'Lob wedge' };
    function bagApi() { return W.HardPanGpsBag || null; }
    function clubs() { var B = bagApi(); return B && B.BAG ? B.BAG : CLUBS; }
    function nameOf(c) { var B = bagApi(); return (B && B.NAMES && B.NAMES[c]) || NAMES[c] || c; }
    function shortOf(c) { var B = bagApi(); return (B && B.SHORT && B.SHORT[c]) || c; }

    // ---- PURE ----------------------------------------------------------------------
    // values: { <club>: what was typed }. Blank = keep My bag's number (left out). A number in
    // meters when metres is true. Anything not 1-449 yds (or not a number) is "bad".
    function parse(values, metres) {
        var carries = {}, bad = [];
        clubs().forEach(function (c) {
            var raw = values ? values[c] : null;
            var t = raw == null ? '' : String(raw).trim().replace(/\s*(yds?|yards?|m)$/i, '');
            if (t === '') return;
            var v = Number(t);
            if (!isFinite(v) || v <= 0) { bad.push(c); return; }
            var yd = Math.round(metres ? v / M_PER_YD : v);
            if (yd < MIN_YD || yd > MAX_YD) { bad.push(c); return; }
            carries[c] = yd;
        });
        return { carries: carries, bad: bad };
    }
    function applyToBag(B, golfer, carries) {
        var done = {};
        if (!B || typeof B.set !== 'function') return done;
        Object.keys(carries || {}).forEach(function (c) { if (clubs().indexOf(c) !== -1 && B.set(golfer, c, carries[c])) done[c] = carries[c]; });
        return done;
    }

    // ---- THE SHEET -------------------------------------------------------------------
    var ctx = null, st = { values: {}, bad: [], done: null, err: '' };
    function call(f, a) { try { return typeof f === 'function' ? f(a) : null; } catch (e) { return null; } }
    function m() { return call(ctx && ctx.units) === 'm'; }
    function shown(yd) { return m() ? Math.round(yd * M_PER_YD) : Math.round(yd); }
    function unit() { return m() ? 'm' : 'yds'; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
    function sheet() { return ctx && ctx.el ? ctx.el.querySelector('.gps-lm') : null; }
    function isOpen() { var s = sheet(); return !!(s && s.style.display !== 'none'); }
    function readInputs() {
        var sh = sheet(); if (!sh) return;
        Array.prototype.forEach.call(sh.querySelectorAll('[data-lm-club]'), function (i) { st.values[i.getAttribute('data-lm-club')] = i.value; });
    }
    function update() {
        readInputs();
        var B = bagApi(); if (!B || !ctx) return;
        var p = parse(st.values, m());
        st.bad = p.bad; st.done = null;
        if (p.bad.length) { st.err = 'Check ' + p.bad.map(shortOf).join(', ') + ': a carry from 1 to ' + (m() ? Math.round(MAX_YD * M_PER_YD) : MAX_YD) + ' ' + unit(); paint(); return; }
        if (!Object.keys(p.carries).length) { st.err = 'Type at least one carry'; paint(); return; }
        var done = applyToBag(B, ctx.golfer, p.carries);
        if (!Object.keys(done).length) { st.err = 'My bag could not be saved on this phone'; paint(); return; }
        call(ctx.saved);
        st.err = ''; st.done = done; st.values = {};
        call(ctx.flash, 'My bag updated: ' + Object.keys(done).map(function (c) { return shortOf(c) + ' ' + shown(done[c]); }).join(', '));
        paint();
    }
    function paint() {
        var sh = sheet(); if (!sh || !ctx) return;
        var B = bagApi(), mine = B && typeof B.bag === 'function' ? B.bag(ctx.golfer) : {};
        var who = ctx.golfer ? String(ctx.golfer).split(' ')[0] : '';
        var rows = clubs().map(function (c) {
            var v = mine[c], now = v ? shown(v.yd) + (B.source ? ' · ' + B.source(v) : '') : '—';
            var val = st.values[c] != null ? st.values[c] : '';
            return '<div class="gps-lm-row' + (st.bad.indexOf(c) !== -1 ? ' gps-lm-bad' : '') + '" data-lm-row="' + c + '">'
                + '<span class="gps-lm-name">' + esc(nameOf(c)) + '</span>'
                + '<span class="gps-lm-now" data-lm-now="' + c + '">' + esc(now) + '</span>'
                + '<input type="number" inputmode="decimal" min="1" max="449" class="gps-lm-yd" data-lm-club="' + c + '" value="' + esc(val) + '" placeholder="' + unit()
                +   '" aria-label="' + esc(nameOf(c)) + ' carry from the launch monitor, ' + (m() ? 'meters' : 'yards') + '"></div>';
        }).join('');
        var done = st.done ? '<div class="gps-lm-done" role="status">✓ My bag updated: ' + esc(Object.keys(st.done).map(function (c) { return shortOf(c) + ' ' + shown(st.done[c]); }).join(', '))
            + ' <button type="button" class="gps-lm-openbag">Open My bag</button></div>' : '';
        sh.innerHTML = ''
            + '<div class="gps-lm-head"><div class="gps-lm-title">Launch monitor carries' + (who ? ' · ' + esc(who) : '') + '</div><button type="button" class="gps-lm-x">Done</button></div>'
            + '<div class="gps-lm-sub">Type the CARRY your Bushnell showed for each club (' + unit() + '). Leave a club blank to keep its number. On this phone only - no Bushnell sign-in.</div>'
            + '<div class="gps-lm-cols"><span class="gps-lm-name">Club</span><span class="gps-lm-now">My bag now</span><span class="gps-lm-yd-h">Carry</span></div>'
            + '<div class="gps-lm-grid">' + rows + '</div>'
            + (st.err ? '<div class="gps-lm-err" role="alert">' + esc(st.err) + '</div>' : '')
            + done
            + '<button type="button" class="gps-lm-save">Update my bag</button>'
            + '<div class="gps-lm-note">Each typed carry becomes that club’s number in My bag (“entered”).</div>';
    }
    function onClick(e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || !ctx) return;
        e.preventDefault(); e.stopPropagation();
        var k = b.className;
        if (k === 'gps-lm-x') { close(); return; }
        if (k === 'gps-lm-save') { update(); return; }
        if (k === 'gps-lm-openbag') { var o = ctx.openBag; close(); call(o); }
    }
    function open(c) {
        if (!c || !c.el || typeof document === 'undefined') return false;
        if (!ctx || ctx.golfer !== c.golfer) st = { values: {}, bad: [], done: null, err: '' };
        ctx = c;
        ensureCss();
        var sh = sheet();
        if (!sh) {
            sh = document.createElement('div');
            sh.className = 'gps-lm gps-float gps-scroll-ok';
            sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', 'Launch monitor carries');
            sh.addEventListener('click', onClick);
            // Return in a box goes to the next club's box (the last one: Update my bag).
            sh.addEventListener('keydown', function (e) {
                if (e.key !== 'Enter' || !e.target || !e.target.getAttribute || !e.target.getAttribute('data-lm-club')) return;
                e.preventDefault();
                var all = Array.prototype.slice.call(sh.querySelectorAll('[data-lm-club]')), i = all.indexOf(e.target);
                if (i >= 0 && i < all.length - 1) all[i + 1].focus(); else update();
            });
            c.el.appendChild(sh);
        }
        st.err = ''; st.bad = []; st.done = null;
        sh.style.display = '';
        paint();
        return true;
    }
    function close() { readInputs(); st.err = ''; var sh = sheet(); if (sh) sh.style.display = 'none'; }

    var F = '-apple-system,system-ui,sans-serif';
    var CSS = ''
        + '#gps-overlay .gps-lm{position:absolute;z-index:48;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;max-height:88%;overflow:auto;-webkit-overflow-scrolling:touch;border-radius:18px 18px 0 0;padding:12px 16px calc(14px + env(safe-area-inset-bottom));box-sizing:border-box;font:600 14px/1.3 ' + F + ';touch-action:pan-y;}'
        + '#gps-overlay .gps-lm-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}#gps-overlay .gps-lm-title{font:800 17px/1.15 ' + F + ';}'
        + '#gps-overlay .gps-lm-x{min-height:44px;border-radius:12px;background:#d9f99d !important;color:#0b0f0c !important;font:800 15px/1 ' + F + ' !important;padding:0 16px !important;border:0;}'
        + '#gps-overlay .gps-lm-sub{font:600 12px/1.3 ' + F + ';color:#c8d1ca;margin:4px 0 8px;}'
        + '#gps-overlay .gps-lm-cols{display:flex;align-items:center;gap:8px;font:700 11px/1 ' + F + ';letter-spacing:.06em;text-transform:uppercase;color:#a7b3aa;padding:0 0 4px;}'
        + '#gps-overlay .gps-lm-row{display:flex;align-items:center;gap:8px;padding:4px 0;border-top:1px solid rgba(255,255,255,.08);}'
        + '#gps-overlay .gps-lm-name{flex:1 1 auto;font:700 15px/1.2 ' + F + ';}#gps-overlay .gps-lm-cols .gps-lm-name{font:inherit;}'
        + '#gps-overlay .gps-lm-now{flex:0 0 92px;font:600 12px/1.2 ' + F + ';color:#a7b3aa;}'
        + '#gps-overlay .gps-lm-yd-h{flex:0 0 72px;text-align:center;}'
        + '#gps-overlay .gps-lm-yd{flex:0 0 72px;width:72px;min-height:42px;box-sizing:border-box;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:800 17px/1 ' + F + ';text-align:center;}'
        + '#gps-overlay .gps-lm-bad .gps-lm-yd{border-color:#f87171;background:rgba(248,113,113,.18);}'
        + '#gps-overlay .gps-lm-err{margin-top:8px;padding:8px 10px;border-radius:10px;background:#7f1d1d;color:#fff;font-weight:700;}'
        + '#gps-overlay .gps-lm-done{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:8px;padding:6px 10px;border-radius:12px;background:rgba(217,249,157,.15);color:#d9f99d;font-weight:800;}'
        + '#gps-overlay .gps-lm-openbag{min-height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:800 14px/1 ' + F + ';padding:0 12px;}'
        + '#gps-overlay .gps-lm-save{display:block;width:100%;margin-top:10px;min-height:50px;border-radius:14px;border:0;background:#d9f99d;color:#0b0f0c;font:800 17px/1 ' + F + ';}'
        + '#gps-overlay .gps-lm-note{font-size:12px;color:#a7b3aa;text-align:center;margin-top:4px;}';
    function ensureCss() {
        if (typeof document === 'undefined' || document.getElementById('gps-lm-css')) return;
        var s = document.createElement('style'); s.id = 'gps-lm-css'; s.textContent = CSS; (document.head || document.documentElement).appendChild(s);
    }

    var api = { open: open, close: close, isOpen: isOpen, parse: parse, applyToBag: applyToBag, ensureCss: ensureCss, MAX_YD: MAX_YD };
    W.HardPanLaunchEntry = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
