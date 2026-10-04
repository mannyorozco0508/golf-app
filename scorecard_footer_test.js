// ============================================================================
// THE SCORECARD FOOTER IS ONE ROW (Wave 20)
//
// BEFORE, measured cold at 390x844: three full-width cards - Round Receipt, Save &
// Return to Home, How it works - each a heading, a paragraph and a button that
// repeated the heading. 342x166 each, 518px of footer on every hole of every round,
// present whether or not there was a score to make a Receipt out of.
// (Manny's estimate was ~900px; the measurement is 518. Reported as measured.)
//
// AFTER: one row.
//     Save & exit     filled, flex 1
//     Receipt         outline, flex 1 - ONLY when the round has scores
//     How it works    icon only, fixed 60px, aria-label "How it works"
// all 52px tall, in the place the cards were. When Receipt is hidden, one grey line
// under the row carries what the paragraphs said, and that line goes when Receipt
// appears.
//
// WHAT "THE ROUND HAS SCORES" MEANS, and it is the app's own answer rather than a
// new one: computeRoundSettlement(...).started, which is
// "some golfer has at least one hole scored" (settlement-engine.js:2071 -
// playing.length > 0). ANY score in the round, not the group's and not a finished
// round, because that is what makes the Receipt worth opening:
//   - with no scores the Receipt renders a head, no money card at all
//     (renderCombinedSummary returns '' when every total is zero) and per-game cards
//     that say "Not Final" with nothing in them. Nothing to look at.
//   - with any score it has a LIVE RESULTS head with the thru count, the per-game
//     breakdowns with real numbers, and the scorecard so far. A group mid-round
//     genuinely wants that.
//   - requiring FINISHED would be wrong: the Receipt has a careful live/not-final
//     mode, and hiding the button until the round is complete makes that mode
//     unreachable from the scorecard.
//   - requiring the GROUP's scores would be wrong: the Receipt is the round's money
//     document, it shows cross-group matches, and `started` is computed on the whole
//     field. A group that has not teed off can already have money moving.
// FAIL CLOSED: if the engine is missing, no Receipt button - the same "no engine, no
// claim" shape settlement.html uses for its own gate.
//
// SAVE & EXIT IS STATIC MARKUP, NOT RENDERED, and that is deliberate. On a group link
// it is the only working way out of a round: Wave 14 sent the nav's Home pill to the
// bare lobby, and the 👥 Players pill is gated on canReachSetup() so it is never on a
// group link. If it were written by a renderer, a golfer whose snapshot had not
// arrived would have no way out. Only the Receipt button and the note are toggled.
//
// PRINT IS UNTOUCHED BY CONTAINMENT, not by a new rule: the row sits inside
// #main-content, and @media print sets #main-content { display: none !important }.
// Asserted below rather than assumed.
//
// WHY CHROME. Widths, heights and the 44px minimum are layout, and mini-dom has
// none. Cold through tools/lib/cold-arrival.js, nothing invoked.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const CD = makeCourseData(18);
const P = makePlayers(['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'], [0, 9, 18, 4], 101);

// THE FOOTER AS IT WAS, measured on v247 before this wave, so the reclaim is a
// difference between two measured numbers rather than one number and a memory.
const BEFORE_FOOTER_PX = 518;
const CTL_H = 52;
const ICON_W = 60;

function round(scored) {
    const scores = {};
    if (scored) P.forEach((p, i) => { for (let h = 1; h <= 6; h++) scores['p' + p.id + '_h' + h] = 4 + (i % 3); });
    return { eventName: 'Footer', courseName: 'Test', players: P, gameFormat: 'stroke', courseData: CD,
        scores, settlementMode: 'whole-dollar', skinsBuyIn: 5, skinsCarryOver: false };
}

