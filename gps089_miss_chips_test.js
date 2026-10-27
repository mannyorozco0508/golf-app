// 089: MY MISS - THE CLUB CHIPS, THE NOTE, THE STEPPED FADE (pure + source checks). Manny, Oct 27:
// the centre stays at the club's real carry; a note "7-iron lands 8 yds long" (hidden within 2 yds);
// a 6-step fade under the ring, the ring fainter while the oval shows; two tappable club chips
// (the app's pick + the next club down), stacked bottom-left above Recenter, kept clear by the
// My miss label and the distance bubbles. Chrome: urgent089_miss_chips_chrome_test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-miss-pattern.js'));
const skip = ON ? false : 'Consumer tree: no GPS';
const M = ON ? require('./gps-miss-pattern.js') : null;
const bag = (o) => { const b = {}; Object.keys(o).forEach((k) => { b[k] = { yd: o[k] }; }); return b; };
const MB = bag({ '7i': 178, '8i': 165, '9i': 152, PW: 140, '6i': 192, '5i': 205, '4i': 218, Dr: 285, '3w': 255, Hy: 235 });

test('089: the two clubs around the plays-like - the pick and the next club down', { skip }, () => {
    assert.deepStrictEqual(M.chipPair(MB, '7i'), ['7i', '8i']);
    assert.deepStrictEqual(M.chipPair(MB, '8i'), ['8i', '9i']);
    assert.deepStrictEqual(M.chipPair(MB, '4i'), ['4i', '5i']);
    // Nothing shorter in the bag: one club.
    assert.deepStrictEqual(M.chipPair(MB, 'PW'), ['PW']);
    // The next club down is a hybrid (the caller then drops it - irons / wedges only): it is still "the next down" here.
    assert.deepStrictEqual(M.chipPair(MB, '3w'), ['3w', 'Hy']);
    assert.deepStrictEqual(M.chipPair(MB, null), []);
    assert.deepStrictEqual(M.chipPair({}, '7i'), ['7i']);
    // A club with no number is skipped.
    assert.deepStrictEqual(M.chipPair(bag({ '7i': 178, '8i': 0, '9i': 152 }), '7i'), ['7i', '9i']);
});

test('089: the chip count rules follow shows() - 2 in range, 1 when the next one down is not, 0 when the pick is not', { skip }, () => {
    // As gps-view's missPlan: no chips unless the app's pick itself draws the oval; then each club that would.
    const ok = (c, plays, q) => M.shows(Object.assign({ club: c, carry: MB[c].yd, greenYd: plays }, q || {})).ok;
    const chips = (pick, plays, q) => (ok(pick, plays, q) ? M.chipPair(MB, pick).filter((c) => ok(c, plays, q)) : []);
    assert.deepStrictEqual(chips('7i', 170), ['7i', '8i']);           // Papago 11: 7i + 8i
    assert.deepStrictEqual(chips('PW', 135), ['PW']);                  // nothing shorter
    assert.deepStrictEqual(chips('4i', 214), ['4i', '5i']);
    assert.deepStrictEqual(chips('Hy', 225), []);                      // a hybrid pick: no oval, no chips
    assert.deepStrictEqual(chips('7i', 170, { fromTee: true }), []);   // par-4/5 tee: none
    assert.deepStrictEqual(chips('7i', 170, { layup: true }), []);
    // A par-3 tee: the same chips as an approach.
    assert.deepStrictEqual(M.chipPair(MB, '7i').filter((c) => M.shows({ club: c, carry: MB[c].yd, greenYd: 170, fromTee: true }, { par: 3 }).ok), ['7i', '8i']);
    // The next club down out of range: one chip.
    const far = bag({ '7i': 178, '8i': 150 });
    assert.deepStrictEqual(M.chipPair(far, '7i').filter((c) => M.shows({ club: c, carry: far[c].yd, greenYd: 172 }).ok), ['7i']);
});

test('089: chip text - "+N long" / "−N short" / "on target" within 2 yds; metres', { skip }, () => {
    assert.strictEqual(M.chipText('7i', 7.6), '7i +8 long');
    assert.strictEqual(M.chipText('8i', -4.4), '8i −4 short');
    assert.strictEqual(M.chipText('8i', 2), '8i on target');
    assert.strictEqual(M.chipText('8i', -1.9), '8i on target');
    assert.strictEqual(M.chipText('8i', 2.4), '8i +2 long');
    assert.strictEqual(M.chipText('PW', 10, 'm'), 'PW +9 long');
    assert.strictEqual(M.chipText('PW', null), 'PW on target');
});

