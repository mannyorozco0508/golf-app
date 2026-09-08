#!/usr/bin/env node
// ============================================================================
// A PAID ENTRY THAT IS NOT YET A PERSON.
//
// A captain pays for four and names one. saveTournament drops the other three
// before the write - `.filter(v => v.length > 0)` - and wave 15 found no
// placeholder concept anywhere in the product. So the money exists and the
// three competitors do not: not in the field, not in a group, not on a board.
//
// An unnamed entry is a real competitor slot with no name yet. It is NOT a
// withdrawn golfer and NOT a blank string - it is DECLARED, the same way
// withdrawal is, because "no name" inferred from an empty string is
// indistinguishable from an organizer tabbing past a box.
//
// TEST 36  the field can hold one, and a genuinely empty box still is not one
// TEST 37  naming it later keeps the same record and the same id
// TEST 38  it behaves everywhere a named golfer does
// TEST 39  it counts, because it was paid for
//
//   node tools/tournament-unnamed-entry-check.js
//
//   exit 0   a paid slot can exist before it has a name
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { openJourney, fileUrl: journeyUrl } = require('./lib/journey.js');
const F = require('./lib/tournament-fixtures.js');

const COURSE = [];
for (let i = 1; i <= 18; i++) COURSE.push({ hole: i, par: 4, hcpIndex: i });
const REAL_COURSE = { id: 'trueblue', name: 'True Blue Golf Club' };

// A hand-written event carrying one unnamed entry beside two named golfers, so
// the board, the counts and the card can be read without driving the UI first.
function mixedField(opts) {
    const o = opts || {};
    const f = F.playerField([
        { name: 'Named', handicap: '0' },
        { name: 'Other', handicap: '0' },
    ]);
    const slotId = F.newPlayerId();
    f.players[slotId] = { id: slotId, name: '', handicap: '0', addedAt: 3, unnamed: true };
    const ids = Object.keys(f.players);
    const scores = {};
    scores[f.byName.Named + '_h1'] = 4;
    for (let h = 1; h <= 18; h++) {
        scores[f.byName.Named + '_h' + h] = 3;      // 54, -18
        scores[f.byName.Other + '_h' + h] = 5;      // 90, +18
        scores[slotId + '_h' + h] = 4;              // 72, level
    }
    const groups = {};
    const g = F.scoringGroup('Group 1', ids, 1);
    groups[g.id] = g;
    return {
        record: F.eventRecord({
            name: 'Club Championship', format: 'individual',
            scoringMode: o.mode || 'gross',
            courseName: 'True Blue', activeCourseKey: 't', courseData: COURSE,
            entryFee: 300, players: f.players, scoringGroups: groups, scores: scores,
        }),
        slotId: slotId, groupId: g.id, byName: f.byName,
    };
}

const CAPTURE = `
(function () {
  window.__writes = []; window.__alerts = [];
  window.alert = function (m) { window.__alerts.push(String(m)); };
  window.print = function () {};
  var realDb = window.firebase && window.firebase.database;
  if (!realDb) return;
  window.firebase.database = function () {
    var d = realDb.apply(this, arguments); var rr = d.ref;
    d.ref = function (p) {
      var r = rr.call(d, p);
      ['set', 'update', 'remove'].forEach(function (op) { var fn = r[op];
        r[op] = function (v) {
          window.__writes.push({ op: op, path: String(p),
            value: (function () { try { return JSON.stringify(v); } catch (e) { return '?'; } })() });
          return fn.apply(r, arguments); }; });
      return r; };
    return d; };
})();`;

const BOARD = `
(() => {
  const clean = t => String(t || '').replace(/\\([^)]*\\)/g, '').replace(/\\s+/g, ' ').trim();
  const rows = Array.from(document.querySelectorAll('#leaderboard-list .lb-row')).slice(1);
  return JSON.stringify({
    board: rows.map(r => ({
      rank: clean(r.querySelector('.lb-pos') && r.querySelector('.lb-pos').textContent),
      name: clean(r.querySelector('.lb-team') && r.querySelector('.lb-team').textContent),
      toPar: clean(r.querySelector('.lb-score') && r.querySelector('.lb-score').textContent),
    })),
    fieldHeader: (document.getElementById('player-field-list').innerText || '')
        .split('\\n')[0].trim(),
    pool: (document.getElementById('manage-t-pool').innerText || '').trim(),
    payoutSub: (document.getElementById('payout-pool-sub').innerText || '').trim(),
    flights: (document.getElementById('flights-list').innerText || '')
        .replace(/\\s+/g, ' ').trim(),
    fieldRows: Array.from(document.querySelectorAll('#player-field-list .fa-row'))
        .map(r => {
          const i = r.querySelector('input');
          const b = Array.from(r.querySelectorAll('button')).map(x => (x.textContent || '').trim());
          return { value: i ? i.value : null,
                   placeholder: i ? (i.getAttribute('placeholder') || '') : null,
                   controls: b };
        }),
  });
})()`;