const PROBE = `(function () {
  function R(e) { if (!e) return null; var r = e.getBoundingClientRect();
    return { h: Math.round(r.height), w: Math.round(r.width), left: Math.round(r.left),
             right: Math.round(r.right), onScreen: e.getClientRects().length > 0 }; }
  var foot = document.getElementById('scorecard-footer');
  var row = document.querySelector('.sc-footer-row');
  var save = document.getElementById('sc-foot-save');
  var receipt = document.getElementById('sc-foot-receipt');
  var guide = document.getElementById('sc-foot-guide');
  var note = document.getElementById('sc-foot-note');
  function css(e, p) { return e ? getComputedStyle(e)[p] : null; }
  return JSON.stringify({
    footer: R(foot), row: R(row),
    footerH: foot ? Math.round(foot.getBoundingClientRect().height) : null,
    oldCards: document.querySelectorAll('.save-exit-box').length,
    save: R(save), receipt: R(receipt), guide: R(guide), note: R(note),
    saveText: save ? (save.innerText || '').replace(/\\s+/g, ' ').trim() : null,
    receiptText: receipt ? (receipt.innerText || '').replace(/\\s+/g, ' ').trim() : null,
    guideText: guide ? (guide.innerText || '').replace(/\\s+/g, ' ').trim() : null,
    guideLabel: guide ? guide.getAttribute('aria-label') : null,
    guideHref: guide ? guide.getAttribute('href') : null,
    noteText: note ? (note.innerText || '').replace(/\\s+/g, ' ').trim() : null,
    // filled vs outline, read off the screen rather than from the class name
    saveBg: css(save, 'backgroundColor'), saveColor: css(save, 'color'),
    receiptBg: css(receipt, 'backgroundColor'), receiptBorder: css(receipt, 'borderTopWidth'),
    inMainContent: !!(foot && foot.closest('#main-content')),
    runwayH: (function () { var pad = document.getElementById('hole-landing-runway');
      return pad ? Math.round(pad.getBoundingClientRect().height) : null; })(),
    docH: document.documentElement.scrollHeight,
    // WAVE 39: the role-note line, measured so the accounting below can itemise
    // it rather than absorb it into a changed total. On this fixture - a bare
    // link on a single-group round - it is the "Keeping score, playing, or just
    // watching?" offer, which is a real tappable line and really does take
    // height.
    // THE DELETE BOX, measured the same way (2026-10-04). It is present for the
    // ORGANIZER only now - a matching ownerUid or organizer token - and the
    // fixture below arrives both ways, so this is a real number on one arrival
    // and a real zero on the other rather than a constant typed into the sums.
    deleteBoxH: (function () { var m = document.getElementById('end-round-mount');
      if (!m || m.getClientRects().length === 0) return 0;
      // THE CARD INSIDE, with its margins. The mount itself is a bare <div> with
      // no margins of its own and .end-box-card carries margin-bottom: 10px, so a
      // reading of the MOUNT's rect left exactly those 10px unexplained - the same
      // mistake the role-note comment below records, one element deeper.
      var card = m.querySelector('.end-box-card') || m.firstElementChild;
      if (!card || card.getClientRects().length === 0) return 0;
      var ccs = getComputedStyle(card);
      return Math.round(card.getBoundingClientRect().height
        + parseFloat(ccs.marginTop || 0) + parseFloat(ccs.marginBottom || 0)); })(),
    roleNoteH: (function () { var rn = document.getElementById('role-note');
      if (!rn) return 0;
      // HEIGHT PLUS MARGINS, because what the document grew by is the space the
      // element OCCUPIES. getBoundingClientRect() stops at the border: measured,
      // the note is 44px tall with a 10px bottom margin and the document grew by
      // 54, so a rect-only reading left 10px unexplained and the equality below
      // was wrong by exactly that.
      var cs = getComputedStyle(rn);
      return Math.round(rn.getBoundingClientRect().height
        + parseFloat(cs.marginTop || 0) + parseFloat(cs.marginBottom || 0)); })()
  });
})()`;

const S = {};
before(async () => {
    // THREE ARRIVALS, and the third is why the delete box can be itemised below
    // rather than guessed at: the same bare URL on a round whose ownerUid is the
    // uid cold-arrival signs in as, which is the organizer's own arrival. On the
    // other two nobody can be shown to be the organizer, so the box is absent -
    // which is the 2026-10-04 fix, and the reason these sums had to move.
    for (const [key, scored, owner] of [['bare', false, false], ['scored', true, false], ['owner', false, true]]) {
        const rec = round(scored);
        if (owner) rec.ownerUid = 'anon-cold';
        const r = await arriveCold({ url: fileUrl('index.html', 'game=FT20'), settleMs: 3000,
            db: { events: { FT20: rec }, global_courses: {}, trips: {}, tournaments: {} },
            viewport: { width: 390, height: 844 }, steps: [{ expression: PROBE }] });
        S[key] = r.ok ? JSON.parse(r.value[0]) : { error: r.reason };
    }
});

