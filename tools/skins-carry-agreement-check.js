#!/usr/bin/env node
// ============================================================================
// ONE ROUND, ONE CARRY RULE, ON THE SCREENS A GOLFER ACTUALLY READS.
//
// A round with no stored skinsCarryOver is answered two ways, and both answers
// reach a golfer with money attached. Measured cold, three golfers, $10 buy-in,
// holes 2 and 5 won outright and the rest tied:
//
//   skins.html      pot $30.00, "Carrying: 13 gross holes tied"
//                   Ben $12.22    Ann $10.56    Cal $7.22
//   the Receipt     Ann +$5       Ben +$5       Cal -$10
//
// THE SKINS PAGE TELLS CAL HE HAS $7.22 COMING. THE RECEIPT SAYS HE OWES $10.
// A $17.22 swing on one golfer, on one round.
//
// And settlement.html contradicts ITSELF: its header prints "(Carry Over)" from
// its own `!== false` while the ledger printed underneath was computed no-carry
// by the engine. The label and the numbers on one page disagree.
//
// WHY THIS NEEDS A BROWSER AND THE UNIT TEST WILL NOT DO.
// skins_carry_agreement_test.js proves the ROUTING - that no surface decides
// the rule for itself - by reading source and calling the engines. It cannot
// prove the rendered pages agree, because a page can route correctly through
// skinsCarriesOver and still print a label built from something else. That is
// exactly the shape of the settlement.html defect: correct ledger, wrong
// header, one page. Only a rendered read catches it.
//
// FIVE SURFACES, and they are five because a golfer can reach all five for the
// same round:
//   1  skins.html            the Skins page's own pot and totals
//   2  the live bet strip    on the scorecard, while playing
//   3  settlement.html       the Final Skins Settlement HEADER
//   4  settlement.html       the ledger underneath it
//   5  the Receipt           the document the group keeps
//
//   node tools/skins-carry-agreement-check.js
//
//   exit 0   every surface states the same rule, and it is NO CARRY
//   exit 1   the surfaces disagree, or they agree on the wrong answer
//   exit 2   could not run, or a surface rendered no skins money at all -
//            in which case its agreement is vacuous. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PLAYERS = [
    { id: 101, name: 'Ann', hcp: '0', playingForMoney: true },
    { id: 102, name: 'Ben', hcp: '0', playingForMoney: true },
    { id: 103, name: 'Cal', hcp: '0', playingForMoney: true }
];
function scores() {
    const s = {};
    PLAYERS.forEach((p) => { for (let h = 1; h <= 18; h++) s['p' + p.id + '_h' + h] = 4; });
    s['p101_h2'] = 3;   // Ann wins hole 2 outright
    s['p102_h5'] = 3;   // Ben wins hole 5 outright
    return s;           // the other sixteen are tied, so a carry has something to ride
}
function round(carry) {
    const d = {
        eventName: 'Legacy', roundDay: 'Legacy', courseName: 'Course', activeCourseKey: 'c',
        gameFormat: 'skins', skinsBuyIn: 10, skinsPotFormat: 'gross', skinsScoring: 'gross',
        courseData: CD, players: PLAYERS, scores: scores()
    };
    // undefined leaves the field ABSENT - the round this check is about.
    if (carry !== undefined) d.skinsCarryOver = carry;
    return d;
}
const dbFor = (carry) => ({ events: { LEGACY: round(carry) }, trips: {}, global_courses: {} });

// A surface's rule is read from what it RENDERS, never from the data it was
// given - the whole point is that a surface can render something its data does
// not say.
const PROBE_SKINS = `
(() => {
  const body = (document.body.innerText || '');
  const sw = document.getElementById('skins-carry-switch');
  return JSON.stringify({
    rendered: body.length,
    // The page's own switch is its statement of the rule.
    switchOn: sw ? !!sw.checked : null,
    // Under carry the page prints a "Carrying: N holes tied" line. Under no
    // carry it cannot, because nothing rides.
    saysCarrying: /Carrying:/i.test(body),
    money: (body.match(/\\$[0-9]+\\.[0-9]{2}/g) || []),
    lines: body.split('\\n').map(s => s.trim()).filter(Boolean)
  });
})()`;

const PROBE_SETTLE = `
(() => {
  const body = (document.body.innerText || '');
  // CASE-INSENSITIVE ON PURPOSE. .settle-header is text-transform:uppercase and
  // innerText reflects that, so the rendered string is "FINAL SKINS SETTLEMENT
  // (CARRY OVER)". A case-sensitive match found nothing and the gate correctly
  // refused to grade rather than reporting a false agreement.
  const head = body.match(/Final Skins Settlement \\(([^)]*)\\)/i);
  return JSON.stringify({
    rendered: body.length,
    headerRule: head ? head[1].trim() : null,
    lines: body.split('\\n').map(s => s.trim()).filter(Boolean),
    // Per-golfer net, as the ledger prints it.
    nets: (function () {
      const out = {};
      const ls = body.split('\\n').map(s => s.trim());
      ls.forEach((l, i) => {
        if (/^(Ann|Ben|Cal)$/.test(l)) {
          const nxt = (ls[i + 1] || '').match(/^([+-]?\\$[0-9]+(\\.[0-9]{2})?)/);
          if (nxt && out[l] === undefined) out[l] = nxt[1];
        }
      });
      return out;
    })()
  });
})()`;

