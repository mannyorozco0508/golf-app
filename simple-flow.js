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
        // URGENT-038 #27: presses start Off - one Nassau default everywhere ($5 a bet, presses off), as + Bet.
        scoring: 'net', press: 'none', carry: true, moreOpen: false, dupOpen: false,
        web: null, webLocal: []
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
        // POLISH #13 (map helper, SHARED): a solid band under the status bar / Dynamic Island - the list scrolls under it, not the clock.
        + '#sf::before{content:"";position:fixed;left:0;right:0;top:0;height:env(safe-area-inset-top);background:#f2f4ef;z-index:4;pointer-events:none}'
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
        // URGENT-015: a tap on this screen is not a tap on Round Setup's page. Its document click
        // handler re-resolves the course from the TYPED NAME on every click outside its search
        // box (last record with that exact name wins, or a brand-new "comm_" course) - so a tap
        // here could quietly swap the picked course for another record. Taps stop here.
        e.addEventListener('click', function (ev) { S.tap = true; try { onClick(ev); } finally { S.tap = false; } ev.stopPropagation(); });
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
    function render(keep) {
        if (!S.open) return;
        if (S.step === 1) holdPick();
        var e = el(), y = e.scrollTop, html;
        if (S.step === 1) html = step1();
        else if (S.step === 2) html = step2();
        else if (S.step === 3) html = step3();
        else html = share();
        if (S.ask && S.step === 1) html += askHtml();
        if (!(S.step === 1 && keepBox(e, html, keep))) e.innerHTML = html;
        if (S.step === 1) offlineMount();
        if (S.step === 3 && S.moreOpen) placePool(true);
        e.scrollTop = y;
    }
    // URGENT-035 (Manny, 6:05 PM: "it's really hard to type… there's like a stutter"). THE CAUSE: every
    // redraw of the course step rebuilt the whole screen, the search box with it - 250 ms after a letter,
    // and again for "Searching all courses…" and its answer. The box being typed in was thrown away for a
    // new one, focused again by code and its cursor put at the end: on the phone the keyboard lets go and
    // takes hold again (a letter in that moment lands late, or in the old box and is lost), and a cursor
    // placed mid-word jumps to the end. Now the SEARCH BOX IS NEVER REDRAWN: everything around it is
    // replaced and the box itself (its letters, focus and cursor) is left alone. Only a query reset by
    // the screen (a course picked) is written into it. A tap that redraws the screen still lets go of the
    // keyboard, as before (render(true): the typing / online-search redraws keep it).
    function keepBox(e, html, keep) {
        var old = $('sf-q');
        if (!old || !e.contains(old)) return false;
        var tmp = D.createElement('div'); tmp.innerHTML = html;
        var nu = tmp.querySelector('#sf-q');
        if (!nu) return false;
        var oc = [], nc = [], x, i;
        for (x = old; x && x !== e; x = x.parentNode) oc.push(x);
        for (x = nu; x && x !== tmp; x = x.parentNode) nc.push(x);
        if (oc.length !== nc.length) return false;
        for (i = 0; i < oc.length; i++) if (oc[i].tagName !== nc[i].tagName) return false;
        for (i = oc.length - 1; i >= 0; i--) {   // top down: each level's other nodes are the new ones
            var o = oc[i], n = nc[i], op = o.parentNode, np = n.parentNode, after = false;
            Array.prototype.slice.call(op.childNodes).forEach(function (c) { if (c !== o) op.removeChild(c); });
            Array.prototype.slice.call(np.childNodes).forEach(function (c) { if (c === n) { after = true; return; } if (after) op.appendChild(c); else op.insertBefore(c, o); });
            if (i > 0) {
                Array.prototype.slice.call(o.attributes).forEach(function (a) { if (!n.hasAttribute(a.name)) o.removeAttribute(a.name); });
                Array.prototype.forEach.call(n.attributes, function (a) { if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value); });
            }
        }
        if (old.value !== S.q) old.value = S.q;
        if (!keep && S.tap && D.activeElement === old) old.blur();
        return true;
    }
    // URGENT-036 #36 (POLISH 029 #36: "Download for offline" was only in Game Day setup). The GPS
    // door's Course & Tees screen offers it too, for the picked course: Round Setup's own row
    // (admin.html gpsOfflineRow - the same download, the same buttons and words), drawn into this
    // screen's slot. Each course keeps its own row element, put back after every redraw, so a
    // download in progress keeps its button and its count, and never paints over another course.
    function offlineMount() {
        var slot = $('sf-offline-slot'), row = fn('gpsOfflineRow'), key = courseKey();
        if (!slot || !row || !key) return;
        var o = S.off && S.off.key === key ? S.off : null;
        if (!o) {
            var el = D.createElement('div');
            el.id = 'sf-offline-row';
            el.setAttribute('role', 'status');
            el.style.cssText = 'margin:-2px 2px 12px; font-size:0.82rem; font-weight:700; display:none; color:var(--text-muted);';
            o = S.off = { key: key, el: el, sig: '' };
        }
        var ready = readyOf(key), sig = (ready ? 1 : 0) + '|' + (W.HardPanGpsOffline ? 1 : 0);
        if (o.sig !== sig && !o.el.querySelector('button[disabled]')) {
            o.sig = sig;
            try { row(key, { status: ready ? 'ready' : 'none' }, courseName(), o.el); } catch (e) {}
        }
        if (o.el.parentNode !== slot) slot.appendChild(o.el);
        // The download code (gps-offline.js) loads the way Round Setup loads it (gpsGolfApiLoad: in the app).
        var load = fn('gpsGolfApiLoad');
        if (!W.HardPanGpsOffline && load && !S.offLoad) {
            S.offLoad = 1;
            try { load().then(function () { if (S.open && S.step === 1) offlineMount(); }, function () {}); } catch (e) {}
        }
    }
    function go(n) { if (S.step === 3 && n !== 3) placePool(false); S.step = n; var e = el(); render(); e.scrollTop = 0; }

    // ---- STEP 1: COURSE -----------------------------------------------------------
    function gpsFiles(done) {
        if (S.gpsFiles) { done(); return; }
        var H = HD(), need = [];
        // The app's GPS settings first (021): which courses have GPS on THIS phone (GolfAPI in the app,
        // OpenStreetMap on the web) is read from them - Round Setup loads them late, and the list was
        // judged by the web's rules in the app (O'odham "✓ GPS", Thistle without it).
        if (!W.HARDPAN_GPS_CONFIG) need.push('gps-config.js');
        if (!W.HardPanGeo) need.push('gps-geo.js');   // URGENT-022: ✓ GPS is the map's own rule (gps-geo courseGps)
        if (!W.HardPanGpsCourses) need.push('gps-courses.js');
        if (!W.HardPanGolfApi && !W.__fdGolfApiTried) { W.__fdGolfApiTried = 1; need.push('gps-golfapi.js'); }
        (H.STATES || []).forEach(function (s) { if (!(W.HardPanGpsCoverage && W.HardPanGpsCoverage[s])) need.push('gps-coverage-' + s.toLowerCase() + '.js'); });
        var left = need.length;
        // URGENT-019 (Manny, 2:47 AM: Talking Stick "isn't mapped", from NEAR YOU): the course list
        // is worked out ONCE (front-door allCourses) - and on the phone it was worked out before these
        // files landed, so it never held the app's GolfAPI courses (Talking Stick South - Piipaash, ✓ GPS,
        // Black / Gold / Jade) and its GPS-ready flags were all off. Worked out again once they are in.
        var fin = function () {
            S.gpsFiles = true; if (typeof H.refreshCourses === 'function') H.refreshCourses(); S.near = S.here ? nearList(S.here) : S.near; done();
            // 021: ✓ GPS on every course with live GPS - the GPS links and set greens, read once.
            if (typeof H.loadGpsKeys === 'function') H.loadGpsKeys(function () { if (S.here && S.near && S.near.length !== undefined) S.near = nearList(S.here); if (S.open && S.step === 1) render(); });
        };
        if (!left || typeof H.loadScriptTimed !== 'function') { fin(); return; }
        need.forEach(function (src) { H.loadScriptTimed(src, function () { if (--left === 0) fin(); }); });
    }
    // Every course Round Setup can start: the app's list (front-door allCourses) plus the shared
    // courses Round Setup itself lists (globalCourses: gca_ / gapi_ / comm_), each with its point.
    function nk(n) { var H = HD(); return String(typeof H.shownName === 'function' ? H.shownName(n) : n).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    // THE COURSE RESOLVER (front-door.js window.HardPanCourse): this screen's list, NEAR YOU, search, the
    // ✓ GPS badge and "has a card" are the resolver's - the same record every screen and the map use.
    function HC() { return W.HardPanCourse || null; }
    function courses() { var c = HC(); try { return c ? c.list() : []; } catch (e) { return []; } }
    function nearList(here) { var c = HC(); try { return c && here ? c.near(here, 9) : []; } catch (e) { return []; } }
    // POLISH #22 (map helper, SHARED): a trailing "(Papago)" that repeats the name is dropped (gps-round.js tidyCourse).
    function dropRepeat(n) { var s = String(n == null ? '' : n), m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(s.trim()); if (!m) return s; var w = function (t) { return String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean); }, h = w(m[1]), t = w(m[2]); return t.length && t.every(function (x) { return h.indexOf(x) >= 0; }) ? m[1] : s; }
    function nameOf(c) { var H = HD(); return dropRepeat(typeof H.shownName === 'function' ? H.shownName(c.name) : c.name); }
    function readyOf(key) { var c = HC(); try { return !!(c && key && c.resolve(key).hasGps); } catch (e) { return false; } }
    function distTo(c) { var H = HD(); return S.here && c.pt && typeof H.miles === 'function' ? H.miles(S.here, c.pt) : null; }
    function miStr(d) { return d == null ? '' : (d < 10 ? d.toFixed(1) : Math.round(d)) + ' mi'; }
    function locate() {
        var H = HD();
        if (S.near || typeof H.position !== 'function') return;
        S.near = 'asking';
        gpsFiles(function () {
            H.position(function (p, why) {
                if (!p) { if (S.near === 'asking') { S.near = 'none'; S.nearWhy = why || 'none'; } if (S.step === 1) render(); return; }
                S.here = p;
                S.near = nearList(p);
                // THE CLOSEST, ALREADY PICKED (a round with no course yet).
                // THE COURSE YOU ARE AT (URGENT-019): the closest one - a GPS-ready one only when it is that
                // same spot (within a mile of the closest), never a GPS course across town over the one
                // you are standing on (on the phone, ✓ GPS is only the app's GolfAPI courses).
                var c0 = S.near[0], cand = c0 ? S.near.filter(function (x) { return x.c.ready && x.d - c0.d <= 1; }).concat(S.near) : S.near;
                if (S.mode !== 'gps') cand = S.near;
                if (!courseKey() && !courseName() && cand.length) { pick(cand[0].c.key, cand[0].c.name); if (S.mode === 'gps') lookup(cand[0].c.key, cand[0].c.name); }
                if (S.step === 1) render();
            });
        });
    }
    // URGENT-015: THE PICK HOLDS, AND THE CARD IS IN HAND BEFORE ANYTHING USES IT.
    // Measured on the preview: the phone's position can come back before Round Setup has
    // finished reading the new round, and that read ends by blanking the course fields
    // (loadModeData: a round with no course yet) - after the closest course was already
    // picked. The screen kept drawing "Dobson Ranch ✓ GPS" while Round Setup underneath
    // held nothing, or a key whose card had not landed: no tee list, and Start answered
    // "Course card problem: this course has no hole card yet". Now the pick is remembered
    // and put back if the load blanks it, the tee list waits on the card read itself (not a
    // fixed 8 s), and Next / Start GPS / Start round wait for the card (reading it again
    // once if the first read came back empty) and say so in place if there is none.
    // ---- NO SCORECARD OR NO GPS: LOOK IT UP, BY ITSELF (URGENT-021, Manny 8:40 AM: "This is what I
    // don't want to do. Enter pars.") --------------------------------------------------------------
    // A picked course with no card or no GPS: the same online lookup as Round Setup's "Search online"
    // (gps-live find -> gpsCourse, our Cloud Functions - the phone never calls GolfAPI), once, with
    // "Getting <course>'s scorecard…". The function saves it for everyone: its card
    // (global_courses/gapi_<id>), its GPS (gps_courses), and the link from our record when we have
    // one (gps_links). Its own guards hold the credits (a floor, per-day caps, one pull per course);
    // this phone asks once per course per 30 days. Not found: said plainly, with Pick another course
    // and Request this course first, and "Enter pars yourself" last and small.
    var LOOK = 'hardpan_autolook_', LOOK_MS = 30 * 24 * 3600 * 1000;
    function hasCard(key) { var c = HC(); try { return !!(c && key && c.hasCard(key)); } catch (e) { return false; } }
    function liveOn() { var L = W.HardPanGpsLive; try { return !!(L && L.on && L.on()); } catch (e) { return false; } }
    function partOf(n) { var m = /\(([^)]*)\)/.exec(String(n)); return m ? nk(m[1]).replace(/course$/, '') : ''; }
    function lookup(key, name) {
        var L = W.HardPanGpsLive;
        if (S.offline === 'offline') return false;   // no round code, no signal: nothing is looked up online
        if (!key || !liveOn() || !L.find || !L.course) return false;
        if (readyOf(key) && hasCard(key)) return false;
        var at = Number(ls(LOOK + key) || 0);
        if (at && Date.now() - at < LOOK_MS) { if (!hasCard(key)) S.lookup = { key: key, state: 'none' }; return false; }
        ls(LOOK + key, String(Date.now()));
        try { (W.__sfLook = W.__sfLook || []).push(key); } catch (e) {}   // (the tests count the lookups made)
        var c = courses().filter(function (x) { return x.key === key; })[0] || {};
        S.lookup = { key: key, state: 'busy' };
        if (S.step === 1) render();
        L.find(name, { city: c.city || '', state: c.state || '' }).then(function (f) {
            var hit = null;
            if (f && f.status === 'ok') {
                hit = f.clear || ((f.matches || []).length === 1 ? f.matches[0] : null);
                // Two at one club (O'odham / Piipaash): the one whose name holds ours in (...).
                var pt = partOf(name);
                if (!hit && pt) { var ms = (f.matches || []).filter(function (m) { return nk(String(m.club || '') + String(m.course || '')).indexOf(pt) !== -1; }); if (ms.length === 1) hit = ms[0]; }
            }
            if (!hit) return { status: f && f.status === 'ok' ? 'ambiguous' : ((f && f.status) || 'none') };
            return L.course(hit.id, key);
        }).then(function (r) {
            if (!S.lookup || S.lookup.key !== key) return;
            // Setting up a NEW course needs a signed-in golfer (the function's rule): say that, and ask
            // again after sign-in (the 30-day mark is cleared).
            if (r && (r.status === 'account' || r.status === 'signin')) { ls(LOOK + key, null); S.lookup = { key: key, state: 'signin' }; if (S.step === 1) render(); return; }
            if (!(r && r.status === 'ready')) { S.lookup = { key: key, state: 'none', why: r && r.status }; if (S.step === 1) render(); return; }
            var H = HD(), fin = function () {
                S.lookup = null;
                if (typeof H.loadGpsKeys === 'function') H.loadGpsKeys(function () { if (typeof H.refreshCourses === 'function') H.refreshCourses(); if (S.here) S.near = nearList(S.here); if (S.step === 1) render(); }, true);
                else if (S.step === 1) render();
            };
            // Its card is a new shared record (no card of ours): read it, and that record is the pick.
            if (r.cardKey && !hasCard(key) && wizDb()) {
                wizDb().ref('global_courses/' + r.cardKey).once('value').then(function (snap) {
                    var rec = snap && snap.val ? snap.val() : null;
                    if (rec && rec.name && typeof globalCourses !== 'undefined' && globalCourses) globalCourses[r.cardKey] = rec;
                    if (rec && rec.name && courseKey() === key) pick(r.cardKey, rec.name);
                    fin();
                }, fin);
            } else fin();
        }, function () { if (S.lookup && S.lookup.key === key) { S.lookup = { key: key, state: 'none' }; if (S.step === 1) render(); } });
        return true;
    }
    function lookupBox(key, name) {
        var lk = S.lookup && S.lookup.key === key ? S.lookup : null;
        var nm = esc(String(name || '').split(' (')[0]);
        if (lk && lk.state === 'busy') return '<div class="sf-card" id="sf-lookup" style="display:flex;align-items:center;gap:10px;"><span class="sf-spin" aria-hidden="true">⏳</span><span class="sf-note" style="font-size:15px;">Getting ' + nm + '\u2019s scorecard\u2026</span></div>';
        if (lk && lk.state === 'signin') return '<div class="sf-card" id="sf-lookup"><div style="font-weight:800;font-size:16px;margin-bottom:6px;">Sign in to load ' + nm + '.</div><div class="sf-note" style="margin-bottom:10px;">Its scorecard and GPS are online - setting up a new course needs a signed-in golfer (Apple, Google or email). Once, for everyone.</div>'
            + '<button type="button" class="sf-cta" data-sf="signin" style="margin-bottom:8px;">Sign in</button><button type="button" class="sf-btn" data-sf="change" style="width:100%;min-height:46px;">Pick another course</button></div>';
        if (lk && lk.state === 'none' && hasCard(key) && S.noCard !== key) return '<div class="sf-note" id="sf-lookup" style="margin:-4px 2px 10px;">No GPS for ' + nm + ' in our data yet \u2014 its card and scores work; on the map, \u201cTap the middle of the green\u201d sets each green.</div>';
        if ((lk && lk.state === 'none') || S.noCard === key) return '<div class="sf-card" id="sf-lookup"><div style="font-weight:800;font-size:16px;margin-bottom:10px;">' + nm + ' isn\u2019t in our course data yet.</div>'
            + '<button type="button" class="sf-cta" data-sf="change" style="margin-bottom:8px;">Pick another course</button>'
            + '<button type="button" class="sf-btn" data-sf="request" style="width:100%;min-height:46px;">Request this course</button>'
            + '<div style="text-align:center;margin-top:6px;"><button type="button" class="sf-link muted" data-sf="enterpars" style="font-size:13px;">Enter pars yourself</button></div></div>';
        return '';
    }
    // ---- THE SEARCH BOX LOOKS ONLINE BY ITSELF (URGENT-027, Manny 12:25 PM: "Aguila" showed "No course
    // in the list by that name." and nothing else) ----------------------------------------------------
    // Local first, forgiving: case, punctuation, "Golf Course" / "GC" / "Golf Club" ignored, a letter or
    // two off ("agulia"). Fewer than 3 good local matches, 3+ letters, a 600 ms pause: every US course
    // through gps-live search (our gpsSearch Cloud Function - the phone never calls GolfAPI), "Searching
    // all courses…", then the rows with city/state and ✓ GPS where GolfAPI has the greens. A course we
    // already list stays one row. Each query's answer is kept on this phone 30 days (the function keeps
    // it 30 days for everyone too: 0.1 credit the first time anyone asks, then 0). A tap pulls it once
    // for everyone (gpsCourse: card + tees + greens, URGENT-021's path) and its card record is the pick.
    var WEB = 'hardpan_websearch_', WEB_MS = 30 * 24 * 3600 * 1000;
    var GEN = { golf: 1, course: 1, courses: 1, club: 1, gc: 1, cc: 1, the: 1, country: 1, links: 1, resort: 1, and: 1, at: 1, of: 1, municipal: 1, muni: 1 };
    function qWords(s) { return String(s || '').toLowerCase().replace(/['’`.]/g, '').split(/[^a-z0-9]+/).filter(function (w) { return w && !GEN[w]; }); }
    function editDist(a, b) {   // a word typed a letter or two off
        if (Math.abs(a.length - b.length) > 2) return 9;
        var p = [], i, j;
        for (j = 0; j <= b.length; j++) p[j] = j;
        for (i = 1; i <= a.length; i++) { var c = [i]; for (j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; }
        return p[b.length];
    }
    function wordHit(q, w) {
        if (w.indexOf(q) === 0) return true;
        var tol = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
        return tol > 0 && (editDist(q, w) <= tol || editDist(q, w.slice(0, q.length)) <= tol);
    }
    // 3: the text as typed, 2: its words (no "golf club"), 1: close enough (a typo), 0: no.
    function matchScore(c, raw) {
        var nm = String(c.name || '').toLowerCase(), q = raw.toLowerCase();
        if (nm.indexOf(q) !== -1 || String(c.city || '').toLowerCase().indexOf(q) !== -1) return 3;
        var qw = qWords(raw), nw = qWords(c.name);
        if (!qw.length) return 0;
        if (nw.join(' ').indexOf(qw.join(' ')) !== -1) return 2;
        return qw.every(function (x) { return nw.some(function (w) { return wordHit(x, w); }); }) ? 1 : 0;
    }
    function localHits(all, raw) {
        return all.map(function (c) { return { c: c, s: matchScore(c, raw) }; }).filter(function (x) { return x.s > 0; })
            .sort(function (a, b) { return (b.s - a.s) || (b.c.ready - a.c.ready) || a.c.name.localeCompare(b.c.name); });
    }
    function webKey(raw) { var w = qWords(raw).join(' '); return w.length >= 3 ? w : String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
    function webSearch() {
        var raw = String(S.q || '').trim(), L = W.HardPanGpsLive;
        if (S.step !== 1 || raw.length < 3 || !liveOn() || !L || !L.search) return;
        var k = webKey(raw);
        if (k.length < 3 || (S.web && S.web.k === k && S.web.state !== 'error')) return;
        if (localHits(courses(), raw).filter(function (x) { return x.s >= 2; }).length >= 3) return;
        var hit = null; try { hit = JSON.parse(ls(WEB + k) || 'null'); } catch (e) {}
        if (hit && hit.at && Date.now() - hit.at < WEB_MS) { S.web = { k: k, state: 'ok', results: hit.results || [] }; render1(); return; }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) { S.web = { k: k, state: 'offline' }; render1(); return; }
        var seq = S.webSeq = (S.webSeq || 0) + 1;   // URGENT-035: only the newest search's answer is used
        S.web = { k: k, state: 'busy', seq: seq };
        try { (W.__sfWeb = W.__sfWeb || []).push(k); } catch (e) {}   // (the tests count the online searches)
        render1();
        var cur = function () { return S.web && S.web.k === k && S.webSeq === seq; };
        var done = false, t = setTimeout(function () { if (!done) { done = true; if (cur()) { S.web = { k: k, state: 'error' }; render1(); } } }, 20000);
        Promise.resolve().then(function () { return L.search(k); }).then(function (r) {
            if (done) return; done = true; clearTimeout(t);
            if (!cur()) return;
            var st = r && r.status;
            if (st === 'ok') { var res = (r.results || []).slice(0, 25); ls(WEB + k, JSON.stringify({ at: Date.now(), results: res })); S.web = { k: k, state: 'ok', results: res }; }
            else S.web = { k: k, state: st === 'signin' || st === 'account' ? 'signin' : st === 'offline' ? 'offline' : 'error' };
            render1();
        }, function () { if (done) return; done = true; clearTimeout(t); if (cur()) { S.web = { k: k, state: 'error' }; render1(); } });
    }
    // Redraw the course step, keeping the golfer's place in the search box.
    function render1() {
        if (S.step !== 1) return;
        var a = W.document.activeElement, typing = a && a.id === 'sf-q';
        render(true);
        // URGENT-035: the box is kept (keepBox), focus and cursor untouched; only a rebuilt box is focused again.
        var q = $('sf-q'); if (typing && q && q !== a) { q.focus(); try { q.setSelectionRange(q.value.length, q.value.length); } catch (e) {} }
    }
    function webRowHtml(m) {
        var where = [m.city, m.state].filter(Boolean).join(', ');
        return '<button type="button" class="sf-row" data-sf-web="' + esc(m.id) + '" data-sf-name="' + esc(m.name || m.club) + '"><span class="n">' + esc(m.name || m.club) + '</span>'
            + '<span class="s">' + esc(where) + (m.gps ? (where ? ' · ' : '') + '✓ GPS' : '') + '</span></button>';
    }
    // The online part of RESULTS. shown: the local keys already listed; a course we already have is
    // added to webLocal (drawn as its own local row) instead of a second, online row.
    function webBox(shown) {
        var w = S.web, raw = String(S.q || '').trim();
        S.webLocal = [];
        if (!w || w.k !== webKey(raw)) return '';
        var p = w.pull;
        if (p) {
            var pn = esc(String(p.name).split(' (')[0]);
            if (p.state === 'busy') return '<div class="sf-card" id="sf-web" style="display:flex;align-items:center;gap:10px;"><span class="sf-spin" aria-hidden="true">⏳</span><span class="sf-note" style="font-size:15px;">Getting ' + pn + '’s scorecard…</span></div>';
            if (p.state === 'signin') return '<div class="sf-card" id="sf-web"><div style="font-weight:800;font-size:16px;margin-bottom:6px;">Sign in to load ' + pn + '.</div><div class="sf-note" style="margin-bottom:10px;">Setting up a new course needs a signed-in golfer (Apple, Google or email). Once, for everyone.</div>'
                + '<button type="button" class="sf-cta" data-sf="websignin" style="margin-bottom:8px;">Sign in</button><button type="button" class="sf-btn" data-sf="webback" style="width:100%;min-height:46px;">Pick another course</button></div>';
            return '<div class="sf-card" id="sf-web"><div style="font-weight:800;font-size:16px;margin-bottom:10px;">' + (p.state === 'offline' ? 'No signal — loading a new course needs a connection.' : p.state === 'error' ? 'Couldn’t load ' + pn + ' right now.' : pn + ' isn’t in our course data yet.') + '</div>'
                + '<button type="button" class="sf-cta" data-sf="webback" style="margin-bottom:8px;">Pick another course</button>'
                + '<button type="button" class="sf-btn" data-sf="webrequest" style="width:100%;min-height:46px;">Request this course</button></div>';
        }
        if (w.state === 'busy') return '<div class="sf-note" id="sf-web" style="margin:2px 2px 10px;display:flex;align-items:center;gap:8px;"><span class="sf-spin" aria-hidden="true">⏳</span>Searching all courses…</div>';
        if (w.state === 'offline') return '<div class="sf-note" id="sf-web" style="margin:2px 2px 10px;">No signal — searching all courses needs a connection.</div>';
        if (w.state === 'signin') return '<div class="sf-note" id="sf-web" style="margin:2px 2px 10px;">Sign in to search all courses. <button type="button" class="sf-link" data-sf="websignin" style="padding:0 0 0 4px;min-height:0;">Sign in</button></div>';
        if (w.state === 'error') return '<div class="sf-note" id="sf-web" style="margin:2px 2px 10px;">Couldn’t search all courses right now. <button type="button" class="sf-link" data-sf="webretry" style="padding:0 0 0 4px;min-height:0;">Try again</button></div>';
        var HCx = HC(), all = courses(), ck = function (t) { return String(t || '').toLowerCase().replace(/[^a-z]/g, ''); };
        var rows = (w.results || []).filter(function (m) {
            var rv = null; try { rv = HCx ? HCx.resolve({ key: 'gapi_' + m.id, name: m.name }) : null; } catch (e) {}
            // ...or the same name (no "golf club") in the same town: "Papago Golf Club" = "Papago Golf Course".
            var mc = qWords(m.name).join(' ');
            if (!(rv && rv.row) && mc) { var tw = all.filter(function (c) { return qWords(c.name).join(' ') === mc && (!c.city || !m.city || ck(c.city) === ck(m.city)); })[0]; if (tw) rv = { row: tw }; }
            if (rv && rv.row) { if (shown.indexOf(rv.row.key) === -1) { shown.push(rv.row.key); S.webLocal.push(rv.row); } return false; }
            return true;
        });
        return rows.length ? '<div id="sf-web">' + rows.map(webRowHtml).join('') + '</div>' : '';
    }
    // URGENT-028 (Manny, 1:03 PM: Papago open -> back -> Aguila from search -> Start Round -> Papago
    // hole 1 again). THE CAUSE: a tapped online course is only the pick once its pull (gpsCourse) and
    // its card record are in - seconds on a phone. Until then Round Setup's course (course-select)
    // still held the course picked before it (the closest one: Papago), and Start Round was live, so
    // a tap in that window started Papago. A pull that failed (no signal, an error) left it the same.
    // Now the tapped course is the PENDING pick (S.pend) from the tap until its card and tees are in:
    // the selected card is that course, Start Round reads "Loading <Course>…" and is off, and no other
    // course is ever started in its place. No signal: it waits and pulls again when the signal is back.
    function clubName(n) { return String(n || '').split(' (')[0].trim(); }
    function webPull(id, name) {
        var L = W.HardPanGpsLive, w = S.web;
        if (!L || !L.course) return;
        var me = { id: id, name: name, state: 'busy' };
        if (w) w.pull = me;
        S.pend = me; S.err1 = '';
        render1();
        var say = function (st) { if (S.pend === me) { me.state = st; render1(); } };
        if (typeof navigator !== 'undefined' && navigator.onLine === false) { say('offline'); return; }
        try { (W.__sfPull = W.__sfPull || []).push(id); } catch (e) {}
        L.course(id).then(function (r) {
            var st = r && r.status;
            if (st === 'account' || st === 'signin') return say('signin');
            if (st === 'offline') return say('offline');
            if (st !== 'ready') return say(st === 'nogps' || st === 'unknown' ? 'none' : 'error');
            if (!r.cardKey || !wizDb()) return say('none');
            return wizDb().ref('global_courses/' + r.cardKey).once('value').then(function (snap) {
                var rec = snap && snap.val ? snap.val() : null;
                if (!(rec && rec.name)) return say('none');
                if (S.pend !== me) return;   // the golfer picked another course meanwhile
                if (typeof globalCourses !== 'undefined' && globalCourses) globalCourses[r.cardKey] = rec;   /* global globalCourses */
                try { if (HC() && HC().refresh) HC().refresh(); } catch (e) {}
                if (S.web && S.web.pull === me) S.web = null;
                S.q = ''; S.changing = false; S.noCard = null; S.lookup = null; S.err1 = '';
                me.state = 'card'; me.key = r.cardKey; me.rec = rec;
                pick(r.cardKey, rec.name);   // held as S.pend until the card and tees are in
                render(); try { el().scrollTop = 0; } catch (e) {}
                var H = HD();
                if (typeof H.loadGpsKeys === 'function') H.loadGpsKeys(function () { if (typeof H.refreshCourses === 'function') H.refreshCourses(); if (S.here) S.near = nearList(S.here); if (S.step === 1) render(); }, true);
            }, function () { say('error'); });
        }, function () { say('error'); });
    }
    // The pending online course is in: its key is the pick, its card is in hand, its tees are listed.
    function pendDone() {
        var p = S.pend;
        if (!p) return true;
        if (p.state !== 'card' || courseKey() !== p.key || !cardInHand(p.key)) return false;
        var t = p.rec && p.rec.tees, need = !!(t && typeof t === 'object' && Object.keys(t).some(function (g) { var v = t[g]; return v && (Array.isArray(v) ? v.length : Object.keys(v).length); }));
        if (need && !teeRows(p.key).length) return false;
        S.pend = null;
        return true;
    }
    function pendBusy() { return !pendDone(); }
    // No signal while it waited: pulled again as soon as the signal is back.
    try { W.addEventListener('online', function () { var p = S.pend; if (p && p.state === 'offline' && S.open && S.step === 1) webPull(p.id, p.name); }); } catch (e) {}
    function pick(key, name) {
        var f = fn('selectCourse');
        if (!f) return;
        // The course's ONE record (an alias - a dropped twin, a linked copy - resolves to it).
        var rv = HC() && key ? HC().resolve({ key: key, name: name }) : null;
        if (rv && rv.row && rv.key !== key) { key = rv.key; name = rv.name; }
        S.picked = { key: key, name: name };
        f(key, name);
        S.shotgun = false;
        S.card = null;
        watchTees();
        cardFor(key).then(function () { if (S.step === 1 && courseKey() === key) render(); });
    }
    function holdPick() {
        if (!S.picked || S.step !== 1) return;
        if (courseKey() !== S.picked.key) { var p = S.picked; S.picked = null; pick(p.key, p.name); }
    }
    function cardInHand(key) { return !key || (fn('courseCardInHand') ? !!W.courseCardInHand(key) : true); }
    // Resolves { ok } once the picked course has its hole card (and tees, when it has any).
    function cardFor(key) {
        if (!key) return Promise.resolve({ ok: !!courseName() });
        if (cardInHand(key)) return Promise.resolve({ ok: true });
        var ens = typeof ensureCourseCard === 'function' ? ensureCourseCard : null;   /* global ensureCourseCard */
        var landed = function () {
            if (courseKey() !== key) return;
            if (fn('handleCourseChange')) try { W.handleCourseChange(); } catch (e) {}
            if (fn('syncTeeRatingFromCourse')) try { W.syncTeeRatingFromCourse(key, { keepSelection: true }); } catch (e) {}
        };
        var direct = function () {
            var dbr = wizDb();
            if (!dbr) return Promise.resolve(null);
            return new Promise(function (res) {
                var done = false, t = setTimeout(function () { if (!done) { done = true; res(null); } }, 15000);
                dbr.ref('global_courses/' + key).once('value').then(function (s) {
                    if (done) return; done = true; clearTimeout(t);
                    var rec = s && s.val ? s.val() : null;
                    if (rec && Array.isArray(rec.data) && rec.data.length && typeof globalCourses !== 'undefined' && globalCourses) globalCourses[key] = rec;
                    res(rec);
                }, function () { if (!done) { done = true; clearTimeout(t); res(null); } });
            });
        };
        var first = ens ? Promise.race([ens(key), new Promise(function (r) { setTimeout(function () { r(null); }, 15000); })]) : Promise.resolve(null);
        return first.then(function () {
            if (cardInHand(key)) { landed(); return { ok: true }; }
            return direct().then(function () { landed(); return { ok: cardInHand(key) }; });
        }, function () { return { ok: false }; });
    }
    function needCard(errKey, then) {
        if (pendBusy()) { render(); return; }   // URGENT-028: never another course while the picked one loads
        holdPick();
        var key = courseKey(), nm = courseName();
        if (!nm) return;
        S.cardWait = true; S[errKey] = ''; render();
        cardFor(key).then(function (r) {
            S.cardWait = false;
            var pv = fn('previewCourseData') ? W.previewCourseData(key) : { ok: r.ok };
            if (!r.ok || !pv.ok) {
                // URGENT-019 (Papago): not a dead end - the pars once (Round Setup's own scorecard entry,
                // saved for everyone), then Start; on the map, "Tap the middle of the green" sets each green.
                S.noCard = key;
                if (lookup(key, nm)) { S[errKey] = ''; return; }
                if (S.step !== 1) go(1); else render();
                return;
            }
            then();
        });
    }
    // The tees come with the course record, one read after the pick: drawn when they land.
    var teeTimer = null;
    function watchTees() {
        clearInterval(teeTimer);
        var n = 0, was = '';
        teeTimer = setInterval(function () {
            var sel = $('tee-rating-select'), now = sel ? sel.options.length + '|' + sel.value : '';
            if (now !== was) { was = now; if (S.step === 1) render(); }
            holdPick();
            if (++n > 150) clearInterval(teeTimer);
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
    // POLISH 029 #11: the first time at a course it is a MIDDLE tee, never the tips (Papago
    // pre-picked Black, 7,419 yds): the men's tees, the combos ("Black/Blue") left out when
    // there are plain ones, longest first, the one at the middle (5 -> the 3rd, 4 -> the 3rd,
    // 2 -> the shorter). After that, the tee this phone last started a round on there.
    var TEE_MEM = 'hardpan_last_tee_';
    function middleTee(rows) {
        var men = (rows || []).filter(function (r) { return r.gender !== 'female'; }), list = men.length ? men : (rows || []);
        var plain = list.filter(function (r) { return !/\//.test(r.name); });
        if (plain.length >= 2) list = plain;
        list = list.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) { return ((b.r.yards || 0) - (a.r.yards || 0)) || (a.i - b.i); }).map(function (x) { return x.r; });
        return list.length ? list[Math.floor(list.length / 2)] : null;
    }
    function preferTee(key) {
        var sel = $('tee-rating-select');
        if (!sel || S.teeChosen === key) return;   // the golfer's own tap (or Full setup) holds
        var rows = teeRows(key);
        if (!rows.length) return;
        var want = ls(TEE_MEM + key);
        var hit = want ? rows.filter(function (r) { return r.name.toLowerCase() === want.toLowerCase(); })[0] : null;
        if (!hit) hit = middleTee(rows);
        // Only once the round select holds THIS course's tees (it fills one read after the pick).
        if (!hit || !Array.prototype.some.call(sel.options, function (o) { return o.value === hit.key; })) return;
        if (sel.value !== hit.key) { sel.value = hit.key; if (fn('applySelectedTee')) W.applySelectedTee(); }
    }
    // The tee a round starts on is the one remembered for that course.
    function rememberTee() {
        var k = courseKey(), sel = $('tee-rating-select');
        if (!k || !sel || !sel.value) return;
        var r = teeRows(k).filter(function (x) { return x.key === sel.value; })[0];
        if (r) ls(TEE_MEM + k, r.name);
    }
    function teeList(key) {
        var rows = teeRows(key), sel = $('tee-rating-select');
        if (!rows.length) return cardInHand(key) || S.noCard === key || (S.lookup && S.lookup.key === key) ? '' : '<div class="sf-h">TEES</div><div class="sf-note" style="margin:0 2px 12px;">Loading the course card\u2026</div>';
        if (S.mode !== 'same') preferTee(key);
        return '<div class="sf-h">TEES</div>' + rows.map(function (r) {
            var on = sel && sel.value === r.key, col = teeColor(r.name);
            return '<button type="button" class="sf-row sf-tee' + (on ? ' sf-sel' : '') + '" data-sf-tee="' + esc(r.key) + '" aria-pressed="' + on + '">'
                + '<span style="display:flex;align-items:center;gap:12px;"><span class="sf-dot" style="background:' + col + ';' + (col === '#fff' ? 'border:1.5px solid #9aa0a6;' : '') + '"></span>'
                + '<span><span class="n" style="display:block;">' + esc(r.name) + '</span><span class="sf-note">' + (r.gender === 'female' ? 'Women' : 'Men') + '</span></span></span>'
                + '<span class="s" style="text-align:right;line-height:1.35;">' + (r.yards ? r.yards.toLocaleString('en-US') + ' yds<br>' : '') + esc(Number(r.rating).toFixed(1)) + ' / ' + esc(r.slope) + '</span></button>';
        }).join('');
    }
    // THE PICKED COURSE, ON TOP AND HIGHLIGHTED (URGENT-016: the NEAR YOU list sits right under it).
    function courseHead() {
        var key = courseKey(), name = courseName();
        if (!name) return '';
        var c = courses().filter(function (x) { return x.key === key; })[0];
        var d = c ? distTo(c) : null;
        return '<div class="sf-card sf-sel" id="sf-course" style="padding:12px 14px;"><div class="sf-line" style="border:0;padding:0;"><span class="n" style="font-size:16px;font-weight:800;">' + esc(c ? nameOf(c) : String(name).split(' (')[0]) + '</span>'
            + '<span class="sf-note">' + esc(miStr(d)) + ((c ? c.ready : readyOf(key)) ? (d != null ? ' · ' : '') + '✓ GPS' : '') + ' · <button type="button" class="sf-link" data-sf="change" style="padding:0;min-height:0;font-size:13px;">Change</button></span></div></div>';
    }
    // THE PENDING ONLINE COURSE AS THE SELECTED CARD (URGENT-028): its name, and where its load is.
    function pendHead(p) {
        var why = p.state === 'busy' ? 'Getting its scorecard and tees\u2026'
            : p.state === 'offline' ? 'No signal \u2014 it loads when the signal is back.'
            : p.state === 'signin' ? 'Sign in to load it.'
            : p.state === 'none' ? 'It isn\u2019t in our course data yet.' : 'Couldn\u2019t load it right now.';
        return '<div class="sf-card sf-sel" id="sf-course" data-sf-pend="' + esc(p.id) + '" style="padding:12px 14px;"><div class="sf-line" style="border:0;padding:0;"><span class="n" style="font-size:16px;font-weight:800;">' + esc(clubName(p.name)) + '</span>'
            + '<span class="sf-note">' + (p.state === 'busy' || p.state === 'offline' ? '\u23f3 ' : '') + esc(why) + (p.state === 'busy' ? '' : ' \u00b7 <button type="button" class="sf-link" data-sf="webback" style="padding:0;min-height:0;font-size:13px;">Pick another course</button>') + '</span></div></div>';
    }
    function courseCard() {
        var key = courseKey(), name = courseName();
        if (!name) return '';
        var h = teeList(key);
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
            + (full ? chip('Hole 10', !S.shotgun && at === '10', 'data-sf-start="10"') : '')
            + chip('Shotgun', S.shotgun, 'data-sf-start="shotgun"') + '</span></div></div>';
        if (S.shotgun) h += '<div class="sf-note" style="margin:-4px 2px 10px;">Shotgun: Group 1 goes off hole 1, Group 2 hole 2, and so on.</div>';
        return h;
    }
    function step1() {
        locate();
        var all = S.gpsFiles ? courses() : [], q = S.q.toLowerCase(), key = courseKey();
        var body = (S.offline ? offlineBox() : '') + '<input type="search" class="sf-search" id="sf-q" placeholder="🔍 Search courses" value="' + esc(S.q) + '" autocomplete="off" style="margin-bottom:12px;">';
        if (q.length >= 2) {
            // URGENT-027: forgiving local matches first, then every US course online (webBox).
            var hits = localHits(all, S.q.trim()).slice(0, 10).map(function (x) { return x.c; });
            var shown = hits.map(function (c) { return c.key; }), web = webBox(shown);
            hits = hits.concat(S.webLocal);
            var waiting = S.web && S.web.k === webKey(S.q.trim()) && (S.web.state === 'busy' || S.web.pull);
            body += '<div class="sf-h">RESULTS</div>' + hits.map(function (c) { return rowHtml(c, distTo(c), c.key === key); }).join('') + web
                + (!hits.length && !web && !waiting ? '<div class="sf-note">' + (q.trim().length < 3 ? 'Keep typing — 3 letters searches all courses.' : 'No course found by that name.') + '</div>' : '')
                + '<button type="button" class="sf-link muted" data-sf="fullcourse" style="font-size:13px;">Not listed? Add a course ›</button>';
        }
        // URGENT-028: a tapped online course still loading IS the selected card (never the one before it).
        var pend = pendBusy() ? S.pend : null, pendOld = pend && pend.state !== 'card';
        if (pendOld) body += pendHead(pend);
        // POLISH 029 #11: the TEES (and the start) sit right under the picked course, above NEAR YOU.
        else if (!S.changing) body += courseHead() + lookupBox(key, courseName()) + courseCard() + (S.mode === 'gps' && key ? '<div id="sf-offline-slot"></div>' : '');
        // NEAR YOU, ALWAYS (URGENT-016: with a course already picked the list was gone - only the
        // course and "Change"). The picked course is the card above; the list under it is the
        // others, closest first; a tap switches the course and its tees redraw in place.
        if (q.length < 2) {
            var yours = function () {
                var rec = recentCourses().filter(function (c) { return c.key !== key; });
                return rec.length ? '<div class="sf-h">YOUR COURSES</div>' + rec.map(function (c) { return rowHtml(c, null, false); }).join('') : '';
            };
            body += '<div class="sf-h">NEAR YOU</div>';
            if (S.near === 'asking' || S.near === null) body += '<div class="sf-note" style="margin-bottom:10px;">Finding courses near you…</div>';
            else if (S.near === 'none') {
                // NO POSITION (location denied, or it never answered): say which, offer a retry, and
                // list this phone's own courses instead of nothing.
                var nat = false; try { nat = !!(W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()); } catch (e) {}
                body += '<div class="sf-note" style="margin-bottom:10px;">' + (S.nearWhy === 'denied' ? (nat ? 'Location is off for HardPan. To see courses near you, turn it on in Settings \u203a HardPan \u203a Location, or search above.'
                    : 'Location is off for this page. To see courses near you, allow it (Safari: aA \u203a Website Settings \u203a Location), or search above.')
                    : 'Couldn\u2019t get your location yet. Search above, or try again.') + ' <button type="button" class="sf-link" data-sf="relocate" style="padding:0 0 0 4px;min-height:0;">Try again</button></div>';
                body += yours();
            }
            else {
                var others = S.near.filter(function (x) { return x.c.key !== key; }).slice(0, 8);
                if (!others.length) body += '<div class="sf-note" style="margin-bottom:10px;">No other courses we know of nearby — search above.</div>' + yours();
                else body += others.map(function (x) { return rowHtml(x.c, x.d, false); }).join('');
            }
        }
        if (q.length < 2) body += '<button type="button" class="sf-link muted" data-sf="fullcourse">Not listed? Add a course ›</button>';
        var ok = courseName() && !pend ? '' : ' disabled';
        var pendLbl = pend ? (pend.state === 'busy' || pend.state === 'offline' || pend.state === 'card' ? 'Loading ' + tidy(pend.name) + '\u2026' : 'Start Round') : '';
        // NO ROUND CODE YET (polish 029 #5): Start Round waits for the signal - said on the button.
        if (S.offline === 'wait') return shell('Where are you playing?', body, '<button type="button" class="sf-cta lime" data-sf="retrycode" disabled>Getting a round code\u2026<span class="sub">One moment</span></button>', 0);
        if (S.offline) return shell('Where are you playing?', body, '<button type="button" class="sf-cta lime" data-sf="retrycode"' + (S.minting ? ' disabled' : '') + '>'
            + (S.minting ? 'Getting a round code\u2026' : 'Start Round') + '<span class="sub">' + (S.minting ? 'One bar is enough' : 'Needs a moment of signal \u2014 one bar is enough') + '</span></button>', 0);
        var foot = S.mode === 'gps'
            ? '<button type="button" class="sf-cta lime" data-sf="startgps"' + (ok || (S.saving || (S.lookup && S.lookup.key === key && S.lookup.state === 'busy') || (S.noCard === key && !hasCard(key)) ? ' disabled' : '')) + '>' + (pend ? esc(pendLbl) : S.saving ? 'Starting…' : S.cardWait ? 'Loading the course card…' : (S.lookup && S.lookup.key === key && S.lookup.state === 'busy') ? 'Getting the course\u2026' : 'Start Round') + '</button>' + (S.err1 ? '<div class="sf-err">' + esc(S.err1) + '</div>' : '')

            : '<button type="button" class="sf-cta" data-sf="next"' + (ok || (S.cardWait ? ' disabled' : '')) + '>' + (pend ? esc(pendLbl === 'Start Round' ? 'Next: Players \u203a' : pendLbl) : S.cardWait ? 'Loading the course card\u2026' : 'Next: Players \u203a') + '</button>' + (S.err1 ? '<div class="sf-err">' + esc(S.err1) + '</div>' : '');
        return shell('Where are you playing?', body, foot, S.mode === 'gps' ? 0 : 1);
    }
    // This phone's own courses: the GPS recents and the last round's course, matched to the list.
    function recentCourses() {
        var all = courses(), out = [], seen = {}, H = HD();
        var add = function (key, name) {
            var c = all.filter(function (x) { return key ? x.key === key : nk(x.name) === nk(name); })[0];
            if (c && !seen[c.key]) { seen[c.key] = 1; out.push(c); }
        };
        try { (typeof H.recents === 'function' ? H.recents() : []).forEach(function (r) { add(r.key, r.name); }); } catch (e) {}
        try { var lr = JSON.parse(ls('hardpan_last_round') || 'null'); if (lr && lr.course) add(null, String(lr.course).split(' (')[0] === lr.course ? lr.course : lr.course); } catch (e) {}
        Object.keys(W.localStorage || {}).forEach(function (k) { if (k.indexOf(TEE_MEM) === 0) add(k.slice(TEE_MEM.length), ''); });
        return out.slice(0, 6);
    }
    function rowHtml(c, d, on) {
        return '<button type="button" class="sf-row' + (on ? ' sf-sel' : '') + '" data-sf-course="' + esc(c.key) + '" data-sf-name="' + esc(c.name) + '"><span class="n">' + esc(nameOf(c)) + '</span>'
            + '<span class="s">' + esc(miStr(d)) + (c.ready ? (d != null ? ' · ' : '') + '✓ GPS' : (!hasCard(c.key) && liveOn() ? (d != null ? ' · ' : '') + 'Tap to load' : '')) + '</span></button>';
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
    // A golfer's short name: the first name, plus the last initial when another golfer shares it
    // ("Test A" / "Test B" - no dot on a one-letter last name, polish #16), so the who's-in
    // chips and the "vs" line tell them apart.
    function shortName(ps, p) {
        if (typeof golferShortName === 'function' && p && p.name && String(p.name).trim()) return golferShortName(p, ps);
        var f = first(p.name), parts = String(p.name || '').trim().split(/\s+/);
        var clash = ps.some(function (x) { return x !== p && first(x.name).toLowerCase() === f.toLowerCase(); });
        return clash && parts.length > 1 ? f + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + (parts[parts.length - 1].length > 1 ? '.' : '') : (clash ? String(p.name).trim() : f);
    }
    function nameById(ps, id) { var p = ps.filter(function (x) { return String(x.id) === String(id); })[0]; return p ? shortName(ps, p) : '?'; }
    function whoBox(k, ps) {
        var ids = who(k, ps), sd = sides(k, ps), mg = myGroup(ps);
        var list = S.whoAll[k] ? ps : mg.members;
        return '<div class="sf-note" style="margin:6px 0 4px;">Tap who’s in (first ' + (k === 'hilo' ? 'two' : 'half') + ' = one side)</div><div class="sf-chips" style="justify-content:flex-start;">'
            + list.map(function (p) { var at = ids.indexOf(String(p.id)); return chip((at >= 0 ? (at + 1) + ' ' : '') + shortName(ps, p), at >= 0, 'data-sf-who="' + k + '" data-id="' + esc(p.id) + '"'); }).join('')
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
        if (!courseName() || pendBusy()) { go(1); return; }
        pruneEmpty();
        if (!players().length) { S.err2 = 'Paste or type who\u2019s playing first.'; go(2); return; }
        if (dupList().length) { S.dupOpen = true; S.err2 = 'Two golfers have the same name — add an initial, then Start.'; go(2); return; }
        var bad = ['nassau', 'match', 'hilo'].filter(function (k) { return S.games[k] && (k !== 'hilo' || hiloHere()) && !sides(k, players()); });
        if (bad.length) { S.err3 = 'Pick who’s in the ' + bad.map(function (k) { return k === 'hilo' ? 'Hi-Lo' : k.replace(/^\w/, function (c) { return c.toUpperCase(); }); }).join(' and ') + '.'; render(); return; }
        apply();
        ls(PMODE, pmode());
        if (!cardInHand(courseKey())) { needCard('err1', function () { go(3); start(); }); return; }
        runSave('err3');
    }
    function runSave(errKey) {
        hookSave();
        rememberTee();
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
        // URGENT-017: your own saved handicap, not a blank (read as 0) - when the box is empty.
        var hb = D.querySelector('#player-list .p-hcp-input'), mh = typeof HD().myHcp === 'function' ? HD().myHcp() : '';
        if (hb && !String(hb.value || '').trim() && mh) { hb.value = mh; hb.dispatchEvent(new Event('input', { bubbles: true })); }
        var first1 = players()[0];
        S.meName = first1 ? first1.name.trim() : 'Me';
        if (pendBusy()) { render(); return; }
        // URGENT-028: A ROUND ALREADY IN PROGRESS AT ANOTHER COURSE. No scores: replaced, without a word
        // (it is no longer the round Home resumes). Scores in: asked - "End your Papago round (thru 3)
        // and start at Aguila?" [Start new] [Resume Papago]. Start new is a NEW round (this screen's own
        // code, never the old one's); the old round is never deleted - it stays in History.
        S.saving = true; render();
        inProgress(function (o) {
            if (!S.open || S.step !== 1) return;
            if (!o || o.finished || sameCourse(o)) { runSave('err1'); return; }
            if (!o.scored || ss(CHANGE_FROM) === o.code) { forgetOld(o.code); runSave('err1'); return; }
            S.saving = false; S.ask = o; render();
        });
    }
    var CHANGE_FROM = 'hardpan_change_from';   // gps-round.js Change course: "New round" already said yes
    function tidy(n) { return clubName(n).replace(/\s+(golf\s+(club|course|links|resort|center)|country\s+club|gc|cc)$/i, '').trim() || clubName(n); }
    function forgetOld(code) { var H = HD(); try { if (typeof H.forgetRound === 'function') H.forgetRound(code, false); } catch (e) {} }
    function sameCourse(o) { return !!((o.key && o.key === courseKey()) || (o.course && nk(clubName(o.course)) === nk(clubName(courseName())))); }
    // The phone's round in progress (Home's Resume): its course, whether it has scores, thru N.
    function inProgress(done) {
        var lr = null; try { lr = JSON.parse(ls('hardpan_last_round') || 'null'); } catch (e) { lr = null; }
        var old = lr && lr.code ? String(lr.code).toUpperCase() : '';
        if (!old || old === S.code || lr.spectate || Date.now() - (Number(lr.at) || 0) > 12 * 3600 * 1000) { done(null); return; }
        var H = HD(), fin = false;
        var use = function (d) {
            if (fin) return; fin = true;
            if (!d || !Array.isArray(d.players) || !d.players.length) { done(null); return; }
            var sc = d.scores || {}, scored = Object.keys(sc).some(function (k) { return Number(sc[k]) > 0; });
            var pr = null; try { pr = typeof H.progressOf === 'function' ? H.progressOf(d) : null; } catch (e) { pr = null; }
            var thru = pr ? pr.thru : (typeof H.thruOf === 'function' ? H.thruOf(d) : 0);
            done({ code: old, course: d.courseName || lr.course || '', key: d.activeCourseKey || '', scored: scored, thru: thru, finished: !!(pr && pr.finished) });
        };
        var local = function () { var l = null; try { l = typeof H.localRound === 'function' ? H.localRound(old) : null; } catch (e) { l = null; } use(l && l.data); };
        var dbr = wizDb();
        if (!dbr) { local(); return; }
        var t = setTimeout(local, 4000);
        try { dbr.ref('events/' + old).once('value').then(function (s2) { clearTimeout(t); var d = s2 && s2.val ? s2.val() : null; if (d) use(d); else local(); }, function () { clearTimeout(t); local(); }); } catch (e) { clearTimeout(t); local(); }
    }
    function askHtml() {
        var o = S.ask, from = tidy(o.course), to = tidy(courseName());
        return '<div id="sf-ask" data-sf="askclose" style="position:fixed;inset:0;z-index:5;background:rgba(10,20,15,.45);display:flex;align-items:flex-end;justify-content:center;">'
            + '<div class="sf-card" style="width:100%;max-width:520px;margin:0 12px calc(env(safe-area-inset-bottom) + 12px);padding:18px 16px;" role="alertdialog" aria-labelledby="sf-ask-t">'
            + '<div id="sf-ask-t" style="font-size:18px;font-weight:800;line-height:1.3;margin-bottom:6px;">End your ' + esc(from) + ' round (thru ' + esc(o.thru || 0) + ') and start at ' + esc(to) + '?</div>'
            + '<div class="sf-note" style="margin-bottom:14px;">Your ' + esc(from) + ' round keeps its scores \u2014 it stays in History.</div>'
            + '<button type="button" class="sf-cta" data-sf="asknew" style="margin-bottom:8px;">Start new</button>'
            + '<button type="button" class="sf-btn" data-sf="askresume" style="width:100%;min-height:50px;">Resume ' + esc(from) + '</button></div></div>';
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
                // SHOTGUN / TWO-TEE (Manny, 2026-10-19: "let me change a group's hole on the share sheet"):
                // with more than one group each row's first hole is a picker - groupStartingHoles/<g>,
                // the field the shotgun and Round Ready's two-tee start already write.
                var holes = ((d.courseData || []).map(function (h) { return Number(h.hole); })).filter(function (n) { return n > 0; }).sort(function (a, b2) { return a - b2; });
                var at = g.length > 1 && holes.length
                    ? ' · <select class="sf-ghole" data-sf-ghole="' + b.group + '" aria-label="Group ' + b.group + ' first hole" style="font:inherit;font-size:14px;height:34px;border:1px solid #dfe5df;border-radius:10px;background:#fff;color:#13241d;">'
                        + holes.map(function (h) { return '<option value="' + h + '"' + (h === startOf(b.group) ? ' selected' : '') + '>Hole ' + h + '</option>'; }).join('') + '</select>'
                    : ' · Hole ' + startOf(b.group);
                return '<div class="sf-row" style="cursor:default;" data-sf-group="' + b.group + '"><span><span class="n">Group ' + b.group + '</span><span class="s" style="display:block;white-space:normal;">' + esc(names) + at + '</span></span>'
                    + '<button type="button" class="sf-btn" data-sf-share="' + b.group + '">Share</button></div>';
            }).join('')
            + '<button type="button" class="sf-btn" data-sf="qr" style="width:100%;min-height:50px;margin-top:4px;">📷 Show QR codes</button>'
            + '<div class="sf-note" style="margin-top:6px;">Hold the phone up on the first tee — each scorekeeper scans their group. Works with no signal.</div>';
        var gps = readyOf(courseKey() || d.activeCourseKey);
        return shell('✅ Round ready', body, '<button type="button" class="sf-cta" data-sf="done">Done · ' + (gps ? 'open the GPS' : 'open the card') + ' ▶</button>', 0);
    }
    function done() {
        var m = meIn(), d = S.round || {};
        // "JUST SCORES" (Manny, 2026-10-19: yes): a course with no GPS opens the card - from either door.
        // (Only once the GPS course files are read - until then a GPS-door round keeps the map.)
        var gps = S.gpsFiles ? readyOf(courseKey() || d.activeCourseKey) : (S.mode === 'gps' || readyOf(courseKey() || d.activeCourseKey));
        ls('hardpan_round_side', (gps ? 'gps|' : 'bets|') + S.code);
        ss(MARK, null); ss(CHANGE_FROM, null);
        var h = 'index.html?game=' + encodeURIComponent(S.code) + (m.group ? '&group=' + m.group : '') + (m.me ? '&me=' + encodeURIComponent(m.me.id) : '');
        W.location.href = h;
    }

    // ---- AWAY TO THE FULL SETUP, AND BACK ------------------------------------------
    function away(n, label) {
        placePool(false);
        S.picked = null;   // a course picked on the full setup is the one that holds
        S.teeChosen = courseKey();   // ...and so does a tee set there
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
        if ((b = t.closest('[data-sf-web]'))) { webPull(b.getAttribute('data-sf-web'), b.getAttribute('data-sf-name')); return; }
        if ((b = t.closest('[data-sf-course]'))) { var pk = b.getAttribute('data-sf-course'), pn = b.getAttribute('data-sf-name'); S.pend = null; S.noCard = null; S.lookup = null; pick(pk, pn); S.q = ''; S.changing = false; S.err1 = ''; render(); el().scrollTop = 0; lookup(pk, pn); return; }
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
        if (a === 'next') { S.err2 = ''; if (S.step === 2 && pmode() === 'paste') readPaste(); if (S.step === 2) pruneEmpty(); if (S.step === 1 && !courseName()) return; if (S.step === 1) { needCard('err1', function () { go(2); }); return; } if (S.step === 2 && !players().length) { S.err2 = 'Paste or type who’s playing.'; render(); return; } if (S.step === 2 && dupList().length) { S.dupOpen = true; S.err2 = 'Two golfers have the same name \u2014 add an initial first.'; render(); return; } go(S.step + 1); return; }
        if (a === 'pastedone') { readPaste(); render(); return; }
        if (a === 'addgolfer') { addGolfer(); return; }
        if (a === 'change') { S.changing = true; render(); var q = $('sf-q'); if (q) q.focus(); return; }
        if (a === 'relocate') { S.near = null; S.nearWhy = null; locate(); render(); return; }
        if (a === 'startgps') { needCard('err1', startGps); return; }
        if (a === 'retrycode') { retryCode(); return; }
        if (a === 'askclose') { if (t.closest('.sf-card')) return; S.ask = null; render(); return; }
        if (a === 'asknew') { S.ask = null; runSave('err1'); return; }
        if (a === 'askresume') {
            var ao = S.ask; S.ask = null;
            ss(MARK, null);
            ls('hardpan_round_side', 'gps|' + ao.code);
            W.location.href = typeof HD().roundHref === 'function' ? HD().roundHref(ao.code) : 'index.html?game=' + encodeURIComponent(ao.code);
            return;
        }
        if (a === 'mix') { away(step('players'), 'Tees set'); return; }
        if (a === 'fullcourse') { away(step('course'), 'Course picked'); return; }
        if (a === 'signin') { if (fn('openAccountPanel')) { show(false); W.openAccountPanel(); var t2 = setInterval(function () { var ap = $('account-modal'); if (!ap || !ap.classList.contains('open')) { clearInterval(t2); show(true); S.lookup = null; lookup(courseKey(), courseName()); render(); } }, 600); } return; }
        if (a === 'webback') { if (S.web) S.web.pull = null; S.pend = null; render1(); var q2 = $('sf-q'); if (q2) q2.focus(); return; }
        if (a === 'webretry') { S.web = null; webSearch(); return; }
        if (a === 'websignin') { if (fn('openAccountPanel')) { show(false); W.openAccountPanel(); var t3 = setInterval(function () { var ap = $('account-modal'); if (!ap || !ap.classList.contains('open')) { clearInterval(t3); show(true); S.web = null; webSearch(); render1(); } }, 600); } return; }
        if (a === 'webrequest') {
            var wp = (S.web && S.web.pull) || {};
            try { W.location.href = 'mailto:support@rattlegolf.com?subject=' + encodeURIComponent('Please add ' + (wp.name || S.q)) + '&body=' + encodeURIComponent('GolfAPI course id: ' + (wp.id || '') + '\nFrom the HardPan GPS app.'); } catch (e) {}
            return;
        }
        if (a === 'request') {
            var rc = courses().filter(function (x) { return x.key === courseKey(); })[0] || {};
            var subj = 'Please add ' + courseName() + (rc.city || rc.state ? ' (' + [rc.city, rc.state].filter(Boolean).join(', ') + ')' : '');
            try { W.location.href = 'mailto:support@rattlegolf.com?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent('Course key: ' + courseKey() + '\nFrom the HardPan GPS app.'); } catch (e) {}
            return;
        }
        if (a === 'enterpars') { S.err1 = ''; S.noCard = null; away(step('course'), 'Pars entered'); return; }
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
        if (t.id === 'sf-q') {
            // URGENT-035: the list follows each letter (one redraw a frame, the box itself never redrawn);
            // online only after typing pauses: ~400 ms, longer for a slow typist (twice their own gap
            // between letters, up to 800 ms) so a pause is a pause, never a call per letter.
            S.q = t.value; clearTimeout(S.wt);
            var now = Date.now(), gap = S.lastKey ? now - S.lastKey : 0; S.lastKey = now;
            if (gap > 0 && gap < 1500) S.gaps = (S.gaps || []).concat(gap).slice(-4);
            var gs = (S.gaps || []).slice().sort(function (a, b) { return a - b; }), med = gs.length ? gs[Math.floor(gs.length / 2)] : 0;
            // (the letter is painted first, the list the frame after: typing never waits on the list)
            if (!S.qf) S.qf = (W.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(function () { setTimeout(function () { S.qf = 0; render1(); }, 0); });
            S.wt = setTimeout(webSearch, Math.min(800, Math.max(400, 2 * med)));   // URGENT-027: online after a pause, never per letter
            return;
        }
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
        if (t.getAttribute && t.getAttribute('data-sf-ghole')) {
            var gk = t.getAttribute('data-sf-ghole'), hn = Number(t.value), dbg = wizDb();
            if (!(hn > 0) || !S.round) return;
            S.round.groupStartingHoles = Object.assign({}, S.round.groupStartingHoles || {});
            S.round.groupStartingHoles[gk] = hn;
            if (dbg) dbg.ref('events/' + S.code + '/groupStartingHoles/' + gk).set(hn).catch(function () { S.round.groupStartingHoles[gk] = null; render(); });
            render(); return;
        }
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

    // ---- NO SIGNAL AT THE GPS DOOR (POLISH 029 #5) ------------------------------------
    // The walk: Home > GPS with no signal landed on the OLD lobby ("What are you setting up? Road
    // Trip / Game Day") under a red "No signal ... The new round was not started", listing Resume
    // Dobson TWICE and Resume Papago, a FINISHED round.
    // NOW: the door stays on Course & Tees. A clear line says why Start Round waits, the golfer can
    // still pick the course and tee (both carried into the round), the rounds this phone can resume
    // are listed once each (unfinished only), and the round's code is asked for again by itself as
    // soon as the signal is back (or on Start Round).
    // NOT AN OFFLINE START, ON PURPOSE: a round's code is checked against the server before it is
    // used (code-issuer.js). A code made up offline could already be another group's round, and the
    // rules let any client write any child of a round that exists - the queued round would land in
    // their round when the signal came back. So the code still needs one bar; nothing else does.
    function offlineNow() { try { return typeof navigator !== 'undefined' && navigator.onLine === false; } catch (e) { return false; } }
    function resumable() {
        var q = W.OfflineQueue, H = HD(), out = [], seen = {};
        if (!q || typeof q.localRounds !== 'function') return out;
        var list = []; try { list = q.localRounds(W.localStorage) || []; } catch (e) { list = []; }
        list.forEach(function (r) {
            var code = String(r.code || '').toUpperCase();
            if (!code || seen[code]) return;          // each round once
            seen[code] = 1;
            var lr = null; try { lr = typeof H.localRound === 'function' ? H.localRound(code) : null; } catch (e) { lr = null; }
            if (!lr || lr.finished) return;             // a finished round is not resumed
            out.push({ code: code, course: r.courseName || r.eventName || code, thru: lr.thru || 0, waiting: r.waiting || 0, href: q.resumeHref(r) });
        });
        return out.slice(0, 4);
    }
    function offlineBox() {
        // STILL CONNECTING (fix-false-nosignal): a fresh install's first database connection can take
        // longer than the code check's 8 s. That is not "no signal" - a calm line, and it carries on.
        if (S.offline === 'wait') return '<div class="sf-note" id="sf-connecting" role="status" style="margin:0 2px 10px;">Connecting\u2026 your round code comes in a moment. Pick your course and tee.</div>';
        var line = S.offline === 'error'
            ? 'Couldn\u2019t get a round code just now. Pick your course and tee \u2014 it tries again by itself.'
            : 'No signal. A new round needs one bar to get its code \u2014 pick your course and tee now, and it carries on by itself when the signal is back.';
        var h = '<div class="sf-warn" id="sf-offline" role="status"><div style="font-weight:700;">\uD83D\uDCF4 ' + esc(line) + '</div>'
            + '<button type="button" class="sf-link" data-sf="retrycode" style="padding:6px 0 0;min-height:0;"' + (S.minting ? ' disabled' : '') + '>' + (S.minting ? 'Trying\u2026' : 'Try again') + '</button></div>';
        var rs = resumable();
        if (rs.length) {
            h += '<div class="sf-h" style="margin-top:4px;">RESUME ON THIS PHONE</div>' + rs.map(function (r) {
                return '<a class="sf-row" style="text-decoration:none;" data-sf-resume="' + esc(r.code) + '" href="' + esc(r.href) + '"><span class="n">' + esc(tidy(r.course)) + '</span>'
                    + '<span class="s">' + (r.thru ? 'Thru ' + esc(r.thru) : 'Not started') + (r.waiting ? ' \u00b7 ' + esc(r.waiting) + ' waiting' : '') + ' \u203a</span></a>';
            }).join('');
        }
        return h;
    }
    // Shows the course screen with no round code. kind: 'offline' (no signal known) | 'error'.
    // True when it took over (the GPS door's mark is on this page and no round code is in hand).
    function noCode(kind) {
        var m = marker();
        if (!m || m.mode !== 'gps' || params().get('game') || !/admin\.html$/.test(String(W.location.pathname || ''))) return false;
        sockWatch();
        S.offline = reallyOffline() ? 'offline' : NS.sock === true ? 'error' : 'wait';
        S.minting = false;
        againLater();
        if (S.open) { render(); return true; }
        S.mode = 'gps'; S.code = ''; S.step = 1;
        show(true);
        D.documentElement.classList.remove('sf-pre');
        render();
        gpsFiles(function () { if (S.step === 1) render(); });
        watchTees();
        if (!S.onlineHook) { S.onlineHook = true; try { W.addEventListener('online', function () { if (S.offline) retryCode(); }); } catch (e) {} }
        return true;
    }
    // Ask for the round's code again (Round Setup's own createRoom, through the lobby tile), with the
    // picked course carried in the GPS door's mark so the new round's page opens on it.
    function retryCode() {
        if (S.minting) return;
        var m = marker() || { mode: 'gps' }, k = courseKey(), n = courseName();
        if (k || n) m.pick = { key: k, name: n };
        ss(MARK, JSON.stringify(m));
        rememberTee();
        S.minting = true; NS.tries++; render();
        try { if (fn('selectHomeWidget')) W.selectHomeWidget('quick'); } catch (e) { S.minting = false; }
        // createRoom navigates on success; a refusal comes back through noCode(). A hang gives the button back.
        setTimeout(function () { if (S.minting) { S.minting = false; if (S.open) { render(); againLater(); } } }, 20000);
    }

    // ---- A SLOW FIRST CONNECTION IS NOT "NO SIGNAL" (fix-false-nosignal) ---------------------------
    // Measured in the Simulator on a FRESH install (internet on): Firebase's anonymous sign-in and the
    // first database connection can take longer than the code check's 8 s timer (code-issuer.js). The
    // check timed out, the round's socket (.info/connected) still read false - which is what the SDK
    // says BEFORE its first connection, not only after losing one - so the door said "No signal", and
    // nothing asked again: the only re-ask was the window 'online' EVENT, which never comes when
    // navigator.onLine was true all along. The course card and the ✓ GPS links had given up on the
    // same first connection too.
    // NOW: "No signal" only when it is known - the phone says offline, the socket was up and dropped,
    // or it never came up in GRACE_MS. Until then the screen says it is connecting. Whatever the
    // state, the code is asked for again by itself: at once when the socket comes up, and on a backoff
    // (2, 4, 8, 16, 30 s ...) while this screen is open - so the screen recovers on its own.
    var NS = { t0: Date.now(), sock: null, ever: false, hooked: false, timer: null, tries: 0 }, GRACE_MS = 20000, BACKOFF = [2, 4, 8, 16, 30];
    function reallyOffline() {
        if (offlineNow()) return true;
        if (NS.sock === true) return false;
        if (NS.ever) return true;                       // it was up and dropped: a real loss of signal
        return Date.now() - NS.t0 >= GRACE_MS;          // never up yet: only after a fair wait
    }
    function sockWatch() {
        if (NS.hooked) return;
        var d = wizDb(); if (!d) return;
        NS.hooked = true;
        try {
            d.ref('.info/connected').on('value', function (s) {
                var up = !!(s && typeof s.val === 'function' && s.val());
                NS.sock = up;
                if (up) { NS.ever = true; backUp(); }
            });
        } catch (e) {}
    }
    // The database is up: the round code now (no waiting for the backoff), and whatever the first
    // connection gave up on - the picked course's card, the ✓ GPS links.
    function backUp() {
        if (!S.open || !S.offline) return;
        if (S.offline !== 'wait') { S.offline = 'wait'; render(); }
        if (!S.minting) { clearTimeout(NS.timer); NS.timer = null; retryCode(); }
        var key = courseKey();
        if (key && !cardInHand(key)) { watchTees(); cardFor(key).then(function () { if (S.step === 1 && courseKey() === key) render(); }); }
        var H = HD();
        if (typeof H.gpsKeysPartial === 'function' && H.gpsKeysPartial() && typeof H.loadGpsKeys === 'function')
            H.loadGpsKeys(function () { if (typeof H.refreshCourses === 'function') H.refreshCourses(); if (S.here) S.near = nearList(S.here); if (S.open && S.step === 1) render(); });
    }
    function againLater() {
        if (NS.timer || !S.offline) return;
        var ms = BACKOFF[Math.min(Math.max(NS.tries - 1, 0), BACKOFF.length - 1)] * 1000;
        NS.timer = setTimeout(function () {
            NS.timer = null;
            if (!S.open || !S.offline || S.code) return;
            // Still connecting past the grace: now it is said plainly (and it keeps asking).
            if (S.offline === 'wait' && reallyOffline()) { S.offline = 'offline'; render(); }
            if (offlineNow()) { againLater(); return; }   // the 'online' event asks the moment it is back
            if (S.minting) { againLater(); return; }
            retryCode();
        }, ms);
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
        // POLISH 029 #5: the GPS door with no signal stays on Course & Tees (the code is asked for
        // by Round Setup's lobby underneath; with no signal its refusal comes back to noCode too).
        if (!code && params().get('start') === 'quick' && switchOn() && offlineNow()) { noCode('offline'); return; }
        if (!code) return;
        // URGENT-016: front-door.js covered this page from <head> (the GPS door never shows the
        // lobby); lifted here, once this screen is painted or is not wanted.
        var uncover = function () { D.documentElement.classList.remove('sf-pre'); };
        var m = claim(code);
        if (!m) { uncover(); return; }
        if (!switchOn()) { ss(MARK, null); uncover(); return; }
        S.mode = m.mode === 'same' || m.mode === 'gps' ? m.mode : 'new';
        S.code = code;
        // Painted at once (the wizard boots underneath); the steps fill in when it is up.
        show(true);
        el().innerHTML = shell(S.mode === 'same' ? 'Same as last week' : S.mode === 'gps' ? 'Where are you playing?' : 'New round', '<div class="sf-note">Getting things ready…</div>', '', S.mode === 'same' ? 3 : S.mode === 'gps' ? 0 : 1);
        uncover();
        whenReady(m, function () {
            hookSave();
            readBack();
            if (S.mode === 'new') lastPool();
            gpsFiles(function () { if (S.step === 1 || S.step === 4) render(); });
            S.step = S.mode === 'same' ? 3 : 1;
            if (S.mode === 'same') { var ps = players(); var me = meDefault(ps); if (me) S.meName = me.name.trim(); }
            // The course picked while there was no round code yet (polish #5) is this round's course.
            if (S.mode === 'gps' && m.pick && (m.pick.key || m.pick.name) && !courseKey()) pick(m.pick.key, m.pick.name);
            render();
            if (S.step === 1) watchTees();
        });
        // An existing round (whenReady saw it): hide again.
        var guard = setInterval(function () { if (!ss(MARK) && S.open && !S.saved) { show(false); clearInterval(guard); } }, 300);
        setTimeout(function () { clearInterval(guard); }, 20000);
    }
    W.HardPanSimpleFlow = { afterSave: afterSave, state: function () { return S; }, open: function () { return S.open; }, noCode: noCode, _middleTee: middleTee, _resumable: resumable };
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
