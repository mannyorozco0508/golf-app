// 093 (Manny picked A, Oct 28): ON THE PAR 3 GPS VIEW, ONE CLUB SWITCHER PILL ("‹ 7i · middle ›") in place of
// the stacked My miss chips, same lower-left spot. › = more club, ‹ = less club, the end arrows dimmed, a swipe
// does the same; the pill keeps each chip's label; the "from tee" tag above it; the default (closest to the
// target), the oval, Plays-like and Mark shot unchanged. The My miss label + note leaves the map on a par 3 and
// shows as a small card for 4 s on a tap of the pill's middle (tap again hides). The carry arc labels dim ~60%.
// VoiceOver: "Club 7 iron, middle. Swipe or tap arrows to change." Approaches keep the chip stack.
// Pure + source checks (the Chrome test drives the real page).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-miss-pattern.js'));
const skip = ON ? false : 'Consumer tree: no GPS';
const M = ON ? require('./gps-miss-pattern.js') : null;
const V = ON ? read('gps-view.js') : '';
const bag = (o) => { const b = {}; Object.keys(o).forEach((k) => { b[k] = { yd: o[k] }; }); return b; };
const fnBody = (name) => { const i = V.indexOf('function ' + name + '('); assert.ok(i > 0, name + ' exists'); const j = V.indexOf('\n    function ', i + 10); return V.slice(i, j > 0 ? j : i + 4000); };

