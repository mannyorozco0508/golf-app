#!/usr/bin/env node
// ============================================================================
// A ROUNDED FIGURE OVER A VALUE THAT CARRIES CENTS.
//
// settlement.html has said the honest thing for a long time - `'$' + (c / 100)
// .toFixed(c % 100 === 0 ? 0 : 2)` - cents when there are cents, none when there
// are not. index.html had three formatters that did not:
//
//   buildMoneyPoolBanner   $ = c => '$' + (c / 100).toFixed(0)
//   buildLiveNetFinish     $ = c => '$' + (c / 100).toFixed(0)
//   frMoney                c => '+$' + Math.abs(Math.round(c / 100))
//
// On a LEGACY round - one created before settlementMode existed, which settles
// in cents by design - a $9.98 skin read "$10" and a $3.33 Net Finish place read
// "$3". Nothing was miscalculated; the screen just did not say what the number
// was. That is the failure mode this check exists for, and it is the one that
// gets believed, because a rounded figure looks exactly like an exact one.
//
// HAND-COMPUTED, so the assertions carry paper figures rather than a second
// opinion from the engine:
//
//   LEGACY fixture: 4 golfers x $9.99 = 3996c pot.
//     Net Finish  1000c over three places at 33.333333/33.333333/33.333334
//                 -> 333 / 333 / 334c  ->  "$3.33"
//     Skins       remainder 2996c over 3 skins, telescoping cumulative floor:
//                 floor(2996*1/3)=998            -> 998c
//                 floor(2996*2/3)=1997, -998     -> 999c
//                 floor(2996*3/3)=2996, -1997    -> 999c
//                 -> "$9.98" and "$9.99"
//     Pool total  3996c -> "$39.96"
//
//   WHOLE-DOLLAR control: 4 golfers x $10 = 4000c, and every figure must print
//   with NO decimal point at all. "$40.00" is as wrong as "$40" was.
//
//   node tools/money-format-check.js
//
//   exit 0   the screen says what the number is
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const TOKEN = 'orgtok1';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const NAMES = ['Al Green', 'Bo Diaz', 'Cy Young', 'Di Marco'];

function roundOf(opts) {
    const o = opts || {};
    const players = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: '0',
        playingForMoney: true, team: i < 2 ? 'Team 1' : 'Team 2' }));
    const scores = {};
    players.forEach(p => CD.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4; }));
    // Three skins, and a three-way tie for the net lead so all three places pay.
    scores['p101_h1'] = 3;
    scores['p101_h2'] = 3;
    scores['p102_h7'] = 3;
    const r = {
        eventName: 'Money Format', courseName: 'Camas Meadows',
        activeCourseKey: 'swwa_camasmeadows', gameFormat: 'stroke', courseData: CD,
        players: players, scores: scores, organizerToken: TOKEN,
        kpConfirmed: { confirmed: true },
        moneyPool: { enabled: true, buyIn: o.buyIn,
            net: { amount: 10, places: o.places },
            skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
    };
    // ABSENT means legacy, and legacy settles in cents. The whole point of the
    // fixture pair is that one of them has this line and one does not.
    if (o.mode) r.settlementMode = o.mode;
    return r;
}

const PRE = `
(function () {
  window.print = function () {};
  window.__alerts = [];
  window.alert = function (m) { window.__alerts.push(String(m)); };
})();`;

