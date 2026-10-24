// ============================================================================
// HardPan - "POST TO GHIN" AFTER A ROUND (URGENT-066 feature 3, ghin-button). LINKS ONLY.
//
// On the Results page (settlement.html, the Round Receipt), once the round is final
// (the same moment the "Share receipt" foot turns on): one small card with a
// "Post to GHIN" button. It OPENS GHIN; it posts nothing. No GHIN / USGA API, no
// credentials, no score, nothing sent, nothing stored, nothing written. The golfer
// posts their own score in GHIN. Manual handicap entry (handicap.js,
// handicap-labels.js) is untouched.
//
// WHERE THE BUTTON GOES - researched 2026-10-24 from GHIN's own published files, NOT guessed:
//   * GHIN publishes NO custom URL scheme (no ghin:// in any USGA / GHIN doc found), so
//     there is nothing to ask canOpenURL about and nothing is added to
//     LSApplicationQueriesSchemes. A guessed scheme would be a guess.
//   * https://www.ghin.com/.well-known/apple-app-site-association (fetched 2026-10-24):
//     app 2Y3A4HK9TT.org.usga.ghinmobile claims ONLY /challenges/*, /upgrade-to-enhanced-gps/*,
//     /overview/* and /myGPS/* as universal links. /post-score is NOT claimed.
//   * ghin.com's own page script (index-*.js, 2026-10-24): on an iPhone / iPad browser that
//     lands on one of those claimed paths (i.e. the app did not take the link), it sends the
//     browser to https://itunes.apple.com/us/app/ghin-mobile/id491796218?mt=8 (Android:
//     Google Play). That is GHIN's own "app if installed, else the store" design.
//   * App Store: https://apps.apple.com/us/app/ghin/id491796218 (the GHIN app, id 491796218).
//   * Score posting on the web: https://www.ghin.com/post-score (a route in ghin.com's
//     current app: /post-score, /post-score/total, /post-score/hole-by-hole). Log-in needed.
//
// SO, ON A PHONE: "Post to GHIN" opens APP_LINK (https://www.ghin.com/overview/). iOS hands a
//   claimed universal link to the GHIN app when it is installed; when it is not, Safari opens
//   it and ghin.com's own script goes on to the App Store page. In the app the link opens
//   through Capacitor's WebViewDelegationHandler (target=_blank -> UIApplication.shared.open),
//   the same path venmo-pay.js's venmo.com links take. No Info.plist change, no new plugin.
//   "Post on ghin.com instead" is always under it (WEB_POST), and on a computer the button
//   itself goes to WEB_POST (ghin.com sends a desktop /overview/ to a USGA info page).
// NOT CONFIRMED (needs a real iPhone with GHIN installed): which GHIN screen /overview/ opens.
//
// WORDING: our own numbers are never called "Handicap Index", "WHS", "Course Handicap",
// "Slope Rating", "GHIN" or "USGA" (ghin_button_test.js audits the app). "GHIN" here names
// GHIN's own app and site only, and the card says HardPan is not affiliated.
//
// SWITCH: gps-config.js ghinButton (false = nothing at all on the page). HardPan only
// (GPS_SHELL, settlement.html's GPS block); the Consumer app has none of it.
// ============================================================================
(function () {
    'use strict';
    var W = typeof window !== 'undefined' ? window : {};

    // ---- THE LINKS (each one checked against GHIN's own files, 2026-10-24) -------------
    var APP_LINK = 'https://www.ghin.com/overview/';            // universal link claimed by the GHIN app
    var WEB_POST = 'https://www.ghin.com/post-score';           // ghin.com's own score posting
    var APP_STORE = 'https://apps.apple.com/us/app/ghin/id491796218';
    // The paths GHIN's apple-app-site-association claims (2026-10-24), for the tests.
    var CLAIMED = ['/challenges/', '/upgrade-to-enhanced-gps/', '/overview/', '/myGPS/'];

    var WORDS = {
        kick: 'Handicap',
        title: 'Post your score to GHIN',
        sub: 'HardPan doesn’t post scores. This opens the GHIN app, or the App Store if you don’t have it. You post there.',
        button: 'Post to GHIN',
        web: 'Post on ghin.com instead',
        foot: 'Nothing is sent from HardPan. HardPan is not affiliated with the USGA or GHIN.'
    };

    function enabled() { var c = W.HARDPAN_GPS_CONFIG; return !!(c && c.ghinButton === true); }

    // A phone or tablet: the HardPan app itself (Capacitor iOS / Android), or a phone browser.
    function isPhone(env) {
        var e = env || {};
        if (e.native === true) return true;
        var ua = String(e.ua != null ? e.ua : ((W.navigator && W.navigator.userAgent) || ''));
        if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
        // iPadOS reports as a Mac; it has touch.
        return /Macintosh/.test(ua) && Number(e.touch != null ? e.touch : ((W.navigator && W.navigator.maxTouchPoints) || 0)) > 1;
    }
    function isNative() {
        var C = W.Capacitor;
        try { return !!(C && (typeof C.isNativePlatform === 'function' ? C.isNativePlatform() : (C.getPlatform && C.getPlatform() !== 'web'))); } catch (e) { return false; }
    }
    // Where the button goes. PURE (env may be given; else this page's own).
    function target(env) {
        var e = env || { native: isNative() };
        return isPhone(e) ? APP_LINK : WEB_POST;
    }

    function cardHtml(env) {
        var href = target(env);
        return '<section class="ghin-card" id="ghin-card" aria-label="' + WORDS.title + '">'
            + '<div class="ghin-k">' + WORDS.kick + '</div>'
            + '<div class="ghin-box">'
            + '<div class="ghin-title">' + WORDS.title + '</div>'
            + '<div class="ghin-sub">' + WORDS.sub + '</div>'
            + '<a class="ghin-btn" id="ghin-post" href="' + href + '" target="_blank" rel="noopener">' + WORDS.button + '</a>'
            + (href === WEB_POST ? '' : '<a class="ghin-web" id="ghin-web" href="' + WEB_POST + '" target="_blank" rel="noopener">' + WORDS.web + '</a>')
            + '<div class="ghin-foot">' + WORDS.foot + '</div>'
            + '</div></section>';
    }

    var CSS = 'html.hp-rcpt #ghin-mount{order:9;}'
        + '#ghin-mount .ghin-k{font-size:12px;font-weight:800;letter-spacing:.08em;color:var(--hp-kick,#667);margin:16px 2px 8px;text-transform:uppercase;line-height:1.35;}'
        + '#ghin-mount .ghin-box{background:var(--bg-card,#fff);border:1px solid var(--border-light,#dfe5df);border-radius:16px;padding:14px 16px;}'
        + '#ghin-mount .ghin-title{font-weight:800;font-size:1rem;color:var(--text-main,#13241d);}'
        + '#ghin-mount .ghin-sub{font-size:.82rem;color:var(--text-muted,#5d6b64);margin:4px 0 12px;line-height:1.35;}'
        + '#ghin-mount .ghin-btn{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:12px;background:var(--brand-green,#0f4c3a);color:#fff !important;font-weight:800;font-size:1rem;text-decoration:none;}'
        + '#ghin-mount .ghin-web{display:flex;align-items:center;justify-content:center;min-height:44px;margin-top:6px;color:var(--brand-green,#0f4c3a) !important;font-weight:700;font-size:.9rem;text-decoration:none;}'
        + '#ghin-mount .ghin-foot{font-size:.74rem;color:var(--text-muted,#5d6b64);margin-top:8px;line-height:1.35;}'
        + '@media print{#ghin-mount{display:none !important;}}';
    function style(d) {
        if (d.getElementById('ghin-style')) return;
        var st = d.createElement('style'); st.id = 'ghin-style'; st.textContent = CSS;
        d.head.appendChild(st);
    }
    // Its own mount in #main-content, outside every export root (printReceipt reads
    // RESULTS_MOUNTS by id), so the PDF / Share never carries the button.
    function mount(d) {
        var host = d.getElementById('ghin-mount');
        if (host) return host;
        var main = d.getElementById('main-content');
        if (!main) return null;
        host = d.createElement('div'); host.id = 'ghin-mount';
        // Right after the money story: Who Pays Who / Settle up (and the Venmo card, when it
        // comes in after this one it lands between them, which is the order wanted).
        var after = d.getElementById('combined-settlement-summary');
        if (after && after.parentNode) after.parentNode.insertBefore(host, after.nextSibling);
        else main.appendChild(host);
        return host;
    }
    // Called by settlement.html with the Send pill: show = the round is final.
    function show(on) {
        var d = W.document; if (!d) return;
        if (!on || !enabled()) { var h = d.getElementById('ghin-mount'); if (h) h.innerHTML = ''; return; }
        var host = mount(d); if (!host) return;
        style(d);
        if (!d.getElementById('ghin-card')) host.innerHTML = cardHtml();
    }

    W.HardPanGhin = { APP_LINK: APP_LINK, WEB_POST: WEB_POST, APP_STORE: APP_STORE, CLAIMED: CLAIMED, WORDS: WORDS,
        enabled: enabled, isPhone: isPhone, target: target, cardHtml: cardHtml, show: show };
})();
