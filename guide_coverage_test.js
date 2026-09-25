// ============================================================================
// THE GUIDE DESCRIBES THE APP THAT EXISTS, AND A GOLFER CAN REACH IT
//
// instructions_accuracy_test.js already holds three narrow things well: every
// control name the guide emphasises exists somewhere, four stated numbers match
// the code that owns them, and two info cards are checked sentence by sentence.
// This file is the rest, and it exists because that suite could not see any of
// what the Wave 8 recon found. Measured then: 2 of 84 prose sentences and 2 of 16
// info cards had any pin on them at all.
//
// THE FIRST ASSERTION IS THE ONE THAT MATTERS. Nothing has EVER asserted that a
// page links to the guide, and so nothing ever did: `git log -S` over every .html
// file returns no commit that added one. It shipped precached in sw.js and bundled
// into the app, unreachable, in every build. A guide nobody can open is not a
// stale guide, it is not a guide.
//
// THE SECOND IS THE ONE THAT WAS DANGEROUS. The guide told a golfer a group link
// "shows everyone else read-only". CLAUDE.md records the measurement that killed
// that sentence once already - 76 of 76 inputs editable on a foursome - and
// grouping.js owns the true one. The card now QUOTES that function, so the claim
// cannot be re-written by hand into something the code does not do.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const ROOT = __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const GUIDE = read('instructions.html');
const ADMIN = read('admin.html');
const INDEX = read('index.html');

// The guide's own prose, with its markup and comments out of the way. Comments are
// not copy: this repo has been bitten twice by an assertion satisfied by a comment.
const BODY = GUIDE.slice(GUIDE.indexOf('<h1>'), GUIDE.indexOf('<hr class="section-divider">'))
    .replace(/<!--[\s\S]*?-->/g, ' ');
// Named entities have to be decoded, not just the three I happened to think of
// first. The verbatim groupLinkNoteText comparison below failed on a guide sentence
// that was IDENTICAL to grouping.js's, because the guide writes its em dash as
// &mdash; and the code writes it as — - and my first normaliser only knew
// &rsquo;, &amp; and &nbsp;. A partial decoder is the same class of fault as no
// decoder: it makes correct copy look wrong, which trains you to weaken the guard.
const ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
    mdash: '—', ndash: '–', hellip: '…', middot: '·',
    times: '×', rarr: '→', larr: '←', deg: '°',
};
const unentity = (s) => s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name) => {
    if (name[0] === '#') {
        const n = (name[1] === 'x' || name[1] === 'X')
            ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    // An unknown name stays literal so the guard reports it rather than hiding it.
    return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : whole;
});
const PROSE = unentity(decodeEscapes(BODY.replace(/<[^>]*>/g, ' ')))
    .replace(/\s+/g, ' ').trim();

