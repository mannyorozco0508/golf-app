// ============================================================================
// FROM THE MATCHES PAGE BACK INTO THE ROUND (2026-10-09)
//
// Manny: once a side bet is set up, this page is the last setup step and there
// is no way forward from it. The nav pills are there, but a golfer who has just
// created a bet is looking for "right, now go and play" - and the biggest
// button on the card sends them to Final Results & Receipt, which is the END of
// a round, not the start.
//
// So: one big primary button at the bottom of the card.
//   no scores yet   "▶ Start Round"
//   scores posted   "Go to Round"
// and it opens the SCORECARD for the right group.
//
// WHICH GROUP, in order, because getting this wrong sends a golfer to somebody
// else's card:
//   1. ?group=N on this page's own URL - a group scorekeeper's link. The nav
//      rewriter already carries this to every other pill; this button must not
//      be the one that drops it.
//   2. the organizer's "Score for: Group N" pick, which index.html stores under
//      golfapp_org_group_<CODE>. An organizer arrives here with no group in the
//      URL and must still land where they were scoring.
//   3. neither - the plain round link.
//
// "STARTED" IS THE ENGINE'S OWN WORD, not a new one. settlement-engine.js's
// computeRoundFinish() already answers it (at least one golfer with at least
// one hole) and this page already loads that file. NOTHING in any money file
// changes: it is read, exactly as the Receipt reads it.
//
// THE GPS BUILD lands this same button on the GPS screen through its own
// landing rule, so the button deliberately uses the ordinary round link and
// nothing else - there is no GPS branch here to get out of step.
//
// WHAT THIS FILE CANNOT PROVE: where the button SITS and how wide it is.
// mini-dom has no layout and does not parse static markup into elements, so the
// card's rendered order and the width bug in part 2 of the brief are measured
// in tools/matches-card-layout-check.js, in Chrome, at 390 and 320 px.
//
// BASELINE, against players-compact ba4349d (sidematches.html sha
// 2be7071e993f9367, swapped in and restored by sha), all 11 tests:
// 3 PASS / 8 FAIL. 3 + 8 = 11.
//
// THE THREE THAT PASS THERE, and only one of them is worth anything:
//   1. the card's own positive control - true before and after, and it is here
//      so the assertions about the new button cannot be satisfied by an empty
//      card.
//   2. the settlement-engine sha pin - here as the thing this wave must NOT
//      break, not as evidence it did anything.
//   3. "with neither, the plain round link" is VACUOUS on the old page and is
//      said so rather than counted: with no button at all the href reads as an
//      empty string, and an empty string contains no group either. It only
//      starts doing work once the button exists.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript } = require('./helpers/load-script.js');

const CODE = 'GR01';
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const roster = n => Array.from({ length: n }, (_, i) =>
    ({ id: 101 + i, name: 'Golfer ' + String.fromCharCode(65 + i), hcp: '10' }));
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

function run(sb, code) { return vm.runInContext(code, sb); }
function arrive(sb, data) {
    const hs = sb.__dbHandlers.filter(h => h.event === 'value');
    assert.ok(hs.length > 0, 'the page registered no value handler');
    hs.forEach(h => h.cb({ val: () => data, exists: () => true }));
}
// The Matches page, arrived at the way a golfer does: a URL and a round record.
// `search` carries the group when there is one; `stored` is what index.html
// left in localStorage when the organizer picked a group to score for.
function matchesPage(opts) {
    opts = opts || {};
    const sb = loadHtmlInlineScript('sidematches.html', ['pwa-boot.js'],
        { search: '?game=' + CODE + (opts.group ? '&group=' + opts.group : '') });
    run(sb, 'alert = function () {}; uiRefuse = function () {}; uiFail = function () {}; '
        + 'uiToast = function () {}; confirm = function () { return true; };');
    if (opts.stored !== undefined) {
        // A STORE THAT ACTUALLY STORES. mini-dom's localStorage accepts setItem
        // and then answers null to getItem - measured, not assumed - so the
        // organizer's saved pick could never be read back and this case could
        // not run at all. This supplies the missing PLATFORM API so the page's
        // own code can run against it; it does not stand in for anything the
        // page does. The same case is measured again in Chrome, where
        // localStorage is real, by tools/matches-card-layout-check.js.
        run(sb, `(function () {
            var store = {};
            window.localStorage = {
                getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
                setItem: function (k, v) { store[k] = String(v); },
                removeItem: function (k) { delete store[k]; }
            };
            localStorage = window.localStorage;
            localStorage.setItem('golfapp_org_group_${CODE}', '${opts.stored}');
        })()`);
    }
    const scores = {};
    if (opts.holesPlayed) {
        roster(4).forEach(p => { for (let h = 1; h <= opts.holesPlayed; h++) scores['p' + p.id + '_h' + h] = 4; });
    }
    arrive(sb, Object.assign({ gameFormat: 'stroke', players: roster(4), courseData: CD, scores,
                               eventName: 'Live Round' }, opts.extra || {}));
    return sb;
}
const button = (sb) => JSON.parse(run(sb, `(function () {
    var a = document.getElementById('sm-go-round');
    if (!a) return JSON.stringify({ missing: true });
    return JSON.stringify({
        label: String(a.textContent || a.innerHTML || '').replace(/<[^>]*>/g, '').trim(),
        href: String(a.getAttribute('href') || ''),
        cls: String(a.className || '')
    });
})()`));

