// ============================================================================
// GolfApp — Product Links (SHARED CORE)
//
// The one place that knows the two products may not live at the same origin.
//
// WHY THIS EXISTS
//
// Consumer and Tournament are becoming two deployments. Three pages navigate
// across that line and did it with bare relative hrefs, which is correct on one
// origin and silently broken on two:
//
//     admin.html   -> tournament.html                  (the Tournament entry)
//     trip.html    -> tournament.html?trip=  / ?tourney=   (trip's linked events)
//     tournament.html -> admin.html, trip.html?trip=       (back to the trip)
//
// That relationship is real and stays. What changes is that a cross-product link
// now goes through a function that CAN point at another origin, instead of
// assuming it never has to.
//
// TODAY IT CHANGES NOTHING. With no origins configured - which is the state this
// ships in - both helpers return exactly the relative path they were given, so
// every existing link resolves precisely as it does now. The seam exists; it is
// simply not yet pointed anywhere.
//
// NO DOMAINS ARE INVENTED HERE. The real hostnames are not known yet, and
// guessing one would be worse than leaving it empty: a wrong absolute URL fails
// in production while a relative one keeps working. When the two Cloudflare
// projects exist, set the two fields below and nothing else has to change.
//
// NO DEPENDENCIES, NO TOP-LEVEL SIDE EFFECTS beyond declaring the config object.
// ============================================================================

// Where each product is deployed. Empty means "same origin as this page", which
// is the current single-deployment behaviour and the safe default.
//
// A build, a deploy step or a future settings page can overwrite these before any
// link is built. Values should be an origin with no trailing slash, for example
// 'https://example.pages.dev' - never a path.
var GOLF_PRODUCT_ORIGINS = {
    consumer: '',
    tournament: '',
};

// Join an origin to a relative app path. Kept private-ish rather than exported as
// a general URL builder, because the only thing this file is for is the product
// boundary - a general helper would attract unrelated callers.
function productUrl(origin, relativePath) {
    const path = String(relativePath || '');
    if (!origin) return path;                       // same origin: unchanged
    return String(origin).replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

// A link INTO the Consumer product - the round setup, a trip, the scorecard.
// Called from Tournament pages that point back at a trip.
function consumerUrl(relativePath) {
    const cfg = (typeof GOLF_PRODUCT_ORIGINS === 'object' && GOLF_PRODUCT_ORIGINS) || {};
    return productUrl(cfg.consumer, relativePath);
}

// A link INTO the Tournament product - the organizer page, or a specific event.
// Called from Consumer pages that offer or list tournaments.
function tournamentUrl(relativePath) {
    const cfg = (typeof GOLF_PRODUCT_ORIGINS === 'object' && GOLF_PRODUCT_ORIGINS) || {};
    return productUrl(cfg.tournament, relativePath);
}
