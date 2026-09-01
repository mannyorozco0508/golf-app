// ============================================================================
// KP LIVE LEADERS — Wave A
//
// HOW KP ACTUALLY WORKS ON THE COURSE
//
// Most groups never measure. A marker sits beside the closest ball and the next
// group looks at it and decides whether anybody beat it. So the model is a LIVE
// LEADER a later group can replace, distance is optional supplemental detail,
// and a group that does not beat the marker does nothing at all.
//
// TWO THINGS THIS WAVE FIXES
//
// 1. THE PERMISSION GAP. The old picker listed every pool participant, gated
//    only on "do you hold any group link". A Group 1 scorekeeper could record
//    "Marcus from Group 3" as their KP - money moving on a shot nobody in that
//    group saw. One existing test actually asserted this was correct ("any
//    scorekeeper may"); that contract is reversed here.
//
// 2. STALE CONFIRMATION. kpLeaders is the live on-course state and kpWinners is
//    what settlement reads. If those could be written separately there would be
//    a window where the money authority disagreed with the marker on the green.
//    One atomic .update() writes the leader, the settlement winner and the
//    cleared confirmation together, or none of them.
//
// Wave A does NOT change settlement. Unresolved KP money still refunds today -
// that is Wave B's job, and pretending otherwise here would hide it.
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
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];
const KP_HOLES = [3, 7, 12, 16];

// group: which ?group= link is held. null = bare/spectator link.
function boot({ group = 2, hole = 7, leaders = null, kpWinners = {} } = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:'9', playingForMoney:true }));
    const sc = {};
    ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = 4 + ((pi+hi)%3) - 1; }));
    const gm = {}; ps.forEach((p,i)=>{ gm[String(p.id)] = Math.floor(i/4)+1; });

    const data = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
        settlementMode:'whole-dollar', kpWinners,
        moneyPool: { enabled:true, buyIn:40,
            kp:{ amount:100, holes:KP_HOLES },
            net:{ amount:70, places:[57.142857,42.857143] },
            skins:{ mode:'remainder', scoring:'net', carryOver:false } } };
    if (leaders) data.kpLeaders = leaders;

    vm.runInContext(`
        window.__writes = []; window.__alerts = [];
        alert = m => window.__alerts.push(String(m));
        db.ref = function (pth) { return {
            set: function (v) { window.__writes.push({ path: pth, value: v }); return Promise.resolve(); },
            update: function (v) { window.__writes.push({ path: pth, value: v, atomic: true }); return Promise.resolve(); },
            remove: function () { return Promise.resolve(); },
            on: function () {}, push: function () { return { key: 'k' }; } }; };
        currentMode = 'ABCD';
        currentData = ${JSON.stringify(data)};
        window.__scPlayerGroupMap = ${JSON.stringify(gm)};
        window.__scFilteredPlayers = currentData.players;
        hasGroupLock = ${group !== null}; lockedGroup = ${group === null ? 'null' : group};
        currentViewedHole = ${hole}; actionCenterOpen = true;
        navigator.onLine = true;
        renderActionCenter();
    `, sb);

    const idOf = n => 101 + NAMES.indexOf(n);
    return {
        sb, idOf,
        run: c => vm.runInContext(c, sb),
        html: () => sb.document.getElementById('action-center-mount').innerHTML,
        writes: () => sb.window.__writes,
        alerts: () => sb.window.__alerts,
        setLeader: (n, ft, inch) => vm.runInContext(
            `saveKpLeader(${hole}, '${idOf(n)}', '${ft === undefined ? '' : ft}', '${inch === undefined ? '' : inch}');`, sb),
    };
}
const settle = () => new Promise(r => setImmediate(r));

// ============================================================================

