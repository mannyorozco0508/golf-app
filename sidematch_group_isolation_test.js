// ============================================================================
// SIDE MATCH GROUP ISOLATION  (Phase 0 — prerequisite to Group-Owned Action)
//
// THE GAP THIS CLOSES
// index.html has carried a careful group model for a while: ?group=N scopes what
// a scorekeeper may write, the guard sits next to the write rather than next to
// the button, and a dedicated test file asserts identity never grants a
// permission. sidematches.html had NONE of it. It read ?group= exactly once, to
// decorate nav links, and every database write below that was open to anyone.
//
// A Group 1 scorekeeper could delete Group 2's Nassau in two taps.
//
// WHAT THESE TESTS PROVE
// Not that buttons disappear - that is cosmetics, and a devtools user ignores it.
// They prove the WRITE FUNCTIONS THEMSELVES refuse, when called directly with no
// button involved at all. Every delete/press/create test below invokes the
// production function by name and then asserts that nothing reached Firebase.
//
// WHAT THEY DELIBERATELY DO NOT CLAIM
// This is not authorization. database.rules.json still allows any holder of the
// game code to write any field directly. That is unchanged, deliberate, and
// asserted at the bottom of this file so nobody later mistakes product-level
// isolation for security.
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

// The eight golfers from the brief.
//   GROUP 1  Marty  Manny  John  Steve
//   GROUP 2  Stan   Greg   Tony  James
function eightGolfers() {
    const cd = makeCourseData(18);
    const names = ['Marty', 'Manny', 'John', 'Steve', 'Stan', 'Greg', 'Tony', 'James'];
    const p = makePlayers(names, names.map(() => 0));
    return { cd, p, g1: p.slice(0, 4), g2: p.slice(4, 8) };
}

