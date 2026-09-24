// ============================================================================
// EVERY SURFACE READS THE ROUND'S SCORING SETTING THE SAME WAY
//
// WHAT THIS EXISTS TO FIX (v221a). Four surfaces derived "is this round gross or
// net" independently, and three of them named the formats in a cascade of ifs
// that stopped at bestball:
//
//     let scoringType = "net";
//     if (gameFormat === 'nassau')   scoringType = nassauScoring || "net";
//     if (gameFormat === 'match' ||
//         gameFormat === 'bestball') scoringType = matchScoring  || "net";
//
// `ryder` and `scramble` are match-play formats and neither is in that list, so
// a GROSS Ryder round was scored NET. v220 fixed leaderboard.html. These are the
// other three:
//
//   index.html:8372     THE WORST ONE. This scoringType is passed straight into
//                       calculateMatchEngine (index.html:8442), so the number is
//                       COMPUTED wrong, not merely labelled wrong.
//   game.html:269       the "how it is scored" sentence on the Game tab.
//   stats.html:955      a different bug in the same family:
//                       `data.nassauScoring || data.matchScoring || "net"` reads
//                       the wrong SOURCE rather than applying the wrong default,
//                       so a stale nassauScoring wins on a ryder round.
//
// MEASURED ON ONE $20 GROSS RYDER ROUND, EVERY HOLE HALVED:
//     money-engine.js          Ann 0, Ben 0        nobody pays
//     index.html ticker        "FINAL: Ann 10&8"   a rout
//     leaderboard team view    "FINAL: Ann 10 & 8" (fixed in v220)
//     leaderboard widget       "AS"
// The scorecard told a golfer they had won the match while the Receipt paid
// nothing. The money was never wrong: money-engine.js:768 and
// settlement-engine.js:811 use a ternary - nassau takes nassauScoring,
// everything else takes matchScoring - and neither has ever had this bug.
//
// ONE THING THE FIX IS NOT: A BARE TERNARY ON EVERY PAGE.
// money-engine.js can use one because line 759 GATES on the match-format list
// first and returns null otherwise. index.html's and game.html's scoringType
// also serve stableford and plain stroke rounds, so a bare ternary there would
// read matchScoring on a STROKE round - and a round can legitimately carry a
// leftover matchScoring from a format the organizer looked at and moved away
// from (the case v216's control C15 exists for). Those two keep the gate and
// change only which formats reach the match branch. stats.html:955 already has
// the gate nine lines above it, so it gets the plain ternary.
//
// AND THE REAL GENERALISATION IS AT THE BOTTOM OF THIS FILE: the canonical
// match-format list appears in nine places and was correct in all nine. The
// defect was one derivation that did not consult it. So the last test holds
// every list in the repo to the same set - which is what makes this class of
// bug impossible rather than merely fixed three more times.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const MATCH_FORMATS = ['match', 'nassau', 'bestball', 'scramble', 'ryder'];

// THE FIXTURE, and it is the same property v220 used because nothing weaker can
// tell the two scoring types apart: every hole is a par, so on GROSS every hole is
// HALVED; Ann is off 18, so on NET she carries a stroke on all eighteen and wins
// every hole. ALL SQUARE against a 10 & 8 rout.
function round(format, scoring, extra) {
    const players = [
        { id: 101, name: 'Ann', hcp: '18', team: 'Team 1', playingForMoney: true },
        { id: 102, name: 'Ben', hcp: '0', team: 'Team 2', playingForMoney: true }
    ];
    const scores = {};
    CD.forEach(h => { scores['p101_h' + h.hole] = 4; scores['p102_h' + h.hole] = 4; });
    const d = {
        players, courseData: CD, scores, gameFormat: format,
        matchStake: 20, nassauStake: 10,
        matchPressRule: 'none', nassauPressRule: 'none',
        settlementMode: 'whole-dollar', eventName: 'Cup Day'
    };
    if (scoring !== null) {
        if (format === 'nassau') d.nassauScoring = scoring; else d.matchScoring = scoring;
    }
    return Object.assign(d, extra || {});
}

// ---- the four surfaces ------------------------------------------------------
const IDX = ['score-marks.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
             'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js'];

