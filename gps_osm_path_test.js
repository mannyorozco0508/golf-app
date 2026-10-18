// ============================================================================
// HARDPAN GPS - OPENSTREETMAP HOLE LINES ON A GOLFAPI COURSE (010, switch osmPath)
//
// gps-geo.osmPathCourse / osmPathLine / osmPathLines: a GolfAPI course (the shipped
// osm: false, live: true phone) borrows the bundled OpenStreetMap course's DRAWN hole
// line - same course (the GolfAPI link table, else name + 5 km), same hole number,
// its start within 40 m of GolfAPI's tee and its end within 40 m of GolfAPI's green
// center - for the preview path and the default target ONLY. Every number shown
// stays GolfAPI's. tools/gps-osm-path-check.js shows it on the map.
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'gps-geo.js'));
const geo = ON ? require('./gps-geo.js') : null;
const table = ON ? require('./gps-courses.js') : null;
const test = (name, fn) => test0(name, { skip: ON ? false : 'Consumer tree (GPS_ENABLED=0): no gps-geo.js' }, fn);
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const R = 6371008.8, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const dest = (p, b, m) => { const d = m / R, t = rad(b), la = rad(p[0]), lo = rad(p[1]); const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t)); return [deg(la2), deg(lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)))]; };

// A GolfAPI course made from the bundled Caledonia holes (the way tools/gps-hazards-check.js
// does): tee = the OSM line's start nudged 10 m, green F / C / B around its end. No dogleg
// point `d` - GolfAPI's usual. shift(n): GolfAPI hole n gets OSM hole n + shift's numbers.
const H = (n) => table.caledonia.holes[String(n)].osm;
function gaCourse(o) {
    o = o || {};
    const holes = {};
    for (let n = 1; n <= 18; n++) {
        const src = H(((n - 1 + (o.shift || 0)) % 18) + 1), line = src.line, end = line[line.length - 1];
        const tee = dest(line[0], 90, 10), b = geo.bearingDeg(line[0], end);
        holes[n] = { g: { f: dest(end, b, -12), c: end, b: dest(end, b, 12) }, t: { b: tee } };
        if (o.edit) o.edit(n, holes[n]);
    }
    return { id: o.id || 'GA1', club: o.club || 'Caledonia Golf & Fish Club', course: o.course || 'Caledonia', lat: o.lat != null ? o.lat : H(1).tee[0], lng: o.lng != null ? o.lng : H(1).tee[1], holes: 18, h: holes };
}
const data = (c, links) => ({ built: true, courses: { [c.id]: c }, links: links || {} });
const DOGLEG = '13';   // Caledonia 13: its OSM line bends ~60 degrees

test('matching: by the GolfAPI link table (bundle key -> GolfAPI id)', () => {
    const c = gaCourse(), d = data(c, { caledonia: 'GA1' }), rec = geo.golfapiRecord([c]);
    assert.deepStrictEqual(geo.osmPathCourse(table, d, rec, 'caledonia', 'Caledonia Golf & Fish Club', null), { key: 'caledonia', how: 'linked' });
    // A round under another key (a GolfAPI search pick, gapi_<id>) finds the linked bundle course.
    assert.deepStrictEqual(geo.osmPathCourse(table, d, rec, 'gapi_GA1', 'Caledonia', null), { key: 'caledonia', how: 'linked' });
});

test('matching: no link - the bundle key or name, and the GolfAPI course within 5 km of the bundled one', () => {
    const c = gaCourse(), d = data(c), rec = geo.golfapiRecord([c]);
    assert.deepStrictEqual(geo.osmPathCourse(table, d, rec, 'caledonia', 'Caledonia Golf & Fish Club', null), { key: 'caledonia', how: 'by name' });
    // Another key, the bundled name, the place known: by name.
    assert.deepStrictEqual(geo.osmPathCourse(table, d, rec, 'gapi_GA1', table._names.caledonia, H(1).tee), { key: 'caledonia', how: 'by name' });
});

