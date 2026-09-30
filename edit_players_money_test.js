// ============================================================================
// THE PLAYERS SHEET SAYS WHAT A CHANGE DOES TO THE MONEY, IN NUMBERS
//
// RECON FIRST, AND IT CHANGED THE JOB. The brief was "build editing players from
// inside the scorecard - name, handicap, flight, add a 5th, drop a no-show - and
// show what each change does to the money before saving". THE EDITING ALREADY
// EXISTS: the Players sheet (index.html, v195) is organizer-only behind
// canReachSetup, has a row per golfer under group headers with name / HCP / A-B /
// Out, "+ Add golfer" under each group, group moves, a warnings line and a
// re-read-guarded single write. Building a second one would have been the defect
// CLAUDE.md warns about - two entry points for one job.
//
// WHAT WAS ACTUALLY MISSING was the money. The line read
//
//     "Pot $320 -> $360"  and then  "Scores are in - net finish and skins will
//                                    recompute."
//
// A promise instead of a figure, on the one screen where an organizer is about to
// change who pays what. MEASURED with pool-engine.js on an eight-golfer $40 round,
// $100 KP, $70 Net Finish, remainder skins:
//
//     add a 9th golfer   pot $320 -> $360   SKINS $150 -> $190   $16.67 -> $21.11 a skin
//     mark one Out       pot $320 -> $280   SKINS $150 -> $110   $16.67 -> $12.22 a skin
//     Net Finish and KP  UNCHANGED in both
//
// The whole headcount change lands on SKINS, because KP and Net Finish are fixed
// dollar amounts here and skins is the remainder bucket that absorbs the rest. So
// the number the old line did not print is the only one that moved - and the
// per-skin value is what a group actually counts on the 18th.
//
// ONLY WHAT MOVES IS SHOWN. A figure repeated unchanged is noise on a phone and it
// hides the one that changed. Net Finish and KP appear when they differ, which they
// do on a pool configured as shares rather than fixed amounts.
//
// NOTHING IS COMPUTED IN THE PAGE. Every figure is computeMoneyPool run twice - on
// the round as it stands, and on the round as the draft would leave it. pool-engine
// .js is PROTECTED and is untouched: this wave reads it.
//
// THE RED BASELINE, measured against main f3fec3d, all 10 tests:
//
//     5 PASS / 5 FAIL
//
// THE FIVE THAT PASS WITHOUT THE WAVE are the recon plus two properties that were
// already true, and every one is asserted so it cannot rot: the sheet exists, it is
// organizer-only with Add and Out, Out keeps the golfer and only takes them out of
// the money, the pot figure was already right, and "no change" already said the pot
// and nothing else. They are the reason this file is small - the editing was built
// in v195 and what was missing was the money.
//
// (I wrote 4 PASS here before running it. The fifth is "NO CHANGE says the pot and
// nothing else", which held on the old line too because its promise only appended
// when a figure moved.)
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const src = read('index.html');
const DEPS = ['handicap.js', 'match-engine.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js'];

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: [3, 7, 12, 16].indexOf(i) >= 0 ? 3 : 4, hcpIndex: i });
const NAMES = ['Ann', 'Bob', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal'];
const EIGHT = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: String((i * 3) % 18), playingForMoney: true }));
const SCORES = {};
EIGHT.forEach((p, i) => CD.forEach(h => { SCORES['p' + p.id + '_h' + h.hole] = 4 + ((i + h.hole) % 3) - 1; }));
const round = (players, extra) => Object.assign({
    eventName: 'Money preview', gameFormat: 'stroke', players: players, courseData: CD,
    scores: SCORES, settlementMode: 'whole-dollar',
    moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7, 12, 16] },
                 net: { amount: 70, places: [57.142857, 42.857143] },
                 skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
    kpWinners: { h3: '101', h7: '102', h12: '103', h16: '104' }, kpConfirmed: { confirmed: true }
}, extra || {});
const ADDED = EIGHT.concat([{ id: 109, name: 'Ike', hcp: '10', playingForMoney: true }]);
const OUT = EIGHT.map((p, i) => i === 7 ? Object.assign({}, p, { playingForMoney: false, out: true }) : p);

const page = () => loadHtmlInlineScript('index.html', DEPS);
const say = (before, after) => page().playersSheetMoney(round(before), round(after));

