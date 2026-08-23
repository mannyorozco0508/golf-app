// ============================================================================
// GROUP-OWNED ACTION — the creation flow
//
// Phase 0 stopped a group from writing another group's money. Phase 1 made
// participant-scoped Dots and Stableford settle correctly. This batch is the
// user-facing half: each foursome can now create and own its own action.
//
// THE MODEL
//   scope: 'group'  + ownerGroup: N   a local game inside one foursome
//   scope: 'cross'                    an explicitly cross-group wager
//
// participantIds answers "who pays". scope/ownerGroup answer "whose wager is
// this" - which participants alone cannot, because a Skins game of Marty, Manny
// and Stan could be a deliberate cross-group bet or a mis-assembled local one,
// and those have different management rules.
//
// These are DOM interaction tests, not source greps. They boot the real page,
// drive the real functions, and read what actually reached Firebase.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PAGE = ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js'];

// Boots sidematches.html with `count` golfers and a given ?group= context.
// 8 golfers = two groups of four; 12 = three; 4 = one.
function boot(count, groupParam) {
    const sb = loadHtmlInlineScript('sidematches.html', PAGE);
    const cd = makeCourseData(18);
    const names = ['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James',
                   'Ryan', 'Dalen', 'Nick', 'Paul'].slice(0, count);
    const p = makePlayers(names, names.map(() => 0));
    const scores = {};
    cd.slice(0, 6).forEach(h => p.forEach(pl => { scores[`p${pl.id}_h${h.hole}`] = h.par; }));

    vm.runInContext(`
        window.__writes = [];
        db.ref = function (pth) { return {
            set: function (v) { window.__writes.push({ path: pth, op: 'set', value: v }); return Promise.resolve(); },
            remove: function () { window.__writes.push({ path: pth, op: 'remove' }); return Promise.resolve(); },
            update: function (v) { window.__writes.push({ path: pth, op: 'update', value: v }); return Promise.resolve(); },
            push: function () { return { key: 'k' + (window.__writes.length + 1) }; },
            on: function () {}, once: function () { return Promise.resolve({ val: function () { return null; } }); }
        }; };
        currentMode = 'ABCD';
        currentData = ${JSON.stringify({ gameFormat: 'stroke', players: p, courseData: cd, scores, sideMatches: {} })};
        hasGroupLock = ${groupParam !== null};
        lockedGroup = ${groupParam === null ? 'null' : groupParam};
    `, sb);

    const groups = {};
    p.forEach((pl, i) => {
        const g = Math.floor(i / 4) + 1;
        (groups[g] = groups[g] || []).push(pl);
    });

    return {
        sb, p, groups,
        run: code => vm.runInContext(code, sb),
        writes: () => sb.window.__writes,
        wrote: () => sb.window.__writes.length > 0,
        last: () => sb.window.__writes[sb.window.__writes.length - 1],
        html: id => (sb.document.getElementById(id).innerHTML || ''),
        shown: id => sb.document.getElementById(id).style.display !== 'none',
        ids: g => groups[g].map(pl => String(pl.id))
    };
}
const ORGANIZER = null;

// Drives the real two-sided picker and the real save.
function makeMatch(b, aIds, bIds, opts) {
    const st = {};
    aIds.forEach(id => { st[String(id)] = 'a'; });
    bIds.forEach(id => { st[String(id)] = 'b'; });
    b.run(`sidematchPickState = ${JSON.stringify(st)};`);
    b.sb.__setElement('sm-format', (opts && opts.format) || 'match');
    b.sb.__setElement('sm-scoring', 'net');
    b.sb.__setElement('sm-stake', '50');
    b.sb.__setElement('sm-press-rule', 'none');
    b.sb.__setElement('sm-start-hole', '1');
    b.sb.__setElement('sm-holestake', '5');
    b.sb.__setElement('sm-overallstake', '20');
    b.sb.__setElement('sm-tie-rule', 'carry');
    b.sb.__setElement('sm-overall-mode', 'stroke');
    b.sb.__setElement('sm-segment', 'full');
    b.run(`saveSideMatch();`);
}

function fieldForm(b, stake) {
    b.sb.__setElement('sm-field-stake', String(stake === undefined ? 10 : stake));
    b.sb.__setElement('sm-field-start', '1');
    b.sb.__setElement('sm-field-mode', 'gross');
    b.sb.__setElement('sm-field-carry', 'yes');
}