test('matching rejects the wrong course: another name, the same name 50 km away, a link to another GolfAPI course', () => {
    const c = gaCourse(), rec = geo.golfapiRecord([c]);
    assert.strictEqual(geo.osmPathCourse(table, data(c), rec, 'gapi_GA1', 'Some Other Golf Club', H(1).tee), null, 'another name');
    const far = gaCourse({ lat: H(1).tee[0] + 0.45 });   // ~50 km north
    assert.strictEqual(geo.osmPathCourse(table, data(far), geo.golfapiRecord([far]), 'caledonia', 'Caledonia Golf & Fish Club', null), null, 'the GolfAPI course is 50 km from the bundled one');
    assert.strictEqual(geo.osmPathCourse(table, data(far), geo.golfapiRecord([far]), 'gapi_GA1', table._names.caledonia, [far.lat, far.lng]), null, 'the name 50 km away');
    // Linked: the bundle key names ANOTHER GolfAPI course - this one is not Caledonia.
    const other = Object.assign(gaCourse(), { id: 'GA2' });
    const d2 = { built: true, courses: { GA1: c, GA2: other }, links: { caledonia: 'GA1' } };
    assert.strictEqual(geo.osmPathCourse(table, d2, geo.golfapiRecord([other]), 'gapi_GA2', 'Elsewhere', H(1).tee), null);
    // No GolfAPI record, no table: nothing.
    assert.strictEqual(geo.osmPathCourse(table, data(c), null, 'caledonia', '', null), null);
    assert.strictEqual(geo.osmPathCourse(null, data(c), rec, 'caledonia', '', null), null);
});

test('the 40 m guards: accept within 40 m; reject a start or an end too far; a GolfAPI hole with its own line keeps it', () => {
    const c = gaCourse(), rec = geo.golfapiRecord([c]), oh = table.caledonia.holes[DOGLEG];
    const ok = geo.osmPathLine(rec.holes[DOGLEG], oh);
    assert.ok(ok.line && ok.line.length >= 3, JSON.stringify(ok));
    // GolfAPI's own ends: the path runs GolfAPI's tee -> the OSM corners -> GolfAPI's green center.
    assert.deepStrictEqual(ok.line[0], rec.holes[DOGLEG].osm.tee);
    assert.deepStrictEqual(ok.line[ok.line.length - 1], rec.holes[DOGLEG].osm.mid);
    assert.deepStrictEqual(ok.line.slice(1, -1), oh.osm.line.slice(1, -1));
    const moved = (field, m) => {
        const h = JSON.parse(JSON.stringify(rec.holes[DOGLEG]));
        h.osm[field] = dest(h.osm[field], 0, m);
        return geo.osmPathLine(h, oh);
    };
    assert.ok(moved('tee', 25).line, 'tee 25 m further off (35 m in all): still accepted');
    assert.match(moved('tee', 45).reject || '', /^start \d+ m from the tee$/);
    assert.ok(moved('mid', 35).line, 'green 35 m off: accepted');
    assert.match(moved('mid', 45).reject || '', /^end \d+ m from the green$/);
    // GolfAPI's rare dogleg point `d`: its own line stays.
    const own = JSON.parse(JSON.stringify(rec.holes[DOGLEG]));
    own.osm.line = [own.osm.tee, dest(own.osm.tee, 0, 200), own.osm.mid];
    assert.strictEqual(geo.osmPathLine(own, oh).reject, 'GolfAPI has its own line');
    // An OSM hole drawn straight (2 points): nothing to borrow.
    assert.strictEqual(geo.osmPathLine(rec.holes[DOGLEG], { osm: Object.assign({}, oh.osm, { line: [oh.osm.line[0], oh.osm.line[oh.osm.line.length - 1]] }) }).reject, 'no drawn bend');
    assert.strictEqual(geo.OSM_PATH_M, 40);
});

test('the whole course: same hole numbers only - shifted GolfAPI holes get no OSM line', () => {
    const c = gaCourse(), d = data(c, { caledonia: 'GA1' });
    const all = geo.osmPathLines(table, d, geo.golfapiRecord([c]), 'caledonia', '', null);
    const bent = Object.keys(table.caledonia.holes).filter((n) => (H(n).line || []).length >= 3);
    assert.deepStrictEqual(Object.keys(all.lines).sort(), bent.sort(), 'every bundled bend whose ends are GolfAPI\'s');
    assert.ok(all.lines[DOGLEG]);
    // Wrong hole number: GolfAPI hole n is really OSM hole n + 1 - no line passes the guards.
    const sh = gaCourse({ shift: 1 });
    const none = geo.osmPathLines(table, data(sh, { caledonia: 'GA1' }), geo.golfapiRecord([sh]), 'caledonia', '', null);
    assert.deepStrictEqual(none.lines, {}, JSON.stringify(none.rejected));
    assert.ok(Object.values(none.rejected).every((w) => /m from the (tee|green)$|no drawn bend/.test(w)));
});

