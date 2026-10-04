// ============================================================================
// THREE WAYS INTO A ROUND (Wave 39)
//
// A round had two: the SCOREKEEPER with a ?group=N link, and the SPECTATOR with
// the bare link. There was no way to be the third and most common thing - a
// golfer who is PLAYING and not keeping score. One person per group holds the
// card; the other three have money on the round and the app had nothing to say
// to them.
//
// WHAT THE RECON FOUND FIRST, because Manny asked before any of this was built:
// can a spectator already pick "Who am I?" today?
//
//   THE MECHANISM: YES.   index.html:5797 whoAmILineHtml() has no spectator gate
//                         at all - its only condition is two or more players in
//                         scope, which a bare-link spectator satisfies with the
//                         whole field (measured: 8 of 8). setMe() at :5681 is
//                         reachable and storeMe() at :5684 writes
//                         golfapp_me_<code>.
//   THE ENTRY POINT: NO.  It is rendered in exactly one place, index.html:6156,
//                         inside the Action Center body - which is COLLAPSED by
//                         default (measured: a spectator on a round with one
//                         side bet gets 190 bytes, the toggle alone) and empty
//                         altogether when the round has no bets (:5954, :5955).
//
// So the machinery was already there and nobody could find it. That is the gap
// this fills, and it is why the wave is small: no new storage, no new question.
//
// THE TWO RULES THAT COST SOMETHING IF THEY ARE WRONG:
//
//   A ?group= LINK IS ALWAYS THE SCOREKEEPER, whatever is stored. The URL is the
//   lock. A golfer who tapped "I'm playing" last week and is sent a group link
//   this week is keeping score this week, and a stored value that overrode the
//   URL would silence the one person whose phone has the card on it.
//
//   A SPECTATOR IS NEVER NOTIFIED. The bare link is what gets forwarded to
//   wives, friends and group chats. A phone that buzzes because somebody opened
//   a link once is a phone that deletes the app.
//
// BASELINE. Against pre-build main (2123866) round-role.js does not exist, the
// require throws at load, and node reports the FILE as one failing test.
//
// MEASURED with a stub whose nine functions return undefined and whose constants
// are empty strings, over the FINISHED file, all 25 tests: 5 PASS / 20 FAIL. The
// module was restored by sha from a saved copy (2d570e9829a1cca9), never with git
// restore.
//
//   THE FIVE PASSES, and none of them is the feature. Three are "nothing
//   happens" cases a stub satisfies trivially - a group link is not asked, a
//   scorekeeper gets no note, and the name picker opens (it reads currentData
//   directly, not the module). The other two are source scans: the shell
//   membership and the declaration style, which describe a tree where the PAGE
//   was wired and the module was not.
//
//   The 20 reds are every rule: the role resolution, the notification gate, the
//   registration gate, read-only, all three sheet-versus-line decisions, the row
//   contents, the note, and the rest of section 3.
//
// RE-MEASURED after the arrival sheet was narrowed to multi-group rounds: this
// header was first written against a 17-test file.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const R = require('./round-role.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const FOUR = [{ id: 101, name: 'Marty' }, { id: 102, name: 'Dee' },
               { id: 103, name: 'Reese' }, { id: 104, name: 'Jimmy' }];
const EIGHT_P = FOUR.concat([{ id: 105, name: 'Ann' }, { id: 106, name: 'Bo' },
                             { id: 107, name: 'Cy' }, { id: 108, name: 'Di' }]);

