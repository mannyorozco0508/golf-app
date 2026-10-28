#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - THE WEB CONTENT OF THE TESTFLIGHT APP (com.rattlegolf.gpsbeta)
// Build 4 on (0.2): the Consumer app exactly, plus GPS. (2026-10-09)
//
// Builds gps-beta/www (git-ignored) from THIS tree, the way sync-mobile-web.js
// builds the Consumer app's www/app - the same SHARED_SHELL + CONSUMER_SHELL
// lists, read from sync-mobile-web.js, never restated - with ONE difference:
// the GPS flag is ON, so the GPS files ship and no GPS block is removed.
// Everything else (home, setup, players, bets, the scorecard, sign-in, the
// Firebase web SDK and so the SAME database as the live app) is the Consumer
// app's own files, copied as they are.
//
// sync-mobile-web.js still refuses GPS_ENABLED=1, and the Consumer app's ios/
// is never read or written here: this writes gps-beta/www and nothing else.
//
// Build 3 (yardage-only, no database) is the git tag gps-beta-b3; rebuild it
// from there with its own tools/build-gps-beta.js.
//
//   node tools/build-gps-app.js && cd gps-beta && npx cap sync ios
//   node tools/ios-google-urlscheme.js --root gps-beta   (after Grok drops in
//                                       the GoogleService-Info.plist for gpsbeta)
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.GPS_APP_DEST ? path.resolve(process.env.GPS_APP_DEST) : path.join(ROOT, 'gps-beta', 'www');
const BUNDLE = 'com.rattlegolf.gpsbeta';
const gpsFlag = require('./gps-flag.js');

