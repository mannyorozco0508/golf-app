// ============================================================================
// HARDPAN GPS - HOLE FLYOVER / PREVIEW (008, switch flyover)
//
// gps-geo.flyoverFrame says where the camera is a fraction of the way down the
// hole's own line and which way it looks; gps-view.js flies MapLibre's camera with
// it (about 4 s, then back to the hole view), stops on any touch, and with
// prefers-reduced-motion frames the whole hole at once instead.
// tools/gps-flyover-check.js runs it in headless Chrome (WebGL).
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
    assert.ok(/FLY_MS = 4000/.test(v), 'about 4 s (3-5 asked)');
    assert.ok(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(v) && /S\.flying = \{ still: true \};\s*frameHole\(false\);/.test(v), 'reduced motion: the whole hole at once');
    assert.ok(/\['pointerdown', 'touchstart', 'wheel'\]\.forEach/.test(v) && /endFlyover\('cancelled'\)/.test(v), 'any touch stops it');
    const end = v.slice(v.indexOf('function endFlyover('), v.indexOf('function rectOf('));
    assert.ok(/S\.map\.jumpTo\(\{ pitch: 0 \}\); S\.map\.setMaxPitch\(0\);/.test(end) && /frameHole\(false\);/.test(end), 'flat again, the normal hole view');
    assert.ok(!/<video|\.mp4|\.webm/.test(v), 'no video files');
});
