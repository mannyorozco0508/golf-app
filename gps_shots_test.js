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

test('one-tap Mark shot: the club, the yards, wind, slope and plays-like saved with the shot; the club picked after; moving it', { skip }, () => {
    const { A } = sandbox();
    assert.deepEqual(A.CLUBS, ['Dr', '3W', '5W', 'Hy', '3i', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW', 'Putter']);
    const wind = { mph: 10, fromDeg: 0, head: 10, cross: 0, kind: 'headwind' };
    assert.equal(A.add('ZNBLP8', 2, [33.64, -78.96], 'here', { yd: 243, plays: 262, elevFt: 6.5, wind, club: null }), 1);
    let s = A.shots('ZNBLP8', 2)[0];
    assert.equal(s.how, 'here');
    assert.deepEqual([s.yd, s.plays, s.elevFt, s.wind.kind], [243, 262, 6.5, 'headwind']);
    assert.ok(!('club' in s), 'no club until one is picked');
    assert.equal(A.setLast('ZNBLP8', 2, { club: '7i' }).club, '7i');
    assert.equal(A.setLast('ZNBLP8', 2, { club: '12i' }).club, '7i', 'only clubs from the list');
    s = A.setLast('ZNBLP8', 2, { p: [33.6412345678, -78.96], how: 'tap', yd: 250, wind: null });
    assert.deepEqual([s.p[0], s.how, s.yd, s.club, 'wind' in s], [33.641235, 'tap', 250, '7i', false], 'moved: new spot and numbers, club kept, stale wind dropped');
    assert.equal(A.setLast('ZNBLP8', 3, { club: 'Dr' }), null, 'no shot on that hole: nothing');
});

test('the GPS screen: 📍 Mark shot = a distance measure for now (Manny, 2026-10-13: tap 1 = 0 yds, live yards, tap 2 = "Shot: N yds", the new start; nothing saved); the shot / club code kept for later', { skip }, () => {
    const v = read('gps-view.js');
    assert.ok(/class="gps-mark-shot gps-float"[^>]*>\\uD83D\\uDCCD Mark shot</.test(v), 'the button is on the GPS screen, not under Tools');
    assert.ok(/on\(el, '\.gps-mark-shot', function \(\) \{ closeMenus\(\); markShotHere\(\); \}\)/.test(v));
    const mark = v.slice(v.indexOf('function markShotHere('), v.indexOf('function measureLabel('));
    assert.ok(/if \(!S\.measureFrom\) \{ S\.measureFrom = fix\.pt;/.test(mark) && /S\.measureShot = \{ text: /.test(mark) && /S\.measureFrom = fix\.pt;\s*flash\('Shot: '/.test(mark), 'tap 1 starts; tap 2 = "Shot: N", that spot the new start');
    assert.ok(!/addShot|openClubSheet|localStorage|\.ref\(/.test(mark), 'the measure saves nothing and asks no club');
    assert.ok(/function measureLabel\(\)[\s\S]{0,400}G\.haversineMeters\(S\.measureFrom, fix\.pt\)/.test(v), 'the button counts the yards from the spot, live');
    assert.ok(/function markShotWithClub\(\) \{[\s\S]{0,300}addShot\(fix\.pt, 'here'\)[\s\S]{0,60}openClubSheet\(\)/.test(v), 'the shot + club code is kept for later');
    assert.ok(/class="gps-club-skip">Skip</.test(v) && /class="gps-club-move">Move it on the map</.test(v));
    assert.ok(/if \(S\.shotAdjust\) \{ moveLastShot\(pt\); return; \}/.test(v), 'after "Move it", a map tap moves the last shot');
    const det = v.slice(v.indexOf('function shotDetails('), v.indexOf('function addShot('));
    for (const k of ['yd:', 'plays:', 'elevFt:', 'out.wind', 'G.windRelative', 'G.playsLike', 'effectiveWind()']) assert.ok(det.includes(k), 'shot details: ' + k);
    assert.ok(/\(sh\.club \? ' \\u00b7 ' \+ sh\.club : ''\)/.test(v), 'map label: number · club · yards');
    assert.ok(!/firebase|\.ref\(|fetch\(/.test(det), 'the shot details never leave the phone');
});
