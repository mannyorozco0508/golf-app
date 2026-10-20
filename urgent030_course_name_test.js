// ============================================================================
// URGENT-030: THE COURSE LINE on the GPS top bar (Manny, option A of
// ~/Desktop/claude-code-reports/029/mockup-course-name.png) - the text, pure.
//   node urgent030_course_name_test.js
// "<Course name> · <City>, <ST>"; a club with more than one course says which one;
// no city: the name alone; never "undefined". The bar itself: urgent030_course_name_chrome_test.js.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
if (!fs.existsSync(path.join(__dirname, 'gps-view.js'))) { console.log('Consumer tree (GPS_ENABLED=0): no GPS - skipped.'); process.exit(0); }
const V = require('./gps-view.js');
const L = V.courseLine;

test('the mockup: "Aguila Golf Course · Laveen, AZ"', () => {
    assert.equal(L('Aguila Golf Course', 'Laveen', 'AZ'), 'Aguila Golf Course · Laveen, AZ');
});

test('multi-course clubs show the course / nines', () => {
    assert.equal(L('Talking Stick Golf Club (South - Piipaash)', 'Scottsdale', 'AZ'), 'Talking Stick · Piipaash (South) · Scottsdale, AZ');
    assert.equal(L('Talking Stick Golf Club (South - Piipaash)'), 'Talking Stick · Piipaash (South)');
    assert.equal(L('Talking Stick Golf Club (North - O Odham)', 'Scottsdale', 'AZ'), 'Talking Stick · O’odham (North) · Scottsdale, AZ');
    assert.equal(L('Talking Stick Golf Club (Piipaash Course)', 'Scottsdale', 'AZ'), 'Talking Stick · Piipaash · Scottsdale, AZ');
    assert.equal(L('Thistle Golf Club (MacKay / Cameron)', 'Sunset Beach', 'NC'), 'Thistle · MacKay / Cameron · Sunset Beach, NC');
});

test('one course in brackets that is the club itself: the club name', () => {
    assert.equal(L('Papago Golf Club (Papago)', 'Phoenix', 'AZ'), 'Papago Golf Club · Phoenix, AZ');
    assert.equal(L('Caledonia Golf & Fish Club (Caledonia)', 'Pawleys Island', 'SC'), 'Caledonia Golf & Fish Club · Pawleys Island, SC');
    // The directory's own note "(NC - 27 Hole)" is not a course.
    assert.equal(L('Thistle Golf Club (NC - 27 Hole)', 'Sunset Beach', 'NC'), 'Thistle Golf Club · Sunset Beach, NC');
});

test('plain names stay whole', () => {
    assert.equal(L('Dobson Ranch Golf Course', 'Mesa', 'AZ'), 'Dobson Ranch Golf Course · Mesa, AZ');
    assert.equal(L('The Legacy Golf Club', 'Phoenix', 'AZ'), 'The Legacy Golf Club · Phoenix, AZ');
    assert.equal(L('Chambers Bay Golf Club', 'University Place', 'wa'), 'Chambers Bay Golf Club · University Place, WA');
});

test('no city: the name alone (or the state) - never "undefined" / "null"', () => {
    assert.equal(L('Chambers Bay'), 'Chambers Bay');
    assert.equal(L('Chambers Bay', undefined, undefined), 'Chambers Bay');
    assert.equal(L('Chambers Bay', 'undefined', 'null'), 'Chambers Bay');
    assert.equal(L('Chambers Bay', '', 'WA'), 'Chambers Bay · WA');
    assert.equal(L('Chambers Bay', { x: 1 }, null), 'Chambers Bay');
    assert.equal(L(undefined, 'Phoenix', 'AZ'), '');
    assert.equal(L(''), '');
    for (const s of [L(undefined), L(null, null, null), L('X', undefined, 'AZ')]) assert.doesNotMatch(s, /undefined|null/);
});
