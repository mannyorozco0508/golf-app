// ============================================================================
// THE SKINS POT CAN SPLIT EVENLY BETWEEN FLIGHTS (2026-09-20, v187)
//
// Since v126 a flighted Weekly Game divided its skins bucket between A and B BY
// HEADCOUNT: 12 A / 13 B on $800 paid $384 / $416. Marty's game splits it
// EVENLY - $400 / $400 - and needs that for a 25-golfer round. So:
//
//   flights.skinsSplit: 'even' | 'headcount'   (saved by admin.html's
//   flightsSetting(), beside the scopes; the wizard's default for a NEW round
//   is 'even'; a round saved before the choice existed has no key and is paid
//   BY HEADCOUNT, exactly as it was - nothing already played re-settles.)
//
// pool-engine.js reads it through ONE predicate, skinsSplitMode(data), and so
// do the surfaces that say which split applied (the Receipt's "Split by
// flight, evenly:" line, the Game tab's "one pot per flight, split evenly:").
// Odd dollars follow the v126 remainder rule: potB floors, A carries it -
// $801 -> $401 / $400. An empty flight keeps its v126 rule under both modes.
//
// WHAT MUST HOLD (each asserted): the pot total is unchanged - only its
// division moves; prizes + refunds + withheld === the pot; within a flight,
// skins pay exactly as today (same units, same winners, scaled to the pot);
// whole-field rounds and headcount rounds are byte-identical to before
// (pool_flights_golden_test.js holds the headcount case by sha and now
// carries the even case alongside it).
//
// CONTROLS, written so a slip fails loudly: a headcount round must NOT come
// out $400 / $400; the two pots must sum to the bucket to the cent; the pot
// total must be the same number under both modes.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const J = v => JSON.parse(JSON.stringify(v));
const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = makeCourseData(18);
const ENG = loadJsFile('pool-engine.js', ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);
const pool = data => { ENG.__d = J(data); return J(vm.runInContext('computeMoneyPool(__d, __d.courseData, __d.scores)', ENG)); };
const sumLines = lines => lines.reduce((a, l) => a + (l.cents || 0), 0);
// 25 names (the helper's own list stops at 23).
const NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel', 'Ivy India', 'Jon Juliet', 'Kim Kilo', 'Lee Lima', 'Max Mike', 'Ned November', 'Oli Oscar', 'Pat Papa', 'Quy Quebec', 'Rae Romeo', 'Sal Sierra', 'Tom Tango', 'Uma Uniform', 'Vic Victor', 'Wes Whiskey', 'Xan Xray', 'Yul Yankee'];

// 25 golfers x $40 = $1000; net $200 -> skins bucket $800 (or $801 with net $199).
// nA golfers tagged A, the rest B. split: 'even' | 'headcount' | undefined (no key).
function round(o) {
    o = o || {};
    const n = o.golfers || 25;   // 20/4 is a 24-golfer field: golfers 24, net $160 keeps the bucket at $800
    const r = wizardSavedRound({ code: 'EVEN25', courseData: CD, thru: 18, golfers: n, names: NAMES.slice(0, n), hcps: NAMES.slice(0, n).map((_, i) => (i * 7) % 20), overrides: Object.assign({
        additionalGames: {},
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 0, holes: [] }, net: { amount: o.net || 200, places: [100] }, skins: { mode: 'remainder', scoring: 'gross', carryOver: false } },
        flights: { enabled: true, scopes: { skins: o.scope || 'flight', birdies: 'field' } }
    }, o.overrides || {}) });
    if (o.split !== undefined) r.flights.skinsSplit = o.split; else delete r.flights.skinsSplit;
    const nA = o.nA === undefined ? 12 : o.nA;
    r.players.forEach((p, i) => { p.flight = i < nA ? 'A' : 'B'; });
    if (o.cents) r.settlementMode = 'exact';
    // Birdies so both flights win skins: hole 1 in A, hole 7 in B, hole 2 tied across the field.
    const b = (i, hole) => { if (r.players[i]) r.scores['p' + r.players[i].id + '_h' + hole] = CD[hole - 1].par - 1; };
    b(0, 1); b(1, 2); b(nA, 2); b(nA + 1, 7); b(2, 13);
    return r;
}
const pots = p => p.skins.flights.map(f => [f.flight, f.golfers, f.amountCents]);