test('093: the switcher exists and is gated to the par 3 view (approaches keep the chip stack)', { skip }, () => {
    const on = fnBody('missSwitchOn');
    assert.match(on, /isPar3\(\)/, 'par 3 only');
    assert.match(on, /S\.missChips/, 'only where the chips would show');
    assert.match(on, /S\.missOval/, 'only with the oval');
    const sync = fnBody('missChipsSync');
    assert.match(sync, /if \(swOn\) \{ missSwitchSync\(/, 'par 3: the switcher');
    assert.match(sync, /gps-miss-chip'/, 'not par 3: the 089 / 089b chip stack is still built');
    assert.match(sync, /box\.className = 'gps-miss-chips'/, 'the same container (and its keep-clear lists) in the same spot');
});

test('093: arrows - › = more club (longer), ‹ = less club; the end arrows dimmed; the list shortest first', { skip }, () => {
    assert.match(fnBody('missSwitchList'), /a\.carry - b\.carry/, 'shortest first');
    const st = fnBody('missSwitchStep');
    assert.match(st, /i \+ \(dir > 0 \? 1 : -1\)/);
    assert.match(st, /j < 0 \|\| j >= list\.length\) return false/, 'nothing past either end');
    assert.match(st, /missChipTap\(list\[j\]\.club\)/, 'the same tap path as a chip (oval, pill, Mark shot follow)');
    const sw = fnBody('missSwitchSync');
    assert.match(sw, /'gps-miss-arrow gps-miss-less', '\u2039'/);
    assert.match(sw, /'gps-miss-arrow gps-miss-more', '\u203a'/);
    assert.match(sw, /lessOff = i <= 0, moreOff = i >= list\.length - 1/);
    assert.match(sw, /gps-miss-arrow-off/);
    assert.match(sw, /aria-disabled/);
    assert.match(V, /\.gps-miss-arrow\.gps-miss-arrow-off\{opacity:\.28;\}/, 'dimmed');
});

test('093: swipe left = more club, right = less club (24 px, mostly sideways); a swipe never also taps', { skip }, () => {
    const sw = fnBody('missSwitchSync');
    assert.match(V, /MISS_SWIPE_PX = 24/);
    assert.match(sw, /Math\.abs\(dx\) >= MISS_SWIPE_PX && Math\.abs\(dx\) > Math\.abs\(dy\) \* 1\.2/);
    assert.match(sw, /missSwitchStep\(dx < 0 \? 1 : -1\)/);
    assert.match(sw, /if \(swiped\(\)\) return; missSwitchStep\(-1\)/);
    assert.match(sw, /if \(swiped\(\)\) return; missCardShow/);
    assert.match(V, /gps-miss-pill\{[^}]*touch-action:none/, 'the map does not pan under a swipe');
});

test('093: the pill keeps each chip label ("6i · middle +11", "5i · back −2", "8i · front +15")', { skip }, () => {
    assert.strictEqual(M.depthText('6i', { zone: 'middle', off: 11 }), '6i · middle +11');
    assert.strictEqual(M.depthText('5i', { zone: 'back', off: -2 }), '5i · back \u22122');
    assert.strictEqual(M.depthText('8i', { zone: 'front', off: 15 }), '8i · front +15');
    assert.strictEqual(M.depthText('7i', { zone: 'middle', off: 1 }), '7i · middle');
    const sw = fnBody('missSwitchSync');
    assert.match(sw, /M\.depthText\(clubShort\(x\.club\), x\.spot, u\) : M\.chipText\(clubShort\(x\.club\), x\.delta, u\)/, 'the same text as the chip');
    // The default is still the club closest to the target (gps-miss-pattern unchanged).
    const r = M.depthChips({ bag: bag({ LW: 84, SW: 104, GW: 121, PW: 133 }), front: 79, middle: 101, back: 122, aimYd: 101, app: 'SW' });
    assert.strictEqual(r.def, 'SW');
});

test('093: "from tee" tag right above the pill, only when measuring from the tee', { skip }, () => {
    const sw = fnBody('missSwitchSync');
    assert.match(sw, /fromTee = c\.from === 'tee'/);
    assert.match(sw, /if \(fromTee && !ftag\) \{[^}]*'from tee'[^}]*box\.insertBefore\(ftag, box\.firstChild\)/);
    assert.match(sw, /else if \(!fromTee && ftag\) box\.removeChild\(ftag\)/);
});

test('093: the label + note leave the map on a par 3; the middle tap shows them as a card for 4 s, tap again hides', { skip }, () => {
    assert.match(V, /S\.missLblText = \{ lbl: lbl, note: note \|\| '' \};\n\s+if \(missSwitchOn\(\)\) \{\n\s+if \(S\.markers && S\.markers\.mymiss\) marker\('mymiss', null\);/);
    assert.match(V, /MISS_CARD_MS = 4000/);
    assert.match(fnBody('missSwitchSync'), /missCardShow\(!missCardShown\(\)\)/, 'toggle');
    const show = fnBody('missCardShow');
    assert.match(show, /setTimeout\(/);
    assert.match(show, /MISS_CARD_MS/);
    const cs = fnBody('missCardSync');
    assert.match(cs, /L\.lbl/); assert.match(cs, /L\.note/);
    assert.match(V, /gps-miss-card\{[^}]*pointer-events:none/, 'taps go through the card to the map');
});

test('093: carry arc labels dimmed ~60% while the switcher shows; VoiceOver label', { skip }, () => {
    assert.match(V, /#gps-overlay\.gps-miss-switch-on \.gps-carry-lbl\{opacity:\.4 !important;\}/);
    assert.match(fnBody('missChipsSync'), /classList\.toggle\('gps-miss-switch-on', swOn\)/);
    assert.match(fnBody('missSwitchSync'), /'Club ' \+ missSpeakClub\(x\.club\) \+ ', ' \+ rest \+ '\. Swipe or tap arrows to change\.'/);
    assert.match(fnBody('missSpeakClub'), /replace\(\/-\/g, ' '\)/, '"7-iron" is read "7 iron"');
});

test('093: nothing stored, nothing sent; no money code touched', { skip }, () => {
    const all = ['missSwitchOn', 'missSwitchList', 'missSwitchStep', 'missSwitchSync', 'missCardShown', 'missCardShow', 'missCardSync'].map(fnBody).join('\n');
    assert.doesNotMatch(all, /localStorage|sessionStorage|firebase|\.ref\(|fetch\(|XMLHttpRequest/);
});

test('093 + 094 spec item 4: no label under a button, the pill or another label (nudge, else hide)', { skip }, () => {
    const cc = fnBody('clearCarryLbls');
    assert.match(cc, /\.gps-miss-chips > \*, \.gps-leftrow > \*, \.gps-ld-plays, \.gps-game-pill, \.gps-zoom, \.gps-ld-top, \.gps-ld-bottom/, 'carry labels keep off the pill, the "from tee" tag, Recenter, the Plays-like pill, zoom, the bars');
    assert.match(cc, /data-carry-hidden/, 'nowhere clear: hidden (lowest priority first)');
    const gl = fnBody('placeGreenLabels');
    assert.match(gl, /rc9\('\.gps-leftrow > \*, \.gps-miss-chips > \*', left9\)/);
    assert.match(gl, /var all9 = left9\.concat\(placed\);/, 'F / C / B: never on the left column, the rail or another label');
    assert.match(gl, /data-green-hidden/);
    const pp = fnBody('placePills0');
    assert.match(pp, /place\(rc5, SIZES\[j5\], pass5 \? 'beside-line-oval' : 'beside-line'\)/, 'a crowded bubble tries just beside its line before the crowded spot');
    assert.ok(pp.indexOf("'beside-line'") < pp.indexOf("'line-crowded'"), 'before the always-shown fallback');
});

test('093 + 094 spec item 4: the "20 yd" ring label never under a button / the pill / a bar - the other end, else off', { skip }, () => {
    const st = fnBody('sizeTarget');
    assert.match(st, /if \(under\(sgn\)\) \{ if \(!under\(-sgn\)\) sgn = -sgn; else \{ lbl\.style\.display = 'none';/);
    assert.match(st, /\.gps-right > \*, \.gps-ld-rail > \*, \.gps-miss-chips > \*/);
});
