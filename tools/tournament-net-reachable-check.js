#!/usr/bin/env node
// ============================================================================
// CAN AN ORGANIZER ACTUALLY SET UP A NET EVENT?
//
// Individual Net has been complete and correct since it was written, and
// unreachable the whole time: #individual-setup-note - which holds the only
// Gross/Net control in the product - sits inside #manage-screen, which is
// display:none while the setup form is up. selectFormat() sets it to block, and
// it is inside a hidden ancestor, so nothing appears. individualMode never
// leaves 'gross', and every net event this project has measured so far was a
// hand-written record.
//
// TEST 18  the radios are on screen after a real tap, and only for Individual
// TEST 19  END TO END, THROUGH THE UI. No fixture: the event is created by
//          pressing the page's own controls, and the board it produces is
//          compared against arithmetic done here by hand
// TEST 20  #ind-net-warning - the refusal that also lived in the hidden panel
//
// THE CONTROLS ARE WHAT MAKE THESE MEAN ANYTHING:
//   - tapping Scramble must NOT show the panel. Showing it always would pass a
//     naive "is it visible" test and be worse than the bug
//   - Individual -> Scramble -> Individual must show, hide, show. A panel
//     revealed once and left there reads identically to one that tracks format
//   - the Gross run must produce a DIFFERENT board from the Net run, or the
//     radio is decorative
//   - the warning must NOT appear on a real-index course
//
//   node tools/tournament-net-reachable-check.js
//
//   exit 0   an organizer can set up a net event and it scores net
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { openJourney, fileUrl: journeyUrl } = require('./lib/journey.js');

// coursePresets carries a genuine stroke index; anything in the directory
// WITHOUT a preset falls through to the fabricated 1..18, which is what
// courseIndexSynthetic records and what net is refused on.
const REAL_COURSE = { id: 'trueblue', name: 'True Blue Golf Club' };
const SYNTHETIC_COURSE = { id: 'swwa_mintvalley', name: 'Mint Valley Golf Course' };

// Three golfers, all round 90 on a par-72 with a 1..18 index.
//   Ace   hcp 0    0 strokes -> 90 -> +18
//   Bogey hcp 18  18 strokes -> 72 ->   E
//   Cal   hcp 9    9 strokes -> 81 ->  +9
// Scored gross they are all +18 and tied. Computed here, by hand, not by asking
// the engine what it thinks the answer is.
const HAND_NET = { Bogey: 'E', Cal: '+9', Ace: '+18' };
const HAND_GROSS = { Ace: '+18', Bogey: '+18', Cal: '+18' };

// --- TEST 18 + 20: cold arrival, real taps only ----------------------------
const PROBE_REVEAL = `
(() => {
  const vis = el => !!el && el.getClientRects().length > 0;
  const V = id => vis(document.getElementById(id));
  const radio = v => document.querySelector('input[name="ind-mode"][value="' + v + '"]');
  const snap = () => ({
    note: V('individual-setup-note'),
    gross: vis(radio('gross')), net: vis(radio('net')),
    individualCardActive: document.getElementById('fmt-individual').classList.contains('active'),
  });

  const out = { onArrival: snap() };
  document.getElementById('fmt-individual').click();
  out.afterIndividual = snap();
  // CONTROL: a format that must NOT show it.
  document.getElementById('fmt-scramble').click();
  out.afterScramble = snap();
  // CONTROL: and back, so "shown once and stuck" is distinguishable.
  document.getElementById('fmt-individual').click();
  out.afterIndividualAgain = snap();

  // Operable, not merely painted: press Net and read what the page recorded.
  const net = radio('net');
  if (net) { net.click(); }
  out.netRadioCheckedAfterTap = !!(net && net.checked);
  const gross = radio('gross');
  out.grossRadioCheckedAfterNetTap = !!(gross && gross.checked);
  return JSON.stringify(out);
})()`;

