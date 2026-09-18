// ============================================================================
// TOURNAMENT REGISTRATION WAVE 1 — public signup WRITES registrations/$code,
// and the organizer can mark Paid (cash/offline) and approve into the field.
//
// WHY THIS FILE EXISTS. database.rules.json already holds a registrations block:
// owner-only read, create-only for anyone under a tournament that HAS ownerUid,
// owner may correct, nobody deletes. HANDOFF recorded that nothing in the app
// wrote that path. This file is the writer, reached the way a golfer and an
// organizer actually arrive — not by calling a renderer by name.
//
// PUBLIC:  tournament.html?register=CODE  (the signup page)
// OWNER:   tournament.html?tourney=CODE   as the signed-in owner (Setup tab)
//
// WHAT MINI-DOM CANNOT PROVE. Static markup is not a tree, so "the Setup panel
// was removed" does not also remove #registration-section from getElementById
// the way a browser would. The signed-out arm is proved by the ABSENCE of a
// registrations/ listener (the page never asks for a list it cannot show) and
// by tools/tournament-register-check.js in Chrome. Mini-dom CAN prove the write
// path, the payload shape the rules require, and that approve uses the same
// player/team records the existing roster writers already produce.
//
// A DEVICE CHECK MAY NOT CALL A FUNCTION THE PAGE DEFINES. The Chrome half
// arrives on ?register= / ?tourney= and touches nothing. This file fires the
// page's own value handlers the way tournament_signin_gate_test.js does.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'tournament.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

function teamRecord(overrides) {
    return Object.assign({
        name: 'Signup Scramble', format: 'scramble', courseName: 'Cameron',
        activeCourseKey: 'cameron', courseData: COURSE, entryFee: 0, createdAt: 1,
        ownerUid: 'u-org',
        teams: {
            team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0 },
            team2: { num: 2, name: 'Hawks', players: ['Cal Charlie'], handicap: 0 }
        }
    }, overrides || {});
}
function individualRecord(overrides) {
    return Object.assign({
        name: 'Signup Individual', format: 'individual', scoringModel: 'player-v1',
        scoringMode: 'net', courseName: 'Cameron', activeCourseKey: 'cameron',
        courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid: 'u-org',
        teams: {},
        players: {
            p0: { id: 'p0', name: 'Ann Alpha', handicap: '8', addedAt: 1 }
        }
    }, overrides || {});
}

function settle() {
    return Promise.resolve().then(() => new Promise((r) => setImmediate(r)));
}

// Arrive on the PUBLIC signup URL. The tournament snapshot is the page's own
// .once() read, seeded before the inline script runs — the way a browser would
// already have the record when the form paints.
function arriveRegister(rec, search) {
    return loadHtmlInlineScript(PAGE, [], {
        search: search || '?register=REG1',
        beforeRun(sb) {
            sb.__dbReads = sb.__dbReads || {};
            sb.__dbReads['tournaments/REG1'] = rec ? JSON.parse(JSON.stringify(rec)) : null;
        }
    });
}

function arriveOwner(rec, user, search) {
    const code = /tourney=([A-Z0-9]+)/.exec(search || '?tourney=OWN1')[1];
    const sb = loadHtmlInlineScript(PAGE, [], { search: search || '?tourney=OWN1' });
    sb.__auth.setUser(user === undefined ? ORGANIZER : user);
    const handlers = sb.__dbHandlers.filter((h) => h.event === 'value' && new RegExp('tournaments/' + code + '$').test(h.path));
    assert.ok(handlers.length > 0, 'the page registered no value handler for the tournament');
    handlers.forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    return sb;
}

function fireRegistrations(sb, code, data) {
    const handlers = sb.__dbHandlers.filter((h) => h.event === 'value' && new RegExp('registrations/' + code + '$').test(h.path));
    assert.ok(handlers.length > 0, 'the owner page registered no registrations listener — the list cannot appear');
    handlers.forEach((h) => h.cb({
        val: () => (data == null ? null : JSON.parse(JSON.stringify(data))),
        exists: () => data != null
    }));
}

