// ============================================================================
// HardPan — BINGO BANGO BONGO + VEGAS ON SCREEN (gps-games, 2026-10-11)
//
// Three places, no engine of its own (bbb-engine.js / vegas-engine.js do the math):
//   - SCORECARD: a live card per game. BBB has the hole's three quick taps
//     (Bingo / Bango / Bongo -> a golfer; tap again to clear).
//   - SETTLEMENT: a card per game with its own who-pays-whom. These games are NOT
//     in Final Money / Who Pays Who: settlement-engine.js is untouched, so the card
//     says to settle them separately.
//   - ROUND SETUP (Money step): add / edit / remove, $ per point, golfers, Vegas
//     teams and the birdie flip.
//
// STORAGE: events/<round>/additionalGameInstances/<id> = { format: 'bbb' | 'vegas', ... }
// - the map the Action tab and Round Setup already write. The only new write is a
// BBB point: .../<id>/points/h<n>/<bingo|bango|bongo> = golfer id. Older apps
// (build 12, the web app) skip a format they do not know, keep it as-is when
// Round Setup is saved, and settle every other game exactly as before.
// ============================================================================
(function () {
    'use strict';
    var W = window;
    var FORMATS = { bbb: { icon: '🟢', label: 'Bingo Bango Bongo' }, vegas: { icon: '🔢', label: 'Vegas' } };
    var KIND_LABEL = { bingo: 'Bingo · first on', bango: 'Bango · closest', bongo: 'Bongo · first in' };
    var ctx = null;

    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function safeId(x) { return /^[\w-]{1,64}$/.test(String(x)) ? String(x) : null; }
    function money(x) { var a = Math.abs(x); var s = a % 1 ? a.toFixed(2) : String(a); return (x > 0 ? '+$' : x < 0 ? '−$' : '$') + s; }
    function dollars(x) { var a = Math.abs(x); return '$' + (a % 1 ? a.toFixed(2) : String(a)); }
    function nameOf(data, id) { var p = ((data && data.players) || []).filter(function (x) { return String(x.id) === String(id); })[0]; return p ? p.name : 'Golfer ' + id; }
    function first(n) { return String(n).split(' ')[0]; }

    // The round's BBB / Vegas games, in the order they were added.
    function games(data) {
        var m = (data && data.additionalGameInstances) || {};
        return Object.keys(m).filter(function (id) { var g = m[id]; return g && FORMATS[g.format] && g.enabled !== false && safeId(id); })
            .sort(function (a, b) { return (m[a].createdAt || 0) - (m[b].createdAt || 0) || (a < b ? -1 : 1); })
            .map(function (id) { return { id: id, cfg: m[id] }; });
    }
    function bbbCalc(data, cfg) { return W.HardPanBBB ? W.HardPanBBB.calculateBBB(cfg, (data && data.players) || []) : null; }
    function vegasCalc(data, cfg, courseData, scores) { return W.HardPanVegas ? W.HardPanVegas.calculateVegas(cfg, courseData || (data && data.courseData) || [], scores || (data && data.scores) || {}) : null; }
    function teamName(data, t) { return (t || []).map(function (id) { return first(nameOf(data, id)); }).join(' & '); }

    // ---- SCORECARD -----------------------------------------------------------
    // o: { hole, canTap(ids) -> bool, write(path, value) -> Promise, online() -> bool, fail(msg) }
    function liveHtml(data, o) {
        ctx = o || null;
        return games(data).map(function (g) { return g.cfg.format === 'bbb' ? bbbLive(data, g, o || {}) : vegasLive(data, g); }).join('');
    }
    function bbbLive(data, g, o) {
        var r = bbbCalc(data, g.cfg);
        if (!r || r.players.length < 2) return '';
        var rows = r.players.map(function (p) {
            var id = String(p.id);
            return '<div class="ld-row"><div class="ld-head"><span class="ld-name">' + esc(p.name) + '</span><span class="ld-total">'
                + r.points[id] + ' pt' + (r.points[id] === 1 ? '' : 's') + ' · ' + money(r.net[id]) + '</span></div></div>';
        }).join('');
        var hole = Number(o.hole);
        var ids = r.players.map(function (p) { return String(p.id); });
        var taps = '';
        if (hole >= 1 && hole <= 36 && typeof o.canTap === 'function' && o.canTap(ids)) {
            var now = (g.cfg.points && g.cfg.points['h' + hole]) || {};
            taps = '<div class="exg-taps" style="margin-top:8px;border-top:1px solid rgba(127,127,127,.25);padding-top:6px;">'
                + '<div style="font-size:.72rem;font-weight:800;opacity:.75;">HOLE ' + hole + ' — tap who won each point</div>'
                + ['bingo', 'bango', 'bongo'].map(function (k) {
                    return '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px;"><span style="font-size:.75rem;font-weight:800;min-width:96px;">' + KIND_LABEL[k] + '</span>'
                        + r.players.map(function (p) {
                            var on = String(now[k]) === String(p.id);
                            return '<button type="button" class="exg-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-exg-game="' + g.id + '" data-exg-kind="' + k + '" data-exg-pid="' + esc(p.id) + '" data-exg-hole="' + hole + '"'
                                + ' onclick="HardPanExtraGames.tapFrom(this)" style="min-height:36px;padding:4px 10px;border-radius:999px;border:1px solid var(--brand-green,#2e7d32);font-weight:800;'
                                + (on ? 'background:var(--brand-green,#2e7d32);color:#fff;' : 'background:transparent;color:inherit;') + '">' + esc(first(p.name)) + '</button>';
                        }).join('') + '</div>';
                }).join('') + '</div>';
        }
        return '<div class="lm-card exg-card" data-exg="' + g.id + '"><div class="lm-card-title">' + FORMATS.bbb.icon + ' BINGO BANGO BONGO · ' + dollars(r.perPoint) + '/pt</div>' + rows + taps + '</div>';
    }
    function vegasLive(data, g) {
        var r = vegasCalc(data, g.cfg);
        if (!r) return '';
        var head = '<div class="lm-card-title">' + FORMATS.vegas.icon + ' VEGAS · ' + dollars(r.perPoint) + '/pt' + (g.cfg.vegasBirdieFlip ? ' · birdie flip' : '') + '</div>';
        if (!r.valid) return '<div class="lm-card exg-card" data-exg="' + g.id + '">' + head + '<div class="ld-row">Vegas needs two teams of two — set them in Round Setup › Money.</div></div>';
        var a = teamName(data, g.cfg.vegasTeamA), b = teamName(data, g.cfg.vegasTeamB);
        var lead = r.pointsA > 0 ? a + ' +' + r.pointsA + ' pts · ' + money(r.net[String(g.cfg.vegasTeamA[0])]) + ' each'
            : r.pointsA < 0 ? b + ' +' + (-r.pointsA) + ' pts · ' + money(r.net[String(g.cfg.vegasTeamB[0])]) + ' each' : 'All square';
        var last = r.holes[r.holes.length - 1];
        var lastLine = last ? 'H' + last.hole + ': ' + last.a + (last.flipA ? '↻' : '') + ' v ' + last.b + (last.flipB ? '↻' : '')
            + (last.winner ? ' → ' + (last.winner === 'A' ? a : b) + ' +' + last.points : ' → halved') : 'No hole complete yet';
        return '<div class="lm-card exg-card" data-exg="' + g.id + '">' + head
            + '<div class="ld-row"><div class="ld-head"><span class="ld-name">' + esc(a) + ' v ' + esc(b) + '</span></div></div>'
            + '<div class="ld-row"><div class="ld-head"><span class="ld-name">' + esc(lead) + '</span><span class="ld-total">' + r.holes.length + ' hole' + (r.holes.length === 1 ? '' : 's') + '</span></div></div>'
            + '<div class="ld-row" style="font-size:.78rem;opacity:.8;">' + esc(lastLine) + '</div></div>';
    }
    // A tap: set that golfer for that point, or clear it when it is already theirs.
    function tapFrom(el) {
        if (!el || !ctx) return;
        var id = safeId(el.getAttribute('data-exg-game')), kind = el.getAttribute('data-exg-kind');
        var hole = parseInt(el.getAttribute('data-exg-hole'), 10), pid = el.getAttribute('data-exg-pid');
        if (!id || !KIND_LABEL[kind] || !(hole >= 1 && hole <= 36) || !pid) return;
        if (typeof ctx.online === 'function' && !ctx.online()) return;
        var on = el.getAttribute('aria-pressed') === 'true';
        var v = on ? null : (/^\d+$/.test(pid) ? Number(pid) : pid);
        var p = ctx.write(id + '/points/h' + hole + '/' + kind, v);
        if (p && typeof p.catch === 'function') p.catch(function (e) { if (typeof ctx.fail === 'function') ctx.fail('Could not save that point: ' + (e && e.message || e)); });
    }

    // ---- SETTLEMENT ----------------------------------------------------------
    function settleHtml(data, courseData, scores) {
        return games(data).map(function (g) {
            var bbb = g.cfg.format === 'bbb';
            var r = bbb ? bbbCalc(data, g.cfg) : vegasCalc(data, g.cfg, courseData, scores);
            if (!r || (bbb ? r.players.length < 2 : !r.valid)) return '';
            var f = FORMATS[g.cfg.format];
            var sub = bbb ? r.totalPoints + ' points over ' + r.holesPlayed + ' hole' + (r.holesPlayed === 1 ? '' : 's')
                : teamName(data, g.cfg.vegasTeamA) + ' v ' + teamName(data, g.cfg.vegasTeamB) + ' · ' + r.holes.length + ' hole' + (r.holes.length === 1 ? '' : 's') + ' · ' + Math.abs(r.pointsA) + ' pt' + (Math.abs(r.pointsA) === 1 ? '' : 's');
            var ids = Object.keys(r.net);
            var rows = ids.map(function (id) {
                return '<div class="ledger-row"><span>' + esc(nameOf(data, id)) + (bbb ? ' · ' + r.points[id] + ' pt' + (r.points[id] === 1 ? '' : 's') : '') + '</span><span>' + money(r.net[id]) + '</span></div>';
            }).join('');
            var pays = r.payments.length ? r.payments.map(function (p) { return '<div class="ledger-row"><span>' + esc(nameOf(data, p.from)) + ' pays ' + esc(nameOf(data, p.to)) + '</span><span>' + dollars(p.amount) + '</span></div>'; }).join('')
                : '<div class="ledger-row"><span>Nobody owes anything</span><span></span></div>';
            return '<div class="settle-card exg-settle"><div class="settle-header">' + f.icon + ' ' + f.label + ' · ' + dollars(r.perPoint) + '/pt</div>'
                + '<div style="font-size:.78rem;opacity:.8;margin:2px 0 6px;">' + esc(sub) + '</div>' + rows
                + '<div class="exg-how" style="font-size:.78rem;margin-top:8px;padding:8px;border-radius:10px;background:rgba(127,127,127,.1);"><b>How it adds up</b><br>' + (bbb ? bbbHow(data, r) : vegasHow(data, g.cfg, r)) + '</div>'
                + '<div style="font-size:.78rem;font-weight:800;margin-top:8px;">Settle this game separately — it is not in Who Pays Who above:</div>' + pays + '</div>';
        }).join('');
    }
    // THE WORKED EXAMPLE on the payout card, from this round's own numbers.
    function bbbHow(data, r) {
        var ids = Object.keys(r.net), n = ids.length;
        var top = ids.slice().sort(function (a, b) { return r.points[b] - r.points[a]; })[0];
        var pts = r.points[top], diff = n * pts - r.totalPoints;
        return 'Every golfer plays every other: the one with more points takes the difference x ' + dollars(r.perPoint) + '.<br>'
            + esc(nameOf(data, top)) + ': ' + pts + ' pts x ' + n + ' golfers \u2212 ' + r.totalPoints + ' total = '
            + (diff > 0 ? '+' : '') + diff + ' x ' + dollars(r.perPoint) + ' = ' + money(r.net[top]) + '.';
    }
    function vegasHow(data, cfg, r) {
        var a = teamName(data, cfg.vegasTeamA), b = teamName(data, cfg.vegasTeamB);
        var won = r.holes.filter(function (h) { return h.winner; });
        var ex = won.filter(function (h) { return h.flipA || h.flipB; })[0] || won[0];
        var line = 'Each hole, a team\'s two scores make a number, low score first (a 10+ goes first: 4 and 10 = 104)'
            + (cfg.vegasBirdieFlip ? '; a birdie flips the OTHER team\'s number (\u21BB), both birdie = no flip' : '') + '. The lower number wins the difference.<br>';
        if (ex) line += 'Hole ' + ex.hole + ': ' + esc(a) + ' ' + ex.a + (ex.flipA ? '\u21BB' : '') + ' v ' + esc(b) + ' ' + ex.b + (ex.flipB ? '\u21BB' : '')
            + ' \u2192 ' + esc(ex.winner === 'A' ? a : b) + ' +' + ex.points + '.<br>';
        var pts = Math.abs(r.pointsA), lead = r.pointsA > 0 ? a : b, lose = r.pointsA > 0 ? b : a;
        line += pts ? 'Round: ' + esc(lead) + ' +' + pts + ' pts x ' + dollars(r.perPoint) + ' = ' + dollars(pts * r.perPoint) + ' to EACH of ' + esc(lead) + '; ' + esc(lose) + ' each pay it.'
            : 'Round: all square - nobody pays.';
        return line;
    }

    // ---- ROUND SETUP (Money step) ----------------------------------------------
    // o: { mount: el, get() -> the wizard's held instance map, players() -> [{ id, name }], changed() }
    // Edits change only the BBB / Vegas entries' settings - never a BBB point.
    var ed = null;
    function newId() { return 'xg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function addGame(map, format, players, perPoint) {
        var ids = (players || []).map(function (p) { return String(p.id); });
        var e = { format: format, enabled: true, startHole: 1, createdAt: Date.now() };
        if (format === 'bbb') { e.bbbPointVal = perPoint || 1; if (ids.length) e.participantIds = ids.slice(0, 4); }
        else {
            e.vegasPointVal = perPoint || 1; e.vegasBirdieFlip = false;
            e.vegasTeamA = ids.slice(0, 2); e.vegasTeamB = ids.slice(2, 4);
            e.participantIds = ids.slice(0, 4);
        }
        var id = newId();
        map[id] = e;
        return id;
    }
    function editorHtml(map, players) {
        var ids = Object.keys(map || {}).filter(function (id) { return map[id] && FORMATS[map[id].format]; });
        var chip = function (on, label, act, id, pid) {
            return '<button type="button" data-exg-act="' + act + '" data-exg-id="' + id + '" data-exg-pid="' + esc(pid) + '" aria-pressed="' + !!on + '" style="min-height:36px;padding:4px 10px;border-radius:999px;border:1px solid var(--brand-green);font-weight:800;'
                + (on ? 'background:var(--brand-green);color:#fff;' : 'background:var(--bg-card);color:var(--text-main,inherit);') + '">' + esc(label) + '</button>';
        };
        var rows = ids.map(function (id) {
            var e = map[id], f = FORMATS[e.format], bbb = e.format === 'bbb';
            var amt = bbb ? e.bbbPointVal : e.vegasPointVal;
            var amts = (bbb ? [0.5, 1, 2, 5] : [0.25, 0.5, 1, 2]).map(function (v) { return chip(Number(amt) === v, '$' + v, 'amt', id, v); }).join('');
            var golfers;
            if (bbb) {
                var inIds = Array.isArray(e.participantIds) ? e.participantIds.map(String) : players.map(function (p) { return String(p.id); });
                golfers = players.map(function (p) { return chip(inIds.indexOf(String(p.id)) !== -1, first(p.name), 'bbbp', id, p.id); }).join('');
            } else {
                // THE 2v2 PICKER (same as Side Matches): first two tapped = Team A (green),
                // next two = Team B (navy); tap again to un-pick; Swap teams.
                var A = (e.vegasTeamA || []).map(String), B = (e.vegasTeamB || []).map(String);
                var nm = function (xs) { return xs.map(function (x) { var p = players.filter(function (q) { return String(q.id) === x; })[0]; return p ? first(p.name) : '__'; }); };
                golfers = players.map(function (p) {
                    var s = String(p.id), side = A.indexOf(s) !== -1 ? 'A' : B.indexOf(s) !== -1 ? 'B' : '';
                    var c = chip(!!side, (side ? side + ((side === 'A' ? A : B).indexOf(s) + 1) + ' · ' : '') + first(p.name), 'vside', id, p.id);
                    return side === 'B' ? c.replace('background:var(--brand-green);', 'background:#1d3557;border-color:#1d3557;') : c;
                }).join('');
                var tl = function (t, xs, col) { var n = nm(xs); return '<div style="font-weight:800;font-size:.82rem;color:' + col + ';">Team ' + t + ': ' + esc(n[0] || '__') + ' &amp; ' + esc(n[1] || '__') + '</div>'; };
                golfers += '<div style="flex-basis:100%;margin-top:4px;">' + tl('A', A, 'var(--brand-green)') + tl('B', B, '#5b7bb4') + '</div>'
                    + '<button type="button" data-exg-act="vswap" data-exg-id="' + id + '" class="btn-outline" style="min-height:36px;padding:4px 12px;"' + (A.length || B.length ? '' : ' disabled') + '>⇄ Swap teams</button>';
            }
            var ok = bbb ? (Array.isArray(e.participantIds) ? e.participantIds.length : players.length) >= 2 : !!(W.HardPanVegas && W.HardPanVegas.vegasValid(e));
            return '<div class="exg-ed" style="border-top:1px solid var(--border-mid);padding-top:10px;margin-top:10px;">'
                + '<div style="display:flex;justify-content:space-between;align-items:center;"><b style="color:var(--brand-green);">' + f.icon + ' ' + f.label + '</b>'
                + '<button type="button" data-exg-act="remove" data-exg-id="' + id + '" style="border:0;background:none;color:var(--text-muted);font-weight:800;min-height:36px;">Remove</button></div>'
                + '<div style="font-size:.72rem;color:var(--text-muted);margin:2px 0 6px;">' + (bbb ? '$ per point · 3 points a hole, tapped on the scorecard · no handicaps' : '$ per point · two teams of two, low score first · gross') + '</div>'
                + '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + amts + '</div>'
                + '<div style="font-size:.72rem;font-weight:800;margin:8px 0 4px;">' + (bbb ? 'Golfers (tap to leave out / put in):' : 'Tap golfers: first two = Team A, next two = Team B · tap again to un-pick') + '</div>'
                + '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + golfers + '</div>'
                + (bbb ? '' : '<label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-size:.82rem;cursor:pointer;"><input type="checkbox" data-exg-act="flip" data-exg-id="' + id + '"' + (e.vegasBirdieFlip ? ' checked' : '') + ' style="width:18px;height:18px;margin:0;"> Birdie flips the other team\'s number</label>')
                + (ok ? '' : '<div role="status" style="color:#b45309;font-size:.78rem;font-weight:800;margin-top:6px;">' + (bbb ? 'Needs at least 2 golfers' : 'Needs Team A of 2 and Team B of 2') + '</div>')
                + '</div>';
        }).join('');
        return '<div style="border-top:1px solid var(--border-mid);padding-top:10px;margin-top:10px;">'
            + '<div style="font-size:.78rem;font-weight:800;color:var(--text-muted);">NEW · HardPan only (settled on their own card)</div>'
            + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">'
            + '<button type="button" class="btn-outline" data-exg-act="add" data-exg-id="bbb">+ ' + FORMATS.bbb.icon + ' Bingo Bango Bongo</button>'
            + '<button type="button" class="btn-outline" data-exg-act="add" data-exg-id="vegas">+ ' + FORMATS.vegas.icon + ' Vegas</button></div>'
            + rows + '</div>';
    }
    function editorAct(map, players, act, id, pid) {
        var e = map[id];
        if (act === 'add') { addGame(map, id, players); return true; }
        if (!e || !FORMATS[e.format]) return false;
        if (act === 'remove') { delete map[id]; return true; }
        if (act === 'amt') { e[e.format === 'bbb' ? 'bbbPointVal' : 'vegasPointVal'] = Number(pid); return true; }
        if (act === 'flip') { e.vegasBirdieFlip = !e.vegasBirdieFlip; return true; }
        var all = players.map(function (p) { return String(p.id); }), s = String(pid);
        if (act === 'bbbp') {
            var cur = Array.isArray(e.participantIds) ? e.participantIds.map(String) : all.slice();
            cur = cur.indexOf(s) !== -1 ? cur.filter(function (x) { return x !== s; }) : cur.concat([s]);
            e.participantIds = all.filter(function (x) { return cur.indexOf(x) !== -1; });
            return true;
        }
        if (act === 'vside' || act === 'vswap') {
            // Tap order = Team A then Team B; picking appends, re-tapping removes (the rest
            // move up), Swap puts B first.
            var o = (e.vegasTeamA || []).map(String).concat((e.vegasTeamB || []).map(String));
            if (act === 'vswap') o = o.slice(2, 4).concat(o.slice(0, 2));
            else if (o.indexOf(s) !== -1) o = o.filter(function (x) { return x !== s; });
            else if (o.length < 4) o.push(s);
            e.vegasTeamA = o.slice(0, 2); e.vegasTeamB = o.slice(2, 4); e.participantIds = o.slice(0, 4);
            return true;
        }
        return false;
    }
    function editor(o) {
        ed = o;
        if (!o || !o.mount) return;
        var draw = function () { o.mount.innerHTML = editorHtml(o.get(), o.players()); };
        if (!o.mount.__exg) {
            o.mount.__exg = true;
            o.mount.addEventListener('click', function (ev) {
                var b = ev.target && ev.target.closest ? ev.target.closest('[data-exg-act]') : null;
                if (!b || !ed) return;
                if (editorAct(ed.get(), ed.players(), b.getAttribute('data-exg-act'), b.getAttribute('data-exg-id'), b.getAttribute('data-exg-pid'))) {
                    ed.mount.innerHTML = editorHtml(ed.get(), ed.players());
                    if (typeof ed.changed === 'function') ed.changed();
                }
            });
        }
        draw();
    }
    // A wizard that stays open while the group plays must not write back stale BBB
    // points on Save: keep the held copies' points in step with the round.
    function freshPoints(held, live) {
        Object.keys(held || {}).forEach(function (id) {
            var h = held[id], l = live && live[id];
            if (!h || h.format !== 'bbb') return;
            if (l && l.points) h.points = JSON.parse(JSON.stringify(l.points)); else delete h.points;
        });
    }
    function dropPoints(held) { Object.keys(held || {}).forEach(function (id) { if (held[id] && held[id].format === 'bbb') delete held[id].points; }); }

    W.HardPanExtraGames = {
        FORMATS: FORMATS, games: games, liveHtml: liveHtml, tapFrom: tapFrom, settleHtml: settleHtml,
        addGame: addGame, editorHtml: editorHtml, editorAct: editorAct, editor: editor, freshPoints: freshPoints, dropPoints: dropPoints
    };
})();
