// URGENT-085 (2) - THE MAP HEADER'S COURSE LINE SHOWS THE COURSE'S REAL NAME ONCE.
// Manny's hole 1 at The Arizona CC read "Arizona · The Arizona · Phoenix, AZ": GolfAPI names it
// "The Arizona Country Club (The Arizona)" and courseLine() cut the club to "Arizona" and kept the course part.
// The other courses he plays (and the 079 report's list) keep exactly their lines.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./gps-view.js').courseLine;

test('The Arizona Country Club: the real name once', () => {
    assert.equal(L('The Arizona Country Club (The Arizona)', 'Phoenix', 'AZ'), 'The Arizona Country Club · Phoenix, AZ');
    assert.equal(L('The Arizona Country Club (The Arizona)'), 'The Arizona Country Club');
    assert.equal(L('The Arizona Country Club', 'Phoenix', 'AZ'), 'The Arizona Country Club · Phoenix, AZ');
    // the same rule, other spellings of "the course is the club"
    assert.equal(L('Papago Golf Club (Papago Golf Club)', 'Phoenix', 'AZ'), 'Papago Golf Club · Phoenix, AZ');
    assert.equal(L('Papago Golf Club (Papago Golf Course)', 'Phoenix', 'AZ'), 'Papago Golf Club · Phoenix, AZ');
    assert.equal(L('The Legacy Golf Club (The Legacy)', 'Phoenix', 'AZ'), 'The Legacy Golf Club · Phoenix, AZ');
});

test('unchanged: Papago, Talking Stick North / South, Bandon Dunes / Pacific Dunes, Starfire King 18, Biltmore', () => {
    assert.equal(L('Papago Golf Club (Papago)', 'Phoenix', 'AZ'), 'Papago Golf Club · Phoenix, AZ');
    assert.equal(L('Papago Golf Club', 'Phoenix', 'AZ'), 'Papago Golf Club · Phoenix, AZ');
    assert.equal(L('Talking Stick Golf Club (South - Piipaash)', 'Scottsdale', 'AZ'), 'Talking Stick · Piipaash (South) · Scottsdale, AZ');
    assert.equal(L('Talking Stick Golf Club (North - O Odham)', 'Scottsdale', 'AZ'), 'Talking Stick · O’odham (North) · Scottsdale, AZ');
    assert.equal(L('Bandon Dunes Golf Resort (Bandon Dunes)', 'Bandon', 'OR'), 'Bandon Dunes Golf Resort · Bandon, OR');
    assert.equal(L('Bandon Dunes Golf Resort (Pacific Dunes)', 'Bandon', 'OR'), 'Bandon Dunes · Pacific Dunes · Bandon, OR');
    assert.equal(L('Starfire Golf Club (King 18)', 'Scottsdale', 'AZ'), 'Starfire · King 18 · Scottsdale, AZ');
    assert.equal(L('Arizona Biltmore Golf Club (Adobe)', 'Phoenix', 'AZ'), 'Arizona Biltmore · Adobe · Phoenix, AZ');
    assert.equal(L('Arizona Grand Golf Course (Arizona Grand)', 'Phoenix', 'AZ'), 'Arizona Grand Golf Course · Phoenix, AZ');
    assert.equal(L('Thistle Golf Club (MacKay / Cameron)', 'Sunset Beach', 'NC'), 'Thistle · MacKay / Cameron · Sunset Beach, NC');
});