test('089: the note - "7-iron lands 8 yds long", short, left / right when off the line, hidden within 2 yds', { skip }, () => {
    assert.strictEqual(M.landNote('7-iron', 7.6, 0), '7-iron lands 8 yds long');
    assert.strictEqual(M.landNote('8-iron', -4.6, 0), '8-iron lands 5 yds short');
    assert.strictEqual(M.landNote('8-iron', -4.6, 3.2), '8-iron lands 5 yds short and 3 yds right');
    assert.strictEqual(M.landNote('8-iron', 0.5, -6), '8-iron lands 6 yds left');
    assert.strictEqual(M.landNote('7-iron', 1.9, 1.5), '');
    assert.strictEqual(M.landNote('7-iron', -2, 0), '');
    assert.strictEqual(M.landNote('7-iron', 11, 0, 'm'), '7-iron lands 10 m long');
    // Papago 11 (089 look): 7-iron 178, 158 to the middle, plays ~169.5 -> centre ~165.9, 8 long.
    const along = M.centreAt(178, 158, 169.5);
    assert.ok(Math.abs(along - 165.9) < 0.1, String(along));
    assert.strictEqual(M.landNote('7-iron', along - 158, 0), '7-iron lands 8 yds long');
    // The centre still sits at the club's real carry (unchanged).
    assert.strictEqual(M.oval('7i', 178, 'R', along).carry, along);
    assert.strictEqual(M.oval('7i', 178, 'R', along).avg, 178);
});

test('089: the stepped fade - 6 ovals, 100 / 86 / 72 / 58 / 44 / 30%, same centre and tilt', { skip }, () => {
    assert.deepStrictEqual(M.TUNE.FADE, [1, 0.86, 0.72, 0.58, 0.44, 0.30]);
    const f = M.oval('7i', 178, 'R', 165.6), st = M.fadeOvals(f);
    assert.strictEqual(st.length, 6);
    st.forEach((g, i) => {
        assert.ok(Math.abs(g.a - f.a * M.TUNE.FADE[i]) < 1e-9 && Math.abs(g.b - f.b * M.TUNE.FADE[i]) < 1e-9);
        assert.strictEqual(g.carry, f.carry); assert.strictEqual(g.tilt, f.tilt); assert.strictEqual(g.cx, f.cx);
    });
    // each inner one sits inside the outer one
    st.slice(1).forEach((g) => M.outline(g, 32).forEach((p) => assert.ok(M.inside(f, p[0], p[1]))));
    assert.strictEqual(f.a, 0.065 * 178, 'the oval itself is unchanged');
    assert.deepStrictEqual(M.fadeOvals(null), []);
});

test('089: gps-view - keep-clear lists, ring fade, the same two layers, gates, pill + Mark shot follow the chip', { skip }, () => {
    const v = read('gps-view.js');
    // The My miss label's obstacles and the distance bubbles' obstacles both include the chips.
    const lblObs = v.slice(v.indexOf('function missLblObstacles'), v.indexOf('function missLblSpots'));
    assert.match(lblObs, /\.gps-miss-chips > \*/);
    const bub = v.slice(v.indexOf("try { var mr = missRect(); if (mr) add(mr, M); }"), v.indexOf('// 066 #1: the golfer'));
    assert.match(bub, /'\.gps-miss-chips'/);
    // Ring fade: both circles + the width line 40%, the centre dot 85%.
    assert.match(v, /\.gps-target\.gps-target-mymiss \.gps-ring,\.gps-target\.gps-target-mymiss \.gps-ring-in,\.gps-target\.gps-target-mymiss \.gps-ring-line\{opacity:\.4;\}/);
    assert.match(v, /\.gps-target\.gps-target-mymiss \.gps-ring-dot\{opacity:\.85;\}/);
    // The fade lives in the same two layers (mymiss-fill, mymiss-line); the edge line only on the outer oval.
    assert.strictEqual((v.match(/map\.addLayer\(\{ id: 'mymiss-/g) || []).length, 2);
    assert.match(v, /id: 'mymiss-line', type: 'line', source: MISS_SRC, filter: \['==', \['get', 'k'\], 'miss'\]/);
    // The chips only exist with the oval: missClear empties them; missChipsSync needs S.missOval; missSync runs only when missShown() (not tournament / read-only).
    assert.match(v.slice(v.indexOf('function missClear'), v.indexOf('function missRingFade')), /missChipsSync\(\)/);
    assert.match(v, /if \(!c \|\| !S\.missOval \|\| !M\) \{ if \(box\)/);
    assert.match(v, /if \(!missShown\(\) \|\| S\.mode !== 'measure' \|\| S\.side !== 'gps'\) \{ missClear\(\); return; \}/);
    // No chips while a marked shot is open at the ball (mine).
    assert.match(v, /if \(!mine && typeof M\.chipPair === 'function'\)/);
    // The pill and Mark shot follow the tapped chip; Mark shot clears it.
    assert.match(v, /out\.club = clubShort\(mpc \|\| sg\.club\)/);
    assert.match(v, /ctx\.club = ctx\.noOpen \? null : \(pickClub \|\| C\.likelyClub/);
    assert.match(v, /var pickClub = null; try \{ pickClub = missPillClub\(\); \} catch \(e\) \{ pickClub = null; \}\s*S\.missPick = null;/);
    // Placement: stacked, 8 px inside the left row (which sits 8 px in) = 16 px from the edge, 10 px above Recenter, 40 px chips.
    assert.match(v, /\.gps-miss-chips\{position:absolute;left:8px;bottom:calc\(100% \+ 10px\);display:flex;flex-direction:column;/);
    assert.match(v, /\.gps-miss-chip\{pointer-events:auto;height:40px;/);
    // Nothing about the pick is stored (memory only).
    assert.doesNotMatch(v.slice(v.indexOf('function missPickClub'), v.indexOf('function missChipsSync')), /localStorage|sessionStorage|\.set\(|\.update\(/);
});
