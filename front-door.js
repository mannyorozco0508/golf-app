// ============================================================================
// HardPan — TWO FRONT DOORS (gps-doors, 2026-10-12). Manny's approved mockups
// (~/Desktop/hardpan-mockups): Main, GPS-1..4, Games-1..3.
//
// home.html     Main (two cards), GPS-1 (pick a course), Games-1 (games home).
//               The pick is kept on this phone (hardpan_front_door); the next
//               open goes straight there; the GPS | Games switch flips it.
// admin.html    in the app, Home (the lobby with no round) opens home.html.
//               ?start=quick  the lobby's own new-round path (createRoom)
//               ?account=1    the lobby with the account panel open
//               a GPS course pick: Round Setup in quick mode, saved by its own
//               Save with you as the golfer, opened on the GPS side (GPS-2)
//               ?tpl=nassau|skins|vegas|bbb  a Quick start on this round (GPS-4)
//               ?paste=1      Paste the whole round on this round (GPS-4)
//               ?step=players the Players step of this round (GPS-3)
// index.html    the scorecard: a green GPS button in the header (Games-3); a GPS
//               round with no money gets "+ Add a player" / "Playing for
//               something? + Add a game" / "Save · back to map" (GPS-3).
// trip.html     #build opens "Build the whole trip from one paste".
//
// A FRONT-DOOR CHANGE ONLY: every button routes to a screen that already exists.
// It runs in the app (Capacitor) - the HardPan web pages are unchanged - or with
// window.__hardpanDoors = true (tools/front-door-check.js). Nothing is written to
// Firebase here; a GPS round is saved by Round Setup's own Save.
// ============================================================================
(function () {
    'use strict';
    var W = window;
    var KEY = 'hardpan_front_door', RECENT = 'hardpan_gps_recent_courses', QUICK = 'hardpan_quick_gps', GO = 'hardpan_quick_gps_go', LOC = 'hardpan_courseloc_v1_';
    function ls(k, v) { try { if (v === undefined) return W.localStorage.getItem(k); if (v === null) W.localStorage.removeItem(k); else W.localStorage.setItem(k, v); } catch (e) { return null; } return null; }
    function ss(k, v) { try { if (v === undefined) return W.sessionStorage.getItem(k); if (v === null) W.sessionStorage.removeItem(k); else W.sessionStorage.setItem(k, v); } catch (e) { return null; } return null; }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function $(id) { return W.document.getElementById(id); }
    function native() { try { return !!(W.Capacitor && typeof W.Capacitor.isNativePlatform === 'function' && W.Capacitor.isNativePlatform()); } catch (e) { return false; } }
    function on() { return W.__hardpanDoors === true || native(); }
    function door() { var d = ls(KEY); return d === 'gps' || d === 'games' ? d : null; }
    function setDoor(d) { ls(KEY, d); }
    function params() { try { return new URLSearchParams(W.location.search); } catch (e) { return { get: function () { return null; } }; } }
    function recents() { try { var r = JSON.parse(ls(RECENT) || '[]'); return Array.isArray(r) ? r.filter(function (x) { return x && x.key && x.name; }) : []; } catch (e) { return []; } }
    function addRecent(key, name) {
        if (!key || !name) return;
        var r = recents().filter(function (x) { return x.key !== key; });
        r.unshift({ key: key, name: name, at: Date.now() });
        ls(RECENT, JSON.stringify(r.slice(0, 6)));
    }
    function loadScript(src, done) {
        var s = W.document.createElement('script'); s.src = src; s.onload = function () { done(true); }; s.onerror = function () { done(false); };
        W.document.head.appendChild(s);
    }
    function miles(a, b) {
        var R = 3958.8, toR = Math.PI / 180, dLat = (b[0] - a[0]) * toR, dLon = (b[1] - a[1]) * toR;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    // The phone's position, asked only on the GPS door's course list.
    function position(done) {
        var Cap = W.Capacitor, G = Cap && Cap.Plugins && Cap.Plugins.Geolocation;
        try {
            if (native() && G && typeof G.getCurrentPosition === 'function') {
                G.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 }).then(function (p) { done([p.coords.latitude, p.coords.longitude]); }, function () { done(null); });
                return;
            }
            if (W.navigator.geolocation) { W.navigator.geolocation.getCurrentPosition(function (p) { done([p.coords.latitude, p.coords.longitude]); }, function () { done(null); }, { timeout: 10000, maximumAge: 300000 }); return; }
        } catch (e) {}
        done(null);
    }

    // ---- THE COURSES (GPS-1) -----------------------------------------------------
    // The app's own course list (course-data.js), GPS READY when its holes are
    // bundled (gps-courses.js), and every OpenStreetMap course in the coverage
    // lists (city, state, a point) as SET UP · 1 TAP.
    var STATES = ['AZ', 'WA', 'OR', 'CT', 'FL'];
    var C = { list: null, here: null, asked: false };
    function bundled() { return W.HardPanGpsCourses || null; }
    function bundledPoint(key) {
        var b = bundled(), r = b && b[key];
        var h = r && r.holes && (r.holes['1'] || r.holes[Object.keys(r.holes)[0]]);
        var o = h && (h.osm || h);
        return o && o.tee ? o.tee : (o && o.mid ? o.mid : null);
    }
    function ready(key) { var b = bundled(); return !!(b && b[key] && b[key].holes && Object.keys(b[key].holes).length); }
    function stateOf(name) { var m = /\(([A-Z]{2})\b/.exec(name || ''); return m ? m[1] : ''; }
    function allCourses() {
        if (C.list) return C.list;
        var out = [], seen = {};
        var dir = typeof courseDirectory !== 'undefined' ? courseDirectory : [];   /* global courseDirectory */
        dir.forEach(function (g) {
            (g.items || []).forEach(function (i) {
                if (!i || !i.id || seen[i.id]) return;
                seen[i.id] = 1;
                out.push({ key: i.id, name: i.name, ready: ready(i.id), pt: bundledPoint(i.id), state: stateOf(i.name), city: '' });
            });
        });
        var cov = W.HardPanGpsCoverage || {};
        Object.keys(cov).forEach(function (st) {
            ((cov[st] && cov[st].rows) || []).forEach(function (r) {
                // [osm id, name, city, greens, lines, holes, bundle-ready, lat, lon]
                var nm = String(r[1] || '');
                if (!nm || out.some(function (c) { return c.name.toLowerCase().indexOf(nm.toLowerCase()) === 0; })) return;
                out.push({ key: null, osm: r[0], name: nm, city: r[2] || '', state: st, ready: false, pt: r[7] != null ? [r[7], r[8]] : null });
            });
        });
        C.list = out;
        return out;
    }
    function where(c, dist) {
        var bits = [];
        var place = c.city || c.state ? [c.city, c.state].filter(Boolean).join(', ') : '';
        if (c.key) { try { var L = JSON.parse(ls(LOC + c.key) || 'null'); if (L && (L.city || L.state)) place = [L.city, L.state].filter(Boolean).join(', '); } catch (e) {} }
        if (place) bits.push(place);
        if (dist != null) bits.push((dist < 10 ? dist.toFixed(1) : Math.round(dist)) + ' mi');
        return bits.join(' · ');
    }
    function rowHtml(c, dist) {
        return '<button type="button" class="hp-row" data-hp-course="' + esc(c.key || '') + '" data-hp-name="' + esc(c.name) + '">'
            + '<span><span class="n">' + esc(c.name) + '</span><span class="s" style="display:block;">' + esc(where(c, dist)) + '</span></span>'
            + (c.ready ? '<span class="hp-badge">GPS READY</span>' : '<span class="hp-badge setup">SET UP · 1 TAP</span>') + '</button>';
    }
    // The city/state line for an app course, read once and kept (the setup list's own cache).
    function fillPlaces(db, root) {
        Array.prototype.forEach.call(root.querySelectorAll('[data-hp-course]'), function (b) {
            var key = b.getAttribute('data-hp-course');
            if (!key || ls(LOC + key) || !db) return;
            try {
                db.ref('global_courses/' + key + '/location').once('value').then(function (s) {
                    var L = s && s.val ? s.val() : null;
                    ls(LOC + key, JSON.stringify(L ? { city: L.city || '', state: L.state || '' } : { none: 1 }));
                    if (L && (L.city || L.state)) {
                        var sub = b.querySelector('.s'), t = [L.city, L.state].filter(Boolean).join(', ');
                        if (sub && sub.textContent.indexOf(t) === -1) sub.textContent = t + (/ mi$/.test(sub.textContent) ? ' · ' + sub.textContent.split(' · ').pop() : '');
                    }
                }, function () {});
            } catch (e) {}
        });
    }

    // ---- HOME (home.html) ----------------------------------------------------------
    var H = { db: null };
    function show(view) {
        ['main', 'gps', 'games'].forEach(function (v) { var el = $('v-' + v); if (el) el.classList.toggle('on', v === view); });
        if (view === 'gps') gpsView();
        if (view === 'games') gamesView();
        try { W.scrollTo(0, 0); } catch (e) {}
    }
    function gpsView() {
        var draw = function () {
            var rec = recents(), all = allCourses();
            $('hp-recent').style.display = rec.length ? '' : 'none';
            $('hp-recent-list').innerHTML = rec.map(function (r) {
                var c = all.filter(function (x) { return x.key === r.key; })[0] || { key: r.key, name: r.name, ready: ready(r.key), state: stateOf(r.name) };
                return rowHtml(c, C.here && c.pt ? miles(C.here, c.pt) : null);
            }).join('');
            fillPlaces(H.db, $('hp-recent-list'));
            search();
        };
        var nearDraw = function () {
            var box = $('hp-near-list');
            if (!C.here) { box.innerHTML = '<div class="hp-status">Turn on location for this app to see courses near you. Search works without it.</div>'; return; }
            var list = allCourses().filter(function (c) { return c.pt; }).map(function (c) { return { c: c, d: miles(C.here, c.pt) }; })
                .filter(function (x) { return x.d <= 60; }).sort(function (a, b) { return (b.c.ready - a.c.ready) || (a.d - b.d); }).slice(0, 5);
            box.innerHTML = list.length ? list.map(function (x) { return rowHtml(x.c, x.d); }).join('') : '<div class="hp-status">No courses we know of within 60 miles — search above.</div>';
            fillPlaces(H.db, box);
        };
        var near = function () {
            if (C.asked) { nearDraw(); return; }
            C.asked = true;
            position(function (p) { C.here = p; nearDraw(); draw(); });
        };
        var needs = [];
        if (!W.HardPanGpsCourses) needs.push('gps-courses.js');
        STATES.forEach(function (s) { if (!(W.HardPanGpsCoverage && W.HardPanGpsCoverage[s])) needs.push('gps-coverage-' + s.toLowerCase() + '.js'); });
        var left = needs.length;
        draw();
        if (!left) { near(); return; }
        needs.forEach(function (src) { loadScript(src, function () { if (--left === 0) { C.list = null; draw(); near(); } }); });
    }
    function search() {
        var inp = $('hp-q'), box = $('hp-results');
        if (!inp || !box) return;
        var raw = inp.value.trim(), q = raw.toLowerCase();
        if (q.length < 2) { box.style.display = 'none'; return; }
        var hits = allCourses().filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1 || (c.city || '').toLowerCase().indexOf(q) !== -1; })
            .sort(function (a, b) { return (b.ready - a.ready) || (a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q)); }).slice(0, 12);
        box.style.display = '';
        $('hp-results-list').innerHTML = hits.map(function (c) { return rowHtml(c, C.here && c.pt ? miles(C.here, c.pt) : null); }).join('')
            + '<button type="button" class="hp-row" data-hp-course="" data-hp-name="' + esc(raw) + '"><span><span class="n">Search online for “' + esc(raw) + '”</span><span class="s" style="display:block;">Every US course with a scorecard</span></span><span class="hp-badge setup">SET UP · 1 TAP</span></button>';
        fillPlaces(H.db, $('hp-results-list'));
    }
    // A course: a GPS READY one starts the round at once; any other opens Round
    // Setup's course search with the name typed, for the one tap that sets it up.
    function pickCourse(key, name) {
        ss(QUICK, JSON.stringify({ key: key || null, name: name, auto: !!(key && ready(key)) }));
        W.location.href = 'admin.html?start=quick';
    }
    function gamesView() {
        var last = ls('lastRoomCode'), trip = ls('lastTripCode');
        var today = $('hp-today'), card = $('hp-today-card');
        if (last && H.db) {
            today.style.display = '';
            card.innerHTML = '<div class="hp-status">Loading your last round…</div>';
            H.db.ref('events/' + last).once('value').then(function (s) {
                var d = s && s.val ? s.val() : null;
                if (!d) { today.style.display = 'none'; return; }
                var ps = d.players || [], sc = d.scores || {}, thru = 0;
                (d.courseData || []).forEach(function (h) { if (ps.some(function (p) { return sc['p' + p.id + '_h' + h.hole]; })) thru = Math.max(thru, Number(h.hole)); });
                var games = [];
                if (d.gameFormat && d.gameFormat !== 'stroke') games.push(d.gameFormat.replace(/^\w/, function (x) { return x.toUpperCase(); }));
                var sm = d.sideMatches || {}; if (Object.keys(sm).some(function (k) { return sm[k] && sm[k].format === 'nassau'; })) games.push('Nassau');
                var inst = d.additionalGameInstances || {}; Object.keys(inst).forEach(function (k) { var f = inst[k] && inst[k].format; var L = { skins: 'Skins', dots: 'Dots', vegas: 'Vegas', bbb: 'BBB' }[f]; if (L && games.indexOf(L) === -1) games.push(L); });
                if (d.moneyPool && d.moneyPool.enabled) games.push('Weekly Game');
                $('hp-today-h').textContent = 'YOUR ROUND';
                card.innerHTML = '<button type="button" class="hp-row" data-hp-open="' + esc(last) + '" style="flex-direction:column;align-items:stretch;gap:8px;">'
                    + '<span style="display:flex;justify-content:space-between;align-items:center;"><span class="n" style="font-weight:800;">' + esc(String(d.courseName || 'Round').split(' (')[0]) + '</span><span class="hp-badge navy">' + (thru ? 'THRU ' + thru : 'NOT STARTED') + '</span></span>'
                    + '<span class="s">' + ps.length + ' golfer' + (ps.length === 1 ? '' : 's') + (games.length ? ' · ' + esc(games.join(', ')) : '') + '</span>'
                    + '<span style="font-size:15px;font-weight:700;color:var(--hp-navy);">Open the round ›</span></button>';
            }, function () { today.style.display = 'none'; });
        } else today.style.display = 'none';
        var tc = $('hp-trip-card');
        tc.innerHTML = '';
        if (trip && H.db) {
            H.db.ref('trips/' + trip).once('value').then(function (s) {
                var t = s && s.val ? s.val() : null;
                if (!t) return;
                var rows = Object.keys(t.rounds || {}).map(function (k) { return t.rounds[k]; });
                var dates = rows.map(function (r) { return r.date; }).filter(Boolean).sort();
                var wd = function (iso) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso + 'T12:00:00').getDay()]; };
                var span = dates.length ? ' · ' + wd(dates[0]) + (dates.length > 1 ? '–' + wd(dates[dates.length - 1]) : '') : '';
                tc.innerHTML = '<button type="button" class="hp-row" data-hp-trip="' + esc(trip) + '"><span><span class="n" style="font-size:16px;font-weight:800;">' + esc(t.name || 'Trip') + '</span><span class="s" style="display:block;">' + rows.length + ' round' + (rows.length === 1 ? '' : 's') + span + '</span></span><span style="font-size:20px;">›</span></button>';
            }, function () {});
        }
    }
    function homeClick(ev) {
        var t = ev.target && ev.target.closest ? ev.target : null;
        if (!t) return;
        var b;
        if ((b = t.closest('[data-hp-door]'))) { var d = b.getAttribute('data-hp-door'); setDoor(d); show(d); return; }
        if ((b = t.closest('[data-hp-course]'))) { pickCourse(b.getAttribute('data-hp-course'), b.getAttribute('data-hp-name')); return; }
        if ((b = t.closest('[data-hp-open]'))) { W.location.href = 'index.html?game=' + encodeURIComponent(b.getAttribute('data-hp-open')); return; }
        if ((b = t.closest('[data-hp-trip]'))) { W.location.href = 'trip.html?trip=' + encodeURIComponent(b.getAttribute('data-hp-trip')); return; }
        if ((b = t.closest('[data-hp-act]'))) {
            var a = b.getAttribute('data-hp-act');
            if (a === 'code') { setDoor('games'); show('games'); var i = $('hp-code'); if (i) i.focus(); }
            else if (a === 'signin') W.location.href = 'admin.html?account=1';
            else if (a === 'start') { ss(QUICK, null); W.location.href = 'admin.html?start=quick'; }
            else if (a === 'build') W.location.href = 'trip.html#build';
            else if (a === 'join') join();
        }
    }
    function join() {
        var i = $('hp-code'), msg = $('hp-code-msg');
        var code = String((i && i.value) || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length < 4) { if (msg) { msg.className = 'hp-status hp-err'; msg.textContent = 'Type the game code (letters and numbers).'; } return; }
        if (!H.db) { W.location.href = 'index.html?game=' + code; return; }
        if (msg) { msg.className = 'hp-status'; msg.textContent = 'Checking ' + code + '…'; }
        H.db.ref('events/' + code + '/players').once('value').then(function (s) {
            if (s && s.exists && s.exists()) W.location.href = 'index.html?game=' + code;
            else if (msg) { msg.className = 'hp-status hp-err'; msg.textContent = 'No round with the code ' + code + '. Check it with whoever set it up.'; }
        }, function () { W.location.href = 'index.html?game=' + code; });
    }
    function homeStart(db) {
        H.db = db;
        W.document.addEventListener('click', homeClick);
        var q = $('hp-q');
        if (q) q.addEventListener('input', search);
        var code = $('hp-code');
        if (code) code.addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
        var h = (W.location.hash || '').replace('#', '');
        show(h === 'gps' || h === 'games' || h === 'main' ? h : (door() || 'main'));
    }

    // ---- ROUND SETUP (admin.html) ----------------------------------------------------
    function admin() {
        var p = params();
        if (!$('lobby-screen')) return;
        // Home in the app is home.html; the lobby stays for its own jobs.
        if (on() && !p.get('game') && !p.get('start') && !p.get('account') && !p.get('trip') && !p.get('season') && !p.get('copyFrom') && !p.get('coach') && !p.get('eventType')) {
            W.location.replace('home.html');
            return;
        }
        if (p.get('account') && typeof W.openAccountPanel === 'function') { setTimeout(function () { try { W.openAccountPanel(); } catch (e) {} }, 300); return; }
        if (p.get('start') === 'quick' && !p.get('game')) { if (typeof W.selectHomeWidget === 'function') W.selectHomeWidget('quick'); return; }
        if (p.get('game')) {
            if (ss(QUICK)) { quickGps(); return; }
            var tpl = p.get('tpl'), paste = p.get('paste'), step = p.get('step');
            if (tpl || paste || step) whenLoaded(function () {
                try {
                    if (paste && typeof W.spRoundOpen === 'function') { W.goToWizardStep(5); W.spRoundOpen(); return; }
                    if (step === 'players') { W.goToWizardStep(5); return; }
                    if (tpl && typeof W.gpsApplyTemplate === 'function') {
                        W.gpsApplyTemplate(tpl);
                        // Money, where the template fills in (its golfers are the round's).
                        W.goToWizardStep(typeof WIZARD_STEP_OF !== 'undefined' ? WIZARD_STEP_OF.action : 6);   /* global WIZARD_STEP_OF */
                    }
                } catch (e) { try { console.error('[front door] round setup', e); } catch (x) {} }
            });
        }
    }
    // After the round has loaded into Round Setup (its rows exist).
    function whenLoaded(fn) {
        var n = 0;
        var t = setInterval(function () {
            n++;
            var a = $('admin-screen');
            // An existing round lands on Review by itself; act after that, not before.
            var landed = typeof currentWizardStep !== 'undefined' && typeof WIZARD_STEP_OF !== 'undefined' && currentWizardStep === WIZARD_STEP_OF.review;   /* global currentWizardStep */
            var ok = a && a.style.display !== 'none' && W.document.querySelectorAll('#player-list .player-row').length && landed;
            if (ok || n > 60) { clearInterval(t); setTimeout(fn, 300); }
        }, 150);
    }
    // QUICK GPS: Round Setup on its fresh code, the course from GPS-1 put in, you as
    // the golfer, and its own Save. A GPS READY course goes on its own; any other
    // waits on the course step with the name typed into the search.
    function quickGps() {
        var q = null;
        try { q = JSON.parse(ss(QUICK) || 'null'); } catch (e) { q = null; }
        if (!q || typeof q !== 'object') q = { auto: false };
        var host = $('admin-screen');
        if (!host || $('fd-quick')) return;
        var box = W.document.createElement('div');
        box.id = 'fd-quick';
        box.style.cssText = 'margin:0 0 12px; padding:12px; border:2px solid #0f4c3a; border-radius:14px; background:var(--bg-card);';
        box.innerHTML = '<div style="font-weight:800;font-size:1.05rem;color:#0f4c3a;">📍 GPS round</div>'
            + '<div class="fd-msg" role="status" style="font-size:.86rem;margin:6px 0;">' + (q.auto ? '⏳ Setting up ' + esc(q.name) + '…' : 'Pick the course below (search), then:') + '</div>'
            + '<button type="button" class="btn-primary fd-start" style="width:100%;min-height:52px;font-size:1.05rem;font-weight:800;background:#0f4c3a;border-color:#0f4c3a;">📍 Start GPS on hole 1</button>'
            + '<div style="font-size:.76rem;opacity:.75;margin-top:6px;">Bets and games: ➕ Add a game, any time in the round.</div>';
        var prog = $('wizard-progress');
        if (prog && prog.parentNode) prog.parentNode.insertBefore(box, prog); else host.insertBefore(box, host.firstChild);
        box.addEventListener('click', function (ev) { if (ev.target.closest('.fd-start')) start(box); });
        try { if (typeof W.goToWizardStep === 'function') W.goToWizardStep(1); } catch (e) {}
        var say = function (m) { var el = box.querySelector('.fd-msg'); if (el) el.textContent = m; };
        if (q.key && typeof W.selectCourse === 'function') {
            W.selectCourse(q.key, q.name);
            if (q.auto) setTimeout(function () { start(box); }, 1200);
        } else if (q.name) {
            var inp = $('course-search-input');
            if (inp) { inp.value = q.name; inp.dispatchEvent(new Event('input', { bubbles: true })); }
            say('Pick "' + q.name + '" from the list below (search online if it isn’t there), then Start.');
        }
    }
    function start(box) {
        var say = function (m) { var el = box.querySelector('.fd-msg'); if (el) el.textContent = m; };
        try {
            var key = ($('course-select') || {}).value || '';
            var name = (($('course-search-input') || {}).value || '').trim();
            if (!name) { say('Pick a course first.'); return; }
            var rows = W.document.querySelectorAll('#player-list .p-name-input');
            var named = Array.prototype.some.call(rows, function (i) { return String(i.value || '').trim(); });
            if (!named) {
                if (!rows.length && typeof W.addNewPlayerAndRefresh === 'function') W.addNewPlayerAndRefresh();
                var first = W.document.querySelector('#player-list .p-name-input');
                var me = (W.authBootState && (W.authBootState.displayName || W.authBootState.name)) || 'Me';
                if (first) first.value = String(me).split(' ')[0] || 'Me';
            }
            addRecent(key, name);
            ls('hardpan_round_side', 'gps');
            ss(GO, '1');
            say('⏳ Starting…');
            if (typeof W.saveSettings !== 'function') throw new Error('Round Setup is not ready');
            // saveSettings returns before its write lands; Round Ready (afterSave) is the
            // finish line. If Save refused (a message on the page), Start can be tapped again.
            var pr = W.saveSettings();
            if (pr && typeof pr.catch === 'function') pr.catch(function (e) { ss(GO, null); say('Could not start: ' + (e && e.message || e)); });
            setTimeout(function () { if (ss(GO) && /admin\.html/.test(String(W.location.pathname))) say('Still saving... if nothing happens, read the message on this page and tap Start again.'); }, 12000);
        } catch (e) { ss(GO, null); say('⚠️ Could not start: ' + (e && e.message || e)); try { console.error('[front door] start', e); } catch (x) {} }
    }
    // Round Setup's Round Ready screen calls this first: a quick GPS start skips it.
    function afterSave(code) {
        if (!ss(GO)) return false;
        ss(GO, null); ss(QUICK, null);
        ls('hardpan_round_side', 'gps|' + code);
        W.location.href = 'index.html?game=' + encodeURIComponent(code);
        return true;
    }

    // ---- THE SCORECARD (index.html) ---------------------------------------------------
    function scorecard() {
        var code = params().get('game');
        if (!code || !on()) return;
        // Games-3: a green GPS button in the header.
        if (!$('fd-gps-btn')) {
            var b = W.document.createElement('button');
            b.type = 'button'; b.id = 'fd-gps-btn'; b.textContent = '📍 GPS';
            b.setAttribute('aria-label', 'GPS yardages for this hole');
            // THE HEADER, ALWAYS IN REACH: pinned top-right over the card (the header row
            // scrolls away with the hole view); hidden while GPS is the screen.
            b.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top) + 8px);right:10px;z-index:54;background:#0f4c3a;color:#fff;border:0;border-radius:999px;padding:8px 16px;font-weight:800;font-size:14px;min-height:40px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);';
            b.addEventListener('click', function () { if (W.HardPanGps && typeof W.HardPanGps.showSide === 'function') W.HardPanGps.showSide('gps'); });
            W.document.body.appendChild(b);
            var st = W.document.createElement('style'); st.textContent = 'body.gps-side-gps #fd-gps-btn{display:none !important;}'; W.document.head.appendChild(st);
        }
    }
    // GPS-3: on the card of a GPS round with no money, the next steps.
    function gpsRoundStrip(data) {
        if (!on() || !data) return '';
        var money = (data.gameFormat && data.gameFormat !== 'stroke') || Object.keys(data.sideMatches || {}).length || Object.keys(data.additionalGameInstances || {}).length
            || (data.moneyPool && data.moneyPool.enabled) || (data.additionalGames && Object.keys(data.additionalGames).length) || data.ryderCup || data.ryderCupRef;
        if (money) return '';
        var code = params().get('game');
        return '<div id="fd-gps3" style="margin:12px 0;padding:14px;border-radius:16px;background:var(--bg-card);border:1px solid var(--border-mid);">'
            + '<div style="font-size:.8rem;opacity:.75;margin-bottom:6px;">Just scores, no money.</div>'
            + '<a href="admin.html?game=' + encodeURIComponent(code) + '&step=players" style="display:block;font-weight:700;color:#0f4c3a;padding:8px 0;">+ Add a player</a>'
            + '<div style="font-weight:800;margin-top:6px;">Playing for something?</div><div style="font-size:.84rem;opacity:.8;">Add a Nassau, skins, Vegas or BBB. These scores carry over.</div>'
            + '<button type="button" class="btn-primary fd-gps3-add" style="margin-top:8px;background:#0f4c3a;border-color:#0f4c3a;">+ Add a game</button>'
            + '<button type="button" class="btn-outline fd-gps3-map" style="margin-top:6px;">Save · back to map</button></div>';
    }
    if (W.document) W.document.addEventListener('click', function (ev) {
        var t = ev.target && ev.target.closest ? ev.target : null;
        if (!t) return;
        if (t.closest('.fd-gps3-map') || t.closest('.fd-gps3-add')) {
            var add = !!t.closest('.fd-gps3-add');
            if (W.HardPanGps && typeof W.HardPanGps.showSide === 'function') W.HardPanGps.showSide('gps');
            if (add && W.HardPanGps && typeof W.HardPanGps.openAddGame === 'function') setTimeout(function () { W.HardPanGps.openAddGame(); }, 300);
        }
    });

    // ---- TRIP (trip.html#build) ---------------------------------------------------------
    function trip() {
        if ((W.location.hash || '') !== '#build') return;
        setTimeout(function () {
            try {
                if (typeof W.showCreateTripForm === 'function') W.showCreateTripForm();
                var c = $('tb-card'); if (c) { c.open = true; c.scrollIntoView({ block: 'start' }); }
            } catch (e) {}
        }, 300);
    }

    function boot() {
        try {
            var path = String(W.location.pathname || '');
            if (/admin\.html$/.test(path)) admin();
            else if (/index\.html$/.test(path) || /\/$/.test(path)) scorecard();
            else if (/trip\.html$/.test(path)) trip();
        } catch (e) { try { console.error('[front door]', e); } catch (x) {} }
    }
    // GPS-4's quick starts: Round Setup's own templates (admin.html gpsApplyTemplate).
    var QUICK_STARTS = [
        { tpl: 'nassau', name: 'Nassau', sub: '$5 front \u00b7 back \u00b7 total' },
        { tpl: 'skins', name: 'Skins', sub: '$2 a skin \u00b7 carry over' },
        { tpl: 'vegas', name: 'Vegas', sub: '$1 a point \u00b7 2 v 2' },
        { tpl: 'bbb', name: 'Bingo Bango Bongo', sub: '$1 a point' }
    ];
    W.HardPanDoors = { QUICK_STARTS: QUICK_STARTS, door: door, setDoor: setDoor, on: on, afterSave: afterSave, recents: recents, addRecent: addRecent, gpsRoundStrip: gpsRoundStrip, allCourses: allCourses, miles: miles, ready: ready };
    W.HardPanHome = { start: homeStart, show: show };
    if (W.document && !/home\.html$/.test(String(W.location.pathname || ''))) {
        if (W.document.readyState === 'loading') W.document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
    }
})();
