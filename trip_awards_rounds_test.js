// ============================================================================
// ROUNDS PLAYED BESIDE THE COUNTED AWARDS (2026-09-16)
//
// A count favours whoever played more days. The suffix does not change the
// winner; it says how many rounds the number came from, so a one-day golfer
// is visibly one day, not silently beaten:
//   "Marty — 12 birdies over 4 rounds"        "Cal C — 3 birdies in 1 round"
//   same-count tie   "Ann A and Ben B — 3 birdies each over 4 rounds"
//   mixed-count tie  "Ann A (4 rounds) and Cal C (1 round) — 3 birdies each"
// On Most Birdies (rounds the golfer scored in) and Sandbagger (rounds that
// carried a handicap for them - the rounds its number is made of) ONLY.
// Eagle stays bare in every form - "2 eagles over 4 rounds" reads as an
// excuse for a rare thing, and its one-eagle form names a hole; Blow-Up and
// Comeback are one hole and one round. On a ONE-ROUND TRIP no suffix at all:
// everybody played at most one, so "in 1 round" says nothing.
// The card spells "birdies" beside a suffix - "(12 over 4 rounds)" would read
// as twelve over par - and the text follows the panel.
//
// PROVED THE USUAL WAY: trip_awards_rounds_prev.fixture.json is the three
// surfaces at 2f78cef (v154) on the weekly two-round trip; today's text is that
// text with exactly the suffix substitutions named below.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');
const { linkedRounds, DEPS: WEEKLY_DEPS } = require('./helpers/trip-weekly-rounds.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha8 = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO_ROOT, f))).digest('hex').slice(0, 8);
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');
const strip = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const tight = s => s.replace(/ ?\| ?/g, '|').replace(/\|+/g, '|');
const DEPS = ['money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js', 'score-marks.js'];
const CD = makeCourseData(18);

function round(label, names, hcps, scoreFn) {
    const P = makePlayers(names, hcps, 101); P.forEach((p, i) => { p.hcp = hcps[i]; });
    const scores = {}; P.forEach((p, i) => CD.forEach(h => { const v = scoreFn(i, h); if (v) scores['p' + p.id + '_h' + h.hole] = v; }));
    return { code: label.replace(/\W/g, ''), label, countsTowardTrip: true, data: { players: P, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar' } };
}
const par = (i, h) => h.par;
function boot(rounds, deps = DEPS, name = 'Truth Trip') {
    const sb = loadHtmlInlineScript('trip.html', deps);
    vm.runInContext(`tripData = { name: ${JSON.stringify(name)} }; cachedRoundResults = ${JSON.stringify(rounds)}; cachedCountedResults = cachedRoundResults;
        renderCumulativeLeaderboard(); renderTripMoneySettlement(); renderTripAwards(); openTripRecap();`, sb);
    return {
        panel: () => tight(strip(sb.document.getElementById('trip-awards').innerHTML)),
        card: () => tight(strip(sb.document.getElementById('trip-recap-card').innerHTML)),
        panel0: () => strip(sb.document.getElementById('trip-awards').innerHTML),
        card0: () => strip(sb.document.getElementById('trip-recap-card').innerHTML),
        share: () => String(vm.runInContext('buildShareRecapText()', sb)),
        awards: () => JSON.parse(vm.runInContext('JSON.stringify(cachedAwards)', sb)),
        line: re => (String(vm.runInContext('buildShareRecapText()', sb)).split('\n').find(l => re.test(l)) || ''),
    };
}
// Four days; Ann plays all four, Cal only Day 1. `birdies(i, day)` -> holes birdied.
const four = (birdies, hcps = ['9', '9']) => [1, 2, 3, 4].map(n => round('Day ' + n, n === 1 ? ['Ann A', 'Cal C'] : ['Ann A'], hcps, (i, h) => (birdies(i, n) || []).includes(h.hole) ? h.par - 1 : h.par));

describe('THE BASELINE: v154 plus exactly the suffix', () => {
    const prev = JSON.parse(read('trip_awards_rounds_prev.fixture.json'));
    const b = boot(linkedRounds(), WEEKLY_DEPS, 'Myrtle Beach 2026');
    test('the fixture is the one captured at 2f78cef', () => { assert.equal(sha8('trip_awards_rounds_prev.fixture.json'), '2b0a5379'); assert.equal(prev.capturedAt, '2f78cef'); });
    test('panel: two substitutions - the birdie tie and the Sandbagger gain "over 2 rounds"; the Eagle, Blow-Up and Comeback lines do not move', () => {
        const expected = prev.awards
            .replace('— 12 birdies each|', '— 12 birdies each over 2 rounds|')
            .replace('— 23 net strokes under par for the trip|', '— 23 net strokes under par over 2 rounds|');
        assert.notEqual(expected, prev.awards); assert.equal(b.panel0(), expected);
    });
    test('card: "(12 each)" -> "(12 birdies each over 2 rounds)", the Sandbagger detail gains the suffix', () => {
        const expected = prev.recap.replace('· Most Birdies (12 each)|', '· Most Birdies (12 birdies each over 2 rounds)|').replace('|23 net strokes under par|', '|23 net strokes under par over 2 rounds|');
        assert.notEqual(expected, prev.recap); assert.equal(b.card0(), expected);
    });
    test('share text: the same two', () => {
        const expected = prev.share.replace('— 12 birdies each\n', '— 12 birdies each over 2 rounds\n').replace('(23 net strokes under par)', '(23 net strokes under par over 2 rounds)');
        assert.notEqual(expected, prev.share); assert.equal(b.share(), expected);
    });
});

describe('THE SUFFIX on Most Birdies and Sandbagger', () => {
    test('a single winner over four rounds: "over 4 rounds" on panel, card and text', () => {
        const b = boot(four((i, n) => i === 0 ? [5] : []));
        assert.ok(b.panel().includes('|Ann A — 4 birdies over 4 rounds|'), b.panel());
        assert.ok(b.card().includes('|Ann A|· Most Birdies (4 birdies over 4 rounds)|'), b.card());
        assert.equal(b.line(/Most Birdies/), '🐦 Most Birdies: Ann A (4 birdies over 4 rounds)');
        assert.ok(b.panel().includes('|Ann A — 40 net strokes under par over 4 rounds|'), b.panel());
        assert.ok(b.card().includes('|Ann A|· Sandbagger of the Week|40 net strokes under par over 4 rounds|'), b.card());
        assert.equal(b.line(/Sandbagger/), '🎭 Sandbagger of the Week: Ann A (40 net strokes under par over 4 rounds)');
        assert.equal(b.awards().mostBirdies.entries[0].rounds, 4); assert.equal(b.awards().roundCount, 4);
    });
    test('a single winner in one round of four: "in 1 round" - the one-day golfer is visibly one day', () => {
        const b = boot(four((i, n) => i === 1 ? [2, 4, 7] : []));
        assert.ok(b.panel().includes('|Cal C — 3 birdies in 1 round|'), b.panel());
        assert.ok(b.card().includes('|Cal C|· Most Birdies (3 birdies in 1 round)|'), b.card());
        assert.equal(b.line(/Most Birdies/), '🐦 Most Birdies: Cal C (3 birdies in 1 round)');
        assert.equal(b.awards().mostBirdies.entries[0].rounds, 1);
    });
    test('a same-count tie collapses: "… each over 4 rounds"', () => {
        const b = boot([1, 2, 3, 4].map(n => round('Day ' + n, ['Ann A', 'Ben B'], ['9', '9'], (i, h) => h.hole === 5 ? h.par - 1 : h.par)));
        assert.ok(b.panel().includes('|Ann A and Ben B — 4 birdies each over 4 rounds|'), b.panel());
        assert.ok(b.card().includes('|Ann A and Ben B|· Most Birdies (4 birdies each over 4 rounds)|'), b.card());
        assert.equal(b.line(/Most Birdies/), '🐦 Most Birdies: Ann A and Ben B — 4 birdies each over 4 rounds');
        assert.ok(b.panel().includes('|Ann A and Ben B — 40 net strokes under par each over 4 rounds|'));
        assert.equal(b.line(/Sandbagger/), '🎭 Sandbagger of the Week: Ann A and Ben B — 40 net strokes under par each over 4 rounds');
    });
    test('a mixed-count tie: each name carries its own rounds in brackets, no trailing suffix', () => {
        const b = boot(four((i, n) => (i === 0 && n <= 3) ? [5] : (i === 1 ? [2, 4, 7] : [])));
        assert.ok(b.panel().includes('|Ann A (4 rounds) and Cal C (1 round) — 3 birdies each|'), b.panel());
        assert.ok(b.card().includes('|Ann A (4 rounds) and Cal C (1 round)|· Most Birdies (3 each)|'), b.card());
        assert.equal(b.line(/Most Birdies/), '🐦 Most Birdies: Ann A (4 rounds) and Cal C (1 round) — 3 birdies each');
        const a = b.awards().mostBirdies; assert.deepEqual(a.entries.map(e => [e.name, e.rounds]), [['Ann A', 4], ['Cal C', 1]]);
    });
    test('Sandbagger mixed-count tie: the rounds are the ones that carried a handicap', () => {
        const b = boot([round('Day 1', ['Ann A', 'Ben B'], ['18', '9'], par), round('Day 2', ['Ann A', 'Ben B'], ['', '9'], par)]);
        assert.ok(b.panel().includes('|Ann A (1 round) and Ben B (2 rounds) — 18 net strokes under par each|'), b.panel());
        assert.ok(b.card().includes('|Ann A (1 round) and Ben B (2 rounds)|· Sandbagger of the Week|18 net strokes under par each|'), b.card());
        assert.equal(b.line(/Sandbagger/), '🎭 Sandbagger of the Week: Ann A (1 round) and Ben B (2 rounds) — 18 net strokes under par each');
    });
    test('a one-round trip: no suffix anywhere, the old lines exactly', () => {
        const b = boot([round('Day 1', ['Ann A', 'Ben B'], ['9', '9'], (i, h) => i === 0 && [2, 4, 7].includes(h.hole) ? h.par - 1 : h.par)]);
        assert.ok(b.panel().includes('|Ann A — 3 birdies|'), b.panel()); assert.ok(b.panel().includes('|Ann A — 12 net strokes under par for the trip|'));
        assert.ok(b.card().includes('|Ann A|· Most Birdies (3)|')); assert.ok(b.card().includes('|Ann A|· Sandbagger of the Week|12 net strokes under par|'));
        assert.equal(b.line(/Most Birdies/), '🐦 Most Birdies: Ann A (3)'); assert.equal(b.line(/Sandbagger/), '🎭 Sandbagger of the Week: Ann A (12 net strokes under par)');
        assert.ok(!/round/.test(b.panel().slice(b.panel().indexOf('🐦'))), 'no "round" word in the awards');
    });
    test('the count is the rounds the golfer SCORED in, not the rounds with a birdie', () => {
        const b = boot(four((i, n) => (i === 0 && n === 2) ? [5, 7] : []));
        assert.ok(b.panel().includes('|Ann A — 2 birdies over 4 rounds|'), b.panel());
    });
});

describe('SINGLE-EVENT AWARDS STAY BARE', () => {
    test('two eagles over two rounds: "Ann A — 2 eagles", no suffix; blow-up and comeback carry none either', () => {
        const b = boot([round('Day 1', ['Ann A', 'Ben B'], ['9', '9'], (i, h) => i === 0 && h.hole === 4 ? h.par - 2 : (i === 1 && h.hole === 1 ? h.par + 3 : h.par)), round('Day 2', ['Ann A', 'Ben B'], ['9', '9'], (i, h) => i === 0 && h.hole === 13 ? h.par - 2 : h.par)]);
        const p = b.panel();
        assert.ok(p.includes('|Ann A — 2 eagles|'), p);
        assert.ok(p.includes('|Ben B — Hole 1 (Par 4, shot 7) on Day 1|'), p);
        ['Eagle of the Trip', 'Biggest Blow-Up Hole', 'Best Comeback'].forEach(t => { const i = p.indexOf(t); if (i >= 0) assert.ok(!/ over \d+ rounds| in 1 round/.test(p.slice(i, p.indexOf('|', p.indexOf('|', i + t.length) + 1))), t + ' carries a suffix'); });
        assert.ok(!/Eagle of the Trip: Ann A.*round/.test(b.share()));
    });
});

describe('THE SEAMS', () => {
    const code = stripComments(read('trip.html'));
    test('roundsSuffix is empty on a one-round trip, null on a mixed-count tie, and applied to birdies and sandbagger only', () => {
        assert.match(code, /function roundsSuffix\(a\) \{\s*if \(!a \|\| !\(a\.roundCount > 1\) \|\| !a\.entries \|\| !a\.entries\.length\) return '';/);
        assert.match(code, /if \(!counts\.every\(c => c === counts\[0\]\)\) return null;/);
        assert.match(code, /\[mostBirdies, sandbagger\]\.forEach\(a => \{ if \(a\) a\.roundCount = results\.length; \}\);/);
        assert.equal((code.match(/roundsSuffix\(a\.mostBirdies\)|roundsSuffix\(a\.sandbagger\)|roundsSuffix\(a\)/g) || []).length >= 6, true);
        assert.ok(!/roundsSuffix\(a\.mostEagles\)|roundsSuffix\(a\.blowUp\)|roundsSuffix\(a\.comeback\)/.test(code), 'no suffix on a single-event award');
    });
    test('rounds played = rounds scored in; birdie entries carry it', () => {
        assert.match(code, /if \(played\) \{ if \(!playedRounds\[key\]\) playedRounds\[key\] = new Set\(\); playedRounds\[key\]\.add\(label\); \}/);
        assert.match(code, /birdieCounts\[k\]\.rounds = playedRounds\[k\] \? playedRounds\[k\]\.size : 0;/);
    });
});
