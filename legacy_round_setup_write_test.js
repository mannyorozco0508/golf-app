// ============================================================================
// v203 — EDITING SETUP ON A LEGACY ROUND (no ownerUid) IS REFUSED (2026-09-23).
//
// THE DEFECT, found in the v203 rules rehearsal and live on production TODAY —
// it is not caused by any rules deploy:
//
//   events/$eventCode/ownerUid .validate has exactly two arms
//       (!data.parent().exists() && auth != null && newData.val() === auth.uid)
//       || (data.exists() && newData.val() === data.val())
//   "the round does not exist yet", and "ownerUid is already set and is not
//   changing". NEITHER covers "the round exists and has NO ownerUid", so
//   ownerUid can never be ADDED to a round that is already there.
//
//   And the wizard's save always sent it: organizer-gate.js's stamp() set
//   payload.ownerUid unconditionally, and admin.html deletes only
//   settlementMode and skinsRounding from the payload of an existing round.
//   So "Edit round setup" on any of the 96 legacy rounds in production was one
//   PERMISSION_DENIED, with nothing saved.
//
// WHY THE EXISTING RULES SUITE IS GREEN ON IT. wave2_rules_test.js does cover a
// legacy round - `'events/LEGACY1': { canWrite: [{ auth: 'nobody', data:
// played({...}) }] }` - but the record it writes has NO ownerUid in it, which
// is not what the page sends. The rule was tested with a payload the app never
// produces. This suite writes the payload the PAGE builds, which is why it can
// see what that one cannot.
//
// THE FIX. stamp() takes a third argument saying what the server already holds,
// and declines on exactly one shape: the round exists and carries no ownerUid.
// Creating still stamps (that is the rule's first arm). A round that already
// has one still stamps (its second arm - the value is unchanged). trip.html
// calls stamp with two arguments and is untouched: every round in its batch is
// a create.
//
// WHAT EACH HALF PROVES, AND WHAT NEITHER CAN
//   THE PAGE (mini-dom)  — what admin.html's own save chain puts on the wire
//     for a legacy round, an owned round and a brand-new code. mini-dom does
//     not parse the static onclick, so saveSettings() is called by name here;
//     THE BUTTON test pins that #main-save-btn is what calls it, and
//     tools/legacy-setup-write-check.js drives the real page in Chrome against
//     a real RTDB emulator with the real rules.
//   THE RULES (targaryen, the repo's own database.rules.json) — that the
//     payload captured above is actually accepted. Targaryen evaluates a SET of
//     the merged tree where RTDB evaluates a PATCH: newData at the round node
//     is identical either way, so the .write verdict is faithful, but a set
//     re-runs .validate on children a patch would leave alone. The emulator run
//     in tools/legacy-setup-write-check.js is the unmodelled check.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const GATE = read('organizer-gate.js');
const RULES = path.join(REPO_ROOT, 'database.rules.json');
const TARGARYEN = path.join(REPO_ROOT, 'node_modules', '.bin', 'targaryen');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'v203-legacy-'));
const J = (v) => JSON.parse(JSON.stringify(v));
const run = (sb, c) => vm.runInContext(c, sb);
const CD = makeCourseData(18);
const NOW = Date.now(), DAY = 86400000;

// A round as it sits in production: four golfers, nine holes posted.
//   owner null  = a LEGACY round. 96 of the 105 rounds in production.
//   token false = one of the 65 legacy rounds with no organizerToken either.
//   token true  = one of the 31 legacy rounds that carry a token. The wizard
//                 refuses those unless the organizer link is held, so the test
//                 arrives with ?organizer= exactly as that link does.
function record(owner, token) {
    const players = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [6, 9, 0, 12], 101);
    const scores = {};
    players.forEach((p) => { for (let h = 1; h <= 9; h++) scores['p' + p.id + '_h' + h] = 5; });
    const r = {
        eventName: 'Monday', roundDay: 'monday', gameFormat: 'stroke',
        activeCourseKey: 'comm_links', courseName: 'Test Links', courseData: CD,
        players, scores,
        groupSizeOverrides: { 0: 4 }, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar'
    };
    if (owner) r.ownerUid = owner;
    if (token) r.organizerToken = 'tok-legacy';
    return r;
}

