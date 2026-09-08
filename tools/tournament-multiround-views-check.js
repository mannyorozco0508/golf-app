#!/usr/bin/env node
// ============================================================================
// WHICH LEADERBOARD IS IN VIEW - ASKED ONCE, ANSWERED THREE PLACES.
//
// Two of wave 9's three bugs are ONE defect wearing two hats: the printed sheet
// and the golfer's Leaderboard tab both call
// computeTournamentLeaderboard(currentData) - the EVENT ROOT, which on a
// multi-round record holds no scores at all - while the board on the screen
// directly above each of them reads the round. So both render a full field with
// every score blank, next to a correct one.
//
// The third is smaller and separate: editRound() re-renders the rounds list and
// not the groups panel, so the panel keeps instructing the organizer to press
// the button they just pressed.
//
// TEST 26  the printed sheet, on a scored multi-round event
// TEST 27  the golfer's own Leaderboard tab, on a round-scoped link
// TEST 28  Edit reveals that round's groups, on the tap itself
//
// NOTHING IS MEASURED ON AN UNSCORED BOARD. An empty sheet proves nothing if
// the screen is empty too - wave 9 made exactly that mistake and its own
// control caught it - so every event here is scored through the real card
// before anything is read.
//
//   node tools/tournament-multiround-views-check.js
//
//   exit 0   every surface shows the round it claims to show
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { openJourney, fileUrl } = require('./lib/journey.js');

const COURSE = { id: 'trueblue', name: 'True Blue Golf Club' };
const NAMES = ['Ace', 'Bogey', 'Cal'];

const rowsOf = sel => `Array.from(document.querySelectorAll(${JSON.stringify(sel)}))
    .slice(1).map(r => (r.innerText || '').replace(/\\s+/g, ' ').trim())`;
const scored = 'rows => rows.filter(r => !/\\u2014/.test(r) && !/\\s-\\s/.test(r)).length';

// Creates an event through the page's own controls.
async function createEvent(j, opts) {
    await j.goto(fileUrl('tournament.html', ''), 2600);
    await j.click('#fmt-individual', null, { settleMs: 300 });
    await j.evaluate(`(() => {
        const s = document.getElementById('course-search-input');
        s.value = ${JSON.stringify(COURSE.name)};
        s.dispatchEvent(new Event('input', { bubbles: true }));
        const o = Array.from(document.querySelectorAll('#course-dropdown .custom-select-option'))
            .find(x => (x.getAttribute('onclick') || '').indexOf("'${COURSE.id}'") !== -1);
        if (o) o.click();
        return !!o;
    })()`);
    if (opts.multiRound) {
        await j.evaluate("(() => { const t = document.getElementById('multi-round-toggle');"
            + " if (t && t.getClientRects().length) { t.click(); return true; } return false; })()");
    }
    await j.evaluate(`(() => {
        const ins = document.querySelectorAll('#teams-list .team-name-inputs input');
        ${JSON.stringify(NAMES)}.forEach((n, i) => { if (ins[i]) ins[i].value = n; });
        return ins.length;
    })()`);
    await j.click('#setup-screen button.btn-primary', /saveTournament/, { settleMs: 2600 });
    const db = await j.harvest();
    // THE NEW ONE, not the first one. By the third event in a single session
    // Object.keys(...)[0] is whichever tournament was created FIRST, so the
    // "single round" control was silently pointing at the multi-round event.
    const after = Object.keys(db.tournaments || {});
    const added = after.filter(c => (opts.existing || []).indexOf(c) === -1);
    return added[added.length - 1] || null;
}

