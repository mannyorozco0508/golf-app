// ============================================================================
// HARDPAN GPS - THE ARITHMETIC (gps-v1, 2026-10-06)
//
// Pure functions only: no DOM, no Firebase, no Leaflet, no network. gps-view.js
// draws; this file decides every number a golfer reads off the GPS screen, so
// every number here is a test (gps_geo_test.js).
//
// WHAT IS IN HERE
//   haversineMeters / haversineYards   great-circle distance on a sphere of the
//                                      IUGG mean radius. On a golf hole (< 600 m)
//                                      the sphere-vs-ellipsoid error is ~0.3% at
//                                      worst - under a yard at 300 yards.
//   greenNumbers(me, green)            FRONT / MIDDLE / BACK. Middle is the green
//                                      polygon's area centroid. Front and back are
//                                      where the line from the golfer through that
//                                      centroid crosses the green's edge, nearest
//                                      and farthest. Recomputed on every fix, so
//                                      they move with the golfer's angle of attack.
//   osmToCourseGps(elements)           an Overpass `out geom` response -> one small
//                                      record per hole: tee, hole-line end, green
//                                      polygon. Greens are matched to hole numbers
//                                      by golf=hole ref= and by proximity to the
//                                      END of that hole's way.
//   resolveHole(record, n, pins)       which middle/front/back the screen uses:
//                                      a golfer-tapped pin beats OSM; the newest
//                                      pin wins; each pin keeps the value it
//                                      replaced so a bad fix can be undone.
//
// LICENCE BOUNDARY. Everything under `osm` in a hole record is derived from
// OpenStreetMap (ODbL). Everything under a pin is a golfer's tap on imagery.
// They are kept in separate fields on purpose - see docs/gps-step0.md - so the
// OSM-derived part can be handed over under ODbL without dragging the taps
// with it, and a tap never silently becomes "OSM data".
//
// PRIVACY. Nothing here stores or sends anything. The golfer's position goes
// in as an argument and comes out as yardages; it is never part of a record.
// ============================================================================

