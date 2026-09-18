// ============================================================================
// THE DESK, WAVE 2c: ITS OWN TAB, COUNTS, FILTERS + SEARCH, THE DUPLICATE FLAG.
// Scoped to event day. Render-side only - NO rules change, NO new key.
//
// WHAT 2c IS. Measured on 2026-09-17 (rattle-recon-desk): 141 signups rendered as
// a 21,240 px list sitting ABOVE Starting Holes and every other Setup control,
// with no count, no filter, no search and no duplicate handling. This wave:
//
//   1. The desk gets its own tab, "Desk", between Setup and Leaderboard. Setup
//      KEEPS the configuration (the "Ask golfers for" switches, the signup URL,
//      Share); the Desk holds the operation (counts, chips, search, rows). The
//      manage gate takes BOTH tabs from anyone who is not the owner.
//   2. Counts: "N signups · N paid · N in the field", dinner guests, shirts by
//      size, "N of M gave a shirt size", and fees - on an INDIVIDUAL event the
//      total (N paid x entryFee, the fee is per golfer); on a TEAM event NO total,
//      because the fee is per TEAM (tournament.html 'Entry Fee per Team') and the
//      desk does not know who is on whose team until approval - the line says so.
//   3. Filter chips (all | unpaid | paid | approved | not yet approved) with live
//      counts, and a name/email search. Both live OUTSIDE #registration-list: the
//      search is static markup the renderer never rewrites, so a signup landing
//      mid-search cannot wipe the text (tools/tournament-desk-check.js delivers a
//      snapshot mid-search in Chrome and proves it).
//   4. The duplicate flag: same email, or same fullName case-insensitively with
//      whitespace collapsed, marks BOTH rows. Flag only - no merge, no hide.
//
// Sort stays createdAt ascending. Paid and Approve are unchanged.
//
// HARNESS. helpers/mini-dom.js: innerHTML is a string, so rows are counted by
// their class in the markup; static attributes are not parsed, so the search
// box's value is set on the element and the page's own oninput is fired. The
// gate is exercised through the page's own value handler and auth callback, the
// way tournament_signin_gate_test.js does. Geometry and real taps are Chrome's
// job (tools/tournament-desk-check.js).
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { deskEntries, TOTALS } = require('./helpers/registration-desk-fixture.js');

const PAGE = 'tournament.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read(PAGE);
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

function teamRecord(overrides) {
    return Object.assign({
        name: 'Desk Scramble', format: 'scramble', courseName: 'Cameron', activeCourseKey: 'cameron',
        courseData: COURSE, entryFee: 400, createdAt: 1, ownerUid: 'u-org',
        teams: {
            team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0 },
            team2: { num: 2, name: 'Hawks', players: ['Cal Charlie'], handicap: 0 }
        }
    }, overrides || {});
}
function individualRecord(overrides) {
    return Object.assign({
        name: 'Desk Individual', format: 'individual', scoringModel: 'player-v1', scoringMode: 'net',
        courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 100, createdAt: 1,
        ownerUid: 'u-org', teams: {}, players: { p0: { id: 'p0', name: 'Ann Alpha', handicap: '8', addedAt: 1 } }
    }, overrides || {});
}

