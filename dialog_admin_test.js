// ============================================================================
// UI WAVE 3 — admin.html's SIX QUESTIONS, EVERY ONE DRIVEN BOTH WAYS
//
// admin.html is the setup wizard and the organizer's tool bench. It asked more
// questions through the browser than any other consumer page: 38 tells, five
// decisions and the app's last surviving prompt().
//
//   enableWholeDollarSettlement   a game code TYPED, then whole-dollar settling
//                                 turned on for that round            MONEY
//   removeSkinsInstance           a configured skins game and its pot  MONEY
//   removePlayerRowAndRefresh     a golfer WITH POSTED SCORES removed  DESTRUCTIVE
//   saveSettings                  starting a round with unnamed golfers
//   endAndClearRound              every score for everyone, gone       DESTRUCTIVE
//
// WHY BOTH ANSWERS, EVERY TIME. "No writes nothing" is satisfied by a function
// that never writes anything at all, and "yes writes" by one that never asks.
// This is the lesson from Wave 1, where dropping the await on Remove Ryder Cup
// went red in the source scan AND NOWHERE ELSE - a regex was the only thing
// between a missed await and a destructive path running unasked.
//
// TWO OF THE FIVE ALREADY HAD BEHAVIOURAL COVERAGE and keep it where it lives:
// wizard_resave_test.js drives the golfer-with-scores removal both ways (FIX 5)
// and wizard_delete_round_test.js drives the delete both ways plus both failure
// arms. Those two suites were converted to the new surface rather than
// duplicated here, so their controls fire from the tests that already own them.
// The three with NO behavioural driver at all - the settlement tool, the skins
// removal and the placeholder warning - are covered here from scratch. Before
// this file, removeSkinsInstance's only guard was `/confirm\(/.test(source)` in
// multi_skins_test.js, which a missed await satisfies perfectly.
//
// A MISSED AWAIT IS NOT SYMMETRIC HERE EITHER. All five are written
// `if (!answer) return;` or `const proceed = ...; if (!proceed) return;`, so
// without the await the guard never fires and the action happens unasked. The
// prompt is the different one: its answer is not a boolean but a ROOM CODE, and
// what a Promise does to it is measured in its own test below.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const CD = makeCourseData(18);
const J = (v) => JSON.parse(JSON.stringify(v));
const settle = () => new Promise((r) => setTimeout(r, 40));

// A realm holding admin.html, with the decision sheet and the code field ANSWERED
// TO ORDER rather than removed: what is under test is whether the page asks and
// whether it takes the answer.
//
// Everything is read back through JSON.stringify inside the realm. A cross-realm
// array fails assert.deepEqual on prototype identity alone, which reads as a
// content mismatch and sends you looking for the wrong bug.
function boot(opts) {
    const o = opts || {};
    const sb = loadHtmlInlineScript('admin.html', ['pwa-boot.js'], {
        search: o.search || '',
        beforeRun(sandbox) { if (o.reads) sandbox.__dbReads = J(o.reads); }
    });
    vm.runInContext(`
        window.__notes = []; window.__toasts = []; window.__asked = [];
        window.__typed = [];
        alert = function (m) { window.__notes.push({ kind: 'alert', text: String(m) }); };
        uiRefuse = function (m) { window.__notes.push({ kind: 'refuse', text: String(m) }); };
        uiFail   = function (m) { window.__notes.push({ kind: 'fail', text: String(m) }); };
        uiToast  = function (m) { window.__toasts.push(String(m)); };
        uiConfirm = function (o) {
            window.__asked.push(JSON.parse(JSON.stringify(o || {})));
            return Promise.resolve(${JSON.stringify(!!o.answer)});
        };
        uiPrompt = function (o) {
            window.__typed.push(JSON.parse(JSON.stringify(o || {})));
            return Promise.resolve(${JSON.stringify(o.typed === undefined ? null : o.typed)});
        };
    `, sb);
    const j = (e) => JSON.parse(vm.runInContext('JSON.stringify(' + e + ')', sb));
    return {
        sb,
        run: (c) => vm.runInContext(c, sb),
        asked: () => j('window.__asked'),
        typed: () => j('window.__typed'),
        notes: () => j('window.__notes'),
        toasts: () => j('window.__toasts'),
        writes: () => j('window.__dbWrites || []')
    };
}

