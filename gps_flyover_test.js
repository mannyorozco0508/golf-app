// ============================================================================
// HARDPAN GPS - HOLE FLYOVER / PREVIEW (008, switch flyover)
//
// gps-geo.flyoverFrame says where the camera is a fraction of the way down the
// hole's own line and which way it looks; gps-view.js flies MapLibre's camera with
// it (about 4 s, then back to the hole view), stops on any touch, and with
// prefers-reduced-motion frames the whole hole at once instead.
// tools/gps-flyover-check.js runs it in headless Chrome (WebGL).
// 009: it flies the HOLE'S PATH (gps-geo.holePath: centerline > dragged target >
// fairway > bunkers > straight), zoomed out (gps-geo.flyoverPlan / flyoverCamera).
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'gps-geo.js'));
const geo = ON ? require('./gps-geo.js') : null;
const test = (name, fn) => test0(name, { skip: ON ? false : 'Consumer tree (GPS_ENABLED=0): no gps-geo.js' }, fn);
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const north = (p, m) => [p[0] + (m / geo.EARTH_RADIUS_M) * 180 / Math.PI, p[1]];
const east = (p, m) => [p[0], p[1] + (m / (geo.EARTH_RADIUS_M * Math.cos(p[0] * Math.PI / 180))) * 180 / Math.PI];
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tol ${tol})`);
const TEE = [33.6, -79.0];

test('a straight hole: the camera starts on the tee, is half way at 0.5, ends on the green, looking down the hole', () => {
    const green = north(TEE, 400);
    const a = geo.flyoverFrame([TEE, green], 0), b = geo.flyoverFrame([TEE, green], 0.5), c = geo.flyoverFrame([TEE, green], 1);
    close(geo.haversineMeters(a.pt, TEE), 0, 0.01);
    close(geo.haversineMeters(b.pt, TEE), 200, 0.5);
    close(geo.haversineMeters(c.pt, green), 0, 0.01);
    [a, b, c].forEach((f) => close(f.bearing, 0, 0.01, 'north'));
    close(geo.haversineMeters(geo.flyoverFrame([TEE, green], 7).pt, green), 0, 0.01, 'clamped past the green');
    close(geo.haversineMeters(geo.flyoverFrame([TEE, green], -1).pt, TEE), 0, 0.01, 'clamped before the tee');
});

test('a dogleg: by distance along the line (tee -> corner -> green), turning with it; the last fifth looks at the green', () => {
    const corner = north(TEE, 300), green = east(corner, 100);   // 300 m north, then 100 m east: 400 m
    const line = [TEE, corner, green];
    close(geo.haversineMeters(geo.flyoverFrame(line, 0.75).pt, corner), 0, 0.5, 'three quarters = the corner');
    close(geo.flyoverFrame(line, 0.1).bearing, 0, 0.5, 'the first leg looks north');
    const mid = geo.flyoverFrame(line, 0.7).bearing;
    assert.ok(mid > 5 && mid < 85, 'turning at the corner: ' + mid);
    const end = geo.flyoverFrame(line, 1);
    close(geo.haversineMeters(end.pt, green), 0, 0.5);
    assert.ok(isFinite(end.bearing) && end.bearing > 0 && end.bearing < 90, 'at the green: still looking at it, no spin: ' + end.bearing);
    close(geo.flyoverFrame(line, 0.95).bearing, end.bearing, 0.01, 'the last fifth holds one bearing');
    assert.equal(geo.flyoverFrame([TEE], 0.5), null);
    assert.equal(geo.flyoverFrame([TEE, TEE], 0.5), null, 'no length to fly');
    assert.equal(geo.flyoverFrame([{ lat: TEE[0], lng: TEE[1] }, { lat: north(TEE, 100)[0], lng: TEE[1] }], 0.5).bearing, 0, '{lat,lng} points too');
});

test('gps-view: behind its switch, MapLibre camera only (no video), any touch stops it, reduced motion = one still framing, back to the hole view', () => {
    const v = read('gps-view.js');
    assert.ok(/HardPanFeature\('flyover'\)/.test(v));
    assert.ok(/class="gps-fly-btn gps-float" data-feature="flyover"/.test(v) && /class="gps-fly-cap" data-feature="flyover"/.test(v));
    assert.ok(/if \(!flySwitch\(\)\) Array\.prototype\.forEach\.call\(el\.querySelectorAll\('\[data-feature="flyover"\]'\)/.test(v), 'switch off: removed');
    assert.ok(/plan\.ms/.test(v) && geo.FLYOVER_MS >= 4000 && geo.FLYOVER_MS <= 6000, 'about 5 s (4-6 asked, 009)');
    assert.ok(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(v) && /S\.flying = \{ still: true \};\s*frameHole\(false\);/.test(v), 'reduced motion: the whole hole at once');
    assert.ok(/\['pointerdown', 'touchstart', 'wheel'\]\.forEach/.test(v) && /endFlyover\('cancelled'\)/.test(v), 'any touch stops it');
    const end = v.slice(v.indexOf('function endFlyover('), v.indexOf('function rectOf('));
    assert.ok(/S\.map\.jumpTo\(\{ pitch: 0 \}\); S\.map\.setMaxPitch\(0\);/.test(end) && /frameHole\(false\);/.test(end), 'flat again, the normal hole view');
    assert.ok(!/<video|\.mp4|\.webm/.test(v), 'no video files');
});

// ---- 009: THE HOLE'S PATH ---------------------------------------------------------
const west = (p, m) => east(p, -m);
// A screen point for a MapLibre camera (512 px tiles, Web Mercator, bearing up, the
// camera's center at the middle of the view minus pad) - an independent check of the fit.
function screen(cam, p, view, pad) {
    const W = 512 * Math.pow(2, cam.zoom);
    const mx = (q) => [(q[1] + 180) / 360 * W, (1 - Math.log(Math.tan(Math.PI / 4 + q[0] * Math.PI / 360)) / Math.PI) / 2 * W];
    const c = mx(cam.center), a = mx(p), dx = a[0] - c[0], dy = a[1] - c[1], th = -cam.bearing * Math.PI / 180;
    const cx = pad.left + (view.w - pad.left - pad.right) / 2, cy = pad.top + (view.h - pad.top - pad.bottom) / 2;
    return [cx + dx * Math.cos(th) - dy * Math.sin(th), cy + dx * Math.sin(th) + dy * Math.cos(th)];
}
const inside = (cam, pts, view, pad, slack = 2) => pts.every((p) => { const q = screen(cam, p, view, pad); return q[0] >= pad.left - slack && q[0] <= view.w - pad.right + slack && q[1] >= pad.top - slack && q[1] <= view.h - pad.bottom + slack; });
const VIEW = { w: 390, h: 844 }, PAD = { top: 150, bottom: 210, left: 76, right: 76 };
// A dogleg right: 250 m north, then 130 m east.
const CORNER = ON ? north(TEE, 250) : null, GREEN = ON ? east(CORNER, 130) : null;   // the Consumer tree has no gps-geo
const ring = (c, m) => [north(c, m), east(c, m), north(c, -m), west(c, m)];

test('009 path priority: a drawn centerline, else the dragged target, else the fairway middle, else the bunkers, else straight', () => {
    const tgt = east(north(TEE, 240), 40);
    const all = { tee: TEE, mid: GREEN, line: [TEE, CORNER, GREEN], target: tgt, fairway: [ring(east(north(TEE, 230), 30), 25)],
        hazards: [{ type: 'fb', side: 'L', pt: west(north(TEE, 220), 5) }, { type: 'fb', side: 'R', pt: east(north(TEE, 225), 70) }] };
    let p = geo.holePath(all);
    assert.equal(p.src, 'centerline'); close(geo.haversineMeters(p.pts[1], CORNER), 0, 0.01);
    p = geo.holePath(Object.assign({}, all, { line: [TEE, GREEN] }));
    assert.equal(p.src, 'target', 'a 2-point line is only the straight line: the dragged target bends it');
    close(geo.haversineMeters(p.pts[1], tgt), 0, 0.01);
    p = geo.holePath(Object.assign({}, all, { line: null, target: null }));
    assert.equal(p.src, 'fairway'); close(geo.haversineMeters(p.pts[1], east(north(TEE, 230), 30)), 0, 2);
    p = geo.holePath(Object.assign({}, all, { line: null, target: null, fairway: [] }));
    assert.equal(p.src, 'hazards', 'a left and a right fairway bunker: between them');
    close(geo.haversineMeters(p.pts[1], east(north(TEE, 222.5), 32.5)), 0, 3);
    p = geo.holePath({ tee: TEE, mid: GREEN });
    assert.equal(p.src, 'straight'); assert.equal(p.pts.length, 2);
    // Tee and green are always the path's ends; a centerline's own ends are replaced.
    p = geo.holePath({ tee: TEE, mid: GREEN, line: [south(TEE, 30), CORNER, east(GREEN, 5)] });
    close(geo.haversineMeters(p.pts[0], TEE), 0, 0.01); close(geo.haversineMeters(p.pts[2], GREEN), 0, 0.01);
    // Nonsense bends are ignored: a target behind the tee, on the green, or way off the hole.
    assert.equal(geo.holePath({ tee: TEE, mid: GREEN, target: north(TEE, -50) }).src, 'straight', 'behind the tee');
    assert.equal(geo.holePath({ tee: TEE, mid: GREEN, target: GREEN }).src, 'straight', 'on the green');
    assert.equal(geo.holePath({ tee: TEE, mid: GREEN, target: west(north(TEE, 150), 400) }).src, 'straight', 'far off the hole');
    // A fairway (or bunkers) right on the straight line: straight, not a bend of 1 degree.
    const g2 = north(TEE, 380);
    assert.equal(geo.holePath({ tee: TEE, mid: g2, fairway: [ring(north(TEE, 200), 25)] }).src, 'straight');
    // Only one side's bunkers: no way to tell where the fairway is.
    assert.equal(geo.holePath({ tee: TEE, mid: GREEN, hazards: [all.hazards[0]] }).src, 'straight');
    assert.equal(geo.holePath({ tee: TEE }), null);
});
const south = (p, m) => north(p, -m);

test('009 the flight: starts on the whole hole, glides the path turning at the dogleg, ends on the green with F / C / B, 4-6 s', () => {
    const path = geo.holePath({ tee: TEE, mid: GREEN, line: [TEE, CORNER, GREEN] }).pts;
    const front = west(GREEN, 12), back = east(GREEN, 12), green = ring(GREEN, 15);
    const plan = geo.flyoverPlan({ path, green, pins: [front, GREEN, back], view: VIEW, pad: PAD, maxZoom: 19 });
    assert.ok(plan.ms >= 4000 && plan.ms <= 6000, 'duration ' + plan.ms);
    const c0 = geo.flyoverCamera(plan, 0), c1 = geo.flyoverCamera(plan, 1);
    assert.ok(inside(c0, [TEE, CORNER, GREEN].concat(green), VIEW, PAD), 'the start shows the whole hole: tee, corner, green');
    close(c0.pitch, 0, 0.01, 'flat at the start');
    assert.ok(inside(c1, [front, GREEN, back].concat(green), VIEW, PAD), 'the end frames the green and its pins');
    assert.ok(!inside(c1, [TEE], VIEW, PAD), 'the end is the green, not the whole hole again');
    assert.ok(c1.zoom > c0.zoom + 0.5, 'closer on the green than the whole hole: ' + c0.zoom + ' -> ' + c1.zoom);
    close(c1.pitch, 0, 0.01, 'flat at the end');
    // The glide: zoomed out (fairway + hazards wide), never closer than 1.2 steps inside the whole hole.
    assert.ok(plan.glideZoom >= c0.zoom && plan.glideZoom <= c0.zoom + 1.2 + 1e-9, 'glide height ' + plan.glideZoom + ' vs start ' + c0.zoom);
    const mpp = (z) => geo.EARTH_RADIUS_M * 2 * Math.PI * Math.cos(TEE[0] * Math.PI / 180) / (512 * Math.pow(2, z));
    assert.ok(mpp(plan.glideZoom) * (VIEW.w - PAD.left - PAD.right) >= 119, 'at least 120 m across: ' + mpp(plan.glideZoom) * 238);
    // Samples: it passes the corner, the bearing turns with the dogleg, it never steps back.
    let nearCorner = Infinity, prev = -1, tilted = 0;
    const bAt = [];
    for (let i = 0; i <= 200; i++) {
        const c = geo.flyoverCamera(plan, i / 200);
        nearCorner = Math.min(nearCorner, geo.haversineMeters(c.center, CORNER));
        assert.ok(c.along >= prev - 1e-9, 'the camera only goes forward along the path'); prev = c.along;
        tilted = Math.max(tilted, c.pitch);
        bAt.push({ s: c.along, b: c.bearing, t: i / 200 });
    }
    assert.ok(nearCorner < 25, 'the camera passes over the dogleg: ' + nearCorner);
    assert.ok(tilted >= 30, 'tilted while gliding: ' + tilted);
    const first = bAt.filter((x) => x.t > 0.36 && x.s < 0.3)[0], after = bAt.filter((x) => x.s > 0.8 && x.t < 0.7).pop();
    assert.ok(first && (first.b < 10 || first.b > 350), 'the first leg looks north: ' + JSON.stringify(first));
    assert.ok(after && after.b > 50 && after.b < 100, 'after the corner it looks east: ' + JSON.stringify(after));
    // Smooth: no jump of more than 6 degrees between two 1/200 samples.
    for (let i = 1; i < bAt.length; i++) { const d = Math.abs(((bAt[i].b - bAt[i - 1].b + 540) % 360) - 180); assert.ok(d < 6, 'bearing step ' + d + ' at ' + bAt[i].t); }
    // A straight hole flies straight: the bearing never turns.
    const sp = geo.flyoverPlan({ path: [TEE, north(TEE, 380)], green: ring(north(TEE, 380), 15), view: VIEW, pad: PAD, maxZoom: 19 });
    for (let i = 0; i <= 20; i++) { const b = geo.flyoverCamera(sp, i / 20).bearing; assert.ok(b < 0.5 || b > 359.5, 'straight: ' + b); }
    assert.equal(geo.flyoverPlan({ path: [TEE] }), null);
    assert.equal(geo.flyoverCamera(null, 0.5), null);
});

test('009 the dragged target bends the flight: tee -> target -> green', () => {
    const tgt = east(north(TEE, 230), 60), g = north(TEE, 400);
    const path = geo.holePath({ tee: TEE, mid: g, line: [TEE, g], target: tgt });
    const plan = geo.flyoverPlan({ path: path.pts, green: ring(g, 15), view: VIEW, pad: PAD, maxZoom: 19 });
    let near = Infinity;
    for (let i = 0; i <= 100; i++) near = Math.min(near, geo.haversineMeters(geo.flyoverCamera(plan, i / 100).center, tgt));
    assert.ok(near < 25, 'over the target: ' + near);
    assert.ok(inside(geo.flyoverCamera(plan, 0), [TEE, tgt, g], VIEW, PAD), 'the start shows tee, target and green');
});

test('009 gps-view flies holePath with the dragged target only once the golfer moved it, through flyoverPlan / flyoverCamera', () => {
    const v = read('gps-view.js');
    const fly = v.slice(v.indexOf('function flyPath('), v.indexOf('function endFlyover('));
    // 010 (switch osmPath): a GolfAPI hole with no line of its own borrows the bundled OSM line (gps_osm_path_test.js).
    assert.ok(/G\.holePath\(\{ tee: r\.tee, mid: r\.mid, line: osmPathFor\(S\.hole\) \|\| rec\.line, fairway: rec\.fairway, hazards: rec\.hazards, target: dragged \|\| null \}\)/.test(fly));
    assert.ok(/flyPath\(r, S\.targetMoved \? S\.target : null\)/.test(fly), 'the default target is not a bend');
    assert.ok(/G\.flyoverPlan\(/.test(fly) && /G\.flyoverCamera\(plan, t\)/.test(fly));
    assert.ok(/pins: \[nums\.front, r\.mid, nums\.back\]/.test(fly), 'ends on the F / C / B pins');
});
