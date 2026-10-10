#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - OPENSTREETMAP COVERAGE (2026-10-10)
//
//   node tools/gps-osm-coverage.js <rawDir>
//
// <rawDir> holds one Overpass extract per area (<tag>.json: courses with their
// outline geometry, greens and tees with centers, hole lines with geometry, and
// towns) - fetched by hand, one area at a time, and NOT kept in the repo (tens
// of MB). For every leisure=golf_course in the area this writes:
//   docs/osm-coverage/<tag>.md     the full list, sorted by city
//   gps-coverage-<st>.js           the small per-state list the GPS badge reads:
//                                  [osm id, name, city, holes with a green,
//                                   holes with a green AND a hole line ending on
//                                   it (what a phone's lookup can use), holes,
//                                   bundle-ready 0/1, lat, lon of the outline's
//                                   middle (4 decimals - where a lookup asks)] -
//                                   no outlines
// Summary numbers go to docs/osm-coverage/summary.md by hand.
//
// Licence: the lists are derived from OpenStreetMap (ODbL); see the headers.
// ============================================================================
'use strict';
const AREAS = [
    { tag: 'phoenix', title: 'Phoenix metro, AZ', state: 'AZ', flags: [['Dobson Ranch', 'dobson ranch'], ['TPC Scottsdale', 'tpc scottsdale'], ['Talking Stick', 'talking stick'], ['We-Ko-Pa', 'we[- ]?ko[- ]?pa'], ['Las Colinas', 'las colinas'], ['Legacy', 'legacy']] },
    { tag: 'washington', title: 'Washington', state: 'WA', flags: [['Tri-Mountain', 'tri[- ]?mountain'], ['Camas Meadows', 'camas meadows'], ['Chambers Bay', 'chambers bay'], ['Lewis River', 'lewis river'], ['Mint Valley', 'mint valley'], ['Three Rivers', 'three rivers'], ['Elk Ridge', 'elk ridge'], ['Tahoma Valley', 'tahoma valley'], ['Allenmore', 'allenmore'], ['Meadow Park', 'meadow park']] },
    { tag: 'oregon', title: 'Oregon', state: 'OR', flags: [['Glendoveer', 'glendoveer'], ['Indian Creek', 'indian creek'], ['Reserve Vineyards', 'reserve vineyards|^the reserve$'], ['Stone Creek', 'stone creek'], ['Wildwood', 'wildwood']] },
    { tag: 'connecticut', title: 'Connecticut', state: 'CT', flags: [] },
    { tag: 'florida', title: 'Florida', state: 'FL', flags: [['Streamsong', 'streamsong']] },
];
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const RAW = process.argv[2];
if (!RAW) { console.error('usage: node tools/gps-osm-coverage.js <rawDir>'); process.exit(2); }
// Courses already bundled with the app: the OSM ids in tools/gps-import-osm.js.
const BUNDLED = new Set([...fs.readFileSync(path.join(__dirname, 'gps-import-osm.js'), 'utf8').matchAll(/osm: '(way|relation)\((\d+)\)'/g)].map((m) => m[1][0] + m[2]));
function area(A) {
  const tag = A.tag, title = A.title, outDir = path.join(ROOT, 'docs', 'osm-coverage'), FLAGS = A.flags;
  const D = JSON.parse(fs.readFileSync(path.join(RAW, tag + '.json'), 'utf8'));
const R = 6371000, rad = Math.PI / 180;
const dist = (a, b) => { const dl = (b[0] - a[0]) * rad, dn = (b[1] - a[1]) * rad; const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const pt = (g) => [g.lat, g.lon];
// Rings for a course: a closed way, or a relation's outer ways stitched into rings.
function rings(e) {
  if (e.type === 'way') return e.geometry ? [e.geometry.map(pt)] : [];
  const segs = (e.members || []).filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => m.geometry.map(pt));
  const out = [];
  const key = (p) => p[0].toFixed(7) + ',' + p[1].toFixed(7);
  while (segs.length) {
    let ring = segs.shift();
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], end = key(ring[ring.length - 1]);
        if (key(s[0]) === end) { ring = ring.concat(s.slice(1)); segs.splice(i, 1); grew = true; break; }
        if (key(s[s.length - 1]) === end) { ring = ring.concat(s.slice().reverse().slice(1)); segs.splice(i, 1); grew = true; break; }
      }
    }
    out.push(ring);
  }
  return out;
}
function inRing(p, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[0] > p[0]) !== (b[0] > p[0]) && p[1] < (b[1] - a[1]) * (p[0] - a[0]) / (b[0] - a[0]) + a[1]) c = !c;
  }
  return c;
}
const areaOf = (ring) => { let s = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][1] + ring[i][1]) * (ring[j][0] - ring[i][0]); return Math.abs(s); };
const courses = D.courses.filter((e) => e.tags && e.tags.leisure === 'golf_course').map((e) => {
  const rs = rings(e).filter((r) => r.length >= 3);
  const all = rs.flat();
  const lat = all.map((p) => p[0]), lon = all.map((p) => p[1]);
  const bb = all.length ? [Math.min(...lat), Math.min(...lon), Math.max(...lat), Math.max(...lon)] : null;
  return { id: e.type[0] + e.id, tags: e.tags, rings: rs, bb, area: rs.reduce((s, r) => s + areaOf(r), 0), center: bb ? [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] : null, greens: [], tees: [], holes: [] };
}).filter((c) => c.bb);
// Assign a point to the smallest course containing it, else the nearest outline vertex within 250 m.
function owner(p) {
  let best = null;
  for (const c of courses) {
    if (p[0] < c.bb[0] - 0.01 || p[0] > c.bb[2] + 0.01 || p[1] < c.bb[1] - 0.01 || p[1] > c.bb[3] + 0.01) continue;
    if (c.rings.some((r) => inRing(p, r)) && (!best || c.area < best.area)) best = c;
  }
  if (best) return best;
  let near = null, nd = 250;
  for (const c of courses) {
    if (p[0] < c.bb[0] - 0.005 || p[0] > c.bb[2] + 0.005 || p[1] < c.bb[1] - 0.006 || p[1] > c.bb[3] + 0.006) continue;
    for (const r of c.rings) for (let i = 0; i < r.length; i += Math.max(1, Math.floor(r.length / 400))) { const d = dist(p, r[i]); if (d < nd) { nd = d; near = c; } }
  }
  return near;
}
const ctr = (e) => e.center ? [e.center.lat, e.center.lon] : (e.lat != null ? [e.lat, e.lon] : null);
for (const g of D.greens) { const t = g.tags || {}; if (/practice|putting|chipping/i.test((t.name || '') + ' ' + (t.description || '') + ' ' + (t['golf:green'] || ''))) continue; const p = ctr(g); const c = p && owner(p); if (c) c.greens.push(p); }
for (const t of D.tees) { const p = ctr(t); const c = p && owner(t.type === 'node' ? p : p); if (c) c.tees.push(p); }
for (const h of D.holes) {
  if (!h.geometry || h.geometry.length < 2) continue;
  const g = h.geometry.map(pt), a = g[0], b = g[g.length - 1];
  const c = owner(b) || owner(a);
  if (c) c.holes.push({ ref: h.tags && h.tags.ref, a, b });
}
// Places for the city when addr:city is missing.
const places = (D.places || []).filter((p) => p.tags && p.tags.name).map((p) => ({ name: p.tags.name, p: [p.lat, p.lon] }));
const nearestPlace = (p) => { let best = null, bd = Infinity; for (const q of places) { const d = dist(p, q.p); if (d < bd) { bd = d; best = q.name; } } return best || '?'; };
const rows = courses.map((c) => {
  const near = (p, list, m) => list.some((q) => dist(p, q) <= m);
  // A hole counts when its line ENDS (either end) at a mapped green, and has a tee when the other end is near a tee.
  let withGreen = 0, withTee = 0;
  const greensUsed = new Set();
  for (const h of c.holes) {
    let gi = -1, gd = 50;
    c.greens.forEach((g, i) => { const d = Math.min(dist(h.b, g), dist(h.a, g)); if (d < gd) { gd = d; gi = i; } });
    if (gi >= 0) { withGreen++; greensUsed.add(gi); }
    if (near(h.a, c.tees, 80) || near(h.b, c.tees, 80)) withTee++;
  }
  const refs = c.holes.map((h) => parseInt(h.ref, 10)).filter((n) => n > 0 && n < 100);
  const tagHoles = parseInt(c.tags.holes || c.tags['golf:holes'] || c.tags['golf:course:holes'] || '', 10);
  let nominal = tagHoles > 0 ? tagHoles : 18;
  const maxRef = refs.length ? Math.max(...refs) : 0;
  // Hole count from the hole NUMBERS, not the number of lines (a stray duplicate
  // line must not make an 18 a 27): numbers past 18 -> 27/36; most of 1-18 twice
  // -> two courses in one outline (36); else 18.
  if (!(tagHoles > 0)) {
    const per = {};
    refs.forEach((n) => { per[n] = (per[n] || 0) + 1; });
    const distinct = Object.keys(per).length, twice = Object.keys(per).filter((n) => n <= 18 && per[n] >= 2).length;
    if (maxRef > 18) nominal = Math.ceil(maxRef / 9) * 9;
    else if (twice >= 12) nominal = 36;
    else if (distinct > 18) nominal = Math.ceil(distinct / 9) * 9;
  }
  const greens = Math.min(Math.max(c.greens.length, withGreen), nominal), lines = Math.min(c.holes.length, nominal), tees = Math.min(withTee, nominal);
  const ready = Math.min(withGreen, nominal);
  const status = greens === 0 ? 'NONE' : greens >= nominal ? 'FULL' : 'PARTIAL';
  const bundleReady = status === 'FULL' && ready >= nominal;
  const name = c.tags.name || '(unnamed)';
  const city = c.tags['addr:city'] || nearestPlace(c.center);
  const flag = FLAGS.find(([, re]) => new RegExp(re, 'i').test(name));
  const bundled = BUNDLED.has(c.id);
  return { id: c.id, name, city, nominal, knownHoles: tagHoles > 0, greens, tees, lines, ready, status, bundleReady, bundled, flag: flag ? flag[0] : null, center: c.center.map((x) => +x.toFixed(4)) };
});
rows.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
const count = (s) => rows.filter((r) => r.status === s).length;
const sum = { area: title, total: rows.length, full: count('FULL'), partial: count('PARTIAL'), none: count('NONE'),
  bundleReady: rows.filter((r) => r.bundleReady && !r.bundled).map((r) => ({ name: r.name, city: r.city, holes: r.nominal, flag: r.flag, id: r.id })),
  alreadyBundled: rows.filter((r) => r.bundled).map((r) => r.name),
  flagged: FLAGS.map(([label, re]) => ({ label, hits: rows.filter((r) => r.flag === label).map((r) => ({ name: r.name, city: r.city, status: r.status, greens: r.greens, holes: r.nominal, bundleReady: r.bundleReady, bundled: r.bundled })) })) };
