// ============================================================================
// A RE-SAVE ON A SCORED ROUND DROPS NOTHING, AND THE ARITHMETIC MOVES (2026-09-19).
//
// Manny's weekly case: a handicap arrives late, or a golfer's flight, several
// holes in. He reopens the wizard on the same code, edits, saves. The recon
// (rattle-recon-late-handicaps) found the answer true BY SHAPE - the save is
// one .update() of a payload that carries no result key, and nothing net is
// ever stored - and found no test that fires the wizard on a round that already
// has scores and diffs the record afterwards. This is that test.
//
// THE ROUND: six golfers in two flights, nine holes posted, and everything the
// scorecard can write on the course: dots on a hole, a stroke press, a KP leader
// and winner, a wolf call, the organizer's verification stamp, an audit line,
// and a dots game ADDED ON THE COURSE (additionalGameInstances - the map the
// wizard rewrites whole, and once erased; foreignGameInstances carries it).
// THE EDIT: Dee's handicap 13 -> 20; Cal moves from flight A to B.
// THE PROOF, in two halves:
//   1. the record: the one update carries players (same ids, the new hcp, the
//      new flight), courseData (the card, unchanged) and the game instance -
//      and NO result key; and no write touches scores, dots, presses, KP, wolf
//      calls, the audit log or the stamp;
//   2. the arithmetic: the same engines, run on the record before and after
//      the merge, give Dee a different net (a net skin on hole 4 - already
//      played - that two strokes on stroke index 1 now win outright) and
//      re-split the flight pots (3+3 -> 2+4 golfers; Cal's gross skin on hole
//      5 - already played - moves from A's pot to B's).
//
// HARNESS. mini-dom: the wizard's OWN arrival loader finds the record in the
// stub's __dbReads; the loader's roster rows have no parsed inputs under
// mini-dom, so they are rebuilt with the SAME ids through addPlayerRow (the
// shape skins_flag_persistence_test.js uses); saveSettings() is the page's own
// save; the engines are loaded the way flights_live_surfaces_test loads them.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const J = (v) => JSON.parse(JSON.stringify(v));
const run = (sb, c) => vm.runInContext(c, sb);
const CODE = 'RESAVE1';
const CD = makeCourseData(18);      // hole 4 is stroke index 1, hole 5 index 9
const ON = { enabled: true, scopes: { skins: 'flight', birdies: 'flight' } };

// Ann Ben Cal in A; Dee Eli Fay in B. Nine holes posted, all 5s, except Cal's 4
// on hole 5 - a gross skin in A as things stand.
function scoredRound() {
    const players = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay'], [0, 4, 9, 13, 5, 6], 101, ['A', 'A', 'A', 'B', 'B', 'B']);
    const scores = {};
    players.forEach((p) => { for (let h = 1; h <= 9; h++) scores[`p${p.id}_h${h}`] = 5; });
    scores.p103_h5 = 4;
    return {
        eventName: 'Monday', roundDay: 'monday', gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'split', skinsCarryOver: false,
        activeCourseKey: 'comm_links', courseName: 'Test Links', courseData: CD, players, scores, flights: ON,
        settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar', organizerToken: 'tok-resave',
        // everything the course writes, as of the ninth hole
        dots: { h3: { p101: ['sandy'], p104: ['greenie'] } },
        strokePresses: { k1: { startHole: 4, stake: 5, byId: '102' } },
        kpLeaders: { h3: { playerId: '104', playerName: 'Dee', group: 2, distanceInches: 88, updatedAt: 1 } },
        kpWinners: { h3: '104' },
        wolfCalls: { h2: { wolf: '101', call: 'lone' } },
        scoresVerified: { verified: true, verifiedAt: 2, by: 'organizer' },
        auditLog: { a1: { at: 3, what: 'p101_h2 6 -> 5' } },
        additionalGameInstances: { dk1: { format: 'dots', enabled: true, startHole: 5, dotPointVal: 1, participantIds: ['101', '102', '103'], createdAt: 4 } }
    };
}

