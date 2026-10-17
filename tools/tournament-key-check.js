#!/usr/bin/env node
// ============================================================================
// A TOURNAMENT SCORE CLAIMS ITS TEAM'S KEY FIRST (mailbox 003, 2026-10-17)
//
//   node tools/tournament-key-check.js
//
// The proposed rules (rules/database.rules.proposed.json) take a score on a keyed event only from
// a signed-in phone holding a claim for that team. Cold Chrome, tournament-scorecard.html:
//   1  a link with &k=: the first score writes tournamentScorers/<code>/<uid> = { slot, key }
//      BEFORE the score, then the score; a second score does not claim again.
//   2  a link with no k (sent before keys): no claim, the score is written (signed in).
//   3  the organizer's page (signed in, lockedLinks): a key per team minted, every link carries &k=.
// ============================================================================
'use strict';
const path = require('path');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const F = require(path.join(HERE, 'tools/lib/tournament-fixtures.js'));
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const courseData = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const EVENT = F.eventRecord({ name: 'Scramble', format: 'scramble', scoringMode: 'gross', courseName: 'Caledonia', activeCourseKey: 'caledonia', courseData,
    teams: { team1: { num: 1, name: 'Team One', players: ['A', 'B'], handicap: 0 }, team2: { num: 2, name: 'Team Two', players: ['C', 'D'], handicap: 0 } }, scores: {} });
EVENT.ownerUid = 'torg'; EVENT.lockedLinks = true;
const DB = { tournaments: { TKEY01: EVENT }, events: {}, trips: {}, organizers: {}, global_courses: {} };
const TYPE = (hole, v) => ({ expression: "(function(){ var i = Array.prototype.filter.call(document.querySelectorAll('input'), function (x) { return /saveHoleScore\\(" + hole + ",/.test(x.getAttribute('onchange') || ''); })[0]; if (!i) return 'no box'; i.value = '" + v + "'; i.dispatchEvent(new Event('change')); return 'typed'; })()" });
const W = { expression: "JSON.stringify({ writes: (window.__coldWrites || []).map(function (w) { return w.op + ' ' + w.path + (w.value && typeof w.value === 'object' ? ' ' + JSON.stringify(w.value) : ''); }), saved: (document.getElementById('save-state') || {}).textContent || '' })" };

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    let r = await arriveCold({ url: fileUrl('tournament-scorecard.html', 'tourney=TKEY01&team=1&k=k-team1-aaaaaaaa'), db: DB, settleMs: 3000, viewport: { width: 390, height: 844 },
        steps: [TYPE(1, 4), { sleep: 1200 }, TYPE(2, 5), { sleep: 1200 }, W] });
    if (!r.ok) throw new Error(r.reason);
    let w = J(r)[0];
    report.keyed = w.writes;
    const claimAt = w.writes.findIndex((x) => /^set tournamentScorers\/TKEY01\/anon-cold /.test(x));
    const s1 = w.writes.indexOf('set tournaments/TKEY01/scores/team1_h1');
    f(claimAt !== -1 && /"slot":"team1"/.test(w.writes[claimAt]) && /"key":"k-team1-aaaaaaaa"/.test(w.writes[claimAt]), '1: no claim for team1 with the link\'s key: ' + JSON.stringify(w.writes));
    f(s1 !== -1 && claimAt < s1, '1: the score was not written after the claim: ' + JSON.stringify(w.writes));
    f(w.writes.filter((x) => /tournamentScorers/.test(x)).length === 1 && w.writes.indexOf('set tournaments/TKEY01/scores/team1_h2') !== -1, '1: a second score claimed again, or was not written: ' + JSON.stringify(w.writes));
    r = await arriveCold({ url: fileUrl('tournament-scorecard.html', 'tourney=TKEY01&team=2'), db: DB, settleMs: 3000, viewport: { width: 390, height: 844 },
        steps: [TYPE(1, 3), { sleep: 1200 }, W] });
    if (!r.ok) throw new Error(r.reason);
    w = J(r)[0];
    report.unkeyed = w.writes;
    f(!w.writes.some((x) => /tournamentScorers/.test(x)) && w.writes.indexOf('set tournaments/TKEY01/scores/team2_h1') !== -1, '2: an old link (no k): ' + JSON.stringify(w.writes));
    // 3 (the stand-in re-fires no listener on a write; the keys the page wrote are delivered back,
    // as the server echoes a write): the organizer's page mints a key per team (lockedLinks) and puts it in each link.
    r = await arriveCold({ url: fileUrl('tournament.html', 'tourney=TKEY01'), db: DB, settleMs: 4000, viewport: { width: 390, height: 844 }, auth: { uid: 'torg', email: 'torg@owner.test' },
        steps: [{ sleep: 2500 }, { expression: "(function(){ var w = (window.__coldWrites || []).filter(function (x) { return /^tournamentKeys\\/TKEY01$/.test(x.path); })[0]; return w ? JSON.stringify(window.__coldDeliver('tournamentKeys/TKEY01', w.value)) : 'no key write'; })()" }, { sleep: 800 }, { expression: "JSON.stringify({ writes: (window.__coldWrites || []).filter(function (w) { return /tournamentKeys/.test(w.path); }).map(function (w) { return w.op + ' ' + w.path + ' ' + JSON.stringify(w.value); }), links: Array.prototype.map.call(document.querySelectorAll('#team-links-list [data-share-url], #team-links-list a[href*=\"tournament-scorecard\"]'), function (a) { return (a.getAttribute('data-share-url') || a.getAttribute('href') || '').split('?').pop(); }) })" }] });
    if (!r.ok) throw new Error(r.reason);
    const o = J(r).pop();
    report.organizer = o;
    const kw = o.writes[0] || '';
    f(o.writes.length >= 1 && /tournamentKeys\/TKEY01/.test(kw) && /"team1":"[0-9a-f]{24}"/.test(kw) && /"team2":"[0-9a-f]{24}"/.test(kw), '3: the organizer page did not mint team keys: ' + JSON.stringify(o.writes));
    f(o.links.length && o.links.every((l) => /&k=[0-9a-f]{24}$/.test(l)), '3: the scoring links do not carry their key: ' + JSON.stringify(o.links));
    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
