// ============================================================================
// HardPan — THE CUP SCOREBOARD (gps-builder, 2026-10-11). DISPLAY ONLY.
//
// The trip page's running Cup: both teams' totals across EVERY day, the
// captains, and the target ("first to 8½"). It owns no scoring: each round's
// result comes from ryder-cup.js's own computeRyderCupTotals, called as-is with
// every round's scores keyed by the session that round plays (the engine's own
// input shape). Nothing here writes, and no money is involved.
//
// The target and captains come from the trip's builder record (trip-builder.js)
// because the Cup engine has no field for them.
// ============================================================================
(function () {
    'use strict';
    var W = window;
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function pts(x) { x = Math.round(x * 2) / 2; return x % 1 ? (Math.floor(x) || '') + '½' : String(x); }

    // events: { code: roundData } for the trip's rounds.
    function compute(builderCup, events) {
        if (typeof W.computeRyderCupTotals !== 'function') return null;
        var codes = Object.keys(events || {});
        var host = codes.filter(function (c) { return events[c] && events[c].ryderCup; })[0];
        if (!host) return null;
        var bySession = {};
        codes.forEach(function (c) {
            var e = events[c], ref = e && e.ryderCupRef;
            if (!ref || ref.host !== host || !ref.sessionId) return;
            bySession[ref.sessionId] = { courseData: e.courseData || [], scores: e.scores || {}, roundData: e };
        });
        var t = W.computeRyderCupTotals(events[host], bySession);
        if (!t) return null;
        var teams = (builderCup && builderCup.teams) || [];
        var sides = ['A', 'B'].map(function (id, i) {
            var s = t.sides[id] || { name: id, official: 0, projected: 0 };
            return { id: id, name: s.name, captain: teams[i] && teams[i].captain || null, official: s.official, projected: s.projected };
        });
        var toWin = builderCup && builderCup.toWin != null ? Number(builderCup.toWin) : null;
        var winner = toWin != null ? sides.filter(function (s) { return s.official >= toWin; })[0] || null : null;
        return { name: t.name, sides: sides, toWin: toWin, available: t.pointsAvailable, winner: winner,
            sessions: t.sessions.map(function (s) { return { label: s.label, A: s.official.A || 0, B: s.official.B || 0, liveA: s.projected.A || 0, liveB: s.projected.B || 0, matches: s.matches.length, decided: s.matches.filter(function (m) { return m.decided; }).length }; }) };
    }

    function html(r) {
        if (!r) return '';
        var a = r.sides[0], b = r.sides[1];
        var head = '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-weight:800;font-size:1.05rem;">'
            + '<span>' + esc(a.name) + ' ' + pts(a.official) + '</span><span style="opacity:.6;font-size:.8rem;">v</span><span>' + pts(b.official) + ' ' + esc(b.name) + '</span></div>';
        var caps = (a.captain || b.captain) ? '<div class="sp-info">Captains: ' + esc(a.captain || '—') + ' · ' + esc(b.captain || '—') + '</div>' : '';
        var live = (a.projected !== a.official || b.projected !== b.official) ? '<div class="sp-info">Live (matches in play): ' + pts(a.projected) + ' – ' + pts(b.projected) + '</div>' : '';
        var target = r.toWin == null ? '' : r.winner ? '<div style="font-weight:800;color:var(--brand-green);">🏆 ' + esc(r.winner.name) + ' wins the Cup (' + pts(r.winner.official) + ')</div>'
            : '<div class="sp-info">First to ' + pts(r.toWin) + ' wins · ' + esc(a.name) + ' needs ' + pts(Math.max(0, r.toWin - a.official)) + ', ' + esc(b.name) + ' needs ' + pts(Math.max(0, r.toWin - b.official)) + ' · ' + pts(r.available) + ' points in all</div>';
        var rows = r.sessions.map(function (s) { return '<div class="sp-info">' + esc(s.label) + ': ' + pts(s.A) + ' – ' + pts(s.B) + ' (' + s.decided + '/' + s.matches + ' final)</div>'; }).join('');
        return '<div class="settle-card" id="cup-board" style="margin-bottom:12px;"><div style="font-size:.78rem;font-weight:800;opacity:.75;">🏆 ' + esc(r.name) + ' — running total</div>' + head + caps + target + live + rows + '</div>';
    }

    // The trip page: read each of the trip's rounds (live), redraw on any change.
    // One map and one target, so a listener from an earlier render still lands.
    var EVENTS = {}, CUR = { cup: null, mount: null, codes: [] }, subs = {};
    function redraw() {
        if (!CUR.mount) return;
        var ev = {};
        CUR.codes.forEach(function (c) { if (EVENTS[c]) ev[c] = EVENTS[c]; });
        try { CUR.mount.innerHTML = html(compute(CUR.cup, ev)); } catch (e) { CUR.mount.innerHTML = ''; }
    }
    function watch(db, trip, mount) {
        if (!db || !trip || !trip.builder || !trip.builder.cup || !mount) return;
        CUR = { cup: trip.builder.cup, mount: mount, codes: Object.keys(trip.rounds || {}) };
        CUR.codes.forEach(function (c) {
            if (subs[c]) return;
            subs[c] = db.ref('events/' + c);
            subs[c].on('value', function (snap) { EVENTS[c] = snap && snap.val(); redraw(); });
        });
        redraw();
    }
    W.HardPanCupBoard = { compute: compute, html: html, watch: watch, pts: pts };
})();
