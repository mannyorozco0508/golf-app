#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - OPENSTREETMAP IMPORT (gps-v1, 2026-10-06)
//
// Turns OpenStreetMap golf data into gps-courses.js, the hole records the app
// ships with. PHONES NEVER CALL OVERPASS: this runs once per course, by hand,
// on a Mac, and its output is a file the service worker precaches.
//
//   node tools/gps-import-osm.js            build gps-courses.js from the saved
//                                           extracts in gps-osm/ (no network)
//   node tools/gps-import-osm.js --fetch caledonia
//                                           ONE Overpass query for that course,
//                                           saved to gps-osm/<file>.json, then build
//
// OVERPASS ETIQUETTE (https://dev.overpass-api.de/overpass-doc/en/preface/commons.html):
// one query per course, a User-Agent that says who we are, [timeout:60], and
// a 10 s pause between courses when fetching more than one.
//
// WHAT IS SAVED. gps-osm/<course>.json keeps only golf=hole ways and
// golf=green features with their geometry and tags - what the app uses - not
// the whole Overpass answer (tees, bunkers, paths), which is ~10x larger.
//
// PAR COMES FROM OUR SCORECARD, NEVER FROM OSM (decision 2026-10-07). OSM's
// par= is not shipped. It is used for one thing only: a hole whose OSM par
// disagrees with our card ships with a VERIFY note ("verify on course"), and
// nothing is dropped for it. What IS dropped is a hole whose green did not match
// CLEANLY: the hole line must end inside the green polygon.
//
// VERIFY NOTES are HardPan's own annotations (record.verify, by hole number),
// not OSM data. The GPS side shows them until somebody sets or fixes that green.
// Measured 2026-10-07 and decided:
//   True Blue #10   OSM tags par 4; the card (official) says 5, and the hole line
//                   is 593 yds. Ships, marked verify.
//   Pine Lakes      OSM maps nine holes, refs 1-9, as a consistent walking route
//                   (each green 43-99 yds from the next tee). By length they play
//                   5,3,4,4,4,4,3,4,4 - the official 2026 BACK nine exactly; the
//                   front nine is 4,3,4,4,5,4,4,3,4, which they match on only 5
//                   holes. So they ship as holes 10-18, all marked verify; the
//                   front nine is tap-to-set.
//   Thistle Stewart greens rebuilt Jun-Sep 2026: all nine marked verify.
//
// LICENCE. The output is derived from OpenStreetMap and is ODbL: see the
// header written into gps-courses.js and docs/gps-step0.md.
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const geo = require('../gps-geo.js');

const ROOT = path.join(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'gps-osm');
const OUT = path.join(ROOT, 'gps-courses.js');
const UA = 'HardPan-GPS-import/1.0 (+https://golf-app-5a5.pages.dev; support@rattlegolf.com)';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const OVERPASS_MIRROR = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';

// Thistle names its holes "Cameron - Hole 3 - 402 yards par 4" (some with odd
// spacing, one as "Stewart - 7- 422 yards"); its ref= tags are unreliable.
function thistleNumber(nine) {
    return (tags) => {
        const m = String(tags.name || '').match(/^\s*(\w+)\s*-\s*(?:Hole\s*)?(\d{1,2})\b/i);
        if (!m || m[1].toLowerCase() !== nine) return null;
        return parseInt(m[2], 10);
    };
}

const refOf = (tags) => { const m = String((tags && tags.ref) || '').match(/^\s*(\d{1,2})\s*$/); return m ? parseInt(m[1], 10) : null; };
const STEWART_NOTE = 'Stewart greens were rebuilt Jun-Sep 2026, so this green may have moved.';

