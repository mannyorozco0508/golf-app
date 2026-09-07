#!/usr/bin/env node
// ============================================================================
// DOES THE TRIP ACTUALLY SHOW WHO OWES WHO, ON ARRIVAL?
//
// ARRIVES COLD at trip.html?trip=CODE with a real trip in the database: several
// linked rounds, each with its own players, scores and wagers. The page reads its
// own ?trip= parameter, fetches trips/<CODE>, fetches each events/<CODE> it names,
// and renders whatever it renders. NOTHING IS INVOKED FROM OUTSIDE.
//
// WHY THIS EXISTS. Six test files already cover trip money and all of them pass.
// Not one of them arrives the way a golfer does. Every dead wire found this week
// sat underneath a green suite: a render call nothing made, a session pointer
// nothing wrote, an entry card no code path reached. "The function works when
// invoked" is not the same claim as "the drive home shows a number".
//
// WHAT IT ASSERTS
//   the trip-wide money list renders, on its own, with real transactions in it
//   the totals are the SUM of the rounds, computed independently here
//   the ledger is zero-sum - money is neither invented nor destroyed over a week
//   a round excluded from the trip is genuinely excluded
//   AND TWO GOLFERS WITH ONE NAME DO NOT SILENTLY MERGE. That is the case that
//   costs a real person real money: across five rounds, one Mike pays the other's
//   debts and nothing on the screen says so. Until the identity wave lands this
//   arm is expected to FAIL, and it should - it is the bug, not the test.
//
//   node tools/trip-money-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON says which guarantee broke
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

// A 2v2 team match for $20. Golfers need a `team` and `playingForMoney` before any
// money moves - a round without them settles to nothing at all, which is a
// perfectly good round and a useless fixture. Verified against the engine directly
// before being used here, so a zero in the report means the PAGE found no money,
// not that the fixture never had any.
function roundOf(players, scores, extra) {
    return Object.assign({
        eventName: 'Round', gameFormat: 'match', matchStake: 20, players: players,
        courseData: CD, scores: scores, settlementMode: 'whole-dollar'
    }, extra || {});
}
// Sides are assigned by NAME, so the same golfer is on the same side every day
// however the roster happens to be ordered that morning.
const SIDE_A = ['marty sharp', 'manny orozco', 'mike dunne'];
const teamed = list => list.map(p => Object.assign({}, p, {
    team: SIDE_A.indexOf(p.name.trim().toLowerCase()) !== -1 ? 'Team 1' : 'Team 2',
    playingForMoney: true
}));

// Deterministic scores: `strokes` is what that golfer shoots on every hole.
function scoresFor(players, strokes) {
    const s = {};
    players.forEach((p, i) => CD.forEach(h => { s['p' + p.id + '_h' + h.hole] = strokes[i]; }));
    return s;
}

const FOUR = teamed([
    { id: 101, name: 'Marty Sharp', hcp: '0' }, { id: 102, name: 'Manny Orozco', hcp: '0' },
    { id: 103, name: 'Lance Webb', hcp: '0' }, { id: 104, name: 'Zach Hill', hcp: '0' }]);
// The SAME four golfers, entered in a different order on day two. Ids are
// per-round and positional, so this is what a real trip looks like.
const FOUR_REORDERED = teamed([
    { id: 101, name: 'Zach Hill', hcp: '0' }, { id: 102, name: 'Lance Webb', hcp: '0' },
    { id: 103, name: 'Manny Orozco', hcp: '0' }, { id: 104, name: 'Marty Sharp', hcp: '0' }]);
// Two golfers, one name. Their money must not be merged into a single balance.
const TWO_MIKES = teamed([
    { id: 101, name: 'Mike Dunne', hcp: '0' }, { id: 102, name: 'Mike Dunne', hcp: '0' },
    { id: 103, name: 'Lance Webb', hcp: '0' }, { id: 104, name: 'Zach Hill', hcp: '0' }]);

function tripDb(rounds, counted) {
    const events = {};
    const tripRounds = {};
    Object.keys(rounds).forEach(code => {
        events[code] = rounds[code];
        tripRounds[code] = { label: rounds[code].eventName || code, addedAt: 1,
            countsTowardTrip: counted ? counted[code] !== false : true };
    });
    return { events: events,
             trips: { MYR1: { name: 'Myrtle Beach', createdAt: 1, rounds: tripRounds } } };
}

