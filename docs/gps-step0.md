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

### 7d. Wave 2: Esri live, "plays like", free / Pro (2026-10-08, branch gps-wave2)

Manny approved the scope on 2026-10-08. Branch `gps-wave2` is stacked on
`gps-wave1` and unmerged until after Oct 17.

- **Esri World Imagery is live:**
  - **The key:** `gps-config.js` carries the ArcGIS key. It has Basemaps
    privileges only and an Allowed Referrers list: gps.hardpangolf.com,
    hardpan-gps.pages.dev, and the gps-v1 / gps-wave1 previews.
  - **Not in other builds:** `GPS_SHELL` keeps the file out of the Consumer,
    iOS and Android builds.
  - **Public, on purpose:** the key is public by design (and visible in the
    public repo). The account has no payment method, so past the free tier
    (2M tiles a month) Esri stops answering; it never bills.
  - **The key is written down in one place only.** Tests and checks use a
    stand-in, and the key is not repeated in this document.
- **Zoom:**
  - The Esri source asks for tiles up to z19 (`TILES.maxNativeZoom`, one
    constant). The map goes to z21, enlarging the z19 tiles with no extra
    requests.
  - Never raise the source max: past its coverage Esri answers HTTP 200 with a
    "Map data not yet available" picture, which is not an error.
  - USGS stays at z18.
  - With Esri, 3x reaches its full step on a short par 3.
- **Attribution:** exactly `Powered by Esri | Source: Esri, Vantor, Earthstar
  Geographics, and the GIS User Community`. "Esri" links to esri.com.
  - It is fixed text now. The runtime `copyrightText` read was removed: one
    request less, and the required line is this one.
  - On 2026-10-08 the service's own `copyrightText` read exactly the same.
- **When Esri fails, USGS takes over:**
  - **4 Esri tile errors in a row:** a loaded tile resets the count. This is
    the same whether Esri never answered (a host the key does not list: 403 on
    localhost and new previews) or stopped mid-round (the free tier used up, the
    key expired).
  - **The phone loses signal:** the `offline` event hands over at once. When
    the signal comes back (`online`), Esri is tried once more, only after an
    offline fallback.
  - **No retry loops and no Esri prefetch.** Setting a green and Edit Pin stay
    on USGS.
- **Plays like:** a small "plays ~158" line under CENTER / PIN (the "~" says
  it is an estimate).
  - **Formula:** `gps-geo.playsLike`, with D = yards to the aim point.

    ```
    E    = (target ft - origin ft) / 3
    head = mph x cos(windFrom - shotBearing)
    W    = head > 0 ? D x 0.01 x head : D x 0.005 x head
    T    = D x 0.001 x (70 - tempF)
    plays like = round(D + E + W + T)
    ```

    Only the terms with data are used. Wind and temperature are used only up to
    an hour old.
  - **Heights:** from USGS EPQS (`epqs.nationalmap.gov`, free, no key, US
    only).
    - It is asked only for **course points**: the tee, 25 / 50 / 75 % along
      tee → green, the green's center and today's saved pin. Each is rounded to
      5 decimals, **never the golfer's position**.
    - Each point is asked for once ever (`hardpan_elev_v1_<lat>,<lng>`), one at
      a time, only for the hole on screen, while GPS shows and online.
  - **The golfer's height** is worked out on the phone: the fix projected onto
    tee → green (`gps-geo.alongLine`), between the sampled points either side.
  - **Wind and temperature** come from the wind box's own NWS reading
    (`periods[0].temperature`). There is no other weather request.
  - **When it is hidden** (quietly): under 30 yds, on the green, outside the
    US, or with no data at all.
- **Free / Pro (no purchases yet):**
  - **`hasGpsPro()`** is the one check, exported on `window.HardPanGps`. It
    reads, in order:
    1. `?gpstier=free|pro|clear` (stored as `hardpan_gps_tier`)
    2. `HARDPAN_GPS_CONFIG.paywall`, which is `false` this wave, so everyone in
       the GPS build is Pro
    3. later, the App Store entitlement
  - **Free basic mode:**
    - It shows the title, ◀ ▶, units, FRONT / CENTER / BACK, accuracy, Enter
      Score and "Get HardPan GPS".
    - There is no map: MapLibre is never loaded, and there are no tile, Esri,
      USGS pre-cache, EPQS or NWS requests.
  - **The upgrade sheet** reads "HardPan GPS — coming soon", with the feature
    list and "Not now". It shows **no price** until Manny sets one: setting
    `HARDPAN_GPS_CONFIG.priceLine` brings back a price line and a disabled buy
    button.
    - It is never shown to a Pro user.
    - It opens the first time GPS is shown in a session, and from "Get HardPan
      GPS".
    - Betting stays free.
- **Checked by** `tools/gps-check.js`. It runs one stand-in on 127.0.0.1 for
  Esri, EPQS and NWS. Every default arm runs with Esri **refusing** (403), so
  each one is also a fallback check.
  - **New arms:**
    - `esrix`: 3x on a par 3, tiles z ≤ 19, Edit Pin on USGS.
    - `esrib`: breaks mid-round.
    - `esrio`: offline, then online again.
    - `budgt`: the tile budget.
    - `plays` + a second visit with 0 EPQS requests.
    - `free` / `clear`: basic mode, then Pro restored.

- **Green view (follow-up, same day):** "⛳ Green" zooms to the green alone.
  - It keeps the hole's own turn (tee → green up).
  - It shows the outline, F / C / B and today's pin, each labelled with its
    distance from the golfer (or the tee).
  - It shows "Green N yds deep · M wide", measured on the outline turned to the
    line of play. A tapped green without an outline shows depth only when F and
    B were tapped.
  - Edit Pin works there. "⛳ Hole" (the same button) goes back.
  - The 1x / 2x / 3x button hides while it shows.
