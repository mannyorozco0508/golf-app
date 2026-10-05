// ============================================================================
// GAME DAY -> GAMES -> COURSE -> PLAYERS -> MONEY -> REVIEW (2026-10-05, Manny)
//
// THE ORDER IS THE FEATURE. On the first tee a group already knows they are
// playing a scramble; being asked which course before being asked what game
// reads as a filing exercise. It also fixes a real ordering fault rather than
// only a feeling: the Players screen grows a TEAM COLUMN for the formats that
// need one (Best Ball, Scramble, Hi-Lo, a team Nassau, the legacy Ryder), and
// with the format chosen two screens earlier that column is right the first
// time an organizer sees the roster instead of appearing behind them.
//
// WHAT MOVED, AND WHAT DID NOT. Nothing was rebuilt: buildCompactWizard moves
// the existing blocks as NODES, so every input keeps its id, its handler and the
// function that reads it, and saveSettings reads exactly what it always read -
// setup_wizard_shape_test.js holds the payload against that. What moved is the
// ORDER (one array, wizardWorkflow) and ONE BLOCK: that format's own settings
// panel, from the Games screen to the TOP of Money, under a heading naming the
// format. A Nassau's stakes and presses, a Wolf's multipliers and a Best Ball's
// teams are all things the round COSTS, so they belong with the money.
//
// FOUR CLAIMS, and they are the four Manny stated:
//   1. tapping a format card selects it AND goes to Course;
//   2. Back on Course returns to Games with that card still selected;
//   3. Money shows "<Format> settings" at the top, and shows nothing extra for a
//      format that has no panel;
//   4. the steps adapt - the Cup skips Money, and a team format gets its Team
//      column on Players.
//
// WHY A COLD ARRIVAL. Three of the four are taps and what they reveal, and the
// fourth is a heading whose visibility is decided by other panels' display. The
// mini-dom harness has no layout, so a tap on a card there proves the handler
// and nothing about whether a thumb can reach it; worse, it would report the
// gallery as tappable on the LOBBY, where the wizard is not even on screen -
// which is exactly how the first draft of this file passed against a page that
// could not be used. Every arrival below goes through the Game Day tile.
//
// BASELINE, measured over the FINISHED file against main (b2f89a2, admin.html
// swapped out and restored by sha), all 10 tests: 1 PASS / 9 FAIL. 1 + 9 = 10.
//   The one that passes is the arrival itself, which asserts nothing about this
//   wave. Everything else is red there, including "a format with no panel shows
//   nothing extra" - the heading element does not exist in that build, so the
//   test fails on its absence rather than passing vacuously on its invisibility,
//   which is the stronger of the two outcomes and the reason the assertion is
//   written as "the element is there AND it is hidden" rather than as a bare
//   "nothing is shown".
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const ADMIN = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');

// WHERE THE WIZARD IS, WHAT IS CHOSEN, AND WHAT MONEY SHOWS.
const LOOK = `(function () {
  var a = document.querySelector('.wizard-step.active');
  var head = document.getElementById('format-settings-head');
  var nb = a ? document.getElementById('wizard-next-' + a.id.replace('wizard-step-', '')) : null;
  var money = document.getElementById('wizard-step-6');
  var kids = money ? [].slice.call(money.children).map(function (c) { return c.id || c.className; }) : [];
  function where(id) {
    var el = document.getElementById(id); if (!el) return 'MISSING';
    var n = el; while (n) { if (n.id && /^wizard-step-\\d$/.test(n.id)) return n.id; n = n.parentNode; }
    return 'loose';
  }
  return JSON.stringify({
    dots: [].slice.call(document.querySelectorAll('#wizard-progress .wizard-dot'))
            .map(function (d) { return d.getAttribute('title') + ':' + d.textContent; }),
    active: a ? a.id : '',
    // innerText, not textContent: a step that never opened has plenty of
    // textContent, and this page keeps its whole application in one script.
    title: a ? String(a.querySelector('.wizard-step-title').innerText || '').trim() : '',
    next: nb ? String(nb.textContent || '').trim() : '',
    selectedCard: (document.querySelector('.fmt-card.selected') || {}).id || 'none',
    format: (document.getElementById('game-format-select') || {}).value,
    head: head ? { text: String(head.textContent || '').trim(),
                   shown: getComputedStyle(head).display !== 'none',
                   first: kids.indexOf('format-settings-head') } : null,
    settingsOn: where('match-settings'),
    teamSelects: document.querySelectorAll('.p-team-input').length,
    backShown: (function () {
      var b = a ? document.getElementById('wizard-back-' + a.id.replace('wizard-step-', '')) : null;
      return b ? getComputedStyle(b).display !== 'none' : null;
    })()
  });
})()`;

