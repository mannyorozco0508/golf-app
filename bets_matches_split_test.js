// ============================================================================
// BETS AND MATCHES: SPLIT THE JOBS, SCOPE TO THE GROUP (v135)
//
// The Matches tab (sidematches.html) is where matches are BUILT: the form, the
// press and remove controls, one short result line per card, the mini scorecard.
// The Bets tab (skins.html) is where a group WATCHES its own action: every match
// with one of its golfers in it - a cross-group match shows for both groups - the
// round games it is in, the round-wide games that belong to everybody, with the
// full live display that used to sit on Matches. The bare link sees all of it.
//
// ONE VISIBILITY RULE, in grouping.js, consulted by both pages:
//     see(wager) = no ?group= || no participant list || some participant's group
//                  === the locked group
// derived from participants - teamAIds / teamBIds / participantIds - and NEVER
// from ownerGroup or scope. An auto-paired slate carries neither field and a
// round saved before they existed carries neither, so a rule that read them
// would blank exactly the rounds a club day produces. The 'mislabeled' fixture
// below is the direct test of that: ownerGroup says Group 1, the golfers are all
// Group 2, and Group 1 must not see it.
//
// EVERY PAGE TEST ARRIVES THE WAY A GOLFER DOES: the page is loaded with the
// link's own query string and the round arrives through the value listener the
// page registered. No test here calls a render function by name (CLAUDE.md).
//
// WHAT mini-dom CANNOT PROVE: layout, and whether a disabled control is greyed.
// It can prove the attribute and that the write path refuses - both are asserted.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makePlayers, makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const CODE = 'ABCD';

// Eight golfers, two groups of four: A1-A4 are Group 1, B1-B4 are Group 2.
// Nine holes posted by everyone (even golfers 4, odd golfers 5) so every match
// has a live state and the match-play ones are pressable.
function round(extra) {
    const players = makePlayers(['A1 Alpha', 'A2 Alpha', 'A3 Alpha', 'A4 Alpha', 'B1 Bravo', 'B2 Bravo', 'B3 Bravo', 'B4 Bravo'],
        [0, 0, 0, 0, 0, 0, 0, 0]);
    const courseData = makeCourseData(18);
    const scores = {};
    players.forEach((p, i) => courseData.forEach(h => {
        if (h.hole <= 9) scores[`p${p.id}_h${h.hole}`] = (i % 2) ? 5 : 4;
    }));
    const id = i => String(players[i].id);
    const base = {
        eventName: 'Split Test', players, courseData, scores,
        gameFormat: 'skins', skinsBuyIn: 10, skinsPotFormat: 'gross', skinsCarryOver: true,
        groupSizeOverrides: {},
        birdieGameEnabled: true, birdieUnitVal: 2,
        // A wizard skins wager: round-wide, no participantIds - everybody's.
        additionalGames: { dots: { enabled: true, dotsValue: 1, startHole: 1 } },
        additionalGameInstances: {
            // Group 1's own skins game, and a dots game between two Group 2 golfers.
            skinsG1: { format: 'skins', enabled: true, skinsBuyIn: 5, skinsPotFormat: 'gross', skinsCarryOver: false, startHole: 1, participantIds: [id(0), id(1), id(2)] },
            dotsG2: { format: 'dots', enabled: true, dotsValue: 1, startHole: 1, participantIds: [id(4), id(5)] }
        },
        sideMatches: {
            // Group 1's own match, written by the Action form on a multi-group round.
            own: { format: 'match', scoring: 'gross', stake: 10, pressRule: 'anytime', teamAIds: [id(0)], teamBIds: [id(1)], createdAt: 1, scope: 'group', ownerGroup: 1 },
            // Cross-group: A3 v B1. Both groups have a stake.
            cross: { format: 'nassau', scoring: 'gross', stake: 10, frontStake: 5, backStake: 5, overallStake: 10, pressRule: 'anytime', teamAIds: [id(2)], teamBIds: [id(4)], createdAt: 2, scope: 'cross' },
            // Group 2's stroke bet with a stored hole press and an overall press.
            theirs: { format: 'stroke', scoring: 'net', holeStake: 2, overallStake: 20, overallMode: 'stroke', segment: 'full', tieRule: 'carry',
                teamAIds: [id(5)], teamBIds: [id(6)], createdAt: 3, scope: 'group', ownerGroup: 2,
                holePresses: { hp1: { fromHole: 4, newStake: 5 } }, overallPresses: { op1: { startHole: 6, stake: 20 } } },
            // A pre-ownerGroup record: no scope, no ownerGroup. Group 2 golfers.
            legacy: { format: 'match', scoring: 'gross', stake: 5, pressRule: 'none', teamAIds: [id(6)], teamBIds: [id(7)], createdAt: 4 },
            // THE TRAP: ownerGroup says 1, every golfer is Group 2. Participants decide.
            mislabeled: { format: 'match', scoring: 'gross', stake: 5, pressRule: 'none', teamAIds: [id(4)], teamBIds: [id(7)], createdAt: 5, scope: 'group', ownerGroup: 1 },
            // A 2v2 team stroke match inside Group 2, for the per-golfer line.
            team: { format: 'stroke', scoring: 'gross', holeStake: 0, overallStake: 40, overallMode: 'stroke', segment: 'full', tieRule: 'carry',
                teamAIds: [id(4), id(5)], teamBIds: [id(6), id(7)], createdAt: 6 }
        }
    };
    return Object.assign(base, extra || {});
}

