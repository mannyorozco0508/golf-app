// ============================================================================
// HARDPAN GPS - CONFIGURATION (gps-v1; key and paywall added in Wave 2, 2026-10-08)
//
// esriKey: an ArcGIS Location Platform API key credential with ONE privilege,
// Basemaps, and Allowed Referrers set to the HardPan GPS web origins
// (gps.hardpangolf.com, hardpan-gps.pages.dev and the gps-v1 / gps-wave1
// previews). It is public by design - every browser map ships its key in page
// source; the referrer list and the basemaps-only scope are what protect it, and
// the account has NO payment method, so past the free tier (2M tiles a month)
// Esri simply stops answering and the map falls back to USGS. It is never
// billed. On a host the key does not list (localhost, a new preview) Esri
// answers 403 and the map is USGS, as it is with no key. Renew by Sep 24, 2027
// (the key expires Oct 8, 2027). See docs/gps-step0.md.
//
// This file is HardPan only: sync-mobile-web.js's GPS_SHELL keeps it out of the
// Consumer, iOS and Android builds.
//
// GPS IS PAID (Manny, mailbox 007, 2026-10-17): v2.0 ships with ALL of GPS behind
// the "GPS Map" subscription - a 7-day free trial, then auto-renewing yearly. There
// is no unpaid GPS tier. iap: true (below) = the App Store entitlement alone decides
// (gps-view.js hasGpsPro() - the one check - and gps-entitlement.js); no
// entitlement = the paywall, never a GPS map or yardage.
// paywall: read ONLY while iap is off (a build with no store at all): false = GPS
// on, true = GPS off. There is no tester override: the old URL tier switch is
// gone, and nothing in a URL can turn GPS on.
// ============================================================================
window.HARDPAN_GPS_CONFIG = { esriKey: 'AAPTaTQ7ZS-NvPIIFgRrQ2QiJ0g..wJ4gVx3626sm39ujgfU89O2WgTbHOzScHuYC-jqnuh5PVjH4bTxis1jT2WYkunGwob17JGYuZzmp1nsVMZ4tqOzl3AfGe-nTOrsadF8AW1UJcfeMJe1ERbpXz0O0wX8mKr_4URw8uNLdWdsySPhs8J-yoZbizzwiCU-7J5HLnEPamSYe2Xt9IcoBw_OUDiQwKSZBEh1R-OQGiGncsJvl57ehuv0mfk_aLMUZ6fHKlCeqfgk4V2wE-uNv-Pk.AT1_49lmfRNb', paywall: false,
    // GOOGLE SATELLITE: KEEP IT OFF (Manny, 2026-10-08) - googleKey stays ''.
    // The code is built but dormant. Two Google Maps Platform rules rule it out
    // for this app as designed: (1) no offline use, pre-fetching or storing of
    // Google content (Map Tiles API policies / "No Caching"), and (2) "No Use
    // With Non-Google Maps" (Terms 3.2.3(e)) - which our Esri online + USGS
    // offline fallback, in the same app, conflicts with. NEVER ship a build that
    // can show Google and Esri/USGS in the same app. The plan: Esri online, USGS
    // offline. gps_wiring_test.js fails if a Google key is set here.
    imagery: 'esri', imageryPro: 'esri', googleKey: '',
    // GOLFAPI.IO KILL SWITCH (build 9): false = never load or use GolfAPI data, so
    // the app behaves exactly as build 8 (OpenStreetMap only). The data itself
    // ships in the iOS build only (tools/build-gps-app.js); the web never has it.
    golfapi: true,
    // APPLE WEATHERKIT for live wind (gpsWind): OFF until Apple's WeatherKit key is set on the
    // server and gpsWind is deployed (Manny's OK). Off, or failing: NWS, as always.
    weatherkit: false,
    // GPS LIVE (gps-live, 2026-10-10): any US course from GolfAPI through our Cloud
    // Functions (gps-live.js). OpenStreetMap OFF - kept, one setting away: build 10
    // is osm: true, live: false. liveBase: where gpsSearch / gpsCourse answer.
    osm: false, live: true, liveBase: 'https://us-central1-golfapp-9fb21.cloudfunctions.net',
    // PLAYS-LIKE HEIGHTS UP FRONT (gps-features): never asked for hole by hole on the
    // tee - fetched once for the whole course at setup, download or round open.
    elevOnTee: false,
    // GPS MAP IN-APP PURCHASE (gps-store-iap, 2026-10-17; paid launch 2026-10-17;
    // App Store Guideline 3.1.1). iap: true = ON for v2.0: the App Store entitlement
    // alone decides, through RevenueCat (@revenuecat/purchases-capacitor,
    // window.Capacitor.Plugins.Purchases); no plugin or no key = NO entitlement =
    // the paywall (never a crash). false = no purchase plugin is ever called and
    // GPS follows paywall (above).
    // The product: "GPS Map", com.rattlegolf.app.gpsmap.yearly, subscription group
    // "HardPan Plus", auto-renewing yearly, a 7-day free trial as its introductory
    // offer. RevenueCat entitlement: gps_map. Manny creates these in App Store
    // Connect and RevenueCat; the ids here must match them exactly.
    // THE 008 GPS FEATURES (Manny, 2026-10-18): each behind its own switch, so a broken one is
    // turned off here without touching code. Read through HardPanFeature('<name>') (below).
    features: { autoAdvance: true, quickStats: true, hazards: true, clubs: true, flyover: true, hpIndex: true },
    iap: true, iapEntitlement: 'gps_map', iapProduct: 'com.rattlegolf.app.gpsmap.yearly',
    // RevenueCat PUBLIC Apple SDK key (appl_...), from RevenueCat > Project >
    // API keys. Public by design (it ships in every app binary), but it stays
    // EMPTY in the repo until Manny sets it for a build; empty = no purchases.
    // NEVER a RevenueCat secret key (sk_...) - those belong on a server only.
    revenueCatKey: '',
    // THE PRICE is never written here: the paywall shows StoreKit's own localized
    // price, or says the App Store shows it before the golfer confirms.
    // FOUNDING PRICE: the first foundingCap subscribers keep the founding price
    // while they stay subscribed (the price itself is set in App Store Connect).
    // The server's gps_meta/config { foundingOpen, foundingCap } wins when the
    // phone can read it; unreadable or absent = the founding window is open.
    foundingCap: 1000,
    // The paywall's Terms of Use (EULA) and Privacy Policy links. Absolute: the
    // two pages are web pages, not in the app bundle (app_store_pages_test.js).
    iapTermsUrl: 'https://golf-app-5a5.pages.dev/terms.html', iapPrivacyUrl: 'https://golf-app-5a5.pages.dev/privacy.html' };
// ONE READER FOR THE 008 SWITCHES: a feature is on unless its switch is exactly false.
window.HardPanFeature = function (name) { var f = (window.HARDPAN_GPS_CONFIG || {}).features || {}; return f[name] !== false; };
