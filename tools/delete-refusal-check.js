#!/usr/bin/env node
// ============================================================================
// WHY "DELETE IT" DID NOTHING (2026-10-05)
//
// Manny, round ZSGZWH, organizer: he tapped "Delete round for everyone", the
// confirm appeared, he tapped "Delete it", and the screen did not change.
//
// WHAT THE RECORD SAYS, measured not guessed, straight off the live database
// (events/$code is world-readable, so this needed no key):
//
//   events/ZSGZWH/ownerUid   "h8AxnefqnuZNKv6XwvFFIKRMHSS2"   he is the owner
//   events/ZSGZWH/scores     8 entries                        it has been played
//
// and database.rules.json's owner clause ends
//
//   ... && (newData.exists() || !data.hasChild('scores'))
//
// so a whole-round DELETE of a round with scores is PERMISSION_DENIED. That is
// deliberate and canDeleteRound()'s own comment already says so. The delete was
// refused, exactly as designed.
//
// THE DEFECT IS THAT NOBODY WAS TOLD. endAndClearRound() does call uiRefuse with
// the reason. ui-dialogs.js puts a refusal next to the control the golfer last
// tapped - and the control they last tapped is "Delete it", which lives inside
// the confirm sheet that closeSheet() has just emptied with innerHTML = ''. The
// anchor is detached, so the note is inserted into a subtree that is no longer
// in the document. It exists, it has text, and it is nowhere on screen.
//
// THIS CHECK CALLS NOTHING THE PAGE DEFINES. A cold arrival as the owner of a
// round, open the sheet, tap the delete button - real taps - and then read what
// is on screen. The data source is replaced, which is the point: remove() on the
// event root rejects with PERMISSION_DENIED, exactly as the live rules make it.
//
// THREE ARMS, because each one is what stops the others being meaningless:
//
//   scored   a round WITH scores, opened by somebody who is NOT its owner by uid
//            (an organizer holding the token on a second device). The reason must
//            be readable on screen and no write may be sent.
//   owner    the same played round, opened by the uid that owns it. PREPARED FOR
//            THE RULES PUBLISH: the confirm appears and names how many golfers
//            have scores on the card. Until database.rules.ownerdelete.json is
//            live this arm's write is still refused by the database, which is why
//            this branch is not merged.
//   clean    the round with NO scores. The confirm must appear, "Delete it" must
//            send the remove and leave for admin.html. Without this arm, "it
//            refuses and says why" is also true of a page that refuses everything
//            and can never delete anything.
//
// EXIT 0 and prints JSON. ok=true needs the refusal visible AND the clean round
// actually deleted. --shot <path> for a PNG of the refusal.
// ============================================================================

const path = require('path');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const W = 390, H = 844;
const CODE = 'DELROUND';
const UID = 'owner-cold-uid';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: i % 5 === 3 ? 3 : 4, hcpIndex: i });
const PLAYERS = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(2 + i * 4), playingForMoney: true }));
const scores = {};
PLAYERS.forEach((p, pi) => { for (let h = 1; h <= 2; h++) scores['p' + p.id + '_h' + h] = 4 + (pi % 3); });

const ROUND = {
    eventName: 'Saturday Game', courseName: 'Dobson Ranch', players: PLAYERS,
    gameFormat: 'match', matchScoringStyle: 'stroke', matchStake: 10, matchScoring: 'net',
    matchPressRule: '2down', courseData: CD, scores, settlementMode: 'whole-dollar',
    ownerUid: UID
};

// THE LIVE RULES, in the stand-in: a round with scores cannot be deleted whole.
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
          window.__denied = (window.__denied || 0) + 1;
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

const REFUSE_PROBE = `(function () {
  var notes = Array.prototype.slice.call(document.querySelectorAll('.ui-note'));
  // DETACHED? A note inserted beside a control that has left the document is in
  // the document's object graph and not in the document.
  function attached(el) { return !!(document.body && document.body.contains(el)); }
  function painted(el) {
    if (!el.getClientRects || !el.getClientRects().length) return null;
    var r = el.getBoundingClientRect();
    var top = Math.max(0, r.top), bot = Math.min(${H}, r.bottom);
    if (bot <= top || r.width <= 0) return null;
    return { top: Math.round(r.top), h: Math.round(bot - top), w: Math.round(r.width) };
  }
  var rows = notes.map(function (n) {
    return { cls: n.className, attached: attached(n), rect: painted(n),
             text: String(n.innerText || '').slice(0, 80) };
  });
  return JSON.stringify({
    denied: window.__denied || 0,
    sheetOpen: /\\bopen\\b/.test(String((document.getElementById('ui-sheet') || {}).className || '')),
    notes: rows,
    // THE CLAIM: a golfer can read a refusal. Rendered text, in the viewport.
    visible: rows.some(function (r) { return r.attached && r.rect && r.rect.h > 0 && r.text.length > 0; }),
    // innerText, never textContent: the page keeps its whole application in an
    // inline script, so textContent matches this sentence in the source of a
    // page that rendered nothing.
    onScreenText: String(document.body.innerText || '').indexOf('cannot be deleted') !== -1,
    confirmAppeared: !!document.getElementById('ui-sheet-yes'),
    wrote: (window.__coldWrites || []).filter(function (w) { return w.op === 'remove'; }).length,
    url: location.href.replace(/^file:.*\\//, '')
  });
})()`;

