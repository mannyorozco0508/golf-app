#!/usr/bin/env node
// ============================================================================
// A REFUSAL THAT KILLS THE BUTTON IT REFUSED.
//
// saveSettings disables Save & Start Round the moment it starts - admin.html
// :4925 - so a golfer cannot double-fire a write. Three of its four refusals put
// the button back. THE MAIN POOL GATE DOES NOT: it alerts once and returns,
// leaving the control disabled with "Saving..." on it.
//
// So the first press speaks and every press after it is SILENT - no alert, no
// navigation, nothing. And goToWizardStep resets the button's LABEL on every
// step change without touching `disabled`, so walking back to fix the pool and
// returning to Review hands you a button that reads "Save & Start Round", looks
// enabled, and is dead. That is the state a golfer is actually in by the time
// they notice something is wrong and press again.
//
// TWO KINDS OF PROOF, and the second is the one that lasts:
//
//   BEHAVIOUR  a real tap on a real page, through the wizard's own controls,
//              and then a SECOND tap - because one alert is not the bug.
//   STRUCTURE  every early return after the disable must be covered by a
//              restore. Written against the SHAPE, not against today's four
//              refusals, so a fifth added later without one goes red.
//
//   node tools/save-button-check.js
//
//   exit 0   no refusal can leave the button dead
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { openJourney, fileUrl } = require('./lib/journey.js');

const PAGE = path.join(__dirname, '..', 'admin.html');

// ---------------------------------------------------------------------------
// STRUCTURE. Parsed, not grepped: the function is located, its body is walked
// with a brace counter, and every bare `return;` after the disable is checked
// for cover.
// ---------------------------------------------------------------------------
function structuralAudit() {
    const src = fs.readFileSync(PAGE, 'utf8').split('\n');
    const start = src.findIndex(l => /^\s*function saveSettings\(\)/.test(l));
    if (start === -1) return { error: 'saveSettings not found' };
    let depth = 0, end = start;
    for (let i = start; i < src.length; i++) {
        depth += (src[i].match(/\{/g) || []).length - (src[i].match(/\}/g) || []).length;
        if (i > start && depth === 0) { end = i; break; }
    }
    const body = src.slice(start, end + 1);
    const off = start;

    const disableAt = body.findIndex(l => /saveBtn\.disabled\s*=\s*true/.test(l));
    const allRestores = body.map((l, i) => /disabled\s*=\s*false/.test(l) ? i : -1).filter(i => i >= 0);

    const opens = l => (l.match(/\{/g) || []).length;
    const closes = l => (l.match(/\}/g) || []).length;

    // A finally that restores, and the try it belongs to.
    //
    // WALKING BACK TO THE try IS OFF-BY-ONE IF YOU ARE NOT CAREFUL. The body
    // between try and finally is balanced, so the running total is zero right up
    // to the `try {` line itself, which contributes -1. The first version tested
    // for 0 there, never matched, and reported "no covering finally" against a
    // function that had one - a green-looking structure audit that had found
    // nothing at all.
    let coveringTry = null;
    body.forEach((l, i) => {
        if (!/^\s*\}?\s*finally\s*\{/.test(l)) return;
        // `} finally {` NETS ZERO ON ITS OWN LINE - it closes the catch and opens the
        // finally - so a brace counter starting there decides the block ended on the
        // next line and sees none of its contents. The block is bounded by
        // indentation instead, the same way the try is matched below.
        const ind = (body[i].match(/^\s*/) || [''])[0];
        let endF = body.length - 1;
        for (let k = i + 1; k < body.length; k++) {
            if (new RegExp('^' + ind + '\\}').test(body[k])) { endF = k; break; }
        }
        if (!body.slice(i, endF + 1).some(x => /disabled\s*=\s*false/.test(x))) return;
        // MATCHED BY INDENTATION, not by counting braces. This function is three
        // hundred lines of template literals and regex literals; a brace counter
        // walking back through them is fooled by the first `${` in a string, which
        // is exactly what happened - the audit reported "no covering finally"
        // against a function that had one, and would have gone on reporting it.
        const indent = ind;
        for (let k = i - 1; k >= 0; k--) {
            if (new RegExp('^' + indent + 'try\\s*\\{').test(body[k])) {
                coveringTry = { from: k, to: i };
                break;
            }
        }
    });

    // AFTER THE WRITE IS IN FLIGHT, THE BUTTON IS NOT THIS FUNCTION'S PROBLEM.
    // The .then and .catch own it from there, and the Ryder Cup return inside the
    // chain navigates the page away entirely. Only returns BEFORE the handoff are
    // refusals, and only refusals have to give the control back.
    const handoffAt = body.findIndex(l => /db\.ref\([^)]*\)\.update\(payload\)/.test(l));
    // The promise chain's own extent, so its restores are not counted as copies of
    // the refusal rule - the .then and the .catch legitimately own the button once
    // a write is in flight.
    let chainEnd = handoffAt;
    if (handoffAt >= 0) {
        let d = 0;
        for (let k = handoffAt; k < body.length; k++) {
            d += opens(body[k]) - closes(body[k]);
            if (k > handoffAt && d <= 0) { chainEnd = k; break; }
        }
    }
    const inChain = i => handoffAt >= 0 && i >= handoffAt && i <= chainEnd;
    const returns = [];
    const last = handoffAt < 0 ? body.length : handoffAt;
    for (let i = (disableAt < 0 ? 0 : disableAt); i < last; i++) {
        if (!/^\s*return\s*;\s*$/.test(body[i])) continue;
        const nearby = body.slice(Math.max(0, i - 6), i).some(l => /disabled\s*=\s*false/.test(l));
        const inTry = !!coveringTry && i > coveringTry.from && i < coveringTry.to;
        returns.push({ line: off + i + 1, restoredNearby: nearby, insideRestoringTry: inTry,
                       covered: nearby || inTry, text: body[i].trim() });
    }
    return {
        functionLines: [off + 1, off + body.length],
        disableLine: disableAt < 0 ? null : off + disableAt + 1,
        handoffLine: handoffAt < 0 ? null : off + handoffAt + 1,
        // Only the ones in the SYNCHRONOUS body. The .then and .catch each restore
        // the button too, and correctly so - they are not copies of the refusal rule.
        restoreLines: allRestores.filter(i => !inChain(i)).map(i => off + i + 1),
        restoreLinesInPromiseChain: allRestores.filter(i => inChain(i)).map(i => off + i + 1),
        chainLines: handoffAt < 0 ? null : [off + handoffAt + 1, off + chainEnd + 1],
        coveringFinally: coveringTry ? { tryLine: off + coveringTry.from + 1, finallyLine: off + coveringTry.to + 1 } : null,
        returnsAfterDisable: returns,
        uncovered: returns.filter(r => !r.covered).map(r => r.line),
    };
}

