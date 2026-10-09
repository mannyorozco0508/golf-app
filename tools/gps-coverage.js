#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - COVERAGE OF THE COURSE DIRECTORY (build 5, 2026-10-09)
//
// Every course in the directory (course-data.js presets + the live
// global_courses, read-only) with its GPS coverage: greens x of the course's
// holes. A course with bundled data (gps-courses.js) is counted from it. One
// without is looked up in OpenStreetMap the way the app does (the same pure
// parts from gps-geo.js: the courses near the COURSE's directory location, ours
// by name, its holes, a hole kept only when its line ends inside its green).
// No location in the directory: "no location".
//
//   node tools/gps-coverage.js <global_courses.json> [--json out.json]
//
// OVERPASS ETIQUETTE: one pair of queries per course, a User-Agent, a 10 s pause
// between courses. Nothing is written anywhere but stdout / --json.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const G = require('../gps-geo.js');

const ROOT = path.join(__dirname, '..');
const UA = 'HardPan-GPS-coverage/1.0 (+https://golf-app-5a5.pages.dev; support@rattlegolf.com)';
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(q) {
    let last;
    for (const u of SERVERS) {
        for (let k = 0; k < 3; k++) {
            try {
                const r = await fetch(u, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
                if (r.ok) return await r.json();
                last = new Error('overpass ' + r.status);
            } catch (e) { last = e; }
            await pause(8000);
        }
    }
    throw last;
}

async function main() {
    const gcFile = process.argv[2];
    const gc = gcFile ? JSON.parse(fs.readFileSync(gcFile, 'utf8')) : {};
    const sb = {};
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'course-data.js'), 'utf8') + '\n;this.p = coursePresets;', sb);
    const bundled = require('../gps-courses.js');
    const keys = [...new Set(Object.keys(sb.p).concat(Object.keys(gc)))].sort();
    const rows = [];
    for (const key of keys) {
        const rec = gc[key] || {}, preset = sb.p[key] || {};
        const name = rec.name || preset.name || key;
        const holesN = ((rec.data || preset.data || []).length) || 18;
        const L = rec.location || {};
        const lat = Number(L.latitude), lng = Number(L.longitude);
        const own = G.osmCourse(bundled, key);
        const row = { key, name, holes: holesN, where: [L.city, L.state].filter(Boolean).join(', ') };
        if (own && own.holes) { row.greens = Object.keys(own.holes).length; row.source = 'bundled'; rows.push(row); continue; }
        if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng)) { row.greens = null; row.source = 'no location'; rows.push(row); continue; }
        try {
            const a = await overpass(G.golfCoursesQuery([lat, lng]));
            const pick = G.pickGolfCourse(a.elements, name);
            if (!pick) { row.greens = 0; row.source = 'OSM: no golf course there by that name'; }
            else {
                await pause(3000);
                const b = await overpass(G.courseHolesQuery(pick));
                const r = G.cleanLookupHoles(b.elements);
                row.greens = Object.keys(r.holes).length;
                row.source = 'OSM lookup (' + pick.type + '/' + pick.id + ' "' + ((pick.tags && pick.tags.name) || '') + '")';
                row.osmHoleWays = r.counts && r.counts.holeWays;
            }
        } catch (e) { row.greens = null; row.source = 'OSM busy / error: ' + e.message; }
        rows.push(row);
        await pause(10000);
    }
    rows.forEach((r) => console.log(`${r.name.slice(0, 40).padEnd(41)} ${String(r.greens == null ? '-' : r.greens).padStart(2)}/${r.holes}  ${r.source}${r.where ? '  [' + r.where + ']' : ''}  (${r.key})`));
    const ji = process.argv.indexOf('--json');
    if (ji !== -1) fs.writeFileSync(process.argv[ji + 1], JSON.stringify(rows, null, 1));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
