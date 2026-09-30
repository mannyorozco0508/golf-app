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


// ===== A ROSTER OF FORTY, AND TWENTY-SIX PLAYING (v261) ===================
//
// A real weekly game is not a foursome. It is forty to sixty names on a list, of
// which twenty-four to thirty-two turn up, and the organizer knows exactly who
// played last week and who has not been seen since June. THERE IS NO CAP on the
// roster; what there is instead is an order that puts the likely people first, so
// a long list is a few taps rather than a scroll.
//
//   LAST WEEK        start CHECKED. Whoever played the last round this group ran
//                    is the best guess at who is playing now, and unticking is
//                    faster than ticking.
//   REGULARS         three rounds or more, most-played first. Frequency is the
//                    only ordering that survives a list this long.
//   SOMETIMES        one or two rounds, and anyone just added who has not played
//                    yet - a new golfer is not "inactive", he is new.
//   INACTIVE         played, but not in about two months. COLLAPSED, NEVER
//                    DELETED: a winter absence is not a decision to remove
//                    somebody, and a roster that quietly loses people is worse
//                    than a long one.
//
// Nothing here deletes a member. Only an explicit removal does, and this file has
// no removal in it.
const MY_GROUP_INACTIVE_DAYS = 60;
const MY_GROUP_REGULAR_ROUNDS = 3;

function myGroupMemberRows(group) {
    const members = (group && group.members) || {};
    return Object.keys(members).map(k => ({
        key: k,
        name: members[k].name || '',
        hcp: String(members[k].hcp === undefined || members[k].hcp === null ? '' : members[k].hcp),
        flight: members[k].flight,
        playCount: Number(members[k].playCount) || 0,
        lastPlayedAt: Number(members[k].lastPlayedAt) || 0
    }));
}

// Sections, in the order they are shown, plus the keys that start ticked.
function myGroupSections(group, nowMs) {
    const now = Number(nowMs) || 0;
    const cutoff = now - MY_GROUP_INACTIVE_DAYS * 86400000;
    const rows = myGroupMemberRows(group);
    const lastKeys = ((group && group.lastRound && group.lastRound.keys) || []).map(String);
    const inLast = {};
    lastKeys.forEach(k => { inLast[k] = true; });

    const byFrequency = (a, b) => (b.playCount - a.playCount)
        || (b.lastPlayedAt - a.lastPlayedAt)
        || a.name.localeCompare(b.name);

    const lastWeek = rows.filter(r => inLast[r.key]).sort(byFrequency);
    const rest = rows.filter(r => !inLast[r.key]);
    // Inactive is about ABSENCE, so it needs a round to have been missed: a member
    // who has never played is new, not lapsed.
    const inactive = rest.filter(r => r.playCount > 0 && r.lastPlayedAt > 0 && r.lastPlayedAt < cutoff)
        .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt || a.name.localeCompare(b.name));
    const active = rest.filter(r => inactive.indexOf(r) === -1);
    const regulars = active.filter(r => r.playCount >= MY_GROUP_REGULAR_ROUNDS).sort(byFrequency);
    const sometimes = active.filter(r => r.playCount < MY_GROUP_REGULAR_ROUNDS).sort(byFrequency);

    const sections = [];
    if (lastWeek.length) sections.push({ id: 'last', label: 'Played last time', rows: lastWeek, collapsed: false });
    if (regulars.length) sections.push({ id: 'regulars', label: 'Regulars', rows: regulars, collapsed: false });
    if (sometimes.length) sections.push({ id: 'sometimes', label: 'Sometimes', rows: sometimes, collapsed: false });
    if (inactive.length) sections.push({ id: 'inactive', label: 'Inactive (not in ' + MY_GROUP_INACTIVE_DAYS + ' days)', rows: inactive, collapsed: true });
    return { sections: sections, checked: lastWeek.map(r => r.key) };
}

// A search box at the top of a forty-name list. Matches any word of the name, so
// "mar" finds Marty and Marcus and "h" finds Matt H.
function myGroupSearchFilter(rows, q) {
    const needle = String(q || '').trim().toLowerCase();
    if (needle === '') return (rows || []).slice();
    return (rows || []).filter(r => String(r.name || '').toLowerCase().split(/\s+/)
        .some(w => w.indexOf(needle) === 0) || String(r.name || '').toLowerCase().indexOf(needle) === 0);
}

// ===== HOW MANY GROUPS, AND OF WHAT SIZE =================================
//
// Twenty-six playing is six foursomes and a twosome, or five foursomes and two
// threesomes. Both are real answers and the organizer picks; the app does not
// decide for them. The chosen sizes feed grouping.js computeGroupSizes() through
// the wizard's own groupSizeOverrides, so nothing about grouping is reimplemented.
const SIZE_WORDS = { 1: 'single', 2: 'twosome', 3: 'threesome', 4: 'foursome', 5: 'fivesome' };

