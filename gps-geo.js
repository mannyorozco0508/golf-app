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
        var holes = [], greens = [], teeBoxes = [], tees = 0, fairways = 0;
        (elements || []).forEach(function (el) {
            var tags = el.tags || {};
            var g = geomOf(el);
            if (!g) return;
            if (tags.golf === 'hole' && el.type === 'way') {
                if (opts.holeFilter && !opts.holeFilter(tags)) return;
                var num = opts.holeNumber ? opts.holeNumber(tags) : holeRef(tags);
                holes.push({ ref: num, par: parseInt(tags.par, 10) || null, line: g, id: el.id });
            }
            else if (tags.golf === 'green' && g.length >= 3) greens.push({ ref: holeRef(tags), ring: cleanRing(g), id: el.type + '/' + el.id });
            else if (tags.golf === 'tee') { tees++; teeBoxes.push({ ref: holeRef(tags), at: g.length >= 3 ? polygonCentroid(g) : g[0] }); }
            else if (tags.golf === 'fairway') fairways++;
        });
        greens.forEach(function (gr) { gr.centroid = polygonCentroid(gr.ring); });

        var out = {};
        var refsSeen = {};
        holes.forEach(function (h) {
            if (!h.ref) return;
            if (refsSeen[h.ref]) return;              // a duplicate ref: first way wins, the report says so
            refsSeen[h.ref] = true;
            var end = h.line[h.line.length - 1];
            var green = (opts.holeNumber ? null : greens.filter(function (gr) { return gr.ref === h.ref; })[0])
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

    var api = {
        bearingDeg: bearingDeg, holeCamera: holeCamera,
        destination: destination, yardageArcs: yardageArcs, parseNwsWind: parseNwsWind,
        parseNwsTempF: parseNwsTempF, playsLike: playsLike, alongLine: alongLine,
        ARC_STEP_YD: ARC_STEP_YD, PIN_MARKS_YD: PIN_MARKS_YD, measureOrigin: measureOrigin, shownDistance: shownDistance, OFF_HOLE_YARDS: OFF_HOLE_YARDS,
        tileXY: tileXY, courseBounds: courseBounds, tilesFor: tilesFor, midpoint: midpoint,
        courseGpsKey: courseGpsKey, osmCourse: osmCourse,
        EARTH_RADIUS_M: EARTH_RADIUS_M, M_PER_YD: M_PER_YD, WEAK_GPS_YARDS: WEAK_GPS_YARDS, GREEN_MATCH_M: GREEN_MATCH_M,
        haversineMeters: haversineMeters, haversineYards: haversineYards, distanceIn: distanceIn,
        accuracyLabel: accuracyLabel, polygonCentroid: polygonCentroid, pointInRing: pointInRing,
        greenNumbers: greenNumbers, compactRing: compactRing, osmToCourseGps: osmToCourseGps,
        resolveHole: resolveHole, holeNumbers: holeNumbers, makePin: makePin, undoPin: undoPin, pinPt: pinPt
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.HardPanGeo = api;
})();