// The page's own value handler and auth callback, in either order.
function arrive(rec, user, order) {
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=DESK1' });
    if (order === 'user-first') sb.__auth.setUser(user);
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value' && /tournaments\/DESK1$/.test(h.path));
    assert.ok(handlers.length > 0, 'the page registered no value handler for the tournament');
    handlers.forEach(h => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    if (order !== 'user-first') sb.__auth.setUser(user);
    return sb;
}
function fireRegistrations(sb, data) {
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value' && /registrations\/DESK1$/.test(h.path));
    assert.ok(handlers.length > 0, 'the owner page registered no registrations listener');
    handlers.forEach(h => h.cb({ val: () => (data == null ? null : JSON.parse(JSON.stringify(data))), exists: () => data != null }));
}
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => { const e = el(sb, id); return e ? String(e.innerHTML || '') : null; };
const count = (s, re) => (String(s || '').match(re) || []).length;
const rows = (sb) => count(html(sb, 'registration-list'), /class="reg-row"/g);
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
// Typing: the value lands on the element and the page's own oninput fires -
// the handler the page assigned, not a function a test knows to call.
function type(sb, text) {
    const s = el(sb, 'registration-search');
    s.value = text;
    assert.equal(typeof s.oninput, 'function', 'the page wired no oninput on #registration-search');
    s.oninput({ target: s });
}
function ownerWithEntries(rec, entries) {
    const sb = arrive(rec, ORGANIZER);
    fireRegistrations(sb, entries);
    return sb;
}

// ===========================================================================
describe('1. THE DESK IS ITS OWN TAB, and the gate takes it with Setup', () => {

    test('static markup: a Desk tab between Setup and Leaderboard, a Desk panel that holds the list; Setup keeps the switches and the link', () => {
        const nav = SRC.slice(SRC.indexOf('<div class="top-nav-bar">'), SRC.indexOf('</div>', SRC.indexOf('<div class="top-nav-bar">')));
        const ids = [...nav.matchAll(/id="tab-btn-([a-z]+)"/g)].map(m => m[1]);
        assert.deepEqual(ids, ['setup', 'desk', 'leaderboard']);
        assert.match(nav, /showTab\('desk'\)/);
        const setupA = SRC.indexOf('<div id="manage-tab-setup">');
        const deskA = SRC.indexOf('<div id="manage-tab-desk"');
        const lbA = SRC.indexOf('<div id="manage-tab-leaderboard"');
        assert.ok(setupA > 0 && deskA > setupA && lbA > deskA, 'panels in order: setup, desk, leaderboard');
        const setup = SRC.slice(setupA, deskA), desk = SRC.slice(deskA, lbA);
        // POSITIVE: each host holds what it should.
        assert.match(setup, /id="registration-link-row"/, 'the switches and signup link stay on Setup');
        assert.match(desk, /id="registration-counts"/);
        assert.match(desk, /id="registration-chips"/);
        assert.match(desk, /<input[^>]*id="registration-search"/);
        assert.match(desk, /id="registration-list"/);
        // And not the other way round.
        assert.doesNotMatch(setup, /id="registration-list"/, 'the list has left Setup');
        assert.doesNotMatch(desk, /id="registration-link-row"/);
    });

    test('the search box and the chips are OUTSIDE #registration-list, and no renderer writes the search box', () => {
        const deskA = SRC.indexOf('<div id="manage-tab-desk"');
        const desk = SRC.slice(deskA, SRC.indexOf('<div id="manage-tab-leaderboard"'));
        const searchAt = desk.indexOf('id="registration-search"'), chipsAt = desk.indexOf('id="registration-chips"'), listAt = desk.indexOf('<div id="registration-list">');
        assert.ok(searchAt > 0 && chipsAt > 0 && listAt > 0);
        assert.ok(searchAt < listAt && chipsAt < listAt, 'search and chips precede the list, as siblings');
        assert.match(desk, /<div id="registration-list"><\/div>/, 'the list is an empty host; everything inside it is rendered');
        // The one place the search box may be created is the markup.
        const scripts = SRC.replace(/<script>[\s\S]*?<\/script>/g, (m) => m);
        const inScript = [...SRC.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
        assert.doesNotMatch(inScript, /id="registration-search"|id='registration-search'|id=\\"registration-search/, 'a script must not re-create the search box');
        assert.ok(scripts.length > 0);
    });

    ['user-first', 'record-first'].forEach(order => {
        test(`signed out on an OWNED tournament: the Desk tab and panel are REMOVED with Setup (${order})`, () => {
            const sb = arrive(teamRecord(), null, order);
            assert.equal(el(sb, 'tab-btn-desk'), null, 'tab-btn-desk must be removed');
            assert.equal(el(sb, 'manage-tab-desk'), null, 'manage-tab-desk must be removed');
            assert.equal(el(sb, 'tab-btn-setup'), null);
            assert.ok(el(sb, 'tab-btn-leaderboard'), 'the Leaderboard tab stays');
        });
        test(`the owner: both tabs and both panels present (${order})`, () => {
            const sb = arrive(teamRecord(), ORGANIZER, order);
            assert.ok(el(sb, 'tab-btn-desk') && el(sb, 'manage-tab-desk'));
            assert.ok(el(sb, 'tab-btn-setup') && el(sb, 'manage-tab-setup'));
        });
    });

    test('signed out then signed in as the owner: both tabs come back and Setup is shown', () => {
        const sb = arrive(teamRecord(), null);
        assert.equal(el(sb, 'tab-btn-desk'), null);
        sb.__auth.setUser(ORGANIZER);
        assert.ok(el(sb, 'tab-btn-desk') && el(sb, 'manage-tab-desk'), 'the Desk tab is re-inserted on sign-in');
        assert.ok(el(sb, 'tab-btn-setup') && el(sb, 'manage-tab-setup'));
        assert.equal(el(sb, 'manage-tab-setup').style.display, 'block');
    });

    test('showTab("desk") signed out cannot bring it back; the leaderboard shows', () => {
        const sb = arrive(teamRecord(), null);
        assert.doesNotThrow(() => sb.showTab('desk'));
        assert.equal(el(sb, 'manage-tab-desk'), null);
        assert.equal(el(sb, 'manage-tab-leaderboard').style.display, 'block');
    });

    test('the owner taps Desk: the Desk panel shows, Setup and Leaderboard hide, the pill is active', () => {
        const sb = arrive(teamRecord(), ORGANIZER);
        sb.showTab('desk');
        assert.equal(el(sb, 'manage-tab-desk').style.display, 'block');
        assert.equal(el(sb, 'manage-tab-setup').style.display, 'none');
        assert.equal(el(sb, 'manage-tab-leaderboard').style.display, 'none');
        assert.ok(el(sb, 'tab-btn-desk').classList.contains('active'));
        assert.ok(!el(sb, 'tab-btn-setup').classList.contains('active'));
        sb.showTab('setup');
        assert.equal(el(sb, 'manage-tab-desk').style.display, 'none');
        assert.equal(el(sb, 'manage-tab-setup').style.display, 'block');
    });

    test('a LEGACY event (no ownerUid): the Desk panel says it takes no signups and lists nothing', () => {
        const sb = arrive(teamRecord({ ownerUid: undefined }), null);
        sb.showTab('desk');
        // mini-dom: the note is set by textContent, the list by innerHTML - read each.
        const note = String(el(sb, 'registration-desk-note').textContent || '');
        assert.match(note, /not taking signups/i);
        assert.equal(rows(sb), 0);
        assert.equal(strip(html(sb, 'registration-counts')), '');
    });
});

// ===========================================================================
describe('2. COUNTS - display only', () => {

    test('the fixture is what its header says (a guard on the generator, not the page)', () => {
        const es = Object.values(deskEntries('team'));
        assert.equal(es.length, TOTALS.entries);
        assert.equal(es.filter(e => e.paid === true).length, TOTALS.paid);
        assert.equal(es.filter(e => e.approvedAt || e.playerId || e.teamNum).length, TOTALS.inField);
    });

    test('the first line: "142 signups · 70 paid · 14 in the field"', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        const c = strip(html(sb, 'registration-counts'));
        assert.match(c, /^142 signups · 70 paid · 14 in the field/);
    });

    test('dinner guests: the sum, and how many answered', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        assert.match(strip(html(sb, 'registration-counts')), /Dinner guests 106 · 107 of 142 answered/);
    });

    test('shirts by size in the rule\'s order, zero sizes omitted, and "N of M gave a shirt size"', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        const c = strip(html(sb, 'registration-counts'));
        assert.match(c, /Shirts 28 S · 29 M · 29 L · 28 XL/);
        assert.doesNotMatch(c, /XS|XXL/, 'sizes nobody gave are not listed as 0');
        assert.match(c, /114 of 142 gave a shirt size/);
    });

    test('fees on an INDIVIDUAL event: the total, N paid × fee', () => {
        const sb = ownerWithEntries(individualRecord({ entryFee: 100 }), deskEntries('individual'));
        assert.match(strip(html(sb, 'registration-counts')), /Fees collected \$7,000 · 70 paid × \$100/);
    });

    test('fees on a TEAM event: no total - the line says the fee, the count and why', () => {
        const sb = ownerWithEntries(teamRecord({ entryFee: 400 }), deskEntries('team'));
        const c = strip(html(sb, 'registration-counts'));
        assert.match(c, /70 paid golfers · \$400 per team · teams form at approval/);
        assert.doesNotMatch(c, /Fees collected|\$28,000/, 'no multiplication on a team event');
    });

    test('entryFee 0: no fees line on either kind of event', () => {
        const t = ownerWithEntries(teamRecord({ entryFee: 0 }), deskEntries('team'));
        const i = ownerWithEntries(individualRecord({ entryFee: 0 }), deskEntries('individual'));
        [t, i].forEach(sb => {
            const c = strip(html(sb, 'registration-counts'));
            assert.match(c, /142 signups/, 'the first line is still there');
            assert.doesNotMatch(c, /Fees|per team|\$/);
        });
    });

    test('one entry with none of the optionals: "1 signup", and no dinner / shirt lines', () => {
        const sb = ownerWithEntries(teamRecord({ entryFee: 0 }), { e1: { fullName: 'Solo Golfer', email: 's@example.com', phone: '555-0001', createdAt: 5 } });
        const c = strip(html(sb, 'registration-counts'));
        assert.match(c, /^1 signup · 0 paid · 0 in the field$/);
        assert.doesNotMatch(c, /Dinner|Shirt/);
    });

    test('no entries: "No signups yet." and no counts', () => {
        const sb = ownerWithEntries(teamRecord(), null);
        assert.match(strip(html(sb, 'registration-list')), /No signups yet\./);
        assert.equal(strip(html(sb, 'registration-counts')), '');
    });

    test('counting writes nothing', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        sb.showTab('desk');
        assert.deepEqual(sb.__dbWrites.filter(w => /registrations|tournaments\/DESK1\/(players|teams)/.test(w.path)), []);
    });
});