function describeSizes(sizes) {
    const counts = {};
    (sizes || []).forEach(n => { counts[n] = (counts[n] || 0) + 1; });
    return Object.keys(counts).map(Number).sort((a, b) => b - a).map(n => {
        const c = counts[n];
        const word = SIZE_WORDS[n] || ('group of ' + n);
        return c + ' ' + word + (c === 1 ? '' : 's');
    }).join(' + ');
}

function splitSuggestions(playing) {
    const n = Math.max(0, Math.floor(Number(playing) || 0));
    if (n < 2) return [];
    const out = [];
    const push = sizes => {
        if (sizes.some(x => x < 2)) return;                       // nobody plays alone
        if (sizes.reduce((a, b) => a + b, 0) !== n) return;
        const label = describeSizes(sizes);
        if (!out.some(o => o.label === label)) out.push({ sizes: sizes, label: label });
    };
    const q = Math.floor(n / 4), r = n % 4;
    // Math.max GUARDS THE SMALL FIELDS. Two playing has q = 0 and r = 2, so the
    // "one fewer foursome" variant asks for an array of length -1 - which threw
    // RangeError until it was measured on n = 2.
    const four = k => new Array(Math.max(0, k)).fill(4);
    if (r === 0) push(four(q));
    if (r === 1) { if (q >= 1) push(four(q - 1).concat([3, 2])); if (q >= 2) push(four(q - 2).concat([3, 3, 3])); }
    if (r === 2) { push(four(q).concat([2])); if (q >= 1) push(four(q - 1).concat([3, 3])); }
    if (r === 3) { push(four(q).concat([3])); if (q >= 1) push(four(q - 1).concat([3, 2, 2])); }
    // Threes all the way is a real club answer for a slow course, offered last.
    if (n % 3 === 0) push(new Array(n / 3).fill(3));
    return out.slice(0, 3);
}

// ===== WHAT A ROUND DOES TO THE GROUP ====================================
//
// Starting a round from a group is the only thing that makes somebody a regular,
// so the counts are written when the round is STARTED, from the ticked list. A
// member is never removed and a count never goes down.
function myGroupRoundUpdates(group, pickedKeys, nowMs) {
    const now = Number(nowMs) || 0;
    const members = (group && group.members) || {};
    const keys = (pickedKeys || []).map(String).filter(k => members[k]);
    const updates = {};
    keys.forEach(k => {
        updates['members/' + k + '/playCount'] = (Number(members[k].playCount) || 0) + 1;
        updates['members/' + k + '/lastPlayedAt'] = now;
    });
    updates['lastRound'] = { at: now, keys: keys };
    updates['updatedAt'] = now;
    return updates;
}

// ===== CO-ORGANIZERS, WITHOUT A BACKEND ==================================
//
// The owner types a co-organizer EMAIL. There is no way to look a uid up from an
// email in a client, and inventing a claim-code handshake for it would be a lot
// of machinery for one field - so the group stores the EMAIL, and the rules
// compare it against auth.token.email, which Firebase supplies for an
// email-linked account. A Realtime Database key cannot contain a dot, so the
// stored key is the email with dots as commas; the rule does the same swap with
// replace(), which RTDB rules support.
//
// DISCOVERY needs its own pointer, because a co-organizer cannot list another
// account subtree: sharedGroups/<emailKey>/<ownerUid>/<groupId> = true, readable
// only by the account whose email it is. See my_groups_test.js for the exact
// rules block, which is NOT published yet.
function coOrganizerKey(email) {
    return String(email || '').trim().toLowerCase().replace(/\./g, ',');
}
function coOrganizerEmail(key) {
    return String(key || '').replace(/,/g, '.');
}
function sharedGroupsPath(email) {
    return 'sharedGroups/' + coOrganizerKey(email);
}
function myGroupCanManage(group, uid, email) {
    if (!group) return false;
    if (uid && group.ownerUid && String(group.ownerUid) === String(uid)) return true;
    if (!email) return false;
    const co = group.coOrganizers || {};
    return co[coOrganizerKey(email)] === true;
}
function myGroupIsOwner(group, uid) {
    return !!(group && uid && group.ownerUid && String(group.ownerUid) === String(uid));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MY_GROUPS_MAX, MY_GROUPS_MAX_MEMBERS, myGroupsPath, myGroupMember, myGroupKey,
        buildMyGroupPayload, myGroupRoster, myGroupHandicapChanges, myGroupNewcomers,
        stripTrailingNote,
        MY_GROUP_INACTIVE_DAYS, MY_GROUP_REGULAR_ROUNDS,
        myGroupMemberRows, myGroupSections, myGroupSearchFilter,
        describeSizes, splitSuggestions, myGroupRoundUpdates,
        coOrganizerKey, coOrganizerEmail, sharedGroupsPath,
        myGroupCanManage, myGroupIsOwner
    };
}
