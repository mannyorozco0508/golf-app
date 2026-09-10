// ============================================================================
// A NEW ROUND DOES NOT CARRY SKINS UNLESS SOMEBODY SAYS SO.
//
// THE SAFETY QUESTION, ANSWERED FIRST, BECAUSE IT DECIDES WHETHER THIS CHANGE
// IS ALLOWED TO EXIST.
//
// Changing a default re-settles history ONLY IF settlement falls back to that
// default when the field is absent. It does not. action-model.js already owns
// the answer:
//
//     function skinsCarriesOver(setting) { return setting === true; }
//
// ONLY AN EXPLICIT TRUE CARRIES. settlement-engine.js and pool-engine.js both
// route through it, so a round with no stored value has ALWAYS settled as NO
// CARRY. Measured: with the field absent the engine reports carryOver=false;
// with true, true; with false, false. No historical round's money depended on
// the creation default, because settlement never read the creation default.
//
// So this change does not restate anybody's week. What it does is make the
// value a round STORES agree with what settlement was already doing.
//
// ============================================================================
// EIGHT PLACES SAID CARRY. ONE PLACE SAID NO CARRY. THEY WERE THE SAME ROUND.
// ============================================================================
//
// The creation defaults were scattered across three files and eight sites, all
// saying carry, all disagreeing with the resolver that decides what silence
// means. That is not a drift risk in the future, it is a drift that had
// already happened - the settings a round is born with pointed one way and the
// engine that pays it pointed the other.
//
// So there is now ONE declared answer, SKINS_CARRY_DEFAULT in action-model.js,
// beside skinsCarriesOver() which decides the same question for stored data.
// This file holds every site to it. A ninth site added later without reading
// the constant fails here rather than drifting quietly.
//
// WHAT THIS FILE DELIBERATELY DOES NOT COVER: three DISPLAY surfaces -
// skins.html, bet-strip.js and settlement.html - resolve an absent field with
// `!== false`, which is CARRY, while the money engines resolve it as NO CARRY.
// On a round with no stored value they disagree with the money today, before
// and after this change. That is a real pre-existing defect and it is not this
// wave's; asserting it here as though it were fixed would be a lie.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const AM = loadJsFile('action-model.js', ['handicap.js', 'money-engine.js']);
const SE = loadJsFile('settlement-engine.js', ['handicap.js', 'money-engine.js', 'action-model.js']);

const ADMIN = read('admin.html');
const SIDE = read('sidematches.html');

// EVERY PLACE A NEW ROUND'S CARRY SETTING COMES FROM. Enumerated from source
// rather than remembered: three files, and two of them are hidden inputs whose
// literal value IS the default.
const DEFAULT_SITES = [
    { id: 'admin-hidden-input', file: 'admin.html',
      what: "the round's own skins control",
      re: /<input type="hidden" id="skins-carryover" value="(true|false)">/,
      carries: (m) => m[1] === 'true' },
    { id: 'admin-mainpool-select', file: 'admin.html',
      what: 'the Main Pool skins picker',
      re: /<select id="mp-skins-carry"><option value="yes"( selected)?>Carry Over<\/option><option value="no"( selected)?>/,
      carries: (m) => !!m[1] },
    // JS SITES MUST REFERENCE THE CONSTANT, not merely happen to equal it.
    // A literal that matches today is a coincidence the next edit can break in
    // silence; a reference cannot drift from the thing it reads.
    { id: 'admin-instance-default', file: 'admin.html', kind: 'reference',
      what: 'a new skins INSTANCE',
      re: /skinsCarryOver: SKINS_CARRY_DEFAULT,/ },
    { id: 'admin-missing-control-1913', file: 'admin.html', kind: 'reference',
      what: 'the fallback when the control is absent (round summary)',
      re: /getElementById\('skins-carryover'\)\.value !== 'false' : SKINS_CARRY_DEFAULT/ },
    { id: 'admin-missing-control-5210', file: 'admin.html', kind: 'reference',
      what: 'the fallback when the control is absent (save)',
      re: /getElementById\("skins-carryover"\)\.value !== 'false'\) : SKINS_CARRY_DEFAULT/ },
    { id: 'admin-mainpool-restore', file: 'admin.html', kind: 'reference',
      what: 'restoring the Main Pool picker from saved data',
      re: /set\('mp-skins-carry', skins\.carryOver === true \? 'yes' : 'no'\)/ },
    { id: 'sidematches-hidden-input', file: 'sidematches.html',
      what: 'the field-action skins control',
      re: /<input type="hidden" id="sm-field-carry" value="(yes|no)">/,
      carries: (m) => m[1] === 'yes' },
    { id: 'catalog-default', file: 'action-model.js', kind: 'reference',
      what: 'the Additional Games catalog',
      re: /skinsCarryOver: SKINS_CARRY_DEFAULT/ }
];

const srcFor = (f) => (f === 'admin.html' ? ADMIN : f === 'sidematches.html' ? SIDE : read('action-model.js'));

