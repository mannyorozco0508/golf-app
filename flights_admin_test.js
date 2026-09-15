// ============================================================================
// FLIGHTS IN THE WIZARD: the Step 5 block, the row control, the payload.
// (Flights, Wave 2, Step 4, 2026-09-13.)
//
// What admin.html now does:
//   - Step 5 carries a Flights (A/B) switch, OFF by default, with a live
//     "A: n \u00B7 B: n" count and two scope switches (Skins, Birdies; both
//     default per flight) that show only when it is on.
//   - When on, every row gets a .p-flight-input control (a button: A / B,
//     tap to flip) - a sixth column on a plain row, a second line spanning
//     the row where team/squad columns already sit. Built as a DOM element.
//   - The tag rides through captureCurrentPlayerInputs, so every rebuild
//     (format switch, delete, add, paste) hands it back to addPlayerRow.
//   - The payload writes flights: { enabled, scopes } when on and NULL when
//     off (update() deletes the key - the moneyPool pattern), and when on,
//     flight: 'A' | 'B' EXPLICITLY on every golfer.
//   - loadModeData restores the switch and scopes BEFORE the roster rebuild.
//
// THE LIVE COUNT IS THE SAVE'S OWN READ. refreshFlightsCount() calls
// captureCurrentPlayerInputs() - the same row read every rebuild and the
// save go through - never a counter kept beside the rows. The tests below
// hold the count against the payload after a format switch and a delete.
//
// Same harness as skins_flag_persistence_test.js: the page arrives on
// ?game=CODE the way the lobby sends it, rows are built with the inputs
// saveSettings reads (mini-dom parses no innerHTML), saveSettings() runs and
// the events/<code> update() payload is read from __dbWrites.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const ADMIN = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
const run = (sb, expr) => vm.runInContext(expr, sb);
const J = (v) => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'flights_absent_golden.fixture.json'), 'utf8'));

const ENG = (() => {
    const sb = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']);
    vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, 'pool-engine.js'), 'utf8'), sb, { filename: 'pool-engine.js' });
    return sb;
})();

async function wizard(code) {
    const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=' + code });
    sb.crypto = require('crypto').webcrypto;
    run(sb, 'alert = function () {};');
    await new Promise(r => setTimeout(r, 20));      // the arrival load, resolved (a fresh code)
    run(sb, 'document.__mount(document.getElementById("player-list"));');
    clearRows(sb);
    fillForm(sb);
    return sb;
}
function fillForm(sb, format) {
    run(sb, 'globalCourses = ' + JSON.stringify({ comm_links: { name: 'Test Links', data: CD } }) + ';');
    run(sb, "courseHiddenSelect.value = 'comm_links'; courseSearchInput.value = 'Test Links';");
    run(sb, "document.getElementById('game-format-select').value = " + JSON.stringify(format || 'skins') + ";");
    run(sb, "document.getElementById('skins-buyin').value = '8';");
    run(sb, "document.getElementById('skins-carryover').value = 'false';");
    run(sb, "document.getElementById('skins-pot-format') && (document.getElementById('skins-pot-format').value = 'gross');");
}
function storeRound(sb, code, record) {
    const orig = sb.db.ref.bind(sb.db);
    sb.db.ref = (p) => {
        const r = orig(p);
        if (p === 'events/' + code) r.once = () => Promise.resolve({ val: () => J(record), exists: () => true });
        return r;
    };
}
const clearRows = (sb) => run(sb, 'document.getElementById("player-list").innerHTML = "";');
function addGolfer(sb, name, id, hcp, flight) {
    const h = hcp === undefined ? '0' : String(hcp);
    run(sb, 'addPlayerRow(' + JSON.stringify(name) + ', ' + JSON.stringify(h) + ', "", "red", false, true, 4, true'
        + (id ? ', ' + id : ', undefined') + (flight ? ', ' + JSON.stringify(flight) : '') + ')');
    run(sb, `(function () {
        var rows = document.querySelectorAll('.player-row'); var row = rows[rows.length - 1];
        var n = document.createElement('input'); n.className = 'p-name-input'; n.value = ${JSON.stringify(name)}; row.appendChild(n);
        var h = document.createElement('input'); h.className = 'p-hcp-input'; h.value = ${JSON.stringify(h)}; row.appendChild(h);
    })();`);
}
async function save(sb, code) {
    run(sb, 'saveSettings();');
    await new Promise(r => setTimeout(r, 20));
    const w = sb.__dbWrites.filter(x => x.path === 'events/' + code && x.op === 'update');
    assert.equal(w.length, 1, 'exactly one update to events/' + code + ', got ' + JSON.stringify(sb.__dbWrites.map(x => x.op + ' ' + x.path)));
    return J(w[0].value);
}
const rows = (sb) => run(sb, 'document.querySelectorAll(".player-row")');
// HARNESS LIMIT: a rebuild writes each row's name/hcp inputs into innerHTML,
// which mini-dom does not parse, so after setFlightsEnabled / a format switch
// / a delete the rows have no readable name inputs and saveSettings would
// throw on them. This re-attaches element inputs in row order with the names
// the test knows. The FLIGHT control is a real element and survives rebuilds
// on its own - that is the thing under test.
function reattach(sb, names, hcps) {
    run(sb, `(function () {
        var rows = document.querySelectorAll('.player-row');
        var names = ${JSON.stringify(names)}; var hcps = ${JSON.stringify(hcps || names.map(() => '0'))};
        rows.forEach(function (row, i) {
            if (!row.querySelector('.p-name-input')) { var n = document.createElement('input'); n.className = 'p-name-input'; n.value = names[i] || ''; row.appendChild(n); }
            if (!row.querySelector('.p-hcp-input')) { var h = document.createElement('input'); h.className = 'p-hcp-input'; h.value = String(hcps[i] || '0'); row.appendChild(h); }
        });
    })();`);
}
const tagOf = (sb, i) => run(sb, `(function () { var b = document.querySelectorAll(".player-row")[${i}].querySelector(".p-flight-input"); return b ? b.getAttribute("data-flight") : null; })()`);
const flip = (sb, i) => run(sb, `toggleRowFlight(document.querySelectorAll(".player-row")[${i}].querySelector(".p-flight-input"))`);
const count = (sb) => run(sb, "document.getElementById('flights-count').textContent");
const captured = (sb) => J(run(sb, 'captureCurrentPlayerInputs()'));
const G = (sb) => JSON.parse(run(sb, 'JSON.stringify(captureCurrentPlayerInputs().map(function (p) { return p.flight === undefined ? "-" : p.flight; }))'));

