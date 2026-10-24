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
// paywall (URGENT-062): THE MASTER SWITCH for the GPS paywall. false (the repo, so every
// build and install made from it - Manny's phone included - keeps GPS exactly as today: no
// store asked, never a paywall) | true (GPS needs the 7-day free trial or the yearly
// subscription; the App Store decides, through StoreKit 2 in our own PhoneBridge plugin
// HardPanStore - gps-entitlement.js). A build turns it on with GPS_PAYWALL=1 node
// tools/build-gps-app.js (the built copy only, never this file). With paywall true and iap
// off (a build with no store at all) GPS is off. There is no tester override: the old URL
// tier switch is gone, and nothing in a URL can turn GPS on.
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
    // watch (feature 10, docs/WATCH-APP-PLAN.md): ON (022) - the HardPanWatch target and the HardPanWatch plugin are in the app; no plugin (web) = nothing sent.
    // 009 (mailbox 009 part B): bagSetup = My bag's first-time "Enter your carry for each club";
    // playsBreakdown = the one-line "Plays 168: +6 uphill, +9 into wind (12 mph) -> 6-iron";
    // playsInfo = the (i) "How plays-like works" sheet on that line;
    // courseElev = the whole course's heights sampled once (tee, every 25 yds, green, hazards;
    // USGS, US only) - off: the 5 points per hole (tee, 25 / 50 / 75 %, green) as before.
    // scoreSheet (012): Enter score on the GPS screen opens the score sheet (score grid, putts, tee shot,
    // green in reg, bunker, penalties, notes - the stats on this phone) - off: the card's score box, as before.
    // 012 (mailbox 012 part 3): playsSimple = the line says only "Plays like 249y"; the why
    // (wind, slope, temperature, aim) is in the (i) sheet - off: the 009 line.
    // elevPerLeg (part 4) = each leg its own plays-like (you -> target, target -> green; par 3 ->
    // green) with heights at the real points; > 30 yds off the hole's line the height of the
    // golfer's ~10 m grid cell (its center, never the exact spot; USGS, US only, cached per
    // cell) - off: 009 (golfer -> green / moved target; the tee -> green line as a fallback).
    // elevMyCell = OFF - NEEDS MANNY'S OWN OK under the project rule "No location data leaves the
    // phone unless group-locator opt-in": with it (and elevPerLeg) on, a golfer more than 30 yds
    // off the hole's line has the height of their ~10 m grid cell's CENTER asked of USGS (US only,
    // cached per cell). Off: the golfer's height comes only from the course samples; nothing
    // derived from their position is requested.
    // bagAltitude (part 5) = My bag's "My distances are from: Sea level | A course I pick | Don't
    // adjust" (default Don't adjust) + typical temperature; plays-like adjusts ~2% per 1,000 ft
    // of altitude vs that baseline (on this phone only) - off: no section, no altitude.
    features: { autoAdvance: true, quickStats: true, hazards: true, clubs: true, flyover: true, pathTarget: true, hpIndex: true, watch: true, bagSetup: true,
        // 011 (mailbox 011, mockup C): gpsLayoutC = the map clear at the top, one bottom panel
        // (F / MIDDLE / B, plays, Green | Hazards | Mark shot | Preview, the score row) - off:
        // the old layout exactly. gpsRoundScore = the "Thru 3 · 14 (+2) · Net 13 (+1)" chip.
        // 012 (mailbox 012, mockup D): gpsLayoutD = the "HardPan" layout, the default (one dark top
        // bar, a right rail, the plays-like pill, Mark shot + Enter score at the bottom), with
        // Tools > Screen layout: HardPan | Bottom panel (= layout C), per phone - off: no setting,
        // and the 011 behaviour exactly (C with gpsLayoutC, else the old layout).
        // 012: toolsSheet = Tools as a bottom sheet in layouts D and C (layout / units choices,
        // round switches, a grid of tiles) - off: the old drop-down there too.
        playsBreakdown: true, playsInfo: true, courseElev: true, osmPath: true, playsSimple: true, elevPerLeg: true, bagAltitude: true, elevMyCell: false, gpsLayoutC: true, gpsRoundScore: true, scoreSheet: true, gpsLayoutD: true, toolsSheet: true,
        // 014: layupFromYou = the Hazards sheet's layups count from the golfer ("Lay up to 100 -> hit 135 · 9i",
        // plays-like'd, club from My bag) or the target ring - off: the 008 rows ("= 393 from the tee").
        layupFromYou: true,
        // 017: simpleFlow = the simpler HardPan flow - Home's four doors + Resume, the 3-step New
        // round (Course / Players / Games, one-tap Start, share sheet), one "+ Bet" sheet on GPS and
        // the card, the live money chip, the 6-tile Round Menu, Card/Bets as sheets over the map -
        // off: today's screens exactly. On in dev while Manny tries it.
        // URGENT-016: simpleGames = the 3-step Games & Bets setup (Players / Games steps) and Home's
        // "Same as last week" landing on its Games step. OFF (Manny, 2026-10-19): the Games & Bets
        // door opens the ORIGINAL setup ("What are you setting up?" Road Trip / Game Day) unchanged;
        // the GPS door's "Where are you playing?" -> Start GPS stays the new flow.
        simpleFlow: true, simpleGames: false,
        // URGENT-026: lineSave = "Save this line for this hole?" after a drag on a hole with NO path
        // data (course_gps/<key>/lines/hN, for everyone). OFF until the rules addition
        // (docs/gps-lines-rules-proposal.json) was deployed on Manny's typed OK (2026-10-20); ON on
        // his "OK lineSave on" the same day. Exactly true turns it on.
        lineSave: true },
    // pathTarget (009 part A): the default target sits on the hole's path at the dogleg / landing zone.
    // osmPath (010): on a GolfAPI hole with no line of its own, the bundled OpenStreetMap hole
    // LINE (same course, same hole, its ends within 40 m of GolfAPI's tee and green) shapes the
    // preview path and the default target only - every number stays GolfAPI's. Off: 009.
    // MY BAG ACCOUNT SYNC (009): the signed-in golfer's own bag to player_clubs/<uid>/me. OFF:
    // that rule is phase 2 and not live (writes would be refused) - the bag stays on the phone.
    clubsSync: false,
    // SETTLE UP WITH VENMO / CASH APP (2.1 part D, venmo-pay.js): the Results page's Settle up card -
    // links only, no money through the app. Its paths (events/<round>/venmo, cashapp, settleUp;
    // trips/<trip>/venmo, cashapp): under the LIVE rules only the organizer's phone can write them;
    // the rules change for the group is a proposal (docs/045-venmo-rules-proposal.md, URGENT-045).
    // false = nothing on the page.
    venmo: true,
    iap: true, iapEntitlement: 'gps_map', iapProduct: 'com.rattlegolf.app.gpsmap.yearly',
    // URGENT-062: WHICH STORE. 'storekit' = StoreKit 2 through our own PhoneBridge plugin
    // (gps-beta/ios/App/PhoneBridge/HardPanStorePlugin.swift; no new package) - the choice.
    // 'revenuecat' = the dormant RevenueCat path below (needs its plugin + key; neither is in).
    iapStore: 'storekit',
    // THE TWO PRODUCTS, one subscription group "HardPan Plus", both yearly, both with the 7-day
    // free trial as their introductory offer (one trial per Apple ID per group):
    //   iapProduct         com.rattlegolf.app.gpsmap.yearly           the regular price (34.99)
    //   iapFoundingProduct com.rattlegolf.app.gpsmap.founding.yearly  the founding price (24.99)
    // The founding product is sold only while the founding window is open (foundingCap below,
    // gps_meta/config) AND the store still offers it; a founding subscriber keeps it (and its
    // price) for as long as they stay subscribed. Prices live in App Store Connect / the
    // .storekit file, never here. The local StoreKit file: gps-beta/ios/App/App/HardPan.storekit.
    iapFoundingProduct: 'com.rattlegolf.app.gpsmap.founding.yearly',
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
    // THE CAP IS NOT ENFORCED ON THE PHONE (a phone cannot count other people's purchases):
    // this number is what the paywall SAYS. The count is kept and the window closed on the
    // server (App Store Server Notifications -> gps_meta/config.foundingOpen = false at the
    // cap), and the hard stop is removing the founding product from sale in App Store Connect
    // (StoreKit then stops offering it and the paywall shows the regular price by itself).
    foundingCap: 1000,
    // The paywall's Terms of Use (EULA) and Privacy Policy links. Absolute: the
    // two pages are web pages, not in the app bundle (app_store_pages_test.js).
    iapTermsUrl: 'https://golf-app-5a5.pages.dev/terms.html', iapPrivacyUrl: 'https://golf-app-5a5.pages.dev/privacy.html' };
// ONE READER FOR THE 008 SWITCHES: a feature is on unless its switch is exactly false.
window.HardPanFeature = function (name) { var f = (window.HARDPAN_GPS_CONFIG || {}).features || {}; return f[name] !== false; };