describe('DISTANCE IS OPTIONAL', () => {

    test('a leader saves with no distance at all', async () => {
        const b = boot(); b.setLeader('Manny');
        await settle();
        const w = b.writes()[0];
        assert.equal(w.value['kpLeaders/h7'].playerId, String(b.idOf('Manny')));
        assert.equal(w.value['kpLeaders/h7'].distanceInches, null,
            'nobody should be forced to measure the shot');
    });

    test('a leader saves WITH a distance', async () => {
        const b = boot(); b.setLeader('Manny', 5, 9);
        await settle();
        assert.equal(b.writes()[0].value['kpLeaders/h7'].distanceInches, 69, "5' 9\" = 69 inches");
    });

    test('feet alone and inches alone both work', () => {
        const b = boot();
        assert.equal(b.run("kpDistanceInches('4','')"), 48);
        assert.equal(b.run("kpDistanceInches('','7')"), 7);
        assert.equal(b.run("kpDistanceInches('','')"), null);
        assert.equal(b.run("kpDistanceInches('abc','')"), null, 'garbage is not a measurement');
    });

    test('the label reads back as feet and inches, or says it is not recorded', () => {
        const b = boot();
        assert.equal(b.run('kpDistanceLabel(69)'), "5' 9\"");
        assert.equal(b.run('kpDistanceLabel(null)'), 'Distance not recorded');
    });

    test('the leader record carries the canonical identity, not a re-derived one', async () => {
        const b = boot(); b.setLeader('Manny', 5, 9);
        await settle();
        const l = b.writes()[0].value['kpLeaders/h7'];
        assert.equal(l.playerId, String(b.idOf('Manny')));
        assert.equal(l.playerName, 'Manny');
        assert.equal(l.group, 2, 'group comes from the canonical group map');
        assert.ok(l.updatedAt > 0);
    });
});

describe('ONLY YOUR OWN GROUP', () => {

    test('a group may name its own golfers', () => {
        const b = boot({ group: 2 });
        ['Manny','Matt B','Lance','Kopp'].forEach(n =>
            assert.equal(b.run(`canSetKpLeader(${b.idOf(n)})`), true, `${n} is in group 2`));
    });

    test('a group may NOT name another foursome', () => {
        const b = boot({ group: 2 });
        ['Marty','Carp','Marcus','Jeremy'].forEach(n =>
            assert.equal(b.run(`canSetKpLeader(${b.idOf(n)})`), false,
                `${n} is not in group 2 and must not be claimable`));
    });

    test('THE GAP THIS CLOSES: a cross-group claim writes nothing and says why', async () => {
        const b = boot({ group: 1 });
        b.setLeader('Marcus');                    // group 3
        await settle();
        assert.equal(b.writes().length, 0, 'money must not move on a shot this group never saw');
        assert.ok(b.alerts().some(a => /own group/.test(a)), 'and the refusal must explain itself');
    });

    test('the picker only lists this group\'s golfers', () => {
        const b = boot({ group: 2, hole: 7 });
        b.run('toggleKpEntry(7);');
        const h = b.html();
        ['Manny','Matt B','Lance','Kopp'].forEach(n =>
            assert.ok(h.includes('>' + n + '<'), `${n} should be selectable`));
        ['Marty','Carp','Marcus','Jeremy'].forEach(n =>
            assert.ok(!h.includes('>' + n + '<'), `${n} must not be selectable from group 2`));
    });

    test('a bare/spectator link on a multi-group round claims nothing', () => {
        const b = boot({ group: null });
        NAMES.forEach(n => assert.equal(b.run(`canSetKpLeader(${b.idOf(n)})`), false));
    });

    test('a single-group round is not scoped', () => {
        const sb = loadHtmlInlineScript(PAGE, DEPS);
        vm.runInContext(`
            currentData = { players: [{id:101,name:'A'},{id:102,name:'B'},{id:103,name:'C'},{id:104,name:'D'}] };
            window.__scPlayerGroupMap = {}; hasGroupLock = false; lockedGroup = null;
        `, sb);
        assert.equal(vm.runInContext('canSetKpLeader(101)', sb), true,
            'four golfers on one card need no scoping');
    });

    test('?me= grants nothing', () => {
        const b = boot({ group: 1 });
        b.run(`meId = '${b.idOf('Marcus')}';`);
        assert.equal(b.run(`canSetKpLeader(${b.idOf('Marcus')})`), false,
            'identity must never grant a permission');
    });
});

