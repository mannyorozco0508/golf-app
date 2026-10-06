// ============================================================================
// A LEGACY EVENT KEEPS ITS HANDOUT; AN OWNED EVENT HIDES IT
// (Tournaments Wave 1 follow-up, Manny 2026-10-06)
//
// A3 hid the scoring links, their QR codes and the print buttons from anyone
// who is not the owner. A record created before organizer sign-in has NO
// ownerUid, so canManage() is false for everybody and the hide left those
// events with no way to hand out a card at all. They are fully open anyway -
// nobody owns them - so the handout stays visible to everyone there. An OWNED
// event keeps the A3 hide for a signed-in stranger and a signed-out visitor.
//
// WHAT mini-dom CAN AND CANNOT PROVE: display on the block, and that the rows
// are rendered inside it - not geometry. tools/tournament-spectator-check.js
// measures the same two arms in Chrome (a legacy arm with rects, an owned
// stranger arm with none).
//
// BASELINE over the FINISHED file, all 4 tests: measured against ec949b7
// (A1 to A9, before this follow-up), tournament.html as committed there:
//
//   2 PASS / 2 FAIL / 4 tests.   2 + 2 = 4.
//
// THE TWO THAT PASS are the owned-event arms, which A3 already made true; the
// two legacy arms are the red ones this follow-up turns green.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const STRANGER = { uid: 'u-who', email: 'who@example.com', isAnonymous: false };
function rec(owned) {
    const r = { name: 'Old Scramble', format: 'scramble', courseName: 'C', courseData: COURSE, entryFee: 0, createdAt: 1,
        teams: { team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Bo'], handicap: 0 } } };
    if (owned) r.ownerUid = 'u-org';
    return r;
}
function arrive(r, user) {
    const sb = loadHtmlInlineScript('tournament.html', [], { search: '?tourney=LEG1' });
    sb.__dbHandlers.filter((x) => x.event === 'value' && /tournaments\/LEG1$/.test(x.path))
        .forEach((x) => x.cb({ val: () => JSON.parse(JSON.stringify(r)), exists: () => true }));
    if (user) sb.__auth.setUser(user);
    return sb;
}
const el = (sb, id) => sb.document.getElementById(id);
const rows = (sb) => (String(el(sb, 'team-links-list').innerHTML).match(/data-share-url=/g) || []).length;
const qrs = (sb) => (String(el(sb, 'team-links-list').innerHTML).match(/class="team-qr"/g) || []).length;

describe('legacy event (no ownerUid)', () => {
    test('signed out: the links, QR codes and print buttons are visible', () => {
        const sb = arrive(rec(false), null);
        assert.equal(rows(sb), 2, 'the rows did not render');
        assert.equal(qrs(sb), 2);
        assert.notEqual(el(sb, 'lb-owner-tools').style.display, 'none', 'the handout is hidden on an event nobody owns');
    });
    test('signed in as anybody: the same', () => {
        const sb = arrive(rec(false), STRANGER);
        assert.equal(rows(sb), 2);
        assert.notEqual(el(sb, 'lb-owner-tools').style.display, 'none');
    });
});

describe('owned event', () => {
    test('a signed-in stranger sees 0: the block is hidden (rows still in the tree)', () => {
        const sb = arrive(rec(true), STRANGER);
        assert.equal(rows(sb), 2, 'the rows were removed, not hidden');
        assert.equal(el(sb, 'lb-owner-tools').style.display, 'none');
    });
    test('signed out: the same', () => {
        const sb = arrive(rec(true), null);
        assert.equal(el(sb, 'lb-owner-tools').style.display, 'none');
        assert.equal(qrs(sb), 2);
    });
});
