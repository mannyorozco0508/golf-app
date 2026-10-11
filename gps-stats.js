// ============================================================================
// HARDPAN GPS - MY STATS (gps-features, 2026-10-11)
//
// Per hole, for the golfer this phone is ("This is me" on the scorecard -
// golfapp_me_<round>; or picked here): PUTTS, FAIRWAY (left / hit / right; not
// asked on a par 3) and GREEN IN REGULATION - worked out from the score and the
// putts (score - putts <= par - 2), with an override when that is wrong (a
// chip-in, a putt from off the green). Then this round's summary and the season's
// averages, from every round kept on this phone.
//
// STORED ON THE PHONE ONLY (localStorage hardpan_stats_v1_<round>), until the
// database rules allow the additive fields after the trip (docs/gps-features.md:
// events/<round>/stats/<playerId>/h<n> and player_stats/<uid>/rounds/<round>).
// Nothing here writes to Firebase.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var KEY = 'hardpan_stats_v1_';
    var FW = { L: 'Left', hit: 'Hit', R: 'Right' };

    function lsGet(k) { try { var v = W.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function lsSet(k, v) { try { W.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function meFor(code) { try { return W.localStorage.getItem('golfapp_me_' + code) || null; } catch (e) { return null; } }

    // ---- PURE ------------------------------------------------------------------------
    function strokesOf(round, pid, n) { var v = Number(((round && round.scores) || {})['p' + pid + '_h' + n]); return v > 0 ? v : 0; }
    // GIR from the score: on the green in (par - 2) or fewer = score - putts <= par - 2.
    function girAuto(strokes, putts, par) {
        if (!(strokes > 0) || putts == null || !(par >= 3)) return null;
        return strokes - putts <= par - 2;
    }
    function holeView(rec, n, strokes, par) {
        var h = (rec && rec.holes && rec.holes[n]) || {};
        var auto = girAuto(strokes, h.putts == null ? null : h.putts, par);
        return { putts: h.putts == null ? null : h.putts, fw: par === 3 ? 'na' : (h.fw || null), girAuto: auto,
            girOverride: typeof h.gir === 'boolean' ? h.gir : null, gir: typeof h.gir === 'boolean' ? h.gir : auto, strokes: strokes, par: par };
    }
    // The round: holes with a score count. Fairways: par 4s and 5s with an answer.
    function summary(rec) {
        var s = { holes: 0, strokes: 0, par: 0, putts: 0, puttHoles: 0, fwHit: 0, fwL: 0, fwR: 0, fwChances: 0, gir: 0, girHoles: 0 };
        Object.keys((rec && rec.snap) || {}).forEach(function (n) {
            var x = rec.snap[n], v = holeView(rec, n, x.strokes, x.par);
            if (!(x.strokes > 0)) return;
            s.holes++; s.strokes += x.strokes; s.par += x.par;
            if (v.putts != null) { s.putts += v.putts; s.puttHoles++; }
            if (x.par >= 4 && v.fw && v.fw !== 'na') { s.fwChances++; if (v.fw === 'hit') s.fwHit++; else if (v.fw === 'L') s.fwL++; else if (v.fw === 'R') s.fwR++; }
            if (v.gir != null) { s.girHoles++; if (v.gir) s.gir++; }
        });
        s.toPar = s.strokes - s.par;
        s.puttsPerHole = s.puttHoles ? s.putts / s.puttHoles : null;
        s.fwPct = s.fwChances ? s.fwHit / s.fwChances : null;
        s.girPct = s.girHoles ? s.gir / s.girHoles : null;
        return s;
    }
    // Every round on this phone with at least one scored hole.
    function season() {
        var rounds = [];
        try {
            for (var i = 0; i < W.localStorage.length; i++) {
                var k = W.localStorage.key(i);
                if (k && k.indexOf(KEY) === 0) { var r = lsGet(k); if (r && r.v === 1) { var s = summary(r); if (s.holes) rounds.push({ code: r.code, course: r.course, at: r.at, s: s }); } }
            }
        } catch (e) {}
        var sum = function (f) { return rounds.reduce(function (a, r) { return a + f(r.s); }, 0); };
        var puttHoles = sum(function (s) { return s.puttHoles; }), fwCh = sum(function (s) { return s.fwChances; }), girH = sum(function (s) { return s.girHoles; });
        var full = rounds.filter(function (r) { return r.s.puttHoles >= 18; });
        return {
            rounds: rounds.length,
            puttsPerRound: full.length ? full.reduce(function (a, r) { return a + r.s.putts; }, 0) / full.length : null,
            puttsPerHole: puttHoles ? sum(function (s) { return s.putts; }) / puttHoles : null,
            fwPct: fwCh ? sum(function (s) { return s.fwHit; }) / fwCh : null,
            girPct: girH ? sum(function (s) { return s.gir; }) / girH : null,
            list: rounds.sort(function (a, b) { return (b.at || 0) - (a.at || 0); }),
        };
    }

    // ---- STORAGE -----------------------------------------------------------------------
    function load(code) { var r = lsGet(KEY + code); return r && r.v === 1 ? r : null; }
    // Fresh copy of the scores / pars this phone sees, so the season adds up later.
    function snapshot(rec, ctx) {
        rec.snap = rec.snap || {};
        (ctx.holes || []).forEach(function (h) {
            var st = rec.player ? strokesOf(ctx.round, rec.player, h.n) : 0;
            rec.snap[h.n] = { strokes: st, par: h.par };
        });
        return rec;
    }
    function ensure(ctx) {
        var rec = load(ctx.code) || { v: 1, code: ctx.code, course: ctx.course || '', at: Date.now(), player: null, holes: {} };
        if (!rec.player) rec.player = meFor(ctx.code);
        snapshot(rec, ctx);
        lsSet(KEY + ctx.code, rec);
        return rec;
    }
    function setHole(ctx, n, patch) {
        var rec = ensure(ctx);
        var h = rec.holes[n] = rec.holes[n] || {};
        Object.keys(patch).forEach(function (k) { if (patch[k] === undefined) delete h[k]; else h[k] = patch[k]; });
        lsSet(KEY + ctx.code, rec);
        return rec;
    }
    // A round changed (a score saved): keep the snapshot current - quietly.
    function refresh(ctx) { if (ctx && ctx.code && load(ctx.code)) ensure(ctx); }

    // ---- THE SHEET -----------------------------------------------------------------------
    var sheet = null, cur = null;
    function pct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
    function num(x, d) { return x == null ? '—' : (Math.round(x * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toFixed(d || 0); }
    function el(tag, cls, text) { var e = W.document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(label, on, fn) { var b = el('button', 'gps-st-btn' + (on ? ' gps-st-on' : ''), label); b.type = 'button'; b.onclick = fn; return b; }
    function close() { if (sheet) sheet.style.display = 'none'; cur = null; }
    // ctx: { code, course, hole, par, round, holes: [{ n, par }], players: [{id, name}], host }
    function open(ctx) {
        cur = ctx;
        if (!sheet) {
            sheet = el('div', 'gps-stats-sheet');
            sheet.setAttribute('role', 'dialog');
            sheet.setAttribute('aria-label', 'My stats');
            var st = el('style');
            st.textContent = '.gps-stats-sheet{position:absolute;z-index:60;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;max-height:78%;overflow:auto;border-radius:18px 18px 0 0;padding:12px 16px calc(16px + env(safe-area-inset-bottom));box-sizing:border-box;background:rgba(11,15,12,.96);color:#f4f4ef;font:600 15px/1.3 -apple-system,system-ui,sans-serif;}'
                + '.gps-stats-sheet h3{margin:4px 0 8px;font-size:17px;font-weight:800;}.gps-stats-sheet h4{margin:14px 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#a3e635;}'
                + '.gps-st-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0;}.gps-st-lbl{min-width:76px;color:#cbd5c0;}'
                // #gps-overlay's own button rules are an id selector: match it, or they win.
                + '#gps-overlay .gps-stats-sheet .gps-st-btn,.gps-stats-sheet .gps-st-btn{min-height:44px;min-width:44px;border-radius:12px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.10);color:#fff;font:800 15px/1 -apple-system,system-ui,sans-serif;padding:0 12px;cursor:pointer;}'
                + '#gps-overlay .gps-stats-sheet .gps-st-on,.gps-stats-sheet .gps-st-on{background:#d9f99d;color:#0b0f0c;border-color:#d9f99d;}.gps-st-note{font-size:13px;color:#cbd5c0;}'
                + '.gps-st-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;}.gps-st-grid b{font-size:18px;color:#fff;}';
            sheet.appendChild(st);
            sheet.appendChild(el('div', 'gps-st-body'));
        }
        (ctx.host || W.document.body).appendChild(sheet);
        sheet.style.display = '';
        render();
    }
    function render() {
        if (!sheet || !cur) return;
        var body = sheet.querySelector('.gps-st-body');
        body.textContent = '';
        var rec = ensure(cur), n = String(cur.hole), par = cur.par;
        var head = el('div', 'gps-st-row');
        head.appendChild(el('h3', null, 'My stats · Hole ' + n + ' · Par ' + par));
        var done = btn('Done', true, close); done.style.marginLeft = 'auto'; head.appendChild(done);
        body.appendChild(head);
        // WHO: the golfer this phone is.
        var players = cur.players || [];
        var me = players.filter(function (p) { return String(p.id) === String(rec.player); })[0];
        var who = el('div', 'gps-st-row');
        who.appendChild(el('span', 'gps-st-lbl', 'Golfer'));
        players.forEach(function (p) { who.appendChild(btn(p.name || ('Player ' + p.id), me && String(me.id) === String(p.id), function () { var r = ensure(cur); r.player = String(p.id); snapshot(r, cur); lsSet(KEY + cur.code, r); render(); })); });
        body.appendChild(who);
        if (!me) { body.appendChild(el('div', 'gps-st-note', 'Tap your name to keep your stats.')); return; }
        var strokes = strokesOf(cur.round, me.id, n), v = holeView(rec, n, strokes, par);
        // PUTTS
        var pr = el('div', 'gps-st-row'); pr.appendChild(el('span', 'gps-st-lbl', 'Putts'));
        [0, 1, 2, 3, 4].forEach(function (k) { pr.appendChild(btn(k === 4 ? '4+' : String(k), v.putts === k, function () { setHole(cur, n, { putts: v.putts === k ? undefined : k }); render(); })); });
        body.appendChild(pr);
        // FAIRWAY (not on a par 3)
        var fr = el('div', 'gps-st-row'); fr.appendChild(el('span', 'gps-st-lbl', 'Fairway'));
        if (par === 3) fr.appendChild(el('span', 'gps-st-note', 'n/a on a par 3'));
        else ['L', 'hit', 'R'].forEach(function (k) { fr.appendChild(btn(FW[k], v.fw === k, function () { setHole(cur, n, { fw: v.fw === k ? undefined : k }); render(); })); });
        body.appendChild(fr);
        // GIR: from the score and putts, with an override
        var gr = el('div', 'gps-st-row'); gr.appendChild(el('span', 'gps-st-lbl', 'Green (GIR)'));
        gr.appendChild(btn('Yes', v.gir === true, function () { setHole(cur, n, { gir: v.girAuto === true ? undefined : true }); render(); }));
        gr.appendChild(btn('No', v.gir === false, function () { setHole(cur, n, { gir: v.girAuto === false ? undefined : false }); render(); }));
        gr.appendChild(el('span', 'gps-st-note', v.girOverride != null ? '(set by you)' : (v.girAuto == null ? (strokes ? 'add putts to work it out' : 'from your score + putts') : '(from score ' + strokes + ' + ' + v.putts + ' putts)')));
        body.appendChild(gr);
        // THIS ROUND
        var s = summary(load(cur.code));
        body.appendChild(el('h4', null, 'This round'));
        var g = el('div', 'gps-st-grid');
        [['Holes', s.holes], ['Score', s.holes ? s.strokes + ' (' + (s.toPar > 0 ? '+' : '') + s.toPar + ')' : '—'], ['Putts', s.puttHoles ? s.putts + ' · ' + num(s.puttsPerHole, 2) + '/hole' : '—'],
            ['Fairways', s.fwChances ? s.fwHit + '/' + s.fwChances + ' · ' + pct(s.fwPct) + (s.fwL || s.fwR ? ' (L ' + s.fwL + ' · R ' + s.fwR + ')' : '') : '—'], ['Greens (GIR)', s.girHoles ? s.gir + '/' + s.girHoles + ' · ' + pct(s.girPct) : '—']]
            .forEach(function (x) { var d = el('div'); d.appendChild(el('div', 'gps-st-note', x[0])); d.appendChild(el('b', null, String(x[1]))); g.appendChild(d); });
        body.appendChild(g);
        // THE SEASON
        var ss = season();
        body.appendChild(el('h4', null, 'Season · ' + ss.rounds + ' round' + (ss.rounds === 1 ? '' : 's') + ' on this phone'));
        var g2 = el('div', 'gps-st-grid');
        [['Putts / round', num(ss.puttsPerRound, 1)], ['Putts / hole', num(ss.puttsPerHole, 2)], ['Fairways', pct(ss.fwPct)], ['Greens (GIR)', pct(ss.girPct)]]
            .forEach(function (x) { var d = el('div'); d.appendChild(el('div', 'gps-st-note', x[0])); d.appendChild(el('b', null, String(x[1]))); g2.appendChild(d); });
        body.appendChild(g2);
    }

    W.HardPanGpsStats = { open: open, close: close, refresh: refresh, isOpen: function () { return !!(sheet && sheet.style.display !== 'none' && cur); },
        girAuto: girAuto, holeView: holeView, summary: summary, season: season, load: load, setHole: setHole, ensure: ensure };
})();