describe('THE ROW REPLACED THE THREE CARDS', () => {
    test('ran', () => {
        ['bare', 'scored'].forEach(k => assert.ok(S[k] && !S[k].error, k + ': ' + (S[k] && S[k].error)));
    });
    test('the three cards are gone from the page entirely', () => {
        ['bare', 'scored'].forEach(k => assert.equal(S[k].oldCards, 0,
            k + ': ' + S[k].oldCards + ' .save-exit-box cards still render'));
    });
    test('and the row is inside #main-content, so PRINT is unchanged by containment', () => {
        // @media print sets #main-content { display: none !important } - the footer has
        // never had a print rule of its own and must not need one.
        ['bare', 'scored'].forEach(k => assert.equal(S[k].inMainContent, true, k));
        const SRC = read('index.html');
        assert.match(SRC, /#main-content \{ display: none !important; \}/,
            'the print rule that hides the whole page body is gone');
    });
});

describe('STATE 1 — NO SCORES: Save & exit, the guide icon, and one line of copy', () => {
    test('Save & exit is there, filled, and wide', () => {
        const v = S.bare;
        assert.ok(v.save && v.save.onScreen, 'Save & exit is not on screen');
        assert.match(v.saveText, /Save/i);
        assert.equal(v.save.h, CTL_H);
        // FILLED means a real background, not the card colour: read off the screen.
        assert.notEqual(v.saveBg, 'rgba(0, 0, 0, 0)');
        assert.equal(v.saveColor, 'rgb(255, 255, 255)', 'the filled button has no white ink');
        // wide: it is much wider than the icon, and takes the row less the icon and gap
        assert.ok(v.save.w > v.guide.w * 3, 'Save & exit is not the wide one: ' + v.save.w + ' vs icon ' + v.guide.w);
    });
    test('the RECEIPT IS ABSENT, because there is nothing in it yet', () => {
        assert.ok(!S.bare.receipt || !S.bare.receipt.onScreen,
            'the Receipt button shows on a round with no scores');
    });
    test('and one grey line carries what the three paragraphs said', () => {
        const v = S.bare;
        assert.ok(v.note && v.note.onScreen, 'the note is not shown');
        assert.equal(v.noteText,
            'Scores save as you go. The Round Receipt appears here once the round is scored.');
    });
});

describe('STATE 2 — SCORES: Receipt appears, the line goes', () => {
    test('the Receipt is there, outline, beside Save & exit', () => {
        const v = S.scored;
        assert.ok(v.receipt && v.receipt.onScreen, 'the Receipt button is missing on a scored round');
        assert.match(v.receiptText, /Receipt/i);
        assert.equal(v.receipt.h, CTL_H);
        // OUTLINE means a border and no filled ink
        assert.notEqual(v.receiptBorder, '0px', 'the Receipt has no border, so it is not the outline one');
        assert.notEqual(v.receiptBg, v.saveBg, 'the Receipt is filled like Save & exit');
    });
    test('the note is GONE once the Receipt is there', () => {
        assert.ok(!S.scored.note || !S.scored.note.onScreen,
            'the note still shows beside a Receipt button that says the same thing');
    });
    test('Save & exit is STILL there, still filled, and still the WIDER of the two', () => {
        const v = S.scored;
        assert.ok(v.save && v.save.onScreen);
        assert.equal(v.saveColor, 'rgb(255, 255, 255)');
        assert.notEqual(v.saveBg, 'rgba(0, 0, 0, 0)');
        // MEASURED 144px against the Receipt's 122px. Both are flex: 1 1 auto, so they
        // grow from CONTENT width - "Save & exit" is a longer label than "Receipt" and
        // ends up with the bigger share. That is the intent (Save & exit is the one a
        // golfer must never hunt for) but it currently rests on the label lengths, so it
        // is asserted rather than left to chance: shorten the label and this says so.
        assert.ok(v.save.w > v.receipt.w,
            'Save & exit is ' + v.save.w + 'px and the Receipt ' + v.receipt.w
            + 'px - Save & exit must be the wider of the two');
        assert.ok(v.save.w >= 44 * 3, 'Save & exit is down to ' + v.save.w + 'px');
    });
});

