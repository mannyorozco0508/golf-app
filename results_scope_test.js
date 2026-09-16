// ============================================================================
// THE RESULTS TAB'S MATCH CARDS FOLLOW THE LINK'S GROUP (v141). settlement.html.
//
// v135 left Results unscoped ("settlement must show every wager"). Overruled:
// the SIDE MATCHES section's per-match cards apply the same rule as every
// other surface - grouping.js canLinkSeeWager over the match's participants -
// so a group link sees the matches one of its golfers is in, cross-group
// matches included, and the bare link sees them all. A group with no visible
// match is told so, not shown an empty card.
//
// THE MONEY IS NOT SCOPED, and this file's job is to prove it did not move:
// Final Results, Player Payouts, Who Pays Who, the Main Pool section and the
// scorecard are computed from the full record and shown to every link. A
// transaction between two golfers of another group still appears in Who Pays
// Who on my link, because hiding it would break the settlement.
//
// TRACEABILITY: a golfer only has match money from matches they are in, and a
// match they are in is - by the rule - visible on their group's link (their
// id maps to their group). So their Final Results line is always explained by
// cards on the same page. Asserted for every golfer in every match below.
//
// THE PROOF, v136-v140's method: results_scope_prev.fixture.json holds the
// tag-stripped text of every section on the bare link, ?group=1, ?group=6
// and ?group=3, captured at c8e3f78 (v140) before the change. Today's text
// must equal it character for character on every section but the Side
// Matches card - and on the bare link, the Side Matches card too.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const strip = h => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
const CD = makeCourseData(18); const J = v => JSON.parse(JSON.stringify(v));

