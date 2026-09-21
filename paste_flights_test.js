// ============================================================================
// THE PASTE READS A FLIGHT LETTER (2026-09-21, v188)
//
// Manny keeps his list with the flight beside each name and pastes it as-is:
//   A · Randy T 12      A, Randy T 12      A -- Randy T 12      A Randy T 12
// THE RULES (admin.html splitLeadingFlight):
//   1. A LEADING A or B, then any run of separators (spaces, commas, dashes
//      - - —, dots, colons, middots · •), then the name, sets the flight.
//      Case-insensitive. The handicap still reads as the trailing number.
//   2. NEVER a trailing letter: "Matt B" and "Jim B" keep their initials and
//      carry no flight. The regex is anchored at ^; nothing reads the end.
//   3. THE INITIALS GUARD: a LONE dot or dash GLUED to the next letter is part
//      of a name - "B.J. Smith", "A.J.", "A-Rod" are names. "B. J Smith" (dot,
//      space), "B... Jim" (a run), "A, Randy" / "A: Randy" / "A · Randy" (any
//      other separator) are flights. Errs toward the name: a real golfer is
//      never silently moved.
//   4. ONLY A AND B: a leading C, D or other letter with a separator run is
//      not a flight and not invented into one - the line is kept AS TYPED for
//      the name, and the preview says "Only A and B are flights" with the line.
//   5. Any flight in the paste turns flights on for the round on commit; a
//      golfer with no letter goes in A (the same default a row gets when
//      flights are switched on by hand) and the preview counts them.
//   Group breaks (blank lines) and the comma handicap form are untouched.
//
// HARNESS: paste_groups_test.js's - the modal's own preview and commit are
// invoked the way the buttons invoke them; rows are read from the markup the
// page wrote; the flight control is a real element (data-flight).
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const run = (sb, code) => vm.runInContext(code, sb);
const J = v => JSON.parse(JSON.stringify(v));
function adminPage() {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
    run(sb, `document.__mount(document.getElementById('player-list'));`);
    return sb;
}
function paste(sb, text) {
    sb.__text = text;
    run(sb, `document.getElementById('paste-players-textarea').value = __text; previewPastedPlayers(); commitPastedPlayers();`);
}
function preview(sb, text) {
    sb.__text = text;
    run(sb, `document.getElementById('paste-players-textarea').value = __text; previewPastedPlayers();`);
    return String(run(sb, "document.getElementById('paste-preview-summary').innerHTML")).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function rowsRead(sb) {
    return J(run(sb, `document.querySelectorAll('.player-row').map(function (r) {
        var m = /class="p-name-input"[^>]*value="([^"]*)"/.exec(r.innerHTML);
        var h = /class="p-hcp-input"[^>]*value="([^"]*)"/.exec(r.innerHTML);
        var f = r.querySelector('.p-flight-input');
        return { name: m ? m[1] : null, hcp: h ? h[1] : null, flight: f ? f.getAttribute('data-flight') : null };
    })`));
}
const parse = (sb, text) => { sb.__text = text; return J(run(sb, 'parsePlayerPasteText(__text)')); };
const players = (sb, text) => parse(sb, text).validPlayers.map(p => [p.name, p.hcp, p.flight || null]);
const overrides = sb => J(run(sb, 'groupSizeOverrides'));

// MANNY'S LIST, verbatim: 25 golfers, 5/4/4/4/4/4, 12 A / 13 B.
const MANNY = `A · Randy T
A · Ryan H
A · Anthony
B · Danny
B · Andy

B · Tim K
B · Jim B
B · Chris S
B · Randy C

B · Marty
A · Mike
B · Tanner
B · Glen

A · Manny
A · Kopp
A · Dalen
A · Matt M

A · Lance
B · Matt B
A · Paul
A · Bobby

B · Rocco
B · Matt H
B · Jeremy
A · Carl`;
const MANNY_ROWS = [['Randy T', 'A'], ['Ryan H', 'A'], ['Anthony', 'A'], ['Danny', 'B'], ['Andy', 'B'], ['Tim K', 'B'], ['Jim B', 'B'], ['Chris S', 'B'], ['Randy C', 'B'],
    ['Marty', 'B'], ['Mike', 'A'], ['Tanner', 'B'], ['Glen', 'B'], ['Manny', 'A'], ['Kopp', 'A'], ['Dalen', 'A'], ['Matt M', 'A'], ['Lance', 'A'], ['Matt B', 'B'], ['Paul', 'A'], ['Bobby', 'A'],
    ['Rocco', 'B'], ['Matt H', 'B'], ['Jeremy', 'B'], ['Carl', 'A']];

describe("MANNY'S LIST: 25 golfers with a middot flight letter, five group breaks", () => {
    const sb = adminPage();
    assert.equal(run(sb, 'flightsEnabledNow()'), false, 'flights start off');
    paste(sb, MANNY);
    const rows = rowsRead(sb);
    test('25 rows, every name intact (the letter and the middot gone), every flight on its golfer', () => {
        assert.equal(rows.length, 25);
        assert.deepEqual(rows.map(r => [r.name, r.flight]), MANNY_ROWS);
    });
    test('12 in A, 13 in B; "Matt B" and "Jim B" kept their initials and are in B because of the LEADING letter', () => {
        assert.equal(rows.filter(r => r.flight === 'A').length, 12);
        assert.equal(rows.filter(r => r.flight === 'B').length, 13);
        assert.deepEqual(rows.filter(r => /^(Matt|Jim) B$/.test(r.name)).map(r => [r.name, r.flight]), [['Jim B', 'B'], ['Matt B', 'B']]);
    });
    test('flights were turned on by the paste, and the payload carries the switch', () => {
        assert.equal(run(sb, 'flightsEnabledNow()'), true);
        assert.deepEqual(J(run(sb, 'flightsSetting()')), { enabled: true, scopes: { skins: 'flight', birdies: 'flight' }, skinsSplit: 'even' });
    });
    test('the group breaks are unchanged: 5/4/4/4/4/4', () => {
        assert.deepEqual(overrides(sb), { 0: 5, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 });
    });
    test('no handicaps on this list: every hcp blank', () => {
        assert.ok(rows.every(r => r.hcp === ''), JSON.stringify(rows.map(r => r.hcp)));
    });
    test('the preview said it: 25 players, 6 groups, 12 in A, 13 in B, flights will be turned on', () => {
        const s = preview(adminPage(), MANNY);
        assert.match(s, /25 players ready to add/); assert.match(s, /in 6 groups \(5, 4, 4, 4, 4, 4\)/);
        assert.match(s, /12 in A, 13 in B — flights will be turned on/);
        assert.doesNotMatch(s, /no letter|Only A and B/);
    });
});

describe('EVERY SEPARATOR, and the handicap after it', () => {
    const sb = adminPage();
    const CASES = [
        ['A · Randy T 12', 'Randy T', '12', 'A'], ['A, Randy T 12', 'Randy T', '12', 'A'], ['A -- Randy T 12', 'Randy T', '12', 'A'],
        ['A Randy T 12', 'Randy T', '12', 'A'], ['A... Randy T 12', 'Randy T', '12', 'A'], ['A: Randy T 12', 'Randy T', '12', 'A'],
        ['A – Randy T 12', 'Randy T', '12', 'A'], ['A — Randy T 12', 'Randy T', '12', 'A'], ['A • Randy T 12', 'Randy T', '12', 'A'],
        ['B - Randy T', 'Randy T', '', 'B'], ['b · randy t +2', 'randy t', '+2', 'B'], ['a Randy T, 12', 'Randy T', '12', 'A'],
        ['A·Randy T', 'Randy T', '', 'A'], ['A,Randy T', 'Randy T', '', 'A'], ['A  ·  Randy T   9', 'Randy T', '9', 'A']
    ];
    CASES.forEach(([line, name, hcp, flight]) => test(JSON.stringify(line) + ' -> ' + name + ' / ' + (hcp || 'no hcp') + ' / flight ' + flight, () => {
        assert.deepEqual(players(sb, line), [[name, hcp, flight]]);
    }));
    test('the handicap reads with or without a flight, in both forms', () => {
        assert.deepEqual(players(sb, 'Randy T 12\nRandy T, 12\nA · Randy T 12\nA · Randy T, 12\nB Lance 14.3\nB, Steve -3'),
            [['Randy T', '12', null], ['Randy T', '12', null], ['Randy T', '12', 'A'], ['Randy T', '12', 'A'], ['Lance', '14.3', 'B'], ['Steve', '-3', 'B']]);
    });
});

describe('NEVER A TRAILING LETTER; THE INITIALS GUARD; ONLY A AND B', () => {
    const sb = adminPage();
    test('"Matt B" and "Jim B" are whole names with no flight (CONTROL: a trailing B read as a flight would show here)', () => {
        assert.deepEqual(players(sb, 'Matt B\nJim B\nMatt B 9\nRandy A'), [['Matt B', '', null], ['Jim B', '', null], ['Matt B', '9', null], ['Randy A', '', null]]);
    });
    test('"B.J. Smith", "A.J.", "A-Rod" are names (CONTROL: "B.J." read as flight B would show here)', () => {
        assert.deepEqual(players(sb, 'B.J. Smith\nA.J.\nA-Rod 4\nB.J. Smith 7'), [['B.J. Smith', '', null], ['A.J.', '', null], ['A-Rod', '4', null], ['B.J. Smith', '7', null]]);
    });
    test('"B. J Smith" (dot then space) and "B... Jim" (a run) are flight B, and the letter is gone from the name (CONTROL: a letter left inside a name)', () => {
        assert.deepEqual(players(sb, 'B. J Smith\nB... Jim\nA.. Ann'), [['J Smith', '', 'B'], ['Jim', '', 'B'], ['Ann', '', 'A']]);
        parse(sb, 'B... Jim').validPlayers.forEach(p => assert.doesNotMatch(p.name, /^B/));
    });
    test('"Al", "Bo", "Ben", "A", "B" are names: no separator after the letter, no flight', () => {
        assert.deepEqual(players(sb, 'Al\nBo\nBen\nA\nB\nAl 9'), [['Al', '', null], ['Bo', '', null], ['Ben', '', null], ['A', '', null], ['B', '', null], ['Al', '9', null]]);
    });
    test('a leading C is not a flight: the line is kept AS TYPED and the preview says only A and B are flights (CONTROL: a C accepted as a flight)', () => {
        const r = parse(sb, 'C · Randy T 12\nA · Mike\nD, Jim');
        // kept as typed: the comma in "D, Jim" is not the handicap form; the bare trailing 12 still reads
        assert.deepEqual(r.validPlayers, [{ name: 'C · Randy T', hcp: '12' }, { name: 'Mike', hcp: '', flight: 'A' }, { name: 'D, Jim', hcp: '' }]);
        assert.deepEqual(r.flaggedFlights.map(f => [f.lineNumber, f.letter]), [[1, 'C'], [3, 'D']]);
        const s = preview(adminPage(), 'C · Randy T 12\nA · Mike\nD, Jim');
        assert.match(s, /Only A and B are flights — these lines were added as typed, so fix the name after adding: Line 1: "C · Randy T 12" Line 3: "D, Jim"/);
        assert.match(s, /1 in A, 0 in B/);
    });
    test('a glued initial that is not A or B is a plain name, not flagged: "C.J. Smith", "T-Bone"', () => {
        const r = parse(sb, 'C.J. Smith\nT-Bone 4');
        assert.deepEqual(r.validPlayers, [{ name: 'C.J. Smith', hcp: '' }, { name: 'T-Bone', hcp: '4' }]);
        assert.deepEqual(r.flaggedFlights, []);
        assert.equal(r.flights, null);
    });
});

describe('A MIXED PASTE: some letters, some not', () => {
    const sb = adminPage();
    paste(sb, 'A · Randy T 12\nMatt B\nB · Jim B\nB.J. Smith\n\nAl\nb - Bo 3');
    const rows = rowsRead(sb);
    test('the lettered golfers carry their flight; the unlettered go in A; flights are on', () => {
        assert.deepEqual(rows.map(r => [r.name, r.hcp, r.flight]), [['Randy T', '12', 'A'], ['Matt B', '', 'A'], ['Jim B', '', 'B'], ['B.J. Smith', '', 'A'], ['Al', '', 'A'], ['Bo', '3', 'B']]);
        assert.equal(run(sb, 'flightsEnabledNow()'), true);
        assert.deepEqual(overrides(sb), { 0: 4, 1: 2 });
    });
    test('the preview counts the unlettered and says where they go', () => {
        const s = preview(adminPage(), 'A · Randy T 12\nMatt B\nB · Jim B\nB.J. Smith\n\nAl\nb - Bo 3');
        assert.match(s, /1 in A, 2 in B — flights will be turned on\. 3 golfers have no letter and go in A — tap a golfer's A\/B to move them\./);
    });
    test('one unlettered golfer: singular', () => {
        assert.match(preview(adminPage(), 'A · Randy\nMatt B'), /1 in A, 0 in B — flights will be turned on\. 1 golfer has no letter and goes in A/);
    });
});

describe('NO LETTERS AT ALL: nothing changes', () => {
    const sb = adminPage();
    paste(sb, 'Marty 9\nScott, 7\nMatt B\n\nJ.R. 22\nBig Al 18');
    test('no flight on any row, flights stay off, groups as before, no flights line in the preview', () => {
        const rows = rowsRead(sb);
        assert.deepEqual(rows.map(r => [r.name, r.hcp, r.flight]), [['Marty', '9', null], ['Scott', '7', null], ['Matt B', '', null], ['J.R.', '22', null], ['Big Al', '18', null]]);
        assert.equal(run(sb, 'flightsEnabledNow()'), false);
        assert.deepEqual(overrides(sb), { 0: 3, 1: 2 });
        const s = preview(adminPage(), 'Marty 9\nScott, 7');
        assert.doesNotMatch(s, /in A|flights/);
    });
    test('flights already on, a paste with no letters: rows get A (the switch-on default), flights stay on', () => {
        const sb2 = adminPage();
        run(sb2, 'setFlightsEnabled(true)');
        paste(sb2, 'Marty 9\nScott');
        assert.deepEqual(rowsRead(sb2).map(r => [r.name, r.flight]), [['Marty', 'A'], ['Scott', 'A']]);
        assert.equal(run(sb2, 'flightsEnabledNow()'), true);
    });
    test('flights already on, letters in the paste: the preview does not say "will be turned on"', () => {
        const sb2 = adminPage();
        run(sb2, 'setFlightsEnabled(true)');
        const s = preview(sb2, 'A · Marty\nB · Scott');
        assert.match(s, /1 in A, 1 in B/); assert.doesNotMatch(s, /turned on/);
    });
});

describe('THE SOURCE RULE, pinned: leading only, glued dot or dash guarded, A and B only', () => {
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    const fn = src.slice(src.indexOf('function splitLeadingFlight('), src.indexOf('function parsePlayerPasteText('));
    test('anchored at the start of the line, never the end', () => {
        assert.match(src, /const LEAD_FLIGHT_RE = \/\^\(\[A-Za-z\]\)\(\[/, 'anchored ^, a regex literal');
        assert.match(fn, /LEAD_FLIGHT_RE\.exec\(line\)/);
        assert.doesNotMatch(fn, /\$'\)|\[AaBb\]\$|\\s\[AB\]\$/, 'nothing reads a trailing letter');
    });
    test('the guard and the A/B gate are there', () => {
        assert.match(fn, /\(m\[2\] === '\.' \|\| m\[2\] === '-'\) && \/\^\[A-Za-z\]\/\.test\(m\[3\]\)/);
        assert.match(fn, /letter !== 'A' && letter !== 'B'/);
        assert.match(fn, /\.toUpperCase\(\)/, 'case-insensitive');
    });
});
