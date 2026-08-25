// ============================================================================
// WAVE C — ORGANIZER AUTHORITY AND PERSISTENT VERIFICATION
//
// WHY A TOKEN AND NOT THE BARE LINK
//
// The app authenticates nobody. The only thing distinguishing one person from
// another is which URL they opened, and isOrganizerView() means nothing more
// than "no ?group= in the URL" - which is the link shared with the whole group.
// Treating it as organizer authority would have handed every golfer the ability
// to edit all twelve cards, which is exactly what canWritePlayer() already
// refuses on a multi-group round.
//
// So the organizer link carries a separate random secret, at the same trust
// level as the ?group= links the app already relies on.
//
// WHAT THIS IS NOT. database.rules.json grants ".read": true and ".write": true
// on every event, so the token is readable by anyone holding the game code and
// the server enforces nothing. It is a guardrail against ACCIDENTS - a golfer on
// the shared link quietly editing another foursome - not a security boundary.
// The tests below assert the client-side rules, which is the layer that exists.
//
// THE NARROW EXCEPTION. Authority requires BOTH a matching token AND the
// final-review context. Either alone grants nothing, so holding the organizer
// link does not turn the ordinary scorecard into a global editor.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'index.html';
const DEPS = ['action-model.js','money-engine.js','pool-engine.js','settlement-engine.js',
              'score-marks.js','bet-strip.js','hole-events.js'];
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const tick = () => new Promise(r => setImmediate(r));

const PAR = [4,5,4,4,4,3,4,3,4, 4,3,4,4,4,4,3,5,4];
const IDX = [15,13,1,3,11,5,9,17,7, 12,6,2,16,8,14,18,4,10];
const FIELD = [
  ['Marty', 9,[5,5,4,4,4,3,5,3,5, 4,4,3,5,5,4,4,7,6]],
  ['Scott', 7,[4,4,5,5,7,4,4,3,5, 5,3,6,4,5,4,4,4,7]],
  ['Carp',  2,[3,5,3,4,5,3,5,2,5, 4,4,3,4,4,5,3,6,4]],
  ['Randy', 9,[5,9,4,4,4,6,6,2,6, 6,4,6,4,5,4,3,7,7]],
  ['Manny', 0,[4,5,4,4,4,3,5,3,4, 5,3,4,3,4,5,3,5,4]],
  ['Matt B',8,[5,7,5,4,6,3,5,2,5, 5,4,4,6,5,6,3,6,5]],
  ['Lance', 3,[4,5,4,4,4,3,5,3,4, 5,3,5,4,4,5,2,6,5]],
  ['Kopp',  6,[5,6,5,5,5,3,5,3,5, 4,4,4,5,6,4,3,4,6]],
  ['Marcus',9,[4,6,5,5,4,3,5,4,5, 4,3,4,5,4,5,3,4,5]],
  ['Rocco',13,[5,8,5,5,4,3,6,3,8, 5,6,5,5,5,6,7,10,7]],
  ['Matt H',12,[6,10,4,6,5,4,5,4,5, 4,5,4,5,5,5,3,5,9]],
  ['Jeremy',12,[7,5,4,4,6,3,5,5,5, 4,4,6,6,5,6,3,7,7]],
];
const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

