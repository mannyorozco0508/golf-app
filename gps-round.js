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
        + '.hp-sheet .hs-x{border:0;background:#e3e9e5;color:#0f3d2e;border-radius:999px;min-width:40px;height:40px;font:800 18px/1 ' + FONT + ';cursor:pointer;}'
        + '.hp-sheet .hs-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;}'
        + '.hp-sheet .hs-tile{text-align:left;border:1.5px solid #dfe6e2;background:#fff;border-radius:16px;padding:14px 12px;min-height:96px;cursor:pointer;color:#0f1f17;display:flex;flex-direction:column;gap:4px;}'
        + '.hp-sheet .hs-tile b{font:800 17px/1.2 ' + FONT + ';}.hp-sheet .hs-tile span{font:500 13px/1.3 ' + FONT + ';color:#5d6b64;}'
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
        + '#hp-strip-grab{position:absolute;left:50%;bottom:6px;width:44px;height:5px;margin-left:-22px;border-radius:3px;background:rgba(255,255,255,.75);}'
        // The old Round Menu pill steps aside for the bar; it still opens as Round settings.
        + 'body.hp-sf-card #round-sheet:not(.open){transform:translateY(100%);visibility:hidden;}'
        // Over the map: the toasts and the QR codes come up above it.
        + 'body.hp-sf-card.gps-side-gps .ui-toast-wrap,body.hp-sf-card .qr-sheet{z-index:10300 !important;}'
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
        { k: 'card', ico: '📝', t: 'Card', s: 'Scores, hole by hole' },
        { k: 'bets', ico: '💰', t: 'Bets', s: 'Live money + leaderboard' },
        { k: 'gps', ico: '📍', t: 'GPS', s: 'Back to the map' },
        { k: 'bet', ico: '＋', t: 'Bet', s: 'Add a game' },
        { k: 'share', ico: '🔗', t: 'Share', s: 'Group links, code, QR' },
        { k: 'settings', ico: '⚙️', t: 'Round settings', s: 'Players, tees, groups…' }
    ];
    function openMenu(again) {
        if (!on() || !code()) return false;
        if (!again) stack = [];
        var d = data() || {};
        var html = head((d.courseName || d.eventName || 'This round') + ' · ' + code())
            + '<div class="hs-tiles">' + TILES.filter(function (t) { return t.k !== 'gps' || gpsUp(); }).map(function (t) {
                return '<button type="button" class="hs-tile" data-hs-tile="' + t.k + '"><b>' + t.ico + ' ' + esc(t.t) + '</b><span>' + esc(t.s) + '</span></button>';
            }).join('') + '</div>'
            + '<button type="button" class="hs-finish" data-hs="finish">Finish &amp; settle up</button>'
            + '<div class="hs-note">Trip, history, how it works and stats: <a href="home.html#more">Home › More</a></div>';
        return show('menu', html, 'Round Menu');
    }
    function tile(k) {
        if (k === 'card') { closeSheet(true); closeBets(); toCard(); return; }
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
                var names = players.slice(b.startIdx, b.startIdx + b.size).map(function (p) { return String(p.name || '').split(' ')[0]; }).join(', ');
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
        html += '<div class="hs-h">' + (!tx.length ? 'Who pays who' : (tx.length === 1 ? 'One payment' : tx.length + ' payments') + ' settle everything') + '</div>';
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
        if (a === 'share-link') { var d = data() || {}; shareText(d.eventName || 'Our round', 'Join ' + (d.courseName || 'the round') + ' - code ' + code(), roundUrl()); return; }
        if (a === 'qr') {
            closeSheet(true);
            if (typeof openRoundQrSheet === 'function') openRoundQrSheet(null);
            return;
        }
        if (a === 'share-pay') { shareText('Settle up', payText(settle()), ''); return; }
        if (a === 'review') {
            closeSheet(true); closeBets();
            if (onGps()) toCard();
            if (typeof openFinishRoundModal === 'function') openFinishRoundModal();
            return;
        }
    }

    // ---- ROUND SETTINGS = today's Round Menu, plus GPS tools ---------------------
    var legacyOK = false, origToggle = null;
    function openSettings() {
        if (onGps()) toCard();
        legacyOK = true;
        addToolsButton();
        try { (origToggle || window.toggleRoundSheet)(true); } finally { legacyOK = false; }
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
            return origToggle.apply(this, arguments);
        };
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
        f.addEventListener('load', function () { tidyFrame(f); });
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
    function sheetMode() {
        var g = G();
        return on() && !onGps() && gpsUp() && !!(g.mapReady && g.mapReady());
    }
    function syncCardSheet() {
        var want = sheetMode();
        if (document.body.classList.contains('hp-card-sheet') !== want) document.body.classList.toggle('hp-card-sheet', want);
        if (want) strip();
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
    function go(k) {
        if (k === 'menu') { closeBets(); return openMenu(); }
        if (k === 'gps') return toGps();
        if (k === 'card') return toCard();
        if (k === 'bets') return openBets();
        return false;
    }
    // What the one bar shows: Menu always; GPS when the map is not showing; Card over Bets.
    function barFor() {
        return { menu: true, gps: gpsUp() && (!onGps() || betsOpen()), card: betsOpen() };
    }

    // ---- BACK (Android; GolfBack) ------------------------------------------------
    // One layer per press: an open sheet closes (Share / Settle up go back to the menu),
    // Bets closes, then the card that came from the map is the map again. Only after
    // all of that does the page's own back run - and on a round that is the Round
    // Menu's job, never Home or "How are you joining?".
    // The screen before this one ('gps' | 'card'); a Back move consumes it, so two Backs never
    // ping-pong between the map and the card - the second one is the page's own Back.
    var prevScreen = null, lastScreen = null, backing = false;
    function backTo(s) { backing = true; if (s === 'gps') toGps(); else toCard(); track(); }
    function registerBack() {
        var GB = window.GolfBack;
        if (!GB || typeof GB.register !== 'function') return;
        GB.register({ name: 'hp-round-sheet', priority: 1, isOpen: function () { return on() && sheetOpen(); }, close: function () { closeSheet(false); } });
        GB.register({ name: 'hp-bets', priority: 1, isOpen: function () { return on() && betsOpen(); }, close: closeBets });
        GB.register({ name: 'hp-card-to-map', priority: 4, isOpen: function () { track(); return on() && !onGps() && gpsUp() && prevScreen === 'gps'; }, close: function () { backTo('gps'); } });
        GB.register({ name: 'hp-map-to-card', priority: 4, isOpen: function () { track(); return on() && onGps() && gpsUp() && prevScreen === 'card'; }, close: function () { backTo('card'); } });
    }
    function track() {
        var s = onGps() ? 'gps' : 'card';
        if (s !== lastScreen) { prevScreen = backing ? null : lastScreen; lastScreen = s; }
        backing = false;
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
        toGps: toGps, toCard: toCard, screen: screen, sheetKind: function () { return sheetOpen() ? sheetKind : null; },
        payText: function () { return payText(settle()); }
    };
})();