// ---------------------------------------------------------------------------
describe('SCOPE CHOOSER — asked only when there is something to choose', () => {
    test('a ONE-GROUP round skips the chooser entirely', () => {
        // Marty Monday must not get slower. Four golfers, one foursome, no question.
        const b = boot(4, ORGANIZER);
        b.run(`openSideMatchModal();`);
        assert.equal(b.shown('sm-scope-step'), false, 'no scope step on a single-group round');
        assert.equal(b.shown('sm-form-step'), true, 'straight to the wager form');
        assert.equal(vm.runInContext('actionScope', b.sb), 'group');
        assert.equal(vm.runInContext('actionOwnerGroup', b.sb), 1);
    });

    test('a MULTI-GROUP round asks first', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal();`);
        assert.equal(b.shown('sm-scope-step'), true);
        assert.equal(b.shown('sm-form-step'), false);
        assert.equal(vm.runInContext('actionScope', b.sb), null, 'nothing is assumed');
    });

    test('a group link\'s "this group" is named as their own', () => {
        const b = boot(8, 2);
        b.run(`openSideMatchModal();`);
        assert.match(b.sb.document.getElementById('sm-scope-group-title').textContent, /Group 2/);
    });

    test('choosing THIS GROUP from a group link goes straight to the form', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        assert.equal(b.shown('sm-form-step'), true);
        assert.equal(vm.runInContext('actionOwnerGroup', b.sb), 1);
    });

    test('the ORGANIZER is asked WHICH group, then reaches the form', () => {
        const b = boot(12, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        assert.equal(b.shown('sm-owner-step'), true, 'organizer must pick a group first');
        assert.match(b.html('sm-owner-choices'), /Group 1/);
        assert.match(b.html('sm-owner-choices'), /Group 3/);
        b.run(`pickOwnerGroup(3);`);
        assert.equal(b.shown('sm-form-step'), true);
        assert.equal(vm.runInContext('actionOwnerGroup', b.sb), 3);
    });

    test('ACROSS GROUPS goes straight to the form with no owner', () => {
        const b = boot(8, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('cross');`);
        assert.equal(vm.runInContext('actionScope', b.sb), 'cross');
        assert.equal(vm.runInContext('actionOwnerGroup', b.sb), null);
    });

    test('Back returns to the chooser and clears the pending scope', () => {
        const b = boot(12, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('group'); backToScopeStep();`);
        assert.equal(b.shown('sm-scope-step'), true);
        assert.equal(vm.runInContext('actionScope', b.sb), null);
    });
});

// ---------------------------------------------------------------------------
describe('THIS GROUP PICKER — only the foursome', () => {
    test('a Group 1 link sees only Group 1 golfers', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        const names = b.sb.selectablePlayers().map(p => p.name).join(',');
        assert.equal(names, 'Marty,Manny,John,Steve');
    });

    test('the rendered picker shows no other group\'s golfers', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group'); renderSideMatchPicker();`);
        const html = b.html('sm-player-picker-a');
        ['Marty', 'Manny', 'John', 'Steve'].forEach(n => assert.match(html, new RegExp(n)));
        ['Stan', 'Greg', 'Tony', 'James'].forEach(n =>
            assert.ok(!new RegExp(n).test(html), `${n} must not be offered in a Group 1 local game`));
    });

    test('the ORGANIZER picking Group 2 sees only Group 2', () => {
        const b = boot(8, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('group'); pickOwnerGroup(2); renderSideMatchPicker();`);
        const html = b.html('sm-player-picker-a');
        assert.match(html, /Stan/);
        assert.ok(!/Marty/.test(html), 'Group 1 must not appear in a Group 2 local game');
    });

    test('a group game does not repeat the group name on every badge', () => {
        // Inside one foursome every golfer is in the same group; the tag is noise.
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group'); renderSideMatchPicker();`);
        assert.ok(!/Group 1<\/span>/.test(b.html('sm-player-picker-a')));
    });
});

