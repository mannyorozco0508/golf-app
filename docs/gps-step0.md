# HardPan GPS — Step 0 findings (checked 2026-10-06)

Everything below was read from the primary source on 2026-10-06. Quotes are
verbatim. This is not legal advice; items marked **OPEN** need a decision.

## 1. Esri ArcGIS Location Platform — free tier, attribution, offline

**Free tier: 2,000,000 basemap tiles a month, confirmed.**
Pricing: "Basemap tiles … requests to basemaps-api.arcgis.com, ibasemaps-api.arcgis.com,
or static-map-tiles-api.arcgis.com … 2M free then $0.15 per 1,000 tiles."
— https://location.arcgis.com/pricing/

- Past the free tier with no card on file, service stops; it does not bill:
  "A payment method is required to enable pay-as-you-go (PAYG) to continue using
  services beyond the free tier." — https://location.arcgis.com/help/billing/
- "Usage is not recorded for any basemap tiles that may be cached in your users'
  web browser." (same page) — browser-cached tiles are free.
- A free account with no card goes inactive after 12 months with no recorded
  usage. — https://location.arcgis.com/help/account-management

**Attribution (implemented, always on the map):**
"Powered by Esri" must be "clearly displayed on the map, application, or in a window
that is accessible from a menu or button"; data credits must be displayed "directly
on or at the bottom of the map where it is always visible". For non-Esri libraries,
"retrieve the copyrightText from the service's metadata and then display the Esri and
data attribution text manually."
— https://developers.arcgis.com/documentation/esri-and-data-attribution/interactive-maps/

The World Imagery credit **changed in 2026**: it now reads "Source: Esri, Vantor,
Earthstar Geographics, and the GIS User Community" (Maxar → Vantor). The app reads
`copyrightText` from the service at runtime and falls back to that string.

**Offline pre-caching verdict: NOT ALLOWED. Only normal browser caching.**

> "Neither Customer nor Application Users may scrape, download, or extract Resultant
> Output, nor cache or store Resultant Output except as outlined herein: A. Customer
> may allow pre-caching of Resultant Output as permitted by the caching headers
> (HTTP/1.1 standard …) returned by Location Services to the extent necessary for
> enabling or optimizing the use of the Customer Application."
> — ArcGIS Location Platform Agreement (rev. 2025-11-21) §3.1(b)(6),
> https://www.esri.com/content/dam/esrisites/en-us/media/legal/platform/platform-legal.pdf

> "Customer may take Online Services basemaps offline through Esri Content Packages …
> for use with licensed ArcGIS Runtime applications … Customer may not otherwise
> scrape, download, or store Data." — Esri Master Agreement E204 §3.2(c)

> "YOU MAY NOT Systematically harvest basemap tiles through any method other than
> using Esri Content Packages." — Esri items FAQ (2025-04-21)

So, as the brief said: **no Esri prefetch, and no app-side storage at all**
(confirmed 2026-10-07; proven by `gps_esri_never_cached_test.js` and
`tools/gps-esri-cache-check.js`, see `docs/gps-builds.md` decision 6). Offline
imagery comes from USGS instead (section 1b). What the app does with Esri:
- Tiles are requested only for what is on screen, and only while online.
- They are cross-origin, so `sw.js` never touches them (its fetch handler returns early
  for any other origin — `gps_wiring_test.js` holds that). They sit only in the
  browser's HTTP cache, under Esri's own `Cache-Control` headers.
- No payment method on the ArcGIS account, by decision (2026-10-06). Past the
  2M free tiles Esri stops answering. The GPS side notices after 4 failed
  tiles with none loaded, drops the Esri layer, and shows USGS.
- With neither Esri nor cached USGS tiles available, the screen shows the hole line, the green
  shape, the F/C/B pins, the blue dot and the yardages on a plain dark-green background, with
  "No satellite view here without signal — yardages still work."

## 1b. USGS Imagery Only — the offline layer (checked 2026-10-06)

- Endpoint: `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}`.
  No key and no account.
- **Native to z16.** The service metadata gives `maxScale: 9027.98` (1:9,028 = z16),
  and z17 answers HTTP 404 (measured). Past z16 the map enlarges the z16
  tiles, up to zoom 18, so the picture is softer than Esri's when zoomed in close.
- Licence: "Map services and data downloaded from The National Map are free and
  in the public domain … there are no use restrictions on these services"
  (USGS FAQ, https://www.usgs.gov/faqs/what-are-terms-uselicensing-map-services-and-data-national-map;
  read via search, because usgs.gov blocked a direct fetch with a CloudFront 403).
  The service metadata itself has `exportTilesAllowed: true`, with up to 100,000
  tiles per export.