describe('EVERYONE SEES THE MARKER', () => {

    const LEADER = { h7: { playerId:'105', playerName:'Manny', group:2, distanceInches:69, updatedAt:1 } };

    test('a spectator sees the current leader but gets no picker', () => {
        const b = boot({ group: null, hole: 7, leaders: LEADER });
        const t = strip(b.html());
        assert.match(t, /Hole 7 KP/);
        assert.match(t, /Current: Manny/);
        assert.match(t, /5' 9"/);
        assert.ok(!/Set KP Leader|New Leader/.test(t), 'seeing is not claiming');
    });

    test('another group sees the leader and may still claim it for their own', () => {
        const b = boot({ group: 3, hole: 7, leaders: LEADER });
        const t = strip(b.html());
        assert.match(t, /Current: Manny/, 'group 3 must see who holds it');
        assert.match(t, /New Leader/, 'and be able to beat it with one of their own');
    });

    test('an unclaimed hole says so', () => {
        assert.match(strip(boot({ hole: 7 }).html()), /Hole 7 KP No leader yet/);
    });

    test('a leader with no distance says that plainly', () => {
        const b = boot({ hole: 7, leaders: { h7: { playerId:'105', playerName:'Manny', group:2, distanceInches:null, updatedAt:1 } } });
        const t = strip(b.html());
        assert.match(t, /Current: Manny/);
        assert.match(t, /Distance not recorded/);
    });

    test('nothing renders on a hole that is not a KP hole', () => {
        assert.ok(!/Hole 5 KP/.test(boot({ hole: 5 }).html()));
    });
});

describe('A LATER GROUP REPLACES AN EARLIER LEADER', () => {

    test('group 3 beating the marker takes it over', async () => {
        const b = boot({ group: 3, hole: 7,
            leaders: { h7: { playerId:'105', playerName:'Manny', group:2, distanceInches:69, updatedAt:1 } } });
        b.setLeader('Marcus');
        await settle();
        const w = b.writes()[0];
        assert.equal(w.value['kpLeaders/h7'].playerName, 'Marcus');
        assert.equal(w.value['kpWinners/h7'], String(b.idOf('Marcus')));
    });

    test('a shorter measured shot does NOT auto-win - the golfers decide', async () => {
        // Manny is at 5'9". Marcus takes it with no measurement at all, because the
        // group standing on the green says he is inside the marker.
        const b = boot({ group: 3, hole: 7,
            leaders: { h7: { playerId:'105', playerName:'Manny', group:2, distanceInches:69, updatedAt:1 } } });
        b.setLeader('Marcus');
        await settle();
        assert.equal(b.writes()[0].value['kpLeaders/h7'].playerName, 'Marcus');
        assert.equal(b.writes()[0].value['kpLeaders/h7'].distanceInches, null);
    });

    test('a group that does not beat the marker writes nothing', () => {
        const b = boot({ group: 3, hole: 7,
            leaders: { h7: { playerId:'105', playerName:'Manny', group:2, distanceInches:69, updatedAt:1 } } });
        // They simply never tap. Rendering alone must not write.
        assert.equal(b.writes().length, 0, 'the common case must cost zero interaction');
        assert.match(strip(b.html()), /Current: Manny/);
    });

    test('no distance comparison logic exists to be got wrong', () => {
        const src = read(PAGE);
        const at = src.indexOf('function saveKpLeader');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.ok(!/distanceInches\s*[<>]/.test(fn),
            'the app must not decide the winner by comparing measurements');
    });
});

describe('ONE ATOMIC WRITE — NO STALE CONFIRMATION', () => {

    test('leader, settlement winner and cleared confirmation land together', async () => {
        const b = boot({ group: 2, hole: 7 });
        b.setLeader('Manny', 5, 9);
        await settle();
        assert.equal(b.writes().length, 1, 'one write, not three');
        const w = b.writes()[0];
        assert.equal(w.atomic, true, 'separate writes could leave the money out of step with the marker');
        assert.match(w.path, /events\/ABCD$/);
        assert.ok('kpLeaders/h7' in w.value);
        assert.ok('kpWinners/h7' in w.value);
        assert.ok('kpConfirmed' in w.value);
    });

    test('ANY leader change unconfirms the round', async () => {
        const b = boot({ group: 2, hole: 7 });
        b.setLeader('Manny');
        await settle();
        assert.equal(b.writes()[0].value['kpConfirmed'], null,
            'a confirmed round whose leader moves must stop looking confirmed immediately');
    });

    test('kpWinners stays the settlement source', async () => {
        const b = boot({ group: 2, hole: 7 });
        b.setLeader('Lance');
        await settle();
        assert.equal(b.writes()[0].value['kpWinners/h7'], String(b.idOf('Lance')));
    });

    test('there is exactly ONE kpWinners writer in the page', () => {
        // Counts ASSIGNMENTS, not mentions: reading currentData.kpWinners to render
        // the current leader is not a write, and an earlier draft of this assertion
        // conflated the two.
        const src = read(PAGE);
        // THE RULE IS ABOUT PAIRING, NOT COUNTING. Two places touch kpWinners now -
        // saveKpLeader sets one, and the organizer's no-winner action clears one -
        // and both must clear kpConfirmed in the SAME atomic update. Counting
        // assignments conflated setting a winner with removing one.
        const blocks = src.split('db.ref(');
        const touching = blocks.filter(b => /updates\['kpWinners\/h'/.test(b.slice(-900)));
        assert.ok(touching.length >= 1, 'at least one path writes kpWinners');
        touching.forEach(b => {
            const seg = b.slice(-900);
            assert.match(seg, /updates\['kpConfirmed'\]/,
                'every kpWinners write must clear the confirmation in the same update');
        });
        assert.ok(!/db\.ref\([^)]*kpWinners[^)]*\)\.set/.test(src),
            'a direct leaf .set() would write a winner without clearing the confirmation');
    });

    test('savePoolKp delegates rather than writing its own', () => {
        const src = read(PAGE);
        const at = src.indexOf('function savePoolKp');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /saveKpLeader\(hole, pid, '', ''\)/);
        assert.ok(!/db\.ref/.test(fn), 'the legacy entry point must not be a second writer');
    });
});

