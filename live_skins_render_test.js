// ============================================================================
// LIVE SKINS CARD — rendered output
//
// The engine side is covered in live_skins_test.js. This file covers the
// presenter: that the card says what the ledger says, that it never claims a
// hole is decided when it is waiting, and that it re-renders on a correction.
//
// That last one matters more than it looks. The ledger is stateless - it is
// rebuilt from scores on every call, so a stale winner is structurally
// impossible inside the engine. Which means the ONLY place staleness can enter
// is here, if the card fails to re-render after a score changes. Sabotaging the
// engine to produce a stale winner is a no-op; sabotaging the render path is
// not. So that is what gets tested.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const PAGE = 'index.html';
const DEPS = ['action-model.js', 'money-engine.js', 'pool-engine.js',
    'settlement-engine.js', 'score-marks.js', 'bet-strip.js', 'hole-events.js'];
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

const NAMES = ['Avery', 'Blake', 'Casey', 'Devon', 'Ellis', 'Finley',
    'Gray', 'Harper', 'Indigo', 'Jordan', 'Kendall', 'Logan'];

// 12 golfers, 3 groups. `thru` sets how far each group has played.
function boot({ thru = { 1: 18, 2: 18, 3: 18 }, spec = {}, carry = false, buyIn = 20, holes = 18 } = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const cd = makeCourseData(holes);
    const p = makePlayers(NAMES, NAMES.map(() => 0));
    const groupOf = (id) => Math.floor((Number(id) - Number(p[0].id)) / 4) + 1;

    const scores = {};
    p.forEach(pl => cd.forEach(h => {
        const k = `p${pl.id}_h${h.hole}`;
        if (spec[k] !== undefined) { scores[k] = spec[k]; return; }
        if (h.hole <= (thru[groupOf(pl.id)] || 0)) scores[k] = h.par;
    }));

    const groupMap = {};
    p.forEach(pl => { groupMap[String(pl.id)] = groupOf(pl.id); });

    const data = {
        gameFormat: 'stroke', players: p, courseData: cd, scores,
        skinsPotFormat: 'net', skinsCarryOver: carry, skinsBuyIn: buyIn,
        additionalGames: { skins: true },
    };

    vm.runInContext(`
        currentMode = 'ABCD';
        currentData = ${JSON.stringify(data)};
        window.__scPlayerGroupMap = ${JSON.stringify(groupMap)};
        document.getElementById('live-skins-mount') || (function () {
            var d = document.createElement('div'); d.id = 'live-skins-mount';
            document.body.appendChild(d);
        })();
    `, sb);

    return {
        sb, p, cd,
        ids: (g) => p.filter(x => groupOf(x.id) === g).map(x => String(x.id)),
        run: c => vm.runInContext(c, sb),
        render: () => { vm.runInContext('renderLiveSkins();', sb); },
        html: () => sb.document.getElementById('live-skins-mount').innerHTML,
    };
}

// ============================================================================

describe('THE COMPACT CARD', () => {

    test('states the basis, the pot and the carry rule', () => {
        const b = boot({ spec: { p101_h1: 3 } });
        b.render();
        const h = b.html();
        assert.match(h, /WHOLE-FIELD NET SKINS/);
        assert.match(h, /\$240/, '12 golfers x $20.');
        assert.match(h, /NO CARRY/, 'The configured rule must be visible, not assumed.');
    });

    test('says CARRY when the round is configured to carry', () => {
        const b = boot({ carry: true, spec: { p101_h1: 3 } });
        b.render();
        assert.match(b.html(), /\u00B7 CARRY/);
        assert.ok(!/NO CARRY/.test(b.html()));
    });

    test('shows official-thru, and it reflects the slowest group', () => {
        const b = boot({ thru: { 1: 14, 2: 14, 3: 13 } });
        b.render();
        assert.match(b.html(), /Official thru 13/);
    });

    test('names the group a waiting hole is waiting on', () => {
        const b = boot({ thru: { 1: 14, 2: 14, 3: 13 } });
        b.render();
        assert.match(b.html(), /H14 \u2014 Waiting on Group 3/);
    });

    test('shows skin counts, most first, and omits golfers with none', () => {
        const b = boot({ holes: 4, spec: { p101_h1: 3, p101_h2: 3, p105_h3: 2 } });
        b.render();
        const h = b.html();
        assert.match(h, /Avery \u2014 2/);
        assert.match(h, /Ellis \u2014 1/);
        assert.ok(h.indexOf('Avery') < h.indexOf('Ellis'), 'Most skins first.');
        assert.ok(!/Blake/.test(h), 'A golfer with no skins must not take up space.');
    });

    test('names the most recent decided hole', () => {
        const b = boot({ holes: 4, spec: { p105_h3: 2 } });   // h3 is a par 3, so 3 would tie
        b.render();
        assert.match(b.html(), /Latest: H3 \u2014 Ellis/);
    });

    test('says so plainly when nothing has been won yet', () => {
        const b = boot({ holes: 3 });   // everyone level, every hole a tie
        b.render();
        assert.match(b.html(), /No skins won yet/);
    });

    test('the hole-by-hole ledger is COLLAPSED by default', () => {
        const b = boot({ holes: 18, spec: { p101_h1: 3 } });
        b.render();
        const h = b.html();
        assert.ok(!/ls-ledger/.test(h), '18 rows must not sit above the fold by default.');
        assert.match(h, /hole-by-hole/, 'but it must be one tap away');
    });

    test('the card renders nothing at all when the round has no skins money', () => {
        const b = boot({ buyIn: 0 });
        b.run(`currentData.additionalGames = {}; currentData.gameFormat = 'match'; currentData.skinsBuyIn = 0;`);
        b.render();
        assert.equal(b.html(), '', 'A round with no skins must not grow a skins card.');
    });
});

