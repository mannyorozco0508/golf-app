#!/usr/bin/env node
// ============================================================================
// THE RECEIPT DENIES THE BETS IT THEN PRINTS.
//
// settlement.html renders "No money bets were set up for this round." whenever
// the format is stroke and buildSideGamesHtml() comes back empty. It never asks
// whether there is a MAIN POOL. So the ordinary Main Pool round - a pot, no side
// matches - puts that denial in the Final Ledger card, which is the FIRST thing
// under the header, and then prints $480 of pool money four words below it. On
// screen and in the exported receipt both.
//
// Nothing is broken arithmetically. Every figure is right and every figure
// exports. It is the sentence that is false, and a sentence in a document people
// settle cash from is behaviour.
//
// THE RULE THIS PROVES: the denial appears if and only if there is no money.
// Not "no side games" - no money. A Main Pool is money.
//
// ARRIVES COLD on settlement.html with a round in the database, touches nothing,
// and presses only the page's own export button. Three rounds:
//
//   POOL   a Main Pool, no side games        -> the denial must be GONE
//   BARE   no pool, no side games, no money  -> the denial must REMAIN
//   SIDE   a side game, no pool              -> unchanged, ledger and no denial
//
//   node tools/receipt-denial-check.js
//
//   exit 0   the receipt only denies bets when there are none
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const DENIAL = /No money bets were set up for this round/i;

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const NAMES = ['Marty Sharp', 'Manny Orozco', 'Lance Webb', 'Zach Hill',
               'Mike Dunne', 'Dave Roth', 'Sam Ellis', 'Ray Cole',
               'Tom Vance', 'Neil Ward', 'Kirk Ames', 'Joe Pike'];

// Writer-shaped: playingForMoney, real scores, a confirmed KP, whole-dollar
// settlement - the same shape receipt-export-check builds, so a difference here
// is a difference in the app rather than in the fixture.
function roundOf(opts) {
    const o = opts || {};
    const players = NAMES.map((n, i) => ({ id: 101 + i, name: n,
        hcp: String((i % 4) * 3), playingForMoney: true }));
    const scores = {};
    players.forEach(p => CD.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4; }));
    [1, 2, 3, 4, 5].forEach((h, i) => { scores['p' + (101 + i) + '_h' + h] = 3; });
    const r = { eventName: 'Monday Main Pool', roundDay: 'Monday', courseName: 'Camas Meadows',
        activeCourseKey: 'swwa_camasmeadows', gameFormat: 'stroke', courseData: CD,
        players: players, scores: scores, settlementMode: 'whole-dollar',
        kpWinners: { h3: '101', h7: '105', h12: '109', h16: '102' },
        kpConfirmed: { confirmed: true } };
    if (o.pool) {
        r.moneyPool = { enabled: true, buyIn: 40,
            kp: { amount: 100, holes: [3, 7, 12, 16] },
            net: { amount: 70, places: [100] },
            skins: { mode: 'remainder', scoring: 'net', carryOver: false } };
    }
    if (o.sideGame) r.birdieGameEnabled = true;
    return r;
}

