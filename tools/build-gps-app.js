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

// GOLFAPI DATA - THE APP ONLY (build 9). tools/golfapi-pull.js --build writes the
// stripped GolfAPI file to golfapi/ (gitignored: the repo is public and the data
// may not be redistributed). It is copied into the iOS app here and nowhere else:
// the pages.dev web build is made from the repo and never has it, and the service
// worker does not list it. The GPS side loads it when it is there; without it
// the app runs on OpenStreetMap exactly as build 8.
const GOLFAPI = path.join(ROOT, 'golfapi', 'gps-golfapi.js');
if (fs.existsSync(GOLFAPI)) {
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
