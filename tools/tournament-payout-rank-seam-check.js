#!/usr/bin/env node
// ============================================================================
// THE PAYOUT RANK SEAM: is the team the leaderboard shows FIRST the team the
// page hands spotAmounts[0]?
//
// Every payout test in the repo - payouts_parity_test.js, prize_payouts_test.js
// - feeds allocatePlacePayouts hand-built rows with ranks 1, 2, 3 and proves
// the allocator pays [300, 200, 100] to them. None of them asks whether the
// PAGE gives the allocator those rows in that order. tournament.html builds
// its board from resolveLeaderboardView(...).rows and its payouts from
// cachedLeaderboardRows, set on the same line (:1187) from the same view but
// WITHOUT the flight filter; the allocator then groups on each row's `rank`
// (payouts.js:78-81). A wrong rank on the leading rows, a reversed sort, or a
// view whose ranks are not the board's would pay the wrong team and every
// unit test would stay green. That seam is what this measures, in a browser,
// cold: the board as rendered against the payout rows as rendered.
//
// A DEVICE CHECK MAY NOT CALL A FUNCTION THE PAGE DEFINES. Everything here is
// what an organizer does: open the page on a code, tap the Leaderboard tab,
// type three prize amounts into the three boxes. The record's team NUMBERS
// are deliberately not in finishing order, so insertion order and board
// order can be told apart.
//
//   node tools/tournament-payout-rank-seam-check.js
//
//   exit 0   board position 1/2/3 is paid 300/200/100, positions 4 and 5
//            are paid 0, the unscored team is on no payout row, 600 in all
//   exit 1   a place is paid the wrong amount, or the wrong team is paid
//   exit 2   could not run, no board, or no payout rows. NOTHING PROVEN.
//
// NEGATIVE CONTROLS run this file against a temp copy of the page
// (TPRS_PAGE=<absolute path>, script srcs rewritten to the repo); the real
// file is never edited. See the report for the two controls and what each
// turned red.
// ============================================================================

const path = require('path');
const { arriveCold, fileUrl, REPO_ROOT } = require('./lib/cold-arrival.js');

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];   // 72
const course = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));

// Six teams. Team NUMBER order is not finishing order on purpose:
//   team3 60 (1st), team4 64 (2nd), team1 68 (3rd), team5 72 (4th),
//   team2 76 (5th), team6 no scores.
const FINISH = [
    { num: 3, name: 'Owls',    total: 60 },
    { num: 4, name: 'Falcons', total: 64 },
    { num: 1, name: 'Eagles',  total: 68 },
    { num: 5, name: 'Ospreys', total: 72 },
    { num: 2, name: 'Hawks',   total: 76 }
];
const UNSCORED = { num: 6, name: 'Kites' };
const teams = {};
const scores = {};
FINISH.concat([UNSCORED]).forEach(t => {
    teams['team' + t.num] = { num: t.num, name: t.name, handicap: 0, startingHole: '',
        players: ['A' + t.num, 'B' + t.num, 'C' + t.num, 'D' + t.num] };
});
// Spread each total over 18 holes: base = floor(total/18), remainder on the
// first holes. Scramble format reads scores[`team${num}_h${hole}`].
FINISH.forEach(t => {
    const base = Math.floor(t.total / 18), extra = t.total - base * 18;
    for (let h = 1; h <= 18; h++) scores['team' + t.num + '_h' + h] = base + (h <= extra ? 1 : 0);
});
const CODE = 'SEAM01';
const db = {
    tournaments: {
        [CODE]: {
            name: 'Seam Scramble', format: 'scramble', courseName: 'Tidewater',
            activeCourseKey: 'tidewater', courseData: course, entryFee: '100',   // 100 x 6 = 600
            teams, scores, createdAt: 1, courseIndexSynthetic: false
        }
    },
    events: {}, trips: {}, global_courses: {}
};
const AMOUNTS = [300, 200, 100];

