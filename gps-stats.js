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
    // S (012 score sheet): the tee shot came up short of the fairway - a miss, like L / R.
    var FW = { L: 'Left', hit: 'Hit', R: 'Right', S: 'Short' };
    // 012: where the green was missed (the score sheet's GREEN IN REG row). 'hit' = on in regulation.
    var GD = { hit: 'Hit', short: 'Short', long: 'Long', L: 'Left', R: 'Right' };

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
            // 036 #37: the sample behind each number, so a small one shows as a count.
            putts: sum(function (s) { return s.putts; }), puttHoles: puttHoles, fwHit: sum(function (s) { return s.fwHit; }), fwChances: fwCh, gir: sum(function (s) { return s.gir; }), girHoles: girH,
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
        if (skipped(ctx.code)) return rec;   // 020: a practice / removed round - shown, never kept
        lsSet(KEY + ctx.code, rec);
        return rec;
    }
    function setHole(ctx, n, patch) {
        var rec = ensure(ctx);
        var h = rec.holes[n] = rec.holes[n] || {};
        Object.keys(patch).forEach(function (k) { if (patch[k] === undefined) delete h[k]; else h[k] = patch[k]; });
        if (!skipped(ctx.code)) lsSet(KEY + ctx.code, rec);
        return rec;
    }
    // A round changed (a score saved): keep the snapshot current - quietly.
    function refresh(ctx) { if (ctx && ctx.code && load(ctx.code)) ensure(ctx); }

    // ---- THE SHEET -----------------------------------------------------------------------
    var sheet = null, cur = null;
    function pct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
    function num(x, d) { return x == null ? '—' : (Math.round(x * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toFixed(d || 0); }
    // 036 #37 (SMALL SAMPLES): under 9 holes of data a stat shows what the data is - a count and
    // "from N holes" - never a per-round number or a percentage worked out from a hole or two.
    // Display only: the numbers themselves (aggregate / season) are not changed.
    var SAMPLE_MIN = 9;
    function small(n) { return n > 0 && n < SAMPLE_MIN; }
    function fromHoles(n) { return 'from ' + n + ' hole' + (n === 1 ? '' : 's'); }
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
        [['Putts / round', num(ss.puttsPerRound, 1)], ['Putts / hole', small(ss.puttHoles) ? num(ss.puttsPerHole, 2) + ' · ' + fromHoles(ss.puttHoles) : num(ss.puttsPerHole, 2)],
            ['Fairways', ss.fwChances > 0 && small(Math.max(ss.puttHoles, ss.girHoles, ss.fwChances)) ? ss.fwHit + ' of ' + ss.fwChances + ' · ' + fromHoles(ss.fwChances) : pct(ss.fwPct)],
            ['Greens (GIR)', small(ss.girHoles) ? ss.gir + ' of ' + ss.girHoles + ' · ' + fromHoles(ss.girHoles) : pct(ss.girPct)]]
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

    // ---- 020: PRACTICE ROUND, REMOVE ONE ROUND, START FRESH (this phone only) ------------
    // A round can be kept OUT of My stats: hardpan_nostats_<code> = 'practice' (the Tools sheet's
    // "Practice round" switch - nothing from it is saved) or 'removed' ("Remove from my stats", and
    // every round "Start fresh" cleared - so reopening an old round does not bring it back). The
    // HardPan Index (hp-index.js) reads the same key. What is cleared: this phone's stats stores only
    // (hardpan_qstats_v1_*, hardpan_stats_v1_*, the Index's rounds). Never a round record, a score
    // or money - nothing here reads or writes Firebase.
    var NOSTATS = 'hardpan_nostats_';
    function lsKeys(test) { var out = []; try { for (var i = 0; i < W.localStorage.length; i++) { var k = W.localStorage.key(i); if (k && test(k)) out.push(k); } } catch (e) {} return out; }
    function lsDel(k) { try { W.localStorage.removeItem(k); } catch (e) {} }
    // THE HARDPAN INDEX'S STORE (hp-index.js), also where that file is not loaded (Home): its own
    // calls when it is in the page, else the same localStorage record ({ v: 1, rounds: [...] }).
    var IKEY = 'hardpan_hp_index_v1';
    function idx() {
        var I = W.HardPanIndex;
        if (I && typeof I.rounds === 'function' && typeof I.removeRound === 'function' && typeof I.clear === 'function') return I;
        var read = function () { var v = lsGet(IKEY); return v && v.v === 1 && Array.isArray(v.rounds) ? v : { v: 1, rounds: [] }; };
        return {
            rounds: function () { return read().rounds; },
            removeRound: function (code) { var st = read(), n = st.rounds.length; st.rounds = st.rounds.filter(function (r) { return !r || String(r.code) !== String(code); }); return st.rounds.length !== n ? lsSet(IKEY, st) : false; },
            clear: function () { lsDel(IKEY); return true; }
        };
    }
    function skipOf(code) { try { return code ? W.localStorage.getItem(NOSTATS + code) || null : null; } catch (e) { return null; } }
    function skipped(code) { return !!skipOf(code); }
    function practiceOn(code) { return skipOf(code) === 'practice'; }
    // Every on-phone stats record of one round, and its Index round. Returns how many keys went.
    function dropStats(code) {
        code = String(code || '');
        if (!code) return 0;
        var ks = lsKeys(function (k) { return k.indexOf(QKEY + code + '_p') === 0 || k === KEY + code || k === 'hardpan_sg_v1_' + code; });
        ks.forEach(lsDel);
        idx().removeRound(code);
        return ks.length;
    }
    function removeRound(code) {
        if (!code) return false;
        try { W.localStorage.setItem(NOSTATS + code, 'removed'); } catch (e) {}
        dropStats(code);
        return true;
    }
    function setPractice(code, on) {
        if (!code) return false;
        try { if (on) W.localStorage.setItem(NOSTATS + code, 'practice'); else if (practiceOn(code)) W.localStorage.removeItem(NOSTATS + code); } catch (e) {}
        if (on) dropStats(code);
        if (ss && ssIsOpen()) ssRender();
        return practiceOn(code);
    }
    // Every round with stats or an Index entry on this phone (their codes).
    function statCodes() {
        var codes = {};
        lsKeys(function (k) { return k.indexOf(QKEY) === 0 || k.indexOf(KEY) === 0; }).forEach(function (k) { var r = lsGet(k); if (r && r.code) codes[String(r.code)] = 1; });
        try { idx().rounds().forEach(function (r) { if (r && r.code) codes[String(r.code)] = 1; }); } catch (e) {}
        return Object.keys(codes);
    }
    function clearAll() {
        var codes = statCodes();
        codes.forEach(function (c) { if (!skipped(c)) { try { W.localStorage.setItem(NOSTATS + c, 'removed'); } catch (e) {} } });
        lsKeys(function (k) { return k.indexOf(QKEY) === 0 || k.indexOf(KEY) === 0 || k.indexOf('hardpan_sg_v1_') === 0; }).forEach(lsDel);
        idx().clear();
        return codes.length;
    }
    function qLoad(code, pid) { var r = lsGet(qKey(code, pid)); return r && r.v === 1 ? r : null; }
    function qNew(ctx, pid) { return { v: 1, code: String(ctx.code), pid: String(pid), course: ctx.course || '', at: Date.now(), holes: {}, snap: {} }; }
    // 4 means "4+".
    function qPutts(v) { var n = Number(v); return v == null || v === '' || !isFinite(n) || n < 0 ? null : Math.min(4, Math.floor(n)); }
    function fwAsked(par) { return Number(par) >= 4; }
    // { putts, fw, gir } for one hole, recomputing GIR from the score it is given.
    // 012: the green in regulation the golfer set themselves (gd: hit / short / long / L / R) wins
    // over the one worked out from the score and putts; with none set, the worked-out answer.
    function girOf(h, strokes, par) {
        if (h && GD[h.gd]) return h.gd === 'hit';
        return girAuto(Number(strokes) || 0, h && h.putts != null ? h.putts : null, Number(par));
    }
    function qCell(h, strokes, par) {
        h = h || {};
        var putts = h.putts == null ? null : h.putts;
        var auto = girAuto(Number(strokes) || 0, putts, Number(par));
        return { putts: putts, fw: fwAsked(par) ? (h.fw || null) : null, gir: girOf(h, strokes, par),
            // 012 (the score sheet): the rest of the hole - all optional, all on this phone.
            girAuto: auto, gd: GD[h.gd] ? h.gd : null, bunker: h.bunker == null ? null : h.bunker, pen: h.pen == null ? null : h.pen, note: h.note || '',
            // 052 C: the first putt's length (a chip id, feet: lt3 / 3-6 / 6-10 / 10-20 / 20-40 / 40p) - optional.
            fp: FP_IDS.indexOf(h.fp) !== -1 ? h.fp : null };
    }
    // 052 C: the first-putt length chips (gps-stats.js Strokes Gained reads them; nothing else does).
    var FP_IDS = ['lt3', '3-6', '6-10', '10-20', '20-40', '40p'];
    function q3(v) { var n = Number(v); return v == null || v === '' || !isFinite(n) || n < 0 ? null : Math.min(3, Math.floor(n)); }
    function qHole(code, pid, n, strokes, par) { var r = qLoad(code, pid); return qCell(r && r.holes[String(n)], strokes, par); }
    // ctx: { code, course }. patch: { putts } or { fw } - null / undefined clears it.
    function qSet(ctx, pid, n, patch, strokes, par) {
        var rec = qLoad(ctx.code, pid) || qNew(ctx, pid);
        n = String(n);
        var h = rec.holes[n] || {};
        if ('putts' in patch) { var p = qPutts(patch.putts); if (p == null) delete h.putts; else h.putts = p; }
        if ('fw' in patch) { if (fwAsked(par) && FW[patch.fw]) h.fw = patch.fw; else delete h.fw; }
        // 012: green missed where (or hit, against the worked-out answer), bunker shots, penalties, a note.
        if ('gd' in patch) { if (GD[patch.gd]) h.gd = patch.gd; else delete h.gd; }
        if ('bunker' in patch) { var b = q3(patch.bunker); if (b == null) delete h.bunker; else h.bunker = b; }
        if ('pen' in patch) { var pn = q3(patch.pen); if (pn == null) delete h.pen; else h.pen = pn; }
        if ('note' in patch) { var t = String(patch.note == null ? '' : patch.note).trim().slice(0, 500); if (t) h.note = t; else delete h.note; }
        // 052 C: first-putt length - stored beside putts, the same way; anything not a chip clears it.
        if ('fp' in patch) { if (FP_IDS.indexOf(patch.fp) !== -1) h.fp = patch.fp; else delete h.fp; }
        var g = girOf(h, strokes, par);
        if (g == null) delete h.gir; else h.gir = g;
        if (Number(strokes) > 0) rec.snap[n] = { s: Number(strokes), par: Number(par) };
        if (Object.keys(h).length) rec.holes[n] = h; else delete rec.holes[n];
        if (!skipped(ctx.code)) lsSet(qKey(ctx.code, pid), rec);   // 020: a practice / removed round keeps nothing
        return qCell(h, strokes, par);
    }
    // The round as this phone sees it: the golfer this phone is (meId) gets a record (so
    // a round with no stats still counts toward the scoring average); every golfer who
    // already has one gets their scores copied and GIR worked out again.
    // ctx: { code, course, round: { players, scores }, holes: [{ n, par }] }
    function qSync(ctx, meId) {
        if (!ctx || !ctx.code || skipped(ctx.code)) return;
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
                var g = GD[h.gd] ? h.gd === 'hit' : (x ? girAuto(x.s, h.putts == null ? null : h.putts, x.par) : null);
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
            fir: 0, firOf: 0, gir: 0, girOf: 0, putts: 0, puttHoles: 0,
            // 012: where the misses went - tee shots (L / R / short) and greens (short / long / L / R).
            teeMiss: { L: 0, R: 0, S: 0 }, greenMiss: { short: 0, long: 0, L: 0, R: 0 } };
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
            var hasStats = Object.keys(holes).some(function (n) { return holes[n] && (holes[n].putts != null || holes[n].fw || GD[holes[n].gd]); });
            if (!hasStats) return;
            o.statRounds++;
            Object.keys(holes).forEach(function (n) {
                var h = holes[n] || {}, x = r.snap[n] || null, par = x ? x.par : 0;
                if (h.fw && FW[h.fw] && (!x || fwAsked(par))) { o.firOf++; if (h.fw === 'hit') o.fir++; else o.teeMiss[h.fw]++; }
                if (GD[h.gd] && h.gd !== 'hit') o.greenMiss[h.gd]++;
                // A green the golfer set (gd) counts with or without putts; else worked out from score + putts.
                if (GD[h.gd] && x && x.s > 0 && h.putts == null) { o.girOf++; if (h.gd === 'hit') o.gir++; return; }
                if (h.putts == null || !x || !(x.s > 0)) return;
                o.putts += h.putts; o.puttHoles++;
                var g = GD[h.gd] ? h.gd === 'hit' : girAuto(x.s, h.putts, par);
                if (g != null) { o.girOf++; if (g) o.gir++; }
            });
        });
        if (o.full) o.scoringAvg = tot / o.full;
        [3, 4, 5].forEach(function (p) { o['par' + p + 'Holes'] = byPar[p][1]; if (byPar[p][1]) o['par' + p] = byPar[p][0] / byPar[p][1]; });
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
            if (skipped(code)) return;
            var recs = byCode[code] || [], me = recs.filter(function (r) { return r.me === true; })[0];
            if (!me) {
                var id = null; try { id = W.localStorage.getItem('golfapp_me_' + code) || W.localStorage.getItem('hardpan_gps_golfer_' + code); } catch (e) {}
                me = recs.filter(function (r) { return id != null && String(r.pid) === String(id); })[0] || null;
            }
            var lg = legacy[code];
            if (lg && me && String(lg.player) !== String(me.pid)) lg = null;
            if (!me && !lg) return;
            var r0 = { code: code, course: (me && me.course) || (lg && lg.course) || '', at: (me && me.at) || (lg && lg.at) || 0, holes: {}, snap: {} };
            // 052 C: whose marks are this round's (Strokes Gained reads hardpan_sg_v1_<code> by golfer).
            Object.defineProperty(r0, 'pid', { value: me ? String(me.pid) : (lg ? String(lg.player) : null), enumerable: false });
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
                + '#hp-my-stats .ms-note{font-size:13px;color:#555;margin:6px 2px;}#hp-my-stats .ms-saved{font-size:12px;color:#6b7280;margin:4px 2px 0;}#hp-my-stats .ms-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;}'
                + '#hp-my-stats .ms-tile{background:#fff;border-radius:14px;padding:12px 14px;}#hp-my-stats .ms-tile .k{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#555;}#hp-my-stats .ms-tile .v{font-size:24px;font-weight:800;color:#0f4c3a;margin-top:2px;}#hp-my-stats .ms-tile .s{font-size:13px;font-weight:700;color:#555;margin-top:2px;}'
                + '#hp-my-stats .ms-miss{display:grid;gap:10px;margin-top:10px;}#hp-my-stats .ms-miss-line{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:4px;color:#555;}#hp-my-stats .ms-miss-c b{font-size:20px;color:#0f4c3a;}'
                // 020: the rounds behind the numbers (each removable), Start fresh, and the app-drawn question.
                + '#hp-my-stats .ms-h{font-size:12px;font-weight:800;letter-spacing:.08em;color:#555;margin:18px 2px 8px;}'
                + '#hp-my-stats .ms-round{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border-radius:14px;padding:10px 6px 10px 14px;margin-bottom:8px;}'
                + '#hp-my-stats .ms-round .n{font-weight:800;}#hp-my-stats .ms-round .s{font-size:13px;color:#555;font-weight:600;}'
                + '#hp-my-stats .ms-rm{min-width:44px;min-height:44px;border:0;background:none;color:#8a1c1c;font:700 13px/1.1 -apple-system,system-ui,sans-serif;cursor:pointer;}'
                + '#hp-my-stats .ms-fresh{display:block;margin:22px auto 0;min-height:44px;padding:0 16px;border:1px solid #c9d3cd;border-radius:12px;background:none;color:#555;font:700 14px/1 -apple-system,system-ui,sans-serif;cursor:pointer;}'
                + '#hp-my-stats .ms-ask{position:fixed;inset:0;background:rgba(5,20,12,.5);display:flex;align-items:flex-end;justify-content:center;z-index:2;}'
                + '#hp-my-stats .ms-ask>div{background:#fff;border-radius:20px 20px 0 0;padding:18px 16px calc(env(safe-area-inset-bottom) + 16px);width:100%;max-width:520px;box-sizing:border-box;}'
                + '#hp-my-stats .ms-ask .t{font-size:18px;font-weight:800;margin-bottom:6px;}#hp-my-stats .ms-ask .b{font-size:15px;color:#444;font-weight:600;margin-bottom:14px;}'
                + '#hp-my-stats .ms-ask button{display:block;width:100%;min-height:50px;border-radius:14px;font:800 16px/1 -apple-system,system-ui,sans-serif;cursor:pointer;margin-top:8px;}'
                + '#hp-my-stats .ms-ask .ok{border:0;background:#8a1c1c;color:#fff;}#hp-my-stats .ms-ask .no{border:1px solid #c9d3cd;background:#fff;color:#1a1a1a;}';
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
        // 010: where these numbers live, in one small line.
        body.appendChild(el('div', 'ms-saved', 'Saved on this phone'));
        var seg = el('div', 'ms-seg');
        [5, 20].forEach(function (k) {
            var b = el('button', k === n ? 'on' : '', 'Last ' + k); b.type = 'button'; b.setAttribute('data-ms-last', String(k));
            b.onclick = function () { try { W.localStorage.setItem(NKEY, String(k)); } catch (e) {} renderMy(); };
            seg.appendChild(b);
        });
        body.appendChild(seg);
        body.appendChild(el('div', 'ms-note', a.rounds ? (a.rounds + ' round' + (a.rounds === 1 ? '' : 's') + ' on this phone · ' + a.statRounds + ' with putts or fairways') : 'No rounds on this phone yet. Tap putts and fairways under your score on the card.'));
        // 052 C: STROKES GAINED (lite) - its own window (Last round / 10 / 20) and benchmark; the tiles below keep Last 5 / 20.
        if (a.rounds) { var sgBox = el('div', 'ms-sg'); sgBox.setAttribute('data-ms-sg', '1'); body.appendChild(sgBox); try { sgMySection(sgBox, renderMy); } catch (e) { sgBox.remove(); } body.appendChild(el('div', 'ms-h', 'YOUR NUMBERS')); }
        var g = el('div', 'ms-grid');
        // 036 #37: [label, value, key, holes behind it, show the sample]. Under 9 holes: the count and "from N holes"
        // (Putts, not Putts / round - never 2 putts on one hole x 18 = "36.0").
        // "9 holes of data" is the page's sample, not each tile's: 9 holes with stats hold only ~7
        // fairways (par 3s have none) and 2 par 3s, and still show as a round (as today).
        var fewP = small(a.puttHoles), fewF = a.firOf > 0 && small(Math.max(a.puttHoles, a.girOf, a.firOf)),
            fewS = small((a.par3Holes || 0) + (a.par4Holes || 0) + (a.par5Holes || 0));
        [[fewP ? 'Putts' : 'Putts / round', fewP ? a.putts + ' putt' + (a.putts === 1 ? '' : 's') : num(a.puttsPerRound, 1), 'putts', a.puttHoles, fewP],
            ['Fairways (FIR)', fewF ? a.fir + ' of ' + a.firOf : pct(a.firPct), 'fir', a.firOf, fewF],
            ['Greens (GIR)', small(a.girOf) ? a.gir + ' of ' + a.girOf : pct(a.girPct), 'gir', a.girOf, small(a.girOf)], ['Scoring average', num(a.scoringAvg, 1), 'avg', 0, false],
            ['Par 3 average', num(a.par3, 2), 'par3', a.par3Holes, fewS && a.par3Holes > 0], ['Par 4 average', num(a.par4, 2), 'par4', a.par4Holes, fewS && a.par4Holes > 0],
            ['Par 5 average', num(a.par5, 2), 'par5', a.par5Holes, fewS && a.par5Holes > 0], ['Putts / hole', num(a.puttsPerHole, 2), 'pph', a.puttHoles, fewP]]
            .forEach(function (x) {
                var t = el('div', 'ms-tile'); t.setAttribute('data-ms', x[2]); t.appendChild(el('div', 'k', x[0])); t.appendChild(el('div', 'v', String(x[1])));
                if (x[4]) { var f = el('div', 's', fromHoles(x[3])); f.setAttribute('data-ms-from', String(x[3])); t.appendChild(f); }
                g.appendChild(t);
            });
        body.appendChild(g);
        // 012: WHERE THE MISSES GO - counted from the score sheet's tee shot and green in reg rows.
        var tm = a.teeMiss || {}, gm = a.greenMiss || {};
        var miss = el('div', 'ms-miss');
        [['Tee shots missed', [['Left', tm.L, 'tee-L'], ['Right', tm.R, 'tee-R'], ['Short', tm.S, 'tee-S']]],
            ['Greens missed', [['Short', gm.short, 'gir-short'], ['Long', gm.long, 'gir-long'], ['Left', gm.L, 'gir-L'], ['Right', gm.R, 'gir-R']]]]
            .forEach(function (row) {
                var t = el('div', 'ms-tile ms-miss-row');
                t.appendChild(el('div', 'k', row[0]));
                var line = el('div', 'ms-miss-line');
                row[1].forEach(function (x) { var c = el('span', 'ms-miss-c'); c.setAttribute('data-ms-miss', x[2]); c.appendChild(el('b', null, String(x[1] || 0))); c.appendChild(el('span', null, ' ' + x[0])); line.appendChild(c); });
                t.appendChild(line);
                miss.appendChild(t);
            });
        body.appendChild(miss);
        body.appendChild(el('div', 'ms-note', 'Putts, fairways and greens come from rounds with stats entered. Scoring average: complete 18-hole rounds. Kept on this phone only.'));
        // 020: THE ROUNDS behind these numbers - a test round can go on its own.
        var list = historyRounds();
        if (list.length) {
            body.appendChild(el('div', 'ms-h', 'ROUNDS ON THIS PHONE'));
            list.forEach(function (r) {
                var row = el('div', 'ms-round'); row.setAttribute('data-ms-round', r.code);
                var l = el('div');
                l.appendChild(el('div', 'n', r.course || ('Round ' + r.code)));
                l.appendChild(el('div', 's', [r.at ? new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '', r.holes ? r.strokes + ' thru ' + r.holes : ''].filter(Boolean).join(' \u00b7 ')));
                row.appendChild(l);
                var x = el('button', 'ms-rm', 'Remove'); x.type = 'button'; x.setAttribute('data-ms-remove', r.code); x.setAttribute('aria-label', 'Remove ' + (r.course || r.code) + ' from my stats');
                x.onclick = function () {
                    ask('Remove this round from my stats?', (r.course || 'This round') + ' leaves My stats on this phone. The round and its scores in games are NOT deleted.', 'Remove', function () { removeRound(r.code); renderMy(); });
                };
                row.appendChild(x);
                body.appendChild(row);
            });
        }
        var fresh = el('button', 'ms-fresh', 'Start fresh'); fresh.type = 'button'; fresh.setAttribute('data-ms-fresh', '1');
        fresh.onclick = function () { ask('Clear all my stats on this phone?', 'Your rounds and scores in games are NOT deleted.', 'Clear', function () { clearAll(); renderMy(); }); };
        body.appendChild(fresh);
    }
    // 020: each round in My stats - the scorecard's (myRounds) and the HardPan Index's - newest first.
    function historyRounds() {
        var by = {};
        myRounds().forEach(function (r) {
            var st = 0, n = 0;
            Object.keys(r.snap || {}).forEach(function (k) { var x = r.snap[k]; if (x && x.s > 0) { st += x.s; n++; } });
            by[r.code] = { code: r.code, course: r.course, at: r.at || 0, strokes: st, holes: n };
        });
        try {
            idx().rounds().forEach(function (r) {
                if (!r || !r.code || by[r.code] || skipped(r.code)) return;
                var st = (r.holes || []).reduce(function (a, h) { return a + (Number(h.gross) || 0); }, 0);
                by[r.code] = { code: r.code, course: r.course, at: r.at || 0, strokes: st, holes: (r.holes || []).length };
            });
        } catch (e) {}
        return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    }
    // The question, drawn by the page itself (Home has no dialog library): [ok] [Cancel].
    function ask(title, text, okText, yes) {
        if (!page) return;
        var o = page.querySelector('.ms-ask'); if (o) o.remove();
        o = el('div', 'ms-ask'); o.setAttribute('role', 'alertdialog');
        var box = el('div');
        box.appendChild(el('div', 't', title)); box.appendChild(el('div', 'b', text));
        var ok = el('button', 'ok', okText); ok.type = 'button'; ok.setAttribute('data-ms-ask', 'ok');
        var no = el('button', 'no', 'Cancel'); no.type = 'button'; no.setAttribute('data-ms-ask', 'cancel');
        ok.onclick = function () { o.remove(); yes(); };
        no.onclick = function () { o.remove(); };
        o.onclick = function (e) { if (e.target === o) o.remove(); };
        box.appendChild(ok); box.appendChild(no); o.appendChild(box);
        page.appendChild(o);
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

    // ============================================================================
    // THE SCORE SHEET (012, HardPanFeature('scoreSheet'); the GPS screen's Enter score)
    //
    // Tap Enter score on the GPS screen: a sheet slides up over the map (~90% of the
    // screen, scrolls, swipe down to close). Golfer chips (the golfers this phone may
    // score - the same boxes the card offers), SCORE as a 4x2 grid centred on par with the
    // card's own marks, then - for the GPS golfer, or every golfer with "Track stats for
    // others" (Tools, this phone) - PUTTS, TEE SHOT (not on a par 3), GREEN IN REG (Hit
    // worked out from score - putts <= par - 2, shown "auto"; the golfer can change it),
    // BUNKER SHOTS, PENALTIES and a note. "Save · Next hole" hands each score to the
    // scorecard's own save (index.html gpsOpenSheet -> saveScore -> the offline queue) -
    // nothing here writes a score. The stats go in the quick-stats record on this phone
    // (hardpan_qstats_v1_<code>_p<id>), never to Firebase, never to a money engine.
    // ============================================================================
    var OTHERS_KEY = 'hardpan_stats_others';
    function othersOn() { try { return W.localStorage.getItem(OTHERS_KEY) === '1'; } catch (e) { return false; } }
    function setOthers(on) { try { if (on) W.localStorage.setItem(OTHERS_KEY, '1'); else W.localStorage.removeItem(OTHERS_KEY); } catch (e) {} }
    // Seven scores, par always the third: par 3 -> 1..7, par 4 -> 2..8, par 5 -> 3..9. More = the rest, up to 15.
    var SS_MAX = 15;
    function ssGrid(par) { par = Number(par) || 4; var a = Math.max(1, par - 2), out = []; for (var i = 0; i < 7; i++) out.push(a + i); return out; }
    function ssMore(par) { var g = ssGrid(par), out = []; for (var i = 1; i <= SS_MAX; i++) if (g.indexOf(i) === -1) out.push(i); return out; }
    // GREEN IN REG as the sheet shows it: the golfer's own answer (gd), else Hit when the score
    // and putts say so (auto), else nothing yet.
    function ssGir(cell) {
        if (cell && cell.gd) return { v: cell.gd, auto: false };
        if (cell && cell.girAuto === true) return { v: 'hit', auto: true };
        return { v: null, auto: false };
    }
    // The tap on a GREEN IN REG button -> the patch to store. Tapping what is shown clears the
    // golfer's own answer (back to auto); Hit when auto already says Hit stores nothing.
    function ssGirTap(cell, v) {
        var cur = ssGir(cell);
        if (cur.v === v) return { gd: null };
        if (v === 'hit' && cell && cell.girAuto === true) return { gd: null };
        return { gd: v };
    }
    function ssMark(n, par) {
        var f = typeof W.scoreMark === 'function' ? W.scoreMark : null;
        return f ? f(n, par) || '' : '';
    }

    var ss = null;          // { wrap, ctx, sel, pend, more, notes }
    var ssDone = {};        // scores saved from the sheet this session: code|pid|hole -> n (before the database echoes them)
    function ssSaved(pid) {
        var c = ss.ctx, v = Number(c.score ? c.score(pid) : 0);
        if (v > 0) return v;
        var k = c.code + '|' + pid + '|' + c.hole;
        return ssDone[k] || 0;
    }
    function ssStrokes(pid) { return ss.pend[pid] || ssSaved(pid); }
    // URGENT-005: the stats rows are for the golfer this phone IS (ctx.own - index.html qsOwnId), not
    // whoever's chip is picked; nobody's when the phone is nobody; everyone's with Track stats for others.
    // URGENT-034: the golfer this phone IS (the same rule as the stats rows). They never auto-advance.
    function ssIsOwn(pid) { var c = ss && ss.ctx; if (!c) return false; var me = ('own' in c) ? c.own : c.pick; return me != null && String(pid) === String(me); }
    function ssStatsFor(pid) { var c = ss && ss.ctx; if (!c) return false; var me = ('own' in c) ? c.own : c.pick; return !!(c.stats && !practiceOn(c.code) && ((me != null && String(pid) === String(me)) || othersOn())); }
    function ssCell(pid) { var c = ss.ctx; return qHole(c.code, pid, c.hole, ssStrokes(pid), c.par); }
    // 092 (the COMBO card, gps-round.js): the same "tracked" rule as ssStatsFor, for any ctx (no open sheet
    // needed) - quick stats on (ctx.stats), not a Practice round, and the golfer this phone IS (ctx.own) or
    // "Track stats for others" on. Read only.
    function statsForCtx(c, pid) { if (!c) return false; var me = ('own' in c) ? c.own : c.pick; return !!(c.stats && !practiceOn(c.code) && ((me != null && String(pid) === String(me)) || othersOn())); }
    // 092: the COMBO card's tiles for one golfer - the round summary's own sums (summary(): holes with a
    // score; putts over holes with putts; fairways over par 4s and 5s answered; greens over holes GIR is
    // known), worked out from the LIVE scores (holes: [{ n, par, s }]) and this phone's quick-stats record.
    // Read only: nothing is written, nothing goes to Firebase or a money engine.
    function cardTiles(code, pid, holes) {
        var rec = qLoad(code, pid), t = { thru: 0, strokes: 0, par: 0, toPar: 0, putts: 0, puttHoles: 0, fwHit: 0, fwChances: 0, gir: 0, girHoles: 0 };
        (holes || []).forEach(function (x) {
            var s = Number(x && x.s) || 0, par = Number(x && x.par) || 0;
            if (!(s > 0)) return;
            t.thru++; t.strokes += s; t.par += par;
            var c = qCell(rec && rec.holes[String(x.n)], s, par);
            if (c.putts != null) { t.putts += c.putts; t.puttHoles++; }
            if (fwAsked(par) && c.fw) { t.fwChances++; if (c.fw === 'hit') t.fwHit++; }
            if (c.gir != null) { t.girHoles++; if (c.gir) t.gir++; }
        });
        t.toPar = t.strokes - t.par;
        return t;
    }
    function ssIsOpen() { return !!(ss && ss.wrap && ss.wrap.style.display !== 'none'); }
    function ssClose() { if (ss && ss.wrap) { ss.wrap.style.display = 'none'; ss.wrap.querySelector('.hp-ss').style.transform = ''; } if (ss) { ss.pend = {}; ss.ctx = null; } }
    var SS_CSS = '#hp-score-sheet{position:absolute;inset:0;z-index:2147482000;background:rgba(0,0,0,.35);font:600 16px/1.25 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color:#f4f4ef;color-scheme:dark;}'
        + 'body > #hp-score-sheet{position:fixed;}'
        + '#hp-score-sheet .hp-ss{position:absolute;left:0;right:0;bottom:0;margin:0 auto;max-width:560px;height:90%;display:flex;flex-direction:column;background:#111611;border-radius:24px 24px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.45);transition:transform .18s ease;}'
        + '#hp-score-sheet .hp-ss-handle{width:42px;height:5px;border-radius:3px;background:#5b625a;margin:10px auto 2px;flex:0 0 auto;}'
        + '#hp-score-sheet .hp-ss-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:8px 18px 4px;flex:0 0 auto;}'
        + '#hp-score-sheet .hp-ss-title{font-size:clamp(20px,6vw,26px);font-weight:800;margin:0;color:#fff;}#hp-score-sheet .hp-ss-meta{font-size:14px;color:#a7aea4;white-space:nowrap;}'
        + '#hp-score-sheet .hp-ss-body{flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;padding:4px 18px 32px;scroll-padding-bottom:32px;}'
        // POLISH #34: room under the last row (Penalties, the note) so it always scrolls clear of the Save bar.
        + '#hp-score-sheet .hp-ss-chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 4px;}'
        + '#hp-score-sheet .hp-ss-chip{min-height:44px;padding:0 18px;border-radius:999px;background:#262c26;color:#f4f4ef;font-size:17px;font-weight:700;}'
        + '#hp-score-sheet .hp-ss-chip.on{background:#c8f07a;color:#0b0f0c;}'
        // URGENT-042: "+ Add" at the end of the golfer chips (its own class - never counted as a golfer).
        + '#hp-score-sheet .hp-ss-add{min-height:44px;padding:0 16px;border-radius:999px;background:transparent;color:#c8f07a;font-size:17px;font-weight:800;box-shadow:inset 0 0 0 1.5px #3f4a3f;white-space:nowrap;}'
        + '#hp-score-sheet .hp-ss-chip.hp-ss-new{box-shadow:0 0 0 3px rgba(200,240,122,.28);}'
        + '#hp-score-sheet .hp-ss-h{margin:16px 0 8px;font-size:14px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#d7dcd3;}#hp-score-sheet .hp-ss-h small{font-size:14px;font-weight:600;letter-spacing:0;text-transform:none;color:#8f978c;}'
        + '#hp-score-sheet .hp-ss-opts{display:grid;gap:8px;}#hp-score-sheet .hp-ss-c4{grid-template-columns:repeat(4,minmax(0,1fr));}#hp-score-sheet .hp-ss-c5{grid-template-columns:repeat(5,minmax(0,1fr));}'
        + '#hp-score-sheet .hp-ss-b{--ss-bg:#262c26;min-height:52px;border-radius:14px;background:var(--ss-bg);color:#f4f4ef;font-size:17px;font-weight:700;padding:0 4px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1;}'
        // The stats rows: equal buttons in one line while their words fit; at a large text size on a
        // small phone they wrap onto a second line rather than cut a word off.
        + '#hp-score-sheet .hp-ss-opts:not(.hp-ss-grid){display:flex;flex-wrap:wrap;}#hp-score-sheet .hp-ss-opts:not(.hp-ss-grid) .hp-ss-b{flex:1 1 0;min-width:max-content;padding:0 6px;white-space:nowrap;}'
        + '#hp-score-sheet .hp-ss-b.on{--ss-bg:#c8f07a;color:#0b0f0c;}#hp-score-sheet .hp-ss-b small{font-size:12px;font-weight:600;opacity:.8;}'
        + '#hp-score-sheet .hp-ss-grid .hp-ss-b{min-height:60px;font-size:22px;font-weight:800;}'
        + '#hp-score-sheet .hp-ss-n{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;}'
        // THE CARD'S MARKS (score-marks.js + score-marks-hp.js): double circle eagle or better, circle birdie,
        // box bogey, double box double bogey or worse - in the number's own colour.
        + '#hp-score-sheet .hp-ss-n.mark-birdie{box-shadow:inset 0 0 0 2px currentColor;border-radius:50%;}'
        + '#hp-score-sheet .hp-ss-n.mark-eagle{box-shadow:inset 0 0 0 2px currentColor,inset 0 0 0 4px var(--ss-bg),inset 0 0 0 6px currentColor;border-radius:50%;}'
        + '#hp-score-sheet .hp-ss-n.mark-bogey{box-shadow:inset 0 0 0 2px currentColor;border-radius:3px;width:34px;height:34px;}'
        + '#hp-score-sheet .hp-ss-n.mark-double{box-shadow:inset 0 0 0 2px currentColor,inset 0 0 0 4px var(--ss-bg),inset 0 0 0 6px currentColor;border-radius:3px;}'
        + '#hp-score-sheet .hp-ss-par .hp-ss-n{height:28px;}#hp-score-sheet .hp-ss-more{margin-top:8px;}'
        + '#hp-score-sheet .hp-ss-note{font-size:14px;color:#a7aea4;margin:14px 2px 0;}'
        + '#hp-score-sheet textarea.hp-ss-notes{width:100%;box-sizing:border-box;min-height:84px;margin-top:8px;border-radius:12px;border:1px solid #3a423a;background:#1b211b;color:#f4f4ef;font-family:inherit;font-size:16px;font-weight:500;line-height:1.35;padding:10px;}'
        + '#hp-score-sheet .hp-ss-saved{font-size:12px;color:#8f978c;margin:14px 2px 0;}'
        // Notes | Save on one line; when Save's words do not fit beside Notes (large text, small phone),
        // Save moves up onto its own line above Notes - never wrapped or cut.
        + '#hp-score-sheet .hp-ss-foot{flex:0 0 auto;display:flex;flex-wrap:wrap-reverse;gap:12px;padding:12px 18px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #262c26;}'
        + '#hp-score-sheet .hp-ss-notes-btn{flex:1 1 28%;min-width:max-content;padding:0 16px;white-space:nowrap;min-height:56px;border-radius:16px;background:#262c26;color:#f4f4ef;font-size:18px;font-weight:600;}#hp-score-sheet .hp-ss-notes-btn.on{box-shadow:inset 0 0 0 2px #c8f07a;}'
        // 018: the hole stepper - an EARLIER hole's score in this same sheet, the map / card left on its hole.
        + '#hp-score-sheet .hp-ss-step{display:flex;align-items:center;gap:6px;}#hp-score-sheet .hp-ss-step button{min-width:40px;min-height:40px;border-radius:12px;background:#262c26;color:#f4f4ef;font-size:22px;font-weight:800;}#hp-score-sheet .hp-ss-step button[disabled]{opacity:.3;}'
        + '#hp-score-sheet .hp-ss-earlier{margin:2px 18px 0;font-size:14px;color:#c8f07a;}'
        + '#hp-score-sheet .hp-ss-save{flex:2 1 60%;min-width:max-content;padding:0 16px;white-space:nowrap;min-height:56px;border-radius:16px;background:#c8f07a;color:#0b0f0c;font-size:clamp(17px,5vw,21px);font-weight:800;}';
    function ssEl(tag, cls, text, attrs) { var e = el(tag, cls, text); if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (tag === 'button') e.type = 'button'; return e; }
    function ssBuild(host) {
        var wrap = el('div', 'gps-scroll-ok');
        wrap.id = 'hp-score-sheet';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-label', 'Enter score');
        var st = el('style'); st.textContent = SS_CSS; wrap.appendChild(st);
        var card = el('div', 'hp-ss');
        card.appendChild(el('div', 'hp-ss-handle'));
        var head = el('div', 'hp-ss-head');
        var step = el('div', 'hp-ss-step');
        step.appendChild(ssEl('button', 'hp-ss-back', '\u2039', { 'data-ss-step': '-1', 'aria-label': 'Earlier hole' }));
        step.appendChild(el('h2', 'hp-ss-title'));
        step.appendChild(ssEl('button', 'hp-ss-fwd', '\u203a', { 'data-ss-step': '1', 'aria-label': 'Later hole' }));
        head.appendChild(step); head.appendChild(el('div', 'hp-ss-meta')); card.appendChild(head);
        card.appendChild(el('div', 'hp-ss-earlier'));
        card.appendChild(el('div', 'hp-ss-body'));
        var foot = el('div', 'hp-ss-foot');
        foot.appendChild(ssEl('button', 'hp-ss-notes-btn', 'Notes', { 'data-ss-notes': '1' }));
        foot.appendChild(ssEl('button', 'hp-ss-save', 'Save', { 'data-ss-save': '1' }));
        card.appendChild(foot);
        wrap.appendChild(card);
        wrap.addEventListener('click', ssClick);
        wrap.addEventListener('input', function (e) {
            var t = e.target;
            if (!ss || !ss.ctx || !t || !t.classList || !t.classList.contains('hp-ss-notes')) return;
            // URGENT-047 C: the phone's own golfer - the caddie note for this course's hole (every round).
            if (t.getAttribute('data-ss-caddie')) { caddieSet(t.getAttribute('data-ss-caddie'), ss.ctx.hole, t.value); return; }
            qSet(ss.ctx, ss.sel, ss.ctx.hole, { note: t.value }, ssStrokes(ss.sel), ss.ctx.par);
        });
        // SWIPE DOWN TO CLOSE: from the handle / title, or anywhere once the list is at its top.
        var y0 = null, dy = 0;
        card.addEventListener('touchstart', function (e) {
            var body = card.querySelector('.hp-ss-body');
            var inBody = body.contains(e.target);
            if (e.target.closest && e.target.closest('textarea')) { y0 = null; return; }
            y0 = (!inBody || body.scrollTop <= 0) && e.touches.length === 1 ? e.touches[0].clientY : null; dy = 0;
        }, { passive: true });
        card.addEventListener('touchmove', function (e) {
            if (y0 == null) return;
            dy = e.touches[0].clientY - y0;
            if (dy > 0) { card.style.transition = 'none'; card.style.transform = 'translateY(' + dy + 'px)'; }
        }, { passive: true });
        card.addEventListener('touchend', function () {
            if (y0 == null) return;
            card.style.transition = '';
            if (dy > 90) ssClose(); else card.style.transform = '';
            y0 = null; dy = 0;
        });
        return wrap;
    }
    // ctx: { code, course, hole, par, si, yards, golfers: [{ id, name }], pick, stats (bool: GPS Map + quick
    //        stats on), score(pid) -> saved score, save(pid, n) -> the card's own save, next() -> the next
    //        hole in play order, last (no next hole), host }
    function ssOpen(ctx) {
        if (!ctx || !ctx.golfers || !ctx.golfers.length) return false;
        if (!ss) ss = { wrap: null };
        if (!ss.wrap) ss.wrap = ssBuild();
        var host = ctx.host || W.document.body;
        if (ss.wrap.parentNode !== host) host.appendChild(ss.wrap);
        ss.ctx = ctx; ss.pend = {}; ss.more = false; ss.notes = false; ss.added = null;
        if (ctx.home == null) ctx.home = ctx.hole;
        var pick = ctx.golfers.filter(function (g) { return String(g.id) === String(ctx.pick); })[0];
        ss.sel = String((pick || ctx.golfers[0]).id);
        ss.wrap.style.display = '';
        ss.wrap.querySelector('.hp-ss').style.transform = '';
        ssRender();
        return true;
    }
    function ssRender() {
        if (!ss || !ss.ctx) return;
        var c = ss.ctx, w = ss.wrap, pid = ss.sel, par = Number(c.par) || 0;
        w.querySelector('.hp-ss-title').textContent = 'Hole ' + c.hole + (par ? ' · Par ' + par : '');
        // 018: EARLIER HOLES, IN THIS SHEET. ‹ / › step through the holes played so far (play order, up
        // to the hole the sheet opened on); the map and the card stay where they are.
        var rng = ssRange(), at = rng.indexOf(Number(c.hole));
        var bk = w.querySelector('[data-ss-step="-1"]'), fw = w.querySelector('[data-ss-step="1"]');
        bk.style.display = fw.style.display = rng.length > 1 ? '' : 'none';
        bk.disabled = at <= 0; fw.disabled = at < 0 || at >= rng.length - 1;
        var away = Number(c.hole) !== Number(c.home);
        // URGENT-044: just added from the score sheet - "Tim added — from hole 4. Holes 1–3 blank."
        var ad = !away && ss.added && ss.added.ctx === c && Number(ss.added.hole) === Number(c.hole) ? ss.added : null;
        w.querySelector('.hp-ss-earlier').textContent = away ? 'An earlier hole \u2014 Save goes back to hole ' + c.home + '.' : ad ? ad.line : '';
        w.querySelector('.hp-ss-meta').textContent = [c.si ? 'HCP ' + c.si : '', c.yards ? c.yards + 'y' : ''].filter(Boolean).join(' · ');
        var body = w.querySelector('.hp-ss-body'), keep = ss.toTop ? 0 : body.scrollTop;
        ss.toTop = false;
        body.textContent = '';
        // GOLFERS
        var chips = el('div', 'hp-ss-chips');
        c.golfers.forEach(function (g) {
            var s = ssStrokes(String(g.id));
            chips.appendChild(ssEl('button', 'hp-ss-chip' + (String(g.id) === pid ? ' on' : '') + (ad && ad.id === String(g.id) ? ' hp-ss-new' : ''), (g.name || ('Player ' + g.id)) + (s ? ' · ' + s : ''), { 'data-ss-golfer': String(g.id), 'aria-pressed': String(g.id) === pid ? 'true' : 'false' }));
        });
        // URGENT-042: "+ Add" (a solo round: "+ Add golfer") - the Round Menu's own Add golfer sheet.
        if (ssCanAdd() && !away) chips.appendChild(ssEl('button', 'hp-ss-add', c.golfers.length === 1 ? '+ Add golfer' : '+ Add', { 'data-ss-add': '1', 'aria-label': 'Add a golfer from hole ' + c.home }));
        body.appendChild(chips);
        // SCORE
        var cur = ssStrokes(pid);
        body.appendChild(el('div', 'hp-ss-h', 'Score'));
        var grid = el('div', 'hp-ss-opts hp-ss-c4 hp-ss-grid');
        var scoreBtn = function (n) {
            var b = ssEl('button', 'hp-ss-b' + (cur === n ? ' on' : ''), null, { 'data-ss-score': String(n), 'aria-pressed': cur === n ? 'true' : 'false', 'aria-label': String(n) + (n === par ? ', par' : '') });
            var m = ssMark(n, par);
            b.appendChild(el('span', 'hp-ss-n' + (m ? ' mark-' + m : ''), String(n)));
            if (n === par) { b.classList.add('hp-ss-par'); b.appendChild(el('small', null, 'Par')); }
            return b;
        };
        var g7 = ssGrid(par), extra = ssMore(par);
        g7.forEach(function (n) { grid.appendChild(scoreBtn(n)); });
        var outside = cur && g7.indexOf(cur) === -1;
        var mb = ssEl('button', 'hp-ss-b' + (outside ? ' on' : ''), null, { 'data-ss-more': '1', 'aria-expanded': ss.more ? 'true' : 'false' });
        if (outside) { var m0 = ssMark(cur, par); mb.appendChild(el('span', 'hp-ss-n' + (m0 ? ' mark-' + m0 : ''), String(cur))); } else mb.appendChild(el('span', null, 'More'));
        grid.appendChild(mb);
        body.appendChild(grid);
        if (ss.more) {
            var mg = el('div', 'hp-ss-opts hp-ss-c4 hp-ss-grid hp-ss-more');
            extra.forEach(function (n) { mg.appendChild(scoreBtn(n)); });
            body.appendChild(mg);
        }
        // STATS - optional, this phone only.
        var foot = w.querySelector('.hp-ss-foot');
        var showStats = ssStatsFor(pid);
        foot.querySelector('[data-ss-notes]').style.display = showStats ? '' : 'none';
        foot.querySelector('[data-ss-notes]').classList.toggle('on', !!ss.notes);
        // URGENT-034: while another golfer still has no score, the button says where it goes - "Next:
        // Paul ›" - and only moves the sheet there (each score is already saved). Everyone else scored:
        // Save, as before.
        var sv = foot.querySelector('[data-ss-save]'), nxt = ssNextTarget(), nxg = nxt == null ? null : c.golfers.filter(function (g) { return String(g.id) === nxt; })[0];
        if (nxg) sv.setAttribute('data-ss-next', nxt); else sv.removeAttribute('data-ss-next');
        sv.textContent = nxg ? 'Next: ' + (nxg.name || ('Player ' + nxg.id)) + ' \u203a' : (away ? 'Save · back to hole ' + c.home : (c.last ? 'Save' : 'Save · Next hole ›'));
        if (showStats) {
            // 052 C: the card's length of this hole, for Off the tee (this phone; a number).
            if (c.yards && ssIsOwn(pid)) sgSetYards(c.code, c.hole, c.yards);
            var cell = ssCell(pid);
            var row = function (title, sub, key, cols, opts, on) {
                var h = el('div', 'hp-ss-h', title); if (sub) h.appendChild(el('small', null, ' · ' + sub));
                body.appendChild(h);
                var o = el('div', 'hp-ss-opts hp-ss-c' + cols); o.setAttribute('data-ss-row', key);
                opts.forEach(function (x) {
                    var isOn = on(x[0]);
                    var b = ssEl('button', 'hp-ss-b' + (isOn ? ' on' : ''), x[1], { 'data-ss-k': key, 'data-ss-v': String(x[0]), 'aria-pressed': isOn ? 'true' : 'false' });
                    if (x[2] && isOn) b.appendChild(el('small', null, x[2]));
                    o.appendChild(b);
                });
                body.appendChild(o);
            };
            row('Putts', null, 'putts', 5, [[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4+']], function (v) { return cell.putts === v; });
            // 052 C: FIRST PUTT - one optional tap (feet), for Strokes Gained. Never asked for, never in the
            // way of the score or the Next / Save; no first putt with 0 putts (holed from off the green).
            if (cell.putts !== 0) row('First putt', 'ft \u00b7 optional', 'fp', 6, SG_FP_CHIPS, function (v) { return cell.fp === v; });
            if (fwAsked(par)) row('Tee shot', null, 'fw', 4, [['L', '← Left'], ['hit', 'Fairway'], ['R', 'Right →'], ['S', 'Short']], function (v) { return cell.fw === v; });
            var gv = ssGir(cell);
            row('Green in reg', 'auto from score + putts', 'gd', 5, [['hit', 'Hit', gv.auto ? 'auto' : ''], ['short', 'Short'], ['long', 'Long'], ['L', 'Left'], ['R', 'Right']], function (v) { return gv.v === v; });
            row('Bunker shots', null, 'bunker', 4, [[0, '0'], [1, '1'], [2, '2'], [3, '3+']], function (v) { return cell.bunker === v; });
            row('Penalties', null, 'pen', 4, [[0, '0'], [1, '1'], [2, '2'], [3, '3+']], function (v) { return cell.pen === v; });
            if (ss.notes && ssCaddieFor(pid)) {
                // URGENT-047 C: the caddie note - this course's hole, shown on it every time you play here.
                var ck = ssCourseKey(), ch = el('div', 'hp-ss-h', 'Caddie note'); ch.appendChild(el('small', null, ' · hole ' + c.hole));
                body.appendChild(ch);
                var cta = el('textarea', 'hp-ss-notes hp-ss-caddie'); cta.value = caddieLine(ck, c.hole); cta.maxLength = CADDIE_MAX;
                cta.setAttribute('data-ss-caddie', ck); cta.setAttribute('aria-label', 'Caddie note for hole ' + c.hole); cta.setAttribute('placeholder', 'e.g. don’t go left');
                body.appendChild(cta);
                body.appendChild(el('div', 'hp-ss-note', 'Shows on hole ' + c.hole + ' every time you play here. Only on this phone.'));
            } else if (ss.notes) {
                body.appendChild(el('div', 'hp-ss-h', 'Notes'));
                var ta = el('textarea', 'hp-ss-notes'); ta.value = cell.note || ''; ta.setAttribute('aria-label', 'Notes for this hole'); ta.maxLength = 500;
                body.appendChild(ta);
            }
            body.appendChild(el('div', 'hp-ss-saved', 'Saved on this phone'));
        } else if (c.stats) {
            body.appendChild(el('div', 'hp-ss-note', 'Stats are kept for your golfer. To keep them for others too: Tools › Track stats for others.'));
        }
        body.scrollTop = keep;
    }
    function ssClick(e) {
        if (!ss || !ss.ctx) return;
        var t = e.target, b;
        if (t === ss.wrap) { ssClose(); return; }
        var c = ss.ctx, pid = ss.sel;
        if ((b = t.closest('[data-ss-golfer]'))) { ss.sel = b.getAttribute('data-ss-golfer'); ss.more = false; ss.notes = false; ssRender(); return; }
        if ((b = t.closest('[data-ss-step]'))) { ssStep(Number(b.getAttribute('data-ss-step'))); return; }
        if (t.closest('[data-ss-add]')) { ssAddGolfer(); return; }
        if ((b = t.closest('[data-ss-more]'))) { ss.more = !ss.more; ssRender(); return; }
        if ((b = t.closest('[data-ss-score]'))) {
            var n = Number(b.getAttribute('data-ss-score'));
            ss.pend[pid] = n;
            // URGENT-034 BUG 3: EVERY SCORE TAP IS SAVED AT ONCE - the card's own save (saveScore: the
            // offline queue, the audit line), not held until "Save · Next hole". Held, a sheet closed any
            // other way (the backdrop, a swipe, a hole change, the bar tapped again) lost them all.
            // ssKeepOne also works the GIR out again for a record that already holds this hole.
            ssKeepOne(pid);
            // int-061: the save can close the sheet under us (the round moves on to another hole): nothing more to do.
            if (!ss || !ss.ctx) return;
            if (ss.more && ssGrid(c.par).indexOf(n) === -1) ss.more = false;
            // POLISH #34: on to the next golfer with no score on this hole - once this golfer's own
            // stats rows (when shown) have their putts too, so a golfer's putts are never skipped.
            // URGENT-034: never the phone's own golfer - they stay until they tap to move on.
            if (!ssIsOwn(pid) && (!ssStatsFor(pid) || ssCell(pid).putts != null)) ssAdvance(pid);
            ssRender(); return;
        }
        if ((b = t.closest('[data-ss-k]'))) {
            if (!ssStatsFor(pid)) return;
            var k = b.getAttribute('data-ss-k'), v = b.getAttribute('data-ss-v'), cell = ssCell(pid), patch = {};
            if (k === 'gd') patch = ssGirTap(cell, v);
            else if (k === 'fw') patch.fw = cell.fw === v ? null : v;
            else if (k === 'fp') patch.fp = cell.fp === v ? null : v;   // 052 C: a chip id; tap again = cleared
            else { var nv = Number(v); patch[k] = cell[k] === nv ? null : nv; }
            qSet(c, pid, c.hole, patch, ssStrokes(pid), c.par);
            if (!ss || !ss.ctx) return;   // int-061: closed meanwhile (a fast double tap, a hole change)
            // POLISH #34: score and putts in - the next golfer with no score (other stats: tap back).
            // URGENT-034: never the phone's own golfer (Tee shot, Green in reg, Bunker, Penalties still to come).
            if (k === 'putts' && patch.putts != null && ssStrokes(pid) > 0 && !ssIsOwn(pid)) ssAdvance(pid);
            ssRender(); return;
        }
        if (t.closest('[data-ss-notes]')) { ss.notes = !ss.notes; ssRender(); if (ss.notes) { var ta = ss.wrap.querySelector('.hp-ss-notes'); if (ta) { try { ta.scrollIntoView({ block: 'center' }); ta.focus(); } catch (er) {} } } return; }
        if (t.closest('[data-ss-save]')) {
            // URGENT-034: "Next: Paul ›" - to that golfer; what was typed stays in the sheet until Save.
            var nt = ssNextTarget();
            if (nt != null) { ss.sel = nt; ss.more = false; ss.notes = false; ss.toTop = true; ssRender(); return; }
            ssSave(); return;
        }
    }
    // POLISH #34: the next golfer (after this one, wrapping) with no score on this hole, typed or
    // saved; none left - the sheet stays where it is.
    function ssNextOpen(pid) {
        var gs = (ss.ctx && ss.ctx.golfers) || [], i = -1;
        gs.forEach(function (g, k) { if (String(g.id) === String(pid)) i = k; });
        for (var s2 = 1; s2 < gs.length; s2++) {
            var g = gs[(i + s2 + gs.length) % gs.length];
            if (!(ssStrokes(String(g.id)) > 0)) return String(g.id);
        }
        return null;
    }
    // URGENT-034: where the bottom button goes - while any OTHER golfer still has no score on this hole,
    // the next one of them after the golfer shown (wrapping). Every score is saved at its tap, so the
    // button only moves the sheet; with everyone else scored it is Save again.
    function ssNextTarget() { return ss && ss.ctx ? ssNextOpen(ss.sel) : null; }
    function ssAdvance(pid) {
        var nx = ssNextOpen(pid);
        if (nx == null) return false;
        ss.sel = nx; ss.more = false; ss.notes = false; ss.toTop = true;
        return true;
    }
    // ---- URGENT-042: "+ ADD" ON THE SCORE SHEET ------------------------------------------
    // The add itself is the Round Menu's Add golfer sheet in its short form (URGENT-044:
    // gps-add-golfer.js HardPanAddGolfer.open({ short: true, fromHole: N }): Name, HCP, Tee; the Players sheet's own buildPlayersUpdate, one guarded update of the round).
    // Nothing here writes a golfer. A golfer added on hole N has no scores at all, so the holes
    // before N are blank on the card; their scores start with the one typed here. The organizer
    // only (canReachSetup - the add sheet's own gate), and only on the hole the sheet opened on.
    /* global canReachSetup */
    function ssCanAdd() {
        var A = W.HardPanAddGolfer;
        if (!A || typeof A.open !== 'function') return false;
        try { return typeof canReachSetup === 'function' && !!canReachSetup(); } catch (e) { return false; }
    }
    function ssAddGolfer() {
        var c = ss && ss.ctx, A = W.HardPanAddGolfer;
        if (!c || !A || Number(c.hole) !== Number(c.home)) return false;
        ssKeep();   // every tap is already saved; nothing typed is lost under the add sheet
        var had = c.golfers.map(function (g) { return String(g.id); }), added = null;
        // URGENT-044: the SHORT form of the same sheet (Name, HCP, Tee, "Add from hole N", one button,
        // Cancel) - over this one, which stays put behind it. The full sheet stays in Round settings.
        var before = ssRange().slice(0, -1);
        var ok = A.open({ short: true, fromHole: Number(c.home), holes: Array.isArray(c.holes) ? c.holes.map(Number) : null, before: before,
            where: String(c.course || '').split(' (')[0], onDone: function (list) { added = list || []; } });
        if (!ok) return false;
        var box = W.document.getElementById('hp-addg');
        var back = function () {
            if (!ss || ss.ctx !== c) return;   // the score sheet was closed meanwhile
            ss.wrap.style.display = '';
            if (!added || !added.length || typeof c.at !== 'function') { ssRender(); return; }
            // Back on the score sheet with the new golfer picked, once the card draws their box
            // (the round's own listener). Bounded: never a never-ending timer.
            var t0 = Date.now();
            (function wait() {
                if (!ss || ss.ctx !== c) return;
                var nx = null; try { nx = c.at(c.home); } catch (e) {}
                var fresh = nx && nx.golfers ? nx.golfers.filter(function (g) { return had.indexOf(String(g.id)) === -1; }) : [];
                if (!fresh.length && Date.now() - t0 < 6000) { setTimeout(wait, 150); return; }
                if (fresh.length) {
                    ['golfers', 'score', 'save'].forEach(function (k) { if (nx[k] !== undefined) c[k] = nx[k]; });
                    var g = fresh[fresh.length - 1], nm = g.name || added[added.length - 1].name, bl = typeof A.blankHoles === 'function' ? A.blankHoles(before) : '';
                    ss.sel = String(g.id); ss.more = false; ss.notes = false; ss.toTop = true;
                    ss.added = { ctx: c, id: String(g.id), hole: Number(c.home), line: nm + ' added \u2014 from hole ' + c.home + '.' + (bl ? ' ' + bl + ' blank.' : '') };
                }
                ssRender();
            })();
        };
        if (box && typeof W.MutationObserver === 'function') {
            var mo = new W.MutationObserver(function () { if (box.classList.contains('open')) return; mo.disconnect(); back(); });
            mo.observe(box, { attributes: true, attributeFilter: ['class'] });
        } else back();
        return true;
    }
    // SAVE: each score typed here, through the card's own save; then the next hole (the card's
    // own Next - play order, the KP question) unless this is the last one.
    // The holes the stepper walks: play order (ctx.holes) up to the hole the sheet opened on.
    function ssRange() {
        var c = ss && ss.ctx;
        if (!c || !Array.isArray(c.holes) || typeof c.at !== 'function') return [];
        var hs = c.holes.map(Number), i = hs.indexOf(Number(c.home));
        return i < 0 ? [] : hs.slice(0, i + 1);
    }
    // To an earlier (or back to a later) hole: what was typed here is saved first, through the
    // card's own save; then the sheet shows that hole (ctx.at: its par, its golfers, its scores).
    function ssStep(dir) {
        var c = ss.ctx, rng = ssRange(), i = rng.indexOf(Number(c.hole));
        ssGoto(rng[i + dir]);
    }
    // URGENT-034 (the compact card): straight to one hole of the stepper's range, as ‹ / › would.
    function ssGoto(to) {
        var c = ss && ss.ctx, rng = ssRange();
        if (!c || to == null || rng.indexOf(Number(to)) === -1) return false;
        to = Number(to);
        if (to === Number(c.hole)) return true;
        var nx = c.at(to);
        if (!nx || !nx.golfers || !nx.golfers.length) return false;
        ssKeep();
        Object.keys(nx).forEach(function (k) { c[k] = nx[k]; });
        c.hole = to;
        ss.pend = {}; ss.more = false; ss.notes = false;
        if (!nx.golfers.some(function (g) { return String(g.id) === String(ss.sel); })) ss.sel = String(nx.golfers[0].id);
        ssRender();
        return true;
    }
    // One golfer's typed score on the hole shown, through the card's own save (once per change).
    function ssKeepOne(pid) {
        var c = ss.ctx, n = ss.pend[pid];
        if (!(n > 0)) return;
        if (n !== Number(c.score ? c.score(pid) : 0)) c.save(pid, n);
        ssDone[c.code + '|' + pid + '|' + c.hole] = n;
        var rec = qLoad(c.code, pid);
        if (rec && rec.holes[String(c.hole)]) qSet(c, pid, c.hole, {}, n, c.par);
    }
    function ssKeep() {
        var c = ss.ctx, pend = ss.pend;
        Object.keys(pend).forEach(function (pid) {
            var n = pend[pid];
            if (!(n > 0)) return;
            if (n !== Number(c.score ? c.score(pid) : 0)) c.save(pid, n);
            ssDone[c.code + '|' + pid + '|' + c.hole] = n;
            var rec = qLoad(c.code, pid);
            if (rec && rec.holes[String(c.hole)]) qSet(c, pid, c.hole, {}, n, c.par);
        });
        ss.pend = {};
    }
    function ssSave() {
        var c = ss.ctx, pend = ss.pend;
        // AN EARLIER HOLE (018): saved, and the sheet closes - back on the hole it opened on, never Next.
        if (Number(c.hole) !== Number(c.home)) { ssKeep(); var back = c.back; ssClose(); if (typeof back === 'function') back(); return; }
        Object.keys(pend).forEach(function (pid) {
            var n = pend[pid];
            if (!(n > 0)) return;
            if (n !== Number(c.score ? c.score(pid) : 0)) c.save(pid, n);
            ssDone[c.code + '|' + pid + '|' + c.hole] = n;
            var rec = qLoad(c.code, pid);
            if (rec && rec.holes[String(c.hole)]) qSet(c, pid, c.hole, {}, n, c.par);
        });
        var last = c.last, next = c.next, finish = c.finish;
        // POLISH #10: the last hole saved with every golfer on the sheet scored - "Finish & settle
        // up" opens (ctx.finish: display only, nothing is finished or written by it).
        var allIn = last && (c.golfers || []).every(function (g) { return ssStrokes(String(g.id)) > 0; });
        // 052 C: the phone's own golfer keeps stats - this round's Strokes Gained first; its Done goes on to Finish.
        var own = ('own' in c) ? c.own : c.pick, sgCard = allIn && c.stats && own != null && !practiceOn(c.code);
        ssClose();
        if (!last && typeof next === 'function') next();
        else if (allIn && typeof finish === 'function') { var go = function () { try { finish(); } catch (e) {} }; var shown = false; try { shown = sgCard && sgRoundCard(c.code, go); } catch (e) { shown = false; } if (!shown) go(); }
    }
    // TOOLS: "Track stats for others" - this phone only, off by default.
    function ssPlaceToggle(menu) {
        if (!menu) return;
        var b = menu.querySelector('.hp-ss-others');
        if (!b) {
            b = ssEl('button', 'gps-menu-item hp-ss-others', null, { role: 'menuitemcheckbox' });
            b.addEventListener('click', function (e) { e.preventDefault(); setOthers(!othersOn()); label(); if (ssIsOpen()) ssRender(); });
            menu.appendChild(b);
        }
        function label() { b.textContent = 'Track stats for others: ' + (othersOn() ? 'On' : 'Off'); b.setAttribute('aria-checked', othersOn() ? 'true' : 'false'); }
        label();
        return b;
    }

    // ---- URGENT-047 C: CADDIE NOTES PER HOLE ---------------------------------------------------
    // The score sheet's Notes, for the golfer this phone IS, is a caddie note for THE COURSE'S hole
    // ("don't go left"): kept by course key + hole number, not by round, and shown as one small line
    // on that hole's GPS bar every time this phone plays there (gps-view.js syncCaddieLine).
    // PRIVATE: on this phone only (localStorage hardpan_caddie_v1) - the live rules have no private
    // per-user path that takes it, so nothing here touches Firebase. A note saved while an account is
    // signed in carries that account's uid, and another signed-in account on the same phone never
    // sees it. Each note holds its text and when it was written - NO LOCATION, no round, no golfer name.
    // The other golfers' Notes (Track stats for others) stay what they were: a note on this round.
    var CADDIE_KEY = 'hardpan_caddie_v1', CADDIE_MAX = 140;
    // The signed-in (not anonymous) account, as the GPS screen knows it (gps-view.js bagUid) - this file reads no database.
    function caddieUid() { try { var G = W.HardPanGps, u = G && typeof G.accountUid === 'function' ? G.accountUid() : null; return u ? String(u) : null; } catch (e) { return null; } }
    function caddieAll() { var v = lsGet(CADDIE_KEY); return v && v.v === 1 && v.notes && typeof v.notes === 'object' ? v : { v: 1, notes: {} }; }
    function caddieText(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, CADDIE_MAX); }
    function caddieOk(courseKey, hole) { return !!courseKey && Number(hole) > 0; }
    // The note's record { t, at, uid } for this phone's account, or null.
    function caddieGet(courseKey, hole) {
        if (!caddieOk(courseKey, hole)) return null;
        var c = caddieAll().notes[String(courseKey)], n = c && c[String(Number(hole))];
        if (!n || !n.t) return null;
        var me = caddieUid();
        if (n.uid && me && n.uid !== me) return null;   // another account's note on this phone
        return n;
    }
    function caddieLine(courseKey, hole) { var n = caddieGet(courseKey, hole); return n ? n.t : ''; }
    // Empty text removes the note. Returns the text kept ('' when none).
    function caddieSet(courseKey, hole, text) {
        if (!caddieOk(courseKey, hole)) return '';
        var st = caddieAll(), k = String(courseKey), h = String(Number(hole)), t = caddieText(text);
        var c = st.notes[k] || {};
        if (t) { var rec = { t: t, at: Date.now() }, u = caddieUid(); if (u) rec.uid = u; c[h] = rec; } else delete c[h];
        if (Object.keys(c).length) st.notes[k] = c; else delete st.notes[k];
        lsSet(CADDIE_KEY, st);
        try { if (W.HardPanGps && typeof W.HardPanGps.caddieChanged === 'function') W.HardPanGps.caddieChanged(); } catch (e) {}
        return t;
    }
    // The course the score sheet is on: the ctx's own key, else the GPS screen's mounted course.
    function ssCourseKey() {
        var c = ss && ss.ctx;
        if (c && c.courseKey) return String(c.courseKey);
        try { var k = W.HardPanGps && typeof W.HardPanGps.courseKey === 'function' ? W.HardPanGps.courseKey() : null; return k ? String(k) : null; } catch (e) { return null; }
    }
    // Notes on the sheet is a caddie note for the phone's own golfer when the course is known.
    function ssCaddieFor(pid) { return ssIsOwn(pid) && caddieOk(ssCourseKey(), ss.ctx.hole); }

    // ============================================================================
    // URGENT-052 C - STROKES GAINED (LITE). The golfer this phone IS, from what is already on
    // this phone: the score (snap), putts, the tee shot (fw), penalties (pen), the NEW first-putt
    // length (fp, one optional tap on the score sheet) and Mark shot's marks (each one's yards to
    // the green's centre - a DISTANCE, never a position: hardpan_sg_v1_<code>). Read-only on the
    // score: nothing here writes a score or a putt, and no money engine reads any of it.
    //
    // THE BENCHMARK: "HardPan baseline (estimated)". Our own smooth curves, SHAPED ON the
    // expected-strokes values Mark Broadie published (Every Shot Counts, 2014; Columbia Business
    // School working papers on PGA Tour ShotLink data). No table is copied or bundled: each lie
    // is one formula whose few parameters were fitted to a handful of his publicly quoted Tour
    // values plus a scratch margin (putts +0.03, fairway +0.06, rough / tee +0.08), then rounded.
    // Fit (052-c, tools in the report): tee within 0.08, fairway 0.02, rough 0.02, green 0.03 of
    // anchor + margin. 10 and 20 handicap = scratch + (hcp / 20) x an extra per shot that grows
    // with distance, sized so a typical par-72 card sums to ~82 (10) and ~92 (20). ESTIMATED -
    // the (i) says so. TOUR / PLUS (added 2:21 PM, Manny +3.7): the same curves WITHOUT the scratch margin -
    // i.e. at the Broadie Tour anchors themselves (same source); also estimated. Card ~71.6 - 1.4 = ~70.2.
    //
    //   expected strokes to hole out (scratch), d in yards, f in feet:
    //   tee      2.81 + 0.00185 d + 0.52 / (1 + e^-((d - 263) / 16.7)) + 0.00313 max(0, d - 426)
    //   fairway  1.665 + 1.047 (1 - e^(-d / 14.34)) + 1.364e-5 d^2
    //   rough    2.201 + 0.780 (1 - e^(-d / 22.29)) + 1.289e-5 d^2
    //   mixed    (fairway + rough) / 2       (a mark whose lie we do not know)
    //   green    1 + (1 - 1 / (1 + (f / 7.74)^2.37)) + 0.00643 max(0, f - 22.2)
    //   extra per shot at handicap h (k = h / 20):
    //   tee  k (0.40 + 0.0019 d)   fairway  k (0.20 + 0.0028 d)   rough / mixed  k (0.30 + 0.0030 d)
    //   green  k (0.08 + 0.004 min(f, 60))
    //
    // THE HOLE (each stroke from where it started to where it stopped; SG = E(before) - E(after) - 1):
    //   start = the tee at the card's yards (else the GPS tee -> green), lie tee
    //   marks = Mark shot's marks off the green, in order, = where the ball was after strokes
    //           1, 2, ...  (a first mark within 20 yds of the tee distance = the tee: dropped; two
    //           marks within 2 yds = one). Mark 1 on a par 4/5 takes its lie from the tee-shot answer
    //           (Fairway -> fairway, a miss -> rough, none -> mixed); every other mark is mixed.
    //   green = the first-putt length (fp chip, its middle: <3 = 2, 3-6 = 4.5, 6-10 = 8, 10-20 = 15,
    //           20-40 = 30, 40+ = 50 ft); 0 putts = holed from off the green (no fp needed).
    //   shots = score - putts - penalties. Penalty strokes are charged to the tee shot.
    //   Category of a stroke: the tee shot on a par 4/5 = OFF THE TEE; from more than 50 yds =
    //   APPROACH (banded by its start: under 100 / 100-125 / 125-150 / 150-175 / 175+); from 50
    //   yds in = AROUND THE GREEN; on the green = PUTTING (E(fp) - putts).
    //   Strokes no mark separates (two or more from beyond 50 yds) cannot be split, so the
    //   categories they could belong to are NOT COUNTED on that hole (never guessed).
    // A hole COUNTS for a category when every stroke of that category on it was measured (a par 3
    // has no tee shot to measure, so it counts for Off the tee - in a round with at least one
    // drive marked). NOT ENOUGH DATA until a category has 18 such holes; the total leaves it out
    // and says so. Per round = the category's strokes gained x 18 / its holes.
    // ============================================================================
    var SGKEY = 'hardpan_sg_v1_', SG_BENCH_KEY = 'hardpan_sg_bench', SG_LAST_KEY = 'hardpan_sg_last';
    var SG_MIN = 18, SG_ARG_YD = 50;
    // URGENT-052 C (2:21 PM, Manny +3.7): a 4th benchmark, TOUR / PLUS ('tour') - the same curves AT the
    // Broadie Tour anchors, i.e. without the scratch margin (putts -0.03, fairway -0.06, rough / tee -0.08,
    // mixed -0.07), no handicap extra. Also estimated; same source as above.
    var SG_BENCHES = ['tour', 0, 10, 20];
    var SG_TOUR_MARGIN = { green: 0.03, fairway: 0.06, rough: 0.08, tee: 0.08, mixed: 0.07 };
    var SG_FP = { lt3: 2, '3-6': 4.5, '6-10': 8, '10-20': 15, '20-40': 30, '40p': 50 };
    var SG_FP_CHIPS = [['lt3', '<3'], ['3-6', '3–6'], ['6-10', '6–10'], ['10-20', '10–20'], ['20-40', '20–40'], ['40p', '40+']];
    var SG_BANDS = [['u100', 'Under 100', 0, 100], ['100-125', '100–125', 100, 125], ['125-150', '125–150', 125, 150], ['150-175', '150–175', 150, 175], ['175p', '175+', 175, 1e9]];
    var SG_NAMES = { ott: 'Off the tee', app: 'Approach', arg: 'Around the green', putt: 'Putting' };
    var SG_CATS = ['ott', 'app', 'arg', 'putt'];
    // ---- THE BASELINE (pure) ----
    function sgClamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
    function sgTee(d) { d = sgClamp(d, 60, 700); return 2.81 + 0.00185 * d + 0.52 / (1 + Math.exp(-(d - 263) / 16.7)) + 0.00313 * Math.max(0, d - 426); }
    function sgFair(d) { d = sgClamp(d, 0.5, 400); return 1.665 + 1.047 * (1 - Math.exp(-d / 14.34)) + 1.364e-5 * d * d; }
    function sgRough(d) { d = sgClamp(d, 0.5, 400); return 2.201 + 0.780 * (1 - Math.exp(-d / 22.29)) + 1.289e-5 * d * d; }
    function sgGreen(f) { f = sgClamp(f, 0.5, 150); return 1 + (1 - 1 / (1 + Math.pow(f / 7.74, 2.37))) + 0.00643 * Math.max(0, f - 22.2); }
    function sgBench(h) { if (h === 'tour') return 'tour'; h = Number(h); return SG_BENCHES.indexOf(h) === -1 ? 0 : h; }
    // Expected strokes to hole out. pos: { lie: 'tee' | 'fairway' | 'rough' | 'mixed' | 'green' | 'holed', d (yds) | f (ft) }.
    function sgExpected(pos, hcp) {
        var b = sgBench(hcp), lie = pos && pos.lie;
        if (b === 'tour') { var e0 = sgExpected(pos, 0); return lie === 'holed' || e0 == null ? e0 : e0 - (SG_TOUR_MARGIN[lie] || 0); }
        var k = b / 20, d = Number(pos && pos.d), f = Number(pos && pos.f);
        switch (pos && pos.lie) {
            case 'holed': return 0;
            case 'green': return sgGreen(f) + k * (0.08 + 0.004 * Math.min(sgClamp(f, 0.5, 150), 60));
            case 'tee': return sgTee(d) + k * (0.40 + 0.0019 * sgClamp(d, 60, 700));
            case 'fairway': return sgFair(d) + k * (0.20 + 0.0028 * sgClamp(d, 0.5, 400));
            case 'rough': return sgRough(d) + k * (0.30 + 0.0030 * sgClamp(d, 0.5, 400));
            case 'mixed': return (sgFair(d) + sgRough(d)) / 2 + k * (0.30 + 0.0030 * sgClamp(d, 0.5, 400));
        }
        return null;
    }
    function sgBandOf(d) { for (var i = 0; i < SG_BANDS.length; i++) if (d >= SG_BANDS[i][2] && d < SG_BANDS[i][3]) return SG_BANDS[i][0]; return SG_BANDS[0][0]; }
    // ---- ONE HOLE (pure) ----
    // h: { par, s (score), putts, fp (chip id), pen, fw, yd (hole length), marks: [yds to the green, in order] }
    // -> { ott, app, arg, putt: { on (counts), sg, n (strokes) }, bands: { id: { sg, n } }, drive (a tee shot measured) }
    function sgHole(h, hcp) {
        var out = { bands: {}, drive: false };
        SG_CATS.forEach(function (c) { out[c] = { on: true, sg: 0, n: 0 }; });
        var par = Number(h && h.par) || 0, s = Number(h && h.s) || 0;
        if (!(s > 0) || !(par >= 3)) { SG_CATS.forEach(function (c) { out[c].on = false; }); return out; }
        var E = function (pos) { return sgExpected(pos, hcp); };
        var off = function (cats) { cats.forEach(function (c) { out[c].on = false; }); };
        var add = function (cat, sg, n, startD) {
            out[cat].sg += sg; out[cat].n += n;
            if (cat === 'app') { var b = sgBandOf(startD); out.bands[b] = out.bands[b] || { sg: 0, n: 0 }; out.bands[b].sg += sg; out.bands[b].n += n; }
        };
        var putts = h.putts == null || h.putts === '' ? null : Number(h.putts);
        var pen = Math.max(0, Number(h.pen) || 0);
        var fpFt = SG_FP[h.fp] != null ? SG_FP[h.fp] : null;
        // PUTTING
        var end = null;   // the position the last non-putt stroke reached
        if (putts == null) { off(['putt']); }
        else if (putts === 0) { end = { lie: 'holed' }; }
        else if (fpFt != null) { end = { lie: 'green', f: fpFt }; add('putt', E(end) - putts, putts); }
        else off(['putt']);
        // THE SHOTS TO THE GREEN
        var Y = Number(h.yd) > 0 ? Number(h.yd) : null;
        var raw = (Array.isArray(h.marks) ? h.marks : []).map(Number).filter(function (x) { return x > 0 && x < 800; });
        var marks = [];
        raw.forEach(function (x, i) {
            if (i === 0 && Y != null && x >= Y - 20) return;                 // marked on the tee
            if (marks.length && Math.abs(marks[marks.length - 1] - x) <= 2) return;   // a double tap
            marks.push(x);
        });
        var shots = putts == null ? null : s - putts - pen;
        if (shots != null && shots < 1) { off(['ott', 'app', 'arg']); return out; }
        if (shots != null) while (marks.length && marks.length >= shots) marks.pop();   // the last mark was on the fringe
        var lie1 = par >= 4 ? (h.fw === 'hit' ? 'fairway' : (h.fw === 'L' || h.fw === 'R' || h.fw === 'S') ? 'rough' : 'mixed') : 'mixed';
        var pos = [Y != null ? { lie: 'tee', d: Y } : null].concat(marks.map(function (d, i) { return { lie: i === 0 ? lie1 : 'mixed', d: d }; }));
        var catOf = function (i, from) { return i === 1 && par >= 4 ? 'ott' : (from && from.d <= SG_ARG_YD ? 'arg' : 'app'); };
        var unknownFrom = function (i, from) {   // every category a block of strokes starting at stroke i could hold
            if (i === 1) return par >= 4 ? ['ott', 'app', 'arg'] : ['app', 'arg'];
            return from && from.d <= SG_ARG_YD ? ['arg'] : ['app', 'arg'];
        };
        // Strokes 1..k: mark to mark.
        for (var i = 1; i <= marks.length; i++) {
            var a = pos[i - 1], b = pos[i];
            if (!a) { off(i === 1 ? (par >= 4 ? ['ott'] : ['app']) : ['app']); continue; }
            var sg = E(a) - E(b) - 1 - (i === 1 ? pen : 0);
            var cat = catOf(i, a);
            add(cat, sg, 1, a.d);
            if (cat === 'ott') out.drive = true;
        }
        // The last block: from the last mark (or the tee) to the green / the hole.
        var k = marks.length, from = pos[k], left = shots == null ? null : shots - k;
        if (!from || end == null || left == null || left < 1) off(unknownFrom(k + 1, from));
        else if (left === 1) { var c1 = catOf(k + 1, from); add(c1, E(from) - E(end) - 1 - (k === 0 ? pen : 0), 1, from.d); if (c1 === 'ott') out.drive = true; }
        else if (k > 0 && from.d <= SG_ARG_YD) add('arg', E(from) - E(end) - left, left, from.d);
        else off(unknownFrom(k + 1, from));
        if (par >= 4 && !out.drive) out.ott.on = false;
        return out;
    }
    // ---- ROUNDS (pure) ----
    // round: myRounds()'s { code, at, holes, snap } plus sg: { yd: { n: yds }, marks: { n: [yds] } }.
    function sgRoundHoles(r, hcp) {
        var sg = r.sg || {}, yd = sg.yd || {}, mk = sg.marks || {}, list = [];
        Object.keys(r.snap || {}).forEach(function (n) {
            var x = r.snap[n], h = (r.holes || {})[n] || {};
            if (!x || !(x.s > 0)) return;
            var res = sgHole({ par: x.par, s: x.s, putts: h.putts, fp: h.fp, pen: h.pen, fw: h.fw, yd: yd[n], marks: mk[n] }, hcp);
            res.hole = Number(n); res.par = Number(x.par);
            list.push(res);
        });
        // A par 3 counts for Off the tee only in a round with a drive measured.
        var drives = list.some(function (x) { return x.drive; });
        list.forEach(function (x) { if (x.par === 3 && !drives) x.ott.on = false; });
        return list;
    }
    // Sum over rounds -> per-round numbers. { rounds, holes, cats: { c: { holes, n, sg, perRound, enough } },
    // bands: { id: { n, sg, perRound } }, total, totalOf: [cats], missing: [cats] }
    function sgSummary(rounds, hcp) {
        var o = { rounds: 0, holes: 0, cats: {}, bands: {}, bench: sgBench(hcp) };
        SG_CATS.forEach(function (c) { o.cats[c] = { holes: 0, n: 0, sg: 0, perRound: null, enough: false }; });
        (rounds || []).forEach(function (r) {
            var hs = sgRoundHoles(r, hcp);
            if (!hs.length) return;
            o.rounds++; o.holes += hs.length;
            hs.forEach(function (x) {
                SG_CATS.forEach(function (c) { if (x[c].on) { o.cats[c].holes++; o.cats[c].n += x[c].n; o.cats[c].sg += x[c].sg; } });
                if (x.app.on) Object.keys(x.bands).forEach(function (b) { var t = o.bands[b] = o.bands[b] || { n: 0, sg: 0, perRound: null }; t.n += x.bands[b].n; t.sg += x.bands[b].sg; });
            });
        });
        var appHoles = o.cats.app.holes;
        SG_CATS.forEach(function (c) { var t = o.cats[c]; t.enough = t.holes >= SG_MIN; if (t.holes) t.perRound = t.sg * 18 / t.holes; });
        Object.keys(o.bands).forEach(function (b) { if (appHoles) o.bands[b].perRound = o.bands[b].sg * 18 / appHoles; });
        o.totalOf = SG_CATS.filter(function (c) { return o.cats[c].enough; });
        o.missing = SG_CATS.filter(function (c) { return !o.cats[c].enough; });
        o.total = o.totalOf.length ? o.totalOf.reduce(function (a, c) { return a + o.cats[c].perRound; }, 0) : null;
        return o;
    }
    // PRACTICE THIS: the biggest per-round loss among the categories with enough data (Approach by
    // its distance band when a band holds 3+ shots). null when nothing has enough data.
    function sgPractice(o) {
        if (!o || !o.totalOf || !o.totalOf.length) return null;
        var opts = [];
        o.totalOf.forEach(function (c) {
            if (c === 'app') {
                var bs = SG_BANDS.filter(function (b) { var t = o.bands[b[0]]; return t && t.n >= 3 && t.perRound != null; });
                if (bs.length) { bs.forEach(function (b) { opts.push({ cat: 'app', band: b[0], label: 'Approach from ' + (b[0] === 'u100' ? 'under 100' : b[1]), perRound: o.bands[b[0]].perRound, n: o.bands[b[0]].n }); }); return; }
            }
            opts.push({ cat: c, band: null, label: SG_NAMES[c], perRound: o.cats[c].perRound, n: o.cats[c].n });
        });
        opts.sort(function (a, b) { return a.perRound - b.perRound; });
        var w = opts[0];
        return w && w.perRound < -0.05 ? w : { none: true };
    }
    // ---- STORAGE: Mark shot's yards per hole, and the card's hole length (this phone only) ----
    function sgLoad(code) { var r = lsGet(SGKEY + code); return r && r.v === 1 ? r : { v: 1, code: String(code), yd: {}, marks: {} }; }
    function sgYd(x) { var n = Number(x); return typeof x !== 'object' && isFinite(n) && n > 0 && n < 1000 ? Math.round(n) : null; }
    // One mark: the yards from the ball to the green's centre (a number - a position is refused).
    function sgMark(code, pid, hole, toGreenYd, opts) {
        opts = opts || {};
        var y = sgYd(toGreenYd), n = Number(hole);
        if (!code || pid == null || !(n >= 1 && n <= 36) || y == null || opts.onGreen || skipped(code)) return false;
        var r = sgLoad(code), p = String(pid), k = String(n);
        r.marks[p] = r.marks[p] || {};
        var list = r.marks[p][k] = r.marks[p][k] || [];
        if (list.length >= 15) return false;
        list.push(y);
        var cy = sgYd(opts.holeYd); if (cy != null && !r.yd[k]) r.yd[k] = cy;
        return lsSet(SGKEY + code, r);
    }
    // The card's length of a hole (the score sheet knows it).
    function sgSetYards(code, hole, yd) {
        var y = sgYd(yd), k = String(Number(hole));
        if (!code || y == null || !(Number(hole) >= 1) || skipped(code)) return false;
        var r = sgLoad(code);
        if (r.yd[k] === y) return true;
        r.yd[k] = y;
        return lsSet(SGKEY + code, r);
    }
    // My rounds with their SG record (the golfer's own marks).
    function sgRounds() {
        return myRounds().map(function (r) {
            var rec = lsGet(SGKEY + r.code), pid = r.pid;
            return Object.assign({}, r, { sg: rec && rec.v === 1 ? { yd: rec.yd || {}, marks: (pid != null && rec.marks && rec.marks[String(pid)]) || {} } : {} });
        }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    }
    // THE DEFAULT BENCHMARK (Manny, 2:21 PM): the closest one at or better than the golfer's handicap -
    // plus -> Tour / plus, 0-9.9 -> Scratch, 10-19.9 -> 10, 20+ -> 20; no handicap -> 10. The handicap: the
    // 048 profile (HardPanAuth.profile.get().hcp, else hardpan_my_hcp; "+3.7" is plus), else the golfer's
    // handicap in the round on screen. A pick the golfer makes (hardpan_sg_bench) always wins.
    function sgHcpNum(v) {
        var t = String(v == null ? '' : v).trim().replace(/\s+/g, '');
        if (!t || !/^\+?-?\d+(\.\d+)?$/.test(t)) return null;
        var n = Number(t.replace(/^\+/, ''));
        if (!isFinite(n)) return null;
        return t.charAt(0) === '+' && n > 0 ? -n : n;
    }
    function sgBenchFor(h) { h = sgHcpNum(h); if (h == null) return 10; return h < 0 ? 'tour' : h < 10 ? 0 : h < 20 ? 10 : 20; }
    function sgMyHcp(roundHcp) {
        var h = null;
        try { var A = W.HardPanAuth; if (A && A.profile && typeof A.profile.get === 'function') { var p = A.profile.get(); if (p) h = sgHcpNum(p.hcp); } } catch (e) {}
        if (h == null) { var hh = lsGet('hardpan_my_hcp'); if (hh && hh.h != null) h = sgHcpNum(hh.h); }
        if (h == null && roundHcp != null) h = sgHcpNum(roundHcp);
        return h;
    }
    // The phone's own golfer's handicap in the round on screen (index.html), when there is one.
    function sgRoundHcp() {
        try {
            /* global currentData, qsOwnId */
            var d = typeof currentData !== 'undefined' ? currentData : null, me = typeof qsOwnId === 'function' ? qsOwnId() : null;
            var p = d && me != null ? (d.players || []).filter(function (x) { return String(x.id) === String(me); })[0] : null;
            return p && p.hcp != null ? p.hcp : null;
        } catch (e) { return null; }
    }
    function sgBenchNow(roundHcp) {
        var v = null; try { v = W.localStorage.getItem(SG_BENCH_KEY); } catch (e) {}
        if (v === 'tour') return 'tour';
        if (v === '0' || v === '10' || v === '20') return Number(v);
        var h = sgMyHcp(roundHcp === undefined ? sgRoundHcp() : roundHcp);
        return h == null ? 10 : sgBenchFor(h);
    }
    function sgSetBench(h) { h = sgBench(h); try { W.localStorage.setItem(SG_BENCH_KEY, String(h)); } catch (e) {} return h; }
    function sgLastNow() { var v = null; try { v = W.localStorage.getItem(SG_LAST_KEY); } catch (e) {} return v === '1' ? 1 : v === '20' ? 20 : 10; }
    // ---- THE VIEW (shared by My stats and the after-round card) ----
    var SG_CSS = '.hp-sg{color:#1a1a1a;font:600 15px/1.35 -apple-system,system-ui,sans-serif;}'
        + '.hp-sg .sg-head{display:flex;align-items:center;gap:8px;margin:18px 2px 8px;}.hp-sg .sg-k{font-size:12px;font-weight:800;letter-spacing:.08em;color:#555;}'
        + '.hp-sg .sg-est{font-size:11px;font-weight:800;letter-spacing:.06em;background:#fde68a;color:#7c2d12;border-radius:6px;padding:2px 6px;}'
        + '.hp-sg .sg-i{margin-left:auto;min-width:44px;min-height:44px;border-radius:999px;border:0;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}'
        + '.hp-sg .sg-i span{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;border:1.5px solid #9aa5a0;color:#0f4c3a;font:800 15px/1 Georgia,serif;}'
        + '.hp-sg .sg-seg{display:flex;gap:6px;margin:8px 0;background:#e2f1ea;border-radius:999px;padding:4px;}'
        + '.hp-sg .sg-seg button{flex:1;min-height:44px;border:0;border-radius:999px;background:none;color:#0f4c3a;font:800 15px/1 -apple-system,system-ui,sans-serif;cursor:pointer;white-space:nowrap;}.hp-sg .sg-seg button.on{background:#0f4c3a;color:#fff;}'
        + '.hp-sg .sg-seg4{gap:2px;}.hp-sg .sg-seg4 button{font-size:14px;padding:0 4px;letter-spacing:-.01em;}'
        + '.hp-sg .sg-lbl{font-size:14px;color:#555;margin:8px 2px 0;}'
        + '.hp-sg .sg-card{background:#fff;border-radius:14px;padding:12px 14px;margin-top:8px;}'
        + '.hp-sg .sg-vs{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#555;}'
        + '.hp-sg .sg-tot{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:4px 0 6px;}.hp-sg .sg-tot b{font-size:30px;font-weight:800;}.hp-sg .sg-tot span{font-size:14px;color:#444;}'
        + '.hp-sg .pos{color:#0f4c3a;}.hp-sg .neg{color:#b91c1c;}'
        + '.hp-sg .sg-row{display:grid;grid-template-columns:minmax(0,1fr) 84px 52px;align-items:center;gap:8px;padding:8px 0;border-top:1px solid #eef1ee;}'
        + '.hp-sg .sg-row .n{font-weight:800;}.hp-sg .sg-row .c{font-size:12px;color:#666;font-weight:600;}.hp-sg .sg-row .v{text-align:right;font-weight:800;}'
        + '.hp-sg .sg-bar{position:relative;height:16px;}.hp-sg .sg-bar:before{content:"";position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:#c9d3cd;}'
        + '.hp-sg .sg-bar i{position:absolute;top:2px;height:12px;border-radius:4px;}.hp-sg .sg-bar i.neg{background:#b91c1c;right:50%;}.hp-sg .sg-bar i.pos{background:#0f4c3a;left:50%;}'
        + '.hp-sg .sg-row.sg-none{grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);}'
        + '.hp-sg .sg-nd{font-size:13px;color:#555;border:1px dashed #c9d3cd;border-radius:10px;padding:6px 8px;background:#f6f8f6;}.hp-sg .sg-nd b{color:#1a1a1a;}'
        + '.hp-sg .sg-sub{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#555;margin:12px 0 2px;}'
        + '.hp-sg .sg-row.sg-band{grid-template-columns:minmax(0,1fr) 84px 52px;padding:5px 0;}'
        + '.hp-sg .sg-practice{background:#0f4c3a;color:#fff;border-radius:14px;padding:12px 14px;margin-top:10px;}.hp-sg .sg-practice .t{font-size:12px;font-weight:800;letter-spacing:.08em;color:#d9f99d;}.hp-sg .sg-practice .b{font-size:17px;font-weight:800;margin-top:2px;}'
        + '.hp-sg .sg-foot{font-size:12px;color:#666;margin:8px 2px 0;}';
    function sgFmt(x) { if (x == null || !isFinite(x)) return '—'; var v = Math.round(x * 10) / 10; if (v === 0) return '0.0'; return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1); }
    function sgCls(x) { var v = Math.round((x || 0) * 10) / 10; return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; }
    function sgBar(x) { var b = el('div', 'sg-bar'), w = Math.min(50, Math.abs(x || 0) / 3 * 50); if (Math.round((x || 0) * 10)) { var i = el('i', sgCls(x)); i.style.width = Math.max(2, w) + '%'; b.appendChild(i); } return b; }
    function sgBenchName(h) { return h === 'tour' ? 'Tour / plus' : h === 0 ? 'scratch' : 'a ' + h + ' handicap'; }
    function sgBenchLabel(h) { return h === 'tour' ? 'Tour / plus' : h === 0 ? 'Scratch' : h + ' hcp'; }
    function sgCountText(c, t) {
        var n = t.n;
        if (c === 'ott') return n + ' drive' + (n === 1 ? '' : 's');
        if (c === 'app') return n + ' marked';
        if (c === 'arg') return n + ' shot' + (n === 1 ? '' : 's') + ' from 50 in';
        return t.holes + ' hole' + (t.holes === 1 ? '' : 's');
    }
    var SG_NEEDS = {
        ott: 'Mark shot where each drive stops',
        app: 'Mark shot before each approach, plus first-putt length',
        arg: 'every shot from 50 yds in marked, plus first-putt length',
        putt: 'first-putt length'
    };
    function sgNotEnough(c, t) {
        var d = el('div', 'sg-nd');
        d.appendChild(el('b', null, 'Not enough data. '));
        d.appendChild(W.document.createTextNode('Needs ' + SG_NEEDS[c] + ' on 18+ holes · you have ' + t.holes + '.' + (c === 'putt' ? ' Tap it on the score sheet.' : '')));
        return d;
    }
    // Draw into box. opts: { title, bench, onBench(h), last, onLast(n) (null: no window picker), rounds, today (one round), onInfo }
    function sgDraw(box, o, opts) {
        box.textContent = '';
        box.classList.add('hp-sg');
        var head = el('div', 'sg-head');
        head.appendChild(el('span', 'sg-k', opts.title || 'STROKES GAINED'));
        head.appendChild(el('span', 'sg-est', 'ESTIMATED'));
        var ib = el('button', 'sg-i'); ib.type = 'button'; ib.setAttribute('aria-label', 'How Strokes Gained works'); ib.setAttribute('data-sg-info', '1');
        ib.appendChild(el('span', null, 'i')); ib.onclick = function () { sgInfo(); };
        head.appendChild(ib);
        box.appendChild(head);
        if (opts.onLast) {
            var seg = el('div', 'sg-seg'); seg.setAttribute('data-sg-window', '1');
            [[1, 'Last round'], [10, 'Last 10'], [20, 'Last 20']].forEach(function (x) {
                var b = el('button', x[0] === opts.last ? 'on' : '', x[1]); b.type = 'button'; b.setAttribute('data-sg-last', String(x[0]));
                b.onclick = function () { opts.onLast(x[0]); };
                seg.appendChild(b);
            });
            box.appendChild(seg);
        }
        box.appendChild(el('div', 'sg-lbl', 'Compared with'));
        var bs = el('div', 'sg-seg sg-seg4'); bs.setAttribute('data-sg-benchpick', '1');
        SG_BENCHES.forEach(function (h) {
            var b = el('button', h === o.bench ? 'on' : '', sgBenchLabel(h)); b.type = 'button'; b.setAttribute('data-sg-bench', String(h));
            b.onclick = function () { opts.onBench(h); };
            bs.appendChild(b);
        });
        box.appendChild(bs);
        var card = el('div', 'sg-card');
        card.appendChild(el('div', 'sg-vs', (opts.today ? 'This round' : 'Per round') + ' vs ' + (o.bench === 'tour' ? 'Tour / plus' : o.bench === 0 ? 'a scratch golfer' : 'a ' + o.bench + ' handicap')));
        var tot = el('div', 'sg-tot'); tot.setAttribute('data-sg-total', o.total == null ? '' : String(Math.round(o.total * 10) / 10));
        var tb = el('b', o.total == null ? '' : sgCls(o.total), o.total == null ? '—' : sgFmt(o.total));
        tot.appendChild(tb);
        var rn = opts.today ? '' : ' · ' + o.rounds + ' round' + (o.rounds === 1 ? '' : 's');
        tot.appendChild(el('span', null, o.total == null ? 'Not enough data yet' + rn
            : 'shots ' + (opts.today ? '' : 'a round ') + (Math.round(o.total * 10) / 10 >= 0 ? 'ahead of ' : 'behind ') + sgBenchName(o.bench) + rn + (o.missing.length ? ' · ' + o.totalOf.length + ' categor' + (o.totalOf.length === 1 ? 'y' : 'ies') : '')));
        card.appendChild(tot);
        SG_CATS.forEach(function (c) {
            var t = o.cats[c], row = el('div', 'sg-row' + (t.enough ? '' : ' sg-none')); row.setAttribute('data-sg-cat', c); row.setAttribute('data-sg-enough', t.enough ? '1' : '0');
            var l = el('div'); l.appendChild(el('div', 'n', SG_NAMES[c]));
            if (t.enough) l.appendChild(el('div', 'c', sgCountText(c, t)));
            row.appendChild(l);
            if (t.enough) { row.appendChild(sgBar(t.perRound)); var v = el('div', 'v ' + sgCls(t.perRound), sgFmt(t.perRound)); v.setAttribute('data-sg-v', String(Math.round(t.perRound * 10) / 10)); row.appendChild(v); }
            else row.appendChild(sgNotEnough(c, t));
            card.appendChild(row);
        });
        if (o.cats.app.enough) {
            var bandsShown = SG_BANDS.filter(function (b) { return o.bands[b[0]] && o.bands[b[0]].n; });
            if (bandsShown.length) {
                card.appendChild(el('div', 'sg-sub', 'Approach by distance'));
                bandsShown.forEach(function (b) {
                    var t = o.bands[b[0]], row = el('div', 'sg-row sg-band'); row.setAttribute('data-sg-band', b[0]);
                    var l = el('div'); l.appendChild(el('div', null, b[1])); l.appendChild(el('div', 'c', t.n + ' shot' + (t.n === 1 ? '' : 's')));
                    row.appendChild(l); row.appendChild(sgBar(t.perRound)); row.appendChild(el('div', 'v ' + sgCls(t.perRound), sgFmt(t.perRound)));
                    card.appendChild(row);
                });
            }
        }
        box.appendChild(card);
        var pr = sgPractice(o);
        if (pr) {
            var p = el('div', 'sg-practice'); p.setAttribute('data-sg-practice', pr.none ? 'none' : (pr.band || pr.cat));
            p.appendChild(el('div', 't', '🎯 PRACTICE THIS'));
            p.appendChild(el('div', 'b', pr.none ? 'Nothing is losing you shots against ' + sgBenchName(o.bench) + '. Try the next benchmark down.'
                : pr.label + (opts.today ? ' cost you ' + Math.abs(Math.round(pr.perRound * 10) / 10).toFixed(1) + ' shots today (' + pr.n + ' ' + (pr.cat === 'ott' ? 'drive' : pr.cat === 'putt' ? 'putt' : 'shot') + (pr.n === 1 ? '' : 's') + ').'
                    : ' costs you ' + Math.abs(Math.round(pr.perRound * 10) / 10).toFixed(1) + ' shots a round.')));
            box.appendChild(p);
        }
        var foot = (o.missing.length && o.totalOf.length ? 'Total leaves out ' + o.missing.map(function (c) { return SG_NAMES[c]; }).join(', ') + ' until ' + (o.missing.length === 1 ? 'it has' : 'they have') + ' enough holes. ' : '')
            + '+ = better than the benchmark. From scores, putts, first-putt length and your marked shots. Kept on this phone.';
        var f = el('div', 'sg-foot', foot); f.setAttribute('data-sg-foot', '1');
        box.appendChild(f);
    }
    // THE (i): what each category uses, and the benchmark - "estimated".
    function sgInfo() {
        var d = W.document, o = d.getElementById('hp-sg-info');
        if (o) o.remove();
        o = el('div'); o.id = 'hp-sg-info'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'How Strokes Gained works');
        var st = el('style');
        st.textContent = '#hp-sg-info{position:fixed;inset:0;z-index:2147483000;background:rgba(5,20,12,.5);display:flex;align-items:flex-end;justify-content:center;font:600 15px/1.4 -apple-system,system-ui,sans-serif;color:#1a1a1a;color-scheme:light;}'
            + '#hp-sg-info>div{background:#fff;border-radius:20px 20px 0 0;padding:18px 18px calc(env(safe-area-inset-bottom) + 16px);width:100%;max-width:520px;max-height:88%;overflow-y:auto;box-sizing:border-box;}'
            + '#hp-sg-info h3{margin:0 0 6px;font-size:19px;font-weight:800;}#hp-sg-info p{margin:8px 0;color:#333;font-weight:600;}#hp-sg-info b{color:#0f4c3a;}#hp-sg-info .src{color:#555;font-size:14px;}'
            + '#hp-sg-info button{display:block;width:100%;min-height:50px;margin-top:12px;border-radius:14px;border:1px solid #c9d3cd;background:#fff;font:800 16px/1 -apple-system,system-ui,sans-serif;color:#1a1a1a;cursor:pointer;}';
        o.appendChild(st);
        var box = el('div');
        box.appendChild(el('h3', null, 'How Strokes Gained works'));
        box.appendChild(el('p', null, 'Every shot is compared with how many shots a Tour / plus player, a scratch, 10 or 20 handicap takes to hole out from the same spot. It starts on the one nearest your handicap (at or better); your own pick stays.'));
        [['Off the tee', ' · hole length (card) → where the tee shot stopped (your Mark shot) + fairway hit / missed (score sheet). Par 4s and 5s.'],
            ['Approach', ' · shots from more than 50 yds: start yards (your mark) → on the green: first-putt length; missed: your next mark.'],
            ['Around the green', ' · shots from 50 yds in: your mark → first-putt length (or holed).'],
            ['Putting', ' · first-putt length (one tap on the score sheet) + putts.']].forEach(function (x) {
            var p = el('p'); p.appendChild(el('b', null, x[0])); p.appendChild(d.createTextNode(x[1])); box.appendChild(p);
        });
        var p2 = el('p'); p2.appendChild(d.createTextNode('A category shows ')); p2.appendChild(el('b', null, 'Not enough data')); p2.appendChild(d.createTextNode(' until it has 18 holes of what it needs. Shots no mark separates are left out, never guessed.'));
        box.appendChild(p2);
        var src = el('p', 'src', 'Benchmark: HardPan baseline (estimated) — our own curves, shaped on Mark Broadie’s published strokes-gained research. Tour / plus sits on his published Tour values; Scratch adds a small margin; 10 and 20 add more per shot. Not an official table. Kept on this phone.');
        src.setAttribute('data-sg-source', '1');
        box.appendChild(src);
        var ok = el('button', null, 'Got it'); ok.type = 'button'; ok.onclick = function () { o.remove(); };
        box.appendChild(ok);
        o.appendChild(box);
        o.onclick = function (e) { if (e.target === o) o.remove(); };
        d.body.appendChild(o);
        return o;
    }
    function sgStyle() {
        var d = W.document;
        if (d.getElementById('hp-sg-style')) return;
        var st = el('style'); st.id = 'hp-sg-style'; st.textContent = SG_CSS;
        (d.head || d.body).appendChild(st);
    }
    // MY STATS: the section, with its own window (Last round / 10 / 20) and benchmark picker.
    function sgMySection(box, rerender) {
        sgStyle();
        var last = sgLastNow(), bench = sgBenchNow(), rounds = sgRounds().filter(function (r) { return Object.keys(r.snap || {}).some(function (n) { return r.snap[n].s > 0; }); }).slice(0, last);
        var o = sgSummary(rounds, bench);
        sgDraw(box, o, { bench: bench, last: last, today: last === 1,
            onBench: function (h) { sgSetBench(h); rerender(); },
            onLast: function (n) { try { W.localStorage.setItem(SG_LAST_KEY, String(n)); } catch (e) {} rerender(); } });
        return o;
    }
    // THE AFTER-ROUND CARD: this round's strokes gained, over whatever is on screen, at the end
    // of the last hole (the score sheet's Save). Done goes on to what came next (Settle up).
    function sgRoundCard(code, then) {
        var d = W.document, r = sgRounds().filter(function (x) { return String(x.code) === String(code); })[0];
        if (!r) return false;
        var o0 = sgSummary([r], sgBenchNow());
        // Nothing to say (no putts, no marks): straight on.
        if (!SG_CATS.some(function (c) { return o0.cats[c].holes > 0 && o0.cats[c].n > 0; })) return false;
        sgStyle();
        var wrap = d.getElementById('hp-sg-card');
        if (wrap) wrap.remove();
        wrap = el('div'); wrap.id = 'hp-sg-card'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'Strokes Gained, this round');
        var st = el('style');
        st.textContent = '#hp-sg-card{position:fixed;inset:0;z-index:2147482600;background:rgba(5,20,12,.55);display:flex;align-items:flex-end;justify-content:center;color-scheme:light;}'
            + '#hp-sg-card>.box{background:#f0f4f2;border-radius:20px 20px 0 0;padding:16px 16px calc(env(safe-area-inset-bottom) + 16px);width:100%;max-width:520px;max-height:92%;overflow-y:auto;box-sizing:border-box;font:600 15px/1.35 -apple-system,system-ui,sans-serif;color:#1a1a1a;}'
            + '#hp-sg-card .rt{font-size:19px;font-weight:800;color:#13241d;}#hp-sg-card .rs{font-size:14px;color:#555;margin-top:2px;}'
            + '#hp-sg-card .btn{display:block;width:100%;min-height:52px;margin-top:10px;border-radius:14px;font:800 17px/1 -apple-system,system-ui,sans-serif;cursor:pointer;}'
            + '#hp-sg-card .btn.go{border:0;background:#0f4c3a;color:#fff;}#hp-sg-card .btn.done{border:1px solid #c9d3cd;background:#fff;color:#1a1a1a;}';
        wrap.appendChild(st);
        var box = el('div', 'box');
        var strokes = 0, par = 0, holes = 0;
        Object.keys(r.snap || {}).forEach(function (n) { var x = r.snap[n]; if (x && x.s > 0) { strokes += x.s; par += Number(x.par) || 0; holes++; } });
        var tp = strokes - par;
        box.appendChild(el('div', 'rt', 'Round done · ' + (r.course || 'This round') + ' · ' + strokes + ' (' + (tp > 0 ? '+' + tp : tp === 0 ? 'E' : tp) + ')'));
        box.appendChild(el('div', 'rs', 'Strokes Gained, this round' + (holes < 18 ? ' · ' + holes + ' holes' : '')));
        var sec = el('div');
        box.appendChild(sec);
        var draw = function () { sgDraw(sec, sgSummary([r], sgBenchNow()), { bench: sgBenchNow(), today: true, onBench: function (h) { sgSetBench(h); draw(); } }); };
        draw();
        var more = el('button', 'btn go', 'See last 10 rounds'); more.type = 'button'; more.setAttribute('data-sg-more', '1');
        var done = el('button', 'btn done', 'Done'); done.type = 'button'; done.setAttribute('data-sg-done', '1');
        var finish = function () { wrap.remove(); if (typeof then === 'function') { try { then(); } catch (e) {} } };
        more.onclick = function () { try { W.localStorage.setItem(SG_LAST_KEY, '10'); } catch (e) {} wrap.remove(); openMy(); };
        done.onclick = finish;
        box.appendChild(more); box.appendChild(done);
        wrap.appendChild(box);
        d.body.appendChild(wrap);
        return true;
    }

    function setTrackOthers(v) { setOthers(!!v); if (ssIsOpen()) ssRender(); return othersOn(); }
    function trackShown() {
        try {
            var F = W.HardPanFeature;
            return typeof F === 'function' && F('scoreSheet') !== false && F('quickStats') !== false
                && !!(W.HardPanGps && typeof W.HardPanGps.hasGpsPro === 'function' && W.HardPanGps.hasGpsPro());
        } catch (e) { return false; }
    }
    W.HardPanGpsStats = { open: open, close: close, refresh: refresh, isOpen: function () { return !!(sheet && sheet.style.display !== 'none' && cur); },
        girAuto: girAuto, holeView: holeView, summary: summary, season: season, load: load, setHole: setHole, ensure: ensure,
        // Quick stats on the scorecard (008) and My stats.
        quick: { key: qKey, load: qLoad, hole: qHole, set: qSet, sync: qSync, fwAsked: fwAsked, tiles: cardTiles },
        aggregate: aggregate, myRounds: myRounds, openMy: openMy, closeMy: closeMy, placeHome: placeHome,
        // 020: Start fresh, Remove one round, the Practice round switch (keyed by the round's code).
        clearAll: clearAll, removeRound: removeRound, historyRounds: historyRounds, practiceOn: practiceOn, setPractice: setPractice, skipped: skipped,
        // "Track stats for others" (this phone, off by default): the state and its setter, for any Tools
        // surface (the old drop-down via sheet.placeToggle, the Tools bottom sheet's ROUND switch). The
        // setter redraws an open score sheet.
        // Present only while the switch is meaningful (the score sheet and quick stats switched on, GPS
        // Map): a Tools surface that shows the switch when these exist hides it otherwise.
        get trackOthers() { return trackShown() ? othersOn : undefined; },
        get setTrackOthers() { return trackShown() ? setTrackOthers : undefined; },
        trackOthersShown: function () { return trackShown(); },
        // The score sheet (012).
        // URGENT-047 C: caddie notes per course hole (this phone only; no location).
        caddie: { key: CADDIE_KEY, max: CADDIE_MAX, get: caddieGet, line: caddieLine, set: caddieSet },
        // 052 C: Strokes Gained (lite) - the engine (pure), the marks store (distances only), the views.
        sg: { expected: sgExpected, hole: sgHole, roundHoles: sgRoundHoles, summary: sgSummary, practice: sgPractice, mark: sgMark, setYards: sgSetYards, load: sgLoad, rounds: sgRounds,
            bench: sgBenchNow, setBench: sgSetBench, benchFor: sgBenchFor, hcpNum: sgHcpNum, myHcp: sgMyHcp, benches: SG_BENCHES, last: sgLastNow, fpChips: SG_FP_CHIPS, fpFeet: SG_FP, bands: SG_BANDS, min: SG_MIN, roundCard: sgRoundCard, info: sgInfo, key: SGKEY },
        sheet: { open: ssOpen, close: ssClose, isOpen: ssIsOpen, hole: function () { return ss && ss.ctx ? (ss.ctx.home != null ? ss.ctx.home : ss.ctx.hole) : null; }, shownHole: function () { return ss && ss.ctx ? ss.ctx.hole : null; }, go: function (h) { return ssGoto(h); }, grid: ssGrid, more: ssMore, gir: ssGir, girTap: ssGirTap, othersOn: othersOn, setOthers: setOthers, placeToggle: ssPlaceToggle, statsFor: statsForCtx } };
})();
