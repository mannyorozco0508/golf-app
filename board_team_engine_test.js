// ============================================================================
// THE BOARD'S TEAM VIEW READS THE ENGINE — ONE CALL PER PAIR
//
// WHAT THIS EXISTS TO FIX (v221). leaderboard.html's team view walked every
// hole itself: best net or best gross, absolute strokes, and a close window
// of `18 - hole`. The LIVE MATCHES widget eight inches above it calls
// calculateMatchEngine. The two panels are on the same screen. On five of
// the fourteen corpus rounds they disagreed, measured on HEAD before this
// file's loop change:
//
//   2v2 Best Ball, net, per-hole bet                          7 & 6   vs  8 & 6
//   Nassau with a MANUAL press from hole 5                    3 & 2   vs  6 & 4
//   NINE-HOLE round, net match                                IS 1 UP vs  3 & 2
//   BACK NINE only, holes 10-18, net Nassau                   1 & 0   vs  3 & 1
//   RELATIVE HANDICAP 2v2 bestball, baseline off a non-zero   5 & 3   vs  7 & 6
//
// The other nine already agreed. A gross Ryder blowout is not one of them —
// v220 fixed the scoring-type ternary. These five are the handicap table and
// the close window, which that ternary does not touch.
//
// THE FIX. The same adapter settlement-engine.js uses for a side match and
// ryderFourBallState uses for a Cup match: a virtual two-team roster, one
// calculateMatchEngine call PER PAIR. A single call on a four-team field
// scores only the first two keys and silently drops the second matchup.
// The banner keeps the board's own words ("3 & 2", "Ann / Abe") and reads
// only the engine's numbers. Segments and presses stay on the widget.
//
// HARNESS LIMIT. helpers/mini-dom.js does not parse innerHTML into nodes and
// does not wire an inline onclick. This file reads the HTML string renderBoard
// assigns — the words a browser would show — and one test arrives through
// switchView, which is the handler the Match label's onclick names. It does
// not claim anything about pixels.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { FIXTURES, argsFor, decode } = require('./helpers/match-engine-corpus.js');
const { getSmartDisplayName } = require('./text-safe.js');

const calculateMatchEngine = loadJsFile('match-engine.js', ['handicap.js']).calculateMatchEngine;
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function roundData(f) {
    const scores = argsFor(f)[2];
    const d = {
        players: f.players.map(p => Object.assign({}, p)),
        courseData: f.holes,
        scores,
        gameFormat: f.format,
        matchStake: f.stake,
        nassauStake: f.stake,
        matchPressRule: f.pressRule,
        nassauPressRule: f.pressRule,
        holeBet: f.holeBet || 0
    };
    if (f.format === 'nassau') d.nassauScoring = f.scoring;
    else d.matchScoring = f.scoring;
    if (f.presses && f.presses.length) {
        d.matchPresses = {};
        f.presses.forEach((p, i) => { d.matchPresses['p' + i] = p; });
    }
    return { data: d, scores };
}

function pairsOf(players) {
    const teams = {};
    players.forEach(p => {
        if (!teams[p.team]) teams[p.team] = [];
        teams[p.team].push(p);
    });
    const keys = Object.keys(teams);
    const pairs = [];
    for (let i = 0; i < keys.length; i += 2) {
        if (i + 1 >= keys.length) break;
        pairs.push({
            keyA: keys[i], keyB: keys[i + 1],
            a: teams[keys[i]], b: teams[keys[i + 1]]
        });
    }
    return pairs;
}

function displays(pair, players) {
    return {
        t1: pair.a.map(p => getSmartDisplayName(p, players)).join(' / '),
        t2: pair.b.map(p => getSmartDisplayName(p, players)).join(' / ')
    };
}

// The total match: id '18' when the round has an overall, otherwise the only
// base segment (a nine-hole Nassau, or the back nine alone). Presses are not
// the banner.
function totalSegment(calc) {
    const bases = (calc.activeMatches || []).filter(m => m.pressNum === 0);
    return bases.find(m => m.id === '18') || bases[0];
}

function engineFor(players, holes, scores, spec, pair) {
    const virtual = pair.a.map(p => Object.assign({}, p, { team: 'Team 1' }))
        .concat(pair.b.map(p => Object.assign({}, p, { team: 'Team 2' })));
    return calculateMatchEngine(virtual, holes, scores, spec.scoring, spec.format,
        spec.pressRule, spec.stake, spec.holeBet || 0, spec.presses || [], undefined);
}

