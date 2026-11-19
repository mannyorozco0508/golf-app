#!/usr/bin/env node
// ============================================================================
// FULL-EVENT SIMULATION, LIVE (Manny 2026-11-19 2:45 AM "Tournament readiness"). Test data only.
//
//   node tools/event-sim/run.js [--out <dir>]
//
// BASELINE (final run of this file, 2026-11-19 03:45, on 7c44310e + this commit's tools): 32 / 34 PASS, 514 s.
//   32 + 2 = 34. Both FAILs are one app defect, not the harness: a withdrawn golfer's KP mark on hole 3 still
//   leads the organizer's Contest list, so it is the one confirmed and posted (engine-check.js finds the same, and a
//   second: throughCount counts the withdrawn golfer). Refused off-machine attempts print as a NOTE, not a check.
//
// A local RTDB emulator running the LIVE rules (the 2026-11-16 combined publish, read back), this checkout's pages
// served on 127.0.0.1 (tools/event-sim/server.js), and real Chrome phones (tools/sim/lib/emu-phone.js: the real
// database SDK over a socket to the emulator; nothing can reach the internet). Every action is a tap or typed text
// on the real pages; nothing calls a function a page defines.
//   organizer   tournament.html as the signed-in owner: Desk (check-in index, scan, the turn-in queue), Setup (late
//               add, withdraw), Contests (Make winner), Board (Post results)
//   16 phones   tournament-scorecard.html, one per group link (groups 1-16), all scoring each step at once
//   1 phone     group 18's link: the paper card turned in (Take a photo, Send)
//   spectator   tournament.html as a golfer (the board), TV (tournament-tv.html), the check-in table page
// Group 17 is paper: the organizer scans it at the Desk. The answer key (answer-key.js) is computed independently.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { Emulator, EmuPhone, sleep } = require('../sim/lib/emu-phone.js');
const F = require('./fixture.js');
const K = require('./answer-key.js');
const { finalState, keyInput, stepOf } = require('./final-state.js');
const SITE = require('./server.js');

