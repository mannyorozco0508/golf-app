// ============================================================================
// TRUST AND CLARITY
//
// Two things a golfer could not rely on.
//
// 1. The blue live status box printed "Manny UP" for a main bet and every press,
//    so four genuinely different states read as four identical strings - while the
//    engine already knew they were 8&7, 7&5, 5&3 and 3&2. statusPlain throws the
//    margin away; statusFull was sitting right beside it, unused.
//
// 2. A Match or Nassau created in SETUP settled correctly and then printed one
//    line - "Overall Match: Manny Won (-50)" - with no presses, no start holes and
//    no match net, while the identical wager created through ACTION printed its
//    whole history. Same money, two very different explanations.
//
// Both are display fixes. computeCombinedNetTotals is untouched.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const J = JSON.stringify;
const CD = makeCourseData(18);
const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

const ENG = (() => {
    const sb = loadJsFile('money-engine.js');
    ['action-model.js', 'settlement-engine.js', 'bet-strip.js'].forEach(f =>
        vm.runInContext(read(f), sb, { filename: f }));
    return sb;
})();
const call = c => { vm.runInContext(`window.__r = (function(){ ${c} })();`, ENG); return ENG.window.__r; };

// buildBetEntries lives in index.html (the scorecard builds the ticker), not in the
// engine files, so the blue-box tests need the page sandbox.
const PAGE = loadHtmlInlineScript('index.html',
    ['score-marks.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js']);
const pageCall = c => { vm.runInContext(`window.__r = (function(){ ${c} })();`, PAGE); return PAGE.window.__r; };

function duel(seedShift) {
    const P = makePlayers(['Marty', 'Manny'], ['5', '5']);
    P.forEach((p, i) => { p.playingForMoney = true; p.team = i === 0 ? 'Team 1' : 'Team 2'; });
    const S = {};
    CD.forEach((h, i) => {
        S[`p${P[0].id}_h${h.hole}`] = h.par + ((i % (seedShift || 3) === 0) ? 0 : 1);
        S[`p${P[1].id}_h${h.hole}`] = h.par;
    });
    return { P, S, id: k => String(P[k].id) };
}
function four() {
    const P = makePlayers(['Marty', 'Manny', 'Rocco', 'Steve'], ['5', '5', '10', '0']);
    P.forEach((p, i) => { p.playingForMoney = true; p.team = i % 2 === 0 ? 'Team 1' : 'Team 2'; });
    const S = {};
    CD.forEach((h, i) => P.forEach((p, pi) => { S[`p${p.id}_h${h.hole}`] = h.par + ((i + pi) % 3 === 0 ? 0 : 1); }));
    return { P, S, id: k => String(P[k].id) };
}
const ledger = d => call(`
    var o = computeCombinedNetTotals(${J(d)}, ${J(CD)}, ${J(d.scores)});
    var n = {}; Object.keys(o.netByName).forEach(function(k){ n[o.netByName[k].name] = o.netByName[k].net; });
    return n;`);
const receipts = d => call(`return buildSideMatchReceipts(${J(d)}, ${J(CD)}, ${J(d.scores)});`);

// ---------------------------------------------------------------------------
describe('THE BLUE STATUS BOX SHOWS THE MARGIN', () => {
    const f = duel(99);   // Manny wins every hole -> big, distinct margins
    const presses = [{ baseId: '18', startHole: 5 }, { baseId: '18', startHole: 9 }, { baseId: '18', startHole: 13 }];
    const entries = () => pageCall(`
        var c = calculateMatchEngine(${J(f.P)}, ${J(CD)}, ${J(f.S)}, 'net', 'match', 'manual', 50, 0, ${J(presses)});
        return buildBetEntries(c, ${J(CD)}).map(function(b){ return { plain: b.statusPlain, full: b.statusFull }; });`);

    test('four wagers produce four DIFFERENT status strings', () => {
        const full = entries().map(e => e.full);
        assert.equal(full.length, 4, 'main bet + three presses');
        assert.equal(new Set(full).size, 4, `all four must differ: ${J(full)}`);
    });

    test('the old field genuinely was ambiguous — this is why it changed', () => {
        const plain = entries().map(e => e.plain);
        assert.equal(new Set(plain).size, 1,
            'statusPlain collapsed four states into one, which is the bug being fixed');
    });

    test('each status carries a real margin, not just a name', () => {
        entries().forEach(e => assert.match(e.full, /\d/, `no margin in "${e.full}"`));
    });

    test('the ticker reads statusFull', () => {
        const idx = read('index.html');
        const line = idx.slice(idx.indexOf('const lbl = b.isPrimaryMatch'), idx.indexOf('const lbl = b.isPrimaryMatch') + 900);
        const code = line.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.ok(/\$\{b\.statusFull\}/.test(code));
        assert.ok(!/\$\{b\.statusPlain\}/.test(code), 'statusPlain discards the margin');
    });

    test('an all-square wager still reads as all square', () => {
        const level = duel(1);   // identical scores
        const out = pageCall(`
            var c = calculateMatchEngine(${J(level.P)}, ${J(CD)}, ${J(level.S)}, 'net', 'match', 'none', 50, 0, []);
            return buildBetEntries(c, ${J(CD)}).map(function(b){ return b.statusFull; });`);
        assert.match(out[0], /ALL SQUARE/i);
    });

    test('the status wording is NOT recalculated — it comes from the engine', () => {
        const idx = read('index.html');
        const fn = idx.slice(idx.indexOf('function buildBetEntries'), idx.indexOf('function buildBetEntries') + 2000);
        assert.ok(/statusFull:/.test(fn), 'the field must still be produced by buildBetEntries');
        assert.ok(/m\.finalResult/.test(fn), 'a closed wager shows its real final result');
    });
});