- **Cache:** `golfapp-v326-gps-green` / `consumer-v161-gps-green`. Main used
  v322–v325 and consumer-v160 for builds 12–15, so these go above them.

### 7e. Redesign step 1: full-screen map, floating panels, free pan (2026-10-08)

Our own look (deep green-black glass, a lime accent, rounded panels), not a copy
of any other app.

- **Map:** edge to edge. Every control floats over it on a translucent panel.
- **Top panel:**
  - **Back** returns to the card.
  - **The hole:** ‹ HOLE n ▾ › — tapping the number opens a 1–18 picker
    through the card's own `goToHole`.
  - **The hole line:** "Par 4 · 385y · HCP 12" from our card. A card with no
    yardage shows the mapped tee → green distance as "~335y".
  - **The numbers:** CENTER big, with F and B small beside it, and "plays ~"
    under it.
- **Under it:** accuracy and the green's source, the green's size in the Green
  view, and the "⚠ Verify green" note — one line until tapped, so it never
  covers the green.
- **Right-hand stack:** wind (the arrow relative to the hole), 1x / 2x / 3x
  zoom, and Green / Hole.
- **Left, above the Card button:** Recenter (⌖), plus the "You → target: 75 ·
  plays ~78" pill.
- **Bottom row:**
  - **Card** (the scorecard) replaces the old GPS ⇄ Bets pill. The card has
    one "📍 GPS" button back.
  - **"Hole N · Enter Score"** with a › to the next hole.
  - **Tools:** Edit Pin, set / fix the green, Undo, Units.
- **Free pan:**
  - Pan and pinch anywhere on the course. The map is held to the course's own
    area (every mapped tee and green, plus greens golfers set) with a 400 m
    margin, and z13 is the closest it zooms out.
  - The limit is off on a hole with no data, which is framed on the golfer. A
    partly mapped course like Pine Lakes can have holes outside the mapped area.
  - Recenter, the arrows, the picker and › all return to that hole's own view.
  - The target, distances, arcs and F / C / B stay tied to the current hole
    while panned away.
- **Hole view fit:** the hole is fitted into the space the panels leave clear,
  measured from the DOM. It refits when the panels change size, at most 3 times
  in 2 s, and never from inside a frame (that was a refit loop).

### 7f. Edit Pin removed; the green is set by GPS; one credit line (2026-10-08)

- **Edit Pin is gone:** the Tools item, the flag, PIN and "Pin to center" are
  removed.
  - The app no longer reads or writes `events/<code>/pinLocs`. Existing
    records stay in the database untouched.
  - CENTER is always the green's center. `gps-geo.clampToGreen`, its test and
    the Edit Pin check arm went with it.
- **Set / fix the green by GPS (Tools):**
  - The golfer stands on the middle of the green and taps **Set center**,
    then can add front and back the same way. The sharp Esri photo stays up,
    because nothing is taken from it.
  - Set works only at ±5 yds or better; below that the banner says so and
    the button is off.
  - "Set by tapping (lower detail)" is the old photo-tap way, and the only
    place USGS is used besides offline.
  - **Privacy note:** this is the one place a GPS position is saved — the
    spot the golfer stands on, saved AS the green, when they tap Set. It goes
    into the green record (round + course copy) like a tapped green does.
- **Credits:** no white block. One line at the bottom-left, under the Card /
  Enter Score row: "Powered by Esri · ⓘ" (or "USGS · ⓘ" when USGS is the
  picture).
  - ⓘ opens every credit line — Esri's sources, USGS when shown, ©
    OpenStreetMap contributors — taken from MapLibre's own attribution for
    the sources on the map.
  - A tap anywhere closes it.

### 7g. Google satellite, optional (2026-10-08) — OFF until a key is set

- **Settings in `gps-config.js`:**
  - `imagery` — everyone's picture; default `'esri'`.
  - `imageryPro` — HardPan GPS users' picture.
  - `googleKey` — empty means Google is off whatever is chosen. No key is
    included; Manny supplies it.
  - Free users have no map at all, so in practice `imageryPro` decides.
- **How it loads:**
  - Map Tiles API 2D satellite. A session (`POST /v1/createSession`,
    `{mapType:'satellite', language:'en-US', region:'US'}`) is kept on the
    phone and renewed a day before its two weeks run out.
  - Tiles come from `/v1/2dtiles/{z}/{x}/{y}?session=…&key=…`, z19 at most;
    the map enlarges to z21.
  - Four errors in a row, or no signal, hand over to USGS — the same logic as
    Esri.
- **Google's rules, as built:**
  1. **Logo:** the "Google Maps" logo, Google's own light-outline file,
     unmodified, 18px high (16–19dp required), with 10px clear above. Alt text
     "Google Maps".
  2. **Copyright:** Google's copyright line for the area on screen, from the
     viewport endpoint, shown on the map next to the logo. The viewport is
     asked with its edges rounded outward to 0.01°, so it never names the
     golfer's spot.
  3. **No storing:** never stored or pre-fetched; only the browser's HTTP cache,
     under Google's own headers.
  4. **No greens from Google:** never the picture while a green is set (by GPS
     or by tapping).
  5. **No other map with it:** never shown with another map. USGS is hidden
     under it, Esri is not on the map at all, and USGS appears only when
     Google is off.
- **Open question for Manny / counsel:** Google's main agreement says Google
  content must not be used "with or near a non-Google Map in a Customer
  Application". The app as a whole also offers Esri and USGS maps (to other
  users, offline, while setting greens). Ask Google before shipping it.
- **Tile budget:** holes 1–18 at 1x + 3x in the check made about 208 Google
  tile requests (Esri: about 218), plus one viewport call per settled move.
