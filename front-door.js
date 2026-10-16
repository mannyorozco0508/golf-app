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
    // THE HARDPAN GPS APP: native AND carrying the Geolocation plugin (com.rattlegolf.gpsbeta
    // registers it; the Consumer app does not ship it, nor this file).
    function gpsApp() { try { return native() && !!(W.Capacitor.Plugins && W.Capacitor.Plugins.Geolocation); } catch (e) { return false; } }
    function on() { return W.__hardpanDoors === true || gpsApp(); }
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
    // NEVER WAITS FOREVER (gps-doors-black): the first ask shows iOS's location prompt,
    // and the plugin's own timeout doesn't run while the prompt is up. After LOC_MS the
    // list says so with "Tap to retry"; an answer arriving later is still used.
    var LOC_MS = 15000;
    function position(done) {
        var Cap = W.Capacitor, G = Cap && Cap.Plugins && Cap.Plugins.Geolocation, settled = false;
        var once = function (p, why) { if (settled) { if (p) done(p, 'late'); return; } settled = true; clearTimeout(timer); done(p, why); };
        var timer = setTimeout(function () { once(null, 'timeout'); }, LOC_MS);
        try {
            if (native() && G && typeof G.getCurrentPosition === 'function') {
                G.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 }).then(function (p) { once([p.coords.latitude, p.coords.longitude]); }, function () { once(null, 'denied'); });
                return;
            }
            if (W.navigator.geolocation) { W.navigator.geolocation.getCurrentPosition(function (p) { once([p.coords.latitude, p.coords.longitude]); }, function () { once(null, 'denied'); }, { timeout: 10000, maximumAge: 300000 }); return; }
        } catch (e) {}
        once(null, 'none');
    }
    // A data file that never answers can't hold GPS-1 up either.
    var LOAD_MS = 8000;
    function loadScriptTimed(src, done) {
        var fired = false, fin = function (ok) { if (fired) return; fired = true; clearTimeout(t); done(ok); };
        var t = setTimeout(function () { fin(false); }, LOAD_MS);
        try { loadScript(src, fin); } catch (e) { fin(false); }
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
    // GPS READY = what the GPS screen will actually draw. In the app (GPS LIVE) that is
    // GolfAPI data ONLY (gps-view osmRecord: "GolfAPI or nothing"): the bundled GolfAPI
    // file's links, or a course pulled before. On the web: the bundled OSM holes.
    function live() { try { return !!(W.HardPanGpsLive && W.HardPanGpsLive.on()); } catch (e) { return false; } }
    function golfapiLink(key) {
        var d = W.HardPanGolfApi, L = d && d.links;
        if (!L || !key) return null;
        if (L[key]) return key;
        var pre = Object.keys(L).filter(function (k) { return k.indexOf(key + '_') === 0; })[0];   // thistle_27 -> thistle_27_cameron_stewart
        return pre || null;
    }
    function ready(key) {
        if (!key) return false;
        if (live()) return !!golfapiLink(key) || /^gapi_\d+$/.test(key);
        var b = bundled(); return !!(b && b[key] && b[key].holes && Object.keys(b[key].holes).length);
    }
    function stateOf(name) { var m = /\(([A-Z]{2})\b/.exec(name || ''); return m ? m[1] : ''; }
    // THE NAME A GOLFER READS (Manny, 2026-10-15): "Thistle Golf Club", not "Thistle Golf Club (NC -
    // 27 Hole)" - a trailing "(XX ...)" that starts with a state is the directory's note, and the
    // city line under it says where. Any other bracket ("(Yelm)", "(Red/Blue)") stays.
    function nameKey(name) { return shownName(name).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function shownName(name) { return String(name || '').replace(/\s*\((?:[A-Z]{2})\b[^)]*\)\s*$/, '') || String(name || ''); }
    // A COURSE'S POINT when its own key has no bundled holes: a 27-hole club's first nine
    // (thistle_27 -> thistle_27_cameron), else its GolfAPI club's lat / lng.
    function golfapiCourse(key) {
        var d = W.HardPanGolfApi, k = golfapiLink(key), id = k && d && d.links && d.links[k];
        return id && d.courses ? d.courses[id] || null : null;
    }
    function coursePoint(key) {
        var p = bundledPoint(key);
        if (p) return p;
        var b = bundled();
        if (b && key) {
            var nine = Object.keys(b).filter(function (k) { return k.indexOf(key + '_') === 0 && b[k] && b[k].holes; }).sort()[0];
            if (nine) { p = bundledPoint(nine); if (p) return p; }
        }
        var ga = golfapiCourse(key);
        return ga && isFinite(ga.lat) && isFinite(ga.lng) ? [ga.lat, ga.lng] : null;
    }
    function allCourses() {
        if (C.list) return C.list;
        var out = [], seen = {};
        var dir = typeof courseDirectory !== 'undefined' ? courseDirectory : [];   /* global courseDirectory */
        dir.forEach(function (g) {
            (g.items || []).forEach(function (i) {
                if (!i || !i.id || seen[i.id]) return;
                seen[i.id] = 1;
                var ga = golfapiCourse(i.id);
                out.push({ key: i.id, name: i.name, ready: ready(i.id), pt: coursePoint(i.id), state: stateOf(i.name) || (ga && ga.state) || '', city: (ga && ga.city) || '' });
            });
        });
        // THE APP'S GOLFAPI COURSES no directory row names (a course pulled for the app): by
        // their club's point, GPS READY (gapi_<id>, the key a pulled course goes by).
        var gd = W.HardPanGolfApi, linked = {};
        if (gd && gd.links) Object.keys(gd.links).forEach(function (k) { linked[gd.links[k]] = 1; });
        if (gd && gd.courses) Object.keys(gd.courses).forEach(function (id) {
            var c = gd.courses[id];
            if (!c || linked[id] || !isFinite(c.lat) || !/^\d+$/.test(String(id))) return;
            var nm = String(c.club || '') + (c.course && c.holes >= 18 && String(c.course).toLowerCase() !== String(c.club).toLowerCase() ? ' (' + c.course + ')' : '');
            if (!nm || out.some(function (o) { return nameKey(o.name) === nameKey(nm); })) return;
            out.push({ key: 'gapi_' + id, name: nm, ready: true, pt: [c.lat, c.lng], state: c.state || '', city: c.city || '' });
        });
        var cov = W.HardPanGpsCoverage || {};
        Object.keys(cov).forEach(function (st) {
            ((cov[st] && cov[st].rows) || []).forEach(function (r) {
                // [osm id, name, city, greens, lines, holes, bundle-ready, lat, lon]
                var nm = String(r[1] || ''), nk = nameKey(nm);
                // The same course under the directory's spelling ("Tri-Mountain" / "Tri Mountain")
                // is listed once: the directory's row, which carries the key.
                var same = nm ? out.filter(function (c) { return nameKey(c.name).indexOf(nk) === 0; })[0] : null;
                if (same) { if (!same.city && r[2]) same.city = r[2]; if (!same.state) same.state = st; if (!same.pt && r[7] != null) same.pt = [r[7], r[8]]; return; }
                if (!nm) return;
                out.push({ key: null, osm: r[0], name: nm, city: r[2] || '', state: st, ready: false, pt: r[7] != null ? [r[7], r[8]] : null });
            });
        });
        C.list = out;
        return out;
    }
    var NEAR_MI = 25, NEAR_MAX = 8;
    function nearList(here) {
        if (!here) return [];
        return allCourses().filter(function (c) { return c.pt; }).map(function (c) { return { c: c, d: miles(here, c.pt) }; })
            .filter(function (x) { return x.d <= NEAR_MI; }).sort(function (a, b) { return a.d - b.d; }).slice(0, NEAR_MAX);
    }
    function where(c, dist) {
        var bits = [];
        var place = c.city || c.state ? [c.city, c.state].filter(Boolean).join(', ') : '';
        if (c.key) { try { var L = JSON.parse(ls(LOC + c.key) || 'null'); if (L && (L.city || L.state)) place = [L.city, L.state].filter(Boolean).join(', '); } catch (e) {} }
        // Still only a state (or nothing): the app's GolfAPI course has its city (Manny, 2026-10-13:
        // Myrtlewood, Man O' War, True Blue showed none).
        if (c.key && (!place || place.indexOf(',') === -1)) { var ga = golfapiPlace(c.key); if (ga) place = ga; }
        if (place) bits.push(place);
        if (dist != null) bits.push((dist < 10 ? dist.toFixed(1) : Math.round(dist)) + ' mi');
        return bits.join(' · ');
    }
    function golfapiPlace(key) {
        try {
            var G = W.HardPanGolfApi, lk = golfapiLink(key), id = G && G.links && lk && G.links[lk];
            if (!id || !G.courses) return '';
            var all = Array.isArray(G.courses) ? G.courses : Object.keys(G.courses).map(function (k) { return G.courses[k]; });
            var c = all.filter(function (x) { return x && (String(x.id) === String(id) || String(x.id).indexOf(String(id)) === 0); })[0];
            return c && (c.city || c.state) ? [c.city, c.state].filter(Boolean).join(', ') : '';
        } catch (e) { return ''; }
    }
    function rowHtml(c, dist) {
        return '<button type="button" class="hp-row" data-hp-course="' + esc(c.key || '') + '" data-hp-name="' + esc(c.name) + '">'
            + '<span><span class="n">' + esc(shownName(c.name)) + '</span><span class="s" style="display:block;">' + esc(where(c, dist)) + '</span></span>'
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
        try {
            if (view === 'gps') gpsView();
            if (view === 'games') gamesView();
        } catch (e) {
            try { console.error('[front door] ' + view, e); } catch (x) {}
            stuck('Something went wrong opening ' + (view === 'gps' ? 'GPS' : 'Games') + '.');
        }
        try { W.scrollTo(0, 0); } catch (e) {}
    }
    // THE WAY OUT OF ANY STUCK SCREEN: a light card with "Tap to retry" (reloads Home).
    function stuck(msg) {
        try {
            W.document.documentElement.style.visibility = '';
            var el = $('fd-stuck');
            if (!el) {
                el = W.document.createElement('div');
                el.id = 'fd-stuck'; el.setAttribute('role', 'alert');
                el.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;background:#f0f4f2;color:#1a1a1a;color-scheme:light;font-family:-apple-system,system-ui,sans-serif;text-align:center;visibility:visible;';
                (W.document.body || W.document.documentElement).appendChild(el);
            }
            el.innerHTML = '<div style="font-weight:800;font-size:1.15rem;color:#0f4c3a;">HardPan</div><div class="fd-stuck-msg" style="font-size:.95rem;"></div>'
                + '<button type="button" style="min-height:52px;min-width:200px;border:0;border-radius:14px;background:#0f4c3a;color:#fff;font-weight:800;font-size:1.05rem;">Tap to retry</button>';
            el.querySelector('.fd-stuck-msg').textContent = msg || 'This is taking too long.';
            el.querySelector('button').onclick = function () { try { W.location.replace('home.html'); } catch (e) { W.location.href = 'home.html'; } };
        } catch (e) {}
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
            if (!C.here && C.why === 'timeout') { box.innerHTML = '<div class="hp-status">Couldn\u2019t get your location yet. <button type="button" class="hp-retry" data-hp-retry="near" style="min-height:40px;margin-left:4px;border:1px solid #0f4c3a;border-radius:999px;background:#fff;color:#0f4c3a;font-weight:800;padding:4px 14px;">Tap to retry</button><br>Search works without it.</div>'; return; }
            if (!C.here) { box.innerHTML = '<div class="hp-status">Turn on location for this app to see courses near you. Search works without it.</div>'; return; }
            // NEAREST FIRST (Manny, 2026-10-15): distance only - GPS READY is a badge, not a rank;
            // within 25 miles, up to 8. Within about a mile: "You're at ..." on top, one tap to start.
            var list = nearList(C.here);
            var at = list[0] && list[0].d <= 1 ? list[0] : null;
            box.innerHTML = (at ? '<div class="hp-at"><div class="hp-at-h">YOU\u2019RE AT</div>' + rowHtml(at.c, at.d) + '</div>' : '')
                + (list.length ? list.slice(at ? 1 : 0).map(function (x) { return rowHtml(x.c, x.d); }).join('') : '<div class="hp-status">No courses we know of within 25 miles — search above.</div>');
            fillPlaces(H.db, box);
        };
        var near = function () {
            if (C.asked) { nearDraw(); return; }
            C.asked = true;
            position(function (p, why) { if (!p && C.here) return; C.here = p; C.why = why || null; nearDraw(); draw(); });
        };
        var needs = [];
        if (!W.HardPanGpsCourses) needs.push('gps-courses.js');
        // The app's GolfAPI file (in the iOS build only; a 404 on the web is fine).
        if (!W.HardPanGolfApi && !W.__fdGolfApiTried) { W.__fdGolfApiTried = 1; needs.push('gps-golfapi.js'); }
        STATES.forEach(function (s) { if (!(W.HardPanGpsCoverage && W.HardPanGpsCoverage[s])) needs.push('gps-coverage-' + s.toLowerCase() + '.js'); });
        var left = needs.length;
        draw();
        if (!left) { near(); return; }
        needs.forEach(function (src) { loadScriptTimed(src, function () { if (--left === 0) { C.list = null; draw(); near(); } }); });
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
    // ---- A COURSE -> GPS ON HOLE 1 (gps-doors-fix) -----------------------------------
    // Never through Round Setup's screens: the round is written here, in Round Setup's
    // saved shape, the way the trip builder writes its rounds (organizerGate + a code
    // from code-issuer.js + one set), then the scorecard opens on GPS at hole 1.
    //   GPS READY (bundled holes)   the app's own card (or the shared one) -> the round
    //   not set up yet              "Setting up GPS for <course>..." - gps-live.js find +
    //                               course (the function's limits / owner exemption) -> gapi_<id>
    //   anything that fails         the reason + "Play without GPS" + "Try another course"
    var busy = false;
    function timeout(p, ms, what) {
        return new Promise(function (ok, no) {
            var t = setTimeout(function () { no(Object.assign(new Error(what), { code: 'timeout' })); }, ms);
            p.then(function (v) { clearTimeout(t); ok(v); }, function (e) { clearTimeout(t); no(e); });
        });
    }
    function setupBox() { return $('hp-setup'); }
    function setupSay(title, why, opts) {
        var b = setupBox(); if (!b) return;
        b.style.display = 'flex';
        var o = opts || {};
        b.querySelector('.hp-su-title').textContent = title;
        b.querySelector('.hp-su-why').textContent = why || '';
        b.querySelector('.hp-su-spin').style.display = o.working ? '' : 'none';
        b.querySelector('.hp-su-list').innerHTML = o.list || '';
        b.querySelector('.hp-su-acts').style.display = o.working ? 'none' : '';
        var pw = b.querySelector('[data-hp-su="nogps"]'); if (pw) pw.style.display = o.noGps === false ? 'none' : '';
    }
    function setupClose() { var b = setupBox(); if (b) b.style.display = 'none'; busy = false; }
    // The card: the shared one when it is there (Round Setup prefers it), else the app's own.
    // opts.front / opts.back: the nines picked in "Which nines?" (back 'none' = 9 holes), built the
    // way Round Setup builds them (admin.html: remapNineHandicaps, "Club (Front / Back)" or
    // "Club (Front Only)"), so courseGpsKey and golfapiMatch find that pairing.
    function presetCard(key, opts) {
        try {
            /* global coursePresets, nineHoleLoops, remapNineHandicaps */
            if (typeof nineHoleLoops !== 'undefined' && nineHoleLoops[key]) {
                var L = nineHoleLoops[key], ks = Object.keys(L), out = [];
                var f = opts && L[opts.front] ? opts.front : ks[0];
                var bk = opts && (opts.back === 'none' || L[opts.back]) ? opts.back : (ks[1] || 'none');
                ks = bk === 'none' ? [f] : [f, bk];
                remapNineHandicaps(L[ks[0]].data, true).forEach(function (h, i) { out.push({ hole: i + 1, par: h.par, hcpIndex: h.hcpIndex }); });
                if (ks[1]) remapNineHandicaps(L[ks[1]].data, false).forEach(function (h, i) { out.push({ hole: i + 10, par: h.par, hcpIndex: h.hcpIndex }); });
                return { data: out, nameSuffix: ' (' + L[ks[0]].name.split(' ')[0] + (ks[1] ? ' / ' + L[ks[1]].name.split(' ')[0] : ' Only') + ')' };
            }
            if (typeof coursePresets !== 'undefined' && coursePresets[key] && coursePresets[key].data) return { data: coursePresets[key].data.map(function (h) { return { hole: h.hole, par: h.par, hcpIndex: h.hcpIndex }; }) };
        } catch (e) {}
        return null;
    }
    function sharedCard(key) {
        if (!H.db) return Promise.resolve(null);
        return timeout(H.db.ref('global_courses/' + key).once('value').then(function (s) { return s && s.val ? s.val() : null; }), 6000, 'course').then(function (c) {
            var d = c && Array.isArray(c.data) ? c.data.filter(Boolean) : null;
            return d && d.length >= 9 && d.every(function (h) { return h && h.par; }) ? { data: d.map(function (h, i) { return { hole: h.hole || i + 1, par: Number(h.par), hcpIndex: Number(h.hcpIndex || h.hcp || i + 1) }; }), name: c.name } : null;
        }, function () { return null; });
    }
    function meName() {
        var a = W.authBootState || {};
        var n = a.displayName || a.name || (W.firebase && W.firebase.auth && (function () { try { var u = W.firebase.auth().currentUser; return u && u.displayName; } catch (e) { return null; } })());
        return n ? String(n).split(' ')[0] : 'Me';
    }
    // The round, in Round Setup's saved shape; one golfer: you.
    function roundPayload(key, name, card, opts) {
        var o = opts || {};
        var start = o.start === 10 && (card || []).some(function (h) { return Number(h.hole) === 10; }) ? 10 : 1;
        var tee = o.tee ? { teeKey: o.tee.key, teeName: o.tee.name, slope: o.tee.slope, courseRating: o.tee.courseRating, par: o.tee.par, allowance: 100 }
            : { teeKey: '', teeName: '', slope: null, courseRating: null, par: null, allowance: 100 };
        var extra = o.tournament ? { tournamentMode: true } : {};
        return Object.assign({
            eventName: 'GPS round', roundDay: 'GPS round', settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar',
            organizerToken: Array.from({ length: 32 }, function () { return Math.floor(Math.random() * 16).toString(16); }).join(''),
            eventCategory: 'weekend', categoryIcon: '⛳', activeCourseKey: key, courseName: name, gameFormat: 'stroke', holeBetStake: 0,
            additionalGames: {}, additionalGameInstances: {}, birdieGameEnabled: false, birdieUnitVal: 0,
            matchScoring: 'net', matchScoringStyle: 'match', matchStake: 0, matchPressRule: 'none',
            nassauType: 'team', nassauScoring: 'net', nassauStake: 0, nassauPressRule: 'none',
            wolfPointVal: 0, wolfLoneMult: 2, wolfBlindMult: 3, wolfTieRule: 'carry', wolfLastPlaceRule: 'off',
            stablefordPointVal: 0, groupSizeOverrides: { 0: 1 }, stablefordScoring: 'net',
            stablefordPoints: { other: 0, bogey: 1, par: 2, birdie: 3, eagle: 4, albatross: 5 },
            dotPointVal: 0, greenieCarryover: true, skinsBuyIn: 0, skinsCarryOver: false,
            courseData: card, startingHole: start,
            teeRating: tee,
            alohaAllowed: false, handicapBasis: 'as-entered',
            players: [{ id: 101, name: meName(), hcp: '0', team: 'Team 1', squad: 'red', playingForMoney: true }]
        }, extra);
    }
    function create(key, name, card, side, opts) {
        var G = W.organizerGate;
        if (!H.db || !G || typeof W.issueUniqueCode !== 'function') return Promise.reject(new Error('This screen cannot start a round right now - reload the app.'));
        var code;
        return timeout(G.ensureOrganizer(H.db), 12000, 'sign-in').then(function (uid) {
            return timeout(W.issueUniqueCode({ db: H.db, root: 'events' }), 12000, 'code').then(function (c) {
                code = c;
                var payload = G.stamp(roundPayload(key, name, card, opts), uid);
                return timeout(H.db.ref('events/' + code).set(payload), 15000, 'save');
            });
        }).then(function () {
            if (side === 'gps') { addRecent(key, name); ls('hardpan_round_side', 'gps|' + code); }
            else ls('hardpan_round_side', 'bets|' + code);
            ls('lastRoomCode', code);
            ls('hardpan_last_round', JSON.stringify({ code: code, at: Date.now(), course: name }));
            W.location.href = 'index.html?game=' + encodeURIComponent(code);
        });
    }
    function failWhy(e) {
        if (e && e.code === 'timeout') return 'No answer from the server (' + e.message + ') - check your signal and try again.';
        if (W.organizerGate && typeof W.organizerGate.isPermissionDenied === 'function' && W.organizerGate.isPermissionDenied(e)) return W.organizerGate.WALL || 'This account cannot start a new round.';
        return (e && e.message) || String(e);
    }
    var pending = null;   // { key, name, card } for "Play without GPS"
    function startRound(c) {
        if (busy) return;
        // ASKED FIRST (Manny, 2026-10-15): which nines, start on 1 or 10, the tee, tournament mode.
        if (!c.opts) { openStartOptions(c); return; }
        busy = true;
        pending = { key: c.key, name: c.name, card: null, city: c.city, state: c.state, opts: c.opts };
        var offline = W.navigator && W.navigator.onLine === false;
        if (c.key && ready(c.key)) {
            setupSay('Starting ' + c.name + '…', '', { working: true });
            if (offline) { setupSay('No signal', 'Starting a round needs a moment of signal (one bar is enough). Try again in a minute.', {}); return; }
            sharedCard(c.key).then(function (sc) {
                var pc = presetCard(c.key, c.opts);
                // A 27-hole course is the pair of nines GPS has: their card and their name.
                var nines = !!(pc && pc.nameSuffix);
                var card = nines ? pc.data : ((sc && sc.data) || (pc && pc.data));
                if (!card) throw new Error('No scorecard for ' + c.name + ' yet.');
                pending.card = card;
                return create(c.key, String(c.name).replace(/\s*\(.*\)\s*$/, nines ? '' : '$&') + (nines ? pc.nameSuffix : ''), card, 'gps', c.opts);
            }).catch(function (e) { setupSay('Could not start ' + c.name, failWhy(e), { noGps: !!pending.card }); try { console.error('[front door] start', e); } catch (x) {} });
            return;
        }
        // NOT SET UP YET: pull it.
        setupSay('Setting up GPS for ' + c.name + '…', 'This takes a few seconds the first time.', { working: true });
        var pc0 = c.key ? presetCard(c.key, c.opts) : null;
        if (pc0) pending.card = pc0.data;
        var L = W.HardPanGpsLive;
        if (offline) { setupSay('No signal', 'Setting up GPS for a new course needs a connection.', { noGps: true }); return; }
        if (!L || !L.on()) { setupSay('GPS setup is not available here', 'Play without GPS, or pick a course marked GPS READY.', { noGps: true }); return; }
        // Pulled before by anyone (gps_links/<key>): no GolfAPI call, start now.
        (c.key && pc0 ? L.ensure(c.key) : Promise.resolve(false)).then(function (have) {
            if (have) { create(c.key, String(c.name).replace(/\s*\(.*\)\s*$/, pc0.nameSuffix ? '' : '$&') + (pc0.nameSuffix || ''), pc0.data, 'gps', c.opts).catch(function (e) { setupSay('Could not start ' + c.name, failWhy(e), { noGps: true }); }); return; }
            findAndPull(c, L);
        });
    }
    function findAndPull(c, L) {
        L.find(c.name, { city: c.city || '', state: c.state || '' }).then(function (r) {
            if (!r || r.status !== 'ok') { setupSay('Could not set up GPS for ' + c.name, L.message((r && r.status) || 'error') || 'No GPS found for this course.', { noGps: true }); return; }
            // One clear match (city/state), or only one course at all: no question to ask.
            if (r.clear || (r.matches || []).length === 1) { pull(r.clear || r.matches[0], c); return; }
            var list = (r.matches || []).slice(0, 6).map(function (m) { return '<button type="button" class="hp-row" data-hp-pull="' + esc(m.id) + '" data-hp-pull-name="' + esc(m.name) + '"><span><span class="n">' + esc(m.name) + '</span><span class="s" style="display:block;">' + esc([m.city, m.state].filter(Boolean).join(', ')) + '</span></span></button>'; }).join('');
            setupSay('Which ' + c.name + '?', list ? 'Pick the one you are playing.' : 'No GPS found for this course yet.', { list: list, noGps: true });
            pending.matches = r.matches || [];
        }, function (e) { setupSay('Could not set up GPS for ' + c.name, failWhy(e), { noGps: true }); });
    }
    function pull(m, c) {
        var L = W.HardPanGpsLive;
        setupSay('Setting up GPS for ' + (m.name || c.name) + '…', '', { working: true });
        L.course(m.id).then(function (r) {
            if (!r || r.status !== 'ready') { setupSay('Could not set up GPS for ' + (m.name || c.name), L.message((r && r.status) || 'error'), { noGps: !!pending.card }); return; }
            var key = 'gapi_' + m.id;
            return sharedCard(key).then(function (sc) {
                var card = (sc && sc.data) || pending.card;
                if (!card) { setupSay('GPS is ready, but there is no scorecard yet', 'Set this course up once in Round Setup (Search online), then it starts in one tap.', { noGps: false }); return; }
                return create(key, (sc && sc.name) || m.name || c.name, card, 'gps', pending.opts);
            });
        }).catch(function (e) { setupSay('Could not set up GPS for ' + (m.name || c.name), failWhy(e), { noGps: !!pending.card }); });
    }
    // "Play without GPS": the same round, on the scorecard; with no card, Round Setup's search.
    function playWithoutGps() {
        var p = pending || {};
        if (p.card && p.key) {
            setupSay('Starting ' + p.name + '…', '', { working: true });
            create(p.key, p.name, p.card, 'bets', p.opts).catch(function (e) { setupSay('Could not start ' + p.name, failWhy(e), { noGps: false }); });
            return;
        }
        ss(QUICK, JSON.stringify({ key: null, name: p.name || '', auto: false }));
        W.location.href = 'admin.html?start=quick';
    }
    // ---- THE QUICK-START'S QUESTIONS (gps-oct15): what Round Setup asks, before the round exists ----
    // The tees: the course record's rated tees (global_courses/<key>.tees), the same list as Round
    // Setup's Players step (admin.html courseTeeChoices).
    function teeList(raw) { if (!raw) return []; if (Array.isArray(raw)) return raw; if (typeof raw === 'object') return Object.keys(raw).sort(function (a, b) { return Number(a) - Number(b); }).map(function (k) { return raw[k]; }); return []; }
    function teeChoices(course) {
        var out = [];
        if (!course || !course.tees) return out;
        ['male', 'female'].forEach(function (g) {
            teeList(course.tees[g]).forEach(function (t, i) {
                if (!t) return;
                var slope = Number(t.slope != null ? t.slope : t.slope_rating), rating = Number(t.rating != null ? t.rating : t.course_rating);
                var par = Number(t.parTotal != null ? t.parTotal : t.par_total);
                if (!(par > 0)) { var hs = teeList(t.holes); if (hs.length) par = hs.reduce(function (sum, h) { return sum + (Number(h && h.par) || 0); }, 0); }
                if (!(slope > 0) || !(rating > 0) || !(par > 0)) return;
                out.push({ key: g + ':' + i, gender: g, name: String(t.name || t.tee_name || 'Tee'), slope: slope, courseRating: rating, par: par });
            });
        });
        return out;
    }
    function loadTees(key) {
        if (!H.db || !key) return Promise.resolve([]);
        return timeout(H.db.ref('global_courses/' + key + '/tees').once('value').then(function (s) { return teeChoices({ tees: s && s.val ? s.val() : null }); }), 6000, 'tees').then(null, function () { return []; });
    }
    function optsBox() {
        var el = $('hp-opts');
        if (el) return el;
        el = W.document.createElement('div'); el.id = 'hp-opts'; el.setAttribute('role', 'dialog');
        el.style.cssText = 'position:fixed;inset:0;z-index:60;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);font-family:-apple-system,system-ui,sans-serif;';
        (W.document.body || W.document.documentElement).appendChild(el);
        return el;
    }
    function openStartOptions(c) {
        var L = typeof nineHoleLoops !== 'undefined' && c.key ? nineHoleLoops[c.key] : null;
        var el = optsBox(), sel = 'width:100%;min-height:46px;font-size:16px;border:1px solid #0f4c3a;border-radius:12px;padding:0 10px;background:#fff;color:#1a1a1a;';
        var lab = 'display:block;font-weight:800;font-size:14px;margin:12px 0 6px;color:#0f4c3a;';
        var nine = L ? Object.keys(L).map(function (k) { return '<option value="' + esc(k) + '">' + esc(L[k].name) + '</option>'; }).join('') : '';
        var ks = L ? Object.keys(L) : [];
        el.innerHTML = '<div style="width:100%;max-width:520px;max-height:88%;overflow:auto;box-sizing:border-box;background:#fff;color:#1a1a1a;border-radius:18px 18px 0 0;padding:18px 16px calc(env(safe-area-inset-bottom) + 16px);">'
            + '<div style="font-weight:800;font-size:19px;">' + esc(shownName(c.name)) + '</div>'
            + (L ? '<div style="font-weight:800;font-size:16px;margin-top:10px;">Which nines?</div>'
                + '<label style="' + lab + '" for="hp-o-front">Front 9</label><select id="hp-o-front" style="' + sel + '">' + nine + '</select>'
                + '<label style="' + lab + '" for="hp-o-back">Back 9</label><select id="hp-o-back" style="' + sel + '">' + nine + '<option value="none">9 holes only</option></select>' : '')
            + '<div id="hp-o-startbox"><span style="' + lab + '">Start on</span><div style="display:flex;gap:8px;">'
            + '<button type="button" data-o-start="1" style="flex:1;min-height:46px;border-radius:12px;font-weight:800;font-size:16px;">Hole 1</button>'
            + '<button type="button" data-o-start="10" style="flex:1;min-height:46px;border-radius:12px;font-weight:800;font-size:16px;">Hole 10</button></div></div>'
            + '<label style="' + lab + '" for="hp-o-tee">Tee</label><select id="hp-o-tee" style="' + sel + '"><option value="">Loading tees\u2026</option></select>'
            + '<label style="display:flex;align-items:center;gap:10px;margin:14px 0 4px;font-weight:700;font-size:15px;"><input type="checkbox" id="hp-o-tourney" style="width:22px;height:22px;"> Tournament mode (distance only)</label>'
            + '<button type="button" data-o="go" style="display:block;width:100%;min-height:52px;margin-top:14px;border:0;border-radius:14px;background:#0f4c3a;color:#fff;font-weight:800;font-size:17px;">Start round</button>'
            + '<button type="button" data-o="cancel" style="display:block;width:100%;min-height:44px;margin-top:6px;border:0;background:none;color:#555;font-weight:700;font-size:15px;">Cancel</button></div>';
        var o = { start: 1, tees: [] };
        if (L) { $('hp-o-front').value = ks[0]; $('hp-o-back').value = ks[1] || 'none'; }
        var paint = function () {
            var nineOnly = L && $('hp-o-back').value === 'none';
            if (nineOnly) o.start = 1;
            $('hp-o-startbox').style.display = nineOnly ? 'none' : '';
            Array.prototype.forEach.call(el.querySelectorAll('[data-o-start]'), function (b) {
                var on = Number(b.getAttribute('data-o-start')) === o.start;
                b.style.background = on ? '#0f4c3a' : '#fff'; b.style.color = on ? '#fff' : '#0f4c3a'; b.style.border = '1px solid #0f4c3a';
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
        };
        paint();
        if (L) { $('hp-o-front').onchange = paint; $('hp-o-back').onchange = paint; }
        loadTees(c.key).then(function (list) {
            o.tees = list;
            var t = $('hp-o-tee'); if (!t) return;
            t.innerHTML = list.length ? list.map(function (x, i) { return '<option value="' + i + '">' + esc(x.name + (x.gender === 'female' ? ' (W)' : '') + ' \u00b7 ' + x.courseRating + ' / ' + x.slope) + '</option>'; }).join('') + '<option value="">No tee</option>'
                : '<option value="">No rated tees for this course</option>';
        });
        el.onclick = function (ev) {
            var t = ev.target, b;
            if ((b = t.closest('[data-o-start]'))) { o.start = Number(b.getAttribute('data-o-start')) === 10 ? 10 : 1; paint(); return; }
            if (t.closest('[data-o="cancel"]') || t === el) { el.style.display = 'none'; return; }
            if (t.closest('[data-o="go"]')) {
                var ti = $('hp-o-tee') ? $('hp-o-tee').value : '';
                var opts = { start: o.start, tee: ti !== '' && o.tees[Number(ti)] ? o.tees[Number(ti)] : null, tournament: !!($('hp-o-tourney') && $('hp-o-tourney').checked) };
                if (L) { opts.front = $('hp-o-front').value; opts.back = $('hp-o-back').value; if (opts.back === opts.front) opts.back = 'none'; }
                el.style.display = 'none';
                startRound(Object.assign({}, c, { opts: opts }));
            }
        };
        el.style.display = 'flex';
    }
    function pickCourse(key, name, row) {
        var all = allCourses();
        var c = all.filter(function (x) { return key ? x.key === key : (x.name === name && !x.key); })[0] || { key: key || null, name: name };
        startRound({ key: c.key, name: c.name || name, city: c.city || '', state: c.state || '' });
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
        // TRIPS & CUPS: every trip this phone has opened (as organizer or golfer), not only the last
        // one (Manny, 2026-10-13: "Myrtle Beach 2026" vanished). Trips are read only once signed in
        // (the live database refuses a trip to a session that is not), with one retry.
        var tc = $('hp-trip-card');
        tc.innerHTML = '';
        var codes = myTrips();
        var rowsHtml = {};
        var draw = function () {
            tc.innerHTML = codes.map(function (c) { return rowsHtml[c] || ''; }).join('')
                + '<div style="display:flex;gap:6px;margin-top:6px;"><input id="hp-trip-code" placeholder="Trip code" autocapitalize="characters" style="flex:1;min-height:40px;border:1px solid #d0e1db;border-radius:10px;padding:0 10px;font:inherit;text-transform:uppercase;"><button type="button" class="hp-btn" data-hp-act="tripcode" style="min-height:40px;">Open a trip</button></div>';
        };
        draw();
        if (!codes.length || !H.db) return;
        var load = function (tries) {
            Promise.resolve(W.authReady).catch(function () {}).then(function () {
                codes.forEach(function (code) {
                    H.db.ref('trips/' + code).once('value').then(function (s) {
                        var t = s && s.val ? s.val() : null;
                        if (!t) return;
                        var rows = Object.keys(t.rounds || {}).map(function (k) { return t.rounds[k]; });
                        var dates = rows.map(function (r) { return r.date; }).filter(Boolean).sort();
                        var wd = function (iso) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso + 'T12:00:00').getDay()]; };
                        var span = dates.length ? ' · ' + wd(dates[0]) + (dates.length > 1 ? '–' + wd(dates[dates.length - 1]) : '') : '';
                        rowsHtml[code] = '<button type="button" class="hp-row" data-hp-trip="' + esc(code) + '" style="margin-bottom:6px;"><span><span class="n" style="font-size:16px;font-weight:800;">' + esc(t.name || 'Trip') + '</span><span class="s" style="display:block;">' + rows.length + ' round' + (rows.length === 1 ? '' : 's') + span + '</span></span><span style="font-size:20px;">›</span></button>';
                        draw();
                    }, function () { if (tries < 1) setTimeout(function () { load(tries + 1); }, 1500); });
                });
            });
        };
        load(0);
    }
    // The trips this phone knows: each one opened on the trip page (organizer or not), newest first,
    // and the last one remembered before this list existed.
    var TRIPS = 'hardpan_trips_v1';
    function myTrips() {
        var list = []; try { list = JSON.parse(ls(TRIPS) || '[]'); } catch (e) { list = []; }
        if (!Array.isArray(list)) list = [];
        var last = ls('lastTripCode');
        if (last && list.indexOf(last) === -1) list.push(last);
        return list.filter(function (c) { return /^[A-Z0-9]{4,10}$/.test(String(c)); }).slice(0, 12);
    }
    function rememberTrip(code, token) {
        code = String(code || '').toUpperCase();
        if (!/^[A-Z0-9]{4,10}$/.test(code)) return;
        var list = myTrips().filter(function (c) { return c !== code; });
        list.unshift(code);
        ls(TRIPS, JSON.stringify(list.slice(0, 12)));
        if (token) { var tk = {}; try { tk = JSON.parse(ls('hardpan_trip_tokens_v1') || '{}') || {}; } catch (e) { tk = {}; } tk[code] = token; ls('hardpan_trip_tokens_v1', JSON.stringify(tk)); }
    }
    function homeClick(ev) {
        var t = ev.target && ev.target.closest ? ev.target : null;
        if (!t) return;
        var b;
        if ((b = t.closest('[data-hp-door]'))) { var d = b.getAttribute('data-hp-door'); setDoor(d); if (d === 'gps' && backToGpsRound()) return; show(d); return; }
        if (t.closest('[data-hp-retry]')) { C.asked = false; C.why = null; var nb = $('hp-near-list'); if (nb) nb.innerHTML = '<div class="hp-status">Finding courses near you\u2026</div>'; gpsView(); return; }
        if ((b = t.closest('[data-hp-course]'))) { pickCourse(b.getAttribute('data-hp-course'), b.getAttribute('data-hp-name'), b); return; }
        if ((b = t.closest('[data-hp-pull]'))) { pull({ id: b.getAttribute('data-hp-pull'), name: b.getAttribute('data-hp-pull-name') }, pending || {}); return; }
        if ((b = t.closest('[data-hp-su]'))) {
            var su = b.getAttribute('data-hp-su');
            if (su === 'nogps') playWithoutGps();
            else { setupClose(); var q = $('hp-q'); if (q) { q.value = ''; q.focus(); } search(); }
            return;
        }
        if ((b = t.closest('[data-hp-open]'))) { W.location.href = 'index.html?game=' + encodeURIComponent(b.getAttribute('data-hp-open')); return; }
        if ((b = t.closest('[data-hp-trip]'))) { W.location.href = 'trip.html?trip=' + encodeURIComponent(b.getAttribute('data-hp-trip')); return; }
        if ((b = t.closest('[data-hp-act]'))) {
            var a = b.getAttribute('data-hp-act');
            if (a === 'code') { setDoor('games'); show('games'); var i = $('hp-code'); if (i) i.focus(); }
            else if (a === 'signin') W.location.href = 'admin.html?account=1';
            else if (a === 'start') { ss(QUICK, null); W.location.href = 'admin.html?start=quick'; }
            else if (a === 'build') W.location.href = 'trip.html#build';
            else if (a === 'join') join();
            else if (a === 'tripcode') { var tci = $('hp-trip-code'), tcv = String((tci && tci.value) || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); if (tcv.length >= 4) W.location.href = 'trip.html?trip=' + encodeURIComponent(tcv); }
        }
    }
    function join() {
        var i = $('hp-code'), msg = $('hp-code-msg');
        // A SCOREKEEPER CODE (gps-share): "TADPJH-2-K7Q9X" = round, group, key -> that group's card.
        var sk = /^\s*([A-Z0-9]{4,10})\s*-\s*(\d{1,2})\s*-\s*([A-Z0-9]{4,12})\s*$/i.exec(String((i && i.value) || ''));
        if (sk) { W.location.href = 'index.html?game=' + sk[1].toUpperCase() + '&group=' + sk[2] + '&sk=' + sk[3].toUpperCase(); return; }
        var code = String((i && i.value) || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length < 4) { if (msg) { msg.className = 'hp-status hp-err'; msg.textContent = 'Type the game code (letters and numbers).'; } return; }
        // A GAME CODE OPENS THE ROUND AS A SPECTATOR (view-only, with GPS); the round's own
        // organizer and golfers keep their access (the scorecard decides).
        if (!H.db) { W.location.href = 'index.html?game=' + code + '&spectate=1'; return; }
        if (msg) { msg.className = 'hp-status'; msg.textContent = 'Checking ' + code + '…'; }
        H.db.ref('events/' + code + '/players').once('value').then(function (s) {
            if (s && s.exists && s.exists()) W.location.href = 'index.html?game=' + code + '&spectate=1';
            else if (msg) { msg.className = 'hp-status hp-err'; msg.textContent = 'No round with the code ' + code + '. Check it with whoever set it up.'; }
        }, function () { W.location.href = 'index.html?game=' + code + '&spectate=1'; });
    }
    // THE GPS ROUND IN PROGRESS (Manny, 2026-10-13: GPS from Games went to "Where are you playing?").
    // The last round, from the last 12 hours and not finished (mainDecor checks the scores), opens
    // again on GPS at its hole. The course picker only without one, or from "Pick another course".
    function activeRound() {
        var lr = null; try { lr = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr = null; }
        if (!lr || !lr.code || Date.now() - (lr.at || 0) > 12 * 3600 * 1000) return null;
        if (H.activeChecked && H.active !== lr.code) return null;
        return lr.code;
    }
    function backToGpsRound() {
        var code = activeRound();
        if (!code) return false;
        var open = function () { ls('hardpan_round_side', 'gps|' + code); W.location.href = 'index.html?game=' + encodeURIComponent(code); };
        if (!H.db || H.activeChecked) { open(); return true; }
        // ASKED FIRST (gps-trapfix): a round the server no longer has is never reopened - the
        // picker instead. No answer (no signal) still reopens it: the offline round is a feature.
        timeout(H.db.ref('events/' + code + '/players').once('value'), 5000, 'round').then(function (s) {
            if (s && typeof s.exists === 'function' && !s.exists()) { forgetRound(code, true); show('gps'); mainDecor(); }
            else open();
        }, open);
        return true;
    }
    function homeStart(db) {
        H.db = db;
        W.document.addEventListener('click', homeClick);
        var q = $('hp-q');
        if (q) q.addEventListener('input', search);
        var code = $('hp-code');
        if (code) code.addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
        // EVERY LAUNCH OPENS MAIN (Manny, 2026-10-12): the last door is highlighted and a
        // round in progress offers Resume; #gps / #games are the in-app links' own.
        var h = (W.location.hash || '').replace('#', '');
        // "Pick another course" (gps-trapfix): the picker, ALWAYS, and the round it came from is
        // no longer the one Resume / the GPS door goes back to (Games › your round still has it).
        if (h === 'pick') { var lrp = null; try { lrp = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lrp = null; } if (lrp && lrp.code) forgetRound(lrp.code, false); setDoor('gps'); show('gps'); }
        else if (h === 'gps' && backToGpsRound()) return;
        else show(h === 'gps' || h === 'games' ? h : 'main');
        mainDecor();
        backFromBackground(function () { if (W.history && W.history.replaceState) W.history.replaceState(null, '', 'home.html'); show('main'); mainDecor(); });
    }
    // The last door highlighted; "Resume <course>" for a round in progress.
    function mainDecor() {
        ['gps', 'games'].forEach(function (d) {
            var c = W.document.querySelector('#v-main .hp-door.' + d);
            if (!c) return;
            c.classList.toggle('last', door() === d);
            var tag = c.querySelector('.hp-last'); if (tag) tag.style.display = door() === d ? '' : 'none';
        });
        var box = $('hp-resume');
        if (!box) return;
        box.innerHTML = '';
        var lr = null; try { lr = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr = null; }
        if (!lr || !lr.code || Date.now() - (lr.at || 0) > 12 * 3600 * 1000 || !H.db) return;
        timeout(H.db.ref('events/' + lr.code).once('value'), 6000, 'round').then(function (snap) {
            var d = snap && snap.val ? snap.val() : null;
            // GONE from the server (gps-trapfix): forgotten here - no Resume, and the GPS door
            // opens the picker.
            if (!d) { forgetRound(lr.code, true); return; }
            if (!d.players || !d.courseData) return;
            var sc = d.scores || {}, holes = d.courseData.map(function (x) { return Number(x.hole); }), thru = 0, all = true;
            holes.forEach(function (h) { var any = d.players.some(function (p) { return sc['p' + p.id + '_h' + h]; }); var every = d.players.every(function (p) { return sc['p' + p.id + '_h' + h]; }); if (any) thru = Math.max(thru, h); if (!every) all = false; });
            H.activeChecked = true; H.active = (all && thru) ? null : lr.code;
            if (all && thru) return;   // finished
            box.innerHTML = '<button type="button" class="hp-resume" data-hp-open="' + esc(lr.code) + '">\u25B6 Resume ' + esc(String(d.courseName || lr.course || 'your round').split(' (')[0]) + (thru ? ' \u00b7 thru ' + thru : '') + '</button>';
        }, function () {});
    }
    // BACK FROM THE BACKGROUND AFTER A WHILE (60 min): Main again, like a launch.
    var AWAY_MS = 60 * 60 * 1000;
    function backFromBackground(go) {
        W.document.addEventListener('visibilitychange', function () {
            if (W.document.visibilityState === 'hidden') { ls('hardpan_bg_at', String(Date.now())); return; }
            var at = Number(ls('hardpan_bg_at') || 0);
            ls('hardpan_bg_at', null);
            if (at && Date.now() - at > AWAY_MS) go();
        });
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
            var tpl = p.get('tpl'), paste = p.get('paste'), step = p.get('step'), fmt = p.get('fmt');
            var SO = typeof WIZARD_STEP_OF !== 'undefined' ? WIZARD_STEP_OF : { format: 3, players: 5, action: 6 };   /* global WIZARD_STEP_OF */
            if (tpl || paste || step || fmt) whenLoaded(function () {
                try {
                    if (paste && typeof W.spRoundOpen === 'function') { W.goToWizardStep(5); W.spRoundOpen(); return; }
                    if (step === 'players') { W.goToWizardStep(5); return; }
                    if (step === 'money') { W.goToWizardStep(SO.action); return; }
                    // ALL GAMES > a round format: its card picked on the Format step.
                    if (fmt) { if (typeof W.selectFormatCard === 'function') W.selectFormatCard(fmt); W.goToWizardStep(SO.format); return; }
                    if (tpl && typeof W.gpsApplyTemplate === 'function') {
                        // A QUICK START set up on GPS-4: its $ and golfers / teams (Vegas:
                        // A, A, B, B) for the Money step to fill in.
                        var amt = parseFloat(p.get('amt')), ids = (p.get('ids') || '').split(',').filter(Boolean), carry = p.get('carry');
                        W.__hpTplOpts = amt > 0 || ids.length ? { amt: amt > 0 ? amt : null, ids: ids, carry: carry == null ? null : carry === '1' } : null;
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
        var lr = null; try { lr = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr = null; }
        ls('hardpan_last_round', JSON.stringify({ code: code, at: Date.now(), course: lr && lr.code === code ? lr.course : '' }));
        backFromBackground(function () { W.location.href = 'home.html'; });
        // Games-3: the green GPS button lives IN the hole's heading (placeGpsPill, on
        // every render) - never floating over the game cards or the keypad (Manny,
        // 2026-10-12). The old floating GPS / Card toggle is hidden in the app: the
        // heading's button and the GPS screen's own Score do its job.
        var st = W.document.createElement('style');
        st.textContent = '#gps-side-toggle{display:none !important;}';
        W.document.head.appendChild(st);
        // The heading is redrawn on every hole change: put the button back each time.
        try {
            var pending2 = false;
            new MutationObserver(function () { if (pending2) return; pending2 = true; setTimeout(function () { pending2 = false; placeGpsPill(); placeMenuItems(); placeShareButton(); }, 50); })
                .observe(W.document.body, { childList: true, subtree: true });
        } catch (e) {}
        placeGpsPill();
        placeMenuItems();
        placeShareButton();
    }
    function placeGpsPill() {
        if (!on() || !params().get('game')) return;
        var head = W.document.querySelector('#hole-view-card .hole-view-header') || W.document.querySelector('.hole-view-header');
        if (!head) return;
        var b = $('fd-gps-btn');
        if (b && b.parentNode === head) return;
        if (b) b.parentNode.removeChild(b);
        b = W.document.createElement('button');
        b.type = 'button'; b.id = 'fd-gps-btn'; b.textContent = '\uD83D\uDCCD GPS';
        b.setAttribute('aria-label', 'GPS yardages for this hole');
        b.style.cssText = 'margin:0 auto 0 10px;background:#0f4c3a;color:#fff;border:0;border-radius:999px;padding:6px 14px;font-weight:800;font-size:14px;min-height:36px;cursor:pointer;vertical-align:middle;';
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', function () { if (W.HardPanGps && typeof W.HardPanGps.showSide === 'function') W.HardPanGps.showSide('gps'); });
        var num = head.querySelector('.hv-hole-num');
        if (num && num.nextSibling) head.insertBefore(b, num.nextSibling); else head.appendChild(b);
    }
    // GPS-3: on the card of a GPS round with no money, the next steps.
    function gpsRoundStrip(data) {
        if (!on() || !data) return '';
        var money = (data.gameFormat && data.gameFormat !== 'stroke') || Object.keys(data.sideMatches || {}).length || Object.keys(data.additionalGameInstances || {}).length
            || (data.moneyPool && data.moneyPool.enabled) || (data.additionalGames && Object.keys(data.additionalGames).length) || data.ryderCup || data.ryderCupRef;
        if (money) return '';
        var code = params().get('game');
        return '<div id="fd-gps3" style="margin:12px 0;padding:14px;border-radius:16px;background:#ffffff;color:#1a1a1a;border:1px solid #d0e1db;color-scheme:light;">'
            + '<div style="font-size:.8rem;opacity:.75;margin-bottom:6px;">Just scores, no money.</div>'
            + '<a href="admin.html?game=' + encodeURIComponent(code) + '&step=players" style="display:block;font-weight:700;color:#0f4c3a;padding:8px 0;">+ Add a player</a>'
            + '<div style="font-weight:800;margin-top:6px;">Playing for something?</div><div style="font-size:.84rem;opacity:.8;">Add a Nassau, skins, Vegas or BBB. These scores carry over.</div>'
            + '<button type="button" class="btn-primary fd-gps3-add" style="margin-top:8px;background:#0f4c3a;border-color:#0f4c3a;">+ Add a game</button>'
            + '<button type="button" class="btn-outline fd-gps3-map" style="margin-top:6px;background:#ffffff;color:#0f4c3a;border-color:#0f4c3a;">Save · back to map</button></div>';
    }
    if (W.document) W.document.addEventListener('click', function (ev) {
        var t = ev.target && ev.target.closest ? ev.target : null;
        if (!t) return;
        if (t.closest('.fd-gps3-map') || t.closest('.fd-gps3-add')) {
            if (t.closest('.fd-gps3-add')) { openAddGame(); return; }
            if (W.HardPanGps && typeof W.HardPanGps.showSide === 'function') W.HardPanGps.showSide('gps');
        }
    });

    // ---- GPS-4 "ADD A GAME" (gps-doors-fix, Manny 2026-10-12) -------------------------
    // One sheet, from the GPS screen's + (next to the score box), its Tools menu, the
    // card's "+ Add a game" and the ≡ Round Menu:
    //   QUICK START  Nassau / Skins / Vegas / BBB: the $ and the golfers / teams first
    //                (the betting side's 2v2 picker), then that game's normal setup for
    //                THIS round opens filled in - Side Bets for a Nassau, Round Setup's
    //                Money step for the others - and its own Save adds it.
    //   ALL GAMES    every game the betting side has, each opening its normal setup.
    //   PASTE        the whole round (Round Setup's paste), or a multi-round match /
    //                trip (the trip builder, today = Day 1, this course, these golfers).
    // Nothing here writes to Firebase: every game is saved by the screen it opens.
    var AG = { q: null };
    var AG_AMTS = { nassau: [2, 5, 10, 20], skins: [1, 2, 5, 10], vegas: [0.25, 0.5, 1, 2], bbb: [0.5, 1, 2, 5] };
    var AG_DEF = { nassau: 5, skins: 2, vegas: 1, bbb: 1 };
    var BETS_KEY = 'hardpan_paste_bets_v1_';   // setup-paste-ui.js's queue: Side Bets "Fill it in"
    var ALL_GAMES = [
        { id: 'points', ico: '\uD83C\uDFC5', name: 'Points game', sub: 'Individual points over this round or several \u00b7 a pot for the top places', go: 'points' },
        { id: 'nassau', ico: '💵', name: 'Nassau', sub: 'Front · back · total, 1 v 1 or 2 v 2, presses', go: 'sm', fmt: 'nassau' },
        { id: 'match', ico: '⚔️', name: 'Match play', sub: 'One overall match, 1 v 1 or teams', go: 'sm', fmt: 'match' },
        { id: 'strokebet', ico: '🏌️', name: 'Stroke play bet', sub: 'So much a hole + overall', go: 'sm', fmt: 'stroke' },
        { id: 'skins', ico: '💰', name: 'Skins', sub: 'Carry over, pick who’s in', go: 'tpl', tpl: 'skins' },
        { id: 'vegas', ico: '🎲', name: 'Vegas', sub: 'Two teams of two, a point a stroke', go: 'tpl', tpl: 'vegas' },
        { id: 'bbb', ico: '🟢', name: 'Bingo Bango Bongo', sub: 'Three points a hole', go: 'tpl', tpl: 'bbb' },
        { id: 'wolf', ico: '🐺', name: 'Wolf', sub: 'Round format · so much a point', go: 'tpl', tpl: 'wolf' },
        { id: 'dots', ico: '🔵', name: 'Dots / junk', sub: 'Birdies, sandies, greenies… everyone playing', go: 'sm', fmt: 'dots' },
        { id: 'nines', ico: '🔢', name: '9 Points', sub: 'Three golfers, 5-3-1', go: 'sm', fmt: 'nines' },
        { id: 'kp', ico: '📍', name: 'KP pool / Weekly game', sub: 'One buy-in: KPs, net finishers, skins', go: 'step', step: 'money' },
        { id: 'presses', ico: '⏫', name: 'Presses', sub: 'On a Nassau or match already playing', go: 'smlist' },
        { id: 'side', ico: '🤝', name: 'Side bets', sub: 'Any bet between golfers or teams', go: 'sm' },
        { id: 'bestball', ico: '👥', name: 'Best ball', sub: 'Round format', go: 'fmt', fmt: 'bestball' },
        { id: 'stableford', ico: '⭐', name: 'Stableford', sub: 'Round format', go: 'fmt', fmt: 'stableford' },
        { id: 'scramble', ico: '🤼', name: 'Scramble', sub: 'Round format', go: 'fmt', fmt: 'scramble' },
        { id: 'hilo', ico: '↕️', name: 'Hi-Lo', sub: 'Round format', go: 'fmt', fmt: 'hilo' },
        { id: 'ryder', ico: '🏆', name: 'Team match / Ryder Cup', sub: 'This round, team v team', go: 'fmt', fmt: 'ryder-cup' },
        { id: 'cup', ico: '🗓️', name: 'Cup over several days', sub: 'Paste a multi-round match', go: 'trip' }
    ];
    function agCode() { return params().get('game'); }
    function agPlayers() { try { return ((typeof currentData !== 'undefined' && currentData && currentData.players) || []).filter(function (p) { return p && p.name; }); } catch (e) { return []; } }   /* global currentData */
    function agRound() { try { return (typeof currentData !== 'undefined' && currentData) || {}; } catch (e) { return {}; } }
    function first(n) { return String(n || '').split(' ')[0]; }
    function agMoney(v) { v = Number(v); return '$' + (v % 1 ? v.toFixed(2).replace(/0$/, '') : v); }
    function agSheet() {
        var el = $('fd-addgame');
        if (el) return el;
        el = W.document.createElement('div');
        el.id = 'fd-addgame'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Add a game');
        el.style.cssText = 'display:none;position:fixed;inset:0;z-index:2147483000;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#f0f4f2;color:#1a1a1a;color-scheme:light;font-family:inherit;padding:calc(env(safe-area-inset-top) + 10px) 16px calc(env(safe-area-inset-bottom) + 24px);box-sizing:border-box;';
        var st = W.document.createElement('style');
        st.textContent = '#fd-addgame *{box-sizing:border-box;} #fd-addgame .ag-h{font-size:.72rem;font-weight:800;letter-spacing:.06em;color:#5b6b64;margin:16px 0 6px;}'
            + '#fd-addgame .ag-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;} #fd-addgame .ag-tile{background:#fff;border:1px solid #d0e1db;border-radius:14px;padding:12px;text-align:left;min-height:64px;color:#1a1a1a;}'
            + '#fd-addgame .ag-tile b{display:block;color:#0f4c3a;font-size:1rem;} #fd-addgame .ag-tile span{font-size:.76rem;color:#5b6b64;}'
            + '#fd-addgame .ag-row{display:flex;width:100%;align-items:center;gap:10px;background:#fff;border:1px solid #d0e1db;border-radius:12px;padding:10px 12px;margin:0 0 6px;text-align:left;min-height:52px;color:#1a1a1a;}'
            + '#fd-addgame .ag-row b{display:block;font-size:.95rem;} #fd-addgame .ag-row small{display:block;font-size:.74rem;color:#5b6b64;} #fd-addgame .ag-row .ag-go{margin-left:auto;color:#0f4c3a;font-weight:800;}'
            + '#fd-addgame .ag-chip{min-height:40px;padding:6px 14px;margin:4px 6px 0 0;border-radius:999px;border:2px solid #d0e1db;background:#fff;color:#1a1a1a;font-weight:800;}'
            + '#fd-addgame .ag-chip.on{background:#0f4c3a;border-color:#0f4c3a;color:#fff;} #fd-addgame .ag-chip.b{background:#1d3557;border-color:#1d3557;color:#fff;}'
            + '#fd-addgame .ag-cta{width:100%;min-height:54px;margin-top:16px;border:0;border-radius:14px;background:#0f4c3a;color:#fff;font-weight:800;font-size:1.02rem;} #fd-addgame .ag-cta:disabled{opacity:.45;}'
            + '#fd-addgame .ag-not{width:100%;min-height:48px;margin-top:10px;border:0;background:none;color:#1d3557;font-weight:700;} #fd-addgame .ag-note{font-size:.8rem;color:#5b6b64;margin-top:6px;}'
            + '#fd-addgame .ag-warn{font-size:.82rem;color:#9a3412;font-weight:700;margin-top:8px;}';
        el.appendChild(st);
        var body = W.document.createElement('div'); body.className = 'ag-body'; el.appendChild(body);
        el.addEventListener('click', agClick);
        el.addEventListener('input', function (ev) { if (ev.target && ev.target.classList.contains('ag-other') && AG.q) { var v = parseFloat(ev.target.value); if (v > 0) { AG.q.amt = v; agSummary(); } } });
        W.document.body.appendChild(el);
        return el;
    }
    function agHead(title, sub, back) {
        return '<div style="display:flex;align-items:center;gap:10px;"><button type="button" data-ag="' + back + '" aria-label="Back" style="min-width:44px;min-height:44px;border:0;background:#fff;border-radius:12px;font-size:1.5rem;color:#0f4c3a;">‹</button>'
            + '<div><div style="font-weight:800;font-size:1.2rem;color:#0f4c3a;">' + esc(title) + '</div><div style="font-size:.8rem;color:#5b6b64;">' + esc(sub) + '</div></div></div>';
    }
    function openAddGame() {
        if (!agCode()) return false;
        if (spectating()) return true;   // a spectator adds nothing (the sheet does not open)
        AG.q = null;
        agList();
        agSheet().style.display = '';
        return true;
    }
    function closeAddGame() { var el = $('fd-addgame'); if (el) el.style.display = 'none'; AG.q = null; }
    function agList() {
        var ps = agPlayers();
        var h = agHead('Add a game', 'To this round · your scores carry over', 'close')
            + '<div class="ag-h">PLAYING</div><div style="font-weight:700;">' + (ps.length ? esc(ps.map(function (p) { return first(p.name); }).join(' · ')) : 'Just you so far') + '</div>'
            + '<div class="ag-h">QUICK START</div><div class="ag-grid">'
            + QUICK_STARTS.map(function (q) { return '<button type="button" class="ag-tile" data-ag-q="' + q.tpl + '"><b>' + esc(q.name) + '</b><span>' + esc(q.sub) + '</span></button>'; }).join('') + '</div>'
            + '<div class="ag-note">Tap one to set the $ and who plays whom first.</div>'
            + '<div class="ag-h">PASTE</div>'
            + '<button type="button" class="ag-row" data-ag-go="paste"><span>📋</span><span><b>Paste the whole round</b><small>Groups, teams and games from one text</small></span><span class="ag-go">›</span></button>'
            + '<button type="button" class="ag-row" data-ag-go="trip"><span>🗓️</span><span><b>Paste a multi-round match / trip</b><small>Today is Day 1 · this course · these golfers</small></span><span class="ag-go">›</span></button>'
            + '<div class="ag-h">ALL GAMES</div>'
            + ALL_GAMES.map(function (g) { return '<button type="button" class="ag-row" data-ag-all="' + g.id + '"><span>' + g.ico + '</span><span><b>' + esc(g.name) + '</b><small>' + esc(g.sub) + '</small></span><span class="ag-go">›</span></button>'; }).join('')
            + '<button type="button" class="ag-not" data-ag="close">Not now · back to the round</button>';
        agSheet().querySelector('.ag-body').innerHTML = h;
        agSheet().scrollTop = 0;
    }
    // A QUICK START: the $ and the golfers / teams, then its normal setup.
    function agQuick(tpl) {
        var ps = agPlayers(), ids = ps.map(function (p) { return String(p.id); });
        AG.q = { tpl: tpl, amt: AG_DEF[tpl], order: ids.slice(0, 4), ids: ids.slice(), carry: true, mode: ps.length === 2 || ps.length === 3 ? '1v1' : '2v2' };
        if (AG.q.mode === '1v1') AG.q.order = ids.slice(0, 2);
        agConfig();
    }
    function agName(id) { var p = agPlayers().filter(function (x) { return String(x.id) === String(id); })[0]; return p ? p.name : '?'; }
    function agSides() {
        var q = AG.q, o = q.order;
        return q.mode === '1v1' ? { a: o.slice(0, 1), b: o.slice(1, 2) } : { a: o.slice(0, 2), b: o.slice(2, 4) };
    }
    function agValid() {
        var q = AG.q, s = agSides();
        if (!(q.amt > 0)) return false;
        if (q.tpl === 'nassau') return s.a.length && s.b.length && (q.mode === '1v1' || (s.a.length === 2 && s.b.length >= 1));
        if (q.tpl === 'vegas') return s.a.length === 2 && s.b.length === 2;
        return q.ids.length >= 2;
    }
    function agSummary() {
        var q = AG.q, s = agSides(), qs = QUICK_STARTS.filter(function (x) { return x.tpl === q.tpl; })[0] || { name: q.tpl };
        var who = q.tpl === 'nassau' || q.tpl === 'vegas' ? s.a.map(function (i) { return first(agName(i)); }).join(' & ') + ' v ' + s.b.map(function (i) { return first(agName(i)); }).join(' & ')
            : q.ids.map(function (i) { return first(agName(i)); }).join(', ');
        var per = q.tpl === 'nassau' ? ' each (front · back · total)' : q.tpl === 'skins' ? ' a skin' : ' a point';
        var cta = $('fd-ag-cta');
        if (cta) { cta.disabled = !agValid(); cta.textContent = 'Add ' + qs.name + ' · ' + agMoney(q.amt) + per; }
        var sm = $('fd-ag-sum'); if (sm) sm.textContent = who;
    }
    function agConfig() {
        var q = AG.q, ps = agPlayers(), qs = QUICK_STARTS.filter(function (x) { return x.tpl === q.tpl; })[0];
        var h = agHead(qs.name, 'For this round · change anything first', 'list');
        h += '<div class="ag-h">' + (q.tpl === 'nassau' ? '$ EACH: FRONT · BACK · TOTAL' : q.tpl === 'skins' ? '$ A SKIN' : '$ A POINT') + '</div><div>'
            + AG_AMTS[q.tpl].map(function (v) { return '<button type="button" class="ag-chip' + (Number(q.amt) === v ? ' on' : '') + '" data-ag-amt="' + v + '">' + agMoney(v) + '</button>'; }).join('')
            + '<input type="number" inputmode="decimal" min="0" step="0.25" class="ag-other" placeholder="Other $" value="' + (AG_AMTS[q.tpl].indexOf(Number(q.amt)) === -1 ? esc(q.amt) : '') + '" style="width:96px;min-height:40px;margin-top:4px;border:2px solid #d0e1db;border-radius:999px;padding:4px 12px;font-weight:800;background:#fff;color:#1a1a1a;"></div>';
        if (q.tpl === 'nassau' || q.tpl === 'vegas') {
            var s = agSides();
            h += '<div class="ag-h">WHO PLAYS WHOM</div>';
            if (q.tpl === 'nassau' && ps.length >= 3) h += '<div style="margin-bottom:6px;">' + ['1v1', '2v2'].map(function (m) { return '<button type="button" class="ag-chip' + (q.mode === m ? ' on' : '') + '" data-ag-mode="' + m + '">' + (m === '1v1' ? '1 v 1' : '2 v 2') + '</button>'; }).join('') + '</div>';
            h += '<div class="ag-note">' + (q.mode === '1v1' ? 'First golfer tapped = side A, the next = side B.' : 'First two tapped = Team A, next two = Team B.') + ' Tap again to un-pick.</div><div>'
                + ps.map(function (p) {
                    var id = String(p.id), i = q.order.indexOf(id), inA = s.a.indexOf(id) !== -1, inB = s.b.indexOf(id) !== -1;
                    return '<button type="button" class="ag-chip' + (inA ? ' on' : inB ? ' b' : '') + '" data-ag-pick="' + esc(id) + '" aria-pressed="' + (i !== -1) + '">' + (inA ? 'A ' : inB ? 'B ' : '') + esc(first(p.name)) + '</button>';
                }).join('') + '</div>'
                + '<div style="margin-top:8px;font-weight:800;color:#0f4c3a;">' + (q.mode === '1v1' ? 'Side A: ' : 'Team A: ') + esc(agTeam(s.a, q.mode)) + '</div>'
                + '<div style="font-weight:800;color:#1d3557;">' + (q.mode === '1v1' ? 'Side B: ' : 'Team B: ') + esc(agTeam(s.b, q.mode)) + '</div>'
                + '<button type="button" class="ag-chip" data-ag-swap="1" style="margin-top:8px;">⇄ Swap teams</button>';
            if (q.tpl === 'vegas' && ps.length < 4) h += '<div class="ag-warn">Vegas needs four golfers — add players first (≡ Round Menu › Edit round setup).</div>';
        } else {
            h += '<div class="ag-h">GOLFERS IN</div><div>' + ps.map(function (p) { var on2 = q.ids.indexOf(String(p.id)) !== -1; return '<button type="button" class="ag-chip' + (on2 ? ' on' : '') + '" data-ag-in="' + esc(String(p.id)) + '">' + (on2 ? '✓ ' : '') + esc(first(p.name)) + '</button>'; }).join('') + '</div>';
            if (q.tpl === 'skins') h += '<label style="display:flex;gap:10px;align-items:center;margin-top:12px;font-weight:700;"><input type="checkbox" data-ag-carry="1"' + (q.carry ? ' checked' : '') + ' style="width:22px;height:22px;"> Ties carry over</label>';
            if (ps.length < 2) h += '<div class="ag-warn">This needs two golfers or more — add players first.</div>';
        }
        h += '<div id="fd-ag-sum" class="ag-note" style="margin-top:14px;"></div>'
            + '<button type="button" class="ag-cta" id="fd-ag-cta">Add</button>'
            + '<div class="ag-note">' + (q.tpl === 'nassau' ? 'Opens Side Bets with this filled in — check it and tap Save.' : 'Opens Round Setup’s Money step with this filled in — check it and Save.') + '</div>'
            + '<button type="button" class="ag-not" data-ag="list">‹ All games</button>';
        agSheet().querySelector('.ag-body').innerHTML = h;
        agSummary();
    }
    function agTeam(ids, mode) { var n = ids.map(agName); if (mode === '1v1') return n[0] || '__'; return (n[0] || '__') + ' & ' + (n[1] || '__'); }
    function agPickTap(id) {
        var q = AG.q, o = q.order.slice(), i = o.indexOf(id), max = q.mode === '1v1' ? 2 : 4;
        if (i !== -1) o.splice(i, 1); else if (o.length < max) o.push(id);
        q.order = o;
    }
    function agAdd() {
        var q = AG.q, code = agCode(), base = '?game=' + encodeURIComponent(code), s = agSides();
        if (!q || !agValid()) return;
        if (q.tpl === 'nassau') {
            var key = BETS_KEY + String(code).toUpperCase(), cur = null;
            try { cur = JSON.parse(ls(key) || 'null'); } catch (e) { cur = null; }
            var bets = cur && Array.isArray(cur.bets) ? cur.bets : [];
            bets.push({ group: 'This round', a: s.a.map(agName), b: s.b.map(agName), front: q.amt, back: q.amt, overall: q.amt, press: null });
            ls(key, JSON.stringify({ at: Date.now(), bets: bets }));
            W.location.href = 'sidematches.html' + base + '&hpfill=1';
            return;
        }
        var ids = q.tpl === 'vegas' ? s.a.concat(s.b) : q.ids;
        W.location.href = 'admin.html' + base + '&tpl=' + q.tpl + '&amt=' + encodeURIComponent(q.amt) + '&ids=' + encodeURIComponent(ids.join(',')) + (q.tpl === 'skins' ? '&carry=' + (q.carry ? 1 : 0) : '');
    }
    function agRoute(g) {
        var code = agCode(), base = '?game=' + encodeURIComponent(code);
        if (g.go === 'sm') return 'sidematches.html' + base + '&add=1' + (g.fmt ? '&fmt=' + g.fmt : '');
        if (g.go === 'smlist') return 'sidematches.html' + base;
        if (g.go === 'tpl') return 'admin.html' + base + '&tpl=' + g.tpl;
        if (g.go === 'fmt') return 'admin.html' + base + '&fmt=' + g.fmt;
        if (g.go === 'step') return 'admin.html' + base + '&step=' + g.step;
        if (g.go === 'points') return 'points.html' + base + '&setup=1';
        return null;
    }
    // A MULTI-ROUND MATCH / TRIP: the trip builder, filled in with today as Day 1.
    function tripPrefill() {
        var d = agRound(), ps = agPlayers(), now = new Date();
        var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        // The builder drops "&" / "and" on a DAY line (tee times: "9:10 & 9:20"), so the
        // name goes up to the "&" ("Caledonia Golf"): it still matches the saved course,
        // and an unclear one is asked on review. Its golfers come from the group's
        // "A & B vs C & D": the first half v the second half, to change.
        var course = String(d.courseName || '').trim().split(/\s*&\s*|\s+and\s+/i)[0];
        var names = ps.map(function (p) { return p.name; }), half = Math.ceil(names.length / 2);
        return 'TRIP: ' + (course ? course.split(/\s+/)[0] + ' ' : '') + 'trip\n'
            + 'DAY 1 - ' + WD[now.getDay()] + ' ' + MO[now.getMonth()] + ' ' + now.getDate() + ' - ' + (course || 'Course') + '\n'
            + (names.length ? 'Group 1: ' + names.slice(0, half).join(' & ') + ' vs ' + (names.slice(half).join(' & ') || 'TBD') + '\n' : '');
    }
    function agTrip() {
        ss('hardpan_tb_prefill', JSON.stringify({ text: tripPrefill(), from: agCode(), at: Date.now() }));
        W.location.href = 'trip.html#build';
    }
    function agClick(ev) {
        var t = ev.target && ev.target.closest ? ev.target : null;
        if (!t) return;
        var b;
        if ((b = t.closest('[data-ag]'))) { var a = b.getAttribute('data-ag'); if (a === 'close') closeAddGame(); else { AG.q = null; agList(); } return; }
        if ((b = t.closest('[data-ag-q]'))) { agQuick(b.getAttribute('data-ag-q')); return; }
        if ((b = t.closest('[data-ag-go]'))) { var go = b.getAttribute('data-ag-go'); if (go === 'trip') agTrip(); else W.location.href = 'admin.html?game=' + encodeURIComponent(agCode()) + '&paste=1'; return; }
        if ((b = t.closest('[data-ag-all]'))) {
            var g = ALL_GAMES.filter(function (x) { return x.id === b.getAttribute('data-ag-all'); })[0];
            if (!g) return;
            if (g.go === 'trip') { agTrip(); return; }
            var url = agRoute(g); if (url) W.location.href = url;
            return;
        }
        if (!AG.q) return;
        if ((b = t.closest('[data-ag-amt]'))) { AG.q.amt = Number(b.getAttribute('data-ag-amt')); agConfig(); return; }
        if ((b = t.closest('[data-ag-mode]'))) { var m = b.getAttribute('data-ag-mode'), ids = agPlayers().map(function (p) { return String(p.id); }); AG.q.mode = m; AG.q.order = ids.slice(0, m === '1v1' ? 2 : 4); agConfig(); return; }
        if ((b = t.closest('[data-ag-pick]'))) { agPickTap(b.getAttribute('data-ag-pick')); agConfig(); return; }
        if (t.closest('[data-ag-swap]')) { var s = agSides(); AG.q.order = s.b.concat(s.a); agConfig(); return; }
        if ((b = t.closest('[data-ag-in]'))) {
            var id = b.getAttribute('data-ag-in'), all = agPlayers().map(function (p) { return String(p.id); });
            var cur = AG.q.ids.indexOf(id) !== -1 ? AG.q.ids.filter(function (x) { return x !== id; }) : AG.q.ids.concat([id]);
            AG.q.ids = all.filter(function (x) { return cur.indexOf(x) !== -1; });
            agConfig(); return;
        }
        if (t.closest('[data-ag-carry]')) { AG.q.carry = !!t.closest('[data-ag-carry]').checked; return; }
        if (t.closest('#fd-ag-cta')) { agAdd(); return; }
    }
    // ≡ ROUND MENU: Add a game, Paste the whole round, Paste a multi-round match.
    function placeMenuItems() {
        if (!on() || !agCode()) return;
        var body = $('round-sheet-body');
        if (!body || $('fd-menu-games')) return;
        var box = W.document.createElement('div');
        box.id = 'fd-menu-games';
        box.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin:4px 0 10px;';
        var btn = 'min-height:48px;border-radius:12px;border:1px solid #0f4c3a;background:#ffffff;color:#0f4c3a;font-weight:800;font-size:.95rem;text-align:left;padding:8px 14px;';
        box.innerHTML = '<button type="button" data-fdm="add" style="' + btn + 'background:#0f4c3a;color:#fff;">➕ Add a game</button>'
            + '<button type="button" data-fdm="paste" style="' + btn + '">📋 Paste the whole round</button>'
            + '<button type="button" data-fdm="trip" style="' + btn + '">🗓️ Paste a multi-round match</button>';
        box.addEventListener('click', function (ev) {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-fdm]') : null;
            if (!b) return;
            var a = b.getAttribute('data-fdm');
            try { if (typeof W.toggleRoundSheet === 'function') W.toggleRoundSheet(false); } catch (e) {}
            if (a === 'add') openAddGame();
            else if (a === 'paste') W.location.href = 'admin.html?game=' + encodeURIComponent(agCode()) + '&paste=1';
            else agTrip();
        });
        body.insertBefore(box, body.firstChild);
    }

    // ---- SPECTATING (gps-share) ----------------------------------------------------------------
    // The scorecard says when the viewer is a spectator (or a scorekeeper whose code does not
    // match): a "Spectating" badge, and none of setup, edit, delete, Add a game or score entry.
    // GPS for the course stays (it needs no edit rights).
    var SPEC = { on: false, badKey: false };
    function spectatorMode(on, badKey) {
        SPEC.on = !!on; SPEC.badKey = !!badKey;
        var d = W.document, root = d.documentElement;
        root.classList.toggle('hp-spectating', SPEC.on || SPEC.badKey);
        if (!$('hp-spec-style')) {
            var st = d.createElement('style'); st.id = 'hp-spec-style';
            st.textContent = 'html.hp-spectating #setup-entry-mount,html.hp-spectating #end-round-mount,html.hp-spectating #fd-menu-games,html.hp-spectating #fd-gps3,'
                + 'html.hp-spectating #gps-overlay .gps-door-add,html.hp-spectating #gps-overlay .gps-add-game,'
                + 'html.hp-spectating .score-input-wrapper input:not([disabled]){display:none !important;}'
                + '#hp-spec-badge{position:fixed;z-index:2147482000;top:calc(env(safe-area-inset-top) + 6px);left:50%;transform:translateX(-50%);background:#1d3557;color:#fff;font:800 12px/1 -apple-system,system-ui,sans-serif;padding:6px 12px;border-radius:999px;letter-spacing:.04em;pointer-events:none;}';
            d.head.appendChild(st);
        }
        var b = $('hp-spec-badge');
        if (SPEC.on || SPEC.badKey) {
            if (!b) { b = d.createElement('div'); b.id = 'hp-spec-badge'; d.body.appendChild(b); }
            b.textContent = SPEC.badKey ? '\uD83D\uDC40 Spectating \u00b7 scorekeeper code not valid' : '\uD83D\uDC40 Spectating';
        } else if (b) b.parentNode.removeChild(b);
    }
    function spectating() { return SPEC.on || SPEC.badKey; }

    // ---- A ROUND THIS PHONE CANNOT WRITE TO NEVER TRAPS IT (gps-trapfix, 2026-10-14) ----------
    // Manny's TADPJH: the round was gone from the server, the phone kept its own copy, every
    // score was refused, and Resume / the GPS door / "Pick another course" all led back to it.
    // forgetRound: this round is no longer the one the doors go back to. gone = the server has
    // no such round: its stored copy and its queued changes go too (they can never land).
    function forgetRound(code, gone) {
        code = String(code || '').toUpperCase();
        if (!code) return;
        var lr = null; try { lr = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr = null; }
        if (lr && String(lr.code || '').toUpperCase() === code) ls('hardpan_last_round', null);
        if (H.active === code || !H.active) { H.activeChecked = true; H.active = null; }
        if (!gone) return;
        var sd = String(ls('hardpan_round_side') || '');
        if (sd === 'gps|' + code || sd === 'bets|' + code) ls('hardpan_round_side', null);
        if (String(ls('lastRoomCode') || '').toUpperCase() === code) ls('lastRoomCode', null);
        dropQueued(code);
        ls('golfapp_snap_v1_' + code, null);
    }
    // The queued changes for this round only (offline-queue.js keeps one list for every round).
    function dropQueued(code) {
        try {
            var q = JSON.parse(ls('golfapp_wq_v1') || '[]');
            if (!Array.isArray(q)) return;
            var keep = q.filter(function (op) { return !(op && typeof op.path === 'string' && (op.path === 'events/' + code || op.path.indexOf('events/' + code + '/') === 0)); });
            if (keep.length !== q.length) ls('golfapp_wq_v1', JSON.stringify(keep));
        } catch (e) {}
    }
    // The message, over everything (the GPS screen included), with "Exit this round".
    //   'gone'    the server has no such round (deleted, or never saved).
    //   'refused' the server refused a change (this phone may not write to it).
    var STUCK = { code: null, why: null };
    function stuckRound(code, why) {
        code = String(code || '').toUpperCase();
        if (!code || (STUCK.code === code && (STUCK.why === why || STUCK.why === 'gone'))) return;
        STUCK.code = code; STUCK.why = why;
        if (why === 'gone') forgetRound(code, true); else forgetRound(code, false);
        var d = W.document, el = $('hp-stuck-round');
        if (!el) {
            el = d.createElement('div'); el.id = 'hp-stuck-round'; el.setAttribute('role', 'alertdialog');
            el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);font-family:-apple-system,system-ui,sans-serif;color-scheme:light;';
            (d.body || d.documentElement).appendChild(el);
        }
        var gone = why === 'gone';
        var btn = 'display:block;width:100%;min-height:52px;border-radius:14px;font-weight:800;font-size:1.05rem;margin-top:10px;';
        el.innerHTML = '<div style="width:100%;max-width:520px;box-sizing:border-box;background:#fff;color:#1a1a1a;border-radius:18px 18px 0 0;padding:20px 16px calc(env(safe-area-inset-bottom) + 16px);">'
            + '<div style="font-weight:800;font-size:1.15rem;color:#9b1c1c;">⚠️ ' + (gone ? 'Round ' + esc(code) + ' isn’t on the server any more' : 'You can’t save to this round') + '</div>'
            + '<div style="font-size:.95rem;margin-top:8px;line-height:1.4;">' + (gone
                ? 'It was deleted, or it never finished saving. Nothing entered here can be saved. Exit and start a new round.'
                : 'The server refused your change to round ' + esc(code) + '. This phone isn’t allowed to write to it, so new scores won’t save. Your other rounds are fine.') + '</div>'
            + '<button type="button" data-hp-exit style="' + btn + 'border:0;background:#0f4c3a;color:#fff;">Exit this round</button>'
            + (gone ? '' : '<button type="button" data-hp-view style="' + btn + 'border:1px solid #0f4c3a;background:#fff;color:#0f4c3a;">Keep looking (view-only)</button>')
            + '</div>';
        el.style.display = 'flex';
        el.querySelector('[data-hp-exit]').onclick = function () { exitRound(code, gone); };
        var v = el.querySelector('[data-hp-view]');
        if (v) v.onclick = function () { W.__hpReadOnly = true; spectatorMode(true, false); el.style.display = 'none'; try { if (typeof renderScorecard === 'function') renderScorecard(); } catch (e) {} };   /* global renderScorecard */
    }
    // Exit: the round is forgotten here (and its unsendable changes), then the course picker.
    function exitRound(code, gone) {
        forgetRound(code, true);
        if (!gone) ls('golfapp_snap_v1_' + String(code).toUpperCase(), null);
        var to = on() ? 'home.html#pick' : 'admin.html';
        try { W.location.replace(to); } catch (e) { W.location.href = to; }
    }

    // ---- SHARE (gps-share): the Round Menu's "Share" replaces "Show QR code" ---------------------
    function cd() { try { return typeof currentData !== 'undefined' ? currentData : null; } catch (e) { return null; } }   /* global currentData */
    function shareBase() { try { return typeof shareBaseUrl === 'function' ? shareBaseUrl() : ''; } catch (e) { return ''; } }   /* global shareBaseUrl */
    function isOrganizer() { try { return typeof canReachSetup === 'function' && canReachSetup(); } catch (e) { return false; } }   /* global canReachSetup */
    function joinUrl(path) { var b = shareBase(); return (b ? (b.charAt(b.length - 1) === '/' ? b : b + '/') : '') + path; }
    function spectatorUrl(code) { return joinUrl('leaderboard.html?game=' + encodeURIComponent(code)); }
    function keyUrl(code, g, key) { return joinUrl('index.html?game=' + encodeURIComponent(code) + '&group=' + g + '&sk=' + encodeURIComponent(key)); }
    function placeShareButton() {
        if (!on() || !agCode()) return;
        var m = $('qr-share-mount');
        if (!m || m.getAttribute('data-hp-share') === '1') return;
        m.setAttribute('data-hp-share', '1');
        m.innerHTML = '<button type="button" class="btn-outline qr-open-btn" data-hp-share-open="1">\uD83D\uDCE4 Share</button>';
        m.querySelector('button').addEventListener('click', function () { try { if (typeof W.toggleRoundSheet === 'function') W.toggleRoundSheet(false); } catch (e) {} openShare(); });
        // index.html redraws this mount: keep "Share" there.
        try { new MutationObserver(function () { if (m.getAttribute('data-hp-share') !== '1' || !m.querySelector('[data-hp-share-open]')) { m.removeAttribute('data-hp-share'); placeShareButton(); } }).observe(m, { childList: true }); } catch (e) {}
    }
    var SH = { group: null, keys: {} };
    function shareSheet() {
        var el = $('fd-share');
        if (el) return el;
        el = W.document.createElement('div');
        el.id = 'fd-share'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Share this round');
        el.style.cssText = 'display:none;position:fixed;inset:0;z-index:2147483000;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#f0f4f2;color:#1a1a1a;color-scheme:light;font-family:-apple-system,system-ui,sans-serif;padding:calc(env(safe-area-inset-top) + 10px) 16px calc(env(safe-area-inset-bottom) + 24px);box-sizing:border-box;';
        el.addEventListener('click', shareClick);
        W.document.body.appendChild(el);
        return el;
    }
    function qr(text) { try { return typeof qrSvgFor === 'function' ? qrSvgFor(text, { size: 200 }) : ''; } catch (e) { return ''; } }   /* global qrSvgFor */
    function openShare() {
        var code = agCode();
        if (!code) return;
        var el = shareSheet(), d = cd() || {}, org = isOrganizer();
        var groups = typeof computeGroupBoundaries === 'function' ? computeGroupBoundaries((d.players || []).length, d.groupSizeOverrides || {}) : [{ group: 1, startIdx: 0, size: (d.players || []).length }];   /* global computeGroupBoundaries */
        var btn = 'min-height:44px;padding:8px 14px;border-radius:12px;border:1px solid #0f4c3a;background:#fff;color:#0f4c3a;font-weight:800;font-size:.95rem;';
        var h = ['<div style="display:flex;align-items:center;gap:10px;"><button type="button" data-sh="close" aria-label="Back" style="min-width:44px;min-height:44px;border:0;background:#fff;border-radius:12px;font-size:1.5rem;color:#0f4c3a;">\u2039</button><div style="font-weight:800;font-size:1.2rem;color:#0f4c3a;">Share this round</div></div>'];
        // THE GAME CODE, big and copyable.
        h.push('<div style="margin:16px 0;padding:16px;border-radius:16px;background:#fff;border:1px solid #d0e1db;text-align:center;">'
            + '<div style="font-size:.75rem;font-weight:800;letter-spacing:.08em;color:#5b6b64;">GAME CODE</div>'
            + '<div class="fd-share-code" style="font:800 2.6rem/1.1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:#0f4c3a;margin:6px 0;user-select:all;-webkit-user-select:all;">' + esc(code) + '</div>'
            + '<button type="button" data-sh="copycode" style="' + btn + '">Copy code</button>'
            + '<div style="font-size:.85rem;margin-top:10px;">Have the HardPan app? <b>Games \u203A Have a game code?</b> \u203A type this. You get the round + GPS for this course.</div></div>');
        // SPECTATOR (the default).
        var su = spectatorUrl(code);
        h.push('<div style="padding:14px;border-radius:16px;background:#fff;border:1px solid #d0e1db;margin-bottom:12px;">'
            + '<div style="font-weight:800;font-size:1.05rem;">\uD83D\uDC40 Spectator</div><div style="font-size:.82rem;color:#5b6b64;margin:2px 0 8px;">View-only: scores, leaderboard, matches, bets, results, live. Nothing to type in.</div>'
            + '<div style="display:flex;justify-content:center;">' + qr(su) + '</div>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px;"><button type="button" data-sh="share" data-url="' + esc(su) + '" style="' + btn + 'background:#0f4c3a;color:#fff;">Share\u2026</button><button type="button" data-sh="copy" data-url="' + esc(su) + '" style="' + btn + '">Copy link</button></div></div>');
        // SCOREKEEPER (the organizer only): a group, its own code / link / QR; Revoke.
        if (org) {
            h.push('<div style="padding:14px;border-radius:16px;background:#fff;border:1px solid #d0e1db;">'
                + '<div style="font-weight:800;font-size:1.05rem;">\u270F\uFE0F Scorekeeper</div><div style="font-size:.82rem;color:#5b6b64;margin:2px 0 8px;">Lets one person enter scores for ONE group only. You can revoke it.</div><div>'
                + groups.map(function (g) { var on2 = SH.group === g.group; return '<button type="button" data-sh-group="' + g.group + '" style="' + btn + 'margin:0 6px 6px 0;' + (on2 ? 'background:#0f4c3a;color:#fff;' : '') + '">Group ' + g.group + '</button>'; }).join('') + '</div>');
            if (SH.group != null) {
                var g = SH.group, key = SH.keys[g], has = !!(d.scoreKeys && d.scoreKeys[String(g)]);
                if (key) {
                    var u = keyUrl(code, g, key), typed = code + '-' + g + '-' + key;
                    h.push('<div style="display:flex;justify-content:center;margin-top:6px;">' + qr(u) + '</div>'
                        + '<div style="text-align:center;font:800 1.3rem/1.2 ui-monospace,Menlo,monospace;letter-spacing:.06em;margin:6px 0;user-select:all;-webkit-user-select:all;">' + esc(typed) + '</div>'
                        + '<div style="font-size:.8rem;color:#5b6b64;text-align:center;">In the app: Games \u203A Have a game code? \u203A type this code.</div>'
                        + '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px;"><button type="button" data-sh="share" data-url="' + esc(u) + '" style="' + btn + 'background:#0f4c3a;color:#fff;">Share\u2026</button><button type="button" data-sh="copy" data-url="' + esc(u) + '" style="' + btn + '">Copy link</button><button type="button" data-sh="newkey" style="' + btn + 'border-color:#b91c1c;color:#b91c1c;">Revoke \u00b7 new code</button></div>');
                } else {
                    h.push('<div style="font-size:.85rem;margin:6px 0;">' + (has ? 'Group ' + g + ' has a scorekeeper code (made earlier, not shown again). Make a new one to share it here \u2014 the old one stops working.' : 'No scorekeeper code for Group ' + g + ' yet.') + '</div>'
                        + '<button type="button" data-sh="newkey" style="' + btn + 'background:#0f4c3a;color:#fff;">' + (has ? 'Revoke \u00b7 new code' : 'Make a scorekeeper code') + '</button>');
                }
            }
            h.push('</div>');
        }
        h.push('<div data-sh-msg="1" role="status" style="font-size:.85rem;font-weight:700;color:#0f4c3a;min-height:1.2em;margin-top:10px;text-align:center;"></div>');
        el.innerHTML = h.join('');
        el.style.display = '';
    }
    function shareSay(t) { var m = W.document.querySelector('#fd-share [data-sh-msg]'); if (m) m.textContent = t; }
    function copyText(t) {
        var ok = function () { shareSay('Copied'); };
        try { if (W.navigator.clipboard && W.navigator.clipboard.writeText) { W.navigator.clipboard.writeText(t).then(ok, function () { shareSay(t); }); return; } } catch (e) {}
        shareSay(t);
    }
    function shareUrl(u) {
        var Sh = W.Capacitor && W.Capacitor.Plugins && W.Capacitor.Plugins.Share;
        if (Sh && typeof Sh.share === 'function') { Sh.share({ title: 'Follow our round', url: u }).catch(function () {}); return; }
        if (W.navigator.share) { W.navigator.share({ title: 'Follow our round', url: u }).catch(function () {}); return; }
        copyText(u);
    }
    function newKey() {
        var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '', buf = new Uint8Array(6);
        try { W.crypto.getRandomValues(buf); } catch (e) { for (var i = 0; i < 6; i++) buf[i] = Math.floor(Math.random() * 256); }
        for (var j = 0; j < 6; j++) out += A.charAt(buf[j] % A.length);
        return out;
    }
    function sha256(t) {
        try { return W.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t))).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }); }
        catch (e) { return Promise.reject(e); }
    }
    function makeKey(g) {
        var code = agCode(), key = newKey(), d0 = (function () { try { return typeof db !== 'undefined' ? db : null; } catch (e) { return null; } })();   /* global db */
        if (!d0) { shareSay('Not connected.'); return; }
        sha256(key).then(function (hash) { return d0.ref('events/' + code + '/scoreKeys/' + g).set(hash); }).then(function () {
            SH.keys[g] = key; var d = cd(); if (d) { d.scoreKeys = Object.assign({}, d.scoreKeys || {}); d.scoreKeys[String(g)] = 'set'; }
            openShare(); shareSay('Scorekeeper code for Group ' + g + ' made' + (d && d.scoreKeys ? '' : '') + '.');
        }, function (e) { shareSay('Not saved: ' + (e && e.message || e)); });
    }
    function shareClick(ev) {
        var t = ev.target && ev.target.closest ? ev.target : null;
        if (!t) return;
        var b;
        if ((b = t.closest('[data-sh-group]'))) { SH.group = Number(b.getAttribute('data-sh-group')); openShare(); return; }
        if ((b = t.closest('[data-sh]'))) {
            var a = b.getAttribute('data-sh');
            if (a === 'close') $('fd-share').style.display = 'none';
            else if (a === 'copycode') copyText(agCode());
            else if (a === 'copy') copyText(b.getAttribute('data-url'));
            else if (a === 'share') shareUrl(b.getAttribute('data-url'));
            else if (a === 'newkey' && SH.group != null && isOrganizer()) makeKey(SH.group);
        }
    }

    // ---- TRIP (trip.html#build) ---------------------------------------------------------
    function trip() {
        try { var tp = params(); if (tp.get('trip')) rememberTrip(tp.get('trip'), tp.get('organizer')); } catch (e) {}
        if ((W.location.hash || '') !== '#build') return;
        setTimeout(function () {
            try {
                if (typeof W.showCreateTripForm === 'function') W.showCreateTripForm();
                var c = $('tb-card'); if (c) { c.open = true; c.scrollIntoView({ block: 'start' }); }
                // From a round's "Paste a multi-round match": today is Day 1, this course,
                // these golfers. Day 1 is made as a NEW round by Confirm (the builder
                // writes every day whole); the round it came from keeps its scores.
                var pf = null; try { pf = JSON.parse(ss('hardpan_tb_prefill') || 'null'); } catch (e) { pf = null; }
                var box = $('tb-box');
                if (pf && pf.text && box && Date.now() - (pf.at || 0) < 30 * 60 * 1000) {
                    ss('hardpan_tb_prefill', null);
                    box.value = pf.text;
                    var note = W.document.createElement('div');
                    note.id = 'fd-tb-note';
                    note.style.cssText = 'margin:6px 0;padding:10px 12px;border-radius:12px;border:1px solid #0f4c3a;background:#ffffff;color:#1a1a1a;font-size:.84rem;';
                    note.innerHTML = '<b>Day 1 = today, this course, these golfers.</b> Add the other days below (a line like <b>DAY 2 - Tue Oct 13 - True Blue</b>, then the groups and games), a Cup line and TEAMS if it is a match, then Read it → Confirm.'
                        + '<div style="margin-top:4px;">Confirm creates the trip and every day as a new round, Day 1 included. Your round <b>' + esc(pf.from || '') + '</b> keeps its scores where it is.</div>';
                    box.parentNode.insertBefore(note, box);
                    // No focus: the keyboard would cover the note; a tap in the box types at the end.
                    note.style.scrollMarginTop = 'calc(env(safe-area-inset-top) + 16px)';   // clear of the status bar
                    note.scrollIntoView({ block: 'start' });
                }
            } catch (e) {}
        }, 300);
    }

    function boot() {
        try {
            var path = String(W.location.pathname || '');
            if (/admin\.html$/.test(path)) admin();
            else if (/index\.html$/.test(path) || /\/$/.test(path)) scorecard();
            else if (/trip\.html$/.test(path)) { trip(); if (on()) backFromBackground(function () { W.location.href = 'home.html'; }); }
        } catch (e) { try { console.error('[front door]', e); } catch (x) {} }
    }
    // GPS-4's quick starts: Round Setup's own templates (admin.html gpsApplyTemplate).
    var QUICK_STARTS = [
        { tpl: 'nassau', name: 'Nassau', sub: '$5 front \u00b7 back \u00b7 total' },
        { tpl: 'skins', name: 'Skins', sub: '$2 a skin \u00b7 carry over' },
        { tpl: 'vegas', name: 'Vegas', sub: '$1 a point \u00b7 2 v 2' },
        { tpl: 'bbb', name: 'Bingo Bango Bongo', sub: '$1 a point' }
    ];
    W.HardPanDoors = { stuckRound: stuckRound, forgetRound: forgetRound, spectatorMode: spectatorMode, spectating: spectating, openShare: openShare, myTrips: myTrips, rememberTrip: rememberTrip, golfapiPlace: golfapiPlace, activeRound: activeRound, stuck: stuck, LOC_MS: LOC_MS, LOAD_MS: LOAD_MS, LAUNCH_MS: LAUNCH_MS, QUICK_STARTS: QUICK_STARTS, ALL_GAMES: ALL_GAMES, openAddGame: openAddGame, closeAddGame: closeAddGame, tripPrefill: tripPrefill, placeMenuItems: placeMenuItems, placeGpsPill: placeGpsPill, door: door, setDoor: setDoor, on: on, afterSave: afterSave, recents: recents, addRecent: addRecent, gpsRoundStrip: gpsRoundStrip, allCourses: allCourses, miles: miles, ready: ready };
    W.HardPanHome = { start: homeStart, show: show };
    // A LAUNCH LANDS ON THE DOORS AT ONCE (Manny, 2026-10-12: the cold launch showed the
    // scorecard's "Connecting to game..." on the way). The app opens index.html with no
    // round; it used to hop index -> admin -> home, drawing each. Now, as this file is read
    // (in <head>), a page with no round goes straight to home.html and is never drawn.
    var LAUNCH_MS = 5000;
    (function launch() {
        try {
            if (!on()) return;
            var path = String(W.location.pathname || ''), p = params();
            var bare = !p.get('game') && !p.get('start') && !p.get('account') && !p.get('trip') && !p.get('season') && !p.get('copyFrom') && !p.get('coach') && !p.get('eventType');
            if (bare && (/index\.html$/.test(path) || /\/$/.test(path) || /admin\.html$/.test(path))) {
                W.document.documentElement.style.visibility = 'hidden';
                W.location.replace('home.html');
                // Still here after LAUNCH_MS (the hop to Home never happened): never a blank or
                // black screen - the page shows again with "Tap to retry".
                setTimeout(function () {
                    var go = function () { stuck('Opening HardPan is taking longer than it should.'); };
                    if (W.document.body) go(); else W.document.addEventListener('DOMContentLoaded', go);
                }, LAUNCH_MS);
            }
        } catch (e) {}
    })();
    if (W.document && !/home\.html$/.test(String(W.location.pathname || ''))) {
        if (W.document.readyState === 'loading') W.document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
    }
})();
