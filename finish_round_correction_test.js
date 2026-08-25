// ============================================================================
// FINISH ROUND — WAVE B: SCORE VERIFICATION
//
// WHAT WAVE A FIXED, AND WHY IT WAS NOT ENOUGH
//
// Wave A made the modal open and stopped it fabricating totals for unfinished
// rounds. It then said "All 12 golfers have a complete card" - which only ever
// meant eighteen numbers exist. It did not mean anyone had checked them against
// the paper. In today's real round the app held a 7 on Rocco's eighteenth hole,
// his card says DNF, and the modal called that complete.
//
// Wave B turns the screen into a verification step: every golfer opens to all
// eighteen holes, a wrong score is corrected through the ONE canonical write
// path, and the consequence is reported before anyone is paid.
//
// THE RULE THIS FILE PROTECTS
//
//   No money is calculated in the presenter. Impact comes from a canonical
//   settlement SNAPSHOT taken before the correction and another after it, then
//   diffed. Both come from computeCombinedNetTotals() and computeMoneyPool().
//
// A stale-money test is only meaningful if the fixture can actually go stale, so
// the corrections below are chosen to move a real skin and a real Net Finish
// place, and the tests assert the OLD winner is gone rather than only that the
// new one appeared.
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
const plain = (v) => JSON.parse(JSON.stringify(v));
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// Talking Stick Piipaash, and today's actual field.
const PAR = [4,5,4,4,4,3,4,3,4, 4,3,4,4,4,4,3,5,4];
const IDX = [15,13,1,3,11,5,9,17,7, 12,6,2,16,8,14,18,4,10];
const FIELD = [
  ['Marty', 9,[5,5,4,4,4,3,5,3,5, 4,4,3,5,5,4,4,7,6]],
  ['Scott', 7,[4,4,5,5,7,4,4,3,5, 5,3,6,4,5,4,4,4,7]],
  ['Carp',  2,[3,5,3,4,5,3,5,2,5, 4,4,3,4,4,5,3,6,4]],
  ['Randy', 9,[5,9,4,4,4,6,6,2,6, 6,4,6,4,5,4,3,7,7]],
  ['Manny', 0,[4,5,4,4,4,3,5,3,4, 5,3,4,3,4,5,3,5,4]],
  ['Matt B',8,[5,7,5,4,6,3,5,2,5, 5,4,4,6,5,6,3,6,5]],
  ['Lance', 3,[4,5,4,4,4,3,5,3,4, 5,3,5,4,4,5,2,6,5]],
  ['Kopp',  6,[5,6,5,5,5,3,5,3,5, 4,4,4,5,6,4,3,4,6]],
  ['Marcus',9,[4,6,5,5,4,3,5,4,5, 4,3,4,5,4,5,3,4,5]],
  ['Rocco',13,[5,8,5,5,4,3,6,3,8, 5,6,5,5,5,6,7,10,7]],
  ['Matt H',12,[6,10,4,6,5,4,5,4,5, 4,5,4,5,5,5,3,5,9]],
  ['Jeremy',12,[7,5,4,4,6,3,5,5,5, 4,4,6,6,5,6,3,7,7]],
];