// TEST 20 needs a course chosen before Net can be judged, so it drives the
// page's own course dropdown rather than writing selectedCourseData.
const probeWarning = (courseId, courseName) => `
(() => {
  const out = {};
  document.getElementById('fmt-individual').click();
  // The dropdown is the page's own; the option is a real element with a real
  // click handler. Nothing here calls pickCourse by name.
  // TYPED, NOT CLICKED. The field opens its list on focus, and programmatic
  // focus does not fire an onfocus attribute handler in headless Chrome - a
  // harness limit, not an app fault; a real tap focuses it. Typing reaches the
  // same list through oninput, and is closer to what an organizer does anyway.
  const search = document.getElementById('course-search-input');
  search.value = ${JSON.stringify('')} + '${courseName}';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  const opt = Array.from(document.querySelectorAll('#course-dropdown .custom-select-option'))
      .find(o => (o.getAttribute('onclick') || '').indexOf("'${courseId}'") !== -1);
  out.courseOptionFound = !!opt;
  if (opt) opt.click();
  out.courseChosen = document.getElementById('course-key').value;

  const warn = document.getElementById('ind-net-warning');
  const seen = () => !!warn && warn.getClientRects().length > 0;
  out.warningBeforeChoosingNet = seen();
  const net = document.querySelector('input[name="ind-mode"][value="net"]');
  out.netRadioReachable = !!net && net.getClientRects().length > 0;
  if (net) net.click();
  out.warningAfterChoosingNet = seen();
  out.warningText = warn ? (warn.innerText || '').replace(/\\s+/g, ' ').trim() : null;
  // CONTROL within the run: switching back to Gross must retract it.
  const gross = document.querySelector('input[name="ind-mode"][value="gross"]');
  if (gross) gross.click();
  out.warningAfterSwitchingBackToGross = seen();
  return JSON.stringify(out);
})()`;

