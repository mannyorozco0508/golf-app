#!/usr/bin/env node
// ============================================================================
// SETUP TAP AUDIT - cold open to a score in the box on hole 1
//
// Manny, 2026-10-06: count the taps on three paths, for the round the app is
// actually for - FOUR golfers, ONE game, a course that is already in the
// directory - and cut only what the count proves.
//
//   quick    Home -> Game Day -> the format gallery first
//   repeat   Home -> "Same as last week"
//   coach    Home -> "Help me set this up"
//
// WHAT COUNTS AS A TAP. Every finger-down on a control, including tapping a
// text field to type in it, because on a phone that is a tap. Keystrokes are
// counted separately and reported as `typed`, never folded into the tap count.
// A step marked `type:` here is the typing itself - the preceding field tap is
// counted as a tap of its own, named in the trail.
//
// IT TAPS. Nothing here calls a function the page defines (CLAUDE.md): every
// move is a real mouse press at the element's own centre, over a cold page with
// Firebase blocked and a stand-in database, so a dead button measures as dead.
// The one exception is filling the name and course fields, which is a value plus
// an input event - CDP key synthesis into a re-rendering row list is not
// reliable - and that is why the field TAP is counted and the keystrokes are
// not claimed as taps.
//
// RUN:  node tools/setup-tap-audit.js            all three
//       node tools/setup-tap-audit.js quick      one path
//       node tools/setup-tap-audit.js --json
//
// EXIT: 0 every path reached index.html on hole 1; 2 one did not.
// ============================================================================

const { arriveCold, fileUrl } = require('../tools/lib/cold-arrival.js');

const CD = []; for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: i === 3 ? 3 : 4, hcpIndex: i, yards: 400 });
const FOUR = ['Marty Smith', 'Mike Jones', 'Tanner Lee', 'Glen Park']
    .map((n, i) => ({ id: 101 + i, name: n, hcp: String(2 + i * 4), playingForMoney: true }));
// LAST WEEK'S ROUND, as a saved round actually looks: activeCourseKey is what
// carries the course across a copy. Without it the copy lands with an empty
// course field and the save is refused - measured, and it is a FIXTURE fault,
// not a defect: a round saved by the app always writes it.
const LAST_WEEK = {
    eventName: 'Last Saturday', courseName: 'Camas Meadows Golf Club', players: FOUR,
    gameFormat: 'nassau', courseData: CD, scores: {}, settlementMode: 'whole-dollar',
    groupSizeOverrides: { 0: 4 }, nassauStakes: { front: 10, back: 10, overall: 20 },
    additionalGames: {}, activeCourseKey: 'swwa_camasmeadows'
};
const DB = { events: { OLDRND: LAST_WEEK }, trips: {}, tournaments: {}, global_courses: {} };
const PRE = "try{localStorage.setItem('lastRoomCode','OLDRND');}catch(e){}";

const NAMES = ['Marty', 'Mike', 'Tanner', 'Glen'];
const fillNames = "(function(){var ns=" + JSON.stringify(NAMES)
    + ";document.querySelectorAll('.p-name-input').forEach(function(i,k){i.value=ns[k]||'';"
    + "i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));});return 'named';})()";
const fillCourse = "(function(){var i=document.getElementById('course-search-input');i.focus();"
    + "i.value='Camas';i.dispatchEvent(new Event('input',{bubbles:true}));return 'typed';})()";

