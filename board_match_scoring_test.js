// ============================================================================
// THE BOARD'S TEAM VIEW HONOURS THE ROUND'S SCORING SETTING — ALL FIVE FORMATS
//
// WHAT THIS EXISTS TO FIX (v220). leaderboard.html derived its match scoring type
// with a cascade of ifs that named three formats:
//
//     let matchScoringType = "net";
//     if (gameFormat === 'nassau')  matchScoringType = nassauScoring || "net";
//     if (gameFormat === 'match' ||
//         gameFormat === 'bestball') matchScoringType = matchScoring  || "net";
//
// `ryder` and `scramble` are match-play formats and neither is in that list, so on
// those two the organizer's GROSS setting was silently discarded and the board
// compared NET scores.
//
// IT DOES NOT PRODUCE A SLIGHTLY WRONG MARGIN. IT INVENTS A RESULT. On a gross
// Ryder round where every single hole was halved - Ann off 18 against Ben off
// scratch, all pars - the board handed Ann a stroke on every hole and declared
// "Ann 10 & 8". Measured, on a $20 round:
//
//     money-engine.js          Ann net 0, Ben net 0     nobody pays
//     the board's team view    FINAL: Ann 10 & 8        a blowout
//     the board's OWN engine widget, eight inches above it:   AS
//
// The money was never wrong: money-engine.js:768 and settlement-engine.js:811
// derive the same thing with a TERNARY - nassau takes nassauScoring, EVERYTHING
// ELSE takes matchScoring - which covers ryder and scramble without naming them.
// The fix makes the board use that shape. One statement, and no format list to
// fall out of date the next time a match format is added.
//
// WHY A GOLFER WOULD HAVE BELIEVED IT: Ryder is the format where the team board is
// the point. This is the screen a Cup side watches all afternoon.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const holes = (n) => Array.from({ length: n }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const CD = holes(18);

// THE FIXTURE THAT CAN TELL NET FROM GROSS, and nothing weaker would.
// Every hole is halved on GROSS (all pars) and every hole is won by Ann on NET
// (she is off 18, so she carries a stroke on all eighteen). So the two answers are
// as far apart as they can be: ALL SQUARE versus a 10 & 8 rout. A fixture where
// both golfers were off scratch, or where the scores differed, could not tell the
// two scoring types apart at all.
function round(format, scoring) {
    const players = [
        { id: 101, name: 'Ann', hcp: '18', team: 'Team 1', playingForMoney: true },
        { id: 102, name: 'Ben', hcp: '0', team: 'Team 2', playingForMoney: true }
    ];
    const scores = {};
    CD.forEach(h => { scores['p101_h' + h.hole] = 4; scores['p102_h' + h.hole] = 4; });
    const d = {
        players, courseData: CD, scores, gameFormat: format,
        matchStake: 20, nassauStake: 10, matchPressRule: 'none', nassauPressRule: 'none',
        settlementMode: 'whole-dollar'
    };
    if (format === 'nassau') d.nassauScoring = scoring; else d.matchScoring = scoring;
    return d;
}

// The board, rendered in TEAM view, with both mounts readable.
function board(d) {
    const sb = loadHtmlInlineScript('leaderboard.html');
    sb.__d = d;
    let err = '';
    try {
        vm.runInContext("currentMode='B'; currentBoardData=__d; activeView='team';"
            + " document.__mount(document.getElementById('live-matches-mount'));"
            + " renderBoard();", sb);
    } catch (e) { err = String(e).slice(0, 160); }
    const txt = (id) => String(sb.document.getElementById(id).innerHTML || '')
        .replace(/<[^>]+>/g, '|').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
        .replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
    const team = txt('board-content');
    const status = (team.match(/\|\s*(?:🏁 FINAL: |🟢 )?([^|]*?(?:IS \d+ UP|ALL SQUARE|\d+ & \d+))\s*\|/) || [])[1] || '';
    return {
        err,
        scoringType: vm.runInContext("(function(){try{return String(document.getElementById('board-content')?'':'');}catch(e){return '';}})()", sb) && null,
        status: status.trim(),
        team,
        widget: txt('live-matches-mount')
    };
}

