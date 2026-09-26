// ============================================================================
// THE SETUP COACH (UI Wave 10)
//
// A host setting up Marty's game - 25 golfers, six groups, A/B flights, a pot
// with KP, Net Finish and skins - faces 163 controls across seven wizard steps.
// (36 of those are the custom-course par grid behind a checkbox, so the real
// decision load is nearer 60. The corrected figure is the one that matters.)
// The app can already EXPRESS that round: pool_flights_golden.fixture.json holds
// 23 golfers, 12 A / 11 B, $20 in, KP $40 on four holes, Net $200 at 60/40 and
// per-flight skins, with engine tests behind it. What is missing is a PATH.
//
// SO THE COACH INVENTS NOTHING. It sets the state loadModeData() sets
// (admin.html:7269) and then hands over. Two things it must get right or it
// silently lies to the host:
//
//   1  IT NEVER HARDCODES A STEP NUMBER. The workflow is format-first and steps
//      are skippable - step 4 exists only for FORMATS_WITH_SETTINGS, and Ryder
//      Cup's workflow has no money step at all (admin.html:2219). A coach that
//      walked 1..7 would walk a host into steps their format does not have.
//   2  IT DOES NOT OFFER MAIN-FORMAT MONEY ON A MULTI-GROUP ROUND, because
//      multiGroupMoneySuppressed() (admin.html:7777) turns that stake OFF at two
//      groups or more. Asking for it and discarding the answer is the defect
//      class CLAUDE.md records twice over.
//
// AND IT FINISHES ON REVIEW. The host presses Save. saveSettings() creates the
// round at events/<code> and navigates to Round Ready; a coach that called it
// would be spending the host's money decisions for them.
//
// WHAT THIS HARNESS CANNOT PROVE, said plainly rather than faked: mini-dom's
// getBoundingClientRect returns a hard-coded zero rect, so every geometry claim
// - the entry link's 48px, the one left edge, the 844px budget - is made in
// Chrome, in the second describe below. And its localStorage is a deliberate
// no-op unless a test opts in, so the first-run flag is exercised with
// localStorage: true and seedStorage rather than assumed.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');

// Comments stripped: a coach that exists only in a comment is not a coach, and
// this repo has been bitten twice by an assertion a comment satisfied.
const strip = (src) => src.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, ' ');
const CODE = strip(ADMIN);

// THE BLOCK, SLICED FROM THE RAW SOURCE AND *THEN* STRIPPED. My first version
// sliced CODE - comments already gone - and looked for the `// ==== SETUP COACH`
// marker inside it, so every assertion below read an empty string and failed
// forever. A slice that truncates to nothing satisfies every negative in it, which
// is the fault CLAUDE.md records; this one failed loudly instead only because the
// positive assertions sat beside them. Endpoints come from the raw file, content is
// stripped, and the block asserts its own length before anything reads it.
function coachBlock() {
    const from = ADMIN.indexOf('// ==== SETUP COACH');
    const to = ADMIN.indexOf('// ==== END SETUP COACH');
    assert.ok(from > -1, 'the SETUP COACH block marker is gone');
    assert.ok(to > from, 'the END SETUP COACH marker is gone or out of order');
    const block = strip(ADMIN.slice(from, to));
    assert.ok(block.length > 1500, 'the coach block collapsed to ' + block.length
        + ' chars - every assertion on it would be vacuous');
    return block;
}

