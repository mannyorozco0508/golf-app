// ============================================================================
// HardPan — THE TRIP BUILDER, ON SCREEN (gps-builder, 2026-10-11)
//
// trip.html: paste the whole trip -> ONE review screen (every day, group, match,
// game and $; the Cup; handicaps; questions with the likely answer picked; the
// lines kept as notes) -> every value can be changed in place -> Confirm writes
// the trip and EVERY round with its full setup in ONE update, exactly the way
// Build Trip does (codes from code-issuer.js, organizerGate.ensureOrganizer +
// stamp, db.ref().update). Then it opens the trip as its organizer.
// Each round stays an ordinary round: Round Setup edits it as usual.
// ============================================================================
(function () {
    'use strict';
    var W = window;
    var TB = function () { return W.HardPanTripBuilder; };
    var S = null;   // { plan, answers: { id: v }, hcps: { name: hcp }, known }

    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function key(s) { return String(s || '').trim().toLowerCase(); }
    function $(id) { return document.getElementById(id); }
    var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    function dayText(iso) { if (!iso) return ''; var d = new Date(iso + 'T12:00:00'); return WD[d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate(); }

    function qs() {
        var list = TB().questions(S.plan, typeof nineHoleLoops !== 'undefined' ? nineHoleLoops : {});  /* global nineHoleLoops */
        list.forEach(function (q) { if (S.answers[q.id] != null && q.options.some(function (o) { return o.v === S.answers[q.id]; })) q.answer = S.answers[q.id]; });
        return list;
    }
    function hcpsFor() { return S.answers.hcp === 'later' ? {} : S.hcps; }

    // ---- READ ----------------------------------------------------------------
    function read() {
        var box = $('tb-box'), yearEl = $('tb-year');
        var year = parseInt(yearEl && yearEl.value, 10) || new Date().getFullYear();
        var plan = TB().parseTrip(box ? box.value : '', { year: year, tspGames: W.tspGames, tripItinDate: W.tripItinDate });
        var known = typeof W.itinKnownCourses === 'function' ? W.itinKnownCourses() : {};
        TB().matchCourses(plan, known, W.tripItinMatch);
        plan.days.forEach(function (d) { if (d.courseKey) d.courseName = known[d.courseKey] || d.courseName; });
        S = { plan: plan, answers: {}, hcps: {}, known: known };
        if (!plan.days.length) { $('tb-review').innerHTML = '<p class="sp-info">No "DAY" lines found — each day starts with a line like <b>DAY 1 – Tue Oct 13 – Caledonia, 9:10 &amp; 9:20</b>.</p>'; return; }
        render();
    }

    // ---- THE ONE REVIEW SCREEN --------------------------------------------------
    function golferSelect(path, val) {
        return '<select data-tb="' + path + '">' + S.plan.golfers.map(function (g) { return '<option' + (key(g) === key(val) ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select>';
    }
    function money(path, v) { return '$<input type="number" min="0" step="0.5" inputmode="decimal" data-tb="' + path + '" value="' + esc(v == null ? '' : v) + '" style="width:64px;">'; }
    function gameRow(path, x) {
        var rm = ' <button type="button" class="tb-x" data-tb-act="rmgame" data-tb-path="' + path + '" aria-label="Remove">✕</button>';
        if (x.type === 'nassau') return '<div class="tb-game">Nassau ' + money(path + '.front', x.front) + ' / ' + money(path + '.back', x.back) + ' / ' + money(path + '.overall', x.overall) + rm + '</div>';
        if (x.type === 'vegas') return '<div class="tb-game">Vegas ' + money(path + '.perPoint', x.perPoint) + '/pt <label><input type="checkbox" data-tb="' + path + '.flip"' + (x.flip ? ' checked' : '') + '> birdie flip</label>' + rm + '</div>';
        if (x.type === 'bbb') return '<div class="tb-game">Bingo Bango Bongo ' + money(path + '.perPoint', x.perPoint) + '/pt' + rm + '</div>';
        if (x.type === 'skins') return '<div class="tb-game">Skins ' + money(path + '.amount', x.amount) + (x.everyone ? ' · everyone' : ' · this group') + rm + '</div>';
        if (x.type === 'kp') return '<div class="tb-game">KP ' + money(path + '.amount', x.amount) + ' on the par 3s' + rm + '</div>';
        return '<div class="tb-game">' + esc(x.label) + ' <i>(not set up by the builder)</i>' + rm + '</div>';
    }
    function render() {
        var p = S.plan, list = qs(), out = [];
        var dry = dryRun(list);
        out.push('<div class="sp-review tb-review">');
        out.push('<div class="form-group"><label>Trip name</label><input type="text" data-tb="name" value="' + esc(p.name || '') + '"></div>');
        // QUESTIONS FIRST, each with the likely answer picked.
        if (list.length) {
            out.push('<div class="sp-box sp-ask"><b>Check these (' + list.length + ')</b>' + list.map(function (q) {
                return '<div class="tb-q" style="margin-top:8px;"><div>' + esc(q.text) + '</div>' + q.options.map(function (o) {
                    return '<label style="display:block;margin:2px 0;"><input type="radio" name="tbq-' + esc(q.id) + '" data-tb-q="' + esc(q.id) + '" value="' + esc(o.v) + '"' + (q.answer === o.v ? ' checked' : '') + '> ' + esc(o.label) + '</label>';
                }).join('') + '</div>';
            }).join('') + '</div>');
        }
        // THE CUP
        var tw = p.cup ? TB().effectiveToWin(p, list) : null;
        if (p.cup) {
            out.push('<div class="sp-day"><div class="sp-day-head">🏆 ' + esc(p.name || 'The Cup') + '</div>');
            p.teams.forEach(function (t, ti) {
                out.push('<div style="margin:6px 0;"><input type="text" data-tb="teams.' + ti + '.name" value="' + esc(t.name) + '" style="font-weight:800;max-width:180px;"> captain '
                    + '<select data-tb="teams.' + ti + '.captain"><option value="">—</option>' + t.players.map(function (g) { return '<option' + (key(g) === key(t.captain) ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select>'
                    + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">' + t.players.map(function (g) { return '<button type="button" class="tb-chip" data-tb-act="swapteam" data-tb-path="' + esc(g) + '" title="Move to the other team">' + esc(g) + ' ⇄</button>'; }).join('') + '</div></div>');
            });
            out.push('<div class="sp-info">' + p.cup.pointsPerWin + ' point a match win, ½ a halve · first to <input type="number" step="0.5" min="0" data-tb="cup.toWinManual" value="' + esc(tw == null ? '' : tw) + '" style="width:64px;"> wins'
                + ' · the app’s Cup card counts the points; the target and captains are shown on the trip page.</div></div>');
        }
        // GOLFERS + HANDICAPS
        out.push('<div class="sp-day"><div class="sp-day-head">Golfers' + (S.answers.hcp === 'later' ? '' : ' and handicaps <a class="p-ghin" href="https://www.ghin.com/overview/" target="_blank" rel="noopener" style="font-size:.74rem;font-weight:700;margin-left:6px;">Check my Index \u2197</a>') + '</div><div style="display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;">'
            + p.golfers.map(function (g, gi) {
                return '<input type="text" data-tb-rename="' + gi + '" value="' + esc(g) + '">' + (S.answers.hcp === 'later' ? '<span></span>' : '<input type="text" inputmode="decimal" placeholder="hcp" data-tb-hcp="' + esc(key(g)) + '" value="' + esc(S.hcps[key(g)] || '') + '" style="width:64px;">');
            }).join('') + '</div></div>');
        // EACH DAY
        p.days.forEach(function (d, di) {
            var base = 'days.' + di;
            var opts = '<option value="">' + esc(d.courseName ? '"' + d.courseName + '" — not saved, set it later' : 'Pick a course') + '</option>'
                + Object.keys(S.known).sort(function (a, b) { return S.known[a] < S.known[b] ? -1 : 1; }).map(function (k) { return '<option value="' + esc(k) + '"' + (k === d.courseKey ? ' selected' : '') + '>' + esc(S.known[k]) + '</option>'; }).join('');
            var ft = d.format ? (d.format.type || 'none') : 'none';
            out.push('<div class="sp-day"><div class="sp-day-head">Day ' + d.n + ' · ' + esc(dayText(d.date) || 'no date') + '</div>'
                + '<div class="tb-row"><input type="date" data-tb="' + base + '.date" value="' + esc(d.date || '') + '"> <select data-tb="' + base + '.courseKey" style="max-width:220px;">' + opts + '</select></div>'
                + (p.cup ? '<div class="tb-row">Cup format <select data-tb="' + base + '.formatType">' + [['fourball', 'Four-ball (best ball)'], ['foursomes', 'Foursomes (alternate shot)'], ['singles', 'Singles'], ['none', 'No Cup matches']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === ft ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'
                    + (d.format && d.format.points > 1 ? ' <span class="sp-info">(you wrote ' + d.format.points + ' points' + (d.format.nines ? ', front + back' : '') + ' — counted as 1)</span>' : '') + '</div>' : ''));
            d.groups.forEach(function (g, gi) {
                var gb = base + '.groups.' + gi;
                out.push('<div class="tb-group"><b>Group ' + g.n + '</b> <input type="time" data-tb="' + gb + '.time" value="' + esc(g.time || '') + '">');
                g.matches.forEach(function (m, mi) {
                    var mb = gb + '.matches.' + mi;
                    out.push('<div class="tb-row">' + m.a.map(function (n, i) { return golferSelect(mb + '.a.' + i, n); }).join(' &amp; ') + ' <b>v</b> ' + m.b.map(function (n, i) { return golferSelect(mb + '.b.' + i, n); }).join(' &amp; ') + '</div>');
                });
                out.push(g.games.map(function (x, xi) { return gameRow(gb + '.games.' + xi, x); }).join('') + '</div>');
            });
            if (d.everyone.length) out.push('<div class="tb-group"><b>Everyone</b>' + d.everyone.map(function (x, xi) { return gameRow(base + '.everyone.' + xi, x); }).join('') + '</div>');
            out.push('</div>');
        });
        // NOTES - kept on the trip, never dropped.
        var notes = p.notes.concat([].concat.apply([], p.days.map(function (d) { return d.notes.map(function (t) { return { text: t, day: d.n }; }); })));
        if (notes.length) out.push('<div class="sp-box sp-warn"><b>Kept as trip notes</b><ul>' + notes.map(function (n) { return '<li>' + (n.day ? 'Day ' + n.day + ': ' : '') + esc(n.text) + '</li>'; }).join('') + '</ul></div>');
        if (dry.problems.length) out.push('<div class="sp-box sp-skip"><b>Fix before Confirm</b><ul>' + dry.problems.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>');
        out.push('<button type="button" class="btn-primary" id="tb-confirm"' + (dry.blocking ? ' disabled' : '') + '>Confirm — create the trip and ' + p.days.length + ' round' + (p.days.length === 1 ? '' : 's') + '</button>'
            + ' <span id="tb-status" role="status" class="sp-info"></span>');
        out.push('</div>');
        $('tb-review').innerHTML = out.join('');
    }

    // The writes, with stand-in codes: the problems the real Confirm would hit.
    function dryRun(list) {
        var n = 0;
        try {
            var r = TB().build(S.plan, list, ctxFor('DRYRUN', S.plan.days.map(function (_, i) { return 'DRY' + i; }), 'uid', {}, function () { return 'k' + (++n); }));
            var cupProblems = r.problems.filter(function (x) { return /^Cup:/.test(x); });
            return { problems: r.problems, blocking: cupProblems.length > 0 || !S.plan.days.length };
        } catch (e) { return { problems: ['Could not build: ' + e.message], blocking: true }; }
    }
    function ctxFor(tripCode, roundCodes, uid, courses, pushKey) {
        return {
            tripCode: tripCode, roundCodes: roundCodes, uid: uid, now: Date.now(),
            tokens: { trip: tok(), rounds: roundCodes.map(tok) },
            courseFor: function (d) { return courses['d' + d.n] || (d.courseKey ? { courseKey: d.courseKey, courseName: S.known[d.courseKey] } : {}); },
            pushKey: pushKey, hcps: hcpsFor(),
            sideMatchPayloadFromTerms: W.sideMatchPayloadFromTerms, buildRyderCupConfig: W.buildRyderCupConfig,
            validateRyderCupSave: W.validateRyderCupSave, validateMoneyPool: W.validateMoneyPool
        };
    }
    function tok() { return typeof W.makeOrganizerToken === 'function' ? W.makeOrganizerToken() : 'tb' + Math.random().toString(36).slice(2); }

    // ---- EDITS ----------------------------------------------------------------
    function setPath(path, val) {
        var parts = path.split('.'), o = S.plan;
        if (parts[0] === 'days' && parts[2] === 'formatType') {
            var d = S.plan.days[+parts[1]];
            d.format = val === 'none' ? { type: null, label: 'No Cup matches', raw: 'No Cup matches', points: null, nines: false }
                : Object.assign({}, d.format || {}, { type: val, raw: (d.format && d.format.raw) || val, points: d.format && d.format.points });
            if (val === 'none') S.answers['fmt-' + d.n] = 'none';
            return;
        }
        if (parts[0] === 'days' && parts[2] === 'courseKey') { var dd = S.plan.days[+parts[1]]; dd.courseKey = val || null; if (val) dd.courseName = S.known[val]; return; }
        if (parts[0] === 'cup') { S.plan.cup[parts[1]] = val === '' ? null : Number(val); return; }
        for (var i = 0; i < parts.length - 1; i++) o = o[isNaN(parts[i]) ? parts[i] : +parts[i]];
        var last = parts[parts.length - 1];
        o[isNaN(last) ? last : +last] = val;
    }
    function rename(i, to) {
        var from = S.plan.golfers[i]; to = String(to || '').trim();
        if (!to || key(to) === key(from)) return;
        var swap = function (n) { return key(n) === key(from) ? to : n; };
        S.plan.golfers[i] = to;
        S.plan.teams.forEach(function (t) { t.players = t.players.map(swap); if (key(t.captain) === key(from)) t.captain = to; });
        S.plan.days.forEach(function (d) { d.groups.forEach(function (g) { g.matches.forEach(function (m) { m.a = m.a.map(swap); m.b = m.b.map(swap); }); }); });
        if (S.hcps[key(from)] != null) { S.hcps[key(to)] = S.hcps[key(from)]; delete S.hcps[key(from)]; }
    }
    function onChange(ev) {
        var el = ev.target;
        if (!S || !el) return;
        if (el.hasAttribute('data-tb-q')) { S.answers[el.getAttribute('data-tb-q')] = el.value; render(); return; }
        if (el.hasAttribute('data-tb-hcp')) { S.hcps[el.getAttribute('data-tb-hcp')] = el.value.trim(); return; }
        if (el.hasAttribute('data-tb-rename')) { rename(+el.getAttribute('data-tb-rename'), el.value); render(); return; }
        var path = el.getAttribute('data-tb');
        if (!path) return;
        var v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
        setPath(path, v);
        render();
    }
    function onClick(ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-tb-act], #tb-confirm') : null;
        if (!b || !S) return;
        if (b.id === 'tb-confirm') { confirm(b); return; }
        var act = b.getAttribute('data-tb-act'), path = b.getAttribute('data-tb-path');
        if (act === 'rmgame') {
            var parts = path.split('.'), idx = +parts.pop(), o = S.plan;
            parts.forEach(function (x) { o = o[isNaN(x) ? x : +x]; });
            o.splice(idx, 1);
        } else if (act === 'swapteam') {
            var from = S.plan.teams.filter(function (t) { return t.players.some(function (n) { return key(n) === key(path); }); })[0];
            var to = S.plan.teams.filter(function (t) { return t !== from; })[0];
            if (from && to) { from.players = from.players.filter(function (n) { return key(n) !== key(path); }); to.players.push(path); if (key(from.captain) === key(path)) from.captain = null; }
        }
        render();
    }

    // ---- CONFIRM: one update, the Build Trip way ----------------------------------
    function confirm(btn) {
        var status = $('tb-status');
        var say = function (t) { if (status) status.textContent = t; };
        // The trip page's own globals (top-level const/let: not window properties).
        /* global db, tripCourses, tripCourseIndex */
        var DB = typeof db !== 'undefined' ? db : null;
        if (typeof W.issueUniqueCode !== 'function' || !W.organizerGate || !DB) { say('This page cannot create trips right now.'); return; }
        btn.disabled = true; say('⏳ Creating…');
        var list = qs();
        var used = new Set();
        var tripCode, roundCodes = [], courses = {};
        var wanted = S.plan.days.map(function (d) { return d.courseKey; }).filter(function (k, i, a) { return k && a.indexOf(k) === i; });
        var idx = typeof tripCourseIndex !== 'undefined' ? tripCourseIndex : null;
        var readCourse = function (id) { return idx && typeof idx.readOne === 'function' ? idx.readOne(id).catch(function () { return null; }) : Promise.resolve(null); };
        Promise.all(wanted.map(readCourse)).then(function (recs) {
            var all = Object.assign({}, typeof tripCourses !== 'undefined' ? tripCourses : {});
            wanted.forEach(function (id, i) { if (recs[i] && recs[i].name) all[id] = recs[i]; });
            // Per DAY: the same 27-hole course can be played on two different pairs of nines.
            S.plan.days.forEach(function (d) {
                if (!d.courseKey) return;
                var n = (list.filter(function (q) { return q.id === 'nines-' + d.n; })[0] || {}).answer;
                var cfg = { courseId: d.courseKey };
                if (n) { cfg.frontNineKey = n.split('|')[0]; cfg.backNineKey = n.split('|')[1]; }
                var r = typeof W.resolveCourseDataAndName === 'function' ? W.resolveCourseDataAndName(cfg, all) : null;
                courses['d' + d.n] = { courseKey: d.courseKey, courseName: r && r.courseName || S.known[d.courseKey], courseData: r && r.courseData || null };
            });
            return W.issueUniqueCode({ db: DB, root: 'trips', reserved: used });
        }).then(function (t) {
            tripCode = t;
            var chain = Promise.resolve();
            S.plan.days.forEach(function () { chain = chain.then(function () { return W.issueUniqueCode({ db: DB, root: 'events', reserved: used }).then(function (c) { roundCodes.push(c); }); }); });
            return chain;
        }).then(function () {
            return W.organizerGate.ensureOrganizer(DB);
        }).then(function (uid) {
            // Ids made here, like Round Setup's own ('sk' + time + random): unique in the
            // batch by construction, whatever push() would have returned.
            var seq = 0, stamp36 = Date.now().toString(36);
            var ctx = ctxFor(tripCode, roundCodes, uid, courses, function () { seq++; return 'tb' + stamp36 + (seq < 10 ? '0' : '') + seq + Math.random().toString(36).slice(2, 6); });
            var out = TB().build(S.plan, list, ctx);
            var cupBad = out.problems.filter(function (x) { return /^Cup:/.test(x); });
            if (cupBad.length) throw new Error(cupBad.join('; '));
            Object.keys(out.updates).forEach(function (k) { if (/^events\/[^/]+$/.test(k)) W.organizerGate.stamp(out.updates[k], uid); });
            S.tripToken = out.updates['trips/' + tripCode + '/organizerToken'];
            return DB.ref().update(out.updates);
        }).then(function () {
            say('✓ Created');
            W.location.href = 'trip.html?trip=' + tripCode + '&organizer=' + S.tripToken;
        }).catch(function (err) {
            btn.disabled = false;
            say('');
            var msg = err && err.code === 'timeout' ? 'The trip could not be set up just now. Nothing was saved. Try again.' : 'Nothing was saved: ' + (err && err.message || err);
            if (typeof W.uiFail === 'function') W.uiFail('⚠️ TRIP NOT CREATED\n' + msg); else say(msg);
        });
    }

    // ---- THE TRIP PAGE: the Cup's own rules, captains and the notes ---------------
    function tripCardHtml(trip) {
        var b = trip && trip.builder;
        if (!b) return '';
        var h = '';
        if (b.cup) {
            var c = b.cup;
            h += '<div><b>🏆 ' + esc(c.name || 'The Cup') + '</b></div><div>' + (c.teams || []).map(function (t) { return esc(t.name) + (t.captain ? ' (captain ' + esc(t.captain) + ')' : '') + ': ' + esc((t.players || []).join(', ')); }).join('<br>') + '</div>'
                + '<div class="sp-info">' + (c.pointsPerWin || 1) + ' point a match win, ½ a halve' + (c.toWin != null ? ' · first to ' + TB().fmtPts(c.toWin) + ' wins the Cup' : '') + '</div>'
                + (c.days || []).filter(function (d) { return d.points > 1 || d.nines; }).map(function (d) { return '<div class="sp-info">Day ' + d.day + ': ' + esc(d.format) + ' — the Cup card counts 1 a match; add the rest by hand.</div>'; }).join('');
        }
        if ((b.notes || []).length) h += '<div style="margin-top:6px;"><b>Notes</b><ul style="margin:2px 0 0 18px;padding:0;">' + b.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>';
        return h ? '<div class="settle-card" id="tb-trip-card" style="margin-bottom:12px;font-size:.86rem;">' + h + '</div>' : '';
    }

    function mount() {
        var r = $('tb-review');
        if (r && !r.__tb) { r.__tb = true; r.addEventListener('change', onChange); r.addEventListener('click', onClick); }
    }
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
    }
    W.HardPanTripBuilderUI = { read: read, render: render, tripCardHtml: tripCardHtml, _state: function () { return S; }, _setPath: setPath, _rename: rename };
})();