// link: 'bare' | 'group' | 'organizer' | 'badtoken' | 'me'
function boot({ link = 'group', group = 1, token = TOKEN, legacy = false, online = true } = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const cd = PAR.map((p,i) => ({ hole:i+1, par:p, hcpIndex:IDX[i] }));
    const ps = FIELD.map(([name,hcp], i) => ({ id:101+i, name, hcp:String(hcp), playingForMoney:true }));
    const sc = {};
    FIELD.forEach((f,i) => f[2].forEach((v,hi) => { sc['p'+(101+i)+'_h'+(hi+1)] = v; }));
    const gm = {}; ps.forEach((p,i) => { gm[String(p.id)] = Math.floor(i/4)+1; });

    const data = { players: ps, courseData: cd, scores: sc, gameFormat: 'stroke',
                   settlementMode: 'whole-dollar', kpWinners: {}, kpConfirmed: { confirmed: true },
        // Not a KP test: every hole is decided so no money is left unresolved.
        kpNoWinner: { h3:true, h7:true, h12:true, h16:true },
                   moneyPool: { enabled:true, buyIn:40,
                       kp:{amount:100,holes:[3,7,12,16]},
                       net:{amount:70,places:[57.142857,42.857143]},
                       skins:{mode:'remainder',scoring:'net',carryOver:false} } };
    if (!legacy) data.organizerToken = TOKEN;

    const isGroup = link === 'group';
    const orgParam = link === 'organizer' ? token : (link === 'badtoken' ? 'deadbeef' : null);

    vm.runInContext(`
        currentMode = 'ABCD';
        currentData = ${JSON.stringify(data)};
        window.__scPlayerGroupMap = ${JSON.stringify(gm)};
        hasGroupLock = ${isGroup}; lockedGroup = ${isGroup ? group : 'null'};
        organizerTokenParam = ${orgParam === null ? 'null' : JSON.stringify(orgParam)};
        meId = ${link === 'me' ? '"101"' : 'null'};
        navigator.onLine = ${online};
        openFinishRoundModal();
    `, sb);

    const idOf = n => 101 + FIELD.findIndex(f => f[0] === n);
    return {
        sb, idOf,
        run: c => vm.runInContext(c, sb),
        can: n => vm.runInContext('canWritePlayer(' + idOf(n) + ')', sb),
        open: n => vm.runInContext('frOpenPlayer(' + idOf(n) + ');', sb),
        correct: (n,h,v) => vm.runInContext('frCorrectScore(' + idOf(n) + ',' + h + ',"' + v + '");', sb),
        detail: () => sb.document.getElementById('fr-detail-holes').innerHTML,
        badge: () => sb.document.getElementById('fr-verified-badge').innerHTML,
    };
}

// ============================================================================

describe('ORDINARY PERMISSIONS ARE UNCHANGED', () => {

    test('the bare/spectator link still edits nobody', () => {
        const b = boot({ link: 'bare' });
        FIELD.forEach(([n]) => assert.equal(b.can(n), false, `${n} must not be editable`));
    });

    test('Group 1 edits Group 1 only', () => {
        const b = boot({ link: 'group', group: 1 });
        ['Marty','Scott','Carp','Randy'].forEach(n => assert.equal(b.can(n), true));
        ['Manny','Kopp','Marcus','Jeremy'].forEach(n => assert.equal(b.can(n), false));
    });

    test('Group 2 edits Group 2 only', () => {
        const b = boot({ link: 'group', group: 2 });
        ['Manny','Matt B','Lance','Kopp'].forEach(n => assert.equal(b.can(n), true));
        ['Marty','Carp','Marcus','Rocco'].forEach(n => assert.equal(b.can(n), false));
    });

    test('Group 3 edits Group 3 only', () => {
        const b = boot({ link: 'group', group: 3 });
        ['Marcus','Rocco','Matt H','Jeremy'].forEach(n => assert.equal(b.can(n), true));
        ['Marty','Scott','Manny','Lance'].forEach(n => assert.equal(b.can(n), false));
    });

    test('?me= grants nothing', () => {
        const b = boot({ link: 'me' });
        FIELD.forEach(([n]) => assert.equal(b.can(n), false, '?me= must never grant write permission'));
    });
});

