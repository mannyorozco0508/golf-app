// ============================================================================
// THE BOARD AND STATS TABS SCOPE THEIR WAGER CARDS TO THE LINK (v140).
//
// v135 scoped Matches and Bets. leaderboard.html's "LIVE MATCHES & PRESSES"
// and Stroke Bets cards were left unscoped on purpose ("the leaderboard shows
// the whole field, so every wager is in scope") - which predates v135 - and
// showed a Group 1 link Group 3's match WITH a press link to it; stats.html's
// Side Matches section listed every match to every link the same way.
//
// THE RULE, the v135 one, the same function: grouping.js canLinkSeeWager over
// the match's teamAIds + teamBIds against the link's ?group=. A cross-group
// match with one of my golfers still shows; the bare link sees everything; a
// match a link cannot see is not a card, so its press link is never offered.
//
// ONLY WAGERS. The standings, the skins ledger, the flight cards, the points
// and Hi-Lo cards, and every other Stats card are the whole field by design.
// board_stats_scope_prev.fixture.json holds the tag-stripped text of those
// sections on the bare link, ?group=1 and ?group=3, captured BEFORE this
// change; today's text must equal it character for character. RESULTS
// (settlement.html) stays unscoped, deliberately, and is not touched.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makePlayers, makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const strip = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const CD = makeCourseData(18); const J = v => JSON.parse(JSON.stringify(v));