// ---------------------------------------------------------------------------
describe('ACROSS GROUPS PICKER — the whole field, visibly grouped', () => {
    test('every golfer is offered', () => {
        const b = boot(8, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('cross'); renderSideMatchPicker();`);
        const html = b.html('sm-player-picker-a');
        ['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James']
            .forEach(n => assert.match(html, new RegExp(n)));
    });

    test('golfers are shown under group headings', () => {
        const b = boot(12, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('cross'); renderSideMatchPicker();`);
        const html = b.html('sm-player-picker-a');
        assert.match(html, /sm-pick-group-head">Group 1</);
        assert.match(html, /sm-pick-group-head">Group 2</);
        assert.match(html, /sm-pick-group-head">Group 3</);
    });

    test('a group link choosing Across Groups is still limited by PERMISSION', () => {
        // Scope is what you want; permission is what you may. Phase 0 wins.
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('cross');`);
        const names = b.sb.selectablePlayers().map(p => p.name).join(',');
        assert.equal(names, 'Marty,Manny,John,Steve',
            'a group scorekeeper still cannot build a wager from other groups');
    });
});

// ---------------------------------------------------------------------------
describe('DOTS — group-local, and never across groups', () => {
    test('Dots is offered under THIS GROUP', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        const opts = Array.from(b.sb.document.getElementById('sm-format').options).map(o => o.value);
        assert.ok(opts.includes('dots'));
    });

    test('Dots is ABSENT under ACROSS GROUPS, with the reason stated', () => {
        const b = boot(8, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('cross');`);
        const opts = Array.from(b.sb.document.getElementById('sm-format').options).map(o => o.value);
        assert.ok(!opts.includes('dots'), 'a broken option must not be offered and then rejected');
        assert.match(b.sb.document.getElementById('sm-format-note').textContent,
            /played within one scoring group/);
    });

    test('Dots comes back when the golfer switches to THIS GROUP', () => {
        const b = boot(8, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('cross'); backToScopeStep(); pickActionScope('group'); pickOwnerGroup(1);`);
        const opts = Array.from(b.sb.document.getElementById('sm-format').options).map(o => o.value);
        assert.ok(opts.includes('dots'));
    });

    test('a group Dots game saves participantIds, scope and ownerGroup', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        b.sb.__setElement('sm-format', 'dots');
        fieldForm(b, 5);
        b.run(`saveFieldAction('dots');`);
        const v = b.last().value;
        assert.equal(v.format, 'dots');
        assert.equal(v.dotPointVal, 5);
        assert.equal(v.scope, 'group');
        assert.equal(v.ownerGroup, 1);
        assert.equal(v.participantIds.map(String).sort().join(), b.ids(1).sort().join());
    });

    test('it is written as an INSTANCE, never the single-slot legacy map', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        fieldForm(b, 5);
        b.run(`saveFieldAction('dots');`);
        assert.match(b.last().path, /additionalGameInstances\//,
            'the legacy slot holds one game per format and cannot support two groups');
        assert.ok(!/additionalGames\//.test(b.last().path));
    });

    test('the form names the group whose game it is', () => {
        const b = boot(8, 2);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        b.sb.__setElement('sm-format', 'dots');
        b.run(`renderFieldActionForm('dots');`);
        const html = b.html('sm-field-players');
        assert.match(html, /Group 2/);
        assert.match(html, /Stan/);
        assert.ok(!/Marty/.test(html), 'a Group 2 dots game must not list Group 1 golfers');
    });

    test('a ONE-GROUP round writes NO participantIds — byte-identical to before', () => {
        const b = boot(4, ORGANIZER);
        b.run(`openSideMatchModal();`);
        fieldForm(b, 5);
        b.run(`saveFieldAction('dots');`);
        const v = b.last().value;
        assert.equal(v.participantIds, undefined,
            'one foursome IS the field; recording nothing keeps legacy rounds identical');
        assert.equal(v.ownerGroup, 1);
    });

    test('saving Dots under cross scope is refused at the WRITE, not just hidden', () => {
        const b = boot(8, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('cross');`);
        fieldForm(b, 5);
        b.run(`saveFieldAction('dots');`);
        assert.equal(b.wrote(), false, 'removing an <option> is not a guard');
    });
});

// ---------------------------------------------------------------------------
describe('TWO GROUPS, TWO INDEPENDENT DOTS GAMES', () => {
    test('each group writes its own instance with its own field and stake', () => {
        const g1 = boot(8, 1);
        g1.run(`openSideMatchModal(); pickActionScope('group');`);
        fieldForm(g1, 5);
        g1.run(`saveFieldAction('dots');`);

        const g2 = boot(8, 2);
        g2.run(`openSideMatchModal(); pickActionScope('group');`);
        fieldForm(g2, 10);
        g2.run(`saveFieldAction('dots');`);

        const a = g1.last().value, bb = g2.last().value;
        assert.equal(a.dotPointVal, 5);
        assert.equal(bb.dotPointVal, 10);
        assert.equal(a.ownerGroup, 1);
        assert.equal(bb.ownerGroup, 2);
        assert.equal(a.participantIds.map(String).sort().join(), g1.ids(1).sort().join());
        assert.equal(bb.participantIds.map(String).sort().join(), g2.ids(2).sort().join());

        // No golfer appears in both pots.
        const overlap = a.participantIds.map(String).filter(id => bb.participantIds.map(String).includes(id));
        assert.equal(overlap.length, 0, 'the two dots games must share no participants');
    });

    test('three groups produce three disjoint dots games', () => {
        const seen = [];
        [1, 2, 3].forEach(g => {
            const b = boot(12, g);
            b.run(`openSideMatchModal(); pickActionScope('group');`);
            fieldForm(b, g * 5);
            b.run(`saveFieldAction('dots');`);
            const v = b.last().value;
            assert.equal(v.ownerGroup, g);
            assert.equal(v.participantIds.map(String).sort().join(), b.ids(g).sort().join());
            seen.push(v.participantIds.map(String));
        });
        const all = seen.flat();
        assert.equal(new Set(all).size, all.length, 'no golfer may appear in two group dots games');
    });
});

// ---------------------------------------------------------------------------
describe('SKINS — seeded with the group, golfers can sit out', () => {
    test('a group Skins game starts with the whole foursome ticked', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        b.sb.__setElement('sm-format', 'skins');
        b.run(`onSideMatchFormatChange();`);
        const picked = Object.keys(vm.runInContext('fieldActionPick', b.sb)).sort();
        assert.equal(picked.join(), b.ids(1).sort().join(), 'the fast path is "type the money, save"');
    });

    test('tapping a golfer off narrows the pot and records it', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        b.sb.__setElement('sm-format', 'skins');
        b.run(`onSideMatchFormatChange();`);
        const steve = b.ids(1)[3];
        b.run(`toggleFieldActionPlayer('${steve}');`);
        fieldForm(b, 10);
        b.run(`saveFieldAction('skins');`);
        const v = b.last().value;
        assert.equal(v.participantIds.map(String).includes(String(steve)), false, 'Steve sat out');
        assert.equal(v.participantIds.length, 3);
        assert.equal(v.ownerGroup, 1);
        assert.equal(v.scope, 'group');
    });

    test('Skins IS available across groups', () => {
        const b = boot(8, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('cross');`);
        const opts = Array.from(b.sb.document.getElementById('sm-format').options).map(o => o.value);
        assert.ok(opts.includes('skins'), 'skins genuinely supports participants across groups');
    });

    test('a cross-group Skins game records scope cross and no ownerGroup', () => {
        const b = boot(8, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('cross');`);
        b.sb.__setElement('sm-format', 'skins');
        b.run(`onSideMatchFormatChange(); fieldActionPick = {};
               toggleFieldActionPlayer('${b.ids(1)[0]}');
               toggleFieldActionPlayer('${b.ids(2)[0]}');`);
        fieldForm(b, 10);
        b.run(`saveFieldAction('skins');`);
        const v = b.last().value;
        assert.equal(v.scope, 'cross');
        assert.equal(v.ownerGroup, undefined);
        assert.equal(v.participantIds.length, 2);
    });
});

