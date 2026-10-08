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
// ROTATION (2026-10-07): every hole opens tee at the bottom, green at the top,
// the whole hole filling the map (gps-geo.holeCamera), on MapLibre GL JS - which
// rotates natively, where Leaflet could not. Pinch zooms, one finger pans,
// nothing rotates by accident; Recenter restores the hole's own view. More than
// 1,000 yards from the green, or with no GPS, the numbers are measured from the
// TEE and the dot is hidden.
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
        // answers 404 (measured 2026-10-06). Beyond 16 MapLibre enlarges z16 tiles (to 18).
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
    // TODAY'S PIN (Wave 1): where the hole is cut today, set by anyone in the
    // group with "Edit Pin" and stored on the ROUND (events/<code>/pinLocs/h<n>),
    // so the whole group sees it. Not the green: "Fix the green" moves the
    // green's center for every future round; this is today only. While the flag
    // is being dragged, the draft is what every number uses.
    function pinLoc() {
        if (!S || !G) return null;
        if (S.editingPin && S.pinDraft) return S.pinDraft;
        var k = holeKey(S.hole);
        if (S.localLocs && Object.prototype.hasOwnProperty.call(S.localLocs, k)) return G.pinPt(S.localLocs[k]);
        return G.pinPt(S.round && S.round.pinLocs && S.round.pinLocs[k]);
    }
    // Where the CENTER number, the arcs, the white line and "Here -> ..." point:
    // today's pin when there is one, else the green's center.
    function aimAt(r) {
        if (!r || !r.mid) return null;
        return pinLoc() || r.mid;
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
    // MapLibre and the bundled greens are loaded the first time the GPS side (or
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
    // MAPLIBRE GL JS 5.24.0 (vendored, BSD-3) - a WebGL map that ROTATES, which
    // Leaflet cannot: every hole opens tee at the bottom, green at the top.
    function ML() { return (typeof window !== 'undefined' && window.maplibregl && typeof window.maplibregl.Map === 'function') ? window.maplibregl : null; }
    function loadMapLibre(done) {
        if (!document.querySelector('link[data-gps-maplibre]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet'; link.href = 'maplibre-gl.css'; link.setAttribute('data-gps-maplibre', '1');
            document.head.appendChild(link);
        }
        loadScript('maplibre-gl.js', function () { return !!ML(); }, done);
    }
    function loadCourses(done) {
        loadScript('gps-courses.js', function () { return !!window.HardPanGpsCourses; }, done);
    }

    // ---- IMAGERY: USGS FROM THE PHONE FIRST, ESRI ON TOP --------------------
    function cachedTile(url) {
        try {
            if (typeof caches === 'undefined') return Promise.resolve(null);
            return caches.open(USGS_CACHE).then(function (c) { return c.match(url); })
                .then(function (r) { return r ? r.arrayBuffer() : null; }, function () { return null; });
        } catch (e) { return Promise.resolve(null); }
    }
    // USGS goes to the network only when it is the picture: no Esri key, Esri has
    // stopped answering, or a green is being set. Under a working Esri layer it
    // reads the phone's cache only.
    function usgsNetworkAllowed() {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
        return !!(S && (S.esriFailed || S.mode !== 'measure'));
    }
    var protocolAdded = false;
    function addUsgsProtocol(ml) {
        if (protocolAdded) return;
        protocolAdded = true;
        // hpusgs://{z}/{y}/{x} -> the USGS tile, from Cache Storage when the course
        // was pre-cached, else from the network when USGS is allowed to be the
        // picture. A tile it may not fetch is an error, which MapLibre draws as
        // nothing - the plain background shows through, as intended.
        ml.addProtocol('hpusgs', function (params) {
            var m = /^hpusgs:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
            if (!m) return Promise.reject(new Error('bad tile url'));
            var url = TILES.usgs.url.replace('{z}', m[1]).replace('{y}', m[2]).replace('{x}', m[3]);
            return cachedTile(url).then(function (buf) {
                if (buf) return { data: buf };
                if (!usgsNetworkAllowed()) throw new Error('not cached');
                return fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (r) {
                    if (!r.ok) throw new Error('usgs ' + r.status);
                    return r.arrayBuffer();
                }).then(function (b) { return { data: b }; });
            });
        });
    }
    var creditCache = null;
    function escapeText(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function esriAttribution() { return TILES.poweredBy + ' | ' + escapeText(creditCache || TILES.fallbackCredit); }
    function usgsSourceTiles() { return ['hpusgs://{z}/{y}/{x}?r=' + (S ? S.usgsGen : 0)]; }
    // Ask MapLibre to fetch USGS again - after USGS becomes the picture (Esri
    // failed, or a green is being set), tiles it was refused earlier can now come.
    function refreshUsgs() {
        if (!S || !S.map || !S.map.getSource('usgs')) return;
        S.usgsGen++;
        try { S.map.getSource('usgs').setTiles(usgsSourceTiles()); } catch (e) {}
    }
    function maxZoomNow() { return (S && S.esriOn && !S.esriFailed && S.mode === 'measure' && !S.editingPin) ? 20 : 18; }

    // ---- THE MAP --------------------------------------------------------------
    var EMPTY = { type: 'FeatureCollection', features: [] };
    function ll(p) { return [p[1], p[0]]; }               // [lat, lng] -> [lng, lat]
    function buildMap() {
        var ml = ML();
        var el = S.el.querySelector('.gps-map');
        if (!ml || !el) { S.map = null; if (el) el.classList.add('gps-no-tiles'); return; }
        addUsgsProtocol(ml);
        var key = esriKey();
        S.esriOn = !!key;
        S.esriFailed = !key || (typeof navigator !== 'undefined' && navigator.onLine === false);
        S.tileErrors = 0; S.tileLoads = 0; S.usgsGen = 0;
        var sources = {
            usgs: { type: 'raster', tiles: usgsSourceTiles(), tileSize: 256, maxzoom: TILES.usgs.maxNativeZoom,
                    attribution: escapeText(TILES.usgs.attribution) },
            hole: { type: 'geojson', data: EMPTY, attribution: OSM_ATTRIBUTION },
            lines: { type: 'geojson', data: EMPTY },
            arcs: { type: 'geojson', data: EMPTY },
            acc: { type: 'geojson', data: EMPTY }
        };
        var layers = [
            { id: 'bg', type: 'background', paint: { 'background-color': '#1d3b2a' } },
            { id: 'usgs', type: 'raster', source: 'usgs' },
            { id: 'hole-line', type: 'line', source: 'hole', filter: ['==', ['get', 'k'], 'line'], paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.45 } },
            { id: 'green-fill', type: 'fill', source: 'hole', filter: ['==', ['get', 'k'], 'green'], paint: { 'fill-color': '#4ade80', 'fill-opacity': 0.28 } },
            { id: 'green-edge', type: 'line', source: 'hole', filter: ['==', ['get', 'k'], 'green'], paint: { 'line-color': '#d9f99d', 'line-width': 2 } },
            // YARDAGE ARCS: thin white curves across the hole (carry every 25 yds),
            // dashed for the 100 / 150 / 200-to-the-pin marks.
            { id: 'arc-carry', type: 'line', source: 'arcs', filter: ['==', ['get', 'k'], 'carry'], paint: { 'line-color': '#ffffff', 'line-width': 1.2, 'line-opacity': 0.75 } },
            { id: 'arc-pin', type: 'line', source: 'arcs', filter: ['==', ['get', 'k'], 'pin'], paint: { 'line-color': '#fde68a', 'line-width': 1.4, 'line-opacity': 0.9, 'line-dasharray': [3, 2] } },
            { id: 'acc-fill', type: 'fill', source: 'acc', paint: { 'fill-color': '#60a5fa', 'fill-opacity': 0.12 } },
            { id: 'line-to', type: 'line', source: 'lines', filter: ['==', ['get', 'k'], 'to'], paint: { 'line-color': '#facc15', 'line-width': 2 } },
            { id: 'line-on', type: 'line', source: 'lines', filter: ['==', ['get', 'k'], 'on'], paint: { 'line-color': '#ffffff', 'line-width': 2 } }
        ];
        if (S.esriOn && !S.esriFailed) {
            sources.esri = { type: 'raster', tiles: [esriTileUrl().replace('{key}', encodeURIComponent(key))], tileSize: 256, maxzoom: 19,
                             attribution: esriAttribution() };
            layers.splice(2, 0, { id: 'esri', type: 'raster', source: 'esri' });
        }
        var map;
        try {
            map = new ml.Map({
                container: el,
                style: { version: 8, sources: sources, layers: layers },
                center: [0, 20], zoom: 2, bearing: 0, pitch: 0, maxPitch: 0,
                maxZoom: maxZoomNow(),
                dragRotate: false, pitchWithRotate: false, keyboard: false,
                attributionControl: false,
                // One finger pans, two fingers pinch-zoom; neither rotates - the hole
                // keeps its tee-to-green orientation until Recenter, which restores it.
                touchPitch: false
            });
        } catch (e) {
            // No WebGL on this device: the numbers still work, on the plain panel.
            S.map = null; el.classList.add('gps-no-tiles'); S.noWebgl = true; return;
        }
        map.touchZoomRotate.disableRotation();
        // ATTRIBUTION, ALWAYS ON THE MAP, never collapsed to an (i) button. It lists
        // the sources whose layers are showing, so the Esri credit leaves the map
        // with the Esri layer (while a green is set on USGS) and comes back with it.
        map.addControl(new ml.AttributionControl({ compact: false }), 'bottom-right');
        map.on('error', function (e) {
            if (!S || S.map !== map) return;
            var sid = e && e.sourceId;
            if (sid === 'esri') {
                S.esriErrs = (S.esriErrs || 0) + 1;
                // Esri is not answering: no signal, or the free tier is used up on an
                // account with no card (by design). Hand the picture to USGS.
                if (!S.esriFailed && S.esriErrs >= 4 && !S.esriLoads) {
                    S.esriFailed = true;
                    try { map.setLayoutProperty('esri', 'visibility', 'none'); } catch (x) {}
                    map.setMaxZoom(maxZoomNow());
                    refreshUsgs();
                }
            }
            if (sid === 'usgs' || sid === 'esri') { S.tileErrors++; syncNoTiles(); }
        });
        map.on('data', function (e) {
            if (!S || S.map !== map || !e || e.dataType !== 'source' || !e.tile) return;
            if (e.sourceId === 'esri') S.esriLoads = (S.esriLoads || 0) + 1;
            if (e.sourceId === 'usgs' || e.sourceId === 'esri') { S.tileLoads++; syncNoTiles(); reportMapState(); }
        });
        map.on('moveend', function () { if (S && S.map === map) reportMapState(); });
        // A move the golfer made (a pan or a pinch) - not one this file made.
        map.on('movestart', function (e) { if (S && S.map === map && e && e.originalEvent) S.userMoved = true; });
        // The pills and the ring follow the map as it moves and zooms.
        map.on('move', function () { if (S && S.map === map) { sizeTarget(); placePills(); } });
        map.on('resize', function () { if (S && S.map === map && (S.needsFrame || (S.framed === 'hole' && !S.userMoved && !S.zoomStep))) frameHole(false); });
        // Tap anywhere: the target jumps there (or a green pin is placed).
        map.on('click', function (e) { onMapTap([e.lngLat.lat, e.lngLat.lng]); });
        S.map = map;
        S.styleReady = false;
        map.on('load', function () {
            if (!S || S.map !== map) return;
            S.styleReady = true;
            refreshEsriCredit(key);
            frameHole(true);
            render();
            // READY: loaded, framed on the hole and drawn. data-zoom alone is not
            // this - tile data sets it before the load event (a check that waited
            // for it read a map still at its world view, tee at x -255).
            el.setAttribute('data-ready', '1');
        });
    }

    // Esri's own credit line, read at runtime (Maxar became Vantor in 2026). Only
    // the service metadata URL - the key, nothing about the golfer.
    function refreshEsriCredit(key) {
        if (!key || creditCache || typeof fetch !== 'function') return;
        fetch(esriMetaUrl().replace('{key}', encodeURIComponent(key))).then(function (r) { return r.json(); }).then(function (j) {
            var c = j && typeof j.copyrightText === 'string' ? j.copyrightText.trim() : '';
            if (!c || c === TILES.fallbackCredit) return;
            creditCache = c;
            // A source's attribution is fixed when it is added, so re-add the Esri
            // source and layer with the real credit.
            if (!S || !S.map || !S.map.getSource('esri')) return;
            var m = S.map, vis = m.getLayoutProperty('esri', 'visibility') || 'visible';
            try {
                m.removeLayer('esri'); m.removeSource('esri');
                m.addSource('esri', { type: 'raster', tiles: [esriTileUrl().replace('{key}', encodeURIComponent(key))], tileSize: 256, maxzoom: 19, attribution: esriAttribution() });
                m.addLayer({ id: 'esri', type: 'raster', source: 'esri', layout: { visibility: vis } }, 'hole-line');
            } catch (e) {}
        }, function () { /* offline: the fallback credit stays */ });
    }

    // WHAT THE MAP IS DOING, on the map element - so a check (and anybody with the
    // inspector open) can read it. A WebGL map is one canvas; its tiles and layers
    // are not elements to count.
    function reportMapState() {
        var el = S && S.el.querySelector('.gps-map');
        if (!el || !S.map) return;
        var esri = !S.esriOn ? 'off' : (S.esriFailed ? 'failed' : (S.map.getLayer('esri') ? (S.map.getLayoutProperty('esri', 'visibility') || 'visible') : 'off'));
        el.setAttribute('data-esri', esri);
        el.setAttribute('data-esri-loads', String(S.esriLoads || 0));
        el.setAttribute('data-tiles-loaded', String(S.tileLoads || 0));
        el.setAttribute('data-max-zoom', String(S.map.getMaxZoom()));
        el.setAttribute('data-bearing', String(Math.round(S.map.getBearing())));
        el.setAttribute('data-zoom', S.map.getZoom().toFixed(2));
        var r = resolved();
        if (r && r.tee) { var tp = S.map.project(ll(r.tee)); el.setAttribute('data-tee-px', Math.round(tp.x) + ',' + Math.round(tp.y)); }
        if (r && r.green && r.green.length) {
            var gb = [Infinity, Infinity, -Infinity, -Infinity];
            r.green.forEach(function (p) { var q = S.map.project(ll(p)); gb = [Math.min(gb[0], q.x), Math.min(gb[1], q.y), Math.max(gb[2], q.x), Math.max(gb[3], q.y)]; });
            el.setAttribute('data-green-box', gb.map(Math.round).join(','));
        }
        el.setAttribute('data-attrib-h', String(attribH()));
        S.el.querySelector('.gps-map-wrap').style.setProperty('--gps-attrib-h', attribH() + 'px');
        maybeRefit();
    }
    // The hole's own view follows the screen until the golfer moves the map: the
    // phone's toolbars settle, or the attribution bar gains the Esri credit.
    function maybeRefit() {
        if (!S || !S.map || S.framed !== 'hole' || S.userMoved || S.zoomStep) return;
        var h = attribH();
        if (S.attribAt != null && h !== S.attribAt) frameHole(false);
    }

    // The plain background only when NOTHING has drawn.
    function syncNoTiles() {
        if (!S) return;
        var on = S.tileLoads === 0 && S.tileErrors >= 4;
        S.noTiles = on;
        var el = S.el.querySelector('.gps-map');
        if (el) {
            el.classList.toggle('gps-no-tiles', on);
            el.setAttribute('data-tiles-loaded', String(S.tileLoads));
        }
        var note = S.el.querySelector('.gps-tiles-note');
        if (note) note.style.display = on ? '' : 'none';
    }

    // SETTING A GREEN ALWAYS USES USGS, never Esri, even when Esri is on
    // (decision 2026-10-07): a tapped green is stored and shared, and deriving
    // shared data from Esri imagery is outside its "visualization purposes"
    // licence; USGS imagery is public domain. While a green is being set the Esri
    // layer (and with it its credit) comes off the map; it goes back afterwards.
    function syncImageryForMode() {
        if (!S || !S.map || !S.styleReady) return;
        // Today's pin is shared data too: placed on USGS, like a green.
        var pinning = S.mode !== 'measure' || !!S.editingPin;
        if (S.map.getLayer('esri')) {
            var want = (pinning || S.esriFailed) ? 'none' : 'visible';
            if (S.map.getLayoutProperty('esri', 'visibility') !== want) {
                S.map.setLayoutProperty('esri', 'visibility', want);
                if (want === 'none') refreshUsgs();
            }
        }
        if (S.map.getMaxZoom() !== maxZoomNow()) S.map.setMaxZoom(maxZoomNow());
        reportMapState();
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

    // ---- THE HOLE VIEW: TEE AT THE BOTTOM, GREEN AT THE TOP ---------------------
    // Framed on the HOLE, never on the golfer (see PRIVACY above): the back tee to
    // the green's outline, rotated so tee -> green points up, fitted top to bottom
    // with a small margin. A hole with no data at all is framed on the dot,
    // north-up, so the golfer can see the ground to tap the green.
    // The bottom margin is measured, not guessed: the attribution bar grows to two
    // or three lines with the Esri credit, and a fixed 36px let it cover the tee
    // (hole 1, Manny's screenshot 2026-10-07). The tee sits 24px above the bar;
    // the top clears the 1x and Recenter buttons.
    var VIEW_PAD = { top: 56, bottom: 36, left: 18, right: 18 };
    function attribH() {
        var a = S && S.el.querySelector('.maplibregl-ctrl-attrib');
        return a ? Math.ceil(a.getBoundingClientRect().height) : 20;
    }
    function viewPad() {
        // The attribution bar, the score / wind row above it (38px + 8px gap), and
        // 16px clear above that for the tee.
        return { top: VIEW_PAD.top, bottom: Math.max(VIEW_PAD.bottom, attribH() + 8 + 38 + 16), left: VIEW_PAD.left, right: VIEW_PAD.right };
    }
    function holeView() {
        if (!S || !S.map) return null;
        var r = resolved();
        if (!r) return null;
        var greenPts = (r.green && r.green.length) ? r.green : (r.mid ? [r.mid] : null);
        var el = S.el.querySelector('.gps-map');
        var w = el ? el.clientWidth : 390, h = el ? el.clientHeight : 500;
        if (r.tee && greenPts) return G.holeCamera(r.tee, greenPts, { w: w, h: h }, viewPad(), maxZoomNow());
        if (r.mid) return { center: r.mid, zoom: 18, bearing: 0 };
        return null;
    }
    function frameHole(first) {
        if (!S || !S.map || !S.styleReady) return;
        // A hidden map (Bets is showing) has no size to fit the hole into: framed
        // now it would come back as a speck. Framed when GPS shows it again.
        var box = S.el.querySelector('.gps-map');
        if (!box || box.clientWidth < 10 || box.clientHeight < 10) { S.needsFrame = true; return; }
        S.needsFrame = false;
        var cam = holeView();
        if (cam) {
            S.pad = viewPad();
            S.map.jumpTo({ center: ll(cam.center), zoom: cam.zoom, bearing: cam.bearing, padding: S.pad });
            S.framed = 'hole';
            S.camera = cam;
        } else if (first || S.framed === 'hole') {
            S.map.jumpTo({ center: [0, 20], zoom: 2, bearing: 0, padding: viewPad() });
            S.framed = null; S.camera = null;
        }
        // Back to 1x, and the view is the hole's own again (a resize or a taller
        // attribution bar may re-fit it until the golfer moves the map).
        S.zoomStep = 0; S.userMoved = false; S.attribAt = attribH();
        txt('.gps-zoom', ZOOM_STEPS[0] + 'x');
        sizeTarget(); placePills(); syncWind();
        var el = S.el.querySelector('.gps-map');
        if (el) {
            el.setAttribute('data-bearing', String(Math.round(S.map.getBearing())));
            el.setAttribute('data-zoom', S.map.getZoom().toFixed(2));
        }
    }

    // ---- DRAWING ----------------------------------------------------------------
    function setData(id, fc) { var s = S.map && S.map.getSource(id); if (s) s.setData(fc); }
    function feature(k, type, coords) { return { type: 'Feature', properties: { k: k }, geometry: { type: type, coordinates: coords } }; }
    function pinEl(cls, label, interactive) {
        var el = document.createElement('div');
        el.className = 'gps-pin ' + cls;
        el.innerHTML = '<span>' + label + '</span>';
        if (!interactive) el.style.pointerEvents = 'none';      // a tap on a pin is a tap on the map
        return el;
    }
    function marker(key, pt, makeEl) {
        S.markers = S.markers || {};
        var m = S.markers[key];
        if (!pt) { if (m) { m.remove(); delete S.markers[key]; } return null; }
        if (!m) { m = new (ML().Marker)({ element: makeEl(), anchor: 'center' }).setLngLat(ll(pt)).addTo(S.map); S.markers[key] = m; }
        else m.setLngLat(ll(pt));
        return m;
    }
    function drawLayers() {
        if (!S || !S.map || !S.styleReady) return;
        var r = resolved();
        var feats = [];
        var osmRec = osmRecord(S.courseKey), h = osmRec && osmRec.holes && osmRec.holes[String(S.hole)];
        if (h && h.osm && h.osm.tee && h.osm.end) feats.push(feature('line', 'LineString', [ll(h.osm.tee), ll(h.osm.end)]));
        if (r && r.green) feats.push(feature('green', 'Polygon', [r.green.concat([r.green[0]]).map(ll)]));
        setData('hole', { type: 'FeatureCollection', features: feats });
        var o = origin(r);
        var nums = r ? G.holeNumbers(o ? o.pt : null, r) : null;
        marker('front', nums && nums.front, function () { return pinEl('gps-pin-front', 'F'); });
        marker('back', nums && nums.back, function () { return pinEl('gps-pin-back', 'B'); });
        marker('mid', r && r.mid, function () { return pinEl('gps-pin-mid', 'C'); });
        marker('dmid', S.draft && S.draft.mid, function () { return pinEl('gps-pin-mid gps-pin-draft', 'C'); });
        marker('dfront', S.draft && S.draft.front, function () { return pinEl('gps-pin-front gps-pin-draft', 'F'); });
        marker('dback', S.draft && S.draft.back, function () { return pinEl('gps-pin-back gps-pin-draft', 'B'); });
        marker('tee', o && o.from === 'tee' ? o.pt : null, function () { return pinEl('gps-pin-tee', 'T'); });
        drawArcs(r, o);
        drawFlag(r);
    }

    // ---- YARDAGE ARCS (Wave 1) ------------------------------------------------
    // Drawn from where the numbers are measured from (the golfer, or the tee
    // when off the hole) toward today's pin or the green's center. All local
    // math on bundled data: they work with no signal. Each carries a small label
    // ("125y", or "150 to pin") at its LEFT end on screen - which end that is
    // depends on the hole's turn, so it is worked out on every move.
    function drawArcs(r, o) {
        var aim = aimAt(r);
        S.arcs = (S.mode === 'measure' && o && aim) ? G.yardageArcs(o.pt, aim) : [];
        setData('arcs', { type: 'FeatureCollection', features: S.arcs.map(function (a) { return feature(a.kind, 'LineString', a.pts.map(ll)); }) });
        var mel = S.el.querySelector('.gps-map');
        if (mel) mel.setAttribute('data-arcs', S.arcs.map(function (a) { return (a.kind === 'pin' ? 'p' : 'c') + a.yards; }).join(' '));
    }
    function placeArcLabels(obstacles) {
        var box = S && S.el.querySelector('.gps-arc-labels');
        if (!box) return;
        var arcs = (S.map && S.styleReady && S.side === 'gps' && S.mode === 'measure') ? (S.arcs || []) : [];
        while (box.children.length < arcs.length) { var e = document.createElement('span'); e.className = 'gps-arc-lbl'; box.appendChild(e); }
        var wrapR = S.el.querySelector('.gps-map-wrap').getBoundingClientRect();
        var u = units();
        for (var i = 0; i < box.children.length; i++) {
            var el = box.children[i], a = arcs[i];
            if (!a) { el.style.display = 'none'; continue; }
            var p0 = S.map.project(ll(a.pts[0])), p1 = S.map.project(ll(a.pts[a.pts.length - 1]));
            var L = p0.x <= p1.x ? p0 : p1;
            var n = u === 'm' ? Math.round(a.yards * G.M_PER_YD) + 'm' : a.yards + 'y';
            el.textContent = a.kind === 'pin' ? n + ' to pin' : n;
            el.className = 'gps-arc-lbl' + (a.kind === 'pin' ? ' gps-arc-lbl-pin' : '');
            el.style.display = ''; el.style.visibility = 'hidden';
            var w = el.offsetWidth, h = el.offsetHeight;
            var rc = { l: L.x - w - 3, t: L.y - h / 2, r: L.x - 3, b: L.y + h / 2 };
            var clash = rc.l < 2 || rc.t < 2 || rc.r > wrapR.width - 2 || rc.b > wrapR.height - 2 ||
                (obstacles || []).some(function (ob) { return hits(rc, ob); });
            if (clash) { el.style.display = 'none'; continue; }
            el.style.left = Math.round(rc.l) + 'px'; el.style.top = Math.round(rc.t) + 'px'; el.style.visibility = '';
            (obstacles || []).push(rc);
        }
    }

    // ---- TODAY'S PIN: THE FLAG (Wave 1) -------------------------------------------
    // Shown whenever a pin is set for today; draggable only in "Edit Pin". It
    // cannot leave the green: a drag past the edge stops at the edge.
    function drawFlag(r) {
        var loc = pinLoc();
        var showIt = !!(loc && r && r.mid && (S.mode === 'measure'));
        var m = marker('flag', showIt ? loc : null, function () {
            var e = document.createElement('div');
            e.className = 'gps-flag';
            e.innerHTML = '<span>⚑</span>';
            return e;
        });
        if (!m) return;
        m.getElement().classList.toggle('gps-flag-edit', !!S.editingPin);
        if (m.isDraggable() !== !!S.editingPin) m.setDraggable(!!S.editingPin);
        if (!m.__hpWired) {
            m.__hpWired = true;
            m.on('drag', function () {
                if (!S || !S.editingPin) return;
                var p = m.getLngLat(), rr = resolved();
                var c = G.clampToGreen([p.lat, p.lng], rr && rr.green, rr && rr.mid);
                if (c[0] !== p.lat || c[1] !== p.lng) m.setLngLat(ll(c));
                S.pinDraft = c;
                render();
            });
            m.on('dragend', function () { if (S) { S.dragEndedAt = Date.now(); render(); } });
        }
    }
    function startEditPin() {
        var r = resolved();
        if (!r || !r.mid) return;
        S.editingPin = true;
        S.pinDraft = pinLoc() || r.mid;
        S.targetMoved = false;
        render();
    }
    function endEditPin(save) {
        if (!S) return;
        var k = holeKey(S.hole), draft = S.pinDraft;
        S.editingPin = false; S.pinDraft = null;
        if (save === 'save' && draft) writeLoc(k, { lat: draft[0], lng: draft[1], at: Date.now() });
        else if (save === 'clear') writeLoc(k, null);
        S.targetMoved = false; S.target = null;
        render();
    }
    // ONE writer for today's pin: the page's durable queue (a pin moved with no
    // signal survives the app closing), with a local copy so the screen follows
    // at once. Only a point dragged ON THE GREEN is ever here - never the golfer.
    function writeLoc(k, val) {
        S.localLocs = S.localLocs || {};
        S.localLocs[k] = val;
        S.localLocsAt = S.localLocsAt || {};
        S.localLocsAt[k] = Date.now();
        if (typeof S.writeHoleLoc === 'function') { try { S.writeHoleLoc(k, val); } catch (e) {} }
    }
    function circlePoly(pt, radiusM) {
        var ring = [];
        for (var i = 0; i <= 32; i++) {
            var a = 2 * Math.PI * i / 32;
            var dLat = (radiusM * Math.cos(a)) / 111320;
            var dLng = (radiusM * Math.sin(a)) / (111320 * Math.cos(pt[0] * Math.PI / 180));
            ring.push([pt[1] + dLng, pt[0] + dLat]);
        }
        return { type: 'FeatureCollection', features: [feature('acc', 'Polygon', [ring])] };
    }
    function drawDot() {
        if (!S || !S.map || !S.styleReady) return;
        var o = origin(resolved());
        // OFF THE HOLE (or no GPS): the numbers are from the tee, and the dot -
        // which would sit miles away or nowhere - is hidden.
        var showDot = !!(fix && o && o.from === 'me');
        setData('acc', showDot && isFinite(fix.acc) && fix.acc > 0 ? circlePoly(fix.pt, fix.acc) : EMPTY);
        marker('dot', showDot ? fix.pt : null, function () { var e = document.createElement('div'); e.className = 'gps-dot'; e.style.pointerEvents = 'none'; return e; });
        if (fix && !S.framed && S.map) {
            // A hole with no data: the golfer has to see the ground around them to
            // tap the green. This is the one view framed on the dot.
            S.map.jumpTo({ center: ll(fix.pt), zoom: 17, bearing: 0 });
            S.framed = 'dot';
        }
    }

    // ---- WHERE THE NUMBERS ARE MEASURED FROM ------------------------------------
    // The golfer when they are on or near the hole; the TEE when they are more
    // than 1,000 yards from the green or have no fix (gps-geo.measureOrigin).
    function origin(r) {
        if (!r) return fix ? { from: 'me', pt: fix.pt } : null;
        return G.measureOrigin(fix ? fix.pt : null, r.tee, r.mid);
    }

    // ---- THE TARGET -----------------------------------------------------------
    // A crosshair the golfer drags, or moves by tapping the map. Until they touch
    // it, it sits halfway between where the numbers are measured from and the
    // green's center, and follows as they walk; once touched it stays put until
    // the hole changes. Dragging it does not pan the map (a marker drag belongs to
    // the marker); a drag anywhere else pans, and two fingers zoom.
    function placeTarget(r) {
        if (!S || S.targetMoved) return;
        var center = aimAt(r), o = origin(r);
        var p = (o && center) ? G.midpoint(o.pt, center) : null;
        if (p) S.target = p;
    }
    function drawTargetLines() {
        if (!S || !S.map || !S.styleReady) return;
        var feats = [];
        if (S.target && S.mode === 'measure') {
            var r = resolved(), o = origin(r);
            if (o) feats.push(feature('to', 'LineString', [ll(o.pt), ll(S.target)]));
            var aim = aimAt(r);
            if (aim) feats.push(feature('on', 'LineString', [ll(S.target), ll(aim)]));
        }
        setData('lines', { type: 'FeatureCollection', features: feats });
    }
    function targetReadout() {
        if (!S || !G) return;
        var r = resolved(), o = origin(r);
        var u = units();
        var on = !!S.target && S.mode === 'measure';
        show('.gps-target-row', on);
        if (!on) return;
        var who = o && o.from === 'tee' ? 'Tee' : 'You';
        txt('.gps-to-here', who + ' → here: ' + (o ? G.shownDistance(G.haversineMeters(o.pt, S.target), u) : '—'));
        var aim = aimAt(r);
        txt('.gps-here-center', 'Here → ' + (pinLoc() ? 'pin' : 'center') + ': ' + (aim ? G.shownDistance(G.haversineMeters(S.target, aim), u) : '—'));
    }
    function drawTarget() {
        if (!S || !S.map || !S.styleReady) return;
        drawTargetLines();
        var want = !!S.target && S.mode === 'measure';
        if (!want) { if (S.targetMarker) { S.targetMarker.remove(); S.targetMarker = null; } return; }
        if (!S.targetMarker) {
            var el = document.createElement('div');
            el.className = 'gps-target';
            el.innerHTML = '<span class="gps-ring"></span><span class="gps-ring-lbl"></span>';
            var m = new (ML().Marker)({ element: el, draggable: true, anchor: 'center' }).setLngLat(ll(S.target)).addTo(S.map);
            m.on('dragstart', function () { if (!S) return; S.dragging = true; S.targetMoved = true; });
            m.on('drag', function () {
                if (!S) return;
                var p = m.getLngLat();
                S.target = [p.lat, p.lng];
                drawTargetLines();
                targetReadout();
                placePills();
            });
            m.on('dragend', function () {
                if (!S) return;
                // The click MapLibre may fire at the end of a drag must not be read as
                // a tap that moves the target again.
                S.dragging = false; S.dragEndedAt = Date.now();
                render();
            });
            S.targetMarker = m;
        } else if (!S.dragging) {
            var cur = S.targetMarker.getLngLat();
            if (cur.lat !== S.target[0] || cur.lng !== S.target[1]) S.targetMarker.setLngLat(ll(S.target));
        }
        sizeTarget();
    }

    // ---- THE TARGET RING IS A REAL SIZE ON THE GROUND -------------------------
    // 10 yards in radius (20 yards across), drawn to the map's scale, so it grows
    // and shrinks with the zoom like the ground under it. Its width is written next
    // to it. The touch area around it never drops below 48px.
    var TARGET_RADIUS_YD = 10;
    function metersPerPx(lat) {
        return 40075016.686 * Math.cos(lat * Math.PI / 180) / (512 * Math.pow(2, S.map.getZoom()));
    }
    function sizeTarget() {
        if (!S || !S.map || !S.targetMarker || !S.target) return;
        var d = Math.max(6, Math.round(2 * TARGET_RADIUS_YD * G.M_PER_YD / metersPerPx(S.target[0])));
        var box = Math.max(48, d + 20);
        var el = S.targetMarker.getElement();
        el.style.width = box + 'px'; el.style.height = box + 'px';
        el.setAttribute('data-ring-px', String(d));
        var ring = el.querySelector('.gps-ring');
        if (ring) { ring.style.width = d + 'px'; ring.style.height = d + 'px'; }
        var lbl = el.querySelector('.gps-ring-lbl');
        if (lbl) {
            var w = units() === 'm' ? Math.round(2 * TARGET_RADIUS_YD * G.M_PER_YD) + ' m' : (2 * TARGET_RADIUS_YD) + ' yd';
            if (lbl.textContent !== w) lbl.textContent = w;
            lbl.style.left = Math.round(box / 2 + d / 2 + 6) + 'px';
        }
    }

    // ---- ZOOM: 1x -> 2x -> 3x -> 1x -----------------------------------------------
    // Around the target (or the golfer's dot when there is no target), keeping the
    // hole's tee-to-green turn. 1x is the hole's own view; Recenter goes back to it.
    // Never past the imagery's closest zoom (maxZoomNow).
    var ZOOM_STEPS = [1, 2, 3];
    function zoomAround() {
        var o = origin(resolved());
        if (S.target && S.mode === 'measure') return S.target;
        if (fix && o && o.from === 'me') return fix.pt;
        return null;
    }
    function cycleZoom() {
        if (!S || !S.map || !S.styleReady) return;
        var next = ((S.zoomStep || 0) + 1) % ZOOM_STEPS.length;
        if (next === 0) {
            if (S.camera) { frameHole(false); return; }
            S.map.jumpTo({ zoom: S.zoomBase != null ? S.zoomBase : S.map.getZoom() });
        } else {
            if (!S.zoomStep) S.zoomBase = S.camera ? S.camera.zoom : S.map.getZoom();
            var opts = { zoom: Math.min(S.zoomBase + Math.log2(ZOOM_STEPS[next]), maxZoomNow()), padding: S.pad || viewPad() };
            var c = zoomAround();
            if (c) opts.center = ll(c);
            if (S.camera) opts.bearing = S.camera.bearing;
            S.map.jumpTo(opts);
        }
        S.zoomStep = next;
        txt('.gps-zoom', ZOOM_STEPS[next] + 'x');
        sizeTarget(); placePills(); reportMapState();
    }

    // ---- DISTANCES ON THE LINES -----------------------------------------------
    // Small dark pills on the yellow line (tee or golfer -> target) and the white
    // line (target -> green center), like 18Birdies. A pill never covers the
    // target, its ring label, the green, a pin, the dot or a control: it slides
    // along its line (and off to either side of it) to the first clear spot, and
    // hides when there is none. The same numbers stay under FRONT / CENTER / BACK.
    function rectOf(el, wrapR) {
        if (!el || el.style.display === 'none') return null;
        var b = el.getBoundingClientRect();
        if (!b.width && !b.height) return null;
        return { l: b.left - wrapR.left, t: b.top - wrapR.top, r: b.right - wrapR.left, b: b.bottom - wrapR.top };
    }
    function hits(a, b) { return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t; }
    function placePills() {
        if (!S) return;
        var pTo = S.el.querySelector('.gps-pill-to'), pOn = S.el.querySelector('.gps-pill-on');
        if (!pTo || !pOn) return;
        pTo.style.display = 'none'; pOn.style.display = 'none';
        if (!S.map || !S.styleReady || !S.target || S.mode !== 'measure' || S.side !== 'gps') return;
        var r = resolved(), o = origin(r), u = units();
        var wrap = S.el.querySelector('.gps-map-wrap'), wrapR = wrap.getBoundingClientRect();
        var W = wrapR.width, H = wrapR.height;
        var P = function (pt) { var q = S.map.project(ll(pt)); return { x: q.x, y: q.y }; };
        var M = 4, obstacles = [];
        var add = function (rc, m) { if (rc) obstacles.push({ l: rc.l - m, t: rc.t - m, r: rc.r + m, b: rc.b + m }); };
        var tEl = S.targetMarker && S.targetMarker.getElement();
        add(rectOf(tEl, wrapR), M);
        add(rectOf(tEl && tEl.querySelector('.gps-ring-lbl'), wrapR), M);
        Object.keys(S.markers || {}).forEach(function (k) { add(rectOf(S.markers[k].getElement(), wrapR), M); });
        if (r && r.green && r.green.length) {
            var g = r.green.map(P), gb = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
            g.forEach(function (q) { gb.l = Math.min(gb.l, q.x); gb.r = Math.max(gb.r, q.x); gb.t = Math.min(gb.t, q.y); gb.b = Math.max(gb.b, q.y); });
            add(gb, M);
        }
        ['.gps-zoom', '.gps-recenter', '.gps-banner', '.gps-score', '.gps-wind', '.maplibregl-ctrl-attrib'].forEach(function (sel) { add(rectOf(S.el.querySelector(sel), wrapR), M); });
        var put = function (pill, a, b, text) {
            if (!a || !b || text === '\u2014') return;
            pill.textContent = text;
            pill.style.visibility = 'hidden'; pill.style.display = '';
            var w = pill.offsetWidth, h = pill.offsetHeight;
            var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
            var nx = -dy / len, ny = dx / len, side = Math.hypot(w, h) / 2 + 6;
            var ts = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88];
            for (var i = 0; i < ts.length; i++) {
                for (var j = 0; j < 3; j++) {
                    var off = j === 0 ? 0 : (j === 1 ? side : -side);
                    var cx = a.x + dx * ts[i] + nx * off, cy = a.y + dy * ts[i] + ny * off;
                    var rc = { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 };
                    if (rc.l < M || rc.t < M || rc.r > W - M || rc.b > H - M) continue;
                    if (obstacles.some(function (ob) { return hits(rc, ob); })) continue;
                    pill.style.left = Math.round(rc.l) + 'px'; pill.style.top = Math.round(rc.t) + 'px';
                    pill.style.visibility = '';
                    obstacles.push(rc);
                    return;
                }
            }
            pill.style.display = 'none';
        };
        var t = P(S.target);
        var aim = aimAt(r);
        if (aim) put(pOn, t, P(aim), G.shownDistance(G.haversineMeters(S.target, aim), u));
        if (o) put(pTo, P(o.pt), t, G.shownDistance(G.haversineMeters(o.pt, S.target), u));
        placeArcLabels(obstacles);
    }

    // ---- WIND (Wave 1) ----------------------------------------------------------
    // The National Weather Service's hourly forecast (api.weather.gov - free, no
    // key, US only) for the COURSE: a point from the bundled course data, to 3
    // decimals - never the golfer's position (see PRIVACY above). Asked for only
    // while the GPS side is showing, at most every 15 minutes per course (the
    // answer is kept on the phone); the NWS grid point for the course is kept for
    // a week. The box shows the last reading up to an hour old; with no reading
    // (offline, outside the US, any error) it is quietly not there.
    var WIND_FRESH_MS = 15 * 60 * 1000, WIND_SHOW_MS = 60 * 60 * 1000, NWS_POINT_MS = 7 * 24 * 3600 * 1000;
    function nwsBase() {
        var c = (typeof window !== 'undefined' && window.HARDPAN_GPS_CONFIG) || {};
        return c.nwsBase || 'https://api.weather.gov';
    }
    function coursePoint() {
        var osm = osmRecord(S.courseKey), first = null;
        if (osm && osm.holes) {
            var ks = Object.keys(osm.holes).sort(function (a, b) { return a - b; });
            for (var i = 0; i < ks.length && !first; i++) first = osm.holes[ks[i]].osm && osm.holes[ks[i]].osm.mid;
        }
        if (!first) { var r = resolved(); first = r && r.mid; }
        return first ? [Math.round(first[0] * 1e3) / 1e3, Math.round(first[1] * 1e3) / 1e3] : null;
    }
    function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    function windKey() { return 'hardpan_wind_v1_' + S.courseKey; }
    function fetchWind() {
        if (!S || S.windInFlight || typeof fetch !== 'function') return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        var pt = coursePoint();
        if (!pt) return;
        var mine = S, key = windKey(), ptKey = 'hardpan_nws_point_v1_' + S.courseKey;
        var hdr = { headers: { Accept: 'application/geo+json' } };
        S.windInFlight = true;
        var done = function () { mine.windInFlight = false; };
        var cachedPt = lsGet(ptKey);
        var hourly = (cachedPt && cachedPt.url && Date.now() - cachedPt.at < NWS_POINT_MS) ? Promise.resolve(cachedPt.url)
            : fetch(nwsBase() + '/points/' + pt[0] + ',' + pt[1], hdr).then(function (r) { if (!r.ok) throw new Error('nws ' + r.status); return r.json(); })
                .then(function (j) { var u = j && j.properties && j.properties.forecastHourly; if (!u) throw new Error('no hourly'); lsSet(ptKey, { at: Date.now(), url: u }); return u; });
        hourly.then(function (u) {
            // NWS hands back an absolute URL; a stand-in base (the checks) keeps its own host.
            if (nwsBase() !== 'https://api.weather.gov') u = u.replace(/^https:\/\/api\.weather\.gov/, nwsBase());
            return fetch(u, hdr);
        }).then(function (r) { if (!r.ok) throw new Error('nws ' + r.status); return r.json(); }).then(function (j) {
            var per = j && j.properties && j.properties.periods && j.properties.periods[0];
            var w = G.parseNwsWind(per);
            lsSet(key, w ? { at: Date.now(), mph: w.mph, toDeg: w.toDeg, fromDeg: w.fromDeg } : { at: Date.now(), none: true });
            done();
            if (S === mine) syncWind();
        }).catch(function () { done(); if (S === mine) { S.windFailedAt = Date.now(); syncWind(); } });
    }
    function syncWind() {
        if (!S) return;
        var box = S.el.querySelector('.gps-wind');
        if (!box) return;
        var w = lsGet(windKey()), now = Date.now();
        var stale = !w || now - w.at > WIND_FRESH_MS;
        // Ask again when stale - but not more than once a minute after a failure.
        if (S.side === 'gps' && stale && !(S.windFailedAt && now - S.windFailedAt < 60000)) fetchWind();
        var showIt = !!(w && !w.none && now - w.at <= WIND_SHOW_MS && S.side === 'gps');
        box.style.display = showIt ? '' : 'none';
        if (!showIt) return;
        txt('.gps-wind-mph', w.mph + ' mph');
        var arrow = box.querySelector('.gps-wind-arrow');
        var bearing = S.map ? S.map.getBearing() : 0;
        // The arrow points where the wind BLOWS, turned with the map.
        var rot = Math.round(((w.toDeg - bearing) % 360 + 360) % 360);
        arrow.style.transform = 'rotate(' + rot + 'deg)';
        box.setAttribute('data-rot', String(rot));
        box.setAttribute('aria-label', 'Wind ' + w.mph + ' mph from ' + ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(w.fromDeg / 22.5) % 16]);
    }

    // ---- NO PULL-DOWN ON GPS ----------------------------------------------------
    // A drag on the GPS side moves the map and nothing else: no page scroll, no
    // pull-to-refresh, no rubber-band bounce. CSS (overscroll-behavior / touch-
    // action) does most of it; iOS Safari also needs the page's touchmove refused
    // while GPS is showing. The map's own gestures are unaffected - MapLibre has
    // the event before it bubbles here. There is no left/right hole swipe on the
    // GPS side to keep (holes change with the arrows).
    function blockPull(e) {
        if (S && S.side === 'gps' && e.cancelable) e.preventDefault();
    }

    // ---- TAPS ---------------------------------------------------------------
    function onMapTap(pt) {
        if (!S) return;
        if (S.dragEndedAt && Date.now() - S.dragEndedAt < 350) return;
        if (S.mode === 'setMid') { S.draft = { mid: pt }; S.mode = 'confirmMid'; render(); return; }
        if (S.mode === 'setFront') { S.draft.front = pt; S.mode = 'setBack'; render(); return; }
        if (S.mode === 'setBack') { S.draft.back = pt; S.mode = 'confirmAll'; render(); return; }
        if (S.mode !== 'measure') return;
        if (S.editingPin) {
            // Editing today's pin: a tap moves the flag there (kept on the green).
            var rr = resolved();
            S.pinDraft = G.clampToGreen(pt, rr && rr.green, rr && rr.mid);
            render();
            return;
        }
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
        var o = origin(r);
        var nums = r ? G.holeNumbers(o ? o.pt : null, r) : null;
        // Never more than four digits: anything longer is not a golf distance and
        // would push FRONT / CENTER / BACK off the screen.
        var d = function (m) { return G.shownDistance(m, u); };

        txt('.gps-title', 'Hole ' + S.hole + (S.par ? ' · Par ' + S.par : ''));
        txt('.gps-units', u === 'm' ? 'Meters' : 'Yards');
        txt('.gps-f', nums ? (nums.onGreen ? 'ON' : d(nums.frontM)) : '—');
        // CENTER is to today's pin when one is set - and says PIN.
        var aim = aimAt(r);
        txt('.gps-m', (nums && aim && o) ? d(G.haversineMeters(o.pt, aim)) : '—');
        txt('.gps-lbl-mid', pinLoc() ? 'PIN' : 'CENTER');
        txt('.gps-b', nums ? d(nums.backM) : '—');

        var acc = S.geoError ? null : (fix ? G.accuracyLabel(fix.acc, u) : { text: 'Finding you…', weak: false });
        // OFF THE HOLE (more than 1,000 yds from the green) or NO GPS: everything is
        // measured from the TEE, and says so.
        var fromTee = !!(o && o.from === 'tee');
        // No "Measuring from tee" label on the map (Wave 1: obvious and expected
        // when you are not on the hole); the line under the numbers still says it.
        if (fromTee && acc && fix) acc = { text: 'You are off this hole', weak: false };
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
        else if (S.editingPin) banner = 'Drag the flag to today\'s pin';
        else if (S.loadingCourses) banner = 'Loading the course…';
        else if (noGreen) banner = 'No green mapped for this hole yet';
        txt('.gps-banner', banner);
        show('.gps-banner', !!banner);

        var pinning = S.mode !== 'measure' || !!S.editingPin;
        show('.gps-set-green', !pinning && noGreen && !S.loadingCourses);
        show('.gps-fix-green', !pinning && !noGreen && !!S.canFix);
        show('.gps-edit-pin', !pinning && !noGreen);
        show('.gps-pin-save', !!S.editingPin);
        show('.gps-pin-cancel', !!S.editingPin);
        show('.gps-pin-clear', !!S.editingPin && !!(S.localLocs && S.localLocs[holeKey(S.hole)] !== undefined ? S.localLocs[holeKey(S.hole)] : (S.round && S.round.pinLocs && S.round.pinLocs[holeKey(S.hole)])));
        // THE SCORE BUTTON: the hole's own score entry, on the card (Bets side).
        txt('.gps-score', 'Hole ' + S.hole + ' · Enter Score');
        show('.gps-score', !pinning && typeof S.openScore === 'function');
        var canUndo = !pinning && !!S.canFix && r && r.source === 'pin' && r.pin && !!G.undoPin(r.pin, 1);
        show('.gps-undo-green', !!canUndo);
        show('.gps-skip', S.mode === 'setFront' || S.mode === 'setBack');
        show('.gps-addedges', S.mode === 'confirmMid');
        show('.gps-save', S.mode === 'confirmMid' || S.mode === 'confirmAll');
        show('.gps-cancel', S.mode !== 'measure');
        txt('.gps-src', r && r.source === 'osm' ? 'Green from OpenStreetMap'
            : (r && r.source === 'pin' ? (r.pin.by === 'undo' ? 'Green restored by undo' : 'Green set by a golfer') : ''));

        syncImageryForMode();
        drawLayers();
        drawDot();
        drawTarget();
        placePills();
        syncWind();
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
        +   '<div class="gps-arc-labels"></div>'
        +   '<button type="button" class="gps-zoom" aria-label="Zoom 1x, 2x or 3x">1x</button>'
        +   '<button type="button" class="gps-recenter" aria-label="Recenter on the hole">⌖ Recenter</button>'
        +   '<div class="gps-pill gps-pill-to" style="display:none"></div>'
        +   '<div class="gps-pill gps-pill-on" style="display:none"></div>'
        +   '<div class="gps-bottom-row">'
        +     '<button type="button" class="gps-score" style="display:none"></button>'
        +     '<div class="gps-wind" style="display:none" aria-label="Wind"><span class="gps-wind-arrow">↑</span><span class="gps-wind-mph"></span></div>'
        +   '</div>'
        +   '<div class="gps-tiles-note" style="display:none">No satellite view here without signal — yardages still work.</div>'
        + '</div>'
        + '<div class="gps-panel">'
        +   '<div class="gps-nums">'
        +     '<div class="gps-num"><div class="gps-lbl">FRONT</div><div class="gps-big gps-f">—</div></div>'
        +     '<div class="gps-num gps-num-mid"><div class="gps-lbl gps-lbl-mid">CENTER</div><div class="gps-big gps-m">—</div></div>'
        +     '<div class="gps-num"><div class="gps-lbl">BACK</div><div class="gps-big gps-b">—</div></div>'
        +   '</div>'
        +   '<div class="gps-sub"><span class="gps-acc"></span><span class="gps-src"></span></div>'
        +   '<div class="gps-msg" style="display:none"></div>'
        +   '<div class="gps-verify" style="display:none"></div>'
        +   '<div class="gps-target-row" style="display:none"><span class="gps-to-here"></span><span class="gps-here-center"></span></div>'
        +   '<div class="gps-actions">'
        +     '<button type="button" class="gps-btn gps-set-green" style="display:none">Tap the center of the green</button>'
        +     '<button type="button" class="gps-btn gps-edit-pin" style="display:none">Edit Pin</button>'
        +     '<button type="button" class="gps-btn gps-fix-green" style="display:none">Fix the green</button>'
        +     '<button type="button" class="gps-btn gps-primary gps-pin-save" style="display:none">Save pin</button>'
        +     '<button type="button" class="gps-btn gps-pin-clear" style="display:none">Pin to center</button>'
        +     '<button type="button" class="gps-btn gps-pin-cancel" style="display:none">Cancel</button>'
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
        + '#gps-overlay .gps-banner{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(0,0,0,.78);'
        +   'padding:8px 14px;border-radius:999px;font-weight:700;font-size:15px;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis;}'
        + '#gps-overlay .gps-tiles-note{position:absolute;bottom:26px;left:8px;right:8px;z-index:1000;text-align:center;font-size:13px;color:#d1d5db;}'
        + '#gps-overlay .maplibregl-ctrl-attrib{font-size:10px;background:rgba(255,255,255,.82);color:#111;display:block !important;}'
        + '#gps-overlay .maplibregl-ctrl-attrib a{color:#0b4f8a;}'
        + '#gps-overlay .gps-zoom{position:absolute;left:10px;top:10px;z-index:3;background:rgba(11,15,12,.82);font-size:14px;font-weight:700;min-height:36px;min-width:44px;padding:6px 10px;}'
        + '#gps-overlay .gps-pill{position:absolute;z-index:2;pointer-events:none;background:rgba(11,15,12,.86);color:#fff;font:700 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
        +   'padding:4px 7px;border-radius:999px;white-space:nowrap;font-variant-numeric:tabular-nums;}'
        // The bottom row of the map, above the attribution bar: the score button in
        // the middle, the wind at the right. Its height is part of the hole view's
        // bottom margin, so the tee always shows above it.
        + '#gps-overlay .gps-bottom-row{position:absolute;left:8px;right:8px;bottom:calc(var(--gps-attrib-h,20px) + 8px);z-index:3;height:38px;pointer-events:none;}'
        + '#gps-overlay .gps-score{pointer-events:auto;position:absolute;left:50%;top:0;transform:translateX(-50%);max-width:calc(100% - 156px);min-height:38px;padding:8px 14px;'
        +   'border-radius:999px;background:rgba(11,15,12,.88);border:1px solid #d9f99d;color:#d9f99d;font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
        + '#gps-overlay .gps-wind{position:absolute;right:0;top:0;height:38px;min-width:62px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:4px;'
        +   'padding:0 8px;border-radius:10px;background:rgba(11,15,12,.82);color:#fff;font:700 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;white-space:nowrap;}'
        + '#gps-overlay .gps-wind-arrow{display:inline-block;font-size:17px;line-height:1;color:#93c5fd;transform-origin:50% 50%;}'
        + '#gps-overlay .gps-arc-labels{position:absolute;inset:0;pointer-events:none;z-index:2;}'
        + '#gps-overlay .gps-arc-lbl{position:absolute;font:700 10px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;'
        +   'text-shadow:0 0 2px #000,0 0 3px #000;white-space:nowrap;}'
        + '#gps-overlay .gps-arc-lbl-pin{color:#fde68a;}'
        + '.gps-flag{width:30px;height:30px;display:flex;align-items:center;justify-content:center;pointer-events:none;}'
        + '.gps-flag span{font-size:20px;line-height:1;color:#ef4444;text-shadow:0 0 2px #fff,0 0 3px #000;}'
        + '.gps-flag.gps-flag-edit{width:48px;height:48px;pointer-events:auto;cursor:grab;touch-action:none;border-radius:50%;box-shadow:0 0 0 2px #facc15 inset;}'
        + '#gps-overlay .gps-pill-to{color:#facc15;border:1px solid rgba(250,204,21,.7);}'
        + '#gps-overlay .gps-pill-on{color:#fff;border:1px solid rgba(255,255,255,.6);}'
        // NO PULL-DOWN while GPS shows: nothing on the page scrolls, refreshes or bounces.
        + 'html.gps-lock,html.gps-lock body{overscroll-behavior:none;overflow:hidden;}'
        + '#gps-overlay{overscroll-behavior:none;touch-action:none;}'
        + '#gps-overlay .gps-map,#gps-overlay .gps-map-wrap{touch-action:none;}'
        + '#gps-overlay .gps-recenter{position:absolute;right:10px;top:10px;z-index:3;background:rgba(11,15,12,.82);font-size:14px;min-height:36px;padding:6px 10px;}'
        + '.gps-dot{width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4);}'
        + '.gps-pin-tee{background:#93c5fd;}'
        + '#gps-overlay .gps-panel{padding:8px 12px 4px;background:#0b0f0c;}'
        + '#gps-overlay .gps-nums{display:flex;justify-content:space-between;text-align:center;}'
        + '#gps-overlay .gps-num{flex:1;}'
        + '#gps-overlay .gps-lbl{font-size:12px;letter-spacing:.08em;color:#a7b3aa;}'
        // THE NUMBERS FIT (2026-10-07): three columns that may shrink, four digits
        // at most, and a size that scales with the screen - FRONT / CENTER / BACK
        // all visible on the narrowest iPhone (320 px) without overflow.
        + '#gps-overlay .gps-num{min-width:0;overflow:hidden;}'
        + '#gps-overlay .gps-big{font-size:clamp(28px,10.5vw,44px);font-weight:800;line-height:1.05;font-variant-numeric:tabular-nums;white-space:nowrap;}'
        // CENTER is the biggest number, but its column is a third of the screen like
        // the others: 11vw lets "9999" fit at 320px (12.5vw overflowed by 2px - the
        // fit arm of tools/gps-check.js caught it).
        + '#gps-overlay .gps-num-mid .gps-big{font-size:clamp(30px,11vw,54px);color:#d9f99d;}'
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
        // MapLibre centers a marker on its ELEMENT's box, so every marker element
        // has an explicit size (an unsized one drew the crosshair 24px down and
        // right of its point - measured in the first MapLibre screenshot).
        + '.gps-pin{width:16px;height:16px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:50%;border:2px solid #111;font:700 9px/1 sans-serif;color:#111;}'
        + '.gps-pin-mid{background:#ffffff;}.gps-pin-front{background:#bef264;}.gps-pin-back{background:#fca5a5;}'
        + '.gps-pin-draft{outline:3px solid #facc15;}'
        // The target: a touch area of at least 48px, the ring drawn at its real
        // size on the ground (sizeTarget), a crosshair through it, its width beside it.
        + '.gps-target{width:48px;height:48px;position:relative;background:transparent;cursor:grab;touch-action:none;}'
        + '.gps-target .gps-ring{position:absolute;left:50%;top:50%;width:28px;height:28px;transform:translate(-50%,-50%);box-sizing:border-box;'
        +   'border:3px solid #facc15;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.6),inset 0 0 0 1px rgba(0,0,0,.4);}'
        + '.gps-target .gps-ring::before,.gps-target .gps-ring::after{content:"";position:absolute;background:#facc15;box-shadow:0 0 0 1px rgba(0,0,0,.4);}'
        + '.gps-target .gps-ring::before{left:50%;top:-10px;width:3px;margin-left:-1.5px;height:calc(100% + 20px);}'
        + '.gps-target .gps-ring::after{top:50%;left:-10px;height:3px;margin-top:-1.5px;width:calc(100% + 20px);}'
        + '.gps-target .gps-ring-lbl{position:absolute;top:50%;transform:translateY(-50%);pointer-events:none;background:rgba(11,15,12,.78);color:#facc15;'
        +   'font:700 10px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:2px 5px;border-radius:999px;white-space:nowrap;}';
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
            writeHoleLoc: opts.writeHoleLoc || null, openScore: opts.openScore || null, localLocs: {},
            mode: 'measure', target: null, targetMoved: false, draft: null, localPins: {},
            geoError: null, framed: null, mapRequested: false, loadingCourses: !window.HardPanGpsCourses
        };

        on(tg, '.gps-side-gps', function () { showSide('gps'); });
        on(tg, '.gps-side-bets', function () { showSide('bets'); });
        on(el, '.gps-prev', function () { if (S && S.stepHole) S.stepHole(-1); });
        on(el, '.gps-next', function () { if (S && S.stepHole) S.stepHole(1); });
        on(el, '.gps-units', function () { setUnits(units() === 'm' ? 'yd' : 'm'); render(); });
        // RECENTER: back to the hole's own view - tee at the bottom, green at the top.
        on(el, '.gps-recenter', function () { frameHole(false); });
        on(el, '.gps-zoom', cycleZoom);
        on(el, '.gps-edit-pin', startEditPin);
        on(el, '.gps-pin-save', function () { endEditPin('save'); });
        on(el, '.gps-pin-clear', function () { endEditPin('clear'); });
        on(el, '.gps-pin-cancel', function () { endEditPin(null); });
        on(el, '.gps-score', function () { if (S && typeof S.openScore === 'function') S.openScore(S.hole); });
        document.addEventListener('touchmove', blockPull, { passive: false });
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
    // give MapLibre nothing to measure), then kept for the life of the round.
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
        loadMapLibre(function () { if (S === mine) { buildMap(); render(); } });
    }

    function showSide(side) {
        if (!S) return false;
        side = side === 'gps' ? 'gps' : 'bets';
        S.side = side;
        rememberSide(side);
        document.body.classList.toggle('gps-side-gps', side === 'gps');
        document.documentElement.classList.toggle('gps-lock', side === 'gps');
        var a = S.toggle.querySelector('.gps-side-gps'), b = S.toggle.querySelector('.gps-side-bets');
        if (a) a.setAttribute('aria-pressed', side === 'gps' ? 'true' : 'false');
        if (b) b.setAttribute('aria-pressed', side === 'bets' ? 'true' : 'false');
        if (side === 'gps') {
            ensureMap();
            if (S.map) { try { S.map.resize(); } catch (e) {} if (S.needsFrame) frameHole(false); }
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
        S.editingPin = false; S.pinDraft = null;
        S.target = null; S.targetMoved = false;
        S.framed = null;
        frameHole(false);
        render();
    }

    // The round changed under us (another phone set a pin).
    function roundUpdated(round) {
        if (!S) return;
        S.round = round || null;
        // A pin this phone saved stops overriding the round once the round says
        // the same thing - so another phone's later move shows up here.
        // A NEWER pin from another phone wins too (its `at` is later than this
        // phone's save); an older one does not undo what was just saved here.
        Object.keys(S.localLocs || {}).forEach(function (k) {
            var theirs = (S.round && S.round.pinLocs && S.round.pinLocs[k]) || null, mine = S.localLocs[k] || null;
            var savedAt = mine ? Number(mine.at) || 0 : ((S.localLocsAt && S.localLocsAt[k]) || 0);
            if (JSON.stringify(theirs) === JSON.stringify(mine) || (theirs && Number(theirs.at) > savedAt)) delete S.localLocs[k];
        });
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
        document.documentElement.classList.remove('gps-lock');
        document.removeEventListener('touchmove', blockPull, { passive: false });
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
