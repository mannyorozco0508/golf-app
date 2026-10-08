// ============================================================================
// THE CARD TAB FAILS CLOSED (Wave B). index.html only.
//
// THE DEFECT (the v140 recon). A ?group=N this round does not have - a stale
// link from a round that had more groups, or a typo - found no boundary and
// fell back to startIdx 0 / size players.length: the WHOLE FIELD, under a
// badge saying "🔒 Scorekeeper: Group 7 Only", and every scoped surface on the
// page then saw everyone. Not one line: making the slice empty tripped the
// readers that widen an EMPTY scoped list back to the whole field - in
// index.html (liveStandings, the ticker's visible ids, the bet strip, the
// action center) AND inside the builders index.html hands the list to
// (hole-events.js buildHoleEvents, bet-strip.js buildActionRows, money-engine's
// buildLiveMatchStates all treat an empty list as "everyone"; protected files,
// untouched). So: the slice is empty and FLAGGED (__scGroupMissing), one helper
// (scopedPlayers) tells "not set" from "set and empty", and each surface that
// would hand the empty list to a widening builder does not ask it at all.
//
// WHAT A DEAD LINK SHOWS: the badge, the course title, and ONE line -
//   "⚠️ This link is for Group 7, but this round has 6 groups. No scores are
//    shown — ask the organizer for a current link."
// No card, no hole, no Prev/Next, no My Round, no ticker, no recap, no
// who-am-I, no landing welcome, no dots context, no live skins. A link that
// identifies nobody is nobody's, not a spectator's.
//
// THE PROOF, v136-v144's way: card_scope_closed_prev.fixture.json holds, from
// 6ff9332, the tag-stripped text of every element the page wrote and the
// display state of every element it touched, on ?group=3, on the bare link
// and on ?group=1 of a one-group round. Today's page equals it exactly on all
// three - the one deliberate difference is the new note element, display none.
//
// The round arrives through the page's own value listener with the link in
// the URL (helpers/scope-closed-round.js, shared with the capture). mini-dom
// does not parse markup, so the widget mounts are placed in the tree first.
// The dots modal is reached by calling openDotsModal(): mini-dom has no click.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { REPO_ROOT } = require('./helpers/load-script.js');
const R = require('./helpers/scope-closed-round.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const IDX = read('index.html');
const PREV = JSON.parse(read('card_scope_closed_prev.fixture.json'));
const FIRST = R.round().players.map(p => p.name.split(' ')[0]);
const NOTE = '⚠️ This link is for Group 7, but this round has 6 groups. No scores are shown — ask the organizer for a current link.';
// Comments out, left to right (Wave A's stripper, not the one that swallowed 800 lines).
const stripComments = s => s.replace(/<!--[\s\S]*?-->|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str !== undefined ? str : '');

// ---------------------------------------------------------------------------
describe('?group=7 ON A SIX-GROUP ROUND: nobody', () => {
    const a = R.arrive('?game=WAVEB&group=7');
    test('the slice is empty and flagged', () => {
        assert.equal(JSON.stringify(a.filtered), '[]');
        assert.equal(JSON.stringify(a.sb.window.__scFilteredPlayers), '[]', 'set, and empty');
        assert.equal(a.sb.window.__scGroupMissing, true);
    });
    test('no scorecard rows, no head row, no hole card', () => {
        ['card-body', 'table-head-row', 'hole-view-card'].forEach(id => assert.equal(a.text[id], undefined, id + ' is empty'));
    });
    test('no My Round, no ticker (either mount), no recap, no who-am-I, no live skins, no bet strip', () => {
        // whoami-mount is gone (Wave 17) - naming a mount that no longer exists would make
        // this "is empty" assertion trivially and permanently true, which is the inert-guard
        // trap. The line that replaced it lives inside action-center-mount, already listed.
        ['action-center-mount', 'fc-ticker-mount', 'live-ticker-mount', 'hole-recap-mount', 'live-skins-mount', 'bet-strip-mount'].forEach(id => assert.equal(a.text[id], undefined, id + ' is empty'));
    });
    test('no landing welcome, no dots context, no "Enter Hole 1 Scores" prompt', () => {
        assert.equal(a.display['round-landing-summary'], 'none');
        assert.equal(a.display['dot-context-row'], 'none');
        assert.equal(a.text['ticker-status-val'], undefined);
        assert.equal(a.text['ticker-title-label'], undefined);
    });
    test('the explanation is shown, exactly', () => {
        assert.equal(a.display['group-missing-note'], 'block');
        assert.equal(a.text['group-missing-note'], NOTE);
    });
    test('the link still says whose it is', () => {
        assert.equal(a.text['group-lock-badge'], '🔒 Scorekeeper: Group 7 Only');
    });
    test('NOTHING scoped to the whole field anywhere: no golfer\'s name in any element the page wrote', () => {
        const ids = Object.keys(a.text);
        assert.ok(ids.includes('group-missing-note') && ids.includes('course-title'), 'the page rendered: ' + ids.join(','));
        ids.forEach(id => FIRST.forEach(n => assert.ok(!new RegExp('\\b' + n + '\\b').test(a.text[id]), id + ' names ' + n + ': ' + a.text[id].slice(0, 80))));
    });
    test('the dots modal on the dead link lists nobody; on Group 3 it lists the four', () => {
        vm.runInContext('openDotsModal(3)', a.sb);
        assert.equal(String(a.sb.document.getElementById('dots-modal-body').innerHTML || ''), '');
        const g3 = R.arrive('?game=WAVEB&group=3');
        vm.runInContext('openDotsModal(3)', g3.sb);
        const body = String(g3.sb.document.getElementById('dots-modal-body').innerHTML || '');
        assert.equal((body.match(/dot-player-block/g) || []).length, 4);
        assert.match(body, /Ivy India/); assert.doesNotMatch(body, /Ann Alpha/);
    });
});

// ---------------------------------------------------------------------------
describe('THE UNAFFECTED LINKS - the old page, character for character', () => {
    test('the baseline is pinned (6ff9332)', () => {
        assert.equal(PREV.capturedAt, '6ff9332');
        // RE-PINNED 2026-10-05 (was 1a7fb418): the match card redesign Manny
        // approved. Its header was one line and is now four - the terms, the two
        // sides, the live status top right, and thru. DIFFED BEFORE RE-PINNING:
        // 4 text keys CHANGED (the ticker mounts that carry the card), 0 added,
        // 0 removed, display untouched; the rows and every other element on every
        // link are the 6ff9332 capture still.
        // RE-PINNED 2026-10-05 (was cb953314): the leaderboard CARD left Hole View.
        // The compact top five under Prev/Next and a bordered LIVE LEADERBOARD card
        // six pixels below it were the same five names twice; the compact lines now
        // OPEN the full board as a pop-up and the card is gone from
        // #live-ticker-mount. It is not gone from the app - the Full Card view's
        // #fc-ticker-mount still renders it, built exactly once as before.
        // DIFFED BEFORE RE-PINNING: across the three links, 1 text key CHANGED
        // (live-ticker-mount, which loses its leading board segment and keeps every
        // other card), 0 added, 0 removed, display untouched. The fixture's own
        // "repinned" array carries the same record.
        // RE-PINNED 2026-09-19 (was a1b40a09): the KP entry block moved out of the
        // Action Center into #kp-entry-mount under the Prev/Next row and its head
        // reads "Weekly Game KP"; exactly those substrings moved in the fixture (its
        // "repinned" entry), every other character is still the 6ff9332 capture.
        // RE-PINNED 2026-09-20 (was 243e5840): the group picker - #group-pick-overlay
        // flex with one row per group in #group-pick-body on the bare link, none on
        // a group link or a one-group round. Those entries were added by hand (the
        // fixture's "repinned" entry); every other character is the capture.
        // RE-PINNED 2026-09-21 (was e89b88e3): the organizer doors - the bare link on
        // this legacy round (neither ownerUid nor organizerToken: open, as always)
        // shows the ✏️ Edit round setup pill after Group Links; the group link shows
        // neither. That substring was added by hand (the fixture's "repinned" entry).
        // RE-PINNED 2026-09-22 (was ad65f4de): the retired-round guard - every
        // variant gains #superseded-banner display none (added by hand, the
        // fixture's "repinned" entry); nothing else moved.
        // RE-PINNED 2026-09-22 (was 7b7b5c6f): the missing-hole warning - every
        // variant gains #gap-banner display none (by hand, the "repinned" entry).
        // RE-PINNED 2026-09-22 (was 8be9158e): the KP question - the block's text on
        // hole 7 (by hand, the "repinned" entry); nothing else moved.
        // RE-PINNED 2026-09-22 (was 7aa77792): v194 - the landing summary names the
        // Weekly Game and no longer says "no bets" on a round that has one (by hand,
        // the "repinned" entry); nothing else moved.
        // RE-PINNED 2026-09-22 (was ddf1e58b): v195 - the organizer strip gains the
        // 👥 Players pill (by hand, the "repinned" entry); nothing else moved.
        // RE-PINNED 2026-09-23 (was ab6b6f2e): v213 - every variant gains
        // #handicap-basis-note display none. That element is index.html's, added by
        // the USGA Index → Course → Playing wave (PR #12); this round's golfers have
        // no handicapIndex, so the page hides it and writes no text into it. The
        // three suites below had been red since that wave landed.
        // MEASURED BEFORE RE-CAPTURING, which is the whole point of a golden: across
        // all three links the only differences from the 6ff9332 capture were this key
        // and #group-missing-note (which this suite deletes explicitly below), both
        // "none", both in `display`. The `text` map was byte-identical - 0 entries
        // added, 0 changed, 0 removed - so no sentence on any of the three links
        // moved. Added by hand, the fixture's "repinned" entry.
        // RE-PINNED 2026-09-24 (was c3bb774b): v219 - v217 added the attendance panel
        // to index.html (#attendance-mount) and never re-captured this golden, so all
        // three links below had been red since that wave landed. The fixture gains
        // that ONE key per link and nothing else.
        // MEASURED BEFORE ADDING, which is the whole point of a golden: across all
        // three links the text map differed by 1 ADDED key, 0 changed, 0 removed, and
        // display differed only by group-missing-note (which this suite deletes
        // explicitly below). No sentence on any link moved.
        // AND THE ESCAPING IN IT IS CORRECT, not a defect to fix: the panel is written
        // with mount.innerHTML (index.html:2658), so attendance.js passes its DYNAMIC
        // strings through attEscape and the count line is captured as
        // "4 haven&#39;t answered" - which renders as an apostrophe. The hard-coded
        // button label Can't stays raw because a literal apostrophe in element text
        // needs no escaping. This capture records markup as the page emits it, the same
        // way it already records the static "LIVE MATCHES &amp; PRESSES" heading.
        // RE-PINNED (v236, UI Wave 9, was c72ced2a): the attendance panel is gone from
        // the scorecard, so this capture loses exactly the three keys the v219 entry
        // above added and nothing else. VERIFIED BY DIFF against the pre-wave copy
        // before re-pinning: 0 added, 0 changed, 3 removed across text and display on
        // all three links, every `filtered` list identical, capturedAt untouched. The
        // fixture's own "repinned" array carries the same record.
        // RE-PINNED (v243, UI Wave 16, was 0260d661): the KP question was reworded and its
        // select became one-tap name buttons. DIFFED BEFORE RE-CAPTURING, which is the whole
        // point of a golden: across the three links, 0 added, 1 CHANGED and 3 REMOVED.
        // The change is kp-entry-mount's question line - "Did anyone in your group get inside
        // it?" became "Did anyone get the KP in your group?" - and nothing else in the block
        // moved. The removal is one key per link, "kp-pick-' + h + '", WHICH WAS NEVER A REAL
        // ELEMENT: mini-dom registers an id when it scans id="..." out of static markup, and
        // index.html literally contained id="kp-pick-' + h + '" inside a JavaScript string,
        // so the capture recorded the neighbouring source "' + opts + '" as that element's
        // text. Wave 16 deleted the select, so a harness artefact left the golden - not a
        // surface. Every `filtered` list is identical and display is unchanged but for
        // group-missing-note, which this suite deletes explicitly below.
        // RE-PINNED (v244, UI Wave 17, was eac0ac10): the "Which one are you?" question left
        // the scorecard and became one line inside My Round. DIFFED BEFORE RE-CAPTURING:
        // across the three links, 0 added, 1 CHANGED and 1 REMOVED.
        // REMOVED is whoami-mount, whose text was "|👋 Which one are you?|Ivy|Jon|Kim|Lee|
        // Skip — just show everything|" - a 287px panel above score entry, measured cold at
        // 390x844. CHANGED is action-center-mount, which gains "|👋 Which one are you?|
        // choose|" straight after its header and is otherwise byte-identical. The question
        // moved; it did not go. Every filtered list is identical and display is unchanged
        // but for group-missing-note, which this suite deletes explicitly below.
        // RE-PINNED (v248, UI Wave 20, was bffd1bf0): the footer's three cards became one
        // row. THE TEXT MAP IS BYTE-IDENTICAL - 0 added, 0 changed, 0 removed on all three
        // links, because the cards were static markup and never entered this capture, and
        // neither does the row. The only change is ONE ADDED display key per link,
        // sc-foot-note: renderFooterRow() sets that line's display on every snapshot,
        // shown while the round has no scores and hidden once the Receipt is there.
        // RE-PINNED (v248, UI Wave 20, was bffd1bf0): the footer's three cards became one
        // row. THE TEXT MAP IS BYTE-IDENTICAL - 0 added, 0 changed, 0 removed on all three
        // links, because the cards were static markup and never entered this capture, and
        // neither does the row. The only change is ONE ADDED display key per link,
        // sc-foot-note: renderFooterRow sets that line's display on every snapshot,
        // shown while the round has no scores and hidden once the Receipt is there.
        // RE-PINNED (v252, UI Wave 24, was d34656c8): Net Finish names nobody until the
        // round is finished. DIFFED BEFORE RE-CAPTURING, which is the whole point of a
        // golden: across the three links, 0 added, 2 CHANGED and 0 REMOVED. Both changes
        // are the SAME key, action-center-mount, and only on the two links whose round is
        // unfinished - group-3 and bare. one-group-1 is byte-identical, because its round
        // is finished and the finished view did not move, which is the strongest evidence
        // in this file that the wave was display-only.
        // What went: "🥇 Ivy leads net" from the summary line, and "· PROJECTED" plus the
        // named rows "T1 · Ivy India / Quy Quebec · net ..." from the block.
        // What arrived: the split "1st $60 · 2nd $40" and "Winners show once every card
        // is in." Every filtered list is identical and display is unchanged but for
        // group-missing-note, which this suite deletes explicitly below.
        // 7764b3a8 since QR CODES (Wave 1, 2026-10-07; was 9deb0f25): #qr-share-mount
        // joined the Round Menu. Diffed first - 0 text keys changed, 1 added, 0
        // removed, display untouched - and the fixture's own "repinned" array
        // carries the same record.
        assert.equal(sha(read('card_scope_closed_prev.fixture.json')).slice(0, 8), '7764b3a8');
        assert.deepEqual(PREV.links['group-3'].filtered, ['Ivy', 'Jon', 'Kim', 'Lee']);
        assert.equal(PREV.links.bare.filtered.length, 24);
        assert.deepEqual(PREV.links['one-group-1'].filtered, ['Ann', 'Ben', 'Cal', 'Dee']);
        assert.ok(PREV.links['group-3'].text['card-body'].length > 1000 && PREV.links.bare.text['card-body'].length > 10000, 'captured with content');
    });
    [['group-3', '?game=WAVEB&group=3', null, 'its four golfers'], ['bare', '?game=WAVEB', null, 'the whole field'], ['one-group-1', '?game=WAVEB&group=1', 'one', 'its four golfers']].forEach(([k, q, one, what]) =>
        test(k + ' (' + q + '): ' + what + ', every element\'s text identical, every display state identical but the new note (none)', () => {
            const a = R.arrive(q, one ? R.oneGroupRound() : null);
            assert.deepEqual(a.filtered, PREV.links[k].filtered);
            // RE-PINNED 2026-10-04: ONE KEY, end-round-mount, and ONLY on the bare
            // link. This golden was captured on a page that offered "Delete round
            // for everyone" to whoever held the bare link - WAVEB records neither
            // an ownerUid nor an organizerToken, so nobody can be shown to be its
            // organizer - and that is the defect Manny hit on round ULDM2A. Both
            // the renderer and the handler now ask canDeleteRound(), so on a round
            // that names no organizer the control is drawn for nobody. Handled the
            // way this file handles every other moved key: asserted in BOTH
            // directions, then removed from both maps so the rest stays byte-
            // identical. spectator_delete_test.js is the subject's own guard.
            const text = Object.assign({}, a.text);
            const prevText = Object.assign({}, PREV.links[k].text);
            if (k === 'bare') {
                assert.match(String(prevText['end-round-mount'] || ''), /Delete round for everyone/,
                    'the golden no longer holds the control this re-pin is about - re-read it before trusting this line');
                assert.ok(!/Delete/.test(String(text['end-round-mount'] || '')),
                    'the bare link still offers the delete: ' + text['end-round-mount']);
            } else {
                assert.equal(prevText['end-round-mount'], undefined,
                    'a group link never had this control, so there is nothing to re-pin here');
            }
            delete text['end-round-mount'];
            delete prevText['end-round-mount'];
            // RE-PINNED 2026-10-05: ONE ADDED KEY, hole-live-mount - the compact
            // live panel under Prev/Next. It did not exist when this golden was
            // captured, so it is asserted in both directions and then removed from
            // both maps, exactly as end-round-mount is above. On the two group
            // links it carries the board and that group's own matches; on the bare
            // link it carries the board and whatever the whole field can see.
            assert.equal(prevText['hole-live-mount'], undefined,
                'the golden already had a live panel - re-read it before trusting this line');
            if (k !== 'one-group-1') {
                assert.match(String(text['hole-live-mount'] || ''), /Full board/,
                    k + ': the live panel did not render: ' + text['hole-live-mount']);
                assert.match(String(text['hole-live-mount'] || ''), /thru \d/,
                    k + ': the board has no thru');
                // NO RUNNING TOTAL, mid-round, on any link.
                assert.ok(!/\+\$|owes/.test(String(text['hole-live-mount'] || '')),
                    k + ': a mid-round total appeared in the panel');
            }
            delete text['hole-live-mount'];
            delete prevText['hole-live-mount'];
            // RE-PINNED 2026-10-05: a second added key, todays-games-mount - what
            // this round is set up to PLAY, which a fresh round said nothing about
            // once the reading cards went behind the Status sheet. Same treatment:
            // asserted in both directions, then removed from both maps. Its words
            // are action-model's own (getRoundGames + describeGame) and the pot is
            // buildMoneyPoolBanner's, so a change here is a change in a builder.
            assert.equal(prevText['todays-games-mount'], undefined,
                'the golden already had a games card - re-read it before trusting this line');
            assert.match(String(text['todays-games-mount'] || ''), /TODAY/i,
                k + ': the games card did not render: ' + text['todays-games-mount']);
            assert.match(String(text['todays-games-mount'] || ''), /Stroke Play/,
                k + ': it does not name the format');
            delete text['todays-games-mount'];
            delete prevText['todays-games-mount'];
            assert.deepEqual(text, prevText);
            const display = Object.assign({}, a.display);
            assert.equal(display['group-missing-note'], 'none', 'the note is hidden');
            delete display['group-missing-note'];
            // RE-PINNED (v273, UI Wave 36): card-is-in joined the page - the "Your card
            // is in" card above both view mounts. It is ONE ADDED DISPLAY KEY and it is
            // 'none' on all three of these links, which is why the text map is still
            // byte-identical: none of these fixtures has a group whose card is complete
            // in this realm, and netFinishNamesAllowed() fails closed without
            // settlement-engine, so the card has nothing to say. Asserted rather than
            // merely deleted - if it ever RENDERS on one of these links, that is a real
            // change to the old page and this line is where it shows up.
            assert.equal(display['card-is-in'], 'none',
                'card-is-in rendered on a link whose round is not complete');
            delete display['card-is-in'];
            // RE-PINNED (v280, Wave 39): role-note joined the page - the line that
            // says why a read-only card has no score boxes. ONE ADDED DISPLAY KEY,
            // 'none' on all three links, handled exactly like card-is-in above.
            // 'none' on the two group links because a scorekeeper has score boxes
            // and nothing to explain; 'none' on the bare link because the note
            // speaks only for a role the golfer CHOSE, and on arrival they have
            // not. That second part is a defect this fixture caught: the first
            // version said "Just watching." underneath a sheet still asking how
            // they were joining.
            assert.equal(display['role-note'], 'none',
                'role-note rendered on a link that has not chosen a role');
            delete display['role-note'];
            assert.deepEqual(display, PREV.links[k].display);
            assert.equal(a.sb.window.__scGroupMissing, false);
        }));
});

// ---------------------------------------------------------------------------
describe('THE SEAM (source, comments stripped)', () => {
    const code = stripComments(IDX);
    const fn = (name) => { const at = code.indexOf('function ' + name + '('); assert.ok(at > 0, name); return code.slice(at, code.indexOf('\n    function ', at + 30)); };
    test('the slice: an unmatched group is [] and flagged; the same in the dots modal', () => {
        const rs = fn('renderScorecard');
        assert.match(rs, /if \(b\) filteredPlayers = players\.slice\(b\.startIdx, b\.startIdx \+ b\.size\);\s*else \{ filteredPlayers = \[\]; groupMissing = true; \}/);
        assert.match(rs, /window\.__scGroupMissing = groupMissing;/);
        assert.ok(!/startIdx = b \? b\.startIdx : 0/.test(code), 'the old fallback is gone everywhere');
        assert.ok(!/size = b \? b\.size : players\.length/.test(code));
        assert.match(fn('openDotsModal'), /else filteredPlayers = hasGroupLock \? \[\] : players\.slice\(0\);/);
    });
    test('one helper tells "not set" from "set and empty"; no reader widens an empty scoped list back to the field', () => {
        assert.match(fn('scopedPlayers'), /Array\.isArray\(window\.__scFilteredPlayers\)\s*\?\s*window\.__scFilteredPlayers\s*:/);
        assert.equal((code.match(/function scopedPlayers\(/g) || []).length, 1);
        assert.ok(!/__scFilteredPlayers\.length > 0\)\s*\?\s*window\.__scFilteredPlayers(\.map\([^)]*\))?\s*:\s*\(?\s*(currentData\.players|whole)/.test(code), 'the widening idiom');
        assert.ok(!/__scFilteredPlayers \|\| currentData\.players/.test(code), 'the || idiom');
        // The mentions that remain, by count (comments stripped): renderHoleView's
        // `|| []` (1), the helper (2), the Ryder YOUR MATCH ids - an empty list is no
        // match (3), renderLiveBoard's `|| []` (1), and the write in renderScorecard (1).
        assert.equal((code.match(/__scFilteredPlayers/g) || []).length, 8, 'every other reader goes through scopedPlayers()');
        // The helper's definition plus its TEN callers: liveStandings, the ticker,
        // ryderFoursomesContext, the bet strip, confirmSidePress, who-am-I, the recap,
        // the action center, (v194) fullCardEntryOrder - the Full Card's walk over the
        // view's golfers - and (v217) renderAttendance at index.html:2655.
        //
        // RE-PINNED 2026-09-24 (was 10): v219. renderAttendance is a NEW READER of the
        // scoped list and this assertion is exactly what should notice one. It is
        // correct that it reads it: the attendance panel must show the view's golfers,
        // and it does - a group-3 link lists Ivy, Jon, Kim and Lee and nobody else,
        // which the golden above now records. It goes through scopedPlayers() rather
        // than touching __scFilteredPlayers, so the count of raw mentions below stayed
        // at 8 and the widening idioms this test forbids are still absent.
        // RE-PINNED (v236, UI Wave 9, was 11): renderAttendance was the eleventh
        // caller and it is deleted. It is the SAME assertion doing its job in the
        // other direction - v219 re-pinned it upward when the panel arrived, and this
        // wave re-pins it down by one because the panel left. The raw-mention count
        // below stayed at 8, so nothing started touching __scFilteredPlayers directly.
        // RE-PINNED 2026-10-05 (the compact live panel, was 10): renderHoleLive is
        // the eleventh caller, and it is the RIGHT kind of caller - it asks
        // scopedPlayers() for the ids it hands buildLiveMatchStates, which is the
        // same scoping rule the sheet's full match card uses. The raw-mention count
        // below is unchanged, so nothing started touching __scFilteredPlayers.
        assert.equal((code.match(/scopedPlayers\(\)/g) || []).length, 11);
    });
    test('the surfaces whose builders widen an empty list do not ask them: recap, action center, the ticker\'s match cards', () => {
        assert.match(fn('renderHoleRecap'), /if \(scopeMissing\(\)\) \{ mount\.innerHTML = ''; return; \}/);
        assert.match(fn('renderActionCenter'), /if \(scopeMissing\(\)\) \{ mount\.innerHTML = ''; return; \}/);
        const t = fn('renderLiveTicker');
        assert.match(t, /const closed = scopeMissing\(\);/);
        assert.match(t, /const matches = closed \? '' : buildLiveMatchHtml\(/);
        assert.match(t, /const strokeBets = closed \? '' : buildLiveStrokeBetHtml\(/);
        assert.match(t, /const skins = scopeMissing\(\) \? '' : renderSkinsWidgetHtml\(\);/);
        assert.match(fn('renderLiveSkins'), /if \(scopeMissing\(\)\) return;/);
        assert.match(fn('renderHoleView'), /if \(scopeMissing\(\)\) \{\s*container\.innerHTML = '';\s*renderCardWidgets\(\);\s*return;\s*\}/);
        // and the builders themselves are untouched (protected)
        assert.match(read('hole-events.js'), /scopedPlayers && scopedPlayers\.length > 0 \? scopedPlayers : \(data\.players \|\| \[\]\)/);
        assert.match(read('bet-strip.js'), /scopedPlayers && scopedPlayers\.length > 0 \? scopedPlayers : \(data\.players \|\| \[\]\)/);
        assert.match(read('money-engine.js'), /Array\.isArray\(visiblePlayerIds\) && visiblePlayerIds\.length > 0/);
    });
    test('the note: one static element above both views, written from renderScorecard, the wording pinned', () => {
        assert.match(IDX, /<div class="save-state" id="save-state"[^>]*><\/div>\s*<!--[\s\S]*?-->\s*<div class="group-missing-note" id="group-missing-note" role="alert" style="display:none;"><\/div>/);
        assert.match(fn('renderScorecard'), /renderGroupMissingNote\(groupMissing, selectedGroup, groupBoundaries\.length\);/);
        assert.match(fn('renderGroupMissingNote'), /No scores are shown \\u2014 ask the organizer for a current link\./);
    });
    test('the engines were not touched', () => {
        const h = f => sha(read(f)).slice(0, 8);
        // RE-PINNED 2026-09-26 (UI Wave 11, 9 POINTS): bet-strip.js was 43880a61 and
        // action-model.js was ded86280, both approved per-file and both ONE addition -
        // the 'nines' catalog entry, and one branch in gameStatusLine mirroring the
        // stableford branch. hole-events.js and money-engine.js are UNCHANGED, which is
        // the half of this assertion that matters here: the 9 Points wave deliberately
        // did not touch the hole recap, and that is logged rather than half-built.
        assert.equal(h('hole-events.js'), '6fd7f7ed'); assert.equal(h('bet-strip.js'), '3b2dd5fb');   // RE-PINNED 2026-10-07 (MATCHES TAB ON A FINISHED ROUND; was 6a876155): approved per-file by Manny in the four-bug brief, ONE site in buildSideActionRows - on a round that is over every row read "All square - Thru 18", including one won 7&6. It now reads the RECEIPT settlement-engine.js already priced, gated on the card's own sideMatchRangeComplete so a running match is untouched. No arithmetic entered the file; matches_tab_finished_test.js holds the behaviour and its mid-round control proves the gate.   // RE-PINNED 2026-09-29 (UI Wave 29, SIDE MATCH MONEY; was 000156db): approved per-file, ONE site - buildSideActionRows read `decided += 0` for match play and Nassau, so a side bet a golfer won outright reported netMoney 0 and netText "" on the scorecard, and index.html's `finished` test (which needs netMoney !== 0) could never be true. It now adds sideMatchDecidedNet() from side-match-lines.js, which sums the segments buildSideMatchReceipts already priced, gated on seg.winner so an open segment contributes nothing - equal to the Receipt by construction, asserted across five fixtures in side_match_money_lines_test.js. No arithmetic entered this file; the receipts are built once per call rather than per match because this runs on every render.
        assert.equal(h('money-engine.js'), '12bfa41c'); assert.equal(h('action-model.js'), '399ba26f');  // v218: calculateMatchEngine moved OUT to match-engine.js. Deletion plus a pointer comment; no arithmetic moved, and match_engine_parity_test.js pins the 13-fixture corpus the three old copies agreed on.   // was 9653b632 (Wave 18: no carry is the default for tied holes - the sites approved per-file, one line each, no arithmetic. The default lives once in action-model's holeTiesCarry() and reads stored data exactly as the nine hand-written defaults did, so a legacy round pays the same money; tie_carry_default_test.js holds the behaviour and its control proves the legacy money moves if that stops being true.)
        assert.equal(h('pool-engine.js'), '372e76d7');   // 372e76d7: KP never refunds 2026-09-22 (approved per-file, the KP branch): a blank on a finished round and an Out winner are held (unresolved), nobody goes to the skins bucket (toSkinsCents), no KP refund; was a335f19c.
    });
});
