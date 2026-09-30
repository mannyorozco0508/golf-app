// ============================================================================
// DELETING ONE GROUP FROM MY GROUPS - AND WHY THERE IS NO "LEAVE GROUP"
//
// WHAT WAS ASKED FOR: a trash icon on every row, one confirm, the owner deletes the
// group and its co-organizer invites, and a CO-ORGANIZER gets "Leave group" instead,
// removing only themselves.
//
// THE FIRST HALF IS BUILT. THE SECOND CANNOT BE, and this is measured against the
// LIVE ruleset - database.rules.stage2delete.json, published 2026-09-30 - rather than
// read off it. The five rows in the first block below, through targaryen:
//
//   owner deletes organizers/<owner>/groups/<gid>              allowed
//   owner deletes sharedGroups/<coKey>/<owner>/<gid>           allowed
//   co-organizer deletes the group                             REFUSED
//   co-organizer deletes their own coOrganizers/<key> entry     REFUSED
//   co-organizer deletes their own sharedGroups pointer         REFUSED
//
// Every grant on this subtree is auth.uid === the OWNER: coOrganizers is owner-write,
// and sharedGroups/$emailKey/$ownerUid/$groupId is written by the OWNER of that uid,
// not by the person whose email is in the path. So a co-organizer cannot remove
// themselves from anything at all. "Leave group" needs a rules change, which is
// STRICT and Manny's call, so it is NOT built and nothing pretends it is: a shared
// row carries no trash and says "Only the organizer who shared this can remove it
// from the list." A button that is refused every time would be worse than no button.
//
// WHAT THE RULES DELTA WOULD BE, if Manny wants it later - recorded so the next
// person does not have to re-derive it, and NOT written anywhere:
//   organizers/$uid/groups/$groupId/coOrganizers/$emailKey gains a .write allowing
//   newData.val() === null when auth.token.email.toLowerCase().replace('.', ',')
//   === $emailKey, and sharedGroups/$emailKey/$ownerUid/$groupId gains the same.
//   Two keys, both delete-only, both keyed on the leaver's own email.
//
// ORDER: THE POINTERS FIRST. Their paths are only knowable while the group is still
// there, and a group deleted with a live pointer still aimed at it leaves a row in
// somebody else's list that can never be opened or removed. Same reasoning as the
// account delete, and the same shape of plan.
//
// WHAT THIS FILE CANNOT PROVE. mini-dom has no layout: "the trash is on the row"
// here means the markup the renderer produced, never that a thumb could hit it. And
// targaryen is not the Firebase emulator - which cannot load these rules at all, and
// does not enforce them over REST; rules_stage2_delete_test.js carries that
// measurement in full.
//
// THE BASELINE, all 16 tests, against main fe2dd24 - where My Groups has no delete
// of any kind:
//
//     0 PASS / 16 FAIL
//
// I had guessed 5 PASS, reasoning that the rules block measures a ruleset this wave
// does not change. Wrong twice over: database.rules.stage2delete.json is committed on
// THIS BRANCH and is not on main at all, so the rules tests find no file, and
// require('./my-groups.js') throws on the first missing export, which takes the rest
// with it. Measured: 0 / 16.
//
// The rules block still belongs here even though it earns nothing from the app
// change: the DESIGN depends on those five verdicts, and if a rules publish ever
// grants a co-organizer a write on this subtree, the "no leave button" decision is
// wrong and this file is where that shows up.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('admin.html');
const MG = require('./my-groups.js');

