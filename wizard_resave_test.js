// ============================================================================
// RE-SAVING A ROUND IN PLAY MUST NOT LOSE WHAT THE WIZARD DOES NOT OWN
//
// Measured on 2026-09-13 (the mid-round-edit recon), a Step 7 save on an
// existing round:
//   1. rebuilt additionalGameInstances from the wizard's skins list only, so an
//      Action-tab DOTS game was deleted with its money, and a disabled skins
//      instance came back enabled;
//   2. read #round-length-select, which nothing restores, so a Front-9 round
//      re-saved as 18 holes;
//   3. rebuilt courseData from the LIVE global card, so a since-edited or
//      hand-edited card rewrote the round's pars and stroke indexes under
//      posted scores;
//   4. (the recon's claim of a duplicate Nassau on every re-save was WRONG -
//      see the FIX 4 block for what was actually found and what changed);
//   5. deleted a golfer with posted scores on one tap, no confirm.
//
// Every test here reopens a stored round the way the wizard does (loadModeData
// through the harness's db stub), then runs the real save (saveSettings) and
// reads the ONE update() written to events/<CODE>. Nothing calls a capture
// function by name except where the seam itself is the thing under test.
//
// HARNESS LIMITS, stated: mini-dom parses no innerHTML, so the roster rows the
// load rebuilds carry no readable name inputs; `reattach` puts element inputs
// on them with the names the test knows (the ids under test are untouched).
// confirm() is stubbed and its calls recorded.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const run = (sb, e) => vm.runInContext(e, sb);
const J = (v) => JSON.parse(JSON.stringify(v));
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CD = makeCourseData(18);
const ADMIN = read('admin.html');

const NAMES = ['Ann', 'Ben', 'Cal', 'Dee'];
const PLAYERS = makePlayers(NAMES, [2, 9, 15, 4], 101);
const GLOBAL = { comm_links: { name: 'Test Links', data: CD }, other_course: { name: 'Other Course', data: makeCourseData(18).map(h => Object.assign({}, h, { par: 5 })) } };

function baseRound(extra) {
    return Object.assign({ eventName: 'R', gameFormat: 'stroke', activeCourseKey: 'comm_links', courseName: 'Test Links',
        players: J(PLAYERS), courseData: J(CD), scores: {}, settlementMode: 'whole-dollar', organizerToken: 'tok' }, extra || {});
}
async function reopen(code, record) {
    const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=' + code });
    sb.crypto = require('crypto').webcrypto;
    run(sb, 'alert = function () {}; window.__confirms = []; confirm = function (m) { window.__confirms.push(String(m)); return true; };');
    run(sb, 'globalCourses = ' + JSON.stringify(GLOBAL) + ';');
    const orig = sb.db.ref.bind(sb.db);
    sb.db.ref = (p) => {
        const r = orig(p);
        if (p === 'events/' + code) r.once = () => Promise.resolve({ val: () => J(record), exists: () => true });
        return r;
    };
    run(sb, 'document.__mount(document.getElementById("player-list"));');
    run(sb, 'loadModeData(' + JSON.stringify(code) + ')');
    await new Promise(r => setTimeout(r, 40));
    reattach(sb, record.players.map(p => p.name), record.players.map(p => p.hcp));
    return sb;
}
function reattach(sb, names, hcps) {
    sb.__names = names; sb.__hcps = hcps || names.map(() => '0');
    run(sb, `document.querySelectorAll('.player-row').forEach(function (row, i) {
        if (!row.querySelector('.p-name-input')) { var n = document.createElement('input'); n.className = 'p-name-input'; n.value = __names[i] || ''; row.appendChild(n); }
        if (!row.querySelector('.p-hcp-input')) { var h = document.createElement('input'); h.className = 'p-hcp-input'; h.value = String(__hcps[i] || '0'); row.appendChild(h); }
    });`);
}
async function save(sb, code) {
    run(sb, 'saveSettings();');
    await new Promise(r => setTimeout(r, 30));
    const w = sb.__dbWrites.filter(x => x.path === 'events/' + code && x.op === 'update');
    assert.equal(w.length, 1, 'exactly one update to events/' + code + ', got ' + JSON.stringify(sb.__dbWrites.map(x => x.op + ' ' + x.path)));
    return J(w[0].value);
}
const confirms = (sb) => J(run(sb, 'window.__confirms'));

