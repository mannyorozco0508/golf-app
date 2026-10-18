// ============================================================================
// GPS LAYOUT C (mailbox 011): the round chip's numbers, and the switches.
//   node gps_layout_c_test.js
// The chip's net is the SCORECARD's net: gross minus getStrokes(hole index, parseHcp(hcp))
// from handicap.js (loaded here as the page loads it), summed over the holes scored.
// The layout itself is played in Chrome by tools/gps-layout-c-check.js.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
if (!fs.existsSync(path.join(__dirname, 'gps-view.js'))) { console.log('Consumer tree (GPS_ENABLED=0): no GPS - skipped.'); process.exit(0); }
const V = require('./gps-view.js');
const hc = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'handicap.js'), 'utf8') + ';this.getStrokes=getStrokes;this.parseHcp=parseHcp;', hc);
const strokes = (idx, hcp) => hc.getStrokes(idx, hc.parseHcp(hcp));

// An 18-hole card: pars 4,4,3,5,4,4,3,5,4 / 4,5,3,4,4,5,3,4,4; hole indexes odd out, even in.
const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];
const SI = [7, 3, 15, 1, 11, 5, 17, 9, 13, 8, 2, 16, 4, 12, 6, 18, 10, 14];
const card = PARS.map((par, i) => ({ hole: i + 1, par, hcpIndex: SI[i] }));
const sc = (id, m) => Object.fromEntries(Object.entries(m).map(([h, v]) => ['p' + id + '_h' + h, v]));

// 1. A 9-hole PARTIAL (holes 1-5 of the front nine), handicap 9: strokes on SI <= 9 -> holes 1 (7), 2 (3), 4 (1).
let rs = V.roundScore({ courseData: card.slice(0, 9), scores: sc(1, { 1: 5, 2: 4, 3: 3, 4: 6, 5: 5 }), id: 1, hcp: '9', strokes });
assert.deepStrictEqual(rs, { thru: 5, gross: 23, grossToPar: 3, net: 20, netToPar: 0 });
assert.strictEqual(V.roundScoreText(rs), 'Thru 5 · 23 (+3) · Net 20 (E)');

// 2. A BACK-NINE START (the 10th tee; shotgun alike): 10, 11, 12 scored - "Thru 3", not "Thru 12".
//    Handicap 20: one stroke everywhere plus a second on SI 1-2 (hole 11 is SI 2).
rs = V.roundScore({ courseData: card, scores: sc(7, { 10: 5, 11: 6, 12: 2 }), id: 7, hcp: '20', strokes });
assert.deepStrictEqual(rs, { thru: 3, gross: 13, grossToPar: 1, net: 9, netToPar: -3 });
assert.strictEqual(V.roundScoreText(rs), 'Thru 3 · 13 (+1) · Net 9 (−3)');
// ... and the other golfer's scores (and a 0 / blank) are not counted.
rs = V.roundScore({ courseData: card, scores: Object.assign(sc(7, { 10: 5, 13: 0 }), sc(8, { 10: 9, 11: 9 })), id: 7, hcp: '20', strokes });
assert.strictEqual(rs.thru, 1); assert.strictEqual(rs.gross, 5);

// 3. NO HANDICAP: gross only.
rs = V.roundScore({ courseData: card, scores: sc(2, { 1: 3, 2: 4 }), id: 2, hcp: '', strokes });
assert.deepStrictEqual(rs, { thru: 2, gross: 7, grossToPar: -1, net: null, netToPar: null });
assert.strictEqual(V.roundScoreText(rs), 'Thru 2 · 7 (−1)');
assert.strictEqual(V.roundScore({ courseData: card, scores: sc(2, { 1: 4 }), id: 2, hcp: undefined, strokes }).net, null);
// A plus handicap gives strokes back (the canonical getStrokes): +2 on SI 17 and 18.
rs = V.roundScore({ courseData: card, scores: sc(3, { 7: 3, 16: 3 }), id: 3, hcp: '+2', strokes });
assert.deepStrictEqual(rs, { thru: 2, gross: 6, grossToPar: 0, net: 8, netToPar: 2 });

// 4. NOTHING SCORED: "Thru 0 · E".
rs = V.roundScore({ courseData: card, scores: {}, id: 1, hcp: '9', strokes });
assert.strictEqual(rs.thru, 0);
assert.strictEqual(V.roundScoreText(rs), 'Thru 0 · E');

// 5. The switches ship ON, and the view reads them by name.
const cfgSrc = fs.readFileSync(path.join(__dirname, 'gps-config.js'), 'utf8');
assert.ok(/gpsLayoutC: true/.test(cfgSrc) && /gpsRoundScore: true/.test(cfgSrc), 'both 011 switches ship on');
const src = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
assert.ok(src.includes("HardPanFeature('gpsLayoutC')") && src.includes("HardPanFeature('gpsRoundScore')"));
// Off = the old layout: every layout-C rule is scoped to .gps-lc / the new elements.
assert.ok(/if \(lc\) buildLayoutC\(el\)/.test(src), 'layout C is built only when its switch is on');
// The chip never does its own money or handicap arithmetic: getStrokes / parseHcp only.
assert.ok(/getStrokes\(idx, parseHcp\(hcp\)\)/.test(src));
console.log('gps_layout_c_test: all passed');
