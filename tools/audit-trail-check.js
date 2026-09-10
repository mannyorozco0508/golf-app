#!/usr/bin/env node
// ============================================================================
// THE AUDIT LOG IS WHAT SETTLES AN ARGUMENT, AND IT CAN DISAGREE WITH THE CARD.
//
// Three silent writes remain on the Consumer score path. All three are
// side effects of a score change, and none of them is observed.
//
//   undoAuditEntry       the restore write is fire-and-forget, and
//                        logAuditEntry() is called on the NEXT LINE - not
//                        inside a .then. So the two are never sequenced: the
//                        log entry is written in parallel with the write it
//                        claims to describe. A log written that way cannot be
//                        correct by construction; it is correct only because
//                        the write usually works. Refuse the restore and the
//                        card keeps the old value while the log says it was
//                        undone.
//
//   logAuditEntry        called from saveScore on the write PATH, not on its
//                        result. If the score lands and the log is refused, the
//                        score changes with no record of who changed it, the
//                        Undo row for that change never exists - the modal is
//                        rendered from auditLog - and the save-state line says
//                        "Saved", truthfully, because the SCORE saved. The
//                        surface that exists reports success for the write it
//                        watches while the write it does not watch fails.
//
//   clearScoresVerified  sets currentData.scoresVerified = null BEFORE the
//                        write and never checks it. RTDB reverts on rejection
//                        and the listener reassigns currentData wholesale, so
//                        the verification badge disappears and then silently
//                        COMES BACK moments after a golfer corrects a score.
//
// PATH-SELECTIVE STUBS, one variable per scenario. Rejecting everything would
// fail the score write too and every arm would be measuring the wrong failure.
//
// NOTHING HERE CALLS A PAGE FUNCTION. Not saveScore, not undoAuditEntry, not
// renderHistoryList. The History modal is opened by pressing its own button,
// Undo by pressing the row's own button, and a score is entered by typing into
// an empty box and firing the change event the markup already binds.
//
//   node tools/audit-trail-check.js
//
//   exit 0   all three failures reach the golfer, and the log matches the card
//   exit 1   one of them is still silent, or the log disagrees with the card
//   exit 2   could not run, or a failure was never induced. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CODE = 'AUDCHK';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

const PLAYERS = ['Dale Whitmore', 'Nate Brennan', 'Russ Calloway', 'Cal Devereaux']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(3 + i * 5), playingForMoney: true }));

// Holes 1-9 scored, so the card is a round in progress and hole 10 onward is
// empty - a box the check can type into without overwriting anything.
const SCORES = {};
PLAYERS.forEach(p => { for (let h = 1; h <= 9; h++) SCORES['p' + p.id + '_h' + h] = 4; });

// One existing log entry, so the History modal has a row with an Undo button on
// arrival. oldValue 4 -> newValue 7 on hole 1: undoing it restores 4.
const AUDIT = { entry1: {
    playerId: 101, playerName: 'Dale Whitmore', hole: 1,
    oldValue: 4, newValue: 7, ts: Date.now() - 60000
} };

const round = (extra) => Object.assign({
    eventName: 'Single Round', courseName: 'Caledonia Golf & Fish Club',
    activeCourseKey: 'caledonia', gameFormat: 'stroke', courseData: CD,
    players: PLAYERS, scores: Object.assign({}, SCORES, { p101_h1: 7 }),
    auditLog: AUDIT, settlementMode: 'whole-dollar'
}, extra || {});

const db = { events: {
    [CODE]: round(),
    // Same round, already verified - so a score edit fires clearScoresVerified.
    VERCHK: round({ scoresVerified: { verified: true, verifiedAt: Date.now(), verifiedBy: 'round' } })
} };

