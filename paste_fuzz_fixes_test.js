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
        assert.deepEqual(rows('Big\u00A0Jim\u00A012\nTommy  Chen\u00A0 +2'), [['Big Jim', '12', null], ['Tommy Chen', '+2', null]]);
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
        assert.deepEqual(rows('\u200BMarty 9\uFEFF'), [['Marty', '9', null]]);
        assert.equal(rows('Jimmy \u{1F3CC}\uFE0F\u200D♂\uFE0F 12')[0][0], 'Jimmy \u{1F3CC}\uFE0F\u200D♂\uFE0F');
    });
    test('playerLines: the line each golfer came from, parallel to validPlayers', () => {
        const r = P('Group 1\nMarty 9\n\nScott 7');
        assert.deepEqual(r.playerLines, [2, 4]);
    });
});

describe('FIX 2: headers are boundaries, not golfers', () => {
    test('"Group 1:" / "Group 2 -" / "Team 3." are headers (the fuzzer found "Group 1:" read as a golfer)', () => {
        const r = P('Group 1:\nMarty 9\nScott 7\nGroup 2 -\nLance 14\nTeam 3.\nPaul 3');
        assert.deepEqual(r.validPlayers.map(p => p.name), ['Marty', 'Scott', 'Lance', 'Paul']);
        assert.deepEqual(r.groups, [2, 1, 1]);
    });
    test('a list number alone on a line is a header: "1." "2)" "#3" "(4)"; a bare "12" is still a golfer line', () => {
        const r = P('1.\nMarty 9\n2)\nScott 7\n#3\nLance 14\n(4)\nPaul 3');
        assert.deepEqual(r.groups, [1, 1, 1, 1]);
        assert.equal(r.validPlayers.length, 4);
        assert.equal(R.rosterPasteSeparator('12'), '');
    });
    test('a spreadsheet heading row is not a golfer: "Name<TAB>HCP<TAB>Flight", "Player Handicap"', () => {
        assert.deepEqual(rows('Name\tHCP\tFlight\r\nSkeens\t2.0\tA\r\nGlenn\t12.0\tB'), [['Skeens', '2.0', 'A'], ['Glenn', '12.0', 'B']]);
        assert.deepEqual(rows('Player Handicap\nMarty 9'), [['Marty', '9', null]]);
        // a golfer whose name happens to be a heading word is still a golfer
        assert.deepEqual(rows('Name 12'), [['Name', '12', null]]);
    });
    test('"A Flight" / "Flight B:" headers give the golfers under them that flight; a letter on the line wins', () => {
        const r = P('A Flight\nSkeens 2\nManny +2\n\nFlight B:\nGlenn 12\nPaul 3 A');
        assert.deepEqual(r.validPlayers.map(p => [p.name, p.flight]), [['Skeens', 'A'], ['Manny', 'A'], ['Glenn', 'B'], ['Paul', 'A']]);
        assert.deepEqual(r.groups, [2, 2]);
        assert.deepEqual(r.flights, { A: 3, B: 1, unlettered: 0 });
    });
    test('the old headers still work, and "Group Captain Smith 8" is still a golfer', () => {
        ['Group 4', 'GROUP 4', 'Grp 2', 'Flight A', 'Team 1', 'Tee Time', 'Group 4 - 8:24 AM'].forEach(l => assert.equal(R.rosterPasteSeparator(l), 'header', l));
        assert.equal(R.rosterPasteSeparator('Group Captain Smith 8'), '');
    });
});

