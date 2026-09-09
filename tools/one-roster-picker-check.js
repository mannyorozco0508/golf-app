#!/usr/bin/env node
// ============================================================================
// ONE ROSTER, TAPPED IN ORDER.
//
// The side-bet picker listed the WHOLE FIELD TWICE - once under "Side 1 (green)"
// and again under "Side 2 (navy)". On a twelve-golfer round that is twenty-four
// tappable names to set up a bet between two of them, and the organizer has to
// decide which colour each man belongs to before tapping. Nobody thinks that way;
// they point at two guys.
//
// THE NEW SHAPE: one roster, listed once, still grouped by foursome. Tap in order.
// The first half of the taps is one side, the second half is the other - which is
// exactly Manny's two examples:
//
//     Dan, Rich              -> Dan vs Rich
//     Dan, Steve, Rich, Jim  -> Dan & Steve vs Rich & Jim
//
// A PICKER CHANGE, NOT A MODEL CHANGE. Everything stored is untouched: the write is
// still sideMatches/{pushKey} carrying { format, scoring, teamAIds, teamBIds,
// startHole, createdAt, scope, ... } with scope the literal 'cross'. This check
// hand-compares the payload the NEW picker produces against the payload the OLD
// two-zone picker produced for the same pairing, field by field.
//
// WHY THE IDS ARE SORTED WITHIN A SIDE. The old screen derived each side with
// Object.keys(sidematchPickState).filter(...), and Object.keys returns
// INTEGER-LIKE KEYS IN ASCENDING NUMERIC ORDER regardless of insertion. So the old
// payload's teamAIds were always ascending. Tap order is now the input, so without
// sorting the same 2v2 could write ["105","103"] where the old screen wrote
// ["103","105"] - the same set, a different array. Each side is sorted ascending on
// the way out, which reproduces the old bytes exactly. Order within a side is not
// read by any engine (a 2v2 side is scored best ball), so this is faithfulness to
// the old payload rather than a behaviour anyone depends on.
//
// DRIVEN THROUGH THE PAGE'S OWN CONTROLS on a cold arrival. Nothing here calls a
// page function to build a selection.
//
//   node tools/one-roster-picker-check.js
//
//   exit 0   one roster, order decides the sides, the record is unchanged
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { openJourney, fileUrl: jUrl } = require('./lib/journey.js');

const TOKEN = 'orgtok1';
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

// Twelve golfers, three foursomes. Manny's four names are ids 101/103/105/107 so a
// 2v2 spans groups and the ascending-id question is a real one.
const NAMES = ['Dan Reeve', 'Ann Poe', 'Steve Cobb', 'Bea Lowe',
               'Rich Vance', 'Cal Dorn', 'Jim Hale', 'Eve Nunn',
               'Kit Moss', 'Lou Frey', 'Mia Ward', 'Ned Ives'];
const ID = { Dan: '101', Steve: '103', Rich: '105', Jim: '107' };

function roundOf(extra, holes) {
    const players = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: '0',
        playingForMoney: true, team: (i % 4) < 2 ? 'Team 1' : 'Team 2' }));
    const scores = {};
    players.forEach((p, i) => CD.slice(0, holes === undefined ? 9 : holes).forEach(h => {
        scores['p' + p.id + '_h' + h.hole] = (i % 2 === 0) ? 4 : 5; }));
    return Object.assign({
        eventName: 'Club Day', courseName: 'Camas Meadows',
        activeCourseKey: 'swwa_camasmeadows', gameFormat: 'stroke', courseData: CD,
        players: players, scores: scores, organizerToken: TOKEN,
        settlementMode: 'whole-dollar', kpConfirmed: { confirmed: true },
    }, extra || {});
}

