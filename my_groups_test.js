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
//             // A CO-ORGANIZER IS AN EMAIL, not a uid: a client cannot look a uid up
//             // from an email, and auth.token.email is what Firebase gives an
//             // email-linked account. A database key cannot hold a dot, so the stored
//             // key is the email with dots as commas and the rule does the same swap.
//             // A deeper .read GRANTS - it never revokes the uid-only parent - so this
//             // opens exactly one group to exactly the named people.
//             ".read":  "auth != null && (auth.uid === $uid || (auth.token.email != null && data.child('coOrganizers/' + auth.token.email.toLowerCase().replace('.', ',')).val() === true))",
//             ".write": "auth != null && (auth.uid === $uid || (auth.token.email != null && data.child('coOrganizers/' + auth.token.email.toLowerCase().replace('.', ',')).val() === true))",
//             ".validate": "newData.val() === null || newData.hasChildren(['name','members'])",
//             "name":      { ".validate": "newData.isString() && newData.val().length <= 60" },
//             "ownerUid":  { ".validate": "newData.isString() && newData.val() === $uid" },
//             "createdAt": { ".validate": "newData.isNumber() && newData.val() <= now" },
//             "updatedAt": { ".validate": "newData.isNumber() && newData.val() <= now" },
//             // Only the OWNER may change who the co-organizers are.
//             "coOrganizers": { ".write": "auth != null && auth.uid === $uid",
//                 "$emailKey": { ".validate": "newData.val() === true || newData.val() === null" } },
//             "lastRound": { "at":   { ".validate": "newData.isNumber() && newData.val() <= now" },
//                            "keys": { ".validate": "newData.hasChildren() || newData.val() === null" } },
//             "members":   { "$k": {
//                 ".validate": "newData.val() === null || newData.hasChild('name')",
//                 "name":         { ".validate": "newData.isString() && newData.val().length <= 60" },
//                 "hcp":          { ".validate": "newData.isString() && newData.val().length <= 8" },
//                 "flight":       { ".validate": "newData.isString() && (newData.val() === 'A' || newData.val() === 'B')" },
//                 "playCount":    { ".validate": "newData.isNumber() && newData.val() >= 0" },
//                 "lastPlayedAt": { ".validate": "newData.isNumber() && newData.val() <= now" }
//             } } } } } },
//
//     // DISCOVERY. A co-organizer cannot list another account subtree - and must
//     // not be able to - so the owner drops a pointer where only the invited email
//     // can read it. Nobody can read anybody else's.
//     "sharedGroups": { "$emailKey": {
//         ".read": "auth != null && auth.token.email != null && $emailKey === auth.token.email.toLowerCase().replace('.', ',')",
//         "$ownerUid": { "$groupId": {
//             ".write":    "auth != null && auth.uid === $ownerUid",
//             ".validate": "newData.val() === true || newData.val() === null"
//         } } } }
//
// The organizers read rule already exists; everything else above is new.
// sharedGroups is a new top-level key. No round, trip, season or tournament path
// is touched, and nothing an unauthenticated scorekeeper writes is affected.
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
// with my-groups.js removed from the repo and admin.html at main 3107de7, all 24
// tests:
//
//     1 PASS / 23 FAIL
//
// THE ONE THAT PASSES is the rules check - organizers/$uid/groups and sharedGroups
// are both still absent from database.rules.json, which is the point of it: it is
// green now and goes RED the day either rule lands, pointing back at the header
// block above and at HANDOFF.md. A note nothing enforces is how a stale note
// happens.
//
// AND THE HONEST QUALIFICATION. Almost every red is a behaviour red, but the paste
// CONTROL is red for a LOAD reason: its dependency list names my-groups.js, which
// does not exist at the baseline, so admin.html cannot load at all. Measured
// DIRECTLY against main with no dependency list, the control's claim holds exactly:
//
//     "A Paul 3.5"            -> { name: 'Paul',               hcp: '3.5',  flight: 'A' }
//     "B Jimmy 11 (captain)"  -> { name: 'Jimmy 11 (captain)', hcp: '',     flight: 'B' }
//
// So the parser was already right about one and wrong about the other, which is the
// gap this wave closes - not a rewrite of a working parser.
//
// (An earlier draft of this header said 0/14 at 14 tests. The arithmetic guard from
// Wave 27 caught it the moment ten tests were added for the v261 extension, and the
// figure above is the re-measurement the count rule asks for.)
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
        // The read rule exists today; everything else is in the header block above,
        // and the test below asserts it has not landed yet.
        const rules = JSON.parse(read('database.rules.json'));
        assert.equal(rules.rules.organizers.$uid['.read'], 'auth != null && auth.uid === $uid');
        assert.match(read('my_groups_test.js'), /WHAT THE NEXT RULES PUBLISH MUST CARRY/);
        assert.equal(g.sharedGroupsPath('a@b.com'), 'sharedGroups/a@b,com');
    });

    test('the rules the next publish must carry are ABSENT, so the note cannot go stale', () => {
        const rules = JSON.parse(read('database.rules.json'));
        assert.ok(!rules.rules.organizers.$uid.groups, 'organizers/$uid/groups has no rule yet');
        assert.ok(!rules.rules.sharedGroups, 'sharedGroups does not exist yet');
        // The day either one lands, this test goes red and points at the header and
        // HANDOFF.md, which is the only way a note like that stays true.
        assert.match(read('HANDOFF.md'), /organizers\/\$uid\/groups/);
    });

    test('A ROSTER OF FORTY: last time ticked, regulars by frequency, inactive collapsed', () => {
        const g = need();
        const NOW = Date.UTC(2026, 8, 29), D = 86400000;
        const group = {
            name: 'Thursday', lastRound: { at: NOW - 7 * D, keys: ['marty', 'paul'] },
            members: {
                marty: { name: 'Marty', hcp: '9', playCount: 12, lastPlayedAt: NOW - 7 * D },
                paul: { name: 'Paul', hcp: '3.5', playCount: 5, lastPlayedAt: NOW - 7 * D },
                scott: { name: 'Scott', hcp: '6', playCount: 9, lastPlayedAt: NOW - 14 * D },
                carl: { name: 'Carl', hcp: '6', playCount: 4, lastPlayedAt: NOW - 21 * D },
                tj: { name: 'Tj', hcp: '10', playCount: 2, lastPlayedAt: NOW - 21 * D },
                glen: { name: 'Glen', hcp: '10', playCount: 7, lastPlayedAt: NOW - 100 * D },
                newguy: { name: 'Newguy', hcp: '8', playCount: 0, lastPlayedAt: 0 }
            }
        };
        const s = g.myGroupSections(group, NOW);
        assert.deepEqual(here(s.checked), ['marty', 'paul'], 'last time starts ticked');
        const byId = {};
        here(s.sections).forEach(x => { byId[x.id] = x; });
        assert.deepEqual(here(byId.last.rows).map(r => r.name), ['Marty', 'Paul']);
        assert.deepEqual(here(byId.regulars.rows).map(r => r.name), ['Scott', 'Carl'], 'most rounds first');
        assert.deepEqual(here(byId.sometimes.rows).map(r => r.name), ['Tj', 'Newguy'],
            'a golfer who has never played is NEW, not lapsed');
        assert.deepEqual(here(byId.inactive.rows).map(r => r.name), ['Glen']);
        assert.equal(byId.inactive.collapsed, true, 'inactive is collapsed');
        assert.equal(byId.last.collapsed, false);
        // NEVER DELETED: every member is in exactly one section, none is dropped.
        const shown = here(s.sections).reduce((n, x) => n + x.rows.length, 0);
        assert.equal(shown, Object.keys(group.members).length);
    });

    test('there is no cap on the roster', () => {
        const g = need();
        const rows = Array.from({ length: 64 }, (_, i) => ({ name: 'Golfer ' + i, hcp: String(i % 20) }));
        const p = g.buildMyGroupPayload('Big', rows, 1);
        assert.ok(Object.keys(p.members).length >= 60,
            'a sixty-name roster is a normal weekly game, not an edge case: got '
            + Object.keys(p.members).length);
    });

    test('the search box finds a golfer by any word of the name', () => {
        const g = need();
        const rows = [{ name: 'Marty Stone' }, { name: 'Marcus Webb' }, { name: 'Matt H' }, { name: 'Paul Reed' }];
        assert.deepEqual(here(g.myGroupSearchFilter(rows, 'mar')).map(r => r.name), ['Marty Stone', 'Marcus Webb']);
        assert.deepEqual(here(g.myGroupSearchFilter(rows, 'h')).map(r => r.name), ['Matt H']);
        assert.deepEqual(here(g.myGroupSearchFilter(rows, 'reed')).map(r => r.name), ['Paul Reed']);
        assert.equal(g.myGroupSearchFilter(rows, '').length, 4, 'an empty box hides nobody');
    });

    test('26 playing is offered as six foursomes and a twosome, OR five and two threes', () => {
        const g = need();
        assert.deepEqual(here(g.splitSuggestions(26)).map(o => o.label),
            ['6 foursomes + 1 twosome', '5 foursomes + 2 threesomes']);
        assert.deepEqual(here(g.splitSuggestions(24)).map(o => o.label)[0], '6 foursomes');
        assert.deepEqual(here(g.splitSuggestions(32)).map(o => o.label), ['8 foursomes']);
        // Every suggestion tiles the field exactly, and nobody plays alone.
        for (let n = 2; n <= 64; n++) {
            here(g.splitSuggestions(n)).forEach(o => {
                assert.equal(o.sizes.reduce((a, b) => a + b, 0), n, n + ': ' + o.label);
                assert.ok(o.sizes.every(x => x >= 2), n + ': nobody plays alone');
            });
        }
        assert.deepEqual(here(g.splitSuggestions(2)).map(o => o.label), ['1 twosome'],
            'two playing threw RangeError until it was measured');
        assert.equal(g.splitSuggestions(1).length, 0);
    });

    test('the chosen split feeds grouping.js, and is not a second grouping rule', () => {
        const g = need();
        const G = loadJsFile('grouping.js');
        here(g.splitSuggestions(26)).forEach(o => {
            const overrides = {};
            o.sizes.forEach((sz, i) => { overrides[i] = sz; });
            assert.deepEqual(here(G.computeGroupSizes(26, overrides)), o.sizes,
                o.label + ' must survive grouping.js unchanged');
        });
        const src = read('admin.html');
        const fn = src.slice(src.indexOf('async function applyMyGroupPicks'), src.indexOf('async function saveRosterAsMyGroup'));
        assert.match(fn, /groupSizeOverrides\[i\] = sz/, 'the split goes through the wizard own overrides');
        assert.ok(!/function computeGroupSizes/.test(read('my-groups.js')), 'grouping is not reimplemented');
    });

    test('starting a round records who played, and never removes anybody', () => {
        const g = need();
        const group = { members: { a: { name: 'A', hcp: '1', playCount: 3, lastPlayedAt: 5 }, b: { name: 'B', hcp: '2' } } };
        const u = g.myGroupRoundUpdates(group, ['a', 'b', 'ghost'], 999);
        assert.equal(u['members/a/playCount'], 4);
        assert.equal(u['members/b/playCount'], 1);
        assert.equal(u['members/a/lastPlayedAt'], 999);
        assert.deepEqual(here(u.lastRound.keys), ['a', 'b'], 'a key the group does not hold is ignored');
        assert.ok(!Object.keys(u).some(k => /null|remove|delete/.test(k)), 'nothing is deleted');
    });

    test('a co-organizer is an EMAIL, and only the owner and they can manage the group', () => {
        const g = need();
        assert.equal(g.coOrganizerKey(' A.Person@Gmail.com '), 'a,person@gmail,com');
        assert.equal(g.coOrganizerEmail('a,person@gmail,com'), 'a.person@gmail.com');
        assert.equal(g.sharedGroupsPath('A.Person@Gmail.com'), 'sharedGroups/a,person@gmail,com');
        const group = { ownerUid: 'u1', coOrganizers: { 'a,person@gmail,com': true } };
        assert.equal(g.myGroupCanManage(group, 'u1', 'owner@x.com'), true, 'the owner');
        assert.equal(g.myGroupCanManage(group, 'u2', 'A.Person@gmail.com'), true, 'the co-organizer, case-insensitively');
        assert.equal(g.myGroupCanManage(group, 'u3', 'someone@else.com'), false, 'nobody else');
        assert.equal(g.myGroupIsOwner(group, 'u2'), false, 'and a co-organizer is not the owner');
    });

    test('PRIVACY: the panel reads only this account groups and the ones shared with it', () => {
        const src = read('admin.html');
        const fn = src.slice(src.indexOf('async function openMyGroupsModal'), src.indexOf('function myGroupsAllEntries'));
        assert.match(fn, /myGroupsPath\(u\.uid\)/, 'its own subtree');
        assert.match(fn, /sharedGroupsPath\(u\.email\)/, 'and the pointer only its own email can read');
        assert.ok(!/db\.ref\(.organizers.\)/.test(fn), 'it never lists the organizers root');
        const inv = src.slice(src.indexOf('async function inviteCoOrganizer'), src.indexOf('async function removeCoOrganizer'));
        assert.match(inv, /myGroupIsOwner\(g, u\.uid\)/, 'only the owner may invite');
    });

    test('a brand-new account is told what a group is and given two ways in', () => {
        const src = read('admin.html');
        const fn = src.slice(src.indexOf('function myGroupListHtml'), src.indexOf('function myGroupPickerHtml'));
        assert.match(fn, /Create your first group/);
        assert.match(fn, /Paste a list of players/);
        assert.match(fn, /Type them in on this page/);
        assert.match(fn, /A group is your list of golfers/, 'it explains itself with no help needed');
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
        const fn = src.slice(src.indexOf('function myGroupsUser'), src.indexOf('function myGroupAt'));
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
