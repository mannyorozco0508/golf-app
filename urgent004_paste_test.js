// URGENT-004 (2026-10-18): Manny's Monday list, written handicap-then-flight at the
// END of each line ("Skeens 2.0/A"), pasted into Active Players. Every line went into
// NAME, the handicap stayed empty and Flights stayed off; switching Flights on by
// hand then put all twenty in A. No build ever read this form (only a LEADING flight
// was understood). This holds the fix: the paste itself, the other ways a list is
// typed, the plus handicap, the two Matts and two Mikes, and the rows already on
// the roster from the broken paste fixing themselves on the next redraw.
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');
const R = require('./roster-paste.js');
// handicap.js is a browser script (no exports): read it into a sandbox, unchanged.
const HC = vm.createContext({});
vm.runInContext(require('fs').readFileSync(require('path').join(__dirname, 'handicap.js'), 'utf8'), HC);
const parseHcp = (s) => vm.runInContext('parseHcp(' + JSON.stringify(s) + ')', HC);
const getStrokes = (i, h) => vm.runInContext('getStrokes(' + i + ', ' + h + ')', HC);

const J = (v) => JSON.parse(JSON.stringify(v));
const run = (sb, code) => vm.runInContext(code, sb);
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

// MANNY'S PASTE, verbatim (Sun Oct 18, for Monday Oct 19).
const MANNY = `Skeens 2.0/A
Bob 5.0/A
Manny +2.0/A
Paul 4.0/A

Glenn 12.0/B
Marty 9.0/B
Scott 6.0/B
Eddie 12.0/B

Carl 6.0/A
Matt 8.0/B
Jeremy 14.0/B
Matt 12.0/B

Kopp 6.0/A
Tim 1.0/A
Dalen +2.0/A
Mike 4.0/A

Crone 10.0/B
Todd 14.0/B
Mike 6.0/A
Jim 12.0/B`;
const EXPECT = [['Skeens', '2.0', 'A'], ['Bob', '5.0', 'A'], ['Manny', '+2.0', 'A'], ['Paul', '4.0', 'A'],
    ['Glenn', '12.0', 'B'], ['Marty', '9.0', 'B'], ['Scott', '6.0', 'B'], ['Eddie', '12.0', 'B'],
    ['Carl', '6.0', 'A'], ['Matt', '8.0', 'B'], ['Jeremy', '14.0', 'B'], ['Matt', '12.0', 'B'],
    ['Kopp', '6.0', 'A'], ['Tim', '1.0', 'A'], ['Dalen', '+2.0', 'A'], ['Mike', '4.0', 'A'],
    ['Crone', '10.0', 'B'], ['Todd', '14.0', 'B'], ['Mike', '6.0', 'A'], ['Jim', '12.0', 'B']];

describe("MANNY'S PASTE: name, then handicap/flight at the end of each line", () => {
    const sb = adminPage();
    assert.equal(run(sb, 'flightsEnabledNow()'), false, 'flights start off');
    const pv = preview(sb, MANNY);
    paste(sb, MANNY);
    const rows = rowsRead(sb);
    test('20 golfers: each name alone, the handicap in HCP, the flight on the golfer', () => {
        assert.deepEqual(rows.map(r => [r.name, r.hcp, r.flight]), EXPECT);
    });
    test('A 10 (Skeens, Bob, Manny, Paul, Carl, Kopp, Tim, Dalen, both Mikes), B 10', () => {
        assert.deepEqual(rows.filter(r => r.flight === 'A').map(r => r.name), ['Skeens', 'Bob', 'Manny', 'Paul', 'Carl', 'Kopp', 'Tim', 'Dalen', 'Mike', 'Mike']);
        assert.deepEqual(rows.filter(r => r.flight === 'B').map(r => r.name), ['Glenn', 'Marty', 'Scott', 'Eddie', 'Matt', 'Jeremy', 'Matt', 'Crone', 'Todd', 'Jim']);
    });
    test('Flights (A/B) turned itself on, and the live count says A: 10 · B: 10', () => {
        assert.equal(run(sb, 'flightsEnabledNow()'), true);
        run(sb, 'refreshFlightsCount()');
        assert.equal(String(run(sb, "document.getElementById('flights-count').textContent")), 'A: 10 · B: 10');
    });
    test('five groups of four from the blank lines', () => {
        assert.deepEqual(J(run(sb, 'groupSizeOverrides')), { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4 });
    });
    test('the two Matts and two Mikes stay four golfers, and both the preview and the roster ask for a last initial', () => {
        assert.equal(rows.filter(r => r.name === 'Matt').length, 2);
        assert.equal(rows.filter(r => r.name === 'Mike').length, 2);
        assert.match(pv, /Two golfers named Matt, two golfers named Mike - kept as separate golfers\. Add a last initial/);
        // (the same note above the roster is checked in real Chrome: urgent004_paste_fix_chrome_test.js)
    });
    test('the preview says 10 in A, 10 in B, flights will be turned on', () => {
        assert.match(pv, /10 in A, 10 in B — flights will be turned on/);
    });
});

