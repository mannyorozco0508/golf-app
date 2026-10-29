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
// hardpan_range_v1) - { c, yd, by, at } per shot, plus mis: true on a Mishit
// (gps_range_test.js is the guard).
//
// GOOD / MISHIT (URGENT-047, added 7:55 AM - Manny: "I only wanna know how far the good shots
// are"): after each shot (Mark or typed) a one-tap Good / Mishit chip, Good by default. A Mishit
// is kept (greyed in the session list) but left out of the club's median, its longest and
// "Update my bag". Tap or swipe a shot in the list to flip it. The line per club reads
// "Driver · 5 good / 2 mishits · 241 (median of good)"; a club with no good shot reads
// "no good shots yet" and is not written to My bag. Shots saved before this have no mis flag
// and count as good.
//
// API (window.HardPanRange):
//   open(ctx) / close() / isOpen()   ctx = { el, golfer, units(), fix(), flash(t), saved(), openBag() }
//   summarize(shots) -> [{ club, name, n, good, mis, avg, longest }] in bag order (pure);
//                        avg (the median) and longest are of GOOD shots only, null with none
//   clubLine(row, show?) -> "Driver · 5 good / 2 mishits · 241 (median of good)" (pure)
//   bagUpdate(summary) -> { <club>: avg } - what "Update my bag" writes (pure; good shots only)
//   applyToBag(B, golfer, summary) -> the same map, written with B.set
//   sessions(golfer) / current(golfer) / addShot(golfer, club, yd, by) / undo(golfer) / newSession(golfer)
//   setMishit(golfer, i, mis) / flip(golfer, i)   shot i of the session in play -> Good / Mishit
//   carryYds(a, b) -> whole yards between two [lat, lng] (pure; the points are not kept)
//   openHome({ account }) / closeHome() / homeGolfer(account)   Range from HOME, with no round
//   rangeData(B, golfer) / rangeLine(row, show?) / resetPlan(B, golfer, club?) / resetRange(B, golfer, club?)
//                        064-6a: My bag's "Reset range data" (one club) and "Reset all range data" (club omitted)
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
    var CLUBS = ['Dr', '3w', '5w', 'Hy', '3i', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW'];
    var NAMES = { Dr: 'Driver', '3w': '3-wood', '5w': '5-wood', Hy: 'Hybrid', '3i': '3-iron', '4i': '4-iron', '5i': '5-iron', '6i': '6-iron', '7i': '7-iron',
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
    // A shot as kept: exactly these four fields, checked, plus mis: true on a Mishit. Anything else is dropped.
    function cleanShot(s) {
        if (!s || clubs().indexOf(s.c) === -1) return null;
        var yd = okYd(s.yd); if (!yd) return null;
        var o = { c: s.c, yd: yd, by: s.by === 'gps' ? 'gps' : 'typed', at: Math.round(Number(s.at)) || Date.now() };
        if (s.mis === true) o.mis = true;
        return o;
    }
    // No mis flag (every shot saved before Good / Mishit) = a good shot.
    function isMis(s) { return !!(s && s.mis === true); }
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
    // Shot i of the session in play -> Mishit (mis true) or Good (the flag removed).
    function setMishit(golfer, i, mis) {
        var r = lsGet(), g = r.golfers[gKey(golfer)], s = g && g.sessions[g.sessions.length - 1];
        if (!s || s.closed || !s.shots || !s.shots[i]) return null;
        if (mis) s.shots[i].mis = true; else delete s.shots[i].mis;
        return lsSet(r) ? s.shots[i] : null;
    }
    function flip(golfer, i) {
        var cur = current(golfer), s = cur && cur.shots && cur.shots[i];
        return s ? setMishit(golfer, i, !isMis(s)) : null;
    }
    function markApplied(golfer, map) {
        var r = lsGet(), g = r.golfers[gKey(golfer)], s = g && g.sessions[g.sessions.length - 1];
        if (!s) return;
        s.bagAt = Date.now(); s.bag = map;
        lsSet(r);
    }

    // ---- THE NUMBERS (pure) ----------------------------------------------------------
    // Per club, in bag order: shots, good / mishit counts, the AVERAGE carry and the longest. The
    // average is the MEDIAN (Manny, 2026-10-21: one chunked shot must not drag a club's number down),
    // rounded. Both the median and the longest are of GOOD shots only (Manny, 7:55 AM: "I only wanna
    // know how far the good shots are"); with no good shot they are null.
    function summarize(shots) {
        var by = {};
        (shots || []).forEach(function (s) {
            var c = s && s.c, yd = okYd(s && s.yd);
            if (clubs().indexOf(c) === -1 || !yd) return;
            var b = by[c] = by[c] || { good: [], mis: 0 };
            if (isMis(s)) b.mis++; else b.good.push(yd);
        });
        return clubs().filter(function (c) { return by[c]; }).map(function (c) {
            var v = by[c].good, o = v.slice().sort(function (a, b) { return a - b; }), m = o.length >> 1;
            var med = !o.length ? null : o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
            return { club: c, name: nameOf(c), n: v.length + by[c].mis, good: v.length, mis: by[c].mis,
                avg: med === null ? null : Math.round(med), longest: v.length ? Math.max.apply(null, v) : null };
        });
    }
    // "Driver · 5 good / 2 mishits · 241 (median of good)"; no good shot: "... · no good shots yet".
    function clubLine(r, show) {
        if (!r) return '';
        var f = typeof show === 'function' ? show : function (y) { return y; };
        return r.name + ' · ' + r.good + ' good / ' + r.mis + ' mishit' + (r.mis === 1 ? '' : 's') + ' · '
            + (r.good ? f(r.avg) + ' (median of good)' : 'no good shots yet');
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
        Object.keys(map).forEach(function (c) {
            var before = bagSetNow(B, golfer, c), w = wroteFor(golfer, c);
            // 064-6a: what My bag had before Range wrote (a number Range wrote earlier is not "before").
            var prev = w && before === w.yd ? w.prev : before;
            if (B.set(golfer, c, map[c])) { done[c] = map[c]; noteWrote(golfer, c, map[c], prev); }
        });
        return done;
    }

    // ---- RESET RANGE DATA (064-6a, My bag) ---------------------------------------------
    // Manny (Oct 22): "we should be able to reset the stats from the range in club yardages".
    // Range data = the club's shots in this golfer's Range sessions (this file's storage) and the
    // My bag number Range's "Update my bag" wrote. A reset clears ONLY those: a number typed in My
    // bag, the on-course marked shots (gps-shots.js shots, the 049 shot log), Strokes Gained and the
    // setup carries are never touched. The number then falls back to what My bag shows without
    // Range: the number My bag had before Range wrote over it (kept here as wrote[club].prev),
    // else the learned / setup number, else none.
    // WHAT RANGE WROTE: golfers[g].wrote = { <club>: { yd, prev } } (yards only; prev null = none).
    // Older phones (Range used before this) have only the session's bag map: the newest one that
    // wrote the club stands in, with no number before it.
    function bagSetNow(B, golfer, c) {
        try { var v = B && typeof B.bag === 'function' ? B.bag(golfer)[c] : null; return v && v.set ? v.yd : null; } catch (e) { return null; }
    }
    function wroteFor(golfer, c) {
        var g = lsGet().golfers[gKey(golfer)];
        if (!g) return null;
        var w = g.wrote && g.wrote[c];
        if (w && okYd(w.yd)) return { yd: okYd(w.yd), prev: okYd(w.prev) };
        var ss = Array.isArray(g.sessions) ? g.sessions : [];
        for (var i = ss.length - 1; i >= 0; i--) { var y = ss[i] && ss[i].bag ? okYd(ss[i].bag[c]) : null; if (y) return { yd: y, prev: null, old: true }; }
        return null;
    }
    function noteWrote(golfer, c, yd, prev) {
        var r = lsGet(), g = golferRec(r, gKey(golfer));
        g.wrote = g.wrote || {};
        g.wrote[c] = { yd: yd, prev: okYd(prev) };
        lsSet(r);
    }
    // Every Range shot of this golfer, all sessions.
    function allShots(golfer) { var out = []; sessions(golfer).forEach(function (s) { (s.shots || []).forEach(function (x) { out.push(x); }); }); return out; }
    // Per club with Range data: { club, name, n, good, mis, avg, longest, wrote: yd|null, inBag: bool }
    // in bag order. inBag: My bag's number for the club is still the one Range wrote (not typed over).
    function rangeData(B, golfer) {
        var sum = summarize(allShots(golfer)), by = {};
        sum.forEach(function (r) { by[r.club] = r; });
        return clubs().map(function (c) {
            var w = wroteFor(golfer, c), now = bagSetNow(B, golfer, c), r = by[c];
            if (!r && !w) return null;
            var o = r ? r : { club: c, name: nameOf(c), n: 0, good: 0, mis: 0, avg: null, longest: null };
            o.wrote = w ? w.yd : null;
            o.inBag = !!(w && now !== null && now === w.yd);
            return o;
        }).filter(Boolean);
    }
    // "Range · 3 good / 1 mishit · 240 (median of good)" (all sessions); no shots left: "Range · wrote 240".
    function rangeLine(r, show) {
        if (!r) return '';
        var f = typeof show === 'function' ? show : function (y) { return y; };
        if (!r.n) return 'Range' + (r.wrote ? ' · wrote ' + f(r.wrote) : '');
        return clubLine(r, f).replace(r.name, 'Range');
    }
    // What a reset of these clubs would do, read-only: [{ club, name, shots, bagNow, setAfter, bagChanges }].
    // setAfter: the number My bag keeps typed in for the club after (the one before Range), or null.
    function resetPlan(B, golfer, list) {
        var want = list === undefined || list === null ? null : [].concat(list);
        return rangeData(B, golfer).filter(function (r) { return !want || want.indexOf(r.club) !== -1; }).map(function (r) {
            var w = wroteFor(golfer, r.club), now = bagSetNow(B, golfer, r.club);
            return { club: r.club, name: r.name, shots: r.n, bagNow: now, bagChanges: r.inBag, setAfter: r.inBag ? (w.prev || null) : now };
        });
    }
    // THE RESET: club (one) or null / undefined (all). Returns the plan it carried out.
    function resetRange(B, golfer, club) {
        var all = club === undefined || club === null;
        if (!all && clubs().indexOf(club) === -1) return [];
        var plan = resetPlan(B, golfer, all ? null : club);
        if (!plan.length) return plan;
        // My bag first: only a number Range wrote (still there) goes back to the one before it.
        plan.forEach(function (p) { if (p.bagChanges && B && typeof B.set === 'function') B.set(golfer, p.club, p.setAfter); });
        var r = lsGet(), k = gKey(golfer), g = r.golfers[k];
        if (g) {
            if (all) delete r.golfers[k];
            else {
                (g.sessions || []).forEach(function (s) {
                    s.shots = (s.shots || []).filter(function (x) { return x && x.c !== club; });
                    if (s.bag) { delete s.bag[club]; if (!Object.keys(s.bag).length) { delete s.bag; delete s.bagAt; } }
                });
                g.sessions = (g.sessions || []).filter(function (s) { return s.shots && s.shots.length; });
                if (g.wrote) { delete g.wrote[club]; if (!Object.keys(g.wrote).length) delete g.wrote; }
                if (!g.sessions.length && !g.wrote) delete r.golfers[k];
            }
            lsSet(r);
        }
        if (ctx && ctx.golfer === golfer) { st.applied = null; st.start = null; }
        return plan;
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
        if (!Object.keys(done).length) { st.err = 'No good shots yet - nothing to write'; paint(); return; }
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
        var last = shots.length ? shots[shots.length - 1] : null, li = shots.length - 1;
        // The one-tap Good / Mishit chip for the shot just saved (Good by default).
        var q = last ? '<div class="gps-range-q" role="group" aria-label="That shot">'
            + '<button type="button" data-range-q="good" aria-pressed="' + (isMis(last) ? 'false' : 'true') + '">Good</button>'
            + '<button type="button" data-range-q="mis" aria-pressed="' + (isMis(last) ? 'true' : 'false') + '">Mishit</button></div>' : '';
        // Per club: "Driver · 5 good / 2 mishits · 241 (median of good)", then the longest good one.
        var rows = sum.map(function (r) {
            return '<div class="gps-range-line' + (r.good ? '' : ' none') + '" data-range-row="' + r.club + '"><span class="t">' + esc(clubLine(r, shown)) + '</span>'
                + (r.good ? '<span class="lg">longest good ' + shown(r.longest) + '</span>' : '') + '</div>';
        }).join('');
        // Every shot, newest first; a Mishit greyed. Tap or swipe one to flip it.
        var list = shots.map(function (x, i) {
            var mis = isMis(x);
            return '<button type="button" class="gps-range-shot' + (mis ? ' mis' : '') + '" data-range-shot="' + i + '" aria-pressed="' + (mis ? 'true' : 'false') + '" aria-label="'
                + esc(nameOf(x.c) + ' ' + shown(x.yd) + ' ' + unit() + ', ' + (mis ? 'Mishit' : 'Good') + '. Tap to flip.') + '">'
                + '<span class="n">' + esc(nameOf(x.c)) + '</span><span class="y">' + shown(x.yd) + ' ' + unit() + (x.by === 'typed' ? ' · typed' : '') + '</span>'
                + '<span class="k">' + (mis ? 'Mishit' : 'Good') + '</span></button>';
        }).reverse().join('');
        var anyGood = sum.some(function (r) { return r.good > 0; });
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
            + (last ? '<div class="gps-range-last' + (isMis(last) ? ' mis' : '') + '" data-range-last="' + li + '"><span class="w">Last: ' + esc(nameOf(last.c)) + ' · ' + shown(last.yd) + ' ' + unit() + (last.by === 'typed' ? ' (typed)' : '') + '</span>'
                + q + '<button type="button" class="gps-range-undo">Undo</button></div>' : '')
            + '<div class="gps-range-h">THIS SESSION' + (shots.length ? ' · ' + shots.length + ' shot' + (shots.length === 1 ? '' : 's') : '') + '</div>'
            + (rows ? '<div class="gps-range-sum">' + rows + '</div>' : '<div class="gps-range-empty">No shots yet.</div>')
            + (rows ? '<button type="button" class="gps-range-bag"' + (anyGood ? '' : ' disabled') + '>Update my bag</button><div class="gps-range-note">Writes each club’s median of good shots into My bag. Mishits are left out.</div>' : '')
            + applied
            + (list ? '<div class="gps-range-h">SHOTS · tap or swipe one to flip Good / Mishit</div><div class="gps-range-shots">' + list + '</div>' : '')
            + (shots.length ? '<button type="button" class="gps-range-new">New session</button>' : '');
    }
    function flipShot(i, mis) {
        if (!ctx || !(i >= 0)) return;
        var s = mis === undefined ? flip(ctx.golfer, i) : setMishit(ctx.golfer, i, mis);
        if (!s) return;
        st.applied = null; st.err = '';
        paint();
    }
    // SWIPE a shot row sideways to flip it (a tap does the same - easier to find and to test).
    var sw = null, swipedAt = 0;
    function rowOf(t) { return t && t.closest ? t.closest('[data-range-shot]') : null; }
    function onTouchStart(e) {
        var r = rowOf(e.target), t = e.touches && e.touches[0];
        sw = r && t ? { i: Number(r.getAttribute('data-range-shot')), x: t.clientX, y: t.clientY, el: r } : null;
    }
    function onTouchMove(e) {
        var t = e.touches && e.touches[0]; if (!sw || !t) return;
        var dx = t.clientX - sw.x, dy = t.clientY - sw.y;
        if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) { sw.el.style.transform = ''; sw = null; return; }
        sw.el.style.transform = 'translateX(' + Math.max(-60, Math.min(60, dx)) + 'px)';
    }
    function onTouchEnd(e) {
        var t = e.changedTouches && e.changedTouches[0]; if (!sw) return;
        var s = sw; sw = null; s.el.style.transform = '';
        if (!t) return;
        var dx = t.clientX - s.x, dy = t.clientY - s.y;
        if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { swipedAt = Date.now(); flipShot(s.i); }
    }
    function onClick(e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || !ctx) return;
        e.preventDefault(); e.stopPropagation();
        var c = b.getAttribute('data-range-club');
        if (c) { st.club = c; st.err = ''; paint(); return; }
        var q = b.getAttribute('data-range-q');
        if (q) { var cur = current(ctx.golfer); if (cur && cur.shots.length) flipShot(cur.shots.length - 1, q === 'mis'); return; }
        var si = b.getAttribute('data-range-shot');
        if (si !== null) { if (Date.now() - swipedAt > 500) flipShot(Number(si)); return; }
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
            sh.addEventListener('touchstart', onTouchStart, { passive: true });
            sh.addEventListener('touchmove', onTouchMove, { passive: true });
            sh.addEventListener('touchend', onTouchEnd);
            sh.addEventListener('touchcancel', function () { if (sw) { sw.el.style.transform = ''; sw = null; } });
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
        + '#gps-overlay .gps-range-line{padding:7px 0;border-top:1px solid rgba(255,255,255,.08);}'
        + '#gps-overlay .gps-range-line .t{display:block;font:800 15px/1.25 ' + F + ';color:#d9f99d;}'
        + '#gps-overlay .gps-range-line.none .t{color:#a7b3aa;}'
        + '#gps-overlay .gps-range-line .lg{display:block;font:600 12px/1.2 ' + F + ';color:#a7b3aa;margin-top:2px;}'
        + '#gps-overlay .gps-range-last .w{flex:1;min-width:0;}#gps-overlay .gps-range-last.mis .w{color:#8a948c;}'
        + '#gps-overlay .gps-range-q{display:flex;flex:0 0 auto;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.25);}'
        + '#gps-overlay .gps-range-q button{min-height:42px;min-width:60px;border:0;background:transparent;color:#fff;font:800 14px/1 ' + F + ';padding:0 10px;}'
        + '#gps-overlay .gps-range-q button[data-range-q="good"][aria-pressed="true"]{background:#d9f99d;color:#0b0f0c;}'
        + '#gps-overlay .gps-range-q button[data-range-q="mis"][aria-pressed="true"]{background:#5b6360;color:#fff;}'
        + '#gps-overlay .gps-range-shots{display:flex;flex-direction:column;}'
        + '#gps-overlay .gps-range-shot{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:0 4px;border:0;border-top:1px solid rgba(255,255,255,.08);background:transparent;color:#fff;font:700 15px/1.2 ' + F + ';text-align:left;transition:transform .12s;touch-action:pan-y;}'
        + '#gps-overlay .gps-range-shot .n{flex:1;min-width:0;}#gps-overlay .gps-range-shot .y{flex:0 0 auto;}'
        + '#gps-overlay .gps-range-shot .k{flex:0 0 64px;text-align:right;font:800 12px/1 ' + F + ';color:#d9f99d;}'
        + '#gps-overlay .gps-range-shot.mis{color:#7d8780;}#gps-overlay .gps-range-shot.mis .y{text-decoration:line-through;}#gps-overlay .gps-range-shot.mis .k{color:#7d8780;}'
        + '#gps-overlay .gps-range-bag[disabled]{opacity:.45;}'
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
        setMishit: setMishit, flip: flip, isMis: isMis, clubLine: clubLine,
        rangeData: rangeData, rangeLine: rangeLine, resetPlan: resetPlan, resetRange: resetRange, wroteFor: wroteFor,
        openHome: openHome, closeHome: closeHome, homeGolfer: homeGolfer, NAME_KEY: NAME_KEY,
        KEY: KEY, MAX_YD: MAX_YD, SESSION_GAP_MS: SESSION_GAP_MS, state: function () { return { club: st.club, marking: !!st.start, busy: st.busy }; } };
    W.HardPanRange = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
