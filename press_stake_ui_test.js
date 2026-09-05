// ============================================================================
// PRESS STAKE — PRESENTER TRUTH AND THE SCORECARD AMOUNT PICKER
//
// Two golfer-facing problems from the Marty's Monday audit.
//
// 1. THE PRESENTER LIED ABOUT MIXED STAKES. calculateMatchEngine stores each
//    press's own amount on its segment, and settlement has always read it. But
//    bet-strip.js's matchChip() resolved every chip from the ROUND's base stake,
//    so a $20/$20/$50/$100 ladder reported "$20" four times - on the collapsed
//    chip, in the expanded detail, and on the AT STAKE line. The money was right;
//    the screen was wrong.
//
// 2. A MATCH-PLAY PRESS HAD NO AMOUNT. The scorecard's press panel offered a
//    single START PRESS button and confirmMatchPress() wrote {baseId, startHole}
//    with no stake, so "press it for fifty" could only be done from the Matches
//    tab.
//
// LEGACY IS THE CONSTRAINT THAT SHAPES THE FIX. Auto presses never store an
// amount, and neither does any press created before the picker existed. Those
// must keep resolving to the parent stake to the cent, so the resolution is
// "the segment's own stake WHEN IT HAS ONE", never an unconditional read.
//
// Nothing here changes match arithmetic, handicap allocation, start holes,
// auto-press triggering or settlement.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('index.html');
const STRIP_SRC = read('bet-strip.js');
const plain = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
// Code only - a rule must never be "proven" by a comment that mentions it.
const codeOf = src => src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const STRIP_CODE = codeOf(STRIP_SRC);
const RS_CODE = codeOf(SRC.slice(SRC.indexOf('function renderBetStrip')));

const E = loadJsFile('money-engine.js');

// A realm holding the real presenter plus the engines it calls.
function stripRealm() {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN,
                 parseInt, parseFloat, Date, Set, Map };
    vm.createContext(sb);
    ['handicap.js','money-engine.js','action-model.js','settlement-engine.js','pool-engine.js','bet-strip.js']
        .forEach(f => vm.runInContext(read(f), sb, { filename: f }));
    return sb;
}
const REALM = stripRealm();
const buildStrip = (d, holes, scores) => plain(vm.runInContext('buildBetStrip', REALM)(d, holes, scores));

const HOLES = Array.from({ length: 18 }, (_, i) => ({ hole: i+1, par: 4, hcpIndex: i+1 }));
const MANNY = { id:1, name:'Manny', hcp:'3',  team:'Team 1', playingForMoney:true };
const MARTY = { id:2, name:'Marty', hcp:'10', team:'Team 2', playingForMoney:true };
const PL = [MANNY, MARTY];
const G = { 1:[4,5,4,3,5,4,5,4,4,4,4,6,3,4,5,5,3,4], 2:[5,5,4,4,4,5,6,3,5,4,4,5,4,4,5,6,3,5] };
const SC = (() => { const s={}; PL.forEach(p=>HOLES.forEach((h,i)=>{s['p'+p.id+'_h'+h.hole]=G[p.id][i];})); return s; })();
const MIXED = { a:{baseId:'18',startHole:5,stake:20}, b:{baseId:'18',startHole:9,stake:50}, c:{baseId:'18',startHole:13,stake:100} };
const round = presses => ({ gameFormat:'match', matchScoring:'net', matchStake:20,
    matchPressRule:'none', players:PL, matchPresses:presses });
const chipsOf = presses => buildStrip(round(presses), HOLES, SC).chips;
const chipBy = (chips, short) => chips.find(c => c.short === short);

// ============================================================================
describe('THE ENGINE WAS ALWAYS RIGHT', () => {

    test('each segment carries its own stake', () => {
        const calc = plain(E.calculateMatchEngine(PL, HOLES, SC, 'net', 'match', 'none', 20, 0, Object.values(MIXED)));
        const byStart = {}; calc.activeMatches.forEach(m => { byStart[m.startHole] = m; });
        assert.equal(byStart[1].stake, undefined, 'the base wager stores no stake of its own');
        assert.equal(byStart[5].stake, 20);
        assert.equal(byStart[9].stake, 50);
        assert.equal(byStart[13].stake, 100);
    });

    test('and settlement already used them', () => {
        const res = E.computeRoundMoneyByPlayer(round(MIXED), HOLES, SC);
        const sum = res.players.reduce((a,p) => a + p.net, 0);
        assert.ok(Math.abs(sum) < 1e-9, 'zero-sum');
        const manny = res.players.find(p => p.name === 'Manny').net;
        assert.equal(manny, 150, '-20 +20 +50 +100');
        assert.notEqual(manny, 40, 'the all-at-$20 answer must not be reachable');
    });
});