describe('FIX 3: a dash, colon, bar or slash between name, handicap and flight is a separator', () => {
    test('"Manny - 28.0" is Manny / 28.0 (was a golfer named "Manny -")', () => {
        assert.deepEqual(rows('Manny - 28.0\nBobby “The Hammer” Lee – 0.0'), [['Manny', '28.0', null], ['Bobby “The Hammer” Lee', '0.0', null]]);
    });
    test('"Colm: 4.0", "Paul/12", "Paul | 12 | A", "Jim: +2.0, B"', () => {
        assert.deepEqual(rows('Colm: 4.0\nPaul/12\nAl | 12 | A\nJim: +2.0, B\nBo / 7 / b'),
            [['Colm', '4.0', null], ['Paul', '12', null], ['Al', '12', 'A'], ['Jim', '+2.0', 'B'], ['Bo', '7', 'B']]);
    });
    test('the sign stays: "Steve -3" is -3; "Smith-Jones 12" is a hyphenated name; "A - Randy T 12" is still flight A', () => {
        assert.deepEqual(rows('Steve -3\nSmith-Jones 12\nA - Randy T 12'), [['Steve', '-3', null], ['Smith-Jones', '12', null], ['Randy T', '12', 'A']]);
    });
    test('"Mary - blue" with no tee list is still the name as typed (no number after the dash)', () => {
        assert.deepEqual(rows('Mary - blue'), [['Mary - blue', '', null]]);
    });
});

describe('FIX 4: a spreadsheet row with an empty handicap cell still has its flight', () => {
    test('"Zack<TAB>Carrano<TAB><TAB>A" is Zack Carrano, no handicap, flight A', () => {
        assert.deepEqual(rows('Name\tHCP\tFlight\r\nZack Carrano\t\tA\r\nSkeens\t2.0\tA\r\nLance\t\tb'),
            [['Zack Carrano', '', 'A'], ['Skeens', '2.0', 'A'], ['Lance', '', 'B']]);
        assert.deepEqual(rows('Zack\tCarrano\t\tB'), [['Zack Carrano', '', 'B']]);
    });
    test('no empty cell, no flight: "Matt<TAB>B" is a golfer named Matt B; "Glenn A" too', () => {
        assert.deepEqual(rows('Matt\tB\nGlenn A'), [['Matt B', '', null], ['Glenn A', '', null]]);
    });
});

describe('FIX 5: the word "hcp" beside a handicap is not part of the name', () => {
    test('"Skeens hcp 12", "Glenn HCP: 12.0 B", "Paul 3 hdcp", "Al (hcp 5)", "Bo (12 hcp) A", "Jim, hcp +2"', () => {
        assert.deepEqual(rows('Skeens hcp 12\nGlenn HCP: 12.0 B\nPaul 3 hdcp\nAl (hcp 5)\nBo (12 hcp) A\nJim, hcp +2\nA Randy handicap 12'),
            [['Skeens', '12', null], ['Glenn', '12.0', 'B'], ['Paul', '3', null], ['Al', '5', null], ['Bo', '12', 'A'], ['Jim', '+2', null], ['Randy', '12', 'A']]);
    });
    test('"(hcp 12)" is a handicap now, not a note that loses it', () => {
        const r = P('Al (hcp 5)');
        assert.deepEqual(r.notedLines, []);
        assert.equal(r.validPlayers[0].hcp, '5');
    });
    test('a name that only starts like the word is untouched: "Hector 12", "Hcpman 3"', () => {
        assert.deepEqual(rows('Hector 12\nHcpman 3'), [['Hector', '12', null], ['Hcpman', '3', null]]);
    });
});