// ===========================================================================
describe('3. FILTERS AND SEARCH', () => {

    test('default: every entry, sorted by createdAt (ids e003/e004 are out of order on purpose)', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        assert.equal(rows(sb), 142);
        const ids = [...html(sb, 'registration-list').matchAll(/data-entry-id="([^"]+)"/g)].map(m => m[1]);
        assert.equal(ids[0], 'e000');
        assert.deepEqual(ids.slice(3, 5), ['e004', 'e003'], 'createdAt order, not id order');
        assert.equal(ids[ids.length - 1], 'e141');
    });

    test('the chips carry live counts and All is active by default', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        const chips = html(sb, 'registration-chips');
        ['All 142', 'Unpaid 72', 'Paid 70', 'Approved 14', 'Not yet approved 128'].forEach(t => assert.ok(strip(chips).includes(t), 'chip missing: ' + t + ' in ' + strip(chips)));
        assert.match(chips, /class="reg-chip active"[^>]*>All 142/);
        assert.equal(count(chips, /reg-chip active/g), 1);
        ['all', 'unpaid', 'paid', 'approved', 'pending'].forEach(k => assert.match(chips, new RegExp("setRegistrationFilter\\('" + k + "'\\)")));
    });

    test('each chip narrows the rows to exactly its count, and the active chip moves', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        sb.setRegistrationFilter('unpaid');
        assert.equal(rows(sb), 72);
        assert.equal(count(html(sb, 'registration-list'), / checked/g), 0, 'no paid row under Unpaid');
        assert.match(html(sb, 'registration-chips'), /class="reg-chip active"[^>]*>Unpaid 72/);
        sb.setRegistrationFilter('paid');
        assert.equal(rows(sb), 70);
        assert.equal(count(html(sb, 'registration-list'), / checked/g), 70);
        sb.setRegistrationFilter('approved');
        assert.equal(rows(sb), 14);
        assert.equal(count(html(sb, 'registration-list'), /In the field/g), 14);
        assert.equal(count(html(sb, 'registration-list'), /Approve into field/g), 0);
        sb.setRegistrationFilter('pending');
        assert.equal(rows(sb), 128);
        assert.equal(count(html(sb, 'registration-list'), /Approve into field/g), 128);
        sb.setRegistrationFilter('all');
        assert.equal(rows(sb), 142);
    });

    test('search by name (case-insensitive substring) and by email', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        type(sb, 'ann a');
        // Ann Asurname0, Ann Usurname20 ... every 'Ann' whose surname starts A: i%20===0 && i%26===0 -> i=0 only
        assert.equal(rows(sb), 1);
        assert.match(html(sb, 'registration-list'), /Ann Asurname0/);
        type(sb, 'G7@EXAMPLE');
        assert.equal(rows(sb), 1);
        assert.match(html(sb, 'registration-list'), /g7@example\.com/);
        type(sb, 'zzz-nobody');
        assert.equal(rows(sb), 0);
        assert.match(strip(html(sb, 'registration-list')), /No one matches\./);
        type(sb, '');
        assert.equal(rows(sb), 142);
    });

    test('a chip and a search combine', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        sb.setRegistrationFilter('paid');
        type(sb, 'ben');
        // Ben = i%20===1 -> i odd -> never paid, EXCEPT the duplicate e141 (unpaid too): 0 rows
        assert.equal(rows(sb), 0);
        sb.setRegistrationFilter('unpaid');
        assert.equal(rows(sb), 8, 'Ben Bsurname1, 21, 41, 61, 81, 101, 121 and the e141 duplicate');
    });

    test('a signup landing mid-search: rows and chips re-render, the search text and the chip survive', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        sb.setRegistrationFilter('unpaid');
        type(sb, 'ben');
        assert.equal(rows(sb), 8);
        const more = deskEntries('team');
        more.e142 = { fullName: 'Ben Newcomer', email: 'new@example.com', phone: '555-9142', createdAt: 6000 };
        fireRegistrations(sb, more);
        assert.equal(el(sb, 'registration-search').value, 'ben', 'the search text must survive a snapshot');
        assert.equal(rows(sb), 9, 'the newcomer matches and is listed');
        assert.match(html(sb, 'registration-chips'), /class="reg-chip active"[^>]*>Unpaid 73/);
        assert.match(strip(html(sb, 'registration-counts')), /^143 signups/);
    });

    test('filtering and searching write nothing', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        sb.setRegistrationFilter('paid'); type(sb, 'a');
        assert.deepEqual(sb.__dbWrites.filter(w => /registrations/.test(w.path)), []);
    });
});