describe('THE ENGINE: evenly', () => {
    test('12 A / 13 B on $800: $400 / $400 (today: $384 / $416)', () => {
        const even = pool(round({ split: 'even', nA: 12 }));
        assert.equal(even.skins.amountCents, 80000);
        assert.deepEqual(pots(even), [['A', 12, 40000], ['B', 13, 40000]]);
        const head = pool(round({ split: 'headcount', nA: 12 }));
        assert.deepEqual(pots(head), [['A', 12, 38400], ['B', 13, 41600]], 'CONTROL: by headcount is still by headcount');
    });
    test('20 A / 4 B on $800: $400 / $400 (today: $667 / $133)', () => {
        const even = pool(round({ split: 'even', nA: 20, golfers: 24, net: 160 }));
        assert.equal(even.skins.amountCents, 80000);
        assert.deepEqual(pots(even), [['A', 20, 40000], ['B', 4, 40000]]);
        assert.deepEqual(pots(pool(round({ split: 'headcount', nA: 20, golfers: 24, net: 160 }))), [['A', 20, 66700], ['B', 4, 13300]]);
    });
    test('13 A / 12 B on $800: $400 / $400 (today: $416 / $384)', () => {
        assert.deepEqual(pots(pool(round({ split: 'even', nA: 13 }))), [['A', 13, 40000], ['B', 12, 40000]]);
        assert.deepEqual(pots(pool(round({ split: 'headcount', nA: 13 }))), [['A', 13, 41600], ['B', 12, 38400]]);
    });
    test('odd dollars: $801 -> $401 / $400 on a whole-dollar round; $400.50 / $400.50 in cents', () => {
        const p = pool(round({ split: 'even', nA: 12, net: 199 }));
        assert.equal(p.skins.amountCents, 80100);
        assert.deepEqual(pots(p), [['A', 12, 40100], ['B', 13, 40000]]);
        const c = pool(round({ split: 'even', nA: 12, net: 199, cents: true }));
        assert.deepEqual(pots(c), [['A', 12, 40050], ['B', 13, 40050]]);
        // CONTROL: the remainder is never lost - the two pots are the bucket, to the cent.
        [p, c].forEach(x => assert.equal(x.skins.flights[0].amountCents + x.skins.flights[1].amountCents, x.skins.amountCents));
    });
    test('the pot total is unchanged; only its division moves', () => {
        const even = pool(round({ split: 'even' })), head = pool(round({ split: 'headcount' }));
        assert.equal(even.totalPoolCents, 100000); assert.equal(head.totalPoolCents, 100000);
        assert.equal(even.skins.amountCents, head.skins.amountCents);
        assert.equal(even.net.amountCents, head.net.amountCents);
        assert.notDeepEqual(pots(even), pots(head), 'CONTROL: the division did move');
    });
    test('prizes + refunds + withheld === the pot, and zero-sum, under evenly', () => {
        [round({ split: 'even', nA: 12 }), round({ split: 'even', nA: 20, golfers: 24, net: 160 }), round({ split: 'even', nA: 12, net: 199 }), round({ split: 'even', nA: 12, net: 199, cents: true })].forEach(d => {
            const p = pool(d);
            assert.ok(p.valid, p.errors.join(' | '));
            const prizes = sumLines(p.kp ? p.kp.lines : []) + sumLines(p.net.lines) + sumLines(p.skins.lines);
            assert.ok(prizes > 0, 'prizes were paid - the identity is not vacuous');
            assert.equal(prizes + p.refund.cents + (p.kpUnresolvedCents || 0), p.totalPoolCents, 'prizes + refunds + withheld');
            assert.equal(Object.values(p.perPlayerCents).reduce((a, c) => a + c, 0), 0, 'zero-sum');
            p.skins.flights.forEach(f => assert.equal(sumLines(f.lines) + f.unwonCents, f.amountCents, 'Flight ' + f.flight + ' pays exactly its pot'));
        });
    });
    test('within a flight, skins pay exactly as today: same winners, same units, scaled to the pot', () => {
        const even = pool(round({ split: 'even' })), head = pool(round({ split: 'headcount' }));
        even.skins.flights.forEach((f, i) => {
            const g = head.skins.flights[i];
            assert.deepEqual(f.lines.map(l => [l.playerId, l.units, l.holes]), g.lines.map(l => [l.playerId, l.units, l.holes]), 'Flight ' + f.flight + ' winners and units');
            assert.equal(f.totalUnits, g.totalUnits); assert.equal(f.pendingUnits, g.pendingUnits);
            assert.ok(f.lines.length > 0, 'Flight ' + f.flight + ' won at least one skin - the comparison is not vacuous');
        });
    });
});