// HAND-COMPUTED for TEST 4. Par 4 x 18 = 72. Even index plays 4 (gross 72), odd
// plays 5 (gross 90), every hcp 0 so net = gross. Two $20 match-play Any Group bets
// already stored, exactly as sidematches.html writes them:
//   xg1  Dan Reeve (101, 72) v Cal Dorn (106, 90)  -> +$20 / -$20
//   xg2  Steve Cobb (103, 72) v Eve Nunn (108, 90) -> +$20 / -$20
// $40 moved, zero-sum.
const EXISTING = {
    xg1: { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['106'],
           stake: 20, pressRule: 'none', startHole: 1, createdAt: 1, scope: 'cross' },
    xg2: { format: 'match', scoring: 'net', teamAIds: ['103'], teamBIds: ['108'],
           stake: 20, pressRule: 'none', startHole: 1, createdAt: 2, scope: 'cross' },
};

const db = { events: { FIELD: roundOf(null, 9), BETS: roundOf({ sideMatches: EXISTING }, 18) } };

const PRE = `
(function () {
  window.print = function () {};
  window.__alerts = [];
  window.alert = function (m) { window.__alerts.push(String(m)); };
  window.confirm = function () { return true; };
})();`;

function bail(msg) {
    console.error('one-roster-picker-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// Opens the modal on the Across Groups branch and reports the roster as rendered.
const ROSTER_PROBE = `
(() => {
  const out = {};
  const byH = (sel, re) => Array.from(document.querySelectorAll(sel))
      .find(e => re.test(e.getAttribute('onclick') || ''));
  const add = byH('#sidematches-card button', /openSideMatchModal/);
  out.opened = !!add;
  if (add) add.click();
  const cross = byH('.sm-scope-choice', /pickActionScope\\('cross'\\)/);
  if (cross) cross.click();

  const badges = Array.from(document.querySelectorAll('#sidematch-modal .player-pick-badge'));
  out.badgeCount = badges.length;
  // FIRST WORD ONLY, which is what the badge renders. Counting by NAME is the
  // question - "does Dan appear once or twice" - not counting elements.
  const counts = {};
  badges.forEach(b => {
    const n = (b.textContent || '').trim().split(/\\s+/)[0];
    counts[n] = (counts[n] || 0) + 1;
  });
  out.perName = counts;
  out.maxPerName = Math.max.apply(null, Object.values(counts).concat([0]));
  out.distinctNames = Object.keys(counts).length;
  // Every badge must be tappable and carry a handler naming a real golfer.
  out.allTappable = badges.every(b => /pickPlayer/.test(b.getAttribute('onclick') || ''));
  // Foursome headings still present, so a golfer is still easy to find.
  out.groupHeads = Array.from(document.querySelectorAll('#sidematch-modal .sm-pick-group-head'))
      .map(e => (e.textContent || '').trim());
  // The two side zones, by their own class - the thing being removed.
  out.sideZoneLabels = Array.from(document.querySelectorAll('#sidematch-modal .sm-side-zone-label'))
      .map(e => (e.textContent || '').trim());
  // The pairing line, before any tap.
  const ind = document.getElementById('sm-team-size-indicator');
  out.lineEmpty = ind ? (ind.textContent || '').replace(/\\s+/g, ' ').trim() : null;
  return JSON.stringify(out);
})()`;

// Taps a sequence of ids through whatever handler the badges carry, and reads the
// pairing line after each tap.
const tapProbe = ids => `
(() => {
  const out = { steps: [] };
  const byH = (sel, re) => Array.from(document.querySelectorAll(sel))
      .find(e => re.test(e.getAttribute('onclick') || ''));
  const add = byH('#sidematches-card button', /openSideMatchModal/);
  if (add) add.click();
  const cross = byH('.sm-scope-choice', /pickActionScope\\('cross'\\)/);
  if (cross) cross.click();
  const line = () => { const e = document.getElementById('sm-team-size-indicator');
      return e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : null; };
  const tap = id => {
    const b = Array.from(document.querySelectorAll('#sidematch-modal .player-pick-badge'))
        .find(x => new RegExp("\\\\('" + id + "'").test(x.getAttribute('onclick') || ''));
    if (!b) return false;
    b.click();
    return true;
  };
  ${JSON.stringify(ids)}.forEach(id => { const ok = tap(id); out.steps.push({ id: id, tapped: ok, line: line() }); });
  out.finalLine = line();
  return JSON.stringify(out);
})()`;

const SETTLE_PROBE = `
(() => {
  const t = id => { const e = document.getElementById(id);
      return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  return JSON.stringify({ body: (document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 1200),
      summary: t('combined-settlement-summary') });
})()`;

// Drives the real save path and returns the payload the stub received.
async function writeFor(taps) {
    const j = await openJourney({ db: JSON.parse(JSON.stringify(db)) });
    try {
        await j.goto(jUrl('sidematches.html', 'game=FIELD&organizer=' + TOKEN), 3000);
        await j.evaluate(PRE);
        await j.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button'))
            .find(x => /openSideMatchModal/.test(x.getAttribute('onclick')||'')); if (b) b.click(); return !!b; })()`);
        await j.evaluate(`(() => { const c = Array.from(document.querySelectorAll('.sm-scope-choice'))
            .find(x => /pickActionScope\\('cross'\\)/.test(x.getAttribute('onclick')||'')); if (c) c.click(); return !!c; })()`);
        await j.evaluate(`(() => {
            const set = (id, v) => { const e = document.getElementById(id); if (!e) return false;
                e.value = v; e.dispatchEvent(new Event('change',{bubbles:true})); return true; };
            set('sm-format','match'); set('sm-scoring','net'); set('sm-stake','20'); set('sm-press-rule','none');
            return true; })()`);
        await j.evaluate(`(() => {
            const tap = id => { const b = Array.from(document.querySelectorAll('#sidematch-modal .player-pick-badge'))
                .find(x => new RegExp("\\\\('" + id + "'").test(x.getAttribute('onclick') || ''));
                if (b) b.click(); return !!b; };
            return ${JSON.stringify(taps)}.map(tap); })()`);
        const alertsBefore = await j.evaluate('JSON.stringify(window.__alerts.slice())');
        await j.evaluate(`(() => { const s = Array.from(document.querySelectorAll('button'))
            .find(x => /saveSideMatch/.test(x.getAttribute('onclick')||'')); if (s) s.click(); return !!s; })()`);
        const alerts = JSON.parse(await j.evaluate('JSON.stringify(window.__alerts.slice())'));
        const d = await j.harvest();
        const sm = ((d.events || {}).FIELD || {}).sideMatches || {};
        const keys = Object.keys(sm);
        return { payload: keys.length ? sm[keys[0]] : null, alerts: alerts,
                 alertsBefore: JSON.parse(alertsBefore) };
    } finally { await j.close(); }
}

(async () => {
    const problems = [];
    const report = {};

    const cold = async (page, query, expr, label) => {
        const r = await arriveCold({ url: fileUrl(page, query), db: db,
            expression: expr, preScript: PRE, settleMs: 5000 });
        if (!r.ok) bail(label + ': ' + r.reason);
        try { return JSON.parse(r.value); } catch (e) { bail(label + ': unreadable probe output'); }
    };

    // ---- TEST 1 - ONE ROSTER -------------------------------------------
    const roster = await cold('sidematches.html', 'game=FIELD&organizer=' + TOKEN,
        ROSTER_PROBE, 'roster');
    report.roster = roster;
    if (!roster.opened) bail('the side-match modal could not be opened');
    if (roster.badgeCount === 0) bail('the picker rendered no golfers at all');

    // ---- TEST 3 - THE PAIRING LINE, and TEST 2's tap order -------------
    const oneVone = await cold('sidematches.html', 'game=FIELD&organizer=' + TOKEN,
        tapProbe([ID.Dan, ID.Rich]), '1v1 taps');
    const twoVtwo = await cold('sidematches.html', 'game=FIELD&organizer=' + TOKEN,
        tapProbe([ID.Dan, ID.Steve, ID.Rich, ID.Jim]), '2v2 taps');
    // Tap Steve then remove him, then carry on - the shift-up rule.
    const removal = await cold('sidematches.html', 'game=FIELD&organizer=' + TOKEN,
        tapProbe([ID.Dan, ID.Steve, ID.Steve, ID.Rich]), 'removal');
    report.taps = { oneVone, twoVtwo, removal };

    // ---- TEST 2 - THE RECORD -------------------------------------------
    const w1 = await writeFor([ID.Dan, ID.Rich]);
    const w2 = await writeFor([ID.Dan, ID.Steve, ID.Rich, ID.Jim]);
    // TAPPED OUT OF ID ORDER, ON PURPOSE, AND THE CHECK NEEDED IT.
    //
    // Dan/Steve/Rich/Jim are ids 101/103/105/107, so every sequence above is ALREADY
    // ASCENDING - and two negative controls proved that made those assertions inert:
    // sorting the whole order before splitting it, and dropping the within-side sort
    // entirely, both left the payload identical and the check green. A run that
    // cannot tell tap order from id order is not testing tap order.
    //
    // Jim, Dan, Rich, Steve = 107, 101, 105, 103. HAND-COMPUTED:
    //   first half  {107, 101} -> teamAIds ['101','107']  (ascending on the way out)
    //   second half {105, 103} -> teamBIds ['103','105']
    // Sorting the order first would give ['101','103'] vs ['105','107']; dropping the
    // within-side sort would give ['107','101'] vs ['105','103']. Both now fail.
    const wShuffled = await writeFor([ID.Jim, ID.Dan, ID.Rich, ID.Steve]);
    const wIncomplete1 = await writeFor([ID.Dan]);
    const wIncomplete3 = await writeFor([ID.Dan, ID.Steve, ID.Rich]);
    report.writes = { oneVone: w1, twoVtwo: w2, shuffled: wShuffled,
                      incompleteOne: wIncomplete1, incompleteThree: wIncomplete3 };

    // A FAILED ASSERTION, NOT A BAIL. On the OLD two-zone screen this run cannot
    // write at all - both taps land in the Side 1 zone, because two badges carry the
    // same golfer and the first one found is always zone 'a' - so the save is refused
    // as uneven. That is the defect being reported, not a harness that could not run,
    // and turning it into exit 2 would have hidden TESTS 1, 3 and 4 behind it. After
    // the fix a save that writes nothing is a loud failure here.
    const wroteOneVone = !!w1.payload;

    // ---- TEST 4 - EXISTING BETS ----------------------------------------
    const settled = await cold('settlement.html', 'game=BETS', SETTLE_PROBE, 'settlement');
    const body = String(settled.body || '');
    report.settlement = body.slice(0, 400);
    if (!/\$\d/.test(body)) bail('settlement.html printed no money, so nothing about it was measured');

    // THE OLD SCREEN'S PAYLOAD for the same 1v1, hand-written from what
    // Object.keys(sidematchPickState).filter(...) produced: Dan tapped under Side 1,
    // Rich under Side 2.
    const OLD_1V1 = { teamAIds: ['101'], teamBIds: ['105'] };
    const OLD_2V2 = { teamAIds: ['101', '103'], teamBIds: ['105', '107'] };

    const line = s => String(s || '');
    const A = {
        // ---- TEST 1 -----------------------------------------------------
        everyGolferAppearsExactlyOnce: roster.maxPerName === 1,
        allTwelveGolfersPresent: roster.distinctNames === 12,
        everyBadgeIsTappable: roster.allTappable === true,
        stillGroupedByFoursome: (roster.groupHeads || []).length >= 3
            && (roster.groupHeads || []).every(h => /^Group \d/.test(h)),
        theTwoSideZonesAreGone: (roster.sideZoneLabels || []).length === 0,

        // ---- TEST 3 -----------------------------------------------------
        emptyLineSaysWhatToDo: /tap/i.test(roster.lineEmpty) && line(roster.lineEmpty).length > 0,
        oneVoneLineNamesBoth: /Dan/.test(oneVone.finalLine) && /Rich/.test(oneVone.finalLine)
            && /\bvs\b/i.test(oneVone.finalLine),
        twoVtwoLineNamesBothPairs: ['Dan', 'Steve', 'Rich', 'Jim']
            .every(n => new RegExp(n).test(twoVtwo.finalLine)) && /\bvs\b/i.test(twoVtwo.finalLine),
        // A single tap is incomplete and must SAY so rather than showing a half pairing
        // as if it were finished.
        oneTapIsNotPresentedAsAPairing: !/\bvs\b/i.test(line(oneVone.steps[0].line)),

        // ---- TEST 2 -----------------------------------------------------
        oneVoneSaveActuallyWrites: wroteOneVone,
        oneVoneWritesTapOrderAsSides:
            JSON.stringify(w1.payload && w1.payload.teamAIds) === JSON.stringify(OLD_1V1.teamAIds)
            && JSON.stringify(w1.payload && w1.payload.teamBIds) === JSON.stringify(OLD_1V1.teamBIds),
        // THE ORDER IS THE MODEL, proved on a sequence that is not already sorted.
        tapOrderNotIdOrderDecidesTheSides:
            JSON.stringify(wShuffled.payload && wShuffled.payload.teamAIds) === JSON.stringify(['101', '107'])
            && JSON.stringify(wShuffled.payload && wShuffled.payload.teamBIds) === JSON.stringify(['103', '105']),
        twoVtwoWritesFirstPairThenSecond:
            JSON.stringify(w2.payload && w2.payload.teamAIds) === JSON.stringify(OLD_2V2.teamAIds)
            && JSON.stringify(w2.payload && w2.payload.teamBIds) === JSON.stringify(OLD_2V2.teamBIds),
        // CONTROL - the write shape is untouched.
        writeKeepsEveryKey: !!w1.payload && ['format', 'scoring', 'teamAIds', 'teamBIds',
            'startHole', 'createdAt', 'scope', 'stake', 'pressRule']
            .every(k => Object.prototype.hasOwnProperty.call(w1.payload, k)),
        writeKeepsTheScopeValue: !!w1.payload && w1.payload.scope === 'cross',
        writeCarriesNoNewKey: !!w1.payload && Object.keys(w1.payload)
            .every(k => ['format', 'scoring', 'teamAIds', 'teamBIds', 'startHole',
                'createdAt', 'scope', 'ownerGroup', 'stake', 'pressRule'].includes(k)),
        // CONTROL - removing a tapped name shifts the rest up: Dan, Steve, remove
        // Steve, Rich  ->  Dan vs Rich, not Dan & Steve vs Rich.
        removingATapShiftsTheRestUp: /Dan/.test(removal.finalLine) && /Rich/.test(removal.finalLine)
            && !/Steve/.test(removal.finalLine),

        // ---- TEST 3's REFUSAL CONTROL -----------------------------------
        // THE SAVE-BUTTON DEFECT MUST NOT REAPPEAR. An incomplete selection has to
        // say why, not fail silently.
        oneTapSaveSaysWhy: wIncomplete1.alerts.length > wIncomplete1.alertsBefore.length,
        oneTapSaveWritesNothing: wIncomplete1.payload === null,
        threeTapsSaveSaysWhy: wIncomplete3.alerts.length > wIncomplete3.alertsBefore.length,
        threeTapsSaveWritesNothing: wIncomplete3.payload === null,

        // ---- TEST 4 -----------------------------------------------------
        existingBetsStillSettle: /Dan Reeve/.test(body) && /Cal Dorn/.test(body),
        existingBetsPayTheHandFigure:
            /Dan Reeve[^A-Za-z]{0,18}\+?\$20\b/.test(body)
            && /Steve Cobb[^A-Za-z]{0,18}\+?\$20\b/.test(body)
            && /Cal Dorn[^A-Za-z]{0,18}[-\u2212]\$20\b/.test(body)
            && /Eve Nunn[^A-Za-z]{0,18}[-\u2212]\$20\b/.test(body),
    };
    Object.keys(A).forEach(k => { if (!A[k]) problems.push(k + ': FAILED'); });

    report.handComputed = {
        oldScreenWrote: { oneVone: OLD_1V1, twoVtwo: OLD_2V2 },
        existingBets: { 'Dan Reeve': '+$20', 'Steve Cobb': '+$20',
                        'Cal Dorn': '-$20', 'Eve Nunn': '-$20', total: '$40, zero-sum' },
    };
    report.assertions = A;
    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
