// ============================================================================
// LIVE SKINS LEDGERS ARE BUILT FROM THE RIGHT CONFIG (live-skins.js)
//
// THE MEASURED CASE (recon, 2026-09-13): 23 golfers, flights on, skins scope
// per flight, the Main Pool skins bucket set to GROSS, no skins wager. The
// scorecard printed "FLIGHT A · NET SKINS · NO CARRY" - a net, per-flight
// ledger for a pot that pool-engine pays gross across the whole field - because
// every live surface handed the ROUND to computeSkinsHoleLedger and the round
// has no skinsPotFormat of its own.
//
// THE RULE (live-skins.js header): one section per skins WAGER from that
// wager's own config; the pool bucket's own section from the pool's scoring
// and carry, never flighted; both when both; nothing when no skins money; the
// legacy skinsBuyIn > 0 shape unchanged.
//
// NON-VACUOUS BY CONSTRUCTION: the golfers carry real handicaps, so the net
// and gross ledgers name DIFFERENT winners on the same scores. A surface that
// still built from the round (split -> net) would list the wrong golfers, not
// merely the wrong word. Asserted below before anything else.
//
// HARNESS. mini-dom does not parse innerHTML; the surfaces are read back as
// the HTML strings the pages wrote. The engine files are not touched by this
// wave; the pool's winners come from pool-engine.js and the wager's from
// settlement-engine.js's per-flight view, and the screen is held to both.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const CD = makeCourseData(18);
const J = (v) => JSON.parse(JSON.stringify(v));
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// 23 golfers, real handicaps, 12 in A and 11 in B, 14 holes in.
const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jon', 'Kim', 'Lee', 'Max', 'Ned', 'Oli', 'Pat', 'Quy', 'Rae', 'Sal', 'Tom', 'Uma', 'Vic', 'Wes'];
const HCPS = [2, 9, 15, 4, 20, 7, 11, 0, 18, 6, 13, 3, 22, 8, 16, 1, 10, 24, 5, 12, 19, 14, 17];
const TAGS = NAMES.map((_, i) => i < 12 ? 'A' : 'B');
const P = makePlayers(NAMES, HCPS, 101, TAGS);
const SCORES = (() => {
    const s = {};
    P.forEach(p => CD.slice(0, 14).forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; }));
    const set = (i, h, d) => { s[`p${P[i].id}_h${h}`] = CD[h - 1].par + d; };
    set(0, 1, -1); set(4, 2, -1); set(12, 3, -1); set(7, 4, -1); set(20, 5, -1); set(2, 6, -1);
    set(15, 7, -1); set(17, 8, -1); set(9, 9, -1); set(13, 10, -1); set(1, 11, -1); set(19, 12, -1);
    set(3, 13, -1); set(3, 14, -1);   // Dee two in a row
    // A few high-handicappers with pars where the stroke makes a net birdie: Max
    // (22) on h3 is a gross birdie AND a net eagle; Rae (24) par on h11 nets a
    // birdie against Ben's gross birdie - net and gross disagree there.
    return s;
})();
const ON = { enabled: true, scopes: { skins: 'flight', birdies: 'field' } };
// 23 x $20 = $460: $200 to the net finish, the rest ($260) to the skins bucket.
// (pool-engine refuses an over-allocated pool and pays nothing, which would have
// made "the pool's winners" an empty list and the comparison vacuous.)
const POOL = { enabled: true, buyIn: 20, kp: { amount: 0, holes: [] }, net: { amount: 200, places: [100] },
    skins: { mode: 'remainder', scoring: 'gross', carryOver: false } };
