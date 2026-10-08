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
window.HARDPAN_GPS_CONFIG = { esriKey: 'AAPTalx4-ROdiwzeHwjfx4h8zkw..MMqY0Ob6l3l3qcOc5Fb2_3Zh53-BUqlWSQ4IXMpQeG4GTah3KFMVo9VlYeW0rWwwntujx2sHK1FWNqSo54Atw7zSo2XYNbjLrT4_LaQbWHuyn3oB3fdMhyoxB1VLkObto_RcIgnTFjPPXDqQB1dKSQpKWg2STkFw9xci0hkz4CrNQ87kNbSZEmpkfmiNQsSvaGqen5te3hKLmt_dXt2ec7f26WraFZgZK9Wp1o8BAtoP4cEXjJgopst5vjU.AT1_49lmfRNb', paywall: false };