describe('THE ENGINE: what does not move', () => {
    test('a round with no skinsSplit key is paid by headcount - identical to an explicit headcount, to the byte', () => {
        assert.deepEqual(pool(round({ nA: 12 })), pool(round({ split: 'headcount', nA: 12 })));
        assert.deepEqual(pots(pool(round({ nA: 12 }))), [['A', 12, 38400], ['B', 13, 41600]]);
    });
    test('a whole-field round ignores the key: identical with and without it', () => {
        const a = pool(round({ scope: 'field' })), b = pool(round({ scope: 'field', split: 'even' })), c = pool(round({ scope: 'field', split: 'headcount' }));
        assert.deepEqual(a, b); assert.deepEqual(a, c);
        assert.equal(a.skins.flights, undefined, 'one pot, no flights view');
    });
    test('flights off ignores the key', () => {
        const d = round({ split: 'even' }); d.flights = { enabled: false, scopes: { skins: 'flight' }, skinsSplit: 'even' };
        assert.equal(pool(d).skins.flights, undefined);
    });
    test('an empty flight under evenly keeps the v126 rule: the other flight takes the whole bucket', () => {
        assert.deepEqual(pots(pool(round({ split: 'even', nA: 25 }))), [['A', 25, 80000], ['B', 0, 0]]);
        assert.deepEqual(pots(pool(round({ split: 'even', nA: 0 }))), [['A', 0, 0], ['B', 25, 80000]]);
    });
    test('skinsSplitMode: one predicate, even only on the word even', () => {
        const m = d => vm.runInContext('skinsSplitMode(' + JSON.stringify(d) + ')', ENG);
        assert.equal(m({ flights: { skinsSplit: 'even' } }), 'even');
        assert.equal(m({ flights: { skinsSplit: 'headcount' } }), 'headcount');
        assert.equal(m({ flights: {} }), 'headcount');
        assert.equal(m({}), 'headcount'); assert.equal(m(null), 'headcount');
        assert.equal(m({ flights: { skinsSplit: 'Even' } }), 'headcount', 'no coercion');
    });
});

// ---------------------------------------------------------------------------
const run = (sb, e) => vm.runInContext(e, sb);
async function wizard(code) {
    const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=' + code });
    sb.crypto = require('crypto').webcrypto;
    run(sb, 'alert = function () {};');
    await new Promise(r => setTimeout(r, 20));
    run(sb, 'document.__mount(document.getElementById("player-list"));');
    return sb;
}
function storeRound(sb, code, record) {
    const orig = sb.db.ref.bind(sb.db);
    sb.db.ref = (p) => { const r = orig(p); if (p === 'events/' + code) r.once = () => Promise.resolve({ val: () => J(record), exists: () => true }); return r; };
}
const noteOf = sb => run(sb, "(function () { var e = document.getElementById('mp-skins-flight-note'); return e.style.display === 'none' ? null : e.textContent; })()");

describe('THE SETUP (admin.html): the choice, its default, and what an old round loads as', () => {
    test('DEFAULT STATE: flights on, nothing else touched -> the payload says even', async () => {
        const sb = await wizard('EVN001');
        run(sb, 'setFlightsEnabled(true)');
        assert.deepEqual(J(run(sb, 'flightsSetting()')), { enabled: true, scopes: { skins: 'flight', birdies: 'flight' }, skinsSplit: 'even' });
        assert.equal(run(sb, "document.getElementById('flights-split-switch').checked"), false, 'the switch rests on Evenly');
    });
    test('By headcount is a tap away, and the payload follows', async () => {
        const sb = await wizard('EVN002');
        run(sb, 'setFlightsEnabled(true)'); run(sb, "setFlightsSkinsSplit('headcount')");
        assert.equal(J(run(sb, 'flightsSetting()')).skinsSplit, 'headcount');
        assert.equal(run(sb, "document.getElementById('flights-split-switch').checked"), true);
        run(sb, "setFlightsSkinsSplit('even')");
        assert.equal(J(run(sb, 'flightsSetting()')).skinsSplit, 'even');
    });
    test('flights off -> null, as before (no key anywhere)', async () => {
        const sb = await wizard('EVN003');
        assert.equal(run(sb, 'flightsSetting()'), null);
    });
    test('the row is shown only while Skins is per flight', async () => {
        const sb = await wizard('EVN004');
        run(sb, 'setFlightsEnabled(true)');
        const disp = () => run(sb, "document.getElementById('flights-split-row').style.display");
        run(sb, "setFlightScope('skins', 'field')"); assert.equal(disp(), 'none');
        run(sb, "setFlightScope('skins', 'flight')"); assert.equal(disp(), '');
    });
    test('AN OLD ROUND (no key) loads as By headcount; a round saved even loads as Evenly', async () => {
        const base = { eventName: 'Old', players: [{ id: 101, name: 'Ann', hcp: '9', flight: 'A' }, { id: 102, name: 'Ben', hcp: '9', flight: 'B' }], courseData: CD, scores: {},
            activeCourseKey: 'comm_links', courseName: 'Test Links', gameFormat: 'stroke' };
        for (const [flights, want] of [[{ enabled: true, scopes: { skins: 'flight', birdies: 'field' } }, 'headcount'], [{ enabled: true, scopes: { skins: 'flight', birdies: 'field' }, skinsSplit: 'even' }, 'even'], [{ enabled: true, scopes: { skins: 'flight', birdies: 'field' }, skinsSplit: 'headcount' }, 'headcount']]) {
            const sb = await wizard('EVN005');
            run(sb, 'globalCourses = ' + JSON.stringify({ comm_links: { name: 'Test Links', data: CD } }) + ';');
            storeRound(sb, 'EVN005', Object.assign({}, base, { flights }));
            run(sb, 'loadModeData("EVN005");');
            await new Promise(r => setTimeout(r, 20));
            assert.equal(run(sb, 'loadedExistingRound'), true);
            assert.equal(J(run(sb, 'flightsSetting()')).skinsSplit, want, JSON.stringify(flights));
        }
    });
    test('the Weekly Game note says which split: two equal pots by default, by headcount when chosen', async () => {
        const sb = await wizard('EVN006');
        run(sb, "document.getElementById('mp-skins-mode').value = 'remainder'; setFlightsEnabled(true);");
        assert.equal(noteOf(sb), 'With Skins per flight, the Weekly Game’s skins bucket splits into two equal pots — Flight A and Flight B each play their own. KP and Net Finish stay whole-field.'.replace('’', "'"));
        run(sb, "setFlightsSkinsSplit('headcount')");
        assert.equal(noteOf(sb), 'With Skins per flight, the Weekly Game\'s skins bucket splits into two pots by headcount — Flight A and Flight B each play their own. KP and Net Finish stay whole-field.');
    });
});

