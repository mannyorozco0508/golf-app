// ============================================================================
// CROSS-GROUP ACTION — the anchor rule, in the picker and at the write guard
//
// THE BUG THIS FIXES
//
// From a Group 2 scorekeeper link, choosing ADD ACTION → Across Groups showed
// the banner "Across Groups — pick golfers from different foursomes" and then
// offered only the four Group 2 golfers. The modal advertised a scope the
// picker refused to honour, so the feature was unreachable on a real device.
//
// selectablePlayers() was filtering the pool down to lockedGroup before the
// scope was consulted. That filter was correct when it was written - it carried
// its own expiry note saying it was conservative "pending the Group Action
// work", because the picker could not yet distinguish a local game from an
// explicitly cross-group one. The This Group / Across Groups chooser now
// exists, so the precondition has been met.
//
// THE ANCHOR RULE that replaces it:
//
//   A locked Group N link may create an Across-Groups wager when
//     1. Across Groups was explicitly chosen
//     2. at least ONE selected golfer belongs to Group N
//     3. every other selected golfer is a real golfer in the round
//     4. only explicitly selected golfers enter the wager
//
// Rule 2 is what keeps this from becoming "any link may commit anyone to
// money". Group 2 can set up Group 2 vs Group 1. Group 2 cannot set up
// Group 1 vs Group 3 and walk away - nobody in that wager agreed to it in
// front of them.
//
// The picker cannot pre-filter for rule 2, because "at least one of ours" is a
// property of the COMBINATION rather than of any single name. So the picker
// shows the whole field and calls the SAME function the write guard calls to
// warn live. A UI that offers a combination the guard then rejects is its own
// kind of bug, and the tests below hold both halves to one policy.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

// The loader's second argument is the DEPENDENCY LIST the page loads via
// <script src>, not the page name. Mirrors sidematch_group_isolation_test.js.
const PAGE = 'sidematches.html';
const DEPS = ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js'];
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// Twelve generic golfers, three groups of four - the shape this batch is about.
function twelveGolfers() {
    const cd = makeCourseData(18);
    const names = ['Avery', 'Blake', 'Casey', 'Devon', 'Ellis', 'Finley',
        'Gray', 'Harper', 'Indigo', 'Jordan', 'Kendall', 'Logan'];
    const p = makePlayers(names, names.map(() => 0));
    return { cd, p, g1: p.slice(0, 4), g2: p.slice(4, 8), g3: p.slice(8, 12) };
}

function boot(groupParam) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const { cd, p, g1, g2, g3 } = twelveGolfers();

    const scores = {};
    cd.slice(0, 6).forEach(h => p.forEach(pl => { scores[`p${pl.id}_h${h.hole}`] = h.par; }));

    const data = { gameFormat: 'stroke', players: p, courseData: cd, scores, sideMatches: {} };

    vm.runInContext(`
        window.__writes = [];
        db.ref = function (pth) { return {
            set: function (v) { window.__writes.push({ path: pth, op: 'set', value: v }); return Promise.resolve(); },
            remove: function () { window.__writes.push({ path: pth, op: 'remove' }); return Promise.resolve(); },
            update: function (v) { window.__writes.push({ path: pth, op: 'update', value: v }); return Promise.resolve(); },
            push: function () { return { key: 'k1', set: function (v) { window.__writes.push({ path: pth + '/k1', op: 'set', value: v }); return Promise.resolve(); } }; },
            on: function () {}, once: function () { return Promise.resolve({ val: function () { return null; } }); }
        }; };
        currentMode = 'ABCD';
        currentData = ${JSON.stringify(data)};
        hasGroupLock = ${groupParam !== null};
        lockedGroup = ${groupParam === null ? 'null' : groupParam};
    `, sb);

    return {
        sb, p, cd, g1, g2, g3,
        ids: (g) => ({ 1: g1, 2: g2, 3: g3 })[g].map(x => String(x.id)),
        writes: () => sb.window.__writes,
        wrote: () => sb.window.__writes.length > 0,
        run: code => vm.runInContext(code, sb),
        html: id => sb.document.getElementById(id).innerHTML,
    };
}

const ORGANIZER = null;

