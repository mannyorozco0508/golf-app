// ============================================================================
// PASTE THE WHOLE TRIP / ROUND - THE REVIEW SCREEN AND THE DRAFTS (gps-paste)
//
// trip-setup-paste.js turns the text into a plan; this shows it - QUESTIONS FIRST
// (a day with no date, Nassau sides to pick, "use Day 1's groups?"), then each day:
// date, course, tee time, the groups (golfers + handicaps, teams), the games - and
// NOTHING IS WRITTEN until Confirm. Confirm hands the result to the page, which
// feeds the EXISTING flows (the trip's itinerary + golfers boxes, Round Setup, Side
// Matches). Each day's groups + games are kept ON THIS PHONE as a draft that the
// day's Round Setup offers to fill in ("Fill it in"); the organizer taps Save.
//
// No money engine, settlement or game type is touched: a draft only says what to
// type into the existing screens.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var PENDING = 'hardpan_paste_pending_v1';        // a trip's drafts before Build Trip makes the round codes
    var DRAFT = 'hardpan_paste_draft_v1_';           // + round code
    var BETS = 'hardpan_paste_bets_v1_';             // + round code: bets for Side Matches after Save
    function lsGet(k) { try { var v = W.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function lsSet(k, v) { try { W.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function lsDel(k) { try { W.localStorage.removeItem(k); } catch (e) {} }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function money(x) { return x == null ? '?' : '$' + (Math.round(x) === x ? x : x.toFixed(2)); }
    function gameText(g) {
        if (g.type === 'nassau') return 'Nassau ' + (g.front == null ? '(amount?)' : money(g.front) + '/' + money(g.back) + '/' + money(g.overall)) + (g.press === 'auto' ? ', auto press' : g.press === 'manual' ? ', presses' : '');
        if (g.type === 'skins') return 'Skins ' + (g.amount == null ? '(amount?)' : money(g.amount)) + (g.carry === true ? ', carry over' : g.carry === false ? ', no carry' : '');
        if (g.type === 'wolf') return 'Wolf' + (g.perPoint != null ? ' ' + money(g.perPoint) + '/point' : '');
        if (g.type === 'birdie' || g.type === 'dots') return g.label + (g.amount != null ? ' ' + money(g.amount) : '');
        return g.label;
    }
    // Nassau sides for a group: teams named -> those; two golfers -> them; else the review asks.
    function nassauSides(group, picks) {
        if (group.teams) return { a: group.teams[0], b: group.teams[1], how: 'teams' };
        if (group.players.length === 2) return { a: [group.players[0].name], b: [group.players[1].name], how: 'pair' };
        var p = picks || {};
        var a = group.players.filter(function (x) { return p[x.name] === 'A'; }).map(function (x) { return x.name; });
        var b = group.players.filter(function (x) { return p[x.name] === 'B'; }).map(function (x) { return x.name; });
        return a.length && b.length ? { a: a, b: b, how: 'picked' } : null;
    }

    // ---- THE REVIEW -------------------------------------------------------------------
    // opts: { mode: 'trip' | 'round', onConfirm(resolved), onEdit() }
    function renderReview(el, plan, opts) {
        opts = opts || {};
        var st = { dates: {}, sameAs: {}, picks: {}, skipNassau: {} };
        plan.flags.forEach(function (f) { if (f.sameAs) st.sameAs[f.day] = true; });
        function draw() {
            var h = [];
            // One round: its date is the round's own - a weekday with no date is not a question.
            var asks = plan.flags.filter(function (f) { return f.level === 'ask' && !/Who plays whom/.test(f.why) && !f.sameAs && !(opts.mode === 'round' && /has no date/.test(f.why)); });
            var skips = plan.flags.filter(function (f) { return f.level === 'skip'; });
            var warns = plan.flags.filter(function (f) { return f.level === 'warn'; });
            var info = plan.flags.filter(function (f) { return f.level === 'info'; });
            h.push('<div class="sp-review">');
            h.push('<div class="sp-sum">Read: <b>' + plan.days.length + '</b> day' + (plan.days.length === 1 ? '' : 's') + ', <b>' + plan.players.length + '</b> golfers. Nothing is saved until you confirm.</div>');
            if (asks.length) h.push('<div class="sp-box sp-ask"><b>Questions</b><ul>' + asks.map(function (f) { return '<li>' + (f.day ? 'Day ' + f.day + ': ' : '') + esc(f.why) + '</li>'; }).join('') + '</ul></div>');
            if (skips.length) h.push('<div class="sp-box sp-skip"><b>Skipped (not a game in this app)</b><ul>' + skips.map(function (f) { return '<li>' + esc(f.text) + '</li>'; }).join('') + '</ul></div>');
            if (warns.length) h.push('<div class="sp-box sp-warn"><b>Check these</b><ul>' + warns.map(function (f) { return '<li>' + (f.line ? 'Line ' + f.line + ': ' : '') + esc(f.why) + (f.text && f.text !== f.why ? ' — “' + esc(f.text) + '”' : '') + '</li>'; }).join('') + '</ul></div>');
            if (info.length) h.push('<div class="sp-box sp-info">Ignored: ' + info.map(function (f) { return '“' + esc(f.text) + '”'; }).join(', ') + '</div>');
            plan.days.forEach(function (d) {
                h.push('<div class="sp-day" data-day="' + d.n + '"><div class="sp-day-head">Day ' + d.n + ' · ');
                if (opts.mode === 'trip' && !d.date) h.push((d.weekday ? esc(d.weekday) + ' ' : '') + '<input type="date" class="sp-date" data-day="' + d.n + '" value="' + esc(st.dates[d.n] || '') + '" aria-label="Date for day ' + d.n + '">');
                else if (d.date) { var dt = new Date(d.date + 'T12:00:00'); h.push(WD[dt.getDay()] + ' ' + (dt.getMonth() + 1) + '/' + dt.getDate() + (d.dateUnsure ? '' : '')); }
                else h.push(esc(d.weekday || 'Today'));
                h.push(' · ' + (d.undecided ? '<i>course not chosen (' + esc((d.options || []).join(' or ')) + ')</i>' : (d.courseName ? '<b>' + esc(d.courseName) + '</b>' + (d.nines ? ' (' + esc(d.nines.join(' / ')) + ')' : '') : '<i>no course</i>')));
                h.push((d.time ? ' · ' + esc(d.time) : '') + '</div>');
                if (d.games.length) h.push('<div class="sp-games">Everyone: ' + d.games.map(function (g) { return esc(gameText(g)); }).join(' · ') + '</div>');
                if (!d.groups.length && st.sameAs[d.n] != null) {
                    var src = plan.flags.filter(function (f) { return f.day === d.n && f.sameAs; })[0];
                    h.push('<label class="sp-same"><input type="checkbox" class="sp-same-box" data-day="' + d.n + '"' + (st.sameAs[d.n] ? ' checked' : '') + '> Use Day ' + src.sameAs + '’s groups</label>');
                }
                d.groups.forEach(function (g, gi) {
                    h.push('<div class="sp-group"><div class="sp-g-head">' + esc(g.label) + (g.time ? ' · ' + esc(g.time) : '') + '</div><div class="sp-players">'
                        + g.players.map(function (p) { return esc(p.name) + (p.hcp !== '' ? ' <span class="sp-hcp">' + esc(p.hcp) + '</span>' : '') + (p.flight ? ' <span class="sp-hcp">' + p.flight + '</span>' : ''); }).join(', ') + '</div>');
                    if (g.teams) h.push('<div class="sp-teams">' + esc(g.teams[0].join(' & ')) + ' <i>vs</i> ' + esc(g.teams[1].join(' & ')) + '</div>');
                    var games = d.games.concat(g.games);
                    if (g.games.length) h.push('<div class="sp-games">' + g.games.map(function (x) { return esc(gameText(x)); }).join(' · ') + '</div>');
                    if (games.some(function (x) { return x.type === 'nassau'; })) {
                        var key = d.n + ':' + gi, sides = nassauSides(g, st.picks[key]);
                        if (!g.teams && g.players.length !== 2) {
                            h.push('<div class="sp-pick"' + (st.skipNassau[key] ? ' style="opacity:.5"' : '') + '><b>Nassau — who plays whom?</b> Tap a golfer: A, then B, then off.<div>'
                                + g.players.map(function (p) { var s = (st.picks[key] || {})[p.name] || ''; return '<button type="button" class="sp-chip sp-chip-' + (s || 'off') + '" data-key="' + key + '" data-name="' + esc(p.name) + '">' + esc(p.name) + (s ? ' · ' + s : '') + '</button>'; }).join('')
                                + '</div><div class="sp-note">' + (sides ? 'Side A: ' + esc(sides.a.join(' & ')) + ' — Side B: ' + esc(sides.b.join(' & ')) : 'Pick both sides, or skip this Nassau.') + '</div>'
                                + '<label class="sp-note"><input type="checkbox" class="sp-skip" data-key="' + key + '"' + (st.skipNassau[key] ? ' checked' : '') + '> Skip this Nassau</label></div>');
                        } else h.push('<div class="sp-note">Nassau: ' + esc(sides.a.join(' & ')) + ' vs ' + esc(sides.b.join(' & ')) + '</div>');
                    }
                    h.push('</div>');
                });
                h.push('</div>');
            });
            var missing = check();
            h.push('<div class="sp-actions"><button type="button" class="btn-outline sp-edit">← Edit text</button> <button type="button" class="btn-primary sp-confirm"' + (missing.length ? ' disabled' : '') + '>Confirm</button></div>');
            if (missing.length) h.push('<div class="sp-note sp-missing">Before Confirm: ' + missing.map(esc).join('; ') + '</div>');
            h.push('</div>');
            el.innerHTML = h.join('');
            wire();
        }
        function check() {
            var m = [];
            plan.days.forEach(function (d) {
                if (opts.mode === 'trip' && !d.date && !st.dates[d.n]) m.push('a date for Day ' + d.n);
                d.groups.forEach(function (g, gi) {
                    var key = d.n + ':' + gi;
                    if (d.games.concat(g.games).some(function (x) { return x.type === 'nassau'; }) && !st.skipNassau[key] && !nassauSides(g, st.picks[key])) m.push('Nassau sides for Day ' + d.n + ' ' + g.label);
                });
            });
            return m;
        }
        function wire() {
            Array.prototype.forEach.call(el.querySelectorAll('.sp-date'), function (i) { i.onchange = function () { st.dates[i.getAttribute('data-day')] = i.value; draw(); }; });
            Array.prototype.forEach.call(el.querySelectorAll('.sp-same-box'), function (i) { i.onchange = function () { st.sameAs[i.getAttribute('data-day')] = i.checked; draw(); }; });
            Array.prototype.forEach.call(el.querySelectorAll('.sp-skip'), function (i) { i.onchange = function () { st.skipNassau[i.getAttribute('data-key')] = i.checked; draw(); }; });
            Array.prototype.forEach.call(el.querySelectorAll('.sp-chip'), function (b) {
                b.onclick = function () {
                    var k = b.getAttribute('data-key'), n = b.getAttribute('data-name');
                    var p = st.picks[k] = st.picks[k] || {};
                    p[n] = !p[n] ? 'A' : p[n] === 'A' ? 'B' : '';
                    draw();
                };
            });
            var ed = el.querySelector('.sp-edit'); if (ed) ed.onclick = function () { if (opts.onEdit) opts.onEdit(); };
            var cf = el.querySelector('.sp-confirm'); if (cf) cf.onclick = function () { if (!check().length && opts.onConfirm) opts.onConfirm(resolve()); };
        }
        // THE RESULT: the plan with the answers applied.
        function resolve() {
            var days = JSON.parse(JSON.stringify(plan.days));
            days.forEach(function (d) {
                if (!d.date && st.dates[d.n]) d.date = st.dates[d.n];
                if (!d.groups.length && st.sameAs[d.n]) {
                    var f = plan.flags.filter(function (x) { return x.day === d.n && x.sameAs; })[0];
                    var src = f && days[f.sameAs - 1];
                    if (src) d.groups = JSON.parse(JSON.stringify(src.groups)).map(function (g) { g.games = []; return g; });
                }
                d.groups.forEach(function (g, gi) {
                    var key = d.n + ':' + gi;
                    var nas = d.games.concat(g.games).filter(function (x) { return x.type === 'nassau'; });
                    if (nas.length) g.nassau = st.skipNassau[key] ? null : nassauSides(g, st.picks[key]);
                });
            });
            return { days: days, players: plan.players };
        }
        draw();
        return { resolve: resolve };
    }

    // ---- WHAT THE EXISTING FLOWS ARE FED ------------------------------------------------
    // The trip's itinerary box: one line per day, in the itinerary parser's own shape.
    function itineraryText(resolved) {
        return resolved.days.filter(function (d) { return d.date; }).map(function (d) {
            var dt = new Date(d.date + 'T12:00:00');
            var course = d.undecided ? (d.options || []).join(' or ') + ' (not chosen)' : (d.courseName || '') + (d.nines ? ', ' + d.nines.join('/') : '');
            return WD[dt.getDay()] + ' ' + (dt.getMonth() + 1) + '/' + dt.getDate() + ' — ' + course + (d.time ? ', ' + time12(d.time) : '');
        }).join('\n');
    }
    function time12(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); if (!m) return t; var h = +m[1]; return ((h + 11) % 12 + 1) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM'); }
    // A day's golfers, in the roster parser's shape: a blank line between groups.
    function rosterText(day) {
        return day.groups.map(function (g) { return g.players.map(function (p) { return (p.flight ? p.flight + ' ' : '') + p.name + (p.hcp !== '' ? ' ' + p.hcp : ''); }).join('\n'); }).join('\n\n');
    }
    // A day as a DRAFT for its Round Setup: golfers in group order, the game card, the
    // Money step (one Nassau, Skins), and the bets that only Side Matches can make.
    function dayDraft(day) {
        var all = day.games.slice();
        day.groups.forEach(function (g) { all = all.concat(g.games); });
        var fmt = all.filter(function (x) { return x.format; })[0] || null;
        var nassaus = [], skins = [];
        day.groups.forEach(function (g) {
            var games = day.games.concat(g.games);
            var n = games.filter(function (x) { return x.type === 'nassau'; })[0];
            if (n && g.nassau) nassaus.push({ group: g.label, a: g.nassau.a, b: g.nassau.b, front: n.front, back: n.back, overall: n.overall, press: n.press });
            g.games.filter(function (x) { return x.type === 'skins'; }).forEach(function (s) { skins.push({ amount: s.amount, carry: s.carry, players: g.players.map(function (p) { return p.name; }) }); });
        });
        day.games.filter(function (x) { return x.type === 'skins'; }).forEach(function (s) { skins.push({ amount: s.amount, carry: s.carry, players: null }); });
        // Round Setup takes ONE Nassau, 1 v 1. A 1v1 goes there; the rest (team vs team,
        // more groups) are Side Matches bets, filled in after Save.
        var setupNassau = nassaus.filter(function (x) { return x.a.length === 1 && x.b.length === 1; })[0] || null;
        var bets = nassaus.filter(function (x) { return x !== setupNassau; });
        return { v: 1, date: day.date || null, time: day.time || null, courseName: day.courseName || null, nines: day.nines || null,
            roster: rosterText(day), groups: day.groups.map(function (g) { return { label: g.label, players: g.players }; }),
            format: fmt ? { type: fmt.type, label: fmt.label, perPoint: fmt.perPoint == null ? null : fmt.perPoint } : null,
            nassau: setupNassau, skins: skins.slice(0, 1), extraSkins: skins.slice(1), bets: bets,
            extras: all.filter(function (x) { return x.type === 'birdie' || x.type === 'dots'; }).map(function (x) { return { type: x.type, amount: x.amount }; }) };
    }

    // ---- THE DRAFTS (on this phone) -------------------------------------------------------
    function savePending(resolved) { lsSet(PENDING, { at: Date.now(), days: resolved.days.map(dayDraft) }); }
    function pending() { var p = lsGet(PENDING); return p && p.days ? p : null; }
    // Build Trip made the round codes: each day's draft goes to its round (same date
    // and tee time; else the same date; else the same position).
    function bindCodes(configs, codes) {
        var p = pending();
        if (!p) return 0;
        var used = {}, n = 0;
        configs.forEach(function (cfg, i) {
            var hit = -1;
            p.days.forEach(function (d, j) { if (hit === -1 && !used[j] && d.date && d.date === cfg.teeDate && (!d.time || !cfg.teeClock || d.time === cfg.teeClock)) hit = j; });
            if (hit === -1) p.days.forEach(function (d, j) { if (hit === -1 && !used[j] && d.date && d.date === cfg.teeDate) hit = j; });
            if (hit === -1 && !used[i] && p.days[i] && !p.days[i].date) hit = i;
            if (hit === -1) return;
            used[hit] = 1; n++;
            lsSet(DRAFT + codes[i], p.days[hit]);
        });
        lsDel(PENDING);
        return n;
    }
    function draftFor(code) { var d = lsGet(DRAFT + code); return d && d.v === 1 ? d : null; }
    function setDraft(code, d) { lsSet(DRAFT + code, d); }
    function dropDraft(code) { lsDel(DRAFT + code); }
    function queueBets(code, bets) { if (bets && bets.length) lsSet(BETS + code, { at: Date.now(), bets: bets }); }
    function betsFor(code) { var b = lsGet(BETS + code); return b && b.bets && b.bets.length ? b.bets : []; }
    function setBets(code, bets) { if (bets.length) lsSet(BETS + code, { at: Date.now(), bets: bets }); else lsDel(BETS + code); }

    W.HardPanSetupPaste = { renderReview: renderReview, itineraryText: itineraryText, rosterText: rosterText, dayDraft: dayDraft, gameText: gameText,
        savePending: savePending, pending: pending, bindCodes: bindCodes, draftFor: draftFor, setDraft: setDraft, dropDraft: dropDraft,
        queueBets: queueBets, betsFor: betsFor, setBets: setBets, nassauSides: nassauSides, time12: time12 };
    if (typeof module !== 'undefined' && module.exports) module.exports = W.HardPanSetupPaste;
})();