describe('THE EXPANDED LEDGER', () => {

    test('every hole gets a row, and each row says which state it is in', () => {
        const b = boot({ holes: 4, thru: { 1: 4, 2: 4, 3: 3 }, spec: { p101_h1: 3, p105_h2: 3 } });
        b.run('liveSkinsOpen = true;');
        b.render();
        const h = b.html();
        assert.match(h, /H1 \u2014 Avery \u2014 Net 3 \u2014 Skin/);
        assert.match(h, /H3 \u2014 Tie at Net \d+ \u2014 No Skin/);
        assert.match(h, /H4 \u2014 Waiting on Group 3/);
    });

    test('a tie names the score, so nobody reaches for the paper card', () => {
        const b = boot({ holes: 2 });
        b.run('liveSkinsOpen = true;');
        b.render();
        assert.match(b.html(), /Tie at Net \d+ \u2014 No Skin/,
            '"Tie" alone forces a golfer back to the scorecard to find out why.');
    });

    test('a carried hole shows how many skins it was worth', () => {
        const b = boot({ holes: 3, carry: true, spec: { p101_h2: 3 } });
        b.run('liveSkinsOpen = true;');
        b.render();
        assert.match(b.html(), /H2 \u2014 Avery \u2014 Net 3 \u2014 Skin \(2 skins\)/,
            'H1 tied and carried into H2.');
    });

    test('a carry hole whose value depends on an unresolved hole says value pending', () => {
        // The winner is known; what it is WORTH is not. Printing a number here
        // would overstate the payout.
        const b = boot({ holes: 3, carry: true, thru: { 1: 3, 2: 3, 3: 3 }, spec: { p101_h3: 2 } });
        b.run(`delete currentData.scores.p109_h2; delete currentData.scores.p110_h2;
               delete currentData.scores.p111_h2; delete currentData.scores.p112_h2;
               liveSkinsOpen = true;`);
        b.render();
        const h = b.html();
        assert.match(h, /H3 \u2014 Avery/, 'the winner is knowable');
        assert.match(h, /value pending/, 'its value is not');
    });

    test('toggling opens and closes it', () => {
        const b = boot({ holes: 4, spec: { p101_h1: 3 } });
        b.render();
        assert.ok(!/ls-ledger/.test(b.html()));
        b.run('toggleLiveSkins();');
        assert.ok(/ls-ledger/.test(b.html()));
        b.run('toggleLiveSkins();');
        assert.ok(!/ls-ledger/.test(b.html()));
    });
});

describe('NEVER OVERSTATE — a waiting hole is never shown as decided', () => {

    test('a waiting hole names no winner anywhere in the card', () => {
        const b = boot({ holes: 4, thru: { 1: 4, 2: 4, 3: 3 }, spec: { p101_h4: 2 } });
        b.run('liveSkinsOpen = true;');
        b.render();
        const h = b.html();
        // Avery has the low score on H4, but group 3 has not played it.
        assert.match(h, /H4 \u2014 Waiting on Group 3/);
        assert.ok(!/H4 \u2014 Avery/.test(h), 'Showing a skin and then taking it away is worse than showing nothing.');
        assert.match(h, /Official thru 3/);
    });

    test('the card uses no word implying finality', () => {
        const b = boot({ thru: { 1: 14, 2: 14, 3: 13 } });
        b.render();
        assert.ok(!/\bFINAL\b/i.test(b.html()), 'Nothing is final until the round is.');
    });
});

