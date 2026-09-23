// ============================================================================
// ONLY THE ORGANIZER CAN REACH THE ROUND SETUP (2026-09-21, v189)
//
// WHO IS THE ORGANIZER. organizer-gate.js isRoundOrganizer(data, uid, token):
//   1. data.ownerUid === this session's anonymous uid (the browser that created
//      the round - per browser ORIGIN, so Safari, the home-screen app and the
//      App Store app on one phone are three organizers);
//   2. the organizer token is held - ?organizer=TOKEN on the URL, or remembered
//      on this device for this round (rememberOrganizerToken, written only when
//      a URL token MATCHED the round; the nav rewrite drops the param on the
//      first tab tap, so without the memory the organizer loses the setup);
//   3. a legacy round with neither field is open, as it always was.
// NOT "no ?group= in the link" (isOrganizerView), which a "Just watching"
// spectator satisfies. And never on a group link, whoever holds it.
//
// THE DOORS. index.html: "✏️ Edit round setup" in the group strip and the
// 🔗 Group Links panel (it prints the organizer link) - both on canReachSetup().
// game.html: "✏️ Edit round setup" under the title. admin.html?game=CODE on an
// EXISTING round: organizerDoor() awaits the uid, then either loadModeData or
// the refusal screen - "This round's setup belongs to its organizer." with a
// Back to the scorecard link. A NEW round (no players) never meets the door.
//
// HIDES THE DOORS, DOES NOT LOCK THEM. database.rules.json is untouched; any
// client holding the code can still write an existing round. HANDOFF.md says so.
//
// HARNESS. auth-boot.js signs the realm in as 'anon-stub' one tick after load
// (authBootState is pending at delivery, exactly as on a phone), so every
// scorecard case awaits the tick the page itself awaits. The "second device"
// is a round whose ownerUid is some other uid. Static markup is not in the
// mini-dom tree: the strip and the panel are read from innerHTML; admin's
// screens are read by style.display on elements the page touched.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const tick = (ms) => new Promise(r => setTimeout(r, ms || 30));
const P = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'].map((n, i) => ({ id: 101 + i, name: n, hcp: '9' }));
const round = (o) => Object.assign({ players: P, courseData: [], scores: {}, groupSizeOverrides: {} }, o || {});
const OWNER = round({ ownerUid: 'anon-stub', organizerToken: 'tok-1' });      // created on THIS device
const OTHER = round({ ownerUid: 'some-other-device', organizerToken: 'tok-1' }); // created elsewhere
const LEGACY = round({});                                                       // neither field
const TOKEN_ONLY = round({ organizerToken: 'tok-1' });                          // 2026-08-24 .. 09-14