const nm = (r) => (r.flag ? '**' + r.name + '** ★' : r.name) + (r.bundled ? ' (bundled)' : r.bundleReady ? ' — bundle-ready' : '');
const sec = (st, head) => { const rs = rows.filter((r) => r.status === st); return `## ${head} (${rs.length})\n\n| City | Course | Greens | Hole lines ending at a green | Tees | OSM |\n|---|---|---|---|---|---|\n`
  + rs.map((r) => `| ${r.city} | ${nm(r)} | ${r.greens}/${r.nominal}${r.knownHoles ? '' : ''} | ${r.ready}/${r.nominal} | ${r.tees}/${r.nominal} | ${r.id} |`).join('\n') + '\n'; };
const md = `# OSM golf coverage — ${title}\n\nData © OpenStreetMap contributors, available under the Open Database License (ODbL): https://www.openstreetmap.org/copyright\n\nFetched ${new Date().toISOString().slice(0, 10)} from OpenStreetMap (Overpass). ${rows.length} courses: every leisure=golf_course outline is one row, so a 27/36-hole club mapped as separate courses counts once per course.\n\n`
  + `- **Greens** = holes with a green: golf=green areas inside (or within 250 m of) the course, practice / putting greens left out, never fewer than the holes whose line ends on a green (a double green serves two holes), capped at the hole count.\n`
  + `- **Hole count** = the course's \`holes\` tag when OSM has one, else 18 (more when its hole lines go past 18). A 9-hole course with no \`holes\` tag is measured out of 18.\n`
  + `- **ALL GREENS** = a green for every hole. **PARTIAL** = some. **NONE** = outline only.\n`
  + `- **Bundle-ready** = all greens AND every hole has a hole line (golf=hole) ending at its green - what tools/gps-import-osm.js needs to bundle a course. **(bundled)** = already in the app.\n`
  + `- City = the course's addr:city, else the nearest town in OSM. ★ = a course Manny plays.\n\n`
  + `**Summary:** ${sum.total} courses — all greens ${sum.full}, partial ${sum.partial}, none ${sum.none} (${(100 * sum.full / Math.max(1, sum.total)).toFixed(0)}% with all greens). Bundle-ready, not yet bundled: ${sum.bundleReady.length}.\n\n`
  + sec('FULL', 'ALL GREENS') + '\n' + sec('PARTIAL', 'PARTIAL') + '\n' + sec('NONE', 'NONE (outline only)');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, tag + '.md'), md);
