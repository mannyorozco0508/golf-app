// ============================================================================
// THE TAB BAR SHOWS ALL EIGHT PAGES on every consumer page, at phone width.
//
// THE PROBLEM, MEASURED (2026-09-14, cold Chrome at 390): the strip scrolled
// horizontally - scrollWidth 455 in 255px of space beside a "⋯ More" pill -
// with the scrollbar hidden and no fade. Scorecard showed, Leaderboard was
// clipped, Bets and Results were entirely off screen with nothing hinting they
// existed, and four more pages sat behind More.
//
// THE SHAPE, as of Wave 15 (2026-09-26): NINE pills, the glyph STACKED ABOVE a
// LONG label at 12px, padding 8px 4px, two rows, the bar wraps, More is gone:
//     📝 Scorecard · 🏆 Leaderboard · 💰 Bets · 🤝 Results · ⚔️ Matches
//     📖 Game · 🚐 Trip · 🏠 Home · 🧭 How it works
//
// WHY STACKED, MEASURED at 390x844 on all eight pages. The labels are the long
// ones on every page now (Manny's call: uniform, and uniform means Scorecard and
// Leaderboard). Beside the label, the glyph makes that THREE rows - 203px instead
// of 139px, on every one of the eight, because the pills are flex: 1 1 auto and
// wrapping is decided by intrinsic width:
//     intrinsic total, admin.html (326px of bar, ~610px in two rows)
//       short 8, glyph beside label   570px   2 rows
//       long  8, glyph beside label   644px   3 rows
//       long  9, glyph beside label   758px   3 rows
//       long  9, glyph ABOVE label    523px   2 rows
// Stacking costs NOTHING in height: the pill is content-box with min-height 40px
// and 8px padding, so one 13.8px line already leaves 26px spare and the second
// line fits inside it. Measured 139px of wrapper before and after, pills 58px.
// Nothing else reached two rows at nine pills - not 11px type, not zero
// horizontal padding, not a 3px gap. 9px type did, with 2px of slack.
//
// AT 360px (logged, pre-existing, NOT this wave): today's shipped bar is ALREADY
// three rows there - leaderboard [4,3,1], admin [3,3,2], index [4,4]. Two rows has
// only ever held from 375 up. Stacked measures two rows at 360 on seven of the
// eight, admin [4,4,1]. These assertions run at 390, which is Manny's phone.
//
// RE-PINNED 2026-09-20 (v186): the Stats slot became the Game tab (game.html -
// what is being played, read-only). stats.html stays in the repo as a parity
// surface but has no pill and no active state, so game.html takes its place in
// PAGES.
// The active pill keeps its filled treatment; every .nav-link is rewritten on
// load to carry ?game=CODE and &group=N; Trip is not a .nav-link (trip.html
// reads ?trip=, not ?game=) and neither is How it works (instructions.html reads
// nothing), so both are left bare.
//
// WHY CHROME. Widths are the whole question, and mini-dom has no layout. Each
// page is arrived on cold through tools/lib/cold-arrival.js at 390x844 with a
// round in the stub, nothing invoked; the bar is read back by geometry.
// tournament.html is Rattle's own bar and is not here.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

// stats.html JOINED 2026-09-26 (after Wave 14): its bar wraps correctly and has since
// 2026-09-14, but it was absent from this list - right by accident rather than by
// assertion. Wave 14 found admin.html drifting for exactly that reason, so the page that
// was silently correct is now checked.
//
// admin.html JOINED 2026-09-26 (Wave 15). It was the last page on its own copy of the
// bar and it drifted twice; now it carries the same nine pills as the other seven and
// answers to the same assertions. IT ARRIVES WITH ?game= AND NO &group=, which is why
// this list is pairs and not names: with BOTH parameters, redirectGroupScorekeeper
// location.replace()s to index.html at parse - a Wave 189 safety rule, correct, and it
// would mean measuring index.html's bar under admin.html's name. A bare ?game= is also
// the arrival an organizer actually has on this page.
const PAGES = [['index.html', 'game=NAVBAR&group=1'], ['leaderboard.html', 'game=NAVBAR&group=1'],
               ['settlement.html', 'game=NAVBAR&group=1'], ['skins.html', 'game=NAVBAR&group=1'],
               ['sidematches.html', 'game=NAVBAR&group=1'], ['game.html', 'game=NAVBAR&group=1'],
               ['stats.html', 'game=NAVBAR&group=1'], ['admin.html', 'game=NAVBAR']];
