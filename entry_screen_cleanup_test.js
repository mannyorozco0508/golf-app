// ============================================================================
// THE SCREENS YOU ARRIVE ON STOP FRAMING THE JOB AS SOMETHING ELSE
//
// Three removals, one wave. Each is a piece of chrome that describes a DIFFERENT
// product than the one the golfer is standing in.
//
// 1. THE HOME LOSES "START NEW GAME". The lobby asks "What are you setting up?"
//    and offers two tiles - Road Trip and Game Day. Road Trip already went
//    straight to trip.html when tapped. Game Day only ticked itself and printed a
//    line of framing text, so the golfer still had to find a separate button
//    underneath to actually begin. Two ways to say "start a round", one of which
//    looked like the answer to the question and was not.
//
//    Picking a tile IS the decision now. The button and the orphaned "OR" that
//    sat under it are gone. Join Game, Duplicate and Resume are untouched - they
//    answer different questions.
//
// 2 & 3. THE CUP ARRIVAL LOSES THE SIDE-BETTING FRAMING. Arriving at
//    sidematches.html?setup=ryder to build a Cup, an organizer still met:
//        "⚔️ Side Matches (Single Round)"   - the page heading, named after the
//                                             round, which reads as the subject
//        "Looking for group-wide games like Skins... That's on 💰 Bets instead."
//    Neither has anything to do with a Ryder Cup. v62 removed the side-matches
//    CARD from this arrival; these two survived it because they live above the
//    card, in the page chrome, and the card was all anyone had looked at.
//
//    Both go on this arrival, in both Cup states - the chooser (two widgets, no
//    Cup yet) and the setup screen (a Cup being built). An ORDINARY visit to
//    Matches keeps every one of them.
//
// WHAT MINI-DOM CANNOT PROVE HERE: that anything is visible. It has no layout, so
// these assert what the page DISPLAYS in the style sense and what its handlers do.
// Geometry, and a real tap on a real tile, are asserted in headless Chrome by
// tools/ryder-arrival-check.js.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const SM = read('sidematches.html');

