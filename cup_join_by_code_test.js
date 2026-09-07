// ============================================================================
// JOINING A CUP THAT ALREADY EXISTS
//
// A Ryder Cup lives on ONE round and every other day points at it. The pointer
// architecture has been there since v48 and the identity translation since v63 -
// but nothing could ever WRITE a pointer at somebody else's round. rcSave() sets
// `host: currentMode`, which is a round hosting its own Cup, so days 2-5 had no
// way in at all. This is that way in.
//
// VALIDATE BEFORE WRITING, ALWAYS. A pointer aimed at a Cup that cannot load is a
// poisoned round: every load afterwards resolves to an error the golfer cannot
// clear from the screen it appears on. Three questions are asked first - does the
// host round exist, does it have a Cup, does the session picked exist on it - and
// nothing is written unless all three answer yes.
//
// TWO THINGS THE ENGINE ALREADY KNEW AND THE SCREEN THREW AWAY:
//
//   THE ROUND TO FIX. ryderTranslateCupToRound distinguishes a duplicate on the
//   HOST round from one on THIS round - two separate branches with two separate
//   sentences. ryderUnavailableReason discarded that and always appended "Fix the
//   names on <host>". Measured: the duplicate was on the joining round and the
//   message named the host. Being sent to a round where nothing is wrong is worse
//   than being told nothing - you look, find nothing, and stop believing the app.
//
//   A DANGLING SESSION. 'session-missing' sat on ryderResolutionUsable's allow
//   list, so a round whose session pointer aimed at nothing rendered the whole Cup
//   as though everything were fine. That is the silent wrongness this week has
//   been spent removing.
//
// SCORING IS NEVER BLOCKED by any of it, which is the one thing that must not
// change: a Cup that will not load is not a reason a golfer cannot post a score.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));

const roundOf = (names, extra) => Object.assign({
    eventName: 'R', courseName: 'Caledonia', gameFormat: 'stroke', courseData: cd18,
    players: names.map((n, i) => ({ id: 101 + i, name: n, hcp: '0' })), scores: {}
}, extra || {});

const FOUR = ['Marty Sharp', 'Carp Dean', 'Lance Webb', 'Zach Hill'];
const CUP = { ryderCup: {
    name: 'Myrtle Cup', sides: { A: { name: 'Red' }, B: { name: 'Blue' } },
    members: { '101': 'A', '102': 'B', '103': 'A', '104': 'B' },
    sessions: { s1: { name: 'Day 1 Fourball', format: 'fourball', scoring: 'scratch' } },
    matches: { m1: { sessionId: 's1', playersA: ['101'], playersB: ['102'],
                     format: 'singles', scoring: 'scratch' } } } };

const engine = () => loadJsFile('ryder-cup.js', ['handicap.js', 'money-engine.js', 'action-model.js']);

// ---------------------------------------------------------------------------
describe('THE ENGINE CARRIES WHICH ROUND IS WRONG', () => {

    const translate = (hostNames, localNames) => {
        const sb = engine();
        return JSON.parse(vm.runInContext('JSON.stringify(ryderTranslateCupToRound('
            + JSON.stringify(roundOf(hostNames, CUP)) + ','
            + JSON.stringify(roundOf(localNames)) + '))', sb));
    };

    test('a duplicate on THIS round is marked as this round', () => {
        const r = translate(FOUR, ['Marty Sharp', 'Marty Sharp', 'Lance Webb', 'Zach Hill']);
        const dupes = (r.problems || []).filter(p => p.type === 'duplicate-name');
        assert.ok(dupes.length > 0, 'a duplicated Cup member was not reported at all');
        assert.equal(dupes[0].where, 'local',
            'the engine does not say which round the duplicate is on');
    });

    test('a duplicate on the HOST round is marked as the host', () => {
        const r = translate(['Marty Sharp', 'Marty Sharp', 'Lance Webb', 'Zach Hill'], FOUR);
        const dupes = (r.problems || []).filter(p => p.type === 'duplicate-name');
        assert.ok(dupes.length > 0);
        assert.equal(dupes[0].where, 'host');
    });

    test('a clean pair still translates, and still names the right people', () => {
        const r = translate(FOUR, FOUR);
        assert.deepEqual(r.problems, []);
        assert.ok(r.cup, 'a clean translation produced no Cup');
    });
});