function declaredList(name) {
    const src = fs.readFileSync(path.join(ROOT, 'sync-mobile-web.js'), 'utf8');
    const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(src);
    if (!m) throw new Error(name + ' is not declared in sync-mobile-web.js');
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
const GPS = declaredList('GPS_SHELL');
// The Consumer app's list, GPS ON: in this tree CONSUMER_SHELL names the GPS
// files inside its GPS block, so they are in it already.
const FILES = [...new Set(declaredList('SHARED_SHELL').concat(declaredList('CONSUMER_SHELL')).concat(GPS))];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const missing = [];
FILES.forEach((file) => {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) { missing.push(file); return; }
    if (gpsFlag.isText(file)) fs.writeFileSync(path.join(OUT, file), gpsFlag.applyFlag(fs.readFileSync(src, 'utf8'), true, file));
    else fs.copyFileSync(src, path.join(OUT, file));
});
if (missing.length) { console.error('MISSING (declared, not at the repo root): ' + missing.join(', ')); process.exit(1); }
// 077b (Manny, Oct 26: "one app, one icon"): the repo-root icon-192/512, favicon-32 and hardpan-icon.svg
// are now these same new files too, so this overlay copies identical bytes for them; logo-mark.png
// (receipt) still differs. Kept as is so the GPS app never depends on the root files.
// 077 THE NEW HARDPAN LOGO (Manny's Oct 25 pick, ~/Desktop/HardPan-Logo): THIS APP ONLY. The repo-root
// icon-192/512, favicon-32, hardpan-icon.svg and logo-mark.png stay the old HP ball (the web and the
// Consumer app keep them until Manny OKs those); the GPS app gets the new files laid over them here,
// plus the Home title mark (hp-home-mark.png, root).
const BRAND_APP = path.join(ROOT, 'assets', 'brand', 'hardpan-2026', 'app');
fs.readdirSync(BRAND_APP).forEach((f) => fs.copyFileSync(path.join(BRAND_APP, f), path.join(OUT, f)));
fs.copyFileSync(path.join(ROOT, 'hp-home-mark.png'), path.join(OUT, 'hp-home-mark.png'));
// THE DEV SWITCH (mailbox 008): GPS_DEV_PRO=1 makes THIS build count as subscribed (Manny's Cmd+R
// beta-testing of the GPS features while the store isn't set up). Written into the built
// gps-config.js only; never archive a build made with it.
if (process.env.GPS_DEV_PRO === '1') {
    fs.appendFileSync(path.join(OUT, 'gps-config.js'), '\n// DEV BUILD (GPS_DEV_PRO=1): counts as subscribed. NEVER ARCHIVE THIS BUILD.\nwindow.HARDPAN_GPS_CONFIG.devPro = true;\n');
    console.warn('DEV BUILD: GPS_DEV_PRO=1 - this build counts as subscribed. Do NOT archive or upload it.');
    // 070 (Manny, Oct 25): THE SCORECARD SCAN, ON IN THE DEV APP ONLY (gps-scan-client.js serverOffHere reads
    // features.scanServer; absent = off). A plain / release build never gets this line.
    fs.appendFileSync(path.join(OUT, 'gps-config.js'), '\n// DEV BUILD (GPS_DEV_PRO=1): the scorecard scan server is on (uses the account\'s free scans).\nwindow.HARDPAN_GPS_CONFIG.features = window.HARDPAN_GPS_CONFIG.features || {};\nwindow.HARDPAN_GPS_CONFIG.features.scanServer = true;\n');
}
// THE PAYWALL SWITCH (URGENT-062): GPS_PAYWALL=1 turns the GPS paywall ON in THIS build's
// gps-config.js (the repo keeps paywall: false, so a normal build or install never locks GPS).
// It wins over GPS_DEV_PRO (a dev build that counted as subscribed could not show the paywall):
// with both set, the dev switch is left out. The store is gps-config iapStore (RevenueCat for 2.0;
// HardPanStore StoreKit 2 kept). Run from Xcode with the App scheme, StoreKit answers from
// gps-beta/ios/App/App/HardPan.storekit.
if (process.env.GPS_PAYWALL === '1') {
    const cf = path.join(OUT, 'gps-config.js');
    fs.writeFileSync(cf, fs.readFileSync(cf, 'utf8').replace(/\nwindow\.HARDPAN_GPS_CONFIG\.devPro = true;\n/, '\n// (GPS_PAYWALL=1: the dev switch is left out.)\n')
        + '\n// PAYWALL BUILD (GPS_PAYWALL=1): GPS needs the trial or the subscription.\nwindow.HARDPAN_GPS_CONFIG.paywall = true;\n');
    console.warn('PAYWALL BUILD: GPS_PAYWALL=1 - GPS needs the 7-day trial or the subscription (StoreKit).');
}
// 096 THE BUDDY PREVIEW (Manny's typed OK, Oct 28 2026): HARDPAN_BUDDY_PREVIEW=1 makes THIS build the
// one-week Cloudflare Pages preview "gps-buddy" for a phone browser. Branch 096-buddy-preview only, never
// merged; never set it for the app or production. (1) tools/buddy-preview/buddy-preview.js goes first in
// every page's <head>: the end-date gate (after Wed Nov 4, 2026 11:59 PM Arizona: "This preview has ended")
// and the app's front doors in a browser. (2) No key in the web files: the Esri key is blanked in the built
// gps-config.js (the map uses USGS imagery, as on any host the key does not list). (3) No GolfAPI data.
if (process.env.HARDPAN_BUDDY_PREVIEW === '1') {
    // 098: the end instant is per build (HARDPAN_BUDDY_PREVIEW_END = ms since 1970 UTC, the first ENDED instant).
    // Unset = 096's Nov 4 date (1793862000000), so the gps-buddy build is unchanged.
    const bpEnd = process.env.HARDPAN_BUDDY_PREVIEW_END || '1793862000000';
    if (!/^\d{13}$/.test(bpEnd)) { console.error('BUDDY PREVIEW: HARDPAN_BUDDY_PREVIEW_END must be 13-digit ms'); process.exit(1); }
    const bpSrc = fs.readFileSync(path.join(ROOT, 'tools', 'buddy-preview', 'buddy-preview.js'), 'utf8');
    const bpOut = bpSrc.replace(/var END = \d+;.*$/m, 'var END = ' + bpEnd + ';   // ' + new Date(Number(bpEnd)).toISOString() + ' = ended from this instant (set per build, 098)');
    if (!new RegExp('var END = ' + bpEnd + ';').test(bpOut)) { console.error('BUDDY PREVIEW: END not set'); process.exit(1); }
    fs.writeFileSync(path.join(OUT, 'buddy-preview.js'), bpOut);
    console.warn('BUDDY PREVIEW END: ' + new Date(Number(bpEnd)).toISOString());
    fs.readdirSync(OUT).filter((f) => f.endsWith('.html')).forEach((page) => {
        const p = path.join(OUT, page), html = fs.readFileSync(p, 'utf8');
        const m = /<head[^>]*>/i.exec(html);
        if (!m) { console.error('BUDDY PREVIEW: no <head> in ' + page); process.exit(1); }
        fs.writeFileSync(p, html.slice(0, m.index + m[0].length) + '\n<script src="buddy-preview.js"></script>' + html.slice(m.index + m[0].length));
    });
    const cf = path.join(OUT, 'gps-config.js'), before = fs.readFileSync(cf, 'utf8');
    const after = before.replace(/esriKey:\s*'[^']*'/, "esriKey: ''");
    if (after === before && !/esriKey:\s*''/.test(before)) { console.error('BUDDY PREVIEW: esriKey not found to blank'); process.exit(1); }
    // 096 (Manny's typed OK, Oct 28: "OK osm on in 096 preview"): a browser has no GolfAPI data and no live
    // course lookup, so the greens come from the bundled OpenStreetMap data (gps-courses.js) - osm on, THIS build only.
    const withOsm = after.replace(/osm:\s*false/, 'osm: true');
    if (withOsm === after) { console.error('BUDDY PREVIEW: osm: false not found to turn on'); process.exit(1); }
    fs.writeFileSync(cf, withOsm);
    console.warn('BUDDY PREVIEW BUILD (HARDPAN_BUDDY_PREVIEW=1): end-date gate on every page, Esri key blanked, osm on. Pages preview gps-buddy only.');
}
const lost = GPS.filter((f) => !fs.existsSync(path.join(OUT, f)));
if (lost.length) { console.error('GPS files not in the app: ' + lost.join(', ')); process.exit(1); }