- Credit (from the service's own `copyrightText`): "USDA, USGS The National Map:
  Orthoimagery". It is always on the map.
- Headers: `Access-Control-Allow-Origin: *` and `Cache-Control: max-age=86400`.
  About 25 KB per 256 px JPEG.
- **Pre-cache:** when a round opens with signal, `gps-view.js` stores the
  course area's tiles at z13–z16 in Cache Storage (`hardpan-usgs-v1`). The area
  comes from course data (OSM holes and any greens golfers set), never from the
  golfer's position. Each course is fetched once per 30 days, four requests at a
  time, with a hard cap of 400 tiles. Measured: Caledonia 24 tiles, True Blue 32,
  PineHills 30, Tri-Mountain 15, a Thistle pairing 36, so under 1 MB per course.
  `sw.js` leaves `hardpan-usgs-*` alone when the shell updates.
- A course with no OSM data and no golfer-set green has no known area, so it
  isn't pre-cached. Its satellite view works online only until a green is set.
- Esri's tiles are drawn on top when there is a key and signal. Under a working
  Esri layer, USGS reads only from the phone's cache and makes no requests.

## 2. API key — scope and origins

- Scope: one privilege, **Basemaps** (`premium:user:basemaps`). That covers
  `ibasemaps-api.arcgis.com` World Imagery. (The newer static-tiles service has
  **no satellite style** — "Only satellite labels" — so it is not an option.)
- Endpoint used: `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=KEY`
  (256 px tiles; answers "Token Required" without a key).
- **The keyless `server.arcgisonline.com` endpoint is NOT used.** It is licensed under
  the Master Agreement: "If you do not have Esri software, you must purchase an ArcGIS
  Online subscription." — https://www.esri.com/content/dam/arcgisonline/docs/tou_summary.pdf
- Referrer restriction: "By setting the Allowed Referrers … limit their use to only
  authorize requests coming from specific origins … Wildcard domains are supported on
  HTTPS only." — https://developers.arcgis.com/documentation/security-and-authentication/faq/
  Set: `https://golf-app-5a5.pages.dev` (+ any custom domain).
- **Moot since 2026-10-07: HardPan is web-only, so no key is used inside the iOS app** (the exact referrers are in `docs/gps-builds.md`). Kept for the record: **iOS app origin.** Esri's docs only show http(s) origins. A tile `<img>` sends
  a `Referer`, not `Origin`, and a `capacitor://localhost` page may send none. Whether a
  referrer-restricted key works inside the native app is **unverified** and needs a
  real-device test. If it fails: a second basemaps-only key for iOS with a usage alert,
  or a tile proxy. Legacy API keys were retired 2026-06-27; create an **API key
  credential**.
- **Where the key goes:** `gps-config.js` → `esriKey: ''`. It is empty in this branch.
  Empty = plain-background mode, fully usable. A browser map key is public by design;
  the scope + referrers are the protection.

## 3. Overpass API

> "less than 10,000 queries per day and download less than 1 GB data per day" … for
> regular applications "less than 100 queries fetching less 10 MB of data per day" …
> "Be sure to check that your app or website adds User-Agent or Referer headers … that
> uniquely identify your app." … "Commercial use should use self-hosted or paid
> Overpass servers." — https://wiki.openstreetmap.org/wiki/Overpass_API

What the app does: **phones never call Overpass.** `tools/gps-import-osm.js` runs by
hand, one query per course, with a `User-Agent` naming HardPan and a contact, a 10 s
gap between courses, and writes `gps-courses.js`, which ships with the app and is
precached. This round of six courses cost 15 queries total (6 were wasted by a shell
quoting bug in the measurement script and returned empty). **OPEN:** "commercial use
should use self-hosted or paid" — a handful of hand-run imports is far inside the
numbers, but if course import is ever automated it should go through a paid or
self-hosted instance.

**Departure from the brief, deliberately:** the brief said "store the result in the
Firebase course record". The Myrtle courses are presets with **no** `global_courses`
record, and writing one would (a) add a permanent entry every client can see — the
Tournament picker lists every key — and (b) make admin.html prefer it over the preset
card. So OSM data ships as a file instead (same effect: queried once, read from local
storage, works offline from first launch). Golfer pins go to Firebase (§5).

## 4. OSM — attribution and share-alike

- Attribution (on the map at all times): "© OpenStreetMap contributors" linking to
  https://www.openstreetmap.org/copyright. "Credit OpenStreetMap and its contributors"
  and "make clear that the data is available under the Open Database License".
  — https://www.openstreetmap.org/copyright, https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- `gps-courses.js` is a **Derivative Database** of OSM and carries the ODbL notice in
  its header. The repo is public, which satisfies "offer the derivative database".
- Share-alike and golfer taps: the Collective Database guideline treats combined data
  as separate "so long as the data used for a particular data type is either all OSM
  or all non-OSM within the same regional cut"; the Horizontal Layers guideline says
  mixing OSM and non-OSM for the same feature type triggers share-alike.
  **What the app does:** OSM data lives only in `gps-courses.js` (field `osm`); golfer
  taps live only in Firebase (`events/<code>/gpsPins`, `course_gps/<key>/pins`) and are
  never written into the OSM file. A pin on an OSM-mapped hole is an *override*, not an
  edit of OSM data. `gps_geo_test.js` asserts the bundled file holds only `osm` fields.

## 5. Esri terms vs. golfer-tapped greens: DECIDED 2026-10-07

Esri §3.1(d)(3) limits Resultant Output to "visualization purposes", and a
shared green tapped on Esri imagery is arguably data derived from it.
**Decision: setting a green always uses the USGS layer, never Esri**, even when
Esri is on. While a green is being set, the Esri layer and its credit come off
the map and USGS (public domain) is the picture, then they go back. Measured in
`tools/gps-check.js` (the `esri` arm, with a stand-in Esri layer).

## 6. Where pins are stored, and the rule I did NOT touch

- **Works today:** `events/<code>/gpsPins/h<N>` — on the round, existing rules allow it,
  written through the offline queue, so everyone in that round sees it and it survives
  a dead zone.
- **Shared across future rounds:** `course_gps/<courseKey>/pins/h<N>`. The root
  `$other` rule refuses this path today, and the app ignores the refusal. The
  rule that would open it is **proposed, not applied and not published**
  (decision 2026-10-07): `docs/gps-rules-proposal.json`, with the exact diff in
  `docs/gps-rules-proposal.diff`. Any signed-in round member (a live round at
  that course) can set an EMPTY green; only the organizer of the round named in
  the pin (`ev`) can change one; nobody can delete. The same proposal adds a
  `.validate` to the round copy so only the organizer changes an existing
  round pin. Known limit: a code holder can still DELETE a round pin, because
  the round grants write at its top level. `gps_rules_proposal_test.js` checks
  every case and the limit.

## 7. Rotation (tee at the bottom, green at the top): DONE with MapLibre (2026-10-07)

Leaflet can't rotate a map, and its rotation plugin patches the drag code the
target depends on. So the GPS map moved to **MapLibre GL JS 5.24.0**: free and
open source (BSD-3), vendored, and loaded on the first GPS tap. It rotates
natively. Its single-file build is used because v6 ships only as ES modules
with a separate worker.

- Each hole opens rotated so the direction tee -> green points up. The whole
  hole, from the back tee to the green's outline, fills the map with a small
  margin. The fit is computed in the rotated frame (`gps-geo.holeCamera`), not
  from a north-up bounding box, so a diagonal hole is fitted snugly.
- **The tee** is the hole's BACK tee: of the OSM tee boxes on the first 45% of
  the hole's line (within 45 m of it), the one farthest from the green. It
  falls back to the line's start, but all 108 shipped holes have a mapped tee
  box.
- **Gestures:** one finger pans and two fingers zoom. Nothing rotates by
  accident. **Recenter** returns to the hole's own view.
- **Unchanged:** the draggable target, F/C/B, tap-to-jump and Fix the green
  all work on the rotated map; MapLibre markers stay upright.
- **Zoom:** up to 20 with Esri (native ~19), and 18 with USGS alone (native 16,
  upscaled).
- **Imagery** is unchanged: USGS raster (cache-first, through a `hpusgs://`
  protocol that reads the pre-cache) under Esri raster. Setting a green turns
  Esri off.
- **Measuring from the tee:** more than 1,000 yds from the green, or with no
  GPS, the numbers are measured from the TEE, a small "Measuring from tee"
  label shows, and the blue dot is hidden.
- **Numbers:** at most four digits ("—" beyond). FRONT / CENTER / BACK fit at
  320 px wide, with four digits.
- **No WebGL** (very old devices only): the numbers still work on the plain
  panel, without a map.

### 7b. Polish (2026-10-07, from Manny's phone screenshots)

- **Zoom button** (top-left): 1x -> 2x -> 3x -> 1x. Each step zooms around
  the target, or around the golfer's dot when there is no target, and keeps
  the hole's tee-to-green turn. 2x is one zoom level in and 3x is log2(3)
  levels in, never past the imagery's limit (18 on USGS, 20 with Esri). On a
  short par 3 with USGS only, 3x can stop at 18. Recenter goes back to 1x.
- **Distances on the lines:** small dark pills, one on the yellow line (tee or
  golfer -> target) and one on the white line (target -> green center). A pill
  slides along its line, then off to either side, to the first spot that
  covers nothing: not the target or its label, the green, a pin, the dot, the
  tee, a control or the attribution. If there is no such spot, it hides. The
  same numbers stay under FRONT / CENTER / BACK.
- **Target ring to scale:** 10 yd radius (20 yds across) on the ground, drawn
  at the map's scale, so it grows and shrinks with the zoom. "20 yd" (or
  "18 m") is shown beside it. The touch area never shrinks below 48 px.
