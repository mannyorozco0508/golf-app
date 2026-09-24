// ============================================================================
// v212 B — SHOW THE HANDICAP MATH (2026-09-23).
//
// Marty's group follows GHIN, so the index -> course-handicap conversion stays
// the default. What was missing was legibility: a golfer saw one number and had
// no way to tell an Index from a Course Handicap from a Playing Handicap, and
// nothing anywhere said which tee's Slope and Rating the conversion used.
//
// WHAT THIS WAVE ADDS, and where each piece lives:
//   handicap-labels.js   NEW, display only, no arithmetic of its own. The
//                        COMPACT label ("Index 18 · Course 12") for the Board
//                        row and the Players sheet, the FULL label for an
//                        expanded card, and the one basis sentence. It is a
//                        separate file because handicap.js is protected and
//                        because the Board and the Players sheet are two entry
//                        points to the same label - the repo has paid for a
//                        hand-written copy in each before now.
//   leaderboard.html     compact in the row, full on the expanded card.
//   index.html           the Players sheet names each golfer's Index and Course.
//   game.html            ONE basis card: the tee, its Slope / Rating / Par, and
//                        that Course Handicaps are converted from GHIN Indexes.
//   admin.html           a round-level setting, DEFAULT "GHIN index (convert by
//                        tee)", with "as entered" available. No allowance
//                        control this wave.
//
// NO MATH MOVED. handicap.js is untouched: every number here comes from
// convertHandicapIndex / formatStoredHandicap / formatCourseLabel, which
// already existed, and the stored courseHandicap is what the round was saved
// with. The suite asserts handicap.js's sha is unchanged.
//
// THE COMPACT LABEL ROUNDS THE COURSE HANDICAP, and says so: the stored
// courseHandicap is a float (18 × 113/113 + (71.2 − 72) = 17.2). The full label
// keeps the exact figure and the Playing Handicap beside it; the compact one is
// the whole number, which at the 100% allowance this wave ships is the same
// number the nets use.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = (f) => crypto.createHash('sha256').update(read(f)).digest('hex').slice(0, 16);
const J = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const run = (sb, c) => vm.runInContext(c, sb);
const text = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const CD = makeCourseData(18);
// The tee Marty's group plays: Slope 113 keeps the arithmetic readable, so a
// Course Handicap is Index + (CourseRating − Par).
const TEE = { teeKey: 'white', teeName: 'White', slope: 113, courseRating: 71.2, par: 72, allowance: 100 };

// A round whose golfers were saved through the conversion: Ann off 18 (course
// 17.2, playing 17), Ben off 4.5 (course 3.7, playing 4), Cal with no index at
// all (a legacy row), Dee with an index but no tee rating when she was saved.
function round(extra) {
    const players = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], ['17', '4', '9', '12'], 101);
    players[0].handicapIndex = '18';   players[0].courseHandicap = 18 + (71.2 - 72);
    players[1].handicapIndex = '4.5';  players[1].courseHandicap = 4.5 + (71.2 - 72);
    players[3].handicapIndex = '12';   players[3].handicapUnconverted = true;
    const scores = {};
    players.forEach(p => { for (let h = 1; h <= 9; h++) scores['p' + p.id + '_h' + h] = 5; });
    return Object.assign({ players, gameFormat: 'stroke', courseData: CD, scores, teeRating: TEE, courseName: 'Rehearsal Links' }, extra || {});
}

// Loaded lazily and guarded: before this wave the file does not exist, and a
// throw at require time would collapse the whole suite into one unhelpful red
// instead of naming each thing that is missing.
const L = (() => {
    try { return loadJsFile('handicap-labels.js', ['handicap.js']); }
    catch (e) { return { __missing: String((e && e.message) || e) }; }
})();