// ---------------------------------------------------------------------------
describe('A DANGLING SESSION IS NOT USABLE', () => {

    test('session-missing is off the allow-list', () => {
        const sb = engine();
        const usable = st => vm.runInContext(
            'ryderResolutionUsable(' + JSON.stringify({ status: st, cup: { x: 1 } }) + ')', sb);
        assert.equal(usable('session-missing'), false,
            'a Cup renders while its session pointer aims at nothing');
        // The states that must keep working.
        ['local', 'host', 'referenced'].forEach(st =>
            assert.equal(usable(st), true, st + ' stopped being usable'));
    });

    test('the resolver still reports it, so the screen can say what is missing', () => {
        const sb = engine();
        const res = JSON.parse(vm.runInContext('JSON.stringify(resolveRyderCupForRound('
            + JSON.stringify(roundOf(FOUR, { ryderCupRef: { host: 'RA', sessionId: 'GONE' } }))
            + ',' + JSON.stringify(roundOf(FOUR, CUP)) + ", 'RB'))", sb));
        assert.equal(res.status, 'session-missing');
        assert.equal(res.sessionId, 'GONE');
    });
});

// ---------------------------------------------------------------------------
describe('THE SENTENCE NAMES THE RIGHT ROUND', () => {

    const scorecard = (localNames, hostNames) => {
        const sb = loadHtmlInlineScript('index.html', ['score-marks.js', 'money-engine.js',
            'action-model.js', 'settlement-engine.js', 'pool-engine.js', 'bet-strip.js',
            'hole-events.js', 'ryder-cup.js']);
        vm.runInContext(`
            currentMode = 'RB';
            currentData = ${JSON.stringify(roundOf(localNames, { ryderCupRef: { host: 'RA', sessionId: 's1' } }))};
            __ryderHostCode = 'RA';
            __ryderHostCup = ${JSON.stringify(roundOf(hostNames, CUP))};
        `, sb);
        return String(vm.runInContext(
            'ryderUnavailableReason(ryderResolution())', sb) || '');
    };

    test('a duplicate on THIS round sends the golfer here, not to the host', () => {
        const why = scorecard(['Marty Sharp', 'Marty Sharp', 'Lance Webb', 'Zach Hill'], FOUR);
        assert.match(why, /Marty Sharp/);
        assert.match(why, /this round/i,
            'it sends the organizer to a round where nothing is wrong: ' + why);
        assert.ok(!/round RA/.test(why), 'it names the host, where there is no duplicate: ' + why);
    });

    test('a duplicate on the HOST round sends the golfer to the host', () => {
        const why = scorecard(FOUR, ['Marty Sharp', 'Marty Sharp', 'Lance Webb', 'Zach Hill']);
        assert.match(why, /round RA/,
            'a duplicate on the host round does not say where to fix it: ' + why);
    });

    test('a dangling session says what is missing', () => {
        const sb = loadHtmlInlineScript('index.html', ['score-marks.js', 'money-engine.js',
            'action-model.js', 'settlement-engine.js', 'pool-engine.js', 'bet-strip.js',
            'hole-events.js', 'ryder-cup.js']);
        vm.runInContext(`
            currentMode = 'RB';
            currentData = ${JSON.stringify(roundOf(FOUR, { ryderCupRef: { host: 'RA', sessionId: 'GONE' } }))};
            __ryderHostCode = 'RA';
            __ryderHostCup = ${JSON.stringify(roundOf(FOUR, CUP))};
        `, sb);
        const why = String(vm.runInContext('ryderUnavailableReason(ryderResolution())', sb) || '');
        assert.match(why, /session/i, 'a dangling session gets no explanation: ' + why);
        assert.match(why, /round RA/, 'it does not say where the session should be');
    });
});