describe('1. A GOLFER CAN REACH THE GUIDE', () => {

    test('at least one page in the app links to it', () => {
        // THE ASSERTION THAT WAS NEVER THERE. Every page is searched, and a code
        // comment does not count - the only mentions of this file before Wave 8
        // were a comment repeated in seven of them.
        const pages = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f) && f !== 'instructions.html');
        const linking = pages.filter(f => {
            const src = read(f).replace(/<!--[\s\S]*?-->/g, ' ')
                .replace(/^\s*\/\/.*$/gm, ' ');
            return /href="instructions\.html"/.test(src);
        });
        assert.ok(linking.length >= 1,
            'NO page links to instructions.html. It ships precached and bundled and '
            + 'nobody can open it - which is how it stayed unreachable in every build '
            + 'before this one.');
        // And EVERY route is a real control a thumb can hit, not a bare URL in
        // prose. Checked at every occurrence rather than the first: this started as
        // indexOf() once per page, which would have gone on passing if a second,
        // worse route were added underneath a good one.
        linking.forEach(f => {
            const src = read(f);
            let at = src.indexOf('href="instructions.html"');
            let n = 0;
            while (at > -1) {
                const tag = src.slice(src.lastIndexOf('<', at), src.indexOf('>', at) + 1);
                assert.match(tag, /^<a\b/, f + ' mentions the guide outside an anchor: ' + tag);
                n++;
                at = src.indexOf('href="instructions.html"', at + 1);
            }
            assert.ok(n >= 1, f + ' was listed as linking and then no link was found');
        });
    });

    test('the scorecard links to it, so the golfer\'s door has a door', () => {
        // WAVE 8b. The guide's FIRST door is written for somebody who arrived by a
        // link, and until this wave that person could not open it: Wave 8's route is
        // in admin.html's ⋯ More menu, and admin.html is the organizer's page. A
        // golfer who taps a group link lands on index.html and may never see Home.
        //
        // NOT A NINTH NAV PILL. index.html's bar is eight pills that WRAP - measured
        // at 390px, three rows already with the label lengths it carries - and it is
        // measured on every page by nav_bar_test.js. A ninth pill spends fold space
        // on every screen of the round to solve a problem that lives at the bottom.
        //
        // So: the bottom of the scorecard, in the .save-exit-box stack that already
        // holds Round Receipt and Save & Exit, below score entry, where it costs no
        // fold space at all.
        const idx = INDEX.replace(/<!--[\s\S]*?-->/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
        assert.match(idx, /href="instructions\.html"/,
            'index.html does not link to the guide. The golfer door has no door: the '
            + 'only route is admin.html\'s More menu, which is the organizer\'s page.');
        // In the bottom stack, not smuggled into the nav bar - and the guard says
        // which, so "somewhere on the page" cannot satisfy it.
        const at = idx.indexOf('href="instructions.html"');
        const navEnd = idx.indexOf('</div>', idx.indexOf('class="top-nav-bar"'));
        assert.ok(at > navEnd,
            'the guide link is inside the nav bar. Wave 8b measured that a ninth pill '
            + 'takes that bar to another row at 390px; the route belongs at the bottom.');
        const box = idx.lastIndexOf('class="save-exit-box"', at);
        assert.ok(box > -1 && idx.slice(box, at).indexOf('</div>') === -1,
            'the guide link is not inside a .save-exit-box, so it does not read as one '
            + 'of the cards already at the bottom of the card');
        // POSITIVE: the two cards it sits beside are still there. If the stack were
        // renamed or removed, the assertion above would pass on a page with no
        // bottom stack at all.
        assert.ok((idx.match(/class="save-exit-box"/g) || []).length >= 3,
            'the bottom stack lost a card - this guard is measuring a shape that is gone');
        assert.match(idx, /Round Receipt/, 'the Receipt card is gone from the stack');
    });

    test('every page that HAS a More menu carries the route', () => {
        // MEASURED SCOPE, recorded here rather than left to a report. The brief said
        // "on every page with that nav", and it turns out that is ONE page:
        //
        //   admin.html                                  11 pills, 3 nav-more-menu
        //   index, leaderboard, skins, settlement,        8 pills, 0 nav-more-menu
        //     sidematches, game, stats                    (a flat wrapping bar)
        //   trip, season                                  no pill nav at all
        //
        // index.html's bar stopped being a scroller-plus-More on 2026-09-14 and is
        // now eight pills that WRAP: two rows of four at 390px, ~303px and ~308px of
        // the 334-342 available. A ninth pill makes it three rows, on the page a
        // golfer lives on all day, and nav_bar_test.js measures that bar on every
        // page. So a golfer who arrives by link still cannot reach the guide: the
        // route is on the ORGANIZER's page. That is a geometry decision of its own
        // and it is logged, not smuggled in here.
        //
        // What this asserts is the drift-proof half: wherever a More menu exists, the
        // route is in it. It does NOT pin the count at one - a guard that went red
        // the moment somebody put the guide on index.html would be pushing in the
        // wrong direction, which is the fault CLAUDE.md records about the QR code.
        const pages = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f) && f !== 'instructions.html');
        const withMenu = pages.filter(f => read(f).includes('class="nav-more-menu"'));
        assert.ok(withMenu.length >= 1, 'no page has a More menu - this test guards nothing');
        withMenu.forEach(f => assert.match(read(f), /href="instructions\.html"/,
            f + ' has a More menu and no route to the guide in it'));
    });

    test('the route is the More menu, which is where this page family puts non-tabs', () => {
        // Not a new block on the setup screen: that screen is one viewport by
        // design, and a guide link is exactly the kind of thing that grew it to
        // 1172px. The ⋯ More menu already holds Trip, Season and Home.
        const menuAt = ADMIN.indexOf('class="nav-more-menu"');
        assert.ok(menuAt > -1, 'the More menu is gone');
        const menu = ADMIN.slice(menuAt, ADMIN.indexOf('</div>', menuAt));
        assert.match(menu, /href="instructions\.html"/,
            'the guide is not in the More menu');
        assert.match(menu, />[^<]*How it works[^<]*</,
            'the menu item does not say what it opens');
        // And it did NOT go on the Wave 7 setup screen as its own block.
        const lobby = ADMIN.slice(ADMIN.indexOf('<div class="container" id="lobby-screen">'),
                                  ADMIN.indexOf('<div class="container" id="admin-screen"'));
        assert.ok(!/href="instructions\.html"/.test(lobby),
            'a guide link was added to the setup screen as its own block - that is '
            + 'the growth Wave 7 undid');
    });
});

