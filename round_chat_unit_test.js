// ============================================================================
// ROUND CHAT 2.1a - the pure helpers in round-chat.js (node, no page). The screens are proven in
// round_chat_chrome_test.js through the taps a golfer makes; this file pins the shapes they write
// and the small rules they share. BASELINE: new file (base adf1e2da has no round-chat.js).
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'round-chat.js'))) { console.log('Consumer tree: no round-chat.js - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('./round-chat.js');

test('a text message is the shape the rules accept: uid, name, SERVER ts, type text, 1-1000 chars', () => {
    const m = C.textMessage({ uid: 'u1', name: 'Manny', text: '  Pin is back left \n\n\n\n ok  ', group: 2 });
    assert.deepEqual(m, { uid: 'u1', name: 'Manny', ts: { '.sv': 'timestamp' }, type: 'text', text: 'Pin is back left\n\n ok', group: '2' });
    assert.equal(C.textMessage({ uid: 'u1', name: 'x'.repeat(60), text: 'a', replyTo: '-Nabc' }).name.length, 40);
    assert.equal(C.textMessage({ uid: 'u1', name: 'B', text: 'a', replyTo: '-Nabc' }).replyTo, '-Nabc');
    assert.equal(C.validText(''), false); assert.equal(C.validText('   '), false);
    assert.equal(C.validText('a'), true); assert.equal(C.validText('a'.repeat(1000)), true); assert.equal(C.validText('a'.repeat(1001)), false);
    const p = C.photoMessage({ uid: 'u1', name: 'Todd', photo: 'chat/ABC/-N1.jpg', text: '' });
    assert.deepEqual(p, { uid: 'u1', name: 'Todd', ts: { '.sv': 'timestamp' }, type: 'photo', photo: 'chat/ABC/-N1.jpg' });
});

test('thread paths live outside events/ (events/$code is readable with the code alone)', () => {
    assert.equal(C.threadPath('ABC123', 'round'), 'chats/ABC123/round');
    assert.equal(C.threadPath('ABC123', 'group', '2'), 'chats/ABC123/groups/2');
    assert.ok(!/^events/.test(C.threadPath('X', 'round')));
});

test('the word filter masks the short list (and its endings), never a name or an ordinary word', () => {
    assert.equal(C.maskWords('what the fuck'), 'what the f•••');
    assert.equal(C.maskWords('SHITTY lie'), 'S••••• lie');
    assert.equal(C.hasBadWord('that bitch'), true);
    assert.equal(C.hasBadWord('Dick Smith hit a bass-o shot at Scunthorpe'), false);
    for (const ok of ['Nice shot', 'Beer cart?', 'Group 2 making the turn', 'Pin on 12 is tucked back left', 'class', 'assess', 'grass']) assert.equal(C.maskWords(ok), ok, ok);
    assert.equal(C.hasBadWord('fuck'), true, 'lastIndex reset: the same answer twice');
    assert.equal(C.hasBadWord('fuck'), true);
});

test('list order, pending, hidden golfers, unread by push id', () => {
    const obj = { '-B': { uid: 'u2', ts: 2000, text: 'b' }, '-A': { uid: 'u1', ts: 1000, text: 'a' }, '-C': { uid: 'u3', ts: { '.sv': 'timestamp' }, text: 'c' } };
    const l = C.listOf(obj, { '-C': true }, 5000);
    assert.deepEqual(l.map((m) => m.id), ['-A', '-B', '-C']);
    assert.deepEqual(l.map((m) => m.pending), [false, false, true]);
    assert.deepEqual(C.visible(l, { u2: 'Bob' }).map((m) => m.id), ['-A', '-C']);
    assert.equal(C.unreadCount(l, 'u1', ''), 1, 'mine and pending do not count');
    assert.equal(C.unreadCount(l, 'u1', '-B'), 0);
    assert.equal(C.unreadCount(C.listOf(obj), 'u1', '-A'), 2);
});

test('reactions: the five, counted, mine marked; anything else refused', () => {
    assert.deepEqual(C.REACTIONS.map((r) => r.e), ['🔥', '😂', '❤️', '👍', '😬']);
    const s = C.reactionSummary({ u1: 'fire', u2: 'fire', u3: 'laugh' }, 'u2');
    assert.deepEqual(s.map((x) => [x.k, x.n, x.mine]), [['fire', 2, true], ['laugh', 1, false], ['heart', 0, false], ['up', 0, false], ['grimace', 0, false]]);
    assert.equal(C.validReaction('heart'), true); assert.equal(C.validReaction('💩'), false); assert.equal(C.validReaction(''), false);
});

test('the feed: newest first, replies under their post with the count', () => {
    const l = C.listOf({ '-1': { uid: 'a', ts: 1 }, '-2': { uid: 'b', ts: 2, replyTo: '-1' }, '-3': { uid: 'c', ts: 3, type: 'auto', kind: 'kp' }, '-4': { uid: 'd', ts: 4, replyTo: '-1' } });
    const f = C.feedOf(l);
    assert.deepEqual(f.top.map((m) => m.id), ['-3', '-1']);
    assert.deepEqual(f.replies['-1'].map((m) => m.id), ['-2', '-4']);
});

test('photos leave at 1600 px on the long side at most, never up-scaled', () => {
    assert.deepEqual(C.fitDims(4032, 3024), { w: 1600, h: 1200 });
    assert.deepEqual(C.fitDims(3024, 4032), { w: 1200, h: 1600 });
    assert.deepEqual(C.fitDims(800, 600), { w: 800, h: 600 });
    assert.deepEqual(C.fitDims(0, 10), { w: 0, h: 0 });
});

test('chat is ON unless the organizer turned it off; Remove = the sender or the round owner', () => {
    assert.equal(C.chatOn(null), true); assert.equal(C.chatOn({}), true); assert.equal(C.chatOn({ on: true }), true); assert.equal(C.chatOn({ on: false }), false);
    const m = { uid: 'u1' };
    assert.equal(C.canRemove(m, 'u1', 'org'), true);
    assert.equal(C.canRemove(m, 'org', 'org'), true);
    assert.equal(C.canRemove(m, 'u2', 'org'), false);
    assert.equal(C.canRemove(m, null, null), false);
    assert.equal(C.initials('Bob Baker'), 'BB'); assert.equal(C.initials('Todd'), 'T'); assert.equal(C.initials(''), '?');
});
