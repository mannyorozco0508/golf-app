// ============================================================================
// THE HANDICAP MODE, AND EXACTLY WHICH MONEY IT MOVES
//
// MANNY'S DECISION: his group's handicaps are STROKES as typed. "Jimmy 11" is eleven
// strokes, not a GHIN Index to be converted by the tee.
//
// AND THE FIRST THING TO SAY IS THAT THE APP ALREADY DOES THAT, which is why this
// wave is a guard file and three labels rather than a feature. Measured on main
// 976f9af before anything was written:
//
//   admin.html:1347      a <select id="handicap-basis-select"> with as-entered and
//                        ghin-index, and AS-ENTERED CARRIES THE `selected` ATTRIBUTE
//   admin.html:~9590     basisForSave falls back to 'as-entered' when the control is
//                        absent, so a new round is stamped strokes either way
//   admin.html:~9616     on 'as-entered' the save writes hcp = the typed number and
//                        NO handicapIndex and NO courseHandicap - nothing downstream
//                        can claim an Index the round does not have
//   handicap-labels.js   handicapBasisOf() reads an ABSENT field as 'ghin-index',
//                        which is what every round saved before the setting existed
//                        already meant
//
// So the brief's premise - "today the app treats a typed number as a GHIN Index" - is
// true of LEGACY rounds and false of new ones, and that distinction is the whole
// safety property this file pins.
//
// WHAT THIS FILE PROVES, in the order it matters:
//   1. THE MODE IS THE ONLY THING THAT MOVES THE MONEY. The same typed numbers, the
//      same scores, the same tee: strokes mode and GHIN mode differ by exactly the
//      conversion and by nothing else.
//   2. A LEGACY ROUND IS BYTE-IDENTICAL. A record with no handicapBasis takes the
//      GHIN path, and its net standings and its Net Finish dollars are pinned by
//      sha256 so a later wave cannot move an old round's money by accident.
//   3. THE CONTROL: with the flag the only difference, flipping it moves the money -
//      and with the tee UNRATED it moves nothing, because there is nothing to convert.
//
// WHERE THE ARITHMETIC LIVES, AND WHAT THIS WAVE DID NOT TOUCH. Every number here
// comes from the protected engines, called and never copied: handicap.js
// (convertHandicapIndex, playerHandicapFields, sanitizeHandicapIndex, getStrokes,
// parseHcp), money-engine.js (computeNetToParStandings) and pool-engine.js
// (computeMoneyPool). NO PROTECTED FILE WAS EDITED by this wave - the mode gate was
// already at the call site in admin.html, and the three label changes are in
// handicap-labels.js, which exists as a separate file precisely because handicap.js
// is off-limits. That answers the brief's question: the per-file approval for
// handicap.js was offered and is not needed.
//
// WHAT THIS FILE CANNOT PROVE. It does not open a browser, so it says nothing about
// whether the toggle is reachable or legible - the label tests below read source and
// the DOM, never geometry. And it proves the SAVE's two shapes, not that Firebase
// accepted them.
//
// THE BASELINE, all 20 tests, against main 976f9af in a clean worktree - before the
// label changes, with every money property already true:
//
//     15 PASS / 5 FAIL
//
// FIFTEEN GREEN IS THE POINT OF THIS FILE, not a weakness in it: the money behaviour
// it pins was already correct, and a guard that only went green after its own wave
// would prove nothing about the rounds Manny has already played. Every one of the
// five reds is a LABEL - the setup box said "Index" on a strokes round (which is the
// default), the toggle read "As entered", the Players sheet read "HCP", nothing
// repainted the rows when the toggle moved, and there was no shared builder to ask.
// Not one money assertion was red, and that is the headline of this wave.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadJsFile, loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

// The engines, in one realm, exactly as a page loads them.
const E = loadJsFile('pool-engine.js', ['handicap.js', 'money-engine.js']);
const H = {
    convertHandicapIndex: E.convertHandicapIndex,
    playerHandicapFields: E.playerHandicapFields,
    sanitizeHandicapIndex: E.sanitizeHandicapIndex,
    computeNetToParStandings: E.computeNetToParStandings,
    computeMoneyPool: E.computeMoneyPool,
    getStrokes: E.getStrokes,
    parseHcp: E.parseHcp
};

// A RATED TEE and an 18-hole card. Slope 131 and a rating 0.4 over par are chosen so
// the conversion is unmistakable: it moves 11 to 13, not 11 to 11.
const TEE = { teeName: 'Blue', slope: '131', courseRating: '72.4', par: '72', allowance: '100' };
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