// A step is [kind, selector_or_js, label]. kind: tap | type | wait
const COURSE_AND_PLAYERS = [
    ['tap', '#course-search-input', 'the course field'],
    ['type', fillCourse, 'typed "Camas"'],
    ['tap', '#course-dropdown div', 'Camas Meadows Golf Club'],
    ['tap', '#wizard-next-1', 'Next: Players'],
    ['tap', 'button.btn-add@0', 'Add New Player'],
    ['tap', 'button.btn-add@0', 'Add New Player'],
    ['tap', 'button.btn-add@0', 'Add New Player'],
    ['tap', '.p-name-input@0', 'name field 1'],
    ['tap', '.p-name-input@1', 'name field 2'],
    ['tap', '.p-name-input@2', 'name field 3'],
    ['tap', '.p-name-input@3', 'name field 4'],
    ['type', fillNames, 'typed four names'],
    ['tap', '#wizard-next-5', 'Next: Money'],
    ['tap', '#wizard-next-6', 'Review & Save'],
];
// THE SAVE, AND WHATEVER STANDS BETWEEN IT AND HOLE 1. "Save & Start Round"
// does not start the round: it shows Round Ready, and START SCORING is a second
// tap. The audit does not assume either way - it taps Save, waits, and taps
// START SCORING only if that button is on screen.
const SAVE = [
    ['tap', '#main-save-btn', 'Save & Start Round'],
    ['wait', 2200, ''],
    ['tap?', 'button[onclick="startScoring()"]', 'START SCORING (the second ready tap)'],
    ['wait', 3600, ''],
];

const PATHS = {
    quick: { label: 'Game Day -> Games first', steps: [
        ['tap', '#hw-quick', 'Game Day'],
        ['wait', 1500, ''],
        ['tap', '#fmt-card-stroke', 'Stroke Play (auto-advances to Course)'],
    ].concat(COURSE_AND_PLAYERS, SAVE) },

    repeat: { label: '"Same as last week"', steps: [
        // IT IS ON THE HOME SCREEN, AND IT WAS NOT. Until 2026-10-06 this button
        // lived inside #copy-round-card, inside a CLOSED <details> whose summary
        // says "Open something else" - display:none until the disclosure was
        // opened, so this path cost 6 taps and the first was a word that does not
        // mention last week. There is deliberately NO disclosure step here now: if
        // the button is ever moved back behind one, the tap below reports "no
        // element", this path fails, and the audit says so rather than quietly
        // paying the tap again.
        ['tap', '#same-as-last-week', 'Same as last week'],
        ['wait', 3600, ''],
        ['tap', '#wizard-next-5', 'Next: Money'],
        ['tap', '#wizard-next-6', 'Review & Save'],
    ].concat(SAVE) },

    coach: { label: '"Help me set this up"', steps: [
        ['tap', '#coach-link', 'Help me set this up'],
        ['wait', 1800, ''],
        ['tap', 'button.coach-opt@0', 'Four of us'],
        ['tap', 'button.coach-opt@0', 'No flights'],
        ['tap', 'button.coach-opt@0', 'Stroke Play'],
        ['tap', 'button.coach-opt@0', 'Nothing (just keeping score)'],
        ['tap', 'button.coach-opt@1', 'Straight handicaps'],
        ['tap', 'button.coach-opt@0', 'Take me there'],
        ['wait', 1800, ''],
    ].concat(COURSE_AND_PLAYERS, SAVE) },
};

// WHERE IT LANDED, AND WHAT THIS CAN HONESTLY SAY ABOUT IT.
//
// The stand-in database lives in the page, so it is FRESH on every document -
// the round the wizard just wrote is not there when index.html loads, and the
// scorecard sits on "Connecting to game..." with zero boxes. That is the
// harness, not the app: the same taps on a real phone land on a loaded card.
//
// So the audit claims only what it can see: the URL is the scorecard for the
// code the wizard minted, and the page it rendered is the HOLE 1 shell - the
// "Enter Hole 1 Score" prompt, which the scorecard draws before any data
// arrives. The tap COUNT is what this tool exists for and that is measured
// exactly; "landed on hole 1" is the shell, named as the shell.
const LANDED = `(function(){
  var h = document.querySelector('.hole-view-header');
  var txt = String(document.body.innerText || '').replace(/\\s+/g, ' ');
  return JSON.stringify({ page: location.pathname.split('/').pop() + location.search,
    hole: h ? String(h.innerText || '').trim().split('\\n')[0] : null,
    hole1Shell: /Enter Hole 1 Score/.test(txt),
    scorecard: !!document.getElementById('hole-view-card'),
    boxes: document.querySelectorAll('.score-input:not([disabled])').length });
})()`;

