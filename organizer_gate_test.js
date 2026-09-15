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
// THE WALL. When the round write is refused AND the uid's own organizer node
// says the window closed with no pass live, the golfer reads a sentence, not
// an SDK error. Any other refusal keeps the page's own message, so the wall
// never explains a failure it did not cause. Inside the window nothing is
// shown - no banner, no countdown, no nag.
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
        window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); };
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
describe('THE WALL', () => {
    const NOW = Date.now();
    test('the round write refused and the uid\'s window closed 22 days on, no pass: the golfer reads the sentence, not the SDK error; nothing was written', async () => {
        const sb = wizard({ refuse: (p, op) => (p === 'events/GATE01' ? DENIED() : null), reads: { 'organizers/anon-stub': { firstSeenAt: NOW - 22 * DAY } } });
        await save(sb);
        assert.equal(sb.window.__alerts.length, 1, JSON.stringify(sb.window.__alerts));
        assert.equal(sb.window.__alerts[0], sb.window.organizerGate.WALL);
        assert.equal(sb.window.__btn.disabled, false);
    });
    test('THE COPY: says the trial ended, joining is free, one person per group pays, both prices, and that passes are not on sale in the app yet - and never a buy button', () => {
        const sb = wizard();
        const w = sb.window.organizerGate.WALL;
        assert.match(w, /free trial has ended/);
        assert.match(w, /Joining a round is free, always/);
        assert.match(w, /one person per group/);
        assert.match(w, /Season Pass \(\$29\.99 a year\)/); assert.match(w, /Trip Pass \(\$19\.99\)/);
        assert.match(w, /aren.t on sale in the app yet/);
        assert.match(w, /rounds you already set up still work/);
        assert.match(w, /This one was not saved/);
        assert.ok(!/buy|purchase|tap here|subscribe now|upgrade/i.test(w), 'no purchase flow is implied');
        assert.ok(!/StoreKit|App Store|receipt/i.test(read('organizer-gate.js').replace(/^\s*\/\/.*$/gm, '')), 'no purchase machinery in the gate');
    });
    test('refused INSIDE the window (some other rule): the honest SDK message, not the wall', async () => {
        const sb = wizard({ refuse: (p) => (p === 'events/GATE01' ? DENIED() : null), reads: { 'organizers/anon-stub': { firstSeenAt: NOW - 2 * DAY } } });
        await save(sb);
        assert.equal(sb.window.__alerts.length, 1); assert.match(sb.window.__alerts[0], /^Save error: PERMISSION_DENIED/);
    });
    test('refused with a LIVE pass: not the wall either', async () => {
        const sb = wizard({ refuse: (p) => (p === 'events/GATE01' ? DENIED() : null), reads: { 'organizers/anon-stub': { firstSeenAt: NOW - 60 * DAY, pass: { type: 'season', expiresAt: NOW + 100 * DAY } } } });
        await save(sb);
        assert.match(sb.window.__alerts[0], /^Save error/);
    });
    test('a lapsed pass with the window closed: the wall', async () => {
        const sb = wizard({ refuse: (p) => (p === 'events/GATE01' ? DENIED() : null), reads: { 'organizers/anon-stub': { firstSeenAt: NOW - 60 * DAY, pass: { type: 'trip', expiresAt: NOW - DAY } } } });
        await save(sb);
        assert.equal(sb.window.__alerts[0], sb.window.organizerGate.WALL);
    });
    test('a refusal that is not PERMISSION_DENIED keeps the SDK message', async () => {
        const sb = wizard({ refuse: (p) => (p === 'events/GATE01' ? new Error('disconnected') : null) });
        await save(sb);
        assert.match(sb.window.__alerts[0], /^Save error: disconnected/);
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
            window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); };
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
    test('the batch refused with the window closed: the wall, once; the button given back', async () => {
        const sb = planner({ refuse: (p, op, v) => (op === 'update' && Object.keys(v || {}).some(k => /^events\//.test(k)) ? DENIED() : null), reads: { 'organizers/anon-stub': { firstSeenAt: Date.now() - 30 * DAY } } });
        await build(sb);
        assert.equal(JSON.stringify(sb.window.__alerts), JSON.stringify([sb.window.organizerGate.WALL]));
        assert.equal(sb.window.__btn.disabled, false);
        assert.equal(sb.window.location.href, '', 'no navigation to a trip that was not made');
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAM (source, comments stripped)', () => {
    test('one builder, loaded by both create pages after auth-boot; the wizard and the planner both go through ensureOrganizer, stamp, and the wall', () => {
        ['admin.html', 'trip.html'].forEach(p => {
            const s = read(p);
            assert.match(s, /<script src="auth-boot\.js"><\/script>\s*<script src="organizer-gate\.js"><\/script>/, p + ' loads the gate right after auth-boot');
            const code = stripComments(s);
            assert.match(code, /window\.organizerGate\.ensureOrganizer\(db\)/, p);
            assert.match(code, /window\.organizerGate\.stamp\(/, p);
            assert.match(code, /window\.organizerGate\.isPermissionDenied\(err\)/, p);
            assert.match(code, /why === 'trial-ended' \? window\.organizerGate\.WALL/, p);
        });
        const a = stripComments(read('admin.html'));
        assert.match(a, /ensureOrganizer\(db\)\.then\(\(uid\) => \{\s*window\.organizerGate\.stamp\(payload, uid\);\s*return db\.ref\(`events\/\$\{currentMode\}`\)\.update\(payload\);/, 'the same update() as before, after the stamp');
        const t = stripComments(read('trip.html'));
        assert.match(t, /Object\.keys\(updates\)\.forEach\(\(k\) => \{ if \(\/\^events\\\/\[\^\/\]\+\$\/\.test\(k\)\) window\.organizerGate\.stamp\(updates\[k\], uid\); \}\);\s*return db\.ref\(\)\.update\(updates\);/, 'every events/<code> entry of the batch is stamped, then the one atomic update');
    });
    test('no page but those two loads or names the gate; no page shows a trial banner or countdown', () => {
        ['index.html', 'leaderboard.html', 'settlement.html', 'shared.html', 'sidematches.html', 'skins.html', 'stats.html', 'tournament.html', 'tournament-scorecard.html'].forEach(p => {
            assert.ok(!/organizer-gate/.test(read(p)), p + ' does not load the gate');
        });
        ['admin.html', 'trip.html', 'index.html'].forEach(p => assert.ok(!/trial ends in|days left in your trial|countdown/i.test(stripComments(read(p))), p + ' shows no trial banner'));
    });
    test('organizer-gate.js: the order is in the code, the second write is tolerated only as PERMISSION_DENIED, and the read-back decides the wall', () => {
        const g = stripComments(read('organizer-gate.js'));
        assert.match(g, /return ready\.then\(function \(uid\) \{[\s\S]*db\.ref\('organizers\/' \+ uid \+ '\/firstSeenAt'\)\.set\(sv\)/);
        assert.match(g, /if \(isPermissionDenied\(err\)\) return uid;/);
        assert.match(g, /TRIAL_MS = 21 \* 24 \* 60 \* 60 \* 1000/);
        assert.match(g, /now >= o\.firstSeenAt \+ TRIAL_MS \? 'trial-ended' : 'inside-window'/);
        assert.match(g, /if \(passLive\) return 'unknown';/);
    });
    test('the tournaments legacy-claim gap is recorded, not fixed (MONETIZATION.md)', () => {
        assert.match(read('MONETIZATION.md'), /The `tournaments` rule does not have this guard/);
    });
});