describe('THE ORGANIZER TOKEN', () => {

    test('a wrong token grants nothing', () => {
        const b = boot({ link: 'badtoken' });
        assert.equal(b.run('hasOrganizerAuthority()'), false);
        FIELD.forEach(([n]) => assert.equal(b.can(n), false));
    });

    test('a missing token grants nothing', () => {
        const b = boot({ link: 'bare' });
        assert.equal(b.run('hasOrganizerAuthority()'), false);
    });

    test('a legacy round with no stored token grants nothing, even with a param', () => {
        const b = boot({ link: 'organizer', legacy: true });
        assert.equal(b.run('hasOrganizerAuthority()'), false,
            'absent on either side must grant nothing - no migration, no override');
    });

    test('an EMPTY token param is refused, not coerced', () => {
        // Removing the !organizerTokenParam guard left String(null)==='null' style
        // comparisons as the only defence. They happen to be false, so nothing failed -
        // a guard nothing tests is a guard that can be deleted. These pin it.
        const b = boot({ link: 'organizer', token: '' });
        assert.equal(b.run('hasOrganizerAuthority()'), false);
        b.run("organizerTokenParam = null;");
        assert.equal(b.run('hasOrganizerAuthority()'), false);
        b.run("organizerTokenParam = undefined;");
        assert.equal(b.run('hasOrganizerAuthority()'), false);
        b.run("organizerTokenParam = 'undefined';");
        assert.equal(b.run('hasOrganizerAuthority()'), false, 'the string "undefined" must not match');
    });

    test('a round with an EMPTY stored token grants nothing', () => {
        const b = boot({ link: 'organizer' });
        b.run("currentData.organizerToken = '';");
        assert.equal(b.run('hasOrganizerAuthority()'), false);
    });

    test('the correct token is recognised', () => {
        assert.equal(boot({ link: 'organizer' }).run('hasOrganizerAuthority()'), true);
    });

    test('AUTHORITY NEEDS THE REVIEW CONTEXT TOO - it does not leak into ordinary scoring', () => {
        const b = boot({ link: 'organizer' });
        // Outside the review context, canWritePlayer must behave exactly as a bare link.
        assert.equal(b.run('frOrganizerEditContext'), false, 'the flag must be off at rest');
        FIELD.forEach(([n]) => assert.equal(b.can(n), false,
            `${n} editable from the ordinary scorecard - the exception leaked`));
    });

    test('inside the review context the organizer may correct all 12', () => {
        const b = boot({ link: 'organizer' });
        b.run('frOrganizerEditContext = true;');
        FIELD.forEach(([n]) => assert.equal(b.can(n), true, `${n} must be correctable by the organizer`));
        b.run('frOrganizerEditContext = false;');
    });

    test('a group link gains nothing from the review context', () => {
        const b = boot({ link: 'group', group: 1 });
        b.run('frOrganizerEditContext = true;');
        assert.equal(b.can('Marcus'), false, 'the context alone must grant nothing');
        b.run('frOrganizerEditContext = false;');
    });

    test('the review screen offers inputs for another group only to the organizer', () => {
        const org = boot({ link: 'organizer' });
        org.open('Rocco');                      // Group 3
        assert.match(org.detail(), /fr-hole-input/, 'organizer must be able to correct Rocco');
        assert.match(strip(org.sb.document.getElementById('fr-detail-note').innerHTML), /Organizer access/);

        const g1 = boot({ link: 'group', group: 1 });
        g1.open('Rocco');
        assert.ok(!/fr-hole-input/.test(g1.detail()), 'Group 1 must still see Rocco read-only');
    });

    test('the token is random, not derived from the game code', () => {
        const src = read('admin.html');
        assert.match(src, /function makeOrganizerToken/);
        const fn = src.slice(src.indexOf('function makeOrganizerToken'));
        const body = fn.slice(0, fn.indexOf('\n    }'));
        assert.match(body, /getRandomValues/, 'must use the platform CSPRNG');
        assert.ok(!/currentMode|gameCode|roomCode/.test(body), 'must not derive from the game code');
        assert.match(src, /organizerToken: makeOrganizerToken\(\)/);
    });

    test('the organizer link is offered separately from the group links', () => {
        const src = read(PAGE);
        assert.match(src, /Organizer Link/);
        assert.match(src, /keep this one private/);
        assert.match(src, /organizer=\$\{currentData\.organizerToken\}/);
    });
});