async function run(key) {
    const path = PATHS[key];
    const steps = [], trail = [];
    path.steps.forEach((s) => {
        const [kind, arg, label] = s;
        if (kind === 'wait') { steps.push({ sleep: arg }); return; }
        if (kind === 'type') { steps.push({ expression: arg }); trail.push({ type: label }); return; }
        const [sel, nth] = String(arg).split('@');
        steps.push({ tap: sel, nth: nth ? Number(nth) : 0 });
        steps.push({ sleep: 800 });
        trail.push({ tap: label, selector: arg, optional: kind === 'tap?' });
    });
    steps.push({ sleep: 1500 });
    steps.push({ expression: LANDED });
    const r = await arriveCold({ url: fileUrl('admin.html', ''), db: DB, preScript: PRE,
        viewport: { width: 390, height: 844 }, settleMs: 3000, steps: steps });
    if (!r.ok) return { key: key, label: path.label, ok: false, reason: r.reason };

    // WHICH TAPS ACTUALLY LANDED. cold-arrival reports "tapped <sel>" or
    // "no element: <sel>" per step, so a tap on a button that is not there is
    // not counted - which is the whole point when the audit runs again after a
    // screen is removed.
    const results = (r.value || []).filter(v => typeof v === 'string'
        && (v.startsWith('tapped ') || v.startsWith('no element')));
    let i = 0;
    const taps = [], missed = [];
    trail.forEach((t) => {
        if (t.type) { taps.push({ typed: t.type }); return; }
        const res = results[i++] || '';
        if (res.startsWith('tapped')) taps.push({ tap: t.tap });
        else { missed.push(t.tap); if (!t.optional) taps.push({ absent: t.tap }); }
    });
    const landed = JSON.parse((r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').pop() || '{}');
    return { key: key, label: path.label,
        ok: /^index\.html\?game=/.test(landed.page || '') && landed.hole1Shell === true && landed.scorecard === true,
        taps: taps.filter(t => t.tap).length, typed: taps.filter(t => t.typed).length,
        absent: taps.filter(t => t.absent).map(t => t.absent), skipped: missed,
        landed: landed, trail: taps };
}

(async () => {
    const args = process.argv.slice(2).filter(a => a !== '--json');
    const json = process.argv.includes('--json');
    const keys = args.length ? args : Object.keys(PATHS);
    const out = [];
    for (const k of keys) {
        if (!PATHS[k]) { console.error('no such path: ' + k); process.exit(2); }
        out.push(await run(k));
    }
    if (json) { console.log(JSON.stringify(out, null, 2)); }
    else {
        out.forEach((r) => {
            console.log('\n' + r.label + '   ' + (r.ok ? r.taps + ' TAPS' : 'DID NOT REACH HOLE 1'));
            if (!r.ok && r.reason) { console.log('   chrome: ' + r.reason); return; }
            let n = 0;
            r.trail.forEach((t) => {
                if (t.typed) console.log('        (' + t.typed + ')');
                else if (t.absent) console.log('     !!  absent: ' + t.absent);
                else console.log('   ' + String(++n).padStart(2) + '. ' + t.tap);
            });
            if (r.skipped.length) console.log('   not on screen (skipped): ' + r.skipped.join(', '));
            console.log('   landed: ' + r.landed.page
                + (r.landed.hole1Shell ? '  hole 1 shell' : '  NOT the hole 1 shell')
                + (r.landed.hole ? '  (' + r.landed.hole + ')' : '  (no data: the stand-in db resets on navigation)'));
        });
    }
    process.exit(out.every(r => r.ok) ? 0 : 2);
})();
