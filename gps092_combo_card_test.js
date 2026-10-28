// ============================================================================
// 092 THE COMBO CARD (Manny APPROVED Oct 27 - outbox/092-PREVIEW.md + 092-ANSWERS.md) - pure checks.
//
//   tiles      HardPanGpsStats.quick.tiles: TO PAR / THRU from the live scores, PUTTS / FAIRWAYS (par 4s and
//              5s answered) / GREENS from the phone-only quick-stats record - the round summary's own sums
//   tracked    HardPanGpsStats.sheet.statsFor: the Enter score sheet's rule (quick stats on, not a Practice
//              round, this phone's golfer or "Track stats for others") - tiles and the putts row hide otherwise
//   keys       fixed 1-6 + 7+ for every par, par lime, labels ACE / EAGLE / BIRDIE / PAR / BOGEY / DOUBLE
//   marks      the 081 rule (window.scoreMark: score-marks.js + score-marks-hp.js), never a copy
//   data       a score only through gpsCardCtx(...).save (index.html gpsSheetHole -> saveScore); putts only
//              through quick.set; no new p*_h* / stats keys, no Firebase call in the sheet; gpsOpenSheet and
//              the Enter score sheet untouched; the names and exports 091's Card button calls kept.
// The Chrome half: urgent092_combo_card_chrome_test.js. NEGATIVE CONTROL: every test here fails on 867f3f20
// (no quick.tiles / sheet.statsFor / gpsCardCtx / COMBO markup there).
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-stats.js')) && fs.existsSync(path.join(__dirname, 'gps-round.js'));
const skip = ON ? false : 'Consumer tree: no GPS card';

function sandbox(ls) {
    const store = ls || {};
    const localStorage = { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i], getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-stats.js'), sb);
    return { St: sb.HardPanGpsStats, store };
}
const J = (x) => JSON.parse(JSON.stringify(x));
// The COMBO block of gps-round.js (section 5's card sheet), for the static checks.
function ccBlock() {
    const src = read('gps-round.js');
    const a = src.indexOf('092 THE COMBO CARD'), b = src.indexOf('function closeCompactCard()', a);
    assert.ok(a > 0 && b > a, 'the COMBO card block is in gps-round.js');
    return src.slice(a, src.indexOf('\n    }', b) + 6);
}

test('092 tiles: to par / thru from scores; putts, fairways (par 4s and 5s answered), greens from the phone record', { skip }, () => {
    const { St } = sandbox();
    const Q = St.quick, ctx = { code: 'T092A', course: 'X' };
    assert.strictEqual(typeof Q.tiles, 'function', 'HardPanGpsStats.quick.tiles exported');
    // Dan, as in the preview picture: pars 4 5 4 3 4, scores 4 5 3 4 4, putts 2 2 1 2 2, fairways hit hit L - hit.
    const pars = [4, 5, 4, 3, 4, 3], s = [4, 5, 3, 4, 4, 0], putts = [2, 2, 1, 2, 2], fw = ['hit', 'hit', 'L', null, 'hit'];
    putts.forEach((p, i) => Q.set(ctx, 102, i + 1, { putts: p }, s[i], pars[i]));
    fw.forEach((f, i) => { if (f) Q.set(ctx, 102, i + 1, { fw: f }, s[i], pars[i]); });
    const holes = pars.map((par, i) => ({ n: i + 1, par, s: s[i] }));
    const t = J(Q.tiles('T092A', 102, holes));
    assert.strictEqual(t.thru, 5);
    assert.strictEqual(t.toPar, 0, 'E');
    assert.deepStrictEqual([t.putts, t.puttHoles], [9, 5], 'putts 9');
    assert.deepStrictEqual([t.fwHit, t.fwChances], [3, 4], 'fairways 3/4 (the par 3 never counts)');
    // GIR: 4-2=2<=2 y, 5-2=3<=3 y, 3-1=2<=2 y, 4-2=2>1 n, 4-2=2<=2 y -> 4/5.
    assert.deepStrictEqual([t.gir, t.girHoles], [4, 5], 'greens 4/5');
    // A hole with no score never counts, even with putts tapped (putts come before the score).
    Q.set(ctx, 102, 6, { putts: 1 }, 0, 3);
    const t2 = J(Q.tiles('T092A', 102, holes));
    assert.deepStrictEqual([t2.thru, t2.putts, t2.puttHoles], [5, 9, 5], 'putts on an unscored hole wait for the score');
    // Under par / over par.
    assert.strictEqual(Q.tiles('T092A', 103, [{ n: 1, par: 4, s: 3 }, { n: 2, par: 5, s: 5 }]).toPar, -1);
    assert.strictEqual(Q.tiles('T092A', 103, [{ n: 1, par: 4, s: 6 }]).toPar, 2);
    // No record: zeroes, never a throw.
    assert.deepStrictEqual(J(Q.tiles('NONE', 1, [])), { thru: 0, strokes: 0, par: 0, toPar: 0, putts: 0, puttHoles: 0, fwHit: 0, fwChances: 0, gir: 0, girHoles: 0 });
});

