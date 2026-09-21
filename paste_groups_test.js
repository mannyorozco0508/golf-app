// ============================================================================
// PASTE PLAYER LIST: BLANK-LINE GROUPS + BARE HANDICAPS
//
// THE RULES
//   Blank lines. A run of consecutive non-empty lines is one group; one or
//   more blank lines is a boundary. Leading and trailing blanks are ignored.
//   Any group size is allowed - one, five, more. The resulting sizes are
//   written to groupSizeOverrides. A paste with NO blank lines leaves
//   groupSizeOverrides exactly as it was - today's sizing, untouched. That is
//   the back-compat guarantee and it is controlled below.
//   Handicaps. A trailing token is a handicap when it is an optional sign,
//   one or two digits, an optional single decimal, and lands in -10..54; an
//   optional comma before it is stripped. "Marty 9", "Marty, 9", "Marty +2",
//   "Marty 14.3" parse the same. "Matt H", "Tommy Chen", "Danny Rungood" keep
//   their whole name and no handicap. A line that is ONLY a number is a name.
//   The comma form is unchanged: split at the first comma, as always.
//
// THE USER'S PATH. Every feature test sets the modal's textarea and runs the
// Add Players button's own onclick (commitPastedPlayers). The parser is also
// held directly for the rule table, because that is where the rules live.
//
// HARNESS LIMIT. mini-dom does not parse a row's innerHTML, so names and
// handicaps are read back by regex from the value="" attributes the page
// wrote into each row - the markup, not the input elements. The flight
// control is a real element and is read as one.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const run = (sb, code) => vm.runInContext(code, sb);
const J = (v) => JSON.parse(JSON.stringify(v));
const ADMIN = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');

function adminPage() {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
    run(sb, `document.__mount(document.getElementById('player-list'));`);
    return sb;
}
function paste(sb, text) {
    sb.__text = text;
    run(sb, `document.getElementById('paste-players-textarea').value = __text; previewPastedPlayers(); commitPastedPlayers();`);
}
// Each rendered row's name / hcp, from the markup the page wrote.
function rowsRead(sb) {
    return J(run(sb, `document.querySelectorAll('.player-row').map(function (r) {
        var m = /class="p-name-input"[^>]*value="([^"]*)"/.exec(r.innerHTML);
        var h = /class="p-hcp-input"[^>]*value="([^"]*)"/.exec(r.innerHTML);
        var f = r.querySelector('.p-flight-input');
        return { name: m ? m[1] : null, hcp: h ? h[1] : null, flight: f ? f.getAttribute('data-flight') : null };
    })`));
}
const overrides = (sb) => J(run(sb, 'groupSizeOverrides'));
// HARNESS LIMIT: a second paste rebuilds the list from captureCurrentPlayerInputs,
// which reads each row's name input - an element mini-dom never created from the
// row's innerHTML. Re-attach element inputs with the names the test knows, in
// row order, so the rebuild carries them. The flight control is a real element.
function reattach(sb, names) {
    sb.__names = names;
    run(sb, `document.querySelectorAll('.player-row').forEach(function (row, i) {
        if (!row.querySelector('.p-name-input')) { var n = document.createElement('input'); n.className = 'p-name-input'; n.value = __names[i] || ''; row.appendChild(n); }
        if (!row.querySelector('.p-hcp-input')) { var h = document.createElement('input'); h.className = 'p-hcp-input'; h.value = ''; row.appendChild(h); }
    });`);
}
const parse = (sb, text) => { sb.__text = text; return J(run(sb, 'parsePlayerPasteText(__text)')); };
const unescape = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// THE REAL LIST SHAPE: 23 golfers, 4/4/4/4/4/3, every form mixed in, a
// two-word name whose last token is a capital letter.
const REAL = [
    ['Marty 9', 'Marty', '9'], ['Scott, 7', 'Scott', '7'], ['Carp +2', 'Carp', '+2'], ['Randy', 'Randy', ''],
    ['Manny 0', 'Manny', '0'], ['Matt B', 'Matt B', ''], ['Lance 14.3', 'Lance', '14.3'], ['Kopp, 6', 'Kopp', '6'],
    ['Marcus 9', 'Marcus', '9'], ['Rocco 13', 'Rocco', '13'], ['Matt H', 'Matt H', ''], ['Jeremy, 12', 'Jeremy', '12'],
    ['Tommy Chen', 'Tommy Chen', ''], ['Danny Rungood', 'Danny Rungood', ''], ['Big Al 18', 'Big Al', '18'], ['Steve -3', 'Steve', '-3'],
    ['Mike Jones, 12', 'Mike Jones', '12'], ['Robert Garcia', 'Robert Garcia', ''], ['Tom Wilson, +2', 'Tom Wilson', '+2'], ['J.R. 22', 'J.R', '22'],   // v194: the trailing period comes off a pasted name
    ['Pete 54', 'Pete', '54'], ['Hank 8', 'Hank', '8'], ['Luis 11.5', 'Luis', '11.5']
];
const SIZES = [4, 4, 4, 4, 4, 3];
const realText = (sep) => {
    const groups = []; let i = 0;
    SIZES.forEach(n => { groups.push(REAL.slice(i, i + n).map(r => r[0]).join('\n')); i += n; });
    return groups.join(sep === undefined ? '\n\n' : sep);
};