describe('the Players sheet prices a roster change before it is saved', () => {

    // ---- the recon, asserted so it cannot rot ---------------------------

    test('RECON the sheet already exists, organizer only, with Add and Out', () => {
        assert.match(src, /<div class="modal-overlay" id="players-sheet"/, 'the sheet');
        assert.match(src, /function openPlayersSheet\(\)/);
        assert.match(src, /canReachSetup\(\)/, 'organizer only');
        const body = src.slice(src.indexOf('function renderPlayersSheet'), src.indexOf('function collectPlayersSheet'));
        assert.match(body, /Add golfer/, 'a 5th golfer can be added');
        assert.match(body, /ps-out-box/, 'and a no-show marked Out');
        assert.match(body, /ps-hcp|hcp/, 'handicap is editable');
        assert.match(body, /ps-flt|flight/i, 'and the flight');
    });

    test('RECON "Out" keeps the golfer and takes them out of the MONEY', () => {
        // Not a delete: their scores stay, and playingForMoney is what the engines read.
        const upd = src.slice(src.indexOf('function buildPlayersUpdate'), src.indexOf('function playersSheetMoney'));
        // THE OUT BRANCH ITSELF, not the whole function. buildPlayersUpdate does splice
        // the roster - three times - but for GROUP MOVES and for inserting an added
        // golfer, never for Out. My first draft banned splice across the function and
        // went red on the feature next door, which is what reading the slice fixes.
        const outBranch = upd.slice(upd.indexOf('const wasOut = p.out === true;'), upd.indexOf('} else if (!e.out && wasOut)'));
        assert.match(outBranch, /playingForMoney'\] = false/, 'out of the money');
        assert.match(outBranch, /\/out'\] = true/, 'and marked out');
        assert.ok(!/splice|scores/.test(outBranch),
            'Out must not touch the roster array or a single score: ' + outBranch.slice(0, 120));
        // And it warns when the golfer being dropped is holding KP money.
        assert.match(outBranch, /leads KP on/, 'a no-show who leads a KP has to be re-recorded');
    });

    test('RECON the pot figure was already right, and still is', () => {
        assert.match(say(EIGHT, ADDED), /Pot \$320 → \$360/);
        assert.match(say(EIGHT, OUT), /Pot \$320 → \$280/);
    });

    test('RECON nothing here computes money: it is computeMoneyPool, twice', () => {
        const fn = src.slice(src.indexOf('function playersSheetMoney'), src.indexOf('function psRefreshMoney'));
        assert.equal((fn.match(/computeMoneyPool\(/g) || []).length, 1, 'one call site, used for both sides');
        assert.match(fn, /typeof computeMoneyPool !== 'function'/, 'and it fails silent without the engine');
        ['amountCents', 'totalUnits', 'totalPoolCents'].forEach(f =>
            assert.ok(fn.includes(f), 'it reads the engine field ' + f));
        assert.ok(!/buyIn \*|\* 100|\/ 100 \*/.test(fn), 'no arithmetic of its own on the pot');
    });

    // ---- what this wave adds --------------------------------------------

    test('ADDING A GOLFER prices the skins bucket AND the per-skin value', () => {
        const line = say(EIGHT, ADDED);
        assert.match(line, /Skins \$150 → \$190/, 'the bucket the headcount actually moves');
        assert.match(line, /\$16\.67 → \$21\.11 a skin/, 'and what a group counts on the 18th');
    });

    test('MARKING A NO-SHOW OUT prices it the other way', () => {
        const line = say(EIGHT, OUT);
        assert.match(line, /Skins \$150 → \$110/);
        assert.match(line, /\$16\.67 → \$12\.22 a skin/);
    });

    test('ONLY WHAT MOVES IS SHOWN - and on this engine Net Finish and KP never move', () => {
        const line = say(EIGHT, ADDED);
        assert.ok(!/Net Finish/.test(line), 'a repeated figure hides the one that changed');
        assert.ok(!/KP \$/.test(line), 'same for KP');
        // MEASURED, AND WORTH STATING RATHER THAN IMPLYING: kp.amount and net.amount are
        // FIXED DOLLAR FIGURES in the pool config, so no roster change can move them.
        // Skins is the remainder bucket and absorbs the whole headcount change. My first
        // draft of this test built a "control" pool meant to make Net Finish move; it
        // produced an INVALID pool (kp + net under-spending a $320 pot with skins off)
        // and the line came back empty - a control that proved nothing. Deleted rather
        // than kept as decoration.
        const b = round(EIGHT), a = round(ADDED);
        assert.equal(b.moneyPool.net.amount, a.moneyPool.net.amount, 'net is a fixed amount');
        assert.equal(b.moneyPool.kp.amount, a.moneyPool.kp.amount, 'and so is KP');
    });

    test('CONTROL the label DOES appear when a figure moves - proved on the display itself', () => {
        // The display logic, not a roster change: two rounds whose pools differ in the
        // Net Finish amount. If `moved()` ever stopped printing, the test above would
        // pass for the wrong reason and this one goes red.
        const b = round(EIGHT);
        const a = JSON.parse(JSON.stringify(round(EIGHT)));
        a.moneyPool.net.amount = 90;
        const line = page().playersSheetMoney(b, a);
        assert.match(line, /Net Finish \$70 → \$90/, 'got: ' + JSON.stringify(line));
    });

    test('NO CHANGE says the pot and nothing else - no arrow, no promise', () => {
        const line = say(EIGHT, EIGHT);
        assert.equal(line, 'Pot $320', 'exactly this: ' + JSON.stringify(line));
        assert.ok(!/→/.test(line));
        assert.ok(!/recompute/.test(line), 'nothing recomputes when nothing moved');
    });

    test('THE PROMISE IS GONE, and what is left of it is narrow and true', () => {
        // The old line said "net finish and skins will recompute" - which was the
        // whole defect: it named the two things it was not going to tell you. The
        // buckets are now exact; what genuinely cannot be previewed is WHO wins.
        assert.ok(!/will recompute/.test(src), 'the old sentence is gone from the page');
        const line = say(EIGHT, ADDED);
        assert.match(line, /Who wins each skin and who places recompute on save\./);
        // And it only appears once scores exist AND something moved.
        const blank = round(EIGHT, { scores: {} });
        const blankAdd = round(ADDED, { scores: {} });
        assert.ok(!/recompute/.test(page().playersSheetMoney(blank, blankAdd)),
            'a round nobody has played has no winners to recompute');
    });
});
