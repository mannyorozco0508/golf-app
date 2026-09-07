#!/usr/bin/env node
// ============================================================================
// A TYPED CODE OPENS THE RIGHT ROUND
//
// The home screen's code field came back in a smaller shape, and with a different
// destination. joinRoom() sent a typed code to admin.html?game=CODE, which lands
// on the organizer's Review step holding "Save & Start Round" - so the golfer who
// typed the code somebody read out arrived holding the control that rewrites the
// round. This proves the field now opens the SCORECARD, on a real browser, by
// typing into the real input and pressing the real button.
//
// AND IT MEASURES THE SENTENCE BESIDE IT. The note says a bare code is read-only
// above four golfers. That is a claim about what the destination PERMITS, so it is
// checked the way the share note is: follow where the field sends you and count
// the score inputs you can actually edit.
//
//   4 golfers   fully editable  - a foursome types a code and can keep score
//   9 golfers   0 editable      - the note has to say so, and does
//
// NOTHING HERE CALLS A PAGE FUNCTION. openRoundByCode is never named: the input is
// typed into and the button is clicked. If the button is not wired, this fails.
//
//   node tools/code-entry-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON says which case went wrong
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl, REPO_ROOT } = require('./lib/cold-arrival.js');
const path = require('path');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const roundOf = n => ({ eventName: 'Code Entry', courseName: 'Caledonia',
    activeCourseKey: 'code-check', gameFormat: 'stroke', courseData: CD, scores: {},
    players: Array.from({ length: n }, (_, i) =>
        ({ id: 101 + i, name: 'Golfer' + (i + 1) + ' Lastname', hcp: '0' })) });

// Type into the field and press the button. A thumb, nothing else.
const TYPE_AND_GO = text => `
(() => {
  const out = {};
  const el = document.getElementById('join-code-input');
  const row = document.getElementById('join-code-row');
  const note = document.getElementById('join-code-note');
  if (!el) { out.error = 'no code field on the home screen'; return JSON.stringify(out); }

  // Shape, before touching it. innerText for the note - this page keeps its whole
  // application in an inline <script> and textContent would match that source.
  out.rowOnScreen = !!(row && row.getClientRects().length > 0);
  out.note = note ? (note.innerText || '').replace(/\\s+/g, ' ').trim() : null;
  out.noteOnScreen = !!(note && note.getClientRects().length > 0);
  const btn = row ? row.querySelector('button') : null;
  out.btnLabel = btn ? (btn.innerText || '').trim() : null;
  out.inputH = Math.round(el.getBoundingClientRect().height);
  out.btnH = btn ? Math.round(btn.getBoundingClientRect().height) : 0;
  // One row: the button's top must overlap the field's, not sit under it.
  const a = el.getBoundingClientRect(), b = btn ? btn.getBoundingClientRect() : null;
  out.sameRow = !!(b && Math.abs(a.top - b.top) < 12);
  out.inputW = Math.round(a.width);
  out.pageW = Math.round(document.documentElement.clientWidth);

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(text)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (!btn) { out.error = 'no button next to the field'; return JSON.stringify(out); }
  btn.click();
  return JSON.stringify(out);
})()`;

const WHERE = `JSON.stringify({ url: document.URL })`;

const PERMITS = `
(() => {
  const inputs = Array.from(document.querySelectorAll('input.score-input'));
  const badge = document.getElementById('group-lock-badge');
  return JSON.stringify({
    scoreInputs: inputs.length,
    editable: inputs.filter(i => !i.disabled && !i.readOnly).length,
    badge: badge && badge.getClientRects().length > 0 ? (badge.innerText || '').trim() : null
  });
})()`;