function bail(msg) {
    console.error('tournament-net-reachable-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// --- TEST 19: build the event by pressing the page's own controls ----------
//
// journey.js is used rather than cold-arrival because this one has to ACCUMULATE:
// the setup screen writes a record, the page navigates to itself with ?tourney=,
// the manage screen writes handicaps and a group, the scorecard writes scores,
// and each step has to see the last one. Its stub persists writes and re-fires
// listeners, which is what a real database does and what the read-only stub
// deliberately does not.
async function buildEventThroughTheUI(mode, course) {
    const COURSE = course || REAL_COURSE;
    const j = await openJourney({ db: { tournaments: {}, trips: {}, global_courses: {} } });
    const writes = [];
    try {
        await j.goto(journeyUrl('tournament.html', ''), 2600);

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
        // THE RADIO, PRESSED. This is the control that did not exist.
        const radioPressed = await j.evaluate(`(() => {
            const r = document.querySelector('input[name="ind-mode"][value="${mode}"]');
            if (!r || r.getClientRects().length === 0) return false;
            r.click();
            return true;
        })()`);

        // Three golfers into the roster the setup screen offers.
        await j.evaluate(`(() => {
            const names = ['Ace', 'Bogey', 'Cal'];
            const inputs = document.querySelectorAll('#teams-list .team-name-inputs input');
            names.forEach((n, i) => { if (inputs[i]) inputs[i].value = n; });
            return inputs.length;
        })()`);
        await j.setValue('#t-entry-fee', '0');

        await j.click('#setup-screen button.btn-primary', /saveTournament/, { settleMs: 2600 });
        const db = await j.harvest();
        const code = Object.keys(db.tournaments || {})[0];
        if (!code) return { fatal: 'saveTournament wrote no tournament', radioPressed };
        const rec = db.tournaments[code];
        writes.push('tournaments/' + code + ' scoringMode=' + rec.scoringMode);

        // The handicaps. The setup screen stores every golfer at 0, so these are
        // set on the Player Field, through its own inputs.
        await j.goto(journeyUrl('tournament.html', 'tourney=' + code), 2600);
        await j.evaluate(`(() => {
            const want = { Ace: '0', Bogey: '18', Cal: '9' };
            const rows = Array.from(document.querySelectorAll('#player-field-list .fa-row'));
            rows.forEach(r => {
                const ins = r.querySelectorAll('input');
                const nm = ins[0] ? ins[0].value : '';
                if (want[nm] !== undefined && ins[1]) {
                    ins[1].value = want[nm];
                    ins[1].dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            return rows.length;
        })()`);

        // A scoring group, and everybody into it - the page's own controls.
        await j.click('#scoring-groups-section button.btn-outline', /createScoringGroup/, { settleMs: 900 });
        await j.evaluate(`(() => {
            const sels = Array.from(document.querySelectorAll('#scoring-groups-list select'));
            sels.forEach(s => {
                const opt = Array.from(s.options).find(o => o.value && o.value !== '');
                if (opt) { s.value = opt.value; s.dispatchEvent(new Event('change', { bubbles: true })); }
            });
            return sels.length;
        })()`);

        const after = await j.harvest();
        const groups = (after.tournaments[code] || {}).scoringGroups || {};
        const gid = Object.keys(groups)[0];
        if (!gid) return { fatal: 'no scoring group was created', radioPressed };

        // Score every golfer at 5 a hole, on the golfer's own card.
        await j.goto(journeyUrl('tournament-scorecard.html', 'tourney=' + code + '&group=' + gid), 2600);
        await j.evaluate(`(async () => {
            const inputs = Array.from(document.querySelectorAll('#holes-list input'));
            for (const el of inputs) {
                el.value = '5';
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return inputs.length;
        })()`);

        // And read the organizer's board.
        await j.goto(journeyUrl('tournament.html', 'tourney=' + code), 2600);
        const board = await j.evaluate(`
            Array.from(document.querySelectorAll('#leaderboard-list .lb-row')).slice(1)
                .map(r => (r.innerText || '').replace(/\\s+/g, ' ').trim())`);
        const finalDb = await j.harvest();
        return {
            code, radioPressed, board,
            courseIndexSynthetic: (finalDb.tournaments[code] || {}).courseIndexSynthetic,
            scoringMode: (finalDb.tournaments[code] || {}).scoringMode,
            scoreKeys: Object.keys((finalDb.tournaments[code] || {}).scores || {}).length,
            writes,
        };
    } finally {
        await j.close();
    }
}

const placed = (board, name, toPar) =>
    board.some(l => l.indexOf(name) !== -1 && l.trim().split(/\s+/).pop() === toPar);

module.exports = { PROBE_REVEAL: PROBE_REVEAL, probeWarning: probeWarning,
    REAL_COURSE: REAL_COURSE, SYNTHETIC_COURSE: SYNTHETIC_COURSE };

if (require.main !== module) return;

(async () => {
    const db = { tournaments: {}, trips: {}, global_courses: {} };
    const cold = async (expression) => {
        const r = await arriveCold({ url: fileUrl('tournament.html', ''), db, expression,
            preScript: 'window.alert=function(){};', settleMs: 3200,
            blockUrls: ['*qrcode.min.js'] });
        if (!r.ok) bail(r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail('unreadable probe output'); }
        return g;
    };

    const reveal = await cold(PROBE_REVEAL);
    const warnReal = await cold(probeWarning(REAL_COURSE.id, REAL_COURSE.name));
    const warnSynth = await cold(probeWarning(SYNTHETIC_COURSE.id, SYNTHETIC_COURSE.name));

    // --- controls checked before anything is believed ----------------------
    if (!reveal.afterIndividual.individualCardActive) {
        bail('the Individual card did not even go active on a tap - the probe is not '
            + 'reaching the format picker and nothing below means anything');
    }
    if (!warnReal.courseOptionFound || !warnSynth.courseOptionFound) {
        bail('the course dropdown did not offer the fixture courses - Test 20 measured nothing');
    }

    const problems = [];

    // --- TEST 18 -----------------------------------------------------------
    const t18 = {
        hiddenOnArrival: reveal.onArrival.note === false,
        visibleAfterTappingIndividual: reveal.afterIndividual.note === true,
        bothRadiosVisible: reveal.afterIndividual.gross === true
            && reveal.afterIndividual.net === true,
        control_hiddenForScramble: reveal.afterScramble.note === false,
        control_reappearsOnIndividualAgain: reveal.afterIndividualAgain.note === true,
        netRadioOperable: reveal.netRadioCheckedAfterTap === true
            && reveal.grossRadioCheckedAfterNetTap === false,
    };
    Object.keys(t18).forEach(k => { if (!t18[k]) problems.push('TEST 18 ' + k + ': FAILED'); });

    // --- TEST 20 -----------------------------------------------------------
    const t20 = {
        netRadioReachable: warnSynth.netRadioReachable === true,
        quietBeforeChoosingNet: warnSynth.warningBeforeChoosingNet === false,
        appearsOnSyntheticCourse: warnSynth.warningAfterChoosingNet === true,
        saysNetUnavailable: /no real stroke index/i.test(warnSynth.warningText || ''),
        retractedWhenSwitchedBackToGross: warnSynth.warningAfterSwitchingBackToGross === false,
        control_absentOnRealIndexCourse: warnReal.warningAfterChoosingNet === false,
    };
    Object.keys(t20).forEach(k => { if (!t20[k]) problems.push('TEST 20 ' + k + ': FAILED'); });

    // --- TEST 19 -----------------------------------------------------------
    let netRun = null, grossRun = null, synthRun = null;
    if (t18.visibleAfterTappingIndividual && t18.bothRadiosVisible) {
        netRun = await buildEventThroughTheUI('net');
        grossRun = await buildEventThroughTheUI('gross');
        if (netRun.fatal) bail('TEST 19 net run: ' + netRun.fatal);
        if (grossRun.fatal) bail('TEST 19 gross run: ' + grossRun.fatal);
        if (!netRun.scoreKeys) bail('TEST 19 wrote no scores - the board proves nothing');

        const t19 = {
            netRadioWasPressable: netRun.radioPressed === true,
            storedScoringModeIsNet: netRun.scoringMode === 'net',
            boardIsTheHandComputedNet: Object.keys(HAND_NET)
                .every(n => placed(netRun.board, n, HAND_NET[n])),
            control_grossRunStoredGross: grossRun.scoringMode === 'gross',
            control_grossBoardIsAllTied: Object.keys(HAND_GROSS)
                .every(n => placed(grossRun.board, n, HAND_GROSS[n])),
            control_theTwoBoardsDiffer:
                JSON.stringify(netRun.board) !== JSON.stringify(grossRun.board),
        };
        Object.keys(t19).forEach(k => { if (!t19[k]) problems.push('TEST 19 ' + k + ': FAILED'); });
        netRun.assertions = t19;

        // TEST 20b - WHAT GETS STORED when Net is chosen on an unmapped course.
        // The warning above is the sentence; this is the money. A fabricated
        // 1..18 index is structurally indistinguishable from a real one, so the
        // fact has to be recorded where the fallback happens or the event scores
        // net on invented data with the record claiming the card is genuine.
        synthRun = await buildEventThroughTheUI('net', SYNTHETIC_COURSE);
        if (synthRun.fatal) bail('TEST 20b: ' + synthRun.fatal);
        const t20b = {
            recordsTheCardAsFabricated: synthRun.courseIndexSynthetic === true,
            downgradesToGross: synthRun.scoringMode === 'gross',
            boardIsGross: Object.keys(HAND_GROSS)
                .every(n => placed(synthRun.board, n, HAND_GROSS[n])),
            control_realCourseRecordedAsGenuine: netRun.courseIndexSynthetic === false,
            control_realCourseKeptNet: netRun.scoringMode === 'net',
        };
        Object.keys(t20b).forEach(k => {
            if (!t20b[k]) problems.push('TEST 20b ' + k + ': FAILED');
        });
        synthRun.assertions = t20b;
    } else {
        problems.push('TEST 19 SKIPPED - the radios are not reachable, so an event '
            + 'cannot be built through the UI at all');
    }

    const report = {
        TEST_18_radios_reachable: {
            onArrival: reveal.onArrival, afterIndividual: reveal.afterIndividual,
            control_afterScramble: reveal.afterScramble,
            control_afterIndividualAgain: reveal.afterIndividualAgain,
            netRadioCheckedAfterTap: reveal.netRadioCheckedAfterTap,
            assertions: t18,
        },
        TEST_19_end_to_end: netRun ? {
            handComputed: { net: HAND_NET, gross: HAND_GROSS },
            netRun: { code: netRun.code, scoringMode: netRun.scoringMode,
                      scoreKeys: netRun.scoreKeys, board: netRun.board },
            grossRun_control: { scoringMode: grossRun.scoringMode, board: grossRun.board },
            assertions: netRun.assertions,
        } : 'SKIPPED - radios unreachable',
        TEST_20b_what_gets_stored_on_an_unmapped_course: synthRun ? {
            course: SYNTHETIC_COURSE.name,
            storedCourseIndexSynthetic: synthRun.courseIndexSynthetic,
            storedScoringMode: synthRun.scoringMode,
            board: synthRun.board,
            control_realCourse: { courseIndexSynthetic: netRun.courseIndexSynthetic,
                                  scoringMode: netRun.scoringMode },
            assertions: synthRun.assertions,
        } : 'SKIPPED',
        TEST_20_the_unreachable_warning: {
            syntheticCourse: warnSynth, realCourse_control: {
                courseChosen: warnReal.courseChosen,
                warningAfterChoosingNet: warnReal.warningAfterChoosingNet,
            },
            assertions: t20,
        },
        problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS',
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