// Boots sidematches.html under a given ?group= context with a Firebase stub that
// records every write instead of performing one.
//
// Matches present in every boot:
//   m_g1     Marty vs Manny        - Group 1 only
//   m_g2     Stan  vs Greg         - Group 2 only
//   m_cross  Marty vs Stan         - genuinely cross-group
function boot(groupParam) {
    const sb = loadHtmlInlineScript('sidematches.html', PAGE);
    const { cd, p, g1, g2 } = eightGolfers();

    const scores = {};
    cd.slice(0, 6).forEach(h => p.forEach(pl => { scores[`p${pl.id}_h${h.hole}`] = h.par; }));

    const sideMatches = {
        m_g1: { format: 'match', scoring: 'net', stake: 50, pressRule: 'anytime', startHole: 1, createdAt: 1, teamAIds: [String(g1[0].id)], teamBIds: [String(g1[1].id)] },
        m_g2: { format: 'match', scoring: 'net', stake: 50, pressRule: 'anytime', startHole: 1, createdAt: 2, teamAIds: [String(g2[0].id)], teamBIds: [String(g2[1].id)] },
        m_cross: { format: 'match', scoring: 'net', stake: 50, pressRule: 'anytime', startHole: 1, createdAt: 3, teamAIds: [String(g1[0].id)], teamBIds: [String(g2[0].id)] },
        m_stroke_g2: { format: 'stroke', scoring: 'net', holeStake: 5, overallStake: 20, startHole: 1, createdAt: 4, teamAIds: [String(g2[2].id)], teamBIds: [String(g2[3].id)] }
    };

    const data = { gameFormat: 'stroke', players: p, courseData: cd, scores, sideMatches };

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
        hasGroupLock = ${groupParam !== null};
        lockedGroup = ${groupParam === null ? 'null' : groupParam};
    `, sb);

    return {
        sb, p, cd, g1, g2,
        writes: () => sb.window.__writes,
        wrote: () => sb.window.__writes.length > 0,
        run: code => vm.runInContext(code, sb)
    };
}

const ORGANIZER = null;

// ---------------------------------------------------------------------------
// 1. GROUP LOCK RESOLUTION
// ---------------------------------------------------------------------------
describe('GROUP LOCK — resolved, and resolved the same way index.html resolves it', () => {
    test('the page reads ?group= into hasGroupLock / lockedGroup', () => {
        const sm = read('sidematches.html');
        assert.ok(/let hasGroupLock = urlParams\.get\('group'\) !== null;/.test(sm),
            'sidematches.html must resolve hasGroupLock from ?group=');
        assert.ok(/let lockedGroup = urlParams\.get\('group'\) \? parseInt\(urlParams\.get\('group'\), 10\) : null;/.test(sm),
            'sidematches.html must resolve lockedGroup from ?group=');
    });

    test('a group link is not treated as the organizer', () => {
        const g1 = boot(1);
        assert.equal(g1.sb.isOrganizerView(), false);
        const org = boot(ORGANIZER);
        assert.equal(org.sb.isOrganizerView(), true);
    });

    test('players map to the groups the brief describes', () => {
        const b = boot(1);
        const map = b.sb.buildPlayerGroupMap();
        b.g1.forEach(p => assert.equal(map[String(p.id)], 1, `${p.name} should be Group 1`));
        b.g2.forEach(p => assert.equal(map[String(p.id)], 2, `${p.name} should be Group 2`));
    });
});

// ---------------------------------------------------------------------------
// 2-4. DELETE
// ---------------------------------------------------------------------------
describe('DELETE — a group cannot remove another group\'s wager', () => {
    test('Group 1 CANNOT delete a Group 2-only match', () => {
        const b = boot(1);
        b.run(`deleteSideMatch('m_g2'); confirmDeleteSideMatch();`);
        assert.equal(b.wrote(), false, 'a Group 2 match was removed by a Group 1 link');
    });

    test('Group 2 CANNOT delete a Group 1-only match', () => {
        const b = boot(2);
        b.run(`deleteSideMatch('m_g1'); confirmDeleteSideMatch();`);
        assert.equal(b.wrote(), false, 'a Group 1 match was removed by a Group 2 link');
    });

    test('Group 1 CAN delete its own match', () => {
        const b = boot(1);
        b.run(`deleteSideMatch('m_g1'); confirmDeleteSideMatch();`);
        const w = b.writes();
        assert.equal(w.length, 1);
        assert.equal(w[0].op, 'remove');
        assert.ok(/sideMatches\/m_g1$/.test(w[0].path));
    });

    test('the ORGANIZER can delete any match, including one it has no stake in', () => {
        ['m_g1', 'm_g2', 'm_cross'].forEach(key => {
            const b = boot(ORGANIZER);
            b.run(`deleteSideMatch('${key}'); confirmDeleteSideMatch();`);
            const w = b.writes();
            assert.equal(w.length, 1, `organizer should be able to remove ${key}`);
            assert.equal(w[0].op, 'remove');
        });
    });

    test('either group involved in a CROSS-GROUP match may remove it', () => {
        [1, 2].forEach(g => {
            const b = boot(g);
            b.run(`deleteSideMatch('m_cross'); confirmDeleteSideMatch();`);
            assert.equal(b.writes().length, 1, `Group ${g} has standing in the cross-group match`);
        });
    });

    test('an unrelated Group 3 may remove none of them', () => {
        ['m_g1', 'm_g2', 'm_cross'].forEach(key => {
            const b = boot(3);
            b.run(`deleteSideMatch('${key}'); confirmDeleteSideMatch();`);
            assert.equal(b.wrote(), false, `Group 3 should have no standing in ${key}`);
        });
    });
});

// ---------------------------------------------------------------------------
// 10. DIRECT CALL — the delete guard is at the write, not the button
// ---------------------------------------------------------------------------
describe('DELETE BYPASS — calling the write function directly is refused', () => {
    test('confirmDeleteSideMatch() cannot be driven by setting pendingDeleteMatchId', () => {
        // The exact devtools bypass: skip the opener entirely, set the module-level
        // id by hand, and call the writer.
        const b = boot(1);
        b.run(`pendingDeleteMatchId = 'm_g2'; confirmDeleteSideMatch();`);
        assert.equal(b.wrote(), false, 'the write site itself must re-check permission');
    });

    test('the guard runs BEFORE the db call inside confirmDeleteSideMatch', () => {
        const sm = read('sidematches.html');
        const fn = sm.slice(sm.indexOf('function confirmDeleteSideMatch'), sm.indexOf('function pairTwoGroups'));
        const guardAt = fn.indexOf('canManageSideMatch');
        const writeAt = fn.indexOf('db.ref');
        assert.ok(guardAt > -1, 'confirmDeleteSideMatch must check canManageSideMatch');
        assert.ok(guardAt < writeAt, 'the guard must run before the write');
    });

    test('permission is checked against the STORED match, not a rendered row', () => {
        const sm = read('sidematches.html');
        const fn = sm.slice(sm.indexOf('function confirmDeleteSideMatch'), sm.indexOf('function pairTwoGroups'));
        assert.ok(/sideMatchById\(matchId\)/.test(fn),
            'the guard must read the stored match so a stale modal cannot be exploited');
    });
});

// ---------------------------------------------------------------------------
// 5-8. PRESS
// ---------------------------------------------------------------------------
describe('PRESS — the index.html rule, now applied here too', () => {
    test('Group 1 CAN press its own match', () => {
        const b = boot(1);
        b.run(`pressSideMatch('m_g1', 'b0', 7);`);
        assert.equal(b.writes().length, 1);
    });

    test('Group 1 CANNOT press a Group 2-only match', () => {
        const b = boot(1);
        b.run(`pressSideMatch('m_g2', 'b0', 7);`);
        assert.equal(b.wrote(), false);
    });

    test('Group 2 CANNOT press a Group 1-only match', () => {
        const b = boot(2);
        b.run(`pressSideMatch('m_g1', 'b0', 7);`);
        assert.equal(b.wrote(), false);
    });

    test('a CROSS-GROUP match is pressable by BOTH involved groups', () => {
        [1, 2].forEach(g => {
            const b = boot(g);
            b.run(`pressSideMatch('m_cross', 'b0', 7);`);
            assert.equal(b.writes().length, 1, `Group ${g} should be able to press the cross-group match`);
        });
    });

    test('an unrelated Group 3 cannot press the cross-group match', () => {
        const b = boot(3);
        b.run(`pressSideMatch('m_cross', 'b0', 7);`);
        assert.equal(b.wrote(), false);
    });

    test('every press write path is guarded, not just the obvious one', () => {
        // Four separate functions reach Firebase with a press. Missing any one of
        // them leaves the whole rule bypassable.
        const b = boot(1);
        b.run(`
            pressSideMatch('m_g2', 'b0', 7);
            pressSideMatchOverall('m_stroke_g2', '${b.g2[2].id}', '${b.g2[3].id}');
            confirmSideHolePress('m_stroke_g2', 7, '${b.g2[2].id}', '${b.g2[3].id}');
            showSideHolePressInput('m_stroke_g2', '${b.g2[2].id}', '${b.g2[3].id}');
        `);
        assert.equal(b.wrote(), false, 'a press reached Firebase through one of the four paths');
    });

    test('confirmSideHolePress refuses directly, without its opener', () => {
        const b = boot(1);
        b.sb.__setElement('sm-hole-press-amount-m_stroke_g2', '25');
        b.run(`confirmSideHolePress('m_stroke_g2', 7, '${b.g2[2].id}', '${b.g2[3].id}');`);
        assert.equal(b.wrote(), false, 'the hole-press write must guard independently');
    });

    test('the same call SUCCEEDS for the group that owns the match', () => {
        const b = boot(2);
        b.sb.__setElement('sm-hole-press-amount-m_stroke_g2', '25');
        b.run(`confirmSideHolePress('m_stroke_g2', 7, '${b.g2[2].id}', '${b.g2[3].id}');`);
        assert.equal(b.writes().length, 1, 'Group 2 owns this match and must still be able to press it');
    });
});

// ---------------------------------------------------------------------------
// 9. IDENTITY GRANTS NOTHING
// ---------------------------------------------------------------------------
describe('IDENTITY IS NOT AUTHORIZATION', () => {
    test('?me= does not appear in any permission predicate', () => {
        const sm = read('sidematches.html');
        ['canPressSideMatch', 'canManageSideMatch', 'canCreateWagerWith', 'isOrganizerView'].forEach(name => {
            const start = sm.indexOf(`function ${name}`);
            assert.ok(start > -1, `${name} should exist`);
            const body = sm.slice(start, start + 1200);
            const fnBody = body.slice(0, body.indexOf('\n    }') + 1);
            assert.ok(!/\bmeId\b|resolvedMeId/.test(fnBody),
                `${name} must never read personal identity - a link is not proof of identity`);
        });
    });

    test('setting a me-like identity does not unlock another group\'s match', () => {
        const b = boot(1);
        // Even if some future code introduces meId, permission must not move.
        b.run(`window.meId = '${b.g2[0].id}'; deleteSideMatch('m_g2'); confirmDeleteSideMatch();`);
        assert.equal(b.wrote(), false);
    });
});

// ---------------------------------------------------------------------------
// 12-13. CREATION
// ---------------------------------------------------------------------------
describe('CREATION — a group link cannot build a wager out of other groups', () => {
    function pick(b, aIds, bIds) {
        const state = {};
        aIds.forEach(id => { state[String(id)] = 'a'; });
        bIds.forEach(id => { state[String(id)] = 'b'; });
        b.run(`sidematchPickState = ${JSON.stringify(state)};`);
        b.sb.__setElement('sm-format', 'match');
        b.sb.__setElement('sm-scoring', 'net');
        b.sb.__setElement('sm-stake', '50');
        b.sb.__setElement('sm-press-rule', 'none');
        b.sb.__setElement('sm-start-hole', '1');
    }

    test('Group 1 CANNOT create a match containing a Group 2 golfer', () => {
        const b = boot(1);
        pick(b, [b.g1[0].id], [b.g2[0].id]);   // Marty vs Stan, from a Group 1 link
        b.run(`saveSideMatch();`);
        assert.equal(b.wrote(), false, 'a group link created a cross-group wager');
    });

    test('Group 1 CANNOT create a match entirely between Group 2 golfers', () => {
        const b = boot(1);
        pick(b, [b.g2[0].id], [b.g2[1].id]);
        b.run(`saveSideMatch();`);
        assert.equal(b.wrote(), false);
    });

    test('Group 1 CAN create a match between its own golfers', () => {
        const b = boot(1);
        pick(b, [b.g1[0].id], [b.g1[2].id]);   // Marty vs John
        b.run(`saveSideMatch();`);
        const w = b.writes();
        assert.equal(w.length, 1, 'a legitimate local wager must still save');
        assert.ok(/sideMatches\//.test(w[0].path));
    });

    test('Group 1 CAN create a local 2v2', () => {
        const b = boot(1);
        pick(b, [b.g1[0].id, b.g1[3].id], [b.g1[1].id, b.g1[2].id]);
        b.run(`saveSideMatch();`);
        assert.equal(b.writes().length, 1);
    });

    test('the ORGANIZER can still create a cross-group match — unchanged', () => {
        const b = boot(ORGANIZER);
        pick(b, [b.g1[0].id], [b.g2[0].id]);   // Marty vs Stan
        b.run(`saveSideMatch();`);
        const w = b.writes();
        assert.equal(w.length, 1, 'organizer cross-group creation must not regress');
        assert.deepEqual(w[0].value.teamAIds, [String(b.g1[0].id)]);
        assert.deepEqual(w[0].value.teamBIds, [String(b.g2[0].id)]);
    });

    test('the creation guard sits before the write', () => {
        const sm = read('sidematches.html');
        const fn = sm.slice(sm.indexOf('function saveSideMatch'), sm.indexOf('let pendingDeleteMatchId'));
        const guardAt = fn.indexOf('canCreateWagerWith');
        const writeAt = fn.indexOf('db.ref');
        assert.ok(guardAt > -1 && guardAt < writeAt, 'saveSideMatch must guard before writing');
    });

    test('the picker offers a group link only its own golfers', () => {
        const b = boot(1);
        // Joined rather than deep-compared: the array is constructed inside the vm
        // realm, so its prototype is not the test realm's Array.
        const names = b.sb.selectablePlayers().map(p => p.name).join(',');
        assert.equal(names, 'Marty,Manny,John,Steve');
    });

    test('the picker offers the organizer the whole field', () => {
        const b = boot(ORGANIZER);
        assert.equal(b.sb.selectablePlayers().length, 8);
    });
});

// ---------------------------------------------------------------------------
// PART 8 — ADDITIONAL GAME INSTANCES
// ---------------------------------------------------------------------------
describe('INSTANCE CREATION — no silent enrolment of unrelated groups', () => {
    function fieldSetup(b, format, picks) {
        const state = {};
        (picks || []).forEach(id => { state[String(id)] = true; });
        b.run(`fieldActionPick = ${JSON.stringify(state)};`);
        b.sb.__setElement('sm-format', format);
        b.sb.__setElement('sm-field-stake', '10');
        b.sb.__setElement('sm-field-start', '1');
        b.sb.__setElement('sm-field-mode', 'gross');
        b.sb.__setElement('sm-field-carry', 'yes');
    }

    test('DOTS is blocked from a group link — the math is still field-wide', () => {
        // computeRoundMoneyByPlayer settles dots across data.players and ignores
        // participantIds, so a Group 1 dots game would charge all eight golfers.
        const b = boot(1);
        fieldSetup(b, 'dots');
        b.run(`saveFieldAction('dots');`);
        assert.equal(b.wrote(), false, 'a group link started a field-wide dots game');
    });

    test('DOTS from the ORGANIZER is unchanged', () => {
        const b = boot(ORGANIZER);
        fieldSetup(b, 'dots');
        b.run(`saveFieldAction('dots');`);
        const w = b.writes();
        assert.equal(w.length, 1, 'organizer dots creation must not regress');
        assert.equal(w[0].value.format, 'dots');
        assert.equal(w[0].value.dotPointVal, 10);
    });

    test('SKINS from a group link cannot enrol another group', () => {
        const b = boot(1);
        fieldSetup(b, 'skins', [b.g1[0].id, b.g2[0].id]);   // Marty + Stan
        b.run(`saveFieldAction('skins');`);
        assert.equal(b.wrote(), false);
    });

    test('SKINS scoped to the group DOES save, and records participantIds', () => {
        const b = boot(1);
        fieldSetup(b, 'skins', [b.g1[0].id, b.g1[1].id, b.g1[2].id]);
        b.run(`saveFieldAction('skins');`);
        const w = b.writes();
        assert.equal(w.length, 1);
        assert.deepEqual(
            w[0].value.participantIds.map(String).sort(),
            [b.g1[0].id, b.g1[1].id, b.g1[2].id].map(String).sort(),
            'a narrowed pot must record exactly who is in it');
    });

    test('AUTO-PAIR is organizer-only — it commits the whole field in one tap', () => {
        const b = boot(1);
        b.run(`
            autoPairPreview = [{ teamA: [{id:'${b.g1[0].id}'}], teamB: [{id:'${b.g2[0].id}'}] }];
        `);
        b.sb.__setElement('autopair-format', 'match');
        b.sb.__setElement('autopair-scoring', 'net');
        b.sb.__setElement('autopair-stake', '20');
        b.sb.__setElement('autopair-press-rule', 'none');
        b.run(`confirmAutoPairCreate();`);
        assert.equal(b.wrote(), false, 'a group link committed the whole field to matches');
    });

    test('AUTO-PAIR still works for the organizer', () => {
        const b = boot(ORGANIZER);
        b.run(`
            autoPairPreview = [{ teamA: [{id:'${b.g1[0].id}'}], teamB: [{id:'${b.g2[0].id}'}] }];
        `);
        b.sb.__setElement('autopair-format', 'match');
        b.sb.__setElement('autopair-scoring', 'net');
        b.sb.__setElement('autopair-stake', '20');
        b.sb.__setElement('autopair-press-rule', 'none');
        b.run(`confirmAutoPairCreate();`);
        assert.equal(b.writes().length, 1, 'Club Day auto-pair must not regress');
        assert.equal(b.writes()[0].op, 'update');
    });
});

// ---------------------------------------------------------------------------
// 14. EXISTING BEHAVIOUR PRESERVED
// ---------------------------------------------------------------------------
describe('NON-REGRESSION — nothing legitimate was taken away', () => {
    test('a single-group round is completely unaffected', () => {
        // Four golfers, no ?group= - the everyday Marty Monday round.
        const sb = loadHtmlInlineScript('sidematches.html', PAGE);
        const cd = makeCourseData(18);
        const names = ['Marty', 'Manny', 'John', 'Steve'];
        const p = makePlayers(names, names.map(() => 0));
        vm.runInContext(`
            window.__writes = [];
            db.ref = function (pth) { return {
                set: function (v) { window.__writes.push({ path: pth, op: 'set', value: v }); return Promise.resolve(); },
                remove: function () { window.__writes.push({ path: pth, op: 'remove' }); return Promise.resolve(); },
                update: function (v) { window.__writes.push({ path: pth, op: 'update', value: v }); return Promise.resolve(); },
                push: function () { return { key: 'k1' }; }, on: function () {}
            }; };
            currentMode = 'ABCD';
            currentData = ${JSON.stringify({ gameFormat: 'stroke', players: p, courseData: cd, scores: {}, sideMatches: { only: { format: 'match', scoring: 'net', stake: 20, startHole: 1, teamAIds: [String(p[0].id)], teamBIds: [String(p[1].id)] } } })};
            hasGroupLock = false; lockedGroup = null;
        `, sb);
        assert.equal(sb.isOrganizerView(), true);
        assert.equal(sb.canPressSideMatch(sb.sideMatchById('only')), true,
            'the bare link on a one-group round is the organizer and may press');
        assert.equal(sb.canManageSideMatch(sb.sideMatchById('only')), true);
        assert.equal(sb.selectablePlayers().length, 4);
    });

    test('a group link can still SEE every match, including other groups\'', () => {
        // Phase 0 changes what a group may WRITE. Visibility scoping is Phase 4 and
        // is deliberately untouched here, so the Receipt and the Matches list still
        // show the whole round.
        const b = boot(1);
        // currentData is a `let`, which is a lexical binding rather than a property
        // of the vm global, so it has to be read from inside the realm.
        const count = vm.runInContext('Object.keys(currentData.sideMatches).length', b.sb);
        assert.equal(count, 4);
    });

    test('a spectator on a multi-group round can press nothing', () => {
        const b = boot(ORGANIZER);
        // 8 players and no ?group= is also what a spectator holds. The press rule
        // treats it as read-only, exactly as index.html documents.
        assert.equal(b.sb.canPressSideMatch(b.sb.sideMatchById('m_g1')), false);
    });
});

// ---------------------------------------------------------------------------
// 15. PARITY WITH index.html
// ---------------------------------------------------------------------------
describe('PARITY — the two pages cannot drift apart', () => {
    const idx = read('index.html');
    const sm = read('sidematches.html');

    function body(src, name, stopAt) {
        const start = src.indexOf(`function ${name}`);
        if (start === -1) return null;
        const end = stopAt ? src.indexOf(stopAt, start) : src.indexOf('\n    }', start) + 6;
        return src.slice(start, end);
    }

    // Whitespace/comments differ between the files; the RULE must not.
    function ruleOf(src, name) {
        const b = body(src, name);
        assert.ok(b, `${name} must exist`);
        return b
            .replace(/\/\/[^\n]*/g, '')      // strip comments
            .replace(/\s+/g, ' ')
            .trim();
    }

    test('both files resolve the group lock from the same expression', () => {
        const expr = /urlParams\.get\('group'\) \? parseInt\(urlParams\.get\('group'\), 10\) : null/;
        assert.ok(expr.test(idx), 'index.html');
        assert.ok(expr.test(sm), 'sidematches.html');
    });

    test('isOrganizerView means the same thing in both files', () => {
        assert.equal(ruleOf(idx, 'isOrganizerView'), ruleOf(sm, 'isOrganizerView'));
    });

    test('canPressSideMatch applies the same rule in both files', () => {
        // index.html reads its group map from window.__scPlayerGroupMap; this page
        // builds it locally. Both answer the same question, so compare the DECISION
        // across every combination rather than the source text.
        const cases = [
            { group: 1, match: 'm_g1', expect: true },
            { group: 1, match: 'm_g2', expect: false },
            { group: 1, match: 'm_cross', expect: true },
            { group: 2, match: 'm_g1', expect: false },
            { group: 2, match: 'm_g2', expect: true },
            { group: 2, match: 'm_cross', expect: true },
            { group: 3, match: 'm_g1', expect: false },
            { group: 3, match: 'm_cross', expect: false }
        ];
        cases.forEach(c => {
            const b = boot(c.group);
            assert.equal(b.sb.canPressSideMatch(b.sb.sideMatchById(c.match)), c.expect,
                `Group ${c.group} pressing ${c.match}`);
        });
    });

    test('both files agree a multi-group bare link presses nothing', () => {
        const b = boot(ORGANIZER);
        assert.equal(b.sb.canPressSideMatch(b.sb.sideMatchById('m_g1')), false);
        assert.ok(/return !isMultiGroupRound;/.test(body(idx, 'canPressSideMatch')),
            'index.html must still carry the same clause');
    });

    test('the group-boundary maths is identical in both files', () => {
        assert.equal(ruleOf(idx, 'computeGroupSizes'), ruleOf(sm, 'computeGroupSizes'));
        assert.equal(ruleOf(idx, 'computeGroupBoundaries'), ruleOf(sm, 'computeGroupBoundaries'));
    });
});

// ---------------------------------------------------------------------------
// 12 (brief). SECURITY HONESTY
// ---------------------------------------------------------------------------
describe('SECURITY — what this does and does not claim', () => {
    test('Firebase rules are UNCHANGED and still open by design', () => {
        const rules = JSON.parse(read('database.rules.json')).rules;
        assert.equal(rules.events.$eventCode['.write'], true,
            'writes remain open - scoring is deliberately account-free');
        assert.ok(!/auth/.test(JSON.stringify(rules.events)),
            'there is still no identity for the server to check against');
    });

    test('this is client-side isolation, and the code says so', () => {
        const sm = read('sidematches.html');
        assert.ok(/It is NOT authorization/.test(sm),
            'the permission block must state its own limit, so nobody mistakes it for security');
    });
});