test('092 tracked: tiles + putts row only with quick stats on, not Practice, for this phone\'s golfer or Track stats for others', { skip }, () => {
    const { St, store } = sandbox();
    const S = St.sheet;
    assert.strictEqual(typeof S.statsFor, 'function', 'HardPanGpsStats.sheet.statsFor exported');
    const ctx = { code: 'T092B', stats: true, own: '103', pick: '103' };
    assert.strictEqual(S.statsFor(ctx, '103'), true, 'this phone\'s golfer');
    assert.strictEqual(S.statsFor(ctx, '101'), false, 'another golfer');
    store.hardpan_stats_others = '1';
    assert.strictEqual(S.statsFor(ctx, '101'), true, 'Track stats for others');
    delete store.hardpan_stats_others;
    assert.strictEqual(S.statsFor(Object.assign({}, ctx, { stats: false }), '103'), false, 'quick stats off (no GPS Pro)');
    store.hardpan_nostats_T092B = 'practice';
    assert.strictEqual(S.statsFor(ctx, '103'), false, 'a Practice round');
    delete store.hardpan_nostats_T092B;
    assert.strictEqual(S.statsFor(Object.assign({}, ctx, { own: null }), '103'), false, 'a phone that is nobody');
    assert.strictEqual(S.statsFor(null, '103'), false);
});

test('092 keys: fixed 1-6 + 7+ for every par, par lime, the labels', { skip }, () => {
    const B = ccBlock();
    const m = /function ccKeyLabel\(n, par\) \{[\s\S]*?\n    \}/.exec(B);
    assert.ok(m, 'ccKeyLabel');
    const label = vm.runInNewContext('(' + m[0].replace('function ccKeyLabel', 'function') + ')');
    assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map((n) => label(n, 3)), ['ACE', 'BIRDIE', 'PAR', 'BOGEY', 'DOUBLE', '+3']);
    assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map((n) => label(n, 4)), ['ACE', 'EAGLE', 'BIRDIE', 'PAR', 'BOGEY', 'DOUBLE']);
    assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map((n) => label(n, 5)), ['ACE', '\u22123', 'EAGLE', 'BIRDIE', 'PAR', 'BOGEY']);
    assert.match(B, /for \(var v = 1; v <= 6; v\+\+\) ks \+= key\(v,/, 'keys 1-6 for every par');
    assert.match(B, /data-cc-seven="1"[^\n]*'7\+'/, 'then 7+');
    assert.match(B, /\(v === par \? ' par' : ''\)/, 'the par key is marked par (lime)');
    assert.match(B, /for \(var m2 = 7; m2 <= 15; m2\+\+\)/, '7+ opens 7-15 (the Enter score sheet\'s own top, 15)');
    assert.match(B, /\[0, 1, 2, 3, 4\]\.map[\s\S]{0,700}k === 4 \? '4\+'/, 'putts 0 1 2 3 4+');
    assert.match(B, /\.hp-cc-key\.par\{background:var\(--cc-lime\)/, 'lime');
});

