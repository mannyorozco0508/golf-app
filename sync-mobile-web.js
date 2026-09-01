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
    // Runtime plumbing. The vendored Firebase SDK, the service-worker boot, the
    // worker and manifest themselves, and the icons.
    'firebase-app-compat.js', 'firebase-database-compat.js', 'pwa-boot.js',
    'sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png',
];

// The golfer-facing product: quick rounds, boys trips, side matches, presses,
// settlement, history. money-engine.js, settlement-engine.js and pool-engine.js
// are here rather than in SHARED because wagering between golfers is Consumer's
// domain - Tournament pays places from an entry fee and has never loaded them.
const CONSUMER_SHELL = [
    'admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
    'sidematches.html', 'skins.html', 'stats.html', 'trip.html',
    'instructions.html', 'shared.html',
    'action-model.js', 'bet-strip.js', 'hole-events.js',
    'money-engine.js', 'pool-engine.js', 'settlement-engine.js',
];

// The organizer-facing product. tournament-scorecard.html stays HERE and not in
// Consumer: it is the install-free scoring link a competitor opens, which makes it
// TournamentApp's player surface rather than a Consumer page that happens to be
// small. Moving it would hand Consumer a screen it has no reason to own.
const TOURNAMENT_SHELL = [
    'tournament.html', 'tournament-scorecard.html', 'tournament-engine.js',
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
const FILES_TO_SYNC = SHARED_SHELL.concat(CONSUMER_SHELL).concat(TOURNAMENT_SHELL);


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