const args = process.argv.slice(2);
const OUT = args.indexOf('--out') > -1 ? args[args.indexOf('--out') + 1] : path.join(require('os').homedir(), 'Desktop', 'claude-mailbox-shared', 'tournaments', 'event-sim');
const RULES = path.join(require('os').homedir(), 'Desktop', 'claude-mailbox-shared', 'tournaments', 'rules-publish-20261116-combined', 'readback.json');
const CODE = F.CODE;
const results = [];
const item = (area, name, ok, detail) => { results.push({ area, name, ok: !!ok, detail: detail || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + area + ' | ' + name + (ok ? '' : '  -- ' + String(detail || '').slice(0, 300))); };
const t0 = Date.now();
const tlog = (m) => console.log('# ' + ((Date.now() - t0) / 1000).toFixed(0) + 's ' + m);

// The picked photo: a real JPEG drawn on a canvas, handed to the page's own file input the way a picked file arrives.
const PICK = (inputId) => `(function(){ var input = document.getElementById('${inputId}'); if (!input) return 'no input';
  var c = document.createElement('canvas'); c.width = 1600; c.height = 1200; var g = c.getContext('2d'); g.fillStyle = '#f3f0e6'; g.fillRect(0, 0, 1600, 1200);
  g.fillStyle = '#123'; g.font = '60px sans-serif'; for (var i = 0; i < 200; i++) g.fillText(String((i * 7) % 6 + 3), 40 + (i % 20) * 76, 120 + Math.floor(i / 20) * 100);
  var url = c.toDataURL('image/jpeg', 0.9); var bin = atob(url.split(',')[1]); var b = new Uint8Array(bin.length); for (var k = 0; k < bin.length; k++) b[k] = bin.charCodeAt(k);
  var dt = new DataTransfer(); dt.items.add(new File([b], 'card.jpg', { type: 'image/jpeg' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return 'picked'; })()`;

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    if (!Emulator.available()) { console.log('no emulator / java: nothing run'); process.exit(2); }
    const S = finalState();
    const fx = S.b;
    const emu = new Emulator(9411, 'simx72');
    await emu.start(RULES);
    tlog('emulator up with the live rules (' + path.basename(path.dirname(RULES)) + ')');

    // ---- SEED: the event as the organizer set it up, before the first tee shot -------------------------------------
    const keys = { on: true, g: {}, p: {} };
    Object.keys(fx.record.scoringGroups).forEach((gid, i) => { keys.g[gid] = 'k' + gid + 'x' + (1000 + i * 37).toString(36) + 'simkeysimkey'; });
    Object.keys(fx.record.scoringGroups).forEach((gid) => fx.record.scoringGroups[gid].playerIds.forEach((pid) => { keys.p[pid] = keys.g[gid]; }));
    const regs = {};
    Object.keys(fx.record.players).forEach((pid, i) => { regs['r' + pid] = { fullName: fx.record.players[pid].name, email: pid + '@sim.example', createdAt: 1000 + i, approvedAt: 2000 + i, playerId: pid, paid: true }; });
    await emu.write('tournaments/' + CODE, fx.record);
    await emu.write('tournamentKeys/' + CODE, keys);
    await emu.write('registrations/' + CODE, regs);

    // ---- THE SITE + THE SCAN STAND-IN ------------------------------------------------------------------------------
    // Gemini is answered with the paper card the group really kept: the prompt names its golfers in order.
    const byName = {}; fx.players.forEach((p) => { byName[p.name] = p.id; });
    const site = await SITE.start({ emu, scanAnswer: (prompt) => {
        const names = [...prompt.matchAll(/^\d+\. (.+?)(?: \(also written as: .*\))?$/gm)].map((m) => m[1]);
        // the field has namesakes (three Jack Quades): a name is looked up only inside the group whose card this is
        const grp = Object.values(fx.record.scoringGroups).find((g) => names.length && names.every((n) => g.playerIds.some((p) => fx.players.find((x) => x.id === p).name === n)));
        const pidOf = (n) => (grp ? grp.playerIds.find((p) => fx.players.find((x) => x.id === p).name === n) : byName[n]);
        const players = names.map((n) => { const pid = pidOf(n); const card = fx.cards[pid]; const out = card.slice(0, 9).reduce((a, b) => a + b, 0), inn = card.slice(9).reduce((a, b) => a + b, 0);
            return { name: n, row_label_as_written: n, holes: card.map((s, i) => ({ hole: i + 1, score: s, confidence: 0.97 })), written_out: out, written_in: inn, written_total: out + inn }; });
        return { players, notes: '' };
    } });
    tlog('site on ' + site.base);
    const url = (page, q) => site.base + '/' + page + '?' + q;
    const phones = [];
    const launch = async (o) => { tlog("opening " + o.name); const p = await EmuPhone.launch(Object.assign({ emu, settleMs: 2500 }, o)); phones.push(p); return p; };
    const ORG_AUTH = { uid: F.OWNER.uid, email: F.OWNER.email, isAnonymous: false, providerData: [{ providerId: 'password' }] };

    try {
        // ---- PHONES ----------------------------------------------------------------------------------------------------
        const org = await launch({ name: 'organizer', auth: ORG_AUTH, viewport: { width: 1100, height: 900 }, url: url('tournament.html', 'tourney=' + CODE) });
        const groupPhones = {};
        for (let n = 1; n <= 16; n++) {
            const gid = 'g' + String(n).padStart(2, '0');
            groupPhones[gid] = await launch({ name: gid, auth: { uid: 'anon-' + gid, isAnonymous: true }, url: url('tournament-scorecard.html', 'tourney=' + CODE + '&group=' + gid + '&k=' + keys.g[gid]), settleMs: 1500 });
        }
        const g18 = await launch({ name: 'g18-turnin', auth: { uid: 'anon-g18', isAnonymous: true }, url: url('tournament-scorecard.html', 'tourney=' + CODE + '&group=g18&k=' + keys.g.g18), settleMs: 1500 });
        const spectator = await launch({ name: 'spectator', auth: { uid: 'anon-spectator', isAnonymous: true }, url: url('tournament.html', 'tourney=' + CODE) });
        const tv = await launch({ name: 'tv', auth: { uid: 'anon-tv', isAnonymous: true }, viewport: { width: 1400, height: 844 }, url: url('tournament-tv.html', 'tourney=' + CODE) });
        tlog(phones.length + ' phones open');
        item('setup', '16 group phones + the turn-in phone open their card (no error page)', (await Promise.all(Object.values(groupPhones).concat([g18]).map((p) => p.eval("document.getElementById('main-content').style.display === 'block'")))).every(Boolean));

        // ---- CHECK-IN: the Desk writes the table's name list; 60 golfers tap their name at the table ----------------
        await org.tap('#tab-btn-desk', { settle: 2500 });
        const table = await launch({ name: 'checkin-table', auth: { uid: 'anon-table', isAnonymous: true }, url: url('tournament.html', 'tourney=' + CODE + '&checkin=1') });
        const arrive = Object.keys(fx.record.players).slice(0, 60);
        console.log('# DIAG checkin index on the server:', Object.keys((await emu.read('tournaments/' + CODE + '/checkin')) || {}).length, '| table page:', ((await table.text('body')) || '').slice(0, 300));
        console.log('# DIAG ci-here buttons:', await table.eval("document.querySelectorAll('button.ci-here').length"), await table.eval("(document.querySelector('button.ci-here')||{}).outerHTML || ''"));
        let tappedIn = 0;
        for (const pid of arrive) {
            await table.goto(url('tournament.html', 'tourney=' + CODE + '&checkin=1'), 1300);   // the QR, opened again for the next golfer
            if (await table.tap(`button.ci-here[onclick*="'r${pid}'"]`, { settle: 250 }) != null) tappedIn++;
        }
        console.log('# DIAG tapped', tappedIn, 'denied', JSON.stringify(await table.json('window.__dbDenied || []')).slice(0, 300));
        await sleep(1500);
        const arrived = Object.values((await emu.read('registrations/' + CODE)) || {}).filter((e) => e.arrivedAt > 0).length;
        item('check-in', '60 golfers tap their name at the table: 60 arrivals stored', arrived === 60, 'stored ' + arrived);
        const deskText = await org.text('#checkin-tiles');
        item('check-in', 'the Desk tiles say 60 arrived, 11 to come', /60/.test(deskText || '') && /11/.test(deskText || ''), deskText);

        // ---- THE ROUND: 18 steps, every group phone scores the hole it is on, at once --------------------------------
        const active = {};   // gid -> pids still scoring on that phone
        Object.keys(groupPhones).forEach((gid) => { active[gid] = fx.record.scoringGroups[gid].playerIds.slice(); });
        const typed = {};    // what should be on the server now: pid -> hole -> gross
        const offlineQueued = {};
        let latePid = null;
        const typeScore = async (ph, pid, hole, v) => {
            const sel = `input.hole-score-input[onchange*="saveIndividualScore('${pid}', ${hole},"]`;
            const got = await ph.type(sel, String(v), { settle: 60 });
            if (got == null) throw new Error(ph.name + ': no input for ' + pid + ' hole ' + hole);
            for (const type of ['keyDown', 'keyUp']) await ph.cdp('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        };
        const contestAt = async (ph, gid, hole) => {
            const list = (F.CONTEST_ENTRIES[hole] || []).filter((e) => active[gid].indexOf(e[0]) !== -1);
            for (const e of list) {
                await ph.tap(`button.cp-chip[data-entry="${e[0]}"]`, { settle: 200 });
                if (e.length === 3) { await ph.type('#cp-ft', String(e[1]), { settle: 60 }); await ph.type('#cp-in', String(e[2]), { settle: 60 }); }
                else await ph.type('#cp-yds', String(e[1]), { settle: 60 });
                await ph.tap('#cp-save', { settle: 500 });
            }
        };
        const boardKeyAt = (posted) => {
            const players = JSON.parse(JSON.stringify(S.rec.players));
            delete players.p72;
            if (latePid) players[latePid] = { name: F.LATE.name, handicap: F.LATE.handicap, flightId: F.LATE.flightId };
            Object.keys(players).forEach((pid) => { if (pid === F.WITHDRAW.pid && !withdrawnYet) delete players[pid].status; });
            return K.compute(keyInput(Object.assign({}, S, { rec: Object.assign({}, S.rec, { players }) }), posted));
        };
        let withdrawnYet = false;
        const postedNow = () => { const p = {}; Object.keys(typed).forEach((pid) => { p[pid] = Object.assign({}, typed[pid]); }); return p; };
        const readBoard = async (ph) => ph.json(`(function(){ return Array.prototype.map.call(document.querySelectorAll('#leaderboard-list .lb-row.lb-tap'), function (r) { var s = r.querySelectorAll('span'); return { key: r.getAttribute('data-entry'), pos: (r.querySelector('.lb-pos')||{}).innerText, thru: (r.querySelector('.lb-thru')||{}).innerText, toPar: s[s.length - 1].innerText.trim() }; }); })()`);
        const toParText = (n) => (n === 0 ? 'E' : (n > 0 ? '+' + n : '−' + Math.abs(n)));
        const compareBoard = async (label, posted) => {
            await spectator.tap('#tab-btn-leaderboard', { settle: 800 }).catch(() => null);
            await sleep(1500);
            // a golfer with no posted hole sits at the foot with no place ("-"): not a placed row
            const rows = ((await readBoard(spectator)) || []).filter((r) => String(r.pos).trim() !== '-' && String(r.thru).trim() !== '-');
            const key = boardKeyAt(posted);
            const want = key.field;
            const bad = [];
            want.forEach((w) => {
                const r = rows.find((x) => x.key === w.pid);
                if (!r) { bad.push(w.pid + ' missing'); return; }
                const pos = String(r.pos).replace(/^T/, '');
                if (String(w.place) !== pos || String(w.thru) !== String(r.thru) || r.toPar.replace('-', '−') !== toParText(w.toPar)) bad.push(w.pid + ' board ' + JSON.stringify([r.pos, r.thru, r.toPar]) + ' key ' + JSON.stringify([w.place, w.thru, toParText(w.toPar)]));
            });
            rows.forEach((r) => { if (!want.find((w) => w.pid === r.key)) bad.push(r.key + ' on the board, not in the key'); });
            item('live board', label + ': ' + want.length + ' golfers, place + thru + to par on a spectator phone', bad.length === 0, bad.slice(0, 6).join('; '));
            return bad.length === 0;
        };

        for (let step = 1; step <= 18; step++) {
            // chaos before the step
            if (step === F.LATE.addAtStep) {
                await org.tap('#tab-btn-setup', { settle: 800 });
                console.log('# DIAG setup: player-field-section', await org.eval("(function(){ var e=document.getElementById('player-field-section'); return e ? getComputedStyle(e).display + ' ' + Math.round(e.getBoundingClientRect().height) : 'none'; })()"), '| name input', await org.eval("(function(){ var e=document.getElementById('new-player-name'); if(!e) return 'missing'; var r=e.getBoundingClientRect(); return r.width + 'x' + r.height; })()"));
                await org.type('#new-player-name', F.LATE.name, { settle: 100 });
                await org.type('#new-player-hcp', F.LATE.handicap, { settle: 100 });
                await org.tap('button[onclick="addPlayerToField()"]', { settle: 1500 });
                const ps = (await emu.read('tournaments/' + CODE + '/players')) || {};
                latePid = Object.keys(ps).find((k) => ps[k].name === F.LATE.name);
                if (!latePid) { console.log('# DIAG no late player; org dialogs', JSON.stringify(org.dialogs), 'errs', JSON.stringify(org.errs.slice(-4)), 'denied', JSON.stringify(await org.json('window.__dbDenied || []')).slice(0, 300)); if (process.env.SIM_STOP) throw new Error('stop: late add'); }
                await sleep(800);
                await org.select(`select[onchange="assignPlayerToFlight('${latePid}', this.value)"]`, F.LATE.flightId);
                await sleep(800);
                await org.select(`select[onchange="assignPlayerToGroup('${latePid}', this.value)"]`, F.LATE.group);
                await sleep(1500);
                const rec = await emu.read('tournaments/' + CODE);
                item('late add', 'the organizer adds ' + F.LATE.name + ' (20) mid-round: in the field, in C flight, in group 5, with a scoring key', !!latePid && rec.players[latePid].flightId === 'fC' && (rec.scoringGroups.g05.playerIds || []).indexOf(latePid) !== -1 && !!((await emu.read('tournamentKeys/' + CODE + '/p/' + latePid))), 'pid ' + latePid);
                active.g05.push(latePid);
                // the late golfer's card catches up on the holes the group already played
                await sleep(1500);
                for (let s2 = 1; s2 < step; s2++) { const hole = ((5 - 1 + s2 - 1) % 18) + 1; await typeScore(groupPhones.g05, latePid, hole, fx.cards.p72[hole - 1]); (typed[latePid] = typed[latePid] || {})[hole] = fx.cards.p72[hole - 1]; }
            }
            if (step === F.OFFLINE.from) await groupPhones[F.OFFLINE.group].offline(true);
            if (step === F.WITHDRAW.afterHoles + 1) {
                await org.tap('#tab-btn-setup', { settle: 800 });
                await org.tap(`button[onclick="withdrawPlayer('${F.WITHDRAW.pid}')"]`, { settle: 1200 });
                const st = await emu.read('tournaments/' + CODE + '/players/' + F.WITHDRAW.pid + '/status');
                item('withdraw', 'the organizer withdraws ' + F.WITHDRAW.pid + ' after their 9th hole: status withdrawn, their 9 scores kept', st === 'withdrawn' && Object.keys(((await emu.read('tournaments/' + CODE + '/scores')) || {})).filter((k) => k.indexOf(F.WITHDRAW.pid + '_h') === 0).length === 9, 'status ' + st);
                active.g01 = active.g01.filter((p) => p !== F.WITHDRAW.pid);
                withdrawnYet = true;
            }
            // every group phone, at once
            await Promise.all(Object.keys(groupPhones).map(async (gid) => {
                const ph = groupPhones[gid];
                const n = Number(gid.slice(1));
                const hole = ((n - 1 + step - 1) % 18) + 1;
                for (const pid of active[gid]) {
                    const realPid = pid === latePid ? 'p72' : pid;
                    let v = fx.cards[realPid][hole - 1];
                    if (gid === 'g02' && pid === F.WRONG.pid && hole === F.WRONG.hole) v = F.WRONG.wrong;   // the wrong digit
                    await typeScore(ph, pid, hole, v);
                    if (!(gid === F.OFFLINE.group && step >= F.OFFLINE.from && step <= F.OFFLINE.to)) (typed[pid] = typed[pid] || {})[hole] = v;
                    else (offlineQueued[pid] = offlineQueued[pid] || {})[hole] = v;
                }
                if (F.CONTEST_ENTRIES[hole]) await contestAt(ph, gid, hole);
                // the wrong score, fixed on the very next step
                if (gid === 'g02' && step === stepOf(2, F.WRONG.hole) + 1) { const right = fx.cards[F.WRONG.pid][F.WRONG.hole - 1]; await typeScore(ph, F.WRONG.pid, F.WRONG.hole, right); typed[F.WRONG.pid][F.WRONG.hole] = right; }
            }));
            await sleep(1500);
            if (step === stepOf(2, F.WRONG.hole)) {
                const v = await emu.read('tournaments/' + CODE + '/scores/' + F.WRONG.pid + '_h' + F.WRONG.hole);
                item('wrong score', 'group 2 types ' + F.WRONG.wrong + ' for ' + F.WRONG.pid + ' on hole ' + F.WRONG.hole + ': the server holds ' + F.WRONG.wrong, v === F.WRONG.wrong, 'server ' + v);
            }
            if (step === stepOf(2, F.WRONG.hole) + 1) {
                const v = await emu.read('tournaments/' + CODE + '/scores/' + F.WRONG.pid + '_h' + F.WRONG.hole);
                item('wrong score', 'fixed on the next step: the server holds ' + fx.cards[F.WRONG.pid][F.WRONG.hole - 1], v === fx.cards[F.WRONG.pid][F.WRONG.hole - 1], 'server ' + v);
            }
            if (step === F.OFFLINE.to) {
                const before = Object.keys(((await emu.read('tournaments/' + CODE + '/scores')) || {})).filter((k) => /^p(09|10|11|12)_h/.test(k)).length;
                await groupPhones[F.OFFLINE.group].offline(false);
                await sleep(6000);
                const after = Object.keys(((await emu.read('tournaments/' + CODE + '/scores')) || {})).filter((k) => /^p(09|10|11|12)_h/.test(k)).length;
                Object.keys(offlineQueued).forEach((pid) => Object.assign(typed[pid] = typed[pid] || {}, offlineQueued[pid]));
                item('offline', 'group 3 scores ' + (F.OFFLINE.to - F.OFFLINE.from + 1) + ' holes with no signal: none reach the server while offline (' + before + ' of its scores there), all reach it on reconnect (' + after + ')', before === (F.OFFLINE.from - 1) * 4 && after === F.OFFLINE.to * 4, 'before ' + before + ' after ' + after);
            }
            tlog('step ' + step + ' done');
            if (step === 6 || step === 12) await compareBoard('after step ' + step, postedNow());
        }

        // ---- PAPER: group 17 scanned at the Desk, group 18 turned in from a phone ------------------------------------
        await org.tap('#tab-btn-desk', { settle: 1200 });
        await org.tap('#cardcheck-wrap .ck-scan[data-sk="g17"]', { settle: 400 });
        await org.eval(PICK('cardcheck-file'));
        await sleep(4000);
        await org.tap('#ck-use-whole', { settle: 3000 });
        const g17n = Object.keys(((await emu.read('tournaments/' + CODE + '/scores')) || {})).filter((k) => fx.record.scoringGroups.g17.playerIds.some((p) => k.indexOf(p + '_h') === 0)).length;
        item('desk scan', 'group 17\'s paper card scanned at the Desk, Use the whole card: 72 scores written', g17n === 72, g17n + ' scores');
        fx.record.scoringGroups.g17.playerIds.forEach((pid) => { typed[pid] = {}; fx.cards[pid].forEach((v, i) => { typed[pid][i + 1] = v; }); });

        await g18.tap('#turnin-start', { settle: 300 });
        await g18.eval(PICK('turnin-file'));
        await sleep(4000);
        await g18.tap(`button.ti-chip`, { settle: 200 });
        await g18.tap('#turnin-send', { settle: 2500 });
        const waiting = await g18.text('#turnin-card');
        item('card turn-in', 'group 18\'s golfer scans the paper card and sends it: "Waiting for the organizer", no score written by the phone', /Waiting for the organizer/.test(waiting || '') && !Object.keys(((await emu.read('tournaments/' + CODE + '/scores')) || {})).some((k) => /^p(69|70|71|20)_h/.test(k)), (waiting || '').slice(0, 120));
        await org.tap('#ck-back', { settle: 1200 });   // back from group 17's card screen to the Desk list, where the queue is
        await org.tap('#ti-refresh', { settle: 2500 });
        await org.tap('.ti-open[data-sk="g18"]', { settle: 1500 });
        await org.tap('.ti-approve', { settle: 4000 });
        const g18n = Object.keys(((await emu.read('tournaments/' + CODE + '/scores')) || {})).filter((k) => /^p(69|70|71|20)_h/.test(k)).length;
        item('card turn-in', 'the organizer approves it in Cards turned in: 72 scores written through the corrector', g18n === 72, g18n + ' scores');
        fx.record.scoringGroups.g18.playerIds.forEach((pid) => { typed[pid] = {}; fx.cards[pid].forEach((v, i) => { typed[pid][i + 1] = v; }); });
        await sleep(47000);   // the golfer's card asks every 45 s
        item('card turn-in', 'the golfer\'s card then reads "On the leaderboard"', /On the leaderboard/.test((await g18.text('#turnin-card')) || ''), ((await g18.text('#turnin-card')) || '').slice(0, 100));

        // ---- THE FINAL STATE vs THE KEY -----------------------------------------------------------------------------
        const rec = await emu.read('tournaments/' + CODE);
        const truth = S.posted;
        const serverScores = rec.scores || {};
        const badScores = [];
        Object.keys(truth).forEach((pid0) => {
            const pid = pid0 === 'p72' ? latePid : pid0;
            Object.keys(truth[pid0]).forEach((h) => { if (serverScores[pid + '_h' + h] !== truth[pid0][h]) badScores.push(pid + ' h' + h + ' server ' + serverScores[pid + '_h' + h] + ' card ' + truth[pid0][h]); });
        });
        const extra = Object.keys(serverScores).filter((k) => { const m = /^(p\w+?)_h(\d+)$/.exec(k); const pid0 = m && (m[1] === latePid ? 'p72' : m[1]); return !(pid0 && truth[pid0] && truth[pid0][m[2]] !== undefined); });
        item('scores', 'every score on the server is the golfer\'s real card: ' + Object.values(truth).reduce((a, c) => a + Object.keys(c).length, 0) + ' scores, nothing extra', badScores.length === 0 && extra.length === 0, badScores.slice(0, 5).concat(extra.slice(0, 5)).join('; '));

        // the key, with the late golfer's real id
        const players2 = JSON.parse(JSON.stringify(S.rec.players)); players2[latePid] = players2.p72; delete players2.p72;
        const posted2 = JSON.parse(JSON.stringify(S.posted)); posted2[latePid] = posted2.p72; delete posted2.p72;
        const S2 = Object.assign({}, S, { rec: Object.assign({}, S.rec, { players: players2 }) });
        const key = K.compute(keyInput(S2, posted2));
        fs.writeFileSync(path.join(OUT, 'answer-key.json'), JSON.stringify(key, null, 1));
        await compareBoard('final', posted2).catch(() => null);

        // flights on the spectator's board
        for (const fid of Object.keys(rec.flights)) {
            await spectator.tap(`button.lb-flight-btn[onclick="setLeaderboardFlight('${fid}')"]`, { settle: 1200 });
            const rows = (await readBoard(spectator)) || [];
            const want = key.flights[fid];
            const bad = want.filter((w) => { const r = rows.find((x) => x.key === w.pid); return !r || String(r.pos) !== w.label.replace(/^T/, '') && String(r.pos) !== w.label; });
            item('flights', rec.flights[fid].name + ': ' + want.length + ' golfers in the key\'s order and places (' + want.slice(0, 3).map((w) => w.label + ' ' + w.name).join(', ') + ')', bad.length === 0 && rows.length === want.length, bad.slice(0, 4).map((w) => w.pid + ' ' + w.label).join('; ') + ' rows ' + rows.length);
        }
        item('withdraw', F.WITHDRAW.pid + ' is on no board after withdrawal', !((await readBoard(spectator)) || []).some((r) => r.key === F.WITHDRAW.pid));
        item('late add', F.LATE.name + ' is on the board with 18 holes', ((await (async () => { await spectator.tap(`button.lb-flight-btn[onclick="setLeaderboardFlight('')"]`, { settle: 1000 }); return readBoard(spectator); })()) || []).some((r) => r.key === latePid && String(r.thru) === '18'));

        // TV: the board rotates one flight page at a time; watch a full turn and check each flight's leader appears
        const seen = new Set();
        const leaders = Object.keys(key.flights).map((fid) => [rec.flights[fid].name, key.flights[fid].filter((r) => r.place === 1).map((r) => r.name)]);
        for (let i = 0; i < 25 && seen.size < leaders.length; i++) {
            const t = (await tv.text('body')) || '';
            leaders.forEach(([fname, names]) => { if (names.some((n) => t.indexOf(n) !== -1)) seen.add(fname); });
            await sleep(2000);
        }
        item('tv', 'the TV board rotates through the flights and shows each flight\'s leader (' + leaders.map((l) => l[0] + ': ' + l[1].join(' / ')).join('; ') + ')', seen.size === leaders.length, 'seen ' + [...seen].join(', '));

        // KP / LD: the organizer makes the winner the page shows first, as a person would
        await org.tap('#tab-btn-contests', { settle: 1500 });
        for (const hole of Object.keys(key.contests)) {
            await org.tap(`button[onclick*="openContestHole"][data-hole="h${hole}"], button[data-hole="h${hole}"][onclick*="openContestHole"]`, { settle: 800 }).catch(() => null);
            const shown = await org.json(`(function(){ var b = document.querySelector('button[onclick*="makeContestWinner"][data-hole="h${hole}"]'); return b ? b.getAttribute('data-entry') : null; })()`);
            if (shown) await org.tap(`button[onclick*="makeContestWinner"][data-hole="h${hole}"][data-entry="${shown}"]`, { settle: 1200 });
            const w = await emu.read('tournaments/' + CODE + '/contests/h' + hole + '/winner');
            item('contests', (key.contests[hole].kind === 'kp' ? 'KP ' : 'LD ') + hole + ': the leader the organizer sees and confirms is ' + key.contests[hole].pid, w === key.contests[hole].pid, 'the page showed ' + shown + ' first; confirmed ' + w);
        }

        // Post results, then the record golfers see on the recap
        await org.tap('#tab-btn-leaderboard', { settle: 1500 });
        await org.tap('#prize-post-btn', { settle: 3000 });
        const pr = (await emu.read('tournaments/' + CODE + '/prizeResults')) || null;
        item('prizes', 'Post results stores the results', !!pr, '');
        if (pr) {
            const map = (pid) => (pid === latePid ? latePid : pid);
            Object.keys(rec.flights).forEach((fid) => {
                const fname = rec.flights[fid].name;
                const posted = ((pr.places || []).find((x) => x.flight === fname || x.flight === fid) || {}).rows || [];
                const got = posted.filter((r) => Number(r.amount) > 0).map((r) => [r.key, Math.round(Number(r.amount) * 100) / 100]).sort();
                const want = key.prizePlaces[fid].map((p) => [map(p.pid), Math.round(p.amount * 100) / 100]).sort();
                item('prizes', fname + ' places posted: ' + want.map((w) => w[0] + ' ' + w[1]).join(', '), JSON.stringify(got) === JSON.stringify(want), 'posted ' + JSON.stringify(got));
            });
            const gotSk = ((((pr.skins || {}).rounds || [])[0] || {}).won || []).map((w) => [w.hole, w.key, w.skins]);
            const wantSk = key.skins.won.map((w) => [w.hole, w.pid, w.skins]);
            item('skins', 'skins posted: ' + wantSk.map((w) => 'hole ' + w[0] + ' ' + w[1] + ' x' + w[2]).join(', '), JSON.stringify(gotSk) === JSON.stringify(wantSk), 'posted ' + JSON.stringify(gotSk));
            const gotC = ((pr.contests || {}).rows || []).map((r) => [r.hole, r.key]).sort();
            const wantC = Object.values(key.contests).map((c) => [c.hole, c.pid]).sort();
            item('contests', 'contest winners posted: ' + wantC.map((c) => c[0] + ' ' + c[1]).join(', '), JSON.stringify(gotC) === JSON.stringify(wantC), 'posted ' + JSON.stringify(gotC));
        }

        // every phone: no page error, nothing left the machine
        const errs = [], esc = [];
        for (const p of phones) { await p.collect(); p.errs.forEach((e) => errs.push(p.name + ': ' + e)); (await p.netEscapes().catch(() => [])).forEach((u) => esc.push(p.name + ': ' + u)); }
        item('health', 'no page error on any of the ' + phones.length + ' phones', errs.length === 0, errs.slice(0, 6).join(' || '));
        // Every off-machine URL is refused twice (the page's fetch / WebSocket throw, and Chrome blocks *firebaseio.com*
        // and the rest over CDP), so nothing can leave; what is listed here are ATTEMPTS the pages made and the harness
        // refused. Printed as a note, never counted as a pass: a check that cannot fail is not a check.
        console.log('NOTE health | requests a page tried to send off this Mac, all refused by the harness: ' + (esc.length ? [...new Set(esc)].join(' || ') : 'none'));
        fs.writeFileSync(path.join(OUT, 'site-log.json'), JSON.stringify(site.log, null, 1));
    } finally {
        for (const p of phones) { try { await p.close(); } catch (e) {} }
        site.close(); emu.stop();
        fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
        const fails = results.filter((r) => !r.ok).length;
        console.log('\n' + (results.length - fails) + ' / ' + results.length + ' PASS (' + ((Date.now() - t0) / 1000).toFixed(0) + 's)');
    }
}
main().catch((e) => { console.error(e); fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results.concat([{ area: 'run', name: 'the run itself', ok: false, detail: String(e && e.stack) }]), null, 1)); process.exit(2); });
