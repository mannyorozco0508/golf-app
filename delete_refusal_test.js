// ============================================================================
// WHY "DELETE IT" DID NOTHING, AND WHAT A REFUSAL HAS TO DO (2026-10-05)
//
// Manny, round ZSGZWH, organizer, on his phone: the confirm appeared, he tapped
// "Delete it", and the screen did not change. MEASURED, not guessed - the round
// record is world-readable, so this came off the live database:
//
//   events/ZSGZWH/ownerUid  "h8Axnef..."  he is the owner, so the button was his
//   events/ZSGZWH/scores    8 entries     the round had been played
//
// and database.rules.json's owner clause ends `(newData.exists() ||
// !data.hasChild('scores'))`. Deleting a round that has scores is
// PERMISSION_DENIED and always was: deliberate, documented in canDeleteRound()'s
// own comment, and NOT what this wave changes. The write was sent, and refused.
//
// TWO DEFECTS, both about what the golfer was told.
//
//   1. HE WAS ASKED TO CONFIRM SOMETHING THAT COULD NOT HAPPEN. admin.html's
//      twin control has checked the scores BEFORE the confirm since 2026-09-19,
//      after exactly this on RV64U5 (432 scores, a confirm promising a fresh
//      start, then PERMISSION_DENIED). index.html never got that check. It has
//      it now, with the same sentence, byte for byte.
//
//   2. THE REFUSAL WENT NOWHERE. uiRefuse anchors its note beside the last
//      control tapped - "Delete it", inside the confirm sheet that closeSheet()
//      had just emptied with innerHTML = ''. The button still had a parentNode,
//      so the insert SUCCEEDED, into a subtree no longer in the document.
//      Measured cold before the fix: document.querySelectorAll('.ui-note')
//      returned NOTHING after a refused delete. ui-dialogs.js now falls back to
//      a fixed note when its anchor has left the document, which repairs EVERY
//      refusal raised from inside a confirm, not only this one.
//
// FOUR ARMS NOW (2026-10-05, second pass). database.rules.ownerdelete.json is
// prepared for Grok: the round's OWNER may delete it even after it has been
// played, because the guard it relaxes was never a boundary - any code-holder
// could already delete the scores node and then the scoreless round. So the
// app's pre-check narrowed from "anyone the button is shown to" to "anyone the
// DATABASE will refuse", which is everyone except the uid on the record:
//
//   ARM 1  an organizer on a SECOND DEVICE, holding the token rather than the
//          uid. The button is shown to them (canDeleteRound accepts the token)
//          and the database will refuse them, so they still get the sentence.
//   ARM 2  the OWNER on the same played round: a confirm that names how many
//          golfers have scores on the card, because with the rule relaxed the
//          confirm is the only thing left between them and a round that cannot
//          come back.
//
// UNTIL THAT RULESET IS PUBLISHED, arm 2's write is still refused by the live
// database - which is why this branch is prepared and not merged.
//
// THE OTHER TWO ARMS are what stop the first being worthless:
// "it refuses and says why" is also true of a page that can never delete
// anything, and a fallback that never fires is indistinguishable from one that
// does not work. Arm 3 is the race the catch exists for - a score landing
// between the check and the write - and it is the only arm that reaches the
// floating note.
//
// WHY COLD CHROME. mini-dom has no layout and no event dispatch: lastTapped is
// set by a capture-phase listener that never fires there, so the harness cannot
// reach the defect at all and would report it fixed either way.
//
// BASELINE, re-measured over the FINISHED 17-test file against setup-3-steps
// (4ebe98b, index.html and ui-dialogs.js swapped out and restored by sha),
// all 17 tests: 8 PASS / 9 FAIL. 8 + 9 = 17. It was first taken at 12, before the owner arm
// and its three tests existed; a baseline is a statement about the file as it
// stands, not a record of what happened to be run first. The eight that pass:
//   - three "ran": the arrivals themselves, which assert nothing about the wave.
//   - '"Delete it" deletes it ... and goes Home': a clean round could always be
//     deleted. That is the point of having it - without this arm, arm 1 would
//     also be satisfied by a page that can never delete anything.
//   - 'this one is INLINE': INERT AT BASELINE, and said plainly rather than
//     dressed up. HEAD renders no note at all on a scored round - it shows the
//     confirm instead - so "none of the notes is floating" is true of an empty
//     list. It becomes a real assertion only once arm 1 produces a note, which
//     is exactly when it matters.
//   - the three owner-arm passes, which are the same effect from the other side:
//     at 4ebe98b the owner of a played round was refused before the confirm, so
//     'the owner gets a confirm' and 'it says how many golfers have scores' are
//     red there - but 'an UNPLAYED round does not get that sentence' is green,
//     because no page in that build could emit it, and the arm's 'ran' is green
//     because an arrival is not an assertion about the wave.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const IDX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const ADM = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
const UI = fs.readFileSync(path.join(__dirname, 'ui-dialogs.js'), 'utf8');

