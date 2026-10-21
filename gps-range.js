// ============================================================================
// HARDPAN GPS - RANGE MODE (URGENT-047 part A)
//
// GPS tools > Range: pick a club, "Mark" at the ball / mat, then "Mark" where it landed
// (or type the carry). Each shot is kept with its club; the session shows the average and
// the longest carry per club, and "Update my bag" writes the averages into My bag
// (gps-shots.js HardPanGpsBag.set - the same { set: { <club>: yd } } a number typed in My
// bag writes, so My bag shows them as "entered" and the account sync, when it is ever
// switched on, carries them exactly as it carries a typed number).
//
// PRIVACY: DISTANCES ONLY. The GPS reading at the ball is held in memory until the second
// Mark, the yards are worked out, and both readings are dropped. Nothing here stores a
// position or sends anything: the sessions live ON THIS PHONE (localStorage
// hardpan_range_v1) - { club, yd, by, at } per shot (gps_range_test.js is the guard).
//
// API (window.HardPanRange):
//   open(ctx) / close() / isOpen()   ctx = { el, golfer, units(), fix(), flash(t), saved(), openBag() }
//   summarize(shots) -> [{ club, name, n, avg, longest }] in bag order (pure)
//   bagUpdate(summary) -> { <club>: avg } - what "Update my bag" writes (pure)
//   applyToBag(B, golfer, summary) -> the same map, written with B.set
//   sessions(golfer) / current(golfer) / addShot(golfer, club, yd, by) / undo(golfer) / newSession(golfer)
//   carryYds(a, b) -> whole yards between two [lat, lng] (pure; the points are not kept)
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var KEY = 'hardpan_range_v1', MAX_SESSIONS = 20, MAX_SHOTS = 300, SESSION_GAP_MS = 6 * 3600 * 1000;
    var M_PER_YD = 0.9144, MIN_YD = 1, MAX_YD = 449;
    var CLUBS = ['Dr', '3w', '5w', 'Hy', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];
    var NAMES = { Dr: 'Driver', '3w': '3-wood', '5w': '5-wood', Hy: 'Hybrid', '4i': '4-iron', '5i': '5-iron', '6i': '6-iron', '7i': '7-iron',
        '8i': '8-iron', '9i': '9-iron', PW: 'Pitching wedge', GW: 'Gap wedge', SW: 'Sand wedge', LW: 'Lob wedge' };
    function bagApi() { return W.HardPanGpsBag || null; }
    function clubs() { var B = bagApi(); return B && B.BAG ? B.BAG : CLUBS; }
    function nameOf(c) { var B = bagApi(); return (B && B.NAMES && B.NAMES[c]) || NAMES[c] || c; }
    function shortOf(c) { var B = bagApi(); return (B && B.SHORT && B.SHORT[c]) || c; }

    // ---- STORAGE (this phone only; distances only) ---------------------------------
    function lsGet() { try { var v = W.localStorage.getItem(KEY); v = v ? JSON.parse(v) : null; return v && v.v === 1 && v.golfers ? v : { v: 1, golfers: {} }; } catch (e) { return { v: 1, golfers: {} }; } }
    function lsSet(r) { try { W.localStorage.setItem(KEY, JSON.stringify(r)); return true; } catch (e) { return false; } }
    function gKey(name) { var B = bagApi(); if (B && B.golferKey) return B.golferKey(name); var n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' '); return n ? 'n:' + n : 'me'; }
    function okYd(v) { v = Math.round(Number(v)); return isFinite(v) && v >= MIN_YD && v <= MAX_YD ? v : null; }
    // A shot as kept: exactly these four fields, checked. Anything else is dropped.
    function cleanShot(s) {
        if (!s || clubs().indexOf(s.c) === -1) return null;
        var yd = okYd(s.yd); if (!yd) return null;
        return { c: s.c, yd: yd, by: s.by === 'gps' ? 'gps' : 'typed', at: Math.round(Number(s.at)) || Date.now() };
    }
    function golferRec(r, g) { return r.golfers[g] || (r.golfers[g] = { sessions: [] }); }
    function sessions(golfer) { var g = lsGet().golfers[gKey(golfer)]; return g && Array.isArray(g.sessions) ? g.sessions.slice() : []; }
    function lastAt(s) { var t = s.at || 0; (s.shots || []).forEach(function (x) { if (x.at > t) t = x.at; }); return t; }
    // The session in play: the newest one, unless it was closed ("New session") or is from earlier in the day.
    function current(golfer, now) {
        var all = sessions(golfer), s = all[all.length - 1];
        if (!s || s.closed || (now || Date.now()) - lastAt(s) > SESSION_GAP_MS) return null;
        return s;
    }
    function addShot(golfer, club, yd, by, now) {
        now = now || Date.now();
        var shot = cleanShot({ c: club, yd: yd, by: by, at: now });
        if (!shot) return null;
        var r = lsGet(), g = golferRec(r, gKey(golfer)), s = g.sessions[g.sessions.length - 1];
        if (!s || s.closed || now - lastAt(s) > SESSION_GAP_MS) { s = { id: String(now), at: now, shots: [] }; g.sessions.push(s); }
        s.shots = (s.shots || []).concat([shot]).slice(-MAX_SHOTS);
        g.sessions = g.sessions.slice(-MAX_SESSIONS);
        return lsSet(r) ? shot : null;
    }
    function undo(golfer) {
        var r = lsGet(), g = r.golfers[gKey(golfer)], s = g && g.sessions[g.sessions.length - 1];
        if (!s || s.closed || !s.shots || !s.shots.length) return null;
        var gone = s.shots.pop();
        if (!s.shots.length) g.sessions.pop();
        lsSet(r);
        return gone;
    }
    function newSession(golfer) {
        var r = lsGet(), g = r.golfers[gKey(golfer)], s = g && g.sessions[g.sessions.length - 1];
        if (!s || s.closed) return false;
        s.closed = true;
        return lsSet(r);
    }
    function markApplied(golfer, map) {
        var r = lsGet(), g = r.golfers[gKey(golfer)], s = g && g.sessions[g.sessions.length - 1];
        if (!s) return;
        s.bagAt = Date.now(); s.bag = map;
        lsSet(r);
    }

    // ---- THE NUMBERS (pure) ----------------------------------------------------------
    // Per club, in bag order: shots, the AVERAGE carry and the longest. The average is the MEDIAN
    // (Manny, 2026-10-21: one chunked shot must not drag a club's number down), rounded.
    function summarize(shots) {
        var by = {};
        (shots || []).forEach(function (s) {
            var c = s && s.c, yd = okYd(s && s.yd);
            if (clubs().indexOf(c) === -1 || !yd) return;
            (by[c] = by[c] || []).push(yd);
        });
        return clubs().filter(function (c) { return by[c]; }).map(function (c) {
            var v = by[c], o = v.slice().sort(function (a, b) { return a - b; }), m = o.length >> 1;
            var med = o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
            return { club: c, name: nameOf(c), n: v.length, avg: Math.round(med), longest: Math.max.apply(null, v) };
        });
    }
    // What "Update my bag" writes: { <club>: average } - the shape of My bag's set map.
    function bagUpdate(summary) {
        var out = {};
        (summary || []).forEach(function (r) { var y = okYd(r && r.avg); if (y && clubs().indexOf(r.club) !== -1) out[r.club] = y; });
        return out;
    }
    function applyToBag(B, golfer, summary) {
        var map = bagUpdate(summary), done = {};
        if (!B || typeof B.set !== 'function') return done;
        Object.keys(map).forEach(function (c) { if (B.set(golfer, c, map[c])) done[c] = map[c]; });
        return done;
    }
    function carryYds(a, b) {
        var G = W.HardPanGeo;
        if (!a || !b || !G || typeof G.haversineMeters !== 'function') return null;
        var m = G.haversineMeters(a, b);
        return isFinite(m) ? Math.round(m / M_PER_YD) : null;
    }

    // ---- THE SHEET -------------------------------------------------------------------
    var ctx = null, st = { club: null, start: null, busy: false, applied: null, err: '' };
    function call(f, a) { try { return typeof f === 'function' ? f(a) : null; } catch (e) { return null; } }
    function m() { return call(ctx && ctx.units) === 'm'; }
    function shown(yd) { return m() ? Math.round(yd * M_PER_YD) : Math.round(yd); }
    function unit() { return m() ? 'm' : 'yds'; }
    function flash(t) { if (ctx && typeof ctx.flash === 'function') call(ctx.flash, t); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
    function sheet() { return ctx && ctx.el ? ctx.el.querySelector('.gps-range-sheet') : null; }
    function isOpen() { var s = sheet(); return !!(s && s.style.display !== 'none'); }
    // The best GPS reading over ~5 s - the shared HardPanMark.readFix when the GPS screen has
    // handed it a fix getter, else the same idea here. Only the point is handed on; nothing kept.
    function readFix(done) {
        var K = W.HardPanMark;
        if (K && typeof K.readFix === 'function' && K.context && K.context() && typeof K.context().fix === 'function') { K.readFix(done); return; }
        var best = null, t0 = Date.now();
        (function take() {
            var f = call(ctx && ctx.fix);
            if (f && f.pt && isFinite(f.pt[0]) && isFinite(f.pt[1]) && (!best || (Number(f.acc) || 99) < (Number(best.acc) || 99))) best = { pt: [f.pt[0], f.pt[1]], acc: Number(f.acc) || 0 };
            if ((best && best.acc <= 5 * M_PER_YD) || Date.now() - t0 >= 5000) { done(best); return; }
            setTimeout(take, 250);
        })();
    }
    function mark() {
        if (!ctx || st.busy) return;
        if (!st.club) { st.err = 'Pick a club first'; paint(); return; }
        st.busy = true; st.err = ''; paint();
        readFix(function (pos) {
            st.busy = false;
            if (!ctx) return;
            if (!pos || !pos.pt) { st.err = 'No GPS position yet'; paint(); return; }
            if (!st.start) { st.start = [pos.pt[0], pos.pt[1]]; pos = null; paint(); return; }
            var yd = carryYds(st.start, pos.pt);
            st.start = null; pos = null;   // both readings dropped: only the yards go on
            if (!okYd(yd)) { st.err = (yd > MAX_YD ? 'Over ' + MAX_YD + ' yds' : 'Too short') + ' - mark again, or type the carry'; paint(); return; }
            save(yd, 'gps');
        });
    }
    function save(yd, by) {
        var g = ctx && ctx.golfer, s = addShot(g, st.club, yd, by);
        if (!s) { st.err = 'Type a carry from 1 to ' + (m() ? Math.round(MAX_YD * M_PER_YD) : MAX_YD); paint(); return; }
        st.applied = null; st.err = '';
        flash(nameOf(s.c) + ': ' + shown(s.yd) + ' ' + unit());
        paint();
    }
    function typed() {
        var sh = sheet(), i = sh && sh.querySelector('.gps-range-typed');
        if (!i) return;
        if (!st.club) { st.err = 'Pick a club first'; paint(); return; }
        var v = Number(i.value);
        if (!(v > 0)) { st.err = 'Type the carry'; paint(); return; }
        i.value = '';
        st.start = null;
        save(m() ? v / M_PER_YD : v, 'typed');
    }
    function updateBag() {
        var B = bagApi(), cur = ctx && current(ctx.golfer);
        if (!B || !cur) return;
        var done = applyToBag(B, ctx.golfer, summarize(cur.shots));
        if (!Object.keys(done).length) return;
        markApplied(ctx.golfer, done);
        call(ctx.saved);
        st.applied = done;
        flash('My bag updated: ' + Object.keys(done).map(function (c) { return shortOf(c) + ' ' + shown(done[c]); }).join(', '));
        paint();
    }
    function paint() {
        var sh = sheet(); if (!sh || !ctx) return;
        var g = ctx.golfer, cur = current(g), shots = cur ? cur.shots : [], sum = summarize(shots);
        var who = g ? String(g).split(' ')[0] : '';
        var chips = clubs().map(function (c) {
            return '<button type="button" data-range-club="' + c + '" aria-label="' + esc(nameOf(c)) + '" aria-pressed="' + (st.club === c ? 'true' : 'false') + '">' + esc(shortOf(c)) + '</button>';
        }).join('');
        var label = st.busy ? 'Reading GPS…' : st.start ? '📍 Mark where it landed' : '📍 Mark the ball';
        var step = !st.club ? 'Pick a club, then Mark at the ball.' : st.start ? 'Walk to where it landed, then Mark.' : 'Stand at the ball (or the mat) and Mark.';
        var last = shots.length ? shots[shots.length - 1] : null;
        var rows = sum.map(function (r) {
            return '<tr data-range-row="' + r.club + '"><td class="c">' + esc(r.name) + '</td><td>' + r.n + '</td><td class="a">' + shown(r.avg) + '</td><td>' + shown(r.longest) + '</td></tr>';
        }).join('');
        var applied = st.applied ? '<div class="gps-range-done" role="status">✓ My bag updated <button type="button" class="gps-range-openbag">Open My bag</button></div>' : '';
        sh.innerHTML = ''
            + '<div class="gps-range-head"><div class="gps-range-title">Range' + (who ? ' · ' + esc(who) : '') + '</div><button type="button" class="gps-range-x">Done</button></div>'
            + '<div class="gps-range-sub">Carry by club. Distances only, on this phone.</div>'
            + '<div class="gps-range-clubs" role="group" aria-label="Club">' + chips + '</div>'
            + '<div class="gps-range-step">' + esc(step) + '</div>'
            + '<div class="gps-range-markrow"><button type="button" class="gps-range-mark"' + (st.busy ? ' disabled' : '') + '>' + label + '</button>'
            +   (st.start && !st.busy ? '<button type="button" class="gps-range-cancel">Cancel</button>' : '') + '</div>'
            + '<div class="gps-range-typerow"><span>or type the carry</span><input type="number" inputmode="numeric" min="1" max="449" class="gps-range-typed" aria-label="Carry, ' + (m() ? 'meters' : 'yards') + '" placeholder="' + unit() + '"><button type="button" class="gps-range-add">Add</button></div>'
            + (st.err ? '<div class="gps-range-err" role="alert">' + esc(st.err) + '</div>' : '')
            + (last ? '<div class="gps-range-last">Last: ' + esc(nameOf(last.c)) + ' · ' + shown(last.yd) + ' ' + unit() + (last.by === 'typed' ? ' (typed)' : '') + ' <button type="button" class="gps-range-undo">Undo</button></div>' : '')
            + '<div class="gps-range-h">THIS SESSION' + (shots.length ? ' · ' + shots.length + ' shot' + (shots.length === 1 ? '' : 's') : '') + '</div>'
            + (rows ? '<table class="gps-range-sum"><thead><tr><th class="c">Club</th><th>Shots</th><th>Avg</th><th>Longest</th></tr></thead><tbody>' + rows + '</tbody></table>'
                : '<div class="gps-range-empty">No shots yet.</div>')
            + (rows ? '<button type="button" class="gps-range-bag">Update my bag</button><div class="gps-range-note">Writes each club’s average into My bag.</div>' : '')
            + applied
            + (shots.length ? '<button type="button" class="gps-range-new">New session</button>' : '');
    }
    function onClick(e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || !ctx) return;
        e.preventDefault(); e.stopPropagation();
        var c = b.getAttribute('data-range-club');
        if (c) { st.club = c; st.err = ''; paint(); return; }
        var k = b.className;
        if (k === 'gps-range-x') { close(); return; }
        if (k === 'gps-range-mark') { mark(); return; }
        if (k === 'gps-range-cancel') { st.start = null; paint(); return; }
        if (k === 'gps-range-add') { typed(); return; }
        if (k === 'gps-range-undo') { undo(ctx.golfer); st.applied = null; paint(); return; }
        if (k === 'gps-range-bag') { updateBag(); return; }
        if (k === 'gps-range-openbag') { var o = ctx.openBag; close(); call(o); return; }
        if (k === 'gps-range-new') { newSession(ctx.golfer); st.applied = null; st.start = null; paint(); }
    }
    function open(c) {
        if (!c || !c.el || typeof document === 'undefined') return false;
        if (ctx && ctx.golfer !== c.golfer) st = { club: null, start: null, busy: false, applied: null, err: '' };
        ctx = c;
        ensureCss();
        var sh = sheet();
        if (!sh) {
            sh = document.createElement('div');
            sh.className = 'gps-range-sheet gps-float gps-scroll-ok';
            sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', 'Range');
            sh.addEventListener('click', onClick);
            sh.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('gps-range-typed')) { e.preventDefault(); typed(); } });
            c.el.appendChild(sh);
        }
        st.err = ''; st.start = null;
        sh.style.display = '';
        paint();
        return true;
    }
    function close() { st.start = null; st.err = ''; var sh = sheet(); if (sh) sh.style.display = 'none'; }

    var F = '-apple-system,system-ui,sans-serif';
    var CSS = ''
        + '#gps-overlay .gps-range-sheet{position:absolute;z-index:48;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;max-height:85%;overflow:auto;-webkit-overflow-scrolling:touch;border-radius:18px 18px 0 0;padding:12px 16px calc(14px + env(safe-area-inset-bottom));box-sizing:border-box;font:600 14px/1.3 ' + F + ';touch-action:pan-y;}'
        + '#gps-overlay .gps-range-head{display:flex;align-items:center;justify-content:space-between;}#gps-overlay .gps-range-title{font:800 17px/1.15 ' + F + ';}'
        + '#gps-overlay .gps-range-x{min-height:44px;border-radius:12px;background:#d9f99d !important;color:#0b0f0c !important;font:800 15px/1 ' + F + ' !important;padding:0 16px !important;border:0;}'
        + '#gps-overlay .gps-range-sub{font:600 12px/1.3 ' + F + ';color:#c8d1ca;margin:2px 0 8px;}'
        + '#gps-overlay .gps-range-clubs{display:flex;flex-wrap:wrap;gap:6px;}'
        + '#gps-overlay .gps-range-clubs button{flex:0 0 auto;min-height:40px;min-width:44px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:800 15px/1 ' + F + ';padding:0 8px;}'
        + '#gps-overlay .gps-range-clubs button[aria-pressed="true"]{background:#d9f99d;color:#0b0f0c;border-color:#d9f99d;}'
        + '#gps-overlay .gps-range-step{margin:10px 0 6px;color:#c8d1ca;font-size:13px;}'
        + '#gps-overlay .gps-range-markrow{display:flex;gap:8px;}'
        + '#gps-overlay .gps-range-mark{flex:1;min-height:54px;border-radius:16px;border:0;background:#ffd54a;color:#0b0f0c;font:800 18px/1 ' + F + ';}'
        + '#gps-overlay .gps-range-mark[disabled]{opacity:.7;}'
        + '#gps-overlay .gps-range-cancel{min-height:54px;border-radius:16px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;font:700 15px/1 ' + F + ';padding:0 14px;}'
        + '#gps-overlay .gps-range-typerow{display:flex;align-items:center;gap:8px;margin-top:8px;color:#c8d1ca;font-size:13px;}'
        + '#gps-overlay .gps-range-typerow span{flex:1;}'
        + '#gps-overlay .gps-range-typed{width:80px;min-height:42px;box-sizing:border-box;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:800 16px/1 ' + F + ';text-align:center;}'
        + '#gps-overlay .gps-range-add,#gps-overlay .gps-range-undo,#gps-overlay .gps-range-openbag{min-height:42px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:800 14px/1 ' + F + ';padding:0 12px;}'
        + '#gps-overlay .gps-range-err{margin-top:8px;padding:8px 10px;border-radius:10px;background:#7f1d1d;color:#fff;font-weight:700;}'
        + '#gps-overlay .gps-range-last{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-weight:700;}'
        + '#gps-overlay .gps-range-h{margin:12px 0 4px;font:800 11px/1 ' + F + ';letter-spacing:.1em;color:#a7b3aa;}'
        + '#gps-overlay .gps-range-sum{width:100%;border-collapse:collapse;font:700 15px/1.2 ' + F + ';}'
        + '#gps-overlay .gps-range-sum th{font:700 11px/1 ' + F + ';color:#a7b3aa;text-align:right;padding:4px 4px;}'
        + '#gps-overlay .gps-range-sum td{text-align:right;padding:7px 4px;border-top:1px solid rgba(255,255,255,.08);}'
        + '#gps-overlay .gps-range-sum .c{text-align:left;}#gps-overlay .gps-range-sum td.a{color:#d9f99d;font-weight:800;}'
        + '#gps-overlay .gps-range-empty{color:#a7b3aa;padding:6px 0;}'
        + '#gps-overlay .gps-range-bag{display:block;width:100%;margin-top:10px;min-height:48px;border-radius:14px;border:0;background:#d9f99d;color:#0b0f0c;font:800 16px/1 ' + F + ';}'
        + '#gps-overlay .gps-range-note{font-size:12px;color:#a7b3aa;text-align:center;margin-top:4px;}'
        + '#gps-overlay .gps-range-done{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding:6px 10px;border-radius:12px;background:rgba(217,249,157,.15);color:#d9f99d;font-weight:800;}'
        + '#gps-overlay .gps-range-new{display:block;margin:10px auto 0;min-height:44px;padding:0 14px;border:0;background:transparent;color:#c8d1ca;font:700 14px/1 ' + F + ';text-decoration:underline;}';
    function ensureCss() {
        if (typeof document === 'undefined' || document.getElementById('gps-range-css')) return;
        var s = document.createElement('style'); s.id = 'gps-range-css'; s.textContent = CSS; (document.head || document.documentElement).appendChild(s);
    }

    var api = { open: open, close: close, isOpen: isOpen, summarize: summarize, bagUpdate: bagUpdate, applyToBag: applyToBag,
        sessions: sessions, current: current, addShot: addShot, undo: undo, newSession: newSession, carryYds: carryYds,
        KEY: KEY, MAX_YD: MAX_YD, SESSION_GAP_MS: SESSION_GAP_MS, state: function () { return { club: st.club, marking: !!st.start, busy: st.busy }; } };
    W.HardPanRange = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
