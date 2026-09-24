// ============================================================================
// CODE ISSUER - A CREATION THAT CANNOT REACH THE DATABASE FAILS VISIBLY.
//
// MEASURED 2026-09-14 (cold Chrome, network cut at the browser): tapping Game
// Day with no connection left the tile on "⏳ Starting..." at +0.3 s, +2 s,
// +5 s, +8 s and forever. issueUniqueCode awaits db.ref(...).once('value'),
// and the Realtime Database SDK neither resolves nor rejects that read while
// the socket is down - it queues it. No caller can catch what never rejects.
//
// THE RULE. Every existence check races the once() against a timer,
// opts.timeoutMs (default 8000). On timeout the issuer REJECTS with an Error
// whose .code is 'timeout', distinguishable from the exhausted-attempts
// rejection callers already handle. navigator.onLine is NOT consulted: it
// read true under the same offline emulation, so it cannot be the decision.
// Every caller restores its control (label and aria-disabled) and shows a
// blocking alert that says the thing was not created and to try again - and
// does not blame the network, because the app cannot tell.
//
// THE CALLERS, and what each must do on rejection:
//   admin.html      createRoom, startFromPreviousRound  restore the tile
//   trip.html       the planner's build button, the new-trip control
//   tournament.html saveTournament (which today changes no button state at all)
// ============================================================================

const { test, describe } = require('node:test');
// EVERY ASYNC TEST HAS A 3 s TIMEOUT: a hang is exactly the defect, and a runner
// that waits forever on it would report nothing at all.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const { issueUniqueCode } = require(path.join(REPO_ROOT, 'code-issuer.js'));

// A database whose once() answers after `delayMs` (or never, when null).
function slowDb(delayMs, present) {
    const reads = [];
    return {
        reads,
        ref(p) {
            reads.push(p);
            return { once: () => new Promise(res => {
                if (delayMs === null) return;                       // hangs, like a dead socket
                setTimeout(() => res({ exists: () => !!(present && present.has(p)) }), delayMs);
            }) };
        }
    };
}
const scripted = (seq) => { let i = 0; return () => (i < seq.length ? seq[i++] : 'FREE' + (i++)); };