const NAMES = PAGES.map(([f]) => f);
// [href, glyph, label] as a TRIPLE, not the concatenated "glyph label" string the short
// bar used: the pill's text is now two spans, so a concatenation assertion would pass on
// a pill that had lost the glyph element and kept the characters, or vice versa.
const ORDER = [['index.html', '📝', 'Scorecard'], ['leaderboard.html', '🏆', 'Leaderboard'], ['skins.html', '💰', 'Bets'], ['settlement.html', '🤝', 'Results'],
               ['sidematches.html', '⚔️', 'Matches'], ['game.html', '📖', 'Game'], ['trip.html', '🚐', 'Trip'], ['admin.html', '🏠', 'Home'],
               // 🧭, not 📖: for one wave the guide shared Game's glyph and the two sat
               // side by side in this bar. rattle_icon_system_test.js now asserts the nine
               // glyphs are nine distinct ones, so this triple is the other half of that.
               ['instructions.html', '🧭', 'How it works']];
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const CD = makeCourseData(18);
const P = makePlayers(['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'], [2, 9, 15, 4, 20, 7, 11, 0], 101);
const ROUND = { eventName: 'Nav', courseName: 'Test', players: P, gameFormat: 'stroke', skinsBuyIn: 0, skinsCarryOver: false, courseData: CD, scores: {}, settlementMode: 'whole-dollar' };
const DB = { events: { NAVBAR: ROUND }, global_courses: {}, trips: {}, tournaments: {} };

const PROBE = `(function(){
  var wrap = document.querySelector('.app-nav-wrap'); var bar = document.getElementById('app-nav-bar');
  var pills = Array.from(bar.querySelectorAll('.top-nav-item'));
  var wr = wrap.getBoundingClientRect(), br = bar.getBoundingClientRect();
  var rows = {};
  var items = pills.map(function (a) { var r = a.getBoundingClientRect(); var cs = getComputedStyle(a); var key = Math.round(r.top);
    rows[key] = (rows[key] || 0) + 1;
    var g = a.querySelector('.tni-glyph'), lb = a.querySelector('.tni-label');
    var gr = g ? g.getBoundingClientRect() : null, lr = lb ? lb.getBoundingClientRect() : null;
    return { label: lb ? lb.textContent.trim() : null, glyph: g ? g.textContent.trim() : null,
             href: a.getAttribute('href'), navLink: a.classList.contains('nav-link'), active: a.classList.contains('active'),
             left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, top: Math.round(r.top), w: Math.round(r.width * 10) / 10, h: Math.round(r.height),
             // THE STACK, measured rather than inferred from the CSS: the label's box starts
             // below the glyph's, and they do not share a line. A collapsed stack reads the
             // same height as a stacked one (the pill's min-height swallows both), so height
             // alone cannot tell them apart - the y positions can.
             stacked: !!(gr && lr && lr.top >= gr.bottom - 1), glyphTop: gr ? Math.round(gr.top * 10) / 10 : null,
             labelTop: lr ? Math.round(lr.top * 10) / 10 : null, glyphH: gr ? Math.round(gr.height * 10) / 10 : null,
             scrollW: a.scrollWidth, clientW: a.clientWidth, font: cs.fontSize, bg: cs.backgroundColor, color: cs.color }; });
  return JSON.stringify({ vw: window.innerWidth, wrapLeft: Math.round(wr.left), wrapRight: Math.round(wr.right), wrapW: Math.round(wr.width),
    barW: Math.round(br.width), barScrollW: bar.scrollWidth, barClientW: bar.clientWidth, barOverflowX: getComputedStyle(bar).overflowX, wrapH: Math.round(wr.height),
    docScrollW: document.documentElement.scrollWidth, more: !!document.querySelector('.nav-more'), rows: Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return rows[k]; }), items: items,
    heading: (function () { var h = document.querySelector('.hole-view-header'); var f = document.querySelector('#hole-view-card .score-input'); return h ? { headingTop: Math.round(h.getBoundingClientRect().top), firstBoxTop: f ? Math.round(f.getBoundingClientRect().top) : null } : null; })() });
})()`;