// The wizard on the round, through its own arrival loader.
async function openWizard(rec) {
    const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=' + CODE,
        beforeRun(sandbox) { sandbox.__dbReads = { ['events/' + CODE]: J(rec) }; } });
    sb.crypto = require('crypto').webcrypto;
    run(sb, 'alert = function (m) { window.__alerts = (window.__alerts || []).concat([String(m)]); };');
    await new Promise((r) => setTimeout(r, 80));       // the arrival load, resolved
    assert.equal(run(sb, 'loadedExistingRound'), true, 'the wizard knows it is editing this round');
    assert.equal(run(sb, 'Object.keys(loadedScores).length'), 54, 'and holds the 54 posted scores (6 golfers x 9 holes)');
    assert.equal(run(sb, 'flightsEnabledNow()'), true, 'flights restored on');
    run(sb, 'document.__mount(document.getElementById("player-list"));');
    return sb;
}
// The loader's rows have no parsed inputs under mini-dom: rebuild them, SAME
// ids, with the edit applied (Dee 13 -> 20, Cal A -> B).
function rebuildRoster(sb, rec, edit) {
    run(sb, 'document.getElementById("player-list").innerHTML = "";');
    rec.players.forEach((p) => {
        const hcp = (edit && edit.hcp && edit.hcp[p.id] !== undefined) ? String(edit.hcp[p.id]) : p.hcp;
        const flight = (edit && edit.flight && edit.flight[p.id]) || p.flight;
        run(sb, `addPlayerRow(${JSON.stringify(p.name)}, ${JSON.stringify(hcp)}, "", "red", false, true, 6, true, ${p.id}, ${JSON.stringify(flight)})`);
        run(sb, `(function () {
            var rows = document.querySelectorAll('.player-row'); var row = rows[rows.length - 1];
            var n = document.createElement('input'); n.className = 'p-name-input'; n.value = ${JSON.stringify(p.name)}; row.appendChild(n);
            var h = document.createElement('input'); h.className = 'p-hcp-input'; h.value = ${JSON.stringify(hcp)}; row.appendChild(h);
            var b = row.querySelector('.p-flight-input');
            if (!b) { b = document.createElement('button'); b.className = 'p-flight-input'; row.appendChild(b); }
            b.setAttribute('data-flight', ${JSON.stringify(flight)});
        })();`);
    });
    run(sb, 'globalCourses = ' + JSON.stringify({ comm_links: { name: 'Test Links', data: CD } }) + ';');
    run(sb, "courseHiddenSelect.value = 'comm_links'; courseSearchInput.value = 'Test Links';");
    run(sb, "document.getElementById('game-format-select').value = 'skins';");
    run(sb, "document.getElementById('skins-buyin').value = '8';");
    run(sb, "document.getElementById('skins-carryover').value = 'false';");
    run(sb, "document.getElementById('skins-pot-format') && (document.getElementById('skins-pot-format').value = 'split');");
}
async function save(sb) {
    run(sb, 'saveSettings();');
    await new Promise((r) => setTimeout(r, 40));
    return sb.__dbWrites.slice();
}
const EDIT = { hcp: { 104: 20 }, flight: { 103: 'B' } };
const RESULT_KEYS = ['scores', 'dots', 'wolfCalls', 'matchPresses', 'strokePresses', 'sideMatches', 'kpLeaders', 'kpWinners', 'kpConfirmed', 'kpNoWinner', 'kpCancelled', 'auditLog', 'scoresVerified'];

