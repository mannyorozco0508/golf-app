#!/usr/bin/env node
// ============================================================================
// AN ABSENT HANDICAP IS NOT A HANDICAP OF ZERO.
//
// Wave 16 gave an unnamed entry handicap '0', because that is what every other
// writer stores for a golfer nobody has numbered. On a GROSS event that costs
// nothing. On a NET event it silently enters an unknown person as a scratch
// golfer - the one handicap nobody would have chosen for them - and ranks them
// against a field playing off real numbers.
//
// Manny's decision: no handicap, not zero. The entry stays in the field, counts
// for the pool and flights, takes a group and takes scores. On the NET board it
// is PENDING rather than ranked.
//
// DECLARED, NEVER INFERRED. An organizer can legitimately enter 0 - a scratch
// golfer is a real thing - so "missing" cannot be read off the value. It is a
// marker, written deliberately and cleared the moment a number arrives.
//
// TEST 40  absent, not zero - and a real 0 still plays
// TEST 41  the net board: pending, unranked, and nobody else moves
// TEST 42  naming and numbering are independent
// TEST 43  everything wave 16 established is untouched
//
//   node tools/tournament-pending-handicap-check.js
//
//   exit 0   an unknown golfer is not scored as a scratch golfer
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { openJourney, fileUrl: journeyUrl } = require('./lib/journey.js');
const F = require('./lib/tournament-fixtures.js');

// Shuffled stroke index so "the nine lowest indexes" is not "the first nine
// holes" - the same trap wave 12 avoided.
const SI = [7, 15, 1, 11, 3, 17, 9, 5, 13, 8, 16, 2, 12, 4, 18, 10, 6, 14];
const COURSE = SI.map((si, i) => ({ hole: i + 1, par: 4, hcpIndex: si }));
const REAL_COURSE = { id: 'trueblue', name: 'True Blue Golf Club' };

// HAND-COMPUTED. Everybody shoots 90 on a par 72.
//   Scratch  handicap "0"  -> a REAL zero. 0 strokes, net 90, +18. Still ranked.
//   Eighteen handicap "18" -> 18 strokes, net 72, E.
//   Slot     no handicap   -> cannot be netted at all. Pending.
// Gross, all three are +18.
const HAND_NET = { Scratch: '+18', Eighteen: 'E' };
const HAND_GROSS = { Scratch: '+18', Eighteen: '+18', 'Unnamed entry': '+18' };
// When the slot is given 9, it strokes on the nine lowest indexes -> net 81, +9,
// which places it between Eighteen (E) and Scratch (+18).
const HAND_ORDER_ONCE_NUMBERED = ['Eighteen', 'Unnamed entry', 'Scratch'];

function mixed(opts) {
    const o = opts || {};
    const f = F.playerField([
        { name: 'Scratch', handicap: '0' },
        { name: 'Eighteen', handicap: '18' },
    ]);
    const slotId = F.newPlayerId();
    // The shape under test. handicap is ABSENT, and the marker says so.
    f.players[slotId] = Object.assign(
        { id: slotId, name: '', addedAt: 3, unnamed: true },
        o.slotHandicap !== undefined
            ? { handicap: o.slotHandicap }
            : { handicapPending: true });
    if (o.slotName) { f.players[slotId].name = o.slotName; delete f.players[slotId].unnamed; }
    const ids = Object.keys(f.players);
    const scores = {};
    ids.forEach(pid => { for (let h = 1; h <= 18; h++) scores[pid + '_h' + h] = 5; });
    const groups = {};
    const g = F.scoringGroup('Group 1', ids, 1);
    groups[g.id] = g;
    return {
        record: F.eventRecord({
            name: 'Club Championship', format: 'individual',
            scoringMode: o.mode || 'net',
            courseName: 'True Blue', activeCourseKey: 't', courseData: COURSE,
            entryFee: 300, players: f.players, scoringGroups: groups, scores: scores,
        }),
        slotId: slotId, groupId: g.id, byName: f.byName,
    };
}

const CAPTURE = `
(function () {
  window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); };
  window.print = function () {};
})();`;

