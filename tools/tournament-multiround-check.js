#!/usr/bin/env node
// ============================================================================
// THE ROUNDS SUBSYSTEM, WRITTEN BY THE APP FOR THE FIRST TIME.
//
// eventModel and rounds are written in exactly one place - saveTournament -
// gated on isMultiRoundSetup, which is set only by #multi-round-toggle, which
// lives on the screen the save button is not on. So no code path has ever
// written them, createRound and setRoundStatus have never run, and every
// multi-round result this project has reported was measured on a record the
// app could not produce.
//
// TEST 23  the toggle is reachable, and the payload it produces is recorded
//          rather than inferred
// TEST 24  createRound and setRoundStatus execute for the first time, and what
//          they actually write is diffed field for field against wave 8's
//          fixtures - which were a careful guess and are now checkable
// TEST 25  the three latent bugs wave 0 predicted, measured on a real record.
//          Wave 9 recorded them present; wave 10 fixed them, and these
//          assertions were flipped to demand the repair rather than deleted.
//
//   node tools/tournament-multiround-check.js
//
//   exit 0   the toggle writes what it should and the writers match the guess
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { openJourney, fileUrl: journeyUrl } = require('./lib/journey.js');
const F = require('./lib/tournament-fixtures.js');

const COURSE = { id: 'trueblue', name: 'True Blue Golf Club' };

// --- TEST 23: cold arrival, real taps only ---------------------------------
const PROBE_TOGGLE = `
(() => {
  const vis = el => !!el && el.getClientRects().length > 0;
  const t = () => document.getElementById('multi-round-toggle');
  const snap = () => ({ visible: vis(t()), checked: !!(t() && t().checked) });
  const out = { onArrival: snap() };
  if (t() && vis(t())) {
    t().click(); out.afterOn = snap();
    t().click(); out.afterOff = snap();
    t().click(); out.afterOnAgain = snap();
  }
  // The save button must be on the SAME screen, or the flag can never be read.
  const save = Array.from(document.querySelectorAll('button'))
      .find(b => /saveTournament/.test(b.getAttribute('onclick') || ''));
  out.saveButtonVisible = vis(save);
  return JSON.stringify(out);
})()`;

// Builds an event through the page's own controls and returns everything it
// wrote. Nothing is inferred - the record comes back out of the database.
async function createThroughUI(o) {
    const opts = o || {};
    const j = await openJourney({ db: { tournaments: {}, trips: {}, global_courses: {} } });
    try {
        await j.goto(journeyUrl('tournament.html', ''), 2600);
        if (opts.individual) await j.click('#fmt-individual', null, { settleMs: 300 });
        await j.evaluate(`(() => {
            const s = document.getElementById('course-search-input');
            s.value = ${JSON.stringify(COURSE.name)};
            s.dispatchEvent(new Event('input', { bubbles: true }));
            const o = Array.from(document.querySelectorAll('#course-dropdown .custom-select-option'))
                .find(x => (x.getAttribute('onclick') || '').indexOf("'${COURSE.id}'") !== -1);
            if (o) o.click();
            return !!o;
        })()`);
        if (opts.individual && opts.net) {
            await j.evaluate(`(() => {
                const r = document.querySelector('input[name="ind-mode"][value="net"]');
                if (r && r.getClientRects().length) { r.click(); return true; }
                return false;
            })()`);
        }
        const toggled = await j.evaluate(`(() => {
            const t = document.getElementById('multi-round-toggle');
            if (!t || t.getClientRects().length === 0) return false;
            ${opts.multiRound ? 't.click();' : ''}
            return true;
        })()`);
        await j.evaluate(`(() => {
            const names = ${JSON.stringify(opts.names || ['Ace', 'Bogey', 'Cal'])};
            const ins = document.querySelectorAll('#teams-list .team-name-inputs input');
            names.forEach((n, i) => { if (ins[i]) ins[i].value = n; });
            return ins.length;
        })()`);
        await j.click('#setup-screen button.btn-primary', /saveTournament/, { settleMs: 2600 });
        const db = await j.harvest();
        const code = Object.keys(db.tournaments || {})[0];
        return { j, code, record: code ? db.tournaments[code] : null, toggleWasReachable: toggled };
    } catch (e) {
        await j.close();
        throw e;
    }
}

