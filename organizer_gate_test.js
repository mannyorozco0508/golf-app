// ============================================================================
// THE ORGANIZER PATH (Wave 3). organizer-gate.js, admin.html's Save, trip.html's
// planner batch, and the harness's refusal hook.
//
// THE ORDER THE RULES DICTATE (Wave 2, database.rules.json): a new round is
// refused unless the write carries a token, organizers/<uid>/firstSeenAt
// already exists (it is read from root while the round write is evaluated)
// and the round carries ownerUid = auth.uid. So Save, on every create path:
//   1. awaits window.authReady - a create fired before the token lands is
//      evaluated as auth == null and refused;
//   2. writes organizers/<uid>/firstSeenAt as ServerValue.TIMESTAMP - write-
//      once by rule; the second press is refused and that is EXPECTED;
//   3. writes the round, ownerUid stamped, with the SAME update() as before -
//      Wave 2 measured on the rehearsal that update() on a new code passes
//      the gate (RTDB evaluates the merged newData), so the shape is untouched.
// The trip planner's batch stamps EVERY round: the multi-path write is atomic.
//
// NO WALL (job 021, Manny 2026-10-17: games and bet tracking are free). The live
// rules have no 21-day window (console backup of 2026-10-17, checked with
// targaryen), so the old wall - "Your free trial has ended... $29.99... $19.99" -
// could only explain a refusal the server no longer makes. It is gone: every
// refused save says its own error, whatever the organizer record holds, and a
// day-22 organizer's save simply goes through. firstSeenAt is still written.
//
// THE CREATE PATHS (the inventory, measured by grep over every page and
// shared file for writes at events/<code>): TWO writes - admin.html's
// saveSettings (which the lobby tile, "start from a previous round" and a
// hand-typed ?game= all reach) and trip.html's planner batch. Every other
// events/ write on every page is a CHILD write into an existing round
// (scores, presses, KP, side matches, dots, verification, wolf calls, Ryder
// matches) and is participation. Grok's "four paths" are four journeys into
// those two writes.
//
// HOW. mini-dom (helpers/load-script.js): the page's own saveSettings /
// buildTrip run against the db stub, which records every write in order and
// refuses one when a test's sandbox.__dbRefuse says so; sandbox.__dbReads
// answers organizer-gate's read-back. The harness signs the page in as an
// anonymous user by default (auth-boot resolves authReady to it).
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');
const settle = () => new Promise(r => setTimeout(r, 30));
const DAY = 86400000;
const DENIED = () => Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' });

// admin.html at the wizard on a hand-typed code, a preset course chosen, ready to Save.
function wizard(opts) {
    const o = opts || {};
    const sb = loadHtmlInlineScript('admin.html', ['pwa-boot.js'], { search: '?game=GATE01' });
    vm.runInContext(`
        window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); }; uiRefuse = alert; uiFail = alert; uiToast = alert;
        window.crypto = { getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = (i * 37) & 255; return a; } };
        var key = Object.keys(coursePresets)[0];
        courseHiddenSelect.value = key; courseSearchInput.value = coursePresets[key].name;
        window.__btn = document.getElementById('main-save-btn'); window.__btn.innerText = '💾 Save & Start Round';
    `, sb);
    if (o.refuse) sb.__dbRefuse = o.refuse;
    if (o.reads) sb.__dbReads = o.reads;
    if (o.signedOut) sb.__auth.setUser(null);
    return sb;
}
const writes = sb => sb.__dbWrites.map(w => w.op + ' ' + w.path);
const roundWrite = sb => sb.__dbWrites.find(w => w.path === 'events/GATE01' && w.op === 'update');
async function save(sb) { vm.runInContext('saveSettings();', sb); for (let i = 0; i < 20; i++) await settle(); }

