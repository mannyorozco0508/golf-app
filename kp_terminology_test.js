// ============================================================================
// KP TERMINOLOGY — WHAT THE GOLFER READS vs WHAT THE DISK HOLDS
//
// The product now says KP everywhere a golfer can read it. The stored data still
// says greenie, and must keep saying greenie forever:
//
//     dot id            'greenie'          inside dots/h{N}/p{ID} on every round
//                                          ever played
//     round setting     greenieCarryover   written per round; a MISSING flag means
//                                          OFF, which is what protects rounds
//                                          played before carryovers existed
//
// Renaming either would orphan real money in Firebase for a cosmetic gain. So this
// file locks the split in both directions: the label must not regress to Greenie,
// and the identifiers must not "helpfully" follow the label.
//
// TWO FEATURES ARE BOTH CALLED KP, DELIBERATELY.
//
//   Money Pool KP   a pot carved out of the buy-in, on named holes, shown as a
//                   total: "Hole 4 KP · $50"
//   Dots KP         a junk dot on every par 3, no pot, shown per opponent:
//                   "KP · $5 each"
//
// A golfer tells them apart by where they sit and how the money reads. Tests below
// keep both contexts intact so a future edit cannot quietly merge them.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// Comments and internal identifiers are not golfer-facing. Strip line comments and
// the known internal names, then anything left saying "greenie" is text on a screen.
const INTERNAL_NAMES = /greenieCarryover|greenieCarryMap|greeniePar3Holes|greenieCarriedEvent|greenieCarryEl|greenieValue|greenieCarry\b|GREENIE_CARRIED|greenie-carryover|'greenie'|"greenie"/g;

function golferFacing(file) {
    // ORDER MATTERS. Block comments are stripped FIRST: filtering lines by their
    // leading token removes the opening /* and orphans the rest of the block, which
    // then reads as golfer-facing prose. That is exactly how a CSS comment
    // explaining the carry logic got reported as a label on screen.
    return read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .split('\n')
        .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
        .join('\n')
        .replace(INTERNAL_NAMES, '');
}

const CONSUMER_UI = ['index.html', 'admin.html', 'instructions.html', 'settlement.html',
    'stats.html', 'skins.html', 'sidematches.html', 'leaderboard.html', 'trip.html',
    'action-model.js', 'hole-events.js'];

