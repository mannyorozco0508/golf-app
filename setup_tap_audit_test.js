// ============================================================================
// FEWER TAPS FROM A COLD HOME SCREEN TO A SCORE IN THE BOX (2026-10-06)
//
// Manny: audit the taps on three paths for the round this app is actually for -
// FOUR golfers, ONE game, a course already in the directory - and cut only what
// the audit proves.
//
// MEASURED with tools/setup-tap-audit.js. Every move is a real mouse press at
// the element's own centre on a cold page with Firebase blocked; nothing calls a
// function the page defines. A tap is any finger-down on a control, a text field
// included, because on a phone that is a tap; keystrokes are reported separately
// and never folded in.
//
//                                   BEFORE   AFTER
//   Game Day -> the format gallery     16      15
//   "Same as last week"                 6       4
//   "Help me set this up"              21      20
//
// WHAT THE AUDIT PROVED, AND WHAT IT DID NOT:
//
//   PROVED. "Save & Start Round" did not start the round. It showed Round Ready,
//   and "START SCORING" was a second tap on every path - after the organizer had
//   already pressed a button that says Start. Save now goes to the scorecard.
//
//   PROVED. "Same as last week" - the thing an organizer does every week, and
//   the shortest path in the app - was inside a CLOSED <details> labelled "Open
//   something else". One tap to find it, on a word that does not mention last
//   week. It is on the home screen now, still hidden until a previous round
//   exists.
//
//   AND IT FOUND A SENTENCE THAT LIED, which costs no taps and matters anyway:
//   the coach's last button said "Opens the round on Review" and lands on
//   COURSE, because the gate will not show Review without a course and the
//   players. Manny's instruction is that the gate STAYS, so the sentence moved.
//
//   NOT PROVED, SO NOT CUT. Moving Extras to Review changes no tap count on any
//   measured path - all three pass through Money with one tap either way - and
//   Games and Money are separate steps by Manny's own instruction. Untouched.
//
// THE CUT THAT WOULD HAVE BROKEN SHARING. Round Ready had exactly ONE entry
// point - the save - and it was the only screen that printed the round's links.
// Skipping it would have left a foursome's organizer with no way to send
// anybody anything. So the scorecard's links button, which was inside the
// multi-group branch, is now on every round, its panel's own second gate on the
// group count is gone (it made the new button dead - an empty panel), and the
// panel prints the round-level watch link as admin.html's does.
//
// BASELINE over the FINISHED file (all 9 tests, after the last assertion was
// written) against this branch's Wave A commit a8804b8 - index.html sha
// 12781dab9b5aa3b1, admin.html 2a050a6a082d6924 swapped in and restored by sha
// from this wave's own saved copies, never with git checkout:
//
//   2 PASS / 7 FAIL / 9 tests.   2 + 7 = 9.
//
// THE TWO THAT PASS:
//   - the setup-coach gate still refuses a save with no course. That is the thing
//     Manny said to KEEP, so it has to pass on both files; it is evidence that the
//     wave left it alone, not evidence of anything the wave did.
//   - the audit tool's own wiring pin is VACUOUS here: tools/setup-tap-audit.js is
//     added by this wave, so on a8804b8 it reads the branch's file. It is in the
//     suite so the audit cannot quietly stop tapping, or start calling the page's
//     own functions, without a test saying so.
//
// AND "no tall card on Home" IS A RED, not a pass, which is the point of writing
// it with a positive assertion first: on a8804b8 the slice between the button and
// the disclosure is empty, and a block made only of "must not contain" would have
// gone green guarding an empty string (CLAUDE.md).
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const CODE = 'TAPAUD';
const CD = []; for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const four = () => ['Marty', 'Mike', 'Tanner', 'Glen']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: '8', playingForMoney: true }));
const round = () => ({
    eventName: 'R', courseName: 'Camas', players: four(), gameFormat: 'stroke', courseData: CD,
    scores: {}, settlementMode: 'whole-dollar', groupSizeOverrides: { 0: 4 },
    ownerUid: 'me-uid', organizerToken: 'tok-mine'
});

