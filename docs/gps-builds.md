# Two products, one codebase: `GPS_ENABLED`

| Product | What it is | Where it runs | `GPS_ENABLED` |
|---|---|---|---|
| **Consumer** | Bets only: exactly the app it was before GPS | the live web site **and** the iOS/Android app | `0`, or unset (**the default**) |
| **HardPan** | GPS + Bets: the "📍 GPS \| 💰 Bets" toggle | **web only**, on its own URL (a Home Screen icon) | `1` |

## Decisions (Manny, 2026-10-07). No merge, and nothing below happens, before Oct 17.

1. **The live web site is the CONSUMER build** (bets only). HardPan's URL is
   **`gps.hardpangolf.com`** (decided 2026-10-07; `hardpangolf.com` is Manny's,
   on Cloudflare), a Cloudflare Pages custom domain. The deploy change is
   **planned below and not done**.
2. **The iOS app is Consumer only.** HardPan is web only. The HardPan iOS build
   path is **removed**: `sync-mobile-web.js` refuses `GPS_ENABLED=1` and
   writes nothing, never ships a GPS file, and always takes
   `NSLocationWhenInUseUsageDescription` *out* of `Info.plist`. No code in the
   repo can add the key. `gps_flag_test.js` holds all three, and
   `native_bundle_freshness_test.js` fails on any GPS file found in a native
   bundle.
3. **Esri key:** Manny creates it with no card, the Basemaps privilege only, and
   referrers restricted to the HardPan URL. The exact values are below.
4. **`course_gps` rules: NOT published.** The proposal is
   `docs/gps-rules-proposal.json`, and the exact diff against
   `database.rules.json` is `docs/gps-rules-proposal.diff`. Any round member can
   set an EMPTY green; only the organizer can change an existing one.
   `gps_rules_proposal_test.js` runs the cases against an in-memory copy.
5. **Setting a green always uses USGS imagery, never Esri,** even when Esri is
   on. While a green is being set, the Esri layer and its credits come off the
   map and USGS (public domain) is the picture. They go back after Save or
   Cancel. Measured in `tools/gps-check.js` (the `esri` arm).

6. **Esri: no app-side storage, proven.** The service worker never answers or
   stores an Esri request (it returns early for any other origin). There is no
   IndexedDB in the GPS code, and the only Cache Storage the GPS side writes is
   the USGS pre-cache. The browser's own HTTP cache, under Esri's
   `Cache-Control`, is the only cache an Esri tile ever sits in. Proven by
   `gps_esri_never_cached_test.js` (the real worker code, online and offline,
   for both `sw.js` and the generated `dist/hardpan` worker) and by
   `tools/gps-esri-cache-check.js`: a real registered worker in Chrome, a
   stand-in Esri on another origin sending Esri's headers, and every Cache
   Storage entry and IndexedDB database read back. Control: let the worker
   handle cross-origin requests, and both go red.
7. **Par comes from our scorecard, never OSM.** OSM's par isn't shipped. A
   green that matched cleanly ships; one whose OSM data disagrees with our card
   ships with a **"verify on course"** note on the GPS side, shown until
   somebody sets or fixes that green. True Blue #10 (card par 5, OSM 4) ships
   that way. **Pine Lakes:** our card matches the official 2026 card exactly
   (par 70). OSM's mapped nine turn out to be the **back** nine (by length
   they play 5,3,4,4,4,4,3,4,4, the official 10-18), so they ship as holes
   10-18, all marked verify. The front nine is tap-to-set. **Thistle:** the
   Stewart nine is marked verify (greens rebuilt Jun–Sep 2026).
8. **Thistle pairings.** The organizer picks the Front 9 and Back 9 in round
   setup. For each official pairing (Stewart/MacKay, MacKay/Cameron,
   Cameron/Stewart), the setup builder's card, the round name, the GPS key and
   the greens on 1-9 and 10-18 all line up (`gps_thistle_pairing_test.js`).
   **Reported, not changed:** the setup default is Cameron / MacKay, which is
   not one of the three pairings, and the selects allow any combination.
   Whether setup should offer only the three is Manny's call.

After `offline-durable-queue` merges, rebase `gps-v1` onto it. That branch is
at `golfapp-v311-homeresume`, so this one takes the next free key.

## How each build is produced

### iOS (and Android) app: Consumer, always

```bash
node sync-mobile-web.js && npx cap sync ios
```