// `reject` names the path family that fails. Everything else resolves.
function preScript(reject, action) {
    return `
    (function () {
      window.__alerts = [];
      window.alert = function (m) { window.__alerts.push(String(m)); };
      window.confirm = function () { return true; };
      window.print = function () {};

      window.__w = { scores: {a:0,r:0}, audit: {a:0,r:0}, verified: {a:0,r:0}, paths: [] };
      function bucket(p) {
        if (p.indexOf('/scoresVerified') !== -1) return 'verified';
        if (p.indexOf('/auditLog') !== -1) return 'audit';
        if (p.indexOf('/scores/') !== -1) return 'scores';
        return null;
      }
      var origDatabase = window.firebase.database;
      window.firebase.database = function () {
        var real = origDatabase();
        return { ref: function (p) {
          var r = real.ref(p);
          var path = String(p);
          var b = bucket(path);
          ['set', 'update', 'remove'].forEach(function (m) {
            var orig = r[m];
            r[m] = function () {
              if (window.__w.paths.length < 24) window.__w.paths.push(path + ' .' + m + '()');
              if (b) window.__w[b].a++;
              if (b === '${reject}') {
                window.__w[b].r++;
                var e = new Error('PERMISSION_DENIED: Permission denied');
                e.code = 'PERMISSION_DENIED';
                return Promise.reject(e);
              }
              return Promise.resolve(orig ? orig.apply(r, arguments) : undefined);
            };
          });
          return r;
        } };
      };

      window.__trace = [];
      var step = 0, tries = 0;
      var iv = setInterval(function () {
        if (++tries > 150) { clearInterval(iv); window.__trace.push('TIMEOUT at ' + step); return; }
        try {
          if ('${action}' === 'undo') {
            if (step === 0) {
              var open = Array.prototype.slice.call(document.querySelectorAll('button'))
                  .filter(function (b) { return /history/i.test(b.innerText || ''); })[0];
              if (!open) return;
              open.click(); window.__trace.push('opened History'); step = 1; return;
            }
            if (step === 1) {
              var u = document.querySelector('.history-undo-btn');
              if (!u) return;
              u.click(); window.__trace.push('pressed Undo'); step = 2; clearInterval(iv); return;
            }
          } else {
            // Type a score into an EMPTY box, the way a golfer does.
            var boxes = Array.prototype.slice.call(
                document.querySelectorAll('input.score-input:not([disabled])'))
                .filter(function (b) { return !b.value; });
            if (!boxes.length) return;
            var el = boxes[0];
            el.focus(); el.value = '5';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            window.__trace.push('typed a score'); clearInterval(iv);
          }
        } catch (e) { window.__trace.push('threw: ' + (e && e.message)); clearInterval(iv); }
      }, 70);
    })();`;
}

const PROBE = `
(() => {
  const out = {};
  const clean = s => String(s || '').replace(/\\s+/g, ' ').trim();
  out.trace = window.__trace || [];
  out.writes = window.__w;
  out.alerts = (window.__alerts || []).map(clean);

  const ss = document.getElementById('save-state');
  out.saveState = ss ? { cls: ss.className || '', text: clean(ss.innerText) } : null;

  const pill = document.getElementById('golfnet-status');
  out.pill = pill
    ? { text: clean(pill.innerText),
        hiddenOrIdle: ((pill.style && pill.style.display) === 'none') || clean(pill.innerText) === '' }
    : { text: '', hiddenOrIdle: true };

  // The modal, and the row the Undo was pressed on.
  const ov = document.getElementById('history-modal-overlay');
  out.modalOpen = !!(ov && ov.style.display === 'flex');
  const rows = Array.prototype.slice.call(document.querySelectorAll('.history-row'));
  out.rowCount = rows.length;
  out.rowText = rows.length ? clean(rows[0].innerText) : '';
  out.modalText = ov ? clean(ov.innerText) : '';

  // The card value the undo was meant to restore.
  const box = document.querySelector('input.score-input');
  out.firstBoxValue = box ? box.value : null;
  return JSON.stringify(out);
})()`;

async function arm(name, code, reject, action) {
    const r = await arriveCold({
        url: fileUrl('index.html', 'game=' + code), db,
        preScript: preScript(reject, action), expression: PROBE, settleMs: 12000
    });
    if (!r.ok) return { name, ran: false, reason: r.reason };
    try { return { name, ran: true, ...JSON.parse(r.value) }; }
    catch (e) { return { name, ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 160) }; }
}

const FAILURE_WORDS = /(could ?n.?t|could not|not saved|failed|did not go through|try again|refused)/i;

