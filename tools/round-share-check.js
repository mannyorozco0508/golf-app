#!/usr/bin/env node
// ============================================================================
// NO SAVED ROUND MAY EXIST WITH NO LINK ANYONE CAN COPY
//
// THE DEFECT THIS EXISTS FOR. The share surface lived on the SETUP screen, at step
// one, before a format or a course or a single golfer existed - and the group-links
// panel beside it hid itself whenever there was one group. So the round that a
// foursome actually plays, which is most of this group's golf, could be created,
// saved and started with nothing to send anybody. The Round Ready screen did have a
// links panel, behind a button, and for a single group it rendered a SENTENCE:
// the round code, it said, worked as the scorecard link for everyone. An organizer
// was told to read a code aloud.
//
// So: every roster size, every group, one labelled copyable https link, on arrival.
//
// AND THE COPY IS MEASURED, NOT ASSERTED. The note beside the links says what those
// links permit. This does not compare it against a group count - a group count is a
// PROXY. It opens the bare round link and then every group link, and counts the
// score inputs each one shows and how many of them can be edited:
//
//   every group link          fully writable - editable must equal what it shows,
//                             or somebody was sent a card they cannot fill in
//   the group links together  must show the field EXACTLY ONCE. Fewer inputs than
//                             the bare link and a golfer is unreachable; more and
//                             two scorekeepers are writing the same card.
//   at or below four golfers  the single link must cover the whole field
//   above four                each link must cover LESS than the field, which is
//                             what makes "send each group only their own" true
//
// That last pair is the sentence's whole content, and measuring it is what caught
// the first draft of it: the v72 wording said a multi-group link was "read-only",
// which was true of the BARE link the deleted setup card handed out and false of
// every link the app now sends. A group link is always writable; what changes above
// four golfers is who it covers. The rule survived the move by being re-measured
// rather than re-typed.
//
// NOTHING HERE CALLS A FUNCTION THE PAGE DEFINES. The round is saved by clicking
// the Save button, from a timer installed before any page script runs - a thumb,
// scheduled. Everything after that is the page doing its own work.
//
//   node tools/round-share-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON says which roster size had no link, or lied about one
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl, REPO_ROOT } = require('./lib/cold-arrival.js');
const path = require('path');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const roster = n => Array.from({ length: n }, (_, i) =>
    ({ id: 101 + i, name: 'Golfer' + (i + 1) + ' Lastname', hcp: '0' }));
// activeCourseKey is what loadModeData reads to fill the course field, and Save
// refuses without a course name. A fixture missing it would make every run bail on
// a dialog that has nothing to do with sharing.
const roundOf = n => ({ eventName: 'Share Check', courseName: 'Caledonia',
    activeCourseKey: 'caledonia-check', gameFormat: 'stroke',
    players: roster(n), courseData: CD, scores: {} });

// THE ONLY GESTURE. Installed before any page script; it waits for the Save button
// to be on screen and presses it, exactly as an organizer finishing setup does.
// saveSettings() is never named here - the button's own onclick is.
const PRESS_SAVE = `
(function () {
  // A headless browser has nobody to dismiss a dialog, so an alert() would simply
  // freeze the page and every measurement below would time out for a reason that
  // has nothing to do with sharing. Recorded instead of shown, and reported: a run
  // that hit a dialog is a run that did not finish saving.
  window.__dialogs = [];
  window.alert = function (m) { window.__dialogs.push(String(m)); };
  window.confirm = function (m) { window.__dialogs.push(String(m)); return true; };
  var tries = 0;
  var t = setInterval(function () {
    if (++tries > 60) { clearInterval(t); return; }
    var btn = document.getElementById('main-save-btn');
    if (!btn || btn.offsetParent === null || btn.disabled) return;
    clearInterval(t);
    btn.click();
  }, 100);
})();`;

