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
//               ?tpl=skins|vegas|bbb|wolf  Add a game > All games: that game on this round (GPS-4)
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
    // DENIED IS ONLY DENIED (audit, 2026-10-16): a timeout or "no position yet" (the native
    // plugin's own timeout) is "Couldn't get your location - Tap to retry", never "turn on location".
    function whyNot(e) {
        var code = e && e.code, m = String((e && (e.message || e.errorMessage)) || e || '').toLowerCase();
        if (code === 1 || code === 'PERMISSION_DENIED' || /denied|permission|not authori[sz]ed|disabled|not enabled/.test(m)) return 'denied';
        return 'timeout';
    }
    function position(done) {
        var Cap = W.Capacitor, G = Cap && Cap.Plugins && Cap.Plugins.Geolocation, settled = false;
        var once = function (p, why) { if (settled) { if (p) done(p, 'late'); return; } settled = true; clearTimeout(timer); done(p, why); };
        var timer = setTimeout(function () { once(null, 'timeout'); }, LOC_MS);
        try {
            if (native() && G && typeof G.getCurrentPosition === 'function') {
                var ask = function () { G.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 }).then(function (p) { once([p.coords.latitude, p.coords.longitude]); }, function (e) { once(null, whyNot(e)); }); };
                // THE APP'S OWN PERMISSION (URGENT-016): already refused in iOS Settings -> "denied" at
                // once (the course list falls back to this phone's courses) instead of waiting out a
                // request iOS will not show; not asked yet -> getCurrentPosition shows iOS's prompt.
                if (typeof G.checkPermissions === 'function') {
                    G.checkPermissions().then(function (st) { if (st && st.location === 'denied') once(null, 'denied'); else ask(); }, ask);
                    return;
                }
                ask();
                return;
            }
            if (W.navigator.geolocation) { W.navigator.geolocation.getCurrentPosition(function (p) { once([p.coords.latitude, p.coords.longitude]); }, function (e) { once(null, whyNot(e)); }, { timeout: 10000, maximumAge: 300000 }); return; }
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
    // URGENT-019: from the app's own settings when gps-live.js is not loaded yet - the course list
    // can be worked out before it is (Round Setup loads it late), and then marked the directory's
    // OpenStreetMap courses "✓ GPS" in the app, where the GPS screen never draws them ("isn't mapped").
    function live() {
        try {
            if (W.HardPanGpsLive) return !!W.HardPanGpsLive.on();
            var c = W.HARDPAN_GPS_CONFIG;
            return !!(c && c.live === true && c.golfapi !== false && c.liveBase && (native() || c.liveTest));
        } catch (e) { return false; }
    }
    function golfapiLink(key) {
        var d = W.HardPanGolfApi, L = d && d.links;
        if (!L || !key) return null;
        if (L[key]) return key;
        // A 27-hole pairing's own record ("thistle_mackay_cameron") is the bundle's "thistle_27_mackay_cameron".
        var alias = String(key).replace(/^([a-z]+)_/, '$1_27_');
        if (alias !== key && L[alias]) return alias;
        var pre = Object.keys(L).filter(function (k) { return k.indexOf(key + '_') === 0; })[0];   // thistle_27 -> thistle_27_cameron_stewart
        return pre || null;
    }
    // ✓ GPS ON EVERY COURSE WITH LIVE GPS (021, Manny: "YES, show it on every course with live GPS"):
    // besides the GolfAPI file and the OSM holes, a course linked to its GolfAPI GPS (gps_links -
    // Dobson, Legacy...) and a course whose greens golfers have set (course_gps). Read once, small.
    var GPSK = { links: null, own: null, gc: null, asked: false };
    // URGENT-024 (Manny's phone: duplicates and no ✓ the Chrome check never saw): the database lets a
    // signed-in phone read gps_links/<key> and gps_courses/<id> ONE AT A TIME - never the whole node
    // (that read is refused; the test browser applied no rules). So: one small read per course of
    // ours, then one per linked GolfAPI course, kept on the phone for 6 hours.
    var GPSK_LS = 'hardpan_gpskeys_v1', GPSK_MS = 6 * 3600 * 1000;
    function loadGpsKeys(done, again) {
        var fin = typeof done === 'function' ? done : function () {};
        if (again) { GPSK = { links: null, own: null, gc: null, asked: false }; try { W.localStorage.removeItem(GPSK_LS); } catch (e) {} }
        if (GPSK.links && GPSK.gc) { fin(); return; }
        if (!again) {
            try {
                var kept = JSON.parse(W.localStorage.getItem(GPSK_LS) || 'null');
                if (kept && kept.at && Date.now() - kept.at < GPSK_MS && kept.links && kept.gc) { GPSK.links = kept.links; GPSK.gc = kept.gc; GPSK.own = {}; C.list = null; CR.rows = null; GA.t = null; fin(); return; }
            } catch (e) {}
        }
        var d = null; try { d = W.firebase && W.firebase.database ? W.firebase.database() : null; } catch (e) { d = null; }
        if (!d || GPSK.asked) { fin(); return; }
        GPSK.asked = true;
        var one = function (path) {
            return new Promise(function (res) {
                var t = setTimeout(function () { res(null); }, 6000);
                try { d.ref(path).once('value').then(function (snap) { clearTimeout(t); res((snap && snap.val && snap.val()) || null); }, function () { clearTimeout(t); res(null); }); }
                catch (e) { clearTimeout(t); res(null); }
            });
        };
        var keys = {}, KEY_OK = /^[A-Za-z0-9_-]{1,80}$/;
        allCourses().forEach(function (c) { if (c.key && KEY_OK.test(c.key)) keys[c.key] = 1; });
        Object.keys(crShared()).forEach(function (k) { if (KEY_OK.test(k)) keys[k] = 1; });
        var links = {}, gc = {};
        Promise.all(Object.keys(keys).map(function (k) { return one('gps_links/' + k).then(function (id) { if (id && /^\d{6,30}$/.test(String(id))) links[k] = String(id); }); }))
            .then(function () {
                // A GolfAPI course set up online is its own link (gapi_<id> -> <id>): Papago.
                Object.keys(keys).forEach(function (k) { var m = /^gapi_(\d{6,30})$/.exec(k); if (m && !links[k]) links[k] = m[1]; });
                var ids = {}; Object.keys(links).forEach(function (k) { ids[links[k]] = 1; });
                return Promise.all(Object.keys(ids).map(function (id) {
                    return one('gps_courses/' + id).then(function (c) {
                        if (!c || !c.h) return;
                        var h = {}; Object.keys(c.h).forEach(function (n) { var x = c.h[n]; if (x && typeof x === 'object' && Number(n) >= 1) h[String(Number(n))] = x; });
                        gc[id] = Object.assign({}, c, { h: h });
                    });
                }));
            })
            .then(function () {
                GPSK.links = links; GPSK.gc = gc; GPSK.own = {};
                try { W.localStorage.setItem(GPSK_LS, JSON.stringify({ at: Date.now(), links: links, gc: gc })); } catch (e) {}
                C.list = null; CR.rows = null; GA.t = null; fin();
            }, function () { GPSK.links = links; GPSK.gc = gc; GPSK.own = {}; fin(); });
    }
    // ✓ GPS = WHAT THE MAP WILL DRAW (URGENT-022: one answer for the list and the map). gps-geo
    // courseGps is the map's own rule; here it reads the GolfAPI courses the phone has (the app's
    // file, every course pulled online) plus every course set up for everyone (gps_courses + the
    // gps_links to them), and ✓ only when hole 1's green is within 2 km of the course.
    var GA = { t: null, at: '' };
    function gaTable() {
        var d = W.HardPanGolfApi || {}, sig = Object.keys(d.courses || {}).length + '|' + Object.keys(GPSK.gc || {}).length + '|' + Object.keys(GPSK.links || {}).length;
        if (GA.t && GA.at === sig) return GA.t;
        var courses = {}, links = {};
        Object.keys(GPSK.gc || {}).forEach(function (id) { var c = GPSK.gc[id]; if (c && c.h) courses[id] = Object.assign({ id: id }, c); });
        Object.keys(d.courses || {}).forEach(function (id) { courses[id] = d.courses[id]; });
        Object.keys(GPSK.links || {}).forEach(function (k) { links[k] = String(GPSK.links[k]); });
        Object.keys(d.links || {}).forEach(function (k) { links[k] = d.links[k]; });
        GA.t = { courses: courses, links: links }; GA.at = sig;
        return GA.t;
    }
    function ready(key, name, loc) {
        if (!key) return false;
        var G = W.HardPanGeo;
        if (G && G.courseGps) { var rec = courseGpsRec(key, name, loc); return !!rec && G.holeOneNear(rec, loc || null); }   // the resolver's one rule
        if (live()) return !!golfapiLink(key) || /^gapi_\d+$/.test(key) || !!(GPSK.links && GPSK.links[key]);
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
                out.push({ key: i.id, name: i.name, ready: ready(i.id, i.name, coursePoint(i.id)), pt: coursePoint(i.id), state: stateOf(i.name) || (ga && ga.state) || '', city: (ga && ga.city) || '' });
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
            out.push({ key: 'gapi_' + id, name: nm, ready: ready('gapi_' + id, nm, [c.lat, c.lng]), pt: [c.lat, c.lng], state: c.state || '', city: c.city || '' });
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
        return courseList().filter(function (c) { return c.pt; }).map(function (c) { return { c: c, d: miles(here, c.pt) }; })
            .filter(function (x) { return x.d <= NEAR_MI; }).sort(function (a, b) { return a.d - b.d; }).slice(0, NEAR_MAX);
    }

    // ==== THE COURSE RESOLVER (Manny, 2026-10-20 9:3x: "ONE course resolver that every screen uses -
    // same record, tees, card and greens everywhere. Remove the per-screen lookups.") ==============
    // window.HardPanCourse - Course & Tees, NEAR YOU, search and the ✓ badge (simple-flow), Home's GPS
    // picker (here), the GPS map's course point (gps-view), the Add golfer tee rows - all read it:
    //   list()           every course, ONE ROW PER COURSE: the app's directory + its GolfAPI file + the
    //                    shared records (Round Setup's globalCourses) - a directory row beside the shared
    //                    record for the same course goes (the shared one has the tees and the card), a
    //                    GolfAPI copy of a course of ours linked to it goes (ours keeps its tees + the link)
    //   near(here, n)    list() by distance: within 25 miles, topped up from 100, n rows (default 9)
    //   resolve(key|{key,name,loc}) -> { key: the course's ONE key (an alias - the dropped twin, the
    //                    linked copy - resolves to it), name, loc, city, state, hasGps, hasCard, row }
    //   hasCard(key)     its scorecard is here (Round Setup's own presets, or the shared record)
    //   gps(key, name, loc)  the GPS record the map will draw (gps-geo courseGps) - hasGps is this AND
    //                    hole 1's green within 2 km of the course
    //   teeRows(rec)     a course record's tees as rows (name, gender, yards, rating, slope)
    var CR = { sig: '', rows: null, alias: {} };
    function crNk(n) { return String(shownName(n)).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    var CR_GEN = /\b(the|golf|club|course|country|resort|links|gc|cc)\b/g;
    function crClub(n) { return String(n || '').split('(')[0].toLowerCase().replace(CR_GEN, ' ').replace(/[^a-z0-9]/g, ''); }
    function crPart(n) { var m = /\(([^)]*)\)/.exec(String(n)); return m ? m[1].toLowerCase().replace(/[^a-z0-9]/g, '').replace(/course$/, '') : ''; }
    function crShared() { try { return typeof globalCourses !== 'undefined' && globalCourses ? globalCourses : {}; } catch (e) { return {}; } }   /* global globalCourses */
    function crTwin(a, b) {
        if (crClub(a.name) !== crClub(b.name)) return false;
        if (a.pt && b.pt && miles(a.pt, b.pt) > 0.5) return false;
        var x = crPart(a.name), y = crPart(b.name);
        return x === y || !x || !y || x.indexOf(y) !== -1 || y.indexOf(x) !== -1;
    }
    function crLoc(rec) {
        var L = rec && rec.location;
        return L && L.latitude != null && isFinite(Number(L.latitude)) && isFinite(Number(L.longitude)) ? [Number(L.latitude), Number(L.longitude)] : null;
    }
    function courseList() {
        var base = allCourses(), gc = crShared();
        // The GPS answers change when the GolfAPI courses land (the app's file, a course pulled or read
        // later, the GPS settings): part of the cache key, so an early ask never leaves them stale (022 Sun).
        var ga = W.HardPanGolfApi || {}, cfgs = W.HARDPAN_GPS_CONFIG ? 1 : 0;
        var sig = base.length + '|' + Object.keys(gc).length + '|' + Object.keys(GPSK.links || {}).length + '|' + Object.keys(GPSK.gc || {}).length + '|' + (C.list === base ? 1 : 0)
            + '|' + Object.keys(ga.courses || {}).length + '|' + Object.keys(ga.links || {}).length + '|' + cfgs + '|' + (live() ? 1 : 0) + '|' + (W.HardPanGeo ? 1 : 0);
        if (CR.rows && CR.sig === sig && CR.base === base) return CR.rows;
        var out = base.filter(function (c) { return c.key; }).map(function (c) { return Object.assign({}, c); }), have = {}, alias = {};
        out.forEach(function (c) { have[c.key] = 1; });
        Object.keys(gc).forEach(function (k) {
            var r = gc[k];
            // Any shared record the directory does not list itself (Thistle's rated pairings carry the
            // tees the 27-hole directory row lacks) - never a merged one, never one the directory names.
            if (have[k] || !r || !r.name || r.mergedInto) return;
            if (!/^(gca_|gapi_|comm_)/.test(k) && base.some(function (b) { return crNk(b.name) === crNk(r.name); })) return;
            var cov = base.filter(function (c) { return !c.key && crNk(c.name) === crNk(r.name); })[0];
            var sib = base.filter(function (b) { return b.pt && crClub(b.name) === crClub(r.name); })[0];   // a pairing: its club's place
            var pt = bundledPoint(k) || (cov && cov.pt) || crLoc(r) || (sib && sib.pt) || null;
            out.push({ key: k, name: r.name, ready: ready(k, r.name, pt), pt: pt, city: (cov && cov.city) || (r.location && r.location.city) || '', state: (cov && cov.state) || (r.location && r.location.state) || '' });
        });
        // A GolfAPI copy set up for a course of ours that is linked to it: ours is the course.
        var links = GPSK.links || {}, linked = {};
        Object.keys(links).forEach(function (k) { if ((have[k] || gc[k]) && k !== 'gapi_' + links[k]) linked[String(links[k])] = k; });   // not a GolfAPI course's link to itself
        out = out.filter(function (o) { var m = /^gapi_(\d+)$/.exec(o.key); if (m && linked[m[1]] && linked[m[1]] !== o.key) { alias[o.key] = linked[m[1]]; return false; } return true; });
        // The directory's row beside the shared record for the same course: the shared one stays.
        var SH = /^(gca_|gapi_|comm_)/;
        out = out.filter(function (e) {
            if (SH.test(e.key)) return true;
            var s2 = out.filter(function (o) { return SH.test(o.key) && crTwin(e, o); })[0];
            if (!s2) return true;
            if (!s2.ready && e.ready) s2.ready = true;
            if (!s2.pt && e.pt) s2.pt = e.pt;
            alias[e.key] = s2.key;
            return false;
        });
        CR.rows = out; CR.sig = sig; CR.base = base; CR.alias = alias;
        return out;
    }
    function courseNear(here, n) {
        if (!here) return [];
        var all = courseList().filter(function (c) { return c.pt; }).map(function (c) { return { c: c, d: miles(here, c.pt) }; })
            .filter(function (x) { return x.d <= 100; }).sort(function (a, b) { return a.d - b.d; });
        var close = all.filter(function (x) { return x.d <= 25; });
        return (close.length >= (n || 9) ? close : all).slice(0, n || 9);
    }
    function courseHasCard(key) {
        try { if (typeof coursePresets !== 'undefined' && coursePresets[key] && (coursePresets[key].data || []).length) return true; } catch (e) {}   /* global coursePresets */
        var r = crShared()[key];
        return !!(r && (r.data ? (r.data.length || Object.keys(r.data).length) : r.name));
    }
    function courseResolve(q) {
        var o = q && typeof q === 'object' ? q : { key: q };
        var rows = courseList(), key = o.key || '';
        if (CR.alias[key]) key = CR.alias[key];
        var row = rows.filter(function (c) { return c.key === key; })[0] || null;
        if (!row && o.name) row = rows.filter(function (c) { return crNk(c.name) === crNk(o.name); })[0] || null;
        var rec = crShared()[row ? row.key : key];
        var loc = (row && row.pt) || crLoc(rec) || o.loc || null;
        var name = (row && row.name) || (rec && rec.name) || o.name || '';
        return { key: row ? row.key : key, asked: o.key || '', name: name, loc: loc, city: (row && row.city) || '', state: (row && row.state) || '',
            hasGps: row ? !!row.ready : ready(key, name, loc), hasCard: courseHasCard(row ? row.key : key), row: row };
    }
    function courseGpsRec(key, name, loc) {
        var G = W.HardPanGeo, c = W.HARDPAN_GPS_CONFIG || {};
        if (!G || !G.courseGps) return null;
        var lk = null; try { var v = JSON.parse(W.localStorage.getItem('hardpan_osm_v1_' + key) || 'null'); lk = v && v.holes && Object.keys(v.holes).length ? v : null; } catch (e) {}
        return G.courseGps({ key: key, name: name || null, loc: loc || null, golfapi: (live() || !!c.golfapiFile) ? gaTable() : null, osmOn: c.osm !== false, osmTable: W.HardPanGpsCourses || {}, lookedUp: lk });
    }
    function teeRows(rec) {
        var out = [], seen = {}, arr = function (v) { return Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; }) : []; };
        var yards = function (t) { var y = Number(t && (t.totalYards != null ? t.totalYards : t.total_yards)); if (!(y > 0)) y = arr(t && t.holes).reduce(function (s, h) { return s + (Number(h && (h.yardage != null ? h.yardage : h.yards)) || 0); }, 0); return y > 0 ? Math.round(y) : 0; };
        ['male', 'female'].forEach(function (g) {
            arr(rec && rec.tees && rec.tees[g]).forEach(function (t, i) {
                if (!t || !t.name) return;
                var y = yards(t), id = String(t.name).trim().toLowerCase() + '|' + y;
                if (seen[id]) return; seen[id] = 1;
                out.push({ key: g + ':' + i, name: String(t.name).replace(/\s+tees?$/i, ''), full: String(t.name), gender: g, yards: y,
                    rating: Number(t.rating != null ? t.rating : (t.courseRating != null ? t.courseRating : t.course_rating)), slope: Number(t.slope != null ? t.slope : t.slope_rating), par: Number(t.parTotal != null ? t.parTotal : t.par) || null });
            });
        });
        return out;
    }
    W.HardPanCourse = { list: courseList, near: courseNear, resolve: courseResolve, hasCard: courseHasCard, gps: courseGpsRec, teeRows: teeRows,
        refresh: function () { C.list = null; CR.rows = null; } };
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
        ['main', 'gps', 'games', 'simple', 'history'].forEach(function (v) { var el = $('v-' + v); if (el) el.classList.toggle('on', v === view); });
        try {
            if (view === 'simple') simpleView();
            if (view === 'history') historyView();
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
            var rec = recents(), all = courseList();   // the resolver's rows (one per course)
            $('hp-recent').style.display = rec.length ? '' : 'none';
            $('hp-recent-list').innerHTML = rec.map(function (r) {
                var rv = courseResolve({ key: r.key, name: r.name }), c = rv.row || { key: rv.key, name: rv.name || r.name, ready: rv.hasGps, state: stateOf(r.name) };
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
        if (!W.HardPanGeo) needs.push('gps-geo.js');   // URGENT-022: ✓ GPS is the map's own rule (gps-geo courseGps)
        if (!W.HardPanGpsCourses) needs.push('gps-courses.js');
        // The app's GolfAPI file (in the iOS build only; a 404 on the web is fine).
        if (!W.HardPanGolfApi && !W.__fdGolfApiTried) { W.__fdGolfApiTried = 1; needs.push('gps-golfapi.js'); }
        STATES.forEach(function (s) { if (!(W.HardPanGpsCoverage && W.HardPanGpsCoverage[s])) needs.push('gps-coverage-' + s.toLowerCase() + '.js'); });
        var left = needs.length;
        draw();
        loadGpsKeys(function () { draw(); if (!left) near(); });   // 021: ✓ GPS for linked / set-green courses too
        if (!left) { near(); return; }
        needs.forEach(function (src) { loadScriptTimed(src, function () { if (--left === 0) { C.list = null; draw(); near(); } }); });
    }
    function search() {
        var inp = $('hp-q'), box = $('hp-results');
        if (!inp || !box) return;
        var raw = inp.value.trim(), q = raw.toLowerCase();
        if (q.length < 2) { box.style.display = 'none'; return; }
        // The resolver's rows, plus the OpenStreetMap-only courses the directory has no key for.
        var hits = courseList().concat(allCourses().filter(function (c) { return !c.key; })).filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1 || (c.city || '').toLowerCase().indexOf(q) !== -1; })
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
    // THIS GOLFER'S OWN HANDICAP (URGENT-017: a GPS round showed "HCP 0" for Manny, a +2.0):
    // the number this phone's golfer carried on their most recent round here ("This is me" /
    // the GPS name tag, else their first name), else the HardPan Index this phone keeps. '' if none.
    function myHcp() {
        var best = null, me = String(meName() || '').toLowerCase();
        try {
            for (var i = 0; i < W.localStorage.length; i++) {
                var k = W.localStorage.key(i), m = /^golfapp_snap_v1_(\w+)$/.exec(k || '');
                if (!m) continue;
                var o = null; try { o = JSON.parse(W.localStorage.getItem(k)); } catch (e) { o = null; }
                var ps = o && o.data && Array.isArray(o.data.players) ? o.data.players : [];
                var id = ls('golfapp_me_' + m[1]) || ls('hardpan_gps_golfer_' + m[1]);
                var p = ps.filter(function (q) { return q && id != null && String(q.id) === String(id); })[0]
                    || (me && me !== 'me' ? ps.filter(function (q) { return q && String(q.name || '').trim().split(/\s+/)[0].toLowerCase() === me; })[0] : null);
                if (!p) continue;
                var h = String(p.handicapIndex != null && String(p.handicapIndex).trim() !== '' ? p.handicapIndex : (p.hcp == null ? '' : p.hcp)).trim();
                if (!h || h === '0') continue;
                if (!best || (o.at || 0) > best.at) best = { at: o.at || 0, h: h };
            }
        } catch (e) {}
        if (best) return best.h;
        try { var I = W.HardPanIndex && W.HardPanIndex.current ? W.HardPanIndex.current() : null; if (I && I.text) return String(I.text); } catch (e) {}
        return '';
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
            stablefordPointVal: 0, groupSizeOverrides: {}, stablefordScoring: 'net',
            stablefordPoints: { other: 0, bogey: 1, par: 2, birdie: 3, eagle: 4, albatross: 5 },
            dotPointVal: 0, greenieCarryover: true, skinsBuyIn: 0, skinsCarryOver: false,
            courseData: card, startingHole: start,
            teeRating: tee,
            alohaAllowed: false, handicapBasis: 'as-entered',
            players: [{ id: 101, name: meName(), hcp: myHcp() || '0', team: 'Team 1', squad: 'red', playingForMoney: true }]
        }, extra);
    }
    function create(key, name, card, side, opts) {
        var G = W.organizerGate;
        if (!H.db || !G || typeof W.issueUniqueCode !== 'function') return Promise.reject(new Error('This screen cannot start a round right now - reload the app.'));
        var code;
        // ONE ROUND PER START (audit, 2026-10-16): a save that timed out may still land, so a second
        // tap for the same course writes the SAME code again (the same round) - never a second one.
        var held = null; try { held = JSON.parse(ss('hardpan_qs_pending') || 'null'); } catch (e) { held = null; }
        var reuse = held && held.key === key && held.name === name && Date.now() - (held.at || 0) < 10 * 60 * 1000 ? held.code : null;
        return timeout(G.ensureOrganizer(H.db), 12000, 'sign-in').then(function (uid) {
            return (reuse ? Promise.resolve(reuse) : timeout(W.issueUniqueCode({ db: H.db, root: 'events' }), 12000, 'code')).then(function (c) {
                code = c;
                ss('hardpan_qs_pending', JSON.stringify({ key: key, name: name, code: code, at: Date.now() }));
                var payload = G.stamp(roundPayload(key, name, card, opts), uid);
                return timeout(H.db.ref('events/' + code).set(payload), 15000, 'save');
            });
        }).then(function () {
            ss('hardpan_qs_pending', null);
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
        // NO GPS, REMEMBERED (URGENT-011, sims bug 6): Round Setup mints the round; the marker
        // tells admin() to set it up as a scorecard round (no "Start GPS" box) and to keep the
        // Card side for it, so START SCORING opens the card - never the GPS screen.
        ss(QUICK, JSON.stringify({ key: null, name: p.name || '', auto: false, nogps: true }));
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
            // THE SAME NINE TWICE IS SAID, NOT QUIETLY CHANGED (audit): 18 holes, that nine twice.
            var twice = L && !nineOnly && $('hp-o-front').value === $('hp-o-back').value;
            var tn = $('hp-o-twice');
            if (L && !tn) { tn = W.document.createElement('div'); tn.id = 'hp-o-twice'; tn.style.cssText = 'font-size:13px;color:#0f4c3a;font-weight:700;margin-top:6px;'; $('hp-o-back').parentNode.insertBefore(tn, $('hp-o-back').nextSibling); }
            if (tn) { tn.textContent = twice ? L[$('hp-o-front').value].name.split(' ')[0] + ' twice: 18 holes, the same nine played two times.' : ''; tn.style.display = twice ? '' : 'none'; }
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
                if (L) { opts.front = $('hp-o-front').value; opts.back = $('hp-o-back').value; }
                el.style.display = 'none';
                startRound(Object.assign({}, c, { opts: opts }));
            }
        };
        el.style.display = 'flex';
    }
    function pickCourse(key, name, row) {
        var rv = key ? courseResolve({ key: key, name: name }) : null;   // an alias -> the course's one key
        var c = (rv && rv.row) || allCourses().filter(function (x) { return x.name === name && !x.key; })[0] || { key: (rv && rv.key) || key || null, name: name };
        // A GPS round starts only with GPS Map (the gate - Near You, search and Recent alike).
        gpsGate({ key: c.key, name: c.name || name }, function () {
            startRound({ key: c.key, name: c.name || name, city: c.city || '', state: c.state || '' });
        });
    }
    // ---- THE GPS GATE ON HOME (paid launch: Manny, mailbox 007, 2026-10-17) ------------
    // ALL of GPS is the "GPS Map" subscription (a 7-day free trial, then yearly). The GPS
    // door, the GPS | Games switch's GPS, #gps / #pick and a course pick ask gps-view.js's
    // requireGps first: GPS Map -> on; none -> the paywall; "Not now" -> the golfer stays
    // where they are (Main, or Games). Games, joining and Resume of a card never ask.
    // No gate on this page (gps-view.js not loaded): on - the round's own gate (index.html)
    // still holds, so nothing GPS ever shows without GPS Map.
    function gpsGate(c, go, no) {
        var V = W.HardPanGps;
        if (!V || typeof V.requireGps !== 'function') { go(); return; }
        c = c || {};
        V.requireGps({ course: c.name || '', coverage: function (cb) { coverageOf(c.key, c.name, cb); } }, go, function () { if (typeof no === 'function') no(); });
    }
    // The course the paywall names: the round in progress, else the last course used.
    function homeCourse() {
        var lr = null; try { lr = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr = null; }
        var rec = recents();
        if (activeRound() && lr && lr.course) {
            var hit = rec.filter(function (r) { return r.name === lr.course; })[0];
            return { key: hit ? hit.key : null, name: lr.course };
        }
        return rec[0] ? { key: rec[0].key, name: rec[0].name } : {};
    }
    // HOW MANY OF ITS HOLES HAVE GPS, for "Caledonia: 18/18 ✓": the GolfAPI course this
    // app draws (GPS LIVE), else the bundled holes with a green - out of its card's holes.
    // cb(null) when nothing says (the line is left off).
    function coverageOf(key, name, cb) {
        if (!key) { cb(null); return; }
        var count = function () {
            var card = typeof coursePresets !== 'undefined' && coursePresets[key] && coursePresets[key].data ? coursePresets[key].data.length : 0;   /* global coursePresets */
            var ga = golfapiCourse(key);
            if (live()) {
                if (ga && Number(ga.holes) > 0) { var of = card || Number(ga.holes); cb({ name: name, n: Math.min(Number(ga.holes), of), of: of }); return; }
                cb(null); return;
            }
            var b = bundled(), r = b && b[key];
            if (!r || !r.holes) { cb(null); return; }
            var n = 0, top = 0;
            Object.keys(r.holes).forEach(function (h) {
                var o = r.holes[h] && (r.holes[h].osm || r.holes[h]);
                if (Number(h) > top) top = Number(h);
                if (o && ((Array.isArray(o.green) && o.green.length >= 3) || Array.isArray(o.mid))) n++;
            });
            cb({ name: name, n: n, of: card || (top > 9 ? 18 : 9) });
        };
        if (bundled()) { count(); return; }
        loadScriptTimed('gps-courses.js', function () { count(); });
    }
    function gamesView() {
        draftPaint();
        var last = ls('lastRoomCode'), trip = ls('lastTripCode');
        var today = $('hp-today'), card = $('hp-today-card');
        if (last && H.db) {
            today.style.display = '';
            card.innerHTML = '<div class="hp-status">Loading your last round…</div>';
            // SAVED ON THIS PHONE, NOT SENT YET (URGENT-009): shown from this phone's copy.
            var heldCard = function () {
                var h = heldFor(last);
                if (!h) { today.style.display = 'none'; return; }
                var hv = h.value || {};
                $('hp-today-h').textContent = 'YOUR ROUND';
                card.innerHTML = '<button type="button" class="hp-row" data-hp-open="' + esc(last) + '" style="flex-direction:column;align-items:stretch;gap:8px;">'
                    + '<span class="n" style="font-weight:800;">' + esc(String(hv.courseName || 'Round').split(' (')[0]) + '</span>'
                    + '<span class="s">' + (hv.players || []).length + ' golfer' + ((hv.players || []).length === 1 ? '' : 's') + ' \u00b7 \uD83D\uDCF4 saved on this phone, sent when you have signal</span>'
                    + '<span style="font-size:15px;font-weight:700;color:var(--hp-navy);">Open the round \u203a</span></button>';
            };
            if (heldFor(last)) heldCard();
            timeout(H.db.ref('events/' + last).once('value'), 6000, 'round').then(function (s) {
                var d = s && s.val ? s.val() : null;
                if (!d) { heldCard(); return; }
                d = withQueued(d, last);   // URGENT-036: scores still waiting count too
                var ps = d.players || [], sc = d.scores || {}, thru = 0;
                salwRow(d, last);
                thru = thruOf(d);
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
            }, heldCard);
        } else today.style.display = 'none';
        if (!last || !H.db) salwRow(null);
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
    // SAME AS LAST WEEK ON THE GAMES START (URGENT-009, 013-2). Round Setup has had the button since
    // 2026-10-05 (admin.html sameAsLastWeek: course, tees, games and money, roster with handicaps,
    // groups and flights, into a NEW code; scores never), but in the app Home is this page and the
    // lobby that holds it is never shown. Offered only to a returning organizer: lastRoomCode is
    // written when this phone SAVES a round (Round Setup, or a GPS round started here), and the round
    // must still have golfers to copy. The tap goes to Round Setup's own copier - one copier.
    function salwRow(d, code) {
        var box = $('hp-salw');
        if (!box) return;
        var ps = d && Array.isArray(d.players) ? d.players.filter(function (p) { return p && String(p.name || '').trim(); }) : [];
        if (!d || !ps.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
        box.style.display = '';
        box.innerHTML = '<button type="button" class="hp-big" data-hp-act="same" style="background:#fff;color:var(--hp-navy);border:2px solid var(--hp-navy);">\uD83D\uDD01 Same as last week</button>'
            + '<div class="hp-note" style="margin-top:6px;">' + esc(String(d.courseName || 'Your last round').split(' (')[0]) + ' \u00B7 ' + ps.length + ' golfer' + (ps.length === 1 ? '' : 's')
            + ' \u2014 same course, tees, games and money, in a new round. Handicaps editable; no scores.</div>';
        box.setAttribute('data-hp-salw', String(code || ''));
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
        if ((b = t.closest('[data-hp-door]'))) {
            var d = b.getAttribute('data-hp-door');
            if (d === 'gps') { gpsGate(homeCourse(), function () { setDoor('gps'); if (backToGpsRound()) return; show('gps'); }); return; }
            setDoor(d); show(d); return;
        }
        if (t.closest('[data-hp-retry]')) { C.asked = false; C.why = null; var nb = $('hp-near-list'); if (nb) nb.innerHTML = '<div class="hp-status">Finding courses near you\u2026</div>'; gpsView(); return; }
        if ((b = t.closest('[data-hp-course]'))) { pickCourse(b.getAttribute('data-hp-course'), b.getAttribute('data-hp-name'), b); return; }
        if ((b = t.closest('[data-hp-pull]'))) { pull({ id: b.getAttribute('data-hp-pull'), name: b.getAttribute('data-hp-pull-name') }, pending || {}); return; }
        if ((b = t.closest('[data-hp-su]'))) {
            var su = b.getAttribute('data-hp-su');
            if (su === 'nogps') playWithoutGps();
            else { setupClose(); var q = $('hp-q'); if (q) { q.value = ''; q.focus(); } search(); }
            return;
        }
        if ((b = t.closest('[data-hp-recap]'))) { W.location.href = recapHref(b.getAttribute('data-hp-recap'), b.getAttribute('data-hp-recap-g')); return; }   // URGENT-045 #4b
        if ((b = t.closest('[data-hp-hist]'))) { historyOpen(b); return; }
        if ((b = t.closest('[data-hp-open]'))) { W.location.href = roundHref(b.getAttribute('data-hp-open')); return; }
        if ((b = t.closest('[data-hp-draft]'))) { var dr = draftRead(); if (dr) W.location.href = draftHref(dr); else draftPaint(); return; }
        if ((b = t.closest('[data-hp-draft-discard]'))) { draftClear(b.getAttribute('data-hp-draft-discard')); draftPaint(); return; }
        if ((b = t.closest('[data-hp-trip]'))) { W.location.href = 'trip.html?trip=' + encodeURIComponent(b.getAttribute('data-hp-trip')); return; }
        if ((b = t.closest('[data-hp-act]'))) {
            var a = b.getAttribute('data-hp-act');
            if (a === 'code') { setDoor('games'); show('games'); var i = $('hp-code'); if (i) i.focus(); }
            else if (a === 'signin') W.location.href = 'admin.html?account=1';
            else if (a === 'start') { if (simpleOn()) { simpleAct('snew', b); return; } ss(QUICK, null); ss(SIMPLE, null); W.location.href = 'admin.html?start=quick'; }
            else if (a === 'same') { if (simpleOn()) { simpleAct('ssame', b); return; } ss(QUICK, null); ss(SIMPLE, null); W.location.href = 'admin.html?start=same'; }
            else if (a === 'build') W.location.href = 'trip.html#build';
            else if (a === 'join') join();
            else if (simpleAct(a, b)) return;
            else if (a === 'tripcode') { var tci = $('hp-trip-code'), tcv = String((tci && tci.value) || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); if (tcv.length >= 4) W.location.href = 'trip.html?trip=' + encodeURIComponent(tcv); }
        }
    }
    // WHAT WAS TYPED OR PASTED INTO "Have a game code?" (audit B8): a game code (a spectator), a
    // scorekeeper code "CODE-G-KEY", the regular app's "CODE 2" (that group's card), or a pasted
    // round link (index.html / leaderboard.html ?game=...). Returns { code, href } or null.
    function joinTarget(raw) {
        var t = String(raw || '').trim();
        var u = /[?&]game=([A-Za-z0-9]{4,10})/.exec(t);
        if (u) {
            var c = u[1].toUpperCase(), g = /[?&]group=(\d{1,2})/.exec(t), k = /[?&]sk=([A-Za-z0-9]{4,12})/.exec(t);
            if (/leaderboard\.html/i.test(t) || /[?&]spectate=1/.test(t)) return { code: c, href: 'index.html?game=' + c + '&spectate=1' };
            if (!g) return { code: c, bare: true, href: 'index.html?game=' + c + '&spectate=1' };
            return { code: c, group: g[1], sk: k ? k[1].toUpperCase() : null, href: 'index.html?game=' + c + '&group=' + g[1] + (k ? '&sk=' + k[1].toUpperCase() : '') };
        }
        var sk = /^([A-Z0-9]{4,10})\s*-\s*(\d{1,2})\s*-\s*([A-Z0-9]{4,12})$/i.exec(t);
        if (sk) return { code: sk[1].toUpperCase(), group: sk[2], sk: sk[3].toUpperCase(), href: 'index.html?game=' + sk[1].toUpperCase() + '&group=' + sk[2] + '&sk=' + sk[3].toUpperCase() };
        var grp = /^([A-Z0-9]{4,10})\s+(\d{1,2})$/i.exec(t);
        if (grp) return { code: grp[1].toUpperCase(), group: grp[2], href: 'index.html?game=' + grp[1].toUpperCase() + '&group=' + grp[2] };
        var code = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length < 4 || code.length > 10) return null;
        // A GAME CODE OPENS THE ROUND AS A SPECTATOR (view-only, with GPS); the round's own
        // organizer and golfers keep their access (the scorecard decides).
        return { code: code, bare: true, href: 'index.html?game=' + code + '&spectate=1' };
    }
    // THE CODE OF A ROUND WITH GROUPS ASKS WHICH GROUP (013 setup sims, 2026-10-18). Round Ready
    // tells the organizer "One link for the whole round - each golfer picks their group when they
    // open it. Or tell them the code: ... pick your group." - and the bare link does open the
    // scorecard's "How are you joining this round?" sheet (Keep score for Group N / I'm playing /
    // Just watching). Join turned that same code (or that same pasted link) into a read-only
    // spectator with no sheet and no way to a group: 19 golfers typing the weekly game's code
    // could not keep score. A round with more than one group now opens its own link, the sheet;
    // a one-group round still opens as a spectator (its scorekeeper is the phone that made it).
    function joinHref(j, d) {
        if (j && j.bare && groupCount(d) > 1) return 'index.html?game=' + j.code;
        return j.href;
    }
    // JOIN NEVER OPENS A ROUND IT HAS NOT CHECKED (URGENT-002, 2026-10-17). Manny pasted
    // "ABCDEF-2-K7Q9X" (no such round): the scorekeeper form (CODE-G-KEY) skipped the check and
    // went straight to the card, which said "Connecting to game..." for ever. Every form is
    // checked now - the round, its group and the scorekeeper key - and a problem is a sentence
    // here on Home, with nothing saved as the last round.
    function sha256(text) {
        try {
            if (!(W.crypto && W.crypto.subtle && W.TextEncoder)) return Promise.resolve(null);
            return W.crypto.subtle.digest('SHA-256', new W.TextEncoder().encode(String(text))).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }, function () { return null; });
        } catch (e) { return Promise.resolve(null); }
    }
    function groupCount(d) {
        var n = ((d && d.players) || []).length;
        try { if (typeof W.computeGroupBoundaries === 'function') return W.computeGroupBoundaries(n, d.groupSizeOverrides || {}).length; } catch (e) {}   /* grouping.js */
        return Math.max(1, Math.ceil(n / 4));
    }
    // null when the round can be opened this way, or what is wrong with it (a promise).
    function joinProblem(j, d) {
        if (!d || !d.players || !d.players.length) return Promise.resolve('No round with the code ' + j.code + '. Check it with whoever set it up.');
        if (j.group) {
            var g = Number(j.group), n = groupCount(d);
            if (!(g >= 1 && g <= n)) return Promise.resolve('Round ' + j.code + ' has no Group ' + j.group + (n > 1 ? ' (it has Groups 1\u2013' + n + ').' : ' (it is one group). Join with just ' + j.code + '.'));
            var want = d.scoreKeys && d.scoreKeys[String(g)];
            if (j.sk && want) return sha256(j.sk).then(function (h) { return h == null || h === want ? null : 'That scorekeeper key isn\u2019t right for Group ' + g + ' of ' + j.code + '. Ask whoever set it up for the Group ' + g + ' link.'; });
        }
        return Promise.resolve(null);
    }
    function join(inputId, msgId) {
        var i = $(inputId || 'hp-code'), msg = $(msgId || 'hp-code-msg');
        var j = joinTarget(i && i.value);
        var say = function (t, err) { if (msg) { msg.className = err ? 'hp-status hp-err' : 'hp-status'; msg.textContent = t; } };
        if (!j) { say('Type the game code (letters and numbers), or paste the round link.', true); return; }
        if (!H.db) { W.location.href = j.href; return; }
        say('Checking ' + j.code + '\u2026');
        timeout(H.db.ref('events/' + j.code).once('value'), LOAD_MS, 'join').then(function (s) {
            var d = s && typeof s.val === 'function' ? s.val() : null;
            return joinProblem(j, d).then(function (why) {
                if (why) { forgetRound(j.code, false); say(why, true); return; }
                if (j.bare) { say(''); joinAsk(j, d); return; }   // 2.0 polish #9: which group, or just watching
                W.location.href = joinHref(j, d);
            });
        }, function () {
            // No answer (no signal): a round this phone already has a copy of still opens (the
            // offline round is a feature); one it has never seen cannot - it would never load.
            if (ls('golfapp_snap_v1_' + j.code)) { var lc = j.bare ? localRound(j.code) : null; if (lc) { say(''); joinAsk(j, lc.data); return; } W.location.href = j.href; return; }
            say('Couldn\u2019t reach round ' + j.code + ' \u2014 check your signal and try again.', true);
        });
    }
    // THE GPS ROUND IN PROGRESS (Manny, 2026-10-13: GPS from Games went to "Where are you playing?").
    // The last round, from the last 12 hours and not finished (mainDecor checks the scores), opens
    // again on GPS at its hole. The course picker only without one, or from "Pick another course".
    // THRU N IN PLAY ORDER (audit, 2026-10-16): the last hole with a score along the order the round
    // is played (its start hole first), not the highest hole number - off the 10th, after 10..18
    // and 1, 2 it is "thru 2", not "thru 18".
    function thruOf(d) {
        var cd = ((d && d.courseData) || []).slice().sort(function (a, b) { return Number(a.hole) - Number(b.hole); });
        var ps = (d && d.players) || [], sc = (d && d.scores) || {}, start = Number(d && d.startingHole) || 0;
        var i = cd.map(function (h) { return Number(h.hole); }).indexOf(start);
        if (i > 0) cd = cd.slice(i).concat(cd.slice(0, i));
        var last = 0;
        cd.forEach(function (h) { if (ps.some(function (p) { return sc['p' + p.id + '_h' + h.hole]; })) last = Number(h.hole); });
        return last;
    }
    // The link that opens a round the way this phone last had it open (its role included).
    function roundHref(code) {
        var lr = null; try { lr = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr = null; }
        var h = 'index.html?game=' + encodeURIComponent(code);
        if (lr && String(lr.code) === String(code)) {
            if (lr.group) h += '&group=' + encodeURIComponent(lr.group);
            if (lr.sk) h += '&sk=' + encodeURIComponent(lr.sk);
            // A watcher resumes watching (read-only). Not this phone's OWN round: a round its organizer
            // opened by the bare code before Join asked for a group (2.0 polish #9) goes back as the
            // organizer's, not as a locked spectator view.
            if (lr.spectate && !ownRound(code)) h += '&spectate=1';
        }
        return h;
    }
    function ownRound(code) {
        try {
            var uid = (W.authBootState || {}).uid, sn = JSON.parse(ls('golfapp_snap_v1_' + String(code).toUpperCase()) || 'null');
            return !!(uid && sn && sn.data && sn.data.ownerUid && sn.data.ownerUid === uid);
        } catch (e) { return false; }
    }
    function activeRound() {
        var lr = null; try { lr = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr = null; }
        if (!lr || !lr.code || Date.now() - (lr.at || 0) > 12 * 3600 * 1000) return null;
        if (H.activeChecked && H.active !== lr.code) return null;
        return lr.code;
    }
    function backToGpsRound() {
        var code = activeRound();
        if (!code) return false;
        var open = function () { ls('hardpan_round_side', 'gps|' + code); W.location.href = roundHref(code); };
        if (!H.db || H.activeChecked) { open(); return true; }
        // ASKED FIRST (gps-trapfix): a round the server no longer has is never reopened - the
        // picker instead. No answer (no signal) still reopens it: the offline round is a feature.
        if (heldFor(code)) { open(); return true; }
        timeout(H.db.ref('events/' + code + '/players').once('value'), 5000, 'round').then(function (s) {
            if (s && typeof s.exists === 'function' && !s.exists() && !heldFor(code)) { forgetRound(code, true); show('gps'); mainDecor(); }
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
        var scode = $('hs-code');
        if (scode) scode.addEventListener('keydown', function (e) { if (e.key === 'Enter') join('hs-code', 'hs-code-msg'); });
        // EVERY LAUNCH OPENS MAIN (Manny, 2026-10-12): the last door is highlighted and a
        // round in progress offers Resume; #gps / #games are the in-app links' own.
        var h = (W.location.hash || '').replace('#', '');
        // "Pick another course" (gps-trapfix): the picker, ALWAYS, and the round it came from is
        // no longer the one Resume / the GPS door goes back to (Games › your round still has it).
        if (h === 'pick') {
            var lrp = null; try { lrp = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lrp = null; }
            if (lrp && lrp.code) forgetRound(lrp.code, false);
            show(homeView());
            gpsGate(homeCourse(), function () { setDoor('gps'); show('gps'); });
        }
        // CHANGE COURSE (URGENT-019, gps-round.js changeCourse): straight on to the GPS door's Course &
        // Tees screen for a NEW round - the hash is spent first, so Back from there is plain Home.
        else if (h === 'gpsdoor') {
            try { if (W.history && W.history.replaceState) W.history.replaceState(null, '', 'home.html'); } catch (e) {}
            show(homeView());
            if (simpleOn()) simpleAct('sgpsdoor'); else gpsGate(homeCourse(), function () { setDoor('gps'); show('gps'); });
        }
        else if (h === 'gps') { show(homeView()); gpsGate(homeCourse(), function () { if (backToGpsRound()) return; show('gps'); }); }
        else show(h === 'games' ? h : homeView());
        mainDecor();
        backFromBackground(function () { if (W.history && W.history.replaceState) W.history.replaceState(null, '', 'home.html'); show(homeView()); mainDecor(); });
        // A round saved with no signal goes up from here as soon as there is signal (URGENT-009).
        armHeld(db);
    }
    // How far a round is: thru N in play order, and finished (every golfer has every hole).
    function progressOf(d) {
        var sc = (d && d.scores) || {}, ps = (d && d.players) || [], all = true;
        ((d && d.courseData) || []).forEach(function (x) {
            var h = Number(x.hole);
            if (!ps.every(function (p) { return sc['p' + p.id + '_h' + h]; })) all = false;
        });
        var thru = thruOf(d);   // in play order (audit): off the 10th, "thru 2" after 10..18, 1, 2
        return { thru: thru, finished: !!(all && thru) };
    }
    // URGENT-036 #36 (POLISH 029 #36: Home said "Thru 4" offline, then "Thru 2" right after the
    // signal came back, until the queue had sent). The server's copy plus this phone's scores still
    // waiting in the offline queue (OfflineQueue.peek / applyQueued - read only, display only), so
    // Thru N never goes backwards while the queue sends. Nothing in the queue: the server's copy.
    function withQueued(d, code) {
        var q = oq(), s = lstore();
        if (!d || !code || !q || !s || typeof q.applyQueued !== 'function' || typeof q.peek !== 'function') return d;
        try { var ops = q.peek(s) || []; return ops.length ? (q.applyQueued(d, ops, String(code).toUpperCase()) || d) : d; } catch (e) { return d; }
    }
    // The round as THIS PHONE has it: the scorecard's stored copy plus its own unsent edits.
    function localRound(code) {
        var q = oq(), s = lstore();
        if (!q || !s || typeof q.loadSnapshot !== 'function') return null;
        try {
            var snap = q.loadSnapshot(s, code);
            if (!snap || !snap.data) return null;
            var d = snap.data;
            if (typeof q.applyQueued === 'function' && typeof q.peek === 'function') d = q.applyQueued(d, q.peek(s) || [], String(code).toUpperCase()) || d;
            if (!d.players || !d.courseData) return null;
            var pr = progressOf(d);
            return { data: d, thru: pr.thru, finished: pr.finished };
        } catch (e) { return null; }
    }
    // The last door highlighted; "Resume <course>" for a round in progress.
    function mainDecor() {
        ['gps', 'games'].forEach(function (d) {
            var c = W.document.querySelector('#v-main .hp-door.' + d);
            if (!c) return;
            c.classList.toggle('last', door() === d);
            var tag = c.querySelector('.hp-last'); if (tag) tag.style.display = door() === d ? '' : 'none';
        });
        var box0 = $('hp-resume');
        if (!box0) return;
        // A round's own Resume first, then an unsaved setup's (URGENT-009).
        box0.innerHTML = '<div id="hp-resume-round"></div><div id="hp-draft-m"></div>';
        draftPaint();
        var box = $('hp-resume-round');
        var lr = null; try { lr = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr = null; }
        if (!lr || !lr.code || Date.now() - (lr.at || 0) > 12 * 3600 * 1000) return;
        var tile = function (course, thru) {
            if (simpleOn()) return simpleProgress(lr.code, course || lr.course, thru);
            return '<button type="button" class="hp-resume" data-hp-open="' + esc(lr.code) + '">\u25B6 Resume ' + esc(String(course || lr.course || 'your round').split(' (')[0]) + (thru ? ' \u00b7 thru ' + thru : '') + '</button>';
        };
        // SAVED ON THIS PHONE, NOT SENT YET (URGENT-009): Resume at once, from this phone's own
        // copy - with no signal the read below never answers.
        var held = heldFor(lr.code);
        if (held) {
            var hv = held.value || {};
            box.innerHTML = tile(hv.courseName, 0)
                + '<div class="hp-note" style="margin:-8px 0 14px;">\uD83D\uDCF4 Saved on this phone \u00b7 it will be sent when you have signal</div>';
        }
        // THE ROUND'S OWN COPY ON THIS PHONE (URGENT-011, sims bug 2): with no signal the read
        // below never answers, so Resume is painted at once from the copy the scorecard keeps
        // (golfapp_snap_v1_<code>, with this phone's unsent scores on top) - the same copy the
        // scorecard opens offline. The server only refreshes it, or removes it when it positively
        // says the round is gone or finished; no answer leaves it standing.
        else {
            var local = localRound(lr.code);
            if (local && !local.finished) box.innerHTML = tile(local.data.courseName, local.thru);
        }
        if (!H.db) return;
        timeout(H.db.ref('events/' + lr.code).once('value'), 6000, 'round').then(function (snap) {
            var d = snap && snap.val ? snap.val() : null;
            // GONE from the server (gps-trapfix): forgotten here - no Resume, and the GPS door
            // opens the picker. Not a held round: that one is on its way (above).
            if (!d && heldFor(lr.code)) return;
            if (!d) { forgetRound(lr.code, true); if (!heldFor(lr.code)) box.innerHTML = ''; return; }
            if (!d.players || !d.courseData) return;
            d = withQueued(d, lr.code);   // URGENT-036: scores still waiting count too
            var pr = progressOf(d);
            H.activeChecked = true; H.active = pr.finished ? null : lr.code;
            if (pr.finished) { if (!heldFor(lr.code)) box.innerHTML = ''; return; }   // finished
            box.innerHTML = tile(d.courseName, pr.thru);
        }, function () {});
    }
    // ---- THIS PHONE'S ROUNDS: DATES AND HISTORY (2.0 polish #6, #7) ----------------------------
    // The day a round was first opened on this phone (the scorecard's remember, below), per code -
    // a round record carries no date of its own. A round from before this list: the time of its
    // stored copy (the last time it was open here), the best this phone knows.
    var SEEN = 'hardpan_round_seen_v1';
    function seenMap() { try { var m = JSON.parse(ls(SEEN) || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch (e) { return {}; } }
    function seenRound(code) {
        code = String(code || '').toUpperCase();
        if (!/^[A-Z0-9]{4,10}$/.test(code)) return;
        var m = seenMap();
        if (m[code]) return;
        m[code] = Date.now();
        var keys = Object.keys(m);
        if (keys.length > 200) keys.sort(function (a, b) { return m[a] - m[b]; }).slice(0, keys.length - 200).forEach(function (k) { delete m[k]; });
        ls(SEEN, JSON.stringify(m));
    }
    function roundDay(code, fallback) { return Number(seenMap()[String(code || '').toUpperCase()]) || Number(fallback) || 0; }
    // "Today", "Yesterday", "Tue Oct 13" (", 2025" when it is not this year). Never "LAST WEEK".
    function dayLabel(ts, now) {
        if (!(Number(ts) > 0)) return '';
        var d = new Date(Number(ts)), n = new Date(now || Date.now());
        var day = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
        var diff = Math.round((day(n) - day(d)) / 86400000);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return DAYS[d.getDay()] + ' ' + MON[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== n.getFullYear() ? ', ' + d.getFullYear() : '');
    }
    function golfersText(n) { return n + ' golfer' + (n === 1 ? '' : 's'); }
    function namedPlayers(d) { return d && Array.isArray(d.players) ? d.players.filter(function (p) { return p && String(p.name || '').trim(); }) : []; }
    // A finished round's result, display only (gross totals off the card - no money here):
    // one golfer "Shot 84"; more "Low: Dave 79" (ties "Low: Dave, Mike 79").
    function roundResult(d) {
        var ps = namedPlayers(d), sc = (d && d.scores) || {}, holes = ((d && d.courseData) || []).map(function (h) { return Number(h.hole); });
        var tot = ps.map(function (p) { return { name: String(p.name).trim(), t: holes.reduce(function (s, h) { return s + (Number(sc['p' + p.id + '_h' + h]) || 0); }, 0) }; }).filter(function (x) { return x.t > 0; });
        if (!tot.length) return '';
        if (ps.length === 1) return 'Shot ' + tot[0].t;
        var low = Math.min.apply(null, tot.map(function (x) { return x.t; }));
        return 'Low: ' + tot.filter(function (x) { return x.t === low; }).map(function (x) { return x.name; }).join(', ') + ' ' + low;
    }
    // One history row from a round's data (this phone's copy, or the server's).
    function historyRow(code, d, at, group) {
        var ps = namedPlayers(d), pr = progressOf(d);
        return { code: String(code).toUpperCase(), course: shownName(String((d && d.courseName) || (d && d.eventName) || 'Round ' + code).split(' (')[0]),
            at: roundDay(code, at), golfers: ps.length, names: ps.map(function (p) { return String(p.name).trim(); }),
            finished: pr.finished, thru: pr.thru, result: pr.finished ? roundResult(d) : '', group: group || null };
    }
    // EVERY ROUND THIS PHONE HAS OPENED (the scorecard keeps a copy of each: golfapp_snap_v1_<code>,
    // with this phone's unsent scores on top), newest first. Storage only - works with no signal.
    function historyList() {
        var out = [], s = lstore();
        if (!s) return out;
        try {
            for (var i = 0; i < s.length; i++) {
                var k = s.key(i);
                if (!k || k.indexOf('golfapp_snap_v1_') !== 0) continue;
                var code = k.slice('golfapp_snap_v1_'.length), snap = null;
                try { snap = JSON.parse(s.getItem(k)); } catch (e) { continue; }
                if (!snap || !snap.data || !namedPlayers(snap.data).length || !Array.isArray(snap.data.courseData)) continue;
                var lr = localRound(code);
                out.push(historyRow(code, (lr && lr.data) || snap.data, snap.at, snap.meta && snap.meta.group));
            }
        } catch (e) { /* what was read so far */ }
        out.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
        return out.slice(0, 40);
    }
    function historyRowHtml(r) {
        var sub = [dayLabel(r.at), golfersText(r.golfers)].filter(Boolean).join(' · ');
        var names = r.names.slice(0, 4).join(', ') + (r.names.length > 4 ? ' +' + (r.names.length - 4) : '');
        var state = r.finished ? 'Final' + (r.result ? ' · ' + r.result : '') : (r.thru ? 'Thru ' + r.thru : 'Not started');
        var row = '<button type="button" class="hp-row hp-hist-row" data-hp-hist="' + esc(r.code) + '" data-hp-hist-fin="' + (r.finished ? 1 : 0) + '"' + (r.group ? ' data-hp-hist-g="' + esc(r.group) + '"' : '') + '>'
            + '<span style="min-width:0;"><span class="n" style="display:block;">' + esc(r.course) + '</span>'
            + '<span class="s" style="display:block;">' + esc(sub) + '</span>'
            + '<span class="s" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(names) + '</span>'
            + '<span class="s" style="display:block;font-weight:700;color:' + (r.finished ? 'var(--hp-text)' : 'var(--hp-warn)') + ';">' + esc(state) + '</span></span>'
            + '<span class="hp-badge' + (r.finished ? '' : ' setup') + '">' + (r.finished ? 'Results ›' : 'Resume ›') + '</span></button>';
        if (!r.finished) return row;
        // URGENT-045 #4b: a finished round's SHARE RECAP, beside its row (a button may not hold a
        // button). It opens the Receipt with ?recap=1, which draws the recap and opens the share sheet.
        return '<div class="hp-hist-item" style="display:flex;gap:8px;align-items:stretch;">'
            + row.replace('class="hp-row hp-hist-row"', 'class="hp-row hp-hist-row" style="flex:1 1 auto;min-width:0;"')
            + '<button type="button" class="hp-hist-recap" data-hp-recap="' + esc(r.code) + '"' + (r.group ? ' data-hp-recap-g="' + esc(r.group) + '"' : '')
            + ' aria-label="Share recap of ' + esc(r.course) + '" style="flex:0 0 66px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:0;border-radius:16px;background:var(--hp-card);color:var(--hp-green);font:inherit;font-size:12px;font-weight:800;cursor:pointer;padding:8px 4px;">'
            + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7.5 7.5 12 3l4.5 4.5"/><path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2"/></svg>'
            + '<span>Recap</span></button></div>';
    }
    // HOME > HISTORY's share action: the finished round's Receipt, which shares its recap (?recap=1).
    function recapHref(code, g) {
        return 'settlement.html?game=' + encodeURIComponent(code) + (g ? '&group=' + encodeURIComponent(g) : '') + '&recap=1';
    }
    // HOME › HISTORY: the list, then each row refreshed from the server (a round finished on
    // another phone reads Final here). Reads only - nothing is written.
    function historyView() {
        var box = $('hp-history-list');
        if (!box) return;
        var rows = historyList();
        var paint = function () {
            box.innerHTML = rows.length ? rows.map(historyRowHtml).join('')
                : '<div class="hp-status" style="text-align:center;padding:24px 8px;">No rounds on this phone yet. Rounds you start or join show up here.</div>';
        };
        paint();
        if (!H.db) return;
        rows.forEach(function (r, i) {
            timeout(H.db.ref('events/' + r.code).once('value'), 6000, 'history').then(function (s) {
                var d = s && s.val ? s.val() : null;
                if (!d || !namedPlayers(d).length || !Array.isArray(d.courseData)) return;
                var lr = localRound(r.code);   // this phone's unsent scores stay on top
                if (lr && typeof (oq() || {}).applyQueued === 'function') { try { d = oq().applyQueued(d, oq().peek(lstore()) || [], r.code) || d; } catch (e) {} }
                var nr = historyRow(r.code, d, r.at, r.group);
                nr.at = r.at;
                rows[i] = nr; paint();
            }, function () {});
        });
    }
    function historyOpen(b) {
        var code = b.getAttribute('data-hp-hist'), g = b.getAttribute('data-hp-hist-g');
        if (b.getAttribute('data-hp-hist-fin') === '1') { W.location.href = 'settlement.html?game=' + encodeURIComponent(code) + (g ? '&group=' + encodeURIComponent(g) : ''); return; }
        var h = roundHref(code);
        if (g && !/[?&](group|spectate)=/.test(h)) h += '&group=' + encodeURIComponent(g);
        W.location.href = h;
    }

    // ---- JOIN WITH A BARE CODE ASKS WHICH GROUP (2.0 polish #9) ---------------------------------
    // A bare code (or the whole-round link) used to open a spectator view straight away - with
    // no question, and on the organizer's own phone a writable one. Now Home asks: each group with
    // its golfers' names (-> that group's card), or "Just watching" (-> ?spectate=1, read-only).
    function joinGroups(d) {
        var ps = d && Array.isArray(d.players) ? d.players : [];
        var b = [];
        try { if (typeof W.computeGroupBoundaries === 'function') b = W.computeGroupBoundaries(ps.length, (d && d.groupSizeOverrides) || {}) || []; } catch (e) { b = []; }   /* grouping.js */
        if (!b.length && ps.length) b = [{ group: 1, startIdx: 0, size: ps.length }];
        return b.map(function (x) {
            return { group: x.group, names: ps.slice(x.startIdx, x.startIdx + x.size).map(function (p) { return String((p && p.name) || '').trim(); }).filter(Boolean),
                keyed: !!(d && d.scoreKeys && d.scoreKeys[String(x.group)]) };
        });
    }
    function joinAsk(j, d) {
        var doc = W.document, el = $('hp-join-ask');
        if (!el) {
            el = doc.createElement('div'); el.id = 'hp-join-ask'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
            el.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);font-family:-apple-system,system-ui,sans-serif;';
            (doc.body || doc.documentElement).appendChild(el);
        }
        var row = 'display:flex;flex-direction:column;align-items:flex-start;gap:3px;width:100%;text-align:left;border:1px solid #d0e1db;border-radius:14px;background:#fff;padding:12px 14px;font:inherit;color:#1a1a1a;cursor:pointer;margin-top:8px;';
        var groups = joinGroups(d);
        var many = groups.length > 1;
        el.innerHTML = '<div style="width:100%;max-width:520px;box-sizing:border-box;max-height:88vh;overflow:auto;background:#f0f4f2;border-radius:18px 18px 0 0;padding:18px 16px calc(env(safe-area-inset-bottom) + 16px);">'
            + '<div style="font-size:20px;font-weight:800;color:#12392e;">Which group are you in?</div>'
            + '<div style="font-size:14px;color:#555;margin-top:4px;">' + esc(shownName(String((d && d.courseName) || '').split(' (')[0]) || 'Round') + ' · ' + esc(j.code) + '</div>'
            + groups.map(function (g) {
                return '<button type="button" data-hp-ja="' + g.group + '"' + (g.keyed ? ' data-hp-ja-keyed="1"' : '') + ' style="' + row + '">'
                    + '<span style="font-size:17px;font-weight:800;">' + (many ? 'Group ' + g.group : 'I’m in this group') + '</span>'
                    + '<span style="font-size:14px;color:#555;">' + esc(g.names.join(', ') || 'No golfers yet') + '</span>'
                    + (g.keyed ? '<span style="font-size:13px;color:#8a5a00;">Has a scorekeeper code — type ' + esc(j.code + '-' + g.group + '-CODE') + ' or open your group’s link</span>' : '')
                    + '</button>';
            }).join('')
            + '<button type="button" data-hp-ja="watch" style="' + row + '"><span style="font-size:17px;font-weight:800;">👀 Just watching</span><span style="font-size:14px;color:#555;">See the scores and the course. You can’t enter scores.</span></button>'
            + '<button type="button" data-hp-ja="cancel" style="display:block;width:100%;min-height:48px;margin-top:10px;border:0;background:none;font:inherit;font-size:16px;font-weight:700;color:#0f4c3a;cursor:pointer;">Cancel</button>'
            + '<div data-hp-ja-msg role="status" style="font-size:14px;color:#9b1c1c;min-height:0;"></div></div>';
        el.style.display = 'flex';
        el.onclick = function (ev) {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-hp-ja]') : null;
            if (!b) { if (ev.target === el) el.style.display = 'none'; return; }
            var v = b.getAttribute('data-hp-ja');
            if (v === 'cancel') { el.style.display = 'none'; return; }
            if (v === 'watch') { W.location.href = 'index.html?game=' + encodeURIComponent(j.code) + '&spectate=1'; return; }
            if (b.getAttribute('data-hp-ja-keyed') === '1') {
                var m = el.querySelector('[data-hp-ja-msg]');
                if (m) m.textContent = 'Group ' + v + ' keeps score with its own code. Type ' + j.code + '-' + v + '-<code> in Join, or open the Group ' + v + ' link from whoever set it up.';
                return;
            }
            W.location.href = 'index.html?game=' + encodeURIComponent(j.code) + '&group=' + encodeURIComponent(v);
        };
        return el;
    }

    // ---- SIMPLER HARDPAN: HOME (mailbox 017, features.simpleFlow) ---------------------
    // Four doors + Resume, from Manny's mockup (~/Desktop/claude-code-reports/017):
    //   ↻ Same as last week   (lime, big) last round's course · golfers · games -> Round Setup's own
    //                          copier (admin.html sameAsLastWeek), then the 3-step New round on Step 3
    //   + New round            the lobby's own path (createRoom), then the 3-step New round
    //   Join with a code       ONE box: CODE, CODE G, CODE-G-KEY, a link, or what a QR holds (joinTarget)
    //   📍 Just GPS (no games) the GPS course picker (GPS-1), as the GPS door
    //   IN PROGRESS            mainDecor's Resume, drawn as a card (offline from the phone's copy)
    //   More                   Trip · History · How it works · My stats
    // OFF (features.simpleFlow false, or no #v-simple): Main exactly as before. The 3-step screens
    // themselves are simple-flow.js on Round Setup; this page only marks the session for them.
    var SIMPLE = 'hardpan_simple_flow';
    function simpleOn() { try { return !!$('v-simple') && typeof W.HardPanFeature === 'function' && W.HardPanFeature('simpleFlow'); } catch (e) { return false; } }
    function homeView() { return simpleOn() ? 'simple' : 'main'; }
    function simpleGames() { try { return typeof W.HardPanFeature === 'function' && ((W.HARDPAN_GPS_CONFIG || {}).features || {}).simpleGames === true; } catch (e) { return false; } }
    function hello() {
        var h = new Date().getHours(), n = meName();
        return (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening') + (n && n !== 'Me' ? ', ' + n : '');
    }
    // The games a round plays, in a few words (Home's cards).
    function gamesOf(d) {
        var games = [];
        if (!d) return games;
        if (d.moneyPool && d.moneyPool.enabled) games.push('Weekly Game');
        if (d.gameFormat && d.gameFormat !== 'stroke') games.push(d.gameFormat.replace(/^\w/, function (x) { return x.toUpperCase(); }));
        var sm = d.sideMatches || {};
        Object.keys(sm).forEach(function (k) { var f = sm[k] && sm[k].format; var L = f === 'nassau' ? (Number(sm[k].frontStake) || Number(sm[k].backStake) ? 'Nassau' : 'Match') : f === 'hilo' ? 'Hi-Lo' : null; if (L && games.indexOf(L) === -1) games.push(L); });
        var inst = d.additionalGameInstances || {};
        Object.keys(inst).forEach(function (k) { var f = inst[k] && inst[k].format; var L = { skins: 'skins', dots: 'dots', vegas: 'Vegas', bbb: 'BBB' }[f]; if (L && games.indexOf(L) === -1) games.push(L); });
        return games;
    }
    function simpleView() {
        var v = $('v-simple');
        if (!v) return;
        // URGENT-024: the build on this phone, at the foot of Home.
        if (!$('hs-build')) { var bd = W.document.createElement('div'); bd.id = 'hs-build'; bd.style.cssText = 'text-align:center;font-size:12px;opacity:.6;margin:14px 0 4px;'; v.appendChild(bd); }
        $('hs-build').textContent = 'Build: ' + String(W.HARDPAN_BUILD || 'dev (not a build)');
        var hi = $('hs-hello'); if (hi) hi.textContent = 'HardPan';
        // GPS-1 and Games (History) get a way back to this Home.
        ['gps', 'games'].forEach(function (n) {
            var view = $('v-' + n);
            if (!view || view.querySelector('[data-hp-act="shome"]')) return;
            var b = W.document.createElement('button'); b.type = 'button'; b.className = 'hp-link'; b.setAttribute('data-hp-act', 'shome'); b.textContent = '\u2039 Home'; b.style.alignSelf = 'flex-start';
            view.insertBefore(b, view.firstChild);
        });
        // The IN PROGRESS card is mainDecor's Resume (one painter), moved here once.
        var prog = $('hs-progress'), res = $('hp-resume');
        if (prog && res && res.parentNode !== prog) prog.appendChild(res);
        var st = W.document.querySelector('[data-hs-stats]');
        if (st) st.style.display = W.HardPanGpsStats && typeof W.HardPanFeature === 'function' && W.HardPanFeature('quickStats') ? '' : 'none';
        simpleSame();
    }
    // SAME AS LAST WEEK: offered only when this phone saved a round that still has golfers (as Games').
    function simpleSame() {
        var box = $('hs-same');
        if (!box) return;
        var last = ls('lastRoomCode');
        // 2.0 POLISH #7: each round once. A round still being played is the IN PROGRESS card's
        // (Resume) - never also "Again"; one with scores but not finished has no "Again" either
        // (History has it). The label is the round's day ("Today", "Yesterday", "Tue Oct 13"),
        // never "LAST WEEK", and the count says "2 golfers".
        var lr0 = null; try { lr0 = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr0 = null; }
        var live = lr0 && lr0.code && Date.now() - (lr0.at || 0) <= 12 * 3600 * 1000 ? String(lr0.code).toUpperCase() : null;
        var paint = function (d) {
            var ps = namedPlayers(d);
            if (!d || !ps.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
            var pr = progressOf(d);
            if (!pr.finished && (pr.thru > 0 || String(last).toUpperCase() === live)) { box.innerHTML = ''; box.style.display = 'none'; return; }
            var snap = null; try { snap = JSON.parse(ls('golfapp_snap_v1_' + String(last).toUpperCase()) || 'null'); } catch (e) { snap = null; }
            var when = dayLabel(roundDay(last, (snap && snap.at) || (lr0 && String(lr0.code).toUpperCase() === String(last).toUpperCase() ? lr0.at : 0))) || 'Last round';
            var g = gamesOf(d);
            box.style.display = '';
            box.innerHTML = '<button type="button" class="hs-card hs-same-card" data-hp-act="ssame" data-hs-from="' + esc(last) + '"><span><span class="h">' + esc(when.toUpperCase()) + '</span>'
                + '<span class="n">' + esc(shownName(String(d.courseName || 'Your last round').split(' (')[0])) + ' \u00b7 ' + golfersText(ps.length) + (g.length ? ' \u00b7 ' + esc(g.join(' + ')) : '') + '</span></span><span class="go">\u21BB<br>Again</span></button>';
        };
        if (!last) { paint(null); return; }
        var local = localRound(last);
        if (local) paint(local.data);
        if (!H.db) return;
        timeout(H.db.ref('events/' + last).once('value'), 6000, 'round').then(function (s) { var d = withQueued(s && s.val ? s.val() : null, last); if (d || !local) paint(d); }, function () {});
    }
    function simpleProgress(code, course, thru) {
        return '<button type="button" class="hs-card hs-prog" data-hp-open="' + esc(code) + '"><span><span class="h">IN PROGRESS</span>'
            + '<span class="n">' + esc(shownName(String(course || 'Your round').split(' (')[0])) + ' \u00b7 ' + (thru ? 'Thru ' + thru : 'Not started') + '</span></span><span class="go">Resume \u203A</span></button>';
    }
    function simpleAct(a, b) {
        // URGENT-016: with features.simpleGames off (the default) Games & Bets is the ORIGINAL setup -
        // Round Setup's own "What are you setting up?" (Road Trip / Game Day), no session mark - and
        // Same as last week is its own copier exactly (lands on Players). On: the 3-step screens.
        if (a === 'snew') { ss(QUICK, null); if (!simpleGames()) { ss(SIMPLE, null); W.location.href = 'admin.html?start=lobby'; return true; } ss(SIMPLE, 'new'); W.location.href = 'admin.html?start=quick'; return true; }
        if (a === 'ssame') { ss(QUICK, null); ss(SIMPLE, simpleGames() ? 'same' : null); W.location.href = 'admin.html?start=same'; return true; }
        if (a === 'sjoinopen') { var jb = $('hs-join'); if (jb) { jb.style.display = jb.style.display === 'none' ? '' : 'none'; var ji = $('hs-code'); if (ji && jb.style.display === '') ji.focus(); } return true; }
        // THE GPS DOOR (URGENT-013): the one Course & Tees screen, then "Start GPS" -> the map.
        if (a === 'sgpsdoor') { gpsGate(homeCourse(), function () { setDoor('gps'); ss(QUICK, null); ss(SIMPLE, 'gps'); W.location.href = 'admin.html?start=quick'; }); return true; }
        if (a === 'sjoin') { join('hs-code', 'hs-code-msg'); return true; }
        if (a === 'sgps') { gpsGate(homeCourse(), function () { setDoor('gps'); show('gps'); }); return true; }
        if (a === 'shome') { show('simple'); mainDecor(); return true; }
        if (a === 'strip') { var t = myTrips(); W.location.href = t.length ? 'trip.html?trip=' + encodeURIComponent(t[0]) : 'trip.html#build'; return true; }
        if (a === 'shistory') { show('history'); return true; }   // 2.0 polish #6: this phone's past rounds
        if (a === 'show') { W.location.href = 'instructions.html'; return true; }
        if (a === 'sstats') {
            var S = W.HardPanGpsStats;
            if (S && typeof S.openMy === 'function' && W.HardPanGps && typeof W.HardPanGps.requireGps === 'function') W.HardPanGps.requireGps({}, function () { S.openMy(); }, function () {});
            else if (S && typeof S.openMy === 'function') S.openMy();
            return true;
        }
        return false;
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
        // URGENT-016: Home's Games & Bets door - the lobby itself ("What are you setting up?"), as it is.
        if (p.get('start') === 'lobby' && !p.get('game')) return;
        if (p.get('start') === 'quick' && !p.get('game')) {
            // AN UNSAVED SETUP WAITING (URGENT-009): asked before a new code is minted.
            draftAsk().then(function (went) { if (!went && typeof W.selectHomeWidget === 'function') W.selectHomeWidget('quick'); });
            return;
        }
        // Home > Games > Same as last week: Round Setup's own copier (checks the round, mints a NEW code,
        // lands on Players with ?copyFrom).
        if (p.get('start') === 'same' && !p.get('game')) { if (typeof W.sameAsLastWeek === 'function') W.sameAsLastWeek(W.document.getElementById('same-as-last-week')); return; }
        if (p.get('game')) {
            if (ss(QUICK)) { quickGps(); return; }
            var tpl = p.get('tpl'), paste = p.get('paste'), step = p.get('step'), fmt = p.get('fmt');
            var SO = typeof WIZARD_STEP_OF !== 'undefined' ? WIZARD_STEP_OF : { format: 3, players: 5, action: 6 };   /* global WIZARD_STEP_OF */
            if (tpl || paste || step || fmt) whenLoaded(function () {
                try {
                    if (paste && typeof W.spRoundOpen === 'function') { W.goToWizardStep(5); W.spRoundOpen(); return; }
                    if (step === 'players') {
                        W.goToWizardStep(5);
                        var nx = agNext();
                        if (nx && nx.stage === 'players' && nx.code === String(p.get('game')).toUpperCase()) agNeedBanner(nx);
                        return;
                    }
                    if (step === 'money') { W.goToWizardStep(SO.action); if (p.get('pool') === '1') agOpenPool(); return; }
                    // ALL GAMES > a round format: its card picked on the Format step.
                    if (fmt) { if (typeof W.selectFormatCard === 'function') W.selectFormatCard(fmt); W.goToWizardStep(SO.format); return; }
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
        // "Play without GPS (scorecard)" (URGENT-011, sims bug 6): this round is the Card's -
        // remembered per round the way gps-view.js reads it (hardpan_round_side 'bets|CODE'),
        // so START SCORING (and Resume) open the scorecard. Round Setup as it is, no GPS box;
        // the marker is spent, so a later page of this session is not a quick start.
        if (q.nogps) {
            var code = params().get('game');
            if (code) ls('hardpan_round_side', 'bets|' + code);
            ss(QUICK, null);
            return;
        }
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
        // THE 3-STEP NEW ROUND (017): its own share sheet instead of Round Ready.
        if (W.HardPanSimpleFlow && typeof W.HardPanSimpleFlow.afterSave === 'function' && W.HardPanSimpleFlow.afterSave(code)) return true;
        var nx = agNext();
        if (nx && nx.code === String(code).toUpperCase() && Date.now() - (nx.at || 0) < 2 * 3600 * 1000) {
            if (nx.stage === 'players') {
                // Players saved: on into the game's setup, the same round.
                nx.stage = 'game'; nx.at = Date.now(); agNext(nx);
                W.location.href = nx.next && nx.next.url ? nx.next.url : 'index.html?game=' + encodeURIComponent(code);
                return true;
            }
            if (nx.stage === 'game') {
                // The game saved: back to the round, the side and hole it was on.
                agNext(null);
                W.location.href = 'index.html?game=' + encodeURIComponent(code);
                return true;
            }
        }
        if (!ss(GO)) return false;
        ss(GO, null); ss(QUICK, null);
        ls('hardpan_round_side', 'gps|' + code);
        W.location.href = 'index.html?game=' + encodeURIComponent(code);
        return true;
    }

    // ---- THE SCORECARD (index.html) ---------------------------------------------------
    // BACK FROM A ROUND IN PROGRESS GOES HOME (URGENT-011, sims bug 5). The card is reached
    // through pages that are not "back" from it: the group picker (index.html?game=X, before
    // pickGroup added &group=N), Round Setup / Round Ready (START SCORING), the lobby that
    // minted the code. Back walked into them - "How are you joining this round?" again, then
    // Round Setup. The card now sits on a guard entry of its own: Back (history.back, the
    // Android back button through pwa-boot.js) pops to the round's base entry, and from there
    // goes Home - by history when the card was opened from Home (Resume, the GPS door), so no
    // second Home is stacked; by replace otherwise, so the setup pages are never shown again.
    function roundBackGuard(code) {
        var Hs = W.history;
        if (!Hs || typeof Hs.pushState !== 'function' || typeof Hs.replaceState !== 'function') return;
        code = String(code).toUpperCase();
        try {
            var st = Hs.state;
            // A reload of the card is already on its guard entry: nothing pushed twice.
            if (!(st && st.hpRound === code)) { Hs.replaceState({ hpRoundBase: code }, ''); Hs.pushState({ hpRound: code }, ''); }
        } catch (e) { return; }
        W.addEventListener('popstate', function (e) {
            var s = e && e.state;
            if (!s || s.hpRoundBase !== code) return;
            var ref = ''; try { ref = String(W.document.referrer || ''); } catch (x) { ref = ''; }
            if (/\/home\.html(?:[?#]|$)/.test(ref)) { try { Hs.back(); return; } catch (x) {} }
            W.location.replace('home.html');
        });
    }
    function scorecard() {
        var code = params().get('game');
        // A ROUND SAVED WITH NO SIGNAL (URGENT-009) is sent from here too, once there is signal.
        try { if (typeof db !== 'undefined') armHeld(db); } catch (e) {}   /* global db */
        if (!code || !on()) return;
        roundBackGuard(code);
        var lr = null; try { lr = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr = null; }
        // THE ROUND'S ROLE GOES WITH IT (audit B6/B7): a spectator stays a spectator, a group's
        // scorekeeper stays that group's, when Resume / the GPS door / a return from the background
        // opens the round again.
        var pr = params();
        // REMEMBERED ONLY ONCE IT LOADS (URGENT-002): a round that never arrived (no such code,
        // gone, unreadable) is never the one Resume / the GPS door / a relaunch goes back to.
        // Not here within LOAD_MS: "Round X isn't available" + Go Home, never "Connecting..." for ever.
        var remember = function () {
            seenRound(code);
            ls('hardpan_last_round', JSON.stringify({ code: code, at: Date.now(), course: lr && lr.code === code ? lr.course : '',
                spectate: pr.get('spectate') === '1' ? 1 : 0, group: pr.get('group') || null, sk: pr.get('sk') || null }));
        };
        var loaded = function () { var d = cd(); return !!(d && d.players && d.players.length); };
        if (loaded()) remember();
        else {
            var t0 = Date.now(), iv = setInterval(function () {
                if (loaded()) { clearInterval(iv); remember(); hideMissing(code); return; }
                if (Date.now() - t0 >= LOAD_MS && !(STUCK.code === String(code).toUpperCase() && STUCK.why === 'missing')) stuckRound(code, 'missing');
                if (Date.now() - t0 > 10 * 60 * 1000) clearInterval(iv);
            }, 250);
        }
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
        // Back at the round after a game's own Save: done.
        var nx = agNext();
        if (nx && nx.stage === 'game' && nx.code === String(code).toUpperCase()) agNext(null);
    }
    function placeGpsPill() {
        if (!on() || !params().get('game')) return;
        // SIMPLER HARDPAN (017, URGENT-015): the round's one bottom bar has the GPS button; this
        // heading pill would be a second one. Old flow (switch off): the pill, as before.
        // The same switch the bar reads (gps-bet.js on()), so the card never has zero GPS buttons.
        if (W.HardPanBet && typeof W.HardPanBet.on === 'function' && W.HardPanBet.on()) { var old = $('fd-gps-btn'); if (old && old.parentNode) old.parentNode.removeChild(old); return; }
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
    // Does this round have any game to show? (The GPS-3 card's rule, shared with the GPS screen's
    // "Games" button, mailbox 002b.) Plain stroke play with no stakes is "no games yet".
    function hasGames(data) {
        if (!data) return false;
        return !!((data.gameFormat && data.gameFormat !== 'stroke') || Object.keys(data.sideMatches || {}).length || Object.keys(data.additionalGameInstances || {}).length
            || (data.moneyPool && data.moneyPool.enabled) || (data.additionalGames && Object.keys(data.additionalGames).length) || data.ryderCup || data.ryderCupRef
            || Number(data.skinsBuyIn) > 0 || data.birdieGameEnabled === true || Number(data.holeBetStake) > 0);
    }
    function gpsRoundStrip(data) {
        if (!on() || !data) return '';
        if (hasGames(data)) return '';
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
        if (t.closest('.tg-add')) { openAddGame(); return; }
        if (t.closest('.fd-gps3-map') || t.closest('.fd-gps3-add')) {
            if (t.closest('.fd-gps3-add')) { openAddGame(); return; }
            if (W.HardPanGps && typeof W.HardPanGps.showSide === 'function') W.HardPanGps.showSide('gps');
        }
    });

    // ---- GPS-4 "ADD A GAME" (gps-doors-fix, Manny 2026-10-12) -------------------------
    // One sheet, from the GPS screen's + (next to the score box), its Tools menu, the
    // card's "+ Add a game" and the ≡ Round Menu:
    //   (The QUICK START tiles - "$2 a skin" and the like - are gone, URGENT-010: Manny
    //   never uses them. Every game is in ALL GAMES.)
    //   ALL GAMES    every game the betting side has, each opening its normal setup.
    //   PASTE        the whole round (Round Setup's paste), or a multi-round match /
    //                trip (the trip builder, today = Day 1, this course, these golfers).
    // Nothing here writes to Firebase: every game is saved by the screen it opens.
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
    // ENOUGH GOLFERS FIRST (URGENT-001, Manny 2026-10-17). A GPS course-tap round has one golfer
    // ("Me"): a game picked here that needs more opened its setup with nobody to put in it (KP pool
    // went straight to Money). Now a game with too few golfers opens Round Setup's Players step
    // first, with one line saying why; Players' Save carries on into that game's setup (the same
    // round code), and the game's own Save comes back to the round - the side (GPS or card) and the
    // hole are the ones the phone was on (gps-view keeps the side, the card keeps the hole).
    var AG_NEED = { kp: 2, nassau: 2, match: 2, strokebet: 2, skins: 2, vegas: 4, bbb: 2, wolf: 2, dots: 2, nines: 3, side: 2, bestball: 2, scramble: 2, ryder: 2, hilo: 4 };
    var AG_NEXT = 'hardpan_ag_next';
    function agNeed(id) { return AG_NEED[id] || 0; }
    function agGameName(id) {
        var g = ALL_GAMES.filter(function (x) { return x.id === id; })[0];
        return g ? g.name : 'the game';
    }
    function agNext(v) {
        if (v === undefined) { try { return JSON.parse(ss(AG_NEXT) || 'null'); } catch (e) { return null; } }
        ss(AG_NEXT, v ? JSON.stringify(v) : null);
        return v;
    }
    // Too few golfers for `id`? Then Players first, and `next` ({ url }) after it.
    // URGENT-018 (simpleFlow): Players first is the Add golfer sheet IN PLACE (gps-add-golfer.js) -
    // never Round Setup's steps - and `next` runs once enough golfers are in: a function (the
    // + Bet sheet, the Weekly Game sheet) or the url. Off: Round Setup's Players step, as before.
    function agPlayersFirst(id, next) {
        if (agPlayers().length >= agNeed(id)) return false;
        if (agInPlace() && W.HardPanAddGolfer && typeof W.HardPanAddGolfer.open === 'function') {
            closeAddGame();
            W.HardPanAddGolfer.open({ why: agGameName(id) + ' needs ' + agNeed(id) + ' golfers - add ' + (agNeed(id) - agPlayers().length) + ' more.', onDone: function () {
                // The round's listener lands the new golfers a moment after the write.
                var n = 0, t = setInterval(function () {
                    if (agPlayers().length >= agNeed(id) || ++n > 20) {
                        clearInterval(t);
                        if (agPlayers().length < agNeed(id)) { openAddGame(); return; }
                        if (next && typeof next.run === 'function') next.run(); else if (next && next.url) { if (/^admin\.html/.test(next.url)) agBackAfter(id); W.location.href = next.url; }
                    }
                }, 150);
            } });
            return true;
        }
        var code = agCode();
        agNext({ code: String(code).toUpperCase(), id: id, name: agGameName(id), need: agNeed(id), next: next, stage: 'players', at: Date.now() });
        W.location.href = 'admin.html?game=' + encodeURIComponent(code) + '&step=players';
        return true;
    }
    // A GAME ADDED FROM INSIDE A ROUND (012, Manny): Round Setup's Save comes back to the round -
    // the side and hole it was on (afterSave, stage 'game') - not to Round Ready.
    function agBackAfter(id) {
        var code = agCode();
        if (code) agNext({ code: String(code).toUpperCase(), id: id, stage: 'game', at: Date.now() });
    }
    // Round Setup on the Players step for a game: the line on top, and a Save that goes on.
    function agNeedBanner(nx) {
        var host = $('admin-screen');
        if (!host || $('fd-need')) return;
        var box = W.document.createElement('div');
        box.id = 'fd-need';
        // STICKY (013-19): the line and its Save stay on screen while golfers are typed below it.
        box.style.cssText = 'margin:0 0 12px; padding:12px; border:2px solid #0f4c3a; border-radius:14px; background:var(--bg-card); position:sticky; top:0; z-index:20; box-shadow:0 2px 10px rgba(0,0,0,.12);';
        box.innerHTML = '<div style="font-weight:800;font-size:1.02rem;color:#0f4c3a;">Add your golfers first, then we\u2019ll set up ' + esc(nx.name) + '.</div>'
            + '<div style="font-size:.8rem;opacity:.8;margin:4px 0 8px;">' + esc(nx.name) + ' needs ' + nx.need + ' golfers or more.</div>'
            + '<button type="button" class="btn-primary fd-need-go" style="width:100%;min-height:50px;font-weight:800;background:#0f4c3a;border-color:#0f4c3a;">Save golfers \u00b7 set up ' + esc(nx.name) + ' \u203a</button>';
        var prog = $('wizard-progress');
        if (prog && prog.parentNode) prog.parentNode.insertBefore(box, prog); else host.insertBefore(box, host.firstChild);
        var go = function () { try { if (typeof W.saveSettings === 'function') W.saveSettings(); } catch (e) { try { console.error('[front door] players first', e); } catch (x) {} } };
        box.addEventListener('click', function (ev) {
            if (!ev.target.closest('.fd-need-go')) return;
            go();
        });
        // THE BUTTON IN VIEW GOES ON TO THE GAME (013-19): after the golfers are typed, the
        // Players step's own "Next: Money" is the button on screen - it now says and does what
        // the banner's does (Save golfers · set up <game>), not a detour through Money.
        var SO = typeof WIZARD_STEP_OF !== 'undefined' ? WIZARD_STEP_OF : { players: 5 };   /* global WIZARD_STEP_OF */
        var stepEl = $('wizard-step-' + SO.players), nextBtn = stepEl && stepEl.querySelector('.wizard-btn-next');
        if (nextBtn) {
            nextBtn.textContent = 'Save golfers \u00b7 set up ' + nx.name + ' \u203a';
            nextBtn.classList.add('fd-need-next');
            nextBtn.onclick = function (ev) { if (ev) ev.preventDefault(); go(); };
        }
        // IN VIEW WHEN PLAYERS OPENS (013-13): the step opened scrolled to the player list, with
        // the line that says why - and its Save - off the top. After the step's own scroll.
        var show = function () { try { box.scrollIntoView({ block: 'start' }); } catch (e) { try { box.scrollIntoView(); } catch (x) {} } };
        show(); setTimeout(show, 350);
    }
    // The KP pool / weekly game: its section open on the Money step.
    function agOpenPool() {
        var cb = $('mp-enabled');
        if (cb && !cb.checked) cb.click();
        try { if (cb && cb.scrollIntoView) cb.scrollIntoView({ block: 'start' }); } catch (e) {}
    }
    function agSheet() {
        var el = $('fd-addgame');
        if (el) return el;
        el = W.document.createElement('div');
        el.id = 'fd-addgame'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Add a game');
        el.style.cssText = 'display:none;position:fixed;inset:0;z-index:2147483000;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#f0f4f2;color:#1a1a1a;color-scheme:light;font-family:inherit;padding:calc(env(safe-area-inset-top) + 10px) 16px calc(env(safe-area-inset-bottom) + 24px);box-sizing:border-box;';
        var st = W.document.createElement('style');
        st.textContent = '#fd-addgame *{box-sizing:border-box;} #fd-addgame .ag-h{font-size:.72rem;font-weight:800;letter-spacing:.06em;color:#5b6b64;margin:16px 0 6px;}'
            + '#fd-addgame .ag-row{display:flex;width:100%;align-items:center;gap:10px;background:#fff;border:1px solid #d0e1db;border-radius:12px;padding:10px 12px;margin:0 0 6px;text-align:left;min-height:52px;color:#1a1a1a;}'
            + '#fd-addgame .ag-row b{display:block;font-size:.95rem;} #fd-addgame .ag-row small{display:block;font-size:.74rem;color:#5b6b64;} #fd-addgame .ag-row .ag-go{margin-left:auto;color:#0f4c3a;font-weight:800;}'
            + '#fd-addgame .ag-not{width:100%;min-height:48px;margin-top:10px;border:0;background:none;color:#1d3557;font-weight:700;}';
        el.appendChild(st);
        var body = W.document.createElement('div'); body.className = 'ag-body'; el.appendChild(body);
        el.addEventListener('click', agClick);
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
        agList();
        agSheet().style.display = '';
        return true;
    }
    function closeAddGame() { var el = $('fd-addgame'); if (el) el.style.display = 'none'; }
    // TODAY'S GAMES, ON THE CARD (012, Manny): the GPS screen's Games pill lands on this card in
    // a round that has games - and there was no way to add another from it. "+ Add game" at its
    // top runs the one Add a game sheet above (Players first still applies in it). The app only
    // (this file is GPS_SHELL); never for a spectator, never twice.
    function todaysGamesAdd(mount) {
        if (!on() || !agCode() || spectating() || !mount) return;
        var card = mount.querySelector('.tg-card');
        // ONE "+ Add a game" ON THE CARD (013-14): a round with no games has the GPS-3 strip's
        // "+ Add a game" (gpsRoundStrip, the same rule) - Today's games does not add a second.
        if (card && !hasGames(agRound())) { var old = card.querySelector('.tg-add'); if (old) old.parentNode.removeChild(old); return; }
        if (!card || card.querySelector('.tg-add')) return;
        var b = W.document.createElement('button');
        b.type = 'button'; b.className = 'tg-add';
        b.textContent = '+ Add game';
        b.style.cssText = 'display:block;width:100%;min-height:44px;margin:0 0 8px;border-radius:12px;border:0;background:#0f4c3a;color:#ffffff;font-weight:800;font-size:.95rem;cursor:pointer;';
        card.insertBefore(b, card.firstChild);
    }
    function agList() {
        var ps = agPlayers();
        var h = agHead('Add a game', 'To this round · your scores carry over', 'close')
            + '<div class="ag-h">PLAYING</div><div style="font-weight:700;">' + (ps.length ? esc(ps.map(function (p) { return first(p.name); }).join(' · ')) : 'Just you so far') + '</div>'
            + '<div class="ag-h">PASTE</div>'
            + '<button type="button" class="ag-row" data-ag-go="paste"><span>📋</span><span><b>Paste the whole round</b><small>Groups, teams and games from one text</small></span><span class="ag-go">›</span></button>'
            + '<button type="button" class="ag-row" data-ag-go="trip"><span>🗓️</span><span><b>Paste a multi-round match / trip</b><small>Today is Day 1 · this course · these golfers</small></span><span class="ag-go">›</span></button>'
            + '<div class="ag-h">ALL GAMES</div>'
            + ALL_GAMES.map(function (g) { return '<button type="button" class="ag-row" data-ag-all="' + g.id + '"><span>' + g.ico + '</span><span><b>' + esc(g.name) + '</b><small>' + esc(g.sub) + '</small></span><span class="ag-go">›</span></button>'; }).join('')
            + '<button type="button" class="ag-not" data-ag="close">Not now · back to the round</button>';
        agSheet().querySelector('.ag-body').innerHTML = h;
        agSheet().scrollTop = 0;
    }
    function agRoute(g) {
        var code = agCode(), base = '?game=' + encodeURIComponent(code);
        // &hpback=1 (URGENT-009, 013-5): Side Matches' Save goes back to the round it came from.
        if (g.go === 'sm') return 'sidematches.html' + base + '&add=1' + (g.fmt ? '&fmt=' + g.fmt : '') + '&hpback=1';
        if (g.go === 'smlist') return 'sidematches.html' + base;
        if (g.go === 'tpl') return 'admin.html' + base + '&tpl=' + g.tpl;
        if (g.go === 'fmt') return 'admin.html' + base + '&fmt=' + g.fmt;
        if (g.go === 'step') return 'admin.html' + base + '&step=' + g.step + (g.id === 'kp' ? '&pool=1' : '');
        if (g.go === 'points') return 'points.html' + base + '&setup=1';
        return null;
    }
    // IN PLACE (URGENT-018): the simple flow's sheets are here (gps-bet.js on).
    function agInPlace() { var B = W.HardPanBet; return !!(B && typeof B.on === 'function' && B.on()); }
    var AG_BET = { nassau: 'nassau', match: 'match', strokebet: 'stroke', skins: 'skins', hilo: 'hilo', side: '' };
    function agSheetFor(id) {
        if (!agInPlace()) return null;
        var B = W.HardPanBet;
        if (id === 'kp' && typeof B.openWeekly === 'function') return function () { B.openWeekly({ turnOn: true }); };
        if (AG_BET[id] !== undefined && (id !== 'hilo' || (typeof B.hiloHere === 'function' && B.hiloHere()))) return function () { B.open(AG_BET[id] || null); };
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
        if ((b = t.closest('[data-ag]'))) { var a = b.getAttribute('data-ag'); if (a === 'close') closeAddGame(); else agList(); return; }
        if ((b = t.closest('[data-ag-go]'))) { var go = b.getAttribute('data-ag-go'); if (go === 'trip') agTrip(); else W.location.href = 'admin.html?game=' + encodeURIComponent(agCode()) + '&paste=1'; return; }
        if ((b = t.closest('[data-ag-all]'))) {
            var g = ALL_GAMES.filter(function (x) { return x.id === b.getAttribute('data-ag-all'); })[0];
            if (!g) return;
            if (g.go === 'trip') { agTrip(); return; }
            // URGENT-018 (simpleFlow): a game a sheet can do opens that sheet over the round - the
            // + Bet sheet (Nassau, Match, Stroke play, Skins, Hi-Lo) or the Weekly Game sheet -
            // never Round Setup's wizard (its Money step) or another page.
            var sheet = agSheetFor(g.id);
            if (sheet) {
                if (agPlayersFirst(g.id, { run: sheet })) return;
                closeAddGame(); sheet(); return;
            }
            var url = agRoute(g);
            if (url && agPlayersFirst(g.id, { url: url })) return;
            if (url && /^admin\.html/.test(url)) agBackAfter(g.id);
            if (url) W.location.href = url;
            return;
        }
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
                + 'html.hp-spectating .score-input-wrapper input:not([disabled]),html.hp-spectating #hp-card-bet .hp-bar-score{display:none !important;}'
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
        // SAVED ON THIS PHONE AND NOT SENT YET (URGENT-009): the server not having it is not
        // "gone" - it is the round this phone is about to send. Never forgotten, never dropped.
        if (heldFor(code)) return;
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
        if (why === 'missing') {
            // Never the round the doors go back to - but nothing queued is dropped: a slow first
            // load that arrives after all keeps every score typed meanwhile.
            forgetRound(code, false);
            var sd0 = String(ls('hardpan_round_side') || '');
            if (sd0 === 'gps|' + code || sd0 === 'bets|' + code) ls('hardpan_round_side', null);
            if (String(ls('lastRoomCode') || '').toUpperCase() === code) ls('lastRoomCode', null);
            missingSheet(code);
            return;
        }
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
    // 'missing' (URGENT-002): the round never arrived - no such code, gone, or unreadable from here.
    function missingSheet(code) {
        var d = W.document, el = $('hp-stuck-round');
        if (!el) {
            el = d.createElement('div'); el.id = 'hp-stuck-round'; el.setAttribute('role', 'alertdialog');
            el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);font-family:-apple-system,system-ui,sans-serif;color-scheme:light;';
            (d.body || d.documentElement).appendChild(el);
        }
        var btn = 'display:block;width:100%;min-height:52px;border-radius:14px;font-weight:800;font-size:1.05rem;margin-top:10px;';
        var off = typeof navigator !== 'undefined' && navigator.onLine === false;
        el.innerHTML = '<div style="width:100%;max-width:520px;box-sizing:border-box;background:#fff;color:#1a1a1a;border-radius:18px 18px 0 0;padding:20px 16px calc(env(safe-area-inset-bottom) + 16px);">'
            + '<div style="font-weight:800;font-size:1.15rem;color:#9b1c1c;">\u26A0\uFE0F Round ' + esc(code) + ' isn\u2019t available</div>'
            + '<div style="font-size:.95rem;margin-top:8px;line-height:1.4;">' + (off ? 'This phone has no signal and has never opened this round, so there is nothing to show yet.' : 'There is no round with that code, or it could not be read. Check the code with whoever set it up.') + '</div>'
            + '<button type="button" data-hp-home style="' + btn + 'border:0;background:#0f4c3a;color:#fff;">Go Home</button>'
            + '<button type="button" data-hp-retry style="' + btn + 'border:1px solid #0f4c3a;background:#fff;color:#0f4c3a;">Try again</button>'
            + '</div>';
        el.style.display = 'flex';
        el.querySelector('[data-hp-home]').onclick = function () { var to = on() ? 'home.html' : 'admin.html'; try { W.location.replace(to); } catch (e) { W.location.href = to; } };
        el.querySelector('[data-hp-retry]').onclick = function () { try { W.location.reload(); } catch (e) {} };
    }
    // The round arrived after all (a slow first load): the sheet goes, and it is remembered.
    function hideMissing(code) {
        if (!(STUCK.code === String(code).toUpperCase() && STUCK.why === 'missing')) return;
        STUCK.code = null; STUCK.why = null;
        var el = $('hp-stuck-round'); if (el) el.style.display = 'none';
    }
    // Exit: the round is forgotten here (and its unsendable changes), then the course picker.
    function exitRound(code, gone) {
        // GONE: nothing queued for it can ever land - its copy and its queue go. REFUSED: only the refused
        // change was dropped (index.html); the golfer's other unsent scores stay queued (audit 2026-10-16).
        forgetRound(code, !!gone);
        if (gone) ls('golfapp_snap_v1_' + String(code).toUpperCase(), null);
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
        // index.html redraws this mount: keep "Share" there. ONE observer per mount (audit 2026-10-16:
        // one was added on every redraw, so a round collected hundreds).
        if (!m.__hpShareObs) {
            try { m.__hpShareObs = new MutationObserver(function () { if (m.getAttribute('data-hp-share') !== '1' || !m.querySelector('[data-hp-share-open]')) { m.removeAttribute('data-hp-share'); placeShareButton(); } }); m.__hpShareObs.observe(m, { childList: true }); } catch (e) {}
        }
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
        var made = null;
        sha256(key).then(function (hash) { made = hash; return d0.ref('events/' + code + '/scoreKeys/' + g).set(hash); }).then(function () {
            // The local copy holds the HASH, as the server does (audit 2026-10-16: it held 'set', so a
            // phone locked to that group judged its own code wrong until the next snapshot).
            SH.keys[g] = key; var d = cd(); if (d) { d.scoreKeys = Object.assign({}, d.scoreKeys || {}); d.scoreKeys[String(g)] = made; }
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
    // ---- A ROUND SAVED WITH NO SIGNAL IS KEPT ON THIS PHONE (URGENT-009, 013-1) ----------
    // Round Setup's Save is one update() the SDK holds in memory: killed before the signal came
    // back, the whole round was gone. Now Save writes the round to the durable queue
    // (offline-queue.js, golfapp_wq_v1) FIRST - one op, events/<code>, coalesced on
    // "round-setup:<code>" so a second Save of the same round replaces it in place - plus the
    // round's stored copy (what Resume and an offline scorecard open) and the Resume pointer.
    // It leaves the queue only when the server confirms it: Round Setup's own save (page still
    // open), or sendHeld() here (Home, the scorecard) once there is signal. The SAME code and the
    // same values each time, so a second send rewrites the same round - never a second round.
    // sendHeld, not the scorecard's drain, sends it: a round's first write needs the organizer
    // gate (organizers/<uid>/firstSeenAt, then ownerUid), which a plain replay does not do.
    var HELD = 'round-setup:', HELD_META = 'hardpan_held_rounds_v1';
    function oq() { return W.OfflineQueue || null; }
    function lstore() { try { return W.localStorage; } catch (e) { return null; } }
    function heldMeta(m) {
        if (m !== undefined) { ls(HELD_META, JSON.stringify(m)); return m; }
        try { var v = JSON.parse(ls(HELD_META) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
    }
    function isHeldOp(op) { return !!(op && typeof op.coalesceKey === 'string' && op.coalesceKey.indexOf(HELD) === 0); }
    function heldOps() { var q = oq(), s = lstore(); if (!q || !s) return []; try { return (q.peek(s) || []).filter(isHeldOp); } catch (e) { return []; } }
    function heldFor(code) { var k = HELD + String(code || '').toUpperCase(); return heldOps().filter(function (op) { return op.coalesceKey === k; })[0] || null; }
    function tidyHeld() { var m = heldMeta(), live = {}, ch = false; heldOps().forEach(function (op) { live[op.coalesceKey.slice(HELD.length)] = 1; }); Object.keys(m).forEach(function (c) { if (!live[c]) { delete m[c]; ch = true; } }); if (ch) heldMeta(m); }
    // o: { uid, exists, ownerUid } - what Round Setup knows of this round (organizer-gate stamp).
    function holdRound(code, payload, o) {
        var q = oq(), s = lstore(), G = W.organizerGate;
        code = String(code || '').toUpperCase();
        o = o || {};
        if (!q || !s || !code || !payload) return null;
        var value;
        try { value = JSON.parse(JSON.stringify(payload)); } catch (e) { return null; }
        if (o.uid && !value.ownerUid && G && typeof G.stamp === 'function') G.stamp(value, o.uid, { exists: !!o.exists, ownerUid: o.ownerUid || null });
        var op = null;
        try { op = q.enqueue(s, { path: 'events/' + code, type: 'update', value: value, coalesceKey: HELD + code }); } catch (e) { op = null; }
        // STORAGE FULL (or refused): not held, and the caller says nothing it cannot keep.
        if (!op || !heldFor(code)) return null;
        var m = heldMeta(); m[code] = { at: Date.now(), exists: !!o.exists, ownerUid: o.ownerUid || null, course: value.courseName || '', golfers: (value.players || []).length }; heldMeta(m);
        try {
            var prev = q.loadSnapshot(s, code);
            q.saveSnapshot(s, code, q.applyQueued((prev && prev.data) || {}, [op], code), (prev && prev.meta) || null);
        } catch (e) {}
        ls('lastRoomCode', code);
        var lr = null; try { lr = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr = null; }
        if (lr && String(lr.code || '').toUpperCase() === code) { lr.at = Date.now(); if (!lr.course) lr.course = value.courseName || ''; }
        else lr = { code: code, at: Date.now(), course: value.courseName || '' };
        ls('hardpan_last_round', JSON.stringify(lr));
        draftClear(code);   // saved: no longer a draft (URGENT-009, 013-9)
        return op;
    }
    // Round Setup's own write landed: the held copy has done its job.
    function heldLanded(code, op) { var q = oq(), s = lstore(); if (q && s && op) { try { q.confirm(s, op.id, op.v); } catch (e) {} } tidyHeld(); }
    // The server REFUSED the round (Round Setup says why): nothing to send later, and no Resume
    // for a round that does not exist. A round that was already on the server keeps its copy.
    function heldRefused(code, op) {
        code = String(code || '').toUpperCase();
        var meta = heldMeta()[code] || {};
        heldLanded(code, op);
        if (!meta.exists) {
            ls('golfapp_snap_v1_' + code, null);
            var lr = null; try { lr = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr = null; }
            if (lr && String(lr.code || '').toUpperCase() === code) ls('hardpan_last_round', null);
        }
    }
    var sendingHeld = false;
    function sendHeld(db) {
        var q = oq(), s = lstore(), G = W.organizerGate;
        if (sendingHeld || !q || !s || !db || typeof db.ref !== 'function') return Promise.resolve(null);
        if (!heldOps().length) return Promise.resolve(null);
        // An offline write never settles (offline-queue.js): not while the phone says it has nothing.
        if (W.navigator && W.navigator.onLine === false) return Promise.resolve(null);
        sendingHeld = true;
        return q.drain(s, function (op) {
            var code = String(op.path).replace(/^events\//, '');
            var meta = heldMeta()[code] || {};
            var v = JSON.parse(JSON.stringify(op.value || {}));
            var go = function (uid) {
                if (uid && !v.ownerUid && G && typeof G.stamp === 'function') G.stamp(v, uid, { exists: !!meta.exists, ownerUid: meta.ownerUid || null });
                return db.ref(op.path).update(v);
            };
            return (G && typeof G.ensureOrganizer === 'function') ? G.ensureOrganizer(db).then(go) : go(null);
        }, { timeoutMs: 15000, only: isHeldOp }).then(function (r) {
            sendingHeld = false; tidyHeld();
            // The scorecard's own queue (scores typed on the held round) can follow it now.
            if (r && r.sent) { try { W.dispatchEvent(new W.CustomEvent('hardpan:held-sent', { detail: r })); } catch (e) {} }
            return r;
        }, function () { sendingHeld = false; return null; });
    }
    // WHEN: now, when the socket or the OS says the signal is back, and every 20 s while anything
    // is held (only then - a timer that never stops is a battery cost and a test that never ends).
    var heldArmed = false, heldTimer = null;
    function armHeld(db) {
        if (!db || !heldOps().length) return;
        var kick = function () {
            sendHeld(db).then(function () {
                if (!heldOps().length) { if (heldTimer) { clearInterval(heldTimer); heldTimer = null; } return; }
                if (!heldTimer) heldTimer = setInterval(function () { if (!heldOps().length) { clearInterval(heldTimer); heldTimer = null; return; } sendHeld(db); }, 20000);
            });
        };
        if (!heldArmed) {
            heldArmed = true;
            try { W.addEventListener('online', kick); } catch (e) {}
            try { db.ref('.info/connected').on('value', function (snap) { if (snap && typeof snap.val === 'function' && snap.val() === true) kick(); }); } catch (e) {}
        }
        setTimeout(kick, 800);
    }

    // ---- AN UNSAVED SETUP IS KEPT ON THIS PHONE (URGENT-009, 013-9) -------------------------
    // Round Setup keeps the record its Save would write (course, golfers, groups, flights, games)
    // as a draft while it is being built: a kill, Home -> GPS -> Games, or "<- Back" no longer
    // throws it away. One draft - the round being set up - for a day. Home and Games ask
    // "Resume your unsaved round setup?"; so does Start a round.
    var DRAFT = 'hardpan_setup_draft_v1', DRAFT_MS = 24 * 3600 * 1000;
    function draftRead() {
        var d = null; try { d = JSON.parse(ls(DRAFT) || 'null'); } catch (e) { d = null; }
        if (!d || !d.code || !d.record || Date.now() - (d.at || 0) > DRAFT_MS) return null;
        if (heldFor(d.code)) return null;   // saved since: a round, not a draft
        return d;
    }
    function draftKeep(d) { if (d && d.code) ls(DRAFT, JSON.stringify(Object.assign({}, d, { code: String(d.code).toUpperCase(), at: Date.now() }))); }
    function draftClear(code) { var d = null; try { d = JSON.parse(ls(DRAFT) || 'null'); } catch (e) { d = null; } if (!code || !d || String(d.code).toUpperCase() === String(code).toUpperCase()) ls(DRAFT, null); }
    function draftHref(d) { return 'admin.html?game=' + encodeURIComponent(d.code) + '&draft=1'; }
    function draftLine(d) {
        var bits = [];
        if (d.course) bits.push(String(d.course).split(' (')[0]);
        if (d.golfers) bits.push(d.golfers + ' golfer' + (d.golfers === 1 ? '' : 's'));
        return bits.join(' \u00b7 ');
    }
    function draftHtml(d) {
        var line = draftLine(d);
        return '<div class="hp-draft" style="margin:0 0 14px;">'
            + '<button type="button" class="hp-resume hp-draft-resume" data-hp-draft="' + esc(d.code) + '" style="margin:0;">\u25B6 Resume your unsaved round setup?'
            + (line ? '<span style="display:block;font-weight:600;font-size:13px;margin-top:3px;">' + esc(line) + '</span>' : '') + '</button>'
            + '<button type="button" class="hp-link muted" data-hp-draft-discard="' + esc(d.code) + '" style="display:block;margin:2px auto 0;">Discard it</button></div>';
    }
    // Home: inside #hp-resume (under a round's own Resume). Games: above YOUR ROUND.
    function draftPaint() {
        var d = draftRead();
        var m = $('hp-draft-m'), g = $('hp-draft-g'), today = $('hp-today');
        if (m) m.innerHTML = d ? draftHtml(d) : '';
        if (!g && today && today.parentNode) { g = W.document.createElement('div'); g.id = 'hp-draft-g'; today.parentNode.insertBefore(g, today); }
        if (g) g.innerHTML = d ? draftHtml(d) : '';
    }
    // Start a round with a draft waiting: asked first. Resolves true when it went to the draft.
    function draftAsk() {
        var d = draftRead();
        if (!d || typeof W.uiConfirm !== 'function') return Promise.resolve(false);
        var line = draftLine(d);
        return W.uiConfirm({ title: 'Resume your unsaved round setup?', body: (line ? line + '. ' : '') + 'It was never saved - it is kept on this phone.',
            confirmText: 'Resume it', cancelText: 'Start a new one', danger: false }).then(function (yes) {
            if (yes) { W.location.href = draftHref(d); return true; }
            draftClear(d.code);
            return false;
        }, function () { return false; });
    }

    W.HardPanDoors = { dayLabel: dayLabel, historyList: historyList, recapHref: recapHref, joinGroups: joinGroups, seenRound: seenRound, roundResult: roundResult, hasGames: hasGames, thruOf: thruOf, joinTarget: joinTarget, joinHref: joinHref, joinProblem: joinProblem, roundHref: roundHref, stuckRound: stuckRound, forgetRound: forgetRound, spectatorMode: spectatorMode, spectating: spectating, openShare: openShare, myTrips: myTrips, rememberTrip: rememberTrip, golfapiPlace: golfapiPlace, activeRound: activeRound, stuck: stuck, LOC_MS: LOC_MS, LOAD_MS: LOAD_MS, LAUNCH_MS: LAUNCH_MS, ALL_GAMES: ALL_GAMES, openAddGame: openAddGame, closeAddGame: closeAddGame, todaysGamesAdd: todaysGamesAdd, playersFirst: agPlayersFirst, AG_NEED: AG_NEED, tripPrefill: tripPrefill, placeMenuItems: placeMenuItems, placeGpsPill: placeGpsPill, door: door, setDoor: setDoor, on: on, afterSave: afterSave, recents: recents, addRecent: addRecent, gpsRoundStrip: gpsRoundStrip, allCourses: allCourses, miles: miles, ready: ready,
        position: position, nearList: nearList, shownName: shownName, where: where, meName: meName, myHcp: myHcp, loadScriptTimed: loadScriptTimed, STATES: STATES, gamesOf: gamesOf, simpleOn: simpleOn,
        draftRead: draftRead, draftKeep: draftKeep, draftClear: draftClear, draftHref: draftHref,
        // URGENT-028: the round in progress as this phone has it (Start Round asks before replacing a scored one).
        localRound: localRound, progressOf: progressOf,
        // URGENT-019: the course list is worked out once; a page that loads the GPS course files after
        // that (simple-flow's Course & Tees) asks for it again, as the GPS-1 picker does (C.list = null).
        refreshCourses: function () { C.list = null; CR.rows = null; }, loadGpsKeys: loadGpsKeys, gpsLinks: function () { return GPSK.links || {}; },
        holdRound: holdRound, heldFor: heldFor, isHeldOp: isHeldOp, heldLanded: heldLanded, heldRefused: heldRefused, sendHeld: sendHeld, armHeld: armHeld,
        roundBackGuard: roundBackGuard };
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
    // THE GPS DOOR NEVER SHOWS THE LOBBY (URGENT-016, Manny on the Cmd+R build: GPS flashed the old
    // "HARDPAN / What are you setting up?" before "Where are you playing?"). The door goes Home ->
    // admin.html?start=quick (the lobby's own createRoom mints the code) -> admin.html?game=CODE,
    // where simple-flow.js paints its screen. Both pages are covered from <head> - before their
    // first paint - with the screen's own background and title; only simple-flow's screen (#sf) and
    // the app's own dialogs (the unsaved-setup question) show through. simple-flow.js lifts it
    // once its screen is up; if the hop stalls (no signal), the page shows again after 8 s.
    (function gpsCover() {
        try {
            var path = String(W.location.pathname || ''), p = params(), m = ss(SIMPLE), mode = m;
            // URGENT-019: Change course hops through Home (home.html#gpsdoor) - covered the same way.
            if (/home\.html$/.test(path) && W.location.hash === '#gpsdoor') { m = 'gps'; mode = 'gps'; p = { get: function (k) { return k === 'start' ? 'quick' : null; } }; }
            else if (!/admin\.html$/.test(path) || !m) return;
            try { var o = JSON.parse(m); if (o && o.mode) { mode = o.mode; if (o.code && p.get('game') && String(p.get('game')).toUpperCase() !== o.code) return; } } catch (e) {}
            if (mode !== 'gps' || !(p.get('game') || p.get('start') === 'quick')) return;
            var D = W.document, st = D.createElement('style');
            st.id = 'sf-pre-css';
            st.textContent = 'html.sf-pre,html.sf-pre body{background:#f2f4ef!important}'
                + 'html.sf-pre body>*:not(#sf):not(#ui-sheet):not(#ui-toast-wrap){visibility:hidden!important}'
                + 'html.sf-pre body::before{content:"Where are you playing?";position:fixed;left:16px;right:16px;top:calc(env(safe-area-inset-top) + 64px);'
                + 'font:800 25px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#13241d;max-width:488px;margin:0 auto}';
            (D.head || D.documentElement).appendChild(st);
            D.documentElement.classList.add('sf-pre');
            setTimeout(function () { D.documentElement.classList.remove('sf-pre'); }, 8000);
            // The code-minting hop is never a place to come back to: Back onto it goes Home.
            if (!p.get('game')) W.addEventListener('pageshow', function (ev) { if (ev.persisted) W.location.replace('home.html'); });
        } catch (e) {}
    })();
    if (W.document && !/home\.html$/.test(String(W.location.pathname || ''))) {
        if (W.document.readyState === 'loading') W.document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
    }
})();
