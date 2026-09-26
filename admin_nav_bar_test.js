// ============================================================================
// THE SETUP SCREEN'S TAB STRIP STAYS PUT (Wave 14)
//
// Manny's phone, admin.html on an existing round at 390x844: two screenshots seconds
// apart showed the strip in different horizontal positions - Leaderboard/Bets/Results
// clipped at the left in one, Matches hanging off the right in the other.
//
// IT WAS A HORIZONTAL SCROLLER WITH THE SCROLLBAR SUPPRESSED:
//     overflow-x: auto · flex-wrap: nowrap · scrollbar-width: none
//     .top-nav-bar::-webkit-scrollbar { display: none }
// Measured before the fix: the bar was 326px wide with a scrollWidth of 542 - 216px of
// pills hidden, with nothing on screen to say they were there - and setting
// scrollLeft = 200 moved the first pill exactly 200px. A thumb brushing it while
// scrolling the page slid it, and nothing snapped it back.
//
// THIS EXACT BUG WAS DIAGNOSED AND FIXED ON 2026-09-14, on seven pages. index.html's
// own comment describes it in the past tense - "the scrollbar was hidden, so Scorecard
// showed, Leaderboard was clipped and Bets and Results were entirely off screen with
// nothing hinting they existed" - and that wave's claim that "all eight pages are pills
// in the bar" overstated its reach: admin.html kept the scroller it was describing.
//
// AND nav_bar_test.js COULD NOT HAVE CAUGHT IT. That suite asserts exactly the right
// things, on six pages, and its PAGES list omits admin.html - the exclusion is written
// into a describe title: "the six pages carry the same bar; admin.html and
// tournament.html are left alone". A correct guard, scoped around the one page with the
// defect. So this file exists to cover admin.html with something.
//
// DELIBERATELY NARROW: it asserts the strip cannot slide, nothing clips, and every pill
// is a thumb target. It does NOT assert the eight-pill shape or the short labels -
// making admin.html's bar identical to the other seven is a separate decision, with two
// links that have nowhere else to go (the guide route guide_coverage_test.js depends on,
// and Season). Logged, not smuggled in here.
//
// mini-dom cannot see any of this: getBoundingClientRect returns a hard-coded zero rect
// there. And the bar lives inside #admin-screen, which is display:none until the wizard
// opens - a cold arrival that lands on the lobby measures 0x0, which is a hidden
// container and not the defect. It is revealed the way the page reveals it.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const ADMIN = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const ROUNDS = {
    W14BAR: {
        eventName: 'Wave 14', gameFormat: 'stroke',
        players: ['Ann', 'Ben', 'Cal', 'Dee'].map((n, i) => ({
            id: 101 + i, name: n, hcp: '10', playingForMoney: true })),
        courseData: CD, scores: {}, settlementMode: 'whole-dollar', ownerUid: 'anon-stub',
    },
};

const MEASURE = `(function () {
    // The wizard screen, shown the way the page shows it.
    ['lobby-screen', 'round-ready-screen', 'setup-refused-screen'].forEach(function (id) {
        var e = document.getElementById(id); if (e) e.style.display = 'none';
    });
    var scr = document.getElementById('admin-screen');
    if (scr) scr.style.display = 'block';
    var bar = document.getElementById('app-nav-bar');
    if (!bar) return JSON.stringify({ error: 'no #app-nav-bar' });
    var cs = getComputedStyle(bar);
    var r = bar.getBoundingClientRect();
    var items = [].slice.call(bar.querySelectorAll('.top-nav-item'))
        .filter(function (a) { return a.getClientRects().length > 0; })
        .map(function (a) {
            var b = a.getBoundingClientRect();
            return { label: String(a.innerText || '').trim().slice(0, 20),
                     left: Math.round(b.left), right: Math.round(b.right),
                     w: Math.round(b.width), h: Math.round(b.height),
                     scrollW: a.scrollWidth, clientW: a.clientWidth };
        });
    // THE DRIFT, TESTED BEHAVIOURALLY: try to slide it and see if anything moves.
    var firstBefore = items.length ? items[0].left : null;
    bar.scrollLeft = 200;
    var f = bar.querySelector('.top-nav-item');
    var firstAfter = f ? Math.round(f.getBoundingClientRect().left) : null;
    bar.scrollLeft = 0;
    return JSON.stringify({
        vw: window.innerWidth,
        barW: Math.round(r.width), barH: Math.round(r.height),
        overflowX: cs.overflowX, flexWrap: cs.flexWrap,
        position: cs.position, transform: cs.transform,
        barScrollW: bar.scrollWidth, barClientW: bar.clientWidth,
        docScrollW: document.documentElement.scrollWidth,
        items: items,
        slidBy: (firstBefore !== null && firstAfter !== null) ? (firstBefore - firstAfter) : null
    });
})();`;