describe('2. THE GROUP-LINK CARD QUOTES THE CODE THAT OWNS THE CLAIM', () => {

    test('it says what groupLinkNoteText says, verbatim', () => {
        const g = read('grouping.js');
        const fn = g.slice(g.indexOf('function groupLinkNoteText'),
                           g.indexOf('\n}', g.indexOf('function groupLinkNoteText')));
        // The multi-group branch: the sentence the app itself shows an organizer.
        // STOP AT THE TERNARY, not at a semicolon - there is no `;` until after BOTH
        // branches, so a [^;]* match swallowed the single-group sentence too and the
        // "verbatim" comparison would have been against two sentences glued
        // together. My first version did exactly that.
        const branch = fn.slice(fn.indexOf("'Send each group"), fn.indexOf('\n        :'));
        const multi = decodeEscapes(branch.replace(/'\s*\+\s*'/g, '').replace(/'/g, '').trim());
        assert.ok(multi.length > 40 && multi.indexOf('Scorekeeper link') === -1,
            'could not read one clean sentence out of grouping.js: ' + JSON.stringify(multi));
        assert.ok(PROSE.includes(multi),
            'the guide does not quote the app\'s own sentence.\n      code says: '
            + multi + '\n      guide does not contain it');
    });

    test('and the read-only claim cannot come back', () => {
        // CLAUDE.md: the setup page once called its QR "a spectator link, read-only"
        // and a check measured 76 of 76 inputs editable on a foursome. A ?group=N
        // link is ALWAYS writable; what changes above four golfers is WHO IT COVERS.
        assert.ok(!/read-only/i.test(PROSE),
            'the guide calls a link read-only again. A group link is always writable; '
            + 'what changes above four golfers is who it covers, not what it permits.');
        assert.ok(!/spectator link/i.test(PROSE),
            'the guide describes a link as a spectator link again');
    });
});

describe('3. THE FORMAT LIST IS THE WIZARD\'S, AND SIDE GAMES ARE NOT IN IT', () => {

    // Every format card the wizard actually offers, read out of admin.html.
    const cards = [...ADMIN.matchAll(
        /data-format="([a-z-]+)"[\s\S]{0,420}?<span class="fmt-name">([^<]+)<\/span>/g)]
        .map(m => ({ key: m[1], label: m[2].trim() }));

    test('the wizard\'s cards can be read, so the comparison is not vacuous', () => {
        assert.ok(cards.length >= 8,
            'only ' + cards.length + ' format cards found in admin.html - the '
            + 'extractor is broken, not the guide');
    });

    test('every main format the guide lists is a card the wizard offers', () => {
        const listed = [...BODY.matchAll(/<div class="f-name">([^<]+)<\/div>/g)]
            .map(m => m[1].replace(/[^\x20-\x7E]/g, '').trim());
        assert.ok(listed.length >= 8, 'only ' + listed.length + ' formats listed');
        const labels = cards.map(c => c.label);
        const invented = listed.filter(l => !labels.some(lab => l.includes(lab) || lab.includes(l)));
        assert.deepEqual(invented, [],
            'the guide lists these as MAIN FORMATS and the wizard has no card for '
            + 'them: ' + invented.join(', '));
    });

    test('and the side games live in the side-games section, not the format grid', () => {
        const formats = BODY.slice(BODY.indexOf('id="formats"'), BODY.indexOf('id="side-games"'));
        const side = BODY.slice(BODY.indexOf('id="side-games"'), BODY.indexOf('id="side-matches"'));
        ['Skins', 'Dot Game'].forEach(name => {
            assert.ok(!new RegExp('<div class="f-name">[^<]*' + name).test(formats),
                name + ' is in the main-format grid; it is configured separately');
            assert.ok(side.includes(name),
                name + ' is not described in the side-games section');
        });
        // NASSAU IS BOTH, and the guide has to say so. It IS a wizard format card
        // (data-format="nassau-modern") AND a side-match format between two
        // players - my own recon said it was only the second, and the card list
        // corrected me.
        assert.ok(/Nassau/.test(formats), 'Nassau is a real format card and is not listed');
        const matches = BODY.slice(BODY.indexOf('id="side-matches"'), BODY.indexOf('id="money"'));
        assert.ok(/Nassau/.test(matches),
            'Nassau is also a side match between two players and the guide does not say so');
    });
});

describe('4. PAGE AND CONTROL NAMES ARE THE APP\'S OWN', () => {

    test('the money page is called what its heading calls it', () => {
        const set = read('settlement.html');
        const heading = (set.match(/<h[12][^>]*>([^<]*Payout Settlement[^<]*)</) || [])[1];
        assert.ok(heading, 'settlement.html no longer has a Payout Settlement heading');
        assert.ok(PROSE.includes('Payout Settlement'),
            'the guide does not use the page\'s own name, "Payout Settlement"');
        assert.ok(/Pay out/.test(set), 'the Pay out control is gone from settlement.html');
        assert.ok(PROSE.includes('Pay out'),
            'the guide does not name the "Pay out" control');
        // "Settle" was never a page or a control. It was the guide's own word.
        assert.ok(!/\bSettle\b(?! up)/.test(PROSE),
            'the guide calls a page "Settle", which is not what anything is called');
    });

    test('the nav sentence uses index.html\'s labels, the ones a golfer sees in a round', () => {
        const navAt = INDEX.indexOf('class="top-nav-bar"');
        const nav = INDEX.slice(navAt, INDEX.indexOf('</div>', navAt + 400));
        const labels = [...nav.matchAll(/class="top-nav-item[^"]*"[^>]*>([^<]+)</g)]
            .map(m => m[1].replace(/[^\x20-\x7E]/g, '').trim())
            .filter(Boolean);
        assert.ok(labels.length >= 6, 'only ' + labels.length + ' nav labels found');
        // ONE SENTENCE, not six words scattered through 1,400. On the old guide
        // every label happened to appear somewhere and this passed while the
        // sentence itself named the wrong page family.
        const navSentence = (PROSE.match(/[^.]*\bCard\b[^.]*\bBoard\b[^.]*\./) || [''])[0];
        assert.ok(navSentence.length > 40,
            'no single sentence lists the tabs: ' + JSON.stringify(navSentence));
        labels.forEach(l => assert.ok(navSentence.includes(l),
            'the tab sentence does not name "' + l + '": ' + navSentence));
        // admin.html says Scorecard / Leaderboard for the same two tabs. That
        // inconsistency is LOGGED FOR ITS OWN WAVE, not fixed here, and the guide
        // follows index.html because that is the page a golfer lives on in a round.
        assert.ok(/Scorecard/.test(ADMIN),
            'admin.html stopped saying Scorecard - the logged inconsistency is gone, '
            + 'so re-read this note');
    });
});

describe('5. THE CODE-FIRST CLAIM IS HONEST NOW', () => {

    test('it no longer says "no accounts" while the app has an Account panel', () => {
        assert.ok(!/no accounts/i.test(PROSE),
            'the guide still says "no accounts" and the setup screen has an Account '
            + 'panel with email sign-in');
        assert.ok(!/no sign-ups/i.test(PROSE), 'the guide still says "no sign-ups"');
        assert.ok(/Account/.test(PROSE),
            'the guide never mentions Account, which is how an organizer keeps a '
            + 'round across devices');
        assert.match(ADMIN, /id="account-link"/, 'the Account control is gone from the app');
    });

    test('and the typed-code sentence says where the field actually is', () => {
        assert.ok(/Open something else/.test(PROSE),
            'the guide tells a golfer to type a code into a field that is behind the '
            + '"Open something else" row and does not say so');
        assert.match(ADMIN, /Open something else/, 'the collapsed row is gone from the app');
    });
});

describe('6. EVERY FEATURE SHIPPED THIS WEEK IS DESCRIBED', () => {

    // Each entry: what the guide must mention, and the app string that proves the
    // feature is really there - so this cannot pass by describing something gone.
    const FEATURES = [
        ['which group are you keeping score for', 'index.html', 'Which group are you keeping score for?'],
        ['Just watching', 'index.html', 'Just watching'],
        ['Players sheet', 'index.html', 'players-sheet'],
        // "Account" alone passed on the old guide's own phrase "no accounts" -
        // a case-insensitive substring of a word it was supposed to be replacing.
        ['the Account panel', 'admin.html', 'id="account-link"'],
        ['still missing', 'index.html', 'still missing'],
        ['Closest to the Pin', 'index.html', 'Closest to the Pin'],
        ['Aloha', 'sidematches.html', 'aloha'],
        ['Season', 'admin.html', 'id="season-lobby"'],
        ['Pay out', 'settlement.html', 'Pay out'],
        ['Start from it', 'admin.html', 'Start from it']
    ];

    FEATURES.forEach(([phrase, page, proof]) => {
        test('the guide covers: ' + phrase, () => {
            assert.ok(read(page).includes(proof),
                'the app no longer has ' + proof + ' in ' + page + ' - fix the guide '
                + 'or this list, but do not assert a feature that is gone');
            assert.ok(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(PROSE),
                'the guide never mentions "' + phrase + '", which ships in ' + page);
        });
    });

    test('attendance is described, by whatever the app calls it', () => {
        // /confirm/ passed on the COURSE CARD's "the confirm panel says so" - a word
        // from an unrelated sentence. The phrase has to be about people.
        assert.match(ADMIN, /setup-attendance/, 'the attendance surface is gone');
        assert.ok(/who is playing/i.test(PROSE),
            'the guide never explains confirming who is playing');
    });
});

describe('7. TWO DOORS: THE ORGANIZER AND THE GOLFER ARE ADDRESSED SEPARATELY', () => {

    test('there is a section for each, and each names its own audience', () => {
        assert.match(BODY, /id="for-golfers"/, 'there is no section for a golfer sent a link');
        assert.match(BODY, /id="for-organizers"/, 'there is no section for the organizer');
        const golfer = BODY.slice(BODY.indexOf('id="for-golfers"'), BODY.indexOf('id="for-organizers"'));
        const org = BODY.slice(BODY.indexOf('id="for-organizers"'), BODY.indexOf('id="formats"'));
        assert.ok(golfer.length > 600 && org.length > 600,
            'one of the two doors is a stub: golfer ' + golfer.length + ' chars, organizer ' + org.length);
        // The golfer's door must not open with setup instructions, which is what
        // the whole guide used to do to a reader who had only been sent a link.
        assert.ok(!/pick a course/i.test(golfer),
            'the golfer section tells a golfer to pick a course');
        assert.ok(/organizer/i.test(org), 'the organizer section never says so');
    });

    test('the jump nav offers both doors first', () => {
        const jump = BODY.slice(BODY.indexOf('class="jump-nav"'), BODY.indexOf('</div>', BODY.indexOf('class="jump-nav"')));
        assert.match(jump, /#for-golfers/, 'the golfer door is not in the jump nav');
        assert.match(jump, /#for-organizers/, 'the organizer door is not in the jump nav');
        assert.ok(jump.indexOf('#for-golfers') < jump.indexOf('#formats'),
            'the reference sections come before the two doors');
    });
});
