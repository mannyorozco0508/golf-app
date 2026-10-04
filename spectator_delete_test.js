// ============================================================================
// ONLY THE ORGANIZER MAY DELETE A ROUND (2026-10-04)
//
// WHAT MANNY SAW. He opened the BARE link of round ULDM2A (Dobson Ranch) as a
// spectator and the scorecard offered him "🗑️ Delete round for everyone".
//
// WHY, AND IT IS NOT A MISSING GATE. The control was already gated - on
// isOrganizerView(), which returns `!hasGroupLock`, i.e. "this URL has no
// ?group=". That is true of the ORGANIZER and equally true of EVERY SPECTATOR
// and every "I'm playing" follower, because the bare link is exactly what gets
// forwarded to the group chat. The gate was answering a different question from
// the one the button needed answered.
//
// THE RULE NOW: organizerEvidence() - a matching ownerUid or a matching
// organizer token, and nothing else. This is the SAME predicate the Wave 22
// group-lock fix already uses for the other doors, and it is deliberately
// STRICTER than canReachSetup(), which also accepts isRoundOrganizer's third
// arm: "a round that records no owner and no token is open, as it always was".
// For Edit round setup that arm is right - a legacy round has to stay editable.
// For the most destructive button in the app it is not: on a round where nobody
// can be shown to be the organizer, the scorecard offers the delete to nobody,
// and the organizer still has it on admin.html?game=CODE, where they go to edit
// the round anyway. That trade is recorded here rather than assumed.
//
// A ROLE DOES NOT DEMOTE THE ORGANIZER. An organizer who taps "I'm playing" is
// still the organizer; what hides the button is the absence of evidence, not the
// presence of a role. Both arms are asserted below.
//
// HIDES AND REFUSES - IT DOES NOT LOCK. database.rules.json is untouched this
// wave (the DB-level lock is Stage 2, Manny's call), so the button is gone from
// the DOM, the handler refuses a second time, and a client holding the code can
// still write. The rule that a round WITH SCORES cannot be deleted is already in
// the live rules and is the backstop that matters most.
//
// BASELINE, measured over the FINISHED file against pre-fix main (ff99402),
// all 11 tests: 1 PASS / 10 FAIL. 1 + 10 = 11.
//   The ONE that passes is "the organizer calling it still DOES delete", which is
//   the positive control and describes behaviour this wave does not change. The
//   other ten are red, and eight of them for the same honest reason: there was no
//   canDeleteRound() to ask, so even the cases whose BEHAVIOUR was already correct
//   on main - the group scorekeeper has had no button since v189 - go red here
//   because the gate they name does not exist. Said plainly rather than counted as
//   eight new fixes.
//
// AND THE SAME THING IN A REAL BROWSER. dialog_delete_round_chrome_test.js gained
// a third arm: the identical cold arrival on the identical bare link, with
// ownerUid changed to another phone, and no taps - the mount renders with zero
// buttons while the scorecard itself renders rows. Its other two arms now own the
// round (ownerUid 'anon-cold', the uid cold-arrival signs in), because without
// evidence there is no button to tap and that file would measure an empty mount.
//
// CONTROL. Replacing the gate's body with `return !hasGroupLock` - the old
// predicate, exactly - turns seven of these red, the Chrome spectator arm
// included. index.html was restored by sha from a saved copy (d385caa25436498b),
// never with git restore.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const tick = (ms) => new Promise(r => setTimeout(r, ms || 30));

const P = ['Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'].map((n, i) => ({ id: 101 + i, name: n, hcp: '9' }));
const round = (o) => Object.assign({ players: P, courseData: [], scores: {}, groupSizeOverrides: {} }, o || {});
// auth-boot.js signs this realm in as 'anon-stub' one tick after load.
const OWNED_HERE = round({ ownerUid: 'anon-stub', organizerToken: 'tok-1' });
const OWNED_ELSEWHERE = round({ ownerUid: 'some-other-phone', organizerToken: 'tok-1' });
const LEGACY = round({});

async function scorecard(data, search, opts) {
    const sb = loadHtmlInlineScript('index.html', [], { search, localStorage: true });
    if (opts && opts.role) run(sb, "localStorage.setItem('golfapp_role_DEL1', " + JSON.stringify(opts.role) + ")");
    if (opts && opts.me) run(sb, "localStorage.setItem('golfapp_me_DEL1', " + JSON.stringify(opts.me) + ")");
    run(sb, "document.__mount(document.getElementById('end-round-mount'));");
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/DEL1');
    h.cb({ val: () => JSON.parse(JSON.stringify(data)), exists: () => true });
    await tick();
    return sb;
}
const box = sb => String(run(sb, "document.getElementById('end-round-mount').innerHTML"));
const DELETE_BTN = /Delete round for everyone/;

