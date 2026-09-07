// ============================================================================
// CONSUMER JOURNEY + PRODUCT IDENTITY
//
// The question behind this file: could twenty golfers who have never seen the
// repo pick this up tomorrow without somebody standing next to them?
//
// THE CLUB EVENT DECISION, RECORDED
//
// The home carried three tiles - Golf Trip, Club Event, Quick Round - which read
// as three product categories. Tracing it settled the question: selectHomeWidget
// ('club') sets a framing string and marks a tile active. Nothing else. The round
// it creates is byte-for-byte the round Quick Round creates: same wizard, same
// engine, same code, same storage. `currentEventType` is commented in the source
// as "framing only, same Round engine either way".
//
// So it was category B - real Consumer functionality wearing a name that implied a
// third product, under a TROPHY icon that implied tournament administration.
// Organising a tournament is the other product. This is a format preset.
//
// It is now "Club Round - same round, set up for club formats", under a golf flag.
// The eventType=club parameter is untouched, so old links and cached PWA shells
// keep working. These tests exist so it cannot drift back into looking like a
// third product, and cannot quietly grow tournament behaviour.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const BUILD = read('build-shell.js');

// ---------------------------------------------------------------------------
describe('THE HOME OFFERS THE THREE THINGS THE PRODUCT IS', () => {
    // Still the primary action, reached differently. It used to be a button under
    // the tiles; the tile IS the button now, so what this guards is that tapping
    // Game Day starts a round - not that a particular control exists.
    test('Start a round', () => {
        assert.match(ADMIN, /onclick="selectHomeWidget\('quick'\)"/, 'the primary action');
        const fn = ADMIN.slice(ADMIN.indexOf('function selectHomeWidget'),
            ADMIN.indexOf('function generateRoomCode'));
        assert.match(fn, /createRoom\(\);/, 'picking Game Day does not start anything');
        assert.match(ADMIN, /function createRoom\(\)[\s\S]{0,300}window\.location\.href/,
            'createRoom no longer goes anywhere');
    });

    // JOINING IS A LINK, NOT A CODE. The typed-code field is gone: a golfer
    // arrives on a link the organizer sends, and nobody has ever typed a code.
    // What must survive is the path that is actually used, so that is what this
    // now guards - including a legacy 4-character code, because the link path
    // applies no length rule at all.
    test('Join a round, by opening the link the organizer sent', () => {
        assert.ok(!/id="join-room-input"/.test(ADMIN),
            'the home still asks for a code nobody types');
        assert.match(ADMIN, /urlParams\.get\('game'\)/, 'the link parameter must be read');
        const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js'],
            { search: '?game=ABCD' });
        assert.equal(vm.runInContext('currentMode', sb), 'ABCD',
            'a link no longer opens the round it names');
    });

    test('Trips', () => {
        assert.match(ADMIN, /onclick="selectHomeWidget\('trip'\)"/);
        assert.match(ADMIN, /window\.location\.href = 'trip\.html'/, 'and it actually goes there');
    });

    test('Resume, shown only when there is something to resume', () => {
        assert.match(ADMIN, /id="resume-container"[^>]*display: none/, 'hidden until relevant');
        assert.match(ADMIN, /onclick="resumeGame\(\)"/);
        assert.match(ADMIN, /id="resume-room-badge"/, 'and it names the round');
    });

    test('nothing on the home requires an account, trip or tournament to play', () => {
        const home = ADMIN.slice(ADMIN.indexOf('class="home-widgets"'), ADMIN.indexOf('admin-screen'));
        assert.ok(!/sign in|log in|create account|profile/i.test(home));
    });
});

