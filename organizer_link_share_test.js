// ============================================================================
// THE ORGANIZER LINK: SHARED, AND CLAIMED (v200, 2026-09-22)
//
// THE PROBLEM. ownerUid is an anonymous Firebase uid, and anonymous auth is per
// browser ORIGIN: the App Store app, Safari, the home-screen PWA and a Mac are
// four organizers on one person's desk. On 2026-09-21 Manny created X7Z8HM in
// the app and Safari showed him his own round as a spectator. The cure existed -
// ?organizer=TOKEN, remembered per device - and was rendered ONLY on the Group
// Links panel, which only somebody the gate already calls the organizer can
// see: the fix was invisible to the person who needed it.
//
// (a) SHARE. organizer-gate.js organizerShareUrl / organizerShareText /
//     shareOrganizerLink: one builder, three callers - Round Ready
//     (admin.html), the Game tab (game.html) and the scorecard's Group Links
//     panel (index.html). The URL is shareBaseUrl() + 'index.html?game=CODE&
//     organizer=TOKEN' - NEVER location, which inside the shell is
//     capacitor://localhost and would open nothing on anybody else's phone
//     (the Build-9 failure). The share goes to @capacitor/share through
//     Capacitor.Plugins (the native injected bridge - the only runtime the
//     device has, see native-export.js), else navigator.share, else the
//     clipboard, else a prompt.
// (d) CLAIM. claimOrganizerToken takes what a golfer PASTES - the whole URL or
//     the bare token - validates it against THIS round's organizerToken and
//     stores it under golfapp_organizer_<CODE>. Offered on admin.html's
//     refusal card, on the scorecard and on the Game tab, but only on a BARE
//     link whose doors are hidden. NOTHING IS WRITTEN TO FIREBASE by either
//     path, and no round is read: the token is already on the record.
//
// WHAT THE HARNESS CAN PROVE. mini-dom renders innerHTML as a string, so the
// surfaces are asserted on the HTML each page wrote and the claim is driven by
// calling the page's own submit handler after setting the input's value (the
// harness has real inputs). The Chrome arm at the end types a pasted link into
// the real box on a NON-ORGANIZER device and watches ✏️ and 👥 appear.
// ============================================================================

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const J = v => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);
const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const OTHER = 'ffffffffffffffffffffffffffffffff';
const ORIGIN = /const GOLF_WEB_ORIGIN = '([^']+)'/.exec(read('product-links.js'))[1];

function round(o) {
    const r = wizardSavedRound({ code: 'ORG1', courseData: CD, thru: 9, ownerUid: (o && o.ownerUid !== undefined) ? o.ownerUid : 'anon-stub' });
    r.organizerToken = (o && o.token !== undefined) ? o.token : TOKEN;
    if (r.organizerToken === null) delete r.organizerToken;
    return r;
}

// ---- THE SHARED BUILDER ------------------------------------------------------
// product-links.js first: shareBaseUrl() is what keeps the link off capacitor://.
// loadJsFile's stub localStorage is a deliberate no-op (helpers/load-script.js) and
// its options do not carry the real-store opt-in, so a module realm that must
// REMEMBER gets one installed here - a test about when something is remembered
// cannot run against a store that forgets.
const gate = () => { const sb = loadJsFile('organizer-gate.js', ['product-links.js']); const mem = new Map();
sb.localStorage = { getItem: k => (mem.has(String(k)) ? mem.get(String(k)) : null), setItem: (k, v) => { mem.set(String(k), String(v)); }, removeItem: k => { mem.delete(String(k)); } };
return sb; };
const G = gate();