// ---------------------------------------------------------------------------
describe('1. WHO SEES THE BUTTON', () => {

    test("THE ORGANIZER'S OWN DEVICE, bare link: the button is there", async () => {
        const sb = await scorecard(OWNED_HERE, '?game=DEL1');
        assert.equal(run(sb, 'canDeleteRound()'), true);
        assert.match(box(sb), DELETE_BTN);
    });

    test('THE SPECTATOR ON THE BARE LINK: nothing in the DOM at all (the bug)', async () => {
        const sb = await scorecard(OWNED_ELSEWHERE, '?game=DEL1');
        assert.equal(run(sb, 'canDeleteRound()'), false);
        assert.equal(box(sb), '', 'the spectator was offered the delete: ' + box(sb));
        // NOT display:none - a hidden button is still clickable from a console.
        assert.ok(!/button/i.test(box(sb)));
    });

    test('AN "I\'M PLAYING" FOLLOWER: also nothing', async () => {
        const sb = await scorecard(OWNED_ELSEWHERE, '?game=DEL1', { role: 'playing', me: '102' });
        assert.equal(run(sb, "currentRoundRole()"), 'playing', 'the role did not take - this case is not what it says');
        assert.equal(run(sb, 'canDeleteRound()'), false);
        assert.equal(box(sb), '');
    });

    test('THE GROUP SCOREKEEPER: nothing, as since v189', async () => {
        const sb = await scorecard(OWNED_ELSEWHERE, '?game=DEL1&group=1');
        assert.equal(run(sb, 'canDeleteRound()'), false);
        assert.equal(box(sb), '');
    });

    test('AND A ROLE DOES NOT DEMOTE THE ORGANIZER: owner + "I\'m playing" keeps it', async () => {
        const sb = await scorecard(OWNED_HERE, '?game=DEL1', { role: 'playing', me: '101' });
        assert.equal(run(sb, "currentRoundRole()"), 'playing');
        assert.equal(run(sb, 'canDeleteRound()'), true, 'the organizer lost their own round by joining it');
        assert.match(box(sb), DELETE_BTN);
    });

    test('THE ORGANIZER LINK on a second device: the token is the evidence', async () => {
        const sb = await scorecard(OWNED_ELSEWHERE, '?game=DEL1&organizer=tok-1');
        assert.equal(run(sb, 'canDeleteRound()'), true);
        assert.match(box(sb), DELETE_BTN);
        // THE WRONG TOKEN IS NOT EVIDENCE.
        const no = await scorecard(OWNED_ELSEWHERE, '?game=DEL1&organizer=not-it');
        assert.equal(run(no, 'canDeleteRound()'), false);
        assert.equal(box(no), '');
    });

    test('A LEGACY ROUND NAMES NO ORGANIZER, so the scorecard offers it to nobody', async () => {
        // isRoundOrganizer says yes to everybody here - that arm keeps old rounds
        // editable. It is deliberately NOT accepted for the delete; see the header.
        const sb = await scorecard(LEGACY, '?game=DEL1');
        assert.equal(run(sb, 'canReachSetup()'), true, 'the setup door closed on a legacy round - that is a different, worse bug');
        assert.equal(run(sb, 'canDeleteRound()'), false);
        assert.equal(box(sb), '');
    });

    test('THE DEFAULT STATE: no button before the uid lands, button after', async () => {
        const sb = loadHtmlInlineScript('index.html', [], { search: '?game=DEL1', localStorage: true });
        run(sb, "document.__mount(document.getElementById('end-round-mount'));");
        const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/DEL1');
        h.cb({ val: () => JSON.parse(JSON.stringify(OWNED_HERE)), exists: () => true });
        assert.equal(run(sb, 'window.authBootState.status'), 'pending');
        assert.equal(box(sb), '', 'nobody is anybody before the uid lands');
        await tick();
        assert.match(box(sb), DELETE_BTN, 'the page never re-rendered the control once it knew who this was');
    });
});

// ---------------------------------------------------------------------------
describe('2. AND THE HANDLER REFUSES TOO', () => {

    // Removing the button in devtools must achieve nothing: the same belt-and-
    // braces the group-scope writes carry.
    const removes = (sb) => (sb.__dbWrites || []).filter(w => w.op === 'remove');

    test('the spectator calling it directly deletes nothing', async () => {
        const sb = await scorecard(OWNED_ELSEWHERE, '?game=DEL1');
        run(sb, 'uiConfirm = function () { return Promise.resolve(true); };');
        await run(sb, 'endAndClearRound()');
        await tick();
        assert.deepEqual(removes(sb), [], 'a spectator deleted the round: ' + JSON.stringify(removes(sb)));
    });

    test('and the organizer calling it still DOES delete - so the test above means something', async () => {
        const sb = await scorecard(OWNED_HERE, '?game=DEL1');
        run(sb, 'uiConfirm = function () { return Promise.resolve(true); };');
        await run(sb, 'endAndClearRound()');
        await tick();
        assert.deepEqual(removes(sb).map(w => w.path), ['events/DEL1'],
            'the organizer can no longer delete their own round');
    });

    test('the gate is one function, named once, used by both', () => {
        const src = read('index.html');
        const at = src.indexOf('function renderEndRoundControl()');
        assert.ok(at > 0, 'the renderer is gone');
        const r = src.slice(at, src.indexOf('\n    async function endAndClearRound()', at));
        assert.ok(r.length > 200, 'the slice is empty - the endpoint drifted');
        assert.match(r, /canDeleteRound\(\)/, 'the renderer no longer asks the delete gate');
        const h = src.indexOf('async function endAndClearRound()');
        const fn = src.slice(h, src.indexOf('\n    // Total strokes for the round', h));
        assert.ok(fn.length > 400, 'the handler slice is empty - the endpoint drifted');
        assert.match(fn, /canDeleteRound\(\)/, 'the handler no longer asks the delete gate');
        // AND NEITHER ASKS THE OLD QUESTION. isOrganizerView() is "no ?group= on
        // this URL", which is the spectator's answer too.
        assert.ok(!/isOrganizerView/.test(r + fn),
            'the URL-shape gate is back on the delete control, which is the whole bug');
        // ONE DEFINITION, and it asks for EVIDENCE rather than the open arm.
        const g = src.indexOf('function canDeleteRound()');
        assert.ok(g > 0, 'there is no delete gate');
        const gate = src.slice(g, src.indexOf('\n    function ', g + 30));
        assert.match(gate, /organizerEvidence/, 'the gate does not ask for evidence');
        assert.ok(!/isRoundOrganizer/.test(gate),
            'the gate accepts the legacy open arm, which hands the delete to every spectator of an old round');
    });
});
