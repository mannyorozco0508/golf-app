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
//   openHome({ account }) / closeHome() / homeGolfer(account)   Range from HOME, with no round
//
// FROM HOME (URGENT-047, added 7:20 AM): Home › Range opens this same sheet with NO round. The
// golfer is the phone's own (homeGolfer: who this phone said it was on its newest round - the name
// My bag keeps that golfer's numbers under - else the name typed here once ("Your name",
// localStorage hardpan_my_name), else the account's first name). openHome loads what the GPS page
// would have (gps-geo.js, gps-shots.js HardPanGpsBag, gps-mark-distance.js HardPanMark), watches the
// location only while the sheet is open (the reading kept in memory, dropped on Done), and hands
// HardPanMark a fix getter so Mark goes through HardPanMark.readFix exactly as on the GPS page.
// No round is created, nothing is written to the database; typing the carry works with no GPS.
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
        var applied = st.applied ? '<div class="gps-range-done" role="status">✓ My bag updated' + (typeof ctx.openBag === 'function' ? ' <button type="button" class="gps-range-openbag">Open My bag</button>' : '') + '</div>' : '';
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
    function close() {
        st.start = null; st.err = ''; var sh = sheet(); if (sh) sh.style.display = 'none';
        if (ctx && typeof ctx.onClose === 'function') call(ctx.onClose);
    }

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
    // Home (no #gps-overlay): the same rules under #hp-range, a full screen of its own.
    var HOME_CSS = CSS.replace(/#gps-overlay /g, '#hp-range ')
        + '#hp-range{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147482400;background:#0b0f0c;color:#fff;}'
        + '#hp-range .gps-range-sheet{top:0;max-height:none;border-radius:0;background:#0b0f0c;color:#fff;padding-top:calc(env(safe-area-inset-top) + 12px);}'
        + '#hp-range .hp-range-ask{max-width:520px;margin:0 auto;padding:calc(env(safe-area-inset-top) + 24px) 16px 16px;box-sizing:border-box;font:600 15px/1.35 ' + F + ';}'
        + '#hp-range .hp-range-ask .t{font:800 22px/1.2 ' + F + ';margin-bottom:6px;}#hp-range .hp-range-ask .b{color:#c8d1ca;margin-bottom:14px;}'
        + '#hp-range .hp-range-ask input{display:block;width:100%;box-sizing:border-box;min-height:50px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:700 17px/1 ' + F + ';padding:0 12px;}'
        + '#hp-range .hp-range-ask button{display:block;width:100%;min-height:50px;margin-top:10px;border-radius:14px;border:0;font:800 16px/1 ' + F + ';}'
        + '#hp-range .hp-range-ask .ok{background:#d9f99d;color:#0b0f0c;}#hp-range .hp-range-ask .no{background:transparent;color:#c8d1ca;border:1px solid rgba(255,255,255,.25);}'
        + '#hp-range .hp-range-flash{position:fixed;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom) + 16px);z-index:60;max-width:488px;margin:0 auto;padding:10px 12px;border-radius:12px;background:#d9f99d;color:#0b0f0c;font:800 15px/1.25 ' + F + ';text-align:center;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.4);}';
    function ensureCss() {
        if (typeof document === 'undefined' || document.getElementById('gps-range-css')) return;
        var s = document.createElement('style'); s.id = 'gps-range-css'; s.textContent = CSS + HOME_CSS; (document.head || document.documentElement).appendChild(s);
    }

    // ---- RANGE FROM HOME, WITH NO ROUND (URGENT-047, added 7:20 AM) --------------------------
    var NAME_KEY = 'hardpan_my_name', FIX_STALE_MS = 10000, LOAD_MS = 8000;
    var GEO_OPTS = { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 };
    var home = { watch: null, kind: null, fix: null, gen: 0, flashT: null };
    function lsRead(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
    function cleanName(n) { return String(n == null ? '' : n).replace(/\s+/g, ' ').trim().slice(0, 40); }
    // The phone's own golfer: who this phone said it was on its newest round here ("This is me",
    // golfapp_me_<code>, or the GPS name tag, hardpan_gps_golfer_<code> - the golfer whose My bag the
    // GPS screen showed), else the name typed here once, else the account's first name. '' = ask.
    function homeGolfer(account) {
        var best = null;
        try {
            for (var i = 0; i < W.localStorage.length; i++) {
                var k = W.localStorage.key(i), mm = /^golfapp_snap_v1_(\w+)$/.exec(k || '');
                if (!mm) continue;
                var o = null; try { o = JSON.parse(lsRead(k)); } catch (e) { o = null; }
                var id = lsRead('golfapp_me_' + mm[1]) || lsRead('hardpan_gps_golfer_' + mm[1]);
                var ps = o && o.data && Array.isArray(o.data.players) ? o.data.players : [];
                var p = id == null ? null : ps.filter(function (q) { return q && String(q.id) === String(id); })[0];
                var nm = p ? cleanName(p.name) : '';
                if (nm && (!best || (Number(o.at) || 0) > best.at)) best = { at: Number(o.at) || 0, name: nm };
            }
        } catch (e) {}
        if (best) return best.name;
        var typed = cleanName(lsRead(NAME_KEY));
        if (typed) return typed;
        var a = cleanName(account);
        return a && a.toLowerCase() !== 'me' ? a : '';
    }
    // THE LOCATION, only while Range is open from Home: the newest reading in memory (never stored),
    // dropped when it is 10 s old and when the sheet closes. The app's Geolocation plugin, else the browser's.
    function capGeo() {
        try { var C = W.Capacitor; return C && typeof C.isNativePlatform === 'function' && C.isNativePlatform() && C.Plugins && C.Plugins.Geolocation && typeof C.Plugins.Geolocation.watchPosition === 'function' ? C.Plugins.Geolocation : null; } catch (e) { return null; }
    }
    function geoStart() {
        geoStop();
        var gen = home.gen;
        var onPos = function (p) { if (gen !== home.gen || !p || !p.coords) return; home.fix = { pt: [p.coords.latitude, p.coords.longitude], acc: p.coords.accuracy, at: Date.now() }; };
        var cap = capGeo();
        try {
            if (cap) {
                home.kind = 'cap'; home.watch = 'pending';
                Promise.resolve(cap.watchPosition(GEO_OPTS, function (p, err) { if (!err) onPos(p); })).then(function (id) {
                    if (gen !== home.gen) { try { cap.clearWatch({ id: id }); } catch (e) {} return; }
                    home.watch = id;
                }, function () { if (gen === home.gen) home.watch = null; });
                return;
            }
            var g = typeof navigator !== 'undefined' ? navigator.geolocation : null;
            if (g && typeof g.watchPosition === 'function') { home.kind = 'web'; home.watch = g.watchPosition(onPos, function () {}, GEO_OPTS); }
        } catch (e) {}
    }
    function geoStop() {
        home.gen++; home.fix = null;
        var id = home.watch, kind = home.kind;
        home.watch = null; home.kind = null;
        if (id === null || id === undefined) return;
        try {
            if (kind === 'cap') { var cap = capGeo(); if (cap && id !== 'pending') cap.clearWatch({ id: id }); }
            else if (typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.clearWatch(id);
        } catch (e) {}
    }
    function homeFix() {
        var f = home.fix;
        if (!f || Date.now() - f.at > FIX_STALE_MS) return null;
        return { pt: [f.pt[0], f.pt[1]], acc: f.acc, at: f.at };
    }
    function homeUnits() { return lsRead('hardpan_gps_units') === 'm' ? 'm' : 'yd'; }
    function homeBox() {
        var d = W.document, box = d.getElementById('hp-range');
        if (!box) { box = d.createElement('div'); box.id = 'hp-range'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Range'); d.body.appendChild(box); }
        return box;
    }
    function homeFlash(t) {
        var box = W.document.getElementById('hp-range'); if (!box) return;
        var f = box.querySelector('.hp-range-flash');
        if (!f) { f = W.document.createElement('div'); f.className = 'hp-range-flash'; f.setAttribute('role', 'status'); box.appendChild(f); }
        f.textContent = String(t || ''); f.style.display = '';
        clearTimeout(home.flashT);
        home.flashT = setTimeout(function () { f.style.display = 'none'; }, 2500);
    }
    // What the GPS page would have loaded: the yards math, My bag's store and the shared Mark reading.
    function need(list, done) {
        var left = list.length, d = W.document;
        if (!left) { done(); return; }
        var one = function () { if (--left === 0) done(); };
        list.forEach(function (x) {
            if (x[1]()) { one(); return; }
            var fin = false, sc = d.createElement('script'), end = function () { if (fin) return; fin = true; clearTimeout(t); one(); };
            var t = setTimeout(end, LOAD_MS);
            sc.src = x[0]; sc.async = true; sc.onload = end; sc.onerror = end;
            (d.head || d.documentElement).appendChild(sc);
        });
    }
    function closeHome() {
        geoStop();
        var K = W.HardPanMark;
        if (K && typeof K.context === 'function' && K.context() && K.context().rangeHome && typeof K.sync === 'function') K.sync(null);
        var box = typeof document !== 'undefined' ? document.getElementById('hp-range') : null;
        if (box) box.style.display = 'none';
    }
    function homeRange(box, name) {
        need([['gps-geo.js', function () { return !!W.HardPanGeo; }], ['gps-shots.js', function () { return !!W.HardPanGpsBag; }],
            ['gps-mark-distance.js', function () { return !!W.HardPanMark; }]], function () {
            if (box.style.display === 'none') return;   // closed while loading
            geoStart();
            var K = W.HardPanMark;
            // HardPanMark with no button on Home (on: false): only its best-of-5-s reading, from this fix getter.
            if (K && typeof K.sync === 'function') K.sync({ el: box, on: false, hole: 0, fix: homeFix, flash: homeFlash, rangeHome: true });
            open({ el: box, golfer: name, units: homeUnits, flash: homeFlash, fix: homeFix, onClose: closeHome });
        });
    }
    function askName(box, go) {
        var a = W.document.createElement('div');
        a.className = 'hp-range-ask';
        a.innerHTML = '<div class="t">Your name</div><div class="b">Range keeps your carries and updates My bag under this name, on this phone.</div>'
            + '<input type="text" class="hp-range-name" maxlength="40" autocomplete="given-name" aria-label="Your name" placeholder="Your name">'
            + '<button type="button" class="ok">Continue</button><button type="button" class="no">Cancel</button>';
        box.appendChild(a);
        var i = a.querySelector('input');
        var ok = function () {
            var n = cleanName(i.value);
            if (!n) { i.focus(); return; }
            try { W.localStorage.setItem(NAME_KEY, n); } catch (e) {}
            a.parentNode.removeChild(a);
            go(n);
        };
        a.querySelector('.ok').addEventListener('click', ok);
        a.querySelector('.no').addEventListener('click', function () { a.parentNode.removeChild(a); closeHome(); });
        i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
        try { i.focus(); } catch (e) {}
    }
    function openHome(o) {
        o = o || {};
        if (typeof document === 'undefined' || !document.body) return false;
        ensureCss();
        var box = homeBox();
        box.style.display = '';
        Array.prototype.forEach.call(box.querySelectorAll('.hp-range-ask'), function (n) { n.parentNode.removeChild(n); });
        var sh = box.querySelector('.gps-range-sheet'); if (sh) sh.style.display = 'none';
        var name = homeGolfer(o.account);
        if (name) homeRange(box, name); else askName(box, function (n) { homeRange(box, n); });
        return true;
    }

    var api = { open: open, close: close, isOpen: isOpen, summarize: summarize, bagUpdate: bagUpdate, applyToBag: applyToBag,
        sessions: sessions, current: current, addShot: addShot, undo: undo, newSession: newSession, carryYds: carryYds,
        openHome: openHome, closeHome: closeHome, homeGolfer: homeGolfer, NAME_KEY: NAME_KEY,
        KEY: KEY, MAX_YD: MAX_YD, SESSION_GAP_MS: SESSION_GAP_MS, state: function () { return { club: st.club, marking: !!st.start, busy: st.busy }; } };
    W.HardPanRange = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