// Puts the picker into a given scope and selects two sides.
function pick(b, scope, aIds, bIds) {
    b.run(`openSideMatchModal(); pickActionScope('${scope}');`);
    const state = {};
    aIds.forEach(id => { state[String(id)] = 'a'; });
    bIds.forEach(id => { state[String(id)] = 'b'; });
    b.run(`sidematchPickState = ${JSON.stringify(state)}; renderSideMatchPicker();`);
}

// ============================================================================

describe('THE PICKER — Across Groups must actually show the other groups', () => {

    test('from a Group 2 link, Across Groups offers all twelve golfers', () => {
        const b = boot(2);
        b.run(`openSideMatchModal(); pickActionScope('cross');`);
        const offered = b.sb.selectablePlayers().map(p => String(p.id)).sort();
        const everyone = b.p.map(p => String(p.id)).sort();
        assert.deepEqual(JSON.parse(JSON.stringify(offered)), everyone,
            'Across Groups from a group link must offer the whole field.');
    });

    test('the rendered picker physically shows names from Group 1, 2 AND 3', () => {
        const b = boot(2);
        b.run(`openSideMatchModal(); pickActionScope('cross'); renderSideMatchPicker();`);
        const html = b.html('sm-player-picker-a');
        assert.match(html, /Avery/, 'a Group 1 golfer must appear');
        assert.match(html, /Ellis/, 'a Group 2 golfer must appear');
        assert.match(html, /Indigo/, 'a Group 3 golfer must appear');
    });

    test('the rendered picker labels which foursome each golfer is in', () => {
        // "Avery vs Indigo" is two names until you know which group each is in.
        const b = boot(2);
        b.run(`openSideMatchModal(); pickActionScope('cross'); renderSideMatchPicker();`);
        const html = b.html('sm-player-picker-a');
        assert.match(html, /Group 1/);
        assert.match(html, /Group 2/);
        assert.match(html, /Group 3/);
    });

    test('This Group from a Group 2 link still shows Group 2 only', () => {
        const b = boot(2);
        b.run(`openSideMatchModal(); pickActionScope('group');`);
        const offered = b.sb.selectablePlayers().map(p => p.name);
        assert.deepEqual(JSON.parse(JSON.stringify(offered)).sort(),
            ['Ellis', 'Finley', 'Gray', 'Harper'],
            'Choosing This Group must not leak the rest of the field.');
    });

    test('the organizer is unchanged in both scopes', () => {
        const b = boot(ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('cross');`);
        assert.equal(b.sb.selectablePlayers().length, 12);
        b.run(`actionScope = 'group'; actionOwnerGroup = 3;`);
        assert.equal(b.sb.selectablePlayers().length, 4);
    });
});

describe('THE ANCHOR RULE — at least one of ours, and everyone real', () => {

    test('Group 2 link: a Group 2 golfer vs a Group 1 golfer is ALLOWED', () => {
        const b = boot(2);
        b.run(`actionScope = 'cross';`);
        const ok = b.sb.canCreateWagerWith([b.ids(2)[0], b.ids(1)[0]]);
        assert.equal(ok, true, 'Ellis vs Avery is exactly the wager this batch exists to enable.');
    });

    test('Group 2 link: 2v2 across two foursomes is ALLOWED', () => {
        const b = boot(2);
        b.run(`actionScope = 'cross';`);
        const ok = b.sb.canCreateWagerWith([b.ids(2)[0], b.ids(2)[1], b.ids(1)[0], b.ids(1)[1]]);
        assert.equal(ok, true);
    });

    test('Group 2 link: Group 1 vs Group 3 is REFUSED — Group 2 has no stake in it', () => {
        const b = boot(2);
        b.run(`actionScope = 'cross';`);
        const ok = b.sb.canCreateWagerWith([b.ids(1)[0], b.ids(3)[0]]);
        assert.equal(ok, false, 'Nobody in that wager agreed to it in front of the Group 2 scorekeeper.');
    });

    test('an unknown golfer id is REFUSED even with an anchor present', () => {
        const b = boot(2);
        b.run(`actionScope = 'cross';`);
        assert.equal(b.sb.canCreateWagerWith([b.ids(2)[0], '99999']), false,
            'Rule 3: every selected golfer must be real.');
    });

    test('an empty selection is REFUSED', () => {
        const b = boot(2);
        b.run(`actionScope = 'cross';`);
        assert.equal(b.sb.canCreateWagerWith([]), false);
    });

    test('under This Group scope the old strict rule still applies', () => {
        const b = boot(2);
        b.run(`actionScope = 'group'; actionOwnerGroup = 2;`);
        assert.equal(b.sb.canCreateWagerWith([b.ids(2)[0], b.ids(2)[1]]), true);
        assert.equal(b.sb.canCreateWagerWith([b.ids(2)[0], b.ids(1)[0]]), false,
            'A wager labelled as this foursome\'s must actually be this foursome\'s.');
    });

    test('the organizer may still build any wager at all', () => {
        const b = boot(ORGANIZER);
        b.run(`actionScope = 'cross';`);
        assert.equal(b.sb.canCreateWagerWith([b.ids(1)[0], b.ids(3)[0]]), true);
    });
});

describe('PICKER AND GUARD SPEAK WITH ONE VOICE', () => {

    test('the live warning fires on exactly the combinations the guard refuses', () => {
        const b = boot(2);
        b.run(`actionScope = 'cross';`);
        const cases = [
            [[b.ids(2)[0], b.ids(1)[0]], true],
            [[b.ids(2)[0], b.ids(2)[1], b.ids(1)[0], b.ids(1)[1]], true],
            [[b.ids(1)[0], b.ids(3)[0]], false],
            [[b.ids(1)[0], b.ids(1)[1]], false],
            [[b.ids(3)[0], b.ids(3)[1]], false],
        ];
        cases.forEach(([ids, allowed]) => {
            const guard = b.sb.canCreateWagerWith(ids);
            const warn = b.sb.crossGroupAnchorWarning(ids);
            assert.equal(guard, allowed, `guard disagreed for ${JSON.stringify(ids)}`);
            assert.equal(warn === '', allowed,
                `The picker and the write guard disagree for ${JSON.stringify(ids)} — one of them will surprise a golfer.`);
        });
    });

    test('the warning explains the rule rather than just refusing', () => {
        const b = boot(2);
        b.run(`actionScope = 'cross';`);
        const warn = b.sb.crossGroupAnchorWarning([b.ids(1)[0], b.ids(3)[0]]);
        assert.match(warn, /at least one Group 2 golfer/);
    });

    test('the organizer never sees the warning', () => {
        const b = boot(ORGANIZER);
        b.run(`actionScope = 'cross';`);
        assert.equal(b.sb.crossGroupAnchorWarning([b.ids(1)[0], b.ids(3)[0]]), '');
    });

    test('the picker feedback line shows the warning instead of a green tick', () => {
        const b = boot(2);
        pick(b, 'cross', [b.ids(1)[0]], [b.ids(3)[0]]);
        b.run(`updateSideMatchPickerFeedback();`);
        const html = b.html('sm-team-size-indicator');
        assert.match(html, /at least one Group 2 golfer/);
        assert.ok(!/\u2705/.test(html), 'An unbuildable wager must not be shown as valid.');
    });

    test('a legitimate cross-group pick shows the green tick', () => {
        const b = boot(2);
        pick(b, 'cross', [b.ids(2)[0]], [b.ids(1)[0]]);
        b.run(`updateSideMatchPickerFeedback();`);
        assert.match(b.html('sm-team-size-indicator'), /1v1/);
    });
});

describe('SAVING — the write path honours the same rule', () => {

    function fillMatchForm(b) {
        b.sb.__setElement('sm-format', 'match');
        b.sb.__setElement('sm-scoring', 'net');
        b.sb.__setElement('sm-stake', '50');
        b.sb.__setElement('sm-press-rule', 'anytime');
        b.sb.__setElement('sm-start-hole', '1');
    }

    test('Group 2 saves a genuine cross-group match', () => {
        const b = boot(2);
        pick(b, 'cross', [b.ids(2)[0]], [b.ids(1)[0]]);
        fillMatchForm(b);
        b.run(`saveSideMatch();`);
        assert.equal(b.wrote(), true, 'A legitimate cross-group match must save.');
        const w = b.writes()[0];
        assert.deepEqual(JSON.parse(JSON.stringify(w.value.teamAIds)), [b.ids(2)[0]]);
        assert.deepEqual(JSON.parse(JSON.stringify(w.value.teamBIds)), [b.ids(1)[0]]);
    });

    test('Group 2 cannot save a Group 1 vs Group 3 match', () => {
        const b = boot(2);
        pick(b, 'cross', [b.ids(1)[0]], [b.ids(3)[0]]);
        fillMatchForm(b);
        b.run(`saveSideMatch();`);
        assert.equal(b.wrote(), false, 'The write guard must refuse an unanchored wager.');
    });

    test('only the explicitly selected golfers end up in the wager', () => {
        // Rule 4. Nobody gets swept in because they happen to share a foursome.
        const b = boot(2);
        pick(b, 'cross', [b.ids(2)[0]], [b.ids(1)[0]]);
        fillMatchForm(b);
        b.run(`saveSideMatch();`);
        const v = b.writes()[0].value;
        const all = JSON.parse(JSON.stringify(v.teamAIds.concat(v.teamBIds)));
        assert.equal(all.length, 2);
        assert.ok(!all.includes(b.ids(2)[1]), 'A Group 2 teammate who was not picked must not be enrolled.');
    });
});

describe('EXISTING ISOLATION IS UNTOUCHED', () => {

    test('an uninvolved group still cannot manage a wager between two others', () => {
        const b = boot(3);
        const match = { format: 'match', scoring: 'net', stake: 50, startHole: 1,
            teamAIds: [b.ids(1)[0]], teamBIds: [b.ids(2)[0]] };
        assert.equal(b.sb.canManageSideMatch(match), false,
            'Group 3 has no stake in a Group 1 vs Group 2 match.');
    });

    test('an involved group can still manage a cross-group wager it is in', () => {
        const b = boot(2);
        const match = { format: 'match', scoring: 'net', stake: 50, startHole: 1,
            teamAIds: [b.ids(1)[0]], teamBIds: [b.ids(2)[0]] };
        assert.equal(b.sb.canManageSideMatch(match), true);
    });

    test('Dots is still refused Across Groups', () => {
        const b = boot(2);
        b.run(`fieldActionPick = ${JSON.stringify({})};`);
        const ids = b.ids(2);
        b.run(`fieldActionPick = ${JSON.stringify(Object.fromEntries(ids.map(i => [i, true])))};`);
        b.sb.__setElement('sm-format', 'dots');
        b.sb.__setElement('sm-field-stake', '2');
        b.sb.__setElement('sm-field-start', '1');
        b.sb.__setElement('sm-field-mode', 'gross');
        b.sb.__setElement('sm-field-carry', 'yes');
        b.run(`actionScope = 'cross'; actionOwnerGroup = null; saveFieldAction('dots');`);
        assert.equal(b.wrote(), false, 'Dots is a foursome game and must never span groups.');
    });

    test('no silent scope conversion: a cross-group set of golfers cannot be saved as This Group', () => {
        // For an organizer on a multi-group round, pickActionScope('group') opens the
        // owner-group chooser and commits nothing yet - scope stays null until
        // pickOwnerGroup() runs. Driving that second step is what produces a real
        // committed 'group' scope, so the guard is exercised the way the UI reaches it.
        const b = boot(ORGANIZER);
        b.run(`openSideMatchModal(); pickActionScope('group'); pickOwnerGroup(1);`);
        const st = {};
        st[b.ids(1)[0]] = 'a';
        st[b.ids(2)[0]] = 'b';
        b.run(`sidematchPickState = ${JSON.stringify(st)}; renderSideMatchPicker();`);
        assert.equal(b.run(`actionScope`), 'group', 'scope must actually be committed for this test to mean anything');
        b.sb.__setElement('sm-format', 'match');
        b.sb.__setElement('sm-scoring', 'net');
        b.sb.__setElement('sm-stake', '50');
        b.sb.__setElement('sm-press-rule', 'anytime');
        b.sb.__setElement('sm-start-hole', '1');
        b.run(`saveSideMatch();`);
        assert.equal(b.wrote(), false, 'A wager labelled as one foursome\'s must actually be that foursome\'s.');
    });
});
