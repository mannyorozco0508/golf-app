#!/usr/bin/env node
// ============================================================================
// E2 CONTEST HOLES, IN A BROWSER - cold arrival (tools/lib/cold-arrival.js).
//
// A DEVICE CHECK MAY NOT CALL A FUNCTION THE PAGE DEFINES. Nothing here does.
// Each arm navigates to the URL a golfer or organizer lands on, then only taps,
// types (Input.insertText) and reads innerText / rects.
//
//   node tools/tournament-contests-check.js           measure
//   node tools/tournament-contests-check.js --shots   also write 390x844 @2x
//        screenshots to ~/Desktop/claude-mailbox-shared/tournaments/screens-event-tools/
//
//   exit 0 every arm measured what the JSON lists; 1 a divergence; 2 could not run.
//
// WHAT THIS CANNOT PROVE: the real rules (the emulator test does), a real
// device's keyboard, and the app's GPS mark (the web has none).
// ============================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(os.homedir(), 'Desktop', 'claude-mailbox-shared', 'tournaments', 'screens-event-tools');
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name) => SHOTS ? [{ shot: path.join(SHOT_DIR, name), viewportOnly: true }] : [];

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 5];
const COURSE = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: ((i * 7) % 18) + 1 }));
const K4 = '4'.repeat(32);
const NAMES = { 4: ['Al Lopez', 'Jo Kim'], 7: ['Dee Nguyen', 'Lee Park'], 9: ['Ana Ruiz', 'Kim Park'], 12: ['Pat Reyes', 'Sam Ortiz'] };
const teams = {}, scores = {};
for (let n = 1; n <= 18; n++) {
    teams['team' + n] = { num: n, name: 'Team ' + n, players: NAMES[n] || ['Golfer ' + n + 'A', 'Golfer ' + n + 'B'], handicap: 0, startingHole: n };
    // 11 of 18 teams have played hole 7 (teams that started on 1..7 and are thru it, plus a few).
    if (n !== 4) [7, 8].forEach((h) => { if (n <= 8 || n >= 15) scores['team' + n + '_h' + h] = PARS[h - 1] - (n % 2); });
}
[4, 5, 6].forEach((h) => { scores['team4_h' + h] = PARS[h - 1] - (h === 5 ? 1 : 0); });
scores.team4_h4 = 2;   // thru 6 holes from 4: holes 4, 5, 6 -> "-3" in the mockup is approximate
const CONTESTS = { h7: { kind: 'kp', allowGps: true }, h12: { kind: 'ld', fairwayOnly: true, allowGps: true }, h16: { kind: 'kp', allowGps: true } };
const base = { name: 'Rattle Classic', format: 'scramble', courseName: 'Papago', courseData: COURSE, entryFee: 0, createdAt: 1,
    ownerUid: 'u-org', eventDate: '2026-11-21', startTime: '08:00', startType: 'shotgun', teams, scores };
const ENTRIES = {
    h7: { team7_p0: { name: 'Dee Nguyen', team: 'team7', kind: 'kp', inches: 37, by: 'typed', at: 2 },
        team4_p0: { name: 'Al Lopez', team: 'team4', kind: 'kp', inches: 100, by: 'typed', at: 1 },
        team9_p1: { name: 'Jo Kim', team: 'team9', kind: 'kp', inches: 492, by: 'typed', at: 3 } },
    h16: { team12_p1: { name: 'Sam Ortiz', team: 'team12', kind: 'kp', inches: 144, by: 'gps', accFt: 9, at: 4 } },
    h12: { team12_p0: { name: 'Pat Reyes', team: 'team12', kind: 'ld', yards: 301, by: 'gps', accFt: 12, at: 5 },
        team4_p0: { name: 'Al Lopez', team: 'team4', kind: 'ld', yards: 287, by: 'typed', at: 6 } }
};
const ldScores = Object.assign({}, scores);
[7, 8, 9, 10, 11].forEach((h) => { ldScores['team4_h' + h] = PARS[h - 1]; });
const db = {
    tournaments: {
        PLAIN: Object.assign({}, base),
        CT1: Object.assign({}, base, { contests: CONTESTS }),
        CTLD: Object.assign({}, base, { contests: CONTESTS, scores: ldScores })
    },
    contestEntries: { CT1: ENTRIES, CTLD: {} },
    events: {}, trips: {}, global_courses: {}
};
const dbEmpty = JSON.parse(JSON.stringify(db)); dbEmpty.contestEntries.CT1 = {};

const VIS = `(sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }`;
const txt = (sel) => `((document.querySelector(${JSON.stringify(sel)}) || {}).innerText || '')`;
const WRITES = `(window.__coldWrites || []).map(w => w.op + ' ' + w.path + ' ' + JSON.stringify(w.value === undefined ? null : w.value))`;
const CARD_PROBE = `(() => { const vis = ${VIS}; return JSON.stringify({ prompt: vis('#contest-prompt'), tab: vis('#tab-btn-contests'),
    promptText: ${txt('#contest-prompt')}, status: ${txt('#status-main')}, board: vis('#tab-contests') ? ${txt('#contest-board')} : '',
    gpsBox: /GPS EXCEPTION|Mark with GPS|Mark my drive/.test(${txt('#contest-prompt')}), writes: ${WRITES} }); })()`;
