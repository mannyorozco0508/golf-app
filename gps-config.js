// ============================================================================
// HARDPAN GPS - SATELLITE TILE KEY (gps-v1)
//
// esriKey: an ArcGIS Location Platform API key credential with ONE privilege,
// Basemaps (premium:user:basemaps), and Allowed Referrers set to the web
// origin(s). It is public by design - every browser map ships its key in page
// source; the referrer restriction and the basemaps-only scope are what
// protect it. See docs/gps-step0.md for how to create it and the iOS caveat.
//
// EMPTY = NO SATELLITE. The GPS screen then draws the hole on a plain
// background - green shape, blue dot, yardages - which is fully usable. The
// keyless server.arcgisonline.com endpoint is NOT used: its terms do not
// cover a commercial third-party app (docs/gps-step0.md, section 4).
// ============================================================================
window.HARDPAN_GPS_CONFIG = { esriKey: '' };