// group: which ?group= link is held. null = plain link.
function boot({ group = 1, drop = null, pool = true } = {}) {
    const sb = loadHtmlInlineScript(PAGE, DEPS);
    const cd = PAR.map((p,i) => ({ hole:i+1, par:p, hcpIndex:IDX[i] }));
    const ps = FIELD.map(([name,hcp], i) => ({ id:101+i, name, hcp:String(hcp), playingForMoney:true }));
    const sc = {};
    FIELD.forEach(([name,,g], i) => g.forEach((v, hi) => {
        if (drop && drop.name === name && drop.hole === hi+1) return;
        sc['p'+(101+i)+'_h'+(hi+1)] = v;
    }));
    const gm = {}; ps.forEach((p,i) => { gm[String(p.id)] = Math.floor(i/4)+1; });

    const data = { players: ps, courseData: cd, scores: sc, gameFormat: 'stroke',
                   settlementMode: 'whole-dollar', kpWinners: {} };
    if (pool) data.moneyPool = { enabled: true, buyIn: 40,
        kp: { amount: 100, holes: [3,7,12,16] },
        net: { amount: 70, places: [57.142857, 42.857143] },
        skins: { mode: 'remainder', scoring: 'net', carryOver: false } };

    vm.runInContext(`
        currentMode = 'ABCD';
        currentData = ${JSON.stringify(data)};
        window.__scPlayerGroupMap = ${JSON.stringify(gm)};
        window.__scFilteredPlayers = currentData.players.slice(0, 4);
        hasGroupLock = ${group !== null}; lockedGroup = ${group === null ? 'null' : group};
        // db is a const bound to the harness firebase stub - reassigning it throws
        // "Assignment to constant variable". saveScore's Firebase call is already
        // absorbed by that stub; what the UI re-reads is currentData.scores, which
        // saveScore updates locally.
        openFinishRoundModal();
    `, sb);

    const idOf = n => 101 + FIELD.findIndex(f => f[0] === n);
    return {
        sb, idOf,
        run: c => vm.runInContext(c, sb),
        review: () => sb.document.getElementById('fr-player-list').innerHTML,
        detail: () => sb.document.getElementById('fr-detail-holes').innerHTML,
        impact: () => sb.document.getElementById('fr-detail-impact').innerHTML,
        money:  () => sb.document.getElementById('fr-final-money').innerHTML,
        pays:   () => sb.document.getElementById('fr-who-pays-who').innerHTML,
        shown:  id => sb.document.getElementById(id).style.display !== 'none',
        open:   n => vm.runInContext('frOpenPlayer(' + idOf(n) + ');', sb),
        correct: (n, hole, val) => vm.runInContext(
            'frCorrectScore(' + idOf(n) + ',' + hole + ',"' + val + '");', sb),
    };
}

// ============================================================================

