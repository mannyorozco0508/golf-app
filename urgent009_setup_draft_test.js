// ============================================================================
// URGENT-009 (013-9, MEDIUM): AN UNSAVED SETUP IS KEPT ON THIS PHONE.
//
// Measured by tools/sim/setup-shapes.js E-kill / E-switch / E-back: killing the
// app mid-setup, Home -> GPS -> Games, or the top "← Back" dropped the course,
// the 20 pasted golfers, the flights and the Weekly Game with no word.
//
//   KEPT     while a NEW round is set up, the record its Save would write is
//            kept (hardpan_setup_draft_v1) - Save's own record, from a dry run
//            that writes nothing, asks nothing and leaves the button alone.
//   OFFERED  Home / Games / Start a round: "Resume your unsaved round setup?"
//   BACK     ?draft=1 puts it back through loadModeData, as a NEW round.
//   ASKED    leaving (the nav bar's Home, "← Back") asks first.
//   GONE     once saved (held or landed), it is no longer a draft.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function page(search, seed) {
    const sb = loadHtmlInlineScript('admin.html', [], { search, localStorage: true, seedStorage: seed || {},
        beforeRun: (s) => { s.location.pathname = '/admin.html'; } });
    return sb;
}
// mini-dom does not parse a row's markup into inputs: they are attached the way the wizard tests do.
const NAMES = `window.__names = function (names) { document.querySelectorAll('.player-row').forEach(function (row, i) {
    if (!row.querySelector('.p-name-input')) { var n = document.createElement('input'); n.className = 'p-name-input'; n.value = names[i] || ''; row.appendChild(n); }
    if (!row.querySelector('.p-hcp-input')) { var h = document.createElement('input'); h.className = 'p-hcp-input'; h.value = '0'; row.appendChild(h); } }); };`;
function buildSetup(sb) {
    vm.runInContext(NAMES, sb);
    vm.runInContext(`
        var key = Object.keys(coursePresets)[0];
        courseHiddenSelect.value = key; courseSearchInput.value = coursePresets[key].name;
        document.__mount(document.getElementById('player-list'));
        addPlayerRow('Manny', '12'); addPlayerRow('Skeens', '4');
        __names(['Manny', 'Skeens']);
        document.getElementById('admin-screen').style.display = 'block';
        window.__btn = document.getElementById('main-save-btn'); window.__btn.innerText = 'SAVE-LABEL'; window.__btn.disabled = false;
    `, sb);
}
const draftOf = (sb) => JSON.parse(sb.localStorage.getItem('hardpan_setup_draft_v1') || 'null');

describe('KEPT: Save\'s own record, from a dry run that does nothing else', () => {
    test('a setup with a course and golfers is kept, and the dry run writes nothing, asks nothing, leaves the button and the roster memory alone', () => {
        const sb = page('?game=DRAFT1');
        buildSetup(sb);
        sb.localStorage.setItem('golfAppRoster', 'BEFORE');
        const writes0 = sb.__dbWrites.length;
        vm.runInContext('window.__asked = 0; uiConfirm = function () { window.__asked++; return Promise.resolve(true); }; hpDraftDirty = true; window.__kept = hpDraftKeepNow();', sb);
        assert.equal(sb.__kept, true);
        const d = draftOf(sb);
        assert.equal(d.code, 'DRAFT1');
        assert.ok(d.record.activeCourseKey, 'the course');
        assert.ok(Array.isArray(d.record.courseData) && d.record.courseData.length >= 9, 'the card');
        assert.deepEqual(d.record.players.map((p) => p.name).filter(Boolean), ['Manny', 'Skeens']);
        assert.equal(d.golfers, 2);
        assert.equal(d.record.organizerToken, undefined, 'no token in a draft');
        assert.equal(sb.__dbWrites.length, writes0, 'nothing written');
        assert.equal(sb.__asked, 0, 'nothing asked');
        assert.equal(sb.__btn.innerText, 'SAVE-LABEL'); assert.equal(sb.__btn.disabled, false);
        assert.equal(sb.localStorage.getItem('golfAppRoster'), 'BEFORE');
        assert.equal(vm.runInContext('typeof uiConfirm === "function" && window.__asked === 0 && hpDry === null', sb), true, 'everything put back');
    });
    test('the default state - nothing touched - keeps nothing', () => {
        const sb = page('?game=DRAFT2');
        vm.runInContext("document.getElementById('admin-screen').style.display = 'block'; window.__k = hpDraftKeepNow();", sb);
        assert.equal(sb.__k, false);
        assert.equal(draftOf(sb), null);
    });
    test('no course yet (Save would refuse): the golfers are still kept', () => {
        const sb = page('?game=DRAFT3');
        vm.runInContext(NAMES, sb);
        vm.runInContext("document.__mount(document.getElementById('player-list')); addPlayerRow('Manny', '12'); __names(['Manny']); document.getElementById('admin-screen').style.display = 'block'; hpDraftDirty = true; hpDraftKeepNow();", sb);
        assert.deepEqual(draftOf(sb).record.players.map((p) => p.name), ['Manny']);
    });
    test('a save in flight is never disturbed by a draft', () => {
        const sb = page('?game=DRAFT4');
        buildSetup(sb);
        vm.runInContext("window.__btn.disabled = true; window.__btn.innerText = 'Saving'; hpDraftDirty = true; window.__k = hpDraftKeepNow();", sb);
        assert.equal(sb.__k, false); assert.equal(sb.__btn.innerText, 'Saving'); assert.equal(sb.__btn.disabled, true);
    });
    test('Save clears it: a saved round is not a draft', async () => {
        const sb = page('?game=DRAFT5');
        buildSetup(sb);
        vm.runInContext("hpDraftDirty = true; hpDraftKeepNow(); db.ref = function (p) { return { once: function () { return new Promise(function () {}); }, on: function () {}, push: function () { return { key: 'K' }; }, update: function () { return new Promise(function () {}); }, set: function () { return Promise.resolve(); } }; }; saveSettings();", sb);
        assert.equal(draftOf(sb), null);
        await wait(700);
        assert.equal(draftOf(sb), null, 'and not re-made after it');
    });
});