// The engines, as the pages load them.
const ENG = (() => {
    const sb = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']);
    ['pool-engine.js', 'live-skins.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
})();
const byFlight = (rec) => ENG.computeSkinsPayoutLinesByFlight(J(rec), CD, J(rec.scores));
const netOf = (rec, name) => ENG.computeCombinedNetTotals(J(rec), CD, J(rec.scores)).netByName[name.toLowerCase()].net;   // keyed by lowercase name

describe('1. THE RECORD: one update, the roster and the card, no result key, nothing else touched', () => {
    test('the save is ONE update to events/CODE carrying players, courseData, flights and the game instance - and no result key', async () => {
        const rec = scoredRound();
        const sb = await openWizard(rec);
        rebuildRoster(sb, rec, EDIT);
        const writes = await save(sb);
        const ups = writes.filter((w) => w.path === 'events/' + CODE && w.op === 'update');
        assert.equal(ups.length, 1, 'exactly one update to the round: ' + JSON.stringify(writes.map((w) => w.op + ' ' + w.path)));
        const payload = J(ups[0].value);
        const keys = Object.keys(payload);
        assert.ok(keys.includes('players') && keys.includes('courseData') && keys.includes('flights') && keys.includes('additionalGameInstances'), 'keys: ' + keys.join(','));
        const leaked = keys.filter((k) => RESULT_KEYS.some((r) => k === r || k.startsWith(r + '/')));
        assert.deepEqual(leaked, [], 'A RESULT KEY IS IN THE PAYLOAD: ' + leaked.join(','));
        assert.deepEqual(sb.__alerts || [], [], 'no alert: ' + JSON.stringify(sb.__alerts));
    });
    test('player ids are unchanged; Dee carries 20, Cal carries B, everyone else what they had', async () => {
        const rec = scoredRound();
        const sb = await openWizard(rec);
        rebuildRoster(sb, rec, EDIT);
        const payload = J((await save(sb)).find((w) => w.path === 'events/' + CODE && w.op === 'update').value);
        assert.deepEqual(payload.players.map((p) => p.id), [101, 102, 103, 104, 105, 106], 'THE IDS MOVED - every score is keyed by them');
        assert.deepEqual(payload.players.map((p) => p.hcp), ['0', '4', '9', '20', '5', '6']);
        assert.deepEqual(payload.players.map((p) => p.flight), ['A', 'A', 'B', 'B', 'B', 'B']);
        assert.deepEqual(payload.players.map((p) => p.name), ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay']);
        // v187: a re-save writes the split it was paid by. ON carries no skinsSplit
        // (a round from before the choice), so the record now says 'headcount' -
        // the same arithmetic, made explicit; skins_even_split_test.js proves the
        // engine treats the two identically.
        assert.deepEqual(payload.flights, Object.assign({}, ON, { skinsSplit: 'headcount' }));
    });
    test('the card is written back unchanged, and the on-course dots game survives byte for byte', async () => {
        const rec = scoredRound();
        const sb = await openWizard(rec);
        rebuildRoster(sb, rec, EDIT);
        const payload = J((await save(sb)).find((w) => w.path === 'events/' + CODE && w.op === 'update').value);
        assert.deepEqual(payload.courseData, CD, 'the stroke index the scores were played under');
        assert.deepEqual(payload.additionalGameInstances.dk1, rec.additionalGameInstances.dk1, 'THE ADDED GAME WAS DROPPED');
        assert.equal(payload.organizerToken, 'tok-resave', 'the shared organizer link survives');
        assert.equal(payload.settlementMode, undefined); assert.equal(payload.skinsRounding, undefined);
    });
    test('NO write path touches scores, dots, presses, KP, wolf calls, the audit log or the stamp', async () => {
        const rec = scoredRound();
        const sb = await openWizard(rec);
        rebuildRoster(sb, rec, EDIT);
        const writes = await save(sb);
        const touched = writes.filter((w) => new RegExp('events/' + CODE + '/(' + RESULT_KEYS.join('|') + ')').test(w.path));
        assert.deepEqual(touched, [], 'a result node was written: ' + JSON.stringify(touched));
        assert.ok(writes.every((w) => w.op !== 'set' || w.path !== 'events/' + CODE), 'no whole-record set');
    });
});

describe('2. THE ARITHMETIC MOVES - on holes already played', () => {
    // The record after the merge the SDK performs: the stored round with the
    // payload's keys replaced. Nothing else on the record changes.
    async function beforeAndAfter() {
        const rec = scoredRound();
        const sb = await openWizard(rec);
        rebuildRoster(sb, rec, EDIT);
        const payload = J((await save(sb)).find((w) => w.path === 'events/' + CODE && w.op === 'update').value);
        return { before: rec, after: Object.assign(J(rec), payload) };
    }
    test('Dee\'s net changes: with 20 she has two strokes on hole 4 (index 1, already played) and wins the net skin she tied before', async () => {
        const { before, after } = await beforeAndAfter();
        const b = byFlight(before).flights.find((f) => f.flight === 'B');
        const a = byFlight(after).flights.find((f) => f.flight === 'B');
        assert.ok(!b.net.lines.some((l) => l.hole === 4), 'before: hole 4 is a three-way net tie in B, no line: ' + JSON.stringify(b.net.lines));
        const won = a.net.lines.find((l) => l.hole === 4);
        assert.ok(won && won.playerName === 'Dee', 'after: Dee wins hole 4 net: ' + JSON.stringify(a.net.lines));
        // Measured: 8 -> 5. Dee GAINS hole 4 and LOSES ground because Cal's move
        // brings a fourth golfer (and his net skins) into B's pot - the point is
        // that a hole already played re-settles, not which way the money goes.
        assert.notEqual(netOf(before, 'Dee'), netOf(after, 'Dee'), 'Dee\'s money did not move');
    });
    test('the flight pots re-split: 3+3 golfers becomes 2+4, and Cal\'s gross skin on hole 5 (already played) moves from A\'s pot to B\'s', async () => {
        const { before, after } = await beforeAndAfter();
        const bf = byFlight(before).flights, af = byFlight(after).flights;
        assert.deepEqual(J(bf.map((f) => [f.flight, f.golfers])), [['A', 3], ['B', 3]]);
        assert.deepEqual(J(af.map((f) => [f.flight, f.golfers])), [['A', 2], ['B', 4]], 'THE POT DID NOT RE-SPLIT');
        const A0 = bf.find((f) => f.flight === 'A'), B1 = af.find((f) => f.flight === 'B'), A1 = af.find((f) => f.flight === 'A');
        assert.ok(A0.gross.lines.some((l) => l.hole === 5), 'before: hole 5 is a gross skin in A: ' + JSON.stringify(A0.gross.lines));
        assert.ok(B1.gross.lines.some((l) => l.hole === 5), 'after: hole 5 is a gross skin in B: ' + JSON.stringify(B1.gross.lines));
        assert.ok(!A1.gross.lines.some((l) => l.hole === 5), 'after: A no longer holds hole 5');
        assert.notEqual(A0.gross.pot, A1.gross.pot, 'A\'s pot changed with its headcount');
        assert.notEqual(netOf(before, 'Cal'), netOf(after, 'Cal'), 'Cal\'s money moved with his flight');
    });
});