// ---------------------------------------------------------------------------
// BEHAVIOUR. Driven through the page's own controls; the only thing typed by
// hand is what a golfer types.
// ---------------------------------------------------------------------------
const CAP = `
(function(){ window.__alerts=[]; window.__confirms=[];
  window.alert=function(m){window.__alerts.push(String(m));};
  window.confirm=function(m){window.__confirms.push(String(m));return true;};
  window.print=function(){};
})();`;

const btnState = `(() => { const b=document.getElementById('main-save-btn');
  return JSON.stringify({ label: b ? b.innerText.trim() : null,
    disabled: b ? !!b.disabled : null, present: !!b }); })()`;

function bail(msg) {
    console.error('save-button-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

async function drive(j, opts) {
    const o = opts || {};
    await j.goto(fileUrl('admin.html', ''), 2800);
    await j.evaluate(CAP);
    // COURSE, through the page's own search and dropdown.
    await j.evaluate(`(() => { const s=document.getElementById('course-search-input');
        s.value='True Blue Golf Club'; s.dispatchEvent(new Event('input',{bubbles:true}));
        const o=Array.from(document.querySelectorAll('#course-dropdown .custom-select-option'))
          .find(x=>/trueblue/.test(x.getAttribute('onclick')||'')); if(o)o.click(); return !!o; })()`);
    // PLAYERS, through the page's own Add New Player button.
    const wanted = o.players === undefined ? 4 : o.players;
    await j.evaluate(`(() => {
        const add=Array.from(document.querySelectorAll('button'))
            .find(b=>/addNewPlayerAndRefresh/.test(b.getAttribute('onclick')||''));
        while (document.querySelectorAll('.player-row').length < ${wanted} && add) add.click();
        const ins=Array.from(document.querySelectorAll('.player-row input[type="text"]'));
        ['Al','Bo','Cy','Di','Ed','Fi'].slice(0, ${wanted}).forEach((n,i)=>{
            if(ins[i]){ ins[i].value=n; ins[i].dispatchEvent(new Event('change',{bubbles:true})); }});
        return document.querySelectorAll('.player-row').length; })()`);
    if (o.format) {
        await j.evaluate(`(() => { const s=document.getElementById('game-format-select');
            if(!s) return false; s.value=${JSON.stringify(o.format)};
            s.dispatchEvent(new Event('change',{bubbles:true})); return s.value; })()`);
    }
    if (o.pool) {
        await j.evaluate(`(() => {
            const mp=document.getElementById('mp-enabled'); if(!mp) return false;
            mp.checked=true; mp.dispatchEvent(new Event('change',{bubbles:true}));
            const set=(id,v)=>{const e=document.getElementById(id); if(!e)return; e.value=String(v);
              e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));};
            set('mp-buyin',40); set('mp-kp-amount',100); set('mp-kp-holes','3, 7, 12, 16');
            set('mp-net-amount',100); return true; })()`);
    }
    // WALK TO REVIEW with the wizard's own Next buttons.
    for (let i = 0; i < 10; i++) {
        const at = await j.evaluate(`(() => { const b=document.getElementById('main-save-btn');
            return !!(b && b.offsetParent !== null); })()`);
        if (at) break;
        const ok = await j.click('.wizard-btn-next', null, { settleMs: 450 });
        if (!ok) break;
    }
    if (o.clearCourse) {
        // The one refusal the wizard's own Next button will not let you reach -
        // step 1 blocks an empty course. Cleared here so the gate can be exercised.
        // The hidden select is #course-select, not #course-hidden-select. The first
        // version cleared a element that does not exist, the key survived, the gate
        // never fired, and the control passed on a refusal that never happened.
        await j.evaluate(`(() => { const s=document.getElementById('course-search-input');
            if (s) s.value='';
            const h=document.getElementById('course-select'); if (h) h.value='';
            return { search: s ? s.value : null, hidden: h ? h.value : null }; })()`);
    }
    await j.evaluate('window.__alerts.length = 0;');
    return JSON.parse(await j.evaluate(btnState));
}

async function tap(j) {
    await j.click('#main-save-btn', null, { settleMs: 2200 });
    const st = JSON.parse(await j.evaluate(btnState));
    const alerts = JSON.parse(await j.evaluate('JSON.stringify(window.__alerts.slice())'));
    const url = await j.evaluate("location.pathname.split('/').pop()+location.search");
    const ready = await j.evaluate(`/Round Ready/.test(document.body.innerText||'')`);
    await j.evaluate('window.__alerts.length = 0;');
    return { ...st, alerts, url, roundReady: ready };
}

(async () => {
    const problems = [];
    const report = { structure: structuralAudit() };
    if (report.structure.error) bail(report.structure.error);

    const cases = {};
    const run = async (name, opts) => {
        const j = await openJourney({ db: { events: {}, trips: {}, global_courses: {} } });
        try {
            const before = await drive(j, opts);
            const first = await tap(j);
            const second = await tap(j);
            const d = await j.harvest();
            cases[name] = { before, first, second, events: Object.keys(d.events || {}) };
        } finally { await j.close(); }
    };

    await run('overAllocatedPool', { pool: true });
    await run('noCourse', { clearCourse: true });
    await run('wolfWrongCount', { format: 'wolf', players: 3 });
    await run('validRound', {});

    const c = cases;
    if (!c.validRound.first.roundReady && c.validRound.events.length === 0) {
        bail('the control round did not save at all, so nothing about a refusal was measured');
    }

    const alerted = x => x.alerts.length > 0;
    const live = x => x.disabled === false;

    const A = {
        // TEST 1 - the pool refusal
        poolRefusalStillAlerts: alerted(c.overAllocatedPool.first)
            && /Main Pool/.test(c.overAllocatedPool.first.alerts.join(' ')),
        poolRefusalWritesNothing: c.overAllocatedPool.events.length === 0,
        poolRefusalLeavesTheButtonLive: live(c.overAllocatedPool.first),
        poolRefusalRestoresTheLabel: c.overAllocatedPool.first.label === c.overAllocatedPool.before.label,
        // THE ONE THAT MATTERS: pressing again must speak again.
        poolRefusalSpeaksOnTheSecondTap: alerted(c.overAllocatedPool.second)
            && /Main Pool/.test(c.overAllocatedPool.second.alerts.join(' ')),

        // CONTROLS - the refusals that already restored must still restore
        noCourseStillAlerts: alerted(c.noCourse.first)
            && /Golf Course/i.test(c.noCourse.first.alerts.join(' ')),
        noCourseLeavesTheButtonLive: live(c.noCourse.first),
        noCourseSpeaksOnTheSecondTap: alerted(c.noCourse.second),
        wolfStillAlerts: alerted(c.wolfWrongCount.first)
            && /Wolf/i.test(c.wolfWrongCount.first.alerts.join(' ')),
        wolfLeavesTheButtonLive: live(c.wolfWrongCount.first),
        wolfSpeaksOnTheSecondTap: alerted(c.wolfWrongCount.second),

        // CONTROL - a valid round still saves and still moves on
        validRoundSaves: c.validRound.events.length > 0,
        validRoundReachesRoundReady: c.validRound.first.roundReady === true,
        validRoundLeavesTheButtonLive: live(c.validRound.first),

        // TEST 2 - STRUCTURAL. No early return after the disable may be uncovered.
        everyRefusalRestoresTheButton: report.structure.uncovered.length === 0,
        // ...and there is ONE restore, not a copy per refusal. Three copies is how
        // this defect happened: the fourth refusal simply did not get one.
        theRestoreIsNotDuplicated: report.structure.restoreLines.length === 1,
        theRestoreIsAFinally: !!report.structure.coveringFinally,
    };
    Object.keys(A).forEach(k => { if (!A[k]) problems.push(k + ': FAILED'); });

    report.cases = c;
    report.assertions = A;
    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
