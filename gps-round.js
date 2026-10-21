// ============================================================================
// HARDPAN - THE ROUND, SIMPLER (mailbox 017, part B, sections 4 and 5)
//
// Behind features.simpleFlow (gps-bet.js on(): the switch, and this phone's
// "hardpan_simple_flow" = "off" to compare). OFF: nothing here draws or intercepts
// anything - the Round Menu, the Card and Bets are today's screens exactly.
//
// 4  THE ROUND MENU: six tiles + "Finish & settle up" (the mockup):
//      Card · Bets · GPS · + Bet · Share · Round settings
//    Share = the round code, its link, the QR codes (index.html openRoundQrSheet) and,
//    for the organizer, every group's scorekeeper link. Round settings = today's whole
//    Round Menu sheet (Edit Round Setup - players, tees, groups -, Group Links, the
//    nav, the receipt, Delete this round) plus "GPS tools" (the map's Tools sheet).
//    Finish & settle up = ONE screen: who pays who (computeCombinedNetTotals ->
//    simplifyDebts, the fewest payments, exactly what Finish Round shows), everyone's
//    total, Share, and the full review / receipt one tap away. Display only: it
//    writes nothing.
//
// 5  GPS <-> CARD <-> BETS WITHOUT LEAVING:
//    - the Card opens as a SHEET OVER THE MAP: once the map is built, the card side
//      keeps the map alive behind the card (its top bar - hole, yards - shows above the
//      sheet). A tap on that strip, or a pull down from the top of the card, is the map
//      again: no reload, the same hole, zoom and target untouched.
//    - Bets is a SHEET: the Bets page and the Leaderboard in kept-alive frames over
//      whatever is showing - opened once, instant after that.
//    - ONE BOTTOM BAR on the card and over Bets (gps-bet.js #hp-card-bet):
//      ☰ Menu | 📍 GPS | ▤ Card | + Bet, and the money chip; the GPS has its own
//      (Card | Enter score | + Bet, "☰ Menu" at the top).
//    - BACK (the Android button, GolfBack): an open sheet closes; the card that came
//      from the map goes back to the map. Never Home, never "How are you joining?".
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    /* global currentData, currentMode, lockedGroup, hasGroupLock, canReachSetup, shareBaseUrl, computeCombinedNetTotals,
       findMissingScores, openRoundQrSheet, openFinishRoundModal, openReceipt, computeGroupBoundaries, copyGroupLinkFromScorecard,
       uiToast, golferLabel */

    function B() { return window.HardPanBet || null; }
    function on() { var b = B(); return !!(b && b.on()); }
    function G() { return window.HardPanGps || null; }
    function data() { try { return typeof currentData !== 'undefined' && currentData ? currentData : null; } catch (e) { return null; } }
    function code() { try { return typeof currentMode !== 'undefined' ? currentMode : null; } catch (e) { return null; } }
    function locked() { try { return typeof hasGroupLock !== 'undefined' && hasGroupLock && lockedGroup ? Number(lockedGroup) : null; } catch (e) { return null; } }
    function organizer() { try { return typeof canReachSetup === 'function' && !!canReachSetup(); } catch (e) { return false; } }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function whole(n) { return String(Math.round(Math.abs(Number(n) || 0))); }
    function onGps() { return document.body.classList.contains('gps-side-gps'); }
    function gpsUp() { var g = G(); return !!(g && g.isMounted && g.isMounted()); }
    function base() { try { return typeof shareBaseUrl === 'function' ? shareBaseUrl() : ''; } catch (e) { return ''; } }
    function roundUrl() { return base() + 'index.html?game=' + encodeURIComponent(code() || ''); }
    // POLISH #22: "Papago Golf Club (Papago)" -> "Papago Golf Club" - a trailing "(Name)" that only
    // repeats words already in the name goes; "(Championship)", "(South - Piipaash)" stay.
    function tidyCourse(name) {
        var s = String(name == null ? '' : name).trim(), m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(s);
        if (!m) return s;
        var words = function (t) { return String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean); };
        var head = words(m[1]), tail = words(m[2]);
        return tail.length && tail.every(function (w) { return head.indexOf(w) >= 0; }) ? m[1] : s;
    }
    function say(t) { try { if (typeof uiToast === 'function') uiToast(t); } catch (e) {} }

    var FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif';
    var CSS = ''
        // A generic bottom sheet over everything (the GPS is 10050).
        + '.hp-sheet{position:fixed;inset:0;z-index:10110;display:none;font-family:' + FONT + ';}'
        + '.hp-sheet.open{display:block;}'
        + '.hp-sheet .hs-scrim{position:absolute;inset:0;background:rgba(5,20,12,.5);}'
        + '.hp-sheet .hs-panel{position:absolute;left:0;right:0;bottom:0;max-height:92vh;overflow:auto;background:#f4f6f3;color:#0f1f17;border-radius:22px 22px 0 0;padding:10px 16px calc(env(safe-area-inset-bottom) + 18px);box-shadow:0 -8px 30px rgba(0,0,0,.25);-webkit-overflow-scrolling:touch;}'
        + '.hp-sheet .hs-grab{width:44px;height:5px;border-radius:3px;background:#cfd8d3;margin:2px auto 10px;}'
        + '.hp-sheet .hs-head{display:flex;align-items:center;gap:8px;margin:2px 0 14px;}'
        + '.hp-sheet .hs-title{flex:1;font:800 22px/1.2 ' + FONT + ';}'
        + '.hp-sheet .hs-mtitle{display:flex;align-items:center;gap:8px;min-width:0;}.hp-sheet .hs-course{min-width:0;overflow-wrap:anywhere;}'
        + '.hp-sheet .hs-codechip{flex:0 0 auto;font:800 13px/1 ' + FONT + ';letter-spacing:.06em;background:#0f4d3a;color:#fff;border-radius:999px;padding:6px 10px;}'
        + '.hp-sheet .hs-x{border:0;background:#e3e9e5;color:#0f3d2e;border-radius:999px;min-width:40px;height:40px;font:800 18px/1 ' + FONT + ';cursor:pointer;}'
        + '.hp-sheet .hs-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;}'
        + '.hp-sheet .hs-tile{text-align:left;border:1.5px solid #dfe6e2;background:#fff;border-radius:16px;padding:14px 12px;min-height:96px;cursor:pointer;color:#0f1f17;display:flex;flex-direction:column;gap:4px;}'
        + '.hp-sheet .hs-tile b{font:800 17px/1.2 ' + FONT + ';}.hp-sheet .hs-tile span{font:500 13px/1.3 ' + FONT + ';color:#5d6b64;}'
        + '.hp-sheet .hs-ways{display:grid;gap:8px;margin-top:12px;}'
        + '.hp-sheet .hs-way{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;min-height:56px;padding:10px 14px;border:1px solid #d6dfd9;background:#fff;color:#0f1f17;border-radius:14px;text-align:left;cursor:pointer;font-family:' + FONT + ';}'
        + '.hp-sheet .hs-way b{font-size:16px;font-weight:800;}.hp-sheet .hs-way span{font-size:12.5px;color:#5b6b63;}'
        + '.hp-sheet .hs-finish{display:block;width:100%;margin-top:16px;min-height:56px;border:2px solid #0f4d3a;background:#fff;color:#0f4d3a;border-radius:16px;font:800 18px/1 ' + FONT + ';cursor:pointer;}'
        + '.hp-sheet .hs-note{text-align:center;font:500 13px/1.4 ' + FONT + ';color:#5d6b64;margin-top:12px;}.hp-sheet .hs-note a{color:#0f4d3a;font-weight:700;}'
        + '.hp-sheet .hs-h{font:700 12px/1.3 ' + FONT + ';letter-spacing:.04em;color:#5d6b64;text-transform:uppercase;margin:18px 0 8px;}'
        + '.hp-sheet .hs-code{font:800 34px/1 ' + FONT + ';letter-spacing:.08em;text-align:center;background:#fff;border:1.5px solid #dfe6e2;border-radius:16px;padding:18px 10px;}'
        + '.hp-sheet .hs-btn{display:block;width:100%;margin-top:10px;min-height:52px;border:0;border-radius:14px;background:#0f4d3a;color:#fff;font:800 16px/1 ' + FONT + ';cursor:pointer;}'
        + '.hp-sheet .hs-btn.alt{background:#fff;color:#0f4d3a;border:1.5px solid #0f4d3a;}'
        + '.hp-sheet .hs-btn.lime{background:#c8f075;color:#0f1f17;}'
        + '.hp-sheet .hs-row{display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #dfe6e2;border-radius:14px;padding:10px 12px;margin-top:8px;font:500 15px/1.3 ' + FONT + ';}'
        + '.hp-sheet .hs-row .hs-grow{flex:1;min-width:0;}.hp-sheet .hs-row small{display:block;color:#5d6b64;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
        + '.hp-sheet .hs-row button{border:0;border-radius:999px;background:#e3e9e5;color:#0f3d2e;min-height:38px;padding:0 14px;font:700 14px/1 ' + FONT + ';cursor:pointer;}'
        + '.hp-sheet .hs-amt{font:800 17px/1 ' + FONT + ';white-space:nowrap;}.hp-sheet .pos{color:#0f7a3f;}.hp-sheet .neg{color:#b3261e;}'
        + '.hp-sheet .hs-gate{background:#fff7e0;border:1.5px solid #f0d58a;border-radius:14px;padding:10px 12px;font:600 14px/1.4 ' + FONT + ';color:#6b4e00;}'
        // BETS, a sheet with two kept-alive frames.
        + '#hp-bets{position:fixed;left:0;right:0;top:0;bottom:0;z-index:10100;display:none;font-family:' + FONT + ';}'
        + 'body.hp-bets-open #hp-bets{display:block;}'
        + '#hp-bets .hb2-scrim{position:absolute;inset:0;background:rgba(5,20,12,.45);}'
        + '#hp-bets .hb2-panel{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top) + 44px);bottom:calc(env(safe-area-inset-bottom) + 66px);background:#f4f6f3;border-radius:22px 22px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -8px 30px rgba(0,0,0,.25);}'
        + '#hp-bets .hb2-head{display:flex;align-items:center;gap:8px;padding:12px 14px 8px;}'
        + '#hp-bets .hb2-tabs{flex:1;display:flex;background:#e3e9e5;border-radius:12px;padding:3px;}'
        + '#hp-bets .hb2-tabs button{flex:1;border:0;background:none;border-radius:10px;min-height:38px;font:800 15px/1 ' + FONT + ';color:#0f1f17;cursor:pointer;}#hp-bets .hb2-tabs button.on{background:#0f4d3a;color:#fff;}'
        // 022 SUN MODE (body.hp-sun, set by the GPS screen): the Menu's "+ Bet" tile yellow, the tiles black and outlined.
        + 'body.hp-sun #hp-sheet .hs-tile{background:#000;color:#fff;border:2px solid #fff;}body.hp-sun #hp-sheet .hs-tile span{color:#fff;opacity:1;}'
        + 'body.hp-sun #hp-sheet .hs-tile[data-hs-tile="bet"]{background:#ffe600;color:#000;border-color:#000;}body.hp-sun #hp-sheet .hs-tile[data-hs-tile="bet"] span{color:#000;}'
        + '#hp-bets .hb2-x{border:0;background:#e3e9e5;color:#0f3d2e;border-radius:999px;min-width:40px;height:40px;font:800 18px/1 ' + FONT + ';cursor:pointer;}'
        + '#hp-bets .hb2-me{padding:0 16px 8px;font:700 15px/1.3 ' + FONT + ';color:#0f1f17;}'
        + '#hp-bets .hb2-body{position:relative;flex:1;}#hp-bets iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;}'
        // THE CARD AS A SHEET OVER THE MAP: the map stays shown behind the card.
        + 'body.hp-card-sheet{padding-top:calc(env(safe-area-inset-top) + 96px);}'
        + 'body.hp-card-sheet #gps-overlay{display:block !important;z-index:0;}'
        + 'body.hp-card-sheet #main-content{position:relative;z-index:1;min-height:100vh;border-radius:22px 22px 12px 12px;box-shadow:0 -6px 24px rgba(0,0,0,.35);transition:transform .18s ease;}'
        + 'body.hp-card-sheet #main-content.hp-dragging{transition:none;}'
        + 'body.hp-card-sheet #gps-overlay .gps-ld-row2{visibility:hidden;}'
        + 'body.hp-bets-open #hp-card-bet .hp-money-chip{display:none !important;}'
        + '#hp-strip{display:none;position:fixed;left:0;right:0;top:0;height:calc(env(safe-area-inset-top) + 92px);z-index:2;background:transparent;border:0;cursor:pointer;}'
        + 'body.hp-card-sheet #hp-strip{display:block;}'
        // POLISH #15: the grab handle is the sheet's own header row (it rode on the strip, fixed, and
        // the card scrolled under it - over "+ Add game").
        + '#hp-strip-grab{display:none;}'
        + 'body.hp-card-sheet #main-content::before{content:"";display:block;width:44px;height:5px;border-radius:3px;background:#cfd8d3;margin:2px auto 10px;}'
        // POLISH #13: a solid band under the status bar and the Dynamic Island - the card scrolls
        // under it, never under the clock.
        + 'body.hp-card-sheet #hp-strip::before{content:"";position:absolute;left:0;right:0;top:0;height:env(safe-area-inset-top);background:#0b0f0c;}'
        // POLISH #14: the card ends above the bottom bar (☰ / GPS / Enter score: 66 px + the home bar).
        + 'body.hp-sf-card #main-content{padding-bottom:calc(env(safe-area-inset-bottom) + 84px) !important;}'
        // Round settings' "Full setup ›" (POLISH #12): inside the sheet, wrapped.
        + '#round-sheet-body a[data-hp-full="1"]{box-sizing:border-box;max-width:100%;white-space:normal;overflow-wrap:anywhere;}'
        // The old Round Menu pill steps aside for the bar; it still opens as Round settings.
        + 'body.hp-sf-card #round-sheet:not(.open){transform:translateY(100%);visibility:hidden;}'
        // Over the map: the toasts and the QR codes come up above it.
        + 'body.hp-sf-card.gps-side-gps .ui-toast-wrap,body.hp-sf-card .qr-sheet{z-index:10300 !important;}'
        // Toasts clear the bottom bar (the card's); on the map (POLISH #19) they sit under the top bar and
        // the Menu row (--gps-top-b, gps-view.js), never over the Plays-like pill.
        + 'body.hp-sf-card .ui-toast-wrap{bottom:calc(env(safe-area-inset-bottom) + 84px);}body.hp-sf-card.gps-side-gps .ui-toast-wrap{bottom:auto;top:var(--gps-top-b,calc(env(safe-area-inset-top) + 150px));}'
        + '#hp-gps-tools{display:block;width:100%;margin:0 0 10px;min-height:44px;border-radius:12px;border:1.5px solid #0f4d3a;background:#fff;color:#0f4d3a;font-weight:800;font-size:.95rem;cursor:pointer;}';
    function ensureCss() {
        if (document.getElementById('hp-round-css')) return;
        var s = document.createElement('style'); s.id = 'hp-round-css'; s.textContent = CSS; document.head.appendChild(s);
    }

    // ---- ONE SHEET FOR MENU / SHARE / FINISH ----------------------------------
    var sheetKind = null, stack = [];
    function sheet() {
        var r = document.getElementById('hp-sheet');
        if (r) return r;
        ensureCss();
        r = document.createElement('div');
        r.id = 'hp-sheet'; r.className = 'hp-sheet'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true');
        r.innerHTML = '<div class="hs-scrim"></div><div class="hs-panel gps-scroll-ok"></div>';
        document.body.appendChild(r);
        r.addEventListener('click', onSheetClick);
        return r;
    }
    function sheetOpen() { var r = document.getElementById('hp-sheet'); return !!(r && r.classList.contains('open')); }
    function show(kind, html, label) {
        var r = sheet();
        if (sheetOpen() && sheetKind && sheetKind !== kind) stack.push(sheetKind);
        sheetKind = kind;
        r.setAttribute('aria-label', label || kind);
        r.querySelector('.hs-panel').innerHTML = '<div class="hs-grab"></div>' + html;
        r.querySelector('.hs-panel').scrollTop = 0;
        r.classList.add('open');
        return true;
    }
    function closeSheet(all) {
        var r = document.getElementById('hp-sheet');
        if (!r) return;
        if (!all && stack.length) { var k = stack.pop(); sheetKind = null; r.classList.remove('open'); OPEN[k](true); return; }
        stack = []; sheetKind = null; r.classList.remove('open');
    }
    function head(title, back) {
        return '<div class="hs-head">' + (back ? '<button type="button" class="hs-x" data-hs="back" aria-label="Back">‹</button>' : '')
            + '<div class="hs-title">' + esc(title) + '</div><button type="button" class="hs-x" data-hs="close" aria-label="Close">✕</button></div>';
    }

    // ---- 4. THE ROUND MENU --------------------------------------------------------
    var TILES = [
        // URGENT-023: "+ Bet" lives here now (first), not on the map's / the card's bottom bar.
        { k: 'bet', ico: '＋', t: 'Bet', s: 'Side bet: 1v1 or 2v2' },
        { k: 'card', ico: '📝', t: 'Card', s: 'Scores, hole by hole' },
        { k: 'bets', ico: '💰', t: 'Bets', s: 'Live money + leaderboard' },
        { k: 'gps', ico: '📍', t: 'GPS', s: 'Back to the map' },
        { k: 'share', ico: '🔗', t: 'Share', s: 'Group links, code, QR' },
        { k: 'settings', ico: '⚙️', t: 'Round settings', s: 'Players, tees, groups…' }
    ];
    function openMenu(again) {
        if (!on() || !code()) return false;
        if (!again) stack = [];
        var d = data() || {};
        // The course, the code beside it in its own chip (the mockup). POLISH #22: the name WRAPS (it
        // was cut to "Papago Golf Club (P…") and a "(Papago)" that repeats it is dropped.
        var html = '<div class="hs-head"><div class="hs-title hs-mtitle"><span class="hs-course">' + esc(tidyCourse(d.courseName || d.eventName || 'This round')) + '</span>'
            + '<span class="hs-codechip">' + esc(code()) + '</span></div><button type="button" class="hs-x" data-hs="close" aria-label="Close">✕</button></div>'
            + '<div class="hs-tiles">' + TILES.filter(function (t) { return t.k !== 'gps' || gpsUp(); }).map(function (t) {
                return '<button type="button" class="hs-tile" data-hs-tile="' + t.k + '"><b>' + t.ico + ' ' + esc(t.t) + '</b><span>' + esc(t.s) + '</span></button>';
            }).join('') + '</div>'
            + '<button type="button" class="hs-finish" data-hs="finish">Finish &amp; settle up</button>'
            // THE WAY OUT (URGENT-019, Manny stuck in a Talking Stick round): Change course and Leave
            // round are rows of their own, not footnotes.
            + '<div class="hs-ways">'
            + '<button type="button" class="hs-way" data-hs="change-course"><b>\u26F3 Change course</b><span>' + (scored() ? 'Start a new round somewhere else - this one stays in History' : 'Pick another course - nothing scored yet') + '</span></button>'
            + '<button type="button" class="hs-way" data-hs="leave"><b>\uD83C\uDFE0 Leave round \u203a Home</b><span>It stays on Home under In progress - Resume picks up on this hole</span></button>'
            + '</div>'
            + '<div class="hs-note">Trip, history, how it works and stats: <a href="home.html#more">Home › More</a></div>'
            // URGENT-024: which build this is (stamped by the build) - Manny checks his phone against the report.
            + '<div class="hs-note hs-build" style="opacity:.7;font-size:12px;">Build: ' + esc(String(window.HARDPAN_BUILD || 'dev (not a build)')) + '</div>';
        return show('menu', html, 'Round Menu');
    }
    function tile(k) {
        if (k === 'card') { closeSheet(true); closeBets(); toFullCard(); return; }
        if (k === 'bets') { closeSheet(true); openBets(); return; }
        if (k === 'gps') { closeSheet(true); closeBets(); toGps(); return; }
        if (k === 'bet') { closeSheet(true); if (B()) B().open(); return; }
        if (k === 'share') { openShare(); return; }
        if (k === 'settings') { closeSheet(true); openSettings(); return; }
    }

    // ---- SHARE: the code, its link, the QR codes, each group's link -------------
    function groups() {
        var d = data() || {};
        try { return computeGroupBoundaries((d.players || []).length, d.groupSizeOverrides || {}); } catch (e) { return []; }
    }
    function openShare() {
        if (!on() || !code()) return false;
        var d = data() || {}, gs = groups(), players = d.players || [];
        var html = head('Share', true)
            + '<div class="hs-code" aria-label="Round code">' + esc(code()) + '</div>'
            + '<button type="button" class="hs-btn" data-hs="share-link">Share the round link</button>'
            + '<button type="button" class="hs-btn alt" data-hs="qr">📷 Show QR code</button>';
        if (gs.length > 1 && organizer()) {
            html += '<div class="hs-h">Scorekeeper links · one per group</div>' + gs.map(function (b) {
                var names = players.slice(b.startIdx, b.startIdx + b.size).map(function (p) { return typeof golferShortName === 'function' ? golferShortName(p, players) : String(p.name || '').split(' ')[0]; }).join(', ');
                return '<div class="hs-row"><div class="hs-grow"><b>Group ' + b.group + '</b><small>' + esc(names) + '</small></div>'
                    + '<button type="button" data-hs-copy="' + b.group + '">Copy</button><button type="button" data-hs-sharegroup="' + b.group + '">Share</button></div>';
            }).join('');
        } else if (locked()) {
            html += '<div class="hs-h">Your group’s link</div><div class="hs-row"><div class="hs-grow"><b>Group ' + locked() + '</b><small>Keeps score for this group</small></div>'
                + '<button type="button" data-hs-copy="' + locked() + '">Copy</button><button type="button" data-hs-sharegroup="' + locked() + '">Share</button></div>';
        }
        return show('share', html, 'Share');
    }
    function groupUrl(g) { return roundUrl() + '&group=' + encodeURIComponent(g); }
    function shareText(title, text, url) {
        var nav = window.navigator;
        try {
            var C = window.Capacitor, SP = C && C.Plugins && C.Plugins.Share;
            if (SP && typeof SP.share === 'function') { SP.share({ title: title, text: text, url: url }); return 'native'; }
        } catch (e) {}
        if (nav && typeof nav.share === 'function') { nav.share({ title: title, text: text, url: url }).catch(function () {}); return 'web'; }
        copy([text, url].filter(Boolean).join('\n'));
        return 'copy';
    }
    function copy(t) {
        var done = function () { say('Copied'); };
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t); done(); }); return; }
        } catch (e) {}
        fallbackCopy(t); done();
    }
    function fallbackCopy(t) {
        try { var a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); } catch (e) {}
    }

    // ---- FINISH & SETTLE UP: one screen, the fewest payments --------------------
    function settle() {
        var d = data();
        if (!d || typeof computeCombinedNetTotals !== 'function') return null;
        try { return computeCombinedNetTotals(d, (d.courseData || []).slice().sort(function (a, b) { return a.hole - b.hole; }), d.scores || {}); } catch (e) { return null; }
    }
    function payText(res) {
        var d = data() || {};
        var tx = (res && res.transactions) || [];
        var lines = [(d.courseName || d.eventName || 'Our round') + ' · ' + code() + ' · settle up'];
        if (!tx.length) lines.push('Everyone is square.');
        tx.forEach(function (t) { lines.push(t.from + ' pays ' + t.to + ' $' + whole(t.amount)); });
        return lines.join('\n');
    }
    function openFinish() {
        if (!on() || !code()) return false;
        var res = settle();
        var missing = 0;
        try { missing = typeof findMissingScores === 'function' ? findMissingScores().length : 0; } catch (e) { missing = 0; }
        var tx = (res && res.transactions) || [];
        var html = head('Settle up', true);
        if (!res) html += '<div class="hs-gate">Couldn’t total the money - open the full review below.</div>';
        else if (missing) html += '<div class="hs-gate">Money so far - not final: ' + missing + ' score' + (missing === 1 ? '' : 's') + ' still missing.</div>';
        html += '<div class="hs-h">' + (!tx.length ? 'Who pays who' : (tx.length === 1 ? 'One payment settles' : tx.length + ' payments settle') + ' everything') + '</div>';
        html += tx.length ? tx.map(function (t) {
            return '<div class="hs-row hs-pay"><div class="hs-grow"><b>' + esc(t.from) + '</b> → <b>' + esc(t.to) + '</b></div><span class="hs-amt">$' + whole(t.amount) + '</span></div>';
        }).join('') : '<div class="hs-row">Everyone’s square - nobody owes anybody.</div>';
        var tot = res ? Object.keys(res.netByName || {}).map(function (k) { return res.netByName[k]; }).sort(function (a, b) { return b.net - a.net; }) : [];
        if (tot.length) {
            html += '<div class="hs-h">Everyone</div>' + tot.map(function (t) {
                var cls = t.net > 0.005 ? 'pos' : (t.net < -0.005 ? 'neg' : '');
                return '<div class="hs-row"><div class="hs-grow">' + esc(t.name) + '</div><span class="hs-amt ' + cls + '">' + (t.net > 0.005 ? '+' : (t.net < -0.005 ? '−' : '')) + '$' + whole(t.net) + '</span></div>';
            }).join('');
        }
        html += '<button type="button" class="hs-btn lime" data-hs="share-pay">Share who pays who</button>'
            // 018: a bet on holes already played, still possible once the round is over.
            + '<button type="button" class="hs-btn alt" data-hs="add-bet">+ Add a bet on this round</button>'
            + '<button type="button" class="hs-btn alt" data-hs="review">Review scores · Receipt</button>';
        return show('finish', html, 'Settle up');
    }

    var OPEN = { menu: openMenu, share: openShare, finish: openFinish };

    function onSheetClick(e) {
        var t = e.target;
        if (t.classList && t.classList.contains('hs-scrim')) { closeSheet(true); return; }
        var b = t.closest ? t.closest('button, a') : null;
        if (!b) return;
        if (b.tagName === 'A') { closeSheet(true); return; }
        var a = b.getAttribute('data-hs');
        if (b.hasAttribute('data-hs-tile')) { tile(b.getAttribute('data-hs-tile')); return; }
        if (b.hasAttribute('data-hs-copy')) {
            var g = b.getAttribute('data-hs-copy'), u = groupUrl(g);
            if (typeof copyGroupLinkFromScorecard === 'function') copyGroupLinkFromScorecard(u, Number(g), b); else copy(u);
            return;
        }
        if (b.hasAttribute('data-hs-sharegroup')) { var g2 = b.getAttribute('data-hs-sharegroup'); shareText('Group ' + g2 + ' scorecard', 'Keep score for Group ' + g2 + ':', groupUrl(g2)); return; }
        if (a === 'close') { closeSheet(true); return; }
        if (a === 'back') { closeSheet(false); return; }
        if (a === 'finish') { openFinish(); return; }
        if (a === 'change-course') { closeSheet(true); changeCourse(); return; }
        if (a === 'leave') { closeSheet(true); leaveRound(); return; }
        if (a === 'share-link') { var d = data() || {}; shareText(d.eventName || 'Our round', 'Join ' + (d.courseName || 'the round') + ' - code ' + code(), roundUrl()); return; }
        if (a === 'qr') {
            closeSheet(true);
            if (typeof openRoundQrSheet === 'function') openRoundQrSheet(null);
            return;
        }
        if (a === 'add-bet') { closeSheet(true); if (B()) B().open(null, { returnTo: 'finish' }); return; }
        if (a === 'share-pay') { shareText('Settle up', payText(settle()), ''); return; }
        if (a === 'review') {
            closeSheet(true); closeBets();
            if (onGps()) toCard();
            if (typeof openFinishRoundModal === 'function') openFinishRoundModal();
            return;
        }
    }

    // ---- THE WAY OUT (URGENT-019) ----------------------------------------------
    // CHANGE COURSE. Nothing scored yet: this round is dropped as the phone's round in progress
    // (Home does not offer an empty round as Resume) and the GPS door's Course & Tees screen opens
    // for a NEW round (home.html#gpsdoor - no lobby, URGENT-016's cover). Scores in: it asks first;
    // the old round keeps its scores and stays in History (Games), and Resume until the new one starts.
    function scored() {
        var sc = (data() || {}).scores || {};
        return Object.keys(sc).some(function (k) { return Number(sc[k]) > 0; });
    }
    function changeCourse() {
        var c = code(), has = scored();
        var go = function () {
            var H = window.HardPanDoors;
            if (!has && c && H && typeof H.forgetRound === 'function') { try { H.forgetRound(c, false); } catch (e) {} }
            // URGENT-028: "New round" was the answer - Start Round on Course & Tees does not ask again.
            if (has && c) { try { sessionStorage.setItem('hardpan_change_from', String(c).toUpperCase()); } catch (e) {} }
            window.location.href = 'home.html#gpsdoor';
        };
        if (!has || typeof window.uiConfirm !== 'function') { go(); return true; }
        window.uiConfirm({ title: 'Start a new round at another course?', body: 'This round keeps its scores - it stays in History (and Resume on Home).',
            confirmText: 'New round', cancelText: 'Not now', danger: false }).then(function (yes) { if (yes) go(); }, function () {});
        return true;
    }
    // LEAVE ROUND: Home; the round stays In progress there (Resume opens it on the same side + hole).
    function leaveRound() {
        var c = code();
        try {
            if (c) {
                var side = onGps() ? 'gps' : 'bets';
                localStorage.setItem('hardpan_round_side', side + '|' + c);
                // The hole Resume lands on: the map's, when leaving from the map (the card's own key,
                // index.html hpLastHoleKey - read on the next load).
                var g0 = G(), h = side === 'gps' && g0 && typeof g0.hole === 'function' ? Number(g0.hole()) : 0;
                if (h > 0) localStorage.setItem('hardpan_last_hole_' + c + (locked() ? '_g' + locked() : ''), String(h));
            }
        } catch (e) {}
        window.location.href = 'home.html';
        return true;
    }

    // ---- ROUND SETTINGS = today's Round Menu, plus GPS tools ---------------------
    var legacyOK = false, origToggle = null;
    function openSettings() {
        if (onGps()) toCard();
        legacyOK = true;
        addToolsButton();
        try { (origToggle || window.toggleRoundSheet)(true); } finally { legacyOK = false; }
        rsSetup(true);   // POLISH #21: the simpler look, in a GPS round
        return true;
    }
    function addToolsButton() {
        var body = document.getElementById('round-sheet-body');
        if (!body) return;
        var btn = document.getElementById('hp-gps-tools');
        if (!gpsUp()) { if (btn) btn.remove(); return; }
        if (btn) return;
        btn = document.createElement('button');
        btn.type = 'button'; btn.id = 'hp-gps-tools';
        btn.textContent = '🛠 GPS tools · layout, units, my bag, greens';
        btn.addEventListener('click', function () {
            try { (origToggle || window.toggleRoundSheet)(false); } catch (e) {}
            var g = G(); if (g && g.openTools) g.openTools();
        });
        body.insertBefore(btn, body.firstChild);
    }
    // The Round Menu pill / handle (and anything that opens that sheet the ordinary way)
    // opens the 6-tile menu instead; Round settings opens the sheet itself.
    function hookRoundSheet() {
        if (origToggle || typeof window.toggleRoundSheet !== 'function') return;
        origToggle = window.toggleRoundSheet;
        window.toggleRoundSheet = function (force) {
            var sh = document.getElementById('round-sheet');
            var opening = force === undefined ? !(sh && sh.classList.contains('open')) : !!force;
            if (opening && on() && !legacyOK && code()) { openMenu(); return; }
            if (!opening && sh && sh.classList.contains('hp-rs')) { var res = origToggle.apply(this, arguments); rsSetup(false); return res; }
            return origToggle.apply(this, arguments);
        };
    }

    // ---- ROUND SETTINGS, SIMPLER (POLISH #21, URGENT-040: the 039 proposal) ------------------
    // In a GPS round the Round settings sheet shows five rows on top - Golfers, Tee, Start (Hole 1 /
    // 10 / Shotgun), Add a game, Change course - and "More" under them, which opens the rest in three
    // groups: THIS ROUND, THIS PHONE, GO TO; then Save & exit and Delete round.
    // NOTHING IS REBUILT: every row is a PROXY for the control that is in the sheet today (the quick
    // edits, front-door's Add a game / Paste, Full setup, Dark Mode, History, the nav links, the view
    // and group buttons, Group Links, Players, My stats, Share, Save & exit, Delete). Those stay in
    // the sheet with their ids, handlers and renderers, only hidden; a tap on a row clicks the very
    // control it stands for, so it goes to the same place by the same function. A control that is
    // not drawn today (organizer-only, spectating, one group...) has no row. Anything in the sheet
    // that has no row of its own (a receipt button after the finish...) still shows, under GO TO.
    // Non-GPS rounds (Consumer, Game Day, simpleFlow off): untouched - the class is never set.
    var RS = { more: false, timer: null, obs: null };
    var RS_NAV = { 'index.html': ['📝', 'Scorecard'], 'leaderboard.html': ['🏆', 'Leaderboard'], 'skins.html': ['💰', 'Bets'], 'settlement.html': ['🤝', 'Results'],
        'sidematches.html': ['⚔️', 'Matches'], 'game.html': ['📖', 'Game'], 'trip.html': ['🚐', 'Trip'], 'instructions.html': ['🧭', 'How it works'], 'admin.html': ['🏠', 'Home'] };
    var RS_CSS = '#round-sheet.hp-rs{background:#f2f4ef;color:#13241d;color-scheme:light;}'
        + '#round-sheet.hp-rs #round-sheet-handle{min-height:20px;padding:8px 0 2px;}#round-sheet.hp-rs #round-sheet-pill{display:none;}'
        + '#round-sheet.hp-rs #round-sheet-handle::before{background:#c9d1cc;width:40px;height:5px;border-radius:3px;top:7px;}'
        + '#round-sheet.hp-rs #round-sheet-body{padding:0 16px max(16px,env(safe-area-inset-bottom,0px));}'
        + '#round-sheet.hp-rs #round-sheet-body>:not(#hp-rs):not(#hp-rs-end):not(#dot-context-row):not(#group-links-panel){display:none !important;}'
        + '#round-sheet.hp-rs:not(.hp-rs-more) #hp-rs-end,#round-sheet.hp-rs:not(.hp-rs-more) #dot-context-row,#round-sheet.hp-rs:not(.hp-rs-more) #group-links-panel{display:none !important;}'
        + '#hp-rs,#hp-rs-end{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color:#13241d;}'
        + '#hp-rs *,#hp-rs-end *{box-sizing:border-box;}'
        + '#hp-rs button,#hp-rs-end button{font-family:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;}'
        + '#hp-rs .rs-top{position:sticky;top:0;z-index:2;background:#f2f4ef;padding:2px 0 12px;}'
        + '#hp-rs .rs-hd{display:flex;align-items:center;gap:10px;min-height:44px;}'
        + '#hp-rs .rs-t{flex:1;margin:0;font-size:24px;font-weight:800;letter-spacing:-.01em;line-height:1.15;}'
        + '#hp-rs .rs-x{flex:none;width:44px;height:44px;border:0;border-radius:50%;background:#e9eee9;font-size:17px;}'
        + '#hp-rs .rs-sub{margin:0 2px;font-size:14px;color:#5d6b64;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
        + '#hp-rs .rs-row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#fff;border:1px solid #dfe5df;border-radius:16px;padding:12px 14px;margin:0 0 10px;min-height:66px;}'
        + '#hp-rs .rs-em{width:40px;height:40px;border-radius:12px;background:#eef1ee;display:flex;align-items:center;justify-content:center;font-size:21px;flex:none;}'
        + '#hp-rs .rs-txt{flex:1;min-width:0;}'
        + '#hp-rs .rs-tt{display:block;font-size:17px;font-weight:800;color:#0f4c3a;}'
        + '#hp-rs .rs-dd{display:block;font-size:13.5px;color:#5d6b64;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
        + '#hp-rs .rs-go{flex:none;font-size:24px;color:#9aa0a6;}'
        + '#hp-rs .rs-dot{width:22px;height:22px;border-radius:50%;border:2px solid #9aa0a6;background:#fff;}'
        + '#hp-rs .rs-start{cursor:default;}#hp-rs .rs-chips{display:flex;gap:6px;margin-left:auto;flex:none;}'
        + '#hp-rs .rs-chips button{white-space:nowrap;border:0;border-radius:999px;padding:0 13px;min-height:40px;background:#e9eee9;font-size:14px;font-weight:600;}'
        + '#hp-rs .rs-chips button.on{background:#0f4c3a;color:#fff;}'
        + '#hp-rs .rs-addg{display:flex;align-items:center;gap:12px;width:100%;border:0;border-radius:16px;background:#0f4c3a;color:#fff;padding:0 16px;min-height:58px;margin:0 0 10px;font-size:18px;font-weight:800;text-align:left;}'
        + '#hp-rs .rs-addg .rs-tt{display:inline;color:#fff;font-size:18px;}#hp-rs .rs-addg .rs-plus{font-size:22px;color:#d4f27c;}#hp-rs .rs-addg .rs-dd{color:#fff;opacity:.75;font-size:13px;font-weight:600;margin:0 0 0 auto;}'
        + '#hp-rs .rs-more{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:1.5px dashed #b8c4bd;border-radius:16px;padding:12px 14px;min-height:60px;background:transparent;margin:0;}'
        + '#hp-rs .rs-more .rs-tt{color:#13241d;}#hp-rs .rs-more .rs-dd{white-space:normal;font-size:13px;}#hp-rs .rs-more .rs-go{font-size:16px;color:#0f4c3a;font-weight:800;}'
        + '#hp-rs.open .rs-more{border:2px solid #0f4c3a;background:#f3f8f4;min-height:48px;margin-bottom:4px;}'
        + '#hp-rs .rs-hint{display:none;font-size:12.5px;color:#5d6b64;margin:0 2px 8px;}#hp-rs.open .rs-hint{display:block;}'
        + '#hp-rs .rs-foot{text-align:center;margin-top:14px;}#hp-rs.open .rs-foot{display:none;}'
        + '#hp-rs .rs-code{display:inline-flex;align-items:center;border-radius:999px;padding:5px 11px;background:#0f4c3a;color:#fff;letter-spacing:.08em;font-weight:800;font-size:12px;line-height:1;}'
        + '#hp-rs .rs-open{display:none;}#hp-rs.open .rs-open{display:block;}'
        + '#hp-rs .rs-h{font-size:12px;font-weight:800;letter-spacing:.08em;color:#667;margin:12px 2px 5px;text-transform:uppercase;}'
        + '#hp-rs .rs-list,#hp-rs-end .rs-list{background:#fff;border:1px solid #dfe5df;border-radius:16px;overflow:hidden;margin-bottom:10px;}'
        + '#hp-rs .rs-li,#hp-rs-end .rs-li{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;border-top:1px solid #dfe5df;background:#fff;padding:0 14px;min-height:44px;font-size:15px;font-weight:600;}'
        + '#hp-rs .rs-li:first-child,#hp-rs-end .rs-li:first-child{border-top:0;}'
        + '#hp-rs .rs-ic{width:24px;text-align:center;font-size:16px;flex:none;}'
        + '#hp-rs .rs-r,#hp-rs-end .rs-r{margin-left:auto;font-size:13.5px;color:#5d6b64;font-weight:500;white-space:nowrap;}'
        + '#hp-rs .rs-r b,#hp-rs-end .rs-r b{font-size:20px;color:#9aa0a6;font-weight:400;margin-left:4px;vertical-align:-2px;}'
        + '#hp-rs .rs-plain{cursor:default;}#hp-rs .rs-lock{color:#b3261e;}'
        + '#hp-rs .rs-tog{display:inline-block;vertical-align:middle;width:44px;height:26px;border-radius:13px;background:#d5dbd7;position:relative;transition:background .15s;}'
        + '#hp-rs .rs-tog:after{content:"";position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s;}'
        + '#hp-rs .rs-tog.on{background:#0f4c3a;}#hp-rs .rs-tog.on:after{left:21px;}'
        + '#hp-rs .rs-grid{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}'
        + '#hp-rs .rs-grid button{background:#fff;border:1px solid #dfe5df;border-radius:999px;padding:0 10px;min-height:36px;font-size:13px;font-weight:600;}'
        + '#hp-rs .rs-grid button.on{border:1.5px solid #0f4c3a;color:#0f4c3a;}'
        + '#hp-rs-end .rs-danger{display:block;width:100%;border:0;background:none;color:#b3261e;font-size:14px;font-weight:700;text-align:center;padding:4px 0 10px;min-height:44px;}';
    function rsOn() { var sh = document.getElementById('round-sheet'); return !!(sh && sh.classList.contains('hp-rs')); }
    // What a control in the sheet IS, so its row finds it again after a re-render (the group strip
    // and the nav are repainted on every snapshot).
    function rsKey(e) {
        var id = e.id, oc = e.getAttribute('onclick') || '', m;
        if (id === 'hp-gps-tools') return 'gps';
        if (id === 'theme-toggle-btn') return 'dark';
        if (id === 'qs-menu-mystats') return 'mystats';
        if (id === 'sc-foot-save') return 'save';
        if (id === 'sc-foot-guide') return 'guide';
        if (id === 'view-mode-full-btn') return 'full';
        if (id === 'view-mode-hole-btn') return 'holeview';
        if (e.getAttribute('data-hq')) return 'q-' + e.getAttribute('data-hq');
        if (e.getAttribute('data-fdm')) return 'fdm-' + e.getAttribute('data-fdm');
        if (e.getAttribute('data-hp-full') === '1') return 'fullsetup';
        if (/openHistoryModal/.test(oc)) return 'history';
        if (/toggleGroupLinksPanel/.test(oc)) return 'grouplinks';
        if (/openPlayersSheet/.test(oc)) return 'players';
        if (/endAndClearRound/.test(oc)) return 'delete';
        if ((m = /filterGroup\(\s*'?(\w+)'?\s*\)/.exec(oc))) return 'f-' + m[1];
        if (e.closest('#qr-share-mount')) return 'share';
        if (e.tagName === 'A' && e.closest('#app-nav-wrap')) return 'nav-' + String(e.getAttribute('href') || '').split('?')[0].split('/').pop();
        return null;
    }
    // Shown in the sheet: laid out, and not display:none inside it. (Visibility is not asked: the
    // sheet is still coming up when the rows are drawn, and a control with a CSS transition - the
    // .btn-outline links - still reads "hidden" at that instant.)
    function rsShown(e, body) {
        var r = e.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return false;
        for (var x = e; x && x !== body; x = x.parentElement) { if (getComputedStyle(x).display === 'none') return false; }
        return true;
    }
    // Today's controls, as today's sheet shows them (measured with the new look switched off for a
    // moment - one synchronous pass, nothing is painted in between).
    function rsControls() {
        var sh = document.getElementById('round-sheet'), body = document.getElementById('round-sheet-body'), out = [], seen = {};
        if (!sh || !body) return out;
        var had = sh.classList.contains('hp-rs');
        if (had) sh.classList.remove('hp-rs');
        try {
            Array.prototype.forEach.call(body.querySelectorAll('button, a[href]'), function (e) {
                if (e.closest('#hp-rs, #hp-rs-end, #group-links-panel, #dot-context-row') || !rsShown(e, body)) return;
                var k = rsKey(e), text = String(e.textContent || '').replace(/\s+/g, ' ').trim();
                if (!k) { k = 'x-' + text; }
                if (seen[k]) return;
                seen[k] = 1;
                out.push({ k: k, el: e, text: text, on: e.tagName === 'BUTTON' && (/\bactive\b/.test(e.className) || e.getAttribute('aria-pressed') === 'true') });
            });
        } finally { if (had) sh.classList.add('hp-rs'); }
        return out;
    }
    function rsFind(k) { var c = rsControls().filter(function (x) { return x.k === k; })[0]; return c ? c.el : null; }
    function rsNames(ps) {
        return ps.map(function (p) { try { return typeof golferLabel === 'function' ? golferLabel(p) : String(p.name || ''); } catch (e) { return String((p && p.name) || ''); } });
    }
    function rsStartNow(d) {
        var m = d.groupStartingHoles || {};
        if (Object.keys(m).some(function (g) { return Number(m[g]) > 0; })) return 'shotgun';
        var s = 1;
        try { s = typeof teeStartHole === 'function' ? teeStartHole(d, d.courseData || []) : (Number(d.startingHole) || 1); } catch (e) {}
        return s === 10 ? '10' : '1';
    }
    function rsRender() {
        var sh = document.getElementById('round-sheet'), body = document.getElementById('round-sheet-body');
        if (!sh || !body || !rsOn()) return;
        try { if (window.HardPanRoundEdit && window.HardPanRoundEdit.decorate) window.HardPanRoundEdit.decorate(); } catch (e) {}
        addToolsButton();
        var d = data() || {}, ps = d.players || [], names = rsNames(ps), C = rsControls(), has = {}, used = {};
        C.forEach(function (c) { has[c.k] = c; });
        var take = function (k) { used[k] = 1; return has[k]; };
        var row = function (k, em, tt, dd, extra) {
            if (!take(k)) return '';
            return '<button type="button" class="rs-row" data-rs="' + esc(k) + '"' + (extra || '') + '><span class="rs-em">' + em + '</span><span class="rs-txt"><span class="rs-tt">' + esc(tt) + '</span>'
                + (dd ? '<span class="rs-dd">' + esc(dd) + '</span>' : '') + '</span><span class="rs-go" aria-hidden="true">›</span></button>';
        };
        var li = function (k, ic, tt, r) {
            if (!take(k)) return '';
            return '<button type="button" class="rs-li" data-rs="' + esc(k) + '"><span class="rs-ic">' + ic + '</span>' + esc(tt) + '<span class="rs-r">' + esc(r || '') + '<b aria-hidden="true">›</b></span></button>';
        };
        var chip = function (k, ic, tt) {
            if (!take(k)) return '';
            return '<button type="button" data-rs="' + esc(k) + '"' + (has[k].on ? ' class="on" aria-pressed="true"' : '') + '>' + (ic ? ic + ' ' : '') + esc(tt) + '</button>';
        };
        // THE TOP: Golfers, Tee, Start, Add a game, Change course.
        var who = ps.slice(0, 3).map(function (p, i) { return names[i] + (p.hcp !== undefined && p.hcp !== '' ? ' ' + p.hcp : ''); }).join(' · ') + (ps.length > 3 ? ' +' + (ps.length - 3) : '');
        var tr = d.teeRating || null, teeName = tr && tr.teeName ? String(tr.teeName).replace(/^(Men|Women)\s*·\s*/, '') : '';
        var dotCol = null;
        try { if (teeName && window.HardPanRoundEdit && window.HardPanRoundEdit.teeColor) dotCol = window.HardPanRoundEdit.teeColor(teeName); } catch (e) {}
        var dot = '<span class="rs-dot"' + (dotCol && dotCol !== '#fff' ? ' style="background:' + dotCol + ';border-color:' + dotCol + '"' : '') + '></span>';
        var top = row('q-players', '👥', 'Golfers', (who ? who + ' · ' : '') + 'add, rename')
            + row('q-tee', dot, 'Tee', teeName ? teeName + ' · handicaps set' : 'Everyone’s tee and the handicaps');
        if (take('q-start')) {
            var holes = (d.courseData || []).map(function (h) { return Number(h && h.hole); }), now = rsStartNow(d);
            var ten = holes.indexOf(10) > -1 && holes.length >= 18, gs = groups().length > 1;
            top += '<div class="rs-row rs-start"><span class="rs-txt"><span class="rs-tt">Start</span><span class="rs-dd">' + (now === 'shotgun' ? 'Shotgun' : now === '10' ? 'Back nine first' : 'First tee') + '</span></span>'
                + '<span class="rs-chips" role="group" aria-label="Start">'
                + '<button type="button" data-rs="q-start" data-rs-start="1"' + (now === '1' ? ' class="on" aria-pressed="true"' : '') + '>Hole 1</button>'
                + (ten ? '<button type="button" data-rs="q-start" data-rs-start="10"' + (now === '10' ? ' class="on" aria-pressed="true"' : '') + '>10</button>' : '')
                + (gs ? '<button type="button" data-rs="q-start" data-rs-start="shotgun"' + (now === 'shotgun' ? ' class="on" aria-pressed="true"' : '') + '>Shotgun</button>' : '')
                + '</span></div>';
        }
        if (take('fdm-add')) top += '<button type="button" class="rs-addg" data-rs="fdm-add"><span class="rs-plus">＋</span><span class="rs-tt">Add a game</span><span class="rs-dd">Nassau, skins, bets</span></button>';
        top += row('q-course', '⛳', 'Change course', 'A new round somewhere else');
        // MORE: the rest, grouped.
        var weekly = d.moneyPool && d.moneyPool.enabled !== false ? 'On' : 'Off';
        var thisRound = li('q-addgolfer', '＋', 'Add golfer', 'Name, HCP, tee') + li('q-groups', '🫂', 'Groups', 'Who plays with who') + li('q-nines', '9️⃣', 'Nines', 'Front / back')
            + li('q-weekly', '🏆', 'Weekly Game', weekly) + li('fdm-paste', '📋', 'Paste the whole round', '') + li('fdm-trip', '🗓️', 'Paste a multi-round match', '')
            + li('fullsetup', '🧰', 'Full setup', 'Every step');
        var dark = document.documentElement.classList.contains('dark-mode');
        var thisPhone = li('gps', '🛠', 'GPS tools', 'Layout, units, bag');
        if (take('dark')) thisPhone += '<button type="button" class="rs-li" data-rs="dark" role="switch" aria-checked="' + dark + '"><span class="rs-ic">🌙</span>Dark Mode<span class="rs-r"><span class="rs-tog' + (dark ? ' on' : '') + '"></span></span></button>';
        var badge = document.getElementById('group-lock-badge');
        if (badge && badge.style.display !== 'none' && String(badge.textContent || '').trim()) {
            var bt = String(badge.textContent).replace(/^[^A-Za-z0-9]+/, '').replace(/^Scorekeeper:\s*/i, '').replace(/\bOnly\b/, 'only');
            thisPhone += '<div class="rs-li rs-plain"><span class="rs-ic">🔒</span>Scorekeeper<span class="rs-r rs-lock">' + esc(bt) + '</span></div>';
        }
        used.guide = 1;   // the footer's 🧭 goes where "How it works" goes (the same guide link)
        var go = chip('nav-index.html', '📝', 'Scorecard') + chip('full', '📋', 'Full Card') + chip('holeview', '', 'Hole View')
            + chip('nav-leaderboard.html', '🏆', 'Leaderboard') + chip('nav-skins.html', '💰', 'Bets') + chip('nav-settlement.html', '🤝', 'Results')
            + chip('nav-sidematches.html', '⚔️', 'Matches') + chip('nav-game.html', '📖', 'Game') + chip('nav-trip.html', '🚐', 'Trip')
            + chip('grouplinks', '🔗', 'Group Links') + chip('players', '👥', 'Players');
        C.forEach(function (c) { if (/^f-/.test(c.k)) go += chip(c.k, '', c.text); });
        go += chip('history', '🕘', 'History') + chip('mystats', '📊', 'My stats') + chip('share', '📤', 'Share')
            + chip('nav-instructions.html', '🧭', 'How it works') + chip('nav-admin.html', '🏠', 'Home');
        // Anything else the sheet has today keeps a way in.
        C.forEach(function (c) {
            if (used[c.k] || c.k === 'save' || c.k === 'delete') return;
            var nv = /^nav-/.test(c.k) ? RS_NAV[c.k.slice(4)] : null;
            go += chip(c.k, nv ? nv[0] : '', nv ? nv[1] : c.text);
        });
        var hasTop = !!top;
        if (!hasTop) RS.more = true;
        var host = document.getElementById('hp-rs');
        if (!host) { host = document.createElement('div'); host.id = 'hp-rs'; host.addEventListener('click', rsClick); }
        if (body.firstChild !== host) body.insertBefore(host, body.firstChild);
        var course = tidyCourse(d.courseName || d.eventName || 'This round');
        var sub = course + (names.length ? ' · ' + names.slice(0, 4).join(', ') + (names.length > 4 ? ' +' + (names.length - 4) : '') : '');
        var y = body.scrollTop;
        host.className = RS.more ? 'open' : '';
        host.innerHTML = '<div class="rs-top"><div class="rs-hd"><h2 class="rs-t">Round settings</h2><button type="button" class="rs-x" data-rs="close" aria-label="Close">✕</button></div>'
            + '<div class="rs-sub">' + esc(sub) + '</div></div>'
            + top
            + '<div class="rs-hint" id="hp-rs-hint">' + (hasTop ? '↑ Golfers, Tee, Start, Add a game, Change course stay above' : '') + '</div>'
            + '<button type="button" class="rs-more" data-rs="more" aria-expanded="' + RS.more + '"><span class="rs-txt"><span class="rs-tt">More</span>'
            + (RS.more ? '' : '<span class="rs-dd">Weekly Game, paste a round, Dark Mode, scorekeeper lock, full setup…</span>') + '</span><span class="rs-go" aria-hidden="true">' + (RS.more ? '▴' : '▾') + '</span></button>'
            + '<div class="rs-foot"><span class="rs-code">GAME · ' + esc(code() || '') + '</span></div>'
            + '<div class="rs-open">'
            + (thisRound ? '<div class="rs-h">This round</div><div class="rs-list">' + thisRound + '</div>' : '')
            + (thisPhone ? '<div class="rs-h">This phone</div><div class="rs-list">' + thisPhone + '</div>' : '')
            + (go ? '<div class="rs-h">Go to</div><div class="rs-grid">' + go + '</div>' : '')
            + '</div>';
        var end = document.getElementById('hp-rs-end');
        if (!end) { end = document.createElement('div'); end.id = 'hp-rs-end'; end.addEventListener('click', rsClick); }
        end.innerHTML = (has.save ? '<div class="rs-list"><button type="button" class="rs-li" data-rs="save"><span class="rs-ic">⬅️</span>Save &amp; exit<span class="rs-r">GAME · ' + esc(code() || '') + '<b aria-hidden="true">›</b></span></button></div>' : '')
            + (has['delete'] ? '<button type="button" class="rs-danger" data-rs="delete">🗑️ Delete round for everyone</button>' : '');
        if (body.lastChild !== end) body.appendChild(end);
        sh.classList.toggle('hp-rs-more', RS.more);
        body.scrollTop = y;
    }
    function rsClick(ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-rs]') : null;
        if (!b) return;
        var k = b.getAttribute('data-rs');
        if (k === 'close') { window.toggleRoundSheet(false); return; }
        if (k === 'more') {
            RS.more = !RS.more; rsRender();
            var body = document.getElementById('round-sheet-body'), hint = document.getElementById('hp-rs-hint'), topb = document.querySelector('#hp-rs .rs-top');
            if (body) body.scrollTop = RS.more && hint && topb ? Math.max(0, body.scrollTop + hint.getBoundingClientRect().top - topb.getBoundingClientRect().bottom - 2) : 0;
            return;
        }
        var el = rsFind(k);
        if (!el) { rsRender(); return; }
        var st = b.getAttribute('data-rs-start');
        el.click();   // today's control, today's handler
        if (st && window.HardPanRoundEdit && window.HardPanRoundEdit.isOpen && window.HardPanRoundEdit.isOpen()) {
            // Start's chips open today's Start sheet with that choice made - its own Save writes it.
            var c = document.querySelector(st === 'shotgun' ? '#hp-redit [data-re="shotgun"]' : '#hp-redit [data-re-start="' + st + '"]');
            if (c) c.click();
        }
        if (k === 'grouplinks') setTimeout(function () { var p = document.getElementById('group-links-panel'); if (p && p.offsetHeight) { try { p.scrollIntoView({ block: 'nearest' }); } catch (e) {} } }, 60);
        rsSoon();
    }
    function rsSoon() { if (RS.timer) return; RS.timer = setTimeout(function () { RS.timer = null; if (settingsOpen() && rsOn()) rsRender(); }, 60); }
    function rsWatch() {
        var body = document.getElementById('round-sheet-body');
        if (!body || RS.obs || !window.MutationObserver) return;
        var mine = function (n) { return !!(n && n.nodeType === 1 ? (n.id === 'hp-rs' || n.id === 'hp-rs-end' || (n.closest && n.closest('#hp-rs, #hp-rs-end'))) : n && n.parentNode && mine(n.parentNode)); };
        RS.obs = new MutationObserver(function (list) {
            if (!rsOn() || !settingsOpen()) return;
            for (var i = 0; i < list.length; i++) {
                var m = list[i];
                if (mine(m.target)) continue;
                var nodes = Array.prototype.slice.call(m.addedNodes).concat(Array.prototype.slice.call(m.removedNodes));
                if (m.type === 'childList' && nodes.length && nodes.every(mine)) continue;
                rsSoon(); return;
            }
        });
        RS.obs.observe(body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
    }
    function rsSetup(open) {
        var sh = document.getElementById('round-sheet');
        if (!sh) return;
        var want = !!(open && on() && gpsUp() && code());
        sh.classList.toggle('hp-rs', want);
        if (!want) { sh.classList.remove('hp-rs-more'); return; }
        if (!document.getElementById('hp-rs-css')) { var s = document.createElement('style'); s.id = 'hp-rs-css'; s.textContent = RS_CSS; document.head.appendChild(s); }
        RS.more = false;
        rsWatch();
        rsRender();
        var body = document.getElementById('round-sheet-body'); if (body) body.scrollTop = 0;
    }

    // ---- 5. BETS AS A SHEET ---------------------------------------------------
    var betsTab = 'bets';
    function pageUrl(page) {
        var g = locked();
        return page + '?game=' + encodeURIComponent(code() || '') + (g ? '&group=' + g : '') + '&hpsheet=1';
    }
    function betsEl() {
        var r = document.getElementById('hp-bets');
        if (r) return r;
        ensureCss();
        r = document.createElement('div');
        r.id = 'hp-bets'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-label', 'Bets');
        r.innerHTML = '<div class="hb2-scrim"></div><div class="hb2-panel gps-scroll-ok"><div class="hb2-head"><div class="hb2-tabs" role="tablist">'
            + '<button type="button" data-hb2="bets" class="on">💰 Bets</button><button type="button" data-hb2="board">🏆 Leaderboard</button></div>'
            + '<button type="button" class="hb2-x" data-hb2="close" aria-label="Close">✕</button></div>'
            + '<div class="hb2-me" role="status"></div><div class="hb2-body"></div></div>';
        document.body.appendChild(r);
        r.addEventListener('click', function (e) {
            if (e.target.classList.contains('hb2-scrim')) { closeBets(); return; }
            var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
            var k = b.getAttribute('data-hb2');
            if (k === 'close') closeBets(); else if (k) betsShow(k);
        });
        return r;
    }
    function frame(k) {
        var body = betsEl().querySelector('.hb2-body');
        var f = body.querySelector('iframe[data-k="' + k + '"]');
        if (f) return f;
        f = document.createElement('iframe');
        f.setAttribute('data-k', k);
        f.setAttribute('title', k === 'bets' ? 'Bets' : 'Leaderboard');
        f.addEventListener('load', function () { tidyFrame(f); fed[k] = null; feed(true); });
        f.src = pageUrl(k === 'bets' ? 'skins.html' : 'leaderboard.html');
        body.appendChild(f);
        return f;
    }
    // Same origin: hide the page's own nav (the bar is the nav here), and a link back to the
    // scorecard closes the sheet instead of loading the card inside it.
    function tidyFrame(f) {
        try {
            var doc = f.contentDocument; if (!doc) return;
            if (!doc.getElementById('hp-in-sheet')) {
                var st = doc.createElement('style'); st.id = 'hp-in-sheet';
                st.textContent = '.app-nav-wrap,#app-nav-wrap,.top-nav-bar,#round-sheet,#round-sheet-scrim,.back-btn,.theme-toggle-btn{display:none !important;}body{padding-bottom:24px !important;}';
                (doc.head || doc.documentElement).appendChild(st);
            }
            if (!doc.__hpLinks) {
                doc.__hpLinks = true;
                doc.addEventListener('click', function (e) {
                    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
                    if (!a) return;
                    var h = a.getAttribute('href') || '';
                    if (/(^|\/)index\.html/.test(h) || h === './' || h === '/') { e.preventDefault(); closeBets(); toCard(); return; }
                    if (/^(https?:)?\/\//.test(h) || /^mailto:|^tel:/.test(h)) return;
                    // Any other page of the app: the whole app goes there (never a page inside a frame).
                    e.preventDefault(); window.location.href = a.href;
                }, true);
            }
        } catch (e) {}
    }
    // INSTANT (part D): this page's round - with the score just typed, before any server round trip,
    // and with no signal at all - is handed to the Bets and Leaderboard frames, which paint it with
    // their own renderers (same origin; their top-level currentData / currentBoardData). Their own
    // Firebase listener still runs and wins on the next snapshot. Display only.
    var FEED = { bets: 'currentData = d; renderBets(); renderSkinsEngine(); renderBirdieGame();', board: 'currentBoardData = d; renderBoard();' };
    var fed = {}, feedTimer = null;
    function feed(now) {
        if (feedTimer && !now) return;
        var run = function () {
            feedTimer = null;
            var d = data(); if (!d || !d.players) return;
            var json; try { json = JSON.stringify(d); } catch (e) { return; }
            Array.prototype.forEach.call(document.querySelectorAll('#hp-bets iframe'), function (f) {
                var k = f.getAttribute('data-k');
                if (!FEED[k] || fed[k] === json) return;
                try {
                    var w = f.contentWindow;
                    if (!w || !w.document || w.document.readyState !== 'complete' || typeof w.eval !== 'function') return;
                    w.eval('(function (d) { try { ' + FEED[k] + ' } catch (e) {} })(' + json + ')');
                    fed[k] = json;
                } catch (e) {}
            });
        };
        if (now) run(); else feedTimer = setTimeout(run, 0);
    }
    function betsOpen() { return document.body.classList.contains('hp-bets-open'); }
    function betsShow(k) {
        betsTab = k === 'board' ? 'board' : 'bets';
        var r = betsEl();
        Array.prototype.forEach.call(r.querySelectorAll('[data-hb2="bets"],[data-hb2="board"]'), function (b) { b.classList.toggle('on', b.getAttribute('data-hb2') === betsTab); });
        var f = frame(betsTab);
        Array.prototype.forEach.call(r.querySelectorAll('iframe'), function (x) { x.style.visibility = x === f ? 'visible' : 'hidden'; });
    }
    function openBets(tab) {
        if (!on() || !code()) return false;
        closeSheet(true);
        var b = B(), m = b && (b.money() || b.refresh());
        var me = betsEl().querySelector('.hb2-me');
        if (me) me.textContent = m ? m.text : '';
        document.body.classList.toggle('hp-bets-open', true);
        betsShow(tab || betsTab);
        if (b) b.refresh();
        return true;
    }
    function closeBets() { document.body.classList.toggle('hp-bets-open', false); if (B()) B().refresh(); }
    // Opened once, kept: the frames load in the background a moment after the round shows.
    var warmed = false;
    function warm() {
        if (warmed || !on() || !code() || !(data() && (data().players || []).length)) return;
        warmed = true;
        setTimeout(function () { try { frame('bets'); } catch (e) {} }, 2500);
    }

    // ---- 5. THE CARD AS A SHEET OVER THE MAP --------------------------------------
    // ALWAYS A SHEET (part D): with GPS Map the map is built BEHIND the card when it is not built
    // yet (no location watch until it is shown), so the card is a sheet over it from the start.
    function sheetMode() {
        var g = G();
        return on() && !onGps() && gpsUp() && !!(g.canMap && g.canMap());
    }
    function syncCardSheet() {
        var want = sheetMode();
        if (document.body.classList.contains('hp-card-sheet') !== want) document.body.classList.toggle('hp-card-sheet', want);
        if (want) {
            strip();
            var g = G();
            if (g.mapReady && !g.mapReady() && g.prepareMap) { try { g.prepareMap(); } catch (e) {} }
        }
    }
    function strip() {
        if (document.getElementById('hp-strip')) return;
        ensureCss();
        var s = document.createElement('button');
        s.type = 'button'; s.id = 'hp-strip'; s.setAttribute('aria-label', 'Back to the map');
        s.innerHTML = '<span id="hp-strip-grab" aria-hidden="true"></span>';
        s.addEventListener('click', function (e) { e.preventDefault(); toGps(); });
        document.body.appendChild(s);
    }
    // A pull down from the top of the card = the map.
    var pull = null;
    function bindPull() {
        var mc = document.getElementById('main-content');
        if (!mc || mc.__hpPull) return;
        mc.__hpPull = true;
        mc.addEventListener('touchstart', function (e) {
            if (!document.body.classList.contains('hp-card-sheet') || (window.scrollY || document.documentElement.scrollTop) > 2 || !e.touches || e.touches.length !== 1) { pull = null; return; }
            pull = { y: e.touches[0].clientY, dy: 0 };
        }, { passive: true });
        mc.addEventListener('touchmove', function (e) {
            if (!pull || !e.touches) return;
            pull.dy = Math.max(0, e.touches[0].clientY - pull.y);
            if (pull.dy > 6) { mc.classList.add('hp-dragging'); mc.style.transform = 'translateY(' + Math.min(pull.dy, 260) + 'px)'; }
        }, { passive: true });
        var end = function () {
            if (!pull) return;
            var go = pull.dy > 90; pull = null;
            mc.classList.remove('hp-dragging'); mc.style.transform = '';
            if (go) toGps();
        };
        mc.addEventListener('touchend', end, { passive: true });
        mc.addEventListener('touchcancel', end, { passive: true });
    }

    // ---- MOVING BETWEEN THEM (no reload, the same hole) ----------------------------
    function screen() { return betsOpen() ? 'bets' : (onGps() ? 'gps' : 'card'); }
    function toGps() {
        var g = G(); if (!g || !gpsUp()) return false;
        closeBets(); closeSheet(true);
        return g.showSide('gps');
    }
    function toCard() {
        var g = G();
        closeBets(); closeSheet(true);
        if (g && gpsUp() && onGps()) g.showSide('bets', { remember: false });
        return true;
    }
    // POLISH #8: THE CARD IS THE 18-HOLE GRID (index.html's Full Card), hole by hole - the map's
    // ▤ Card and the Round Menu's Card tile. The "Final results are in" pop-up is Finish's alone, so
    // one left open behind the map is closed. Enter score goes back to the hole view (holeView).
    function cardMode(m) {
        try { if (typeof setViewMode === 'function' && typeof currentViewMode !== 'undefined' && currentViewMode !== m) setViewMode(m); } catch (e) {}   /* global setViewMode, currentViewMode */
    }
    function toFullCard() {
        var g = G();
        closeBets(); closeSheet(true);
        try { if (typeof closeCardInPopup === 'function') closeCardInPopup(); } catch (e) {}   /* global closeCardInPopup */
        if (g && gpsUp() && onGps()) g.showSide('bets', { remember: false });
        cardMode('full');
        cardY = 0;
        try { window.scrollTo(0, 0); } catch (e) {}
        return true;
    }
    function holeView() { cardMode('hole'); return true; }
    // URGENT-034 FIX 4: THE MAP'S CARD IS A COMPACT CARD (Manny's pick) - a half-height sheet over the map
    // with only the hole-by-hole grid: Hole / Par / the golfers, Out / In / Total. No leaderboard, no
    // skins. A box opens the score sheet for that golfer and hole; "Full card ›" is today's full page
    // (toFullCard, unchanged); a swipe down or a tap on the map closes it. Display only - every score
    // still goes through the score sheet and the card's own save.
    var CC_CSS = '#hp-compact-card{position:absolute;inset:0;z-index:2147481000;background:rgba(0,0,0,.25);font:600 16px/1.25 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color:#f4f4ef;}'
        + 'body > #hp-compact-card{position:fixed;}'
        + '#hp-compact-card .hp-cc{position:absolute;left:0;right:0;bottom:0;margin:0 auto;max-width:560px;height:52%;display:flex;flex-direction:column;background:#111611;border-radius:24px 24px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.45);transition:transform .18s ease;}'
        + '#hp-compact-card .hp-cc-handle{width:42px;height:5px;border-radius:3px;background:#5b625a;margin:10px auto 2px;flex:0 0 auto;}'
        + '#hp-compact-card .hp-cc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 16px 8px;flex:0 0 auto;}'
        + '#hp-compact-card .hp-cc-title{font-size:20px;font-weight:800;margin:0;color:#fff;}'
        + '#hp-compact-card .hp-cc-full{min-height:40px;padding:0 14px;border-radius:12px;background:#262c26;color:#c8f07a;font-size:16px;font-weight:800;white-space:nowrap;}'
        + '#hp-compact-card .hp-cc-body{flex:1 1 auto;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 10px calc(10px + env(safe-area-inset-bottom));}'
        + '#hp-compact-card table{width:100%;border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums;}'
        + '#hp-compact-card th{position:sticky;top:0;background:#111611;color:#a7aea4;font-size:13px;font-weight:800;padding:6px 2px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px;z-index:1;}'
        + '#hp-compact-card td{text-align:center;padding:2px;border-top:1px solid #1f251f;}'
        + '#hp-compact-card td.hp-cc-h{font-weight:800;color:#fff;width:44px;}#hp-compact-card td.hp-cc-p{color:#a7aea4;width:40px;}'
        + '#hp-compact-card tr.hp-cc-now td.hp-cc-h{color:#c8f07a;}'
        + '#hp-compact-card tr.hp-cc-sum td{font-weight:800;color:#fff;background:#1b211b;padding:8px 2px;}'
        + '#hp-compact-card button.hp-cc-box{width:100%;min-width:40px;min-height:40px;border-radius:10px;background:#1b211b;color:#f4f4ef;font-size:18px;font-weight:800;}'
        + '#hp-compact-card tr.hp-cc-now button.hp-cc-box{box-shadow:inset 0 0 0 2px #c8f07a;}';
    var cc = null;   // { wrap, sig, timer }
    function ccGolfers() {
        var d = data(), ps = (d && d.players) || [];
        var list = [];
        try { if (typeof gpsScoreGolfers === 'function') list = gpsScoreGolfers(currentViewedHole); } catch (e) { list = []; }   /* global gpsScoreGolfers, currentViewedHole */
        var ids = list.map(function (g) { return String(g.id); });
        if (!ids.length) {
            var lg = locked();
            ps.forEach(function (p) { if (p && p.out !== true && (!lg || (typeof playerGroupOf === 'function' && Number(playerGroupOf(p.id)) === lg))) ids.push(String(p.id)); });   /* global playerGroupOf */
        }
        return ids.map(function (id) { return ps.filter(function (p) { return p && String(p.id) === id; })[0]; }).filter(Boolean);
    }
    function ccName(p, ps) {
        try { if (typeof golferShortName === 'function') return golferShortName(p, ps); } catch (e) {}   /* global golferShortName */
        return String(p.name || ('Player ' + p.id)).trim().split(/\s+/)[0];
    }
    function ccSig() { var d = data(); return JSON.stringify([(d && d.scores) || {}, (function () { try { return currentViewedHole; } catch (e) { return null; } })()]); }
    function ccRender() {
        if (!cc || !cc.wrap) return;
        var d = data(); if (!d) return;
        var ps = d.players || [], gs = ccGolfers(), sc = d.scores || {};
        var holes = ((d.courseData) || []).map(function (h) { return { n: parseInt(h.hole, 10), par: Number(h.par) || 0 }; }).filter(function (h) { return h.n > 0; }).sort(function (a, b) { return a.n - b.n; });
        var now = (function () { try { return Number(currentViewedHole); } catch (e) { return null; } })();
        var val = function (pid, n) { var v = Number(sc['p' + pid + '_h' + n]); return v > 0 ? v : null; };
        var h = '<table><thead><tr><th>Hole</th><th>Par</th>' + gs.map(function (p) { return '<th>' + esc(ccName(p, ps)) + '</th>'; }).join('') + '</tr></thead><tbody>';
        var sum = function (label, part) {
            var par = 0; part.forEach(function (x) { par += x.par; });
            return '<tr class="hp-cc-sum" data-cc-sum="' + label + '"><td class="hp-cc-h">' + label + '</td><td class="hp-cc-p">' + (par || '') + '</td>' + gs.map(function (p) {
                var t = 0, any = false; part.forEach(function (x) { var v = val(p.id, x.n); if (v) { t += v; any = true; } }); return '<td>' + (any ? t : '') + '</td>';
            }).join('') + '</tr>';
        };
        var front = holes.filter(function (x) { return x.n <= 9; }), back = holes.filter(function (x) { return x.n > 9; });
        var rows = function (part) { return part.map(function (x) {
            return '<tr' + (x.n === now ? ' class="hp-cc-now"' : '') + '><td class="hp-cc-h">' + x.n + '</td><td class="hp-cc-p">' + (x.par || '') + '</td>' + gs.map(function (p) {
                var v = val(p.id, x.n);
                return '<td><button type="button" class="hp-cc-box" data-cc-hole="' + x.n + '" data-cc-player="' + esc(p.id) + '" aria-label="Hole ' + x.n + ', ' + esc(ccName(p, ps)) + (v ? ', ' + v : ', no score') + '">' + (v || '') + '</button></td>';
            }).join('') + '</tr>'; }).join(''); };
        if (front.length) h += rows(front) + sum('Out', front);
        if (back.length) h += rows(back) + sum('In', back);
        if (front.length && back.length) h += sum('Total', holes);
        h += '</tbody></table>';
        cc.wrap.querySelector('.hp-cc-body').innerHTML = h;
        cc.sig = ccSig();
    }
    function ccBuild() {
        var w = document.createElement('div');
        w.id = 'hp-compact-card'; w.className = 'gps-scroll-ok';
        w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true'); w.setAttribute('aria-label', 'Scorecard');
        w.innerHTML = '<style>' + CC_CSS + '</style><div class="hp-cc"><div class="hp-cc-handle"></div><div class="hp-cc-head"><h2 class="hp-cc-title">Scorecard</h2>'
            + '<button type="button" class="hp-cc-full" data-cc-full="1">Full card ›</button></div><div class="hp-cc-body"></div></div>';
        w.addEventListener('click', function (e) {
            var t = e.target, b;
            if (t === w) { closeCompactCard(); return; }   // the map above the sheet
            if (t.closest('[data-cc-full]')) { closeCompactCard(); toFullCard(); return; }
            if ((b = t.closest('[data-cc-hole]'))) ccOpen(Number(b.getAttribute('data-cc-hole')), b.getAttribute('data-cc-player'));
        });
        // SWIPE DOWN TO CLOSE: from the handle / title, or anywhere once the grid is at its top.
        var card = w.querySelector('.hp-cc'), y0 = null, dy = 0;
        card.addEventListener('touchstart', function (e) {
            var body = card.querySelector('.hp-cc-body');
            y0 = (!body.contains(e.target) || body.scrollTop <= 0) && e.touches.length === 1 ? e.touches[0].clientY : null; dy = 0;
        }, { passive: true });
        card.addEventListener('touchmove', function (e) {
            if (y0 == null) return;
            dy = e.touches[0].clientY - y0;
            if (dy > 0) { card.style.transition = 'none'; card.style.transform = 'translateY(' + dy + 'px)'; }
        }, { passive: true });
        card.addEventListener('touchend', function () {
            if (y0 == null) return;
            card.style.transition = '';
            if (dy > 90) closeCompactCard(); else card.style.transform = '';
            y0 = null; dy = 0;
        });
        return w;
    }
    // A box: the score sheet for that golfer, on that hole. The hole on the map, or one played before it
    // (the sheet's own earlier-hole step - Save goes back to the map's hole); a later hole moves the
    // round there first (the card's own goToHole), as its ‹ › would.
    function ccOpen(n, pid) {
        var cur = (function () { try { return Number(currentViewedHole); } catch (e) { return null; } })();
        var order = []; try { if (typeof gpsHoleList === 'function') order = gpsHoleList(); } catch (e) {}   /* global gpsHoleList */
        if (cur != null && n !== cur && order.indexOf(n) > order.indexOf(cur)) { try { if (typeof goToHole === 'function') goToHole(n); } catch (e) {} cur = n; }   /* global goToHole */
        if (typeof gpsOpenScore !== 'function') return false;   /* global gpsOpenScore */
        gpsOpenScore(cur, pid);
        var S = window.HardPanGpsStats && window.HardPanGpsStats.sheet;
        if (n !== cur && S && S.isOpen() && typeof S.go === 'function') S.go(n);
        return true;
    }
    function compactOpen() { return !!(cc && cc.wrap && cc.wrap.parentNode && cc.wrap.style.display !== 'none'); }
    function openCompactCard() {
        if (!data()) return false;
        closeBets(); closeSheet(true);
        if (!cc) cc = { wrap: ccBuild() };
        var host = document.getElementById('gps-overlay');
        host = host && onGps() ? host : document.body;
        if (cc.wrap.parentNode !== host) host.appendChild(cc.wrap);
        cc.wrap.style.display = '';
        cc.wrap.querySelector('.hp-cc').style.transform = '';
        ccRender();
        var now = cc.wrap.querySelector('tr.hp-cc-now');
        if (now) { try { var body = cc.wrap.querySelector('.hp-cc-body'); body.scrollTop = Math.max(0, now.offsetTop - body.clientHeight / 2); } catch (e) {} }
        // A score saved from the sheet over it shows here at once.
        if (cc.timer) clearInterval(cc.timer);
        cc.timer = setInterval(function () { if (!compactOpen()) { clearInterval(cc.timer); cc.timer = null; return; } if (ccSig() !== cc.sig) ccRender(); }, 400);
        return true;
    }
    function closeCompactCard() {
        if (!cc || !cc.wrap) return;
        cc.wrap.style.display = 'none';
        if (cc.timer) { clearInterval(cc.timer); cc.timer = null; }
    }
    // ENTER SCORE, from any screen: on the map (or Bets over it) the GPS's own score entry; on the
    // card the first empty box of this hole (or this phone's golfer's), focused.
    function enterScore() {
        closeBets(); closeSheet(true);
        if (onGps()) { var b = document.querySelector('#gps-overlay .gps-score'); if (b) { b.click(); return true; } }
        holeView();
        var h = (function () { try { return currentViewedHole; } catch (e) { return null; } })();   /* global currentViewedHole */
        // 018: THE CARD'S "Enter score" IS THE SAME SHEET AS THE MAP'S - this hole, and ‹ for an
        // earlier one - over the card, which stays on its hole (index.html gpsOpenSheet).
        try { if (h != null && typeof gpsSheetOn === 'function' && gpsSheetOn() && typeof gpsOpenSheet === 'function' && gpsOpenSheet(h)) return true; } catch (e) {}   /* global gpsSheetOn, gpsOpenSheet */
        var all = Array.prototype.slice.call(document.querySelectorAll('#hole-view-card .score-input' + (h != null ? '[data-hole="' + Number(h) + '"]' : '') + ':not([disabled])'));
        var me = (function () { try { return typeof resolvedMeId === 'function' ? resolvedMeId() : null; } catch (e) { return null; } })();   /* global resolvedMeId */
        var box = all.filter(function (i) { return !String(i.value || '').trim(); })[0] || all.filter(function (i) { return i.getAttribute('data-player-id') === String(me); })[0] || all[0];
        if (!box) return false;
        try { box.scrollIntoView({ block: 'center' }); } catch (e) {}
        try { box.focus(); } catch (e) {}
        return true;
    }
    function go(k) {
        if (k === 'menu') { closeBets(); return openMenu(); }
        if (k === 'gps') return toGps();
        if (k === 'card') return toCard();
        if (k === 'bets') return openBets();
        if (k === 'score') return enterScore();
        return false;
    }
    // THE ONE BAR (card and Bets): ☰ | Card (over Bets) | Enter score | + Bet | GPS (off the map).
    function barFor() {
        return { menu: true, gps: gpsUp() && (!onGps() || betsOpen()) && !!(G().canMap && G().canMap()), card: betsOpen(), score: true };
    }

    // ---- BACK (Android; GolfBack) - ALWAYS THE PREVIOUS SCREEN ---------------------
    // One layer per press: an open sheet closes (Share / Settle up go back to the menu; Round
    // settings, Bets and the bet sheet close), then the screen before this one - map or card,
    // as many as were visited, the card at the scroll it had. With nothing before it, Back on a
    // round opens the Round Menu (its "Leave the round" is the way out): never Home, never
    // "How are you joining?" mid-round.
    var trail = [], lastScreen = null, backing = false, cardY = 0;
    function backTo(s) { backing = true; if (s === 'gps') toGps(); else toCard(); track(); }
    function settingsOpen() { var sh = document.getElementById('round-sheet'); return !!(sh && sh.classList.contains('open')); }
    function inRound() { var d = data(); return !!(code() && d && (d.players || []).length); }
    function joinShown() { var j = document.getElementById('group-pick-overlay'); return !!(j && j.style.display === 'flex'); }
    function registerBack() {
        var GB = window.GolfBack;
        if (!GB || typeof GB.register !== 'function') return;
        GB.register({ name: 'hp-round-sheet', priority: 1, isOpen: function () { return on() && sheetOpen(); }, close: function () { closeSheet(false); } });
        GB.register({ name: 'hp-bets', priority: 1, isOpen: function () { return on() && betsOpen(); }, close: closeBets });
        GB.register({ name: 'hp-settings', priority: 1, isOpen: function () { return on() && settingsOpen(); }, close: function () { (origToggle || window.toggleRoundSheet)(false); } });
        GB.register({ name: 'hp-previous', priority: 4, isOpen: function () { track(); return on() && inRound() && trail.length > 0; },
            close: function () { var s = trail.pop(); backTo(s); } });
        GB.register({ name: 'hp-round-root', priority: 5, isOpen: function () { return on() && inRound() && !joinShown(); }, close: function () { openMenu(); } });
    }
    function track() {
        var s = onGps() ? 'gps' : 'card';
        if (s !== lastScreen) {
            if (lastScreen && !backing) { trail.push(lastScreen); if (trail.length > 20) trail.shift(); }
            if (s === 'card' && lastScreen === 'gps') restoreCard();
            lastScreen = s;
        }
        backing = false;
    }
    // THE CARD COMES BACK WHERE IT WAS: the scroll it had when the map came up (unless a score
    // box was just focused - Enter score scrolls to its own box).
    function restoreCard() {
        var a = document.activeElement;
        if (a && a.classList && a.classList.contains('score-input')) return;
        var y = cardY;
        if (Math.abs((window.scrollY || 0) - y) > 2) { try { window.scrollTo(0, y); } catch (e) {} }
    }
    function watchScroll() {
        if (window.__hpScroll) return;
        window.__hpScroll = true;
        window.addEventListener('scroll', function () { if (!onGps() && !betsOpen()) cardY = window.scrollY || 0; }, { passive: true });
    }

    function refresh() {
        if (!on()) {
            // toggle(x, false), never remove(): remove() rewrites the class attribute even when
            // nothing changes, and the body observer below would run forever.
            document.body.classList.toggle('hp-card-sheet', false); document.body.classList.toggle('hp-bets-open', false);
            return;
        }
        hookRoundSheet();
        // Today's Round Menu sheet is Round settings in the new flow: it says so.
        var lb = document.getElementById('round-sheet-label');
        if (lb && lb.textContent !== '\u2699\uFE0F Round settings') lb.textContent = '\u2699\uFE0F Round settings';
        bindPull();
        watchScroll();
        syncCardSheet();
        track();
        warm();
        if (betsOpen()) { var b = B(), m = b && b.money(); var me = document.querySelector('#hp-bets .hb2-me'); if (me && m) me.textContent = m.text; }
    }
    // The side changes by a class on <body> (gps-view.js showSide): follow it.
    function watchBody() {
        if (!window.MutationObserver || document.body.__hpWatch) return;
        document.body.__hpWatch = true;
        new MutationObserver(function () { try { refresh(); if (B()) B().refresh(); } catch (e) {} }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    function boot() { ensureCss(); watchBody(); registerBack(); refresh(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

    window.HardPanRound = {
        openMenu: function () { return openMenu(); }, openShare: openShare, openFinish: openFinish, openSettings: openSettings,
        openBets: openBets, closeBets: closeBets, closeSheet: closeSheet, go: go, barFor: barFor, refresh: refresh,
        toGps: toGps, toCard: toCard, toFullCard: toFullCard, holeView: holeView, openCompactCard: openCompactCard, closeCompactCard: closeCompactCard, compactCardOpen: compactOpen, tidyCourse: tidyCourse, screen: screen, sheetKind: function () { return sheetOpen() ? sheetKind : null; },
        payText: function () { return payText(settle()); }, feed: feed, enterScore: enterScore,
        changeCourse: changeCourse, leaveRound: leaveRound, scored: scored
    };
})();