// Opens a round and builds its group. Returns the round-scoped link.
//
// TAPPING EDIT MAY NOT REVEAL THE PANEL - that is bug 3, and this helper has to
// survive it in order to measure the other two. When the panel does not follow
// the tap, one rename is issued, which is the workaround an organizer stumbles
// into; whether it was needed is reported rather than hidden.
async function openRoundAndBuildGroup(j, code, rid) {
    await j.goto(fileUrl('tournament.html', 'tourney=' + code), 2500);
    // ADDRESSED BY ID, NOT BY POSITION. Once round one is open its button reads
    // "Close round", so the second "Open for scoring" is no longer at index 1 -
    // a positional lookup silently opened nothing and produced no link.
    const opened = await j.evaluate(`(() => {
        const b = Array.from(document.querySelectorAll('#rounds-list button'))
            .find(x => (x.getAttribute('onclick') || '')
                .indexOf("setRoundStatus('${rid}', 'open')") !== -1);
        if (b) b.click();
        return !!b;
    })()`);

    const editTap = await j.evaluate(`(() => {
        const before = (document.getElementById('scoring-groups-list').innerText || '').trim();
        const b = Array.from(document.querySelectorAll('#rounds-list button'))
            .find(x => (x.getAttribute('onclick') || '').indexOf("editRound('${rid}')") !== -1);
        if (b) b.click();
        const after = (document.getElementById('scoring-groups-list').innerText || '').trim();
        return JSON.stringify({ tapped: !!b, panelFollowedTheTap: before !== after });
    })()`);
    const tap = JSON.parse(editTap);
    let workaroundNeeded = false;
    if (!tap.panelFollowedTheTap) {
        workaroundNeeded = true;
        await j.evaluate(`(() => {
            const rows = Array.from(document.querySelectorAll('#rounds-list .flight-row'));
            const row = rows.find(r => (r.innerHTML || '').indexOf("'${rid}'") !== -1);
            const i = row ? row.querySelector('input.flight-name-input') : null;
            if (!i) return false;
            i.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        })()`);
    }
    await j.click('#scoring-groups-section button.btn-outline', /createScoringGroup/, { settleMs: 900 });
    await j.evaluate(`(() => {
        const sels = Array.from(document.querySelectorAll('#scoring-groups-list select'));
        sels.forEach(s => { const o = Array.from(s.options).find(x => x.value);
            if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } });
        return sels.length;
    })()`);
    const link = await j.evaluate(
        "(() => { const a = document.querySelector('#scoring-groups-list a');"
        + " return a ? a.getAttribute('href') : null; })()");
    return { rid, link, opened, workaroundNeeded, editTapped: tap.tapped };
}

async function scoreCard(j, link, strokes) {
    const q = link.slice(link.indexOf('?') + 1);
    await j.goto(fileUrl('tournament-scorecard.html', q), 2500);
    return JSON.parse(await j.evaluate(`(() => {
        const ins = Array.from(document.querySelectorAll('#holes-list input'));
        ins.forEach(el => { el.value = '${strokes}'; el.dispatchEvent(new Event('change', { bubbles: true })); });
        document.getElementById('tab-btn-leaderboard').click();
        const rows = ${rowsOf('#leaderboard-list .lb-row')};
        return JSON.stringify({ inputs: ins.length, board: rows,
            rowsWithAScore: (${scored})(rows) });
    })()`));
}

// STRUCTURED CELLS, NOT ROW TEXT. The screen renders "1 Ace(tied) 18 +18" and
// the printed table renders the same result as "1Ace18+18" - comparing the two
// as strings fails on a sheet that is perfectly correct, which is how the
// single-round control failed its first run. Name and to-par are read out of
// their own elements on both sides and compared as pairs.
async function organiserView(j, code) {
    await j.goto(fileUrl('tournament.html', 'tourney=' + code), 2500);
    return JSON.parse(await j.evaluate(`(() => {
        window.print = function () {};
        // Any parenthesised marker - (tied), (incomplete) - is a badge, not part of
        // the name. Stripping the two by name left "Ace()" behind, which then failed
        // to match the printed "Ace" on a sheet that was correct.
        const clean = t => String(t || '').replace(/\\([^)]*\\)/g, '')
            .replace(/\\s+/g, ' ').trim();
        const screenPairs = () => Array.from(document.querySelectorAll('#leaderboard-list .lb-row'))
            .slice(1).map(r => ({
                name: clean(r.querySelector('.lb-team') && r.querySelector('.lb-team').textContent),
                toPar: clean(r.querySelector('.lb-score') && r.querySelector('.lb-score').textContent),
            }));
        const filter = Array.from(document.querySelectorAll('#lb-round-filter button'));
        const pick = filter.find(b => (b.innerText || '').trim() !== 'Event') || null;
        if (pick) pick.click();
        const board = screenPairs();
        const b = Array.from(document.querySelectorAll('button'))
            .find(x => /printTournamentResults/.test(x.getAttribute('onclick') || ''));
        if (b) b.click();
        const v = document.getElementById('tournament-print-view');
        const printPairs = Array.from(v.querySelectorAll('tr')).slice(1).map(tr => {
            const td = tr.querySelectorAll('td');
            return { name: clean(td[1] && td[1].textContent),
                     toPar: clean(td[3] && td[3].textContent) };
        });
        const hasScore = p => p.toPar && p.toPar !== '\u2014' && p.toPar !== '-';
        const sub = v.querySelector('p');
        return JSON.stringify({
            viewing: pick ? (pick.innerText || '').trim() : 'single round',
            onScreenBoard: board, onScreenScored: board.filter(hasScore).length,
            printBoard: printPairs, printScored: printPairs.filter(hasScore).length,
            printSubtitle: sub ? (sub.textContent || '').replace(/\\s+/g, ' ').trim() : null,
        });
    })()`));
}