const ORG_PROBE = `(() => { const vis = ${VIS}; return JSON.stringify({ tab: vis('#tab-btn-contests'), panel: vis('#manage-tab-contests'),
    holes: ${txt('#contest-holes-list')}, entries: ${txt('#contest-entries')}, note: ${txt('#contest-note')}, writes: ${WRITES} }); })()`;
const type = (sel, text) => [{ tap: sel }, { cdp: { method: 'Input.insertText', params: { text } } }];
const top = { expression: "window.scrollTo(0, 0); 'top'" };

async function run(name, opts) {
    const r = await arriveCold(Object.assign({ settleMs: 5000 }, opts));
    if (!r.ok) return { name, ran: false, reason: r.reason };
    const values = (r.value || []).filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    return { name, ran: true, values };
}

(async () => {
    const out = {}; const failures = [];
    const check = (ok, msg) => { if (!ok) failures.push(msg); };
    const ownerAuth = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };

    // 0. DEFAULT: an event with no contest holes - the card as it was.
    const z = await run('0-default', { url: fileUrl('tournament-scorecard.html', `tourney=PLAIN&team=4&k=${K4}`), db, steps: [{ expression: CARD_PROBE }] });
    out.default = z.ran ? z.values[0] : z;
    if (z.ran) { const v = z.values[0];
        check(!v.prompt && !v.tab, '0: no contests must mean no prompt and no tab: ' + JSON.stringify(v));
        check(/Next: Hole 7/.test(v.status), '0: positive - the card rendered: ' + v.status); }

    // E2a. Team 4 (started on 4, thru 6) arrives: hole 7 KP prompt; pick Al, 8 ft 4 in, Save.
    const a = await run('E2a', { url: fileUrl('tournament-scorecard.html', `tourney=CT1&team=4&k=${K4}`), db: dbEmpty,
        steps: [{ expression: CARD_PROBE }, { tap: '#contest-prompt .cp-chip[data-entry="team4_p0"]' }, ...type('#cp-ft', '8'), ...type('#cp-in', '4'),
            { expression: "document.getElementById('contest-prompt').scrollIntoView({ block: 'center' }); document.activeElement.blur(); 'centered'" }, ...shot('E2a-kp-hole-prompt.png'),
            { tap: '#cp-save' }, { sleep: 300 }, { expression: CARD_PROBE }] });
    out.E2a = a.ran ? a.values : a;
    if (a.ran) { const [v0, v1] = a.values;
        check(v0.prompt && v0.tab, 'E2a: the prompt and the Contests tab are on screen on arrival: ' + JSON.stringify(v0));
        check(/Hole 7 · Closest to the pin/.test(v0.promptText) && /On the green in one\? Enter how far from the cup\./.test(v0.promptText) && /Save my KP/.test(v0.promptText) && /Not on the green/.test(v0.promptText), 'E2a: words: ' + v0.promptText);
        check(!v0.gpsBox, 'E2a: no GPS mark on the web');
        const w = v1.writes.filter((x) => /^update {2}/.test(x) || /contestEntries/.test(x));
        check(w.length === 1 && /"contestEntries\/CT1\/h7\/team4_p0":\{"name":"Al Lopez","team":"team4","kind":"kp","by":"typed","at":\{".sv":"timestamp"\},"inches":100\}/.test(w[0])
            && new RegExp('"contestProofs/CT1/h7/team4_p0":\\{"who":"team4","k":"' + K4 + '","t":\\{".sv":"timestamp"\\}\\}').test(w[0]), 'E2a: one update, entry + keyed proof: ' + JSON.stringify(v1.writes));
        check(/✓ Saved: Al 8 ft 4 in/.test(v1.promptText), 'E2a: saved line: ' + v1.promptText); }

    // E2b. Team 4 thru 11 holes: hole 12 long drive, fairway only; Jo, 287 yds.
    const b = await run('E2b', { url: fileUrl('tournament-scorecard.html', `tourney=CTLD&team=4&k=${K4}`), db,
        steps: [{ expression: CARD_PROBE }, { tap: '#contest-prompt .cp-chip[data-entry="team4_p1"]' }, ...type('#cp-yds', '287'),
            { expression: "document.getElementById('contest-prompt').scrollIntoView({ block: 'center' }); document.activeElement.blur(); 'centered'" }, ...shot('E2b-long-drive-prompt.png'),
            { tap: '#cp-save' }, { sleep: 300 }, { expression: CARD_PROBE }] });
    out.E2b = b.ran ? b.values : b;
    if (b.ran) { const [v0, v1] = b.values;
        check(v0.prompt && /Hole 12 · Long drive/.test(v0.promptText) && /Par 5 · fairway only/.test(v0.promptText) && /In the fairway\? Enter your drive\./.test(v0.promptText) && /Save my drive/.test(v0.promptText), 'E2b: ' + v0.promptText);
        check(v1.writes.some((x) => /"contestEntries\/CTLD\/h12\/team4_p1":\{"name":"Jo Kim","team":"team4","kind":"ld","by":"typed","at":\{".sv":"timestamp"\},"yards":287\}/.test(x)), 'E2b: yards written: ' + JSON.stringify(v1.writes)); }

    // E2c. The board, by tapping the Contests tab.
    const c = await run('E2c', { url: fileUrl('tournament-scorecard.html', `tourney=CT1&team=4&k=${K4}`), db,
        steps: [{ tap: '#tab-btn-contests' }, { sleep: 200 }, top, { expression: CARD_PROBE }, ...shot('E2c-contest-board.png')] });
    out.E2c = c.ran ? c.values[0] : c;
    if (c.ran) { const v = c.values[0];
        check(/1 Dee Nguyen Team 7\s+3 ft 1 in/.test(v.board) && /2 Al Lopez Team 4\s+8 ft 4 in/.test(v.board), 'E2c: KP ranking: ' + v.board);
        check(/11 of 18 teams through/.test(v.board) && /GPS 📍 = marked/.test(v.board), 'E2c: through count and legend: ' + v.board);
        check(/1 Pat Reyes 📍 Team 12\s+301 yds/.test(v.board) && /2 Al Lopez Team 4\s+287 yds/.test(v.board), 'E2c: long drive ranking: ' + v.board);
        check(/nothing is paid in the app/.test(v.board) && !/\$\d/.test(v.board), 'E2c: says nothing is paid, shows no money: ' + v.board); }

    // E2d. The organizer: Contests tab, entries, Make winner on Dee, then Remove Jo.
    const d = await run('E2d', { url: fileUrl('tournament.html', 'tourney=CT1'), db, auth: ownerAuth, settleMs: 7000,
        steps: [{ tap: '#tab-btn-contests' }, { sleep: 300 }, top, { expression: ORG_PROBE },
            { tap: '#contest-entries .ct-btn[data-entry="team7_p0"]' }, { sleep: 300 }, { expression: ORG_PROBE },
            // The server's echo of that write, as the SDK would deliver it (writes do not re-fire listeners in the stand-in).
            { deliver: { path: 'tournaments/CT1', value: Object.assign({}, db.tournaments.CT1, { contests: Object.assign({}, CONTESTS, { h7: { kind: 'kp', allowGps: true, winner: 'team7_p0', lockedAt: 9 } }) }) } }, { sleep: 200 }, { expression: ORG_PROBE }, top, ...shot('E2d-organizer-contests.png')] });
    out.E2d = d.ran ? d.values : d;
    if (d.ran) { const [v0, v1, v2] = d.values;
        check(v0.tab && v0.panel, 'E2d: owner sees the Contests tab and panel');
        check(/Hole 7 par 3\s*Closest to the pin/.test(v0.holes) && /Hole 12 par 5\s*Long drive · fairway only/.test(v0.holes) && /\+ Add a contest hole/.test(v0.holes), 'E2d: holes: ' + v0.holes);
        check(/HOLE 7 ENTRIES/i.test(v0.entries) && /Dee Nguyen 3 ft 1 in/.test(v0.entries) && /Make winner/.test(v0.entries) && /Remove/.test(v0.entries), 'E2d: entries: ' + v0.entries);
        check(/Override: "Make winner" locks the hole; a later entry cannot replace it\. Allow GPS marks: on/.test(v0.note), 'E2d: note: ' + v0.note);
        check(v1.writes.some((x) => /^update tournaments\/CT1\/contests\/h7 \{"winner":"team7_p0","lockedAt":\{".sv":"timestamp"\}\}$/.test(x)), 'E2d: Make winner writes winner + lockedAt: ' + JSON.stringify(v1.writes));
        check(/Dee Nguyen 3 ft 1 in\s*Winner ✓/.test(v2.entries), 'E2d: Winner ✓ once the write is echoed: ' + v2.entries); }
    const dv = await run('E2d-visitor', { url: fileUrl('tournament.html', 'tourney=CT1'), db, auth: 'signed-out', settleMs: 7000, steps: [{ expression: ORG_PROBE }] });
    out.E2dVisitor = dv.ran ? dv.values[0] : dv;
    if (dv.ran) check(!dv.values[0].tab && !dv.values[0].panel, 'E2d: a visitor sees no Contests tab');

    const notRun = Object.entries(out).filter(([, v]) => v && v.ran === false);
    if (notRun.length) { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', notRun }, null, 2)); process.exit(2); }
    console.log(JSON.stringify({ verdict: failures.length ? 'DIVERGENCE' : 'OK', failures, shots: SHOTS ? SHOT_DIR : null, out }, null, 2));
    process.exit(failures.length ? 1 : 0);
})();
