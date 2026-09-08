#!/usr/bin/env node
// ============================================================================
// A SCORED ROUND IS A RESULT, NOT A DRAFT.
//
// Wave 5 measured the player-remove path: one tap, no confirmation, the record
// gone and eighteen score keys orphaned where nothing can ever reach them
// again - because addPlayerToField mints a FRESH id, so re-adding the golfer
// creates a different competitor with an empty card.
//
// The rule this wave installs: nothing scored, it never happened and delete
// stays. Something scored, it is a result - the control becomes Withdraw, which
// sets a status and removes nothing. Never renumber, never compact, exactly as
// team numbers already behave.
//
// TEST 32  the control switches on whether there are scores
// TEST 33  a withdrawn golfer is off every board and still in the record
// TEST 34  reversible, and the SAME id comes back - which is the whole point
// TEST 35  addPlayerToField omits addedAt, so button-added golfers sort to the
//          top of the field list on `|| 0`
//
//   node tools/tournament-withdraw-check.js
//
//   exit 0   a result cannot be deleted, and nothing else moved
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { openJourney, fileUrl: journeyUrl } = require('./lib/journey.js');
const F = require('./lib/tournament-fixtures.js');

const COURSE = [];
for (let i = 1; i <= 18; i++) COURSE.push({ hole: i, par: 4, hcpIndex: i });

// Four golfers. Two are in a group; two are loose, which is the shape wave 5
// measured - removePlayerFromField refuses a grouped golfer outright, so the
// destructive path only exists for an ungrouped one.
//   Blank   no scores at all        -> delete must stay available
//   Nine    nine scored holes       -> a result; delete must become Withdraw
//   Low/High are the rest of the field, scored, so ranks can close up.
function field() {
    const f = F.playerField([
        { name: 'Low', handicap: '0' },
        { name: 'High', handicap: '0' },
        { name: 'Nine', handicap: '0' },
        { name: 'Blank', handicap: '0' },
    ]);
    const LOW = f.byName.Low, HIGH = f.byName.High, NINE = f.byName.Nine;
    const scores = {};
    for (let h = 1; h <= 18; h++) {
        scores[LOW + '_h' + h] = 3;    // 54, -18
        scores[HIGH + '_h' + h] = 5;   // 90, +18
    }
    for (let h = 1; h <= 9; h++) scores[NINE + '_h' + h] = 4;   // nine holes, level
    const groups = {};
    const g = F.scoringGroup('Group 1', [LOW, HIGH], 1);
    groups[g.id] = g;
    return {
        record: F.eventRecord({
            name: 'Club Championship', format: 'individual', scoringMode: 'gross',
            courseName: 'True Blue', activeCourseKey: 't', courseData: COURSE,
            entryFee: 300, players: f.players, scoringGroups: groups, scores: scores,
        }),
        byName: f.byName, groupId: g.id,
    };
}

const CAPTURE = `
(function () {
  window.__writes = []; window.__alerts = []; window.__confirms = 0;
  window.alert = function (m) { window.__alerts.push(String(m)); };
  window.confirm = function (m) { window.__confirms++; return true; };
  window.print = function () {};
  window.__cbs = [];
  var realDb = window.firebase && window.firebase.database;
  if (!realDb) return;
  window.firebase.database = function () {
    var d = realDb.apply(this, arguments); var rr = d.ref;
    d.ref = function (p) {
      var r = rr.call(d, p); var on = r.on;
      r.on = function (ev, cb) { if (ev === 'value') window.__cbs.push({ path: String(p), cb: cb });
        return on.apply(r, arguments); };
      ['set', 'update', 'remove'].forEach(function (op) { var fn = r[op];
        r[op] = function (v) {
          window.__writes.push({ op: op, path: String(p),
            value: (function () { try { return JSON.stringify(v); } catch (e) { return '?'; } })() });
          return fn.apply(r, arguments); };
      });
      return r; };
    return d; };
})();`;

// Presses whichever control the field list offers for a given golfer, and
// reports what it was called and what it wrote.
const pressFor = (pid) => `
(() => {
  const out = {};
  const row = Array.from(document.querySelectorAll('#player-field-list .fa-row'))
      .find(r => (r.innerHTML || '').indexOf("'${pid}'") !== -1);
  out.rowFound = !!row;
  if (!row) return JSON.stringify(out);
  // Every control the row offers, so a renamed button cannot be missed.
  const btns = Array.from(row.querySelectorAll('button'));
  out.controls = btns.map(b => ({ label: (b.textContent || '').trim(),
      handler: (b.getAttribute('onclick') || '').replace(/\\(.*$/, ''),
      disabled: b.hasAttribute('disabled') }));
  const before = window.__writes.length, alerts = window.__alerts.length;
  btns.forEach(b => { if (!b.hasAttribute('disabled')) b.click(); });
  out.writes = window.__writes.slice(before);
  out.alerts = window.__alerts.slice(alerts);
  out.confirms = window.__confirms;
  return JSON.stringify(out);
})()`;