let M = null;

describe('ADMIN.HTML\'S TAB STRIP (Chrome, 390x844)', () => {
    before(async () => {
        const r = await arriveCold({
            url: fileUrl('admin.html', 'game=W14BAR'), rounds: ROUNDS, settleMs: 3000,
            viewport: { width: 390, height: 844 }, steps: [{ expression: MEASURE }],
        });
        assert.equal(r.ok, true, 'the arrival failed, so NOTHING is proven: ' + r.reason);
        const raw = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{');
        assert.equal(raw.length, 1, 'expected one measurement: ' + JSON.stringify(r.value));
        M = JSON.parse(raw[0]);
        assert.ok(!M.error, M.error);
        // THE POSITIVE HALF. Every assertion below is about the bar behaving; a bar that
        // rendered nothing would satisfy most of them. 0x0 is what a hidden container
        // measures, and that is the trap this guard has to avoid reporting as a pass.
        assert.ok(M.barW > 100, 'the bar did not render: ' + M.barW + 'x' + M.barH);
        assert.ok(M.items.length >= 8, 'only ' + M.items.length + ' pills rendered');
    }, { timeout: 90000 });

    test('THE STRIP CANNOT SLIDE', () => {
        assert.ok(M.barScrollW <= M.barClientW + 1,
            'the bar scrolls sideways: scrollWidth ' + M.barScrollW + ' against clientWidth '
            + M.barClientW + ' - ' + (M.barScrollW - M.barClientW) + 'px of pills are hidden');
        assert.notEqual(M.overflowX, 'auto', 'overflow-x is auto - a horizontal scroller');
        assert.notEqual(M.overflowX, 'scroll', 'overflow-x is scroll - a horizontal scroller');
        // And proved by trying: sliding it must move nothing.
        assert.equal(M.slidBy, 0,
            'setting scrollLeft moved the first pill ' + M.slidBy + 'px, which is the drift');
    });

    test('and it is in flow - not sticky, not fixed, not transformed', () => {
        // Named because they were the other candidates, and ruling them out is what makes
        // the overflow finding worth acting on.
        assert.equal(M.position, 'static', 'the bar is positioned: ' + M.position);
        assert.equal(M.transform, 'none', 'the bar is transformed: ' + M.transform);
    });

    test('NOTHING IS CLIPPED: every pill is on screen, whole', () => {
        const off = M.items.filter(i => i.right > M.vw + 0.5 || i.left < -0.5)
            .map(i => i.label + ' ' + i.left + '-' + i.right);
        assert.deepEqual(off, [], 'these pills run off the ' + M.vw + 'px screen: ' + off.join(', '));
        const clipped = M.items.filter(i => i.scrollW > i.clientW + 1)
            .map(i => i.label + ' ' + i.scrollW + '>' + i.clientW);
        assert.deepEqual(clipped, [], 'these pills clip their own text: ' + clipped.join(', '));
    });

    test('every pill is a thumb target', () => {
        const small = M.items.filter(i => i.h < 40).map(i => i.label + ' ' + i.h + 'px');
        assert.deepEqual(small, [], 'under 40px: ' + small.join(', '));
    });

    test('the page itself does not scroll sideways', () => {
        assert.ok(M.docScrollW <= M.vw,
            'document scrollWidth ' + M.docScrollW + ' against a ' + M.vw + 'px viewport');
    });

    test('the source no longer suppresses a scrollbar it does not need', () => {
        // The scrollbar suppression is what made the drift invisible: a strip that slides
        // AND shows no bar gives a golfer nothing to read. If overflow ever comes back,
        // this is the line that says the hiding came with it.
        const rule = ADMIN.slice(ADMIN.indexOf('.top-nav-bar {'), ADMIN.indexOf('}', ADMIN.indexOf('.top-nav-bar {')) + 1);
        assert.ok(rule.length > 40, 'the .top-nav-bar rule could not be sliced');
        assert.ok(!/overflow-x:\s*(auto|scroll)/.test(rule), 'the rule is a scroller again: ' + rule);
        assert.ok(!/scrollbar-width:\s*none/.test(rule), 'the rule hides a scrollbar: ' + rule);
        assert.ok(!/::-webkit-scrollbar/.test(
            ADMIN.slice(ADMIN.indexOf('.top-nav-bar {'), ADMIN.indexOf('.top-nav-bar {') + 600)),
            'the webkit scrollbar is still hidden beside the rule');
        // POSITIVE: it is still the bar, and it still wraps.
        assert.match(rule, /flex-wrap:\s*wrap/, 'the bar does not wrap: ' + rule);
        assert.match(rule, /display:\s*flex/, 'the bar is no longer a flex row: ' + rule);
    });
});
