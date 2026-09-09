#!/usr/bin/env node
// ============================================================================
// TWO GOLFERS THE SCORECARD CANNOT TELL APART, AND A HANDICAP COLUMN THAT
// PRINTS THE GROSS.
//
// Both found on live round Y5VGXM, and both are RENDER faults over a record that
// is correct.
//
//   THE LABEL. index.html's Full Card header shows p.name.split(" ")[0]. The
//   record holds "Player 1".."Player 8" - distinct names, which is exactly why
//   settlement does not refuse the round - and the header throws away the digit
//   that distinguishes them. Eight columns all read "Player". Hole View re-reads
//   those same header cells for its row labels, so the collision is on both
//   scorecard views from one builder.
//
//   THE HANDICAP. renderLiveBoard interpolates r.hcp raw. A stored "" gives the
//   literal "HCP " with nothing after it, and the gross score in the next span
//   lands where the number should be: "Player 1 HCP 90 Net 90". The scorecard
//   header and Hole View both route the same value through formatHcpDisplay and
//   read "HCP 0". One value, two answers, and the wrong one is on the surface a
//   golfer opens to check somebody else's handicap.
//
// COLD ARRIVAL ON A GROUP SCOREKEEPER LINK. The page loads its own scripts, runs
// its own init and renders on its own. The only things pressed are the page's own
// "Full Card" and "Full Leaderboard >" buttons. NOTHING HERE CALLS A PAGE
// FUNCTION - a check that invokes the renderer it is about to measure proves the
// renderer works when invoked, never that a golfer can reach it.
//
// HAND-COMPUTED. Par 4 x 18 = 72. Golfer k (0-indexed) plays 4 on every hole
// except the first k holes, where they play 3:
//
//   gross  72 / 71 / 70 / 69
//   net at hcp ""   72 / 71 / 70 / 69   (a blank handicap is scratch)
//   net at hcp 12   60 / 59 / 58 / 57
//
//   node tools/name-label-check.js
//
//   exit 0   every golfer has a label of their own, and HCP says a handicap
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

function roundOf(names, hcp) {
    const players = names.map((n, i) => ({ id: 101 + i, name: n, hcp: hcp,
        playingForMoney: true, team: i < 2 ? 'Team 1' : 'Team 2' }));
    const scores = {};
    players.forEach((p, k) => CD.forEach(h => {
        scores['p' + p.id + '_h' + h.hole] = (h.hole <= k) ? 3 : 4; }));
    return { eventName: 'Single Round', courseName: 'Tri-Mountain Golf Course',
        activeCourseKey: 'swwa_trimountain', gameFormat: 'stroke', courseData: CD,
        players: players, scores: scores, settlementMode: 'whole-dollar',
        moneyPool: { enabled: true, buyIn: 40, net: { amount: 100, places: [50, 30, 20] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: true } } };
}

const db = { events: {
    // Y5VGXM's own shape, trimmed to one group's worth.
    PLACE: roundOf(['Player 1', 'Player 2', 'Player 3', 'Player 4'], ''),
    // The control: ordinary names must still read as first names only.
    REAL:  roundOf(['Marty Sharp', 'Zach Hill', 'Manny Orozco', 'Lance Webb'], ''),
    // REPORTED, NOT ASSERTED. Two golfers who genuinely share a first name is a
    // real shape; this wave measures what the app does with it and invents no rule.
    MARTY: roundOf(['Marty Sharp', 'Marty Kane', 'Zach Hill', 'Lance Webb'], ''),
    // The handicap control. Same round, a real number instead of a blank.
    HCP12: roundOf(['Marty Sharp', 'Zach Hill', 'Manny Orozco', 'Lance Webb'], '12'),
} };

const PRE = `(function(){ window.print=function(){}; window.alert=function(){}; })();`;

