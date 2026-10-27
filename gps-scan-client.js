// ============================================================================
// SCORECARD SCAN - THE CLIENT (URGENT-066 feature 2, the app part)
//
// Takes the photo and asks the server to read it. Nothing here writes a score:
// gps-scan-grid.js shows what came back, the golfer checks it, and only "Use
// these scores" saves - through the card's own saveScore (index.html).
//
//   capture()         the photo: the native VisionKit document camera
//                     (Capacitor.Plugins.HardPanDocScan, PhoneBridge/
//                     HardPanDocScanPlugin.swift); in a browser, or a phone with
//                     no document camera, a file input (camera or Photos),
//                     scaled down the same way.
//   roundContext(d)   what the model is told about the round: course, tee,
//                     hole count, par and stroke index per hole, the players'
//                     NAMES in round order. Built from an ALLOW-LIST, so nothing
//                     else in the round ever goes: no coordinates, no location,
//                     no money, no uid, no round settings.
//   request(...)      POST /api/scorecard-scan with the Firebase ID token.
//   messageFor(code)  every refusal in plain words (not_configured, limits,
//                     no signal, ...).
//
// The image is held in memory only for this one scan and is never stored on
// the phone, in the database or in Photos.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : globalThis;

    var LONG_EDGE = 1800;          // px, the long edge sent (handoff: 1600-2000)
    var QUALITY = 0.8;             // JPEG
    var TIMEOUT_MS = 45000;        // a Flash read plus one Pro retry fits well inside
    var ROUTE = '/api/scorecard-scan';
    var FALLBACK_ORIGIN = 'https://golf-app-5a5.pages.dev';   // product-links.js GOLF_WEB_ORIGIN

    // ---- the server's base ------------------------------------------------------
    // The native app's pages are capacitor://localhost, so the route is on the web
    // origin; on the web the same origin answers (course-import-rules.js courseProxyBase).
    function apiBase() {
        try {
            var native = W.document && W.document.documentElement && W.document.documentElement.classList.contains('is-native');
            if (!native && W.Capacitor && typeof W.Capacitor.isNativePlatform === 'function') native = W.Capacitor.isNativePlatform();
            if (!native) return '';
            return (typeof GOLF_WEB_ORIGIN === 'string' && GOLF_WEB_ORIGIN) || FALLBACK_ORIGIN;   /* global GOLF_WEB_ORIGIN */
        } catch (e) { return ''; }
    }

    // ---- THE ROUND CONTEXT: an allow-list ---------------------------------------
    // round: the round as the card holds it (index.html currentData). Only these
    // fields are read; the result is built fresh, never copied from the round.
    function roundContext(round) {
        var d = round || {};
        var holesData = (Array.isArray(d.courseData) ? d.courseData : []).filter(function (h) { return h && isFinite(Number(h.hole)) && Number(h.hole) >= 1 && Number(h.hole) <= 18; })
            .slice().sort(function (a, b) { return Number(a.hole) - Number(b.hole); });
        var nums = holesData.map(function (x) { return Number(x.hole); });
        var top = nums.length ? nums[nums.length - 1] : 18;
        var par = [], si = [];
        for (var n = 1; n <= top; n++) {
            var h = holesData.filter(function (x) { return Number(x.hole) === n; })[0];
            par.push(h && isFinite(Number(h.par)) ? Number(h.par) : null);
            var s = h && (h.hcpIndex != null ? h.hcpIndex : (h.handicap != null ? h.handicap : h.si));
            si.push(s != null && isFinite(Number(s)) ? Number(s) : null);
        }
        var players = (Array.isArray(d.players) ? d.players : []).filter(Boolean).map(function (p) {
            var o = { name: String(p.name || '').slice(0, 60) };
            var hc = p.hcp != null ? p.hcp : p.handicap;
            if (hc != null && String(hc).trim() !== '' && isFinite(Number(hc))) o.handicap = Math.round(Number(hc));
            return o;
        }).filter(function (p) { return p.name; });
        var ctx = { holes: nums.length === 9 ? 9 : 18, players: players, par: par };
        if (nums.length === 9 && nums[0] === 10) ctx.startHole = 10;
        if (nums.length) ctx.expectedHoles = nums;
        if (si.some(function (x) { return x !== null; })) ctx.strokeIndex = si;
        if (d.courseName) ctx.course = String(d.courseName).slice(0, 120);
        var tee = d.teeName || (d.teeRating && d.teeRating.name);
        if (tee && typeof tee === 'string') ctx.tee = tee.slice(0, 60);
        return ctx;
    }

    // ---- THE REFUSALS, IN PLAIN WORDS ---------------------------------------------
    var MESSAGES = {
        not_configured: 'Scorecard scan isn\u2019t switched on yet. Type the scores in for now.',
        needs_pass: 'You\u2019ve used your free scorecard scans. More scans come with a host pass - type the scores in for now.',
        rate_limited: 'That\u2019s a lot of scans in a row. Wait a minute and try again.',
        daily_limit: 'You\u2019ve reached today\u2019s scan limit. Type the scores in, or scan again tomorrow.',
        monthly_cap: 'Scorecard scan is resting for now. Type the scores in - it will be back soon.',
        sign_in: 'Sign in first, then scan the card.',
        busy: 'Scorecard scan is busy right now. Try again in a minute.',
        bad_image: 'We couldn\u2019t read that photo. Lay the card flat, fill the frame, avoid shadows and try again.',
        unreadable: 'We couldn\u2019t read the scores on that card. Try again in better light, or type them in.',
        offline: 'Scanning needs signal. Your scores are safe - type them in, or scan when you have signal.',
        timeout: 'The scan took too long. Check your signal and try again.',
        server: 'Something went wrong reading the card. Try again, or type the scores in.',
        no_camera: 'This phone can\u2019t open the camera here. Pick a photo of the card instead.'
    };
    // The server's reasons (functions/api/_scan.js: status ok | not_configured |
    // refused <reason> | unavailable <reason>) that share a message above.
    // phone3: no_such_route = the live site's /api catch-all (functions/api/[[path]].js, HTTP 404) -
    // the scan route is not deployed yet, so the golfer gets the plain "not switched on yet" words,
    // not "Something went wrong" (measured 2026-10-24: POST /api/scorecard-scan -> 404 no_such_route).
    var ALIAS = { bad_request: 'server', upstream_error: 'server', network: 'timeout', no_such_route: 'not_configured' };
    function codeOf(code, status) {
        var c = String(code || '').toLowerCase();
        if (MESSAGES[c] !== undefined) return c;
        if (ALIAS[c]) return ALIAS[c];
        if (status === 401) return 'sign_in';
        if (status === 402) return 'needs_pass';
        if (status === 429) return 'rate_limited';
        return 'server';
    }
    function messageFor(code, status) { return MESSAGES[codeOf(code, status)]; }

    // ---- THE PHOTO ----------------------------------------------------------------------
    function plugin() {
        var C = W.Capacitor;
        if (!C) return null;
        try { return (C.Plugins && C.Plugins.HardPanDocScan) || (typeof C.registerPlugin === 'function' ? (C.__hpDS = C.__hpDS || C.registerPlugin('HardPanDocScan')) : null); } catch (e) { return null; }
    }
    // -> Promise<{ image: base64 JPEG, width, height } | { cancelled: true }>
    function capture() {
        if (W.__hpScanCaptureStub) return Promise.resolve(W.__hpScanCaptureStub());   // tests / the Simulator (no document camera there)
        var P = plugin();
        var native = !!(P && W.Capacitor && typeof W.Capacitor.isNativePlatform === 'function' && W.Capacitor.isNativePlatform());
        if (!native) return pickFile();
        return Promise.resolve(P.available ? P.available() : { available: true }).then(function (a) {
            if (!a || !a.available) return pickFile();
            return P.scan().then(function (r) { return r && r.cancelled ? { cancelled: true } : r; }, function (e) {
                if (e && e.code === 'unavailable') return pickFile();
                throw e;
            });
        });
    }
    // The web / no-document-camera way: one file input, the rear camera offered first.
    function pickFile() {
        return new Promise(function (resolve, reject) {
            var doc = W.document;
            var input = doc.createElement('input');
            input.type = 'file';
            input.setAttribute('accept', 'image/*');
            input.setAttribute('capture', 'environment');
            input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
            var done = false;
            input.addEventListener('change', function () {
                done = true;
                var f = input.files && input.files[0];
                input.remove();
                if (!f) { resolve({ cancelled: true }); return; }
                downscale(f).then(resolve, reject);
            });
            doc.body.appendChild(input);
            // A dismissed picker sends no event; focus coming back with no file is a cancel.
            W.addEventListener('focus', function back() { W.removeEventListener('focus', back); setTimeout(function () { if (!done) { input.remove(); resolve({ cancelled: true }); } }, 800); });
            input.click();
        });
    }
    function downscale(file) {
        return new Promise(function (resolve, reject) {
            var url = W.URL.createObjectURL(file);
            var img = new W.Image();
            img.onload = function () {
                var k = Math.min(1, LONG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
                var c = W.document.createElement('canvas');
                c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                W.URL.revokeObjectURL(url);
                var data = c.toDataURL('image/jpeg', QUALITY);
                resolve({ image: data.slice(data.indexOf(',') + 1), width: c.width, height: c.height });
            };
            img.onerror = function () { W.URL.revokeObjectURL(url); reject({ code: 'bad_image' }); };
            img.src = url;
        });
    }

    // ---- THE REQUEST ---------------------------------------------------------------------
    function idToken() {
        try {
            var u = W.firebase && W.firebase.auth && W.firebase.auth().currentUser;
            if (u && typeof u.getIdToken === 'function') return Promise.resolve(u.getIdToken()).catch(function () { return null; });
        } catch (e) {}
        return Promise.resolve(null);
    }
    // body: exactly { image: { data, mimeType }, round } - round from roundContext() above
    // (functions/api/_scan.js readBody). Nothing else: not the round code, not the uid.
    function buildBody(image, ctx) {
        return { image: { data: String(image || ''), mimeType: 'image/jpeg' }, round: ctx };
    }
    // phone3: THE SERVER SWITCH, in the app only. The scan route is not deployed yet, and from the app
    // (capacitor://localhost, cross-origin) the live /api catch-all's 404 answers the CORS preflight, so
    // the fetch fails like no signal and the golfer would read "Something went wrong". Until gps-config
    // features.scanServer is true (absent = off, as features.layoutSync), the app says the plain
    // not_configured words at once - no camera, and no photo leaves the phone. A browser (same origin)
    // reads the server's own answer, as before.
    function serverOffHere() {
        if (!apiBase()) return false;
        try { var f = (W.HARDPAN_GPS_CONFIG || {}).features || {}; return f.scanServer !== true; } catch (e) { return true; }
    }
    // -> Promise<{ ok: true, scan, validation, model, retried, scansLeft } | { ok: false, code, message }>
    function request(image, ctx) {
        if (serverOffHere()) return Promise.resolve(fail('not_configured'));
        if (W.navigator && W.navigator.onLine === false) return Promise.resolve(fail('offline'));
        var f = W.fetch;
        if (typeof f !== 'function') return Promise.resolve(fail('server'));
        return idToken().then(function (tok) {
            var headers = { 'Content-Type': 'application/json' };
            if (tok) headers.Authorization = 'Bearer ' + tok;
            var timer, timedOut = false;
            var t = new Promise(function (resolve) { timer = setTimeout(function () { timedOut = true; resolve(null); }, TIMEOUT_MS); });
            var call = f.call(W, apiBase() + ROUTE, { method: 'POST', headers: headers, body: JSON.stringify(buildBody(image, ctx)) });
            return Promise.race([call, t]).then(function (res) {
                clearTimeout(timer);
                if (timedOut || !res) return fail('timeout');
                return res.text().then(function (txt) {
                    var j = null;
                    try { j = JSON.parse(txt); } catch (e) {}
                    if (j && j.status === 'not_configured') return fail('not_configured', res.status, j);
                    if (!j || j.status !== 'ok' || !res.ok) return fail(j && (j.reason || j.status), res.status, j);
                    var scan = j.result;
                    if (!scan || !Array.isArray(scan.players)) return fail('unreadable', res.status, j);
                    return { ok: true, scan: scan, validation: j.validation || null, model: j.model || null, retried: !!j.retried, paid: !!j.paid,
                        scansLeft: typeof j.freeScansLeft === 'number' ? j.freeScansLeft : null };
                });
            }, function () { clearTimeout(timer); return fail(W.navigator && W.navigator.onLine === false ? 'offline' : 'server'); });
        });
    }
    function fail(code, status, body) {
        var c = codeOf(code, status);
        var out = { ok: false, code: c, message: MESSAGES[c] };
        if (body && typeof body.freeScansLeft === 'number') out.scansLeft = body.freeScansLeft;
        return out;
    }

    // ---- 088-3 COURSE MODE (080): a photo of a BLANK printed card -> pars, Men's + Ladies' HCP, tee yardages ----
    // Its own body (functions/api/_scan.js readCourseBody): exactly { mode:'course', image, course:{ name, holes } }.
    // No players, no scores, no location. The score request above is unchanged.
    var COURSE_MESSAGES = {
        needs_pass: 'You’ve used your free course scans. Type the pars and indexes instead.',
        unreadable: 'We couldn’t read the pars on that card. Try again in better light, or type them in.',
        offline: 'Scanning needs signal. Type the pars and indexes, or scan when you have signal.',
        not_configured: 'Course card scan isn’t switched on yet. Type the pars and indexes for now.',
        server: 'Something went wrong reading the card. Try again, or type the pars and indexes.'
    };
    function courseMessageFor(code) { return COURSE_MESSAGES[code] || MESSAGES[code] || COURSE_MESSAGES.server; }
    function buildCourseBody(image, course) {
        var c = course || {};
        var out = { holes: Number(c.holes) === 9 ? 9 : 18 };
        if (c.name) out.name = String(c.name).slice(0, 120);
        return { mode: 'course', image: { data: String(image || ''), mimeType: 'image/jpeg' }, course: out };
    }
    // -> Promise<{ ok: true, card, validation, model, retried, paid, courseScansLeft } | { ok: false, code, message, courseScansLeft? }>
    function courseFail(code, status, body) {
        var c = codeOf(code, status);
        var out = { ok: false, code: c, message: courseMessageFor(c) };
        if (body && typeof body.courseScansLeft === 'number') out.courseScansLeft = body.courseScansLeft;
        return out;
    }
    function requestCourse(image, course) {
        if (serverOffHere()) return Promise.resolve(courseFail('not_configured'));
        if (W.navigator && W.navigator.onLine === false) return Promise.resolve(courseFail('offline'));
        var f = W.fetch;
        if (typeof f !== 'function') return Promise.resolve(courseFail('server'));
        return idToken().then(function (tok) {
            var headers = { 'Content-Type': 'application/json' };
            if (tok) headers.Authorization = 'Bearer ' + tok;
            var timer, timedOut = false;
            var t = new Promise(function (resolve) { timer = setTimeout(function () { timedOut = true; resolve(null); }, TIMEOUT_MS); });
            var call = f.call(W, apiBase() + ROUTE, { method: 'POST', headers: headers, body: JSON.stringify(buildCourseBody(image, course)) });
            return Promise.race([call, t]).then(function (res) {
                clearTimeout(timer);
                if (timedOut || !res) return courseFail('timeout');
                return res.text().then(function (txt) {
                    var j = null;
                    try { j = JSON.parse(txt); } catch (e) {}
                    if (j && j.status === 'not_configured') return courseFail('not_configured', res.status, j);
                    if (!j || j.status !== 'ok' || !res.ok) return courseFail(j && (j.reason || j.status), res.status, j);
                    var card = j.result;
                    if (!card || j.mode !== 'course' || !Array.isArray(card.par)) return courseFail('unreadable', res.status, j);
                    return { ok: true, card: card, validation: j.validation || null, model: j.model || null, retried: !!j.retried, paid: !!j.paid,
                        courseScansLeft: typeof j.courseScansLeft === 'number' ? j.courseScansLeft : null };
                });
            }, function () { clearTimeout(timer); return courseFail(W.navigator && W.navigator.onLine === false ? 'offline' : 'server'); });
        });
    }

    // The scan button shows only in the app with the document camera plugin in it (the feature
    // registry's available()): never on the web, in Consumer, or in a build without the plugin.
    function nativeCameraHere() {
        var Cap = W.Capacitor;
        try {
            if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) return false;
            return !!((typeof Cap.isPluginAvailable === 'function' && Cap.isPluginAvailable('HardPanDocScan')) || (Cap.Plugins && Cap.Plugins.HardPanDocScan));
        } catch (e) { return false; }
    }

    var api = { capture: capture, nativeCameraHere: nativeCameraHere, serverOffHere: serverOffHere, roundContext: roundContext, buildBody: buildBody, request: request, messageFor: messageFor, codeOf: codeOf,
        requestCourse: requestCourse, buildCourseBody: buildCourseBody, courseMessageFor: courseMessageFor,   // 088-3 course mode
        MESSAGES: MESSAGES, ROUTE: ROUTE, LONG_EDGE: LONG_EDGE, QUALITY: QUALITY, apiBase: apiBase };
    W.HardPanScanClient = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
