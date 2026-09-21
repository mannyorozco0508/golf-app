// ============================================================================
// THE GAME TAB (2026-09-20, v186)
//
// Stats showed everyone's scorecard and a button to Results; the leaderboard's
// tap-a-name card and the Receipt already cover both. Its nav slot is now a
// tab that says WHAT IS BEING PLAYED - the sentence a golfer reads once on the
// first tee: the course and round length, the format and how it is scored, the
// Weekly Game (buy-in, pot, KP holes and what each pays, Net Finish places,
// skins gross/net, carry or not, per flight or the field), who is in Flight A
// and B, side matches and side games, and the groups in tee order. Read-only:
// game.html registers one listener and writes nothing. stats.html stays in the
// repo as the parity surface 43 tests read; it just has no tab.
//
// ARRIVAL. The page is loaded at the URL a golfer lands on (?game=CODE&group=N)
// and the round is DELIVERED through the listener the page itself registered.
// No page function is called to render; if the page does not do it on its own
// it does not happen (CLAUDE.md). The round is the pool_flights golden's flight
// variant - 23 golfers, 12 A / 11 B, $20 in, KP $40 on 3/7/12/16, net $200
// 60/40, skins $220 gross per flight - the case that matters.
//
// HARNESS. mini-dom: innerHTML is a string; the cards are read as text from it.
// Layout (two nav rows at 390px) is nav_bar_test.js's claim, in Chrome.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = makeCourseData(18);
const DEPS = ['handicap.js', 'text-safe.js', 'action-model.js', 'money-engine.js', 'settlement-engine.js', 'pool-engine.js', 'grouping.js'];

function golden(flights) {
    const r = wizardSavedRound({ code: 'POOLGLD', courseData: CD, thru: 18, overrides: { additionalGames: {}, flights } });
    if (flights === undefined) delete r.flights;
    return r;
}

// Arrive by URL, let the page register its listener, deliver the snapshot.
function arrive(data, search) {
    const sb = loadHtmlInlineScript('game.html', DEPS, { search: search || '?game=poolgld&group=2' });
    vm.runInContext("document.__mount(document.getElementById('game-content'))", sb);
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/POOLGLD');
    assert.ok(h, 'the page registered no value listener on events/POOLGLD');
    h.cb({ val: () => JSON.parse(JSON.stringify(data)), exists: () => true });
    const html = String(vm.runInContext("document.getElementById('game-content').innerHTML", sb));
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    return { sb, html, text };
}