// ===========================================================================
describe('4. THE DUPLICATE FLAG - both rows, flag only', () => {

    test('same email: e005 and e140 are both marked; same name (case, spacing): e001 and e141 both marked', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        const list = html(sb, 'registration-list');
        const rowOf = (id) => { const a = list.indexOf('data-entry-id="' + id + '"'); const b = list.indexOf('class="reg-row"', a + 1); return list.slice(a, b > 0 ? b : undefined); };
        assert.match(rowOf('e005'), /Possible duplicate/);
        assert.match(rowOf('e140'), /Possible duplicate/);
        assert.match(rowOf('e005'), /same email/);
        assert.match(rowOf('e001'), /Possible duplicate/);
        assert.match(rowOf('e141'), /Possible duplicate/);
        assert.match(rowOf('e001'), /same name/);
        assert.doesNotMatch(rowOf('e002'), /duplicate/i);
        assert.equal(count(list, /Possible duplicate/g), 4, 'exactly the four rows');
    });

    test('flag only: nothing hidden, nothing merged, nothing written', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        assert.equal(rows(sb), 142);
        const list = html(sb, 'registration-list');
        assert.equal(count(list, /Approve into field/g), 128, 'both halves of each pair still have their own Approve');
        assert.deepEqual(sb.__dbWrites.filter(w => /registrations/.test(w.path)), []);
    });

    test('an email differing only by case is the same email; two different golfers are not flagged', () => {
        const sb = ownerWithEntries(teamRecord(), {
            a: { fullName: 'Ann One', email: 'Same@Example.com', phone: '555-0001', createdAt: 1 },
            b: { fullName: 'Bob Two', email: 'same@example.com ', phone: '555-0002', createdAt: 2 },
            c: { fullName: 'Cal Three', email: 'cal@example.com', phone: '555-0003', createdAt: 3 }
        });
        const list = html(sb, 'registration-list');
        assert.equal(count(list, /Possible duplicate/g), 2);
        assert.doesNotMatch(list.slice(list.indexOf('data-entry-id="c"')), /duplicate/i);
    });
});