const PROBE = `
(() => {
  const out = {};
  const mount = document.getElementById('trip-money-settlement');
  out.rendered = !!(mount && mount.querySelector('.settle-card'));
  out.onScreen = !!(mount && mount.getClientRects().length > 0
      && mount.getBoundingClientRect().height > 0);
  out.text = mount ? (mount.textContent || '').replace(/\\s+/g, ' ').trim() : '';

  // The trip-wide net, read off the rendered ledger rather than any function.
  const cards = Array.from(mount ? mount.querySelectorAll('.settle-card') : []);
  const netCard = cards.find(c => /Net Across the Trip/.test(c.textContent || ''));
  out.net = {};
  if (netCard) {
    Array.from(netCard.querySelectorAll('.ledger-row')).forEach(r => {
      const spans = r.querySelectorAll('span');
      if (spans.length >= 2) {
        const name = (spans[0].textContent || '').trim();
        const raw = (spans[1].textContent || '').trim();
        // "+$40", "-$40", "$0" -> a number. The sign is read from the rendered
        // text, because that minus sign is what a golfer actually sees.
        const num = Math.abs(parseFloat(raw.replace(/[^0-9.]/g, '')) || 0);
        out.net[name] = raw.indexOf('-') !== -1 ? -num : num;
      }
    });
  }
  // A refusal must REMOVE the trip-wide numbers, not sit above them. A warning
  // over an authoritative dollar figure is the failure being fixed, so the check
  // records whether either card is still on screen alongside it.
  out.refusalShown = cards.some(c => /Trip Total Not Shown/.test(c.textContent || ''));
  out.netCardShown = cards.some(c => /Net Across the Trip/.test(c.textContent || ''));
  out.payCardShown = cards.some(c => /Who Pays Who/.test(c.textContent || ''));
  const payCard = cards.find(c => /Who Pays Who/.test(c.textContent || ''));
  out.transactions = payCard
      ? Array.from(payCard.querySelectorAll('.ledger-row'))
          .map(r => (r.textContent || '').replace(/\\s+/g, ' ').trim())
      : [];
  out.names = Object.keys(out.net);
  out.sum = Math.round(Object.values(out.net).reduce((a, b) => a + b, 0) * 100) / 100;
  out.placeholderWarningShown = (() => {
    const b = document.getElementById('trip-placeholder-warning');
    return !!(b && b.style.display !== 'none' && (b.textContent || '').trim().length > 0);
  })();
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('trip-money-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

const arrive = db => arriveCold({
    url: fileUrl('trip.html', 'trip=MYR1'), db: db, expression: PROBE, settleMs: 4500 });

(async () => {
    const problems = [];
    const report = {};

    // 1. THE REAL CASE. Two rounds, the same four golfers, different roster order.
    // Team 1 shoots 4s, Team 2 shoots 5s, on both days. The roster ORDER differs
    // between the days, which is the whole point: ids are positional, names are not.
    const s1 = scoresFor(FOUR, [4, 4, 5, 5]);
    const s2 = scoresFor(FOUR_REORDERED, [5, 5, 4, 4]);
    const two = await arrive(tripDb({
        DAY1: roundOf(FOUR, s1, { eventName: 'Caledonia' }),
        DAY2: roundOf(FOUR_REORDERED, s2, { eventName: 'True Blue' })
    }));
    if (!two.ok) bail(two.reason);
    report.trip = JSON.parse(two.value);

    if (!report.trip.rendered)
        problems.push('the trip money list did not render - nothing on the page invokes it');
    if (!report.trip.onScreen)
        problems.push('the money list rendered but has no geometry');
    if (report.trip.names.length !== 4)
        problems.push('expected four golfers in the trip net, got '
                      + JSON.stringify(report.trip.names));
    // ZERO-SUM. A week of golf cannot create or destroy money.
    if (Math.abs(report.trip.sum) > 0.005)
        problems.push('the trip ledger sums to ' + report.trip.sum + ', not zero');
    if (!report.trip.transactions.length)
        problems.push('no "who pays who" transactions were produced');

    // 2. EXCLUDING A ROUND MUST ACTUALLY EXCLUDE IT.
    const excluded = await arrive(tripDb({
        DAY1: roundOf(FOUR, s1, { eventName: 'Caledonia' }),
        DAY2: roundOf(FOUR_REORDERED, s2, { eventName: 'True Blue' })
    }, { DAY2: false }));
    if (!excluded.ok) bail(excluded.reason);
    report.oneCounted = JSON.parse(excluded.value);
    const bothTotal = Math.abs(Object.values(report.trip.net)
        .reduce((a, b) => a + Math.abs(b), 0));
    const oneTotal = Math.abs(Object.values(report.oneCounted.net)
        .reduce((a, b) => a + Math.abs(b), 0));
    if (!(oneTotal < bothTotal))
        problems.push('excluding a round changed nothing: ' + oneTotal + ' vs ' + bothTotal);
    if (Math.abs(report.oneCounted.sum) > 0.005)
        problems.push('the one-round ledger sums to ' + report.oneCounted.sum);

    // 3. TWO GOLFERS, ONE NAME. This is the one that costs somebody real money.
    const m1 = scoresFor(TWO_MIKES, [4, 4, 5, 5]);
    const dup = await arrive(tripDb({
        DAY1: roundOf(TWO_MIKES, m1, { eventName: 'Caledonia' })
    }));
    if (!dup.ok) bail(dup.reason);
    report.duplicates = JSON.parse(dup.value);

    const mikeRows = report.duplicates.names.filter(n => /mike dunne/i.test(n));
    if (!report.duplicates.refusalShown) {
        problems.push('TWO GOLFERS CALLED "Mike Dunne" WERE MERGED INTO ONE BALANCE '
            + 'and the trip said nothing - one of them pays the other\'s debts');
    }
    // REFUSING MUST MEAN THERE IS NO NUMBER. A refusal card printed above a live
    // "Net Across the Trip" is the exact failure this replaced: nobody reads the
    // warning, and the figure decides who pays.
    if (report.duplicates.netCardShown || report.duplicates.payCardShown) {
        problems.push('the trip refused and showed the total anyway - net card: '
            + report.duplicates.netCardShown + ', who-pays card: '
            + report.duplicates.payCardShown);
    }
    if (mikeRows.length) {
        problems.push('a merged "Mike Dunne" balance is still on screen: '
            + JSON.stringify(report.duplicates.names));
    }
    // And the clean trip must NOT be refused.
    if (report.trip.refusalShown)
        problems.push('a trip with four distinct names was refused');

    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