// ---- THE PAGE ---------------------------------------------------------------
// The wizard's own arrival loader finds the record, the roster is rebuilt with
// the SAME ids (mini-dom parses no static input values), the handicap edit is
// applied, and the page's save chain runs. Returns the events/<code> write.
async function saveThrough(code, rec, edit, urlExtra) {
    const sb = loadHtmlInlineScript('admin.html', [], {
        search: '?game=' + code + (urlExtra || ''),
        beforeRun(sandbox) { sandbox.__dbReads = rec ? { ['events/' + code]: J(rec) } : {}; }
    });
    sb.crypto = require('crypto').webcrypto;
    run(sb, 'alert = function (m) { window.__alerts = (window.__alerts || []).concat([String(m)]); }; uiRefuse = function (m) { window.__alerts = (window.__alerts || []).concat([String(m)]); }; uiFail = function (m) { window.__alerts = (window.__alerts || []).concat([String(m)]); }; uiToast = function (m) { window.__alerts = (window.__alerts || []).concat([String(m)]); };');
    await new Promise((r) => setTimeout(r, 80));
    // THE DOOR HAS TO BE OPEN. admin.html hides the wizard and never calls
    // loadModeData for a session isRoundOrganizer refuses - and then
    // saveSettings() would build a payload out of empty fields. A test that
    // skipped this measured a screen no golfer can save from. (That is exactly
    // what this test did on its first run: a legacy round WITH an organizerToken
    // and no ?organizer= is refused, and the payload's eventName came back ''.)
    if (rec) {
        assert.equal(run(sb, 'loadedExistingRound'), true,
            'the wizard opened on this round - not the refusal screen. setup-refused-screen display: '
            + run(sb, "document.getElementById('setup-refused-screen').style.display"));
    }
    const players = (rec && rec.players) || makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [6, 9, 0, 12], 101);
    run(sb, 'document.__mount(document.getElementById("player-list"));');
    run(sb, 'document.getElementById("player-list").innerHTML = "";');
    players.forEach((p) => {
        const hcp = (edit && edit[p.id] !== undefined) ? String(edit[p.id]) : String(p.hcp);
        run(sb, `addPlayerRow(${JSON.stringify(p.name)}, ${JSON.stringify(hcp)}, "", "red", false, true, 4, true, ${p.id})`);
        run(sb, `(function () {
            var rows = document.querySelectorAll('.player-row'); var row = rows[rows.length - 1];
            var n = document.createElement('input'); n.className = 'p-name-input'; n.value = ${JSON.stringify(p.name)}; row.appendChild(n);
            var h = document.createElement('input'); h.className = 'p-hcp-input'; h.value = ${JSON.stringify(hcp)}; row.appendChild(h);
        })();`);
    });
    run(sb, 'globalCourses = ' + JSON.stringify({ comm_links: { name: 'Test Links', data: CD } }) + ';');
    run(sb, "courseHiddenSelect.value = 'comm_links'; courseSearchInput.value = 'Test Links';");
    run(sb, "document.getElementById('game-format-select').value = 'stroke';");
    run(sb, 'saveSettings();');
    await new Promise((r) => setTimeout(r, 60));
    const w = sb.__dbWrites.filter((x) => x.path === 'events/' + code);
    assert.equal(w.length, 1, 'exactly one write to the round: ' + JSON.stringify(sb.__dbWrites.map((x) => x.path + ' ' + x.op)) + ' alerts ' + run(sb, 'JSON.stringify(window.__alerts || [])'));
    return { payload: w[0].value, op: w[0].op, sb, writes: sb.__dbWrites.slice() };
}

describe('THE PAGE: what the wizard puts on the wire', () => {
    test('a LEGACY round with no organizer token (65 of production\'s 96): the payload carries NO ownerUid', async () => {
        const { payload, op } = await saveThrough('LEGACY1', record(null, false), { 104: 20 });
        assert.equal(op, 'update', 'the save is still one merge');
        // POSITIVE FIRST: the payload is a real setup save, not an empty object.
        // eventName is REBUILT from the round-day select, so it is the select's
        // value ('monday'), not whatever the stored record happened to hold.
        assert.equal(payload.eventName, 'monday');
        assert.equal(payload.players.length, 4, 'the roster is in the payload');
        assert.equal(String(payload.players.find((p) => p.id === 104).hcp), '20', "and Dee's new handicap");
        assert.ok(Array.isArray(payload.courseData) && payload.courseData.length === 18, 'and the card');
        // THE CLAIM.
        assert.ok(!('ownerUid' in payload), 'no ownerUid key on a legacy round: ' + JSON.stringify(payload.ownerUid));
    });

    test('a LEGACY round WITH a token (31 of them), opened through the organizer link: same answer', async () => {
        const { payload } = await saveThrough('LEGACY2', record(null, true), { 104: 20 }, '&organizer=tok-legacy');
        assert.equal(payload.eventName, 'monday', 'a real setup save');
        assert.equal(String(payload.players.find((p) => p.id === 104).hcp), '20', "and Dee's new handicap");
        assert.equal(payload.organizerToken, 'tok-legacy', 'the round keeps its token');
        assert.ok(!('ownerUid' in payload), 'the link opens the screens; it does not make the round owned');
    });

    test('an OWNED round: the payload still carries ownerUid, this session\'s uid', async () => {
        const { payload } = await saveThrough('OWNED1', record('anon-stub', true), { 104: 20 });
        assert.equal(payload.eventName, 'monday', 'a real setup save');
        assert.equal(String(payload.players.find((p) => p.id === 104).hcp), '20', "and Dee's new handicap");
        assert.equal(payload.ownerUid, 'anon-stub', 'still stamped on a round that already has one');
    });

    test('a BRAND-NEW code (no record): the payload carries ownerUid', async () => {
        const { payload, writes } = await saveThrough('NEW1', null);
        assert.equal(payload.players.length, 4, 'a real payload, with the roster in it');
        assert.equal(payload.ownerUid, 'anon-stub', 'creation still stamps - the rules require it');
        assert.ok(writes.some((x) => x.path === 'organizers/anon-stub/firstSeenAt'), 'and the trial clock is still written first');
    });

    test('THE BUTTON: #main-save-btn is what calls saveSettings, so the call above is the golfer\'s tap', () => {
        // mini-dom does not parse static attributes, so the tap cannot be
        // delivered here; this is the join between the button and the function.
        const m = ADMIN.match(/<button id="main-save-btn"[^>]*onclick="([^"]+)"/);
        assert.ok(m, 'the save button is still #main-save-btn with an inline onclick');
        assert.match(m[1], /saveSettings\(\)/);
    });
});

