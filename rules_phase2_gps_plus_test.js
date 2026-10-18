// PHASE-2 RULES FOR THE 008 GPS FEATURES (mailbox 008).
//
// Quick stats (events/<code>/stats) and club distances (player_clubs/<uid>) are in
// rules/database.rules.proposed.json only. Phase 1 (live) has neither, so until phase 2
// ships the app keeps both on the phone. This holds the exact shapes the app keeps.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const targaryen = require('targaryen');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'rules', f), 'utf8'));
const P2 = read('database.rules.proposed.json');
const P1 = read('database.rules.phase1.json');
const NOW = Date.now();
const anon = (uid) => ({ uid, provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } });
const ME = anon('me'), OTHER = anon('other');
const DATA = { events: { R1: { players: { 0: { id: 101, name: 'Ann' } }, scores: { p101_h1: 4 } } } };
const db = (rules) => targaryen.database(rules, DATA);
const can = (who, p, v, rules) => db(rules || P2).as(who).write(p, v, NOW).allowed;
const canRead = (who, p, rules) => db(rules || P2).as(who).read(p, NOW).allowed;

test('phase 1 (live) has neither rule: the app must keep stats and clubs on the phone', () => {
    assert.strictEqual(P1.rules.player_clubs, undefined);
    assert.strictEqual((P1.rules.events.$eventCode || {}).stats, undefined);
    assert.strictEqual(can(ME, 'player_clubs/me/me/set/7i', 158, P1), false);
});

test('quick stats: a signed-in golfer writes the exact shape; anything else is refused', () => {
    assert.ok(can(ME, 'events/R1/stats/p101_h1', { putts: 2, fw: 'hit', gir: true }));
    assert.ok(can(ME, 'events/R1/stats/p101_h18', { putts: 0, fw: 'L' }));
    assert.strictEqual(can(null, 'events/R1/stats/p101_h1', { putts: 2 }), false, 'signed out');
    assert.strictEqual(can(ME, 'events/NOPE/stats/p101_h1', { putts: 2 }), false, 'no such round');
    assert.strictEqual(can(ME, 'events/R1/stats/p101_h19', { putts: 2 }), false, 'hole 19');
    assert.strictEqual(can(ME, 'events/R1/stats/p101_h1', { putts: 5 }), false, '5 putts');
    assert.strictEqual(can(ME, 'events/R1/stats/p101_h1', { fw: 'miss' }), false);
    assert.strictEqual(can(ME, 'events/R1/stats/p101_h1', { gir: 'yes' }), false);
    assert.strictEqual(can(ME, 'events/R1/stats/p101_h1', { putts: 2, note: 'x' }), false, 'extra field');
});

test('club distances: only that account reads and writes its own bag', () => {
    assert.ok(can(ME, 'player_clubs/me/me/set/7i', 158));
    assert.ok(can(ME, 'player_clubs/me/n:ann able/shots/Dr', { 0: 241, 1: 236, 9: 250 }));
    assert.ok(canRead(ME, 'player_clubs/me'));
    assert.strictEqual(canRead(OTHER, 'player_clubs/me'), false, 'someone else reads my bag');
    assert.strictEqual(can(OTHER, 'player_clubs/me/me/set/7i', 158), false, 'someone else writes my bag');
    assert.strictEqual(can(null, 'player_clubs/me/me/set/7i', 158), false, 'signed out');
});

test('club distances: the shape gps-shots.js keeps, and nothing else', () => {
    assert.strictEqual(can(ME, 'player_clubs/me/me/set/7i', 450), false, '450 yards');
    assert.strictEqual(can(ME, 'player_clubs/me/me/set/7i', 0), false, '0 yards');
    assert.strictEqual(can(ME, 'player_clubs/me/me/set/7i', '158'), false, 'a string');
    assert.strictEqual(can(ME, 'player_clubs/me/me/set/putter', 30), false, 'not a club in the bag');
    assert.strictEqual(can(ME, 'player_clubs/me/me/shots/Dr', { 10: 240 }), false, 'an 11th shot');
    assert.strictEqual(can(ME, 'player_clubs/me/me/note', 'x'), false, 'extra field');
    assert.strictEqual(can(ME, 'player_clubs/me/' + 'x'.repeat(65) + '/set/7i', 158), false, 'golfer key too long');
});
