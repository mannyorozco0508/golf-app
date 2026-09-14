// ============================================================================
// THE TAB BAR SHOWS ALL EIGHT PAGES on every consumer page, at phone width.
//
// THE PROBLEM, MEASURED (2026-09-14, cold Chrome at 390): the strip scrolled
// horizontally - scrollWidth 455 in 255px of space beside a "⋯ More" pill -
// with the scrollbar hidden and no fade. Scorecard showed, Leaderboard was
// clipped, Bets and Results were entirely off screen with nothing hinting they
// existed, and four more pages sat behind More.
//
// THE SHAPE. Two rows of four pills, emoji + short label at 12px, padding 8,
// the bar wraps instead of scrolling, More is gone:
//     📝 Card · 🏆 Board · 💰 Bets · 🤝 Results
//     ⚔️ Matches · 📊 Stats · 🚐 Trip · 🏠 Home
// The active pill keeps its filled treatment; every .nav-link is rewritten on
// load to carry ?game=CODE and &group=N; Trip is not a .nav-link (trip.html
// reads ?trip=, not ?game=) and is left bare.
//
// WHY CHROME. Widths are the whole question, and mini-dom has no layout. Each
// page is arrived on cold through tools/lib/cold-arrival.js at 390x844 with a
// round in the stub, nothing invoked; the bar is read back by geometry.
// admin.html and tournament.html keep their own nav copies and are not here.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const PAGES = ['index.html', 'leaderboard.html', 'settlement.html', 'skins.html', 'sidematches.html', 'stats.html'];
const ORDER = [['index.html', '📝', 'Card'], ['leaderboard.html', '🏆', 'Board'], ['skins.html', '💰', 'Bets'], ['settlement.html', '🤝', 'Results'],
               ['sidematches.html', '⚔️', 'Matches'], ['stats.html', '📊', 'Stats'], ['trip.html', '🚐', 'Trip'], ['admin.html', '🏠', 'Home']];
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
    return { label: a.textContent.trim(), href: a.getAttribute('href'), navLink: a.classList.contains('nav-link'), active: a.classList.contains('active'),
             left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, top: Math.round(r.top), w: Math.round(r.width * 10) / 10, h: Math.round(r.height),
             scrollW: a.scrollWidth, clientW: a.clientWidth, font: cs.fontSize, bg: cs.backgroundColor, color: cs.color }; });
  return JSON.stringify({ vw: window.innerWidth, wrapLeft: Math.round(wr.left), wrapRight: Math.round(wr.right), wrapW: Math.round(wr.width),
    barW: Math.round(br.width), barScrollW: bar.scrollWidth, barClientW: bar.clientWidth, barOverflowX: getComputedStyle(bar).overflowX, wrapH: Math.round(wr.height),
    docScrollW: document.documentElement.scrollWidth, more: !!document.querySelector('.nav-more'), rows: Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return rows[k]; }), items: items,
    heading: (function () { var h = document.querySelector('.hole-view-header'); var f = document.querySelector('#hole-view-card .score-input'); return h ? { headingTop: Math.round(h.getBoundingClientRect().top), firstBoxTop: f ? Math.round(f.getBoundingClientRect().top) : null } : null; })() });
})()`;

const S = {};
before(async () => {
    for (const pg of PAGES) {
        const r = await arriveCold({ url: fileUrl(pg, 'game=NAVBAR&group=1'), db: DB, settleMs: 3000, steps: [{ expression: PROBE }] });
        S[pg] = r.ok ? JSON.parse(r.value[0]) : { reason: r.reason };
    }
});

PAGES.forEach(pg => {
    describe('TAB BAR at 390 — ' + pg, () => {
        test('ran', () => assert.ok(S[pg] && !S[pg].reason, S[pg] && S[pg].reason));
        test('eight pills, in the agreed order, with the agreed emoji and short labels', () => {
            const v = S[pg];
            assert.deepEqual(v.items.map(i => [i.href.split('?')[0], i.label]), ORDER.map(([h, e, l]) => [h, e + ' ' + l]));
        });
        test('two rows of four, every pill inside the wrapper, none clipped, nothing scrolls sideways, no More', () => {
            const v = S[pg];
            assert.deepEqual(v.rows, [4, 4], 'rows: ' + JSON.stringify(v.rows));
            v.items.forEach(i => {
                assert.ok(i.left >= v.wrapLeft - 0.5 && i.right <= v.wrapRight + 0.5, i.label + ' runs past the wrapper: ' + i.left + '-' + i.right + ' in ' + v.wrapLeft + '-' + v.wrapRight);
                assert.ok(i.scrollW <= i.clientW + 1, i.label + ' clips its own text: ' + i.scrollW + ' > ' + i.clientW);
                assert.ok(i.h >= 40, i.label + ' is a thumb target: ' + i.h);
            });
            assert.ok(v.barScrollW <= v.barClientW + 1, 'the bar scrolls sideways: ' + v.barScrollW + ' > ' + v.barClientW);
            assert.ok(v.barOverflowX !== 'auto' && v.barOverflowX !== 'scroll', 'no horizontal scroller: ' + v.barOverflowX);
            assert.ok(v.docScrollW <= v.vw, 'the document scrolls sideways: ' + v.docScrollW);
            assert.equal(v.more, false, 'the More menu is gone');
        });
        test('the active pill is this page\'s own, and it is the filled one', () => {
            const v = S[pg];
            const active = v.items.filter(i => i.active);
            assert.equal(active.length, 1); assert.equal(active[0].href.split('?')[0], pg);
            const others = v.items.filter(i => !i.active);
            assert.ok(others.every(o => o.bg !== active[0].bg), 'the active fill differs from every other pill');
            assert.notEqual(active[0].color, others[0].color, 'and its ink is different');
        });
        test('every link but Trip carries the game code and the group', () => {
            const v = S[pg];
            v.items.forEach(i => {
                if (i.href.startsWith('trip.html')) { assert.equal(i.navLink, false); assert.equal(i.href, 'trip.html'); return; }
                assert.equal(i.navLink, true, i.label);
                assert.match(i.href, /\?game=NAVBAR&group=1$/, i.label + ': ' + i.href);
            });
        });
    });
});

describe('THE ROWS FIT WITH ROOM, and the cost on the scorecard', () => {
    test('each row leaves slack on every page (reported, not asserted tightly): the widest row', () => {
        PAGES.forEach(pg => {
            const v = S[pg]; if (!v || v.reason) return;
            [0, 4].forEach(start => {
                const row = v.items.slice(start, start + 4);
                const used = row[row.length - 1].right - row[0].left;
                assert.ok(v.wrapW - used >= 0, pg + ' row ' + (start / 4 + 1) + ' uses ' + used + ' of ' + v.wrapW);
            });
        });
    });
    test('index.html: the heading and first box on arrival (the extra row\'s cost is what moved them)', () => {
        const v = S['index.html'];
        assert.ok(v.heading && v.heading.headingTop > 0, JSON.stringify(v.heading));
    });
});

describe('THE SEAM (source): the six pages carry the same bar; admin.html and tournament.html are left alone', () => {
    const BAR = PAGES.map(f => { const s = read(f); const a = s.indexOf('<div class="app-nav-wrap">'); return s.slice(a, s.indexOf('</div>\n    </div>', a)); });
    test('the same eight anchors in the same order on all six, the active class the only difference', () => {
        const norm = BAR.map(b => b.replace(/ active/g, ''));
        norm.forEach((b, i) => assert.equal(b, norm[0], PAGES[i] + ' differs from index.html'));
        ORDER.forEach(([href, emoji, label]) => assert.ok(norm[0].includes(`href="${href}" class="top-nav-item${href === 'trip.html' ? '' : ' nav-link'}${href === 'sidematches.html' ? ' matches-nav-link' : ''}">${emoji} ${label}</a>`), href));
    });
    test('no More menu, no horizontal scroller, no outside-tap listener on any of the six', () => {
        PAGES.forEach(f => {
            const s = read(f);
            assert.ok(!/<details class="nav-more"/.test(s), f + ' still has the More menu');
            assert.ok(!/\.nav-more/.test(s), f + ' still styles .nav-more');
            assert.ok(!/details\.nav-more\[open\]/.test(s), f + ' still listens for the popover');
            const css = s.slice(s.indexOf('.top-nav-bar {'), s.indexOf('}', s.indexOf('.top-nav-bar {')));
            assert.match(css, /flex-wrap: wrap/); assert.ok(!/overflow-x/.test(css), f + ': the bar must not scroll');
        });
    });
    test('the nav-link rewrite is unchanged on each page', () => {
        PAGES.forEach(f => assert.match(read(f), /querySelectorAll\('\.nav-link'\)\.forEach\(link => \{/, f));
    });
    test('admin.html and tournament.html keep their own nav, untouched by this wave', () => {
        assert.match(read('admin.html'), /<details class="nav-more" open>/);
        assert.match(read('admin.html'), /📝 Scorecard<\/a>/);
        assert.match(read('tournament.html'), /<div class="top-nav-bar">/);
    });
});
