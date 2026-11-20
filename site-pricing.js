// ============================================================================
// HARDPAN WEBSITE PRICES (website-b, ADVISOR-20261108-0356)
//
// The ONE place the marketing page (hardpan-home.html) reads a price from. The
// page itself carries no dollar figure: every price cell is an empty
// data-price="..." slot filled from this object.
//
// WHERE THESE NUMBERS COME FROM. The app's own price config lives in the HardPan
// app (dev-205's gps-config.js: iapFallbackPrices + iapHostFallbackPrices, and
// hp-pricing.js FREE_GOLFERS). That file is GPS-only (it carries the map key and
// sync-mobile-web.js keeps it out of every web build), so the website does not
// load it; this file mirrors exactly the fields a visitor sees. The store's own
// price always wins in the app; these are the US prices it falls back to.
//
// PINNED, so the two cannot drift silently: marketing_home_test.js compares
// every value here with terms.html section 6 (the legal page on this same site)
// and, when the dev-205 branch is in the local repo, with gps-config.js and
// hp-pricing.js themselves.
//
// When a price changes: change it in the app config, terms.html and here, in
// one commit. When the founding window closes (gps_meta/config.foundingOpen ->
// false), set pro.foundingOpen to false and the page shows the yearly price.
//
// NO DEPENDENCIES. No Firebase, no network, no storage.
// ============================================================================
window.HARDPAN_SITE_PRICING = {
    currency: 'USD',
    // hp-pricing.js FREE_GOLFERS: one group of up to 5 golfers is free forever.
    freeGolfers: 5,
    pro: {
        name: 'HardPan Pro',
        trialDays: 7,
        foundingOpen: true,
        founding: '$24.99',   // gps-config.js iapFallbackPrices.founding
        yearly: '$49.99',     // gps-config.js iapFallbackPrices.yearly
        monthly: '$7.99'      // gps-config.js iapFallbackPrices.monthly
    },
    host: {
        name: 'Host Pro',
        yearly: '$29.99'      // gps-config.js iapHostFallbackPrices.host
    },
    // GOLFER CODES, A (Manny's pick 2026-11-19/20): the first-year price a golfer sees on My results once the
    // organizer posts results, shown beside pro.yearly (the regular yearly price). The same first-year figure as the
    // 58A tournament offer (App Store Connect offer code); tournament.html reads it from here and types no price.
    eventOffer: '$19.99',
    tripPass: {
        name: 'Trip Pass',
        price: '$14.99',      // gps-config.js iapHostFallbackPrices.trip
        days: 7
    },
    // Price B + D (Manny's pick 2026-11-16 13:34 via the Advisor, ADVISOR-20261116-1335-OK-build-price-BD): the one
    // comparison figure the homepage shows beside the founding price. The top yearly premium tier of the popular golf
    // GPS apps, read from their own pages (site-compare-sources.md has each one with its URL and the date). No name
    // goes on the page. The saving the band shows is COMPUTED below from this and the headline price, never typed.
    compare: {
        othersUpTo: '$99.99',          // per year: 18Birdies Premium, SwingU Pro, Golfshot Champions, Hole19 Intelligence
        checkedOn: 'Nov 16, 2026'
    }
};

// Fill every [data-price] slot on the page. The page carries the SAME figures as
// text inside each slot (hardpan_home_price_test.js binds the two), so with no
// script at all the visitor still reads real prices; this fill only brings a
// slot up to date. An unknown key, or an empty value, KEEPS the page's text:
// 2026-11-16 15:46 Manny's iPhone read the new homepage with an older cached
// copy of this file, and the old fill wrote an en dash into every slot it did
// not know ("then –", "up to – a year less", "charge up to –"). Never again:
// nothing here blanks a slot. The page also loads this file by a versioned URL
// (site-pricing.js?v=<sha>) so a cached older copy is not a match.
window.HardPanSitePricingFill = function (root) {
    var P = window.HARDPAN_SITE_PRICING || {};
    var pro = P.pro || {};
    var cmp = P.compare || {};
    var headline = pro.foundingOpen ? pro.founding : pro.yearly;
    // The comparison figure minus the headline price, in whole dollars when it is one (today it is) and with cents when
    // it is not. Empty when either figure is missing or ours is not lower, so the slot shows the dash, never a wrong saving.
    var saving = '';
    var cents = function (t) { var m = /^\$([0-9]+)\.([0-9]{2})$/.exec(String(t || '')); return m ? parseInt(m[1], 10) * 100 + parseInt(m[2], 10) : null; };
    if (cents(cmp.othersUpTo) !== null && cents(headline) !== null && cents(cmp.othersUpTo) > cents(headline)) {
        var d = cents(cmp.othersUpTo) - cents(headline);
        saving = '$' + (d % 100 === 0 ? String(d / 100) : (d / 100).toFixed(2));
    }
    var values = {
        'free': '$0',
        'free-golfers': String(P.freeGolfers || ''),
        'pro-headline': pro.foundingOpen ? (pro.founding + '/yr') : (pro.yearly + '/yr'),
        'pro-label': pro.foundingOpen ? 'Founding price' : 'Yearly',
        'pro-yearly': pro.yearly,
        'pro-monthly': pro.monthly,
        'pro-trial-days': String(pro.trialDays || ''),
        'host-yearly': (P.host && P.host.yearly) ? P.host.yearly + '/yr' : '',
        'trip-pass': P.tripPass && P.tripPass.price,
        'trip-pass-days': String((P.tripPass && P.tripPass.days) || ''),
        // Price B + D
        'pro-after': pro.foundingOpen ? (pro.yearly + '/yr') : (pro.monthly + '/mo'),   // the band's "then ..." while founding is open; the monthly option after
        'compare-others': cmp.othersUpTo ? (cmp.othersUpTo + '/yr') : '',
        'compare-save': saving,
        'compare-checked': cmp.checkedOn || ''
    };
    var nodes = (root || document).querySelectorAll('[data-price]');
    for (var i = 0; i < nodes.length; i++) {
        var v = values[nodes[i].getAttribute('data-price')];
        if (v && nodes[i].textContent !== v) nodes[i].textContent = v;
    }
};
