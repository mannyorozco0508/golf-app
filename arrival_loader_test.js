// ============================================================================
// ONE LOADER ON ARRIVAL - the roster is correct in EVERY ordering of the reads
//
// THE BUG (recon, 2026-09-13): admin.html called loadModeData(currentMode) at
// parse time AND from the arrival block, which for a copy also called
// loadModeData(copyFromCode). Each load ends by wiping #player-list and
// rebuilding it, so whichever read resolved last owned the roster: a copy whose
// events/NEW read landed last lost its golfers to one blank row under the
// copied-from banner; a fresh code opened Step 5 with two blank rows.
//
// THE DEFECT IN THE OLD TEST. copy_from_lobby_test.js passed because the
// harness stub's once() is Promise.resolve(): the reads always resolved in the
// order they were issued, so the copy's rebuild always landed last. That fixed
// an order the product never guaranteed. Every arrival test here runs against
// a stub whose reads are DELAYED per path and per call, so the losing order is
// driven, not assumed.
//
// THE FIX: the parse-time load is gone; the arrival block is the one loader
// (edit -> the round, copy -> the source, fresh -> the code's own empty record,
// which sets the defaults and adds ONE blank row). loadModeData restores the
// settings inside a try, rebuilds the roster LAST regardless, and reports a
// failure with its message instead of leaving a silent rejection.
//
// HARNESS. Rows are mini-dom elements built by addPlayerRow (readable count,
// ids, flight controls); names live in the rows' innerHTML, so they are read
// by regex from the markup the page wrote.
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
const ADMIN = read('admin.html');
const CD = makeCourseData(18);
const NAMES = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay'];
const PLAYERS = makePlayers(NAMES, [2, 9, 15, 4, 20, 7], 101, ['A', 'B', 'A', 'B', 'A', 'B']);
const SOURCE = { eventName: 'Thu', gameFormat: 'stroke', activeCourseKey: 'comm_links', courseName: 'Test Links', players: J(PLAYERS), courseData: CD,
    scores: { p101_h1: 4 }, flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } }, groupSizeOverrides: { 0: 3, 1: 3 },
    moneyPool: { enabled: true, buyIn: 20, kp: { amount: 0, holes: [] }, net: { amount: 60, places: [100] }, skins: { mode: 'remainder', scoring: 'gross', carryOver: false } } };