const TYPED = [
    { id: 101, name: 'Jimmy', typed: '11' },
    { id: 102, name: 'Marty', typed: '4' },
    { id: 103, name: 'Reese', typed: '18' },
    { id: 104, name: 'Dee', typed: '0' }
];

// THE SAVE'S OWN RULE, both arms, copied from admin.html rather than invented - the
// test below asserts the source still reads this way, so the copy cannot rot
// silently. as-entered: hcp is the typed number, and no Index or Course Handicap is
// written. ghin-index: handicap.js's one builder decides everything.
function playersFor(basis, tee) {
    return TYPED.map(p => {
        if (basis === 'as-entered') {
            return { id: p.id, name: p.name, hcp: H.sanitizeHandicapIndex(p.typed), playingForMoney: true };
        }
        const f = H.playerHandicapFields(p.typed, null, tee || null);
        const out = { id: p.id, name: p.name, hcp: f.hcp, playingForMoney: true };
        if (f.handicapIndex) out.handicapIndex = f.handicapIndex;
        if (typeof f.courseHandicap === 'number') out.courseHandicap = f.courseHandicap;
        if (f.handicapUnconverted) out.handicapUnconverted = true;
        return out;
    });
}

// Gross scores: a real card, the SAME for both modes, so only the strokes differ.
//
// AND THE CARD IS CHOSEN SO THE MODE CHANGES WHO GETS PAID, which took measuring
// rather than guessing. My first fixture moved every golfer's net by the conversion
// and paid exactly the same money both ways, because the ORDER did not change - a
// true result, and a useless demonstration. Dee plays off scratch and goes four
// under; Marty off 4 lands on the same net as her in strokes mode. So:
//   strokes mode   Dee 68, Marty 68   -> a TIE for first, $40 each
//   GHIN mode      Marty 67, Dee 68   -> Marty first $56, Dee second $24
// The mode is worth $16 to Marty and costs Dee $16, on one round, from one field.
const GROSS = { 101: 5, 102: 4, 103: 6, 104: 4 };
const SCORES = (() => {
    const s = {};
    TYPED.forEach(p => { for (let h = 1; h <= 18; h++) s['p' + p.id + '_h' + h] = GROSS[p.id]; });
    for (let h = 1; h <= 4; h++) s['p104_h' + h] = 3;   // Dee: four birdies, 68 gross
    return s;
})();

function roundOf(basis, opts) {
    const o = opts || {};
    const data = {
        eventName: 'Thursday', gameFormat: 'stroke', courseData: CD,
        players: playersFor(basis === 'legacy' ? 'ghin-index' : basis, o.tee === undefined ? TEE : o.tee),
        scores: SCORES,
        teeRating: o.tee === undefined ? TEE : o.tee,
        // A Net Finish pot, so there are real dollars to compare and not only
        // strokes. The shape is the one kp_settlement_test.js and
        // skins_even_split_test.js already use - net.amount with places, no KP
        // money, skins off - so this fixture cannot be the odd one out.
        moneyPool: {
            enabled: true, buyIn: 40,
            kp: { amount: 0, holes: [] },
            // $40 x 4 golfers is a $160 pot, and the whole pot must be
            // allocated or the pool refuses to compute - measured: "$60 of the pot
            // is unallocated". So net takes all of it.
            net: { amount: 160, places: [60, 40] },
            skins: { mode: 'none' }
        }
    };
    if (basis !== 'legacy') data.handicapBasis = basis;
    return data;
}
const netRows = data => H.computeNetToParStandings(data.players, data.courseData, data.scores, { basis: 'net' })
    .map(r => ({ name: r.name, gross: r.gross, net: r.net, toPar: r.toPar }));