describe('THE TIMEOUT: a read that never answers becomes a rejection the caller can see', () => {
    test('a hung once() rejects after timeoutMs with err.code === "timeout"', { timeout: 3000 }, async () => {
        const t0 = Date.now();
        await assert.rejects(issueUniqueCode({ db: slowDb(null), root: 'events', timeoutMs: 120 }),
            (err) => { assert.equal(err.code, 'timeout', 'code: ' + err.code + ' message: ' + err.message); assert.match(err.message, /events/); return true; });
        const took = Date.now() - t0;
        assert.ok(took >= 100 && took < 1500, 'rejected at the timer, not before and not much after: ' + took + 'ms');
    });
    test('the default timeout is 8000 ms, read from the module (the number the copy will promise)', () => {
        assert.equal((read('code-issuer.js').match(/opts\.timeoutMs \|\| 8000/g) || []).length, 2, 'the issuer and the shared readWithTimeout');
    });
    test('a SLOW but successful check under the timeout still succeeds - no false failure', { timeout: 3000 }, async () => {
        const code = await issueUniqueCode({ db: slowDb(60), root: 'events', generate: scripted(['SLOWOK']), timeoutMs: 400 });
        assert.equal(code, 'SLOWOK');
    });
    test('a slow collision followed by a free code still succeeds inside the budget per attempt', { timeout: 3000 }, async () => {
        const db = slowDb(40, new Set(['events/TAKEN1']));
        const code = await issueUniqueCode({ db, root: 'events', generate: scripted(['TAKEN1', 'FREE22']), timeoutMs: 300 });
        assert.equal(code, 'FREE22');
        assert.deepEqual(db.reads, ['events/TAKEN1', 'events/FREE22']);
    });
    test('the exhausted-attempts rejection is unchanged: no code, its own message, no timeout code', { timeout: 3000 }, async () => {
        const db = slowDb(0, new Set(['events/AAAAAA']));
        await assert.rejects(issueUniqueCode({ db, root: 'events', generate: () => 'AAAAAA', maxAttempts: 3, timeoutMs: 500 }),
            (err) => { assert.match(err.message, /could not issue a free events code after 3 attempts/); assert.notEqual(err.code, 'timeout'); return true; });
    });
    test('a timeout on a LATER attempt (first read slow-collides, second hangs) is still a timeout', { timeout: 3000 }, async () => {
        let n = 0;
        const db = { ref(p) { n++; return { once: () => new Promise(res => { if (n === 1) setTimeout(() => res({ exists: () => true }), 20); }) }; } };
        await assert.rejects(issueUniqueCode({ db, root: 'events', generate: scripted(['TAKEN1', 'HANGS1']), timeoutMs: 100 }),
            (err) => err.code === 'timeout');
    });
    test('the timer does not keep the process alive after a fast answer (unref or cleared)', { timeout: 3000 }, async () => {
        // A timer left running after resolve would fire later and, at worst,
        // reject a promise nobody holds. The module must clear it.
        const src = read('code-issuer.js');
        assert.match(src, /clearTimeout\(/, 'the race clears its timer when the read wins');
    });
});

// ---- THE CALLERS ----------------------------------------------------------
// Each page is loaded in the harness with a db whose once() hangs; the issuer's
// timeout is shortened through the page's own call by stubbing window.
// issueUniqueCode? NO - that would test the stub. The page's call is left
// alone and the real issuer runs against the hung db with the DEFAULT timeout
// swapped for a short one by the module's own option... which the callers do
// not pass. So the test overrides the module-level default by loading
// code-issuer.js with a patched constant - see issuerWith().
function issuerWith(timeoutMs) {
    // The real module source, with its default timeout swapped so the test
    // finishes in milliseconds. Everything else is byte-identical.
    const src = read('code-issuer.js').split('opts.timeoutMs || 8000').join('opts.timeoutMs || ' + timeoutMs);   // both defaults: the issuer's and readWithTimeout's
    assert.notEqual(src, read('code-issuer.js'), 'the default constant was found and swapped');
    return src;
}
function pageWithHungDb(page, opts) {
    const sb = loadHtmlInlineScript(page, ['pwa-boot.js'], Object.assign({ search: '' }, opts || {}));
    vm.runInContext(issuerWith(80), sb);            // replaces window.issueUniqueCode with the short-timeout real module
    vm.runInContext(`
        window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); }; uiRefuse = alert; uiFail = alert; uiToast = alert;
        window.__navigated = null; try { Object.defineProperty(window.location, 'href', { set: function (v) { window.__navigated = v; }, get: function () { return 'x'; }, configurable: true }); } catch (e) {}
        db.ref = function (p) { return { once: function () { return new Promise(function () {}); }, set: function () { return Promise.resolve(); }, update: function () { return Promise.resolve(); } }; };
    `, sb);
    return sb;
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

describe('admin.html - the Game Day tile comes back, and says the round was not created', () => {
    test('createRoom: tile restored (label, aria-disabled, pointer-events) and one alert, within the timeout', { timeout: 3000 }, async () => {
        const sb = pageWithHungDb('admin.html');
        vm.runInContext(`
            // built from elements: mini-dom does not parse innerHTML
            var el = document.createElement('div'); el.id = 'hw-quick';
            var nm = document.createElement('div'); nm.className = 'hw-name'; nm.textContent = 'Game Day'; el.appendChild(nm);
            var desc = document.createElement('div'); desc.className = 'hw-desc'; desc.innerHTML = 'Playing today?'; el.appendChild(desc);
            document.__mount(el); window.__el = el; window.__desc = desc;
            createRoom(el);
            window.__pending = el.getAttribute('aria-disabled') + '|' + desc.textContent;
        `, sb);
        assert.equal(sb.window.__pending, 'true|⏳ Starting...', 'pending state while waiting');
        await wait(250);
        const el = sb.window.__el;
        assert.equal(el.getAttribute('aria-disabled'), null, 'aria-disabled cleared');
        assert.equal(el.style.pointerEvents, '', 'pointer-events cleared');
        assert.equal(sb.window.__desc.innerHTML, 'Playing today?', 'the original label is back');
        assert.equal(sb.window.__navigated, null, 'no navigation happened');
        assert.equal(sb.window.__alerts.length, 1, 'one alert: ' + JSON.stringify(sb.window.__alerts));
        assert.match(sb.window.__alerts[0], /not created|wasn.t created|was not started|not started/i);
        assert.match(sb.window.__alerts[0], /try again/i);
        assert.ok(!/signal|network|offline|internet/i.test(sb.window.__alerts[0]), 'the copy must not blame the network: ' + sb.window.__alerts[0]);
    });
    test('startFromPreviousRound: the SOURCE read hangs (the issuer would answer) - restored, alerted, no navigation', { timeout: 3000 }, async () => {
        // RESHAPED 2026-09-14. The first version stubbed the source read to
        // RESOLVE and hung only the issuer's read, so it proved the second read's
        // timeout and never saw the first read's absence of one - and the offline
        // probe found the button dead on "⏳ Checking…" forever. Now the source
        // read is the one that hangs; the code check would answer at once.
        const sb = pageWithHungDb('admin.html');
        vm.runInContext(`
            db.ref = function (p) { return { once: function () { return /^events\\/SRC/.test(p) ? new Promise(function () {}) : Promise.resolve({ exists: function () { return false; } }); } }; };
            var inp = document.createElement('input'); inp.id = 'copy-code-input'; inp.value = 'SRC001'; document.__mount(inp);
            var btn = document.createElement('button'); btn.id = 'copy-code-btn'; btn.innerHTML = 'Start'; document.__mount(btn); window.__btn = btn;
            startFromPreviousRound(btn);
            window.__pending = btn.getAttribute('aria-disabled');
        `, sb);
        assert.equal(sb.window.__pending, 'true', 'pending while the source is read');
        await wait(300);
        const btn = sb.window.__btn;
        assert.equal(btn.getAttribute('aria-disabled'), null, 'restored');
        assert.equal(btn.innerHTML, 'Start', 'label restored');
        assert.equal(sb.window.__navigated, null);
        assert.equal(sb.window.__alerts.length, 1, JSON.stringify(sb.window.__alerts));
        assert.match(sb.window.__alerts[0], /not (created|started)/i);
        assert.ok(!/signal|network/i.test(sb.window.__alerts[0]));
    });
    test('startFromPreviousRound: the source read goes through readWithTimeout (source pin)', () => {
        const src = read('admin.html');
        const at = src.indexOf('async function startFromPreviousRound');
        const fn = src.slice(at, src.indexOf('\n    async function ', at + 30));
        assert.match(fn, /await readWithTimeout\(db\.ref\('events\/' \+ code\)\.once\('value'\)/);
        assert.ok(!/await db\.ref\(/.test(fn), 'no bare awaited read left on this path');
    });
    test('the exhausted-attempts path keeps its own wording (unchanged)', { timeout: 3000 }, async () => {
        const sb = pageWithHungDb('admin.html');
        vm.runInContext(`
            db.ref = function (p) { return { once: function () { return Promise.resolve({ exists: function () { return true; } }); } }; };
            var el = document.createElement('div'); el.id = 'hw-quick'; document.__mount(el);
            createRoom(el);
        `, sb);
        await wait(100);
        assert.equal(sb.window.__alerts.length, 1);
        assert.match(sb.window.__alerts[0], /Every code we tried was already in use/);
    });
    test('the copy is one shared reporter, and the timeout branch is distinguished by err.code, not by message text', () => {
        const src = read('admin.html');
        const at = src.indexOf('function reportCodeIssueFailure');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 30));
        assert.match(fn, /err\.code === 'timeout'/);
        assert.equal((src.match(/reportCodeIssueFailure\(err, 'round'\)/g) || []).length, 2, 'both callers report through it');
    });
});

describe('trip.html - the planner and the new-trip control come back', () => {
    test('new trip: control restored and the not-created alert', { timeout: 3000 }, async () => {
        const sb = pageWithHungDb('trip.html');
        vm.runInContext(`
            var inp = document.createElement('input'); inp.id = 'trip-name-input'; inp.value = 'Myrtle'; document.__mount(inp);
            var btn = document.createElement('button'); btn.innerHTML = 'Create Trip'; document.__mount(btn); window.__btn = btn;
            createTripBlank(btn);
        `, sb);
        await wait(250);
        assert.equal(sb.window.__btn.getAttribute('aria-disabled'), null);
        assert.equal(sb.window.__btn.innerHTML, 'Create Trip');
        assert.equal(sb.window.__alerts.length, 1);
        assert.match(sb.window.__alerts[0], /not created/i); assert.match(sb.window.__alerts[0], /try again/i);
        assert.ok(!/signal|network/i.test(sb.window.__alerts[0]));
    });
    test('the planner: build button restored (label and disabled) and the not-created alert', { timeout: 3000 }, async () => {
        const sb = pageWithHungDb('trip.html');
        vm.runInContext(`
            // global_courses answers (the planner reads it first); every code check hangs
            db.ref = function (p) { return { once: function () { return p === 'global_courses' ? Promise.resolve({ val: function () { return {}; } }) : new Promise(function () {}); }, update: function () { return Promise.resolve(); } }; };
            var name = document.createElement('input'); name.id = 'trip-name-input'; name.value = 'Bandon'; document.__mount(name);
            var btn = document.createElement('button'); btn.id = 'build-trip-btn'; btn.innerText = 'Build Trip'; document.__mount(btn); window.__btn = btn;
            window.__planner = typeof buildTrip === 'function' ? 'buildTrip' : null;
            // one planned day with a course chosen (mini-dom resolves the ids; the values are set here)
            roundConfigs = [{ label: 'Day 1' }];
            document.getElementById('round-course-0').value = 'tidewater';
            document.getElementById('round-players-0').value = '4';
        `, sb);
        const fnName = sb.window.__planner;
        assert.ok(fnName, 'the planner build function exists');
        vm.runInContext(fnName + '(); window.__pending = document.getElementById("build-trip-btn").disabled;', sb);
        assert.ok(!sb.window.__alerts.some(a => /Pick a course|at least one|Give your trip/i.test(a)), 'validation passed: ' + JSON.stringify(sb.window.__alerts));
        await wait(300);
        const btn = sb.window.__btn;
        assert.equal(btn.disabled, false, 'build button re-enabled');
        assert.equal(btn.innerText, 'Build Trip', 'label restored');
        assert.equal(sb.window.__alerts.length, 1, JSON.stringify(sb.window.__alerts));
        assert.match(sb.window.__alerts[0], /not created/i); assert.match(sb.window.__alerts[0], /try again/i);
        assert.ok(!/signal|network/i.test(sb.window.__alerts[0]));
    });
    test('trip.html reports a timeout by err.code, in both places, and never blames the network for it', () => {
        const src = read('trip.html');
        assert.equal((src.match(/err\.code === 'timeout'/g) || []).length, 2, 'the planner catch and the new-trip catch');
        const decoded = decodeEscapes(src);
        const timeoutCopy = [...decoded.matchAll(/timeout'[\s\S]{0,300}?(['"`])([^'"`]*not created[^'"`]*)\1/gi)].map(m => m[2]);
        assert.ok(timeoutCopy.length >= 2, 'not-created copy near each timeout branch: ' + JSON.stringify(timeoutCopy));
        timeoutCopy.forEach(c => assert.ok(!/signal|network/i.test(c), c));
    });
});