// ===========================================================================
describe('1. THE ROLE A VIEWER IS IN', () => {

    test('three roles, named once', () => {
        assert.deepEqual(R.ROUND_ROLES, ['scorekeeper', 'playing', 'watching']);
    });

    test('A ?group= LINK IS THE SCOREKEEPER, AND OVERRIDES ANYTHING STORED', () => {
        assert.equal(R.roundRoleOf({ hasGroupLock: true }), 'scorekeeper');
        ['playing', 'watching', 'scorekeeper', '', 'nonsense'].forEach((stored) => {
            assert.equal(R.roundRoleOf({ hasGroupLock: true, stored }), 'scorekeeper',
                'stored "' + stored + '" beat the URL. A golfer who tapped "I\'m playing" last '
                + 'week and is sent a group link this week is keeping score this week - and '
                + 'silencing them would silence the one phone with the card on it.');
        });
    });

    test('a BARE link defaults to watching, and a stale stored scorekeeper does too', () => {
        assert.equal(R.roundRoleOf({}), 'watching');
        assert.equal(R.roundRoleOf({ stored: '' }), 'watching');
        assert.equal(R.roundRoleOf({ stored: 'nonsense' }), 'watching');
        assert.equal(R.roundRoleOf({ stored: 'scorekeeper' }), 'watching',
            'a stored scorekeeper with no ?group= is a stale answer - the link that made it is '
            + 'gone, and the role must not grant a scope the URL does not carry');
        assert.equal(R.roundRoleOf({ stored: 'playing' }), 'playing');
    });

    test('ONLY A PLAYING GOLFER IS NOTIFIED', () => {
        assert.equal(R.roundRoleWantsNotifications('playing'), true);
        assert.equal(R.roundRoleWantsNotifications('watching'), false,
            'the bare link is what gets forwarded to wives, friends and group chats');
        assert.equal(R.roundRoleWantsNotifications('scorekeeper'), false,
            'the scorekeeper is holding the card - a buzz for a bet they just entered is noise');
        assert.equal(R.roundRoleWantsNotifications('nonsense'), false);
    });

    test('AND A PLAYING GOLFER WITH NO NAME IS NOT ADDRESSABLE', () => {
        // A role with no name has nothing to attach a bet, a result or a hype
        // message to, so a token registered then could never be used.
        assert.equal(R.roundRoleCanRegister('playing', '101'), true);
        assert.equal(R.roundRoleCanRegister('playing', null), false);
        assert.equal(R.roundRoleCanRegister('playing', ''), false);
        assert.equal(R.roundRoleCanRegister('watching', '101'), false);
        assert.equal(R.roundRoleCanRegister('scorekeeper', '101'), false);
    });

    test('read-only is everyone except the scorekeeper - and NO role grants a write', () => {
        assert.equal(R.roundRoleIsReadOnly('playing'), true);
        assert.equal(R.roundRoleIsReadOnly('watching'), true);
        assert.equal(R.roundRoleIsReadOnly('scorekeeper'), false);
        const src = read('round-role.js').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
        ['canWritePlayer', 'db.ref', 'firebase'].forEach((bad) => assert.ok(!src.includes(bad),
            'round-role.js reaches for ' + bad + '. canWritePlayer() in index.html stays the one '
            + 'gate on a score - a second permission rule is a second answer to one question.'));
    });
});

