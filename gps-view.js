// ============================================================================
// HARDPAN GPS - THE GPS SIDE OF THE ROUND SCREEN (gps-v1, 2026-10-06)
//
// HardPan only (GPS_ENABLED=1; see tools/gps-flag.js). The round screen has
// two sides and a "📍 GPS | 💰 Bets" toggle at the bottom:
//
//   💰 Bets   the existing scorecard and bets, untouched.
//   📍 GPS    this file: the hole on satellite, the golfer's blue dot, BIG
//             FRONT / CENTER / BACK, and a draggable target crosshair with
//             "You → here" and "Here → center".
//
// BOTH SIDES STAY LOADED. The GPS side is mounted once per round and shown or
// hidden - never torn down - so the map, the target and the scorecard's scroll
// position survive any number of switches. The hole is shared: Prev/Next on
// either side moves both (the scorecard owns the hole; this side follows it).
// The last side used is remembered on the phone.
//
// The numbers come from gps-geo.js. This file owns the screen, the map and the
// location watch - and the promises made about them:
//
//   BATTERY   watchPosition (high accuracy) runs while the GPS side is showing,
//             and for 60 s after switching to Bets (a golfer flicking back and
//             forth should not wait for a new fix), then stops. Showing GPS
//             starts it again. The app going to the background stops it AT
//             ONCE, whichever side is up; coming back restarts it only if the
//             GPS side is the one showing.
//   PRIVACY   the golfer's position never leaves the phone. It lives in one
//             variable (`fix`), becomes yardages, and is drawn. It is never
//             written to Firebase, localStorage, a URL or a request. What this
//             side writes: GREEN pins (a point the golfer TAPPED), the units
//             preference and the last side used. The map is framed on the hole
//             and the tile pre-cache is sized from course data, so imagery
//             requests describe the course, not the golfer (one exception: a
//             hole with no data at all, framed on the dot so the green can be
//             tapped - docs/gps-step0.md).
//   HONESTY   accuracy as coords.accuracy says it ("±5 yds"); worse than ±15
//             yds says "Weak GPS". Permission denied says so and how to fix it,
//             on the GPS side only. The Bets side cannot be affected.
//
// IMAGERY (docs/gps-step0.md). Online with a key: Esri World Imagery, free tier
// (no payment method on the account, by decision - past the free tier Esri
// simply stops answering, and this side falls back to USGS). Always underneath,
// and the whole picture when Esri is absent: USGS Imagery Only, public domain,
// native to z16, read from the phone's cache first. When a round opens with
// signal, the USGS tiles for the course area are pre-cached; Esri tiles never
// are (Esri's terms forbid it).
//
// ROTATION: north-up. Leaflet 1.9 cannot rotate a map; the only rotation is a
// third-party plugin that patches Leaflet's core pointer and drag handling -
// the exact code the draggable target depends on - and it cannot be proven on
// an iPhone from here. See docs/gps-step0.md section 7.
// ============================================================================

