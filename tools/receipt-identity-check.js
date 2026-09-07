#!/usr/bin/env node
// ============================================================================
// DOES ONE ROUND'S RECEIPT MERGE TWO GOLFERS WITH ONE NAME?
//
// ARRIVES COLD on both surfaces that show a round's money - settlement.html, the
// Receipt, and index.html, the Finish Round money panel - with a finished round in
// the database. Each page loads its own scripts, runs its own init, registers its
// own listener and renders whatever it renders. NOTHING IS INVOKED FROM OUTSIDE.
//
// WHY. computeCombinedNetTotals keys every balance on the golfer's NAME, so two
// men called Mike Dunne are ONE row: four golfers in, three out, and
// "Lance Webb -> Mike Dunne $10" names a man who could be either of them. The
// arithmetic is right, the ledger is zero-sum and the receipt looks finished -
// which is exactly why nobody would catch it at a table with cash on it.
//
// THIS IS THE RECEIPT MONEY CHANGES HANDS ON. The trip total is a summary of
// money already paid; this is the number the group settles from on the day.
//
// BOTH SURFACES MUST AGREE. If only one refused, a golfer could read a merged
// total on the screen the other page declined to print.
//
//   node tools/receipt-identity-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON says which surface broke
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

// Golfers need a team and playingForMoney before any money moves at all; without
// them a round settles to nothing, which reads exactly like a broken page.
const teamed = list => list.map((p, i) => Object.assign({}, p, {
    team: i < 2 ? 'Team 1' : 'Team 2', playingForMoney: true }));
const CLEAN = teamed([
    { id: 101, name: 'Marty Sharp', hcp: '0' }, { id: 102, name: 'Manny Orozco', hcp: '0' },
    { id: 103, name: 'Lance Webb', hcp: '0' }, { id: 104, name: 'Zach Hill', hcp: '0' }]);
const MIKES = teamed([
    { id: 101, name: 'Mike Dunne', hcp: '0' }, { id: 102, name: 'Mike Dunne', hcp: '0' },
    { id: 103, name: 'Lance Webb', hcp: '0' }, { id: 104, name: 'Zach Hill', hcp: '0' }]);

function roundOf(players) {
    const scores = {};
    players.forEach(p => CD.forEach(h => {
        scores['p' + p.id + '_h' + h.hole] = p.team === 'Team 1' ? 4 : 5; }));
    return { eventName: 'Caledonia', gameFormat: 'match', matchStake: 20, players,
             courseData: CD, scores, settlementMode: 'whole-dollar' };
}
const dbFor = players => ({ events: { RCPT: roundOf(players) } });