describe('THE REAL LIST: 23 golfers in 4/4/4/4/4/3 with blank lines between', () => {
    const sb = adminPage();
    paste(sb, realText());
    const rows = rowsRead(sb);

    test('23 rows, no blank row', () => {
        assert.equal(rows.length, 23);
        assert.ok(rows.every(r => r.name && r.name.trim() !== ''), JSON.stringify(rows));
    });
    test('every name intact and every handicap on the right golfer', () => {
        assert.deepEqual(rows.map(r => [unescape(r.name), r.hcp]), REAL.map(r => [r[1], r[2]]));
    });
    test('six groups of exactly those sizes in groupSizeOverrides', () => {
        assert.deepEqual(overrides(sb), { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 3 });
        assert.deepEqual(J(run(sb, 'computeGroupSizes(23, groupSizeOverrides)')), SIZES);
    });
    test('the preview said what would happen: 23 players, 6 groups', () => {
        const sb2 = adminPage();
        sb2.__text = realText();
        run(sb2, `document.getElementById('paste-players-textarea').value = __text; previewPastedPlayers();`);
        const summary = run(sb2, "document.getElementById('paste-preview-summary').innerHTML");
        assert.match(summary, /23 players ready to add/);
        assert.match(summary, /6 groups/);
        assert.match(summary, /4, 4, 4, 4, 4, 3/);
    });
});

describe('BACK-COMPAT: no blank lines at all is today\'s behaviour exactly', () => {
    test('groupSizeOverrides is not touched; 23 golfers size 4/4/4/4/4/3 by the default rule', () => {
        const sb = adminPage();
        run(sb, 'groupSizeOverrides = { 0: 3 };');          // whatever the organizer had already set
        paste(sb, realText('\n'));
        assert.equal(rowsRead(sb).length, 23);
        assert.deepEqual(overrides(sb), { 0: 3 }, 'a paste with no boundary must not write group sizes');
        const p = parse(sb, realText('\n'));
        assert.equal(p.groups.length, 1);
    });
    test('the comma form parses exactly as before, whitespace and all', () => {
        const sb = adminPage();
        const p = parse(sb, 'John Smith, 8\nMike Jones,12\nRobert Garcia\nTom Wilson, +2\n ,8\n');
        assert.deepEqual(p.validPlayers, [
            { name: 'John Smith', hcp: '8' }, { name: 'Mike Jones', hcp: '12' }, { name: 'Robert Garcia', hcp: '' }, { name: 'Tom Wilson', hcp: '+2' }]);
        assert.deepEqual(p.flaggedLines, [{ lineNumber: 5, text: ',8' }]);
    });
    test('the preview on a single-group paste says nothing about groups', () => {
        const sb = adminPage();
        sb.__text = 'Ann\nBen\nCal';
        run(sb, `document.getElementById('paste-players-textarea').value = __text; previewPastedPlayers();`);
        const summary = run(sb, "document.getElementById('paste-preview-summary').innerHTML");
        assert.match(summary, /3 players ready to add/);
        assert.ok(!/group/i.test(summary), summary);
    });
});