// ---------------------------------------------------------------------------
describe('CLUB ROUND IS A PRESET, AND IT LEFT CONSUMER WITHOUT BEING DELETED', () => {
    test('the Club Round tile is gone from the Consumer lobby', () => {
        assert.ok(!/id="hw-club"/.test(ADMIN),
            'Rattle Golf Consumer presents Game Day and Road Trip only');
        assert.ok(!/Same round, set up for club formats/.test(ADMIN),
            'the tile copy must go with the tile');
    });

    test('but the club PRESET was preserved, not deleted', () => {
        // This is the difference between separating two products and destroying one.
        // A deep link carrying ?eventType=club must still behave exactly as it did,
        // because the Club/Tournament app will own this entry point next.
        assert.match(ADMIN, /eventTypeFraming/, 'the framing table must survive');
        assert.match(ADMIN, /club: "Club Round/, 'the club framing string must survive');
        assert.match(ADMIN, /currentEventType === 'club'/, 'Step 3 club framing must survive');
        assert.match(ADMIN, /urlParams\.get\('eventType'\)/, 'the deep-link parameter must survive');
    });

    test('it creates the same round Game Day creates', () => {
        // Provable from the handler: it sets a label and a framing string, nothing more.
        const fn = ADMIN.slice(ADMIN.indexOf('function selectHomeWidget'),
            ADMIN.indexOf('function generateRoomCode'));
        assert.match(fn, /selectedEventType = type;/);
        assert.match(fn, /framingEl\.textContent = eventTypeFraming\[type\]/);
        assert.ok(!/db\.ref|tournament\.html|flight|season/i.test(fn),
            'it must not write anything or route anywhere');
    });

    test('NEGATIVE CONTROL — it must never grow tournament behaviour', () => {
        const fn = ADMIN.slice(ADMIN.indexOf('function selectHomeWidget'),
            ADMIN.indexOf('function generateRoomCode'));
        // Comments stripped first: the branch below is explained at length in prose,
        // and counting that prose made this fail for the wrong reason. What must stay
        // small is the CODE - the one compatibility branch for cached shells still
        // calling with 'tournament', which exits to the other product.
        const code = fn.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        const tourney = (code.match(/tournament/gi) || []).length;
        assert.ok(tourney <= 2, 'club selection must not acquire tournament logic');
        assert.match(fn, /if \(type === 'tournament'\) \{ openTournamentsApp\(\); return; \}/,
            'the legacy tile still exits to the other product');
    });

    test('the eventType parameter still works, so old links do not break', () => {
        assert.match(ADMIN, /urlParams\.get\('eventType'\) \|\| 'quick'/);
        assert.match(ADMIN, /eventType=\$\{selectedEventType\}/);
    });
});

// ---------------------------------------------------------------------------
describe('THE TOURNAMENT TRANSITION IS OUTBOUND, AND CONFIGURED', () => {
    test('Consumer reaches Tournament only through the product-links seam', () => {
        assert.match(read('trip.html'), /tournamentUrl\(`tournament\.html\?trip=/,
            'never a bare relative href, which breaks on two origins');
        assert.match(ADMIN, /function openTournamentsApp/);
    });

    test('no production file hardcodes a Tournament origin', () => {
        ['admin.html', 'trip.html', 'index.html'].forEach(f => {
            const code = read(f).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
            assert.ok(!/https:\/\/[a-z0-9.-]*tournament[a-z0-9.-]*\./i.test(code),
                `${f} must resolve Tournament through product-links, not a literal URL`);
        });
    });

    test('the Consumer home has no tournament tile', () => {
        const home = ADMIN.slice(ADMIN.indexOf('class="home-widgets"'), ADMIN.indexOf('trip-context-banner'));
        assert.ok(!/hw-tournament|Tournament<\/div>/.test(home));
    });

    test('Consumer ships no Tournament organizer page', () => {
        const sync = read('sync-mobile-web.js');
        const consumer = /const CONSUMER_SHELL = \[([\s\S]*?)\];/.exec(sync)[1];
        ['tournament.html', 'tournament-scorecard.html', 'tournament-engine.js']
            .forEach(f => assert.ok(!consumer.includes(f), `${f} must not ship to Consumer`));
    });
});

// ---------------------------------------------------------------------------
describe('THE BRANDING SEAM IS SMALL AND THE TWO PRODUCTS ARE INDEPENDENT', () => {
    test('each product declares its own identity', () => {
        assert.match(BUILD, /appName: 'Rattle Golf',[\s\S]{0,80}shortName: 'Rattle Golf',/);
        assert.match(BUILD, /appName: 'GolfApp Tournaments',/);
    });

    test('NEGATIVE CONTROL — renaming Consumer must not rename Tournament', () => {
        const consumer = BUILD.slice(BUILD.indexOf('consumer: {'), BUILD.indexOf('tournament: {'));
        const tournament = BUILD.slice(BUILD.indexOf('tournament: {'));
        assert.match(consumer, /appName: '[^']+'/);
        assert.match(tournament, /appName: '[^']+'/);
        // Two literals, not one shared variable - independence is the point.
        assert.notEqual(/appName: '([^']+)'/.exec(consumer)[1],
            /appName: '([^']+)'/.exec(tournament)[1],
            'the two products must not share one mutable identity');
    });

    test('page titles describe function, not brand, so a rename touches few files', () => {
        [['index.html', 'Live Scorecard'], ['leaderboard.html', 'Live Leaderboard'],
         ['settlement.html', 'Round Settlement'], ['trip.html', 'Road Trip']].forEach(([f, t]) => {
            assert.match(read(f), new RegExp('<title>' + t), `${f} title is functional`);
        });
    });

    test('the visible product name lives in exactly the places the report lists', () => {
        // If this count moves, the rename surface moved with it and the handoff note
        // in the next batch is out of date.
        const surfaces = [
            ['admin.html', /<div class="lobby-title">Rattle Golf<\/div>/],
            ['admin.html', /title: `Rattle Golf`/],
            ['instructions.html', /<title>How Rattle Golf Works<\/title>/],
            ['instructions.html', /How Rattle Golf Works<\/h1>/],
        ];
        surfaces.forEach(([f, re]) => assert.match(read(f), re, `${f} identity surface moved`));
    });
});

// ---------------------------------------------------------------------------
describe('MANIFEST AND INSTALL METADATA', () => {
    test('Consumer starts at the golfer home, whatever the filename is', () => {
        assert.match(BUILD, /startUrl: '\.\/admin\.html'/);
        // The filename says admin; the page renders the golfer lobby. That is what matters.
        assert.match(ADMIN, /class="lobby-title"/);
        assert.match(ADMIN, /class="home-widgets"/);
    });

    test('Tournament starts at its own entry', () => {
        assert.match(BUILD, /startUrl: '\.\/tournament\.html'/);
    });

    test('the two products have distinct theme colours and caches', () => {
        // Consumer moved to the locked Rattle Golf forest green. Tournament did not
        // move — it is a separate product and was not rebranded.
        assert.match(BUILD, /themeColor: '#0E2B1F'/);
        assert.match(BUILD, /themeColor: '#1d3557'/);
        assert.match(BUILD, /cacheName: 'consumer-v/);
        assert.match(BUILD, /cacheName: 'tournament-v/);
    });

    test('icons are declared at both required sizes, maskable', () => {
        assert.match(BUILD, /src: 'icon-192\.png', sizes: '192x192'[^}]*maskable/);
        assert.match(BUILD, /src: 'icon-512\.png', sizes: '512x512'[^}]*maskable/);
    });

    test('both icon files exist and are shipped', () => {
        ['icon-192.png', 'icon-512.png'].forEach(f => {
            assert.ok(fs.existsSync(path.join(REPO_ROOT, f)), `${f} missing`);
        });
        assert.match(read('sync-mobile-web.js'), /'icon-192\.png', 'icon-512\.png'/);
    });
});

// ---------------------------------------------------------------------------
describe('NOTHING ELSE MOVED', () => {
    test('the escaper and its coverage survive', () => {
        assert.match(read('text-safe.js'), /function escapeHtml/);
        assert.match(ADMIN, /value="\$\{escapeHtml\(name\)\}"/);
        assert.match(read('trip.html'), /selectRoundCourseById/);
    });

    test('the security rules were not touched', () => {
        assert.match(read('database.rules.json'),
            /newData\.isNumber\(\) && newData\.val\(\) >= 0 && newData\.val\(\) <= 100000/);
    });

    test('the closed scoring work survives', () => {
        const idx = read('index.html');
        assert.match(idx, /withNavAnchor\(renderHoleView\)/, 'Prev/Next anchor');
        assert.match(idx, /function renderDotsWidgetHtml/, 'Live Dots');
        assert.match(idx, /const TICKER_MOUNTS = \['live-ticker-mount', 'fc-ticker-mount'\]/);
        assert.match(idx, /class="cell-dots"/, 'score-box geometry');
        assert.match(read('money-engine.js'), /dotVal \* \(n \* units - totalUnits\)/);
    });
});