const html = (sb, id) => {
    const el = sb.document.getElementById(id);
    return el ? String(el.innerHTML || '') : null;
};
const displayOf = (sb, id) => {
    const el = sb.document.getElementById(id);
    return el && el.style ? (el.style.display || '') : null;
};
const count = (s, re) => (String(s || '').match(re) || []).length;
const srcOf = (name) => {
    const at = read(PAGE).indexOf('function ' + name + '(');
    assert.ok(at > 0, name + ' is missing');
    const end = read(PAGE).indexOf('\n    function ', at + 30);
    const body = read(PAGE).slice(at, end > at ? end : at + 4000);
    assert.ok(body.length > 80, name + ' slice was empty');
    return body;
};

// ===========================================================================
describe('PUBLIC SIGNUP — arrived via ?register=CODE, the way a golfer is sent the link', () => {

    test('the default state of an owned team event: the signup form is on screen, organizer chrome is not', async () => {
        const sb = arriveRegister(teamRecord());
        await settle();
        assert.equal(displayOf(sb, 'register-screen'), 'block',
            'a golfer who opens the signup link must see #register-screen without tapping anything');
        assert.equal(displayOf(sb, 'setup-screen'), 'none', 'the create-tournament form must not sit behind the signup');
        assert.equal(displayOf(sb, 'manage-screen'), 'none', 'the organizer console must not sit behind the signup');
        assert.equal(displayOf(sb, 'reg-form'), 'block', 'the form is the default, not a closed message');
        assert.equal(sb.document.getElementById('reg-name').value, '',
            'the name box is empty until the golfer types — the default state');
        // Wave 2a (2026-09-16): email and phone are their own REQUIRED boxes -
        // the rules require them on every public create - and the Wave 1
        // "Email or phone (optional)" box is gone. tournament_registration_2a_
        // test.js holds the schema.
        assert.ok(sb.document.getElementById('reg-email') && sb.document.getElementById('reg-phone'), 'email and phone are asked');
        assert.ok(!/id="reg-contact"/.test(read(PAGE)), 'the optional contact box is gone (mini-dom vivifies ids, so the markup is asked)');
        assert.equal(displayOf(sb, 'reg-team-wrap'), 'block',
            'a team event must ask for a team preference');
        // 2a: GHIN / handicap is asked on every event (2b's toggle may hide it); on
        // a scramble it is optional and stays on screen.
        assert.notEqual(displayOf(sb, 'reg-handicap-wrap'), 'none',
            'the GHIN / handicap box is offered on a team event too (optional)');
        assert.equal(displayOf(sb, 'reg-sponsor-wrap'), 'none', 'hole sponsorship is OFF until 2b turns it on');
        const title = sb.document.getElementById('reg-event-name');
        assert.ok(title && /Signup Scramble/.test(title.textContent || title.innerHTML || ''),
            'the event name is on the signup page: ' + (title && (title.textContent || title.innerHTML)));
    });

    test('an owned individual net event shows the handicap box and hides team preference', async () => {
        const sb = arriveRegister(individualRecord());
        await settle();
        assert.equal(displayOf(sb, 'register-screen'), 'block');
        assert.notEqual(displayOf(sb, 'reg-handicap-wrap'), 'none',
            'net individual: the GHIN / handicap box is on screen (2a: on every event)');
        assert.equal(displayOf(sb, 'reg-team-wrap'), 'none',
            'an individual event has no team to prefer');
    });

    test('submit WRITES registrations/REG1/<id> with fullName + email + phone + createdAt, and nothing on tournaments/', async () => {
        const sb = arriveRegister(teamRecord());
        await settle();
        // Wave 2a shape: the three required fields; team preference when present.
        sb.document.getElementById('reg-name').value = 'Dee Delta';
        sb.document.getElementById('reg-email').value = 'dee@example.com';
        sb.document.getElementById('reg-phone').value = '555-0100';
        sb.document.getElementById('reg-team-pref').value = 'Eagles';
        const alerts = []; sb.alert = (m) => alerts.push(String(m));
        sb.submitRegistration();
        await settle();
        const writes = sb.__dbWrites.filter((w) => w.op === 'set');
        const reg = writes.filter((w) => /^registrations\/REG1\/[^/]+$/.test(w.path));
        assert.equal(reg.length, 1, 'exactly one registration create: ' + JSON.stringify(sb.__dbWrites));
        assert.equal(reg[0].value.fullName, 'Dee Delta');
        assert.equal(typeof reg[0].value.createdAt, 'number');
        assert.ok(reg[0].value.createdAt > 0, 'createdAt must be a timestamp, the field the rules require');
        assert.equal(reg[0].value.email, 'dee@example.com');
        assert.equal(reg[0].value.phone, '555-0100');
        assert.ok(!('name' in reg[0].value) && !('contact' in reg[0].value), 'the Wave 1 keys are gone - the rules refuse them');
        assert.equal(reg[0].value.teamPreference, 'Eagles');
        assert.ok(reg[0].value.paid === undefined && reg[0].value.approvedAt === undefined,
            'a golfer must not be able to mark themselves paid or approved on create');
        assert.ok(!writes.some((w) => /^tournaments\//.test(w.path)),
            'signup must not touch the tournament record — scoring and the roster stay as they are');
        assert.equal(alerts.length, 0, 'a valid signup must not alert: ' + JSON.stringify(alerts));
        const status = sb.document.getElementById('reg-status');
        assert.ok(status && /signed up|received|thanks/i.test(status.textContent || status.innerHTML || ''),
            'the golfer is told it landed: ' + (status && (status.textContent || status.innerHTML)));
    });

    test('an empty name writes nothing', async () => {
        const sb = arriveRegister(teamRecord());
        await settle();
        sb.document.getElementById('reg-name').value = '   ';
        const alerts = []; sb.alert = (m) => alerts.push(String(m));
        sb.submitRegistration();
        await settle();
        assert.equal(sb.__dbWrites.length, 0, 'blank name must not create an entry');
        assert.ok(alerts.some((m) => /name/i.test(m)), 'the refusal must name the missing field: ' + JSON.stringify(alerts));
    });

    test('a LEGACY tournament (no ownerUid) refuses before writing — the rules would too', async () => {
        const rec = teamRecord(); delete rec.ownerUid;
        const sb = arriveRegister(rec);
        await settle();
        assert.equal(displayOf(sb, 'reg-form'), 'none', 'the form is not offered on a legacy event');
        assert.equal(displayOf(sb, 'reg-closed'), 'block');
        const closed = sb.document.getElementById('reg-closed');
        assert.ok(closed && /not taking signups|organizer/i.test(closed.textContent || closed.innerHTML || ''),
            'the golfer is told why, not left with a dead button: ' + (closed && (closed.textContent || closed.innerHTML)));
        sb.document.getElementById('reg-name').value = 'Zed';
        sb.submitRegistration();
        await settle();
        assert.ok(!sb.__dbWrites.some((w) => /^registrations\//.test(w.path)),
            'a legacy event must not receive a signup the organizer could never read');
    });

    test('an anonymous session can submit — anonymous is not an organizer here, but signup does not need one', async () => {
        const sb = arriveRegister(teamRecord());
        await settle();
        // The harness default user is anonymous. authUser is a script-scoped let,
        // so it is not on the sandbox; the proof is the write going through
        // without a sign-in.
        sb.document.getElementById('reg-name').value = 'Ev Echo';
        sb.document.getElementById('reg-email').value = 'ev@example.com';
        sb.document.getElementById('reg-phone').value = '555-0199';
        sb.submitRegistration();
        await settle();
        assert.ok(sb.__dbWrites.some((w) => /^registrations\/REG1\//.test(w.path) && w.value && w.value.fullName === 'Ev Echo'),
            'anonymous must not be treated as "signed out, therefore cannot sign up": ' + JSON.stringify(sb.__dbWrites));
    });

    test('the submit button is the entry point, not a function only tests know to call', () => {
        const markup = read(PAGE).replace(/<script[\s\S]*?<\/script>/g, '');
        assert.match(markup, /id="reg-submit"/);
        assert.match(markup, /onclick="submitRegistration\(\)"/);
        assert.match(markup, /id="reg-name"/);
        assert.match(markup, /id="register-screen"/);
        assert.match(srcOf('submitRegistration'), /registrations\/\$\{/);
        // 2a: the payload is built by buildRegistrationPayload, which the button's handler calls.
        assert.match(srcOf('submitRegistration'), /buildRegistrationPayload\(\)/);
        assert.match(srcOf('buildRegistrationPayload'), /createdAt: Date\.now\(\)/);
    });
});

// ===========================================================================
describe('ORGANIZER LIST — arrived via ?tourney= as the owner, page\'s own listener', () => {

    test('the default state: the signup link is on Setup, the list says there are no signups yet', () => {
        const sb = arriveOwner(teamRecord());
        const section = html(sb, 'registration-section');
        assert.ok(section !== null, '#registration-section must exist for the owner');
        assert.equal(displayOf(sb, 'registration-section'), 'block');
        const link = html(sb, 'registration-link-row');
        assert.ok(link && /register=OWN1/.test(link),
            'the owner is handed the public URL without hunting for a query param: ' + link);
        const before = html(sb, 'registration-list');
        assert.ok(before && /loading signups/i.test(before),
            'before the snapshot the desk does not pretend the field is empty: ' + before);
        fireRegistrations(sb, 'OWN1', null);
        const list = html(sb, 'registration-list');
        assert.ok(list && /no signups yet/i.test(list),
            'an empty list is a sentence, not a blank box: ' + list);
        assert.ok(/Paid/.test(read(PAGE).replace(/<script[\s\S]*?<\/script>/g, ''))
            || /Paid/.test(list) || /cash|offline/i.test(html(sb, 'registration-section') || ''),
            'cash/offline Paid is named on the organizer surface');
    });

    test('firing the page\'s own registrations listener lists the golfer, with Paid and Approve', () => {
        const sb = arriveOwner(teamRecord());
        fireRegistrations(sb, 'OWN1', {
            e1: { name: 'Fay Foxtrot', createdAt: 10, contact: '555-0100', teamPreference: 'Hawks' }
        });
        const list = html(sb, 'registration-list');
        assert.ok(/Fay Foxtrot/.test(list), 'the submitted name is on the list: ' + list);
        assert.ok(/555-0100/.test(list), 'optional contact is visible to the organizer');
        assert.ok(/Hawks/.test(list), 'team preference is visible so the owner can place them');
        assert.ok(/setRegistrationPaid\('e1'/.test(list), 'Paid is wired to the entry, not a function the test has to call first');
        assert.ok(/approveRegistration\('e1'/.test(list), 'Approve is wired the same way');
        assert.ok(/Paid/.test(list), 'the cash/offline Paid checkbox is labelled');
    });

    test('a signed-out visitor of an OWNED tournament never listens on registrations/', () => {
        const sb = arriveOwner(teamRecord(), null);
        const regs = sb.__dbHandlers.filter((h) => /registrations\//.test(h.path));
        assert.equal(regs.length, 0,
            'owner-only read: a signed-out visitor must not even ask, or the SDK would PERMISSION_DENIED. handlers='
            + JSON.stringify(sb.__dbHandlers.map((h) => h.path)));
    });

    test('an anonymous visitor of an OWNED tournament is the same — no registrations listener', () => {
        const sb = arriveOwner(teamRecord(), { uid: 'anon-1', isAnonymous: true, email: null });
        assert.equal(sb.__dbHandlers.filter((h) => /registrations\//.test(h.path)).length, 0);
    });

    test('a LEGACY tournament does not offer a signup link that the rules would refuse', () => {
        const rec = teamRecord(); delete rec.ownerUid;
        const sb = arriveOwner(rec, null);
        assert.equal(displayOf(sb, 'registration-section'), 'none',
            'legacy events cannot receive signups; hiding the section is the honest default');
        assert.equal(sb.__dbHandlers.filter((h) => /registrations\//.test(h.path)).length, 0);
    });

    test('ticking Paid writes only the registration, cash/offline, no Stripe', () => {
        const sb = arriveOwner(teamRecord());
        fireRegistrations(sb, 'OWN1', { e1: { name: 'Fay Foxtrot', createdAt: 10 } });
        const before = sb.__dbWrites.length;
        sb.setRegistrationPaid('e1', true);
        const w = sb.__dbWrites.slice(before);
        assert.ok(w.some((x) => x.path === 'registrations/OWN1/e1' && x.op === 'update' && x.value.paid === true),
            'Paid must be an update on the entry: ' + JSON.stringify(w));
        assert.ok(!w.some((x) => /^tournaments\//.test(x.path)),
            'Paid is not a roster change');
        const regSrc = srcOf('setRegistrationPaid') + srcOf('submitRegistration') + srcOf('renderRegistrationList');
        assert.doesNotMatch(regSrc, /Stripe|stripe|card charge|IAP|in-app purchase/i);
    });

    test('Approve on an individual event writes a player record the field already understands, then marks the entry', async () => {
        const sb = arriveOwner(individualRecord());
        fireRegistrations(sb, 'OWN1', {
            e1: { name: 'Dee Delta', createdAt: 10, handicap: '14', contact: 'dee@example.com' }
        });
        const before = sb.__dbWrites.length;
        sb.approveRegistration('e1');
        await settle();
        const w = sb.__dbWrites.slice(before);
        const player = w.find((x) => /^tournaments\/OWN1\/players\/p/.test(x.path) && x.op === 'set');
        assert.ok(player, 'approve must mint a player under the existing field: ' + JSON.stringify(w));
        assert.equal(player.value.name, 'Dee Delta');
        assert.equal(player.value.handicap, '14');
        assert.equal(typeof player.value.addedAt, 'number');
        assert.equal(player.value.id, player.path.split('/').pop(),
            'id on the record matches the path key, the same contract addPlayerToField keeps');
        assert.ok(!('unnamed' in player.value) && player.value.name !== '',
            'an approved signup is a named golfer, not an unnamed paid slot');
        const mark = w.find((x) => x.path === 'registrations/OWN1/e1' && x.op === 'update');
        assert.ok(mark && mark.value.playerId && mark.value.approvedAt,
            'the entry is marked approved so a second tap cannot duplicate them: ' + JSON.stringify(mark));
        assert.ok(!w.some((x) => /\/scores\//.test(x.path)),
            'approve must not write a score — live scoring is untouched');
    });

    test('Approve on a team event appends the golfer to the preferred team when it exists', async () => {
        const sb = arriveOwner(teamRecord());
        fireRegistrations(sb, 'OWN1', {
            e1: { name: 'Dee Delta', createdAt: 10, teamPreference: 'Hawks' }
        });
        sb.document.getElementById('reg-dest-e1').value = '2';
        const before = sb.__dbWrites.length;
        sb.approveRegistration('e1');
        await settle();
        const w = sb.__dbWrites.slice(before);
        const team = w.find((x) => x.path === 'tournaments/OWN1/teams/team2/players' && x.op === 'set');
        assert.ok(team, 'preferred team is the destination: ' + JSON.stringify(w));
        assert.deepEqual(team.value, ['Cal Charlie', 'Dee Delta']);
        assert.ok(!w.some((x) => /\/scores/.test(x.path)), 'no score write');
    });

    test('Approve with no matching team creates a new team using the same shape saveNewTeam writes', async () => {
        const sb = arriveOwner(teamRecord());
        fireRegistrations(sb, 'OWN1', {
            e1: { name: 'Dee Delta', createdAt: 10, teamPreference: 'Owls' }
        });
        sb.document.getElementById('reg-dest-e1').value = 'new';
        const before = sb.__dbWrites.length;
        sb.approveRegistration('e1');
        await settle();
        const w = sb.__dbWrites.slice(before);
        const team = w.find((x) => /^tournaments\/OWN1\/teams\/team3$/.test(x.path) && x.op === 'set');
        assert.ok(team, 'next team number is 3: ' + JSON.stringify(w));
        assert.equal(team.value.num, 3);
        assert.equal(team.value.name, 'Owls');
        assert.deepEqual(JSON.parse(JSON.stringify(team.value.players)), ['Dee Delta']);
        assert.equal(team.value.handicap, 0);
    });

    test('a second Approve of the same entry writes no second player', async () => {
        const rec = individualRecord();
        rec.players.pKeep = { id: 'pKeep', name: 'Dee Delta', handicap: '14', addedAt: 2 };
        const sb = arriveOwner(rec);
        fireRegistrations(sb, 'OWN1', {
            e1: { name: 'Dee Delta', createdAt: 10, handicap: '14', approvedAt: 20, playerId: 'pKeep' }
        });
        const before = sb.__dbWrites.length;
        sb.approveRegistration('e1');
        await settle();
        const w = sb.__dbWrites.slice(before);
        assert.ok(!w.some((x) => /^tournaments\/OWN1\/players\//.test(x.path)),
            'already in the field: ' + JSON.stringify(w));
    });

    test('the switches and the signup link live in the Setup panel, the list in the Desk panel - and the gate takes both', () => {
        // 2c (2026-09-17) moved the desk to its own tab. Setup keeps the
        // configuration; the Desk panel sits between Setup and Leaderboard and
        // is removed with Setup by applyManageGate (tournament_desk_2c_test.js).
        const src = read(PAGE);
        const a = src.indexOf('<div id="manage-tab-setup">');
        const d = src.indexOf('<div id="manage-tab-desk"');
        const b = src.indexOf('<div id="manage-tab-leaderboard"');
        assert.ok(a > 0 && d > a && b > d, 'panels in order: setup, desk, leaderboard');
        const setup = src.slice(a, d), desk = src.slice(d, b);
        assert.match(setup, /id="registration-section"/);
        assert.match(setup, /id="registration-link-row"/);
        assert.doesNotMatch(setup, /id="registration-list"/, 'the list has left Setup');
        assert.match(desk, /id="registration-list"/);
        assert.ok(!/id="registration-section"|id="registration-list"/.test(src.slice(b)), 'one of each, nowhere else');
        assert.match(src, /const GATED_TABS = \['setup', 'desk'\];/, 'the gate names both tabs');
    });
});

// ===========================================================================
describe('LIVE SCORING AND PRODUCT BOUNDARY — this wave does not touch them', () => {

    test('tournament-scorecard.html still has no registrations path and no auth SDK', () => {
        const src = read('tournament-scorecard.html');
        assert.doesNotMatch(src, /registrations/);
        assert.doesNotMatch(src, /firebase-auth-compat/);
        assert.doesNotMatch(src, /firebase\.auth\(/);
    });

    test('tournament-engine.js does not grow a registration reader — scoring stays a score reader', () => {
        assert.doesNotMatch(read('tournament-engine.js'), /registrations/);
    });

    test('no Consumer page writes registrations/', () => {
        ['admin.html', 'index.html', 'trip.html', 'leaderboard.html', 'settlement.html'].forEach((f) => {
            const code = read(f).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '');
            assert.ok(!/db\.ref\([^)]*registrations/.test(code), f + ' must not write tournament signups');
        });
    });

    test('the public signup URL is documented next to the writer, so a later move cannot leave a dead link', () => {
        const src = read(PAGE);
        assert.match(src, /\?register=/);
        assert.match(src, /registerParam|get\('register'\)/);
        const boot = src.slice(src.indexOf('const urlParams'), src.indexOf('const urlParams') + 1200);
        assert.match(boot, /register/, 'arrival must branch on the signup param, not wait for a tap');
        assert.ok(boot.length > 40, 'the arrival slice exists');
    });

    test('no UI string on the signup or list promises a lock the rules do not make for the tournament itself', () => {
        const markup = read(PAGE).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
        assert.ok(!/\b(Protected|Secure|Locked|Private)\b/.test(markup));
        const reg = srcOf('submitRegistration') + srcOf('renderRegistrationList') + srcOf('approveRegistration');
        assert.ok(!/\b(Protected|Secure|Locked)\b/.test(reg));
    });
});