// ---------------------------------------------------------------------------
describe('THE ORDER: token, firstSeenAt, then the round with ownerUid', () => {
    test('a fresh organizer inside the window: firstSeenAt (ServerValue.TIMESTAMP) is written BEFORE the round; the round carries ownerUid = the uid; the write is the same update(); nothing is shown', async () => {
        const sb = wizard();
        await save(sb);
        const w = writes(sb);
        const fs = w.indexOf('set organizers/anon-stub/firstSeenAt'), rd = w.indexOf('update events/GATE01');
        assert.ok(fs >= 0 && rd >= 0, w.join(' | '));
        assert.ok(fs < rd, 'firstSeenAt first: ' + w.join(' | '));
        assert.equal(JSON.stringify(sb.__dbWrites[fs].value), JSON.stringify({ '.sv': 'timestamp' }), 'the server clock, not the phone\'s');
        assert.equal(roundWrite(sb).value.ownerUid, 'anon-stub');
        assert.ok(roundWrite(sb).value.players && roundWrite(sb).value.gameFormat, 'the rest of the payload is the payload');
        assert.equal(JSON.stringify(sb.window.__alerts), JSON.stringify([]), 'inside the window nothing is said');
    });
    test('a second press: firstSeenAt refused (write-once) is EXPECTED - the round is still written', async () => {
        const sb = wizard({ refuse: (p, op) => (p === 'organizers/anon-stub/firstSeenAt' ? DENIED() : null) });
        await save(sb);
        assert.ok(roundWrite(sb), 'the round was written: ' + writes(sb).join(' | '));
        assert.equal(roundWrite(sb).value.ownerUid, 'anon-stub');
        assert.equal(JSON.stringify(sb.window.__alerts), JSON.stringify([]));
    });
    test('the token race: with NO session (authReady rejects) the round is NOT written and the golfer is told the save did not happen', async () => {
        const sb = wizard({ signedOut: true });
        sb.firebase.auth().signInAnonymously = () => Promise.reject(Object.assign(new Error('network'), { code: 'auth/network-request-failed' }));
        await save(sb);
        assert.equal(roundWrite(sb), undefined, 'no round write without a token: ' + writes(sb).join(' | '));
        assert.ok(!writes(sb).some(w => /organizers\//.test(w)), 'no organizer write either');
        assert.equal(sb.window.__alerts.length, 1); assert.match(sb.window.__alerts[0], /Save error/);
        assert.equal(sb.window.__btn.disabled, false, 'the button is given back');
    });
});

// ---------------------------------------------------------------------------
describe('NO WALL (job 021): a refused save is its own error, on any record', () => {
    const NOW = Date.now();
    test('day 22, NOT refused (the live rules allow it): the round is written, firstSeenAt first, and nothing is shown', async () => {
        const sb = wizard({ reads: { 'organizers/anon-stub': { firstSeenAt: NOW - 22 * DAY } } });
        await save(sb);
        assert.ok(roundWrite(sb), 'the round was written: ' + writes(sb).join(' | '));
        assert.equal(roundWrite(sb).value.ownerUid, 'anon-stub');
        assert.equal(JSON.stringify(sb.window.__alerts), JSON.stringify([]));
    });
    [['day 22, no pass', { firstSeenAt: NOW - 22 * DAY }],
     ['inside the old window', { firstSeenAt: NOW - 2 * DAY }],
     ['a live pass', { firstSeenAt: NOW - 60 * DAY, pass: { type: 'season', expiresAt: NOW + 100 * DAY } }],
     ['a lapsed pass, window long closed', { firstSeenAt: NOW - 60 * DAY, pass: { type: 'trip', expiresAt: NOW - DAY } }]
    ].forEach(([label, record]) => {
        test('refused with ' + label + ': "Save error: PERMISSION_DENIED", once, and the button given back', async () => {
            const sb = wizard({ refuse: (p) => (p === 'events/GATE01' ? DENIED() : null), reads: { 'organizers/anon-stub': record } });
            await save(sb);
            assert.equal(sb.window.__alerts.length, 1, JSON.stringify(sb.window.__alerts));
            assert.match(sb.window.__alerts[0], /^Save error: PERMISSION_DENIED/);
            assert.equal(sb.window.__btn.disabled, false);
        });
    });
    test('a refusal that is not PERMISSION_DENIED keeps the SDK message', async () => {
        const sb = wizard({ refuse: (p) => (p === 'events/GATE01' ? new Error('disconnected') : null) });
        await save(sb);
        assert.match(sb.window.__alerts[0], /^Save error: disconnected/);
    });
    test('THE COPY IS GONE: no wall export, and no page or shared file names a price or a trial ending', () => {
        const sb = wizard();
        assert.equal(sb.window.organizerGate.WALL, undefined);
        assert.equal(sb.window.organizerGate.explainRefusal, undefined);
        ['organizer-gate.js', 'admin.html', 'trip.html', 'front-door.js', 'index.html'].forEach(f => {
            const code = stripComments(read(f));
            assert.ok(code.length > 1000, f + ' was read');
            assert.ok(!/\$29\.99|\$19\.99|free trial has ended|New rounds are paused/.test(code), f + ' still carries wall copy');
        });
    });
});

// ---------------------------------------------------------------------------
describe('THE TRIP PLANNER BATCH stamps every round', () => {
    // trip.html's planner, three days planned, the way code_issuer_timeout_test
    // reaches buildTrip(): the name input and the build button mounted, the
    // per-round selects given values, the issuer answered by the stub (a read of
    // events/<code> answers null = free), then the page's own buildTrip().
    function planner(opts) {
        const o = opts || {};
        const sb = loadHtmlInlineScript('trip.html', ['course-data.js', 'code-issuer.js']);
        vm.runInContext(`
            window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); }; uiRefuse = alert; uiFail = alert; uiToast = alert;
            // Distinct codes per issue (the planner reserves each one it mints).
            window.__seed = 0; window.crypto = { getRandomValues: function (a) { window.__seed++; for (var i = 0; i < a.length; i++) a[i] = (i * 37 + window.__seed * 53) & 255; return a; } };
            window.location = { href: '' };
            var name = document.createElement('input'); name.id = 'trip-name-input'; name.value = 'Rehearsal trip'; document.__mount(name);
            var btn = document.createElement('button'); btn.id = 'build-trip-btn'; btn.innerText = 'Build Trip'; document.__mount(btn); window.__btn = btn;
            roundConfigs = [{ label: 'Day 1' }, { label: 'Day 2' }, { label: 'Day 3' }];
            [0, 1, 2].forEach(function (i) { document.getElementById('round-course-' + i).value = 'tidewater'; document.getElementById('round-players-' + i).value = '4'; });
        `, sb);
        if (o.refuse) sb.__dbRefuse = o.refuse;
        if (o.reads) sb.__dbReads = o.reads;
        return sb;
    }
    async function build(sb) { vm.runInContext('buildTrip();', sb); for (let i = 0; i < 40; i++) await settle(); }
    const batchOf = sb => sb.__dbWrites.find(w => w.op === 'update' && w.value && typeof w.value === 'object' && Object.keys(w.value).some(k => /^trips\//.test(k)));
    test('three rounds in one atomic batch: each events/<code> entry carries ownerUid = the uid, the trip record does not, and firstSeenAt was written before the batch', async () => {
        const sb = planner();
        await build(sb);
        const w = writes(sb);
        const b = batchOf(sb);
        assert.ok(b, 'the batch was written: ' + w.join(' | '));
        const rounds = Object.keys(b.value).filter(k => /^events\/[^/]+$/.test(k));
        assert.equal(rounds.length, 3, Object.keys(b.value).join(','));
        rounds.forEach(k => assert.equal(b.value[k].ownerUid, 'anon-stub', k + ' is stamped'));
        rounds.forEach(k => assert.ok(b.value[k].players && b.value[k].players.length === 4 && b.value[k].courseData, k + ': the rest of the record is the record'));
        Object.keys(b.value).filter(k => /^trips\//.test(k)).forEach(k => assert.equal((b.value[k] || {}).ownerUid, undefined, k + ' - the trip record is not a round'));
        assert.ok(w.indexOf('set organizers/anon-stub/firstSeenAt') < sb.__dbWrites.indexOf(b), 'firstSeenAt first: ' + w.join(' | '));
        assert.equal(JSON.stringify(sb.window.__alerts), JSON.stringify([]));
    });
    test('the batch refused, organizer 30 days in: its own error once (no wall, job 021); the button given back', async () => {
        const sb = planner({ refuse: (p, op, v) => (op === 'update' && Object.keys(v || {}).some(k => /^events\//.test(k)) ? DENIED() : null), reads: { 'organizers/anon-stub': { firstSeenAt: Date.now() - 30 * DAY } } });
        await build(sb);
        assert.equal(sb.window.__alerts.length, 1, JSON.stringify(sb.window.__alerts));
        assert.match(sb.window.__alerts[0], /^Error building trip: PERMISSION_DENIED/);
        assert.equal(sb.window.__btn.disabled, false);
        assert.equal(sb.window.location.href, '', 'no navigation to a trip that was not made');
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAM (source, comments stripped)', () => {
    test('one builder, loaded by both create pages after auth-boot; the wizard and the planner both go through ensureOrganizer and stamp (the wall is gone, job 021)', () => {
        ['admin.html', 'trip.html'].forEach(p => {
            const s = read(p);
            assert.match(s, /<script src="auth-boot\.js"><\/script>\s*<script src="organizer-gate\.js"><\/script>/, p + ' loads the gate right after auth-boot');
            const code = stripComments(s);
            assert.match(code, /window\.organizerGate\.ensureOrganizer\(db\)/, p);
            assert.match(code, /window\.organizerGate\.stamp\(/, p);
            // job 021: the failure path no longer branches on PERMISSION_DENIED - there is no wall to choose.
            assert.match(code, p === 'admin.html' ? /uiFail\(`Save error: \$\{err\.message\}`\)/ : /uiFail\(`Error building trip: \$\{err\.message\}`\)/, p + ' says its own error');
            assert.ok(!/organizerGate\.WALL|explainRefusal|trial-ended/.test(code), p + ' still reaches for the wall');
        });
        const a = stripComments(read('admin.html'));
        // RE-PINNED v203 (2026-09-23): the wizard now tells stamp what the server
        // already holds for this round - { exists, ownerUid } - because stamping
        // ownerUid onto a round that EXISTS WITHOUT ONE is refused by the rules and
        // took the whole setup save down with it. The planner's call below is
        // deliberately still two arguments: every round in its batch is a create.
        assert.match(a, /ensureOrganizer\(db\)\.then\(\(uid\) => \{\s*window\.organizerGate\.stamp\(payload, uid, \{ exists: loadedExistingRound, ownerUid: loadedOwnerUid \}\);\s*return db\.ref\(`events\/\$\{currentMode\}`\)\.update\(payload\);/, 'the same update() as before, after the stamp');
        const t = stripComments(read('trip.html'));
        assert.match(t, /Object\.keys\(updates\)\.forEach\(\(k\) => \{ if \(\/\^events\\\/\[\^\/\]\+\$\/\.test\(k\)\) window\.organizerGate\.stamp\(updates\[k\], uid\); \}\);\s*return db\.ref\(\)\.update\(updates\);/, 'every events/<code> entry of the batch is stamped, then the one atomic update');
    });
    test('no page but those four loads or names the gate; no page shows a trial banner or countdown', () => {
        // RE-PINNED 2026-09-21 (v189): index.html and game.html load organizer-gate.js
        // for isRoundOrganizer (the organizer doors) - a pure predicate; neither page
        // calls ensureOrganizer or writes organizers/<uid>. organizer_door_test.js.
        ['leaderboard.html', 'settlement.html', 'shared.html', 'skins.html', 'stats.html', 'tournament.html', 'tournament-scorecard.html'].forEach(p => {
            assert.ok(!/organizer-gate/.test(read(p)), p + ' does not load the gate');
        });
        // sidematches.html JOINED THE PREDICATE-ONLY LIST (2026-10-08), and the
        // constraint this test actually protects is unchanged: a page may read
        // the predicate, never write the trial.
        //
        // WHY IT HAD TO. The Matches/Bets page decided organizer-ness from the
        // URL alone - `return !isMultiGroupRound` when there is no ?group= -
        // which was true before the gate existed and false after it: on a
        // multi-group round the bare link is exactly what a SPECTATOR holds, so
        // the real organizer got no controls at all. Manny, signed in as the
        // owner of a 24-golfer round, had none. It asks the same question
        // index.html asks now, through the same module, so the two screens
        // cannot disagree about who somebody is.
        ['index.html', 'game.html', 'sidematches.html'].forEach(p => {
            const src = stripComments(read(p));
            assert.ok(/organizer-gate\.js/.test(read(p)), p + ' loads the gate');
            assert.ok(!/ensureOrganizer|organizers\//.test(src), p + ' only reads the predicate - never the trial write');
        });
        ['admin.html', 'trip.html', 'index.html'].forEach(p => assert.ok(!/trial ends in|days left in your trial|countdown/i.test(stripComments(read(p))), p + ' shows no trial banner'));
    });
    test('organizer-gate.js: the order is in the code, the second write is tolerated only as PERMISSION_DENIED, and nothing decides a wall', () => {
        const g = stripComments(read('organizer-gate.js'));
        assert.match(g, /return ready\.then\(function \(uid\) \{[\s\S]*db\.ref\('organizers\/' \+ uid \+ '\/firstSeenAt'\)\.set\(sv\)/);
        assert.match(g, /if \(isPermissionDenied\(err\)\) return uid;/);
        assert.match(g, /TRIAL_MS = 21 \* 24 \* 60 \* 60 \* 1000/);
        // job 021: no read-back classifies a refusal any more.
        assert.ok(!/trial-ended|explainRefusal|var WALL/.test(g), 'a wall is back in the gate');
    });
    test('the tournaments legacy-claim gap is recorded, not fixed (MONETIZATION.md)', () => {
        assert.match(read('MONETIZATION.md'), /The `tournaments` rule does not have this guard/);
    });
});