// ---------------------------------------------------------------------------
describe('FIX 1 - instances the wizard does not own survive a re-save untouched', () => {
    const INSTANCES = {
        k1: { format: 'skins', enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross', skinsScoring: 'gross', skinsCarryOver: false, startHole: 1 },
        k2: { format: 'dots', enabled: true, dotPointVal: 1, startHole: 1, participantIds: ['101', '102'], createdAt: 7 },
        k3: { format: 'skins', enabled: false, skinsBuyIn: 10, skinsPotFormat: 'net', skinsScoring: 'net', skinsCarryOver: false, startHole: 6 }
    };
    test('a skins, a dots and a disabled skins instance: the dots one is written back byte for byte, the disabled one stays disabled', async () => {
        const sb = await reopen('INST1', baseRound({ additionalGameInstances: J(INSTANCES) }));
        const p = await save(sb, 'INST1');
        assert.ok(p.additionalGameInstances, 'the map is written');
        assert.deepEqual(Object.keys(p.additionalGameInstances).sort(), ['k1', 'k2', 'k3']);
        assert.deepEqual(p.additionalGameInstances.k2, INSTANCES.k2, 'the dots game is exactly as it was');
        assert.equal(p.additionalGameInstances.k3.enabled, false, 'a disabled instance is not re-enabled');
        assert.equal(p.additionalGameInstances.k1.enabled, true);
        assert.equal(p.additionalGameInstances.k1.skinsBuyIn, 5);
    });
    test('the wizard does not render or edit the foreign instance', async () => {
        const sb = await reopen('INST2', baseRound({ additionalGameInstances: J(INSTANCES) }));
        assert.equal(run(sb, 'skinsInstances.length'), 2, 'only the two skins instances are editable');
        assert.ok(!/k2|dots/.test(run(sb, "document.getElementById('skins-instances-list') ? document.getElementById('skins-instances-list').innerHTML : ''")), 'no card for the dots game');
    });
    test('a skins instance edited in the wizard is still written from the wizard (the holding store does not shadow it)', async () => {
        const sb = await reopen('INST3', baseRound({ additionalGameInstances: J(INSTANCES) }));
        run(sb, "setInstanceField('k1', 'skinsBuyIn', 20)");
        const p = await save(sb, 'INST3');
        assert.equal(p.additionalGameInstances.k1.skinsBuyIn, 20);
        assert.deepEqual(p.additionalGameInstances.k2, INSTANCES.k2);
    });
    test('a round with no instances still writes an empty map, as before', async () => {
        const sb = await reopen('INST4', baseRound());
        const p = await save(sb, 'INST4');
        assert.deepEqual(p.additionalGameInstances, {});
    });
});

// ---------------------------------------------------------------------------
describe('FIX 2 - the round length survives a re-save', () => {
    test('a Front-9 round through 9 re-saves with 9 holes, holes 1-9, and its "(Front 9)" name', async () => {
        const scores = {}; PLAYERS.forEach(p => CD.slice(0, 9).forEach(h => { scores[`p${p.id}_h${h.hole}`] = h.par; }));
        const sb = await reopen('LEN1', baseRound({ courseData: J(CD.slice(0, 9)), courseName: 'Test Links (Front 9)', scores }));
        assert.equal(run(sb, "document.getElementById('round-length-select').value"), 'front', 'the selector was restored from the round');
        const p = await save(sb, 'LEN1');
        assert.equal(p.courseData.length, 9);
        assert.deepEqual(p.courseData.map(h => h.hole), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.equal(p.courseName, 'Test Links (Front 9)');
    });
    test('a Back-9 round re-saves as holes 10-18', async () => {
        const sb = await reopen('LEN2', baseRound({ courseData: J(CD.slice(9)), courseName: 'Test Links (Back 9)' }));
        assert.equal(run(sb, "document.getElementById('round-length-select').value"), 'back');
        const p = await save(sb, 'LEN2');
        assert.deepEqual(p.courseData.map(h => h.hole), [10, 11, 12, 13, 14, 15, 16, 17, 18]);
    });
    test('an 18-hole round stays 18', async () => {
        const sb = await reopen('LEN3', baseRound());
        assert.equal(run(sb, "document.getElementById('round-length-select').value"), '18');
        assert.equal((await save(sb, 'LEN3')).courseData.length, 18);
    });
});

// ---------------------------------------------------------------------------
describe('FIX 3 - an existing round keeps its OWN card unless the course is deliberately changed', () => {
    const edited = () => J(CD).map(h => h.hole === 1 ? Object.assign({}, h, { par: 3, hcpIndex: 1 }) : h);
    test('a stored card that differs from the live global card is written back intact', async () => {
        const sb = await reopen('CARD1', baseRound({ courseData: edited(), scores: { p101_h1: 3 } }));
        const p = await save(sb, 'CARD1');
        assert.equal(p.courseData[0].par, 3, 'the round\'s own par, not the live card\'s 4');
        assert.equal(p.courseData[0].hcpIndex, 1);
        assert.deepEqual(p.courseData, edited());
        assert.equal(p.activeCourseKey, 'comm_links');
    });
    test('the SAME round with a different course picked swaps the card, as today', async () => {
        const sb = await reopen('CARD2', baseRound({ courseData: edited() }));
        run(sb, "courseHiddenSelect.value = 'other_course'; courseSearchInput.value = 'Other Course'; handleCourseChange();");
        const p = await save(sb, 'CARD2');
        assert.equal(p.activeCourseKey, 'other_course');
        assert.equal(p.courseData[0].par, 5, 'the other course\'s card');
        assert.equal(p.courseName, 'Other Course');
    });
    test('a NEW round (no stored round) still takes the live card', async () => {
        const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=CARD3' });
        sb.crypto = require('crypto').webcrypto;
        run(sb, 'alert = function () {}; confirm = function () { return true; };');
        run(sb, 'globalCourses = ' + JSON.stringify(GLOBAL) + ';');
        await new Promise(r => setTimeout(r, 30));
        run(sb, 'document.__mount(document.getElementById("player-list")); document.getElementById("player-list").innerHTML = "";');
        run(sb, "courseHiddenSelect.value = 'comm_links'; courseSearchInput.value = 'Test Links'; handleCourseChange();");
        run(sb, "document.getElementById('game-format-select').value = 'stroke';");
        ['Ann', 'Ben'].forEach((n, i) => run(sb, `addPlayerRow(${JSON.stringify(n)}, '0', '', 'red', false, true, 2, true, ${101 + i})`));
        reattach(sb, ['Ann', 'Ben']);
        const p = await save(sb, 'CARD3');
        assert.equal(p.courseData.length, 18); assert.equal(p.courseData[0].par, CD[0].par);
    });
});

// ---------------------------------------------------------------------------
describe('FIX 4 - one Nassau, created once', () => {
    const NASSAU = { format: 'nassau', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'], startHole: 1, frontStake: 10, backStake: 10, overallStake: 20, autoPressStake: null, pressRule: 'none', stake: 20, createdAt: 1 };
    const two = () => baseRound({ players: J(PLAYERS.slice(0, 2)), sideMatches: { abc: J(NASSAU) } });

    test('WHAT WAS FOUND: a saved Nassau round reopens as a stroke round with the Step 6 box unticked, and a plain re-save pushes nothing', async () => {
        const sb = await reopen('NAS1', two());
        assert.equal(run(sb, "document.getElementById('game-format-select').value"), 'stroke');
        run(sb, 'goToWizardStep(6)');
        assert.equal(run(sb, "document.getElementById('setup-nassau-enabled').checked"), false);
        const p = await save(sb, 'NAS1');
        assert.ok(!Object.keys(p).some(k => k.startsWith('sideMatches')), 'no sideMatches key in the payload: ' + Object.keys(p).filter(k => /side/.test(k)));
    });
    test('THE GUARD: on a round that already holds a Nassau, Step 6 says so and the box is disabled; two re-saves leave exactly one', async () => {
        const sb = await reopen('NAS2', two());
        run(sb, 'goToWizardStep(6)');
        assert.equal(run(sb, "document.getElementById('setup-nassau-enabled').disabled"), true, 'the box is disabled');
        const note = run(sb, "document.getElementById('setup-nassau-legacy-note').textContent");
        assert.match(note, /already has a Nassau/i);
        assert.match(note, /Ann/); assert.match(note, /Ben/);
        assert.match(note, /Bets/);
        assert.equal(run(sb, "document.getElementById('setup-nassau-legacy-note').style.display"), 'block');
        // Even with the box forced on and the golfers picked, nothing is pushed.
        run(sb, "document.getElementById('setup-nassau-enabled').checked = true; toggleSetupNassau(); setupNassauPicks = { p1: '101', p2: '102' };");
        const p1 = await save(sb, 'NAS2');
        assert.ok(!Object.keys(p1).some(k => k.startsWith('sideMatches')), 'first re-save: no push');
        sb.__dbWrites.length = 0;
        const p2 = await save(sb, 'NAS2');
        assert.ok(!Object.keys(p2).some(k => k.startsWith('sideMatches')), 'second re-save: no push');
    });
    test('a round WITHOUT a Nassau can still get one from Step 6 (creation is untouched)', async () => {
        const sb = await reopen('NAS3', baseRound({ players: J(PLAYERS.slice(0, 2)) }));
        run(sb, 'goToWizardStep(6)');
        assert.equal(run(sb, "document.getElementById('setup-nassau-enabled').disabled"), false);
        run(sb, "document.getElementById('setup-nassau-enabled').checked = true; toggleSetupNassau(); setupNassauPicks = { p1: '101', p2: '102' }; renderSetupNassauPlayers();");
        run(sb, "document.getElementById('setup-nassau-p1').value = '101'; document.getElementById('setup-nassau-p2').value = '102';");
        const p = await save(sb, 'NAS3');
        const keys = Object.keys(p).filter(k => k.startsWith('sideMatches/'));
        assert.equal(keys.length, 1, 'one Nassau pushed: ' + keys);
        assert.equal(p[keys[0]].format, 'nassau');
    });
});

// ---------------------------------------------------------------------------
describe('FIX 5 - deleting a golfer who has posted scores asks first', () => {
    test('a golfer with scores: the confirm names them and says their posted scores will no longer appear; OK removes the row', async () => {
        const sb = await reopen('DEL1', baseRound({ scores: { p102_h1: 4, p102_h2: 5 } }));
        assert.equal(run(sb, "document.querySelectorAll('.player-row').length"), 4);
        run(sb, "removePlayerRowAndRefresh(document.querySelectorAll('.player-row')[1].querySelector('.btn-del') || document.querySelectorAll('.player-row')[1].appendChild(document.createElement('button')))");
        const c = confirms(sb);
        assert.equal(c.length, 1, 'one confirm: ' + JSON.stringify(c));
        assert.match(c[0], /Ben/);
        assert.match(c[0], /2 holes|scores/i);
        assert.match(c[0], /no longer appear/i);
        assert.equal(run(sb, "document.querySelectorAll('.player-row').length"), 3, 'OK removed the row');
    });
    test('Cancel keeps the row and the golfer', async () => {
        const sb = await reopen('DEL2', baseRound({ scores: { p102_h1: 4 } }));
        run(sb, 'confirm = function (m) { window.__confirms.push(String(m)); return false; };');
        run(sb, "removePlayerRowAndRefresh(document.querySelectorAll('.player-row')[1].appendChild(document.createElement('button')))");
        assert.equal(confirms(sb).length, 1);
        assert.equal(run(sb, "document.querySelectorAll('.player-row').length"), 4);
        assert.deepEqual(J(run(sb, 'captureCurrentPlayerInputs().map(function (p) { return p.id; })')), [101, 102, 103, 104]);
    });
    test('a golfer with NO scores, and a blank row, are removed without a prompt', async () => {
        const sb = await reopen('DEL3', baseRound({ scores: { p102_h1: 4 } }));
        run(sb, "removePlayerRowAndRefresh(document.querySelectorAll('.player-row')[2].appendChild(document.createElement('button')))");   // Cal, no scores
        assert.equal(confirms(sb).length, 0);
        assert.equal(run(sb, "document.querySelectorAll('.player-row').length"), 3);
        run(sb, 'addNewPlayerAndRefresh()');
        reattach(sb, ['Ann', 'Ben', 'Dee', '']);
        run(sb, "removePlayerRowAndRefresh(document.querySelectorAll('.player-row')[3].appendChild(document.createElement('button')))");   // the blank row
        assert.equal(confirms(sb).length, 0);
        assert.equal(run(sb, "document.querySelectorAll('.player-row').length"), 3);
    });
    test('the scores are NOT deleted and ids are not re-minted: the payload after OK carries the other three with their ids and no scores key', async () => {
        const sb = await reopen('DEL4', baseRound({ scores: { p102_h1: 4 } }));
        run(sb, "removePlayerRowAndRefresh(document.querySelectorAll('.player-row')[1].appendChild(document.createElement('button')))");
        reattach(sb, ['Ann', 'Cal', 'Dee']);
        const p = await save(sb, 'DEL4');
        assert.deepEqual(p.players.map(x => x.id), [101, 103, 104]);
        assert.ok(!('scores' in p), 'the save never writes scores');
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAMS (source)', () => {
    test('foreign instances are held and written back; a loaded enabled:false is kept', () => {
        assert.match(ADMIN, /foreignGameInstances/);
        const cap = ADMIN.slice(ADMIN.indexOf('function captureSkinsInstances('), ADMIN.indexOf('\n    function ', ADMIN.indexOf('function captureSkinsInstances(') + 10));
        assert.match(cap, /foreignGameInstances/, 'the capture writes the held instances back');
        assert.match(cap, /enabled: inst\.enabled !== false/, 'a disabled instance stays disabled');
    });
    test('the round length is restored from the round\'s own holes; an existing round keeps its own card', () => {
        assert.match(ADMIN, /getElementById\('round-length-select'\);[\s\S]{0,600}lenSel\.value = \(holes\.length === 9/);
        assert.match(ADMIN, /loadedCourseData/);
        assert.match(ADMIN, /if \(loadedExistingRound && loadedCourseData && courseKey === loadedCourseKey\)/);
    });
    test('the Nassau guard and the delete confirm exist', () => {
        assert.match(ADMIN, /function roundAlreadyHasNassau\(/);
        const del = ADMIN.slice(ADMIN.indexOf('function removePlayerRowAndRefresh('), ADMIN.indexOf('\n    function ', ADMIN.indexOf('function removePlayerRowAndRefresh(') + 10));
        assert.match(del, /confirm\(/);
        assert.match(del, /no longer appear/);
        assert.ok(!/db\.ref|scores\//.test(del), 'the delete never touches stored scores');
        assert.match(del, /holesScoredFor\(playerIdOfRow\(row\)\)/, 'the count comes from the scores as loaded, by the row\'s own id');
    });
});