const typeOf = v => Array.isArray(v) ? 'array'
    : (v === null ? 'null' : (v && typeof v === 'object' ? 'object' : typeof v));

function diffShape(actual, expected) {
    const a = Object.keys(actual || {}).sort(), e = Object.keys(expected || {}).sort();
    return {
        onlyInActual: a.filter(k => e.indexOf(k) === -1),
        onlyInFixture: e.filter(k => a.indexOf(k) === -1),
        typeMismatches: a.filter(k => e.indexOf(k) !== -1
            && typeOf(actual[k]) !== typeOf(expected[k]))
            .map(k => k + ': real=' + typeOf(actual[k]) + ' fixture=' + typeOf(expected[k])),
    };
}

function bail(msg) {
    console.error('tournament-multiround-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

module.exports = { PROBE_TOGGLE: PROBE_TOGGLE };

if (require.main !== module) return;

(async () => {
    const problems = [];

    // --- TEST 23 ------------------------------------------------------------
    const cold = await arriveCold({ url: fileUrl('tournament.html', ''),
        db: { tournaments: {}, trips: {}, global_courses: {} }, expression: PROBE_TOGGLE,
        preScript: 'window.alert=function(){};', settleMs: 3200,
        blockUrls: ['*qrcode.min.js'] });
    if (!cold.ok) bail(cold.reason);
    const toggle = JSON.parse(cold.value);

    const multi = await createThroughUI({ multiRound: true, individual: true });
    const single = await createThroughUI({ multiRound: false, individual: true });

    const t23 = {
        toggleOnTheSaveScreen: toggle.onArrival.visible === true,
        saveButtonOnTheSameScreen: toggle.saveButtonVisible === true,
        control_tracksOnOffOn: !!(toggle.afterOn && toggle.afterOn.checked === true
            && toggle.afterOff && toggle.afterOff.checked === false
            && toggle.afterOnAgain && toggle.afterOnAgain.checked === true),
        writesEventModel: multi.record && multi.record.eventModel === 'round-v1',
        writesARoundsNode: !!(multi.record && multi.record.rounds
            && Object.keys(multi.record.rounds).length === 1),
        control_untoggledWritesNoEventModel:
            !!(single.record && single.record.eventModel === undefined),
        control_untoggledWritesNoRounds:
            !!(single.record && single.record.rounds === undefined),
    };
    Object.keys(t23).forEach(k => { if (!t23[k]) problems.push('TEST 23 ' + k + ': FAILED'); });

    if (!t23.writesARoundsNode) {
        // Everything below needs a real multi-round record. Say so rather than
        // reporting a wall of failures that all have one cause.
        await multi.j.close(); await single.j.close();
        console.log(JSON.stringify({
            TEST_23_toggle: { coldArrival: toggle, multiRecordKeys: multi.record
                ? Object.keys(multi.record).sort() : null, assertions: t23 },
            TEST_24: 'SKIPPED - no rounds node was written, so the writers never ran',
            TEST_25: 'SKIPPED - same reason',
            problems: problems, verdict: 'FAIL',
        }, null, 2));
        process.exit(1);
    }

    // --- TEST 24: the real writers -----------------------------------------
    const j = multi.j;
    const code = multi.code;
    await j.goto(journeyUrl('tournament.html', 'tourney=' + code), 2600);

    // + Add Round, twice: the first round came from the save, so this makes 3.
    await j.click('#rounds-section button.btn-outline', /createRound/, { settleMs: 900 });
    let db = await j.harvest();
    const rounds = db.tournaments[code].rounds;
    const ids = Object.keys(rounds).sort((a, b) => rounds[a].createdAt - rounds[b].createdAt);
    const firstRound = rounds[ids[0]];          // written by saveTournament
    const addedRound = rounds[ids[ids.length - 1]];  // written by createRound

    // Open round one, which is what takes the handicap snapshot.
    await j.evaluate(`(() => {
        const b = Array.from(document.querySelectorAll('#rounds-list button'))
            .find(x => /setRoundStatus\\('${ids[0]}', 'open'\\)/.test(x.getAttribute('onclick') || ''));
        if (b) b.click();
        return !!b;
    })()`);
    db = await j.harvest();
    const opened = db.tournaments[code].rounds[ids[0]];

    // The wave-8 fixtures, for comparison.
    const fixtureRound = F.roundRecord({ name: 'Round 1' });
    const fixtureOpen = F.openRound(fixtureRound, db.tournaments[code].players || {});

    const t24 = {
        createRound_matchesTheFixtureShape:
            diffShape(addedRound, fixtureRound).onlyInActual.length === 0
            && diffShape(addedRound, fixtureRound).onlyInFixture.length === 0,
        saveTournamentFirstRound_matchesTheFixtureShape:
            diffShape(firstRound, fixtureRound).onlyInActual.length === 0
            && diffShape(firstRound, fixtureRound).onlyInFixture.length === 0,
        openWritesAHandicapSnapshot: !!(opened && opened.handicaps),
        openedRound_matchesTheFixtureShape:
            diffShape(opened, fixtureOpen).onlyInActual.length === 0
            && diffShape(opened, fixtureOpen).onlyInFixture.length === 0,
    };
    Object.keys(t24).forEach(k => { if (!t24[k]) problems.push('TEST 24 ' + k + ': FAILED'); });

    // --- TEST 25: the three known bugs, measured on a real record -----------
    //
    // A print sheet with no scores on it proves nothing if the screen has none
    // either, so the event is scored through the UI first. Getting there needs
    // a group on round one - and reaching THAT is where bug 3 shows itself.

    // BUG 3, measured on the way past: tapping Edit sets editingRoundId and
    // re-renders the rounds list, but renderScoringGroups runs only from the
    // Firebase listener, so the panel keeps telling the organizer to do the
    // thing they just did.
    const editPanel = await j.evaluate(`(() => {
        const before = (document.getElementById('scoring-groups-list').innerText || '').trim();
        const edit = Array.from(document.querySelectorAll('#rounds-list button'))
            .find(b => /editRound/.test(b.getAttribute('onclick') || ''));
        if (edit) edit.click();
        const after = (document.getElementById('scoring-groups-list').innerText || '').trim();
        return JSON.stringify({ editFound: !!edit, before: before.slice(0, 80),
            afterTappingEdit: after.slice(0, 80), changed: before !== after });
    })()`);

    // The workaround an organizer stumbles into: ANY write refreshes it. A
    // rename is the least destructive one available.
    await j.evaluate(`(() => {
        const input = document.querySelector('#rounds-list input.flight-name-input');
        if (!input) return false;
        input.value = 'Round 1';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);
    const panelAfterAWrite = await j.evaluate(
        `(document.getElementById('scoring-groups-list').innerText || '').trim().slice(0, 60)`);

    await j.click('#scoring-groups-section button.btn-outline', /createScoringGroup/, { settleMs: 900 });
    await j.evaluate(`(() => {
        const sels = Array.from(document.querySelectorAll('#scoring-groups-list select'));
        sels.forEach(s => { const o = Array.from(s.options).find(x => x.value);
            if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } });
        return sels.length;
    })()`);
    const groupLink = await j.evaluate(`(() => {
        const a = document.querySelector('#scoring-groups-list a');
        return a ? a.getAttribute('href') : null;
    })()`);
    if (!groupLink) bail('no round-scoped group link was produced - Test 25 cannot score');
    const q = groupLink.slice(groupLink.indexOf('?') + 1);

    // Score the round on the golfer's own card, and read its leaderboard tab
    // while we are there - that is bug 2.
    await j.goto(journeyUrl('tournament-scorecard.html', q), 2600);
    const cardSide = await j.evaluate(`(() => {
        const ins = Array.from(document.querySelectorAll('#holes-list input'));
        ins.forEach(el => { el.value = '5'; el.dispatchEvent(new Event('change', { bubbles: true })); });
        document.getElementById('tab-btn-leaderboard').click();
        const rows = Array.from(document.querySelectorAll('#leaderboard-list .lb-row')).slice(1)
            .map(r => (r.innerText || '').replace(/\\s+/g, ' ').trim());
        return JSON.stringify({ inputsScored: ins.length, golferBoard: rows,
            golferBoardRowsWithAScore: rows.filter(r => !/\\u2014/.test(r)).length });
    })()`);
    const card = JSON.parse(cardSide);

    // Back to the organizer: the screen should now show the round's scores, and
    // the printed sheet should not.
    await j.goto(journeyUrl('tournament.html', 'tourney=' + code), 2600);
    const print = await j.evaluate(`(() => {
        window.print = function () {};
        const btn = Array.from(document.querySelectorAll('#lb-round-filter button'))
            .find(b => (b.innerText || '').trim() !== 'Event');
        if (btn) btn.click();
        const board = Array.from(document.querySelectorAll('#leaderboard-list .lb-row')).slice(1)
            .map(r => (r.innerText || '').replace(/\\s+/g, ' ').trim());
        const b = Array.from(document.querySelectorAll('button'))
            .find(x => /printTournamentResults/.test(x.getAttribute('onclick') || ''));
        if (b) b.click();
        const v = document.getElementById('tournament-print-view');
        const rows = Array.from(v.querySelectorAll('tr')).slice(1);
        return JSON.stringify({ onScreenBoard: board,
            onScreenRowsWithAScore: board.filter(r => !/\\u2014/.test(r)).length,
            printRows: rows.length,
            printRowsWithAScore: rows.filter(r => !/\\u2014/.test(r.innerText)).length });
    })()`);
    const printJson = JSON.parse(print), editJson = JSON.parse(editPanel);

    // WAVE 9 RECORDED THESE THREE AS PRESENT. WAVE 10 FIXED THEM, so the
    // assertions are flipped rather than deleted: the measurements stay, and
    // what they demand is now the repaired behaviour. If any of them regresses,
    // this goes red on the same reading that first caught it.
    const t25 = {
        bug1_fixed_printSheetHasTheScores: printJson.printRowsWithAScore > 0,
        control_theOnScreenBoardDoesHaveScores: printJson.onScreenRowsWithAScore > 0,
        bug1_fixed_printMatchesTheScreen:
            printJson.printRowsWithAScore === printJson.onScreenRowsWithAScore,
        bug2_fixed_golferLeaderboardTabHasTheScores: card.golferBoardRowsWithAScore > 0,
        control_theGolferDidScoreTheRound: card.inputsScored > 0,
        bug3_fixed_editRevealsTheGroups: editJson.changed === true,
        control_theEditButtonWasThere: editJson.editFound === true,
        // Still true after the fix, and still worth holding: any write also
        // refreshes the panel. It reads "No groups yet." here because none exist.
        control_aWriteAlsoRevealsThem:
            !/Pick a round above/i.test(panelAfterAWrite || ''),
    };
    Object.keys(t25).forEach(k => { if (!t25[k]) problems.push('TEST 25 ' + k + ': FAILED'); });

    const report = {
        TEST_23_toggle_reachable: {
            coldArrival: toggle,
            multiRoundRecordKeys: Object.keys(multi.record).sort(),
            eventModel: multi.record.eventModel,
            roundsWritten: Object.keys(multi.record.rounds || {}).length,
            control_singleRoundRecordKeys: Object.keys(single.record).sort(),
            assertions: t23,
        },
        TEST_24_the_real_writers: {
            createRound_actual: Object.keys(addedRound).sort(),
            fixture_expected: Object.keys(fixtureRound).sort(),
            diff_createRound_vs_fixture: diffShape(addedRound, fixtureRound),
            diff_saveTournamentFirstRound_vs_fixture: diffShape(firstRound, fixtureRound),
            openedRound_actual: Object.keys(opened).sort(),
            diff_opened_vs_fixture: diffShape(opened, fixtureOpen),
            handicapSnapshotWritten: opened.handicaps || null,
            assertions: t24,
        },
        TEST_25_the_three_bugs_now_fixed_wave10: {
            bug1_print: { onScreenBoard: printJson.onScreenBoard,
                          onScreenRowsWithAScore: printJson.onScreenRowsWithAScore,
                          printRows: printJson.printRows,
                          printRowsWithAScore: printJson.printRowsWithAScore },
            bug2_golfersLeaderboardTab: { link: groupLink,
                          inputsScored: card.inputsScored,
                          board: card.golferBoard,
                          rowsWithAScore: card.golferBoardRowsWithAScore },
            bug3_editRevealsGroups: Object.assign({}, editJson,
                          { panelAfterAnUnrelatedWrite: panelAfterAWrite }),
            assertions: t25,
        },
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    await j.close(); await single.j.close();
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