const BOARD = `
(() => {
  const txt = el => String((el && el.textContent) || '').replace(/\\s+/g, ' ').trim();
  const rows = Array.from(document.querySelectorAll('#leaderboard-list .lb-row')).slice(1);
  return JSON.stringify({
    board: rows.map(r => ({
      rank: txt(r.querySelector('.lb-pos')),
      label: txt(r.querySelector('.lb-team')),
      name: txt(r.querySelector('.lb-team')).replace(/\\([^)]*\\)/g, '').trim(),
      thru: txt(r.querySelector('.lb-thru')),
      toPar: txt(r.querySelector('.lb-score')),
    })),
    fieldHeader: (document.getElementById('player-field-list').innerText || '')
        .split('\\n')[0].trim(),
    pool: (document.getElementById('manage-t-pool').innerText || '').trim(),
    payoutSub: (document.getElementById('payout-pool-sub').innerText || '').trim(),
    fieldRows: Array.from(document.querySelectorAll('#player-field-list .fa-row'))
        .map(r => { const i = r.querySelectorAll('input');
          return { name: i[0] ? i[0].value : null, hcp: i[1] ? i[1].value : null,
                   hcpPlaceholder: i[1] ? (i[1].getAttribute('placeholder') || '') : null,
                   controls: Array.from(r.querySelectorAll('button'))
                       .map(b => (b.textContent || '').trim()) }; }),
  });
})()`;

const cardProbe = (slotId) => `
(() => {
  const ins = Array.from(document.querySelectorAll('#holes-list input'));
  const mine = ins.filter(i => (i.getAttribute('onchange') || '').indexOf("'${slotId}'") !== -1);
  const dotsFor = el => { const lab = el.closest('label');
      const d = lab ? lab.querySelector('.stroke-dots') : null;
      return d ? (d.textContent || '').trim() : null; };
  return JSON.stringify({
    inputs: ins.length, slotInputs: mine.length,
    slotDots: mine.map(dotsFor).filter(t => t && t.length > 0).length,
    anyDotsOnTheCard: ins.map(dotsFor).filter(t => t && t.length > 0).length,
    roster: (document.getElementById('team-roster').innerText || '')
        .replace(/\\s+/g, ' ').trim(),
  });
})()`;

