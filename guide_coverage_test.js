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
        // THE BOTTOM-OF-CARD ROUTE, which Wave 8b measured and built: below score
        // entry, beside Save & exit and the Receipt, where it costs no fold space.
        // WAVE 20 turned those three cards into ONE ROW - 518px of footer became 92px
        // unscored and 52px scored - so the route is now the 60px icon in that row
        // rather than a full-width button in a .save-exit-box. The claim is untouched:
        // the golfer has a route at the bottom of the scorecard, and it is not the pill.
        //
        // WAVE 15 ADDED A SECOND ROUTE, and withdrew the reason this test used to
        // give for refusing one. It said a ninth pill makes the bar three rows. That
        // was true of the bar as it then was - glyph BESIDE the label - and it stayed
        // true when the labels went long: 758px of intrinsic pill in ~610px of two
        // rows. Stacking the glyph ABOVE the label costs 235px of that and the ninth
        // pill fits: measured two rows, 139px of wrapper, unchanged. So the guide is
        // now a pill as well, and BOTH routes are asserted - the pill below, this
        // card here. Neither is allowed to be the only one, because they answer
        // different questions: the pill is reachable from every page, the card is
        // where a golfer who has finished a hole is already looking.
        const idx = INDEX.replace(/<!--[\s\S]*?-->/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
        assert.match(idx, /href="instructions\.html"/,
            'index.html does not link to the guide. The golfer door has no door: the '
            + 'only route is admin.html\'s More menu, which is the organizer\'s page.');
        // In the bottom stack, and the guard says WHICH - so "somewhere on the page"
        // cannot satisfy it. Taking the LAST occurrence, not the first: the first is
        // now the nav pill (Wave 15), and using indexOf here would read the pill's
        // position and report that the card had moved.
        const at = idx.lastIndexOf('href="instructions.html"');
        const navEnd = idx.indexOf('</div>', idx.indexOf('class="top-nav-bar"'));
        assert.ok(at > navEnd,
            'the only guide link on index.html is the nav pill - the bottom-of-card '
            + 'route Wave 8b built is gone, and with it the door for a golfer who is '
            + 'looking at score entry rather than at the nav.');
        const row = idx.lastIndexOf('class="sc-footer-row"', at);
        assert.ok(row > -1 && idx.slice(row, at).indexOf('</div>') === -1,
            'the guide link is not inside the footer row, so it does not read as one of '
            + 'the controls at the bottom of the card');
        // POSITIVE: the controls it sits beside are still there. Without this, the
        // assertion above would pass on a page with an empty row on it - and Save & exit
        // in particular is the only working way out of a round on a group link, so its
        // absence is a bigger defect than a missing guide icon.
        assert.match(idx, /id="sc-foot-save"/, 'Save & exit is gone from the footer row');
        assert.match(idx, /id="sc-foot-receipt"/, 'the Receipt control is gone from the row');
        assert.match(idx, /Round Receipt appears here once the round is scored/,
            'the line that stands in for the Receipt before there are scores is gone');
    });

    test('every consumer page carries the route, because it is a pill in the shared bar', () => {
        // RE-POINTED IN WAVE 15, and the scope inverted. This used to assert
        // "wherever a More menu exists, the route is in it", which measured out to ONE
        // page: admin.html, the organizer's, with 11 pills and a three-item dropdown.
        // That menu is gone. It shipped with `open`, so when Wave 14 taught the bar to
        // wrap it became five pills on two rows with a six-item popover floating over
        // the page.
        //
        // The route is now a pill in the bar every consumer page shares, which is
        // eight pages instead of one. THE CLAIM THIS GUARD PROTECTS IS THE ROUTE, NOT
        // THE MENU - the guide was unreachable from anywhere for the whole of this
        // repo's history before Wave 8, and that is the only thing worth never
        // regressing. So it asserts a real <a> on every page that has the bar, and it
        // does not care what container holds it.
        const pages = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f) && f !== 'instructions.html');
        // RE-POINTED 2026-10-04: index.html's wrap carries an id as well as the class,
        // because the Status sheet moves the whole bar into itself by getElementById.
        // The bar itself is unchanged on all eight pages - nav_bar_test.js compares
        // the anchors - so the search drops the closing bracket rather than the claim.
        const withBar = pages.filter(f => read(f).includes('<div class="app-nav-wrap"'));
        assert.equal(withBar.length, 8, 'the shared bar is on ' + withBar.length + ' pages, not 8: ' + withBar.join(', '));
        withBar.forEach(f => assert.match(read(f), /<a href="instructions\.html" class="top-nav-item"/,
            f + ' carries the shared bar and no guide pill in it'));
    });

    test('the route on the setup screen is a pill in the bar, and it says what it opens', () => {
        // RE-POINTED IN WAVE 15. This asserted that the route was inside
        // class="nav-more-menu" on admin.html. That menu no longer exists anywhere,
        // and the claim it was protecting was never the menu - it was that admin.html,
        // the page an organizer starts from, has a route to the guide at all.
        //
        // Still NOT a new block on the setup screen: that screen is one viewport by
        // design and a guide card is exactly the kind of thing that grew it to 1172px.
        // The pill costs it nothing - the bar is 139px with nine pills exactly as it
        // was with eight, because the glyph moved above the label instead of beside it.
        const barAt = ADMIN.indexOf('<div class="app-nav-wrap">');
        assert.ok(barAt > -1, 'admin.html has no shared nav bar');
        const bar = ADMIN.slice(barAt, ADMIN.indexOf('</div>\n    </div>', barAt));
        assert.match(bar, /href="instructions\.html"/,
            'the guide is not in the bar');
        assert.match(bar, /<span class="tni-label">How it works<\/span>/,
            'the pill does not say what it opens');
        // And the menu it replaced cannot come back: an `open` <details> in the bar is
        // the defect Manny reported ("worse than before, not better").
        assert.ok(!/nav-more/.test(ADMIN), 'the More menu is back in admin.html');
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
        // READ OUT OF THE LABEL SPAN (Wave 15): the pill is
        // <span class="tni-glyph">glyph</span><span class="tni-label">label</span>, so the
        // old `>([^<]+)<` capture read the glyph and stripped it to an empty string - six
        // labels became zero and the `labels.length >= 6` positive assertion is what
        // caught that rather than letting a forEach over nothing go green.
        const labels = [...nav.matchAll(/class="tni-label">([^<]+)</g)]
            .map(m => m[1].trim()).filter(Boolean);
        assert.ok(labels.length >= 6, 'only ' + labels.length + ' nav labels found');
        // ONE SENTENCE, not six words scattered through 1,400. On the old guide
        // every label happened to appear somewhere and this passed while the
        // sentence itself named the wrong page family.
        const navSentence = (PROSE.match(/[^.]*\bScorecard\b[^.]*\bLeaderboard\b[^.]*\./) || [''])[0];
        assert.ok(navSentence.length > 40,
            'no single sentence lists the tabs: ' + JSON.stringify(navSentence));
        labels.forEach(l => assert.ok(navSentence.includes(l),
            'the tab sentence does not name "' + l + '": ' + navSentence));
        // THE LOGGED INCONSISTENCY IS RESOLVED (Wave 15), so the note becomes its
        // opposite. admin.html used to say Scorecard / Leaderboard while the other seven
        // said Card / Board, and the guide followed index.html because that is the page a
        // golfer lives on. Manny's call was to keep the LONG names and change the seven,
        // so there is one set of labels now and the guide names them. What this asserts is
        // that they really are one set: index.html's labels and admin.html's, compared.
        const adminNav = ADMIN.slice(ADMIN.indexOf('class="top-nav-bar"'));
        const adminLabels = [...adminNav.slice(0, adminNav.indexOf('</div>', 400)).matchAll(/class="tni-label">([^<]+)</g)].map(m => m[1].trim());
        assert.deepEqual(adminLabels, labels,
            'admin.html and index.html disagree about the labels again: '
            + JSON.stringify(adminLabels) + ' vs ' + JSON.stringify(labels));
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
        // Wave 39: the sheet asks the question rather than naming one of the
        // answers, because it now offers three - keep score, play, or watch.
        ['how are you joining this round', 'index.html', 'How are you joining this round?'],
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

    // THE ATTENDANCE ROW IS GONE (Wave 13), and this is the shape a feature-coverage
    // guard has to take when the feature leaves: the row is REMOVED, not inverted into
    // "the guide must not mention it". Wave 8's own comment explains why - a pin that
    // outlives its feature is how a guard ends up demanding a lie be restored, which
    // is what happened to the QR code. attendance_test.js now owns the removal, and it
    // asserts the guide describes NO headcount, with a positive check that the guide is
    // still a guide.
    //
    // WHAT REPLACED IT AS THE ROSTER ANSWER: the Players sheet row below, which was
    // already here and is now the only roster claim the guide makes.
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