// What is on the Round Ready screen after the page has finished saving.
const READY = `
(() => {
  const out = { dialogs: window.__dialogs || [] };
  const screen = document.getElementById('round-ready-screen');
  out.readyOnScreen = !!(screen && screen.getClientRects().length > 0);
  const box = document.getElementById('rr-links-box');
  out.linksBoxOnScreen = !!(box && box.getClientRects().length > 0);
  const note = document.getElementById('rr-links-note');
  // innerText, never textContent: this page keeps its whole application in an
  // inline <script>, and textContent would match that source and report copy as
  // rendered when nothing had been.
  out.note = note ? (note.innerText || '').replace(/\\s+/g, ' ').trim() : null;
  out.noteOnScreen = !!(note && note.getClientRects().length > 0);
  const rows = Array.from(document.querySelectorAll('#rr-links-box .group-link-row'));
  out.rows = rows.map(r => {
    const btn = r.querySelector('button');
    const m = (btn && btn.getAttribute('onclick') || '').match(/'([^']+)'/);
    return {
      label: (r.innerText || '').replace(/\\s+/g, ' ').trim(),
      url: m ? m[1] : null,
      copyOnScreen: !!(btn && btn.getClientRects().length > 0)
    };
  });
  return JSON.stringify(out);
})()`;

// What a link actually permits, counted on the scorecard it opens.
const PERMITS = `
(() => {
  const inputs = Array.from(document.querySelectorAll('input.score-input'));
  return JSON.stringify({
    scoreInputs: inputs.length,
    editable: inputs.filter(i => !i.disabled && !i.readOnly).length,
    badge: (document.getElementById('group-lock-badge') || {}).innerText || null
  });
})()`;

const open = async (url, db) => {
    const r = await arriveCold({ url: url, db: db, expression: PERMITS, settleMs: 3500 });
    if (!r.ok) return null;
    try { return JSON.parse(r.value); } catch (e) { return null; }
};

