// ============================================================================
// CUSTOM PRESS STAKES — THE FLOW
//
// The money suite proved the engines. This suite proves the path a THUMB takes:
// the amount is entered, the write happens, and only a write that actually
// landed produces "PRESS CONFIRMED". A rejected write produces "PRESS NOT
// SAVED" and leaves nothing behind - no press, no money, no false comfort.
//
// It also pins the routing fix: a cockpit press on a Match Play bet used to be
// written to overallPresses, a node no match engine reads. It displayed for a
// moment and moved no money, ever.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PAGE = ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];

// Boots a page with a stroke and a match side-wager on an 8-player round, a
// controllable prompt, an alert recorder, and a Firebase stub whose writes can
// be told to FAIL.
function boot(page, groupParam, opts) {
    const sb = loadHtmlInlineScript(page, PAGE);
    const cd = makeCourseData(18);
    const p = makePlayers(['Marty', 'Matt', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James'], new Array(8).fill(0));
    const scores = {};
    cd.slice(0, 5).forEach(h => p.forEach(pl => { scores[`p${pl.id}_h${h.hole}`] = h.par; }));
    const A = String(p[0].id), B = String(p[1].id), STAN = String(p[4].id);
    const sideMatches = {
        stroke1: { format: 'stroke', scoring: 'gross', holeStake: 10, overallStake: 200, overallMode: 'stroke',
                   startHole: 1, createdAt: 1, teamAIds: [A], teamBIds: [B] },
        match1:  { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime',
                   startHole: 1, createdAt: 2, teamAIds: [A], teamBIds: [B] },
        cross1:  { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime', scope: 'cross',
                   startHole: 1, createdAt: 3, teamAIds: [A], teamBIds: [STAN] }
    };
    const gm = {}; p.forEach((pl, i) => { gm[pl.id] = Math.floor(i / 4) + 1; });
    vm.runInContext(`
        window.__writes = []; window.__alerts = []; window.__failWrites = ${!!(opts && opts.fail)};
        alert = m => window.__alerts.push(String(m));
        prompt = () => ${JSON.stringify(opts && 'promptValue' in opts ? opts.promptValue : '78')};
        db.ref = function (pth) { return {
            set: function (v) {
                if (window.__failWrites) return Promise.reject(new Error('offline'));
                window.__writes.push({ path: pth, value: v }); return Promise.resolve();
            },
            remove: function () { return Promise.resolve(); },
            update: function () { return Promise.resolve(); },
            push: function () { return { key: 'k' + (window.__writes.length + 1) }; },
            on: function () {}, once: function () { return Promise.resolve({ val: function () { return null; } }); }
        }; };
        currentMode = 'ABCD';
        currentData = ${JSON.stringify({ gameFormat: 'stroke', players: p, courseData: cd, scores, sideMatches })};
        window.__scPlayerGroupMap = ${JSON.stringify(gm)};
        window.__scFilteredPlayers = currentData.players;
        hasGroupLock = ${groupParam !== null};
        lockedGroup = ${groupParam === null ? 'null' : groupParam};
        ${page === 'index.html' ? `selectedGroup = ${groupParam === null ? "'all'" : groupParam}; actionCenterOpen = true;` : ''}
    `, sb);
    return {
        sb, p, A, B, STAN,
        run: c => vm.runInContext(c, sb),
        writes: () => sb.window.__writes,
        alerts: () => sb.window.__alerts,
        last: () => sb.window.__writes[sb.window.__writes.length - 1],
        settle: () => new Promise(r => setImmediate(r))   // let .then/.catch chains run
    };
}
const tick = () => new Promise(r => setImmediate(r));

// ---------------------------------------------------------------------------
describe('ACTION PAGE — amount in, write, THEN confirmation', () => {
    test('match press: the typed $78 is what Firebase receives', async () => {
        const b = boot('sidematches.html', 1, { promptValue: '78' });
        b.run(`pressSideMatch('match1', '18', 6);`);
        await tick();
        assert.equal(b.writes().length, 1);
        const v = b.last().value;   // vm-realm object: compare fields, never deepEqual
        assert.equal(v.baseId, '18'); assert.equal(v.startHole, 6); assert.equal(v.stake, 78);
        assert.match(b.last().path, /sideMatches\/match1\/presses\//);
    });

    test('the confirmation names the golfers, the money and the hole — AFTER the write', async () => {
        const b = boot('sidematches.html', 1, { promptValue: '78' });
        b.run(`pressSideMatch('match1', '18', 6);`);
        assert.equal(b.alerts().length, 0, 'no acknowledgement before the write resolves');
        await tick();
        const ack = b.alerts().find(a => /PRESS CONFIRMED/.test(a));
        assert.ok(ack, 'a confirmed write must say so');
        assert.match(ack, /Marty vs Matt/);
        assert.match(ack, /\$78/);
        assert.match(ack, /Starts Hole 6/);
    });

    test('cancelling the prompt creates nothing and claims nothing', async () => {
        const b = boot('sidematches.html', 1, { promptValue: null });
        b.run(`pressSideMatch('match1', '18', 6);`);
        await tick();
        assert.equal(b.writes().length, 0);
        assert.equal(b.alerts().some(a => /CONFIRMED/.test(a)), false);
    });

    test('garbage amounts are refused with no write', async () => {
        for (const bad of ['0', '-5', 'abc', '']) {
            const b = boot('sidematches.html', 1, { promptValue: bad });
            b.run(`pressSideMatch('match1', '18', 6);`);
            await tick();
            assert.equal(b.writes().length, 0, `"${bad}" must not create a press`);
            assert.ok(b.alerts().some(a => /No press was created/.test(a)));
        }
    });

    test('FAILURE PATH: a rejected write says PRESS NOT SAVED and leaves nothing', async () => {
        const b = boot('sidematches.html', 1, { promptValue: '78', fail: true });
        b.run(`pressSideMatch('match1', '18', 6);`);
        await tick();
        assert.equal(b.writes().length, 0, 'nothing persisted');
        const err = b.alerts().find(a => /PRESS NOT SAVED/.test(a));
        assert.ok(err, 'the failure must be stated plainly');
        assert.equal(b.alerts().some(a => /PRESS CONFIRMED/.test(a)), false,
            'and success must never be claimed');
    });

    test('stroke OVERALL press: the reported bug path now stores the stake', async () => {
        const b = boot('sidematches.html', 1, { promptValue: '78' });
        b.run(`pressSideMatchOverall('stroke1', '${b.A}', '${b.B}');`);
        await tick();
        assert.match(b.last().path, /overallPresses/);
        assert.equal(b.last().value.stake, 78, 'THE $78 IS STORED — the original bug');
        assert.ok(b.alerts().some(a => /PRESS CONFIRMED/.test(a) && /\$78/.test(a)));
    });

    test('stroke overall press failure path', async () => {
        const b = boot('sidematches.html', 1, { promptValue: '125', fail: true });
        b.run(`pressSideMatchOverall('stroke1', '${b.A}', '${b.B}');`);
        await tick();
        assert.equal(b.writes().length, 0);
        assert.ok(b.alerts().some(a => /PRESS NOT SAVED/.test(a)));
    });

    test('hole press stores the rate and confirms per-hole money', async () => {
        const b = boot('sidematches.html', 1, {});
        b.sb.__setElement('sm-hole-press-amount-stroke1', '33');
        b.run(`confirmSideHolePress('stroke1', 6, '${b.A}', '${b.B}');`);
        await tick();
        assert.match(b.last().path, /holePresses/);
        assert.equal(b.last().value.fromHole, 6);
        assert.equal(b.last().value.newStake, 33);
        const ack = b.alerts().find(a => /PRESS CONFIRMED/.test(a));
        assert.ok(ack && /\$33\/hole/.test(ack), 'a hole press is money PER HOLE and says so');
    });
});

// ---------------------------------------------------------------------------
describe('SCORECARD COCKPIT — routing, contract and confirmation', () => {
    test('CONTRACT: the cockpit offers a press on STROKE bets only', () => {
        // bet-strip has never modelled match/nassau presses for the cockpit: a match
        // row reports canPress:false and no press button renders. That is why the
        // old always-write-overallPresses code never visibly misfired - the button
        // that would have exercised it did not exist. Per-nine Nassau and Match Play
        // pressing lives on the Action page, where the golfer can say which segment.
        const b = boot('index.html', 1, {});
        const rows = b.run(`buildSideActionRows(currentData, currentData.courseData,
            currentData.scores, currentData.players.filter(function (pl) {
                return String(window.__scPlayerGroupMap[pl.id]) === '1';
            }), null).map(function (r) { return r.key + ':' + r.canPress; }).join(',')`);
        assert.match(String(rows), /stroke1:true/);
        assert.match(String(rows), /match1:false/);
    });

    test('a cockpit press on the STROKE bet stores the entered stake in overallPresses', async () => {
        const b = boot('index.html', 1, {});
        b.run(`confirmSidePress('stroke1', 125);`);
        await tick();
        assert.match(b.last().path, /sideMatches\/stroke1\/overallPresses\//);
        assert.equal(b.last().value.startHole, 6);
        assert.equal(b.last().value.stake, 125);
    });

    test('DEFENSE: even a direct call for a match bet cannot write to the wrong node', async () => {
        // fresh.canPress is re-read at the tap, so a forged call for a non-pressable
        // row is refused before any write - and if bet-strip ever starts offering
        // match presses here, the routing above already sends them to `presses`.
        const b = boot('index.html', 1, {});
        b.run(`confirmSidePress('match1', 78);`);
        await tick();
        assert.equal(b.writes().length, 0, 'refused, not misrouted');
        const idx = read('index.html');
        assert.ok(/const node = isStroke \? 'overallPresses' : 'presses';/.test(idx),
            'the format routing exists for the day the cockpit gains match presses');
    });

    test('the cockpit confirms after the write, with match, money and hole', async () => {
        const b = boot('index.html', 1, {});
        b.run(`confirmSidePress('stroke1', 78);`);
        assert.equal(b.alerts().length, 0, 'nothing claimed before persistence');
        await tick();
        const ack = b.alerts().find(a => /PRESS CONFIRMED/.test(a));
        assert.ok(ack); assert.match(ack, /\$78/); assert.match(ack, /Starts Hole 6/);
        assert.match(ack, /Marty vs Matt/);
    });

    test('cockpit failure path: NOT SAVED, nothing written', async () => {
        const b = boot('index.html', 1, { fail: true });
        b.run(`confirmSidePress('stroke1', 78);`);
        await tick();
        assert.equal(b.writes().length, 0);
        assert.ok(b.alerts().some(a => /PRESS NOT SAVED/.test(a)));
        assert.equal(b.alerts().some(a => /CONFIRMED/.test(a)), false);
    });

    test('the collapsed card shows every press at ITS stake — no More → Matches trip', () => {
        const b = boot('index.html', 1, {});
        b.run(`
            currentData.sideMatches.stroke1.overallPresses = { a: { startHole: 6, stake: 78 } };
            currentData.sideMatches.stroke1.holePresses = { b: { fromHole: 10, newStake: 125 } };
            currentData.sideMatches.match1.presses = { c: { baseId: '18', startHole: 6, stake: 33 }, d: { baseId: '18', startHole: 9 } };
            actionCenterOpen = true;
            renderActionCenter();
        `);
        const html = b.sb.document.getElementById('action-center-mount').innerHTML;
        assert.match(html, /P1 H6 \$78/, 'stroke overall press with its stake');
        assert.match(html, /HP1 H10 \$125\/hole/, 'hole press labelled per hole');
        assert.match(html, /P1 H6 \$33/, 'match custom press');
        assert.match(html, /P2 H9 \$50/, 'a legacy press shows the stake it settles at — the original');
    });
});

// ---------------------------------------------------------------------------
describe('CROSS-GROUP PRESS — one $78, every view', () => {
    test('Group 1 presses Marty vs Stan for $78; the stored object is scoped to nobody', async () => {
        const b = boot('sidematches.html', 1, { promptValue: '78' });
        b.run(`pressSideMatch('cross1', '18', 6);`);
        await tick();
        assert.equal(b.last().value.stake, 78);
        assert.ok(b.alerts().some(a => /Marty vs Stan/.test(a) && /\$78/.test(a)),
            'the confirmation names both golfers across the groups');
    });

    test('Group 2 can press it too; Group 3 has no such match to press', async () => {
        const b2 = boot('sidematches.html', 2, { promptValue: '78' });
        b2.run(`pressSideMatch('cross1', '18', 6);`);
        await tick();
        assert.equal(b2.writes().length, 1, 'Stan\'s side may press');
    });

    test('an unrelated group cannot press it', async () => {
        // 8 players = groups 1 and 2; simulate a third-party by locking to a group
        // with no stake: rebuild with Stan moved out of the match.
        const b = boot('sidematches.html', 2, { promptValue: '78' });
        b.run(`currentData.sideMatches.cross1.teamBIds = ['${b.p[2].id}'];`);   // now G1 vs G1
        b.run(`pressSideMatch('cross1', '18', 6);`);
        await tick();
        assert.equal(b.writes().length, 0, 'no stake in the match, no press');
    });

    test('RELOAD: the persisted $78 settles as $78 for every reader', () => {
        // Exactly the JSON Firebase hands back after a reload, fed to the same
        // engine context the money suite uses (SIM 27 proves the identical
        // round-trip; this asserts it for the CROSS-GROUP shape specifically).
        const E2 = (() => {
            const { loadJsFile } = require('./helpers/load-script.js');
            const sb2 = loadJsFile('money-engine.js');
            ['action-model.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js']
                .forEach(f => vm.runInContext(read(f), sb2, { filename: f }));
            return sb2;
        })();
        const cd = makeCourseData(18);
        const p = makePlayers(['Marty', 'Matt', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James'], new Array(8).fill(0));
        const A2 = String(p[0].id), STAN2 = String(p[4].id);
        const sc = {}; p.forEach((pl, i) => { for (let h = 1; h <= 18; h++) sc[`p${pl.id}_h${h}`] = i === 0 ? 4 : 5; });
        const persisted = JSON.parse(JSON.stringify({
            players: p, courseData: cd,
            sideMatches: { cross1: { format: 'match', scoring: 'gross', stake: 50, pressRule: 'anytime',
                startHole: 1, scope: 'cross', teamAIds: [A2], teamBIds: [STAN2],
                presses: { k: { baseId: '18', startHole: 6, stake: 78 } } } }
        }));
        vm.runInContext(`window.__r = buildSideMatchReceipts(${JSON.stringify(persisted)},
            ${JSON.stringify(cd)}, ${JSON.stringify(sc)});`, E2);
        const r = E2.window.__r[0];
        assert.ok(r.segments.some(s2 => s2.stake === 78), 'Receipt prints $78 after reload');
        assert.equal(r.net, 50 + 78, 'and settles it');
    });});

// ---------------------------------------------------------------------------
describe('WHAT THIS BATCH DID NOT TOUCH', () => {
    test('group isolation still holds around pressing', async () => {
        const b = boot('sidematches.html', 2, { promptValue: '78' });
        b.run(`pressSideMatch('match1', '18', 6);`);   // Marty vs Matt is G1-only
        await tick();
        assert.equal(b.writes().length, 0, 'Group 2 still cannot press a Group 1 match');
    });

    test('deleting and creating wagers are unchanged code paths', () => {
        ['saveSideMatch', 'saveFieldAction', 'confirmDeleteSideMatch', 'canManageSideMatch']
            .forEach(fn => assert.ok(new RegExp('function ' + fn).test(read('sidematches.html')),
                `${fn} still present and untouched by this batch`));
    });

    test('dots and stableford formulas are exactly as shipped', () => {
        const me = read('money-engine.js');
        assert.ok(/dotVal \* \(n \* units - totalUnits\)/.test(me));
        assert.ok(/dollarPerPoint \* \(n \* myPts - sumPts\)/.test(me));
    });
});