There is no flag to set. `GPS_ENABLED=1 node sync-mobile-web.js` is
**refused**:
*"the iOS/Android app is Consumer only (bets, no GPS) … Nothing was written."*
The bundle is the pre-GPS bundle except for one line, the shared shell cache
version. Its `index.html` is byte-identical to `main`'s (sha `0bbcaf20…`, main 387cf89, merged into gps-flow 2026-10-09).

### The HardPan GPS TestFlight app (`gps-beta/`, com.rattlegolf.gpsbeta)

A **separate** iOS app with its own Capacitor project; the Consumer app's
`ios/` and `sync-mobile-web.js` are not involved (and still refuse GPS).

- **Build 3** (0.1): yardage-only, no Firebase, the Myrtle trip. Its source is
  the git tag **`gps-beta-b3`**: `git checkout gps-beta-b3 && node
  tools/build-gps-beta.js && cd gps-beta && npx cap sync ios`.
- **Build 5** (0.2): build 4 plus its own icon (option B: the HardPan ball with
  "HP" and a green location pin; `ios/App`'s HardPan icon is untouched) and the
  side remembered per round (every new round opens on GPS).
- **Build 4 on** (0.2): the Consumer app exactly (the same `SHARED_SHELL` +
  `CONSUMER_SHELL` lists, the same Firebase project and database) plus GPS,
  display name **HardPan GPS**, internal TestFlight only:

```bash
node tools/build-gps-app.js && cd gps-beta && npm install && npx cap sync ios
node tools/ios-google-urlscheme.js --root gps-beta   # once GoogleService-Info.plist is in
```

`gps-beta/ios/App/App/GoogleService-Info.plist` must be the Firebase iOS app
registered for **com.rattlegolf.gpsbeta**: a Release build (Archive) refuses
any other (the "Firebase config is for this app" build phase).

### Web: `build-shell.js`

```bash
node build-shell.js consumer                 # CONSUMER -> dist/consumer (cache consumer-v152-unplayedzero, unchanged from main)
GPS_ENABLED=1 node build-shell.js consumer   # HARDPAN  -> dist/hardpan  (cache consumer-v185-gps-buildnine)
node build-shell.js tournament               # Tournaments never ship GPS, whatever the flag says
```

Measured 2026-10-06: `dist/consumer` on this branch is byte-identical, every
file, to `dist/consumer` built from `main` (82d98b4), re-measured after the second 2026-10-07 rebase.

## The deploy change: PLAN ONLY, not done

**Today:** one Cloudflare Pages project (`golf-app-5a5.pages.dev`) serves the
repository root with no build command. That one deploy serves Consumer,
Tournaments (`tournaments.rattlegolf.com` routes `/` to `/tournament`), the
static pages (privacy, terms, support) and `functions/` (the course-search
proxy, push, the host router). The root is the HardPan source, so **merging
`gps-v1` without this change would put GPS on the live site.** The change has
to land with the merge, or before it.

**Target:**

| Pages project | Serves | Build command | Output |
|---|---|---|---|
| `golf-app` (existing): `golf-app-5a5.pages.dev`, `rattlegolf.com`, `tournaments.rattlegolf.com` | Consumer + Tournaments + static pages, GPS flag OFF | `node tools/site-build.js` | `dist/site` |
| `hardpan-gps` (new): **`gps.hardpangolf.com`** (decided) and `hardpan-gps.pages.dev` | HardPan (Consumer pages + GPS) + static pages | `GPS_ENABLED=1 node tools/site-build.js` | `dist/site` |

**Steps, in order (the next wave, not this one):**

1. **Write `tools/site-build.js`.** It copies every file the root deploy serves
   today into `dist/site`, through `tools/gps-flag.js` with the flag as given
   (OFF: GPS blocks removed and `GPS_SHELL` left out). `functions/` stays at the
   repository root, where Pages reads it whatever the output directory is.
   Guard: for every URL the live site serves today, flag OFF gives the same
   bytes as the root, except `sw.js`'s cache line. Option for that wave: also
   stop serving dev files (`CLAUDE.md` and `package.json` are public today).
   That is a behaviour change, so it needs its own decision.
2. **Create the `hardpan-gps` Pages project** from the same repository.
   Production branch `main`, the build command above, and a copy of the
   `golf-app` project's environment variables (the course-search API key and
   `GOLFCOURSE_DAILY_LIMIT`), or the proxy has no key. Add the custom domain
   `gps.hardpangolf.com` (DNS is already on Cloudflare). Deploy, and test on a
   phone.