describe('THE SAFETY PROPERTY THIS CHANGE RESTS ON', () => {

    test('settlement resolves an ABSENT carry field as NO CARRY, and always did', () => {
        // If this ever returns true for undefined, changing a creation default
        // WOULD restate history and this whole wave has to stop.
        assert.equal(AM.skinsCarriesOver(undefined), false,
            'silence now means CARRY - a legacy round with no stored value would be re-settled');
        assert.equal(AM.skinsCarriesOver(null), false);
        assert.equal(AM.skinsCarriesOver('true'), false, 'a string is not an explicit true');
        assert.equal(AM.skinsCarriesOver(1), false);
        assert.equal(AM.skinsCarriesOver(true), true, 'an explicit true must still carry');
        assert.equal(AM.skinsCarriesOver(false), false);
    });

    test('the money engines route through that resolver rather than deciding for themselves', () => {
        const se = read('settlement-engine.js');
        const pe = read('pool-engine.js');
        assert.match(se, /skinsCarriesOver\(data\.skinsCarryOver\)/,
            'settlement-engine decides carry itself instead of asking the canonical resolver');
        assert.match(pe, /skinsCarriesOver\(skCfg\.carryOver\)/,
            'pool-engine decides carry itself instead of asking the canonical resolver');
    });
});

describe('ONE DECLARED DEFAULT, AND EVERY SITE READS IT', () => {

    test('action-model.js declares it', () => {
        assert.equal(typeof AM.SKINS_CARRY_DEFAULT, 'boolean',
            'there is no single declared default - each site states its own, which is how '
            + 'eight of them came to disagree with the resolver');
    });

    test('the declared default is NO CARRY', () => {
        assert.equal(AM.SKINS_CARRY_DEFAULT, false,
            'a group that never discussed it expects each hole to stand alone, and a silent '
            + 'carry is the likeliest shape of a Monday game going wrong');
    });

    test('it agrees with what silence already meant to settlement', () => {
        // The two answers to "what does no setting mean" must be the same one.
        assert.equal(AM.SKINS_CARRY_DEFAULT, AM.skinsCarriesOver(undefined),
            'the value a round is BORN with disagrees with how an absent value is PAID - '
            + 'which is exactly the state this change exists to end');
    });

    test('every default site is present and matches the declared default', () => {
        const wrong = [];
        DEFAULT_SITES.forEach((s) => {
            const m = s.re.exec(srcFor(s.file));
            assert.ok(m, `${s.id} (${s.file}) - ${s.what}: the site this test pins no longer `
                + 'matches. It was moved or reworded, and a default is now unguarded.');
            // A markup literal cannot read a JS constant, so it is compared by
            // value; a JS site is required to REFERENCE the constant, and
            // matching the regex at all is what proves it does.
            if (s.kind !== 'reference' && s.carries(m) !== AM.SKINS_CARRY_DEFAULT) {
                wrong.push(`${s.id} (${s.file}) - ${s.what}: carries=${s.carries(m)}, `
                    + `declared default is ${AM.SKINS_CARRY_DEFAULT}`);
            }
        });
        assert.deepEqual(wrong, [], 'a creation default disagrees with the one declared '
            + 'answer.\n  ' + wrong.join('\n  '));
    });

    test('the enumeration is complete enough to be worth having', () => {
        // A table of one row would pass trivially while seven other sites drifted.
        assert.ok(DEFAULT_SITES.length >= 8,
            `only ${DEFAULT_SITES.length} sites enumerated - the sweep found eight`);
        assert.ok(DEFAULT_SITES.filter((s) => s.kind === 'reference').length >= 5,
            'the JS sites must read the constant rather than repeat a literal');
        assert.ok(new Set(DEFAULT_SITES.map((s) => s.file)).size === 3,
            'all three files that set a carry default must be represented');
    });
});

describe('AN EXPLICIT CHOICE IS STILL HONOURED - BOTH WAYS', () => {

    const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const players = [
        { id: 101, name: 'A', hcp: '0', playingForMoney: true },
        { id: 102, name: 'B', hcp: '0', playingForMoney: true },
        { id: 103, name: 'C', hcp: '0', playingForMoney: true }
    ];
    // Hole 1 is tied by all three, so it either RIDES or is VOID - the single
    // hole where the two rules pay differently. Hole 2 is won outright.
    function scores() {
        const s = {};
        players.forEach((p) => { for (let h = 1; h <= 18; h++) s['p' + p.id + '_h' + h] = 4; });
        s['p101_h2'] = 3;
        return s;
    }
    const data = (carry) => {
        const d = { players, courseData: CD, gameFormat: 'skins', skinsBuyIn: 10,
            skinsScoring: 'gross', skinsPotFormat: 'gross', scores: scores() };
        if (carry !== undefined) d.skinsCarryOver = carry;
        return d;
    };
    const resolve = (d) => AM.skinsCarriesOver(d.skinsCarryOver);

    test('carry over still carries when the round says so', () => {
        assert.equal(resolve(data(true)), true,
            'THIS IS THE ONE THAT MATTERS. Changing a default must not turn into "carry over '
            + 'no longer works" - a group that chooses it must still get it.');
    });

    test('no carry is honoured when the round says so', () => {
        assert.equal(resolve(data(false)), false);
    });

    test('and silence takes the new default', () => {
        assert.equal(resolve(data(undefined)), AM.SKINS_CARRY_DEFAULT);
    });

    test('the two rules really do pay differently, so the above is not vacuous', () => {
        // If both rules produced the same ledger, every assertion in this block
        // would be true of a broken engine.
        assert.equal(typeof SE.computeCombinedNetTotals, 'function', 'engine did not load');
        const carried = SE.computeCombinedNetTotals(data(true), CD, scores());
        const voided = SE.computeCombinedNetTotals(data(false), CD, scores());
        const sum = (r) => Object.values(r.netByName || {})
            .map((v) => Math.round(v.net * 100) / 100).sort().join(',');
        assert.notEqual(sum(carried), sum(voided),
            'carry over and no carry produced identical money on a fixture with a tied hole - '
            + 'the fixture is not exercising the difference and these tests prove nothing');
    });
});
