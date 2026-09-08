#!/usr/bin/env node
// ============================================================================
// WHOSE ENTRY IS THIS, AND WHAT DOES THE CARD SAY ABOUT A HANDICAP NOBODY
// HAS SUPPLIED?
//
// TWO THINGS, both left over from earlier waves and both about a slot that has
// been paid for and not yet filled in.
//
// 1. THE ROSTER LIE. Wave 17 took "(0)" off the organizer's board for an entry
//    with no handicap. The golfer's own card still printed it -
//    `(${players[pid].handicap || 0})` - so the surface actually held during a
//    round was the one still claiming the unknown person plays off scratch.
//
// 2. THE PAYER LINK. Wave 15 found it missing and wave 16 could not fix the
//    resulting ambiguity: three entries bought by one captain all read
//    "Unnamed entry" and nothing recorded whose they were. That link is also
//    the thing a payment will eventually attach to.
//
// TEST 44  the card roster says pending, in the SAME WORDS as the board
// TEST 45  an entry records who bought it, and same-payer entries are told apart
// TEST 46  nothing else moved
//
//   node tools/tournament-payer-link-check.js
//
//   exit 0   the card tells the truth and an entry knows whose it is
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { openJourney, fileUrl: journeyUrl } = require('./lib/journey.js');
const F = require('./lib/tournament-fixtures.js');

const SI = [7, 15, 1, 11, 3, 17, 9, 5, 13, 8, 16, 2, 12, 4, 18, 10, 6, 14];
const COURSE = SI.map((si, i) => ({ hole: i + 1, par: 4, hcpIndex: si }));
const REAL_COURSE = { id: 'trueblue', name: 'True Blue Golf Club' };