// ===========================================================================
describe('1. WHAT WAS ALREADY TRUE ON MAIN', () => {

    test('the toggle exists, is saved on the round, and STROKES is the default', () => {
        const src = read('admin.html');
        assert.match(src, /<select id="handicap-basis-select"/, 'the control is gone');
        assert.match(src, /<option value="as-entered" selected>/, 'strokes must be the default for a NEW round');
        assert.match(src, /handicapBasis: basisForSave/, 'the mode must be written onto the round');
        assert.match(src, /return \(el && el\.value === 'ghin-index'\) \? 'ghin-index' : 'as-entered';/,
            'and an absent control on a NEW round must mean strokes');
    });

    test('an ABSENT field on an old round still means GHIN - no retro money change', () => {
        const L = loadJsFile('handicap-labels.js');
        assert.equal(L.handicapBasisOf({}), 'ghin-index');
        assert.equal(L.handicapBasisOf({ handicapBasis: undefined }), 'ghin-index');
        assert.equal(L.handicapBasisOf(null), 'ghin-index');
        assert.equal(L.handicapBasisOf({ handicapBasis: 'as-entered' }), 'as-entered');
        assert.equal(L.handicapBasisOf({ handicapBasis: 'nonsense' }), 'ghin-index',
            'an unknown value must fail to the old meaning, never to the new one');
    });

    test('the SAVE writes no Index and no Course Handicap in strokes mode', () => {
        // The thing that makes the mode safe: nothing downstream can claim an Index
        // the round does not have, because the field is simply not there.
        const strokes = roundOf('as-entered').players;
        strokes.forEach(p => {
            assert.ok(!('handicapIndex' in p), p.name + ' carries an Index on a strokes round');
            assert.ok(!('courseHandicap' in p), p.name + ' carries a Course Handicap on a strokes round');
        });
        assert.deepEqual(strokes.map(p => p.hcp), ['11', '4', '18', '0'], 'the typed numbers, untouched');
        const src = read('admin.html');
        assert.match(src, /const hcpFields = \(basisForSave === 'as-entered'\)/,
            'the save still branches on the mode exactly here');
    });

    test('My Groups stores the number AS TYPED, and the mode is per round', () => {
        const mg = read('my-groups.js');
        assert.match(mg, /hcp/, 'a member carries a handicap');
        assert.ok(!/handicapBasis/.test(mg), 'a saved group must NOT carry a mode - that belongs to the round');
        assert.ok(!/convertHandicapIndex|courseHandicap/.test(mg),
            'and it must not convert anything: the number goes in as typed');
    });

    test('NO PROTECTED FILE WAS TOUCHED BY THIS WAVE', () => {
        // The brief offered per-file approval for handicap.js. It is not needed: the
        // mode gate was already at the call site, and the labels live in
        // handicap-labels.js, which exists as a separate file for this reason.
        const PROTECTED = ['handicap.js', 'money-engine.js', 'pool-engine.js',
                           'settlement-engine.js', 'payouts.js', 'score-marks.js'];
        const shas = {
            'handicap.js': sha(read('handicap.js')),
            'money-engine.js': sha(read('money-engine.js')),
            'pool-engine.js': sha(read('pool-engine.js'))
        };
        // Pinned by CONTENT, measured on main 976f9af. If a later wave edits one of
        // these with Manny's approval, re-pin it here and say why in the commit.
        assert.equal(shas['handicap.js'].slice(0, 12), '73b03f002cf9', 'handicap.js changed');
        assert.equal(shas['money-engine.js'].slice(0, 12), '0e8a5c1756a2', 'money-engine.js changed');
        assert.equal(shas['pool-engine.js'].slice(0, 12), 'e3ea7ff117b4', 'pool-engine.js changed');
        PROTECTED.forEach(f => assert.ok(fs.existsSync(path.join(REPO_ROOT, f)), f + ' is gone'));
    });
});

