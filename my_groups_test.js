// ============================================================================
// MY GROUPS: THE WEEKLY FOURSOME, SAVED ONCE ON THE ACCOUNT (v260)
//
// An organizer types the same eight or twenty-four names, handicaps and A/B
// flights every week. The wizard remembered nothing between rounds and a phone
// remembers nothing another device can read.
//
// WHY THE ACCOUNT AND NOT THE DEVICE, said plainly because it decides the whole
// design: "works across Safari, the home-screen app and the App Store app" is
// only possible against a REAL sign-in. An anonymous uid is per-browser, so a
// group saved in Safari does not exist in the installed app, and localStorage
// does not cross those boundaries either. So the feature is gated on a linked
// (email-link) account and SAYS so, rather than saving something that silently
// will not be there.
//
// WHAT THE NEXT RULES PUBLISH MUST CARRY, and until it does every save is
// refused by the server - which is the correct failure, and the UI reports it:
//
//     "organizers": { "$uid": {
//         ".read":  "auth != null && auth.uid === $uid",
//         "groups": {
//           ".write": "auth != null && auth.uid === $uid",
//           "$groupId": {
//             ".validate": "newData.val() === null || newData.hasChildren(['name','members'])",
//             "name":      { ".validate": "newData.isString() && newData.val().length <= 60" },
//             "updatedAt": { ".validate": "newData.isNumber() && newData.val() <= now" },
//             "members":   { "$k": {
//                 ".validate": "newData.val() === null || newData.hasChild('name')",
//                 "name":   { ".validate": "newData.isString() && newData.val().length <= 60" },
//                 "hcp":    { ".validate": "newData.isString() && newData.val().length <= 8" },
//                 "flight": { ".validate": "newData.isString() && (newData.val() === 'A' || newData.val() === 'B')" }
//             } } } } } }
//
// The read rule already exists. Nothing else in the file moves, and no round,
// trip, season or tournament path is touched.
//
// HANDICAPS ARE USED AS ENTERED. "3.5", "+2", "11" are stored as the STRING the
// organizer typed and handed back the same way. handicap.js parses at the point
// of use and has always accepted those forms; rewriting one here would change a
// golfer's strokes on a round this feature has no business touching. Asserted
// below over all three forms.
//
// THE PASTE IMPORTER ALREADY EXISTED - flights, handicaps, group boundaries and
// a review screen with flagged lines - and the recon measured the one gap in it:
// "B Jimmy 11 (captain)" parsed to the NAME "Jimmy 11 (captain)" with NO
// handicap, because the note sat between the number and the end of the line.
// "A Paul 3.5" was always fine. A trailing bracketed note now comes off first
// and is REPORTED rather than dropped, so the review says what it ignored.
//
// THE RED BASELINE, measured against the FINAL file per CLAUDE.md's count rule,
// with my-groups.js removed from the repo and admin.html at main 4e35441, all 14
// tests:
//
//     0 PASS / 14 FAIL
//
// AND THE HONEST QUALIFICATION, because a clean sweep can flatter a wave: every one
// of the 14 is red, but the CONTROL is red for a LOAD reason rather than a behaviour
// one. Its dependency list names my-groups.js, which does not exist at the baseline,
// so admin.html cannot load at all. Measured DIRECTLY against main instead, with no
// dependency list, the control's claim holds exactly as it says:
//
//     "A Paul 3.5"            -> { name: 'Paul',               hcp: '3.5',  flight: 'A' }
//     "B Jimmy 11 (captain)"  -> { name: 'Jimmy 11 (captain)', hcp: '',     flight: 'B' }
//
// So the parser was already right about one of them and wrong about the other, which
// is the gap this wave closes - not a rewrite of a working parser.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
let G = null;
try { G = loadJsFile('my-groups.js'); } catch (e) { G = null; }
const need = () => { assert.ok(G, 'my-groups.js must exist and load as a plain global'); return G; };
const here = a => Array.from(a);
// The builder runs in a vm context, so its objects carry a DIFFERENT Object
// prototype and deepStrictEqual refuses them as "same structure, not
// reference-equal". Copied into this realm before any structural comparison.
const plain = v => JSON.parse(JSON.stringify(v));
const admin = () => loadHtmlInlineScript('admin.html', ['my-groups.js']);