const PROBE = `
(() => {
  const out = {};
  const byHandler = re => Array.from(document.querySelectorAll('button'))
      .find(b => re.test(b.getAttribute('onclick') || ''));
  const txt = e => (e && e.innerText ? e.innerText : '').replace(/\\s+/g, ' ').trim();

  // HOLE VIEW is what a cold arrival lands on. Read its row labels first, before
  // anything is pressed.
  out.holeViewLabels = Array.from(document.querySelectorAll('.hv-player-name')).map(txt);

  // THE FULL CARD, through the page's own view toggle.
  const full = byHandler(/setViewMode\\('full'\\)/);
  out.fullCardButton = !!full;
  if (full) full.click();
  out.headerLabels = Array.from(document.querySelectorAll('th .fc-name'))
      .map(e => e.textContent.trim());
  out.headerHcps = Array.from(document.querySelectorAll('th .fc-hcp'))
      .map(e => e.textContent.trim());
  // The attribute Hole View re-reads. If the two ever disagree the views disagree.
  out.headerAttrs = Array.from(document.querySelectorAll('th[data-player-name]'))
      .map(e => e.getAttribute('data-player-name'));

  // THE FULL LEADERBOARD OVERLAY, through the page's own button.
  const more = byHandler(/openLiveBoard/);
  out.fullBoardButton = !!more;
  if (more) more.click();
  const body = document.getElementById('live-board-body');
  out.overlayOpened = (() => { const o = document.getElementById('live-board-overlay');
      return !!o && o.style.display === 'flex'; })();
  out.overlayHcps = body ? Array.from(body.querySelectorAll('.lb-hcp')).map(e => e.textContent) : null;
  out.overlayNames = body ? Array.from(body.querySelectorAll('.lb-c-name'))
      .map(e => (e.childNodes[0] ? String(e.childNodes[0].textContent).trim() : '')) : null;
  out.overlayGross = body ? Array.from(body.querySelectorAll('.lb-gross')).map(e => e.textContent.trim()) : null;
  out.overlayNet = body ? Array.from(body.querySelectorAll('.lb-net')).map(e => e.textContent.trim()) : null;
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('name-label-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

const distinct = a => Array.isArray(a) && a.length > 0
    && new Set(a).size === a.length;

(async () => {
    const problems = [];
    const seen = {};
    for (const code of ['PLACE', 'REAL', 'MARTY', 'HCP12']) {
        const r = await arriveCold({ url: fileUrl('index.html', 'game=' + code + '&group=1'),
            db: db, expression: PROBE, preScript: PRE, settleMs: 5200 });
        if (!r.ok) bail(code + ': ' + r.reason);
        try { seen[code] = JSON.parse(r.value); }
        catch (e) { bail(code + ': unreadable probe output'); }
    }

    // A RUN THAT RENDERED NOTHING MEASURED NOTHING. "no two labels are the same"
    // is true of an empty list, forever, which is precisely how a negative-only
    // assertion guards nothing.
    ['PLACE', 'REAL', 'MARTY', 'HCP12'].forEach(k => {
        if (!seen[k].fullCardButton) bail(k + ': the Full Card toggle was not on the page');
        if ((seen[k].headerLabels || []).length !== 4)
            bail(k + ': the scorecard header rendered '
                 + (seen[k].headerLabels || []).length + ' player columns, not 4');
        if (!seen[k].overlayOpened) bail(k + ': the Full Leaderboard overlay did not open');
        if ((seen[k].overlayHcps || []).length !== 4)
            bail(k + ': the overlay rendered ' + (seen[k].overlayHcps || []).length + ' rows, not 4');
    });

    const P = seen.PLACE, R = seen.REAL, M = seen.MARTY, H = seen.HCP12;

    const A = {
        // ---- FIX 2: A LABEL OF THEIR OWN ----------------------------------
        placeholdersGetFourDifferentLabels: distinct(P.headerLabels),
        // The specific failure: not just "distinct", but not all the same word.
        placeholdersAreNotAllTheSameWord: new Set(P.headerLabels).size !== 1,
        // Hole View reads the header cells, so it must inherit the fix rather than
        // need its own. Compared as sets because the two views order rows the same
        // way but nothing in this wave depends on that.
        holeViewInheritsTheSameLabels:
            JSON.stringify((P.holeViewLabels || []).map(s => s.replace(/ HCP.*$/, '')))
                === JSON.stringify(P.headerLabels),
        // and the attribute Hole View re-reads must carry the same string
        placeholderAttrsMatchTheLabels:
            JSON.stringify(P.headerAttrs) === JSON.stringify(P.headerLabels),

        // ---- THE CONTROL: real names still shorten ------------------------
        realNamesStillReadAsFirstNamesOnly:
            JSON.stringify(R.headerLabels) === JSON.stringify(['Marty', 'Zach', 'Manny', 'Lance']),
        realNamesAttrsUnchanged:
            JSON.stringify(R.headerAttrs) === JSON.stringify(['Marty', 'Zach', 'Manny', 'Lance']),

        // ---- FIX 3: HCP SAYS A HANDICAP -----------------------------------
        // A blank handicap reads "HCP 0" in the overlay, the same string the header
        // has always shown for it.
        overlayBlankHandicapReadsZero:
            JSON.stringify(P.overlayHcps) === JSON.stringify(['HCP 0', 'HCP 0', 'HCP 0', 'HCP 0']),
        overlayAgreesWithTheHeader:
            JSON.stringify(P.overlayHcps) === JSON.stringify(P.headerHcps),
        // and a real handicap is unchanged on both surfaces
        overlayRealHandicapReadsTwelve:
            JSON.stringify(H.overlayHcps) === JSON.stringify(['HCP 12', 'HCP 12', 'HCP 12', 'HCP 12']),
        headerRealHandicapReadsTwelve:
            JSON.stringify(H.headerHcps) === JSON.stringify(['HCP 12', 'HCP 12', 'HCP 12', 'HCP 12']),

        // ---- THE CONTROL: the money columns did not move ------------------
        // Hand figures, not a second opinion from the engine.
        grossUnchangedAtScratch: JSON.stringify(P.overlayGross) === JSON.stringify(['69', '70', '71', '72']),
        netUnchangedAtScratch: JSON.stringify(P.overlayNet) === JSON.stringify(['Net 69', 'Net 70', 'Net 71', 'Net 72']),
        grossUnchangedAtTwelve: JSON.stringify(H.overlayGross) === JSON.stringify(['69', '70', '71', '72']),
        netUnchangedAtTwelve: JSON.stringify(H.overlayNet) === JSON.stringify(['Net 57', 'Net 58', 'Net 59', 'Net 60']),
    };
    Object.keys(A).forEach(k => { if (!A[k]) problems.push(k + ': FAILED'); });

    const report = {
        handComputed: { gross: [72, 71, 70, 69], netAtBlank: [72, 71, 70, 69], netAtTwelve: [60, 59, 58, 57] },
        placeholders: { header: P.headerLabels, holeView: P.holeViewLabels, overlayHcp: P.overlayHcps },
        realNames: { header: R.headerLabels, overlayHcp: R.overlayHcps },
        // REPORTED ONLY. No assertion: this wave was told to measure the shared
        // first name and invent no rule for it.
        sharedFirstNameReportedNotAsserted: {
            stored: ['Marty Sharp', 'Marty Kane', 'Zach Hill', 'Lance Webb'],
            header: M.headerLabels, holeView: M.holeViewLabels,
            twoGolfersShareALabel: new Set(M.headerLabels).size !== M.headerLabels.length,
        },
        handicapTwelve: { header: H.headerHcps, overlay: H.overlayHcps },
        assertions: A, problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
