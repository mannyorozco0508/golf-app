// ============================================================================
// ARRIVING TO SET UP A CUP SHOULD NOT LAND ON A SIDE-BETTING SCREEN
//
// Game Day creates the round and sends the organizer to
// sidematches.html?setup=ryder. The Cup setup lived INSIDE the card headed
// "Side Matches (Cross-Group)", under a 75px paragraph about $/hole, $/overall
// and presses. Measured at 390x844 on arrival, the Cup began 511px down, behind:
//
//     231px  h2  "Today's Action"
//     290px  h3  "Side Matches (Cross-Group)"
//     318px  the cross-group explainer
//     403px  the Ryder handoff banner
//     511px  the Cup
//
// The Cup was already above the fold, so the existing scrollIntoView was close to
// a no-op. The problem was never where the scroll landed - it was that the Cup
// was nested in, and framed as, side action. The organizer tapped "set up the
// Cup" and got a screen about side betting.
//
// SO THE FIX IS STRUCTURAL. The mount moves out of the side-matches card
// permanently and renders above it. On ?setup=ryder the side-matches block
// collapses to a summary line a tap re-opens. Without the param NOTHING changes.
//
// WHY sessionStorage. The param stays in the URL, so every reload would
// re-collapse the block under an organizer who had deliberately opened it. The
// choice is remembered per round for the tab's lifetime.
//
// THE BANNER IS GONE, folded into the Cup card. Three pieces of "this is the
// Cup" chrome - a section heading, a banner, and the card's own head - stacked on
// one screen was most of what pushed it down.
//
// ---------------------------------------------------------------------------
// THESE TESTS ARRIVE, THEY DO NOT CALL THE RENDERER.
//
// loadHtmlInlineScript now takes { search }, so the page reads a real query
// string through its own `const urlParams` exactly as a browser does. The round
// data arrives through the db.ref().on('value') handler production registers -
// the same callback the real page runs - rather than by calling render functions
// by name. That distinction is the whole reason this bug and the last three were
// invisible: a test that calls the renderer proves the renderer works, and says
// nothing about what an organizer lands on.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const SM_SRC = fs.readFileSync(path.join(REPO_ROOT, 'sidematches.html'), 'utf8');
const DEPS = ['handicap.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'ryder-cup.js'];

const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const P = [{ id: 101, name: 'Ann Adams', hcp: '0' }, { id: 102, name: 'Bob Brown', hcp: '0' },
           { id: 103, name: 'Cal Clark', hcp: '0' }, { id: 104, name: 'Dee Dunn', hcp: '0' }];

// ARRIVE. Loads the page with a real query string, captures the value handler the
// page registers, and fires it with round data - which is precisely what Firebase
// does a moment after load. No render function is called by name.
function arrive(opts) {
    opts = opts || {};
    const search = '?game=ARRIVE' + (opts.setupParam === false ? '' : '&setup=ryder');
    const sb = loadHtmlInlineScript('sidematches.html', DEPS, { search: search });
    vm.runInContext('alert = function () {}; confirm = function () { return true; };'
        + ' isOrganizerView = function () { return true; };', sb);

    // THE PAGE'S OWN VALUE HANDLER, registered by the page at load and captured by
    // the loader. Firing it is exactly what Firebase does a moment after arrival -
    // no listener is written here, and no render function is called by name.
    const round = Object.assign({ players: P, courseData: CD, scores: {} }, opts.round || {});
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value');
    assert.ok(handlers.length > 0, 'the page registered no value handler to arrive through');
    handlers.forEach(h => h.cb({ val: () => JSON.parse(JSON.stringify(round)) }));
    return sb;
}

const run = (sb, e) => vm.runInContext(e, sb);
const cupHtml = sb => run(sb, 'document.getElementById("ryder-cup-setup").innerHTML');
// The side-matches card is REMOVED from this arrival, not collapsed. v61
// collapsed it behind a summary; that still put side betting on the screen of
// somebody sent here to build a Cup, so the block, its stored state and the
// parse-time-toggle guard all went. setup_page_nav_test.js covers the removal of
// that machinery; this file covers what the arrival looks like.
const cardShown = sb => run(sb, '(function(){var c=document.getElementById("sidematches-card");'
    + 'return c ? (c.style.display !== "none") : null;})()');

describe('THE CUP IS NOT PART OF THE SIDE-MATCHES CARD', () => {

    test('the mount lives outside #sidematches-card', () => {
        const card = SM_SRC.slice(SM_SRC.indexOf('id="sidematches-card"'));
        const cardEnd = card.indexOf('</div>\n</div>');
        assert.ok(!card.slice(0, cardEnd).includes('id="ryder-cup-setup"'),
            'the Cup is still nested inside the side-betting card');
    });

    test('and comes before it on the page', () => {
        assert.ok(SM_SRC.indexOf('id="ryder-cup-setup"') < SM_SRC.indexOf('id="sidematches-card"'),
            'the Cup renders after the side-matches card');
    });

    test('the separate handoff banner is gone', () => {
        assert.ok(!SM_SRC.includes('id="ryder-handoff-banner"'),
            'a third piece of "this is the Cup" chrome is still stacked above it');
    });

    test('there is exactly one Cup mount', () => {
        assert.equal(SM_SRC.split('id="ryder-cup-setup"').length - 1, 1);
    });
});

describe('ARRIVING WITH ?setup=ryder', () => {

    test('the side-matches card is not on the screen at all', () => {
        assert.equal(cardShown(arrive()), false,
            'an organizer sent to build a Cup still lands on side betting');
    });

    test('the Cup setup is rendered and ready', () => {
        assert.match(cupHtml(arrive()), /Ryder Cup/,
            'the Cup surface did not render on arrival');
    });

    // REMOVED WITH THE FEATURE. Three tests here guarded the remembered collapse
    // state - that arriving stored 'false', that opening stored 'true', and that a
    // stored 'true' survived the next arrival. The card is now simply absent on
    // arrival and untouched otherwise, so there is no preference to remember and
    // nothing for them to guard. setup_page_nav_test.js asserts that none of that
    // machinery survived.
});

describe('WITHOUT THE PARAM NOTHING CHANGES', () => {

    test('the side-matches card is shown as it always was', () => {
        assert.equal(cardShown(arrive({ setupParam: false })), true,
            'an ordinary visit to Matches now hides the side action');
    });

    test('the Cup surface still renders on an ordinary visit', () => {
        assert.match(run(arrive({ setupParam: false }),
            'document.getElementById("ryder-cup-setup").innerHTML'), /Ryder Cup/,
            'the Cup stopped rendering when the arrival stopped collapsing things');
    });

    // Read from the FILE, not from the harness: mini-dom never parses the page's
    // own static markup into nodes, so #sidematches-card reads back empty there.
    // That it RENDERS is proved by tools/ryder-arrival-check.js.
    test('the side-matches content is all still there', () => {
        const card = SM_SRC.slice(SM_SRC.indexOf('id="sidematches-card"'));
        const block = card.slice(0, card.indexOf('</details>'));
        assert.match(block, /ADD ACTION/);
        assert.match(block, /Auto-Pair Whole Field/);
        assert.match(block, /Final Results/);
        assert.match(block, /id="sidematches-list"/);
    });
});

describe('THE BANNER, FOLDED IN', () => {

    test('arriving says the round was created, inside the Cup card', () => {
        assert.match(cupHtml(arrive()), /Round created/,
            'the handoff sentence was dropped rather than folded in');
    });

    test('an ordinary visit says no such thing', () => {
        assert.ok(!/Round created/.test(cupHtml(arrive({ setupParam: false }))));
    });

    test('and neither does an arrival at a round that already has a Cup', () => {
        const sb = arrive({ round: { ryderCup: {
            v: 1, name: 'Existing',
            sides: { A: { id: 'A', name: 'A' }, B: { id: 'B', name: 'B' } },
            members: {}, matches: {} } } });
        assert.ok(!/Round created/.test(cupHtml(sb)),
            'a Cup that already exists was announced as newly created');
    });
});
