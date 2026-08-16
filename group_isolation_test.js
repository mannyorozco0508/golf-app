const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PAGE = ['action-model.js', 'money-engine.js', 'settlement-engine.js', 'bet-strip.js', 'hole-events.js'];

// Eight golfers, two groups of four. Manny/Jose lead Group 1; Marty/John Group 2.
function twoGroups() {
    const cd = makeCourseData(18);
    const names = ['Manny', 'Jose', 'Ann', 'Bob', 'Marty', 'John', 'Cal', 'Dee'];
    const p = makePlayers(names, names.map(() => 0));
    return { cd, p, g1: p.slice(0, 4), g2: p.slice(4, 8) };
}

// Boots the page with a given ?group= context and a stubbed Firebase, capturing
// every write that actually reaches the database.
function boot(groupParam, meParam) {
    const sb = loadHtmlInlineScript('index.html', PAGE);
    const { cd, p } = twoGroups();
    const scores = {};
    cd.slice(0, 3).forEach(h => p.forEach(pl => { scores[`p${pl.id}_h${h.hole}`] = h.par; }));

    const groupMap = {};
    p.forEach((pl, i) => { groupMap[pl.id] = i < 4 ? 1 : 2; });

    const data = { gameFormat: 'stroke', players: p, courseData: cd, scores };

    // `db` is a const binding to the loader's stub object, so it cannot be
    // reassigned - but the object itself is mutable, so ref() can be replaced to
    // capture every write that would actually reach Firebase.
    vm.runInContext(`
        window.__writes = [];
        db.ref = function (p) { return {
            set: function (v) { window.__writes.push({ path: p, op: 'set', value: v }); return Promise.resolve(); },
            remove: function () { window.__writes.push({ path: p, op: 'remove' }); return Promise.resolve(); },
            update: function (v) { window.__writes.push({ path: p, op: 'update', value: v }); return Promise.resolve(); },
            push: function () { return { key: 'k1', set: function (v) { window.__writes.push({ path: p + '/k1', op: 'set', value: v }); return Promise.resolve(); } }; },
            on: function () {}, once: function () { return Promise.resolve({ val: function () { return null; } }); }
        }; };
        currentMode = 'ABCD';
        currentData = ${JSON.stringify(data)};
        window.__scPlayerGroupMap = ${JSON.stringify(groupMap)};
        window.__scFilteredPlayers = currentData.players;
        hasGroupLock = ${groupParam !== null};
        lockedGroup = ${groupParam === null ? 'null' : groupParam};
        selectedGroup = ${groupParam === null ? "'all'" : groupParam};
        ${meParam ? `meId = '${meParam}';` : ''}
    `, sb);
    return { sb, p, cd, writes: () => sb.window.__writes };
}

// ---------------------------------------------------------------------------
describe('CURRENT MODEL — what was actually enforcing isolation', () => {
    const idx = read('index.html');

    test('REGRESSION: the write path itself now checks the group', () => {
        // Before this fix the only protection was a disabled input - a UI state, not a
        // rule. saveScore() wrote whatever player id it was handed.
        const fn = idx.slice(idx.indexOf('function saveScore'), idx.indexOf('function logAuditEntry'));
        assert.ok(/canWritePlayer\(playerId\)/.test(fn), 'the write path is still unguarded');
        const guardAt = fn.indexOf('canWritePlayer');
        const writeAt = fn.indexOf('db.ref');
        assert.ok(guardAt < writeAt, 'the guard must run before the write');
    });

    test('the guard is independent of personal identity', () => {
        const fn = idx.slice(idx.indexOf('function canWritePlayer'), idx.indexOf('function rejectCrossGroupWrite'));
        assert.ok(!/meId|resolvedMeId/.test(fn), 'scoring scope must come from ?group only');
    });

    test('the disabled-input rendering is still there as the first line of defence', () => {
        assert.ok(idx.includes('const isLocked = isMultiGroupRound && (!hasGroupLock || playerGroupMap[p.id] !== lockedGroup);'));
    });
});

