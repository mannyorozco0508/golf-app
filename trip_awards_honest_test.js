// ============================================================================
// TRIP AWARDS - THE FIVE MADE HONEST (2026-09-15)
//
// Three fixes to computeTripAwards / renderTripAwards / the recap card / the
// share text in trip.html. No engine, no new award.
//
// 1. TIES NAME EVERYBODY. `best` kept whoever it met first, so two golfers
//    with three birdies each meant one trophy on roster order, silently. Every
//    award now returns all golfers at the winning figure: "Ann A and Ben B —
//    3 birdies each"; four or more: "Marty, Scott, Randy and 8 more — 12
//    birdies each"; where each golfer's own hole or round matters it rides in
//    brackets: "Ann A (Hole 1, Par 4, shot 8, Day 1) and Ben B (…) — 4 over
//    each". One golfer tied with himself (two 9s on two days) is one golfer:
//    "Carp — Hole 5 (…) on Caledonia, and again Hole 5 (…) on True Blue".
// 2. SANDBAGGER KEEPS ITS NAME, SHOWS ITS NUMBER, NEEDS HANDICAPS. The card
//    printed name and title with nothing behind it; it now carries the
//    strokes like the text. And with a blank handicap parseHcp is scratch, so
//    the award crowned the best gross golfer - the opposite of the joke. Now a
//    golfer's round counts only when that round carries a handicap for them;
//    a golfer with none anywhere is left out and named; fewer than two
//    eligible golfers -> not awarded, and one plain line says why.
// 3. A ROUND STILL IN PLAY IS SAID SO. The awards read computeRoundSettlement
//    (v148) and the panel, the card and the text say which rounds are still in
//    play, in the money card's words. The money still counts, as the trip's does.
//
// PROVED THE v136-v148 WAY: trip_awards_honest_prev.fixture.json is the panel,
// the card and the share text at HEAD 261aa16 on the weekly two-round trip;
// today's text is that text with exactly the substitutions named below - and
// the FIRST of them is the bug itself: eleven golfers had twelve birdies each
// on that fixture and HEAD printed "Marty — 12 birdies".
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
const strip = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();   // the fixture's stripper
const tight = s => s.replace(/ ?\| ?/g, '|').replace(/\|+/g, '|');                              // bars without the whitespace beside them
const DEPS = ['money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js', 'score-marks.js'];
const CD = makeCourseData(18);

// hcps are stored AS GIVEN ('' stays blank - makePlayers would turn it into '0').
function round(label, names, hcps, scoreFn, thru = 18) {
    const P = makePlayers(names, hcps, 101); P.forEach((p, i) => { p.hcp = hcps[i]; });
    const scores = {};
    P.forEach((p, i) => CD.forEach(h => { if (h.hole <= thru) { const v = scoreFn(i, h); if (v) scores['p' + p.id + '_h' + h.hole] = v; } }));
    return { code: label.replace(/\W/g, ''), label, countsTowardTrip: true, data: { players: P, courseData: CD, scores, gameFormat: 'stroke', settlementMode: 'whole-dollar' } };
}
const par = (i, h) => h.par;
function boot(rounds, deps = DEPS, name = 'Truth Trip') {
    const sb = loadHtmlInlineScript('trip.html', deps);
    vm.runInContext(`tripData = { name: ${JSON.stringify(name)} }; cachedRoundResults = ${JSON.stringify(rounds)}; cachedCountedResults = cachedRoundResults;
        renderCumulativeLeaderboard(); renderTripMoneySettlement(); renderTripAwards(); openTripRecap();`, sb);
    return {
        sb,
        panel: () => strip(sb.document.getElementById('trip-awards').innerHTML),
        card: () => strip(sb.document.getElementById('trip-recap-card').innerHTML),
        share: () => String(vm.runInContext('buildShareRecapText()', sb)),
        awards: () => JSON.parse(vm.runInContext('JSON.stringify(cachedAwards)', sb)),
    };
}
const shareAwards = s => s.slice(s.indexOf('🏅 AWARDS')).split('\n').filter(l => l.trim() && !/^🔗/.test(l));