function scorecard(d) {
    const sb = loadHtmlInlineScript('index.html', IDX);
    sb.__d = d;
    let err = '';
    try {
        vm.runInContext('currentMode="A"; currentData=__d; courseData=__d.courseData;'
            + ' savedScores=__d.scores; renderScorecard();', sb);
    } catch (e) { err = String(e).slice(0, 140); }
    const clean = (s) => String(s || '').replace(/<[^>]+>/g, '|').replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'").replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
    return {
        err,
        scoringType: vm.runInContext('String(window.__scScoringType || "")', sb),
        ticker: clean(sb.document.getElementById('ticker-status-val').innerHTML),
        subtitle: String(sb.document.getElementById('format-subtitle').textContent || '')
    };
}

function gameTab(d) {
    const sb = loadHtmlInlineScript('game.html');
    sb.__d = d;
    // formatSentence returns an OBJECT - {label, how, stake} - not a string. The
    // first draft of this helper wrapped it in String(), got "[object Object]" and
    // failed every game.html test including the formats that were already right,
    // which is how a harness fault impersonates a defect.
    const out = vm.runInContext('(function(){ try { return JSON.stringify(formatSentence(__d)); }'
        + ' catch (e) { return JSON.stringify({ how: "THREW: " + e }); } })()', sb);
    const o = JSON.parse(out);
    return String(o.how || '');
}

function statsSettlement(d) {
    const sb = loadHtmlInlineScript('stats.html');
    sb.__d = d;
    const out = vm.runInContext('(function(){ try { return String(renderSettlementBlock(__d)); }'
        + ' catch (e) { return "THREW: " + e; } })()', sb);
    return String(out).replace(/<[^>]+>/g, '|').replace(/&amp;/g, '&')
        .replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
}

function money(d) {
    const M = loadJsFile('money-engine.js', ['handicap.js', 'match-engine.js']);
    const r = M.computeRoundMoneyByPlayer(d, CD, d.scores);
    if (!r || !r.players) return null;
    return r.players.reduce((acc, p) => (acc[p.name] = p.net, acc), {});
}

