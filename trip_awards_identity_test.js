// ============================================================================
// AWARDS PUT A NAME ON THE SCREEN PEOPLE SCREENSHOT
//
// The trip recap exists to be pasted into a group chat. Everything on it is read
// by twelve people who were there, so a wrong name is not a rounding error - it is
// an accusation, a credit, or a joke about the wrong man.
//
// FOUR DEFECTS, all measured in Chrome before any of this was written.
//
// 1. LITERAL ESCAPES ON THE MOST-SCREENSHOTTED SCREEN. The recap bar rendered
//    "Screenshot this \u2014 or use Share below" and its share button read
//    "\uD83D\uDCE4 Share as Text". A \uXXXX sequence resolves inside a JS string
//    and prints literally in raw HTML markup. This is the THIRD time this class
//    has shipped, so it is now guarded across every page rather than at the two
//    places it happened to be found.
//
// 2. TWO GOLFERS THE AWARDS COULD NOT TELL APART. Two Mikes on Day 1 produced
//    "Most Birdies: Mike Dunne - 5", which is 3 + 2: two different men's birdies
//    added together and awarded to one name. The trip MONEY already refuses this
//    through tripIdentityProblems(); renderTripAwards() never called it. Same
//    wrong, same treatment - refuse, name the problem, name the fix, guess nothing.
//
// 3. A PAR CROWNED AS THE BIGGEST BLOW-UP. `blowUp` began null and took the first
//    hole through `diff > blowUp.diff`, with nothing requiring diff > 0. On a round
//    where nobody went over par it printed "Hole 2 (Par 4, shot 4)".
//
// 4. THE FIFTH COPY OF A NAME RULE. Awards keyed on raw p.name while the
//    leaderboard, the money and the placeholder warning all key on the shared
//    normaliser. "Marty" and "marty " split here and merged everywhere else.
//
// AND EAGLES NOW HAVE THEIR OWN LINE. Only diff === -1 was counted, so an eagle
// earned nothing anywhere. Folding it into "Most Birdies" would make that label
// untrue and counting it twice would make the number a count of nothing.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const DEPS = ['money-engine.js', 'action-model.js', 'settlement-engine.js',
              'pool-engine.js', 'score-marks.js'];
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

// Everybody pars everything unless a tweak says otherwise, so each test creates
// exactly the one thing it is about and nothing else can win an award by accident.
function roundOf(label, names, tweak) {
    const players = names.map((n, i) => ({ id: 101 + i, name: n, hcp: '0' }));
    const scores = {};
    players.forEach(p => cd18.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4; }));
    if (tweak) tweak(players, scores);
    return { eventName: label, roundDay: label, courseName: 'Caledonia',
             gameFormat: 'stroke', courseData: cd18, players, scores };
}

function trip(rounds) {
    const sb = loadHtmlInlineScript('trip.html', DEPS);
    // The label lives on the LINK, not on the round - roundOf() sets eventName and
    // roundDay. An earlier draft read r.label and got undefined, which showed up as
    // a missing round name in the blow-up award and looked like an app defect.
    const linked = rounds.map(r => ({ label: r.eventName, countsTowardTrip: true, data: r }));
    vm.runInContext(`
        tripData = { name: 'Myrtle Beach 2026' };
        cachedRoundResults = ${JSON.stringify(linked)};
        cachedCountedResults = cachedRoundResults;
        window.__alerts = []; alert = m => window.__alerts.push(String(m));
        renderTripAwards();
    `, sb);
    return {
        sb,
        run: c => vm.runInContext(c, sb),
        awards: () => strip(sb.document.getElementById('trip-awards').innerHTML),
        cached: () => JSON.parse(vm.runInContext('JSON.stringify(cachedAwards || {})', sb)),
        recapText: () => String(vm.runInContext('buildShareRecapText()', sb)),
    };
}

const FOUR = ['Marty Sharp', 'Carp Dean', 'Lance Webb', 'Zach Hill'];