describe('FIX 6: the word "flight" and a bracketed letter', () => {
    test('"Glenn 12 B flight", "Glenn 12 Flight B", "Glenn 12 (B)", "Glenn 12, flight A", "Bo 3 flt B"', () => {
        assert.deepEqual(rows('Glenn 12 B flight\nAl 12 Flight B\nPaul 12 (B)\nJim 12, flight A\nBo 3 flt b'),
            [['Glenn', '12', 'B'], ['Al', '12', 'B'], ['Paul', '12', 'B'], ['Jim', '12', 'A'], ['Bo', '3', 'B']]);
    });
    test('at the end of a line the flight is explicit even with no handicap: "Glenn (B)", "Glenn A flight"', () => {
        assert.deepEqual(rows('Glenn (B)\nPaul A flight\nAl Flight b'), [['Glenn', '', 'B'], ['Paul', '', 'A'], ['Al', '', 'B']]);
        assert.deepEqual(P('Glenn (B)').notedLines, [], '"(B)" is a flight, not a note');
    });
    test('leading: "Flight A Skeens 2", "A flight - Skeens 2"', () => {
        assert.deepEqual(rows('Flight A Skeens 2\nB flight - Glenn 12'), [['Skeens', '2', 'A'], ['Glenn', '12', 'B']]);
    });
    test('not a flight: "Abe Flight 3", "Bo Flight", "Jim (A) Smith 4" (letter not at the end), and "Glenn A" stays a name', () => {
        assert.deepEqual(rows('Abe Flight 3\nBo Flight\nJim (A) Smith 4\nGlenn A'),
            [['Abe Flight', '3', null], ['Bo Flight', '', null], ['Jim (A) Smith', '4', null], ['Glenn A', '', null]]);
    });
});

describe('FIX 7: what the parser cannot read is said BEFORE saving (checkLines)', () => {
    test('a number still in the name: "12 Skeens A" (handicap first), "Jimmy 12 \u{1F525}" (emoji after the number)', () => {
        const c = P('12 Skeens A\nJimmy 12 \u{1F525}\nMarty 9').checkLines;
        assert.deepEqual(c.map(x => [x.lineNumber, x.name]), [[1, '12 Skeens A'], [2, 'Jimmy 12 \u{1F525}']]);
        assert.match(c[0].why, /number/);
    });
    test('a handicap that is not a number: "Orozco, Manny 12" put "Manny 12" in the handicap box', () => {
        const c = P('Orozco, Manny 12').checkLines;
        assert.equal(c.length, 1); assert.equal(c[0].hcp, 'Manny 12'); assert.match(c[0].why, /handicap box/);
    });
    test('"Name A 12" all down the list: the safe reading (A stays in the name) AND every line asked about', () => {
        const r = P('Glenn B 12\nPaul A 3\nMarty B 9');
        assert.deepEqual(r.validPlayers.map(p => [p.name, p.hcp, p.flight || null]), [['Glenn B', '12', null], ['Paul A', '3', null], ['Marty B', '9', null]]);
        assert.deepEqual(r.checkLines.map(x => x.lineNumber), [1, 2, 3]);
        assert.match(r.checkLines[0].why, /flight or a last initial/);
    });
    test('a last initial in an ordinary list is NOT nagged about: "Matt B 12", "Jim B"', () => {
        assert.deepEqual(P('Matt B 12\nJim B\nMarty 9\nScott 7\nAl 4').checkLines, []);
    });
    test('...but where the paste uses flights, "Matt B" with no flight of its own is asked about', () => {
        assert.deepEqual(P('A Marty 9\nMatt B\nB Scott 7').checkLines.map(x => x.name), ['Matt B']);
    });
    test('an ordinary paste has no check lines at all', () => {
        assert.deepEqual(P('Skeens 2.0/A\nManny +2.0/A\nGlenn 12.0/B\n\nGroup 2:\nPaul (12) b\nJim, 7').checkLines, []);
    });

    // THE PREVIEW (admin.html), driven the way the modal drives it
    const vm = require('vm');
    const { loadHtmlInlineScript } = require('./helpers/load-script.js');
    const preview = (text) => {
        const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
        vm.runInContext(`document.__mount(document.getElementById('player-list'));`, sb);
        sb.__text = text;
        vm.runInContext(`document.getElementById('paste-players-textarea').value = __text; previewPastedPlayers();`, sb);
        return String(vm.runInContext("document.getElementById('paste-preview-summary').innerHTML", sb));
    };
    test('admin preview: a "Check these lines" entry names each line, what it was read as, and why', () => {
        const html = preview('12 Skeens A\nOrozco, Manny 12\nMarty 9');
        assert.match(html, /paste-flagged-line paste-check-line/);
        assert.match(html, /Check these 2 lines before adding/);
        assert.match(html, /Line 1: "12 Skeens A"/);
        assert.match(html, /Line 2: "Orozco, Manny 12" → Orozco \/ Manny 12/);
        assert.match(html, /3 players ready to add/, 'the golfers are still added - flagged, not dropped');
    });
    test('admin preview: an ordinary list shows no check entry; the text is escaped', () => {
        assert.doesNotMatch(preview('Skeens 2.0/A\nGlenn 12.0/B'), /paste-check-line/);
        const html = preview('<b>x</b> 12 Smith');
        assert.doesNotMatch(html, /<b>x<\/b>/);
    });
});