// ===========================================================================
describe('2. THE MODE MOVES THE MONEY, AND ONLY BY THE CONVERSION', () => {

    test('the conversion is real on this fixture: 11 strokes becomes 13', () => {
        // If this ever came back 11 the whole comparison below would be vacuous.
        const conv = H.convertHandicapIndex('11', TEE);
        assert.equal(conv.ok, true, JSON.stringify(conv));
        assert.equal(conv.playingText, '13', 'Index 11 off 131/72.4 par 72 plays 13: ' + JSON.stringify(conv));
        assert.deepEqual(roundOf('ghin-index').players.map(p => p.hcp), ['13', '5', '21', '0'],
            'every golfer converts, and Dee off scratch does not move');
        assert.deepEqual(roundOf('as-entered').players.map(p => p.hcp), ['11', '4', '18', '0']);
    });

    test('NET DIFFERS BY EXACTLY THE CONVERSION, golfer by golfer', () => {
        const strokes = netRows(roundOf('as-entered'));
        const ghin = netRows(roundOf('ghin-index'));
        const by = rows => rows.reduce((m, r) => { m[r.name] = r; return m; }, {});
        const S = by(strokes), G = by(ghin);
        // GROSS IS UNTOUCHED - the same card both ways - and it has to be compared BY
        // GOLFER, not by position. The rows are sorted by net, and the whole point of
        // this fixture is that the mode changes that order, so comparing the two
        // arrays positionally said "the gross card moved" when nothing had.
        Object.keys(S).forEach(name => assert.equal(S[name].gross, G[name].gross,
            name + ': the gross card moved'));
        // 18 holes, hcpIndex 1..18: a handicap of n gives exactly n strokes up to 18.
        // MORE STROKES MEANS A LOWER NET, so the strokes-mode net is HIGHER by exactly
        // the strokes the conversion added. AND THEY ALL LAND: 21 strokes on an
        // 18-hole card is one a hole plus a second on the hardest three, which is
        // handicap.js's own allocation - measured, after I first assumed a cap at 18
        // and Reese's three extra strokes proved otherwise.
        [['Jimmy', 11, 13], ['Marty', 4, 5], ['Reese', 18, 21], ['Dee', 0, 0]].forEach(([name, sH, gH]) => {
            const added = gH - sH;
            assert.equal(S[name].net - G[name].net, added,
                name + ': the net difference is not the stroke difference the conversion added');
        });
        // Reese is the one that matters, and the measured numbers: 18 typed is 18
        // strokes and a net of 90; Index 18 plays 21 and nets 87. Three strokes of
        // difference on one golfer, which on a $160 pot is the difference between
        // being paid and not.
        assert.equal(S.Reese.net, 90);
        assert.equal(G.Reese.net, 87);
    });

    test('AND THE NET FINISH DOLLARS MOVE WITH IT', () => {
        const dollars = data => {
            const pool = H.computeMoneyPool(data, data.courseData, data.scores);
            assert.ok(pool && pool.valid,
                'the pool did not compute: ' + JSON.stringify((pool && pool.errors) || pool));
            // perPlayerCents is what every golfer actually ends the round owed or
            // owing - the figure the Receipt pays - keyed by player id.
            return JSON.parse(JSON.stringify(pool.perPlayerCents || {}));
        };
        const s = dollars(roundOf('as-entered'));
        const g = dollars(roundOf('ghin-index'));
        // THE MEASURED DOLLARS, in cents, after the $40 buy-in. Dee is 104 and
        // Marty is 102.
        assert.deepEqual(s, { 101: -4000, 102: 4000, 103: -4000, 104: 4000 },
            'strokes mode: Dee and Marty tie for first and split it');
        assert.deepEqual(g, { 101: -4000, 102: 5600, 103: -4000, 104: 2400 },
            'GHIN mode: Marty wins outright');
        assert.notDeepEqual(s, g, 'the two modes paid the same money - the mode is doing nothing');
        // SAID AS THE THING A GOLFER WOULD ARGUE ABOUT: the mode is worth $16 to
        // Marty and costs Dee $16 on this round.
        assert.equal((g[102] - s[102]) / 100, 16);
        assert.equal((g[104] - s[104]) / 100, -16);
        // AND NOTHING MOVED FOR THE OTHER TWO: the conversion changed their nets
        // and not their places, which is exactly the case my first fixture had for
        // everybody - every net moved and no money did.
        assert.equal(s[101], g[101]);
        assert.equal(s[103], g[103]);
    });
});

// ===========================================================================
describe('3. A LEGACY ROUND IS BYTE-IDENTICAL', () => {

    test('no handicapBasis means the GHIN path, exactly as before', () => {
        const legacy = roundOf('legacy');
        assert.ok(!('handicapBasis' in legacy), 'the fixture must have no field at all');
        assert.deepEqual(netRows(legacy), netRows(roundOf('ghin-index')),
            'a legacy round must settle exactly as a GHIN round');
    });

    test('GOLDEN: the legacy net standings, by sha', () => {
        // Pinned so a later wave cannot move an old round's money by accident. If
        // this breaks, somebody changed what a round saved before 2026-09-23 means,
        // and that is never a side effect.
        assert.equal(sha(netRows(roundOf('legacy'))).slice(0, 16), '22e10c7a1aa72c75');
    });

    test('GOLDEN: the legacy Net Finish dollars, by sha', () => {
        const pool = H.computeMoneyPool(roundOf('legacy'), CD, SCORES);
        assert.ok(pool && pool.valid, 'the legacy pool did not compute');
        assert.equal(sha(JSON.parse(JSON.stringify(pool))).slice(0, 16), '8151ee8e2f5ebdfd');
    });
});