describe('1. THERE IS A WAY INTO THE ROUND FROM THE MATCHES PAGE', () => {

    test('the card still has its own buttons - the positive control', () => {
        // Without this, "the new button is in the card" could be true of a card
        // that renders nothing else, and the rest of the file would be measuring
        // an empty screen.
        const src = read('sidematches.html');
        const at = src.indexOf('id="sidematches-card"');
        assert.ok(at !== -1, 'the side matches card is gone');
        const card = src.slice(at, src.indexOf('</div>\n</div>', at));
        assert.match(card, /SIDE BETS/, 'the card no longer offers side bets');
        assert.match(card, /Final Results/, 'the card no longer links to the Receipt');
    });

    test('the button is the LAST thing in the card, under the Receipt link', () => {
        // SOURCE ORDER, because mini-dom does not parse static markup into
        // elements - the rendered position is measured in Chrome.
        const src = read('sidematches.html');
        const at = src.indexOf('id="sidematches-card"');
        const card = src.slice(at, src.indexOf('</div>\n</div>', at));
        assert.match(card, /id="sm-go-round"/,
            'there is no Go to Round button on the Matches card at all');
        assert.ok(card.indexOf('id="sm-go-round"') > card.indexOf('Final Results'),
            'the Go to Round button is above the Receipt link; the brief puts it at the bottom');
    });

    test('NO SCORES YET: it says Start Round', () => {
        const b = button(matchesPage({}));
        assert.ok(!b.missing, 'the button is not on the page');
        assert.match(b.label, /Start Round/,
            'a round nobody has teed off on offers "' + b.label + '"');
        assert.match(b.label, /▶/, 'the play glyph is gone from the Start Round label');
    });

    test('ONCE A SCORE IS POSTED: it says Go to Round', () => {
        const b = button(matchesPage({ holesPlayed: 3 }));
        assert.ok(!b.missing, 'the button is not on the page');
        assert.match(b.label, /Go to Round/,
            'a round in progress still offers "' + b.label + '" - it has already started');
        assert.doesNotMatch(b.label, /Start Round/, 'both labels at once: ' + b.label);
    });
});

describe('2. AND IT OPENS THE RIGHT CARD', () => {

    test('it goes to the scorecard, carrying the round', () => {
        const b = button(matchesPage({}));
        assert.match(b.href, /^index\.html\?/, 'the button does not open the scorecard: ' + b.href);
        assert.match(b.href, new RegExp('game=' + CODE), 'the round code is missing: ' + b.href);
    });

    test('A GROUP LINK KEEPS ITS GROUP', () => {
        const b = button(matchesPage({ group: 3 }));
        assert.match(b.href, /[?&]group=3\b/,
            'a group scorekeeper would be sent to somebody else’s card: ' + b.href);
    });

    test('and an ORGANIZER keeps the group they picked to score for', () => {
        // index.html stores this when the organizer uses "Score for: Group N".
        // There is no group in the URL here, which is exactly how an organizer
        // arrives.
        const b = button(matchesPage({ stored: 2 }));
        assert.match(b.href, /[?&]group=2\b/,
            'the organizer’s own "Score for" pick was dropped: ' + b.href);
    });

    test('THE URL WINS over a stale stored pick', () => {
        // A group scorekeeper tapping a link is explicit; a value left in
        // localStorage from another session is not.
        const b = button(matchesPage({ group: 4, stored: 2 }));
        assert.match(b.href, /[?&]group=4\b/, 'the stored pick overrode the link: ' + b.href);
        assert.doesNotMatch(b.href, /group=2\b/, 'both groups ended up on the link: ' + b.href);
    });

    test('and with neither, the plain round link - no invented group', () => {
        const b = button(matchesPage({}));
        assert.doesNotMatch(b.href, /[?&]group=/,
            'a group was invented for a golfer who has none: ' + b.href);
    });
});

describe('3. NO MONEY FILE MOVED FOR THIS', () => {

    test('the started test is the ENGINE’s, read and not re-derived', () => {
        const src = read('sidematches.html');
        assert.match(src, /computeRoundFinish\(/,
            'the page works out "has it started" by itself instead of asking settlement-engine');
    });

    test('and settlement-engine.js is byte-identical to the branch it came from', () => {
        const crypto = require('crypto');
        const sha = crypto.createHash('sha256')
            .update(fs.readFileSync(path.join(__dirname, 'settlement-engine.js'))).digest('hex').slice(0, 16);
        assert.equal(sha, '6ddd4c8676cd8802',
            'settlement-engine.js changed. This wave reads it and changes nothing in it; '
            + 'if that is deliberate it needs saying out loud and re-approving.');
    });
});