describe('BACK: ?draft=1 puts the draft back, as a new round', () => {
    test('the course and the golfers come back, and the round is still created as new', async () => {
        const a = page('?game=DRAFT6');
        buildSetup(a);
        vm.runInContext('hpDraftDirty = true; hpDraftKeepNow();', a);
        const seed = { hardpan_setup_draft_v1: a.localStorage.getItem('hardpan_setup_draft_v1') };
        const b = page('?game=DRAFT6&draft=1', seed);
        await wait(50);
        vm.runInContext("document.__mount(document.getElementById('player-list'))", b);
        const st = vm.runInContext("({ course: courseSearchInput.value, key: courseHiddenSelect.value, rows: Array.prototype.map.call(document.querySelectorAll('#player-list .player-row'), function (r) { return playerIdOfRow(r); }), existing: loadedExistingRound })", b);
        const rec = JSON.parse(seed.hardpan_setup_draft_v1).record;
        assert.equal(st.key, rec.activeCourseKey);
        assert.ok(st.course);
        assert.deepEqual(st.rows.map(String), rec.players.map((p) => String(p.id)), 'the same two golfers, by id');
        assert.equal(st.existing, false, 'a draft is a new round: settlementMode is written on its Save');
    });
    test('without ?draft=1 nothing is restored (an arrival never surprises)', async () => {
        const a = page('?game=DRAFT7');
        buildSetup(a);
        vm.runInContext('hpDraftDirty = true; hpDraftKeepNow();', a);
        const b = page('?game=DRAFT7', { hardpan_setup_draft_v1: a.localStorage.getItem('hardpan_setup_draft_v1') });
        await wait(50);
        vm.runInContext("document.__mount(document.getElementById('player-list'))", b);
        assert.equal(vm.runInContext("courseHiddenSelect.value", b) || '', '', 'no course put back');
    });
});

describe('OFFERED and ASKED (front-door.js, admin.html)', () => {
    const fd = read('front-door.js');
    const admin = read('admin.html');
    const gps = admin.split('// GPS:BEGIN').slice(1).map((b) => b.split('// GPS:END')[0]).join('\n');
    test('Home and Games: "Resume your unsaved round setup?" with Discard; Start a round asks before minting a code', () => {
        assert.match(fd, /Resume your unsaved round setup\?/);
        assert.match(fd, /data-hp-draft-discard/);
        assert.match(fd, /draftAsk\(\)\.then\(function \(went\) \{ if \(!went && typeof W\.selectHomeWidget === 'function'\) W\.selectHomeWidget\('quick'\); \}\);/);
        assert.match(fd, /if \(heldFor\(d\.code\)\) return null;/, 'a saved round is never offered as a draft');
    });
    test('leaving an unsaved setup asks first - Home on the nav bar and the top "← Back"', () => {
        assert.match(gps, /closest\('#admin-screen \.back-btn, #admin-screen #app-nav-bar a\[href\]'\)/);
        assert.match(gps, /title: 'Leave round setup\?'/);
        assert.match(gps, /document\.addEventListener\('click', hpLeaveClick, true\)/);
    });
    test('the dry run stops in saveSettings before any question or write, inside a GPS block', () => {
        const at = admin.indexOf('async function saveSettings(');
        const fn = admin.slice(at, admin.indexOf('\n    // CHECK BEFORE WRITING', at));
        const dry = fn.indexOf('if (hpDry) { hpDry.payload = payload; return; }');
        assert.ok(dry > 0 && dry < fn.indexOf('const placeholderNames') && dry < fn.indexOf('const saveChain'));
        assert.match(fn, /\/\/ GPS:BEGIN\s*\n\s*\/\/ A DRAFT, NOT A SAVE/);
    });
});
