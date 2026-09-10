#!/usr/bin/env node
// ============================================================================
// EVERY GOLFER IN THE GROUP CAN WIPE THE ROUND.
//
// index.html:1357 puts a full-width red "End & Wipe Round" button at the bottom
// of the scorecard. Measured cold on a four-ball: 310x50px, visible, no hidden
// ancestor, 2.59 screens down a 2310px document. It is the last thing on the
// page - and every group link is the same page, so a four-ball is four people
// who can each destroy the round and an eight is eight.
//
// The copy invites it. "End Current Game / Finished playing? / End & Wipe
// Round" is three chances to read a shared, destructive control as "finish MY
// card". admin.html's equivalent button was deliberately made quiet years ago;
// index.html's never was, and index.html is the page everyone has.
//
// THE GATE IS isOrganizerView(), NOT THE TOKEN. index.html:4700 already defines
// "is this the organizer" as !hasGroupLock, and already gates the Group Links
// panel on it. The bearer token at index.html:4109 is stronger but MEASURED
// UNOBTAINABLE on a four-ball: the organizer link renders inside the Group
// Links panel, which bails when boundaries.length <= 1, so a single-group round
// never shows it. Gating on the token would remove this button from the
// organizer of the commonest round in the app with no way to get it back.
//
// NOT MERELY HIDDEN. batch1_safety_test.js:431 already demands this of Group
// Links - "organizer only, and not merely hidden with CSS" - because a
// display:none button is still in the DOM and still clickable from a console.
// The partner arm asserts the control is ABSENT, not invisible.
//
// confirm() IS STUBBED TRUE IN BOTH ARMS, deliberately. If it returned false
// for the partner the arm would pass because a dialog blocked it, which proves
// nothing about whether the button should have been there.
//
// THE DELETE STUB NEVER SETTLES, also deliberately. endAndClearRound's .then
// sets window.location.href = "admin.html", which would navigate away and take
// the probe's state with it. A pending promise lets the check count that a
// delete was ISSUED - which is the claim - without the page leaving.
//
//   node tools/round-wipe-permission-check.js
//
//   exit 0   only the organizer can reach it, and the copy says "for everyone"
//   exit 1   a partner can wipe the round, or the copy still misleads
//   exit 2   could not run, or the organizer arm never issued a delete.
//            NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CODE = 'WIPECK';

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

// FOUR golfers: one group, which is the shape where the organizer token is
// unobtainable and isOrganizerView() is the only discriminator available.
const PLAYERS = ['Dale Whitmore', 'Nate Brennan', 'Russ Calloway', 'Cal Devereaux']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(3 + i * 5), playingForMoney: true }));

// Scores present, so this is a round with something to lose - the case Rule A
// also refuses at the server.
const SCORES = {};
PLAYERS.forEach(p => { for (let h = 1; h <= 9; h++) SCORES['p' + p.id + '_h' + h] = 4; });

const db = { events: { [CODE]: {
    eventName: 'Saturday', courseName: 'Caledonia Golf & Fish Club',
    activeCourseKey: 'caledonia', gameFormat: 'stroke', courseData: CD,
    players: PLAYERS, scores: SCORES, settlementMode: 'whole-dollar',
    organizerToken: 'TOKEN123'
} } };

// Matches the button whether it keeps today's wording or takes the approved
// rewrite, so this check does not have to be edited in the same wave that
// changes the copy - and the copy assertions below are what pin the new words.
const WIPE_BUTTON = /(end\s*&\s*wipe|delete round|wipe (this )?round)/i;

const PRE = `
(function () {
  window.__confirms = [];
  window.__alerts = [];
  // TRUE IN BOTH ARMS. A partner arm that passed because the dialog said no
  // would be measuring the dialog, not the gate.
  window.confirm = function (m) { window.__confirms.push(String(m)); return true; };
  window.alert = function (m) { window.__alerts.push(String(m)); };
  window.print = function () {};

  window.__deletes = { attempted: 0, paths: [] };
  var origDatabase = window.firebase.database;
  window.firebase.database = function () {
    var real = origDatabase();
    return { ref: function (p) {
      var r = real.ref(p);
      var path = String(p);
      var orig = r.remove;
      r.remove = function () {
        window.__deletes.attempted++;
        window.__deletes.paths.push(path);
        // NEVER SETTLES. endAndClearRound's .then navigates to admin.html on
        // success, which would tear down this page before the probe reads it.
        return new Promise(function () {});
      };
      return r;
    } };
  };

  // Find and press the page's own button. No page function is called - the
  // button is located by its rendered text and clicked, the way a thumb does.
  window.__probe = null;
  var tries = 0;
  var iv = setInterval(function () {
    if (++tries > 120) {
      clearInterval(iv);
      // Absence is a RESULT here, not a timeout: the partner arm expects it.
      window.__probe = { found: false, why: 'no wipe button appeared in 9.6s' };
      return;
    }
    var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
    var b = btns.filter(function (x) { return ${WIPE_BUTTON}.test(x.innerText || ''); })[0];
    if (!b) return;
    clearInterval(iv);
    var cs = window.getComputedStyle(b);
    window.__probe = {
      found: true,
      text: (b.innerText || '').trim(),
      inDom: document.body.contains(b),
      display: cs.display,
      visibility: cs.visibility,
      offsetParentNull: b.offsetParent === null
    };
    b.click();
  }, 80);
})();`;

