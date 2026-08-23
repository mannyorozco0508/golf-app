// ============================================================================
// GROUP ACTION — THE SCORECARD COCKPIT
//
// The scorecard is where a golfer actually stands. Group Action is only real if
// it shows up there: this foursome's wagers, the cross-group ones they have a
// stake in, and nothing belonging to strangers two groups ahead.
//
// Three things are proven here.
//
//   STORAGE      Add Action used to write additionalGames/{format}, which holds
//                ONE game per format. Group 2 starting dots would have silently
//                overwritten Group 1's, taking real money with it. New wagers
//                are written as instances instead. Legacy slots still read.
//
//   VISIBILITY   Side matches were already scoped. Round-level games were not,
//                because until now every one of them involved the whole field.
//                A group-owned dots game must not appear on another group's card.
//
//   ROUTING      "+ ADD GROUP ACTION" is a LINK to the Action page, not a second
//                copy of the wager form. One implementation of the money
//                decisions, or the two drift apart.
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
const NAMES = ['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James',
               'Ryan', 'Dalen', 'Nick', 'Paul'];

function boot(count, groupParam, extra) {
    const sb = loadHtmlInlineScript('index.html', PAGE);
    const cd = makeCourseData(18);
    const names = NAMES.slice(0, count);
    const p = makePlayers(names, names.map(() => 0));
    const scores = {};
    cd.slice(0, 6).forEach(h => p.forEach(pl => { scores[`p${pl.id}_h${h.hole}`] = h.par; }));

    const groupMap = {};
    p.forEach((pl, i) => { groupMap[pl.id] = Math.floor(i / 4) + 1; });

    const data = Object.assign({ gameFormat: 'stroke', players: p, courseData: cd, scores }, extra || {});

    vm.runInContext(`
        window.__writes = [];
        db.ref = function (pth) { return {
            set: function (v) { window.__writes.push({ path: pth, op: 'set', value: v }); return Promise.resolve(); },
            remove: function () { window.__writes.push({ path: pth, op: 'remove' }); return Promise.resolve(); },
            update: function (v) { window.__writes.push({ path: pth, op: 'update', value: v }); return Promise.resolve(); },
            push: function () { return { key: 'newkey' }; },
            on: function () {}, once: function () { return Promise.resolve({ val: function () { return null; } }); }
        }; };
        currentMode = 'ABCD';
        currentData = ${JSON.stringify(data)};
        window.__scPlayerGroupMap = ${JSON.stringify(groupMap)};
        window.__scFilteredPlayers = currentData.players;
        hasGroupLock = ${groupParam !== null};
        lockedGroup = ${groupParam === null ? 'null' : groupParam};
        selectedGroup = ${groupParam === null ? "'all'" : groupParam};
    `, sb);

    const groups = {};
    p.forEach((pl, i) => { const g = Math.floor(i / 4) + 1; (groups[g] = groups[g] || []).push(pl); });

    return {
        sb, p, groups,
        run: c => vm.runInContext(c, sb),
        writes: () => sb.window.__writes,
        last: () => sb.window.__writes[sb.window.__writes.length - 1],
        ids: g => groups[g].map(pl => String(pl.id))
    };
}
const ORGANIZER = null;
const idsOf = (arr, from, to) => arr.slice(from, to).map(p => String(p.id));