describe('SCORE CORRECTIONS — the card moves with the score', () => {

    test('winner becomes a tie on re-render', () => {
        const b = boot({ holes: 3, spec: { p101_h1: 3 } });
        b.render();
        assert.match(b.html(), /Avery \u2014 1/);

        b.run(`currentData.scores.p102_h1 = 3;`);   // Blake matches
        b.render();
        const h = b.html();
        assert.ok(!/Avery \u2014 1/.test(h), 'The old winner must not survive the correction.');
        assert.match(h, /No skins won yet/);
    });

    test('a tie becomes a winner on re-render', () => {
        const b = boot({ holes: 3 });
        b.render();
        assert.match(b.html(), /No skins won yet/);

        b.run(`currentData.scores.p103_h1 = 2;`);
        b.render();
        assert.match(b.html(), /Casey \u2014 1/);
    });

    test('winner A becomes winner B, with no duplicate left behind', () => {
        const b = boot({ holes: 3, spec: { p101_h1: 3 } });
        b.render();
        assert.match(b.html(), /Avery \u2014 1/);

        b.run(`currentData.scores.p101_h1 = 5; currentData.scores.p102_h1 = 3;`);
        b.render();
        const h = b.html();
        assert.match(h, /Blake \u2014 1/);
        assert.ok(!/Avery/.test(h), 'Avery must not keep a skin he no longer owns.');
    });

    test('a late group posting resolves the waiting hole', () => {
        const b = boot({ holes: 4, thru: { 1: 4, 2: 4, 3: 3 }, spec: { p101_h4: 2 } });
        b.render();
        assert.match(b.html(), /H4 \u2014 Waiting on Group 3/);

        b.run(`[109,110,111,112].forEach(function (id) { currentData.scores['p' + id + '_h4'] = 4; });`);
        b.render();
        const h = b.html();
        assert.match(h, /Official thru 4/);
        assert.match(h, /Latest: H4 \u2014 Avery/);
        assert.ok(!/Waiting on/.test(h));
    });

    test('the card is re-rendered by the scorecard render path', () => {
        // The engine cannot go stale; only a missing re-render can. This is the
        // assertion that protects against that.
        const src = read('index.html');
        const at = src.indexOf('renderWhoAmI();');
        const block = src.slice(at, at + 220);
        assert.match(block, /renderLiveSkins\(\);/,
            'renderLiveSkins must run whenever the scorecard renders, or a correction leaves a stale card.');
    });
});

describe('NO DUPLICATE ARITHMETIC', () => {

    test('the presenter computes no skins logic of its own', () => {
        const src = read('index.html');
        const at = src.indexOf('function renderLiveSkins');
        const fn = src.slice(at, src.indexOf('\n    }', src.indexOf('mount.innerHTML = \'<div class="live-skins"')));
        assert.match(fn, /computeSkinsHoleLedger\(/, 'It must consume the canonical ledger.');
        assert.doesNotMatch(fn, /getStrokes\(/, 'No second handicap calculator.');
        assert.doesNotMatch(fn, /Math\.min\(/, 'No second low-score calculator.');
        assert.doesNotMatch(fn, /computeSkinsCarryOverForSettle|computeSkinsVoidForSettle/,
            'It must go through the ledger, not reach past it into the resolvers.');
    });

    test('it degrades quietly if the engine is unavailable', () => {
        // pwa/offline conditions can leave a script unloaded. A missing engine must
        // cost the card, never the scorecard.
        const src = read('index.html');
        const fn = src.slice(src.indexOf('function renderLiveSkins'), src.indexOf('function renderLiveSkins') + 900);
        assert.match(fn, /typeof computeSkinsHoleLedger !== 'function'/);
        assert.match(src.slice(src.indexOf('function renderLiveSkins')), /catch \(e\) \{/);
    });

    test('it sits below score entry and navigation, not above', () => {
        const src = read('index.html');
        const nav = src.indexOf('html += navRowHtml;');
        const mount = src.indexOf("html += '<div id=\"live-skins-mount\"></div>';");
        assert.ok(nav !== -1 && mount !== -1);
        assert.ok(mount > nav, 'Prev/Next must never be pushed below the live card.');
    });
});