const ENTER = [{ tap: '#hw-quick' }, { sleep: 900 }];
const S = {};
async function journey(steps) {
    const r = await arriveCold({
        url: fileUrl('admin.html', 'fresh=1'),
        db: { events: {}, trips: {}, global_courses: {}, tournaments: {} },
        auth: { uid: 'organizer-cold', email: 'o@example.com', isAnonymous: false },
        viewport: { width: 390, height: 844 }, settleMs: 2800,
        steps: ENTER.concat(steps)
    });
    if (!r.ok) return { error: r.reason };
    const j = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(v => JSON.parse(v));
    return { seen: j };
}

before(async () => {
    // THE WHOLE JOURNEY IN ONE ARRIVAL: land, tap Nassau, go Back, tap Best Ball,
    // then walk Next to Players and on to Money.
    S.main = await journey([
        { expression: LOOK },
        { tap: '#fmt-card-nassau-modern' }, { sleep: 700 }, { expression: LOOK },
        { tap: '#wizard-back-1' }, { sleep: 600 }, { expression: LOOK },
        { tap: '#fmt-card-bestball' }, { sleep: 700 }, { expression: LOOK },
        // THE DOTS, NOT THE NEXT BUTTONS, for the rest of the walk. Next on Course
        // refuses without a course chosen - its own guard, and not this file's
        // subject - and the dots are a control an organizer taps for exactly this.
        { tap: '#wizard-progress .wizard-dot:nth-child(3)' }, { sleep: 700 }, { expression: LOOK },
        { tap: '#wizard-progress .wizard-dot:nth-child(4)' }, { sleep: 700 }, { expression: LOOK }
    ]);
    // A FORMAT WITH NO PANEL OF ITS OWN: Stroke Play, which is the default and
    // the one most rounds are.
    S.plain = await journey([
        { tap: '#fmt-card-stroke' }, { sleep: 700 },
        { tap: '#wizard-progress .wizard-dot:nth-child(3)' }, { sleep: 700 }, { expression: LOOK },
        { tap: '#wizard-progress .wizard-dot:nth-child(4)' }, { sleep: 700 }, { expression: LOOK }
    ]);
    // THE CUP, which skips Money.
    S.cup = await journey([
        { tap: '#fmt-card-ryder-cup' }, { sleep: 800 }, { expression: LOOK }
    ]);
});

describe('1. THE ORDER, AND THE TAP THAT MOVES ON', () => {

    test('ran', () => {
        ['main', 'plain', 'cup'].forEach(k => assert.ok(S[k] && !S[k].error, k + ': ' + (S[k] && S[k].error)));
    });

    test('Game Day lands on GAMES, first of five, with no way back', () => {
        const v = S.main.seen[0];
        assert.deepEqual(v.dots, ['Games:1', 'Course:2', 'Players:3', 'Money:4', 'Review:5']);
        assert.equal(v.active, 'wizard-step-3', 'the wizard opened on ' + v.active);
        assert.match(v.title, /Games/);
        assert.match(v.title, /Step 1/, 'the heading does not call it step one: ' + v.title);
        assert.equal(v.backShown, false, 'the first screen offers a way back to nowhere');
        assert.equal(v.next, 'Next: Course ▶', 'the Next names the wrong step: ' + v.next);
    });

    test('tapping a format card selects it AND goes straight to Course', () => {
        const v = S.main.seen[1];
        assert.equal(v.format, 'nassau-modern', 'the tap did not select the card');
        assert.equal(v.selectedCard, 'fmt-card-nassau-modern');
        assert.equal(v.active, 'wizard-step-1', 'the tap did not move on: ' + v.active);
        assert.match(v.title, /Step 2/, 'Course is not the second step: ' + v.title);
        assert.equal(v.next, 'Next: Players ▶', 'the Next names the wrong step: ' + v.next);
    });

    test('and Back on Course returns to Games with the card STILL SELECTED', () => {
        const v = S.main.seen[2];
        assert.equal(v.active, 'wizard-step-3', 'Back did not reach Games: ' + v.active);
        assert.equal(v.selectedCard, 'fmt-card-nassau-modern', 'the selection was lost going back');
        assert.equal(v.format, 'nassau-modern');
    });
});