function bail(msg) {
    console.error('round-share-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// The check runs against file://, where a share link is deliberately rewritten to
// the canonical https origin - so the URL cannot be opened as-is. The PAGE part is
// what is being measured; it is re-pointed at this working copy to open it.
const asLocalUrl = url => {
    const q = url.indexOf('?');
    const page = url.slice(url.lastIndexOf('/', q === -1 ? url.length : q) + 1,
                           q === -1 ? url.length : q);
    return 'file://' + path.join(REPO_ROOT, page) + (q === -1 ? '' : url.slice(q));
};

const SIZES = [1, 2, 4, 5, 8, 9, 12];

(async () => {
    const problems = [];
    const report = { sizes: {} };
    let linksMeasured = 0;

    for (const n of SIZES) {
        const db = { events: { SHARE: roundOf(n) } };
        const r = await arriveCold({ url: fileUrl('admin.html', 'game=SHARE'), db: db,
            preScript: PRESS_SAVE, expression: READY, settleMs: 7000 });
        if (!r.ok) bail(n + ' golfers: ' + r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail(n + ' golfers: unreadable output'); }

        const size = { note: g.note, links: g.rows.map(x => x.url) };
        report.sizes[n] = size;

        if ((g.dialogs || []).length) size.dialogs = g.dialogs;
        if (!g.readyOnScreen) {
            bail(n + ' golfers: pressing Save never produced the Round Ready screen, '
                + 'so no share surface was measured at all'
                + ((g.dialogs || []).length ? ' - the page said: ' + JSON.stringify(g.dialogs) : ''));
        }
        if (!g.linksBoxOnScreen) {
            problems.push(n + ' golfers: the links panel is not on screen after saving');
        }

        const expected = Math.max(1, Math.ceil(n / 4));
        if (g.rows.length !== expected) {
            problems.push(n + ' golfers: expected ' + expected + ' group link(s), found '
                + g.rows.length + (g.rows.length === 0
                    ? ' - this round can be played with nothing to send anybody' : ''));
        }
        g.rows.forEach((row, i) => {
            if (!row.url) {
                problems.push(n + ' golfers: row ' + (i + 1) + ' has no URL to copy');
                return;
            }
            linksMeasured++;
            if (!/^https:\/\//.test(row.url)) {
                problems.push(n + ' golfers: row ' + (i + 1) + ' is not a link anyone '
                    + 'else can open: ' + row.url);
            }
            if (!/[?&]group=/.test(row.url)) {
                problems.push(n + ' golfers: row ' + (i + 1) + ' is not scoped to a group: '
                    + row.url);
            }
            if (!row.copyOnScreen) {
                problems.push(n + ' golfers: row ' + (i + 1) + ' has no copy control on screen');
            }
            if (!/Group\s*\d/.test(row.label)) {
                problems.push(n + ' golfers: row ' + (i + 1) + ' does not say which group '
                    + 'it is for: ' + JSON.stringify(row.label));
            }
        });
        if (new Set(size.links).size !== size.links.length) {
            problems.push(n + ' golfers: two groups were given the same link');
        }

        // THE MEASUREMENT. Open the bare round link, then every group link.
        if (!g.note) {
            problems.push(n + ' golfers: the links are handed over with no note saying '
                + 'what they permit');
        } else if (!g.noteOnScreen) {
            problems.push(n + ' golfers: the note is in the markup but not on screen');
        }

        const whole = await open(fileUrl('index.html', 'game=SHARE'), db);
        if (!whole) bail(n + ' golfers: the round\'s own scorecard would not open');
        if (whole.scoreInputs === 0) {
            bail(n + ' golfers: the scorecard rendered no score inputs at all, so '
                + 'nothing below was measured - this proves nothing either way');
        }
        size.wholeField = whole;

        let covered = 0;
        for (let i = 0; i < size.links.length; i++) {
            const url = size.links[i];
            if (!url) continue;
            const perm = await open(asLocalUrl(url), db);
            if (!perm) bail(n + ' golfers: group link ' + (i + 1) + ' would not open');
            size['group' + (i + 1) + 'Permits'] = perm;
            covered += perm.scoreInputs;

            if (perm.scoreInputs === 0) {
                problems.push(n + ' golfers: the Group ' + (i + 1) + ' link shows no '
                    + 'scorecard at all');
            } else if (perm.editable !== perm.scoreInputs) {
                problems.push(n + ' golfers: the Group ' + (i + 1) + ' scorekeeper link '
                    + 'cannot enter every score on the card it shows ('
                    + perm.editable + '/' + perm.scoreInputs + ')');
            }
        }

        // The links must tile the field exactly once.
        if (covered !== whole.scoreInputs) {
            problems.push(n + ' golfers: the group links cover ' + covered + ' score '
                + 'inputs against a field of ' + whole.scoreInputs
                + (covered < whole.scoreInputs
                    ? ' - a golfer has nobody able to enter their score'
                    : ' - two links can write the same card'));
        }

        // AND THE SENTENCE, against that.
        const one = size.links.length === 1;
        const said = g.note || '';
        if (n <= 4) {
            if (!one || (size.group1Permits || {}).scoreInputs !== whole.scoreInputs) {
                problems.push(n + ' golfers: this round is one group but its link does '
                    + 'not cover the field');
            }
            if (!/scorekeeper/i.test(said)) {
                problems.push(n + ' golfers: the one link covers the whole field and is '
                    + 'fully writable, but the note reads ' + JSON.stringify(said));
            }
            if (/own link|their own/i.test(said)) {
                problems.push(n + ' golfers: the note tells a foursome to send each group '
                    + 'a different link, and there is only one');
            }
        } else {
            const scoped = size.links.every((_, i) =>
                (size['group' + (i + 1) + 'Permits'] || {}).scoreInputs < whole.scoreInputs);
            if (!scoped) {
                problems.push(n + ' golfers: a group link opens the whole field, so '
                    + '"only their own" is not true of it');
            }
            if (!/own link|their own/i.test(said)) {
                problems.push(n + ' golfers: each link covers only its own group and the '
                    + 'note does not say so: ' + JSON.stringify(said));
            }
            // The v72 wording, carried across unexamined, would say this.
            if (/read-only/i.test(said)) {
                problems.push(n + ' golfers: the note calls a fully writable group link '
                    + 'read-only: ' + JSON.stringify(said));
            }
        }
    }

    // A check that measured no link must not pass.
    if (linksMeasured === 0) bail('no share link was produced at any roster size - '
        + 'nothing was measured');
    report.linksMeasured = linksMeasured;
    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