// key = the app's course key (course-data.js) or a 27-hole pairing key from
// gps-geo.courseGpsKey. `preset` is the card the par check reads. `verify` is
// { hole: note } for notes decided by hand; par disagreements add their own.
// Thistle's third nine is MacKay; OSM spells it "McKay" in its hole names, so
// that is the spelling the parser matches - the app and every report say MacKay.
const COURSES = [
    { key: 'caledonia', file: 'caledonia', osm: 'way(342296678)', preset: 'caledonia' },
    { key: 'trueblue', file: 'true_blue', osm: 'relation(4856438)', preset: 'trueblue' },
    { key: 'pinelakes', file: 'pine_lakes', osm: 'way(31246141)', preset: 'pinelakes',
      holeNumber: (t) => { const r = refOf(t); return r && r <= 9 ? r + 9 : null; },
      allNote: 'OpenStreetMap numbers this hole REF; on the 2026 card it is hole HOLE (the back-nine pars match 9 of 9). Verify this green on course.' },
    { key: 'pinehills', file: 'myrtlewood', osm: 'relation(18885507)', preset: 'pinehills',
      holeFilter: (t) => /pine\s*hills/i.test(String(t['golf:course:name'] || '')) },
    { key: 'swwa_trimountain', file: 'tri_mountain', osm: 'way(149674375)', preset: 'swwa_trimountain' },
    // Man O' War (Myrtle trip Day 4, 2026-10-16): OSM way 23375416 is ONE area
    // for two courses, "The Wizard / Man O' War". Man O' War's 18 are tagged
    // ref="Man O'War N" (or ref=N, name="Man O'War N"); The Wizard's say
    // "Wizard N" and are left out.
    { key: 'manofwar', file: 'man_o_war', osm: 'way(23375416)', preset: 'manofwar',
      holeNumber: (t) => { const m = (String(t.ref || '') + ' ' + String(t.name || '')).match(/man\s*o\W*\s*war\s*(\d{1,2})\b/i); return m ? parseInt(m[1], 10) : null; } },
    // Scottsdale (Wave 1, 2026-10-08): the Arizona test course. OSM way
    // 78388948 is "TPC Scottsdale Stadium Course".
    { key: 'az_tpc_stadium', file: 'tpc_scottsdale_stadium', osm: 'way(78388948)', preset: 'az_tpc_stadium' },
    // BUILD 5 (2026-10-09): directory courses (global_courses, no built-in preset)
    // that OpenStreetMap maps well, found by tools/gps-coverage.js. Bundled so a
    // phone never has to ask Overpass for them (overpass-api.de refuses browser
    // requests). Pars from gps-osm/directory-pars.json - our card, never OSM's.
    { key: 'gca_50bc8qqa', file: 'chambers_bay', osm: 'way(26787026)', parsFrom: 'directory' },
    { key: 'gca_3ytyrse7', file: 'founders_club_pawleys', osm: 'relation(4856975)', parsFrom: 'directory' },
    { key: 'gca_be9xgn5w', file: 'atlanta_athletic_club', osm: 'way(34768247)', parsFrom: 'directory' },
    { key: 'gca_f0s28j10', file: 'canyon_lakes_kennewick', osm: 'relation(19187969)', parsFrom: 'directory' },
    { key: 'gca_m817km7j', file: 'las_colinas_queen_creek', osm: 'relation(2958121)', parsFrom: 'directory' },
    // 2026-10-10 (Manny): fifteen courses he plays that OpenStreetMap maps fully -
    // every green, and a hole line ending at each (docs/osm-coverage/summary.md).
    // Pars from our card: the preset, else gps-osm/directory-pars.json.
    { key: 'az_tpc_champions', file: 'tpc_scottsdale_champions', osm: 'way(78388952)', parsFrom: 'directory' },
    // CLUBS WITH MORE THAN ONE COURSE IN AN OUTLINE: `pick` hands the course's name
    // to gps-geo.pickHoleSet - the same chooser a phone's lookup uses - which says
    // which step settled it (printed below). Talking Stick: holes named "O'odham N" /
    // "Piipaash N" (step 2).
    { key: 'az_talking_oodham', file: 'talking_stick', osm: 'way(61417793)', preset: 'az_talking_oodham', pick: {} },
    { key: 'az_talking_piipaash', file: 'talking_stick', osm: 'way(61417793)', preset: 'az_talking_piipaash', pick: {} },
    { key: 'gca_bwcdmzcy', file: 'legacy_phoenix', osm: 'relation(3547143)', parsFrom: 'directory' },
    { key: 'swwa_lewisriver', file: 'lewis_river', osm: 'way(357058419)', preset: 'swwa_lewisriver' },
    { key: 'swwa_mintvalley', file: 'mint_valley', osm: 'way(806288368)', parsFrom: 'directory' },
    { key: 'swwa_threerivers', file: 'three_rivers', osm: 'way(305645798)', parsFrom: 'directory' },
    { key: 'swwa_tahoma_valley', file: 'tahoma_valley', osm: 'way(94252069)', preset: 'swwa_tahoma_valley' },
    { key: 'wa_allenmore', file: 'allenmore', osm: 'way(23143257)', parsFrom: 'directory' },
    // Meadow Park: the Championship 18 beside the Williams Nine (step 2).
    { key: 'wa_meadow_park', file: 'meadow_park', osm: 'way(22718513)', parsFrom: 'directory', pick: {} },
    // Glendoveer: East and West, refs 1-18 twice and nothing else (steps 3 / 4).
    { key: 'or_glendoveer_east', file: 'glendoveer', osm: 'way(39789766)', preset: 'or_glendoveer_east', pick: {} },
    { key: 'or_glendoveer_west', file: 'glendoveer', osm: 'way(39789766)', preset: 'or_glendoveer_west', pick: {} },
    { key: 'or_indiancreek', file: 'indian_creek', osm: 'way(276425283)', preset: 'or_indiancreek' },
    { key: 'or_stonecreek', file: 'stone_creek', osm: 'way(188382554)', preset: 'or_stonecreek' },
    { key: 'or_wildwood', file: 'wildwood', osm: 'way(428675780)', preset: 'or_wildwood' },
    // Streamsong Red (golf:course:name). Blue shares the outline and Black has its
    // own; neither is in our directory yet, so neither has a key to ship under.
    { key: 'gca_4ad33747', file: 'streamsong_red_blue', osm: 'way(1351613365)', parsFrom: 'directory', pick: {} },
    // Dobson Ranch (Mesa): Manny mapped all 18 greens in OSM on 2026-10-09/10.
    { key: 'gca_zgkynkan', file: 'dobson_ranch', osm: 'relation(326342)', parsFrom: 'directory' },
    { nines: true, file: 'thistle', osm: 'relation(21283499)', base: 'thistle_27',
      loops: { cameron: 'cameron', stewart: 'stewart', mackay: 'mckay' },
      nineNotes: { stewart: STEWART_NOTE } },
];

