// ============================================================================
// BACK FROM THE GUIDE RETURNS TO THE ROUND (Wave 28)
//
// THE REPORT: from a round's scorecard - GFLBAM, group 3 - Manny tapped "How it
// works", read it, tapped "Back to Home" and was out of the round, on the Home screen.
// Reproduced on the web AND in the iOS app run from Xcode.
//
// TWO CAUSES, and the second is why the first went unnoticed:
//   1. THE PILL CARRIED NOTHING. The in-round nav rewriter only touches .nav-link, and
//      the guide pill has never had that class, so the href stayed a bare
//      instructions.html and the page arrived knowing no round existed.
//   2. goBack() ASKED document.referrer AND CALLED history.back(). Neither is
//      dependable: the Capacitor shell does not hand a referrer across a capacitor://
//      navigation, and on a cold open - the app resumed straight onto the guide - there
//      is no history entry either. The fallback was admin.html, which is what he hit.
//
// SO THE WAY BACK IS EXPLICIT, IN THE URL: from= names the page, game= and group= name
// the round and the group. Those survive a cold open, a reload and the native shell,
// which is exactly what referrer and history do not. Measured end to end below with a
// REAL TAP that crosses pages, on Manny's own round code and group.
//
// WHAT THE PILL IS NOT GIVEN: admin.html's. Home is where "Back to Home" already goes,
// and a from=admin.html round trip carrying a group would hit the same
// redirectGroupScorekeeper bounce that Wave 14 documented when Home carried the round.
//
// AND from= IS CHECKED AGAINST A FIXED LIST rather than trusted, so a hand-edited
// ?from=https://... cannot turn the button into an open redirect. That is asserted,
// because a back button built from a URL parameter is exactly the shape that becomes
// one by accident.
//
// EIGHT REWRITERS, ONE EDIT. The five-line nav rewriter is duplicated byte-for-byte
// across index, leaderboard, skins, settlement, sidematches, game, stats and admin -
// verified identical by hash before editing, all eight patched, and the identity is
// pinned below so a ninth copy or a drifting one is visible.
//
// THE BASELINE, MEASURED against main 5eeb1f2 with all nine pages swapped back (git
// diff confirmed 0 files differing), all 9 tests:
//
//     2 PASS / 7 FAIL
//
// The two that pass without the fix:
//   "every journey ran"      - the fixtures reached their pages. A precondition.
//   "Home itself still carries nothing" - Wave 14's rule, green because it was already
//                              true and is the thing this wave must not undo.
// Every other case is red, INCLUDING the open-redirect refusal - before the fix there
// is no #guide-back element at all, so the forged-from= case fails on the missing
// button rather than passing vacuously.
//
// AND I FIRST WROTE 3/8 INTO THIS HEADER FROM A GUESS, before measuring:
// wrong on both numbers and not even a sum of 9. The first attempt to measure it was
// worse - a shell loop that did not word-split, so nothing was swapped and the run
// reported 9/9 against my own built files. Both are the count rule's subject, and the
// figures above are the ones the run printed.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
// TWELVE golfers in three groups, so group 3 is real and a bare link is a spectator -
// the shape Manny's round actually had.
const PL = Array.from({ length: 12 }, (_, i) => ({ id: 101 + i, name: 'P' + i, hcp: '0', playingForMoney: true }));
const ROUND = { eventName: 'Single Round', courseName: 'Test', players: PL, courseData: CD,
    gameFormat: 'stroke', scores: {}, settlementMode: 'whole-dollar' };

const LOOK = `JSON.stringify({
  page: location.href.split('/').pop(),
  guidePill: (function () {
    var a = Array.prototype.slice.call(document.querySelectorAll('.top-nav-item'))
      .filter(function (x) { return (x.getAttribute('href') || '').split('?')[0] === 'instructions.html'; })[0];
    return a ? a.getAttribute('href') : 'none';
  })(),
  backText: (function () { var b = document.getElementById('guide-back');
    return b ? (b.textContent || '').trim() : 'no back btn'; })(),
  backHref: (function () { var b = document.getElementById('guide-back');
    return b ? (b.getAttribute('href') || '') : ''; })()
})`;