test('yardages unchanged: the GolfAPI record is never touched; front / center / back stay GolfAPI\'s', () => {
    const c = gaCourse(), d = data(c, { caledonia: 'GA1' }), rec = geo.golfapiRecord([c]);
    const before = JSON.stringify(rec);
    const me = dest(rec.holes[DOGLEG].osm.tee, 45, 120);
    const nums = (r) => { const x = geo.holeNumbers(me, geo.resolveHole(r.holes[DOGLEG], [])); return [x.front, x.mid, x.back].map((p) => p && geo.haversineYards(me, p)); };
    const n0 = nums(rec);
    const all = geo.osmPathLines(table, d, rec, 'caledonia', '', null);
    assert.ok(all.lines[DOGLEG]);
    assert.strictEqual(JSON.stringify(rec), before, 'the GolfAPI record is unchanged');
    assert.deepStrictEqual(nums(rec), n0);
    // And the numbers ARE GolfAPI's: its green center, not OSM's.
    const r = geo.resolveHole(rec.holes[DOGLEG], []);
    assert.deepStrictEqual(r.mid, c.h[DOGLEG].g.c);
    assert.strictEqual(r.source, 'osm');   // gps-geo's name for "a record's own green" (here GolfAPI's)
    assert.strictEqual(rec.holes[DOGLEG].osm.src, 'golfapi');
});

test('the preview path and the default target bend at the OSM corner; without it (009) they do not', () => {
    const c = gaCourse(), rec = geo.golfapiRecord([c]), h = rec.holes[DOGLEG].osm;
    const line = geo.osmPathLine(rec.holes[DOGLEG], table.caledonia.holes[DOGLEG]).line;
    const p = geo.holePath({ tee: h.tee, mid: h.mid, line: line, hazards: h.hazards });
    assert.strictEqual(p.src, 'centerline');
    const corner = H(DOGLEG).line[1];
    assert.ok(p.pts.some((q) => geo.haversineMeters(q, corner) < 1), 'the path passes the OSM corner');
    const t = geo.pathTarget({ par: 4, tee: h.tee, mid: h.mid, line: line, from: 'tee', pt: h.tee, path: p });
    assert.ok(geo.alongLine(t, line).d < 5, 'the default target sits on the OSM path');
    const p0 = geo.holePath({ tee: h.tee, mid: h.mid, line: h.line, hazards: h.hazards });
    assert.strictEqual(p0.src, 'straight', '009: GolfAPI alone flies straight');
});

test('gps-view: behind features.osmPath, the line goes to holePath / pathTarget only, the ODbL credit shows with it', { skip: !fs.existsSync(path.join(__dirname, 'gps-view.js')) }, () => {
    const v = read('gps-view.js');
    assert.match(v, /function osmPathOn\(\) \{[^\n]*HardPanFeature\('osmPath'\) !== false/);
    // Only a GolfAPI course, through gps-geo's guards, from the bundled table and file.
    const fn = v.slice(v.indexOf('function osmPathFor('), v.indexOf('// ---- IMAGERY'));
    assert.match(fn, /if \(!S \|\| !osmPathOn\(\)/);
    assert.match(fn, /rec\.src !== 'golfapi'/);
    assert.match(fn, /G\.osmPathLines\(window\.HardPanGpsCourses, window\.HardPanGolfApi/);
    assert.ok(!/fetch\(|XMLHttpRequest|overpass/i.test(fn), 'no network');
    // Used in exactly the two path places: the preview's path and the default target.
    assert.strictEqual((v.match(/osmPathFor\(S\.hole\)/g) || []).length, 3);
    assert.match(v, /line: osmPathFor\(S\.hole\) \|\| \(rec && rec\.line\), fairway: rec && rec\.fairway/);
    assert.match(v, /G\.holePath\(\{ tee: r\.tee, mid: r\.mid, line: osmPathFor\(S\.hole\) \|\| rec\.line,/);
    // Never in the record the numbers come from.
    const osmRec = v.slice(v.indexOf('function osmRecord('), v.indexOf('function osmNewer('));
    assert.ok(!/osmPath/.test(osmRec));
    // The credit: on the map while an OSM line shapes the hole.
    assert.match(v, /<span class="gps-credit-osm" style="display:none">· © <a href="https:\/\/www\.openstreetmap\.org\/copyright"/);
    assert.match(v, /var op = !!osmPathFor\(S\.hole\), oc = S\.el\.querySelector\('\.gps-credit-osm'\);/);
});

test('the OSM table ships in every GPS build, osm: false or not (no new download)', { skip: !fs.existsSync(path.join(__dirname, 'gps-view.js')) }, () => {
    const v = read('gps-view.js');
    // gps-courses.js loads first, whatever osm says; GolfAPI after it.
    assert.match(v, /loadScript\('gps-courses\.js', function \(\) \{ return !!window\.HardPanGpsCourses; \}, function \(\) \{\s*\n\s*if \(!golfapiOn\(\)\)/);
    assert.ok(read('sw.js').includes("'./gps-courses.js'"), 'precached');
    assert.ok(/'gps-courses\.js'/.test(read('sync-mobile-web.js')), 'in the app bundle');
});
