// ============================================================================
// TOURNAMENT REGISTRATION WAVE 2a — THE FIELD SCHEMA (2026-09-16)
//
// Wave 1 stored { name, createdAt } plus an optional contact/handicap/team
// preference, and database.rules.json validated only name + createdAt. Two
// things were wrong with that. The schema was open: any key rode in, and a
// public create could carry paid / approvedAt / playerId / teamNum - a golfer
// approving and paying for himself (targaryen against the old file: accepted).
// And the app was about to hold email and phone for every golfer in a field -
// the first personal data it has ever stored - under a rule that said nothing
// about either.
//
// THE RULE (published to the Firebase console by hand, live read-back byte-
// equal to the repo file, 2026-09-16): a public create requires fullName,
// email, phone, createdAt and may NOT carry the desk's fields; the owner may;
// every optional is typed; $other is refused - the schema is CLOSED, so a
// future field is a console publish, not a deploy.
//
// THE FORM (tournament.html, extended, not rebuilt): three required boxes;
// GHIN/handicap, shirt size, dinner count on every event; team preference on
// team events; hole sponsorship present but hidden until 2b's toggle - hidden
// means NOT WRITTEN. The desk lists the new fields; approve carries fullName
// and a handicap only when the GHIN/handicap box holds one.
//
// PROOF OF THE RULE is targaryen on security-rules.tests-data.json (56
// registrations rows) - here re-run against a COPY of the rules with each
// boundary knocked out, so a rule that refuses nothing cannot pass by
// accident. mini-dom vivifies ids and parses no static style, so visibility
// is asserted through what the page SETS and through the write, not through
// getBoundingClientRect; tools/tournament-register-check.js measures the
// rects in Chrome.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'tournament.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const ORGANIZER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const TARGARYEN = path.join(REPO_ROOT, 'node_modules', '.bin', 'targaryen');
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

function settle() { return Promise.resolve().then(() => new Promise((r) => setImmediate(r))); }
function teamRecord(o) { return Object.assign({ name: 'Signup Scramble', format: 'scramble', courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid: 'u-org',
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann Alpha', 'Bo Bravo'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Cal Charlie'], handicap: 0 } } }, o || {}); }
function individualRecord(o) { return Object.assign({ name: 'Signup Individual', format: 'individual', scoringModel: 'player-v1', scoringMode: 'net', courseName: 'Cameron', activeCourseKey: 'cameron', courseData: COURSE, entryFee: 0, createdAt: 1, ownerUid: 'u-org', teams: {}, players: { p0: { id: 'p0', name: 'Ann Alpha', handicap: '8', addedAt: 1 } } }, o || {}); }
function arriveRegister(rec) { return loadHtmlInlineScript(PAGE, [], { search: '?register=REG1', beforeRun(sb) { sb.__dbReads = sb.__dbReads || {}; sb.__dbReads['tournaments/REG1'] = JSON.parse(JSON.stringify(rec)); } }); }
function arriveOwner(rec) {
    const sb = loadHtmlInlineScript(PAGE, [], { search: '?tourney=OWN1' }); sb.__auth.setUser(ORGANIZER);
    sb.__dbHandlers.filter((h) => h.event === 'value' && /tournaments\/OWN1$/.test(h.path)).forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(rec)), exists: () => true }));
    return sb;
}
function fireRegistrations(sb, data) {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && /registrations\/OWN1$/.test(h.path)); assert.ok(hs.length > 0, 'no registrations listener');
    hs.forEach((h) => h.cb({ val: () => JSON.parse(JSON.stringify(data)), exists: () => true }));
}
const set = (sb, id, v) => { sb.document.getElementById(id).value = v; };
const fill = (sb, o) => { set(sb, 'reg-name', o.fullName || ''); set(sb, 'reg-email', o.email || ''); set(sb, 'reg-phone', o.phone || ''); };
async function submit(sb) { const alerts = []; sb.alert = (m) => alerts.push(String(m)); sb.submitRegistration(); await settle(); const reg = sb.__dbWrites.filter((w) => w.op === 'set' && /^registrations\/REG1\/[^/]+$/.test(w.path)); return { alerts, reg }; }
const GOOD = { fullName: 'Dee Delta', email: 'dee@example.com', phone: '555-0100' };

