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
    function maxZoomNow() { return (S && S.esriOn && !S.esriFailed && S.mode === 'measure') ? 20 : 18; }

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
            acc: { type: 'geojson', data: EMPTY }
        };
        var layers = [
            { id: 'bg', type: 'background', paint: { 'background-color': '#1d3b2a' } },
            { id: 'usgs', type: 'raster', source: 'usgs' },
            { id: 'hole-line', type: 'line', source: 'hole', filter: ['==', ['get', 'k'], 'line'], paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.45 } },
            { id: 'green-fill', type: 'fill', source: 'hole', filter: ['==', ['get', 'k'], 'green'], paint: { 'fill-color': '#4ade80', 'fill-opacity': 0.28 } },
            { id: 'green-edge', type: 'line', source: 'hole', filter: ['==', ['get', 'k'], 'green'], paint: { 'line-color': '#d9f99d', 'line-width': 2 } },
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
        var pinning = S.mode !== 'measure';
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
    var VIEW_PAD = { top: 44, bottom: 36, left: 18, right: 18 };
    function holeView() {
        if (!S || !S.map) return null;
        var r = resolved();
        if (!r) return null;
        var greenPts = (r.green && r.green.length) ? r.green : (r.mid ? [r.mid] : null);
        var el = S.el.querySelector('.gps-map');
        var w = el ? el.clientWidth : 390, h = el ? el.clientHeight : 500;
        if (r.tee && greenPts) return G.holeCamera(r.tee, greenPts, { w: w, h: h }, VIEW_PAD, maxZoomNow());
        if (r.mid) return { center: r.mid, zoom: 18, bearing: 0 };
        return null;
    }
    function frameHole(first) {
        if (!S || !S.map || !S.styleReady) return;
        var cam = holeView();
        if (cam) {
            S.map.jumpTo({ center: ll(cam.center), zoom: cam.zoom, bearing: cam.bearing, padding: VIEW_PAD });
            S.framed = 'hole';
            S.camera = cam;
        } else if (first || S.framed === 'hole') {
            S.map.jumpTo({ center: [0, 20], zoom: 2, bearing: 0, padding: VIEW_PAD });
            S.framed = null; S.camera = null;
        }
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
        var center = r && r.mid, o = origin(r);
        var p = (o && center) ? G.midpoint(o.pt, center) : null;
        if (p) S.target = p;
    }
    function drawTargetLines() {
        if (!S || !S.map || !S.styleReady) return;
        var feats = [];
        if (S.target && S.mode === 'measure') {
            var r = resolved(), o = origin(r);
            if (o) feats.push(feature('to', 'LineString', [ll(o.pt), ll(S.target)]));
            if (r && r.mid) feats.push(feature('on', 'LineString', [ll(S.target), ll(r.mid)]));
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
        txt('.gps-here-center', 'Here → center: ' + (r && r.mid ? G.shownDistance(G.haversineMeters(S.target, r.mid), u) : '—'));
    }
    function drawTarget() {
        if (!S || !S.map || !S.styleReady) return;
        drawTargetLines();
        var want = !!S.target && S.mode === 'measure';
        if (!want) { if (S.targetMarker) { S.targetMarker.remove(); S.targetMarker = null; } return; }
        if (!S.targetMarker) {
            var el = document.createElement('div');
            el.className = 'gps-target';
            el.innerHTML = '<span></span>';
            var m = new (ML().Marker)({ element: el, draggable: true, anchor: 'center' }).setLngLat(ll(S.target)).addTo(S.map);
            m.on('dragstart', function () { if (!S) return; S.dragging = true; S.targetMoved = true; });
            m.on('drag', function () {
                if (!S) return;
                var p = m.getLngLat();
                S.target = [p.lat, p.lng];
                drawTargetLines();
                targetReadout();
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
    }

    // ---- TAPS ---------------------------------------------------------------
    function onMapTap(pt) {
        if (!S) return;
        if (S.dragEndedAt && Date.now() - S.dragEndedAt < 350) return;
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
        var o = origin(r);
        var nums = r ? G.holeNumbers(o ? o.pt : null, r) : null;
        // Never more than four digits: anything longer is not a golf distance and
        // would push FRONT / CENTER / BACK off the screen.
        var d = function (m) { return G.shownDistance(m, u); };

        txt('.gps-title', 'Hole ' + S.hole + (S.par ? ' · Par ' + S.par : ''));
        txt('.gps-units', u === 'm' ? 'Meters' : 'Yards');
        txt('.gps-f', nums ? (nums.onGreen ? 'ON' : d(nums.frontM)) : '—');
        txt('.gps-m', nums ? d(nums.middleM) : '—');
        txt('.gps-b', nums ? d(nums.backM) : '—');

        var acc = S.geoError ? null : (fix ? G.accuracyLabel(fix.acc, u) : { text: 'Finding you…', weak: false });
        // OFF THE HOLE (more than 1,000 yds from the green) or NO GPS: everything is
        // measured from the TEE, and says so.
        var fromTee = !!(o && o.from === 'tee');
        txt('.gps-from', fromTee ? 'Measuring from tee' : '');
        show('.gps-from', fromTee);
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
        +   '<div class="gps-from" style="display:none"></div>'
        +   '<button type="button" class="gps-recenter" aria-label="Recenter on the hole">⌖ Recenter</button>'
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
        + '#gps-overlay .gps-banner{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:1000;background:rgba(0,0,0,.78);'
        +   'padding:8px 14px;border-radius:999px;font-weight:700;font-size:15px;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis;}'
        + '#gps-overlay .gps-tiles-note{position:absolute;bottom:26px;left:8px;right:8px;z-index:1000;text-align:center;font-size:13px;color:#d1d5db;}'
        + '#gps-overlay .maplibregl-ctrl-attrib{font-size:10px;background:rgba(255,255,255,.82);color:#111;display:block !important;}'
        + '#gps-overlay .maplibregl-ctrl-attrib a{color:#0b4f8a;}'
        + '#gps-overlay .gps-from{position:absolute;top:52px;left:50%;transform:translateX(-50%);z-index:3;background:rgba(250,204,21,.92);color:#111;'
        +   'font-weight:700;font-size:13px;padding:4px 10px;border-radius:999px;white-space:nowrap;}'
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
        // The target: a 48px touch area with a crosshair drawn in it.
        + '.gps-target{width:48px;height:48px;position:relative;background:transparent;cursor:grab;touch-action:none;}'
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
        // RECENTER: back to the hole's own view - tee at the bottom, green at the top.
        on(el, '.gps-recenter', function () { frameHole(false); });
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
        var a = S.toggle.querySelector('.gps-side-gps'), b = S.toggle.querySelector('.gps-side-bets');
        if (a) a.setAttribute('aria-pressed', side === 'gps' ? 'true' : 'false');
        if (b) b.setAttribute('aria-pressed', side === 'bets' ? 'true' : 'false');
        if (side === 'gps') {
            ensureMap();
            if (S.map) { try { S.map.resize(); } catch (e) {} }
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
        S.framed = null;
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
