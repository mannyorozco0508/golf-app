// ============================================================================
// HARDPAN GPS - SHOT BY SHOT (gps-features): mark where each shot finished, replay
//
// gps-shots.js in a sandbox (the phone's storage only), and how gps-view.js uses
// it: a tap in "Mark shots" marks a shot instead of moving the target; each shot's
// yards from the tee, then from the shot before; replay steps the holes with shots.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-shots.js'));
const skip = ON ? false : 'Consumer tree: no GPS shots';
function sandbox() {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const sb = { localStorage, JSON, Object, Math, Number, String, Date, isFinite };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(read('gps-shots.js'), sb);
    return { A: sb.HardPanGpsShots, store };
}

test('marking: shots per hole, in order, on this phone; undo; a cap so a stuck tap cannot fill storage', { skip }, () => {
    const { A, store } = sandbox();
    assert.equal(A.add('ZNBLP8', 1, [33.645, -78.96]), 1);
    assert.equal(A.add('ZNBLP8', 1, [33.6435, -78.96], 'here'), 2);
    assert.equal(A.add('ZNBLP8', 4, [33.65, -78.97]), 1);
    assert.deepEqual(A.shots('ZNBLP8', 1).map((s) => s.how), ['tap', 'here']);
    assert.deepEqual(A.holesWithShots('ZNBLP8'), [1, 4]);
    assert.equal(A.undo('ZNBLP8', 1), 1);
    assert.equal(A.undo('ZNBLP8', 4), 0);
    assert.deepEqual(A.holesWithShots('ZNBLP8'), [1]);
    for (let i = 0; i < 20; i++) A.add('ZNBLP8', 9, [33.6, -78.9]);
    assert.equal(A.shots('ZNBLP8', 9).length, A.MAX_PER_HOLE);
    assert.deepEqual(Object.keys(store), ['hardpan_shots_v1_ZNBLP8'], 'one key per round, nothing else');
});

test('the yards: the first shot from the tee, each next one from the shot before', { skip }, () => {
    const { A } = sandbox();
    const G = require('./gps-geo.js');
    const tee = [33.6400, -78.9600];
    A.add('R', 1, [33.6420, -78.9600]);   // ~243 yd
    A.add('R', 1, [33.6432, -78.9600]);   // ~146 yd more
    const legs = A.legs(A.shots('R', 1), tee, G.haversineMeters);
    assert.deepEqual(legs, [Math.round(G.haversineMeters(tee, [33.642, -78.96]) / 0.9144), Math.round(G.haversineMeters([33.642, -78.96], [33.6432, -78.96]) / 0.9144)]);
    assert.equal(A.legs(A.shots('R', 1), null, G.haversineMeters)[0], null, 'no tee mapped: the first has no yards');
});

test('the GPS screen: Tools > Mark shots / Replay round; a tap in mark mode marks a shot (not the target); this phone only', { skip }, () => {
    const v = read('gps-view.js'), src = read('gps-shots.js').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(/gps-mark-shots">Mark shots</.test(v) && /gps-replay">Replay round</.test(v));
    assert.ok(/if \(S\.shotMode\) \{ addShot\(pt, 'tap'\); return; \}\s*\n\s*if \(S\.replay\) return;\s*\n\s*\/\/ Tap anywhere: the target jumps there\./.test(v), 'mark mode takes the tap; replay ignores it');
    assert.ok(/function stopReplayTimer\(\)/.test(v) && /function unmount\(\) \{[\s\S]{0,120}stopReplayTimer\(\);/.test(v), 'the replay timer stops with the screen');
    assert.ok(!/firebase|\.ref\(|fetch\(|XMLHttpRequest/.test(src), 'no database, no network');
});