// ---------------------------------------------------------------------------
describe('4.1 THE FLIGHTS BLOCK', () => {
    test('sits on Step 5 above the header row, OFF by default, in the toggle-row idiom, with the scopes hidden until it is on', () => {
        const step5 = ADMIN.slice(ADMIN.indexOf('id="wizard-step-5"'), ADMIN.indexOf('id="wizard-step-6"'));
        const block = step5.indexOf('id="flights-block"'), header = step5.indexOf('id="player-header-row"');
        assert.ok(block > 0 && header > block, 'the block precedes #player-header-row');
        assert.match(step5, /<input type="hidden" id="flights-enabled" value="false">/);
        assert.match(step5, /<input type="checkbox" id="flights-switch" onchange="setFlightsEnabled\(this\.checked\)">/);
        assert.match(step5, /class="toggle-switch"[\s\S]*id="flights-switch"/, 'the page\'s own switch idiom');
        assert.match(step5, /<div id="flights-detail" style="display:none;/);
        assert.match(step5, /<input type="hidden" id="flights-scope-skins" value="flight">/);
        assert.match(step5, /<input type="hidden" id="flights-scope-birdies" value="flight">/);
    });

    test('OFF by default: the payload carries no flights key and no golfer carries a flight', async () => {
        const sb = await wizard('FLT000');
        ['Ann', 'Ben'].forEach(n => addGolfer(sb, n));
        assert.equal(run(sb, 'flightsSetting()'), null);
        const payload = await save(sb, 'FLT000');
        assert.equal(payload.flights, null, 'null, so update() deletes the key (the moneyPool pattern)');
        payload.players.forEach(p => assert.ok(!('flight' in p), p.name + ' has no flight key'));
    });

    test('switching ON rebuilds every existing row with the control, everyone starting A; the count and scopes appear', async () => {
        const sb = await wizard('FLT001');
        ['Ann', 'Ben', 'Cal'].forEach(n => addGolfer(sb, n));
        assert.equal(tagOf(sb, 0), null, 'no control while off');
        run(sb, 'setFlightsEnabled(true)');
        assert.equal(rows(sb).length, 3);
        assert.deepEqual([0, 1, 2].map(i => tagOf(sb, i)), ['A', 'A', 'A']);
        assert.equal(count(sb), 'A: 3 \u00B7 B: 0');
        assert.equal(run(sb, "document.getElementById('flights-detail').style.display"), 'block');
        assert.deepEqual(J(run(sb, 'flightsSetting()')), { enabled: true, scopes: { skins: 'flight', birdies: 'flight' } });
    });

    test('the scope switches flip independently and default back to per flight', async () => {
        const sb = await wizard('FLT002');
        run(sb, 'setFlightsEnabled(true)');
        run(sb, "setFlightScope('birdies', 'field')");
        assert.deepEqual(J(run(sb, 'flightsSetting()')), { enabled: true, scopes: { skins: 'flight', birdies: 'field' } });
        run(sb, "setFlightScope('skins', 'field'); setFlightScope('birdies', 'flight')");
        assert.deepEqual(J(run(sb, 'flightsSetting()')), { enabled: true, scopes: { skins: 'field', birdies: 'flight' } });
    });
});

// ---------------------------------------------------------------------------
describe('4.2 THE ROW CONTROL AND ITS PLUMBING', () => {
    test('tapping flips A -> B -> A on that row only, and the count follows through the SAVE\'S read', async () => {
        const sb = await wizard('FLT010');
        ['Ann', 'Ben', 'Cal', 'Dee'].forEach(n => addGolfer(sb, n));
        run(sb, 'setFlightsEnabled(true)');
        flip(sb, 1); flip(sb, 3);
        assert.deepEqual([0, 1, 2, 3].map(i => tagOf(sb, i)), ['A', 'B', 'A', 'B']);
        assert.equal(count(sb), 'A: 2 \u00B7 B: 2');
        assert.deepEqual(G(sb), ['A', 'B', 'A', 'B'], 'captureCurrentPlayerInputs reads the tags');
        flip(sb, 1);
        assert.equal(tagOf(sb, 1), 'A');
        assert.equal(count(sb), 'A: 3 \u00B7 B: 1');
    });

    test('ADDENDUM A: the count agrees with the payload after a FORMAT SWITCH and a ROW DELETE', async () => {
        const sb = await wizard('FLT011');
        ['Ann', 'Ben', 'Cal', 'Dee', 'Eli'].forEach(n => addGolfer(sb, n));
        run(sb, 'setFlightsEnabled(true)');
        flip(sb, 0); flip(sb, 2);                                   // Ann B, Cal B
        // format switch: the roster is rebuilt from captureCurrentPlayerInputs
        run(sb, "document.getElementById('game-format-select').value = 'stableford'; handleFormatChange();");
        assert.equal(rows(sb).length, 5);
        assert.deepEqual(G(sb), ['B', 'A', 'B', 'A', 'A'], 'tags survived the format switch');
        assert.equal(count(sb), 'A: 3 \u00B7 B: 2');
        // row delete: Ben (A) goes
        run(sb, 'removePlayerRowAndRefresh(document.querySelectorAll(".player-row")[1].querySelector(".btn-del") || document.querySelectorAll(".player-row")[1])');
        assert.equal(rows(sb).length, 4);
        assert.deepEqual(G(sb), ['B', 'B', 'A', 'A'], 'tags survived the delete');
        assert.equal(count(sb), 'A: 2 \u00B7 B: 2');
        // and the PAYLOAD says the same thing the count says
        reattach(sb, ['Ann', 'Cal', 'Dee', 'Eli']);
        const payload = await save(sb, 'FLT011');
        const a = payload.players.filter(p => p.flight === 'A').length, b = payload.players.filter(p => p.flight === 'B').length;
        assert.equal(count(sb), 'A: ' + a + ' \u00B7 B: ' + b, 'the count IS the payload\'s split');
        assert.deepEqual(payload.players.map(p => [p.name, p.flight]), [['Ann', 'B'], ['Cal', 'B'], ['Dee', 'A'], ['Eli', 'A']]);
    });

    test('adding a golfer while on gives them A and keeps everyone else\'s tag', async () => {
        const sb = await wizard('FLT012');
        ['Ann', 'Ben'].forEach(n => addGolfer(sb, n));
        run(sb, 'setFlightsEnabled(true)');
        flip(sb, 1);
        run(sb, 'addNewPlayerAndRefresh()');
        assert.equal(rows(sb).length, 3);
        assert.deepEqual(G(sb), ['A', 'B', 'A']);
    });

    test('switching OFF removes the control from every row; switching back ON starts everyone at A again (tags are not kept off-screen)', async () => {
        const sb = await wizard('FLT013');
        ['Ann', 'Ben'].forEach(n => addGolfer(sb, n));
        run(sb, 'setFlightsEnabled(true)'); flip(sb, 1);
        run(sb, 'setFlightsEnabled(false)');
        assert.deepEqual([0, 1].map(i => tagOf(sb, i)), [null, null]);
        assert.deepEqual(G(sb), ['-', '-'], 'capture carries no flight key while off');
        run(sb, 'setFlightsEnabled(true)');
        assert.deepEqual(G(sb), ['A', 'A']);
    });

    test('ADDENDUM B: a plain row gets a sixth column (grid column 3, header "Flt"); a TEAM row gets a second line spanning the row', async () => {
        const sb = await wizard('FLT014');
        addGolfer(sb, 'Ann');
        run(sb, 'setFlightsEnabled(true)');
        const plain = run(sb, '(function () { var r = document.querySelectorAll(".player-row")[0]; var b = r.querySelector(".p-flight-input"); return { cols: r.style.gridTemplateColumns, col: b.style.gridColumn, line: !!r.querySelector(".p-flight-line") }; })()');
        assert.equal(J(plain).cols, '2fr 1fr 0.7fr 38px');
        assert.equal(J(plain).col, '3');
        assert.equal(J(plain).line, false);
        assert.match(run(sb, "document.getElementById('player-header-row').innerHTML"), /<span>Flt<\/span>/);
        assert.equal(run(sb, "document.getElementById('player-header-row').style.gridTemplateColumns"), '2fr 1fr 0.7fr 38px');
        // a team format: the same golfer, the same tag, a second line instead
        fillForm(sb, 'bestball'); run(sb, 'handleFormatChange();');
        const team = run(sb, '(function () { var r = document.querySelectorAll(".player-row")[0]; var l = r.querySelector(".p-flight-line"); return { cols: r.style.gridTemplateColumns, line: !!l, span: l ? l.style.gridColumn : null, tag: r.querySelector(".p-flight-input").getAttribute("data-flight") }; })()');
        assert.equal(J(team).cols, '1.8fr 0.8fr 1.2fr 38px', 'no column added on a team row');
        assert.equal(J(team).line, true);
        assert.equal(J(team).span, '1 / -1');
        assert.equal(J(team).tag, 'A');
        assert.ok(!/<span>Flt<\/span>/.test(run(sb, "document.getElementById('player-header-row').innerHTML")), 'no header column when there is no column');
    });

    test('a Ryder Cup round shows no scope switches (no Games step reads them); a stroke round shows them', async () => {
        const sb = await wizard('FLT015');
        addGolfer(sb, 'Ann');
        run(sb, 'setFlightsEnabled(true)');
        assert.equal(run(sb, "document.getElementById('flights-scopes').style.display"), '');
        run(sb, "document.getElementById('game-format-select').value = 'ryder-cup'; handleFormatChange();");
        assert.equal(run(sb, "document.getElementById('flights-scopes').style.display"), 'none');
    });
});

// ---------------------------------------------------------------------------
describe('4.3 / 4.5 THE PAYLOAD AND THE ROUND TRIP', () => {
    test('ON: the payload writes flights { enabled, scopes } and flight: "A" | "B" explicitly on EVERY golfer', async () => {
        const sb = await wizard('FLT020');
        ['Ann', 'Ben', 'Cal'].forEach(n => addGolfer(sb, n));
        run(sb, 'setFlightsEnabled(true)'); flip(sb, 2);
        run(sb, "setFlightScope('birdies', 'field')");
        reattach(sb, ['Ann', 'Ben', 'Cal']);
        const payload = await save(sb, 'FLT020');
        assert.deepEqual(payload.flights, { enabled: true, scopes: { skins: 'flight', birdies: 'field' } });
        assert.deepEqual(payload.players.map(p => [p.name, p.flight]), [['Ann', 'A'], ['Ben', 'A'], ['Cal', 'B']]);
        assert.equal(payload.skinsRounding, 'odd-dollar', 'a fresh round still gets the Wave 1 flag');
        assert.equal(payload.settlementMode, 'whole-dollar');
        // and the engine reads it as the page wrote it
        assert.equal(ENG.flightSlices(payload, 'skins').length, 2);
        assert.equal(ENG.flightSlices(payload, 'birdies').length, 1);
    });

    test('an untagged golfer is written "A" explicitly - the record says what the engine will do', async () => {
        const sb = await wizard('FLT021');
        addGolfer(sb, 'Ann');
        run(sb, 'setFlightsEnabled(true)');
        // remove the control from the row after the switch, as a lost tap or a stale row would
        run(sb, 'document.querySelectorAll(".player-row")[0].querySelector(".p-flight-input").remove()');
        reattach(sb, ['Ann']);
        const payload = await save(sb, 'FLT021');
        assert.equal(payload.players[0].flight, 'A');
    });

    test('ROUND TRIP: arrive, tag, save; re-open the stored round; tags and switches restored', async () => {
        const sb1 = await wizard('FLT030');
        ['Ann', 'Ben', 'Cal', 'Dee'].forEach(n => addGolfer(sb1, n));
        run(sb1, 'setFlightsEnabled(true)'); flip(sb1, 1); flip(sb1, 3);
        run(sb1, "setFlightScope('skins', 'field')");
        reattach(sb1, ['Ann', 'Ben', 'Cal', 'Dee']);
        const payload = await save(sb1, 'FLT030');
        const stored = Object.assign({}, payload, { activeCourseKey: 'comm_links', courseName: 'Test Links', courseData: CD });

        const sb2 = await wizard('FLT030');
        storeRound(sb2, 'FLT030', stored);
        run(sb2, 'loadModeData("FLT030");');
        await new Promise(r => setTimeout(r, 20));
        assert.equal(run(sb2, 'loadedExistingRound'), true);
        assert.equal(run(sb2, 'flightsEnabledNow()'), true, 'the switch was restored');
        assert.deepEqual(J(run(sb2, 'flightsSetting()')), { enabled: true, scopes: { skins: 'field', birdies: 'flight' } });
        assert.equal(run(sb2, "document.getElementById('flights-switch').checked"), true);
        assert.equal(run(sb2, "document.getElementById('flights-skins-switch').checked"), true, 'skins switch shows Whole field');
        assert.deepEqual(G(sb2), ['A', 'B', 'A', 'B'], 'the tags came back onto the rebuilt rows');
        assert.equal(count(sb2), 'A: 2 \u00B7 B: 2');
    });

    test('COPY a flighted round: the copy carries the tags and the switch (a copy is a new round with the source\'s setup)', async () => {
        const sb = await wizard('FLT031');
        const source = { players: makePlayers(['Ann', 'Ben', 'Cal'], [0, 0, 0], 101, ['A', 'B', 'B']), gameFormat: 'skins', skinsBuyIn: 8,
            skinsPotFormat: 'gross', skinsCarryOver: false, activeCourseKey: 'comm_links', courseName: 'Test Links', courseData: CD,
            flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } }, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar' };
        storeRound(sb, 'SRC001', source);
        run(sb, 'loadModeData("SRC001");');
        await new Promise(r => setTimeout(r, 20));
        assert.equal(run(sb, 'loadedExistingRound'), false, 'copying is not editing');
        assert.deepEqual(G(sb), ['A', 'B', 'B']);
        fillForm(sb); reattach(sb, ['Ann', 'Ben', 'Cal']);
        const payload = await save(sb, 'FLT031');
        assert.deepEqual(payload.flights, { enabled: true, scopes: { skins: 'flight', birdies: 'field' } });
        assert.deepEqual(payload.players.map(p => p.flight), ['A', 'B', 'B']);
        assert.equal(payload.skinsRounding, 'odd-dollar');
    });

    test('DISABLE flights on an existing flighted round: the payload writes flights: null (the key is DELETED) and no golfer carries a tag', async () => {
        const sb = await wizard('FLT032');
        const stored = { players: makePlayers(['Ann', 'Ben'], [0, 0], 101, ['A', 'B']), gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'gross',
            skinsCarryOver: false, activeCourseKey: 'comm_links', courseName: 'Test Links', courseData: CD,
            flights: { enabled: true, scopes: { skins: 'flight', birdies: 'flight' } }, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar' };
        storeRound(sb, 'FLT032', stored);
        run(sb, 'loadModeData("FLT032");');
        await new Promise(r => setTimeout(r, 20));
        assert.deepEqual(G(sb), ['A', 'B']);
        run(sb, 'setFlightsEnabled(false)');
        fillForm(sb); reattach(sb, ['Ann', 'Ben']);
        const payload = await save(sb, 'FLT032');
        assert.ok('flights' in payload, 'the key is PRESENT in the payload...');
        assert.equal(payload.flights, null, '...as null, which update() turns into a delete - a stale object would leave the round flighted');
        payload.players.forEach(p => assert.ok(!('flight' in p)));
    });

    test('a LEGACY round (no flights key) opened and re-saved stays flightless and reproduces the golden', async () => {
        const gp = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'], [2, 9, 15, 4, 20, 7, 11, 0]);
        const scores = {};
        gp.forEach(p => CD.slice(0, 17).forEach(h => { scores[`p${p.id}_h${h.hole}`] = h.par; }));
        const birdie = (idx, hole) => { scores[`p${gp[idx].id}_h${hole}`] = CD[hole - 1].par - 1; };
        birdie(0, 2); birdie(0, 9); birdie(1, 5); birdie(2, 14); birdie(6, 11); birdie(3, 13); birdie(7, 13);
        const stored = { players: gp, gameFormat: 'skins', skinsBuyIn: 8, skinsPotFormat: 'split', skinsCarryOver: false,
            birdieGameEnabled: true, birdieUnitVal: 2, birdieScoringType: 'gross', activeCourseKey: 'comm_links', courseName: 'Test Links',
            courseData: CD, scores, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar', organizerToken: 'tok' };
        const sb = await wizard('FLT033');
        storeRound(sb, 'FLT033', stored);
        run(sb, 'loadModeData("FLT033");');
        await new Promise(r => setTimeout(r, 20));
        assert.equal(run(sb, 'flightsEnabledNow()'), false);
        assert.deepEqual(G(sb), gp.map(() => '-'));
        // the wizard's rows carry no parsed inputs (mini-dom); rebuild them with the record's names and hcps
        fillForm(sb); run(sb, "document.getElementById('skins-pot-format').value = 'split';");
        clearRows(sb); gp.forEach(p => addGolfer(sb, p.name, p.id, p.hcp));
        const payload = await save(sb, 'FLT033');
        assert.equal(payload.flights, null);
        payload.players.forEach(p => assert.ok(!('flight' in p)));
        const merged = Object.assign({}, stored, payload);
        Object.keys(merged).forEach(k => { if (merged[k] === null) delete merged[k]; });   // update(): null deletes
        assert.ok(!('flights' in merged));
        assert.deepEqual(J(ENG.computeSkinsSettlementNet(merged, CD, scores)), FIX.engine.skinsNet);
        assert.deepEqual(J(ENG.calculateBirdieGameTotalsForSettle(merged, CD, scores)), FIX.engine.birdies);
        assert.deepEqual(J(ENG.computeCombinedNetTotals(merged, CD, scores).netByName), FIX.engine.netByName);
    });

    test('the persistence contract knows the field (restored in loadModeData before the roster rebuild)', () => {
        const start = ADMIN.indexOf('function loadModeData(');
        const body = ADMIN.slice(start, ADMIN.indexOf('\n    function ', start + 30));
        const restore = body.indexOf('const fl = data.flights;');
        const rebuild = body.indexOf('storedPlayersTemp = data.players;');
        assert.ok(restore > 0 && rebuild > restore, 'flights are restored BEFORE storedPlayersTemp is set');
        assert.match(body, /setFlightsEnabled\(flOn\)/);
    });
});

// ---------------------------------------------------------------------------
describe('4.4 COPY THAT IS BEHAVIOUR', () => {
    test('the birdie blurb says "in the same flight" only when birdies are per flight', async () => {
        const sb = await wizard('FLT040');
        const blurb = () => run(sb, "document.getElementById('birdie-blurb').textContent");
        assert.match(blurb(), /Every other player pays the achiever/);
        assert.ok(!/same flight/.test(blurb()));
        run(sb, 'setFlightsEnabled(true)');
        assert.match(blurb(), /Every other player in the same flight pays the achiever/);
        run(sb, "setFlightScope('birdies', 'field')");
        assert.ok(!/same flight/.test(blurb()), 'whole-field birdies: the old sentence is true again');
        run(sb, 'setFlightsEnabled(false)');
        assert.ok(!/same flight/.test(blurb()));
    });

    test('the Step 4 skins box and the Extras birdie box show a read-only per-flight line only when scoped per flight', async () => {
        const sb = await wizard('FLT041');
        const note = (id) => run(sb, `(function () { var e = document.getElementById('${id}'); return e.style.display === 'none' ? null : e.textContent; })()`);
        assert.equal(note('skins-flight-note'), null);
        run(sb, 'setFlightsEnabled(true)');
        assert.match(note('skins-flight-note'), /Per flight .* set in Players/);
        assert.match(note('skins-flight-note'), /A pays A, B pays B/);
        assert.match(note('birdie-flight-note'), /A birdie in A is paid by A only/);
        run(sb, "setFlightScope('skins', 'field')");
        assert.equal(note('skins-flight-note'), null);
        assert.match(note('birdie-flight-note'), /paid by A only/);
    });

    test('the stacked-skins extras and each instance card say the field is narrowed TWICE', async () => {
        const sb = await wizard('FLT042');
        fillForm(sb, 'stroke');                        // stacked skins only exists when skins is not the main format
        ['Ann', 'Ben'].forEach(n => addGolfer(sb, n));
        run(sb, 'setFlightsEnabled(true)');
        run(sb, "stackedGameState.skins = { enabled: true, amount: 5 }; renderStackedGames();");
        const list = run(sb, "document.getElementById('stacked-games-list').innerHTML");
        assert.match(list, /Narrowed twice: within the golfers named here, then by flight/);
        run(sb, "skinsInstances.push({ id: 'i1', skinsBuyIn: 10, skinsPotFormat: 'gross', skinsCarryOver: false, startHole: 1, participantIds: ['101','102'] }); renderStackedGames();");
        const inst = run(sb, "document.getElementById('skins-instances-list').innerHTML");
        assert.match(inst, /Narrowed twice: within the golfers named here, then by flight/);
        run(sb, "setFlightScope('skins', 'field')");
        assert.ok(!/Narrowed twice/.test(run(sb, "document.getElementById('stacked-games-list').innerHTML")), 'gone when skins are whole-field');
    });
});

// ---------------------------------------------------------------------------
// 6b THE PLAIN-ROW PLACEMENT. tools/flights-leaderboard-check.js measured, at
// 390px, that with only grid-column set the earlier auto-placed delete button
// took column 3 of row 1 and the A/B control landed on a SECOND grid row (the
// row 82px tall against a 40px flightless row). Both axes are now explicit,
// and this pins them so dropping either goes red here, not only under Chrome.
// ---------------------------------------------------------------------------
describe('6b THE PLAIN-ROW CONTROL SITS ON THE NAME\'S LINE: grid column 3, grid row 1', () => {
    test('the source sets both axes, and a rendered plain row carries both', async () => {
        const fn = ADMIN.slice(ADMIN.indexOf('function appendFlightControl('), ADMIN.indexOf('\n    // COPY THAT IS BEHAVIOUR'));
        assert.match(fn, /btn\.style\.gridColumn = '3';/);
        assert.match(fn, /btn\.style\.gridRow = '1';/, 'without an explicit row the auto-placed delete button takes column 3 and the control drops to a second line');
        const sb = await wizard('FLT060');
        addGolfer(sb, 'Ann');
        run(sb, 'setFlightsEnabled(true)');
        const placed = J(run(sb, '(function () { var b = document.querySelectorAll(".player-row")[0].querySelector(".p-flight-input"); return { col: b.style.gridColumn, row: b.style.gridRow }; })()'));
        assert.deepEqual(placed, { col: '3', row: '1' });
    });
    test('the second-line control on a TEAM row spans the row and sets no column of its own', async () => {
        const sb = await wizard('FLT061');
        fillForm(sb, 'bestball');
        addGolfer(sb, 'Ann');
        run(sb, 'setFlightsEnabled(true)');
        const placed = J(run(sb, '(function () { var r = document.querySelectorAll(".player-row")[0]; var l = r.querySelector(".p-flight-line"); var b = r.querySelector(".p-flight-input"); return { line: l.style.gridColumn, btnCol: b.style.gridColumn || "", btnRow: b.style.gridRow || "" }; })()'));
        assert.deepEqual(placed, { line: '1 / -1', btnCol: '', btnRow: '' });
    });
});

// ---------------------------------------------------------------------------
// 6c THE MAIN POOL SKINS NOTE. A skins BUCKET in the Main Pool settles through
// pool-engine over the pool's participants and never reads flights - one
// field-wide pot, whatever the Skins scope says (measured in Step 6b: the same
// golfers, a wager gives A $32 / B $32; the pool gives one $64 pot in which a
// cross-flight tie pays nobody). This note says so beside the bucket's own
// controls, and tracks the flights switch and the bucket's mode live.
// ---------------------------------------------------------------------------
describe('6c THE MAIN POOL SKINS NOTE', () => {
    // v143: the pool is the Weekly Game on every surface; the name is the only word that moved in these approved (v126) sentences.
    const NOTE = 'Weekly Game skins are ONE pot for the whole field \u2014 A and B play each other here. For A-only and B-only skins pots, use a Skins wager (Step 4 or Also Playing) instead of this bucket.';
    // The per-flight sentence, approved 2026-09-14 (COMMIT 2 paste), verbatim.
    const SPLIT = 'With Skins per flight, the Weekly Game\'s skins bucket splits into two pots by headcount \u2014 Flight A and Flight B each play their own. KP and Net Finish stay whole-field.';
    const note = (sb) => run(sb, "(function () { var e = document.getElementById('mp-skins-flight-note'); return e.style.display === 'none' ? null : e.textContent; })()");
    const setMode = (sb, v) => run(sb, "document.getElementById('mp-skins-mode').value = " + JSON.stringify(v) + "; refreshFlightScopeNotes();");

    // RE-PINNED 2026-09-13/14: the bucket now SPLITS by flight when the skins scope
    // is per flight (pool-engine.js), so the "one pot" sentence is true only under
    // the whole-field scope and is shown only then; under per flight the note says
    // the split (SPLIT). The two sentences are bound to the two behaviours: the
    // scope switch flips the sentence, and the bucket's mode "none" empties it.
    test('appears when flights are ON and the bucket\'s mode is not "none": the one-pot sentence whole-field, the split sentence per flight', async () => {
        const sb = await wizard('FLT070');
        assert.equal(note(sb), null, 'off by default');
        run(sb, 'setFlightsEnabled(true)');
        assert.equal(note(sb), SPLIT, 'per flight is the default scope: the DEFAULT state says the split, exactly');
        run(sb, "setFlightScope('skins', 'field')");
        assert.equal(note(sb), NOTE, 'the exact sentence, whole-field');
        setMode(sb, 'none');
        assert.equal(note(sb), null, 'no bucket, no note');
        setMode(sb, 'fixed');
        assert.equal(note(sb), NOTE, 'a fixed bucket is still one pot');
        setMode(sb, 'remainder');
        assert.equal(note(sb), NOTE);
        run(sb, "setFlightScope('skins', 'flight')");
        assert.equal(note(sb), SPLIT, 'back to per flight: the bucket splits, the sentence says so');
        setMode(sb, 'none');
        assert.equal(note(sb), null, 'no bucket, no split sentence either');
        setMode(sb, 'remainder');
        run(sb, 'setFlightsEnabled(false)');
        assert.equal(note(sb), null, 'gone with the switch');
    });

    test('the Skins scope flips the sentence: whole-field -> one pot; per flight -> two pots by headcount', async () => {
        const sb = await wizard('FLT071');
        run(sb, 'setFlightsEnabled(true)');
        run(sb, "setFlightScope('skins', 'field')");
        assert.equal(note(sb), NOTE);
        run(sb, "setFlightScope('skins', 'flight')");
        assert.equal(note(sb), SPLIT);
        assert.ok(!/one pot|ONE pot/i.test(note(sb)), 'the per-flight sentence never says one pot');
        assert.match(note(sb), /KP and Net Finish stay whole-field/, 'and it says what does NOT split');
    });

    test('the split sentence describes what pool-engine does: two pots, by headcount, KP and net whole-field', () => {
        // Copy that describes behaviour is behaviour: the words are held against the
        // engine's seam so a change to the split has to change the sentence too.
        const eng = fs.readFileSync(path.join(REPO_ROOT, 'pool-engine.js'), 'utf8');
        const skins = eng.slice(eng.indexOf('// ---- SKINS ----'), eng.indexOf('// ---- REFUNDS ----'));
        assert.match(skins, /flightScopeApplies\(data, 'skins'\)/, 'the split follows the skins scope');
        assert.match(skins, /potB = .*nB \/ n/, 'by headcount');
        const kp = eng.slice(eng.indexOf('// ---- KP ----'), eng.indexOf('// ---- SKINS ----'));
        assert.ok(!/flight/i.test(kp), 'KP and net whole-field');
        assert.match(SPLIT, /two pots by headcount/); assert.match(SPLIT, /KP and Net Finish stay whole-field/);
    });

    test('it sits inside the Main Pool skins section, after the bucket\'s controls, and the mode select drives it live', () => {
        const sec = ADMIN.slice(ADMIN.indexOf('<div class="mp-section-title">🥣 Skins</div>'), ADMIN.indexOf('<div id="mp-math">'));
        const mode = sec.indexOf('id="mp-skins-mode"'), scoring = sec.indexOf('id="mp-skins-scoring"'), noteAt = sec.indexOf('id="mp-skins-flight-note"');
        assert.ok(mode > 0 && scoring > mode && noteAt > scoring, 'mode select, scoring/carry, then the note');
        assert.match(sec, /<select id="mp-skins-mode" onchange="mpRecalc\(\); refreshFlightScopeNotes\(\);">/);
        assert.match(sec, /id="mp-skins-flight-note" style="display:none;/);
        const fn = ADMIN.slice(ADMIN.indexOf('function refreshFlightScopeNotes('), ADMIN.indexOf('function captureCurrentPlayerInputs('));
        assert.match(fn, /note\('mp-skins-flight-note', \(on && poolSkinsOn\)\s*\? \(skinsPer \? SPLIT_NOTE : ONE_POT_NOTE\)/, 'written by the same helper as the skins-card notes, gated on the switch and the bucket, the sentence chosen by the scope');
    });
});