// THE CLEAN ROUND: the confirm has to appear and "Delete it" has to leave.
const CLEAN_PROBE = `(function () {
  return JSON.stringify({
    denied: window.__denied || 0,
    leftForHome: /admin\\.html/.test(location.href),
    stillOnCard: /index\\.html/.test(location.href),
    url: location.href.replace(/^file:.*\\//, '')
  });
})()`;

const CONFIRM_PROBE = `(function () {
  var yes = document.getElementById('ui-sheet-yes');
  var body = document.querySelector('#ui-sheet .ui-sheet-body');
  var title = document.querySelector('#ui-sheet .ui-sheet-title');
  return JSON.stringify({
    appeared: !!yes,
    title: title ? String(title.innerText || '') : '',
    firstBodyLine: body ? String(body.innerText || '').split('\\n')[0] : '',
    body: body ? String(body.innerText || '') : '',
    yesLabel: yes ? String(yes.innerText || '') : ''
  });
})()`;

const last = out => JSON.parse((out.value || []).filter(Boolean).pop());

(async () => {
    const shotIdx = process.argv.indexOf('--shot');
    const common = {
        auth: { uid: UID, email: 'owner@example.com', isAnonymous: false },
        preScript: DENY, viewport: { width: W, height: H }, settleMs: 3200
    };

    // ARM 1 - A ROUND WITH SCORES, and this device is NOT its owner by uid. It
    // holds the organizer token, which is what the BUTTON asks for; the database
    // asks for the uid, so this is the arm that must still be told no.
    const scoredOut = await arriveCold(Object.assign({}, common, {
        auth: { uid: 'second-device-uid', email: 'owner@example.com', isAnonymous: false },
        url: fileUrl('index.html', 'game=' + CODE + '&organizer=tok-' + CODE),
        rounds: { [CODE]: Object.assign({}, ROUND, { organizerToken: 'tok-' + CODE }) },
        steps: [
            { tap: '#round-sheet-handle' }, { sleep: 400 },
            { tap: '#end-round-mount .btn-danger' }, { sleep: 700 },
            { expression: REFUSE_PROBE }
        ].concat(shotIdx === -1 ? [] : [{ shot: path.resolve(process.argv[shotIdx + 1]) }])
    }));
    const scored = last(scoredOut);

    // ARM 2 - THE OWNER, on the same played round.
    const ownerOut = await arriveCold(Object.assign({}, common, {
        url: fileUrl('index.html', 'game=' + CODE),
        rounds: { [CODE]: ROUND },
        steps: [
            { tap: '#round-sheet-handle' }, { sleep: 400 },
            { tap: '#end-round-mount .btn-danger' }, { sleep: 700 },
            { expression: CONFIRM_PROBE }
        ]
    }));
    const owner = last(ownerOut);

    // ARM 3 - THE SAME ROUND, NO SCORES. The confirm, then "Delete it".
    const CLEAN = Object.assign({}, ROUND, { scores: {} });
    const confirmOut = await arriveCold(Object.assign({}, common, {
        url: fileUrl('index.html', 'game=' + CODE),
        rounds: { [CODE]: CLEAN },
        steps: [
            { tap: '#round-sheet-handle' }, { sleep: 400 },
            { tap: '#end-round-mount .btn-danger' }, { sleep: 700 },
            { expression: CONFIRM_PROBE }
        ]
    }));
    const confirm = last(confirmOut);

    // The delete itself needs the stub's own remove(), not the denying one.
    const deleteOut = await arriveCold(Object.assign({}, common, {
        preScript: '', url: fileUrl('index.html', 'game=' + CODE),
        rounds: { [CODE]: CLEAN },
        steps: [
            { tap: '#round-sheet-handle' }, { sleep: 400 },
            { tap: '#end-round-mount .btn-danger' }, { sleep: 700 },
            { tap: '#ui-sheet-yes' }, { sleep: 900 },
            { expression: CLEAN_PROBE }
        ]
    }));
    const deleted = last(deleteOut);
    const removes = (deleteOut.value || []).length ? deleted : {};

    const ok = !!(scored.visible && scored.onScreenText && scored.wrote === 0
                  && !scored.confirmAppeared
                  && owner.appeared && /golfers have scores on this card/.test(owner.body || '')
                  && confirm.appeared && confirm.firstBodyLine
                  && confirm.firstBodyLine.indexOf(confirm.title) === -1
                  && !/scores on this card/.test(confirm.body || '')
                  && removes.leftForHome);
    console.log(JSON.stringify({ ok, scored, owner, confirm, deleted }, null, 2));
})().catch(e => { console.error(String(e && e.message || e)); process.exit(2); });