// ============================================================================
describe('PRESENTER RESOLVES THE SEGMENT STAKE', () => {

    test('the collapsed chip carries each wager\u2019s own amount', () => {
        const c = chipsOf(MIXED);
        assert.equal(chipBy(c,'Main Bet').stake, 20);
        assert.equal(chipBy(c,'Press #1').stake, 20);
        assert.equal(chipBy(c,'Press #2').stake, 50, 'the $50 press must not read $20');
        assert.equal(chipBy(c,'Press #3').stake, 100);
    });

    test('THE COLLAPSED CHIP CARRIES THE START HOLE', () => {
        const c = chipsOf(MIXED);
        assert.equal(chipBy(c,'Press #1').startHole, 5);
        assert.equal(chipBy(c,'Press #2').startHole, 9);
        assert.equal(chipBy(c,'Press #3').startHole, 13);
        assert.equal(chipBy(c,'Main Bet').startHole, 1);
    });

    test('the expanded detail uses the same resolved amount', () => {
        const c = chipsOf(MIXED);
        assert.equal(chipBy(c,'Press #2').detail.stake, 50);
        assert.equal(chipBy(c,'Press #3').detail.stake, 100);
        assert.match(chipBy(c,'Press #2').detail.rangeText, /Started Hole 9/);
        assert.match(chipBy(c,'Press #3').detail.rangeText, /Started Hole 13/);
    });

    test('THE MONEY LINE USES THE RESOLVED AMOUNT', () => {
        const c = chipsOf(MIXED);
        // Every segment is final on this card, so the money line reads "+$X".
        assert.match(chipBy(c,'Press #2').detail.moneyLine, /\$50/);
        assert.match(chipBy(c,'Press #3').detail.moneyLine, /\$100/);
        assert.ok(!/\$20/.test(chipBy(c,'Press #2').detail.moneyLine), 'the base stake must not leak in');
        assert.ok(!/\$20/.test(chipBy(c,'Press #3').detail.moneyLine));
    });

    test('the LIVE "AT STAKE" line uses the resolved amount', () => {
        // Score only through hole 10 so the later presses are still live.
        const partial = {}; PL.forEach(p => HOLES.slice(0,10).forEach((h,i) => { partial['p'+p.id+'_h'+h.hole] = G[p.id][i]; }));
        const c = buildStrip(round(MIXED), HOLES, partial).chips;
        const p2 = chipBy(c,'Press #2');
        assert.equal(p2.detail.live, true, 'Press #2 must still be live for this to mean anything');
        assert.match(p2.detail.moneyLine, /\$50 AT STAKE/);
        assert.ok(!/\$20 AT STAKE/.test(p2.detail.moneyLine));
    });

    test('NO SURFACE falls back to the base stake for a custom press', () => {
        const c = chipsOf(MIXED);
        [['Press #2', 50], ['Press #3', 100]].forEach(([short, amt]) => {
            const chip = chipBy(c, short);
            assert.equal(chip.stake, amt, short + ' collapsed');
            assert.equal(chip.detail.stake, amt, short + ' detail');
            assert.match(chip.detail.moneyLine, new RegExp('\\$' + amt), short + ' moneyLine');
        });
    });

    test('the resolution is explicit in the source, not incidental', () => {
        assert.match(STRIP_CODE, /const segStake = \(m\.stake === undefined \|\| m\.stake === null\) \? stake : Number\(m\.stake\);/);
        assert.match(STRIP_CODE, /const chipStake = holeBet > 0 \? Math\.abs\(m\.status \* holeBet\) : segStake;/);
        assert.ok(!/: `\$\$\{stake\} AT STAKE`/.test(STRIP_CODE), 'the base-stake AT STAKE line must be gone');
    });
});