// ---------------------------------------------------------------------------
describe('1. THE BUILDER (handicap-labels.js), and no math moved', () => {
    test('handicap.js is byte-for-byte unchanged by this wave', () => {
        // Re-pin deliberately if handicap.js is ever edited WITH Manny's
        // per-file approval; until then this is the proof that a display wave
        // stayed a display wave.
        assert.equal(sha('handicap.js'), '2d3b2f7fd916a4b8', 'handicap.js changed: ' + sha('handicap.js'));
    });
    test('COMPACT names the Index and the Course Handicap, as whole numbers', () => {
        const p = round().players;
        assert.equal(L.handicapCompactLabel(p[0]), 'Index 18 · Course 17');
        assert.equal(L.handicapCompactLabel(p[1]), 'Index 4.5 · Course 4');
    });
    test('COMPACT is null for a golfer with no Index, so the old "HCP n" line still shows', () => {
        assert.equal(L.handicapCompactLabel(round().players[2]), null);
        assert.equal(L.handicapCompactLabel(null), null);
        assert.equal(L.handicapCompactLabel({ handicapIndex: '' }), null);
    });
    test('COMPACT on a golfer saved with no tee rating says so instead of inventing a Course Handicap', () => {
        const label = L.handicapCompactLabel(round().players[3]);
        assert.match(label, /^Index 12 · /);
        assert.ok(!/Course \d/.test(label), 'no Course Handicap is claimed: ' + label);
        assert.match(label, /no tee rating/);
    });
    test('FULL is handicap.js\'s own label - one definition of the long form, not a second copy', () => {
        const p = round().players[0];
        assert.equal(L.handicapFullLabel(p), 'Index 18 · Course 17.2 · Playing 17');
        const HL = loadJsFile('handicap.js');
        assert.equal(L.handicapFullLabel(p), HL.handicapFacingLabel(p), 'the full form is not re-implemented');
    });
    test('THE BASIS SENTENCE names the tee, its numbers, and GHIN', () => {
        const s = L.handicapBasisSentence(round());
        assert.match(s, /White/, 'the tee');
        assert.match(s, /Slope 113/);
        assert.match(s, /Course Rating 71\.2/);
        assert.match(s, /Par 72/);
        assert.match(s, /GHIN/, 'and that the Index is a GHIN Handicap Index');
        assert.match(s, /Course Handicap/);
    });
    test('THE BASIS SENTENCE on a round with no tee rating says the entered number is used as it stands', () => {
        const s = L.handicapBasisSentence(round({ teeRating: null }));
        assert.ok(!/Slope \d/.test(s), 'no Slope is claimed: ' + s);
        assert.match(s, /as entered|as the Playing Handicap/i);
    });
    test('THE BASIS defaults to GHIN, and "as entered" is the only other value', () => {
        assert.equal(L.handicapBasisOf({}), 'ghin-index', 'a round with no setting is GHIN - today\'s behaviour');
        assert.equal(L.handicapBasisOf({ handicapBasis: 'ghin-index' }), 'ghin-index');
        assert.equal(L.handicapBasisOf({ handicapBasis: 'as-entered' }), 'as-entered');
        assert.equal(L.handicapBasisOf({ handicapBasis: 'nonsense' }), 'ghin-index', 'anything unrecognised falls back to the default');
        assert.equal(L.handicapBasisOf(null), 'ghin-index');
    });
    test('an AS-ENTERED round says so in the sentence even when the tee is rated', () => {
        const s = L.handicapBasisSentence(round({ handicapBasis: 'as-entered' }));
        assert.match(s, /as entered/i);
        assert.ok(!/converted from/i.test(s), 'it must not claim a conversion it is not doing: ' + s);
    });
});

