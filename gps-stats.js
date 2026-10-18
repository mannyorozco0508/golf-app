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

    // ============================================================================
    // QUICK STATS ON THE SCORECARD (008, HardPanFeature('quickStats'); part of GPS Map)
    //
    // Per golfer per hole, one tap each under the golfer's score box: PUTTS (0, 1, 2,
    // 3, 4+), FAIRWAY (left / hit / right - par 4s and 5s only) and GREEN IN
    // REGULATION, worked out from the score and the putts (score - putts <= par - 2).
    // The shape is the one a round would hold - events/<code>/stats/p<id>_h<n> =
    // { putts, fw, gir } - but the live rules (phase 1) refuse that child to anyone
    // but the round's owner, so it is KEPT ON THIS PHONE ONLY, one record per round
    // per golfer: localStorage hardpan_qstats_v1_<code>_p<id>. Nothing here writes to
    // Firebase, and nothing here is read by a money engine.
    //
    // A record also holds a copy of that golfer's scores and the card's pars (snap),
    // so My stats adds up later - on Home, with no round loaded. The golfer this phone
    // IS for a round (me: true) is set by the scorecard (index.html qsSync).
    // ============================================================================
    var QKEY = 'hardpan_qstats_v1_';
    function qKey(code, pid) { return QKEY + code + '_p' + pid; }
    function qLoad(code, pid) { var r = lsGet(qKey(code, pid)); return r && r.v === 1 ? r : null; }
    function qNew(ctx, pid) { return { v: 1, code: String(ctx.code), pid: String(pid), course: ctx.course || '', at: Date.now(), holes: {}, snap: {} }; }
    // 4 means "4+".
    function qPutts(v) { var n = Number(v); return v == null || v === '' || !isFinite(n) || n < 0 ? null : Math.min(4, Math.floor(n)); }
    function fwAsked(par) { return Number(par) >= 4; }
    // { putts, fw, gir } for one hole, recomputing GIR from the score it is given.
    function qCell(h, strokes, par) {
        h = h || {};
        var putts = h.putts == null ? null : h.putts;
        var gir = girAuto(Number(strokes) || 0, putts, Number(par));
        return { putts: putts, fw: fwAsked(par) ? (h.fw || null) : null, gir: gir };
    }
    function qHole(code, pid, n, strokes, par) { var r = qLoad(code, pid); return qCell(r && r.holes[String(n)], strokes, par); }
    // ctx: { code, course }. patch: { putts } or { fw } - null / undefined clears it.
    function qSet(ctx, pid, n, patch, strokes, par) {
        var rec = qLoad(ctx.code, pid) || qNew(ctx, pid);
        n = String(n);
        var h = rec.holes[n] || {};
        if ('putts' in patch) { var p = qPutts(patch.putts); if (p == null) delete h.putts; else h.putts = p; }
        if ('fw' in patch) { if (fwAsked(par) && FW[patch.fw]) h.fw = patch.fw; else delete h.fw; }
        var g = girAuto(Number(strokes) || 0, h.putts == null ? null : h.putts, Number(par));
        if (g == null) delete h.gir; else h.gir = g;
        if (Number(strokes) > 0) rec.snap[n] = { s: Number(strokes), par: Number(par) };
        if (Object.keys(h).length) rec.holes[n] = h; else delete rec.holes[n];
        lsSet(qKey(ctx.code, pid), rec);
        return qCell(h, strokes, par);
    }
    // The round as this phone sees it: the golfer this phone is (meId) gets a record (so
    // a round with no stats still counts toward the scoring average); every golfer who
    // already has one gets their scores copied and GIR worked out again.
    // ctx: { code, course, round: { players, scores }, holes: [{ n, par }] }
    function qSync(ctx, meId) {
        if (!ctx || !ctx.code) return;
        var round = ctx.round || {};
        (round.players || []).forEach(function (p) {
            var mine = meId != null && String(p.id) === String(meId);
            var rec = qLoad(ctx.code, p.id);
            if (!rec && !mine) return;
            rec = rec || qNew(ctx, p.id);
            var was = JSON.stringify(rec);
            rec.me = mine;
            if (ctx.course) rec.course = ctx.course;
            rec.snap = {};
            (ctx.holes || []).forEach(function (h) { rec.snap[String(h.n)] = { s: strokesOf(round, p.id, h.n), par: Number(h.par) || 0 }; });
            Object.keys(rec.holes).forEach(function (n) {
                var x = rec.snap[n], h = rec.holes[n];
                var g = x ? girAuto(x.s, h.putts == null ? null : h.putts, x.par) : null;
                if (g == null) delete h.gir; else h.gir = g;
            });
            if (JSON.stringify(rec) !== was) lsSet(qKey(ctx.code, p.id), rec);
        });
    }

    // ---- MY STATS (pure) ------------------------------------------------------------
    // One round for the golfer: { code, at, holes: { n: { putts, fw } }, snap: { n: { s, par } } }.
    // Rounds count when the golfer has a score; the newest `last` of them are the window.
    //   rounds          rounds in the window
    //   scoringAvg      mean total of the window's COMPLETE 18-hole rounds (own scores)
    //   par3/4/5        mean score on every scored par 3 / 4 / 5 in the window
    //   statRounds      rounds in the window with any putts or fairway entered - only
    //                   they count toward putts, FIR and GIR
    //   puttsPerHole    putts / holes with putts entered (and a score)
    //   puttsPerRound   puttsPerHole x 18 (an 18-hole round's worth, so a round with a
    //                   hole or two skipped still counts)
    //   firPct          fairways hit / fairways answered (par 4s and 5s)
    //   girPct          greens hit / holes with a score and putts
    function aggregate(rounds, last) {
        var list = (rounds || []).filter(function (r) { return r && Object.keys(r.snap || {}).some(function (n) { return r.snap[n].s > 0; }); })
            .sort(function (a, b) { return (b.at || 0) - (a.at || 0); }).slice(0, last || 5);
        var o = { rounds: list.length, statRounds: 0, full: 0, scoringAvg: null, puttsPerHole: null, puttsPerRound: null, firPct: null, girPct: null, par3: null, par4: null, par5: null,
            fir: 0, firOf: 0, gir: 0, girOf: 0, putts: 0, puttHoles: 0 };
        var tot = 0, byPar = { 3: [0, 0], 4: [0, 0], 5: [0, 0] };
        list.forEach(function (r) {
            var holes = r.holes || {}, keys = Object.keys(r.snap || {}), sum = 0, scored = 0;
            keys.forEach(function (n) {
                var x = r.snap[n];
                if (!(x.s > 0)) return;
                scored++; sum += x.s;
                if (byPar[x.par]) { byPar[x.par][0] += x.s; byPar[x.par][1]++; }
            });
            if (keys.length === 18 && scored === 18) { o.full++; tot += sum; }
            var hasStats = Object.keys(holes).some(function (n) { return holes[n] && (holes[n].putts != null || holes[n].fw); });
            if (!hasStats) return;
            o.statRounds++;
            Object.keys(holes).forEach(function (n) {
                var h = holes[n] || {}, x = r.snap[n] || null, par = x ? x.par : 0;
                if (h.fw && FW[h.fw] && (!x || fwAsked(par))) { o.firOf++; if (h.fw === 'hit') o.fir++; }
                if (h.putts == null || !x || !(x.s > 0)) return;
                o.putts += h.putts; o.puttHoles++;
                var g = girAuto(x.s, h.putts, par);
                if (g != null) { o.girOf++; if (g) o.gir++; }
            });
        });
        if (o.full) o.scoringAvg = tot / o.full;
        [3, 4, 5].forEach(function (p) { if (byPar[p][1]) o['par' + p] = byPar[p][0] / byPar[p][1]; });
        if (o.puttHoles) { o.puttsPerHole = o.putts / o.puttHoles; o.puttsPerRound = o.puttsPerHole * 18; }
        if (o.firOf) o.firPct = o.fir / o.firOf;
        if (o.girOf) o.girPct = o.gir / o.girOf;
        return o;
    }
    // Every round on this phone, as the golfer this phone is. A round's golfer: the record
    // the scorecard marked me; else the "This is me" (golfapp_me_<code>) or the GPS name
    // tag (hardpan_gps_golfer_<code>). The GPS screen's own sheet (hardpan_stats_v1_, one
    // golfer a round) is read too; a hole entered on the scorecard wins over it.
    function myRounds() {
        var byCode = {}, legacy = {};
        try {
            for (var i = 0; i < W.localStorage.length; i++) {
                var k = W.localStorage.key(i);
                if (!k) continue;
                if (k.indexOf(QKEY) === 0) { var r = lsGet(k); if (r && r.v === 1 && r.code) (byCode[r.code] = byCode[r.code] || []).push(r); }
                else if (k.indexOf(KEY) === 0) { var l = lsGet(k); if (l && l.v === 1 && l.code && l.player) legacy[l.code] = l; }
            }
        } catch (e) {}
        var out = [];
        var codes = Object.keys(byCode).concat(Object.keys(legacy).filter(function (c) { return !byCode[c]; }));
        codes.forEach(function (code) {
            var recs = byCode[code] || [], me = recs.filter(function (r) { return r.me === true; })[0];
            if (!me) {
                var id = null; try { id = W.localStorage.getItem('golfapp_me_' + code) || W.localStorage.getItem('hardpan_gps_golfer_' + code); } catch (e) {}
                me = recs.filter(function (r) { return id != null && String(r.pid) === String(id); })[0] || null;
            }
            var lg = legacy[code];
            if (lg && me && String(lg.player) !== String(me.pid)) lg = null;
            if (!me && !lg) return;
            var r0 = { code: code, course: (me && me.course) || (lg && lg.course) || '', at: (me && me.at) || (lg && lg.at) || 0, holes: {}, snap: {} };
            if (lg) {
                Object.keys(lg.holes || {}).forEach(function (n) { var h = lg.holes[n] || {}; r0.holes[n] = { putts: h.putts == null ? null : h.putts, fw: h.fw || null }; });
                Object.keys(lg.snap || {}).forEach(function (n) { r0.snap[n] = { s: lg.snap[n].strokes || 0, par: lg.snap[n].par }; });
                if (lg.at && (!r0.at || lg.at < r0.at)) r0.at = lg.at;
            }
            if (me) {
                Object.keys(me.holes || {}).forEach(function (n) { r0.holes[n] = me.holes[n]; });
                if (Object.keys(me.snap || {}).length) r0.snap = me.snap;
            }
            out.push(r0);
        });
        return out;
    }

    // ---- THE MY STATS PAGE --------------------------------------------------------------
    var NKEY = 'hardpan_mystats_last';
    function lastN() { var v = null; try { v = W.localStorage.getItem(NKEY); } catch (e) {} return v === '20' ? 20 : 5; }
    var page = null;
    function closeMy() { if (page) page.style.display = 'none'; }
    function openMy() {
        var d = W.document;
        if (!page) {
            page = el('div', 'hp-my-stats');
            page.id = 'hp-my-stats';
            page.setAttribute('role', 'dialog');
            page.setAttribute('aria-label', 'My stats');
            var st = el('style');
            st.textContent = '#hp-my-stats{position:fixed;inset:0;z-index:2147482500;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#f0f4f2;color:#1a1a1a;color-scheme:light;font:600 15px/1.35 -apple-system,system-ui,sans-serif;padding:calc(env(safe-area-inset-top) + 10px) 16px calc(env(safe-area-inset-bottom) + 24px);box-sizing:border-box;}'
                + '#hp-my-stats .ms-top{display:flex;align-items:center;gap:10px;max-width:520px;margin:0 auto;}#hp-my-stats .ms-title{font-weight:800;font-size:1.25rem;color:#0f4c3a;}'
                + '#hp-my-stats .ms-back{min-width:44px;min-height:44px;border:0;background:#fff;border-radius:12px;font-size:1.5rem;color:#0f4c3a;cursor:pointer;}'
                + '#hp-my-stats .ms-body{max-width:520px;margin:0 auto;}#hp-my-stats .ms-seg{display:flex;gap:6px;margin:14px 0 6px;background:#e2f1ea;border-radius:999px;padding:4px;}'
                + '#hp-my-stats .ms-seg button{flex:1;min-height:40px;border:0;border-radius:999px;background:none;color:#0f4c3a;font:800 15px/1 -apple-system,system-ui,sans-serif;cursor:pointer;}#hp-my-stats .ms-seg button.on{background:#0f4c3a;color:#fff;}'
                + '#hp-my-stats .ms-note{font-size:13px;color:#555;margin:6px 2px;}#hp-my-stats .ms-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;}'
                + '#hp-my-stats .ms-tile{background:#fff;border-radius:14px;padding:12px 14px;}#hp-my-stats .ms-tile .k{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#555;}#hp-my-stats .ms-tile .v{font-size:24px;font-weight:800;color:#0f4c3a;margin-top:2px;}';
            page.appendChild(st);
            var top = el('div', 'ms-top');
            var back = el('button', 'ms-back', '‹'); back.type = 'button'; back.setAttribute('aria-label', 'Back'); back.onclick = closeMy;
            top.appendChild(back); top.appendChild(el('div', 'ms-title', 'My stats'));
            page.appendChild(top);
            page.appendChild(el('div', 'ms-body'));
            d.body.appendChild(page);
        }
        page.style.display = '';
        renderMy();
    }
    function renderMy() {
        if (!page) return;
        var body = page.querySelector('.ms-body'), n = lastN(), a = aggregate(myRounds(), n);
        body.textContent = '';
        var seg = el('div', 'ms-seg');
        [5, 20].forEach(function (k) {
            var b = el('button', k === n ? 'on' : '', 'Last ' + k); b.type = 'button'; b.setAttribute('data-ms-last', String(k));
            b.onclick = function () { try { W.localStorage.setItem(NKEY, String(k)); } catch (e) {} renderMy(); };
            seg.appendChild(b);
        });
        body.appendChild(seg);
        body.appendChild(el('div', 'ms-note', a.rounds ? (a.rounds + ' round' + (a.rounds === 1 ? '' : 's') + ' on this phone · ' + a.statRounds + ' with putts or fairways') : 'No rounds on this phone yet. Tap putts and fairways under your score on the card.'));
        var g = el('div', 'ms-grid');
        [['Putts / round', num(a.puttsPerRound, 1), 'putts'], ['Fairways (FIR)', pct(a.firPct), 'fir'], ['Greens (GIR)', pct(a.girPct), 'gir'], ['Scoring average', num(a.scoringAvg, 1), 'avg'],
            ['Par 3 average', num(a.par3, 2), 'par3'], ['Par 4 average', num(a.par4, 2), 'par4'], ['Par 5 average', num(a.par5, 2), 'par5'], ['Putts / hole', num(a.puttsPerHole, 2), 'pph']]
            .forEach(function (x) { var t = el('div', 'ms-tile'); t.setAttribute('data-ms', x[2]); t.appendChild(el('div', 'k', x[0])); t.appendChild(el('div', 'v', String(x[1]))); g.appendChild(t); });
        body.appendChild(g);
        body.appendChild(el('div', 'ms-note', 'Putts, fairways and greens come from rounds with stats entered. Scoring average: complete 18-hole rounds. Kept on this phone only.'));
    }
    // HOME (the GPS app): "My stats" - only with GPS Map, asked quietly (never a paywall),
    // and only when the switch is on.
    function placeHome(mount) {
        if (!mount || typeof W.HardPanFeature !== 'function' || !W.HardPanFeature('quickStats')) return;
        var G = W.HardPanGps;
        if (!G || typeof G.requireGps !== 'function') return;
        G.requireGps({ quiet: true }, function () {
            if (mount.querySelector('[data-hp-mystats]')) return;
            var b = el('button', 'hp-row', null); b.type = 'button'; b.setAttribute('data-hp-mystats', '1'); b.style.margin = '12px 0';
            b.appendChild(el('span', 'n', '📊 My stats'));
            b.appendChild(el('span', null, '›'));
            b.onclick = openMy;
            mount.appendChild(b);
        }, function () {});
    }

    W.HardPanGpsStats = { open: open, close: close, refresh: refresh, isOpen: function () { return !!(sheet && sheet.style.display !== 'none' && cur); },
        girAuto: girAuto, holeView: holeView, summary: summary, season: season, load: load, setHole: setHole, ensure: ensure,
        // Quick stats on the scorecard (008) and My stats.
        quick: { key: qKey, load: qLoad, hole: qHole, set: qSet, sync: qSync, fwAsked: fwAsked },
        aggregate: aggregate, myRounds: myRounds, openMy: openMy, closeMy: closeMy, placeHome: placeHome };
})();
