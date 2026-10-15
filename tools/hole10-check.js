#!/usr/bin/env node
// ============================================================================
// START ON 10, WHOSE SCORE THE GPS SCREEN SHOWS, AND THE SCORE BUTTON (gps-start10, 2026-10-14)
//
//   node tools/hole10-check.js
//
// Cold Chrome, the app (window.__hardpanDoors), GPS side remembered for the round.
//   1  A round set to start on 10 opens GPS on 10; Next runs 10..18 then 1..9; Prev from 1
//      goes back to 18; a group with its own tee (groupStartingHoles) opens on ITS hole;
//      a round changed to start on 10 while open (Round Setup saved it) moves there too.
//   2  Resume (the round opened again) lands on the last hole this phone was on.
//   3  A score typed from GPS on hole 10 saves to p<id>_h10 (the real hole number).
//   4  The score button: no score -> "Enter score"; scored -> just the number ("5").
//   5  Whose score: the organizer -> theirs (player 1); a spectator who picked a golfer ->
//      that golfer's; a spectator who picked no one -> the organizer's (player 1). A
//      spectator never writes.
//   6  The name tag ("Group 2 · Eli ▾"): first open with no pick asks "Who are you?" once (group,
//      then golfer; Skip = the group's first golfer); the pick is kept across holes and a reopen;
//      swiping the score flips to the next / previous golfer in the group; the score button opens
//      THAT golfer's box; a spectator can view any golfer and still never writes.
// ============================================================================
'use strict';
const path = require('path');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true; window.__freshPhone = true;';
const DB = (ev) => ({ events: ev || {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const CODE = 'HOLE10';
function round(owner, extra) {
    const r = wizardSavedRound({ code: CODE, golfers: 2, names: ['Manny Orozco', 'Joe Russo'], hcps: [9, 12], ownerUid: owner, thru: 0, flights: false,
        overrides: Object.assign({ additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', startingHole: 10 }, extra || {}) });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const SEED = (more) => "(function(){ try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded','1'); localStorage.setItem('hardpan_round_side', 'gps|" + CODE + "'); " + (more || '') + " } catch (e) {} })();";
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 3500, viewport: { width: 390, height: 844 }, webgl: true }, o)); if (!r.ok) throw new Error(r.reason); return r; };
const OPEN_GPS = "(function(){ if (window.HardPanGps && HardPanGps.side && HardPanGps.side() === 'gps') return 'on'; var b = document.getElementById('fd-gps-btn'); if (b) b.click(); return 'tap'; })()";
const ST = "JSON.stringify({ hole: window.HardPanGps && HardPanGps.hole ? HardPanGps.hole() : null, card: typeof currentViewedHole !== 'undefined' ? currentViewedHole : null, side: window.HardPanGps && HardPanGps.side ? HardPanGps.side() : null,"
    + " btn: (function(){ var b = document.querySelector('#gps-overlay .gps-score'); return b ? { text: b.innerText.trim(), shown: getComputedStyle(b).display !== 'none' } : null; })(),"
    + " writes: (window.__coldWrites||[]).filter(function(w){ return /scores/.test(w.path); }).map(function(w){ return w.op + ' ' + w.path + '=' + JSON.stringify(w.value); }), e: window.__e })";