const ALIASES = { wa_chambers: 'gca_50bc8qqa' };

function loadCourseData() {
    const src = fs.readFileSync(path.join(ROOT, 'course-data.js'), 'utf8');
    const sb = {};
    vm.runInNewContext(src + '\n;this.coursePresets = coursePresets; this.nineHoleLoops = nineHoleLoops;', sb);
    return sb;
}

function trim(raw) {
    const keep = (raw.elements || []).filter((e) => {
        const g = e.tags && e.tags.golf;
        return g === 'hole' || g === 'green' || g === 'tee' || g === 'fairway';
    }).map((e) => {
        const o = { type: e.type, id: e.id, tags: e.tags };
        if (e.geometry) o.geometry = e.geometry.map((p) => ({ lat: p.lat, lon: p.lon }));
        if (e.members) o.members = e.members.filter((m) => m.role === 'outer' && m.geometry)
            .map((m) => ({ role: m.role, geometry: m.geometry.map((p) => ({ lat: p.lat, lon: p.lon })) }));
        return o;
    });
    return { osm3s: raw.osm3s ? { timestamp_osm_base: raw.osm3s.timestamp_osm_base } : null, elements: keep };
}

async function fetchCourse(c) {
    const q = `[out:json][timeout:60];\n${c.osm}->.course;\n.course map_to_area->.a;\n(nwr["golf"="hole"](area.a);nwr["golf"="green"](area.a);nwr["golf"="tee"](area.a);nwr["golf"="fairway"](area.a););\nout geom;`;
    // overpass-api.de first; when it is busy (504), the mail.ru mirror - the
    // same pair the app's lookup uses.
    let raw = null, last = '';
    for (const url of [OVERPASS, OVERPASS_MIRROR]) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(q),
        });
        if (res.ok) { raw = await res.json(); break; }
        last = `Overpass ${res.status} for ${c.file}`;
    }
    if (!raw) throw new Error(last);
    fs.mkdirSync(RAW_DIR, { recursive: true });
    fs.writeFileSync(path.join(RAW_DIR, c.file + '.json'), JSON.stringify(trim(raw)));
}