// ---------------------------------------------------------------------------
describe('THE SURFACES say whichever split applies', () => {
    const receipt = data => {
        const st = loadHtmlInlineScript('settlement.html');
        st.__d = J(data);
        vm.runInContext('currentMode = "EVEN25"; document.__mount(document.getElementById("money-pool-section")); renderMoneyPoolSection(__d, __d.courseData, __d.scores)', st);
        return String(vm.runInContext("document.getElementById('money-pool-section').innerHTML", st)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    };
    test('the Receipt: "Split by flight, evenly: Flight A $400 (12 golfers) · Flight B $400 (13 golfers)"', () => {
        assert.match(receipt(round({ split: 'even' })), /Split by flight, evenly: Flight A \$400 \(12 golfers\) · Flight B \$400 \(13 golfers\)/);
    });
    test('the Receipt, headcount and no-key: the v126 sentence, unchanged', () => {
        assert.match(receipt(round({ split: 'headcount' })), /Split by flight, by headcount: Flight A \$384 \(12 golfers\) · Flight B \$416 \(13 golfers\)/);
        assert.match(receipt(round({})), /Split by flight, by headcount: Flight A \$384/);
    });
    const game = data => {
        const sb = loadHtmlInlineScript('game.html', ['handicap.js', 'text-safe.js', 'action-model.js', 'match-engine.js', 'money-engine.js', 'settlement-engine.js', 'pool-engine.js', 'grouping.js'], { search: '?game=even25' });
        vm.runInContext("document.__mount(document.getElementById('game-content'))", sb);
        const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/EVEN25');
        h.cb({ val: () => J(data), exists: () => true });
        return String(vm.runInContext("document.getElementById('game-content').innerHTML", sb)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    };
    test('the Game tab: "one pot per flight, split evenly: Flight A $400 (12 golfers), Flight B $400 (13 golfers)."', () => {
        assert.match(game(round({ split: 'even' })), /one pot per flight, split evenly: Flight A \$400 \(12 golfers\), Flight B \$400 \(13 golfers\)\./);
        assert.match(game(round({ split: 'even', nA: 20, golfers: 24, net: 160 })), /split evenly: Flight A \$400 \(20 golfers\), Flight B \$400 \(4 golfers\)\./);
    });
    test('the Game tab, headcount and no-key', () => {
        assert.match(game(round({ split: 'headcount' })), /one pot per flight, split by headcount: Flight A \$384 \(12 golfers\), Flight B \$416 \(13 golfers\)\./);
        assert.match(game(round({})), /split by headcount: Flight A \$384/);
    });
    test('both surfaces read the engine\'s predicate, not the amounts', () => {
        assert.match(read('settlement.html'), /skinsSplitMode\(data\) === 'even'\) \? 'evenly' : 'by headcount'/);
        assert.match(read('game.html'), /skinsSplitMode\(data\) === 'even'\) \? 'split evenly' : 'split by headcount'/);
    });
});