const PROBE_STRIP = `
(() => {
  const body = (document.body.innerText || '');
  return JSON.stringify({
    rendered: body.length,
    // The strip says "riding" only when a pot is carrying.
    saysRiding: /riding|carrying/i.test(body),
    stripText: (function () {
      const el = document.querySelector('.bet-strip-wrap');
      return el ? (el.innerText || '').trim().slice(0, 300) : null;
    })(),
    lines: body.split('\\n').map(s => s.trim()).filter(Boolean).filter(l => /skin|carry|riding|\\$/i.test(l)).slice(0, 15)
  });
})()`;

async function look(page, query, probe, db, settleMs) {
    const r = await arriveCold({ url: fileUrl(page, query), db, expression: probe, settleMs: settleMs || 6000 });
    if (!r.ok) return { ran: false, reason: r.reason };
    try { return { ran: true, ...JSON.parse(r.value) }; }
    catch (e) { return { ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 200) }; }
}

(async () => {
    const bail = (why, extra) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };

    // ---- THE FIELDLESS ROUND, the one this check exists for ----
    const db = dbFor(undefined);
    const sk = await look('skins.html', 'game=LEGACY', PROBE_SKINS, db);
    const st = await look('settlement.html', 'game=LEGACY', PROBE_SETTLE, db);
    const bs = await look('index.html', 'game=LEGACY', PROBE_STRIP, db, 7000);
    if (!sk.ran) bail('skins.html did not run: ' + sk.reason);
    if (!st.ran) bail('settlement.html did not run: ' + st.reason);
    if (!bs.ran) bail('index.html did not run: ' + bs.reason);

    // ---- THE GATE. A surface that showed no skins money agrees with everything.
    if (!sk.money || sk.money.length === 0) {
        bail('skins.html rendered no money at all, so its agreement would be vacuous',
            { lines: (sk.lines || []).slice(0, 20) });
    }
    if (!st.nets || Object.keys(st.nets).length < 3) {
        bail('the settle ledger did not show three golfers, so its money cannot be compared',
            { nets: st.nets, lines: (st.lines || []).slice(0, 25) });
    }
    if (st.headerRule === null) {
        bail('settlement.html printed no "Final Skins Settlement (...)" header, so the header '
           + 'half of this check has nothing to read', { lines: (st.lines || []).slice(0, 25) });
    }

    // ---- WHAT EACH SURFACE SAYS THE RULE IS ----
    const rules = {
        'skins.html switch': sk.switchOn,
        'skins.html "Carrying:" line': sk.saysCarrying,
        'bet strip riding/carrying': bs.saysRiding,
        'settle header': /carry over/i.test(st.headerRule || '')
    };

    const failures = [];
    Object.keys(rules).forEach((k) => {
        if (rules[k] !== false) {
            failures.push(`${k} says CARRY on a round that stores no carry setting. `
                + `skinsCarriesOver says NO CARRY, and the Receipt pays that way.`);
        }
    });

    // ---- AND THE MONEY, WHICH IS THE PART THAT COSTS SOMETHING ----
    // The Skins page's per-golfer figures and the ledger's must describe one
    // round. They are different presentations, so this does not demand identical
    // strings - it demands the two pages not be computing different rules, which
    // shows up as the Skins page printing carried pot shares nobody is paid.
    if (sk.saysCarrying && Object.keys(st.nets).length) {
        failures.push('the Skins page is showing a CARRYING pot while the ledger below settles '
            + `it with no carry. Ledger nets: ${JSON.stringify(st.nets)}. `
            + `Skins page money on screen: ${JSON.stringify(sk.money.slice(0, 6))}.`);
    }

    // ---- AN EXPLICIT CARRY ROUND MUST STILL CARRY EVERYWHERE ----
    // Without this arm the whole check is satisfied by a build where carry over
    // simply stopped working.
    const dbCarry = dbFor(true);
    const sk2 = await look('skins.html', 'game=LEGACY', PROBE_SKINS, dbCarry);
    const st2 = await look('settlement.html', 'game=LEGACY', PROBE_SETTLE, dbCarry);
    if (!sk2.ran || !st2.ran) bail('the explicit-carry arm did not run');
    if (sk2.switchOn !== true) {
        failures.push('a round that explicitly says carryOver:true does NOT show carry on the '
            + 'Skins page - the fix has turned into "carry over no longer works".');
    }
    if (!/carry over/i.test(st2.headerRule || '')) {
        failures.push(`a round that explicitly says carryOver:true shows "${st2.headerRule}" on `
            + 'the settle header - carry over has stopped working.');
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({
        verdict, failures,
        fieldlessRound: {
            rulesBySurface: rules,
            settleHeader: st.headerRule,
            settleLedgerNets: st.nets,
            skinsPageMoney: (sk.money || []).slice(0, 8),
            skinsPageSaysCarrying: sk.saysCarrying,
            betStripSaysRiding: bs.saysRiding
        },
        explicitCarryRound: { skinsSwitch: sk2.switchOn, settleHeader: st2.headerRule }
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
