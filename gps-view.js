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
//             written to Firebase, localStorage, a URL or a request - with ONE
//             deliberate exception: "Set center / front / back" while setting
//             a green by GPS (Tools, 2026-10-08) saves the spot the golfer is
//             standing on AS THE GREEN, when they tap it. What this side
//             writes: GREEN pins (a point the golfer TAPPED, or stood on and
//             set), the units preference and the last side used. The map is framed on the hole
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
        // Esri's tiles stop at z19: the SOURCE never asks past it. Beyond 19 the
        // map enlarges the z19 tiles (to maxZoom) with no extra requests. Asking
        // past its coverage is worse than useless - Esri answers HTTP 200 with a
        // "Map data not yet available" picture, not an error, so nothing falls back.
        maxNativeZoom: 19,
        maxZoom: 21,
        // Esri's required credit, word for word (Wave 2, 2026-10-08). Fixed text,
        // not read at runtime: the attribution Esri requires for this key is this
        // exact line, and one less request per round.
        poweredBy: 'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>',
        credit: 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
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

    function cfg() {
        try { return (typeof window !== 'undefined' && window.HARDPAN_GPS_CONFIG) || {}; } catch (e) { return {}; }
    }
    function esriKey() { return String(cfg().esriKey || ''); }
    // A CHECK'S STAND-IN FOR ESRI: tools/gps-check.js points this at a local image so
    // a "working Esri layer" can be measured without a key. Unset in every build.
    function esriTileUrl() { return String(cfg().esriTileUrl || '') || TILES.keyedUrl; }

    // ---- GOOGLE SATELLITE (optional, 2026-10-08) ----------------------------------
    // Google Map Tiles API, 2D satellite, as a second imagery source. gps-config.js:
    //   imagery: 'esri' | 'google'     (everyone; default 'esri')
    //   imageryPro: 'esri' | 'google'  (HardPan GPS users; overrides imagery)
    //   googleKey: ''                  (empty = Google off, whatever is chosen)
    // GOOGLE'S RULES, kept here: its tiles are never stored (only the browser's
    // own HTTP cache, under Google's headers) and never pre-fetched; it is NEVER
    // the picture while a green is set (no content may be created from it); the
    // "Google Maps" logo (Google's own file, unmodified) and Google's copyright
    // line for the area on screen are always on the map with it; and it is never
    // shown together with another map - USGS underneath is hidden while Google
    // is the picture, and comes back only when Google is off (offline, failed,
    // or a green being set).
    var GOOGLE = {
        base: 'https://tile.googleapis.com',
        // Google's tiles are asked for to z19 at most; the map enlarges past it.
        maxNativeZoom: 19,
        sessionKey: 'hardpan_gsession_v1',
        // The "Google Maps" logo with a light outline - Google's own file from its
        // attribution asset package, unmodified (for busy backgrounds like imagery).
        logo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI2LjUuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHdpZHRoPSIxMDVweCIgaGVpZ2h0PSIyMnB4IiB2aWV3Qm94PSIwIDAgMTA1IDIyIiBlbmFibGUtYmFja2dyb3VuZD0ibmV3IDAgMCAxMDUgMjIiIHhtbDpzcGFjZT0icHJlc2VydmUiPgo8ZyBpZD0iTG9nbyI+Cgk8ZyBpZD0iT3V0bGluZSIgb3BhY2l0eT0iMC44Ij4KCQk8cGF0aCBmaWxsPSIjRkZGRkZGIiBkPSJNNTkuNzcsMTEuNDRsLTAuOTMtMi4zMmMtMC4xNi0wLjQtMC4zNi0wLjgxLTAuNjEtMS4yMmMtMC4yNi0wLjQyLTAuNi0wLjg1LTEuMDEtMS4yNwoJCQljLTAuNDktMC41LTEuMS0wLjktMS44LTEuMmMtMC43MS0wLjMtMS40OS0wLjQ2LTIuMy0wLjQ2Yy0xLjE2LDAtMi4yNSwwLjMtMy4xOSwwLjg3VjAuNDhoLTUuOTh2NC43N0g0MgoJCQljLTAuNTQtMC4xOC0xLjEyLTAuMjctMS43Mi0wLjI3Yy0xLjY4LDAtMy4yMSwwLjY2LTQuNDQsMS45MmMtMC4wOSwwLjA5LTAuMTgsMC4xOS0wLjI2LDAuMjljLTAuMS0wLjEyLTAuMjEtMC4yNC0wLjMzLTAuMzUKCQkJYy0xLjI2LTEuMjMtMi44MS0xLjg2LTQuNi0xLjg2Yy0xLjc3LDAtMy4zNiwwLjY0LTQuNiwxLjg2Yy0wLjExLDAuMTEtMC4yMiwwLjIyLTAuMzIsMC4zNGMtMC4xLTAuMTItMC4yMS0wLjIzLTAuMzItMC4zNAoJCQljLTEuMjYtMS4yMy0yLjgxLTEuODYtNC42LTEuODZjLTEuNTUsMC0yLjkxLDAuNDYtNC4wNiwxLjM4aC0yLjQ3bDIuNDYtMi40NmwtMS40OC0xLjQxQzEzLjUzLDAuODMsMTEuNDYsMCw5LjA4LDAKCQkJQzYuNjIsMCw0LjQ3LDAuODgsMi43LDIuNjJDMC45MSw0LjM4LDAsNi41MSwwLDguOThzMC45MSw0LjYxLDIuNyw2LjM2YzEuNzgsMS43NCwzLjkzLDIuNjIsNi4zOSwyLjYyCgkJCWMyLjU2LDAsNC42OC0wLjg3LDYuMjgtMi41NGMwLjA0LTAuMDQsMC4wOC0wLjA4LDAuMTItMC4xM2MwLjIxLDAuMjksMC40NCwwLjU2LDAuNywwLjgxYzEuMjQsMS4yMiwyLjgzLDEuODYsNC42LDEuODYKCQkJYzEuOCwwLDMuMzQtMC42Miw0LjYtMS44NmMwLjExLTAuMTEsMC4yMi0wLjIyLDAuMzItMC4zNGMwLjEsMC4xMiwwLjIxLDAuMjMsMC4zMiwwLjM0YzEuMjQsMS4yMiwyLjgzLDEuODYsNC42LDEuODYKCQkJYzEuMjYsMCwyLjQtMC4zMSwzLjQtMC45MmwwLjQ1LDEuMDdjMC40MywxLjAyLDEuMTMsMS45MSwyLjA4LDIuNjZjMS4wNCwwLjgxLDIuMywxLjIzLDMuNzUsMS4yM2MxLjc4LDAsMy4yOS0wLjU4LDQuNDctMS43MwoJCQljMC43MS0wLjY5LDEuMjEtMS41NSwxLjUtMi41OGgzLjY0di0wLjY3YzEsMC42MiwyLjE2LDAuOTQsMy40MiwwLjk0YzEuMywwLDIuNDQtMC4zMiwzLjM5LTAuOTRjMC44NS0wLjU1LDEuNTMtMS4yMSwyLjAyLTEuOTQKCQkJbDEuMTEtMS42NmwtMS44Ny0xLjI1TDU5Ljc3LDExLjQ0eiIvPgoJCTxwYXRoIGZpbGw9IiNGRkZGRkYiIGQ9Ik0xMDUsMTAuMTFsLTAuNzQtMS44NGMtMC40Mi0xLjA1LTEuMTMtMS44Ni0yLjEtMi40M2MtMC44OS0wLjUxLTEuODktMC43Ny0yLjk4LTAuNzcKCQkJYy0xLjMxLDAtMi40OCwwLjM1LTMuNDgsMS4wNWMtMC4yNCwwLjE3LTAuNDUsMC4zNi0wLjY1LDAuNTZjLTEuMTEtMS4wNS0yLjQ2LTEuNjEtMy45NS0xLjYxYy0wLjYzLDAtMS4yMiwwLjA5LTEuNzgsMC4yN2gtNC42MwoJCQl2MC42Yy0wLjkzLTAuNTgtMi0wLjg3LTMuMjEtMC44N2MtMS4yNiwwLTIuMzQsMC4zMS0zLjIyLDAuOVYxLjVoLTQuNzNsLTMuMTEsNS40NWwtMy4xLTUuNDVINjIuNnYxNi4xOWg1LjU3VjE1LjFoMC42NWgzLjI0CgkJCWgwLjY1djIuNTloNS41N3YtMC4zN2MwLjc3LDAuNDIsMS42NSwwLjY0LDIuNjIsMC42NGMwLjY0LDAsMS4yMy0wLjA5LDEuNzgtMC4yN2gyLjAzdjMuNjhoNS41N3YtMy40NgoJCQljMC4yNywwLjA0LDAuNTYsMC4wNiwwLjg0LDAuMDZjMS41LDAsMi44Ny0wLjU3LDMuOTgtMS42NGMwLjIsMC4yLDAuNDIsMC4zOSwwLjY1LDAuNTZjMC45NiwwLjcyLDIuMTQsMS4wOCwzLjUxLDEuMDgKCQkJYzEuNDMsMCwyLjY1LTAuNCwzLjYzLTEuMmMxLjA4LTAuODgsMS42Ni0yLjA3LDEuNjYtMy40MmMwLTAuOTctMC4zMi0xLjg5LTAuOTMtMi42NkwxMDUsMTAuMTF6Ii8+Cgk8L2c+Cgk8ZyBpZD0iSW5uZXJfdGV4dCI+CgkJPGc+CgkJCTxwYXRoIGZpbGw9IiM0NzQ3NDciIGQ9Ik05LjA4LDguMzV2MS45aDQuNThjLTAuMTQsMS4wNC0wLjQ4LDEuODQtMS4wNCwyLjRjLTAuOTQsMC45My0yLjExLDEuNC0zLjUzLDEuNAoJCQkJYy0xLjQsMC0yLjU4LTAuNDktMy41NS0xLjQ4Yy0wLjk3LTAuOTgtMS40Ni0yLjE4LTEuNDYtMy41OWMwLTEuNDEsMC40OC0yLjYsMS40NS0zLjU5QzYuNSw0LjQsNy42OCwzLjkxLDkuMDgsMy45MQoJCQkJYzEuMzMsMCwyLjQ3LDAuNDUsMy40NCwxLjM2bDEuMzUtMS4zNUMxMi41MywyLjY0LDEwLjkzLDIsOS4wOCwyQzcuMTUsMiw1LjQ5LDIuNjgsNC4wOSw0LjA1QzIuNyw1LjQyLDIsNy4wNiwyLDguOTgKCQkJCWMwLDEuOTIsMC43LDMuNTYsMi4wOSw0LjkzYzEuNCwxLjM3LDMuMDYsMi4wNSw0Ljk5LDIuMDVjMiwwLDMuNjMtMC42NSw0Ljg3LTEuOTZjMS4xLTEuMSwxLjY1LTIuNTksMS42NS00LjQ2CgkJCQljMC0wLjQ1LTAuMDMtMC44NS0wLjEtMS4xOUg5LjA4eiIvPgoJCQk8cGF0aCBmaWxsPSIjNDc0NzQ3IiBkPSJNNDIuNzIsNy45N2gtMC4wN2MtMC4yNC0wLjI5LTAuNTctMC41My0wLjk4LTAuNzJjLTAuNDItMC4xOS0wLjg4LTAuMjktMS4zOS0wLjI5CgkJCQljLTEuMTQsMC0yLjE1LDAuNDQtMy4wMSwxLjMyYy0wLjg2LDAuODgtMS4yOSwxLjk0LTEuMjksMy4xOWMwLDEuMjQsMC40MywyLjMsMS4yOSwzLjE3YzAuODYsMC44NywxLjg2LDEuMzEsMy4wMSwxLjMxCgkJCQljMS4wMiwwLDEuODEtMC4zNCwyLjM3LTEuMDJoMC4wN3YwLjY1YzAsMC44NS0wLjIxLDEuNTEtMC42NCwxLjk2Yy0wLjQyLDAuNDUtMS4wMSwwLjY4LTEuNzYsMC42OGMtMC41NSwwLTEuMDItMC4xNi0xLjQxLTAuNDgKCQkJCWMtMC4zOC0wLjMxLTAuNjctMC42OS0wLjg1LTEuMTJsLTEuNzIsMC43MmMwLjI5LDAuNzEsMC43OCwxLjMzLDEuNDYsMS44NmMwLjY4LDAuNTMsMS41MiwwLjgsMi41MiwwLjgKCQkJCWMxLjI1LDAsMi4yNy0wLjM5LDMuMDctMS4xN2MwLjgtMC43OCwxLjItMS45NSwxLjItMy41MlY3LjI0aC0xLjg3VjcuOTd6IE00Mi4xNiwxMy40MmMtMC40NiwwLjUxLTEuMDMsMC43Ny0xLjcxLDAuNzcKCQkJCWMtMC42OSwwLTEuMjgtMC4yNi0xLjc3LTAuNzhjLTAuNDktMC41MS0wLjczLTEuMTYtMC43My0xLjkzYzAtMC43OCwwLjI0LTEuNDQsMC43My0xLjk2YzAuNDktMC41MiwxLjA4LTAuNzgsMS43Ny0wLjc4CgkJCQljMC42OCwwLDEuMjUsMC4yNiwxLjcxLDAuNzljMC40NiwwLjUyLDAuNjksMS4xOCwwLjY5LDEuOTZDNDIuODUsMTIuMjYsNDIuNjIsMTIuOSw0Mi4xNiwxMy40MnoiLz4KCQkJPHBhdGggZmlsbD0iIzQ3NDc0NyIgZD0iTTIwLjgsNi45N2MtMS4yNiwwLTIuMzMsMC40My0zLjIsMS4yOXMtMS4zMSwxLjkzLTEuMzEsMy4yMWMwLDEuMjgsMC40NCwyLjM1LDEuMzEsMy4yMQoJCQkJczEuOTQsMS4yOSwzLjIsMS4yOXMyLjMzLTAuNDMsMy4yLTEuMjljMC44OC0wLjg2LDEuMzEtMS45MywxLjMxLTMuMjFjMC0xLjI4LTAuNDQtMi4zNS0xLjMxLTMuMjFTMjIuMDYsNi45NywyMC44LDYuOTd6CgkJCQkgTTIyLjU5LDEzLjQyYy0wLjUsMC41MS0xLjEsMC43Ny0xLjc5LDAuNzdzLTEuMjktMC4yNS0xLjc5LTAuNzdjLTAuNS0wLjUyLTAuNzUtMS4xNy0wLjc1LTEuOTVjMC0wLjgsMC4yNS0xLjQ1LDAuNzQtMS45NgoJCQkJYzAuNS0wLjUxLDEuMS0wLjc3LDEuOC0wLjc3UzIyLjEsOSwyMi42LDkuNTFjMC40OSwwLjUxLDAuNzQsMS4xNywwLjc0LDEuOTZDMjMuMzQsMTIuMjUsMjMuMDksMTIuOSwyMi41OSwxMy40MnoiLz4KCQkJPHJlY3QgeD0iNDUuOTUiIHk9IjIuNDgiIGZpbGw9IiM0NzQ3NDciIHdpZHRoPSIxLjk4IiBoZWlnaHQ9IjEzLjIxIi8+CgkJCTxwYXRoIGZpbGw9IiM0NzQ3NDciIGQ9Ik01My4zNCwxNC4yYy0wLjk5LDAtMS43MS0wLjQ1LTIuMTgtMS4zNmw2LjAxLTIuNDlsLTAuMi0wLjUxYy0wLjExLTAuMy0wLjI2LTAuNTktMC40NC0wLjg5CgkJCQljLTAuMTgtMC4yOS0wLjQyLTAuNi0wLjczLTAuOTFjLTAuMzEtMC4zMi0wLjY5LTAuNTctMS4xNi0wLjc3Yy0wLjQ3LTAuMi0wLjk3LTAuMy0xLjUyLTAuM2MtMS4xOSwwLTIuMTksMC40Mi0zLjAxLDEuMjYKCQkJCWMtMC44MiwwLjg0LTEuMjMsMS45Mi0xLjIzLDMuMjRjMCwxLjI3LDAuNDMsMi4zNCwxLjI4LDMuMmMwLjg1LDAuODYsMS45MSwxLjI5LDMuMTgsMS4yOWMwLjkxLDAsMS42OC0wLjIsMi4yOS0wLjYKCQkJCWMwLjYzLTAuNDEsMS4xMS0wLjg3LDEuNDUtMS4zOGwtMS41My0xLjAyQzU0Ljk5LDEzLjc5LDU0LjI1LDE0LjIsNTMuMzQsMTQuMnogTTUxLjU2LDkuNDNjMC41MS0wLjQ4LDEuMDUtMC43MiwxLjYzLTAuNzIKCQkJCWMwLjM5LDAsMC43MywwLjA4LDEuMDQsMC4yNmMwLjMxLDAuMTgsMC41MiwwLjQxLDAuNjMsMC42OWwtNC4wMiwxLjY3QzUwLjgyLDEwLjU0LDUxLjA2LDkuOSw1MS41Niw5LjQzeiIvPgoJCQk8cGF0aCBmaWxsPSIjNDc0NzQ3IiBkPSJNMzAuNjUsNi45N2MtMS4yNiwwLTIuMzMsMC40My0zLjIsMS4yOXMtMS4zMSwxLjkzLTEuMzEsMy4yMWMwLDEuMjgsMC40NCwyLjM1LDEuMzEsMy4yMQoJCQkJczEuOTQsMS4yOSwzLjIsMS4yOWMxLjI2LDAsMi4zMy0wLjQzLDMuMi0xLjI5YzAuODctMC44NiwxLjMxLTEuOTMsMS4zMS0zLjIxYzAtMS4yOC0wLjQ0LTIuMzUtMS4zMS0zLjIxUzMxLjkxLDYuOTcsMzAuNjUsNi45NwoJCQkJeiBNMzIuNDQsMTMuNDJjLTAuNSwwLjUxLTEuMSwwLjc3LTEuNzksMC43N3MtMS4yOS0wLjI1LTEuNzktMC43N2MtMC41LTAuNTItMC43NS0xLjE3LTAuNzUtMS45NWMwLTAuOCwwLjI1LTEuNDUsMC43NC0xLjk2CgkJCQljMC41LTAuNTEsMS4xLTAuNzcsMS44LTAuNzdjMC43MSwwLDEuMzEsMC4yNiwxLjgsMC43N3MwLjc0LDEuMTcsMC43NCwxLjk2QzMzLjE5LDEyLjI1LDMyLjk0LDEyLjksMzIuNDQsMTMuNDJ6Ii8+CgkJPC9nPgoJCTxnPgoJCQk8cG9seWdvbiBmaWxsPSIjNDc0NzQ3IiBwb2ludHM9IjcwLjQ4LDEwLjkyIDcwLjQxLDEwLjkyIDY2LjE3LDMuNSA2NC42LDMuNSA2NC42LDE1LjY5IDY2LjE3LDE1LjY5IDY2LjE3LDguNDUgNjYuMSw2LjQxIAoJCQkJNjYuMTcsNi40MSA2OS45OCwxMy4xIDcwLjksMTMuMSA3NC43Miw2LjQxIDc0Ljc5LDYuNDEgNzQuNzIsOC40NSA3NC43MiwxNS42OSA3Ni4yOSwxNS42OSA3Ni4yOSwzLjUgNzQuNzIsMy41IAkJCSIvPgoJCQk8cGF0aCBmaWxsPSIjNDc0NzQ3IiBkPSJNODEuNSw3LjA3Yy0wLjkzLDAtMS42OCwwLjIxLTIuMjUsMC42NFM3OC4zLDguNiw3OC4xMSw5LjFsMS40NCwwLjYxYzAuMTQtMC4zOCwwLjM5LTAuNjcsMC43Ni0wLjg5CgkJCQljMC4zNi0wLjIxLDAuNzgtMC4zMiwxLjIzLTAuMzJjMC42MSwwLDEuMTMsMC4xOCwxLjU1LDAuNTVjMC40MiwwLjM3LDAuNjMsMC44NiwwLjYzLDEuNDd2MC4yNGMtMC41OS0wLjM0LTEuMzQtMC41MS0yLjI2LTAuNTEKCQkJCWMtMS4wNCwwLTEuOTEsMC4yNS0yLjYxLDAuNzdjLTAuNzEsMC41Mi0xLjA2LDEuMjMtMS4wNiwyLjE0YzAsMC44NCwwLjI5LDEuNTIsMC44OSwyLjAzYzAuNTksMC41MSwxLjMzLDAuNzcsMi4yMiwwLjc3CgkJCQljMS4yMSwwLDIuMTItMC40NywyLjc1LTEuNDNoMC4wN3YxLjE2aDEuNXYtNS4wNGMwLTEuMTQtMC4zNi0yLjAyLTEuMDYtMi42NEM4My40NSw3LjM4LDgyLjU3LDcuMDcsODEuNSw3LjA3eiBNODIuOTIsMTMuODEKCQkJCWMtMC41MywwLjQ4LTEuMTEsMC43Mi0xLjc2LDAuNzJjLTAuNDYsMC0wLjg2LTAuMTItMS4yMS0wLjM1Yy0wLjM1LTAuMjQtMC41My0wLjU2LTAuNTMtMC45N2MwLTAuNDQsMC4xOS0wLjgzLDAuNTgtMS4xNgoJCQkJczAuOTYtMC40OSwxLjcyLTAuNDljMC44OCwwLDEuNTUsMC4xOCwxLjk5LDAuNTRDODMuNzEsMTIuNzYsODMuNDUsMTMuMzMsODIuOTIsMTMuODF6Ii8+CgkJCTxwYXRoIGZpbGw9IiM0NzQ3NDciIGQ9Ik05MS4xMiw3LjA4Yy0wLjYzLDAtMS4yLDAuMTQtMS43MSwwLjQxYy0wLjUsMC4yNy0wLjg4LDAuNjEtMS4xMywxLjAyaC0wLjA3VjcuMzVoLTEuNXYxMi4wMmgxLjU3di0zLjY4CgkJCQlsLTAuMDctMS4xNmgwLjA3YzAuMjUsMC40MSwwLjYyLDAuNzUsMS4xMywxLjAyYzAuNSwwLjI3LDEuMDcsMC40MSwxLjcxLDAuNDFjMS4wOCwwLDIuMDEtMC40MiwyLjc5LTEuMjYKCQkJCWMwLjc5LTAuODUsMS4xOC0xLjkxLDEuMTgtMy4xN2MwLTEuMjYtMC40LTIuMzItMS4xOC0zLjE3QzkzLjEzLDcuNTEsOTIuMiw3LjA4LDkxLjEyLDcuMDh6IE05Mi43MywxMy43CgkJCQljLTAuNTIsMC41NS0xLjE0LDAuODMtMS44NywwLjgzYy0wLjczLDAtMS4zNi0wLjI3LTEuODgtMC44MmMtMC41MS0wLjU1LTAuNzctMS4yOC0wLjc3LTIuMnMwLjI1LTEuNjYsMC43Ny0yLjIKCQkJCWMwLjUxLTAuNTUsMS4xNC0wLjgyLDEuODgtMC44MmMwLjcyLDAsMS4zNSwwLjI4LDEuODcsMC44M2MwLjUyLDAuNTUsMC43OCwxLjI4LDAuNzgsMi4xOUM5My41MSwxMi40Miw5My4yNSwxMy4xNSw5Mi43MywxMy43eiIKCQkJCS8+CgkJCTxwYXRoIGZpbGw9IiM0NzQ3NDciIGQ9Ik0xMDEuOTYsMTEuODRjLTAuMzgtMC40NS0wLjk2LTAuNzYtMS43NC0wLjk0bC0xLjY1LTAuMzljLTAuNzQtMC4xNy0xLjExLTAuNDktMS4xMS0wLjk3CgkJCQljMC0wLjMzLDAuMTYtMC41OSwwLjQ4LTAuNzhzMC43MS0wLjI5LDEuMTgtMC4yOWMwLjk3LDAsMS42LDAuMzcsMS45MSwxLjExbDEuMzYtMC41NmMtMC4yNS0wLjYzLTAuNjYtMS4xLTEuMjQtMS40NAoJCQkJYy0wLjU4LTAuMzMtMS4yNC0wLjUtMS45OC0wLjVjLTAuODksMC0xLjY3LDAuMjMtMi4zMiwwLjY5Yy0wLjY1LDAuNDYtMC45OCwxLjA2LTAuOTgsMS44YzAsMC42NSwwLjI0LDEuMTYsMC43MiwxLjU0CgkJCQlzMC45OSwwLjYzLDEuNTIsMC43N2wxLjY5LDAuNDFjMC43NiwwLjIsMS4xNCwwLjU3LDEuMTQsMS4xMWMwLDAuMzUtMC4xNiwwLjYzLTAuNDcsMC44NWMtMC4zMSwwLjIxLTAuNzEsMC4zMi0xLjIsMC4zMgoJCQkJYy0xLjA2LDAtMS44Mi0wLjUzLTIuMjYtMS41N2wtMS40LDAuNThjMC4yOSwwLjY4LDAuNzMsMS4yNSwxLjM0LDEuN2MwLjYxLDAuNDUsMS4zOCwwLjY4LDIuMzEsMC42OGMwLjk2LDAsMS43NS0wLjI1LDIuMzQtMC43NQoJCQkJYzAuNjEtMC41LDAuOTItMS4xMiwwLjkyLTEuODdDMTAyLjUyLDEyLjc4LDEwMi4zMywxMi4yOCwxMDEuOTYsMTEuODR6Ii8+CgkJPC9nPgoJPC9nPgo8L2c+Cjwvc3ZnPgo='
    };
    function googleKey() { return String(cfg().googleKey || ''); }
    function googleBase() { return String(cfg().googleBase || '') || GOOGLE.base; }
    function imageryChoice() {
        var c = cfg();
        var pick = (S && S.pro && c.imageryPro) ? c.imageryPro : (c.imagery || 'esri');
        return (pick === 'google' && googleKey()) ? 'google' : 'esri';
    }
    // A session token (Google: valid two weeks, usable by any client) - kept on
    // the phone and renewed a day before it runs out. It names nothing about the
    // golfer: the request says only "satellite, en-US, US".
    function googleSession(done) {
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem(GOOGLE.sessionKey) || 'null'); } catch (e) {}
        if (saved && saved.session && saved.key === googleKey().slice(-6) && saved.expiry * 1000 - Date.now() > 86400000) { done(saved.session); return; }
        if (typeof fetch !== 'function') { done(null); return; }
        fetch(googleBase() + '/v1/createSession?key=' + encodeURIComponent(googleKey()), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mapType: 'satellite', language: 'en-US', region: 'US' })
        }).then(function (r) { if (!r.ok) throw new Error('session ' + r.status); return r.json(); }).then(function (j) {
            if (!j || !j.session) throw new Error('no session');
            try { localStorage.setItem(GOOGLE.sessionKey, JSON.stringify({ session: j.session, expiry: Number(j.expiry) || 0, key: googleKey().slice(-6) })); } catch (e) {}
            done(j.session);
        }).catch(function () { done(null); });
    }
    function googleSource(session) {
        return { type: 'raster', tiles: [googleBase() + '/v1/2dtiles/{z}/{x}/{y}?session=' + encodeURIComponent(session) + '&key=' + encodeURIComponent(googleKey())],
                 tileSize: 256, maxzoom: GOOGLE.maxNativeZoom, attribution: 'Google Maps' };
    }

    // ---- GPS MAP: THE ONE CHECK (Wave 2, 2026-10-08; paid launch 2026-10-17) -----
    // Does this phone have GPS Map - an active 7-day free trial or a paid yearly
    // subscription? ALL of GPS needs it (Manny, mailbox 007): the satellite hole,
    // front / center / back, the target, wind, plays like. No entitlement = no GPS
    // side at all (the gate below, requireGps). This is the ONLY place that decides:
    //   1. HARDPAN_GPS_CONFIG.iap on (v2.0): the App Store entitlement alone
    //      (gps-entitlement.js - StoreKit through RevenueCat; no plugin or no key =
    //      no entitlement). The flag on but the entitlement file missing: no GPS.
    //   2. iap off (a build with no store at all): HARDPAN_GPS_CONFIG.paywall -
    //      false means GPS on, true means GPS off.
    // There is NO tester override (gps-store-iap, 2026-10-17): the old URL tier switch and the
    // phone's hardpan_gps_tier are gone, so nothing in a URL can turn GPS on.
    function entitlement() { return (typeof window !== 'undefined' && window.HardPanEntitlement) || null; }
    function iapOn() { var E = entitlement(); return !!(E && E.enabled()); }
    // Flag on and the store has not answered yet this launch: the gate waits, so a
    // paying golfer is not shown the paywall while the answer is on its way.
    function proPending() { var E = entitlement(); return iapOn() && !E.known(); }
    // A phone that once used the old switch still holds its value: never read, cleared once.
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem('hardpan_gps_tier'); } catch (e) {}
    // TOURNAMENT MODE (Rules of Golf 4.3: distance only in competition; Manny, 2026-10-15).
    // On for this round when the organizer set it (the round's tournamentMode - every phone in the
    // round, and no golfer can turn it off); else this phone's own switch (GPS Tools). On: no wind
    // (none shown, none fetched), no plays-like, no slope / elevation, no club picks - the plain
    // front / middle / back, the tap distance and Mark shot stay.
    var TOURNEY_KEY = 'hardpan_tournament_phone';
    function tourneyRound() { try { var d = typeof currentData !== 'undefined' ? currentData : (S && S.round); return !!(d && d.tournamentMode === true); } catch (e) { return !!(S && S.round && S.round.tournamentMode === true); } }   /* global currentData */
    function tourneyPhone() { try { return localStorage.getItem(TOURNEY_KEY) === '1'; } catch (e) { return false; } }
    function tournament() { return tourneyRound() || tourneyPhone(); }
    function hasGpsPro() {
        if (iapOn()) return entitlement().isPro() === true;
        if (cfg().iap === true) return false;
        if (cfg().paywall !== true) return true;
        return false;
    }

    // ---- STATE --------------------------------------------------------------
    var S = null;          // the mounted GPS side for this round, or null
    var watchId = null;    // navigator.geolocation id, or a Capacitor id string
    var watchKind = null;  // 'web' | 'cap'
    var watchGen = 0;      // bumps on every stop, so a late Capacitor id is cleared, not kept
    var idleTimer = null;  // the 60 s stop after switching to Bets
    var windTimer = null;  // the wind's 1-minute tick (age on the box, 10-minute refresh)
    var fix = null;        // { pt: [lat, lng], acc: metres, at: ms } - NEVER persisted, NEVER sent
    var FIX_STALE_MS = 10000, staleTimer = null;
    function dropStaleFix() { if (fix && (!fix.at || Date.now() - fix.at > FIX_STALE_MS)) { fix = null; return true; } return false; }

    function units() {
        try { return localStorage.getItem(UNITS_KEY) === 'm' ? 'm' : 'yd'; } catch (e) { return 'yd'; }
    }
    function setUnits(u) {
        try { localStorage.setItem(UNITS_KEY, u === 'm' ? 'm' : 'yd'); } catch (e) {}
    }
    // What this phone last LEFT ON in THIS round: 'gps', 'bets' (the Card), or null.
    // BUILD 5 (2026-10-09): remembered PER ROUND ("bets|QLDLPD"), so leaving one
    // round on the Card never makes the next round open on the Card - every new
    // round opens on GPS. A value with no round (written before build 5, or by the
    // checks) still counts for any round.
    function sideRecord() {
        try {
            var v = String(localStorage.getItem(SIDE_KEY) || ''), m = /^(gps|bets)(?:\|(.*))?$/.exec(v);
            return m ? { side: m[1], round: m[2] == null ? null : m[2] } : null;
        } catch (e) { return null; }
    }
    function storedSide() {
        var r = sideRecord();
        if (!r) return null;
        if (r.round != null && (!S || r.round !== S.eventCode)) return null;
        return r.side;
    }
    function frontDoor() { try { return localStorage.getItem('hardpan_front_door'); } catch (e) { return null; } }
    // The two front doors show in the app (Capacitor), or with window.__hardpanDoors.
    function doorsOn() {
        if (window.__hardpanDoors === true) return true;
        try { var C = window.Capacitor; return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform() && C.Plugins && C.Plugins.Geolocation); } catch (e) { return false; }
    }
    function roundPlayers() { try { return (typeof currentData !== 'undefined' && currentData && currentData.players) || []; } catch (e) { return []; } }   /* global currentData */
    function openAddGame() {
        // The app's one Add a game sheet (front-door.js): the same from +, Tools and ≡.
        if (window.HardPanDoors && typeof window.HardPanDoors.openAddGame === 'function' && window.HardPanDoors.openAddGame()) return;
        if (!S) return;
        var sh = S.el.querySelector('.gps-addgame');
        if (!sh) return;
        var box = sh.querySelector('.gps-ag-players');
        box.textContent = '';
        roundPlayers().forEach(function (p) { var sp = document.createElement('span'); sp.textContent = String(p.name || '').split(' ')[0]; box.appendChild(sp); });
        // The quick starts (and their amounts) are the front door's (front-door.js).
        var grid = sh.querySelector('.gps-ag-grid');
        grid.textContent = '';
        ((window.HardPanDoors && window.HardPanDoors.QUICK_STARTS) || []).forEach(function (q) {
            var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-ag-tpl', q.tpl);
            var t = document.createElement('b'); t.textContent = q.name; var d = document.createElement('span'); d.textContent = q.sub;
            b.appendChild(t); b.appendChild(d); grid.appendChild(b);
        });
        sh.style.display = '';
    }
    function closeAddGame() { var sh = S && S.el.querySelector('.gps-addgame'); if (sh) sh.style.display = 'none'; }
    function lastSide() { return storedSide() === 'gps' ? 'gps' : 'bets'; }
    function rememberSide(side) {
        side = side === 'gps' ? 'gps' : 'bets';
        try { localStorage.setItem(SIDE_KEY, S && S.eventCode ? side + '|' + S.eventCode : side); } catch (e) {}
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
            fix = { pt: [pos.coords.latitude, pos.coords.longitude], acc: pos.coords.accuracy, at: Date.now() };
            S.geoError = null;
            render();
        };
        // A FIX OLDER THAN 10 s IS NOT WHERE THE GOLFER IS (audit C3): the screen goes back to
        // "Finding you…" (and measures from the tee) until a fresh one arrives.
        if (!staleTimer) staleTimer = setInterval(function () { if (dropStaleFix() && S) render(); }, 3000);
        var onErr = function (err) {
            if (gen !== watchGen || !S) return;
            S.geoError = (err && (err.code === 1 || /denied|permission/i.test(String(err.message || '')))) ? 'denied'
                : (err && err.code === 3) ? 'timeout' : 'unavailable';
            // LANDED HERE BY ITSELF and location is off: the scorecard, as before
            // GPS - not a GPS side that can only say "location is off".
            if (S.geoError === 'denied' && S.autoLanded && !S.userChoseSide && S.side === 'gps') { showSide('bets', { remember: false }); return; }
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
                }, function (e) {
                    // The plugin refused outright: not 'pending' for ever - the next GPS open tries again.
                    if (gen === watchGen) watchId = null;
                    onErr(e);
                });
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
        if (staleTimer) { clearInterval(staleTimer); staleTimer = null; }
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
        else {
            // Back from the lock screen: the last fix is where the golfer WAS (audit C3).
            if (dropStaleFix()) render();
            if (S.side === 'gps') startWatch();
        }
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
        var ga = golfapiFor(key);
        if (ga) return ga;
        if (!osmOn()) return null;   // GPS LIVE: GolfAPI or nothing - Tools > Set the green
        var all = (typeof window !== 'undefined' && window.HardPanGpsCourses) || {};
        // Bundled first; else what an OpenStreetMap lookup found for this course
        // (this phone's, or the shared one) - see ANY COURSE below.
        // THE NEWER OSM DATA WINS (2026-10-10): a phone that looked a course up
        // before it was bundled keeps that copy, and the bundle can be newer (Dobson
        // Ranch: 9 greens in a 10/9 lookup, 18 in the bundle). Both carry the
        // OpenStreetMap timestamp they were read at (osmBase); the lookup is used
        // only when it is strictly newer, so a tie or a missing date is the bundle.
        var b = G.osmCourse(all, G.bundleKeyFor(all, key, S && S.courseKey === key && S.round ? S.round.courseName : null, S && S.courseLoc ? S.courseLoc : null)), l = lookedUp(key);
        if (b && l && osmNewer(l.osmBase, b.osmBase)) return l;
        return b || l;
    }
    function osmNewer(a, b) {
        var ta = Date.parse(a || ''), tb = Date.parse(b || '');
        return isFinite(ta) && isFinite(tb) && ta > tb;
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
    // EDIT PIN WAS REMOVED (Manny, 2026-10-08): CENTER is always the green's
    // center. The round's old pinLocs records are left where they are in the
    // database - this side no longer reads or writes them.
    // Where the CENTER number, the arcs, the white line and "Target -> ..." point.
    function aimAt(r) {
        return (r && r.mid) || null;
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
                // A lookup another phone shared (build 5).
                if (v && v.osm && v.osm.holes && S && S.courseKey === key) { S.osmShared = v.osm; lsSet(OSM_LOOKUP + key, v.osm); }
                if (S && S.courseKey === key) { if (v) S.courseRec = v; render(); }
            }, function () { /* no rule yet, or offline: the cache and the round carry it */ });
        } catch (e) {}
    }

    // ---- ANY COURSE: AN OPENSTREETMAP LOOKUP (build 5, 2026-10-09) --------------
    // A course with no bundled GPS data (gps-courses.js) is looked up in
    // OpenStreetMap: the golf=hole and golf=green features inside THAT course's
    // area only, as tools/gps-import-osm.js does for the bundled ones. Found from
    // the COURSE's own location in the course directory (global_courses/<key>/
    // location) - never the golfer's position (see PRIVACY above). Two small
    // Overpass queries per course per phone, ever: the golf courses within 2.5 km
    // of that point (ours picked by name), then its holes and greens. A hole is
    // kept only when its line ends inside its green, as the importer keeps them;
    // OSM's par is never used. The answer is kept on this phone and offered to
    // the shared record course_gps/<key>/osm so the next phone has it - refused
    // until that path has a rule (docs/gps-rules-proposal.json), which is fine:
    // each phone then asks once. Nothing found: asked again after a week; an
    // error or no signal: after a day.
    var OSM_LOOKUP = 'hardpan_osm_v1_', COURSE_LOC = 'hardpan_course_loc_v1_';
    // Two public Overpass servers, free, no key. overpass-api.de refuses requests
    // from a browser (HTTP 406 for any browser user-agent, measured 2026-10-09), so
    // the mirror that answers browsers goes first; the main one is the fallback.
    // Courses OSM maps well are BUNDLED instead (tools/gps-import-osm.js), so this
    // lookup is only for the rest.
    function lookedUp(key) {
        if (S && S.courseKey === key && S.osmShared && S.osmShared.holes) return S.osmShared;
        var v = lsGet(OSM_LOOKUP + key);
        return v && v.holes && Object.keys(v.holes).length ? v : null;
    }
    // The course's point: this phone's copy, the bundled holes, or the directory.
    function courseCenter() {
        if (S && S.courseLoc) return S.courseLoc;
        var rec = S && osmRecord(S.courseKey), pts = [];
        if (rec && rec.holes) Object.keys(rec.holes).forEach(function (n) { var o = rec.holes[n].osm; if (o && o.mid) pts.push(o.mid); });
        if (!pts.length) return clubPoint();
        return [pts.reduce(function (a, q) { return a + q[0]; }, 0) / pts.length, pts.reduce(function (a, q) { return a + q[1]; }, 0) / pts.length];
    }
    // NEVER THE WHOLE WORLD (Thistle MacKay, 2026-10-15): with no green and no location, the club -
    // a bundled nine of this course (thistle_27_*), else the GolfAPI club's lat / lng by name.
    function clubPoint() {
        try {
            var base = String((S && S.round && S.round.activeCourseKey) || '').toLowerCase();
            var all = window.HardPanGpsCourses || {};
            if (base) {
                var k = Object.keys(all).filter(function (x) { return x !== base && x.indexOf(base + '_') === 0 && all[x] && all[x].holes; }).sort()[0];
                var rec = k && G.osmCourse(all, k), pts = [];
                if (rec && rec.holes) Object.keys(rec.holes).forEach(function (n) { var o = rec.holes[n].osm || rec.holes[n]; if (o && o.mid) pts.push(o.mid); });
                if (pts.length) return [pts.reduce(function (a, q) { return a + q[0]; }, 0) / pts.length, pts.reduce(function (a, q) { return a + q[1]; }, 0) / pts.length];
            }
            var d = window.HardPanGolfApi, club = String((S && S.round && S.round.courseName) || '').replace(/\(.*\)/, '').trim().toLowerCase();
            if (d && d.courses && club) {
                var ids = Object.keys(d.courses).filter(function (id) { var c = d.courses[id]; return c && isFinite(c.lat) && String(c.club || '').toLowerCase() === club; });
                if (ids.length) { var c0 = d.courses[ids[0]]; return [c0.lat, c0.lng]; }
            }
        } catch (e) {}
        return null;
    }
    function loadCourseLocation(done) {
        var key = S.courseKey, mine = S;
        var fin = function () { if (S === mine) S.locPending = false; if (done) done(S === mine ? S.courseLoc : null); };
        var c = lsGet(COURSE_LOC + key);
        if (c && isFinite(c.lat) && isFinite(c.lng)) { S.courseLoc = [c.lat, c.lng]; fin(); return; }
        if (!S.db || typeof S.db.ref !== 'function') { fin(); return; }
        S.locPending = true;
        try {
            S.db.ref('global_courses/' + key + '/location').once('value').then(function (snap) {
                var L = snap && typeof snap.val === 'function' ? snap.val() : null;
                var lat = L && Number(L.latitude != null ? L.latitude : L.lat), lng = L && Number(L.longitude != null ? L.longitude : (L.lng != null ? L.lng : L.lon));
                if (L && isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng)) {
                    lsSet(COURSE_LOC + key, { lat: lat, lng: lng });
                    if (S === mine) S.courseLoc = [lat, lng];
                }
                fin();
            }, fin);
        } catch (e) { fin(); }
    }
    // THE LOOKUP IS gps-match.js NOW (2026-10-10), shared with the setup page that
    // runs it the moment a course is picked: the same order (bundle, a kept lookup,
    // one OpenStreetMap lookup from the course point), the same keys on the phone,
    // and gps-geo.pickHoleSet choosing this course's holes when the outline holds
    // more than one course. Unsure -> S.holeAsk: the candidates' hole 1s on the map,
    // one tap, saved - never a silent "No green mapped".
    function lookupCourse(done) {
        var fin = function (found) { if (done) { var d = done; done = null; d(found); } };
        var M = (typeof window !== 'undefined' && window.HardPanGpsMatch) || null;
        if (!S || !M) { fin(false); return; }
        var key = S.courseKey, mine = S;
        var all = (typeof window !== 'undefined' && window.HardPanGpsCourses) || {};
        // No pull on the tee: a course the phone has is used as the pick left it.
        if (osmRecord(key)) { fin(true); return; }
        if (!osmOn()) {
            var L = window.HardPanGpsLive;
            if (!liveOn() || !L) { fin(false); return; }
            L.ensure(key).then(function (got) {
                if (got && S === mine) { S.gaCache = null; S.needsFrame = true; render(); }
                fin(!!(got && osmRecord(key)));
            });
            return;
        }
        if (S.osmInFlight) { fin(false); return; }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) { fin(false); return; }
        if (!S.courseLoc) { fin(false); return; }
        S.osmInFlight = true;
        M.match(lookupWant()).then(function (r) {
            mine.osmInFlight = false;
            if (r.status === 'ask') { if (S === mine) { S.holeAsk = r.candidates; S.needsFrame = true; render(); } fin(false); return; }
            var ok = r.status === 'ready' || r.status === 'partial';
            if (S === mine) { S.holeAsk = null; if (ok) { S.needsFrame = true; render(); } }
            fin(ok);
        });
    }
    // THE ORGANIZER'S BACKUP: Tools > Refresh GPS data pulls the course from
    // OpenStreetMap now (gps-match.js keeps it only when newer and with at least as
    // many holes). Nothing else pulls during a round - the fresh pull happens when
    // the course is picked in setup. The point is the course's - our record's, else
    // the middle of its mapped greens - never the golfer's.
    function recheckCourse(mode, after) {
        var M = (typeof window !== 'undefined' && window.HardPanGpsMatch) || null;
        if (!S || !M || S.recheckInFlight) { if (after) after(null); return; }
        var w = lookupWant();
        w.loc = S.courseLoc || courseCenter();
        w.recheck = mode;
        if (!w.loc) { if (after) after(null); return; }
        var mine = S;
        S.recheckInFlight = true;
        M.match(w).then(function (r) {
            mine.recheckInFlight = false;
            if (S !== mine) return;
            if (r && (r.rechecked === 'better' || r.rechecked === 'newer')) { S.osmShared = null; S.needsFrame = true; render(); }
            if (after) after(r);
        });
    }
    function flash(text) {
        if (!S) return;
        S.flash = text;
        clearTimeout(S.flashTimer);
        S.flashTimer = setTimeout(function () { if (S) { S.flash = ''; render(); } }, 5000);
        render();
    }
    // What the matcher needs about THIS course: its name, point and card.
    function lookupWant() {
        var list = (typeof S.holeList === 'function' ? S.holeList() : null) || [];
        var n = list.length === 9 ? 9 : 18, pars = [], yards = [];
        for (var h = 1; h <= n; h++) {
            var m = (typeof S.holeMeta === 'function' ? S.holeMeta(h) : null) || {};
            pars.push(m.par != null ? Number(m.par) : null);
            yards.push(m.yards ? Number(m.yards) : null);
        }
        return { key: S.courseKey, name: (S.round && S.round.courseName) || '', loc: S.courseLoc, holes: n,
                 pars: pars.some(function (x) { return x; }) ? pars : [], yards: yards.some(function (x) { return x; }) ? yards : [], db: S.db };
    }
    // ONE TAP (step 5): a candidate course's hole 1, chosen on the map.
    function chooseHoleOne(id) {
        var M = window.HardPanGpsMatch, mine = S;
        if (!S || !M) return;
        M.choose(S.courseKey, id, { db: S.db }).then(function (r) {
            if (S !== mine) return;
            S.holeAsk = null;
            S.needsFrame = true; S.framed = null;
            if (!r) { lookupCourse(); return; }
            frameHole(false); render();
        });
    }
    // HAZARD CARRIES (GolfAPI courses): each bunker / water point on this hole, with
    // the distance to it from you (or the tee), at the point. Past the green or
    // behind you: not shown.
    function drawHazards() {
        var keep = {};
        var rec = osmRecord(S.courseKey), h = rec && rec.holes && rec.holes[String(S.hole)];
        var hz = (h && h.osm && h.osm.hazards) || [];
        var r = resolved(), o = r && origin(r);
        if (S.map && ML() && S.mode === 'measure' && o && r && r.mid && hz.length) {
            var toGreen = G.haversineMeters(o.pt, r.mid), dir = G.bearingDeg(o.pt, r.mid);
            hz.forEach(function (z, i) {
                var d = G.haversineMeters(o.pt, z.pt);
                var off = Math.abs((((G.bearingDeg(o.pt, z.pt) - dir) % 360) + 540) % 360 - 180);
                if (d > toGreen + 25 || off > 75) return;
                var k = 'hz' + i;
                keep[k] = 1;
                var m = marker(k, z.pt, function () {
                    var e = document.createElement('div');
                    e.className = 'gps-hz ' + (z.type === 'w' ? 'gps-hz-water' : 'gps-hz-bunker');
                    return e;
                });
                var t = (z.type === 'w' ? 'W ' : 'B ') + G.shownDistance(d, units());
                var el = m && m.getElement();
                if (el && el.textContent !== t) el.textContent = t;
            });
        }
        Object.keys(S.markers || {}).forEach(function (k) { if (/^hz/.test(k) && !keep[k]) marker(k, null); });
    }
    // ---- HAZARDS + LAYUPS SHEET (008, switch hazards) --------------------------------
    // "Hazards" on the map: every hazard GolfAPI marks on this hole, with REACH (its near
    // edge) and CARRY (its far edge) from the golfer - or from the tee, off the hole - and
    // the layups: "Lay up to 100 = 164 from you" (50 / 75 / 100 / 125 / 150, only those
    // short of the green). The points the app already has (gps-geo.hazardRows); nothing is
    // fetched. Redrawn on every fix while it is open. A hole with no hazard data says so.
    function hzSwitch() { try { return typeof window.HardPanFeature !== 'function' || window.HardPanFeature('hazards') !== false; } catch (e) { return true; } }
    function hzSheet() { return S && S.el.querySelector('.gps-hzs'); }
    function hzOpen() { var h = hzSheet(); return !!(h && h.style.display !== 'none'); }
    function openHazards() { var h = hzSheet(); if (!h || !S) return; closeMenus(); h.style.display = ''; fillHazards(); }
    function closeHazards() { var h = hzSheet(); if (h) h.style.display = 'none'; }
    function fillHazards() {
        var h = hzSheet();
        if (!h || !S || !G.hazardRows) return;
        var u = units(), sfx = u === 'm' ? ' m' : '', d = function (m) { return G.shownDistance(m, u); };
        var rec = osmRecord(S.courseKey), hr = rec && rec.holes && rec.holes[String(S.hole)];
        var hz = (hr && hr.osm && hr.osm.hazards) || [];
        var r = resolved(), o = origin(r);
        var who = o && o.from === 'tee' ? 'from the tee' : 'from you';
        h.querySelector('.gps-hzs-title').textContent = 'Hazards \u00b7 Hole ' + S.hole;
        h.querySelector('.gps-hzs-sub').textContent = !o ? 'Finding you\u2026' : (u === 'm' ? 'Meters ' : 'Yards ') + who;
        var list = h.querySelector('.gps-hzs-list'), lay = h.querySelector('.gps-hzs-lay');
        list.textContent = ''; lay.textContent = '';
        var row = function (box, cls, name, nums) {
            var e = document.createElement('div'); e.className = 'gps-hzs-row ' + cls;
            var a = document.createElement('span'); a.className = 'gps-hzs-name'; a.textContent = name;
            var b = document.createElement('span'); b.className = 'gps-hzs-nums'; b.textContent = nums;
            e.appendChild(a); e.appendChild(b); box.appendChild(e);
        };
        if (!hz.length) {
            var none = document.createElement('div'); none.className = 'gps-hzs-none';
            none.textContent = 'No hazard data for this hole.';
            list.appendChild(none);
        } else if (o) {
            G.hazardRows(o.pt, hz, r && r.mid).forEach(function (z) {
                var cls = z.type === 'w' ? 'gps-hzs-water' : 'gps-hzs-bunker';
                if (z.behind) row(list, cls + ' gps-hzs-behind', z.name, 'behind ' + (o.from === 'tee' ? 'the tee' : 'you'));
                else row(list, cls, z.name, 'reach ' + d(z.reachM) + sfx + ' \u00b7 carry ' + (z.carryM == null ? '\u2014' : d(z.carryM) + sfx));
            });
        }
        var toGreen = o && r && r.mid ? G.haversineMeters(o.pt, r.mid) : null;
        var lays = toGreen ? G.layupTargets(toGreen, u === 'm' ? 1 : G.M_PER_YD) : [];
        h.querySelector('.gps-hzs-layh').style.display = lays.length ? '' : 'none';
        lays.forEach(function (l) { row(lay, 'gps-hzs-layup', 'Lay up to ' + l.leave + sfx, '= ' + d(l.fromM) + sfx + ' ' + who); });
    }
    function drawHoleAsk() {
        var want = S.holeAsk || [];
        Object.keys(S.markers || {}).forEach(function (k) { if (/^ask/.test(k) && !want.some(function (c) { return 'ask' + c.id === k; })) marker(k, null); });
        if (!S.map || !ML()) return;
        want.forEach(function (c) {
            marker('ask' + c.id, c.tee, function () {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'gps-ask-hole1';
                b.textContent = 'Hole 1 · ' + c.label;
                b.setAttribute('aria-label', 'This is my hole 1: ' + c.label);
                b.addEventListener('click', function (e) { e.stopPropagation(); chooseHoleOne(c.id); });
                return b;
            });
        });
        if (want.length && S.askFramed !== want.map(function (c) { return c.id; }).join()) {
            S.askFramed = want.map(function (c) { return c.id; }).join();
            var la = want.map(function (c) { return c.tee[0]; }), lo = want.map(function (c) { return c.tee[1]; });
            try { S.map.fitBounds([[Math.min.apply(null, lo), Math.min.apply(null, la)], [Math.max.apply(null, lo), Math.max.apply(null, la)]], { padding: 90, maxZoom: 17, duration: 0 }); } catch (e) {}
        }
    }
    // Does this hole have a green (or a tee) to measure to?
    function holeHasData(n) {
        if (!S || !G) return false;
        var osm = osmRecord(S.courseKey);
        var r = G.resolveHole(osm && osm.holes ? osm.holes[String(n == null ? S.hole : n)] : null, pinsFor(n == null ? S.hole : n));
        return !!(r && (r.mid || r.tee));
    }
    function courseHasAnyData() {
        var osm = S && osmRecord(S.courseKey);
        return !!(osm && osm.holes && Object.keys(osm.holes).length);
    }

    // ONE writer for a pin. The round copy goes through the page's durable queue
    // (a pin set with no signal survives the app closing); the course copy is
    // best effort until course_gps has a rule. Only TAPPED points are ever here.
    function savePin(pin) {
        if (!S || !pin || readOnlyHere()) return;   // view-only (a spectator): never a shared green
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
        // A page with no <head> (a test's minimal DOM) gets no script, not a throw:
        // nothing GPS does may break the card it runs beside.
        var parent = document.head || document.documentElement;
        if (!parent || typeof parent.appendChild !== 'function' || typeof document.createElement !== 'function') { st.state = 'failed'; st.waiters = []; done(); return; }
        var sc = document.createElement('script');
        sc.src = src; sc.async = true;
        var fin = function (ok) {
            st.state = ok && ready() ? 'ready' : 'failed';
            var w = st.waiters; st.waiters = [];
            w.forEach(function (f) { try { f(); } catch (e) {} });
        };
        sc.onload = function () { fin(true); };
        sc.onerror = function () { fin(false); };
        parent.appendChild(sc);
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
    // THE WHOLE COURSE'S HEIGHTS, ONCE, when the round opens with signal - for the
    // phones that never picked the course in setup (gps-offline.js; course points only).
    function prefetchCourseElevs() {
        if (!S || !S.pro || S.elevPrefetch || cfg().elevOnTee !== false || tournament()) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        var mine = S;
        S.elevPrefetch = true;
        loadScript('gps-offline.js', function () { return !!window.HardPanGpsOffline; }, function () {
            var O = window.HardPanGpsOffline;
            if (!O || S !== mine) return;
            O.prefetchElevations(S.courseKey, (S.round && S.round.courseName) || '').then(function () { if (S === mine) syncPlays(); });
        });
    }
    function loadCourses(done) {
        var fin = done;
        done = function () { try { prefetchCourseElevs(); } catch (e) {} fin(); };
        loadScript('gps-courses.js', function () { return !!window.HardPanGpsCourses; }, function () {
            if (!golfapiOn()) { done(); return; }
            var live = function () {
                if (!liveOn()) { done(); return; }
                // GPS LIVE: the round's course from Firebase (gps_links / gps_courses),
                // kept on the phone after the first time - no GolfAPI call, no function.
                loadScript('gps-live.js', function () { return !!window.HardPanGpsLive; }, function () {
                    var L = window.HardPanGpsLive, mine = S;
                    if (!L || !S) { done(); return; }
                    L.merge();
                    L.ensure(S.courseKey).then(function (got) {
                        if (got && S === mine) S.gaCache = null;
                        done();
                    });
                });
            };
            // The bundled file REPLACES window.HardPanGolfApi: live courses are merged after it.
            if (!isNative() && !cfg().golfapiFile) { live(); return; }
            loadScript(String(cfg().golfapiFile || 'gps-golfapi.js'), function () { return !!(window.HardPanGolfApi && window.HardPanGolfApi.built); }, live);
        });
    }
    // GOLFAPI.IO (build 9). The data ships in the iOS app only (tools/build-gps-app.js);
    // the web never has it, so it is only looked for in the app (or when a test's
    // config names a file). golfapi: false in gps-config.js turns it all off.
    function golfapiOn() { var c = cfg(); return c.golfapi !== false && (isNative() || !!c.golfapiFile || !!c.liveTest); }
    // GPS LIVE (gps-config.js live: true) and OPENSTREETMAP (osm: false = off; build 10
    // is osm: true, live: false).
    function liveOn() { var c = cfg(); return golfapiOn() && c.live === true && !!c.liveBase; }
    function osmOn() { return cfg().osm !== false; }
    // THE ROUND'S GOLFAPI COURSE, if there is one: then it is the ONLY source for
    // this course (no OpenStreetMap greens mixed in). gps-geo.golfapiMatch: a puller
    // link, a 27-hole pairing's nines, or the name within 5 km.
    function golfapiFor(key) {
        if (!S || S.courseKey !== key || !G.golfapiMatch || !golfapiOn() || !window.HardPanGolfApi) return null;
        var name = (S.round && S.round.courseName) || '';
        // THE PLACE IS PART OF THE ANSWER (audit C2): a name-only miss made before the course's
        // location arrived must not stick once it has.
        var ck = key + '|' + name + '|' + (S.courseLoc ? S.courseLoc.map(function (x) { return Number(x).toFixed(3); }).join(',') : '-');
        if (S.gaCache && S.gaCache.k === ck) return S.gaCache.v;
        var list = (typeof S.holeList === 'function' ? S.holeList() : null) || [];
        var m = G.golfapiMatch(window.HardPanGolfApi, key, name, S.courseLoc || null, list.length === 9 ? 9 : 18, window.HardPanGpsCourses || null);
        S.gaCache = { k: ck, v: m ? m.record : null, how: m ? m.how : '' };
        return S.gaCache.v;
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
    function escapeText(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function esriAttribution() { return TILES.poweredBy + ' | ' + escapeText(TILES.credit); }
    // The Esri layer's source, in ONE place: its tiles never past z19.
    function esriSource(key) {
        return { type: 'raster', tiles: [esriTileUrl().replace('{key}', encodeURIComponent(key))], tileSize: 256, maxzoom: TILES.maxNativeZoom,
                 attribution: esriAttribution() };
    }
    function usgsSourceTiles() { return ['hpusgs://{z}/{y}/{x}?r=' + (S ? S.usgsGen : 0)]; }
    // Ask MapLibre to fetch USGS again - after USGS becomes the picture (Esri
    // failed, or a green is being set), tiles it was refused earlier can now come.
    function refreshUsgs() {
        if (!S || !S.map || !S.map.getSource('usgs')) return;
        S.usgsGen++;
        // Refusals from before (USGS was not the picture then) no longer count.
        S.usgsErrs = 0;
        try { S.map.getSource('usgs').setTiles(usgsSourceTiles()); } catch (e) {}
    }
    // SETTING A GREEN (2026-10-08): BY GPS - stand on the middle (and, if wanted,
    // the front and back) and tap Set - with the sharp Esri photo kept up, since
    // nothing is taken from it. Only at ±5 yds or better. Tapping the photo is
    // the fallback ("Set by tapping (lower detail)"), and that alone uses USGS.
    var GREEN_GPS_YD = 5;
    function tapMode() { return !!S && ['setMid', 'confirmMid', 'setFront', 'setBack', 'confirmAll'].indexOf(S.mode) !== -1; }
    function gpsGoodEnough() { dropStaleFix(); return !!(fix && isFinite(fix.acc) && Math.round(fix.acc / G.M_PER_YD) <= GREEN_GPS_YD); }
    // ... and ON (or near) the green being fixed: within 100 yds of the green the
    // hole has now - a golfer 150 yds down the fairway must not save the green
    // where they stand. A hole with no green yet has nothing to be near.
    var GREEN_NEAR_YD = 100;
    function yardsFromGreen() {
        var r = resolved();
        return (fix && r && r.mid) ? G.haversineMeters(fix.pt, r.mid) / G.M_PER_YD : null;
    }
    function canSetHere() { var y = yardsFromGreen(); return gpsGoodEnough() && (y == null || y <= GREEN_NEAR_YD); }
    // Esri on the map: z21 (z19 tiles, enlarged). USGS: z18 (z16 tiles, enlarged).
    function maxZoomNow() {
        if (!S) return 18;
        if (S.googleOn) return (!S.googleFailed && S.mode === 'measure') ? TILES.maxZoom : 18;
        return (S.esriOn && !S.esriFailed && !tapMode()) ? TILES.maxZoom : 18;
    }

    // ---- ESRI STOPS ANSWERING: USGS TAKES OVER ----------------------------------
    // Four Esri tile errors IN A ROW (a tile that loads resets the count) hand the
    // picture to USGS for the rest of the round - whether Esri never answered (a
    // host the key does not list: 403) or stopped mid-round (the free tier's 2M
    // tiles used up - the account has no card, so it stops rather than bills - the
    // key expired, or the signal went). Losing the signal does it at once. No
    // retry loop: Esri is tried again once, only if it was the signal that went.
    var ESRI_ERRS_TO_FAIL = 4;
    function dropEsri(why) {
        if (!S || !S.esriOn || S.esriFailed) return;
        S.esriFailed = true; S.esriFailWhy = why; S.esriFailAt = S.esriErrRun || 0;
        if (S.map) {
            try { if (S.map.getLayer('esri')) S.map.setLayoutProperty('esri', 'visibility', 'none'); } catch (x) {}
            try { S.map.setMaxZoom(maxZoomNow()); } catch (x) {}
            refreshUsgs();
            reportMapState();
        }
    }
    function dropGoogle(why) {
        if (!S || !S.googleOn || S.googleFailed) return;
        S.googleFailed = true; S.googleFailWhy = why; S.googleFailAt = S.gErrRun || 0;
        syncImageryForMode();
        refreshUsgs();
    }
    function onOffline() { dropEsri('offline'); dropGoogle('offline'); }
    function onOnline() {
        if (S && S.googleOn && S.googleFailed && S.googleFailWhy === 'offline' && !S.googleRetried && S.map && S.map.getSource('google')) {
            S.googleRetried = true; S.googleFailed = false; S.googleFailWhy = null; S.gErrRun = 0;
            syncImageryForMode();
            return;
        }
        if (!S || !S.esriFailed || S.esriFailWhy !== 'offline' || S.esriRetried || !S.map || !S.map.getSource('esri')) return;
        S.esriRetried = true;
        S.esriFailed = false; S.esriFailWhy = null; S.esriErrRun = 0;
        // Tiles that failed while offline are asked for again.
        try { S.map.getSource('esri').setTiles(esriSource(esriKey()).tiles); } catch (x) {}
        syncImageryForMode();
    }

    // ---- THE MAP --------------------------------------------------------------
    var EMPTY = { type: 'FeatureCollection', features: [] };
    function ll(p) { return [p[1], p[0]]; }               // [lat, lng] -> [lng, lat]
    function buildMap() {
        var ml = ML();
        var el = S.el.querySelector('.gps-map');
        if (!ml || !el) { S.map = null; if (el) el.classList.add('gps-no-tiles'); return; }
        addUsgsProtocol(ml);
        S.imagery = imageryChoice();
        S.googleOn = S.imagery === 'google';
        // Google chosen: Esri is not on the map at all (no Google with another map).
        var key = S.googleOn ? '' : esriKey();
        S.esriOn = !!key;
        var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        S.googleFailed = S.googleOn && offline; S.googleFailWhy = S.googleFailed ? 'offline' : null; S.gErrRun = 0;
        S.esriFailed = !key || offline;
        S.esriFailWhy = !key ? 'no-key' : (offline ? 'offline' : null);
        S.esriErrRun = 0;
        S.tileErrors = 0; S.tileLoads = 0; S.usgsGen = 0;
        var sources = {
            usgs: { type: 'raster', tiles: usgsSourceTiles(), tileSize: 256, maxzoom: TILES.usgs.maxNativeZoom,
                    attribution: escapeText(TILES.usgs.attribution) },
            hole: { type: 'geojson', data: EMPTY },
            // The OSM credit rides the lines (always drawn): with no center line or
            // green outline any more (build 3), 'hole' has no layer to carry it.
            lines: { type: 'geojson', data: EMPTY, attribution: OSM_ATTRIBUTION },
            arcs: { type: 'geojson', data: EMPTY },
            acc: { type: 'geojson', data: EMPTY }
        };
        var layers = [
            { id: 'bg', type: 'background', paint: { 'background-color': '#1d3b2a' } },
            // Hidden from the start when Google is to be the picture (never two maps).
            { id: 'usgs', type: 'raster', source: 'usgs', layout: { visibility: (S.googleOn && !S.googleFailed) ? 'none' : 'visible' } },
            { id: 'acc-fill', type: 'fill', source: 'acc', paint: { 'fill-color': '#60a5fa', 'fill-opacity': 0.12 } },
            // BUILD 3 LOOK (2026-10-09, Manny's iPhone test): clean as Golfshot - no
            // arcs, no center line, no green fill or outline, nothing yellow. Two
            // thin white lines (golfer or tee -> circle, circle -> green center)
            // with a faint dark edge so they read on a light fairway.
            { id: 'line-case', type: 'line', source: 'lines', paint: { 'line-color': '#000000', 'line-width': 3.5, 'line-opacity': 0.35 } },
            { id: 'line-to', type: 'line', source: 'lines', filter: ['==', ['get', 'k'], 'to'], paint: { 'line-color': '#ffffff', 'line-width': 1.6 } },
            { id: 'line-on', type: 'line', source: 'lines', filter: ['==', ['get', 'k'], 'on'], paint: { 'line-color': '#ffffff', 'line-width': 1.6 } }
        ];
        // With a key the Esri layer is always there - hidden while it has failed, so
        // it can come back once if the signal does. A hidden layer asks for nothing.
        if (S.esriOn) {
            sources.esri = esriSource(key);
            layers.splice(2, 0, { id: 'esri', type: 'raster', source: 'esri', layout: { visibility: S.esriFailed ? 'none' : 'visible' } });
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
            if (sid === 'google') {
                S.gErrRun = (S.gErrRun || 0) + 1;
                if (S.gErrRun >= ESRI_ERRS_TO_FAIL) dropGoogle('errors');
            }
            if (sid === 'esri') {
                // Esri is not answering - in a row, however many tiles loaded before.
                S.esriErrs = (S.esriErrs || 0) + 1;
                S.esriErrRun = (S.esriErrRun || 0) + 1;
                if (S.esriErrRun >= ESRI_ERRS_TO_FAIL) dropEsri('errors');
            }
            if (sid === 'usgs') S.usgsErrs = (S.usgsErrs || 0) + 1;
            if (sid === 'usgs' || sid === 'esri') { S.tileErrors++; syncNoTiles(); }
        });
        map.on('data', function (e) {
            if (!S || S.map !== map || !e || e.dataType !== 'source' || !e.tile) return;
            if (e.sourceId === 'esri') { S.esriLoads = (S.esriLoads || 0) + 1; S.esriErrRun = 0; }
            if (e.sourceId === 'google') { S.googleLoads = (S.googleLoads || 0) + 1; S.gErrRun = 0; }
            if (e.sourceId === 'usgs' || e.sourceId === 'esri' || e.sourceId === 'google') { S.tileLoads++; syncNoTiles(); reportMapState(); }
        });
        map.on('moveend', function () { if (S && S.map === map) { reportMapState(); googleCopyrightSoon(); } });
        // A move the golfer made (a pan or a pinch) - not one this file made.
        map.on('movestart', function (e) { if (S && S.map === map && e && e.originalEvent) S.userMoved = true; });
        // The pills and the ring follow the map as it moves and zooms.
        map.on('move', function () {
            if (!S || S.map !== map) return;
            sizeTarget();
            var r = resolved();
            if (S.arcs && S.arcStep !== arcStepNow(aimAt(r))) drawArcs(r, origin(r));
            placePills();
        });
        map.on('resize', function () {
            if (!S || S.map !== map) return;
            if (S.view === 'green' && !S.userMoved) { frameGreen(); return; }
            if (S.needsFrame || (S.framed === 'hole' && !S.userMoved && !S.zoomStep)) frameHole(false);
        });
        // Tap anywhere: the target jumps there (or a green pin is placed).
        map.on('click', function (e) { onMapTap([e.lngLat.lat, e.lngLat.lng]); });
        S.map = map;
        S.styleReady = false;
        map.on('load', function () {
            if (!S || S.map !== map) return;
            S.styleReady = true;
            if (S.googleOn) addGoogleLayer();
            limitToCourse();
            frameHole(true);
            render();
            // READY: loaded, framed on the hole and drawn. data-zoom alone is not
            // this - tile data sets it before the load event (a check that waited
            // for it read a map still at its world view, tee at x -255).
            el.setAttribute('data-ready', '1');
        });
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
        el.setAttribute('data-view', S.view || 'hole');
        el.setAttribute('data-esri-why', S.esriFailWhy || '');
        el.setAttribute('data-esri-fail-at', S.esriFailed && S.esriFailWhy === 'errors' ? String(S.esriFailAt) : '');
        var es = S.map.getSource('esri');
        el.setAttribute('data-esri-src-max', es ? String(es.maxzoom) : '');
        var gs = S.map.getSource('google');
        el.setAttribute('data-google', !S.googleOn ? 'off' : (S.googleFailed ? 'failed' : (S.map.getLayer('google') ? (S.map.getLayoutProperty('google', 'visibility') || 'visible') : 'pending')));
        el.setAttribute('data-google-why', S.googleFailWhy || '');
        el.setAttribute('data-google-loads', String(S.googleLoads || 0));
        el.setAttribute('data-google-src-max', gs ? String(gs.maxzoom) : '');
        el.setAttribute('data-google-vp', String(S.googleVp || 0));
        el.setAttribute('data-usgs-vis', S.map.getLayer('usgs') ? (S.map.getLayoutProperty('usgs', 'visibility') || 'visible') : '');
        el.setAttribute('data-tiles-loaded', String(S.tileLoads || 0));
        el.setAttribute('data-max-zoom', String(S.map.getMaxZoom()));
        el.setAttribute('data-bearing', String(Math.round(S.map.getBearing())));
        el.setAttribute('data-zoom', S.map.getZoom().toFixed(2));
        // Where the MAP is looking (not the golfer): for the free-pan checks.
        var mc = S.map.getCenter();
        el.setAttribute('data-center', mc.lng.toFixed(5) + ',' + mc.lat.toFixed(5));
        el.setAttribute('data-min-zoom', String(S.map.getMinZoom()));
        var r = resolved();
        if (r && r.tee) { var tp = S.map.project(ll(r.tee)); el.setAttribute('data-tee-px', Math.round(tp.x) + ',' + Math.round(tp.y)); }
        if (r && r.green && r.green.length) {
            var gb = [Infinity, Infinity, -Infinity, -Infinity];
            r.green.forEach(function (p) { var q = S.map.project(ll(p)); gb = [Math.min(gb[0], q.x), Math.min(gb[1], q.y), Math.max(gb[2], q.x), Math.max(gb[3], q.y)]; });
            el.setAttribute('data-green-box', gb.map(Math.round).join(','));
        }
        syncCredit();
        el.setAttribute('data-attrib-h', String(attribH()));
        syncLayoutVars();
        maybeRefit();
    }
    // Google's layer goes in once a session is in hand (from the phone, or a fresh
    // one). No session (a bad key, no signal): USGS is the picture.
    function addGoogleLayer() {
        var mine = S;
        googleSession(function (session) {
            if (S !== mine || !S.map) return;
            if (!session) { S.googleFailed = true; S.googleFailWhy = S.googleFailWhy || 'session'; syncImageryForMode(); refreshUsgs(); return; }
            try {
                if (!S.map.getSource('google')) {
                    S.map.addSource('google', googleSource(session));
                    S.map.addLayer({ id: 'google', type: 'raster', source: 'google', layout: { visibility: 'none' } }, 'line-case');
                }
            } catch (e) {}
            syncImageryForMode();
            googleCopyrightSoon();
        });
    }
    // GOOGLE'S COPYRIGHT LINE for the area on screen (its viewport endpoint), asked
    // after the map settles, not on every frame. The area asked about is the map's
    // view - the hole - not the golfer.
    var gcTimer = null;
    function googleCopyrightSoon() {
        if (!S || !S.googleOn || S.googleFailed || !S.map || !S.map.getSource('google')) return;
        if (gcTimer) clearTimeout(gcTimer);
        var mine = S;
        gcTimer = setTimeout(function () {
            gcTimer = null;
            if (S !== mine || !S.map || typeof fetch !== 'function') return;
            var src = S.map.getSource('google'), b = S.map.getBounds(), z = Math.min(Math.round(S.map.getZoom()), GOOGLE.maxNativeZoom);
            var m = /session=([^&]+)/.exec((src && src.tiles && src.tiles[0]) || '');
            if (!m) return;
            S.googleVp = (S.googleVp || 0) + 1;
            // The edges ROUNDED OUTWARD to 0.01 deg (~1 km): the copyright is per area,
            // and a 3x view's edge sat on the golfer's own latitude to 4 places
            // (the check's privacy scan caught it).
            var out = function (v, up) { return (up ? Math.ceil(v * 100) : Math.floor(v * 100)) / 100; };
            fetch(googleBase() + '/tile/v1/viewport?session=' + m[1] + '&key=' + encodeURIComponent(googleKey()) + '&zoom=' + z
                + '&north=' + out(b.getNorth(), true).toFixed(2) + '&south=' + out(b.getSouth(), false).toFixed(2) + '&east=' + out(b.getEast(), true).toFixed(2) + '&west=' + out(b.getWest(), false).toFixed(2))
                .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
                    if (S !== mine || !j || typeof j.copyright !== 'string') return;
                    S.googleCopyright = j.copyright;
                    syncCredit();
                }, function () {});
        }, 700);
    }
    // The credit line names the picture on screen: Esri when its layer shows,
    // else USGS. ⓘ shows every line.
    function googleShown() { return !!(S && S.map && S.map.getLayer('google') && S.map.getLayoutProperty('google', 'visibility') === 'visible'); }
    function syncCredit() {
        if (!S || !S.map) return;
        var esriShown = !!(S.map.getLayer('esri') && S.map.getLayoutProperty('esri', 'visibility') !== 'none' && !S.esriFailed);
        var g = googleShown();
        // With Google: its logo and its copyright line, on the map, unhidden.
        var logo = S.el.querySelector('.gps-google-logo');
        if (logo) logo.style.display = g ? '' : 'none';
        txt('.gps-credit-txt', g ? (S.googleCopyright || 'Google') : (esriShown ? 'Powered by Esri' : 'USGS'));
        S.el.classList.toggle('gps-credit-google', g);
        var pop = S.el.querySelector('.gps-credit-pop');
        if (pop && pop.style.display !== 'none') fillCredits();
    }
    function fillCredits() {
        var a = S.el.querySelector('.maplibregl-ctrl-attrib-inner') || S.el.querySelector('.maplibregl-ctrl-attrib');
        var pop = S.el.querySelector('.gps-credit-pop');
        // One line per credit, from MapLibre's own (it lists the sources on the map).
        if (a && pop) pop.innerHTML = a.innerHTML.split(' | ').map(function (l) { return '<div>' + l + '</div>'; }).join('')
            // BUILD 3: the accuracy and where the green came from, small, here only.
            + '<div class="gps-pop-info">' + escapeText([(S.el.querySelector('.gps-acc') || {}).textContent, (S.el.querySelector('.gps-src') || {}).textContent].filter(Boolean).join(' · ')) + '</div>'
            // store-legal: Apple Weather's attribution wherever its wind is on screen
            // (the wind sheet carries it too), and every licence in one page.
            + (wkShown() ? '<div>\uF8FF Weather · <a href="https://weatherkit.apple.com/legal-attribution.html" target="_blank" rel="noopener">Other data sources</a></div>' : '')
            + '<div><a class="gps-ack" href="' + ackHref() + '" target="_blank" rel="noopener">Acknowledgements</a></div>';
    }
    // A web page, not in the bundle: from product-links.js's one origin (Safari in the app).
    function ackHref() { try { if (typeof shareBaseUrl === 'function') return shareBaseUrl() + 'acknowledgements.html'; } catch (e) {} return 'acknowledgements.html'; }
    function wkShown() { try { var w = effectiveWind(); return !!(w && !w.manual && w.src === 'weatherkit'); } catch (e) { return false; } }
    function toggleCredits(e) {
        if (e) e.stopPropagation();
        var pop = S && S.el.querySelector('.gps-credit-pop');
        if (!pop) return;
        if (pop.style.display === 'none') { fillCredits(); pop.style.display = ''; }
        else pop.style.display = 'none';
    }
    function closeCredits() { var pop = S && S.el.querySelector('.gps-credit-pop'); if (pop) pop.style.display = 'none'; }
    // The floating panels' positions follow what is measured: the attribution
    // bar's height (two or three lines with the Esri credit) and the top panel's.
    function syncLayoutVars() {
        if (!S) return;
        S.el.style.setProperty('--gps-attrib-h', attribH() + 'px');
        var t = S.el.querySelector('.gps-top');
        if (t && t.offsetParent !== null) S.el.style.setProperty('--gps-top-b', Math.round(t.getBoundingClientRect().bottom - S.el.getBoundingClientRect().top + 8) + 'px');
    }
    // The hole's own view follows the screen until the golfer moves the map: the
    // phone's toolbars settle, or the attribution bar gains the Esri credit.
    function maybeRefit() {
        // Never from inside a frame: MapLibre fires move events DURING jumpTo, and a
        // refit from there was a refit loop that froze the page (check, 2026-10-08).
        if (!S || !S.map || S.framing || S.framed !== 'hole' || S.userMoved || S.zoomStep || S.view === 'green') return;
        var h = attribH();
        if (S.attribAt != null && h !== S.attribAt) { frameHole(false); return; }
        // ... or the floating panels changed size (the top panel's text arrived).
        var vp = viewPad();
        if (S.pad && (Math.abs(vp.top - S.pad.top) > 2 || Math.abs(vp.bottom - S.pad.bottom) > 2)) {
            // At most three of these in two seconds: a pad that kept moving would loop.
            var now = Date.now();
            S.padRefits = (S.padRefits || []).filter(function (t) { return now - t < 2000; });
            if (S.padRefits.length >= 3) return;
            S.padRefits.push(now);
            frameHole(false);
        }
    }

    // The plain background only when NOTHING has drawn - and USGS, the picture
    // of last resort, has failed too (Esri refusing while USGS is still on its
    // way is not "no signal": Wave 2 found the note flashing up on a 403).
    function syncNoTiles() {
        if (!S) return;
        var on = S.tileLoads === 0 && (S.usgsErrs || 0) >= 4 && (!S.esriOn || !!S.esriFailed);
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
        // Only a green set by TAPPING the photo uses USGS (the fallback link). A
        // green set by GPS keeps the sharp Esri photo: nothing is taken from it.
        var pinning = tapMode();
        if (S.googleOn) {
            // GOOGLE: the picture only while measuring - never while ANY green is set
            // (no content may be made from it) - and never with another map under it.
            var gWant = (S.mode === 'measure' && !S.googleFailed && S.map.getLayer('google')) ? 'visible' : 'none';
            if (S.map.getLayer('google') && S.map.getLayoutProperty('google', 'visibility') !== gWant) S.map.setLayoutProperty('google', 'visibility', gWant);
            var uWant = gWant === 'visible' ? 'none' : 'visible';
            if (S.map.getLayer('usgs') && (S.map.getLayoutProperty('usgs', 'visibility') || 'visible') !== uWant) {
                S.map.setLayoutProperty('usgs', 'visibility', uWant);
                if (uWant === 'visible') refreshUsgs();
            }
        }
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
        // No GPS Map: no map, so no imagery stored either.
        if (!hasGpsPro()) return why('no-gps-map');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return why('offline');
        if (typeof caches === 'undefined' || typeof fetch !== 'function') return why('unsupported');
        try {
            var mark = JSON.parse(localStorage.getItem(PRECACHE_MARK + courseKey) || 'null');
            if (mark && mark.at && Date.now() - mark.at < PRECACHE_DAYS * 86400000) return why('fresh');
        } catch (e) {}
        return new Promise(function (resolve) { loadCourses(resolve); }).then(function () {
            var osm = (S && S.courseKey === courseKey) ? osmRecord(courseKey) : G.osmCourse(window.HardPanGpsCourses || {}, courseKey);
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
    // The space the CREDIT LINE takes at the bottom of the screen (to its top).
    function attribH() {
        var c = S && S.el.querySelector('.gps-credit');
        if (!c || c.offsetParent === null) return 20;
        return Math.ceil(S.el.getBoundingClientRect().bottom - c.getBoundingClientRect().top);
    }
    // REDESIGN (step 1): the map is the whole screen and the panels float over
    // it, so the hole is fitted into what the panels leave clear - measured, not
    // guessed: below the top panel (and the line under it), above the Recenter /
    // target row and the bottom row, and clear of the right-hand stack.
    var SIDE_PAD = 76;
    function viewPad() {
        var wrap = S && S.el.querySelector('.gps-map-wrap');
        var W = wrap ? wrap.getBoundingClientRect() : null;
        if (!W || W.height < 10) return { top: VIEW_PAD.top, bottom: Math.max(VIEW_PAD.bottom, attribH() + 8 + 54 + 16), left: SIDE_PAD, right: SIDE_PAD };
        var vis = function (sel) { var e = S.el.querySelector(sel); if (!e || e.offsetParent === null) return null; var b = e.getBoundingClientRect(); return b.height ? b : null; };
        var top = VIEW_PAD.top;
        var tb = vis('.gps-top');
        // The line under the top panel is held at its full height (28px) even
        // before its text arrives - a frame taken while it was empty let the back
        // of Pine Lakes #10's green slip under it once "±6 yds" filled it.
        if (tb) top = Math.max(top, tb.bottom - W.top + 12);
        var sb = vis('.gps-sub');
        if (sb) top = Math.max(top, sb.bottom - W.top + 12);
        var bottomEdge = W.bottom - attribH();
        ['.gps-leftrow .gps-recenter', '.gps-bottom', '.gps-actions'].forEach(function (sel) { var b = vis(sel); if (b) bottomEdge = Math.min(bottomEdge, b.top); });
        var bottom = W.bottom - bottomEdge + 14;
        // Always leave the hole at least 160px: a panel measured mid-layout (the
        // first, slow load) must not leave no room at all - the camera then had
        // nothing to fit into and the map stayed at its world view.
        var room = W.height - top - bottom;
        if (room < 160) { var k = Math.max(0, (W.height - 160) / Math.max(1, top + bottom)); top *= k; bottom *= k; }
        return { top: Math.round(top), bottom: Math.round(bottom), left: SIDE_PAD, right: SIDE_PAD };
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
        syncLayoutVars();
        limitToCourse();
        var cam = holeView();
        if (cam) {
            S.pad = viewPad();
            S.framing = true;
            try { S.map.jumpTo({ center: ll(cam.center), zoom: cam.zoom, bearing: cam.bearing, padding: S.pad }); } finally { S.framing = false; }
            S.framed = 'hole';
            S.camera = cam;
        } else if (first || (S.framed === 'hole' && !resolved())) {
            // No hole to show (not merely a fit that failed - the next frame tries
            // again): the COURSE, from its location (build 5); the world view only
            // when even that is unknown. Never the golfer's street.
            var cc = courseCenter();
            if (cc) { S.map.jumpTo({ center: ll(cc), zoom: 15.5, bearing: 0, padding: viewPad() }); S.framed = 'course'; }
            else { S.map.jumpTo({ center: [0, 20], zoom: 2, bearing: 0, padding: viewPad() }); S.framed = null; }
            S.camera = null;
        }
        // Back to 1x, and the view is the hole's own again (a resize or a taller
        // attribution bar may re-fit it until the golfer moves the map).
        S.zoomStep = 0; S.userMoved = false; S.attribAt = attribH();
        S.view = 'hole';
        syncZoomBtn();
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
    }

    // ---- YARDAGE ARCS (Wave 1) ------------------------------------------------
    // Drawn from where the numbers are measured from (the golfer, or the tee
    // when off the hole) toward today's pin or the green's center. All local
    // math on bundled data: they work with no signal. Each carries a small label
    // ("125y", or "150 to pin") at its LEFT end on screen - which end that is
    // depends on the hole's turn, so it is worked out on every move.
    // SPACING FOLLOWS THE ZOOM: every 25 yds when 25 yds is at least 26 px on the
    // screen, else 50, else 100 - a 580-yd par 5 seen whole would otherwise be a
    // ladder of 22 lines (measured on Pine Lakes #10, 2026-10-08).
    var ARC_MIN_PX = 26;
    function arcStepNow(at) {
        if (!S.map || !at) return G.ARC_STEP_YD;
        var ppy = G.M_PER_YD / metersPerPx(at[0]);
        return [25, 50, 100].filter(function (st) { return st * ppy >= ARC_MIN_PX; })[0] || 100;
    }
    function drawArcs(r, o) {
        var aim = aimAt(r);
        S.arcStep = arcStepNow(aim);
        // At least 44 px either side of the line on screen, so each label sits
        // clear of the pills and the target on the line (30 yds was 26 px on a
        // par 5 seen whole, and half the labels had nowhere to go).
        var ppy = (S.map && aim) ? G.M_PER_YD / metersPerPx(aim[0]) : 1;
        // BUILD 3: no yardage arcs on the map (clean as Golfshot).
        S.arcs = [];
        setData('arcs', { type: 'FeatureCollection', features: S.arcs.map(function (a) { return feature(a.kind, 'LineString', a.pts.map(ll)); }) });
        var mel = S.el.querySelector('.gps-map');
        if (mel) { mel.setAttribute('data-arcs', S.arcs.map(function (a) { return (a.kind === 'pin' ? 'p' : 'c') + a.yards; }).join(' ')); mel.setAttribute('data-arc-step', String(S.arcStep)); }
    }
    function placeArcLabels(obstacles) {
        var box = S && S.el.querySelector('.gps-arc-labels');
        if (!box) return;
        // The 100 / 150 / 200-to-the-pin labels first: they win a crowded spot.
        var arcs = (S.map && S.styleReady && S.side === 'gps' && S.mode === 'measure') ? (S.arcs || []).slice().sort(function (a, b) { return (a.kind === 'pin' ? 0 : 1) - (b.kind === 'pin' ? 0 : 1); }) : [];
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
            var pad = { l: rc.l - 3, t: rc.t - 3, r: rc.r + 3, b: rc.b + 3 };
            var clash = rc.l < 2 || rc.t < 2 || rc.r > wrapR.width - 2 || rc.b > wrapR.height - 2 ||
                (obstacles || []).some(function (ob) { return hits(pad, ob); });
            if (clash) { el.style.display = 'none'; continue; }
            el.style.left = Math.round(rc.l) + 'px'; el.style.top = Math.round(rc.t) + 'px'; el.style.visibility = '';
            (obstacles || []).push(rc);
        }
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
            // tap the green - but ONLY when they are AT the course (build 5: never a
            // map of their street). Off the course: the course itself.
            var cc = courseCenter();
            if (cc && G.haversineMeters(fix.pt, cc) <= 3000) {
                S.map.jumpTo({ center: ll(fix.pt), zoom: 17, bearing: 0 });
                S.framed = 'dot';
            } else if (cc) {
                S.map.jumpTo({ center: ll(cc), zoom: 15.5, bearing: 0 });
                S.framed = 'course';
            }
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
    // A circle the golfer drags, or moves by tapping the map. Until they touch it,
    // it sits at the SMART DEFAULT (build 6, gps-geo.defaultTarget): a par 3's green
    // center; on a par 4 / 5, 260 yds along the hole's own line from the tee (never
    // closer than 60 to the green), or 260 from the golfer when they are on the
    // hole (the green's center inside 280); in the fairway when one is mapped. Par
    // is the CARD's (S.par). It follows as they walk; once touched it stays put
    // until the hole changes or Recenter. Dragging it does not pan the map (a
    // marker drag belongs to the marker); a drag anywhere else pans.
    function placeTarget(r) {
        if (!S || S.targetMoved || !S.pro) return;
        var center = aimAt(r), o = origin(r);
        if (!o || !center) return;
        var osm = osmRecord(S.courseKey), rec = osm && osm.holes && osm.holes[String(S.hole)] && osm.holes[String(S.hole)].osm;
        var p = G.defaultTarget({
            par: S.par, tee: r.tee, mid: center, line: rec && rec.line, fairway: rec && rec.fairway,
            from: o.from === 'me' ? 'me' : 'tee', pt: o.pt
        });
        if (p) S.target = p;
    }
    function drawTargetLines() {
        if (!S || !S.map || !S.styleReady) return;
        var feats = [];
        if (S.target && S.mode === 'measure') {
            var r = resolved(), o = origin(r);
            // BUILD 5: both lines stop AT the circle (the outer 20 yd ring), so
            // with the width line across it the target never reads as a crosshair.
            var ringM = TARGET_RADIUS_YD * G.M_PER_YD;
            var edge = function (from, to) {
                // The point on the ring, on the way from `to` (the target) towards `from`.
                if (G.haversineMeters(from, to) <= ringM * 1.05) return null;
                return G.destination(to, G.bearingDeg(to, from), ringM);
            };
            var eTo = o && edge(o.pt, S.target);
            if (eTo) feats.push(feature('to', 'LineString', [ll(o.pt), ll(eTo)]));
            var aim = aimAt(r), eOn = aim && edge(aim, S.target);
            if (eOn) feats.push(feature('on', 'LineString', [ll(eOn), ll(aim)]));
        }
        setData('lines', { type: 'FeatureCollection', features: feats });
    }
    function targetReadout() {
        if (!S || !G) return;
        var r = resolved(), o = origin(r);
        var u = units();
        var on = !!S.target && S.mode === 'measure' && S.pro;
        show('.gps-target-row', on);
        if (!on) return;
        var who = o && o.from === 'tee' ? 'Tee' : 'You';
        txt('.gps-to-here', who + ' → target: ' + (o ? G.shownDistance(G.haversineMeters(o.pt, S.target), u) : '—'));
        var aim = aimAt(r);
        txt('.gps-here-center', 'Target → center: ' + (aim ? G.shownDistance(G.haversineMeters(S.target, aim), u) : '—'));
        var pl = playsTo(S.target);
        txt('.gps-to-plays', pl ? 'plays ~' + (u === 'm' ? Math.round(pl.exact * G.M_PER_YD) : pl.yards) : '');
    }
    function drawTarget() {
        if (!S || !S.map || !S.styleReady) return;
        drawTargetLines();
        var want = !!S.target && S.mode === 'measure';
        if (!want) { if (S.targetMarker) { S.targetMarker.remove(); S.targetMarker = null; } return; }
        if (!S.targetMarker) {
            var el = document.createElement('div');
            el.className = 'gps-target';
            el.innerHTML = '<span class="gps-ring"></span><span class="gps-ring-in"></span><span class="gps-ring-line"></span><span class="gps-ring-dot"></span><span class="gps-ring-lbl"></span>';
            var m = new (ML().Marker)({ element: el, draggable: true, anchor: 'center' }).setLngLat(ll(S.target)).addTo(S.map);
            m.on('dragstart', function () { if (!S) return; S.dragging = true; S.targetMoved = true; });
            m.on('drag', function () {
                if (!S) return;
                var p = m.getLngLat();
                S.target = [p.lat, p.lng];
                drawTargetLines();
                targetReadout();
                // The width line turns with the shot line, and stays a true 20 yds.
                sizeTarget();
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
        // BUILD 5 TARGET: two thin rings, tight together (the outer one IS the 20 yd
        // circle, the inner one ~4 px inside it), and ONE line straight across,
        // edge to edge, square to the shot line - the 20 yd width. "20 yd" sits at
        // one end of it, in the hole view and the Green view alike.
        var inner = el.querySelector('.gps-ring-in'), di = d - 2 * (4 + 2);
        if (inner) { inner.style.display = di >= 8 ? '' : 'none'; inner.style.width = di + 'px'; inner.style.height = di + 'px'; }
        var ang = 0;                  // the width line's angle on screen, degrees
        try {
            var o = origin(resolved());
            if (o && o.pt) {
                var a = S.map.project(ll(o.pt)), b = S.map.project(ll(S.target));
                if (Math.hypot(b.x - a.x, b.y - a.y) > 2) ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90;
            }
        } catch (e) {}
        ang = ((ang % 180) + 180) % 180;  // a line has no direction: 0..180
        if (ang > 90) ang -= 180;          // -90..90, so its "right" end is the one to the right
        var line = el.querySelector('.gps-ring-line');
        if (line) { line.style.width = d + 'px'; line.style.transform = 'translate(-50%,-50%) rotate(' + ang.toFixed(1) + 'deg)'; }
        el.setAttribute('data-line-deg', ang.toFixed(1));
        var lbl = el.querySelector('.gps-ring-lbl');
        if (lbl) {
            lbl.style.display = '';
            var w = units() === 'm' ? Math.round(2 * TARGET_RADIUS_YD * G.M_PER_YD) + ' m' : (2 * TARGET_RADIUS_YD) + ' yd';
            if (lbl.textContent !== w) lbl.textContent = w;
            var lw = lbl.offsetWidth || 36, lh = lbl.offsetHeight || 14;
            var ux = Math.cos(ang * Math.PI / 180), uy = Math.sin(ang * Math.PI / 180);
            // At the right-hand end of the line; near the right edge of the screen, the left-hand end.
            var mr = el.getBoundingClientRect(), wr = S.el.getBoundingClientRect(), sgn = 1;
            var reach = d / 2 + 4 + Math.abs(ux) * lw / 2 + Math.abs(uy) * lh / 2;
            if (mr.width && mr.left + box / 2 + ux * reach + lw / 2 > wr.right - 8) sgn = -1;
            var cx = box / 2 + sgn * ux * reach, cy = box / 2 + sgn * uy * reach;
            lbl.style.left = Math.round(cx - lw / 2) + 'px'; lbl.style.top = Math.round(cy - lh / 2) + 'px';
            lbl.style.transform = 'none';
            lbl.setAttribute('data-end', sgn > 0 ? 'right' : 'left');
        }
    }

    // ---- GREEN VIEW (Wave 2 follow-up, 2026-10-08) ---------------------------------
    // "Green" zooms to the green alone, in the hole's own turn (tee -> green still
    // points up): its outline, F / C / B and today's pin, each labelled with the
    // distance from the golfer (or the tee, off the hole), and the green's DEPTH
    // (along the line of play) and WIDTH (across it) in yards. Edit Pin works here
    // like anywhere. "Hole" (the same button) goes back to the hole's view.
    // Depth and width are measured on the outline turned to the line of play; a
    // green tapped without an outline has a depth only when its front and back were.
    function greenShape(r) {
        if (!r || !r.mid) return null;
        var axis = r.tee ? G.bearingDeg(r.tee, r.mid) : (S.camera ? S.camera.bearing : 0);
        var outline = !!(r.green && r.green.length >= 3 && r.useGreenForEdges);
        var pts = outline ? r.green : [r.front, r.mid, r.back].filter(Boolean);
        var al = [], ac = [];
        pts.forEach(function (p) {
            var d = G.haversineMeters(r.mid, p);
            var t = d ? (G.bearingDeg(r.mid, p) - axis) * Math.PI / 180 : 0;
            al.push(d * Math.cos(t)); ac.push(d * Math.sin(t));
        });
        var a0 = Math.min.apply(null, al), a1 = Math.max.apply(null, al), c0 = Math.min.apply(null, ac), c1 = Math.max.apply(null, ac);
        var depthM = (outline || (r.front && r.back)) ? a1 - a0 : null;
        var widthM = outline ? c1 - c0 : null;
        return {
            axis: axis, depthM: depthM, widthM: widthM,
            // What the view must hold: the green, or 25 m when it is only a point.
            spanA: Math.max(a1 - a0, 25), spanC: Math.max(c1 - c0, 25),
            center: G.destination(G.destination(r.mid, axis, (a0 + a1) / 2), axis + 90, (c0 + c1) / 2)
        };
    }
    var GREEN_PAD = { left: 80, right: 80 };
    function frameGreen() {
        if (!S || !S.map || !S.styleReady) return false;
        var g = greenShape(resolved());
        var box = S.el.querySelector('.gps-map');
        if (!g || !box || box.clientWidth < 10) return false;
        var vp = viewPad();
        var pad = { top: vp.top, bottom: vp.bottom, left: GREEN_PAD.left, right: GREEN_PAD.right };
        var availH = Math.max(60, box.clientHeight - pad.top - pad.bottom), availW = Math.max(60, box.clientWidth - pad.left - pad.right);
        var mpp = Math.max(g.spanA * 1.15 / availH, g.spanC * 1.15 / availW);
        var zoom = Math.min(Math.log2(40075016.686 * Math.cos(g.center[0] * Math.PI / 180) / (512 * mpp)), maxZoomNow());
        // The SAME turn as the hole view: tee -> green points up.
        var bearing = S.camera ? S.camera.bearing : g.axis;
        S.map.jumpTo({ center: ll(g.center), zoom: zoom, bearing: bearing, padding: pad });
        S.view = 'green'; S.zoomStep = 0; S.userMoved = false;
        render();
        reportMapState();
        return true;
    }
    function toggleGreenView() {
        if (!S) return;
        if (S.view === 'green') { frameHole(false); render(); }
        else frameGreen();
    }
    // The labels beside F, C, B and the pin, and the depth x width line.
    function placeGreenLabels() {
        var box = S && S.el.querySelector('.gps-green-lbls'), dims = S && S.el.querySelector('.gps-green-dims');
        if (!box || !dims) return;
        var on = !!(S.map && S.styleReady && S.view === 'green' && S.side === 'gps' && S.mode === 'measure');
        box.style.display = on ? '' : 'none';
        dims.style.display = 'none';
        if (!on) return;
        var r = resolved(), o = origin(r), u = units();
        var nums = r ? G.holeNumbers(o ? o.pt : null, r) : null;
        var d = function (m) { return m == null ? '—' : G.shownDistance(m, u); };
        var items = [
            { k: 'b', pt: nums && nums.back, text: 'B ' + d(nums && nums.backM) },
            { k: 'c', pt: r && r.mid, text: 'C ' + d(o && r && r.mid ? G.haversineMeters(o.pt, r.mid) : null) },
            { k: 'f', pt: nums && nums.front, text: 'F ' + d(nums && nums.frontM) }
        ];
        var placed = [];
        items.forEach(function (it) {
            var el = box.querySelector('.gps-green-lbl-' + it.k);
            if (!el) { el = document.createElement('span'); el.className = 'gps-green-lbl gps-green-lbl-' + it.k; box.appendChild(el); }
            if (!it.pt) { el.style.display = 'none'; return; }
            el.textContent = it.text; el.style.display = ''; el.style.visibility = 'hidden';
            var q = S.map.project(ll(it.pt)), w = el.offsetWidth, h = el.offsetHeight;
            var x = q.x + 16, y = q.y - h / 2;
            placed.forEach(function (b) { if (x < b.r && x + w > b.l && y < b.b && y + h > b.t) y = b.b + 2; });
            el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px'; el.style.visibility = '';
            placed.push({ l: x, t: y, r: x + w, b: y + h });
        });
        var g = greenShape(r);
        if (g && g.depthM != null) {
            var yd = function (m) { return u === 'm' ? Math.round(m) + ' m' : Math.round(m / G.M_PER_YD) + ' yds'; };
            dims.textContent = 'Green ' + yd(g.depthM) + ' deep' + (g.widthM != null ? ' · ' + yd(g.widthM) + ' wide' : '');
            dims.style.display = '';
            var mel = S.el.querySelector('.gps-map');
            if (mel) mel.setAttribute('data-green-dims', Math.round(g.depthM / G.M_PER_YD) + 'x' + (g.widthM != null ? Math.round(g.widthM / G.M_PER_YD) : ''));
        }
    }

    // ---- ZOOM: the magnifier (build 5): hole view -> 2x -> hole view -----------
    // Was 1x / 2x / 3x. One tap = 2x around the target; the next tap = back to the
    // hole's own view. Pinch zoom handles anything closer.
    // Around the target (or the golfer's dot when there is no target), keeping the
    // hole's tee-to-green turn. 1x is the hole's own view; Recenter goes back to it.
    // Never past the imagery's closest zoom (maxZoomNow).
    var ZOOM_STEPS = [1, 2];
    var MAG_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">'
        + '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/><path d="M7.5 10.5h6"/><path class="gps-mag-plus" d="M10.5 7.5v6"/></svg>';
    function syncZoomBtn() {
        var b = S && S.el.querySelector('.gps-zoom');
        if (!b) return;
        var zoomed = !!S.zoomStep;
        if (!b.querySelector('svg')) b.innerHTML = MAG_SVG;
        b.classList.toggle('gps-zoomed', zoomed);
        b.setAttribute('data-zoom', ZOOM_STEPS[S.zoomStep || 0] + 'x');
        b.setAttribute('aria-pressed', zoomed ? 'true' : 'false');
        b.setAttribute('aria-label', zoomed ? 'Back to the hole view' : 'Zoom in 2x around the target');
    }
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
        syncZoomBtn();
        sizeTarget(); placePills(); reportMapState();
    }

    // ---- DISTANCES ON THE LINES -----------------------------------------------
    // Small dark pills on the yellow line (tee or golfer -> target) and the white
    // line (target -> green center), like 18Birdies. A pill never covers the
    // target, its ring label, the green, a pin, the dot or a control: it slides
    // along its line (and off to either side of it) to the first clear spot, and
    // hides when there is none. The same numbers stay under FRONT / CENTER / BACK.
    // ---- HOLE FLYOVER / PREVIEW (008, switch flyover) ---------------------------------
    // "Preview": the camera flies the hole from the tee to the green along the hole's own
    // line (gps-geo.flyoverFrame) in about 4 s, tilted, with "Hole 5 · Par 4 · 385 yds"
    // over it, then comes back to the normal hole view. Drawn by MapLibre - no video. Any
    // touch stops it (back to the hole view). prefers-reduced-motion: no flight - the
    // whole hole framed at once, the same words, then the normal view.
    var FLY_MS = 4000, FLY_STILL_MS = 2500, FLY_PITCH = 50;
    function flySwitch() { try { return typeof window.HardPanFeature !== 'function' || window.HardPanFeature('flyover') !== false; } catch (e) { return true; } }
    function reducedMotion() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
    function flyLine(r) {
        var osm = osmRecord(S.courseKey), rec = osm && osm.holes && osm.holes[String(S.hole)] && osm.holes[String(S.hole)].osm;
        var line = rec && rec.line && rec.line.length >= 2 ? rec.line.slice() : [r.tee, r.mid];
        line[0] = r.tee; line[line.length - 1] = r.mid;   // a set green is where the flight ends
        return line;
    }
    function flyCaption(r) {
        var m = (typeof S.holeMeta === 'function' ? S.holeMeta(S.hole) : null) || {}, u = units();
        var par = m.par != null ? m.par : S.par;
        var len = m.yards ? (u === 'm' ? Math.round(m.yards * G.M_PER_YD) : m.yards) : G.shownDistance(G.haversineMeters(r.tee, r.mid), u);
        return 'Hole ' + S.hole + (par != null ? ' \u00b7 Par ' + par : '') + ' \u00b7 ' + len + (u === 'm' ? ' m' : ' yds');
    }
    function flyMark(state) { var el = S && S.el.querySelector('.gps-map'); if (el) el.setAttribute('data-fly', state); }
    function startFlyover() {
        if (!S || !S.map || !S.styleReady || S.flying || !G.flyoverFrame) return;
        var r = resolved();
        if (!r || !r.tee || !r.mid) { flash('Preview needs this hole\u2019s tee and green'); return; }
        closeMenus();
        var cap = S.el.querySelector('.gps-fly-cap');
        if (cap) { cap.textContent = flyCaption(r); cap.style.display = ''; }
        var mine = S, map = S.map, el = S.el.querySelector('.gps-map');
        if (reducedMotion()) {
            // STILL: the whole hole, at once.
            S.flying = { still: true };
            frameHole(false);
            flyMark('still');
            S.flying.timer = setTimeout(function () { if (S === mine) endFlyover('done'); }, FLY_STILL_MS);
            render();
            return;
        }
        var cam = holeView();
        if (!cam) return;
        var line = flyLine(r), maxZ = maxZoomNow();
        var z0 = Math.min(maxZ, cam.zoom + 1.4), z1 = Math.min(maxZ, cam.zoom + 2.1);
        try { map.setMaxPitch(FLY_PITCH); } catch (e) {}
        S.flying = { t0: Date.now(), frames: 0 };
        flyMark('flying');
        var step = function () {
            if (S !== mine || !S.flying || S.flying.still) return;
            var t = Math.min(1, (Date.now() - S.flying.t0) / FLY_MS);
            var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // ease in and out
            var fr = G.flyoverFrame(line, e);
            if (fr) {
                try { map.jumpTo({ center: ll(fr.pt), bearing: fr.bearing, zoom: z0 + (z1 - z0) * e, pitch: FLY_PITCH * Math.min(1, t / 0.15), padding: { top: 0, bottom: 0, left: 0, right: 0 } }); } catch (x) {}
                S.flying.frames++;
                if (el) { el.setAttribute('data-fly-at', fr.pt[0].toFixed(6) + ',' + fr.pt[1].toFixed(6)); el.setAttribute('data-fly-frames', String(S.flying.frames)); el.setAttribute('data-fly-pitch', String(Math.round(map.getPitch()))); }
            }
            if (t >= 1) { endFlyover('done'); return; }
            S.flying.raf = requestAnimationFrame(step);
        };
        S.flying.raf = requestAnimationFrame(step);
        render();
    }
    // Back to the normal hole view, flat; why: 'done' | 'cancelled'.
    function endFlyover(why) {
        if (!S || !S.flying) return;
        var f = S.flying;
        S.flying = null;
        if (f.raf) cancelAnimationFrame(f.raf);
        clearTimeout(f.timer);
        var cap = S.el.querySelector('.gps-fly-cap');
        if (cap) cap.style.display = 'none';
        if (S.map) {
            try { S.map.jumpTo({ pitch: 0 }); S.map.setMaxPitch(0); } catch (e) {}
            frameHole(false);
            var el = S.el.querySelector('.gps-map');
            if (el) el.setAttribute('data-fly-pitch', String(Math.round(S.map.getPitch())));
        }
        flyMark(why === 'cancelled' ? 'cancelled' : 'done');
        render();
    }
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
        if (!S.map || !S.styleReady || !S.target || S.mode !== 'measure' || S.side !== 'gps') { placeGreenLabels(); return; }
        var r = resolved(), o = origin(r), u = units();
        var wrap = S.el.querySelector('.gps-map-wrap'), wrapR = wrap.getBoundingClientRect();
        var W = wrapR.width, H = wrapR.height;
        var P = function (pt) { var q = S.map.project(ll(pt)); return { x: q.x, y: q.y }; };
        var M = 4, obstacles = [];
        var add = function (rc, m) { if (rc) obstacles.push({ l: rc.l - m, t: rc.t - m, r: rc.r + m, b: rc.b + m }); };
        var tEl = S.targetMarker && S.targetMarker.getElement();
        // BUILD 5: the numbers HUG the circle, so the obstacle is the ring itself
        // (plus a few px), not the marker's larger touch box.
        var t = P(S.target), R = Math.max(3, Number(tEl && tEl.getAttribute('data-ring-px')) / 2 || 10);
        var GAP = 4;
        add({ l: t.x - R, t: t.y - R, r: t.x + R, b: t.y + R }, GAP);
        // The "20 yd" label is an obstacle - but the numbers matter more: if a
        // number finds no room, the label steps aside (below) and the number takes it.
        var lblEl = tEl && tEl.querySelector('.gps-ring-lbl');
        if (lblEl && lblEl.style.visibility === 'hidden') lblEl.style.visibility = '';
        var lblRect = rectOf(lblEl, wrapR), lblObs = null;
        if (lblRect) { add(lblRect, M); lblObs = obstacles[obstacles.length - 1]; }
        Object.keys(S.markers || {}).forEach(function (k) { add(rectOf(S.markers[k].getElement(), wrapR), M); });
        ['.gps-top', '.gps-sub', '.gps-green-dims', '.gps-msg', '.gps-verify', '.gps-right', '.gps-leftrow .gps-recenter', '.gps-target-row', '.gps-banner', '.gps-bottom', '.gps-actions', '.gps-credit'].forEach(function (sel) { add(rectOf(S.el.querySelector(sel), wrapR), M); });
        // F / C / B and their number pills (Green view) are placed FIRST, so the two
        // distances can stay clear of them.
        placeGreenLabels();
        Array.prototype.forEach.call(S.el.querySelectorAll('.gps-green-lbl'), function (el) { if (el.style.display !== 'none') add(rectOf(el, wrapR), 2); });
        // Never under the status bar or the top panel, never over the bottom row.
        var topR = rectOf(S.el.querySelector('.gps-top'), wrapR), botR = rectOf(S.el.querySelector('.gps-bottom'), wrapR);
        var safeTop = Math.max(M, topR ? topR.b + M : 0);
        var safeBot = Math.min(H - M, botR ? botR.t - M : H);
        // The wind sheet (build 7) is a floor too while it is open.
        var wsR = rectOf(S.el.querySelector('.gps-wind-sheet'), wrapR);
        if (wsR) safeBot = Math.min(safeBot, wsR.t - M);
        // BUILD 7 (Manny's phone, zoom + Green view: "193" left of the circle, "19"
        // above it): each number sits ON ITS OWN LINE, as drawn - "to target" on the
        // you / tee -> circle line, "what's left" on the circle -> green-center line -
        // on the part of that line that is on screen. The middle first; where that is
        // covered, the number SHRINKS (44 -> 38 -> 32 px) before it slides along its
        // line. It never leaves its line: with no clear spot at all it still sits on
        // the line, at 32 px. (The "20 yd" label steps aside before that.)
        var ringM = TARGET_RADIUS_YD * G.M_PER_YD;
        var edgeOf = function (from, to) {
            if (!from || !to || G.haversineMeters(from, to) <= ringM * 1.05) return null;
            return G.destination(to, G.bearingDeg(to, from), ringM);
        };
        // The part of a-b inside the safe box (Liang-Barsky), or null.
        var clip = function (a, b) {
            var x0 = M, y0 = safeTop, x1 = W - M, y1 = safeBot, dx = b.x - a.x, dy = b.y - a.y, t0 = 0, t1 = 1;
            var pp = [-dx, dx, -dy, dy], qq = [a.x - x0, x1 - a.x, a.y - y0, y1 - a.y];
            for (var i = 0; i < 4; i++) {
                if (pp[i] === 0) { if (qq[i] < 0) return null; continue; }
                var rr = qq[i] / pp[i];
                if (pp[i] < 0) { if (rr > t1) return null; if (rr > t0) t0 = rr; }
                else { if (rr < t0) return null; if (rr < t1) t1 = rr; }
            }
            return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
        };
        var SIZES = [44, 38, 32], TS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.12, 0.88];
        var put = function (pill, a, b, text) {
            if (text === '—' || !a || !b) return;
            var seg = clip(a, b);
            if (!seg) return;                       // its line is not on screen at all
            pill.textContent = text;
            pill.style.visibility = 'hidden'; pill.style.display = '';
            var at = function (tt) { return { x: seg[0].x + (seg[1].x - seg[0].x) * tt, y: seg[0].y + (seg[1].y - seg[0].y) * tt }; };
            var rectAt = function (c, w, h) { return { l: c.x - w / 2, t: c.y - h / 2, r: c.x + w / 2, b: c.y + h / 2 }; };
            var inBounds = function (rc) { return !(rc.l < M || rc.t < safeTop || rc.r > W - M || rc.b > safeBot); };
            var place = function (rc, sz, how) {
                pill.style.left = Math.round(rc.l) + 'px'; pill.style.top = Math.round(rc.t) + 'px';
                pill.style.visibility = '';
                pill.setAttribute('data-at', how); pill.setAttribute('data-size', String(sz));
                obstacles.push(rc);
            };
            for (var i = 0; i < TS.length; i++) {
                for (var j = 0; j < SIZES.length; j++) {
                    pill.style.fontSize = SIZES[j] + 'px';
                    var w = pill.offsetWidth, h = pill.offsetHeight, rc = rectAt(at(TS[i]), w, h);
                    if (!inBounds(rc)) continue;
                    if (obstacles.some(function (ob) { return hits(rc, ob); })) continue;
                    place(rc, SIZES[j], 'line');
                    return;
                }
            }
            // Still no room: the "20 yd" label gives way, once, and the number tries again.
            if (lblObs && obstacles.indexOf(lblObs) !== -1) {
                obstacles.splice(obstacles.indexOf(lblObs), 1);
                lblEl.style.visibility = 'hidden';
                return put(pill, a, b, text);
            }
            // ALWAYS SHOWN, ON ITS LINE: the middle of its visible part, at 32 px,
            // nudged along the line only to stay inside the screen.
            pill.style.fontSize = SIZES[SIZES.length - 1] + 'px';
            var w2 = pill.offsetWidth, h2 = pill.offsetHeight;
            for (var k = 0; k < TS.length; k++) {
                var rc2 = rectAt(at(TS[k]), w2, h2);
                if (inBounds(rc2)) { place(rc2, SIZES[SIZES.length - 1], 'line-crowded'); return; }
            }
            place(rectAt(at(0.5), w2, h2), SIZES[SIZES.length - 1], 'line-crowded');
        };
        var aim = aimAt(r);
        var onCenter = !!(aim && G.haversineMeters(S.target, aim) <= TARGET_RADIUS_YD * G.M_PER_YD);
        // What's left, on the circle -> green-center line (not on a par 3 / close-in
        // default: the target IS the center, and the single distance is enough).
        if (aim && !onCenter) {
            var eOn = edgeOf(aim, S.target);
            if (eOn) put(pOn, P(eOn), P(aim), G.shownDistance(G.haversineMeters(S.target, aim), u));
        }
        // To the target, on the you / tee -> circle line (the incoming line).
        if (o) {
            var eTo = edgeOf(o.pt, S.target);
            if (eTo) put(pTo, P(o.pt), P(eTo), G.shownDistance(G.haversineMeters(o.pt, S.target), u));
        }
        placeArcLabels(obstacles);
    }

    // ---- WIND (Wave 1; LIVE, ALWAYS ON in build 7) ------------------------------
    // The National Weather Service (api.weather.gov - free, no key, US only) for
    // the COURSE: a point from the bundled course data, to 3 decimals - never the
    // golfer's position (see PRIVACY above). LIVE WIND IS THE DEFAULT:
    //   1. /points/{course} -> the course's forecast grid and its observation
    //      stations (kept a week);
    //   2. the nearest station's LATEST OBSERVATION - the wind and gusts actually
    //      measured - when it is under 2 hours old;
    //   3. else the hourly forecast's first period (the backup).
    // Asked right away when GPS opens or the hole changes (unless the reading is
    // under a minute old) and again every 10 minutes while GPS is showing. The box
    // shows "12 g 20 mph" and "updated 4 min ago". Offline the last reading is
    // shown with its age up to an hour, then "Wind –". Outside the US (NWS says
    // 404 for the point) the box is not there at all.
    var WIND_FRESH_MS = 10 * 60 * 1000, WIND_SHOW_MS = 60 * 60 * 1000, NWS_POINT_MS = 7 * 24 * 3600 * 1000;
    var WIND_KICK_MS = 60 * 1000, OBS_MAX_AGE_MS = 2 * 3600 * 1000, WIND_TICK_MS = 60 * 1000;
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
    // ---- MANUAL WIND (build 3; THE DIAL and THIS HOLE ONLY in build 7) -----------
    // Tap the wind box: a sheet from the bottom with a dial - drag the arrow to
    // where the wind blows (up = toward the green), snapped to 5 degrees - and mph
    // (- / +, a 0-40 slider). Kept on this phone only, for THIS ROUND, every hole,
    // until "Use live wind" (Manny, 2026-10-13: it used to be this hole only).
    // Tomorrow is back on live wind. Stored as a compass direction, so it points
    // the right way on every hole.
    var MANUAL_WIND = 'hardpan_wind_manual_v2';
    var WIND_MAX_MPH = 40;
    function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
    function manualWind() {
        var m = lsGet(MANUAL_WIND);
        if (!m || m.day !== today() || typeof m.toDeg !== 'number' || typeof m.mph !== 'number') return null;
        if (!S || m.course !== S.courseKey) return null;
        // This round, every hole (a setting from before this change: its own hole only).
        if (m.round != null ? String(m.round) !== String(S.eventCode || '') : m.hole !== S.hole) return null;
        return m;
    }
    function clearManualWind() { try { localStorage.removeItem(MANUAL_WIND); } catch (x) {} }
    // The live reading while it may still be shown (up to an hour old), or null.
    function liveWind() {
        var live = lsGet(windKey());
        return live && Date.now() - live.at <= WIND_SHOW_MS ? live : null;
    }
    // The wind that drives the box and "plays ~": this hole's manual one, else the
    // live reading up to an hour old. null: none.
    function effectiveWind() {
        var live = liveWind(), m = manualWind();
        var tempF = live && typeof live.tempF === 'number' ? live.tempF : null;
        if (m) return { mph: m.mph, toDeg: m.toDeg, fromDeg: (m.toDeg + 180) % 360, tempF: tempF, manual: true };
        if (live && !live.none) return { mph: live.mph, gustMph: live.gustMph || null, toDeg: live.toDeg, fromDeg: live.fromDeg, tempF: tempF, at: live.at, src: live.src, obsAt: live.obsAt || null };
        return live ? { none: true, outside: !!live.outside, tempF: tempF } : null;
    }
    // The hole's direction: tee -> green (the hole view turns the map to it).
    function holeBearing() {
        var r = resolved();
        if (r && r.tee && r.mid) return G.bearingDeg(r.tee, r.mid);
        // No tee: the way the map is turned NOW (not the last hole's camera).
        return S.map && typeof S.map.getBearing === 'function' ? S.map.getBearing() : (S.camera ? S.camera.bearing : 0);
    }
    // Where a live reading came from, in words.
    function srcName(src) { return src === 'weatherkit' ? '\uF8FF Weather' : src === 'hourly' ? 'NWS forecast' : 'NWS'; }
    function clockText(t) { var d = new Date(t), h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM'); }
    function ageText(at) {
        var min = Math.floor(Math.max(0, Date.now() - at) / 60000);
        return min < 1 ? 'updated just now' : 'updated ' + min + ' min ago';
    }
    function windWords(mph, fromDeg) {
        return mph > 0 ? 'From ' + G.compassName(fromDeg) + ' · ' + mph + ' mph' : 'Calm · 0 mph';
    }
    function windSheet() { return S && S.el.querySelector('.gps-wind-sheet'); }
    function windSheetOpen() { var w = windSheet(); return !!(w && w.style.display !== 'none'); }
    function openWindSheet() {
        var sh = windSheet();
        if (!sh) return;
        draftFromShowing();
        syncWindSheet();
        sh.style.display = '';
        keepClearOfSheet();
        placePills();
    }
    // The dial opens on what is showing now: the manual wind, else the live one.
    function draftFromShowing() {
        var w = effectiveWind(), hb = holeBearing();
        S.windDraft = {
            rel: w && !w.none ? Math.round((((w.toDeg - hb) % 360 + 360) % 360) / 5) * 5 % 360 : 0,
            mph: w && !w.none ? Math.min(WIND_MAX_MPH, w.mph) : 0
        };
    }
    // THE SHEET NEVER COVERS THE TARGET OR THE NUMBERS: when the circle or the
    // green would sit under it, the map slides up (and back on Done).
    function keepClearOfSheet() {
        var sh = windSheet();
        if (!S.map || !sh) return;
        var wrapR = S.el.getBoundingClientRect(), top = sh.getBoundingClientRect().top - wrapR.top;
        var r = resolved(), pts = [];
        if (S.target) pts.push(S.target);
        if (r && r.mid) pts.push(r.mid);
        var low = -Infinity;
        pts.forEach(function (p) { try { low = Math.max(low, S.map.project(ll(p)).y); } catch (e) {} });
        var dy = Math.round(low - (top - 72));
        if (isFinite(dy) && dy > 0) { try { S.map.panBy([0, dy], { animate: false }); S.windPan = (S.windPan || 0) + dy; } catch (e) {} }
    }
    function closeWindSheet() {
        var sh = windSheet();
        if (!sh || sh.style.display === 'none') return;
        sh.style.display = 'none';
        if (S.windPan && S.map) { try { S.map.panBy([0, -S.windPan], { animate: false }); } catch (e) {} }
        S.windPan = 0;
        placePills();
    }
    function syncWindSheet() {
        var sh = windSheet();
        if (!sh || !S.windDraft) return;
        var d = S.windDraft, m = manualWind(), live = effectiveWind();
        var arrow = sh.querySelector('.gps-dial-arrow');
        if (arrow) arrow.style.transform = 'rotate(' + d.rel + 'deg)';
        var dial = sh.querySelector('.gps-dial');
        var toDeg = Math.round((holeBearing() + d.rel) % 360), fromDeg = (toDeg + 180) % 360;
        if (dial) { dial.setAttribute('data-rel', String(d.rel)); dial.setAttribute('aria-valuenow', String(d.rel)); dial.setAttribute('aria-valuetext', windWords(d.mph, fromDeg)); }
        var read = sh.querySelector('.gps-ws-read');
        if (read) read.textContent = windWords(d.mph, fromDeg) + (!m && live && live.gustMph ? ' · gusts ' + live.gustMph : '');
        var n = sh.querySelector('.gps-ws-mph');
        if (n) n.textContent = String(d.mph);
        var sl = sh.querySelector('.gps-ws-slider');
        if (sl && String(sl.value) !== String(d.mph)) sl.value = String(d.mph);
        var st = sh.querySelector('.gps-ws-state');
        if (st) st.textContent = m ? 'Manual · every hole this round' : (live && !live.none ? 'Live · ' + srcName(live.src) + ' · ' + ageText(live.at) + (live.obsAt ? ' (as of ' + clockText(live.obsAt) + ')' : '') : 'No live wind - set it here');
        // APPLE WEATHER'S ATTRIBUTION, whenever its data is shown (Apple's WeatherKit terms).
        var at = sh.querySelector('.gps-ws-attrib');
        if (at) at.style.display = !m && live && live.src === 'weatherkit' ? '' : 'none';
        var lb = sh.querySelector('.gps-ws-live');
        if (lb) lb.style.display = m ? '' : 'none';
    }
    function saveManualWind() {
        if (!S || !S.windDraft) return;
        lsSet(MANUAL_WIND, { day: today(), course: S.courseKey, round: String(S.eventCode || ''), hole: S.hole, mph: S.windDraft.mph, toDeg: Math.round((holeBearing() + S.windDraft.rel) % 360) });
        syncWind();
        syncWindSheet();
    }
    function setDraftMph(v) {
        S.windDraft.mph = Math.max(0, Math.min(WIND_MAX_MPH, Math.round(Number(v) || 0)));
        saveManualWind();
    }
    function windSheetClick(e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null;
        if (!b || !S || !S.windDraft) return;
        e.preventDefault();
        if (b.classList.contains('gps-ws-minus')) setDraftMph(S.windDraft.mph - 1);
        else if (b.classList.contains('gps-ws-plus')) setDraftMph(S.windDraft.mph + 1);
        else if (b.classList.contains('gps-ws-live')) { clearManualWind(); draftFromShowing(); syncWind(); syncWindSheet(); }
        else if (b.classList.contains('gps-ws-done')) closeWindSheet();
    }
    // DRAG THE ARROW: the finger's angle around the dial's center, 5-degree steps.
    function bindDial(sh) {
        var dial = sh.querySelector('.gps-dial');
        var sl = sh.querySelector('.gps-ws-slider');
        if (sl) sl.addEventListener('input', function () { if (S && S.windDraft) setDraftMph(sl.value); });
        if (!dial) return;
        var dragging = false;
        var at = function (e) {
            if (!S || !S.windDraft) return;
            var b = dial.getBoundingClientRect();
            var rel = G.dialDeg(b.left + b.width / 2, b.top + b.height / 2, e.clientX, e.clientY, 5);
            if (rel === S.windDraft.rel && manualWind()) return;
            S.windDraft.rel = rel;
            saveManualWind();
        };
        dial.addEventListener('pointerdown', function (e) {
            dragging = true;
            try { dial.setPointerCapture(e.pointerId); } catch (x) {}
            e.preventDefault();
            at(e);
        });
        dial.addEventListener('pointermove', function (e) { if (dragging) at(e); });
        var end = function () { dragging = false; };
        dial.addEventListener('pointerup', end);
        dial.addEventListener('pointercancel', end);
        dial.addEventListener('keydown', function (e) {
            if (!S || !S.windDraft) return;
            var k = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : 0;
            if (!k) return;
            e.preventDefault();
            S.windDraft.rel = ((S.windDraft.rel + k) % 360 + 360) % 360;
            saveManualWind();
        });
    }
    function fetchWind() {
        if (!S || S.windInFlight || typeof fetch !== 'function' || tournament()) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        var pt = coursePoint();
        if (!pt) return;
        var mine = S, key = windKey(), ptKey = 'hardpan_nws_point_v2_' + S.courseKey;
        var hdr = { headers: { Accept: 'application/geo+json' } };
        // NWS hands back absolute URLs; a stand-in base (the checks) keeps its own host.
        var local = function (u) { return nwsBase() !== 'https://api.weather.gov' ? String(u).replace(/^https:\/\/api\.weather\.gov/, nwsBase()) : String(u); };
        var get = function (u) {
            return fetch(local(u), hdr).then(function (r) {
                if (r.status === 404) { var e = new Error('nws 404'); e.notFound = true; throw e; }
                if (!r.ok) throw new Error('nws ' + r.status);
                return r.json();
            });
        };
        S.windInFlight = true;
        S.windAskedAt = Date.now();
        var done = function () { mine.windInFlight = false; };
        // APPLE WEATHERKIT FIRST, when it is switched on (gps-config weatherkit: true - it needs
        // the gpsWind function and Apple's key, both server-side). The course's own point; the
        // golfer's position never. Anything but a reading: NWS, exactly as before.
        var cfgW = (typeof window !== 'undefined' && window.HARDPAN_GPS_CONFIG) || {};
        // A failed WeatherKit ask is not repeated for 10 minutes (NWS answers meanwhile).
        if (cfgW.weatherkit && !(S.windWkOffUntil > Date.now()) && window.HardPanGpsLive && typeof window.HardPanGpsLive.wind === 'function') {
            window.HardPanGpsLive.wind(pt[0], pt[1]).then(function (r) {
                if (r && r.status === 'ok' && typeof r.mph === 'number') {
                    lsSet(key, { at: Date.now(), src: 'weatherkit', obsAt: r.asOf ? Date.parse(r.asOf) || null : null, mph: r.mph, gustMph: r.gustMph || null, toDeg: r.toDeg, fromDeg: r.fromDeg, tempF: typeof r.tempF === 'number' ? r.tempF : null });
                    done(); if (S === mine) syncWind();
                } else { mine.windWkOffUntil = Date.now() + WIND_FRESH_MS; done(); if (S === mine) fetchWind(); }
            }, function () { mine.windWkOffUntil = Date.now() + WIND_FRESH_MS; done(); if (S === mine) fetchWind(); });
            return;
        }
        var cached = lsGet(ptKey);
        if (cached && Date.now() - cached.at >= NWS_POINT_MS) cached = null;
        if (cached && cached.outside) {
            lsSet(key, { at: Date.now(), none: true, outside: true });
            done(); if (S === mine) syncWind();
            return;
        }
        var point = cached && cached.hourly ? Promise.resolve(cached)
            : get(nwsBase() + '/points/' + pt[0] + ',' + pt[1]).then(function (j) {
                var p = (j && j.properties) || {};
                if (!p.forecastHourly) throw new Error('no hourly');
                var c = { at: Date.now(), hourly: p.forecastHourly, stations: p.observationStations || null };
                lsSet(ptKey, c);
                return c;
            }, function (e) {
                // NWS answers 404 for a point outside the US: no wind for this course.
                if (e && e.notFound) lsSet(ptKey, { at: Date.now(), outside: true });
                throw e;
            });
        var hourlyReading = function (c) {
            return get(c.hourly).then(function (j) {
                var per = j && j.properties && j.properties.periods && j.properties.periods[0];
                var w = G.parseNwsWind(per), tf = G.parseNwsTempF(per);
                return w ? { at: Date.now(), src: 'hourly', mph: w.mph, gustMph: null, toDeg: w.toDeg, fromDeg: w.fromDeg, tempF: tf } : { at: Date.now(), none: true, tempF: tf };
            });
        };
        point.then(function (c) {
            // The nearest station (the first NWS lists), kept with the point.
            var station = c.station ? Promise.resolve(c.station) : !c.stations ? Promise.reject(new Error('no stations'))
                : get(c.stations).then(function (j) {
                    var f = j && j.features && j.features[0];
                    var id = f && (f.id || (f.properties && f.properties['@id']));
                    if (!id) throw new Error('no station');
                    c.station = id; lsSet(ptKey, c);
                    return id;
                });
            return station.then(function (id) { return get(id + '/observations/latest'); }).then(function (j) {
                var o = G.parseNwsObservation(j && j.properties);
                if (!o || (o.obsAt != null && Date.now() - o.obsAt > OBS_MAX_AGE_MS)) throw new Error('no fresh observation');
                return { at: Date.now(), src: 'obs', obsAt: o.obsAt, mph: o.mph, gustMph: o.gustMph, toDeg: o.toDeg, fromDeg: o.fromDeg, tempF: o.tempF };
            }).then(null, function () { return hourlyReading(c); });
        }).then(function (rec) {
            lsSet(key, rec);
            done();
            if (S === mine) syncWind();
        }).catch(function (e) {
            if (e && e.notFound) lsSet(key, { at: Date.now(), none: true, outside: true });
            done();
            if (S === mine) { S.windFailedAt = Date.now(); syncWind(); }
        });
    }
    // Every minute WHILE GPS IS SHOWING: the age on the box ticks, and a reading
    // 10 minutes old is asked for again. Started by showSide('gps'), stopped on
    // Bets and on unmount. unref() where there is one (Node): a page run inside a
    // test's vm must never be kept alive by it.
    function startWindTick() {
        stopWindTick();
        windTimer = setInterval(function () { if (S && S.side === 'gps') syncWind(); else stopWindTick(); }, WIND_TICK_MS);
        if (windTimer && typeof windTimer.unref === 'function') windTimer.unref();
    }
    function stopWindTick() { if (windTimer) { clearInterval(windTimer); windTimer = null; } }
    function syncWind() {
        if (!S) return;
        var box = S.el.querySelector('.gps-wind');
        if (!box) return;
        // No GPS Map: no wind, and no request for it. Tournament mode: the same.
        if (!S.pro || tournament()) { box.style.display = 'none'; closeWindSheet(); syncPlays(); return; }
        syncPlays();
        var w = lsGet(windKey()), now = Date.now();
        // Right away on opening GPS or a new hole (S.windKick), else every 10 minutes;
        // not more than once a minute after a failure.
        var want = S.windKick ? WIND_KICK_MS : WIND_FRESH_MS;
        var stale = !w || now - w.at > want;
        if (S.side === 'gps' && stale && !(S.windFailedAt && now - S.windFailedAt < 60000)) { S.windKick = false; fetchWind(); }
        else if (S.side === 'gps') S.windKick = false;
        var ew = effectiveWind();
        // Outside the US: no wind box at all.
        if (ew && ew.outside) { box.style.display = 'none'; closeWindSheet(); return; }
        // The box is always there on the GPS side - tap it to set the wind. No
        // reading and nothing set (or the last one is over an hour old): "Wind –".
        box.style.display = S.side === 'gps' ? '' : 'none';
        box.classList.toggle('gps-wind-manual', !!(ew && ew.manual));
        var has = !!(ew && !ew.none);
        box.classList.toggle('gps-wind-empty', !has);
        box.classList.toggle('gps-wind-calm', has && ew.mph === 0);
        box.classList.toggle('gps-wind-tagged', has);
        if (!has) { txt('.gps-wind-mph', 'Wind –'); txt('.gps-wind-tag', ''); box.removeAttribute('data-rot'); box.setAttribute('aria-label', 'Wind: tap to set it'); return; }
        w = ew;
        txt('.gps-wind-mph', w.mph === 0 ? 'Calm' : w.mph + (w.gustMph ? ' g ' + w.gustMph : '') + ' mph');
        txt('.gps-wind-tag', w.manual ? 'Manual' : 'Live · ' + ageText(w.at).replace(/^updated /, ''));
        var arrow = box.querySelector('.gps-wind-arrow');
        // The arrow points where the wind BLOWS, relative to the HOLE (tee -> green
        // is straight up), which is how the map is turned in the hole's view.
        // THE MAP'S OWN BEARING, NOW (2026-10-11). S.camera is the last HOLE frame: a
        // hole with no tee jumps north-up to the golfer's dot without replacing it, so
        // the arrow was turned by the PREVIOUS hole's direction - 90 degrees off on an
        // east-west hole (Manny, Legacy). The map is the truth; the camera is history.
        var bearing = S.map && typeof S.map.getBearing === 'function' ? S.map.getBearing() : (S.camera ? S.camera.bearing : 0);
        var rot = G.windArrowRot(w.toDeg, bearing);
        // North-up (no tee -> green to turn by): the arrow is a COMPASS arrow; say so.
        var rr = resolved(), northUp = !(rr && rr.tee && rr.mid) && Math.abs(((bearing % 360) + 360) % 360) < 0.5;
        box.classList.toggle('gps-wind-northup', northUp);
        arrow.style.transform = 'rotate(' + rot + 'deg)';
        box.setAttribute('data-rot', String(rot));
        box.setAttribute('aria-label', 'Wind ' + (w.mph === 0 ? 'calm' : w.mph + ' mph' + (w.gustMph ? ' gusting ' + w.gustMph : '') + ' from ' + G.compassName(w.fromDeg)) + (w.manual ? ', set by you for this round' : ', live from ' + srcName(w.src) + ', ' + ageText(w.at)) + (northUp ? ', map north up' : '') + '. Tap to set it.');
        if (windSheetOpen()) syncWindSheet();
    }

    // ---- PLAYS LIKE (Wave 2) -----------------------------------------------------
    // "plays 158" under CENTER / PIN: gps-geo.playsLike on the slope, the wind and
    // the temperature. ELEVATION comes from the USGS Elevation Point Query Service
    // (free, no key, US only) for COURSE POINTS ONLY - the tee, 25 / 50 / 75 % of
    // the way to the green, the green's center and today's saved pin, each to 5
    // decimals - never the golfer's position (see PRIVACY above). The golfer's
    // height is worked out ON THE PHONE: their spot projected onto the tee ->
    // green line, between the two sampled points either side. Each point is asked
    // for once, ever (kept on the phone), one request at a time, only for the hole
    // on screen, while GPS is showing and there is signal. WIND and TEMPERATURE
    // are the wind box's own NWS reading (no other request), used up to an hour
    // old. No data for a term: that term is left out. No data at all, under 30
    // yds, on the green or outside the US: the line is quietly not there.
    var EPQS_URL = 'https://epqs.nationalmap.gov/v1/json?x={lng}&y={lat}&wkid=4326&units=Feet&includeDate=false';
    var ELEV_PREFIX = 'hardpan_elev_v1_';
    var PLAYS_MIN_YD = 30;
    var ELEV_T = [0, 0.25, 0.5, 0.75, 1];
    function epqsUrl(p) { return String(cfg().epqsUrl || EPQS_URL).replace('{lng}', String(p[1])).replace('{lat}', String(p[0])); }
    function r5(p) { return [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]; }
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    function elevKey(p) { var q = r5(p); return ELEV_PREFIX + q[0] + ',' + q[1]; }
    // Feet, or null: not asked yet, or the service had no height there.
    function elevAt(p) { var v = p ? lsGet(elevKey(p)) : null; return v && typeof v.ft === 'number' ? v.ft : null; }
    // The lower 48, Alaska, Hawaii: where USGS heights and NWS forecasts exist.
    function inUS(p) {
        if (!p) return false;
        var la = p[0], lo = p[1];
        return (la > 24.3 && la < 49.5 && lo > -125 && lo < -66.8) || (la > 51 && la < 71.6 && lo > -170 && lo < -129.9)
            || (la > 18.8 && la < 22.4 && lo > -160.5 && lo < -154.7);
    }
    // The course points for this hole: tee, three along the line, the green's center.
    function elevPoints(r) {
        if (!r || !r.tee || !r.mid) return [];
        var pts = ELEV_T.map(function (t) { return t === 0 ? r.tee : (t === 1 ? r.mid : lerp(r.tee, r.mid, t)); });
        return pts.map(r5);
    }
    function fetchElevs() {
        // HEIGHTS UP FRONT (gps-features): with elevOnTee: false nothing is asked for
        // hole by hole on the tee - the whole course's heights come once, at setup,
        // with a download, or when the round opens with signal (prefetchCourseElevs).
        if (cfg().elevOnTee === false) return;
        if (tournament()) return;   // tournament mode: no slope / elevation at all
        if (!S || !S.pro || S.side !== 'gps' || S.elevInFlight || typeof fetch !== 'function') return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        if (S.elevFailedAt && Date.now() - S.elevFailedAt < 60000) return;
        var pts = elevPoints(resolved());
        if (!pts.length || !inUS(pts[0])) return;
        var p = pts.filter(function (q) { return lsGet(elevKey(q)) == null; })[0];
        if (!p) return;
        var mine = S, k = elevKey(p);
        S.elevInFlight = true;
        fetch(epqsUrl(p), { mode: 'cors', credentials: 'omit' }).then(function (res) { if (!res.ok) throw new Error('epqs ' + res.status); return res.json(); }).then(function (j) {
            var v = j && j.value != null ? Number(j.value) : NaN;
            // -1000000 (or anything at or below -1000) is the service's "no data".
            lsSet(k, isFinite(v) && v > -1000 ? { ft: Math.round(v * 10) / 10 } : { none: 1 });
            mine.elevInFlight = false;
            if (S === mine) { syncPlays(); fetchElevs(); }
        }).catch(function () { mine.elevInFlight = false; mine.elevFailedAt = Date.now(); });
    }
    // The golfer's height: their spot projected onto the tee -> green line, between
    // the sampled points either side. From the tee: the tee's.
    function originElev(r, o) {
        // No tee (a green tapped on an unmapped hole): no line to sample, no slope.
        if (!r.tee || !r.mid) return null;
        if (o.from === 'tee') return elevAt(r.tee);
        return lineElev(r, o.pt);
    }
    // A point's height, from where it projects onto the tee -> green line.
    function lineElev(r, pt) {
        if (!r || !r.tee || !r.mid || !pt) return null;
        var t = Math.max(0, Math.min(1, G.alongLine(pt, [r.tee, r.mid]).t));
        for (var i = 1; i < ELEV_T.length; i++) {
            if (t <= ELEV_T[i]) {
                var a = elevAt(lerp(r.tee, r.mid, ELEV_T[i - 1])), b = elevAt(lerp(r.tee, r.mid, ELEV_T[i]));
                if (ELEV_T[i - 1] === 0) a = elevAt(r.tee);
                if (ELEV_T[i] === 1) b = elevAt(r.mid);
                if (a == null || b == null) return null;
                return a + (b - a) * (t - ELEV_T[i - 1]) / (ELEV_T[i] - ELEV_T[i - 1]);
            }
        }
        return null;
    }
    function playsNow() { return playsTo(null); }
    // To the aim (CENTER / PIN: target null), or to any point on the hole (the
    // target): its height from the tee -> green line, like the golfer's.
    function playsTo(targetPt) {
        if (tournament()) return null;
        if (!S || !S.pro || S.mode !== 'measure') return null;
        var r = resolved(), o = origin(r), aim = targetPt || aimAt(r);
        if (!r || !o || !aim || !inUS(aim)) return null;
        var nums = G.holeNumbers(o.pt, r);
        if (nums && nums.onGreen) return null;
        var D = G.haversineMeters(o.pt, aim) / G.M_PER_YD;
        if (D < PLAYS_MIN_YD) return null;
        // Today's manual wind (build 3) beats the live reading.
        var w = effectiveWind(), has = !!(w && !w.none);
        var to = targetPt ? lineElev(r, targetPt) : elevAt(r.mid);
        return G.playsLike({
            yards: D, elevFromFt: originElev(r, o), elevToFt: to,
            windMph: has ? w.mph : null, windFromDeg: has ? w.fromDeg : null,
            shotBearingDeg: G.bearingDeg(o.pt, aim), tempF: w && typeof w.tempF === 'number' ? w.tempF : null
        });
    }
    function syncPlays() {
        if (!S) return;
        var el = S.el.querySelector('.gps-plays');
        if (!el) return;
        fetchElevs();
        var pl = playsNow();
        // "plays ~158": an estimate, and it says so.
        var text = pl ? 'plays ~' + (units() === 'm' ? Math.round(pl.exact * G.M_PER_YD) : pl.yards) : '';
        if (el.textContent !== text) el.textContent = text;
        // Its line is kept either way, so the map does not jump when it appears.
        el.style.visibility = pl ? '' : 'hidden';
        el.setAttribute('data-terms', pl ? Object.keys(pl.terms).join(' ') : '');
    }

    // ---- THE PAYWALL AND THE GATE (paid launch: Manny, mailbox 007, 2026-10-17) ------
    // ALL of GPS is the "GPS Map" subscription: a 7-day free trial, then an
    // auto-renewing yearly subscription. Every part of GPS is paid - no map and no
    // yardage shows without an active trial or subscription. Games, scoring, bet
    // tracking, joining, the scorecard, the leaderboard and settle up never ask.
    //
    // THE GATE is requireGps(ctx, go, no): every way into GPS passes it - showSide
    // ('gps') (the 📍 GPS button, the card's GPS pill, "back to map", Resume onto
    // GPS, the landing) here, and the Home doors (front-door.js) before a GPS round
    // starts. Entitled: go() at once. The store's first answer still on its way
    // this launch: it waits for it (no GPS flashed then taken away, no paywall
    // flashed at a paying golfer). Not entitled: THE PAYWALL - its own sheet over
    // whatever screen the golfer is on (the card, Home), never over a map. A trial
    // started or a purchase restored: go(). "Not now": no() - the golfer stays on
    // the card / Home. ctx.quiet: no paywall, just no() (a programmatic return to
    // GPS, e.g. after Enter Score, is never a sales pitch).
    //
    // THE PAYWALL (App Store Guideline 3.1.2): the primary button "Start 7-day free
    // trial"; the store's own localized price per year - with the founding wording
    // while the founding window is open; the subscription's length; the trial and
    // when the Apple ID is charged; the auto-renew / cancel sentence; Restore
    // Purchases; the Terms of Use and Privacy Policy links; "Not now". Price text
    // comes ONLY from StoreKit - with none, it says the App Store shows the price
    // before the golfer confirms. And the course the golfer is opening, with how
    // many of its holes have GPS ("Caledonia: 18/18 ✓").
    var SHEET_SEEN = 'hardpan_gps_sheet_seen';
    var sheetSeenHere = false;
    var SHEET_OFF = "GPS Map isn\u2019t available in this build.";
    var RENEW = 'Renews automatically each year unless cancelled at least 24 hours before the end of the current period. Manage or cancel in Settings > Apple ID > Subscriptions.';
    var NO_PRICE = 'The App Store shows the price before you confirm.';
    var PENDING_MS = 8000;      // the longest the gate waits for the store's first answer
    var FOUNDING_MS = 2500;     // the longest the paywall waits for gps_meta/config
    var FOUNDING_CAP = 1000;    // gps-config.js foundingCap, else this
    var PW = null;              // the open paywall: { el, ctx, go, no, offer, founding, cov }
    function sheetSeen() {
        try { if (sessionStorage.getItem(SHEET_SEEN) === '1') return true; } catch (e) {}
        return sheetSeenHere;
    }
    // THE FOUNDING WINDOW: the server's gps_meta/config { foundingOpen, foundingCap }
    // (pure: the value read, or null). Absent or unreadable = OPEN - launch IS the
    // founding window, and the store shows the actual price either way.
    function foundingFrom(v) {
        var c = cfg(), cap = Number(c.foundingCap) > 0 ? Math.floor(Number(c.foundingCap)) : FOUNDING_CAP;
        var out = { open: true, cap: cap, src: 'default' };
        if (v && typeof v === 'object') {
            if (Number(v.foundingCap) > 0) { out.cap = Math.floor(Number(v.foundingCap)); out.src = 'server'; }
            if (typeof v.foundingOpen === 'boolean') { out.open = v.foundingOpen; out.src = 'server'; }
        }
        return out;
    }
    // Read once a session, best effort, never longer than FOUNDING_MS.
    var foundingRead = null;
    function founding(cb) {
        if (foundingRead) { cb(foundingRead); return; }
        var fin = false, t = null;
        var done = function (v) { if (fin) return; fin = true; clearTimeout(t); if (v && v.src === 'server') foundingRead = v; cb(v); };
        t = setTimeout(function () { done(foundingFrom(null)); }, FOUNDING_MS);
        try {
            var fb = window.firebase;
            // (before the page's initializeApp this throws - caught: the default)
            var d = fb && typeof fb.database === 'function' ? fb.database() : null;
            if (!d || typeof d.ref !== 'function') { done(foundingFrom(null)); return; }
            d.ref('gps_meta/config').once('value').then(function (snap) {
                done(foundingFrom(snap && typeof snap.val === 'function' ? snap.val() : null));
            }, function () { done(foundingFrom(null)); });
        } catch (e) { done(foundingFrom(null)); }
    }
    // "Caledonia: 18/18 ✓" - the course being opened and its holes with GPS (pure).
    function courseLine(name, n, of) {
        name = String(name || '').replace(/\s*\((?:[A-Z]{2})\b[^)]*\)\s*$/, '').trim();
        n = Number(n); of = Number(of);
        if (!name || !(of > 0) || !(n >= 0)) return '';
        if (n >= of) return name + ': ' + of + '/' + of + ' \u2713';
        if (n > 0) return name + ': ' + n + '/' + of + ' holes with GPS';
        return name + ': no holes with GPS yet';
    }
    // The paywall's words, from the store's offer (o), the founding window (f) and
    // the course (cov: { name, n, of }). Pure (gps_paywall_test.js).
    function sheetText(o, f, cov) {
        o = o || {};
        f = f || foundingFrom(null);
        var price = o.fromStore && o.price ? String(o.price) : '';
        // The store's product has no free introductory offer: no trial words at all.
        var hasTrial = !(o.fromStore && !o.trial);
        var trialLen = o.trial || '7-day';
        var cap = Number(f.cap) > 0 ? Number(f.cap) : FOUNDING_CAP;
        return {
            title: 'GPS Map',
            product: (o.fromStore && o.title) || 'HardPan GPS Map (yearly)',
            buy: hasTrial ? 'Start ' + trialLen + ' free trial' : 'Subscribe',
            founding: f.open ? 'Founding price \u00b7 locked while subscribed \u00b7 first ' + cap.toLocaleString('en-US') + ' subscribers' : '',
            price: price ? price + '/year' + (f.open ? ' founding price (locked while subscribed)' : '') : NO_PRICE,
            priceSrc: price ? 'store' : 'none',
            length: '1-year subscription, renews automatically.',
            trial: hasTrial ? trialLen + ' free trial, then ' + (price ? price + '/year' : 'the yearly price the App Store shows') + '. Your Apple ID is charged when the trial ends unless you cancel at least 24 hours before.' : '',
            renew: RENEW,
            course: cov ? courseLine(cov.name, cov.n, cov.of) : ''
        };
    }
    var PW_MARKUP = '<div class="gps-sheet" role="dialog" aria-modal="true" aria-label="GPS Map">'
        + '<div class="gps-sheet-card">'
        +   '<div class="gps-sheet-title">GPS Map</div>'
        +   '<div class="gps-sheet-course" style="display:none"></div>'
        +   '<ul class="gps-sheet-list"><li>Satellite hole map</li><li>Front, center and back yardages</li><li>Drag-the-target yardages</li><li>Wind and plays-like yardage</li></ul>'
        // iap off (a build with no store): one sentence, nothing to buy.
        +   '<div class="gps-sheet-off" style="display:none"></div>'
        // iap on: the App Store paywall and its disclosures (paintSheet fills them).
        +   '<div class="gps-sheet-iap" style="display:none">'
        +     '<button type="button" class="gps-sheet-buy">Start 7-day free trial</button>'
        +     '<div class="gps-sheet-founding" style="display:none"></div>'
        +     '<div class="gps-sheet-price" data-price-src="none"></div>'
        +     '<div class="gps-sheet-product gps-sheet-fine"></div>'
        +     '<div class="gps-sheet-length gps-sheet-fine"></div>'
        +     '<div class="gps-sheet-trial gps-sheet-fine"></div>'
        +     '<div class="gps-sheet-renew gps-sheet-fine"></div>'
        +     '<button type="button" class="gps-sheet-restore">Restore Purchases</button>'
        +     '<div class="gps-sheet-msg" role="status" aria-live="polite" style="display:none"></div>'
        +     '<div class="gps-sheet-links"><a class="gps-sheet-terms" target="_blank" rel="noopener">Terms of Use</a> \u00b7 <a class="gps-sheet-privacy" target="_blank" rel="noopener">Privacy Policy</a></div>'
        +   '</div>'
        +   '<button type="button" class="gps-sheet-close">Not now</button>'
        + '</div>'
        + '</div>';
    // Its own sheet over any page (the card, Home) - the GPS side's look.
    var PW_CSS = ''
        + '#gps-paywall{position:fixed;inset:0;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#f4f4ef;color-scheme:dark;}'
        + '#gps-paywall button{font:inherit;color:#f4f4ef;background:none;border:0;cursor:pointer;-webkit-appearance:none;appearance:none;padding:0 12px;}'
        + '#gps-paywall .gps-sheet{position:absolute;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;}'
        + '#gps-paywall .gps-sheet-card{width:100%;max-width:480px;max-height:100%;overflow-y:auto;box-sizing:border-box;background:#121a14;border:1px solid #3a4a3e;border-radius:18px 18px 0 0;'
        +   'padding:22px 20px calc(22px + env(safe-area-inset-bottom));}'
        + '#gps-paywall .gps-sheet-title{font-size:24px;font-weight:800;color:#d9f99d;}'
        + '#gps-paywall .gps-sheet-course{margin-top:6px;font-size:15px;font-weight:700;color:#f4f4ef;}'
        + '#gps-paywall .gps-sheet-list{margin:14px 0 14px;padding-left:20px;font-size:15px;line-height:1.6;color:#d1d5db;}'
        + '#gps-paywall .gps-sheet-founding{margin-top:12px;display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(217,249,157,.14);color:#d9f99d;font-size:12px;font-weight:800;}'
        + '#gps-paywall .gps-sheet-price{margin-top:8px;font-size:16px;font-weight:700;color:#f4f4ef;}'
        + '#gps-paywall .gps-sheet-off{margin:0 0 14px;font-size:15px;line-height:1.4;color:#f4f4ef;}'
        + '#gps-paywall .gps-sheet-fine{margin-top:6px;font-size:12px;line-height:1.4;color:#c8d1ca;}'
        + '#gps-paywall .gps-sheet-buy{display:block;width:100%;margin-top:4px;min-height:48px;background:#d9f99d;color:#0b0f0c;border-radius:12px;font-weight:800;font-size:16px;}'
        + '#gps-paywall .gps-sheet-buy:disabled,#gps-paywall .gps-sheet-restore:disabled{opacity:.55;}'
        + '#gps-paywall .gps-sheet-restore{display:block;width:100%;margin-top:12px;min-height:44px;border:1px solid #3a4a3e;border-radius:12px;color:#d9f99d;font-weight:700;}'
        + '#gps-paywall .gps-sheet-msg{margin-top:10px;font-size:14px;font-weight:700;line-height:1.4;color:#f4f4ef;}'
        + '#gps-paywall .gps-sheet-links{margin-top:12px;text-align:center;font-size:13px;color:#c8d1ca;}'
        + '#gps-paywall .gps-sheet-links a{color:#c8d1ca;text-decoration:underline;}'
        + '#gps-paywall .gps-sheet-close{display:block;width:100%;margin-top:10px;min-height:44px;border:1px solid #3a4a3e;border-radius:12px;}';
    function pq(sel) { return PW && PW.el ? PW.el.querySelector(sel) : null; }
    function ptxt(sel, v) { var e = pq(sel); if (e && e.textContent !== String(v)) e.textContent = String(v); }
    function pshow(sel, on) { var e = pq(sel); if (e) e.style.display = on ? '' : 'none'; }
    function sheetMsg(text) { ptxt('.gps-sheet-msg', text || ''); pshow('.gps-sheet-msg', !!text); }
    function paywallEl() {
        var el = document.getElementById('gps-paywall');
        if (el) return el;
        if (!document.getElementById('gps-paywall-css')) {
            var st = document.createElement('style');
            st.id = 'gps-paywall-css';
            st.textContent = PW_CSS;
            (document.head || document.documentElement).appendChild(st);
        }
        el = document.createElement('div');
        el.id = 'gps-paywall';
        el.style.display = 'none';
        el.innerHTML = PW_MARKUP;
        var tl = el.querySelector('.gps-sheet-terms'), pl = el.querySelector('.gps-sheet-privacy');
        if (tl) tl.setAttribute('href', String(cfg().iapTermsUrl || 'terms.html'));
        if (pl) pl.setAttribute('href', String(cfg().iapPrivacyUrl || 'privacy.html'));
        var tap = function (sel, fn) { var b = el.querySelector(sel); if (b) b.addEventListener('click', function (e) { e.preventDefault(); fn(); }); };
        tap('.gps-sheet-close', declinePaywall);
        tap('.gps-sheet-buy', function () { sheetAct('buy'); });
        tap('.gps-sheet-restore', function () { sheetAct('restore'); });
        (document.body || document.documentElement).appendChild(el);
        return el;
    }
    function paintSheet() {
        if (!PW) return;
        var on = iapOn();
        pshow('.gps-sheet-off', !on);
        ptxt('.gps-sheet-off', on ? '' : SHEET_OFF);
        pshow('.gps-sheet-iap', on);
        var t = sheetText(PW.offer, PW.founding, PW.cov);
        ptxt('.gps-sheet-title', t.title);
        ptxt('.gps-sheet-course', t.course);
        pshow('.gps-sheet-course', !!t.course);
        if (!on) return;
        ptxt('.gps-sheet-buy', t.buy);
        ptxt('.gps-sheet-founding', t.founding);
        pshow('.gps-sheet-founding', !!t.founding);
        ptxt('.gps-sheet-price', t.price);
        var pe = pq('.gps-sheet-price');
        if (pe) pe.setAttribute('data-price-src', t.priceSrc);
        ptxt('.gps-sheet-product', t.product);
        ptxt('.gps-sheet-length', t.length);
        ptxt('.gps-sheet-trial', t.trial);
        pshow('.gps-sheet-trial', !!t.trial);
        ptxt('.gps-sheet-renew', t.renew);
    }
    function openPaywall(ctx, go, no) {
        ctx = ctx || {};
        var el = paywallEl();
        var mine = PW = { el: el, ctx: ctx, go: go || null, no: no || null, offer: null, founding: foundingRead, cov: null };
        sheetSeenHere = true;
        try { sessionStorage.setItem(SHEET_SEEN, '1'); } catch (e) {}
        sheetBusy(false);
        sheetMsg('');
        paintSheet();
        el.style.display = '';
        var E = entitlement();
        if (iapOn() && E) E.offer(function (o) { if (PW === mine) { mine.offer = o; paintSheet(); } });
        founding(function (f) { if (PW === mine) { mine.founding = f; paintSheet(); } });
        if (typeof ctx.coverage === 'function') {
            try { ctx.coverage(function (c) { if (PW === mine && c && c.of > 0) { mine.cov = { name: c.name || ctx.course || '', n: c.n, of: c.of }; paintSheet(); } }); } catch (e) {}
        }
    }
    function paywallOpen() { var el = document.getElementById('gps-paywall'); return !!(PW && el && el.style.display !== 'none'); }
    // Closed by the store's yes (a trial started, a purchase restored): go().
    function closePaywall(said) {
        var p = PW;
        if (!p) return;
        PW = null;
        if (p.el) p.el.style.display = 'none';
        var fn = said === 'yes' ? p.go : said === 'no' ? p.no : null;
        if (typeof fn === 'function') { try { fn(); } catch (e) {} }
    }
    function declinePaywall() { closePaywall('no'); }
    // Start the trial / Restore: one at a time; the answer is one sentence, or GPS.
    function sheetBusy(on) {
        ['.gps-sheet-buy', '.gps-sheet-restore'].forEach(function (sel) { var b = pq(sel); if (b) b.disabled = !!on; });
    }
    function sheetAct(kind) {
        var E = entitlement();
        if (!PW || !E || !iapOn()) return;
        var mine = PW;
        sheetBusy(true);
        sheetMsg(kind === 'restore' ? 'Restoring\u2026' : '');
        E[kind === 'restore' ? 'restore' : 'purchase'](function (r) {
            if (PW !== mine) return;
            sheetBusy(false);
            if (r && r.pro && hasGpsPro()) { sheetMsg(''); closePaywall('yes'); becomePro(); return; }
            sheetMsg((r && r.message) || E.MSG.error);
        });
    }
    // THE GATE. go(): GPS may show. no(): it may not (declined, or ctx.quiet).
    function requireGps(ctx, go, no) {
        ctx = ctx || {};
        var yes = function () { if (typeof go === 'function') go(); };
        var nope = function () { if (typeof no === 'function') no(); };
        if (hasGpsPro()) { yes(); return true; }
        var decide = function () {
            if (hasGpsPro()) yes();
            else if (ctx.quiet) nope();
            else openPaywall(ctx, yes, nope);
        };
        // The store has not answered yet this launch: wait for it (PENDING_MS at most).
        if (proPending()) { entitlement().whenKnown(decide, PENDING_MS); return false; }
        decide();
        return false;
    }
    // THE ROUND'S COURSE on the paywall: its name, and its holes with GPS (the same
    // test the landing uses - holeHasData - over the card's holes).
    function roundCourseName() {
        var r = (S && S.round) || {};
        return String(r.courseName || '');
    }
    function roundCoverage(cb) {
        var mine = S;
        if (!S) { cb(null); return; }
        loadCourses(function () {
            if (S !== mine) { cb(null); return; }
            S.loadingCourses = false;
            var list = [];
            try { list = typeof S.holeList === 'function' ? (S.holeList() || []) : []; } catch (e) { list = []; }
            if (!list.length) list = ((S.round && S.round.courseData) || []).map(function (h) { return Number(h && h.hole); }).filter(function (n) { return n > 0; });
            if (!list.length) { cb(null); return; }
            var n = list.filter(function (h) { try { return holeHasData(h); } catch (e) { return false; } }).length;
            cb({ name: roundCourseName(), n: n, of: list.length });
        });
    }
    // THE STORE SAID YES (a trial started, a restore, or the launch read arriving
    // after this round was mounted without it): GPS unlocked, at once.
    function becomePro() {
        if (!S || S.pro || !hasGpsPro()) return;
        S.pro = true;
        S.el.classList.toggle('gps-locked', false);
        // Nothing was asked for while locked (no MapLibre): ask now, map and all.
        if (!S.map) S.mapRequested = false;
        if (S.side === 'gps') ensureMap();
        render();
    }
    (function () { var E = entitlement(); if (E && E.onChange) E.onChange(function (p) { if (p) becomePro(); }); })();

    // ---- NO PULL-DOWN ON GPS ----------------------------------------------------
    // A drag on the GPS side moves the map and nothing else: no page scroll, no
    // pull-to-refresh, no rubber-band bounce. CSS (overscroll-behavior / touch-
    // action) does most of it; iOS Safari also needs the page's touchmove refused
    // while GPS is showing. The map's own gestures are unaffected - MapLibre has
    // the event before it bubbles here. There is no left/right hole swipe on the
    // GPS side to keep (holes change with the arrows).
    // THE SIGNED-IN GOLFER'S SCORE on a hole: the card's own "who am I" (resolvedMeId), or the
    // only golfer of a one-golfer round. null when not entered.
    // WHOSE SCORE THE GPS SCREEN SHOWS (Manny, 2026-10-14): the golfer this phone picked ("who are
    // you"); else a scorekeeper's first golfer in their group; else player 1 - the organizer (Round
    // Setup's first row, "Me" on a GPS-door round), which is also what a spectator who picked no one
    // sees. Read only: nothing here writes.
    // THE GOLFER THE GPS SCREEN SHOWS (Manny, 2026-10-14): picked on this phone with the name tag
    // ("Manny ▾"), kept per round (hardpan_gps_golfer_<code>); else the golfer this phone said it
    // is; else a scorekeeper's first golfer; else player 1 (the organizer). Viewing only - entering
    // a score is still the card's own box for that golfer.
    function roundData() { try { return typeof currentData !== 'undefined' ? currentData : null; } catch (e) { return null; } }   /* global currentData, resolvedMeId, lockedGroup, playerGroupOf */
    function pickKey() { return 'hardpan_gps_golfer_' + String((S && S.eventCode) || ''); }
    function groupOf(id) { try { var g = typeof playerGroupOf === 'function' ? playerGroupOf(id) : null; return g == null ? 1 : Number(g) || 1; } catch (e) { return 1; } }
    function groupsOf(d) { var gs = []; (d.players || []).forEach(function (p) { var g = groupOf(p.id); if (gs.indexOf(g) === -1) gs.push(g); }); return gs.sort(function (a, b) { return a - b; }); }
    function inGroup(d, g) { return (d.players || []).filter(function (p) { return groupOf(p.id) === g; }); }
    function lockedG() { try { return typeof lockedGroup !== 'undefined' && lockedGroup ? Number(lockedGroup) : null; } catch (e) { return null; } }
    function picked(d) {
        var v = null; try { v = localStorage.getItem(pickKey()); } catch (e) { v = null; }
        // A GROUP'S SCOREKEEPER sees their group (audit): a pick from another group is not used.
        var lg = lockedG();
        return v != null && (d.players || []).some(function (p) { return String(p.id) === String(v) && (!lg || groupOf(p.id) === lg); }) ? v : null;
    }
    function scoreFor() {
        try {
            var d = roundData();
            if (!d || !d.players || !d.players.length) return null;
            var id = picked(d);
            if (id == null && typeof resolvedMeId === 'function') id = resolvedMeId();
            if (id == null && lockedG()) { var mine = inGroup(d, lockedG())[0]; if (mine) id = mine.id; }
            if (id == null) id = d.players[0].id;
            return { id: id, scores: d.scores || {}, player: d.players.filter(function (p) { return String(p.id) === String(id); })[0] || null };
        } catch (e) { return null; }
    }
    function shortName(d, p) {
        var parts = String((p && p.name) || '').trim().split(/\s+/), first = parts[0] || 'Golfer';
        var same = (d.players || []).filter(function (q) { return q !== p && String(q.name || '').trim().split(/\s+/)[0] === first; }).length;
        return same && parts[1] ? first + ' ' + parts[1].charAt(0) + '.' : first;
    }
    function setPick(id, dir) {
        try { localStorage.setItem(pickKey(), String(id)); } catch (e) {}
        if (dir && S) {
            var col = S.el.querySelector('.gps-score-col');
            if (col) { col.classList.remove('gps-slide-l', 'gps-slide-r'); void col.offsetWidth; col.classList.add(dir > 0 ? 'gps-slide-l' : 'gps-slide-r'); }
        }
        render();
    }
    // The sheet: groups (more than one), then that group's golfers. first = the "Who are you?" ask.
    function openWho(first, group) {
        var d = roundData(); if (!S || !d || !d.players) return;
        var sh = S.el.querySelector('.gps-who-sheet'), list = sh.querySelector('.gps-who-list'), skip = sh.querySelector('.gps-who-skip');
        var gs = groupsOf(d), cur = scoreFor();
        list.textContent = '';
        var title = first ? 'Who are you?' : 'Whose score?';
        if (group == null && gs.length > 1 && !lockedG()) {
            sh.querySelector('.gps-who-title').textContent = title + ' Your group:';
            gs.forEach(function (g) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-who-group', g); b.textContent = 'Group ' + g; if (cur && cur.player && groupOf(cur.player.id) === g) b.className = 'on'; list.appendChild(b); });
        } else {
            var g0 = group != null ? group : (lockedG() || (cur && cur.player ? groupOf(cur.player.id) : gs[0]));
            sh.querySelector('.gps-who-title').textContent = title + (gs.length > 1 ? ' Group ' + g0 : '');
            inGroup(d, g0).forEach(function (p) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-who-id', p.id); b.textContent = String(p.name || 'Golfer'); if (cur && String(cur.id) === String(p.id)) b.className = 'on'; list.appendChild(b); });
            sh.setAttribute('data-who-g', g0);
        }
        skip.style.display = first ? '' : 'none';
        sh.setAttribute('data-who-first', first ? '1' : '');
        sh.style.display = '';
    }
    function closeWho() { var sh = S && S.el.querySelector('.gps-who-sheet'); if (sh) sh.style.display = 'none'; }
    function whoAsked() { try { return localStorage.getItem('hardpan_gps_whoasked_' + String(S.eventCode || '')) === '1'; } catch (e) { return true; } }
    // FIRST OPEN, NO PICK: "Who are you?" once per round on this phone (the app; more than one golfer).
    function maybeAskWho() {
        var d = roundData();
        if (!S || S.side !== 'gps' || !doorsOn() || !d || !d.players || d.players.length < 2 || whoAsked()) return;
        if (picked(d) != null || (typeof resolvedMeId === 'function' && resolvedMeId() != null)) return;
        try { localStorage.setItem('hardpan_gps_whoasked_' + String(S.eventCode || ''), '1'); } catch (e) {}
        openWho(true);
    }
    // Swipe on the score: the next / previous golfer in the shown golfer's group.
    function flipGolfer(dir) {
        var d = roundData(), cur = scoreFor(); if (!d || !cur || !cur.player) return;
        var list = inGroup(d, groupOf(cur.player.id)); if (list.length < 2) return;
        var i = list.indexOf(cur.player), n = list[(i + dir + list.length) % list.length];
        setPick(n.id, dir);
    }
    function myScore(hole) {
        var w = scoreFor();
        if (!w) return null;
        var v = w.scores['p' + w.id + '_h' + hole];
        return v && Number(v) > 0 ? Number(v) : null;
    }
    function readOnlyHere() { try { return !!(window.HardPanDoors && typeof window.HardPanDoors.spectating === 'function' && window.HardPanDoors.spectating()); } catch (e) { return false; } }
    function blockPull(e) {
        // A sheet over the map scrolls (the Add a game list was stuck at Skins): only the map is held still.
        var t = e && e.target;
        if (t && t.closest && t.closest('#fd-addgame, .gps-scroll-ok')) return;
        if (S && S.side === 'gps' && e.cancelable) e.preventDefault();
    }

    // ---- TAPS ---------------------------------------------------------------
    function onMapTap(pt) {
        if (!S) return;
        var tm = S.el.querySelector('.gps-tools-menu');
        if (tm && tm.style.display !== 'none') { closeMenus(); return; }
        if (S.dragEndedAt && Date.now() - S.dragEndedAt < 350) return;
        if (S.mode === 'setMid') { S.draft = { mid: pt }; S.mode = 'confirmMid'; render(); return; }
        if (S.mode === 'setFront') { S.draft.front = pt; S.mode = 'setBack'; render(); return; }
        if (S.mode === 'setBack') { S.draft.back = pt; S.mode = 'confirmAll'; render(); return; }
        if (S.mode !== 'measure') return;
        // MOVING THE LAST SHOT ("Move it on the map" after a one-tap Mark shot).
        if (S.shotAdjust) { moveLastShot(pt); return; }
        // MARKING SHOTS: a tap is where the ball finished (gps-shots.js, this phone only).
        if (S.shotMode) { addShot(pt, 'tap'); return; }
        if (S.replay) return;
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

    // ZOOM, HALF WAY DOWN THE RIGHT EDGE - unless the right-hand stack (wind, Green, Mark shot)
    // reaches that far (a short phone): then just under it, never on top of it.
    function placeZoom() {
        var z = S && S.el && S.el.querySelector('.gps-zoom');
        var stack = S && S.el && S.el.querySelector('.gps-right');
        if (!z || !stack || typeof z.getBoundingClientRect !== 'function') return;
        var h = z.offsetHeight || 44, vh = window.innerHeight || 0, top = vh / 2 - h / 2, low = 0;
        Array.prototype.forEach.call(stack.children, function (c) { if (c.offsetParent !== null) { var b = c.getBoundingClientRect(); if (b.height) low = Math.max(low, b.bottom); } });
        if (low && top < low + 8) top = low + 8;
        var want = Math.round(top) + 'px';
        if (z.style.top !== want || z.style.transform !== 'none') { z.style.top = want; z.style.transform = 'none'; }
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
        txt('.gps-hole-num', S.hole);
        txt('.gps-meta', holeMetaLine(r));
        txt('.gps-units', 'Units: ' + (u === 'm' ? 'Meters' : 'Yards'));
        txt('.gps-f', nums ? (nums.onGreen ? 'ON' : d(nums.frontM)) : '—');
        var aim = aimAt(r);
        txt('.gps-m', (nums && aim && o) ? d(G.haversineMeters(o.pt, aim)) : '—');
        txt('.gps-b', nums ? d(nums.backM) : '—');

        dropStaleFix();
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
            // In Pro the line shows when GPS is WEAK (audit C4) - the one time a golfer must know.
            var subEl = S.el.querySelector('.gps-sub');
            if (subEl) subEl.classList.toggle('gps-sub-show', !!(acc && acc.weak && fix && !fromTee));
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
        // AN iPAD WITH NO GPS (mailbox 004: the listing supports iPad). A Wi-Fi iPad has no GPS chip:
        // iOS places it from Wi-Fi to hundreds of metres, or not at all on a course - one sentence
        // instead of wild yardages. A cellular iPad gets a real fix and never sees it.
        var ipadMsg = ipadNoGps(S.geoError, fix);
        if (ipadMsg) msg = ipadMsg;
        txt('.gps-msg', msg);
        show('.gps-msg', !!msg);

        // VERIFY ON COURSE: a green the import could not vouch for (OSM par differs
        // from our card, renumbered holes, greens rebuilt since they were mapped).
        // Shown while the green is still OSM's; gone once anyone sets or fixes it.
        var osmRec = osmRecord(S.courseKey);
        var note = (r && r.source === 'osm' && osmRec && osmRec.verify && osmRec.verify[String(S.hole)]) || '';
        txt('.gps-verify', note ? '⚠ Verify green: ' + note + (S.canFix && S.pro ? ' Use "Fix the green" if it is off.' : (S.pro ? ' The organizer can fix it.' : '')) : '');
        show('.gps-verify', !!note && S.mode === 'measure');

        placeTarget(r);
        targetReadout();
        syncSuggest(r, o, nums);

        // The green, set / fixed / undone.
        var noGreen = !r || !r.mid;
        var setting = S.mode !== 'measure';
        var gpsOk = canSetHere();
        var accYd = fix ? Math.round(fix.acc / G.M_PER_YD) : null;
        var away = yardsFromGreen();
        var waitGps = !fix ? 'Finding you…' : (!gpsGoodEnough() ? 'GPS ±' + accYd + ' yds - needs ±' + GREEN_GPS_YD + ' or better'
            : 'Walk to the green - ' + Math.round(away) + ' yds away');
        var banner = '';
        if (S.mode === 'gpsMid') banner = gpsOk ? 'Stand on the middle of the green' : waitGps;
        else if (S.mode === 'gpsFront') banner = gpsOk ? 'Stand on the FRONT edge (optional)' : waitGps;
        else if (S.mode === 'gpsBack') banner = gpsOk ? 'Stand on the BACK edge (optional)' : waitGps;
        else if (S.mode === 'setMid') banner = 'Tap the CENTER of the green';
        else if (S.mode === 'setFront') banner = 'Tap the FRONT edge (optional)';
        else if (S.mode === 'setBack') banner = 'Tap the BACK edge (optional)';
        else if (S.mode === 'confirmMid' || S.mode === 'confirmAll' || S.mode === 'gpsConfirmMid' || S.mode === 'gpsConfirmAll') banner = 'Save this green for hole ' + S.hole + '?';
        else if (S.flash) banner = S.flash;
        else if (S.loadingCourses) banner = 'Loading the course…';
        else if (S.holeAsk && S.holeAsk.length) banner = 'More than one course here - tap YOUR hole 1';
        // Never a dead end: it says what to do (anyone on the round can set it).
        else if (noGreen) banner = S.pro ? 'No green mapped for this hole yet - Tools \u203a Set the green' : 'No green mapped for this hole yet';
        txt('.gps-banner', banner);
        show('.gps-banner', !!banner);

        // Tools: set a green on an unmapped hole (anyone), fix one (the organizer).
        // No GPS Map: no map, so nothing to set.
        // A spectator writes nothing (audit 2026-10-16): no Set the green for a view-only phone.
        show('.gps-set-green', S.pro && !setting && noGreen && !S.loadingCourses && !readOnlyHere());
        show('.gps-fix-green', S.pro && !setting && !noGreen && !!S.canFix);
        // The organizer can change which course's holes a club's outline gave.
        var lk = lookedUp(S.courseKey);
        show('.gps-rechoose', !!S.canFix && !!(lk && lk.pick && lk.pick.candidates > 1));
        show('.gps-refresh-gps', !!S.canFix && S.pro && !setting);
        // THE SCORE BUTTON: the hole's own score entry, on the card (Bets side).
        // GREEN / HOLE: the green alone, or back to the whole hole.
        show('.gps-green-view', S.pro && !!S.map && !noGreen && S.mode === 'measure');
        txt('.gps-green-view', S.view === 'green' ? '⛳ Hole' : '⛳ Green');
        // TOURNAMENT: the badge for a playing partner or an official, and the Tools switch.
        var tq = tournament();
        show('.gps-tourney', tq);
        txt('.gps-tourney-toggle', tourneyRound() ? '\uD83C\uDFC6 Tournament mode: On (set by the organizer)' : (tq ? '\uD83C\uDFC6 Tournament mode: On' : '\uD83C\uDFC6 Tournament mode: Off'));
        var tt = S.el.querySelector('.gps-tourney-toggle'); if (tt) tt.setAttribute('aria-disabled', tourneyRound() ? 'true' : 'false');
        show('.gps-zoom', S.view !== 'green');
        // PREVIEW (008): the hole needs a tee and a green to fly.
        show('.gps-fly-btn', S.pro && !!S.map && S.mode === 'measure' && !S.replay && !S.flying && !!(r && r.tee && r.mid));
        // THE SCORE BUTTON (Manny, 2026-10-14): no score yet -> "Enter score"; scored -> just the
        // number, big. A spectator sees the number (or "No score yet") and cannot open the editor.
        var mine = myScore(S.hole), ro = readOnlyHere();
        // THE CARD'S OWN MARK ON THE NUMBER (Manny, 2026-10-16): score-marks.js - double circle eagle or
        // better, circle birdie, plain par, box bogey, double box double bogey or worse. Gross, display only.
        var sbtn = S.el.querySelector('.gps-score');
        if (sbtn) {
            var holePar = (typeof S.holeMeta === 'function' && (S.holeMeta(S.hole) || {}).par) || S.par;
            var mk = mine != null && typeof scoreMark === 'function' ? scoreMark(mine, holePar) : '';   /* global scoreMark */
            var want = mine != null ? 'n|' + mine + '|' + mk : 't|' + (ro ? 'No score yet' : 'Enter score');
            if (sbtn.getAttribute('data-shown') !== want) {
                sbtn.setAttribute('data-shown', want);
                sbtn.textContent = '';
                if (mine != null) {
                    var num = document.createElement('span');
                    num.className = 'gps-score-n' + (mk ? ' mark-' + mk : '');
                    num.textContent = String(mine);
                    sbtn.appendChild(num);
                } else sbtn.textContent = ro ? 'No score yet' : 'Enter score';
            }
        }
        var dd = roundData(), who = scoreFor(), many = !!(dd && dd.players && dd.players.length > 1);
        txt('.gps-who', many && who && who.player ? ((groupsOf(dd).length > 1 ? 'Group ' + groupOf(who.player.id) + ' \u00b7 ' : '') + shortName(dd, who.player) + ' \u25BE') : '');
        show('.gps-who', many && !setting);
        var sb = S.el.querySelector('.gps-score');
        if (sb) { sb.classList.toggle('gps-score-num', mine != null); sb.classList.toggle('gps-score-ro', ro); }
        var scoreOn = !setting && typeof S.openScore === 'function';
        show('.gps-score', scoreOn);
        // While a green is being set its buttons take the bottom; the bottom row,
        // Recenter and the target pill come back after.
        show('.gps-bottom', !setting);
        show('.gps-actions', setting);
        show('.gps-leftrow', !setting);
        // A banner sits above the Recenter row while measuring (an unmapped hole),
        // above the setting buttons while setting - however many rows they wrap to.
        S.el.classList.toggle('gps-banner-up', !setting && !!banner);
        S.el.classList.toggle('gps-pinning', setting);
        if (setting) closeMenus();
        var canUndo = S.pro && !setting && !!S.canFix && r && r.source === 'pin' && r.pin && !!G.undoPin(r.pin, 1);
        show('.gps-undo-green', !!canUndo);
        // BY GPS: "Set center / front / back" where you stand, only at ±5 yds or
        // better; the photo-tap way is a link to the USGS fallback.
        var gpsStep = S.mode === 'gpsMid' || S.mode === 'gpsFront' || S.mode === 'gpsBack';
        show('.gps-gps-set', gpsStep);
        txt('.gps-gps-set', S.mode === 'gpsFront' ? 'Set front' : (S.mode === 'gpsBack' ? 'Set back' : 'Set center'));
        var gb = S.el.querySelector('.gps-gps-set');
        if (gb) { gb.disabled = !gpsOk; gb.classList.toggle('gps-off', !gpsOk); }
        show('.gps-tap-fallback', S.mode === 'gpsMid');
        show('.gps-skip', S.mode === 'setFront' || S.mode === 'setBack' || S.mode === 'gpsFront' || S.mode === 'gpsBack');
        show('.gps-addedges', S.mode === 'confirmMid' || S.mode === 'gpsConfirmMid');
        show('.gps-save', S.mode === 'confirmMid' || S.mode === 'confirmAll' || S.mode === 'gpsConfirmMid' || S.mode === 'gpsConfirmAll');
        show('.gps-cancel', setting);
        txt('.gps-src', r && r.source === 'osm' ? 'Green from OpenStreetMap'
            : (r && r.source === 'pin' ? (r.pin.by === 'undo' ? 'Green restored by undo' : 'Green set by a golfer') : ''));

        // Measured once its buttons are set: the banner sits above them.
        if (setting) { var ab = S.el.querySelector('.gps-actions'); if (ab) S.el.style.setProperty('--gps-actions-h', ab.offsetHeight + 'px'); }

        syncImageryForMode();
        drawLayers();
        drawDot();
        drawTarget();
        drawHoleAsk();
        drawHazards();
        // HAZARDS SHEET (008): its button while measuring; open, it follows the golfer.
        show('.gps-hz-btn', S.pro && S.mode === 'measure' && !S.replay && courseHasAnyData());
        if (hzOpen()) { if (S.mode !== 'measure') closeHazards(); else fillHazards(); }
        drawShots();
        placeZoom();
        placePills();
        syncWind();
        maybeAskWho();
        aaTick();
    }
    // ---- SHOT BY SHOT (gps-features): mark, then replay - on this phone only ------
    function shotsApi() { return window.HardPanGpsShots || null; }
    function withShots(fn) { loadScript('gps-shots.js', function () { return !!shotsApi(); }, function () { if (S && shotsApi()) fn(shotsApi()); }); }
    // THE SHOT'S NUMBERS, at the moment it is marked: from the shot before (or the
    // tee) to here - yards, the slope (the hole line's heights, already on the phone),
    // the wind relative to THIS shot, and what it played like (gps-geo.playsLike: the
    // still-air, level distance that shot was worth). All on this phone.
    function shotDetails(prev, pt) {
        var r = resolved();
        var from = prev || (r && r.tee) || null;
        if (!from) return {};
        var yd = Math.round(G.haversineMeters(from, pt) / G.M_PER_YD);
        var brg = G.bearingDeg(from, pt);
        if (tournament()) return { yd: yd };
        var w = effectiveWind(), has = !!(w && !w.none);
        var e0 = r ? (prev ? lineElev(r, from) : elevAt(r.tee)) : null, e1 = r ? lineElev(r, pt) : null;
        var pl = G.playsLike({ yards: yd, elevFromFt: e0, elevToFt: e1, windMph: has ? w.mph : null, windFromDeg: has ? w.fromDeg : null,
            shotBearingDeg: brg, tempF: w && typeof w.tempF === 'number' ? w.tempF : null });
        var out = { yd: yd, plays: pl ? pl.yards : null, elevFt: e0 != null && e1 != null ? Math.round((e1 - e0) * 10) / 10 : null };
        if (has) out.wind = Object.assign({ mph: w.mph, fromDeg: w.fromDeg }, G.windRelative(w.fromDeg, brg, w.mph));
        return out;
    }
    function addShot(pt, how) {
        var A = shotsApi();
        if (!A || !S) return false;
        var list = A.shots(S.eventCode, S.hole);
        var prev = list.length ? list[list.length - 1].p : null;
        if (A.add(S.eventCode, S.hole, pt, how, shotDetails(prev, pt)) == null) { flash('That is ' + A.MAX_PER_HOLE + ' shots on this hole'); return false; }
        render();
        return true;
    }
    // MARK SHOT = A DISTANCE MEASURE, FOR NOW (Manny, 2026-10-13). Tap 1: this spot, "0 yds", and
    // the button counts the yards from it live as you walk. Tap 2: "Shot: 247 yds", and that spot
    // is the new start. No club, nothing saved. (The shot / club code below is kept for later.)
    function markShotHere() {
        if (!S) return;
        if (!fix) { flash('No GPS position yet'); return; }
        if (!S.measureFrom) { S.measureFrom = fix.pt; S.measureShot = null; render(); return; }
        var m = G.haversineMeters(S.measureFrom, fix.pt);
        S.measureShot = { text: G.shownDistance(m, units()) + (units() === 'm' ? ' m' : ' yds'), at: Date.now() };
        S.measureFrom = fix.pt;
        flash('Shot: ' + S.measureShot.text);
        // MY BAG (008): which club was that? (skippable, never in the way)
        bagAsk(m / G.M_PER_YD);
        render();
        setTimeout(function () { if (S) render(); }, 4100);
    }
    function measureLabel() {
        if (!S || !S.measureFrom) return '\uD83D\uDCCD Mark shot';
        if (S.measureShot && Date.now() - S.measureShot.at < 4000) return 'Shot: ' + S.measureShot.text;
        var d = fix ? G.haversineMeters(S.measureFrom, fix.pt) : 0;
        return '\uD83D\uDCCD ' + G.shownDistance(d, units()) + (units() === 'm' ? ' m' : ' yds');
    }
    // ---- MY CLUB DISTANCES + THE SUGGESTION (008, switch clubs) ----------------------
    // After a measured shot (Mark shot, the second tap): "Which club?" - a row of chips
    // that never blocks (Skip, or just walk on: it goes after 20 s). The yards go to the
    // golfer's bag ON THIS PHONE (gps-shots.js HardPanGpsBag: median of the last 10 per
    // club, outliers dropped). The map then says "Suggested: 7-iron (your 158)" for the
    // plays-like distance to the center - or to the target once the golfer has moved it.
    // TOURNAMENT MODE (Rules of Golf 4.3): no suggestion and no question. My bag (Tools)
    // shows, edits and resets the numbers.
    // NOT SYNCED: no path under the live rules lets a phone write per-golfer data of its
    // own (pushPrefs/<uid> takes only bets / hype; organizers/<uid>/groups only groups), so
    // the bag stays on the phone until a rule for it exists.
    var BAG_ASK_MS = 20000;
    function bagSwitch() { try { return typeof window.HardPanFeature !== 'function' || window.HardPanFeature('clubs') !== false; } catch (e) { return true; } }
    function bagApi() { return window.HardPanGpsBag || null; }
    function bagGolfer() { var w = scoreFor(); return (w && w.player && w.player.name) || ''; }
    function bagShown(yd) { return units() === 'm' ? Math.round(yd * G.M_PER_YD) : Math.round(yd); }
    function bagAsk(yd) {
        if (!S || !bagSwitch() || tournament() || !(yd > 0)) return;
        var bar = S.el.querySelector('.gps-bagask');
        if (!bar) return;
        S.bagPending = { yd: yd, golfer: bagGolfer() };
        withShots(function () {
            var B = bagApi();
            if (!B || !S || !S.bagPending) return;
            bar.querySelector('.gps-bagask-head').textContent = 'Shot ' + bagShown(yd) + (units() === 'm' ? ' m' : ' yds') + ' \u00b7 which club?';
            var row = bar.querySelector('.gps-bagask-row');
            row.textContent = '';
            B.BAG.forEach(function (c) {
                var b = document.createElement('button');
                b.type = 'button'; b.textContent = c; b.setAttribute('data-bag-club', c); b.setAttribute('aria-label', B.NAMES[c]);
                row.appendChild(b);
            });
            bar.style.display = '';
            clearTimeout(S.bagTimer);
            S.bagTimer = setTimeout(function () { if (S) bagSkip(); }, BAG_ASK_MS);
        });
    }
    function bagSkip() { var bar = S && S.el.querySelector('.gps-bagask'); if (bar) bar.style.display = 'none'; if (S) S.bagPending = null; }
    function bagPick(club) {
        var B = bagApi(), p = S && S.bagPending;
        bagSkip();
        if (!B || !p) return;
        if (B.add(p.golfer, club, p.yd)) flash(B.NAMES[club] + ': ' + bagShown(p.yd) + (units() === 'm' ? ' m' : ' yds') + ' \u2192 My bag');
        else render();
    }
    function syncSuggest(r, o, nums) {
        var el = S.el.querySelector('.gps-suggest');
        if (!el) return;
        var text = '';
        if (bagSwitch() && !tournament() && S.pro && S.mode === 'measure' && o && o.from === 'me' && !(nums && nums.onGreen)) {
            var B = bagApi();
            if (!B) { if (!S.bagLoad) { S.bagLoad = true; withShots(function () { render(); }); } }
            else {
                var moved = !!(S.targetMoved && S.target), to = moved ? S.target : aimAt(r);
                if (to) {
                    var pl = playsTo(moved ? S.target : null);
                    var yd = pl ? pl.exact : G.haversineMeters(o.pt, to) / G.M_PER_YD;
                    var sg = yd >= 10 ? B.suggestClub(B.bag(bagGolfer()), yd) : null;
                    if (sg) text = 'Suggested: ' + sg.name + ' (your ' + bagShown(sg.yd) + ')';
                }
            }
        }
        if (el.textContent !== text) el.textContent = text;
        el.style.display = text ? '' : 'none';
    }
    function bagSheet() { return S && S.el.querySelector('.gps-bag'); }
    function openBag() { var sh = bagSheet(); if (!sh || !S) return; closeMenus(); withShots(function () { if (!S) return; sh.style.display = ''; fillBag(); }); }
    function closeBag() { var sh = bagSheet(); if (sh) sh.style.display = 'none'; }
    function fillBag() {
        var sh = bagSheet(), B = bagApi();
        if (!sh || !B) return;
        var who = bagGolfer(), mine = B.bag(who), m = units() === 'm';
        sh.querySelector('.gps-bag-title').textContent = 'My bag' + (who ? ' \u00b7 ' + String(who).split(' ')[0] : '');
        sh.querySelector('.gps-bag-sub').textContent = (m ? 'Meters' : 'Yards') + ': the middle of your last 10 marked shots per club (odd ones left out), or your own number. On this phone only.';
        var list = sh.querySelector('.gps-bag-list');
        list.textContent = '';
        B.BAG.forEach(function (c) {
            var v = mine[c], row = document.createElement('div');
            row.className = 'gps-bag-row'; row.setAttribute('data-bag-row', c);
            var nm = document.createElement('span'); nm.className = 'gps-bag-name'; nm.textContent = B.NAMES[c];
            var inp = document.createElement('input');
            inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = '1'; inp.max = '449'; inp.className = 'gps-bag-yd'; inp.setAttribute('data-bag-edit', c);
            inp.setAttribute('aria-label', B.NAMES[c] + (m ? ', meters' : ', yards'));
            inp.value = v ? String(bagShown(v.yd)) : ''; inp.placeholder = '\u2014';
            var meta = document.createElement('span'); meta.className = 'gps-bag-meta';
            meta.textContent = !v ? 'no shots yet' : (v.set ? 'your number' : v.n + ' shot' + (v.n === 1 ? '' : 's'));
            var rs = document.createElement('button'); rs.type = 'button'; rs.className = 'gps-bag-reset'; rs.setAttribute('data-bag-reset', c); rs.textContent = 'Reset';
            rs.style.visibility = v ? '' : 'hidden';
            row.appendChild(nm); row.appendChild(inp); row.appendChild(meta); row.appendChild(rs);
            list.appendChild(row);
        });
    }
    // ONE TAP (gps-features): the shot, here (the GPS position), then the club. Kept for later.
    function markShotWithClub() {
        if (!S) return;
        if (!fix) { flash('No GPS position yet - or tap the map: Tools \u203A Mark shots'); return; }
        withShots(function () {
            if (!addShot(fix.pt, 'here')) return;
            openClubSheet();
        });
    }
    function openClubSheet() {
        var A = shotsApi(), sh = S && S.el.querySelector('.gps-clubs');
        if (!A || !sh || tournament()) return;
        var code = S.eventCode, hole = S.hole;
        var list = A.shots(code, hole), last = list[list.length - 1];
        var head = sh.querySelector('.gps-clubs-head');
        head.textContent = 'Shot ' + list.length + (last && last.yd != null ? ' \u00b7 ' + G.shownDistance(last.yd * G.M_PER_YD, units()) + (last.plays != null && last.plays !== last.yd ? ' (played ' + G.shownDistance(last.plays * G.M_PER_YD, units()) + ')' : '') : '') + ' \u2014 which club?';
        var row = sh.querySelector('.gps-clubs-row');
        row.textContent = '';
        A.CLUBS.forEach(function (c) {
            var b = document.createElement('button');
            b.type = 'button'; b.textContent = c; b.setAttribute('data-club', c);
            b.onclick = function () { if (!S) return; A.setLast(code, hole, { club: c }); closeClubSheet(); render(); };
            row.appendChild(b);
        });
        sh.style.display = '';
    }
    function closeClubSheet() { var sh = S && S.el.querySelector('.gps-clubs'); if (sh) sh.style.display = 'none'; }
    function moveLastShot(pt) {
        var A = shotsApi();
        if (!A || !S) return;
        var list = A.shots(S.eventCode, S.hole);
        var prev = list.length > 1 ? list[list.length - 2].p : null;
        A.setLast(S.eventCode, S.hole, Object.assign({ p: pt, how: 'tap', yd: null, plays: null, elevFt: null, wind: null }, shotDetails(prev, pt)));
        S.shotAdjust = false;
        flash('Shot moved');
        render();
    }
    function drawShots() {
        var A = shotsApi();
        var mb = S && S.el.querySelector('.gps-mark-shot');
        if (mb) { mb.style.display = S && S.pro && S.mode === 'measure' && !S.replay ? '' : 'none'; if (S && mb.textContent !== measureLabel()) mb.textContent = measureLabel(); }
        // Markers whenever this hole has shots; the bar only while marking / replaying / moving.
        var mode = !!(S && (S.shotMode || S.replay || S.shotAdjust));
        var on = !!(S && A && S.mode === 'measure' && (mode || A.shots(S.eventCode, S.hole).length));
        var list = on ? A.shots(S.eventCode, S.hole) : [];
        var r = on ? resolved() : null;
        var legs = on ? A.legs(list, r && r.tee, G.haversineMeters) : [];
        var keep = {};
        if (S && S.map && ML()) list.forEach(function (sh, i) {
            var k = 'shot' + i;
            keep[k] = 1;
            var m = marker(k, sh.p, function () { var e = document.createElement('div'); e.className = 'gps-shot'; return e; });
            var yd = sh.yd != null ? sh.yd : legs[i];
            var t = (i + 1) + (sh.club ? ' \u00b7 ' + sh.club : '') + (yd != null ? ' \u00b7 ' + G.shownDistance(yd * G.M_PER_YD, units()) : '');
            var el = m && m.getElement();
            if (el && el.textContent !== t) el.textContent = t;
        });
        Object.keys((S && S.markers) || {}).forEach(function (k) { if (/^shot/.test(k) && !keep[k]) marker(k, null); });
        var bar = S && S.el.querySelector('.gps-shotbar');
        if (!bar) return;
        bar.style.display = on && mode ? '' : 'none';
        if (!on || !mode) return;
        var n = list.length;
        var text = S.shotAdjust ? 'Hole ' + S.hole + ' \u00b7 tap the map where shot ' + n + ' finished'
            : S.shotMode ? 'Hole ' + S.hole + ' \u00b7 tap where shot ' + (n + 1) + ' finished' + (n ? ' (' + n + ' marked)' : '')
            : 'Replay \u00b7 Hole ' + S.hole + ' \u00b7 ' + (n ? n + ' shot' + (n === 1 ? '' : 's') + ': ' + list.map(function (sh, i) {
                var y = sh.yd != null ? sh.yd : legs[i];
                return (sh.club ? sh.club + ' ' : '') + (y == null ? '?' : G.shownDistance(y * G.M_PER_YD, units()));
            }).join(' \u00b7 ') : 'no shots marked');
        var tx = bar.querySelector('.gps-shotbar-text');
        if (tx.textContent !== text) tx.textContent = text;
        var vis = function (sel, v) { var b = bar.querySelector(sel); if (b) b.style.display = v ? '' : 'none'; };
        vis('.gps-sb-here', S.shotMode && !!fix); vis('.gps-sb-undo', S.shotMode && n > 0);
        vis('.gps-sb-prev', !!S.replay); vis('.gps-sb-play', !!S.replay);
        var pb = bar.querySelector('.gps-sb-play');
        if (pb) pb.textContent = S.replayTimer ? '\u275A\u275A Pause' : '\u25B6 Play';
        var db = bar.querySelector('.gps-sb-done');
        if (db) db.textContent = S.replay ? 'Exit replay' : 'Done';
    }
    // Replay steps through the holes WITH shots, in order, one every 3.5 s.
    function replayStep(dir) {
        var A = shotsApi();
        if (!A || !S) return false;
        var hs = A.holesWithShots(S.eventCode), cur = Number(S.hole);
        var next = dir > 0 ? hs.filter(function (h) { return h > cur; })[0] : hs.filter(function (h) { return h < cur; }).pop();
        if (next == null) return false;
        if (typeof S.gotoHole === 'function') S.gotoHole(next); else setHole(next);
        return true;
    }
    function stopReplayTimer() { if (S && S.replayTimer) { clearInterval(S.replayTimer); S.replayTimer = null; } }

    // "Par 4 · 385y · HCP 12": par, the tee set's yards and the stroke index,
    // from OUR CARD (S.holeMeta). A card with no yardage (the preset courses)
    // shows the mapped tee -> green distance instead, marked "~".
    function holeMetaLine(r) {
        var m = (S && typeof S.holeMeta === 'function') ? (S.holeMeta(S.hole) || {}) : {};
        var parts = [];
        var par = m.par != null ? m.par : S.par;
        if (par != null) parts.push('Par ' + par);
        var u = units();
        var sfx = u === 'm' ? 'm' : 'y';
        if (m.yards) parts.push((u === 'm' ? Math.round(m.yards * G.M_PER_YD) : m.yards) + sfx);
        // "~": measured on the map from the mapped (back) tee, not printed on the card.
        else if (r && r.tee && r.mid) parts.push('~' + G.shownDistance(G.haversineMeters(r.tee, r.mid), u) + sfx);
        if (m.si != null && isFinite(m.si)) parts.push('HCP ' + m.si);
        return parts.join(' · ');
    }

    // ---- MENUS: Tools and the hole picker ------------------------------------------
    function closeMenus() { show('.gps-tools-menu', false); show('.gps-picker', false); }
    function toggleTools() {
        var m = S && S.el.querySelector('.gps-tools-menu');
        if (!m) return;
        var open = m.style.display === 'none';
        closeMenus();
        if (open) { render(); aaToggleText(); m.style.display = ''; }
    }
    function openPicker() {
        if (!S) return;
        closeMenus();
        var holes = (typeof S.holeList === 'function' ? S.holeList() : null) || [];
        if (!holes.length) for (var n = 1; n <= 18; n++) holes.push(n);
        var grid = S.el.querySelector('.gps-picker-grid');
        grid.innerHTML = holes.map(function (h) { return '<button type="button" data-hole="' + h + '"' + (h === S.hole ? ' class="gps-here"' : '') + '>' + h + '</button>'; }).join('');
        show('.gps-picker', true);
    }
    function pickHole(h) {
        closeMenus();
        if (!S || !h || h === S.hole) return;
        if (typeof S.gotoHole === 'function') S.gotoHole(h);
    }

    // ---- AUTO-ADVANCE HOLES (008, switch autoAdvance) ---------------------------------
    // The golfer walks off the green to the NEXT hole's tee (next in PLAY ORDER - the
    // picker's list: start on 10, a shotgun hole) and stays there ~10 s: GPS moves to
    // that hole, through the card's own goToHole (the KP gate holds), and says so - a
    // small "Hole 5 >" toast with Undo (back to the hole it left; no second jump until
    // the golfer has walked off that tee). Never while a score is being entered (the
    // card showing, a box focused) or any sheet / menu is open on the map, never while
    // setting a green, marking shots or replaying, and never from the current green
    // (gps-geo.onNextTee). Tools > "Auto-advance holes" turns it off on this phone
    // (hardpan_gps_autoadvance = '0'); the switch off = none of it exists.
    // PRIVACY: the position is compared, never stored - only the On / Off choice is.
    var AA_KEY = 'hardpan_gps_autoadvance', AA_DWELL_MS = 10000, AA_TOAST_MS = 8000, AA_LEAVE_M = 40;
    function aaSwitch() { try { return typeof window.HardPanFeature !== 'function' || window.HardPanFeature('autoAdvance') !== false; } catch (e) { return true; } }
    function aaOn() { if (!aaSwitch()) return false; try { return localStorage.getItem(AA_KEY) !== '0'; } catch (e) { return true; } }
    function aaHoleRec(n) {
        var osm = osmRecord(S.courseKey);
        return G.resolveHole(osm && osm.holes ? osm.holes[String(n)] : null, pinsFor(n));
    }
    // Anything open over the map or the card that a hole change would pull out from under.
    function aaBusy() {
        if (S.side !== 'gps' || S.mode !== 'measure' || S.shotMode || S.replay || S.shotAdjust || S.flying || !S.pro) return true;
        var a = document.activeElement;
        if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || '')) return true;
        if (paywallOpen()) return true;
        var kp = document.getElementById('kp-force-overlay');
        if (kp && kp.style.display === 'flex') return true;
        return Array.prototype.some.call(S.el.querySelectorAll('[role="dialog"],[role="menu"]'), function (d) { return d.style.display !== 'none' && d.offsetParent !== null; });
    }
    function aaTick() {
        if (!S || !G || !G.onNextTee) return;
        var nx = aaOn() && typeof S.holeList === 'function' ? G.nextInPlayOrder(S.holeList() || [], S.hole) : null;
        var nr = nx != null ? aaHoleRec(nx) : null;
        dropStaleFix();
        // UNDONE: no second jump while the golfer is still on that tee.
        if (S.aaSkip != null && (!fix || !nr || !nr.tee || S.aaSkip !== nx || G.haversineMeters(fix.pt, nr.tee) > AA_LEAVE_M)) S.aaSkip = null;
        var cur = resolved(), nums = cur && fix ? G.holeNumbers(fix.pt, cur) : null;
        var there = !!(fix && nr && nr.tee && G.onNextTee({ me: fix.pt, acc: fix.acc, tee: nr.tee, green: cur && cur.mid, onGreen: !!(nums && nums.onGreen) }));
        if (!there || S.aaSkip === nx || aaBusy()) { S.aaDwell = null; return; }
        var now = Date.now();
        if (!S.aaDwell || S.aaDwell.hole !== nx) {
            S.aaDwell = { hole: nx, since: now };
            clearTimeout(S.aaTimer);
            // A phone standing still may report less often: look again when the wait is up.
            S.aaTimer = setTimeout(function () { if (S) render(); }, AA_DWELL_MS + 150);
            return;
        }
        if (now - S.aaDwell.since < AA_DWELL_MS) return;
        var from = S.hole;
        S.aaDwell = null;
        if (typeof S.gotoHole === 'function') S.gotoHole(nx); else setHole(nx);
        if (S && Number(S.hole) === Number(nx)) aaToast(from, nx);
    }
    function aaToast(from, to) {
        var t = S && S.el.querySelector('.gps-aa-toast');
        if (!t) return;
        t.setAttribute('data-from', String(from));
        t.setAttribute('data-to', String(to));
        var l = t.querySelector('.gps-aa-text');
        if (l) l.textContent = 'Hole ' + to + ' \u203A';
        t.style.display = '';
        clearTimeout(S.aaToastTimer);
        S.aaToastTimer = setTimeout(function () { if (S) aaHideToast(); }, AA_TOAST_MS);
    }
    function aaHideToast() { var t = S && S.el.querySelector('.gps-aa-toast'); if (t) t.style.display = 'none'; }
    function aaUndo() {
        var t = S && S.el.querySelector('.gps-aa-toast');
        if (!t) return;
        var from = Number(t.getAttribute('data-from')), to = Number(t.getAttribute('data-to'));
        aaHideToast();
        if (!from || Number(S.hole) !== to) return;
        S.aaSkip = to;
        if (typeof S.gotoHole === 'function') S.gotoHole(from); else setHole(from);
    }
    function aaToggleText() { txt('.gps-aa-toggle', 'Auto-advance holes: ' + (aaOn() ? 'On' : 'Off')); }

    // ---- FREE PAN, KEPT ON THE COURSE ------------------------------------------------
    // Pan and zoom anywhere on the course (one finger pans, two pinch); the map
    // never wanders off it: panning is limited to the course's own area (every
    // mapped tee and green, plus any green a golfer set) and a 400 m margin, and
    // it never zooms out past z13. Recenter, the arrows, the picker and Enter
    // Score's › all go back to a hole's own view. Esri tiles load only as you
    // pan; offline, the pre-cached USGS area is the same course area.
    var PAN_MARGIN_M = 400, MIN_ZOOM = 13;
    function limitToCourse() {
        if (!S || !S.map || !G) return;
        var osm = osmRecord(S.courseKey);
        var mids = function (pins) { return Object.keys(pins || {}).map(function (k) { return pins[k] && pins[k].mid; }).filter(Boolean); };
        var extra = mids(S.round && S.round.gpsPins).concat(mids(S.localPins)).concat(mids(S.courseRec && S.courseRec.pins));
        var b = G.courseBounds(osm, extra, PAN_MARGIN_M);
        // A HOLE WITH NO DATA is framed on the golfer, so the green can be tapped:
        // no limit then - an unmapped hole can lie outside the mapped ones' area
        // (Pine Lakes is mapped in part), and a limit would hold the map off it.
        var r = resolved();
        var el = S.el.querySelector('.gps-map');
        if (!b || !r || (!r.mid && !r.tee)) {
            try { S.map.setMaxBounds(null); S.map.setMinZoom(0); } catch (e) {}
            if (el) el.setAttribute('data-bounds', '');
            return;
        }
        try {
            S.map.setMaxBounds([[b.west, b.south], [b.east, b.north]]);
            S.map.setMinZoom(MIN_ZOOM);
            if (el) el.setAttribute('data-bounds', [b.west, b.south, b.east, b.north].map(function (v) { return v.toFixed(4); }).join(','));
        } catch (e) {}
    }

    // ---- MARKUP AND STYLE -----------------------------------------------------
    var MARKUP = ''
        // THE MAP, EDGE TO EDGE (redesign step 1, 2026-10-08): everything else
        // floats over it on rounded, translucent panels - nothing solid.
        + '<div class="gps-map-wrap">'
        +   '<div class="gps-map"></div>'
        +   '<div class="gps-arc-labels"></div>'
        +   '<div class="gps-green-lbls" style="display:none"></div>'
        +   '<div class="gps-pill gps-pill-to" style="display:none"></div>'
        +   '<div class="gps-pill gps-pill-on" style="display:none"></div>'
        +   '<div class="gps-tiles-note" style="display:none">No satellite view here without signal — yardages still work.</div>'
        +   '<div class="gps-fly-cap" data-feature="flyover" style="display:none" role="status"></div>'
        + '</div>'
        // TOP PANEL: back, the hole (tap = pick a hole), CENTER big with F / B.
        + '<div class="gps-top">'
        +   '<button type="button" class="gps-back gps-float" aria-label="Back to the scorecard">‹</button>'
        +   '<div class="gps-holebox gps-float">'
        +     '<div class="gps-holerow">'
        +       '<button type="button" class="gps-prev" aria-label="Previous hole">‹</button>'
        +       '<button type="button" class="gps-hole-btn" aria-label="Pick a hole"><span class="gps-hole-lbl">HOLE</span><span class="gps-hole-num"></span><span class="gps-hole-caret">▾</span><span class="gps-title gps-sr"></span></button>'
        +       '<button type="button" class="gps-next" aria-label="Next hole">›</button>'
        +     '</div>'
        +     '<div class="gps-meta"></div>'
        +   '</div>'
        +   '<div class="gps-yardbox gps-float">'
        +     '<div class="gps-num gps-num-mid"><div class="gps-lbl gps-lbl-mid">CENTER</div><div class="gps-big gps-m">—</div><div class="gps-plays" style="visibility:hidden"></div></div>'
        +     '<div class="gps-fb">'
        // BACK on top, FRONT under it (Manny, 2026-10-13) - the green as it lies from the fairway.
        +       '<div class="gps-num gps-num-b"><div class="gps-lbl" aria-label="Back">B</div><div class="gps-big gps-b">—</div></div>'
        +       '<div class="gps-num gps-num-f"><div class="gps-lbl" aria-label="Front">F</div><div class="gps-big gps-f">—</div></div>'
        +     '</div>'
        +   '</div>'
        + '</div>'
        // UNDER THE TOP PANEL: accuracy and source, the green's size, notes.
        + '<div class="gps-under">'
        +   '<div class="gps-sub gps-float"><span class="gps-acc"></span><span class="gps-src"></span></div>'
        +   '<div class="gps-tourney gps-float" style="display:none" aria-label="Tournament mode: distance only">TOURNAMENT</div>'
        +   '<div class="gps-suggest gps-float" data-feature="clubs" style="display:none" role="status"></div>'
        +   '<div class="gps-green-dims gps-float" style="display:none"></div>'
        +   '<div class="gps-msg gps-float" style="display:none"></div>'
        +   '<div class="gps-verify gps-float" style="display:none"></div>'
        + '</div>'
        // ZOOM: the RIGHT edge, half way down the screen, for the right thumb (Manny, 2026-10-13);
        // placeZoom keeps it clear of the right-hand stack (wind, Green, Mark shot).
        + '<button type="button" class="gps-zoom gps-zoom-side gps-float" data-zoom="1x" aria-pressed="false" aria-label="Zoom in 2x around the target">' + MAG_SVG + '</button>'
        // RIGHT SIDE STACK: wind, the green view.
        + '<div class="gps-right">'
        +   '<div class="gps-wind gps-float" style="display:none" role="button" tabindex="0" aria-label="Wind"><span class="gps-wind-arrow">↑</span><span class="gps-wind-mph"></span><span class="gps-wind-tag"></span></div>'
        +   '<button type="button" class="gps-green-view gps-float" style="display:none" aria-label="Zoom to the green, or back to the hole"></button>'
        +   '<button type="button" class="gps-hz-btn gps-float" data-feature="hazards" style="display:none" aria-label="Hazards and layups on this hole">Hazards</button>'
        +   '<button type="button" class="gps-mark-shot gps-float" style="display:none" aria-label="Mark shot here">\uD83D\uDCCD Mark shot</button>'
        +   '<button type="button" class="gps-fly-btn gps-float" data-feature="flyover" style="display:none" aria-label="Preview the hole from the tee to the green">Preview</button>'
        + '</div>'
        + '<div class="gps-clubs gps-float" style="display:none" role="dialog" aria-label="Which club?"><div class="gps-clubs-head"></div><div class="gps-clubs-row"></div>'
        +   '<div class="gps-clubs-foot"><button type="button" class="gps-club-move">Move it on the map</button><button type="button" class="gps-club-skip">Skip</button></div></div>'
        // MY BAG (008): "Which club?" after a measured shot - a chip row, never a blocking sheet.
        + '<div class="gps-bagask gps-float" data-feature="clubs" style="display:none" role="group" aria-label="Which club?"><div class="gps-bagask-top"><span class="gps-bagask-head"></span><button type="button" class="gps-bagask-skip">Skip</button></div><div class="gps-bagask-row"></div></div>'
        // LEFT, ABOVE THE SCORECARD: Recenter, and you (or the tee) -> the target.
        + '<div class="gps-leftrow">'
        +   '<button type="button" class="gps-recenter gps-float" aria-label="Recenter on the hole">⌖</button>'
        +   '<div class="gps-target-row gps-float" style="display:none"><span class="gps-to-here"></span><span class="gps-to-plays"></span><span class="gps-here-center gps-sr"></span></div>'
        + '</div>'
        + '<div class="gps-banner gps-float" style="display:none"></div>'
        // AUTO-ADVANCE (008): "Hole 5 >" with Undo, for a few seconds after a jump.
        + '<div class="gps-aa-toast gps-float" data-feature="autoAdvance" style="display:none" role="status"><span class="gps-aa-text"></span><button type="button" class="gps-aa-undo">Undo</button></div>'
        // BOTTOM: the scorecard (left), Enter Score + next hole (center), Tools (right).
        + '<div class="gps-bottom">'
        +   '<button type="button" class="gps-side-bets gps-float" aria-label="Scorecard"><span class="gps-ico">▤</span><span class="gps-cap">Card</span></button>'
        +   '<div class="gps-scorebox gps-float">'
        +     '<button type="button" class="gps-score-prev" aria-label="Previous hole">‹</button>'
        +     '<div class="gps-score-col"><button type="button" class="gps-who" style="display:none" aria-label="Whose score - pick a golfer"></button><button type="button" class="gps-score"></button></div>'
        +     '<button type="button" class="gps-score-next" aria-label="Next hole">›</button>'
        +   '</div>'
        +   '<button type="button" class="gps-door-add gps-float" style="display:none" aria-label="Add a game"><span class="gps-ico">\uFF0B</span><span class="gps-cap">Game</span></button>'
        +   '<button type="button" class="gps-tools gps-float" aria-label="Tools"><span class="gps-ico">⋯</span><span class="gps-cap">Tools</span></button>'
        + '</div>'
        // WHOSE SCORE (gps-start10): pick your group (more than one), then a golfer in it.
        // MY BAG (008): see / edit / reset the club numbers.
        + '<div class="gps-bag gps-float gps-scroll-ok" data-feature="clubs" style="display:none" role="dialog" aria-label="My bag">'
        +   '<div class="gps-bag-head"><div class="gps-bag-title"></div><button type="button" class="gps-bag-done">Done</button></div><div class="gps-bag-sub"></div>'
        +   '<div class="gps-bag-list"></div><button type="button" class="gps-bag-resetall">Reset all</button>'
        + '</div>'
        + '<div class="gps-who-sheet gps-scroll-ok" style="display:none" role="dialog" aria-label="Whose score"><div class="gps-who-card"><div class="gps-who-title"></div><div class="gps-who-list"></div><button type="button" class="gps-who-skip" style="display:none">Skip</button></div></div>'
        // THE TWO FRONT DOORS (gps-doors, the app only): a Games chip at the top, and
        // GPS-4 "Add a game" - this round's golfers, a quick start, paste, full setup.
        + '<button type="button" class="gps-door-games" style="display:none" aria-label="Games home">Games</button>'
        + '<div class="gps-addgame" style="display:none" role="dialog" aria-label="Add a game">'
        +   '<div class="gps-ag-head"><button type="button" class="gps-ag-back" aria-label="Back to map">\u2039</button><div><div class="gps-ag-title">Add a game</div><div class="gps-ag-sub">To this round \u00b7 your scores carry over</div></div></div>'
        +   '<div class="gps-ag-h">PLAYING</div><div class="gps-ag-players"></div>'
        +   '<div class="gps-ag-h">QUICK START</div><div class="gps-ag-grid"></div>'
        +   '<div class="gps-ag-h">MORE</div>'
        +   '<button type="button" class="gps-ag-row" data-ag-go="paste"><span><b>Paste the whole round</b><span>Groups, teams and games from one text</span></span><span>\u203A</span></button>'
        +   '<button type="button" class="gps-ag-row" data-ag-go="full"><span><b>Full game setup</b><span>Every game, presses, side bets</span></span><span>\u203A</span></button>'
        +   '<button type="button" class="gps-ag-not">Not now \u00b7 back to map</button>'
        + '</div>'
        // WHILE A GREEN OR A PIN IS BEING SET: its buttons take the bottom.
        + '<div class="gps-actions gps-float" style="display:none">'
        +   '<button type="button" class="gps-btn gps-primary gps-gps-set" style="display:none">Set center</button>'
        +   '<button type="button" class="gps-btn gps-addedges" style="display:none">Add front & back</button>'
        +   '<button type="button" class="gps-btn gps-skip" style="display:none">Skip</button>'
        +   '<button type="button" class="gps-btn gps-primary gps-save" style="display:none">Save green</button>'
        +   '<button type="button" class="gps-btn gps-cancel" style="display:none">Cancel</button>'
        +   '<button type="button" class="gps-tap-fallback" style="display:none">Set by tapping (lower detail)</button>'
        + '</div>'
        // TOOLS: Edit Pin, the green, Units.
        + '<div class="gps-shotbar gps-float" style="display:none" role="status"><div class="gps-shotbar-text"></div><div class="gps-shotbar-btns">'
        +   '<button type="button" class="gps-sb-here">Here</button><button type="button" class="gps-sb-undo">Undo</button>'
        +   '<button type="button" class="gps-sb-prev" aria-label="Previous hole with shots">\u25C0</button><button type="button" class="gps-sb-play">\u25B6 Play</button>'
        +   '<button type="button" class="gps-sb-done">Done</button></div></div>'
        + '<div class="gps-tools-menu gps-float" style="display:none" role="menu">'
        +   '<button type="button" class="gps-menu-item gps-set-green" style="display:none">Set the green</button>'
        +   '<button type="button" class="gps-menu-item gps-fix-green" style="display:none">Fix the green</button>'
        +   '<button type="button" class="gps-menu-item gps-undo-green" style="display:none">Undo last fix</button>'
        +   '<button type="button" class="gps-menu-item gps-rechoose" style="display:none">Choose hole 1 again</button>'
        +   '<button type="button" class="gps-menu-item gps-refresh-gps" style="display:none">Refresh GPS data</button>'
        +   '<button type="button" class="gps-menu-item gps-units"></button>'
        +   '<button type="button" class="gps-menu-item gps-tourney-toggle"></button>'
        +   '<button type="button" class="gps-menu-item gps-aa-toggle" data-feature="autoAdvance"></button>'
        +   '<button type="button" class="gps-menu-item gps-my-stats">My stats</button>'
        +   '<button type="button" class="gps-menu-item gps-my-bag" data-feature="clubs">My bag</button>'
        +   '<button type="button" class="gps-menu-item gps-mark-shots">Mark shots</button>'
        +   '<button type="button" class="gps-menu-item gps-replay">Replay round</button>'
        +   '<button type="button" class="gps-menu-item gps-add-game">\u2795 Add a game</button>'
        +   '<button type="button" class="gps-menu-item gps-pick-course" style="display:none">\u26F3 Pick another course</button>'
        + '</div>'
        // THE HOLE PICKER.
        + '<div class="gps-picker" style="display:none" role="dialog" aria-label="Pick a hole"><div class="gps-picker-card gps-float"><div class="gps-picker-title">Go to hole</div><div class="gps-picker-grid"></div></div></div>'
        + '<div class="gps-credit"><img class="gps-google-logo" alt="Google Maps" style="display:none" src="' + GOOGLE.logo + '"><span class="gps-credit-txt"></span><span aria-hidden="true">·</span><button type="button" class="gps-credit-i" aria-label="Map credits">ⓘ</button></div>'
        + '<div class="gps-credit-pop gps-float" style="display:none" role="dialog" aria-label="Map credits"></div>'
        // THE WIND DIAL (build 7): a sheet from the bottom. Drag the arrow to where
        // the wind blows (up, at the green flag, = toward the green); mph under it.
        // HAZARDS + LAYUPS (008): a sheet from the bottom.
        + '<div class="gps-hzs gps-float gps-scroll-ok" data-feature="hazards" style="display:none" role="dialog" aria-label="Hazards and layups">'
        +   '<div class="gps-hzs-head"><div><div class="gps-hzs-title"></div><div class="gps-hzs-sub"></div></div><button type="button" class="gps-hzs-done">Done</button></div>'
        +   '<div class="gps-hzs-list"></div><div class="gps-hzs-layh">LAY UP</div><div class="gps-hzs-lay"></div>'
        + '</div>'
        + '<div class="gps-wind-sheet gps-float" style="display:none" role="dialog" aria-label="Set the wind">'
        +   '<div class="gps-ws-head"><div class="gps-ws-title">Wind<small class="gps-ws-state"></small></div>'
        +     '<button type="button" class="gps-ws-live">Use live wind</button><button type="button" class="gps-ws-done">Done</button></div>'
        +   '<div class="gps-ws-attrib" style="display:none;font-size:11px;font-weight:600;line-height:1.3;color:#c8d1ca;margin:2px 0 6px;">\uF8FF Weather \u00b7 <a href="https://weatherkit.apple.com/legal-attribution.html" target="_blank" rel="noopener" style="color:#c8d1ca;">Other data sources</a></div>'
        +   '<div class="gps-dial" tabindex="0" role="slider" aria-label="Where the wind blows - up is toward the green" aria-valuemin="0" aria-valuemax="355">'
        +     '<span class="gps-dial-green" aria-hidden="true"><svg viewBox="0 0 12 16" width="11" height="15"><path d="M2 1v14" stroke="#ffffff" stroke-width="1.6"/><path d="M2.8 1.5h8l-2.4 2.6 2.4 2.6h-8z" fill="#4ade80"/></svg>green</span>'
        +     '<span class="gps-dial-ticks" aria-hidden="true"></span>'
        +     '<span class="gps-dial-arrow" aria-hidden="true"><svg viewBox="0 0 40 150" width="40" height="150"><path d="M20 146V30" stroke="#93c5fd" stroke-width="7" stroke-linecap="round"/><path d="M20 4L37 36H3z" fill="#93c5fd"/><circle cx="20" cy="146" r="5" fill="#93c5fd"/></svg></span>'
        +     '<span class="gps-dial-hub" aria-hidden="true"></span>'
        +   '</div>'
        +   '<div class="gps-ws-read" aria-live="polite"></div>'
        +   '<div class="gps-ws-row"><button type="button" class="gps-ws-minus" aria-label="1 mph less">\u2212</button><span class="gps-ws-mph"></span><span class="gps-ws-unit">mph</span><button type="button" class="gps-ws-plus" aria-label="1 mph more">+</button></div>'
        +   '<input type="range" class="gps-ws-slider" min="0" max="40" step="1" value="0" aria-label="Wind speed, mph">'
        + '</div>';

    var TOGGLE_H = 52;   // px, plus the safe-area inset
    // OUR LOOK: a deep green-black glass, a lime accent, soft round corners.
    var PANEL = 'background:rgba(12,18,14,.74);-webkit-backdrop-filter:blur(12px) saturate(1.2);backdrop-filter:blur(12px) saturate(1.2);'
        + 'border:1px solid rgba(217,249,157,.14);box-shadow:0 6px 18px rgba(0,0,0,.28);border-radius:16px;color:#f4f4ef;';
    var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    var CSS = ''
        // On BETS: one "📍 GPS" button, above the Round Menu handle; the way back
        // from GPS is the Scorecard button on the map. On GPS it is not there.
        // CENTERED, where the old GPS | Bets pill was: at the right it sat on the
        // card's own Next button (hole_view_landing_test caught it).
        + '#gps-side-toggle{position:fixed;left:50%;transform:translateX(-50%);z-index:55;display:flex;bottom:calc(70px + env(safe-area-inset-bottom));' + PANEL + 'border-radius:999px;padding:3px;font-family:' + FONT + ';}'
        + 'body.gps-side-gps #gps-side-toggle{display:none;}'
        + '#gps-side-toggle .gps-side-note{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);width:max-content;max-width:min(300px,86vw);'
        +   'background:rgba(11,15,12,.92);color:#f4f4ef;font:600 13px/1.35 ' + FONT + ';padding:8px 12px;border-radius:12px;text-align:center;}'
        + '#gps-side-toggle button{font-family:inherit;font-weight:800;font-size:15px;line-height:1;color:#0b0f0c;background:#d9f99d;border:0;border-radius:999px;padding:10px 16px;min-height:42px;cursor:pointer;}'
        + 'body.has-gps-toggle #main-content{padding-bottom:132px !important;}'
        + '#gps-overlay{position:fixed;inset:0;z-index:10050;display:none;background:#0b0f0c;color:#f4f4ef;font-family:' + FONT + ';--gps-attrib-h:20px;--gps-top-b:110px;}'
        + 'body.gps-side-gps #gps-overlay{display:block;}'
        + '#gps-overlay .gps-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}'
        + '#gps-overlay button{font:inherit;color:inherit;background:transparent;border:0;cursor:pointer;}'
        + '#gps-overlay .gps-float{' + PANEL + '}'
        + '#gps-overlay .gps-map-wrap{position:absolute;inset:0;}'
        + '#gps-overlay .gps-map{position:absolute;inset:0;background:#1d3b2a;}'
        // TOP PANEL
        + '#gps-overlay .gps-top{position:absolute;z-index:6;left:8px;right:8px;top:calc(env(safe-area-inset-top) + 8px);display:flex;gap:6px;align-items:stretch;}'
        + '#gps-overlay .gps-back{flex:0 0 auto;width:38px;font-size:26px;font-weight:700;line-height:1;display:flex;align-items:center;justify-content:center;}'
        + '#gps-overlay .gps-holebox{flex:1 1 auto;min-width:0;padding:6px 6px 7px;display:flex;flex-direction:column;justify-content:center;}'
        + '#gps-overlay .gps-holerow{display:flex;align-items:center;justify-content:space-between;gap:2px;}'
        + '#gps-overlay .gps-prev,#gps-overlay .gps-next{width:30px;min-height:36px;font-size:22px;font-weight:700;color:#d9f99d;}'
        + '#gps-overlay .gps-hole-btn{display:flex;align-items:baseline;gap:5px;min-height:36px;padding:0 4px;}'
        + '#gps-overlay .gps-hole-lbl{font-size:11px;letter-spacing:.1em;color:#a7b3aa;font-weight:700;}'
        + '#gps-overlay .gps-hole-num{font-size:28px;font-weight:800;line-height:1;}'
        + '#gps-overlay .gps-hole-caret{font-size:11px;color:#d9f99d;}'
        + '#gps-overlay .gps-meta{font-size:12px;color:#c8d1ca;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;}'
        + '#gps-overlay .gps-yardbox{flex:0 0 auto;display:flex;align-items:center;gap:9px;padding:6px 10px 6px 12px;}'
        + '#gps-overlay .gps-num{min-width:0;text-align:center;}'
        + '#gps-overlay .gps-lbl{font-size:10px;letter-spacing:.09em;color:#a7b3aa;font-weight:700;}'
        + '#gps-overlay .gps-big{font-weight:800;line-height:1.02;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:18px;}'
        + '#gps-overlay .gps-num-mid .gps-big{font-size:clamp(28px,9.5vw,40px);color:#d9f99d;}'
        + '#gps-overlay .gps-fb{display:flex;flex-direction:column;gap:4px;}'
        + '#gps-overlay .gps-fb .gps-num{display:flex;align-items:baseline;gap:5px;justify-content:flex-start;}'
        + '#gps-overlay .gps-plays{font-size:12px;line-height:14px;min-height:14px;font-weight:700;color:#c8d1ca;white-space:nowrap;}'
        // UNDER THE TOP PANEL
        + '#gps-overlay .gps-under{position:absolute;z-index:5;left:8px;right:84px;top:var(--gps-top-b);display:flex;flex-direction:column;align-items:flex-start;gap:6px;pointer-events:none;}'
        + '#gps-overlay .gps-under > *{pointer-events:auto;}'
        + '#gps-overlay .gps-sub{display:flex;gap:8px;font-size:12px;color:#c8d1ca;padding:5px 9px;border-radius:999px;font-weight:600;}'
        + '#gps-overlay .gps-sub .gps-src:empty{display:none;}'
        // BUILD 3: no "You are off this hole / Green from OpenStreetMap" bar - that
        // line is in the ⓘ credits now - and no "Tee -> target" pill at the bottom.
        // (Without GPS Map the side is never shown.)
        + '#gps-overlay .gps-sub:not(.gps-sub-show),#gps-overlay .gps-target-row{display:none !important;}'
        + '#gps-overlay .gps-acc.gps-weak{color:#fbbf24;font-weight:800;}'
        + '#gps-overlay .gps-green-dims{color:#d9f99d;font:800 13px/1 ' + FONT + ';padding:7px 10px;border-radius:12px;white-space:nowrap;}'
        + '#gps-overlay .gps-msg{font-size:14px;line-height:1.35;color:#f4f4ef;padding:9px 11px;}'
        // ONE LINE until tapped, so the note never covers the green it is about.
        + '#gps-overlay .gps-verify{font-size:13px;line-height:1.35;color:#f4f4ef;padding:6px 10px;border-left:3px solid #fb923c;max-width:100%;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;}'
        + '#gps-overlay .gps-verify.gps-open{white-space:normal;}'
        // RIGHT SIDE STACK
        + '#gps-overlay .gps-zoom-side{position:absolute;z-index:5;right:8px;top:50%;transform:translateY(-50%);}'
        + '#gps-overlay .gps-right{position:absolute;z-index:5;right:8px;top:var(--gps-top-b);display:flex;flex-direction:column;align-items:flex-end;gap:8px;}'
        + '#gps-overlay .gps-right > *{min-width:56px;min-height:44px;box-sizing:border-box;font-weight:800;font-size:14px;padding:6px 9px;display:flex;align-items:center;justify-content:center;gap:4px;}'
        + '#gps-overlay .gps-wind{font:800 13px/1 ' + FONT + ';white-space:nowrap;}'
        + '#gps-overlay .gps-wind-arrow{display:inline-block;font-size:18px;line-height:1;color:#93c5fd;transform-origin:50% 50%;}'
        + '#gps-overlay .gps-wind-northup .gps-wind-tag::before{content:"N\\2191 map \\00b7 ";font-weight:800;}'
        + '#gps-overlay .gps-wind{cursor:pointer;position:relative;}'
        + '#gps-overlay .gps-wind-empty .gps-wind-arrow{display:none;}'
        + '#gps-overlay .gps-wind-tag{display:none;position:absolute;left:0;right:0;bottom:2px;text-align:center;font:700 9px/1 ' + FONT + ';color:#c8d1ca;letter-spacing:.02em;}'
        + '#gps-overlay .gps-wind-tagged .gps-wind-tag{display:block;}'
        + '#gps-overlay .gps-wind-manual .gps-wind-tag{color:#fbbf24;}'
        + '#gps-overlay .gps-hz{font:800 11px/1 ' + FONT + ';padding:3px 6px;border-radius:999px;border:1px solid rgba(11,15,12,.55);white-space:nowrap;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.35);}'
        + '#gps-overlay .gps-hz-bunker{background:#f3e3b5;color:#3a2e12;}'
        + '#gps-overlay .gps-hz-water{background:#9fd3ff;color:#0b2540;}'
        + '#gps-overlay .gps-hz-btn{font-size:13px;white-space:nowrap;}'
        // The stack is taller with Hazards: its own box lets a drag through to the map (only its buttons take taps).
        + '#gps-overlay .gps-right{pointer-events:none;}#gps-overlay .gps-right > *{pointer-events:auto;}'
        + '#gps-overlay .gps-hzs{position:absolute;z-index:46;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;max-height:62%;overflow:auto;border-radius:18px 18px 0 0;padding:12px 16px calc(14px + env(safe-area-inset-bottom));box-sizing:border-box;font-family:' + FONT + ';touch-action:pan-y;}'
        + '#gps-overlay .gps-hzs-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;}'
        + '#gps-overlay .gps-hzs-title{font:800 17px/1.15 ' + FONT + ';}#gps-overlay .gps-hzs-sub{font:600 12px/1.2 ' + FONT + ';color:#c8d1ca;margin-top:2px;}'
        + '#gps-overlay .gps-hzs-done{min-height:44px;border-radius:12px;background:#d9f99d !important;color:#0b0f0c !important;font:800 15px/1 ' + FONT + ' !important;padding:0 16px !important;}'
        + '#gps-overlay .gps-hzs-row{display:flex;justify-content:space-between;gap:10px;padding:9px 2px;border-top:1px solid rgba(255,255,255,.08);font:700 15px/1.25 ' + FONT + ';}'
        + '#gps-overlay .gps-hzs-nums{font-variant-numeric:tabular-nums;white-space:nowrap;color:#d9f99d;}'
        + '#gps-overlay .gps-hzs-water .gps-hzs-name{color:#9fd3ff;}#gps-overlay .gps-hzs-bunker .gps-hzs-name{color:#f3e3b5;}'
        + '#gps-overlay .gps-hzs-behind{opacity:.55;}#gps-overlay .gps-hzs-behind .gps-hzs-nums{color:#c8d1ca;}'
        + '#gps-overlay .gps-hzs-none{padding:10px 2px;font:600 15px/1.3 ' + FONT + ';color:#f4f4ef;}'
        + '#gps-overlay .gps-hzs-layh{font:800 11px/1 ' + FONT + ';letter-spacing:.1em;color:#a7b3aa;margin:12px 2px 4px;}'
        + '#gps-overlay .gps-ask-hole1{font:800 14px/1 ' + FONT + ';color:#0b0f0c;background:#d9f99d;border:2px solid #0b0f0c;border-radius:999px;padding:10px 14px;min-height:44px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.45);white-space:nowrap;}'
        + '#gps-overlay .gps-wind-calm .gps-wind-arrow{display:none;}'
        + '#gps-overlay .gps-wind-tagged{padding-bottom:13px !important;}'
        + '#gps-overlay .gps-wind-sheet{position:absolute;z-index:46;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;border-radius:18px 18px 0 0;padding:10px 16px calc(14px + env(safe-area-inset-bottom));box-sizing:border-box;color:#f4f4ef;display:flex;flex-direction:column;align-items:center;gap:8px;}'
        + '#gps-overlay .gps-ws-head{align-self:stretch;display:flex;align-items:center;gap:8px;}'
        + '#gps-overlay .gps-ws-title{flex:1 1 auto;font:800 17px/1.15 ' + FONT + ';}'
        + '#gps-overlay .gps-ws-title small{display:block;font:600 12px/1.2 ' + FONT + ';color:#c8d1ca;margin-top:2px;}'
        + '#gps-overlay .gps-wind-sheet button{min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:800 15px/1 ' + FONT + ';padding:0 14px;cursor:pointer;}'
        + '#gps-overlay .gps-wind-sheet .gps-ws-done{background:#d9f99d;color:#0b0f0c;border-color:#d9f99d;}'
        + '#gps-overlay .gps-dial{position:relative;width:184px;height:184px;border-radius:50%;flex:0 0 auto;touch-action:none;cursor:grab;background:radial-gradient(circle,rgba(255,255,255,.04) 0 58%,rgba(255,255,255,.12) 58% 100%);border:2px solid rgba(255,255,255,.55);box-sizing:border-box;margin-top:10px;}'
        + '#gps-overlay .gps-dial:focus-visible{outline:3px solid #93c5fd;outline-offset:3px;}'
        + '#gps-overlay .gps-dial-ticks{position:absolute;inset:0;border-radius:50%;background:repeating-conic-gradient(from -1deg,rgba(255,255,255,.7) 0 2deg,transparent 2deg 45deg);-webkit-mask:radial-gradient(circle,transparent 0 80px,#000 80px);mask:radial-gradient(circle,transparent 0 80px,#000 80px);pointer-events:none;}'
        + '#gps-overlay .gps-dial-green{position:absolute;left:50%;top:-12px;transform:translateX(-50%);display:flex;align-items:center;gap:3px;padding:3px 7px 3px 5px;border-radius:999px;background:#14532d;border:1px solid #4ade80;color:#d9f99d;font:800 11px/1 ' + FONT + ';pointer-events:none;white-space:nowrap;z-index:2;}'
        + '#gps-overlay .gps-dial-arrow{position:absolute;left:50%;top:50%;width:40px;height:150px;margin:-75px 0 0 -20px;transform-origin:50% 50%;pointer-events:none;}'
        + '#gps-overlay .gps-dial-arrow svg{display:block;}'
        + '#gps-overlay .gps-dial-hub{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#ffffff;border:1.5px solid rgba(11,15,12,.85);box-sizing:border-box;pointer-events:none;}'
        + '#gps-overlay .gps-ws-read{font:800 18px/1.2 ' + FONT + ';text-align:center;}'
        + '#gps-overlay .gps-ws-row{display:flex;align-items:center;gap:10px;}'
        + '#gps-overlay .gps-ws-row button{width:56px;font-size:24px !important;}'
        + '#gps-overlay .gps-ws-mph{min-width:44px;text-align:right;font:900 28px/1 ' + FONT + ';font-variant-numeric:tabular-nums;}'
        + '#gps-overlay .gps-ws-unit{font:700 14px/1 ' + FONT + ';color:#c8d1ca;margin-right:6px;}'
        + '#gps-overlay .gps-ws-slider{align-self:stretch;width:auto;accent-color:#93c5fd;height:28px;margin:0;}'
        + '#gps-overlay .gps-green-view{font-size:13px;white-space:nowrap;}'
        // The magnifier: "+" in it at the hole view, "-" once zoomed in.
        + '#gps-overlay .gps-zoom svg{display:block;}'
        + '#gps-overlay .gps-zoom.gps-zoomed .gps-mag-plus{display:none;}'
        + '#gps-overlay .gps-zoom.gps-zoomed{background:rgba(255,255,255,.92);color:#0b0f0c;}'
        // LEFT ROW, BOTTOM ROW, BANNER, ACTIONS
        + '#gps-overlay .gps-leftrow{position:absolute;z-index:5;left:8px;right:8px;bottom:calc(var(--gps-attrib-h) + 70px);display:flex;align-items:center;gap:8px;pointer-events:none;}'
        + '#gps-overlay .gps-leftrow > *{pointer-events:auto;}'
        + '#gps-overlay .gps-recenter{width:46px;height:46px;font-size:24px;line-height:1;display:flex;align-items:center;justify-content:center;color:#d9f99d;}'
        + '#gps-overlay .gps-target-row{display:flex;align-items:baseline;gap:8px;padding:9px 12px;border-radius:999px;font-weight:800;font-size:15px;color:#ffffff;white-space:nowrap;}'
        + '#gps-overlay .gps-to-plays{font-size:13px;color:#e5e7eb;font-weight:700;}'
        + '#gps-overlay .gps-to-plays:empty{display:none;}'
        + '#gps-overlay .gps-tourney{align-self:flex-start;background:#9b1c1c;color:#fff;border-color:#9b1c1c;font-weight:800;font-size:11px;letter-spacing:.08em;padding:4px 10px;border-radius:999px;}'
        + '#gps-overlay .gps-bottom{position:absolute;z-index:6;left:8px;right:8px;bottom:calc(var(--gps-attrib-h) + 10px);display:flex;align-items:stretch;gap:8px;height:54px;}'
        + '#gps-overlay .gps-door-add{flex:0 0 auto;width:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}'
        + '#gps-overlay .gps-door-games{position:absolute;z-index:8;top:calc(env(safe-area-inset-top) + 96px);left:10px;border:0;border-radius:999px;padding:7px 14px;background:#1d3557;color:#fff;font:800 13px/1 ' + FONT + ';min-height:34px;cursor:pointer;}'
        + '#gps-overlay .gps-addgame{position:absolute;inset:0;z-index:60;background:#f0f4f2;color:#1a1a1a;overflow:auto;padding:calc(env(safe-area-inset-top) + 10px) 16px calc(env(safe-area-inset-bottom) + 20px);font-family:' + FONT + ';}'
        + '#gps-overlay .gps-ag-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;} #gps-overlay .gps-ag-back{width:44px;height:44px;border:0;background:none;font-size:30px;color:#0f4c3a;cursor:pointer;}'
        + '#gps-overlay .gps-ag-title{font-size:20px;font-weight:800;} #gps-overlay .gps-ag-sub{font-size:13px;color:#555;}'
        + '#gps-overlay .gps-ag-h{font-size:13px;font-weight:800;letter-spacing:1px;color:#555;margin:18px 0 8px;}'
        + '#gps-overlay .gps-ag-players{display:flex;flex-wrap:wrap;gap:8px;} #gps-overlay .gps-ag-players span{background:#fff;border:1px solid #d0e1db;border-radius:999px;padding:8px 14px;font-size:15px;font-weight:600;}'
        + '#gps-overlay .gps-ag-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}'
        + '#gps-overlay .gps-ag-grid button,#gps-overlay .gps-ag-row{display:flex;flex-direction:column;gap:4px;text-align:left;background:#fff;border:0;border-radius:16px;padding:16px;color:#1a1a1a;font:inherit;cursor:pointer;}'
        + '#gps-overlay .gps-ag-grid b,#gps-overlay .gps-ag-row b{font-size:17px;font-weight:800;} #gps-overlay .gps-ag-grid span,#gps-overlay .gps-ag-row span span{font-size:14px;color:#555;}'
        + '#gps-overlay .gps-ag-row{flex-direction:row;justify-content:space-between;align-items:center;width:100%;margin-bottom:10px;} #gps-overlay .gps-ag-row > span:first-child{display:flex;flex-direction:column;gap:3px;}'
        + '#gps-overlay .gps-ag-not{display:block;margin:18px auto 0;border:0;background:none;font:700 15px ' + FONT + ';color:#555;padding:12px;cursor:pointer;}'
        + '#gps-overlay .gps-side-bets,#gps-overlay .gps-tools{flex:0 0 auto;width:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}'
        + '#gps-overlay .gps-ico{font-size:20px;line-height:1;color:#d9f99d;}'
        + '#gps-overlay .gps-cap{font-size:11px;font-weight:700;color:#c8d1ca;}'
        + '#gps-overlay .gps-scorebox{flex:1 1 auto;min-width:0;display:flex;overflow:hidden;background:rgba(217,249,157,.92);border-color:#d9f99d;}'
        + '#gps-overlay .gps-score{flex:1 1 auto;min-width:0;color:#0b0f0c;font-size:16px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 8px;}'
        + '#gps-overlay .gps-score.gps-score-num{font-size:30px;line-height:1;}#gps-overlay .gps-score.gps-score-ro{cursor:default;}'
        // The marks around the big number: a fixed 34px shape (two digits widen it), inside the
        // button's own height - the button never grows. Under par red, over par the number's colour.
        + '#gps-overlay .gps-score-n{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:34px;padding:0 8px;box-sizing:border-box;line-height:1;}'
        + '#gps-overlay .gps-score.gps-score-num .gps-score-n[class*="mark-"]{font-size:22px;}'
        + '#gps-overlay .gps-score-n.mark-birdie{box-shadow:inset 0 0 0 2px #c1121f;border-radius:50%;}'
        + '#gps-overlay .gps-score-n.mark-eagle{box-shadow:inset 0 0 0 2px #c1121f,inset 0 0 0 4px #d9f99d,inset 0 0 0 6px #c1121f;border-radius:50%;}'
        + '#gps-overlay .gps-score-n.mark-bogey{box-shadow:inset 0 0 0 2px #0b0f0c;border-radius:3px;}'
        + '#gps-overlay .gps-score-n.mark-double{box-shadow:inset 0 0 0 2px #0b0f0c,inset 0 0 0 4px #d9f99d,inset 0 0 0 6px #0b0f0c;border-radius:3px;}'
        + '#gps-overlay .gps-score-col{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;touch-action:pan-y;}'
        + '#gps-overlay .gps-score-col .gps-score{flex:1 1 auto;}'
        + '#gps-overlay .gps-who{flex:0 0 auto;background:none;border:0;color:#0b0f0c;font-size:12px;font-weight:800;line-height:1;padding:4px 6px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.85;}'
        + '#gps-overlay .gps-score-col.gps-slide-l{animation:gpsSlideL .22s ease-out;}#gps-overlay .gps-score-col.gps-slide-r{animation:gpsSlideR .22s ease-out;}'
        + '@keyframes gpsSlideL{from{transform:translateX(40%);opacity:.2;}to{transform:none;opacity:1;}}@keyframes gpsSlideR{from{transform:translateX(-40%);opacity:.2;}to{transform:none;opacity:1;}}'
        + '#gps-overlay .gps-who-sheet{position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.4);display:flex;align-items:flex-end;justify-content:center;}'
        + '#gps-overlay .gps-who-card{width:100%;max-width:520px;max-height:70%;overflow:auto;box-sizing:border-box;background:#fff;color:#1a1a1a;border-radius:18px 18px 0 0;padding:16px 16px calc(env(safe-area-inset-bottom) + 14px);}'
        + '#gps-overlay .gps-who-title{font-weight:800;font-size:17px;margin-bottom:10px;}'
        + '#gps-overlay .gps-who-list button{display:block;width:100%;min-height:48px;margin:0 0 8px;border:1px solid #0f4c3a;border-radius:12px;background:#fff;color:#0f4c3a;font-weight:800;font-size:16px;text-align:left;padding:0 14px;}'
        + '#gps-overlay .gps-who-list button.on{background:#0f4c3a;color:#fff;}'
        + '#gps-overlay .gps-who-skip{display:block;width:100%;min-height:44px;border:0;background:none;color:#555;font-weight:700;font-size:15px;}'
        + '#gps-overlay .gps-score-prev{flex:0 0 auto;width:46px;color:#0b0f0c;font-size:26px;font-weight:800;border-right:1px solid rgba(11,15,12,.25);}'
        + '#gps-overlay .gps-score-next{flex:0 0 auto;width:46px;color:#0b0f0c;font-size:26px;font-weight:800;border-left:1px solid rgba(11,15,12,.25);}'
        + '#gps-overlay .gps-banner{position:absolute;z-index:7;left:50%;transform:translateX(-50%);bottom:calc(var(--gps-attrib-h) + 74px);padding:10px 14px;border-radius:999px;font-weight:800;font-size:14px;white-space:nowrap;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;}'
        + '#gps-overlay.gps-banner-up .gps-banner{bottom:calc(var(--gps-attrib-h) + 128px);}'
        + '#gps-overlay .gps-aa-toast{position:absolute;z-index:8;left:50%;transform:translateX(-50%);top:calc(var(--gps-top-b) + 6px);display:flex;align-items:center;gap:10px;padding:6px 6px 6px 14px;border-radius:999px;font:800 16px/1 ' + FONT + ';white-space:nowrap;}'
        + '#gps-overlay .gps-aa-undo{min-height:40px;padding:0 14px;border-radius:999px;background:#d9f99d !important;color:#0b0f0c !important;font:800 14px/1 ' + FONT + ' !important;}'
        + '#gps-overlay.gps-pinning .gps-banner{bottom:calc(var(--gps-attrib-h) + var(--gps-actions-h,58px) + 16px);}'
        + '#gps-overlay .gps-actions{position:absolute;z-index:6;left:8px;right:8px;bottom:calc(var(--gps-attrib-h) + 8px);display:flex;flex-wrap:wrap;gap:8px;padding:8px;}'
        + '#gps-overlay .gps-btn{flex:1 1 auto;min-height:42px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);font-weight:700;padding:8px 12px;}'
        + '#gps-overlay .gps-primary{background:#d9f99d;color:#0b0f0c;border-color:#d9f99d;font-weight:800;}'
        // TOOLS MENU AND HOLE PICKER
        + '#gps-overlay .gps-shotbar{position:absolute;z-index:44;left:8px;right:8px;top:calc(env(safe-area-inset-top) + 92px);padding:8px 10px;border-radius:14px;color:#f4f4ef;font:700 14px/1.3 ' + FONT + ';}'
        + '#gps-overlay .gps-shotbar-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}'
        + '#gps-overlay .gps-shotbar button{min-height:44px;min-width:44px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:800 14px/1 ' + FONT + ';padding:0 12px;cursor:pointer;}'
        + '#gps-overlay .gps-shotbar .gps-sb-done{background:#d9f99d;color:#0b0f0c;border-color:#d9f99d;margin-left:auto;}'
        + '#gps-overlay .gps-shot{min-width:26px;height:26px;padding:0 7px;border-radius:13px;background:#f97316;color:#fff;border:2px solid #fff;font:800 12px/22px ' + FONT + ';text-align:center;white-space:nowrap;box-shadow:0 1px 6px rgba(0,0,0,.5);}'
        + '#gps-overlay .gps-mark-shot{font-size:13px;font-weight:800;white-space:nowrap;padding:0 12px;min-height:44px;}'
        + '#gps-overlay .gps-fly-btn{font-size:13px;white-space:nowrap;}'
        + '#gps-overlay .gps-fly-cap{position:absolute;z-index:9;left:50%;top:calc(var(--gps-top-b) + 8px);transform:translateX(-50%);background:rgba(11,15,12,.86);color:#fff;font:800 18px/1.2 ' + FONT + ';padding:10px 16px;border-radius:999px;white-space:nowrap;pointer-events:none;}'
        + '#gps-overlay .gps-clubs{position:absolute;z-index:47;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;border-radius:18px 18px 0 0;padding:10px 12px calc(14px + env(safe-area-inset-bottom));color:#f4f4ef;font:700 14px/1.3 ' + FONT + ';}'
        + '#gps-overlay .gps-clubs-row{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;}'
        + '#gps-overlay .gps-clubs button{min-height:44px;min-width:52px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:800 15px/1 ' + FONT + ';padding:0 10px;cursor:pointer;}'
        + '#gps-overlay .gps-clubs-foot{display:flex;gap:8px;justify-content:space-between;}'
        + '#gps-overlay .gps-clubs .gps-club-skip{background:#d9f99d;color:#0b0f0c;border-color:#d9f99d;}'
        + '#gps-overlay .gps-suggest{font:800 14px/1.2 ' + FONT + ';color:#d9f99d;padding:7px 11px;border-radius:12px;white-space:nowrap;}'
        + '#gps-overlay .gps-bagask{position:absolute;z-index:45;left:8px;right:8px;bottom:calc(var(--gps-attrib-h) + 72px);padding:8px 10px;border-radius:14px;font:700 14px/1.2 ' + FONT + ';}'
        + '#gps-overlay .gps-bagask-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}'
        + '#gps-overlay .gps-bagask-row{display:flex;gap:6px;overflow-x:auto;padding-top:6px;touch-action:pan-x;}'
        + '#gps-overlay .gps-bagask button{flex:0 0 auto;min-height:44px;min-width:46px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:800 15px/1 ' + FONT + ';padding:0 10px;}'
        + '#gps-overlay .gps-bagask .gps-bagask-skip{min-width:0;background:transparent;border:0;color:#c8d1ca;font-size:14px;}'
        + '#gps-overlay .gps-bag{position:absolute;z-index:48;left:0;right:0;bottom:0;margin:0 auto;max-width:520px;max-height:80%;overflow:auto;border-radius:18px 18px 0 0;padding:12px 16px calc(14px + env(safe-area-inset-bottom));box-sizing:border-box;font-family:' + FONT + ';touch-action:pan-y;}'
        + '#gps-overlay .gps-bag-head{display:flex;align-items:center;justify-content:space-between;}#gps-overlay .gps-bag-title{font:800 17px/1.15 ' + FONT + ';}'
        + '#gps-overlay .gps-bag-sub{font:600 12px/1.3 ' + FONT + ';color:#c8d1ca;margin:4px 0 6px;}'
        + '#gps-overlay .gps-bag-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid rgba(255,255,255,.08);}'
        + '#gps-overlay .gps-bag-name{flex:1 1 auto;font:700 15px/1.2 ' + FONT + ';}#gps-overlay .gps-bag-meta{flex:0 0 76px;font:600 11px/1.2 ' + FONT + ';color:#a7b3aa;}'
        + '#gps-overlay .gps-bag-yd{width:64px;min-height:40px;box-sizing:border-box;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:800 16px/1 ' + FONT + ';text-align:center;}'
        + '#gps-overlay .gps-bag-reset{min-height:40px;padding:0 8px;color:#fca5a5 !important;font-weight:700;}'
        + '#gps-overlay .gps-bag-done{min-height:44px;border-radius:12px;background:#d9f99d !important;color:#0b0f0c !important;font:800 15px/1 ' + FONT + ' !important;padding:0 16px !important;}'
        + '#gps-overlay .gps-bag-resetall{display:block;margin:10px auto 0;min-height:44px;padding:0 16px;color:#fca5a5 !important;font-weight:800;}'
        + '#gps-overlay .gps-tools-menu{position:absolute;z-index:9;right:8px;bottom:calc(var(--gps-attrib-h) + 70px);display:flex;flex-direction:column;min-width:210px;padding:6px;}'
        + '#gps-overlay .gps-menu-item{text-align:left;padding:12px 12px;min-height:44px;border-radius:10px;font-weight:700;font-size:15px;}'
        + '#gps-overlay .gps-menu-item + .gps-menu-item{border-top:1px solid rgba(255,255,255,.08);}'
        + '#gps-overlay .gps-picker{position:absolute;inset:0;z-index:20;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;padding-top:calc(env(safe-area-inset-top) + 70px);}'
        + '#gps-overlay .gps-picker-card{width:calc(100% - 24px);max-width:420px;padding:12px;}'
        + '#gps-overlay .gps-picker-title{font-weight:800;font-size:15px;color:#d9f99d;margin:2px 4px 10px;}'
        + '#gps-overlay .gps-picker-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;}'
        + '#gps-overlay .gps-picker-grid button{min-height:44px;border-radius:10px;background:rgba(255,255,255,.08);font-weight:800;font-size:16px;}'
        + '#gps-overlay .gps-picker-grid button.gps-here{background:#d9f99d;color:#0b0f0c;}'
        // ATTRIBUTION: always on the map, full width at the very bottom.
        // CREDITS (declutter item 7, 2026-10-08): no white block. One small line at
        // the bottom-left under the Card / Enter Score row - "Powered by Esri · ⓘ"
        // - and ⓘ opens every credit line (Esri's sources, USGS when it shows, ©
        // OpenStreetMap contributors). MapLibre's own control keeps the lines up to
        // date for whichever sources are on the map; it is the popup's source.
        + '#gps-overlay .maplibregl-ctrl-bottom-right{display:none !important;}'
        + '#gps-overlay .gps-credit{position:absolute;z-index:6;left:12px;bottom:calc(env(safe-area-inset-bottom) + 3px);display:flex;align-items:center;gap:4px;'
        +   'font:600 10.5px/1.2 ' + FONT + ';color:#f4f4ef;text-shadow:0 0 2px #000,0 0 4px #000;white-space:nowrap;}'
        // The Google logo: 18px high (Google: 16-19dp), clear space 10px around it
        // (5px below), never covered: the bottom row sits 10px above it.
        + '#gps-overlay .gps-google-logo{height:18px;width:auto;margin:0 10px 0 0;flex:0 0 auto;}'
        + '#gps-overlay.gps-credit-google .gps-credit{bottom:calc(env(safe-area-inset-bottom) + 5px);left:10px;right:10px;white-space:normal;}'
        + '#gps-overlay.gps-credit-google .gps-credit-txt{flex:1 1 auto;min-width:0;}'
        + '#gps-overlay .gps-credit-i{font-size:13px;line-height:1;padding:2px 4px;min-height:22px;color:#f4f4ef;text-shadow:inherit;}'
        + '#gps-overlay .gps-credit-pop{position:absolute;z-index:40;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom) + 26px);padding:10px 12px;font-size:12px;line-height:1.45;color:#f4f4ef;}'
        + '#gps-overlay .gps-credit-pop a{color:#d9f99d;}'
        + '#gps-overlay .gps-pop-info{margin-top:6px;font-size:10.5px;color:#c8d1ca;}'
        + '#gps-overlay .gps-pop-info:empty{display:none;}'
        + '#gps-overlay .gps-tiles-note{position:absolute;bottom:calc(var(--gps-attrib-h) + 130px);left:8px;right:8px;z-index:4;text-align:center;font-size:13px;color:#d1d5db;text-shadow:0 0 3px #000;}'
        // MAP OVERLAYS: pills, arc labels, green labels, the flag
        + '#gps-overlay .gps-pill{position:absolute;z-index:2;pointer-events:none;background:rgba(11,15,12,.86);color:#fff;font:800 13px/1 ' + FONT + ';padding:4px 8px;border-radius:999px;white-space:nowrap;font-variant-numeric:tabular-nums;}'
        // BUILD 3: the two numbers on the lines - big, bold, white, a dark outline, no box.
        // BUILD 5: about 1.5x build 3's 26 px, as asked: 44 px, bold white, outlined.
        + '#gps-overlay .gps-pill-to,#gps-overlay .gps-pill-on{background:transparent;border:0;padding:0;color:#ffffff;font:900 44px/1 ' + FONT + ';letter-spacing:-.01em;'
        +   'text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,0 -2px 0 #000,0 2px 0 #000,-2px 0 0 #000,2px 0 0 #000,0 0 8px rgba(0,0,0,.6);}'
        + '#gps-overlay .gps-arc-labels{position:absolute;inset:0;pointer-events:none;z-index:2;}'
        + '#gps-overlay .gps-arc-lbl{position:absolute;font:700 10px/1 ' + FONT + ';color:#fff;text-shadow:0 0 2px #000,0 0 3px #000;white-space:nowrap;}'
        + '#gps-overlay .gps-arc-lbl-pin{color:#ffffff;}'
        + '#gps-overlay .gps-green-lbls{position:absolute;inset:0;pointer-events:none;z-index:2;}'
        // BUILD 7: the F / C / B number pills about 25% bigger (12 -> 15 px).
        + '#gps-overlay .gps-green-lbl{position:absolute;background:rgba(11,15,12,.86);color:#fff;font:800 15px/1 ' + FONT + ';padding:4px 8px;border-radius:999px;white-space:nowrap;font-variant-numeric:tabular-nums;}'
        + '#gps-overlay .gps-green-lbl-p{color:#fca5a5;border:1px solid rgba(239,68,68,.7);}'
        + '#gps-overlay .gps-btn.gps-off{opacity:.45;}'
        + '#gps-overlay .gps-tap-fallback{flex:1 1 100%;min-height:32px;color:#c8d1ca;text-decoration:underline;font-size:13px;font-weight:600;}'
        // NO PULL-DOWN while GPS shows: nothing on the page scrolls, refreshes or bounces.
        + 'html.gps-lock,html.gps-lock body{overscroll-behavior:none;overflow:hidden;}'
        + '#gps-overlay{overscroll-behavior:none;touch-action:none;}'
        + '#gps-overlay .gps-map,#gps-overlay .gps-map-wrap{touch-action:none;}'
        + '.gps-dot{width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4);}'
        + '.gps-pin-tee{background:#93c5fd;}'
        // MapLibre centers a marker on its ELEMENT's box, so every marker element
        // has an explicit size (an unsized one drew the crosshair 24px down and
        // right of its point - measured in the first MapLibre screenshot).
        // BUILD 7: F / C / B about 25% bigger (16 -> 20 px), still compact.
        + '.gps-pin{width:20px;height:20px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:50%;border:2px solid #111;font:800 11px/1 sans-serif;color:#111;}'
        + '.gps-pin-mid{background:#ffffff;}.gps-pin-front{background:#bef264;}.gps-pin-back{background:#fca5a5;}'
        + '.gps-pin-draft{outline:3px solid #ffffff;}'
        // The target: a touch area of at least 48px, the ring drawn at its real
        // size on the ground (sizeTarget), a crosshair through it, its width beside it.
        + '.gps-target{width:48px;height:48px;position:relative;background:transparent;cursor:grab;touch-action:none;}'
        + '.gps-target .gps-ring{position:absolute;left:50%;top:50%;width:28px;height:28px;transform:translate(-50%,-50%);box-sizing:border-box;'
        // BUILD 5: two thin white rings (outer = the true 20 yds) and the width line, each with a faint dark edge.
        +   'border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.3),inset 0 0 0 1px rgba(0,0,0,.22);}'
        + '.gps-target .gps-ring-in{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);box-sizing:border-box;border:1.5px solid #ffffff;border-radius:50%;'
        +   'box-shadow:0 0 0 1px rgba(0,0,0,.22),inset 0 0 0 1px rgba(0,0,0,.18);pointer-events:none;}'
        // BUILD 7: a small solid dot at the target's exact center, about the size of
        // the F / C / B markers - white, a thin dark edge - in every view.
        + '.gps-target .gps-ring-dot{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;'
        +   'background:#ffffff;border:1.5px solid rgba(11,15,12,.85);box-sizing:border-box;box-shadow:0 0 0 1px rgba(255,255,255,.35);pointer-events:none;z-index:2;}'
        + '.gps-target .gps-ring-line{position:absolute;left:50%;top:50%;height:2px;background:#ffffff;transform:translate(-50%,-50%);'
        +   'box-shadow:0 0 0 1px rgba(0,0,0,.3);pointer-events:none;}'
        + '.gps-target .gps-ring-lbl{position:absolute;top:50%;transform:translateY(-50%);pointer-events:none;background:rgba(11,15,12,.78);color:#ffffff;'
        +   'font:700 10px/1 ' + FONT + ';padding:2px 5px;border-radius:999px;white-space:nowrap;}'
        // NO GPS MAP (paid launch): a round mounted without the entitlement never shows
        // the GPS side at all - no map, no yardage (the gate keeps it on the card).
        + '#gps-overlay.gps-locked{display:none !important;}';
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
        tg.setAttribute('aria-label', 'Open GPS');
        // On the card: one button to the map. On the map, the Scorecard button
        // (bottom-left) is the way back - one tap either way.
        tg.innerHTML = '<button type="button" class="gps-side-gps" aria-pressed="false">📍 GPS</button>';
        document.body.appendChild(tg);
        document.body.classList.add('has-gps-toggle');

        S = {
            el: el, toggle: tg, side: 'bets',
            hole: Number(opts.hole), par: opts.par, courseKey: String(opts.courseKey),
            round: opts.round || null, db: opts.db || null, canFix: !!opts.canFix, eventCode: String(opts.eventCode || ''),
            writeRoundPin: opts.writeRoundPin || null, stepHole: opts.stepHole || null,
            openScore: opts.openScore || null,
            holeMeta: opts.holeMeta || null, holeList: opts.holeList || null, gotoHole: opts.gotoHole || null,
            mode: 'measure', target: null, targetMoved: false, draft: null, localPins: {},
            geoError: null, framed: null, mapRequested: false, windKick: true, windPan: 0, loadingCourses: !window.HardPanGpsCourses,
            // Decided once per round, by the one check (hasGpsPro).
            pro: hasGpsPro()
        };
        el.classList.toggle('gps-locked', !S.pro);

        // The golfer's own choice of side: remembered, and the landing leaves it be.
        on(tg, '.gps-side-gps', function () {
            S.userChoseSide = true;
            // No GPS Map: the gate (the paywall) at once - nothing to load first.
            if (!S.pro && !hasGpsPro()) { showSide('gps'); return; }
            // BUILD 5: no data AND no course location -> no map of the golfer's
            // street: a short note on the Card side instead.
            var done = false;
            var open = function () {
                if (!S || done) return;
                done = true;
                // Only when the course data HAS loaded and says nothing, and there is no
                // course location either. Anything unknown: open the map, as before.
                if (window.HardPanGpsCourses && !courseHasAnyData() && !courseCenter()) { cardNote('No GPS map for this course yet - its location is not in the course list.'); return; }
                showSide('gps');
            };
            // The bundled courses load on first use: read them first. Only a course
            // with no data waits (briefly) for its location. Never more than 3 s.
            setTimeout(open, 3000);
            loadCourses(function () {
                if (!S) return;
                S.loadingCourses = false;
                if (S.locPending && !courseHasAnyData()) setTimeout(open, 1500); else open();
            });
        });
        on(el, '.gps-side-bets', function () { S.userChoseSide = true; showSide('bets'); });
        on(el, '.gps-back', function () { S.userChoseSide = true; showSide('bets'); });
        var ci = el.querySelector('.gps-credit-i');
        if (ci) ci.addEventListener('click', function (e) { e.preventDefault(); toggleCredits(e); });
        // Tap anywhere (the map included) closes the credits.
        el.addEventListener('pointerdown', function (e) { if (!e.target.closest || !e.target.closest('.gps-credit-i')) closeCredits(); }, true);
        on(el, '.gps-verify', function () { var v = S && S.el.querySelector('.gps-verify'); if (v) v.classList.toggle('gps-open'); });
        on(el, '.gps-hole-btn', openPicker);
        on(el, '.gps-tools', toggleTools);
        on(el, '.gps-score-next', function () { closeMenus(); if (S && S.stepHole) S.stepHole(1); });
        on(el, '.gps-score-prev', function () { closeMenus(); if (S && S.stepHole) S.stepHole(-1); });
        // Any Tools item closes the menu once it has done its job.
        var tmenu = el.querySelector('.gps-tools-menu');
        if (tmenu) tmenu.addEventListener('click', function () { closeMenus(); });
        var pk = el.querySelector('.gps-picker');
        if (pk) pk.addEventListener('click', function (e) {
            var b = e.target && e.target.closest ? e.target.closest('button[data-hole]') : null;
            if (b) pickHole(Number(b.getAttribute('data-hole'))); else if (e.target === pk) closeMenus();
        });
        on(el, '.gps-prev', function () { if (S && S.stepHole) S.stepHole(-1); });
        on(el, '.gps-next', function () { if (S && S.stepHole) S.stepHole(1); });
        on(el, '.gps-units', function () { setUnits(units() === 'm' ? 'yd' : 'm'); render(); });
        on(el, '.gps-tourney-toggle', function () {
            if (tourneyRound()) { flash('Tournament mode is on for this round - only the organizer can turn it off (Round Setup)'); return; }
            try { if (tourneyPhone()) localStorage.removeItem(TOURNEY_KEY); else localStorage.setItem(TOURNEY_KEY, '1'); } catch (e) {}
            closeMenus(); S.windKick = true; render();
        });
        // AUTO-ADVANCE (008): the switch off = no toggle, no toast, no jump (removed, not hidden).
        if (!aaSwitch()) Array.prototype.forEach.call(el.querySelectorAll('[data-feature="autoAdvance"]'), function (n) { n.parentNode.removeChild(n); });
        on(el, '.gps-aa-undo', function () { if (S) aaUndo(); });
        on(el, '.gps-aa-toggle', function () {
            if (!S) return;
            try { if (aaOn()) localStorage.setItem(AA_KEY, '0'); else localStorage.removeItem(AA_KEY); } catch (e) {}
            S.aaDwell = null;
            aaToggleText();
            flash(aaOn() ? 'Auto-advance holes is on' : 'Auto-advance holes is off');
        });
        on(el, '.gps-refresh-gps', function () {
            if (!S) return;
            closeMenus();
            if (typeof navigator !== 'undefined' && navigator.onLine === false) { flash('No signal - Refresh GPS data needs a connection'); return; }
            if (!osmOn()) {
                var L = window.HardPanGpsLive, mine = S;
                if (!liveOn() || !L) { flash('No GPS data for this course - Tools \u203A Set the green'); return; }
                L.ensure(S.courseKey).then(function (got) {
                    if (S !== mine) return;
                    S.gaCache = null; S.needsFrame = true; render();
                    flash(got && osmRecord(S.courseKey) ? 'GPS data is up to date' : 'No GPS data for this course - Tools \u203A Set the green');
                });
                return;
            }
            flash('Checking OpenStreetMap\u2026');
            recheckCourse(true, function (r) {
                if (!r) { flash('Could not check - no course location'); return; }
                if (r.rechecked === 'better') flash('GPS data updated: ' + r.n + '/' + r.of + ' holes');
                else if (r.rechecked === 'newer') flash('GPS data refreshed: ' + r.n + '/' + r.of + ' holes');
                else flash('Kept the GPS data on this phone (' + r.n + '/' + r.of + ' holes)' + (r.why ? ' - ' + r.why : ''));
            });
        });
        on(el, '.gps-mark-shots', function () {
            if (!S) return;
            closeMenus();
            withShots(function () { stopReplayTimer(); S.replay = false; S.shotMode = true; render(); });
        });
        // ➕ ADD A GAME (gps-doors): GPS-4 in the app; Round Setup for THIS round on the web.
        on(el, '.gps-add-game', function () { if (!S) return; closeMenus(); if (doorsOn()) openAddGame(); else window.location.href = 'admin.html?game=' + encodeURIComponent(S.eventCode); });
        on(el, '.gps-door-add', function () { openAddGame(); });
        on(el, '.gps-pick-course', function () { closeMenus(); window.location.href = 'home.html#pick'; });
        // "Games" IN A ROUND STAYS IN THE ROUND (Manny, 2026-10-16): the card side with this round's
        // games in view, or - no games yet - this round's own Add a game. Never the course picker;
        // Home's Games only when no round is open. The hole, the golfer pick and GPS stay (no reload).
        on(el, '.gps-door-games', function () {
            if (!S || !S.eventCode) { window.location.href = 'home.html#games'; return; }
            closeMenus();
            S.userChoseSide = true;
            showSide('bets');
            setTimeout(function () {
                var m = document.getElementById('todays-games-mount'), D = window.HardPanDoors;
                var rd = (typeof currentData !== 'undefined' ? currentData : null) || S.round;   /* global currentData */
                var has = D && typeof D.hasGames === 'function' ? D.hasGames(rd) : !!(m && m.textContent.replace(/\s+/g, ''));
                if (has) { try { m.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { m.scrollIntoView(); } }
                else if (window.HardPanDoors && typeof window.HardPanDoors.openAddGame === 'function') window.HardPanDoors.openAddGame();
            }, 60);
        });
        on(el, '.gps-ag-back', function () { closeAddGame(); });
        on(el, '.gps-ag-not', function () { closeAddGame(); });
        el.addEventListener('click', function (ev) {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-ag-tpl],[data-ag-go]') : null;
            if (!b || !S) return;
            var base = 'admin.html?game=' + encodeURIComponent(S.eventCode);
            var tpl = b.getAttribute('data-ag-tpl'), go = b.getAttribute('data-ag-go');
            // Too few golfers for the game: Players first (URGENT-001), then the game.
            var D = window.HardPanDoors;
            if (tpl && D && typeof D.playersFirst === 'function' && D.playersFirst(tpl, { url: base + '&tpl=' + tpl })) return;
            window.location.href = tpl ? base + '&tpl=' + tpl : go === 'paste' ? base + '&paste=1' : base;
        });
        on(el, '.gps-replay', function () {
            if (!S) return;
            closeMenus();
            withShots(function (A) {
                S.shotMode = false; S.replay = true;
                var hs = A.holesWithShots(S.eventCode);
                if (hs.length && hs.indexOf(Number(S.hole)) === -1 && typeof S.gotoHole === 'function') S.gotoHole(hs[0]);
                render();
                if (!hs.length) flash('No shots marked in this round yet - Tools \u203A Mark shots');
            });
        });
        // ONE TAP (gps-features): 📍 Mark shot on the GPS screen, then the club (skippable).
        on(el, '.gps-mark-shot', function () { closeMenus(); markShotHere(); });
        on(el, '.gps-club-skip', function () { closeClubSheet(); });
        on(el, '.gps-club-move', function () { if (!S) return; closeClubSheet(); S.shotAdjust = true; flash('Tap the map where the ball is'); render(); });
        on(el, '.gps-sb-here', function () { if (S && fix) addShot(fix.pt, 'here'); });
        on(el, '.gps-sb-undo', function () { var A = shotsApi(); if (S && A) { A.undo(S.eventCode, S.hole); render(); } });
        on(el, '.gps-sb-prev', function () { stopReplayTimer(); replayStep(-1); render(); });
        on(el, '.gps-sb-play', function () {
            if (!S) return;
            if (S.replayTimer) { stopReplayTimer(); render(); return; }
            S.replayTimer = setInterval(function () { if (!S || !S.replay || !replayStep(1)) { stopReplayTimer(); if (S) render(); } }, 3500);
            render();
        });
        on(el, '.gps-sb-done', function () { if (!S) return; stopReplayTimer(); S.shotMode = false; S.replay = false; S.shotAdjust = false; render(); });
        // MY STATS (gps-features): putts, fairway, GIR for this hole; the round and the
        // season - on this phone only (gps-stats.js).
        on(el, '.gps-my-stats', function () {
            if (!S) return;
            closeMenus();
            loadScript('gps-stats.js', function () { return !!window.HardPanGpsStats; }, function () {
                if (window.HardPanGpsStats && S) window.HardPanGpsStats.open(statsCtx());
            });
        });
        on(el, '.gps-rechoose', function () {
            if (!S || !window.HardPanGpsMatch) return;
            closeMenus();
            window.HardPanGpsMatch.forget(S.courseKey);
            S.osmShared = null;
            lookupCourse();
        });
        // MY BAG (008): the switch off = no question, no suggestion, no My bag (removed, not hidden).
        if (!bagSwitch()) Array.prototype.forEach.call(el.querySelectorAll('[data-feature="clubs"]'), function (n) { n.parentNode.removeChild(n); });
        on(el, '.gps-my-bag', openBag);
        on(el, '.gps-bag-done', function () { closeBag(); render(); });
        on(el, '.gps-bagask-skip', bagSkip);
        var bagRow = el.querySelector('.gps-bagask-row');
        if (bagRow) bagRow.addEventListener('click', function (e) { var b = e.target && e.target.closest ? e.target.closest('[data-bag-club]') : null; if (b) { e.preventDefault(); bagPick(b.getAttribute('data-bag-club')); } });
        var bagEl = el.querySelector('.gps-bag');
        if (bagEl) {
            bagEl.addEventListener('change', function (e) {
                var c = e.target && e.target.getAttribute && e.target.getAttribute('data-bag-edit'), B = bagApi();
                if (!c || !B || !S) return;
                var v = Number(e.target.value);
                B.set(bagGolfer(), c, v > 0 ? (units() === 'm' ? v / G.M_PER_YD : v) : null);
                fillBag(); render();
            });
            bagEl.addEventListener('click', function (e) {
                var t = e.target, B = bagApi();
                if (!B || !S || !t || !t.closest) return;
                var r1 = t.closest('[data-bag-reset]');
                if (r1) { B.reset(bagGolfer(), r1.getAttribute('data-bag-reset')); fillBag(); render(); return; }
                if (t.closest('.gps-bag-resetall')) { B.resetAll(bagGolfer()); fillBag(); render(); }
            });
        }
        // RECENTER: back to the hole's own view - tee at the bottom, green at the top.
        // Recenter also puts the target back at its default (build 6).
        on(el, '.gps-recenter', function () { if (S) { S.targetMoved = false; S.target = null; } frameHole(false); render(); });
        on(el, '.gps-zoom', cycleZoom);
        // PREVIEW (008): the switch off = no button (removed, not hidden). Any touch stops a flight.
        if (!flySwitch()) Array.prototype.forEach.call(el.querySelectorAll('[data-feature="flyover"]'), function (n) { n.parentNode.removeChild(n); });
        on(el, '.gps-fly-btn', startFlyover);
        ['pointerdown', 'touchstart', 'wheel'].forEach(function (ev) { el.addEventListener(ev, function () { if (S && S.flying) endFlyover('cancelled'); }, { capture: true, passive: true }); });
        on(el, '.gps-green-view', toggleGreenView);
        // HAZARDS (008): the switch off = no button, no sheet (removed, not hidden).
        if (!hzSwitch()) Array.prototype.forEach.call(el.querySelectorAll('[data-feature="hazards"]'), function (n) { n.parentNode.removeChild(n); });
        on(el, '.gps-hz-btn', function () { if (!S) return; if (hzOpen()) closeHazards(); else openHazards(); });
        on(el, '.gps-hzs-done', closeHazards);
        on(el, '.gps-wind', function () { if (!S) return; if (windSheetOpen()) closeWindSheet(); else openWindSheet(); });
        var wsheet = el.querySelector('.gps-wind-sheet');
        if (wsheet) { wsheet.addEventListener('click', windSheetClick); bindDial(wsheet); }
        on(el, '.gps-score', function () {
            if (!S || (S.swipedAt && Date.now() - S.swipedAt < 450)) return;
            var w = scoreFor();
            if (typeof S.openScore === 'function' && !readOnlyHere()) S.openScore(S.hole, w ? w.id : null);
        });
        on(el, '.gps-who', function () { if (S && !(S.swipedAt && Date.now() - S.swipedAt < 450)) openWho(false); });
        var whoSheet = el.querySelector('.gps-who-sheet');
        if (whoSheet) whoSheet.addEventListener('click', function (ev) {
            var t = ev.target, b;
            var sh = S && S.el.querySelector('.gps-who-sheet');
            if (!sh) return;
            if ((b = t.closest('[data-who-group]'))) { openWho(sh.getAttribute('data-who-first') === '1', Number(b.getAttribute('data-who-group'))); return; }
            if ((b = t.closest('[data-who-id]'))) { closeWho(); setPick(b.getAttribute('data-who-id')); return; }
            if (t.closest('.gps-who-skip')) {
                var d = roundData(), g = Number(sh.getAttribute('data-who-g')) || lockedG() || (d ? groupsOf(d)[0] : 1), f = d ? inGroup(d, g)[0] : null;
                closeWho(); if (f) setPick(f.id); return;
            }
            if (t === sh) closeWho();
        });
        // SWIPE the score left / right: the next / previous golfer (a quick slide).
        (function () {
            var col = el.querySelector('.gps-score-col'), x0 = null, y0 = null;
            if (!col) return;
            col.addEventListener('pointerdown', function (e) { x0 = e.clientX; y0 = e.clientY; });
            col.addEventListener('pointerup', function (e) {
                if (x0 == null) return;
                var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
                if (Math.abs(dx) < 40 || Math.abs(dy) > 30) return;
                if (S) S.swipedAt = Date.now();
                flipGolfer(dx < 0 ? 1 : -1);
            });
            col.addEventListener('pointercancel', function () { x0 = null; });
        })();
        window.addEventListener('offline', onOffline);
        window.addEventListener('online', onOnline);
        document.addEventListener('touchmove', blockPull, { passive: false });
        // Set / fix the green: by GPS first; the photo-tap way is the fallback link.
        on(el, '.gps-set-green', function () { S.mode = 'gpsMid'; S.draft = null; render(); });
        on(el, '.gps-fix-green', function () { S.mode = 'gpsMid'; S.draft = null; render(); });
        on(el, '.gps-tap-fallback', function () { S.mode = 'setMid'; S.draft = null; render(); });
        // "Set": the spot the golfer is STANDING on becomes the green's center /
        // front / back - their deliberate choice, made with the button, and the
        // only time a position goes into a green (see PRIVACY above).
        on(el, '.gps-gps-set', function () {
            if (!S || !canSetHere()) return;
            var here = [fix.pt[0], fix.pt[1]];
            if (S.mode === 'gpsMid') { S.draft = { mid: here, gps: true }; S.mode = 'gpsConfirmMid'; }
            else if (S.mode === 'gpsFront') { S.draft.front = here; S.mode = 'gpsBack'; }
            else if (S.mode === 'gpsBack') { S.draft.back = here; S.mode = 'gpsConfirmAll'; }
            render();
        });
        on(el, '.gps-addedges', function () { S.mode = (S.mode === 'gpsConfirmMid') ? 'gpsFront' : 'setFront'; render(); });
        on(el, '.gps-skip', function () {
            S.mode = { setFront: 'setBack', setBack: 'confirmAll', gpsFront: 'gpsBack', gpsBack: 'gpsConfirmAll' }[S.mode] || S.mode;
            render();
        });
        on(el, '.gps-cancel', function () { S.mode = 'measure'; S.draft = null; render(); });
        on(el, '.gps-save', function () {
            if (!S.draft || !S.draft.mid) return;
            var r = resolved();
            var previous = (r && r.source === 'pin') ? r.pin : (r && r.mid ? { mid: r.mid, at: 0 } : null);
            savePin(G.makePin(S.draft.mid, S.draft.front, S.draft.back, previous, Date.now(), S.canFix && previous ? 'organizer' : (S.draft.gps ? 'gps' : 'tap')));
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
        loadCourseLocation();
        // THE APP'S FRONT DOOR (gps-doors): Score and + Game at the bottom, Games at the top.
        if (doorsOn()) {
            var dPick = el.querySelector('.gps-pick-course'); if (dPick) dPick.style.display = doorsOn() ? '' : 'none';
            var dAdd = el.querySelector('.gps-door-add'), dGames = el.querySelector('.gps-door-games'), cap = el.querySelector('.gps-side-bets .gps-cap');
            if (dAdd) dAdd.style.display = '';
            if (dGames) dGames.style.display = '';
            if (cap) cap.textContent = 'Score';
        }
        // After the card has drawn (mount runs inside its render), and never able
        // to throw into it.
        setTimeout(function () { try { land(); } catch (e) {} }, 0);
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
            limitToCourse();
            frameHole(false);
            render();
        });
        // NO GPS MAP: never shown (the gate), and MapLibre is never loaded, so no
        // tile, Esri or USGS request can happen.
        if (!S.pro) return;
        loadMapLibre(function () { if (S === mine) { buildMap(); render(); } });
    }

    // THE LANDING (gps-flow, 2026-10-09): a round that starts or is reopened
    // opens on GPS, for the hole the card is on - unless this phone last LEFT
    // ON THE CARD (remembered), location is denied, or the hole has no GPS data
    // (no green and no tee): then the scorecard, as before GPS.
    function land() {
        if (!S) return;
        if (!S.pro) {
            if (hasGpsPro()) becomePro();
            // The store's first answer is on its way: land once it is here (once).
            else if (proPending() && !S.landWaited) {
                var m0 = S;
                S.landWaited = true;
                entitlement().whenKnown(function () { if (S === m0) land(); }, PENDING_MS);
                return;
            }
        }
        // NO GPS MAP: the round stays on the card. Only a round this phone LEFT ON GPS
        // (Resume) shows the paywall - once a session; a round joined or opened fresh
        // (a game link, a spectator) never does.
        if (!S.pro) { if (storedSide() === 'gps' && !sheetSeen()) showSide('gps'); return; }
        if (storedSide() === 'bets') return;
        // THE GAMES FRONT DOOR (gps-doors): the round opens on the card, and location is
        // not asked for until the golfer taps 📍 GPS (or this round was left on GPS).
        if (frontDoor() === 'games' && storedSide() !== 'gps') return;
        var mine = S;
        locationDenied(function (denied) {
            if (S !== mine || denied || S.userChoseSide) return;
            loadCourses(function () {
                if (S !== mine || S.userChoseSide || S.side === 'gps') return;
                S.loadingCourses = false;
                // BUILD 5: NO DATA = NO GPS LANDING. A course with nothing bundled is
                // looked up first (its location, then OpenStreetMap); still nothing
                // for this hole -> the round stays on the Card.
                var go = function () {
                    if (S !== mine || S.userChoseSide || S.side === 'gps') return;
                    if (!holeHasData(S.hole)) return;
                    S.autoLanded = true;
                    showSide('gps');
                };
                if (holeHasData(S.hole)) { go(); return; }
                loadCourseLocation(function () { lookupCourse(function () { go(); }); });
            });
        });
    }
    function cardNote(text) {
        if (!S) return;
        var n = S.toggle.querySelector('.gps-side-note');
        if (!n) { n = document.createElement('div'); n.className = 'gps-side-note'; n.setAttribute('role', 'status'); S.toggle.appendChild(n); }
        n.textContent = text;
        n.style.display = '';
        clearTimeout(S.noteTimer);
        S.noteTimer = setTimeout(function () { if (n) n.style.display = 'none'; }, 5000);
    }
    function locationDenied(done) {
        try {
            if (navigator.permissions && typeof navigator.permissions.query === 'function') {
                navigator.permissions.query({ name: 'geolocation' }).then(function (st) { done(!!st && st.state === 'denied'); }, function () { done(false); });
                return;
            }
        } catch (e) {}
        done(false);
    }

    var IPAD_NO_GPS_M = 100;   // a fix worse than this on an iPad is Wi-Fi, not GPS
    var IPAD_NO_GPS = 'GPS needs a phone (or a cellular iPad) with location \u2014 this iPad can\u2019t place you on the course. Scores, games and the card all work here.';
    function isIpad() {
        try {
            var n = navigator;
            return /iPad/.test(String(n.userAgent || '')) || (/Macintosh/.test(String(n.userAgent || '')) && (n.maxTouchPoints || 0) > 1);
        } catch (e) { return false; }
    }
    // The iPad sentence, or '' (pure apart from the device check; gps_ipad_test.js).
    function ipadNoGps(geoError, f) {
        if (!isIpad() || geoError === 'denied') return '';
        if (geoError === 'unavailable' || geoError === 'timeout' || geoError === 'unsupported') return IPAD_NO_GPS;
        return (f && typeof f.acc === 'number' && f.acc > IPAD_NO_GPS_M) ? IPAD_NO_GPS : '';
    }
    // opts.remember false: a visit to the card that is not the golfer leaving
    // GPS (Enter Score, the KP question) - the next landing is still GPS.
    function showSide(side, opts) {
        if (!S) return false;
        side = side === 'gps' ? 'gps' : 'bets';
        // THE GATE (paid launch): no GPS without GPS Map. Not entitled: the card stays
        // and the paywall asks (a programmatic return - remember: false - just stays).
        if (side === 'gps' && !S.pro) {
            if (hasGpsPro()) becomePro();
            if (!S.pro) {
                var mine = S, o = opts || {}, quiet = o.remember === false;
                requireGps({ quiet: quiet, course: roundCourseName(), coverage: roundCoverage }, function () {
                    if (S !== mine) return;
                    becomePro();
                    if (S.pro) showSide('gps', o);
                }, function () {
                    // Declined ("Not now"): the golfer is on the card, and this round
                    // no longer reopens on GPS.
                    if (S !== mine || quiet) return;
                    if (S.side !== 'bets') showSide('bets');
                    else rememberSide('bets');
                });
                return false;
            }
        }
        S.side = side;
        if (!opts || opts.remember !== false) rememberSide(side);
        document.body.classList.toggle('gps-side-gps', side === 'gps');
        document.documentElement.classList.toggle('gps-lock', side === 'gps');
        var a = S.toggle.querySelector('.gps-side-gps');
        if (a) a.setAttribute('aria-pressed', side === 'gps' ? 'true' : 'false');
        closeMenus();
        if (side === 'gps') {
            S.windKick = true;
            startWindTick();
            ensureMap();
            if (S.map) { try { S.map.resize(); } catch (e) {} if (S.needsFrame) frameHole(false); }
            startWatch();
            render();
        } else {
            // Kept running for IDLE_STOP_MS, so a quick look at Bets and back
            // does not cost a fresh fix; then stopped.
            closeHazards();
            closeWindSheet();
            stopWindTick();
            // A shot replay does not keep turning the CARD's hole under a golfer typing a score.
            stopReplayTimer();
            endFlyover('cancelled');
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
        if (S.flying) endFlyover('cancelled');   // PREVIEW (008): a new hole ends a flight
        S.hole = hole;
        S.par = par;
        S.mode = 'measure'; S.draft = null;
        // A manual wind STAYS for the whole round (Manny, 2026-10-13) - only "Use live wind" clears
        // it. A new hole closes the dial and asks for the live reading again.
        closeWindSheet(); S.windKick = true;
        S.target = null; S.targetMoved = false;
        // Mark shot starts over on a new hole (audit C8): it measured from the last hole's spot.
        S.measureFrom = null; S.measureShot = null;
        // AUTO-ADVANCE (008): a new hole starts any wait over.
        S.aaDwell = null;
        S.framed = null;
        frameHole(false);
        render();
    }

    // The round changed under us (another phone set a pin).
    function roundUpdated(round, opts) {
        if (!S) return;
        S.round = round || null;
        // The organizer's own tools follow the sign-in, which can land after the GPS mounted.
        if (opts && typeof opts.canFix === 'boolean') S.canFix = opts.canFix;
        render();
        // A score saved: the stats' snapshot follows, and an open sheet redraws.
        var St = window.HardPanGpsStats;
        if (St) { try { St.refresh(statsCtx()); if (St.isOpen()) St.open(statsCtx()); } catch (e) {} }
    }
    // What the stats sheet needs: the round's own card (pars), its golfers, this hole.
    function statsCtx() {
        var r = (S && S.round) || {};
        var holes = (r.courseData || []).filter(function (h) { return h && h.hole; }).map(function (h) { return { n: String(h.hole), par: Number(h.par) || 4 }; });
        return { code: S.eventCode, course: r.courseName || '', hole: S.hole, par: Number(S.par) || ((holes.filter(function (h) { return h.n === String(S.hole); })[0] || {}).par) || 4,
            round: r, holes: holes, players: (r.players || []).map(function (p) { return { id: p.id, name: p.name }; }), host: S.el };
    }

    function unmount() {
        stopWatch();
        stopWindTick();
        stopReplayTimer();
        fix = null;
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('offline', onOffline);
        window.removeEventListener('online', onOnline);
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
        // GPS-4 (the app's front door): the Add a game sheet over the map.
        openAddGame: function () { if (S && S.pro && S.side !== 'gps') showSide('gps'); openAddGame(); },
        // THE ONE CHECK for GPS Map (an active trial or subscription).
        hasGpsPro: hasGpsPro,
        // THE GATE (paid launch): requireGps(ctx, go, no) - the Home doors ask it too.
        requireGps: requireGps,
        paywallOpen: paywallOpen,
        // The paywall's words for a store offer, a founding window and a course (pure;
        // gps_paywall_test.js), the founding default, and the course line.
        paywallText: function (o, f, cov) { return sheetText(o, f, cov); },
        foundingFrom: foundingFrom, courseLine: courseLine,
        // The Wi-Fi iPad sentence (gps_ipad_test.js).
        ipadNoGps: ipadNoGps,
        isMounted: function () { return !!S; },
        courseKey: function () { return S ? S.courseKey : null; },
        tournament: function () { return tournament(); },
        hole: function () { return S ? Number(S.hole) : null; },
        side: function () { return S ? S.side : null; },
        isWatching: isWatching,
        // Build 5: does hole n have a green (or tee) to measure to? The card asks
        // before it hands a hole back to GPS.
        holeHasData: function (n) { try { return holeHasData(n); } catch (e) { return false; } },
        TILES: TILES, IDLE_STOP_MS: IDLE_STOP_MS
    };
    if (typeof window !== 'undefined') window.HardPanGps = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