function bail(msg) {
    console.error('code-entry-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// The field builds an https link on purpose - see tools/share-url-check.js - so the
// destination is re-pointed at this working copy to be opened. The PATH and QUERY
// are what is being checked, and they are used exactly as produced.
const asLocalUrl = url => {
    const q = url.indexOf('?');
    const page = url.slice(url.lastIndexOf('/', q === -1 ? url.length : q) + 1,
                           q === -1 ? url.length : q);
    return 'file://' + path.join(REPO_ROOT, page) + (q === -1 ? '' : url.slice(q));
};

(async () => {
    const problems = [];
    const report = { cases: {} };
    let measured = 0;

    const CASES = [
        { name: '4 golfers, bare code', n: 4, typed: 'CODE44',
          wantGroup: false, wantEditable: true },
        { name: '9 golfers, bare code', n: 9, typed: 'CODE44',
          wantGroup: false, wantEditable: false },
        { name: '9 golfers, pasted group link', n: 9,
          typed: 'https://golf-app-5a5.pages.dev/index.html?game=CODE44&group=2',
          wantGroup: '2', wantEditable: true },
    ];

    for (const c of CASES) {
        const db = { events: { CODE44: roundOf(c.n) } };
        const typed = await arriveCold({ url: fileUrl('admin.html'), db: db,
            expression: TYPE_AND_GO(c.typed), settleMs: 3500 });
        if (!typed.ok) bail(c.name + ': ' + typed.reason);
        const t = JSON.parse(typed.value);
        if (t.error) bail(c.name + ': ' + t.error);

        // Where the button actually sent the browser.
        const where = await arriveCold({ url: fileUrl('admin.html'), db: db,
            preScript: `(function(){ setTimeout(function () {
                 var el = document.getElementById('join-code-input');
                 var row = document.getElementById('join-code-row');
                 var btn = row && row.querySelector('button');
                 if (!el || !btn) return;
                 var s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                 s.call(el, ${JSON.stringify(c.typed)});
                 btn.click();
               }, 1500); })();`,
            expression: WHERE, settleMs: 4500 });
        if (!where.ok) bail(c.name + ': ' + where.reason);
        // THE FIRST REQUEST, which is the link the page built. Reading document.URL
        // afterwards would grade Cloudflare's clean-URL redirect instead: it rewrites
        // /index.html?game=X to /?game=X, and an earlier draft of this check reported
        // that as a missing filename in the app. The app was right; the check was
        // measuring the server. See the note in tools/lib/cold-arrival.js - this does
        // make one real outbound GET, and no server can rewrite what was requested.
        const asked = (where.requests || []).filter(u => /[?&]game=/.test(u));
        if (asked.length === 0) {
            bail(c.name + ': pressing the button requested no round at all - either it '
                + 'is not wired, or nothing was measured');
        }
        const dest = asked[0];
        const shape = { note: t.note, dest: dest, inputH: t.inputH, btnH: t.btnH,
                        sameRow: t.sameRow, btnLabel: t.btnLabel };
        report.cases[c.name] = shape;

        measured++;

        // THE DEFECT THAT IS NOT BEING RESTORED.
        if (/admin\.html/.test(dest)) {
            problems.push(c.name + ': a typed code opened the ORGANIZER WIZARD, '
                + 'which shows Save & Start Round: ' + dest);
        }
        if (!/index\.html\?game=CODE44/.test(dest)) {
            problems.push(c.name + ': did not open the round\'s scorecard: ' + dest);
        }
        const gotGroup = (/[?&]group=(\d+)/.exec(dest) || [])[1] || null;
        if (c.wantGroup && gotGroup !== c.wantGroup) {
            problems.push(c.name + ': the pasted link\'s group was dropped (got '
                + gotGroup + ')');
        }
        if (!c.wantGroup && gotGroup) {
            problems.push(c.name + ': a group was INVENTED for a typed code (' + gotGroup
                + ') - that hands scorekeeper rights over another foursome to anyone '
                + 'who knows the code');
        }

        // Shape, on a real phone-sized viewport.
        if (t.inputH < 44) problems.push(c.name + ': the field is ' + t.inputH + 'px tall');
        if (t.btnH < 44) problems.push(c.name + ': the button is ' + t.btnH + 'px tall');
        if (!t.sameRow) problems.push(c.name + ': the field and button are not on one row');
        if (t.inputW >= t.pageW - 40) {
            problems.push(c.name + ': the field is full width again (' + t.inputW
                + 'px of ' + t.pageW + ')');
        }
        if (!t.noteOnScreen) problems.push(c.name + ': the note is not on screen');

        // AND WHAT THE DESTINATION PERMITS, against what the note claims.
        const perm = await arriveCold({ url: asLocalUrl(dest), db: db,
            expression: PERMITS, settleMs: 3800 });
        if (!perm.ok) bail(c.name + ', opening the destination: ' + perm.reason);
        const p = JSON.parse(perm.value);
        shape.permits = p;
        if (p.scoreInputs === 0) {
            problems.push(c.name + ': the destination rendered no score inputs, so '
                + 'nothing was measured - this proves nothing either way');
            continue;
        }
        if (c.wantEditable && p.editable === 0) {
            problems.push(c.name + ': expected to be able to score and could not (0/'
                + p.scoreInputs + ')');
        }
        if (!c.wantEditable) {
            if (p.editable > 0) {
                problems.push(c.name + ': a bare code can score (' + p.editable + '/'
                    + p.scoreInputs + ') on a round the note calls read-only');
            }
            if (!/read-only/i.test(t.note || '')) {
                problems.push(c.name + ': the destination is read-only (0/' + p.scoreInputs
                    + ') and the note does not say so: ' + JSON.stringify(t.note));
            }
        }
    }

    if (measured === 0) bail('the button never opened a round in any case - nothing measured');
    report.casesMeasured = measured;
    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
