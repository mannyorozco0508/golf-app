#!/usr/bin/env node
// ============================================================================
// CHECK B, IN A BROWSER: REMOVE A TEAM ON SETUP, THE DESK FLAGS ITS GOLFERS
// (Tournaments Wave 2, 2026-10-06)
//
// Wave 1's phone check B could not run - no control removed a team. This is
// that check, cold: the owner arrives, taps the Setup row's Remove (window.
// confirm answered yes - a browser dialog, not a page function), and the write
// the page sends is read back. The server's echo is then DELIVERED to the
// page's own tournament listener (the record without that team), the Desk tab
// is tapped, and its rendered text is read. A second cold arrival on the
// record as the server now holds it is the "after reload" arm.
//
// THE REFUSAL ARM: a team with a posted score. Its Remove must show the one
// sentence and send nothing.
//
//   node tools/tournament-remove-team-check.js
//
//   exit 0   removed with one write; Desk "Needs a team" x2 and "2 need a team",
//            live and after reload; the scored team refused with nothing written
//   exit 1   a divergence the JSON names
//   exit 2   could not run, or a tap found nothing. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const teams = () => ({
    team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0, startingHole: '1' },
    team2: { num: 2, name: 'Team 2', players: ['Desk One', 'Desk Two'], handicap: 0, startingHole: '7' },
    team3: { num: 3, name: 'Owls', players: ['Cal'], handicap: 0 }
});
const rec = (t) => ({ name: 'Check B', format: 'scramble', courseName: 'C', courseData: COURSE, createdAt: 1, ownerUid: OWNER.uid,
    entryFee: 0, teams: t, scores: { team1_h1: 4 } });
const REGS = {
    e1: { fullName: 'Desk One', email: 'one@example.com', phone: '555-0001', createdAt: 10, approvedAt: 11, teamNum: 2 },
    e2: { fullName: 'Desk Two', email: 'two@example.com', phone: '555-0002', createdAt: 12, approvedAt: 13, teamNum: 2 }
};
const dbOf = (t) => ({ tournaments: { CHKB: rec(t) }, registrations: { CHKB: REGS }, trips: {}, global_courses: {} });
const after = () => { const t = teams(); delete t.team2; return t; };

const PRE = `window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); };
window.confirm = function () { return true; };`;
const TAP_REMOVE = (n) => `(() => { const b = document.querySelector('#team-cards-list .team-remove[data-team="${n}"]');
  if (!b || !b.getClientRects().length) return 'no visible Remove on team ${n}'; b.click(); return 'tapped'; })()`;
const WRITES = `JSON.stringify({ writes: (window.__coldWrites || []).map(w => w.op + ' ' + w.path), alerts: window.__alerts })`;
const DESK = `(() => { const t = (id) => { const e = document.getElementById(id); return e ? e.innerText : ''; };
  return JSON.stringify({ desk: t('registration-list'), counts: t('registration-counts'), chips: t('registration-chips') }); })()`;
const parsed = (v) => v.map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean);
const needs = (d) => (d.desk.match(/Needs a team/g) || []).length;

(async () => {
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };
    const failures = [];

    // ---- remove, then the server's echo, then the Desk ----
    const a = await arriveCold({ url: fileUrl('tournament.html', 'tourney=CHKB'), db: dbOf(teams()), auth: OWNER, preScript: PRE, settleMs: 4500,
        steps: [{ tap: '#tab-btn-setup' }, { sleep: 300 }, { expression: TAP_REMOVE(2) }, { sleep: 400 }, { expression: WRITES },
                { deliver: { path: 'tournaments/CHKB', value: rec(after()) } }, { sleep: 400 },
                { tap: '#tab-btn-desk' }, { sleep: 400 }, { expression: DESK }] });
    if (!a.ok) bail('the owner arrival did not run: ' + a.reason);
    if (!a.value.includes('tapped')) bail('the Remove tap found nothing', a.value);
    const [w, live] = [parsed(a.value).find((x) => x.writes), parsed(a.value).find((x) => 'desk' in x)];
    if (!w || !live) bail('a probe did not parse', a.value);
    if (JSON.stringify(w.writes) !== JSON.stringify(['remove tournaments/CHKB/teams/team2'])) failures.push('remove wrote ' + JSON.stringify(w.writes));
    if (needs(live) !== 2) failures.push('live: ' + needs(live) + ' "Needs a team" badges, wanted 2');
    if (!/2 need a team/.test(live.counts)) failures.push('live: counts read ' + JSON.stringify(live.counts));

    // ---- after a reload ----
    const b = await arriveCold({ url: fileUrl('tournament.html', 'tourney=CHKB'), db: dbOf(after()), auth: OWNER, settleMs: 4500,
        steps: [{ tap: '#tab-btn-desk' }, { sleep: 400 }, { expression: DESK }] });
    if (!b.ok) bail('the reload arrival did not run: ' + b.reason);
    const reload = parsed(b.value).find((x) => 'desk' in x);
    if (!reload) bail('reload probe did not parse', b.value);
    if (needs(reload) !== 2) failures.push('reload: ' + needs(reload) + ' "Needs a team" badges, wanted 2');
    if (!/2 need a team/.test(reload.counts)) failures.push('reload: counts read ' + JSON.stringify(reload.counts));

    // ---- the refusal: Eagles has a score ----
    const c = await arriveCold({ url: fileUrl('tournament.html', 'tourney=CHKB'), db: dbOf(teams()), auth: OWNER, preScript: PRE, settleMs: 4500,
        steps: [{ tap: '#tab-btn-setup' }, { sleep: 300 }, { expression: TAP_REMOVE(1) }, { sleep: 400 }, { expression: WRITES }] });
    if (!c.ok) bail('the refusal arrival did not run: ' + c.reason);
    if (!c.value.includes('tapped')) bail('the Remove tap on Eagles found nothing', c.value);
    const r = parsed(c.value).find((x) => x.writes);
    if (JSON.stringify(r.alerts) !== JSON.stringify(["Eagles has scores and can't be removed."])) failures.push('refusal said ' + JSON.stringify(r.alerts));
    if (r.writes.length) failures.push('refusal wrote ' + JSON.stringify(r.writes));

    console.log(JSON.stringify({ verdict: failures.length ? 'FAIL' : 'PASS', failures,
        measured: { removeWrites: w.writes, live: { needs: needs(live), counts: live.counts }, reload: { needs: needs(reload), counts: reload.counts },
                    refusal: r } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2)); process.exit(2); });