// Tap the Leaderboard tab by its label, type the three amounts as a user
// would (value + input event - the same thing a keyboard produces), then read
// the board and the payout rows back from the DOM.
const PROBE = `
(() => {
  const tab = Array.prototype.slice.call(document.querySelectorAll('.top-nav-item'))
    .find(x => /Leaderboard/.test(x.textContent || ''));
  if (!tab) return JSON.stringify({ tab: false });
  tab.click();
  const spots = Array.prototype.slice.call(document.querySelectorAll('#payout-spot-amounts input'));
  const amounts = ${JSON.stringify(AMOUNTS)};
  spots.forEach((el, i) => {
    if (i < amounts.length) { el.value = String(amounts[i]); el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  const rows = Array.prototype.slice.call(document.querySelectorAll('#leaderboard-list .lb-row'))
    .map(r => ({
      pos: ((r.querySelector('.lb-pos') || {}).innerText || '').trim(),
      team: ((r.querySelector('.lb-team') || {}).innerText || '').replace(/\\(.*?\\)/g, '').trim(),
      toPar: ((r.querySelector('.lb-score') || {}).innerText || '').trim()
    }))
    // The header row's innerText is "POS": the CSS uppercases it, and innerText
    // returns the rendered text. The first run of this probe compared against
    // 'Pos', kept the header as "board position 1", and reported the page wrong
    // when the harness was.
    .filter(r => !/^pos$/i.test(r.pos));
  const pay = Array.prototype.slice.call(document.querySelectorAll('#payout-results .ledger-row'))
    .map(r => {
      const spans = r.querySelectorAll('span');
      const left = (spans[0] && spans[0].innerText || '').trim();
      const right = (spans[1] && spans[1].innerText || '').trim();
      const m = /^(\\d+)(?:st|nd|rd|th)\\s+\\u2014\\s+(.+)$/.exec(left);
      return { place: m ? Number(m[1]) : null, team: m ? m[2].trim() : left, amount: parseFloat(right.replace(/[^0-9.\\-]/g, '')) };
    });
  return JSON.stringify({
    tab: true, spotCount: spots.length, spotValues: spots.map(s => s.value),
    board: rows, payouts: pay,
    resultsText: (document.getElementById('payout-results') || {}).innerText || ''
  });
})()`;

(async () => {
    const bail = (why, extra) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };
    const pageUrl = process.env.TPRS_PAGE
        ? 'file://' + path.resolve(process.env.TPRS_PAGE) + '?tourney=' + CODE
        : fileUrl('tournament.html', 'tourney=' + CODE);

    const r = await arriveCold({ url: pageUrl, db, expression: PROBE, settleMs: 7000 });
    if (!r.ok) bail('the page did not run: ' + r.reason);
    let m; try { m = JSON.parse(r.value); } catch (e) { bail('non-JSON from the page', r.value); }
    if (!m.tab) bail('no Leaderboard tab to tap');
    if (m.spotCount !== 3) bail('expected the three default paid spots, found ' + m.spotCount, m);
    if (m.board.length === 0) bail('the leaderboard rendered no rows - nothing to hold the payouts against', m);
    if (m.payouts.length === 0) bail('no payout rows rendered - nothing to measure', m);

    const failures = [];
    const scoredBoard = m.board.filter(b => b.toPar !== '—' && b.toPar !== '-');
    // POSITIVE CONTROL: the board is the finishing order the record implies,
    // or every assertion below is about the wrong board.
    const expectedOrder = FINISH.map(t => t.name);
    if (JSON.stringify(scoredBoard.map(b => b.team)) !== JSON.stringify(expectedOrder)) {
        failures.push('the rendered board is not the finishing order the scores imply: '
            + JSON.stringify(scoredBoard.map(b => b.team)) + ' vs ' + JSON.stringify(expectedOrder));
    }
    const paid = (team) => { const p = m.payouts.find(x => x.team === team); return p ? p.amount : null; };
    // The seam: position N on the BOARD is paid AMOUNTS[N-1].
    for (let i = 0; i < 3; i++) {
        const team = scoredBoard[i] && scoredBoard[i].team;
        if (paid(team) !== AMOUNTS[i]) {
            failures.push(`board position ${i + 1} (${team}) is paid ${paid(team)}, expected ${AMOUNTS[i]}`);
        }
    }
    for (let i = 3; i < 5; i++) {
        const team = scoredBoard[i] && scoredBoard[i].team;
        if (paid(team) !== 0) failures.push(`board position ${i + 1} (${team}) is paid ${paid(team)}, expected 0`);
    }
    if (m.payouts.some(p => p.team === UNSCORED.name)) {
        failures.push('the unscored team ' + UNSCORED.name + ' appears on a payout row');
    }
    const total = m.payouts.reduce((s, p) => s + (p.amount || 0), 0);
    if (Math.abs(total - 600) > 0.005) failures.push('total distributed is ' + total + ', expected 600');
    // The payout rows' own place labels must agree with the board too - a row
    // that says "1st" beside the wrong team is the symptom in its plainest form.
    m.payouts.forEach(p => {
        const boardIdx = scoredBoard.findIndex(b => b.team === p.team);
        if (p.place !== null && boardIdx >= 0 && p.place !== boardIdx + 1) {
            failures.push(`payout row labels ${p.team} "${p.place}" but the board shows it at position ${boardIdx + 1}`);
        }
    });

    console.log(JSON.stringify({
        verdict: failures.length ? 'FAIL' : 'PASS', failures,
        measured: {
            spotValuesTyped: m.spotValues,
            boardTopToBottom: m.board.map(b => `${b.pos} ${b.team} ${b.toPar}`),
            payoutRows: m.payouts.map(p => `${p.place} ${p.team} $${p.amount}`),
            totalDistributed: total
        },
        notWhatAUserDoesExactly: 'amounts are set with value + input event rather than keystrokes'
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
