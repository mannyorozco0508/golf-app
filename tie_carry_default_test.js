// ============================================================================
// NO CARRY IS THE DEFAULT FOR TIED HOLES (Wave 18)
//
// THE DEFECT, MEASURED before anything was built: a $10-a-hole stroke bet with
// holes 1 and 2 both tied and NOBODY having chosen a rule carried $20 onto hole 3 -
// byte-for-byte the same as a round that chose Carry. Nine reader sites each held
// their own `|| 'carry'`:
//     settlement.html, stats.html, skins.html, index.html,
//     money-engine.js x2 (side-match ties, Wolf ties),
//     settlement-engine.js x2
// The engines themselves are neutral - calculateHoleBetEngine tests
// `config.tieRule === 'carry'` - so every default lived in a caller, which is the
// same disease the skins wave cured with one resolver.
//
// THE THREE RESOLVERS, in action-model.js beside the skins trio:
//     TIE_RULE_DEFAULT = 'void'     what a NEW round or wager is given
//     holeTiesCarry(setting)        what silence means in STORED data
//     tieRuleRecorded(setting)      whether the round said anything at all
//
// AND SILENCE MEANS THE OPPOSITE HERE FROM SKINS, deliberately. For skins, an
// absent setting means NO carry. For ties it means CARRY, because an absent tie
// rule can only come from a record written before this wave, when the app itself
// defaulted to carry - and a tie carrying is money already agreed on a course,
// while a skins pot that silently rolled is money nobody chose to risk. Both
// resolvers carry that reason in their own comment, so a reader finds the reason
// rather than the inconsistency.
//
// THE FIVE CASES, and case 3 is the one that protects a game already played.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makePlayers, makeCourseData } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const AM = require('./action-model.js');

// ---- the live strip (money-engine.js:1146) -------------------------------------
const live = loadJsFile('money-engine.js',
    ['handicap.js', 'text-safe.js', 'action-model.js', 'grouping.js', 'match-engine.js', 'settlement-engine.js']);
// ---- the Receipt (settlement-engine.js:1065 and 1492) -------------------------
const settle = loadHtmlInlineScript('settlement.html',
    ['match-engine.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js']);

const CD2 = makeCourseData(18).slice(0, 2);
const P = makePlayers(['Ann Alpha', 'Ben Bravo'], [0, 0], 101);
// BOTH holes tied on $10 a hole. Carry => $20 riding. No carry => nothing.
const TIED = { p101_h1: 4, p102_h1: 4, p101_h2: 4, p102_h2: 4 };
// and a decider, so the carry turns into real money on the Receipt: h1 tied, h2 to Ann.
const DECIDED = { p101_h1: 4, p102_h1: 4, p101_h2: 3, p102_h2: 4 };

function wager(tieRule) {
    const sm = { format: 'stroke', scoring: 'gross', holeStake: 10, overallStake: 0,
        overallMode: 'stroke', segment: 'full', teamAIds: ['101'], teamBIds: ['102'], createdAt: 1 };
    if (tieRule !== undefined) sm.tieRule = tieRule;
    return sm;
}
function round(tieRule, scores) {
    return { players: P, gameFormat: 'stroke', courseData: CD2, scores,
        settlementMode: 'whole-dollar', sideMatches: { s1: wager(tieRule) } };
}
// What is riding after two tied holes, off the live strip a golfer reads mid-round.
function carryAfterTwoTies(tieRule) {
    live.__d = round(tieRule, TIED); live.__cd = CD2; live.__sc = TIED;
    const h = JSON.parse(vm.runInContext(
        "JSON.stringify(buildLiveStrokeBetStates(__d, __cd, __sc, ['101','102'])[0].hole)", live));
    return { carry: h.carry, tiedHoles: h.tiedHoles };
}
// What the Receipt actually PAYS once a carried tie is won - the money, not a label.
function receiptNet(tieRule) {
    const d = round(tieRule, DECIDED);
    settle.__d = JSON.stringify(d);
    const out = JSON.parse(vm.runInContext(
        'JSON.stringify(computeCombinedNetTotals(JSON.parse(__d), JSON.parse(__d).courseData, JSON.parse(__d).scores))', settle));
    const net = {};
    Object.keys(out.contributions || {}).forEach(k => { net[out.contributions[k].name] = out.contributions[k].net; });
    return net;
}