const SM_DEPS = ['handicap.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'ryder-cup.js'];
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const P = [{ id: 101, name: 'Ann Adams', hcp: '0' }, { id: 102, name: 'Bob Brown', hcp: '0' },
           { id: 103, name: 'Cal Clark', hcp: '0' }, { id: 104, name: 'Dee Dunn', hcp: '0' }];

// ---------------------------------------------------------------------------
describe('THE HOME HAS TWO CHOICES, AND PICKING ONE STARTS IT', () => {

    test('there is no separate "Start New Game" button', () => {
        assert.ok(!/Start New Game/.test(ADMIN),
            'the lobby still offers a second way to say what a tile already says');
    });

    test('and nothing on the page calls createRoom from an onclick', () => {
        assert.ok(!/onclick="createRoom\(\)"/.test(ADMIN),
            'the button is gone but its handler is still wired to something');
    });

    test('both tiles are still there', () => {
        assert.match(ADMIN, /onclick="selectHomeWidget\('trip'\)"/, 'Road Trip');
        assert.match(ADMIN, /onclick="selectHomeWidget\('quick'\)"/, 'Game Day');
    });

    // Driven through the handler the tile's own onclick names.
    test('tapping Game Day starts a round', () => {
        const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
        vm.runInContext('alert = function () {};', sb);
        vm.runInContext("selectHomeWidget('quick');", sb);
        const href = vm.runInContext('location.href', sb);
        assert.match(href, /admin\.html\?game=[A-Z0-9]+/,
            'Game Day did not start anything: ' + href);
        assert.match(href, /eventType=quick/, 'it started the wrong kind of round');
    });

    test('and the code it generates is a full six characters', () => {
        const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
        vm.runInContext('alert = function () {};', sb);
        vm.runInContext("selectHomeWidget('quick');", sb);
        const code = /game=([A-Z0-9]+)/.exec(vm.runInContext('location.href', sb))[1];
        assert.equal(code.length, 6, 'short codes are guessable: got "' + code + '"');
    });

    test('tapping Road Trip still goes to the trip', () => {
        const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
        vm.runInContext('alert = function () {};', sb);
        vm.runInContext("selectHomeWidget('trip');", sb);
        assert.match(vm.runInContext('location.href', sb), /trip\.html/);
    });

    // A cached PWA can still call this with 'club'. It was a preset over the same
    // round engine and must keep working rather than becoming a tile that does
    // nothing - the same reasoning the 'tournament' branch already carries.
    test('the club preset still starts a round', () => {
        const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
        vm.runInContext('alert = function () {};', sb);
        vm.runInContext("selectHomeWidget('club');", sb);
        assert.match(vm.runInContext('location.href', sb), /eventType=club/);
    });

    test('the other three ways in are untouched', () => {
        assert.match(ADMIN, /onclick="joinRoom\(\)"/, 'Join Game');
        assert.match(ADMIN, /id="join-room-input"/);
        assert.match(ADMIN, /onclick="duplicateRoom\(\)"/, 'Duplicate');
        assert.match(ADMIN, /onclick="resumeGame\(\)"/, 'Resume');
        assert.match(ADMIN, /id="resume-container"[^>]*display: none/, 'Resume stays hidden');
    });

    // "OR" with nothing before it is not a choice.
    test('no divider is left stranded above Join Game', () => {
        const lobby = ADMIN.slice(ADMIN.indexOf('id="lobby-screen"'),
                                  ADMIN.indexOf('id="admin-screen"'));
        const before = lobby.slice(0, lobby.indexOf('id="join-room-input"'));
        assert.equal((before.match(/lobby-divider/g) || []).length, 0,
            'an "OR" divider survives with nothing on the other side of it');
    });
});

// ---------------------------------------------------------------------------
function arrive(setup) {
    const sb = loadHtmlInlineScript('sidematches.html', SM_DEPS,
        { search: '?game=ENTRY' + (setup ? '&setup=ryder' : '') });
    vm.runInContext('alert = function () {}; isOrganizerView = function () { return true; };', sb);
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value');
    assert.ok(handlers.length > 0, 'the page registered no value handler');
    handlers.forEach(h => h.cb({ val: () => ({ eventName: 'Single Round',
        players: P, courseData: CD, scores: {} }) }));
    return sb;
}
const run = (sb, e) => vm.runInContext(e, sb);
const shown = (sb, id) => run(sb, '(function(){var e=document.getElementById(' + JSON.stringify(id)
    + ');return e ? (e.style.display !== "none") : null;})()');

describe('THE CUP ARRIVAL IS ABOUT THE CUP', () => {

    test('the side-matches page heading is not on it', () => {
        assert.equal(shown(arrive(true), 'main-title'), false,
            'an organizer building a Cup is still under a "Side Matches" heading');
    });

    test('nor is the pointer to the Bets page', () => {
        assert.equal(shown(arrive(true), 'sm-bets-pointer'), false,
            'the Cup arrival still explains where Skins and KPs live');
    });

    // v62 removed the card. These two live above it, which is why they survived.
    test('and the side-matches card is still gone', () => {
        assert.equal(shown(arrive(true), 'sidematches-card'), false);
    });

    test('what remains is the Cup chooser, with both widgets', () => {
        const h = run(arrive(true), 'document.getElementById("ryder-cup-setup").innerHTML');
        assert.match(h, /Set Up a Ryder Cup/, 'the custom Cup widget is missing');
        assert.match(h, /Classic Ryder Cup/, 'the Classic widget is missing');
    });

    // FIREBASE SENDS MORE THAN ONE SNAPSHOT. Every score typed anywhere in the
    // round fires the value handler again, and that handler rewrites the heading's
    // text. The arrival that hid it runs ONCE, guarded, so anything in the render
    // path that touches display would put the heading back an hour into the round -
    // long after anyone would connect it to arriving.
    test('and stays gone when the round sends another snapshot', () => {
        const sb = arrive(true);
        const handlers = sb.__dbHandlers.filter(h => h.event === 'value');
        handlers.forEach(h => h.cb({ val: () => ({ eventName: 'Single Round',
            players: P, courseData: CD, scores: { p101_h1: 4 } }) }));
        assert.equal(shown(sb, 'main-title'), false,
            'a later snapshot put the "Side Matches" heading back');
        assert.equal(shown(sb, 'sm-bets-pointer'), false,
            'a later snapshot put the Bets pointer back');
        assert.equal(shown(sb, 'sidematches-card'), false,
            'a later snapshot put side betting back');
    });

    test('the framing stays gone once the Cup is being built', () => {
        const sb = arrive(true);
        run(sb, 'rcOpenClassic();');
        assert.equal(shown(sb, 'main-title'), false,
            'the heading came back on the setup screen');
        assert.equal(shown(sb, 'sm-bets-pointer'), false,
            'the Bets pointer came back on the setup screen');
        assert.match(run(sb, 'document.getElementById("ryder-cup-setup").innerHTML'),
            /Ryder Cup/, 'and the Cup itself stopped rendering');
    });
});

describe('AN ORDINARY VISIT TO MATCHES LOSES NOTHING', () => {

    test('the heading is there, and names the round', () => {
        const sb = arrive(false);
        assert.equal(shown(sb, 'main-title'), true, 'an ordinary visit lost its heading');
        assert.match(run(sb, 'document.getElementById("main-title").textContent'),
            /Side Matches/, 'the heading stopped saying what the page is');
    });

    test('the Bets pointer is there', () => {
        assert.equal(shown(arrive(false), 'sm-bets-pointer'), true,
            'an ordinary visit lost the pointer to Skins and KPs');
    });

    test('and so is the side-matches card', () => {
        assert.equal(shown(arrive(false), 'sidematches-card'), true);
    });

    test('the Bets pointer still points at the Bets page', () => {
        const at = SM.indexOf('id="sm-bets-pointer"');
        assert.ok(at > -1, 'the pointer needs an id so the arrival can hide it');
        assert.match(SM.slice(at, at + 500), /skins\.html/,
            'the pointer no longer points anywhere');
    });
});