// Drives the page's own controls only: the Action Centre toggle, the Next
// button, the Finish control, a review row, and a hole input.
const PROBE = `
(() => {
  const out = {};
  const byHandler = (sel, re) => Array.from(document.querySelectorAll(sel))
      .find(e => re.test(e.getAttribute('onclick') || ''));
  const txt = id => { const e = document.getElementById(id); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };

  // 1. THE LIVE MAIN POOL BANNER, and the live Net Finish inside it. Opened with
  //    the page's own toggle if it is not already showing.
  // The mount always carries the toggle itself, so "is it empty" is the wrong
  // question - press the toggle until the Main Pool line is actually on screen.
  for (let i = 0; i < 3 && !/main pool/i.test(txt('action-center-mount') || ''); i++) {
    const t = byHandler('button', /toggleActionCenter/);
    if (!t) break;
    t.click();
  }
  out.actionCentre = txt('action-center-mount');

  // 2. THE STAGED IMPACT PANEL. Walk to the last hole, open the review, open a
  //    golfer, correct a hole - all through the page's own controls.
  for (let i = 0; i < 25 && !document.querySelector('.finish-round-nav-btn'); i++) {
    const n = byHandler('button', /goToAdjacentHole\\(1\\)/);
    if (!n) break;
    n.click();
  }
  const fin = byHandler('button', /openFinishRoundModal/);
  out.reachedFinish = !!fin;
  if (fin) fin.click();
  const row = byHandler('div', /frOpenPlayer\\(101\\b/);
  if (row) row.click();
  const input = Array.from(document.querySelectorAll('#fr-detail-holes input'))[6]; // hole 7
  if (input) { input.value = '3'; input.dispatchEvent(new Event('change', { bubbles: true })); }
  out.impact = txt('fr-detail-impact');
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('money-format-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const problems = [];
    const db = { events: {
        // 4 x $9.99 = 3996c, net 1000c over three uneven places.
        LEGACY: roundOf({ buyIn: 9.99, places: [33.333333, 33.333333, 33.333334] }),
        // 4 x $10 = 4000c, and the same three places - every figure whole.
        WHOLE: roundOf({ buyIn: 10, places: [33.333333, 33.333333, 33.333334],
                         mode: 'whole-dollar' }),
    } };

    const read = async (code) => {
        const r = await arriveCold({ url: fileUrl('index.html', 'game=' + code + '&organizer=' + TOKEN),
            db: db, expression: PROBE, preScript: PRE, settleMs: 5400 });
        if (!r.ok) bail(code + ': ' + r.reason);
        try { return JSON.parse(r.value); } catch (e) { bail(code + ': unreadable probe output'); }
    };

    const legacy = await read('LEGACY');
    const whole = await read('WHOLE');

    // A RUN THAT RENDERED NOTHING MEASURED NOTHING.
    if (!legacy.actionCentre) bail('the live Action Centre rendered nothing, so the banner was not measured');
    if (!legacy.impact) bail('the staged impact panel rendered nothing, so it was not measured');
    if (!legacy.reachedFinish) bail('the review could not be opened');

    const L = String(legacy.actionCentre || ''), LI = String(legacy.impact || '');
    const W = String(whole.actionCentre || ''), WI = String(whole.impact || '');

    const A = {
        // ---- LEGACY: the cents are shown, and they are the hand figures -----
        legacyBannerShowsThePotToTheCent: /main pool · \$39\.96/i.test(L),
        legacyNetFinishShowsCents: /\$3\.33/.test(L) && /\$1\.67/.test(L),
        legacyImpactShowsSkinsToTheCent: /\$9\.98/.test(LI) || /\$9\.99/.test(LI),
        // and NOTHING on those surfaces is a bare rounded dollar where cents exist
        legacyBannerNoLongerSaysFortyFlat: !/main pool · \$40\b/i.test(L),

        // ---- WHOLE-DOLLAR: no cents anywhere, and no ".00" -----------------
        wholeBannerHasNoDecimalPoint: /main pool · \$40\b/i.test(W) && !/\$40\.00/.test(W),
        wholeSurfacesCarryNoCentsAtAll: !/\$\d+\.\d\d/.test(W),
        wholeImpactCarriesNoCents: !/\$\d+\.\d\d/.test(WI),

        // ---- THE CONTROL THAT MATTERS: Final money is netByName, already
        //      whole, and must never sprout cents on either round.
        legacyFinalMoneyHasNoCents: (() => {
            const m = /Final money([\s\S]*)$/.exec(LI);
            return !m || !/\$\d+\.\d\d/.test(m[1]);
        })(),
        wholeFinalMoneyHasNoCents: (() => {
            const m = /Final money([\s\S]*)$/.exec(WI);
            return !m || !/\$\d+\.\d\d/.test(m[1]);
        })(),

        // ---- ONE RULE, NOT FOUR -------------------------------------------
        // CODE, NOT COMMENTS. The first version of this scanned the raw file and
        // failed on the comment that DOCUMENTS the formatters it replaced - the
        // same substring-versus-membership trap that has caught two other guards
        // in this repo. Line comments are stripped first.
        indexHasNoRoundingMoneyFormatterLeft: (() => {
            const fs = require('fs'), path = require('path');
            const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
                .split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
            return !/\(c \/ 100\)\.toFixed\(0\)/.test(src)
                && !/Math\.round\(c \/ 100\)/.test(src);
        })(),
    };
    Object.keys(A).forEach(k => { if (!A[k]) problems.push(k + ': FAILED'); });

    const report = {
        handComputed: {
            legacy: { potCents: 3996, netPlaceCents: [333, 333, '334 split by the two tied for third = 167 each'],
                      skinsCents: [998, 999, 999],
                      reads: ['$39.96 pot', '$3.33 / $3.33 / $1.67 each', 'skins $9.98 and $9.99'] },
            whole: { potCents: 4000, reads: ['$40 with no decimal point'] },
        },
        legacy: { actionCentre: L.slice(0, 320), impact: LI.slice(0, 320) },
        whole: { actionCentre: W.slice(0, 320), impact: WI.slice(0, 320) },
        assertions: A, problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