const PROBE = `
(() => {
  const out = {};
  const money = t => (String(t || '').match(/\\$[0-9][0-9,]*(?:\\.[0-9][0-9])?/g) || []);
  const txt = id => { const e = document.getElementById(id); return e ? (e.innerText || '') : ''; };

  // innerText, never textContent: this page keeps its whole application in an
  // inline <script>, and textContent would match the denial in the SOURCE - on a
  // page that never rendered it. Both arms of an earlier check were wrong that way.
  const screenNode = document.querySelector('.container') || document.body;
  const screen = screenNode ? screenNode.innerText : '';
  out.screenMoney = money(screen);
  out.screenSaysDenial = /No money bets were set up for this round/i.test(screen);
  out.settleContent = txt('settle-content').replace(/\\s+/g, ' ').trim();
  out.poolSection = txt('money-pool-section').replace(/\\s+/g, ' ').trim();
  out.combined = txt('combined-settlement-summary').replace(/\\s+/g, ' ').trim();

  const btns = Array.from(document.querySelectorAll('button'))
      .filter(b => /printReceipt/.test(b.getAttribute('onclick') || ''));
  out.exportButtons = btns.length;
  out.exportOnScreen = btns.filter(b => b.getClientRects().length > 0).length;

  let captured = null;
  const real = window.RattleExport;
  window.RattleExport = { exportOrPrint: o => { captured = o; return true; } };
  if (btns[0]) btns[0].click();
  window.RattleExport = real;

  out.exportCalled = !!captured;
  const roots = captured ? (captured.roots || []) : [];
  out.rootIds = roots.map(r => r && r.id);
  const et = roots.map(r => (r && r.innerText) || '').join('\\n');
  out.exportMoney = money(et);
  out.exportSaysDenial = /No money bets were set up for this round/i.test(et);
  out.exportHead = et.replace(/\\s+/g, ' ').trim().slice(0, 260);
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('receipt-denial-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}
const tally = arr => arr.reduce((m, v) => (m[v] = (m[v] || 0) + 1, m), {});
const missingFrom = (a, b) => {
    const t = tally(b);
    return a.filter(v => { if (t[v]) { t[v]--; return false; } return true; });
};

// The WebKit runner builds the SAME fixtures from the SAME factory and reads the
// SAME probe, rather than retyping either - so the two engines answer one question.
function buildDb() {
    return { events: {
        POOL: roundOf({ pool: true }),
        BARE: roundOf({}),
        SIDE: roundOf({ sideGame: true }),
    } };
}

module.exports = { buildDb, roundOf, PROBE, DENIAL };

if (require.main !== module) return;

(async () => {
    const problems = [];
    const report = { cases: {} };

    const db = buildDb();

    const read = async (code) => {
        const r = await arriveCold({ url: fileUrl('settlement.html', 'game=' + code),
            db: db, expression: PROBE, settleMs: 5200 });
        if (!r.ok) bail(code + ': ' + r.reason);
        try { return JSON.parse(r.value); } catch (e) { bail(code + ': unreadable probe output'); }
    };

    const pool = await read('POOL');
    const bare = await read('BARE');
    const side = await read('SIDE');

    // A RUN THAT RENDERED NO MONEY MEASURED NOTHING. The first version of this
    // reproduction seeded the fixture under db.games instead of db.events; the
    // page found no round, rendered the denial with zero money, and looked
    // exactly like the defect. Without this guard that reads as a pass.
    if (pool.screenMoney.length === 0) {
        bail('the POOL round rendered no money at all, so nothing about it was measured');
    }
    if (!pool.exportCalled) bail('the POOL round never reached the exporter');

    const A = {
        // TEST A - the denial is gone where it is false
        poolRoundDoesNotDenyOnScreen: pool.screenSaysDenial === false,
        poolRoundDoesNotDenyInTheExport: pool.exportSaysDenial === false,

        // ...and the Main Pool is still there in full, every figure intact
        poolSectionStillRenders: /Main Pool/i.test(pool.poolSection),
        poolFiguresIntact: ['$480', '$100', '$70', '$310']
            .every(v => pool.poolSection.indexOf(v) !== -1),
        poolExportStillCarriesTheMoney: ['$480', '$100', '$70', '$310']
            .every(v => pool.exportMoney.indexOf(v) !== -1),

        // CONTROL - the money on screen is the money in the export, both ways
        noFigureLostFromTheExport: missingFrom(pool.screenMoney, pool.exportMoney).length === 0,
        noFigureInventedInTheExport: missingFrom(pool.exportMoney, pool.screenMoney).length === 0,

        // CONTROL - a round with genuinely no money must STILL say so
        bareRoundStillDeniesOnScreen: bare.screenSaysDenial === true,
        bareRoundHasNoMoney: bare.screenMoney.length === 0,

        // CONTROL - a side-game round is untouched by any of this
        sideGameRoundDoesNotDeny: side.screenSaysDenial === false,
        sideGameRoundRendersALedger: side.settleContent.length > 0,
        sideGameRoundExports: side.exportCalled === true,
    };
    Object.keys(A).forEach(k => { if (!A[k]) problems.push(k + ': FAILED'); });

    report.cases = {
        POOL: { screenSaysDenial: pool.screenSaysDenial, exportSaysDenial: pool.exportSaysDenial,
                settleContent: pool.settleContent.slice(0, 120),
                poolSection: pool.poolSection.slice(0, 120),
                screenFigures: pool.screenMoney.length, exportFigures: pool.exportMoney.length,
                rootIds: pool.rootIds, exportButtons: pool.exportButtons,
                exportHead: pool.exportHead },
        BARE: { screenSaysDenial: bare.screenSaysDenial, settleContent: bare.settleContent.slice(0, 120),
                screenFigures: bare.screenMoney.length,
                // TEST B - reported, never asserted. The no-bets branch renders its
                // card with no export button, so a bare stroke round cannot export
                // its scorecard. That is out of scope for this wave; the number is
                // recorded so a change to it is visible rather than discovered.
                exportButtons: bare.exportButtons, exportCalled: bare.exportCalled },
        SIDE: { screenSaysDenial: side.screenSaysDenial, settleContent: side.settleContent.slice(0, 120),
                screenFigures: side.screenMoney.length, exportButtons: side.exportButtons },
    };
    report.assertions = A;
    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