// THE STUB THAT CAN DELAY AND REORDER. delays: { 'events/CODE': [ms for the 1st
// read, ms for the 2nd, ...] } - a read not listed resolves on the next tick.
// Every read is logged with its resolution order so a test can assert which
// landed last.
function arrive(search, records, delays, rejectNth) {
    const seen = {}; const log = { reads: [], landed: [] };
    const sb = loadHtmlInlineScript('admin.html', [], { search, beforeRun: (sandbox) => {
        // Installed BEFORE the page parses, so the arrival reads go through it.
        const orig = sandbox.db.ref.bind(sandbox.db);
        sandbox.db.ref = (p) => {
            const r = orig(p);
            const m = /^events\/([A-Z0-9]+)$/.exec(p);
            r.once = () => {
                seen[p] = (seen[p] || 0) + 1;
                const n = seen[p];
                const ms = (delays && delays[p] && delays[p][n - 1]) || 0;
                log.reads.push(p + '#' + n + (ms ? ' (+' + ms + 'ms)' : ''));
                if (rejectNth && rejectNth.path === p && rejectNth.n === n) return Promise.reject(new Error(rejectNth.message));
                const rec = m && Object.prototype.hasOwnProperty.call(records, m[1]) ? records[m[1]] : null;
                return new Promise(res => setTimeout(() => {
                    log.landed.push(p + '#' + n);
                    res({ val: () => (rec ? J(rec) : null), exists: () => rec != null });
                }, ms));
            };
            return r;
        };
        sandbox.crypto = require('crypto').webcrypto;
    } });
    run(sb, 'alert = function (m) { window.__alerts.push(String(m)); }; window.__alerts = window.__alerts || [];');
    run(sb, 'globalCourses = ' + JSON.stringify({ comm_links: { name: 'Test Links', data: CD } }) + ';');
    run(sb, 'document.__mount(document.getElementById("player-list"));');
    sb.__log = log;
    return sb;
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const rows = (sb) => J(run(sb, `document.querySelectorAll('.player-row').map(function (r) {
    var m = /class="p-name-input"[^>]*value="([^"]*)"/.exec(r.innerHTML); var f = r.querySelector('.p-flight-input');
    return [m ? m[1] : null, f ? f.getAttribute('data-flight') : null]; })`));
const state = (sb) => ({ rows: rows(sb), ids: J(run(sb, 'captureCurrentPlayerInputs().map(function (p) { return p.id; })')),
    banner: run(sb, "document.getElementById('copy-from-banner').style.display"), flightsOn: run(sb, "document.getElementById('flights-enabled').value"),
    // organizers/<uid> is read once at load for the standing line (2026-09-20,
    // organizer_standing_test.js); not a round read, so not part of the race.
    stored: run(sb, 'storedPlayersTemp.length'), reads: sb.__log.reads.filter(r => !/^organizers\//.test(r)), landed: sb.__log.landed.filter(r => !/^organizers\//.test(r)), alerts: J(run(sb, 'window.__alerts')) });
const EXPECT_ROWS = NAMES.map((n, i) => [n, i % 2 ? 'B' : 'A']);

describe('A COPY, in every ordering of the reads', () => {
    const orderings = [
        ['stub order (NEW then OLD, no delay)', {}],
        ['the NEW read slow (200 ms), the source read fast', { 'events/NEWC': [200] }],
        ['the source read slow (200 ms), the NEW read fast', { 'events/OLDC': [200] }],
        ['both slow, NEW slower', { 'events/NEWC': [300], 'events/OLDC': [100] }],
        ['both slow, source slower', { 'events/NEWC': [100], 'events/OLDC': [300] }]
    ];
    orderings.forEach(([label, delays]) => {
        test(label + ': six golfers with tags, banner up, flights on, one NEW read only', async () => {
            const sb = arrive('?game=NEWC&copyFrom=OLDC', { OLDC: SOURCE }, delays);
            await wait(700);
            const st = state(sb);
            assert.deepEqual(st.rows, EXPECT_ROWS, JSON.stringify(st));
            assert.deepEqual(st.ids, [101, 102, 103, 104, 105, 106]);
            assert.equal(st.banner, 'block'); assert.equal(st.flightsOn, 'true'); assert.equal(st.stored, 6);
            assert.deepEqual(st.reads.filter(r => r.startsWith('events/NEWC')).length, 1, 'events/NEWC is read ONCE: ' + JSON.stringify(st.reads));
            assert.deepEqual(st.alerts, []);
        });
    });
    test('the source read lands LAST in every ordering, because it is issued from inside the NEW read - there is nothing left to race it', async () => {
        const sb = arrive('?game=NEWC&copyFrom=OLDC', { OLDC: SOURCE }, { 'events/NEWC': [300] });
        await wait(700);
        const st = state(sb);
        assert.deepEqual(st.landed, ['events/NEWC#1', 'events/OLDC#1']);
    });
});

describe('AN EDIT and a FRESH CODE, delayed', () => {
    test('edit, the round\'s read slow: six golfers, no banner, Review reached', async () => {
        const sb = arrive('?game=OLDC', { OLDC: SOURCE }, { 'events/OLDC': [250] });
        await wait(1200);
        const st = state(sb);
        assert.deepEqual(st.rows, EXPECT_ROWS);
        assert.notEqual(st.banner, 'block', 'no copied-from banner on an edit (the static display:none is not parsed by mini-dom, so "not block" is the honest read)');
        assert.equal(run(sb, 'loadedExistingRound'), true);
        assert.equal(st.reads.filter(r => r.startsWith('events/OLDC')).length, 2, 'the arrival read, then the load: ' + JSON.stringify(st.reads));
    });
    test('a fresh code opens Step 5 with ONE blank row - not two', async () => {
        const sb = arrive('?game=FRESH1', {}, { 'events/FRESH1': [150, 0] });
        await wait(500);
        const st = state(sb);
        assert.equal(st.rows.length, 1, JSON.stringify(st.rows));
        assert.equal(st.rows[0][0], '');
        assert.notEqual(st.banner, 'block'); assert.equal(st.flightsOn, 'false');
        assert.deepEqual(st.alerts, []);
    });
    test('a fresh code with the delay the other way round: still one row', async () => {
        const sb = arrive('?game=FRESH2', {}, { 'events/FRESH2': [0, 150] });
        await wait(500);
        assert.equal(state(sb).rows.length, 1);
    });
});

describe('A THROW MID-RESTORE surfaces, and the roster still arrives (rebuilt last)', () => {
    test('loadMoneyPool throwing during a copy: the golfers are on Step 5, and an alert names the round and the error', async () => {
        const sb = arrive('?game=NEWT&copyFrom=OLDT', { OLDT: SOURCE }, {});
        run(sb, "loadMoneyPool = function () { throw new Error('pool exploded'); };");
        await wait(300);
        const st = state(sb);
        // The names and ids arrive (the rebuild runs after the try); the flight tags
        // do NOT, because the flights restore sits after loadMoneyPool in the try -
        // which is exactly why the failure has to be said out loud.
        assert.deepEqual(st.rows.map(r => r[0]), NAMES, 'the golfers are rebuilt even though the restore failed');
        assert.deepEqual(st.ids, [101, 102, 103, 104, 105, 106]);
        assert.notEqual(st.flightsOn, 'true', 'the flights restore was never reached (the hidden input keeps its unparsed markup value)');
        assert.equal(st.alerts.length, 1, JSON.stringify(st.alerts));
        assert.match(st.alerts[0], /OLDT/); assert.match(st.alerts[0], /pool exploded/); assert.match(st.alerts[0], /Check every step/);
    });
    test('the read itself failing (a rejected once) is reported too', async () => {
        // The arrival read succeeds; the LOAD's read (the second) rejects.
        const sb = arrive('?game=OLDR', { OLDR: SOURCE }, {}, { path: 'events/OLDR', n: 2, message: 'offline' });
        await wait(300);
        const st = state(sb);
        assert.equal(st.alerts.length, 1, JSON.stringify(st.alerts));
        assert.match(st.alerts[0], /offline/);
    });
});

describe('THE SEAM (source)', () => {
    test('exactly one call site loads the current round, and it is the arrival block; the parse-time call is gone', () => {
        const calls = ADMIN.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /^\s*loadModeData\(currentMode\);\s*$/.test(l));
        assert.equal(calls.length, 2, 'the arrival block\'s two branches (fresh, edit): ' + JSON.stringify(calls));
        const block = ADMIN.slice(ADMIN.indexOf('// THE ONE LOADER ON ARRIVAL.'), ADMIN.indexOf('setTimeout(() => goToWizardStep(wizardStepNumber(\'review\'))'));
        // Two STATEMENTS in the block (the comment above it names the old call too).
        assert.equal(block.split('\n').filter(l => /^\s*loadModeData\(currentMode\);\s*$/.test(l)).length, 2);
        assert.match(block, /loadModeData\(copyFromCode\)/);
        assert.ok(!/^\s*loadModeData\(currentMode\);\s*\n\s*\}\s*\n\s*function resumeGame/m.test(ADMIN), 'the parse-time load before resumeGame() is gone');
    });
    test('loadModeData: the restore is tried, the roster is rebuilt after the try, and both failure paths report', () => {
        const fn = ADMIN.slice(ADMIN.indexOf('function loadModeData('), ADMIN.indexOf('function reportRoundLoadFailure('));
        const iTry = fn.indexOf('try {'), iCatch = fn.indexOf('} catch (err) {\n                restoreFailure = err;'), iRoster = fn.indexOf('storedPlayersTemp = data.players'), iRebuild = fn.indexOf('handleFormatChange(true)'), iReport = fn.indexOf('if (restoreFailure) reportRoundLoadFailure(');
        assert.ok(iTry > 0 && iCatch > iTry && iRoster > iCatch && iRebuild > iRoster && iReport > iRebuild, [iTry, iCatch, iRoster, iRebuild, iReport].join(' < '));
        assert.match(fn, /\.catch\(err => \{[\s\S]*?reportRoundLoadFailure\(modeKey, err\)/);
        // RE-PINNED 2026-09-14: the read is wrapped in readWithTimeout (code-issuer.js)
        // so a load that never answers rejects instead of hanging; still returned.
        assert.match(fn, /return readWithTimeout\(db\.ref/, 'the promise is returned (through the shared timeout), so a caller can await the load');
    });
});