const S = {};
before(async () => {
    for (const [pg, query] of PAGES) {
        const r = await arriveCold({ url: fileUrl(pg, query), db: DB, settleMs: 3000, steps: [{ expression: PROBE }] });
        S[pg] = r.ok ? JSON.parse(r.value[0]) : { reason: r.reason };
        // An arrival that redirected measured the wrong page's bar. admin.html is the one
        // this can happen to, and it is why it arrives without &group=.
        if (r.ok && r.finalUrl && r.finalUrl.indexOf(pg) === -1) S[pg] = { reason: 'redirected to ' + r.finalUrl };
    }
});

NAMES.forEach(pg => {
    describe('TAB BAR at 390 — ' + pg, () => {
        test('ran', () => assert.ok(S[pg] && !S[pg].reason, S[pg] && S[pg].reason));
        test('nine pills, in the agreed order, each with its own glyph element and long label', () => {
            const v = S[pg];
            assert.deepEqual(v.items.map(i => [i.href.split('?')[0], i.glyph, i.label]), ORDER);
        });
        test('the glyph sits ABOVE the label on every pill, which is what buys the second row back', () => {
            // The whole wave is here. Beside the label these nine pills are three rows on
            // every page; above it they are two, at the same 139px and the same 12px type.
            const v = S[pg];
            v.items.forEach(i => assert.ok(i.stacked,
                i.label + ': the glyph is not above the label (glyph top ' + i.glyphTop + ', label top ' + i.labelTop + ')'));
        });
        test('two rows, nine pills, every pill inside the wrapper, none clipped, nothing scrolls sideways, no More', () => {
            const v = S[pg];
            // NOT a fixed pair: index.html has 342px of bar and measures [5,4], the six
            // middle pages have 334px and measure [4,5], admin.html has 326px and measures
            // [4,5]. What the wave promised is TWO ROWS and NINE PILLS, so that is what is
            // asserted; pinning [4,4] would be pinning one page's container padding.
            assert.equal(v.rows.length, 2, 'rows: ' + JSON.stringify(v.rows));
            assert.equal(v.rows.reduce((a, b) => a + b, 0), 9, 'pills across the rows: ' + JSON.stringify(v.rows));
            v.items.forEach(i => {
                assert.ok(i.left >= v.wrapLeft - 0.5 && i.right <= v.wrapRight + 0.5, i.label + ' runs past the wrapper: ' + i.left + '-' + i.right + ' in ' + v.wrapLeft + '-' + v.wrapRight);
                assert.ok(i.scrollW <= i.clientW + 1, i.label + ' clips its own text: ' + i.scrollW + ' > ' + i.clientW);
                // 44px, not 40: the control minimum this project holds everything else to.
                // Measured 58px, so the headroom is real and not a re-pin of the result.
                assert.ok(i.h >= 44, i.label + ' is a thumb target: ' + i.h);
            });
            assert.ok(v.barScrollW <= v.barClientW + 1, 'the bar scrolls sideways: ' + v.barScrollW + ' > ' + v.barClientW);
            assert.ok(v.barOverflowX !== 'auto' && v.barOverflowX !== 'scroll', 'no horizontal scroller: ' + v.barOverflowX);
            assert.ok(v.docScrollW <= v.vw, 'the document scrolls sideways: ' + v.docScrollW);
            assert.equal(v.more, false, 'the More menu is gone');
        });
        test('the active pill is this page\'s own, and it is the filled one', () => {
            // stats.html HAS NO PILL OF ITS OWN, so this one cannot apply to it. The Game
            // tab took Stats' nav slot (v186) and stats.html stays only as the parity
            // surface 43 tests read - there is no href="stats.html" anywhere in the app,
            // so no pill can be active on it. Exempted rather than weakened: every OTHER
            // assertion in this file runs against stats.html, including the geometry ones
            // that would have caught admin.html's drifting strip.
            if (pg === 'stats.html') return;
            const v = S[pg];
            // admin.html's own pill is 🏠 Home, so this DOES apply to it - the one page
            // whose pill is not named after its file.
            const active = v.items.filter(i => i.active);
            assert.equal(active.length, 1); assert.equal(active[0].href.split('?')[0], pg);
            const others = v.items.filter(i => !i.active);
            assert.ok(others.every(o => o.bg !== active[0].bg), 'the active fill differs from every other pill');
            assert.notEqual(active[0].color, others[0].color, 'and its ink is different');
        });
        test('every link but Trip and Home carries the game code and the group', () => {
            // HOME EXEMPTED 2026-09-26 (Wave 14), and this assertion is why the defect
            // survived: it REQUIRED the parameter that broke Home. With
            // ?game=X&group=1 on it, a tap went index.html -> admin.html and
            // admin.html's redirectGroupScorekeeper - seeing game AND group, which is
            // precisely the case it guards - location.replace'd straight back to the
            // scorecard. A golfer on a group link could not leave the round from the
            // nav bar on any of the seven pages, and this line said that was correct.
            //
            // Home now carries nothing, like Trip: it is the pill that LEAVES the round,
            // so it goes to the bare lobby - the same place "Save & Return to Home" on
            // the scorecard has always gone. home_pill_test.js TAPS it on every page and
            // asserts where the browser ends up, which is the assertion this one could
            // never be: an href that looks right is not a tap that lands.
            //
            // HOW IT WORKS IS EXEMPT TOO (Wave 15, and for the same kind of reason as Trip):
            // instructions.html reads no round at all. It is not a .nav-link, so the
            // rewriter never touches it, and it must stay a bare href.
            //
            // AND admin.html ITSELF arrives with ?game= and no &group= (see PAGES), so its
            // pills carry the code without a group. That is the rewriter doing exactly what
            // it says: `if (groupParam) navHref += '&group=' + groupParam`.
            const v = S[pg];
            const want = pg === 'admin.html' ? /\?game=NAVBAR$/ : /\?game=NAVBAR&group=1$/;
            v.items.forEach(i => {
                if (i.href.startsWith('trip.html')) { assert.equal(i.navLink, false); assert.equal(i.href, 'trip.html'); return; }
                if (i.href.startsWith('instructions.html')) { assert.equal(i.navLink, false); assert.equal(i.href, 'instructions.html'); return; }
                if (i.href.split('?')[0] === 'admin.html') {
                    assert.equal(i.href, 'admin.html',
                        'Home must carry no round: ' + i.href);
                    return;
                }
                assert.equal(i.navLink, true, i.label);
                assert.match(i.href, want, i.label + ': ' + i.href);
            });
        });
    });
});