// ---------------------------------------------------------------------------
describe('THE ENTRY: JOIN A CUP BY CODE', () => {

    // The Cup card, on a round that has none.
    function card(hostRound) {
        const sb = loadHtmlInlineScript('sidematches.html', ['handicap.js', 'text-safe.js',
            'action-model.js', 'settlement-engine.js', 'ryder-cup.js', 'grouping.js']);
        vm.runInContext(`
            currentMode = 'RB';
            currentData = ${JSON.stringify(roundOf(FOUR))};
            hasGroupLock = false; lockedGroup = null;
            window.__alerts = []; alert = m => window.__alerts.push(String(m));
            window.__writes = {};
            // db is a const on this page, so its REF is replaced rather than the
            // binding - an earlier draft assigned to db and died on "Assignment to
            // constant variable" before the page ever rendered.
            db.ref = function (p) { return {
                once: function () { return Promise.resolve({
                    val: function () { return ${JSON.stringify(hostRound)}; },
                    exists: function () { return ${hostRound ? 'true' : 'false'}; } }); },
                set: function (v) { window.__writes[p] = v; return Promise.resolve(); },
                update: function (v) { window.__writes[p] = v; return Promise.resolve(); },
                remove: function () { window.__writes[p] = null; return Promise.resolve(); },
                on: function () {}, off: function () {} }; };
            renderRyderCupSetup();
        `, sb);
        return {
            sb,
            run: c => vm.runInContext(c, sb),
            html: () => String(vm.runInContext(
                "document.getElementById('ryder-cup-setup').innerHTML", sb)),
            writes: () => JSON.parse(vm.runInContext('JSON.stringify(window.__writes)', sb)),
            // PULLED OUT OF THE RENDERED MARKUP. mini-dom stores innerHTML as a
            // string and never builds child nodes, so getElementById cannot reach an
            // element the card just rendered - CLAUDE.md records the limit. Reading
            // the markup also proves the message reached the SCREEN rather than only
            // the variable behind it.
            problems: () => {
                const h = String(vm.runInContext(
                    "document.getElementById('ryder-cup-setup').innerHTML", sb));
                const m = /id="rc-join-problems"[^>]*>([\s\S]*?)<\/div>/.exec(h);
                return m ? m[1] : '';
            },
        };
    }

    test('the card offers a third choice', () => {
        const h = card(null).html();
        assert.match(h, /rcOpenJoin\(\)/, 'there is no way to join an existing Cup');
        assert.match(h, /join/i);
        // The two that were already there must survive.
        assert.match(h, /rcOpen\(\)/);
        assert.match(h, /rcOpenClassic\(\)/);
    });

    test('a host code that does not exist writes NOTHING and says so', async () => {
        const c = card(null);
        c.run("rcOpenJoin(); document.getElementById('rc-join-code').value = 'NOPE'; rcJoinLookup();");
        await new Promise(r => setTimeout(r, 40));
        assert.deepEqual(c.writes(), {}, 'a pointer was written to a round that does not exist');
        assert.match(c.problems(), /not find|does not exist|no round/i,
            'a bad code failed silently: ' + c.problems());
    });

    test('a host round with no Cup writes NOTHING and says so', async () => {
        const c = card(roundOf(FOUR));
        c.run("rcOpenJoin(); document.getElementById('rc-join-code').value = 'RA'; rcJoinLookup();");
        await new Promise(r => setTimeout(r, 40));
        assert.deepEqual(c.writes(), {}, 'a pointer was written to a round with no Cup');
        assert.match(c.problems(), /no Ryder Cup|has no Cup/i, c.problems());
    });

    test('a real host offers its sessions to pick from', async () => {
        const c = card(roundOf(FOUR, CUP));
        c.run("rcOpenJoin(); document.getElementById('rc-join-code').value = 'RA'; rcJoinLookup();");
        await new Promise(r => setTimeout(r, 40));
        assert.match(c.html(), /Day 1 Fourball/, 'the sessions were not offered: ' + c.html());
        assert.deepEqual(c.writes(), {}, 'looking up a code wrote a pointer before confirming');
    });

    test('confirming writes the pointer, with the session', async () => {
        const c = card(roundOf(FOUR, CUP));
        c.run("rcOpenJoin(); document.getElementById('rc-join-code').value = 'RA'; rcJoinLookup();");
        await new Promise(r => setTimeout(r, 40));
        c.run("document.getElementById('rc-join-session').value = 's1'; rcJoinConfirm();");
        await new Promise(r => setTimeout(r, 40));
        const w = c.writes();
        assert.deepEqual(w['events/RB/ryderCupRef'], { host: 'RA', sessionId: 's1' },
            'the pointer was not written: ' + JSON.stringify(w));
    });

    test('a session that is not on that Cup writes NOTHING', async () => {
        const c = card(roundOf(FOUR, CUP));
        c.run("rcOpenJoin(); document.getElementById('rc-join-code').value = 'RA'; rcJoinLookup();");
        await new Promise(r => setTimeout(r, 40));
        c.run("document.getElementById('rc-join-session').value = 'GONE'; rcJoinConfirm();");
        await new Promise(r => setTimeout(r, 40));
        assert.deepEqual(c.writes(), {}, 'a pointer was written to a session that does not exist');
        assert.match(c.problems(), /session/i, c.problems());
    });

    test('a round cannot point at itself', async () => {
        const c = card(roundOf(FOUR, CUP));
        c.run("rcOpenJoin(); document.getElementById('rc-join-code').value = 'RB'; rcJoinLookup();");
        await new Promise(r => setTimeout(r, 40));
        assert.deepEqual(c.writes(), {}, 'a round joined its own Cup by code');
        assert.match(c.problems(), /this round|itself|own/i, c.problems());
    });
});