// A REAL TAP that crosses pages, then a REAL TAP on Back - so what is asserted is
// where the browser ends up, not what an href looked like.
async function journey(startPage, query, opts) {
    const o = opts || {};
    // A BARE LINK ON A MULTI-GROUP ROUND PUTS THE GROUP PICKER OVER THE NAV BAR at
    // z-index 999, so a tap aimed at a pill lands on the overlay. "Just watching" is
    // the spectator the page itself offers, and dismissing it is what makes this case
    // real - my first version tapped into the overlay, read "no back btn", and blamed
    // the feature.
    // data-role="watching" NAMES THE ROW (Wave 39). The sheet had one
    // btn-outline - "Just watching" - and this selected it by class. It now
    // has three rows, two of them outline, so a class selector picks
    // whichever comes first: measured, it tapped "I'm playing" and landed on
    // the name picker instead of the card.
    // THE NAV BAR IS IN THE STATUS SHEET NOW (2026-10-04), so a golfer reaches it
    // with one tap on the handle - and so does this check. A real fix rather than a
    // pin: an element inside a closed sheet is off screen, and a tap at its
    // coordinates lands on whatever is actually there.
    const OPEN_SHEET = [{ tap: '#round-sheet-handle' }, { sleep: 500 }];
    const steps = (o.dismissPicker ? [{ tap: '#group-pick-overlay [data-role="watching"]' }, { sleep: 700 }] : [])
        .concat([{ expression: "'START:' + " + LOOK },
                   ...OPEN_SHEET,
                   { tap: '.top-nav-item[href^="instructions.html"]' }, { sleep: 1200 },
                   { expression: "'GUIDE:' + " + LOOK }]);
    if (!o.stopAtGuide) steps.push({ tap: '#guide-back' }, { sleep: 1200 }, { expression: "'BACK:' + " + LOOK });
    const r = await arriveCold({ url: fileUrl(startPage, query),
        db: { events: { GFLBAM: ROUND }, global_courses: {}, trips: {}, tournaments: {} },
        settleMs: 3000, viewport: { width: 390, height: 844 }, steps });
    if (!r.ok) return { error: r.reason };
    const out = {};
    (r.value || []).forEach(v => {
        if (typeof v === 'string' && v.indexOf(':{') > -1) out[v.slice(0, v.indexOf(':{'))] = JSON.parse(v.slice(v.indexOf(':{') + 1));
    });
    return out;
}

const S = {};
before(async () => {
    S.card = await journey('index.html', 'game=GFLBAM&group=3');       // the report, exactly
    S.matches = await journey('sidematches.html', 'game=GFLBAM&group=3');
    S.spectator = await journey('index.html', 'game=GFLBAM', { dismissPicker: true });
    // AN ORDINARY VISIT, arrived at directly rather than tapped. On a bare admin.html
    // the guide pill is laid out 0x0 - MEASURED - so the lobby does not offer the
    // in-round bar and there is nothing to tap there. That is the page's own behaviour
    // and not this wave's business; what matters is that a guide opened with no from=
    // still says Home and goes there, the "opened any other way" case.
    S.home = await arriveCold({ url: fileUrl('instructions.html', ''),
        db: { events: { GFLBAM: ROUND }, global_courses: {}, trips: {}, tournaments: {} },
        settleMs: 1200, viewport: { width: 390, height: 844 },
        steps: [{ expression: "'GUIDE:' + " + LOOK }, { tap: '#guide-back' }, { sleep: 1200 },
                { expression: "'BACK:' + " + LOOK }] }).then(r => {
        if (!r.ok) return { error: r.reason };
        const out = {};
        (r.value || []).forEach(v => { if (typeof v === 'string' && v.indexOf(':{') > -1)
            out[v.slice(0, v.indexOf(':{'))] = JSON.parse(v.slice(v.indexOf(':{') + 1)); });
        return out;
    });
    // A hand-edited from=, arriving at the guide directly.
    const r = await arriveCold({ url: fileUrl('instructions.html', 'from=https%3A%2F%2Fevil.example&game=GFLBAM&group=3'),
        db: { events: { GFLBAM: ROUND }, global_courses: {}, trips: {}, tournaments: {} },
        settleMs: 1200, viewport: { width: 390, height: 844 }, steps: [{ expression: LOOK }] });
    S.forged = r.ok ? JSON.parse((r.value || []).filter(v => typeof v === 'string' && v.startsWith('{')).pop()) : { error: r.reason };
});