// ---------------------------------------------------------------------------
describe('MATCH / STROKE / NASSAU / 2v2 — scope recorded, math untouched', () => {
    test('a local 1v1 records scope group and ownerGroup', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        makeMatch(b, [b.ids(1)[0]], [b.ids(1)[1]]);
        const v = b.last().value;
        assert.equal(v.scope, 'group');
        assert.equal(v.ownerGroup, 1);
        assert.equal(v.format, 'match');
        assert.equal(v.stake, 50);
    });

    test('a local 2v2 records the same', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        makeMatch(b, [b.ids(1)[0], b.ids(1)[3]], [b.ids(1)[1], b.ids(1)[2]], { format: 'nassau' });
        const v = b.last().value;
        assert.equal(v.ownerGroup, 1);
        assert.equal(v.teamAIds.length, 2);
        assert.equal(v.teamBIds.length, 2);
    });

    test('a cross-group match records scope cross with no ownerGroup', () => {
        const b = boot(8, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('cross');`);
        makeMatch(b, [b.ids(1)[0]], [b.ids(2)[0]]);   // Marty vs Stan
        const v = b.last().value;
        assert.equal(v.scope, 'cross');
        assert.equal(v.ownerGroup, undefined);
    });

    test('THIS GROUP cannot be silently converted into a cross-group wager', () => {
        // The organizer chooses "Group 1", then assembles Marty vs Stan anyway. The
        // whole point of an explicit chooser is that this is refused, not relabelled.
        const b = boot(8, ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('group'); pickOwnerGroup(1);`);
        makeMatch(b, [b.ids(1)[0]], [b.ids(2)[0]]);
        assert.equal(b.wrote(), false, 'a group wager must actually be inside its group');
    });

    test('a ONE-GROUP round records no scope metadata at all', () => {
        const b = boot(4, ORGANIZER);
        b.run(`openSideMatchModal();`);
        makeMatch(b, [b.ids(1)[0]], [b.ids(1)[1]]);
        const v = b.last().value;
        assert.equal(v.scope, undefined, 'legacy-shaped, byte-identical to before this feature');
        assert.equal(v.ownerGroup, undefined);
    });

    test('Stroke play carries scope too', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        makeMatch(b, [b.ids(1)[0]], [b.ids(1)[2]], { format: 'stroke' });
        const v = b.last().value;
        assert.equal(v.scope, 'group');
        assert.equal(v.ownerGroup, 1);
        assert.equal(v.holeStake, 5);
    });
});