describe('My Groups', () => {

    test('the store is the account subtree the organizer gate already owns', () => {
        const g = need();
        assert.equal(g.myGroupsPath('abc123'), 'organizers/abc123/groups');
        // The read rule exists today; the write rule is the one the next publish
        // must carry, and this test is where it is written down.
        const rules = JSON.parse(read('database.rules.json'));
        assert.equal(rules.rules.organizers.$uid['.read'], 'auth != null && auth.uid === $uid');
        assert.ok(!rules.rules.organizers.$uid.groups,
            'when groups gains its rule, update this test and the header block above');
        assert.match(read('my_groups_test.js'), /WHAT THE NEXT RULES PUBLISH MUST CARRY/);
    });

    test('a handicap is stored AS ENTERED - "3.5", "+2", "11" and a blank', () => {
        const g = need();
        const p = g.buildMyGroupPayload('Weekly', [
            { name: 'Paul', hcp: '3.5', flight: 'A' },
            { name: 'Randy', hcp: '+2' },
            { name: 'Jimmy', hcp: '11', flight: 'B' },
            { name: 'Tucker', hcp: '' }
        ], 1000);
        assert.equal(p.members.paul.hcp, '3.5');
        assert.equal(p.members.randy.hcp, '+2');
        assert.equal(p.members.jimmy.hcp, '11');
        assert.equal(p.members.tucker.hcp, '');
        assert.ok(Object.values(p.members).every(m => typeof m.hcp === 'string'),
            'never a parsed number: handicap.js parses at the point of use');
    });

    test('name, handicap and flight are what is kept, and a blank row is nobody', () => {
        const g = need();
        const p = g.buildMyGroupPayload('Weekly', [
            { name: 'Jimmy', hcp: '11', flight: 'B' }, { name: '  ', hcp: '' }, { name: '', hcp: '9' }
        ], 7);
        assert.deepEqual(here(Object.keys(p.members)), ['jimmy']);
        assert.deepEqual(plain(p.members.jimmy), { name: 'Jimmy', hcp: '11', flight: 'B' });
        assert.equal(p.updatedAt, 7);
        assert.equal(p.name, 'Weekly');
    });

    test('a duplicate name is ONE golfer, and the first wins', () => {
        const g = need();
        const p = g.buildMyGroupPayload('W', [{ name: 'Marty', hcp: '9' }, { name: 'marty ', hcp: '4' }], 1);
        assert.equal(Object.keys(p.members).length, 1);
        assert.equal(p.members.marty.hcp, '9');
    });

    test('ticking who is playing gives back only those, A flight first', () => {
        const g = need();
        const p = g.buildMyGroupPayload('W', [
            { name: 'Zed', hcp: '1', flight: 'A' }, { name: 'Ann', hcp: '2', flight: 'A' },
            { name: 'Bob', hcp: '3', flight: 'B' }, { name: 'Cal', hcp: '4' }
        ], 1);
        assert.deepEqual(here(g.myGroupRoster(p)).map(r => r.name), ['Ann', 'Zed', 'Bob', 'Cal']);
        assert.deepEqual(here(g.myGroupRoster(p, ['cal', 'ann'])).map(r => r.name), ['Ann', 'Cal']);
        const row = g.myGroupRoster(p, ['bob'])[0];
        assert.deepEqual(plain(row), { name: 'Bob', hcp: '3', team: '', playingForMoney: true, flight: 'B' });
    });

    test('a handicap edited on the round is offered back, and an unchanged one is not', () => {
        const g = need();
        const p = g.buildMyGroupPayload('W', [{ name: 'Marty', hcp: '9' }, { name: 'Paul', hcp: '3.5' }], 1);
        const changes = g.myGroupHandicapChanges(p, [{ name: 'Marty', hcp: '8' }, { name: 'Paul', hcp: '3.5' }]);
        assert.equal(changes.length, 1);
        assert.deepEqual(plain({ name: changes[0].name, from: changes[0].from, to: changes[0].to }),
            { name: 'Marty', from: '9', to: '8' });
        // STRINGS, because that is how they are stored and how they were typed.
        assert.equal(g.myGroupHandicapChanges(p, [{ name: 'Paul', hcp: '3.50' }]).length, 1,
            '"3.50" is a different entry from "3.5" - the organizer typed one of them');
    });

    test('a golfer the group does not hold is the "Add to your group?" list', () => {
        const g = need();
        const p = g.buildMyGroupPayload('W', [{ name: 'Marty', hcp: '9' }], 1);
        const add = g.myGroupNewcomers(p, [{ name: 'Marty', hcp: '9' }, { name: 'Tanner', hcp: '7' }, { name: '', hcp: '' }]);
        assert.deepEqual(here(add).map(a => a.name), ['Tanner']);
        assert.equal(g.myGroupNewcomers(p, [{ name: 'MARTY', hcp: '9' }]).length, 0,
            'the same golfer typed differently is not a newcomer');
    });

    test('PASTE: "B Jimmy 11 (captain)" reads the flight, the name AND the handicap', () => {
        const sb = admin();
        const r = sb.parsePlayerPasteText('B Jimmy 11 (captain)\nA Paul 3.5');
        assert.deepEqual(plain(r.validPlayers), [
            { name: 'Jimmy', hcp: '11', flight: 'B' },
            { name: 'Paul', hcp: '3.5', flight: 'A' }
        ]);
    });

    test('CONTROL "A Paul 3.5" already worked - this wave fixed a gap, not the parser', () => {
        const sb = admin();
        const r = sb.parsePlayerPasteText('A Paul 3.5');
        assert.deepEqual(plain(r.validPlayers), [{ name: 'Paul', hcp: '3.5', flight: 'A' }]);
    });

    test('PASTE: the note is REPORTED, not dropped on the floor', () => {
        const sb = admin();
        const r = sb.parsePlayerPasteText('B Jimmy 11 (captain)\nMarty 9 [sub]\nPaul 3.5');
        assert.deepEqual(here(r.notedLines).map(n => n.note), ['captain', 'sub']);
        assert.deepEqual(here(r.notedLines).map(n => n.lineNumber), [1, 2]);
        assert.match(read('admin.html'), /notedLines/, 'and the review screen can say so');
    });

    test('PASTE: a bracketed name is not mistaken for a note', () => {
        const sb = admin();
        // Nothing before the bracket means the bracket IS the name, so it is left alone.
        const r = sb.parsePlayerPasteText('(Guest) 12');
        assert.equal(r.validPlayers.length, 1);
        assert.match(r.validPlayers[0].name, /Guest/);
    });

    test('the wizard offers My Groups, and it is gated on a real sign-in', () => {
        const src = read('admin.html');
        assert.match(src, /onclick="openMyGroupsModal\(\)"/, 'the button is on the Players step');
        assert.match(src, /<script src="my-groups\.js"><\/script>/, 'and the page loads the builder');
        const fn = src.slice(src.indexOf('function myGroupsUid'), src.indexOf('function closeMyGroupsModal'));
        assert.match(fn, /isAnonymous === false/, 'an anonymous uid is per-browser and will not follow a golfer');
        assert.match(fn, /u\.email/);
        const open = src.slice(src.indexOf('async function openMyGroupsModal'), src.indexOf('function renderMyGroupsBody'));
        assert.match(open, /Sign in with your email first/, 'and it says why rather than failing quietly');
    });

    test('the prefill goes through the wizard own pipeline, not a second one', () => {
        const src = read('admin.html');
        const fn = src.slice(src.indexOf('function applyMyGroupPicks'), src.indexOf('async function saveRosterAsMyGroup'));
        ['captureCurrentPlayerInputs()', 'appendPlayerFrom(', 'renderPlayerListHeaderAndWarning(',
            'setFlightsEnabled(true)', 'updateCount()'].forEach(call =>
                assert.ok(fn.includes(call), 'the prefill must reuse ' + call));
        assert.ok(!/addPlayerRow\(/.test(fn), 'and must not hand-roll a row');
    });

    test('a refused write is reported, and creating a round never depends on one', () => {
        const src = read('admin.html');
        const save = src.slice(src.indexOf('async function saveRosterAsMyGroup'), src.indexOf('async function syncMyGroupFromRoster'));
        assert.match(save, /uiFail\('Could not save the group/, 'the server refusal is shown, not swallowed');
        const sync = src.slice(src.indexOf('async function syncMyGroupFromRoster'), src.indexOf('// Appends parsed players'));
        assert.match(sync, /uiConfirm\(/, 'nothing is written to the account without being asked');
        // The round-creating path must not call any of this.
        const create = src.slice(src.indexOf('async function saveRound'), src.indexOf('async function saveRound') + 6000);
        ['syncMyGroupFromRoster', 'saveRosterAsMyGroup'].forEach(f =>
            assert.ok(!create.includes(f + '('), 'saveRound must not depend on an account write (' + f + ')'));
    });
});