describe('THE PLUS HANDICAP keeps its sign, and the net math gives strokes back (handicap.js unchanged)', () => {
    test('"+2.0" is stored as typed and reads as -2', () => {
        const p = R.parsePlayerPasteText('Manny +2.0/A', []).validPlayers[0];
        assert.deepEqual([p.name, p.hcp, p.flight], ['Manny', '+2.0', 'A']);
        assert.equal(parseHcp(p.hcp), -2);
    });
    test('a +2 gives a stroke back on the two easiest holes (17, 18) and nothing elsewhere', () => {
        assert.equal(getStrokes(18, parseHcp('+2.0')), -1);
        assert.equal(getStrokes(17, parseHcp('+2.0')), -1);
        assert.equal(getStrokes(16, parseHcp('+2.0')), 0);
    });
});

describe('THE OTHER WAYS A LIST IS TYPED', () => {
    const one = (l) => { const p = R.parsePlayerPasteText(l, []).validPlayers[0]; return [p.name, p.hcp, p.flight || null]; };
    const CASES = [
        ['Name 12', ['Name', '12', null]], ['Name 12/B', ['Name', '12', 'B']], ['Name 12 / b', ['Name', '12', 'B']],
        ['Name, 12, B', ['Name', '12', 'B']], ['Name 12 B', ['Name', '12', 'B']], ['Name (12) B', ['Name', '12', 'B']],
        ['Name\t12\tB', ['Name', '12', 'B']], ['name 12 b', ['name', '12', 'B']], ['Name (12)', ['Name', '12', null]],
        ['Tom Kopp 6.5/a', ['Tom Kopp', '6.5', 'A']], ['Dalen +2', ['Dalen', '+2', null]],
    ];
    CASES.forEach(([line, want]) => test(JSON.stringify(line) + ' -> ' + want.join(' / '), () => assert.deepEqual(one(line), want)));
    test('a trailing letter WITHOUT a handicap before it is still a last initial: "Matt B", "Jim B 12"', () => {
        assert.deepEqual(one('Matt B'), ['Matt B', '', null]);
        assert.deepEqual(one('Jim B 12'), ['Jim B', '12', null]);
    });
    test('a leading flight still works ("B Zack 6"), and only A and B are flights', () => {
        assert.deepEqual(one('B Zack 6'), ['Zack', '6', 'B']);
        assert.deepEqual(one('Marty 99/B'), ['Marty 99/B', '', null]);
        assert.deepEqual(one('Name 12/C'), ['Name 12/C', '', null]);
    });
});

describe("THE ROWS FROM THE BROKEN PASTE fix themselves (fixPastedRows; the page flow is urgent004_paste_fix_chrome_test.js)", () => {
    const broken = MANNY.split('\n').filter(l => l.trim()).map((l, i) => ({ id: 101 + i, name: l, hcp: '', flight: 'A', team: 'Team 1' }));
    const r = R.fixPastedRows(broken);
    test('all 20 split into name / HCP / flight, A 10 · B 10, and the rest of each row kept', () => {
        assert.equal(r.fixed, 20);
        assert.equal(r.anyFlight, true);
        assert.deepEqual(r.list.map(p => [p.name, p.hcp, p.flight]), EXPECT);
        assert.deepEqual(r.list.map(p => p.id), broken.map(p => p.id));
        assert.ok(r.list.every(p => p.team === 'Team 1'));
    });
    test('a second pass changes nothing', () => {
        assert.equal(R.fixPastedRows(r.list).fixed, 0);
    });
    test('a row whose HCP was typed is never rewritten; a plain name is left alone', () => {
        const x = R.fixPastedRows([{ name: 'Odd Name 3/A', hcp: '7' }, { name: 'Matt B', hcp: '' }, { name: 'Tommy Chen', hcp: '' }]);
        assert.equal(x.fixed, 0);
        assert.deepEqual(x.list.map(p => [p.name, p.hcp]), [['Odd Name 3/A', '7'], ['Matt B', ''], ['Tommy Chen', '']]);
    });
});