const UID = 'owner-cold-uid';
const CD = makeCourseData(18);
const P = makePlayers(['Marty Marshall', 'Manny Orozco', 'Reese Richards', 'Vic Vance'], [2, 9, 15, 4], 101);
const scored = {};
P.forEach((p, i) => { for (let h = 1; h <= 2; h++) scored['p' + p.id + '_h' + h] = 4 + (i % 3); });
const ROUND = {
    eventName: 'Delete me', courseName: 'Dobson Ranch', players: P, courseData: CD,
    gameFormat: 'stroke', settlementMode: 'whole-dollar', groupSizeOverrides: { 0: 4 },
    ownerUid: UID
};
const SCORED = Object.assign({}, ROUND, { scores: scored, organizerToken: 'tok-del' });
const CLEAN = Object.assign({}, ROUND, { scores: {} });

// THE LIVE RULE, IN THE STAND-IN: a whole-round delete is refused. The data
// source is replaced; nothing the page defines is called.
const DENY = `(function () {
  if (!window.firebase || typeof window.firebase.database !== 'function') return;
  var origDb = window.firebase.database;
  window.firebase.database = function () {
    var inst = origDb.apply(this, arguments);
    if (inst.__denyWrapped) return inst;
    inst.__denyWrapped = true;
    var origRef = inst.ref;
    inst.ref = function (p) {
      var r = origRef.apply(this, arguments);
      if (/^events\\/[A-Za-z0-9]+$/.test(String(p || ''))) {
        r.remove = function () {
          var e = new Error('PERMISSION_DENIED: Permission denied');
          e.code = 'PERMISSION_DENIED';
          return Promise.reject(e);
        };
      }
      return r;
    };
    return inst;
  };
})();`;

const SCREEN = `(function () {
  var notes = Array.prototype.slice.call(document.querySelectorAll('.ui-note'));
  function painted(el) {
    if (!el.getClientRects || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    return r.height > 0 && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }
  var shown = notes.filter(function (n) { return painted(n) && String(n.innerText || '').length > 0; });
  var sheetBody = document.querySelector('#ui-sheet .ui-sheet-body');
  var sheetTitle = document.querySelector('#ui-sheet .ui-sheet-title');
  return JSON.stringify({
    // innerText, never textContent: this page keeps its whole application in an
    // inline script, and the sentence being looked for is IN that script.
    reasonOnScreen: /cannot be deleted/.test(String(document.body.innerText || '')),
    notesInDocument: notes.length,
    notesVisible: shown.length,
    floating: shown.some(function (n) { return /ui-note-floating/.test(n.className); }),
    dismissable: shown.every(function (n) { return !/ui-note-floating/.test(n.className) || !!n.querySelector('.ui-note-x'); }),
    confirmUp: !!document.getElementById('ui-sheet-yes'),
    confirmTitle: sheetTitle ? String(sheetTitle.innerText || '') : '',
    confirmFirstLine: sheetBody ? String(sheetBody.innerText || '').split('\\n')[0] : '',
    confirmBody: sheetBody ? String(sheetBody.innerText || '') : '',
    writes: (window.__coldWrites || []).filter(function (w) { return w.op === 'remove'; }).length,
    wentHome: /admin\\.html/.test(location.href),
    sheetOpen: /\\bopen\\b/.test(String((document.getElementById('round-sheet') || {}).className || ''))
  });
})()`;

const TAP_DELETE = [{ tap: '#round-sheet-handle' }, { sleep: 400 },
                    { tap: '#end-round-mount .btn-danger' }, { sleep: 700 }];
const S = {};

