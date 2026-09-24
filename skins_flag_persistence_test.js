// ============================================================================
// THE SKINS ROUNDING FLAG: WRITTEN ONCE, AT BIRTH, NEVER RETROFITTED.
// (Skins odd-dollar wave, Step 5, 2026-09-13.)
//
// admin.html writes skinsRounding: 'odd-dollar' beside settlementMode when a
// round is CREATED. Editing an existing round deletes the key from the payload
// before update(), so a round played under the float math keeps it (update()
// writes only the keys present). This file drives the REAL save path -
// saveSettings() to its db.ref('events/<code>').update(payload) - not a copy
// of the payload, and reads the write the page made.
//
// THE COPY DECISION, PINNED. loadModeData() is both the edit loader and the
// copy-a-round loader; only the round being edited sets loadedExistingRound.
// A copy of a legacy round is therefore a NEW round and gets the flag - the
// same way it already gets settlementMode: 'whole-dollar'. Reasoning: the flag
// describes how a round SETTLES, and a copy has no scores, no receipt and no
// history to protect. Nobody played the copy under the old math. Inheriting
// the source's absence would also make two rounds created on the same day
// settle by different rules depending on which button made them, with no way
// to see why. The precedent (settlementMode) settled this already; this file
// makes it the same decision twice rather than two decisions.
//
// THE GUARD WAS BROKEN FOR NEW ROUNDS, AND THIS FILE IS WHERE IT SHOWED. A
// brand-new round arrives on ?game=CODE (the lobby mints the code first), and
// loadModeData(CODE) ran for it exactly as for an old round: the code matched,
// so loadedExistingRound was set - for a round with no record at all - and
// the first save DELETED settlementMode. Driving the real arrival here (let
// the arrival load resolve, then save) produced a payload with no
// settlementMode and no skinsRounding. The guard now requires
// snapshot.exists(): "this code" is not "this round". The first describe
// below arrives the way a golfer does and would have gone red on the old
// line.
//
// HARNESS LIMITS, STATED. mini-dom does not parse innerHTML, so a player row's
// <input>s do not exist until a test creates them; rows here are built with
// createElement/appendChild carrying the classes saveSettings reads. mini-dom
// does not read static attributes either, so the hidden #skins-carryover
// control is set explicitly to the value the page ships ("false"); without
// that '' !== 'false' would read as carry ON - a harness artefact, not the
// page's default (SKINS_CARRY_DEFAULT is false and skins_carry_default_test.js
// holds the markup to it).
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