// The captured round: 23 golfers (the wizard's), groups 4/4/4/4/4/3, a settled
// Main Pool (every KP recorded and confirmed), a birdie game, four matches:
// Group 1's (Ann v Ben), Group 6's Nassau (Uma v Vic), a cross-group stroke bet
// (Cal, Group 1, v Wes, Group 6), Group 3's stroke bet (Ivy v Jon).
function round(extra) {
    const r = wizardSavedRound({ code: 'RSCOPE', courseData: CD, thru: 18, overrides: { additionalGames: {} } });
    delete r.flights;
    r.groupSizeOverrides = { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 3 }; r.birdieGameEnabled = true; r.birdieUnitVal = 1;
    const byName = {}; r.players.forEach(p => { byName[p.name] = p.id; });
    [['Ann Alpha', 1], ['Cal Charlie', 5], ['Ned November', 7], ['Quy Quebec', 16]].forEach(([n, h]) => { r.scores['p' + byName[n] + '_h' + h] = CD[h - 1].par - 1; });
    const id = i => String(r.players[i].id);
    r.kpWinners = { h3: id(0), h7: id(4), h12: id(8), h16: id(1) }; r.kpConfirmed = { confirmed: true, at: 1 };
    r.sideMatches = {
        g1:  { format: 'match', scoring: 'gross', stake: 10, pressRule: 'anytime', teamAIds: [id(0)], teamBIds: [id(1)], createdAt: 1 },
        g6:  { format: 'nassau', scoring: 'gross', stake: 10, frontStake: 5, backStake: 5, overallStake: 10, pressRule: 'anytime', teamAIds: [id(20)], teamBIds: [id(21)], createdAt: 2 },
        x16: { format: 'stroke', scoring: 'net', holeStake: 2, overallStake: 20, overallMode: 'stroke', segment: 'full', tieRule: 'carry', teamAIds: [id(2)], teamBIds: [id(22)], createdAt: 3 },
        g3:  { format: 'stroke', scoring: 'gross', holeStake: 1, overallStake: 5, overallMode: 'stroke', segment: 'full', tieRule: 'carry', teamAIds: [id(8)], teamBIds: [id(9)], createdAt: 4 }
    };
    if (extra) extra(r, id);
    return r;
}
const MOUNTS = ['money-pool-section', 'combined-settlement-summary', 'settle-content', 'receipt-scorecard'];
// Arrive the way a golfer does: the page loads with the link, the round through
// its own value listener.
function arrive(search, data) {
    const sb = loadHtmlInlineScript('settlement.html', [], { search });
    vm.runInContext(MOUNTS.map(m => 'document.__mount(document.getElementById("' + m + '"));').join(''), sb);
    const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/RSCOPE');
    assert.ok(h, 'settlement.html registered its round listener');
    h.cb({ val: () => J(data || round()), exists: () => true });
    return id => String(vm.runInContext("(document.getElementById('" + id + "')||{}).innerHTML || ''", sb));
}
const cards = html => html.split('<div class="settle-card">');
const withoutSideMatches = html => cards(html).filter(p => !/settle-header">⚔️ Side Matches</.test(p)).join('<div class="settle-card">');
const sideMatchesOnly = html => cards(html).filter(p => /settle-header">⚔️ Side Matches</.test(p)).join('');
const BARE = '?game=RSCOPE', G1 = '?game=RSCOPE&group=1', G6 = '?game=RSCOPE&group=6', G3 = '?game=RSCOPE&group=3';

// ---------------------------------------------------------------------------
describe('THE SIDE MATCHES CARDS follow the rule', () => {
    test('Group 1: its own match and the cross-group bet; not Group 6\'s Nassau, not Group 3\'s bet', () => {
        const t = strip(sideMatchesOnly(arrive(G1)('settle-content')));
        assert.match(t, /Ann vs Ben/); assert.match(t, /Cal vs Wes/);
        assert.doesNotMatch(t, /Uma vs Vic/); assert.doesNotMatch(t, /Ivy vs Jon/);
    });
    test('Group 6: the mirror - the Nassau and the cross-group bet; not Group 1\'s match', () => {
        const t = strip(sideMatchesOnly(arrive(G6)('settle-content')));
        assert.match(t, /Uma vs Vic/); assert.match(t, /Cal vs Wes/);
        assert.doesNotMatch(t, /Ann vs Ben/); assert.doesNotMatch(t, /Ivy vs Jon/);
    });
    test('bare link: all four', () => {
        const t = strip(sideMatchesOnly(arrive(BARE)('settle-content')));
        ['Ann vs Ben', 'Uma vs Vic', 'Cal vs Wes', 'Ivy vs Jon'].forEach(m => assert.match(t, new RegExp(m)));
    });
    test('a group with no visible match is told so - and told the totals still count every match', () => {
        const t = strip(sideMatchesOnly(arrive('?game=RSCOPE&group=5')('settle-content')));
        assert.match(t, /⚔️ Side Matches/);
        assert.match(t, /No matches with a Group 5 golfer in them/);
        assert.match(t, /still counted in the totals/);
        assert.doesNotMatch(t, / vs /);
    });
    test('a round with no matches at all renders no section on any link, as before', () => {
        const data = round(); delete data.sideMatches;
        assert.equal(sideMatchesOnly(arrive(G1, data)('settle-content')), '');
        assert.equal(sideMatchesOnly(arrive(BARE, data)('settle-content')), '');
    });
    test('the round\'s own wager (a Match Play format) is everybody\'s: it names the whole field', () => {
        // Eight golfers on Team 1 / Team 2 (makePlayers alternates), two groups, a
        // $50 match created in setup: the virtual __main wager lists both teams'
        // ids, so every group link sees it.
        const { makePlayers } = require('./helpers/fixtures.js');
        const players = makePlayers(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'], [0, 0, 0, 0, 0, 0, 0, 0]);
        const scores = {}; players.forEach((p, i) => CD.forEach(h => { scores[`p${p.id}_h${h.hole}`] = h.par + (i % 2); }));
        const data = { eventName: 'Main wager', players, courseData: CD, scores, gameFormat: 'match', matchStake: 50, matchScoring: 'gross', matchPressRule: 'none' };
        ['?game=RSCOPE&group=1', '?game=RSCOPE&group=2'].forEach(s => {
            const t = strip(sideMatchesOnly(arrive(s, data)('settle-content')));
            assert.match(t, /Match Play/, s + ': the round\'s own match is on every group\'s page');
        });
    });
});

// ---------------------------------------------------------------------------

// v142 (WEEKLY GAME): the Results tab's pool section renamed its header, dropped
// the payouts block's title line and numbered the net payout rows. The captured
// text predates that; these three substitutions are exactly that wave's change,
// applied to the OLD text so this proof still holds character for character.
const v142 = t => {
    let out = t.replace('|🏆 Main Pool — ', '|🏆 Weekly Game — ').replace('|💵 PAYOUTS — hand out in this order', '');
    const a = out.indexOf('|Net Finish|'), b = out.indexOf('|KP|', a);
    if (a > -1 && b > a) {
        const seg = out.slice(a + '|Net Finish|'.length, b).split('|').filter(Boolean);   // name, $amount, name, $amount ...
        const rows = []; for (let i = 0; i + 1 < seg.length; i += 2) rows.push((i / 2 + 1) + ' · ' + seg[i] + '|' + seg[i + 1]);
        out = out.slice(0, a) + '|Net Finish|' + rows.join('|') + out.slice(b);
    }
    return out;
};

describe('THE MONEY DID NOT MOVE — every unscoped section is the pre-change text, on every link', () => {
// SEND RESULTS (2026-09-16): the export button left the summary for #receipt-actions
// on the title row. The capture below still holds it as one cell,
// "|📄 Print / Save Receipt|". That ONE cell is removed from the OLD text before
// comparing - the fixture file is untouched, its sha still pins the capture, and a
// second difference anywhere is still red. sendMove asserts the cell was there.
const sendMove = t => { const n = t.split('|📄 Print / Save Receipt|').length - 1; if (n !== 1) throw new Error('sendMove: expected the old button cell once, found ' + n); return t.replace('|📄 Print / Save Receipt|', '|'); };
    const PREV = JSON.parse(read('results_scope_prev.fixture.json')).links;
    test('the previous capture is pinned, and it was unscoped: the same Side Matches text on every link', () => {
        assert.equal(sha(PREV.bare.summary).slice(0, 8), '0940e7f8');
        assert.equal(sha(PREV.bare.mainPool).slice(0, 8), 'c7a8064b');
        assert.equal(PREV.group1.sideMatches, PREV.bare.sideMatches, 'before: Group 1 was shown every match');
        assert.match(PREV.group1.sideMatches, /Uma vs Vic/, 'including Group 6\'s Nassau');
        assert.match(PREV.bare.summary, /Who Pays Who/); assert.match(PREV.bare.summary, /Player Payouts/);
    });
    [['bare', BARE], ['group1', G1], ['group6', G6], ['group3', G3]].forEach(([k, search]) => {
        test(k + ': Main Pool, Final Results / Player Payouts / Who Pays Who, the scorecard, the other cards - character for character', () => {
            const el = arrive(search);
            // The receipt head (in the summary) and the scorecard print TODAY's date;
            // the fixture holds its capture day. That segment is the one allowed to differ.
            const undate = t => t.replace(/\|[A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}, \d{4}\|/g, '|<date>|');
            assert.equal(strip(el('money-pool-section')), v142(PREV[k].mainPool));
            assert.equal(undate(strip(el('combined-settlement-summary'))), sendMove(undate(PREV[k].summary)));
            assert.equal(undate(strip(el('receipt-scorecard'))), undate(PREV[k].scorecard));
            assert.equal(strip(withoutSideMatches(el('settle-content'))), PREV[k].contentWithoutSideMatches);
            assert.ok(PREV[k].summary.length > 2000 && PREV[k].mainPool.length > 500 && PREV[k].contentWithoutSideMatches.length > 300, 'not vacuous');
            assert.match(PREV[k].summary, /Who Pays Who/);
        });
    });
    test('the bare link\'s Side Matches card is the pre-change text too', () => {
        assert.equal(strip(sideMatchesOnly(arrive(BARE)('settle-content'))), PREV.bare.sideMatches);
    });
});

// ---------------------------------------------------------------------------
describe('SETTLEMENT IS THE FULL RECORD — a transaction from another group is still in Who Pays Who; every total stays traceable', () => {
    // Group 6's match is decided here: Uma birdies hole 2 and wins the Nassau's
    // front nine and total, so Vic owes Uma. Group 1's link must still list it.
    const decided = () => round((r, id) => { r.scores['p' + id(20) + '_h2'] = CD[1].par - 1; });

    test('Group 1\'s Who Pays Who carries Vic -> Uma, a Group 6 transaction, exactly as the bare link does', () => {
        const g1 = strip(arrive(G1, decided())('combined-settlement-summary'));
        const bare = strip(arrive(BARE, decided())('combined-settlement-summary'));
        assert.equal(g1, bare, 'the summary is the full record on every link');
        // Who Pays Who is the simplified debt list, so Vic's loss to Uma is netted
        // against everything else - what must hold is that Group 6's golfers are
        // in Group 1's list at all, as payers or payees, which a scoped list would
        // drop. Vic pays, Uma is paid.
        const wpw = g1.slice(g1.indexOf('Who Pays Who'));
        assert.match(wpw, /\|Vic Victor → /, 'Vic, Group 6, pays on Group 1\'s page: ' + wpw.slice(0, 200));
        assert.match(wpw, / → Uma Uniform\|/, 'Uma, Group 6, is paid on Group 1\'s page');
        assert.doesNotMatch(strip(sideMatchesOnly(arrive(G1, decided())('settle-content'))), /Uma vs Vic/, 'while the CARD for it is Group 6\'s');
    });

    test('every golfer in a match sees that match on their own group\'s link - the money is always traceable', () => {
        const data = decided();
        const groupOf = (() => { const { loadJsFile } = require('./helpers/load-script.js'); const G = loadJsFile('grouping.js'); return JSON.parse(JSON.stringify(G.playerGroupMap(data.players, data.groupSizeOverrides))); })();
        const labels = { g1: 'Ann vs Ben', g6: 'Uma vs Vic', x16: 'Cal vs Wes', g3: 'Ivy vs Jon' };
        const byGroup = {};
        Object.keys(data.sideMatches).forEach(k => {
            const sm = data.sideMatches[k];
            (sm.teamAIds || []).concat(sm.teamBIds || []).forEach(pid => {
                const g = groupOf[String(pid)];
                assert.ok(g, 'every participant maps to a group');
                (byGroup[g] = byGroup[g] || new Set()).add(labels[k]);
            });
        });
        Object.keys(byGroup).forEach(g => {
            const t = strip(sideMatchesOnly(arrive('?game=RSCOPE&group=' + g, data)('settle-content')));
            byGroup[g].forEach(label => assert.match(t, new RegExp(label), 'Group ' + g + ' must see ' + label));
        });
        assert.equal(Object.keys(byGroup).length, 3, 'groups 1, 3 and 6 hold matches');
    });
});

// ---------------------------------------------------------------------------
describe('THE SEAM — the one rule from grouping.js; the money paths untouched', () => {
    test('settlement.html loads grouping.js and filters the Side Matches cards through canLinkSeeWager, once', () => {
        const s = read('settlement.html');
        assert.match(s, /<script src="grouping\.js"><\/script>/);
        const inline = s.replace(/<script src=[^>]*><\/script>/g, '');
        assert.equal((inline.match(/canLinkSeeWager\(/g) || []).length, 1, 'exactly one consumer');
        assert.doesNotMatch(inline, /function canLinkSeeWager|function playerGroupMap/, 'no second copy');
        const fn = s.slice(s.indexOf('function buildSideMatchesHtml('), s.indexOf('\n    function ', s.indexOf('function buildSideMatchesHtml(') + 30));
        assert.match(fn, /canLinkSeeWager\(\(sm\.teamAIds \|\| \[\]\)\.concat\(sm\.teamBIds \|\| \[\]\), lockedGroup, groupOf\)/);
        assert.match(fn, /No matches with a Group \$\{lockedGroup\} golfer in them/);
    });
    test('nothing on the money path reads the group: computeCombinedNetTotals, renderCombinedSummary, the pool section, the scorecard', () => {
        const s = read('settlement.html');
        ['function renderCombinedSummary(', 'function renderMoneyPoolSection(', 'function renderReceiptScorecard(', 'function buildPoolPayoutsHtml('].forEach(start => {
            const at = s.indexOf(start); assert.ok(at > -1, start);
            const fn = s.slice(at, s.indexOf('\n    function ', at + 30));
            assert.ok(fn.length > 100, start + ' found');
            assert.doesNotMatch(fn, /lockedGroup|canLinkSeeWager|playerGroupMap/, start + ' must not scope');
        });
        assert.doesNotMatch(read('settlement-engine.js'), /lockedGroup|canLinkSeeWager/);
    });
    test('the engines were not touched', () => {
        const h = f => sha(read(f)).slice(0, 8);
        assert.equal(h('settlement-engine.js'), '42923121');   // 42923121: computeRoundSettlement appended (trip money, 2026-09-15, approved); no arithmetic changed
        // Wave A fix 1: pool-engine.js re-pinned - net lines now carry {shares}, the array the engine paid a tie from; additive, every figure unchanged (tie_shares_test.js).
        assert.equal(h('pool-engine.js'), 'd47a1e0a');
        assert.equal(h('money-engine.js'), '3c960947');
        assert.equal(h('live-skins.js'), '632bbb1a');
    });
});
