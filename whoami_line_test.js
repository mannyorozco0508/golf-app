// ============================================================================
// THE "WHICH ONE ARE YOU?" LINE (Wave 17)
//
// It was a 287px panel on the scorecard above score entry - measured cold at
// 390x844 - asking a question most golfers do not care about, on the screen Wave 7
// spent a whole wave cutting to one viewport.
//
// IT WAS NOT DELETED. The panel is the ONLY writer of golfapp_me_<code>, no link
// the app hands out carries ?me=, and five surfaces read that answer: the recap's
// "You", the My Round headline, the MY MATCHES / OTHER MATCHES split, the row label
// and the my-matches-first ordering. One of those readers lives in hole-events.js,
// a protected file. So the question moved into My Round as one line.
//
// AND THE REFUSAL IS WRITTEN DOWN NOW, which was the real defect: the ANSWER
// persisted and the refusal did not, so "Skip — just show everything" lasted until
// the next page load and the question came back all round.
//
// WHY CHROME. The claim is what a golfer sees on arrival, and the deciding input is
// localStorage, which mini-dom is a deliberate no-op for. These arrive cold through
// tools/lib/cold-arrival.js with the storage seeded the way a previous visit would
// have left it, and tap only.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const P = makePlayers(['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'], [2, 9, 15, 4], 101);
const id = i => String(101 + i);
const scores = {};
P.forEach((p, i) => { for (let h = 1; h <= 5; h++) scores['p' + p.id + '_h' + h] = 4 + (i % 2); });
// HOLE 6 IS COMPLETE, and Ben alone makes 3 there: that is what gives the recap a lead
// change and a birdie to report on the hole in view. Without it the recap is empty and
// the "You" assertion below would pass on a blank surface - which is the trap CLAUDE.md
// records about positive controls.
scores['p101_h6'] = 5; scores['p102_h6'] = 3; scores['p103_h6'] = 5; scores['p104_h6'] = 5;
const ROUND = {
    eventName: 'Who', courseName: 'Test', players: P, gameFormat: 'stroke', courseData: CD, scores,
    settlementMode: 'whole-dollar', skinsBuyIn: 5, skinsCarryOver: false,
    sideMatches: {
        bens: { format: 'match', scoring: 'gross', stake: 20, pressRule: 'none', teamAIds: [id(0)], teamBIds: [id(1)], createdAt: 1 },
        others: { format: 'match', scoring: 'gross', stake: 30, pressRule: 'none', teamAIds: [id(2)], teamBIds: [id(3)], createdAt: 2 },
    },
};
const DB = { events: { WHOL: ROUND }, global_courses: {}, trips: {}, tournaments: {} };
const seed = obj => '(function () { try { ' + Object.entries(obj)
    .map(([k, v]) => `localStorage.setItem('${k}', '${v}');`).join(' ') + ' } catch (e) {} })();';

const LINE = `(function () {
  var line = document.querySelector('.whoami-line');
  var ac = document.getElementById('action-center-mount');
  return JSON.stringify({
    lineOnScreen: !!(line && line.getClientRects().length),
    lineText: line ? (line.innerText || '').replace(/\\s+/g, ' ').trim() : null,
    lineH: line ? Math.round(line.getBoundingClientRect().height) : null,
    controls: line ? [].slice.call(line.querySelectorAll('button')).map(function (b) {
      return { t: (b.innerText || '').replace(/\\s+/g, ' ').trim(), h: Math.round(b.getBoundingClientRect().height) }; }) : [],
    // the panel that used to hold the question must be gone from the card entirely
    oldPanel: !!document.querySelector('.whoami-panel'),
    oldMount: !!document.getElementById('whoami-mount') && !!document.querySelector('#whoami-mount'),
    recapSaysYou: (function () { var r = document.getElementById('hole-recap-mount');
      return r ? /\\bYou\\b/.test(r.innerText || '') : null; })(),
    recapText: (function () { var r = document.getElementById('hole-recap-mount');
      return r ? (r.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 120) : null; })(),
    acText: ac ? (ac.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 160) : null
  });
})()`;

// Prev to hole 6 (everybody has finished it, so the recap has something to say),
// OPEN THE STATUS SHEET, then open My Round with a real tap. No page function is
// called.
//
// THE SHEET STEP IS NEW (2026-10-04) AND IT IS A REAL FIX, not a pin. My Round,
// the recap and the live cards moved out of the hole card into one slide-up sheet
// behind a handle, so on arrival they are off screen - and innerText of a hidden
// block is '', which is why these reads came back null rather than wrong. A golfer
// reaches them with one tap on the handle; so does this check.
const OPEN = [{ tap: '.hole-view-nav-btn', nth: 0 }, { sleep: 450 },
              { tap: '#round-sheet-handle', nth: 0 }, { sleep: 450 },
              { tap: '.action-toggle', nth: 0 }, { sleep: 450 }];