before(async () => {
    const common = {
        auth: { uid: UID, email: 'owner@example.com', isAnonymous: false },
        viewport: { width: 390, height: 844 }, settleMs: 3200
    };
    const pick = r => {
        const j = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{');
        return j.length ? JSON.parse(j[j.length - 1]) : null;
    };

    // ARM 1 - a round WITH scores, opened by an organizer who holds the TOKEN
    // and not the uid. The reason, before any write.
    const a = await arriveCold(Object.assign({}, common, {
        auth: { uid: 'second-device-uid', email: 'owner@example.com', isAnonymous: false },
        url: fileUrl('index.html', 'game=DELA&organizer=tok-del'),
        db: { events: { DELA: SCORED }, global_courses: {}, trips: {}, tournaments: {} },
        preScript: DENY, steps: TAP_DELETE.concat([{ expression: SCREEN }])
    }));
    S.okA = a.ok; S.reasonA = a.reason; S.scored = a.ok ? pick(a) : null;

    // ARM 1b - THE OWNER, same played round. The confirm, and what it says.
    const ab = await arriveCold(Object.assign({}, common, {
        url: fileUrl('index.html', 'game=DELA'),
        db: { events: { DELA: SCORED }, global_courses: {}, trips: {}, tournaments: {} },
        preScript: DENY, steps: TAP_DELETE.concat([{ expression: SCREEN }])
    }));
    S.okAB = ab.ok; S.reasonAB = ab.reason; S.owner = ab.ok ? pick(ab) : null;

    // ARM 2 - a clean round. The confirm, then the delete that actually happens.
    const b = await arriveCold(Object.assign({}, common, {
        url: fileUrl('index.html', 'game=DELB'),
        db: { events: { DELB: CLEAN }, global_courses: {}, trips: {}, tournaments: {} },
        steps: TAP_DELETE.concat([{ expression: SCREEN },
                                  { tap: '#ui-sheet-yes' }, { sleep: 900 },
                                  { expression: SCREEN }])
    }));
    S.okB = b.ok; S.reasonB = b.reason;
    if (b.ok) {
        const j = (b.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(v => JSON.parse(v));
        S.confirm = j[0]; S.deleted = j[j.length - 1];
    }

    // ARM 3 - THE RACE. A clean round the check lets through, refused by the
    // database on the way out: a score landed after this page loaded. This is
    // the only arm that reaches the floating note, and without it the fallback
    // in ui-dialogs.js would be a comment claiming to catch something.
    const c = await arriveCold(Object.assign({}, common, {
        url: fileUrl('index.html', 'game=DELC'),
        db: { events: { DELC: CLEAN }, global_courses: {}, trips: {}, tournaments: {} },
        preScript: DENY,
        steps: TAP_DELETE.concat([{ tap: '#ui-sheet-yes' }, { sleep: 900 }, { expression: SCREEN }])
    }));
    S.okC = c.ok; S.reasonC = c.reason; S.race = c.ok ? pick(c) : null;
});

describe('1. A DEVICE THE DATABASE WILL REFUSE IS TOLD SO, BEFORE ANYTHING IS SENT', () => {

    test('ran', () => assert.ok(S.okA, S.reasonA));

    test('the reason is ON SCREEN, which is the whole defect', () => {
        assert.ok(S.scored.notesInDocument > 0,
            'nothing was added to the document at all - the note is detached again');
        assert.ok(S.scored.notesVisible > 0, 'the note is in the document and paints nothing');
        assert.ok(S.scored.reasonOnScreen, 'the rendered page never says why');
    });

    test('and no write was sent, and no confirm was ever offered', () => {
        assert.equal(S.scored.writes, 0, 'it still sends a delete it knows will be refused');
        assert.equal(S.scored.confirmUp, false,
            'the golfer is still asked to confirm something that cannot happen');
    });

    test('and it is the UID that decides, not the button\'s own gate', () => {
        // canDeleteRound() shows the control to a token-holding organizer, which
        // is right - they are the organizer. The RULE compares auth.uid with the
        // round's ownerUid and nothing else, so the pre-check has to ask the
        // narrower question or it would promise a delete the database refuses.
        const fn = IDX.slice(IDX.indexOf('async function endAndClearRound'),
                             IDX.indexOf('async function endAndClearRound') + 3200);
        assert.match(fn, /window\.authBootState\.uid === currentData\.ownerUid/,
            'the pre-check is not asking who the database will accept');
        assert.match(fn, /if \(scored > 0 && !ownerByUid\)/);
    });

    test('this one is INLINE: the button it refuses is still on screen', () => {
        // The fallback is for an anchor that has LEFT the document. Here the
        // delete button is sitting in the open sheet, so the note belongs beside
        // it - and that this arm is not floating is what proves the two paths
        // are told apart rather than one of them swallowing both.
        assert.equal(S.scored.floating, false, 'it used the detached-anchor fallback for an attached anchor');
    });

    test('and the sentence is admin.html’s, byte for byte', () => {
        const grab = src => {
            const i = src.indexOf('const SCORED_ROUND_SENTENCE');
            return src.slice(i, src.indexOf("';", src.indexOf('new code.', i)) + 2)
                      .split('\n').map(l => l.trim()).join('\n');
        };
        assert.ok(IDX.includes('SCORED_ROUND_SENTENCE'), 'the scorecard has no such sentence');
        assert.equal(grab(IDX), grab(ADM),
            'the scorecard and the setup page now say different things about the same refusal');
    });
});

describe('1b. THE OWNER IS ASKED, AND TOLD WHAT IS ON THE CARD', () => {

    test('ran', () => assert.ok(S.okAB, S.reasonAB));

    test('the owner gets a confirm on a played round, not a refusal', () => {
        assert.ok(S.owner.confirmUp, 'the owner is still refused on their own round');
        assert.equal(S.owner.notesVisible, 0, 'they get a refusal AND a confirm');
    });

    test('and it says how many golfers have scores on the card', () => {
        // "all 4 golfers" is a count of the ROSTER and says nothing about whether
        // anyone has teed off. With the rule relaxed, this confirm is the only
        // thing left between an owner and a round that cannot come back.
        assert.match(S.owner.confirmBody, /4 golfers have scores on this card already/,
            'the confirm does not say what is on the card: ' + S.owner.confirmBody);
        assert.ok(S.owner.confirmBody.indexOf(S.owner.confirmTitle) === -1,
            'the body opens with the title again');
    });

    test('and an UNPLAYED round does not get that sentence', () => {
        // Otherwise the line would be decoration rather than a count: a round
        // nobody has played has nothing to warn about.
        assert.ok(!/scores on this card/.test(S.confirm.confirmBody),
            'an unplayed round is being warned about scores it does not have: ' + S.confirm.confirmBody);
    });
});

describe('2. A ROUND WITH NO SCORES IS DELETED, AND THE CONFIRM ASKS ONCE', () => {

    test('ran', () => assert.ok(S.okB, S.reasonB));

    test('the confirm appears, and does not repeat its own title', () => {
        assert.ok(S.confirm.confirmUp, 'a clean round gets no confirm - nothing can be deleted at all');
        assert.ok(S.confirm.confirmTitle.length > 0, 'the confirm has no title');
        assert.ok(S.confirm.confirmFirstLine.indexOf(S.confirm.confirmTitle) === -1,
            'the body still opens with the title: "' + S.confirm.confirmFirstLine + '"');
    });

    test('"Delete it" deletes it, closes everything and goes Home', () => {
        // HOME IS THE PROOF. Arriving at admin.html is only reachable from inside
        // remove()'s .then, so the write resolved. The write COUNT cannot be read
        // here: window.__coldWrites belongs to the page that sent it and the
        // navigation has already replaced that page.
        assert.ok(S.deleted.wentHome, 'it stayed on the scorecard of a round that no longer exists');
        assert.equal(S.deleted.confirmUp, false, 'the confirm is still up over Home');
    });
});

describe('3. A REFUSAL RAISED FROM INSIDE THE CONFIRM STILL REACHES THE SCREEN', () => {

    test('ran', () => assert.ok(S.okC, S.reasonC));

    test('the note is in the document, painted, and says why', () => {
        assert.ok(S.race.notesInDocument > 0,
            'querySelectorAll found no note: it went into the detached sheet again');
        assert.ok(S.race.notesVisible > 0, 'the note exists and paints nothing');
        assert.ok(S.race.reasonOnScreen, 'the rendered page never says why');
    });

    test('it used the fallback, and the fallback can be dismissed', () => {
        assert.ok(S.race.floating,
            'the inline path was used for an anchor inside a sheet that has been emptied');
        assert.ok(S.race.dismissable, 'a fixed, persistent banner with no way out is its own trap');
    });

    test('and the fallback is guarded by the anchor being IN the document', () => {
        const fn = UI.slice(UI.indexOf('function placeNote(kind, message)'),
                            UI.indexOf('\n    // THE ACTION DID NOT HAPPEN'));
        assert.ok(fn.length > 300, 'the slice is empty - the endpoint drifted');
        assert.match(fn, /var anchor = inDocument\(lastTapped\) \? lastTapped : null;/,
            'it anchors to the last tap without asking whether it is still there');
        assert.match(UI, /function inDocument\(el\)[\s\S]{0,400}document\.body\.contains/);
    });
});