- **No pull-down on GPS:** `overscroll-behavior: none` on the page and
  `touch-action: none` on the map. iOS also needs the page's `touchmove`
  refused while GPS is showing. MapLibre still gets every gesture. There is no
  left/right hole swipe on the GPS side to keep; holes change with the arrows.
  Bets scrolls as before.
- **"Measuring from tee"** moved to a small label at the bottom-left, above the
  attribution bar. It used to cover the green.
- **Tee in view:** the bottom margin is the attribution bar's measured height
  plus 24 px. The fixed 36 px let the two-line Esri credit cover the tee. The
  view also re-fits when the screen size or the attribution changes, until the
  golfer moves the map. A hole changed while Bets is showing is framed when
  GPS shows again (a hidden map has no size to fit it into).
- Checked by `tools/gps-check.js`, arms `polish` and `esrtee`, plus the osm
  and off-hole arms.

### 7c. Wave 1: the 18Birdies-style hole screen (2026-10-08, branch gps-wave1)

The handoff was approved by Manny. Imagery stays USGS/NAIP plus OSM greens,
with no paid map API. Esri code remains, but is dormant without a key. No
paywall code yet.

- **Removed:** the "Measuring from tee" label on the map. It's obvious, so it
  isn't shown. Off the hole, the numbers are still from the tee, the dot is
  hidden, and the line under the numbers says "You are off this hole".