const STACKED = { skins: { enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: false, startHole: 1 } };
const base = () => ({ players: J(P), gameFormat: 'stroke', skinsBuyIn: 0, skinsCarryOver: false, flights: J(ON),
    courseData: CD, scores: J(SCORES), settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar' });
const POOL_ONLY = Object.assign(base(), { moneyPool: J(POOL) });
// The same pool on a round whose skins scope is WHOLE-FIELD: one pot, one ledger.
const POOL_FIELD = Object.assign(base(), { moneyPool: J(POOL), flights: { enabled: true, scopes: { skins: 'field', birdies: 'field' } } });
const WAGER_ONLY = Object.assign(base(), { additionalGames: J(STACKED) });
const BOTH = Object.assign(base(), { moneyPool: J(POOL), additionalGames: J(STACKED) });

const ENG = (() => {
    const sb = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']);
    ['pool-engine.js', 'live-skins.js'].forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
})();
const winnersOf = (L) => L.holes.filter(r => r.official && r.state !== 'tie' && r.winner).map(r => [r.hole, String(r.winner.id)]);
const entriesFor = (data) => { ENG.__d = J(data); return vm.runInContext('liveSkinsLedgerEntries(__d, __d.courseData, __d.scores, {})', ENG); };

function surfaces(data) {
    const out = {};
    const ix = loadHtmlInlineScript('index.html', [], { search: '?game=LSC1' });
    ix.__d = J(data);
    vm.runInContext('currentData = __d; liveSkinsOpen = true; document.__mount(document.getElementById("live-skins-mount")); renderLiveSkins();', ix);
    out.widget = String(vm.runInContext('renderSkinsWidgetHtml()', ix));
    out.won = String(vm.runInContext('renderSkinsWonHtml()', ix));
    out.mount = String(vm.runInContext("document.getElementById('live-skins-mount').innerHTML", ix));
    const lb = loadHtmlInlineScript('leaderboard.html');
    lb.__d = J(data);
    vm.runInContext("currentMode = 'LSC1'; currentBoardData = __d; activeView = 'individual'; activeScoring = 'net';"
        + " document.__mount(document.getElementById('live-skins-mount')); renderBoard();", lb);
    out.board = String(vm.runInContext("document.getElementById('live-skins-mount').innerHTML || ''", lb));
    const st = loadHtmlInlineScript('settlement.html');
    st.__d = J(data);
    vm.runInContext('currentMode = "LSC1";', st);
    out.live = String(vm.runInContext('buildLiveResultsHtml(__d, __d.courseData, __d.scores)', st));
    return out;
}
const names = (html, cls) => [...html.matchAll(new RegExp(cls + '">([^<]*)', 'g'))].map(m => m[1].replace(/ — \d+$/, ''));
const skinsWonCards = (live) => live.slice(live.indexOf('SKINS WON')).split('SKINS WON').length - 1;

describe('NON-VACUOUS: on these scores net and gross name different winners', () => {
    test('the round-level read (split -> net) and the pool\'s gross disagree on at least one hole', () => {
        ENG.__d = J(POOL_ONLY);
        const fromRound = vm.runInContext('computeSkinsHoleLedger(Object.assign({}, __d, { flights: undefined }), __d.courseData, __d.scores, {})', ENG);
        assert.equal(fromRound.mode, 'split', 'the round itself resolves to split');
        const net = J(winnersOf(fromRound.net)), gross = J(winnersOf(fromRound.gross));
        assert.notDeepEqual(net, gross, 'net ' + JSON.stringify(net) + ' vs gross ' + JSON.stringify(gross));
        assert.ok(gross.length >= 6, 'enough gross skins to be worth listing: ' + gross.length);
    });
});

// RE-PINNED 2026-09-13: the Main Pool's skins bucket SPLITS by flight when the
// round's skins scope is per flight (pool-engine.js), so the pool section on
// POOL_ONLY (scope 'flight') is now two flighted entries, each holding its own
// pot's winners. The whole-field case (POOL_FIELD) keeps the one-section shape.
describe('POOL ONLY, scope WHOLE-FIELD: ONE section, GROSS, no flight headers, the pool\'s winners', () => {
    const entries = J(entriesFor(POOL_FIELD).map(e => ({ kind: e.section.kind, count: e.section.count, flight: e.flight, flighted: e.flighted, mode: e.bundle.mode, carry: e.bundle.carryOver, winners: winnersOf(e.L), n: e.L.participants.length })));
    const poolLines = J(vm.runInContext('(function(){ var r = computeMoneyPool(__d, __d.courseData, __d.scores); return r.skins.lines.map(function (l) { return [l.hole, String(l.winnerId)]; }); })()', ENG));

    test('one entry: the pool section, flight null, not flighted, mode gross, no carry, all 23 in it', () => {
        assert.deepEqual(entries, [{ kind: 'pool', count: 1, flight: null, flighted: false, mode: 'gross', carry: false, winners: entries[0].winners, n: 23 }]);
    });
    test('its winners are exactly what pool-engine pays, hole for hole', () => {
        assert.ok(poolLines.length >= 6, 'the pool paid skins: ' + poolLines.length);
        assert.deepEqual(entries[0].winners, poolLines);
    });
    test('rendered: index mount says WHOLE-FIELD GROSS SKINS, no FLIGHT anywhere on any surface, the chips are the pool\'s winners', () => {
        const S = surfaces(POOL_FIELD);
        assert.match(S.mount, /WHOLE-FIELD GROSS SKINS \u00B7 NO CARRY/);
        ['widget', 'won', 'mount', 'board'].forEach(k => assert.ok(!/FLIGHT|Flight [AB]/.test(S[k]), k + ' carries a flight header'));
        assert.ok(!/SKINS WON \u2014 FLIGHT/.test(S.live), 'settlement SKINS WON is not flighted');
        assert.equal(skinsWonCards(S.live), 1, 'one SKINS WON card');
        assert.ok(!/NET SKINS|Net Skins|Net \d/.test(S.mount + S.board), 'nothing says net');
        const byId = Object.fromEntries(P.map(p => [String(p.id), p.name]));
        const expected = [...new Set(poolLines.map(l => byId[l[1]]))].sort();
        assert.deepEqual(names(S.mount, 'ls-chip').sort(), expected);
        assert.deepEqual([...new Set(names(S.widget, 'lw-sname'))].sort(), expected);
        assert.deepEqual([...new Set(names(S.won, 'sw-name'))].sort(), expected);
        // The standings cards above SKINS WON use lr-name too; read the skins card only.
        assert.deepEqual([...new Set(names(S.live.slice(S.live.indexOf('SKINS WON')), 'lr-name'))].sort(), expected);
        assert.ok(!/\$\d/.test(S.mount.slice(0, S.mount.indexOf('Official'))), 'no per-golfer pot is invented for the pool: ' + S.mount.slice(0, 80));
    });
});

describe('POOL ONLY, scope PER FLIGHT: the bucket splits - two flighted entries, each its own pot\'s winners', () => {
    const entries = J(entriesFor(POOL_ONLY).map(e => ({ kind: e.section.kind, count: e.section.count, flight: e.flight, flighted: e.flighted, mode: e.bundle.mode, winners: winnersOf(e.L), n: e.L.participants.length })));
    const perFlight = J(vm.runInContext('(function(){ var r = computeMoneyPool(__d, __d.courseData, __d.scores); return r.skins.flights.map(function (f) { return { flight: f.flight, golfers: f.golfers, lines: f.lines.map(function (l) { return [l.hole, String(l.winnerId)]; }) }; }); })()', ENG));

    test('two entries, A then B, one pool section, flighted, gross, 12 and 11 golfers', () => {
        assert.deepEqual(entries.map(e => [e.kind, e.count, e.flight, e.flighted, e.mode, e.n]), [['pool', 1, 'A', true, 'gross', 12], ['pool', 1, 'B', true, 'gross', 11]]);
    });
    test('each flight\'s winners are exactly what pool-engine pays THAT flight, hole for hole', () => {
        assert.equal(perFlight.length, 2);
        perFlight.forEach((f, i) => { assert.ok(f.lines.length >= 3, 'flight ' + f.flight + ' paid: ' + f.lines.length); assert.deepEqual(entries[i].winners, f.lines, 'flight ' + f.flight); });
    });
    test('rendered: FLIGHT A / FLIGHT B heads on every surface, GROSS, no per-golfer pot', () => {
        const S = surfaces(POOL_ONLY);
        assert.match(S.mount, /FLIGHT A \u00B7 GROSS SKINS \u00B7 NO CARRY/); assert.match(S.mount, /FLIGHT B \u00B7 GROSS SKINS \u00B7 NO CARRY/);
        assert.equal((S.board.match(/LIVE SKINS \u2014 FLIGHT [AB]/g) || []).length, 2);
        assert.equal((S.live.match(/SKINS WON \u2014 FLIGHT [AB]/g) || []).length, 2);
        assert.match(S.won, /Flight A/); assert.match(S.won, /Flight B/);
        assert.ok(!/NET SKINS/.test(S.mount));
        assert.ok(!/\$\d/.test(S.mount.slice(0, S.mount.indexOf('Official'))), 'no per-golfer pot is invented for the pool');
    });
});

describe('WAGER ONLY: bucket off, a stacked GROSS wager -> per-flight sections, GROSS, the wager\'s winners', () => {
    const entries = J(entriesFor(WAGER_ONLY).map(e => ({ kind: e.section.kind, count: e.section.count, flight: e.flight, flighted: e.flighted, mode: e.bundle.mode, winners: winnersOf(e.L), n: e.L.participants.length })));
    const by = J(vm.runInContext('(function(){ var g = getRoundGames(__d).find(function (x) { return x.format === "skins"; }); var by = computeSkinsPayoutLinesByFlight(g.config, __d.courseData, __d.scores); return by.flights.map(function (f) { return { flight: f.flight, lines: f.gross.lines.map(function (l) { return [l.hole, String(l.winnerId || l.playerId || (l.winner && l.winner.id))]; }) }; }); })()', ENG));

    test('two entries, A then B, one wager section, flighted, gross, 12 and 11 golfers', () => {
        assert.deepEqual(entries.map(e => [e.kind, e.count, e.flight, e.flighted, e.mode, e.n]), [['wager', 1, 'A', true, 'gross', 12], ['wager', 1, 'B', true, 'gross', 11]]);
    });
    test('each flight\'s winners are the engine\'s per-flight gross lines for that wager', () => {
        assert.equal(by.length, 2);
        by.forEach((f, i) => {
            assert.ok(f.lines.length >= 3, 'flight ' + f.flight + ' paid skins: ' + f.lines.length);
            assert.deepEqual(entries[i].winners.map(w => w[0]), f.lines.map(l => l[0]), 'holes, flight ' + f.flight);
            assert.deepEqual(entries[i].winners.map(w => w[1]), f.lines.map(l => l[1]), 'winners, flight ' + f.flight);
        });
    });
    test('rendered: FLIGHT A / FLIGHT B heads, GROSS, the wager\'s $5 x golfers pot, no section label (one section)', () => {
        const S = surfaces(WAGER_ONLY);
        assert.match(S.mount, /FLIGHT A · GROSS SKINS · \$60 · NO CARRY/);
        assert.match(S.mount, /FLIGHT B · GROSS SKINS · \$55 · NO CARRY/);
        assert.equal((S.board.match(/LIVE SKINS — FLIGHT [AB]/g) || []).length, 2);
        assert.equal((S.live.match(/SKINS WON — FLIGHT [AB]/g) || []).length, 2);
        assert.ok(!/NET SKINS/.test(S.mount));
        assert.ok(!/lw-section|ls-section|sw-section|MAIN POOL/.test(S.widget + S.mount + S.won + S.board + S.live), 'no section label with one section');
        // The Finish Round list shows BOTH flights (it used to show A only).
        assert.match(S.won, /Flight A/); assert.match(S.won, /Flight B/);
    });
});

describe('BOTH: the wager\'s per-flight sections AND the pool\'s field-wide section', () => {
    const entries = J(entriesFor(BOTH).map(e => ({ kind: e.section.kind, label: e.section.label, count: e.section.count, flight: e.flight, flighted: e.flighted, mode: e.bundle.mode })));
    test('four entries: wager A, wager B, pool A, pool B (the bucket splits under the per-flight scope); every section counts 2', () => {
        assert.deepEqual(entries, [
            { kind: 'wager', label: '$5 Skins', count: 2, flight: 'A', flighted: true, mode: 'gross' },
            { kind: 'wager', label: '$5 Skins', count: 2, flight: 'B', flighted: true, mode: 'gross' },
            { kind: 'pool', label: 'Main Pool Skins', count: 2, flight: 'A', flighted: true, mode: 'gross' },
            { kind: 'pool', label: 'Main Pool Skins', count: 2, flight: 'B', flighted: true, mode: 'gross' }]);
    });
    test('rendered: section labels on every surface, the pool block flighted like the wager block (scope per flight)', () => {
        const S = surfaces(BOTH);
        assert.match(S.widget, /lw-section">\$5 Skins/); assert.match(S.widget, /lw-section">Main Pool Skins/);
        assert.match(S.won, /sw-section">\$5 Skins/); assert.match(S.won, /sw-section">Main Pool Skins/);
        assert.match(S.mount, /ls-section">\$5 Skins/); assert.match(S.mount, /ls-section">Main Pool Skins/);
        assert.match(S.board, /LIVE SKINS — \$5 SKINS — FLIGHT A/); assert.match(S.board, /LIVE SKINS — MAIN POOL SKINS — FLIGHT A/); assert.match(S.board, /LIVE SKINS — MAIN POOL SKINS — FLIGHT B/);
        assert.match(S.live, /SKINS WON — \$5 SKINS — FLIGHT B/); assert.match(S.live, /SKINS WON — MAIN POOL SKINS — FLIGHT B/);
        assert.ok(!/MAIN POOL SKINS<\/div>/.test(S.board + S.live), 'no unflighted pool head');
        const poolPart = S.mount.slice(S.mount.indexOf('ls-section">Main Pool Skins'));
        assert.match(poolPart, /FLIGHT A · GROSS SKINS · NO CARRY/); assert.match(poolPart, /FLIGHT B · GROSS SKINS · NO CARRY/);
        assert.equal(skinsWonCards(S.live), 4);
    });
});

describe('NOTHING, and the LEGACY shape', () => {
    test('no skins money at all -> every surface renders nothing', () => {
        const S = surfaces(base());
        assert.equal(S.widget, ''); assert.equal(S.won, ''); assert.equal(S.mount, ''); assert.equal(S.board, '');
        assert.ok(!/SKINS WON/.test(S.live));
    });
    test('legacy: skinsBuyIn > 0 on a stroke round with no wager and no bucket -> one section from the round, as before', () => {
        const d = Object.assign(base(), { skinsBuyIn: 5, flights: undefined });
        const e = J(entriesFor(d).map(x => ({ key: x.section.key, mode: x.bundle.mode, n: x.L.participants.length })));
        assert.deepEqual(e, [{ key: 'legacy', mode: 'split', n: 23 }]);
        assert.match(surfaces(d).mount, /WHOLE-FIELD NET SKINS · \$115/);
    });
    test('the pool bucket at mode "none" is not a section; a bucket narrowed by participantIds narrows the section', () => {
        const off = Object.assign(base(), { moneyPool: Object.assign(J(POOL), { skins: { mode: 'none' } }) });
        assert.deepEqual(entriesFor(off).length, 0);
        const narrow = Object.assign(base(), { moneyPool: Object.assign(J(POOL), { participantIds: P.slice(0, 5).map(p => String(p.id)) }) });
        // The five narrowed golfers are all in A (the first twelve are A), so the
        // split gives A the five and B nobody.
        assert.deepEqual(J(entriesFor(narrow).map(e => [e.flight, e.L.participants.length])), [['A', 5], ['B', 0]]);
    });
});

describe('THE SEAM (source): three surfaces, one builder, engines untouched', () => {
    test('no live surface hands the round to computeSkinsHoleLedger any more; each calls liveSkinsLedgerEntries', () => {
        ['index.html', 'leaderboard.html', 'settlement.html'].forEach(f => {
            const src = read(f).replace(/<script src=[^>]*><\/script>/g, '');
            assert.match(src, /liveSkinsLedgerEntries\(/, f);
            assert.match(read(f), /<script src="live-skins\.js"><\/script>/, f + ' loads the shared file');
            const direct = [...src.matchAll(/computeSkinsHoleLedger\((\w+)/g)].map(m => m[1]);
            // settlement.html's Receipt keeps its own pool ledger (ledgerCfg) - the precedent.
            assert.deepEqual(direct, f === 'settlement.html' ? ['ledgerCfg'] : [], f + ' direct calls: ' + direct);
        });
    });
    test('live-skins.js overrides the pool section\'s mode, carry, participants and flights, and never invents a pot', () => {
        const src = read('live-skins.js');
        assert.match(src, /skinsPotFormat: mp\.skins\.scoring === 'gross' \? 'gross' : 'net'/);
        assert.match(src, /skinsCarryOver: carry/);
        assert.match(src, /flights: perFlight \? data\.flights : undefined/, 'flights kept on the pool section exactly when the skins scope applies');
        assert.match(src, /skinsBuyIn: 0/);
        assert.match(src, /g\.format !== 'skins'/);
    });
    test('live-skins.js is precached and in the native bundle', () => {
        assert.match(read('sw.js'), /'\.\/live-skins\.js',/);
        assert.match(read('sync-mobile-web.js'), /'live-skins\.js',/);
    });
});