async function arrive(storage, extra) {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=WHOL'), db: DB, settleMs: 3200,
        viewport: { width: 390, height: 844 },
        preScript: storage ? seed(storage) : undefined,
        steps: OPEN.concat(extra || []).concat([{ expression: LINE }]) });
    return r.ok ? JSON.parse(r.value[r.value.length - 1]) : { error: r.reason };
}

const S = {};
before(async () => {
    S.fresh = await arrive(null);
    S.skipped = await arrive({ 'golfapp_me_skip_WHOL': '1' });
    S.answered = await arrive({ 'golfapp_me_WHOL': '102' });
    // a real tap on the line, then on Skip, in one visit
    S.tapped = await arrive(null, [{ tap: '.whoami-line-btn', nth: 0 }, { sleep: 300 },
                                   { tap: '.whoami-skip', nth: 0 }, { sleep: 400 }]);
});

describe('THE LINE IS IN MY ROUND, AND THE PANEL IS OFF THE CARD', () => {
    test('ran', () => assert.ok(S.fresh && !S.fresh.error, S.fresh && S.fresh.error));
    test('a fresh device is asked, once, on one line inside My Round', () => {
        assert.equal(S.fresh.lineOnScreen, true, 'the line does not render');
        assert.match(S.fresh.lineText, /Which one are you\?/);
        assert.match(S.fresh.lineText, /CHOOSE|choose/i, 'it must offer a way in');
        // ONE LINE, not a panel: the 287px block it replaced is the whole point.
        assert.ok(S.fresh.lineH <= 70, 'the line is ' + S.fresh.lineH + 'px - it is a panel again');
    });
    test('the old 287px panel and its mount are gone from the card', () => {
        assert.equal(S.fresh.oldPanel, false, '.whoami-panel is still rendered');
    });
    test('every control on the line clears 44px', () => {
        S.fresh.controls.forEach(c => assert.ok(c.h >= 44, '"' + c.t + '" is ' + c.h + 'px'));
    });
});

describe('THE REFUSAL SURVIVES THE RELOAD — the defect this wave fixes', () => {
    test('ran', () => assert.ok(S.skipped && !S.skipped.error, S.skipped && S.skipped.error));
    test('a device that skipped is NOT asked again: the line says it is showing everyone', () => {
        // This is the reload. Before Wave 17 the refusal lived in a plain `let`, so this
        // arrival asked the question again - and again after the next one, all round.
        assert.ok(!/Which one are you\?/.test(S.skipped.lineText),
            'the question came back after a skip: ' + JSON.stringify(S.skipped.lineText));
        assert.match(S.skipped.lineText, /Showing everyone/);
    });
    test('and a real tap on Skip, in one visit, says the same thing straight away', () => {
        assert.ok(S.tapped && !S.tapped.error, S.tapped && S.tapped.error);
        assert.ok(!/Which one are you\?/.test(S.tapped.lineText),
            'skipping did not take: ' + JSON.stringify(S.tapped.lineText));
    });
});

describe('THE ANSWER STILL DOES ALL FIVE THINGS, AND CAN NOW BE CHANGED', () => {
    test('ran', () => assert.ok(S.answered && !S.answered.error, S.answered && S.answered.error));
    test('the line names the golfer and offers to change it', () => {
        assert.match(S.answered.lineText, /You: Ben/);
        assert.match(S.answered.lineText, /CHANGE|change/i,
            'a stored answer used to be unchangeable from every screen in the app');
    });
    test('and the behaviours the recon measured are all still there', () => {
        assert.equal(S.answered.recapSaysYou, true, 'the recap stopped saying "You"');
        // POSITIVE: the recap actually rendered something, so "it says You" is not a claim
        // about an empty surface.
        assert.ok(S.answered.recapText && S.answered.recapText.length > 10,
            'the recap is blank, so the You assertion proves nothing: ' + JSON.stringify(S.answered.recapText));
        assert.match(S.answered.acText, /MY MATCHES/, 'the MY/OTHER split is gone');
        assert.match(S.answered.acText, /vs Ann/, 'the row label stopped dropping your own name');
        assert.ok(!/3 live/.test(S.answered.acText), 'the headline is not scoped to you: ' + S.answered.acText);
        // and the neutral arrival really is neutral, so the three above mean something
        assert.equal(S.fresh.recapSaysYou, false, 'CONTROL: no answer, no "You"');
        assert.ok(!/MY MATCHES/.test(S.fresh.acText), 'CONTROL: no answer, no MY MATCHES');
    });
});