// ---------------------------------------------------------------------------
describe('PHASE 0 GUARDS ARE NOT LOOSENED', () => {
    test('a group link still cannot create a wager containing another group', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('cross');`);
        makeMatch(b, [b.ids(1)[0]], [b.ids(2)[0]]);
        assert.equal(b.wrote(), false, 'choosing "across groups" does not grant permission');
    });

    test('a group link cannot start another group\'s Skins game', () => {
        const b = boot(8, 1);
        b.run(`openSideMatchModal(); pickActionScope('group');
               actionOwnerGroup = 2; fieldActionPick = {};
               toggleFieldActionPlayer('${boot(8, 1).ids(2)[0]}');
               toggleFieldActionPlayer('${boot(8, 1).ids(2)[1]}');`);
        fieldForm(b, 10);
        b.run(`saveFieldAction('skins');`);
        assert.equal(b.wrote(), false);
    });

    test('auto-pair is still organizer-only', () => {
        const b = boot(8, 1);
        b.run(`autoPairPreview = [{ teamA: [{id:'${b.ids(1)[0]}'}], teamB: [{id:'${b.ids(2)[0]}'}] }];`);
        b.sb.__setElement('autopair-format', 'match');
        b.sb.__setElement('autopair-scoring', 'net');
        b.sb.__setElement('autopair-stake', '20');
        b.sb.__setElement('autopair-press-rule', 'none');
        b.run(`confirmAutoPairCreate();`);
        assert.equal(b.wrote(), false);
    });
});

// ---------------------------------------------------------------------------
describe('THE MONEY IS UNTOUCHED BY THIS BATCH', () => {
    test('scope and ownerGroup are metadata the engines never read', () => {
        ['money-engine.js', 'settlement-engine.js', 'action-model.js'].forEach(f => {
            const src = read(f);
            assert.ok(!/\bownerGroup\b/.test(src), `${f} must not read ownerGroup`);
            assert.ok(!/cfg\.scope|data\.scope|game\.scope/.test(src), `${f} must not read scope`);
        });
    });

    test('the dots and stableford formulas are still exactly as shipped', () => {
        const me = read('money-engine.js');
        assert.ok(/dotVal \* \(n \* units - totalUnits\)/.test(me));
        assert.ok(/dollarPerPoint \* \(n \* myPts - sumPts\)/.test(me));
    });

    test('settlement still scopes through fieldParticipants, unchanged from Phase 1', () => {
        assert.ok(/fieldParticipants\(cfg\)/.test(read('settlement-engine.js')));
    });
});
