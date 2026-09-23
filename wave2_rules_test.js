// ============================================================================
// WAVE 2 RULES - THE DRAFT, HELD AGAINST TARGARYEN (2026-09-15). DRAFT ONLY:
// nothing here deploys anywhere.
//
// THE SHAPE (database.rules.json, events/$eventCode and organizers/$uid):
//   CREATING a round (!data.exists()) needs an identified organizer - auth
//   != null, ownerUid === auth.uid - AND a live trial window (now <
//   firstSeenAt + 21 days) or a pass whose expiresAt is in the future.
//   PARTICIPATING in an existing round - scores, KP markers, presses, side
//   matches, dots, wolf calls, Ryder scoring, the audit log, verification -
//   stays UNAUTHENTICATED, exactly as today. That is the row that breaks
//   Mondays, so it gets the most coverage here. Those paths are child .write
//   grants: a parent grant cannot be revoked, so setup is owner-only only
//   because the parent no longer grants a code-holder write on an owned round.
//   SETUP on a round that HAS ownerUid (players, group sizes, the pot, flights,
//   additionalGames, courseData, settlementMode, supersededBy, organizerToken,
//   and every other key with no child grant) requires auth.uid === ownerUid.
//   A LEGACY round (no ownerUid) stays open, including its setup. The organizer
//   token is NOT a rules credential: the round is world-readable, so the token
//   is too. Email-link sign-in is how a second device becomes that uid.
//   A LEGACY round (no ownerUid) is an existing round: unchanged, forever;
//   and nobody can claim it (ownerUid can only be set while the round is
//   being created - data.parent() does not exist).
//   An OWNER edits their own round after the trial expires: the gate is on
//   creation only.
//   organizers/<uid>/firstSeenAt: write-once by that uid, a number not in
//   the future. organizers/<uid>/pass: no client can write it (Worker-only,
//   through the Admin SDK, which bypasses rules); readable by its uid only.
//
// TWO MEANINGS OF AUTH - the thing the next editor must not collapse. On the
// consumer pages the organizer IS an anonymous user (auth-boot's uid is the
// identity), so the events ownerUid rule carries NO provider check. On
// tournament.html an anonymous session is nobody, so the tournaments
// ownerUid rule REQUIRES a non-anonymous provider. The rules file is strict
// JSON (ten suites JSON.parse it) and the rules grammar allows no comment
// keys, so this file is where that is written down, and THE SEAM below pins
// that the two rules differ on exactly that clause.
//
// THE UID IS A LEARNING GATE, NOT THE FOREVER MODEL. It does not survive a
// reinstall, a new device, a cleared browser or a closed private window -
// each mints a fresh uid and a fresh window. Wave 4 keys entitlement on
// Apple's transaction identity (the pass node the Worker writes).
//
// HOW. The scenario file is BUILT at run time (timestamps are relative to
// now) into a temp directory and run through the real targaryen CLI against
// the repo's database.rules.json. THE CONTROLS mutate a COPY of the rules in
// that temp directory - never the repo file - and assert targaryen names the
// rows each mutation is supposed to break. Every control fires.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { REPO_ROOT } = require('./helpers/load-script.js');