describe('THE GUIDE ICON IS PRESENT IN BOTH STATES', () => {
    ['bare', 'scored'].forEach(k => {
        test(k + ': icon only, fixed width, and named for a screen reader', () => {
            const v = S[k];
            assert.ok(v.guide && v.guide.onScreen, 'the guide icon is missing');
            assert.equal(v.guide.w, ICON_W, 'the icon is ' + v.guide.w + 'px wide, not ' + ICON_W);
            assert.equal(v.guide.h, CTL_H);
            // RE-POINTED (Wave 28): the footer's guide route now carries
            // ?from=&game=&group= so the guide can get back to the round - it was one
            // of the TWO routes that dumped a golfer on Home. The base is what this
            // suite cares about; guide_back_test.js holds where it returns to.
            assert.equal(String(v.guideHref).split('?')[0], 'instructions.html');
            assert.match(v.guideHref, /\?from=index\.html&game=/,
                'the footer guide route lost the way back: ' + v.guideHref);
            assert.equal(v.guideLabel, 'How it works',
                'icon-only, so the accessible name is the only name it has');
            // ICON ONLY: no words. The glyph is the whole label.
            assert.ok(!/[A-Za-z]/.test(v.guideText || ''),
                'the icon carries text as well: ' + JSON.stringify(v.guideText));
        });
    });
});

describe('EVERY CONTROL CLEARS 44px', () => {
    ['bare', 'scored'].forEach(k => {
        test(k, () => {
            const v = S[k];
            [['Save & exit', v.save], ['Receipt', v.receipt], ['guide', v.guide]].forEach(([n, c]) => {
                if (!c || !c.onScreen) return;          // the Receipt is deliberately absent when bare
                assert.ok(c.h >= 44, n + ' is ' + c.h + 'px');
            });
        });
    });
});

describe('THE HEIGHT RECLAIMED, AS A NUMBER', () => {
    // Both figures measured cold at 390x844: 518px of cards on v247, and the row below.
    // Pinned exactly, because a footer-shrinking wave whose saving is not a number is a
    // claim rather than a result.
    // 92px bare, not the 52px of the row alone: the note is one SENTENCE but it wraps to
    // two lines at 390px, which is measured rather than assumed. 52px once the Receipt is
    // there and the note has gone.
    test('no scores: the footer is ' + BEFORE_FOOTER_PX + 'px -> 92px, so 426px comes back', () => {
        assert.equal(S.bare.footerH, 92, 'the bare footer is ' + S.bare.footerH + 'px');
        assert.equal(BEFORE_FOOTER_PX - S.bare.footerH, 426);
    });
    test('with scores: ' + BEFORE_FOOTER_PX + 'px -> 52px, so 466px comes back', () => {
        assert.equal(S.scored.footerH, 52, 'the scored footer is ' + S.scored.footerH + 'px');
        assert.equal(BEFORE_FOOTER_PX - S.scored.footerH, 466);
    });
    test('the page got shorter by the footer MINUS the runway, and the sum accounts for all of it', () => {
        // Measured on v247: 2177px bare, 2366px scored. The document does NOT shrink by the
        // full 426/466, and that is deliberate rather than a leak: the runway below the
        // footer gives part of it back as empty scroll length so the landing can still put
        // the heading at the top. Asserted as an EQUALITY with the runway in it, so the two
        // numbers have to add up - if the document lost more or less than
        // (footer saved - runway added), something moved that this wave did not mean to.
        //     bare    2177 -> 1800   footer 518 -> 92 (426 back)   runway 49    377 net
        //     scored  2366 -> 1989   footer 518 -> 52 (466 back)   runway 89    377 net
        // RE-POINTED IN WAVE 39, AND THE ROLE-NOTE LINE IS ITEMISED RATHER THAN
        // ABSORBED. The three ways into a round are offered on a single-group
        // round as one tappable line above the card - this fixture is exactly
        // that case - and it really does take height. So the equality keeps its
        // shape and gains one term: the document change is
        //   (footer saved) - (runway added) - (role note added)
        // and if any of the three moves by an amount the others do not explain,
        // this still goes red. Measured: bare 1854, role note 44px + a 10px bottom
        // margin = 54px occupied.
        assert.equal(2177 - S.bare.docH, 377 - S.bare.roleNoteH,
            'the bare document is ' + S.bare.docH + ' with a ' + S.bare.roleNoteH + 'px role note');
        assert.equal(2366 - S.scored.docH, 377 - S.scored.roleNoteH,
            'the scored document is ' + S.scored.docH + ' with a ' + S.scored.roleNoteH + 'px role note');
        // RE-POINTED 2026-10-04, AND THE DELETE BOX IS ITEMISED THE SAME WAY THE
        // ROLE NOTE WAS. The scorecard's delete control is the organizer's now,
        // and on this fixture nobody can be shown to be the organizer - so 191px
        // of card left the page and #hole-landing-runway absorbed every pixel of
        // it (49 -> 240 bare, 89 -> 280 scored, measured). The DOCUMENT height did
        // not move at all, which is why the two equalities above still hold
        // untouched; what moved is how the same height is divided up. The term is
        // S.owner.deleteBoxH - measured on the organizer's own arrival, not typed
        // in - so if the box changes size this sum follows, and if it ever stops
        // rendering for the organizer the next assertion says so.
        assert.ok(S.owner.deleteBoxH > 150 && S.owner.deleteBoxH < 250,
            "the organizer's delete box measured " + S.owner.deleteBoxH + 'px - it is a card with a heading, a sentence and a button');
        assert.equal(S.bare.deleteBoxH, 0,
            'a spectator on the bare link is still being shown ' + S.bare.deleteBoxH + 'px of delete control');
        assert.equal(S.scored.deleteBoxH, 0);
        assert.equal((BEFORE_FOOTER_PX - S.bare.footerH) + S.owner.deleteBoxH - S.bare.runwayH, 377,
            'footer saved plus the delete box reclaimed, minus runway added, does not account for the document change');
        assert.equal((BEFORE_FOOTER_PX - S.scored.footerH) + S.owner.deleteBoxH - S.scored.runwayH, 377);
        // AND THE LINE IS REALLY THERE, so this is not satisfied by a zero.
        assert.ok(S.bare.roleNoteH > 20 && S.bare.roleNoteH < 90,
            'the role note measured ' + S.bare.roleNoteH + 'px - it should be one tappable line');
    });
});

