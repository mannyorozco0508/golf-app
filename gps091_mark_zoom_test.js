// 091 (Manny APPROVED Oct 27) - pure checks: Mark is its own button in layout D's bottom row (Card | Enter score | Mark),
// the full-width Mark shot bar is gone, the zoom opens at 2x and cycles 2x -> 4x -> the full hole -> 2x, and the course
// check's new rule (Manny's OK): the view's centre lies on the hole - a centre off the hole FAILS (negative control).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const V = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
const MD = fs.readFileSync(path.join(__dirname, 'gps-mark-distance.js'), 'utf8');
const CC = fs.readFileSync(path.join(__dirname, 'tools', 'gps-course-check.js'), 'utf8');
global.window = global; require('./gps-geo.js'); const G = window.HardPanGeo;

// The pure rule, lifted out of gps-view.js as written.
function lift(name) {
    const i = V.indexOf('    function ' + name + '(');
    assert.ok(i > 0, name + ' is in gps-view.js');
    let d = 0, k = V.indexOf('{', i);
    for (let n = k; n < V.length; n++) { if (V[n] === '{') d++; else if (V[n] === '}') { d--; if (!d) return V.slice(i, n + 1); } }
    throw new Error('unbalanced ' + name);
}
const ll = (p) => ({ lng: p[1], lat: p[0] });
// eslint-disable-next-line no-new-func
const viewCenterOnHole = new Function('G', 'll', lift('viewCenterOnHole') + '\nreturn viewCenterOnHole;')(G, ll);