const TARGARYEN = path.join(REPO_ROOT, 'node_modules', '.bin', 'targaryen');
const RULES = path.join(REPO_ROOT, 'database.rules.json');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wave2-rules-'));
const NOW = Date.now(), DAY = 86400000;
const ESC = String.fromCharCode(27);
const strip = s => String(s).split(ESC).map((p, i) => i === 0 ? p : p.replace(/^\[[0-9;]*m/, '')).join('');
const BAR = String.fromCharCode(0x2502);

// ---- the scenarios -----------------------------------------------------------
const anon = uid => ({ uid, provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } });
const ROUND = owner => Object.assign({ eventName: 'New', createdAt: 1, players: [{ id: 101, name: 'Ann' }], gameFormat: 'stroke' }, owner ? { ownerUid: owner } : {});
const played = extra => Object.assign({ createdAt: 1, players: [{ id: 101, name: 'Ann' }, { id: 102, name: 'Ben' }], gameFormat: 'stroke', courseData: [{ hole: 1, par: 4, hcpIndex: 1 }], scores: { p101_h1: 4 } }, extra);
function scenario() {
    const root = {
        events: {
            OWNED1: played({ eventName: 'Owned round', ownerUid: 'anon-org', organizerToken: 'tok-owned' }),
            EMAIL1: played({ eventName: 'Email owner', ownerUid: 'u-email' }),
            OWNEDEMPTY: { eventName: 'Owned, unscored', ownerUid: 'anon-org', createdAt: 1, players: [{ id: 101, name: 'Ann' }], gameFormat: 'stroke' },
            EXPIRED1: played({ eventName: "Expired owner's round", ownerUid: 'anon-expired' }),
            LEGACY1: played({ eventName: 'Legacy round' }),
            LEGACYEMPTY: { eventName: 'Legacy, unscored', createdAt: 1, players: [{ id: 101, name: 'Ann' }], gameFormat: 'stroke' }
        },
        organizers: {
            'anon-org': { firstSeenAt: NOW - 2 * DAY },
            'anon-expired': { firstSeenAt: NOW - 30 * DAY },
            'anon-passed': { firstSeenAt: NOW - 60 * DAY, pass: { type: 'season', expiresAt: NOW + 300 * DAY, transactionId: 't1' } },
            'anon-lapsed': { firstSeenAt: NOW - 60 * DAY, pass: { type: 'trip', expiresAt: NOW - DAY, transactionId: 't2' } },
            'anon-edge': { firstSeenAt: NOW - 21 * DAY + 3600000 },
            'u-email': { firstSeenAt: NOW - DAY }
        }
    };
    const users = { nobody: null, org: anon('anon-org'), stranger: anon('anon-stranger'), expired: anon('anon-expired'), passed: anon('anon-passed'), lapsed: anon('anon-lapsed'), edge: anon('anon-edge'), newcomer: anon('anon-new'),
        email: { uid: 'u-email', provider: 'password', token: { firebase: { sign_in_provider: 'password' } } } };
    const participation = code => ({
        [`events/${code}/scores/p102_h1`]: { canWrite: [{ auth: 'nobody', data: 5 }, { auth: 'stranger', data: 5 }, { auth: 'org', data: 5 }], cannotWrite: [{ auth: 'nobody', data: 0 }, { auth: 'nobody', data: 'x' }] },
        [`events/${code}/scores/p101_h1`]: { canWrite: [{ auth: 'nobody', data: 6 }, { auth: 'nobody', data: null }] },
        [`events/${code}/scores/p101_h2`]: { canWrite: [{ auth: 'nobody', data: 3 }] },
        [`events/${code}/kpWinners/h3`]: { canWrite: [{ auth: 'nobody', data: '101' }] },
        [`events/${code}/kpConfirmed`]: { canWrite: [{ auth: 'nobody', data: { confirmed: true, at: 1 } }] },
        [`events/${code}/sideMatches/m1`]: { canWrite: [{ auth: 'nobody', data: { format: 'match', stake: 20, teamAIds: ['101'], teamBIds: ['102'] } }], cannotWrite: [{ auth: 'nobody', data: { format: 'match', stake: -5, teamAIds: ['101'], teamBIds: ['102'] } }] },
        [`events/${code}/sideMatches/m1/presses/p1`]: { canWrite: [{ auth: 'nobody', data: { startHole: 10, stake: 10, createdAt: 1 } }] },
        [`events/${code}/matchPresses/mp1`]: { canWrite: [{ auth: 'nobody', data: { startHole: 12, stake: 10 } }] },
        [`events/${code}/dots/h4`]: { canWrite: [{ auth: 'nobody', data: { p101: ['birdie'] } }] },
        [`events/${code}/auditLog/a1`]: { canWrite: [{ auth: 'nobody', data: { ts: 1, what: 'score' } }] },
        [`events/${code}/scoresVerified`]: { canWrite: [{ auth: 'nobody', data: { verified: true, verifiedAt: 1, verifiedBy: 'round' } }] },
        [`events/${code}/kpLeaders/h3`]: { canWrite: [{ auth: 'nobody', data: { playerId: '101', playerName: 'Ann' } }] },
        [`events/${code}/wolfCalls/h3`]: { canWrite: [{ auth: 'nobody', data: { caller: 101 } }, { auth: 'nobody', data: null }] },
        [`events/${code}/strokePresses/sp1`]: { canWrite: [{ auth: 'nobody', data: { startHole: 2, stake: 10 } }] },
        [`events/${code}/ryderFoursomes/m1/A/h1`]: { canWrite: [{ auth: 'nobody', data: 4 }, { auth: 'nobody', data: null }] },
        [`events/${code}/additionalGameInstances/i1`]: { canWrite: [{ auth: 'nobody', data: { format: 'skins' } }] }
    });
    const tests = Object.assign({
        // CREATION - the gate
        'events/NEW1': {
            cannotWrite: [
                { auth: 'nobody', data: ROUND(null) }, { auth: 'nobody', data: ROUND('anon-org') },
                { auth: 'newcomer', data: ROUND('anon-new') }, { auth: 'newcomer', data: ROUND(null) },
                { auth: 'expired', data: ROUND('anon-expired') }, { auth: 'lapsed', data: ROUND('anon-lapsed') },
                { auth: 'org', data: ROUND(null) }, { auth: 'org', data: ROUND('anon-stranger') }, { auth: 'stranger', data: ROUND('anon-org') }
            ],
            canWrite: [{ auth: 'org', data: ROUND('anon-org') }, { auth: 'passed', data: ROUND('anon-passed') }, { auth: 'edge', data: ROUND('anon-edge') }, { auth: 'email', data: ROUND('u-email') }]
        },
        'events/NEW2': { cannotWrite: [{ auth: 'expired', data: ROUND('anon-expired') }] },
        // LEGACY whole-record writes, as today; no claim path
        'events/LEGACY1': { canWrite: [{ auth: 'nobody', data: played({ eventName: 'Legacy round renamed', gameFormat: 'nassau' }) }],
            cannotWrite: [{ auth: 'nobody', data: null }, { auth: 'org', data: played({ eventName: 'claimed', ownerUid: 'anon-org' }) }] },
        'events/LEGACYEMPTY': { canWrite: [{ auth: 'nobody', data: null }, { auth: 'nobody', data: { eventName: 'still legacy', createdAt: 1, players: [{ id: 101, name: 'Ann' }], gameFormat: 'stroke' } }] },
        'events/LEGACY1/ownerUid': { cannotWrite: [{ auth: 'stranger', data: 'anon-stranger' }, { auth: 'nobody', data: 'anon-org' }, { auth: 'org', data: 'anon-org' }] },
        // OWNED whole-record writes: the owner re-saves; ownerUid never taken, changed or dropped; deletion as today (unscored only)
        'events/OWNED1': { canWrite: [{ auth: 'org', data: played({ eventName: 'Owned, re-saved by its owner', ownerUid: 'anon-org', organizerToken: 'tok-owned', gameFormat: 'nassau' }) }],
            cannotWrite: [{ auth: 'nobody', data: null }, { auth: 'org', data: null },
                { auth: 'nobody', data: played({ eventName: 'wiped by a code holder', ownerUid: 'anon-org' }) },
                { auth: 'stranger', data: played({ eventName: 'taken', ownerUid: 'anon-stranger' }) },
                { auth: 'org', data: played({ eventName: 'owner dropped' }) }] },
        'events/OWNEDEMPTY': { canWrite: [{ auth: 'org', data: null }], cannotWrite: [{ auth: 'nobody', data: null }, { auth: 'stranger', data: null }] },
        'events/OWNED1/ownerUid': { cannotWrite: [{ auth: 'stranger', data: 'anon-stranger' }, { auth: 'org', data: 'anon-stranger' }, { auth: 'nobody', data: null }, { auth: 'org', data: null }], canWrite: [{ auth: 'org', data: 'anon-org' }] },
        // THE OWNER AFTER THE TRIAL
        'events/EXPIRED1': { canWrite: [{ auth: 'expired', data: played({ eventName: 'edited after the trial', ownerUid: 'anon-expired', gameFormat: 'nassau' }) }],
            cannotWrite: [{ auth: 'nobody', data: played({ eventName: 'taken after the trial', ownerUid: 'anon-expired' }) }] },
        'events/EXPIRED1/eventName': { canWrite: [{ auth: 'expired', data: 'renamed after the trial' }], cannotWrite: [{ auth: 'nobody', data: 'renamed by a code holder' }] },
        'events/EXPIRED1/scores/p101_h2': { canWrite: [{ auth: 'expired', data: 4 }, { auth: 'nobody', data: 4 }] },
        // SETUP on an owned round is the owner's. The token is on the record and still does not authorize.
        'events/OWNED1/players': { canWrite: [{ auth: 'org', data: [{ id: 101, name: 'Ann' }] }], cannotWrite: [{ auth: 'nobody', data: [] }, { auth: 'stranger', data: [{ id: 101, name: 'X' }] }] },
        'events/OWNED1/groupSizeOverrides': { canWrite: [{ auth: 'org', data: [4] }], cannotWrite: [{ auth: 'nobody', data: [2] }, { auth: 'stranger', data: [2] }] },
        'events/OWNED1/courseData': { canWrite: [{ auth: 'org', data: [{ hole: 1, par: 4, hcpIndex: 1 }] }], cannotWrite: [{ auth: 'nobody', data: [] }] },
        'events/OWNED1/moneyPool': { cannotWrite: [{ auth: 'nobody', data: { enabled: false } }, { auth: 'stranger', data: { enabled: true } }] },
        'events/OWNED1/flights': { cannotWrite: [{ auth: 'nobody', data: { enabled: true } }] },
        'events/OWNED1/additionalGames': { cannotWrite: [{ auth: 'stranger', data: ['nassau'] }] },
        'events/OWNED1/settlementMode': { cannotWrite: [{ auth: 'nobody', data: 'cents' }] },
        'events/OWNED1/supersededBy': { canWrite: [{ auth: 'org', data: 'OTHER1' }], cannotWrite: [{ auth: 'nobody', data: 'OTHER1' }, { auth: 'stranger', data: 'OTHER1' }, { auth: 'nobody', data: null }] },
        'events/OWNED1/organizerToken': { canWrite: [{ auth: 'org', data: 'tok-owned' }], cannotWrite: [{ auth: 'nobody', data: 'stolen' }, { auth: 'stranger', data: 'stolen' }, { auth: 'nobody', data: null }] },
        'events/OWNED1/eventName': { canWrite: [{ auth: 'org', data: 'renamed by its owner' }], cannotWrite: [{ auth: 'nobody', data: 'renamed by a code holder' }, { auth: 'stranger', data: 'taken' }] },
        'events/EMAIL1/players': { canWrite: [{ auth: 'email', data: [{ id: 101, name: 'Ann' }] }], cannotWrite: [{ auth: 'nobody', data: [] }, { auth: 'stranger', data: [] }, { auth: 'org', data: [{ id: 101, name: 'Ann' }] }] },
        'events/EMAIL1/scores/p101_h2': { canWrite: [{ auth: 'nobody', data: 4 }] },
        // LEGACY setup stays open. There is no owner to require.
        'events/LEGACY1/players': { canWrite: [{ auth: 'nobody', data: [{ id: 101, name: 'Ann' }, { id: 102, name: 'Ben' }] }] },
        'events/LEGACY1/groupSizeOverrides': { canWrite: [{ auth: 'nobody', data: [2] }] },
        'events/LEGACY1/eventName': { canWrite: [{ auth: 'nobody', data: 'renamed by a code holder - legacy' }] },
        'events/LEGACY1/organizerToken': { canWrite: [{ auth: 'nobody', data: 'late-token' }] },
        // ORGANIZERS
        'organizers/anon-new/firstSeenAt': { canWrite: [{ auth: 'newcomer', data: NOW - 1000 }], cannotWrite: [{ auth: 'nobody', data: NOW }, { auth: 'stranger', data: NOW }, { auth: 'newcomer', data: NOW + DAY }, { auth: 'newcomer', data: 'soon' }] },
        'organizers/anon-org/firstSeenAt': { cannotWrite: [{ auth: 'org', data: NOW }, { auth: 'org', data: NOW - 2 * DAY }, { auth: 'org', data: null }, { auth: 'stranger', data: NOW }] },
        'organizers/anon-new/pass': { cannotWrite: [{ auth: 'newcomer', data: { type: 'season', expiresAt: NOW + 300 * DAY, transactionId: 'fake' } }, { auth: 'nobody', data: { type: 'season', expiresAt: NOW + 300 * DAY } }] },
        'organizers/anon-passed/pass/expiresAt': { cannotWrite: [{ auth: 'passed', data: NOW + 900 * DAY }, { auth: 'nobody', data: NOW + 900 * DAY }] },
        'organizers/anon-lapsed/pass': { cannotWrite: [{ auth: 'lapsed', data: { type: 'season', expiresAt: NOW + 300 * DAY, transactionId: 'fake' } }] },
        'organizers/anon-new/anythingElse': { cannotWrite: [{ auth: 'newcomer', data: true }] },
        'organizers/anon-org': { canRead: ['org'], cannotRead: ['stranger', 'nobody', 'email'] },
        'organizers/anon-passed/pass': { canRead: ['passed'], cannotRead: ['org', 'nobody'] }
    }, participation('OWNED1'), participation('LEGACY1'));
    return { root, users, tests };
}
const SCENARIO = path.join(TMP, 'wave2.tests.json');
fs.writeFileSync(SCENARIO, JSON.stringify(scenario(), null, 1));