// Every shipped page has every script it loads (the same gate as the Consumer sync).
const broken = [];
FILES.filter((f) => f.endsWith('.html')).forEach((page) => {
    const html = fs.readFileSync(path.join(OUT, page), 'utf8');
    [...html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)].map((m) => m[1].replace(/^\.\//, ''))
        .filter((r) => r.endsWith('.js') && !r.includes('//') && !r.includes('/') && !r.includes(':'))
        .forEach((s) => { if (!fs.existsSync(path.join(OUT, s))) broken.push(page + ' loads ' + s); });
});
if (broken.length) { console.error('INCOMPLETE - do not sync:\n  ' + broken.join('\n  ')); process.exit(1); }
console.log('gps-beta/www: ' + FILES.length + ' files (the Consumer app + ' + GPS.length + ' GPS files, GPS on)');

// THE BUILD ID ON SCREEN (URGENT-024, Manny: "make the app show its build id" - which build is on the
// phone). Branch + commit (+ "*" when the tree has uncommitted changes) + when, stamped into the built
// gps-config.js only; the Round Menu and Home show it.
try {
    const cp = require('child_process');
    const br = cp.execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim();
    const sha = cp.execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
    const dirty = cp.execSync('git status --porcelain --untracked-files=no', { cwd: ROOT }).toString().trim() ? '*' : '';
    const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const BUILD = br + ' ' + sha + dirty + ' · ' + when + 'Z';
    fs.appendFileSync(path.join(OUT, 'gps-config.js'), '\n// Stamped by tools/build-gps-app.js (URGENT-024): the build on this phone.\nwindow.HARDPAN_BUILD = ' + JSON.stringify(BUILD) + ';\n');
    console.log('Build id: ' + BUILD);
} catch (e) { console.warn('Build id: not stamped (' + e.message + ')'); }

// GOLFAPI DATA - THE APP ONLY (build 9). tools/golfapi-pull.js --build writes the
// stripped GolfAPI file to golfapi/ (gitignored: the repo is public and the data
// may not be redistributed). It is copied into the iOS app here and nowhere else:
// the pages.dev web build is made from the repo and never has it, and the service
// worker does not list it. The GPS side loads it when it is there; without it
// the app runs on OpenStreetMap exactly as build 8.
const GOLFAPI = path.join(ROOT, 'golfapi', 'gps-golfapi.js');
if (fs.existsSync(GOLFAPI) && process.env.HARDPAN_BUDDY_PREVIEW !== '1') {
    fs.copyFileSync(GOLFAPI, path.join(OUT, 'gps-golfapi.js'));
    const d = require(GOLFAPI);
    console.log('GolfAPI data: ' + Object.keys(d.courses || {}).length + ' courses, ' + (fs.statSync(GOLFAPI).size / 1024).toFixed(1) + ' KB (app only)');
} else console.log('GolfAPI data: none (golfapi/gps-golfapi.js not built) - the app uses OpenStreetMap only');

// THE FIREBASE iOS CONFIG. Sign in with Apple / Google and push need the
// GoogleService-Info.plist of the Firebase iOS app registered for THIS bundle.
// Not a failure here (the web build is fine without it); the Xcode project
// refuses a Release (Archive) build until it is the right one.
const GS = path.join(ROOT, 'gps-beta', 'ios', 'App', 'App', 'GoogleService-Info.plist');
const gs = fs.existsSync(GS) ? fs.readFileSync(GS, 'utf8') : null;
const id = gs && /<key>BUNDLE_ID<\/key>\s*<string>([^<]+)<\/string>/.exec(gs);
if (!gs) console.warn('NOTE: gps-beta/ios/App/App/GoogleService-Info.plist is not there yet (Firebase console -> add iOS app ' + BUNDLE + '). Archive will refuse.');
else if (!id || id[1] !== BUNDLE) console.warn('NOTE: GoogleService-Info.plist is for ' + (id ? id[1] : '?') + ', not ' + BUNDLE + ' - simulator only; Archive will refuse.');
else console.log('GoogleService-Info.plist: ' + BUNDLE);
