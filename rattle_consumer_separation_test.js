// ============================================================================
// RATTLE GOLF CONSUMER — PRODUCT SEPARATION
//
// Rattle Golf Consumer is TWO experiences and only two:
//
//     GAME DAY   (formerly Quick Round)
//     ROAD TRIP  (formerly Golf Trip)
//
// Club Round and Tournament Round belong to a separate Club/Tournament product
// that has not been built yet.
//
// THE POINT OF THIS FILE IS THE SECOND HALF, NOT THE FIRST.
//
// Asserting that Consumer stopped showing Club Round is easy and not very
// valuable. What is valuable — and what a future cleanup batch is most likely to
// break by accident — is that the Club/Tournament IMPLEMENTATION survived the
// separation intact. A trip record still carries its `tournaments` node. The
// club preset still resolves. The outbound helpers still exist. None of that is
// reachable from the Consumer UI any more, which is exactly why nothing else
// would notice if it disappeared.
//
// If you are here because one of these tests failed while you were deleting
// "unused" code: stop. The second product is going to be built on it.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const ADMIN = read('admin.html');
const TRIP = read('trip.html');
const LINKS = read('product-links.js');

const CONSUMER_PAGES = ['admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
    'skins.html', 'sidematches.html', 'stats.html', 'trip.html'];