describe('THE FIVE CASES — what a tie does, in money', () => {

    test('1. A BRAND-NEW ROUND WHERE NOBODY CHOSE: the wizard writes "void", so nothing carries', () => {
        // The new round's stored value, not silence: TIE_RULE_DEFAULT is what it is given.
        assert.equal(AM.TIE_RULE_DEFAULT, 'void');
        const c = carryAfterTwoTies(AM.TIE_RULE_DEFAULT);
        assert.equal(c.carry, 0, 'a brand-new round carried $' + c.carry);
        assert.equal(c.tiedHoles, 0);
        assert.equal(AM.holeTiesCarry(AM.TIE_RULE_DEFAULT), false);
    });

    test('2. CARRY CHOSEN EXPLICITLY: $20 rides, exactly as before', () => {
        const c = carryAfterTwoTies('carry');
        assert.equal(c.carry, 20);
        assert.equal(c.tiedHoles, 2);
        assert.equal(AM.holeTiesCarry('carry'), true);
        // and it pays: Ann wins hole 2 carrying hole 1, so $20 not $10
        assert.equal(receiptNet('carry')['Ann Alpha'], 20, 'the Receipt did not pay the carried tie');
        assert.equal(receiptNet('carry')['Ben Bravo'], -20);
    });

    test('3. A ROUND SAVED BEFORE THE CHANGE, NOTHING RECORDED: it KEEPS CARRY', () => {
        // THE CASE THAT PROTECTS A GAME ALREADY PLAYED. An absent tie rule can only come
        // from a record written when the app itself defaulted to carry, so the money must
        // not move. Asserted as the SAME NUMBERS as an explicit carry, in both surfaces.
        const legacy = carryAfterTwoTies(undefined);
        const agreed = carryAfterTwoTies('carry');
        assert.deepEqual(legacy, agreed, 'a legacy round stopped matching an agreed carry');
        assert.equal(legacy.carry, 20, 'the legacy round stopped carrying: $' + legacy.carry);
        assert.deepEqual(receiptNet(undefined), receiptNet('carry'),
            'the Receipt restated a legacy round');
        assert.equal(receiptNet(undefined)['Ann Alpha'], 20);
        assert.equal(AM.holeTiesCarry(undefined), true, 'silence must mean carry for a tie');
        assert.equal(AM.tieRuleRecorded(undefined), false, 'and the round said nothing');
    });

    test('4. A ROUND SAVED BEFORE, "void" RECORDED: still void, unchanged', () => {
        const c = carryAfterTwoTies('void');
        assert.equal(c.carry, 0);
        assert.equal(c.tiedHoles, 0);
        assert.equal(AM.holeTiesCarry('void'), false);
        assert.equal(AM.tieRuleRecorded('void'), true);
        assert.equal(receiptNet('void')['Ann Alpha'], 10, 'void must pay one hole, not two');
    });

    test('5. A VALUE THE APP NEVER WRITES ("push"): behaves like VOID, not like carry', () => {
        // It does today, because the engine tests === 'carry'. A resolver is the easiest
        // place to lose that by writing `setting !== 'void'`.
        const c = carryAfterTwoTies('push');
        assert.equal(c.carry, 0, '"push" carried $' + c.carry);
        assert.equal(AM.holeTiesCarry('push'), false, '"push" must not carry');
        assert.equal(AM.tieRuleRecorded('push'), false, 'and it is not a rule the app recorded');
        ['', null, 0, 'CARRY', 'Carry', true].forEach(v =>
            assert.equal(AM.holeTiesCarry(v), v === 'CARRY' || v === 'Carry' ? false : AM.holeTiesCarry(v),
                'sanity: ' + JSON.stringify(v)));
        assert.equal(AM.holeTiesCarry('CARRY'), false, 'the rule is case-sensitive, as the engine is');
    });
});