const PROBE = `
(() => {
  const out = {};
  const clean = s => String(s || '').replace(/\\s+/g, ' ').trim();
  out.probe = window.__probe;
  out.deletes = window.__deletes;
  out.confirms = (window.__confirms || []).map(clean);
  out.alerts = (window.__alerts || []).map(clean);
  // Independent of the preScript's own search, so a bug in one does not hide
  // the other: count matching buttons in the DOM right now.
  const all = Array.prototype.slice.call(document.querySelectorAll('button'));
  out.matchingButtonsInDom = all.filter(b => ${WIPE_BUTTON}.test(b.innerText || '')).length;
  out.totalButtons = all.length;
  return JSON.stringify(out);
})()`;

async function arm(name, query) {
    const r = await arriveCold({
        url: fileUrl('index.html', query), db, preScript: PRE,
        expression: PROBE, settleMs: 11000
    });
    if (!r.ok) return { arm: name, ran: false, reason: r.reason };
    try { return { arm: name, ran: true, ...JSON.parse(r.value) }; }
    catch (e) { return { arm: name, ran: false, reason: 'non-JSON probe: ' + String(r.value).slice(0, 200) }; }
}

(async () => {
    const organizer = await arm('organizer', 'game=' + CODE);
    const partner = await arm('partner', 'game=' + CODE + '&group=1');
    const bail = (why) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, organizer, partner }, null, 2));
        process.exit(2);
    };

    for (const a of [organizer, partner]) if (!a.ran) bail(`the ${a.arm} arm did not run: ${a.reason}`);

    // THE ANTI-TAUTOLOGY GATE. "The partner did not wipe the round" is trivially
    // true of a page where the button was never wired to anything. Unless the
    // ORGANIZER arm actually issued a delete when its button was pressed, this
    // check has measured nothing.
    if (!organizer.probe || !organizer.probe.found) {
        bail('the ORGANIZER arm found no wipe button at all - either the page did not '
           + 'render or the button text no longer matches. Nothing about permission was tested.');
    }
    if (!organizer.deletes || organizer.deletes.attempted < 1) {
        bail('the ORGANIZER arm pressed the button and NO DELETE WAS ISSUED - the control '
           + 'is not wired, so "a partner cannot delete" proves nothing. confirms='
           + JSON.stringify(organizer.confirms));
    }

    const failures = [];

    // ---- the claim: a partner has no such control -------------------------
    if (partner.probe && partner.probe.found) {
        failures.push('A PARTNER HAS THE WIPE BUTTON: "' + partner.probe.text + '"');
    }
    if (partner.matchingButtonsInDom > 0) {
        failures.push('NOT MERELY HIDDEN - the control is still IN THE DOM on a ?group= link ('
            + partner.matchingButtonsInDom + ' matching button(s)). A display:none button is '
            + 'still clickable from a console, which is why absence is the assertion.');
    }
    if (partner.deletes && partner.deletes.attempted > 0) {
        failures.push('A PARTNER ISSUED A DELETE: ' + JSON.stringify(partner.deletes.paths));
    }

    // ---- the copy IS behaviour --------------------------------------------
    const msg = (organizer.confirms || []).join(' | ');
    if (!msg) {
        failures.push('the organizer was never asked to confirm - a destructive control must ask');
    } else {
        if (!/for everyone/i.test(msg)) {
            failures.push('THE CONFIRM DOES NOT SAY "for everyone": "' + msg + '" - that is the '
                + 'one fact a golfer reading this at the turn is missing');
        }
        if (msg.indexOf(CODE) === -1) {
            failures.push('the confirm does not name the round code ' + CODE + ': "' + msg + '"');
        }
        if (/🏁/.test(msg)) {
            failures.push('the confirm still carries the chequered flag, which means "finished '
                + 'playing" - the exact misreading being fixed');
        }
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, organizer, partner }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch(e => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.message || e) }, null, 2));
    process.exit(2);
});
