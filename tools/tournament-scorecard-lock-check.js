#!/usr/bin/env node
// ============================================================================
// "LOCK SCORING LINKS", TAPPED (scorecard-lock wave, 2026-10-06)
//
// The owner of an existing event with no scores opens Setup, taps Lock scoring
// links (window.confirm answered yes - a browser dialog, not a page function),
// and the write the page sends is read back: ONE update that keys every team
// and turns the lock on. The server's echo is then delivered to the page's own
// keys listener, the Leaderboard tab is tapped, and the links the Share buttons
// hand out are read: every one carries its team's key, and no two share one.
//
// THE REFUSAL ARM: the same event with one posted score. The button has no
// rect, the sentence says why, and nothing is written.
//
// What the RULES do with those keys is not this check: that is
// tools/tournament-scorecard-lock-emulator-check.js (real rules, emulator) and
// tools/tournament-team-link-check.js (real SDK + rules, a tampered link).
//
//   node tools/tournament-scorecard-lock-check.js
//
//   exit 0   locked in one write; links carry distinct keys; refusal arm holds
//   exit 1   a divergence the JSON names
//   exit 2   could not run, or the button was not on screen. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const rec = (scores) => ({ name: 'Lock Me', format: 'scramble', courseName: 'C', courseData: COURSE, createdAt: 1, ownerUid: OWNER.uid,
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 }, team2: { num: 2, name: 'Hawks', players: ['Bo'], handicap: 0 },
             team3: { num: 3, name: 'Owls', players: ['Cal'], handicap: 0 } }, scores: scores || {} });
const dbOf = (r) => ({ tournaments: { LCK1: r }, trips: {}, global_courses: {} });

const PRE = `window.confirm = function () { return true; }; window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); };`;
const PANEL = `(() => { const b = document.getElementById('lock-links-btn'); const s = document.getElementById('lock-links-state');
  return JSON.stringify({ panel: true, buttonRect: !!(b && b.getClientRects().length), state: s ? s.innerText : null }); })()`;
const TAP = `(() => { const b = document.getElementById('lock-links-btn'); if (!b || !b.getClientRects().length) return 'no visible button'; b.click(); return 'tapped'; })()`;
const WRITES = `JSON.stringify({ writes: (window.__coldWrites || []).map(w => ({ op: w.op, path: w.path, value: w.value })), alerts: window.__alerts })`;
const LINKS = `JSON.stringify({ links: Array.prototype.slice.call(document.querySelectorAll('#team-links-list button[data-share-url]')).map(b => b.getAttribute('data-share-url')) })`;
const parsed = (v) => v.map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean);

(async () => {
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };
    const failures = [];

    // ---- tap Lock, read the write, deliver it, read the links ----
    const a = await arriveCold({ url: fileUrl('tournament.html', 'tourney=LCK1'), db: dbOf(rec()), auth: OWNER, preScript: PRE, settleMs: 4500,
        steps: [{ tap: '#tab-btn-setup' }, { sleep: 300 }, { expression: PANEL }, { expression: TAP }, { sleep: 500 }, { expression: WRITES }] });
    if (!a.ok) bail('owner arrival did not run: ' + a.reason);
    if (!a.value.includes('tapped')) bail('the Lock button was not on screen', a.value);
    const p = parsed(a.value);
    const panel = p.find((x) => x.panel), w = p.find((x) => x.writes);
    const lockWrites = w.writes.filter((x) => /tournamentKeys/.test(JSON.stringify(x)));
    if (lockWrites.length !== 1) failures.push('lock took ' + lockWrites.length + ' writes: ' + JSON.stringify(w.writes));
    const v = (lockWrites[0] || {}).value || {};
    if (v['tournamentKeys/LCK1/on'] !== true) failures.push('the lock flag was not in the write');
    const keys = [1, 2, 3].map((n) => v['tournamentKeys/LCK1/t/team' + n]);
    if (!keys.every((k) => /^[0-9a-f]{32}$/.test(k || ''))) failures.push('a team got no 128-bit key: ' + JSON.stringify(keys));
    if (new Set(keys).size !== 3) failures.push('two teams share a key');

    // The server's echo of that write, delivered to the page's own keys listener.
    const keysNode = { on: true, t: { team1: keys[0], team2: keys[1], team3: keys[2] } };
    const b = await arriveCold({ url: fileUrl('tournament.html', 'tourney=LCK1'), db: Object.assign(dbOf(rec()), { tournamentKeys: { LCK1: keysNode } }),
        auth: OWNER, settleMs: 4500, steps: [{ tap: '#tab-btn-leaderboard' }, { sleep: 400 }, { expression: LINKS }, { tap: '#tab-btn-setup' }, { sleep: 300 }, { expression: PANEL }] });
    if (!b.ok) bail('the locked arrival did not run: ' + b.reason);
    const pb = parsed(b.value);
    const links = (pb.find((x) => x.links) || {}).links || [];
    const lockedPanel = pb.find((x) => x.panel) || {};
    if (links.length !== 3) failures.push('links on screen: ' + links.length + ', wanted 3');
    [1, 2, 3].forEach((n) => {
        const l = links.find((u) => new RegExp('[?&]team=' + n + '(&|$)').test(u));
        if (!l || !l.includes('&k=' + keys[n - 1])) failures.push('team ' + n + ' link does not carry its key: ' + l);
    });
    if (lockedPanel.buttonRect) failures.push('the Lock button is still offered on a locked event');
    if (!/Keys are on/.test(lockedPanel.state || '')) failures.push('locked panel reads ' + JSON.stringify(lockedPanel.state));

    // ---- the refusal: one posted score ----
    const c = await arriveCold({ url: fileUrl('tournament.html', 'tourney=LCK1'), db: dbOf(rec({ team2_h4: 5 })), auth: OWNER, preScript: PRE, settleMs: 4500,
        steps: [{ tap: '#tab-btn-setup' }, { sleep: 300 }, { expression: PANEL }, { expression: WRITES }] });
    if (!c.ok) bail('the scored arrival did not run: ' + c.reason);
    const pc = parsed(c.value);
    const scoredPanel = pc.find((x) => x.panel) || {};
    if (scoredPanel.buttonRect) failures.push('Lock is offered on an event with a posted score');
    if (!/only before the first score/.test(scoredPanel.state || '')) failures.push('scored panel reads ' + JSON.stringify(scoredPanel.state));
    if ((pc.find((x) => x.writes) || { writes: [] }).writes.length) failures.push('the scored arrival wrote something');

    console.log(JSON.stringify({ verdict: failures.length ? 'FAIL' : 'PASS', failures, measured: {
        before: panel, lockWrite: Object.keys(v), linksOnScreen: links.map((u) => u.replace(/k=[0-9a-f]+/, 'k=<32 hex>')),
        lockedPanel, scoredPanel } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2)); process.exit(2); });