describe('THE ROWS FIT WITH ROOM, and the cost on the scorecard', () => {
    test('each row leaves slack on every page (reported, not asserted tightly): the widest row', () => {
        NAMES.forEach(pg => {
            const v = S[pg]; if (!v || v.reason) return;
            // DERIVED from the measured tops, not sliced 0-4 and 4-8: the rows are no longer
            // four and four (index [5,4], the rest [4,5]), and a hard-coded slice would have
            // measured a row that straddles the wrap.
            const byTop = new Map();
            v.items.forEach(i => { if (!byTop.has(i.top)) byTop.set(i.top, []); byTop.get(i.top).push(i); });
            assert.equal(byTop.size, 2, pg + ' is not two rows: ' + byTop.size);
            [...byTop.entries()].sort((a, b) => a[0] - b[0]).forEach(([top, row], n) => {
                const used = row[row.length - 1].right - row[0].left;
                assert.ok(v.wrapW - used >= 0, pg + ' row ' + (n + 1) + ' uses ' + used + ' of ' + v.wrapW);
            });
        });
    });
    test('index.html: the heading and first box on arrival (the extra row\'s cost is what moved them)', () => {
        const v = S['index.html'];
        assert.ok(v.heading && v.heading.headingTop > 0, JSON.stringify(v.heading));
    });
});