// ============================================================================
describe('LEGACY PRESSES WITH NO STORED STAKE', () => {

    const LEGACY = { a:{baseId:'18',startHole:5}, b:{baseId:'18',startHole:9,stake:50} };

    test('a press with no stake resolves to the parent amount', () => {
        const c = chipsOf(LEGACY);
        assert.equal(chipBy(c,'Press #1').stake, 20, 'no stored stake -> the round stake');
        assert.equal(chipBy(c,'Press #1').detail.stake, 20);
        assert.match(chipBy(c,'Press #1').detail.moneyLine, /\$20/);
    });

    test('a null stake is treated the same as a missing one', () => {
        const c = chipsOf({ a:{baseId:'18',startHole:5,stake:null} });
        assert.equal(chipBy(c,'Press #1').stake, 20);
    });

    test('legacy and custom presses coexist on one ladder', () => {
        const c = chipsOf(LEGACY);
        assert.equal(chipBy(c,'Press #1').stake, 20);
        assert.equal(chipBy(c,'Press #2').stake, 50);
    });

    test('AUTO PRESSES store no stake and still inherit', () => {
        const calc = plain(E.calculateMatchEngine(PL, HOLES, SC, 'net', 'match', '2down', 20, 0, []));
        const autos = calc.activeMatches.filter(m => m.pressNum > 0);
        assert.ok(autos.length > 0, 'the auto rule must actually have fired');
        autos.forEach(m => assert.equal(m.stake, undefined, 'an auto press stores no amount'));
        const d = { gameFormat:'match', matchScoring:'net', matchStake:20, matchPressRule:'2down', players:PL };
        const c = buildStrip(d, HOLES, SC).chips;
        c.forEach(chip => assert.equal(chip.stake, 20, 'every auto segment presents the round stake'));
    });
});

// ============================================================================
describe('THE COLLAPSED LADDER ROW', () => {

    test('renderBetStrip prints the amount and, for presses, the start hole', () => {
        assert.match(RS_CODE, /const amt = \(c\.stake > 0\) \? '\$' \+ c\.stake : '';/);
        assert.match(RS_CODE, /const from = \(c\.isPress && c\.startHole\) \? 'H' \+ c\.startHole : '';/);
        assert.match(RS_CODE, /<span class="bc-meta">/);
    });

    test('the main bet shows an amount but no start hole', () => {
        // isPress is false for a base segment, so `from` is empty by construction.
        const c = chipsOf(MIXED);
        assert.equal(chipBy(c,'Main Bet').isPress, false);
        assert.equal(chipBy(c,'Press #2').isPress, true);
    });

    test('the status text is untouched - no projected winnings', () => {
        const c = chipsOf(MIXED);
        assert.match(chipBy(c,'Main Bet').statusText, /Marty 2&1/);
        assert.ok(!/AT STAKE|\+\$/.test(chipBy(c,'Main Bet').statusText),
            'the chip status is match state, never money');
    });

    test('the meta line is visually subordinate', () => {
        const css = SRC.slice(SRC.indexOf('.bc-meta {'), SRC.indexOf('.bc-meta {') + 260);
        assert.match(css, /font-size: 0\.6rem/);
        assert.match(css, /white-space: nowrap/, 'it must not wrap and stretch the chip row');
        assert.ok(!/position: absolute/.test(css));
    });
});

