// REMOVING A GOLFER TAKES A SEAT OUT OF HIS OWN GROUP (mailbox 013, 2026-10-18), IN REAL CHROME.
//
// Groups are positional (grouping.js: computeGroupSizes over groupSizeOverrides). Round Setup's ✕
// removed the row and left the overrides alone, so every golfer after him slid one seat up: on a
// GPS-first round where "Me" (alone in group 1) was deleted after the weekly field was pasted,
// {0:1, 1:4, 2:4, 3:4, 4:4, 5:4} re-cut the five foursomes as 1 / 4 / 4 / 4 / 4 / 3 - every
// group wrong, the organizer alone in group 1. Now the removed golfer's group shrinks by one (and
// goes when it empties). A real tap on the row's ✕.
'use strict';
if (!require('fs').existsSync(require('path').join(__dirname, 'gps-view.js'))) { console.log('Consumer tree (GPS_ENABLED=0): no GPS-door round - skipped.'); process.exit(0); }
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const NAMES = ['Me', 'Manny', 'Joe', 'Randy', 'Mike', 'Tom', 'Sam', 'Lou', 'Vic', 'Al', 'Ray', 'Ed', 'Gus', 'Hal', 'Ike', 'Jim', 'Kip', 'Len', 'Max', 'Ned', 'Otto'];
const DB = (code) => ({ events: { [code]: {
    eventName: 'GPS round', courseName: 'Test Links', activeCourseKey: 'comm_links', gameFormat: 'stroke', courseData: CD, ownerUid: 'anon-cold', organizerToken: 'b'.repeat(32),
    scores: {}, settlementMode: 'whole-dollar', startingHole: 1, groupSizeOverrides: { 0: 1, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 },
    players: NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: String(i), team: 'Team 1', squad: 'red', playingForMoney: true })) } },
    global_courses: { comm_links: { name: 'Test Links', data: CD } }, trips: {}, tournaments: {}, organizers: {} });
const READ = `JSON.stringify({ names: Array.prototype.map.call(document.querySelectorAll('#player-list .player-row .p-name-input'), function (e) { return e.value; }),
    groups: groupSizeOverrides, sizes: computeGroupSizes(document.querySelectorAll('#player-list .player-row').length, groupSizeOverrides) })`;
async function removeAt(code, nth) {
    const r = await arriveCold({ url: fileUrl('admin.html', 'game=' + code + '&step=players'), db: DB(code), settleMs: 3000, viewport: { width: 393, height: 852 },
        preScript: 'window.__hardpanDoors = true;', steps: [{ sleep: 1500 }, { expression: READ }, { tap: '#player-list .player-row .btn-del', nth }, { sleep: 600 }, { expression: READ }] });
    assert.equal(r.ok, true, r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
}
const groupsOf = (s) => { let at = 0; return s.sizes.map((n) => { const g = s.names.slice(at, at + n); at += n; return g.join('/'); }); };

describe('Round Setup ✕ on a grouped field', () => {
    test('"Me" (alone in group 1) removed: the five foursomes are untouched', { timeout: 90000 }, async () => {
        const [pre, post] = await removeAt('RMGR01', 0);
        assert.deepEqual(pre.sizes, [1, 4, 4, 4, 4, 4]);
        assert.equal(post.names.length, 20);
        assert.deepEqual(post.sizes, [4, 4, 4, 4, 4]);
        assert.deepEqual(groupsOf(post), ['Manny/Joe/Randy/Mike', 'Tom/Sam/Lou/Vic', 'Al/Ray/Ed/Gus', 'Hal/Ike/Jim/Kip', 'Len/Max/Ned/Otto']);
    });
    test('a golfer in the middle (Al, group 4) removed: his group is a threesome, every other group as it was', { timeout: 90000 }, async () => {
        const [, post] = await removeAt('RMGR02', 9);
        assert.deepEqual(post.sizes, [1, 4, 4, 3, 4, 4]);
        assert.deepEqual(groupsOf(post), ['Me', 'Manny/Joe/Randy/Mike', 'Tom/Sam/Lou/Vic', 'Ray/Ed/Gus', 'Hal/Ike/Jim/Kip', 'Len/Max/Ned/Otto']);
    });
});
