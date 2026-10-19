// ============================================================================
// URGENT-011: SAME NAME TWICE IS SETTLED AT SETUP, NOT AT RESULTS.
//
// URGENT-004 kept two pasted "Matt"s as two golfers and asked for a last
// initial - but nothing made anyone add one. The round saved, and the Receipt
// (duplicatePlayerNames, keyed trimmed + lowercased like every money total)
// refused to say who pays whom at the end of the day.
//
// Now: the Players step names each pair - "Two golfers named Matt: add a last
// initial" - with an "Add initial" button per golfer, and Save / Save & Start
// refuses (an inline ui note, never a native dialog) until the names differ.
// UI only: no money engine is touched, and no golfer is merged or renamed by
// the app.
//
// mini-dom parses no innerHTML, so the rows a load rebuilds get their name /
// HCP inputs attached here (the limit dialog_admin_test.js states), and the
// block's buttons are read from the markup the page wrote.
// ============================================================================
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const J = (v) => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);
const settle = () => new Promise((r) => setTimeout(r, 40));
const CODE = 'SAME1';
const GLOBAL = { comm_links: { name: 'Test Links', data: J(CD) } };

async function reopen(names) {
    const sb = loadHtmlInlineScript('admin.html', ['pwa-boot.js'], { search: '?game=' + CODE });
    sb.crypto = require('crypto').webcrypto;
    const run = (c) => vm.runInContext(c, sb);
    run(`window.__notes = []; window.__asked = [];
        alert = function (m) { window.__notes.push({ kind: 'alert', text: String(m) }); };
        uiRefuse = function (m) { window.__notes.push({ kind: 'refuse', text: String(m) }); };
        uiFail = function (m) { window.__notes.push({ kind: 'fail', text: String(m) }); };
        uiToast = function () {};
        uiConfirm = function (o) { window.__asked.push(o); return Promise.resolve(true); };`);
    run('globalCourses = ' + JSON.stringify(GLOBAL) + ';');
    const rec = { eventName: 'R', gameFormat: 'stroke', activeCourseKey: 'comm_links', courseName: 'Test Links',
        players: J(makePlayers(names, names.map((_, i) => String(4 + i)), 101)), courseData: J(CD),
        scores: {}, settlementMode: 'whole-dollar', organizerToken: 'tok' };
    const orig = sb.db.ref.bind(sb.db);
    sb.db.ref = (p) => { const r = orig(p); if (p === 'events/' + CODE) r.once = () => Promise.resolve({ val: () => J(rec), exists: () => true }); return r; };
    run('document.__mount(document.getElementById("player-list"));');
    run('loadModeData(' + JSON.stringify(CODE) + ')');
    await settle();
    sb.__names = names;
    run(`document.querySelectorAll('.player-row').forEach(function (row, i) {
        if (!row.querySelector('.p-name-input')) { var n = document.createElement('input'); n.className = 'p-name-input'; n.value = __names[i] || ''; row.appendChild(n); }
        if (!row.querySelector('.p-hcp-input')) { var h = document.createElement('input'); h.className = 'p-hcp-input'; h.value = String(4 + i); row.appendChild(h); }
    });`);
    const j = (e) => JSON.parse(run('JSON.stringify(' + e + ')'));
    return {
        sb, run, j,
        notes: () => j('window.__notes'),
        updates: () => j('window.__dbWrites || []').filter((w) => w.op === 'update' && w.path === 'events/' + CODE),
        block: () => { run('renderDuplicateNamesBlock()'); return String(run("(document.getElementById('roster-dup-names') || {}).innerHTML || ''")); },
        setName: (i, v) => run(`document.querySelectorAll('.player-row')[${i}].querySelector('.p-name-input').value = ${JSON.stringify(v)};`)
    };
}

describe('the Players step names each pair, with a one-tap "Add initial" per golfer', () => {
    test('two Matts (one with stray case/space) and two Mikes: two lines, four buttons', async () => {
        const b = await reopen(['Matt', 'Ann', ' matt ', 'Mike', 'Mike']);
        const html = b.block();
        assert.match(html, /Two golfers named Matt: add a last initial/);
        assert.match(html, /Two golfers named Mike: add a last initial/);
        assert.equal((html.match(/class="btn-outline dup-add-initial"/g) || []).length, 4);
        assert.match(html, /onclick="addInitialFor\('101'\)"/);
        assert.match(html, /onclick="addInitialFor\('103'\)"/);
        assert.ok(!/addInitialFor\('102'\)/.test(html), 'Ann has no duplicate and gets no button');
        assert.match(html, /Save waits until the names differ/);
    });
    test('distinct names: no block at all', async () => {
        const b = await reopen(['Matt S', 'Matt K', 'Ann']);
        assert.equal(b.block(), '');
    });
    test('"Add initial" opens that golfer\'s name box for the initial: the name, a space, nothing renamed for them', async () => {
        const b = await reopen(['Matt', 'Matt']);
        b.run("addInitialFor('102')");
        assert.equal(b.run("document.querySelectorAll('.player-row')[1].querySelector('.p-name-input').value"), 'Matt ');
        assert.equal(b.run("document.querySelectorAll('.player-row')[0].querySelector('.p-name-input').value"), 'Matt');
        assert.match(b.block(), /Two golfers named Matt/, 'a trailing space alone is still the same name');
        b.setName(1, 'Matt K');
        assert.equal(b.block(), '', 'typing the initial clears the ask');
    });
    test('the name box refreshes the block as it is typed in', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
        assert.match(src, /class="p-name-input"[^>]*oninput="renderDuplicateNamesBlock\(\)"/);
    });
});

