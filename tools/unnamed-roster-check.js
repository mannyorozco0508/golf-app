#!/usr/bin/env node
// ============================================================================
// A MONEY ROUND THAT STARTS WITH NOBODY NAMED, AND SAYS NOTHING.
//
// admin.html's save path writes a blank name box as `Player ${idx + 1}`. Live
// round Y5VGXM was created that way: EIGHT golfers, every name "Player N", every
// hcp "", a $40 buy-in Main Pool with $100 of net money on it. Nothing on the
// wizard mentioned it, before or after.
//
// Inside one round those names are distinct and the money settles correctly -
// duplicatePlayerNames() deliberately does not refuse them. The cost is ACROSS
// rounds: isPlaceholderPlayerName() in action-model.js makes every one of them
// unmatchable, so the round can never join a trip or a Ryder Cup. That is a
// decision the organizer is entitled to make, and it is being made for him
// silently at the moment he presses Save.
//
// WARN, DO NOT BLOCK. The app gets out of the way. So this measures three
// separate things, and the second is the one a blocking gate would fail:
//
//   1. it SPEAKS   - unnamed golfers produce a message that names the count
//   2. it YIELDS   - continuing still saves the round, exactly as today
//   3. it is QUIET - a fully named roster sees nothing at all
//
// plus the standing controls: declining writes nothing, and the refusals that
// genuinely BLOCK (no course, Wolf without four) still block.
//
// DRIVEN THROUGH THE WIZARD'S OWN CONTROLS. Course picked from the page's own
// dropdown, rows added with the page's own Add Player button, steps advanced
// with the page's own Next, saved with the page's own button. The only thing
// typed by hand is what a golfer types - and in the case that matters, that is
// nothing at all, which is the entire point.
//
//   node tools/unnamed-roster-check.js
//
//   exit 0   the wizard speaks, yields, and stays quiet when it should
//   exit 1   a divergence the JSON names
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { openJourney, fileUrl } = require('./lib/journey.js');

// window.confirm's answer is what separates "warn" from "block", so it is the
// parameter of the whole check rather than a constant.
const capture = answer => `
(function(){ window.__alerts=[]; window.__confirms=[];
  window.alert=function(m){window.__alerts.push(String(m));};
  window.confirm=function(m){window.__confirms.push(String(m)); return ${answer ? 'true' : 'false'};};
  window.print=function(){};
})();`;

const btnState = `(() => { const b=document.getElementById('main-save-btn');
  return JSON.stringify({ label: b ? b.innerText.trim() : null,
    disabled: b ? !!b.disabled : null, present: !!b }); })()`;

