#!/usr/bin/env node
// ============================================================================
// A ROUND THIS PHONE CANNOT WRITE TO MUST NEVER TRAP IT (gps-trapfix, 2026-10-14)
//
//   node tools/trap-check.js
//
// Manny's phone, TADPJH (a one-golfer GPS round at Pine Lakes): "Could not save" +
// "1 change the server refused", and Resume, the GPS door and Tools › "Pick another
// course" all went straight back to the round's hole 2. TADPJH was no longer on the
// server; the phone kept its own copy (the offline snapshot) and kept opening it.
//
// Cold Chrome, the app (window.__hardpanDoors). window.__coldRefuse makes the stand-in
// database refuse writes the way the rules do (PERMISSION_DENIED).
//   1  GONE: the round is not on the server, the phone has its copy + "last round".
//      Opening it says so, with "Exit this round"; Exit clears it and opens the picker.
//   2  REFUSED: the round is there but the server refuses the score. A clear message
//      with "Exit this round" (not only "check your signal"); the refused change is
//      not retried; Exit opens the picker and forgets the round.
//   3  The doors: a gone round is not resumed (GPS door -> the picker, no Resume).
//   4  Tools › "Pick another course" from a GOOD round: the picker, and it stays there;
//      the round is no longer the one Resume / the GPS door goes back to.
//   5  CONTROL: a good round - no message, the GPS door goes back to it.
// ============================================================================
'use strict';
const path = require('path');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true; window.__freshPhone = true;';
const DB = (ev) => ({ events: ev || {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const CODE = 'TRAPX1';
function round() {
    const r = wizardSavedRound({ code: CODE, golfers: 1, names: ['Manny Orozco'], hcps: [9], ownerUid: 'anon-cold', thru: 1, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
// The phone's own state, written ONCE per launch (the pre-script runs on every page).
const SEED = (withSnap) => "(function(){ try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded','1');"
    + " localStorage.setItem('hardpan_last_round', JSON.stringify({ code: '" + CODE + "', at: Date.now(), course: 'Caledonia Golf & Fish Club' }));"
    + " localStorage.setItem('hardpan_round_side', 'gps|" + CODE + "'); localStorage.setItem('hardpan_front_door', 'gps'); localStorage.setItem('lastRoomCode', '" + CODE + "');"
    + (withSnap ? " localStorage.setItem('golfapp_snap_v1_" + CODE + "', JSON.stringify({ at: Date.now(), data: " + JSON.stringify(round()) + ", meta: null }));" : '')
    + " } catch (e) {} })();";
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 3500, viewport: { width: 390, height: 844 } }, o)); if (!r.ok) throw new Error(r.reason); return r; };
const STATE = "JSON.stringify({ url: document.URL.split('/').pop(), view: (document.querySelector('.hp-view.on')||{}).id || null,"
    + " stuck: (function(){ var s = document.getElementById('hp-stuck-round'); return s && getComputedStyle(s).display !== 'none' ? s.innerText.replace(/\\s+/g,' ') : null; })(),"
    + " exit: !!document.querySelector('#hp-stuck-round [data-hp-exit]'),"
    + " gps: (function(){ var o = document.getElementById('gps-overlay'); return !!(o && getComputedStyle(o).display !== 'none' && o.offsetParent !== null); })(),"
    + " resume: (document.getElementById('hp-resume')||{}).innerText || '',"
    + " last: localStorage.getItem('hardpan_last_round'), side: localStorage.getItem('hardpan_round_side'),"
    + " queue: (function(){ try { return JSON.parse(localStorage.getItem('golfapp_wq_v1')||'[]').length; } catch(e){ return -1; } })(),"
    + " snap: !!localStorage.getItem('golfapp_snap_v1_" + CODE + "'),"
    + " badge: (document.getElementById('offline-badge')||{}).innerText || '', save: (document.getElementById('save-state')||{}).innerText || '',"
    + " refused: (window.__coldWrites||[]).filter(function(w){ return w.refused; }).map(function(w){ return w.op + ' ' + w.path; }), e: window.__e })";
const SCORE = "(function(){ var i = document.querySelector('.score-input:not([disabled])'); if (!i) return 'no box'; i.value = '5'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return 'typed'; })()";
const EXIT = "(function(){ var b = document.querySelector('#hp-stuck-round [data-hp-exit]'); if (!b) return 'no exit'; b.click(); return 'exit'; })()";
const PICK = "(function(){ var b = document.querySelector('#gps-overlay .gps-pick-course'); if (!b) return 'no pick'; b.click(); return 'pick'; })()";

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };

    // 1: GONE - not on the server, the phone has its copy.
    let r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({}), preScript: APP + ERR + SEED(true), steps: [{ sleep: 2500 }, { expression: STATE },
        { expression: EXIT }, { sleep: 2500 }, { expression: STATE }] });
    let [a, b] = J(r);
    report.gone = { open: a, exit: b };
    f(a.stuck && /isn.t on the server/i.test(a.stuck) && a.exit, '1: a round gone from the server says nothing / no Exit: ' + JSON.stringify(a));
    f(/^home\.html/.test(b.url) && b.view === 'v-gps' && !b.last && !/TRAPX1/.test(b.side || '') && !b.snap, '1: Exit did not clear the round and open the picker: ' + JSON.stringify(b));

    // 2: REFUSED - the round is there, the server refuses the write.
    r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({ [CODE]: round() }), preScript: APP + ERR + SEED(false) + "window.__coldRefuse = '^events/';", steps: [{ sleep: 2500 },
        { expression: SCORE }, { sleep: 2500 }, { expression: STATE }, { sleep: 6000 }, { expression: STATE }, { expression: EXIT }, { sleep: 2500 }, { expression: STATE }] });
    let [, c1, c2, c3] = [null].concat(J(r));
    report.refused = { after: c1, later: c2, exit: c3 };
    f(c1.refused.length >= 1, '2: the stand-in never refused a write (nothing tested): ' + JSON.stringify(c1));
    f(c1.stuck && /can.t save to this round/i.test(c1.stuck) && c1.exit, '2: a refused write has no clear message / Exit: ' + JSON.stringify(c1));
    f(c2.refused.length === c1.refused.length && c2.queue === 0, '2: the refused change is being retried: ' + JSON.stringify([c1.refused, c2.refused, c2.queue]));
    f(/^home\.html/.test(c3.url) && c3.view === 'v-gps' && !c3.last, '2: Exit did not leave the round for the picker: ' + JSON.stringify(c3));

    // 3: the doors with a gone round: no Resume, the GPS door opens the picker.
    r = await go({ url: fileUrl('home.html', ''), db: DB({}), preScript: APP + ERR + SEED(true), steps: [{ sleep: 2500 }, { expression: STATE },
        { tap: '#v-main .hp-door.gps' }, { sleep: 2500 }, { expression: STATE }] });
    [a, b] = J(r);
    report.doors = { main: a, gpsDoor: b };
    f(!/Resume/.test(a.resume), '3: Resume offered for a round gone from the server: ' + a.resume);
    f(/^home\.html/.test(b.url) && b.view === 'v-gps', '3: the GPS door went back to the gone round: ' + JSON.stringify(b));

    // 4: Pick another course from a good round -> the picker, and it stays.
    r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({ [CODE]: round() }), preScript: APP + ERR + SEED(false), webgl: true, steps: [{ sleep: 2500 },
        { expression: "(function(){ var b = document.getElementById('fd-gps-btn'); if (b && !(document.getElementById('gps-overlay') && document.getElementById('gps-overlay').offsetParent)) b.click(); return 'gps'; })()" }, { sleep: 2500 },
        { expression: PICK }, { sleep: 4000 }, { expression: STATE }, { tap: '#v-main .hp-door.gps' }, { sleep: 300 }, { expression: STATE }] });
    const p = J(r);
    report.pick = p;
    f(/^home\.html/.test(p[0].url) && p[0].view === 'v-gps' && !p[0].last, '4: Pick another course did not open (and stay on) the picker: ' + JSON.stringify(p[0]));

    // 5: CONTROL - a good round: no message; the GPS door goes back to it.
    r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({ [CODE]: round() }), preScript: APP + ERR + SEED(false), steps: [{ sleep: 2500 }, { expression: SCORE }, { sleep: 2000 }, { expression: STATE },
        { expression: "(function(){ location.href = 'home.html'; return 'home'; })()" }, { sleep: 2500 }, { tap: '#v-main .hp-door.gps' }, { sleep: 2500 }, { expression: STATE }] });
    [a, b] = J(r);
    report.control = { card: a, door: b };
    f(!a.stuck && !a.refused.length, '5: a good round shows the stuck message: ' + JSON.stringify(a));
    f(/^index\.html\?game=TRAPX1/.test(b.url), '5: the GPS door no longer resumes a good round: ' + JSON.stringify(b));
    // The stand-in's push() is the parent ref, so the audit log's own sort meets a null entry
    // (index.html auditLog, the same on every branch): a harness artifact, not this fix's.
    [a, b].concat(p).forEach((x) => { const e = (x.e || []).filter((m) => !/reading 'ts'/.test(m)); if (e.length) fails.push('errors: ' + e.join(' | ')); });

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
