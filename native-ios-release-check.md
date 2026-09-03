# NATIVE iOS RELEASE CHECKLIST — RATTLE GOLF

**Nothing below is marked done unless it has been proven.** Repo items were verified by running them; Xcode and App Store Connect items cannot be verified from the repo and are listed as unchecked regardless of how confident anyone is.

App: **Rattle Golf** · Bundle ID: **`com.rattlegolf.app`** (permanent after the first App Store Connect record) · Toolchain: Capacitor 8.5.1, Xcode 16.5, SPM (no CocoaPods, no `.xcworkspace`).

---

## 1. REPO — verified

- [x] `.gitignore` exists and excludes `node_modules/`, `dist/`, `www/`, `DerivedData/`, `xcuserdata/`, `.DS_Store`, credentials
- [x] `capacitor.config.ts` → `appId: com.rattlegolf.app`, `appName: Rattle Golf`, `webDir: www/app`
- [x] `native_packaging_test.js` pins `webDir: 'www/app'` **and** pins it against the directory `sync-mobile-web.js` writes, so the two cannot drift
- [x] `npm run mobile:sync` produces 31 files in `www/app/`, including `index.html`
- [x] Consumer native bundle contains **zero** Tournament files
- [x] Full suite green; Firebase rules 78/78
- [x] iOS source-control policy decided and documented (`ios/` **is** committed)

## 2. REPO — outstanding

- [ ] `package.json` declares `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios` at 8.5.1 and `typescript` — **commit from the Mac**, where they are already installed
- [ ] `package-lock.json` regenerated with those dependencies — **commit from the Mac**
- [ ] `ios/` committed — **from the Mac**, never regenerated elsewhere
- [ ] Fresh-clone contract proven: `npm install` → `npm test` → `npm run mobile:sync` → `npx cap sync ios`

**Known and accepted:** `npx cap` prints `MODULE_TYPELESS_PACKAGE_JSON` for `capacitor.config.ts`. The warning suggests adding `"type": "module"` to `package.json`. **Do not.** 143 test files use CommonJS `require()` and every one would break. The warning is cosmetic and costs a few milliseconds of parse time.

## 3. LOCAL XCODE

- [ ] Paid Apple Developer Program membership active
- [ ] Xcode → Settings → Accounts shows the paid team, not "Personal Team"
- [ ] Signing & Capabilities → Automatically manage signing **ON**, paid team selected
- [ ] No signing errors
- [ ] Bundle Identifier = `com.rattlegolf.app`
- [ ] **Display Name = `Rattle Golf`** — was blank; Xcode falls back to the target name
- [ ] **Marketing Version = `1.0.0`** — was showing `1.0`
- [ ] Build = `1`
- [ ] Minimum Deployments = iOS 15.0 unless deliberately changed
- [ ] AppIcon populated from the approved 1024×1024 master (§6)
- [ ] Clean build succeeds on the iPhone 17 Pro simulator
- [ ] Archive succeeds (Product → Archive, "Any iOS Device" — **not** a simulator)

## 4. APP STORE CONNECT

- [ ] Create iOS app record
- [ ] Name: `Rattle Golf`
- [ ] Bundle ID: `com.rattlegolf.app`
- [ ] SKU: `rattlegolf-ios-001`
- [ ] Primary language, category (Sports), age rating questionnaire
- [ ] **Privacy Policy URL** — required, does not exist yet
- [ ] **Support URL** — required, does not exist yet
- [ ] App privacy questionnaire: declare what Firebase stores (scores, names, device identifiers, usage counter); nothing is sold
- [ ] Screenshots for every required device size
- [ ] Upload build via Xcode Organizer
- [ ] TestFlight: internal tester, install on a physical iPhone
- [ ] Physical-device smoke test

## 5. POSITIONING — do not skip

Guideline 5.3.3. Rattle Golf **records golf games and calculates settlement between private participants.** It does not accept wagers, hold funds, process bets, or pay winnings — money moves externally through Venmo, outside the app.

- [ ] Store description leads with scoring and group management, not betting
- [x] No casino imagery anywhere in the app (retired in B2 — slot machine and card suits both removed)
- [ ] Never add in-app payment or fund transfer

## 6. APP ICON

Approved master is committed at **`icon-1024.png`** — 1024×1024, RGB, **no alpha**, cream field bleeding to the edge, no baked rounded corners. Verified by `rattle_identity_test.js`.

It is **not** wired into the native asset catalog — that lives in the local `ios/` project, which the repo does not yet contain.

**On the Mac:**
1. Xcode → `App/Assets.xcassets` → `AppIcon`
2. Drag `icon-1024.png` from the repo root into the **1024pt App Store** slot
3. Xcode 16 generates every derived size from that single slot — do not hand-fill smaller slots
4. Confirm no alpha warning at build (Apple rejects icons with an alpha channel)
5. `ios/App/App/Assets.xcassets/AppIcon.appiconset/` then needs committing

**Do not** use `logo-mark.png` — that is the transparent in-app homepage mark, and its alpha channel would fail App Store validation.

## 7. DESTINATIONS

Xcode currently offers iPhone, iPad, Mac (designed for iPad), Vision (designed for iPad).

**Recommendation: leave as-is for v1.** Restricting to iPhone-only means `TARGETED_DEVICE_FAMILY = 1`, which removes the iPad requirement to supply iPad screenshots — but it also permanently narrows the store listing, and re-widening later means new screenshots and re-review.

The app is a mobile-first PWA that already renders responsively, and it has never been tested on iPad. **The real question is whether you want to supply iPad screenshots.** If not, restrict; otherwise leave it. Either way, decide deliberately rather than discovering it at submission.

## 8. NPM AUDIT — triage only

Roughly 11 findings after the Capacitor install (7 moderate, 2 high, 2 critical). **Do not run `npm audit fix --force`.**

Every dependency in this project is **build-time or test-time**. The shipped app is plain HTML, CSS and JS with no bundler and no npm runtime dependencies — `sw.js` precaches 33 hand-written files, and nothing from `node_modules` reaches a device.

| Dependency | Role | Reaches the shipped app? |
|---|---|---|
| `targaryen` | Firebase rules tests | No |
| `@capacitor/cli` | Build tool | No |
| `@capacitor/core` | Native bridge | Yes — the runtime piece |
| `@capacitor/ios` | Native platform | Build-time |
| `typescript` | Parses `capacitor.config.ts` | No |

Only `@capacitor/core` ships. Treat findings in it as real; treat everything else as build-surface only. Revisit after TestFlight, at a patch level, one dependency at a time.

## 9. DEFERRED — not blockers

- Firebase Authentication is **not required**. The access model is the round code; group isolation is enforced by `database.rules.json` and covered 78/78.
- Native entry point: Capacitor loads `index.html`, which redirects to `admin.html` when there is no `?game=`. Simulator launch shows no visible flash. **Do not "fix" this** without a reproduced defect.
- Step 6 scroll: proven to be a simulator gesture (click, hold, drag), not a code defect. No change was made and none should be.
- Custom SVG icon family for navigation and wizard — a later visual batch.