function bail(msg) {
    console.error('tournament-pending-handicap-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

module.exports = { mixed: mixed, BOARD: BOARD, CAPTURE: CAPTURE };

if (require.main !== module) return;

(async () => {
    const problems = [];
    const net = mixed({});
    const gross = mixed({ mode: 'gross' });
    const numbered = mixed({ slotHandicap: '9' });

    const db = { tournaments: { NET: net.record, GROSS: gross.record,
                                NUM: numbered.record }, trips: {} };
    const cold = async (page, query, expression) => {
        const r = await arriveCold({ url: fileUrl(page, query), db, expression,
            preScript: CAPTURE, settleMs: 4200, blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        return g;
    };

    const onNet = await cold('tournament.html', 'tourney=NET', BOARD);
    const onGross = await cold('tournament.html', 'tourney=GROSS', BOARD);
    const onNumbered = await cold('tournament.html', 'tourney=NUM', BOARD);
    const netCard = await cold('tournament-scorecard.html',
        'tourney=NET&group=' + net.groupId, cardProbe(net.slotId));

    if (onNet.board.length !== 3) bail('the net board did not render three rows');

    const row = (b, name) => b.board.find(r => r.name === name);
    const slotNet = row(onNet, 'Unnamed entry');
    const slotGross = row(onGross, 'Unnamed entry');
    if (!slotNet) bail('the unnamed entry is not on the net board at all - it is '
        + 'supposed to be present and unranked, not missing');

    // --- TEST 40 + 41 ------------------------------------------------------
    const t40 = {
        realZeroStillRanked: !!row(onNet, 'Scratch')
            && /^[0-9]+$/.test(row(onNet, 'Scratch').rank)
            && row(onNet, 'Scratch').toPar === HAND_NET.Scratch,
        control_theOtherNamedGolferIsRanked: !!row(onNet, 'Eighteen')
            && row(onNet, 'Eighteen').toPar === HAND_NET.Eighteen,
    };
    Object.keys(t40).forEach(k => { if (!t40[k]) problems.push('TEST 40 ' + k + ': FAILED'); });

    const t41 = {
        pendingIsNotRanked: slotNet.rank === '-' || slotNet.rank === '',
        pendingSaysWhy: /pending|no handicap|handicap/i.test(slotNet.label || ''),
        pendingShowsNoToPar: slotNet.toPar === '—' || slotNet.toPar === '-',
        ranksOfTheOthersAreRight: row(onNet, 'Eighteen').rank === '1'
            && row(onNet, 'Scratch').rank === '2',
        grossEventUnaffected: !!slotGross && /^[0-9]+$/.test(slotGross.rank)
            && slotGross.toPar === HAND_GROSS['Unnamed entry'],
        control_onceNumberedItJoinsTheRanking:
            JSON.stringify(onNumbered.board.filter(r => /^[0-9]+$/.test(r.rank))
                .map(r => r.name)) === JSON.stringify(HAND_ORDER_ONCE_NUMBERED),
        control_noStrokeDotsForAPendingEntry: netCard.slotDots === 0,
        control_theCardDoesDrawDotsForSomebody: netCard.anyDotsOnTheCard > 0,
    };
    Object.keys(t41).forEach(k => { if (!t41[k]) problems.push('TEST 41 ' + k + ': FAILED'); });

    // --- TEST 42 + 43: through the real UI ---------------------------------
    const j = await openJourney({ db: { tournaments: {}, trips: {}, global_courses: {} } });
    let ui = {};
    try {
        await j.goto(journeyUrl('tournament.html', ''), 2600);
        await j.click('#fmt-individual', null, { settleMs: 300 });
        await j.evaluate(`(() => {
            const s = document.getElementById('course-search-input');
            s.value = ${JSON.stringify(REAL_COURSE.name)};
            s.dispatchEvent(new Event('input', { bubbles: true }));
            const o = Array.from(document.querySelectorAll('#course-dropdown .custom-select-option'))
                .find(x => (x.getAttribute('onclick') || '').indexOf("'${REAL_COURSE.id}'") !== -1);
            if (o) o.click(); return !!o;
        })()`);
        await j.evaluate(`(() => {
            const ins = document.querySelectorAll('#teams-list .team-name-inputs input');
            if (ins[0]) ins[0].value = 'Captain';
            return ins.length;
        })()`);
        await j.click('#setup-screen button.btn-primary', /saveTournament/, { settleMs: 2600 });
        let d = await j.harvest();
        const code = Object.keys(d.tournaments)[0];

        await j.goto(journeyUrl('tournament.html', 'tourney=' + code), 2500);
        const before = Object.keys((await j.harvest()).tournaments[code].players || {});
        await j.evaluate(`(() => {
            const b = Array.from(document.querySelectorAll('#player-field-section button'))
                .find(x => /addUnnamedEntry/.test(x.getAttribute('onclick') || ''));
            if (b) b.click(); return !!b;
        })()`);
        d = await j.harvest();
        const slot = Object.keys(d.tournaments[code].players).filter(i => before.indexOf(i) === -1)[0];
        ui.written = d.tournaments[code].players[slot];

        // NAME it - the handicap must still be pending.
        await j.goto(journeyUrl('tournament.html', 'tourney=' + code), 2400);
        await j.evaluate(`(() => {
            const r = Array.from(document.querySelectorAll('#player-field-list .fa-row'))
                .find(x => (x.innerHTML || '').indexOf("'${slot}'") !== -1);
            if (!r) return false;
            const i = r.querySelectorAll('input')[0];
            i.value = 'Named Later'; i.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        })()`);
        d = await j.harvest();
        ui.afterNaming = d.tournaments[code].players[slot];

        // NUMBER it - and it must stop being pending without being re-named.
        await j.goto(journeyUrl('tournament.html', 'tourney=' + code), 2400);
        await j.evaluate(`(() => {
            const r = Array.from(document.querySelectorAll('#player-field-list .fa-row'))
                .find(x => (x.innerHTML || '').indexOf("'${slot}'") !== -1);
            if (!r) return false;
            const i = r.querySelectorAll('input')[1];
            i.value = '0'; i.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        })()`);
        d = await j.harvest();
        ui.afterNumbering = d.tournaments[code].players[slot];

        // The other direction: a fresh slot, numbered first, still unnamed.
        const before2 = Object.keys(d.tournaments[code].players);
        await j.evaluate(`(() => {
            const b = Array.from(document.querySelectorAll('#player-field-section button'))
                .find(x => /addUnnamedEntry/.test(x.getAttribute('onclick') || ''));
            if (b) b.click(); return !!b;
        })()`);
        d = await j.harvest();
        const slot2 = Object.keys(d.tournaments[code].players).filter(i => before2.indexOf(i) === -1)[0];
        await j.goto(journeyUrl('tournament.html', 'tourney=' + code), 2400);
        await j.evaluate(`(() => {
            const r = Array.from(document.querySelectorAll('#player-field-list .fa-row'))
                .find(x => (x.innerHTML || '').indexOf("'${slot2}'") !== -1);
            if (!r) return false;
            const i = r.querySelectorAll('input')[1];
            i.value = '12'; i.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        })()`);
        d = await j.harvest();
        ui.numberedFirst = d.tournaments[code].players[slot2];
    } finally {
        await j.close();
    }

    const t42 = {
        writtenWithNoHandicapValue: !!ui.written && ui.written.handicap === undefined,
        writtenWithADeclaredMarker: !!ui.written && ui.written.handicapPending === true,
        namingDoesNotGiveAHandicap: !!ui.afterNaming
            && ui.afterNaming.name === 'Named Later'
            && ui.afterNaming.handicapPending === true
            && ui.afterNaming.handicap === undefined,
        numberingClearsThePendingMarker: !!ui.afterNumbering
            && ui.afterNumbering.handicap === '0'
            && ui.afterNumbering.handicapPending === undefined,
        control_aRealZeroIsAcceptedAsANumber: !!ui.afterNumbering
            && ui.afterNumbering.handicap === '0',
        numberingDoesNotName: !!ui.numberedFirst
            && ui.numberedFirst.handicap === '12'
            && ui.numberedFirst.unnamed === true
            && ui.numberedFirst.handicapPending === undefined,
        control_bothTogetherLeaveNoMarkers: !!ui.afterNumbering
            && ui.afterNumbering.unnamed === undefined
            && ui.afterNumbering.handicapPending === undefined,
    };
    Object.keys(t42).forEach(k => { if (!t42[k]) problems.push('TEST 42 ' + k + ': FAILED'); });

    const t43 = {
        fieldHeaderStillCountsIt: /3 golfers/.test(onNet.fieldHeader || ''),
        poolStillCountsIt: /900/.test(onNet.pool || ''),
        payoutSubStillCountsIt: /3 golfers/.test(onNet.payoutSub || ''),
        stillInTheGroupAndCarded: netCard.slotInputs === 18 && netCard.inputs === 54,
        stillWithdrawable: (onNet.fieldRows || [])
            .every(r => (r.controls || []).some(c => /withdraw/i.test(c))),
    };
    Object.keys(t43).forEach(k => { if (!t43[k]) problems.push('TEST 43 ' + k + ': FAILED'); });

    const report = {
        handComputed: { net: HAND_NET, gross: HAND_GROSS,
                        onceNumberedNine: HAND_ORDER_ONCE_NUMBERED },
        TEST_40_absent_not_zero: {
            netBoard: onNet.board, assertions: t40,
        },
        TEST_41_the_net_board: {
            pendingRow: slotNet, grossRow: slotGross,
            boardOnceNumbered: onNumbered.board,
            card: netCard, assertions: t41,
        },
        TEST_42_naming_and_numbering: {
            written: ui.written, afterNaming: ui.afterNaming,
            afterNumbering: ui.afterNumbering, numberedFirst: ui.numberedFirst,
            assertions: t42,
        },
        TEST_43_everything_else: {
            fieldHeader: onNet.fieldHeader, pool: onNet.pool,
            fieldRows: onNet.fieldRows, assertions: t43,
        },
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