describe('BLANK-LINE EDGE CASES', () => {
    test('double blank lines are one boundary', () => {
        const sb = adminPage();
        paste(sb, 'Ann\nBen\n\n\n\nCal\nDee\nEli');
        assert.deepEqual(overrides(sb), { 0: 2, 1: 3 });
        assert.equal(rowsRead(sb).length, 5);
    });
    test('leading and trailing blanks (and whitespace-only lines) are ignored', () => {
        const sb = adminPage();
        paste(sb, '\n\n  \nAnn\nBen\n \nCal\n\n\n   \n');
        assert.deepEqual(overrides(sb), { 0: 2, 1: 1 });
        assert.deepEqual(rowsRead(sb).map(r => r.name), ['Ann', 'Ben', 'Cal']);
    });
    test('a group of one, and a group of five, are honoured as pasted', () => {
        const sb = adminPage();
        paste(sb, 'Solo\n\nA\nB\nC\nD\nE\n\nF\nG');
        assert.deepEqual(overrides(sb), { 0: 1, 1: 5, 2: 2 });
        assert.deepEqual(J(run(sb, 'computeGroupSizes(8, groupSizeOverrides)')), [1, 5, 2]);
    });
    test('pasting groups onto an existing roster keeps the existing golfers\' groups closed and appends the new ones', () => {
        const sb = adminPage();
        paste(sb, 'Ann\nBen');                            // two on the roster, one group of 2
        assert.deepEqual(overrides(sb), {});
        reattach(sb, ['Ann', 'Ben']);
        paste(sb, 'Cal\nDee\nEli\n\nFay');
        assert.deepEqual(overrides(sb), { 0: 2, 1: 3, 2: 1 });
        assert.deepEqual(J(run(sb, 'computeGroupSizes(6, groupSizeOverrides)')), [2, 3, 1]);
        // The rebuilt first two rows carry the re-attached inputs (elements), the
        // four new rows carry markup; read each the way it exists.
        const names = J(run(sb, `document.querySelectorAll('.player-row').map(function (r) {
            var el = r.querySelector('.p-name-input'); if (el) return el.value;
            var m = /class="p-name-input"[^>]*value="([^"]*)"/.exec(r.innerHTML); return m ? m[1] : null; })`));
        assert.deepEqual(names, ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay']);
    });
});

describe('BARE HANDICAPS: the trailing-token rule', () => {
    const sb = adminPage();
    const one = (line) => { const p = parse(sb, line); return p.validPlayers.length === 1 ? [p.validPlayers[0].name, p.validPlayers[0].hcp] : p; };

    test('"Marty 9", "Marty, 9", "Marty +2", "Marty 14.3" all parse the same way', () => {
        assert.deepEqual(one('Marty 9'), ['Marty', '9']);
        assert.deepEqual(one('Marty, 9'), ['Marty', '9']);
        assert.deepEqual(one('Marty +2'), ['Marty', '+2']);
        assert.deepEqual(one('Marty 14.3'), ['Marty', '14.3']);
        assert.deepEqual(one('Marty -4'), ['Marty', '-4']);
        assert.deepEqual(one('Marty   12  '), ['Marty', '12']);
    });
    test('a capital-letter last token, and two-word names, stay whole with no handicap', () => {
        assert.deepEqual(one('Matt H'), ['Matt H', '']);
        assert.deepEqual(one('Tommy Chen'), ['Tommy Chen', '']);
        assert.deepEqual(one('Danny Rungood'), ['Danny Rungood', '']);
    });
    test('a line that is only a number is a NAME', () => {
        assert.deepEqual(one('12'), ['12', '']);
        assert.deepEqual(one('+2'), ['+2', '']);
    });
    test('out of range, three digits, two decimals, or a stuck-on number are not handicaps', () => {
        assert.deepEqual(one('Marty 99'), ['Marty 99', '']);
        assert.deepEqual(one('Marty 55'), ['Marty 55', '']);
        assert.deepEqual(one('Marty -11'), ['Marty -11', '']);
        assert.deepEqual(one('Marty 100'), ['Marty 100', '']);
        assert.deepEqual(one('Marty 14.35'), ['Marty 14.35', '']);
        assert.deepEqual(one('Marty9'), ['Marty9', '']);
    });
    test('the range ends: -10 and 54 are handicaps', () => {
        assert.deepEqual(one('Marty -10'), ['Marty', '-10']);
        assert.deepEqual(one('Marty 54'), ['Marty', '54']);
    });
    test('the comma still wins: everything after the first comma is the handicap, as before', () => {
        assert.deepEqual(one('Marty, 9'), ['Marty', '9']);
        assert.deepEqual(one('Smith, John 9'), ['Smith', 'John 9']);
    });
});

describe('THE PASTE PATH WITH FLIGHTS ON', () => {
    test('every pasted golfer lands in A and carries a control', () => {
        const sb = adminPage();
        run(sb, 'setFlightsEnabled(true)');                 // the switch's own handler
        paste(sb, 'Ann 5\nBen\n\nCal, 7\nDee +1');
        const rows = rowsRead(sb);
        assert.equal(rows.length, 4);
        assert.deepEqual(rows.map(r => r.flight), ['A', 'A', 'A', 'A']);
        assert.deepEqual(rows.map(r => r.hcp), ['5', '', '7', '+1']);
        assert.deepEqual(overrides(sb), { 0: 2, 1: 2 });
        assert.deepEqual(J(run(sb, 'captureCurrentPlayerInputs().map(function (p) { return p.flight; })')), ['A', 'A', 'A', 'A']);
    });
    test('an existing B golfer keeps B through a paste', () => {
        const sb = adminPage();
        run(sb, 'setFlightsEnabled(true)');
        paste(sb, 'Ann\nBen');
        run(sb, 'toggleRowFlight(document.querySelectorAll(".player-row")[1].querySelector(".p-flight-input"))');
        reattach(sb, ['Ann', 'Ben']);       // harness: markup-only rows read as empty, and an empty row is now dropped
        paste(sb, 'Cal\nDee');
        assert.deepEqual(rowsRead(sb).map(r => r.flight), ['A', 'B', 'A', 'A']);
    });
});

// ---------------------------------------------------------------------------
// THE EMPTY ROW ON ARRIVAL. Step 5 arrives with one blank player row (a fresh
// code: addPlayerRow() with nothing in it). commitPastedPlayers captured that
// row as a golfer, so it took the first slot of group 1 - 23 pasted as
// 4/4/4/4/4/3 landed as 1+3 / 1+3 / ... every group shifted by one - and the
// save later named the blank row "Player 1". The commit now drops any existing
// row that has no name AND no handicap before it counts sizes or appends. A row
// with a name and no handicap is a golfer and stays. A row with a handicap and
// no name is NOT this rule's business and is left exactly as today.
//
// HARNESS: addPlayerRow() here builds a row whose inputs are markup only, so the
// capture reads name '' / hcp '' - the same thing a blank arrival row reads as.
// A named row is made by re-attaching a real input (reattach / reattachHcp).
// ---------------------------------------------------------------------------
function reattachHcp(sb, hcps) {
    sb.__hcps = hcps;
    run(sb, `document.querySelectorAll('.player-row').forEach(function (row, i) {
        if (!row.querySelector('.p-hcp-input')) { var h = document.createElement('input'); h.className = 'p-hcp-input'; h.value = __hcps[i] || ''; row.appendChild(h); }
        if (!row.querySelector('.p-name-input')) { var n = document.createElement('input'); n.className = 'p-name-input'; n.value = ''; row.appendChild(n); }
    });`);
}
const namesAny = (sb) => J(run(sb, `document.querySelectorAll('.player-row').map(function (r) {
    var el = r.querySelector('.p-name-input'); if (el) return el.value;
    var m = /class="p-name-input"[^>]*value="([^"]*)"/.exec(r.innerHTML); return m ? m[1] : null; })`));

describe('THE EMPTY ROW ON ARRIVAL is dropped by the paste', () => {
    test('the real 23 onto a fresh Step 5 (one blank row): 4/4/4/4/4/3, 23 rows, no blank golfer, every pair right', () => {
        const sb = adminPage();
        run(sb, 'addPlayerRow()');                             // the arrival row
        assert.equal(run(sb, "document.querySelectorAll('.player-row').length"), 1);
        paste(sb, realText());
        // Sizes first: with the blank row carried they come out {0:1, 1:4, ... 6:3},
        // every group shifted by one - the shape of the bug, named in the red.
        assert.deepEqual(overrides(sb), { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 3 }, 'group sizes shifted by the blank arrival row');
        const rows = rowsRead(sb);
        assert.equal(rows.length, 23, 'the blank row is gone, not carried');
        assert.deepEqual(rows.map(r => [unescape(r.name), r.hcp]), REAL.map(r => [r[1], r[2]]));
    });
    test('onto two real golfers plus a trailing blank row: the two kept, the blank dropped, sizes 2 then the runs', () => {
        const sb = adminPage();
        paste(sb, 'Ann\nBen');
        run(sb, 'addNewPlayerAndRefresh()');                   // the + button: a blank third row
        reattach(sb, ['Ann', 'Ben', '']);
        assert.equal(run(sb, "document.querySelectorAll('.player-row').length"), 3);
        paste(sb, 'Cal\nDee\nEli\n\nFay');
        assert.deepEqual(namesAny(sb), ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay']);
        assert.deepEqual(overrides(sb), { 0: 2, 1: 3, 2: 1 });
    });
    test('a row with a name and no handicap is never dropped', () => {
        const sb = adminPage();
        run(sb, 'addPlayerRow()');
        reattach(sb, ['Randy']);                               // name, hcp ''
        paste(sb, 'Cal\nDee\n\nEli');
        assert.deepEqual(namesAny(sb), ['Randy', 'Cal', 'Dee', 'Eli']);
        assert.deepEqual(overrides(sb), { 0: 1, 1: 2, 2: 1 });
    });
    test('a row with a handicap and no name is NOT dropped by this rule (today\'s behaviour, unchanged: it stays and the save would name it "Player N")', () => {
        const sb = adminPage();
        run(sb, 'addPlayerRow()');
        reattachHcp(sb, ['8']);                                // hcp, name ''
        paste(sb, 'Cal\nDee\n\nEli');
        assert.deepEqual(namesAny(sb), ['', 'Cal', 'Dee', 'Eli']);
        assert.deepEqual(overrides(sb), { 0: 1, 1: 2, 2: 1 });
        assert.match(ADMIN, /row\.querySelector\('\.p-name-input'\)\.value\.trim\(\) \|\| `Player \$\{idx \+ 1\}`/, 'the save names a nameless row');
    });
    test('a no-blank-line paste onto the blank arrival row: default sizing untouched, and the blank row still dropped', () => {
        const sb = adminPage();
        run(sb, 'addPlayerRow(); groupSizeOverrides = { 0: 3 };');
        paste(sb, realText('\n'));
        assert.equal(rowsRead(sb).length, 23);
        assert.deepEqual(overrides(sb), { 0: 3 });
    });
    test('flights ON: the blank row and its control go; the remaining tags are undisturbed', () => {
        const sb = adminPage();
        run(sb, 'setFlightsEnabled(true)');
        paste(sb, 'Ann\nBen');
        run(sb, 'toggleRowFlight(document.querySelectorAll(".player-row")[1].querySelector(".p-flight-input"))');   // Ben -> B
        run(sb, 'addNewPlayerAndRefresh()');                   // blank third row, control A
        reattach(sb, ['Ann', 'Ben', '']);
        assert.deepEqual(rowsRead(sb).map(r => r.flight), ['A', 'B', 'A']);
        paste(sb, 'Cal\n\nDee');
        assert.deepEqual(namesAny(sb), ['Ann', 'Ben', 'Cal', 'Dee']);
        assert.deepEqual(rowsRead(sb).map(r => r.flight), ['A', 'B', 'A', 'A']);
        assert.deepEqual(overrides(sb), { 0: 2, 1: 1, 2: 1 });
    });
});

describe('THE SEAM (source)', () => {
    const fn = ADMIN.slice(ADMIN.indexOf('function parsePlayerPasteText('), ADMIN.indexOf('\n    function ', ADMIN.indexOf('function parsePlayerPasteText(') + 30));
    test('one parser, returning groups beside validPlayers; the commit writes overrides only when there was a boundary', () => {
        assert.ok(fn.length > 500, 'the parser was found');
        assert.match(fn, /groups/);
        assert.match(fn, /BARE_HCP_RE|trailing/i);
        const commit = ADMIN.slice(ADMIN.indexOf('function commitPastedPlayers('), ADMIN.indexOf('function removePlayerRowAndRefresh('));
        assert.match(commit, /groups\.length > 1/);
        assert.match(commit, /groupSizeOverrides\[/);
        assert.match(commit, /isEmptyRow|name\)\.trim\(\) === '' && String\(p\.hcp\)\.trim\(\) === ''/, 'the empty-row drop lives in the commit');
    });
    test('the modal\'s label says what the box accepts: blank lines for groups, a handicap after the name', () => {
        const label = /<label for="paste-players-textarea"[^>]*>([\s\S]*?)<\/label>/.exec(ADMIN);
        assert.ok(label, 'the label exists');
        assert.match(label[1], /blank line/i);
        assert.match(label[1], /handicap/i);
    });
});
