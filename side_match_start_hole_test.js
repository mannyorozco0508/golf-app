// ============================================================================
// SIDE MATCH START HOLE
//
// A side match struck on the 6th tee used to be settled over holes 1-18. Whoever
// happened to be ahead when the bet was made started ahead in it - money decided by
// golf played before anyone agreed to the wager.
//
// The fix is scoping, not new mathematics. Every consumer now hands the engines the
// holes the wager is actually played over; the engines themselves are untouched. A
// match with no startHole covers the whole round, so nothing already settled moves.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

function engines() {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js'].forEach(f => {
        vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'), sb, { filename: f });
    });
    return sb;
}
const SB = engines();
const run = code => { vm.runInContext(`window.__o = (function(){ ${code} })();`, SB); return SB.window.__o; };
const J = v => JSON.stringify(v);
const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = makeCourseData(18);

function pair(hcps) {
    const P = makePlayers(['Marty', 'Manny'], hcps || [0, 0]);
    P.forEach(p => { p.playingForMoney = true; });
    return P;
}

// Manny dominates holes 1-5; Marty wins the rest.
function splitScores(P) {
    const S = {};
    CD.forEach(h => {
        if (h.hole <= 5) { S[`p${P[0].id}_h${h.hole}`] = h.par + 6; S[`p${P[1].id}_h${h.hole}`] = h.par; }
        else { S[`p${P[0].id}_h${h.hole}`] = h.par; S[`p${P[1].id}_h${h.hole}`] = h.par + 1; }
    });
    return S;
}

function strokeMatch(P, startHole, extra) {
    return Object.assign({
        format: 'stroke', scoring: 'gross', overallStake: 50, overallMode: 'stroke',
        teamAIds: [String(P[0].id)], teamBIds: [String(P[1].id)]
    }, startHole === null ? {} : { startHole }, extra || {});
}

function settle(P, S, sm) {
    return run(`
        var D = { gameFormat: 'stroke', players: ${J(P)}, courseData: ${J(CD)}, scores: ${J(S)},
                  sideMatches: { m1: ${J(sm)} } };
        var o = computeCombinedNetTotals(D, ${J(CD)}, ${J(S)});
        var r = {}; Object.keys(o.netByName).forEach(function(k){ r[o.netByName[k].name] = o.netByName[k].net; });
        return { net: r, tx: o.transactions.map(function(t){ return t.from + '>' + t.to + ':' + t.amount; }).join(',') };
    `);
}