function bail(msg) {
    console.error('unnamed-roster-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// `names` null means TYPE NOTHING - the default state of a freshly added row,
// and the state the live round was actually saved in.
async function drive(j, opts) {
    const o = opts || {};
    await j.goto(fileUrl('admin.html', ''), 2800);
    await j.evaluate(capture(o.answer !== false));

    await j.evaluate(`(() => { const s=document.getElementById('course-search-input');
        s.value='True Blue Golf Club'; s.dispatchEvent(new Event('input',{bubbles:true}));
        const o=Array.from(document.querySelectorAll('#course-dropdown .custom-select-option'))
          .find(x=>/trueblue/.test(x.getAttribute('onclick')||'')); if(o)o.click(); return !!o; })()`);

    const wanted = o.players === undefined ? 4 : o.players;
    const names = o.names ? JSON.stringify(o.names) : 'null';
    const rows = await j.evaluate(`(() => {
        const add=Array.from(document.querySelectorAll('button'))
            .find(b=>/addNewPlayerAndRefresh/.test(b.getAttribute('onclick')||''));
        while (document.querySelectorAll('.player-row').length < ${wanted} && add) add.click();
        const ins=Array.from(document.querySelectorAll('.player-row .p-name-input'));
        const want=${names};
        // TOUCHED NOTHING when want is null. Not blanked, not cleared - a row that
        // was never typed in, which is the only shape that reproduces Y5VGXM.
        if (want) want.forEach((n,i)=>{ if(ins[i]){ ins[i].value=n;
            ins[i].dispatchEvent(new Event('change',{bubbles:true})); }});
        return JSON.stringify({ rows: document.querySelectorAll('.player-row').length,
            typed: Array.from(document.querySelectorAll('.player-row .p-name-input')).map(e=>e.value) }); })()`);

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
            // BALANCED ON PURPOSE. An over-allocated pot is a DIFFERENT refusal,
            // and the first version of this check tripped it - the Main Pool alert
            // then satisfied "the wizard said something about the roster" on a run
            // where the roster was never mentioned at all. KP is zeroed so the
            // remainder falls to skins and the pot validates.
            set('mp-buyin',40); set('mp-kp-amount',0); set('mp-net-amount',100); return true; })()`);
    }
    for (let i = 0; i < 10; i++) {
        const at = await j.evaluate(`(() => { const b=document.getElementById('main-save-btn');
            return !!(b && b.offsetParent !== null); })()`);
        if (at) break;
        const ok = await j.click('.wizard-btn-next', null, { settleMs: 450 });
        if (!ok) break;
    }
    if (o.clearCourse) {
        await j.evaluate(`(() => { const s=document.getElementById('course-search-input');
            if (s) s.value='';
            const h=document.getElementById('course-select'); if (h) h.value=''; return true; })()`);
    }
    await j.evaluate('window.__alerts.length = 0; window.__confirms.length = 0;');
    return { button: JSON.parse(await j.evaluate(btnState)), roster: JSON.parse(rows) };
}

async function tap(j) {
    await j.click('#main-save-btn', null, { settleMs: 2400 });
    const st = JSON.parse(await j.evaluate(btnState));
    return Object.assign(st, {
        alerts: JSON.parse(await j.evaluate('JSON.stringify(window.__alerts.slice())')),
        confirms: JSON.parse(await j.evaluate('JSON.stringify(window.__confirms.slice())')),
        roundReady: await j.evaluate(`/Round Ready/.test(document.body.innerText||'')`),
    });
}

(async () => {
    const problems = [];
    const cases = {};
    const run = async (name, opts) => {
        const j = await openJourney({ db: { events: {}, trips: {}, global_courses: {} } });
        try {
            const before = await drive(j, opts);
            const first = await tap(j);
            const d = await j.harvest();
            const written = Object.keys(d.events || {});
            cases[name] = { before, first, written,
                // WHAT WAS ACTUALLY STORED, so "it saved" is not inferred from a screen.
                players: written.length ? ((d.events[written[0]] || {}).players || []).map(
                    p => ({ name: p.name, hcp: p.hcp })) : [] };
        } finally { await j.close(); }
    };

    // Y5VGXM's shape: nobody typed a name, and there is real money on it.
    await run('unnamedContinued', { players: 4, names: null, pool: true, answer: true });
    await run('unnamedDeclined',  { players: 4, names: null, pool: true, answer: false });
    // The control the whole check rests on.
    await run('allNamed',   { players: 4, names: ['Marty Sharp','Manny Orozco','Lance Webb','Zach Hill'] });
    // The refusals that genuinely block must still block.
    await run('noCourse',   { players: 4, names: ['Marty Sharp','Manny Orozco','Lance Webb','Zach Hill'], clearCourse: true });
    await run('wolfThree',  { players: 3, names: ['Marty Sharp','Manny Orozco','Lance Webb'], format: 'wolf' });

    const c = cases;
    // A RUN THAT SAVED NOTHING ON THE CLEAN PATH MEASURED NOTHING. Every assertion
    // below is about the difference between saving and not saving; if the good case
    // never saved, "the unnamed round still saved" would be unprovable and
    // "the blocked round did not" would be trivially true.
    if (c.allNamed.written.length === 0) {
        bail('the fully named control round did not save at all, so nothing about a '
             + 'warning or a refusal was measured. Screen said: '
             + JSON.stringify(c.allNamed.first.alerts));
    }
    if (c.unnamedContinued.before.roster.rows < 4) {
        bail('the wizard did not reach four player rows, so the unnamed roster was never built');
    }
    // And the untyped rows must genuinely be untyped, or "unnamed" is a fiction.
    if (c.unnamedContinued.before.roster.typed.some(v => String(v).trim() !== '')) {
        bail('the roster rows were not blank on arrival: '
             + JSON.stringify(c.unnamedContinued.before.roster.typed));
    }

    const spoke = x => x.first.alerts.length > 0 || x.first.confirms.length > 0;
    const said = x => (x.first.alerts.concat(x.first.confirms)).join(' ');

    const A = {
        // ---- 1. IT SPEAKS -------------------------------------------------
        // SPECIFIC, NOT MERELY LOUD. "the page said something" is satisfied by any
        // unrelated refusal - it was satisfied by an over-allocated Main Pool alert
        // on a run where the roster was never mentioned, which is the whole class of
        // vacuous assertion this repo keeps finding. The message has to be ABOUT the
        // names.
        unnamedRosterIsMentionedAtAll: /name/i.test(said(c.unnamedContinued)),
        // Naming the COUNT is what makes it actionable - "some golfers" sends an
        // organizer back to a roster to count them himself.
        theMessageNamesHowMany: /\b4\b/.test(said(c.unnamedContinued)),
        // The consequence, said outright. This is the whole reason the message
        // exists; without it the warning is a nag about cosmetics.
        theMessageNamesTheTripCost: /trip|cup/i.test(said(c.unnamedContinued)),

        // ---- 2. IT YIELDS -------------------------------------------------
        // A BLOCKING GATE FAILS HERE. Continuing must save the round.
        continuingStillSavesTheRound: c.unnamedContinued.written.length === 1,
        // and it saves the SAME thing it always did, placeholders and all.
        continuingSavesThePlaceholders:
            JSON.stringify(c.unnamedContinued.players.map(p => p.name))
                === JSON.stringify(['Player 1','Player 2','Player 3','Player 4']),
        continuingReachesRoundReady: c.unnamedContinued.first.roundReady === true,

        // ---- and declining is a real choice, not a delay -------------------
        decliningWritesNothing: c.unnamedDeclined.written.length === 0,
        decliningLeavesTheButtonLive: c.unnamedDeclined.first.disabled === false,

        // ---- 3. IT IS QUIET -----------------------------------------------
        // The control that stops this becoming a warning nobody reads.
        namedRosterSeesNoMessage: !spoke(c.allNamed),
        // and specifically not this message, so a future unrelated alert on that path
        // cannot be mistaken for this one regressing.
        namedRosterSeesNoNameMessage: !/name/i.test(said(c.allNamed)),
        namedRosterSaves: c.allNamed.written.length === 1,
        namedRosterStoresTheNames:
            JSON.stringify(c.allNamed.players.map(p => p.name))
                === JSON.stringify(['Marty Sharp','Manny Orozco','Lance Webb','Zach Hill']),

        // ---- THE BLOCKING REFUSALS STILL BLOCK ----------------------------
        noCourseStillBlocks: c.noCourse.written.length === 0
            && /Golf Course/i.test(said(c.noCourse)),
        noCourseLeavesTheButtonLive: c.noCourse.first.disabled === false,
        wolfWithThreeStillBlocks: c.wolfThree.written.length === 0
            && /Wolf/i.test(said(c.wolfThree)),
        wolfLeavesTheButtonLive: c.wolfThree.first.disabled === false,
    };
    Object.keys(A).forEach(k => { if (!A[k]) problems.push(k + ': FAILED'); });

    console.log(JSON.stringify({ cases: c, assertions: A, problems: problems,
        verdict: problems.length ? 'FAIL' : 'PASS' }, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
