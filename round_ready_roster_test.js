// ============================================================================
// ROUND READY'S PLAYER LIST IS FLAT WRAPPED TEXT (Wave 21)
//
// BEFORE, measured at 390x844 with 25 golfers: one name per line, joined with <br>,
// 587px of list inside a 629px box. (Manny's estimate was ~1500px; the measurement
// is 587. Reported as measured - the same direction as Wave 20, where ~900 measured
// 518.) It is still a long block on a screen that exists to be read once.
//
// AFTER: one flat run of wrapped text - "Randy T (0) · Ryan H (1) · Anthony (2) · …".
//
// THE LIST STAYS, and that is the point: it is the only check that a pasted roster
// came through correctly before the links go out. What goes is the line-per-golfer
// shape. No count line and no grouping, both Manny's call.
//
// WHAT IS GUARDED, and only this, because Round Ready is seen once per round: the
// HEIGHT, and that EVERY NAME IS PRESENT. A condensed list that silently dropped a
// golfer would be worse than a tall one, so the name check is the half that matters.
//
// A LIMIT, STATED. Round Ready is reachable only after a save - showRoundReadyScreen
// has exactly one caller, inside saveSettings - so this suite shows the screen and
// calls paintRoundReadyRoster the way the page does, rather than driving the whole
// wizard. It is therefore a LAYOUT measurement and NOT a reachability proof: it
// cannot tell you a golfer can get to this screen. round-ready.test.js and
// organizer_link_share_test.js cover the screen's own plumbing.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

// Manny's own round: 25 golfers. The names are short and real-shaped, because a
// condensed list's height depends on how many characters it has to wrap.
const NAMES = ['Randy T', 'Ryan H', 'Anthony', 'Kopp', 'Dalen', 'Vic', 'Manny', 'Marty', 'Lance',
    'Matt M', 'Matt B', 'Matt H', 'Eric', 'Chris', 'Ivy', 'Jon', 'Kim', 'Lee', 'Gus', 'Hal',
    'Fay', 'Eli', 'Dee', 'Cal', 'Ben'];
const PLAYERS = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: String(i % 20), playingForMoney: true }));

const BEFORE_LIST_PX = 587;      // measured on v248, 25 golfers, 390x844
const MAX_LIST_PX = 220;         // the condensed list, measured; see the note below

const PROBE = `(function () {
  document.getElementById('round-ready-screen').style.display = 'block';
  paintRoundReadyRoster({ players: ${JSON.stringify(PLAYERS)} });
  var list = document.getElementById('rr-players-list');
  var box = document.getElementById('rr-players-box');
  var txt = (list.innerText || '').replace(/\\s+/g, ' ').trim();
  return JSON.stringify({
    listH: Math.round(list.getBoundingClientRect().height),
    listW: Math.round(list.getBoundingClientRect().width),
    boxH: box ? Math.round(box.getBoundingClientRect().height) : null,
    brCount: (list.innerHTML.match(/<br>/g) || []).length,
    dotCount: (txt.match(/\\u00B7/g) || []).length,
    missing: ${JSON.stringify(NAMES)}.filter(function (n) { return txt.indexOf(n) === -1; }),
    text: txt,
    docScrollW: document.documentElement.scrollWidth, vw: window.innerWidth
  });
})()`;

const V = {};
before(async () => {
    const r = await arriveCold({ url: fileUrl('admin.html', ''),
        db: { events: {}, global_courses: {}, trips: {}, tournaments: {} },
        settleMs: 2600, viewport: { width: 390, height: 844 }, steps: [{ expression: PROBE }] });
    V.o = r.ok ? JSON.parse(r.value[0]) : { error: r.reason };
});

describe('THE LIST IS CONDENSED', () => {
    test('ran', () => assert.ok(V.o && !V.o.error, V.o && V.o.error));

    test('EVERY ONE OF THE 25 NAMES IS STILL THERE — the half that matters', () => {
        // A condensed list that dropped a golfer would be worse than a tall one: this
        // screen exists so an organizer can check a pasted roster before the links go out.
        assert.deepEqual(V.o.missing, [], 'missing from the list: ' + V.o.missing.join(', '));
    });

    test('it is FLAT wrapped text, not one name per line', () => {
        assert.equal(V.o.brCount, 0, 'the list still joins with <br>: ' + V.o.brCount + ' of them');
        assert.equal(V.o.dotCount, NAMES.length - 1,
            'expected ' + (NAMES.length - 1) + ' separators between ' + NAMES.length + ' names, got ' + V.o.dotCount);
    });

    test('the handicap still rides with the name', () => {
        // The roster check is worth nothing if it shows names without the numbers that
        // came with them - a pasted roster gets both wrong together.
        assert.match(V.o.text, /Randy T \(0\)/);
        assert.match(V.o.text, /Matt M \(9\)/);
    });

    test('and the height came down from ' + BEFORE_LIST_PX + 'px', () => {
        assert.ok(V.o.listH <= MAX_LIST_PX,
            'the list is ' + V.o.listH + 'px, which is over the ' + MAX_LIST_PX + 'px this wave set');
        assert.ok(V.o.listH < BEFORE_LIST_PX / 2,
            'the list is ' + V.o.listH + 'px against ' + BEFORE_LIST_PX + 'px before - less than half was the point');
    });

    test('nothing scrolls sideways', () => {
        assert.ok(V.o.docScrollW <= V.o.vw, 'admin.html scrolls sideways: ' + V.o.docScrollW);
    });
});

describe('THE SOURCE', () => {
    const SRC = read('admin.html');
    const fn = SRC.slice(SRC.indexOf('function paintRoundReadyRoster'),
                         SRC.indexOf('\n    }', SRC.indexOf('function paintRoundReadyRoster')));
    test('the painter joins with a separator, not a line break', () => {
        assert.ok(fn.length > 100, 'paintRoundReadyRoster could not be sliced');
        assert.ok(!/join\('<br>'\)/.test(fn), 'it still joins with <br>');
        assert.match(fn, /join\(/, 'it does not join at all');
    });
    test('no count line and no grouping were added', () => {
        // Manny's call on both. A count line is one more thing to read on a screen whose
        // job is to let an organizer scan names, and the groups are already named in the
        // links section below.
        // ASSERTED ON THE RENDERED TEXT, not by pattern-matching the source. My first
        // version banned /players?:/ in the function body and matched the painter's own
        // `const players = ...` line - a guard that fails on the code it is describing.
        const txt = V.o.text;
        assert.ok(!/\b\d+\s+(golfers|players)\b/i.test(txt), 'the list grew a count: ' + txt.slice(0, 120));
        assert.ok(!/\bGroup\b/i.test(txt), 'the list grew grouping: ' + txt.slice(0, 120));
    });
    test('the empty state is unchanged', () => {
        assert.match(fn, /No players added yet/);
    });
});
