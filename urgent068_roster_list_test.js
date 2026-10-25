// URGENT-068 #2: rosterPasteListText (roster-paste.js) - is pasted text a LIST of golfers, and the list
// one golfer a line for parsePlayerPasteText. Pasted lists of 4, 8 and 20 names, numbered, bulleted,
// CRLF, one-line comma lists; one golfer ("Mike Jones, 12") is not a list.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rosterPasteListText, parsePlayerPasteText } = require('./roster-paste.js');

const names = (n) => Array.from({ length: n }, (_, i) => 'Test G' + String(i + 1).padStart(2, '0'));
const parsed = (t) => parsePlayerPasteText(rosterPasteListText(t), []).validPlayers.map((p) => [p.name, p.hcp]);

for (const n of [4, 8, 20]) {
    test('a pasted list of ' + n + ' names (newlines, CRLF, numbered, bullets, commas) -> ' + n + ' golfers', () => {
        const ns = names(n), hc = ns.map((_, i) => String(i % 19));
        assert.deepEqual(parsed(ns.map((x, i) => x + ' ' + hc[i]).join('\n')), ns.map((x, i) => [x, hc[i]]));
        assert.deepEqual(parsed(ns.join('\r\n') + '\r\n'), ns.map((x) => [x, '']));
        assert.deepEqual(parsed(ns.map((x, i) => (i + 1) + '. ' + x).join('\n')), ns.map((x) => [x, '']));
        assert.deepEqual(parsed(ns.map((x) => '• ' + x).join('\n')), ns.map((x) => [x, '']));
        assert.deepEqual(parsed(ns.join(', ')), ns.map((x) => [x, '']));
    });
}

test('not a list: one name, a name and its handicap, nothing', () => {
    assert.equal(rosterPasteListText('Test Solo'), '');
    assert.equal(rosterPasteListText('Mike Jones, 12'), '');
    assert.equal(rosterPasteListText('  '), '');
    assert.equal(rosterPasteListText(null), '');
});

test('a blank line between groups is kept (Paste Player List draws the groups)', () => {
    const t = 'Test A 1\nTest B 2\n\nTest C 3\nTest D 4';
    assert.equal(rosterPasteListText(t), t);
    assert.deepEqual(parsePlayerPasteText(rosterPasteListText(t), []).groups, [2, 2]);
});
