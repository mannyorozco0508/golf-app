// ============================================================================
// THE GPS AUDIT'S FIXES (mailbox 001, 2026-10-16) - the ones a unit test can hold. The
// browser half is tools/audit-sim.js (scenario r) and tools/audit-courses.js.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ON = fs.existsSync(path.join(__dirname, 'gps-view.js'));
const skip = ON ? false : 'Consumer tree: no GPS files';
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

test('a set front / back seen from beside or behind the green: the near edge is the front', { skip }, () => {
    const G = require('./gps-geo.js');
    const mid = [33.45, -79.15], front = G.destination(mid, 180, 10), back = G.destination(mid, 0, 10);
    const behind = G.destination(mid, 0, 120);                     // past the green, looking back
    const n = G.holeNumbers(behind, { mid, front, back });
    assert.ok(n.frontM < n.middleM && n.middleM < n.backM, JSON.stringify([n.frontM, n.middleM, n.backM]));
    const ahead = G.destination(mid, 180, 120);                     // the usual side: unchanged
    const m = G.holeNumbers(ahead, { mid, front, back });
    assert.deepEqual([m.front, m.back], [front, back]);
});
test('a spectator never sets a green: the button and the save both check read-only', { skip }, () => {
    const v = read('gps-view.js');
    assert.match(v, /show\('\.gps-set-green', S\.pro && !setting && noGreen && !S\.loadingCourses && !readOnlyHere\(\)\)/);
    assert.match(v, /function savePin\(pin\) \{\s*if \(!S \|\| !pin \|\| readOnlyHere\(\)\) return;/);
});
test('the shot replay stops when the card is shown; a refused Capacitor watch can start again', { skip }, () => {
    const v = read('gps-view.js');
    assert.match(v, /stopWindTick\(\);\s*\/\/ A shot replay[^\n]*\n\s*stopReplayTimer\(\);/);
    assert.match(v, /function \(e\) \{\s*\/\/ The plugin refused outright[^\n]*\n\s*if \(gen === watchGen\) watchId = null;\s*onErr\(e\);/);
});
test('Exit after a REFUSED change keeps the other unsent scores; GONE drops them', { skip }, () => {
    const f = read('front-door.js');
    assert.match(f, /function exitRound\(code, gone\) \{[\s\S]{0,400}forgetRound\(code, !!gone\);\s*if \(gone\) ls\('golfapp_snap_v1_'/);
});
test('the scorekeeper key: the local copy is the hash; no hash support is "none", never "bad"', { skip }, () => {
    assert.match(read('front-door.js'), /d\.scoreKeys\[String\(g\)\] = made;/);
    assert.match(read('index.html'), /hpKeyState = h == null \? 'none' : \(h === want \? 'ok' : 'bad'\);/);
});
test('the GPS follows a course changed in Round Setup (it mounts again); the organizer tools follow the sign-in', { skip }, () => {
    const i = read('index.html');
    assert.match(i, /g\.courseKey\(\) !== key\) \{[\s\S]{0,400}g\.unmount\(\);\s*gpsFollowHoleView\(\);/);
    assert.match(i, /g\.roundUpdated\(currentData, \{ canFix: roundOwnerHere\(\) \}\);/);
});