describe('THE REVIEW STATE LEADS', () => {

    test('the modal opens on review, not on money', () => {
        const b = boot();
        assert.equal(b.shown('fr-state-review'), true);
        assert.equal(b.shown('fr-state-results'), false, 'money must not be the first thing shown');
        assert.equal(b.shown('fr-state-detail'), false);
    });

    test('all 12 golfers across 3 groups are reviewable', () => {
        const t = strip(boot().review());
        FIELD.forEach(([n]) => assert.ok(t.includes(n), `${n} missing from review`));
        ['Group 1','Group 2','Group 3'].forEach(g => assert.ok(t.includes(g), `${g} missing`));
    });

    test('every row offers a way in', () => {
        const html = boot().review();
        assert.equal((html.match(/frOpenPlayer\(/g) || []).length, 12);
        assert.match(strip(html), /Review \u203A/);
    });

    test('both exits exist, and money is reachable either way', () => {
        const src = read(PAGE);
        assert.match(src, /frShowResults\(true\)/,  'confirm path');
        assert.match(src, /frShowResults\(false\)/, 'skip path');
        const b = boot();
        b.run('frShowResults(false);');
        assert.equal(b.shown('fr-state-results'), true);
    });
});

describe('EIGHTEEN HOLES, WRITTEN OUT', () => {

    test('a golfer opens to all 18 holes', () => {
        const b = boot(); b.open('Marty');
        const t = strip(b.detail());
        for (let i = 1; i <= 18; i++) assert.ok(t.includes('Hole ' + i), `Hole ${i} missing`);
    });

    test('labels are full words, never H1', () => {
        const b = boot(); b.open('Marty');
        const t = strip(b.detail());
        assert.ok(!/\bH1\b|\bH13\b/.test(t), 'this screen is read beside a paper card');
        assert.match(t, /Hole 13/);
    });

    test('OUT, IN, GROSS and NET agree with canonical scoring', () => {
        const b = boot(); b.open('Marcus');
        const t = strip(b.detail());
        const canon = b.run(`computePlayerRoundTotals(
            currentData.players.find(function(p){return p.name==='Marcus';}),
            currentData.courseData, currentData.scores)`);
        assert.equal(canon.gross, 78);
        assert.equal(canon.net, 69);
        assert.match(t, /OUT 41/);
        assert.match(t, /IN 37/);
        assert.match(t, /GROSS 78/);
        assert.match(t, /NET 69/);
    });

    test('an absent score reads as missing, and the round stays incomplete', () => {
        const b = boot({ drop: { name: 'Rocco', hole: 18 } });
        b.open('Rocco');
        const t = strip(b.detail());
        assert.match(t, /Hole 18 par 4 no score/);
        assert.match(t, /Incomplete \u2014 17 of 18 holes/);
        assert.ok(!/NET 90/.test(t), 'no fabricated final net');
    });

    test('ROCCO TODAY: hole 18 is exposed so the app can be compared with the card', () => {
        // The app holds a 7; the physical card says DNF. The point of the screen is
        // that an organizer can SEE that number and act on it.
        // Rocco is in Group 3, so his card is only editable from that group's link -
        // reviewing from Group 1 shows the number but will not offer an input, which
        // is the write-isolation rule working, not a bug.
        const readOnly = boot({ group: 1 }); readOnly.open('Rocco');
        assert.match(strip(readOnly.detail()), /Hole 18/);
        assert.match(strip(readOnly.detail()), /Hole 18 par 4 7/, 'the stored 7 must be visible');

        const editable = boot({ group: 3 }); editable.open('Rocco');
        assert.match(editable.detail(), /value="7"/, 'and correctable from its own group');
    });
});

describe('CORRECTIONS GO THROUGH THE CANONICAL PATH', () => {

    test('frCorrectScore calls saveScore and nothing else', () => {
        const src = read(PAGE);
        const at = src.indexOf('function frCorrectScore');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /saveScore\(playerId, hole, raw\)/);
        ['db.ref', '.set(', '.remove(', '.update('].forEach(t =>
            assert.ok(!fn.includes(t), `corrections must not write directly; found ${t}`));
    });

    test('a correction updates gross and net immediately', () => {
        const b = boot(); b.open('Marty');
        const before = b.run(`computePlayerRoundTotals(currentData.players[0], currentData.courseData, currentData.scores)`);
        b.correct('Marty', 1, 7);       // was 5
        const after = b.run(`computePlayerRoundTotals(currentData.players[0], currentData.courseData, currentData.scores)`);
        assert.equal(after.gross, before.gross + 2);
        assert.equal(after.net, before.net + 2);
        assert.match(strip(b.detail()), new RegExp('GROSS ' + after.gross));
    });

    test('the impact panel names the hole and the change', () => {
        const b = boot(); b.open('Marty');
        b.correct('Marty', 1, 7);
        const t = strip(b.impact());
        assert.match(t, /Score corrected/);
        assert.match(t, /Marty \u00B7 Hole 1: 5 \u2192 7/);
    });

    test('a correction that changes nothing says so', () => {
        const b = boot(); b.open('Randy');
        b.correct('Randy', 2, 10);       // Randy is nowhere near a skin or a place
        const t = strip(b.impact());
        assert.match(t, /Skins: no change/);
        assert.match(t, /Net Finish: no change/);
    });
});

