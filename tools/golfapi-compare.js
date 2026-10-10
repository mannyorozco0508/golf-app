#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - GOLFAPI vs OPENSTREETMAP GREEN CENTERS (build 9 check)
//
//   node tools/golfapi-compare.js [ourCourseKey ...]
//
// For each course the GolfAPI file (golfapi/gps-golfapi.js, gitignored) links to
// one of our course keys: every hole's GolfAPI green center against the bundled
// OSM green's center, in yards. Anything over 10 yds is FLAGGED. Default: the
// Myrtle trip's courses and Talking Stick Piipaash. Prints only distances - no
// GolfAPI coordinates.
// ============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const G = require(path.join(ROOT, 'gps-geo.js'));
const T = require(path.join(ROOT, 'gps-courses.js'));
const FILE = path.join(ROOT, 'golfapi', 'gps-golfapi.js');
if (!fs.existsSync(FILE)) { console.error('no golfapi/gps-golfapi.js - run tools/golfapi-pull.js --build first'); process.exit(1); }
const D = require(FILE);
const names = T._names || {};
const KEYS = process.argv.slice(2).length ? process.argv.slice(2) : ['caledonia', 'trueblue', 'pinelakes', 'pinehills',
    'thistle_27_cameron_stewart', 'thistle_27_mackay_cameron', 'thistle_27_stewart_mackay', 'az_talking_piipaash'];
const YD = 0.9144;
let flagged = 0;
KEYS.forEach((key) => {
    const name = names[key] || key;
    const m = G.golfapiMatch(D, key, name, null, 18);
    const osm = G.osmCourse(T, key);
    if (!m) { console.log(`${key.padEnd(28)} no GolfAPI course (name "${name}")`); return; }
    const rows = [];
    for (let n = 1; n <= 18; n++) {
        const a = m.record.holes[String(n)], b = osm && osm.holes[String(n)];
        if (!a) { rows.push(`${n}:no GolfAPI green`); continue; }
        if (!b) { rows.push(`${n}:no OSM green`); continue; }
        const yd = Math.round(G.haversineMeters(a.osm.mid, b.osm.mid) / YD);
        if (yd > 10) flagged++;
        rows.push(`${n}:${yd}${yd > 10 ? ' FLAG' : ''}`);
    }
    console.log(`${key.padEnd(28)} ${m.how}\n    ${rows.join('  ')}`);
});
console.log(flagged ? `${flagged} hole(s) over 10 yds - check them on the satellite before the round` : 'every hole within 10 yds');
