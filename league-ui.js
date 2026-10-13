// ============================================================================
// POINTS GAME - THE SCREENS (HardPan; gps-league, made general in gps-points).
// The math is league-engine.js; this draws it and saves the organizer's settings.
//
// One game, held by a TRIP (trips/<code>/league - several rounds of the trip) or by a
// ROUND (events/<code>/pointsGame - this round only, or several rounds by code).
//   #league-card     the standings: rank, golfer, points, matches W-L-H, the pot and the
//                    projected payouts; tap a golfer for each match. The organizer also
//                    gets Setup and Match results (any segment by hand, or a match for a
//                    group with no Nassau).
//   #league-settle   "Who gets paid" from the pot - its own card, settled separately.
// Setup is one screen: rounds, teams (same every round, or each round's own 2 v 2),
// points, golfers, money (the Weekly game's payout setup: % presets or exact $ per
// place, adding up to the pot) and the live "10 golfers · pot $200 · 1st $100 / ..." line.
//
// Rounds are only READ (players, scores, Side Bets), through the same match engine call
// Side Bets makes. Nothing here touches Who Pays Who or any settlement.
// ============================================================================
(function () {
    'use strict';
    var W = window;
    var E = function () { return W.HardPanLeagueEngine; };
    // holder: the object the settings hang off ({ league } or { pointsGame }); base: its db path.
    var S = { holder: null, key: 'league', base: null, ctx: {}, rounds: [], organizer: false, db: null, view: 'table', open: {}, form: null, pickRound: null, pickOrder: [], ids: { card: 'league-card', settle: 'league-settle', section: 'league-section' } };
    function $(id) { return document.getElementById(id); }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function money(c) { var d = c / 100; return '$' + (d % 1 ? d.toFixed(2) : String(d)); }
    function ptsText(p) { return (p % 1 ? p.toFixed(1) : String(p)); }
    var ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
    var SEG = { front: 'Front 9', back: 'Back 9', total: '18' };
    // The Weekly game's presets (admin.html #mp-net-places), word for word.
    var PRESETS = [['100', 'Winner Take All — 100%'], ['60,40', 'Top 2 — 60 / 40'], ['50,30,20', 'Top 3 — 50 / 30 / 20'], ['40,30,20,10', 'Top 4 — 40 / 30 / 20 / 10']];

    // The SAME engine call Side Bets makes (sidematches.html): Team 1 / Team 2, the match's
    // own holes, its scoring. Read-only.
    function calc(sm, data) {
        if (typeof W.calculateMatchEngine !== 'function' && typeof calculateMatchEngine !== 'function') return null;   /* global calculateMatchEngine */
        var byId = {}; (data.players || []).forEach(function (p) { byId[String(p.id)] = p; });
        var t1 = (sm.teamAIds || []).map(function (id) { return Object.assign({}, byId[String(id)], { team: 'Team 1' }); });
        var t2 = (sm.teamBIds || []).map(function (id) { return Object.assign({}, byId[String(id)], { team: 'Team 2' }); });
        return calculateMatchEngine(t1.concat(t2), holesFor(sm, data), data.scores || {}, sm.scoring || 'net', 'nassau', 'none', 0, 0, []);
    }
    function holesFor(sm, data) {
        var cd = data.courseData || [];
        return typeof sideMatchHoles === 'function' ? sideMatchHoles(sm, cd) : cd;   /* global sideMatchHoles */
    }
    // A CUP ROUND's own matches, from the Ryder engine (ryder-cup.js, read-only): who played
    // whom and the 18-hole result once decided. null when the round has no Cup.
    function ryder(round) {
        try {
            if (typeof resolveRyderCupForRound !== 'function' || typeof computeRyderMatchResult !== 'function' || typeof ryderCupConfig !== 'function') return null;   /* global resolveRyderCupForRound, computeRyderMatchResult, ryderCupConfig, ryderMatchRoster, hasRyderCup */
            var d = (round && round.data) || {}, ref = d.ryderCupRef;
            if (!(ref && ref.host) && !(typeof hasRyderCup === 'function' && hasRyderCup(d))) return null;
            var hostR = ref && ref.host ? S.rounds.filter(function (r) { return String(r.code) === String(ref.host); })[0] : null;
            var res = resolveRyderCupForRound(d, hostR ? hostR.data : null, round.code);
            if (!res || !res.cup) return null;
            var cfg = ryderCupConfig(res.cup); if (!cfg) return null;
            var nameOf = {}; (d.players || []).forEach(function (p) { nameOf[String(p.id)] = p.name; });
            return Object.keys(cfg.matches || {}).filter(function (id) { return !res.sessionId || (cfg.matches[id].sessionId || 's1') === res.sessionId; }).map(function (id) {
                var m = cfg.matches[id], st = computeRyderMatchResult(res.cup, d.courseData || [], d.scores || {}, id, d);
                var ro = typeof ryderMatchRoster === 'function' ? ryderMatchRoster(m) : { a: (m.playersA || []).map(String), b: (m.playersB || []).map(String) };
                var a = ro.a.map(function (x) { return nameOf[x]; }), b = ro.b.map(function (x) { return nameOf[x]; });
                if (!a.length || !b.length || a.concat(b).some(function (n) { return !n; })) return null;
                var decided = st && (st.decided || st.closed || (st.totalHoles && st.thru >= st.totalHoles));
                return { id: id, format: m.format === 'foursomes' ? 'foursomes' : m.format === 'singles' ? 'singles' : 'fourball', a: a, b: b, aIds: ro.a, bIds: ro.b,
                    total: decided ? (st.status > 0 ? 'A' : st.status < 0 ? 'B' : 'H') : null, scoring: m.scoring === 'gross' || m.scoring === 'scratch' ? 'gross' : 'net' };
            }).filter(Boolean);
        } catch (e) { return null; }
    }
    function settings() { return (S.holder && S.holder[S.key]) || null; }
    function setSettings(v) { S.holder = S.holder || {}; S.holder[S.key] = v; }
    function state() { return E() ? E().state(S.holder, S.rounds, calc, holesFor, ryder) : null; }
    function write(path, val) {
        if (!S.db || !S.base) return Promise.reject(new Error('not connected'));
        return S.db.ref(S.base + (path ? '/' + path : '')).set(val);
    }
    function allNames(rounds) { return E() ? E().players(null, rounds || S.rounds) : []; }

    // ---- THE CARD ------------------------------------------------------------------
    // o: { holder, key: 'league' | 'pointsGame', base: db path, ctx: { tripCode, thisRound, addable,
    //      loadRound(code) -> Promise<{ code, label, data } | null> }, rounds: [{ code, label, data }],
    //      organizer, db, ids }  - or the trip page's { code, trip, rounds, organizer, db }.
    function render(o) {
        if (o) {
            if (o.trip && !o.holder) o = { holder: o.trip, key: 'league', base: 'trips/' + o.code + '/league', ctx: { tripCode: o.code }, rounds: o.rounds, organizer: o.organizer, db: o.db };
            S.holder = o.holder || {}; S.key = o.key || 'league'; S.base = o.base; S.ctx = o.ctx || {}; S.rounds = o.rounds || []; S.organizer = !!o.organizer; S.db = o.db || S.db;
            if (o.ids) S.ids = Object.assign({}, S.ids, o.ids);
            mount();
        }
        var sec = $(S.ids.section), card = $(S.ids.card), settle = $(S.ids.settle);
        if (!card) return;
        var st = state();
        if (sec) sec.style.display = st || S.organizer ? '' : 'none';
        if (S.form) { card.innerHTML = formHtml(); if (settle) settle.innerHTML = ''; return; }
        if (S.view === 'results' && st && S.organizer) { card.innerHTML = resultsHtml(st); if (settle) settle.innerHTML = settleHtml(st); return; }
        if (!st) {
            card.innerHTML = S.organizer ? '<p class="trip-section-sub">Each group plays 2 v 2; front 9, back 9 and 18 each earn points for the golfers on the winning side, added up over the rounds you pick. The pot pays the top places.</p>'
                + '<button type="button" class="btn-primary" data-lg="setup">🏅 Set up a Points game</button>' : '';
            if (settle) settle.innerHTML = '';
            return;
        }
        card.innerHTML = tableHtml(st);
        if (settle) settle.innerHTML = settleHtml(st);
    }
    function potLine(st) {
        var c = st.cfg, p = st.pay;
        return 'Pot ' + money(p.potCents) + ' (' + st.players.length + ' × ' + money(Math.round(c.buyIn * 100)) + ')'
            + (p.valid ? ' · ' + p.placeCents.map(function (x, i) { return ORD[i] + ' ' + money(x); }).join(', ') : '');
    }
    function undecided(st) { return st.matches.some(function (m) { return !m.seg.front || !m.seg.back || !m.seg.total; }) || !st.matches.length; }
    function roundsText(st) {
        var used = st.cfg.rounds ? S.rounds.filter(function (r) { return st.cfg.rounds.indexOf(String(r.code)) !== -1; }) : S.rounds;
        return (st.cfg.rounds ? used.length + ' round' + (used.length === 1 ? '' : 's') : 'every round of the trip')
            + ' · ' + (st.cfg.teamsMode === 'same' ? 'same teams every round' : 'teams change each round');
    }
    function tableHtml(st) {
        var p = st.pay, h = [];
        h.push('<div class="lg-pot" style="font-weight:800;color:var(--brand-green);margin:2px 0 4px;">' + esc(potLine(st)) + '</div>');
        h.push('<div class="trip-section-sub" style="margin:0 0 8px;">' + esc(roundsText(st)) + '. Points: front ' + ptsText(st.cfg.pts.front) + ' · back ' + ptsText(st.cfg.pts.back) + ' · 18 ' + ptsText(st.cfg.pts.total)
            + ' to each golfer on the winning side (a halve: half each) · ' + st.matches.length + ' match' + (st.matches.length === 1 ? '' : 'es') + ' so far. Tap a golfer for their matches.</div>');
        if (!p.valid) h.push('<div style="color:var(--warn-text);font-weight:700;margin-bottom:6px;">' + esc(p.why) + ' — no payouts until it does.</div>');
        h.push('<table class="lg-table" style="width:100%;border-collapse:collapse;font-size:.88rem;"><thead><tr style="text-align:left;color:var(--text-muted);font-size:.74rem;"><th>#</th><th>Golfer</th><th style="text-align:right;">Pts</th><th style="text-align:center;">W-L-H</th><th style="text-align:right;">' + (undecided(st) ? 'Projected' : 'Payout') + '</th></tr></thead><tbody>');
        st.rows.forEach(function (r) {
            var pay = p.valid ? (p.payCents[r.name] || 0) : 0, open = !!S.open[r.name];
            var tied = st.rows.filter(function (x) { return x.rank === r.rank; }).length > 1;
            h.push('<tr class="lg-row" data-lg-player="' + esc(r.name) + '" style="border-top:1px solid var(--border-faint);cursor:pointer;"><td style="padding:7px 4px;">' + (tied ? 'T' : '') + r.rank + '</td><td style="font-weight:700;">' + esc(r.name) + ' <span style="color:var(--text-muted);font-weight:400;">' + (open ? '▾' : '▸') + '</span></td>'
                + '<td style="text-align:right;font-weight:800;">' + ptsText(r.pts) + '</td><td style="text-align:center;">' + r.w + '-' + r.l + '-' + r.h + '</td><td style="text-align:right;font-weight:700;color:' + (pay ? 'var(--brand-green)' : 'var(--text-muted)') + ';">' + (pay ? money(pay) : '—') + '</td></tr>');
            if (open) h.push('<tr><td></td><td colspan="4" style="padding:0 4px 8px;font-size:.8rem;">' + (r.matches.length ? r.matches.map(matchLine).join('') : '<div style="color:var(--text-muted);">No matches yet.</div>') + '</td></tr>');
        });
        h.push('</tbody></table>');
        if (S.organizer) h.push('<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"><button type="button" class="btn-outline" data-lg="results">✏️ Match results</button><button type="button" class="btn-outline" data-lg="setup">⚙️ Setup</button></div>');
        return h.join('');
    }
    function segText(v) { return v === 'H' ? 'halved' : v ? v : '…'; }
    function matchLine(m) {
        var seg = function (k) {
            var v = m.seg[k], won = v && v !== 'H' && v === m.side;
            return SEG[k] + ' ' + (v ? (v === 'H' ? '½' : won ? 'won' : 'lost') : '…') + (m.set[k] ? '*' : '');
        };
        return '<div class="lg-match" style="margin:3px 0;">' + esc(m.label) + (m.group ? ' · G' + esc(m.group) : '') + ': with ' + esc(m.partner.join(' & ') || '—') + ' v ' + esc(m.opponents.join(' & '))
            + ' — ' + ['front', 'back', 'total'].map(seg).join(', ') + ' → <b>' + ptsText(m.pts) + ' pt' + (m.pts === 1 ? '' : 's') + '</b>' + (m.result ? ' (' + m.result + ')' : '') + '</div>';
    }

    // ---- WHO GETS PAID (its own card) ---------------------------------------------------
    function settleHtml(st) {
        var p = st.pay;
        var lines = st.rows.filter(function (r) { return p.valid && p.payCents[r.name]; });
        return '<div class="settle-card" id="league-settle-card" style="margin-top:12px;border:2px solid var(--brand-green);">'
            + '<div style="font-weight:800;">🏅 Points game — who gets paid</div>'
            + '<div class="trip-section-sub" style="margin:2px 0 8px;">Settle this separately: every golfer in the game puts ' + money(Math.round(st.cfg.buyIn * 100)) + ' in the pot (' + money(p.potCents) + '). It is not part of Who Pays Who.'
            + (undecided(st) ? ' Projected from the standings now — final when every match is decided.' : '') + '</div>'
            + (lines.length ? lines.map(function (r) { return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid var(--border-faint);"><span>' + (st.rows.filter(function (x) { return x.rank === r.rank; }).length > 1 ? 'T' : '') + r.rank + '. ' + esc(r.name) + ' · ' + ptsText(r.pts) + ' pts</span><b>' + money(p.payCents[r.name]) + '</b></div>'; }).join('')
                : '<div style="color:var(--text-muted);">' + (p.valid ? 'Nobody yet.' : esc(p.why)) + '</div>')
            + '</div>';
    }

    // ---- SETUP (one screen) ---------------------------------------------------------------
    function presetOf(places) { var k = (places || []).join(','); return PRESETS.some(function (p) { return p[0] === k; }) ? k : (k || '50,30,20'); }
    function openForm() {
        var c = (E() && E().config(S.holder)) || null, cands = S.rounds.slice();
        S.form = {
            // Rounds: a round's own game may be this round only; a trip's is several.
            roundsMode: S.ctx.thisRound ? (c && (c.rounds ? c.rounds.length > 1 : true) && S.key === 'league' ? 'several' : (c && c.rounds && c.rounds.length > 1 ? 'several' : 'one')) : 'several',
            rounds: c && c.rounds ? c.rounds.slice() : cands.map(function (r) { return String(r.code); }),
            later: S.ctx.tripCode ? !(c && c.rounds) : false,
            teamsMode: c ? c.teamsMode : 'change', teams: c ? c.teams.map(function (t) { return { a: t.a.slice(), b: t.b.slice() }; }) : [], scoring: c ? c.scoring : 'net',
            pts: c ? Object.assign({}, c.pts) : { front: 1, back: 1, total: 1 },
            // A NEW GAME STARTS WITH NOBODY PICKED (Manny, 2026-10-13); "Select all" is one tap.
            players: c ? (c.players ? c.players.slice() : allNames().slice()) : [],
            buyIn: c ? c.buyIn : 20, payMode: c ? c.payMode : 'pct', preset: presetOf(c ? c.places : [50, 30, 20]),
            placesUsd: c && c.placesUsd.length ? c.placesUsd.slice() : [100, 60, 40], addCode: '', msg: '',
            // FORMAT & POINTS: a default for every round (four-ball, Nassau-style 1/1/1), and any round
            // its own - changeable later, mid-trip too.
            def: JSON.parse(JSON.stringify(c ? c.def : E().roundCfg(null))), perRound: JSON.parse(JSON.stringify(c ? c.perRound : {})), openRound: null
        };
        S.pickOrder = [];
        render();
    }
    function formNames() {
        var f = S.form;
        var rs = f.roundsMode === 'one' ? S.rounds.filter(function (r) { return String(r.code) === String(S.ctx.thisRound); })
            : (f.later ? S.rounds : S.rounds.filter(function (r) { return f.rounds.indexOf(String(r.code)) !== -1; }));
        var seen = {}, out = [];
        allNames(rs).concat(f.players).forEach(function (n) { var k = String(n).toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(n); } });
        return out;
    }
    function formCfg() {
        var f = S.form;
        return { buyIn: Number(f.buyIn) || 0, payMode: f.payMode, places: f.preset.split(',').map(Number), placesUsd: f.placesUsd.map(function (x) { return Number(x) || 0; }).filter(function (x) { return x > 0; }) };
    }
    // "10 golfers · pot $200 · 1st $100 / 2nd $60 / 3rd $40", as the golfers and numbers change.
    function liveLine() {
        var f = S.form, n = f.players.length, eng = E(), cfg = formCfg();
        var head = n + ' golfer' + (n === 1 ? '' : 's') + ' · pot ' + money(Math.round(cfg.buyIn * 100) * n);
        if (!eng || !n) return head;
        var rows = f.players.map(function (p, i) { return { name: p, rank: i + 1 }; });
        var pay = eng.payouts(rows, cfg);
        if (!pay.valid) return head + ' · ' + (f.payMode === 'usd' ? pay.why : 'the places must add up to 100%');
        return head + ' · ' + pay.placeCents.map(function (c, i) { return ORD[i] + ' ' + money(c); }).join(' / ');
    }
    function chipBtn(attr, on, label, color) {
        return '<button type="button" ' + attr + ' aria-pressed="' + !!on + '" style="min-height:36px;padding:4px 10px;margin:2px 4px 2px 0;border-radius:999px;border:1px solid ' + (color || 'var(--brand-green)') + ';font-weight:700;' + (on ? 'background:' + (color || 'var(--brand-green)') + ';color:#fff;' : 'background:var(--bg-card);color:inherit;') + '">' + label + '</button>';
    }
    function formHtml() {
        var f = S.form, names = formNames();
        var inp = function (k, v, w, step) { return '<input type="number" inputmode="decimal" min="0" step="' + (step || 0.5) + '" data-lg-f="' + k + '" value="' + esc(v) + '" style="width:' + (w || 70) + 'px;">'; };
        var h = ['<div class="lg-form"><div style="font-weight:800;margin-bottom:6px;">🏅 Points game setup</div>'];
        h.push('<div class="lg-live" role="status" style="font-weight:800;color:var(--brand-green);margin:4px 0 10px;">' + esc(liveLine()) + '</div>');
        // 1. ROUNDS
        h.push('<div class="form-group"><label>1. Rounds</label><div>');
        if (S.ctx.thisRound) h.push(chipBtn('data-lg-rm="one"', f.roundsMode === 'one', 'This round only') + chipBtn('data-lg-rm="several"', f.roundsMode === 'several', 'Several rounds'));
        h.push('</div>');
        if (f.roundsMode === 'several') {
            h.push('<div style="margin-top:4px;">' + S.rounds.map(function (r) { var on = f.later || f.rounds.indexOf(String(r.code)) !== -1; return chipBtn('data-lg-rd="' + esc(r.code) + '"' + (f.later ? ' disabled' : ''), on, (on ? '✓ ' : '') + esc(r.label || r.code)); }).join('') + '</div>');
            if (S.ctx.tripCode) h.push('<label style="display:flex;gap:8px;align-items:center;margin-top:6px;font-weight:600;"><input type="checkbox" data-lg-later="1"' + (f.later ? ' checked' : '') + ' style="width:20px;height:20px;"> Every round of this trip, and rounds added to it later</label>');
            if (S.ctx.addable) h.push('<div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><input type="text" data-lg-code="1" value="' + esc(f.addCode) + '" placeholder="Game code of another round" style="text-transform:uppercase;width:190px;"> <button type="button" class="btn-outline-sm" data-lg="addround">+ Add round</button></div>');
        }
        h.push('</div>');
        // FORMAT & POINTS
        h.push('<div class="form-group lg-fmt"><label>Format &amp; points</label><div class="trip-section-sub">Every round: ' + esc(rcText(f.def)) + '</div>' + rcControls('def', f.def));
        var listR = f.roundsMode === 'one' ? S.rounds.filter(function (r) { return String(r.code) === String(S.ctx.thisRound); }) : (f.later ? S.rounds : S.rounds.filter(function (r) { return f.rounds.indexOf(String(r.code)) !== -1; }));
        if (f.roundsMode !== 'one' && listR.length) h.push('<div style="margin-top:8px;font-weight:700;">A round of its own</div>' + listR.map(function (r) {
            var own = f.perRound[r.code], open = f.openRound === String(r.code);
            return '<div class="lg-rround" style="border-top:1px solid var(--border-faint);padding:4px 0;"><div style="display:flex;justify-content:space-between;align-items:center;gap:6px;"><span><b>' + esc(r.label || r.code) + '</b> \u00b7 ' + esc(own ? rcText(own) : 'as every round') + '</span>'
                + '<span>' + (own ? '<button type="button" class="btn-outline-sm" data-lg-rcx="' + esc(r.code) + '">Use every round\u2019s</button> ' : '') + '<button type="button" class="btn-outline-sm" data-lg-rco="' + esc(r.code) + '">' + (open ? 'Done' : 'Change') + '</button></span></div>'
                + (open ? rcControls('r:' + r.code, own || f.def) : '') + '</div>';
        }).join(''));
        h.push('</div>');
        // 2. TEAMS
        h.push('<div class="form-group"><label>2. Teams</label><div>' + chipBtn('data-lg-tm="change"', f.teamsMode === 'change', 'Teams change each round') + chipBtn('data-lg-tm="same"', f.teamsMode === 'same', 'Same teams every round') + '</div>');
        if (f.teamsMode === 'change') h.push('<div class="trip-section-sub">Each round’s groups: their 2 v 2 Nassau in Side Bets, or entered under Match results with the 2v2 picker.</div>');
        else {
            h.push('<div class="trip-section-sub">Pick the 2 v 2 sides once: first two tapped = Team A, next two = Team B, then Add. Every round they all play, the scores decide it (' + chipBtn('data-lg-sc="net"', f.scoring === 'net', 'net') + chipBtn('data-lg-sc="gross"', f.scoring === 'gross', 'gross') + ').</div>');
            h.push(f.teams.map(function (t, i) { return '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--border-faint);padding:4px 0;"><span><b>' + esc(t.a.join(' & ')) + '</b> v <b>' + esc(t.b.join(' & ')) + '</b></span><button type="button" class="btn-outline-sm" data-lg-tdel="' + i + '">Remove</button></div>'; }).join(''));
            var o = S.pickOrder, used = {};
            f.teams.forEach(function (t) { t.a.concat(t.b).forEach(function (n) { used[n.toLowerCase()] = 1; }); });
            var pool = (f.players.length ? f.players : names).filter(function (n) { return !used[n.toLowerCase()]; }).concat(names.filter(function (n) { return f.players.indexOf(n) === -1 && !used[n.toLowerCase()] && f.players.length; }));
            h.push('<div style="margin-top:6px;">' + pool.map(function (n) { var i = o.indexOf(n), side = i === -1 ? '' : i < 2 ? 'A' : 'B'; return chipBtn('data-lg-tp="' + esc(n) + '"', !!side, (side ? side + ' ' : '') + esc(n), side === 'B' ? '#1d3557' : '#0f4c3a'); }).join('') + '</div>'
                + '<div style="font-weight:800;color:#0f4c3a;">Team A: ' + esc(o[0] || '__') + ' &amp; ' + esc(o[1] || '__') + '</div><div style="font-weight:800;color:#5b7bb4;">Team B: ' + esc(o[2] || '__') + ' &amp; ' + esc(o[3] || '__') + '</div>'
                + '<button type="button" class="btn-outline-sm" data-lg="tswap">⇄ Swap teams</button> <button type="button" class="btn-outline-sm" data-lg="tadd"' + (o.length === 4 ? '' : ' disabled') + '>+ Add these teams</button>');
        }
        h.push('</div>');
        // 3. POINTS: under Format & points (every round's, and any round's own).
        // 4. GOLFERS
        h.push('<div class="form-group"><label>4. Golfers in the game (' + f.players.length + ' of ' + names.length + ') · only they score, and only they share the pot</label>'
            + '<div style="margin:2px 0 6px;"><button type="button" class="btn-outline-sm" data-lg="all">Select all</button> <button type="button" class="btn-outline-sm" data-lg="none">Clear</button></div><div style="display:flex;flex-wrap:wrap;">'
            + names.map(function (n) { var on = f.players.indexOf(n) !== -1; return chipBtn('class="tb-chip" data-lg-pl="' + esc(n) + '"', on, (on ? '✓ ' : '') + esc(n)); }).join('')
            + (names.length ? '' : '<span class="trip-section-sub">No golfers in these rounds yet.</span>') + '</div></div>');
        // 5. MONEY - the Weekly game's payout setup
        var cfg = formCfg(), pot = Math.round(cfg.buyIn * 100) * f.players.length;
        h.push('<div class="form-group"><label>5. Money</label>Buy-in per golfer $' + inp('buyIn', f.buyIn, 90, 1) + ' <span class="lg-pot-live" style="font-weight:700;">Pot ' + money(pot) + '</span>'
            + '<div style="margin-top:6px;"><select data-lg-pm="1"><option value="pct"' + (f.payMode === 'pct' ? ' selected' : '') + '>Split the pot by percentage</option><option value="usd"' + (f.payMode === 'usd' ? ' selected' : '') + '>Exact dollar amounts</option></select></div>');
        if (f.payMode === 'pct') {
            var opts = PRESETS.slice(); if (!PRESETS.some(function (p) { return p[0] === f.preset; })) opts.push([f.preset, f.preset.split(',').join(' / ') + ' %']);
            h.push('<select data-lg-pre="1" style="margin-top:6px;">' + opts.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === f.preset ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('') + '</select>');
        } else {
            var sum = cfg.placesUsd.reduce(function (a, b) { return a + b; }, 0);
            h.push('<div style="margin-top:6px;">' + f.placesUsd.map(function (v, i) { return '<div style="display:flex;gap:8px;align-items:center;margin:3px 0;"><span style="width:40px;font-weight:700;">' + ORD[i] + '</span>$' + inp('usd.' + i, v, 90, 1) + '</div>'; }).join('')
                + '<div style="display:flex;gap:8px;margin-top:6px;"><button type="button" class="btn-outline-sm" data-lg="usd+"' + (f.placesUsd.length >= 8 ? ' disabled' : '') + '>+ Add Place</button><button type="button" class="btn-outline-sm" data-lg="usd-"' + (f.placesUsd.length <= 1 ? ' disabled' : '') + '>− Remove</button></div>'
                + '<div class="lg-sum" style="font-size:.8rem;margin-top:4px;color:' + (Math.round(sum * 100) === pot ? 'var(--brand-green)' : 'var(--warn-text)') + ';">Adds up to ' + money(Math.round(sum * 100)) + ' of the ' + money(pot) + ' pot' + (Math.round(sum * 100) === pot ? '' : ' — must match') + '</div></div>');
        }
        h.push('</div>');
        if (f.msg) h.push('<div style="color:var(--warn-text);font-weight:700;">' + esc(f.msg) + '</div>');
        h.push('<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"><button type="button" class="btn-primary" data-lg="save">Save</button><button type="button" class="btn-outline" data-lg="cancel">Cancel</button>'
            + (E() && E().config(S.holder) ? '<button type="button" class="btn-outline" data-lg="off" style="color:var(--accent-red);">Turn this game off</button>' : '') + '</div></div>');
        return h.join('');
    }
    var FMT = { fourball: 'Four-ball / best ball (2v2)', foursomes: 'Alternate shot / foursomes (2v2)', scramble: 'Scramble (2v2)', singles: 'Singles (1v1)' };
    function rcText(rc) {
        return FMT[rc.format].replace(/ \(.*\)$/, '') + ', ' + (rc.mode === 'match' ? '18-hole match: win ' + ptsText(rc.win) + ' / halve ' + ptsText(rc.halve) : 'front / back / 18 = ' + ptsText(rc.pts.front) + ' / ' + ptsText(rc.pts.back) + ' / ' + ptsText(rc.pts.total))
            + (rc.format === 'scramble' || rc.format === 'foursomes' ? ' (results tapped in, unless a Cup round)' : '');
    }
    function rcControls(key, rc) {
        var num = function (k, v) { return '<input type="number" inputmode="decimal" min="0" step="0.5" data-lg-rcn="' + esc(key) + '|' + k + '" value="' + esc(v) + '" style="width:60px;">'; };
        return '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:4px;">'
            + '<select data-lg-rcs="' + esc(key) + '|format">' + Object.keys(FMT).map(function (k) { return '<option value="' + k + '"' + (rc.format === k ? ' selected' : '') + '>' + FMT[k] + '</option>'; }).join('') + '</select>'
            + '<select data-lg-rcs="' + esc(key) + '|mode"><option value="nassau"' + (rc.mode === 'nassau' ? ' selected' : '') + '>Nassau-style: front / back / 18</option><option value="match"' + (rc.mode === 'match' ? ' selected' : '') + '>Plain 18-hole match</option></select>'
            + (rc.mode === 'match' ? 'Win ' + num('win', rc.win) + ' Halve ' + num('halve', rc.halve) : 'Front ' + num('pts.front', rc.pts.front) + ' Back ' + num('pts.back', rc.pts.back) + ' 18 ' + num('pts.total', rc.pts.total))
            + '</div>';
    }
    function rcTarget(key) {
        var f = S.form;
        if (key === 'def') return f.def;
        var code = key.replace(/^r:/, '');
        if (!f.perRound[code]) f.perRound[code] = JSON.parse(JSON.stringify(f.def));
        return f.perRound[code];
    }
    function saveForm() {
        var f = S.form, cfg = formCfg(), eng = E();
        var fail = function (m) { f.msg = m; render(); };
        if (!(cfg.buyIn >= 0)) return fail('Type the buy-in.');
        if (f.players.length < 2) return fail('Pick the golfers in the game (at least two).');
        if (f.roundsMode === 'several' && !f.later && !f.rounds.length) return fail('Pick the rounds.');
        if (f.teamsMode === 'same' && !f.teams.length) return fail('Add the 2 v 2 teams (or pick "Teams change each round").');
        var pay = eng.payouts(f.players.map(function (p, i) { return { name: p, rank: i + 1 }; }), cfg);
        if (!pay.valid) return fail(f.payMode === 'usd' ? pay.why + '.' : 'The places must add up to 100%.');
        // WHERE IT IS KEPT: a trip's rounds -> the trip (the trip page shows it); this round only,
        // or rounds picked by code -> this round.
        var toTrip = f.roundsMode === 'several' && !!S.ctx.tripCode;
        var base = toTrip ? 'trips/' + S.ctx.tripCode + '/league' : 'events/' + S.ctx.thisRound + '/pointsGame';
        var keep = base === S.base ? (settings() || {}) : {};
        var per = {};
        Object.keys(f.perRound).forEach(function (k) { if (JSON.stringify(f.perRound[k]) !== JSON.stringify(f.def)) per[k] = f.perRound[k]; });
        var val = { on: true, buyIn: cfg.buyIn, players: f.players.slice(), pts: f.def.pts, def: f.def, perRound: Object.keys(per).length ? per : null,
            rounds: f.roundsMode === 'one' ? [String(S.ctx.thisRound)] : (f.later ? null : f.rounds.slice()),
            teamsMode: f.teamsMode, teams: f.teamsMode === 'same' ? f.teams : null, scoring: f.scoring,
            payMode: f.payMode, places: cfg.places, placesUsd: f.payMode === 'usd' ? cfg.placesUsd : null,
            overrides: keep.overrides || null, manual: keep.manual || null, at: Date.now() };
        if (!S.db) return fail('Not connected.');
        S.db.ref(base).update(val).then(function () {
            if (base !== S.base) { S.base = base; S.key = toTrip ? 'league' : 'pointsGame'; S.holder = {}; }
            var v = JSON.parse(JSON.stringify(val)); Object.keys(v).forEach(function (k) { if (v[k] === null) delete v[k]; });
            setSettings(Object.assign({}, settings() || {}, v));
            S.form = null; render();
        }, function (e) { fail('Not saved: ' + (e && e.message || e)); });
    }
    function addRound() {
        var f = S.form, code = String(f.addCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length < 4) { f.msg = 'Type the round’s game code.'; render(); return; }
        if (S.rounds.some(function (r) { return String(r.code) === code; })) { if (f.rounds.indexOf(code) === -1) f.rounds.push(code); f.addCode = ''; render(); return; }
        if (!S.ctx.loadRound) return;
        f.msg = 'Looking up ' + code + '…'; render();
        S.ctx.loadRound(code).then(function (r) {
            if (!r || !r.data || !(r.data.players || []).length) { f.msg = 'No round with the code ' + code + '.'; render(); return; }
            S.rounds.push(r); f.rounds.push(code); f.addCode = ''; f.msg = ''; render();
        }, function () { f.msg = 'Could not look up ' + code + '.'; render(); });
    }

    // ---- MATCH RESULTS (organizer) -------------------------------------------------------
    function usedRounds(st) { return st.cfg.rounds ? S.rounds.filter(function (r) { return st.cfg.rounds.indexOf(String(r.code)) !== -1; }) : S.rounds; }
    function resultsHtml(st) {
        var h = ['<div style="font-weight:800;margin-bottom:4px;">✏️ Match results</div><div class="trip-section-sub" style="margin:0 0 8px;">Each match is read from its round’s scores. Set any result by hand (A, B or ½), or Auto to go back to the scores. * = set by hand.</div>'];
        var rounds = usedRounds(st);
        rounds.forEach(function (r) {
            var ms = st.matches.filter(function (m) { return m.round === r.code; });
            h.push('<div style="margin-top:10px;font-weight:800;">' + esc(r.label || r.code) + '</div>');
            if (!ms.length) h.push('<div class="trip-section-sub">' + (st.cfg.teamsMode === 'same' ? 'None of the teams played this round together yet.' : 'No 2 v 2 Nassau in this round yet.') + '</div>');
            ms.forEach(function (m) {
                h.push('<div class="lg-res" data-lg-match="' + esc(m.id) + '" style="border:1px solid var(--border-faint);border-radius:10px;padding:8px;margin:6px 0;">'
                    + '<div style="font-weight:700;">' + (m.group ? 'Group ' + esc(m.group) + ': ' : '') + 'A ' + esc(m.a.join(' & ')) + ' v B ' + esc(m.b.join(' & ')) + (m.source === 'manual' ? ' <span class="trip-section-sub">(entered by hand)</span>' : '') + '</div>'
                    + ['front', 'back', 'total'].map(function (k) {
                        var o = ((st.cfg.overrides || {})[m.id] || {})[k] || null;
                        var chip = function (v, label) { var on = (o || 'auto') === v; return '<button type="button" data-lg-set="' + k + ':' + v + '" style="min-height:34px;min-width:44px;margin:2px;border-radius:999px;border:1px solid var(--brand-green);font-weight:800;' + (on ? 'background:var(--brand-green);color:#fff;' : 'background:var(--bg-card);') + '">' + label + '</button>'; };
                        return '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;"><span style="width:64px;font-size:.8rem;">' + SEG[k] + '</span>'
                            + (m.source === 'manual' ? '' : chip('auto', 'Auto' + (o ? '' : ' (' + segText(m.seg[k]) + ')')))
                            + chip('A', 'A') + chip('B', 'B') + chip('H', '½') + '</div>';
                    }).join('')
                    + (m.source === 'manual' ? '<button type="button" class="btn-outline-sm" data-lg-del="' + esc(m.id) + '" style="margin-top:4px;">Remove this match</button>' : '')
                    + '</div>');
            });
        });
        // A match for a group that played no Nassau: the round, then the 2 v 2 picker.
        var rd = rounds.filter(function (r) { return r.code === S.pickRound; })[0];
        var size = rd && E().roundOf(st.cfg, rd.code).format === 'singles' ? 1 : 2;
        h.push('<div style="margin-top:14px;border-top:1px solid var(--border-faint);padding-top:10px;"><div style="font-weight:800;">+ A match for a group with no Nassau</div>'
            + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;">' + rounds.map(function (r) { var on = r.code === S.pickRound; return '<button type="button" data-lg-round="' + esc(r.code) + '" style="min-height:34px;padding:4px 10px;border-radius:999px;border:1px solid var(--brand-green);font-weight:700;' + (on ? 'background:var(--brand-green);color:#fff;' : 'background:var(--bg-card);') + '">' + esc(r.label || r.code) + '</button>'; }).join('') + '</div>');
        if (rd) {
            var o = S.pickOrder, a = o.slice(0, size), b = o.slice(size, size * 2);
            h.push('<div class="trip-section-sub">' + (size === 1 ? 'Singles: first golfer tapped = A, the next = B.' : 'First two tapped = Team A, next two = Team B.') + ' Tap again to un-pick.</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0;">'
                + ((rd.data && rd.data.players) || []).map(function (p) { var i = o.indexOf(p.name), side = i === -1 ? '' : i < size ? 'A' : 'B'; return '<button type="button" data-lg-pick="' + esc(p.name) + '" style="min-height:36px;padding:4px 10px;border-radius:999px;font-weight:700;border:2px solid ' + (side === 'A' ? '#0f4c3a;background:#0f4c3a;color:#fff;' : side === 'B' ? '#1d3557;background:#1d3557;color:#fff;' : 'var(--border-mid);background:var(--bg-card);') + '">' + (side ? side + ' ' : '') + esc(p.name) + '</button>'; }).join('') + '</div>'
                + '<div style="font-weight:800;color:var(--brand-green);">' + (size === 1 ? 'A: ' + esc(a[0] || '__') : 'Team A: ' + esc(a[0] || '__') + ' &amp; ' + esc(a[1] || '__')) + '</div><div style="font-weight:800;color:#5b7bb4;">' + (size === 1 ? 'B: ' + esc(b[0] || '__') : 'Team B: ' + esc(b[0] || '__') + ' &amp; ' + esc(b[1] || '__')) + '</div>'
                + '<div style="display:flex;gap:8px;margin-top:6px;"><button type="button" class="btn-outline-sm" data-lg="swap">⇄ Swap</button><button type="button" class="btn-primary" data-lg="addmatch"' + (a.length === size && b.length === size ? '' : ' disabled') + '>Add this match</button></div>');
        }
        h.push('</div><div style="margin-top:12px;"><button type="button" class="btn-outline" data-lg="back">‹ Back to the standings</button></div>');
        return h.join('');
    }
    function setSeg(matchId, seg, v) {
        var cur = settings() || {};
        var ov = Object.assign({}, (cur.overrides || {})[matchId] || {});
        if (v === 'auto') delete ov[seg]; else ov[seg] = v;
        var val = Object.keys(ov).length ? ov : null;
        write('overrides/' + matchId, val).then(function () {
            var s2 = settings() || {}; s2.overrides = Object.assign({}, s2.overrides || {});
            if (val) s2.overrides[matchId] = val; else delete s2.overrides[matchId];
            setSettings(s2); render();
        }, function (e) { if (typeof W.uiFail === 'function') W.uiFail('⚠️ NOT SAVED\n' + (e && e.message || e)); });
    }
    function pickSize() { var c = E() && E().config(S.holder); return c && S.pickRound && E().roundOf(c, S.pickRound).format === 'singles' ? 1 : 2; }
    function addManual() {
        var o = S.pickOrder, sz = pickSize(); if (o.length !== sz * 2 || !S.pickRound) return;
        var id = 'm' + Date.now().toString(36);
        var val = { round: S.pickRound, a: o.slice(0, sz), b: o.slice(sz, sz * 2), at: Date.now() };
        write('manual/' + id, val).then(function () {
            var s2 = settings() || {}; s2.manual = Object.assign({}, s2.manual || {}); s2.manual[id] = val; setSettings(s2);
            S.pickOrder = []; render();
        }, function (e) { if (typeof W.uiFail === 'function') W.uiFail('⚠️ NOT SAVED\n' + (e && e.message || e)); });
    }
    function delManual(matchId) {
        var id = matchId.replace(/^manual~/, '');
        Promise.all([write('manual/' + id, null), write('overrides/' + matchId, null)]).then(function () {
            var s2 = settings() || {};
            if (s2.manual) delete s2.manual[id];
            if (s2.overrides) delete s2.overrides[matchId];
            setSettings(s2); render();
        });
    }

    // ---- TAPS ---------------------------------------------------------------------------
    function click(ev) {
        var t = ev.target && ev.target.closest ? ev.target : null;
        if (!t) return;
        var b, f = S.form;
        if ((b = t.closest('[data-lg-player]'))) { var n = b.getAttribute('data-lg-player'); S.open[n] = !S.open[n]; render(); return; }
        if (f) {
            if ((b = t.closest('[data-lg-pl]'))) { var pn = b.getAttribute('data-lg-pl'), names = formNames(); f.players = f.players.indexOf(pn) !== -1 ? f.players.filter(function (x) { return x !== pn; }) : names.filter(function (x) { return x === pn || f.players.indexOf(x) !== -1; }); render(); return; }
            if ((b = t.closest('[data-lg-rm]'))) { f.roundsMode = b.getAttribute('data-lg-rm'); render(); return; }
            if ((b = t.closest('[data-lg-rd]'))) { var rc = b.getAttribute('data-lg-rd'); f.rounds = f.rounds.indexOf(rc) !== -1 ? f.rounds.filter(function (x) { return x !== rc; }) : f.rounds.concat([rc]); render(); return; }
            if ((b = t.closest('[data-lg-later]'))) { f.later = !!b.checked; if (!f.later && !f.rounds.length) f.rounds = S.rounds.map(function (r) { return String(r.code); }); render(); return; }
            if ((b = t.closest('[data-lg-tm]'))) { f.teamsMode = b.getAttribute('data-lg-tm'); S.pickOrder = []; render(); return; }
            if ((b = t.closest('[data-lg-sc]'))) { f.scoring = b.getAttribute('data-lg-sc'); render(); return; }
            if ((b = t.closest('[data-lg-tp]'))) { var tp = b.getAttribute('data-lg-tp'), o1 = S.pickOrder.slice(), i1 = o1.indexOf(tp); if (i1 !== -1) o1.splice(i1, 1); else if (o1.length < 4) o1.push(tp); S.pickOrder = o1; render(); return; }
            if ((b = t.closest('[data-lg-tdel]'))) { f.teams.splice(Number(b.getAttribute('data-lg-tdel')), 1); render(); return; }
            if ((b = t.closest('[data-lg-rco]'))) { var oc = b.getAttribute('data-lg-rco'); f.openRound = f.openRound === oc ? null : oc; render(); return; }
            if ((b = t.closest('[data-lg-rcx]'))) { delete f.perRound[b.getAttribute('data-lg-rcx')]; render(); return; }
        }
        if ((b = t.closest('[data-lg-set]'))) { var mEl = b.closest('[data-lg-match]'), sv = b.getAttribute('data-lg-set').split(':'); if (mEl) setSeg(mEl.getAttribute('data-lg-match'), sv[0], sv[1]); return; }
        if ((b = t.closest('[data-lg-del]'))) { delManual(b.getAttribute('data-lg-del')); return; }
        if ((b = t.closest('[data-lg-round]'))) { S.pickRound = b.getAttribute('data-lg-round'); S.pickOrder = []; render(); return; }
        if ((b = t.closest('[data-lg-pick]'))) { var pk = b.getAttribute('data-lg-pick'), o = S.pickOrder.slice(), i = o.indexOf(pk), mx = pickSize() * 2; if (i !== -1) o.splice(i, 1); else if (o.length < mx) o.push(pk); S.pickOrder = o; render(); return; }
        if ((b = t.closest('[data-lg]'))) {
            var a = b.getAttribute('data-lg');
            if (a === 'setup') openForm();
            else if (a === 'cancel') { S.form = null; render(); }
            else if (a === 'save') saveForm();
            else if (a === 'off') { S.db.ref(S.base).update({ on: false }).then(function () { setSettings(Object.assign({}, settings() || {}, { on: false })); S.form = null; render(); }); }
            else if (a === 'all' && f) { f.players = formNames(); render(); }
            else if (a === 'none' && f) { f.players = []; render(); }
            else if (a === 'usd+' && f) { f.placesUsd.push(0); render(); }
            else if (a === 'usd-' && f) { f.placesUsd.pop(); render(); }
            else if (a === 'addround' && f) addRound();
            else if (a === 'tswap' && f) { S.pickOrder = S.pickOrder.slice(2, 4).concat(S.pickOrder.slice(0, 2)); render(); }
            else if (a === 'tadd' && f && S.pickOrder.length === 4) { f.teams.push({ a: S.pickOrder.slice(0, 2), b: S.pickOrder.slice(2, 4) }); S.pickOrder = []; render(); }
            else if (a === 'results') { S.view = 'results'; render(); }
            else if (a === 'back') { S.view = 'table'; render(); }
            else if (a === 'swap') { var sz = pickSize(); S.pickOrder = S.pickOrder.slice(sz, sz * 2).concat(S.pickOrder.slice(0, sz)); render(); }
            else if (a === 'addmatch') addManual();
        }
    }
    function change(ev) {
        var t = ev.target, f = S.form;
        if (!f || !t || !t.getAttribute) return;
        if (t.getAttribute('data-lg-rcs')) { var ks = t.getAttribute('data-lg-rcs').split('|'), tg = rcTarget(ks[0]); tg[ks[1]] = t.value; render(); return; }
        if (t.getAttribute('data-lg-pm')) { f.payMode = t.value; render(); }
        else if (t.getAttribute('data-lg-pre')) { f.preset = t.value; render(); }
    }
    function input(ev) {
        var t = ev.target, f = S.form;
        if (!f || !t || !t.getAttribute) return;
        if (t.getAttribute('data-lg-code')) { f.addCode = t.value; return; }
        if (t.getAttribute('data-lg-rcn')) { var kn = t.getAttribute('data-lg-rcn').split('|'), tn = rcTarget(kn[0]), v0 = Number(t.value) || 0; if (/^pts\./.test(kn[1])) tn.pts[kn[1].slice(4)] = v0; else tn[kn[1]] = v0; return; }
        var k = t.getAttribute('data-lg-f');
        if (!k) return;
        var v = t.value;
        if (k === 'buyIn') f.buyIn = v;
        else if (/^pts\./.test(k)) f.pts[k.slice(4)] = v;
        else if (/^usd\./.test(k)) f.placesUsd[Number(k.slice(4))] = Number(v) || 0;
        var card = $(S.ids.card), cfg = formCfg(), pot = Math.round(cfg.buyIn * 100) * f.players.length;
        var live = card && card.querySelector('.lg-live'); if (live) live.textContent = liveLine();
        var pl = card && card.querySelector('.lg-pot-live'); if (pl) pl.textContent = 'Pot ' + money(pot);
        var sumEl = card && card.querySelector('.lg-sum');
        if (sumEl && f.payMode === 'usd') { var sum = Math.round(cfg.placesUsd.reduce(function (a, b) { return a + b; }, 0) * 100); sumEl.style.color = sum === pot ? 'var(--brand-green)' : 'var(--warn-text)'; sumEl.textContent = 'Adds up to ' + money(sum) + ' of the ' + money(pot) + ' pot' + (sum === pot ? '' : ' — must match'); }
    }
    function mount() {
        var c = $(S.ids.card);
        if (c && !c.__lg) { c.__lg = true; c.addEventListener('click', click); c.addEventListener('input', input); c.addEventListener('change', change); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
    W.HardPanLeague = { render: function (o) { render(o); }, _state: function () { return S; }, calc: calc, holesFor: holesFor, openSetup: openForm };
})();