describe('A CORRECTION THAT MOVES REAL MONEY', () => {

    // Hole 14: Marcus wins outright with net 3. Take that away and the skin must
    // move or vanish - and the OLD result must not survive anywhere.
    test('losing a skin removes the old winner, not just adds a new one', () => {
        // Marcus is in Group 3, so the correction has to come from that group's link.
        // Booting Group 1 here silently exercised the write-isolation rule instead.
        const b = boot({ group: 3 });
        const skinsBefore = b.run(`(function(){
            var p = computeMoneyPool(currentData, currentData.courseData, currentData.scores);
            return p.skins.lines.map(function(l){ return l.hole + ':' + l.winnerName; });
        })()`);
        assert.ok(plain(skinsBefore).includes('14:Marcus'), 'fixture must start with the Marcus skin');

        b.open('Marcus');
        b.correct('Marcus', 14, 7);      // was 4

        const skinsAfter = b.run(`(function(){
            var p = computeMoneyPool(currentData, currentData.courseData, currentData.scores);
            return p.skins.lines.map(function(l){ return l.hole + ':' + l.winnerName; });
        })()`);
        assert.ok(!plain(skinsAfter).includes('14:Marcus'),
            'STALE: Marcus still holds the hole 14 skin after losing it');
        assert.match(strip(b.impact()), /Hole 14 skin/);
    });

    test('the money panel re-renders from the corrected scores', () => {
        const b = boot({ group: 3 });
        b.open('Marcus');
        b.correct('Marcus', 14, 7);
        b.run('frShowResults(true);');
        const shown = strip(b.money());
        const canon = b.run(`(function(){
            var c = computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores);
            return Object.values(c.netByName).map(function(v){ return v.name + '|' + v.net; });
        })()`);
        plain(canon).forEach(row => {
            const [name, net] = row.split('|');
            const amt = Math.abs(Number(net));
            assert.ok(shown.includes(name), `${name} missing from Final Money`);
            if (amt > 0) assert.ok(shown.includes('$' + amt),
                `${name}'s corrected figure $${amt} not shown`);
        });
    });

    test('Net Finish moves when the leader is corrected', () => {
        const b = boot({ group: 3 });
        const placeBefore = b.run(`(function(){
            var p = computeMoneyPool(currentData, currentData.courseData, currentData.scores);
            return p.net.lines.map(function(l){ return l.place + ':' + l.names.join('/'); });
        })()`);
        assert.ok(plain(placeBefore).some(x => /1:Marcus/.test(x)), 'Marcus starts 1st');

        b.open('Marcus');
        b.correct('Marcus', 2, 12);      // blow him well down the field
        const placeAfter = b.run(`(function(){
            var p = computeMoneyPool(currentData, currentData.courseData, currentData.scores);
            return p.net.lines.map(function(l){ return l.place + ':' + l.names.join('/'); });
        })()`);
        assert.ok(!plain(placeAfter).some(x => /1:Marcus/.test(x)),
            'STALE: Marcus is still 1st after a six-shot correction');
        assert.match(strip(b.impact()), /Net Finish/);
    });

    test('Who Pays Who re-renders and still reconstructs every balance', () => {
        const b = boot({ group: 3 });
        b.open('Marcus');
        b.correct('Marcus', 14, 7);
        b.run('frShowResults(true);');
        const c = b.run(`computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)`);
        const shown = strip(b.pays());
        const moved = {};
        plain(c.transactions).forEach(t => {
            moved[t.from] = (moved[t.from] || 0) - t.amount;
            moved[t.to] = (moved[t.to] || 0) + t.amount;
            assert.ok(shown.includes(t.from) && shown.includes(t.to),
                `${t.from} \u2192 ${t.to} missing from Who Pays Who`);
        });
        Object.values(plain(c.netByName)).forEach(v => {
            assert.equal(v.net, moved[v.name] || 0, `${v.name}: transactions do not reconstruct the ledger`);
        });
    });

    // These two exist because sabotaging the snapshot's Net Finish and Final Money
    // capture left the suite green. The tests above proved the ENGINE moved; nothing
    // proved the organizer was TOLD. A silent impact panel is exactly the failure
    // this feature is meant to prevent, so it is asserted directly.
    test('the impact panel REPORTS the Net Finish change, not just the engine', () => {
        const b = boot({ group: 3 });
        b.open('Marcus');
        b.correct('Marcus', 2, 12);
        const t = strip(b.impact());
        assert.match(t, /Net Finish: Marcus/,
            'the organizer must be told the leader moved');
        assert.ok(!/Net Finish: no change/.test(t),
            'reporting "no change" after the leader fell out is worse than silence');
    });

    test('the impact panel REPORTS the money change', () => {
        const b = boot({ group: 3 });
        b.open('Marcus');
        b.correct('Marcus', 14, 7);
        const t = strip(b.impact());
        assert.match(t, /Final money/);
        assert.match(t, /Marcus: /, 'the affected golfer must be named with old and new');
        assert.ok(!/Final money: no change/.test(t),
            'a lost skin moves money and must say so');
    });

    test('whole-dollar invariants survive a correction', () => {
        const b = boot({ group: 3 });
        b.open('Marcus');
        b.correct('Marcus', 14, 7);
        const c = b.run(`computeCombinedNetTotals(currentData, currentData.courseData, currentData.scores)`);
        const vals = Object.values(plain(c.netByName));
        assert.equal(vals.reduce((a,v) => a + v.net, 0), 0, 'round must stay zero-sum');
        vals.forEach(v => assert.equal(v.net, Math.round(v.net), `${v.name} settled on cents`));
    });
});

