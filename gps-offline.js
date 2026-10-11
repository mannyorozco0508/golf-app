// ============================================================================
// HARDPAN GPS - OFFLINE COURSE PACKS + ELEVATIONS UP FRONT (gps-features, 2026-10-11)
//
// "Download for offline" on a course puts everything its GPS needs on the phone,
// so a round works with ZERO signal:
//   - its greens / tees / hazards (GolfAPI - gps-live.js keeps them; or bundled);
//   - its scorecard (a copy of the card, for setup with no signal);
//   - the USGS satellite tiles over the course, z13-z16 (the same cache and URLs
//     gps-view.js's own pre-cache uses - Esri's tiles are NEVER stored: their terms);
//   - the HEIGHTS for plays-like: each hole's tee, 25 / 50 / 75 % along, and the
//     green's center (USGS EPQS - free, no key, US only), the very points and the
//     very phone keys gps-view.js reads, so nothing is asked for on the tee.
// prefetchElevations() does the heights alone when a course is picked in setup.
// Course points only - never the golfer's position. Delete removes the tiles and
// heights only this pack uses, and the pack; the course's GPS data stays (small,
// and it is what GPS reads online too).
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var PACK = 'hardpan_offline_v1_';
    // Shared with gps-view.js - gps_offline_test.js holds them equal.
    var USGS_CACHE = 'hardpan-usgs-v1';
    var USGS_URL = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
    var USGS_MIN_Z = 13, USGS_MAX_Z = 16, TILE_CAP = 400, MARGIN_M = 150;
    var PRECACHE_MARK = 'hardpan_usgs_done_v1_';
    var EPQS_URL = 'https://epqs.nationalmap.gov/v1/json?x={lng}&y={lat}&wkid=4326&units=Feet&includeDate=false';
    var ELEV_PREFIX = 'hardpan_elev_v1_';
    var ELEV_T = [0, 0.25, 0.5, 0.75, 1];

    function G() { return W.HardPanGeo; }
    function cfg() { try { return W.HARDPAN_GPS_CONFIG || {}; } catch (e) { return {}; } }
    function lsGet(k) { try { var v = W.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function lsSet(k, v) { try { W.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function lsDel(k) { try { W.localStorage.removeItem(k); } catch (e) {} }
    function offline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }
    function r5(p) { return [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]; }
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    function elevKey(p) { var q = r5(p); return ELEV_PREFIX + q[0] + ',' + q[1]; }
    function epqsUrl(p) { return String(cfg().epqsUrl || EPQS_URL).replace('{lng}', String(p[1])).replace('{lat}', String(p[0])); }
    function tileUrl(t) { return USGS_URL.replace('{z}', t.z).replace('{y}', t.y).replace('{x}', t.x); }
    function inUS(p) {
        var la = p[0], lo = p[1];
        return (la > 24.3 && la < 49.5 && lo > -125 && lo < -66.8) || (la > 51 && la < 71.6 && lo > -170 && lo < -129.9)
            || (la > 18.8 && la < 22.4 && lo > -160.5 && lo < -154.7);
    }

    // THE COURSE'S GPS RECORD, as the GPS screen will read it: GolfAPI (the bundle
    // or gps-live), else - only with OpenStreetMap on - the bundled OSM holes.
    function record(key, name) {
        var g = G();
        if (!g) return null;
        var data = W.HardPanGolfApi;
        if (cfg().golfapi !== false && data && g.golfapiMatch) {
            var m = g.golfapiMatch(data, key, name || '', null, 18, W.HardPanGpsCourses || null);
            if (m) return m.record;
        }
        if (cfg().osm === false) return null;
        var all = W.HardPanGpsCourses || {};
        return g.osmCourse(all, g.bundleKeyFor(all, key, name)) || null;
    }
    function ensureCourse(key) {
        var L = W.HardPanGpsLive;
        return L && L.on() ? L.ensure(key).then(function () { return true; }, function () { return false; }) : Promise.resolve(true);
    }
    // The points gps-view.js asks heights for: per hole, the tee, 25 / 50 / 75 %
    // along the tee -> green line, and the green's center - to 5 decimals.
    function elevPoints(rec) {
        var out = [], seen = {};
        Object.keys((rec && rec.holes) || {}).forEach(function (n) {
            var o = rec.holes[n] && (rec.holes[n].osm || rec.holes[n]);
            if (!o || !o.tee || !o.mid) return;
            ELEV_T.forEach(function (t) {
                var p = r5(t === 0 ? o.tee : (t === 1 ? o.mid : lerp(o.tee, o.mid, t)));
                var k = elevKey(p);
                if (!seen[k]) { seen[k] = 1; out.push(p); }
            });
        });
        return out;
    }
    // Heights not on the phone yet, two at a time; each kept as gps-view keeps it.
    function fetchElevations(points, progress) {
        var todo = points.filter(function (p) { return inUS(p) && lsGet(elevKey(p)) == null; });
        var res = { points: points.length, had: points.length - todo.length, fetched: 0, failed: 0 };
        if (!todo.length || typeof fetch !== 'function') return Promise.resolve(res);
        var i = 0;
        var one = function () {
            if (i >= todo.length) return Promise.resolve();
            var p = todo[i++];
            return fetch(epqsUrl(p), { mode: 'cors', credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('epqs ' + r.status); return r.json(); })
                .then(function (j) {
                    var v = j && j.value != null ? Number(j.value) : NaN;
                    // -1000000 (anything at or below -1000) is the service's "no data".
                    lsSet(elevKey(p), isFinite(v) && v > -1000 ? { ft: Math.round(v * 10) / 10 } : { none: 1 });
                    res.fetched++;
                }, function () { res.failed++; })
                .then(function () { if (progress) progress({ elev: res }); return one(); });
        };
        return Promise.all([one(), one()]).then(function () { return res; });
    }
    function fetchTiles(rec, progress) {
        var g = G();
        var b = g && g.courseBounds(rec, [], MARGIN_M);
        if (!b) return Promise.resolve({ ok: false, reason: 'no-course-data', urls: [] });
        var tiles = g.tilesFor(b, USGS_MIN_Z, USGS_MAX_Z, TILE_CAP);
        if (!tiles) return Promise.resolve({ ok: false, reason: 'too-large', urls: [] });
        var urls = tiles.map(tileUrl);
        if (typeof caches === 'undefined') return Promise.resolve({ ok: false, reason: 'no-tile-storage', urls: [] });
        return caches.open(USGS_CACHE).then(function (cache) {
            var i = 0, res = { ok: true, tiles: urls.length, fetched: 0, had: 0, failed: 0, urls: urls };
            var one = function () {
                if (i >= urls.length) return Promise.resolve();
                var url = urls[i++];
                return cache.match(url).then(function (hit) {
                    if (hit) { res.had++; return null; }
                    return fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (r) {
                        if (r && r.ok && /^image\//.test(r.headers.get('content-type') || '')) { res.fetched++; return cache.put(url, r); }
                        res.failed++;
                        return null;
                    }, function () { res.failed++; });
                }).then(function () { if (progress) progress({ tiles: res }); return one(); });
            };
            return Promise.all([one(), one(), one(), one()]).then(function () { res.ok = res.failed === 0; return res; });
        });
    }

    // ---- THE PACK ------------------------------------------------------------------
    function status(key) {
        var p = key ? lsGet(PACK + key) : null;
        return p && p.v === 1 ? p : null;
    }
    function list() {
        var out = [];
        try {
            for (var i = 0; i < W.localStorage.length; i++) {
                var k = W.localStorage.key(i);
                if (k && k.indexOf(PACK) === 0) { var p = lsGet(k); if (p && p.v === 1) out.push(p); }
            }
        } catch (e) {}
        return out;
    }
    // opts: { name, card (the course record from global_courses), progress(fn) }.
    // Resolves { ok, reason, pack }. Never rejects.
    function download(key, opts) {
        opts = opts || {};
        if (!key) return Promise.resolve({ ok: false, reason: 'no-course' });
        if (offline()) return Promise.resolve({ ok: false, reason: 'offline' });
        return ensureCourse(key).then(function () {
            var rec = record(key, opts.name);
            if (!rec || !rec.holes || !Object.keys(rec.holes).length) return { ok: false, reason: 'nogps' };
            var holes = Object.keys(rec.holes).length;
            return fetchTiles(rec, opts.progress).then(function (t) {
                var pts = elevPoints(rec);
                return fetchElevations(pts, opts.progress).then(function (e) {
                    var card = opts.card && opts.card.name && Array.isArray(opts.card.data) && opts.card.data.length ? opts.card : null;
                    var pack = { v: 1, key: key, name: opts.name || (card && card.name) || key, at: Date.now(), holes: holes,
                        tiles: t.urls || [], tilesOk: !!t.ok, tileWhy: t.ok ? '' : (t.reason || (t.failed + ' tiles failed')),
                        elevPoints: pts.map(elevKey), elevOk: e.failed === 0, elevNone: pts.filter(function (p) { var v = lsGet(elevKey(p)); return v && v.none; }).length,
                        card: card ? { name: card.name, data: card.data, tees: card.tees || null, location: card.location || null } : null,
                        gpsId: (rec.golfapiIds && rec.golfapiIds[0]) || null };
                    if (!lsSet(PACK + key, pack)) return { ok: false, reason: 'storage-full' };
                    if (t.ok) lsSet(PRECACHE_MARK + key, { at: pack.at, n: pack.tiles.length });   // gps-view's pre-cache: already done
                    return { ok: t.ok && e.failed === 0, reason: t.ok ? (e.failed ? 'some-heights-missing' : '') : pack.tileWhy, pack: pack };
                });
            });
        }).catch(function () { return { ok: false, reason: 'error' }; });
    }
    // DELETE: the pack, and the tiles / heights NO OTHER pack uses.
    function remove(key) {
        var p = status(key);
        if (!p) return Promise.resolve(false);
        var keepT = {}, keepE = {};
        list().forEach(function (o) {
            if (o.key === key) return;
            (o.tiles || []).forEach(function (u) { keepT[u] = 1; });
            (o.elevPoints || []).forEach(function (k) { keepE[k] = 1; });
        });
        (p.elevPoints || []).forEach(function (k) { if (!keepE[k]) lsDel(k); });
        lsDel(PACK + key);
        lsDel(PRECACHE_MARK + key);
        var urls = (p.tiles || []).filter(function (u) { return !keepT[u]; });
        if (typeof caches === 'undefined' || !urls.length) return Promise.resolve(true);
        return caches.open(USGS_CACHE).then(function (c) { return Promise.all(urls.map(function (u) { return c.delete(u); })); })
            .then(function () { return true; }, function () { return true; });
    }
    // PLAYS-LIKE HEIGHTS AT SETUP (feature 2): when a course is picked with signal,
    // its heights are fetched once and kept - so nothing is asked for on the tee.
    function prefetchElevations(key, name) {
        if (!key || offline()) return Promise.resolve({ ok: false, reason: offline() ? 'offline' : 'no-course' });
        return ensureCourse(key).then(function () {
            var rec = record(key, name);
            if (!rec) return { ok: false, reason: 'nogps' };
            return fetchElevations(elevPoints(rec)).then(function (e) { return { ok: e.failed === 0, elev: e }; });
        }).catch(function () { return { ok: false, reason: 'error' }; });
    }
    function card(key) { var p = status(key); return p && p.card ? p.card : null; }

    W.HardPanGpsOffline = { status: status, list: list, download: download, remove: remove, prefetchElevations: prefetchElevations,
        card: card, elevPoints: elevPoints, _const: { USGS_CACHE: USGS_CACHE, USGS_URL: USGS_URL, PRECACHE_MARK: PRECACHE_MARK, EPQS_URL: EPQS_URL, ELEV_PREFIX: ELEV_PREFIX, ELEV_T: ELEV_T } };
})();