describe('Save / Save & Start waits until the names differ', () => {
    test('two Matts: refused with a ui note (no alert, no question), nothing written, back on Players', async () => {
        const b = await reopen(['Matt', 'Ann', 'Matt']);
        b.run('goToWizardStep(WIZARD_STEP_OF.review)');
        b.run('saveSettings();');
        await settle();
        const notes = b.notes();
        assert.equal(notes.filter((n) => n.kind === 'alert').length, 0);
        assert.equal(notes.length, 1, JSON.stringify(notes));
        assert.equal(notes[0].kind, 'refuse');
        assert.match(notes[0].text, /Two golfers named Matt: add a last initial\. Save waits until the names differ\./);
        assert.deepEqual(b.updates(), [], 'the round was written with two Matts');
        assert.equal(b.run('currentWizardStep'), b.run('WIZARD_STEP_OF.players'));
        assert.equal(b.run("!!document.getElementById('main-save-btn').disabled"), false, 'the button is given back');
    });
    test('after an initial is added, the same Save goes through', async () => {
        const b = await reopen(['Matt', 'Ann', 'Matt']);
        b.run('saveSettings();');
        await settle();
        assert.deepEqual(b.updates(), []);
        b.setName(2, 'Matt K');
        b.run('saveSettings();');
        await settle();
        assert.equal(b.updates().length, 1, JSON.stringify(b.notes()));
        const names = b.updates()[0].value.players.map((p) => p.name);
        assert.deepEqual(names, ['Matt', 'Ann', 'Matt K']);
    });
    test('the draft dry run is not refused (it must keep the whole round while a name is being fixed)', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
        // The refusal always runs; only the GPS build's draft dry run (hpDry, inside a GPS block)
        // switches it off. The Consumer build carries no draft code at all.
        assert.match(src, /let refuseSameNames = true;[\s\S]{0,200}if \(refuseSameNames\) \{\s*const same = rosterSameNames\(\);/);
        if (fs.existsSync(path.join(REPO_ROOT, 'gps-view.js'))) assert.match(src, /\/\/ GPS:BEGIN\s*if \(hpDry\) refuseSameNames = false;[^\n]*\n\s*\/\/ GPS:END/);
        else assert.ok(!/hpDry/.test(src), 'no draft code in the Consumer admin.html');
    });
});

describe('the notes that come before it lead into it', () => {
    test('the Paste Player List preview keeps the URGENT-004 note and says what Players will ask', () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'admin.html'), 'utf8');
        assert.match(src, /\$\{escapeHtml\(dupNote\)\} After adding, tap \\u201CAdd initial\\u201D beside each one \\u2014 the round won\\u2019t save until the names differ\./);
    });
    // setup-paste-ui.js is a GPS file: a Consumer tree (tools/gps-flag-tree.js) has no
    // "Paste the whole round" at all.
    const SPU = fs.existsSync(path.join(REPO_ROOT, 'setup-paste-ui.js'));
    test('"Paste the whole round" (a round, same name twice) says the same next step',
        { skip: SPU ? false : 'GPS-only: setup-paste-ui.js is not in a Consumer build' }, () => {
        const src = fs.readFileSync(path.join(REPO_ROOT, 'setup-paste-ui.js'), 'utf8');
        assert.match(src, /opts\.mode === 'round' && dupes\.some\(function \(x\) \{ return x\.same; \}\)/);
        assert.match(src, /tap \\u201CAdd initial\\u201D on Players \\u2014 the round won\\u2019t save until the names differ/);
    });
    test('the roster fix line no longer repeats the duplicate note (the block below it carries it)', async () => {
        const b = await reopen(['Matt', 'Matt']);
        b.run("showRosterFixNote('Fixed 2 golfers.')");
        assert.equal(b.run("document.getElementById('roster-fix-note').textContent"), 'Fixed 2 golfers.');
        assert.match(b.block(), /Two golfers named Matt/);
    });
});