describe('FIX 8: separators around an explicit flight or the word hcp', () => {
    test('"Randy – 26 - Flight A" and "Tommy Chen - +2 - A flight": no dash left on the line', () => {
        assert.deepEqual(rows('Randy – 26 - Flight A\nTommy Chen - +2 - A flight'), [['Randy', '26', 'A'], ['Tommy Chen', '+2', 'A']]);
    });
    test('a bar or slash glued to the word: "SKEENS|hcp +5", "Pat Morrissey/HCP 21", "Old Tom|hdcp 15 / A"', () => {
        assert.deepEqual(rows('B SKEENS|hcp +5\nPat Morrissey/HCP 21\nOld Tom|hdcp 15 / A'), [['SKEENS', '+5', 'B'], ['Pat Morrissey', '21', null], ['Old Tom', '15', 'A']]);
    });
});

describe('FIX 9: a note at the end of the line comes off before the handicap and flight are read', () => {
    test('"Hugh 17.4 A (guest)", "Skeens 2.0/A (captain)", "Big Jim, +0.5, B [sub]", "Jeremy (25) (cart 3)"', () => {
        const r = P('Hugh 17.4 A (guest)\nSkeens 2.0/A (captain)\nBig Jim, +0.5, B [sub]\nJeremy (25) (cart 3)');
        assert.deepEqual(r.validPlayers.map(p => [p.name, p.hcp, p.flight || null]),
            [['Hugh', '17.4', 'A'], ['Skeens', '2.0', 'A'], ['Big Jim', '+0.5', 'B'], ['Jeremy', '25', null]]);
        assert.deepEqual(r.notedLines.map(n => [n.lineNumber, n.note]), [[1, 'guest'], [2, 'captain'], [3, 'sub'], [4, 'cart 3']]);
    });
    test('a bracket the reading needs is not a note: "(12)", "(B)", "(hcp 5)", and "(A) (new)" keeps the A', () => {
        const r = P('Al (12)\nGlenn (B)\nBo (hcp 5)\nmartín 19.4 (A) (new)');
        assert.deepEqual(r.validPlayers.map(p => [p.name, p.hcp, p.flight || null]), [['Al', '12', null], ['Glenn', '', 'B'], ['Bo', '5', null], ['martín', '19.4', 'A']]);
        assert.deepEqual(r.notedLines.map(n => n.note), ['new']);
    });
    test('"B Jimmy 11 (captain)" is still Jimmy, B, 11, with the note reported once', () => {
        const r = P('B Jimmy 11 (captain)');
        assert.deepEqual(r.validPlayers, [{ name: 'Jimmy', hcp: '11', flight: 'B' }]);
        assert.deepEqual(r.notedLines.map(n => n.note), ['captain']);
    });
    test('admin preview says which notes were left off', () => {
        const vm = require('vm');
        const { loadHtmlInlineScript } = require('./helpers/load-script.js');
        const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
        vm.runInContext(`document.__mount(document.getElementById('player-list'));`, sb);
        sb.__text = 'Hugh 17.4 A (guest)\nMarty 9';
        vm.runInContext(`document.getElementById('paste-players-textarea').value = __text; previewPastedPlayers();`, sb);
        const html = String(vm.runInContext("document.getElementById('paste-preview-summary').innerHTML", sb));
        assert.match(html, /Notes left off the names: "guest" \(line 1\)/);
    });
});