function bail(msg) {
    console.error('tournament-multiround-views-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const problems = [];
    const j = await openJourney({ db: { tournaments: {}, trips: {}, global_courses: {} } });
    let report = {};
    try {
        // ---------- a scored MULTI-ROUND event, two rounds, different scores --
        const seen = [];
        const code = await createEvent(j, { multiRound: true, existing: seen.slice() });
        seen.push(code);
        if (!code) bail('no tournament was created');
        await j.goto(fileUrl('tournament.html', 'tourney=' + code), 2500);
        await j.click('#rounds-section button.btn-outline', /createRound/, { settleMs: 900 });

        const dbNow = await j.harvest();
        const rmap = dbNow.tournaments[code].rounds || {};
        const rids = Object.keys(rmap).sort((a, b) => rmap[a].createdAt - rmap[b].createdAt);
        if (rids.length < 2) bail('expected two rounds, found ' + rids.length);
        const r1 = await openRoundAndBuildGroup(j, code, rids[0]);
        const r2 = await openRoundAndBuildGroup(j, code, rids[1]);
        if (!r1.link || !r2.link) {
            bail('a round-scoped group link was not produced: '
                + JSON.stringify({ r1: r1, r2: r2 }));
        }

        const card1 = await scoreCard(j, r1.link, 5);   // round one: 90, +18 each
        const card2 = await scoreCard(j, r2.link, 4);   // round two: 72, E each
        if (!card1.inputs || !card2.inputs) bail('the cards took no scores');

        const org = await organiserView(j, code);

        // ---------- CONTROL: a SINGLE-ROUND event, scored ---------------------
        const single = await createEvent(j, { multiRound: false, existing: seen.slice() });
        seen.push(single);
        await j.goto(fileUrl('tournament.html', 'tourney=' + single), 2500);
        await j.click('#scoring-groups-section button.btn-outline', /createScoringGroup/, { settleMs: 900 });
        await j.evaluate(`(() => {
            const sels = Array.from(document.querySelectorAll('#scoring-groups-list select'));
            sels.forEach(s => { const o = Array.from(s.options).find(x => x.value);
                if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } });
            return sels.length;
        })()`);
        const singleLink = await j.evaluate(
            "(() => { const a = document.querySelector('#scoring-groups-list a');"
            + " return a ? a.getAttribute('href') : null; })()");
        if (!singleLink) bail('the single-round control produced no group link');
        const singleCard = await scoreCard(j, singleLink, 5);
        const singleOrg = await organiserView(j, single);

        // ---------- CONTROL: a multi-round event with NO scores at all --------
        const empty = await createEvent(j, { multiRound: true, existing: seen.slice() });
        seen.push(empty);
        const emptyOrg = await organiserView(j, empty);

        // ---------- TEST 28: Edit, with no other write --------------------------
        await j.goto(fileUrl('tournament.html', 'tourney=' + code), 2500);
        const edit = JSON.parse(await j.evaluate(`(() => {
            const panel = () => (document.getElementById('scoring-groups-list').innerText || '').trim();
            const dbBefore = JSON.stringify(window.__DB);
            const before = panel();
            const b = Array.from(document.querySelectorAll('#rounds-list button'))
                .find(x => /editRound/.test(x.getAttribute('onclick') || ''));
            if (b) b.click();
            const after = panel();
            const dbAfter = JSON.stringify(window.__DB);
            const label = b ? (b.innerText || '').trim() : null;
            // Tap it again - Done - and the panel must go back.
            const b2 = Array.from(document.querySelectorAll('#rounds-list button'))
                .find(x => /editRound/.test(x.getAttribute('onclick') || ''));
            if (b2) b2.click();
            const afterDone = panel();
            return JSON.stringify({ tapped: !!b, buttonSaidAfterTap: label,
                before: before.slice(0, 70), after: after.slice(0, 70),
                afterDone: afterDone.slice(0, 70),
                panelFollowedTheTap: before !== after,
                returnedOnDone: afterDone === before,
                // NO SNAPSHOT FIRED: if the database is byte-identical across the
                // tap, nothing was written, so the wave-9 workaround cannot be
                // what made this pass.
                databaseUnchanged: dbBefore === dbAfter });
        })()`));

        // --- assertions -----------------------------------------------------
        if (singleCard.rowsWithAScore === 0) {
            bail('the SINGLE-ROUND control card shows no scores either - it is supposed '
                + 'to be the surface that already worked, so nothing can be compared');
        }
        if (card1.inputs !== 54 || card2.inputs !== 54) {
            bail('a round card did not render 54 inputs - the fixtures are not what '
                + 'this check assumes');
        }

        const t26 = {
            printMatchesTheScreen:
                JSON.stringify(org.printBoard) === JSON.stringify(org.onScreenBoard),
            printHasTheScores: org.printScored > 0,
            control_theScreenHasScores: org.onScreenScored > 0,
            sheetNamesWhichRound: !!org.printSubtitle
                && (org.printSubtitle.indexOf(org.viewing) !== -1
                    || /event total/i.test(org.printSubtitle)),
            control_singleRoundSheetStillCorrect:
                JSON.stringify(singleOrg.printBoard) === JSON.stringify(singleOrg.onScreenBoard)
                && singleOrg.printScored > 0,
            control_unscoredEventStillPrintsEmpty: emptyOrg.printScored === 0,
        };
        Object.keys(t26).forEach(k => { if (!t26[k]) problems.push('TEST 26 ' + k + ': FAILED'); });

        const t27 = {
            roundOneCardShowsItsOwnScores: card1.rowsWithAScore === NAMES.length,
            roundTwoCardShowsItsOwnScores: card2.rowsWithAScore === NAMES.length,
            control_theTwoRoundsDiffer:
                JSON.stringify(card1.board) !== JSON.stringify(card2.board),
            control_singleRoundCardStillCorrect: singleCard.rowsWithAScore === NAMES.length,
        };
        Object.keys(t27).forEach(k => { if (!t27[k]) problems.push('TEST 27 ' + k + ': FAILED'); });

        const t28 = {
            panelFollowsTheTap: edit.panelFollowedTheTap === true,
            control_noSnapshotFiredDuringTheTap: edit.databaseUnchanged === true,
            control_doneReturnsThePanel: edit.returnedOnDone === true,
            control_theButtonWasThere: edit.tapped === true,
        };
        Object.keys(t28).forEach(k => { if (!t28[k]) problems.push('TEST 28 ' + k + ': FAILED'); });

        report = {
            TEST_26_printed_sheet: Object.assign({}, org, {
                control_singleRound: singleOrg,
                control_unscoredMultiRound: { printScored: emptyOrg.printScored,
                                              onScreenScored: emptyOrg.onScreenScored },
                assertions: t26,
            }),
            TEST_27_golfers_leaderboard_tab: {
                roundOne: card1, roundTwo: card2, control_singleRound: singleCard,
                assertions: t27,
            },
            TEST_28_edit_reveals_groups: Object.assign({}, edit, {
                workaroundNeededWhenBuildingRoundOne: r1.workaroundNeeded,
                workaroundNeededWhenBuildingRoundTwo: r2.workaroundNeeded,
                assertions: t28,
            }),
            problems: problems,
            verdict: problems.length ? 'FAIL' : 'PASS',
        };
    } finally {
        await j.close();
    }
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