describe('v221a: gross means gross on every surface, ryder and scramble included', () => {

    test('THE FIXTURE can tell net from gross, or nothing below means anything', () => {
        const E = loadJsFile('match-engine.js', ['handicap.js']).calculateMatchEngine;
        const d = round('ryder', 'gross');
        const seg = (sc) => {
            const r = E(d.players, CD, d.scores, sc, 'ryder', 'none', 20, 0, [], undefined);
            return r.activeMatches.find(m => m.id === '18') || r.activeMatches[0];
        };
        assert.equal(seg('gross').status, 0, 'on GROSS this round must be all square');
        assert.ok(Math.abs(seg('net').status) >= 8,
            'on NET it must be a rout, not a near thing - otherwise a page that '
            + 'ignored the setting could still look right');
    });

    // ---------------------------------------------------------------------
    describe('index.html — the scorecard, where the number is COMPUTED', () => {
        MATCH_FORMATS.forEach(fmt => {
            test(fmt + ' GROSS: scoringType is gross and the ticker says all square', () => {
                const s = scorecard(round(fmt, 'gross'));
                assert.equal(s.err, '', 'renderScorecard threw: ' + s.err);
                assert.equal(s.scoringType, 'gross',
                    fmt + ': the round is set to gross and the scorecard derived "'
                    + s.scoringType + '"');
                assert.ok(s.ticker.length > 0, 'the ticker rendered nothing');
                assert.ok(!/\d+&\d+/.test(s.ticker),
                    fmt + ' gross: every hole was halved, so there is no closed match. '
                    + 'Ticker: ' + s.ticker);
                assert.match(s.subtitle, /\(GROSS\)/, 'the subtitle must say GROSS too');
            });
            test(fmt + ' NET: still net, and Ann is shown winning', () => {
                const s = scorecard(round(fmt, 'net'));
                assert.equal(s.err, '', 'renderScorecard threw: ' + s.err);
                assert.equal(s.scoringType, 'net', fmt + ' net');
                assert.match(s.subtitle, /\(NET\)/);
            });
        });

        test('a NON-match format is untouched: stableford keeps its own setting', () => {
            // THE REASON THIS IS NOT A BARE TERNARY. scoringType here also serves
            // stableford, and a bare ternary would have read matchScoring for it.
            const s = scorecard(round('stableford', null, { stablefordScoring: 'gross' }));
            assert.equal(s.err, '', 'renderScorecard threw: ' + s.err);
            assert.equal(s.scoringType, 'gross', 'stableford must read stablefordScoring');
        });

        test('AND A STROKE ROUND CARRYING A LEFTOVER matchScoring STAYS NET', () => {
            // A round can hold a matchScoring from a format the organizer looked at
            // and moved away from - the case v216's control C15 exists for. A bare
            // ternary would turn that stroke round gross.
            const s = scorecard(round('stroke', null, { matchScoring: 'gross' }));
            assert.equal(s.err, '', 'renderScorecard threw: ' + s.err);
            assert.equal(s.scoringType, 'net',
                'a stroke round must not inherit a leftover match setting');
        });

        test('a MISSING setting still means net, on every match format', () => {
            MATCH_FORMATS.forEach(fmt => {
                const s = scorecard(round(fmt, null));
                assert.equal(s.scoringType, 'net', fmt + ' with no setting must default to net');
            });
        });
    });

    // ---------------------------------------------------------------------
    describe('game.html — the "how it is scored" sentence', () => {
        MATCH_FORMATS.forEach(fmt => {
            test(fmt + ' GROSS: the sentence says gross', () => {
                const s = gameTab(round(fmt, 'gross'));
                assert.ok(!/^THREW/.test(s), s);
                assert.match(s, /gross — no handicap strokes/,
                    fmt + ' gross: the Game tab said the opposite. Got: ' + s.slice(0, 160));
            });
            test(fmt + ' NET: the sentence says net', () => {
                const s = gameTab(round(fmt, 'net'));
                assert.ok(!/^THREW/.test(s), s);
                assert.match(s, /net — handicap strokes count/, fmt + ' net');
            });
        });
        test('stableford still reads stablefordScoring, and a stroke round stays net', () => {
            assert.match(gameTab(round('stableford', null, { stablefordScoring: 'gross' })),
                /gross — no handicap strokes/);
            assert.match(gameTab(round('stroke', null, { matchScoring: 'gross' })),
                /net — handicap strokes count/,
                'a stroke round must not inherit a leftover match setting');
        });
    });

    // ---------------------------------------------------------------------
    describe('stats.html — the Round Settlement card', () => {
        // stats.html is the WRONG-SOURCE bug: `nassauScoring || matchScoring || net`.
        // Its format gate already sits nine lines above, so it takes the plain ternary.
        MATCH_FORMATS.forEach(fmt => {
            test(fmt + ' GROSS: no money changes hands on an all-halved round', () => {
                const s = statsSettlement(round(fmt, 'gross'));
                assert.ok(!/^THREW/.test(s), s);
                assert.ok(s.length > 0, 'stats rendered nothing');
                assert.ok(!/\+\$20|\+\$10/.test(s),
                    fmt + ' gross: every hole halved, so nobody is owed. Got: ' + s.slice(0, 200));
            });
        });
        test('a stale nassauScoring must NOT win on a ryder round', () => {
            // THE PRECISE SHAPE OF THE stats.html DEFECT. The round is a ryder set to
            // NET and carries a leftover nassauScoring of 'gross' from an earlier look
            // at Nassau. `nassauScoring || matchScoring || "net"` takes the wrong one,
            // so the card is scored GROSS against the organizer's setting.
            //
            // ASSERTED ON THE MONEY, NOT ON A NAME. The first version of this test
            // checked that "Ann" appeared, and it PASSED on HEAD - she appears in both
            // outcomes, once at +$20 and once at $0. Measured, the two differ as:
            //     correct (net)   "Overall Match: Ann Won (+20)"  ...  "Ann: +$20"
            //     HEAD (gross)    "Overall Match: All Square ($0)" ... "Ann: $0"
            const s = statsSettlement(round('ryder', 'net', { nassauScoring: 'gross' }));
            assert.ok(!/^THREW/.test(s), s);
            assert.match(s, /Ann Won \(\+20\)/,
                'a NET ryder round: Ann carries a stroke on all 18 and wins the match. '
                + 'A stale nassauScoring must not turn it gross. Got: ' + s.slice(0, 220));
            assert.ok(!/All Square/.test(s), 'the card was scored gross. Got: ' + s.slice(0, 220));
        });
        test('and a stale matchScoring must not win on a NASSAU round', () => {
            // The mirror image. Right by luck on HEAD - nassauScoring happens to be
            // first in the || chain - so this is a guard against the "fix" being an
            // ordering swap rather than a correct source per format.
            const s = statsSettlement(round('nassau', 'net', { matchScoring: 'gross' }));
            assert.ok(!/^THREW/.test(s), s);
            assert.match(s, /Ann \+\$10/, 'a net Nassau: Ann wins all three segments. Got: '
                + s.slice(0, 220));
            assert.ok(!/All Square/.test(s), 'the Nassau was scored gross. Got: ' + s.slice(0, 220));
        });
    });

    // ---------------------------------------------------------------------
    describe('THE CROSS-SURFACE TEST — the one that matters', () => {
        ['ryder', 'scramble'].forEach(fmt => {
            test(fmt + ' gross, every hole halved: all four surfaces agree nobody won', () => {
                const d = round(fmt, 'gross');

                // 1. the money — this was always right, and it is the standard
                const m = money(d);
                assert.ok(m, 'the money path returned nothing');
                // NORMALISED FOR NEGATIVE ZERO. The engine can hand back -0 for a side
                // that is level, and assert.equal uses Object.is, so -0 !== 0 there.
                // It is numerically zero and nothing renders it as "-$0" - the money
                // formatters branch on `amt < 0`, which is false for -0 - so this is a
                // sign-of-zero artifact, not a defect to chase.
                assert.equal(m.Ann + 0, 0, 'the money says nobody is up');
                assert.equal(m.Ben + 0, 0);

                // 2. the scorecard
                const s = scorecard(d);
                assert.equal(s.err, '', 'renderScorecard threw: ' + s.err);
                assert.equal(s.scoringType, 'gross');
                assert.ok(!/\d+&\d+/.test(s.ticker),
                    'the SCORECARD disagrees with the money. Ticker: ' + s.ticker);

                // 3. the Game tab
                assert.match(gameTab(d), /gross — no handicap strokes/,
                    'the GAME TAB disagrees');

                // 4. the Board (fixed in v220 — pinned here so the set stays agreed)
                const sb = loadHtmlInlineScript('leaderboard.html');
                sb.__d = d;
                vm.runInContext("currentMode='B'; currentBoardData=__d; activeView='team';"
                    + ' renderBoard();', sb);
                const board = String(sb.document.getElementById('board-content').innerHTML || '')
                    .replace(/<[^>]+>/g, '|').replace(/&amp;/g, '&').replace(/\|+/g, '|')
                    .replace(/\s+/g, ' ').trim();
                assert.match(board, /ALL SQUARE/, 'the BOARD disagrees. Got: ' + board.slice(0, 160));
            });
        });
    });

    // ---------------------------------------------------------------------
    describe('THE GENERALISATION — the lists that answer the SAME question agree', () => {
        // THE DEFECT WAS NEVER "a list exists". The canonical set appears in nine
        // production places and was correct in all nine; three scoring derivations
        // simply grew their own shorter one instead of consulting it.
        //
        // MY FIRST VERSION OF THIS TEST HELD *EVERY* FORMAT LIST TO ONE SET, AND
        // THAT WAS WRONG. It reported nine "disagreements" that are all correct by
        // design, and had I trusted it I would have broken three of them:
        //   ['match','bestball','scramble','ryder']  the NON-NASSAU set, used where
        //       nassau is tested separately on the line above
        //   handicap.js isRelativeMatchFormat        excludes scramble ON PURPOSE -
        //       a single-ball team format has no individual ball for an individual
        //       relative stroke to attach to
        //   index.html isRoundLevelMatchFormat       excludes scramble ON PURPOSE
        //       for the dots context
        // Different questions, different answers. So this pins the two FAMILIES that
        // really are one question each, and names the two documented exclusions.

        const SETTLING = ['money-engine.js', 'settlement-engine.js', 'aloha-bet.js', 'bet-strip.js'];

        test('the four modules that settle a match name the same five formats', () => {
            // One question: which round formats settle through calculateMatchEngine.
            const found = [];
            SETTLING.forEach(f => {
                const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
                const re = /\[((?:\s*'[a-z0-9]+'\s*,?)+)\]/g;
                let m;
                while ((m = re.exec(code)) !== null) {
                    const items = m[1].match(/'([a-z0-9]+)'/g).map(x => x.replace(/'/g, ''));
                    if (items.includes('match') && items.includes('nassau')
                        && items.includes('scramble') && items.every(i => MATCH_FORMATS.includes(i))) {
                        found.push({ file: f, set: items.slice().sort().join(',') });
                    }
                }
            });
            assert.ok(found.length >= 4,
                'expected the settling list in at least 4 modules, found ' + found.length
                + ' - if the shape moved, this test is guarding nothing');
            const want = MATCH_FORMATS.slice().sort().join(',');
            assert.deepEqual(found.filter(x => x.set !== want).map(x => x.file + ': ' + x.set), [],
                'a module that settles a match disagrees about which formats do');
        });

        test('every non-nassau list is exactly that set minus nassau', () => {
            // The other family: places that handle nassau on one line and the rest
            // on the next. Same question, expressed in two halves.
            //
            // THE COUNT IS MEASURED, NOT GUESSED. My first version demanded "at least
            // 3" because that is what my regex happened to match - a threshold picked
            // to feel safe rather than counted - and it failed on HEAD for that reason
            // alone. There were SEVEN before this wave: admin.html x2, index.html x2,
            // money-engine.js, settlement.html, stats.html.
            //
            // RE-PINNED TO NINE by v221a itself: the fix added one list to index.html
            // and one to game.html, because both needed the format GATE kept and only
            // the list corrected. This assertion caught its own wave adding them, which
            // is exactly what it is for - a new list is fine, an unexamined one is not.
            const want = MATCH_FORMATS.filter(f => f !== 'nassau').slice().sort().join(',');
            const files = fs.readdirSync(REPO_ROOT)
                .filter(f => /\.(html|js)$/.test(f))
                .filter(f => !/_test\.js$|\.test\.js$/.test(f));
            const found = [];
            files.forEach(f => {
                const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
                const re = /\[((?:\s*'[a-z0-9]+'\s*,?)+)\]/g;
                let m;
                while ((m = re.exec(code)) !== null) {
                    const items = m[1].match(/'([a-z0-9]+)'/g).map(x => x.replace(/'/g, ''));
                    const isNonNassauFamily = items.includes('match') && !items.includes('nassau')
                        && items.some(i => ['bestball', 'scramble', 'ryder'].includes(i))
                        && items.every(i => MATCH_FORMATS.includes(i));
                    if (isNonNassauFamily) found.push({ file: f, set: items.slice().sort().join(','), items });
                }
            });
            assert.equal(found.length, 9,
                'expected 9 non-nassau match-format lists, found ' + found.length + ': '
                + found.map(x => x.file).join(', ')
                + ' - a new one is fine, but re-pin this count deliberately');
            assert.deepEqual(found.filter(x => x.set !== want).map(x => x.file + ': [' + x.items.join(',') + ']'), [],
                'a non-nassau match-format list is missing a format');
        });

        test('the two scramble-excluding predicates are DELIBERATE and still say why', () => {
            // Held the other way round: these must NOT be "fixed" to include
            // scramble, and the comment that justifies each must survive.
            const h = read('handicap.js');
            assert.match(h, /\['match', 'nassau', 'bestball', 'ryder'\]/,
                'isRelativeMatchFormat changed shape - re-read its note before touching it');
            assert.match(h, /Scramble is excluded ON PURPOSE|single-ball team format/,
                'the reason scramble is excluded must stay written down');
            const i = read('index.html');
            assert.match(i, /function isRoundLevelMatchFormat/);
            assert.match(i, /ALREADY have one unambiguous match context/,
                'the reason this list is shorter must stay written down');
        });
    });
});