(function () {
    'use strict';

    var G = (typeof window !== 'undefined' && window.HardPanGeo) || null;
    var UNITS_KEY = 'hardpan_gps_units';
    var SIDE_KEY = 'hardpan_round_side';
    var CACHE_PREFIX = 'hardpan_gps_course_v1_';
    var IDLE_STOP_MS = 60000;

    // ---- IMAGERY -----------------------------------------------------------
    var TILES = {
        keyedUrl: 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token={key}',
        maxNativeZoom: 19,
        maxZoom: 21,
        // Esri: "Powered by Esri" on the map, plus the service's own data credits,
        // read at runtime from its copyrightText because they change (Maxar became
        // Vantor in 2026). fallbackCredit is what the service said on 2026-10-06.
        poweredBy: 'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>',
        metaUrl: 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer?f=json&token={key}',
        fallbackCredit: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
        // USGS Imagery Only: public domain (USDA NAIP via The National Map), no key,
        // no account. Native to z16 - the service's maxScale is 1:9,028, and z17
        // answers 404 (measured 2026-10-06). Beyond 16 Leaflet enlarges z16 tiles.
        usgs: {
            url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
            maxNativeZoom: 16,
            minPrecacheZoom: 13,
            attribution: 'USDA, USGS The National Map: Orthoimagery'
        }
    };
    var OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
    var USGS_CACHE = 'hardpan-usgs-v1';            // sw.js leaves caches with this prefix alone
    var PRECACHE_MARK = 'hardpan_usgs_done_v1_';
    var PRECACHE_DAYS = 30;
    var PRECACHE_CAP = 400;                         // tiles; a course measures 15-36

    function esriKey() {
        try { return String((window.HARDPAN_GPS_CONFIG && window.HARDPAN_GPS_CONFIG.esriKey) || ''); } catch (e) { return ''; }
    }
    // A CHECK'S STAND-IN FOR ESRI: tools/gps-check.js points this at a local image so
    // a "working Esri layer" can be measured without a key. Unset in every build.
    function esriTileUrl() {
        try { return String((window.HARDPAN_GPS_CONFIG && window.HARDPAN_GPS_CONFIG.esriTileUrl) || '') || TILES.keyedUrl; } catch (e) { return TILES.keyedUrl; }
    }
    function esriMetaUrl() {
        try { return String((window.HARDPAN_GPS_CONFIG && window.HARDPAN_GPS_CONFIG.esriMetaUrl) || '') || TILES.metaUrl; } catch (e) { return TILES.metaUrl; }
    }

    // ---- STATE --------------------------------------------------------------
    var S = null;          // the mounted GPS side for this round, or null
    var watchId = null;    // navigator.geolocation id, or a Capacitor id string
    var watchKind = null;  // 'web' | 'cap'
    var watchGen = 0;      // bumps on every stop, so a late Capacitor id is cleared, not kept
    var idleTimer = null;  // the 60 s stop after switching to Bets
    var fix = null;        // { pt: [lat, lng], acc: metres } - NEVER persisted, NEVER sent

    function units() {
        try { return localStorage.getItem(UNITS_KEY) === 'm' ? 'm' : 'yd'; } catch (e) { return 'yd'; }
    }
    function setUnits(u) {
        try { localStorage.setItem(UNITS_KEY, u === 'm' ? 'm' : 'yd'); } catch (e) {}
    }
    function lastSide() {
        try { return localStorage.getItem(SIDE_KEY) === 'gps' ? 'gps' : 'bets'; } catch (e) { return 'bets'; }
    }
    function rememberSide(side) {
        try { localStorage.setItem(SIDE_KEY, side === 'gps' ? 'gps' : 'bets'); } catch (e) {}
    }

    // ---- LOCATION WATCH -----------------------------------------------------
    function capGeo() {
        try {
            var C = window.Capacitor;
            if (C && typeof C.isNativePlatform === 'function' && C.isNativePlatform()
                && C.Plugins && C.Plugins.Geolocation && typeof C.Plugins.Geolocation.watchPosition === 'function') {
                return C.Plugins.Geolocation;
            }
        } catch (e) {}
        return null;
    }
    var GEO_OPTS = { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 };

    function startWatch() {
        clearIdle();
        if (watchId !== null || !S) return;
        var gen = watchGen;
        var onPos = function (pos) {
            if (gen !== watchGen || !S || !pos || !pos.coords) return;
            fix = { pt: [pos.coords.latitude, pos.coords.longitude], acc: pos.coords.accuracy };
            S.geoError = null;
            render();
        };
        var onErr = function (err) {
            if (gen !== watchGen || !S) return;
            S.geoError = (err && (err.code === 1 || /denied|permission/i.test(String(err.message || '')))) ? 'denied'
                : (err && err.code === 3) ? 'timeout' : 'unavailable';
            render();
        };
        var cap = capGeo();
        if (cap) {
            watchKind = 'cap';
            watchId = 'pending';
            Promise.resolve(cap.watchPosition(GEO_OPTS, function (pos, err) { if (err) onErr(err); else onPos(pos); }))
                .then(function (id) {
                    // Stopped before the id arrived: clear it now rather than leak a watch.
                    if (gen !== watchGen) { try { cap.clearWatch({ id: id }); } catch (e) {} return; }
                    watchId = id;
                }, onErr);
            return;
        }
        if (typeof navigator === 'undefined' || !navigator.geolocation || typeof navigator.geolocation.watchPosition !== 'function') {
            S.geoError = 'unsupported';
            render();
            return;
        }
        watchKind = 'web';
        watchId = navigator.geolocation.watchPosition(onPos, onErr, GEO_OPTS);
    }

    function stopWatch() {
        clearIdle();
        watchGen++;
        if (watchId === null) return;
        try {
            if (watchKind === 'cap') {
                var cap = capGeo();
                if (cap && watchId !== 'pending') cap.clearWatch({ id: watchId });
            } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
                navigator.geolocation.clearWatch(watchId);
            }
        } catch (e) {}
        watchId = null;
        watchKind = null;
    }
    function clearIdle() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }
    function isWatching() { return watchId !== null; }

    // Background: stop now, whichever side is up. Back: restart only on GPS.
    function onVisibility() {
        if (!S) return;
        if (document.visibilityState === 'hidden') stopWatch();
        else if (S.side === 'gps') startWatch();
    }
    function onPageHide() { stopWatch(); }

    // ---- COURSE DATA --------------------------------------------------------
    // Three layers, merged per hole by gps-geo.resolveHole:
    //   osm     bundled with the app (gps-courses.js) - phones never call Overpass;
    //   course  the shared Firebase record course_gps/<key>, cached on the phone;
    //   round   pins on this round (events/<code>/gpsPins), which arrive with the
    //           round and are in the offline snapshot already.
    function cacheRead(key) {
        try { var s = localStorage.getItem(CACHE_PREFIX + key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
    }
    function cacheWrite(key, rec) {
        try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(rec || {})); } catch (e) {}
    }
    function osmRecord(key) {
        var all = (typeof window !== 'undefined' && window.HardPanGpsCourses) || {};
        return G.osmCourse(all, key);
    }
    function holeKey(n) { return 'h' + n; }

    function pinsFor(n) {
        var out = [];
        var k = holeKey(n);
        var c = S && S.courseRec && S.courseRec.pins && S.courseRec.pins[k];
        if (c) out.push(c);
        var r = S && S.round && S.round.gpsPins && S.round.gpsPins[k];
        if (r) out.push(r);
        var l = S && S.localPins && S.localPins[k];
        if (l) out.push(l);
        return out;
    }
    function resolved() {
        if (!S || !G) return null;
        var osm = osmRecord(S.courseKey);
        var holeRec = osm && osm.holes ? osm.holes[String(S.hole)] : null;
        return G.resolveHole(holeRec, pinsFor(S.hole));
    }

    function loadCourseRecord() {
        if (!S) return;
        var key = S.courseKey;
        S.courseRec = cacheRead(key);
        var db = S.db;
        if (!db || typeof db.ref !== 'function') return;
        try {
            db.ref('course_gps/' + key).once('value').then(function (snap) {
                var v = snap && typeof snap.val === 'function' ? snap.val() : null;
                if (v) cacheWrite(key, v);
                if (S && S.courseKey === key) { if (v) S.courseRec = v; render(); }
            }, function () { /* no rule yet, or offline: the cache and the round carry it */ });
        } catch (e) {}
    }

    // ONE writer for a pin. The round copy goes through the page's durable queue
    // (a pin set with no signal survives the app closing); the course copy is
    // best effort until course_gps has a rule. Only TAPPED points are ever here.
    function savePin(pin) {
        if (!S || !pin) return;
        var k = holeKey(S.hole);
        S.localPins = S.localPins || {};
        S.localPins[k] = pin;
        if (typeof S.writeRoundPin === 'function') {
            try { S.writeRoundPin(k, pin); } catch (e) {}
        }
        if (S.db && typeof S.db.ref === 'function') {
            try {
                // The shared copy names its round (`ev`): the proposed rule lets a
                // round member fill an EMPTY green and only that round's organizer
                // change one (docs/gps-rules-proposal.json). A round code is not
                // a location.
                var p = S.db.ref('course_gps/' + S.courseKey + '/pins/' + k).set(Object.assign({}, pin, { ev: S.eventCode }));
                if (p && typeof p.then === 'function') p.then(null, function () {});
            } catch (e) {}
        }
        var cached = cacheRead(S.courseKey) || {};
        cached.pins = cached.pins || {};
        cached.pins[k] = pin;
        cacheWrite(S.courseKey, cached);
        S.courseRec = cached;
    }

    // ---- SCRIPTS LOADED ON FIRST USE ----------------------------------------
    // Leaflet and the bundled greens are loaded the first time the GPS side (or
    // the pre-cache) needs them, so the Bets side's boot cost is unchanged. Both
    // are precached by the service worker, so this works with no signal.
    var scriptState = {};
    function loadScript(src, ready, done) {
        if (ready()) { done(); return; }
        var st = scriptState[src] || (scriptState[src] = { state: null, waiters: [] });
        if (st.state === 'failed') { done(); return; }
        st.waiters.push(done);
        if (st.state === 'loading') return;
        st.state = 'loading';
        var sc = document.createElement('script');
        sc.src = src; sc.async = true;
        var fin = function (ok) {
            st.state = ok && ready() ? 'ready' : 'failed';
            var w = st.waiters; st.waiters = [];
            w.forEach(function (f) { try { f(); } catch (e) {} });
        };
        sc.onload = function () { fin(true); };
        sc.onerror = function () { fin(false); };
        document.head.appendChild(sc);
    }
    function L_() { return (typeof window !== 'undefined' && window.L && typeof window.L.map === 'function') ? window.L : null; }
    function loadLeaflet(done) {
        if (!document.querySelector('link[data-gps-leaflet]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet'; link.href = 'leaflet.css'; link.setAttribute('data-gps-leaflet', '1');
            document.head.appendChild(link);
        }
        loadScript('leaflet.js', function () { return !!L_(); }, done);
    }
    function loadCourses(done) {
        loadScript('gps-courses.js', function () { return !!window.HardPanGpsCourses; }, done);
    }

    // ---- MAP ----------------------------------------------------------------
    function buildMap() {
        var L = L_();
        var el = S.el.querySelector('.gps-map');
        if (!L || !el) { S.map = null; if (el) el.classList.add('gps-no-tiles'); return; }
        var map = L.map(el, { zoomControl: false, attributionControl: true, maxZoom: TILES.maxZoom, tap: true });
        map.attributionControl.setPrefix(false);
        var key = esriKey();
        S.esri = null; S.esriCredits = [];
        if (key) { map.attributionControl.addAttribution(TILES.poweredBy); S.esriCredits.push(TILES.poweredBy); addImageryCredit(map, key); }
        map.attributionControl.addAttribution(escapeText(TILES.usgs.attribution));
        map.attributionControl.addAttribution(OSM_ATTRIBUTION);
        S.tileErrors = 0; S.tileLoads = 0;
        S.esriFailed = !key || (typeof navigator !== 'undefined' && navigator.onLine === false);
        var counted = function (layer) {
            layer.on('tileerror', function () { if (!S) return; S.tileErrors++; syncNoTiles(); });
            layer.on('tileload', function () { if (!S) return; S.tileLoads++; syncNoTiles(); });
            return layer;
        };
        // Bottom: USGS, from the phone's pre-cache first.
        S.usgs = counted(usgsLayer(L)).addTo(map);
        // Top: Esri, only with a key and only online.
        if (key && !S.esriFailed) {
            var esriErrs = 0, esriLoads = 0;
            var tl = L.tileLayer(esriTileUrl(), { key: encodeURIComponent(key), maxNativeZoom: TILES.maxNativeZoom, maxZoom: TILES.maxZoom });
            tl.on('tileload', function () { esriLoads++; });
            tl.on('tileerror', function () {
                esriErrs++;
                // Esri is not answering: no signal, or the free tier is used up on an
                // account with no card (by design). Hand the picture to USGS.
                if (S && !S.esriFailed && esriErrs >= 4 && esriLoads === 0) {
                    S.esriFailed = true;
                    try { map.removeLayer(tl); } catch (e) {}
                    if (S.usgs) S.usgs.redraw();
                }
            });
            counted(tl).addTo(map);
            S.esri = tl;
        }
        S.layers = L.layerGroup().addTo(map);
        S.dotLayer = L.layerGroup().addTo(map);
        S.lineLayer = L.layerGroup().addTo(map);
        map.on('click', function (e) { onMapTap([e.latlng.lat, e.latlng.lng]); });
        S.map = map;
        frameHole(true);
    }

    var creditCache = null;
    function escapeText(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function addImageryCredit(map, key) {
        var shown = creditCache || TILES.fallbackCredit;
        map.attributionControl.addAttribution(escapeText(shown));
        if (S) S.esriCredits.push(escapeText(shown));
        if (creditCache || typeof fetch !== 'function') return;
        // Service metadata only: the URL carries the tile key and nothing about the golfer.
        fetch(esriMetaUrl().replace('{key}', encodeURIComponent(key))).then(function (r) { return r.json(); }).then(function (j) {
            var c = j && typeof j.copyrightText === 'string' ? j.copyrightText.trim() : '';
            if (!c || c === shown) return;
            creditCache = c;
            if (S && S.map === map) {
                S.esriCredits = S.esriCredits.map(function (x) { return x === escapeText(shown) ? escapeText(c) : x; });
                map.attributionControl.removeAttribution(escapeText(shown));
                if (S.esri && map.hasLayer(S.esri)) map.attributionControl.addAttribution(escapeText(c));
            }
        }, function () { /* offline: the fallback credit stays */ });
    }

    // The plain background only when NOTHING has drawn: a few cached tiles around
    // the green are worth showing even if the rest are missing.
    function syncNoTiles() {
        if (!S) return;
        var on = S.tileLoads === 0 && S.tileErrors >= 4;
        S.noTiles = on;
        var el = S.el.querySelector('.gps-map');
        if (el) el.classList.toggle('gps-no-tiles', on);
        var note = S.el.querySelector('.gps-tiles-note');
        if (note) note.style.display = on ? '' : 'none';
    }

    // ---- USGS LAYER: CACHE FIRST --------------------------------------------
    function cachedTile(url) {
        try {
            if (typeof caches === 'undefined') return Promise.resolve(null);
            return caches.open(USGS_CACHE).then(function (c) { return c.match(url); })
                .then(function (r) { return r ? r.blob() : null; }, function () { return null; });
        } catch (e) { return Promise.resolve(null); }
    }
    // USGS goes to the network only when it is the picture: no Esri key, Esri has
    // stopped answering, or a green is being set. Under a working Esri layer it
    // reads its cache only.
    function usgsNetworkAllowed() {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
        return !!(S && (S.esriFailed || S.mode !== 'measure'));
    }

    // SETTING A GREEN ALWAYS USES USGS, never Esri, even when Esri is on
    // (decision 2026-10-07). A tapped green is stored and shared; deriving shared
    // data from Esri imagery is outside its "visualization purposes" licence,
    // and USGS imagery is public domain. So while a green is being set the Esri
    // layer and its credits come off the map, and they go back afterwards.
    function syncImageryForMode() {
        if (!S || !S.map || !S.esri) return;
        var pinning = S.mode !== 'measure';
        var on = S.map.hasLayer(S.esri);
        if (pinning && on) {
            S.map.removeLayer(S.esri);
            S.esriCredits.forEach(function (c) { S.map.attributionControl.removeAttribution(c); });
            if (S.usgs) S.usgs.redraw();
        } else if (!pinning && !on && !S.esriFailed) {
            S.esri.addTo(S.map);
            S.esriCredits.forEach(function (c) { S.map.attributionControl.addAttribution(c); });
        }
    }
    function usgsLayer(L) {
        var Layer = L.TileLayer.extend({
            createTile: function (coords, done) {
                var img = document.createElement('img');
                img.alt = '';
                img.setAttribute('role', 'presentation');
                var url = this.getTileUrl(coords);
                var settled = false;
                var finish = function (err) { if (settled) return; settled = true; done(err, img); };
                img.onload = function () { if (img._hpBlob) { try { URL.revokeObjectURL(img._hpBlob); } catch (e) {} } finish(null); };
                img.onerror = function () { finish(new Error('tile')); };
                cachedTile(url).then(function (blob) {
                    if (blob) { img._hpBlob = URL.createObjectURL(blob); img.src = img._hpBlob; return; }
                    if (!usgsNetworkAllowed()) { finish(new Error('not cached')); return; }
                    img.crossOrigin = 'anonymous';
                    img.src = url;
                });
                return img;
            }
        });
        return new Layer(TILES.usgs.url, { maxNativeZoom: TILES.usgs.maxNativeZoom, maxZoom: TILES.maxZoom });
    }

    // ---- PRE-CACHE THE COURSE (USGS ONLY) -------------------------------------
    // When a round opens WITH SIGNAL, the USGS tiles covering the course area are
    // stored on the phone, z13-z16, so the satellite view still works with no
    // bars. The area comes from the COURSE - the bundled OSM holes plus any greens
    // golfers set - never from the golfer's position; a course with no points at
    // all is skipped rather than guessed at. Once per course per PRECACHE_DAYS,
    // marked done only when every tile is in. Esri tiles are never stored here.
    function precacheCourse(courseKey, extraPts) {
        var why = function (r) { return Promise.resolve({ ok: false, reason: r }); };
        G = G || window.HardPanGeo || null;
        if (!courseKey || !G) return why('no-course');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return why('offline');
        if (typeof caches === 'undefined' || typeof fetch !== 'function') return why('unsupported');
        try {
            var mark = JSON.parse(localStorage.getItem(PRECACHE_MARK + courseKey) || 'null');
            if (mark && mark.at && Date.now() - mark.at < PRECACHE_DAYS * 86400000) return why('fresh');
        } catch (e) {}
        return new Promise(function (resolve) { loadCourses(resolve); }).then(function () {
            var osm = G.osmCourse(window.HardPanGpsCourses || {}, courseKey);
            var b = G.courseBounds(osm, extraPts || [], 150);
            if (!b) return { ok: false, reason: 'no-course-data' };
            var tiles = G.tilesFor(b, TILES.usgs.minPrecacheZoom, TILES.usgs.maxNativeZoom, PRECACHE_CAP);
            if (!tiles) return { ok: false, reason: 'too-large' };
            return caches.open(USGS_CACHE).then(function (cache) {
                var i = 0, fetched = 0, had = 0, failed = 0;
                var one = function () {
                    if (i >= tiles.length) return Promise.resolve();
                    var t = tiles[i++];
                    var url = TILES.usgs.url.replace('{z}', t.z).replace('{y}', t.y).replace('{x}', t.x);
                    return cache.match(url).then(function (hit) {
                        if (hit) { had++; return null; }
                        return fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (r) {
                            if (r && r.ok && /^image\//.test(r.headers.get('content-type') || '')) { fetched++; return cache.put(url, r); }
                            failed++;
                            return null;
                        }, function () { failed++; });
                    }).then(one);
                };
                // Four at a time: polite to a public server, quick on a phone.
                return Promise.all([one(), one(), one(), one()]).then(function () {
                    var res = { ok: failed === 0, tiles: tiles.length, fetched: fetched, had: had, failed: failed };
                    if (failed === 0) { try { localStorage.setItem(PRECACHE_MARK + courseKey, JSON.stringify({ at: Date.now(), n: tiles.length })); } catch (e) {} }
                    return res;
                });
            });
        }).catch(function () { return { ok: false, reason: 'error' }; });
    }

    // Framed on the hole, never on the golfer (see PRIVACY above).
    function frameHole(first) {
        var L = L_();
        if (!S || !S.map || !L) return;
        var r = resolved();
        var pts = [];
        if (r && r.tee) pts.push(r.tee);
        if (r && r.green) r.green.forEach(function (p) { pts.push(p); });
        if (r && r.mid) pts.push(r.mid);
        if (pts.length >= 2) {
            S.map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 19 });
            S.framed = 'hole';
        } else if (r && r.mid) {
            S.map.setView(r.mid, 18);
            S.framed = 'hole';
        } else if (first || S.framed === 'hole') {
            // Nothing known about this hole. Wait for the dot; see drawDot.
            S.map.setView([20, 0], 2);
            S.framed = null;
        }
    }

    function drawLayers() {
        var L = L_();
        if (!S || !S.map || !L) return;
        S.layers.clearLayers();
        var r = resolved();
        if (!r) return;
        // The hole's own line (tee -> green) from OSM, faint, for orientation.
        var osmRec = osmRecord(S.courseKey), h = osmRec && osmRec.holes && osmRec.holes[String(S.hole)];
        if (h && h.osm && h.osm.tee && h.osm.end) L.polyline([h.osm.tee, h.osm.end], { color: '#ffffff', weight: 1, opacity: 0.45, interactive: false }).addTo(S.layers);
        if (r.green) L.polygon(r.green, { color: '#d9f99d', weight: 2, fillColor: '#4ade80', fillOpacity: 0.28, interactive: false }).addTo(S.layers);
        var nums = G.holeNumbers(fix ? fix.pt : null, r);
        var pin = function (pt, cls, label) {
            if (!pt) return;
            L.marker(pt, { interactive: false, icon: L.divIcon({ className: 'gps-pin ' + cls, html: '<span>' + label + '</span>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(S.layers);
        };
        if (nums) { pin(nums.front, 'gps-pin-front', 'F'); pin(nums.back, 'gps-pin-back', 'B'); }
        pin(r.mid, 'gps-pin-mid', 'C');
        // Pins being placed right now (Set the green / Fix).
        if (S.draft) { pin(S.draft.mid, 'gps-pin-mid gps-pin-draft', 'C'); pin(S.draft.front, 'gps-pin-front gps-pin-draft', 'F'); pin(S.draft.back, 'gps-pin-back gps-pin-draft', 'B'); }
    }

    function drawDot() {
        var L = L_();
        if (!S || !S.map || !L) return;
        S.dotLayer.clearLayers();
        if (!fix) return;
        if (isFinite(fix.acc) && fix.acc > 0) L.circle(fix.pt, { radius: fix.acc, color: '#60a5fa', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(S.dotLayer);
        L.circleMarker(fix.pt, { radius: 8, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, interactive: false }).addTo(S.dotLayer);
        if (!S.framed) {
            // A hole with no data: the golfer has to see the ground around them to
            // tap the green. This is the one view framed on the dot.
            S.map.setView(fix.pt, 17);
            S.framed = 'dot';
        }
    }

    // ---- THE TARGET -----------------------------------------------------------
    // A crosshair the golfer drags, or moves by tapping the map. Until they touch
    // it, it sits halfway between them and the green's center and follows them as
    // they walk; once touched, it stays put until the hole changes.
    //
    // DRAGGING IT DOES NOT PAN THE MAP: it is a draggable Leaflet marker, and a
    // drag that starts on a marker belongs to the marker. A drag that starts
    // anywhere else pans and pinches the map as usual.
    function placeTarget(r) {
        if (!S || S.targetMoved) return;
        var center = r && r.mid;
        var p = (fix && center) ? G.midpoint(fix.pt, center) : (center && r.tee ? G.midpoint(r.tee, center) : null);
        if (p) S.target = p;
    }
    function drawTargetLines() {
        var L = L_();
        if (!S || !S.map || !L) return;
        S.lineLayer.clearLayers();
        if (!S.target || S.mode !== 'measure') return;
        var r = resolved();
        if (fix) L.polyline([fix.pt, S.target], { color: '#facc15', weight: 2, opacity: 0.95, interactive: false }).addTo(S.lineLayer);
        if (r && r.mid) L.polyline([S.target, r.mid], { color: '#ffffff', weight: 2, opacity: 0.95, interactive: false }).addTo(S.lineLayer);
    }
    function targetReadout() {
        if (!S || !G) return;
        var r = resolved();
        var u = units();
        var d = function (m) { var v = G.distanceIn(m, u); return v == null ? '—' : String(v); };
        var on = !!S.target && S.mode === 'measure';
        show('.gps-target-row', on);
        if (!on) return;
        txt('.gps-to-here', 'You → here: ' + (fix ? d(G.haversineMeters(fix.pt, S.target)) : '—'));
        txt('.gps-here-center', 'Here → center: ' + (r && r.mid ? d(G.haversineMeters(S.target, r.mid)) : '—'));
    }
    function drawTarget() {
        var L = L_();
        if (!S || !S.map || !L) return;
        drawTargetLines();
        var want = !!S.target && S.mode === 'measure';
        if (!want) {
            if (S.targetMarker) { S.map.removeLayer(S.targetMarker); S.targetMarker = null; }
            return;
        }
        if (!S.targetMarker) {
            var m = L.marker(S.target, {
                draggable: true, autoPan: false, keyboard: false, zIndexOffset: 1000,
                icon: L.divIcon({ className: 'gps-target', html: '<span></span>', iconSize: [48, 48], iconAnchor: [24, 24] })
            });
            m.on('dragstart', function () { if (!S) return; S.dragging = true; S.targetMoved = true; });
            m.on('drag', function (e) {
                if (!S) return;
                var ll = e.target.getLatLng();
                S.target = [ll.lat, ll.lng];
                drawTargetLines();
                targetReadout();
            });
            m.on('dragend', function () { if (!S) return; S.dragging = false; render(); });
            m.addTo(S.map);
            S.targetMarker = m;
        } else if (!S.dragging) {
            var cur = S.targetMarker.getLatLng();
            if (cur.lat !== S.target[0] || cur.lng !== S.target[1]) S.targetMarker.setLatLng(S.target);
        }
    }

    // ---- TAPS ---------------------------------------------------------------
    function onMapTap(pt) {
        if (!S) return;
        if (S.mode === 'setMid') { S.draft = { mid: pt }; S.mode = 'confirmMid'; render(); return; }
        if (S.mode === 'setFront') { S.draft.front = pt; S.mode = 'setBack'; render(); return; }
        if (S.mode === 'setBack') { S.draft.back = pt; S.mode = 'confirmAll'; render(); return; }
        if (S.mode !== 'measure') return;
        // Tap anywhere: the target jumps there.
        S.target = pt;
        S.targetMoved = true;
        render();
    }

    // ---- RENDER -------------------------------------------------------------
    function txt(sel, value) {
        var el = S && S.el.querySelector(sel);
        if (el && el.textContent !== String(value)) el.textContent = String(value);
    }
    function show(sel, on) {
        var el = S && S.el.querySelector(sel);
        if (el) el.style.display = on ? '' : 'none';
    }
    function isNative() {
        try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; }
    }

    function render() {
        if (!S || !G) return;
        var u = units();
        var r = resolved();
        var nums = r ? G.holeNumbers(fix ? fix.pt : null, r) : null;
        var d = function (m) { var v = G.distanceIn(m, u); return v == null ? '—' : String(v); };

        txt('.gps-title', 'Hole ' + S.hole + (S.par ? ' · Par ' + S.par : ''));
        txt('.gps-units', u === 'm' ? 'Meters' : 'Yards');
        txt('.gps-f', nums ? (nums.onGreen ? 'ON' : d(nums.frontM)) : '—');
        txt('.gps-m', nums ? d(nums.middleM) : '—');
        txt('.gps-b', nums ? d(nums.backM) : '—');

        var acc = S.geoError ? null : (fix ? G.accuracyLabel(fix.acc, u) : { text: 'Finding you…', weak: false });
        var accEl = S.el.querySelector('.gps-acc');
        if (accEl) {
            accEl.classList.toggle('gps-weak', !!(acc && acc.weak));
            accEl.textContent = acc ? acc.text : '';
        }

        // Permission and availability, in words a golfer can act on.
        var msg = '';
        if (S.geoError === 'denied') {
            msg = 'Location is off for HardPan, so there is no blue dot. To turn it on: iPhone Settings → Privacy & Security → Location Services → '
                + (isNative() ? 'HardPan' : 'Safari Websites') + ' → While Using the App, then come back to GPS. Bets and your scorecard are not affected.';
        } else if (S.geoError === 'unsupported') {
            msg = 'This browser cannot share your location, so there is no blue dot. Bets and your scorecard are not affected.';
        } else if (S.geoError) {
            msg = 'Cannot find you right now. Step out from under trees or cover and give it a moment.';
        }
        txt('.gps-msg', msg);
        show('.gps-msg', !!msg);

        // VERIFY ON COURSE: a green the import could not vouch for (OSM par differs
        // from our card, renumbered holes, greens rebuilt since they were mapped).
        // Shown while the green is still OSM's; gone once anyone sets or fixes it.
        var osmRec = osmRecord(S.courseKey);
        var note = (r && r.source === 'osm' && osmRec && osmRec.verify && osmRec.verify[String(S.hole)]) || '';
        txt('.gps-verify', note ? '⚠ Verify green: ' + note + (S.canFix ? ' Use "Fix the green" if it is off.' : ' The organizer can fix it.') : '');
        show('.gps-verify', !!note && S.mode === 'measure');

        placeTarget(r);
        targetReadout();

        // The green, set / fixed / undone.
        var noGreen = !r || !r.mid;
        var banner = '';
        if (S.mode === 'setMid') banner = 'Tap the CENTER of the green';
        else if (S.mode === 'setFront') banner = 'Tap the FRONT edge (optional)';
        else if (S.mode === 'setBack') banner = 'Tap the BACK edge (optional)';
        else if (S.mode === 'confirmMid' || S.mode === 'confirmAll') banner = 'Save this green for hole ' + S.hole + '?';
        else if (S.loadingCourses) banner = 'Loading the course…';
        else if (noGreen) banner = 'No green mapped for this hole yet';
        txt('.gps-banner', banner);
        show('.gps-banner', !!banner);

        var pinning = S.mode !== 'measure';
        show('.gps-set-green', !pinning && noGreen && !S.loadingCourses);
        show('.gps-fix-green', !pinning && !noGreen && !!S.canFix);
        var canUndo = !pinning && !!S.canFix && r && r.source === 'pin' && r.pin && !!G.undoPin(r.pin, 1);
        show('.gps-undo-green', !!canUndo);
        show('.gps-skip', S.mode === 'setFront' || S.mode === 'setBack');
        show('.gps-addedges', S.mode === 'confirmMid');
        show('.gps-save', S.mode === 'confirmMid' || S.mode === 'confirmAll');
        show('.gps-cancel', pinning);
        txt('.gps-src', r && r.source === 'osm' ? 'Green from OpenStreetMap'
            : (r && r.source === 'pin' ? (r.pin.by === 'undo' ? 'Green restored by undo' : 'Green set by a golfer') : ''));

        syncImageryForMode();
        drawLayers();
        drawDot();
        drawTarget();
    }

    // ---- MARKUP AND STYLE -----------------------------------------------------
    var MARKUP = ''
        + '<div class="gps-head">'
        +   '<button type="button" class="gps-prev" aria-label="Previous hole">◀</button>'
        +   '<div class="gps-title"></div>'
        +   '<button type="button" class="gps-next" aria-label="Next hole">▶</button>'
        +   '<button type="button" class="gps-units" aria-label="Switch yards or meters"></button>'
        + '</div>'
        + '<div class="gps-map-wrap">'
        +   '<div class="gps-map"></div>'
        +   '<div class="gps-banner" style="display:none"></div>'
        +   '<div class="gps-tiles-note" style="display:none">No satellite view here without signal — yardages still work.</div>'
        + '</div>'
        + '<div class="gps-panel">'
        +   '<div class="gps-nums">'
        +     '<div class="gps-num"><div class="gps-lbl">FRONT</div><div class="gps-big gps-f">—</div></div>'
        +     '<div class="gps-num gps-num-mid"><div class="gps-lbl">CENTER</div><div class="gps-big gps-m">—</div></div>'
        +     '<div class="gps-num"><div class="gps-lbl">BACK</div><div class="gps-big gps-b">—</div></div>'
        +   '</div>'
        +   '<div class="gps-sub"><span class="gps-acc"></span><span class="gps-src"></span></div>'
        +   '<div class="gps-msg" style="display:none"></div>'
        +   '<div class="gps-verify" style="display:none"></div>'
        +   '<div class="gps-target-row" style="display:none"><span class="gps-to-here"></span><span class="gps-here-center"></span></div>'
        +   '<div class="gps-actions">'
        +     '<button type="button" class="gps-btn gps-set-green" style="display:none">Tap the center of the green</button>'
        +     '<button type="button" class="gps-btn gps-fix-green" style="display:none">Fix the green</button>'
        +     '<button type="button" class="gps-btn gps-undo-green" style="display:none">Undo last fix</button>'
        +     '<button type="button" class="gps-btn gps-addedges" style="display:none">Add front & back</button>'
        +     '<button type="button" class="gps-btn gps-skip" style="display:none">Skip</button>'
        +     '<button type="button" class="gps-btn gps-primary gps-save" style="display:none">Save green</button>'
        +     '<button type="button" class="gps-btn gps-cancel" style="display:none">Cancel</button>'
        +   '</div>'
        + '</div>';

    var TOGGLE_H = 52;   // px, plus the safe-area inset
    var CSS = ''
        // The toggle: fixed, above the Round Menu handle on Bets, at the very bottom on GPS.
        // On Bets the toggle sits UNDER the Round Menu sheet (z 60) and every modal,
        // so it can never catch a tap meant for Save in a sheet; on GPS it sits
        // above the GPS side (z 10050).
        + '#gps-side-toggle{position:fixed;left:50%;transform:translateX(-50%);z-index:55;display:flex;gap:0;'
        +   'bottom:calc(70px + env(safe-area-inset-bottom));background:#0b0f0c;border:1px solid #3a4a3e;border-radius:999px;padding:3px;'
        +   'box-shadow:0 4px 14px rgba(0,0,0,.25);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}'
        + 'body.gps-side-gps #gps-side-toggle{bottom:calc(8px + env(safe-area-inset-bottom));z-index:10060;}'
        + '#gps-side-toggle button{font-family:inherit;font-weight:700;font-size:15px;line-height:1;color:#d1d5db;background:transparent;border:0;border-radius:999px;'
        +   'padding:10px 18px;min-height:40px;cursor:pointer;}'
        + '#gps-side-toggle button[aria-pressed="true"]{background:#d9f99d;color:#0b0f0c;}'
        + 'body.has-gps-toggle #main-content{padding-bottom:132px !important;}'
        + '#gps-overlay{position:fixed;inset:0;z-index:10050;display:none;flex-direction:column;background:#0b0f0c;color:#f4f4ef;'
        +   'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding-top:env(safe-area-inset-top);'
        +   'padding-bottom:calc(' + (TOGGLE_H + 10) + 'px + env(safe-area-inset-bottom));}'
        + 'body.gps-side-gps #gps-overlay{display:flex;}'
        + '#gps-overlay .gps-head{display:flex;align-items:center;gap:8px;padding:8px 12px;}'
        + '#gps-overlay .gps-title{flex:1;font-size:18px;font-weight:700;text-align:center;}'
        + '#gps-overlay button{font:inherit;color:inherit;background:#1f2a22;border:1px solid #3a4a3e;border-radius:10px;padding:8px 12px;min-height:40px;cursor:pointer;}'
        + '#gps-overlay .gps-prev,#gps-overlay .gps-next{width:44px;}'
        + '#gps-overlay .gps-map-wrap{position:relative;flex:1;min-height:180px;}'
        + '#gps-overlay .gps-map{position:absolute;inset:0;background:#1d3b2a;}'
        + '#gps-overlay .gps-map.gps-no-tiles .leaflet-tile-pane{display:none;}'
        + '#gps-overlay .gps-banner{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(0,0,0,.78);'
        +   'padding:8px 14px;border-radius:999px;font-weight:700;font-size:15px;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis;}'
        + '#gps-overlay .gps-tiles-note{position:absolute;bottom:26px;left:8px;right:8px;z-index:1000;text-align:center;font-size:13px;color:#d1d5db;}'
        + '#gps-overlay .leaflet-control-attribution{font-size:10px;background:rgba(255,255,255,.82);color:#111;display:block !important;}'
        + '#gps-overlay .gps-panel{padding:8px 12px 4px;background:#0b0f0c;}'
        + '#gps-overlay .gps-nums{display:flex;justify-content:space-between;text-align:center;}'
        + '#gps-overlay .gps-num{flex:1;}'
        + '#gps-overlay .gps-lbl{font-size:12px;letter-spacing:.08em;color:#a7b3aa;}'
        + '#gps-overlay .gps-big{font-size:44px;font-weight:800;line-height:1.05;font-variant-numeric:tabular-nums;}'
        + '#gps-overlay .gps-num-mid .gps-big{font-size:56px;color:#d9f99d;}'
        + '#gps-overlay .gps-sub{display:flex;justify-content:space-between;font-size:13px;color:#a7b3aa;margin-top:4px;}'
        + '#gps-overlay .gps-acc.gps-weak{color:#fbbf24;font-weight:700;}'
        + '#gps-overlay .gps-msg{margin-top:8px;font-size:14px;line-height:1.35;color:#fde68a;}'
        + '#gps-overlay .gps-verify{margin-top:6px;font-size:13px;line-height:1.35;color:#fbbf24;border-left:3px solid #fbbf24;padding-left:8px;}'
        + '#gps-overlay .gps-target-row{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:17px;font-weight:700;color:#facc15;}'
        + '#gps-overlay .gps-here-center{color:#ffffff;}'
        + '#gps-overlay .gps-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;}'
        + '#gps-overlay .gps-actions:empty{display:none;}'
        + '#gps-overlay .gps-btn{flex:1 1 auto;}'
        + '#gps-overlay .gps-primary{background:#d9f99d;color:#0b0f0c;border-color:#d9f99d;font-weight:700;}'
        + '.gps-pin{display:flex;align-items:center;justify-content:center;border-radius:50%;border:2px solid #111;font:700 9px/1 sans-serif;color:#111;}'
        + '.gps-pin-mid{background:#ffffff;}.gps-pin-front{background:#bef264;}.gps-pin-back{background:#fca5a5;}'
        + '.gps-pin-draft{outline:3px solid #facc15;}'
        // The target: a 48px touch area with a crosshair drawn in it.
        + '.gps-target{background:transparent;}'
        + '.gps-target span{position:absolute;left:8px;top:8px;width:28px;height:28px;border:3px solid #facc15;border-radius:50%;'
        +   'box-shadow:0 0 0 1px rgba(0,0,0,.6);}'
        + '.gps-target span::before,.gps-target span::after{content:"";position:absolute;background:#facc15;box-shadow:0 0 0 1px rgba(0,0,0,.4);}'
        + '.gps-target span::before{left:12px;top:-9px;width:3px;height:44px;}'
        + '.gps-target span::after{top:12px;left:-9px;height:3px;width:44px;}';
    function ensureCss() {
        if (document.getElementById('gps-view-css')) return;
        var st = document.createElement('style');
        st.id = 'gps-view-css';
        st.textContent = CSS;
        (document.head || document.documentElement).appendChild(st);
    }

    function on(root, sel, fn) {
        var el = root.querySelector(sel);
        if (el) el.addEventListener('click', function (e) { e.preventDefault(); fn(); });
    }

    // ---- MOUNT ONCE, THEN SHOW / HIDE -----------------------------------------
    //
    // opts: { courseKey, hole, par, round, db, canFix, writeRoundPin(k, pin),
    //         stepHole(dir) }. stepHole is the scorecard's own Prev/Next, so the
    //         hole can only ever change in one place.
    function mount(opts) {
        G = G || (typeof window !== 'undefined' && window.HardPanGeo) || null;
        if (!G || !opts || !opts.courseKey) return false;
        if (S) return true;
        ensureCss();
        var el = document.createElement('div');
        el.id = 'gps-overlay';
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', 'GPS');
        el.innerHTML = MARKUP;
        document.body.appendChild(el);

        var tg = document.createElement('div');
        tg.id = 'gps-side-toggle';
        tg.setAttribute('role', 'group');
        tg.setAttribute('aria-label', 'GPS or Bets');
        tg.innerHTML = '<button type="button" class="gps-side-gps" aria-pressed="false">📍 GPS</button>'
                     + '<button type="button" class="gps-side-bets" aria-pressed="true">💰 Bets</button>';
        document.body.appendChild(tg);
        document.body.classList.add('has-gps-toggle');

        S = {
            el: el, toggle: tg, side: 'bets',
            hole: Number(opts.hole), par: opts.par, courseKey: String(opts.courseKey),
            round: opts.round || null, db: opts.db || null, canFix: !!opts.canFix, eventCode: String(opts.eventCode || ''),
            writeRoundPin: opts.writeRoundPin || null, stepHole: opts.stepHole || null,
            mode: 'measure', target: null, targetMoved: false, draft: null, localPins: {},
            geoError: null, framed: null, mapRequested: false, loadingCourses: !window.HardPanGpsCourses
        };

        on(tg, '.gps-side-gps', function () { showSide('gps'); });
        on(tg, '.gps-side-bets', function () { showSide('bets'); });
        on(el, '.gps-prev', function () { if (S && S.stepHole) S.stepHole(-1); });
        on(el, '.gps-next', function () { if (S && S.stepHole) S.stepHole(1); });
        on(el, '.gps-units', function () { setUnits(units() === 'm' ? 'yd' : 'm'); render(); });
        on(el, '.gps-set-green', function () { S.mode = 'setMid'; S.draft = null; render(); });
        on(el, '.gps-fix-green', function () { S.mode = 'setMid'; S.draft = null; render(); });
        on(el, '.gps-addedges', function () { S.mode = 'setFront'; render(); });
        on(el, '.gps-skip', function () { S.mode = (S.mode === 'setFront') ? 'setBack' : 'confirmAll'; render(); });
        on(el, '.gps-cancel', function () { S.mode = 'measure'; S.draft = null; render(); });
        on(el, '.gps-save', function () {
            if (!S.draft || !S.draft.mid) return;
            var r = resolved();
            var previous = (r && r.source === 'pin') ? r.pin : (r && r.mid ? { mid: r.mid, at: 0 } : null);
            savePin(G.makePin(S.draft.mid, S.draft.front, S.draft.back, previous, Date.now(), S.canFix && previous ? 'organizer' : 'tap'));
            S.mode = 'measure'; S.draft = null;
            S.targetMoved = false; S.target = null;
            frameHole(false);
            render();
        });
        on(el, '.gps-undo-green', function () {
            var r = resolved();
            var back = r && r.pin ? G.undoPin(r.pin, Date.now()) : null;
            if (!back) return;
            savePin(back);
            frameHole(false);
            render();
        });
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', onPageHide);
        loadCourseRecord();
        if (lastSide() === 'gps') showSide('gps');
        return true;
    }

    // The map is built the first time GPS is shown (a hidden 0x0 container would
    // give Leaflet nothing to measure), then kept for the life of the round.
    function ensureMap() {
        if (!S || S.mapRequested) return;
        S.mapRequested = true;
        var mine = S;
        loadCourses(function () {
            if (S !== mine) return;
            S.loadingCourses = false;
            frameHole(false);
            render();
        });
        loadLeaflet(function () { if (S === mine) { buildMap(); render(); } });
    }

    function showSide(side) {
        if (!S) return false;
        side = side === 'gps' ? 'gps' : 'bets';
        S.side = side;
        rememberSide(side);
        document.body.classList.toggle('gps-side-gps', side === 'gps');
        var a = S.toggle.querySelector('.gps-side-gps'), b = S.toggle.querySelector('.gps-side-bets');
        if (a) a.setAttribute('aria-pressed', side === 'gps' ? 'true' : 'false');
        if (b) b.setAttribute('aria-pressed', side === 'bets' ? 'true' : 'false');
        if (side === 'gps') {
            ensureMap();
            if (S.map) { try { S.map.invalidateSize(false); } catch (e) {} }
            startWatch();
            render();
        } else {
            // Kept running for IDLE_STOP_MS, so a quick look at Bets and back
            // does not cost a fresh fix; then stopped.
            clearIdle();
            if (isWatching()) idleTimer = setTimeout(function () { idleTimer = null; stopWatch(); }, IDLE_STOP_MS);
        }
        return true;
    }

    // The scorecard's hole changed (Prev/Next on either side, the 1-18 picker, a
    // landing). Same hole: nothing. New hole: a fresh target and a fresh frame.
    function setHole(hole, par) {
        if (!S) return;
        hole = Number(hole);
        if (hole === S.hole) { if (par != null) S.par = par; return; }
        S.hole = hole;
        S.par = par;
        S.mode = 'measure'; S.draft = null;
        S.target = null; S.targetMoved = false;
        frameHole(false);
        render();
    }

    // The round changed under us (another phone set a pin).
    function roundUpdated(round) {
        if (!S) return;
        S.round = round || null;
        render();
    }

    function unmount() {
        stopWatch();
        fix = null;
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onPageHide);
        if (!S) return false;
        var s = S;
        S = null;
        try { if (s.map) s.map.remove(); } catch (e) {}
        if (s.el && s.el.parentNode) s.el.parentNode.removeChild(s.el);
        if (s.toggle && s.toggle.parentNode) s.toggle.parentNode.removeChild(s.toggle);
        document.body.classList.remove('has-gps-toggle', 'gps-side-gps');
        return true;
    }

    var api = {
        mount: mount, unmount: unmount, showSide: showSide, setHole: setHole, roundUpdated: roundUpdated,
        precacheCourse: precacheCourse,
        isMounted: function () { return !!S; },
        side: function () { return S ? S.side : null; },
        isWatching: isWatching,
        TILES: TILES, IDLE_STOP_MS: IDLE_STOP_MS
    };
    if (typeof window !== 'undefined') window.HardPanGps = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