const BOARD = `
(() => {
  const rows = Array.from(document.querySelectorAll('#leaderboard-list .lb-row')).slice(1);
  const clean = t => String(t || '').replace(/\\([^)]*\\)/g, '').replace(/\\s+/g, ' ').trim();
  return JSON.stringify({
    board: rows.map(r => ({
      rank: clean(r.querySelector('.lb-pos') && r.querySelector('.lb-pos').textContent),
      name: clean(r.querySelector('.lb-team') && r.querySelector('.lb-team').textContent),
      toPar: clean(r.querySelector('.lb-score') && r.querySelector('.lb-score').textContent),
    })),
    poolLine: (document.getElementById('manage-t-pool').innerText || '').trim(),
    payoutSub: (document.getElementById('payout-pool-sub').innerText || '').trim(),
    fieldCount: (document.getElementById('player-field-list').innerText || '')
        .split('\\n')[0].trim(),
  });
})()`;

function bail(msg) {
    console.error('tournament-withdraw-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

module.exports = { field: field, BOARD: BOARD, CAPTURE: CAPTURE };

if (require.main !== module) return;

(async () => {
    const fx = field();
    const BASE = fx.record;
    const PID = fx.byName;
    const withdrawn = JSON.parse(JSON.stringify(BASE));
    withdrawn.players[PID.Nine].status = 'withdrawn';

    const db = { tournaments: { EV: BASE, WD: withdrawn }, trips: {} };
    const run = async (code, expression) => {
        const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=' + code),
            db, expression, preScript: CAPTURE, settleMs: 4200,
            blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        return g;
    };

    const onBlank = await run('EV', pressFor(PID.Blank));
    const onNine = await run('EV', pressFor(PID.Nine));
    const boardBefore = await run('EV', BOARD);
    const boardAfter = await run('WD', BOARD);

    // --- controls first ----------------------------------------------------
    if (!onBlank.rowFound || !onNine.rowFound) {
        bail('the player field did not render its rows - nothing was measured');
    }
    const rank = (b, name) => (b.board.find(r => r.name === name) || {}).rank;
    if (rank(boardBefore, 'Nine') === undefined) {
        bail('the scored golfer is not on the board BEFORE withdrawing, so their '
            + 'absence afterwards cannot be attributed to anything');
    }

    const problems = [];
    const wrote = (o, re) => (o.writes || []).some(w => re.test(w.path));
    const scoreKeys = rec => Object.keys(rec.scores || {}).length;

    // --- TEST 32 -----------------------------------------------------------
    const t32 = {
        blank_stillDeletes: wrote(onBlank, /\/players\/[^/]+$/)
            && (onBlank.writes || []).some(w => w.op === 'remove'),
        blank_setsNoStatus: !(onBlank.writes || []).some(w => /status/.test(w.path)),
        nine_isNotDeleted: !(onNine.writes || []).some(w => w.op === 'remove'
            && /\/players\/[^/]+$/.test(w.path)),
        nine_setsAStatus: (onNine.writes || []).some(w => /\/players\/[^/]+\/status$/.test(w.path)
            && /withdraw/i.test(w.value || '')),
        nine_controlIsLabelledWithdraw: (onNine.controls || [])
            .some(c => /withdraw/i.test(c.label) || /withdraw/i.test(c.handler)),
        control_scoreKeysUnchangedAfterWithdrawing:
            scoreKeys(withdrawn) === scoreKeys(BASE),
    };
    Object.keys(t32).forEach(k => { if (!t32[k]) problems.push('TEST 32 ' + k + ': FAILED'); });

    // --- TEST 33 -----------------------------------------------------------
    const namesAfter = boardAfter.board.map(r => r.name);
    const t33 = {
        withdrawnGolferOffTheBoard: namesAfter.indexOf('Nine') === -1,
        control_theyWereOnItBefore: boardBefore.board.map(r => r.name).indexOf('Nine') !== -1,
        ranksCloseUp: rank(boardAfter, 'Low') === '1' && rank(boardAfter, 'High') === '2',
        control_ranksBefore: rank(boardBefore, 'Low') === '1'
            && rank(boardBefore, 'Nine') === '2' && rank(boardBefore, 'High') === '3',
        recordStillHoldsThem: !!withdrawn.players[PID.Nine],
        scoresIntact: Object.keys(withdrawn.scores)
            .filter(k => k.indexOf(PID.Nine + '_') === 0).length === 9,
    };
    Object.keys(t33).forEach(k => { if (!t33[k]) problems.push('TEST 33 ' + k + ': FAILED'); });

    // --- TEST 34 + 35: a stateful round trip through the real controls -----
    const j = await openJourney({ db: { tournaments: { EV: JSON.parse(JSON.stringify(BASE)) },
        trips: {}, global_courses: {} } });
    let trip = {}, order = {};
    try {
        await j.goto(journeyUrl('tournament.html', 'tourney=EV'), 2600);
        const before = await j.harvest();
        const idBefore = PID.Nine;
        const scoresBefore = Object.keys(before.tournaments.EV.scores)
            .filter(k => k.indexOf(idBefore + '_') === 0).length;

        // Withdraw, then reinstate, pressing whatever the row offers each time.
        const press = `(() => {
            const row = Array.from(document.querySelectorAll('#player-field-list .fa-row'))
                .find(r => (r.innerHTML || '').indexOf("'${idBefore}'") !== -1);
            if (!row) return 'no row';
            const b = Array.from(row.querySelectorAll('button')).filter(x => !x.hasAttribute('disabled'));
            const labels = b.map(x => (x.textContent || '').trim()).join('|');
            b.forEach(x => x.click());
            return labels;
        })()`;
        trip.firstPressLabels = await j.evaluate(press);
        const mid = await j.harvest();
        trip.afterFirstPress_playerStillThere = !!(mid.tournaments.EV.players || {})[idBefore];
        trip.afterFirstPress_status = ((mid.tournaments.EV.players || {})[idBefore] || {}).status;

        trip.secondPressLabels = await j.evaluate(press);
        const back = await j.harvest();
        const rec = (back.tournaments.EV.players || {})[idBefore];
        trip.reinstated = !!rec && !rec.status;
        trip.idIsTheSameOne = !!rec && rec.id === idBefore;
        trip.scoresBefore = scoresBefore;
        trip.scoresAfter = Object.keys(back.tournaments.EV.scores)
            .filter(k => k.indexOf(idBefore + '_') === 0).length;
        trip.onBoardAgain = await j.evaluate(`(() => {
            const rows = Array.from(document.querySelectorAll('#leaderboard-list .lb-row')).slice(1);
            return rows.some(r => /Nine/.test(r.innerText || ''));
        })()`);

        // TEST 35: a golfer added with the + Add button must sort AFTER the
        // original field, not above it.
        await j.evaluate(`(() => {
            document.getElementById('new-player-name').value = 'Zed Latecomer';
            document.getElementById('new-player-hcp').value = '5';
            const b = Array.from(document.querySelectorAll('#player-field-section button'))
                .find(x => /addPlayerToField/.test(x.getAttribute('onclick') || ''));
            if (b) b.click();
            return !!b;
        })()`);
        const withZed = await j.harvest();
        const zedId = Object.keys(withZed.tournaments.EV.players)
            .find(k => withZed.tournaments.EV.players[k].name === 'Zed Latecomer');
        order.zedAdded = !!zedId;
        order.zedRecord = zedId ? withZed.tournaments.EV.players[zedId] : null;
        order.listOrder = await j.evaluate(`(() => {
            return Array.from(document.querySelectorAll('#player-field-list .fa-row'))
                .map(r => { const i = r.querySelector('input'); return i ? i.value : null; });
        })()`);
    } finally {
        await j.close();
    }

    const t34 = {
        firstPressWithdrew: trip.afterFirstPress_playerStillThere === true
            && /withdraw/i.test(String(trip.afterFirstPress_status || '')),
        reinstateClearsTheStatus: trip.reinstated === true,
        control_theIdIsTheSameOneNotAReMint: trip.idIsTheSameOne === true,
        scoresSurvivedBothWays: trip.scoresAfter === trip.scoresBefore
            && trip.scoresBefore === 9,
        backOnTheBoard: trip.onBoardAgain === true,
    };
    Object.keys(t34).forEach(k => { if (!t34[k]) problems.push('TEST 34 ' + k + ': FAILED'); });

    const zedIndex = (order.listOrder || []).indexOf('Zed Latecomer');
    const t35 = {
        addedAtIsWritten: !!(order.zedRecord && order.zedRecord.addedAt),
        sortsAfterTheOriginalField: zedIndex === (order.listOrder || []).length - 1,
    };
    Object.keys(t35).forEach(k => { if (!t35[k]) problems.push('TEST 35 ' + k + ': FAILED'); });

    const report = {
        TEST_34_reversible: Object.assign({}, trip, { assertions: t34 }),
        TEST_35_addedAt: Object.assign({}, order, { zedIndex: zedIndex,
            assertions: t35 }),
        TEST_32_the_control_switches_on_scores: {
            blankGolfer: { controls: onBlank.controls, writes: onBlank.writes,
                           confirms: onBlank.confirms },
            scoredGolfer: { controls: onNine.controls, writes: onNine.writes,
                            alerts: onNine.alerts },
            assertions: t32,
        },
        TEST_33_off_the_board_still_in_the_record: {
            boardBefore: boardBefore.board, boardAfter: boardAfter.board,
            poolBefore: boardBefore.poolLine, poolAfter: boardAfter.poolLine,
            payoutSubBefore: boardBefore.payoutSub, payoutSubAfter: boardAfter.payoutSub,
            fieldCountBefore: boardBefore.fieldCount, fieldCountAfter: boardAfter.fieldCount,
            assertions: t33,
        },
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
