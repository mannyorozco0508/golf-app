// ============================================================================
// MY GROUPS - the weekly foursome, saved once on the ACCOUNT (v260)
//
// THE PROBLEM. An organizer types the same eight or twenty-four names, with the
// same handicaps and the same A/B flights, every single week. The wizard has
// remembered nothing between rounds, and a phone remembers nothing another
// device can read.
//
// WHY THE ACCOUNT AND NOT THE DEVICE. "Works across Safari, the home-screen app
// and the App Store app" is only possible against a real sign-in: an ANONYMOUS
// uid is per-browser, so a group saved in Safari does not exist in the installed
// app, and localStorage does not cross those boundaries either. So My Groups is
// gated on a LINKED account (email link) and says so rather than saving
// something that silently will not be there.
//
// WHERE IT LIVES. organizers/<uid>/groups/<groupId>, beside the firstSeenAt the
// organizer gate already writes. That subtree is already read-restricted to its
// own uid in database.rules.json; the WRITE rule for `groups` does NOT exist yet
// and must ship in the next rules publish - see HANDOFF.md. Until it does, every
// save here is refused by the server, which is the correct failure: nothing is
// written and the caller is told.
//
// HANDICAPS ARE STORED AS ENTERED. "3.5", "+2", "11" - the string the organizer
// typed, never a parsed number. handicap.js parses at the point of USE and has
// always accepted those forms; rewriting them here would change a golfer's
// strokes on a round that is not this feature's business.
// ============================================================================
'use strict';

const MY_GROUPS_MAX = 20;          // saved groups per account
const MY_GROUPS_MAX_MEMBERS = 60;  // golfers in one saved group

function myGroupsPath(uid) {
    return 'organizers/' + String(uid) + '/groups';
}

// A stored member. The handicap is the TYPED STRING, trimmed only of whitespace.
function myGroupMember(row) {
    const name = String((row && row.name) || '').trim();
    const hcp = String((row && (row.hcp !== undefined && row.hcp !== null ? row.hcp : '')) || '').trim();
    const flight = (row && (row.flight === 'A' || row.flight === 'B')) ? row.flight : undefined;
    const m = { name: name, hcp: hcp };
    if (flight) m.flight = flight;
    return m;
}

// A stable key per member, so a tick list and a handicap write-back address the
// same golfer across rounds. Names are what an organizer actually types, so the
// key is the name folded - case and spacing - and NOT the round's player id,
// which is issued per round and never survives one.
function myGroupKey(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// The whole group, ready to write. Members keyed so a single golfer can be
// updated without rewriting the roster.
function buildMyGroupPayload(groupName, rows, now) {
    const members = {};
    let n = 0;
    (rows || []).forEach(row => {
        const m = myGroupMember(row);
        if (!m.name) return;                       // a blank row is nobody
        const k = myGroupKey(m.name);
        if (members[k]) return;                    // first one wins; a duplicate name is one golfer
        if (n >= MY_GROUPS_MAX_MEMBERS) return;
        members[k] = m; n += 1;
    });
    return {
        name: String(groupName || '').trim() || 'My Group',
        updatedAt: Number(now) || 0,
        members: members
    };
}

// Saved group -> wizard rows, for the ticked members only. Order is the group's
// own (A flight first, then B, then unlettered, each alphabetical) so a prefilled
// roster reads the way the saved group reads.
function myGroupRoster(group, pickedKeys) {
    const members = (group && group.members) || {};
    const want = pickedKeys ? pickedKeys.map(k => String(k)) : Object.keys(members);
    const rank = m => (m.flight === 'A' ? 0 : (m.flight === 'B' ? 1 : 2));
    return want
        .filter(k => members[k])
        .map(k => Object.assign({ key: k }, members[k]))
        .sort((a, b) => (rank(a) - rank(b)) || a.name.localeCompare(b.name))
        .map(m => {
            const row = { name: m.name, hcp: m.hcp, team: '', playingForMoney: true };
            if (m.flight) row.flight = m.flight;
            return row;
        });
}

// WHAT THE ROUND CHANGED. A handicap edited in the wizard is the organizer's new
// truth for that golfer, so it goes back to the group - but only when it really
// differs, and only for golfers the group already holds. Compared as STRINGS,
// because that is how they are stored: "3.5" and "3.50" are different entries and
// the organizer typed one of them.
function myGroupHandicapChanges(group, rows) {
    const members = (group && group.members) || {};
    const out = [];
    (rows || []).forEach(row => {
        const m = myGroupMember(row);
        if (!m.name) return;
        const k = myGroupKey(m.name);
        const was = members[k];
        if (!was) return;
        const from = String(was.hcp || '').trim();
        const to = m.hcp;
        if (from === to) return;
        out.push({ key: k, name: m.name, from: from, to: to, flight: m.flight || was.flight });
    });
    return out;
}

// Golfers on the round who are not in the saved group - the "Add to your group?"
// list. A blank row is nobody and is never offered.
function myGroupNewcomers(group, rows) {
    const members = (group && group.members) || {};
    const seen = {};
    const out = [];
    (rows || []).forEach(row => {
        const m = myGroupMember(row);
        if (!m.name) return;
        const k = myGroupKey(m.name);
        if (members[k] || seen[k]) return;
        seen[k] = 1;
        out.push(Object.assign({ key: k }, m));
    });
    return out;
}

// One line of a pasted list, with a trailing note in brackets taken off before
// the handicap is read.
//
// MEASURED: "B Jimmy 11 (captain)" parsed to the NAME "Jimmy 11 (captain)" with
// NO handicap, because the note sat between the number and the end of the line.
// "A Paul 3.5" was always fine. The note is returned rather than dropped on the
// floor, so the review screen can say what it ignored.
function stripTrailingNote(line) {
    const m = /^(.*?)\s*[\(\[]([^\)\]]{1,40})[\)\]]\s*$/.exec(String(line || ''));
    if (!m || m[1].trim() === '') return { text: String(line || ''), note: '' };
    return { text: m[1].trim(), note: m[2].trim() };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MY_GROUPS_MAX, MY_GROUPS_MAX_MEMBERS, myGroupsPath, myGroupMember, myGroupKey,
        buildMyGroupPayload, myGroupRoster, myGroupHandicapChanges, myGroupNewcomers,
        stripTrailingNote
    };
}
