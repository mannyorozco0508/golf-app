#!/usr/bin/env node
// ============================================================================
// AUDIT (a): EVERY BUNDLED COURSE'S GPS DATA, HOLE BY HOLE (mailbox 001, 2026-10-16)
//
//   node tools/audit-courses.js            (needs golfapi/gps-golfapi.js - the app build only)
//
// For each course the GPS door can start - Caledonia, True Blue, Pine Lakes, Pine Hills,
// Man O' War, Prestwick, Thistle (all 6 pairings and each nine alone) - and Tri-Mountain:
// the record GPS would draw (gps-geo golfapiMatch, as gps-view.osmRecord does), then per hole:
//   - a green with FRONT < CENTER < BACK from the tee (the F / C / B the screen shows);
//   - a tee, and tee -> centre yards sane: > 0, <= 700, and in a plausible range for the par;
//   - the card's par / hcp (what the GPS screen shows - the round's own card) next to
//     GolfAPI's par for the same hole (map pars never change the card; a mismatch is reported).
// Prints JSON { courses: [...], findings: [...] }. Exit 1 when a hole is missing or insane.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
const GA = path.join(HERE, 'golfapi', 'gps-golfapi.js');
if (!fs.existsSync(GA)) { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why: 'golfapi/gps-golfapi.js is not on this machine' })); process.exit(2); }
global.window = global;
require(path.join(HERE, 'gps-geo.js'));
require(path.join(HERE, 'gps-courses.js'));
require(GA);
for (const f of fs.readdirSync(HERE).filter((x) => /^gps-coverage-[a-z]{2}\.js$/.test(x))) require(path.join(HERE, f));
const G = window.HardPanGeo, T = window.HardPanGpsCourses, D = window.HardPanGolfApi;
// The cards (course-data.js: coursePresets, nineHoleLoops, remapNineHandicaps) - the same file the app loads.
const ctx = {};
new Function('ctx', fs.readFileSync(path.join(HERE, 'course-data.js'), 'utf8') + '\n;ctx.P = coursePresets; ctx.L = nineHoleLoops; ctx.remap = remapNineHandicaps; ctx.dir = typeof courseDirectory !== "undefined" ? courseDirectory : [];')(ctx);
const YD = 1 / G.M_PER_YD;
const PAR_RANGE = { 3: [80, 260], 4: [230, 500], 5: [400, 650], 6: [550, 700] };

function card(key, front, back) {
    if (ctx.L[key]) {
        const L = ctx.L[key], out = [];
        ctx.remap(L[front].data, true).forEach((h, i) => out.push({ hole: i + 1, par: h.par, hcpIndex: h.hcpIndex }));
        if (back) ctx.remap(L[back].data, false).forEach((h, i) => out.push({ hole: i + 10, par: h.par, hcpIndex: h.hcpIndex }));
        return out;
    }
    return ((ctx.P[key] && ctx.P[key].data) || []).map((h) => ({ hole: h.hole, par: h.par, hcpIndex: h.hcpIndex }));
}
function courseCases() {
    const out = [];
    for (const [key, name] of [['caledonia', 'Caledonia Golf & Fish Club'], ['trueblue', 'True Blue Golf Club'], ['pinelakes', 'Pine Lakes Country Club'], ['pinehills', 'Myrtlewood - Pine Hills'], ['manofwar', "Man O' War Golf Club"], ['prestwick', 'Prestwick Country Club']]) out.push({ key, name, card: card(key) });
    const N = { cameron: 'Cameron', stewart: 'Stewart', mackay: 'MacKay' };
    for (const a of Object.keys(N)) for (const b of Object.keys(N)) if (a !== b) out.push({ key: 'thistle_27', name: 'Thistle Golf Club (' + N[a] + ' / ' + N[b] + ')', card: card('thistle_27', a, b), loop: true });
    for (const a of Object.keys(N)) out.push({ key: 'thistle_27', name: 'Thistle Golf Club (' + N[a] + ' Only)', card: card('thistle_27', a, null), loop: true });
    // Tri-Mountain: a directory course with no GolfAPI data in the app (SET UP · 1 TAP).
    const tri = []; ctx.dir.forEach((g) => (g.items || []).forEach((i) => { if (/tri.?mountain/i.test(i.name)) tri.push(i); }));
    tri.forEach((i) => out.push({ key: i.id, name: i.name, card: card(i.id) }));
    return out;
}
function gaPars(rec) {
    // The GolfAPI course(s) behind the record: their par list, hole by hole, in the record's order.
    const ids = (rec && rec.golfapiIds) || [];
    const pars = [];
    ids.forEach((id) => {
        const base = String(id).split('#')[0], half = String(id).split('#')[1];
        const c = D.courses[base]; if (!c || !c.pars) return;
        const p = half ? c.pars.slice((Number(half) - 1) * 9, Number(half) * 9) : c.pars;
        p.forEach((x) => pars.push(x));
    });
    return pars;
}