// ===========================================================================
// 1. THE LIVE RULES
// ===========================================================================
const TARGARYEN = path.join(REPO_ROOT, 'node_modules', '.bin', 'targaryen');
const LIVE_RULES = path.join(REPO_ROOT, 'database.rules.stage2delete.json');
const OWNER = 'u-owner', CO = 'u-co';
const CO_EMAIL = 'A.Person@Gmail.com';
const CO_KEY = 'a,person@gmail,com';
const GROUP = {
    name: 'Thursday game', ownerUid: OWNER, createdAt: 1, updatedAt: 1,
    coOrganizers: { [CO_KEY]: true },
    members: { marty: { name: 'Marty', hcp: '9' } }
};
const ROOT = {
    events: { ZZTEST: { eventName: 'Thursday', ownerUid: OWNER } },
    organizers: { [OWNER]: { firstSeenAt: 1, groups: { g1: GROUP } } },
    sharedGroups: { [CO_KEY]: { [OWNER]: { g1: true } } }
};
const USERS = {
    owner: { uid: OWNER, provider: 'password', token: { email: 'owner@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    co: { uid: CO, provider: 'password', token: { email: CO_EMAIL, email_verified: true, firebase: { sign_in_provider: 'password' } } }
};
const ROWS = [
    { id: 'G1', who: 'owner', verdict: 'allow', path: 'organizers/' + OWNER + '/groups/g1',
      why: 'the trash icon: the owner removes one group and the list re-renders without it' },
    { id: 'G2', who: 'owner', verdict: 'allow', path: 'sharedGroups/' + CO_KEY + '/' + OWNER + '/g1',
      why: 'and takes the co-organizer invite with it, per leaf, which is why the plan enumerates them' },
    { id: 'G3', who: 'co', verdict: 'refuse', path: 'organizers/' + OWNER + '/groups/g1',
      why: 'a co-organizer must not be able to delete somebody elses group out from under them' },
    { id: 'G4', who: 'co', verdict: 'refuse', path: 'organizers/' + OWNER + '/groups/g1/coOrganizers/' + CO_KEY,
      why: 'THE REASON THERE IS NO LEAVE GROUP: they cannot even remove their own invite' },
    { id: 'G5', who: 'co', verdict: 'refuse', path: 'sharedGroups/' + CO_KEY + '/' + OWNER + '/g1',
      why: 'nor their own pointer - the write is granted to the OWNER of that uid, not to the email in the path' }
];
function runRules() {
    const tests = {};
    ROWS.forEach(r => {
        const entry = tests[r.path] || {};
        const bucket = r.verdict === 'allow' ? 'canWrite' : 'cannotWrite';
        entry[bucket] = (entry[bucket] || []).concat([{ auth: r.who, data: null }]);
        tests[r.path] = entry;
    });
    const f = path.join(os.tmpdir(), 'mg-delete-rules-' + process.pid + '.json');
    fs.writeFileSync(f, JSON.stringify({ root: ROOT, users: USERS, tests: tests }, null, 1));
    try { return { code: 0, out: execFileSync(TARGARYEN, [LIVE_RULES, f], { encoding: 'utf8' }) }; }
    catch (e) { return { code: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}

describe('WHO MAY DELETE A GROUP, UNDER THE RULES THAT ARE RUNNING', () => {

    test('the table has both verdicts and a reason each', () => {
        assert.ok(ROWS.filter(r => r.verdict === 'allow').length >= 2);
        assert.ok(ROWS.filter(r => r.verdict === 'refuse').length >= 3);
        ROWS.forEach(r => assert.ok(r.why && r.why.length > 25, r.id + ' must say why'));
        assert.ok(fs.existsSync(LIVE_RULES), 'the live ruleset since 2026-09-30');
    });

    test('EVERY verdict holds: the owner may, a co-organizer may not - not even to leave', () => {
        const { code, out } = runRules();
        assert.equal(code, 0, 'targaryen disagreed:\n' + out.slice(-3000));
        assert.match(out, /0 failures in \d+ tests/, out.slice(-2000));
    });

    test('and the app does not offer what the rules refuse', () => {
        // The pair that would otherwise drift: a Leave button appearing later while
        // the rules still refuse it, or this test staying green after the rules gain
        // the grant and the button becomes possible.
        // A HANDLER, NOT PROSE. My first draft banned the phrase "Leave group" in
        // admin.html and went red on my OWN COMMENT explaining why there is no such
        // button - the same trap this repo has hit twice with the paywall-word scan.
        // What is checkable is that no handler exists and nothing calls one.
        assert.ok(!/leaveMyGroup|leaveGroup\s*\(/.test(SRC),
            'no leave handler while the rules refuse every write a leaver would need');
        assert.match(SRC, /Only the organizer who shared this can remove it from the list/,
            'a shared row must say who can remove it');
    });
});

// ===========================================================================
// 2. THE PLAN AND THE WORDS
// ===========================================================================
describe('THE PLAN, AND THE SENTENCE THE GOLFER READS', () => {

    test('the confirm says the golfers leave the LIST and rounds are untouched', () => {
        const m = MG.myGroupDeleteConfirm('Thursday game');
        assert.match(m, /^Delete Thursday game\?/);
        assert.match(m, /only removed from this saved list/i);
        assert.match(m, /Rounds are not affected/i,
            'the one thing somebody would be afraid of has to be answered in the confirm: ' + m);
        assert.match(MG.myGroupDeleteConfirm(''), /^Delete this group\?/, 'a nameless group still reads properly');
    });

    test('pointers first, then the group', () => {
        const plan = MG.myGroupDeletePlan('u9', 'g1', {
            coOrganizers: { 'a,b@c,com': true, 'd,e@f,com': true, 'gone@x,com': false }
        });
        assert.deepEqual(plan.removals, [
            'sharedGroups/a,b@c,com/u9/g1',
            'sharedGroups/d,e@f,com/u9/g1',
            'organizers/u9/groups/g1'
        ], 'a coOrganizers entry that is not true is not a pointer');
        assert.equal(plan.pointerCount, 2);
        assert.equal(plan.removals[plan.removals.length - 1], 'organizers/u9/groups/g1',
            'the group goes LAST - its pointer paths are only knowable while it exists');
    });

    test('a group with no co-organizers is one removal', () => {
        [null, undefined, {}, { coOrganizers: {} }].forEach(g => {
            const plan = MG.myGroupDeletePlan('u9', 'g1', g);
            assert.deepEqual(plan.removals, ['organizers/u9/groups/g1'], JSON.stringify(g));
            assert.equal(plan.pointerCount, 0);
        });
    });

    test('NOTHING IN THE PLAN TOUCHES A ROUND', () => {
        const plan = MG.myGroupDeletePlan('u9', 'g1', GROUP);
        plan.removals.forEach(p => assert.ok(!/^events/.test(p), p));
    });
});

// ===========================================================================
// 3. THE LIST, RENDERED. The page's own renderer, driven through its own state.
// ===========================================================================
describe('THE TRASH IS ON EVERY ROW THE OWNER OWNS, AND ON NO OTHER', () => {

    // THE PANEL OPENS ITSELF, off the database, which is how a golfer gets here.
    // myGroupsState is a `let` in the page and therefore not reachable from the
    // sandbox at all - which is the right constraint: seeding the READ and letting
    // openMyGroupsModal do its own work is the entry point, and calling the renderer
    // by name would prove the renderer works rather than that the list does.
    const DEFAULT_GROUPS = {
        g1: { name: 'Thursday game', ownerUid: 'u9', updatedAt: 2, members: { a: { name: 'Marty' }, b: { name: 'Reese' } } },
        g2: { name: 'Sunday game', ownerUid: 'u9', updatedAt: 1, members: { a: { name: 'Manny' } } }
    };
    async function page(opts) {
        const o = opts || {};
        const sb = loadHtmlInlineScript('admin.html', ['my-groups.js', 'account-exit.js']);
        sb.__auth.setUser({ uid: 'u9', isAnonymous: false, email: 'me@example.com' });
        const reads = {
            'organizers/u9/groups': o.groups !== undefined ? o.groups : DEFAULT_GROUPS,
            'sharedGroups/me@example,com': o.pointers || null
        };
        Object.keys(o.sharedGroupData || {}).forEach(k => { reads[k] = o.sharedGroupData[k]; });
        sb.__dbReads = reads;
        sb.uiFail = (m) => { throw new Error('uiFail on open: ' + m); };
        await sb.openMyGroupsModal();
        return sb;
    }
    const listHtml = sb => sb.document.getElementById('my-groups-body').innerHTML;

    test('every owned row carries a trash button wired to deleteMyGroup', async () => {
        const html = listHtml(await page());
        assert.equal((html.match(/deleteMyGroup\('/g) || []).length, 2, 'one per owned row');
        assert.match(html, /deleteMyGroup\('g1'\)/);
        assert.match(html, /deleteMyGroup\('g2'\)/);
        assert.match(html, /aria-label="Delete group"/, 'an icon with no label says nothing to a screen reader');
        // The glyph itself, decoded: the file writes it as an escape, which is what
        // a JS string in markup has to do here.
        assert.ok(html.indexOf('🗑') > -1, 'the trash glyph must be in the rendered row');
    });

    test('it sits beside Start from this, not instead of it', async () => {
        const html = listHtml(await page());
        assert.ok(html.indexOf('Start from this') < html.indexOf('deleteMyGroup'),
            'Start from this is the primary action and stays first');
        assert.equal((html.match(/Start from this/g) || []).length, 2, 'both rows keep their picker');
    });

    test('A SHARED ROW HAS NO TRASH, and says who can remove it', async () => {
        const sb = await page({
            groups: {},
            pointers: { 'u-other': { gs: true } },
            sharedGroupData: { 'organizers/u-other/groups/gs': { name: 'Their game', ownerUid: 'u-other', updatedAt: 3, members: { a: { name: 'Marty' } } } }
        });
        const html = listHtml(sb);
        assert.match(html, /shared with you/);
        assert.ok(html.indexOf('deleteMyGroup') === -1,
            'a co-organizer cannot delete the group NOR leave it - every write is the owners');
        assert.match(html, /Only the organizer who shared this can remove it from the list/);
        assert.match(html, /Start from this/, 'they can still start a round from it');
    });

    test('OWNED AND SHARED TOGETHER: one trash, on the owned row only', async () => {
        const sb = await page({
            groups: { g1: { name: 'Mine', ownerUid: 'u9', updatedAt: 5, members: { a: { name: 'A' } } } },
            pointers: { 'u-other': { gs: true } },
            sharedGroupData: { 'organizers/u-other/groups/gs': { name: 'Theirs', ownerUid: 'u-other', updatedAt: 4, members: { a: { name: 'B' } } } }
        });
        const html = listHtml(sb);
        assert.equal((html.match(/deleteMyGroup\('/g) || []).length, 1);
        assert.match(html, /deleteMyGroup\('g1'\)/);
        assert.ok(html.indexOf('deleteMyGroup(\'gs\')') === -1);
    });

    test('THE EMPTY LIST IS THE FIRST-TIME PANEL, which is what a delete can leave behind', async () => {
        const html = listHtml(await page({ groups: {} }));
        assert.match(html, /Create your first group/);
        assert.match(html, /Paste a list of players/);
        assert.ok(html.indexOf('deleteMyGroup') === -1, 'nothing to delete');
    });

    test('deleting the last group leaves that panel, and removes both paths', async () => {
        // Driven through the page's own handler, with uiConfirm answering yes -
        // which is how a golfer reaches it. The db stub records every remove.
        const sb = await page({
            groups: { g1: { name: 'Thursday game', ownerUid: 'u9', updatedAt: 2,
                            coOrganizers: { 'a,b@c,com': true }, members: { a: { name: 'Marty' } } } }
        });
        const asked = [];
        sb.uiConfirm = (opts) => { asked.push(opts); return Promise.resolve(true); };
        sb.uiToast = () => {};
        sb.uiRefuse = () => {};
        sb.uiFail = (m) => { throw new Error('uiFail: ' + m); };
        await sb.deleteMyGroup('g1');
        assert.equal(asked.length, 1, 'ONE confirm, not two');
        assert.match(asked[0].title, /^Delete Thursday game\?/);
        assert.match(asked[0].title, /Rounds are not affected/);
        assert.equal(asked[0].danger, true);
        assert.deepEqual(sb.__dbWrites.map(w => w.op + ' ' + w.path), [
            'remove sharedGroups/a,b@c,com/u9/g1',
            'remove organizers/u9/groups/g1'
        ], 'the pointer first, then the group');
        assert.match(listHtml(sb), /Create your first group/,
            'the empty list must be the first-time panel, not a blank box');
        assert.ok(listHtml(sb).indexOf('Thursday game') === -1, 'and the row is gone');
    });

    test('CANCEL deletes nothing', async () => {
        const sb = await page();
        sb.uiConfirm = () => Promise.resolve(false);
        sb.uiToast = () => {};
        sb.uiFail = (m) => { throw new Error('uiFail: ' + m); };
        await sb.deleteMyGroup('g1');
        assert.deepEqual(sb.__dbWrites, [], 'not one write');
        assert.match(listHtml(sb), /Thursday game/, 'both rows stay');
        assert.match(listHtml(sb), /Sunday game/);
    });

    test('a REFUSED pointer removal leaves the group alone', async () => {
        // A group that is gone while a pointer still aims at it is a row in somebody
        // else s list that can never be opened or removed.
        const sb = await page({
            groups: { g1: { name: 'Thursday game', ownerUid: 'u9', updatedAt: 2,
                            coOrganizers: { 'a,b@c,com': true }, members: { a: { name: 'Marty' } } } }
        });
        sb.__dbRefuse = (p, op) => (op === 'remove' && /^sharedGroups/.test(p))
            ? Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' }) : null;
        const failed = [];
        sb.uiConfirm = () => Promise.resolve(true);
        sb.uiToast = () => {};
        sb.uiFail = (m) => { failed.push(m); };
        await sb.deleteMyGroup('g1');
        assert.equal(failed.length, 1, 'it must say so: ' + JSON.stringify(failed));
        assert.match(failed[0], /Could not delete it/);
        assert.deepEqual(sb.__dbWrites.map(w => w.path), ['sharedGroups/a,b@c,com/u9/g1'],
            'the group removal must not be attempted after the pointer failed');
        assert.match(listHtml(sb), /Thursday game/, 'and the row stays');
    });

    test('a co-organizer calling the handler directly is refused, not obeyed', async () => {
        // Hiding a button is not a permission. The handler checks ownership itself,
        // and the rules refuse it underneath - this is the middle layer.
        const sb = await page({
            groups: {},
            pointers: { 'u-other': { gs: true } },
            sharedGroupData: { 'organizers/u-other/groups/gs': { name: 'Theirs', ownerUid: 'u-other', updatedAt: 3, members: {} } }
        });
        const refused = [];
        sb.uiRefuse = (m) => { refused.push(m); };
        sb.uiConfirm = () => { throw new Error('it must not even ask'); };
        sb.uiFail = (m) => { throw new Error('uiFail: ' + m); };
        await sb.deleteMyGroup('gs');
        assert.deepEqual(sb.__dbWrites, [], 'nothing written');
        // myGroupAt(id, null) finds owned groups only, so a shared id is simply not
        // there - the handler returns before asking anything. Either way: no write,
        // no confirm.
        assert.ok(refused.length <= 1);
    });
});