// ---------------------------------------------------------------------------
describe('ADD ACTION STORAGE — instances, not the single-slot map', () => {
    test('REGRESSION: a new wager is written to additionalGameInstances', () => {
        // additionalGames/{format} holds one game per format. Two groups each
        // wanting dots would have collided there, and the second write would have
        // destroyed the first group's money with no warning.
        const b = boot(4, ORGANIZER);
        b.run(`addActionGame = 'dots'; addActionOpen = true; confirmAddAction(5);`);
        const w = b.last();
        assert.match(w.path, /additionalGameInstances\//);
        assert.ok(!/additionalGames\//.test(w.path), 'the legacy slot must not be written');
    });

    test('the instance carries its format, so getRoundGames can normalize it', () => {
        const b = boot(4, ORGANIZER);
        b.run(`addActionGame = 'skins'; addActionOpen = true; confirmAddAction(10);`);
        const v = b.last().value;
        assert.equal(v.format, 'skins');
        assert.equal(v.skinsBuyIn, 10);
        assert.equal(v.enabled, true);
        assert.ok(v.startHole >= 1);
        assert.ok(v.createdAt > 0, 'instances need a stable creation order');
    });

    test('two dots games can now coexist instead of overwriting each other', () => {
        const b = boot(4, ORGANIZER);
        b.run(`addActionGame = 'dots'; addActionOpen = true; confirmAddAction(2);`);
        const first = b.last().path;
        b.run(`addActionGame = 'dots'; addActionOpen = true; confirmAddAction(5);`);
        const second = b.last().path;
        assert.equal(b.writes().length, 2);
        assert.match(first, /additionalGameInstances\//);
        assert.match(second, /additionalGameInstances\//);
    });

    test('a legacy additionalGames round still renders — nothing is migrated', () => {
        const b = boot(4, ORGANIZER, { additionalGames: { dots: { enabled: true, dotPointVal: 5 } } });
        const keys = b.run(`getRoundGames(currentData).map(function (g) { return g.key; }).join(',')`);
        assert.match(String(keys), /dots/, 'the legacy slot must still be read');
    });
});

// ---------------------------------------------------------------------------
describe('INLINE QUICK PANEL — one group only', () => {
    test('a single foursome keeps the fast inline panel', () => {
        // Marty Monday must not get slower. One group IS the field, so a wager with
        // no participants named is exactly right.
        const b = boot(4, ORGANIZER);
        assert.equal(b.sb.canAddAction(), true);
        assert.equal(b.sb.canAddGroupAction(), false, 'no scope question to ask');
    });

    test('a multi-group round does NOT use the inline panel', () => {
        // It writes no participantIds, so on a multi-group round it would create a
        // field-wide wager nobody chose.
        const b = boot(8, ORGANIZER);
        assert.equal(b.sb.canAddAction(), false);
        assert.equal(b.sb.canAddGroupAction(), true);
    });

    test('a group scorekeeper never gets the inline panel', () => {
        const b = boot(8, 1);
        assert.equal(b.sb.canAddAction(), false);
        assert.equal(b.sb.canAddGroupAction(), true);
    });
});

// ---------------------------------------------------------------------------
describe('+ ADD GROUP ACTION — a link, not a second form', () => {
    test('it points at the Action page carrying the group', () => {
        const b = boot(8, 2);
        const href = b.sb.addGroupActionHref();
        assert.match(href, /sidematches\.html/);
        assert.match(href, /game=ABCD/);
        assert.match(href, /group=2/, 'the scorekeeper must land already scoped');
        assert.match(href, /add=1/, 'and with the wager form already open');
    });

    test('the organizer link carries no group', () => {
        const b = boot(8, ORGANIZER);
        const href = b.sb.addGroupActionHref();
        assert.ok(!/group=/.test(href), 'the organizer chooses the group in the flow');
    });

    test('the button names the group so it is obvious whose action it starts', () => {
        assert.equal(boot(8, 1).sb.addGroupActionLabel(), '+ ADD GROUP 1 ACTION');
        assert.equal(boot(8, 3).sb.addGroupActionLabel(), '+ ADD GROUP 3 ACTION');
        assert.equal(boot(8, ORGANIZER).sb.addGroupActionLabel(), '+ ADD ACTION');
    });

    test('index.html contains no copy of the wager form', () => {
        // The whole point of linking out. If these ever appear here, there are two
        // implementations of the same money decisions.
        const idx = read('index.html');
        ['pickActionScope', 'renderSideMatchPicker', 'saveFieldAction', 'saveSideMatch']
            .forEach(fn => assert.ok(!new RegExp('function ' + fn).test(idx),
                `${fn} belongs to the Action page, not the scorecard`));
    });

    test('the Action page honours add=1 by opening the flow', () => {
        const sm = read('sidematches.html');
        assert.ok(/urlParams\.get\('add'\) === '1'/.test(sm));
        assert.ok(/__smAutoOpened/.test(sm), 'and opens it only once');
    });
});

// ---------------------------------------------------------------------------
describe('VISIBILITY — a group sees its own action and nobody else\'s', () => {
    function withGames(count, groupParam, instances, dots) {
        return boot(count, groupParam, { additionalGameInstances: instances, dots: dots || {} });
    }

    test('Group 1 sees its own dots game', () => {
        const b = withGames(8, 1, { d1: { format: 'dots', dotPointVal: 5, scope: 'group', ownerGroup: 1,
            participantIds: idsOf(NAMES.map((n, i) => ({ id: 101 + i })), 0, 4) } });
        assert.equal(b.sb.canSeeRoundGame('d1'), true);
    });

    test('REGRESSION: Group 1 does NOT see Group 2\'s dots game', () => {
        const b = withGames(8, 1, { d2: { format: 'dots', dotPointVal: 10, scope: 'group', ownerGroup: 2,
            participantIds: idsOf(NAMES.map((n, i) => ({ id: 101 + i })), 4, 8) } });
        assert.equal(b.sb.canSeeRoundGame('d2'), false,
            'another foursome\'s wager only clutters this cockpit');
    });

    test('Group 2 does not see Group 1\'s dots game either — symmetric', () => {
        const b = withGames(8, 2, { d1: { format: 'dots', dotPointVal: 5, scope: 'group', ownerGroup: 1,
            participantIds: idsOf(NAMES.map((n, i) => ({ id: 101 + i })), 0, 4) } });
        assert.equal(b.sb.canSeeRoundGame('d1'), false);
    });

    test('Group 3 sees neither of the other groups\' games', () => {
        const all = NAMES.map((n, i) => ({ id: 101 + i }));
        const b = withGames(12, 3, {
            d1: { format: 'dots', dotPointVal: 5, participantIds: idsOf(all, 0, 4) },
            d2: { format: 'dots', dotPointVal: 10, participantIds: idsOf(all, 4, 8) }
        });
        assert.equal(b.sb.canSeeRoundGame('d1'), false);
        assert.equal(b.sb.canSeeRoundGame('d2'), false);
    });

    test('a cross-group skins game IS visible to every group in it', () => {
        const all = NAMES.map((n, i) => ({ id: 101 + i }));
        const cross = { x1: { format: 'skins', skinsBuyIn: 10, scope: 'cross',
            participantIds: [String(all[0].id), String(all[4].id)] } };   // Marty + Stan
        assert.equal(withGames(12, 1, cross).sb.canSeeRoundGame('x1'), true);
        assert.equal(withGames(12, 2, cross).sb.canSeeRoundGame('x1'), true);
        assert.equal(withGames(12, 3, cross).sb.canSeeRoundGame('x1'), false,
            'a group with no stake has no business seeing it');
    });

    test('a FIELD-WIDE game stays visible to everyone', () => {
        const b = withGames(8, 1, { s1: { format: 'skins', skinsBuyIn: 10 } });
        assert.equal(b.sb.canSeeRoundGame('s1'), true, 'no participantIds means everybody');
    });

    test('the ORGANIZER sees every game', () => {
        const all = NAMES.map((n, i) => ({ id: 101 + i }));
        const b = withGames(12, ORGANIZER, {
            d1: { format: 'dots', dotPointVal: 5, participantIds: idsOf(all, 0, 4) },
            d2: { format: 'dots', dotPointVal: 10, participantIds: idsOf(all, 4, 8) }
        });
        assert.equal(b.sb.canSeeRoundGame('d1'), true);
        assert.equal(b.sb.canSeeRoundGame('d2'), true);
    });

    test('the main game is always visible', () => {
        const b = withGames(8, 1, {});
        assert.equal(b.sb.canSeeRoundGame('main'), true);
    });

    test('a ONE-GROUP round hides nothing', () => {
        const b = withGames(4, 1, { d1: { format: 'dots', dotPointVal: 5 } });
        assert.equal(b.sb.canSeeRoundGame('d1'), true);
    });

    test('an unknown key does not blank the cockpit', () => {
        // Defensive: a row whose game vanished mid-render must not be treated as
        // forbidden, or the panel would silently lose content.
        const b = withGames(8, 1, {});
        assert.equal(b.sb.canSeeRoundGame('nope'), true);
    });
});

// ---------------------------------------------------------------------------
describe('NO-BET GROUP — a clean scorecard', () => {
    test('a group with no action of its own sees no group-games section', () => {
        const all = NAMES.map((n, i) => ({ id: 101 + i }));
        const b = boot(12, 3, { additionalGameInstances: {
            d1: { format: 'dots', dotPointVal: 5, participantIds: idsOf(all, 0, 4) },
            d2: { format: 'dots', dotPointVal: 10, participantIds: idsOf(all, 4, 8) }
        } });
        const visible = b.run(`getRoundGames(currentData)
            .filter(function (g) { return g.role !== 'main' && canSeeRoundGame(g.key); }).length`);
        assert.equal(visible, 0, 'no empty boxes, no fake $0 rows');
    });
});

// ---------------------------------------------------------------------------
describe('THE COCKPIT NAMES THE GROUP', () => {
    test('a group link\'s section is labelled with its group number', () => {
        const idx = read('index.html');
        assert.ok(/Group ' \+ lockedGroup \+ ' Action'/.test(idx),
            '"Group Games" is ambiguous once a round has several groups');
    });

    test('the organizer and one-group rounds keep the original wording', () => {
        const idx = read('index.html');
        assert.ok(/Group Games'/.test(idx));
    });
});

// ---------------------------------------------------------------------------
describe('PROTECTED MATH — untouched by the cockpit work', () => {
    test('no golf formula moved', () => {
        const me = read('money-engine.js');
        assert.ok(/dotVal \* \(n \* units - totalUnits\)/.test(me));
        assert.ok(/dollarPerPoint \* \(n \* myPts - sumPts\)/.test(me));
    });

    test('visibility is filtered at the consumer, never inside bet-strip', () => {
        // bet-strip builds rows for every consumer; who may SEE a row is a property
        // of the link being held, not of the wager.
        const bs = read('bet-strip.js');
        assert.ok(!/canSeeRoundGame|lockedGroup|hasGroupLock/.test(bs),
            'bet-strip must stay ignorant of who is looking');
    });

    test('settlement still scopes through fieldParticipants', () => {
        assert.ok(/fieldParticipants\(cfg\)/.test(read('settlement-engine.js')));
    });
});
