// ============================================================================
// RATTLE GOLF CONSUMER — ICON SEMANTICS
//
// The rule this file exists to protect: ONE CONCEPT OWNS ONE ICON.
//
// The audit that produced this batch found 🎯 carrying six unrelated meanings
// (Stableford points, handicap preview, "Extras", dot settlement, Stableford
// settlement, side-match Overall), 📋 carrying four, and ⛳ carrying five. An
// icon with six meanings has none, and the drift happened one reasonable-looking
// edit at a time. These tests make the next such edit fail loudly.
//
// TWO TIERS, and the tier decides how strict the assertion is:
//
//   TIER 1 - CHROME. Navigation, homepage modes, wizard steps, destructive
//   actions. Seen every session. Asserted exactly, and asserted to be UNIQUE.
//
//   TIER 2 - CHARACTER. Games, Dots/Junk, awards. Always labelled, occasional,
//   and the personality is the point. Asserted only to still EXIST, never
//   normalised.
//
// Anything casino-coded is banned outright, and not for taste: Rattle Golf's
// App Store position is that it records golf games between friends and never
// accepts a wager, holds a fund or pays a winning. A slot machine on the setup
// screen argues the opposite to the one reader who matters.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const CONSUMER = ['admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
    'skins.html', 'sidematches.html', 'stats.html', 'trip.html', 'instructions.html'];

const ADMIN = read('admin.html');
const IDX = read('index.html');
const TRIP = read('trip.html');
const SETTLE = read('settlement.html');
const STATS = read('stats.html');

const everyConsumerFile = fn => CONSUMER.forEach(f => fn(read(f), f));

// ---------------------------------------------------------------------------
describe('RETIRED ICONS ARE GONE FROM CONSUMER', () => {

    // Each of these was retired for a stated reason, not for tidiness.
    const RETIRED = [
        ['\u{1F3AF}', 'bullseye — had drifted to six unrelated meanings'],
        ['\u{1F3B0}', 'slot machine — casino imagery contradicts the App Store position'],
        ['\u2660\ufe0f', 'spade — card-suit imagery for Hi-Lo, same problem'],
        ['\u{1F4B8}', 'money-with-wings — duplicated settlement, which is 🤝'],
        ['\u{1F94A}', 'boxing glove — duplicated ⚔️ for the same 1v1 concept'],
        ['\u{1F396}\ufe0f', 'military medal — duplicated 🏆 for standings'],
        ['\u{1F3D7}\ufe0f', 'construction — read as unfinished, not as create'],
    ];

    RETIRED.forEach(([glyph, why]) => {
        test(`${glyph} is retired: ${why}`, () => {
            everyConsumerFile((src, f) =>
                assert.ok(!src.includes(glyph), `${f} still uses ${glyph}`));
        });
    });

    test('no glyph is doubled to mean a number', () => {
        // "⛳⛳ 36 Holes" used repetition as arithmetic. The number does that job.
        everyConsumerFile((src, f) =>
            assert.ok(!/\u26f3\ufe0f?\u26f3/u.test(src), `${f} doubles a flag`));
        assert.match(TRIP, /\u26f3 36 Holes/u, 'one flag, and the number says 36');
    });

    test('NEGATIVE CONTROL — no casino imagery replaced the slot machine', () => {
        // The instruction was to remove it, not to swap in a different gambling symbol.
        [['\u{1F3B2}', 'dice'], ['\u{1F0CF}', 'joker'], ['\u2663\ufe0f', 'club suit'],
         ['\u2666\ufe0f', 'diamond suit'], ['\u2665\ufe0f', 'heart suit']]
            .forEach(([g, name]) => everyConsumerFile((src, f) =>
                assert.ok(!src.includes(g), `${f} introduced ${name}`)));
    });
});