// Load the page with the link's query string and let the round ARRIVE through
// the listener the page registered - never by calling a render function.
function arrive(page, search, data) {
    const sb = loadHtmlInlineScript(page, [], { search, only: false });
    const handler = (sb.__dbHandlers || []).find(h => h.event === 'value' && h.path === 'events/' + CODE);
    assert.ok(handler, page + ' must register its round listener at events/' + CODE);
    handler.cb({ val: () => data, exists: () => true });
    return sb;
}
const GROUP1 = `?game=${CODE}&group=1`;
const GROUP2 = `?game=${CODE}&group=2`;
const BARE = `?game=${CODE}`;
const html = (sb, id) => String(sb.document.getElementById(id).innerHTML || '');
const shown = (sb, id) => sb.document.getElementById(id).style.display !== 'none';

// ---------------------------------------------------------------------------
describe('grouping.js — the one visibility rule', () => {
    const G = loadJsFile('grouping.js');
    const players = makePlayers(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], []);
    const map = G.playerGroupMap(players, {});

    test('playerGroupMap keys every golfer by string id to a 1-based group', () => {
        assert.equal(map['101'], 1); assert.equal(map['104'], 1);
        assert.equal(map['105'], 2); assert.equal(map['108'], 2);
        assert.equal(Object.keys(map).length, 8);
    });

    test('bare link (null group) sees everything', () => {
        assert.equal(G.canLinkSeeWager(['105', '106'], null, map), true);
        assert.equal(G.canLinkSeeWager(['105'], undefined, map), true);
    });

    test('no participant list means round-wide: everybody sees it', () => {
        assert.equal(G.canLinkSeeWager([], 1, map), true);
        assert.equal(G.canLinkSeeWager(undefined, 2, map), true);
    });

    test('some participant in my group: visible; none: hidden', () => {
        assert.equal(G.canLinkSeeWager(['101', '105'], 1, map), true, 'cross-group, mine');
        assert.equal(G.canLinkSeeWager(['101', '105'], 2, map), true, 'cross-group, theirs too');
        assert.equal(G.canLinkSeeWager(['105', '106'], 1, map), false, 'other group only');
        assert.equal(G.canLinkSeeWager([105, 106], 2, map), true, 'numeric ids agree with string ids');
    });

    test('the rule is defined once, in grouping.js, and neither page redefines it', () => {
        assert.match(read('grouping.js'), /function canLinkSeeWager\(participantIds, lockedGroup, groupOf\)/);
        ['sidematches.html', 'skins.html'].forEach(p => {
            const inline = read(p).replace(/<script src=[^>]*><\/script>/g, '');
            assert.ok(!/function canLinkSeeWager\s*\(/.test(inline), p + ' must not shadow the rule');
            assert.ok(/canLinkSeeWager\(/.test(inline), p + ' must consult the rule');
        });
    });
});

// ---------------------------------------------------------------------------
describe('MATCHES TAB — a group link lists its own matches and nothing else', () => {
    const cards = sb => html(sb, 'sidematches-list');

    test('Group 1: its own match and the cross-group match; not Group 2\'s, not the legacy, not the mislabeled', () => {
        const c = cards(arrive('sidematches.html', GROUP1, round()));
        assert.match(c, /id="sm-card-own"/);
        assert.match(c, /id="sm-card-cross"/);
        assert.doesNotMatch(c, /sm-card-theirs/);
        assert.doesNotMatch(c, /sm-card-legacy/);
        assert.doesNotMatch(c, /sm-card-mislabeled/, 'ownerGroup says 1 but every golfer is Group 2');
        assert.doesNotMatch(c, /sm-card-team/);
    });

    test('Group 2: the mirror - theirs, legacy, mislabeled, team and the cross-group match; not Group 1\'s own', () => {
        const c = cards(arrive('sidematches.html', GROUP2, round()));
        assert.doesNotMatch(c, /sm-card-own/);
        ['cross', 'theirs', 'legacy', 'mislabeled', 'team'].forEach(k =>
            assert.match(c, new RegExp('id="sm-card-' + k + '"'), k));
    });

    test('bare link: every match', () => {
        const c = cards(arrive('sidematches.html', BARE, round()));
        ['own', 'cross', 'theirs', 'legacy', 'mislabeled', 'team'].forEach(k =>
            assert.match(c, new RegExp('id="sm-card-' + k + '"'), k));
    });

    test('a group whose matches are all elsewhere is told so, not shown an empty page', () => {
        const data = round();
        delete data.sideMatches.own; delete data.sideMatches.cross;
        const c = cards(arrive('sidematches.html', GROUP1, data));
        assert.doesNotMatch(c, /sm-card-/);
        assert.match(c, /No matches with a Group 1 golfer/);
    });
});

describe('MATCHES TAB — one result line per card, the mini scorecard, the controls', () => {
    test('every visible card carries one result line with a sentence in it', () => {
        const sb = arrive('sidematches.html', GROUP2, round());
        const c = html(sb, 'sidematches-list');
        const lines = c.match(/id="sm-result-[a-z]+"><span[^>]*>([^<]*)</g) || [];
        assert.equal(lines.length, 5, 'five cards, five lines');
        lines.forEach(l => assert.ok(!/><span[^>]*><$/.test(l) && l.length > 30, 'a blank result line: ' + l));
        // The line is bet-strip.js's sentence, not the engine's shorthand.
        assert.match(c, /B3 leads by 9 strokes/, 'the stroke match reads as a sentence');
        assert.match(c, /Thru 9/, 'progress on a live match');
        assert.match(c, /1 press/, 'the overall press is counted on the line');
    });

    test('the mini scorecard stays on every card, collapsed', () => {
        const sb = arrive('sidematches.html', BARE, round());
        const c = html(sb, 'sidematches-list');
        ['own', 'cross', 'theirs', 'legacy', 'mislabeled', 'team'].forEach(k => {
            assert.match(c, new RegExp('id="sm-scorecard-' + k + '" style="display:none;"'), k + ' scorecard present and collapsed');
            assert.match(c, new RegExp("toggleSmScorecard\\('" + k + "'\\)"), k + ' has its Verify Scores toggle');
        });
    });

    test('the display bulk is gone from Matches: no segment pills, no ledger, no press history, no per-golfer shares', () => {
        const c = html(arrive('sidematches.html', BARE, round()), 'sidematches-list');
        assert.doesNotMatch(c, /status-pill/);
        assert.doesNotMatch(c, /Ledger:/);
        assert.doesNotMatch(c, /HP1 |Per golfer|carrying/);
        assert.doesNotMatch(c, /sm-card-title/, 'the round-game display cards moved to Bets');
    });

    test('press and remove are reachable for every match a link can act on', () => {
        const g1 = html(arrive('sidematches.html', GROUP1, round()), 'sidematches-list');
        // own: match play, anytime press, thru 9 of 18 -> pressable; Group 1 has a stake.
        assert.match(g1, /pressSideMatch\('own', '18', 10\)/, 'Group 1 may press its own match at hole 10');
        assert.match(g1, /deleteSideMatch\('own'\)/, 'and remove it');
        // cross: Group 1 has A3 in it -> press and remove both offered.
        assert.match(g1, /pressSideMatch\('cross'/, 'a cross-group match with a Group 1 golfer is pressable from Group 1');
        assert.match(g1, /deleteSideMatch\('cross'\)/);

        const g2 = html(arrive('sidematches.html', GROUP2, round()), 'sidematches-list');
        assert.match(g2, /showSideHolePressInput\('theirs'/, 'Group 2 may press the $/hole bet');
        assert.match(g2, /pressSideMatchOverall\('theirs'/, 'and the overall');
        assert.match(g2, /id="sm-hole-press-row-theirs"/, 'the hole-press input still has its row to land in');
        assert.match(g2, /deleteSideMatch\('theirs'\)/);
        assert.match(g2, /pressSideMatch\('cross'/, 'the same cross-group match is pressable from Group 2');
        assert.doesNotMatch(g2, /pressSideMatch\('legacy'/, 'pressRule none: no press button, as before');

        // The bare link on an eight-golfer round is the spectator's URL too: it may
        // remove (organizer standing) but not press - the rule this wave did not touch.
        const bare = html(arrive('sidematches.html', BARE, round()), 'sidematches-list');
        assert.doesNotMatch(bare, /pressSideMatch\(|pressSideMatchOverall\(|showSideHolePressInput\(/);
        assert.equal((bare.match(/deleteSideMatch\('/g) || []).length, 6);
    });

    test('the round-games line names what the round is playing and points at Bets - no KPs, no pool', () => {
        const c = html(arrive('sidematches.html', GROUP1, round()), 'sidematches-list');
        assert.match(c, /id="sm-round-games"/);
        assert.match(c, /Skins/); assert.match(c, /Dots/); assert.match(c, /Birdie Game/);
        assert.match(c, /skins\.html/);
        assert.doesNotMatch(c, /KP|pool/i);
        const src = read('sidematches.html');
        const at = src.indexOf('id="sm-bets-pointer"');
        const pointer = src.slice(at, src.indexOf('</div>', at));
        assert.match(pointer, /skins\.html/);
        assert.doesNotMatch(pointer, /KP|pool/i, 'the pointer must not promise what Bets does not show');
    });

    test('the live heading names the job, not the round', () => {
        const sb = arrive('sidematches.html', BARE, round());
        assert.match(sb.document.getElementById('main-title').textContent, /^⚔️ Matches \(Split Test\)$/);
    });
});

// ---------------------------------------------------------------------------
describe('BETS TAB — a group watches its own action', () => {
    test('Group 1: own and cross matches in full; its skins game, the round-wide games, the birdie game', () => {
        const sb = arrive('skins.html', GROUP1, round());
        assert.ok(shown(sb, 'bets-matches-card'));
        const m = html(sb, 'bets-matches');
        assert.match(m, /id="bets-match-own"/);
        assert.match(m, /id="bets-match-cross"/);
        assert.doesNotMatch(m, /bets-match-theirs|bets-match-legacy|bets-match-mislabeled|bets-match-team/);
        const g = html(sb, 'bets-games');
        assert.match(g, /data-game-key="main"/, 'the main skins game, round-wide');
        assert.match(g, /data-game-key="dots"/, 'the wizard dots game, no participantIds: everybody\'s');
        assert.match(g, /data-game-key="skinsG1"/, 'Group 1\'s own skins game');
        assert.doesNotMatch(g, /data-game-key="dotsG2"/, 'Group 2\'s dots game is not Group 1\'s');
        assert.match(g, /data-game-key="birdie"/);
        assert.match(sb.document.getElementById('bets-lock-badge').textContent, /Group 1/);
    });

    test('Group 2: the mirror', () => {
        const sb = arrive('skins.html', GROUP2, round());
        const m = html(sb, 'bets-matches');
        assert.doesNotMatch(m, /bets-match-own/);
        ['cross', 'theirs', 'legacy', 'mislabeled', 'team'].forEach(k =>
            assert.match(m, new RegExp('id="bets-match-' + k + '"'), k));
        const g = html(sb, 'bets-games');
        assert.match(g, /data-game-key="main"/); assert.match(g, /data-game-key="dots"/);
        assert.match(g, /data-game-key="dotsG2"/);
        assert.doesNotMatch(g, /data-game-key="skinsG1"/);
        assert.match(g, /data-game-key="birdie"/);
    });

    test('bare link: every match, every game, no badge', () => {
        const sb = arrive('skins.html', BARE, round());
        const m = html(sb, 'bets-matches');
        ['own', 'cross', 'theirs', 'legacy', 'mislabeled', 'team'].forEach(k =>
            assert.match(m, new RegExp('id="bets-match-' + k + '"'), k));
        const g = html(sb, 'bets-games');
        ['main', 'dots', 'skinsG1', 'dotsG2', 'birdie'].forEach(k =>
            assert.match(g, new RegExp('data-game-key="' + k + '"'), k));
        assert.equal(shown(sb, 'bets-lock-badge'), false);
    });

    test('the full display moved here: pills, ledger, press history, per-golfer shares, LIVE/FINAL state', () => {
        const m = html(arrive('skins.html', GROUP2, round()), 'bets-matches');
        assert.match(m, /Front 9: /); assert.match(m, /Back 9: /); assert.match(m, /Total: /);
        assert.match(m, /Ledger:/);
        assert.match(m, /HP1 · H4 · \$5\/hole/, 'the stored hole press, straight from storage');
        assert.match(m, /P1 · H6 · \$20/, 'the stored overall press');
        assert.match(m, /Per golfer:/, 'a 2v2 says what each golfer pays');
        assert.match(m, /🟢 LIVE · Thru 9/);
        assert.match(m, /\$2\/hole/);
        assert.doesNotMatch(m, /onclick=/, 'no controls on Bets: pressing and removing are the Matches tab\'s job');
    });

    test('a finished match reads FINAL', () => {
        const data = round();
        data.players.forEach((p, i) => data.courseData.forEach(h => { data.scores[`p${p.id}_h${h.hole}`] = (i % 2) ? 5 : 4; }));
        const m = html(arrive('skins.html', GROUP1, data), 'bets-matches');
        assert.match(m, /id="bets-match-own"[\s\S]*?🔒 FINAL/);
    });

    test('the tab is called Bets', () => {
        const sb = arrive('skins.html', BARE, round());
        assert.match(sb.document.getElementById('main-title').textContent, /^💰 Bets \(Split Test\)$/);
        assert.doesNotMatch(read('skins.html'), /Skins Tracker/);
    });

    test('without the canonical stroke engine the Bets card FAILS LOUDLY, it does not compute zero', () => {
        // Moved here from parity_2v2_test.js with the display: sidematches.html no
        // longer calls the stroke engines, skins.html does.
        // Everything the page loads EXCEPT settlement-engine.js, so the first thing
        // missing is the stroke engine itself and not some earlier helper.
        const crippled = loadHtmlInlineScript('skins.html',
            ['handicap.js', 'text-safe.js', 'action-model.js', 'grouping.js', 'match-engine.js', 'money-engine.js', 'bet-strip.js'],
            { search: BARE, only: true });
        assert.equal(typeof crippled.calculateOverallBetEngine, 'undefined');
        const handler = crippled.__dbHandlers.find(h => h.event === 'value');
        const data = round();
        data.sideMatches = { theirs: data.sideMatches.theirs };
        // The error must NAME the engine: a page that threw for some other reason
        // would satisfy a bare assert.throws while still rendering $0 when it did run.
        assert.throws(() => handler.cb({ val: () => data, exists: () => true }),
            /calculate(Hole|Overall)BetEngine is not defined/,
            'a missing engine must break the card, not silently report no money');
    });
});

describe('BETS TAB — round configuration is read-only on a group link', () => {
    const CONTROLS = ['skins-pot-format', 'skins-buyin', 'skins-carry-switch', 'birdie-unit-val', 'birdie-scoring-switch'];

    test('Group 1: the controls are disabled and say why; nothing it does writes', () => {
        const sb = arrive('skins.html', GROUP1, round());
        CONTROLS.forEach(id => assert.equal(sb.document.getElementById(id).disabled, true, id + ' disabled'));
        assert.equal(shown(sb, 'skins-config-note'), true);
        assert.match(sb.document.getElementById('skins-config-note').textContent, /organizer/);
        assert.equal(shown(sb, 'birdie-config-note'), true);

        // UI WAVE 4: the refusals are inline notes now. Counted the same way, so
        // "each refusal is said out loud" still means exactly what it meant.
        let alerts = 0;
        const say = () => { alerts++; };
        sb.alert = say; sb.uiRefuse = say; sb.uiFail = say; sb.uiToast = say;
        sb.document.getElementById('skins-buyin').value = '99';
        vm.runInContext('saveSkinsConfig(); setSkinsCarryOver(false); saveBirdieConfig(); setBirdieScoring("net");', sb);
        assert.equal(sb.__dbWrites.length, 0, 'not one write from a group link');
        assert.equal(alerts, 4, 'each refusal is said out loud');
    });

    test('bare link: the controls are live and write', () => {
        const sb = arrive('skins.html', BARE, round());
        CONTROLS.forEach(id => assert.equal(sb.document.getElementById(id).disabled, false, id + ' enabled'));
        assert.equal(shown(sb, 'skins-config-note'), false);
        assert.equal(shown(sb, 'birdie-config-note'), false);
        sb.document.getElementById('skins-buyin').value = '15';
        sb.document.getElementById('skins-pot-format').value = 'gross';
        vm.runInContext('saveSkinsConfig();', sb);
        const w = sb.__dbWrites.find(x => x.op === 'update' && x.value && x.value.skinsBuyIn === 15);
        assert.ok(w, 'the organizer\'s buy-in change is written');
    });

    test('the two layers are independent: the write gate refuses even when the controls are not disabled', () => {
        // Stub the render-time lock silent and prove the write path still refuses.
        const sb = loadHtmlInlineScript('skins.html', [], { search: GROUP1 });
        vm.runInContext('applyConfigLock = function () {};', sb);
        sb.__dbHandlers.find(h => h.event === 'value').cb({ val: () => round(), exists: () => true });
        assert.notEqual(sb.document.getElementById('skins-buyin').disabled, true, 'lock silenced');
        sb.alert = () => {};
        vm.runInContext('saveSkinsConfig();', sb);
        assert.equal(sb.__dbWrites.length, 0, 'the gate alone blocks the write');
        // And a clean case still passes through the same gate.
        const ok = arrive('skins.html', BARE, round());
        vm.runInContext('saveSkinsConfig();', ok);
        assert.equal(ok.__dbWrites.length, 1, 'the gate does not simply refuse everything');
    });
});

// ---------------------------------------------------------------------------
describe('AUTO-PAIRED SLATE and PRE-ownerGroup rounds resolve by participants alone', () => {
    // Build the slate the way the organizer does: open the modal on the bare link,
    // confirm. The records production writes carry neither scope nor ownerGroup.
    function slate() {
        const data = round(); data.sideMatches = {};
        const sb = arrive('sidematches.html', BARE, data);
        // HARNESS LIMIT: the stub's push() hands back one key ('TEST') for every
        // call, which would fold the whole slate into a single record. Distinct
        // keys, as Firebase issues them; the page code is untouched.
        vm.runInContext('(function () { let n = 0; const orig = db.ref.bind(db); db.ref = p => { const r = orig(p); r.push = () => ({ key: "ap" + (n++) }); return r; }; })();', sb);
        vm.runInContext('openAutoPairModal();', sb);
        sb.document.getElementById('autopair-format').value = 'match';
        sb.document.getElementById('autopair-scoring').value = 'gross';
        sb.document.getElementById('autopair-stake').value = '20';
        sb.document.getElementById('autopair-press-rule').value = 'anytime';
        vm.runInContext('confirmAutoPairCreate();', sb);
        const w = sb.__dbWrites.find(x => x.op === 'update' && x.path === 'events/' + CODE);
        assert.ok(w, 'the slate was written as one update');
        const matches = {};
        Object.keys(w.value).forEach(k => { matches[k.replace('sideMatches/', '')] = w.value[k]; });
        return { data, matches };
    }

    test('the slate records carry no scope and no ownerGroup', () => {
        const { matches } = slate();
        const list = Object.values(matches);
        assert.ok(list.length >= 2, 'a slate across two foursomes');
        list.forEach(m => {
            assert.equal(m.scope, undefined); assert.equal(m.ownerGroup, undefined);
            assert.ok(m.teamAIds.length && m.teamBIds.length);
        });
    });

    test('every slate match is cross-group and shows for BOTH groups, on both tabs', () => {
        const { data, matches } = slate();
        data.sideMatches = matches;
        const keys = Object.keys(matches);
        const g1m = html(arrive('sidematches.html', GROUP1, data), 'sidematches-list');
        const g2m = html(arrive('sidematches.html', GROUP2, data), 'sidematches-list');
        const g1b = html(arrive('skins.html', GROUP1, data), 'bets-matches');
        const g2b = html(arrive('skins.html', GROUP2, data), 'bets-matches');
        keys.forEach(k => {
            assert.match(g1m, new RegExp('sm-card-' + k + '"'), 'Matches G1 ' + k);
            assert.match(g2m, new RegExp('sm-card-' + k + '"'), 'Matches G2 ' + k);
            assert.match(g1b, new RegExp('bets-match-' + k + '"'), 'Bets G1 ' + k);
            assert.match(g2b, new RegExp('bets-match-' + k + '"'), 'Bets G2 ' + k);
        });
    });

    test('a pre-ownerGroup record resolves the same way', () => {
        const data = round();
        data.sideMatches = { legacy: data.sideMatches.legacy };   // Group 2 v Group 2, no scope, no ownerGroup
        assert.doesNotMatch(html(arrive('skins.html', GROUP1, data), 'bets-matches'), /bets-match-legacy/);
        assert.match(html(arrive('skins.html', GROUP2, data), 'bets-matches'), /bets-match-legacy/);
        assert.match(html(arrive('skins.html', BARE, data), 'bets-matches'), /bets-match-legacy/);
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAM — what each page loads, and what it no longer carries', () => {
    test('sidematches.html loads money-engine.js and bet-strip.js before its inline block, and owns no engine copy', () => {
        const s = read('sidematches.html');
        const inlineAt = s.indexOf('<script>');
        ['match-engine.js', 'money-engine.js', 'bet-strip.js', 'grouping.js'].forEach(f => {
            const at = s.indexOf('<script src="' + f + '">');
            assert.ok(at > -1 && at < inlineAt, f + ' must load before the inline block');
        });
        assert.ok(s.indexOf('<script src="money-engine.js">') < s.indexOf('<script src="bet-strip.js">'), 'presenter after engine');
        const inline = s.replace(/<script src=[^>]*><\/script>/g, '');
        ['calculateMatchEngine', 'nassauStakeConfig', 'formatMatchPill', 'strokePressHistory', 'buildRoundGameCards'].forEach(fn =>
            assert.ok(!new RegExp('function ' + fn + '\\s*\\(').test(inline), fn + ' must not be defined inline any more'));
        assert.match(inline, /buildSideActionRows\(currentData, courseData, savedScores, players\)/, 'the result line comes from bet-strip.js');
    });

    test('skins.html loads grouping.js, money-engine.js and bet-strip.js before its inline block', () => {
        const s = read('skins.html');
        const inlineAt = s.indexOf('<script>');
        ['grouping.js', 'match-engine.js', 'money-engine.js', 'bet-strip.js', 'settlement-engine.js', 'action-model.js'].forEach(f => {
            const at = s.indexOf('<script src="' + f + '">');
            assert.ok(at > -1 && at < inlineAt, f + ' must load before the inline block');
        });
        assert.ok(s.indexOf('<script src="money-engine.js">') < s.indexOf('<script src="bet-strip.js">'));
    });

    test('neither page consults ownerGroup or scope to decide visibility', () => {
        const slice = (file, start) => {
            const s = read(file); const at = s.indexOf(start);
            assert.ok(at > -1, file + ' has ' + start);
            const end = s.indexOf('\n    function ', at + 30);
            return s.slice(at, end);
        };
        const rsm = slice('sidematches.html', 'function renderSideMatches()');
        const rb = slice('skins.html', 'function renderBets()');
        [rsm, rb].forEach(fn => {
            assert.match(fn, /canLinkSeeWager\(/, 'the rule is consulted');   // the positive assertion
            assert.doesNotMatch(fn, /\.ownerGroup|\.scope\b/, 'visibility must not read ownerGroup or scope');
        });
    });

    test('the protected files were not edited by this wave', () => {
        const crypto = require('crypto');
        const sha = f => crypto.createHash('sha256').update(read(f)).digest('hex').slice(0, 8);
        // Pinned at the sha each file had at b6ab43b (v134), the commit this wave built on.
        assert.equal(sha('bet-strip.js'), '43880a61');
        assert.equal(sha('money-engine.js'), '9653b632');  // v218: calculateMatchEngine moved OUT to match-engine.js. Deletion plus a pointer comment; no arithmetic moved, and match_engine_parity_test.js pins the 13-fixture corpus the three old copies agreed on.
        assert.equal(sha('action-model.js'), 'ded86280');
        assert.equal(sha('settlement-engine.js'), 'f8905d43');   // f8905d43: v215 THE ALOHA BET 2026-09-23 (approved per-file, three edits only: the aloha line in legacyMainAsSideMatch, the Receipt segment in buildSideMatchReceipts, the ledger line in computeCombinedNetTotals; every decision and every number comes from aloha-bet.js through a typeof guard, so no golf math entered this file)
        // Wave A fix 1: pool-engine.js re-pinned - net lines now carry {shares}, the array the engine paid a tie from; additive, every figure unchanged (tie_shares_test.js).
        assert.equal(sha('pool-engine.js'), '372e76d7');   // 372e76d7: KP never refunds 2026-09-22 (approved per-file, the KP branch): a blank on a finished round and an Out winner are held (unresolved), nobody goes to the skins bucket (toSkinsCents), no KP refund; was a335f19c.
        assert.equal(sha('hole-events.js'), '6fd7f7ed');
        // settlement.html and index.html were fenced for the split wave only; the
        // skins-rows wave (v136) edits both. The engines stay pinned.
    });
});