// Scratch is a REAL zero and must keep reading "(0)" on every surface - the
// control that mattered in wave 17, now applied to the card as well.
function mixed(opts) {
    const o = opts || {};
    const f = F.playerField([
        { name: 'Scratch', handicap: '0' },
        { name: 'Eighteen', handicap: '18' },
    ]);
    const slotId = F.newPlayerId();
    f.players[slotId] = { id: slotId, name: '', addedAt: 3,
                          unnamed: true, handicapPending: true };
    if (o.payer) f.players[slotId].paidBy = o.payer;
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

// Three slots, one captain, so "distinguishable" has something to prove.
function foursome() {
    const f = F.playerField([{ name: 'Captain', handicap: '10' }]);
    const payer = { name: 'Captain Smith', contact: 'smith@example.com' };
    const slots = [];
    for (let i = 0; i < 3; i++) {
        const id = F.newPlayerId();
        f.players[id] = { id: id, name: '', addedAt: 10 + i,
                          unnamed: true, handicapPending: true, paidBy: payer };
        slots.push(id);
    }
    return {
        record: F.eventRecord({
            name: 'Member Guest', format: 'individual', scoringMode: 'gross',
            courseName: 'True Blue', activeCourseKey: 't', courseData: COURSE,
            entryFee: 300, players: f.players, scoringGroups: {}, scores: {},
        }),
        slots: slots, payer: payer,
    };
}

const CAPTURE = `
(function () {
  window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); };
  window.print = function () {};
})();`;

const ROSTER = `
(() => JSON.stringify({
  roster: (document.getElementById('team-roster').innerText || '')
      .replace(/\\s+/g, ' ').trim(),
  sub: (document.getElementById('event-sub').innerText || '').replace(/\\s+/g, ' ').trim(),
  inputs: document.querySelectorAll('#holes-list input').length,
}))()`;

const FIELD = `
(() => {
  const txt = el => String((el && el.textContent) || '').replace(/\\s+/g, ' ').trim();
  return JSON.stringify({
    fieldHeader: (document.getElementById('player-field-list').innerText || '')
        .split('\\n')[0].trim(),
    rows: Array.from(document.querySelectorAll('#player-field-list .fa-row'))
        .map(r => ({ text: (r.innerText || '').replace(/\\s+/g, ' ').trim(),
                     inputs: Array.from(r.querySelectorAll('input'))
                         .map(i => ({ value: i.value,
                                      placeholder: i.getAttribute('placeholder') || '' })) })),
    pool: (document.getElementById('manage-t-pool').innerText || '').trim(),
    payoutSub: (document.getElementById('payout-pool-sub').innerText || '').trim(),
    board: Array.from(document.querySelectorAll('#leaderboard-list .lb-row')).slice(1)
        .map(r => ({ rank: txt(r.querySelector('.lb-pos')),
                     label: txt(r.querySelector('.lb-team')),
                     toPar: txt(r.querySelector('.lb-score')) })),
  });
})()`;

function bail(msg) {
    console.error('tournament-payer-link-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// The WebKit runner builds the SAME fixtures from the SAME factories rather
// than retyping them, so the two engines answer one question.
function buildWorld() {
    const net = mixed({});
    const gross = mixed({ mode: 'gross' });
    const four = foursome();
    return { net: net, gross: gross, four: four,
             db: { tournaments: { NET: net.record, GROSS: gross.record,
                                  FOUR: four.record }, trips: {} } };
}

module.exports = { buildWorld, CAPTURE, ROSTER, FIELD };

if (require.main !== module) return;

(async () => {
    const problems = [];
    const world = buildWorld();
    const net = world.net, gross = world.gross, four = world.four, db = world.db;

    const cold = async (page, query, expression) => {
        const r = await arriveCold({ url: fileUrl(page, query), db, expression,
            preScript: CAPTURE, settleMs: 4200, blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        return g;
    };

    const netCard = await cold('tournament-scorecard.html',
        'tourney=NET&group=' + net.groupId, ROSTER);
    const grossCard = await cold('tournament-scorecard.html',
        'tourney=GROSS&group=' + gross.groupId, ROSTER);
    const netField = await cold('tournament.html', 'tourney=NET', FIELD);
    const fourField = await cold('tournament.html', 'tourney=FOUR', FIELD);

    if (!netCard.roster) bail('the card roster rendered nothing - nothing measured');
    if (netCard.inputs !== 54) bail('the card did not render 54 inputs');

    // THE BOARD'S WORDING, read off the board itself rather than retyped, so
    // "the same words" is checked against what the board actually says.
    const boardTag = (netField.board.find(r => /pending/i.test(r.label)) || {}).label || '';
    const boardPhrase = (boardTag.match(/\(([^)]*pending[^)]*)\)/i) || [])[1] || null;
    if (!boardPhrase) bail('the board is not showing a pending phrase to compare against');

    const t44 = {
        cardDoesNotSayZeroForAPendingEntry: !/\(0\)\s*$/.test(netCard.roster)
            && (netCard.roster.match(/\(0\)/g) || []).length === 1,
        cardSaysPending: new RegExp(boardPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
            .test(netCard.roster),
        control_aRealZeroStillReadsZero: /Scratch \(0\)/.test(netCard.roster),
        control_theEighteenIsUnchanged: /Eighteen \(18\)/.test(netCard.roster),
        control_grossRosterHasNoHandicapsAtAll: !/\(/.test(grossCard.roster),
    };
    Object.keys(t44).forEach(k => { if (!t44[k]) problems.push('TEST 44 ' + k + ': FAILED'); });

    // --- TEST 45: through the real UI --------------------------------------
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
            if (ins[0]) ins[0].value = 'Captain'; return ins.length;
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
        ui.beforeAnyPayer = d.tournaments[code].players[slot];

        // Record the buyer through whatever the row offers.
        await j.goto(journeyUrl('tournament.html', 'tourney=' + code), 2400);
        ui.payerControlsFound = await j.evaluate(`(() => {
            const r = Array.from(document.querySelectorAll('#player-field-list .fa-row'))
                .find(x => (x.innerHTML || '').indexOf("'${slot}'") !== -1);
            if (!r) return 0;
            const ins = Array.from(r.querySelectorAll('input'))
                .filter(i => /paidBy|payer/i.test(i.getAttribute('onchange') || ''));
            if (ins.length < 2) return ins.length;
            ins[0].value = 'Captain Smith';
            ins[0].dispatchEvent(new Event('change', { bubbles: true }));
            ins[1].value = 'smith@example.com';
            ins[1].dispatchEvent(new Event('change', { bubbles: true }));
            return ins.length;
        })()`);
        d = await j.harvest();
        ui.afterPayer = d.tournaments[code].players[slot];

        // Naming it must NOT clear the payer.
        await j.goto(journeyUrl('tournament.html', 'tourney=' + code), 2400);
        await j.evaluate(`(() => {
            const r = Array.from(document.querySelectorAll('#player-field-list .fa-row'))
                .find(x => (x.innerHTML || '').indexOf("'${slot}'") !== -1);
            if (!r) return false;
            const i = r.querySelectorAll('input')[0];
            i.value = 'Guest One'; i.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        })()`);
        d = await j.harvest();
        ui.afterNaming = d.tournaments[code].players[slot];
    } finally {
        await j.close();
    }

    const slotRows = fourField.rows.filter(r => /unnamed|name to come/i.test(r.text)
        || (r.inputs[0] && r.inputs[0].value === ''));
    const distinct = new Set(slotRows.map(r => r.text));

    const t45 = {
        theControlsExist: ui.payerControlsFound === 2,
        writesAStructuredPayer: !!ui.afterPayer && !!ui.afterPayer.paidBy
            && ui.afterPayer.paidBy.name === 'Captain Smith'
            && ui.afterPayer.paidBy.contact === 'smith@example.com',
        notInTheNameField: !!ui.afterPayer && ui.afterPayer.name === '',
        threeSamePayerEntriesAreDistinguishable:
            slotRows.length === 3 && distinct.size === 3,
        theyAllNameThePayer: slotRows.length === 3
            && slotRows.every(r => /Captain Smith/.test(r.text)),
        control_anEntryWithNoPayerIsUnchanged: !!ui.beforeAnyPayer
            && ui.beforeAnyPayer.paidBy === undefined
            && ui.beforeAnyPayer.unnamed === true
            && ui.beforeAnyPayer.handicapPending === true,
        control_namingDoesNotClearThePayer: !!ui.afterNaming
            && ui.afterNaming.name === 'Guest One'
            && !!ui.afterNaming.paidBy
            && ui.afterNaming.paidBy.name === 'Captain Smith',
    };
    Object.keys(t45).forEach(k => { if (!t45[k]) problems.push('TEST 45 ' + k + ': FAILED'); });

    const t46 = {
        boardUnchanged: JSON.stringify(netField.board.map(r => r.rank + ' ' + r.toPar))
            === JSON.stringify(['1 E', '2 +18', '- —']),
        poolUnchanged: /900/.test(netField.pool || ''),
        payoutSubUnchanged: /3 golfers/.test(netField.payoutSub || ''),
        fieldHeaderUnchanged: /3 golfers/.test(netField.fieldHeader || ''),
        cardStillCarded: netCard.inputs === 54,
        foursomePoolCountsAllFour: /1200/.test(fourField.pool || ''),
    };
    Object.keys(t46).forEach(k => { if (!t46[k]) problems.push('TEST 46 ' + k + ': FAILED'); });

    const report = {
        TEST_44_the_card_roster: {
            boardPhraseComparedAgainst: boardPhrase,
            netRoster: netCard.roster, grossRoster: grossCard.roster,
            assertions: t44,
        },
        TEST_45_the_payer_link: {
            beforeAnyPayer: ui.beforeAnyPayer, afterPayer: ui.afterPayer,
            afterNaming: ui.afterNaming,
            payerInputsOnTheRow: ui.payerControlsFound,
            threeSlotRows: slotRows.map(r => r.text),
            assertions: t45,
        },
        TEST_46_nothing_else_moved: {
            board: netField.board, pool: netField.pool,
            fieldHeader: netField.fieldHeader, foursomePool: fourField.pool,
            assertions: t46,
        },
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