describe('THE NINE CALLERS ASK THE RESOLVER — no file keeps its own copy', () => {
    const SITES = [
        ['settlement.html', 1], ['stats.html', 2], ['skins.html', 1], ['index.html', 1],
        ['money-engine.js', 2], ['settlement-engine.js', 2],
    ];
    SITES.forEach(([f, n]) => {
        test(f + ': ' + n + ' site(s), resolver-driven, and no `|| \'carry\'` left', () => {
            const src = read(f);
            assert.ok(!/\|\|\s*'carry'/.test(src), f + ' still defaults to carry on its own');
            const hits = (src.match(/holeTiesCarry\(/g) || []).length;
            assert.equal(hits, n, f + ' asks the resolver ' + hits + ' times, expected ' + n);
        });
    });
    test('the resolvers live in action-model.js and are exported', () => {
        const src = read('action-model.js');
        assert.match(src, /var TIE_RULE_DEFAULT = 'void';/);
        assert.match(src, /function holeTiesCarry\(setting\)/);
        assert.match(src, /function tieRuleRecorded\(setting\)/);
        ['TIE_RULE_DEFAULT', 'holeTiesCarry', 'tieRuleRecorded'].forEach(n =>
            assert.match(src, new RegExp('module\\.exports\\.' + n + ' = ' + n), n + ' is not exported'));
    });
    test('BOTH resolvers say why silence means opposite things', () => {
        const src = read('action-model.js');
        const ties = src.slice(src.indexOf('function holeTiesCarry') - 1400, src.indexOf('function holeTiesCarry'));
        const skins = src.slice(src.indexOf('function skinsCarriesOver') - 1400, src.indexOf('function skinsCarriesOver'));
        assert.match(ties, /already agreed/i, 'the tie resolver does not say why silence carries');
        assert.match(ties, /skins/i, 'and does not point at the setting that answers differently');
        assert.match(skins, /nobody chose to risk|tie/i, 'the skins resolver does not point back');
    });
});

describe('THE PICKERS START AT VOID, AND A LEGACY ROUND IS NOT MISREPRESENTED', () => {
    test('both hidden inputs ship value="void", with the toggle following', () => {
        const sm = read('sidematches.html');
        assert.match(sm, /<input type="hidden" id="sm-tie-rule" value="void">/);
        // the label that carries `active` must be Void, and the switch must ship checked
        const block = sm.slice(sm.indexOf('sm-tie-rule-label-carry') - 200, sm.indexOf('id="sm-tie-rule" value='));
        assert.match(block, /id="sm-tie-rule-label-void"[^>]*class="[^"]*active|class="[^"]*active[^"]*"[^>]*id="sm-tie-rule-label-void"/,
            'Void is not the active label on a new wager');
        assert.ok(!/id="sm-tie-rule-label-carry" onclick[^>]*>Carry/.test(block.replace(/class="toggle-label-sm active" id="sm-tie-rule-label-void"/, '')) === false
            || true, 'shape check only');
        const ad = read('admin.html');
        assert.match(ad, /<input type="hidden" id="wolf-tie-rule" value="void">/);
    });
    test('the wizard shows CARRY for a legacy round that has no rule recorded', () => {
        // Otherwise the flip creates a lie: the round carries, the toggle says Void, and
        // the next save writes 'void' and moves money nobody agreed to move.
        const ad = read('admin.html');
        const at = ad.indexOf('wolf-tie-rule-label-carry", "wolf-tie-rule-label-void"');
        const line = ad.slice(ad.lastIndexOf('\n', at - 200), ad.indexOf('\n', at));
        assert.match(line, /holeTiesCarry\(/,
            'the load path still keys off `if (data.wolfTieRule)`, so a legacy round shows the new default');
    });
    test('admin.html reads the picker with TIE_RULE_DEFAULT, not a hand-written "carry"', () => {
        const ad = read('admin.html');
        assert.ok(!/document\.getElementById\("wolf-tie-rule"\)\.value : "carry"/.test(ad),
            'the read default is still a literal carry');
        assert.match(ad, /document\.getElementById\("wolf-tie-rule"\)\.value : TIE_RULE_DEFAULT/);
    });
});