const ENG = (() => {
    const sb = loadJsFile('settlement-engine.js', ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js']);
    vm.runInContext(fs.readFileSync(path.join(REPO_ROOT, 'pool-engine.js'), 'utf8'), sb, { filename: 'pool-engine.js' });
    return sb;
})();

// A wizard arriving on ?game=CODE the way the lobby sends a golfer there. The
// arrival's own loadModeData(CODE) is left to resolve (the stub's once() finds
// no record - a fresh code), THEN the form is filled and the player list
// mounted, so querySelectorAll('.player-row') sees what addPlayerRow appends.
async function wizard(code) {
    const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=' + code });
    sb.crypto = require('crypto').webcrypto;
    run(sb, 'alert = function () {}; uiRefuse = function () {}; uiFail = function () {}; uiToast = function () {};');
    await new Promise(r => setTimeout(r, 20));      // the arrival load, resolved
    run(sb, 'document.__mount(document.getElementById("player-list"));');
    // The arrival added one blank row (a new round starts with one); it has no
    // parsed inputs under mini-dom, so it is replaced by rows this file builds.
    clearRows(sb);
    fillForm(sb);
    return sb;
}
function fillForm(sb) {
    run(sb, 'globalCourses = ' + JSON.stringify({ comm_links: { name: 'Test Links', data: CD } }) + ';');
    run(sb, "courseHiddenSelect.value = 'comm_links'; courseSearchInput.value = 'Test Links';");
    run(sb, "document.getElementById('game-format-select').value = 'skins';");
    run(sb, "document.getElementById('skins-buyin').value = '8';");
    run(sb, "document.getElementById('skins-carryover').value = 'false';");   // the shipped markup value
    run(sb, "document.getElementById('skins-pot-format') && (document.getElementById('skins-pot-format').value = 'gross');");
}
// Makes the page's db find a stored record at events/<code>, the way production
// does for a round that exists. Everything else about the stub is untouched.
function storeRound(sb, code, record) {
    const orig = sb.db.ref.bind(sb.db);
    sb.db.ref = (p) => {
        const r = orig(p);
        if (p === 'events/' + code) r.once = () => Promise.resolve({ val: () => J(record), exists: () => true });
        return r;
    };
}
function clearRows(sb) { run(sb, 'document.getElementById("player-list").innerHTML = "";'); }
// A row with the inputs saveSettings reads, built the way mini-dom can see.
function addGolfer(sb, name, id, hcp) {
    const h = hcp === undefined ? '0' : String(hcp);
    run(sb, 'addPlayerRow(' + JSON.stringify(name) + ', ' + JSON.stringify(h) + ', "", "red", false, true, 4, true' + (id ? ', ' + id : '') + ')');
    run(sb, `(function () {
        var rows = document.querySelectorAll('.player-row'); var row = rows[rows.length - 1];
        var n = document.createElement('input'); n.className = 'p-name-input'; n.value = ${JSON.stringify(name)}; row.appendChild(n);
        var h = document.createElement('input'); h.className = 'p-hcp-input'; h.value = ${JSON.stringify(h)}; row.appendChild(h);
    })();`);
}
// The stored legacy round: the Step 1 golden fixture, no flag, played and
// settled under the float math.
const LEGACY = () => ({ players: makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay'], [0, 4, 9, 13, 18, 22]),
    gameFormat: 'skins', skinsBuyIn: 5, skinsPotFormat: 'split', activeCourseKey: 'comm_links', courseName: 'Test Links',
    courseData: CD, scores: goldenScores([101, 102, 103, 104, 105, 106]), settlementMode: 'whole-dollar', skinsCarryOver: false,
    organizerToken: 'tok-legacy', roundDay: 'saturday' });
// Runs the real save and returns the events/<code> update payload.
async function save(sb, code) {
    run(sb, 'saveSettings();');
    await new Promise(r => setTimeout(r, 20));
    const w = sb.__dbWrites.filter(x => x.path === 'events/' + code && x.op === 'update');
    assert.equal(w.length, 1, 'exactly one update to events/' + code + ', got ' + JSON.stringify(sb.__dbWrites.map(x => x.op + ' ' + x.path)));
    return J(w[0].value);
}
// The golden-roster scores from skins_golden_test.js, keyed by the ids the
// wizard will mint (101-106 on a fresh page).
function goldenScores(ids) {
    const s = {};
    ids.forEach(id => CD.forEach(h => { s[`p${id}_h${h.hole}`] = 5; }));
    s[`p${ids[0]}_h2`] = 4; s[`p${ids[1]}_h5`] = 4; s[`p${ids[0]}_h9`] = 4; s[`p${ids[2]}_h14`] = 3;
    return s;
}

// ---------------------------------------------------------------------------
describe('5.2 A NEW ROUND CARRIES THE FLAG', () => {

    test('a fresh code\'s arrival load does NOT mark the round as existing', async () => {
        const sb = await wizard('NEW000');
        assert.equal(run(sb, 'loadedExistingRound'), false,
            'a code with no record is a NEW round; the old guard set this true and deleted both flags from the first save');
    });

    test('saveSettings writes skinsRounding: "odd-dollar" beside settlementMode, and the engine gate applies', async () => {
        const sb = await wizard('NEW001');
        ['Ann', 'Ben', 'Cal', 'Dee'].forEach(n => addGolfer(sb, n));
        const payload = await save(sb, 'NEW001');
        assert.equal(payload.settlementMode, 'whole-dollar');
        assert.equal(payload.skinsRounding, 'odd-dollar');
        assert.equal(payload.gameFormat, 'skins');
        assert.equal(payload.skinsBuyIn, 8);
        assert.deepEqual(payload.players.map(p => p.name), ['Ann', 'Ben', 'Cal', 'Dee']);
        assert.equal(payload.skinsCarryOver, false);
        assert.equal(ENG.skinsOddDollarApplies(payload), true, 'the round the page wrote is one the engine prices by the rule');
    });

    test('the flag is written in the payload literal, adjacent to settlementMode, with no UI reading it', () => {
        const at = ADMIN.indexOf("settlementMode: 'whole-dollar',");
        const near = ADMIN.slice(at, at + 1200);
        assert.match(near, /skinsRounding: 'odd-dollar',/, 'the flag sits in the same payload block');
        assert.ok(!/id="[^"]*rounding[^"]*"/i.test(ADMIN), 'no control for it in the wizard');
        assert.equal((ADMIN.match(/skinsRounding/g) || []).length, 2, 'exactly two mentions in admin.html: the write and the guard');
    });
});

// ---------------------------------------------------------------------------
describe('5.2 AN EXISTING ROUND IS NEVER RETROFITTED', () => {

    // Opens an EXISTING round the way the page does - loadModeData(code) finds
    // its record - then re-saves it. The rows loadModeData rebuilt have no
    // parsed inputs (mini-dom), so they are replaced by rows this test can
    // build, with the ids the record already holds.
    async function editAndSave(code, record) {
        const sb = await wizard(code);
        storeRound(sb, code, record);
        run(sb, 'loadModeData(' + JSON.stringify(code) + ');');
        await new Promise(r => setTimeout(r, 20));
        assert.equal(run(sb, 'loadedExistingRound'), true, 'the page knows it is editing this round');
        fillForm(sb);
        run(sb, "document.getElementById('skins-pot-format') && (document.getElementById('skins-pot-format').value = 'split');");
        run(sb, "document.getElementById('skins-buyin').value = '5';");
        clearRows(sb);
        record.players.forEach(p => addGolfer(sb, p.name, p.id, p.hcp));
        return save(sb, code);
    }

    test('editing a legacy round: the payload carries neither settlementMode nor skinsRounding', async () => {
        const payload = await editAndSave('OLD001', LEGACY());
        assert.ok(!('settlementMode' in payload), 'settlementMode must not be written on edit');
        assert.ok(!('skinsRounding' in payload), 'skinsRounding must not be written on edit');
        assert.equal(payload.gameFormat, 'skins');
        assert.equal(payload.organizerToken, 'tok-legacy', 'and the organizer token is preserved, as before');
    });

    test('...and the round it leaves behind settles byte-identically to the Step 1 golden', async () => {
        // The stored legacy round is the fixture from skins_golden_test.js. After
        // the edit, update() has touched none of the keys that decide skins money;
        // the merged record still has no flag, and the engine gives the golden.
        const stored = LEGACY();
        const payload = await editAndSave('OLD002', stored);
        const merged = Object.assign({}, stored, payload);   // update() semantics: payload keys overwrite, the rest survive
        assert.equal(merged.skinsBuyIn, 5); assert.equal(merged.skinsPotFormat, 'split');
        assert.deepEqual(merged.players.map(p => [p.id, p.name]), stored.players.map(p => [p.id, p.name]), 'ids survive the re-save');
        assert.ok(!('skinsRounding' in merged));
        assert.equal(ENG.skinsOddDollarApplies(merged), false);
        const c = ENG.computeCombinedNetTotals(merged, CD, merged.scores);
        assert.deepEqual(J(c.netByName), { ann: { name: 'Ann', net: 2 }, ben: { name: 'Ben', net: -1 }, cal: { name: 'Cal', net: 2 },
            dee: { name: 'Dee', net: -5 }, eli: { name: 'Eli', net: -5 }, fay: { name: 'Fay', net: 7 } });
        assert.deepEqual(J(ENG.computeSkinsSettlementNet(merged, CD, merged.scores)), { 101: 2.5, 102: -1.25, 103: 1.75, 104: -5, 105: -5, 106: 7 });
    });

    test('a round created before the flag existed, loaded and re-saved, stays legacy - by absence, not by a "legacy" value', async () => {
        const payload = await editAndSave('OLD003', LEGACY());
        assert.equal(payload.skinsRounding, undefined);
        assert.ok(!Object.keys(payload).some(k => /rounding/i.test(k)), 'no key of any spelling is written');
    });

    test('THE GUARD IS THE SAME LINE SHAPE AS settlementMode\'s, and sits beside it', () => {
        const a = ADMIN.indexOf('if (loadedExistingRound) delete payload.settlementMode;');
        const b = ADMIN.indexOf('if (loadedExistingRound) delete payload.skinsRounding;');
        assert.ok(a > 0 && b > a && b - a < 600, 'the two guards are adjacent');
    });
});

// ---------------------------------------------------------------------------
describe('5.1 THE COPY DECISION: a copy of a legacy round is a new round, and is flagged', () => {

    test('loadModeData(otherCode) does not set loadedExistingRound, so the copy gets settlementMode AND skinsRounding', async () => {
        const sb = await wizard('COPY01');
        storeRound(sb, 'SOURCE1', LEGACY());        // the legacy source round exists
        run(sb, 'loadModeData("SOURCE1");');         // copy-a-round: a different code
        await new Promise(r => setTimeout(r, 20));
        assert.equal(run(sb, 'loadedExistingRound'), false, 'copying is not editing');
        fillForm(sb); clearRows(sb);
        ['Ann', 'Ben', 'Cal', 'Dee'].forEach(n => addGolfer(sb, n));
        const payload = await save(sb, 'COPY01');
        assert.equal(payload.settlementMode, 'whole-dollar', 'the precedent: a copy already gets the settlement mode');
        assert.equal(payload.skinsRounding, 'odd-dollar', 'and, by the same reasoning, the rounding flag');
    });

    test('the isThisRound test that separates edit from copy is unchanged', () => {
        assert.match(ADMIN, /const isThisRound = String\(modeKey\) === String\(currentMode\)/);
        assert.match(ADMIN, /if \(isThisRound && snapshot\.exists\(\)\) \{\s*loadedExistingRound = true;/,
            'edit is "this code AND a stored record"; a fresh code is not an existing round');
    });
});

// ---------------------------------------------------------------------------
// 5.3 END TO END. A fresh round, saved by the page, scored, and settled: the
// payload the page wrote -> the engine -> the per-skin ledger -> Final Results
// -> Who Pays Who. Expected integers, no rounding-repair line.
// ---------------------------------------------------------------------------
describe('5.3 END TO END: a fresh round pays whole-dollar skins from the payload the page wrote', () => {

    test('4 golfers at $8, skins on holes 2, 5, 9 -> 11, 11, 10 -> Ann +13, Ben +3, Cal -8, Dee -8 -> Who Pays Who', async () => {
        const sb = await wizard('E2E001');
        ['Ann', 'Ben', 'Cal', 'Dee'].forEach(n => addGolfer(sb, n));
        const payload = await save(sb, 'E2E001');
        // The round as the database holds it after the page's update(), then the
        // scores golfers post through index.html (p<id>_h<hole>).
        const round = Object.assign({}, payload);
        // The ids are whatever the page minted (the arrival's blank row took one
        // before this test replaced it); the scorecard files scores under them.
        const ids = round.players.map(p => p.id);
        assert.equal(ids.length, 4);
        ids.forEach(id => assert.ok(Number.isInteger(id) && id >= 101, 'a minted integer id'));
        const [ann, ben] = ids;
        round.scores = {};
        ids.forEach(id => CD.forEach(h => { round.scores[`p${id}_h${h.hole}`] = 5; }));
        round.scores[`p${ann}_h2`] = 4; round.scores[`p${ben}_h5`] = 4; round.scores[`p${ann}_h9`] = 4;

        // engine gate
        assert.equal(ENG.skinsOddDollarApplies(round), true);
        // per-skin ledger
        const L = ENG.computeSkinsPayoutLines(round, round.courseData, round.scores);
        assert.equal(L.rule, 'odd-dollar');
        assert.deepEqual(J(L.gross.lines.map(l => [l.hole, l.playerName, l.value])), [[2, 'Ann', 11], [5, 'Ben', 11], [9, 'Ann', 10]]);
        assert.equal(L.gross.pot, 32);
        // settlement
        assert.deepEqual(J(ENG.computeSkinsSettlementNet(round, round.courseData, round.scores)),
            { [ids[0]]: 13, [ids[1]]: 3, [ids[2]]: -8, [ids[3]]: -8 });
        // Final Results and Who Pays Who, as the Receipt draws them
        const c = ENG.computeCombinedNetTotals(round, round.courseData, round.scores);
        assert.deepEqual(J(c.netByName), { ann: { name: 'Ann', net: 13 }, ben: { name: 'Ben', net: 3 }, cal: { name: 'Cal', net: -8 }, dee: { name: 'Dee', net: -8 } });
        assert.deepEqual(J(c.exact), J(c.netByName), 'nothing to round');
        const repairs = Object.values(J(c.contributions)).reduce((n, x) => n + x.lines.filter(l => l.rounding).length, 0);
        assert.equal(repairs, 0, 'no "Rounding to whole dollars" line');
        assert.deepEqual(J(c.contributions).ann.lines, [{ label: 'Skins', amount: 13 }]);
        assert.deepEqual(J(c.transactions), [{ from: 'Cal', to: 'Ann', amount: 8 }, { from: 'Dee', to: 'Ann', amount: 5 }, { from: 'Dee', to: 'Ben', amount: 3 }]);
        assert.equal(J(c.transactions).reduce((a, t) => a + t.amount, 0), 16, 'every dollar that changes hands is whole');
    });
});