// ---------------------------------------------------------------------------
describe('THE BASELINE: the weekly trip at 261aa16, plus exactly the deliberate substitutions', () => {
    const prev = JSON.parse(read('trip_awards_honest_prev.fixture.json'));
    const b = boot(linkedRounds(), WEEKLY_DEPS, 'Myrtle Beach 2026');
    test('the fixture is the one captured at 261aa16, and it shows the bug: eleven golfers with 12 birdies each, one named', () => {
        assert.equal(sha8('trip_awards_honest_prev.fixture.json'), '8c266536');
        assert.equal(prev.capturedAt, '261aa16');
        assert.ok(prev.awards.includes('|Marty — 12 birdies|'));
        const counts = {}; linkedRounds().forEach(r => r.data.players.forEach(p => { counts[p.name] = (counts[p.name] || 0) + r.data.courseData.filter(h => r.data.scores['p' + p.id + '_h' + h.hole] === h.par - 1).length; }));
        assert.equal(Object.values(counts).filter(c => c === 12).length, 11, 'eleven golfers really had twelve');
    });
    test('panel: the old text with three substitutions (the tie named, the blow-up said twice, nothing else)', () => {
        const expected = prev.awards
            .replace('|Marty — 12 birdies|', '|Marty, Scott, Randy and 8 more — 12 birdies each|')
            .replace('|Carp — Hole 5 (Par 4, shot 9) on Caledonia|', '|Carp — Hole 5 (Par 4, shot 9) on Caledonia, and again Hole 5 (Par 4, shot 9) on True Blue|');
        assert.notEqual(expected, prev.awards); assert.equal(b.panel(), expected);
    });
    test('recap card: the tie, the blow-up twice, and the Sandbagger NUMBER - nothing else', () => {
        const expected = prev.recap
            .replace('|Marty| · Most Birdies (12)|', '|Marty, Scott, Randy and 8 more| · Most Birdies (12 each)|')
            .replace('|9 on a par 4 · Hole 5, Caledonia|', '|Hole 5 (Par 4, shot 9) on Caledonia, and again Hole 5 (Par 4, shot 9) on True Blue|')
            .replace('| · Sandbagger of the Week|', '| · Sandbagger of the Week|23 net strokes under par|');
        assert.notEqual(expected, prev.recap); assert.equal(b.card(), expected);
    });
    test('share text: the tie and the blow-up twice - the number was already there', () => {
        const expected = prev.share
            .replace('🐦 Most Birdies: Marty (12)', '🐦 Most Birdies: Marty, Scott, Randy and 8 more — 12 birdies each')
            .replace('💥 Biggest Blow-Up: Carp, Hole 5 on Caledonia (shot 9 on a Par 4)', '💥 Biggest Blow-Up: Carp — Hole 5 (Par 4, shot 9) on Caledonia, and again Hole 5 (Par 4, shot 9) on True Blue');
        assert.notEqual(expected, prev.share); assert.equal(b.share(), expected);
    });
});