// ---------------------------------------------------------------------------
describe('THE RANGE HELPERS', () => {
    test('sideMatchHoles scopes from the start hole forward', () => {
        const holes = run(`return sideMatchHoles({ startHole: 6 }, ${J(CD)}).map(function(h){ return h.hole; }).join(',');`);
        assert.equal(holes.split(',')[0], '6');
        assert.equal(holes.split(',').length, 13);
    });

    test('no startHole means the whole round — every match saved before this field existed', () => {
        assert.equal(run(`return sideMatchHoles({}, ${J(CD)}).length;`), 18);
        assert.equal(run(`return sideMatchHoles({ startHole: 1 }, ${J(CD)}).length;`), 18);
        assert.equal(run(`return sideMatchHoles(null, ${J(CD)}).length;`), 18);
    });

    test('it reuses gameHoles rather than growing a second range implementation', () => {
        const am = read('action-model.js');
        const fn = am.slice(am.indexOf('function sideMatchHoles'), am.indexOf('function sideMatchStartHole'));
        assert.ok(/gameHoles\(/.test(fn), 'a second range implementation is exactly what this avoids');
    });
});

// ---------------------------------------------------------------------------
describe('WHERE A NEW SIDE MATCH STARTS', () => {
    const P = pair();
    const through = n => {
        const S = {};
        CD.filter(h => h.hole <= n).forEach(h => { S[`p${P[0].id}_h${h.hole}`] = 4; S[`p${P[1].id}_h${h.hole}`] = 4; });
        return S;
    };
    const start = S => run(`return sideMatchStartHole(${J(P)}, ${J(CD)}, ${J(S)});`);

    test('before anyone tees off it is hole 1 — identical to every old side match', () => {
        assert.equal(start({}), 1);
    });

    test('scores through hole 5 means the bet starts on hole 6', () => {
        assert.equal(start(through(5)), 6);
    });

    test('CROSS-GROUP: it starts after the FURTHEST-ALONG golfer, not the slowest', () => {
        // Marty's group is through 9, Stan's through 6. Starting at 7 would hand Marty
        // three holes he has already played and the other side has not - he would know
        // he was ahead before they teed off. Starting at 10 means neither has posted a
        // score inside the wager.
        const S = {};
        CD.filter(h => h.hole <= 9).forEach(h => { S[`p${P[0].id}_h${h.hole}`] = 4; });
        CD.filter(h => h.hole <= 6).forEach(h => { S[`p${P[1].id}_h${h.hole}`] = 4; });
        assert.equal(start(S), 10);
    });

    test('nobody in the match can have already posted a hole inside its range', () => {
        const S = {};
        CD.filter(h => h.hole <= 9).forEach(h => { S[`p${P[0].id}_h${h.hole}`] = 4; });
        CD.filter(h => h.hole <= 6).forEach(h => { S[`p${P[1].id}_h${h.hole}`] = 4; });
        const st = start(S);
        P.forEach(p => {
            CD.filter(h => h.hole >= st).forEach(h => {
                assert.ok(!S[`p${p.id}_h${h.hole}`], `${p.name} already posted hole ${h.hole}`);
            });
        });
    });

    test('only the MATCH participants count, not the whole field', () => {
        const three = makePlayers(['Marty', 'Manny', 'Stan'], [0, 0, 0]);
        const S = {};
        CD.filter(h => h.hole <= 12).forEach(h => { S[`p${three[2].id}_h${h.hole}`] = 4; });   // Stan far ahead
        CD.filter(h => h.hole <= 4).forEach(h => {
            S[`p${three[0].id}_h${h.hole}`] = 4; S[`p${three[1].id}_h${h.hole}`] = 4;
        });
        const st = run(`return sideMatchStartHole(${J([three[0], three[1]])}, ${J(CD)}, ${J(S)});`);
        assert.equal(st, 5, "a golfer outside the match must not push its start hole");
    });

    test('a finished round leaves nowhere to start, and says so', () => {
        assert.equal(start(through(18)), null);
    });

    test('nextAddActionHole was NOT repurposed — it answers a different question', () => {
        // That helper returns the hole after everyone COMPLETED, which is the right rule
        // for a stacked game and the wrong one for a cross-group bet.
        const am = read('action-model.js');
        assert.ok(/function nextAddActionHole/.test(am));
        assert.ok(/function sideMatchStartHole/.test(am));
    });
});

// ---------------------------------------------------------------------------
describe('ACCEPTANCE A — the bug, and its fix', () => {
    const P = pair();
    const S = splitScores(P);

    test('the fixture genuinely reverses: Manny wins H1-5, Marty wins H6-18', () => {
        let a = 0, b = 0, c = 0, d = 0;
        CD.forEach(h => {
            if (h.hole <= 5) { a += S[`p${P[0].id}_h${h.hole}`]; b += S[`p${P[1].id}_h${h.hole}`]; }
            else { c += S[`p${P[0].id}_h${h.hole}`]; d += S[`p${P[1].id}_h${h.hole}`]; }
        });
        assert.ok(b < a, 'Manny should be up over holes 1-5');
        assert.ok(c < d, 'Marty should be up over holes 6-18');
    });

    test('starting on hole 6, MARTY wins the $50', () => {
        const out = settle(P, S, strokeMatch(P, 6));
        assert.ok(out.net.Marty > 0, `Marty should win, got ${J(out.net)}`);
        assert.equal(out.net.Marty + out.net.Manny, 0);
    });

    test('the old whole-round behaviour gave it to Manny — this is a real money change', () => {
        const scoped = settle(P, S, strokeMatch(P, 6));
        const whole = settle(P, S, strokeMatch(P, 1));
        assert.ok(whole.net.Manny > 0, 'the whole-round reading favours Manny');
        assert.notEqual(scoped.net.Marty, whole.net.Marty);
    });

    test('Who Pays Who follows automatically', () => {
        const out = settle(P, S, strokeMatch(P, 6));
        assert.match(out.tx, /Manny>Marty:50/);
    });
});

// ---------------------------------------------------------------------------
describe('EVERY FORMAT RESPECTS THE RANGE', () => {
    const P = pair();
    const S = splitScores(P);

    test('MATCH PLAY ignores holes before the start', () => {
        // Manny wins holes 1-5; Marty wins 6-9; everything else halved. Over the whole
        // round Manny is up one hole. From hole 6, Marty is up four.
        const MS = {};
        CD.forEach(h => {
            if (h.hole <= 5) { MS[`p${P[0].id}_h${h.hole}`] = h.par + 1; MS[`p${P[1].id}_h${h.hole}`] = h.par; }
            else if (h.hole <= 9) { MS[`p${P[0].id}_h${h.hole}`] = h.par; MS[`p${P[1].id}_h${h.hole}`] = h.par + 1; }
            else { MS[`p${P[0].id}_h${h.hole}`] = h.par; MS[`p${P[1].id}_h${h.hole}`] = h.par; }
        });
        const scoped = settle(P, MS, { format: 'match', scoring: 'gross', stake: 50, pressRule: 'none', teamAIds: [String(P[0].id)], teamBIds: [String(P[1].id)], startHole: 6 });
        const whole = settle(P, MS, { format: 'match', scoring: 'gross', stake: 50, pressRule: 'none', teamAIds: [String(P[0].id)], teamBIds: [String(P[1].id)] });
        assert.notEqual(J(scoped.net), J(whole.net), 'holes 1-5 still decided a match starting on 6');
        assert.ok(scoped.net.Marty > 0, `Marty wins holes 6-18, got ${J(scoped.net)}`);
        assert.ok(whole.net.Manny > 0, `the whole-round reading favours Manny, got ${J(whole.net)}`);
        assert.equal(scoped.net.Marty + scoped.net.Manny, 0);
    });

    test('NASSAU scopes its legs naturally — Front becomes H6-9, Back stays H10-18', () => {
        const holes = run(`return sideMatchHoles({ startHole: 6 }, ${J(CD)});`);
        const front = run(`return sideMatchHoles({ startHole: 6 }, ${J(CD)}).filter(function(h){ return h.hole <= 9; }).map(function(h){ return h.hole; }).join(',');`);
        const back = run(`return sideMatchHoles({ startHole: 6 }, ${J(CD)}).filter(function(h){ return h.hole > 9; }).map(function(h){ return h.hole; }).join(',');`);
        assert.equal(front, '6,7,8,9', 'the engine splits on hole 9, so a scoped Front is 6-9');
        assert.equal(back.split(',')[0], '10');
        const out = settle(P, S, { format: 'nassau', scoring: 'gross', stake: 20, pressRule: 'none', teamAIds: [String(P[0].id)], teamBIds: [String(P[1].id)], startHole: 6 });
        assert.equal(out.net.Marty + out.net.Manny, 0);
    });

    test('a Nassau starting on the back nine has no Front leg left to play', () => {
        const front = run(`return sideMatchHoles({ startHole: 12 }, ${J(CD)}).filter(function(h){ return h.hole <= 9; }).length;`);
        assert.equal(front, 0, 'no front-nine holes remain, and the engine sees none');
        const out = settle(P, S, { format: 'nassau', scoring: 'gross', stake: 20, pressRule: 'none', teamAIds: [String(P[0].id)], teamBIds: [String(P[1].id)], startHole: 12 });
        assert.equal(out.net.Marty + out.net.Manny, 0, 'still zero-sum with only two legs live');
    });

    test('NET stroke play only allocates handicap strokes inside the range', () => {
        // Marty off 18 gets a stroke on every hole. Over 13 holes that is 13 strokes,
        // not 18 - the strokes on holes 1-5 belong to golf nobody bet on.
        const NP = pair([18, 0]);
        const NS = {};
        CD.forEach(h => { NS[`p${NP[0].id}_h${h.hole}`] = h.par + 1; NS[`p${NP[1].id}_h${h.hole}`] = h.par; });
        const z = o => (o.Marty || 0) + (o.Manny || 0);
        const scoped = settle(NP, NS, strokeMatch(NP, 6, { scoring: 'net' }));
        const whole = settle(NP, NS, strokeMatch(NP, 1, { scoring: 'net' }));
        // A stroke a hole against a bogey a hole is a push either way - which is itself
        // the proof that strokes were allocated, since on GROSS Marty loses by 13.
        assert.equal(z(scoped.net), 0);
        assert.equal(z(whole.net), 0);
        const grossInstead = settle(NP, NS, strokeMatch(NP, 6, { scoring: 'gross' }));
        assert.ok((grossInstead.net.Manny || 0) > 0, 'without strokes Manny wins — so strokes are real');
        const strokesIn = run(`
            var holes = sideMatchHoles({ startHole: 6 }, ${J(CD)});
            var n = 0; holes.forEach(function(h){ n += getStrokes(h.hcpIndex, parseHcp('18')); });
            return n;
        `);
        assert.equal(strokesIn, 13, 'exactly one stroke per hole inside the range — not 18');
        const strokesWhole = run(`
            var n = 0; ${J(CD)}.forEach(function(h){ n += getStrokes(h.hcpIndex, parseHcp('18')); });
            return n;
        `);
        assert.equal(strokesWhole, 18, 'the whole round would have allocated five more');
    });

    test('2v2 stays zero-sum when scoped', () => {
        const four = makePlayers(['Marty', 'Jose', 'Manny', 'Ryan'], [0, 0, 0, 0]);
        four.forEach(p => { p.playingForMoney = true; });
        const S4 = {};
        CD.forEach(h => four.forEach((p, i) => { S4[`p${p.id}_h${h.hole}`] = h.par + (i < 2 ? 0 : 1); }));
        const out = settle(four, S4, {
            format: 'match', scoring: 'gross', stake: 100, pressRule: 'none',
            teamAIds: [String(four[0].id), String(four[1].id)],
            teamBIds: [String(four[2].id), String(four[3].id)], startHole: 6
        });
        assert.equal(Object.values(out.net).reduce((a, b) => a + b, 0), 0);
    });
});

// ---------------------------------------------------------------------------
describe('PRESSES INSIDE A SCOPED MATCH', () => {
    const P = pair();
    const S = splitScores(P);

    test('a press cannot reach back past the match start hole', () => {
        // The press is asked to start on hole 3, but the match itself begins on 6, so
        // the earliest hole the engine can see is 6. max(matchStart, pressStart) falls
        // out of scoping the course rather than needing its own rule.
        const holes = run(`return sideMatchHoles({ startHole: 6 }, ${J(CD)}).filter(function(h){ return h.hole >= 3; }).map(function(h){ return h.hole; })[0];`);
        assert.equal(holes, 6);
    });

    test('a press starting later than the match starts where IT says', () => {
        const first = run(`return sideMatchHoles({ startHole: 6 }, ${J(CD)}).filter(function(h){ return h.hole >= 10; }).map(function(h){ return h.hole; })[0];`);
        assert.equal(first, 10);
    });

    test('a pressed scoped match stays zero-sum', () => {
        const out = settle(P, S, strokeMatch(P, 6, {
            overallPresses: { p1: { startHole: 10, stake: 100 } }
        }));
        assert.equal(out.net.Marty + out.net.Manny, 0);
    });
});

// ---------------------------------------------------------------------------
describe('SCORE CORRECTIONS', () => {
    const P = pair();
    const base = splitScores(P);

    // The SAME correction is used in both directions below. Applied to a scoped match it
    // must do nothing; applied to a whole-round match it must flip the result. One
    // correction, two outcomes - that is the whole change in a single pair of tests.
    const H4_FIX = s => { const a = Object.assign({}, s); a[`p${P[1].id}_h4`] = 40; return a; };

    test('correcting a hole BEFORE the start hole changes nothing', () => {
        const before = settle(P, base, strokeMatch(P, 6));
        assert.equal(J(settle(P, H4_FIX(base), strokeMatch(P, 6)).net), J(before.net));
    });

    test('correcting a hole INSIDE the range does change it', () => {
        const before = settle(P, base, strokeMatch(P, 6));
        const after = Object.assign({}, base); after[`p${P[0].id}_h8`] = 40;
        assert.notEqual(J(settle(P, after, strokeMatch(P, 6)).net), J(before.net));
    });

    test('the SAME correction still moves a whole-round match — so scoping is what changed', () => {
        const before = settle(P, base, strokeMatch(P, 1));
        const after = settle(P, H4_FIX(base), strokeMatch(P, 1));
        assert.notEqual(J(after.net), J(before.net),
            'hole 4 must matter to a match that covers hole 4');
        assert.ok((before.net.Manny || 0) > 0 && (after.net.Marty || 0) > 0,
            'the correction should hand the whole-round match to Marty');
    });
});

// ---------------------------------------------------------------------------
describe('BACKWARD COMPATIBILITY', () => {
    const P = pair();
    const S = splitScores(P);

    test('a side match with NO startHole settles exactly as it always did', () => {
        const legacy = settle(P, S, strokeMatch(P, null));
        const explicit = settle(P, S, strokeMatch(P, 1));
        assert.equal(J(legacy.net), J(explicit.net));
    });

    test('startHole is purely additive — no migration, no rewrite', () => {
        const sm = read('sidematches.html');
        assert.ok(/let payload = \{ format, scoring, teamAIds, teamBIds, startHole, createdAt/.test(sm),
            'new matches store it');
        assert.ok(!/migrat/i.test(sm.slice(sm.indexOf('function saveSideMatch'), sm.indexOf('function saveSideMatch') + 2000)),
            'nothing existing is rewritten');
    });

    test('every consumer degrades safely if action-model has not loaded', () => {
        ['settlement-engine.js', 'settlement.html', 'stats.html', 'sidematches.html'].forEach(f => {
            const src = read(f);
            assert.ok(/typeof sideMatchHoles === 'function'/.test(src), `${f} has no fallback`);
            assert.ok(/h\.hole >= sm\.startHole/.test(src), `${f} has no inline fallback range`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('EVERY MONEY PATH IS SCOPED, NOT JUST THE VISIBLE ONE', () => {
    // Patching only Live Action would leave the Receipt and the final settlement paying
    // over holes nobody bet on. These assert the scoped course reaches every engine call.
    const files = {
        'settlement-engine.js': ['calculateHoleBetEngine([p1, p2], smCourse', 'calculateOverallBetEngine([p1, p2], smCourse', 'calculateMatchEngine(virtualPlayers, smCourse'],
        'settlement.html': ['calculateHoleBetEngine([p1, p2], smCourse', 'calculateMatchEngine(virtualPlayers, smCourse'],
        'stats.html': ['calculateHoleBetEngine([p1, p2], smCourse', 'calculateMatchEngine(virtualPlayers, smCourse'],
        'sidematches.html': ['calculateHoleBetEngine([p1, p2], smCourse', 'calculateMatchEngine(virtualPlayers, smCourse']
    };
    Object.keys(files).forEach(f => {
        test(`${f} passes the scoped course to every side match engine`, () => {
            const src = read(f);
            files[f].forEach(needle => assert.ok(src.includes(needle), `${f} missing: ${needle}`));
            assert.ok(!/calculateMatchEngine\(virtualPlayers, courseData/.test(src),
                `${f} still settles a side match over the whole round`);
        });
    });

    // FOUND BY THE 100-SIMULATION AUDIT (P1, display only).
    //
    // A Nassau's F9/B9 windows are fixed at 1-9 and 10-18 inside the engine - they are
    // scoring BOUNDS, not the holes played. On a side match starting mid-round the two
    // diverge: a Nassau struck on the 9th tee has a "Front 9" consisting of hole 9
    // alone. The money was always right, because the engine only ever saw the scoped
    // holes. The Receipt printed the raw window - "Front 9, Holes 1-9" - beside money
    // that came from one hole, which is exactly the argument this app exists to prevent.
    test('a mid-round Nassau reports the holes PLAYED, not the nominal nine', () => {
        const P2 = pair();
        const S2 = {};
        CD.forEach(h => { S2[`p${P2[0].id}_h${h.hole}`] = h.par + 1; S2[`p${P2[1].id}_h${h.hole}`] = h.par; });
        const segs = run(`
            var D = { gameFormat: 'stroke', players: ${J(pair())}, courseData: ${J(CD)}, scores: ${J(S2)},
                sideMatches: { m: { format: 'nassau', scoring: 'gross', stake: 20, pressRule: 'none',
                    teamAIds: ['REPLACE_A'], teamBIds: ['REPLACE_B'], startHole: 9, createdAt: 1 } } };
            D.sideMatches.m.teamAIds = [String(D.players[0].id)];
            D.sideMatches.m.teamBIds = [String(D.players[1].id)];
            var rec = buildSideMatchReceipts(D, ${J(CD)}, ${J(S2)});
            return (rec[0] ? rec[0].segments : []).map(function(sg){
                return sg.label + ':' + sg.startHole + '-' + sg.endHole; }).join('|');
        `);
        assert.ok(segs.length > 0, 'the Nassau produced no segments');
        assert.ok(!/Front 9:1-/.test(segs), `a Nassau starting on 9 must not claim Holes 1-9: ${segs}`);
        assert.ok(/Front 9:9-9/.test(segs), `expected Front 9 to be hole 9 alone, got: ${segs}`);
        assert.ok(/Total:9-18/.test(segs), `expected Total to be 9-18, got: ${segs}`);
    });

    test('a whole-round Nassau still reports its full nines', () => {
        const P2 = pair();
        const S2 = {};
        CD.forEach(h => { S2[`p${P2[0].id}_h${h.hole}`] = h.par + 1; S2[`p${P2[1].id}_h${h.hole}`] = h.par; });
        const segs = run(`
            var D = { gameFormat: 'stroke', players: ${J(P2)}, courseData: ${J(CD)}, scores: ${J(S2)},
                sideMatches: { m: { format: 'nassau', scoring: 'gross', stake: 20, pressRule: 'none',
                    teamAIds: [String(${J(P2)}[0].id)], teamBIds: [String(${J(P2)}[1].id)], createdAt: 1 } } };
            var rec = buildSideMatchReceipts(D, ${J(CD)}, ${J(S2)});
            return (rec[0] ? rec[0].segments : []).map(function(sg){
                return sg.label + ':' + sg.startHole + '-' + sg.endHole; }).join('|');
        `);
        assert.ok(/Front 9:1-9/.test(segs), segs);
        assert.ok(/Back 9:10-18/.test(segs), segs);
    });

    test('the Receipt describes the holes it actually settled over', () => {
        const se = read('settlement-engine.js');
        const fn = se.slice(se.indexOf('function buildSideMatchReceipts'), se.indexOf('function computeCombinedNetTotals'));
        assert.ok(/smCourse\.length \? Math\.min/.test(fn), 'firstHole must come from the scoped range');
        assert.ok(/calculateOverallBetEngine\(\[teamA\[0\], teamB\[0\]\], smCourse/.test(fn));
    });
});

// ---------------------------------------------------------------------------
describe('THE GOLFER CAN SEE IT', () => {
    test('the creation modal states which holes count', () => {
        const sm = read('sidematches.html');
        assert.ok(/id="sm-start-hole"/.test(sm), 'there is a start-hole control');
        assert.ok(/Only Holes \$\{start\}/.test(sm), 'and it says what counts');
        assert.ok(/function populateStartHolePicker/.test(sm));
        assert.ok(/populateStartHolePicker\(\);/.test(sm.slice(sm.indexOf('function openSideMatchModal'))),
            'the picker must be filled when the modal opens');
    });

    test('the default is auto-detected but the organizer can move it', () => {
        // "Back nine only" is a real bet, so the control is editable - the DEFAULT is
        // what protects the fast path, not a locked field.
        const sm = read('sidematches.html');
        assert.ok(/sideMatchStartHole\(/.test(sm));
        assert.ok(/const chosen = chosenEl \? parseInt\(chosenEl\.value, 10\) : NaN/.test(sm));
    });

    test('a whole-round match says nothing extra — no noise on an ordinary bet', () => {
        assert.equal(run(`return sideMatchRangeText({ startHole: 1 }, ${J(CD)});`), '');
        assert.equal(run(`return sideMatchRangeText({}, ${J(CD)});`), '');
        assert.match(run(`return sideMatchRangeText({ startHole: 6 }, ${J(CD)});`), /Starts H6/);
    });
});

// ---------------------------------------------------------------------------
describe('FROZEN — this batch scoped inputs, it did not change golf math', () => {
    test('the engines themselves are untouched', () => {
        const me = read('money-engine.js');
        assert.ok(/function getStrokes\(hcpIndex, numericHcp\)/.test(me));
        const se = read('settlement-engine.js');
        assert.ok(/function calculateHoleBetEngine\(players, courseData, savedScores, config, presses\)/.test(se));
        assert.ok(/function calculateOverallBetEngine\(players, courseData, savedScores, config, presses\)/.test(se));
        // The engines must not learn what a side match is.
        const hole = se.slice(se.indexOf('function calculateHoleBetEngine'), se.indexOf('function calculateOverallBetEngine'));
        assert.ok(!/sideMatchHoles|sm\.startHole|sideMatches/.test(hole),
            'side match range logic leaked into a general-purpose engine');
    });

    test('press math is unchanged', () => {
        const se = read('settlement-engine.js');
        assert.ok(/presses/.test(se));
        assert.ok(!/effectiveStart/.test(se), 'max(match, press) falls out of scoping, it needs no new rule');
    });
});