// ---------------------------------------------------------------------------
describe('1. NO RENDERED TEXT CONTAINS A LITERAL ESCAPE', () => {

    // SOURCE-LEVEL AND EVERY PAGE, because innerText cannot see an element that is
    // hidden - and the two that shipped were inside an overlay that opens on a tap.
    // A rendered-only scan would have walked straight past them.
    //
    // Script blocks, HTML comments and on* handler attributes are stripped first:
    // \uXXXX is legitimate JavaScript in all three, and counting those would fail
    // for the wrong reason on every page in the app.
    const PAGES = fs.readdirSync(REPO_ROOT).filter(f => f.endsWith('.html'));

    const renderedMarkup = src => src
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, ' ')
        .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, ' ');

    test('there is at least one page to check', () => {
        assert.ok(PAGES.length > 5, 'the page list is empty - this would pass on nothing');
    });

    PAGES.forEach(page => {
        test(page + ' has no \\uXXXX in anything it renders', () => {
            const hits = renderedMarkup(read(page)).match(/\\u[0-9A-Fa-f]{4}/g) || [];
            assert.deepEqual(hits, [],
                page + ' prints ' + JSON.stringify(hits.slice(0, 3))
                + ' literally - a \\uXXXX escape only resolves inside a JS string');
        });
    });

    test('the two that shipped are named, so this cannot silently stop covering them', () => {
        const t = read('trip.html');
        assert.ok(!/Screenshot this \\u2014/.test(t), 'the recap bar still prints an escape');
        assert.ok(!/\\uD83D\\uDCE4 Share as Text/.test(t), 'the share button still prints one');
    });
});

