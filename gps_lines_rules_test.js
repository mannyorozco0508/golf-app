// ============================================================================
// "SAVE THIS LINE" - THE RULES ADDITION, AS PROPOSED (URGENT-026, NOT DEPLOYED)
//
// docs/gps-lines-rules-proposal.json holds the LIVE course_gps block (read 2026-10-20) and the
// proposed course_gps/$courseKey/lines/$hole beside pins/$hole, with pins' exact write rule. This
// file merges them into an IN-MEMORY copy of database.rules.json (the repo file is not touched,
// nothing is published) and runs the allow / deny cases through targaryen - and checks that the
// app ships dark (features.lineSave false) while the live rules still refuse the write.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const targaryen = require('targaryen');

const REPO_RULES = JSON.parse(fs.readFileSync(path.join(__dirname, 'database.rules.json'), 'utf8'));
const PROPOSAL = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs', 'gps-lines-rules-proposal.json'), 'utf8'));

function rules(withLines) {
    const r = JSON.parse(JSON.stringify(REPO_RULES));
    r.rules.course_gps = JSON.parse(JSON.stringify(PROPOSAL.live_course_gps));
    if (withLines) r.rules.course_gps.$courseKey.lines = PROPOSAL.lines;
    return r;
}
const NOW = Date.now();
const players = { 0: { id: 1, name: 'Ann' } };
const KEY = 'gapi_012141520636857668694';
const DATA = {
    events: {
        PAP1: { ownerUid: 'org', activeCourseKey: KEY, courseName: 'Papago Golf Club (Papago)', players },
        DOB1: { ownerUid: 'org2', activeCourseKey: 'gca_zgkynkan', courseName: 'Dobson Ranch Golf Course', players },
        EMPTY: { ownerUid: 'org3', activeCourseKey: KEY, courseName: 'Papago Golf Club (Papago)' },
    },
    course_gps: { [KEY]: { lines: { h2: { pts: [[33.4557, -111.959], [33.457, -111.958], [33.4583, -111.9568]], at: NOW - 5000, ev: 'PAP1' } } } },
};
const line = (ev, extra) => Object.assign({ pts: [[33.4606, -111.9607], [33.4586, -111.9591], [33.4566, -111.9591]], at: NOW - 1000, ev }, extra || {});
const db = (withLines, uid) => targaryen.database(rules(withLines), DATA).as(uid ? { uid, provider: 'anonymous' } : null);
const can = (uid, p, v) => db(true, uid).write(p, v, NOW).allowed;
const P = (h) => `/course_gps/${KEY}/lines/${h}`;

test('TODAY (the live rules): a line is refused - $other is write:false; the green pins work as before', () => {
    assert.ok(PROPOSAL.live_course_gps.$courseKey.pins && PROPOSAL.live_course_gps.$courseKey.$other, 'positive: the live block loaded');
    assert.strictEqual(db(false, 'golfer').write(P('h1'), line('PAP1'), NOW).allowed, false);
    assert.strictEqual(db(false, 'golfer').write(`/course_gps/${KEY}/pins/h1`, { mid: { lat: 33.4566, lng: -111.9591 }, at: NOW - 1000, ev: 'PAP1' }, NOW).allowed, true);
    assert.strictEqual(REPO_RULES.rules.course_gps, undefined, 'database.rules.json is not touched');
});

test('the app ships DARK: features.lineSave is false until the rules are deployed', () => {
    const src = fs.readFileSync(path.join(__dirname, 'gps-config.js'), 'utf8');
    assert.match(src, /lineSave: false/);
    const view = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
    assert.match(view, /f\.lineSave === true/, 'the button needs the switch exactly true');
    // ONE writer for a line (writeLine), reached only from the button's tap - no test write to feature-detect.
    assert.strictEqual((view.match(/\/lines\/' \+ k\)\.set\(/g) || []).length, 1);
    assert.match(view, /function saveLine\(\) \{\s*var st = saveLineState\(\);\s*if \(!st\) return;/);
});

test('proposed: any signed-in member of a round AT the course saves an EMPTY hole\'s line', () => {
    assert.strictEqual(can('golfer', P('h1'), line('PAP1')), true);
    assert.strictEqual(can(null, P('h1'), line('PAP1')), false, 'signed out');
    assert.strictEqual(can('golfer', P('h1'), line('DOB1')), false, 'a Dobson round cannot write Papago');
    assert.strictEqual(can('golfer', P('h1'), line('EMPTY')), false, 'a round with no players');
    assert.strictEqual(can('golfer', P('h1'), line('NOPE')), false, 'no such round');
});

test('proposed: only that round\'s organizer changes or clears a saved line', () => {
    assert.strictEqual(can('golfer', P('h2'), line('PAP1')), false, 'a golfer may NOT change it');
    assert.strictEqual(can('org', P('h2'), line('PAP1')), true, 'the organizer may');
    assert.strictEqual(can('org2', P('h2'), line('PAP1')), false, 'another round\'s organizer naming PAP1');
    assert.strictEqual(can('org', P('h2'), { cleared: true, at: NOW - 1000, ev: 'PAP1' }), true, 'the organizer clears it');
    assert.strictEqual(can('golfer', P('h2'), { cleared: true, at: NOW - 1000, ev: 'PAP1' }), false, 'a golfer cannot clear it');
    assert.strictEqual(can('org', P('h2'), null), false, 'never a delete (a clear is a write)');
});

test('proposed: the shape - 3 to 6 [lat, lng] points, at, ev; nothing else', () => {
    const six = [[33.46, -111.96], [33.459, -111.96], [33.458, -111.96], [33.457, -111.96], [33.4565, -111.96], [33.4566, -111.9591]];
    assert.strictEqual(can('golfer', P('h3'), line('PAP1', { pts: six })), true, 'six points');
    assert.strictEqual(can('golfer', P('h3'), line('PAP1', { pts: six.concat([[33.45, -111.96]]) })), false, 'seven');
    assert.strictEqual(can('golfer', P('h3'), line('PAP1', { pts: six.slice(0, 2) })), false, 'two');
    assert.strictEqual(can('golfer', P('h3'), line('PAP1', { pts: [[95, -111.96], [33.459, -111.96], [33.458, -111.96]] })), false, 'latitude out of range');
    assert.strictEqual(can('golfer', P('h3'), line('PAP1', { pts: [[33.46, -111.96, 4], [33.459, -111.96], [33.458, -111.96]] })), false, 'a third number');
    assert.strictEqual(can('golfer', P('h3'), line('PAP1', { who: 'me' })), false, 'an extra field');
    assert.strictEqual(can('golfer', P('h3'), { pts: line('PAP1').pts, at: NOW }), false, 'no ev');
    assert.strictEqual(can('golfer', P('h3'), line('PAP1', { at: NOW + 3600e3 })), false, 'at in the future');
    assert.strictEqual(can('golfer', P('h3'), line('PAP1', { cleared: true })), false, 'cleared AND points');
    assert.strictEqual(can('golfer', P('h30'), line('PAP1')), false, 'no hole 30');
    assert.strictEqual(can('golfer', P('h1'), line('PAP1', { pts: { 0: [33.46, -111.96], 1: [33.459, -111.96], 3: [33.458, -111.96] } })), false, 'a gap in the points');
});

test('proposed: a line is not a green - pins/$hole keeps its own rule and shape', () => {
    assert.strictEqual(can('golfer', `/course_gps/${KEY}/pins/h1`, line('PAP1')), false, 'a line written as a pin is refused');
    assert.strictEqual(can('golfer', `/course_gps/${KEY}/other/h1`, line('PAP1')), false, '$other still refuses');
});