// ---------------------------------------------------------------------------
describe('THE PREDICATE (organizer-gate.js isRoundOrganizer)', () => {
    // A real localStorage: loadJsFile's stub forgets everything, and a test about
    // WHEN a token is remembered cannot run against a store that forgets.
    const sb = loadJsFile('organizer-gate.js');
    const mem = new Map();
    sb.localStorage = { getItem: k => (mem.has(String(k)) ? mem.get(String(k)) : null), setItem: (k, v) => { mem.set(String(k), String(v)); }, removeItem: k => { mem.delete(String(k)); }, clear: () => { mem.clear(); } };
    const is = (d, uid, tok) => run(sb, 'window.organizerGate.isRoundOrganizer(' + JSON.stringify(d) + ', ' + JSON.stringify(uid) + ', ' + JSON.stringify(tok) + ')');
    test('the creating uid is the organizer; another uid is not', () => {
        assert.equal(is(OWNER, 'anon-stub', null), true);
        assert.equal(is(OTHER, 'anon-stub', null), false);
        assert.equal(is(OWNER, null, null), false, 'no session, no owner');
    });
    test('the organizer token gets in from any uid; a wrong token does not', () => {
        assert.equal(is(OTHER, 'anon-stub', 'tok-1'), true);
        assert.equal(is(OTHER, 'anon-stub', 'tok-2'), false);
        assert.equal(is(OTHER, null, 'tok-1'), true, 'a failed sign-in with the link still gets in');
    });
    test('legacy: neither field is open; a token without ownerUid admits only the link', () => {
        assert.equal(is(LEGACY, 'anon-stub', null), true);
        assert.equal(is(LEGACY, null, null), true);
        assert.equal(is(TOKEN_ONLY, 'anon-stub', null), false);
        assert.equal(is(TOKEN_ONLY, 'anon-stub', 'tok-1'), true);
        assert.equal(is(null, 'anon-stub', 'tok-1'), false); assert.equal(is({}, 'x', 'y'), true, 'an empty record has nothing to check against');
    });
    test('the memory: only a token that MATCHES the round is stored, per round, upper-cased code', () => {
        run(sb, 'localStorage.clear()');
        assert.equal(run(sb, "window.organizerGate.rememberOrganizerToken('door1', " + JSON.stringify(OTHER) + ", 'tok-9')"), false);
        assert.equal(run(sb, "localStorage.getItem('golfapp_organizer_DOOR1')"), null, 'a wrong token is not remembered');
        assert.equal(run(sb, "window.organizerGate.rememberOrganizerToken('door1', " + JSON.stringify(OTHER) + ", 'tok-1')"), true);
        assert.equal(run(sb, "localStorage.getItem('golfapp_organizer_DOOR1')"), 'tok-1');
        assert.equal(run(sb, "window.organizerGate.heldOrganizerToken('DOOR1', null)"), 'tok-1', 'read back with no URL param');
        assert.equal(run(sb, "window.organizerGate.heldOrganizerToken('DOOR1', 'url-wins')"), 'url-wins');
        assert.equal(run(sb, "window.organizerGate.heldOrganizerToken('DOOR2', null)"), null, 'per round');
        assert.equal(run(sb, "window.organizerGate.rememberOrganizerToken('door1', " + JSON.stringify(LEGACY) + ", 'tok-1')"), false, 'nothing to match against');
    });
});

// ---------------------------------------------------------------------------
async function scorecard(data, search, opts) {
    const sb = loadHtmlInlineScript('index.html', [], { search, localStorage: true });
    if (opts && opts.remembered) run(sb, "localStorage.setItem('golfapp_organizer_DOOR1', " + JSON.stringify(opts.remembered) + ")");
    if (opts && opts.dismissed) run(sb, "sessionStorage.setItem('groupPickDismissed:DOOR1', '1')");
    run(sb, "document.__mount(document.getElementById('group-filter-container')); document.__mount(document.getElementById('group-links-panel'));");
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/DOOR1');
    h.cb({ val: () => JSON.parse(JSON.stringify(data)), exists: () => true });
    await tick();
    return sb;
}
const strip = sb => String(run(sb, "document.getElementById('group-filter-container').innerHTML"));
const panel = sb => { run(sb, 'groupLinksPanelOpen = true; renderGroupLinksPanel();'); return String(run(sb, "document.getElementById('group-links-panel').innerHTML")); };
const SETUP = /<a class="group-btn group-setup-btn" href="admin\.html\?game=DOOR1">✏️ Edit round setup<\/a>/;

