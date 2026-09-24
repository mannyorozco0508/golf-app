// ============================================================================
// EVERY PAGE THAT SETTLES A MATCH LOADS match-engine.js — AND THE COST OF NOT
//
// THE LOAD ORDER IS MONEY. This is the v215 lesson applied to v218.
//
// calculateMatchEngine is reached as a plain global, and EVERY caller guards it:
//
//   money-engine.js       buildLiveMatchState:  if (typeof calculateMatchEngine
//                         !== 'function') return null;
//   ryder-cup.js          ryderFourBallState:   same guard, same silent null
//   aloha-bet.js          alohaSettledFor*:     same
//
// Those guards are correct - a page that does not settle matches should not
// throw - but they mean a page that loads a CALLER and never the ENGINE does not
// break. It renders a match with no money, settles a round with no Aloha, and
// reports nothing. Two pages, two totals, no error. That is precisely the defect
// v215 found in the Aloha's own load order, and giving the engine its own file in
// v218 created a fresh chance to make it.
//
// So this pins, per page:
//   1. the tag is there at all
//   2. it comes AFTER handicap.js, its only dependency
//   3. it comes BEFORE every caller, so the order reads as the intent
//   4. and - the part that is not a source scan - a realm built WITHOUT it is
//      measured, to show what the silence actually looks like
//
// Point 4 matters because points 1-3 are all "the text is present". Only a run
// proves the guard is the thing standing between a golfer and a wrong number.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// The pages that call calculateMatchEngine, directly or through a module they
// load. DISCOVERED, not listed: a page that starts settling matches has to appear
// here on its own, or this file would keep passing while the new page is silent.
const CALLERS = ['money-engine.js', 'settlement-engine.js', 'ryder-cup.js',
                 'bet-strip.js', 'aloha-bet.js', 'live-skins.js'];