describe('tournament.html - saveTournament gets a pending state and a restore it never had', () => {
    test('the save button is disabled while issuing and restored on timeout, with the not-created alert', { timeout: 3000 }, async () => {
        const sb = pageWithHungDb('tournament.html');
        vm.runInContext(`
            authUser = { uid: 'u1', email: 'o@x' };
            selectedCourseData = [{ hole: 1, par: 4, hcpIndex: 1 }];
            var n = document.createElement('input'); n.id = 't-name'; n.value = 'Cup'; document.__mount(n);
            var btn = document.createElement('button'); btn.id = 'save-tournament-btn'; btn.innerHTML = '💾 Save'; document.__mount(btn); window.__btn = btn;
            // one team card with one named golfer, built from elements (mini-dom parses no innerHTML)
            var list = document.createElement('div'); list.id = 'teams-list'; document.__mount(list);
            var card = document.createElement('div'); card.className = 'team-card'; list.appendChild(card);
            var inputs = document.createElement('div'); inputs.className = 'team-name-inputs'; card.appendChild(inputs);
            var pi = document.createElement('input'); pi.value = 'Ann Alpha'; inputs.appendChild(pi);
            window.__err = null;
            try { saveTournament(btn).catch(function (e) { window.__err = String(e && e.stack || e); }); } catch (e) { window.__err = String(e && e.stack || e); }
            window.__pending = btn.getAttribute('aria-disabled');
        `, sb);
        await wait(300);
        const btn = sb.window.__btn;
        const earlyRefusal = sb.window.__alerts.find(a => /Add at least one|select a golf course|Sign in/i.test(a));
        assert.ok(!earlyRefusal, 'the form validation should have passed in this harness: ' + earlyRefusal + ' err=' + sb.window.__err);
        assert.equal(sb.window.__pending, 'true', 'pending while issuing');
        assert.equal(btn.getAttribute('aria-disabled'), null, 'restored');
        assert.equal(btn.innerHTML, '💾 Save');
        assert.ok(sb.window.__alerts.some(a => /not created/i.test(a) && /try again/i.test(a)), JSON.stringify(sb.window.__alerts) + ' err=' + sb.window.__err);
        assert.ok(!sb.window.__alerts.some(a => /signal|network/i.test(a)));
    });
    test('the markup hands the button to saveTournament, and the catch distinguishes the timeout by code', () => {
        const src = read('tournament.html');
        assert.match(src, /onclick="saveTournament\(this\)"/);
        assert.match(src, /err\.code === 'timeout'/);
    });
});