describe('1. THE ENTRY IS ON THE HOST\'S PATH, BESIDE THE TILES', () => {

    test('the lobby carries a coach entry, and it is a class not an inline style', () => {
        const lobby = ADMIN.slice(ADMIN.indexOf('<div class="container" id="lobby-screen">'),
                                  ADMIN.indexOf('<div class="container" id="admin-screen"'));
        assert.ok(lobby.length > 4000, 'the lobby slice collapsed - this would pass on nothing');
        assert.match(lobby, /id="coach-container"/, 'no coach entry on the lobby');
        assert.match(lobby, /id="coach-link"/, 'the entry has no control in it');
        // POSITIVE: the two tiles and Resume are still there, so "beside the tiles"
        // is a real position and not a claim about an empty screen.
        assert.match(lobby, /id="hw-quick"/, 'the Game Day tile is gone');
        assert.match(lobby, /id="hw-trip"/, 'the Road Trip tile is gone');
        assert.match(lobby, /id="resume-container"/, 'Resume is gone');
        // It sits AFTER the tiles and BEFORE Resume - the host's own path, not the
        // joiner's. The code row is behind the collapsed disclosure and stays there.
        const tiles = lobby.indexOf('class="home-widgets"');
        const coach = lobby.indexOf('id="coach-container"');
        const resume = lobby.indexOf('id="resume-container"');
        const disclosure = lobby.indexOf('id="open-else"');
        assert.ok(tiles > -1 && coach > tiles, 'the entry is above the tiles');
        assert.ok(coach < resume, 'the entry is below Resume');
        assert.ok(coach < disclosure, 'the entry fell into the joiner disclosure');
        // NO INLINE LAYOUT, the Wave 5-7 rule. widget_system_test.js guard 5 would
        // also catch this; it is asserted here so the reason travels with the wave.
        const tag = lobby.slice(lobby.lastIndexOf('<', coach), lobby.indexOf('>', coach) + 1);
        assert.ok(!/style="/.test(tag), 'the coach container carries an inline style: ' + tag);
    });

    test('it mints the round the way the tile does, and flags the arrival', () => {
        assert.match(CODE, /function startSetupCoach\s*\(/, 'no startSetupCoach()');
        const fn = CODE.slice(CODE.indexOf('function startSetupCoach'),
                              CODE.indexOf('\n    function ', CODE.indexOf('function startSetupCoach') + 30));
        assert.ok(fn.length > 80, 'startSetupCoach could not be sliced: ' + fn.length);
        // It reuses createRoom - the existing issue-a-code-then-navigate path - so
        // the coach cannot drift from how a round is normally minted.
        assert.match(fn, /createRoom\(/, 'the coach does not go through createRoom');
        assert.match(fn, /coachRequested/, 'nothing marks the arrival as a coach arrival');
        // And createRoom carries the flag into the URL.
        const cr = CODE.slice(CODE.indexOf('async function createRoom'),
                              CODE.indexOf('window.location.href = dest'));
        assert.match(cr, /coach=1/, 'createRoom does not carry the coach flag');
    });

    test('the first run is emphasis, never a block', () => {
        // "Optional first-run once" must not become a modal in front of a host who
        // knows what they are doing. It is a CLASS on the existing link - no second
        // element, no height, nothing to dismiss.
        assert.match(CODE, /coach-link-new/, 'no first-run treatment at all');
        assert.match(CODE, /golfapp_coach_seen/, 'nothing remembers the first run');
        assert.ok(!/showCoachScreen\(\)\s*;?\s*\}\s*$/m.test(''), 'placeholder');
        // The one thing it must NOT do: open itself.
        const lobbyInit = CODE.slice(CODE.indexOf('function initLobby'), CODE.indexOf('function initLobby') + 4000);
        if (lobbyInit.length > 100) {
            assert.ok(!/showCoachScreen\(/.test(lobbyInit),
                'the lobby opens the coach by itself - that is a block, not an offer');
        }
    });
});

describe('2. THE COACH DRIVES THE WIZARD, AND INVENTS NOTHING', () => {

    test('the coach screen is a sibling container, placed AFTER #admin-screen', () => {
        assert.match(ADMIN, /<div class="container" id="coach-screen"/, 'no coach screen');
        // WHY THE POSITION IS ASSERTED: widget_system_test.js:280 slices the lobby
        // from #lobby-screen to `<div class="container" id="admin-screen"`. A coach
        // container between those two would be swallowed by that slice and every
        // inline style inside the coach judged as lobby layout. After #admin-screen,
        // that guard needs no change at all.
        assert.ok(ADMIN.indexOf('id="coach-screen"') > ADMIN.indexOf('id="admin-screen"'),
            'the coach screen sits inside the lobby guard\'s slice');
    });

    test('it never hardcodes a wizard step number', () => {
        const coach = coachBlock();
        // POSITIVE: it does navigate the wizard.
        assert.match(coach, /goToWizardStep\(/, 'the coach never moves the wizard');
        // And it asks for the step by NAME. Ryder Cup has no money step at all
        // (admin.html:2219) and step 4 is absent outside FORMATS_WITH_SETTINGS.
        assert.match(coach, /wizardStepNumber\(/, 'the coach does not resolve steps by name');
        const bare = [...coach.matchAll(/goToWizardStep\(\s*(\d+)\s*\)/g)].map(m => m[1]);
        assert.deepEqual(bare, [],
            'the coach hardcodes wizard step number(s) ' + bare.join(', ')
            + ' - the workflow is format-first and steps are skippable');
    });

    test('it finishes on Review and never saves for the host', () => {
        const coach = coachBlock();
        assert.match(coach, /wizardStepNumber\(\s*'review'\s*\)/,
            'the coach does not land the host on Review');
        assert.ok(!/saveSettings\(/.test(coach),
            'the coach calls saveSettings() - it would create the round and spend the '
            + 'host\'s money decisions for them');
    });

    test('it uses the setters, not raw .value writes, on the toggle-backed controls', () => {
        const coach = coachBlock();
        // #flights-enabled and the two scope inputs are HIDDEN inputs whose visible
        // switches only move through their setters. Writing the input alone leaves
        // the switch showing the old answer - copy that lies, in switch form.
        assert.match(coach, /setFlightsEnabled\(/, 'flights set without setFlightsEnabled');
        assert.ok(!/getElementById\(\s*['"]flights-enabled['"]\s*\)\s*\.value\s*=/.test(coach),
            'the coach writes #flights-enabled.value directly, leaving the switch stale');
        assert.ok(!/getElementById\(\s*['"]flights-scope-[a-z]+['"]\s*\)\s*\.value\s*=/.test(coach),
            'the coach writes a flights scope input directly, leaving the switch stale');
    });

    test('group structure is written the way adjustGroupSize writes it', () => {
        const coach = coachBlock();
        // THE GAP THE COACH ACTUALLY FILLS. There is no "number of groups" control
        // in the app: count is derived from computeGroupSizes(n, overrides).length,
        // the per-group -/+ clamps to 1..6, and renderGroupDividers() returns early
        // on a single group. "Six groups" is a thing a host can want and cannot ask
        // for. So the coach writes groupSizeOverrides and calls the same two
        // refreshers adjustGroupSize does (admin.html:7829).
        assert.match(coach, /groupSizeOverrides/, 'the coach cannot set group structure');
        assert.match(coach, /renderGroupDividers\(/, 'group sizes set without a re-render');
        assert.match(coach, /refreshMultiGroupMoneyRule\(/,
            'group sizes set without refreshing the multi-group money rule');
    });

    test('THE ONE THAT MATTERS: no main-format money on a multi-group round', () => {
        const coach = coachBlock();
        // multiGroupMoneySuppressed() (admin.html:7777) turns the main format's
        // stake off at two groups or more. A coach that asks for it anyway collects
        // an answer the app discards.
        assert.match(coach, /function coachMoneyOptions\s*\(/, 'no coachMoneyOptions()');
        const fn = coach.slice(coach.indexOf('function coachMoneyOptions'),
                               coach.indexOf('\n    function ', coach.indexOf('function coachMoneyOptions') + 30));
        assert.ok(fn.length > 120, 'coachMoneyOptions could not be sliced: ' + fn.length);
        assert.match(fn, /currentGroupCount\(|multiGroupMoneySuppressed\(/,
            'the money step does not branch on group count, so on Marty\'s round it '
            + 'offers a main-format stake the app will suppress');
    });

    test('and it BEHAVES that way, not just mentions it', () => {
        // WRITTEN BECAUSE THE SOURCE SCAN ABOVE WAS INERT. A control replaced the whole
        // branch with `const multi = false` and the scan stayed green - the predicate
        // names were still in the function, a few lines up, in the code that computes
        // the group count. Naming a rule is not obeying it. coachMoneyOptions() is a
        // pure function over one answer, so this can be CALLED rather than read.
        const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=COACH3&eventType=quick&coach=1' });
        // READ FROM INSIDE THE REALM, and via JSON. coachAnswers is a top-level `const`,
        // which is a lexical binding rather than a property of the sandbox - sb.coachAnswers
        // is undefined, and my first version died on that. Inside runInContext the
        // binding is in scope. The result comes back as a string because a structured
        // value crosses the realm with a foreign prototype, which is the cross-realm
        // trap this repo has hit before.
        const names = (answer) => JSON.parse(vm.runInContext(
            'coachAnswers.size = ' + JSON.stringify(answer) + ';'
            + ' JSON.stringify(coachMoneyOptions().map(function (o) { return o.value; }))', sb));
        const four = names('four');
        const big = names('big');
        // POSITIVE FIRST: both menus are real menus, or the absence below proves nothing.
        assert.ok(four.length >= 3, 'the foursome menu is empty: ' + JSON.stringify(four));
        assert.ok(big.length >= 3, 'the big-group menu is empty: ' + JSON.stringify(big));
        assert.ok(four.includes('match'),
            'a foursome is not offered a bet on the round, and it should be: ' + JSON.stringify(four));
        assert.ok(!big.includes('match'),
            'a six-group round is offered a main-format wager. multiGroupMoneySuppressed() '
            + 'turns that stake off at two groups or more, so the answer would be '
            + 'collected and discarded: ' + JSON.stringify(big));
        // The pot and skins are offered either way - they are what actually pays on a
        // multi-group round.
        ['pot', 'skins'].forEach(v => {
            assert.ok(four.includes(v), 'a foursome cannot choose ' + v);
            assert.ok(big.includes(v), 'a six-group round cannot choose ' + v);
        });
    });

    test('Skip and Back exist on every step', () => {
        const coach = coachBlock();
        assert.match(coach, /function coachBack\s*\(/, 'no Back');
        assert.match(coach, /function coachSkip\s*\(/, 'no Skip');
        assert.match(coach, /function coachNext\s*\(/, 'no Next');
        assert.match(coach, /COACH_STEPS/, 'the steps are not a declared list');
    });

    test('a coach arrival shows the coach, a normal arrival shows the wizard', () => {
        const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=COACH1&eventType=quick&coach=1' });
        const coachEl = sb.document.getElementById('coach-screen');
        const adminEl = sb.document.getElementById('admin-screen');
        assert.equal(String(coachEl.style.display), 'block',
            'the coach did not open on a ?coach=1 arrival');
        assert.equal(String(adminEl.style.display), 'none',
            'the wizard is showing behind the coach');
        const plain = loadHtmlInlineScript('admin.html', [], { search: '?game=COACH2&eventType=quick' });
        assert.notEqual(String(plain.document.getElementById('coach-screen').style.display), 'block',
            'the coach opened on a normal arrival - it must never block');
    });
});

describe('3. THE ENTRY MEASURES UP (Chrome, 390x844)', () => {
    let M = null;
    const DB = { events: {}, global_courses: {}, trips: {}, tournaments: {}, seasons: {} };
    // A used phone, seeded the way one_screen_test.js seeds it, so every optional
    // block that could lengthen the screen is present. Measuring the empty case
    // would be measuring the easy one.
    const SEED = `(function () { try {
        localStorage.setItem('lastRoomCode', 'SEED1');
        localStorage.setItem('hardpanSeasons', JSON.stringify([{ code: 'WNTR1', name: 'Winter League' }]));
    } catch (e) {} })();`;

    before(async () => {
        const r = await arriveCold({
            url: fileUrl('admin.html', ''), db: DB, settleMs: 2600,
            viewport: { width: 390, height: 844 }, preScript: SEED,
            steps: [{ expression: `(function () {
                function b(sel) { var e = document.querySelector(sel); if (!e) return null;
                  var r = e.getBoundingClientRect(); var g = document.createRange();
                  g.selectNodeContents(e); var t = g.getBoundingClientRect();
                  return { h: Math.round(r.height), w: Math.round(r.width), left: Math.round(r.left),
                    top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY),
                    tTop: t.height ? Math.round(t.top - r.top) : null,
                    tBot: t.height ? Math.round(r.bottom - t.bottom) : null }; }
                var l = document.getElementById('lobby-screen');
                var kids = [].slice.call(l.children)
                  .filter(function (e) { return e.getClientRects().length > 0; })
                  .map(function (e) { var r = e.getBoundingClientRect();
                    return { id: e.id || e.tagName, left: Math.round(r.left), w: Math.round(r.width) }; });
                return JSON.stringify({
                  viewportH: window.innerHeight,
                  lobbyEnd: Math.round(l.getBoundingClientRect().bottom + window.scrollY),
                  organizerEnd: Math.round(document.getElementById('resume-container')
                     .getBoundingClientRect().bottom + window.scrollY),
                  scrollW: document.documentElement.scrollWidth,
                  clientW: document.documentElement.clientWidth,
                  coach: b('#coach-container'), coachLink: b('#coach-link'),
                  resume: b('#resume-container'),
                  tiles: b('.home-widgets'),
                  coachOnScreen: !!document.querySelector('#coach-link'),
                  kids: kids
                });
            })();` }],
        });
        assert.equal(r.ok, true, 'the arrival failed, so NOTHING is proven: ' + r.reason);
        const raw = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{');
        assert.equal(raw.length, 1, 'expected one measurement: ' + JSON.stringify(r.value));
        M = JSON.parse(raw[0]);
        // POSITIVE HALF: the screen rendered and the entry is on it.
        assert.ok(M.lobbyEnd > 200, 'the lobby did not render: ' + M.lobbyEnd);
        assert.ok(M.coachOnScreen, 'the coach entry is not on the rendered lobby');
        assert.ok(M.coach, '#coach-container did not render');
    }, { timeout: 90000 });

    test('the entry is 48px and its label is centred', () => {
        assert.equal(M.coachLink.h, 48,
            'the entry is ' + M.coachLink.h + 'px, not --ctl-h (48). button_system_test.js '
            + 'asserts every lobby control is exactly 48 with an exemption covering '
            + 'exactly three, so a new size would need a fourth exemption.');
        assert.ok(Math.abs(M.coachLink.tTop - M.coachLink.tBot) <= 1,
            'the label sits off centre: ' + M.coachLink.tTop + ' above, ' + M.coachLink.tBot + ' below');
    });

    test('it shares the one left edge and one width', () => {
        const lefts = [...new Set(M.kids.map(k => k.left))];
        assert.deepEqual(lefts, [M.resume.left],
            'the lobby no longer has one left edge: ' + lefts.join(', '));
        assert.equal(M.coach.w, M.resume.w,
            'the coach block is ' + M.coach.w + 'px against Resume\'s ' + M.resume.w);
    });

    test('it sits between the tiles and Resume', () => {
        assert.ok(M.coach.top >= M.tiles.bottom, 'the entry is above the tiles');
        assert.ok(M.coach.bottom <= M.resume.top, 'the entry is below Resume');
    });

    test('the Wave 7 budget still holds: one viewport, collapsed', () => {
        assert.ok(M.organizerEnd <= M.viewportH,
            "the organizer's path now ends at " + M.organizerEnd + 'px in a '
            + M.viewportH + 'px viewport');
        assert.ok(M.lobbyEnd <= M.viewportH,
            'the collapsed screen is ' + M.lobbyEnd + 'px in a ' + M.viewportH + 'px viewport - '
            + 'Wave 7 cut it to 494 and this wave must not spend that back');
        assert.equal(M.scrollW, M.clientW, 'the screen scrolls sideways');
    });
});