const S = {};
before(async () => {
    // ONE PATH IS RUN LIVE HERE - the shortest, four taps - because a tap count
    // is the claim and a number copied out of a comment is not a measurement.
    // The other two are in the tool and in the header; running all three in the
    // suite costs about two minutes for the same kind of evidence.
    try {
        S.audit = JSON.parse(execFileSync(process.execPath,
            [path.join(__dirname, 'tools', 'setup-tap-audit.js'), 'repeat', '--json'],
            { encoding: 'utf8', timeout: 240000 }))[0];
    } catch (e) { S.audit = { ok: false, error: String(e && e.message).slice(0, 200) }; }

    // AND THE LINKS THE CUT COULD HAVE COST, on the round that never had them:
    // four golfers, one group, this device the organizer. Opened the way a golfer
    // opens it - the Round Menu, then the button in it.
    const PROBE = `(function(){
      var bar = document.getElementById('group-filter-container');
      var btn = bar ? bar.querySelector('.group-links-btn') : null;
      var p = document.getElementById('group-links-panel');
      return JSON.stringify({
        barText: String(bar && bar.innerText || '').replace(/\\s+/g, ' ').trim(),
        label: btn ? String(btn.innerText || '').trim() : null,
        panelShown: p ? getComputedStyle(p).display : 'missing',
        panelText: String(p && p.innerText || '').replace(/\\s+/g, ' ').trim(),
        urls: Array.from(p ? p.querySelectorAll('button[onclick*="copyGroupLinkFromScorecard"]') : [])
                .map(function (b) { var m = /'([^']+)'/.exec(b.getAttribute('onclick'));
                  return m ? m[1].split('/').pop() : null; }),
        organizerRow: !!(p && p.querySelector('.glr-organizer'))
      }); })()`;
    const r = await arriveCold({
        url: fileUrl('index.html', 'game=' + CODE),
        db: { events: { [CODE]: round() }, trips: {}, global_courses: {}, tournaments: {} },
        auth: { uid: 'me-uid' }, viewport: { width: 390, height: 844 }, settleMs: 3200,
        steps: [{ tap: '#round-sheet-handle' }, { sleep: 700 },
                { tap: '.group-links-btn' }, { sleep: 700 }, { expression: PROBE }]
    });
    S.links = r.ok ? JSON.parse(r.value.filter(v => typeof v === 'string' && v.charAt(0) === '{').pop())
                   : { error: r.reason };
});

describe('1. THE TAPS', () => {

    test('"Same as last week" is FOUR taps from a cold home screen to hole 1', () => {
        assert.ok(S.audit && S.audit.ok, 'the audit did not reach hole 1: '
            + JSON.stringify(S.audit && (S.audit.error || S.audit.landed)));
        assert.equal(S.audit.taps, 4, 'it is ' + S.audit.taps + ' taps: '
            + JSON.stringify(S.audit.trail));
        // AND THE SECOND READY TAP IS NOT ON SCREEN. The audit tries it and
        // reports it skipped; if Round Ready ever comes back on the save path this
        // is the assertion that says so, rather than the count quietly going to 5.
        assert.ok((S.audit.skipped || []).some(s => /START SCORING/.test(s)),
            'START SCORING was on screen again after Save & Start');
    });

    test('and the save goes to the scorecard, not to a second ready screen', () => {
        const src = read('admin.html');
        const at = src.indexOf('"SAVE & START ROUND" NOW STARTS THE ROUND');
        assert.ok(at > -1, 'the note explaining where the save goes is gone');
        const tail = src.slice(at, at + 1600);
        assert.match(tail, /window\.location\.href = `index\.html\?game=\$\{currentMode\}`;/);
        assert.doesNotMatch(tail, /showRoundReadyScreen\(currentMode\)/,
            'the save shows Round Ready again');
        // THE CUP KEEPS ITS OWN HANDOFF: it navigates before this line is reached.
        assert.match(src, /sidematches\.html\?game=\$\{currentMode\}&setup=ryder/);
    });

    test('"Same as last week" is on the home screen, not inside a disclosure', () => {
        const src = read('admin.html');
        const btn = src.indexOf('id="same-as-last-week"');
        const details = src.indexOf('<details id="open-else"');
        assert.ok(btn > -1 && details > -1);
        assert.ok(btn < details, 'the button is still inside "Open something else"');
        // STILL HIDDEN UNTIL THERE IS A PREVIOUS ROUND: a dead control on a new
        // install's first screen would be worse than one extra tap.
        assert.match(src, /id="same-as-last-week" style="display:none;"/);
        assert.match(src, /btn\.style\.display = code \? 'block' : 'none';/);
    });

    test('AND NO TALL CARD ON HOME: a button and one line, which is Manny’s rule', () => {
        const src = read('admin.html');
        const from = src.indexOf('id="same-as-last-week"');
        const to = src.indexOf('<details id="open-else"');
        const block = src.slice(from, to);
        assert.ok(block.length > 60, 'the slice is empty, so every assertion below is vacuous');
        assert.match(block, /id="same-as-last-week-note"/, 'the line naming the round it copies');
        ['<h3', 'w-card-title', 'class="w-card"'].forEach(bad =>
            assert.ok(!block.includes(bad), 'a card grew around the button: ' + bad));
    });
});