function bail(msg) {
    console.error('tournament-unnamed-entry-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

module.exports = { mixedField: mixedField, BOARD: BOARD, CAPTURE: CAPTURE };

if (require.main !== module) return;

(async () => {
    const problems = [];
    const gross = mixedField({});
    const net = mixedField({ mode: 'net' });
    const db = { tournaments: { EV: gross.record, NET: net.record }, trips: {} };

    const cold = async (code, expression) => {
        const r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=' + code),
            db, expression, preScript: CAPTURE, settleMs: 4200,
            blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        return g;
    };

    const view = await cold('EV', BOARD);
    const cardProbe = `
      (() => {
        const ins = Array.from(document.querySelectorAll('#holes-list input'));
        return JSON.stringify({
          inputs: ins.length,
          slotHasInputs: ins.filter(i =>
              (i.getAttribute('onchange') || '').indexOf("'${gross.slotId}'") !== -1).length,
          roster: (document.getElementById('team-roster').innerText || '')
              .replace(/\\s+/g, ' ').trim(),
        });
      })()`;
    const r = await arriveCold({
        url: fileUrl('tournament-scorecard.html', 'tourney=EV&group=' + gross.groupId),
        db, expression: cardProbe, preScript: CAPTURE, settleMs: 4200,
        blockUrls: ['*qrcode.min.js'] });
    if (!r.ok) bail(r.reason);
    const card = JSON.parse(r.value);

    // --- TEST 36 + 37: through the real UI, with state ---------------------
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
        // TWO named, TWO deliberately left blank - the control for Test 36.
        await j.evaluate(`(() => {
            const ins = document.querySelectorAll('#teams-list .team-name-inputs input');
            ['Captain', 'Partner'].forEach((n, i) => { if (ins[i]) ins[i].value = n; });
            return ins.length;
        })()`);
        await j.click('#setup-screen button.btn-primary', /saveTournament/, { settleMs: 2600 });
        let dbNow = await j.harvest();
        const code = Object.keys(dbNow.tournaments)[0];
        ui.playersAfterSave = Object.keys(dbNow.tournaments[code].players || {}).length;
        ui.namesAfterSave = Object.values(dbNow.tournaments[code].players || {})
            .map(p => p.name);

        await j.goto(journeyUrl('tournament.html', 'tourney=' + code), 2600);
        const before = Object.keys((await j.harvest()).tournaments[code].players || {});
        ui.unnamedControlFound = await j.evaluate(`(() => {
            const b = Array.from(document.querySelectorAll('#player-field-section button'))
                .find(x => /addUnnamedEntry/.test(x.getAttribute('onclick') || ''));
            if (!b || b.getClientRects().length === 0) return false;
            b.click(); return true;
        })()`);
        dbNow = await j.harvest();
        const after = Object.keys(dbNow.tournaments[code].players || {});
        const slot = after.filter(id => before.indexOf(id) === -1)[0];
        ui.slotId = slot || null;
        ui.slotRecord = slot ? dbNow.tournaments[code].players[slot] : null;
        ui.namedRecordForComparison = dbNow.tournaments[code].players[before[0]];

        if (slot) {
            // Give it some scores, then name it - both must survive.
            await j.evaluate(`(() => {
                const t = window.firebase.database().ref('tournaments/${code}/scores/${slot}_h1');
                t.set(4); return true;
            })()`);
            await j.goto(journeyUrl('tournament.html', 'tourney=' + code), 2400);
            ui.named = await j.evaluate(`(() => {
                const row = Array.from(document.querySelectorAll('#player-field-list .fa-row'))
                    .find(r => (r.innerHTML || '').indexOf("'${slot}'") !== -1);
                if (!row) return false;
                const input = row.querySelector('input');
                input.value = 'Late Guest';
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            })()`);
            dbNow = await j.harvest();
            const rec = dbNow.tournaments[code].players[slot];
            ui.afterNaming = rec || null;
            ui.idIsTheSameOne = !!rec && rec.id === slot;
            ui.scoresSurvived = Object.keys(dbNow.tournaments[code].scores || {})
                .filter(k => k.indexOf(slot + '_') === 0).length;
            // CONTROL: a freshly added golfer must get a DIFFERENT id, which is
            // what proves the probe can see a re-mint at all.
            await j.evaluate(`(() => {
                document.getElementById('new-player-name').value = 'Fresh';
                const b = Array.from(document.querySelectorAll('#player-field-section button'))
                    .find(x => /addPlayerToField/.test(x.getAttribute('onclick') || ''));
                if (b) b.click(); return !!b;
            })()`);
            dbNow = await j.harvest();
            const freshId = Object.keys(dbNow.tournaments[code].players)
                .find(id => dbNow.tournaments[code].players[id].name === 'Fresh');
            ui.freshId = freshId || null;
            ui.freshIsDifferent = !!freshId && freshId !== slot;
        }
    } finally {
        await j.close();
    }

    // --- assertions --------------------------------------------------------
    if (view.board.length === 0) bail('the leaderboard rendered no rows - nothing measured');

    const slotRow = view.board.find(r => /unnamed/i.test(r.name));
    const namedRow = view.board.find(r => r.name === 'Named');

    const t36 = {
        control_blankBoxesStillDropped: ui.playersAfterSave === 2,
        control_onlyTheTypedNamesWereWritten:
            JSON.stringify((ui.namesAfterSave || []).slice().sort())
            === JSON.stringify(['Captain', 'Partner']),
        theControlExists: ui.unnamedControlFound === true,
        itWritesAPlayerRecord: !!ui.slotRecord,
        recordIsDeclaredUnnamed: !!ui.slotRecord && ui.slotRecord.unnamed === true,
        // RE-PINNED, wave 17. The shape deliberately changed: an unnamed entry
        // now carries NO handicap value, because '0' entered an unknown person
        // as a scratch golfer on a net board. It still matches the other
        // writers on everything that is not the missing number, and the absence
        // is declared rather than left to be inferred.
        recordMatchesTheOtherWriters: !!ui.slotRecord
            && ['id', 'name', 'addedAt'].every(k => ui.slotRecord[k] !== undefined),
        handicapIsAbsentAndDeclaredSo: !!ui.slotRecord
            && ui.slotRecord.handicap === undefined
            && ui.slotRecord.handicapPending === true,
        nameIsEmptyNotMissing: !!ui.slotRecord && ui.slotRecord.name === '',
    };
    Object.keys(t36).forEach(k => { if (!t36[k]) problems.push('TEST 36 ' + k + ': FAILED'); });

    const t37 = {
        namingKeepsTheSameId: ui.idIsTheSameOne === true,
        namingClearsTheMarker: !!ui.afterNaming && ui.afterNaming.unnamed === undefined,
        theNameStuck: !!ui.afterNaming && ui.afterNaming.name === 'Late Guest',
        scoresSurvivedNaming: ui.scoresSurvived === 1,
        control_aFreshGolferGetsADifferentId: ui.freshIsDifferent === true,
    };
    Object.keys(t37).forEach(k => { if (!t37[k]) problems.push('TEST 37 ' + k + ': FAILED'); });

    const t38 = {
        appearsOnTheBoard: !!slotRow,
        hasAPlaceholderLabel: !!slotRow && /unnamed/i.test(slotRow.name),
        isRanked: !!slotRow && /^[0-9]+$/.test(slotRow.rank || ''),
        canBeInAGroup: card.slotHasInputs === 18,
        // The slot has eighteen scored holes in this fixture, so wave 13's rule
        // applies to it exactly as to anybody else: a result is withdrawn, not
        // deleted. Read off the row's own controls.
        canBeWithdrawnLikeAnyone: (view.fieldRows || [])
            .filter(r => /name to come/i.test(r.placeholder || ''))
            .every(r => (r.controls || []).some(c => /withdraw/i.test(c))),
        control_aNamedGolferOffersTheSameControl: (view.fieldRows || [])
            .filter(r => !/name to come/i.test(r.placeholder || ''))
            .every(r => (r.controls || []).some(c => /withdraw/i.test(c))),
        control_aNamedGolferIsAlsoRankedAndCarded:
            !!namedRow && /^[0-9]+$/.test(namedRow.rank || '') && card.inputs === 54,
    };
    Object.keys(t38).forEach(k => { if (!t38[k]) problems.push('TEST 38 ' + k + ': FAILED'); });

    const t39 = {
        fieldHeaderCountsIt: /3 golfers/.test(view.fieldHeader || ''),
        poolCountsIt: /900/.test(view.pool || ''),
        payoutSubCountsIt: /3 golfers/.test(view.payoutSub || ''),
    };
    Object.keys(t39).forEach(k => { if (!t39[k]) problems.push('TEST 39 ' + k + ': FAILED'); });

    const report = {
        TEST_36_the_field_holds_one: {
            setupFormWithTwoBlankBoxes: { playersWritten: ui.playersAfterSave,
                                          names: ui.namesAfterSave },
            unnamedRecordWritten: ui.slotRecord,
            aNamedRecordForComparison: ui.namedRecordForComparison,
            assertions: t36,
        },
        TEST_37_naming_keeps_the_record: {
            idBefore: ui.slotId, recordAfterNaming: ui.afterNaming,
            scoreKeysUnderThatId: ui.scoresSurvived,
            control_freshlyAddedGolferId: ui.freshId,
            assertions: t37,
        },
        TEST_38_behaves_everywhere: {
            board: view.board, cardInputs: card.inputs,
            slotInputsOnTheCard: card.slotHasInputs, roster: card.roster,
            fieldRows: view.fieldRows,
            assertions: t38,
        },
        TEST_39_it_counts: {
            fieldHeader: view.fieldHeader, pool: view.pool,
            payoutSub: view.payoutSub, flights: view.flights,
            assertions: t39,
        },
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
