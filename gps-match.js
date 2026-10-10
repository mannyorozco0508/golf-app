// ============================================================================
// HARDPAN GPS - LINK A COURSE TO OPENSTREETMAP (2026-10-10)
//
// One matcher, used by the setup page the moment a course is picked (Course &
// Round, step 2) and by the GPS side when it opens. Order:
//   1. the bundle (gps-courses.js) - offline, nothing asked;
//   2. what this phone (or another, via course_gps/<key>/osm) already found;
//   3. ONE OpenStreetMap lookup from the COURSE's own location (never the
//      golfer's): the golf courses near that point, ours by name, then its holes
//      and greens - and gps-geo.pickHoleSet chooses the course's 18 (or 9) when
//      the outline holds more than one course. Unsure: the candidates' hole 1s
//      come back to be shown on a map, and the tap is saved (this phone, and
//      course_gps/<key>/holeChoice best effort) so nobody is asked again.
// The answer is kept on the phone under the keys gps-view.js reads, so GPS then
// opens on it at once, offline too. Nothing here knows about a round.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var OSM_LOOKUP = 'hardpan_osm_v1_', CHOICE = 'hardpan_holechoice_v1_';
    var OVERPASS_URLS = ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter'];
    var RETRY_NONE_MS = 7 * 24 * 3600 * 1000, RETRY_ERR_MS = 3600 * 1000;
    // A FRESH PULL AT PICK TIME (2026-10-10, Manny's final plan). Whenever a course
    // is picked in setup (the saved list or Search online) it is pulled from
    // OpenStreetMap again - unless the same course was pulled in the last hour
    // (repeat taps) or there is no signal. The copy the phone already has (the
    // bundle or a kept lookup) is shown at once; the pull replaces it only when it
    // is NEWER (OSM timestamp) and has AT LEAST as many usable holes - fewer means
    // a bad edit, and the copy stands. GPS opening during the round uses what the
    // pick left: no pull on the tee. The organizer's Tools > Refresh GPS data does
    // the same pull at any time.
    var CHECKED = 'hardpan_osm_v1_checked_', PULL_HOUR_MS = 3600 * 1000;
    var pending = {};   // key -> { raw, course, want } while a hole-1 tap is awaited

    function G() { return W.HardPanGeo; }
    function cfg() { try { return W.HARDPAN_GPS_CONFIG || {}; } catch (e) { return {}; } }
    function lsGet(k) { try { var v = W.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function lsSet(k, v) { try { W.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    function overpass(q) {
        var urls = cfg().overpassUrl ? [String(cfg().overpassUrl)] : OVERPASS_URLS;
        var one = function (i) {
            return fetch(urls[i], { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) })
                .then(function (r) { if (!r.ok) throw new Error('overpass ' + r.status); return r.json(); })
                .catch(function (e) { if (i + 1 < urls.length) return one(i + 1); throw e; });
        };
        return one(0);
    }
    // "Thistle (MacKay / Cameron)", "Streamsong (Red/Blue)": a 27-hole pairing's nines.
    function ninesFromName(name) {
        var m = String(name || '').match(/\(\s*([^()\/]+?)\s*\/\s*([^()\/]+?)\s*\)/);
        return m ? [m[1], m[2]] : null;
    }
    function count(holes, of) {
        var n = 0;
        Object.keys(holes || {}).forEach(function (h) { if (Number(h) <= of) n++; });
        return n;
    }
    function verdict(holes, of, extra) {
        var n = count(holes, of);
        var out = { status: n >= of ? 'ready' : n > 0 ? 'partial' : 'none', n: n, of: of };
        Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });
        return out;
    }
    // What is already known, with no network: the bundle, then a kept lookup.
    function known(key, of, name) {
        var g = G(), all = W.HardPanGpsCourses || {};
        var b = g && g.osmCourse(all, g.bundleKeyFor(all, key, name));
        var l = lsGet(OSM_LOOKUP + key);
        // The newer OpenStreetMap data wins - gps-view's osmRecord rule: a lookup
        // (a re-check after the bundle was built) only when strictly newer.
        var ta = Date.parse((l && l.osmBase) || ''), tb = Date.parse((b && b.osmBase) || '');
        if (b && l && l.holes && isFinite(ta) && isFinite(tb) && ta > tb) b = null;
        if (b && b.holes && Object.keys(b.holes).length) {
            // A 27-hole pairing's record has no date of its own: its nines' (the older).
            var bb = b.osmBase || (all[g.bundleKeyFor(all, key, name)] && (all[g.bundleKeyFor(all, key, name)].compose || []).map(function (k) { return (all[k] || {}).osmBase; }).sort()[0]) || null;
            return verdict(b.holes, of, { source: 'bundle', osmBase: bb });
        }
        if (l && l.holes && Object.keys(l.holes).length) return verdict(l.holes, of, { source: 'lookup', step: l.pick && l.pick.step, how: l.pick && l.pick.how, osmBase: l.osmBase || null });
        return null;
    }
    function keep(key, rec, db) {
        lsSet(OSM_LOOKUP + key, rec);
        if (db && typeof db.ref === 'function') {
            try { var w = db.ref('course_gps/' + key + '/osm').set(rec); if (w && typeof w.then === 'function') w.then(null, function () {}); } catch (e) {}
        }
    }
    function finish(key, opts, p, ph, guard) {
        var holes = G().cleanLookupHoles(G().applyHoleSet(p.raw.elements, ph.set)).holes;
        var base = (p.raw.osm3s && p.raw.osm3s.timestamp_osm_base) || null;
        if (guard && count(holes, p.want.holes) < guard.minN) return verdict(holes, p.want.holes, { source: 'lookup', step: ph.step, how: ph.how, kept: false, why: 'fewer holes than the copy on the phone' });
        if (guard && guard.newerThan && !(Date.parse(base || '') > Date.parse(guard.newerThan))) return verdict(holes, p.want.holes, { source: 'lookup', step: ph.step, how: ph.how, kept: false, why: 'not newer than the copy on the phone' });
        if (!Object.keys(holes).length) { lsSet(OSM_LOOKUP + 'tried_' + key, { at: Date.now(), none: true }); return verdict({}, p.want.holes, { source: 'lookup', step: ph.step, how: ph.how }); }
        var rec = { v: 1, src: 'osm-lookup', osm: p.course.type + '/' + p.course.id, name: (p.course.tags && p.course.tags.name) || '',
                    osmBase: (p.raw.osm3s && p.raw.osm3s.timestamp_osm_base) || null, at: Date.now(), holes: holes,
                    pick: { step: ph.step, how: ph.how, candidates: p.candidates || 0 } };
        keep(key, rec, opts.db);
        lsSet(OSM_LOOKUP + 'tried_' + key, { at: Date.now(), none: false });
        return verdict(holes, p.want.holes, { source: 'lookup', step: ph.step, how: ph.how });
    }
    // opts: { key, name, loc: [lat, lng], holes: 18|9, pars: [], yards: [], db, force,
    //         recheck: 'daily' | true }
    // Resolves { status: 'ready'|'partial'|'ask'|'none', n, of, source, step, how,
    // candidates (ask only), rechecked }. Never rejects.
    function match(opts) {
        var key = opts.key, of = opts.holes === 9 ? 9 : 18;
        var have = !opts.force && known(key, of, opts.name);
        if (have) {
            var last = lsGet(CHECKED + key);
            var due = opts.loc && G() && typeof fetch === 'function'
                && !(typeof navigator !== 'undefined' && navigator.onLine === false)
                && (opts.recheck === true || (opts.recheck === 'pick' && !(last && Date.now() - last.at < PULL_HOUR_MS)));
            if (!due) return Promise.resolve(have);
            lsSet(CHECKED + key, { at: Date.now() });
            return lookup(opts, of, { minN: have.n, newerThan: have.osmBase }).then(function (r) {
                if ((r.status === 'ready' || r.status === 'partial') && r.kept !== false) { r.rechecked = r.n > have.n ? 'better' : 'newer'; return r; }
                var same = {}; Object.keys(have).forEach(function (k) { same[k] = have[k]; });
                same.rechecked = 'kept the copy';
                same.why = r.why || r.how || '';
                return same;
            });
        }
        if (pending[key]) return Promise.resolve({ status: 'ask', n: 0, of: of, candidates: pending[key].candidates, how: pending[key].how });
        if (!G() || typeof fetch !== 'function' || !opts.loc) return Promise.resolve(verdict({}, of, { source: 'none', how: opts.loc ? 'offline' : 'no course location' }));
        var tried = lsGet(OSM_LOOKUP + 'tried_' + key);
        if (!opts.force && !opts.recheck && tried && Date.now() - tried.at < (tried.none ? RETRY_NONE_MS : RETRY_ERR_MS)) return Promise.resolve(verdict({}, of, { source: 'none', how: 'looked up recently, nothing found' }));
        lsSet(CHECKED + key, { at: Date.now() });
        return lookup(opts, of, null);
    }
    // ONE LOOKUP: the courses near the course point, ours by name, its holes and
    // greens, this course's holes picked. guard (a fresh pull over a copy): kept
    // only when newer and with at least as many holes, and a club that would need
    // the hole-1 question is left as it was rather than asked about again.
    function lookup(opts, of, guard) {
        var minN = guard ? 1 : 0;
        var key = opts.key;
        var want = { name: opts.name || '', holes: of, pars: opts.pars || [], yards: opts.yards || [], nines: opts.nines || ninesFromName(opts.name),
                     choice: lsGet(CHOICE + key) || opts.choice || null };
        return overpass(G().golfCoursesQuery(opts.loc)).then(function (j) {
            var course = G().pickGolfCourse(j && j.elements, opts.name || '');
            if (!course) return null;
            return overpass(G().courseHolesQuery(course)).then(function (raw) { return { course: course, raw: raw }; });
        }).then(function (got) {
            if (!got) { if (!minN) lsSet(OSM_LOOKUP + 'tried_' + key, { at: Date.now(), none: true }); return verdict({}, of, { source: 'none', how: 'not in OpenStreetMap near the course' }); }
            var ph = G().pickHoleSet(got.raw.elements, want);
            var p = { raw: got.raw, course: got.course, want: want, candidates: ph.candidates.length, how: ph.how };
            if (!ph.set && ph.step === 5) {
                if (minN) return verdict({}, of, { source: 'none', how: ph.how, kept: false });
                pending[key] = { raw: got.raw, course: got.course, want: want, candidates: ph.candidates, how: ph.how };
                return { status: 'ask', n: 0, of: of, candidates: ph.candidates, how: ph.how, step: 5 };
            }
            if (!ph.set) { if (!minN) lsSet(OSM_LOOKUP + 'tried_' + key, { at: Date.now(), none: true }); return verdict({}, of, { source: 'none', step: 0, how: ph.how }); }
            return finish(key, opts, p, ph, guard);
        }).catch(function () {
            if (!minN) lsSet(OSM_LOOKUP + 'tried_' + key, { at: Date.now(), none: false });
            return verdict({}, of, { source: 'none', how: 'OpenStreetMap could not be reached', kept: false });
        });
    }
    // The golfer tapped a hole 1: keep the choice, finish the lookup from what was fetched.
    function choose(key, id, opts) {
        var p = pending[key];
        lsSet(CHOICE + key, id);
        if (opts && opts.db && typeof opts.db.ref === 'function') {
            try { var w = opts.db.ref('course_gps/' + key + '/holeChoice').set(id); if (w && typeof w.then === 'function') w.then(null, function () {}); } catch (e) {}
        }
        if (!p) return Promise.resolve(null);
        delete pending[key];
        var want = Object.assign({}, p.want, { choice: id });
        var ph = G().pickHoleSet(p.raw.elements, want);
        if (!ph.set) return Promise.resolve(verdict({}, want.holes, { source: 'none', how: ph.how }));
        return Promise.resolve(finish(key, opts || {}, { raw: p.raw, course: p.course, want: want, candidates: p.candidates.length }, ph));
    }
    // The organizer changes it: forget the choice and the kept lookup; the next
    // match asks again.
    function forget(key) {
        try { W.localStorage.removeItem(CHOICE + key); W.localStorage.removeItem(OSM_LOOKUP + key); W.localStorage.removeItem(OSM_LOOKUP + 'tried_' + key); } catch (e) {}
        delete pending[key];
    }
    function asking(key) { return pending[key] ? pending[key].candidates : null; }

    // The middle of a bundled course's greens: where a fresh pull asks for a course
    // our records hold no location for (the Myrtle courses).
    function bundleCenter(key, name) {
        var g = G(), all = W.HardPanGpsCourses || {};
        var b = g && g.osmCourse(all, g.bundleKeyFor(all, key, name));
        var pts = [];
        Object.keys((b && b.holes) || {}).forEach(function (n) { var o = b.holes[n].osm; if (o && o.mid) pts.push(o.mid); });
        if (!pts.length) return null;
        return [pts.reduce(function (t, p) { return t + p[0]; }, 0) / pts.length, pts.reduce(function (t, p) { return t + p[1]; }, 0) / pts.length];
    }
    // A small satellite map for the one-tap hole-1 picker on the setup page: Esri
    // with our key when there is one, else USGS (the GPS side's own pair).
    function imageryStyle() {
        var c = cfg(), key = c.esriKey;
        var url = key ? String(c.esriTileUrl || 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token={key}').replace('{key}', encodeURIComponent(key))
            : 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
        return { version: 8, sources: { img: { type: 'raster', tiles: [url], tileSize: 256, maxzoom: key ? 19 : 16, attribution: key ? 'Powered by Esri' : 'USGS The National Map' } },
                 layers: [{ id: 'img', type: 'raster', source: 'img' }] };
    }

    var api = { match: match, choose: choose, forget: forget, asking: asking, known: known, ninesFromName: ninesFromName, imageryStyle: imageryStyle, bundleCenter: bundleCenter };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    W.HardPanGpsMatch = api;
})();
