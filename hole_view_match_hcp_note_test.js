// ============================================================================
// D1 — THE MATCH-HANDICAP LINE MUST BE READABLE IN HOLE VIEW
//
// THE SYMPTOM, from a real round. Eric 7, Chris 12, Net Stroke Play with an
// Eric-vs-Chris Nassau running. Hole 1, par 4, stroke index 3. Eric shot 3,
// Chris shot 4. Eric's cell read -2. Chris's read a circled 3 AND -1. The Nassau
// on the same screen read AS.
//
// EVERY ONE OF THOSE NUMBERS IS CORRECT. They answer different questions:
//
//   Eric -2          Net Stroke Play to-par on his FULL course handicap.
//                    getStrokes(3, 7) = 1 -> net 2 -> -2.
//   Chris circled 3  His RELATIVE match stroke. allocateMatchStrokes(5, 3) = 1.
//   Chris -1         Net Stroke Play to-par on his FULL handicap.
//                    getStrokes(3, 12) = 1 -> net 3 -> -1.
//   Nassau AS        Relative basis, baseline 7, so the hole is genuinely halved.
//
// Nothing is miscalculated. What was missing was the sentence that says WHICH
// handicaps the dots are using - and the app already builds that sentence:
//
//   MATCH HCP - Low: Eric (7) - Playing: Eric 0 - Chris 5
//
// #match-hcp-note is a descendant of #full-card-container, which is display:none
// in Hole View. currentViewMode defaults to 'hole'. So the explanation existed,
// was correct, and was invisible in the one view golfers actually play from.
//
// THE FIX under test clones that line into Hole View exactly the way the Bets row
// is already cloned from the Full Card - one writer, one string, no second copy of
// the sentence to drift out of step.
//
// ---------------------------------------------------------------------------
// HARNESS NOTE — WHAT THESE TESTS DO AND DO NOT PROVE.
//
// Two older suites in this repo state that renderHoleView() "cannot execute here".
// That is no longer accurate and was re-checked before writing this file: BOTH
// renderScorecard() and renderHoleView() execute against mini-dom, and the fixture
// below drives real production code all the way to rendered markup - the note text
// and both symptom <td>s in this file are production output, not transcriptions.
// What does not survive is the Full Card ROW walk: mini-dom stores innerHTML as a
// string, so #hole-row-1 has no child nodes and Hole View renders no player rows.
// That costs nothing here, because the note is cloned from #match-hcp-note, which
// IS a live registered element.
//
// WHAT THESE TESTS CANNOT PROVE: geometry. mini-dom.js:264 returns a hard-coded
// all-zero rect and implements no getClientRects, no layout and no CSS. A "the
// element measures 752x25" assertion written here would be asserting the mock, not
// the runtime - which is exactly the failure mode that let this defect ship green
// in the first place. mini-dom is deliberately NOT taught to return a fake rect.
// Real measured geometry is proven separately, in headless Chrome, against both
// view modes. These tests prove the note is EMITTED INTO HOLE VIEW'S OWN MARKUP,
// which is the strongest claim this harness can honestly make.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const SRC = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

const PAGE_DEPS = ['score-marks.js', 'money-engine.js', 'action-model.js',
    'settlement-engine.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js'];

// THE SYMPTOM COURSE. Hole 1 is stroke index 3 - the reported hole - and no hole
// borrows another's index, so nothing here can pass by confusing hole number with SI.
const SI = { 1:3, 2:1, 3:2, 4:4, 5:5, 6:6, 7:7, 8:8, 9:9,
             10:10, 11:11, 12:12, 13:13, 14:14, 15:15, 16:16, 17:17, 18:18 };
const cd18 = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: SI[i + 1] }));

const ERIC = { id: 101, name: 'Eric Stone', hcp: '7' };
const CHRIS = { id: 102, name: 'Chris Vale', hcp: '12' };
const PAUL = { id: 103, name: 'Paul West', hcp: '9' };
const DAN = { id: 104, name: 'Dan Ross', hcp: '15' };

function scoresFor(players) {
    const s = {};
    players.forEach(p => cd18.forEach(h => { s['p' + p.id + '_h' + h.hole] = 4; }));
    s['p101_h1'] = 3;   // Eric's gross 3
    s['p102_h1'] = 4;   // Chris's gross 4
    return s;
}

const ERIC_V_CHRIS = { format: 'match', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'],
                       stake: 20, startHole: 1, pressRule: 'none' };
