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
    tripPass: {
        name: 'Trip Pass',
        price: '$14.99',      // gps-config.js iapHostFallbackPrices.trip
        days: 7
    }
};

// Fill every [data-price] slot on the page. Unknown key = an en dash, never a
// made-up number.
window.HardPanSitePricingFill = function (root) {
    var P = window.HARDPAN_SITE_PRICING || {};
    var pro = P.pro || {};
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
        'trip-pass-days': String((P.tripPass && P.tripPass.days) || '')
    };
    var nodes = (root || document).querySelectorAll('[data-price]');
    for (var i = 0; i < nodes.length; i++) {
        var v = values[nodes[i].getAttribute('data-price')];
        nodes[i].textContent = v ? v : '–';
    }
};
