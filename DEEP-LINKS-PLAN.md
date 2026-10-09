# Deep links — a scan opens the app, not the browser

**Planned, not built.** Manny's call: its own small wave AFTER Oct 17, for the
next build. Nothing in this file is implemented; it exists so the wave can start
without a recon round.

## Why it is a wave of its own

The QR codes (Wave 1, live on `golfapp-v318-qrcodes`) hand out ordinary https
links, so a camera opens Safari or Chrome. Making the installed app take them
instead touches **code signing on iOS** and the **release signing identity on
Android** — which is why it was deliberately kept out of a wave that shipped
three days before an archive.

## iOS — Universal Links

Confirmed by Manny: Team ID `A2Z95T64UU`, bundle `com.rattlegolf.app`, so the
App ID is `A2Z95T64UU.com.rattlegolf.app`.

1. **Apple Developer portal**: enable the Associated Domains capability for the
   App ID. Manny's step — it cannot be done from the repo.
2. **Entitlements, BOTH files**, because the pair already differs on purpose
   (`App/App.entitlements` is Debug with `aps-environment development`,
   `App/AppRelease.entitlements` is Release with `production`). Each gains:
   `com.apple.developer.associated-domains` = `["applinks:golf-app-5a5.pages.dev"]`.
   Add the custom domain too if the app ever moves off pages.dev.
3. **Serve the association file** at
   `https://golf-app-5a5.pages.dev/.well-known/apple-app-site-association`,
   with content type `application/json` and **no** `.json` extension:

   ```json
   { "applinks": { "details": [ {
       "appIDs": ["A2Z95T64UU.com.rattlegolf.app"],
       "components": [
         { "/": "/index.html", "?": { "game": "?*" }, "comment": "a scorekeeper group link" },
         { "/": "/leaderboard.html", "?": { "game": "?*" }, "comment": "the Watch code" }
       ] } ] } }
   ```

   Cloudflare Pages serves `/.well-known/` from the output directory, so the
   file goes in the repo root under `.well-known/` and must be added to
   `build-shell.js`'s consumer output. **It must NOT be precached in `sw.js`** —
   iOS fetches it outside the app, and a cached copy is a stale copy.
4. **Verify before believing it**: `curl -sI` for a 200 and the JSON content
   type, then Apple's own CDN copy at
   `https://app-site-association.cdn-apple.com/a/v1/golf-app-5a5.pages.dev`,
   which is what devices actually read and lags the deploy by minutes.

### The part that will go wrong

A Universal Link **does not open the app when the user taps a link on the same
page's own domain**, and it does not open from a pasted address bar — only from
a tap or a camera scan. So the device check has to scan, not navigate. Also:
iOS caches a failed association for a long time, so get step 3 right before
installing a build that asks for it.

## Android — App Links

1. **Intent filter** in `android/app/src/main/AndroidManifest.xml` on the main
   activity, with `android:autoVerify="true"`, `VIEW` + `DEFAULT` +
   `BROWSABLE`, scheme `https`, host `golf-app-5a5.pages.dev`, and the two path
   prefixes `/index.html` and `/leaderboard.html`.
2. **`/.well-known/assetlinks.json`**, served from the same origin:

   ```json
   [ { "relation": ["delegate_permission/common.handle_all_urls"],
       "target": { "namespace": "android_app",
                   "package_name": "com.rattlegolf.app",
                   "sha256_cert_fingerprints": [ "<upload>", "<Play app signing>" ] } } ]
   ```

3. **The fingerprints.** The UPLOAD key, read from
   `~/rattle-keys/rattle-upload.jks` (alias `rattle-upload`) without the
   password leaving the process:

   ```
   CC:42:26:0D:1A:B3:76:D7:23:28:7A:CC:76:84:A5:56:E1:FC:AE:BC:54:01:C2:78:EB:45:9E:5A:30:83:96:8D
   ```

   **THIS IS PROBABLY NOT THE ONE THAT MATTERS, AND THAT IS THE WHOLE TRAP.**
   If Play App Signing is on — it is the default for anything uploaded as an
   AAB — Google re-signs the app with a key it holds, and the fingerprint a
   phone checks is **that** one, not this. Shipping only the upload fingerprint
   gives App Links that verify in a local build and silently fail from the
   Store, with nothing on screen to explain it.

   **Manny, one lookup:** Play Console → the app → Test and release → Setup →
   App integrity → App signing → copy the **SHA-256 certificate fingerprint**
   under "App signing key certificate". Both go in the array; it takes a list
   for exactly this reason.
4. **Verify**: `adb shell pm get-app-links com.rattlegolf.app` must say
   `verified` for the host, not `legacy_failure`.

## What the wave then ships

- The two `.well-known` files, in the consumer output and NOT in the service
  worker's precache list, with a test that asserts both — a precached
  association file is the quiet way this breaks months later.
- The entitlement on both iOS configurations, and a test that they stay a
  matched pair on the associated-domains key the way `aps-environment` already
  is.
- The Android intent filter, and a test that the paths it claims are exactly
  the two the QR codes hand out — so a third QR target added later cannot
  quietly fall back to the browser.
- A device check is **not** possible here: a Universal Link needs a real scan on
  a real device with a real signed build. This one ends in Manny tapping, and
  the report should say so rather than implying a harness proved it.

## Order, because two of these cannot be undone quickly

1. Serve both `.well-known` files and verify them live. Harmless on its own —
   no app change, nothing to roll back.
2. Get the Play app-signing fingerprint in before the Android filter ships.
3. Then the iOS capability and entitlement, then the Android filter, then a
   build.