(function () {
    'use strict';

    var EARTH_RADIUS_M = 6371008.8;      // IUGG mean Earth radius
    var M_PER_YD = 0.9144;               // exact, by definition
    var WEAK_GPS_YARDS = 15;             // worse than +/-15 yds = "Weak GPS"
    var GREEN_MATCH_M = 60;              // a green this close to a hole-line end belongs to it
    var MAX_GREEN_VERTICES = 48;         // what a record keeps per green polygon

    function toRad(d) { return d * Math.PI / 180; }

    // [lat, lng] in, metres out.
    function haversineMeters(a, b) {
        var dLat = toRad(b[0] - a[0]);
        var dLng = toRad(b[1] - a[1]);
        var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
              + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
    }
    function haversineYards(a, b) { return haversineMeters(a, b) / M_PER_YD; }

    // Display distance in the golfer's unit, whole numbers, as a golfer reads it.
    function distanceIn(meters, unit) {
        if (meters == null || !isFinite(meters)) return null;
        return Math.round(unit === 'm' ? meters : meters / M_PER_YD);
    }

    // coords.accuracy is a 68% radius in metres. Shown honestly, never rounded
    // DOWN to look better: +/-4.6 m is "+/-6 yds", not "+/-5".
    function accuracyLabel(accuracyM, unit) {
        if (accuracyM == null || !isFinite(accuracyM) || accuracyM < 0) return { text: 'GPS: waiting', weak: true };
        var yards = accuracyM / M_PER_YD;
        var shown = Math.ceil(unit === 'm' ? accuracyM : yards);
        var weak = yards > WEAK_GPS_YARDS;
        var unitText = unit === 'm' ? 'm' : 'yds';
        return { text: (weak ? 'Weak GPS ±' : '±') + shown + ' ' + unitText, weak: weak };
    }

    // ---- LOCAL PLANE ---------------------------------------------------------
    // Within a few hundred metres an equirectangular projection about a local
    // origin is accurate to millimetres, and it makes polygon geometry (area,
    // centroid, line crossings) ordinary 2-D arithmetic. Distances the golfer
    // reads are always re-measured with haversine on the unprojected points.
    function projector(origin) {
        var kx = toRad(1) * EARTH_RADIUS_M * Math.cos(toRad(origin[0]));
        var ky = toRad(1) * EARTH_RADIUS_M;
        return {
            fwd: function (p) { return [(p[1] - origin[1]) * kx, (p[0] - origin[0]) * ky]; },
            inv: function (xy) { return [origin[0] + xy[1] / ky, origin[1] + xy[0] / kx]; }
        };
    }

    function cleanRing(ring) {
        var out = [];
        (ring || []).forEach(function (p) {
            if (!p || !isFinite(p[0]) || !isFinite(p[1])) return;
            var last = out[out.length - 1];
            if (last && last[0] === p[0] && last[1] === p[1]) return;
            out.push([+p[0], +p[1]]);
        });
        if (out.length > 1) {
            var f = out[0], l = out[out.length - 1];
            if (f[0] === l[0] && f[1] === l[1]) out.pop();     // OSM closes rings; we do not need the repeat
        }
        return out;
    }

    // Area centroid (shoelace). Falls back to the vertex mean for a degenerate
    // sliver, which is still the middle of whatever was drawn.
    function polygonCentroid(ring) {
        var r = cleanRing(ring);
        if (r.length === 0) return null;
        if (r.length < 3) {
            var sx = 0, sy = 0;
            r.forEach(function (p) { sx += p[0]; sy += p[1]; });
            return [sx / r.length, sy / r.length];
        }
        var proj = projector(r[0]);
        var pts = r.map(proj.fwd);
        var a = 0, cx = 0, cy = 0;
        for (var i = 0; i < pts.length; i++) {
            var p = pts[i], q = pts[(i + 1) % pts.length];
            var cross = p[0] * q[1] - q[0] * p[1];
            a += cross; cx += (p[0] + q[0]) * cross; cy += (p[1] + q[1]) * cross;
        }
        if (Math.abs(a) < 1e-6) {
            var mx = 0, my = 0;
            pts.forEach(function (p) { mx += p[0]; my += p[1]; });
            return proj.inv([mx / pts.length, my / pts.length]);
        }
        a *= 0.5;
        return proj.inv([cx / (6 * a), cy / (6 * a)]);
    }

    function pointInRing(pt, ring) {
        var r = cleanRing(ring);
        if (r.length < 3) return false;
        var inside = false;
        for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
            var yi = r[i][0], xi = r[i][1], yj = r[j][0], xj = r[j][1];
            if (((yi > pt[0]) !== (yj > pt[0])) && (pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
    }

    // FRONT / MIDDLE / BACK from where the golfer stands.
    //
    // The ray starts at the golfer and passes through the centroid. Every place
    // it crosses the green's edge is a candidate; the nearest is the front, the
    // farthest the back. A golfer standing ON the green has no front (they are
    // past it) - front is null and the screen says so rather than printing 0.
    //
    // Returns metres, plus the three points so the map can draw them.
    function greenNumbers(me, greenRing, middleOverride) {
        var ring = cleanRing(greenRing);
        var mid = middleOverride || polygonCentroid(ring);
        if (!mid) return null;
        var out = {
            middle: mid, front: null, back: null,
            middleM: me ? haversineMeters(me, mid) : null, frontM: null, backM: null,
            onGreen: false
        };
        if (!me || ring.length < 3) return out;
        var proj = projector(mid);
        var P = proj.fwd(me), C = [0, 0];
        var d = [C[0] - P[0], C[1] - P[1]];
        var len = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
        if (len < 0.01) { out.onGreen = pointInRing(me, ring); return out; }   // standing on the centroid
        var pts = ring.map(proj.fwd);
        var ts = [];
        for (var i = 0; i < pts.length; i++) {
            var A = pts[i], B = pts[(i + 1) % pts.length];
            var e = [B[0] - A[0], B[1] - A[1]];
            var den = d[0] * e[1] - d[1] * e[0];
            if (Math.abs(den) < 1e-12) continue;                               // parallel edge
            var w = [A[0] - P[0], A[1] - P[1]];
            var t = (w[0] * e[1] - w[1] * e[0]) / den;                          // along the ray
            var u = (w[0] * d[1] - w[1] * d[0]) / den;                          // along the edge
            if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
        }
        if (!ts.length) return out;
        ts.sort(function (a, b) { return a - b; });
        out.onGreen = pointInRing(me, ring);
        var at = function (t) { return proj.inv([P[0] + d[0] * t, P[1] + d[1] * t]); };
        out.back = at(ts[ts.length - 1]);
        out.backM = haversineMeters(me, out.back);
        if (!out.onGreen) {
            out.front = at(ts[0]);
            out.frontM = haversineMeters(me, out.front);
        }
        return out;
    }

    // Keep a green polygon small enough to live in a course record: at most
    // MAX_GREEN_VERTICES points, six decimals (~0.1 m).
    function compactRing(ring) {
        var r = cleanRing(ring);
        if (r.length > MAX_GREEN_VERTICES) {
            var step = r.length / MAX_GREEN_VERTICES, kept = [];
            for (var i = 0; i < MAX_GREEN_VERTICES; i++) kept.push(r[Math.floor(i * step)]);
            r = kept;
        }
        return r.map(roundPt);
    }
    function roundPt(p) { return [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6]; }
    // A hole line, thinned: a point is dropped when it is within 2 m of the straight
    // line between its kept neighbours (Douglas-Peucker). Doglegs keep their corner.
    function simplifyLine(line) {
        var pts = (line || []).filter(function (p) { return p && isFinite(p[0]) && isFinite(p[1]); });
        if (pts.length <= 2) return pts;
        var proj = projector(pts[0]), xy = pts.map(proj.fwd), keep = {};
        keep[0] = keep[pts.length - 1] = true;
        (function dp(a, b) {
            var best = -1, bi = -1, ax = xy[a], bx = xy[b], dx = bx[0] - ax[0], dy = bx[1] - ax[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
            for (var i = a + 1; i < b; i++) {
                var d = Math.abs(dy * xy[i][0] - dx * xy[i][1] + bx[0] * ax[1] - bx[1] * ax[0]) / L;
                if (d > best) { best = d; bi = i; }
            }
            if (best > 2) { keep[bi] = true; dp(a, bi); dp(bi, b); }
        })(0, pts.length - 1);
        return pts.filter(function (p, i) { return keep[i]; });
    }
    var MAX_FAIRWAY_VERTICES = 40;
    function compactFairway(ring) {
        var r = cleanRing(ring);
        if (r.length > MAX_FAIRWAY_VERTICES) {
            var step = r.length / MAX_FAIRWAY_VERTICES, kept = [];
            for (var i = 0; i < MAX_FAIRWAY_VERTICES; i++) kept.push(r[Math.floor(i * step)]);
            r = kept;
        }
        return r.map(function (p) { return [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]; });
    }

    // ---- THE DEFAULT TARGET (build 6, 2026-10-09) ------------------------------
    // Where the target sits before the golfer touches it. Manny's rules:
    //   par 3                      -> the green's center
    //   par 4 / 5 from the tee     -> DEFAULT_SHOT_YD along the hole's own line
    //                                 (doglegs followed), never closer than
    //                                 MIN_LEFT_YD to the green's center
    //   on the hole (GPS)          -> DEFAULT_SHOT_YD along the line from the
    //                                 golfer, or the green's center within
    //                                 GREEN_REACH_YD of it
    //   a fairway mapped for it    -> moved to the nearest point inside it
    // Par is the CARD's. DEFAULT_SHOT_YD is ONE constant so My Clubs can later
    // put the golfer's own driver carry in its place.
    var DEFAULT_SHOT_YD = 260, MIN_LEFT_YD = 60, GREEN_REACH_YD = 280;
    // Walk `meters` along `line`, starting where `from` projects onto it. Past the
    // end: the end.
    function pointAlongHole(line, from, meters) {
        if (!line || line.length < 2) return null;
        var proj = projector(line[0]), xy = line.map(proj.fwd), f = proj.fwd(from || line[0]);
        var segs = [], total = 0;
        for (var i = 1; i < xy.length; i++) {
            var a = xy[i - 1], b = xy[i], len = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
            segs.push({ a: a, b: b, len: len, from: total }); total += len;
        }
        var bestD = Infinity, start = 0;
        segs.forEach(function (sg) {
            var dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1];
            var u = sg.len ? Math.max(0, Math.min(1, ((f[0] - sg.a[0]) * dx + (f[1] - sg.a[1]) * dy) / (sg.len * sg.len))) : 0;
            var x = sg.a[0] + u * dx - f[0], y = sg.a[1] + u * dy - f[1], d = Math.sqrt(x * x + y * y);
            if (d < bestD) { bestD = d; start = sg.from + u * sg.len; }
        });
        var want = Math.min(total, start + Math.max(0, meters));
        for (var k = 0; k < segs.length; k++) {
            var s2 = segs[k];
            if (want <= s2.from + s2.len || k === segs.length - 1) {
                var u2 = s2.len ? Math.max(0, Math.min(1, (want - s2.from) / s2.len)) : 0;
                return proj.inv([s2.a[0] + u2 * (s2.b[0] - s2.a[0]), s2.a[1] + u2 * (s2.b[1] - s2.a[1])]);
            }
        }
        return line[line.length - 1];
    }
    // How far along `line` from where `from` projects to its end, in metres.
    function lengthAlong(line, from) {
        if (!line || line.length < 2) return 0;
        var total = 0;
        for (var i = 1; i < line.length; i++) total += haversineMeters(line[i - 1], line[i]);
        return Math.max(0, total * (1 - alongLine(from, line).t));
    }
    // Inside a fairway already: unchanged. Otherwise the nearest point on the
    // nearest fairway's edge, moved 3 m inside it.
    function snapToFairway(pt, rings) {
        if (!pt || !rings || !rings.length) return pt;
        if (rings.some(function (r) { return pointInRing(pt, r); })) return pt;
        var proj = projector(pt), best = null;
        rings.forEach(function (ring) {
            var xy = ring.map(proj.fwd);
            for (var i = 1; i < xy.length; i++) {
                var a = xy[i - 1], b = xy[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
                var u = L2 ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / L2)) : 0;
                var x = a[0] + u * dx, y = a[1] + u * dy, d = Math.sqrt(x * x + y * y);
                if (!best || d < best.d) best = { d: d, x: x, y: y, ring: ring };
            }
        });
        if (!best) return pt;
        var c = proj.fwd(polygonCentroid(best.ring)), vx = c[0] - best.x, vy = c[1] - best.y, vl = Math.sqrt(vx * vx + vy * vy) || 1;
        var inside = proj.inv([best.x + vx / vl * 3, best.y + vy / vl * 3]);
        return pointInRing(inside, best.ring) ? inside : proj.inv([best.x, best.y]);
    }
    // o: { par, tee, mid, line?, fairway?, from: 'me' | 'tee', pt, shotYd? }
    function defaultTarget(o) {
        if (!o || !o.mid) return null;
        if (Number(o.par) === 3) return o.mid;
        var shotM = (o.shotYd || DEFAULT_SHOT_YD) * M_PER_YD;
        var line = (o.line && o.line.length >= 2) ? o.line : (o.tee ? [o.tee, o.mid] : null);
        if (!line) return o.mid;
        var start = o.from === 'me' && o.pt ? o.pt : (o.tee || line[0]);
        // A back tee (or a golfer) BEHIND where the drawn line starts: the walk
        // starts from them, not from the line's first point - otherwise "260 along
        // the line" lands 260 past the line's start, further than 260 from the tee.
        var a0 = alongLine(start, line);
        if (a0.t === 0 && a0.d > 5) line = [start].concat(line);
        var alongM;
        if (o.from === 'me' && o.pt) {
            if (haversineMeters(o.pt, o.mid) <= GREEN_REACH_YD * M_PER_YD) return o.mid;
            alongM = shotM;
        } else {
            // The hole's length from the tee: along its line to the line's end, then
            // on to the green's center.
            var lenM = lengthAlong(line, start) + haversineMeters(line[line.length - 1], o.mid);
            alongM = Math.min(shotM, lenM - MIN_LEFT_YD * M_PER_YD);
            if (alongM <= 0) return o.mid;
        }
        var t = pointAlongHole(line, start, alongM) || o.mid;
        // Never closer than MIN_LEFT_YD to the green (a short line, a snap).
        t = snapToFairway(t, o.fairway);
        if (haversineMeters(t, o.mid) < MIN_LEFT_YD * M_PER_YD && o.from !== 'me') return pointAlongHole(line, start, Math.max(0, alongM)) || o.mid;
        return t;
    }



    // ---- OSM -> HOLE RECORDS ------------------------------------------------
    //
    // Input: the `elements` of an Overpass `[out:json] ... out geom;` response.
    // Output: { holes: { "1": { osm: {...} }, ... }, counts: {...} }.
    //
    // MATCHING A GREEN TO A HOLE, in order of trust:
    //   1. a golf=green carrying the same ref= as the hole (rare, but explicit);
    //   2. a green whose polygon CONTAINS the end of the hole's way (the way is
    //      drawn tee -> green, so its last node sits on the green it plays to);
    //   3. the green whose centroid is nearest that end, within GREEN_MATCH_M.
    // A hole with no golf=hole way gets no green: proximity to nothing proves
    // nothing, and a wrong green is worse than "tap the middle of the green".
    function geomOf(el) {
        if (el.geometry && el.geometry.length) return el.geometry.map(function (g) { return [g.lat, g.lon]; });
        if (el.type === 'relation' && el.members) {
            var outer = el.members.filter(function (m) { return m.role === 'outer' && m.geometry; })[0];
            if (outer) return outer.geometry.map(function (g) { return [g.lat, g.lon]; });
        }
        if (el.type === 'node' && isFinite(el.lat)) return [[el.lat, el.lon]];
        return null;
    }
    // EVERY OUTER RING OF A MULTIPOLYGON (2026-10-10). geomOf above returns a
    // relation's FIRST outer member only - and a golf=green mapped as a relation
    // can have several outer pieces (Lewis River 11: the green AND the bunker
    // beside it, the bunker first), or one ring drawn as several member ways. Here
    // the outer members are stitched end to end into closed rings; inners (holes
    // in the shape) are ignored. A way is its own single ring.
    function outerRings(el) {
        if (el.type !== 'relation' || !el.members) { var g = geomOf(el); return g && g.length >= 3 ? [g] : []; }
        var segs = el.members.filter(function (m) { return m.role !== 'inner' && m.geometry && m.geometry.length >= 2; })
            .map(function (m) { return m.geometry.map(function (p) { return [p.lat, p.lon]; }); });
        var key = function (p) { return p[0].toFixed(7) + ',' + p[1].toFixed(7); };
        var rings = [];
        while (segs.length) {
            var ring = segs.shift(), grew = true;
            while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
                grew = false;
                for (var i = 0; i < segs.length; i++) {
                    var sg = segs[i], end = key(ring[ring.length - 1]);
                    if (key(sg[0]) === end) { ring = ring.concat(sg.slice(1)); segs.splice(i, 1); grew = true; break; }
                    if (key(sg[sg.length - 1]) === end) { ring = ring.concat(sg.slice().reverse().slice(1)); segs.splice(i, 1); grew = true; break; }
                }
            }
            if (ring.length >= 3) rings.push(ring);
        }
        return rings;
    }
    function holeRef(tags) {
        var m = String((tags && tags.ref) || '').match(/^\s*(\d{1,2})\s*$/);
        var n = m ? parseInt(m[1], 10) : NaN;
        return (n >= 1 && n <= 27) ? n : null;
    }

    // opts.holeFilter(tags)  keep only these hole ways (a club with two courses
    //                        under one polygon - Myrtlewood - by golf:course:name)
    // opts.holeNumber(tags)  the hole's number when ref= is not it (Thistle's
    //                        refs are unreliable; its names are "Cameron - Hole 3")
    // Distance (m) from p to a polyline, and how far along the line (0..1) the
    // nearest point is.
    function alongLine(p, line) {
        var proj = projector(p);
        var P = [0, 0], best = { d: Infinity, t: 0 }, total = 0, segs = [];
        for (var i = 1; i < line.length; i++) {
            var a = proj.fwd(line[i - 1]), b = proj.fwd(line[i]);
            var len = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
            segs.push({ a: a, b: b, len: len, from: total });
            total += len;
        }
        segs.forEach(function (sg) {
            var dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1];
            var u = sg.len ? Math.max(0, Math.min(1, ((P[0] - sg.a[0]) * dx + (P[1] - sg.a[1]) * dy) / (sg.len * sg.len))) : 0;
            var x = sg.a[0] + u * dx, y = sg.a[1] + u * dy;
            var d = Math.sqrt(x * x + y * y);
            if (d < best.d) best = { d: d, t: total ? (sg.from + u * sg.len) / total : 0 };
        });
        return best;
    }
    function teeFor(line, teeBoxes, greenMid, ref) {
        var cands = teeBoxes.filter(function (t) {
            if (!t.at) return false;
            if (ref && t.ref === ref) return true;
            var a = alongLine(t.at, line);
            return a.d <= 45 && a.t <= 0.45;
        });
        if (!cands.length) return null;
        cands.sort(function (x, y) { return haversineMeters(y.at, greenMid) - haversineMeters(x.at, greenMid); });
        return cands[0].at;
    }

    function osmToCourseGps(elements, opts) {
        opts = opts || {};
        var holes = [], greens = [], teeBoxes = [], tees = 0, fairways = 0, fairwayRings = [];
        (elements || []).forEach(function (el) {
            var tags = el.tags || {};
            var g = geomOf(el);
            if (!g) return;
            if (tags.golf === 'hole' && el.type === 'way') {
                if (opts.holeFilter && !opts.holeFilter(tags)) return;
                var num = opts.holeNumber ? opts.holeNumber(tags) : holeRef(tags);
                holes.push({ ref: num, par: parseInt(tags.par, 10) || null, line: g, id: el.id });
            }
            // A green relation: each outer piece is a candidate of its own, so a hole
            // takes the piece its line ends in (or the nearest) - its Front / Center /
            // Back are that piece's, never the combined shape's.
            else if (tags.golf === 'green') outerRings(el).forEach(function (ring, i, all) {
                greens.push({ ref: holeRef(tags), ring: cleanRing(ring), id: el.type + '/' + el.id + (all.length > 1 ? '#' + i : '') });
            });
            else if (tags.golf === 'tee') { tees++; teeBoxes.push({ ref: holeRef(tags), at: g.length >= 3 ? polygonCentroid(g) : g[0] }); }
            else if (tags.golf === 'fairway') { fairways++; outerRings(el).forEach(function (ring) { fairwayRings.push(cleanRing(ring)); }); }
        });
        greens.forEach(function (gr) { gr.centroid = polygonCentroid(gr.ring); });

        var out = {};
        var refsSeen = {};
        holes.forEach(function (h) {
            if (!h.ref) return;
            if (refsSeen[h.ref]) return;              // a duplicate ref: first way wins, the report says so
            refsSeen[h.ref] = true;
            var end = h.line[h.line.length - 1];
            // Greens tagged with this hole's number first - and of those (a relation's
            // several pieces), the one the line ends in, else the nearest.
            var byRef = opts.holeNumber ? [] : greens.filter(function (gr) { return gr.ref === h.ref; });
            var nearest = function (list) {
                var b = null, bd = Infinity;
                list.forEach(function (gr) { var dd = haversineMeters(end, gr.centroid); if (dd < bd) { bd = dd; b = gr; } });
                return b;
            };
            var green = byRef.filter(function (gr) { return pointInRing(end, gr.ring); })[0]
                || (byRef.length ? nearest(byRef) : null)
                || greens.filter(function (gr) { return pointInRing(end, gr.ring); })[0]
                || null;
            if (!green) {
                var best = null, bestD = Infinity;
                greens.forEach(function (gr) {
                    var dd = haversineMeters(end, gr.centroid);
                    if (dd < bestD) { bestD = dd; best = gr; }
                });
                if (best && bestD <= GREEN_MATCH_M) green = best;
            }
            var lineM = 0;
            for (var li = 1; li < h.line.length; li++) lineM += haversineMeters(h.line[li - 1], h.line[li]);
            // lineM: the hole's length along its drawn line (doglegs included).
            // THE TEE (2026-10-07): the BACK tee of this hole - of the tee boxes
            // on the first part of this hole's line, the one farthest from the
            // green. A tee box sits on the line (within 45 m of it) and in its
            // first 45%, so the previous hole's tees and this hole's fairway
            // cannot be mistaken for it. None mapped: the line's start, which is
            // where a hole way begins by convention.
            var greenMid = green ? green.centroid : end;
            var back = teeFor(h.line, teeBoxes, greenMid, h.ref);
            var rec = { tee: roundPt(back || h.line[0]), end: roundPt(end), lineM: Math.round(lineM) };
            // BUILD 6: the hole's own line (so the default target follows a dogleg)
            // and the fairway polygons that belong to it - those whose middle sits
            // within 45 m of this hole's line, past its first 5% and before its last.
            rec.line = simplifyLine(h.line).map(roundPt);
            var fw = fairwayRings.filter(function (ring) {
                var c = polygonCentroid(ring), a = alongLine(c, h.line);
                return a.d <= 45 && a.t > 0.05 && a.t < 0.98;
            }).map(compactFairway);
            if (fw.length) rec.fairway = fw;
            if (back) rec.teeFrom = 'tee-box'; else rec.teeFrom = 'line-start';
            if (h.par) rec.par = h.par;
            if (green) {
                rec.green = compactRing(green.ring);
                rec.mid = roundPt(green.centroid);
                rec.greenId = green.id;
            }
            out[String(h.ref)] = { osm: rec };
        });
        var matched = Object.keys(out).filter(function (k) { return out[k].osm.green; }).length;
        return {
            holes: out,
            counts: { holeWays: Object.keys(refsSeen).length, greens: greens.length, tees: tees, fairways: fairways, greensMatched: matched }
        };
    }

    // ---- WHICH NUMBERS THE SCREEN USES -------------------------------------
    //
    // `pins` is an array of pin records from anywhere (the shared course record,
    // this round, this phone) - { mid, front?, back?, at, prev? } with points as
    // {lat, lng}. The newest wins. A pin beats OSM: it is either the first and
    // only data for an unmapped hole, or an organizer's correction of OSM.
    function pinPt(p) {
        if (!p) return null;
        if (Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])) return [+p[0], +p[1]];
        if (isFinite(p.lat) && isFinite(p.lng)) return [+p.lat, +p.lng];
        return null;
    }
    function newestPin(pins) {
        var best = null;
        (pins || []).forEach(function (p) {
            if (!p || !pinPt(p.mid)) return;
            if (!best || (Number(p.at) || 0) > (Number(best.at) || 0)) best = p;
        });
        return best;
    }
    function resolveHole(holeRecord, pins) {
        var osm = (holeRecord && holeRecord.osm) || null;
        var pin = newestPin(pins);
        if (pin) {
            return {
                source: 'pin', pin: pin,
                mid: pinPt(pin.mid), front: pinPt(pin.front), back: pinPt(pin.back),
                green: osm && osm.green ? osm.green : null,
                tee: osm ? pinPt(osm.tee) : null,
                // A tapped middle sits on the green it names; if it is NOT on
                // the OSM polygon the organizer has moved the hole to a different
                // green, and front/back from that polygon would be lies.
                useGreenForEdges: !!(osm && osm.green && pointInRing(pinPt(pin.mid), osm.green))
            };
        }
        if (osm && osm.green) {
            return { source: 'osm', mid: pinPt(osm.mid) || polygonCentroid(osm.green), front: null, back: null,
                     green: osm.green, tee: pinPt(osm.tee), useGreenForEdges: true };
        }
        // A CENTRE AND NO OUTLINE (a GolfAPI hole with only its centre, audit C5): the centre is
        // still the number a golfer most needs - shown, with no front / back.
        if (osm && pinPt(osm.mid)) {
            return { source: 'osm', mid: pinPt(osm.mid), front: null, back: null, green: null, tee: pinPt(osm.tee), useGreenForEdges: false };
        }
        return { source: 'none', mid: null, front: null, back: null, green: null, tee: osm ? pinPt(osm.tee) : null, useGreenForEdges: false };
    }

    // The yardages for one fix. Fixed front/back pins (tapped) are static
    // points; an OSM polygon gives front/back that move with the golfer.
    function holeNumbers(me, resolved) {
        if (!resolved || !resolved.mid) return null;
        if (resolved.useGreenForEdges && resolved.green && !resolved.front && !resolved.back) {
            var g = greenNumbers(me, resolved.green, resolved.mid);
            if (g) return g;
        }
        var r = { middle: resolved.mid, front: resolved.front, back: resolved.back,
                  middleM: null, frontM: null, backM: null, onGreen: false };
        if (me) {
            r.middleM = haversineMeters(me, resolved.mid);
            if (resolved.front) r.frontM = haversineMeters(me, resolved.front);
            if (resolved.back) r.backM = haversineMeters(me, resolved.back);
            // A set front / back is two fixed points: from beside or behind the green the "front"
            // can be the farther one. What the golfer needs is the near edge and the far edge.
            if (r.frontM != null && r.backM != null && r.frontM > r.backM) {
                var t = r.front; r.front = r.back; r.back = t;
                var tm = r.frontM; r.frontM = r.backM; r.backM = tm;
            }
        }
        return r;
    }

    // A new pin record. `prev` keeps the one it replaces - only one level, which
    // is what "undo a bad fix" needs; the record cannot grow without bound.
    function makePin(mid, front, back, previous, nowMs, by) {
        var pt = function (p) { p = pinPt(p); return p ? { lat: roundPt(p)[0], lng: roundPt(p)[1] } : null; };
        var rec = { mid: pt(mid), at: nowMs, by: by || 'tap' };
        if (pinPt(front)) rec.front = pt(front);
        if (pinPt(back)) rec.back = pt(back);
        if (previous && pinPt(previous.mid)) {
            var pv = { mid: pt(previous.mid), at: Number(previous.at) || 0 };
            if (pinPt(previous.front)) pv.front = pt(previous.front);
            if (pinPt(previous.back)) pv.back = pt(previous.back);
            rec.prev = pv;
        }
        return rec;
    }
    // Undo: the previous value comes back as a NEW pin (newest wins), stamped now
    // so it beats the bad fix everywhere it was copied. Null when there is
    // nothing to go back to.
    function undoPin(pin, nowMs) {
        if (!pin || !pin.prev || !pinPt(pin.prev.mid)) return null;
        return makePin(pin.prev.mid, pin.prev.front, pin.prev.back, null, nowMs, 'undo');
    }

    // The key a course's GPS record lives under. The round's activeCourseKey
    // when it has one; a 27-hole course (Thistle) adds the two nines from the
    // round's course name, because "hole 3" is a different green on every
    // pairing. A typed-in course with no key uses its name. Firebase-safe:
    // [a-z0-9_] only, never empty, never longer than 80.
    function slug(s) { return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
    function courseGpsKey(activeCourseKey, courseName, isLoopCourse) {
        var k = slug(activeCourseKey);
        if (k && isLoopCourse) {
            var m = String(courseName || '').match(/\(([^)]*)\)/);
            var nines = m ? slug(m[1].replace(/\b(nine|only)\b/gi, '')) : '';
            if (nines) k = k + '_' + nines;
        }
        if (!k) { var n = slug(courseName); k = n ? 'name_' + n : ''; }
        return k ? k.slice(0, 80) : null;
    }

    // THE BUNDLE BY NAME WHEN THE KEY MISSES (2026-10-10). A round can carry a
    // course key the bundle does not use for the same course - an import
    // ("thistle_cameron_stewart" for the bundle's "thistle_27_cameron_stewart"), an
    // older directory key. The importer writes each record's course name into
    // table._names; the round's own course name then finds it - the naming words
    // IN ORDER (so a Cameron / Stewart round never gets the Stewart / Cameron
    // pairing), and only an unambiguous match counts.
    var NAME_STOP = { golf: 1, club: 1, course: 1, country: 1, resort: 1, the: 1, and: 1, at: 1, of: 1, links: 1, gc: 1, cc: 1, nc: 1, sc: 1, hole: 1, holes: 1 };
    function courseNameKey(name) {
        return String(name || '').toLowerCase().replace(/['\u2019`]/g, '').split(/[^a-z0-9]+/)
            .filter(function (w) { return w && !NAME_STOP[w] && !/^\d+$/.test(w); }).join(' ');
    }
    // KNOWN ALIASES (audit C1, 2026-10-16): round keys from imports / trips that name a bundled
    // course another way. A name alone never makes an alias any more - "Pine Lakes Golf Club" in
    // Jacksonville got the Myrtle Pine Lakes greens - so these are listed, and anything else needs
    // the course's own location within 5 km of the bundled one.
    var KNOWN_ALIASES = { thistle_cameron_stewart: 'thistle_27_cameron_stewart', thistle_mackay_cameron: 'thistle_27_mackay_cameron' };
    var NEAR_M = 5000;
    // "(Front 9)" / "(Back 9)" are Round Setup's 9-hole suffixes: the course is the same (audit C6).
    function stripNineSuffix(name) { return String(name || '').replace(/\s*\((?:front|back)\s*9\)\s*$/i, ''); }
    function bundlePoint(rec) {
        var hs = rec && rec.holes, k = hs && Object.keys(hs)[0], h = k && (hs[k].osm || hs[k]);
        return h ? (h.tee || h.mid || null) : null;
    }
    function bundleKeyFor(table, key, name, loc) {
        if (table && key && table[key] && key !== '_names') return key;
        if (table && key && KNOWN_ALIASES[key] && table[KNOWN_ALIASES[key]]) return KNOWN_ALIASES[key];
        var names = table && table._names, want = courseNameKey(stripNineSuffix(name));
        if (!names || !want || !loc) return null;
        var hit = Object.keys(names).filter(function (k) {
            if (courseNameKey(names[k]) !== want) return false;
            var r = table[k]; var pt = r && (r.compose ? bundlePoint(table[r.compose[0]]) : bundlePoint(r));
            return !!pt && haversineMeters(loc, pt) <= NEAR_M;
        });
        return hit.length === 1 ? hit[0] : null;
    }

    // The OSM record for a course key from the bundled table. A 27-hole pairing
    // is stored as { compose: [frontNine, backNine] }: the back nine's holes
    // 1-9 become 10-18 - and so do its verify notes.
    function osmCourse(table, key) {
        var rec = table && table[key];
        if (!rec) return null;
        if (!rec.compose) return rec;
        var holes = {}, verify = {};
        rec.compose.forEach(function (part, i) {
            var p = table[part];
            if (!p || !p.holes) return;
            Object.keys(p.holes).forEach(function (n) { holes[String(Number(n) + 9 * i)] = p.holes[n]; });
            Object.keys(p.verify || {}).forEach(function (n) { verify[String(Number(n) + 9 * i)] = p.verify[n]; });
        });
        var out = { v: rec.v, holes: holes };
        if (Object.keys(verify).length) out.verify = verify;
        return out;
    }

    // ---- TILES FOR THE OFFLINE IMAGERY ---------------------------------------
    // Standard Web Mercator slippy-map tile numbering ({z}/{x}/{y}), which is
    // what USGS and Esri tile caches use.
    function tileXY(lat, lng, z) {
        var n = Math.pow(2, z);
        var latR = toRad(Math.max(-85.0511, Math.min(85.0511, lat)));
        var x = Math.floor((lng + 180) / 360 * n);
        var y = Math.floor((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n);
        return [Math.max(0, Math.min(n - 1, x)), Math.max(0, Math.min(n - 1, y))];
    }

    // The course area: every tee, hole-line end, green vertex and pin the app
    // knows for the course, padded by padM metres. Built from COURSE data only -
    // never from where the golfer is - so pre-caching the area says nothing
    // about anybody's position. Null when the course has no points at all.
    function courseBounds(osmRec, extraPts, padM) {
        var pts = [];
        var holes = (osmRec && osmRec.holes) || {};
        Object.keys(holes).forEach(function (k) {
            var o = holes[k] && holes[k].osm;
            if (!o) return;
            if (o.tee) pts.push(o.tee);
            if (o.end) pts.push(o.end);
            (o.green || []).forEach(function (p) { pts.push(p); });
        });
        (extraPts || []).forEach(function (p) { p = pinPt(p); if (p) pts.push(p); });
        if (!pts.length) return null;
        var s = 90, w = 180, nn = -90, e = -180;
        pts.forEach(function (p) { s = Math.min(s, p[0]); nn = Math.max(nn, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); });
        var pad = padM == null ? 150 : padM;
        var dLat = (pad / EARTH_RADIUS_M) * 180 / Math.PI;
        var dLng = dLat / Math.cos(toRad((s + nn) / 2));
        return { south: s - dLat, west: w - dLng, north: nn + dLat, east: e + dLng };
    }

    // Every tile covering `b` at each zoom in [zMin, zMax], coarse to fine. A
    // course is ~2 km across, so z13-z16 is a few dozen tiles; `cap` is a hard
    // ceiling so a bad bounding box can never turn into a bulk download.
    function tilesFor(b, zMin, zMax, cap) {
        var out = [];
        if (!b) return out;
        for (var z = zMin; z <= zMax; z++) {
            var a = tileXY(b.north, b.west, z), c = tileXY(b.south, b.east, z);
            for (var x = a[0]; x <= c[0]; x++) {
                for (var y = a[1]; y <= c[1]; y++) {
                    out.push({ z: z, x: x, y: y });
                    if (cap && out.length > cap) return null;   // refuse, do not truncate
                }
            }
        }
        return out;
    }

    function midpoint(a, b) {
        a = pinPt(a); b = pinPt(b);
        if (!a || !b) return null;
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }

    // ---- THE HOLE VIEW (2026-10-07) -------------------------------------------
    // Initial bearing from a to b, degrees clockwise from north, [0, 360).
    function bearingDeg(a, b) {
        var p1 = toRad(a[0]), p2 = toRad(b[0]), dl = toRad(b[1] - a[1]);
        var y = Math.sin(dl) * Math.cos(p2);
        var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    // TEE AT THE BOTTOM, GREEN AT THE TOP, THE WHOLE HOLE ON SCREEN. Returns the
    // camera for a rotating map with 512 px tiles (MapLibre): bearing = the
    // direction tee -> green, so that direction points up; zoom = the largest that
    // fits every point (tee, green outline) inside the view minus `pad`; center =
    // the middle of those points in the ROTATED frame, to be used with the same
    // `pad` as the map's camera padding. A geographic bounding box would be
    // fitted loosely when the hole runs diagonally; this fits the hole itself.
    var EQUATOR_M = 40075016.686;
    function holeCamera(tee, greenPts, view, pad, maxZoom) {
        var pts = [tee].concat(greenPts || []).filter(function (p) { return p && isFinite(p[0]) && isFinite(p[1]); });
        if (!tee || pts.length < 2) return null;
        var g = polygonCentroid(greenPts) || greenPts[0];
        return fitCamera(pts, bearingDeg(tee, g), view, pad, maxZoom);
    }
    // The camera that fits every point of `pts` with `bearing` up, inside the view
    // minus `pad` (holeCamera's fit, for any points and any bearing). Pure.
    function fitCamera(pts, bearing, view, pad, maxZoom) {
        pts = (pts || []).filter(function (p) { return p && isFinite(p[0]) && isFinite(p[1]); });
        if (!pts.length) return null;
        var th = toRad(bearing);
        var origin = pts[0], proj = projector(origin);
        var uv = pts.map(function (p) {
            var xy = proj.fwd(p);                       // x east, y north (m)
            return [xy[0] * Math.cos(th) - xy[1] * Math.sin(th),   // u: screen-right
                    xy[0] * Math.sin(th) + xy[1] * Math.cos(th)];  // v: screen-up
        });
        var uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
        uv.forEach(function (q) { uMin = Math.min(uMin, q[0]); uMax = Math.max(uMax, q[0]); vMin = Math.min(vMin, q[1]); vMax = Math.max(vMax, q[1]); });
        pad = pad || {};
        var availW = Math.max(40, view.w - (pad.left || 0) - (pad.right || 0));
        var availH = Math.max(40, view.h - (pad.top || 0) - (pad.bottom || 0));
        var u0 = (uMin + uMax) / 2, v0 = (vMin + vMax) / 2;
        var cu = Math.cos(th), su = Math.sin(th);
        // back from (u, v) to (x, y): x = u cos + v sin, y = -u sin + v cos
        var center = proj.inv([u0 * cu + v0 * su, -u0 * su + v0 * cu]);
        var k = EQUATOR_M * Math.cos(toRad(center[0])) / 512;   // metres per px at zoom 0
        var zU = Math.log2(k * availW / Math.max(1, uMax - uMin));
        var zV = Math.log2(k * availH / Math.max(1, vMax - vMin));
        var zoom = Math.min(zU, zV, maxZoom == null ? 22 : maxZoom);
        return { center: center, zoom: zoom, bearing: bearing };
    }

    // ---- HOLE FLYOVER (008, switch flyover) -------------------------------------------
    // Where the camera is a fraction t (0 = the tee, 1 = the green) of the way along the
    // hole's own line (tee -> dogleg -> green; just tee -> green without one), by
    // distance, and which way it looks: toward a point a fifth of the hole further on
    // (the last fifth looks at the green from where that fifth starts, so the view never
    // spins over the flag). Pure: { pt, bearing } or null.
    function flyoverFrame(line, t) {
        var pts = (line || []).map(pinPt).filter(Boolean);
        if (pts.length < 2) return null;
        var segs = [], total = 0;
        for (var i = 1; i < pts.length; i++) { var m = haversineMeters(pts[i - 1], pts[i]); segs.push(m); total += m; }
        if (!(total > 0)) return null;
        var at = function (f) {
            var want = Math.max(0, Math.min(1, f)) * total;
            for (var j = 0; j < segs.length; j++) {
                if (want <= segs[j] || j === segs.length - 1) {
                    var k = segs[j] ? Math.min(1, want / segs[j]) : 0;
                    return [pts[j][0] + (pts[j + 1][0] - pts[j][0]) * k, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * k];
                }
                want -= segs[j];
            }
            return pts[pts.length - 1];
        };
        var tt = Math.max(0, Math.min(1, Number(t) || 0));
        var from = tt > 0.8 ? at(0.8) : at(tt), to = tt > 0.8 ? pts[pts.length - 1] : at(tt + 0.2);
        return { pt: at(tt), bearing: bearingDeg(from, to) };
    }

    // ---- THE HOLE'S PATH + THE PREVIEW FLIGHT ALONG IT (009) --------------------------
    // Manny (mailbox 009): the preview flew the straight white line and sat too close. It
    // now flies the HOLE'S PATH, the best one the data has, in this order:
    //   centerline  the hole's own drawn line with a bend in it (OpenStreetMap golf=hole,
    //               or GolfAPI's dogleg point) - tee -> its corners -> green;
    //   target      the golfer's dragged target as the bend (tee -> target -> green);
    //   fairway     the middle of the fairway mapped for the hole (all its pieces);
    //   hazards     the middle between a left and a right fairway bunker (GolfAPI);
    //   straight    tee -> green, only when there is nothing else.
    // A bend counts only between the tee and the green (5-95% of the way, 25 m or more
    // short of the green, the detour at most 1.6x the straight line); a bend made from
    // the fairway or bunkers that turns less than 8 degrees is the straight line.
    // Pure: { pts: [tee, ..., green], src } or null.
    var PATH_MIN_TURN_DEG = 8, PATH_MAX_DETOUR = 1.6, FLYOVER_MS = 5500, FLY_GLIDE_PITCH = 40;
    // 023b (Manny: "the screen should be filled with the hole itself... like a low drone pass"): the
    // flight's length by par (+ a short hold on the green), and the corridor it fills edge to edge:
    // the fairway (its own outline, else ~40 yds) plus 25 yds of rough each side.
    var FLYOVER_MS_BY_PAR = { 3: 3000, 4: 5500, 5: 7500 }, FLY_HOLD_MS = 1100, FLY_ROUGH_M = 25 * 0.9144, FLY_FAIRWAY_HALF_M = 18;
    function polyLen(pts) { var m = 0; for (var i = 1; i < pts.length; i++) m += haversineMeters(pts[i - 1], pts[i]); return m; }
    function turnAt(a, b, c) { var d = Math.abs(bearingDeg(b, c) - bearingDeg(a, b)) % 360; return d > 180 ? 360 - d : d; }
    function maxTurn(pts) { var m = 0; for (var i = 1; i + 1 < pts.length; i++) m = Math.max(m, turnAt(pts[i - 1], pts[i], pts[i + 1])); return m; }
    // How far (0..1) p sits along tee -> green.
    function alongStraight(tee, mid, p) {
        var proj = projector(tee), g = proj.fwd(mid), q = proj.fwd(p), L2 = g[0] * g[0] + g[1] * g[1];
        return L2 ? (q[0] * g[0] + q[1] * g[1]) / L2 : 0;
    }
    function bendOk(tee, mid, b) {
        var f = alongStraight(tee, mid, b), d = haversineMeters(tee, mid);
        return f > 0.05 && f < 0.95 && haversineMeters(b, mid) > 25 && haversineMeters(tee, b) + haversineMeters(b, mid) <= PATH_MAX_DETOUR * d;
    }
    function byAlong(tee, mid, list) {
        return list.filter(function (b) { return bendOk(tee, mid, b); })
            .sort(function (a, b) { return alongStraight(tee, mid, a) - alongStraight(tee, mid, b); });
    }
    // o: { tee, mid, line?, target?, fairway? (rings), hazards? ([{ type, side, pt }]) }
    function holePath(o) {
        var tee = pinPt(o && o.tee), mid = pinPt(o && o.mid);
        if (!tee || !mid || haversineMeters(tee, mid) < 1) return null;
        var line = ((o.line) || []).map(pinPt).filter(Boolean);
        if (line.length >= 3) {
            var inner = byAlong(tee, mid, line.slice(1, -1));
            if (inner.length) return { pts: [tee].concat(inner, [mid]), src: 'centerline' };
        }
        var t = pinPt(o.target);
        if (t && bendOk(tee, mid, t)) return { pts: [tee, t, mid], src: 'target' };
        var derived = function (bends, src) {
            var p = [tee].concat(byAlong(tee, mid, bends), [mid]);
            return p.length >= 3 && maxTurn(p) >= PATH_MIN_TURN_DEG ? { pts: p, src: src } : null;
        };
        // The fairway: ONE bend, the middle of all its pieces that lie between the tee and
        // the green, weighted by size (pieces one by one zigzag on a split fairway).
        var sx = 0, sy = 0, sw = 0, fproj = projector(tee);
        (o.fairway || []).forEach(function (r) {
            var c = r && r.length >= 3 ? polygonCentroid(r) : null;
            if (!c || !bendOk(tee, mid, c)) return;
            var xy = r.map(fproj.fwd), a = 0;
            for (var i = 0; i < xy.length; i++) { var q = xy[(i + 1) % xy.length]; a += xy[i][0] * q[1] - q[0] * xy[i][1]; }
            var w = Math.abs(a) / 2 || 1, cxy = fproj.fwd(c);
            sx += cxy[0] * w; sy += cxy[1] * w; sw += w;
        });
        var fw = sw ? derived([fproj.inv([sx / sw, sy / sw])], 'fairway') : null;
        if (fw) return fw;
        // A LEFT and a RIGHT fairway bunker at about the same distance: the fairway runs between them.
        var fb = (o.hazards || []).filter(function (z) { return z && z.type === 'fb' && pinPt(z.pt); });
        var L = fb.filter(function (z) { return z.side === 'L'; }), R = fb.filter(function (z) { return z.side === 'R'; }), mids = [];
        L.forEach(function (l) {
            var la = alongStraight(tee, mid, pinPt(l.pt)), best = null;
            R.forEach(function (r) { var d = Math.abs(alongStraight(tee, mid, pinPt(r.pt)) - la); if (d < 0.15 && (!best || d < best.d)) best = { d: d, pt: pinPt(r.pt) }; });
            if (best) mids.push(midpoint(pinPt(l.pt), best.pt));
        });
        var hz = derived(mids.filter(function (m, i) { return !mids.slice(0, i).some(function (n) { return haversineMeters(m, n) < 30; }); }), 'hazards');
        if (hz) return hz;
        return { pts: [tee, mid], src: 'straight' };
    }
    // The point a fraction f (0..1) of the way along pts, by distance.
    function alongPts(pts, f) {
        var total = polyLen(pts), want = Math.max(0, Math.min(1, f)) * total;
        for (var j = 1; j < pts.length; j++) {
            var m = haversineMeters(pts[j - 1], pts[j]);
            if (want <= m || j === pts.length - 1) {
                var k = m ? Math.min(1, want / m) : 0;
                return [pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * k, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * k];
            }
            want -= m;
        }
        return pts[pts.length - 1];
    }
    // Which way the camera looks at fraction s: from a little behind to a little ahead on
    // the path, so it turns smoothly through a dogleg (and holds still over the green).
    function pathBearing(pts, s) {
        var a = Math.max(0, Math.min(0.8, s - 0.1)), b = Math.min(1, Math.max(s + 0.15, a + 0.2));
        return bearingDeg(alongPts(pts, a), alongPts(pts, b));
    }
    function smooth01(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
    function lerpBearing(a, b, w) { var d = ((b - a + 540) % 360) - 180; return (a + d * w + 360) % 360; }
    function blendCam(a, b, w) {
        return { center: [a.center[0] + (b.center[0] - a.center[0]) * w, a.center[1] + (b.center[1] - a.center[1]) * w],
                 zoom: a.zoom + (b.zoom - a.zoom) * w, bearing: lerpBearing(a.bearing, b.bearing, w) };
    }
    // THE FLIGHT. o: { path (pts), green (outline pts), pins (F / C / B pts), extra (hazard
    // points and fairway outlines: how wide the glide looks), view { w, h }, pad, maxZoom }.
    //   start  the whole hole - every path point, the green and its pins - tee to green up;
    //   glide  down the path, wide enough for the fairway and the hazards beside it (120 m
    //          across at least, never closer than 1.2 zoom steps inside the whole-hole view);
    //   end    the green and its F / C / B pins, looking the way the path arrives.
    function flyoverPlan(o) {
        var pts = ((o && o.path) || []).map(pinPt).filter(Boolean);
        if (pts.length < 2 || !(polyLen(pts) > 0)) return null;
        var view = o.view || { w: 390, h: 600 }, pad = o.pad || {}, maxZ = o.maxZoom == null ? 22 : o.maxZoom;
        var green = ((o.green) || []).map(pinPt).filter(Boolean), pins = ((o.pins) || []).map(pinPt).filter(Boolean);
        var start = fitCamera(pts.concat(green, pins), bearingDeg(pts[0], pts[pts.length - 1]), view, pad, maxZ);
        // 023b: THE CORRIDOR fills the screen's width - the fairway's own half-width (its outline,
        // measured off the path between the ends), else ~40 yds wide, plus 25 yds of rough each side.
        var fwHalf = 0;
        ((o.fairway) || []).forEach(function (ring) { (ring || []).forEach(function (p) { p = pinPt(p); if (!p) return; var a = alongLine(p, pts); if (a.t > 0.05 && a.t < 0.95) fwHalf = Math.max(fwHalf, a.d); }); });
        fwHalf = fwHalf ? Math.max(12, Math.min(fwHalf, 40)) : FLY_FAIRWAY_HALF_M;
        var hw = fwHalf + FLY_ROUGH_M;
        var availW = Math.max(40, view.w);   // edge to edge (the side buttons sit over the rough)
        var k = EQUATOR_M * Math.cos(toRad(pts[0][0])) / 512;
        var glideZoom = Math.max(start.zoom, Math.min(Math.log2(k * availW / (2 * hw)), maxZ));
        var endB = pathBearing(pts, 1), ring = [];
        (green.length ? green : []).concat(pins, [pts[pts.length - 1]]).forEach(function (p) { [0, 90, 180, 270].forEach(function (b) { ring.push(destination(p, b, 18)); }); });
        var end = fitCamera(ring, endB, view, pad, maxZ);
        var fly = FLYOVER_MS_BY_PAR[Number(o.par)] || FLYOVER_MS;
        return { pts: pts, start: start, end: end, glideZoom: glideZoom, corridorM: 2 * hw, flyMs: fly, holdMs: FLY_HOLD_MS, ms: fly + FLY_HOLD_MS };
    }
    // The camera a fraction t (0..1) of the way through the flight: { center, zoom,
    // bearing, pitch, along }. Holds the whole hole a moment, dives toward the tee while
    // tilting, glides the path, settles flat on the green and holds it. Pure.
    function flyoverCamera(plan, t) {
        if (!plan) return null;
        t = Math.max(0, Math.min(1, Number(t) || 0));
        // 023b: the flight is plan.flyMs of plan.ms; the rest holds on the green. Down to the tee
        // fast (the first 12%), the corridor all the way, settling on the green in the last 15%.
        var ft = plan.flyMs && plan.ms ? Math.min(1, t * plan.ms / plan.flyMs) : t;
        var s = smooth01((ft - 0.04) / 0.84), wA = smooth01(ft / 0.12), wE = smooth01((ft - 0.82) / 0.16);
        var glide = { center: alongPts(plan.pts, s), zoom: plan.glideZoom, bearing: pathBearing(plan.pts, s) };
        var c = blendCam(blendCam(plan.start, glide, wA), plan.end, wE);
        c.pitch = FLY_GLIDE_PITCH * wA * (1 - wE);
        c.along = s;
        return c;
    }


    // ---- THE DEFAULT TARGET ON THE PATH (009, switch pathTarget) ---------------------
    // With a bent path (gps-geo.holePath, never the dragged target) the default target
    // sits AT THE DOGLEG when its corner is in the landing zone (60 yds short of the
    // default shot to 20 past it - from the tee, or from the golfer standing back on
    // the hole - and 60 or more from the green), else the default shot along the path. A par 3, a straight path or none: exactly defaultTarget.
    // o: defaultTarget's, plus path.
    function pathTarget(o) {
        var path = o && o.path;
        if (!o || !o.mid || Number(o.par) === 3 || !path || !path.pts || path.pts.length < 3 || path.src === 'target') return defaultTarget(o);
        var pts = path.pts, shotM = (o.shotYd || DEFAULT_SHOT_YD) * M_PER_YD;
        var line = path.src === 'centerline' && o.line && o.line.length >= 3 ? o.line : pts;
        var me = o.from === 'me' && pinPt(o.pt);
        if (!me || haversineMeters(me, o.mid) > GREEN_REACH_YD * M_PER_YD) {
            // Measured from where the walk starts: the tee, or the golfer's spot on the path.
            var total = polyLen(pts), from = me ? alongLine(me, pts).t * total : 0, best = null, run = 0;
            for (var i = 1; i + 1 < pts.length; i++) {
                run += haversineMeters(pts[i - 1], pts[i]);
                var turn = turnAt(pts[i - 1], pts[i], pts[i + 1]), ahead = run - from;
                if (turn >= PATH_MIN_TURN_DEG && ahead >= shotM - 60 * M_PER_YD && ahead <= shotM + 20 * M_PER_YD
                    && haversineMeters(pts[i], o.mid) >= MIN_LEFT_YD * M_PER_YD && (!best || turn > best.turn)) best = { pt: pts[i], turn: turn };
            }
            if (best) return snapToFairway(best.pt, o.fairway);
        }
        return defaultTarget(Object.assign({}, o, { line: line }));
    }

    // ---- THE TEE SHOT AT THE GOLFER'S DRIVER (023c, Manny 2026-10-20: "the line from the tee
    // should land IN THE FAIRWAY at MY driver distance, then on to the green") ----------------
    // From the tee, along the hole's centre line (`line`: the hole path, tee first - a dogleg
    // bends it), `driverM` metres - the golfer's driver carry - snapped to the fairway. It STOPS
    // SHORT, at the first of: the dogleg's corner (a turn of PATH_MIN_TURN_DEG+), the end of the
    // fairway on the line (when the hole has fairway rings and the line runs through them), or
    // TEE_HAZARD_SHORT_YD short of a water / bunker point on the line (within TEE_HAZARD_LINE_M
    // of it). Never closer than MIN_LEFT_YD to the green. Par 3: the green, no tee shot.
    //   o: { par, tee, mid, line?, fairway? (rings), hazards? ([{ type, side, pt }]), driverM }
    //   -> { pt, alongM, wantM, stop: null | 'corner' | 'fairway' | 'hazard' | 'green',
    //        hazard?: { type, atM }, par3? }   Pure.
    var TEE_HAZARD_SHORT_YD = 10, TEE_HAZARD_LINE_M = 25, TEE_HAZARD_TYPES = { w: 'water', fb: 'bunker', b: 'bunker' };
    function teeTarget(o) {
        if (!o || !pinPt(o.mid)) return null;
        if (Number(o.par) === 3) return { pt: o.mid, par3: true, stop: null };
        var tee = pinPt(o.tee);
        if (!tee) return null;
        var line = (o.line && o.line.length >= 2) ? o.line.slice() : [tee, o.mid];
        var a0 = alongLine(tee, line);
        if (a0.t === 0 && a0.d > 5) line = [tee].concat(line);
        if (haversineMeters(line[line.length - 1], o.mid) > 5) line = line.concat([o.mid]);
        var total = polyLen(line);
        var wantM = Math.max(0, Number(o.driverM) || DEFAULT_SHOT_YD * M_PER_YD);
        var room = total - MIN_LEFT_YD * M_PER_YD;
        if (room <= 0) return { pt: o.mid, alongM: total, wantM: wantM, stop: 'green' };
        var stops = [];
        if (wantM > room) stops.push({ at: room, stop: 'green' });
        // The dogleg: the first corner the drive would pass.
        var run = 0;
        for (var i = 1; i + 1 < line.length; i++) {
            run += haversineMeters(line[i - 1], line[i]);
            if (turnAt(line[i - 1], line[i], line[i + 1]) >= PATH_MIN_TURN_DEG && run > 60 * M_PER_YD && run < Math.min(wantM, room)) { stops.push({ at: run, stop: 'corner' }); break; }
        }
        // The fairway's end on the line: the last spot inside a fairway before the drive lands outside it.
        var rings = (o.fairway || []).filter(function (r) { return r && r.length >= 3; });
        if (rings.length) {
            var inFw = function (m) { var q = pointAlongHole(line, tee, m); return !!q && rings.some(function (r) { return pointInRing(q, r); }); };
            var landM = Math.min(wantM, room);
            if (!inFw(landM)) {
                var lastIn = null;
                for (var m = 100 * M_PER_YD; m < landM; m += 3) if (inFw(m)) lastIn = m;
                if (lastIn != null) stops.push({ at: lastIn, stop: 'fairway' });
            }
        }
        // Water / a bunker on the line, before the drive lands: 10 yds short of its near edge.
        (o.hazards || []).forEach(function (z) {
            var pt = z && pinPt(z.pt);
            if (!pt || !TEE_HAZARD_TYPES[z.type]) return;
            var al = alongLine(pt, line);
            if (al.d > TEE_HAZARD_LINE_M) return;
            var atM = al.t * total;
            if (atM <= 40 * M_PER_YD || atM > Math.min(wantM, room) + 2) return;
            // URGENT-026: with the fairway mapped, a lay-up that would sit OUTSIDE it (a bunker the
            // drive carries before the fairway starts, one at its edge) is not the target.
            if (rings.length) { var lay = pointAlongHole(line, tee, Math.max(0, atM - TEE_HAZARD_SHORT_YD * M_PER_YD)); if (!lay || !rings.some(function (r) { return pointInRing(lay, r); })) return; }
            stops.push({ at: Math.max(0, atM - TEE_HAZARD_SHORT_YD * M_PER_YD), stop: 'hazard', hazard: { type: z.type, atM: atM } });
        });
        stops.sort(function (a, b) { return a.at - b.at; });
        var s0 = stops[0], alongM = s0 ? s0.at : wantM;
        var pt = pointAlongHole(line, tee, alongM) || o.mid;
        // In the fairway when it is mapped (not past a hazard stop: that keeps the line). URGENT-026:
        // the corner too - a dogleg's corner point can sit on the fairway's edge.
        if (!s0 || s0.stop === 'green' || s0.stop === 'corner') pt = snapToFairway(pt, rings);
        var out = { pt: pt, alongM: alongM, wantM: wantM, stop: s0 ? s0.stop : null };
        if (s0 && s0.hazard) out.hazard = s0.hazard;
        return out;
    }
    // ---- THE HOLE'S PATH, BEST SOURCE FIRST (URGENT-026, Manny 2026-10-20: "the line from the tee
    // runs straight to the green - the 305 lands in the desert") -------------------------------
    // Path data: a drawn hole line with a bend (OpenStreetMap's, matched by gps-geo.osmPathLines),
    // else the fairway rings' middle (tee -> fairway centroid -> green), else GolfAPI's fairway
    // points (none in our data today: GolfAPI gives a tee and a green per hole), else a line a golfer
    // SAVED for the hole (course_gps/<key>/lines - used only where there is no other path). A hole
    // with none of them has NO PATH DATA: the straight line, and the target at the pre-023c default
    // (DEFAULT_SHOT_YD along it) - never the driver's distance into whatever is there.
    function hasPathData(hp, fairway) {
        if ((fairway || []).some(function (r) { return r && r.length >= 3; })) return true;
        return !!(hp && hp.pts && hp.pts.length >= 3 && hp.src !== 'straight' && hp.src !== 'target');
    }
    // The tee shot on a hole. o: { par, tee, mid, line?, fairway?, hazards?, driverM? } ->
    // { pt, path (holePath), data (has path data), drive (teeTarget's answer, or null) }.
    //   path data + a driver: teeTarget along the path (min(driver, the corner / the fairway's end),
    //                         in the fairway);
    //   no path data:         defaultTarget on the straight line (DEFAULT_SHOT_YD, as before 023c).
    function teeShot(o) {
        if (!o || !pinPt(o.mid)) return null;
        var tee = pinPt(o.tee);
        var hp = tee ? holePath({ tee: tee, mid: o.mid, line: o.line, fairway: o.fairway, hazards: o.hazards }) : null;
        var data = hasPathData(hp, o.fairway);
        if (Number(o.par) === 3) return { pt: o.mid, path: hp, data: data, drive: null };
        if (data && o.driverM > 0) {
            var t = teeTarget({ par: o.par, tee: tee, mid: o.mid, line: hp && hp.pts, fairway: o.fairway, hazards: o.hazards, driverM: o.driverM });
            if (t && t.pt) return { pt: t.pt, path: hp, data: true, drive: t };
        }
        var line = data && hp ? hp.pts : (tee ? [tee, pinPt(o.mid)] : null);
        return { pt: defaultTarget({ par: o.par, tee: tee, mid: o.mid, line: line, fairway: o.fairway, from: 'tee' }), path: hp, data: data, drive: null };
    }
    // A SAVED LINE (URGENT-026 "Save this line"): course_gps/<key>/lines/hN = { pts: [[lat, lng], ...]
    // tee -> target(s) -> green, at, ev } or { cleared: true, at, ev }. Usable when it has 3 to
    // SAVED_LINE_MAX_PTS points, it ends within OSM_PATH_M of this hole's green center (a moved
    // green: not used) and starts within SAVED_LINE_TEE_M of this tee (another tee box of the same
    // hole: the line starts from THIS tee). -> the line or null.
    var SAVED_LINE_MAX_PTS = 6, SAVED_LINE_TEE_M = 150;
    function savedLine(rec, tee, mid) {
        if (!rec || rec.cleared || !rec.pts) return null;
        var raw = Array.isArray(rec.pts) ? rec.pts : Object.keys(rec.pts).sort(function (a, b) { return a - b; }).map(function (k) { return rec.pts[k]; });
        var pts = raw.map(function (q) { return pinPt(q && !Array.isArray(q) && q[0] != null ? [q[0], q[1]] : q); }).filter(Boolean);
        tee = pinPt(tee); mid = pinPt(mid);
        if (pts.length < 3 || pts.length > SAVED_LINE_MAX_PTS || pts.length !== raw.length || !tee || !mid) return null;
        if (haversineMeters(pts[0], tee) > SAVED_LINE_TEE_M || haversineMeters(pts[pts.length - 1], mid) > OSM_PATH_M) return null;
        return [tee].concat(pts.slice(1, -1), [mid]);
    }

    // The note under a stopped drive: "lay up 270 · water at 285" (yards or metres, unitM).
    function teeTargetNote(t, unitM) {
        if (!t || !t.stop || t.stop === 'green' || t.par3) return '';
        var u = unitM || M_PER_YD, n = function (m) { return Math.round(m / u); };
        if (t.stop === 'hazard' && t.hazard) return 'lay up ' + n(t.alongM) + ' \u00b7 ' + (TEE_HAZARD_TYPES[t.hazard.type] || 'hazard') + ' at ' + n(t.hazard.atM);
        if (t.stop === 'corner') return 'lay up ' + n(t.alongM) + ' \u00b7 the corner';
        if (t.stop === 'fairway') return 'lay up ' + n(t.alongM) + ' \u00b7 fairway ends';
        return '';
    }

    // WHERE THE NUMBERS ARE MEASURED FROM. The golfer, when they are on or near
    // the hole; the TEE when they are more than offYards from the green, or have
    // no fix at all (planning a hole from the clubhouse, or a GPS that has not
    // answered). Null when there is neither.
    var OFF_HOLE_YARDS = 1000;
    function measureOrigin(fixPt, tee, greenMid, offYards) {
        var limit = offYards == null ? OFF_HOLE_YARDS : offYards;
        if (fixPt && greenMid && haversineYards(fixPt, greenMid) <= limit) return { from: 'me', pt: fixPt };
        if (tee) return { from: 'tee', pt: tee };
        if (fixPt && !greenMid) return { from: 'me', pt: fixPt };
        return null;
    }

    // ---- AUTO-ADVANCE (008, switch autoAdvance) --------------------------------------
    // The hole after `cur` in the round's PLAY ORDER - the list the hole picker shows
    // (start on 10: 10..18, 1..9; a shotgun hole: its own rotation). null after the
    // last hole played, or for a hole not in the list: never a wrap to the first tee.
    function nextInPlayOrder(list, cur) {
        var l = (list || []).map(Number), i = l.indexOf(Number(cur));
        return i === -1 || i + 1 >= l.length ? null : l[i + 1];
    }
    // URGENT-045: ~30 yds (27.4 m) of the next tee - was 25 m.
    var NEXT_TEE_M = 30 * M_PER_YD, GREEN_CLEAR_M = 20, NEXT_TEE_ACC_M = 30;
    // Is the golfer ON THE NEXT HOLE'S TEE? Within ~30 yds of its tee point, OFF the
    // current green (not inside it, and more than 20 m from its center - a green with
    // no outline is a center only), on a fix good enough to tell (+-30 m or better).
    // o: { me, acc (m), tee (the next hole's), green (the current hole's center),
    // onGreen (holeNumbers' answer for the current hole) }. Pure.
    function onNextTee(o) {
        if (!o || !pinPt(o.me) || !pinPt(o.tee)) return false;
        if (isFinite(o.acc) && o.acc > NEXT_TEE_ACC_M) return false;
        if (o.onGreen) return false;
        if (pinPt(o.green) && haversineMeters(pinPt(o.me), pinPt(o.green)) <= GREEN_CLEAR_M) return false;
        return haversineMeters(pinPt(o.me), pinPt(o.tee)) <= NEXT_TEE_M;
    }

    // URGENT-045 AUTO-ADVANCE, THE WHOLE DECISION (pure: a position + the state -> switch or not).
    // o: { on (Tools switch), visible (foreground), hole, order (play order: the picker's list -
    //      start on 10, a shotgun hole), me, acc, teeOf(n) or tees {n: pt} (the next hole's tee
    //      point; none = no auto-advance onto that hole), green (the current hole's center),
    //      onGreen, sheetOpen (the score sheet), busy (anything else over the map or the card),
    //      now, manualAt (the last MANUAL hole change), holdUntil (Undo), armed, dwell, dwellMs }
    // -> { go, to, reason, armed, dwell }. go = true only ONE hole forward in play order (never
    // back, never a wrap past the last hole played, never two at once), off the current green,
    // within ~30 yds of the next tee for dwellMs. ARMED: the golfer has been seen OFF the next
    // tee (or on the current green) since this hole began - a hole whose tee sits beside the next
    // one's never chains 2 -> 3 -> 4 off one standing spot. A manual change wins for 2 min.
    var AA_HOLD_MS = 120000, AA_DWELL_MS = 10000;
    function autoAdvanceDecision(o) {
        o = o || {};
        var now = isFinite(o.now) ? o.now : Date.now();
        var out = function (reason, extra) { return Object.assign({ go: false, to: null, reason: reason, armed: !!o.armed, dwell: null }, extra || {}); };
        if (!o.on) return out('off');
        if (o.visible === false) return out('background');
        var next = nextInPlayOrder(o.order, o.hole);
        if (next == null) return out('last');
        var tee = typeof o.teeOf === 'function' ? o.teeOf(next) : (o.tees ? o.tees[String(next)] || o.tees[next] : null);
        tee = pinPt(tee);
        if (!tee) return out('no-tee', { to: next });
        var me = pinPt(o.me), good = !!me && !(isFinite(o.acc) && o.acc > NEXT_TEE_ACC_M);
        var onCurGreen = !!o.onGreen || (!!pinPt(o.green) && !!me && haversineMeters(me, pinPt(o.green)) <= GREEN_CLEAR_M);
        var armed = !!o.armed || (good && (onCurGreen || haversineMeters(me, tee) > NEXT_TEE_M));
        if (o.sheetOpen) return out('sheet', { to: next, armed: armed });
        if (o.busy) return out('busy', { to: next, armed: armed });
        if (isFinite(o.holdUntil) && now < o.holdUntil) return out('undo', { to: next, armed: armed });
        if (isFinite(o.manualAt) && now - o.manualAt < AA_HOLD_MS) return out('manual', { to: next, armed: armed });
        if (!armed) return out('not-armed', { to: next });
        if (!onNextTee({ me: me, acc: o.acc, tee: tee, green: o.green, onGreen: o.onGreen })) return out('not-there', { to: next, armed: armed });
        var wait = isFinite(o.dwellMs) ? o.dwellMs : AA_DWELL_MS, d = o.dwell;
        if (!d || Number(d.hole) !== next || !isFinite(d.since)) return out('arming', { to: next, armed: armed, dwell: { hole: next, since: now } });
        if (now - d.since < wait) return out('waiting', { to: next, armed: armed, dwell: d });
        return { go: true, to: next, reason: 'go', armed: armed, dwell: null };
    }

    // A NUMBER THAT FITS. Four digits at most - 9999 yards is five and a half
    // miles, so anything longer is not a golf distance and shows as a dash
    // rather than pushing the layout off the screen.
    function shownDistance(meters, unit) {
        var v = distanceIn(meters, unit);
        return (v == null || v > 9999 || v < 0) ? '\u2014' : String(v);
    }

    // ---- WAVE 1 (2026-10-08): ARCS, TODAY'S PIN, WIND --------------------------

    // The point `meters` from `pt` along `bearing` (degrees from north). Flat
    // earth over a golf hole: well under a yard off at 600 yds.
    function destination(pt, bearing, meters) {
        var proj = projector(pt), th = toRad(bearing);
        return proj.inv([meters * Math.sin(th), meters * Math.cos(th)]);
    }

    // YARDAGE ARCS, like 18Birdies: thin curved lines across the hole.
    //   carry  every `step` yards from where the numbers are measured from (the
    //          golfer, or the tee), short of the pin;
    //   pin    100 / 150 / 200 yards FROM THE PIN, back down the hole toward the
    //          golfer - the classic layup marks.
    // Each arc spans `halfWidthYd` either side of the line (a fairway's width).
    // Arcs closer than `minYd` to either end are left out (they would sit on the
    // dot or on the green). Returns [{ kind, yards, pts: [[lat, lng], ...] }].
    var ARC_STEP_YD = 25, ARC_HALF_WIDTH_YD = 30, ARC_MIN_YD = 40, PIN_MARKS_YD = [100, 150, 200];
    function yardageArcs(origin, pin, opts) {
        if (!origin || !pin) return [];
        opts = opts || {};
        var step = opts.step || ARC_STEP_YD, half = (opts.halfWidthYd || ARC_HALF_WIDTH_YD) * M_PER_YD;
        var minYd = opts.minYd == null ? ARC_MIN_YD : opts.minYd, segs = opts.segments || 16;
        var total = haversineYards(origin, pin);
        var out = [];
        var arc = function (center, toward, yards, kind) {
            var R = yards * M_PER_YD, b = bearingDeg(center, toward);
            var a = Math.min(35, (half / R) * 180 / Math.PI);
            var pts = [];
            for (var i = 0; i <= segs; i++) pts.push(roundPt(destination(center, b - a + (2 * a * i / segs), R)));
            out.push({ kind: kind, yards: yards, pts: pts });
        };
        // A carry arc within half a step of a to-the-pin mark is left out: the two
        // would be one doubled line with two labels fighting for one spot.
        var marks = PIN_MARKS_YD.filter(function (y) { return y <= total - minYd; });
        for (var y = step * Math.ceil(minYd / step); y <= total - minYd; y += step) {
            var nearMark = marks.some(function (m) { return Math.abs(y - (total - m)) < step / 2; });
            if (!nearMark) arc(origin, pin, y, 'carry');
        }
        marks.forEach(function (y) { arc(pin, origin, y, 'pin'); });
        return out;
    }

    // ---- HAZARDS + LAYUPS (008, switch hazards) ---------------------------------------
    // GolfAPI marks a hazard by its FRONT and BACK edge (two points, one when the edge
    // is all it has); the app's copy keeps each point's kind (gb greenside bunker, fb
    // fairway bunker, w water) and side (L / C / R), not which edge it is. So points of
    // the same kind and side within 60 m of each other are ONE hazard (two at most).
    // REACH = the yards to its near edge, CARRY = to its far edge (one point: reach
    // only). Behind the golfer (every point behind them on the line to the green): no
    // numbers, "behind". Pure; nothing is fetched.
    var HAZARD_PAIR_M = 60, LAYUP_YD = [50, 75, 100, 125, 150];
    var HAZARD_NAMES = { gb: 'Greenside bunker', fb: 'Fairway bunker', w: 'Water', b: 'Bunker' };
    var HAZARD_SIDES = { L: 'left', C: 'center', R: 'right' };
    function hazardGroups(hz) {
        var out = [];
        (hz || []).forEach(function (z) {
            var pt = z && pinPt(z.pt);
            if (!pt) return;
            var g = out.filter(function (o) { return o.type === z.type && o.side === (z.side || '') && o.pts.length < 2 && haversineMeters(o.pts[0], pt) <= HAZARD_PAIR_M; })[0];
            if (g) g.pts.push(pt); else out.push({ type: z.type, side: z.side || '', pts: [pt] });
        });
        return out;
    }
    // me: where the numbers are measured from; green: the hole's center (for "behind").
    // Rows nearest first: { type, side, name, reachM, carryM (null: one point), behind }.
    function hazardRows(me, hz, green) {
        me = pinPt(me); green = pinPt(green);
        if (!me) return [];
        var proj = projector(me), gv = green ? proj.fwd(green) : null, gl = gv ? Math.sqrt(gv[0] * gv[0] + gv[1] * gv[1]) : 0;
        var along = function (p) { if (!gl) return 1; var q = proj.fwd(p); return (q[0] * gv[0] + q[1] * gv[1]) / gl; };
        var rows = hazardGroups(hz).map(function (g) {
            var d = g.pts.map(function (p) { return haversineMeters(me, p); });
            var behind = g.pts.every(function (p) { return along(p) < 0; });
            return { type: g.type, side: g.side, name: (HAZARD_NAMES[g.type] || 'Hazard') + (HAZARD_SIDES[g.side] ? ' ' + HAZARD_SIDES[g.side] : ''),
                     reachM: behind ? null : Math.min.apply(null, d), carryM: behind || g.pts.length < 2 ? null : Math.max.apply(null, d), behind: behind };
        });
        rows.sort(function (a, b) { return (a.behind ? 1 : 0) - (b.behind ? 1 : 0) || (a.reachM || 0) - (b.reachM || 0); });
        return rows;
    }
    // ---- THE APPROACH VIEW (022 part 3) -------------------------------------------------
    // The line the golfer plays along: from them (or the target ring, off the hole) through the
    // green's center. approachAxis = its bearing; null without both points.
    function approachAxis(from, mid) {
        from = pinPt(from); mid = pinPt(mid);
        if (!from || !mid || haversineMeters(from, mid) < 1) return null;
        return bearingDeg(from, mid);
    }
    // CARRY / CLEAR on the approach (022): the hazards NEAR THE LINE from `me` to the green, ahead of
    // them and not past the green: "carry bunker 142" (a bunker's far edge), "clear water 155" (the
    // water's far edge); one point = that point. A hazard off the line (more than offM, default 35 m,
    // either side) or behind is left out. Nearest first:
    //   [{ verb: 'carry' | 'clear', what: 'bunker' | 'water', meters, pt (the far edge), offM, alongM }]
    var APPROACH_OFF_M = 35;
    function approachCarries(me, mid, hz, offM) {
        me = pinPt(me); mid = pinPt(mid);
        if (!me || !mid) return [];
        var lim = isNum(offM) ? offM : APPROACH_OFF_M;
        var proj = projector(me), gv = proj.fwd(mid), gl = Math.sqrt(gv[0] * gv[0] + gv[1] * gv[1]);
        if (!(gl > 0)) return [];
        var ux = gv[0] / gl, uy = gv[1] / gl;
        var out = [];
        hazardGroups(hz).forEach(function (g) {
            var pts = g.pts.map(function (p) { var q = proj.fwd(p); return { p: p, along: q[0] * ux + q[1] * uy, off: Math.abs(q[0] * uy - q[1] * ux) }; });
            if (pts.every(function (x) { return x.along <= 0; })) return;                 // behind
            if (Math.min.apply(null, pts.map(function (x) { return x.along; })) > gl + 15) return;   // past the green
            var off = Math.min.apply(null, pts.map(function (x) { return x.off; }));
            if (off > lim) return;
            var far = pts.reduce(function (a, b) { return haversineMeters(me, b.p) > haversineMeters(me, a.p) ? b : a; });
            out.push({ verb: g.type === 'w' ? 'clear' : 'carry', what: g.type === 'w' ? 'water' : 'bunker', type: g.type, side: g.side,
                       meters: haversineMeters(me, far.p), pt: far.p, offM: off, alongM: far.along });
        });
        out.sort(function (a, b) { return a.meters - b.meters; });
        return out;
    }
    // "carry bunker 142 · clear water 155" in the golfer's unit (unitM 0.9144 for yards).
    function approachLine(rows, unitM) {
        var u = unitM || M_PER_YD;
        return (rows || []).map(function (r) { return r.verb + ' ' + r.what + ' ' + Math.round(r.meters / u); }).join(' \u00b7 ');
    }
    // LAY UP TO 50 / 75 / 100 / 125 / 150 (in the golfer's unit; unitM 0.9144 for yards,
    // 1 for metres): how far from the golfer that leaves them, straight at the green.
    // Only the ones shorter than the distance to the green. [{ leave, fromM }].
    function layupTargets(toGreenM, unitM) {
        var u = unitM || M_PER_YD;
        if (!isFinite(toGreenM) || toGreenM <= 0) return [];
        return LAYUP_YD.filter(function (l) { return l * u < toGreenM; }).map(function (l) { return { leave: l, fromM: toGreenM - l * u }; });
    }
    // ---- LAYUPS FROM YOU (014, switch layupFromYou) ------------------------------------
    // Manny, hole 1 (par 5, 543): "Lay up to 150 = 393 from the tee" - nobody hits 393. Each
    // row is now THE SHOT the golfer would hit from `from` (their spot, or the target ring):
    // "Lay up to 100 -> hit 135". The shot goes through playsLike (air: the same wind /
    // temperature / altitude inputs as the main number, elevAt(pt) the heights; no air =
    // raw yards, as in tournament mode). Only shots between LAYUP_MIN_YD and the golfer's
    // longest carry + 5% (maxYd; none = no top limit) are kept. Rows:
    //   lay up to 50 / 75 / 100 / 125 / 150 - a spot that far (unitM) from the green's
    //     center, on the straight line back toward `from`;
    //   lay up short of [hazard] - a spot LAYUP_SHORT_YD short of the hazard's near edge,
    //     along the line from `from` to the green (a hazard ahead, never a greenside bunker).
    // Longest shot first: [{ kind: 'leave' | 'hazard', leave, name, aim, rawYd, pl, needYd }].
    // o: { from, green, hazards, unitM, maxYd, air, fromFt, elevAt }. Pure.
    var LAYUP_MIN_YD = 40, LAYUP_MAX_PAD = 1.05, LAYUP_SHORT_YD = 10, LAYUP_TEE_M = 25;
    function layupPlan(o) {
        o = o || {};
        var from = pinPt(o.from), green = pinPt(o.green);
        if (!from || !green) return [];
        var u = o.unitM || M_PER_YD, toGreen = haversineMeters(from, green);
        if (!(toGreen > 0)) return [];
        var maxYd = isNum(o.maxYd) && o.maxYd > 0 ? o.maxYd * LAYUP_MAX_PAD : Infinity;
        var back = bearingDeg(green, from), fwd = bearingDeg(from, green);
        var shot = function (aim, rawYd) {
            var pl = null;
            if (o.air) {
                var q = {}; Object.keys(o.air).forEach(function (k) { q[k] = o.air[k]; });
                q.yards = rawYd; q.shotBearingDeg = bearingDeg(from, aim);
                var tf = typeof o.elevAt === 'function' ? o.elevAt(aim) : null;
                if (isNum(o.fromFt) && isNum(tf)) { q.elevFromFt = o.fromFt; q.elevToFt = tf; }
                pl = playsLike(q);
            }
            return { aim: aim, rawYd: rawYd, pl: pl, needYd: pl ? pl.exact : rawYd };
        };
        var out = [];
        LAYUP_YD.forEach(function (l) {
            if (l * u >= toGreen) return;
            var s = shot(destination(green, back, l * u), (toGreen - l * u) / M_PER_YD);
            s.kind = 'leave'; s.leave = l; s.name = 'Lay up to ' + l;
            out.push(s);
        });
        var proj = projector(from), gv = proj.fwd(green);
        var along = function (p) { var q = proj.fwd(p); return (q[0] * gv[0] + q[1] * gv[1]) / toGreen; };
        hazardGroups(o.hazards).forEach(function (g) {
            if (g.type === 'gb') return;
            var near = Math.min.apply(null, g.pts.map(along)), spot = near - LAYUP_SHORT_YD * M_PER_YD;
            if (!(near > 0) || spot <= 0 || spot >= toGreen) return;
            var s = shot(destination(from, fwd, spot), spot / M_PER_YD);
            var nm = (HAZARD_NAMES[g.type] || 'Hazard') + (HAZARD_SIDES[g.side] ? ' ' + HAZARD_SIDES[g.side] : '');
            s.kind = 'hazard'; s.leave = null; s.type = g.type; s.name = 'Lay up short of ' + nm.charAt(0).toLowerCase() + nm.slice(1);
            out.push(s);
        });
        out = out.filter(function (s) { return s.needYd >= LAYUP_MIN_YD && s.needYd <= maxYd; });
        out.sort(function (a, b) { return b.rawYd - a.rawYd; });
        return out;
    }
    // WHERE THE LAYUPS COUNT FROM: the golfer's spot - unless they are on the tee box (within
    // LAYUP_TEE_M of the tee, or measured from the tee) or no row fits from there; then the
    // target ring, when it is set and nearer the green than they are ("From your target
    // (223)"). Neither: from the tee / from you (rows may be empty: "Too far to lay up yet").
    // o: layupPlan's, plus { from: { pt, kind: 'me' | 'tee' }, tee, target }.
    // Returns { from: 'me' | 'tee' | 'target', fromM (origin -> target, for the header), rows,
    // near (no rows because the green is inside the shortest layup + LAYUP_MIN_YD: go for it) }.
    function layupFromYou(o) {
        o = o || {};
        var f = o.from || {}, pt = pinPt(f.pt), tee = pinPt(o.tee), target = pinPt(o.target), green = pinPt(o.green);
        if (!pt || !green) return { from: f.kind || 'me', fromM: null, rows: [], near: false };
        var near = function (p) { return haversineMeters(p, green) < LAYUP_YD[0] * (o.unitM || M_PER_YD) + LAYUP_MIN_YD * M_PER_YD; };
        var onTee = f.kind === 'tee' || !!(tee && haversineMeters(pt, tee) <= LAYUP_TEE_M);
        var at = function (p, ft) { var q = {}; Object.keys(o).forEach(function (k) { q[k] = o[k]; }); q.from = p; q.fromFt = ft; return q; };
        var mine = layupPlan(at(pt, o.fromFt));
        if (mine.length && !onTee) return { from: 'me', fromM: null, rows: mine, near: false };
        if (target && haversineMeters(target, green) < haversineMeters(pt, green)) {
            var tf = typeof o.elevAt === 'function' ? o.elevAt(target) : null;
            return { from: 'target', fromM: haversineMeters(pt, target), rows: layupPlan(at(target, isNum(tf) ? tf : null)), near: near(target) };
        }
        return { from: onTee ? 'tee' : 'me', fromM: null, rows: mine, near: near(pt) };
    }

    // WIND from the National Weather Service hourly forecast (api.weather.gov),
    // first period: windSpeed "10 mph" or "5 to 10 mph", windDirection "NW".
    // Returns { mph, fromDeg, toDeg } (fromDeg: where it blows FROM, like the
    // forecast; toDeg: where it blows TO, which is where the arrow points), or
    // null for anything else (calm, missing, a format we do not know).
    var COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    function parseNwsWind(period) {
        if (!period || typeof period.windSpeed !== 'string' || typeof period.windDirection !== 'string') return null;
        var nums = (period.windSpeed.match(/\d+(\.\d+)?/g) || []).map(Number);
        var di = COMPASS.indexOf(period.windDirection.trim().toUpperCase());
        if (!nums.length || di < 0 || !/mph/i.test(period.windSpeed)) return null;
        var mph = Math.round(Math.max.apply(null, nums));
        var from = di * 22.5;
        return { mph: mph, fromDeg: from, toDeg: (from + 180) % 360 };
    }
    // BUILD 7 - LIVE WIND: the nearest station's LATEST OBSERVATION (what was
    // actually measured), api.weather.gov/stations/{id}/observations/latest. Its
    // properties carry quantities: windSpeed / windGust { unitCode
    // 'wmoUnit:km_h-1' (or m_s-1, kt), value }, windDirection { value: degrees
    // FROM }, temperature { 'wmoUnit:degC' }, timestamp. Returns { mph, gustMph,
    // fromDeg, toDeg, tempF, obsAt } - calm is mph 0 - or null when the station
    // did not report a wind speed (then the hourly forecast is the backup).
    function nwsMph(q) {
        if (!q || typeof q.value !== 'number' || !isFinite(q.value)) return null;
        var u = String(q.unitCode || '');
        var mph = /m_s-1$/.test(u) ? q.value * 2.236936 : /kt$|knot/i.test(u) ? q.value * 1.150779 : /mi_h-1|mph/i.test(u) ? q.value : q.value * 0.621371;
        return Math.round(mph);
    }
    function parseNwsObservation(props) {
        if (!props) return null;
        var mph = nwsMph(props.windSpeed);
        if (mph == null) return null;
        var dir = props.windDirection && typeof props.windDirection.value === 'number' && isFinite(props.windDirection.value) ? ((props.windDirection.value % 360) + 360) % 360 : null;
        if (dir == null && mph > 0) return null;       // a speed with no direction cannot drive the arrow
        var from = dir == null ? 0 : dir;
        var gust = nwsMph(props.windGust);
        var t = props.temperature && typeof props.temperature.value === 'number' && isFinite(props.temperature.value) ? props.temperature : null;
        var tempF = t ? Math.round((/degF$/.test(String(t.unitCode || '')) ? t.value : t.value * 9 / 5 + 32) * 10) / 10 : null;
        var at = Date.parse(props.timestamp || '');
        return { mph: mph, gustMph: gust != null && gust > mph ? gust : null, fromDeg: from, toDeg: (from + 180) % 360, tempF: tempF, obsAt: isFinite(at) ? at : null };
    }
    // "W", "NNE": the 16-point name of a compass direction (degrees).
    function compassName(deg) {
        return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
    }
    // THE WIND DIAL: the angle of a finger at (x, y) around a dial centered at
    // (cx, cy), clockwise from straight up, snapped to `step` degrees (5).
    // THE WIND ARROW, ON SCREEN (2026-10-11, Manny at Legacy: "about 90 degrees off").
    // The arrow points where the wind BLOWS (toDeg, compass, 0 = north, clockwise)
    // on a map turned by mapBearing (MapLibre: the compass direction at the top of
    // the screen). Rotation of an up-pointing arrow, clockwise, 0-359.
    function windArrowRot(toDeg, mapBearing) {
        return Math.round((((Number(toDeg) - (Number(mapBearing) || 0)) % 360) + 360) % 360);
    }
    // THE WIND, FOR THE SHOT: headwind (+) / tailwind (-) and crosswind, + = blowing
    // LEFT TO RIGHT across the shot. fromDeg: where it comes FROM (weather services
    // report that); shotDeg: golfer -> target. Facing north, a wind FROM the east
    // comes from the right and blows RIGHT TO LEFT (cross -mph).
    function windRelative(fromDeg, shotDeg, mph) {
        var a = toRad(Number(fromDeg) - Number(shotDeg));
        var head = mph * Math.cos(a), cross = -mph * Math.sin(a);
        var r = function (x) { return Math.round(x * 10) / 10 || 0; };
        return { head: r(head), cross: r(cross), kind: Math.abs(head) >= Math.abs(cross) ? (head >= 0 ? 'headwind' : 'tailwind') : (cross > 0 ? 'left-to-right' : 'right-to-left') };
    }
    function dialDeg(cx, cy, x, y, step) {
        var a = Math.atan2(x - cx, cy - y) * 180 / Math.PI;
        var st = step || 5;
        return ((Math.round(a / st) * st) % 360 + 360) % 360;
    }

    // TEMPERATURE from the same NWS hourly period: { temperature: 72,
    // temperatureUnit: "F" } (or "C", converted). null when it is not a number.
    function parseNwsTempF(period) {
        if (!period || typeof period.temperature !== 'number' || !isFinite(period.temperature)) return null;
        var u = String(period.temperatureUnit || 'F').trim().toUpperCase();
        return Math.round((u === 'C' ? period.temperature * 9 / 5 + 32 : period.temperature) * 10) / 10;
    }

    // PLAYS LIKE (Wave 2, 2026-10-08): the yardage to CENTER / PIN adjusted for
    // the slope, the wind and the air. D = yards to the aim point.
    //   elevation    E = (target ft - origin ft) / 3        (1 yd per 3 ft up)
    //   wind         head = mph x cos(windFrom - shotBearing)  (+ into the face)
    //                W = head > 0 ? D x 0.01 x head : D x 0.005 x head
    //                (1% per mph into the wind, 0.5% per mph helping)
    //   temperature  T = D x 0.001 x (70 - tempF)           (0.1% per degree)
    //   plays like = round(D + E + W + T)
    // Only the terms whose data is there; null when none is. Pure: the screen
    // decides what is fresh enough to pass in.
    // 012 PART 5 (switch bagAltitude) - "MY DISTANCES ARE FROM": the golfer's club numbers
    // were set somewhere (sea level, a course they pick); thinner air carries the ball
    // farther. With o.altFt (this course's height, feet) and o.altBaseFt (the baseline's):
    //   altitude     A = D x (1 - ALT_PCT_PER_1000FT / 100 x (altFt - altBaseFt) / 1000)
    //                terms.alt = A - D, and A is applied FIRST: the wind and the
    //                temperature percentages then work on A (slope stays 1 yd per 3 ft).
    // o.tempBaseF: the temperature the numbers were set in (else 70) - T compares to it.
    // Neither given ("Don't adjust"): exactly as before.
    // 070 (Manny, Oct 24: "1.5% per 1,000 ft"): ALT_PCT_PER_1000FT = 0.015 - a FRACTION, the ball
    // carries about 1.5% farther for every 1,000 ft above the baseline. ONE factor both ways:
    //   f = 1 + ALT_PCT_PER_1000FT x (courseFt - baselineFt) / 1000      (altFactor)
    //   plays like = D / f        carry here = carry x f
    // so the number and the club always agree (151 yds at 1,200 ft vs sea level: f = 1.018,
    // plays 148; an 8-iron 152 flies ~155 here). Before 070: 2% and D x (1 - x).
    var ALT_PCT_PER_1000FT = 0.015;
    function isNum(x) { return typeof x === 'number' && isFinite(x); }
    function altFactor(ft, baseFt) {
        if (!isNum(ft) || !isNum(baseFt)) return 1;
        return Math.max(0.5, Math.min(1.6, 1 + ALT_PCT_PER_1000FT * (ft - baseFt) / 1000));
    }
    function playsLike(o) {
        if (!o || !isNum(o.yards)) return null;
        var D0 = o.yards, D = D0, terms = {}, n = 0;
        if (isNum(o.altFt) && isNum(o.altBaseFt)) { D = D0 / altFactor(o.altFt, o.altBaseFt); terms.alt = D - D0; n++; }
        if (isNum(o.elevFromFt) && isNum(o.elevToFt)) { terms.elev = (o.elevToFt - o.elevFromFt) / 3; n++; }
        if (isNum(o.windMph) && isNum(o.windFromDeg) && isNum(o.shotBearingDeg)) {
            var head = o.windMph * Math.cos(toRad(o.windFromDeg - o.shotBearingDeg));
            terms.wind = head > 0 ? D * 0.01 * head : D * 0.005 * head;
            n++;
        }
        if (isNum(o.tempF)) { terms.temp = isNum(o.tempBaseF) ? D * 0.001 * (o.tempBaseF - o.tempF) : D * 0.001 * (70 - o.tempF); n++; }
        if (!n) return null;
        var exact = D + (terms.elev || 0) + (terms.wind || 0) + (terms.temp || 0);
        // NEVER SILLY (audit): extreme wind / slope inputs could show a negative "plays ~". The
        // estimate stays between half and 1.6 times the real distance.
        exact = Math.max(D0 * 0.5, Math.min(D0 * 1.6, exact));
        return { yards: Math.round(exact), exact: exact, terms: terms };
    }
    // ---- 070 WORLDWIDE COURSE HEIGHT: AWS TERRAIN TILES (Mapzen / Tilezen, terrarium) ----------
    // No key, no account. ONE z12 tile per course, asked for by the tile number around the
    // COURSE's own point (never the golfer's); each pixel is a height:
    //   meters = R x 256 + G + B / 256 - 32768
    // Credit (Acknowledgements): "Elevation: USGS 3DEP/SRTM, and the sources listed by Tilezen".
    var TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
    var TERRAIN_Z = 12, FT_PER_M = 3.28084;
    function terrainTile(pt, z) {
        pt = pinPt(pt); if (!pt) return null;
        var zz = isNum(z) ? z : TERRAIN_Z, t = tileXY(pt[0], pt[1], zz);
        return { z: zz, x: t[0], y: t[1], url: TERRAIN_URL.replace('{z}', zz).replace('{x}', t[0]).replace('{y}', t[1]) };
    }
    // Where a point falls inside its z tile, in pixels (0-255, size 256), or null when it is in another tile.
    function terrainPixel(pt, tile, size) {
        pt = pinPt(pt); if (!pt || !tile) return null;
        var n = Math.pow(2, tile.z), sz = size || 256, latR = toRad(Math.max(-85.0511, Math.min(85.0511, pt[0])));
        var fx = (pt[1] + 180) / 360 * n, fy = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n;
        if (Math.floor(fx) !== tile.x || Math.floor(fy) !== tile.y) return null;
        return { px: Math.min(sz - 1, Math.floor((fx - tile.x) * sz)), py: Math.min(sz - 1, Math.floor((fy - tile.y) * sz)) };
    }
    function terrariumFt(r, g, b) {
        if (!isNum(r) || !isNum(g) || !isNum(b)) return null;
        var m = r * 256 + g + b / 256 - 32768;
        return m < -500 || m > 9000 ? null : m * FT_PER_M;
    }
    // THE WRONG-COURSE GUARD: a height record is used only when its origin (the course point it
    // was read for) lies within ELEV_ORIGIN_M of one of THIS course's own points. Pure.
    var ELEV_ORIGIN_M = 3000;
    function elevOriginOk(o, pts) {
        o = pinPt(o); if (!o) return false;
        return (pts || []).some(function (p) { p = pinPt(p); return !!p && haversineMeters(o, p) <= ELEV_ORIGIN_M; });
    }
    // THE PHONE'S OWN ALTITUDE (the last fallback): used only while the fix is inside the course's
    // area (courseBounds + 500 m). b: courseBounds' box. Pure.
    function insideBounds(pt, b) {
        pt = pinPt(pt);
        return !!(pt && b && pt[0] >= b.south && pt[0] <= b.north && pt[1] >= b.west && pt[1] <= b.east);
    }

    // ---- PLAYS-LIKE, SPELLED OUT (009, switch playsBreakdown) -------------------------
    // ONE LINE the golfer can check: "Plays 168: +6 uphill, +9 into wind (12 mph), -1 warm".
    // Each part is playsLike's own term, rounded to the yard; a term with no data is not
    // in pl.terms and so is left out; a term that rounds to 0 says nothing and is left out.
    // pl: playsLike's result; windMph: the reading's speed (shown as the golfer sees it on
    // the wind box); unit: 'm' for meters (else yards). Pure.
    function playsParts(pl, windMph, unit) {
        var out = [], t = (pl && pl.terms) || {}, k = unit === 'm' ? M_PER_YD : 1;
        var sg = function (x) { return (x > 0 ? '+' : '-') + Math.abs(x); };
        var r = function (x) { return Math.round(x * k); };
        if (isNum(t.elev) && r(t.elev)) out.push(sg(r(t.elev)) + (t.elev > 0 ? ' uphill' : ' downhill'));
        if (isNum(t.wind) && r(t.wind)) out.push(sg(r(t.wind)) + (t.wind > 0 ? ' into wind' : ' downwind') + (isNum(windMph) ? ' (' + Math.round(windMph) + ' mph)' : ''));
        if (isNum(t.temp) && r(t.temp)) out.push(sg(r(t.temp)) + (t.temp > 0 ? ' cold' : ' warm'));
        return out;
    }
    // ---- PLAYS-LIKE, SIMPLE (012 part 3, switch playsSimple) -------------------------
    // THE ONE LINE, everywhere (the old layout's line, layout C's panel, layout D's pill):
    // "Plays like 249y" ("Plays like 228m" in meters) - nothing else. The club is the
    // view's to add (layout D: "Plays like 249y · 3W"); the why (wind, slope, temperature,
    // altitude, aim) lives in the (i) sheet only (playsInfoRows). pl: playsLike's result.
    // No pl: ''. Pure.
    function playsText(pl, unit) {
        if (!pl || !isNum(pl.exact)) return '';
        return 'Plays like ' + (unit === 'm' ? Math.round(pl.exact * M_PER_YD) + 'm' : Math.round(pl.exact) + 'y');
    }
    // THE (i) SHEET'S "THIS SHOT" ROWS - the breakdown the line no longer carries. Plain
    // strings, in order: the shot and what it plays like, then each of playsLike's terms
    // that has data and rounds to something (uphill / downhill, the wind with its speed,
    // warm / cold with the temperatures), then the crosswind's aim-off. o: { pl, yards (the
    // raw distance), windMph, tempF, tempBaseF, aim (windAim's), unit, label }. Pure.
    var MINUS = '\u2212';
    function ftWords(x) { return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }


    // ---- 070 PART 2: THE ELEVATION ON THE PILL AND IN THE (i) SHEET (display only) ----------
    // The altitude term in yards (minus = the shot plays shorter): playsLike's own terms.alt
    // when it is there (what really moved the number), else D / f - D (altFactor). null when
    // there is nothing to show. Pure.
    function elevAltYd(pl, yards, ft, baseFt) {
        var t = pl && pl.terms;
        if (t && isNum(t.alt)) return t.alt;
        if (!isNum(yards) || !isNum(ft) || !isNum(baseFt)) return null;
        var f = altFactor(ft, baseFt);
        return isNum(f) && f > 0 ? yards / f - yards : null;
    }
    // THE PILL'S SECOND LINE (layout D) - and the tail of layouts C / old's one line:
    // "elev +1,200 ft" (this course vs the golfer's baseline, in feet as the height sources give
    // them), "elev ~+1,180 ft (phone)" from the phone's own altitude (to the nearest 10 ft - a
    // rougher number, and it says so), "elev −800 ft" below the baseline. Only when a
    // baseline is set ("Don't adjust": none) and the altitude term rounds to 1 yd or more.
    // o: { ft, baseFt, src: 'course' | 'usgs' | 'tile' | 'phone' | null, altYd }. '' = no line. Pure.
    function elevLine(o) {
        o = o || {};
        if (!isNum(o.ft) || !isNum(o.baseFt) || !isNum(o.altYd) || Math.abs(Math.round(o.altYd)) < 1) return '';
        var phone = o.src === 'phone', d = o.ft - o.baseFt;
        d = phone ? Math.round(d / 10) * 10 : Math.round(d);
        if (!d) return '';
        return 'elev ' + (phone ? '~' : '') + (d > 0 ? '+' : MINUS) + ftWords(Math.abs(d)) + ' ft' + (phone ? ' (phone)' : '');
    }
    // Layouts C and old: ONE line, "Plays like 147y · elev +1,200 ft" (no elevation: as before).
    function playsTextElev(pl, unit, elev) {
        var t = playsText(pl, unit);
        return t && elev ? t + ' · ' + elev : t;
    }
    // "Height source: this course / USGS / open terrain map / your phone".
    var ELEV_SRC_WORDS = { course: 'this course', usgs: 'USGS', tile: 'open terrain map', phone: 'your phone' };
    function elevSrcWords(src) { return Object.prototype.hasOwnProperty.call(ELEV_SRC_WORDS, src) ? ELEV_SRC_WORDS[src] : ''; }

    function playsInfoRows(o) {
        o = o || {};
        var pl = o.pl, out = [];
        if (!pl) return out;
        var m = o.unit === 'm', k = m ? M_PER_YD : 1, u = m ? ' m' : ' yds';
        var r = function (x) { return Math.round(x * k); };
        var sg = function (x) { return (x > 0 ? '+' : MINUS) + Math.abs(x); };
        var t = pl.terms || {};
        out.push((o.label || 'This shot') + ': ' + (isNum(o.yards) ? r(o.yards) + u + ', ' : '') + 'plays like ' + r(pl.exact));
        // 012 part 5: the altitude row (applied first) - or why there is none.
        // 070 part 2 (the plan's section 3 wording): "Course elevation 1,200 ft vs your sea-level
        // numbers: \u22123", then "Height source: USGS"; no height: "Elevation: not available
        // here". A picked course: "vs your numbers at Grayhawk (1,500 ft)"; a height with no
        // name: "vs your numbers at 1,500 ft". The phone's own height: "~" (nearest 10 ft).
        var al = o.alt;
        if (al && al.na) out.push('Elevation: not available here');
        else if (al && isNum(al.ft)) {
            var ph = al.src === 'phone', shownFt = ph ? Math.round(al.ft / 10) * 10 : al.ft;
            var vs = al.baseName ? 'your numbers at ' + al.baseName + (isNum(al.baseFt) ? ' (' + ftWords(al.baseFt) + ' ft)' : '')
                : (isNum(al.baseFt) && Math.round(al.baseFt) !== 0 ? 'your numbers at ' + ftWords(al.baseFt) + ' ft' : 'your sea-level numbers');
            out.push('Course elevation ' + (ph ? '~' : '') + ftWords(shownFt) + ' ft vs ' + vs + ': ' + (isNum(t.alt) && r(t.alt) ? sg(r(t.alt)) : '0'));
            if (elevSrcWords(al.src)) out.push('Height source: ' + elevSrcWords(al.src));
        }
        if (isNum(t.elev) && r(t.elev)) out.push((t.elev > 0 ? 'Uphill' : 'Downhill') + ': ' + sg(r(t.elev)));
        if (isNum(t.wind) && r(t.wind)) out.push((t.wind > 0 ? 'Into the wind' : 'Downwind') + (isNum(o.windMph) ? ' (' + Math.round(o.windMph) + ' mph)' : '') + ': ' + sg(r(t.wind)));
        if (isNum(t.temp) && r(t.temp)) out.push((t.temp > 0 ? 'Cold' : 'Warm') + (isNum(o.tempF) ? ' (' + Math.round(o.tempF) + '°F vs ' + (isNum(o.tempBaseF) ? Math.round(o.tempBaseF) : 70) + '°F)' : '') + ': ' + sg(r(t.temp)));
        if (o.aim && o.aim.yd) out.push('Crosswind: aim ' + (m ? Math.max(1, Math.round(o.aim.yd * M_PER_YD)) + ' m ' : o.aim.yd + (o.aim.yd === 1 ? ' yd ' : ' yds ')) + o.aim.side);
        // 012 part 4 (elevPerLeg): the second leg, target -> green, with its own slope / wind.
        var g = o.toGreen;
        if (g && isNum(g.yards)) {
            var gt = (g.pl && g.pl.terms) || {}, gp = [];
            if (isNum(gt.elev) && r(gt.elev)) gp.push((gt.elev > 0 ? 'uphill ' : 'downhill ') + sg(r(gt.elev)));
            if (isNum(gt.wind) && r(gt.wind)) gp.push((gt.wind > 0 ? 'into the wind ' : 'downwind ') + sg(r(gt.wind)));
            out.push('Target \u2192 green: ' + r(g.yards) + u + (g.pl ? ', plays like ' + r(g.pl.exact) : '') + (gp.length ? ' (' + gp.join(', ') + ')' : ''));
        }
        // The heights used, where they were read (feet, as USGS gives them).
        var h = o.heights;
        if (h) {
            var hs = [];
            [['from', h.fromLabel || 'you'], ['target', 'target'], ['green', 'green']].forEach(function (x) { if (isNum(h[x[0]])) hs.push(x[1] + ' ' + Math.round(h[x[0]]) + ' ft'); });
            if (hs.length) out.push('Heights: ' + hs.join(' \u00b7 ') + (h.ownCell ? ' (your height: your ~10 m square)' : ''));
        }
        return out;
    }
    // CROSSWIND = AIM OFF, NO DISTANCE CHANGE. The rule (a common rule of thumb, kept
    // simple on purpose): the ball drifts about 0.5% of the shot's distance per mph of
    // crosswind - 150 yds in a 10 mph crosswind drifts ~8 yds. Aim that far INTO the
    // wind. cross: windRelative's (+ = blowing LEFT TO RIGHT, so the ball goes right:
    // aim left). Under 2 yds (inside what GPS can tell): nothing to say (null). Pure.
    var AIM_PER_MPH = 0.005;
    function windAim(yards, crossMph) {
        if (!isNum(yards) || !isNum(crossMph) || yards <= 0) return null;
        var yd = Math.round(yards * AIM_PER_MPH * Math.abs(crossMph));
        if (yd < 2) return null;
        return { yd: yd, side: crossMph > 0 ? 'left' : 'right' };
    }
    // ---- THE WHOLE COURSE'S HEIGHTS (009, switch courseElev) --------------------------
    // The points sampled once per course (USGS EPQS, COURSE POINTS ONLY - never the
    // golfer): per hole the tee; every ELEV_STEP_YD along the hole's own line (its
    // centerline, doglegs followed; the straight tee -> green line when there is none);
    // the green's front, center and back (along the line of play into it); and each
    // hazard point. To 5 decimals, each once. rec: a course GPS record ({ holes:
    // { n: { osm } } }). Returns { "1": [[lat, lng], ...], ... }. Pure.
    var ELEV_STEP_YD = 25;
    function r5pt(p) { return [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]; }
    function walkLine(line, stepM) {
        var out = [line[0]];
        var carry = 0;
        for (var i = 1; i < line.length; i++) {
            var a = line[i - 1], b = line[i], len = haversineMeters(a, b);
            var s = stepM - carry;
            while (s <= len) { var t = s / len; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); s += stepM; }
            carry = len - (s - stepM);
        }
        return out;
    }
    function holeElevPoints(o) {
        o = o && (o.osm || o);
        var mid = o && pinPt(o.mid), tee = o && pinPt(o.tee);
        if (!mid) return [];
        var pts = [], seen = {};
        var add = function (p) { p = pinPt(p); if (!p) return; p = r5pt(p); var k = p[0] + ',' + p[1]; if (!seen[k]) { seen[k] = 1; pts.push(p); } };
        var line = (o.line && o.line.length >= 2) ? o.line.map(pinPt).filter(Boolean) : (tee ? [tee, mid] : null);
        if (line && line.length >= 2) {
            if (tee && haversineMeters(tee, line[0]) > 5) line = [tee].concat(line);
            if (haversineMeters(line[line.length - 1], mid) > 5) line = line.concat([mid]);
            if (tee) add(tee);
            walkLine(line, ELEV_STEP_YD * M_PER_YD).forEach(add);
        } else if (tee) add(tee);
        add(mid);
        if (o.green && o.green.length >= 3) {
            var from = line && line.length >= 2 ? line[line.length - 2] : tee;
            var g = from ? greenNumbers(from, o.green, mid) : null;
            if (g) { add(g.front); add(g.back); }
        }
        (o.hazards || []).forEach(function (z) { if (z) add(z.pt); });
        return pts;
    }
    function courseElevPoints(rec) {
        var out = {};
        Object.keys((rec && rec.holes) || {}).forEach(function (n) { var p = holeElevPoints(rec.holes[n]); if (p.length) out[n] = p; });
        return out;
    }
    // A POINT'S HEIGHT FROM THE HOLE'S SAMPLES, worked out ON THE PHONE (the golfer's
    // spot, a tapped target, the green): a sample within 2 m is that sample; else the
    // inverse-distance-weighted mean (weight 1/d^2) of the nearest 3 sampled points with
    // a height, within ELEV_REACH_M. Nothing that close: null (no guess, no slope term).
    // samples: [[lat, lng, ft | null], ...]. Pure.
    var ELEV_REACH_M = 150;
    function elevFromSamples(samples, pt) {
        if (!samples || !samples.length || !pt) return null;
        var near = [];
        samples.forEach(function (s) {
            if (!s || !isNum(s[2])) return;
            near.push({ d: haversineMeters(pt, s), ft: s[2] });
        });
        near.sort(function (a, b) { return a.d - b.d; });
        if (!near.length || near[0].d > ELEV_REACH_M) return null;
        if (near[0].d < 2) return near[0].ft;
        var sw = 0, sv = 0;
        near.slice(0, 3).filter(function (n) { return n.d <= ELEV_REACH_M; }).forEach(function (n) { var w = 1 / (n.d * n.d); sw += w; sv += w * n.ft; });
        return sv / sw;
    }
    // ---- ELEVATION PER LEG (012 part 4, switch elevPerLeg) --------------------------
    // EACH LEG ITS OWN PLAYS-LIKE: you (or the tee) -> the target, and the target -> the
    // green's middle, each with its own distance, its own bearing (so the wind is the wind
    // FOR THAT LEG) and the heights AT ITS OWN TWO ENDS - read at the real points (the
    // golfer's spot, the target, the green), never projected onto the straight tee -> green
    // line. A par 3, no target, or a target on the green's middle (within LEG_SAME_M): one
    // leg, to the green. o: { from, target, green, fromFt, targetFt, greenFt, par3, minYd,
    // air: { windMph, windFromDeg, tempF, ... } - passed to playsLike as they are }.
    // Returns { toTarget: leg, toGreen: leg | null, single } - a leg { yards (exact), plays
    // (whole yards, or null under minYd / no data), pl (playsLike's result), bearing } - or
    // null without a from and a green. Pure.
    var LEG_SAME_M = 5;
    function playsLegs(o) {
        if (!o || !o.from || !o.green) return null;
        var min = isNum(o.minYd) ? o.minYd : 0, air = o.air || {};
        var leg = function (a, b, fa, fb) {
            var yd = haversineMeters(a, b) / M_PER_YD, br = bearingDeg(a, b), pl = null;
            if (yd >= min) {
                var q = {}; Object.keys(air).forEach(function (k) { q[k] = air[k]; });
                q.yards = yd; q.elevFromFt = fa; q.elevToFt = fb; q.shotBearingDeg = br;
                pl = playsLike(q);
            }
            return { yards: yd, plays: pl ? pl.yards : null, pl: pl, bearing: br };
        };
        var single = !!o.par3 || !o.target || haversineMeters(o.target, o.green) < LEG_SAME_M;
        if (single) return { toTarget: leg(o.from, o.green, o.fromFt, o.greenFt), toGreen: null, single: true };
        return { toTarget: leg(o.from, o.target, o.fromFt, o.targetFt), toGreen: leg(o.target, o.green, o.targetFt, o.greenFt), single: false };
    }
    // THE SECOND LEG'S BUBBLE (layout D): "60 · plays 63" - the yards, and what they play like
    // when that is known ("60" alone when not). unit 'm': meters. Pure.
    function legText(leg, unit) {
        if (!leg || !isNum(leg.yards)) return '';
        var k = unit === 'm' ? M_PER_YD : 1, y = Math.round(leg.yards * k);
        return leg.pl && isNum(leg.pl.exact) ? y + ' \u00b7 plays ' + Math.round(leg.pl.exact * k) : String(y);
    }
    // HOW FAR OFF THE HOLE'S LINE (yards) a point is - line: [tee, ...bends, green]. Pure.
    var OWN_SPOT_OFF_YD = 30;
    function offLineYards(pt, line) {
        if (!pt || !line || line.length < 2) return null;
        return alongLine(pt, line).d / M_PER_YD;
    }
    // THE GOLFER'S SPOT, BLURRED TO A ~10 m GRID CELL (012 part 4c). PRIVACY: when the golfer
    // is more than OWN_SPOT_OFF_YD off the hole's line (the course's own samples are too far
    // to say how high they stand), the GPS screen asks USGS for the height of the CENTER of
    // the ~10 m x 10 m cell they are in - never their exact position - and keeps it on the
    // phone per cell (asked once, ever). Rows of ELEV_CELL_M degrees-of-latitude-in-metres;
    // across, the same metres at that row's own latitude, so a cell is ~10 m square anywhere.
    // Every point in a cell gives the same key and center. { key: 'row,col', pt: [lat, lng] }.
    // Pure.
    var ELEV_CELL_M = 10;
    function elevCell(pt, m) {
        if (!pt || !isNum(pt[0]) || !isNum(pt[1])) return null;
        var dLat = (m || ELEV_CELL_M) / (EARTH_RADIUS_M * Math.PI / 180);
        var i = Math.floor(pt[0] / dLat), latC = (i + 0.5) * dLat;
        var dLng = dLat / Math.cos(toRad(latC)), j = Math.floor(pt[1] / dLng);
        var r6 = function (x) { return Math.round(x * 1e6) / 1e6; };
        return { key: i + ',' + j, pt: [r6(latC), r6((j + 0.5) * dLng)] };
    }
    var PLAYS_API = { playsParts: playsParts, playsText: playsText, playsInfoRows: playsInfoRows, windAim: windAim, AIM_PER_MPH: AIM_PER_MPH, holeElevPoints: holeElevPoints, courseElevPoints: courseElevPoints,
        elevFromSamples: elevFromSamples, ELEV_STEP_YD: ELEV_STEP_YD, ELEV_REACH_M: ELEV_REACH_M,
        ALT_PCT_PER_1000FT: ALT_PCT_PER_1000FT, altFactor: altFactor,
        TERRAIN_URL: TERRAIN_URL, TERRAIN_Z: TERRAIN_Z, terrainTile: terrainTile, terrainPixel: terrainPixel, terrariumFt: terrariumFt,
        ELEV_ORIGIN_M: ELEV_ORIGIN_M, elevOriginOk: elevOriginOk, insideBounds: insideBounds,
        elevAltYd: elevAltYd, elevLine: elevLine, playsTextElev: playsTextElev, elevSrcWords: elevSrcWords,   // 070 part 2
        playsLegs: playsLegs, legText: legText, LEG_SAME_M: LEG_SAME_M, offLineYards: offLineYards, OWN_SPOT_OFF_YD: OWN_SPOT_OFF_YD, elevCell: elevCell, ELEV_CELL_M: ELEV_CELL_M };

    // ---- ANY COURSE: THE OPENSTREETMAP LOOKUP, PURE PARTS (build 5) -------------
    // Shared by the app (gps-view.js lookupCourse) and tools/gps-coverage.js, so
    // the phone and the coverage report pick the same course and keep the same holes.
    // The words of a course name that tell it apart ("Chambers Bay Golf Club" ->
    // chambers, bay).
    function courseNameWords(n) {
        return String(n || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function (w) {
            return w.length > 2 && !/^(golf|club|course|courses|country|the|and|links|resort|at|of|gc|cc|stadium|north|south|east|west)$/.test(w);
        });
    }
    // The Overpass query for the golf courses in a ~2.5 km box around a course point.
    function golfCoursesQuery(pt) {
        var dLat = 0.0225, dLng = 0.0225 / Math.max(0.2, Math.cos(pt[0] * Math.PI / 180));
        var bb = [(pt[0] - dLat).toFixed(4), (pt[1] - dLng).toFixed(4), (pt[0] + dLat).toFixed(4), (pt[1] + dLng).toFixed(4)].join(',');
        return '[out:json][timeout:25];nwr["leisure"="golf_course"](' + bb + ');out tags center;';
    }
    // Ours among them: the best name match; with no name match, the only one there.
    function pickGolfCourse(elements, name) {
        var words = courseNameWords(name);
        var cands = (elements || []).filter(function (e) { return e.type === 'way' || e.type === 'relation'; });
        var score = function (e) { var nw = courseNameWords(e.tags && e.tags.name); return words.filter(function (w) { return nw.indexOf(w) !== -1; }).length; };
        cands.sort(function (a, b) { return score(b) - score(a); });
        return cands.length && (score(cands[0]) > 0 || cands.length === 1) ? cands[0] : null;
    }
    function courseHolesQuery(c) {
        return '[out:json][timeout:40];' + c.type + '(' + c.id + ')->.c;.c map_to_area->.a;(nwr["golf"="hole"](area.a);nwr["golf"="green"](area.a););out geom;';
    }
    // The holes to keep: matched, and the hole line ends INSIDE its green (the
    // importer's rule). OSM's par is dropped - par comes from our card.
    function cleanLookupHoles(elements) {
        var r = osmToCourseGps(elements || [], {}), holes = {};
        Object.keys(r.holes || {}).forEach(function (n) {
            var o = r.holes[n].osm;
            if (!o || !o.green || !o.end || !pointInRing(o.end, o.green)) return;
            delete o.par;
            holes[n] = r.holes[n];
        });
        return { holes: holes, counts: r.counts };
    }

    // ---- WHICH HOLES ARE THE PICKED COURSE'S (2026-10-10) -------------------------
    // Clubs put 27, 36, 54 or 72 holes inside ONE OpenStreetMap outline. Given every
    // hole line in it, pick the 18 (or 9) of the course the golfer chose, in order:
    //   1  the outline holds one course (no hole number twice);
    //   2  the holes carry a course label - golf:course:name, or a prefix in the ref
    //      or name ("O'odham 3", "Blue 3", "N3", "Cameron - Hole 3") - and one label
    //      (or, for a 27-hole pairing, two nines) matches the course's name;
    //   3  the scorecard: each candidate's hole lengths against our card's yardage
    //      (else its OSM par tags against our card's pars); a clear winner only;
    //   4  walking order: unlabelled duplicates are split into routes (hole n's
    //      green -> the nearest hole n+1 tee); a direction in the name ("East")
    //      then picks the route lying that way;
    //   5  still unsure: ask once - the candidates' hole 1s go back to be shown on
    //      the map; the golfer's tap is saved (want.choice) and answers from then on.
    // want: { name, holes (18|9), nines: [frontLabel, backLabel], yards: [...],
    //         pars: [...], choice: candidate id }. Returns { step, how, set: {n: hole
    //         element}, candidates } - set null when asking (step 5) or nothing to
    //         pick from (step 0).
    var HS_STOP = { golf: 1, course: 1, courses: 1, club: 1, country: 1, resort: 1, the: 1, and: 1, at: 1, of: 1, links: 1, nine: 1, holes: 1, hole: 1 };
    function hsWords(s) {
        return String(s || '').toLowerCase().replace(/['’`]/g, '').split(/[^a-z0-9]+/)
            .filter(function (w) { return w && !HS_STOP[w] && !/^\d+$/.test(w); })
            .map(function (w) { return w.replace(/(.)\1+/g, '$1'); });   // "piipaash" = "piipash" = "pipash"
    }
    // Two spellings of one word: equal, or the same consonants ("MacKay" / "McKay").
    function hsSame(a, b) {
        if (a === b) return true;
        var sk = function (w) { return w.replace(/[aeiouy]/g, ''); };
        return a.length >= 3 && b.length >= 3 && sk(a).length >= 3 && sk(a) === sk(b);
    }
    function hsHas(list, w) { for (var i = 0; i < list.length; i++) if (hsSame(list[i], w)) return true; return false; }
    function hsLabelNum(tags) {
        tags = tags || {};
        var label = '', num = null, m;
        var ref = String(tags.ref || ''), name = String(tags.name || '');
        m = ref.match(/^\s*(\d{1,2})\s*$/);
        if (m) num = parseInt(m[1], 10);
        else if ((m = ref.match(/^\s*(.*?[^\d\s-])\s*-?\s*(\d{1,2})\s*$/))) { label = m[1]; num = parseInt(m[2], 10); }
        // A label and a number in the name ("Cameron - Hole 3 - 402 yards"): the
        // name's number wins - a club that names its holes this way may not keep ref.
        if (!label && (m = name.match(/^\s*(.*?[^\d\s#-])\s*[-:#]?\s*(?:hole\s*)?#?\s*(\d{1,2})\b/i)) && !/^hole$/i.test(m[1].trim())) {
            label = m[1]; num = parseInt(m[2], 10);
        }
        // A name with no number at all ("Streamsong Blue") is the course's name.
        if (!label && name && !/\d/.test(name)) label = name;
        if (num == null && (m = name.match(/\bhole\s*#?\s*(\d{1,2})\b/i))) num = parseInt(m[1], 10);
        if (tags['golf:course:name']) label = tags['golf:course:name'];
        return { label: hsWords(label).join(' '), raw: String(label || '').trim(), num: num };
    }
    function hsEnds(el) {
        var g = (el.geometry || []);
        return g.length >= 2 ? { a: [g[0].lat, g[0].lon], b: [g[g.length - 1].lat, g[g.length - 1].lon] } : null;
    }
    function hsLenYd(el) {
        var g = el.geometry || [], m = 0;
        for (var i = 1; i < g.length; i++) m += haversineMeters([g[i - 1].lat, g[i - 1].lon], [g[i].lat, g[i].lon]);
        return m / M_PER_YD;
    }
    // Split holes whose numbers repeat into walking routes (step 4).
    function hsRoutes(holes) {
        var byNum = {}, max = 0;
        holes.forEach(function (h) { (byNum[h.num] = byNum[h.num] || []).push(h); if (h.num > max) max = h.num; });
        var starts = byNum[1] || [];
        if (starts.length < 2) return [];
        var routes = starts.map(function (h) { var r = {}; r[1] = h; return { set: r, last: h }; });
        for (var n = 2; n <= max; n++) {
            var cands = (byNum[n] || []).slice(0, 6);
            // The assignment of this number's holes to the routes with the least
            // walking in all (every ordering tried - a club has 2 to 4 courses).
            var dist = function (ri, ci) { return haversineMeters(hsEnds(routes[ri].last.el).b, hsEnds(cands[ci].el).a); };
            var best = null, bestD = Infinity;
            var tryPerm = function (ri, used, acc, d) {
                if (d >= bestD) return;
                if (ri === routes.length) { bestD = d; best = acc.slice(); return; }
                var any = false;
                for (var ci = 0; ci < cands.length; ci++) {
                    if (used[ci]) continue;
                    any = true; used[ci] = 1; acc[ri] = ci;
                    tryPerm(ri + 1, used, acc, d + dist(ri, ci));
                    used[ci] = 0;
                }
                if (!any) { acc[ri] = -1; tryPerm(ri + 1, used, acc, d); }   // fewer holes than routes
            };
            tryPerm(0, {}, [], 0);
            (best || []).forEach(function (ci, ri) { if (ci >= 0) { routes[ri].set[n] = cands[ci]; routes[ri].last = cands[ci]; } });
        }
        return routes.map(function (r) { return r.set; });
    }
    // ONE HOLE DRAWN IN PIECES is one hole, not several: same number and label,
    // one piece starting within 2 m of where another ends -> one line, in order.
    function hsStitch(holes) {
        var groups = {}, out = [];
        holes.forEach(function (h) { var k = h.label + '#' + h.num; (groups[k] = groups[k] || []).push(h); });
        Object.keys(groups).forEach(function (k) {
            var list = groups[k].slice();
            if (list.length < 2) { out.push(Object.assign({ key: k }, list[0])); return; }
            var pts = function (h) { return h.el.geometry.map(function (p) { return [p.lat, p.lon]; }); };
            var meet = function (a, b) { return haversineMeters(a, b) <= 2; };
            while (list.length) {
                var cur = list.shift(), line = pts(cur), grew = true;
                while (grew) {
                    grew = false;
                    for (var i = 0; i < list.length; i++) {
                        var q = pts(list[i]);
                        // Only a CONTINUATION joins (one piece ends where the next
                        // starts): two lines ending at the same green are two tees.
                        if (meet(line[line.length - 1], q[0])) line = line.concat(q.slice(1));
                        else if (meet(line[0], q[q.length - 1])) line = q.concat(line.slice(1));
                        else continue;
                        list.splice(i, 1); grew = true; break;
                    }
                }
                var el = { type: cur.el.type, id: cur.el.id, tags: cur.el.tags, geometry: line.map(function (p) { return { lat: p[0], lon: p[1] }; }) };
                out.push({ el: el, num: cur.num, label: cur.label, raw: cur.raw, key: k });
            }
        });
        // ONE HOLE DRAWN FROM EACH TEE (Palmbrook 18: four lines, one per tee box, all
        // ending at the same green): lines of one number and label whose ENDS meet
        // within 5 m are one hole - the longest (the back tee) is its line.
        var len = function (h) { var g = h.el.geometry, m = 0; for (var i = 1; i < g.length; i++) m += haversineMeters([g[i - 1].lat, g[i - 1].lon], [g[i].lat, g[i].lon]); return m; };
        var endOf = function (h) { var g = h.el.geometry; return [g[g.length - 1].lat, g[g.length - 1].lon]; };
        var kept = [];
        out.forEach(function (h) {
            var twin = kept.filter(function (x) { return x.key === h.key && haversineMeters(endOf(x), endOf(h)) <= 5; })[0];
            if (!twin) { kept.push(h); return; }
            if (len(h) > len(twin)) kept[kept.indexOf(twin)] = h;
        });
        return kept;
    }
    function pickHoleSet(elements, want) {
        want = want || {};
        var need = want.holes === 9 ? 9 : 18;
        var holes = hsStitch((elements || []).filter(function (e) { return e.type === 'way' && e.tags && e.tags.golf === 'hole' && hsEnds(e); })
            .map(function (e) { var ln = hsLabelNum(e.tags); return { el: e, num: ln.num, label: ln.label, raw: ln.raw }; })
            .filter(function (h) { return h.num && h.num >= 1 && h.num <= 99; }));
        if (!holes.length) return { step: 0, how: 'no hole lines in OpenStreetMap', set: null, candidates: [] };
        var asSet = function (list) { var o = {}; list.forEach(function (h) { if (!o[h.num]) o[h.num] = h; }); return o; };
        var count = function (set) { return Object.keys(set).length; };
        var nums = {}, dup = false;
        holes.forEach(function (h) { if (nums[h.num]) dup = true; nums[h.num] = 1; });
        var out = function (step, how, set) {
            var o = {};
            Object.keys(set).forEach(function (n) { if (Number(n) <= need) o[n] = set[n].el; });
            return { step: step, how: how, set: o, candidates: [] };
        };
        // 1 - one course in the outline. Unless the outline plainly holds more than one
        // course (greens for well over this many holes) and has too few hole lines to
        // say whose they are: then there is nothing safe to pick.
        var greens = (elements || []).filter(function (e) { return e.tags && e.tags.golf === 'green'; }).length;
        if (!dup && greens > need + 9 && holes.length < need / 2) {
            return { step: 0, how: 'only ' + holes.length + ' hole line(s) among ' + greens + ' greens - too few to tell this club\'s courses apart', set: null, candidates: [] };
        }
        if (!dup) return out(1, 'one course in the outline', asSet(holes));
        // 2 - labelled groups.
        var groups = {}, labelled = 0;
        holes.forEach(function (h) { if (h.label) { labelled++; (groups[h.label] = groups[h.label] || []).push(h); } });
        var labels = Object.keys(groups).filter(function (l) { return count(asSet(groups[l])) >= 5; });
        var cands = [];
        if (labels.length >= 2 && labelled >= holes.length * 0.8) {
            var wantW = hsWords(want.name);
            var wantJ = wantW.join('');
            var match = function (lbl) {
                var lw = lbl.split(' ');
                if (lw.length && lw.every(function (w) { return hsHas(wantW, w); })) return lw.length;
                return lbl.replace(/ /g, '') && wantJ.indexOf(lbl.replace(/ /g, '')) !== -1 ? lw.length : 0;   // "Man O'War" = "man o war"
            };
            if (want.nines && want.nines.length === 2) {
                var nineOf = function (nm) { var w = hsWords(nm); var hit = labels.filter(function (l) { return l.split(' ').every(function (x) { return hsHas(w, x); }); }); return hit.length === 1 ? hit[0] : null; };
                var f = nineOf(want.nines[0]), b = nineOf(want.nines[1]);
                if (f && b && f !== b) {
                    var set = {};
                    groups[f].forEach(function (h) { if (h.num <= 9 && !set[h.num]) set[h.num] = h; });
                    groups[b].forEach(function (h) { if (h.num <= 9 && !set[h.num + 9]) set[h.num + 9] = { el: h.el, num: h.num + 9 }; });
                    return out(2, 'the nines "' + (groups[f][0].raw || f) + '" + "' + (groups[b][0].raw || b) + '"', set);
                }
            }
            var scored = labels.map(function (l) { return { l: l, s: match(l) }; }).sort(function (x, y) { return y.s - x.s; });
            var shown = function (l) { return groups[l][0].raw || l; };
            if (scored[0].s > 0 && (scored.length < 2 || scored[1].s < scored[0].s)) return out(2, 'holes labelled "' + shown(scored[0].l) + '"', asSet(groups[scored[0].l]));
            // No name settles it, but only one group is the right size (an 18 beside a nine).
            var sized = labels.filter(function (l) { return count(asSet(groups[l])) >= need; });
            if (need === 18 && sized.length === 1) return out(2, 'the only 18-hole group ("' + shown(sized[0]) + '")', asSet(groups[sized[0]]));
            cands = labels.map(function (l) { return { id: null, label: groups[l][0].raw || l, set: asSet(groups[l]) }; });
        } else {
            cands = hsRoutes(holes).map(function (set) { return { id: null, label: '', set: set }; });
        }
        cands = cands.filter(function (c) { return c.set[1]; });
        // Nothing to choose between: never an empty question - no safe answer.
        if (!cands.length) return { step: 0, how: 'hole numbers repeat but no course can be told apart', set: null, candidates: [] };
        cands.forEach(function (c, i) { c.id = c.set[1].el.type[0] + c.set[1].el.id; if (!c.label) c.label = String.fromCharCode(65 + i); });
        var from = labels.length >= 2 && labelled >= holes.length * 0.8 ? 'labelled groups' : 'walking routes';
        // A saved tap (step 5, earlier) answers.
        if (want.choice) { var ch = cands.filter(function (c) { return c.id === want.choice; })[0]; if (ch) return out(5, 'the hole 1 chosen on the map', ch.set); }
        // 3 - the scorecard: yardage, else par.
        var card = function (c) {
            var hit = 0, tried = 0;
            for (var n = 1; n <= need; n++) {
                var h = c.set[n]; if (!h) continue;
                var yd = want.yards && want.yards[n - 1], par = want.pars && want.pars[n - 1];
                if (yd) { tried++; if (Math.abs(hsLenYd(h.el) - yd) <= yd * 0.10) hit++; }
                else if (par && h.el.tags.par) { tried++; if (parseInt(h.el.tags.par, 10) === par) hit++; }
            }
            return { hit: hit, tried: tried };
        };
        if (cands.length >= 2 && ((want.yards && want.yards.length) || (want.pars && want.pars.length))) {
            var sc = cands.map(function (c) { return { c: c, r: card(c) }; }).sort(function (x, y) { return y.r.hit - x.r.hit; });
            if (sc[0].r.tried >= need * 0.6 && sc[0].r.hit >= sc[0].r.tried * 0.6 && sc[0].r.hit - sc[1].r.hit >= 3) {
                return out(3, 'the scorecard (' + sc[0].r.hit + ' of ' + sc[0].r.tried + ' holes match ' + (want.yards && want.yards.length ? 'its yardage' : 'its pars') + ') among ' + from, sc[0].c.set);
            }
        }
        // 4 - a direction in the name picks the route lying that way.
        var dir = (hsWords(want.name).filter(function (w) { return /^(east|west|north|south)$/.test(w); })[0]);
        if (dir && cands.length === 2) {
            var mean = function (c, k) { var t = 0, m = 0; Object.keys(c.set).forEach(function (n) { var e = hsEnds(c.set[n].el); t += e.b[k]; m++; }); return t / m; };
            var k = dir === 'east' || dir === 'west' ? 1 : 0, bigger = mean(cands[0], k) > mean(cands[1], k) ? 0 : 1;
            var pick = (dir === 'east' || dir === 'north') ? cands[bigger] : cands[1 - bigger];
            return out(4, 'walking order split the ' + cands.length + ' courses; "' + dir + '" is the route lying ' + dir, pick.set);
        }
        // 5 - ask once.
        return { step: 5, how: 'ask: ' + cands.length + ' candidate courses (' + from + ')', set: null,
                 candidates: cands.map(function (c) { var e = hsEnds(c.set[1].el); return { id: c.id, label: c.label, tee: e.a, end: e.b, holes: count(c.set) }; }) };
    }
    // The elements with only the picked holes, renumbered (a back nine's 1-9 -> 10-18),
    // ready for osmToCourseGps / cleanLookupHoles.
    function applyHoleSet(elements, set) {
        // Everything but the hole lines, then the chosen holes - as picked (a hole
        // stitched from pieces is its whole line), renumbered.
        var out = (elements || []).filter(function (e) { return !(e.type === 'way' && e.tags && e.tags.golf === 'hole'); });
        Object.keys(set || {}).forEach(function (n) {
            var e = set[n], t = {};
            Object.keys(e.tags || {}).forEach(function (k) { if (k !== 'name' && k !== 'golf:course:name') t[k] = e.tags[k]; });
            t.ref = String(n);
            out.push({ type: e.type, id: e.id, tags: t, geometry: e.geometry });
        });
        return out;
    }

    // ---- GOLFAPI.IO COURSES (build 9, 2026-10-10) --------------------------------
    // GolfAPI gives POINTS, not shapes: per hole the green's front / center / back,
    // the front and back tees, bunkers and water, a dogleg. A course with GolfAPI
    // data uses ONLY these (no OpenStreetMap greens mixed in). To keep front / back
    // moving with the golfer's angle, the green is estimated as an ELLIPSE along the
    // front -> back axis: as deep as front-to-back, as wide as 80% of that (18 to
    // 30 m) - greenNumbers then casts the golfer's ray through it like any green.
    function ellipseRing(f, b, mid) {
        var c = (f && b) ? midpoint(f, b) : mid;
        var bearing = (f && b) ? bearingDeg(f, b) : null;
        var depth = (f && b) ? haversineMeters(f, b) : 27;
        if (bearing == null) return null;
        depth = Math.max(12, depth);
        var a = depth / 2, w = Math.max(9, Math.min(15, depth * 0.4));
        // THE CENTRE GOLFAPI GIVES IS INSIDE THE GREEN (audit, 2026-10-16). It is not always the
        // front-back midpoint: Caledonia 9's sits at the back edge and slightly to one side, so a
        // ray from the tee left this ellipse before it - "back 112, centre 113". The ellipse grows
        // just enough (3 m margin) to hold it; a centred one is unchanged.
        if (mid && f && b) {
            var dm = haversineMeters(c, mid);
            if (dm > 0.5) {
                var rel = (bearingDeg(c, mid) - bearing) * Math.PI / 180;
                var al = Math.abs(dm * Math.cos(rel)), ac = Math.abs(dm * Math.sin(rel));
                if (al + 3 > a) a = al + 3;
                if (ac + 3 > w) w = ac + 3;
            }
        }
        var ring = [];
        for (var i = 0; i < 24; i++) {
            var t = i / 24 * 2 * Math.PI;
            var along = a * Math.cos(t), across = w * Math.sin(t);
            var p = destination(c, bearing, along);
            ring.push(destination(p, bearing + 90, across));
        }
        ring.push(ring[0]);
        return ring;
    }
    // One stripped GolfAPI course (tools/golfapi-pull.js) -> the hole record the GPS
    // side reads (the bundle's shape). offset: 9 for the back nine of a pairing.
    function golfapiHoles(c, offset, into) {
        into = into || {};
        // Firebase returns holes "1".."18" as an ARRAY with an empty [0]: only real holes.
        Object.keys((c && c.h) || {}).forEach(function (k) {
            var h = c.h[k];
            if (!h || typeof h !== 'object' || !(Number(k) >= 1)) return;
            var g = h.g || {};
            var mid = g.c || ((g.f && g.b) ? midpoint(g.f, g.b) : null);
            if (!mid) return;
            var tee = (h.t && (h.t.b || h.t.f)) || null;
            var line = [tee, h.d || null, mid].filter(Boolean);
            var lineM = 0;
            for (var i = 1; i < line.length; i++) lineM += haversineMeters(line[i - 1], line[i]);
            var green = ellipseRing(g.f, g.b, mid);
            var osm = { tee: tee, end: mid, mid: mid, line: line.length >= 2 ? line : null, lineM: line.length >= 2 ? Math.round(lineM) : null,
                        green: green ? compactRing(green) : null, src: 'golfapi',
                        hazards: (h.z || []).map(function (z) { return { type: z[0], side: z[1], pt: [z[2], z[3]] }; }) };
            if (!tee) delete osm.tee;
            into[String(Number(k) + (offset || 0))] = { osm: osm };
        });
        return into;
    }
    // THE NINES WE HAVE (Thistle, 2026-10-15): GolfAPI keeps a 27-hole club as 18-hole pairings
    // ("Cameron + Stewart", "MacKay + Cameron"). Each is split into its two nines - holes 1-9 the
    // first named, 10-18 the second, renumbered 1-9 - so ANY pairing, in either order, or one nine
    // alone, is made from data already in the file. A nine seen twice (Cameron) is kept once.
    // Real 9-hole records stay as they are.
    function golfapiNines(all) {
        var out = [], seen = {};
        all.forEach(function (c) {
            if (!c) return;
            if (c.holes === 9) { out.push(c); return; }
            var parts = String(c.course || '').split(/\s*\+\s*/);
            if (c.holes !== 18 || parts.length !== 2 || !c.h) return;
            parts.forEach(function (lab, i) {
                var k = String(c.club || '').toLowerCase() + '|' + lab.toLowerCase();
                if (seen[k]) return;
                var h = {}, n = 0;
                for (var j = 1; j <= 9; j++) { var src = c.h[j + 9 * i] || c.h[String(j + 9 * i)]; if (src) { h[String(j)] = src; n++; } }
                if (!n) return;
                seen[k] = 1;
                out.push({ id: c.id + '#' + (i + 1), club: c.club, course: lab, city: c.city, state: c.state, lat: c.lat, lng: c.lng, holes: 9, h: h, fetched: c.fetched, updated: c.updated });
            });
        });
        return out;
    }
    function golfapiRecord(courses) {
        var holes = {};
        courses.forEach(function (c, i) { golfapiHoles(c, 9 * i, holes); });
        return { v: 1, src: 'golfapi', golfapiIds: courses.map(function (c) { return c.id; }), osmBase: courses.map(function (c) { return c.fetched || c.updated || null; })[0], holes: holes };
    }
    // WHICH GOLFAPI COURSE IS THIS ROUND'S? In order: an explicit link from the
    // puller (links[ourKey]); a 27-hole pairing - our name "Club (A / B)" - from
    // the club's two nines; else the club / course name (the naming words, same
    // spelling rules as pickHoleSet: "Piipaash" = "Piipash", "MacKay" = "McKay")
    // within 5 km of the course when its point is known. Only one clear match
    // counts. Returns { record, how } or null.
    function golfapiMatch(data, key, name, loc, holesWanted, table) {
        if (!data || !data.courses) return null;
        name = stripNineSuffix(name);
        var all = Object.keys(data.courses).map(function (id) { return data.courses[id]; });
        // A SIBLING OF A LINKED 27-HOLE CLUB (thistle_27_stewart_mackay beside the linked
        // thistle_27_cameron_stewart) knows where it is: the linked record's own point.
        if (!loc && data.links && key) {
            Object.keys(data.links).some(function (lk) {
                var base = lk.split('_').slice(0, -2).join('_');
                if (base.split('_').length < 2 || key.indexOf(base + '_') !== 0) return false;
                var c = data.courses[data.links[lk]];
                if (c && isFinite(c.lat) && isFinite(c.lng)) { loc = [c.lat, c.lng]; return true; }
                return false;
            });
        }
        // A link under the round's key, else under the bundle key its name resolves to
        // (the Myrtle trip's Thistle rounds carry "thistle_cameron_stewart"; the link
        // is "thistle_27_cameron_stewart").
        var alias = table ? bundleKeyFor(table, key, name, loc) : null;
        var linkId = data.links && (data.links[key] || (alias && data.links[alias]));
        var link = linkId && data.courses[linkId];
        if (link) return { record: golfapiRecord([link]), how: 'linked' + (data.links[key] ? '' : ' (as ' + alias + ')') };
        // BY NAME ONLY WITH A PLACE (audit C2): no location, no name match - "The Pinehills" in
        // Massachusetts is not Myrtlewood's Pine Hills.
        if (!loc) return null;
        var near = function (c) { return isFinite(c.lat) && haversineMeters(loc, [c.lat, c.lng]) <= NEAR_M; };
        var words = function (c) { return hsWords(c.club + ' ' + c.course); };
        var covers = function (want, have) {
            var hj = have.join('');
            return want.every(function (w) { return hsHas(have, w) || (w.length >= 4 && hj.indexOf(w) !== -1); });
        };
        var m = String(name || '').match(/\(\s*([^()\/]+?)\s*\/\s*([^()\/]+?)\s*\)/);
        // ONE NINE ("Thistle Golf Club (MacKay)" - a 9-hole round): that nine alone.
        var m1 = m ? null : String(name || '').match(/\(\s*([^()\/]+?)\s*\)\s*$/);
        if (m || m1) {
            var clubW = hsWords(String(name).replace(/\(.*\)/, ''));
            var nines = golfapiNines(all);
            var nine = function (label) {
                var lw = hsWords(String(label).replace(/\b(nine|only)\b/gi, ''));
                if (!lw.length) return null;
                var hit = nines.filter(function (c) { return near(c) && covers(clubW, hsWords(c.club)) && covers(lw, hsWords(c.course)); });
                return hit.length === 1 ? hit[0] : null;
            };
            if (m) {
                var a = nine(m[1]), b = nine(m[2]);
                // The same nine twice is a real round (audit C9): its holes, then the same holes again.
                if (a && b) return { record: golfapiRecord([a, b]), how: 'the nines "' + a.course + '" + "' + b.course + '"' };
            } else {
                var one = nine(m1[1]);
                if (one) return { record: golfapiRecord([one]), how: 'the nine "' + one.course + '"' };
            }
        }
        // "Prestwick CC" is "Prestwick Country Club": a scorecard name's CC / GC
        // abbreviations name no course (GolfAPI only - the OSM picker keeps its words).
        var want = hsWords(String(name || '').replace(/\b[cg]c\b/gi, ' '));
        if (!want.length) return null;
        // A pairing's ORDER matters: "(Stewart / Cameron)" is never "Cameron + Stewart".
        var ordered = function (c) {
            if (!m) return true;
            var cw = words(c), i = -1, j = -1;
            hsWords(m[1]).forEach(function (w) { cw.forEach(function (x, k) { if (hsSame(x, w) && i < 0) i = k; }); });
            hsWords(m[2]).forEach(function (w) { cw.forEach(function (x, k) { if (hsSame(x, w) && j < 0) j = k; }); });
            return i < 0 || j < 0 || i < j;
        };
        // A BARE CLUB NAME IS NOT ONE OF ITS COURSES (audit C2): "Talking Stick Golf Club" never
        // becomes Piipaash - the course's own words must be in the name, unless the course IS
        // the club.
        var namesCourse = function (c) {
            var cw = hsWords(c.course), clw = hsWords(c.club);
            var own = cw.filter(function (w) { return !hsHas(clw, w); });
            return !own.length || own.some(function (w) { return covers([w], want); });
        };
        var hit = all.filter(function (c) { return near(c) && (!holesWanted || c.holes >= holesWanted) && covers(want, words(c)) && ordered(c) && namesCourse(c); });
        // Several: ambiguous (the club name alone, "Talking Stick Golf Club") - no
        // match, unless exactly one of them IS the name with nothing more.
        if (hit.length > 1) hit = hit.filter(function (c) { return words(c).length === want.length; });
        return hit.length === 1 ? { record: golfapiRecord([hit[0]]), how: '"' + hit[0].club + ' / ' + hit[0].course + '" by name' } : null;
    }

    // ---- OPENSTREETMAP HOLE LINES ON A GOLFAPI COURSE (010, switch osmPath) -------------
    // GolfAPI almost never has a hole's line (its rare dogleg point `d`), so its preview
    // flies straight and its default target sits on the straight line. The bundled
    // OpenStreetMap course (gps-courses.js, in every build) often has the hole DRAWN.
    // That drawn line - and nothing else from OSM - shapes the preview path and the
    // default target. Every number shown stays GolfAPI's (one source per course): the
    // GolfAPI record is never changed; the line is handed to holePath / pathTarget only.
    // WHICH BUNDLED COURSE (strict), in order:
    //   linked   the GolfAPI puller's link table (data.links: bundle key -> GolfAPI id)
    //            names this GolfAPI course for a bundled key - the round's own key, else
    //            the bundle key its name resolves to, else the one linked key;
    //   by name  the round's key or name resolves to a bundled course (bundleKeyFor: the
    //            key itself, a known alias, or the name within 5 km), and the GolfAPI
    //            course's own point (or the round's) is within 5 km of it.
    // Returns { key, how } or null.
    function gaBaseIds(record) {
        return ((record && record.golfapiIds) || []).map(function (id) { return String(id).split('#')[0]; });
    }
    function osmPathCourse(table, data, record, key, name, loc) {
        if (!table || !record || !record.holes) return null;
        var ids = gaBaseIds(record);
        if (!ids.length) return null;
        var isBundle = function (k) { return !!(k && k !== '_names' && table[k]); };
        var alias = bundleKeyFor(table, key, name, loc);
        var links = (data && data.links) || {};
        // A course made from two nines ("Cameron + Stewart" split) is linked under its PAIRING:
        // only the round's own bundle key (below) names the right pairing in the right order.
        var nines = (record.golfapiIds || []).some(function (id) { return /#/.test(String(id)); });
        var linked = nines ? [] : Object.keys(links).filter(function (k) { return isBundle(k) && ids.indexOf(String(links[k])) !== -1; });
        if (linked.length) {
            if (linked.indexOf(key) !== -1) return { key: key, how: 'linked' };
            if (alias && linked.indexOf(alias) !== -1) return { key: alias, how: 'linked' };
            if (linked.length === 1) return { key: linked[0], how: 'linked' };
            return null;
        }
        if (!isBundle(alias)) return null;
        var rec = table[alias], at = rec && (rec.compose ? bundlePoint(table[rec.compose[0]]) : bundlePoint(rec));
        var c = data && data.courses && data.courses[ids[0]];
        var where = (c && isFinite(c.lat) && isFinite(c.lng)) ? [Number(c.lat), Number(c.lng)] : pinPt(loc);
        if (!at || !where || haversineMeters(at, where) > NEAR_M) return null;
        return { key: alias, how: 'by name' };
    }
    // ONE HOLE, GUARDED: the bundled course's hole with the SAME NUMBER, its drawn line (3+
    // points) starting within 40 m of GolfAPI's tee and ending within 40 m of GolfAPI's green
    // center; GolfAPI's own line has no bend. The path line is GolfAPI's tee -> the OSM
    // corners -> GolfAPI's green center. { line } or { reject: why }.
    var OSM_PATH_M = 40;
    function osmPathLine(gaHole, osmHole) {
        var ga = gaHole && (gaHole.osm || gaHole), o = osmHole && (osmHole.osm || osmHole);
        var tee = pinPt(ga && ga.tee), mid = pinPt(ga && (ga.mid || ga.end));
        if (!tee || !mid) return { reject: 'no GolfAPI tee / green' };
        if (((ga.line) || []).length >= 3) return { reject: 'GolfAPI has its own line' };
        var line = ((o && o.line) || []).map(pinPt).filter(Boolean);
        if (line.length < 3) return { reject: 'no drawn bend' };
        var dS = haversineMeters(line[0], tee), dE = haversineMeters(line[line.length - 1], mid);
        if (dS > OSM_PATH_M) return { reject: 'start ' + Math.round(dS) + ' m from the tee' };
        if (dE > OSM_PATH_M) return { reject: 'end ' + Math.round(dE) + ' m from the green' };
        return { line: [tee].concat(line.slice(1, -1), [mid]) };
    }
    // URGENT-026: the same hole's FAIRWAY rings, guarded much the same way: its drawn line (2 points
    // is enough, a straight hole) ends within 40 m of GolfAPI's green center and starts within
    // OSM_FAIRWAY_TEE_M of GolfAPI's tee (OpenStreetMap draws from one tee box, GolfAPI may give
    // another - the green decides the hole). The target is snapped into them; the flyover is as
    // wide as they are.
    var OSM_FAIRWAY_TEE_M = 150;
    function osmPathFairway(gaHole, osmHole) {
        var ga = gaHole && (gaHole.osm || gaHole), o = osmHole && (osmHole.osm || osmHole);
        var tee = pinPt(ga && ga.tee), mid = pinPt(ga && (ga.mid || ga.end));
        var fw = ((o && o.fairway) || []).filter(function (r) { return r && r.length >= 3; });
        if (!tee || !mid || !fw.length || ((ga.fairway) || []).length) return null;
        var line = ((o && o.line) || []).map(pinPt).filter(Boolean);
        if (line.length < 2 || haversineMeters(line[0], tee) > OSM_FAIRWAY_TEE_M || haversineMeters(line[line.length - 1], mid) > OSM_PATH_M) return null;
        return fw;
    }
    // The whole course: { key, how, lines: { n: line }, fairways: { n: rings }, rejected: { n: why } } or null.
    function osmPathLines(table, data, record, key, name, loc) {
        var m = osmPathCourse(table, data, record, key, name, loc);
        if (!m) return null;
        var osm = osmCourse(table, m.key), out = { key: m.key, how: m.how, lines: {}, fairways: {}, rejected: {} };
        Object.keys(record.holes).forEach(function (n) {
            var oh = osm && osm.holes && osm.holes[n];
            var r = oh ? osmPathLine(record.holes[n], oh) : { reject: 'no OSM hole ' + n };
            if (r.line) out.lines[n] = r.line; else out.rejected[n] = r.reject;
            var fw = oh ? osmPathFairway(record.holes[n], oh) : null;
            if (fw) out.fairways[n] = fw;
        });
        return out;
    }

    // ---- HAS THIS COURSE GPS? ONE ANSWER FOR THE COURSE LIST AND THE MAP (URGENT-022) -----------
    // Manny: "the GPS badge/message disagrees with the real map" (Chambers Bay: "No GPS" on the
    // Course screen, a working map after Start Round; Legacy ✓ in one list, none in the next). The
    // map's own rule (gps-view osmRecord): the GolfAPI course (a link, a 27-hole pairing, or the
    // name within 5 km - the app's file and every course pulled online), else - only with OSM on -
    // the bundled OpenStreetMap holes or this phone's / the shared lookup, the newer winning. The
    // map calls this; the course list calls it with the same inputs.
    //   o: { key, name, loc: [lat, lng] | null, holes: 18 | 9, golfapi: table | null, ga: a match
    //        already made (the map's cache) | undefined, osmOn, osmTable, lookedUp }
    function courseGps(o) {
        o = o || {};
        var ga = o.ga !== undefined ? o.ga : (o.golfapi ? golfapiMatch(o.golfapi, o.key, o.name, o.loc || null, o.holes === 9 ? 9 : 18, o.osmTable || null) : null);
        if (ga && ga.record) return ga.record;
        if (ga && ga.holes) return ga;
        if (!o.osmOn) return null;
        var t = o.osmTable || {}, b = osmCourse(t, bundleKeyFor(t, o.key, o.name || null, o.loc || null)), l = o.lookedUp || null;
        var ta = Date.parse((l && l.osmBase) || ''), tb = Date.parse((b && b.osmBase) || '');
        if (b && l && isFinite(ta) && isFinite(tb) && ta > tb) return l;
        return b || l;
    }
    // ✓ GPS only when it is REAL (URGENT-022): hole 1 has a green, and it is within 2 km of where the
    // course is (data in the wrong place - or for another course - never shows ✓).
    function holeOneNear(rec, loc, maxM) {
        var h = rec && rec.holes && (rec.holes['1'] || rec.holes[1]), x = h && (h.osm || h), g = x && (x.mid || (x.green && x.green[0]));
        if (!g) return false;
        if (!loc) return true;
        return haversineMeters(loc, g) <= (maxM || 2000);
    }
    var api = {
        teeTarget: teeTarget, teeTargetNote: teeTargetNote, TEE_HAZARD_SHORT_YD: TEE_HAZARD_SHORT_YD,
        courseGps: courseGps, holeOneNear: holeOneNear,
        courseNameWords: courseNameWords, golfCoursesQuery: golfCoursesQuery, pickGolfCourse: pickGolfCourse,
        defaultTarget: defaultTarget, pointAlongHole: pointAlongHole, snapToFairway: snapToFairway, lengthAlong: lengthAlong, simplifyLine: simplifyLine,
        DEFAULT_SHOT_YD: DEFAULT_SHOT_YD, MIN_LEFT_YD: MIN_LEFT_YD, GREEN_REACH_YD: GREEN_REACH_YD,
        courseHolesQuery: courseHolesQuery, cleanLookupHoles: cleanLookupHoles, pickHoleSet: pickHoleSet, applyHoleSet: applyHoleSet,
        approachAxis: approachAxis, approachCarries: approachCarries, approachLine: approachLine, APPROACH_OFF_M: APPROACH_OFF_M,
        golfapiMatch: golfapiMatch, golfapiRecord: golfapiRecord, golfapiNines: golfapiNines, ellipseRing: ellipseRing,
        osmPathCourse: osmPathCourse, osmPathLine: osmPathLine, osmPathLines: osmPathLines, osmPathFairway: osmPathFairway,
        teeShot: teeShot, hasPathData: hasPathData, savedLine: savedLine, SAVED_LINE_MAX_PTS: SAVED_LINE_MAX_PTS, OSM_PATH_M: OSM_PATH_M,
        bearingDeg: bearingDeg, holeCamera: holeCamera,
        destination: destination, yardageArcs: yardageArcs, parseNwsWind: parseNwsWind, parseNwsObservation: parseNwsObservation, compassName: compassName, dialDeg: dialDeg, windArrowRot: windArrowRot, windRelative: windRelative,
        parseNwsTempF: parseNwsTempF, playsLike: playsLike, alongLine: alongLine,
        hazardGroups: hazardGroups, hazardRows: hazardRows, layupTargets: layupTargets, LAYUP_YD: LAYUP_YD,
        layupPlan: layupPlan, layupFromYou: layupFromYou, LAYUP_MIN_YD: LAYUP_MIN_YD, LAYUP_MAX_PAD: LAYUP_MAX_PAD, LAYUP_SHORT_YD: LAYUP_SHORT_YD, LAYUP_TEE_M: LAYUP_TEE_M,
        ARC_STEP_YD: ARC_STEP_YD, PIN_MARKS_YD: PIN_MARKS_YD, measureOrigin: measureOrigin, shownDistance: shownDistance, OFF_HOLE_YARDS: OFF_HOLE_YARDS,
        nextInPlayOrder: nextInPlayOrder, onNextTee: onNextTee, NEXT_TEE_M: NEXT_TEE_M, GREEN_CLEAR_M: GREEN_CLEAR_M,
        autoAdvanceDecision: autoAdvanceDecision, AA_HOLD_MS: AA_HOLD_MS, AA_DWELL_MS: AA_DWELL_MS,
        tileXY: tileXY, courseBounds: courseBounds, tilesFor: tilesFor, midpoint: midpoint,
        flyoverFrame: flyoverFrame, holePath: holePath, flyoverPlan: flyoverPlan, flyoverCamera: flyoverCamera, pathTarget: pathTarget, fitCamera: fitCamera, pathBearing: pathBearing,
        FLYOVER_MS: FLYOVER_MS, FLYOVER_MS_BY_PAR: FLYOVER_MS_BY_PAR, FLY_HOLD_MS: FLY_HOLD_MS, FLY_ROUGH_M: FLY_ROUGH_M, PATH_MIN_TURN_DEG: PATH_MIN_TURN_DEG,
        courseGpsKey: courseGpsKey, osmCourse: osmCourse, bundleKeyFor: bundleKeyFor, stripNineSuffix: stripNineSuffix, KNOWN_ALIASES: KNOWN_ALIASES, courseNameKey: courseNameKey,
        EARTH_RADIUS_M: EARTH_RADIUS_M, M_PER_YD: M_PER_YD, WEAK_GPS_YARDS: WEAK_GPS_YARDS, GREEN_MATCH_M: GREEN_MATCH_M,
        haversineMeters: haversineMeters, haversineYards: haversineYards, distanceIn: distanceIn,
        accuracyLabel: accuracyLabel, polygonCentroid: polygonCentroid, pointInRing: pointInRing,
        greenNumbers: greenNumbers, compactRing: compactRing, osmToCourseGps: osmToCourseGps, outerRings: outerRings,
        resolveHole: resolveHole, holeNumbers: holeNumbers, makePin: makePin, undoPin: undoPin, pinPt: pinPt
    };
    Object.keys(PLAYS_API).forEach(function (k) { api[k] = PLAYS_API[k]; });   // 009: plays-like parts, aim-off, course heights
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.HardPanGeo = api;
})();