fs.writeFileSync(path.join(RAW, tag + '.summary.json'), JSON.stringify(sum));
  return rows;
  console.log(JSON.stringify({ area: sum.area, total: sum.total, full: sum.full, partial: sum.partial, none: sum.none, bundleReady: sum.bundleReady.length, bundled: sum.alreadyBundled }));

}

const byState = {};
AREAS.forEach((A) => {
    const rows = area(A);
    byState[A.state] = rows.map((r) => [Number(r.id.slice(1)) * (r.id[0] === 'r' ? -1 : 1), r.name, r.city, r.greens, r.ready, r.nominal, r.bundleReady ? 1 : 0, r.center[0], r.center[1]]);
});
Object.keys(byState).forEach((st) => {
    const file = path.join(ROOT, 'gps-coverage-' + st.toLowerCase() + '.js');
    const head = '// GENERATED by tools/gps-osm-coverage.js - do not edit by hand.\n'
        + '// HardPan GPS coverage list for ' + st + ': every OpenStreetMap golf course, as\n'
        + '// [osm id (negative = relation), name, city, holes with a green, holes with a green\n'
        + '//  AND a hole line ending on it, holes, bundle-ready 0/1, lat, lon]. No outlines.\n'
        + '// Contains information from OpenStreetMap (ODbL v1.0): (c) OpenStreetMap contributors,\n'
        + '// https://www.openstreetmap.org/copyright\n';
    const body = '(function () {\n    var w = typeof window !== \'undefined\' ? window : null;\n    var data = { state: ' + JSON.stringify(st) + ', fetched: ' + JSON.stringify(new Date().toISOString().slice(0, 10)) + ', rows: ' + JSON.stringify(byState[st]) + ' };\n'
        + '    if (typeof module !== \'undefined\' && module.exports) module.exports = data;\n    if (w) { w.HardPanGpsCoverage = w.HardPanGpsCoverage || {}; w.HardPanGpsCoverage[' + JSON.stringify(st) + '] = data; }\n})();\n';
    fs.writeFileSync(file, head + body);
    console.log(path.basename(file), (fs.statSync(file).size / 1024).toFixed(1) + ' KB', byState[st].length, 'courses');
});
