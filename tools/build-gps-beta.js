#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS BETA - THE WEB CONTENT OF THE SEPARATE TESTFLIGHT APP
// (com.rattlegolf.gpsbeta, Myrtle trip 2026-10-12..16)
//
// Builds gps-beta/www (git-ignored) from the GPS files of this tree:
//   gps-beta/index.html -> www/index.html   (the yardage-only page)
//   gps-geo.js, gps-view.js, gps-config.js, gps-courses.js,
//   maplibre-gl.js, maplibre-gl.css, course-data.js
// and NOTHING ELSE: no Firebase SDK, no scorecard, no service worker. The app
// has no database client, so it cannot write a score, a green or a pin.
//
// Then: cd gps-beta && npx cap sync ios   (its own capacitor.config.json; the
// Consumer app's ios/ is never touched).
//
//   node tools/build-gps-beta.js
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BETA = path.join(ROOT, 'gps-beta');
const OUT = path.join(BETA, 'www');
const FILES = ['gps-geo.js', 'gps-view.js', 'gps-config.js', 'gps-courses.js', 'maplibre-gl.js', 'maplibre-gl.css', 'course-data.js'];
// What may never be in the beta: a database client or anything that writes.
const FORBIDDEN = /firebase|durableWrite|offline-queue/i;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const page = fs.readFileSync(path.join(BETA, 'index.html'), 'utf8');
if (/<script[^>]+src="[^"]*firebase/i.test(page)) { console.error('gps-beta/index.html loads Firebase - refused'); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'index.html'), page);
FILES.forEach((f) => {
    const src = path.join(ROOT, f);
    if (!fs.existsSync(src)) { console.error('missing ' + f + ' - build from a HardPan (GPS) tree'); process.exit(1); }
    fs.copyFileSync(src, path.join(OUT, f));
});
const listed = fs.readdirSync(OUT);
const bad = listed.filter((f) => FORBIDDEN.test(f));
if (bad.length) { console.error('forbidden files in the beta: ' + bad.join(', ')); process.exit(1); }
console.log('gps-beta/www: ' + listed.length + ' files - ' + listed.join(', '));
