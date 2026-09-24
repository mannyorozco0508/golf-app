// ============================================================================
// THE ESCAPING MOVED TO THE SINKS — AND IT COVERS THE BRANCH NO COPY PROTECTED
//
// Before v218, index.html and stats.html each carried their own
// calculateMatchEngine, and both wrapped the winner's name in escapeHtml() INSIDE
// the engine. That looked like a safety feature the canonical copy was missing.
// It was a HALF-APPLIED one, and index.html's live ticker is where you can see it:
//
//     const matchStatusStr = t18.closed
//         ? `FINAL: ${t18.finalResult}`                              <- escaped
//         : formatMatchStatusText(t18.status, matchCalc.t1Name, ...)  <- NOT
//     statusEl.innerHTML = `... ${matchStatusStr} ...`;
//
// One ternary, one innerHTML, one line apart. A CLOSED match was escaped; a LIVE
// one - rendered from t1Name/t2Name, which no copy ever escaped - was not. And
// escaping inside the engine could never have fixed it, because t1Name and
// holeWinner are the engine's plain text too.
//
// So the escaping is at the callers now, and this file proves it covers BOTH arms.
//
// THE NAMES MATTER. O'Brien, Ben&Jerry and A<b>C each carry a character that
// escaping changes. The first version of this wave's measurement used "Mike &
// Dave" and found NO difference between the engine copies, because finalResult
// interpolates the winning team's FIRST TOKEN - "Mike" - which has nothing in it
// to escape. A fixture that cannot express the defect reports safety forever.
//
// WHAT IS ASSERTED IS THE RENDERED MARKUP, not the source. A regex over source
// would pass on an escapeHtml() call that never runs.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

// A round between two golfers whose names need escaping, as a 1v1 match.
// thru/margin decide whether the match is still LIVE or has CLOSED, which is the
// whole point: both branches must be covered.
function round({ thru, aWins }) {
    const players = [
        { id: 101, name: "O'Brien", hcp: '0', team: 'Team 1', playingForMoney: true },
        { id: 102, name: 'Ben&Jerry', hcp: '0', team: 'Team 2', playingForMoney: true }
    ];
    const scores = {};
    for (let h = 1; h <= thru; h++) {
        const aTakesIt = h <= aWins;
        scores['p101_h' + h] = aTakesIt ? 3 : 4;
        scores['p102_h' + h] = 4;
    }
    return {
        players, courseData: cd18, scores, gameFormat: 'match',
        matchScoring: 'gross', matchStake: 20, matchPressRule: 'none',
        settlementMode: 'whole-dollar'
    };
}

const IDX = ['score-marks.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
             'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js'];

// Render the scorecard's live ticker for a round and hand back the MARKUP of the
// element a golfer looks at.
function ticker(d) {
    const sb = loadHtmlInlineScript('index.html', IDX);
    // renderScorecard(), not renderLiveTicker(). The match-play ticker lives in
    // renderScorecard - #ticker-status-val is written at index.html:8929, inside it -
    // and the first draft of this file called renderLiveTicker() and measured an
    // element nothing had touched. It was caught only because the assertion below
    // demands the ticker rendered SOMETHING before asking whether it is escaped.
    vm.runInContext('currentMode="A"; currentData=' + JSON.stringify(d)
        + '; courseData=currentData.courseData; savedScores=currentData.scores;'
        + ' try { renderScorecard(); } catch (e) { __err = String(e); }', sb);
    const err = vm.runInContext('typeof __err === "string" ? __err : ""', sb);
    return {
        html: vm.runInContext('document.getElementById("ticker-status-val").innerHTML || ""', sb),
        err
    };
}