const CHRIS_V_PAUL = { format: 'match', scoring: 'net', teamAIds: ['102'], teamBIds: ['103'],
                       stake: 10, startHole: 1, pressRule: 'none' };

// A realm is built once per scenario and re-entered by each test, which always
// declares the context it needs. Tests are therefore order-independent.
function buildRealm(players, sideMatches) {
    const page = loadHtmlInlineScript('index.html', PAGE_DEPS);
    const data = { gameFormat: 'stroke', players, courseData: cd18,
                   scores: scoresFor(players), sideMatches };
    vm.runInContext('currentData = ' + JSON.stringify(data), page);
    return e => vm.runInContext(e, page);
}

let _symptom = null;
const symptom = () => (_symptom || (_symptom = buildRealm([ERIC, CHRIS], { w1: ERIC_V_CHRIS })));

let _overlap = null;
const overlap = () => (_overlap || (_overlap =
    buildRealm([ERIC, CHRIS, PAUL], { w1: ERIC_V_CHRIS, w2: CHRIS_V_PAUL })));

// The reported round: Net Stroke Play with a NASSAU side match. eligibleDotMatches
// accepts 'match' and 'nassau' alike, so this is the same dot context by a different
// wager shape - and it is the shape the defect was actually reported on.
const ERIC_V_CHRIS_NASSAU = { format: 'nassau', scoring: 'net', teamAIds: ['101'],
                              teamBIds: ['102'], stake: 20, startHole: 1, pressRule: 'none' };
const PAUL_V_DAN = { format: 'match', scoring: 'net', teamAIds: ['103'], teamBIds: ['104'],
                     stake: 10, startHole: 1, pressRule: 'none' };

let _nassau = null;
const nassau = () => (_nassau || (_nassau = buildRealm([ERIC, CHRIS], { w1: ERIC_V_CHRIS_NASSAU })));

// Two wagers, no golfer in both - the case the merged DOTS BY MATCH line exists for.
let _twoMatches = null;
const twoMatches = () => (_twoMatches || (_twoMatches =
    buildRealm([ERIC, CHRIS, PAUL, DAN], { w1: ERIC_V_CHRIS, w2: PAUL_V_DAN })));

const holeViewHtml = call => call('document.getElementById("hole-view-card").innerHTML');
const noteHtml = call => call('document.getElementById("match-hcp-note").innerHTML');
const noteDisplay = call => call('document.getElementById("match-hcp-note").style.display');

// The Hole View copy, as rendered. The note's own content carries <strong> but no
// nested <div>, so the first closing tag is this element's own.
function holeViewNote(call) {
    const m = /<div class="([^"]*match-hcp-note[^"]*)">([\s\S]*?)<\/div>/.exec(holeViewHtml(call));
    return m ? { classes: m[1], inner: m[2] } : null;
}