describe('THE GAME TAB - rendered on the pool_flights golden round, delivered through the listener', () => {
    test('the course, the round length, the format and how it is scored', () => {
        const { text } = arrive(golden({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } }));
        assert.match(text, /Course Tidewater · 18 holes/);
        assert.match(text, /Format Stroke Play · scored net — handicap strokes count/);
    });
    test('the Weekly Game: buy-in, pot, KP holes and each hole\'s share, the Net Finish places, the skins rule and its per-flight pots', () => {
        const { text } = arrive(golden({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } }));
        assert.match(text, /Weekly Game \$20 each · 23 golfers in · \$460 pot/);
        assert.match(text, /KP on holes 3, 7, 12 and 16 — \$10 each \(\$40 of the pot\)/);
        assert.match(text, /Net Finish — \$200 to the best net scores: 1st \$120, 2nd \$80/);
        assert.match(text, /Skins — \$220, gross scores, no carry-over — a tied hole pays nobody; one pot per flight, split by headcount: Flight A \$115 \(12 golfers\), Flight B \$105 \(11 golfers\)\./);
    });
    test('the flights: who is A and who is B, and which game is played by flight', () => {
        const { text } = arrive(golden({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } }));
        assert.match(text, /Flight A \(12\): Ann, Ben, Cal, Dee, Eli, Fay, Gus, Hal, Ivy, Jon, Kim, Lee/);
        assert.match(text, /Flight B \(11\): Max, Ned, Oli, Pat, Quy, Rae, Sal, Tom, Uma, Vic, Wes/);
        assert.match(text, /Played by flight: skins\. Everything else is the whole field\./);
    });
    test('skins for the whole field says so', () => {
        const { text } = arrive(golden({ enabled: true, scopes: { skins: 'field', birdies: 'field' } }));
        assert.match(text, /no carry-over — a tied hole pays nobody; the whole field plays one pot\./);
        assert.doesNotMatch(text, /Flight A \$/);
        assert.match(text, /Standings only — every game is the whole field\./);
    });
    test('the groups in tee order, and the group on this link is marked', () => {
        const { html, text } = arrive(golden(undefined));
        assert.match(text, /Groups, in tee order Group 1 Ann, Ben, Cal, Dee Group 2 Eli, Fay, Gus, Hal YOUR GROUP Group 3 Ivy, Jon, Kim, Lee Group 4 Max, Ned, Oli, Pat Group 5 Quy, Rae, Sal, Tom Group 6 Uma, Vic, Wes/);
        assert.equal((html.match(/YOUR GROUP/g) || []).length, 1);
        assert.doesNotMatch(arrive(golden(undefined), '?game=poolgld').html, /YOUR GROUP/, 'no group on the link, no mark');
    });
    test('no flights: no Flights card; no side action: no Side action card', () => {
        const { text } = arrive(golden(undefined));
        assert.doesNotMatch(text, /Flights|Flight A|Side action/);
    });
    test('side matches and side games, by first names and in plain words', () => {
        const d = golden(undefined);
        d.sideMatches = { sm1: { enabled: true, format: 'nassau', scoring: 'net', stake: 10, teamAIds: [d.players[0].id, d.players[1].id], teamBIds: [d.players[12].id, d.players[13].id], nassauPressRule: '2down' },
                          sm2: { enabled: true, format: 'match', scoring: 'gross', stake: 25, teamAIds: [d.players[2].id], teamBIds: [d.players[3].id], startHole: 10 } };
        d.additionalGames = { dots: { enabled: true, pointVal: 2 } };
        const { text } = arrive(d);
        assert.match(text, /Side action/);
        assert.match(text, /Ann & Ben vs Max & Ned — Nassau, F \$10 \/ B \$10 \/ O \$10, net/);
        assert.match(text, /Cal vs Dee — Match play, \$25, gross, from hole 10/);
        assert.match(text, /Dots \/ Junk · \$2/);
    });
    test('no Weekly Game: no Weekly Game card', () => {
        const d = golden(undefined); delete d.moneyPool;
        const { text } = arrive(d);
        assert.doesNotMatch(text, /Weekly Game|KP on/);
        assert.match(text, /Course Tidewater/);
    });
    test('a nine-hole round says which nine', () => {
        const d = golden(undefined); d.courseData = CD.slice(9);
        assert.match(arrive(d).text, /Back 9 only \(holes 10–18\)/);
        d.courseData = CD.slice(0, 9);
        assert.match(arrive(d).text, /Front 9 only \(holes 1–9\)/);
    });
    test('a gross Nassau main format says gross and the stake', () => {
        const d = golden(undefined); d.gameFormat = 'nassau'; d.nassauScoring = 'gross'; d.nassauStake = 5; d.nassauPressRule = '2down';
        assert.match(arrive(d).text, /Nassau · scored gross — no handicap strokes \$5 front, back and overall, automatic press at 2 down/);
    });
    test('a name is escaped on the way in', () => {
        const d = golden(undefined); d.players[0].name = '<b>Ann</b> Alpha'; d.courseName = 'Tide<i>water';
        const { html } = arrive(d);
        assert.doesNotMatch(html, /<b>Ann|<i>water/);
        assert.match(html, /&lt;b&gt;Ann&lt;\/b&gt;/);
    });
    test('READ-ONLY: the page registers one listener and writes nothing', () => {
        const { sb } = arrive(golden({ enabled: true, scopes: { skins: 'flight', birdies: 'field' } }));
        assert.deepEqual(JSON.parse(JSON.stringify(sb.__dbWrites || [])), []);
        assert.equal(sb.__dbHandlers.length, 1);
        const src = read('game.html');
        assert.equal((src.match(/db\.ref\(/g) || []).length, 1, 'one ref: the round it reads');
        assert.doesNotMatch(src, /\.ref\([^)]*\)\.(set|update|push|remove|transaction)\(|\.set\(|\.update\(|\.remove\(|\.transaction\(/, 'game.html writes to the database');
    });
    test('the nav rewrite carries the code and the group (source: static markup is not in the mini-dom tree; nav_bar_test.js measures the hrefs in Chrome)', () => {
        const src = read('game.html');
        const block = src.slice(src.indexOf("document.querySelectorAll('.nav-link').forEach"), src.indexOf('db.ref('));
        assert.match(block, /navHref = base \+ '\?game=' \+ currentMode/);
        assert.match(block, /navHref \+= '&group=' \+ groupParam/);
        assert.match(src, /<a href="game\.html" class="top-nav-item active nav-link">📖 Game<\/a>/);
        assert.match(src, /<a href="trip\.html" class="top-nav-item">🚐 Trip<\/a>/, 'Trip deliberately bare, as on every page');
    });
});

// ---------------------------------------------------------------------------
const CONSUMER_BARS = ['index.html', 'leaderboard.html', 'settlement.html', 'skins.html', 'sidematches.html', 'stats.html', 'game.html', 'admin.html'];
describe('THE NAV SLOT: 📖 Game where 📊 Stats was, on every bar', () => {
    CONSUMER_BARS.forEach(f => test(f + ' carries 📖 Game and no Stats pill', () => {
        const src = decodeEscapes(read(f));
        assert.match(src, /<a href="game\.html" class="top-nav-item[^"]*">📖 Game<\/a>/, f + ' has no Game pill');
        assert.doesNotMatch(src, /href="stats\.html" class="top-nav-item/, f + ' still has a Stats pill');
        assert.doesNotMatch(src, /📊 Stats/, f + ' still says Stats');
    }));
    test('Game sits between Matches and Trip', () => {
        CONSUMER_BARS.forEach(f => {
            const src = read(f);
            const m = src.indexOf('href="sidematches.html" class="top-nav-item'), g = src.indexOf('href="game.html" class="top-nav-item'), t = src.indexOf('href="trip.html" class="top-nav-item');
            assert.ok(m > -1 && g > m && t > g, f + ': order Matches ' + m + ' Game ' + g + ' Trip ' + t);
        });
    });
    test('nothing links to stats.html any more, and the file is still here for the parity tests', () => {
        ['index.html', 'leaderboard.html', 'settlement.html', 'skins.html', 'sidematches.html', 'admin.html', 'trip.html', 'instructions.html', 'game.html'].forEach(f =>
            assert.doesNotMatch(read(f), /stats\.html/, f + ' links to stats.html'));
        assert.ok(fs.existsSync(path.join(REPO_ROOT, 'stats.html')));
    });
    test('the shell ships game.html: sw.js precache, sync-mobile-web.js CONSUMER_SHELL', () => {
        assert.match(read('sw.js'), /'\.\/game\.html',/);
        const sync = read('sync-mobile-web.js');
        const list = sync.slice(sync.indexOf('const CONSUMER_SHELL = ['), sync.indexOf('];', sync.indexOf('const CONSUMER_SHELL = [')));
        assert.match(list, /'game\.html'/);
    });
    test('instructions.html describes the Game tab, not Stats', () => {
        const src = read('instructions.html');
        assert.match(src, /📖 Game/);
        assert.doesNotMatch(src, /📊 Stats|<strong>Stats<\/strong>/);
    });
});