// ---------------------------------------------------------------------------
describe('1. TIES NAME BOTH - on every award, on all three surfaces', () => {
    // Ann and Ben: three birdies each, an 8 each on hole 1, and the same one-stroke back nine; Cal pars.
    const b = boot([round('Day 1', ['Ann A', 'Ben B', 'Cal C'], ['0', '0', '0'], (i, h) => (i < 2 && [3, 6, 9].includes(h.hole)) ? h.par - 1 : (i < 2 && h.hole === 1 ? h.par + 4 : h.par))]);
    test('the panel names both, with "each", on birdies, blow-up and comeback', () => {
        const p = b.panel();
        assert.ok(p.includes('|Ann A and Ben B — 3 birdies each|'), p);
        assert.ok(p.includes('|Ann A (Hole 1, Par 4, shot 8, Day 1) and Ben B (Hole 1, Par 4, shot 8, Day 1) — 4 over each|'), p);
        assert.ok(p.includes('|Ann A (37 front, 36 back, Day 1) and Ben B (37 front, 36 back, Day 1) — 1 stroke better on the back each|'), p);
        assert.deepEqual(b.awards().mostBirdies.names, ['Ann A', 'Ben B']); assert.equal(b.awards().mostBirdies.tied, true);
    });
    test('the roster order does not decide: swapped, the same two are named', () => {
        const c = boot([round('Day 1', ['Ben B', 'Ann A', 'Cal C'], ['0', '0', '0'], (i, h) => (i < 2 && [3, 6, 9].includes(h.hole)) ? h.par - 1 : (i < 2 && h.hole === 1 ? h.par + 4 : h.par))]);
        assert.deepEqual(c.awards().mostBirdies.names.slice().sort(), ['Ann A', 'Ben B']);
        assert.ok(tight(c.panel()).includes('|Ben B and Ann A — 3 birdies each|'));
    });
    test('the card and the share text carry the same figures', () => {
        assert.ok(tight(b.card()).includes('|Ann A and Ben B|· Most Birdies (3 each)|'), b.card());
        assert.ok(tight(b.card()).includes('|· Biggest Blow-Up|Ann A (Hole 1, Par 4, shot 8, Day 1) and Ben B (Hole 1, Par 4, shot 8, Day 1) — 4 over each|'), b.card());
        assert.deepEqual(shareAwards(b.share()).slice(0, 4), ['🏅 AWARDS', '🐦 Most Birdies: Ann A and Ben B — 3 birdies each', '💥 Biggest Blow-Up: Ann A (Hole 1, Par 4, shot 8, Day 1) and Ben B (Hole 1, Par 4, shot 8, Day 1) — 4 over each', '📈 Best Comeback: Ann A (37 front, 36 back, Day 1) and Ben B (37 front, 36 back, Day 1) — 1 stroke better on the back each']);
    });
    test('three tie: "Ann A, Ben B and Cal C — 2 birdies each"; four or more: "… and N more"', () => {
        const three = boot([round('Day 1', ['Ann A', 'Ben B', 'Cal C'], ['0', '0', '0'], (i, h) => [3, 6].includes(h.hole) ? h.par - 1 : h.par)]);
        assert.ok(tight(three.panel()).includes('|Ann A, Ben B and Cal C — 2 birdies each|'), three.panel());
        const five = boot([round('Day 1', ['Ann A', 'Ben B', 'Cal C', 'Dee D', 'Eli E'], ['0', '0', '0', '0', '0'], (i, h) => h.hole === 3 ? h.par - 1 : h.par)]);
        assert.ok(tight(five.panel()).includes('|Ann A, Ben B, Cal C and 2 more — 1 birdie each|'), five.panel());
        assert.equal(five.awards().mostBirdies.names.length, 5);
    });
    test('an eagle each: both named with their hole; a Sandbagger tie says "each"', () => {
        const e = boot([round('Day 1', ['Ann A', 'Ben B'], ['9', '9'], (i, h) => (i === 0 && h.hole === 4) || (i === 1 && h.hole === 13) ? h.par - 2 : h.par)]);
        assert.ok(tight(e.panel()).includes('|Ann A (Hole 4 on Day 1) and Ben B (Hole 13 on Day 1) — an eagle each|'), e.panel());
        assert.ok(tight(e.panel()).includes('|Ann A and Ben B — 11 net strokes under par each|'), e.panel());
        assert.ok(tight(e.card()).includes('|· Sandbagger of the Week|11 net strokes under par each|'));
        assert.ok(e.share().includes('🎭 Sandbagger of the Week: Ann A and Ben B (11 net strokes under par each)'));
    });
    test('one golfer tied with himself is one golfer: "…, and again …"', () => {
        const c = boot([round('Day 1', ['Ann A', 'Ben B'], ['0', '0'], (i, h) => i === 0 && h.hole === 2 ? h.par + 3 : h.par), round('Day 2', ['Ann A', 'Ben B'], ['0', '0'], (i, h) => i === 0 && h.hole === 7 ? h.par + 3 : h.par)]);
        const a = c.awards().blowUp;
        assert.equal(a.tied, false); assert.deepEqual(a.names, ['Ann A']); assert.equal(a.entries.length, 2);
        assert.ok(tight(c.panel()).includes('|Ann A — Hole 2 (Par 4, shot 7) on Day 1, and again Hole 7 (Par 3, shot 6) on Day 2|'), c.panel());
        assert.ok(tight(c.card()).includes('|Ann A|· Biggest Blow-Up|Hole 2 (Par 4, shot 7) on Day 1, and again Hole 7 (Par 3, shot 6) on Day 2|'), c.card());
    });
});

