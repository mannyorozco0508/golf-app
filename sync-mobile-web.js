#!/usr/bin/env node
// Regenerates www/app/ (the Capacitor webDir subtree) from the canonical production files
// at the repo root. This is the ONLY sanctioned way www/app/ should ever be updated.
//
// Do NOT hand-edit files inside www/ - they are a generated copy, not a second source of
// truth. Editing them directly will silently diverge from the real (web-deployed) app and
// the next sync will overwrite your changes anyway.
//
// Run this any time production HTML/JS files change, before `npx cap sync`.
//
// Usage: npm run mobile:sync    (or: node sync-mobile-web.js)

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DEST = path.join(ROOT, 'www', 'app');

// ============================================================================
// PRODUCT SHELL DECLARATIONS
//
// The app is heading for two deployments - a golfer-facing Consumer product and
// an organizer-facing Tournament product - out of one repository and one Firebase
// project. These three lists declare which product OWNS each shipped file.
//
// THEY CHANGE NOTHING TODAY. FILES_TO_SYNC below is their union, so the bundle,
// the service worker, every route and every URL behave exactly as before. This is
// classification, so that when the deployments do split, ownership is something
// that was decided deliberately here rather than invented under time pressure by
// whoever is holding the build script.
//
// THE RULE FOR SHARED: a file is shared when divergence between the two products
// would be a correctness or infrastructure problem - not merely because both
// currently reference it. Everything in SHARED_SHELL is either a golf rule both
// products must agree on, or runtime plumbing neither can boot without.
//
// A file belongs to exactly one list. A test asserts that, and asserts the union
// still matches what actually ships.
// ============================================================================

// Golf rules both products must agree on, plus the runtime both must boot with.
// grouping.js decides who is in which group; handicap.js decides every stroke a
// golfer receives; payouts.js decides how a tied place is paid; course-data.js and
// the global_courses schema behind it are one directory both products read and
// write. Two answers to any of those is a correctness bug, not a style choice.
const SHARED_SHELL = [
    'grouping.js', 'handicap.js', 'payouts.js', 'course-data.js', 'score-marks.js',
    // code-issuer.js issues every round, trip and tournament code and checks it is
    // free before handing it out. admin.html, trip.html and tournament.html all
    // load it, so without it here the native bundle 404s and none of them can
    // start anything.
    'code-issuer.js',
    // One HTML escaper for every page that renders a user-supplied name.
    'text-safe.js',
    // Runtime plumbing. The vendored Firebase SDK, the service-worker boot, and
    // the worker and manifest themselves.
    // product-links.js is the only place that knows the two products may live at
    // different origins. Shared because both sides link across the boundary.
    'product-links.js',
    'native-export.js',
    'firebase-app-compat.js', 'firebase-database-compat.js', 'pwa-boot.js',
    'sw.js', 'manifest.json',
];

// THE ICONS LEFT SHARED IN WAVE 19, and that is the whole point of the wave.
//
// icon-192.png and icon-512.png sat here, so the Tournament bundle inherited
// them and the Tournament PWA installed wearing the Consumer mark - two apps,
// one picture, on the same home screen. Nothing was broken; the icons were
// simply classified as runtime plumbing when they are in fact IDENTITY, and
// identity is the one thing two products must not share.
//
// The rule for SHARED is "divergence would be a correctness or infrastructure
// problem". Divergence here is the REQUIREMENT, not the hazard. So each product
// declares its own below, and Consumer's set is unchanged byte for byte: it
// still ships icon-192.png and icon-512.png, still from SHARED_SHELL.concat(
// CONSUMER_SHELL), still declared "any maskable" in its manifest.

// The golfer-facing product: quick rounds, boys trips, side matches, presses,
// settlement, history. money-engine.js, settlement-engine.js and pool-engine.js
// are here rather than in SHARED because wagering between golfers is Consumer's
// domain - Tournament pays places from an entry fee and has never loaded them.
const CONSUMER_SHELL = [
    'admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
    'sidematches.html', 'skins.html', 'stats.html', 'trip.html',
    'instructions.html', 'shared.html', 'logo-mark.png',
    // The home-screen mark, moved here from SHARED_SHELL in wave 19. Consumer
    // ships exactly what it always shipped; what changed is that Tournament no
    // longer gets it for free.
    'icon-192.png', 'icon-512.png',
    'action-model.js', 'bet-strip.js', 'hole-events.js',
    'money-engine.js', 'pool-engine.js', 'settlement-engine.js',
    // The Ryder Cup competition layer, loaded by the scorecard. Without it here
    // the iOS bundle would ship a scorecard that cannot render the Cup card while
    // the browser can - the exact web/native divergence this list exists to stop.
    'ryder-cup.js',
];