// ---------------------------------------------------------------------------
describe('2. THE BOARD: compact in the row, full on the expanded card', () => {
    function page(data, opts) {
        const sb = loadHtmlInlineScript('leaderboard.html');
        sb.__d = J(data);
        run(sb, "currentMode = 'BRD1'; currentBoardData = __d; activeView = 'individual'; activeScoring = 'net';"
            + ((opts && opts.openCard) ? " openCards.add('" + opts.openCard + "');" : '')
            + " document.__mount(document.getElementById('live-skins-mount')); renderBoard();");
        return String(run(sb, "document.getElementById('board-content').innerHTML || ''"));
    }
    const rowOf = (html, name) => {
        const m = [...html.matchAll(/<tr[^>]*data-player-id="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)]
            .find(x => x[2].indexOf('>' + name) > -1 || x[2].indexOf(name) > -1);
        assert.ok(m, name + ' has no row on the board');
        return m[2];
    };
    const html = page(round());

    test('Ann\'s row reads "Index 18 · Course 17" - not a bare number', () => {
        const r = rowOf(html, 'Ann');
        assert.match(r, /<span class="player-hcp">Index 18 · Course 17<\/span>/, r);
    });
    test('THE CONTROL THE BRIEF ASKED FOR: no row shows a bare handicap number where an Index exists', () => {
        ['Ann', 'Ben'].forEach(n => {
            const r = rowOf(html, n);
            assert.ok(!/player-hcp">HCP /.test(r), n + ' still shows a bare "HCP n": ' + r);
            assert.match(r, /player-hcp">Index /, n + ' must name the Index: ' + r);
        });
    });
    test('the row stays COMPACT - the Playing Handicap is not repeated in it', () => {
        const r = rowOf(html, 'Ann');
        assert.ok(!/Playing/.test(r), 'the row is the compact form: ' + r);
        assert.ok(!/17\.2/.test(r), 'and carries no decimals: ' + r);
    });
    test('Cal, who has no Index, keeps the plain "HCP 9" line', () => {
        assert.match(rowOf(html, 'Cal'), /<span class="player-hcp">HCP 9<\/span>/);
    });
    test('Dee, saved with no tee rating, is not given a Course Handicap', () => {
        const r = rowOf(html, 'Dee');
        assert.match(r, /Index 12/);
        assert.ok(!/Course \d/.test(r), r);
    });
    // JUST the open card's own <tr>. "Everything after board-card-row" swept up
    // the rest of the board, so the negative assertion below failed on ANN's
    // label rather than on Cal's card - a slice fault, not a page fault.
    // The whole board, with exactly ONE card open. Slicing the card's own <tr>
    // out of the markup is not possible with indexOf: the card holds a nested
    // scorecard table whose rows close first, so the slice ended before the
    // golfer's own name. Only the open card can carry .board-card-hcp, so the
    // whole-board assertion is the exact one.
    const withCard = (id) => {
        const h = page(round(), { openCard: id });
        assert.match(h, new RegExp('<tr class="board-card-row" data-card-for="' + id + '"'), 'the card row for ' + id + ' is emitted');
        assert.equal((h.match(/board-card-row/g) || []).length, 1, 'exactly one card is open');
        return h;
    };
    test('THE EXPANDED CARD carries the FULL form, decimals and Playing included', () => {
        const h = withCard('101');
        assert.match(h, /board-card-hcp/, 'the open card has a handicap line');
        // The label is the FIRST thing in the card, before the scorecard's HOLE
        // row. (The slice begins mid-attribute, so the class name leads the text.)
        assert.match(text(h.slice(h.indexOf('board-card-hcp'))), /^board-card-hcp">Index 18 · Course 17\.2 · Playing 17 HOLE /,
            text(h.slice(h.indexOf('board-card-hcp'))).slice(0, 140));
    });
    test('and a golfer with no Index gets no handicap line on their card', () => {
        const h = withCard('103');
        // POSITIVE FIRST: Cal's card really was drawn (his scorecard is in it).
        assert.match(text(h), /Cal/);
        assert.ok(!/board-card-hcp/.test(h), 'no handicap line invented for Cal');
    });
});

// ---------------------------------------------------------------------------
describe('3. THE PLAYERS SHEET names the Index and the Course Handicap', () => {
    function sheet(data) {
        const sb = loadHtmlInlineScript('index.html', [], { search: '?game=PS1' });
        sb.__d = J(data);
        run(sb, "currentMode = 'PS1'; currentData = __d;");
        run(sb, "document.__mount(document.getElementById('players-sheet-body')); renderPlayersSheet(__d);");
        return String(run(sb, "document.getElementById('players-sheet-body').innerHTML || ''"));
    }
    const html = sheet(round());
    test('every row still has its editable handicap box (the sheet still works)', () => {
        assert.equal((html.match(/class="ps-hcp"/g) || []).length, 4, 'four rows, four boxes');
        assert.match(html, /class="ps-name"/);
    });
    // RE-PINNED 2026-09-23 (v213). v212 put the COMPACT LABEL here - "Index 18 ·
    // Course 17" beside a box holding the playing handicap. v213 made the box the
    // INDEX itself, so repeating the index in the line beside it would say the same
    // number twice and leave no room for the thing the organizer actually needs:
    // what the index they are typing converts to. The line is now the DERIVED pair,
    // "Course 17.2 · plays 17", and it moves as they type.
    // players_sheet_index_test.js owns that behaviour; this keeps the surface
    // honest - a row with an Index still never shows a bare number alone.
    test('Ann\'s row names what her Index converts to, beside the box', () => {
        const t = text(html);
        assert.match(t, /Course 17\.2 · plays 17/, t.slice(0, 300));
        assert.match(html, /class="ps-hcp"[^>]*value="18"/, 'and the box itself holds her Index');
    });
    test('THE CONTROL: a sheet row with an Index must not be a bare number alone', () => {
        const t = text(html);
        // Ben is off 4.5 on a 113/71.2/72 tee: course 3.7, plays 4.
        assert.match(t, /Course 3\.7 · plays 4/, 'Ben: ' + t.slice(0, 300));
        // Cal has no Index at all, so nothing is derived for him - his row is the
        // one bare number on this sheet, and that is correct.
        const cal = html.slice(html.indexOf('data-id="103"'), html.indexOf('data-id="104"'));
        assert.ok(!/Course /.test(cal), 'nothing invented for Cal: ' + text(cal));
        assert.ok(/ps-hcp-note/.test(html), 'and the line is there for the golfers who do have one');
    });
    test('the line is markup-safe and carries the ps-hcp-note class the CSS targets', () => {
        assert.match(html, /class="ps-hcp-note"/);
        // A quote in the stored index must not escape the box's value attribute.
        const withQuote = round();
        withQuote.players[0].handicapIndex = '18"';
        assert.ok(!/value="18""/.test(sheet(withQuote)), 'the index is escaped into the box');
    });
});

// ---------------------------------------------------------------------------
describe('4. THE GAME TAB states the basis ONCE', () => {
    function gamePage(data) {
        const sb = loadHtmlInlineScript('game.html', [], { search: '?game=GM1' });
        run(sb, "document.__mount(document.getElementById('game-content'))");
        const h = sb.__dbHandlers.find(x => x.event === 'value' && x.path === 'events/GM1');
        assert.ok(h, 'the page subscribed to its own round');
        h.cb({ val: () => J(data), exists: () => true });
        return String(run(sb, "document.getElementById('game-content').innerHTML"));
    }
    const html = gamePage(round());
    test('there is a Handicaps card, and it names the tee, Slope, Rating, Par and GHIN', () => {
        assert.match(html, /Handicaps/, 'the card head');
        const t = text(html);
        assert.match(t, /White/);
        assert.match(t, /Slope 113/);
        assert.match(t, /Course Rating 71\.2/);
        assert.match(t, /Par 72/);
        assert.match(t, /GHIN/);
    });
    test('ONCE: the basis sentence appears exactly one time on the page', () => {
        const t = text(html);
        assert.equal((t.match(/GHIN/g) || []).length, 1, 'GHIN is said once: ' + t.slice(0, 400));
        assert.equal((t.match(/Slope 113/g) || []).length, 1, 'and the Slope once');
    });
    test('the card does NOT list every golfer - that is the Board\'s and the sheet\'s job', () => {
        const at = html.indexOf('Handicaps');
        // POSITIVE FIRST. Without this the slice is empty on a page that has no
        // Handicaps card at all, and every "is not named" below is true of ''.
        assert.ok(at > -1, 'there is a Handicaps card to slice');
        const end = html.indexOf('<div class="game-card">', at + 1);
        const card = html.slice(at, end === -1 ? html.length : end);
        assert.match(card, /Slope 113/, 'and the slice really is the basis card: ' + text(card).slice(0, 160));
        ['Ann', 'Ben', 'Cal', 'Dee'].forEach(n => assert.ok(card.indexOf(n) === -1, n + ' is named in the basis card: ' + text(card)));
    });
    test('an AS-ENTERED round says so and claims no conversion', () => {
        const t = text(gamePage(round({ handicapBasis: 'as-entered' })));
        assert.match(t, /as entered/i);
        assert.ok(!/converted from/i.test(t), t.slice(0, 400));
    });
    test('a round with no tee rating gets the honest sentence, not a missing card', () => {
        const t = text(gamePage(round({ teeRating: null })));
        assert.match(t, /Handicaps/);
        assert.ok(!/Slope \d/.test(t), t.slice(0, 400));
    });
    test('a round with NO handicaps at all shows no Handicaps card (and the same page WITH them does)', () => {
        const bare = round({ teeRating: null });
        bare.players = makePlayers(['Ann', 'Ben'], ['', ''], 101);
        const t = text(gamePage(bare));
        assert.ok(!/Handicaps/.test(t), 'nothing to say, so nothing said: ' + t.slice(0, 300));
        // The positive half, in the same test, so "no card" cannot pass by the
        // page simply never drawing one. On HEAD this test is vacuous - there is
        // no card either way - and this line is what stops it staying that way.
        assert.match(text(html), /Handicaps/, 'the ordinary round does draw the card');
    });
});

// ---------------------------------------------------------------------------
describe('5. THE ROUND-LEVEL SETTING, default GHIN', () => {
    const ADMIN = read('admin.html');
    test('the wizard has the control, with GHIN selected by default and "as entered" available', () => {
        const at = ADMIN.indexOf('id="handicap-basis-select"');
        assert.ok(at > 0, 'the control exists in the wizard markup');
        const sel = ADMIN.slice(ADMIN.lastIndexOf('<select', at), ADMIN.indexOf('</select>', at) + 9);
        assert.match(sel, /value="ghin-index"[^>]*selected/, 'GHIN is the default: ' + sel);
        assert.match(sel, /value="as-entered"/, 'and "as entered" is offered: ' + sel);
        assert.match(sel, /GHIN/, 'the default option says GHIN in words');
        assert.ok(!/allowance/i.test(sel), 'no allowance control this wave: ' + sel);
    });
    test('the control sits in the tee panel, beside the numbers it governs', () => {
        // Bounded by the panel's own end, not by a character count: the first
        // version of this test used a 1400-char window and the control sits at
        // 1494, so it failed on a correct page.
        const at = ADMIN.indexOf('id="tee-rating-panel"');
        assert.ok(at > 0, 'the tee panel is still there');
        const end = ADMIN.indexOf('</select>', ADMIN.indexOf('id="handicap-basis-select"', at));
        const panel = ADMIN.slice(at, end);
        assert.ok(panel.indexOf('<div id=') === -1 && panel.indexOf('wizard-step') === -1,
            'and the slice never leaves the panel: ' + panel.slice(0, 120));
        assert.match(panel, /id="tee-rating-select"/, 'the tee select is in it');
        assert.match(panel, /id="handicap-basis-select"/, 'and so is the basis control');
    });
    test('the payload carries handicapBasis', () => {
        const at = ADMIN.indexOf('teeRating: teeForSave');
        assert.ok(at > 0, 'the payload still carries teeRating');
        // A WIDER WINDOW, not a bigger guess: v215 added alohaAllowed between these
        // two keys and a 300-char window no longer reached handicapBasis. Bounded by
        // the payload's own next key instead, so it cannot drift again.
        const end = ADMIN.indexOf('players: playersList', at);
        assert.ok(end > at, 'the payload still ends with its roster');
        const tail = ADMIN.slice(at, end);
        assert.match(tail, /handicapBasis:/, 'handicapBasis is still in the payload');
        assert.match(tail, /alohaAllowed:/, 'and so is alohaAllowed (v215)');
    });
    test('AS ENTERED does not convert: the typed number becomes the handicap and no Index is stored', () => {
        const at = ADMIN.indexOf('const hcpFields =');
        assert.ok(at > 0, 'the save still builds the handicap fields in one place');
        const block = ADMIN.slice(at, at + 900);
        assert.match(block, /as-entered|handicapBasisForSave|basisForSave/, 'the basis decides: ' + block.slice(0, 300));
        assert.match(block, /playerHandicapFields\(/, 'and the GHIN arm still uses the shared builder');
    });
});

// ---------------------------------------------------------------------------
// THE ROUND-TRIP. A setting that is written but never read back is worse than no
// setting: reopening an "as entered" round would restore the control to GHIN and
// the next save would CONVERT every number in it - silently changing the
// handicaps a group is playing off, and every net and every dollar with them.
describe('6. THE WIZARD READS THE SETTING BACK', () => {
    const wizard = (rec) => {
        const sb = loadHtmlInlineScript('admin.html', [], {
            search: '?game=HB1',
            beforeRun(sandbox) { sandbox.__dbReads = rec ? { 'events/HB1': J(rec) } : {}; }
        });
        sb.crypto = require('crypto').webcrypto;
        run(sb, 'alert = function () {};');
        return sb;
    };
    const basisValue = (sb) => String(run(sb, "(document.getElementById('handicap-basis-select') || {}).value || ''"));

    test('a round saved AS ENTERED reopens on "as entered"', async () => {
        const sb = wizard(round({ handicapBasis: 'as-entered', ownerUid: 'anon-stub' }));
        await new Promise(r => setTimeout(r, 80));
        assert.equal(run(sb, 'loadedExistingRound'), true, 'the wizard opened on the round');
        assert.equal(basisValue(sb), 'as-entered');
    });
    test('a round saved on GHIN reopens on GHIN', async () => {
        const sb = wizard(round({ handicapBasis: 'ghin-index', ownerUid: 'anon-stub' }));
        await new Promise(r => setTimeout(r, 80));
        assert.equal(basisValue(sb), 'ghin-index');
    });
    test('a LEGACY round with no setting reopens on GHIN - the reading it already had', async () => {
        const sb = wizard(round({ ownerUid: 'anon-stub' }));
        await new Promise(r => setTimeout(r, 80));
        assert.equal(basisValue(sb), 'ghin-index');
    });
    test('a BRAND-NEW round starts on GHIN', async () => {
        const sb = wizard(null);
        await new Promise(r => setTimeout(r, 80));
        assert.equal(basisValue(sb), 'ghin-index');
    });
    test('the wizard\'s own note does not claim a conversion on an AS-ENTERED round', async () => {
        const sb = wizard(null);
        await new Promise(r => setTimeout(r, 80));
        run(sb, "document.getElementById('tee-slope').value = '113';"
            + "document.getElementById('tee-course-rating').value = '71.2';"
            + "document.getElementById('tee-par').value = '72';"
            + "document.getElementById('handicap-basis-select').value = 'as-entered';"
            + "document.__mount(document.getElementById('handicap-index-note'));"
            + "refreshHandicapNote();");
        const note = String(run(sb, "document.getElementById('handicap-index-note').textContent || ''"));
        assert.ok(note.length > 0, 'the note says something');
        assert.match(note, /as entered/i, note.slice(0, 200));
        assert.ok(!/Slope 113 \/ 113/.test(note), 'no conversion formula on an as-entered round: ' + note.slice(0, 200));
    });
    test('and it DOES show the formula on a GHIN round with a rated tee (the positive half)', async () => {
        const sb = wizard(null);
        await new Promise(r => setTimeout(r, 80));
        run(sb, "document.getElementById('tee-slope').value = '113';"
            + "document.getElementById('tee-course-rating').value = '71.2';"
            + "document.getElementById('tee-par').value = '72';"
            + "document.getElementById('handicap-basis-select').value = 'ghin-index';"
            + "document.__mount(document.getElementById('handicap-index-note'));"
            + "refreshHandicapNote();");
        const note = String(run(sb, "document.getElementById('handicap-index-note').textContent || ''"));
        assert.match(note, /Slope 113/, note.slice(0, 200));
    });
});

// ---------------------------------------------------------------------------
// WHAT THE SAVE ACTUALLY WRITES. The source pin in section 5 proves the branch
// exists; this proves what comes out of it. It matters more than the rest of this
// file put together: hcp is the number every net and every dollar is computed
// from, so reading a typed 12 as an Index (course 11.2, playing 11) instead of as
// a Playing Handicap is a money change, not a display change.
describe('7. THE SAVE, both bases, through the wizard\'s own save chain', () => {
    async function savedPlayers(basis) {
        const sb = loadHtmlInlineScript('admin.html', [], {
            search: '?game=SV1',
            beforeRun(sandbox) { sandbox.__dbReads = {}; }
        });
        sb.crypto = require('crypto').webcrypto;
        run(sb, 'alert = function (m) { window.__alerts = (window.__alerts || []).concat([String(m)]); };');
        await new Promise(r => setTimeout(r, 80));
        run(sb, 'document.__mount(document.getElementById("player-list"));');
        run(sb, 'document.getElementById("player-list").innerHTML = "";');
        [['Ann', '18'], ['Ben', '4.5']].forEach(([n, h], i) => {
            run(sb, `addPlayerRow(${JSON.stringify(n)}, ${JSON.stringify(h)}, "", "red", false, true, 2, true, ${101 + i})`);
            run(sb, `(function () {
                var rows = document.querySelectorAll('.player-row'); var row = rows[rows.length - 1];
                var a = document.createElement('input'); a.className = 'p-name-input'; a.value = ${JSON.stringify(n)}; row.appendChild(a);
                var b = document.createElement('input'); b.className = 'p-hcp-input'; b.value = ${JSON.stringify(h)}; row.appendChild(b);
            })();`);
        });
        run(sb, 'globalCourses = ' + JSON.stringify({ tst: { name: 'Test Links', data: J(CD) } }) + ';');
        run(sb, "courseHiddenSelect.value = 'tst'; courseSearchInput.value = 'Test Links';");
        run(sb, "document.getElementById('game-format-select').value = 'stroke';");
        // The rated tee, and the basis the organizer picked.
        run(sb, "document.getElementById('tee-slope').value = '113';"
            + "document.getElementById('tee-course-rating').value = '71.2';"
            + "document.getElementById('tee-par').value = '72';"
            + "document.getElementById('handicap-basis-select').value = '" + basis + "';");
        run(sb, 'saveSettings();');
        await new Promise(r => setTimeout(r, 60));
        const w = sb.__dbWrites.filter(x => x.path === 'events/SV1');
        assert.equal(w.length, 1, 'one write: ' + JSON.stringify(sb.__dbWrites.map(x => x.path)) + ' alerts ' + run(sb, 'JSON.stringify(window.__alerts || [])'));
        return { payload: J(w[0].value), players: J(w[0].value.players || []) };
    }

    test('GHIN: the typed number is an Index, and the Playing Handicap is converted from it', async () => {
        const { payload, players } = await savedPlayers('ghin-index');
        assert.equal(payload.handicapBasis, 'ghin-index');
        assert.equal(players[0].handicapIndex, '18', 'the Index is kept');
        assert.equal(players[0].hcp, '17', 'and 18 off a 71.2/72 course plays off 17: ' + players[0].hcp);
        assert.ok(Math.abs(players[0].courseHandicap - 17.2) < 1e-9, 'the exact Course Handicap is stored: ' + players[0].courseHandicap);
        assert.equal(players[1].handicapIndex, '4.5');
        assert.equal(players[1].hcp, '4');
    });

    test('AS ENTERED: the typed number IS the Playing Handicap, and no Index is invented', async () => {
        const { payload, players } = await savedPlayers('as-entered');
        assert.equal(payload.handicapBasis, 'as-entered');
        assert.equal(players[0].hcp, '18', 'what was typed is what plays: ' + players[0].hcp);
        assert.equal(players[1].hcp, '4.5');
        players.forEach(p => {
            assert.ok(!('handicapIndex' in p), p.name + ' must carry no Index: ' + JSON.stringify(p));
            assert.ok(!('courseHandicap' in p), p.name + ' must carry no Course Handicap: ' + JSON.stringify(p));
            assert.ok(!('handicapUnconverted' in p), p.name + ' is not "unconverted" - it was never meant to be converted');
        });
    });

    test('and the two bases really do differ on the same typed numbers (the join)', async () => {
        const ghin = await savedPlayers('ghin-index');
        const asIs = await savedPlayers('as-entered');
        assert.notEqual(ghin.players[0].hcp, asIs.players[0].hcp,
            'if these matched, the setting would be doing nothing: ' + ghin.players[0].hcp + ' vs ' + asIs.players[0].hcp);
    });
});