// ---------------------------------------------------------------------------
describe('THE BULLSEYE WAS REPLACED SEMANTICALLY, NOT SWEPT', () => {

    // Six uses, six different concepts, six deliberate decisions. A blind
    // find-and-replace would have given all six the same new icon and rebuilt the
    // exact problem under a different glyph.

    test('Stableford is ⭐ everywhere it appears', () => {
        assert.match(ADMIN, /\u2b50 Stableford Points/u, 'setup label');
        assert.match(SETTLE, /\u2b50 Final Stableford Settlement/u, 'settlement');
        assert.match(STATS, /\u2b50 Round Settlement \(Stableford\)/u, 'stats');
        assert.match(read('instructions.html'), /\u2b50 Net Stableford/u, 'instructions');
    });

    test('handicap preview is 🧮 — a calculation, not a target', () => {
        assert.match(ADMIN, /\u{1F9EE} Preview Handicap Strokes/u);
    });

    test('Extras is ✨', () => {
        assert.match(ADMIN, /<strong>\u2728 Extras<\/strong>/u);
    });

    test('Dots settlement is 🔘 — it reads as a dot', () => {
        assert.match(SETTLE, /\u{1F518} Final Dot Game Settlement/u);
        assert.match(STATS, /\u{1F518} Round Settlement \(Dots\)/u);
    });

    test('side-match Overall carries NO icon', () => {
        // Front, Back and Overall are three parts of one ⚔️ match. Giving one of them
        // its own glyph is how the drift started.
        const sm = read('sidematches.html');
        assert.match(sm, /Overall \(\$\$\{sm\.overallStake\}\)/,
            'the label stands on its own');
        assert.ok(!/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\s*Overall \(/u.test(sm),
            'Overall must not have acquired a replacement icon');
    });

    test('⭐ and 🔘 did not themselves become catch-alls', () => {
        // The failure mode this whole batch exists to prevent, checked on the
        // replacements: every ⭐ must be Stableford, every 🔘 must be Dots.
        everyConsumerFile((src, f) => {
            (src.match(/\u2b50[^<\n]{0,40}/gu) || []).forEach(m =>
                assert.match(m, /Stableford/, `${f}: ⭐ used for something else: ${m.trim()}`));
            (src.match(/\u{1F518}[^<\n]{0,40}/gu) || []).forEach(m =>
                assert.match(m, /Dot/, `${f}: 🔘 used for something else: ${m.trim()}`));
        });
    });
});

// ---------------------------------------------------------------------------
describe('THE GAME DAY WIZARD — SEVEN STEPS, SEVEN DISTINCT MARKS', () => {

    // The number now lives in its own span so the workflow can renumber it - a
    // Ryder Cup must not read "Step 5: Players" while the progress dots say 4. The
    // glyph assignment being tested here is unchanged.
    const STEPS = [
        ['1', 'course', '\u26f3', 'Course'],
        ['3', 'format', '\u{1F4DD}', 'What Are We Playing\\?'],
        ['4', 'settings', '\u2699\ufe0f', 'Format Settings'],
        ['5', 'players', '\u{1F465}', 'Players'],
        ['6', 'action', '\u{1F4B0}', 'Games &amp; Money'],
        ['7', 'review', '\u2705', 'Review &amp; Save'],
    ];

    STEPS.forEach(([n, sem, glyph, label]) => {
        test(`Step ${n} (${label}) uses ${glyph}`, () => {
            const re = new RegExp('wizard-step-title">' + glyph + ' ' + label
                + ' \u00b7 <span class="wiz-step-n" id="wiz-n-' + sem + '">Step ' + n + '</span>', 'u');
            assert.match(ADMIN, re);
        });
    });

    test('Step 2 uses a numeric chip, not an emoji', () => {
        // No emoji says "how many holes". The previous ruler collided with the Polie
        // dot and communicated nothing, so the number is the icon.
        assert.match(ADMIN,
            /<span class="step-holes">9\/18<\/span> Round Length \u00b7 <span class="wiz-step-n" id="wiz-n-length">Step 2<\/span>/);
        assert.match(ADMIN, /\.step-holes \{[^}]*background: var\(--brand-green\)/,
            'the chip must be styled, not bare text');
        assert.ok(!/\u{1F4CF} Step 2/u.test(ADMIN), 'the ruler is retired from the wizard');
    });

    test('Step 1 and Step 3 no longer share a glyph', () => {
        assert.ok(!/wizard-step-title">\u26f3 What Are We Playing/u.test(ADMIN),
            'two steps wearing the same flag is what made the wizard unreadable');
    });

    test('the seven step marks are all different', () => {
        const marks = (ADMIN.match(/wizard-step-title">(\S+?) /gu) || [])
            .map(m => m.replace(/wizard-step-title">/, '').trim());
        assert.equal(marks.length, 7, 'seven steps');
        assert.equal(new Set(marks).size, 7, 'duplicate step marks: ' + marks.join(' '));
    });
});

// ---------------------------------------------------------------------------
describe('GLOBAL NAVIGATION IS ONE SYSTEM', () => {

    const NAV = [
        ['index.html', '\u{1F4DD}', 'Scorecard'],
        ['leaderboard.html', '\u{1F3C6}', 'Leaderboard'],
        ['skins.html', '\u{1F4B0}', 'Bets'],
        ['settlement.html', '\u{1F91D}', 'Results'],
        ['sidematches.html', '\u2694\ufe0f', 'Matches'],
        ['stats.html', '\u{1F4CA}', 'Stats'],
        ['trip.html', '\u{1F690}', 'Trip'],
        ['admin.html', '\u{1F3E0}', 'Home'],
    ];

    test('every page carries the same eight-item bar', () => {
        CONSUMER.forEach(f => {
            const src = read(f);
            if (!src.includes('top-nav-item')) return;
            NAV.forEach(([, glyph, label]) =>
                assert.ok(src.includes(glyph + ' ' + label),
                    `${f}: nav is missing "${glyph} ${label}"`));
        });
    });

    test('Home is a house — a gear means settings', () => {
        everyConsumerFile((src, f) => {
            assert.ok(!/\u2699\ufe0f? Home/u.test(src), `${f}: a gear must not mean Home`);
        });
    });

    test('every gear in the app means settings or configuration', () => {
        // Not a count - a meaning. "⚙️ Edit" on a trip round opens the setup wizard,
        // which is configuration and therefore correct. What is banned is the gear
        // standing in for Home, which no other app does and which collided with Step 4.
        everyConsumerFile((src, f) => {
            (src.match(/\u2699\ufe0f?[^<\n]{0,30}/gu) || []).forEach(m =>
                assert.match(m, /Settings|Edit/,
                    `${f}: a gear must mean settings or edit, found: ${m.trim()}`));
        });
        assert.match(ADMIN, /\u2699\ufe0f Format Settings/u);
    });

    test('Results is 🤝 and no longer 💸', () => {
        assert.match(SETTLE, /\u{1F91D} Payout Settlement/u);
    });
});

// ---------------------------------------------------------------------------
describe('ACTION ICONS — AND THE ONE THAT DELETES A ROUND', () => {

    test('★ End & Wipe is a bin, and never the Join icon', () => {
        // The important one. A destructive, irreversible action shared 📥 with "Join
        // Game" - the single most dangerous icon collision the audit found.
        [ADMIN, IDX].forEach(src =>
            assert.match(src, /endAndClearRound\(\)">\u{1F5D1}\ufe0f End & Wipe Round<\/button>/u));
        assert.ok(!/\u{1F4E5} End & Wipe/u.test(ADMIN + IDX), '📥 must never mean destroy');
    });

    test('the destructive confirmation was not weakened', () => {
        // Changing an icon must not have touched the safeguard behind it.
        assert.match(ADMIN, /function endAndClearRound/);
        const fn = ADMIN.slice(ADMIN.indexOf('function endAndClearRound'),
            ADMIN.indexOf('function endAndClearRound') + 900);
        assert.match(fn, /confirm\(/, 'the confirmation prompt must survive');
    });

    test('📥 now means join, and only join', () => {
        // The round's typed-code field is gone - a golfer arrives on a link - so the
        // only inbox left is the trip one. The rule it guards is unchanged: this
        // glyph means joining something, and nothing else.
        assert.ok(!/joinRoom\(\)/.test(ADMIN), 'the round join control is gone');
        assert.match(read('trip.html'), /joinTrip\(\)">\u{1F4E5} Open Trip<\/button>/u);
        (ADMIN + IDX + TRIP).match(/\u{1F4E5}[^<\n]{0,24}/gu).forEach(m =>
            assert.match(m, /Join|Open/, 'inbox used for something that is not joining: ' + m));
    });

    test('duplicate is 📑, copy is ⧉, group links are 🔗', () => {
        assert.match(ADMIN, /\u{1F4D1} Duplicate This Round's Setup/u);
        assert.match(ADMIN, /\u29C9 Copy Invite L/u);
        assert.match(ADMIN, /">\u{1F517} Copy Link</u);
        assert.match(IDX, /toggleGroupLinksPanel\(\)">\u{1F517} Group Li/u);
        assert.match(read('sidematches.html'), /\u29C9 Copy</u);
    });

    test('📋 still means the full scorecard', () => {
        assert.match(IDX, /setViewMode\('full'\)">\u{1F4CB} Full Card<\/button>/u);
    });
});

// ---------------------------------------------------------------------------
describe('ROAD TRIP', () => {

    test('the mode tile and the nav both use the van', () => {
        assert.match(ADMIN, /<div class="hw-icon">\u{1F690}<\/div>/u, 'homepage tile');
        assert.match(ADMIN, /<div class="hw-name">Road Trip<\/div>/, 'full name on the tile');
        // trip.html has no nav bar of its own; the compact label lives on the pages
        // that link TO it, and it stays "Trip" because eight items must fit 390px.
        CONSUMER.filter(f => read(f).includes('top-nav-item')).forEach(f =>
            assert.match(read(f), /\u{1F690} Trip/u, `${f}: compact nav label`));
        assert.match(TRIP, /<title>Road Trip<\/title>/, 'the page itself uses the full name');
    });

    test('standings are 🏆 and awards are 🏅 — two glyphs, not four', () => {
        assert.match(TRIP, /\u{1F3C6} POINTS RACE/u);
        assert.match(TRIP, /\u{1F3C5} AWARDS/u);
    });

    test('build is ➕, consistent with every other create action', () => {
        assert.match(TRIP, /buildTrip\(\)">\u2795 Build Trip/u);
        assert.match(TRIP, /\u2795 Start a New Trip/u);
    });

    test('the trip award personality survives', () => {
        [['\u{1F3AD}', 'Sandbagger'], ['\u{1F4A5}', 'Blow-Up'], ['\u{1F4C8}', 'Trend']]
            .forEach(([g, what]) => assert.ok(TRIP.includes(g), what + ' lost its icon'));
    });
});

// ---------------------------------------------------------------------------
describe('TIER 2 — THE PERSONALITY WAS NOT STERILISED', () => {

    test('the Dots/Junk set is intact and still playful', () => {
        const DOTS = [['greenie', '\u26f3 KP'], ['sandy', '\u{1F3D6}\ufe0f Sandy'],
            ['barkie', '\u{1F333} Barkie'], ['polie', '\u{1F4CF} Polie'],
            ['birdie', '\u{1F426} Birdie'], ['eagle', '\u{1F985} Eagle'],
            ['snake', '\u{1F40D} Snake']];
        DOTS.forEach(([id, label]) =>
            assert.ok(IDX.includes(`{ id: '${id}', label: '${label}`),
                `the ${id} dot lost its icon - this set is deliberately fun`));
    });

    test('⛳ KP is kept on purpose', () => {
        // Closest-to-the-pin. The flag literally IS the pin, which makes this the most
        // precise use of ⛳ anywhere in the app - not an exception to the rule.
        assert.match(IDX, /id: 'greenie', label: '\u26f3 KP'/u);
    });

    test('Wolf, Blind Wolf and Skins keep their character', () => {
        assert.ok(IDX.includes('\u{1F43A}'), 'Wolf');
        assert.ok(ADMIN.includes('\u{1F648}'), 'Blind Wolf');
        assert.ok(ADMIN.includes('\u{1F969}'), 'Skins');
    });

    test('Press is still on fire', () => {
        assert.ok(IDX.includes('\u{1F525} Press') || ADMIN.includes('\u{1F525}'), 'Press');
    });

    test('Hi-Lo says high/low instead of wearing a card suit', () => {
        assert.match(IDX, /\u2195\ufe0f HI-LO \(LOW BALL \/ HIGH BALL\)/u);
        assert.match(SETTLE, /\u2195\ufe0f Final Hi-Lo Settlement/u);
    });

    test('head-to-head is ⚔️ everywhere', () => {
        assert.match(ADMIN, /\u2694\ufe0f 1v1 Options/u);
        assert.match(IDX, /\u2694\ufe0f LIVE STROKE PLAY STATUS/u);
        assert.match(IDX, /\u2694\ufe0f LIVE MATCH PLAY STATUS/u);
    });
});
