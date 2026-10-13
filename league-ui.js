// ============================================================================
// POINTS LEAGUE - THE TRIP PAGE'S SCREENS (HardPan, gps-league). The math is
// league-engine.js; this draws it and saves the organizer's settings.
//
//   #league-card     the standings: rank, golfer, points, matches W-L-H, the pot and
//                    the projected payouts; tap a golfer for each match. The organizer
//                    also gets Set up / Edit and Match results (set any segment by hand,
//                    or enter a match for a group with no Nassau).
//   #league-settle   "Who gets paid" from the pot - its own card, settled separately.
//
// One write, one node: trips/<code>/league (settings, overrides, hand-entered matches).
// Rounds are only READ (their players, scores and Side Bets), through the same match
// engine call Side Bets makes. Nothing here touches Who Pays Who or any settlement.
// ============================================================================
(function () {
    'use strict';
    var W = window;
    var E = function () { return W.HardPanLeagueEngine; };
    var S = { code: null, trip: null, rounds: [], organizer: false, db: null, view: 'table', open: {}, form: null, pickRound: null, pickOrder: [] };
    function $(id) { return document.getElementById(id); }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function money(c) { var d = c / 100; return '$' + (d % 1 ? d.toFixed(2) : String(d)); }
    function ptsText(p) { return (p % 1 ? p.toFixed(1) : String(p)); }
    var ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
    var SEG = { front: 'Front 9', back: 'Back 9', total: '18' };

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
    function state() { return E() ? E().state(S.trip, S.rounds, calc, holesFor) : null; }
    function write(path, val) {
        if (!S.db || !S.code) return Promise.reject(new Error('not connected'));
        return S.db.ref('trips/' + S.code + '/league' + (path ? '/' + path : '')).set(val);
    }
    function update(val) {
        if (!S.db || !S.code) return Promise.reject(new Error('not connected'));
        return S.db.ref('trips/' + S.code + '/league').update(val);
    }
    function allNames() { return E() ? E().players(null, S.rounds) : []; }

    // ---- THE CARD ------------------------------------------------------------------
    function render(o) {
        if (o) { S.code = o.code; S.trip = o.trip || {}; S.rounds = o.rounds || []; S.organizer = !!o.organizer; S.db = o.db || S.db; }
        var sec = $('league-section'), card = $('league-card'), settle = $('league-settle');
        if (!card) return;
        var st = state();
        if (sec) sec.style.display = st || S.organizer ? '' : 'none';
        if (S.form) { card.innerHTML = formHtml(); if (settle) settle.innerHTML = ''; return; }
        if (S.view === 'results' && st && S.organizer) { card.innerHTML = resultsHtml(st); if (settle) settle.innerHTML = settleHtml(st); return; }
        if (!st) {
            card.innerHTML = S.organizer ? '<p class="trip-section-sub">Every round, each group plays 2 v 2; points from each group’s Nassau (front, back, 18) add up over the week. The pot pays the top places.</p>'
                + '<button type="button" class="btn-primary" data-lg="setup">🏅 Set up the Points League</button>' : '';
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
    function tableHtml(st) {
        var p = st.pay, h = [];
        h.push('<div class="lg-pot" style="font-weight:800;color:var(--brand-green);margin:2px 0 4px;">' + esc(potLine(st)) + '</div>');
        h.push('<div class="trip-section-sub" style="margin:0 0 8px;">Points: front ' + ptsText(st.cfg.pts.front) + ' · back ' + ptsText(st.cfg.pts.back) + ' · 18 ' + ptsText(st.cfg.pts.total)
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
        if (S.organizer) h.push('<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"><button type="button" class="btn-outline" data-lg="results">✏️ Match results</button><button type="button" class="btn-outline" data-lg="setup">⚙️ League setup</button></div>');
        return h.join('');
    }
    function segText(v) { return v === 'H' ? 'halved' : v ? v : '…'; }
    function matchLine(m) {
        var seg = function (k) {
            var v = m.seg[k], won = v && v !== 'H' && v === m.side, lost = v && v !== 'H' && v !== m.side;
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
            + '<div style="font-weight:800;">🏅 Points League — who gets paid</div>'
            + '<div class="trip-section-sub" style="margin:2px 0 8px;">Settle this separately: every golfer in the league puts ' + money(Math.round(st.cfg.buyIn * 100)) + ' in the pot (' + money(p.potCents) + '). It is not part of Who Pays Who.'
            + (undecided(st) ? ' Projected from the standings now — final when every match is decided.' : '') + '</div>'
            + (lines.length ? lines.map(function (r) { return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid var(--border-faint);"><span>' + (st.rows.filter(function (x) { return x.rank === r.rank; }).length > 1 ? 'T' : '') + r.rank + '. ' + esc(r.name) + ' · ' + ptsText(r.pts) + ' pts</span><b>' + money(p.payCents[r.name]) + '</b></div>'; }).join('')
                : '<div style="color:var(--text-muted);">' + (p.valid ? 'Nobody yet.' : esc(p.why)) + '</div>')
            + '</div>';
    }

    // ---- SETUP -----------------------------------------------------------------------
    function openForm() {
        var c = (E() && E().config(S.trip)) || null, names = allNames();
        // A NEW LEAGUE STARTS WITH NOBODY PICKED (Manny, 2026-10-13: "only 10 of us are in the
        // league"); "Select all" is one tap. An older league saved as "everyone" opens all picked.
        S.form = { buyIn: c ? c.buyIn : 20, players: c ? (c.players ? c.players.slice() : names.slice()) : [], pts: c ? Object.assign({}, c.pts) : { front: 1, back: 1, total: 1 },
            places: c ? c.places.slice() : [50, 30, 20], names: names, msg: '' };
        render();
    }
    function formHtml() {
        var f = S.form, sum = f.places.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
        var inp = function (k, v, w) { return '<input type="number" inputmode="decimal" min="0" step="0.5" data-lg-f="' + k + '" value="' + esc(v) + '" style="width:' + (w || 70) + 'px;">'; };
        return '<div class="lg-form">'
            + '<div style="font-weight:800;margin-bottom:6px;">🏅 Points League setup</div>'
            + '<div class="form-group"><label>Buy-in per golfer ($)</label>' + inp('buyIn', f.buyIn, 90) + '</div>'
            + '<div class="lg-live" role="status" style="font-weight:800;color:var(--brand-green);margin:4px 0 10px;">' + esc(liveLine()) + '</div>'
            + '<div class="form-group"><label>Golfers in the league (' + f.players.length + ' of ' + f.names.length + ') \u00b7 only they score, and only they share the pot</label>'
            + '<div style="margin:2px 0 6px;"><button type="button" class="btn-outline-sm" data-lg="all">Select all</button> <button type="button" class="btn-outline-sm" data-lg="none">Clear</button></div><div style="display:flex;flex-wrap:wrap;gap:6px;">'
            + f.names.map(function (n) { var on = f.players.indexOf(n) !== -1; return '<button type="button" class="tb-chip" data-lg-pl="' + esc(n) + '" aria-pressed="' + on + '" style="min-height:36px;padding:4px 10px;border-radius:999px;border:1px solid var(--brand-green);font-weight:700;' + (on ? 'background:var(--brand-green);color:#fff;' : 'background:var(--bg-card);') + '">' + (on ? '✓ ' : '') + esc(n) + '</button>'; }).join('')
            + (f.names.length ? '' : '<span class="trip-section-sub">No golfers in the trip’s rounds yet — everyone will be in once they are.</span>') + '</div></div>'
            + '<div class="form-group"><label>Points to each winning golfer</label>Front 9 ' + inp('pts.front', f.pts.front) + ' Back 9 ' + inp('pts.back', f.pts.back) + ' 18 ' + inp('pts.total', f.pts.total) + '</div>'
            + '<div class="form-group"><label>Paid places (% of the pot)</label><div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">'
            + f.places.map(function (p, i) { return ORD[i] + ' ' + inp('place.' + i, p, 64) + '%'; }).join(' ')
            + ' <button type="button" class="btn-outline-sm" data-lg="place+"' + (f.places.length >= 8 ? ' disabled' : '') + '>+ place</button> <button type="button" class="btn-outline-sm" data-lg="place-"' + (f.places.length <= 1 ? ' disabled' : '') + '>− place</button></div>'
            + '<div class="lg-sum" style="font-size:.8rem;margin-top:4px;color:' + (Math.abs(sum - 100) < 0.001 ? 'var(--brand-green)' : 'var(--warn-text)') + ';">Adds up to ' + Math.round(sum * 100) / 100 + '%' + (Math.abs(sum - 100) < 0.001 ? '' : ' — must be 100%') + '</div></div>'
            + (f.msg ? '<div style="color:var(--warn-text);font-weight:700;">' + esc(f.msg) + '</div>' : '')
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"><button type="button" class="btn-primary" data-lg="save">Save</button><button type="button" class="btn-outline" data-lg="cancel">Cancel</button>'
            + (E() && E().config(S.trip) ? '<button type="button" class="btn-outline" data-lg="off" style="color:var(--accent-red);">Turn the league off</button>' : '') + '</div></div>';
    }
    // "10 golfers · pot $200 · 1st $100 / 2nd $60 / 3rd $40", as the golfers and numbers change.
    function liveLine() {
        var f = S.form, n = f.players.length, eng = E();
        var buy = Number(f.buyIn) || 0, places = f.places.map(function (x) { return Number(x) || 0; }).filter(function (x) { return x > 0; });
        var head = n + ' golfer' + (n === 1 ? '' : 's') + ' \u00b7 pot ' + money(Math.round(buy * 100) * n);
        if (!eng || !n) return head;
        var rows = f.players.map(function (p, i) { return { name: p, rank: i + 1 }; });
        var pay = eng.payouts(rows, { buyIn: buy, places: places });
        if (!pay.valid) return head + ' \u00b7 the places must add up to 100%';
        return head + ' \u00b7 ' + pay.placeCents.map(function (c, i) { return ORD[i] + ' ' + money(c); }).join(' / ');
    }
    function saveForm() {
        var f = S.form, sum = f.places.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
        if (Math.abs(sum - 100) > 0.001) { f.msg = 'The paid places must add up to 100%.'; render(); return; }
        if (!(Number(f.buyIn) >= 0)) { f.msg = 'Type the buy-in.'; render(); return; }
        if (f.players.length < 2) { f.msg = 'Pick the golfers in the league (at least two).'; render(); return; }
        // The picked golfers are stored by name, always - never "everyone" - so a golfer added
        // to the trip later is not in the league unless picked.
        var all = false;
        update({ on: true, buyIn: Number(f.buyIn), players: all ? null : f.players.slice(), pts: { front: Number(f.pts.front) || 0, back: Number(f.pts.back) || 0, total: Number(f.pts.total) || 0 },
            places: f.places.map(Number), at: Date.now() }).then(function () {
            S.trip.league = Object.assign({}, S.trip.league || {}, { on: true, buyIn: Number(f.buyIn), players: all ? null : f.players.slice(), pts: { front: Number(f.pts.front) || 0, back: Number(f.pts.back) || 0, total: Number(f.pts.total) || 0 }, places: f.places.map(Number) });
            S.form = null; render();
        }, function (e) { f.msg = 'Not saved: ' + (e && e.message || e); render(); });
    }

    // ---- MATCH RESULTS (organizer) -------------------------------------------------------
    function resultsHtml(st) {
        var h = ['<div style="font-weight:800;margin-bottom:4px;">✏️ Match results</div><div class="trip-section-sub" style="margin:0 0 8px;">Each 2 v 2 Nassau is read from its round. Set any result by hand (A, B or ½), or Auto to go back to the scores. * = set by hand.</div>'];
        S.rounds.forEach(function (r) {
            var ms = st.matches.filter(function (m) { return m.round === r.code; });
            h.push('<div style="margin-top:10px;font-weight:800;">' + esc(r.label || r.code) + '</div>');
            if (!ms.length) h.push('<div class="trip-section-sub">No 2 v 2 Nassau in this round yet.</div>');
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
        var rd = S.rounds.filter(function (r) { return r.code === S.pickRound; })[0];
        h.push('<div style="margin-top:14px;border-top:1px solid var(--border-faint);padding-top:10px;"><div style="font-weight:800;">+ A match for a group with no Nassau</div>'
            + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;">' + S.rounds.map(function (r) { var on = r.code === S.pickRound; return '<button type="button" data-lg-round="' + esc(r.code) + '" style="min-height:34px;padding:4px 10px;border-radius:999px;border:1px solid var(--brand-green);font-weight:700;' + (on ? 'background:var(--brand-green);color:#fff;' : 'background:var(--bg-card);') + '">' + esc(r.label || r.code) + '</button>'; }).join('') + '</div>');
        if (rd) {
            var o = S.pickOrder, a = o.slice(0, 2), b = o.slice(2, 4);
            h.push('<div class="trip-section-sub">First two tapped = Team A, next two = Team B. Tap again to un-pick.</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0;">'
                + ((rd.data && rd.data.players) || []).map(function (p) { var i = o.indexOf(p.name), side = i === -1 ? '' : i < 2 ? 'A' : 'B'; return '<button type="button" data-lg-pick="' + esc(p.name) + '" style="min-height:36px;padding:4px 10px;border-radius:999px;font-weight:700;border:2px solid ' + (side === 'A' ? '#0f4c3a;background:#0f4c3a;color:#fff;' : side === 'B' ? '#1d3557;background:#1d3557;color:#fff;' : 'var(--border-mid);background:var(--bg-card);') + '">' + (side ? side + ' ' : '') + esc(p.name) + '</button>'; }).join('') + '</div>'
                + '<div style="font-weight:800;color:var(--brand-green);">Team A: ' + esc(a[0] || '__') + ' &amp; ' + esc(a[1] || '__') + '</div><div style="font-weight:800;color:#5b7bb4;">Team B: ' + esc(b[0] || '__') + ' &amp; ' + esc(b[1] || '__') + '</div>'
                + '<div style="display:flex;gap:8px;margin-top:6px;"><button type="button" class="btn-outline-sm" data-lg="swap">⇄ Swap teams</button><button type="button" class="btn-primary" data-lg="addmatch"' + (a.length === 2 && b.length === 2 ? '' : ' disabled') + '>Add this match</button></div>');
        }
        h.push('</div><div style="margin-top:12px;"><button type="button" class="btn-outline" data-lg="back">‹ Back to the standings</button></div>');
        return h.join('');
    }
    function setSeg(matchId, seg, v) {
        var ov = Object.assign({}, ((S.trip.league || {}).overrides || {})[matchId] || {});
        if (v === 'auto') delete ov[seg]; else ov[seg] = v;
        var val = Object.keys(ov).length ? ov : null;
        write('overrides/' + matchId, val).then(function () {
            S.trip.league = S.trip.league || {}; S.trip.league.overrides = Object.assign({}, S.trip.league.overrides || {});
            if (val) S.trip.league.overrides[matchId] = val; else delete S.trip.league.overrides[matchId];
            render();
        }, function (e) { if (typeof W.uiFail === 'function') W.uiFail('⚠️ NOT SAVED\n' + (e && e.message || e)); });
    }
    function addManual() {
        var o = S.pickOrder; if (o.length !== 4 || !S.pickRound) return;
        var id = 'm' + Date.now().toString(36);
        var val = { round: S.pickRound, a: o.slice(0, 2), b: o.slice(2, 4), at: Date.now() };
        write('manual/' + id, val).then(function () {
            S.trip.league = S.trip.league || {}; S.trip.league.manual = Object.assign({}, S.trip.league.manual || {}); S.trip.league.manual[id] = val;
            S.pickOrder = []; render();
        }, function (e) { if (typeof W.uiFail === 'function') W.uiFail('⚠️ NOT SAVED\n' + (e && e.message || e)); });
    }
    function delManual(matchId) {
        var id = matchId.replace(/^manual~/, '');
        Promise.all([write('manual/' + id, null), write('overrides/' + matchId, null)]).then(function () {
            if (S.trip.league && S.trip.league.manual) delete S.trip.league.manual[id];
            if (S.trip.league && S.trip.league.overrides) delete S.trip.league.overrides[matchId];
            render();
        });
    }

    // ---- TAPS ---------------------------------------------------------------------------
    function click(ev) {
        var t = ev.target && ev.target.closest ? ev.target : null;
        if (!t) return;
        var b;
        if ((b = t.closest('[data-lg-player]'))) { var n = b.getAttribute('data-lg-player'); S.open[n] = !S.open[n]; render(); return; }
        if ((b = t.closest('[data-lg-pl]')) && S.form) { var pn = b.getAttribute('data-lg-pl'), f = S.form; f.players = f.players.indexOf(pn) !== -1 ? f.players.filter(function (x) { return x !== pn; }) : f.names.filter(function (x) { return x === pn || f.players.indexOf(x) !== -1; }); render(); return; }
        if ((b = t.closest('[data-lg-set]'))) { var mEl = b.closest('[data-lg-match]'), sv = b.getAttribute('data-lg-set').split(':'); if (mEl) setSeg(mEl.getAttribute('data-lg-match'), sv[0], sv[1]); return; }
        if ((b = t.closest('[data-lg-del]'))) { delManual(b.getAttribute('data-lg-del')); return; }
        if ((b = t.closest('[data-lg-round]'))) { S.pickRound = b.getAttribute('data-lg-round'); S.pickOrder = []; render(); return; }
        if ((b = t.closest('[data-lg-pick]'))) { var pk = b.getAttribute('data-lg-pick'), o = S.pickOrder.slice(), i = o.indexOf(pk); if (i !== -1) o.splice(i, 1); else if (o.length < 4) o.push(pk); S.pickOrder = o; render(); return; }
        if ((b = t.closest('[data-lg]'))) {
            var a = b.getAttribute('data-lg');
            if (a === 'setup') openForm();
            else if (a === 'cancel') { S.form = null; render(); }
            else if (a === 'save') saveForm();
            else if (a === 'off') { update({ on: false }).then(function () { S.trip.league = Object.assign({}, S.trip.league, { on: false }); S.form = null; render(); }); }
            else if (a === 'all' && S.form) { S.form.players = S.form.names.slice(); render(); }
            else if (a === 'none' && S.form) { S.form.players = []; render(); }
            else if (a === 'place+' && S.form) { S.form.places.push(0); render(); }
            else if (a === 'place-' && S.form) { S.form.places.pop(); render(); }
            else if (a === 'results') { S.view = 'results'; render(); }
            else if (a === 'back') { S.view = 'table'; render(); }
            else if (a === 'swap') { S.pickOrder = S.pickOrder.slice(2, 4).concat(S.pickOrder.slice(0, 2)); render(); }
            else if (a === 'addmatch') addManual();
        }
    }
    function input(ev) {
        var t = ev.target, k = t && t.getAttribute && t.getAttribute('data-lg-f');
        if (!k || !S.form) return;
        var v = t.value;
        if (k === 'buyIn') S.form.buyIn = v;
        else if (/^pts\./.test(k)) S.form.pts[k.slice(4)] = v;
        else if (/^place\./.test(k)) S.form.places[Number(k.slice(6))] = Number(v) || 0;
        var sum = S.form.places.reduce(function (a, b) { return a + (Number(b) || 0); }, 0), el = document.querySelector('#league-card .lg-sum');
        if (el) { var ok = Math.abs(sum - 100) < 0.001; el.style.color = ok ? 'var(--brand-green)' : 'var(--warn-text)'; el.textContent = 'Adds up to ' + Math.round(sum * 100) / 100 + '%' + (ok ? '' : ' — must be 100%'); }
        var live = document.querySelector('#league-card .lg-live'); if (live) live.textContent = liveLine();
    }
    function mount() {
        var c = $('league-card');
        if (c && !c.__lg) { c.__lg = true; c.addEventListener('click', click); c.addEventListener('input', input); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
    W.HardPanLeague = { render: function (o) { mount(); render(o); }, _state: function () { return S; }, calc: calc, holesFor: holesFor };
})();