describe('2. MONEY CARRIES THAT FORMAT’S OWN SETTINGS, AT THE TOP', () => {

    test('a second tap re-selects and moves on again', () => {
        const v = S.main.seen[3];
        assert.equal(v.format, 'bestball');
        assert.equal(v.active, 'wizard-step-1');
    });

    test('the panel is ON Money, and the heading is its first block', () => {
        const v = S.main.seen[5];
        assert.equal(v.active, 'wizard-step-6', 'the walk did not reach Money: ' + v.active);
        assert.equal(v.settingsOn, 'wizard-step-6', 'the format settings are on ' + v.settingsOn);
        assert.ok(v.head, 'there is no format-settings heading');
        assert.equal(v.head.first, 2,
            'the heading is not the first block under the title and subtitle: index ' + v.head.first);
        assert.equal(v.head.shown, true, 'Best Ball has a panel and no heading over it');
        assert.equal(v.head.text, 'Best Ball settings', 'the heading reads: ' + v.head.text);
    });

    test('a format with NO panel shows nothing extra', () => {
        const v = S.plain.seen[1];
        assert.equal(v.active, 'wizard-step-6');
        assert.equal(v.format, 'stroke');
        assert.ok(v.head, 'the heading element is gone entirely');
        assert.equal(v.head.shown, false, 'Stroke Play has no settings and still got a heading');
    });
});

describe('3. THE STEPS ADAPT TO THE FORMAT', () => {

    test('a team format gets its Team column on Players, having been chosen first', () => {
        // THE ORDERING FAULT THIS WAVE FIXES. The column is rendered from the chosen
        // format; before this order the organizer met the roster first and the
        // column appeared behind them.
        const atPlayers = S.main.seen[4];
        assert.equal(atPlayers.active, 'wizard-step-5', 'the walk did not reach Players');
        assert.ok(atPlayers.teamSelects > 0, 'Best Ball reached Players with no Team column');
        // And the control: Stroke Play is not a team format and gets none.
        assert.equal(S.plain.seen[0].teamSelects, 0,
            'Stroke Play grew a Team column, so the column is not following the format');
    });

    test('the Cup skips MONEY, and only Money', () => {
        const v = S.cup.seen[0];
        assert.deepEqual(v.dots, ['Games:1', 'Course:2', 'Players:3', 'Review:4'],
            'the Cup workflow is ' + JSON.stringify(v.dots));
        assert.equal(v.format, 'ryder-cup');
        assert.equal(v.active, 'wizard-step-1', 'the Cup card did not move on to Course');
    });

    test('and the blocks are still MOVED, not rebuilt', () => {
        // One element per id after the move; a copy would be two elements with one
        // id and saveSettings would read whichever came first.
        ['course-search-input', 'round-length-select', 'game-format-select',
         'format-settings-head', 'match-settings'].forEach(id => {
            assert.equal((ADMIN.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1,
                id + ' appears more than once');
        });
        const at = ADMIN.indexOf('function buildCompactWizard()');
        const fn = ADMIN.slice(at, ADMIN.indexOf('\n    function ', at + 10));
        assert.ok(fn.length > 400, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /moveInto\('wizard-step-4', 'wizard-step-6', true\);/,
            'the format settings are not moved to the top of Money');
        assert.ok(!/innerHTML/.test(fn), 'it rebuilds markup instead of moving nodes');
    });
});