describe('GROUP 1 SCOREKEEPER', () => {
    test('can score its own players', () => {
        const { sb, p, writes } = boot(1);
        vm.runInContext(`saveScore('${p[0].id}', 5, 4);`, sb);
        const scoreWrites = writes().filter(w => /\/scores\//.test(w.path));
        assert.equal(scoreWrites.length, 1);
        assert.match(scoreWrites[0].path, new RegExp(`p${p[0].id}_h5`));
    });

    test('REGRESSION: cannot score a Group 2 player, even called directly', () => {
        // This is the devtools case: the input is not on screen, so the only thing
        // that can stop this is the guard.
        const { sb, p, writes } = boot(1);
        vm.runInContext(`saveScore('${p[4].id}', 5, 4);`, sb);
        assert.equal(writes().length, 0, 'a cross-group write reached Firebase');
    });

    test('cannot undo a Group 2 player\'s score', () => {
        const { sb, p, writes } = boot(1);
        vm.runInContext(`
            currentData.auditLog = { L1: { playerId: '${p[4].id}', hole: 5, oldValue: 4, newValue: 5, ts: 1 } };
            undoAuditEntry('L1');
        `, sb);
        assert.equal(writes().length, 0, 'undo is a write path too');
    });

    test('cannot record dots for a Group 2 player', () => {
        const { sb, p, writes } = boot(1);
        vm.runInContext(`
            currentDotHole = 5;
            tempDots = { 'p${p[0].id}': ['birdie'], 'p${p[4].id}': ['greenie'] };
            saveDots();
        `, sb);
        const w = writes().find(x => /dots/.test(x.path));
        assert.ok(w, 'the legitimate half of the write should still go through');
        assert.ok(Object.keys(w.value).includes(`p${p[0].id}`));
        assert.ok(!Object.keys(w.value).includes(`p${p[4].id}`), 'a Group 2 dot slipped through');
    });

    test('is shown no group switcher at all', () => {
        const { sb } = boot(1);
        vm.runInContext(`renderGroupFilters(8);`, sb);
        const html = sb.document.getElementById('group-filter-container').innerHTML;
        assert.equal(html, '', 'a locked scorekeeper needs no All Players or other group tabs');
    });

    test('REGRESSION: cannot switch groups even by calling filterGroup directly', () => {
        const { sb } = boot(1);
        vm.runInContext(`filterGroup(2);`, sb);
        assert.equal(String(vm.runInContext('selectedGroup', sb)), '1', 'the view moved to another group');
    });

    test('does not receive the Group Links control', () => {
        const { sb } = boot(1);
        vm.runInContext(`renderGroupFilters(8); renderGroupLinksPanel();`, sb);
        const filters = sb.document.getElementById('group-filter-container').innerHTML;
        const panel = sb.document.getElementById('group-links-panel').innerHTML;
        assert.ok(!/Group Links/.test(filters));
        assert.equal(panel, '');
    });

    test('REGRESSION: no other group\'s scorekeeper URL exists anywhere in the DOM', () => {
        // Not hidden - absent. A hidden node would still be harvestable.
        const { sb } = boot(1);
        vm.runInContext(`
            renderGroupFilters(8);
            groupLinksPanelOpen = true;
            toggleGroupLinksPanel();
            renderGroupLinksPanel();
        `, sb);
        const dom = sb.document.body ? sb.document.body.innerHTML || '' : '';
        const mounts = ['group-filter-container', 'group-links-panel']
            .map(id => (sb.document.getElementById(id) || {}).innerHTML || '').join('');
        assert.ok(!/group=2/.test(mounts + dom), 'a Group 2 URL is present in the rendered DOM');
    });

    test('cannot open the group links panel by calling the toggle', () => {
        const { sb } = boot(1);
        vm.runInContext(`toggleGroupLinksPanel();`, sb);
        assert.equal(vm.runInContext('groupLinksPanelOpen', sb), false);
    });

    test('gets no organizer Add Action control', () => {
        const { sb } = boot(1);
        assert.equal(vm.runInContext(`isOrganizerView()`, sb), false);
        assert.equal(vm.runInContext(`canAddAction()`, sb), false);
    });
});

describe('GROUP 2 SCOREKEEPER — the same isolation in reverse', () => {
    test('can score its own players', () => {
        const { sb, p, writes } = boot(2);
        vm.runInContext(`saveScore('${p[4].id}', 5, 4);`, sb);
        assert.equal(writes().filter(w => /\/scores\//.test(w.path)).length, 1);
    });

    test('cannot score a Group 1 player', () => {
        const { sb, p, writes } = boot(2);
        vm.runInContext(`saveScore('${p[0].id}', 5, 4);`, sb);
        assert.equal(writes().length, 0);
    });

    test('sees no switcher and no Group 1 URL', () => {
        const { sb } = boot(2);
        vm.runInContext(`renderGroupFilters(8); renderGroupLinksPanel();`, sb);
        const mounts = ['group-filter-container', 'group-links-panel']
            .map(id => (sb.document.getElementById(id) || {}).innerHTML || '').join('');
        assert.equal(mounts, '');
    });
});

describe('ORGANIZER — nothing was taken away', () => {
    test('PRODUCT FACT: on a multi-group round the bare link is READ-ONLY', () => {
        // The organizer and a spectator are indistinguishable here - neither has a
        // ?group= parameter, and without accounts there is nothing else to tell them
        // apart. Batch 1 resolved this by making the bare link read-only once a round
        // has more than one group, which is why the scorecard renders every input
        // disabled in that state. Granting writes here would hand the same access to
        // every spectator holding the share link.
        //
        // The organizer scores by opening a group link like anyone else.
        const { sb, p, writes } = boot(null);
        vm.runInContext(`saveScore('${p[0].id}', 5, 4);`, sb);
        assert.equal(writes().filter(w => /\/scores\//.test(w.path)).length, 0);
    });

    test('the organizer CAN score every player on a single-group round', () => {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const cd = makeCourseData(18);
        const p = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        vm.runInContext(`
            window.__writes = [];
            db.ref = function (path) { return {
                set: function (v) { window.__writes.push({ path: path, value: v }); return Promise.resolve(); },
                remove: function () { return Promise.resolve(); },
                update: function () { return Promise.resolve(); },
                push: function () { return { key: 'k', set: function () { return Promise.resolve(); } }; },
                on: function () {}, once: function () { return Promise.resolve({ val: function () { return null; } }); }
            }; };
            currentMode = 'ABCD';
            currentData = ${JSON.stringify({ gameFormat: 'stroke', players: p, courseData: cd, scores: {} })};
            window.__scPlayerGroupMap = {};
            hasGroupLock = false; lockedGroup = null;
            saveScore('${p[0].id}', 5, 4); saveScore('${p[3].id}', 5, 5);
        `, sb);
        assert.equal(sb.window.__writes.filter(w => /\/scores\//.test(w.path)).length, 2);
    });

    test('keeps the full selector including All Players and every group', () => {
        const { sb } = boot(null);
        vm.runInContext(`renderGroupFilters(8);`, sb);
        const html = sb.document.getElementById('group-filter-container').innerHTML;
        assert.match(html, /All Players/);
        assert.match(html, /Group 1/);
        assert.match(html, /Group 2/);
    });

    test('can still switch groups', () => {
        const { sb } = boot(null);
        try { vm.runInContext(`filterGroup(2);`, sb); } catch (e) { /* render needs more DOM than the stub has */ }
        assert.equal(String(vm.runInContext('selectedGroup', sb)), '2');
    });

    test('keeps the Group Links control and both links', () => {
        const { sb } = boot(null);
        vm.runInContext(`renderGroupFilters(8); groupLinksPanelOpen = true; renderGroupLinksPanel();`, sb);
        assert.match(sb.document.getElementById('group-filter-container').innerHTML, /Group Links/);
        const panel = sb.document.getElementById('group-links-panel').innerHTML;
        assert.match(panel, /group=1/);
        assert.match(panel, /group=2/);
    });

    test('is recognised as the organizer', () => {
        const { sb } = boot(null);
        assert.equal(vm.runInContext(`isOrganizerView()`, sb), true);
    });
});

describe('SPECTATOR — read-only on a multi-group round', () => {
    test('REGRESSION: a spectator link cannot write any score', () => {
        const { sb, p } = boot(null);
        assert.equal(vm.runInContext(`canWritePlayer('${p[0].id}')`, sb), false,
            'a multi-group round with no ?group= is a spectator view');
    });

    test('a single-group round is fully writable without a group param', () => {
        const sb = loadHtmlInlineScript('index.html', PAGE);
        const cd = makeCourseData(18);
        const p = makePlayers(['A', 'B', 'C', 'D'], [0, 0, 0, 0]);
        vm.runInContext(`
            currentData = ${JSON.stringify({ gameFormat: 'stroke', players: p, courseData: cd, scores: {} })};
            window.__scPlayerGroupMap = {};
            hasGroupLock = false; lockedGroup = null;
        `, sb);
        assert.equal(vm.runInContext(`canWritePlayer('${p[0].id}')`, sb), true);
    });
});

describe('IDENTITY IS NOT AUTHORIZATION', () => {
    test('REGRESSION: setting meId to a Group 2 player grants no Group 2 writes', () => {
        const { sb, p, writes } = boot(1, null);
        vm.runInContext(`meId = '${p[4].id}'; saveScore('${p[4].id}', 5, 4);`, sb);
        assert.equal(writes().length, 0, 'personal identity changed the writable group');
    });

    test('meId does not create organizer access', () => {
        const { sb, p } = boot(1);
        vm.runInContext(`meId = '${p[0].id}';`, sb);
        assert.equal(vm.runInContext(`isOrganizerView()`, sb), false);
        assert.equal(vm.runInContext(`canAddAction()`, sb), false);
    });

    test('meId does not unlock the group switcher', () => {
        const { sb, p } = boot(1);
        vm.runInContext(`meId = '${p[0].id}'; filterGroup(2);`, sb);
        assert.equal(String(vm.runInContext('selectedGroup', sb)), '1');
    });
});

describe('GENERATED LINKS', () => {
    test('each group link carries only its own group number', () => {
        const { sb } = boot(null);
        vm.runInContext(`groupLinksPanelOpen = true; renderGroupLinksPanel();`, sb);
        const panel = sb.document.getElementById('group-links-panel').innerHTML;
        const groups = (panel.match(/group=(\d+)/g) || []).map(m => m.split('=')[1]);
        assert.deepEqual(groups.sort().join(','), '1,2');
    });

    test('the links use the round\'s own game code', () => {
        const { sb } = boot(null);
        vm.runInContext(`groupLinksPanelOpen = true; renderGroupLinksPanel();`, sb);
        assert.match(sb.document.getElementById('group-links-panel').innerHTML, /game=ABCD/);
    });
});

describe('FIREBASE RULES — what the server can and cannot enforce', () => {
    const rules = JSON.parse(read('database.rules.json')).rules;

    test('score writes are validated for SHAPE, not for WHO', () => {
        // This is the honest limit of the current anonymous-link architecture, pinned
        // here so nobody later mistakes UI isolation for server-side authorization.
        const v = rules.events.$eventCode.scores.$scoreKey['.validate'];
        assert.ok(/isNumber/.test(v), 'shape is validated');
        assert.ok(!/auth/.test(v), 'there is no identity to check against');
        assert.equal(rules.events.$eventCode['.write'], true,
            'writes are open by design - scoring is deliberately account-free');
    });

    test('the shared course library is still protected', () => {
        assert.equal(rules.global_courses['.write'], undefined);
        assert.equal(rules.global_courses.$courseId['.write'], 'newData.exists()');
    });
});