test('092 marks: the 081 rule (window.scoreMark), its four classes, the same reds and navies', { skip }, () => {
    const B = ccBlock();
    assert.match(B, /window\.scoreMark/, 'scoreMark, not a copy of the rule');
    ['birdie', 'eagle', 'bogey', 'double'].forEach((k) => assert.ok(B.indexOf('.hp-cc-n.mark-' + k + '{') !== -1, 'mark-' + k));
    assert.match(B, /--cc-red:#ff6b76/, 'dark red'); assert.match(B, /--cc-red:#c1121f/, 'light red');
    assert.match(B, /--cc-navy:#1d3557/, 'light navy');
    // And the rule itself (score-marks.js + score-marks-hp.js, unchanged).
    const sb = {}; sb.window = sb; vm.createContext(sb);
    vm.runInContext(read('score-marks.js') + ';window.scoreMark=scoreMark;', sb);
    vm.runInContext(read('score-marks-hp.js'), sb);
    assert.deepStrictEqual([2, 3, 4, 5, 6, 7].map((s) => sb.scoreMark(s, 4)), ['eagle', 'birdie', '', 'bogey', 'double', 'double']);
});

test('092 data: scores only through gpsCardCtx save, putts only through quick.set; no Firebase, no new keys', { skip }, () => {
    const B = ccBlock();
    assert.doesNotMatch(B, /\bdb\.ref\b|firebase|\.update\(|durableWrite|saveScore\(|localStorage\.setItem/, 'the sheet writes nothing itself');
    assert.match(B, /ctx\.save\(pid, v\)/, 'a score: the hole context\'s own save');
    assert.match(B, /Q\.set\(ctx, pid, n, \{ putts:/, 'putts: the quick-stats record');
    assert.doesNotMatch(B, /['"]p['"] \+ [^\n]*_h['"][^\n]*\] =/, 'no p<id>_h<n> key written here');
    // index.html: gpsCardCtx is add-only, in a GPS block, built on gpsSheetHole (-> saveScore).
    const H = read('index.html');
    const a = H.indexOf('function gpsCardCtx(hole, fallback)');
    assert.ok(a > 0, 'gpsCardCtx');
    const fn = H.slice(a, H.indexOf('\n    }\n', a));
    assert.match(fn, /gpsSheetHole\(n, fallback\)/, 'the Enter score sheet\'s own hole context');
    assert.match(fn, /next: \(\) => \{ if \(Number\(currentViewedHole\) === n\) gpsStepHole\(1\); \}/, 'Next: the card\'s own');
    assert.match(fn, /R\.openFinish\(\)/, 'Finish & settle up: the existing one (display only)');
    const before = H.slice(0, a), begin = before.lastIndexOf('GPS:BEGIN'), end = before.lastIndexOf('GPS:END');
    assert.ok(begin > end, 'gpsCardCtx sits in a GPS block (Consumer never ships it)');
    // gpsOpenSheet is unchanged: still opens the sheet with the same ctx.
    assert.match(H, /function gpsOpenSheet\(hole, playerId\) \{\n        const S = window\.HardPanGpsStats\.sheet;/);
});

test('092 kept: names, exports, Full card ›, swipe, map tap, live refresh, the old box attributes, aria-label', { skip }, () => {
    const src = read('gps-round.js'), B = ccBlock();
    assert.match(src, /openCompactCard: openCompactCard, closeCompactCard: closeCompactCard, compactCardOpen: compactOpen/, 'the window.HardPanRound exports 091\'s Card button calls');
    assert.match(read('gps-view.js'), /R\.openCompactCard\(\)/, 'gps-view.js calls it unchanged');
    assert.match(B, /setAttribute\('aria-label', 'Scorecard'\)/);
    assert.match(B, /data-cc-full="1">Full card ›/);
    assert.match(B, /closeCompactCard\(\); toFullCard\(\);/);
    assert.match(B, /if \(t === w\) \{ closeCompactCard\(\); return; \}/, 'a tap on the map closes it');
    assert.match(B, /if \(dy > 90\) closeCompactCard\(\)/, 'swipe down closes it');
    assert.match(B, /setInterval\([\s\S]{0,200}\}, 400\)/, 'live refresh');
    assert.match(B, /data-cc-hole="' \+ x\.n \+ '" data-cc-player="'/, 'the boxes keep data-cc-hole / data-cc-player');
    assert.match(B, /data-cc-moresheet[\s\S]{0,240}More (›|\\u203a)/, 'More ›');
    assert.match(B, /\[data-cc-moresheet\]'\)\) \{ ccOpen\(cc\.hole, cc\.sel\)/, 'More › = the full Enter score sheet for that golfer and hole');
    assert.match(B, /Finish &amp; settle up/, 'Finish & settle up shown');
    assert.match(B, /html:not\(\.dark-mode\) #hp-compact-card\{/, 'light follows the app\'s dark-mode switch');
    assert.match(B, /max-height:calc\(100% - 52px\)/, 'sized to its content, 52 px under the top');
});