// ---------------------------------------------------------------------------
describe('2. AWARDS REFUSE TWO GOLFERS THEY CANNOT TELL APART', () => {

    const twoMikes = () => trip([
        roundOf('Day 1', ['Mike Dunne', 'Mike Dunne', 'Lance Webb', 'Zach Hill'],
            (pl, s) => { [1, 3, 5].forEach(h => s['p101_h' + h] = 3);
                         [2, 4].forEach(h => s['p102_h' + h] = 3); }),
        roundOf('Day 2', FOUR, (pl, s) => { s['p101_h1'] = 3; })
    ]);

    test('THE REPORTED DEFECT: it does not merge their birdies', () => {
        const t = twoMikes();
        assert.ok(!/Mike Dunne\s*[—-]\s*5 birdies/i.test(t.awards()),
            'two men\u2019s birdies were added together: ' + t.awards());
    });

    test('it refuses outright rather than showing a smaller wrong number', () => {
        const a = twoMikes().awards();
        assert.match(a, /Mike Dunne/, 'the refusal does not name the golfer in question');
        assert.match(a, /rename/i, 'it does not say what to do about it');
        assert.ok(!/Most Birdies/i.test(a), 'it awarded something anyway');
    });

    test('and the refusal reaches the recap, which is the thing people paste', () => {
        const t = twoMikes();
        assert.deepEqual(t.cached(), {},
            'the recap would still print the merged award from cachedAwards');
        assert.ok(!/AWARDS/.test(t.recapText()),
            'a merged name goes into the group chat: ' + t.recapText());
    });

    test('a placeholder across rounds is refused for the same reason', () => {
        const t = trip([
            roundOf('Day 1', ['Player 1', 'Carp Dean', 'Lance Webb', 'Zach Hill'],
                (pl, s) => { s['p101_h1'] = 3; }),
            roundOf('Day 2', ['Player 1', 'Carp Dean', 'Lance Webb', 'Zach Hill'],
                (pl, s) => { s['p101_h2'] = 3; })
        ]);
        assert.ok(!/Most Birdies/i.test(t.awards()),
            '"Player 1" on two days was treated as one golfer: ' + t.awards());
    });

    // ONE DETECTOR, TWO SENTENCES. The refusal reused the MONEY wording - "their
    // money would be merged into one balance and somebody would pay the other
    // man's debts" - under an "Awards Not Shown" header. Both statements are true,
    // but a golfer reading that on the awards panel concludes his money is broken
    // too. The rule stays single; the copy is per surface.
    test('the awards refusal talks about awards, not about money', () => {
        const a = twoMikes().awards();
        assert.ok(!/money|balance|debts|pay/i.test(a),
            'the awards refusal tells a golfer his money is broken: ' + a);
        assert.match(a, /birdie|award/i, 'it does not say what is actually affected');
        assert.match(a, /rename/i, 'it still has to say what to do');
    });

    test('and the money refusal still talks about money', () => {
        const t = twoMikes();
        t.run('renderTripMoneySettlement();');
        const m = strip(t.sb.document.getElementById('trip-money-settlement').innerHTML);
        assert.match(m, /money|balance|debts|pay/i,
            'the money refusal lost the reason it exists: ' + m.slice(0, 200));
    });

    test('both sentences come from ONE detector, not two copies of the rule', () => {
        const src = read('trip.html').replace(/\/\/.*$/gm, '');
        assert.equal((src.match(/function tripIdentityProblems/g) || []).length, 1);
        // The awards panel must ASK the detector rather than re-deriving duplicates.
        const at = src.indexOf('function renderTripAwards');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.match(fn, /tripIdentityProblems\(/, 'awards re-derive the rule');
        assert.ok(!/normalisePlayerName\(/.test(fn),
            'the awards panel detects duplicates itself instead of asking');
    });

    // THE OTHER HALF. A refusal that fires on a clean trip is just a broken feature.
    test('a clean trip still gets its awards', () => {
        const t = trip([roundOf('Day 1', FOUR, (pl, s) => {
            [1, 3, 5].forEach(h => s['p101_h' + h] = 3);
            s['p102_h7'] = 11;
        })]);
        assert.match(t.awards(), /Most Birdies/i, 'a clean trip was refused: ' + t.awards());
        assert.match(t.awards(), /Marty Sharp/);
    });
});

// ---------------------------------------------------------------------------
describe('3. A PAR IS NOT A BLOW-UP', () => {

    test('THE REPORTED DEFECT: nobody over par crowns nobody', () => {
        const t = trip([roundOf('Day 1', FOUR)]);   // everybody pars everything
        assert.ok(!/Hole \d+ \(Par 4, shot 4\)/.test(t.awards()),
            'a par was named as the biggest blow-up: ' + t.awards());
        assert.equal(t.cached().blowUp, null,
            'the recap would still print a par as a blow-up');
    });

    test('and it says so rather than going quiet', () => {
        const t = trip([roundOf('Day 1', FOUR)]);
        assert.match(t.awards(), /nobody went over par/i,
            'the card simply omits the award with no explanation: ' + t.awards());
    });

    test('a bogey is not a blow-up either — the award means something', () => {
        const t = trip([roundOf('Day 1', FOUR, (pl, s) => { s['p102_h7'] = 5; })]);
        assert.ok(!/Biggest Blow-Up Hole\s*Carp/i.test(t.awards()),
            'one over par was crowned the biggest blow-up of the trip');
    });

    test('a real blow-up is still named, with the hole and the round', () => {
        const t = trip([roundOf('Day 1', FOUR, (pl, s) => { s['p102_h7'] = 11; })]);
        assert.match(t.awards(), /Carp Dean/);
        assert.match(t.awards(), /Hole 7/);
        assert.match(t.awards(), /Day 1/);
    });
});

// ---------------------------------------------------------------------------
describe('4. ONE NAME RULE, NOT A FIFTH COPY', () => {

    test('the same golfer typed two ways is one golfer', () => {
        const t = trip([
            roundOf('Day 1', ['Marty Sharp', 'Carp Dean', 'Lance Webb', 'Zach Hill'],
                (pl, s) => { [1, 3].forEach(h => s['p101_h' + h] = 3); }),
            roundOf('Day 2', ['marty sharp ', 'Carp Dean', 'Lance Webb', 'Zach Hill'],
                (pl, s) => { [1, 3, 5].forEach(h => s['p101_h' + h] = 3); })
        ]);
        assert.match(t.awards(), /5 birdies|Most Birdies/i);
        assert.equal((t.cached().mostBirdies || {}).count, 5,
            'the two spellings were counted as two golfers, so neither won');
    });

    test('it uses the shared normaliser, not a fifth hand-rolled copy', () => {
        const src = read('trip.html').replace(/\/\/.*$/gm, '');
        const at = src.indexOf('function computeTripAwards');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.match(fn, /normalisePlayerName\(/,
            'awards still key on a raw or hand-lowered name');
        assert.ok(!/\[p\.name\]/.test(fn), 'a raw p.name is still being used as a key');
    });
});

// ---------------------------------------------------------------------------
describe('5. AN EAGLE GETS ITS OWN LINE', () => {

    test('an eagle is counted, where before it was worth nothing anywhere', () => {
        const t = trip([roundOf('Day 1', FOUR, (pl, s) => { s['p101_h4'] = 2; })]);
        assert.match(t.awards(), /Eagle/i, 'an eagle earns nothing: ' + t.awards());
        assert.match(t.awards(), /Marty Sharp/);
    });

    test('it is NOT folded into Most Birdies, which would make that label untrue', () => {
        const t = trip([roundOf('Day 1', FOUR, (pl, s) => { s['p101_h4'] = 2; })]);
        assert.equal((t.cached().mostBirdies || {}).count, undefined,
            'an eagle was counted as a birdie');
    });

    test('no eagles means no eagle line — nothing is crowned at zero', () => {
        const t = trip([roundOf('Day 1', FOUR, (pl, s) => { s['p101_h4'] = 3; })]);
        assert.equal(t.cached().mostEagles, null);
        assert.ok(!/Eagle/i.test(t.awards()), 'an eagle line appeared with no eagles');
    });

    test('and it reaches both recap surfaces', () => {
        const t = trip([roundOf('Day 1', FOUR, (pl, s) => { s['p101_h4'] = 2; })]);
        assert.match(t.recapText(), /Eagle/i, 'the pasted recap drops the eagle');
        t.run('openTripRecap();');
        assert.match(strip(t.sb.document.getElementById('trip-recap-card').innerHTML), /Eagle/i,
            'the screenshot card drops the eagle');
    });
});