// ---------------------------------------------------------------------------
describe('1. THE SETTLEMENT TOOL — a code that is TYPED, then a decision', () => {

    const CODE = 'WDS1';
    const ROUND = { eventName: 'Monday', courseName: 'Test', gameFormat: 'stroke', courseData: J(CD),
                    players: J(makePlayers(['Ann', 'Ben'], [2, 9], 101)), scores: {} };
    const reads = { ['events/' + CODE]: ROUND };

    test('it asks for the code, then asks the question, then writes — in that order', async () => {
        const b = boot({ reads, typed: 'wds1', answer: true });
        b.run('currentMode = null;');
        b.run('enableWholeDollarSettlement();');
        await settle();
        assert.equal(b.typed().length, 1, 'the code was not asked for');
        assert.equal(b.asked().length, 1, 'whole-dollar settling was turned on without a question');
        assert.deepEqual(b.writes().filter(w => w.op === 'set'),
            [{ path: 'events/WDS1/settlementMode', op: 'set', value: 'whole-dollar' }],
            'the write did not land where the typed code says: ' + JSON.stringify(b.writes()));
    });

    test('THE CODE THAT LANDS IS THE STRING TYPED — lowercase in, uppercase path out', async () => {
        // This is the money assertion for the prompt. The typed value is not a
        // yes/no; it names the ROUND whose payouts change. A wrong code here
        // either does nothing or changes the wrong round's money.
        for (const typed of ['wds1', '  wds1  ', 'WdS1']) {
            const b = boot({ reads, typed, answer: true });
            b.run('currentMode = null;');
            b.run('enableWholeDollarSettlement();');
            await settle();
            const sets = b.writes().filter(w => w.op === 'set').map(w => w.path);
            assert.deepEqual(sets, ['events/WDS1/settlementMode'],
                JSON.stringify(typed) + ' should reach events/WDS1, reached ' + JSON.stringify(sets));
        }
    });

    test('NEVER a stringified promise: the path carries no [object Promise] and no undefined', async () => {
        // What a missed await would actually produce. Measured rather than
        // assumed - see the control note in the wave report.
        const b = boot({ reads, typed: 'wds1', answer: true });
        b.run('currentMode = null;');
        b.run('enableWholeDollarSettlement();');
        await settle();
        const sets = b.writes().filter(w => w.op === 'set').map(w => w.path);
        // The positive half FIRST. Without it this block is satisfied by a page
        // that wrote nothing at all - the empty-slice trap this repo has a rule
        // about - and it would have stayed green on HEAD, where the native
        // prompt() returns undefined and no write is attempted.
        assert.deepEqual(sets, ['events/WDS1/settlementMode'],
            'nothing was written, so "no promise in the path" proves nothing: '
            + JSON.stringify(b.writes()));
        const seen = JSON.stringify(sets) + JSON.stringify(b.notes());
        assert.ok(!/object Promise/i.test(seen), 'a promise reached the path: ' + seen);
        assert.ok(!/undefined|\[object/i.test(seen), 'a non-code reached the path: ' + seen);
    });

    test('an EMPTY answer is a cancel: nothing is asked and nothing is written', async () => {
        const b = boot({ reads, typed: null, answer: true });
        b.run('currentMode = null;');
        b.run('enableWholeDollarSettlement();');
        await settle();
        assert.equal(b.typed().length, 1, 'the code was not asked for');
        assert.deepEqual(b.asked(), [], 'it asked the question with no round to ask it about');
        assert.deepEqual(b.writes(), [], 'something was written for an empty code');
        assert.deepEqual(b.notes(), [], 'changing your mind is not an error and must not scold');
    });

    test('answering NO leaves the round settling as it was', async () => {
        const b = boot({ reads, typed: 'wds1', answer: false });
        b.run('currentMode = null;');
        b.run('enableWholeDollarSettlement();');
        await settle();
        assert.equal(b.asked().length, 1, 'it did not ask');
        assert.deepEqual(b.writes(), [],
            'the payouts were changed after the organizer said no: ' + JSON.stringify(b.writes()));
        assert.deepEqual(b.toasts(), [], 'and it claimed to have done it');
    });

    test('a round that ALREADY settles in whole dollars is refused before the question', async () => {
        const already = { ['events/' + CODE]: Object.assign(J(ROUND), { settlementMode: 'whole-dollar' }) };
        const b = boot({ reads: already, typed: 'wds1', answer: true });
        b.run('currentMode = null;');
        b.run('enableWholeDollarSettlement();');
        await settle();
        assert.deepEqual(b.asked(), [], 'it asked about something already true');
        assert.equal(b.notes().length, 1, 'it said nothing: ' + JSON.stringify(b.notes()));
        assert.equal(b.notes()[0].kind, 'refuse',
            'an action that did not happen is a refusal, not a receipt: ' + JSON.stringify(b.notes()));
        assert.match(b.notes()[0].text, /already settles in whole dollars/);
    });

    test('the receipt is the only floating thing on the path, and it comes AFTER the write',
        async () => {
        const b = boot({ reads, typed: 'wds1', answer: true });
        b.run('currentMode = null;');
        b.run('enableWholeDollarSettlement();');
        await settle();
        assert.equal(b.toasts().length, 1, JSON.stringify(b.toasts()));
        assert.match(b.toasts()[0], /will settle in whole dollars/);
        assert.deepEqual(b.notes(), [], 'a success must not also leave a note');
    });
});

// ---------------------------------------------------------------------------
describe('2. REMOVING A SKINS GAME — a configured pot', () => {

    const TWO = `skinsInstances = [
        { id: 'si1', skinsBuyIn: 5, participantIds: ['101', '102'], enabled: true },
        { id: 'si2', skinsBuyIn: 9, participantIds: ['101'], enabled: true }];`;
    const ids = (b) => JSON.parse(vm.runInContext('JSON.stringify(skinsInstances.map(function (x) { return x.id; }))', b.sb));

    test('it asks, and names the stake and the golfer count', async () => {
        const b = boot({ answer: false });
        b.run(TWO);
        b.run("removeSkinsInstance('si1');");
        await settle();
        assert.equal(b.asked().length, 1, 'a configured skins game was removed without a question');
        const q = JSON.stringify(b.asked()[0]);
        assert.match(q, /\$5/, 'the question must name the stake: ' + q);
        assert.match(q, /2 golfers/, 'and who is in it: ' + q);
    });

    test('answering NO keeps the game', async () => {
        const b = boot({ answer: false });
        b.run(TWO);
        b.run("removeSkinsInstance('si1');");
        await settle();
        assert.deepEqual(ids(b), ['si1', 'si2'],
            'the skins game was removed after the organizer said no');
    });

    test('answering YES removes exactly that one', async () => {
        const b = boot({ answer: true });
        b.run(TWO);
        b.run("removeSkinsInstance('si1');");
        await settle();
        assert.deepEqual(ids(b), ['si2'], 'the wrong game was removed, or none was');
    });

    test('an id that is not there asks nothing and removes nothing', async () => {
        const b = boot({ answer: true });
        b.run(TWO);
        b.run("removeSkinsInstance('nope');");
        await settle();
        assert.deepEqual(b.asked(), []);
        assert.deepEqual(ids(b), ['si1', 'si2']);
    });
});

// ---------------------------------------------------------------------------
describe('3. STARTING A ROUND WITH UNNAMED GOLFERS — warn, do not block', () => {

    const CODE = 'PLC1';
    // Player 1 / Player 2 are exactly what isPlaceholderPlayerName matches, and
    // exactly what a blank name box is saved as.
    function record(names) {
        return { eventName: 'R', gameFormat: 'stroke', activeCourseKey: 'comm_links', courseName: 'Test Links',
                 players: J(makePlayers(names, names.map(() => '0'), 101)), courseData: J(CD),
                 scores: {}, settlementMode: 'whole-dollar', organizerToken: 'tok' };
    }
    const GLOBAL = { comm_links: { name: 'Test Links', data: J(CD) } };

    async function reopen(names, o) {
        const b = boot(Object.assign({ search: '?game=' + CODE }, o));
        b.sb.crypto = require('crypto').webcrypto;
        b.run('globalCourses = ' + JSON.stringify(GLOBAL) + ';');
        const rec = record(names);
        const orig = b.sb.db.ref.bind(b.sb.db);
        b.sb.db.ref = (p) => {
            const r = orig(p);
            if (p === 'events/' + CODE) r.once = () => Promise.resolve({ val: () => J(rec), exists: () => true });
            return r;
        };
        b.run('document.__mount(document.getElementById("player-list"));');
        b.run('loadModeData(' + JSON.stringify(CODE) + ')');
        await settle();
        // mini-dom parses no innerHTML, so the rows the load rebuilds carry no
        // readable name inputs. They are attached here with the names the test
        // knows - the same limit wizard_resave_test.js states and works around.
        b.sb.__names = names;
        b.run(`document.querySelectorAll('.player-row').forEach(function (row, i) {
            if (!row.querySelector('.p-name-input')) { var n = document.createElement('input'); n.className = 'p-name-input'; n.value = __names[i] || ''; row.appendChild(n); }
            if (!row.querySelector('.p-hcp-input')) { var h = document.createElement('input'); h.className = 'p-hcp-input'; h.value = '0'; row.appendChild(h); }
        });`);
        return b;
    }
    const updates = (b) => b.writes().filter(w => w.op === 'update' && w.path === 'events/' + CODE);

    test('two unnamed golfers: it asks, and says what a placeholder costs', async () => {
        const b = await reopen(['Player 1', 'Player 2'], { answer: false });
        b.run('saveSettings();');
        await settle();
        assert.equal(b.asked().length, 1, 'the round saved without a word: ' + JSON.stringify(b.asked()));
        const q = JSON.stringify(b.asked()[0]);
        assert.match(q, /2 golfers have/, q);
        assert.match(q, /trip or a Ryder Cup/, 'it must say what is lost: ' + q);
    });

    test('answering NO does not save the round', async () => {
        const b = await reopen(['Player 1', 'Player 2'], { answer: false });
        b.run('saveSettings();');
        await settle();
        assert.deepEqual(updates(b), [],
            'the round was started after the organizer went back to name them: '
            + JSON.stringify(b.writes().map(w => w.op + ' ' + w.path)));
    });

    test('answering YES saves it — this WARNS, it does not block', async () => {
        const b = await reopen(['Player 1', 'Player 2'], { answer: true });
        b.run('saveSettings();');
        await settle();
        assert.equal(updates(b).length, 1,
            'a warned-and-accepted round must still start: '
            + JSON.stringify(b.writes().map(w => w.op + ' ' + w.path)));
    });

    test('named golfers are never asked, and the save is not delayed by a question', async () => {
        const b = await reopen(['Ann', 'Ben'], { answer: false });
        b.run('saveSettings();');
        await settle();
        assert.deepEqual(b.asked(), [], 'a named round was interrogated');
        assert.equal(updates(b).length, 1, 'a named round did not save');
    });

    test('the save button is put back after a refusal, so the organizer can try again',
        async () => {
        // The finally arm. A question answered "no" is a refusal like any other,
        // and leaving the button disabled would strand the wizard on step 7 with
        // no way forward.
        const b = await reopen(['Player 1', 'Player 2'], { answer: false });
        b.run('saveSettings();');
        await settle();
        assert.equal(b.run("!!(document.getElementById('main-save-btn') || {}).disabled"), false,
            'the save button is still disabled after the organizer said no');
    });
});

// ---------------------------------------------------------------------------
describe('4. THE PAGE SPEAKS FOR ITSELF NOW', () => {

    test('no bare alert / confirm / prompt is left in admin.html', () => {
        // The same single-pass scanner dialog_await_guard_test.js uses: a chain of
        // regex replaces gets this wrong, because a `/*` inside a `//` comment
        // opens a block comment that runs to the next `*/` hundreds of lines away.
        const code = codeOf(ADMIN);
        for (const k of ['alert', 'confirm', 'prompt']) {
            const re = new RegExp('(?<![\\w.$])' + k + '\\s*\\(', 'g');
            const hits = [];
            let m;
            while ((m = re.exec(code))) hits.push(code.slice(0, m.index).split('\n').length);
            assert.deepEqual(hits, [], 'admin.html still calls ' + k + '() at line(s) ' + hits.join(', '));
        }
    });

    test('it REUSES ui-dialogs.js and did not fork it', () => {
        assert.ok(/<script src="ui-dialogs\.js"><\/script>/.test(ADMIN),
            'admin.html does not load the shared component');
        assert.ok(!/function uiRefuse|function uiConfirm|function uiToast|function uiPrompt/.test(ADMIN),
            'the page defined its own copy of the component');
        assert.ok(!/\.ui-note\s*\{|\.ui-sheet\s*\{|\.ui-toast\s*\{/.test(ADMIN),
            'the component CSS was copied into the page');
        // ONE definition of each, repo-wide. Wave 1 made this a shared file
        // precisely because three drifting copies of the overlay is what came
        // before it.
        const pages = fs.readdirSync(REPO_ROOT).filter(f => /\.html$/.test(f));
        for (const fn of ['uiPrompt', 'uiConfirm', 'uiAmount']) {
            const owners = pages.filter(p => new RegExp('function ' + fn + '\\s*\\(').test(read(p)));
            assert.deepEqual(owners, [], fn + ' is declared inside ' + owners.join(', '));
        }
        assert.equal((read('ui-dialogs.js').match(/function uiPrompt\s*\(/g) || []).length, 1,
            'ui-dialogs.js must declare uiPrompt exactly once');
    });

    test('the five deciding functions are async, and the page still parses', () => {
        const FNS = ['enableWholeDollarSettlement', 'removeSkinsInstance',
                     'removePlayerRowAndRefresh', 'saveSettings', 'endAndClearRound'];
        FNS.forEach(fn => assert.ok(new RegExp('async function ' + fn + '\\s*\\(').test(ADMIN),
            fn + ' must be async'));
        const b = boot({});
        FNS.forEach(fn => assert.equal(b.run('typeof ' + fn), 'function',
            fn + ' did not survive parse'));
    });

    test('THE NOTE PATH HAS NO setTimeout: a refusal and a failure stay put', () => {
        // A refusal means the action did not happen. If it floats away the
        // organizer taps a dead control twice. Held on the component, because
        // that is where it would be broken for every caller at once.
        const src = read('ui-dialogs.js');
        const notePath = src.slice(src.indexOf('function placeNote'), src.indexOf('// ---- IT WORKED'));
        assert.ok(!/setTimeout/.test(notePath),
            'a note is self-dismissing - that is a toast, and a refusal is not one');
        assert.match(src, /function uiToast/, 'and the floating one still exists');
    });

    test('the 38 tells are split by WHAT THEY ARE FOR, not evenly', () => {
        const code = codeOf(ADMIN);
        const n = (k) => (code.match(new RegExp('(?<![\\w.$])' + k + '\\s*\\(', 'g')) || []).length;
        const refuse = n('uiRefuse'), fail = n('uiFail'), toast = n('uiToast');
        assert.equal(refuse + fail + toast, 38,
            'the 38 alerts should still be 38 messages, got '
            + refuse + ' + ' + fail + ' + ' + toast);
        // Receipts are the minority and always will be: most of what a setup
        // wizard says is "no, because".
        assert.ok(toast < refuse, 'more things float than refuse: ' + toast + ' vs ' + refuse);
        assert.ok(toast <= 8, 'too much of this page floats away: ' + toast);
    });
});

// ---------------------------------------------------------------------------
describe('5. THE PAGE\'S OWN OVERLAY IS LEFT ALONE, DELIBERATELY', () => {

    // admin.html's .modal-overlay is the copy that DRIFTED: rgba(0,0,0,0.5) and
    // z-index 2000, where index.html and sidematches.html both say 0.6 and 999.
    // It is NOT reconciled by this wave, and that is a decision with a measured
    // reason rather than an oversight:
    //
    //   1. ui-dialogs.js injects its own backdrop (0.6, z-index 4100) and never
    //      reads the page's class, so the drift cannot reach any converted path.
    //   2. After this wave admin.html's .modal-overlay dresses exactly ONE
    //      element, #paste-players-modal. It is no longer a dialog backdrop.
    //   3. THE DRIFT WAS NOT ARBITRARY. Measured, the whole z-index stack of each
    //      page: index.html has 1, 5, 10 and its overlay at 999; sidematches.html
    //      has nothing but its overlay at 999; admin.html has 50, a
    //      .custom-select-dropdown at 1000, and its overlay at 2000. So 999 is
    //      safe on the two pages that use it and is NOT available here - it would
    //      put #paste-players-modal underneath this page's own course dropdown.
    //      A cosmetic match traded for a real stacking bug.
    //
    // Pinned so a later "tidy-up" is a deliberate act with this note in front of
    // it, not a silent one.
    test('admin.html keeps 0.5 / z-index 2000, and the reason still holds', () => {
        const rule = ADMIN.slice(ADMIN.indexOf('.modal-overlay {'));
        const decl = rule.slice(0, rule.indexOf('}'));
        assert.ok(/rgba\(0,0,0,0\.5\)/.test(decl), 'admin.html\'s backdrop moved: ' + decl);
        assert.ok(/z-index:2000/.test(decl), 'admin.html\'s overlay z-index moved: ' + decl);
        assert.ok(/\.custom-select-dropdown[^}]*z-index: 1000/.test(ADMIN),
            'the dropdown that 999 would sit above is gone - re-decide the drift');
        // And the comparison that makes 999 safe on the other two: neither has
        // anything above 10 to collide with. If one grows something, the reason
        // above is worth re-reading rather than inheriting.
        const top = (f) => Math.max.apply(null, (read(f).match(/z-index: ?(\d+)/g) || [])
            .map(x => Number(x.replace(/\D/g, ''))).filter(n => n < 999).concat([0]));
        assert.ok(top('index.html') <= 10, 'index.html grew a high z-index: ' + top('index.html'));
        assert.ok(top('sidematches.html') <= 10, 'sidematches.html grew one: ' + top('sidematches.html'));
        // (admin.html's own 1000 is asserted directly above; `top` deliberately
        // ignores anything at or over 999 so an overlay cannot answer for itself.)
    });

    test('and it now dresses ONE element, which is why matching the others buys nothing', () => {
        const users = (ADMIN.match(/class="modal-overlay"/g) || []).length;
        assert.equal(users, 1, 'admin.html has ' + users + ' overlays now - re-read the note above');
        assert.ok(/<div class="modal-overlay" id="paste-players-modal">/.test(ADMIN),
            'the paste-players modal no longer uses .modal-overlay');
    });

    test('the shared component brings its own, above both', () => {
        const src = read('ui-dialogs.js');
        assert.match(src, /\.ui-sheet\{[^}]*background:rgba\(0,0,0,0\.6\)/);
        assert.match(src, /z-index:4100/);
    });
});

// ---------------------------------------------------------------------------
// The scanner, copied from dialog_await_guard_test.js on purpose: in Wave 1 my
// recon counter and the guard had the SAME regex-chain bug and agreed with each
// other while both were wrong. Comments are blanked, never deleted, so a reported
// line number is the file's own.
function codeOf(src) {
    const out = new Array(src.length);
    let i = 0;
    const NORMAL = 0, LINE = 1, BLOCK = 2, HTML = 3, STR = 4;
    let state = NORMAL, quote = '';
    while (i < src.length) {
        const c = src[i], c2 = src.substr(i, 2), c4 = src.substr(i, 4);
        if (state === NORMAL) {
            if (c2 === '//') { state = LINE; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
            if (c2 === '/*') { state = BLOCK; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
            if (c4 === '<!--') { state = HTML; for (let k = 0; k < 4; k++) out[i + k] = ' '; i += 4; continue; }
            if (c === '"' || c === "'" || c === '`') { state = STR; quote = c; out[i] = c; i++; continue; }
            out[i] = c; i++; continue;
        }
        if (state === STR) {
            if (c === '\\') { out[i] = c; out[i + 1] = src[i + 1]; i += 2; continue; }
            if (c === quote) { state = NORMAL; }
            out[i] = c; i++; continue;
        }
        if (state === LINE && c === '\n') { state = NORMAL; out[i] = c; i++; continue; }
        if (state === BLOCK && c2 === '*/') { state = NORMAL; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
        if (state === HTML && src.substr(i, 3) === '-->') { state = NORMAL; out[i] = ' '; out[i + 1] = ' '; out[i + 2] = ' '; i += 3; continue; }
        out[i] = (c === '\n') ? '\n' : ' ';
        i++;
    }
    return out.join('');
}