// ===========================================================================
describe('2. WHAT THE ARRIVAL SHEET OFFERS', () => {

    test('a foursome gets all three - ONE GROUP IS STILL A CHOICE', () => {
        const rows = R.roundRoleChoices({ players: FOUR });
        assert.deepEqual(rows.map((r) => r.role), ['scorekeeper', 'playing', 'watching']);
        assert.equal(rows[0].title, 'Keep score for Group 1');
        assert.equal(rows[0].sub, 'Marty, Dee, Reese, Jimmy');
        assert.match(rows[1].title, /I'm playing \(not keeping score\)/);
        assert.equal(rows[2].title, 'Just watching');
        // Before this, a single-group round offered nothing at all and every
        // golfer landed on a writable card - which is how four people end up
        // typing over each other.
    });

    test('a multi-group round gets one scorekeeper row per group, in order', () => {
        const eight = FOUR.concat([{ id: 105, name: 'Ann' }, { id: 106, name: 'Bo' },
                                   { id: 107, name: 'Cy' }, { id: 108, name: 'Di' }]);
        const rows = R.roundRoleChoices({
            players: eight,
            boundaries: [{ group: 1, startIdx: 0, size: 4 }, { group: 2, startIdx: 4, size: 4 }]
        });
        assert.deepEqual(rows.map((r) => r.role), ['scorekeeper', 'scorekeeper', 'playing', 'watching']);
        assert.deepEqual(rows.filter((r) => r.group).map((r) => r.group), [1, 2]);
        assert.equal(rows[1].sub, 'Ann, Bo, Cy, Di');
    });

    test('NOTHING IS OFFERED to a group link, the organizer, or a retired round', () => {
        assert.deepEqual(R.roundRoleChoices({ players: FOUR, hasGroupLock: true }), []);
        assert.deepEqual(R.roundRoleChoices({ players: FOUR, isOrganizer: true }), [],
            'the organizer made the round - they are not joining it');
        assert.deepEqual(R.roundRoleChoices({ players: FOUR, superseded: true }), [],
            'a retired round shows the way to the live one instead');
    });

    test('an empty roster offers only Just watching, never a nameless pick', () => {
        const rows = R.roundRoleChoices({ players: [] });
        assert.deepEqual(rows.map((r) => r.role), ['watching'],
            '"I\'m playing" with no roster leads to a name picker with nothing in it');
    });

    test('THE BLOCKING SHEET IS FOR A MULTI-GROUP ROUND, which already had one', () => {
        // A multi-group round has asked "which group are you keeping score for?"
        // on the bare link since 2026-09-20, so two more rows change nothing
        // about when a golfer is interrupted. A SINGLE-GROUP ROUND HAS NEVER BEEN
        // INTERRUPTED: when it was, 39 guards went red - the byte-for-byte
        // arrival pins, three Chrome layout checks and the modal-layering tests -
        // because a foursome's bare link is how most of this app's checks and most
        // of its golfers arrive.
        const two = [{ group: 1, startIdx: 0, size: 4 }, { group: 2, startIdx: 4, size: 4 }];
        assert.equal(R.roundRoleShouldAsk({ players: EIGHT_P, boundaries: two }), true);
        assert.equal(R.roundRoleShouldAsk({ players: FOUR }), false,
            'a foursome gets the offer on a line, not in front of the card');
        [{ stored: 'playing' }, { stored: 'watching' }, { dismissed: true },
         { hasGroupLock: true }, { superseded: true }].forEach((over) => {
            assert.equal(R.roundRoleShouldAsk(Object.assign({ players: EIGHT_P, boundaries: two }, over)),
                false, JSON.stringify(over));
        });
        // THE OWNER IS NOT EXCLUDED, and that is a correction this guard records.
        // The first version skipped the sheet for the round's owner - "they made
        // it, they are not joining it" - and organizer_doors_after_picker_test.js
        // caught it: on a multi-group round the organizer is one of the golfers
        // and picks which group they keep score for, like everybody else. That
        // whole suite exists because the doors used to vanish when they answered.
        assert.equal(R.roundRoleShouldAsk({ players: EIGHT_P, boundaries: two, isOrganizer: true }), true,
            'the organizer must still be able to pick their group');
        assert.ok(R.roundRoleChoices({ players: EIGHT_P, boundaries: two, isOrganizer: true }).length > 0);
        // But the single-group LINE has nothing to offer them - they already hold
        // the whole card.
        assert.equal(R.roundRoleOfferLine({ players: FOUR, isOrganizer: true }), '');
        assert.deepEqual(R.roundRoleChoices({ players: FOUR, isOrganizer: true }), []);
        assert.equal(R.roundRoleShouldAsk({ players: [], boundaries: two }), false, 'nothing to join yet');
    });

    test('A FOURSOME IS OFFERED THE SAME CHOICE ON A LINE', () => {
        assert.equal(R.roundRoleOfferLine({ players: FOUR }), 'Keeping score, playing, or just watching?');
        assert.equal(R.roundRoleOfferLine({ players: FOUR, boundaries: [{ group: 1, startIdx: 0, size: 4 }, { group: 2, startIdx: 4, size: 4 }] }), '',
            'a multi-group round gets the sheet - offering both would ask twice');
        [{ stored: 'playing' }, { hasGroupLock: true }, { isOrganizer: true }, { superseded: true }]
            .forEach((over) => assert.equal(R.roundRoleOfferLine(Object.assign({ players: FOUR }, over)), '',
                JSON.stringify(over)));
        assert.equal(R.roundRoleOfferLine({ players: [] }), '');
    });

    test('the note explains the read-only card rather than leaving it looking broken', () => {
        assert.match(R.roundRoleNote('playing', 'Marty'), /^Following along as Marty\./);
        assert.match(R.roundRoleNote('playing', 'Marty'), /scorekeeper is entering the scores/);
        assert.match(R.roundRoleNote('playing', null), /Pick your name/);
        assert.match(R.roundRoleNote('watching'), /^Just watching\./);
        assert.equal(R.roundRoleNote('scorekeeper'), '',
            'the scorekeeper has score boxes - there is nothing to explain');
    });
});

// ===========================================================================
describe('3. THE PAGE, REACHED THE WAY A GOLFER REACHES IT', () => {

    // CLAUDE.md: a test that calls the renderer proves the renderer works. These
    // load index.html, set the data the listener sets, and read the DOM - the
    // sheet has to appear without anything here naming it.
    const IDX = ['score-marks.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
                 'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js',
                 'side-match-lines.js', 'push-notify.js', 'push-boot.js',
                 'round-role.js'];
    const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    // EIGHT GOLFERS WHERE A ?group= LINK HAS TO MEAN SOMETHING. On a foursome
    // there is one group and hasGroupLock stays false - measured - so a
    // four-player fixture cannot test the scorekeeper arm at all.
    const EIGHT = FOUR.concat([{ id: 105, name: 'Ann' }, { id: 106, name: 'Bo' },
                               { id: 107, name: 'Cy' }, { id: 108, name: 'Di' }]);
    // ARRIVES THE WAY A BROWSER DOES. index.html reads ?group= into hasGroupLock
    // at PARSE time (index.html:1945), so setting window.location.search after
    // the script has run reaches nothing - measured: ?group=1 on eight golfers
    // still gave hasGroupLock false. The harness takes the query up front for
    // exactly this reason, and a REAL localStorage too, because a test about what
    // is remembered cannot be written against a store that forgets.
    function arrive(search, players, seed) {
        const sb = loadHtmlInlineScript('index.html', IDX, {
            search: search, localStorage: true, seedStorage: seed || {}
        });
        const d = { players: players || FOUR, courseData: cd18, scores: {}, gameFormat: 'stroke' };
        vm.runInContext(`
            window.location.pathname='/index.html';
            currentMode='GFLBAM'; currentData=${JSON.stringify(d)};
            renderScorecard();
        `, sb);
        return sb;
    }
    const sheet = (sb) => sb.document.getElementById('group-pick-overlay');
    const sheetBody = (sb) => (sb.document.getElementById('group-pick-body').innerHTML || '');

    test('A BARE LINK ON A FOURSOME IS OFFERED THE CHOICE ON A LINE, not blocked by a sheet', () => {
        const sb = arrive('?game=GFLBAM');
        assert.notEqual(sheet(sb).style.display, 'flex',
            'a foursome must not be interrupted on arrival - that is how most golfers and most '
            + 'of this app\'s checks arrive, and 39 guards said so when it was');
        const note = sb.document.getElementById('role-note');
        assert.match(note.innerHTML, /Keeping score, playing, or just watching\?/);
        assert.match(note.innerHTML, /openRoleSheet\(\)/);
        // ITS OWN CLASS, NOT whoami-line-btn. It borrowed that one first, which
        // looks right and broke whoami_line_test.js: that suite taps
        // '.whoami-line-btn' nth 0, and this line renders ABOVE the card, so it
        // became the first one and the tap opened the role sheet instead of the
        // name picker. A shared class is a shared selector.
        assert.match(note.innerHTML, /class="role-offer-btn"/);
        assert.doesNotMatch(note.innerHTML, /whoami-line-btn/);
        assert.equal(note.style.display, 'block');
    });

    test('AND TAPPING THAT LINE OPENS THE SAME SHEET, with all three answers', () => {
        const sb = arrive('?game=GFLBAM');
        vm.runInContext('openRoleSheet();', sb);
        assert.equal(sheet(sb).style.display, 'flex', 'the line opened nothing');
        const body = sheetBody(sb);
        assert.match(body, /Keep score for Group 1/);
        assert.match(body, /playing \(not keeping score\)/);
        assert.match(body, /Just watching/);
        assert.match(body, /pickPlayingRole\(\)/, 'the playing row must be wired to the two-step flow');
    });

    test('A MULTI-GROUP BARE LINK IS STILL ASKED ON ARRIVAL, and now gets all three', () => {
        const sb = arrive('?game=GFLBAM', EIGHT_P);
        assert.equal(sheet(sb).style.display, 'flex', 'this round has asked on arrival since 2026-09-20');
        const body = sheetBody(sb);
        assert.match(body, /Keep score for Group 1/);
        assert.match(body, /Keep score for Group 2/);
        assert.match(body, /playing \(not keeping score\)/);
        assert.match(body, /Just watching/);
    });

    test('A GROUP LINK IS NEVER ASKED - it has already chosen', () => {
        const sb = arrive('?game=GFLBAM&group=1', EIGHT);
        assert.equal(vm.runInContext('hasGroupLock', sb), true, 'the fixture must actually be locked');
        assert.notEqual(sheet(sb).style.display, 'flex');
        assert.equal(sheetBody(sb), '');
    });

    test('"I\'M PLAYING" OPENS THE NAME PICKER, with every golfer in it', () => {
        const sb = arrive('?game=GFLBAM');
        vm.runInContext('pickPlayingRole();', sb);
        const pick = sb.document.getElementById('playing-pick-overlay');
        assert.equal(pick.style.display, 'flex', 'the name picker did not open');
        const body = sb.document.getElementById('playing-pick-body').innerHTML || '';
        FOUR.forEach((p) => assert.ok(body.includes(p.name), p.name + ' is not offered'));
        assert.equal((body.match(/pickPlayingMe\(/g) || []).length, 4);
        assert.notEqual(sheet(sb).style.display, 'flex', 'the first sheet must close behind it');
    });

    test('PICKING A NAME SETS THE ROLE AND THE GOLFER, and the card says so', () => {
        const sb = arrive('?game=GFLBAM');
        vm.runInContext("pickPlayingRole(); pickPlayingMe('102');", sb);
        assert.equal(vm.runInContext('currentRoundRole()', sb), 'playing');
        assert.equal(vm.runInContext('resolvedMeId()', sb), '102');
        const note = sb.document.getElementById('role-note');
        assert.match(note.textContent, /Following along as Dee/);
        assert.equal(note.style.display, 'block');
    });

    test('SKIPPING THE NAME DROPS TO WATCHING - it does not promise notifications', () => {
        const sb = arrive('?game=GFLBAM');
        vm.runInContext('pickPlayingRole(); skipPlayingPick();', sb);
        assert.equal(vm.runInContext('currentRoundRole()', sb), 'watching',
            'a playing golfer with no name gets nothing a spectator does not get, so leaving '
            + 'the role at "playing" would promise notifications that can never be addressed');
        assert.match(sb.document.getElementById('role-note').textContent, /Just watching/);
    });

    test('A SCOREKEEPER GETS NO NOTE - they have score boxes, there is nothing to explain', () => {
        const sb = arrive('?game=GFLBAM&group=1', EIGHT);
        assert.equal(vm.runInContext('hasGroupLock', sb), true);
        const note = sb.document.getElementById('role-note');
        assert.equal(note.textContent, '');
        assert.notEqual(note.style.display, 'block');
    });

    test('THE ANSWER SURVIVES A RELOAD - the sheet does not come back every load', () => {
        // Measured against a REAL store, because this is the whole point of
        // remembering it: before Wave 39 the dismissal was a session flag only,
        // and Wave 17 recorded the same defect about "Skip" - a golfer who
        // declined was asked again on every navigation between holes.
        const first = arrive('?game=GFLBAM');
        vm.runInContext("pickPlayingRole(); pickPlayingMe('103');", first);
        const again = arrive('?game=GFLBAM', FOUR,
            { 'golfapp_role_GFLBAM': 'playing', 'golfapp_me_GFLBAM': '103' });
        assert.notEqual(sheet(again).style.display, 'flex', 'the sheet asked again');
        assert.equal(vm.runInContext('currentRoundRole()', again), 'playing');
        assert.equal(vm.runInContext('resolvedMeId()', again), '103');
        assert.match(again.document.getElementById('role-note').textContent, /Following along as Reese/);
    });

    test('THE TOKEN IS REGISTERED FOR A PLAYING GOLFER AND NOBODY ELSE', () => {
        // The gate, read through the page's own predicate rather than asserted on
        // the module - this is what decides whether a phone gets registered.
        const sb = arrive('?game=GFLBAM');
        assert.equal(vm.runInContext("roundRoleCanRegister(currentRoundRole(), '101')", sb), false,
            'a spectator was registerable');
        vm.runInContext("pickPlayingRole(); pickPlayingMe('101');", sb);
        assert.equal(vm.runInContext("roundRoleCanRegister(currentRoundRole(), resolvedMeId())", sb), true);
        const locked = arrive('?game=GFLBAM&group=1', EIGHT);
        vm.runInContext("setMe('101');", locked);
        assert.equal(vm.runInContext("roundRoleCanRegister(currentRoundRole(), resolvedMeId())", locked), false,
            'the scorekeeper was registered - they are holding the card');
    });
});

// ===========================================================================
describe('4. IT SHIPS', () => {

    test('round-role.js is in the shell, in SHARED_SHELL, and index.html loads it', () => {
        assert.match(read('sw.js'), /'\.\/round-role\.js'/);
        const shared = /const SHARED_SHELL = \[([\s\S]*?)\];/.exec(read('sync-mobile-web.js'));
        assert.ok(shared && /'round-role\.js'/.test(shared[1]), 'not in SHARED_SHELL');
        assert.match(read('index.html'), /<script src="round-role\.js"><\/script>/);
    });

    test('plain var/function declarations, and no DOM', () => {
        const m = read('round-role.js');
        assert.doesNotMatch(m, /^\s*const round/m,
            'a const here collides with any page that re-declares the name');
        assert.doesNotMatch(m, /^\s*let round/m);
        const code = m.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
        ['document.', 'window.', 'localStorage'].forEach((bad) => assert.ok(!code.includes(bad),
            'round-role.js touches ' + bad + ' - the page owns the storage and the DOM'));
    });
});