// The two symptom cells, straight out of the rendered Full Card body.
function symptomCells(call) {
    const body = call('document.getElementById("card-body").innerHTML');
    const row1 = body.slice(0, body.indexOf('</tr>') + 5);
    return row1.match(/<td>[\s\S]*?<\/td>/g) || [];
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

describe('D1 — THE NOTE IS BUILT, AND IS THE RIGHT SENTENCE', () => {

    test('production builds the exact symptom line', () => {
        const call = symptom();
        call('setDotContext("w1")');
        assert.equal(noteHtml(call),
            '<strong>MATCH HCP</strong> · Low: Eric (7) · Playing: Eric 0 · Chris 5');
    });

    test('and marks it displayable in the Full Card', () => {
        const call = symptom();
        call('setDotContext("w1")');
        assert.equal(noteDisplay(call), 'block');
    });
});

describe('D1 — HOLE VIEW SHOWS IT (Section 6.1)', () => {

    // THE DEFECT ITSELF. Before the fix, Hole View's markup contains no note at all,
    // so this is the assertion that must go red first and green after.
    test('Hole View renders the note into its OWN markup', () => {
        const call = symptom();
        call('setDotContext("w1")');
        call('setViewMode("hole")');
        const hv = holeViewHtml(call);
        assert.ok(hv.includes('match-hcp-note'),
            'Hole View markup contains no match-hcp-note element - the line is invisible ' +
            'exactly where a golfer needs it');
    });

    test('the rendered copy carries real content, not an empty bar', () => {
        const call = symptom();
        call('setDotContext("w1")');
        call('setViewMode("hole")');
        const note = holeViewNote(call);
        assert.ok(note, 'no note element rendered in Hole View');
        assert.notEqual(note.inner.trim(), '',
            'an empty match-hcp-note renders as a padded teal-bordered bar - a layout ' +
            'artifact, not an explanation');
    });

    // Section 6.2 of the brief: display:block alone was TRUE while the element was
    // 0x0. Presence of the class is not enough either - the sentence has to be there.
    test('the text is the SAME text the Full Card shows (Section 4.2)', () => {
        const call = symptom();
        call('setDotContext("w1")');
        call('setViewMode("hole")');
        assert.equal(holeViewNote(call).inner, noteHtml(call));
    });

    test('the golfer can read who the baseline is and what each man plays off', () => {
        const call = symptom();
        call('setDotContext("w1")');
        call('setViewMode("hole")');
        const inner = holeViewNote(call).inner;
        assert.match(inner, /MATCH HCP/);
        assert.match(inner, /Low: Eric \(7\)/);
        assert.match(inner, /Eric 0/);
        assert.match(inner, /Chris 5/);
    });

    // Two elements may not share an id. The Section 8 duplicate-ID check would catch
    // this in the page, but it is cheaper to fail here with a sentence than there.
    test('the Hole View copy does NOT duplicate the id', () => {
        const call = symptom();
        call('setDotContext("w1")');
        call('setViewMode("hole")');
        assert.ok(!holeViewHtml(call).includes('id="match-hcp-note"'),
            'the Hole View copy must be class-only - a second id="match-hcp-note" ' +
            'breaks getElementById for the writer at index.html:7082');
        assert.match(holeViewNote(call).classes, /\bmatch-hcp-note\b/);
    });
});

describe('D1 — COURSE MODE STAYS SILENT (Section 6.2)', () => {

    // A Stroke Play round with ordinary course dots gains no vertical space and no
    // new vocabulary. Nothing at all, not an empty container.
    test('Course context blanks the source note', () => {
        const call = symptom();
        call('setDotContext("course")');
        assert.equal(noteHtml(call), '');
        assert.equal(noteDisplay(call), 'none');
    });

    test('and Hole View renders NO note element whatsoever', () => {
        const call = symptom();
        call('setDotContext("course")');
        call('setViewMode("hole")');
        assert.ok(!holeViewHtml(call).includes('match-hcp-note'),
            'Course mode left a match-hcp-note element behind - an empty bar is a ' +
            'regression, not a fix');
    });

    test('no empty bar, no reserved height, no layout jump', () => {
        const call = symptom();
        call('setDotContext("course")');
        call('setViewMode("hole")');
        assert.equal(holeViewNote(call), null);
    });
});

describe('D1 — THE D2 FALLBACK LEAVES NOTHING BEHIND (Section 6.3)', () => {

    // D2 is NOT in scope and is not fixed here. But when two side matches share a
    // golfer the overlap guard withdraws Auto and drops to Course, which runs the
    // SAME else branch at index.html:7114-7117 - innerHTML and display cleared
    // together. A visible note has to handle that silently.
    test('overlapping matches really do drop the context to Course', () => {
        const call = overlap();
        call('selectedDotMatchId = "auto"');
        call('renderScorecard()');
        assert.equal(call('selectedDotMatchId'), 'course');
    });

    test('the blanked note leaves Hole View with nothing to show', () => {
        const call = overlap();
        call('selectedDotMatchId = "auto"');
        call('renderScorecard()');
        call('setViewMode("hole")');
        assert.equal(noteHtml(call), '');
        assert.ok(!holeViewHtml(call).includes('match-hcp-note'),
            'the D2 fallback blanked the note but Hole View still rendered an ' +
            'element - a stale or empty line is worse than none');
    });

    // The guard must key on the note being EMPTY, which is the one invariant the
    // single writer guarantees, rather than on a mode name it would have to re-derive.
    test('a blanked source produces no Hole View copy even with a match selected', () => {
        const call = overlap();
        call('setDotContext("w1")');
        call('setViewMode("hole")');
        assert.ok(holeViewHtml(call).includes('match-hcp-note'));
        call('document.getElementById("match-hcp-note").innerHTML = ""');
        call('renderHoleView()');
        assert.ok(!holeViewHtml(call).includes('match-hcp-note'),
            'Hole View re-rendered a note from an empty source');
    });
});

describe('D1 — THE FULL CARD IS UNTOUCHED (Section 6.4)', () => {

    // The source element stays exactly where it is. This pins the design decision:
    // the note is CLONED into Hole View, not relocated out of the Full Card, so Full
    // Card's own layout cannot move.
    test('#match-hcp-note is still declared inside #full-card-container', () => {
        const wrapper = SRC.slice(SRC.indexOf('id="full-card-container"'));
        const note = wrapper.indexOf('id="match-hcp-note"');
        const table = wrapper.indexOf('<table class="card-table">');
        assert.ok(note > -1, '#match-hcp-note left #full-card-container');
        assert.ok(note < table, '#match-hcp-note moved out of its place above the card table');
    });

    test('it is declared exactly once in the page', () => {
        assert.equal(SRC.split('id="match-hcp-note"').length - 1, 1);
    });

    test('Full Card still shows the line in a relative context', () => {
        const call = symptom();
        call('setDotContext("w1")');
        call('setViewMode("full")');
        assert.equal(noteDisplay(call), 'block');
        assert.match(noteHtml(call), /MATCH HCP/);
    });

    test('Full Card still hides it in Course context', () => {
        const call = symptom();
        call('setDotContext("course")');
        call('setViewMode("full")');
        assert.equal(noteDisplay(call), 'none');
        assert.equal(noteHtml(call), '');
    });
});

describe('D1 — VIEW SWITCHING (Section 6.5)', () => {

    // hole -> full -> hole. renderHoleView() rebuilds #hole-view-card from scratch
    // every time, so the risk is not staleness but a copy that fails to come back.
    test('the note survives a hole -> full -> hole round trip', () => {
        const call = symptom();
        call('setDotContext("w1")');

        call('setViewMode("hole")');
        assert.ok(holeViewHtml(call).includes('match-hcp-note'), 'missing on first hole view');

        call('setViewMode("full")');
        assert.equal(noteDisplay(call), 'block');

        call('setViewMode("hole")');
        assert.ok(holeViewHtml(call).includes('match-hcp-note'), 'did not come back after Full Card');
        assert.equal(holeViewNote(call).inner, noteHtml(call), 'came back stale');
    });

    test('switching context while in Hole View updates the line', () => {
        const call = symptom();
        call('setViewMode("hole")');

        call('setDotContext("w1")');
        assert.ok(holeViewHtml(call).includes('match-hcp-note'));

        call('setDotContext("course")');
        assert.ok(!holeViewHtml(call).includes('match-hcp-note'),
            'the note outlived the context that justified it');

        call('setDotContext("w1")');
        assert.equal(holeViewNote(call).inner, noteHtml(call));
    });
});

describe('D1 — THE CELLS DO NOT MOVE (Section 6.6)', () => {

    // THIS RUN CHANGES NO ARITHMETIC. Both cells are production output, captured
    // before the fix. The sha256 pins are byte-identity guards: if a future change
    // legitimately alters a cell, re-pin them DELIBERATELY, having read the diff -
    // never by pasting whatever the run printed.
    const ERIC_TD_SHA = '5f39fef9fe156c5cb77c444f7775a266ca99426a1f154cbc58236cf8a76bed3e';
    const CHRIS_TD_SHA = '8938cbdfb70a2a032496abec0af96266697af355b7ec8ce3ec268e4d719cc7bb';

    test('Eric reads -2, with no net mark and no pips', () => {
        const call = symptom();
        call('setDotContext("w1")');
        const eric = symptomCells(call)[0];
        assert.match(eric, />-2</);
        assert.match(eric, /<div class="stroke-dots"><\/div>/, 'Eric received a pip he is not owed');
        assert.ok(!eric.includes('net-mark'), 'Eric grew a net mark');
        assert.match(eric, /score-input-wrapper mark-birdie/);
    });

    test('Chris reads a circled 3, -1, and exactly one pip', () => {
        const call = symptom();
        call('setDotContext("w1")');
        const chris = symptomCells(call)[1];
        assert.match(chris, /<span class="net-mark">3<\/span>/);
        assert.match(chris, />-1</);
        assert.match(chris, /<div class="stroke-dots">•<\/div>/);
    });

    test('both cells are BYTE-IDENTICAL to their pre-fix rendering', () => {
        const call = symptom();
        call('setDotContext("w1")');
        const [eric, chris] = symptomCells(call);
        assert.equal(sha(eric), ERIC_TD_SHA, 'Eric’s cell changed');
        assert.equal(sha(chris), CHRIS_TD_SHA, 'Chris’s cell changed');
    });

    // The card must be RE-RENDERED in each mode, not merely looked at twice.
    // setViewMode() does not rebuild #card-body - it only toggles containers and
    // calls renderHoleView() - so capturing either side of a bare view switch
    // compares one unchanged string to itself and proves nothing. A negative
    // control that made the cells depend on currentViewMode walked straight past
    // the first version of this test. renderScorecard() is called explicitly in
    // each mode so the cells are genuinely built twice.
    test('the cells are identical whether built in Hole View or Full Card', () => {
        const call = symptom();
        call('setDotContext("w1")');

        call('setViewMode("hole")');
        call('renderScorecard()');
        const inHole = symptomCells(call).map(sha);

        call('setViewMode("full")');
        call('renderScorecard()');
        const inFull = symptomCells(call).map(sha);

        assert.deepEqual(inHole, inFull,
            'the cell builder produced different bytes in the two views');
        assert.equal(inHole[0], ERIC_TD_SHA);
        assert.equal(inHole[1], CHRIS_TD_SHA);
    });
});

// ============================================================================
// D1a — AUTO IS THE DEFAULT, AND IT WAS WITHHOLDING THE HANDICAPS
//
// selectedDotMatchId starts at 'auto' (index.html:1504) so a reload lands on the
// safest correct context without the golfer touching anything. That makes Auto the
// state nearly every round is actually in - including the reported one: Net Stroke
// Play with an Eric-vs-Chris Nassau.
//
// In Auto the note builder took its FIRST branch and stopped:
//
//     DOTS BY MATCH · Eric v Chris
//
// which names the pairing and carries no handicap numbers at all. The MATCH HCP
// line - the only line that says who the baseline is and what each man plays off -
// lives in the branch after it and was unreachable. So the D1 clone faithfully
// carried the wrong sentence into Hole View, and a golfer looking for the handicaps
// still could not find them.
//
// THE MERGED-MODE CAVEAT IS REAL, BUT ONLY FOR TWO OR MORE. Its comment is right
// that two matches mean two baselines and naming one would be false. With exactly
// ONE eligible wager there is exactly one baseline, and Auto and the explicit pick
// produce a byte-identical dot plan - same rel numbers, same pips. The caveat was
// being applied at N=1, where it costs the golfer the explanation and buys nothing.
//
// NO ARITHMETIC MOVES HERE EITHER. This changes which sentence is chosen, never a
// handicap, a stroke allocation or a dot.
// ============================================================================

const MATCH_HCP_LINE = '<strong>MATCH HCP</strong> · Low: Eric (7) · Playing: Eric 0 · Chris 5';

// Every test here drives the DEFAULT context explicitly rather than trusting the
// realm's leftover state, so they do not depend on execution order - and so that
// "auto" is genuinely what is under test.
const asAuto = call => { call('selectedDotMatchId = "auto"'); call('renderScorecard()'); return call; };

describe('D1a — AUTO WITH ONE MATCH SHOWS THE HANDICAPS', () => {

    // AUTO BEING THE DEFAULT IS THE WHOLE REASON THIS BRANCH MATTERS: a golfer who
    // never opens the selector is in it. Every test below forces the context so it
    // stays order-independent, which means forcing it can no longer prove what the
    // default IS - a control that changed the declared default sailed past all of
    // them. The default is therefore pinned at its declaration instead.
    test('Auto is the context a golfer lands in without touching anything', () => {
        assert.match(SRC, /let selectedDotMatchId = 'auto';/,
            'the default context is what puts a real round on this branch');
    });

    test('the symptom round offers exactly one eligible wager', () => {
        const call = asAuto(symptom());
        assert.equal(call('selectedDotMatchId'), 'auto');
        assert.equal(call('eligibleDotMatches(currentData).length'), 1);
    });

    // THE DEFECT. Auto must not stop at the pairing list when there is one baseline.
    test('Auto names the handicaps, not just the pairing', () => {
        const call = asAuto(symptom());
        assert.equal(noteHtml(call), MATCH_HCP_LINE);
    });

    test('the DOTS BY MATCH pairing line is NOT what a single match produces', () => {
        const call = asAuto(symptom());
        assert.ok(!noteHtml(call).includes('DOTS BY MATCH'),
            'a single wager has one baseline - the pairing list withholds the numbers ' +
            'the golfer came for');
    });

    test('Hole View carries that line, with the numbers in it', () => {
        const call = asAuto(symptom());
        call('setViewMode("hole")');
        const note = holeViewNote(call);
        assert.ok(note, 'no note rendered in Hole View');
        assert.equal(note.inner, MATCH_HCP_LINE);
        assert.match(note.inner, /Low: Eric \(7\)/);
        assert.match(note.inner, /Chris 5/);
    });

    // Auto and the explicit pick describe the SAME allocation, so they must read
    // identically. If they ever diverge, one of them is lying to the golfer.
    test('Auto and an explicit pick produce the same sentence', () => {
        const auto = asAuto(symptom());
        const autoText = noteHtml(auto);
        const call = symptom();
        call('setDotContext("w1")');
        assert.equal(autoText, noteHtml(call));
    });

    test('and the same dots — no allocation moved', () => {
        const auto = asAuto(symptom());
        const autoCells = symptomCells(auto).map(sha);
        const call = symptom();
        call('setDotContext("w1")');
        assert.deepEqual(autoCells, symptomCells(call).map(sha));
    });
});

describe('D1a — THE REPORTED SHAPE: NET STROKE PLAY + A NASSAU SIDE MATCH', () => {

    test('a Nassau side match is an eligible dot context', () => {
        const call = asAuto(nassau());
        assert.equal(call('eligibleDotMatches(currentData).length'), 1);
        assert.equal(call('selectedDotMatchId'), 'auto');
    });

    test('the selector offers Auto, exactly as reported on the device', () => {
        const call = asAuto(nassau());
        assert.match(call('document.getElementById("dot-context-select").innerHTML'),
            /Auto \(each golfer's match\)/);
        assert.equal(call('document.getElementById("dot-context-row").style.display'), 'flex');
    });

    // The exact gap between the wager box and Hole 1 that was reported empty.
    test('Hole View shows the handicap line on the reported round', () => {
        const call = asAuto(nassau());
        call('setViewMode("hole")');
        const note = holeViewNote(call);
        assert.ok(note, 'Hole View rendered no note on the reported configuration');
        assert.equal(note.inner, MATCH_HCP_LINE);
    });
});

describe('D1a — TWO INDEPENDENT MATCHES STILL GET THE PAIRING LIST', () => {

    // The merged branch keeps earning its keep. Two matches mean two baselines, so
    // naming one Low WOULD be false - this is the case the comment was written for.
    test('two independent wagers still produce DOTS BY MATCH', () => {
        const call = asAuto(twoMatches());
        assert.equal(call('selectedDotMatchId'), 'auto');
        assert.match(noteHtml(call), /^<strong>DOTS BY MATCH<\/strong>/);
    });

    test('and it names BOTH pairings, so neither match is hidden', () => {
        const call = asAuto(twoMatches());
        assert.match(noteHtml(call), /Eric v Chris/);
        assert.match(noteHtml(call), /Paul v Dan/);
    });

    test('it never claims a single Low across two baselines', () => {
        const call = asAuto(twoMatches());
        assert.ok(!noteHtml(call).includes('Low:'),
            'two matches have two baselines - naming one would be false');
    });

    test('Hole View carries the pairing list too', () => {
        const call = asAuto(twoMatches());
        call('setViewMode("hole")');
        assert.match(holeViewNote(call).inner, /DOTS BY MATCH/);
    });
});

describe('D1a — THE SAFE STATES ARE UNCHANGED', () => {

    test('Course is still silent under Auto rules', () => {
        const call = symptom();
        call('setDotContext("course")');
        assert.equal(noteHtml(call), '');
        call('setViewMode("hole")');
        assert.ok(!holeViewHtml(call).includes('match-hcp-note'));
    });

    // Overlapping wagers retire Auto and drop to Course. That must still blank the
    // note rather than fall through to a MATCH HCP line built from a merged plan.
    test('overlapping wagers still fall back to Course and say nothing', () => {
        const call = asAuto(overlap());
        assert.equal(call('selectedDotMatchId'), 'course');
        assert.equal(noteHtml(call), '');
        call('setViewMode("hole")');
        assert.ok(!holeViewHtml(call).includes('match-hcp-note'));
    });
});