// ---------------------------------------------------------------------------
// THE FOOTER WAS THE LANDING'S RUNWAY, AND THAT IS THIS WAVE'S REAL DISCOVERY.
//
// landOnHole() scrolls the hole heading to 12px from the top, and a page can only
// scroll as far as its own height allows: to put the heading at the top there must be
// a viewport's worth of document AFTER it. The Full Card table is display:none in Hole
// View, so what provided that was the 518px of footer cards. Measured the moment they
// became a 52px row, before any runway was added:
//     4 golfers, scored        wanted 837, got 804  - 33px short, heading at 45
//     8 golfers, no scores     wanted 660, got   0  - the heading stayed 672px down
// Wave 19b had measured 796px of runway and concluded the landing could never clamp.
// That was true of a page 466px taller. Shortening the footer made it false.
//
// So the runway is explicit now: #hole-landing-runway, sized to exactly the shortfall
// and zero when the page is long enough on its own, and sized SYNCHRONOUSLY inside
// landOnHole before the target is computed - because on the snapshot it would be too
// late, which is measurably what happened (a round asked for exactly its own maxScroll
// and got 0, the page still being short at scroll time).
// These are the assertions that stop the next footer change from breaking the landing
// again without anybody noticing.
describe('THE LANDING STILL WORKS AFTER THE FOOTER SHRANK', () => {
    const L = {};
    before(async () => {
        for (const n of [4, 8]) {
            const names = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta',
                'Eli Echo', 'Fay Foxtrot', 'Gus Golf', 'Hal Hotel'].slice(0, n);
            const PP = makePlayers(names, names.map((_, i) => i * 3), 101);
            const sc = {};
            PP.forEach((p, i) => { for (let h = 1; h <= 6; h++) sc['p' + p.id + '_h' + h] = 4 + (i % 3); });
            const d = { eventName: 'Runway', courseName: 'Test', players: PP, gameFormat: 'stroke',
                courseData: CD, scores: sc, settlementMode: 'whole-dollar' };
            if (n > 4) d.groupSizeOverrides = { 0: 4, 1: n - 4 };
            const r = await arriveCold({
                // A GROUP LINK for the eight-golfer case: on a BARE link to a multi-group
                // round the group picker covers the page at z-index 999 and a tap on Next
                // never reaches the button, which reads exactly like a landing failure and
                // is not one. That artefact cost me two false findings in this wave.
                url: fileUrl('index.html', n > 4 ? 'game=RW20&group=1' : 'game=RW20'),
                db: { events: { RW20: d }, global_courses: {}, trips: {}, tournaments: {} },
                settleMs: 3000, viewport: { width: 390, height: 844 },
                steps: [{ tap: '.hole-view-nav-btn', nth: 1 }, { sleep: 600 }, { expression: `(function () {
                    var hdr = document.querySelector('.hole-view-header');
                    var pad = document.getElementById('hole-landing-runway');
                    return JSON.stringify({
                        headerTop: hdr ? Math.round(hdr.getBoundingClientRect().top) : null,
                        runwayH: pad ? Math.round(pad.getBoundingClientRect().height) : null,
                        scrollY: Math.round(window.pageYOffset || 0),
                        maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
                    });
                })()` }] });
            L[n] = r.ok ? JSON.parse(r.value[r.value.length - 1]) : { error: r.reason };
        }
    });
    [4, 8].forEach(n => {
        test(n + ' golfers: Next still lands the heading at the offset', () => {
            assert.ok(L[n] && !L[n].error, L[n] && L[n].error);
            assert.equal(L[n].headerTop, 12,
                'the heading is ' + L[n].headerTop + 'px from the top - the footer stopped '
                + 'providing the runway the landing needs');
            assert.equal(L[n].scrollY, L[n].maxScroll >= L[n].scrollY ? L[n].scrollY : -1,
                'sanity: the scroll was applied');
        });
        test(n + ' golfers: the runway element exists and carries a real height', () => {
            // Zero would mean the page is long enough on its own, which is fine - but the
            // ELEMENT must exist, because it is what makes the landing reachable when it
            // is not. A missing element is the regression this whole describe is about.
            assert.notEqual(L[n].runwayH, null, '#hole-landing-runway is gone');
            assert.ok(L[n].runwayH >= 0);
        });
    });
    test('the runway is sized INSIDE landOnHole, before the target is computed', () => {
        const SRC = read('index.html');
        const fn = SRC.slice(SRC.indexOf('function landOnHole()'), SRC.indexOf('\n    }', SRC.indexOf('function landOnHole()')));
        const sizeAt = fn.indexOf('sizeHoleLandingRunway()');
        const targetAt = fn.indexOf('getBoundingClientRect().top + (window.pageYOffset');
        assert.ok(sizeAt > -1, 'landOnHole does not size the runway');
        assert.ok(sizeAt < targetAt,
            'the runway is sized AFTER the target is computed, which is too late - the page '
            + 'is still short when scrollTo runs');
    });
});