describe('organizer-gate.js: the URL, the words, the paste (one builder for three pages)', () => {
    test('the URL is the canonical web origin + the code + the token - never this page\'s location', () => {
        const url = G.organizerGate.organizerShareUrl('org1', TOKEN);
        assert.equal(url, ORIGIN + '/index.html?game=ORG1&organizer=' + TOKEN);
        assert.ok(!/capacitor:/.test(url));
        assert.match(url, /^https:\/\//);
    });
    test('the words say what it opens and to keep it', () => {
        assert.equal(G.organizerGate.organizerShareText('org1'),
            'Organizer link for ORG1 — opens the setup screens on this device. Saving them needs the email sign-in for this round. Keep it to yourself.');
    });
    test('a paste is read as a URL, as a bare token, or as nothing', () => {
        const t = G.organizerGate.tokenFromPaste;
        assert.equal(t(ORIGIN + '/index.html?game=ORG1&organizer=' + TOKEN), TOKEN);
        assert.equal(t('  ' + ORIGIN + '/index.html?game=ORG1&organizer=' + TOKEN + '&group=2  '), TOKEN, 'a link with another param after it');
        assert.equal(t(ORIGIN + '/index?game=ORG1&organizer=' + TOKEN + '#x'), TOKEN, 'a clean URL with a fragment');
        assert.equal(t(TOKEN), TOKEN, 'the bare token');
        assert.equal(t('   ' + TOKEN + '\n'), TOKEN);
        [null, undefined, '', '   ', 'no token here', 'https://golf-app-5a5.pages.dev/index.html?game=ORG1', 'short', '<script>'].forEach(x =>
            assert.equal(t(x), null, JSON.stringify(x)));
    });
    test('claim: the round\'s own token is stored; another round\'s is refused; a round with no token cannot be claimed; nothing is written to the database', () => {
        const sb = gate();
        const g = sb.organizerGate;
        assert.equal(g.claimOrganizerToken('ORG1', { organizerToken: TOKEN }, OTHER), 'wrong');
        assert.equal(g.heldOrganizerToken('ORG1', null), null, 'nothing stored by a refusal');
        assert.equal(g.claimOrganizerToken('ORG1', { organizerToken: TOKEN }, 'rubbish'), 'empty');
        assert.equal(g.claimOrganizerToken('ORG1', {}, TOKEN), 'wrong', 'a legacy round has nothing to check against');
        assert.equal(g.claimOrganizerToken('ORG1', { organizerToken: TOKEN }, ORIGIN + '/index.html?game=ORG1&organizer=' + TOKEN), 'ok');
        assert.equal(g.heldOrganizerToken('ORG1', null), TOKEN, 'and it persists on this device');
        assert.equal(sb.localStorage.getItem('golfapp_organizer_ORG1'), TOKEN);
        assert.equal(g.isRoundOrganizer({ ownerUid: 'someone-else', organizerToken: TOKEN }, 'me', g.heldOrganizerToken('ORG1', null)), true, 'the doors open');
    });
    test('the claim is case-kept and per round: the same token does not unlock a different code', () => {
        const sb = gate();
        const g = sb.organizerGate;
        assert.equal(g.claimOrganizerToken('ORG1', { organizerToken: TOKEN }, TOKEN), 'ok');
        assert.equal(g.heldOrganizerToken('ORG2', null), null, 'ORG2 is not unlocked');
    });
    test('the share path: the app\'s Share plugin when the bridge is there, navigator.share on the web, the clipboard when neither', async () => {
        // THE NATIVE BRIDGE, as the device has it: Capacitor.Plugins.Share, no registerPlugin.
        const native = gate();
        native.__calls = [];
        native.Capacitor = { isNativePlatform: () => true, Plugins: { Share: { share(o) { native.__calls.push(o); return Promise.resolve(); } } } };
        assert.equal(await native.organizerGate.shareOrganizerLink('org1', { organizerToken: TOKEN }), 'shared');
        assert.equal(native.__calls.length, 1);
        assert.deepEqual(J(native.__calls[0]), { title: 'HardPan', text: native.organizerGate.organizerShareText('org1'), url: native.organizerGate.organizerShareUrl('org1', TOKEN), dialogTitle: 'Organizer link' });
        // THE WEB: navigator.share
        const web = gate();
        web.__calls = [];
        web.navigator = { share(o) { web.__calls.push(o); return Promise.resolve(); } };
        assert.equal(await web.organizerGate.shareOrganizerLink('org1', { organizerToken: TOKEN }), 'shared');
        assert.deepEqual(J(web.__calls[0]), { title: 'HardPan', text: web.organizerGate.organizerShareText('org1'), url: web.organizerGate.organizerShareUrl('org1', TOKEN) });
        // NEITHER: the clipboard, with the words and the URL
        const clip = gate();
        clip.__copied = [];
        clip.navigator = { clipboard: { writeText(t) { clip.__copied.push(t); return Promise.resolve(); } } };
        assert.equal(await clip.organizerGate.shareOrganizerLink('org1', { organizerToken: TOKEN }), 'copied');
        assert.equal(clip.__copied[0], clip.organizerGate.organizerShareText('org1') + '\n' + clip.organizerGate.organizerShareUrl('org1', TOKEN));
        // a round with no token shares nothing
        assert.equal(await web.organizerGate.shareOrganizerLink('org1', {}), 'failed');
    });
    test('a refused native share falls back to the clipboard rather than failing silently', async () => {
        const sb = gate();
        sb.__copied = [];
        sb.Capacitor = { isNativePlatform: () => true, Plugins: { Share: { share() { return Promise.reject(new Error('cancelled')); } } } };
        sb.navigator = { clipboard: { writeText(t) { sb.__copied.push(t); return Promise.resolve(); } } };
        assert.equal(await sb.organizerGate.shareOrganizerLink('org1', { organizerToken: TOKEN }), 'copied');
        assert.equal(sb.__copied.length, 1);
    });
});

// ---- THE SCORECARD ----------------------------------------------------------
// ONE TICK BEFORE THE SNAPSHOT. auth-boot.js signs the realm in as 'anon-stub'
// a tick after load; the round's ownerUid is that uid, so a snapshot delivered
// before it lands makes the round's own creator look like a spectator - the very
// confusion this wave is about, and a false red here.
const tick = () => new Promise(r => setTimeout(r, 40));
async function scorecard(data, search) {
    const sb = loadHtmlInlineScript('index.html', [], { search: search || '?game=org1', localStorage: true });
    sb.__d = J(data);
    run(sb, "['group-filter-container', 'group-links-panel', 'organizer-claim-mount', 'players-sheet', 'players-sheet-body', 'players-sheet-money', 'players-sheet-warn'].forEach(function (id) { document.__mount(document.getElementById(id)); });");
    await tick();
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/ORG1');
    h.cb({ val: () => J(data), exists: () => true });
    return sb;
}
const html = (sb, id) => String(run(sb, "(document.getElementById('" + id + "') || {}).innerHTML || ''"));
// a note is written with textContent (a sentence, never markup), which mini-dom
// keeps apart from innerHTML
const text = (sb, id) => String(run(sb, "(document.getElementById('" + id + "') || {}).textContent || ''"));

describe('THE SCORECARD: Share on the organizer row, the claim box on a stuck bare link', () => {
    test('the organizer (this device saved it): the Group Links panel offers Copy AND Share, and no claim box', async () => {
        const sb = await scorecard(round());
        run(sb, 'toggleGroupLinksPanel();');
        const panel = html(sb, 'group-links-panel');
        assert.match(panel, /🔑 Organizer Link/);
        assert.match(panel, /onclick="shareOrganizerLinkFromScorecard\(this\)"/);
        assert.equal(html(sb, 'organizer-claim-mount'), '', 'the doors are open: nothing to claim');
        assert.match(html(sb, 'group-filter-container'), /Edit round setup/);
    });
    test('ANOTHER DEVICE on the bare link (the 2026-09-21 case): the doors are hidden and the claim box is offered', async () => {
        const sb = await scorecard(round({ ownerUid: 'a-different-browser' }));
        assert.ok(!/Edit round setup|👥 Players/.test(html(sb, 'group-filter-container')), 'no doors');
        const box = html(sb, 'organizer-claim-mount');
        assert.match(box, /Are you the organizer\? Paste your organizer link\./);
        assert.match(box, /<input id="oc-input"/);
        assert.match(box, /onclick="submitOrganizerClaim\(\)"/);
    });
    test('a valid paste opens the doors, persists on this device, and writes NOTHING to the database', async () => {
        const sb = await scorecard(round({ ownerUid: 'a-different-browser' }));
        run(sb, "document.getElementById('oc-input').value = '" + ORIGIN + "/index.html?game=ORG1&organizer=" + TOKEN + "';");
        assert.equal(run(sb, 'submitOrganizerClaim()'), 'ok');
        assert.match(html(sb, 'group-filter-container'), /Edit round setup/, 'the doors are open now');
        assert.match(html(sb, 'group-filter-container'), /👥 Players/);
        assert.equal(html(sb, 'organizer-claim-mount'), '', 'and the box is gone');
        assert.equal(sb.localStorage.getItem('golfapp_organizer_ORG1'), TOKEN);
        assert.equal(J(sb.__dbWrites).length, 0, 'nothing written');
        // PERSISTS: a fresh arrival on the same device (the same store) needs no paste
        // the SAME device, a fresh arrival: the store is seeded with what the claim left
        const again = loadHtmlInlineScript('index.html', [], { search: '?game=org1', localStorage: true, seedStorage: { golfapp_organizer_ORG1: TOKEN } });
        run(again, "['group-filter-container', 'group-links-panel', 'organizer-claim-mount'].forEach(function (id) { document.__mount(document.getElementById(id)); });");
        await tick();
        again.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/ORG1').cb({ val: () => J(round({ ownerUid: 'a-different-browser' })), exists: () => true });
        assert.match(html(again, 'group-filter-container'), /Edit round setup/, 'remembered across the reload');
        assert.equal(html(again, 'organizer-claim-mount'), '');
    });
    test('a WRONG token: "That link isn’t for this round.", the doors stay shut, nothing stored (CONTROL: the right one opens them)', async () => {
        const sb = await scorecard(round({ ownerUid: 'a-different-browser' }));
        run(sb, "document.getElementById('oc-input').value = '" + ORIGIN + "/index.html?game=ORG1&organizer=" + OTHER + "';");
        assert.equal(run(sb, 'submitOrganizerClaim()'), 'wrong');
        assert.equal(text(sb, 'oc-note'), 'That link isn’t for this round.');
        assert.ok(!/Edit round setup/.test(html(sb, 'group-filter-container')));
        assert.equal(sb.localStorage.getItem('golfapp_organizer_ORG1'), null);
        assert.equal(J(sb.__dbWrites).length, 0);
        // rubbish says what to paste rather than accusing the golfer of the wrong round
        run(sb, "document.getElementById('oc-input').value = 'hello';");
        assert.equal(run(sb, 'submitOrganizerClaim()'), 'empty');
        assert.equal(text(sb, 'oc-note'), 'Paste the whole link, or the token from it.');
        // CONTROL
        run(sb, "document.getElementById('oc-input').value = '" + TOKEN + "';");
        assert.equal(run(sb, 'submitOrganizerClaim()'), 'ok');
        assert.match(html(sb, 'group-filter-container'), /Edit round setup/);
    });
    test('a BARE TOKEN pasted (somebody read it out of the URL) is accepted', async () => {
        const sb = await scorecard(round({ ownerUid: 'a-different-browser' }));
        run(sb, "document.getElementById('oc-input').value = '  " + TOKEN + "  ';");
        assert.equal(run(sb, 'submitOrganizerClaim()'), 'ok');
        assert.match(html(sb, 'group-filter-container'), /Edit round setup/);
    });
    test('NOT on a group link: a scorekeeper is not a locked-out organizer', async () => {
        const sb = await scorecard(round({ ownerUid: 'a-different-browser' }), '?game=org1&group=2');
        assert.equal(html(sb, 'organizer-claim-mount'), '');
        assert.ok(!/Edit round setup/.test(html(sb, 'group-filter-container')));
    });
    test('the group-link guard IS a second guard, and it holds on its own: renderGroupFilters returns before the claim on a locked link, AND the builder refuses when called directly', async () => {
        // DEFENCE IN DEPTH, PROVEN IN ISOLATION (CLAUDE.md). On a group link
        // renderGroupFilters empties the bar and returns before it reaches the claim
        // renderer at all - so deleting renderOrganizerClaim's own !hasGroupLock
        // test changes nothing on the render path. Called directly, as a later
        // caller might, the builder must still refuse.
        const src = read('index.html');
        const fn = src.slice(src.indexOf('function renderGroupFilters(playersCount)'), src.indexOf('\n    function filterGroup'));
        assert.ok(fn.indexOf("if (hasGroupLock) {") < fn.indexOf('renderOrganizerClaim();'), 'the early return comes first');
        const sb = await scorecard(round({ ownerUid: 'a-different-browser' }), '?game=org1&group=2');
        run(sb, 'renderOrganizerClaim();');
        assert.equal(html(sb, 'organizer-claim-mount'), '', 'called directly on a locked link: still nothing');
        // and a CLEAN case still renders, so the isolation test cannot be satisfied
        // by a renderer that simply refuses everything
        const bare = await scorecard(round({ ownerUid: 'a-different-browser' }));
        run(bare, 'renderOrganizerClaim();');
        assert.match(html(bare, 'organizer-claim-mount'), /Are you the organizer\?/);
    });
    test('NOT on a round with no organizerToken: there is nothing to check a paste against', async () => {
        const sb = await scorecard(round({ ownerUid: 'a-different-browser', token: null }));
        assert.equal(html(sb, 'organizer-claim-mount'), '');
    });
    test('the share action is organizer-only at the function, not just at the button', async () => {
        const sb = await scorecard(round({ ownerUid: 'a-different-browser' }));
        assert.equal(await run(sb, 'shareOrganizerLinkFromScorecard(null)'), 'failed', 'a spectator calling it from the console gets nothing');
        const org = await scorecard(round());
        org.navigator.share = o => { org.__shared = o; return Promise.resolve(); };
        assert.equal(await run(org, 'shareOrganizerLinkFromScorecard(null)'), 'shared');
        assert.equal(J(org.__shared).url, ORIGIN + '/index.html?game=ORG1&organizer=' + TOKEN);
    });
});

// ---- THE GAME TAB -----------------------------------------------------------
async function gameTab(data, search) {
    const sb = loadHtmlInlineScript('game.html', [], { search: search || '?game=org1', localStorage: true });
    run(sb, "['game-setup-mount', 'game-claim-mount', 'game-content'].forEach(function (id) { document.__mount(document.getElementById(id)); });");
    await tick();   // auth-boot's uid, as on the scorecard
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/ORG1');
    h.cb({ val: () => J(data), exists: () => true });
    return sb;
}
describe('THE GAME TAB: the share button for the organizer, the claim box for the stuck device', () => {
    test('the organizer: Edit round setup, Players, and "Share organizer link"; no claim box', async () => {
        const sb = await gameTab(round());
        const m = html(sb, 'game-setup-mount');
        assert.match(m, /Edit round setup/); assert.match(m, /👥 Players/);
        assert.match(m, /onclick="shareOrganizerLinkFromGame\(this\)"/);
        assert.match(m, /🔑 Share organizer link/);
        assert.equal(html(sb, 'game-claim-mount'), '');
    });
    test('another device: no links, the claim box; a valid paste brings the links back with nothing written', async () => {
        const sb = await gameTab(round({ ownerUid: 'a-different-browser' }));
        assert.equal(html(sb, 'game-setup-mount'), '');
        assert.match(html(sb, 'game-claim-mount'), /Are you the organizer\? Paste your organizer link\./);
        run(sb, "document.getElementById('gc-input').value = '" + ORIGIN + "/index.html?game=ORG1&organizer=" + TOKEN + "';");
        assert.equal(run(sb, 'submitGameClaim()'), 'ok');
        assert.match(html(sb, 'game-setup-mount'), /Edit round setup/);
        assert.equal(html(sb, 'game-claim-mount'), '');
        assert.equal(J(sb.__dbWrites).length, 0);
    });
    test('a wrong token is refused here too, and a group link is offered no box', async () => {
        const sb = await gameTab(round({ ownerUid: 'a-different-browser' }));
        run(sb, "document.getElementById('gc-input').value = '" + OTHER + "';");
        assert.equal(run(sb, 'submitGameClaim()'), 'wrong');
        assert.equal(text(sb, 'gc-note'), 'That link isn’t for this round.');
        assert.equal(html(sb, 'game-setup-mount'), '');
        assert.equal(html(await gameTab(round({ ownerUid: 'x' }), '?game=org1&group=2'), 'game-claim-mount'), '');
    });
    test('the page loads product-links.js, so the shared URL carries the web origin inside the shell', () => {
        assert.match(read('game.html'), /<script src="product-links\.js"><\/script>/);
    });
});

// ---- ADMIN'S REFUSAL CARD ---------------------------------------------------
describe('THE REFUSAL CARD (admin.html): the dead end becomes a way in', () => {
    function refused(data, search) {
        const sb = loadHtmlInlineScript('admin.html', [], { search: search || '?game=org1', localStorage: true });
        run(sb, "['setup-refused-screen', 'setup-refused-back', 'setup-claim', 'admin-screen', 'round-ready-screen', 'lobby-screen'].forEach(function (id) { document.__mount(document.getElementById(id)); });");
        // `currentMode` is a page const, so it is set through the sandbox rather than
        // assigned (vm.runInContext cannot write a TDZ binding from outside its scope)
        run(sb, 'showSetupRefused(' + JSON.stringify(data) + ');');
        return sb;
    }
    test('the card offers the paste line and the box', () => {
        const sb = refused(round({ ownerUid: 'a-different-browser' }));
        const box = html(sb, 'setup-claim');
        assert.match(box, /Are you the organizer\? Paste your organizer link\./);
        assert.match(box, /<input id="claim-input"/);
        assert.match(box, /onclick="submitSetupClaim\(\)"/);
    });
    test('a valid paste stores the token and reloads into the wizard for this round; nothing is written to the database', () => {
        const sb = refused(round({ ownerUid: 'a-different-browser' }));
        run(sb, "document.getElementById('claim-input').value = '" + ORIGIN + "/index.html?game=ORG1&organizer=" + TOKEN + "';");
        run(sb, 'submitSetupClaim();');
        assert.equal(sb.localStorage.getItem('golfapp_organizer_ORG1'), TOKEN);
        assert.equal(String(sb.window.location.href), 'admin.html?game=ORG1');
        assert.equal(J(sb.__dbWrites).length, 0);
    });
    test('a wrong token: the sentence, no store, no navigation (CONTROL: the right one navigates)', () => {
        const sb = refused(round({ ownerUid: 'a-different-browser' }));
        const before = String(sb.window.location.href);
        run(sb, "document.getElementById('claim-input').value = '" + OTHER + "';");
        run(sb, 'submitSetupClaim();');
        assert.equal(text(sb, 'claim-note'), 'That link isn’t for this round.');
        assert.equal(sb.localStorage.getItem('golfapp_organizer_ORG1'), null);
        assert.equal(String(sb.window.location.href), before, 'stayed put');
        run(sb, "document.getElementById('claim-input').value = '" + TOKEN + "'; submitSetupClaim();");
        assert.equal(String(sb.window.location.href), 'admin.html?game=ORG1');
    });
    test('NOT on a group link', () => {
        const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=org1&group=3', localStorage: true });
        run(sb, "['setup-claim'].forEach(function (id) { document.__mount(document.getElementById(id)); });");
        run(sb, 'renderSetupClaim(' + JSON.stringify(round({ ownerUid: 'x' })) + ');');
        assert.equal(html(sb, 'setup-claim'), '');
    });
    test('Round Ready offers the share button, with the warning in plain words', () => {
        const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=org1', localStorage: true });
        run(sb, "['rr-links-box', 'rr-course-sub', 'rr-standing', 'rr-players-list', 'rr-retire', 'rr-scoring-box', 'rr-scoring-text', 'rr-action-box', 'rr-noaction-box', 'rr-action-text', 'rr-add-action-btn'].forEach(function (id) { document.__mount(document.getElementById(id)); });");
        sb.__d = J(round());
        run(sb, 'currentMode = "ORG1"; renderRoundReadyLinks(__d);');
        const box = html(sb, 'rr-links-box');
        assert.match(box, /🔑 Share organizer link/);
        assert.match(box, /onclick="shareOrganizerLinkAction\(\)"/);
        assert.match(box, /Saving them needs the email sign-in for the account that created the round/);
        assert.match(box, /Keep it to yourself/);
        assert.ok(!/anyone with it can edit/.test(box), 'the note must not say the link alone can edit');
        assert.match(box, /Your own devices/);
    });
    test('Round Ready\'s share action hands the canonical URL to the share path', async () => {
        const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=org1', localStorage: true });
        run(sb, "['rr-links-box', 'rr-organizer-note'].forEach(function (id) { document.__mount(document.getElementById(id)); });");
        sb.navigator.share = o => { sb.__shared = o; return Promise.resolve(); };
        run(sb, 'currentMode = "ORG1"; currentSavedRound = ' + JSON.stringify(round()) + ';');
        assert.equal(await run(sb, 'shareOrganizerLinkAction()'), 'shared');
        assert.equal(J(sb.__shared).url, ORIGIN + '/index.html?game=ORG1&organizer=' + TOKEN);
        assert.equal(J(sb.__shared).text, 'Organizer link for ORG1 — opens the setup screens on this device. Saving them needs the email sign-in for this round. Keep it to yourself.');
    });
    test('a round with no token gets no share button (a legacy round has no link to share)', () => {
        const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=org1', localStorage: true });
        run(sb, "['rr-links-box'].forEach(function (id) { document.__mount(document.getElementById(id)); });");
        sb.__d = J(round({ token: null }));
        run(sb, 'currentMode = "ORG1"; renderRoundReadyLinks(__d);');
        assert.ok(!/Share organizer link/.test(html(sb, 'rr-links-box')));
    });
});

// ---- THE SEAMS --------------------------------------------------------------
describe('THE SEAMS: one builder, no second copy, nothing written', () => {
    test('the URL and the words are built in organizer-gate.js and nowhere else', () => {
        ['index.html', 'admin.html', 'game.html'].forEach(f => {
            const src = read(f).replace(/<!--[\s\S]*?-->/g, '');
            assert.ok(!/email sign-in for this round/.test(src), f + ' must not carry its own copy of the words');
            assert.ok(!/organizer=' \+ (currentData|data)\.organizerToken/.test(src.replace(/`/g, "'")) || f === 'index.html',
                f + ' must not build the URL itself');
        });
        assert.match(read('organizer-gate.js'), /function organizerShareUrl\(code, token\)/);
        assert.match(read('organizer-gate.js'), /function claimOrganizerToken\(code, data, text\)/);
    });
    test('the claim writes only to localStorage - no db.ref anywhere near it', () => {
        const g = read('organizer-gate.js');
        const fn = g.slice(g.indexOf('function claimOrganizerToken'), g.indexOf('var CLAIM_PROMPT'));
        assert.ok(!/db\.ref|firebase|\.set\(|\.update\(/.test(fn), 'a claim is a device fact, not a write: ' + fn.slice(0, 200));
        assert.match(fn, /localStorage\.setItem/);
    });
    test('the share resolves the plugin off Capacitor.Plugins FIRST even when registerPlugin also answers - the device has only the injected bridge', async () => {
        // BEHAVIOURAL, not a source-order regex: `var bag = cap.Plugins` sits above
        // both branches, so an indexOf comparison passes whichever branch runs first.
        // Here BOTH runtimes answer and the bag's plugin must be the one used.
        const sb = gate();
        sb.__used = [];
        sb.Capacitor = {
            isNativePlatform: () => true,
            Plugins: { Share: { share() { sb.__used.push('bridge'); return Promise.resolve(); } } },
            registerPlugin: () => ({ share() { sb.__used.push('registerPlugin'); return Promise.resolve(); } })
        };
        assert.equal(await sb.organizerGate.shareOrganizerLink('org1', { organizerToken: TOKEN }), 'shared');
        assert.deepEqual(sb.__used, ['bridge']);
        // and with ONLY registerPlugin (a bundler runtime, if one is ever added) it still shares
        const only = gate();
        only.__used = [];
        only.Capacitor = { isNativePlatform: () => true, Plugins: {}, registerPlugin: () => ({ share() { only.__used.push('registerPlugin'); return Promise.resolve(); } }) };
        assert.equal(await only.organizerGate.shareOrganizerLink('org1', { organizerToken: TOKEN }), 'shared');
        assert.deepEqual(only.__used, ['registerPlugin']);
    });
    test('the engines this wave must not touch are unchanged; the rules file moved for owner-only setup', () => {
        const sha = f => require('crypto').createHash('sha256').update(read(f)).digest('hex').slice(0, 8);
        assert.equal(sha('pool-engine.js'), '372e76d7');
        assert.equal(sha('settlement-engine.js'), 'f8905d43');   // f8905d43: v215 THE ALOHA BET 2026-09-23 (approved per-file, three edits only: the aloha line in legacyMainAsSideMatch, the Receipt segment in buildSideMatchReceipts, the ledger line in computeCombinedNetTotals; every decision and every number comes from aloha-bet.js through a typeof guard, so no golf math entered this file)
        assert.equal(sha('grouping.js'), '405b9774');
        // RE-PINNED v218. seasons/<code> is the new root (owner write, world
        // read). format_first_wizard_test.js holds the full hash. Was 3f2c646b.
        assert.equal(sha('database.rules.json'), 'a78a42c6');
    });
});

// ---- COLD CHROME: a non-organizer device pastes the link ---------------------
// No page function is called. The round arrives through the stand-in database
// with an ownerUid this browser does not have, so the doors are hidden; the
// claim box is typed into with real key events and the button tapped; the ✏️
// and 👥 doors are then measured on screen.
const DATA = (() => { const d = round({ ownerUid: 'somebody-elses-browser' }); return d; })();
const DB = { events: { ORG1: DATA }, global_courses: {}, trips: {}, tournaments: {} };
const PROBE0 = `(() => JSON.stringify({
    doors: Array.from(document.querySelectorAll('.group-setup-btn')).map(e => e.innerText),
    box: (document.getElementById('organizer-claim-mount').innerText || '').trim().slice(0, 60),
    inputs: document.querySelectorAll('#oc-input').length
}))()`;
const PROBE1 = `(() => JSON.stringify({
    doors: Array.from(document.querySelectorAll('.group-setup-btn')).map(e => e.innerText),
    box: (document.getElementById('organizer-claim-mount').innerText || '').trim(),
    stored: (function () { try { return localStorage.getItem('golfapp_organizer_ORG1'); } catch (e) { return 'blocked'; } })(),
    writes: (window.__coldWrites || []).length
}))()`;
const C = {};
before(async () => {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=ORG1'), db: DB, settleMs: 4000, steps: [
        { tap: '#group-pick-overlay .btn-outline', nth: 0 }, { sleep: 250 },
        { expression: PROBE0 },
        { tap: '#oc-input', nth: 0 }, { sleep: 150 },
        ...(ORIGIN + '/index.html?game=ORG1&organizer=' + TOKEN).split('').map(ch => ({ cdp: { method: 'Input.insertText', params: { text: ch } } })),
        { sleep: 150 },
        { expression: "'TYPED:' + document.getElementById('oc-input').value" },
        { tap: '#organizer-claim-mount .claim-btn', nth: 0 }, { sleep: 400 },
        { expression: PROBE1 },
    ] });
    // cold-arrival records a line per step ('tapped …', 'slept 250', a cdp 'ok'),
    // so the probes are found by SHAPE, not by index - an index moves the moment a
    // step is added and would read a sleep as a probe.
    const objs = (r.value || []).filter(x => typeof x === 'string' && x.charAt(0) === '{').map(x => JSON.parse(x));
    C.ok = r.ok; C.reason = r.reason;
    C.before = r.ok ? objs[0] : null;
    C.typed = r.ok ? (r.value.find(x => typeof x === 'string' && x.startsWith('TYPED:')) || '').slice(6) : null;
    C.after = r.ok ? objs[objs.length - 1] : null;
});
describe('COLD CHROME: the stuck device unsticks itself', () => {
    test('ran', () => assert.ok(C.ok, C.reason));
    test('on arrival the doors are hidden and the claim box is on screen with its input', () => {
        assert.deepEqual(C.before.doors, [], 'no Edit round setup, no Players');
        assert.match(C.before.box, /Are you the organizer\?/);
        assert.equal(C.before.inputs, 1);
    });
    test('the pasted link typed into the real box, then a real tap on Unlock setup: the doors appear, the token is stored, nothing was written', () => {
        assert.equal(C.typed, ORIGIN + '/index.html?game=ORG1&organizer=' + TOKEN);
        assert.deepEqual(C.after.doors.map(t => t.replace(/\s+/g, ' ').trim()), ['✏️ Edit round setup', '👥 Players']);
        assert.equal(C.after.box, '', 'the box is gone');
        assert.equal(C.after.stored, TOKEN);
        assert.equal(C.after.writes, 0);
    });
});