// Build every record. Returns { records, report, problems, drops }.
function build(rawDir) {
    const cd = loadCourseData();
    const records = {};
    const report = [];
    const problems = [];
    const drops = [];
    // Ship a hole only if its green matched CLEANLY (the line ends on the green);
    // note a par that disagrees with the card; never ship OSM's par.
    const finish = (key, holes, pars, verify) => {
        const placeholderCard = pars.length >= 9 && pars.every((p) => p === 4);
        Object.keys(holes).forEach((n) => {
            const o = holes[n].osm;
            if (!o.green || !geo.pointInRing(o.end, o.green)) {
                drops.push(`${key} hole ${n}: green did not match cleanly - not shipped`);
                delete holes[n];
                return;
            }
            const want = pars[Number(n) - 1];
            // A PLACEHOLDER CARD (every hole par 4 - TPC Scottsdale Champions and
            // Allenmore in global_courses, 2026-10-10) says nothing about par, so it
            // is not compared: nine "verify" notes from a card nobody filled in would
            // be noise on the GPS screen.
            if (placeholderCard) { delete o.par; return; }
            if (o.par && want && o.par !== want && !verify[n]) {
                verify[n] = 'OpenStreetMap says par ' + o.par + ', our card says ' + want + '. Verify this green on course.';
            }
            delete o.par;
        });
        Object.keys(verify).forEach((n) => { if (!holes[n]) delete verify[n]; });
        return holes;
    };
    COURSES.forEach((c) => {
        const file = path.join(rawDir, c.file + '.json');
        if (!fs.existsSync(file)) { problems.push(`missing extract ${c.file}.json`); return; }
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        const fetched = raw.osm3s && raw.osm3s.timestamp_osm_base || null;
        if (!c.nines) {
            const dir = JSON.parse(fs.readFileSync(path.join(RAW_DIR, 'directory-pars.json'), 'utf8'));
            const pars = c.parsFrom === 'directory' ? dir[c.key].pars : cd.coursePresets[c.preset].data.map((h) => h.par);
            let els = raw.elements, how = '';
            if (c.pick) {
                const name = c.parsFrom === 'directory' ? dir[c.key].name : cd.coursePresets[c.preset].name;
                const ph = geo.pickHoleSet(raw.elements, Object.assign({ name, holes: pars.length === 9 ? 9 : 18, pars }, c.pick));
                if (!ph.set) { problems.push(`${c.key}: the hole picker could not choose (${ph.how})`); return; }
                els = geo.applyHoleSet(raw.elements, ph.set);
                how = `step ${ph.step}: ${ph.how}`;
            }
            const r = geo.osmToCourseGps(els, { holeFilter: c.holeFilter, holeNumber: c.holeNumber });
            const verify = {};
            if (c.allNote) Object.keys(r.holes).forEach((n) => { verify[n] = c.allNote.replace('REF', String(Number(n) - 9)).replace('HOLE', String(n)); });
            const holes = finish(c.key, r.holes, pars, verify);
            const rec = { v: 1, osmBase: fetched, holes };
            if (Object.keys(verify).length) rec.verify = verify;
            records[c.key] = rec;
            report.push({ key: c.key, holeWays: r.counts.holeWays, greensMatched: r.counts.greensMatched,
                          shipped: Object.keys(holes).length, verify: Object.keys(verify).length, how });
            return;
        }
        // A 27-hole club: one record per nine, then every pairing the app can
        // build (front nine = holes 1-9, back nine = 10-18), and each nine alone.
        const perNine = {};
        Object.keys(c.loops).forEach((appName) => {
            const r = geo.osmToCourseGps(raw.elements, { holeNumber: thistleNumber(c.loops[appName]) });
            const pars = cd.nineHoleLoops[c.base][appName].data.map((h) => h.par);
            const verify = {};
            if (c.nineNotes && c.nineNotes[appName]) Object.keys(r.holes).forEach((n) => { verify[n] = c.nineNotes[appName]; });
            const holes = finish(`${c.base}/${appName}`, r.holes, pars, verify);
            perNine[appName] = { holes, verify };
            report.push({ key: `${c.base} ${appName}`, holeWays: r.counts.holeWays, greensMatched: r.counts.greensMatched, of: 9,
                          shipped: Object.keys(holes).length, verify: Object.keys(verify).length });
        });
        const names = Object.keys(c.loops);
        names.forEach((a) => {
            const rec = { v: 1, osmBase: fetched, holes: perNine[a].holes };
            if (Object.keys(perNine[a].verify).length) rec.verify = perNine[a].verify;
            records[`${c.base}_${a}`] = rec;
            names.forEach((b) => {
                if (a === b) return;
                // A reference, not a copy: gps-geo.osmCourse() lays the two nines
                // end to end (verify notes included). Six copied pairings tripled the file.
                records[`${c.base}_${a}_${b}`] = { v: 1, compose: [`${c.base}_${a}`, `${c.base}_${b}`] };
            });
        });
    });
    // The same course under an older directory key: a reference, not a copy
    // (Chambers Bay's built-in preset wa_chambers, still on older rounds).
    Object.keys(ALIASES).forEach((k) => { if (records[ALIASES[k]]) records[k] = { v: 1, compose: [ALIASES[k]] }; });
    return { records, report, problems, drops };
}

