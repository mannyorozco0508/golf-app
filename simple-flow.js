// ============================================================================
// SIMPLER HARDPAN: THE 3-STEP NEW ROUND (mailbox 017, features.simpleFlow).
// Manny's mockup: ~/Desktop/claude-code-reports/017/mockup-simple-flow.png.
//
//   Step 1 Course   search + NEAR YOU (the closest picked, a ✓ GPS badge), the tees and the
//                   start (Hole 1 / 10 / Shotgun) as chips on the same card; a two-nines
//                   course picks its nines here.
//   Step 2 Players  ONE paste box (Round Setup's own parser, commitPastedPlayers), a summary
//                   card (golfers · groups · flights · handicaps), "Add initial" for two golfers
//                   with one name, and "You" = this phone's golfer (no "How are you joining?").
//   Step 3 Games    tiles (Weekly Game, Skins, Nassau, Match, Hi-Lo when its engine is here,
//                   More games ›), multi-select; up front only Net/Gross and each game's stake;
//                   "More options" holds the rest. Start round ▶ = ONE tap: Round Setup's own
//                   saveSettings. Then the share sheet (each group's link, the code, the QRs),
//                   and Done opens the GPS (the card when the course has no GPS).
//
// UI AND FLOW ONLY. This page is the wizard underneath, untouched: every choice here is typed
// into the wizard's own fields (selectCourse, the tee select, the paste box, mp-*, the Skins
// instances) and the round is written by the wizard's own saveSettings, in its own shape. The
// head-to-head games (Nassau, Match, Hi-Lo) ride the save's own side-match hook
// (spRoundSideMatchesForSave - the "Paste the whole round" Nassaus' path), as sideMatches in
// the shape the Side Matches page writes. No engine, no settlement, no rules are touched.
//
// WHEN. Only on a NEW round reached from Home's "+ New round" / "Same as last week" while the
// switch is on: Home marks the session (sessionStorage hardpan_simple_flow = new | same), and
// the first ?game= code this page opens claims it. An existing round (Edit setup) never shows
// this; with the switch off Home never marks, so Round Setup is exactly as it was.
// ============================================================================
(function () {
    'use strict';
    var W = window, D = document;
    var MARK = 'hardpan_simple_flow';
    function ss(k, v) { try { if (v === undefined) return W.sessionStorage.getItem(k); if (v === null) W.sessionStorage.removeItem(k); else W.sessionStorage.setItem(k, v); } catch (e) { return null; } return null; }
    function ls(k, v) { try { if (v === undefined) return W.localStorage.getItem(k); if (v === null) W.localStorage.removeItem(k); else W.localStorage.setItem(k, v); } catch (e) { return null; } return null; }
    function $(id) { return D.getElementById(id); }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function params() { try { return new URLSearchParams(W.location.search); } catch (e) { return { get: function () { return null; } }; } }
    function HD() { return W.HardPanDoors || {}; }
    function fn(name) { return typeof W[name] === 'function' ? W[name] : null; }
    function first(n) { return String(n || '').trim().split(/\s+/)[0]; }
    function money(v) { var n = Number(v) || 0; return '$' + (Math.round(n * 100) / 100); }

    // ---- WHICH ROUND --------------------------------------------------------------
    function marker() {
        var m = ss(MARK);
        if (!m) return null;
        try { var o = JSON.parse(m); if (o && o.mode) return o; } catch (e) {}
        return { mode: m };
    }
    function claim(code) {
        var m = marker();
        if (!m) return null;
        if (!m.code) { m.code = code; ss(MARK, JSON.stringify(m)); }
        if (m.code !== code) { ss(MARK, null); return null; }
        return m;
    }
    function switchOn() { return typeof W.HardPanFeature !== 'function' || W.HardPanFeature('simpleFlow'); }

    var S = {
        open: false, mode: 'new', code: '', step: 1, saving: false, saved: false,
        here: null, near: null, gpsFiles: false, q: '', shotgun: false,
        meName: '', lastPool: null,
        games: { weekly: false, skins: false, nassau: false, match: false, hilo: false },
        stake: { weekly: 40, skins: 10, nassau: 5, match: 10, hilo: 1 },
        who: { nassau: null, match: null, hilo: null }, whoAll: {},
        scoring: 'net', press: '2down', carry: true, moreOpen: false, dupOpen: false
    };
    function hiloHere() { return typeof W.hiloShapeOk === 'function' || !!W.HardPanHiLo; }

    // ---- THE WIZARD UNDERNEATH (its own globals) --------------------------------------
    /* global currentMode, loadedExistingRound, groupSizeOverrides:writable, skinsInstances:writable, currentSavedRound:writable, WIZARD_STEP_OF, nineHoleLoops, courseHiddenSelect, courseSearchInput, db */
    // Round Setup's own top-level bindings (let / const in its classic script), read and set by name.
    function wizDb() { return typeof db !== 'undefined' ? db : null; }
    function wizSkins() { return typeof skinsInstances !== 'undefined' ? skinsInstances : null; }
    function players() { var f = fn('collectWizardPlayers'); try { return f ? (f() || []).filter(function (p) { return String(p.name || '').trim(); }) : []; } catch (e) { return []; } }
    function overrides() { return (typeof groupSizeOverrides !== 'undefined' && groupSizeOverrides) || {}; }
    function groups(n) { var f = fn('computeGroupBoundaries'); try { return f ? f(n, overrides()) : [{ group: 1, startIdx: 0, size: n }]; } catch (e) { return [{ group: 1, startIdx: 0, size: n }]; } }
    function courseKey() { var el = $('course-select'); return el ? el.value : ''; }
    function courseName() { var el = $('course-search-input'); return el ? String(el.value || '').trim() : ''; }
    function setVal(id, v, ev) { var el = $(id); if (!el) return false; el.value = String(v); if (ev) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } return true; }
    function step(name) { var SO = (typeof WIZARD_STEP_OF !== 'undefined' && WIZARD_STEP_OF) || { course: 1, players: 5, action: 6, review: 7 }; return SO[name]; }

    // ---- THE SCREEN ---------------------------------------------------------------
    var CSS = '#sf{position:fixed;inset:0;z-index:900;overflow:auto;-webkit-overflow-scrolling:touch;background:#f2f4ef;color:#13241d;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light}'
        + '#sf *{box-sizing:border-box}'
        + '#sf .sf-in{max-width:520px;margin:0 auto;min-height:100%;display:flex;flex-direction:column;padding:calc(env(safe-area-inset-top) + 14px) 16px calc(env(safe-area-inset-bottom) + 16px)}'
        + '#sf .sf-top{display:flex;align-items:center;gap:8px;min-height:44px}'
        + '#sf .sf-back{border:0;background:none;font-size:26px;line-height:1;color:#0f4c3a;min-width:44px;min-height:44px;padding:0;text-align:left;cursor:pointer}'
        + '#sf .sf-kick{font-size:14px;color:#556;flex:1}'
        + '#sf .sf-bar{display:flex;gap:6px}#sf .sf-bar i{display:block;width:30px;height:6px;border-radius:3px;background:#d6dcd6}#sf .sf-bar i.on{background:#0f4c3a}'
        + '#sf h1{font-size:25px;font-weight:800;margin:6px 0 14px;line-height:1.2}'
        + '#sf .sf-card{background:#fff;border:1px solid #dfe5df;border-radius:16px;padding:14px;margin-bottom:12px}'
        + '#sf .sf-search{width:100%;height:50px;border:1px solid #dfe5df;border-radius:14px;padding:0 14px;font-size:17px;background:#fff;color:#13241d;font-family:inherit}'
        + '#sf .sf-h{font-size:12px;font-weight:800;letter-spacing:.08em;color:#667;margin:16px 2px 8px}'
        + '#sf .sf-row{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;background:#fff;border:1px solid #dfe5df;border-radius:16px;padding:15px 14px;margin-bottom:10px;font:inherit;color:inherit;cursor:pointer}'
        + '#sf .sf-row .n{font-size:16px;font-weight:800}#sf .sf-row .s{font-size:13px;color:#667;white-space:nowrap}'
        + '#sf .sf-sel{border:2px solid #0f4c3a}'
        + '#sf .sf-line{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid #eef1ee}'
        + '#sf .sf-line:first-of-type{border-top:0}#sf .sf-line .l{font-size:15px;color:#334}'
        + '#sf .sf-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}'
        + '#sf .sf-chip{border:0;border-radius:999px;padding:8px 14px;min-height:38px;background:#e9eee9;color:#13241d;font:600 15px/1 inherit;font-family:inherit;cursor:pointer}'
        + '#sf .sf-chip.on{background:#0f4c3a;color:#fff}'
        + '#sf .sf-cta{display:block;width:100%;min-height:58px;border:0;border-radius:16px;background:#0f4c3a;color:#fff;font-size:19px;font-weight:800;font-family:inherit;cursor:pointer}'
        + '#sf .sf-cta[disabled]{opacity:.45}#sf .sf-cta.lime{background:#d4f27c;color:#10392d;min-height:72px}#sf .sf-cta .sub{display:block;font-size:13px;font-weight:600;margin-top:3px}'
        + '#sf .sf-foot{margin-top:auto;padding-top:16px;position:sticky;bottom:0;padding-bottom:calc(env(safe-area-inset-bottom) + 4px);background:linear-gradient(rgba(242,244,239,0),#f2f4ef 22%)}#sf .sf-foot:empty{display:none}'
        + '#sf .sf-link{border:0;background:none;color:#0f4c3a;font-weight:800;font-size:15px;padding:10px 0;min-height:44px;cursor:pointer;font-family:inherit}'
        + '#sf .sf-link.muted{color:#667;font-weight:600}'
        + '#sf textarea{width:100%;min-height:110px;border:1px solid #dfe5df;border-radius:16px;padding:12px 14px;font-size:16px;font-family:inherit;color:#13241d;background:#fff;resize:vertical}'
        + '#sf .sf-warn{background:#fdf6e3;border:1px solid #f0dca8;border-radius:14px;padding:12px 14px;font-size:15px;margin-bottom:12px}'
        + '#sf .sf-warn input{width:100%;height:44px;border:1px solid #dfe5df;border-radius:10px;padding:0 10px;font-size:16px;margin-top:6px;font-family:inherit}'
        + '#sf .sf-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}'
        + '#sf .sf-tile{position:relative;text-align:left;background:#fff;border:1px solid #dfe5df;border-radius:16px;padding:12px;min-height:92px;font:inherit;color:inherit;cursor:pointer;display:flex;flex-direction:column;gap:4px}'
        + '#sf .sf-tile .n{font-size:16px;font-weight:800}#sf .sf-tile .s{font-size:12.5px;color:#667;line-height:1.35}'
        + '#sf .sf-tile.on{border:2px solid #0f4c3a;background:#f3f8f4}#sf .sf-tile.on .n:after{content:" \\2713";color:#0f4c3a}'
        + '#sf .sf-money{display:flex;align-items:center;gap:6px}#sf .sf-money input{width:76px;height:40px;border:1px solid #dfe5df;border-radius:10px;padding:0 8px;font-size:16px;text-align:right;font-family:inherit}'
        + '#sf .sf-seg{display:flex;background:#e9eee9;border-radius:12px;padding:3px}#sf .sf-seg button{border:0;background:none;border-radius:10px;padding:8px 18px;font-weight:800;font-size:15px;font-family:inherit;cursor:pointer;color:#13241d}#sf .sf-seg button.on{background:#0f4c3a;color:#fff}'
        + '#sf .sf-trow{display:flex;gap:6px;align-items:center;margin-bottom:8px}#sf .sf-trow input{height:46px;border:1px solid #dfe5df;border-radius:12px;padding:0 10px;font-size:16px;font-family:inherit;background:#fff;color:#13241d;min-width:0}#sf .sf-tname{flex:1}#sf .sf-thcp{width:64px;text-align:center}#sf .sf-ttee{height:46px;border:1px solid #dfe5df;border-radius:12px;font-size:14px;max-width:96px;background:#fff}#sf .sf-tfl{min-width:40px}#sf .sf-seg button{min-height:40px}'
        + '#sf .sf-note{font-size:13px;color:#667;line-height:1.4}#sf .sf-dot{width:22px;height:22px;border-radius:50%;flex:none;display:inline-block}#sf .sf-tee{padding:12px 14px}'
        + '#sf .sf-err{color:#b42318;font-weight:700;font-size:14px;margin:6px 0}'
        + '#sf .sf-big{font:800 34px/1.1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:#0f4c3a;text-align:center;margin:4px 0}'
        + '#sf .sf-btn{min-height:40px;padding:6px 14px;border-radius:12px;border:1px solid #0f4c3a;background:#fff;color:#0f4c3a;font-weight:800;font-size:14px;font-family:inherit;cursor:pointer;white-space:nowrap}'
        + '#sf-return{position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 12px);z-index:899;min-height:54px;border:0;border-radius:16px;background:#0f4c3a;color:#fff;font:800 16px -apple-system,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)}';
    function el() {
        var e = $('sf');
        if (e) return e;
        var st = D.createElement('style'); st.id = 'sf-css'; st.textContent = CSS; D.head.appendChild(st);
        e = D.createElement('div'); e.id = 'sf'; e.setAttribute('role', 'dialog'); e.setAttribute('aria-label', 'New round');
        D.body.appendChild(e);
        e.addEventListener('click', onClick);
        e.addEventListener('input', onInput);
        e.addEventListener('change', onChange);
        e.addEventListener('keydown', typeKey);
        e.addEventListener('paste', function (ev) { if (ev.target && ev.target.id === 'sf-paste') setTimeout(function () { if (readPaste()) sumOnly(); }, 0); });
        return e;
    }
    function show(on) {
        S.open = !!on;
        var e = el();
        e.style.display = on ? '' : 'none';
        D.documentElement.style.overflow = on ? 'hidden' : '';
    }
    function shell(title, body, foot, n) {
        var bar = '';
        if (n) for (var i = 1; i <= 3; i++) bar += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
        return '<div class="sf-in"><div class="sf-top">' + (S.step === 4 ? '<span class="sf-kick">Share with your groups</span>' : '<button type="button" class="sf-back" data-sf="back" aria-label="Back">\u2039</button><span class="sf-kick">' + (S.mode === 'same' ? 'Same as last week' : S.mode === 'gps' ? 'GPS' : 'Games & Bets') + '</span>')
            + (n ? '<span class="sf-bar" aria-label="Step ' + n + ' of 3">' + bar + '</span>' : '') + '</div>'
            + '<h1>' + title + '</h1>' + body + '<div class="sf-foot">' + foot + '</div></div>';
    }
    function render() {
        if (!S.open) return;
        var e = el(), y = e.scrollTop, html;
        if (S.step === 1) html = step1();
        else if (S.step === 2) html = step2();
        else if (S.step === 3) html = step3();
        else html = share();
        e.innerHTML = html;
        if (S.step === 3 && S.moreOpen) placePool(true);
        e.scrollTop = y;
    }
    function go(n) { if (S.step === 3 && n !== 3) placePool(false); S.step = n; var e = el(); render(); e.scrollTop = 0; }

    // ---- STEP 1: COURSE -----------------------------------------------------------
    function gpsFiles(done) {
        if (S.gpsFiles) { done(); return; }
        var H = HD(), need = [];
        if (!W.HardPanGpsCourses) need.push('gps-courses.js');
        if (!W.HardPanGolfApi && !W.__fdGolfApiTried) { W.__fdGolfApiTried = 1; need.push('gps-golfapi.js'); }
        (H.STATES || []).forEach(function (s) { if (!(W.HardPanGpsCoverage && W.HardPanGpsCoverage[s])) need.push('gps-coverage-' + s.toLowerCase() + '.js'); });
        var left = need.length;
        var fin = function () { S.gpsFiles = true; done(); };
        if (!left || typeof H.loadScriptTimed !== 'function') { fin(); return; }
        need.forEach(function (src) { H.loadScriptTimed(src, function () { if (--left === 0) fin(); }); });
    }
    // Every course Round Setup can start: the app's list (front-door allCourses) plus the shared
    // courses Round Setup itself lists (globalCourses: gca_ / gapi_ / comm_), each with its point.
    function nk(n) { var H = HD(); return String(typeof H.shownName === 'function' ? H.shownName(n) : n).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function pointOf(key) {
        var b = W.HardPanGpsCourses, r = b && b[key], h = r && r.holes && (r.holes['1'] || r.holes[Object.keys(r.holes)[0]]), o = h && (h.osm || h);
        return o && o.tee ? o.tee : (o && o.mid ? o.mid : null);
    }
    function courses() {
        var H = HD(), base = [];
        try { base = typeof H.allCourses === 'function' ? H.allCourses() : []; } catch (e) { base = []; }
        var out = base.filter(function (c) { return c.key; }), have = {};
        out.forEach(function (c) { have[c.key] = 1; });
        var gc = typeof globalCourses !== 'undefined' && globalCourses ? globalCourses : {};   /* global globalCourses */
        Object.keys(gc).forEach(function (k) {
            if (have[k] || !/^(gca_|gapi_|comm_)/.test(k) || !gc[k] || !gc[k].name) return;
            var cov = base.filter(function (c) { return !c.key && nk(c.name) === nk(gc[k].name); })[0];
            out.push({ key: k, name: gc[k].name, ready: ready(k), pt: pointOf(k) || (cov && cov.pt) || null, city: (cov && cov.city) || '', state: (cov && cov.state) || '' });
        });
        return out;
    }
    function nearList(here) {
        var H = HD();
        if (!here || typeof H.miles !== 'function') return [];
        return courses().filter(function (c) { return c.pt; }).map(function (c) { return { c: c, d: H.miles(here, c.pt) }; })
            .filter(function (x) { return x.d <= 25; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 8);
    }
    function nameOf(c) { var H = HD(); return typeof H.shownName === 'function' ? H.shownName(c.name) : c.name; }
    function ready(key) { var H = HD(); try { return !!(key && typeof H.ready === 'function' && H.ready(key)); } catch (e) { return false; } }
    function distTo(c) { var H = HD(); return S.here && c.pt && typeof H.miles === 'function' ? H.miles(S.here, c.pt) : null; }
    function miStr(d) { return d == null ? '' : (d < 10 ? d.toFixed(1) : Math.round(d)) + ' mi'; }
    function locate() {
        var H = HD();
        if (S.near || typeof H.position !== 'function') return;
        S.near = 'asking';
        gpsFiles(function () {
            H.position(function (p) {
                if (!p) { if (S.near === 'asking') S.near = 'none'; if (S.step === 1) render(); return; }
                S.here = p;
                S.near = nearList(p);
                // THE CLOSEST, ALREADY PICKED (a round with no course yet).
                if (!courseKey() && !courseName() && S.near.length) pick(S.near[0].c.key, S.near[0].c.name);
                if (S.step === 1) render();
            });
        });
    }
    function pick(key, name) {
        var f = fn('selectCourse');
        if (!f) return;
        f(key, name);
        S.shotgun = false;
        watchTees();
    }
    // The tees come with the course record, one read after the pick: drawn when they land.
    var teeTimer = null;
    function watchTees() {
        clearInterval(teeTimer);
        var n = 0, was = '';
        teeTimer = setInterval(function () {
            var sel = $('tee-rating-select'), now = sel ? sel.options.length + '|' + sel.value : '';
            if (now !== was) { was = now; if (S.step === 1) render(); }
            if (++n > 40) clearInterval(teeTimer);
        }, 200);
    }
    function chip(label, on, attrs) { return '<button type="button" class="sf-chip' + (on ? ' on' : '') + '" ' + attrs + '>' + esc(label) + '</button>'; }
    // THE TEES, AS ROWS (URGENT-013). Read from the course record Round Setup itself uses
    // (courseRecordForTees(key) - the picked key, e.g. gca_zgkynkan for Dobson) through its own
    // courseTeeChoices (same keys as the tee select), so a tap sets the wizard's select. The
    // first look labelled each tee with the select option's first word, which is the GENDER
    // ("Men · Back") - hence "Men, Men, Men, Men, Women, Women".
    var TEE_COLORS = { black: '#111', blue: '#2f6fdb', white: '#fff', red: '#d7262e', gold: '#d4a017', yellow: '#f2d22e', green: '#2e8b3d', silver: '#b8bec6', copper: '#b87333', purple: '#7b3fb5', orange: '#f08a24', grey: '#9aa0a6', gray: '#9aa0a6', tan: '#d2b48c', maroon: '#800000', burgundy: '#800020', teal: '#2a9d8f', pink: '#f28cb1', bronze: '#a97142', platinum: '#e5e4e2', combo: '#9aa0a6' };
    function teeColor(name) {
        var n = String(name || '').toLowerCase(), hit = null;
        Object.keys(TEE_COLORS).forEach(function (c) { if (!hit && new RegExp('\\b' + c + '\\b').test(n)) hit = TEE_COLORS[c]; });
        if (!hit && /\bback\b|\btips?\b|\bchampionship\b/.test(n)) hit = TEE_COLORS.black;
        return hit || '#c4c9c4';
    }
    function rawTee(rec, key) {
        var g = String(key).split(':'), list = rec && rec.tees && rec.tees[g[0]];
        if (list && !Array.isArray(list) && typeof list === 'object') list = Object.keys(list).sort(function (a, b) { return a - b; }).map(function (k) { return list[k]; });
        return list ? list[Number(g[1])] : null;
    }
    function yardsOf(t) {
        if (!t) return 0;
        var y = Number(t.totalYards != null ? t.totalYards : t.total_yards);
        if (!(y > 0)) { var hs = t.holes ? (Array.isArray(t.holes) ? t.holes : Object.keys(t.holes).map(function (k) { return t.holes[k]; })) : []; y = hs.reduce(function (s, h) { return s + (Number(h && (h.yardage != null ? h.yardage : h.yards)) || 0); }, 0); }
        return y > 0 ? Math.round(y) : 0;
    }
    function teeRows(key) {
        var rec = fn('courseRecordForTees') ? W.courseRecordForTees(key) : null;
        var choices = fn('courseTeeChoices') ? W.courseTeeChoices(rec) : [];
        var seen = {}, out = [];
        choices.forEach(function (c) {
            var y = yardsOf(rawTee(rec, c.key)), id = c.name.trim().toLowerCase() + '|' + y;
            if (seen[id]) return;          // the same tee twice (a women's row with the men's yards)
            seen[id] = 1;
            out.push({ key: c.key, name: c.name.replace(/\s+tees?$/i, ''), gender: c.gender, yards: y, rating: c.courseRating, slope: c.slope });
        });
        return out;
    }
    // THE ROUND'S / LAST-USED TEE: remembered by name per course on this phone.
    var TEE_MEM = 'hardpan_last_tee_';
    function preferTee(key) {
        var want = ls(TEE_MEM + key), sel = $('tee-rating-select');
        if (!want || !sel || S.teeChosen === key) return;
        var rows = teeRows(key), hit = rows.filter(function (r) { return r.name.toLowerCase() === want.toLowerCase(); })[0];
        if (hit && sel.value !== hit.key) { sel.value = hit.key; if (fn('applySelectedTee')) W.applySelectedTee(); }
        S.teeChosen = key;
    }
    function teeList(key) {
        var rows = teeRows(key), sel = $('tee-rating-select');
        if (!rows.length) return '';
        if (S.mode !== 'same') preferTee(key);
        return '<div class="sf-h">TEES</div>' + rows.map(function (r) {
            var on = sel && sel.value === r.key, col = teeColor(r.name);
            return '<button type="button" class="sf-row sf-tee' + (on ? ' sf-sel' : '') + '" data-sf-tee="' + esc(r.key) + '" aria-pressed="' + on + '">'
                + '<span style="display:flex;align-items:center;gap:12px;"><span class="sf-dot" style="background:' + col + ';' + (col === '#fff' ? 'border:1.5px solid #9aa0a6;' : '') + '"></span>'
                + '<span><span class="n" style="display:block;">' + esc(r.name) + '</span><span class="sf-note">' + (r.gender === 'female' ? 'Women' : 'Men') + '</span></span></span>'
                + '<span class="s" style="text-align:right;line-height:1.35;">' + (r.yards ? r.yards.toLocaleString('en-US') + ' yds<br>' : '') + esc(Number(r.rating).toFixed(1)) + ' / ' + esc(r.slope) + '</span></button>';
        }).join('');
    }
    function courseCard() {
        var key = courseKey(), name = courseName();
        if (!name) return '';
        var c = courses().filter(function (x) { return x.key === key; })[0];
        var d = c ? distTo(c) : null;
        var h = '<div class="sf-card" id="sf-course" style="padding:12px 14px;"><div class="sf-line" style="border:0;padding:0;"><span class="n" style="font-size:16px;font-weight:800;">' + esc(c ? nameOf(c) : String(name).split(' (')[0]) + '</span>'
            + '<span class="sf-note">' + esc(miStr(d)) + (ready(key) ? (d != null ? ' · ' : '') + '✓ GPS' : '') + ' · <button type="button" class="sf-link" data-sf="change" style="padding:0;min-height:0;font-size:13px;">Change</button></span></div></div>';
        h += teeList(key);
        var loops = key && typeof nineHoleLoops !== 'undefined' && nineHoleLoops ? nineHoleLoops[key] : null;
        var len = $('round-length-select'), full = !len || len.value === '18';
        var ts = $('tee-start-select'), at = ts ? ts.value : '1';
        h += '<div class="sf-card" style="padding:4px 14px;">';
        if (loops) {
            ['front', 'back'].forEach(function (side) {
                var s = $(side + '-nine-select');
                if (!s || !s.options.length) return;
                h += '<div class="sf-line"><span class="l">' + (side === 'front' ? 'Front 9' : 'Back 9') + '</span><span class="sf-chips">' + Array.prototype.map.call(s.options, function (o) {
                    return chip(String(o.textContent).split(' ')[0], s.value === o.value, 'data-sf-nine="' + side + '" data-v="' + esc(o.value) + '"');
                }).join('') + '</span></div>';
            });
        }
        h += '<div class="sf-line"><span class="l">Start</span><span class="sf-chips">'
            + chip('Hole 1', !S.shotgun && at !== '10', 'data-sf-start="1"')
            + (full ? chip('10', !S.shotgun && at === '10', 'data-sf-start="10"') : '')
            + chip('Shotgun', S.shotgun, 'data-sf-start="shotgun"') + '</span></div></div>';
        if (S.shotgun) h += '<div class="sf-note" style="margin:-4px 2px 10px;">Shotgun: Group 1 goes off hole 1, Group 2 hole 2, and so on.</div>';
        return h;
    }
    function step1() {
        locate();
        var all = S.gpsFiles ? courses() : [], q = S.q.toLowerCase(), key = courseKey();
        var body = '<input type="search" class="sf-search" id="sf-q" placeholder="🔍 Search courses" value="' + esc(S.q) + '" autocomplete="off" style="margin-bottom:12px;">';
        if (q.length >= 2) {
            var hits = all.filter(function (c) { return c.name.toLowerCase().indexOf(q) !== -1 || String(c.city || '').toLowerCase().indexOf(q) !== -1; })
                .sort(function (a, b) { return (b.ready - a.ready) || (a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q)); }).slice(0, 10);
            body += '<div class="sf-h">RESULTS</div>' + (hits.length ? hits.map(function (c) { return rowHtml(c, distTo(c), c.key === key); }).join('') : '<div class="sf-note">No course in the list by that name.</div>');
        }
        if (!S.changing) body += courseCard();
        if (q.length < 2 && (S.changing || !courseName())) {
            body += '<div class="sf-h">NEAR YOU</div>';
            if (S.near === 'asking' || S.near === null) body += '<div class="sf-note">Finding courses near you…</div>';
            else if (S.near === 'none') body += '<div class="sf-note">Turn on location to see courses near you. Search works without it.</div>';
            else if (!S.near.length) body += '<div class="sf-note">No courses we know of within 25 miles — search above.</div>';
            else body += S.near.slice(0, 6).map(function (x) { return rowHtml(x.c, x.d, x.c.key === key); }).join('');
        }
        body += '<button type="button" class="sf-link muted" data-sf="fullcourse">Not listed? Search online or add a course ›</button>';
        var ok = courseName() ? '' : ' disabled';
        var foot = S.mode === 'gps'
            ? '<button type="button" class="sf-cta lime" data-sf="startgps"' + (ok || (S.saving ? ' disabled' : '')) + '>' + (S.saving ? 'Starting…' : '📍 Start GPS') + '</button>' + (S.err1 ? '<div class="sf-err">' + esc(S.err1) + '</div>' : '')
            : '<button type="button" class="sf-cta" data-sf="next"' + ok + '>Next: Players ›</button>';
        return shell('Where are you playing?', body, foot, S.mode === 'gps' ? 0 : 1);
    }
    function rowHtml(c, d, on) {
        return '<button type="button" class="sf-row' + (on ? ' sf-sel' : '') + '" data-sf-course="' + esc(c.key) + '" data-sf-name="' + esc(c.name) + '"><span class="n">' + esc(nameOf(c)) + '</span>'
            + '<span class="s">' + esc(miStr(d)) + (c.ready ? (d != null ? ' · ' : '') + '✓ GPS' : '') + '</span></button>';
    }

    // ---- STEP 2: PLAYERS ----------------------------------------------------------
    var pasteTimer = null;
    function paste(text) {
        if (!String(text || '').trim()) return;
        var ta = $('paste-players-textarea'), commit = fn('commitPastedPlayers'), list = $('player-list');
        if (!ta || !commit || !list) return;
        // THE BOX IS THE ROSTER: each read replaces the golfers (and the groups the paste draws).
        list.innerHTML = '';
        try { groupSizeOverrides = {}; } catch (e) {}
        ta.value = text;
        try { commit(); } catch (e) { try { console.error('[simple flow] paste', e); } catch (x) {} }
        if (fn('renderDuplicateNamesBlock')) try { W.renderDuplicateNamesBlock(); } catch (e) {}
        S.pasted = text;
    }
    function meDefault(ps) {
        var mine = S.meName && ps.filter(function (p) { return p.name.trim().toLowerCase() === S.meName.toLowerCase(); })[0];
        if (mine) return mine;
        var H = HD(), n = typeof H.meName === 'function' ? H.meName() : '';
        var hit = n && n !== 'Me' ? ps.filter(function (p) { return first(p.name).toLowerCase() === n.toLowerCase(); })[0] : null;
        return hit || ps[0] || null;
    }
    function dupList() { var f = fn('rosterSameNames'); try { return f ? f() : []; } catch (e) { return []; } }
    function flightsOn() { var f = fn('flightsEnabledNow'); return !!(f && f()); }
    function summary() {
        var ps = players();
        if (!ps.length) return '';
        var g = groups(ps.length), withHcp = ps.filter(function (p) { return String(p.hcp || '').trim() !== ''; }).length;
        var h = '<div class="sf-card" id="sf-summary"><div class="sf-line" style="padding-top:0;border:0;"><b style="font-size:16px;">' + ps.length + ' golfer' + (ps.length === 1 ? '' : 's') + ' · ' + g.length + ' group' + (g.length === 1 ? '' : 's') + '</b>'
            + '<button type="button" class="sf-link" data-sf="roster">Edit</button></div>';
        if (flightsOn()) {
            var a = ps.filter(function (p) { return p.flight !== 'B'; }).length;
            h += '<div class="sf-line"><span class="l">Flights</span><span class="sf-chips"><span class="sf-chip on">A ' + a + '</span><span class="sf-chip on">B ' + (ps.length - a) + '</span></span></div>';
        } else if (ps.length >= 8) {
            h += '<div class="sf-line"><span class="l">Flights</span><button type="button" class="sf-btn" data-sf="split">Split A / B by handicap</button></div>';
        }
        var tsel = $('tee-rating-select'), topt = tsel && tsel.selectedIndex >= 0 ? tsel.options[tsel.selectedIndex] : null;
        if (topt && topt.value) {
            var tname = teeRows(courseKey()).filter(function (r) { return r.key === topt.value; })[0];
            h += '<div class="sf-line"><span class="l">Tees</span><span>' + esc(tname ? tname.name : topt.textContent) + ' for all \u00b7 <button type="button" class="sf-link" data-sf="mix" style="padding:0;min-height:0;">Mix</button></span></div>';
        }
        h += '<div class="sf-line"><span class="l">Handicaps</span><span>' + (withHcp === ps.length ? '✓ all ' + ps.length : withHcp + ' of ' + ps.length + ' · <button type="button" class="sf-link" data-sf="roster" style="padding:0;min-height:0;">add</button>') + '</span></div>';
        var me = meDefault(ps);
        h += '<div class="sf-line"><span class="l">You</span><select id="sf-me" style="min-height:40px;border:1px solid #dfe5df;border-radius:10px;font-size:15px;padding:0 8px;max-width:60%;">'
            + ps.map(function (p) { return '<option value="' + esc(p.name) + '"' + (me && me.id === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></div>';
        if (me) S.meName = me.name.trim();
        return h + '</div>';
    }
    function dupCard() {
        var same = dupList();
        if (!same.length) return '';
        var words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
        var ps = players();
        return '<div class="sf-warn" id="sf-dups">' + same.map(function (d) {
            var line = '⚠️ ' + (words[d.count] || d.count) + ' golfers named ' + esc(d.name) + '. ';
            if (!S.dupOpen) return '<div>' + line + '<button type="button" class="sf-link" data-sf="dupopen" style="padding:0;min-height:0;">Add initial</button></div>';
            return '<div style="margin-bottom:8px;">' + line + d.ids.map(function (id) {
                var p = ps.filter(function (x) { return String(x.id) === String(id); })[0] || {};
                return '<input type="text" data-sf-rename="' + esc(id) + '" value="' + esc(String(p.name || d.name).trim() + (String(p.name || '').trim().toLowerCase() === d.key ? ' ' : '')) + '" aria-label="' + esc(d.name) + (p.hcp ? ' (' + esc(p.hcp) + ')' : '') + '" placeholder="' + esc(d.name) + ' + initial">'
                    + '<div class="sf-note">' + esc(d.name) + (p.hcp ? ' · ' + esc(p.hcp) : '') + (p.flight ? ' · ' + esc(p.flight) : '') + '</div>';
            }).join('') + '</div>';
        }).join('') + '<div class="sf-note">They stay two golfers. The round starts once the names differ.</div></div>';
    }
    // TWO WAYS IN (URGENT-013, 5:17 PM): [Paste a list] [Type names]. Both write the wizard's own
    // player rows, so the summary card, flights and "Add initial" read the same roster either way.
    // NOTHING HERE RE-DRAWS THE BOX BEING TYPED IN: the paste box is read on a paste, on leaving
    // the box, or on Done; typed rows write straight into the wizard rows and only the summary
    // under them is re-drawn (sumOnly), so the keyboard never leaves.
    var PMODE = 'hardpan_players_mode';
    function pmode() {
        if (!S.pmode) { var m = ls(PMODE); S.pmode = m === 'paste' || m === 'type' ? m : 'type'; }
        return S.pmode;
    }
    function wizRow(id) { return Array.prototype.filter.call(D.querySelectorAll('#player-list .player-row'), function (r) { return r.getAttribute('data-player-id') === String(id); })[0] || null; }
    function allRows() {
        return Array.prototype.map.call(D.querySelectorAll('#player-list .player-row'), function (r) {
            var f = r.querySelector('.p-flight-input'), t = r.querySelector('.p-tee-input');
            return { id: r.getAttribute('data-player-id'), name: (r.querySelector('.p-name-input') || {}).value || '', hcp: (r.querySelector('.p-hcp-input') || {}).value || '', flight: f ? f.getAttribute('data-flight') : null, tee: t ? t.value : '' };
        });
    }
    function typeRows() {
        var rows = allRows(), tees = teeRows(courseKey()), fl = flightsOn();
        var teeSel = function (r) {
            if (tees.length < 2) return '';
            var row = wizRow(r.id), cur = row && row.querySelector('.p-tee-input') ? row.querySelector('.p-tee-input').value : '';
            return '<select class="sf-ttee" data-sf-ttee="' + esc(r.id) + '" aria-label="Tee"><option value="">Tee</option>' + tees.map(function (t) { return '<option value="' + esc(t.key) + '"' + (cur === t.key ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select>';
        };
        return '<div id="sf-type">' + rows.map(function (r, i) {
            return '<div class="sf-trow" data-sf-trow="' + esc(r.id) + '">'
                + '<input type="text" class="sf-tname" data-sf-tname="' + esc(r.id) + '" value="' + esc(r.name) + '" placeholder="Golfer ' + (i + 1) + '" autocomplete="off" autocapitalize="words" enterkeyhint="next" aria-label="Name ' + (i + 1) + '">'
                + '<input type="text" class="sf-thcp" data-sf-thcp="' + esc(r.id) + '" value="' + esc(r.hcp) + '" placeholder="HCP" inputmode="decimal" enterkeyhint="next" aria-label="Handicap ' + (i + 1) + '">'
                + (fl ? '<button type="button" class="sf-chip on sf-tfl" data-sf-tfl="' + esc(r.id) + '">' + esc(r.flight || 'A') + '</button>' : '')
                + teeSel(r) + '</div>';
        }).join('') + '</div><button type="button" class="sf-btn" data-sf="addgolfer" style="width:100%;min-height:48px;margin:4px 0 12px;">+ Add golfer</button>';
    }
    // A row with no name and no handicap is nobody (the wizard would save it as "Player N").
    function pruneEmpty() {
        if (!fn('captureCurrentPlayerInputs') || !fn('appendPlayerFrom')) return;
        var all = W.captureCurrentPlayerInputs(), keep = all.filter(function (p) { return String(p.name || '').trim() || String(p.hcp || '').trim(); });
        if (keep.length === all.length) return;
        $('player-list').innerHTML = '';
        if (fn('renderPlayerListHeaderAndWarning')) W.renderPlayerListHeaderAndWarning(keep.length);
        keep.forEach(function (p) { W.appendPlayerFrom(p, false, keep.length); });
        if (fn('updateCount')) W.updateCount();
    }
    function step2() {
        var m = pmode();
        if (m === 'type' && !allRows().length && fn('addNewPlayerAndRefresh')) W.addNewPlayerAndRefresh();
        var seg = '<div class="sf-seg" style="margin-bottom:12px;"><button type="button" data-sf-pmode="paste" class="' + (m === 'paste' ? 'on' : '') + '" style="flex:1;">Paste a list</button><button type="button" data-sf-pmode="type" class="' + (m === 'type' ? 'on' : '') + '" style="flex:1;">Type names</button></div>';
        var top = m === 'paste'
            ? '<textarea id="sf-paste" placeholder="Paste your pairings or type names…&#10;Skeens 2.0/A&#10;Glenn 12.0/B">' + esc(S.pasted || '') + '</textarea>'
                + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin:6px 2px 12px;"><span class="sf-note">One golfer a line, handicap after the name, /A or /B for a flight. A blank line starts a new group.</span><button type="button" class="sf-btn" data-sf="pastedone">Done</button></div>'
            : typeRows();
        var body = seg + top + '<div id="sf-p2sum">' + sumHtml() + '</div>';
        return shell('Who’s playing?', body, '<button type="button" class="sf-cta" data-sf="next">Next: Games ›</button>', 2);
    }
    function sumHtml() { return summary() + dupCard() + (S.err2 ? '<div class="sf-err">' + esc(S.err2) + '</div>' : ''); }
    function sumOnly() { var b = $('sf-p2sum'); if (b) b.innerHTML = sumHtml(); }
    // The paste box, read once per change of its text (never while typing in it).
    function readPaste() {
        var p = $('sf-paste'), text = p ? p.value : S.pasted;
        S.pasted = text;
        if (!String(text || '').trim() || text === S.pastedRead) return false;
        S.pastedRead = text;
        paste(text);
        ls(PMODE, 'paste');
        return true;
    }
    function addGolfer() {
        if (fn('addNewPlayerAndRefresh')) W.addNewPlayerAndRefresh();
        render();
        var ins = el().querySelectorAll('[data-sf-tname]'), last = ins[ins.length - 1];
        if (last) { try { last.focus(); last.scrollIntoView({ block: 'center' }); } catch (e) {} }
    }
    function typeKey(ev) {
        var t = ev.target;
        if (ev.key !== 'Enter' || !t.getAttribute) return;
        if (t.id === 'sf-paste') return;                       // Enter = a new line, in the box
        var id = t.getAttribute('data-sf-tname') || t.getAttribute('data-sf-thcp');
        if (!id) return;
        ev.preventDefault();
        if (t.getAttribute('data-sf-tname')) { var h = el().querySelector('[data-sf-thcp="' + id + '"]'); if (h) h.focus(); return; }
        var rows = Array.prototype.slice.call(el().querySelectorAll('[data-sf-tname]'));
        var at = rows.map(function (x) { return x.getAttribute('data-sf-tname'); }).indexOf(id);
        if (rows[at + 1]) rows[at + 1].focus(); else addGolfer();
    }

    // ---- STEP 3: GAMES ------------------------------------------------------------
    function pool() { var f = fn('captureMoneyPool'); try { return f ? f() : null; } catch (e) { return null; } }
    function poolLine(p) {
        if (!p) return 'Buy-in pot: skins, KP, net finish';
        var bits = [];
        if (p.skins && p.skins.mode && p.skins.mode !== 'none') bits.push('skins' + (flightsOn() && (fn('flightScopeNow') ? W.flightScopeNow('skins') : 'flight') === 'flight' ? ' per flight' : ''));
        if (p.kp && Number(p.kp.amount) > 0) bits.push('KP');
        if (p.net) bits.push('net finish');
        return money(p.buyIn) + (bits.length ? ' · ' + bits.join(', ') : '');
    }
    function myGroup(ps) {
        var me = meDefault(ps), i = me ? ps.indexOf(me) : 0, g = groups(ps.length);
        var b = g.filter(function (x) { return i >= x.startIdx && i < x.startIdx + x.size; })[0] || g[0];
        return { me: me, group: b ? b.group : 1, members: b ? ps.slice(b.startIdx, b.startIdx + b.size) : ps, many: g.length > 1 };
    }
    function who(k, ps) {
        var ids = (S.who[k] || []).filter(function (id) { return ps.some(function (p) { return String(p.id) === String(id); }); });
        if (!S.who[k]) {
            var mg = myGroup(ps), m = mg.members.slice();
            if (mg.me) m = [mg.me].concat(m.filter(function (p) { return p !== mg.me; }));
            ids = m.slice(0, k === 'hilo' ? 4 : 2).map(function (p) { return String(p.id); });
            S.who[k] = ids.slice();
        }
        return ids;
    }
    function sides(k, ps) {
        var ids = who(k, ps), n = ids.length;
        if (k === 'hilo' ? n !== 4 : !(n === 2 || n === 4)) return null;
        return { a: ids.slice(0, n / 2), b: ids.slice(n / 2) };
    }
    function nameById(ps, id) { var p = ps.filter(function (x) { return String(x.id) === String(id); })[0]; return p ? first(p.name) : '?'; }
    function whoBox(k, ps) {
        var ids = who(k, ps), sd = sides(k, ps), mg = myGroup(ps);
        var list = S.whoAll[k] ? ps : mg.members;
        return '<div class="sf-note" style="margin:6px 0 4px;">Tap who’s in (first ' + (k === 'hilo' ? 'two' : 'half') + ' = one side)</div><div class="sf-chips" style="justify-content:flex-start;">'
            + list.map(function (p) { var at = ids.indexOf(String(p.id)); return chip((at >= 0 ? (at + 1) + ' ' : '') + first(p.name), at >= 0, 'data-sf-who="' + k + '" data-id="' + esc(p.id) + '"'); }).join('')
            + (!S.whoAll[k] && mg.many ? '<button type="button" class="sf-link" data-sf-whoall="' + k + '">Anyone in the field ›</button>' : '') + '</div>'
            + '<div style="font-weight:800;margin-top:6px;">' + (sd ? sd.a.map(function (x) { return nameById(ps, x); }).join(' + ') + ' <span style="font-weight:400;">vs</span> ' + sd.b.map(function (x) { return nameById(ps, x); }).join(' + ')
                : '<span class="sf-err">' + (k === 'hilo' ? 'Tap four golfers (2 v 2)' : 'Tap two golfers (1 v 1) or four (2 v 2)') + '</span>') + '</div>';
    }
    var GAMES = [
        { k: 'weekly', n: 'Weekly Game', unit: 'buy-in' },
        { k: 'skins', n: 'Skins', s: '$ each into the pot', unit: 'each' },
        { k: 'nassau', n: 'Nassau', s: 'F9 / B9 / 18', unit: 'a bet' },
        { k: 'match', n: 'Match', s: '1v1 or 2v2', unit: 'the match' },
        { k: 'hilo', n: 'Hi-Lo', s: '2v2, low + high ball', unit: 'a point', only: hiloHere }
    ];
    function step3() {
        var ps = players(), p = pool();
        var tiles = GAMES.filter(function (g) { return !g.only || g.only(); }).map(function (g) {
            var on = S.games[g.k], sub = g.k === 'weekly' ? poolLine(on ? p : S.lastPool) : g.s;
            if (on && g.k !== 'weekly') sub = money(S.stake[g.k]) + ' ' + g.unit + (g.k === 'nassau' ? ' · F9 / B9 / 18' : '');
            return '<button type="button" class="sf-tile' + (on ? ' on' : '') + '" data-sf-game="' + g.k + '" aria-pressed="' + on + '"><span class="n">' + g.n + '</span><span class="s">' + esc(sub) + '</span></button>';
        }).join('') + '<button type="button" class="sf-tile" data-sf="moregames"><span class="n">More games ›</span><span class="s">Dots, 9 Points, Wolf, Vegas…</span></button>';
        var picked = GAMES.filter(function (g) { return S.games[g.k] && (!g.only || g.only()); });
        var stakes = picked.map(function (g) {
            var v = g.k === 'weekly' ? ((p && p.buyIn) || S.stake.weekly) : S.stake[g.k];
            return '<div class="sf-line" style="flex-wrap:wrap;"><span class="l"><b>' + g.n + '</b></span><span class="sf-money">$<input type="number" inputmode="decimal" min="0" data-sf-stake="' + g.k + '" value="' + esc(v) + '"> ' + g.unit + '</span>'
                + (g.k === 'nassau' || g.k === 'match' || g.k === 'hilo' ? '<div style="flex-basis:100%;">' + whoBox(g.k, ps) + '</div>' : '') + '</div>';
        }).join('');
        var body = '<div class="sf-grid">' + tiles + '</div>'
            + '<div class="sf-card">' + stakes
            + '<div class="sf-line"><span class="l">Scoring</span><span class="sf-seg"><button type="button" data-sf-scoring="net" class="' + (S.scoring === 'net' ? 'on' : '') + '">Net</button><button type="button" data-sf-scoring="gross" class="' + (S.scoring === 'gross' ? 'on' : '') + '">Gross</button></span></div>'
            + '<div class="sf-line"><button type="button" class="sf-link" data-sf="more" style="color:#334;font-weight:600;">More options</button><span class="sf-note">' + (S.moreOpen ? 'hide ˄' : 'payouts, carry ›') + '</span></div>'
            + (S.moreOpen ? moreBox() : '') + '</div>'
            + '<div class="sf-note" style="text-align:center;margin:4px 8px 8px;">Side bets get added during the round with + Bet (any hole, even ones already played)</div>'
            + (S.err3 ? '<div class="sf-err">' + esc(S.err3) + '</div>' : '');
        var foot = '<button type="button" class="sf-cta lime" data-sf="start"' + (S.saving ? ' disabled' : '') + '>' + (S.saving ? 'Starting…' : 'Start round ▶') + '<span class="sub">' + (picked.length ? 'Share group links \u2192 opens GPS' : 'Just scores \u2014 add a game any time') + '</span></button>';
        return shell('What are you playing?', body, foot, 3);
    }
    function moreBox() {
        var h = '';
        if (S.games.skins) h += '<div class="sf-line"><span class="l">Skins carry over</span><span class="sf-chips">' + chip('Carry', S.carry, 'data-sf-carry="1"') + chip('No carry', !S.carry, 'data-sf-carry="0"') + '</span></div>';
        if (S.games.nassau || S.games.match) h += '<div class="sf-line"><span class="l">Presses</span><span class="sf-chips">' + chip('Auto 2 down', S.press === '2down', 'data-sf-press="2down"') + chip('Any hole', S.press === 'anytime', 'data-sf-press="anytime"') + chip('None', S.press === 'none', 'data-sf-press="none"') + '</span></div>';
        if (flightsOn()) {
            var sc = fn('flightScopeNow') ? W.flightScopeNow('skins') : 'flight';
            h += '<div class="sf-line"><span class="l">Flights (skins)</span><span class="sf-chips">' + chip('Per flight', sc === 'flight', 'data-sf-flight="flight"') + chip('Whole field', sc === 'field', 'data-sf-flight="field"') + '</span></div>';
        }
        if (S.games.weekly) h += '<div class="sf-h" style="margin-top:10px;">WEEKLY GAME · PAYOUTS, KP, NET FINISH</div><div id="sf-pool-slot"></div>';
        if (!h) h = '<div class="sf-note" style="padding:8px 0;">Pick a game above to see its options.</div>';
        return h;
    }
    // The Weekly Game's own panel (payouts, KP, net finish, its skins), MOVED here while More
    // options is open - the wizard's controls themselves, so nothing is re-implemented.
    var poolHome = null;
    function placePool(here) {
        var panel = $('mp-panel');
        if (!panel) return;
        if (!poolHome) { poolHome = D.createComment('sf-pool-home'); panel.parentNode.insertBefore(poolHome, panel); }
        var slot = $('sf-pool-slot');
        if (here && slot && S.games.weekly) { slot.appendChild(panel); panel.style.display = 'block'; }
        else if (poolHome.parentNode && panel.parentNode !== poolHome.parentNode) poolHome.parentNode.insertBefore(panel, poolHome.nextSibling);
    }

    // ---- STEP 3 -> THE WIZARD'S FIELDS --------------------------------------------
    function applyWeekly() {
        var box = $('mp-enabled');
        if (!box) return;
        if (S.games.weekly && !box.checked) {
            if (S.lastPool && fn('loadMoneyPool')) W.loadMoneyPool({ moneyPool: S.lastPool });
            else { box.checked = true; if (fn('mpToggle')) W.mpToggle(); }
            if (!S.lastPool) setVal('mp-buyin', S.stake.weekly);
        } else if (!S.games.weekly && box.checked) { box.checked = false; if (fn('mpToggle')) W.mpToggle(); }
        if (S.games.weekly) { setVal('mp-skins-scoring', S.scoring); if (fn('mpRecalc')) try { W.mpRecalc(); } catch (e) {} }
    }
    function applySkins() {
        var list = wizSkins();
        if (!list) return;
        if (!S.games.skins) { if (list.length) { skinsInstances = []; if (fn('renderStackedGames')) try { W.renderStackedGames(); } catch (e) {} } return; }
        if (!list.length && fn('addSkinsInstance')) { W.addSkinsInstance(); list = wizSkins() || []; }
        var inst = list[0];
        if (!inst) return;
        inst.skinsBuyIn = Number(S.stake.skins) || 0;
        inst.skinsCarryOver = !!S.carry;
        inst.skinsPotFormat = S.scoring === 'gross' ? 'gross' : 'net';
        if (fn('renderStackedGames')) try { W.renderStackedGames(); } catch (e) {}
    }
    function apply() {
        try { applyWeekly(); } catch (e) { try { console.error('[simple flow] weekly', e); } catch (x) {} }
        try { applySkins(); } catch (e) { try { console.error('[simple flow] skins', e); } catch (x) {} }
    }
    // NASSAU / MATCH / HI-LO: written by the wizard's own save, through its side-match hook.
    function headToHead() {
        var out = {}, ps = players(), mg = myGroup(ps), now = Date.now(), i = 0;
        ['nassau', 'match', 'hilo'].forEach(function (k) {
            if (!S.games[k] || (k === 'hilo' && !hiloHere())) return;
            var sd = sides(k, ps);
            if (!sd) return;
            var amt = Number(S.stake[k]) || 0, pl;
            if (k === 'nassau' && typeof W.buildNassauWagerPayload === 'function') {
                pl = W.buildNassauWagerPayload({ teamAIds: sd.a, teamBIds: sd.b, frontStake: amt, backStake: amt, overallStake: amt, pressRule: S.press, scoring: S.scoring, startHole: 1, createdAt: now + i });
            } else if (k !== 'nassau') {
                // The Side Matches page's own shape (sideMatchPayloadFromTerms): match play / Hi-Lo, a stake.
                pl = { format: k, scoring: S.scoring === 'gross' ? 'gross' : 'net', teamAIds: sd.a.map(String), teamBIds: sd.b.map(String), startHole: 1, createdAt: now + i, stake: amt, pressRule: k === 'hilo' ? 'none' : S.press };
            }
            if (!pl) return;
            // One group's bet on a round of several groups: that group's, like a bet made from its link.
            var g = groups(ps.length);
            if (g.length > 1) {
                var all = sd.a.concat(sd.b), gs = all.map(function (id) { var at = ps.map(function (p) { return String(p.id); }).indexOf(String(id)); var b = g.filter(function (x) { return at >= x.startIdx && at < x.startIdx + x.size; })[0]; return b ? b.group : 0; });
                if (gs.every(function (x) { return x === gs[0]; })) { pl.scope = 'group'; pl.ownerGroup = gs[0]; }
                else pl.scope = 'field';
            }
            out['sideMatches/sf' + now.toString(36) + (i++)] = pl;
        });
        return out;
    }
    function hookSave() {
        var orig = W.spRoundSideMatchesForSave;
        if (typeof orig !== 'function' || orig.__sf) return;
        var wrapped = function () { var base = orig.apply(this, arguments) || {}; return S.code === String(typeof currentMode !== 'undefined' ? currentMode : '').toUpperCase() ? Object.assign(base, headToHead()) : base; };
        wrapped.__sf = true;
        W.spRoundSideMatchesForSave = wrapped;
    }

    // ---- START ROUND: ONE TAP -----------------------------------------------------
    function start() {
        S.err3 = '';
        if (!courseName()) { go(1); return; }
        pruneEmpty();
        if (!players().length) { S.err2 = 'Paste or type who\u2019s playing first.'; go(2); return; }
        if (dupList().length) { S.dupOpen = true; S.err2 = 'Two golfers have the same name — add an initial, then Start.'; go(2); return; }
        var bad = ['nassau', 'match', 'hilo'].filter(function (k) { return S.games[k] && (k !== 'hilo' || hiloHere()) && !sides(k, players()); });
        if (bad.length) { S.err3 = 'Pick who’s in the ' + bad.map(function (k) { return k === 'hilo' ? 'Hi-Lo' : k.replace(/^\w/, function (c) { return c.toUpperCase(); }); }).join(' and ') + '.'; render(); return; }
        apply();
        ls(PMODE, pmode());
        runSave('err3');
    }
    function runSave(errKey) {
        hookSave();
        var save = fn('saveSettings');
        if (!save) { S[errKey] = 'Round Setup is not ready \u2014 reload and try again.'; render(); return; }
        S.saving = true; render();
        var pr;
        try { pr = save(); } catch (e) { S.saving = false; S[errKey] = 'Could not start: ' + (e && e.message || e); render(); return; }
        Promise.resolve(pr).then(function () {
            // A refusal (a sentence in a dialog) gives the button back; a write in flight keeps it.
            setTimeout(function () { var b = $('main-save-btn'); if (!S.saved && !(b && b.disabled)) { S.saving = false; render(); } }, 400);
        }, function (e) { S.saving = false; S[errKey] = 'Could not start: ' + (e && e.message || e); render(); });
    }
    // THE GPS DOOR: Course & Tees, then "Start GPS" - the round is saved with you as its golfer
    // (Round Setup's own save, as the old GPS quick start did) and the map opens. Games: + Bet.
    function startGps() {
        S.err1 = '';
        if (!courseName()) return;
        var boxes = D.querySelectorAll('#player-list .p-name-input');
        var named = Array.prototype.some.call(boxes, function (i) { return String(i.value || '').trim(); });
        if (!named) {
            if (!boxes.length && fn('addNewPlayerAndRefresh')) W.addNewPlayerAndRefresh();
            var f = D.querySelector('#player-list .p-name-input'), H = HD();
            if (f) f.value = (typeof H.meName === 'function' ? H.meName() : '') || 'Me';
        }
        var first1 = players()[0];
        S.meName = first1 ? first1.name.trim() : 'Me';
        runSave('err1');
    }

    // ---- THE SHARE SHEET, THEN DONE -----------------------------------------------
    function afterSave(code) {
        if (!S.open && !S.away) return false;
        if (String(code || '').toUpperCase() !== S.code) return false;
        S.saved = true; S.saving = false;
        placePool(false);
        ['lobby-screen', 'admin-screen', 'round-ready-screen'].forEach(function (id) { var x = $(id); if (x) x.style.display = 'none'; });
        var ret = $('sf-return'); if (ret) ret.remove();
        S.away = false;
        show(true);
        S.step = 4; S.round = null; render();
        var dbr = wizDb();
        var got = function (d) {
            S.round = d || {};
            try { currentSavedRound = S.round; } catch (e) {}
            shotgun();
            remember();
            if (S.mode === 'gps') { done(); return; }
            render();
        };
        W.__sfRound = null;
        if (dbr) dbr.ref('events/' + code).once('value').then(function (s) { W.__sfRound = (s && s.val && s.val()) || {}; got(W.__sfRound); }, function () { got({}); });
        else got({});
        return true;
    }
    function savedPlayers() { return ((S.round && S.round.players) || players()); }
    function savedGroups() { var ps = savedPlayers(); var f = fn('computeGroupBoundaries'); try { return f ? f(ps.length, (S.round && S.round.groupSizeOverrides) || overrides()) : [{ group: 1, startIdx: 0, size: ps.length }]; } catch (e) { return [{ group: 1, startIdx: 0, size: ps.length }]; } }
    // SHOTGUN: each group off its own hole, in the round's groupStartingHoles (the field Round
    // Ready's per-group tee writes; play-order.js plays each group's card from there).
    function shotgun() {
        if (!S.shotgun || S.gunDone) return;
        var g = savedGroups(), holes = ((S.round && S.round.courseData) || []).map(function (h) { return Number(h.hole); });
        if (g.length < 2 || !holes.length) return;
        var map = {};
        g.forEach(function (b, i) { map[String(b.group)] = holes[i % holes.length]; });
        var dbr = wizDb();
        S.round.groupStartingHoles = map; S.gunDone = true;
        if (dbr) dbr.ref('events/' + S.code + '/groupStartingHoles').set(map).catch(function () {});
    }
    function startOf(g) {
        var m = S.round && S.round.groupStartingHoles;
        return m && m[String(g)] ? Number(m[String(g)]) : (Number(S.round && S.round.startingHole) || 1);
    }
    function meIn() {
        var ps = savedPlayers(), me = ps.filter(function (p) { return String(p.name || '').trim().toLowerCase() === String(S.meName || '').toLowerCase(); })[0] || null;
        var g = savedGroups(), i = me ? ps.indexOf(me) : -1;
        var b = i < 0 ? null : g.filter(function (x) { return i >= x.startIdx && i < x.startIdx + x.size; })[0];
        return { me: me, group: b ? b.group : null };
    }
    // THIS PHONE IS THE ORGANIZER AND PLAYS IN ITS OWN GROUP: the card opens on that group, with
    // this golfer as "You" - never "How are you joining this round?".
    function remember() {
        var m = meIn();
        if (m.me) ls('golfapp_me_' + S.code, String(m.me.id));
        if (m.group) ls('golfapp_role_' + S.code, 'scorekeeper');
        var lr = { code: S.code, at: Date.now(), course: (S.round && S.round.courseName) || courseName() };
        if (m.group) lr.group = String(m.group);
        ls('hardpan_last_round', JSON.stringify(lr));
        ls('lastRoomCode', S.code);
    }
    function url(g) { var f = fn('scorecardUrlFor'); return f ? f(S.code, g) : 'index.html?game=' + S.code + (g ? '&group=' + g : ''); }
    function shareLink(link, title) {
        try { if (W.navigator.share) { W.navigator.share({ title: title, text: title, url: link }).catch(function () {}); return; } } catch (e) {}
        try { W.navigator.clipboard.writeText(link).then(function () { if (fn('uiToast')) W.uiToast('Copied: ' + title); }, function () {}); } catch (e) {}
    }
    function share() {
        var d = S.round, ps = savedPlayers(), g = savedGroups();
        if (!d) return shell('Starting…', '<div class="sf-note">Saving the round…</div>', '', 0);
        var body = '<div class="sf-card" style="text-align:center;"><div class="sf-note">' + esc(String(d.courseName || courseName()).split(' (')[0]) + ' · ' + ps.length + ' golfer' + (ps.length === 1 ? '' : 's') + '</div>'
            + '<div class="sf-big" id="sf-code">' + esc(S.code) + '</div><div class="sf-note">Golfers with the app: Join with a code › type it.</div>'
            + (g.length > 1 ? '<button type="button" class="sf-btn" data-sf-share="0" style="margin-top:10px;">Share one link for everyone</button><div class="sf-note" style="margin-top:4px;">Each golfer picks their group when they open it.</div>' : '') + '</div>'
            + '<div class="sf-h">' + (g.length > 1 ? 'EACH GROUP’S LINK' : 'SCOREKEEPER LINK') + '</div>'
            + g.map(function (b) {
                var names = ps.slice(b.startIdx, b.startIdx + b.size).map(function (p) { return String(p.name || '').trim(); }).join(', ');
                return '<div class="sf-row" style="cursor:default;" data-sf-group="' + b.group + '"><span><span class="n">Group ' + b.group + '</span><span class="s" style="display:block;white-space:normal;">' + esc(names) + ' · Hole ' + startOf(b.group) + '</span></span>'
                    + '<button type="button" class="sf-btn" data-sf-share="' + b.group + '">Share</button></div>';
            }).join('')
            + '<button type="button" class="sf-btn" data-sf="qr" style="width:100%;min-height:50px;margin-top:4px;">📷 Show QR codes</button>'
            + '<div class="sf-note" style="margin-top:6px;">Hold the phone up on the first tee — each scorekeeper scans their group. Works with no signal.</div>';
        var gps = ready(courseKey() || d.activeCourseKey);
        return shell('✅ Round ready', body, '<button type="button" class="sf-cta" data-sf="done">Done · ' + (gps ? 'open the GPS' : 'open the card') + ' ▶</button>', 0);
    }
    function done() {
        var m = meIn(), d = S.round || {};
        var gps = S.mode === 'gps' || ready(courseKey() || d.activeCourseKey);
        ls('hardpan_round_side', (gps ? 'gps|' : 'bets|') + S.code);
        ss(MARK, null);
        var h = 'index.html?game=' + encodeURIComponent(S.code) + (m.group ? '&group=' + m.group : '') + (m.me ? '&me=' + encodeURIComponent(m.me.id) : '');
        W.location.href = h;
    }

    // ---- AWAY TO THE FULL SETUP, AND BACK ------------------------------------------
    function away(n, label) {
        placePool(false);
        S.away = true;
        show(false);
        try { W.goToWizardStep(n); } catch (e) {}
        try { W.scrollTo(0, 0); } catch (e) {}
        var b = $('sf-return');
        if (!b) { b = D.createElement('button'); b.type = 'button'; b.id = 'sf-return'; D.body.appendChild(b); b.onclick = back; }
        b.textContent = '✓ ' + (label || 'Done') + ' — back to New round';
    }
    function back() {
        var b = $('sf-return'); if (b) b.remove();
        S.away = false;
        show(true);
        render();
    }

    // ---- TAPS ---------------------------------------------------------------------
    function onClick(ev) {
        var t = ev.target, b;
        if (!t || !t.closest) return;
        if ((b = t.closest('[data-sf-course]'))) { pick(b.getAttribute('data-sf-course'), b.getAttribute('data-sf-name')); S.q = ''; S.changing = false; render(); el().scrollTop = 0; return; }
        if ((b = t.closest('[data-sf-tee]'))) {
            var tk = b.getAttribute('data-sf-tee'), tr = teeRows(courseKey()).filter(function (x) { return x.key === tk; })[0];
            setVal('tee-rating-select', tk); if (fn('applySelectedTee')) W.applySelectedTee();
            if (tr) ls(TEE_MEM + courseKey(), tr.name);
            S.teeChosen = courseKey();
            if (fn('refreshRowTeeControls')) try { W.refreshRowTeeControls(); } catch (e) {}
            render(); return;
        }
        if ((b = t.closest('[data-sf-nine]'))) { setVal(b.getAttribute('data-sf-nine') + '-nine-select', b.getAttribute('data-v'), true); render(); return; }
        if ((b = t.closest('[data-sf-start]'))) {
            var v = b.getAttribute('data-sf-start');
            S.shotgun = v === 'shotgun';
            setVal('tee-start-select', v === '10' ? '10' : '1');
            if (fn('teeStartChanged')) W.teeStartChanged();
            render(); return;
        }
        if ((b = t.closest('[data-sf-game]'))) {
            var k = b.getAttribute('data-sf-game');
            S.games[k] = !S.games[k];
            apply(); render(); return;
        }
        if ((b = t.closest('[data-sf-scoring]'))) { S.scoring = b.getAttribute('data-sf-scoring'); apply(); render(); return; }
        if ((b = t.closest('[data-sf-carry]'))) { S.carry = b.getAttribute('data-sf-carry') === '1'; apply(); render(); return; }
        if ((b = t.closest('[data-sf-press]'))) { S.press = b.getAttribute('data-sf-press'); render(); return; }
        if ((b = t.closest('[data-sf-flight]'))) { if (fn('setFlightScope')) W.setFlightScope('skins', b.getAttribute('data-sf-flight')); render(); return; }
        if ((b = t.closest('[data-sf-who]'))) {
            var gk = b.getAttribute('data-sf-who'), id = String(b.getAttribute('data-id')), cur = (S.who[gk] || []).slice(), at = cur.indexOf(id);
            if (at >= 0) cur.splice(at, 1); else cur.push(id);
            S.who[gk] = cur.slice(0, 4); render(); return;
        }
        if ((b = t.closest('[data-sf-pmode]'))) { if (S.pmode === 'paste') readPaste(); S.pmode = b.getAttribute('data-sf-pmode'); render(); return; }
        if ((b = t.closest('[data-sf-tfl]'))) { var fr = wizRow(b.getAttribute('data-sf-tfl')), fb = fr && fr.querySelector('.p-flight-input'); if (fb && fn('toggleRowFlight')) { W.toggleRowFlight(fb); b.textContent = fb.getAttribute('data-flight'); sumOnly(); } return; }
        if ((b = t.closest('[data-sf-whoall]'))) { S.whoAll[b.getAttribute('data-sf-whoall')] = true; render(); return; }
        if ((b = t.closest('[data-sf-share]'))) {
            var g = Number(b.getAttribute('data-sf-share'));
            shareLink(url(g || undefined), (g ? 'Group ' + g + ' · ' : '') + String((S.round && S.round.courseName) || 'HardPan round').split(' (')[0]);
            return;
        }
        var a = (b = t.closest('[data-sf]')) ? b.getAttribute('data-sf') : null;
        if (!a) return;
        if (a === 'back') {
            if (S.step === 4) return;
            if (S.step > 1) { go(S.step - 1); return; }
            ss(MARK, null);
            W.location.href = 'home.html';
            return;
        }
        if (a === 'next') { S.err2 = ''; if (S.step === 2 && pmode() === 'paste') readPaste(); if (S.step === 2) pruneEmpty(); if (S.step === 1 && !courseName()) return; if (S.step === 2 && !players().length) { S.err2 = 'Paste or type who’s playing.'; render(); return; } if (S.step === 2 && dupList().length) { S.dupOpen = true; S.err2 = 'Two golfers have the same name \u2014 add an initial first.'; render(); return; } go(S.step + 1); return; }
        if (a === 'pastedone') { readPaste(); render(); return; }
        if (a === 'addgolfer') { addGolfer(); return; }
        if (a === 'change') { S.changing = true; render(); var q = $('sf-q'); if (q) q.focus(); return; }
        if (a === 'startgps') { startGps(); return; }
        if (a === 'mix') { away(step('players'), 'Tees set'); return; }
        if (a === 'fullcourse') { away(step('course'), 'Course picked'); return; }
        if (a === 'roster') { away(step('players'), 'Roster done'); return; }
        if (a === 'moregames') { apply(); away(step('action'), 'Games done'); return; }
        if (a === 'split') {
            if (fn('setFlightsEnabled')) W.setFlightsEnabled(true);
            if (fn('refreshFlightsCount')) W.refreshFlightsCount();
            if (fn('applyFlightSplit')) W.applyFlightSplit();
            render(); return;
        }
        if (a === 'dupopen') { S.dupOpen = true; render(); var f = el().querySelector('[data-sf-rename]'); if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {} } return; }
        if (a === 'more') { S.moreOpen = !S.moreOpen; if (!S.moreOpen) placePool(false); render(); return; }
        if (a === 'start') { start(); return; }
        if (a === 'qr') {
            if (!fn('openRoundQrSheet')) return;
            W.openRoundQrSheet();
            // The QR sheet draws over the page, not over this screen: this one steps aside until it closes.
            var q = $('qr-sheet');
            if (!q || getComputedStyle(q).display === 'none') return;
            el().style.visibility = 'hidden';
            var t = setInterval(function () { var x = $('qr-sheet'); if (!x || getComputedStyle(x).display === 'none') { clearInterval(t); el().style.visibility = ''; } }, 250);
            return;
        }
        if (a === 'done') { done(); return; }
    }
    function onInput(ev) {
        var t = ev.target;
        if (t.id === 'sf-q') { S.q = t.value; clearTimeout(S.qt); S.qt = setTimeout(function () { render(); var q = $('sf-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); return; }
        if (t.id === 'sf-paste') { S.pasted = t.value; return; }   // read on paste / leaving the box / Done
        if (t.getAttribute('data-sf-tname') || t.getAttribute('data-sf-thcp')) {
            var tid = t.getAttribute('data-sf-tname') || t.getAttribute('data-sf-thcp'), wr = wizRow(tid);
            var box = wr && wr.querySelector(t.getAttribute('data-sf-tname') ? '.p-name-input' : '.p-hcp-input');
            if (box) { box.value = t.value; box.dispatchEvent(new Event('input', { bubbles: true })); }
            clearTimeout(S.sumT); S.sumT = setTimeout(sumOnly, 250);
            ls(PMODE, 'type');
            return;
        }
        if (t.getAttribute('data-sf-stake')) {
            var k = t.getAttribute('data-sf-stake');
            S.stake[k] = t.value;
            if (k === 'weekly') { setVal('mp-buyin', t.value); if (fn('mpRecalc')) try { W.mpRecalc(); } catch (e) {} }
            else apply();
            return;
        }
        if (t.getAttribute('data-sf-rename')) {
            var id = t.getAttribute('data-sf-rename');
            var row = Array.prototype.filter.call(D.querySelectorAll('#player-list .player-row'), function (r) { return r.getAttribute('data-player-id') === String(id); })[0];
            var box = row && row.querySelector('.p-name-input');
            if (box) { box.value = t.value; box.dispatchEvent(new Event('input', { bubbles: true })); }
        }
    }
    function onChange(ev) {
        var t = ev.target;
        if (t.id === 'sf-me') { S.meName = t.value; S.who = { nassau: null, match: null, hilo: null }; render(); return; }
        if (t.getAttribute('data-sf-rename')) {
            if (fn('renderDuplicateNamesBlock')) try { W.renderDuplicateNamesBlock(); } catch (e) {}
            if (!dupList().length) { S.dupOpen = false; S.err2 = ''; }
            render(); return;
        }
        if (t.id === 'sf-paste') { if (readPaste()) sumOnly(); return; }
        if (t.getAttribute('data-sf-ttee')) {
            var tr2 = wizRow(t.getAttribute('data-sf-ttee')), ts2 = tr2 && tr2.querySelector('.p-tee-input');
            if (ts2) { ts2.value = t.value; ts2.dispatchEvent(new Event('change', { bubbles: true })); }
            return;
        }
        if (t.getAttribute('data-sf-tname')) { if (fn('renderDuplicateNamesBlock')) try { W.renderDuplicateNamesBlock(); } catch (e) {} sumOnly(); return; }
        if (t.getAttribute('data-sf-stake')) render();
    }

    // ---- ARRIVAL ------------------------------------------------------------------
    // What the round already holds (Same as last week's copy): its games lit up on Step 3.
    function readBack() {
        var mp = $('mp-enabled'); if (mp && mp.checked) { S.games.weekly = true; var p = pool(); if (p && p.buyIn) S.stake.weekly = p.buyIn; }
        var list = wizSkins() || [];
        if (list.length) { S.games.skins = true; S.stake.skins = list[0].skinsBuyIn; S.carry = list[0].skinsCarryOver !== false; }
        var sc = $('mp-skins-scoring'); if (mp && mp.checked && sc && sc.value) S.scoring = sc.value === 'gross' ? 'gross' : 'net';
    }
    function lastPool() {
        var last = ls('lastRoomCode'), dbr = wizDb();
        if (!last || !dbr || last === S.code) return;
        try { dbr.ref('events/' + last + '/moneyPool').once('value').then(function (s) { var p = s && s.val ? s.val() : null; if (p && p.enabled) { S.lastPool = p; if (S.step === 3) render(); } }, function () {}); } catch (e) {}
    }
    function whenReady(m, go2) {
        var n = 0, seen = 0;
        var t = setInterval(function () {
            n++;
            var a = $('admin-screen'), up = a && a.style.display !== 'none' && typeof W.goToWizardStep === 'function';
            var existing = typeof loadedExistingRound !== 'undefined' && loadedExistingRound;
            if (up && existing) { clearInterval(t); ss(MARK, null); return; }   // an existing round: never this flow
            var copied = m.mode !== 'same' || (D.querySelectorAll('#player-list .player-row').length > 0 && courseName());
            if (up && copied) seen++;
            if (seen >= 4 || n > 100) { clearInterval(t); if (up) go2(); }
        }, 150);
    }
    function boot() {
        if (!/admin\.html$/.test(String(W.location.pathname || ''))) return;
        var code = String(params().get('game') || '').toUpperCase();
        if (!code) return;
        var m = claim(code);
        if (!m) return;
        if (!switchOn()) { ss(MARK, null); return; }
        S.mode = m.mode === 'same' || m.mode === 'gps' ? m.mode : 'new';
        S.code = code;
        // Painted at once (the wizard boots underneath); the steps fill in when it is up.
        show(true);
        el().innerHTML = shell(S.mode === 'same' ? 'Same as last week' : S.mode === 'gps' ? 'Where are you playing?' : 'New round', '<div class="sf-note">Getting things ready…</div>', '', S.mode === 'same' ? 3 : 1);
        whenReady(m, function () {
            hookSave();
            readBack();
            if (S.mode === 'new') lastPool();
            gpsFiles(function () { if (S.step === 1 || S.step === 4) render(); });
            S.step = S.mode === 'same' ? 3 : 1;
            if (S.mode === 'same') { var ps = players(); var me = meDefault(ps); if (me) S.meName = me.name.trim(); }
            render();
            if (S.step === 1) watchTees();
        });
        // An existing round (whenReady saw it): hide again.
        var guard = setInterval(function () { if (!ss(MARK) && S.open && !S.saved) { show(false); clearInterval(guard); } }, 300);
        setTimeout(function () { clearInterval(guard); }, 20000);
    }
    W.HardPanSimpleFlow = { afterSave: afterSave, state: function () { return S; }, open: function () { return S.open; } };
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
