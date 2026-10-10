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
    function bundleKeyFor(table, key, name) {
        if (table && key && table[key] && key !== '_names') return key;
        var names = table && table._names, want = courseNameKey(name);
        if (!names || !want) return null;
        var hit = Object.keys(names).filter(function (k) { return courseNameKey(names[k]) === want; });
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
        var bearing = bearingDeg(tee, g);
        var th = toRad(bearing);
        var origin = tee, proj = projector(origin);
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
    function isNum(x) { return typeof x === 'number' && isFinite(x); }
    function playsLike(o) {
        if (!o || !isNum(o.yards)) return null;
        var D = o.yards, terms = {}, n = 0;
        if (isNum(o.elevFromFt) && isNum(o.elevToFt)) { terms.elev = (o.elevToFt - o.elevFromFt) / 3; n++; }
        if (isNum(o.windMph) && isNum(o.windFromDeg) && isNum(o.shotBearingDeg)) {
            var head = o.windMph * Math.cos(toRad(o.windFromDeg - o.shotBearingDeg));
            terms.wind = head > 0 ? D * 0.01 * head : D * 0.005 * head;
            n++;
        }
        if (isNum(o.tempF)) { terms.temp = D * 0.001 * (70 - o.tempF); n++; }
        if (!n) return null;
        var exact = D + (terms.elev || 0) + (terms.wind || 0) + (terms.temp || 0);
        return { yards: Math.round(exact), exact: exact, terms: terms };
    }

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
        Object.keys((c && c.h) || {}).forEach(function (k) {
            var h = c.h[k], g = h.g || {};
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
        var all = Object.keys(data.courses).map(function (id) { return data.courses[id]; });
        // A link under the round's key, else under the bundle key its name resolves to
        // (the Myrtle trip's Thistle rounds carry "thistle_cameron_stewart"; the link
        // is "thistle_27_cameron_stewart").
        var alias = table ? bundleKeyFor(table, key, name) : null;
        var linkId = data.links && (data.links[key] || (alias && data.links[alias]));
        var link = linkId && data.courses[linkId];
        if (link) return { record: golfapiRecord([link]), how: 'linked' + (data.links[key] ? '' : ' (as ' + alias + ')') };
        var near = function (c) { return !loc || !isFinite(c.lat) || haversineMeters(loc, [c.lat, c.lng]) <= 5000; };
        var words = function (c) { return hsWords(c.club + ' ' + c.course); };
        var covers = function (want, have) {
            var hj = have.join('');
            return want.every(function (w) { return hsHas(have, w) || (w.length >= 4 && hj.indexOf(w) !== -1); });
        };
        var m = String(name || '').match(/\(\s*([^()\/]+?)\s*\/\s*([^()\/]+?)\s*\)/);
        if (m) {
            var clubW = hsWords(String(name).replace(/\(.*\)/, ''));
            var nine = function (label) {
                var lw = hsWords(label);
                var hit = all.filter(function (c) { return c.holes === 9 && near(c) && covers(clubW, hsWords(c.club)) && covers(lw, words(c)); });
                return hit.length === 1 ? hit[0] : null;
            };
            var a = nine(m[1]), b = nine(m[2]);
            if (a && b && a !== b) return { record: golfapiRecord([a, b]), how: 'the nines "' + a.course + '" + "' + b.course + '"' };
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
        var hit = all.filter(function (c) { return near(c) && (!holesWanted || c.holes >= holesWanted) && covers(want, words(c)) && ordered(c); });
        // Several: ambiguous (the club name alone, "Talking Stick Golf Club") - no
        // match, unless exactly one of them IS the name with nothing more.
        if (hit.length > 1) hit = hit.filter(function (c) { return words(c).length === want.length; });
        return hit.length === 1 ? { record: golfapiRecord([hit[0]]), how: '"' + hit[0].club + ' / ' + hit[0].course + '" by name' } : null;
    }

    var api = {
        courseNameWords: courseNameWords, golfCoursesQuery: golfCoursesQuery, pickGolfCourse: pickGolfCourse,
        defaultTarget: defaultTarget, pointAlongHole: pointAlongHole, snapToFairway: snapToFairway, lengthAlong: lengthAlong, simplifyLine: simplifyLine,
        DEFAULT_SHOT_YD: DEFAULT_SHOT_YD, MIN_LEFT_YD: MIN_LEFT_YD, GREEN_REACH_YD: GREEN_REACH_YD,
        courseHolesQuery: courseHolesQuery, cleanLookupHoles: cleanLookupHoles, pickHoleSet: pickHoleSet, applyHoleSet: applyHoleSet,
        golfapiMatch: golfapiMatch, golfapiRecord: golfapiRecord, ellipseRing: ellipseRing,
        bearingDeg: bearingDeg, holeCamera: holeCamera,
        destination: destination, yardageArcs: yardageArcs, parseNwsWind: parseNwsWind, parseNwsObservation: parseNwsObservation, compassName: compassName, dialDeg: dialDeg,
        parseNwsTempF: parseNwsTempF, playsLike: playsLike, alongLine: alongLine,
        ARC_STEP_YD: ARC_STEP_YD, PIN_MARKS_YD: PIN_MARKS_YD, measureOrigin: measureOrigin, shownDistance: shownDistance, OFF_HOLE_YARDS: OFF_HOLE_YARDS,
        tileXY: tileXY, courseBounds: courseBounds, tilesFor: tilesFor, midpoint: midpoint,
        courseGpsKey: courseGpsKey, osmCourse: osmCourse, bundleKeyFor: bundleKeyFor, courseNameKey: courseNameKey,
        EARTH_RADIUS_M: EARTH_RADIUS_M, M_PER_YD: M_PER_YD, WEAK_GPS_YARDS: WEAK_GPS_YARDS, GREEN_MATCH_M: GREEN_MATCH_M,
        haversineMeters: haversineMeters, haversineYards: haversineYards, distanceIn: distanceIn,
        accuracyLabel: accuracyLabel, polygonCentroid: polygonCentroid, pointInRing: pointInRing,
        greenNumbers: greenNumbers, compactRing: compactRing, osmToCourseGps: osmToCourseGps, outerRings: outerRings,
        resolveHole: resolveHole, holeNumbers: holeNumbers, makePin: makePin, undoPin: undoPin, pinPt: pinPt
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.HardPanGeo = api;
})();