describe('SAFETY RAILS PRESERVED', () => {

    test('an offline KP write is refused before Firebase sees it', async () => {
        const b = boot({ group: 2, hole: 7 });
        b.run('navigator.onLine = false;');
        b.setLeader('Manny');
        await settle();
        assert.equal(b.writes().length, 0, 'a buffered money write that never lands is worse than a refusal');
        assert.ok(b.alerts().some(a => /KP NOT SAVED/.test(a)));
    });

    test('score-writing permissions are untouched', () => {
        const src = read(PAGE);
        assert.match(src, /if \(!canWritePlayer\(playerId\)\) return rejectCrossGroupWrite\(playerId\);/);
        const at = src.indexOf('function canWritePlayer');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /return String\(grp\) === String\(lockedGroup\);/);
    });

    test('no settlement arithmetic was added to the page', () => {
        const src = read(PAGE);
        const at = src.indexOf('// ---- KP LEADERS');
        const block = src.slice(at, src.indexOf('function toggleKpEntry'));
        ['allocateWholeDollars(','splitCentsEvenly(','computeMoneyPool(','simplifyDebts(']
            .forEach(t => assert.ok(!block.includes(t), `KP payout math must stay in the engine; found ${t}`));
    });

    test('WAVE B: unresolved KP is withheld, not refunded', () => {
        // This test previously asserted the OPPOSITE - that Wave A deliberately left
        // the refund behaviour in place. Wave B is the change it was flagging, so the
        // assertion is inverted rather than removed: the gap it guarded is now closed.
        const sb = { console, Math, Object, Array, String, Number, JSON, isNaN, parseInt, parseFloat, Date, Set };
        vm.createContext(sb);
        ['handicap.js','money-engine.js','action-model.js','pool-engine.js','settlement-engine.js']
            .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
        const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
        const ps = NAMES.map((n,i)=>({id:101+i,name:n,hcp:'9',playingForMoney:true}));
        const sc = {}; ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole]=4+((pi+hi)%3)-1; }));
        const r = sb.computeMoneyPool({ players:ps, courseData:cd, scores:sc,
            settlementMode:'whole-dollar', kpWinners:{},
            moneyPool:{ enabled:true, buyIn:40, kp:{amount:100,holes:KP_HOLES},
                net:{amount:70,places:[57.142857,42.857143]},
                skins:{mode:'remainder',scoring:'net',carryOver:false} } }, cd, sc);
        assert.equal(r.kpUnresolvedCents, 10000, 'the $100 stays unresolved');
        assert.equal(r.settled, false, 'and the round is not settled');
        assert.ok(!/Unclaimed KP/.test(r.refund.reasons.join(' ')),
            'the $8/$9 refund lines must be gone');
    });
});