const findings = [], courses = [];
for (const c of courseCases()) {
    const gk = G.courseGpsKey(c.key, c.name, !!c.loop);
    const m = G.golfapiMatch(D, gk, c.name, null, c.card.length === 9 ? 9 : 18, T);
    const rec = m ? m.record : null;
    const row = { course: c.name, key: c.key, gpsKey: gk, how: m ? m.how : 'NO GPS DATA', holes: c.card.length, ok: 0, issues: [] };
    if (!rec) {
        row.issues.push('no GPS record: the GPS screen shows "No green mapped" on every hole (course not set up in the app)');
        findings.push({ sev: c.key.indexOf('thistle') === 0 ? 'crash' : 'annoyance', where: c.name, what: 'no GPS data in the app', fixed: false });
        courses.push(row); continue;
    }
    const gp = gaPars(rec);
    c.card.forEach((h, i) => {
        const hr = rec.holes[String(h.hole)];
        const bad = (t) => { row.issues.push('hole ' + h.hole + ': ' + t); };
        if (!hr || !hr.osm || !hr.osm.mid) { bad('NO GREEN'); return; }
        const r = G.resolveHole(hr, null);
        const tee = hr.osm.tee || (hr.osm.line && hr.osm.line[0]);
        if (!tee) { bad('no tee point (F/C/B from the golfer only; "~yards" missing)'); return; }
        const n = G.holeNumbers(tee, Object.assign({}, r, { useGreenForEdges: true }));
        const f = n && n.frontM != null ? Math.round(n.frontM * YD) : null, mid = n ? Math.round(n.middleM * YD) : null, b = n && n.backM != null ? Math.round(n.backM * YD) : null;
        if (f == null || b == null) bad('no front/back for the green');
        else if (!(f < mid && mid < b)) bad('F/C/B out of order from the tee: ' + [f, mid, b].join('/'));
        if (!(mid > 0) || mid > 700) bad('tee -> centre ' + mid + ' yds');
        const rg = PAR_RANGE[h.par];
        if (rg && mid != null && (mid < rg[0] || mid > rg[1])) bad('par ' + h.par + ' but tee -> centre ' + mid + ' yds (check the tee / green / card)');
        if (gp[i] != null && Number(gp[i]) !== Number(h.par)) bad('card par ' + h.par + ' vs GolfAPI par ' + gp[i] + ' (the card wins on screen)');
        if (!(h.hcpIndex >= 1 && h.hcpIndex <= 18)) bad('card hcp ' + h.hcpIndex);
        if (!row.issues.some((x) => x.indexOf('hole ' + h.hole + ':') === 0)) row.ok++;
    });
    courses.push(row);
}
courses.forEach((c) => c.issues.forEach((i) => {
    const sev = /NO GREEN|no tee|no front/.test(i) ? 'wrong number' : /card par .* vs GolfAPI/.test(i) ? 'info' : 'wrong number';
    findings.push({ sev, where: c.course, what: i, fixed: false });
}));
console.log(JSON.stringify({ courses: courses.map((c) => ({ course: c.course, how: c.how, holesOk: c.ok + '/' + c.holes, issues: c.issues })), findings }, null, 1));
process.exit(findings.some((x) => x.sev !== 'info' && x.sev !== 'annoyance') ? 1 : 0);
