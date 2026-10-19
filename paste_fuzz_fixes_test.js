// URGENT-008 part 2 (2026-10-18): roster paste fuzzing. tools/sim/paste-fuzz.js
// pasted thousands of rosters the ways organizers write them; these are the
// COMMON shapes that read wrongly, one block per fix, each pinned with the line
// the fuzzer produced.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const R = require('./roster-paste.js');

const P = (text) => R.parsePlayerPasteText(text, []);
const rows = (text) => P(text).validPlayers.map(p => [p.name, p.hcp, p.flight || null]);

describe('FIX 1: the line is cleaned before it is read', () => {
    test('Excel / Sheets tabs: "Zack<TAB>Carrano<TAB>6<TAB>A" is Zack Carrano, 6, A (not a name holding a tab)', () => {
        assert.deepEqual(rows('Zack\tCarrano\t6\tA\r\nSean\tBurke\t21\tB'), [['Zack Carrano', '6', 'A'], ['Sean Burke', '21', 'B']]);
    });
    test('a non-breaking space (iMessage, Notes) is a space: "Big\\u00A0Jim\\u00A012" is Big Jim, 12', () => {
        assert.deepEqual(rows('Big Jim 12\nTommy  Chen  +2'), [['Big Jim', '12', null], ['Tommy Chen', '+2', null]]);
    });
    test('\\r\\n and a lone \\r both end a line', () => {
        assert.deepEqual(rows('Marty 9\r\nScott 7\rLance 14.3').map(r => r[0]), ['Marty', 'Scott', 'Lance']);
        assert.deepEqual(P('Marty 9\r\n\r\nScott 7').groups, [1, 1]);
    });
    test('bullets come off: • - * and a tab-indented Notes bullet', () => {
        assert.deepEqual(rows('• Skeens 2.0/A\n- Manny +2.0/A\n* Glenn 12.0/B\n\t•\tPaul 3.5'),
            [['Skeens', '2.0', 'A'], ['Manny', '+2.0', 'A'], ['Glenn', '12.0', 'B'], ['Paul', '3.5', null]]);
    });
    test('list numbers come off: "1) Skeens 2.0 A", "2. Glenn 12", "(3) Paul", "#4 Al 5"', () => {
        assert.deepEqual(rows('1) Skeens 2.0 A\n2. Glenn 12\n(3) Paul\n#4 Al 5'),
            [['Skeens', '2.0', 'A'], ['Glenn', '12', null], ['Paul', '', null], ['Al', '5', null]]);
    });
    test('NOT a list number: "12 Skeens" (could be a handicap first), "1.5 Skeens"; NOT a bullet: "-Rod 4"', () => {
        assert.equal(R.rosterPasteCleanLine('12 Skeens'), '12 Skeens');
        assert.equal(R.rosterPasteCleanLine('1.5 Skeens'), '1.5 Skeens');
        assert.equal(R.rosterPasteCleanLine('-Rod 4'), '-Rod 4');
    });
    test('zero-width marks go; the emoji joiner stays inside an emoji name', () => {
        assert.deepEqual(rows('​Marty 9﻿'), [['Marty', '9', null]]);
        assert.equal(rows('Jimmy \u{1F3CC}️‍♂️ 12')[0][0], 'Jimmy \u{1F3CC}️‍♂️');
    });
    test('playerLines: the line each golfer came from, parallel to validPlayers', () => {
        const r = P('Group 1\nMarty 9\n\nScott 7');
        assert.deepEqual(r.playerLines, [2, 4]);
    });
});