describe('ORGANIZER CORRECTION IS STILL CANONICAL', () => {

    test('it goes through saveScore, not a second write path', () => {
        const src = read(PAGE);
        const at = src.indexOf('function frCorrectScore');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /saveScore\(playerId, hole, raw\)/);
        ['db.ref', '.set(', '.remove(', '.update('].forEach(t =>
            assert.ok(!fn.includes(t), `corrections must not write directly; found ${t}`));
    });

    test('the exception is closed in a finally block', () => {
        const src = read(PAGE);
        const at = src.indexOf('function frCorrectScore');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /finally \{ frOrganizerEditContext = false; \}/,
            'a throw mid-write must not leave the app globally writable');
    });

    test('a CROSS-GROUP organizer correction reruns skins, Net Finish and the money', () => {
        const b = boot({ link: 'organizer' });
        const before = b.run(`(function(){
            var p = computeMoneyPool(currentData, currentData.courseData, currentData.scores);
            var c = computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores);
            return { skins: p.skins.lines.map(function(l){return l.hole+':'+l.winnerName;}),
                     place: p.net.lines.map(function(l){return l.place+':'+l.names.join('/');}),
                     net: Object.values(c.netByName).map(function(v){return v.name+':'+v.net;}) };
        })()`);
        assert.ok(plain(before.skins).includes('14:Marcus'), 'fixture must start with the Marcus skin');

        b.open('Marcus');                    // Group 3, organizer holds no group link
        b.correct('Marcus', 14, 7);

        const after = b.run(`(function(){
            var p = computeMoneyPool(currentData, currentData.courseData, currentData.scores);
            var c = computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores);
            return { skins: p.skins.lines.map(function(l){return l.hole+':'+l.winnerName;}),
                     place: p.net.lines.map(function(l){return l.place+':'+l.names.join('/');}),
                     net: Object.values(c.netByName).map(function(v){return v.name+':'+v.net;}) };
        })()`);
        assert.ok(!plain(after.skins).includes('14:Marcus'), 'STALE skin after a cross-group correction');
        assert.notDeepEqual(plain(after.place), plain(before.place), 'Net Finish must move');
        assert.notDeepEqual(plain(after.net), plain(before.net), 'the money must move');
    });

    test('whole-dollar invariants survive a cross-group correction', () => {
        const b = boot({ link: 'organizer' });
        b.open('Marcus');
        b.correct('Marcus', 14, 7);
        const c = b.run(`computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)`);
        const vals = Object.values(plain(c.netByName));
        assert.equal(vals.reduce((a,v) => a + v.net, 0), 0, 'must stay zero-sum');
        vals.forEach(v => assert.equal(v.net, Math.round(v.net), `${v.name} settled on cents`));
    });
});

describe('PERSISTENT VERIFICATION', () => {

    test('opening review does not verify', () => {
        const b = boot();
        assert.equal(b.run('isScoresVerified()'), false);
        assert.equal(b.run('currentData.scoresVerified === undefined'), true);
    });

    test('viewing every golfer does not verify', () => {
        const b = boot();
        FIELD.forEach(([n]) => b.open(n));
        assert.equal(b.run('isScoresVerified()'), false);
    });

    test('skipping does not verify', () => {
        const b = boot();
        b.run('frShowResults(false);');
        assert.equal(b.run('isScoresVerified()'), false);
    });

    test('the deliberate confirmation persists it', async () => {
        const b = boot();
        b.run('frShowResults(true);');
        await tick();
        assert.equal(b.run('isScoresVerified()'), true);
        assert.equal(b.run('currentData.scoresVerified.verified'), true);
        assert.ok(b.run('currentData.scoresVerified.verifiedAt') > 0);
    });

    test('verifiedBy records the authority, not a person', async () => {
        const org = boot({ link: 'organizer' });
        org.run('frShowResults(true);');
        await tick();
        assert.equal(org.run('currentData.scoresVerified.verifiedBy'), 'organizer');

        const g2 = boot({ link: 'group', group: 2 });
        g2.run('frShowResults(true);');
        await tick();
        assert.equal(g2.run('currentData.scoresVerified.verifiedBy'), 'group-2');
    });

    test('OFFLINE confirmation cannot succeed', async () => {
        const b = boot({ online: false });
        b.run('frShowResults(true);');
        await tick();
        assert.equal(b.run('isScoresVerified()'), false, 'a buffered write must never read as verified');
        assert.equal(b.run('frReviewCompleted'), false);
        assert.equal(b.badge(), '', 'and no badge may appear');
    });
});