// The arrival read is issued at PARSE time, so the hung db and the short-timeout
// issuer have to be in place before the page script runs: beforeRun does that.
function arrivalWithHungDb(search) {
    return loadHtmlInlineScript('admin.html', [], { search, beforeRun: (sandbox) => {
        vm.runInContext(issuerWith(80), sandbox);
        vm.runInContext("window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); }; uiRefuse = alert; uiFail = alert; uiToast = alert;", sandbox);
        sandbox.db.ref = () => ({ once: () => new Promise(() => {}), on: () => {}, set: () => Promise.resolve(), update: () => Promise.resolve() });
    } });
}
describe('admin.html - the wizard ARRIVAL read is timed too', () => {
    test('a copy whose source never answers: ROUND NOT COPIED, once; nothing saved', { timeout: 3000 }, async () => {
        const sb = arrivalWithHungDb('?game=NEW001&copyFrom=SRC001');
        await wait(300);
        assert.equal(sb.window.__alerts.length, 1, JSON.stringify(sb.window.__alerts));
        assert.match(sb.window.__alerts[0], /NOT COPIED/); assert.match(sb.window.__alerts[0], /SRC001/); assert.match(sb.window.__alerts[0], /try again/i);
        assert.ok(!/signal|network/i.test(sb.window.__alerts[0]));
    });
    test('a plain arrival on a code that never answers: no alert (a new round looks the same), the wizard stays', { timeout: 3000 }, async () => {
        const sb = arrivalWithHungDb('?game=NEW001');
        await wait(300);
        assert.equal(sb.window.__alerts.length, 0, JSON.stringify(sb.window.__alerts));
        assert.equal(sb.document.getElementById('admin-screen').style.display, 'block');
    });
    test('loadModeData and the arrival read both go through readWithTimeout (source pin)', () => {
        const src = read('admin.html');
        const lm = src.slice(src.indexOf('function loadModeData('), src.indexOf('\n    function ', src.indexOf('function loadModeData(') + 30));
        assert.match(lm, /return readWithTimeout\(db\.ref\(`events\/\$\{modeKey\}`\)\.once\('value'\)/);
        const arrival = src.slice(src.indexOf('// THE ONE LOADER ON ARRIVAL'), src.indexOf('</script>', src.indexOf('// THE ONE LOADER ON ARRIVAL')));
        assert.match(arrival, /readWithTimeout\(db\.ref\(`events\/\$\{currentMode\}`\)\.once\('value'\)/);
        assert.match(arrival, /\.catch\(\(err\) => \{/);
    });
});

describe('trip.html - the planner\'s COURSE read is timed (it sits ahead of every code it issues)', () => {
    test('global_courses never answers: build button restored and TRIP NOT CREATED, once', { timeout: 3000 }, async () => {
        const sb = pageWithHungDb('trip.html');
        vm.runInContext(`
            // every read hangs, the course read included
            var name = document.createElement('input'); name.id = 'trip-name-input'; name.value = 'Bandon'; document.__mount(name);
            var btn = document.createElement('button'); btn.id = 'build-trip-btn'; btn.innerText = 'Build Trip'; document.__mount(btn); window.__btn = btn;
            roundConfigs = [{ label: 'Day 1' }];
            document.getElementById('round-course-0').value = 'tidewater';
            document.getElementById('round-players-0').value = '4';
            buildTrip(); window.__pending = document.getElementById('build-trip-btn').disabled;
        `, sb);
        assert.equal(sb.window.__pending, true);
        await wait(300);
        assert.equal(sb.window.__btn.disabled, false); assert.equal(sb.window.__btn.innerText, 'Build Trip');
        assert.equal(sb.window.__alerts.length, 1, JSON.stringify(sb.window.__alerts));
        assert.match(sb.window.__alerts[0], /TRIP NOT CREATED/);
    });
    test('the planner reads the course list through readWithTimeout (source pin)', () => {
        const src = read('trip.html');
        const fn = src.slice(src.indexOf('function buildTrip()'), src.indexOf('\n    function ', src.indexOf('function buildTrip()') + 30));
        assert.match(fn, /readWithTimeout\(db\.ref\('global_courses'\)\.once\('value'\)/);
        assert.ok(!/\bdb\.ref\('global_courses'\)\.once\('value'\)\.then/.test(fn), 'no bare course read left');
    });
});

// ---- PROBE-SHAPED ----------------------------------------------------------
// The offline probe found what the first tests missed because a test can stub
// the read that hangs into answering. These rows stub NOTHING selectively:
// every db read hangs, the page's own handler is invoked the way its control
// invokes it, and the assertion is the probe's - after the timeout budget the
// control is NOT pending and one alert has been shown. A future read added to
// any of these paths without the race turns its row red.
describe('PROBE-SHAPED: every read hangs; after the budget, no control is still pending', () => {
    const PATHS = [
        { page: 'admin.html', label: 'Game Day tile', setup: `var el = document.createElement('div'); el.id = 'hw-quick'; var d = document.createElement('div'); d.className = 'hw-desc'; d.innerHTML = 'Playing today?'; el.appendChild(d); document.__mount(el); window.__ctl = el; createRoom(el);`,
          pending: (el) => el.getAttribute('aria-disabled') === 'true' },
        { page: 'admin.html', label: 'Start from a previous round', setup: `var inp = document.createElement('input'); inp.id = 'copy-code-input'; inp.value = 'SRC001'; document.__mount(inp); var btn = document.createElement('button'); btn.id = 'copy-code-btn'; btn.innerHTML = 'Start'; document.__mount(btn); window.__ctl = btn; startFromPreviousRound(btn);`,
          pending: (el) => el.getAttribute('aria-disabled') === 'true' },
        { page: 'trip.html', label: 'the trip planner', setup: `var name = document.createElement('input'); name.id = 'trip-name-input'; name.value = 'Bandon'; document.__mount(name); var btn = document.createElement('button'); btn.id = 'build-trip-btn'; btn.innerText = 'Build Trip'; document.__mount(btn); window.__ctl = btn; roundConfigs = [{ label: 'Day 1' }]; document.getElementById('round-course-0').value = 'tidewater'; document.getElementById('round-players-0').value = '4'; buildTrip();`,
          pending: (el) => el.disabled === true },
        { page: 'trip.html', label: 'an empty trip', setup: `var inp = document.createElement('input'); inp.id = 'trip-name-input'; inp.value = 'Myrtle'; document.__mount(inp); var btn = document.createElement('button'); btn.innerHTML = 'Create Trip'; document.__mount(btn); window.__ctl = btn; createTripBlank(btn);`,
          pending: (el) => el.getAttribute('aria-disabled') === 'true' },
        { page: 'tournament.html', label: 'Save Tournament', setup: `authUser = { uid: 'u1' }; selectedCourseData = [{ hole: 1, par: 4, hcpIndex: 1 }]; var n = document.createElement('input'); n.id = 't-name'; n.value = 'Cup'; document.__mount(n); var btn = document.createElement('button'); btn.innerHTML = 'Save'; document.__mount(btn); window.__ctl = btn; var list = document.createElement('div'); list.id = 'teams-list'; document.__mount(list); var card = document.createElement('div'); card.className = 'team-card'; list.appendChild(card); var inputs = document.createElement('div'); inputs.className = 'team-name-inputs'; card.appendChild(inputs); var pi = document.createElement('input'); pi.value = 'Ann'; inputs.appendChild(pi); saveTournament(btn);`,
          pending: (el) => el.getAttribute('aria-disabled') === 'true' },
    ];
    PATHS.forEach(P => {
        test(P.page + ' - ' + P.label + ': pending right after the tap, NOT pending after the budget, one alert', { timeout: 3000 }, async () => {
            const sb = pageWithHungDb(P.page);           // db.ref -> once() hangs, for every path
            vm.runInContext(P.setup, sb);
            assert.ok(P.pending(sb.window.__ctl), 'the control went pending');
            await wait(400);                             // budget: 80 ms timeout in the harness, x5
            assert.ok(!P.pending(sb.window.__ctl), 'STILL PENDING after the budget - a read on this path is not timed');
            assert.equal(sb.window.__alerts.length, 1, JSON.stringify(sb.window.__alerts));
            assert.match(sb.window.__alerts[0], /not created|not started/i);
        });
    });
});

describe('THE SEAM: navigator.onLine is not the decision anywhere on the create path', () => {
    test('code-issuer.js never reads navigator.onLine; the race is a timer', () => {
        const src = read('code-issuer.js').replace(/^\s*\/\/.*$/gm, '');   // comments explain the decision; code must not make it
        assert.ok(!/navigator\.onLine/.test(src));
        assert.match(src, /setTimeout\(/); assert.match(src, /code = 'timeout'/);
    });
    test('createRoom, startFromPreviousRound, the trip creators and saveTournament do not gate on navigator.onLine', () => {
        const fn = (f, name) => { const s = read(f); const at = s.indexOf('function ' + name + '('); assert.ok(at > 0, name); return s.slice(at, s.indexOf('\n    function ', at + 30)); };
        [['admin.html', 'createRoom'], ['admin.html', 'startFromPreviousRound'], ['trip.html', 'createTripBlank'], ['trip.html', 'buildTrip'], ['tournament.html', 'saveTournament']]
            .forEach(([f, n]) => assert.ok(!/navigator\.onLine/.test(fn(f, n)), n + ' must not decide on navigator.onLine'));
    });
});