describe('THE SEAM (source): all eight pages carry the same bar; tournament.html has its own', () => {
    const BAR = NAMES.map(f => { const s = read(f); const a = s.indexOf('<div class="app-nav-wrap">'); return s.slice(a, s.indexOf('</div>\n    </div>', a)); });
    test('the same nine anchors in the same order on all eight, the active class the only difference', () => {
        const norm = BAR.map(b => b.replace(/ active/g, ''));
        norm.forEach((b, i) => assert.equal(b, norm[0], NAMES[i] + ' differs from index.html'));
        // The two spans are part of the seam: the glyph is an ELEMENT now, because that is
        // what puts it on its own line. A pill written as one text run would be the
        // three-row bar again, and this string is what refuses it.
        ORDER.forEach(([href, emoji, label]) => assert.ok(norm[0].includes(`href="${href}" class="top-nav-item${href === 'trip.html' || href === 'instructions.html' ? '' : ' nav-link'}${href === 'sidematches.html' ? ' matches-nav-link' : ''}"><span class="tni-glyph">${emoji}</span><span class="tni-label">${label}</span></a>`), href));
    });
    test('the stack is in the stylesheet on all eight, not left to the markup', () => {
        NAMES.forEach(f => {
            const s = read(f);
            const css = s.slice(s.indexOf('.top-nav-item {'), s.indexOf('}', s.indexOf('.top-nav-item {')));
            assert.match(css, /flex-direction: column/, f + ': the pill does not stack');
            assert.match(css, /padding: 8px 4px/, f + ': the measured padding is not what ships');
            assert.ok(/\.tni-glyph/.test(s) && /\.tni-label/.test(s), f + ': the two spans are unstyled');
        });
    });
    test('no More menu, no horizontal scroller, no outside-tap listener on any of the eight', () => {
        NAMES.forEach(f => {
            const s = read(f);
            assert.ok(!/<details class="nav-more"/.test(s), f + ' still has the More menu');
            assert.ok(!/\.nav-more/.test(s), f + ' still styles .nav-more');
            assert.ok(!/details\.nav-more\[open\]/.test(s), f + ' still listens for the popover');
            const css = s.slice(s.indexOf('.top-nav-bar {'), s.indexOf('}', s.indexOf('.top-nav-bar {')));
            assert.match(css, /flex-wrap: wrap/); assert.ok(!/overflow-x/.test(css), f + ': the bar must not scroll');
        });
    });
    test('the nav-link rewrite is unchanged on each page', () => {
        NAMES.forEach(f => assert.match(read(f), /querySelectorAll\('\.nav-link'\)\.forEach\(link => \{/, f));
    });
    test('admin.html no longer has a nav of its own, and tournament.html still does', () => {
        // This test used to assert the OPPOSITE for admin.html - that it kept a More menu
        // and a bar of its own - because six waves running left it alone by instruction.
        // Wave 15 is that instruction being withdrawn: it drifted twice (the strip that
        // scrolled, then the menu that shipped open), and the fix both times was to make it
        // the same page as the other seven. tournament.html is Rattle, a separate product.
        const admin = read('admin.html');
        assert.ok(!/nav-more/.test(admin), 'admin.html still mentions the More menu');
        assert.ok(!/>📝 Scorecard<\/a>/.test(admin), 'admin.html still writes the label as one text run');
        assert.match(read('tournament.html'), /<div class="top-nav-bar">/);
        assert.ok(!/app-nav-wrap/.test(read('tournament.html')), 'Rattle picked up the consumer bar');
    });
});