// The organizer-facing product. tournament-scorecard.html stays HERE and not in
// Consumer: it is the install-free scoring link a competitor opens, which makes it
// TournamentApp's player surface rather than a Consumer page that happens to be
// small. Moving it would hand Consumer a screen it has no reason to own.
const TOURNAMENT_SHELL = [
    'tournament.html', 'tournament-scorecard.html', 'tournament-engine.js',
    // The organizer product has its own mark now: the R and flag over a dark
    // green TOURNAMENTS banner. Three sizes ship - 512 and 192 for the manifest,
    // 180 for the apple-touch-icon both tournament pages now declare.
    //
    // NO APOSTROPHES IN THIS BLOCK. build-shell.js and three tests read these
    // lists by matching every single-quoted run between the brackets, so a
    // contraction in a comment is parsed as a shell file. One did, and the list
    // came back with the comment text in it.
    //
    // tournament-icon-1024.png is DELIBERATELY ABSENT. It is 695KB of Xcode and
    // App Store Connect asset and would otherwise be precached onto every device
    // for a shell whose whole purpose is working on a course with no signal -
    // the same rule icon-1024.png has always followed.
    'tournament-icon-512.png', 'tournament-icon-192.png', 'tournament-icon-180.png',
    // THE MANIFEST BOTH TOURNAMENT PAGES LINK, and the one committed per-product
    // file in the repo. Every other per-product manifest is GENERATED into dist/,
    // and that is still true - build-shell.js writes dist/tournament/manifest.json
    // exactly as before and nothing reads this file to produce it.
    //
    // It exists because the LIVE deployment is still the combined repo root, where
    // manifest.json is the Consumer one. Measured on golf-app-5a5.pages.dev:
    // /manifest.json is name "Rattle Golf", start_url ./admin.html, icon-192/512
    // maskable. A tournament page linking manifest.json would therefore offer the
    // OTHER product for installation - worse than the no-link state it replaced.
    //
    // deployment_build_test.js asserts this file is byte-identical to what
    // build-shell.js generates for the tournament output, so the two cannot drift.
    'tournament-manifest.json',
    // THE AUTH SDK IS TOURNAMENT ONLY. Organizers sign in; golfers never do, and
    // no Consumer page loads it. Declared here rather than SHARED so the
    // Consumer native bundle and dist/consumer do not carry 132KB no page of
    // theirs references - measured: as SHARED it shipped to iOS for nothing.
    // The root sw.js still precaches it, because the combined root deployment
    // serves tournament.html too.
    'firebase-auth-compat.js',
];

// Exactly the production runtime files the app needs - no tests, no fallback/archive
// copies, no dev tooling, no Firebase CLI config, no Node package files.
//
// DERIVED FROM THE DECLARATIONS ABOVE, not maintained separately, so the two can
// never disagree about what ships. Today both products deploy together, so the
// bundle is the union; when they split, B8 builds two outputs from the same three
// lists rather than inventing ownership from scratch.
//
// EVERY SHARED ENGINE MUST BE DECLARED. The pages load these as plain <script src>
// globals, and the call sites guard them with `typeof fn === 'function'`. That means
// an engine missing from these lists does not crash the native app - it silently
// does nothing. The Money Pool is the worst case: without pool-engine.js the pot
// computes as zero and vanishes from the scorecard banner, the receipt and the
// settlement totals, with no error anywhere. bundle_manifest_test.js enforces that
// any page shipped here also gets every script that page loads.
// THE NATIVE BUNDLE IS CONSUMER ONLY.
//
// This was the union of all three shells, which put tournament.html,
// tournament-scorecard.html and tournament-engine.js inside the iOS app. That is
// the wrong product: the native target being built is the golfer-facing Single
// Round / Trip app, and TournamentApp is a separate product with its own eventual
// binary. Shipping an organizer console inside a golfer's app is both a review
// risk and a boundary the rest of the repo already enforces everywhere else -
// build-shell.js has produced two separate web outputs for several batches, and
// only this one script still merged them.
//
// TournamentApp is NOT abandoned. When it gets a native target it takes
// SHARED_SHELL.concat(TOURNAMENT_SHELL), by the same rule, from the same lists.
// Nothing here forks an engine: SHARED_SHELL is unchanged and both products keep
// reading the identical golf rules.
const FILES_TO_SYNC = SHARED_SHELL.concat(CONSUMER_SHELL);


// Wiped before every sync, not merged into. www/app/ is generated output, so a file
// left behind from an earlier run is indistinguishable from a file that is supposed to
// be there - and it actively hides the failure this script exists to catch: drop an
// engine from the list, and the previous run's stale copy still satisfies the check
// below. Rebuilding from empty means the verification is always about THIS list.
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

let copied = 0;
let missing = [];
FILES_TO_SYNC.forEach((file) => {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) { missing.push(file); return; }
    fs.copyFileSync(src, path.join(DEST, file));
    copied++;
});

console.log(`Synced ${copied}/${FILES_TO_SYNC.length} files into www/app/`);
if (missing.length > 0) {
    console.error('MISSING (not found at repo root, not copied):', missing.join(', '));
    process.exit(1);
}

// Second gate: a file can copy fine and the bundle still be broken, because what matters
// is not "did every listed file exist" but "does every shipped page have the scripts it
// loads". Checked against the freshly written copies rather than the source, so this
// validates the actual bundle that ships.
let brokenPages = [];
FILES_TO_SYNC.filter((f) => f.endsWith('.html')).forEach((page) => {
    const html = fs.readFileSync(path.join(DEST, page), 'utf8');
    const refs = [...html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)].map((m) => m[1]);
    refs
        .map((r) => r.replace(/^\.\//, ''))
        .filter((r) => r.endsWith('.js') && !r.includes('//') && !r.includes('/') && !r.includes(':'))
        .forEach((script) => {
            if (!fs.existsSync(path.join(DEST, script))) {
                brokenPages.push(`${page} loads ${script}, which is not in the bundle`);
            }
        });
});

if (brokenPages.length > 0) {
    console.error('BUNDLE IS INCOMPLETE - do not run `npx cap sync` against this:');
    brokenPages.forEach((b) => console.error('  -', b));
    process.exit(1);
}

console.log('Bundle verified: every shipped page has every script it loads.');