// Reads what is RENDERED, not what is in the file.
//
// The first version of this probe used document.body.textContent, which includes
// the text of every inline <script> in the body - so it matched the refusal copy
// in the page's own SOURCE and reported that a clean round had been refused. Both
// arms were false. innerText is the rendered text: no script source, no hidden
// panels.
//
// AND THE MONEY PANEL HAS TO BE OPENED. On index.html it lives inside the Finish
// Round modal, which is closed on arrival - so this presses the page's own button
// rather than pretending the panel was on screen. A surface that cannot be opened
// is reported, never silently passed.
const PROBE = `
(() => {
  const out = { opened: null, holesAdvanced: 0 };
  const find = re => Array.from(document.querySelectorAll('button'))
      .filter(b => re.test(b.getAttribute('onclick') || ''))[0];

  // WALK TO THE LAST HOLE, the way a golfer does. The Finish Round button only
  // exists on 18 - a cold arrival lands on hole 1 - so this presses the page's own
  // Next button until it appears. Tapping Next is what the group does all round;
  // nothing here calls a page function or jumps state.
  let finish = find(/openFinishRoundModal\\(/);
  for (let i = 0; i < 25 && !finish; i++) {
    const next = find(/goToAdjacentHole\\(1\\)/);
    if (!next) break;
    next.click();
    out.holesAdvanced++;
    finish = find(/openFinishRoundModal\\(/);
  }
  if (finish) { out.opened = true; finish.click(); }
  else if (document.getElementById('fr-final-money')) { out.opened = false; }

  const shown = el => (el && el.innerText ? el.innerText : '').replace(/\\s+/g, ' ').trim();
  const money = shown(document.getElementById('combined-settlement-summary'))
      + ' ' + shown(document.getElementById('fr-final-money'))
      + ' ' + shown(document.getElementById('fr-who-pays-who'));
  out.money = money.trim();
  out.refused = /Money Not Totalled|added up by name|renamed in Setup/i.test(money);
  out.namesTheGolfer = /Mike Dunne/.test(money);
  // A merged balance printed anywhere in the money area is the failure.
  out.moneyRows = (money.match(/Mike Dunne[^A-Za-z]{0,14}[+-]?\\$\\d/g) || []);
  out.paysWho = (money.match(/\\u2192 Mike Dunne/g) || []).length;
  out.hasAnyMoney = /\\$\\d/.test(money);
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('receipt-identity-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// index.html needs the SCOREKEEPER's arrival, not a spectator's. Without &group=
// the page is read-only - "ask whoever set up the round for your group's link" -
// and the Finish Round button that opens the money panel is not rendered at all.
// That is the URL admin.html's scorecardUrlFor() actually builds for each group.
const SURFACES = [
    { name: 'settlement.html (the Receipt)', page: 'settlement.html', query: 'game=RCPT' },
    { name: 'index.html (Finish Round money)', page: 'index.html', query: 'game=RCPT&group=1' }
];

(async () => {
    const problems = [];
    const report = {};

    for (const s of SURFACES) {
        const dirty = await arriveCold({ url: fileUrl(s.page, s.query),
            db: dbFor(MIKES), expression: PROBE, settleMs: 4000 });
        if (!dirty.ok) bail(s.page + ': ' + dirty.reason);
        const clean = await arriveCold({ url: fileUrl(s.page, s.query),
            db: dbFor(CLEAN), expression: PROBE, settleMs: 4000 });
        if (!clean.ok) bail(s.page + ': ' + clean.reason);
        const d = JSON.parse(dirty.value), c = JSON.parse(clean.value);
        report[s.page] = { duplicates: d, clean: c };

        // A surface nobody can open proves nothing about it either way.
        if (d.opened === false) {
            problems.push(s.name + ': the money panel exists but no button on the page '
                + 'opens it - this surface was NOT checked');
            continue;
        }
        // A clean round must actually SHOW money here, or "not refused" is vacuous.
        if (!c.hasAnyMoney) {
            problems.push(s.name + ': a finished round showed no money at all, so the '
                + 'refusal below proves nothing. Rendered: ' + JSON.stringify(c.money.slice(0, 160)));
        }

        if (!d.refused) {
            problems.push(s.name + ': TWO GOLFERS CALLED "Mike Dunne" WERE MERGED and the '
                + 'page said nothing - somebody pays the other man\'s debts. Screen read: '
                + JSON.stringify(d.money.slice(0, 160)));
        }
        if (!d.namesTheGolfer) {
            problems.push(s.name + ': it refused without naming the golfer to rename');
        }
        // REFUSING MEANS NO NUMBER. A warning printed above a merged balance is the
        // failure being fixed, not the fix.
        if (d.moneyRows.length > 0) {
            problems.push(s.name + ': a merged balance is still on screen: '
                + JSON.stringify(d.moneyRows));
        }
        if (d.paysWho > 0) {
            problems.push(s.name + ': ' + d.paysWho + ' transaction(s) still tell somebody '
                + 'to pay a name that could be either man');
        }
        // And a good round must not be refused.
        if (c.refused) {
            problems.push(s.name + ': a round with four distinct names was refused');
        }
    }

    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