3. **Firebase → Authentication → Authorized domains:** add
   `gps.hardpangolf.com`. Anonymous scoring works without it; email-link and
   Google sign-in don't.
4. **Switch the `golf-app` project** to its build command and output directory.
   Verify the live site: `sw.js` has no `gps-` entry, `/gps-view.js` returns
   404, `index.html` matches the Consumer sha, and Tournaments and the API still
   answer.
5. Branch previews then follow their project: `<branch>.golf-app-5a5.pages.dev`
   is Consumer, and `<branch>.hardpan-gps.pages.dev` is HardPan.

## Esri key: the exact allowed referrers

Create an **API key credential** in the ArcGIS Location Platform dashboard. Use
**no payment method**, and give it **one privilege: Basemaps**
(`premium:user:basemaps`). Allowed referrers, one per line, exactly:

```
https://gps.hardpangolf.com
https://hardpan-gps.pages.dev
```

While testing on the branch preview, before step 2 exists, also add the
following, and remove it before HardPan goes live:

```
https://gps-v1.golf-app-5a5.pages.dev
```

- Origins only, https, no path, no trailing slash. Esri allows a wildcard only
  in the sub-domain part and only on https. `https://*.hardpan-gps.pages.dev`
  would cover every branch preview of the new project, but also anyone's
  `*.pages.dev` deploy under that name, so prefer exact hosts.
- **Do not add** `golf-app-5a5.pages.dev`, `rattlegolf.com`, `capacitor://localhost`
  or `localhost`. Consumer and the iOS app never use Esri.
- **Verify it took:** paste the key into `gps-config.js` on the branch, open the
  GPS side on the phone, and look for "Powered by Esri" with sharp imagery at
  close zoom. With a wrong referrer, Esri refuses the tiles: within 4 failed
  tiles the screen drops Esri and shows USGS (softer close up, and no Esri
  credit).
- If the free 2M tiles a month ever run out, the same fallback happens. With no
  card on file, Esri stops answering; it never bills.

## Tests, with the flag on and off

```bash
npm test                                         # flag ON  (the repo is HardPan source)
node tools/gps-flag-tree.js /tmp/consumer-tree   # flag OFF: a Consumer worktree of the current commit
cd /tmp/consumer-tree && npm test
git worktree remove --force /tmp/consumer-tree
```

## Marking GPS code in a shared file

```html
<!-- GPS:BEGIN -->  ...HardPan only...  <!-- GPS:END -->
```
```js
// GPS:BEGIN
...HardPan only...
// GPS:ELSE
// ...the Consumer line, commented out...
// GPS:END
```

A flag-off build removes the whole block. A `GPS:ELSE` branch comes back
uncommented. Unbalanced markers stop the build instead of guessing.

## After Oct 16 (PLAN ONLY): a test Firebase project for previews

**Today** every preview (`<branch>.golf-app-5a5.pages.dev`) uses the **live**
database, `golfapp-9fb21`, because the Firebase config is written into each
page. A round made while testing GPS, like ZNBLP8, is a real live round.

**Plan:**
1. **Create a Firebase project `hardpan-test`** on the free Spark plan. Add a
   Realtime Database and turn on Anonymous and Email-link sign-in. Add the
   preview hosts (`*.hardpan-gps.pages.dev` can't be a wildcard; add each
   branch host you test on) to its Authorized domains. Publish the repo's
   `database.rules.json` to it. That's a test project, not a live rules
   publish.
2. **Seed it** with a copy of `global_courses` (exported from live in the
   console, imported into test), so course search and the built-in courses
   behave the same. Never copy `events`, `trips` or `organizers`: no real
   rounds or people.
3. **Choose the database at build time, not in the page.** `build-shell.js`
   (and the planned `tools/site-build.js`) rewrite the one `firebaseConfig`
   block per page from an env var: `FIREBASE_TARGET=test` or `live`.
   Cloudflare Pages tells a build which branch it is building
   (`CF_PAGES_BRANCH`), so:
   - **production (`main`)** uses `live`;
   - **every preview branch** uses `test`, automatically.
   A guard test fails if a build for any branch other than `main` contains the
   live `databaseURL`, and if a `main` build contains the test one.
4. **Push notifications stay live-only.** The test project gets no FCM setup,
   so preview rounds can never notify real phones.
5. **Rollback** is to remove `FIREBASE_TARGET` from the Pages build settings;
   builds then default to `live`, which is today's behaviour.

This rides on the deploy change above (a build step on Pages), so it lands
after it, and after Oct 16, like everything here.
