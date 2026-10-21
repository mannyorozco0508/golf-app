// ============================================================================
// URGENT-051 - THE ORGANIZER'S MAP PICTURE: DATABASE RULES PROPOSAL (NOT PUBLISHED), in memory (targaryen).
//   docs/051-imagery-rules-ROLLBACK-live-2026-10-21.json  the live rules, read 2026-10-21 (read only)
//   docs/051-imagery-rules-PROPOSED.json                  live + ONE child: course_gps/$courseKey/imagery
// Today (live) the app's write course_gps/<key>/imagery is refused, so the switch keeps the pick on the
// phone (gps-config imageryShare stays off). With the proposal: only the ORGANIZER of a round on THAT
// course can write it, only esri / esri-closeup / usgs, nothing else loosened.
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const LIVE = 'docs/051-imagery-rules-ROLLBACK-live-2026-10-21.json', PROPOSED = 'docs/051-imagery-rules-PROPOSED.json';
const skip = fs.existsSync(path.join(__dirname, PROPOSED)) ? false : 'no proposal in this tree';

function db(file) {
    const targaryen = require('targaryen');
    const data = { events: {
        R1: { ownerUid: 'org', activeCourseKey: 'gca_wr', players: { 0: { id: 11, name: 'Test Ann' } } },
        R2: { ownerUid: 'org', activeCourseKey: 'other', players: { 0: { id: 11, name: 'Test Ann' } } } } };
    return (uid) => targaryen.database(read(file), data).as(uid ? { uid, provider: 'anonymous' } : null);
}
const PICK = (NOW, src, ev) => ({ src: src || 'usgs', at: NOW - 1, ev: ev || 'R1' });

test('LIVE rules today: the organizer\'s imagery write is refused (why the switch keeps it on the phone); reads are allowed', { skip }, () => {
    const as = db(LIVE), NOW = Date.now();
    assert.ok(!as('org').write('/course_gps/gca_wr/imagery', PICK(NOW), NOW).allowed);
    assert.ok(as('golfer').read('/course_gps/gca_wr').allowed, 'a signed-in phone reads the course record');
    assert.ok(as('golfer').read('/course_gps/gapi_012141521176113830861/imagery').allowed, 'and the GolfAPI course\'s field');
});

test('PROPOSED: live + course_gps/$courseKey/imagery only; the organizer of a round on that course writes it; nothing else loosened', { skip }, () => {
    const live = read(LIVE), prop = read(PROPOSED);
    delete prop.rules.course_gps.$courseKey.imagery;
    assert.deepStrictEqual(prop, live, 'proposed = live + one child');
    const as = db(PROPOSED), NOW = Date.now();
    for (const src of ['esri', 'esri-closeup', 'usgs']) assert.ok(as('org').write('/course_gps/gca_wr/imagery', PICK(NOW, src), NOW).allowed, 'organizer ' + src);
    assert.ok(!as('golfer').write('/course_gps/gca_wr/imagery', PICK(NOW), NOW).allowed, 'a golfer who is not the organizer');
    assert.ok(!as(null).write('/course_gps/gca_wr/imagery', PICK(NOW), NOW).allowed, 'signed out');
    assert.ok(!as('org').write('/course_gps/gca_wr/imagery', PICK(NOW, 'usgs', 'R2'), NOW).allowed, 'a round on another course');
    assert.ok(!as('org').write('/course_gps/gca_wr/imagery', PICK(NOW, 'google'), NOW).allowed, 'not a choice');
    assert.ok(!as('org').write('/course_gps/gca_wr/imagery', Object.assign(PICK(NOW), { lat: 46.3 }), NOW).allowed, 'no extra field (no position)');
    assert.ok(!as('org').write('/course_gps/gca_wr/imagery', { src: 'usgs', at: NOW + 3600e3, ev: 'R1' }, NOW).allowed, 'not dated in the future');
    assert.ok(!as('org').write('/course_gps/gca_wr/osm', { x: 1 }, NOW).allowed, 'osm still server-only');
    assert.ok(!as('org').write('/course_gps/gca_wr/other', 1, NOW).allowed, 'other children still refused');
});
