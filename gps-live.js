// ============================================================================
// HARDPAN GPS LIVE - ANY US COURSE, FROM GOLFAPI THROUGH OUR CLOUD FUNCTIONS
// (gps-live, 2026-10-10)
//
// The phone NEVER calls GolfAPI and never holds its key. It asks two Firebase
// Cloud Functions (firebase-functions/), on a tap only:
//   search(name)           -> gpsSearch: GolfAPI's courses by that name (city / state,
//                             GPS or not, already set up or not)
//   course(id, ourKey)     -> gpsCourse: the course's GPS (and its scorecard, written
//                             by the function to global_courses/gapi_<id>)
// and reads, with no function and no GolfAPI call:
//   gps_links/<ourKey>     which GolfAPI course one of our courses is
//   gps_courses/<id>       that course (the shape gps-golfapi.js ships)
// Every course this phone has had is kept (localStorage) for the course with no
// signal, and merged into window.HardPanGolfApi - so gps-geo.golfapiMatch, the
// badge, the setup line and the GPS screen read live courses exactly as they read
// the bundled ones. A course with no GolfAPI GPS: "Tools > Set the green".
//
// NO LOCATION LEAVES THE PHONE: a search sends the typed name, nothing else.
// In the app only (or when a test's config sets liveTest), and only with
// gps-config.js live: true. live: false, osm: true is build 10.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};
    var COURSE = 'hardpan_gpslive_v1_', LINK = 'hardpan_gpslive_link_v1_';
    var READ_MS = 8000, CALL_MS = 25000;
    var store = { courses: {}, links: {} };
    // FIREBASE TURNS holes "1".."18" INTO AN ARRAY ([0] empty) when it hands a course
    // back - from gps_courses or a cached function answer. One shape on the phone:
    // an object keyed by hole number, real holes only.
    function normal(c) {
        if (!c || typeof c !== 'object' || !c.h) return c;
        var h = {};
        Object.keys(c.h).forEach(function (k) { var x = c.h[k]; if (x && typeof x === 'object' && Number(k) >= 1) h[String(Number(k))] = x; });
        c.h = h;
        return c;
    }

    function cfg() { try { return W.HARDPAN_GPS_CONFIG || {}; } catch (e) { return {}; } }
    function native() { try { return !!(W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()); } catch (e) { return false; } }
    function on() { var c = cfg(); return c.live === true && c.golfapi !== false && !!c.liveBase && (native() || !!c.liveTest); }
    function lsGet(k) { try { var v = W.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function lsSet(k, v) { try { W.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    function offline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }
    var ID_RE = /^\d{6,30}$/, KEY_RE = /^[A-Za-z0-9_-]{1,80}$/;

    // What this phone kept, back in memory at load.
    (function restore() {
        try {
            for (var i = 0; i < W.localStorage.length; i++) {
                var k = W.localStorage.key(i);
                if (k && k.indexOf(LINK) === 0) { var id = lsGet(k); if (ID_RE.test(String(id))) store.links[k.slice(LINK.length)] = String(id); }
                else if (k && k.indexOf(COURSE) === 0) { var c = normal(lsGet(k)); if (c && c.id && c.h) store.courses[String(c.id)] = c; }
            }
        } catch (e) {}
    })();

    // Into window.HardPanGolfApi, beside the bundled courses. The bundled file
    // REPLACES that object when it loads, so the loaders call merge() after it.
    function merge() {
        if (!on()) return W.HardPanGolfApi || null;
        var d = W.HardPanGolfApi = W.HardPanGolfApi || { v: 1, courses: {}, links: {} };
        d.courses = d.courses || {}; d.links = d.links || {};
        Object.keys(store.courses).forEach(function (id) { if (!d.courses[id]) d.courses[id] = store.courses[id]; });
        Object.keys(store.links).forEach(function (k) { if (!d.links[k]) d.links[k] = store.links[k]; });
        return d;
    }
    function add(course, key) {
        course = normal(course);
        if (!course || !ID_RE.test(String(course.id)) || !course.h) return;
        var id = String(course.id);
        store.courses[id] = course; lsSet(COURSE + id, course);
        if (key && KEY_RE.test(key)) { store.links[key] = id; lsSet(LINK + key, id); }
        store.links['gapi_' + id] = id;
        merge();
    }
    // The GolfAPI course id for one of our course keys, from what is on the phone.
    function idFor(key) {
        key = String(key || '');
        var m = /^gapi_(\d{6,30})$/.exec(key);
        if (m) return m[1];
        var d = W.HardPanGolfApi;
        return store.links[key] || (d && d.links && d.links[key]) || null;
    }
    function db() { try { return W.firebase && typeof W.firebase.database === 'function' ? W.firebase.database() : null; } catch (e) { return null; } }
    function readOnce(path) {
        var d = db();
        if (!d) return Promise.resolve(null);
        return new Promise(function (resolve) {
            var t = setTimeout(function () { resolve(null); }, READ_MS);
            try {
                d.ref(path).once('value').then(function (s) { clearTimeout(t); resolve(s && typeof s.val === 'function' ? s.val() : null); },
                    function () { clearTimeout(t); resolve(null); });
            } catch (e) { clearTimeout(t); resolve(null); }
        });
    }
    // THE ROUND'S COURSE, with no GolfAPI call and no function: on the phone, else
    // gps_links/<key> -> gps_courses/<id>. true when it is here now.
    var inflight = {};
    function ensure(key) {
        if (!on() || !key) return Promise.resolve(false);
        merge();
        var id = idFor(key);
        if (id && store.courses[id]) return Promise.resolve(true);
        var d = W.HardPanGolfApi;
        if (id && d && d.courses && d.courses[id]) return Promise.resolve(true);   // bundled
        if (offline()) return Promise.resolve(false);
        if (inflight[key]) return inflight[key];
        var p = (id ? Promise.resolve(id) : (KEY_RE.test(key) ? readOnce('gps_links/' + key) : Promise.resolve(null)))
            .then(function (found) {
                if (!ID_RE.test(String(found || ''))) return false;
                return readOnce('gps_courses/' + found).then(function (c) {
                    if (!c || !c.h) return false;
                    c.id = String(found);
                    add(c, key);
                    return true;
                });
            }).then(function (ok) { delete inflight[key]; return ok; }, function () { delete inflight[key]; return false; });
        inflight[key] = p;
        return p;
    }
    // A CALLABLE FUNCTION by plain fetch (no extra Firebase SDK in the app): POST
    // { data } with the signed-in user's ID token; the answer is { result }.
    function call(name, payload) {
        if (!on()) return Promise.resolve({ status: 'off' });
        if (offline()) return Promise.resolve({ status: 'offline' });
        var user = null;
        try { user = W.firebase && W.firebase.auth && W.firebase.auth().currentUser; } catch (e) { user = null; }
        if (!user || typeof user.getIdToken !== 'function') return Promise.resolve({ status: 'signin' });
        var base = String(cfg().liveBase).replace(/\/+$/, '');
        return user.getIdToken().then(function (tok) {
            var ctl = typeof AbortController === 'function' ? new AbortController() : null;
            var t = ctl ? setTimeout(function () { ctl.abort(); }, CALL_MS) : null;
            return fetch(base + '/' + name, { method: 'POST', credentials: 'omit', signal: ctl ? ctl.signal : undefined,
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ data: payload }) })
                .then(function (r) { return r.json(); })
                .then(function (j) { if (t) clearTimeout(t); return (j && j.result) || { status: 'error', message: (j && j.error && j.error.message) || '' }; });
        }).catch(function () { return { status: 'error' }; });
    }
    function search(name) { return call('gpsSearch', { name: String(name || '').trim() }); }

    // ---- FINDING A SAVED COURSE IN GOLFAPI (gps-features) ------------------------------
    // GolfAPI's name search is STRICT: "Legacy Golf Resort" finds nothing when GolfAPI
    // calls it "The Legacy Golf Club"; "Southern Dunes Golf & Country Club" nothing,
    // "Southern Dunes" three. So the name is tried in up to three ever-shorter forms
    // (each search is cached for everyone; 0.1 call the first time, then 0), and the
    // answer is matched on the saved card's CITY and STATE, not on the name alone.
    var GENERIC = { golf: 1, course: 1, courses: 1, club: 1, resort: 1, country: 1, cc: 1, gc: 1, the: 1, and: 1, at: 1, of: 1, links: 1,
        hole: 1, holes: 1, '18': 1, '9': 1, '27': 1, municipal: 1, muni: 1, public: 1, private: 1, spa: 1, inn: 1, hotel: 1 };
    var STATES = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
        hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
        michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
        'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
        'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
        wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC' };
    function stateCode(st) { var t = String(st || '').trim(); if (!t) return ''; return /^[A-Za-z]{2}$/.test(t) ? t.toUpperCase() : (STATES[t.toLowerCase()] || t.toUpperCase()); }
    function cityKey(c) { return String(c || '').toLowerCase().replace(/[^a-z]+/g, ''); }
    function words(n) { return String(n || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/['\u2019`]/g, '').split(/[^a-z0-9]+/).filter(Boolean); }
    function nameVariants(name) {
        var out = [], add = function (v) { v = String(v || '').replace(/\s+/g, ' ').trim(); if (v.length >= 3 && out.indexOf(v) === -1) out.push(v); };
        add(String(name || '').replace(/\(.*?\)/g, ' '));
        var w = words(name).filter(function (x) { return !GENERIC[x]; });
        add(w.join(' '));
        var longest = w.filter(function (x) { return x.length >= 4 && !/^\d+$/.test(x); }).sort(function (a, b) { return b.length - a.length; })[0];
        add(longest);
        return out.slice(0, 3);
    }
    // where: { city, state } from the saved card (either may be missing).
    function rank(results, where, name) {
        var st = stateCode(where && where.state), ct = cityKey(where && where.city);
        var want = words(name).filter(function (x) { return !GENERIC[x]; });
        return results.map(function (x) {
            var sameState = !!st && stateCode(x.state) === st, sameCity = !!ct && cityKey(x.city) === ct;
            var have = words(x.club + ' ' + x.course);
            var shared = want.filter(function (w) { return have.indexOf(w) !== -1; }).length;
            return { r: x, sameState: sameState, sameCity: sameCity, shared: shared, score: (sameCity ? 4 : 0) + (sameState ? 2 : 0) + shared };
        }).sort(function (a, b) { return b.score - a.score; });
    }
    // Resolves { status: 'ok', matches: [results, best first], clear: result|null, query, tried }
    // | { status: 'none', tried } | { status: <the function's status> }. Never rejects.
    function find(name, where) {
        var tried = [], variants = nameVariants(name);
        var next = function (i) {
            if (i >= variants.length) return Promise.resolve({ status: 'none', tried: tried });
            tried.push(variants[i]);
            return search(variants[i]).then(function (r) {
                if (!r || r.status !== 'ok') return r || { status: 'error' };
                var gps = (r.results || []).filter(function (x) { return x.gps; });
                if (!gps.length) return next(i + 1);
                var ranked = rank(gps, where, name);
                // Where the saved card says the course is: keep that state's courses when there are any.
                var st = stateCode(where && where.state);
                var inState = st ? ranked.filter(function (x) { return x.sameState; }) : ranked;
                if (st && !inState.length) return next(i + 1);
                var pool = inState.length ? inState : ranked;
                var top = pool[0];
                var ties = pool.filter(function (x) { return x.score === top.score; });
                // ONE CLEAR MATCH: the only one in that city (or, with no city stored, the only one in that state).
                var inCity = pool.filter(function (x) { return x.sameCity; });
                var clear = inCity.length === 1 ? inCity[0].r : (!cityKey(where && where.city) && pool.length === 1 && st ? pool[0].r : null);
                if (!clear && ties.length === 1 && top.sameCity) clear = top.r;
                return { status: 'ok', matches: pool.map(function (x) { return x.r; }), clear: clear, query: variants[i], tried: tried };
            });
        };
        return next(0).catch(function () { return { status: 'error' }; });
    }
    function course(id, ourKey) {
        var payload = { courseId: String(id) };
        if (ourKey && KEY_RE.test(ourKey)) payload.ourKey = ourKey;
        return call('gpsCourse', payload).then(function (r) {
            if (r && r.status === 'ready' && r.course) { r.course.id = String(id); add(r.course, ourKey && KEY_RE.test(ourKey) ? ourKey : null); }
            return r;
        });
    }
    // What the golfer reads for each answer.
    var MESSAGES = {
        ready: 'GPS ✓ ready',
        soon: 'GPS coming soon for this course',
        nogps: 'No GPS for this course yet - Tools › Set the green during the round',
        limit: 'You have set up 5 new GPS courses today - try again tomorrow, or pick a course that is already set up',
        account: 'Sign in (Apple, Google or email) to set up a new GPS course',
        busy: 'Someone is setting up this course right now - try again in a minute',
        unknown: 'Search for the course first',
        offline: 'No signal - GPS for a new course needs a connection',
        signin: 'Sign in to search GPS courses',
        error: 'GPS is not available right now - try again',
        off: '',
    };
    function message(status) { return Object.prototype.hasOwnProperty.call(MESSAGES, status) ? MESSAGES[status] : MESSAGES.error; }

    W.HardPanGpsLive = { find: find, nameVariants: nameVariants, stateCode: stateCode, normal: normal, on: on, merge: merge, ensure: ensure, idFor: idFor, search: search, course: course, message: message, _store: store };
})();