describe('v218: the match engine returns plain text and the SINKS escape it', () => {

    describe('index.html live ticker — BOTH arms of the ternary', () => {

        test('a LIVE match escapes the team name — the arm no engine copy protected', () => {
            // 3 of 6 holes won: 3 up with 12 to play, nothing closed.
            const { html, err } = ticker(round({ thru: 6, aWins: 3 }));
            assert.equal(err, '', 'renderScorecard threw: ' + err);
            assert.ok(html.length > 0, 'the ticker rendered nothing, so nothing is proven');
            // The live arm names the leader. That name must arrive escaped.
            assert.ok(/O&#39;Brien/.test(html),
                "the LIVE branch must escape the apostrophe. Got: " + html.slice(0, 220));
            assert.ok(!/O'Brien/.test(html),
                "a raw apostrophe reached innerHTML. Got: " + html.slice(0, 220));
        });

        test('a CLOSED match escapes finalResult, which the engine no longer does', () => {
            // 10 of 10 holes won: 10 up with 8 to play - closed, so finalResult
            // carries the name and the engine hands it over unescaped.
            const { html, err } = ticker(round({ thru: 10, aWins: 10 }));
            assert.equal(err, '', 'renderScorecard threw: ' + err);
            assert.match(html, /FINAL/, 'this fixture must actually close the match');
            assert.ok(/O&#39;Brien/.test(html),
                'the CLOSED branch must escape too. Got: ' + html.slice(0, 220));
            assert.ok(!/O'Brien/.test(html),
                'a raw apostrophe reached innerHTML. Got: ' + html.slice(0, 220));
        });

        test('an ampersand in the losing side is escaped as well', () => {
            // Side B leads, so the ticker names Ben&Jerry.
            const d = round({ thru: 6, aWins: 0 });
            d.scores.p102_h1 = 3; d.scores.p102_h2 = 3; d.scores.p102_h3 = 3;
            const { html, err } = ticker(d);
            assert.equal(err, '', 'renderScorecard threw: ' + err);
            assert.ok(/Ben&amp;Jerry/.test(html),
                'an ampersand in a team name must be escaped. Got: ' + html.slice(0, 220));
        });

        test('a name containing markup cannot open a tag', () => {
            const d = round({ thru: 6, aWins: 3 });
            d.players[0].name = 'A<b>C';
            const { html, err } = ticker(d);
            assert.equal(err, '', 'renderScorecard threw: ' + err);
            assert.ok(/A&lt;b&gt;C/.test(html),
                'angle brackets in a name must be escaped. Got: ' + html.slice(0, 220));
            assert.ok(!/A<b>C/.test(html), 'a name opened a real tag in the ticker');
        });
    });

    describe('THE CANONICAL ENGINE IS THE UNESCAPED ONE', () => {
        test('finalResult, t1Name and holeWinner all come back as plain text', () => {
            // The other half of the contract. If the engine ever starts escaping
            // again, the sinks would double-escape and a golfer would read
            // "O&amp;#39;Brien" - so this is not redundant with the tests above.
            const { loadJsFile } = require('./helpers/load-script.js');
            const E = loadJsFile('match-engine.js', ['handicap.js']);
            const d = round({ thru: 10, aWins: 10 });
            const r = E.calculateMatchEngine(d.players, cd18, d.scores, 'gross', 'match',
                'none', 20, 0, [], undefined);
            assert.equal(r.t1Name, "O'Brien", 't1Name must be plain text');
            assert.equal(r.t2Name, 'Ben&Jerry', 't2Name must be plain text');
            const closed = r.activeMatches.find(m => m.closed);
            assert.ok(closed, 'this fixture must close');
            assert.match(closed.finalResult, /^O'Brien /, 'finalResult must be plain text');
            assert.ok(!/&#39;|&amp;/.test(JSON.stringify(r)),
                'the engine must not emit HTML entities anywhere in its return');
        });
    });

    describe('THE RECEIPT AND THE BOARD — gaps that predated v218 and are closed with it', () => {
        test('settlement.html escapes every name-bearing field of a receipt segment', () => {
            // The canonical engine never escaped, and this page has always rendered
            // its output straight into innerHTML. Not introduced by v218; fixed in it,
            // because the fix is the same one line at the same kind of sink.
            const src = read('settlement.html');
            [/\$\{escapeHtml\(r\.nameA\)\} vs \$\{escapeHtml\(r\.nameB\)\}/,
             /receipt-seg-result">\$\{escapeHtml\(seg\.result\)\}/,
             /receipt-seg-money">\$\{escapeHtml\(seg\.winner\)\}/,
             /\$\{escapeHtml\(r\.netTo\)\} \+\$/].forEach(re =>
                assert.match(src, re, 'an unescaped receipt sink came back: ' + re));
            assert.match(src, /<script src="text-safe\.js">/,
                'settlement.html must load the escaper it calls');
        });

        test("leaderboard.html escapes its head-to-head banner and rows", () => {
            // This page does NOT call calculateMatchEngine - it hand-rolls its own
            // hole-by-hole match loop, which is a separate finding - but its output
            // reached innerHTML through the same unescaped interpolation.
            const src = read('leaderboard.html');
            [/FINAL: \$\{escapeHtml\(finalResult\)\}/,
             /\$\{escapeHtml\(t1Display\)\} IS \$\{totalMatch\} UP/,
             /\$\{escapeHtml\(t2Display\)\} IS \$\{Math\.abs\(totalMatch\)\} UP/,
             /<td class="player-name">\$\{escapeHtml\(t1Display\)\}<\/td>/].forEach(re =>
                assert.match(src, re, 'an unescaped board sink came back: ' + re));
        });

        test('skins.html was already doing it this way — the pattern is not new', () => {
            // Worth pinning: escaping at the caller is the repo's existing habit, and
            // this is the line v218 followed rather than inventing a convention.
            assert.match(read('skins.html'),
                /escapeHtml\(matchStatusWords\(/,
                'skins.html stopped escaping matchStatusWords at the caller');
        });
    });
});