describe('WRITE ISOLATION IS NOT WIDENED', () => {

    test('another group opens read-only, and says why', () => {
        const b = boot({ group: 1 });
        b.open('Manny');   // Manny is Group 2; the link held is Group 1
        const t = strip(b.sb.document.getElementById('fr-detail-note').innerHTML);
        assert.match(t, /Read-only/);
        assert.ok(!/fr-hole-input/.test(b.detail()), 'no editable inputs outside the locked group');
    });

    test('own group is editable', () => {
        const b = boot({ group: 1 });
        b.open('Marty');
        assert.match(b.detail(), /fr-hole-input/);
    });

    test('a refused correction changes nothing and reports nothing', () => {
        const b = boot({ group: 1 });
        const before = b.run(`currentData.scores['p105_h1']`);   // Manny, Group 2
        b.open('Manny');
        b.correct('Manny', 1, 9);
        assert.equal(b.run(`currentData.scores['p105_h1']`), before, 'a blocked write must not land');
        assert.equal(strip(b.impact()).trim(), '', 'nothing may be reported as changed');
    });

    test('canWritePlayer and saveScore are untouched', () => {
        const src = read(PAGE);
        assert.match(src, /if \(!canWritePlayer\(playerId\)\) return rejectCrossGroupWrite\(playerId\);/);
        const at = src.indexOf('function canWritePlayer');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /return String\(grp\) === String\(lockedGroup\);/);
    });
});

describe('OPENING REVIEW IS NOT VERIFYING', () => {

    test('merely opening the modal does not mark the round reviewed', () => {
        const b = boot();
        assert.equal(b.run('frReviewCompleted'), false);
    });

    test('skipping does not mark it reviewed', () => {
        const b = boot();
        b.run('frShowResults(false);');
        assert.equal(b.run('frReviewCompleted'), false);
    });

    test('confirming does', () => {
        const b = boot();
        b.run('frShowResults(true);');
        assert.equal(b.run('frReviewCompleted'), true);
    });

    test('nothing is persisted to the round - that is Wave C', () => {
        const src = read(PAGE);
        assert.ok(!/scoresVerified/.test(src),
            'persistent verification state belongs to Wave C, not here');
    });
});

describe('NO SECOND PAYOUT ENGINE IN THE PRESENTER', () => {

    const block = () => {
        const src = read(PAGE);
        const a = src.indexOf('// ---- WAVE B: SCORE VERIFICATION');
        const b = src.indexOf('function jumpToMissingHole');
        return src.slice(a, b);
    };

    test('impact is measured by diffing canonical snapshots', () => {
        const fn = block();
        assert.match(fn, /computeCombinedNetTotals\(/);
        assert.match(fn, /computeMoneyPool\(/);
        assert.match(fn, /function frSnapshot/);
    });

    test('it allocates no money of its own', () => {
        const fn = block();
        ['allocateWholeDollars(', 'splitCentsEvenly(', 'simplifyDebts(',
         'computeSkinsVoidForSettle(', 'computeSkinsCarryOverForSettle('].forEach(t =>
            assert.ok(!fn.includes(t), `presenter must not settle money; found ${t}`));
    });

    test('it does no handicap arithmetic', () => {
        const fn = block();
        assert.ok(!/getStrokes\(/.test(fn), 'no second handicap allocator');
        assert.ok(!/parseHcp\(/.test(fn), 'no second handicap parser');
        assert.match(fn, /computePlayerRoundTotals\(/, 'totals must come from the canonical helper');
    });

    test('the detail view derives its totals canonically', () => {
        const src = read(PAGE);
        const at = src.indexOf('function renderFinishRoundDetail');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /computePlayerRoundTotals\(/);
        assert.ok(!/getStrokes\(/.test(fn), 'the detail view must not allocate strokes itself');
    });
});