describe('THE SCORECARD (index.html): the button and the Group Links panel', () => {
    test("THE ORGANIZER'S DEVICE, bare link: the button and Group Links, both", async () => {
        const sb = await scorecard(OWNER, '?game=door1');
        assert.match(strip(sb), SETUP);
        assert.match(strip(sb), /toggleGroupLinksPanel\(\)/);
        assert.match(panel(sb), /organizer=tok-1/, 'the panel prints the organizer link');
        assert.equal(run(sb, 'canReachSetup()'), true);
    });
    test('the button waits for the uid: absent at delivery, present once auth-boot has signed in', async () => {
        const sb = loadHtmlInlineScript('index.html', [], { search: '?game=door1' });
        run(sb, "document.__mount(document.getElementById('group-filter-container')); document.__mount(document.getElementById('group-links-panel'));");
        const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/DOOR1');
        h.cb({ val: () => JSON.parse(JSON.stringify(OWNER)), exists: () => true });
        assert.equal(run(sb, 'window.authBootState.status'), 'pending');
        assert.doesNotMatch(strip(sb), SETUP, 'not yet - nobody is anybody before the uid lands');
        await tick();
        assert.match(strip(sb), SETUP, 'the page re-rendered itself on authReady');
    });
    test('A GROUP LINK: no button, no Group Links, no panel - even on the organizer\'s own device (CONTROL: the button on a group link)', async () => {
        const sb = await scorecard(OWNER, '?game=door1&group=1');
        assert.doesNotMatch(strip(sb), /Edit round setup|toggleGroupLinksPanel/);
        assert.equal(panel(sb), '');
        assert.equal(run(sb, 'canReachSetup()'), false);
    });
    test("ANOTHER GROUP'S LINK: the same nothing", async () => {
        const sb = await scorecard(OTHER, '?game=door1&group=2');
        assert.doesNotMatch(strip(sb), /Edit round setup|toggleGroupLinksPanel/);
        assert.equal(panel(sb), '');
    });
    test('"JUST WATCHING" (bare link, another device, picker dismissed): no button, no Group Links, no panel (CONTROL: the wizard door for a spectator)', async () => {
        const sb = await scorecard(OTHER, '?game=door1', { dismissed: true });
        assert.equal(run(sb, 'isOrganizerView()'), true, 'the OLD predicate says yes to a spectator - which is why it is not the gate');
        assert.equal(run(sb, 'canReachSetup()'), false);
        assert.doesNotMatch(strip(sb), /Edit round setup|toggleGroupLinksPanel/);
        assert.equal(panel(sb), '', 'the organizer link is not printed for a spectator');
        run(sb, 'toggleGroupLinksPanel()');
        assert.equal(String(run(sb, "document.getElementById('group-links-panel').innerHTML")), '', 'nor by calling the toggle');
    });
    test('THE ORGANIZER LINK on a second device: the button, and the token is remembered for this round', async () => {
        const sb = await scorecard(OTHER, '?game=door1&organizer=tok-1');
        assert.match(strip(sb), SETUP);
        assert.equal(run(sb, "localStorage.getItem('golfapp_organizer_DOOR1')"), 'tok-1');
        assert.doesNotMatch(strip(sb), /organizer=/, 'the setup link never prints the secret');
    });
    test('THE REMEMBERED TOKEN: a later bare-link visit on that device is still the organizer', async () => {
        const sb = await scorecard(OTHER, '?game=door1', { remembered: 'tok-1' });
        assert.match(strip(sb), SETUP);
    });
    test('a WRONG organizer link: no button, nothing remembered (CONTROL)', async () => {
        const sb = await scorecard(OTHER, '?game=door1&organizer=tok-9');
        assert.doesNotMatch(strip(sb), /Edit round setup/);
        assert.equal(run(sb, "localStorage.getItem('golfapp_organizer_DOOR1')"), null);
    });
    test('a legacy round (neither field) on any device: the button, as today', async () => {
        assert.match(strip(await scorecard(LEGACY, '?game=door1')), SETUP);
    });
    test('a foursome (one group): the button sits alone in the strip', async () => {
        const sb = await scorecard(round({ players: P.slice(0, 4), ownerUid: 'anon-stub' }), '?game=door1');
        assert.match(strip(sb), SETUP);
        assert.doesNotMatch(strip(sb), /Group 1|toggleGroupLinksPanel/);
    });
});

// ---------------------------------------------------------------------------
async function gameTab(data, search, opts) {
    const sb = loadHtmlInlineScript('game.html', [], { search, localStorage: true });
    if (opts && opts.remembered) run(sb, "localStorage.setItem('golfapp_organizer_DOOR1', " + JSON.stringify(opts.remembered) + ")");
    run(sb, "document.__mount(document.getElementById('game-content')); document.__mount(document.getElementById('game-setup-mount'));");
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/DOOR1');
    h.cb({ val: () => JSON.parse(JSON.stringify(data)), exists: () => true });
    await tick();
    return String(run(sb, "document.getElementById('game-setup-mount').innerHTML"));
}
// v195: the Players pill sits under it, to the scorecard with ?players=1.
// v200: and, on a round that carries an organizerToken, "Share organizer link" -
// the link that makes another device the organizer (organizer_link_share_test.js).
// OWNER and OTHER carry a token; LEGACY does not, so it gets the first two only.
const GAME_SETUP = /^<a class="game-setup-link" href="admin\.html\?game=DOOR1">✏️ Edit round setup<\/a><a class="game-setup-link" href="index\.html\?game=DOOR1&players=1">👥 Players<\/a>(<button type="button" class="game-setup-link" onclick="shareOrganizerLinkFromGame\(this\)">🔑 Share organizer link<\/button>)?$/;
describe('THE GAME TAB (game.html): the button under the title', () => {
    test("the organizer's device: the button", async () => { assert.match(await gameTab(OWNER, '?game=door1'), GAME_SETUP); });
    test('a group link: nothing, even for the owner (CONTROL)', async () => { assert.equal(await gameTab(OWNER, '?game=door1&group=1'), ''); });
    test('another device, bare link: nothing', async () => { assert.equal(await gameTab(OTHER, '?game=door1'), ''); });
    test('the organizer link, then the remembered token: the button both times', async () => {
        assert.match(await gameTab(OTHER, '?game=door1&organizer=tok-1'), GAME_SETUP);
        assert.match(await gameTab(OTHER, '?game=door1', { remembered: 'tok-1' }), GAME_SETUP);
    });
    test('a legacy round: the button; an empty round: nothing to edit yet', async () => {
        assert.match(await gameTab(LEGACY, '?game=door1'), GAME_SETUP);
        assert.equal(await gameTab({ players: [] }, '?game=door1'), '');
    });
});