// ---------------------------------------------------------------------------
describe('CONSUMER IS GAME DAY AND ROAD TRIP', () => {

    test('the lobby offers exactly two modes', () => {
        const home = ADMIN.slice(ADMIN.indexOf('class="home-widgets"'),
            ADMIN.indexOf('id="event-type-framing"'));
        // 'home-widget' and 'home-widget active' only - NOT the 'home-widgets' container.
        const tiles = home.match(/class="home-widget(?: active)?"/g) || [];
        assert.equal(tiles.length, 2, 'Consumer presents Game Day and Road Trip, nothing else');
    });

    test('they are named Game Day and Road Trip', () => {
        assert.match(ADMIN, /<div class="hw-name">Game Day<\/div>/);
        assert.match(ADMIN, /<div class="hw-name">Road Trip<\/div>/);
    });

    test('the retired names are gone from the lobby', () => {
        // Comments stripped first: the separation comment deliberately explains what
        // Club Round was, and that explanation is not a user-facing label.
        const home = ADMIN.slice(ADMIN.indexOf('class="home-widgets"'),
            ADMIN.indexOf('id="event-type-framing"')).replace(/<!--[\s\S]*?-->/g, '');
        assert.ok(!/Quick Round/.test(home), 'Quick Round is now Game Day');
        assert.ok(!/Golf Trip/.test(home), 'Golf Trip is now Road Trip');
        assert.ok(!/Club Round/.test(home), 'Club Round moved to the other product');
    });

    test('Road Trip names itself consistently on its own page', () => {
        assert.match(TRIP, /<title>Road Trip<\/title>/);
        assert.match(TRIP, /<div class="lobby-title">Road Trip<\/div>/);
    });

    test('the compact nav still says "Trip", not the full product name', () => {
        // Eight items in a 390px-wide bar. The full name lives on the homepage tile
        // where there is room for it; the nav is deliberately abbreviated.
        CONSUMER_PAGES.forEach(f => {
            const src = read(f);
            if (!src.includes('trip.html" class="top-nav-item')) return;
            assert.ok(/\u{1F690} Trip/u.test(src), `${f}: nav label must be the van + "Trip"`);
            assert.ok(!/Road Trip<\/a>/.test(src), `${f}: the nav must not carry the full name`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('CONSUMER NO LONGER SURFACES THE CLUB/TOURNAMENT PRODUCT', () => {

    test('no Club Round tile', () => {
        assert.ok(!/id="hw-club"/.test(ADMIN));
        assert.ok(!/Same round, set up for club formats/.test(ADMIN));
    });

    test('no tournament promo card', () => {
        assert.ok(!/cross-product-exit">/.test(ADMIN), 'the card markup is gone');
        assert.ok(!/id="open-tournaments-link"/.test(ADMIN));
        assert.ok(!/Running a tournament or charity event/.test(ADMIN));
    });

    test('no tournament management inside Road Trip', () => {
        assert.ok(!/Tournaments in This Trip/.test(TRIP));
        assert.ok(!/Manage in Tournaments/.test(TRIP));
        assert.ok(!/id="tournaments-section"[^>]*>\s*<summary/.test(TRIP),
            'the details block is gone, not merely hidden');
    });

    test('a golfer can run a whole trip without meeting the word Tournament', () => {
        // Scoped to what a Consumer user can SEE. Comments and retained helpers are
        // checked separately below and must not be caught here.
        const visible = TRIP.replace(/<!--[\s\S]*?-->/g, '');
        const body = visible.slice(visible.indexOf('<body'));
        const shown = body.match(/>[^<>{}$]*Tournament[^<>{}$]*</gi) || [];
        assert.equal(shown.length, 0,
            'visible Road Trip copy still mentions Tournaments: ' + shown.join(' | '));
    });
});

// ---------------------------------------------------------------------------
describe('THE CLUB/TOURNAMENT IMPLEMENTATION SURVIVED — DO NOT DELETE THIS CODE', () => {

    test('the club PRESET still resolves from a deep link', () => {
        // Club Round was never a product, it was a framing preset over the same Round
        // engine. ?eventType=club must keep working: the Club app will use it.
        assert.match(ADMIN, /urlParams\.get\('eventType'\)/, 'the deep-link parameter');
        assert.match(ADMIN, /club: "Club Round/, 'the framing copy');
        assert.match(ADMIN, /currentEventType === 'club'/, 'the Step 3 branch');
        assert.match(ADMIN, /eventTypeFraming/, 'the framing table');
    });

    test('selectHomeWidget survives a missing tile instead of throwing', () => {
        // hw-club is gone from the markup but the branch still accepts 'club'. Without
        // the guard this is a null dereference on a deep link.
        const fn = ADMIN.slice(ADMIN.indexOf('function selectHomeWidget'),
            ADMIN.indexOf('function generateRoomCode'));
        assert.match(fn, /\|\| document\.getElementById\('hw-quick'\)/,
            'the tile lookup must fall back rather than throw');
        assert.match(fn, /if \(tileEl\) tileEl\.classList\.add\('active'\)/);
    });

    test('the outbound tournament route helpers survive', () => {
        assert.match(ADMIN, /function openTournamentsApp/, 'Consumer keeps the route helper');
        assert.match(LINKS, /function tournamentUrl/, 'the shared origin helper');
        assert.match(ADMIN, /if \(type === 'tournament'\) \{ openTournamentsApp\(\); return; \}/,
            'cached PWA markup can still call this and must not dead-end');
    });

    test('★ the trip → tournament DATA relationship survived the UI removal', () => {
        // The most important assertion in this file. The Tournament product writes
        // trips/<code>/tournaments when an organiser attaches a tournament day to a
        // trip. Consumer stopped displaying it. Consumer must not stop CARRYING it.
        assert.match(TRIP, /tripData\.tournaments \|\| \{\}/,
            'the read over trips/<code>/tournaments must survive');
        assert.match(TRIP, /function renderTournamentsList/,
            'retained for reuse by the Club/Tournament app');
        assert.match(TRIP, /function createTournamentForTrip/,
            'the outbound helper is retained');
        assert.match(TRIP, /tournamentUrl\(`tournament\.html\?trip=\$\{currentTripCode\}`\)/,
            'the trip -> tournament route is retained');
    });

    test('no destructive schema migration was run', () => {
        // Nothing may delete, rename or rewrite the tournaments node. A trip saved
        // before this batch must load identically after it.
        assert.ok(!/delete\s+tripData\.tournaments/.test(TRIP));
        assert.ok(!/tournaments:\s*null/.test(TRIP));
        assert.ok(!/remove\(\)[\s\S]{0,60}tournaments/.test(TRIP));
    });

    test('the Tournament product files are all still in the repo', () => {
        ['tournament.html', 'tournament-scorecard.html', 'tournament-engine.js']
            .forEach(f => assert.ok(fs.existsSync(path.join(__dirname, f)),
                f + ' must not be deleted - the second product is built on it'));
    });

    test('the Tournament build target is untouched', () => {
        const build = read('build-shell.js');
        assert.match(build, /appName: 'GolfApp Tournaments'/, 'Tournament identity unchanged');
        assert.match(build, /cacheName: 'tournament-v32-consumer-ready'/,
            'no Tournament asset changed in this batch, so its cache must not move');
        assert.ok(!/Rattle/.test(build.slice(build.indexOf('tournament: {'))),
            'Tournament must never be renamed Rattle Golf');
    });
});

// ---------------------------------------------------------------------------
describe('NOTHING CONSUMER-FACING REGRESSED', () => {

    test('every Consumer page still ships and still has its nav', () => {
        CONSUMER_PAGES.forEach(f => assert.ok(fs.existsSync(path.join(__dirname, f)), f));
    });

    test('the gear now means settings and nothing else', () => {
        CONSUMER_PAGES.forEach(f => {
            const src = read(f);
            assert.ok(!/\u2699\ufe0f? Home/u.test(src), `${f}: a gear must not mean Home`);
            if (/top-nav-item/.test(src)) {
                assert.ok(/\u{1F3E0} Home/u.test(src), `${f}: Home is a house`);
            }
        });
        assert.match(ADMIN, /\u2699\ufe0f Format Settings/u,
            'the gear survives where it genuinely means settings');
    });

    test('the round engine was not touched by a product rename', () => {
        ['money-engine.js', 'settlement-engine.js', 'action-model.js', 'bet-strip.js',
         'hole-events.js', 'score-marks.js', 'handicap.js', 'grouping.js', 'payouts.js']
            .forEach(f => assert.ok(!/Game Day|Road Trip/.test(read(f)),
                f + ' is shared engine code and must stay product-neutral'));
    });
});