describe('v220: the Board honours GROSS on every match format, ryder and scramble included', () => {

    test('the fixture is capable of telling net from gross (or nothing below means anything)', () => {
        // POSITIVE ASSERTION FIRST. Every test here compares one scoring answer with
        // another; if the fixture produced the same result both ways, they would all
        // pass forever against a page that ignored the setting completely.
        const E = loadJsFile('match-engine.js', ['handicap.js']).calculateMatchEngine;
        const d = round('ryder', 'gross');
        const g = E(d.players, CD, d.scores, 'gross', 'ryder', 'none', 20, 0, [], undefined);
        const n = E(d.players, CD, d.scores, 'net', 'ryder', 'none', 20, 0, [], undefined);
        const seg = (r) => r.activeMatches.find(m => m.id === '18') || r.activeMatches[0];
        assert.equal(seg(g).status, 0, 'on GROSS this round must be all square');
        assert.ok(Math.abs(seg(n).status) >= 8, 'on NET this round must be a rout, not a near thing');
    });

    describe('a GROSS round is scored gross — the four formats that were already right, and the two that were not', () => {
        ['match', 'bestball', 'nassau'].forEach(fmt => {
            test(fmt + ' (was already correct — regression guard)', () => {
                const b = board(round(fmt, 'gross'));
                assert.equal(b.err, '', 'renderBoard threw: ' + b.err);
                assert.ok(b.status.length > 0, 'the team view rendered no status at all');
                assert.equal(b.status, 'ALL SQUARE',
                    fmt + ' gross: every hole was halved. Got: ' + b.status);
            });
        });
        ['ryder', 'scramble'].forEach(fmt => {
            test(fmt + ' — THE DEFECT: the GROSS setting was discarded', () => {
                const b = board(round(fmt, 'gross'));
                assert.equal(b.err, '', 'renderBoard threw: ' + b.err);
                assert.ok(b.status.length > 0, 'the team view rendered no status at all');
                assert.equal(b.status, 'ALL SQUARE',
                    fmt + ' gross: every hole was halved, so nobody is up. A result here '
                    + 'means the board fell through to net and gave Ann 18 strokes. Got: '
                    + b.status);
            });
        });
    });

    describe('a NET round is still scored net — the fix must not flip the default', () => {
        ['match', 'bestball', 'nassau', 'ryder', 'scramble'].forEach(fmt => {
            test(fmt + ' net: Ann wins every hole on handicap', () => {
                const b = board(round(fmt, 'net'));
                assert.equal(b.err, '', 'renderBoard threw: ' + b.err);
                assert.ok(/Ann/.test(b.status),
                    fmt + ' net: Ann carries a stroke on all 18 and must be shown winning. Got: '
                    + b.status);
                assert.ok(!/ALL SQUARE/.test(b.status), fmt + ' net must not read all square');
            });
        });

        test('and a MISSING setting still means net, on every format', () => {
            // The default is net and stays net. A round saved before the setting
            // existed must not start being scored gross.
            ['match', 'bestball', 'nassau', 'ryder', 'scramble'].forEach(fmt => {
                const d = round(fmt, 'net');
                delete d.matchScoring; delete d.nassauScoring;
                const b = board(d);
                assert.ok(/Ann/.test(b.status) && !/ALL SQUARE/.test(b.status),
                    fmt + ' with no scoring setting must default to NET. Got: ' + b.status);
            });
        });
    });

    describe('THE TWO PANELS ON THE BOARD AGREE — which is the defect a golfer actually saw', () => {
        // renderLiveMatchesBoard() runs at leaderboard.html:1392, BEFORE the
        // activeView branch, so the engine-driven "LIVE MATCHES & PRESSES" widget is
        // on screen in team view too. Before this wave the widget read AS and the
        // team banner read "Ann 10 & 8", at the same moment, on the same screen.
        ['ryder', 'scramble'].forEach(fmt => {
            test(fmt + ' gross: the team banner and the engine widget say the same thing', () => {
                const b = board(round(fmt, 'gross'));
                assert.ok(b.widget.length > 0,
                    'the engine widget rendered nothing, so agreement is vacuous');
                assert.match(b.widget, /LIVE MATCHES/, 'the widget must be the match widget');
                // The widget writes "AS" for all square; the team view "ALL SQUARE".
                const widgetSquare = /\|AS\|/.test(b.widget) || /ALL SQUARE/.test(b.widget);
                const teamSquare = /ALL SQUARE/.test(b.status);
                assert.equal(teamSquare, widgetSquare,
                    'the two panels disagree on the same round. widget: '
                    + b.widget.slice(0, 120) + '  team: ' + b.status);
            });
        });
    });

    test('the derivation has the same SHAPE money-engine.js uses, so no format list can go stale', () => {
        // THE REASON THIS IS A SHAPE AND NOT A LONGER LIST. money-engine.js:768 and
        // settlement-engine.js:811 both write it as a ternary - nassau takes
        // nassauScoring, everything else takes matchScoring - and neither has ever had
        // this bug, because neither enumerates the formats. Adding 'ryder' and
        // 'scramble' to a cascade of ifs would have fixed today and left the next
        // match format to be discovered the same way.
        const src = read('leaderboard.html');
        assert.match(src, /gameFormat === 'nassau'\s*\r?\n?\s*\?\s*\(currentBoardData\.nassauScoring \|\| "net"\)\s*\r?\n?\s*:\s*\(currentBoardData\.matchScoring \|\| "net"\)/,
            'leaderboard.html must derive matchScoringType with the ternary, not a format list');
        assert.ok(!/if \(gameFormat === 'match' \|\| gameFormat === 'bestball'\) matchScoringType/.test(src),
            'the enumerating cascade must be gone, not merely extended');
        // And the money path it mirrors is untouched.
        assert.match(read('money-engine.js'),
            /gameFormat === 'nassau'\s*\r?\n?\s*\?\s*\(d\.nassauScoring \|\| 'net'\)\s*\r?\n?\s*:\s*\(d\.matchScoring \|\| 'net'\)/,
            'money-engine.js is the pattern being mirrored; if it moved, re-check this');
    });
});
