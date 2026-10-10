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
// paywall: false = everyone in the GPS build has HardPan GPS (Pro). true = the
// free numbers-only screen unless the phone is entitled (gps-view.js
// hasGpsPro() - the one check). Testers: ?gpstier=free | pro | clear.
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
    // GPS LIVE (gps-live, 2026-10-10): any US course from GolfAPI through our Cloud
    // Functions (gps-live.js). OpenStreetMap OFF - kept, one setting away: build 10
    // is osm: true, live: false. liveBase: where gpsSearch / gpsCourse answer.
    osm: false, live: true, liveBase: 'https://us-central1-golfapp-9fb21.cloudfunctions.net' };