// The sentence the banner must show. Names are the board's. Numbers are the
// engine's. Spaces around "&" are the board's wording, not the engine's "3&2".
function sentence(calc, t1, t2) {
    const total = totalSegment(calc);
    const status = total ? total.status : 0;
    const thru = calc ? calc.maxThru : 0;
    if (!thru || !total) return { text: 'ALL SQUARE', thru, status: 0, closed: false };
    if (total.closed) {
        const hm = /(\d+)&(\d+)\s*$/.exec(String(total.finalResult || ''));
        const left = hm ? hm[2] : '?';
        const winner = status > 0 ? t1 : t2;
        return {
            text: 'FINAL: ' + winner + ' ' + Math.abs(status) + ' & ' + left,
            thru, status, closed: true
        };
    }
    if (status === 0) return { text: 'ALL SQUARE', thru, status: 0, closed: false };
    const leader = status > 0 ? t1 : t2;
    return {
        text: leader + ' IS ' + Math.abs(status) + ' UP',
        thru, status, closed: false
    };
}

function normStatus(s) {
    return decode(String(s)).replace(/[🏁🟢]/g, '').replace(/\s+/g, ' ').trim();
}

function squashName(s) {
    return String(s).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
}

function paint(page, data, via) {
    const sb = loadHtmlInlineScript(page, [], { search: '?game=DIAG' });
    sb.__d = data;
    let err = '';
    try {
        if (via === 'arrival') {
            const handler = (sb.__dbHandlers || []).find(h => String(h.path).indexOf('events/') === 0);
            if (!handler) throw new Error('the board never subscribed to the round');
            handler.cb({ val() { return data; } });
            vm.runInContext("switchView('team')", sb);
        } else {
            vm.runInContext("currentBoardData=__d; activeView='team'; renderBoard();", sb);
        }
    } catch (e) { err = String(e && e.stack || e).split('\n')[0]; }
    return {
        err,
        board: String(sb.document.getElementById('board-content').innerHTML || ''),
        widget: String(sb.document.getElementById('live-matches-mount').innerHTML || '')
    };
}

function bannersOf(html) {
    return [...html.matchAll(/class="h2h-status">([^<]*)</g)].map(m => normStatus(m[1]));
}

function thruOf(html) {
    const m = /class="h2h-sub">Thru (\d+)/.exec(html);
    return m ? Number(m[1]) : null;
}

function boardMargin(statusText) {
    const s = normStatus(statusText);
    if (s === 'ALL SQUARE') return { margin: 0, who: null, closed: false };
    let m = /^FINAL:\s*(.*)\s(\d+) & (\d+)$/.exec(s);
    if (m) return { margin: Number(m[2]), who: m[1], left: Number(m[3]), closed: true };
    m = /^(.*) IS (\d+) UP$/.exec(s);
    if (m) return { margin: Number(m[2]), who: m[1], closed: false };
    return null;
}