// ---------------------------------------------------------------------------
describe('2. SANDBAGGER: its number on the card, and no award without handicaps', () => {
    test('no handicaps anywhere (the Monday game): not awarded, one plain line, nothing on the card or the text', () => {
        const b = boot([round('Day 1', ['Ann A', 'Ben B'], ['', ''], (i, h) => i === 0 && h.hole % 3 === 0 ? h.par - 1 : h.par)]);
        assert.ok(tight(b.panel()).includes('|🎭 Sandbagger of the Week|not awarded: no handicaps were entered on this trip, so there is no net score to compare.|'), b.panel());
        assert.equal(b.awards().sandbagger, null);
        assert.ok(!/Sandbagger/.test(b.card())); assert.ok(!/Sandbagger/.test(b.share()));
        assert.ok(tight(b.panel()).includes('|Ann A — 6 birdies|'), 'the birdies still count - only the net award needs a handicap');
    });
    test('one golfer with a handicap: nobody to compare against', () => {
        const b = boot([round('Day 1', ['Ann A', 'Ben B'], ['9', ''], par)]);
        assert.ok(tight(b.panel()).includes('|not awarded: only Ann A entered a handicap, so there is nobody to compare against.|'), b.panel());
        assert.equal(b.awards().sandbagger, null);
    });
    test('mixed: compared among golfers with a handicap; the others named as left out - on all three surfaces', () => {
        const b = boot([round('Day 1', ['Ann A', 'Ben B', 'Cal C', 'Dee D'], ['9', '12', '', ''], (i, h) => i === 2 && h.hole % 2 === 0 ? h.par - 1 : h.par)]);
        const a = b.awards().sandbagger;
        assert.equal(a.name, 'Ben B'); assert.equal(a.netToPar, -12);
        assert.deepEqual(b.awards().leftOut, ['Cal C', 'Dee D']);
        assert.ok(tight(b.panel()).includes('|Ben B — 12 net strokes under par for the trip|compared only golfers who entered a handicap — Cal C and Dee D were left out.|'), b.panel());
        assert.ok(tight(b.card()).includes('|Ben B|· Sandbagger of the Week|12 net strokes under par · compared only golfers who entered a handicap — Cal C and Dee D were left out.|'), b.card());
        assert.ok(b.share().includes('🎭 Sandbagger of the Week: Ben B (12 net strokes under par) — compared only golfers who entered a handicap — Cal C and Dee D were left out.'), b.share());
        assert.ok(!/Cal C —/.test(tight(b.panel()).slice(tight(b.panel()).indexOf('🎭'))), 'Cal, 9 gross birdies at scratch, is not the sandbagger');
    });
    test('a handicap on some rounds only: those rounds count, the blank one does not', () => {
        const b = boot([round('Day 1', ['Ann A', 'Ben B'], ['9', '12'], par), round('Day 2', ['Ann A', 'Ben B'], ['', '12'], par)]);
        const s = b.awards().sandbagger;
        assert.equal(s.name, 'Ben B'); assert.equal(s.netToPar, -24);
        const ann = s.entries.find(e => e.name === 'Ann A'); assert.equal(ann, undefined, 'Ann is not tied at -24: her blank day did not count as scratch');
        assert.deepEqual(b.awards().leftOut, [], 'Ann had a handicap on one round, so she is not "left out"');
    });
    test('handicaps everywhere: the award as before, and the card now carries the number', () => {
        const b = boot([round('Day 1', ['Ann A', 'Ben B'], ['9', '3'], par)]);
        assert.ok(tight(b.panel()).includes('|Ann A — 9 net strokes under par for the trip|'));
        assert.ok(tight(b.card()).includes('|Ann A|· Sandbagger of the Week|9 net strokes under par|'), b.card());
        assert.ok(b.share().includes('🎭 Sandbagger of the Week: Ann A (9 net strokes under par)'));
    });
    test('a plus handicap counts as a handicap; a word does not', () => {
        const b = boot([round('Day 1', ['Ann A', 'Ben B'], ['+2', 'scratch'], par)]);
        assert.ok(tight(b.panel()).includes('|not awarded: only Ann A entered a handicap'), b.panel());
    });
});

