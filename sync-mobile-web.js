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

// Exactly the production runtime files the app needs - no tests, no fallback/archive
// copies, no dev tooling, no Firebase CLI config, no Node package files. Fallback copies
// and the two legacy unauthenticated admin panels are deliberately excluded from the
// packaged app bundle even though they still exist in the web repo for now.
//
// EVERY SHARED ENGINE MUST BE LISTED HERE. The pages load these as plain <script src>
// globals, and the call sites guard them with `typeof fn === 'function'`. That means an
// engine missing from this list does not crash the native app - it silently does nothing.
// The Money Pool is the worst case: without pool-engine.js the pot computes as zero and
// vanishes from the scorecard banner, the receipt and the settlement totals, with no
// error anywhere. bundle_manifest_test.js now enforces that any page shipped here also
// gets every script that page loads, so this list cannot quietly fall behind again.
const FILES_TO_SYNC = [
    // Pages
    'admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
    'sidematches.html', 'skins.html', 'stats.html', 'trip.html',
    'tournament.html', 'tournament-scorecard.html', 'instructions.html', 'shared.html',
    // Shared engines - see the note above before removing any of these
    'action-model.js', 'bet-strip.js', 'course-data.js', 'grouping.js', 'hole-events.js',
    'money-engine.js', 'pool-engine.js', 'score-marks.js', 'settlement-engine.js',
    'tournament-engine.js', 'pwa-boot.js',
    // Firebase SDK, vendored so the wrapped app carries no runtime CDN dependency.
    // Flat repo-root filenames deliberately: the copy loop below writes into a flat
    // DEST, and the bundle verifier skips any script path containing '/', so a
    // vendor/ subdirectory would both break the copy and silently exempt these two
    // from verification. App first, then database - that is their load order.
    'firebase-app-compat.js', 'firebase-database-compat.js',
    // Shell assets
    'sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png',
];

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