function widgetSegments(html) {
    return [...html.matchAll(/lm-seg-name">([^<]*)<\/span><span class="lm-seg-status[^"]*">([^<]*)/g)]
        .map(m => ({ label: decode(m[1]), status: decode(m[2]) }));
}

// TOTAL when the round has an overall. Otherwise the only segment. Never the
// front nine of a full Nassau — that segment can share a number with a wrong
// banner and hide the disagreement.
function widgetTotal(html) {
    const segs = widgetSegments(html);
    if (segs.length === 0) return null;
    return segs.find(s => s.label === 'TOTAL')
        || segs.find(s => s.label === 'OVERALL MATCH')
        || (segs.length === 1 ? segs[0] : null);
}

function widgetMargin(statusText) {
    const s = String(statusText).replace(/\s*·\s*FINAL\s*$/, '').trim();
    const closed = /FINAL/.test(statusText);
    if (s === 'AS' || s === 'Not Started') return { margin: 0, who: null, closed: false, as: s === 'AS' };
    const m = /^(.*) (\d+) UP$/.exec(s);
    if (!m) return null;
    return { margin: Number(m[2]), who: m[1], closed };
}

function assertPairAgrees(view, spec, label) {
    const { data, scores } = roundData(spec);
    const painted = paint(view.page, data, view.via);
    assert.equal(painted.err, '', label + ' render threw: ' + painted.err);
    const banners = bannersOf(painted.board);
    const pairs = pairsOf(data.players);
    assert.equal(banners.length, pairs.length, label + ' banner count. got ' + banners.join(' || '));
    assert.ok(!/lm-press|FRONT 9|BACK 9|9-HOLE MATCH/.test(painted.board),
        label + ' team view must be the total match only, not segments or presses');

    const hasPress = spec.pressRule !== 'none' || (spec.presses && spec.presses.length > 0);
    if (hasPress) {
        assert.match(painted.widget, /class="lm-press/,
            label + ' widget rendered no press, so "the banner has no press" would be vacuous');
    }

    pairs.forEach((pair, i) => {
        const names = displays(pair, data.players);
        const calc = engineFor(data.players, data.courseData, scores, spec, pair);
        const expect = sentence(calc, names.t1, names.t2);
        assert.equal(banners[i], expect.text,
            label + ' pair ' + (i + 1) + ' banner.\n  board:  ' + banners[i] + '\n  engine: ' + expect.text);
        if (expect.closed) {
            assert.match(banners[i], /\d+ & \d+/, label + ' closed wording');
            assert.ok(!/\d+&\d+/.test(banners[i]),
                label + ' must keep the board\'s spaces in "3 & 2", not the engine\'s "3&2"');
        }
        assert.equal(thruOf(painted.board), expect.thru, label + ' thru');
    });

    // The defect a golfer sees: this banner and #live-matches-mount, same round.
    // The widget is one call on the whole field, so it is the first pair. A
    // four-team round's second matchup is asserted against the engine above;
    // the widget cannot show it without dropping it.
    const picked = widgetTotal(painted.widget);
    assert.ok(picked, label + ' widget rendered no total segment: ' + painted.widget.slice(0, 180));
    const segs = widgetSegments(painted.widget);
    if (segs.some(s => s.label === 'TOTAL')) {
        assert.equal(picked.label, 'TOTAL',
            label + ' compared the banner to ' + picked.label + ' instead of the total');
    }
    const b = boardMargin(banners[0]);
    const w = widgetMargin(picked.status);
    assert.ok(b && w, label + ' could not read a margin. board ' + banners[0] + ' widget ' + picked.status);
    assert.equal(b.margin, w.margin,
        label + ' the two panels disagree. board ' + banners[0] + ' widget ' + picked.status);
    assert.equal(b.closed, w.closed, label + ' closed flag disagrees');
    if (b.margin > 0) assert.equal(squashName(b.who), squashName(w.who),
        label + ' leader disagrees. board ' + b.who + ' widget ' + w.who);
    return { banners, board: painted.board, widget: painted.widget };
}

const REAL = { page: 'leaderboard.html', via: 'render' };

describe('v221: the team view is the engine, on every corpus fixture', () => {
    test('the corpus is still the fourteen rounds the engine is pinned to', () => {
        assert.equal(FIXTURES.length, 14);
    });

    FIXTURES.forEach(f => {
        test('FIXTURE: ' + f.label, () => {
            assertPairAgrees(REAL, f, f.label);
        });
    });

    test('ARRIVAL: nine-hole, through the round listener and the Match toggle', () => {
        // switchView is the onclick on "Match (Team/Cart)". The listener is
        // the page's own. This test does not call renderBoard.
        const nine = FIXTURES.find(f => /NINE-HOLE/.test(f.label));
        const { data } = roundData(nine);
        const painted = paint('leaderboard.html', data, 'arrival');
        assert.equal(painted.err, '', painted.err);
        const banners = bannersOf(painted.board);
        const pair = pairsOf(data.players)[0];
        const names = displays(pair, data.players);
        const expect = sentence(engineFor(data.players, data.courseData, data.scores, nine, pair), names.t1, names.t2);
        assert.equal(banners[0], expect.text);
        assert.match(banners[0], /3 & 2/);
        assert.ok(!/3&2/.test(banners[0]));
        const w = widgetMargin(widgetTotal(painted.widget).status);
        assert.equal(boardMargin(banners[0]).margin, w.margin);
    });
});

describe('v221: four teams keep both matchups, and the names stay the board\'s', () => {
    function fourTeam() {
        const holes = FIXTURES[0].holes;
        const players = [
            { id: 201, name: 'Ann', hcp: '0', team: 'Team 1' },
            { id: 202, name: 'Abe', hcp: '0', team: 'Team 1' },
            { id: 203, name: 'Ben', hcp: '0', team: 'Team 2' },
            { id: 204, name: 'Bea', hcp: '0', team: 'Team 2' },
            { id: 205, name: 'Cy', hcp: '0', team: 'Team 3' },
            { id: 206, name: 'Cam', hcp: '0', team: 'Team 3' },
            { id: 207, name: 'Dee', hcp: '0', team: 'Team 4' },
            { id: 208, name: 'Dot', hcp: '0', team: 'Team 4' }
        ];
        const scores = {};
        holes.forEach(h => {
            scores['p201_h' + h.hole] = 3;
            scores['p202_h' + h.hole] = 3;
            scores['p203_h' + h.hole] = 5;
            scores['p204_h' + h.hole] = 5;
            [205, 206, 207, 208].forEach(id => { scores['p' + id + '_h' + h.hole] = 4; });
        });
        const spec = {
            players, holes, scoring: 'gross', format: 'match',
            pressRule: 'none', stake: 20, holeBet: 0, presses: []
        };
        const data = {
            players, courseData: holes, scores,
            gameFormat: 'match', matchScoring: 'gross', matchStake: 20,
            matchPressRule: 'none', nassauPressRule: 'none', holeBet: 0
        };
        return { spec, data, scores, holes, players };
    }

    test('FOUR-TEAM: both matchups, Ann / Abe, and the first agrees with the widget', () => {
        const ft = fourTeam();
        const painted = paint('leaderboard.html', ft.data, 'render');
        assert.equal(painted.err, '', painted.err);
        const banners = bannersOf(painted.board);
        assert.equal(banners.length, 2, 'a four-team round renders two matchups. got ' + banners.join(' || '));

        const pairs = pairsOf(ft.players);
        pairs.forEach((pair, i) => {
            const names = displays(pair, ft.players);
            const expect = sentence(engineFor(ft.players, ft.holes, ft.scores, ft.spec, pair), names.t1, names.t2);
            assert.equal(banners[i], expect.text,
                'pair ' + (i + 1) + '\n  board:  ' + banners[i] + '\n  engine: ' + expect.text);
        });

        assert.match(banners[0], /Ann \/ Abe/);
        assert.match(banners[0], /10 & 8/);
        assert.equal(banners[1], 'ALL SQUARE');
        assert.ok(!painted.board.includes('Ann/Abe'),
            'the banner must keep the board\'s "Ann / Abe", not the engine\'s "Ann/Abe"');
        assert.ok(!/lm-press|FRONT 9/.test(painted.board));

        const w = widgetMargin(widgetTotal(painted.widget).status);
        const b = boardMargin(banners[0]);
        assert.equal(b.margin, w.margin, 'first matchup vs the widget');
        assert.equal(squashName(b.who), squashName(w.who));
        // The widget's one call is the first pair only. One segment here is
        // that call actually rendering; the second banner above is what proves
        // the team view did not stop at it.
        assert.equal(widgetSegments(painted.widget).length, 1);
    });
});

describe('v221: the team branch calls the engine, and the slice is really there', () => {
    test('SOURCE: one per-pair call, the total segment, and the banner markup', () => {
        const src = read('leaderboard.html');
        const at = src.indexOf('if (activeView === "team")');
        assert.ok(at > 0, 'the team branch is gone');
        const end = src.indexOf('\n    function ', at + 30);
        const slice = src.slice(at, end === -1 ? src.indexOf('</script>', at) : end);
        assert.match(slice, /h2h-banner/, 'the slice must contain the banner it is guarding');
        assert.match(slice, /calculateMatchEngine\(virtual,/);
        assert.match(slice, /team: 'Team 1'/);
        assert.match(slice, /team: 'Team 2'/);
        assert.match(slice, /m\.id === '18'/);
        assert.match(slice, /\$\{Math\.abs\(totalMatch\)\} & \$\{holesLeftAtClose\}/);
        assert.ok(!/team1BestNet/.test(slice), 'the homemade best-ball loop is still in the team branch');
        assert.equal((slice.match(/calculateMatchEngine\(/g) || []).length, 1,
            'one call per pair, not a second call on the whole field');
    });

    test('SOURCE: tapping Match still reaches renderBoard', () => {
        // mini-dom's getElementById invents a node for any id, so a harness
        // call to switchView cannot see this. v202 removed #group-view-toggle
        // and left switchView reading it. In a browser that throws, the Match
        // label turns on, and the stroke board stays. Measured in headless
        // Chrome before this guard: innerText was unchanged after the tap.
        const src = read('leaderboard.html');
        const at = src.indexOf('function switchView(view)');
        const end = src.indexOf('\n    function ', at + 30);
        // Comments are not call sites. The note above the hide names the
        // retired id on purpose; the guard is about the code that runs.
        const fn = src.slice(at, end)
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
        assert.match(fn, /renderBoard\(\)/, 'switchView must still paint the board');
        assert.match(fn, /getElementById\('view-pills'\)/, 'the stroke view control is what team view hides');
        assert.ok(!/group-view-toggle/.test(fn),
            'switchView still reads the id v202 removed, so the tap throws before renderBoard');
    });
});

// ---------------------------------------------------------------------------
// CONTROLS. Each one reverts a single decision on a COPY of the page. The
// copy lives under test-runs/ so a scanner of the repo root never sees it.
// A clean round must still pass, or a revert that simply breaks rendering
// would satisfy the "goes red" assertion.
// ---------------------------------------------------------------------------

const OLD_LOOP = `
                let totalMatch = 0;
                let thruCount = 0;
                let matchClosed = false;
                let finalResult = "";

                courseData.forEach((hole) => {
                    let team1BestNet = 999, team1BestGross = 999;
                    let team2BestNet = 999, team2BestGross = 999;
                    let t1Valid = false, t2Valid = false;

                    teams[t1Name].forEach(p => {
                        let v = savedScores[\`p\${p.id}_h\${hole.hole}\`];
                        if (v && v > 0) {
                            let gross = parseInt(v, 10);
                            let net = gross - getStrokes(hole.hcpIndex, parseHcp(p.hcp));
                            if (net < team1BestNet) team1BestNet = net;
                            if (gross < team1BestGross) team1BestGross = gross;
                            t1Valid = true;
                        }
                    });

                    teams[t2Name].forEach(p => {
                        let v = savedScores[\`p\${p.id}_h\${hole.hole}\`];
                        if (v && v > 0) {
                            let gross = parseInt(v, 10);
                            let net = gross - getStrokes(hole.hcpIndex, parseHcp(p.hcp));
                            if (net < team2BestNet) team2BestNet = net;
                            if (gross < team2BestGross) team2BestGross = gross;
                            t2Valid = true;
                        }
                    });

                    if (t1Valid && t2Valid) {
                        thruCount++;
                        let compare1 = matchScoringType === 'net' ? team1BestNet : team1BestGross;
                        let compare2 = matchScoringType === 'net' ? team2BestNet : team2BestGross;

                        if (!matchClosed) {
                            if (compare1 < compare2) totalMatch += 1;
                            else if (compare2 < compare1) totalMatch -= 1;
                        }

                        let holesLeft = 18 - hole.hole;
                        if (!matchClosed && Math.abs(totalMatch) > holesLeft) {
                            matchClosed = true;
                            let winner = totalMatch > 0 ? t1Display : t2Display;
                            finalResult = \`\${winner} \${Math.abs(totalMatch)} & \${holesLeft}\`;
                        }
                    }
                });
`;

function withCopy(name, mutate, fn) {
    const dir = path.join(REPO_ROOT, 'test-runs');
    fs.mkdirSync(dir, { recursive: true });
    const rel = 'test-runs/' + name + '.html';
    const dest = path.join(REPO_ROOT, rel);
    const original = read('leaderboard.html');
    const next = mutate(original);
    assert.notEqual(next, original, name + ' changed nothing');
    fs.writeFileSync(dest, next);
    try { fn(rel); }
    finally { fs.unlinkSync(dest); }
}

function revertEngineBlock(src) {
    const start = src.indexOf('const virtual = teams[t1Name].map');
    const end = src.indexOf('let statusText = "";', start);
    assert.ok(start > 0 && end > start, 'D1 could not find the engine block');
    return src.slice(0, start) + OLD_LOOP.trim() + '\n\n                ' + src.slice(end);
}

describe('v221 controls: revert D1, D2, D3 one at a time', { concurrency: 1 }, () => {
    const grossBlowout = FIXTURES.find(f => /CLOSED EARLY/.test(f.label));
    const relative = FIXTURES.find(f => /RELATIVE HANDICAP 2v2 bestball/.test(f.label));
    const sideAWins = FIXTURES.find(f => /SIDE A WINS/.test(f.label));

    test('CONTROL D1: the homemade loop restored — the relative round goes red, the gross blowout stays', () => {
        withCopy('board-team-d1', revertEngineBlock, (page) => {
            const view = { page, via: 'render' };
            const good = assertPairAgrees(view, grossBlowout, 'D1 clean');
            assert.match(good.banners[0], /10 & 8/);
            let threw = false;
            try { assertPairAgrees(view, relative, 'D1 reverted'); }
            catch (e) { threw = true; assert.match(String(e.message), /pair 1 banner/); }
            assert.ok(threw, 'D1 reverted and the relative best-ball round still matched the engine');
        });
    });

    test('CONTROL D2: one call on the whole field — the second matchup goes red, a two-team round stays', () => {
        withCopy('board-team-d2', (src) => {
            assert.equal((src.match(/calculateMatchEngine\(virtual,/g) || []).length, 1);
            return src.replace('calculateMatchEngine(virtual,', 'calculateMatchEngine(players,');
        }, (page) => {
            const view = { page, via: 'render' };
            const good = assertPairAgrees(view, grossBlowout, 'D2 clean');
            assert.match(good.banners[0], /10 & 8/);

            const holes = FIXTURES[0].holes;
            const players = [
                { id: 201, name: 'Ann', hcp: '0', team: 'Team 1' },
                { id: 202, name: 'Abe', hcp: '0', team: 'Team 1' },
                { id: 203, name: 'Ben', hcp: '0', team: 'Team 2' },
                { id: 204, name: 'Bea', hcp: '0', team: 'Team 2' },
                { id: 205, name: 'Cy', hcp: '0', team: 'Team 3' },
                { id: 206, name: 'Cam', hcp: '0', team: 'Team 3' },
                { id: 207, name: 'Dee', hcp: '0', team: 'Team 4' },
                { id: 208, name: 'Dot', hcp: '0', team: 'Team 4' }
            ];
            const scores = {};
            holes.forEach(h => {
                scores['p201_h' + h.hole] = 3; scores['p202_h' + h.hole] = 3;
                scores['p203_h' + h.hole] = 5; scores['p204_h' + h.hole] = 5;
                [205, 206, 207, 208].forEach(id => { scores['p' + id + '_h' + h.hole] = 4; });
            });
            const painted = paint(page, {
                players, courseData: holes, scores,
                gameFormat: 'match', matchScoring: 'gross', matchStake: 20,
                matchPressRule: 'none', holeBet: 0
            }, 'render');
            const banners = bannersOf(painted.board);
            assert.equal(banners.length, 2, 'both banners still render; the loss is the second result');
            assert.match(banners[0], /10 & 8/, 'the first matchup is the clean case inside the same page');
            assert.notEqual(banners[1], 'ALL SQUARE',
                'D2 reverted and the second matchup was still all square — the control is inert. got ' + banners[1]);
        });
    });

    test('CONTROL D3: the first segment instead of the total — the Nassau goes red, the match stays', () => {
        withCopy('board-team-d3', (src) => {
            const needle = "bases.find(m => m.id === '18') || bases[0]";
            assert.ok(src.includes(needle), 'D3 could not find the total-segment pick');
            return src.replace(needle, 'bases[0]');
        }, (page) => {
            const view = { page, via: 'render' };
            const good = assertPairAgrees(view, grossBlowout, 'D3 clean');
            assert.match(good.banners[0], /10 & 8/);
            let threw = false;
            try { assertPairAgrees(view, sideAWins, 'D3 reverted'); }
            catch (e) { threw = true; assert.match(String(e.message), /disagree|pair 1 banner/); }
            assert.ok(threw, 'D3 reverted and the Nassau total still matched the front nine');
        });
    });
});