function write(records) {
    const header = `// ============================================================================
// GENERATED by tools/gps-import-osm.js - do not edit by hand; re-run the tool.
//
// Hole records for HardPan GPS: tee, hole-line end, and green polygon per hole.
//
// Contains information from OpenStreetMap, which is made available here under
// the Open Database License (ODbL) v1.0: https://opendatacommons.org/licenses/odbl/1-0/
// © OpenStreetMap contributors - https://www.openstreetmap.org/copyright
// This file is the ODbL-licensed derived database. Per hole it holds ONLY
// OSM-derived geometry (OSM's par is deliberately NOT shipped: par always comes
// from HardPan's scorecard). A record's 'verify' notes are HardPan's own
// annotations, not OSM data. Golfer-tapped greens live in Firebase, never here.
// ============================================================================
`;
    const body = `(function () {\n    var data = ${JSON.stringify(records)};\n    if (typeof module !== 'undefined' && module.exports) module.exports = data;\n    if (typeof window !== 'undefined') window.HardPanGpsCourses = data;\n})();\n`;
    fs.writeFileSync(OUT, header + body);
}

async function main() {
    const args = process.argv.slice(2);
    const fi = args.indexOf('--fetch');
    if (fi !== -1) {
        const which = args.slice(fi + 1).filter((a) => !a.startsWith('--'));
        const list = COURSES.filter((c) => !which.length || which.includes(c.file) || which.includes(c.key));
        for (let i = 0; i < list.length; i++) {
            if (i) await new Promise((r) => setTimeout(r, 10000));
            console.log('fetching', list[i].file);
            await fetchCourse(list[i]);
        }
    }
    const rawDir = (args.indexOf('--raw') !== -1) ? args[args.indexOf('--raw') + 1] : RAW_DIR;
    if (args.includes('--trim-from')) {
        // One-off: trim full Overpass answers saved elsewhere into gps-osm/.
        const src = args[args.indexOf('--trim-from') + 1];
        fs.mkdirSync(RAW_DIR, { recursive: true });
        COURSES.forEach((c) => {
            const f = path.join(src, c.file + '.json');
            if (fs.existsSync(f)) fs.writeFileSync(path.join(RAW_DIR, c.file + '.json'), JSON.stringify(trim(JSON.parse(fs.readFileSync(f, 'utf8')))));
        });
    }
    const { records, report, problems, drops } = build(args.includes('--trim-from') ? RAW_DIR : rawDir);
    report.forEach((r) => console.log(`${r.key.padEnd(22)} hole ways ${r.holeWays}/${r.of || 18}  greens matched ${r.greensMatched}/${r.of || 18}  shipped ${r.shipped}/${r.of || 18}  verify ${r.verify}${r.how ? '  [' + r.how + ']' : ''}`));
    drops.forEach((d) => console.log('  ' + d));
    if (problems.length) {
        console.error('NOT WRITTEN - fix these first:\n  ' + problems.join('\n  '));
        process.exit(1);
    }
    write(records);
    console.log('wrote', path.relative(ROOT, OUT), (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB,', Object.keys(records).length, 'records');
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { build, COURSES, thistleNumber };