describe("BACK FROM THE GUIDE GOES WHERE YOU CAME FROM", () => {
    test('every journey ran', () => {
        Object.keys(S).forEach(k => assert.ok(S[k] && !S[k].error, k + ': ' + (S[k] && S[k].error)));
    });

    test("THE REPORT: scorecard, group 3 -> How it works -> Back lands on the SAME round and group", () => {
        const v = S.card;
        assert.equal(v.START.page, 'index.html?game=GFLBAM&group=3', 'the fixture did not start on the round');
        assert.equal(v.START.guidePill, 'instructions.html?from=index.html&game=GFLBAM&group=3',
            'the pill does not carry the round: ' + v.START.guidePill);
        assert.equal(v.GUIDE.page, 'instructions.html?from=index.html&game=GFLBAM&group=3',
            'the tap did not reach the guide with the round: ' + v.GUIDE.page);
        assert.equal(v.GUIDE.backText, '← Back to scorecard',
            'the button still offers Home: ' + JSON.stringify(v.GUIDE.backText));
        assert.equal(v.BACK.page, 'index.html?game=GFLBAM&group=3',
            'Back did not land on the round: ' + v.BACK.page);
    });

    test('FROM MATCHES it says Matches, and returns there - not to the scorecard', () => {
        const v = S.matches;
        assert.equal(v.START.guidePill, 'instructions.html?from=sidematches.html&game=GFLBAM&group=3');
        assert.equal(v.GUIDE.backText, '← Back to Matches', 'wrong label: ' + v.GUIDE.backText);
        assert.equal(v.BACK.page, 'sidematches.html?game=GFLBAM&group=3', 'landed on ' + v.BACK.page);
    });

    test('A SPECTATOR returns as a spectator - no ?group= appears from nowhere', () => {
        const v = S.spectator;
        assert.equal(v.START.guidePill, 'instructions.html?from=index.html&game=GFLBAM',
            'the pill invented a group: ' + v.START.guidePill);
        assert.equal(v.GUIDE.backText, '← Back to scorecard');
        assert.equal(v.BACK.page, 'index.html?game=GFLBAM', 'landed on ' + v.BACK.page);
        assert.ok(!/group=/.test(v.BACK.page), 'a group appeared on a bare link: ' + v.BACK.page);
    });

    test('AN ORDINARY VISIT still says Back to Home, and goes to the lobby', () => {
        const v = S.home;
        assert.equal(v.GUIDE.page, 'instructions.html', 'the fixture did not arrive bare');
        assert.equal(v.GUIDE.backText, '← Back to Home', 'the label changed on an ordinary visit');
        assert.equal(v.GUIDE.backHref, 'admin.html');
        assert.equal(v.BACK.page, 'admin.html', 'Back from an ordinary visit landed on ' + v.BACK.page);
    });

    test('A FORGED from= cannot turn Back into an open redirect', () => {
        const v = S.forged;
        assert.equal(v.backText, '← Back to Home', 'a forged from= was accepted: ' + v.backText);
        assert.equal(v.backHref, 'admin.html', 'the href points off-site: ' + v.backHref);
    });
});

describe('THE SOURCE: EXPLICIT PARAMS, EIGHT REWRITERS, NO HISTORY', () => {
    const strip = s => s.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
    const PAGES = ['index.html', 'leaderboard.html', 'skins.html', 'settlement.html',
                   'sidematches.html', 'game.html', 'stats.html', 'admin.html'];

    test('instructions.html asks the URL, and no longer asks history or the referrer', () => {
        // COMMENTS STRIPPED, because the new note NAMES both mechanisms to explain why
        // they are gone - and a scan that did not strip would fail on the explanation.
        const code = strip(read('instructions.html'));
        assert.ok(!/history\.back\(\)/.test(code), 'history.back() is back in the code');
        assert.ok(!/document\.referrer/.test(code), 'document.referrer is back in the code');
        assert.match(code, /function guideBackTarget\(/);
        assert.match(code, /GUIDE_BACK_TARGETS/, 'from= is not checked against a fixed list');
        assert.match(code, /new URLSearchParams\(window\.location\.search\)/);
    });

    test('all eight rewriters carry the guide-pill block, and none has drifted', () => {
        // The five-line rewriter is duplicated across eight pages. They were identical
        // before this wave (hash-checked) and must stay identical after it, or the pill
        // works on some pages and not others - which is how the original defect was
        // invisible on six of the seven in-round pages.
        const blocks = PAGES.map(f => {
            const s = read(f);
            // FROM THE IIFE, not from the `const guide` line - the Home exemption sits
            // ABOVE it, so my first slice started after the line it then asserted and
            // failed on all eight files while every one of them was correct.
            const at = s.indexOf("const here = (location.pathname.split('/').pop()");
            assert.ok(at > -1, f + ' did not get the guide-pill block');
            return strip(s.slice(at, s.indexOf('})();', at))).replace(/\s+/g, ' ').trim();
        });
        assert.equal(new Set(blocks).size, 1, 'the eight copies are not identical any more');
        blocks.forEach((b, i) => {
            assert.match(b, /from=/, PAGES[i] + ' does not pass from=');
            assert.match(b, /if \(here === 'admin\.html'\) return;/, PAGES[i] + ' lost the Home exemption');
        });
    });

    test('and Home itself still carries nothing - Wave 14 is not undone', () => {
        PAGES.forEach(f => {
            assert.match(read(f), /if \(base === 'admin\.html'\) \{ link\.href = base; return; \}/,
                f + ': the Home pill is carrying the round again');
        });
    });
});