test('091: the bottom row - Mark moves INTO the Card row, the full-width bar is gone', () => {
    assert.ok(/put\(bot, '\.gps-bottom'\); put\(bot, '\.gps-actions'\);/.test(V), 'the row and the actions');
    assert.ok(!/put\(bot, '\.gps-mark-shot'\)/.test(V), 'no full-width Mark shot bar in .gps-ld-bottom');
    assert.ok(/bRow\.appendChild\(msb\); msb\.classList\.add\('gps-ld-mark'\);/.test(V), 'Mark at the row\'s right end');
    assert.ok(!/gps-ld-bottom \.gps-mark-shot\{width:100%/.test(V), 'the bar\'s full-width style is gone');
    assert.ok(/\.gps-ld-bottom \.gps-bottom \.gps-mark-shot\{flex:0 0 auto;width:56px;/.test(V), 'Mark = Card\'s 56 px');
    assert.ok(/\.gps-ld-bottom \.gps-side-bets,#gps-overlay\.gps-ld \.gps-ld-bottom \.gps-tools,#gps-overlay\.gps-ld \.gps-ld-bottom \.gps-door-add\{width:56px;/.test(V), 'Card is 56 px');
    assert.ok(/<span class="gps-ico" aria-hidden="true">\\u25CE<\/span><span class="gps-cap">/.test(V), '◎ over the caption');
    assert.ok(/if \(!S \|\| !S\.measureFrom\) return 'Mark';/.test(V), '"Mark"');
    // The same element, the same tap, the same show / hide rule (only-add: nothing else moved).
    assert.ok(/on\(el, '\.gps-mark-shot', function \(\) \{ closeMenus\(\); markShotHere\(\); \}\)/.test(V));
    assert.ok(/mb\.style\.display = S && S\.pro && S\.mode === 'measure' && !S\.replay \? '' : 'none';/.test(V));
    // Layouts C / old: unchanged (C's panel, the old right stack).
    assert.ok(/put\(acts, '\.gps-green-view'\); put\(acts, '\.gps-mark-shot'\); put\(acts, '\.gps-fly-btn'\);/.test(V));
    // A layout switch puts the button back as it was.
    assert.ok(/h\.n\.matches\('\.gps-mark-shot'\) && h\.n\.classList\.contains\('gps-ld-mark'\)\) \{ h\.n\.classList\.remove\('gps-ld-mark'\);/.test(V));
});

test('091: the new button is on the keep-clear lists', () => {
    assert.ok(/'\.gps-leftrow \.gps-recenter', '\.gps-bottom', '\.gps-actions', '\.gps-panel', '\.gps-ld-bottom \.gps-mark-shot'\]/.test(V), 'the clear-map edge');
    assert.ok(/'\.gps-ld-bottom', '\.gps-ld-bottom \.gps-mark-shot'\]\.forEach\(function \(sel\) \{ add\(rectOf/.test(V), 'the distance bubbles');
    assert.ok(/\.gps-miss-chips > \*, \.gps-ld-bottom \.gps-mark-shot'\), add\);/.test(V), 'the My miss label');
});

test('091: KP / long-drive Mark row stays its own row above the Card row', () => {
    assert.ok(/var row = el\.querySelector\('\.gps-ld-bottom > \.gps-bottom'\);/.test(MD));
    assert.ok(/ms\.parentNode === box\.parentNode/.test(MD), 'full width (solo) when Mark shot is not beside it');
});

test('091: the zoom - opens at 2x; 2x -> 4x -> the full hole -> 2x; switch off = build 5 exactly', () => {
    assert.ok(/var ZOOM_STEPS = \[1, 2\];/.test(V), 'build 5\'s cycle kept (switch gpsZoomIn off)');
    assert.ok(/var ZOOM_CYCLE_091 = \[2, 4, 1\];/.test(V));
    assert.ok(/HardPanFeature\('gpsZoomIn'\) !== false/.test(V), 'on unless switched off');
    assert.ok(/var dz = zoomInSwitch\(\) \? zoomCam\(cam, zoomFactor\(0\)\) : cam;/.test(V), 'frameHole opens on the 2x view');
    assert.ok(/S\.camera = cam;\n\s+S\.zoomBase = cam\.zoom;/.test(V), 'S.camera stays the FULL hole');
    assert.ok(/zoom: Math\.min\(cam\.zoom \+ Math\.log2\(f\), maxZoomNow\(\)\)/.test(V), 'never past the imagery');
    assert.ok(/if \(next === 0\) \{\n\s+if \(S\.camera\) \{ frameHole\(false\); return; \}/.test(V), 'the cycle\'s end = frameHole = the 2x default');
    // The cycle as numbers.
    const cyc = [2, 4, 1], seq = []; let st = 0;
    for (let i = 0; i < 4; i++) { seq.push(cyc[st]); st = (st + 1) % cyc.length; }
    assert.deepEqual(seq, [2, 4, 1, 2]);
});

test('091: the course check (Manny\'s OK) - tee + green on the full frame, the view centre on the hole', () => {
    assert.ok(/centerOnHole: viewCenterOnHole\(cp, r\.tee, g, fb\)/.test(V));
    assert.ok(/teeIn: inV\(r\.tee, fb\), greenIn: inV\(g, fb\)/.test(V), 'measured on the full frame');
    assert.ok(/const mapOk = !!\(hc && hc\.teeIn && hc\.greenIn && gkm != null && gkm <= 2 && ctrOk\);/.test(CC));
    const tee = [33.46, -111.96], green = G.destination(tee, 0, 380);
    assert.equal(viewCenterOnHole(G.destination(tee, 0, 230), tee, green, null), true, 'the 2x view on the target');
    assert.equal(viewCenterOnHole(G.destination(G.destination(tee, 0, 200), 90, 90), tee, green, null), true, 'a dogleg target 90 m off the line');
    assert.equal(viewCenterOnHole(green, tee, green, null), true);
    // NEGATIVE CONTROLS: off the hole fails.
    assert.equal(viewCenterOnHole(G.destination(tee, 270, 1000), tee, green, null), false, '1 km off: FAIL');
    assert.equal(viewCenterOnHole(G.destination(tee, 90, 400), tee, green, null), false, 'the next fairway over: FAIL');
    assert.equal(viewCenterOnHole(G.destination(green, 0, 600), tee, green, null), false, '600 m past the green: FAIL');
    assert.equal(viewCenterOnHole([40.7, -74.0], tee, green, null), false, 'another city: FAIL');
    assert.equal(viewCenterOnHole(null, tee, green, null), false);
    // A bounds that does not hold the centre fails.
    assert.equal(viewCenterOnHole(G.destination(tee, 0, 230), tee, green, { contains: () => false }), false);
});