describe('ANY SCORE CHANGE CLEARS VERIFICATION', () => {

    test('the invalidation lives in the canonical write path', () => {
        const src = read(PAGE);
        const at = src.indexOf('function saveScore(');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /clearScoresVerified\(\);/,
            'centralising it here is what stops a new score surface forgetting to');
    });

    test('a GROUP scorekeeper edit clears it', async () => {
        const b = boot({ link: 'group', group: 1 });
        b.run('frShowResults(true);');
        await tick();
        assert.equal(b.run('isScoresVerified()'), true);
        b.run('saveScore(101, 1, 7);');           // Marty, own group
        assert.equal(b.run('isScoresVerified()'), false, 'STALE verification after a score edit');
    });

    test('an ORGANIZER review correction clears it', async () => {
        const b = boot({ link: 'organizer' });
        b.run('frShowResults(true);');
        await tick();
        assert.equal(b.run('isScoresVerified()'), true);
        b.open('Rocco');
        b.correct('Rocco', 18, 6);
        assert.equal(b.run('isScoresVerified()'), false);
    });

    test('a re-review can verify again', async () => {
        const b = boot({ link: 'group', group: 1 });
        b.run('frShowResults(true);');
        await tick();
        b.run('saveScore(101, 1, 7);');
        assert.equal(b.run('isScoresVerified()'), false);
        b.run('frShowResults(true);');
        await tick();
        assert.equal(b.run('isScoresVerified()'), true, 'verification must be repeatable');
    });

    test('a write that changes nothing does not clear it', async () => {
        const b = boot({ link: 'group', group: 1 });
        b.run('frShowResults(true);');
        await tick();
        b.run('saveScore(101, 1, 5);');           // same value already stored
        assert.equal(b.run('isScoresVerified()'), true, 'a no-op write must not invalidate');
    });
});

describe('THE RECEIPT BADGE', () => {

    test('it reads PERSISTED state, never the in-memory flag', () => {
        const src = read(PAGE);
        const at = src.indexOf('const badgeEl = document.getElementById');
        const block = src.slice(at, at + 400);
        assert.match(block, /isScoresVerified\(\)/);
        assert.ok(!/frReviewCompleted/.test(block),
            'driving the badge from the button press would show verified on a failed write');
    });

    test('no badge before confirmation', () => {
        const b = boot();
        b.run('frShowResults(false);');
        assert.equal(b.badge(), '');
    });

    test('badge after confirmation', async () => {
        const b = boot();
        b.run('frShowResults(true);');
        await tick();
        b.run('renderFinishRoundMoney();');
        assert.match(strip(b.badge()), /\u2713 Scores verified before settlement/);
    });

    test('the badge disappears once a score changes', async () => {
        const b = boot({ link: 'group', group: 1 });
        b.run('frShowResults(true);');
        await tick();
        b.run('renderFinishRoundMoney();');
        assert.match(strip(b.badge()), /verified/);
        b.run('saveScore(101, 1, 7);');
        b.run('renderFinishRoundMoney();');
        assert.equal(b.badge(), '', 'a stale badge after a score change is the worst outcome here');
    });
});

describe('LEGACY ROUNDS', () => {

    test('a round with neither token nor verification still works', () => {
        const b = boot({ link: 'group', group: 1, legacy: true });
        assert.equal(b.run('isScoresVerified()'), false);
        assert.equal(b.run('hasOrganizerAuthority()'), false);
        assert.equal(b.can('Marty'), true, 'its group links must behave exactly as before');
        assert.equal(b.can('Marcus'), false);
    });

    test('no organizer link is offered on a legacy round', () => {
        const src = read(PAGE);
        assert.match(src, /if \(currentData\.organizerToken\) \{/,
            'the row must be conditional on the round actually carrying a token');
    });
});