// ---------------------------------------------------------------------------
describe('THE THREE REQUIRED FIELDS - through the button\'s handler', () => {
    test('all three present: ONE create with exactly fullName, email, phone, createdAt (a team event adds nothing else unfilled)', async () => {
        const sb = arriveRegister(teamRecord()); await settle(); fill(sb, GOOD);
        const { alerts, reg } = await submit(sb);
        assert.equal(alerts.length, 0, JSON.stringify(alerts)); assert.equal(reg.length, 1);
        const v = reg[0].value;
        assert.deepEqual(Object.keys(v).sort(), ['createdAt', 'email', 'fullName', 'phone']);
        assert.equal(v.fullName, 'Dee Delta'); assert.equal(v.email, 'dee@example.com'); assert.equal(v.phone, '555-0100'); assert.equal(typeof v.createdAt, 'number');
    });
    [['fullName', /name/i], ['email', /email/i], ['phone', /phone/i]].forEach(([field, re]) => {
        test(`missing ${field}: nothing written, the alert names it`, async () => {
            const sb = arriveRegister(teamRecord()); await settle(); fill(sb, Object.assign({}, GOOD, { [field]: '' }));
            const { alerts, reg } = await submit(sb);
            assert.equal(reg.length, 0); assert.ok(alerts.some((m) => re.test(m)), JSON.stringify(alerts));
        });
    });
    test('a malformed email or a six-digit phone is refused before the rules would refuse it', async () => {
        let sb = arriveRegister(teamRecord()); await settle(); fill(sb, Object.assign({}, GOOD, { email: 'not-an-email' }));
        let r = await submit(sb); assert.equal(r.reg.length, 0); assert.ok(r.alerts.some((m) => /email/i.test(m)));
        sb = arriveRegister(teamRecord()); await settle(); fill(sb, Object.assign({}, GOOD, { phone: '123456' }));
        r = await submit(sb); assert.equal(r.reg.length, 0); assert.ok(r.alerts.some((m) => /phone/i.test(m)));
    });
    test('the page\'s email pattern is the rule\'s pattern', () => {
        const page = stripComments(read(PAGE)); const rules = read('database.rules.json');
        assert.match(page, /const REG_EMAIL = \/\^\[\^@\\s\]\+@\[\^@\\s\]\+\\\.\[\^@\\s\]\+\$\//);
        assert.ok(rules.includes('matches(/^[^@\\\\s]+@[^@\\\\s]+\\\\.[^@\\\\s]+$/)'), 'the rules carry the same pattern');
    });
});

describe('THE OPTIONALS - written when present, absent when not, hidden means not written', () => {
    test('every optional filled on a team event: ghinOrHandicap, shirtSize, dinnerCount (a number), teamPreference', async () => {
        const sb = arriveRegister(teamRecord()); await settle(); fill(sb, GOOD);
        set(sb, 'reg-handicap', '12.4'); set(sb, 'reg-shirt', 'XL'); set(sb, 'reg-dinner', '2'); set(sb, 'reg-team-pref', 'Eagles');
        const { alerts, reg } = await submit(sb); assert.equal(alerts.length, 0); assert.equal(reg.length, 1);
        const v = reg[0].value;
        assert.equal(v.ghinOrHandicap, '12.4'); assert.equal(v.shirtSize, 'XL'); assert.strictEqual(v.dinnerCount, 2); assert.equal(v.teamPreference, 'Eagles');
        assert.ok(!('holeSponsorship' in v) && !('sponsorName' in v), 'sponsorship is hidden in 2a, so it is not written');
        assert.ok(!('name' in v) && !('contact' in v) && !('handicap' in v), 'no Wave 1 key');
    });
    test('dinner guests must be a whole number 0..20', async () => {
        for (const bad of ['2.5', '99', '-1']) {
            const sb = arriveRegister(teamRecord()); await settle(); fill(sb, GOOD); set(sb, 'reg-dinner', bad);
            const { alerts, reg } = await submit(sb); assert.equal(reg.length, 0, bad); assert.ok(alerts.some((m) => /dinner/i.test(m)), bad + ': ' + JSON.stringify(alerts));
        }
        const sb = arriveRegister(teamRecord()); await settle(); fill(sb, GOOD); set(sb, 'reg-dinner', '0');
        const { reg } = await submit(sb); assert.strictEqual(reg[0].value.dinnerCount, 0, 'zero is a real answer');
    });
    test('an individual event: team preference is hidden and NOT written even if the box holds text', async () => {
        const sb = arriveRegister(individualRecord()); await settle(); fill(sb, GOOD); set(sb, 'reg-team-pref', 'Eagles'); set(sb, 'reg-handicap', '8');
        assert.equal(sb.document.getElementById('reg-team-wrap').style.display, 'none');
        const { reg } = await submit(sb); assert.ok(!('teamPreference' in reg[0].value)); assert.equal(reg[0].value.ghinOrHandicap, '8');
    });
    test('the page hides sponsorship in code on arrival; when 2b shows it, holeSponsorship is a boolean and sponsorName rides only when typed', async () => {
        const sb = arriveRegister(teamRecord()); await settle();
        assert.equal(sb.document.getElementById('reg-sponsor-wrap').style.display, 'none', 'set by the page, not only by markup');
        sb.document.getElementById('reg-sponsor-wrap').style.display = 'block';   // what 2b's toggle will do
        fill(sb, GOOD); sb.document.getElementById('reg-sponsor').checked = true; set(sb, 'reg-sponsor-name', 'Orozco Roofing');
        let r = await submit(sb); assert.strictEqual(r.reg[0].value.holeSponsorship, true); assert.equal(r.reg[0].value.sponsorName, 'Orozco Roofing');
        const sb2 = arriveRegister(teamRecord()); await settle(); sb2.document.getElementById('reg-sponsor-wrap').style.display = 'block'; fill(sb2, GOOD);
        r = await submit(sb2); assert.strictEqual(r.reg[0].value.holeSponsorship, false, 'shown and unticked is an answer: false'); assert.ok(!('sponsorName' in r.reg[0].value));
    });
    test('a public create never carries the desk\'s fields', async () => {
        const sb = arriveRegister(teamRecord()); await settle(); fill(sb, GOOD);
        const { reg } = await submit(sb); ['paid', 'paidAt', 'approvedAt', 'playerId', 'teamNum'].forEach((k) => assert.ok(!(k in reg[0].value), k));
    });
});

describe('THE DESK reads the new shape', () => {
    test('the list shows fullName and the 2a fields; approve on an individual event carries fullName and a handicap only when the box holds a handicap', async () => {
        const sb = arriveOwner(individualRecord()); await settle();
        fireRegistrations(sb, { e1: { fullName: 'Dee Delta', email: 'dee@example.com', phone: '555-0100', ghinOrHandicap: '14', shirtSize: 'L', dinnerCount: 2, createdAt: 10 },
                                e2: { fullName: 'Gus Golf', email: 'gus@example.com', phone: '555-0101', ghinOrHandicap: 'GHIN 1234567', createdAt: 11, holeSponsorship: true, sponsorName: 'Orozco Roofing' } });
        const list = sb.document.getElementById('registration-list').innerHTML;
        ['Dee Delta', 'dee@example.com', '555-0100', 'GHIN/Hcp 14', 'Shirt L', 'Dinner 2', 'Gus Golf', 'Hole sponsor — Orozco Roofing'].forEach((s) => assert.ok(list.includes(s), 'list lacks ' + s));
        sb.approveRegistration('e1'); await settle();
        const p1 = sb.__dbWrites.find((w) => w.op === 'set' && /^tournaments\/OWN1\/players\//.test(w.path)); assert.equal(p1.value.name, 'Dee Delta'); assert.equal(p1.value.handicap, '14');
        sb.approveRegistration('e2'); await settle();
        const p2 = sb.__dbWrites.filter((w) => w.op === 'set' && /^tournaments\/OWN1\/players\//.test(w.path))[1]; assert.equal(p2.value.name, 'Gus Golf'); assert.equal(p2.value.handicap, '0', 'a GHIN number is not a handicap');
    });
});

// ---------------------------------------------------------------------------
// THE RULE, proved by targaryen - the repo file, then each boundary knocked out
// of a COPY so the rows that guard it are shown to fire.
describe('THE RULES BOUNDARY (targaryen): 56 registrations rows, every knockout caught', () => {
    const DATA = path.join(REPO_ROOT, 'security-rules.tests-data.json');
    function run(rulesPath) { try { execFileSync(TARGARYEN, [rulesPath, DATA], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return 0; } catch (e) { return e.status; } }
    function failures(rulesPath) {
        try { execFileSync(TARGARYEN, [rulesPath, DATA, '--verbose'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return []; }
        catch (e) {
            const out = (String(e.stdout || '') + String(e.stderr || '')).replace(ANSI, '');
            // a verdict row where expected and got disagree, on a registrations path
            return out.split('\n').filter((l) => /registrations/.test(l) && /✓\s*│\s*✖|✖\s*│\s*✓/.test(l));
        }
    }
    const rules = JSON.parse(read('database.rules.json'));
    test('the repo file: every row green, and there are positive public creates (the block is not a wall)', () => {
        assert.equal(run(path.join(REPO_ROOT, 'database.rules.json')), 0);
        const td = JSON.parse(read('security-rules.tests-data.json'));
        const e2 = td.tests['registrations/OWNED/e2'];
        assert.ok(e2.canWrite.filter((r) => r.auth === 'nobody').length >= 3, 'nobody can sign up with the right shape');
        assert.equal(Object.keys(td.tests).filter((k) => /^registrations/.test(k)).length, 9);
    });
    function knockout(name, mutate, expectRows) {
        test(name, () => {
            const copy = JSON.parse(JSON.stringify(rules)); mutate(copy.rules.registrations['$code']['$entryId']);
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules2a-')); const p = path.join(dir, 'rules.json'); fs.writeFileSync(p, JSON.stringify(copy));
            const red = failures(p); assert.ok(red.length >= expectRows, name + ': only ' + red.length + ' rows fired\n' + red.join('\n'));
        });
    }
    knockout('the public-create forbid removed (self-paid signup accepted again)', (e) => { e['.validate'] = e['.validate'].replace(/ && !newData\.hasChild\('paid'\) && !newData\.hasChild\('paidAt'\) && !newData\.hasChild\('approvedAt'\) && !newData\.hasChild\('playerId'\) && !newData\.hasChild\('teamNum'\)/, ''); }, 5);
    knockout('phone no longer required', (e) => { e['.validate'] = e['.validate'].replace("['fullName', 'email', 'phone']", "['fullName', 'email']"); }, 1);
    knockout('email no longer required', (e) => { e['.validate'] = e['.validate'].replace("['fullName', 'email', 'phone']", "['fullName', 'phone']"); }, 1);
    knockout('the schema opened ($other allowed): the stray-key row fires', (e) => { delete e['$other']; }, 1);
    knockout('the email pattern dropped', (e) => { e.email['.validate'] = 'newData.isString()'; }, 1);
    knockout('shirt sizes unconstrained', (e) => { e.shirtSize['.validate'] = 'newData.isString()'; }, 1);
    knockout('dinner count unconstrained', (e) => { e.dinnerCount['.validate'] = 'newData.isNumber()'; }, 2);
    knockout('sponsorName untyped', (e) => { e.sponsorName['.validate'] = 'true'; }, 3);
    knockout('holeSponsorship untyped', (e) => { e.holeSponsorship['.validate'] = 'true'; }, 1);
    knockout('owner-only update dropped (anyone edits an existing entry)', (e) => { e['.write'] = "root.child('tournaments/' + $code + '/ownerUid').exists() && newData.exists()"; }, 6);
});

describe('HANDOFF says what this node is', () => {
    test('the stale heading is gone; the closed-schema and personal-data lines are in', () => {
        const h = read('HANDOFF.md');
        assert.ok(!/ownerUid and registrations — COMMITTED, NOT YET PUBLISHED/.test(h), 'the stale heading');
        assert.match(h, /schema is CLOSED/); assert.match(h, /first personal data/);
    });
});