// ---- THE RULES --------------------------------------------------------------
// update() is a merge: the keys in the payload replace their counterparts, a
// null deletes, everything else stays. That merged tree is what RTDB evaluates.
function mergedSet(existing, payload) {
    const out = Object.assign({}, J(existing || {}));
    Object.keys(payload).forEach((k) => { if (payload[k] === null) delete out[k]; else out[k] = J(payload[k]); });
    return out;
}
const anon = (uid) => ({ uid, provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } });
const ESC = String.fromCharCode(27);
const strip = (s) => String(s).split(ESC).map((p, i) => i === 0 ? p : p.replace(/^\[[0-9;]*m/, '')).join('');
const BAR = String.fromCharCode(0x2502);
function targaryen(scenarioObj, rulesPath) {
    const file = path.join(TMP, 'sc-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(file, JSON.stringify(scenarioObj, null, 1));
    let out;
    try { out = strip(execFileSync(TARGARYEN, [rulesPath || RULES, file, '--verbose'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
    catch (e) { out = strip((e.stdout || '') + (e.stderr || '')); }
    const rows = out.split('\n').filter((l) => l.startsWith(BAR + ' events/') || l.startsWith(BAR + ' organizers/'))
        .map((l) => l.split(BAR).map((c) => c.trim()).filter(Boolean));
    return { out, rows, wrong: rows.filter((r) => r[3] !== r[4]) };
}

describe('THE RULES: the payload the page just built, against database.rules.json', () => {
    test('a LEGACY round accepts the page\'s payload, from any code-holder', async () => {
        const rec = record(null, false);
        const { payload } = await saveThrough('LEGACY1', rec, { 104: 20 });
        const r = targaryen({
            root: { events: { LEGACY1: rec }, organizers: { 'anon-stub': { firstSeenAt: NOW - 2 * DAY } } },
            users: { nobody: null, stub: anon('anon-stub'), stranger: anon('anon-stranger') },
            tests: {
                'events/LEGACY1': { canWrite: [
                    { auth: 'stub', data: mergedSet(rec, payload) },
                    { auth: 'nobody', data: mergedSet(rec, payload) },
                    { auth: 'stranger', data: mergedSet(rec, payload) }
                ] }
            }
        });
        assert.equal(r.rows.length, 3, r.out.slice(-800));
        assert.deepEqual(r.wrong, [], 'the page\'s own payload is refused on a legacy round:\n' + r.out.slice(-1400));
    });

    test('THE SHAPE OF THE DEFECT: the same payload WITH ownerUid added is refused on that legacy round', async () => {
        // This is what the page sent before this wave, and it is what the rule
        // has no arm for. It is refused for everyone, the organizer included.
        const rec = record(null, false);
        const { payload } = await saveThrough('LEGACY1', rec, { 104: 20 });
        const withOwner = Object.assign(mergedSet(rec, payload), { ownerUid: 'anon-stub' });
        const r = targaryen({
            root: { events: { LEGACY1: rec }, organizers: { 'anon-stub': { firstSeenAt: NOW - 2 * DAY } } },
            users: { nobody: null, stub: anon('anon-stub') },
            tests: { 'events/LEGACY1': { cannotWrite: [{ auth: 'stub', data: withOwner }, { auth: 'nobody', data: withOwner }] } }
        });
        assert.equal(r.rows.length, 2, r.out.slice(-800));
        assert.deepEqual(r.wrong, [], 'ownerUid can be added to an existing round after all:\n' + r.out.slice(-1400));
    });

    test('an OWNED round: the page\'s payload is the owner\'s alone', async () => {
        const rec = record('anon-stub', true);
        const { payload } = await saveThrough('OWNED1', rec, { 104: 20 });
        const merged = mergedSet(rec, payload);
        const r = targaryen({
            root: { events: { OWNED1: rec }, organizers: { 'anon-stub': { firstSeenAt: NOW - 2 * DAY } } },
            users: { nobody: null, stub: anon('anon-stub'), stranger: anon('anon-stranger') },
            tests: { 'events/OWNED1': {
                canWrite: [{ auth: 'stub', data: merged }],
                cannotWrite: [{ auth: 'nobody', data: merged }, { auth: 'stranger', data: merged }]
            } }
        });
        assert.equal(r.rows.length, 3, r.out.slice(-800));
        assert.deepEqual(r.wrong, [], r.out.slice(-1400));
    });

    test('a BRAND-NEW round: the page\'s payload creates it, and only for its own uid', async () => {
        const { payload } = await saveThrough('NEW1', null);
        const r = targaryen({
            root: { events: {}, organizers: { 'anon-stub': { firstSeenAt: NOW - 2 * DAY }, 'anon-stranger': { firstSeenAt: NOW - 2 * DAY } } },
            users: { nobody: null, stub: anon('anon-stub'), stranger: anon('anon-stranger') },
            tests: { 'events/NEW1': {
                canWrite: [{ auth: 'stub', data: payload }],
                cannotWrite: [{ auth: 'nobody', data: payload }, { auth: 'stranger', data: payload }]
            } }
        });
        assert.equal(r.rows.length, 3, r.out.slice(-800));
        assert.deepEqual(r.wrong, [], 'creation stopped working:\n' + r.out.slice(-1400));
    });
});

// ---- THE SEAM ---------------------------------------------------------------
describe('THE SEAM (source)', () => {
    test('stamp declines on exactly one shape: the round exists and carries no ownerUid', () => {
        const at = GATE.indexOf('function stamp(');
        assert.ok(at > 0, 'stamp is still in organizer-gate.js');
        const fn = GATE.slice(at, GATE.indexOf('\n    //', at));
        assert.match(fn, /payload\.ownerUid = uid/, 'it still stamps');
        assert.match(fn, /return payload/, 'and still returns the payload');
        assert.match(fn, /existing/, 'and reads the round the server already holds');
    });

    test('admin.html hands stamp what it loaded, and trip.html still stamps every round it creates', () => {
        // SLICED, never the whole file: a failed match on 341KB of admin.html
        // prints 341KB of admin.html.
        const at = ADMIN.indexOf('const saveChain = window.organizerGate.ensureOrganizer(db)');
        assert.ok(at > 0, 'the save chain is still there');
        const chain = ADMIN.slice(at, at + 400).replace(/\/\/[^\n]*/g, '');
        assert.match(chain, /window\.organizerGate\.stamp\(payload, uid, \{ exists: loadedExistingRound, ownerUid: loadedOwnerUid \}\)/,
            'the wizard passes the loaded round state: ' + JSON.stringify(chain.slice(0, 260)));
        assert.match(chain, /return db\.ref\(`events\/\$\{currentMode\}`\)\.update\(payload\)/, 'and the same one update()');
        // The copy-a-round loader must NOT set it: loadedExistingRound is
        // already guarded by isThisRound && snapshot.exists(), and loadedOwnerUid
        // has to sit inside the same guard or a copied round would inherit it.
        const gAt = ADMIN.indexOf('if (isThisRound && snapshot.exists())');
        assert.ok(gAt > 0, 'the isThisRound guard is still there');
        const guard = ADMIN.slice(gAt, ADMIN.indexOf('groupSizeOverrides = data.groupSizeOverrides', gAt));
        assert.ok(guard.length > 0 && guard.length < 1200, 'the guard slice is a guard, not the file: ' + guard.length);
        assert.match(guard, /loadedExistingRound = true/, 'the guard still sets loadedExistingRound');
        assert.match(guard, /loadedOwnerUid = data\.ownerUid \|\| null/, 'and loadedOwnerUid is inside that same guard: ' + JSON.stringify(guard));
        const tAt = read('trip.html').indexOf("Object.keys(updates).forEach((k) => { if (/^events");
        assert.ok(tAt > 0, 'the planner still stamps every round of its batch');
        assert.match(read('trip.html').slice(tAt, tAt + 200), /window\.organizerGate\.stamp\(updates\[k\], uid\)/, 'with two arguments - every round in its batch is a create');
    });
});