// ---------------------------------------------------------------------------
describe('A LEGACY MAIN WAGER IS EXPLAINED, NOT JUST SETTLED', () => {
    const f = duel(3);
    const legacy = {
        gameFormat: 'match', matchStake: 50, matchScoring: 'net', matchPressRule: 'manual',
        matchPresses: { a: { baseId: '18', startHole: 5 }, b: { baseId: '18', startHole: 9 } },
        players: f.P, courseData: CD, scores: f.S
    };

    test('it now produces a receipt block', () => {
        const r = receipts(legacy);
        assert.equal(r.length, 1);
        assert.equal(r[0].matchId, '__main');
    });

    test('every press is listed, with stake and start hole', () => {
        const segs = receipts(legacy)[0].segments;
        assert.equal(segs.length, 3, 'original + two presses');
        assert.equal(segs.filter(s => /Press/.test(s.label)).length, 2);
        segs.forEach(s => {
            assert.ok(s.stake > 0, `${s.label} has no stake`);
            assert.ok(s.startHole >= 1, `${s.label} has no start hole`);
            assert.ok(s.result, `${s.label} has no result`);
        });
    });

    test('the presses start where they were struck', () => {
        const starts = receipts(legacy)[0].segments.map(s => s.startHole);
        assert.deepEqual(starts.join(','), '1,5,9');
    });

    test('it reports a MATCH NET', () => {
        const r = receipts(legacy)[0];
        assert.ok(r.netTo, 'somebody won');
        assert.ok(r.netAmount > 0);
    });

    test('MONEY PARITY: the block agrees with the ledger exactly', () => {
        const r = receipts(legacy)[0];
        const led = ledger(legacy);
        assert.equal(Math.abs(led[r.netTo]), r.netAmount,
            `receipt ${r.netAmount} vs ledger ${led[r.netTo]}`);
        assert.equal(Object.values(led).reduce((a, b) => a + b, 0), 0);
    });

    test('a TEAM wager reconciles against the summed ledger', () => {
        const g = four();
        [['match', { matchStake: 50, matchScoring: 'net' }],
        ['bestball', { matchStake: 50, matchScoring: 'net' }],
        ['ryder', { matchStake: 50, matchScoring: 'net' }],
        ['nassau', { nassauStake: 20, nassauScoring: 'net', nassauPressRule: 'none' }]].forEach(([fmt, extra]) => {
            const d = Object.assign({ gameFormat: fmt, players: g.P, courseData: CD, scores: g.S }, extra);
            const r = receipts(d).find(x => x.matchId === '__main');
            assert.ok(r, `${fmt} produced no block`);
            const led = ledger(d);
            const teamSum = Object.keys(led).filter(n => led[n] > 0).reduce((a, n) => a + led[n], 0);
            assert.equal(teamSum, r.netAmount, `${fmt}: receipt ${r.netAmount} vs ledger ${teamSum}`);
        });
    });

    test('the block describes the sides the ENGINE actually played', () => {
        // A 4-player main Match is Team 1 vs Team 2, not a 1v1. The receipt must say so
        // rather than implying a pairing that never happened.
        const g = four();
        const d = { gameFormat: 'match', matchStake: 50, matchScoring: 'net', players: g.P, courseData: CD, scores: g.S };
        const r = receipts(d).find(x => x.matchId === '__main');
        assert.match(r.nameA, /\//, 'a team side must name both golfers');
        assert.match(r.nameB, /\//);
    });
});

// ---------------------------------------------------------------------------
describe('GUARD RAILS — nothing invented, nothing duplicated', () => {
    const g = four();
    const mk = (fmt, extra) => Object.assign({ gameFormat: fmt, players: g.P, courseData: CD, scores: g.S }, extra || {});

    test('a Stroke Play round produces NO wager block', () => {
        assert.equal(receipts(mk('stroke')).length, 0, 'how a round is scored is not a bet');
    });

    test('a main format with a $0 stake produces no block', () => {
        assert.equal(receipts(mk('match', { matchStake: 0, matchScoring: 'net' })).length, 0);
    });

    test('Skins, Dots, Stableford, Wolf and Hi-Lo are untouched', () => {
        // Each is settled by its own engine, so a match-play receipt would print a
        // result their money never came from.
        [['skins', { skinsBuyIn: 10, skinsCarryOver: true, skinsPotFormat: 'gross' }],
        ['dots', { dotPointVal: 5 }],
        ['stableford', { stablefordPointVal: 1 }],
        ['wolf', { wolfPointVal: 2 }],
        ['hilo', { hiloStake: 20 }]].forEach(([fmt, extra]) => {
            assert.equal(receipts(mk(fmt, extra)).length, 0, `${fmt} must not gain a match-play block`);
        });
    });

    test('the allowed formats match how money-engine settles them', () => {
        const se = read('settlement-engine.js');
        const fn = se.slice(se.indexOf('function legacyMainAsSideMatch'), se.indexOf('function buildSideMatchReceipts'));
        assert.ok(/\['match', 'bestball', 'scramble', 'ryder', 'nassau'\]/.test(fn));
        const me = read('money-engine.js');
        assert.ok(/gameFormat === 'nassau' \|\| \['match', 'bestball', 'scramble', 'ryder'\]\.includes\(gameFormat\)/.test(me),
            'if this list ever changes, the receipt list must change with it');
    });

    test('the main wager is NOT counted twice', () => {
        const d = Object.assign(mk('match', { matchStake: 50, matchScoring: 'net' }), {
            sideMatches: { s: { format: 'match', scoring: 'net', stake: 20, pressRule: 'none', teamAIds: [g.id(0)], teamBIds: [g.id(1)], startHole: 1, createdAt: 1 } }
        });
        const ids = receipts(d).map(r => r.matchId);
        assert.equal(ids.length, 2, 'one block each');
        assert.equal(ids.filter(k => k === '__main').length, 1);
        assert.equal(Object.values(ledger(d)).reduce((a, b) => a + b, 0), 0, 'and the money is still zero-sum');
    });

    test('an Action wager still produces exactly what it did before', () => {
        const d = { gameFormat: 'stroke', players: g.P, courseData: CD, scores: g.S,
            sideMatches: { s: { format: 'match', scoring: 'net', stake: 50, pressRule: 'none', teamAIds: [g.id(0)], teamBIds: [g.id(1)], startHole: 1, createdAt: 1 } } };
        const r = receipts(d);
        assert.equal(r.length, 1);
        assert.notEqual(r[0].matchId, '__main', 'a side match keeps its own id');
    });
});

// ---------------------------------------------------------------------------
describe('PROTECTED — display only', () => {
    test('the money path was not modified', () => {
        const se = read('settlement-engine.js');
        const fn = se.slice(se.indexOf('function computeCombinedNetTotals'), se.indexOf('function computeCombinedNetTotals') + 3000);
        assert.ok(!/legacyMainAsSideMatch/.test(fn),
            'the settlement path must never consult a display helper');
    });

    test('money-engine.js gained nothing', () => {
        assert.ok(!/legacyMainAsSideMatch|statusFull/.test(read('money-engine.js')));
    });

    test('the receipt builder is still the only one', () => {
        assert.equal((read('settlement-engine.js').match(/function buildSideMatchReceipts/g) || []).length, 1);
        assert.ok(!/function buildSideMatchReceipts/.test(read('settlement.html')),
            'the Receipt page must consume, not recalculate');
    });

    test('no press or handicap math changed', () => {
        const me = read('money-engine.js');
        assert.ok(/function getStrokes\(hcpIndex, numericHcp\)/.test(me));
        assert.ok(/function calculateMatchEngine/.test(me));
    });
});