// ============================================================================
describe('THE SCORECARD PRESS AMOUNT PICKER', () => {

    const PANEL = SRC.slice(SRC.indexOf('function buildPressPanelHtml'), SRC.indexOf('function openPressPanel'));
    const PANEL_CODE = codeOf(PANEL);
    const CONFIRM = SRC.slice(SRC.indexOf('function confirmMatchPressCustom'), SRC.indexOf('// ---- Group scorekeeper links'));

    test('the match panel offers amounts built from the parent stake', () => {
        assert.match(PANEL_CODE, /const mBase = model\.currentStake \|\| 0;/);
        assert.match(PANEL_CODE, /mPresets\.push\(\{ label: 'Same \$' \+ mBase, amt: mBase \}\)/);
        assert.match(PANEL_CODE, /\[50, 100\]\.forEach\(v => \{ if \(v !== mBase\) mPresets\.push/,
            'no duplicate button when the base already IS $50 or $100');
        assert.match(PANEL_CODE, /confirmMatchPressCustom\(\)/);
        assert.ok(!/onclick="confirmMatchPress\(\)"[\s\S]*onclick="confirmMatchPress\(\)"/.test(PANEL),
            'the old amount-less single button must not remain for stake matches');
    });

    test('SAME AS PARENT IS THE DEFAULT - the first and primary button', () => {
        assert.match(PANEL_CODE, /\(i === 0 \? ' primary' : ''\)/);
        // The Same button is pushed first, so index 0 is always the parent stake.
        const i = PANEL_CODE.indexOf("'Same $'");
        const j = PANEL_CODE.indexOf('[50, 100]');
        assert.ok(i > 0 && j > i, 'the parent amount is offered before any preset');
    });

    test('a hole-bet match keeps its amount-less panel', () => {
        assert.match(PANEL_CODE, /if \(model\.stakeIsPerHole\) \{/);
        // The amount is interpolated, so the literal in source is "'/hole." not "$/hole".
        assert.match(PANEL_CODE, /model\.currentStake \+ '\/hole\./, 'it still explains the per-hole rate');
        assert.ok(!/mPresetHtml/.test(PANEL_CODE.slice(PANEL_CODE.indexOf('if (model.stakeIsPerHole) {'),
            PANEL_CODE.indexOf('const mBase'))), 'the per-hole branch offers no dollar buttons');
    });

    test('confirmMatchPress persists the chosen amount', () => {
        assert.match(CONFIRM, /const payload = \{ baseId: model\.pressBaseId, startHole: model\.nextPressHole \};/);
        assert.match(CONFIRM, /if \(stake !== undefined && stake !== null && isFinite\(amt\) && amt > 0\) payload\.stake = amt;/);
        assert.match(CONFIRM, /\.set\(payload\)/);
    });

    test('an omitted amount writes NO stake key, preserving legacy settlement', () => {
        assert.ok(!/payload\.stake = amt \|\| /.test(CONFIRM));
        assert.ok(!/stake: stake \|\| model\.currentStake/.test(CONFIRM),
            'it must not silently substitute the parent amount into the record');
    });

    test('invalid custom input is rejected, never coerced', () => {
        assert.match(CONFIRM, /if \(isNaN\(amt\) \|\| amt <= 0\) \{ alert\('Enter a dollar amount above 0\.'\); return; \}/);
        assert.ok(!/parseFloat\(el\.value\) \|\| /.test(CONFIRM), 'no silent fallback for a blank field');
    });

    test('ONLY THE NEW PRESS IS WRITTEN', () => {
        const writes = CONFIRM.split('\n').filter(l => /db\.ref\(/.test(l));
        assert.equal(writes.length, 2, 'the push key, and the new press record');
        writes.forEach(l => assert.match(l, /matchPresses/, 'nothing outside matchPresses: ' + l.trim()));
        assert.ok(!/matchStake/.test(CONFIRM), 'the parent stake is never rewritten');
    });

    test('the picker does not touch the start hole', () => {
        assert.match(CONFIRM, /startHole: model\.nextPressHole/);
        assert.ok(!/startHole: \w+ [+-]/.test(CONFIRM), 'no arithmetic on the start hole');
        assert.ok(!/nextPressHole =/.test(CONFIRM));
    });
});

// ============================================================================
describe('NOTHING ELSE MOVED', () => {

    test('canPress and nextPressHole are unchanged in the presenter', () => {
        assert.match(STRIP_CODE, /const pressableBase = bases\.find\(m => !m\.closed && nextPressHole > m\.startHole && nextPressHole <= m\.endHole\);/);
        assert.match(STRIP_CODE, /const canPress = !!pressableBase && !alreadyPressedHere && nextPressHole <= finalHole;/);
        assert.match(STRIP_CODE, /const nextPressHole = lastPlayed \+ 1;/);
    });

    test('currentStake still reports the PARENT amount for the Same button', () => {
        assert.match(STRIP_CODE, /currentStake: holeBet > 0 \? holeBet : stake,/);
        const c = buildStrip(round(MIXED), HOLES, SC);
        assert.equal(c.currentStake, 20, 'a $100 press must not become the new default');
    });

    test('handicap allocation is unchanged and inherited by every press', () => {
        const calc = plain(E.calculateMatchEngine(PL, HOLES, SC, 'net', 'match', 'none', 20, 0, Object.values(MIXED)));
        assert.equal(calc.matchBaseline, 3);
        assert.deepEqual(calc.relHcpById, { '1':0, '2':7 });
        const noPress = plain(E.calculateMatchEngine(PL, HOLES, SC, 'net', 'match', 'none', 20, 0, []));
        assert.deepEqual(calc.relHcpById, noPress.relHcpById, 'presses change no allocation');
    });

    test('start-hole semantics are unchanged', () => {
        [[9,9],[10,10],[18,18]].forEach(([req, got]) => {
            const c = plain(E.calculateMatchEngine(PL, HOLES, SC, 'net','match','none',20,0,
                [{baseId:'18',startHole:req,stake:50}]));
            const p = c.activeMatches.find(m => m.pressNum > 0);
            assert.equal(p.startHole, got, 'requested H' + req);
        });
        const late = plain(E.calculateMatchEngine(PL, HOLES, SC, 'net','match','none',20,0,
            [{baseId:'18',startHole:19,stake:50}]));
        assert.equal(late.activeMatches.filter(m => m.pressNum > 0).length, 0, 'H19 creates nothing');
    });

    test('AUTO-PRESS TRIGGERING IS UNCHANGED', () => {
        const auto = plain(E.calculateMatchEngine(PL, HOLES, SC, 'net','match','2down',20,0,[]));
        assert.equal(auto.pressCount, 3, 'the cascading ladder this card produces');
        assert.equal(auto.activeMatches[0].triggers, 1, 'each wager spawns at most one child');
        const gross = plain(E.calculateMatchEngine(PL, HOLES, SC, 'gross','match','2down',20,0,[]));
        assert.ok(gross.pressCount >= 0, 'gross path still runs');
        // No cap, no original-only mode was introduced.
        assert.ok(!/pressCap|originalOnly|maxPresses/.test(read('money-engine.js')));
    });

    test('score correction still recomputes cleanly', () => {
        const fixed = Object.assign({}, SC); fixed['p2_h7'] = 4;
        const before = plain(E.calculateMatchEngine(PL, HOLES, SC, 'net','match','none',20,0,Object.values(MIXED)));
        const after = plain(E.calculateMatchEngine(PL, HOLES, fixed, 'net','match','none',20,0,Object.values(MIXED)));
        assert.notEqual(before.holeLog[7].holeWinner, after.holeLog[7].holeWinner);
        const c = buildStrip(round(MIXED), HOLES, fixed).chips;
        assert.equal(chipBy(c,'Press #2').stake, 50, 'stakes survive a correction');
    });

    test('settlement output is not changed by the presenter fix', () => {
        const res = E.computeRoundMoneyByPlayer(round(MIXED), HOLES, SC);
        assert.equal(res.players.find(p => p.name === 'Manny').net, 150);
        assert.equal(res.players.find(p => p.name === 'Marty').net, -150);
    });

    test('bet-strip.js changed ONLY the match chip stake resolution', () => {
        // The stroke-play chip builder and the side-bet rows are untouched.
        assert.match(STRIP_CODE, /strokeChip\('MAIN', 'Main Bet', set\.original, stake, firstHole\);/);
        assert.match(STRIP_CODE, /set\.pressResults\.forEach\(pr => strokeChip\(`P\$\{pr\.pressNum\}`, `Press #\$\{pr\.pressNum\}`, pr, pr\.stake, pr\.startHole\)\);/);
        assert.ok(!/segStake/.test(STRIP_CODE.slice(0, STRIP_CODE.indexOf('function matchChip'))),
            'the resolution exists only inside matchChip');
    });
});

// ============================================================================
describe('SERVICE WORKER', () => {

    const sw = read('sw.js');

    test('CACHE_VERSION moved to v11', () => {
        assert.match(sw, /const CACHE_VERSION = 'golfapp-v45-no-native-print';/);
        assert.ok(!/const CACHE_VERSION = 'golfapp-v12-course-grid';/.test(sw));
    });

    test('the shell file list did NOT change', () => {
        const raw = sw.slice(sw.indexOf('const SHELL_FILES'), sw.indexOf(']', sw.indexOf('const SHELL_FILES')));
        const entries = raw.split('\n').map(l => l.trim())
            .filter(l => /^'\.\/[^']+',?$/.test(l)).map(l => l.replace(/^'|',?$/g, ''));
        // 33 since logo-mark.png joined the shell for the homepage brand mark.
        // 34 since native-export.js joined the shell: settlement.html and trip.html
        // call it unguarded from their Print / Save buttons, so a cached shell without
        // it would restore exactly the dead button that file was added to fix.
        assert.equal(entries.length, 34);
        assert.ok(entries.indexOf('./bet-strip.js') !== -1, 'bet-strip.js is precached and must stay so');
    });

    test('the fetch strategy is unchanged', () => {
        assert.match(sw, /Network-first: always prefer the latest deployed version/);
    });
});
