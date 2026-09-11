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

// ============================================================================
// WHERE THIS APP LIVES ON THE WEB, for links that leave the device.
//
// Inside the iOS wrapper the page is served from capacitor://localhost, so every
// URL built from the page's own location came out as
//     capacitor://localhost/index.html?game=L6Y38G
// - meaningless the moment it is pasted into a text. That broke the invite link,
// the QR, every group scorekeeper link, the private organizer link, the follow
// link, the trip link and the tournament team link AT ONCE, because all of them
// read location.origin. Sharing a round from the app was simply impossible.
//
// THE RULE, and why it is not just "always use the canonical origin":
//   a native shell -> the canonical origin, whatever it is served from. Asked of
//                 Capacitor directly, because Android's WebView serves the page
//                 from https://localhost - an https origin that passes every
//                 test below and is still not an address another phone can reach.
//                 The invite link, the QR, every group link and the trip link
//                 all came out as https://localhost/... on Android, the same
//                 set capacitor:// broke on iOS, by a door the origin rule
//                 could not see. window.Capacitor.isNativePlatform() is the only
//                 answer present on every page from the first line of script;
//                 html.is-native lands on `load`, and leaderboard.html does not
//                 load pwa-boot.js at all. A page on https://localhost with no
//                 Capacitor object is a developer's web page and is left alone.
//   http/https -> THIS page's origin. A Cloudflare preview deploy must hand out
//                 links to itself, not to production, or testing a deploy silently
//                 sends everyone to the live site.
//   anything else -> the canonical origin. capacitor:// and file:// are not
//                 addresses another phone can reach.
//
// The directory is kept, not just the origin, so a subdirectory deployment works -
// and it is derived by dropping the last path segment rather than replacing
// "admin.html", because Cloudflare serves clean URLs and this page is often
// "/admin" with no filename to replace.
const GOLF_WEB_ORIGIN = 'https://golf-app-5a5.pages.dev';

function shareBaseUrl() {
    // THE SHELL FIRST, before the origin is even read: inside Capacitor the
    // origin is not evidence of anything.
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
        return GOLF_WEB_ORIGIN + '/';
    }
    const loc = (typeof window !== 'undefined' && window.location) ? window.location
        : (typeof location !== 'undefined' ? location : null);
    // DECIDED FROM THE ORIGIN, not from location.protocol. The question is whether
    // this page's address is one another phone could reach, and the origin answers
    // it directly - "https://..." yes, "capacitor://localhost" no. Reading protocol
    // alone also fails wherever that field is not populated, which sends a
    // perfectly good web page to the canonical origin and quietly breaks
    // subdirectory and preview deployments.
    const raw = String((loc && loc.origin) || '') || String((loc && loc.href) || '');
    // The ORIGIN only. Falling back to href when origin is absent pulled the path
    // in with it, and appending the directory then produced
    // ".../trip.html/trip.html?trip=CODE" - a doubled path that looks like a typo
    // and is really a share link nobody can open.
    const m = /^(https?:\/\/[^\/?#]+)(\/[^?#]*)?/i.exec(raw);
    if (!m) return GOLF_WEB_ORIGIN + '/';
    const pathname = String((loc && loc.pathname) || m[2] || '/');
    const dir = pathname.replace(/\/[^\/]*$/, '/');
    return m[1] + (dir.charAt(0) === '/' ? dir : '/' + dir);
}

// A link INTO the Tournament product - the organizer page, or a specific event.
// Called from Consumer pages that offer or list tournaments.
function tournamentUrl(relativePath) {
    const cfg = (typeof GOLF_PRODUCT_ORIGINS === 'object' && GOLF_PRODUCT_ORIGINS) || {};
    return productUrl(cfg.tournament, relativePath);
}