const NEXT = { expression: "(function(){ var b = document.querySelector('#gps-overlay .gps-next') || document.querySelector('#gps-overlay .gps-score-next'); b.click(); return 'next'; })()" };
const PREV = { expression: "(function(){ var b = document.querySelector('#gps-overlay .gps-prev') || document.querySelector('#gps-overlay .gps-score-prev'); b.click(); return 'prev'; })()" };
const W = { sleep: 350 };

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const errs = (x) => (x.e || []).filter((m) => !/reading 'ts'/.test(m));

    // 1: opens on 10; 10..18 then 1..9; Prev from 1 -> 18.
    const steps = [{ sleep: 2500 }, { expression: OPEN_GPS }, { sleep: 2500 }, { expression: ST }];
    for (let i = 0; i < 9; i++) steps.push(NEXT, W, { expression: ST });
    steps.push(PREV, W, { expression: ST });
    let r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({ [CODE]: round('anon-cold') }), preScript: APP + ERR + SEED(), steps });
    const seq = J(r);
    report.order = seq.map((x) => x.hole);
    f(seq[0].hole === 10 && seq[0].side === 'gps', '1: a start-on-10 round did not open GPS on 10: ' + JSON.stringify(seq[0]));
    f(JSON.stringify(report.order) === JSON.stringify([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 18]), '1: Next / Prev do not follow play order (10..18, 1, back to 18): ' + JSON.stringify(report.order));
    f(seq.every((x) => x.hole === x.card), '1: GPS and the card disagree on the hole: ' + JSON.stringify(seq.map((x) => [x.hole, x.card])));
    seq.forEach((x) => { if (errs(x).length) fails.push('1: errors ' + errs(x).join(' | ')); });

    // 1b: a group with its own tee: group 2 off the 10th on a round off the 1st.
    r = await go({ url: fileUrl('index.html', 'game=' + CODE + '&group=1'), db: DB({ [CODE]: round('someone-else', { startingHole: 1, groupStartingHoles: { 1: 10 } }) }), preScript: APP + ERR + SEED(), steps: [{ sleep: 2500 }, { expression: OPEN_GPS }, { sleep: 2500 }, { expression: ST }] });
    const g2 = J(r)[0];
    f(g2.hole === 10, '1: my group\'s own tee (groupStartingHoles) not used: ' + JSON.stringify(g2));

    // 1c: the round was open on hole 1 (start on 1), then Round Setup saved "Start on 10" and
    // nothing has been scored: GPS moves to 10.
    r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({ [CODE]: round('anon-cold', { startingHole: 1 }) }), preScript: APP + ERR + SEED(), steps: [{ sleep: 2500 }, { expression: OPEN_GPS }, { sleep: 2500 }, { expression: ST },
        { deliver: { path: 'events/' + CODE, value: round('anon-cold') } }, { sleep: 1500 }, { expression: ST }] });
    const [c0, c1] = J(r);
    report.changed = [c0.hole, c1.hole];
    f(c0.hole === 1 && c1.hole === 10, '1: a round changed to start on 10 (no scores yet) stayed on 1: ' + JSON.stringify([c0.hole, c1.hole]));

    // 2 + 3 + 4: score hole 10 from GPS; the button; Next to 11, 12; reopen -> 12.
    r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({ [CODE]: round('anon-cold') }), preScript: APP + ERR + SEED(), steps: [{ sleep: 2500 }, { expression: OPEN_GPS }, { sleep: 2500 }, { expression: ST },
        { expression: "(function(){ document.querySelector('#gps-overlay .gps-score').click(); return 'score'; })()" }, { sleep: 600 },
        { expression: "(function(){ var i = document.querySelector('#hole-view-card .score-input[data-hole=\"10\"]:not([disabled])'); if (!i) return 'no box'; i.value = '5'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); return 'typed'; })()" }, { sleep: 800 },
        { expression: OPEN_GPS }, { sleep: 1200 }, { expression: ST },
        NEXT, W, NEXT, W, { expression: ST },
        { expression: "(function(){ location.reload(); return 'reload'; })()" }, { sleep: 4500 }, { expression: OPEN_GPS }, { sleep: 2000 }, { expression: ST }] });
    const [s0, s1, s2, s3] = J(r);
    report.score = { before: s0.btn, after: s1.btn, writes: s1.writes, at: s2.hole, resumed: s3.hole };
    f(s0.btn && s0.btn.shown && s0.btn.text === 'Enter score', '4: no score yet: the button must say "Enter score": ' + JSON.stringify(s0.btn));
    f(s1.writes.some((w) => /^set events\/HOLE10\/scores\/p\d+_h10=5$/.test(w)), '3: the score did not save to hole 10: ' + JSON.stringify(s1.writes));
    f(s1.hole === 10 && s1.btn && s1.btn.text === '5', '4: scored: the button must be just "5": ' + JSON.stringify([s1.hole, s1.btn]));
    f(s2.hole === 12 && s3.hole === 12, '2: Resume did not reopen the last hole (12): ' + JSON.stringify([s2.hole, s3.hole]));

    // 5: whose score. Player 1 (the organizer) 4 on 10, player 2 6 on 10.
    const scored = () => { const x = round('organizer-uid'); x.scores = {}; x.scores['p' + x.players[0].id + '_h10'] = 4; x.scores['p' + x.players[1].id + '_h10'] = 6; return x; };
    const p2 = scored().players[1].id;
    r = await go({ url: fileUrl('index.html', 'game=' + CODE + '&spectate=1'), db: DB({ [CODE]: scored() }), preScript: APP + ERR + SEED(), steps: [{ sleep: 2500 }, { expression: OPEN_GPS }, { sleep: 2500 }, PREV, W, { expression: ST }] });
    const v0 = J(r)[0];
    r = await go({ url: fileUrl('index.html', 'game=' + CODE + '&spectate=1'), db: DB({ [CODE]: scored() }), preScript: APP + ERR + SEED("localStorage.setItem('golfapp_me_" + CODE + "', '" + p2 + "');"), steps: [{ sleep: 2500 }, { expression: OPEN_GPS }, { sleep: 2500 }, PREV, W, { expression: ST },
        { expression: "(function(){ var b = document.querySelector('#gps-overlay .gps-score'); if (b && getComputedStyle(b).display !== 'none') b.click(); return 'tap'; })()" }, { sleep: 800 }, { expression: ST }] });
    const [v1, v2] = J(r);
    r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({ [CODE]: (() => { const x = scored(); x.ownerUid = 'anon-cold'; return x; })() }), preScript: APP + ERR + SEED(), steps: [{ sleep: 2500 }, { expression: OPEN_GPS }, { sleep: 2500 }, PREV, W, { expression: ST }] });
    const v3 = J(r)[0];
    report.whose = { spectatorNoPick: v0.btn, spectatorPicked: v1.btn, organizer: v3.btn, spectatorWrites: v2.writes };
    f(v0.hole === 10 && v0.btn && v0.btn.text === '4', '5: a spectator who picked no one must see the organizer\'s score (4): ' + JSON.stringify(v0.btn));
    f(v1.btn && v1.btn.text === '6', '5: a spectator who picked Joe must see Joe\'s score (6): ' + JSON.stringify(v1.btn));
    f(v3.btn && v3.btn.text === '4', '5: the organizer must see their own score (4): ' + JSON.stringify(v3.btn));
    f(!v2.writes.length && !v1.writes.length && v2.side === 'gps', '5: a spectator wrote a score, or the tap opened the editor: ' + JSON.stringify([v2.writes, v2.side]));
    [g2, c0, c1, s0, s1, s2, s3, v0, v1, v2, v3].forEach((x) => { if (errs(x).length) fails.push('errors ' + errs(x).join(' | ')); });

    // 6: the name tag + "Who are you?" + swipe. 6 golfers = Group 1 (4) and Group 2 (2), off the 1st.
    const six = () => { const x = wizardSavedRound({ code: CODE, golfers: 6, names: ['Ann Able', 'Ben Bravo', 'Cal Cole', 'Dee Dunn', 'Eli Echo', 'Fay Fox'], hcps: [1, 2, 3, 4, 5, 6], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', startingHole: 1 } });
        delete x.moneyPool; delete x.kpWinners; delete x.kpConfirmed; x.scores = { ['p' + x.players[4].id + '_h1']: 7, ['p' + x.players[0].id + '_h1']: 3 }; return x; };
    const ids = six().players.map((p) => String(p.id));
    const WHO = "JSON.stringify({ tag: (function(){ var b = document.querySelector('#gps-overlay .gps-who'); return b && getComputedStyle(b).display !== 'none' ? b.innerText.trim() : null; })(), sheet: (function(){ var s = document.querySelector('#gps-overlay .gps-who-sheet'); return s && s.style.display !== 'none' ? s.innerText.replace(/\\s+/g, ' ').trim() : null; })(), btn: (document.querySelector('#gps-overlay .gps-score')||{}).innerText, hole: HardPanGps.hole(), side: HardPanGps.side(), pick: localStorage.getItem('hardpan_gps_golfer_" + CODE + "'), active: document.activeElement && document.activeElement.getAttribute('data-player-id'), writes: (window.__coldWrites||[]).filter(function(w){ return !/auditLog/.test(w.path); }).map(function(w){ return w.op + ' ' + w.path; }), e: window.__e })";
    const CLICK = (sel) => ({ expression: "(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return 'none'; b.click(); return 'ok'; })()" });
    const SWIPE = (dx) => ({ expression: "(function(){ var c = document.querySelector('#gps-overlay .gps-score-col'), r = c.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; c.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true })); c.dispatchEvent(new PointerEvent('pointerup', { clientX: x + " + dx + ", clientY: y + 4, bubbles: true })); return 'swipe'; })()" });
    r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({ [CODE]: six() }), preScript: APP + ERR + SEED(), steps: [{ sleep: 2500 }, { expression: OPEN_GPS }, { sleep: 2500 }, { expression: WHO },
        CLICK('#gps-overlay [data-who-group="2"]'), W, { expression: WHO },
        CLICK('#gps-overlay [data-who-id="' + ids[4] + '"]'), W, { expression: WHO },
        NEXT, W, PREV, W, { expression: WHO },
        SWIPE(-90), W, { expression: WHO }, SWIPE(90), W, { expression: WHO },
        { expression: "(function(){ location.reload(); return 'reload'; })()" }, { sleep: 4500 }, { expression: OPEN_GPS }, { sleep: 2000 }, { expression: WHO },
        ] });
    const w = J(r);
    // The Group 2 scorekeeper (their link): the tag lists Group 2's golfers; the score button opens
    // the SHOWN golfer's own box (Fay, not the first empty one).
    const FOCUS = { expression: "(function(){ window.__focused = []; var f0 = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function () { window.__focused.push(this.getAttribute('data-player-id') + '@' + this.getAttribute('data-hole')); return f0.apply(this, arguments); }; return 'hook'; })()" };
    r = await go({ url: fileUrl('index.html', 'game=' + CODE + '&group=2'), db: DB({ [CODE]: six() }), preScript: APP + ERR + SEED("localStorage.setItem('hardpan_gps_whoasked_" + CODE + "', '1');"), steps: [{ sleep: 2500 }, { expression: OPEN_GPS }, { sleep: 2500 }, { expression: WHO },
        CLICK('#gps-overlay .gps-who'), W, { expression: WHO }, CLICK('#gps-overlay [data-who-id="' + ids[5] + '"]'), W, FOCUS,
        CLICK('#gps-overlay .gps-score'), { sleep: 700 }, { expression: "JSON.stringify(Object.assign(JSON.parse(" + WHO + "), { active: (window.__focused || [])[0] || null }))" }] });
    const kp = J(r);
    report.scorekeeper = kp.map((x) => [x.tag, x.sheet, x.btn, x.active]);
    f(kp[0].tag === 'Group 2 \u00b7 Eli \u25BE', '6: a Group 2 scorekeeper with no pick: their first golfer (Eli): ' + JSON.stringify(kp[0].tag));
    f(kp[1].sheet && /Whose score\? Group 2/.test(kp[1].sheet) && /Fay Fox/.test(kp[1].sheet) && !/Ann Able/.test(kp[1].sheet), '6: the scorekeeper\'s tag sheet is not their group\'s golfers: ' + JSON.stringify(kp[1].sheet));
    f(kp[2].side === 'bets' && kp[2].active === ids[5] + '@1', '6: the score button did not open Fay\'s own box: ' + JSON.stringify([kp[2].side, kp[2].active]));
    report.who = w.map((x) => [x.tag, x.sheet, x.btn, x.pick]);
    f(w[0].sheet && /Who are you\? Your group:/.test(w[0].sheet) && /Group 1/.test(w[0].sheet) && /Group 2/.test(w[0].sheet), '6: first open did not ask "Who are you?" with the groups: ' + JSON.stringify(w[0].sheet));
    f(w[1].sheet && /Eli Echo/.test(w[1].sheet) && /Fay Fox/.test(w[1].sheet) && !/Ann Able/.test(w[1].sheet), '6: Group 2 did not list its golfers: ' + JSON.stringify(w[1].sheet));
    f(!w[2].sheet && w[2].tag === 'Group 2 · Eli ▾' && w[2].btn === '7' && w[2].pick === ids[4], '6: picking Eli did not show "Group 2 · Eli ▾" and his 7: ' + JSON.stringify([w[2].tag, w[2].btn, w[2].pick]));
    f(w[3].tag === 'Group 2 · Eli ▾' && w[3].btn === '7' && w[3].hole === 1, '6: the pick did not stay across holes: ' + JSON.stringify([w[3].tag, w[3].btn, w[3].hole]));
    f(w[4].tag === 'Group 2 · Fay ▾' && w[4].btn === 'Enter score' && w[5].tag === 'Group 2 · Eli ▾' && w[5].btn === '7', '6: swiping did not flip Eli -> Fay -> Eli: ' + JSON.stringify([w[4].tag, w[4].btn, w[5].tag, w[5].btn]));
    f(!w[6].sheet && w[6].tag === 'Group 2 · Eli ▾' && w[6].btn === '7', '6: reopened: asked again, or the pick was lost: ' + JSON.stringify([w[6].sheet, w[6].tag]));
    f(!w.some((x) => x.writes.length), '6: picking / swiping wrote something: ' + JSON.stringify(w.map((x) => x.writes)));
    // Skip = the first golfer of the group.
    r = await go({ url: fileUrl('index.html', 'game=' + CODE), db: DB({ [CODE]: six() }), preScript: APP + ERR + SEED(), steps: [{ sleep: 2500 }, { expression: OPEN_GPS }, { sleep: 2500 }, CLICK('#gps-overlay .gps-who-skip'), W, { expression: WHO }] });
    const sk = J(r)[0];
    f(!sk.sheet && sk.tag === 'Group 1 · Ann ▾' && sk.btn === '3', '6: Skip did not show the first golfer (Ann, 3): ' + JSON.stringify([sk.sheet, sk.tag, sk.btn]));
    // A spectator: views Eli through the tag; the score button opens nothing; no writes.
    r = await go({ url: fileUrl('index.html', 'game=' + CODE + '&spectate=1'), db: DB({ [CODE]: (() => { const x = six(); x.ownerUid = 'someone-else'; return x; })() }), preScript: APP + ERR + SEED("localStorage.setItem('hardpan_gps_whoasked_" + CODE + "', '1');"), steps: [{ sleep: 2500 }, { expression: OPEN_GPS }, { sleep: 2500 }, { expression: WHO },
        CLICK('#gps-overlay .gps-who'), W, CLICK('#gps-overlay [data-who-group="2"]'), W, CLICK('#gps-overlay [data-who-id="' + ids[4] + '"]'), W, { expression: WHO }, CLICK('#gps-overlay .gps-score'), { sleep: 600 }, { expression: WHO }] });
    const sp = J(r);
    f(sp[0].tag === 'Group 1 · Ann ▾' && sp[0].btn === '3', '6: a spectator with no pick: the organizer (Ann, 3): ' + JSON.stringify([sp[0].tag, sp[0].btn]));
    f(sp[1].tag === 'Group 2 · Eli ▾' && sp[1].btn === '7', '6: a spectator could not view Eli: ' + JSON.stringify([sp[1].tag, sp[1].btn]));
    f(sp[2].side === 'gps' && !sp[2].writes.length, '6: a spectator\'s score tap opened the editor or wrote: ' + JSON.stringify([sp[2].side, sp[2].writes]));
    w.concat([sk]).concat(sp).concat(kp).forEach((x) => { const e = errs(x); if (e.length) fails.push('6: errors ' + e.join(' | ')); });

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