// ---------------------------------------------------------------------------
// admin.html?game=CODE: the page's own arrival read is answered with the round,
// then organizerDoor awaits the uid. Screens are read by style.display.
async function wizardArrival(data, search, opts) {
    // The page's OWN arrival read is answered with the round: firebase.database is
    // wrapped before the page runs (db is a lexical const), so nothing is re-fired
    // by the test - the page decides on its own, the way it does on a phone.
    const sb = loadHtmlInlineScript('admin.html', [], { search, localStorage: true, beforeRun(sandbox) {
        if (opts && opts.remembered) sandbox.localStorage.setItem('golfapp_organizer_DOOR1', opts.remembered);
        const realDatabase = sandbox.firebase.database;
        sandbox.firebase.database = Object.assign(function () {
            const dbi = realDatabase();
            const origRef = dbi.ref.bind(dbi);
            dbi.ref = (p) => { const r = origRef(p); if (p === 'events/DOOR1') r.once = () => Promise.resolve({ val: () => JSON.parse(JSON.stringify(data)), exists: () => !!(data && data.players) }); return r; };
            return dbi;
        }, realDatabase);
    } });
    await tick(80);
    const disp = id => run(sb, "document.getElementById('" + id + "').style.display");
    return { sb, refused: disp('setup-refused-screen') === 'block', wizard: disp('admin-screen') === 'block', loaded: run(sb, 'loadedExistingRound') === true, back: run(sb, "document.getElementById('setup-refused-back').href") };
}
describe('THE WIZARD (admin.html?game=CODE) on an EXISTING round', () => {
    test("the organizer's device: the wizard, loaded", async () => {
        const r = await wizardArrival(OWNER, '?game=door1');
        assert.equal(r.refused, false); assert.equal(r.wizard, true); assert.equal(r.loaded, true, 'loadModeData ran and loaded the round');
    });
    test('another device, bare link: REFUSED - the sentence, the way back, the wizard never loaded (CONTROL: the wizard opening for a spectator)', async () => {
        const r = await wizardArrival(OTHER, '?game=door1');
        assert.equal(r.refused, true); assert.equal(r.wizard, false); assert.equal(r.loaded, false, 'loadModeData was not called');
        assert.equal(r.back, 'index.html?game=DOOR1');
    });
    test("a group link's Home pill (admin.html?game=CODE&group=2): the page's older redirect sends it to the scorecard before anything else runs (and the door's own way back would keep the group)", () => {
        // redirectGroupScorekeeper (admin.html, since the group-link leak fix) fires at
        // parse time on ?game&group: location.replace(index.html?game=...&group=...).
        // In the harness location.replace is a stub installed here; the page's
        // script stops at that call, which is exactly the point - nothing after it
        // (the wizard, the door) runs for a group link.
        const calls = [];
        const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=door1&group=2', beforeRun(sandbox) {
            sandbox.window.location = sandbox.location = { search: '?game=door1&group=2', origin: 'https://golf-app-5a5.pages.dev', pathname: '/admin.html', href: 'https://golf-app-5a5.pages.dev/admin.html?game=door1&group=2', replace: (u) => { calls.push(u); throw new Error('navigated'); } };
        } });
        assert.deepEqual(calls, ['https://golf-app-5a5.pages.dev/index.html?game=door1&group=2']);
        // Function declarations hoist, so the tell is the screens: the script stopped at
        // the redirect, before the line that shows the wizard, and the door never acted.
        assert.notEqual(run(sb, "document.getElementById('admin-screen').style.display"), 'block', 'the wizard was not shown');
        assert.notEqual(run(sb, "document.getElementById('setup-refused-screen').style.display"), 'block', 'the door did not need to refuse');
        // The door's own way back, for the case it does decide (a bare ?game with a
        // group carried some other way): showSetupRefused keeps &group=.
        const src = read('admin.html');
        const fn = src.slice(src.indexOf('function showSetupRefused('), src.indexOf('function loadModeData('));
        assert.match(fn, /if \(groupParam\) href \+= '&group=' \+ groupParam;/);
        assert.match(fn, /setup-refused-screen/);
    });
    test('the organizer link from a second device: the wizard, and the token remembered', async () => {
        const r = await wizardArrival(OTHER, '?game=door1&organizer=tok-1');
        assert.equal(r.refused, false); assert.equal(r.wizard, true); assert.equal(r.loaded, true);
        assert.equal(run(r.sb, "localStorage.getItem('golfapp_organizer_DOOR1')"), 'tok-1');
    });
    test('the remembered token alone: the wizard', async () => {
        const r = await wizardArrival(OTHER, '?game=door1', { remembered: 'tok-1' });
        assert.equal(r.refused, false); assert.equal(r.wizard, true);
    });
    test('a wrong organizer link: refused (CONTROL)', async () => {
        const r = await wizardArrival(OTHER, '?game=door1&organizer=tok-9');
        assert.equal(r.refused, true); assert.equal(r.loaded, false);
    });
    test('A NEW ROUND (no players): the wizard for anyone, no door', async () => {
        const r = await wizardArrival({ ownerUid: 'somebody-else' }, '?game=door1');
        assert.equal(r.refused, false); assert.equal(r.wizard, true); assert.equal(r.loaded, false, 'a new round has no record to mark as existing');
    });
    test('a legacy round (neither field): the wizard, as today; a token-only round: refused without the link', async () => {
        assert.equal((await wizardArrival(LEGACY, '?game=door1')).refused, false);
        assert.equal((await wizardArrival(TOKEN_ONLY, '?game=door1')).refused, true);
        assert.equal((await wizardArrival(TOKEN_ONLY, '?game=door1&organizer=tok-1')).refused, false);
    });
    test('the refusal screen: the sentence as approved, and the wizard markup is not what is shown', () => {
        const src = read('admin.html');
        const card = src.slice(src.indexOf('id="setup-refused-screen"'), src.indexOf('id="round-ready-screen"'));
        assert.match(card, /🔒/);
        assert.match(card, /This round's setup belongs to its organizer\./);
        assert.match(card, /If that is you, sign in with the email for this round on this device &mdash; that is what saves setup\. The organizer link opens these screens; it is on the scorecard's Group Links panel on the device that set the round up\./);
        assert.match(card, /id="setup-refused-back"[^>]*>⛳ Back to the scorecard</);
        assert.doesNotMatch(card, /wizard-step|Save & Start/);
    });
});

// ---------------------------------------------------------------------------
describe('HANDOFF says what this is not', () => {
    test('hides the doors, does not lock them; rules untouched; the ten isOrganizerView gates listed', () => {
        const h = read('HANDOFF.md');
        assert.match(h, /hides the doors; it does not lock them/i);
        assert.match(h, /database\.rules\.json/);
        assert.match(h, /isOrganizerView/);
        const src = read('index.html');
        const uses = (src.match(/isOrganizerView\(\)/g) || []).length;
        // 10 mentions (comments included) beside the definition and canReachSetup's
        // comment: 3621, 4283, 4296, 4967 (def), 4976, 6657, 6664, 6672, 6688 + one
        // more in the older provenance comment. A gate moved onto canReachSetup moves
        // its comment too, so this count falls and HANDOFF's table has to follow.
        assert.equal(uses, 10, 'isOrganizerView() mentions in index.html: ' + uses);
    });
});