(async () => {
    const undoRefused = await arm('undo-refused', CODE, 'scores', 'undo');
    const undoOk = await arm('undo-control', CODE, 'none', 'undo');
    const auditRefused = await arm('audit-refused', CODE, 'audit', 'score');
    const verRefused = await arm('verified-refused', 'VERCHK', 'verified', 'score');
    const all = [undoRefused, undoOk, auditRefused, verRefused];

    const bail = (why) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, undoRefused, undoOk, auditRefused, verRefused }, null, 2));
        process.exit(2);
    };
    for (const a of all) if (!a.ran) bail(`${a.name} did not run: ${a.reason}`);

    // ---- anti-tautology gates, one per scenario ---------------------------
    if (undoRefused.writes.scores.a < 1 || undoRefused.writes.scores.r < 1) {
        bail('undo-refused: the restore write was not attempted and refused - nothing was '
           + 'exercised. trace=' + JSON.stringify(undoRefused.trace));
    }
    if (undoOk.writes.scores.a < 1) bail('undo-control: no restore write was attempted');
    if (auditRefused.writes.scores.a < 1) bail('audit-refused: no score write was attempted');
    if (auditRefused.writes.audit.a < 1 || auditRefused.writes.audit.r < 1) {
        bail('audit-refused: the auditLog write was not attempted and refused. trace='
           + JSON.stringify(auditRefused.trace));
    }
    if (verRefused.writes.verified.a < 1 || verRefused.writes.verified.r < 1) {
        bail('verified-refused: the scoresVerified write was not attempted and refused. trace='
           + JSON.stringify(verRefused.trace));
    }

    const f = [];

    // ---- 1. THE SEQUENCING. A refused restore must log NOTHING. -----------
    if (undoRefused.writes.audit.a > 0) {
        f.push('THE LOG DISAGREES WITH THE CARD: the restore was REFUSED and '
            + undoRefused.writes.audit.a + ' auditLog write(s) still went out. logAuditEntry '
            + 'must be sequenced inside .then, not called on the next line.');
    }
    if (!FAILURE_WORDS.test(undoRefused.modalText)) {
        f.push('a refused Undo says nothing in the modal the golfer is looking at. modal text="'
            + undoRefused.modalText.slice(0, 160) + '"');
    }
    // The control proves the sequencing did not simply stop logging altogether.
    if (undoOk.writes.audit.a < 1) {
        f.push('CONTROL: a SUCCESSFUL undo logged nothing - sequencing must not silence the log');
    }
    if (FAILURE_WORDS.test(undoOk.modalText)) {
        f.push('CONTROL: a successful undo shows a failure message: "' + undoOk.modalText.slice(0, 120) + '"');
    }

    // ---- 2. the save-state line must not claim Saved --------------------
    // ASSERTED ON THE CLASS, NOT THE TEXT. setSaveState's 'saved' state clears its
    // TEXT after 2000ms and leaves the class behind, so by the time any probe reads
    // the page the text is empty and a text-only assertion silently passes. The
    // class is what records the state the line actually settled in.
    if (auditRefused.saveState && /\bsaved\b/.test(auditRefused.saveState.cls)) {
        f.push('THE SAVE-STATE LINE SETTLED ON "saved" WHILE THE AUDIT WRITE WAS REFUSED: '
            + 'class="' + auditRefused.saveState.cls + '" text="' + auditRefused.saveState.text
            + '" - the score landed, the record of who changed it did not, and the only '
            + 'surface the golfer has says it went fine');
    }
    if (auditRefused.saveState && /\berror\b/.test(auditRefused.saveState.cls)
        && !FAILURE_WORDS.test(auditRefused.saveState.text)) {
        f.push('the save-state line is in the error state but says nothing: "'
            + auditRefused.saveState.text + '"');
    }
    if (auditRefused.pill.hiddenOrIdle) {
        f.push('the pill reports all-saved after a refused auditLog write');
    }

    // ---- 3. the badge reappearing must be explicable ---------------------
    if (verRefused.pill.hiddenOrIdle) {
        f.push('THE VERIFICATION BADGE COMES BACK WITH NOTHING TO EXPLAIN IT: the pill is idle '
            + 'after a refused scoresVerified write');
    }

    const verdict = f.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures: f, undoRefused, undoOk, auditRefused, verRefused }, null, 2));
    process.exit(f.length ? 1 : 0);
})().catch(e => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.message || e) }, null, 2));
    process.exit(2);
});