// ===========================================================================
describe('5. PAID AND APPROVE STILL WORK FROM THE DESK', () => {

    test('Paid on a desk row writes the registration only', () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        sb.setRegistrationPaid('e001', true);
        const w = sb.__dbWrites.find(x => x.path === 'registrations/DESK1/e001' && x.op === 'update');
        assert.ok(w && w.value.paid === true && typeof w.value.paidAt === 'number');
        assert.ok(!sb.__dbWrites.some(x => /^tournaments\//.test(x.path)));
    });

    test('Approve on a team event from the desk creates the team and marks the entry', async () => {
        const sb = ownerWithEntries(teamRecord(), deskEntries('team'));
        sb.approveRegistration('e001');
        await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
        const team = sb.__dbWrites.find(x => /^tournaments\/DESK1\/teams\/team3$/.test(x.path) && x.op === 'set');
        assert.ok(team && team.value.players[0] === 'Ben Bsurname1', JSON.stringify(sb.__dbWrites.slice(-3)));
        const mark = sb.__dbWrites.find(x => x.path === 'registrations/DESK1/e001' && x.op === 'update');
        assert.ok(mark && mark.value.teamNum === 3 && mark.value.approvedAt);
    });
});

// ===========================================================================
describe('6. THE SEAMS', () => {

    test('HANDOFF names the wave, the team-fee rule, what waits for a rules change, and the known gaps', () => {
        const h = read('HANDOFF.md');
        const at = h.indexOf('## Tournament registration Wave 2c');
        assert.ok(at > 0, 'no Wave 2c section');
        const s = h.slice(at, at + 6000);
        assert.match(s, /teams form at approval/);
        ['withdrawal', 'no-show', 'amount', 'method', 'notes', 'export'].forEach(w => assert.match(s, new RegExp(w, 'i'), 'not-this-wave item missing: ' + w));
        assert.match(s, /rules change/i);
        ['two-way', 'un-approve', 'walk-up'].forEach(w => assert.match(s, new RegExp(w, 'i'), 'known gap missing: ' + w));
    });

    test('tournament.html is TOURNAMENT_SHELL: build-shell.js moved its cacheName for this wave, and has not moved back', () => {
        // v42 was this wave's key; later tournament waves move it on (v43: course
        // search). The Moved-to note for v42 stays in the file either way.
        assert.match(read('build-shell.js'), /Moved to v42\. The registration desk is its own tab/);
        const m = /cacheName: 'tournament-v(\d+)-/.exec(read('build-shell.js'));
        assert.ok(m && Number(m[1]) >= 42, 'the tournament cache key is at or past v42: ' + (m && m[0]));
    });
});