// ===========================================================================
describe('4. CONTROLS', () => {

    test('CONTROL: the FLAG is what moves the money - nothing else differs', () => {
        // Same typed numbers, same scores, same tee, same pot. One field.
        const a = roundOf('as-entered');
        const b = roundOf('ghin-index');
        const strip = d => JSON.stringify({
            courseData: d.courseData, scores: d.scores, teeRating: d.teeRating,
            moneyPool: d.moneyPool, names: d.players.map(p => p.name), typed: TYPED.map(t => t.typed)
        });
        assert.equal(strip(a), strip(b), 'the two fixtures differ by more than the mode');
        assert.notEqual(a.handicapBasis, b.handicapBasis);
        assert.notDeepEqual(netRows(a), netRows(b), 'and the money moved');
    });

    test('CONTROL: with an UNRATED tee the mode moves NOTHING', () => {
        // There is nothing to convert, so both modes use the typed number. A test
        // that showed a difference here would be measuring something other than the
        // conversion.
        const s = roundOf('as-entered', { tee: null });
        const g = roundOf('ghin-index', { tee: null });
        assert.deepEqual(s.players.map(p => p.hcp), ['11', '4', '18', '0']);
        assert.deepEqual(g.players.map(p => p.hcp), ['11', '4', '18', '0'],
            'an unrated tee must fall back to the typed number');
        assert.deepEqual(netRows(s), netRows(g), 'no tee, no difference');
        // AND THE GHIN ARM SAYS SO on the golfer, which is how the screen avoids
        // claiming a conversion that did not happen.
        assert.ok(g.players.every(p => p.handicapUnconverted === true || p.hcp === ''),
            'an unconverted golfer must be flagged: ' + JSON.stringify(g.players));
    });

    test('CONTROL: a mode the app does not know is treated as LEGACY, not as strokes', () => {
        const L = loadJsFile('handicap-labels.js');
        assert.equal(L.handicapBasisOf({ handicapBasis: 'strokes' }), 'ghin-index',
            'the literal word "strokes" is NOT a stored value - as-entered is');
    });
});

// ===========================================================================
describe('5. THE LABELS FOLLOW THE MODE', () => {

    // "HCP" since players-compact (2026-10-09, Manny): it is the golfer's handicap.
    test('one builder names the box, and it says HCP on a strokes round', () => {
        const L = loadJsFile('handicap-labels.js');
        assert.equal(L.handicapBoxPlaceholder({ handicapBasis: 'as-entered' }), 'HCP');
        assert.equal(L.handicapBoxPlaceholder({ handicapBasis: 'ghin-index' }), 'Index');
        assert.equal(L.handicapBoxPlaceholder({}), 'Index', 'a legacy round is an Index round');
        assert.equal(L.handicapColumnLabel({ handicapBasis: 'as-entered' }), 'HCP');
    });

    test('the SETUP row no longer hardcodes "Index"', () => {
        // It did, on every round, including the strokes round that is the default -
        // a golfer typing 11 into a box labelled Index has been told it converts.
        const src = read('admin.html');
        assert.match(src, /class="p-hcp-input" placeholder="\$\{handicapSetupBoxLabel\(\)\}"/);
        assert.ok(!/class="p-hcp-input" placeholder="Index"/.test(src), 'the hardcoded label is back');
    });

    test('and MOVING THE TOGGLE repaints the rows', () => {
        const sb = loadHtmlInlineScript('admin.html', ['handicap-labels.js'],
            { search: '?game=HM1&eventType=quick' });
        const sel = sb.document.getElementById('handicap-basis-select');
        // mini-dom does not parse the static `selected` attribute, so the control
        // reads '' here; the DEFAULT is asserted from the markup in block 1. This
        // test is about the repaint.
        sel.value = 'ghin-index';
        sb.handicapBasisChanged();
        assert.equal(sb.handicapSetupBoxLabel(), 'Index');
        sel.value = 'as-entered';
        sb.handicapBasisChanged();
        assert.equal(sb.handicapSetupBoxLabel(), 'HCP');
    });

    test('the toggle says what Manny says: strokes as typed, or an index adjusted by tee', () => {
        const src = read('admin.html');
        assert.match(src, /<option value="as-entered" selected>Strokes \(use as typed\)<\/option>/);
        assert.match(src, /<option value="ghin-index">GHIN Index \(adjust by tee\)<\/option>/);
    });

    test('the Players sheet asks the same builder', () => {
        const src = read('index.html');
        const fn = src.slice(src.indexOf('function psBoxLabel'), src.indexOf('function psHcpNote'));
        assert.match(fn, /handicapColumnLabel\(currentData\)/, 'it must ask the one builder');
        assert.ok(!/'HCP'/.test(fn), 'HCP named the field, not the number');
    });

    test('the Game tab still states which mode the round uses', () => {
        const L = loadJsFile('handicap-labels.js');
        const s = L.handicapBasisSentence({ handicapBasis: 'as-entered', players: [{ hcp: '11' }] });
        assert.match(s, /used as entered/i);
        assert.match(s, /No tee conversion is applied/i);
        assert.match(read('game.html'), /handicapBasisSentence/, 'and the Game tab says it');
    });
});