- **Yardage arcs:** thin white curves across the hole, 60 yds wide, centered
  on the line of play from the golfer (or the tee, off the hole) to today's
  pin (or the green's center).
  - Carry arcs every 25 yds from 50 up to 40 yds short of the pin.
  - The 100 / 150 / 200-yds-to-the-pin layup marks are dashed and gold,
    labelled "150 to pin".
  - Each arc has a small "125y" label at its left end on screen. A label that
    would cover a pin, the target, a pill or a control is left out.
  - Math: `gps-geo.yardageArcs`. It is local, so the arcs work with no signal.
- **Edit Pin (today's hole location):**
  - Anyone in the group drags the flag. It can't leave the green outline
    (`gps-geo.clampToGreen`); a tapped green with no outline allows 15 m from
    its center. A tap also moves it there.
  - While dragging, CENTER (relabelled **PIN** when a pin is set), the arcs,
    the white line and "Here → pin" all update live.
  - Save writes `events/<code>/pinLocs/h<n> = { lat, lng, at }` through the
    page's durable queue (`durableWrite`), so it works with no signal. The
    existing event-level rule already lets a round member write a new child,
    so **no rules change**.
  - "Pin to center" removes it. A newer pin from another phone (a later `at`)
    replaces this phone's. An unsent one stays until it lands, like every
    unsent write.
  - It is separate from "Fix the green", which moves the green for every
    future round (`gpsPins` / `course_gps`). Edit Pin never touches those.
- **Score button on the map:** "Hole N · Enter Score" at the bottom center,
  above the attribution. It opens the card's own score entry for the hole: the
  Bets side, with the first empty box focused inside the tap so the keyboard
  opens. The score is saved by the same `saveScore` → `events/<code>/scores`
  path as always. **No new data path.**
- **Wind:** a small box at the bottom-right, with an arrow (where the wind
  blows, turned with the map) and mph.
  - Source: the National Weather Service hourly forecast (`api.weather.gov`,
    free, no key, US only).
  - It asks for the COURSE point, the first mapped hole's green to 3 decimals,
    never the golfer's position. It is asked only while GPS shows, at most
    every 15 minutes per course; the grid point is cached for a week.
  - It shows the last reading up to an hour old, and hides quietly when there
    is none (offline, outside the US, any error).
  - Like the imagery tiles, the request tells NWS which course is being
    looked at (IP + course point). It is not the golfer's location.
- **Layout:** the hole view's bottom margin is the attribution bar + the
  38 px score/wind row + 16 px, so the tee shows above the button.
- **TPC Scottsdale Stadium** joins the bundle: OSM way 78388948, 18/18 holes,
  pars match the card, all tees mapped. The importer's `--fetch` query now
  asks for `golf=tee` as well.
- **Checked by** `tools/gps-check.js`, arms `editp`, `score`, `wind`,
  `windoff` and the four test courses (Caledonia, True Blue, Pine Lakes #10,
  TPC Scottsdale), plus arc checks in osm / off-hole / offline.
- **Not built (per the handoff):** #10 "Plays like" (USGS 3DEP elevation +
  wind + temperature) and the paid tier next; #22 3D green / slope later.