// 23 golfers, groups 4/4/4/4/4/3 (ids 101-123: G1 101-104, G3 109-112), flighted
// skins, a birdie game, and four wagers: Group 1's own match, Group 3's Nassau,
// a cross-group stroke bet G1-3 v G3-4, and a Group 3 stroke bet.
const NAMES = Array.from({ length: 23 }, (_, i) => 'G' + (Math.floor(i / 4) + 1) + '-' + (i % 4 + 1) + ' Player');
function round() {
    const players = makePlayers(NAMES, NAMES.map((_, i) => i % 9), 101, NAMES.map((_, i) => (i % 2 ? 'B' : 'A')));
    const scores = {}; players.forEach((p, i) => CD.forEach(h => { if (h.hole <= 12) scores[`p${p.id}_h${h.hole}`] = h.par + ((i + h.hole) % 3) - 1; }));
    return { eventName: 'Board Scope', players, courseData: CD, scores, gameFormat: 'skins', skinsBuyIn: 5, skinsPotFormat: 'gross', skinsCarryOver: false,
        flights: { enabled: true, scopes: { skins: 'flight', birdies: 'field' } }, groupSizeOverrides: { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 3 }, birdieGameEnabled: true, birdieUnitVal: 1,
        sideMatches: {
            g1: { format: 'match', scoring: 'gross', stake: 10, pressRule: 'anytime', teamAIds: [101], teamBIds: [102], createdAt: 1 },
            g3: { format: 'nassau', scoring: 'gross', stake: 10, frontStake: 5, backStake: 5, overallStake: 10, pressRule: 'anytime', teamAIds: [109, 110], teamBIds: [111, 112], createdAt: 2 },
            x13: { format: 'stroke', scoring: 'net', holeStake: 2, overallStake: 20, overallMode: 'stroke', segment: 'full', tieRule: 'carry', teamAIds: [103], teamBIds: [112], createdAt: 3 },
            g3s: { format: 'stroke', scoring: 'gross', holeStake: 1, overallStake: 5, overallMode: 'stroke', segment: 'full', tieRule: 'carry', teamAIds: [109], teamBIds: [110], createdAt: 4 }
        } };
}
// Each page arrives the way a golfer does: loaded with the link, the round
// through its own value listener.
function arrive(page, search, data) {
    const sb = loadHtmlInlineScript(page, [], { search });
    const mounts = page === 'stats.html' ? ['stats-content'] : ['board-content', 'live-matches-mount', 'live-strokebet-mount', 'live-skins-mount', 'live-points-mount', 'live-hilo-mount'];
    vm.runInContext(mounts.map(m => 'document.__mount(document.getElementById("' + m + '"));').join(''), sb);
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/BOARD1');
    assert.ok(h, page + ' registered its round listener');
    h.cb({ val: () => J(data || round()), exists: () => true });
    return id => String(vm.runInContext("(document.getElementById('" + id + "')||{}).innerHTML || ''", sb));
}
const BARE = '?game=BOARD1', G1 = '?game=BOARD1&group=1', G3 = '?game=BOARD1&group=3';
// stats-content without its Side Matches card: split on the card boundary and
// drop the one whose header is the Side Matches header.
const statsWithoutSideMatches = html => html.split('<div class="settle-card">').filter(piece => !/settle-header">⚔️ Side Matches</.test(piece)).join('<div class="settle-card">');
const statsSideMatches = html => html.split('<div class="settle-card">').filter(piece => /settle-header">⚔️ Side Matches</.test(piece)).join('');

// ---------------------------------------------------------------------------
describe('BOARD — the wager cards follow the v135 rule', () => {
    test('Group 1: its own match and the cross-group bet; not Group 3\'s match, not Group 3\'s bet; one press link, for its own match', () => {
        const el = arrive('leaderboard.html', G1);
        const m = strip(el('live-matches-mount')), sbets = strip(el('live-strokebet-mount'));
        assert.match(m, /G1-1 v G1-2/);
        assert.doesNotMatch(m, /G3-1|G3-2|G3-3/, 'Group 3\'s Nassau is not on Group 1\'s board');
        assert.equal((m.match(/Press ·/g) || []).length, 1, 'one press link, for the match Group 1 can act on');
        assert.match(m, /1 wager/);
        assert.match(sbets, /G1-3 v G3-4/, 'the cross-group stroke bet has a Group 1 golfer');
        assert.doesNotMatch(sbets, /G3-1 v G3-2/, 'Group 3\'s own stroke bet is not');
    });
    test('Group 3: the mirror - its Nassau, its stroke bet, the cross-group bet; not Group 1\'s match', () => {
        const el = arrive('leaderboard.html', G3);
        const m = strip(el('live-matches-mount')), sbets = strip(el('live-strokebet-mount'));
        assert.match(m, /G3-1\/G3-2 v G3-3\/G3-4/);
        assert.doesNotMatch(m, /G1-1 v G1-2/);
        assert.equal((m.match(/Press ·/g) || []).length, 1);
        assert.match(sbets, /G1-3 v G3-4/); assert.match(sbets, /G3-1 v G3-2/);
    });
    test('bare link: every match and every bet, both press links', () => {
        const el = arrive('leaderboard.html', BARE);
        const m = strip(el('live-matches-mount')), sbets = strip(el('live-strokebet-mount'));
        assert.match(m, /2 wagers/); assert.match(m, /G1-1 v G1-2/); assert.match(m, /G3-1\/G3-2 v G3-3\/G3-4/);
        assert.equal((m.match(/Press ·/g) || []).length, 2);
        assert.match(sbets, /G1-3 v G3-4/); assert.match(sbets, /G3-1 v G3-2/);
    });
    test('a group with no wager at all gets no card, not an empty one', () => {
        const el = arrive('leaderboard.html', '?game=BOARD1&group=5');
        assert.equal(strip(el('live-matches-mount')), '');
        assert.equal(strip(el('live-strokebet-mount')), '');
    });
});

describe('STATS — the Side Matches section follows the same rule', () => {
    test('Group 1: its match and the cross-group bet only', () => {
        const side = strip(statsSideMatches(arrive('stats.html', G1)('stats-content')));
        assert.match(side, /G1-1 vs G1-2/); assert.match(side, /G1-3 vs G3-4/);
        assert.doesNotMatch(side, /G3-1|G3-2 vs|G3-3/);
    });
    test('Group 3: the mirror', () => {
        const side = strip(statsSideMatches(arrive('stats.html', G3)('stats-content')));
        assert.doesNotMatch(side, /G1-1 vs G1-2/);
        assert.match(side, /G1-3 vs G3-4/); assert.match(side, /G3-1 vs G3-2/);
    });
    test('bare link: all four', () => {
        const side = strip(statsSideMatches(arrive('stats.html', BARE)('stats-content')));
        ['G1-1 vs G1-2', 'G1-3 vs G3-4', 'G3-1 vs G3-2'].forEach(s => assert.match(side, new RegExp(s)));
        assert.match(side, /G3-1\/G3-2|G3-1 \/ G3-2/);
    });
    test('a group with nothing to show gets no Side Matches card', () => {
        assert.equal(statsSideMatches(arrive('stats.html', '?game=BOARD1&group=5')('stats-content')), '');
    });
});

// ---------------------------------------------------------------------------
describe('ONLY WAGERS MOVED — the standings, the skins ledger, the flight cards and every other card are the pre-change text', () => {
    const PREV = JSON.parse(read('board_stats_scope_prev.fixture.json')).links;
    test('the previous capture is pinned, so the proof cannot drift with the fixture', () => {
        assert.equal(sha(PREV.bare.board.standings).slice(0, 8), '068796ae');
        assert.equal(sha(PREV.bare.stats.beforeSideMatches).slice(0, 8), 'c453152a');
        assert.equal(PREV.bare.board.matches, PREV.group1.board.matches, 'before: the Board showed every group the same wagers');
        assert.match(PREV.group1.board.matches, /G3-1\/G3-2 v G3-3\/G3-4/, 'before: Group 1 was shown Group 3\'s match');
        assert.equal((PREV.group1.board.matches.match(/Press ·/g) || []).length, 2, 'before: with a press link to it');
    });
    [['bare', BARE], ['group1', G1], ['group3', G3]].forEach(([k, search]) => {
        test(k + ': Board standings, skins, points, hi-lo - character for character', () => {
            const el = arrive('leaderboard.html', search);
            // v201 (the board polish): the frozen TEXT through this wave's edits -
            // "HCP: 8" -> "HCP 8" and a header row on each section table. No number,
            // name or position moves; helpers/board-polish-v201.js throws if an edit
            // finds nothing. This round's golfers are thru 12 (no F) and its skins
            // are not on this capture's surface, so those two edits do not apply.
            const { boardTextV201 } = require('./helpers/board-polish-v201.js');
            assert.equal(strip(el('board-content')), boardTextV201(PREV[k].board.standings, { sections: true }));
            assert.ok(PREV[k].board.standings.length > 1000, 'the standings are on the page');
            assert.match(PREV[k].board.standings, /Flight A|Flight B|G1-1|G6-3/, 'and hold the whole field');
            assert.equal(strip(el('live-skins-mount')), PREV[k].board.skins);
            assert.equal(strip(el('live-points-mount')), PREV[k].board.points);
            assert.equal(strip(el('live-hilo-mount')), PREV[k].board.hilo);
        });
        test(k + ': Stats without its Side Matches card - character for character', () => {
            // The Stats scorecard prints TODAY's date; the fixture holds the day it
            // was captured. The date is the one segment allowed to differ (a harness
            // fault of the first cut, found when the calendar rolled over mid-session).
            const undate = t => t.replace(/\|[A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}, \d{4}\|/g, '|<date>|');
            const html = arrive('stats.html', search)('stats-content');
            const now = undate(strip(statsWithoutSideMatches(html)));
            const before = undate(strip(statsWithoutSideMatches(PREV[k].stats.html)));
            assert.equal(now, before);
            assert.notEqual(now, before.replace('<date>', ''), 'the date segment was actually there');
            assert.ok(now.length > 2000, 'not vacuous');
        });
    });
    test('the bare link\'s wager cards are the pre-change text too', () => {
        const el = arrive('leaderboard.html', BARE);
        assert.equal(strip(el('live-matches-mount')), PREV.bare.board.matches);
        assert.equal(strip(el('live-strokebet-mount')), PREV.bare.board.strokeBets);
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAM — one rule, from grouping.js, on both pages; Results untouched', () => {
    test('leaderboard.html: both wager builders filter through boardLinkMaySee -> canLinkSeeWager; the standings do not read the group', () => {
        const s = read('leaderboard.html');
        assert.match(s, /function boardLinkMaySee\(wagerId\)/);
        assert.match(s, /return canLinkSeeWager\(\(sm\.teamAIds \|\| \[\]\)\.concat\(sm\.teamBIds \|\| \[\]\), lockedGroup, groupOf\);/);
        assert.match(s, /buildLiveMatchStates\(data, courseData, savedScores, visibleIds\) \|\| \[\]\)\s*\.filter\(st => !st\.isSideMatch \|\| boardLinkMaySee\(st\.wagerId\)\)/);
        assert.match(s, /buildLiveStrokeBetStates\(data, courseData, savedScores, visibleIds\) \|\| \[\]\)\s*\.filter\(st => boardLinkMaySee\(st\.wagerId\)\)/);
        const board = s.slice(s.indexOf('function renderBoard()'), s.indexOf('\n    function ', s.indexOf('function renderBoard()') + 30));
        assert.ok(board.length > 200);
        assert.doesNotMatch(board, /lockedGroup|canLinkSeeWager/, 'the standings renderer never reads the group');
        const skins = s.slice(s.indexOf('function renderLiveSkinsBoard()'), s.indexOf('\n    function ', s.indexOf('function renderLiveSkinsBoard()') + 30));
        assert.doesNotMatch(skins, /lockedGroup|canLinkSeeWager/, 'the skins ledger never reads the group');
        assert.match(s, /<script src="grouping\.js">/);
        assert.doesNotMatch(s.replace(/<script src=[^>]*><\/script>/g, ''), /function canLinkSeeWager/, 'no second copy');
    });
    test('stats.html: loads grouping.js and filters the Side Matches section through canLinkSeeWager; nothing else reads the group', () => {
        const s = read('stats.html');
        assert.match(s, /<script src="grouping\.js">/);
        const fn = s.slice(s.indexOf('function buildSideMatchesHtml('), s.indexOf('\n    function ', s.indexOf('function buildSideMatchesHtml(') + 30));
        assert.match(fn, /canLinkSeeWager\(\(sm\.teamAIds \|\| \[\]\)\.concat\(sm\.teamBIds \|\| \[\]\), lockedGroup, groupOf\)/);
        const inline = s.replace(/<script src=[^>]*><\/script>/g, '');
        assert.equal((inline.match(/canLinkSeeWager\(/g) || []).length, 1, 'exactly one consumer on this page');
        assert.doesNotMatch(inline, /function canLinkSeeWager/);
    });
    test('settlement.html: the MONEY is unscoped (v141 scoped its match cards; results_scope_test.js owns that)', () => {
        // v140's fence was "no scoping reached settlement.html at all". v141
        // overruled the Results decision for the Side Matches CARDS only; what
        // this row still guards is that the money never reads the group.
        const s = read('settlement.html');
        ['function renderCombinedSummary(', 'function renderMoneyPoolSection(', 'function buildPayoutCardHtml('].forEach(start => {   // v196: the Pay out builder replaced the payouts block
            const at = s.indexOf(start); assert.ok(at > -1, start);
            assert.doesNotMatch(s.slice(at, s.indexOf('\n    function ', at + 30)), /lockedGroup|canLinkSeeWager/, start + ' must not scope');
        });
    });
    test('the engines were not touched', () => {
        const h = f => sha(read(f)).slice(0, 8);
        assert.equal(h('money-engine.js'), '3c960947');
        assert.equal(h('settlement-engine.js'), 'f7712d87');   // f7712d87: KP never refunds 2026-09-22 (approved: the refund wording): the per-reason KP refund ledger line is gone; was 9043e7fc.
        // Wave A fix 1: pool-engine.js re-pinned - net lines now carry {shares}, the array the engine paid a tie from; additive, every figure unchanged (tie_shares_test.js).
        assert.equal(h('pool-engine.js'), '372e76d7');   // 372e76d7: KP never refunds 2026-09-22 (approved per-file, the KP branch): a blank on a finished round and an Out winner are held (unresolved), nobody goes to the skins bucket (toSkinsCents), no KP refund; was a335f19c.
        assert.equal(h('grouping.js'), sha(read('grouping.js')).slice(0, 8));
    });
});