describe('2. AND NOTHING WAS CUT THAT ANYBODY NEEDED', () => {

    test('a FOURSOME’s organizer can share the round from the scorecard', () => {
        assert.ok(!S.links.error, S.links.error);
        // The links lived on Round Ready, which the save no longer shows, and this
        // button was inside the multi-group branch - so a foursome had none.
        assert.equal(S.links.label, '🔗 Share this round',
            'the bar reads: ' + S.links.barText);
        assert.equal(S.links.panelShown, 'block',
            'the button opened nothing - the panel had a second gate on the group count');
        assert.ok(S.links.panelText.length > 40, 'the panel is empty: ' + S.links.panelText);
    });

    test('and the panel carries the round link, the group link and the organizer link', () => {
        assert.deepEqual(S.links.urls,
            ['index.html?game=' + CODE, 'index.html?game=' + CODE + '&group=1'],
            'the panel prints: ' + JSON.stringify(S.links.urls));
        assert.equal(S.links.organizerRow, true, 'the organizer link is gone');
        // THE WORDS ARE THE MEASURED ONES, not admin.html's multi-group sentence:
        // on one group that link is 76 of 76 editable, so it is not read-only.
        assert.match(S.links.panelText, /On one group this link also carries the scorecard/);
        assert.doesNotMatch(S.links.panelText, /read-only|Nobody who opens it can enter a score/,
            'a writable link was called read-only');
    });
});

describe('3. AND THE GATE MANNY SAID TO KEEP IS STILL THERE', () => {

    test('the coach no longer promises Review, because it lands on the course picker', () => {
        const src = read('admin.html');
        assert.match(src, /sub: 'Opens the round on the course picker\.' \}/);
        assert.doesNotMatch(src, /Opens the round on Review/);
        assert.doesNotMatch(src, /the round opens on its Review page/);
    });

    test('and the refusal still fires: no course, no save', () => {
        // THE GATE ITSELF IS UNTOUCHED BY THIS WAVE and it is the thing Manny said
        // to keep, so this reads the live predicate rather than trusting that no
        // edit reached it. Its words are what a golfer sees on a save with the
        // course left empty - measured in the audit when a fixture lacking
        // activeCourseKey copied a round with no course and the save refused.
        const src = read('admin.html');
        assert.match(src, /Please select or type a Golf Course name before saving/);
        assert.match(src, /setupCoachGate|canReachReview|wizardStepReady|coachGate/,
            'the setup-coach gate predicate is not named in the page any more');
    });

    test('the audit that produced these numbers taps, and never calls the page', () => {
        const tool = read('tools/setup-tap-audit.js');
        ['quick', 'repeat', 'coach'].forEach(k =>
            assert.ok(tool.indexOf(k + ':') > -1, 'the audit lost its ' + k + ' path'));
        assert.match(tool, /steps\.push\(\{ tap: sel, nth: nth \? Number\(nth\) : 0 \}\)/,
            'it stopped tapping');
        // The two value-setting steps are the name and course FIELDS, and they are
        // declared: a check that calls what it checks proves nothing (CLAUDE.md).
        // startScoring APPEARS, as the SELECTOR button[onclick="startScoring()"] -
        // the audit finds the button by the handler it carries and presses it. That
        // is the opposite of calling it, so the scan drops selector strings before
        // looking for a call.
        const js = tool.replace(/\/\/[^\n]*/g, '').replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
        ['renderScorecard', 'saveSettings', 'goToWizardStep', 'startScoring',
         'showRoundReadyScreen'].forEach(fn =>
            assert.ok(!js.includes(fn), 'the audit calls ' + fn + ' instead of tapping'));
        assert.match(tool, /button\[onclick="startScoring\(\)"\]/,
            'it no longer looks for the second ready tap at all, so it cannot report it gone');
    });
});