// ---------------------------------------------------------------------------
describe('3. A ROUND STILL IN PLAY IS SAID SO', () => {
    const b = boot([round('Day 1', ['Ann A', 'Dee D'], ['0', '0'], (i, h) => i === 0 && h.hole === 3 ? h.par - 1 : h.par), round('Day 2', ['Ann A', 'Dee D'], ['0', '0'], (i, h) => i === 0 && h.hole === 5 ? h.par - 1 : h.par, 9)]);
    test('the panel leads with the round, in the trip\'s words; the birdie so far still counts', () => {
        assert.match(tight(b.panel()), /^\|⏳ So far — Day 2 is still in play\. Awards count what has been scored so far\.\|/);
        assert.ok(tight(b.panel()).includes('|Ann A — 2 birdies|'), 'Day 2\'s birdie counts, as its money does');
        assert.deepEqual(b.awards().inPlay, [{ label: 'Day 2', started: true, thru: 9, left: 2 }]);
    });
    test('the card and the share text say it too', () => {
        assert.ok(tight(b.card()).includes('|🏅 AWARDS|So far — Day 2 is still in play.|🐦|'), b.card());
        assert.deepEqual(shareAwards(b.share()).slice(0, 3), ['🏅 AWARDS', 'So far — Day 2 is still in play.', '🐦 Most Birdies: Ann A (2)']);
    });
    test('a round nobody has started: "has not started"; two rounds: both named', () => {
        const c = boot([round('Day 1', ['Ann A'], ['0'], (i, h) => h.hole === 3 ? h.par - 1 : h.par), round('Day 2', ['Ann A'], ['0'], par, 0), round('Day 3', ['Ann A'], ['0'], par, 12)]);
        assert.match(tight(c.panel()), /^\|⏳ So far — Day 3 is still in play; Day 2 has not started\. Awards count/);
    });
    test('every round finished: no marker anywhere', () => {
        const c = boot([round('Day 1', ['Ann A', 'Dee D'], ['0', '0'], (i, h) => i === 0 && h.hole === 3 ? h.par - 1 : h.par)]);
        assert.ok(!/So far/.test(c.panel())); assert.ok(!/So far/.test(c.card())); assert.ok(!/So far/.test(c.share()));
        assert.deepEqual(c.awards().inPlay, []);
    });
    test('a verified round with a golfer who left after nine is finished, and not marked', () => {
        const r = round('Day 1', ['Ann A', 'Dee D'], ['0', '0'], par); r.data.scores = Object.fromEntries(Object.entries(r.data.scores).filter(([k]) => !/^p102_h1[0-8]$/.test(k))); r.data.scoresVerified = { verified: true, verifiedAt: 1, verifiedBy: 'round' };
        assert.deepEqual(boot([r]).awards().inPlay, []);
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAMS (source, comments stripped)', () => {
    const code = stripComments(read('trip.html'));
    test('best-by-first-encountered is gone; winners keeps everyone at the top value; names are de-duplicated', () => {
        assert.ok(!/const best = \(bag, better\)/.test(code), 'the first-encountered picker is gone');
        assert.match(code, /return ok\.filter\(e => value\(e\) === value\(top\)\);/);
        assert.match(code, /w\.forEach\(e => \{ if \(!names\.includes\(e\.name\)\) names\.push\(e\.name\); \}\);/);
        assert.match(code, /function joinNames\(names, cap\)/);
    });
    test('sandbagger sums only rounds with a handicap, needs two golfers, and names the left-out', () => {
        assert.match(code, /if \(withHcp\) \{\s*const strokes = getStrokes\(h\.hcpIndex, parseHcp\(p\.hcp\)\);/);
        assert.match(code, /if \(eligible === 0\) \{/); assert.match(code, /\} else if \(eligible === 1\) \{/);
        assert.match(code, /function hasHandicap\(p\)/);
    });
    test('the in-play marker reads the engine\'s predicate and the three surfaces share one sentence builder', () => {
        assert.match(code, /const s = computeRoundSettlement\(data, data\.courseData \|\| \[\], data\.scores \|\| \{\}\);\s*if \(!s\.finished\) out\.push/);
        assert.equal((code.match(/awardsInPlaySentence\(/g) || []).length, 4, 'one definition + panel + card + text');
    });
    test('the card carries the Sandbagger number', () => {
        assert.match(code, /Sandbagger of the Week<br>'\s*\+ '<span class="rc-detail">' \+ Math\.abs\(a\.sandbagger\.netToPar\)/);
    });
});