function pagesThatNeedIt() {
    return fs.readdirSync(REPO_ROOT).filter(f => f.endsWith('.html')).filter(page => {
        const src = read(page);
        const tags = [...headOnly(src).matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].replace(/^\.\//, ''));
        const inlineCalls = /calculateMatchEngine\s*\(/.test(
            [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
                .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));
        return inlineCalls || tags.some(t => CALLERS.includes(t));
    }).sort();
}

// REAL TAGS ONLY — inline <script> blocks are cut out first.
//
// A tag spelled out inside a comment in the page's own inline script is not a tag,
// but it IS matched by the regex helpers/load-script.js uses to find a page's
// scripts. v218 wrote exactly such a comment ("the <script src=...> tag is in the
// head above") and it made the harness load match-engine.js from a COMMENT - so the
// control that deleted the real tag reported almost nothing wrong. The comment was
// reworded; this strips inline blocks anyway, so the next one cannot do it either.
const headOnly = (src) => src.replace(/<script>[\s\S]*?<\/script>/g, '');
const tagIndex = (src, file) => headOnly(src).indexOf('<script src="' + file + '"></script>');

describe('match-engine.js load order, per page', () => {

    test('the discovery found the pages, and it found the ones we know settle matches', () => {
        // POSITIVE ASSERTION FIRST. Every per-page check below is generated from
        // this list; if it ever parses to nothing, the whole file would report PASS
        // while guarding nothing.
        const pages = pagesThatNeedIt();
        assert.ok(pages.length >= 8,
            'expected at least 8 match-settling pages, found ' + pages.length + ': ' + pages.join(', '));
        ['index.html', 'stats.html', 'settlement.html', 'sidematches.html', 'skins.html',
         'leaderboard.html', 'game.html', 'trip.html', 'admin.html']
            .forEach(p => assert.ok(pages.includes(p), p + ' must be in the discovered set'));
    });

    pagesThatNeedIt().forEach(page => {
        describe(page, () => {
            test('loads match-engine.js', () => {
                assert.ok(tagIndex(read(page), 'match-engine.js') !== -1,
                    page + ' calls the match engine and never loads it. Every caller '
                    + 'guards with typeof, so this page would settle no match money '
                    + 'and report no error.');
            });

            test('loads it AFTER handicap.js', () => {
                const src = read(page);
                const h = tagIndex(src, 'handicap.js');
                const m = tagIndex(src, 'match-engine.js');
                assert.ok(h !== -1, page + ' must load handicap.js');
                assert.ok(h < m, 'handicap.js must come first - the engine calls '
                    + 'getStrokes, parseHcp and the relative-handicap helpers');
            });

            test('loads it BEFORE every caller it also loads', () => {
                const src = read(page);
                const m = tagIndex(src, 'match-engine.js');
                CALLERS.forEach(caller => {
                    const c = tagIndex(src, caller);
                    if (c === -1) return;
                    assert.ok(m < c, 'match-engine.js must load before ' + caller
                        + ' on ' + page + ' - order is how the intent is expressed, and '
                        + 'a typeof-guarded caller cannot tell you it was wrong');
                });
            });
        });
    });

    test('stats.html specifically — it never loaded money-engine.js, and still does not', () => {
        // THE PAGE THIS WAVE WAS FOR. stats.html carried a full inline engine because
        // adopting the canonical one meant loading money-engine.js. It now loads
        // match-engine.js and owns no engine, and it still does not pull in
        // money-engine.js - which is the whole reason the function got its own file
        // rather than stats.html getting a 67KB script tag.
        const src = read('stats.html');
        assert.match(src, /<script src="match-engine\.js">/);
        assert.ok(!/<script src="money-engine\.js">/.test(src),
            'stats.html must NOT need money-engine.js; if it does, the extraction '
            + 'bought nothing and match-engine.js should be reconsidered');
        assert.ok(!/function\s+calculateMatchEngine\s*\(/.test(src),
            'stats.html must not carry a copy');
    });
});

describe('WHAT THE SILENCE LOOKS LIKE — measured, not asserted from source', () => {

    test('WITHOUT the engine, buildLiveMatchState returns a SILENT null', () => {
        // options.only builds the deliberately-crippled realm: money-engine.js with
        // handicap.js and nothing else. No throw, no warning, just null - which a
        // caller renders as "no match".
        const crippled = loadJsFile('money-engine.js', ['handicap.js'], { only: true });
        assert.equal(typeof crippled.buildLiveMatchState, 'function',
            'the function must exist, or this proves nothing');
        assert.equal(typeof crippled.calculateMatchEngine, 'undefined',
            'this realm must genuinely lack the engine');
        const d = {
            players: [{ id: 1, name: 'Ann', hcp: '0', team: 'Team 1', playingForMoney: true },
                      { id: 2, name: 'Ben', hcp: '0', team: 'Team 2', playingForMoney: true }],
            gameFormat: 'match', matchScoring: 'gross', matchStake: 20, matchPressRule: 'none'
        };
        const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
        const scores = {}; for (let h = 1; h <= 9; h++) { scores['p1_h' + h] = 3; scores['p2_h' + h] = 4; }
        const out = crippled.buildLiveMatchState(d, cd, scores);
        assert.equal(out, null,
            'if this ever throws instead of returning null, the guard changed and this '
            + 'whole file can be reconsidered - a loud failure needs no load-order pin');
    });

    test('WITH the engine, the same round produces a real match state', () => {
        // THE OTHER HALF, or the test above is satisfied by anything that returns
        // null - including a broken engine.
        const full = loadJsFile('money-engine.js', ['handicap.js', 'match-engine.js']);
        const d = {
            players: [{ id: 1, name: 'Ann', hcp: '0', team: 'Team 1', playingForMoney: true },
                      { id: 2, name: 'Ben', hcp: '0', team: 'Team 2', playingForMoney: true }],
            gameFormat: 'match', matchScoring: 'gross', matchStake: 20, matchPressRule: 'none'
        };
        const cd = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
        const scores = {}; for (let h = 1; h <= 9; h++) { scores['p1_h' + h] = 3; scores['p2_h' + h] = 4; }
        const out = full.buildLiveMatchState(d, cd, scores);
        assert.ok(out && typeof out === 'object', 'the same round must now produce a state');
        assert.ok(out.t1Name === 'Ann' || JSON.stringify(out).includes('Ann'),
            'the state must describe the actual match');
    });

    test('the Aloha goes quiet the same way, which is why v215 pinned ITS load order too', () => {
        const crippled = loadJsFile('aloha-bet.js', [], { only: true });
        assert.equal(typeof crippled.alohaSettledForMainGame, 'function');
        const out = crippled.alohaSettledForMainGame({ players: [], alohaAllowed: true }, [], {});
        assert.equal(out, null,
            'a page with aloha-bet.js and no match engine settles no Aloha and says nothing');
    });
});