function run(rulesPath) {
    try { return { code: 0, out: strip(execFileSync(TARGARYEN, [rulesPath, SCENARIO, '--verbose'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) }; }
    catch (e) { return { code: e.status, out: strip((e.stdout || '') + (e.stderr || '')) }; }
}
// Every verdict row: [path, op, auth, expected, got]
const rows = out => out.split('\n').filter(l => l.startsWith(BAR + ' events/') || l.startsWith(BAR + ' organizers/')).map(l => l.split(BAR).map(c => c.trim()).filter(Boolean));
const wrong = out => rows(out).filter(r => r[3] !== r[4]);
const TOTAL = Object.values(scenario().tests).reduce((n, v) => n + ['canWrite', 'cannotWrite', 'canRead', 'cannotRead'].reduce((m, k) => m + (v[k] || []).length, 0), 0);

// ---------------------------------------------------------------------------
describe('THE DRAFT, against every scenario', () => {
    const r = run(RULES);
    const rs = rows(r.out);
    test('the scenario is substantial and every row ran', () => {
        assert.ok(TOTAL >= 90, 'rows: ' + TOTAL);
        assert.equal(rs.length, TOTAL, r.out.slice(-600));
    });
    test('0 failures: creation gated, participation open, legacy unchanged, the owner after the trial, firstSeenAt once, pass unwritable', () => {
        assert.deepEqual(wrong(r.out), [], r.out.slice(-1200));
        assert.equal(r.code, 0);
    });
    test('THE MONDAY ROWS: every participation write by NOBODY on the owned round and on the legacy one is allowed', () => {
        const monday = rs.filter(x => x[2] === 'null' && /^events\/(OWNED1|LEGACY1)\/(scores|kpWinners|kpConfirmed|sideMatches|matchPresses|dots|auditLog|scoresVerified|groupSizeOverrides|eventName)/.test(x[0]) && x[3] === '✓');
        assert.ok(monday.length >= 26, 'unauthenticated participation rows: ' + monday.length);
        monday.forEach(x => assert.equal(x[4], '✓', x.join(' | ')));
    });
});

// ---------------------------------------------------------------------------
describe('THE CONTROLS - each mutation of a COPY of the rules is caught by named rows', () => {
    const base = JSON.parse(fs.readFileSync(RULES, 'utf8'));
    const ev = () => JSON.parse(JSON.stringify(base));
    function control(name, mutate, mustFail) {
        test(name, () => {
            const r = ev(); mutate(r.rules);
            const p = path.join(TMP, name.replace(/[^a-z0-9]+/gi, '_') + '.json');
            fs.writeFileSync(p, JSON.stringify(r));
            const w = wrong(run(p).out);
            assert.ok(w.length > 0, 'the control did not fire');
            mustFail.forEach(([re, auth]) => assert.ok(w.some(x => re.test(x[0]) && (auth === undefined || x[2] === auth)), name + ': expected a wrong verdict on ' + re + ' as ' + auth + '; got ' + JSON.stringify(w.map(x => x[0] + '/' + x[2]))));
        });
    }
    const write = r => r.events.$eventCode['.write'];
    control('the trial and pass clause removed (any identified user creates forever)', r => { r.events.$eventCode['.write'] = write(r).replace(/ && \(\(root\.child\('organizers\/' \+ auth\.uid \+ '\/firstSeenAt'\)[\s\S]*?\)\)\)/, ')'); },
        [[/^events\/NEW1$/, 'newcomer'], [/^events\/NEW1$/, 'expired'], [/^events\/NEW1$/, 'lapsed'], [/^events\/NEW2$/, 'expired']]);
    control('the ownerUid === auth.uid check dropped from creation', r => { r.events.$eventCode['.write'] = write(r).replace("newData.child('ownerUid').val() === auth.uid && ", ''); r.events.$eventCode.ownerUid['.validate'] = '(!data.parent().exists() && auth != null) || (data.exists() && newData.val() === data.val())'; },
        [[/^events\/NEW1$/, 'org']]);   // org creating with no owner / a stranger's uid gets through; the stranger still has no trial
    control('creation opened to nobody (auth != null dropped)', r => { r.events.$eventCode['.write'] = "(!data.exists()) || (data.exists() && (newData.exists() || !data.hasChild('scores')))"; r.events.$eventCode.ownerUid['.validate'] = '(!data.parent().exists()) || (data.exists() && newData.val() === data.val())'; },
        [[/^events\/NEW1$/, 'null'], [/^events\/NEW1$/, 'newcomer']]);
    control('PARTICIPATION requiring auth - the mutation that breaks Mondays', r => {
        ['scores', 'kpLeaders', 'kpWinners', 'kpConfirmed', 'sideMatches', 'matchPresses', 'strokePresses', 'dots', 'auditLog', 'scoresVerified', 'wolfCalls', 'ryderCup', 'ryderCupRef', 'ryderFoursomes', 'additionalGameInstances'].forEach(k => {
            r.events.$eventCode[k]['.write'] = 'auth != null && ' + r.events.$eventCode[k]['.write'];
        });
    }, [[/^events\/OWNED1\/scores\/p102_h1$/, 'null'], [/^events\/OWNED1\/kpWinners\/h3$/, 'null'], [/^events\/OWNED1\/dots\/h4$/, 'null'], [/^events\/OWNED1\/ryderFoursomes\/m1\/A\/h1$/, 'null'], [/^events\/EMAIL1\/scores\/p101_h2$/, 'null']]);
    // A child .write:false cannot revoke a parent grant. Legacy Monday is the
    // parent clause, so requiring auth on the play grants does not touch it.
    // The rows above are the owned rounds, where the child grant is the only
    // reason a code-holder can score.
    control('a legacy round required to carry an owner', r => { r.events.$eventCode['.validate'] = "newData.val() === null || (newData.hasChildren() && newData.hasChild('ownerUid'))"; },
        [[/^events\/LEGACY1$/, 'null'], [/^events\/LEGACY1\/scores\/p102_h1$/, 'null']]);
    control('the owner locked out after the trial (existing owned writes gated by the window)', r => { r.events.$eventCode['.write'] = write(r).replace("auth.uid === data.child('ownerUid').val() && (newData.exists()", "auth.uid === data.child('ownerUid').val() && now < root.child('organizers/' + auth.uid + '/firstSeenAt').val() + 1814400000 && (newData.exists()"); },
        [[/^events\/EXPIRED1$/, 'expired'], [/^events\/EXPIRED1\/eventName$/, 'expired']]);
    control('the owner check dropped from existing owned rounds (setup opens to any code-holder)', r => { r.events.$eventCode['.write'] = write(r).replace("data.hasChild('ownerUid') && auth != null && auth.uid === data.child('ownerUid').val() && ", "data.hasChild('ownerUid') && "); },
        [[/^events\/OWNED1\/players$/, 'null'], [/^events\/OWNED1\/organizerToken$/, 'null'], [/^events\/OWNEDEMPTY$/, 'null'], [/^events\/EMAIL1\/players$/, 'null']]);
    control('ownerUid takeable on a legacy round (the immutability clause dropped; an owned round is already refused by the parent write)', r => { r.events.$eventCode.ownerUid['.validate'] = 'auth != null && newData.val() === auth.uid'; },
        [[/^events\/LEGACY1\/ownerUid$/, 'stranger'], [/^events\/LEGACY1\/ownerUid$/, 'org'], [/^events\/LEGACY1$/, 'org']]);
    control('ownerUid claimable on a legacy round (data.parent() check dropped)', r => { r.events.$eventCode.ownerUid['.validate'] = '(!data.exists() && auth != null && newData.val() === auth.uid) || (data.exists() && newData.val() === data.val())'; },
        [[/^events\/LEGACY1\/ownerUid$/, 'org'], [/^events\/LEGACY1$/, 'org']]);
    control('firstSeenAt overwritable (write-once dropped)', r => { r.organizers.$uid.firstSeenAt['.write'] = 'auth != null && auth.uid === $uid'; },
        [[/^organizers\/anon-org\/firstSeenAt$/, 'org']]);
    control('firstSeenAt writable by another uid', r => { r.organizers.$uid.firstSeenAt['.write'] = '!data.exists() && auth != null'; },
        [[/^organizers\/anon-new\/firstSeenAt$/, 'stranger']]);
    control('firstSeenAt allowed in the future (an extendable window)', r => { r.organizers.$uid.firstSeenAt['.validate'] = 'newData.isNumber()'; },
        [[/^organizers\/anon-new\/firstSeenAt$/, 'newcomer']]);
    control('the pass writable by its own uid', r => { r.organizers.$uid.pass['.write'] = 'auth != null && auth.uid === $uid'; },
        [[/^organizers\/anon-new\/pass$/, 'newcomer'], [/^organizers\/anon-passed\/pass\/expiresAt$/, 'passed'], [/^organizers\/anon-lapsed\/pass$/, 'lapsed']]);
    control('an organizer readable by anyone', r => { r.organizers.$uid['.read'] = true; },
        [[/^organizers\/anon-org$/], [/^organizers\/anon-passed\/pass$/]]);
    test('removing ONLY the scores grant refuses a code-holder on an owned round and still allows the legacy round', () => {
        const r = ev();
        delete r.rules.events.$eventCode.scores['.write'];
        const p = path.join(TMP, 'scores_grant_removed.json');
        fs.writeFileSync(p, JSON.stringify(r));
        const w = wrong(run(p).out);
        assert.ok(w.some(x => /^events\/OWNED1\/scores\/p102_h1$/.test(x[0]) && x[2] === 'null'), 'owned score by nobody must go red: ' + JSON.stringify(w.map(x => x[0] + '/' + x[2])));
        assert.ok(!w.some(x => /^events\/LEGACY1\/scores\/p102_h1$/.test(x[0])), 'legacy scores stay open through the parent: ' + JSON.stringify(w.filter(x => /LEGACY1\/scores/.test(x[0]))));
        assert.ok(w.some(x => /^events\/EMAIL1\/scores\/p101_h2$/.test(x[0]) && x[2] === 'null'), 'an owned round must not keep scoring through the parent');
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAM - two meanings of auth, kept apart', () => {
    const rules = JSON.parse(fs.readFileSync(RULES, 'utf8')).rules;
    test('events ownerUid: NO provider check (the organizer is an anonymous user by design); tournaments ownerUid: a non-anonymous provider REQUIRED', () => {
        const ev = rules.events.$eventCode.ownerUid['.validate'];
        const to = rules.tournaments.$tourneyCode.ownerUid['.validate'];
        assert.ok(!/sign_in_provider/.test(ev), 'events must not check the provider: ' + ev);
        assert.match(to, /auth\.token\.firebase\.sign_in_provider !== 'anonymous'/);
        assert.match(ev, /!data\.parent\(\)\.exists\(\) && auth != null && newData\.val\(\) === auth\.uid/);
        assert.match(rules.events.$eventCode['.write'], /newData\.child\('ownerUid'\)\.val\(\) === auth\.uid/);
        assert.ok(!/sign_in_provider/.test(rules.events.$eventCode['.write']));
    });
    test('the trial is 21 days or a pass on CREATE only; an owned round is the owner; a legacy round stays the old open rule; pass is unwritable', () => {
        const w = rules.events.$eventCode['.write'];
        const ev = rules.events.$eventCode;
        assert.match(w, /now < root\.child\('organizers\/' \+ auth\.uid \+ '\/firstSeenAt'\)\.val\(\) \+ 1814400000/);
        assert.match(w, /root\.child\('organizers\/' \+ auth\.uid \+ '\/pass\/expiresAt'\)\.val\(\) > now/);
        assert.match(w, /data\.exists\(\) && data\.hasChild\('ownerUid'\) && auth != null && auth\.uid === data\.child\('ownerUid'\)\.val\(\) && \(newData\.exists\(\) \|\| !data\.hasChild\('scores'\)\)/);
        assert.ok(w.endsWith("|| (data.exists() && !data.hasChild('ownerUid') && (newData.exists() || !data.hasChild('scores')))"), 'legacy: ' + w.slice(-110));
        assert.ok(!/organizerToken/.test(w), 'the token is world-readable and is not a rules credential');
        const open = "root.child('events/' + $eventCode).exists()";
        ['scores', 'kpLeaders', 'kpWinners', 'kpConfirmed', 'sideMatches', 'matchPresses', 'strokePresses', 'dots', 'auditLog', 'scoresVerified', 'wolfCalls', 'ryderCup', 'ryderCupRef', 'ryderFoursomes', 'additionalGameInstances'].forEach(k => {
            assert.equal(ev[k]['.write'], open, k);
            assert.ok(!/auth/.test(ev[k]['.write']), k + ' must stay open to a code-holder');
        });
        ['players', 'groupSizeOverrides', 'moneyPool', 'flights', 'additionalGames', 'courseData', 'settlementMode', 'supersededBy', 'organizerToken', 'eventName', 'skinsBuyIn', 'kpCancelled'].forEach(k => {
            assert.equal(ev[k] && ev[k]['.write'], undefined, k + ' has no child grant; the parent owner clause is the only write');
        });
        assert.equal(rules.organizers.$uid.firstSeenAt['.write'], '!data.exists() && auth != null && auth.uid === $uid');
        assert.equal(rules.organizers.$uid.firstSeenAt['.validate'], 'newData.isNumber() && newData.val() <= now');
        assert.equal(rules.organizers.$uid.pass['.write'], false);
        assert.equal(rules.organizers.$uid['.read'], 'auth != null && auth.uid === $uid');
    });
    test('the tournaments block is the NARROWED one (2026-09-18): owner-only structure, scores open one key at a time', () => {
        // Until 2026-09-18 this pinned the 075c7a4 block verbatim ("!data.exists()
        // || newData.exists()" - any code-holder writes any child). The narrowing
        // wave replaced it; tournaments_rules_isolation_test.js proves each refusal
        // is ownership's. This pin keeps the two seams apart: events/ ownerUid has
        // no provider check, tournaments/ ownerUid does - unchanged by the narrowing.
        const t = rules.tournaments.$tourneyCode;
        assert.equal(t['.read'], true);
        assert.equal(t['.write'], "(!data.exists() && auth != null && newData.child('ownerUid').val() === auth.uid) || (data.exists() && newData.exists() && auth != null && auth.uid === data.child('ownerUid').val())");
        assert.equal(t['.validate'], "(newData.hasChildren() || newData.val() === null) && (!data.hasChild('ownerUid') || newData.hasChild('ownerUid'))");
        assert.equal(t.ownerUid['.validate'], "(!data.exists() && auth != null && auth.token.firebase.sign_in_provider !== 'anonymous' && newData.val() === auth.uid) || (data.exists() && newData.val() === data.val())");
        // Candidate 2 (the same day): the grant requires the record - and the
        // round - to exist; `true` let a stranger squat a code (HANDOFF, "The squat").
        assert.equal(t.scores.$scoreKey['.write'], "root.child('tournaments/' + $tourneyCode).exists()");
        assert.equal(t.rounds.$roundId.scores.$scoreKey['.write'], "root.child('tournaments/' + $tourneyCode + '/rounds/' + $roundId).exists()");
        assert.deepEqual(Object.keys(t).sort(), ['.read', '.validate', '.write', 'ownerUid', 'rounds', 'scores']);
    });
});