describe('SAVE & EXIT IS THE ONLY WAY OUT ON A GROUP LINK, SO IT IS NOT RENDERED', () => {
    const SRC = read('index.html');
    test('it is STATIC markup, not written by a renderer', () => {
        // Wave 14 sent the nav's Home pill to the bare lobby and the 👥 Players pill is
        // gated on canReachSetup(), which is never true on a group link. If Save & exit
        // were rendered from a snapshot, a golfer whose data had not arrived would have no
        // way out of the round at all.
        assert.match(SRC, /id="sc-foot-save"/, 'Save & exit has no static element');
        const at = SRC.indexOf('id="sc-foot-save"');
        const tag = SRC.slice(SRC.lastIndexOf('<', at), SRC.indexOf('>', at) + 1);
        assert.match(tag, /^<button/, 'Save & exit is not a static button: ' + tag);
        assert.match(tag, /admin\.html/, 'it does not go to the lobby');
        // and the renderer touches only the Receipt and the note
        const fn = SRC.slice(SRC.indexOf('function renderFooterRow'),
                             SRC.indexOf('\n    }', SRC.indexOf('function renderFooterRow')));
        assert.ok(fn.length > 80, 'renderFooterRow could not be sliced');
        assert.ok(!/sc-foot-save|sc-foot-guide/.test(fn),
            'the renderer touches Save & exit or the guide icon, which must not depend on data');
    });
    test('the Receipt gate is the engine\'s own `started`, and it fails closed', () => {
        const fn = SRC.slice(SRC.indexOf('function renderFooterRow'),
                             SRC.indexOf('\n    }', SRC.indexOf('function renderFooterRow')));
        assert.match(fn, /computeRoundSettlement/, 'it invents its own notion of "has scores"');
        assert.match(fn, /\.started/);
        assert.match(fn, /typeof computeRoundSettlement === 'function'/,
            'no engine, no claim - the button must not show when the engine cannot be asked');
    });
    test('the footer renders on every snapshot, with the other card widgets', () => {
        const widgets = SRC.slice(SRC.indexOf('function renderCardWidgets()'),
                                  SRC.indexOf('\n    }', SRC.indexOf('function renderCardWidgets()')));
        assert.match(widgets, /renderFooterRow\(\)/);
    });
});