// ---------------------------------------------------------------------------
describe('NOTHING A GOLFER READS SAYS GREENIE', () => {
    CONSUMER_UI.forEach(f => {
        test(`${f} has no golfer-facing Greenie`, () => {
            const src = golferFacing(f);
            assert.ok(!/greenie/i.test(src),
                `${f} still shows a golfer the word Greenie: ` +
                (/.*greenie.*/i.exec(src) || [''])[0].trim().slice(0, 120));
        });
    });

    test('the Dots picker offers KP, not Greenie', () => {
        const idx = read('index.html');
        assert.match(idx, /\{ id: 'greenie', label: '\u26f3 KP' \}/,
            'the label must read KP while the id stays greenie');
    });

    test('the carryover control is written in KP language', () => {
        const admin = read('admin.html');
        assert.match(admin, /Carry over unwon KPs/, 'the checkbox label');
        assert.ok(!/Carry over unclaimed greenies/i.test(admin), 'the old label must be gone');
        assert.match(admin, /Nobody wins the KP on a par 3/, 'the explanation under it');
    });

    test('hole-recap text says KP', () => {
        const he = read('hole-events.js');
        assert.match(he, /'KP unwon/, 'the unwon line');
        assert.match(he, /`KP carries/, 'the carry line');
        assert.ok(!/'Greenie |`Greenie /.test(he), 'no Greenie text may be pushed to a golfer');
    });

    test('the in-app guide and the Action blurb say KPs', () => {
        assert.match(read('instructions.html'), /dots for KPs, sandies, birdies/);
        assert.match(read('action-model.js'), /blurb: 'KPs, sandies, birdies, snakes/);
        assert.match(read('admin.html'), /Earn dots for birdies, KPs, and other in-round moments/);
    });
});

// ---------------------------------------------------------------------------
describe('THE STORED IDENTIFIERS DID NOT FOLLOW THE LABEL', () => {
    test("the dot id is still exactly 'greenie' in every engine copy", () => {
        ['money-engine.js', 'index.html', 'stats.html', 'hole-events.js'].forEach(f => {
            assert.match(read(f), /'greenie'/,
                `${f} renamed the persisted dot id - every historical round would be orphaned`);
        });
    });

    test('the persisted round setting is still greenieCarryover', () => {
        ['money-engine.js', 'index.html', 'stats.html', 'hole-events.js'].forEach(f => {
            assert.match(read(f), /greenieCarryover/, `${f} renamed the persisted flag`);
        });
        assert.match(read('admin.html'), /greenieCarryover: greenieCarryover,/,
            'setup must still write the legacy field name');
    });

    test('a missing flag still means OFF, so old rounds are frozen', () => {
        ['money-engine.js', 'index.html', 'stats.html'].forEach(f => {
            assert.match(read(f), /data\.greenieCarryover === true/,
                `${f} must require an explicit true`);
        });
    });

    test('no migration or shadow field was introduced', () => {
        const all = CONSUMER_UI.concat(['money-engine.js']).map(read).join('\n');
        assert.ok(!/kpCarryover|carryoverKp|kp_carryover/i.test(all),
            'a second carryover field would split the setting in two');
    });
});

// ---------------------------------------------------------------------------
describe('THE MONEY DID NOT MOVE', () => {
    const engine = loadJsFile('money-engine.js');
    const P = [101, 102, 103, 104].map((id, i) => ({ id, name: 'ABCD'[i], hcp: '0', playingForMoney: true }));
    const CD = Array.from({ length: 18 }, (_, i) => ({
        hole: i + 1, par: [3, 7, 12, 16].includes(i + 1) ? 3 : 4, hcpIndex: i + 1
    }));
    const full = () => { const s = {}; P.forEach(p => CD.forEach(h => { s[`p${p.id}_h${h.hole}`] = h.par; })); return s; };
    const units = (d) => engine.calcDotsEngine(Object.assign({ players: P }, d), CD, full()).totals;
    const money = (d) => engine.computeRoundMoneyByPlayer(
        Object.assign({ gameFormat: 'dots', players: P, courseData: CD, scores: full(), dotPointVal: 5 }, d),
        CD, full()).players.map(x => x.net);

    test('a historical round storing greenie still settles the same', () => {
        assert.deepEqual(money({ dots: { h7: { p101: ['greenie'] } } }), [15, -5, -5, -5]);
    });

    test('carryovers OFF is still base value', () => {
        assert.equal(units({ dots: { h7: { p101: ['greenie'] } } })[101], 1);
    });

    test('carryovers ON still carries by units', () => {
        assert.equal(units({ greenieCarryover: true, dots: { h7: { p101: ['greenie'] } } })[101], 2);
        assert.equal(units({ greenieCarryover: true, dots: { h12: { p101: ['greenie'] } } })[101], 3);
    });

    test('a carried KP still pays per opponent, not as a pot', () => {
        assert.deepEqual(money({ greenieCarryover: true, dots: { h7: { p101: ['greenie'] } } }),
            [30, -10, -10, -10]);
    });
});

// ---------------------------------------------------------------------------
describe('THE TWO KPs STAY DISTINCT', () => {
    test('Money Pool KP keeps its own context and its own stake field', () => {
        const admin = read('admin.html');
        assert.match(admin, /id="mp-kp-amount"/, 'the pool KP has its own dollar amount');
        assert.match(admin, /id="mp-kp-holes"/, 'and its own explicit hole list');
        assert.match(read('pool-engine.js'), /kpWinners/, 'and its own storage');
    });

    test('Dots KP has NO separate stake — it inherits the one per-dot value', () => {
        const idx = read('index.html');
        assert.ok(!/greenieVal|kpDotVal|dotValues/.test(idx),
            'introducing a per-dot stake would fork the Dots accounting');
        assert.match(read('money-engine.js'), /const dotVal = data\.dotPointVal \|\| 0;/,
            'one canonical dollar-per-dot value');
    });

    test('the pool KP block still identifies itself as a KP', () => {
        assert.match(read('index.html'), /kp-head">Hole ' \+ h \+ ' KP/,
            'removing the icon must not remove the word');
    });
});

// ---------------------------------------------------------------------------
describe('THE DECORATIVE BULLSEYES ARE GONE', () => {
    const BULLSEYE = /\u{1F3AF}|\\uD83C\\uDFAF/u;

    // SCOPE, STATED. Part 1 removed the four bullseyes on the two SCORECARD views -
    // the Hole View toggle, the two Stableford lines and the Money Pool KP header,
    // all in index.html. Bullseyes also exist on Settlement, Stats, Admin setup,
    // Instructions and Side Matches. Those are different screens and were not part
    // of the approved change, so they are deliberately left alone rather than swept
    // up; this test would otherwise quietly authorise a wider edit than was agreed.
    test('the scorecard views carry no bullseye', () => {
        assert.ok(!BULLSEYE.test(read('index.html')), 'index.html still renders a target emoji');
    });

    test('the out-of-scope bullseyes elsewhere were left untouched', () => {
        assert.ok(BULLSEYE.test(read('settlement.html')), 'Settlement was not in scope for Part 1');
        assert.ok(BULLSEYE.test(read('admin.html')), 'Setup was not in scope for Part 1');
    });

    test('the four audited labels survive without their icon', () => {
        const idx = read('index.html');
        assert.match(idx, /setViewMode\('hole'\)">Hole View<\/button>/, 'the view toggle');
        assert.match(idx, /per point Stableford/, 'the Stableford stake line');
        assert.match(idx, /"LIVE STABLEFORD STANDINGS"/, 'the Stableford standings title');
        assert.match(idx, /kp-head">Hole/, 'the pool KP header');
    });

    test('no label was left with a leading space where the icon used to be', () => {
        const idx = read('index.html');
        assert.ok(!/>\s\s+Hole View</.test(idx));
        assert.ok(!/`\s+\$\$\{val\} per point/.test(idx));
        assert.ok(!/"\s+LIVE STABLEFORD/.test(idx));
    });

    test('real scoring marks were not swept up with the icons', () => {
        const idx = read('index.html');
        assert.match(idx, /scoreMarkClass\(scoreVal, h\.par\)/, 'gross birdie/eagle rings');
        assert.match(idx, /class="stroke-dots"/, 'handicap stroke dots');
        assert.match(idx, /dotIndicatorHtml\(dotsForPlayerHole/, 'Dots/Junk pips');
        assert.match(idx, /class="cell-dots"/, 'the reserved junk strip');
        assert.match(read('money-engine.js'), /dotVal \* \(n \* units - totalUnits\)/, 'Dots settlement');
    });
});
