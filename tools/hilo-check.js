#!/usr/bin/env node
// ============================================================================
// HI-LO, IN A REAL CHROME (mailbox 016, 2026-10-19)
//
// The round is SEEDED (four golfers, a stroke round with no main stake, no scores):
// that is the data source, which is the one thing a check may replace. Everything
// after it is done the way a golfer does it, through the stateful stand-in
// database (tools/lib/journey.js), with real taps:
//
//   Matches -> + side bet -> Format: Hi-Lo -> tap Bob, Manny, Carp, Scott -> $5
//   -> Net -> Start Action
//   the scorecard: type eight holes into the real score boxes
//   the scorecard's My Round card and the Bets tab: the Hi-Lo line
//   ten more holes; then Final Results & Receipt: the Hi-Lo money, zero-sum
//
// No page function is called. Expected figures come from hilo-engine.js run in
// Node on the scores this check typed (the hand-checked arithmetic lives in
// hilo_sidebet_test.js).
//
//   node tools/hilo-check.js [shot-dir]
//
//   exit 0 PASS   exit 1 FAIL (the JSON says what)   exit 2 could not run - NOTHING PROVEN
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { openJourney, fileUrl } = require('./lib/journey.js');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.argv[2] || null;
const wait = ms => new Promise(r => setTimeout(r, ms));
const CODE = 'HILO16';
const TOKEN = 'orgtok16';
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PLAYERS = [
    { id: 101, name: 'Bob Smith', hcp: '4', playingForMoney: true },
    { id: 102, name: 'Manny Orozco', hcp: '10', playingForMoney: true },
    { id: 103, name: 'Carp Jones', hcp: '2', playingForMoney: true },
    { id: 104, name: 'Scott Lee', hcp: '14', playingForMoney: true },
];
// [Bob, Manny, Carp, Scott] gross, every hole.
const CARD = [
    [4, 5, 4, 6], [3, 5, 4, 4], [4, 4, 4, 4], [5, 6, 4, 7], [4, 6, 5, 5], [3, 4, 4, 5],
    [5, 5, 4, 6], [4, 7, 4, 7], [6, 6, 5, 5], [4, 5, 5, 5], [3, 6, 4, 5], [4, 4, 3, 6],
    [5, 5, 5, 5], [4, 5, 4, 5], [4, 6, 4, 6], [2, 5, 4, 5], [5, 7, 4, 8], [4, 4, 4, 4],
];

const db = { events: { [CODE]: {
    eventName: 'Hi-Lo check', courseName: 'Camas Meadows', activeCourseKey: 'swwa_camasmeadows',
    gameFormat: 'stroke', holeBetStake: 0, courseData: CD, players: PLAYERS, scores: {},
    organizerToken: TOKEN, settlementMode: 'whole-dollar', kpConfirmed: { confirmed: true }
} }, trips: {} };

function bail(msg) {
    console.error('hilo-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

// The expected line and money, from the module itself on the typed scores.
function expected(thru) {
    const sb = { console, Math, Object, Array, String, Number, JSON, isNaN, isFinite, parseInt, parseFloat };
    vm.createContext(sb);
    ['handicap.js', 'action-model.js', 'hilo-engine.js'].forEach(f =>
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f }));
    const sc = {};
    CARD.slice(0, thru).forEach((row, i) => row.forEach((v, j) => { sc['p' + PLAYERS[j].id + '_h' + (i + 1)] = v; }));
    const r = sb.calculateHiLoSideMatch(PLAYERS.slice(0, 2), PLAYERS.slice(2), CD, sc, { scoring: 'net', stake: 5 });
    return { line: sb.hiloLine(r, 'Bob + Manny', 'Carp + Scott'), toSideA: r.toSideA, r: JSON.parse(JSON.stringify(r)) };
}

(async () => {
    let j;
    try { j = await openJourney({ db }); } catch (e) { bail(e.message); }
    const problems = [];
    const report = { shots: [] };
    const shot = async (name) => {
        if (!SHOTS) return;
        const f = path.join(SHOTS, name);
        const n = await j.shot(f);
        report.shots.push({ file: f, bytes: n });
    };
    try {
        // iPhone 15: 393 x 852 CSS px at 3x.
        await j.cdp('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });

        // ---- NEW ACTION -> HI-LO -------------------------------------------
        await j.goto(fileUrl('sidematches.html', 'game=' + CODE + '&organizer=' + TOKEN), 3000);
        if (!await j.tap('#sidematches-card button', /side bet|Side Bet|Add|\+/i)) {
            if (!await j.click('#sidematches-card button', '/openSideMatchModal/')) bail('no button opens New Action');
        }
        await wait(500);
        // a one-group round goes straight to the form; a scope step, if shown, is "This Group"
        await j.evaluate(`(() => { const s=document.getElementById('sm-scope-step');
            if (s && getComputedStyle(s).display !== 'none') { const b=document.querySelector('.sm-scope-choice'); if (b) b.click(); } })()`);
        const hasOption = await j.evaluate(`!!document.querySelector('#sm-format option[value="hilo"]')`);
        if (!hasOption) problems.push('New Action offers no Hi-Lo format');
        await j.setValue('#sm-format', 'hilo', { settleMs: 300 });
        for (const id of ['101', '102', '103', '104']) {
            const ok = await j.tap(`.player-pick-badge[onclick="pickPlayerForSide('${id}')"]`, null, { settleMs: 200 });
            if (!ok) problems.push('could not tap golfer ' + id);
        }
        if (!await j.tap('#sm-stake-presets button', /^\s*\$5\s*$/)) problems.push('no $5 chip');
        if (!await j.tap('#sm-scoring-label-net', null)) problems.push('no Net control');
        report.form = JSON.parse(await j.evaluate(`(() => {
            const t = id => { const e=document.getElementById(id); return e ? (e.innerText||'').replace(/\\s+/g,' ').trim() : null; };
            const vis = id => { const e=document.getElementById(id); return !!(e && e.offsetParent); };
            return JSON.stringify({ format: document.getElementById('sm-format').value,
                stake: document.getElementById('sm-stake').value, scoring: document.getElementById('sm-scoring').value,
                stakeLabel: t('sm-stake-label'), pairing: t('sm-team-size-indicator'), pressRuleShown: vis('sm-press-rule-group'),
                noteShown: vis('sm-hilo-note'), startsOn: document.getElementById('sm-start-hole').value,
                startOptions: Array.from(document.getElementById('sm-start-hole').options).map(o=>o.value).length }); })()`));
        if (report.form.format !== 'hilo' || report.form.stake !== '5' || report.form.scoring !== 'net')
            problems.push('the form does not hold Hi-Lo / $5 / Net');
        if (report.form.pressRuleShown) problems.push('Hi-Lo shows a press rule');
        if (!/Bob & Manny vs Carp & Scott/.test(report.form.pairing || '')) problems.push('the pairing line is not Bob & Manny vs Carp & Scott');
        await j.evaluate(`document.getElementById('sm-format').scrollIntoView({block:'start'})`);
        await wait(200);
        await shot('016-new-action-hilo.png');
        if (!await j.tap('#sm-save-btn', null, { settleMs: 1200 })) problems.push('no Start Action button');
        await j.harvest();
        const sms = Object.values((j.db.events[CODE] || {}).sideMatches || {});
        report.saved = sms[0] || null;
        if (sms.length !== 1) bail('Start Action wrote ' + sms.length + ' side matches');
        const s = sms[0];
        if (s.format !== 'hilo' || s.stake !== 5 || s.scoring !== 'net' || s.pressRule !== 'none'
            || JSON.stringify(s.teamAIds) !== '["101","102"]' || JSON.stringify(s.teamBIds) !== '["103","104"]' || s.startHole !== 1)
            problems.push('the saved wager is not { hilo, $5, net, no press, 101+102 v 103+104, hole 1 }');

        // ---- SCORES, typed into the real boxes -------------------------------
        const typeHoles = async (from, to) => {
            for (let hole = from; hole <= to; hole++) {
                const ids = JSON.parse(await j.evaluate(`(() => {
                    const ins = Array.from(document.querySelectorAll('.score-input[data-hole="${hole}"]')).filter(i=>i.offsetParent);
                    return JSON.stringify(ins.map(i => i.getAttribute('data-player-id'))); })()`));
                if (ids.length !== 4) { problems.push('hole ' + hole + ': ' + ids.length + ' score boxes'); return; }
                for (let i = 0; i < ids.length; i++) {
                    const col = PLAYERS.findIndex(p => String(p.id) === String(ids[i]));
                    await j.setValue(`.score-input[data-hole="${hole}"][data-player-id="${ids[i]}"]`, String(CARD[hole - 1][col]), { settleMs: 40 });
                }
                if (hole < 18) {
                    await j.click('button', '/goToAdjacentHole\\(1\\)/', { settleMs: 250 });
                }
            }
        };
        await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 3500);
        // HardPan may ask GPS or scorecard first: the scorecard.
        await j.click('button', '/without GPS|Skip|scorecard/i', { settleMs: 800 });
        await typeHoles(1, 8);
        await j.harvest();
        report.scoresAfter8 = Object.keys(j.db.events[CODE].scores || {}).length;
        if (report.scoresAfter8 !== 32) problems.push('after 8 holes ' + report.scoresAfter8 + ' of 32 scores stored');

        // ---- THE LINE, on the scorecard's My Round card and on Bets -----------
        const exp8 = expected(8);
        report.expectedLine8 = exp8.line;
        await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 3500);
        await j.click('button', '/without GPS|Skip|scorecard/i', { settleMs: 800 });
        await j.click('button', '/toggleActionCenter/', { settleMs: 500 });
        report.myRound = await j.text('#action-center-mount');
        if ((report.myRound || '').indexOf(exp8.line) < 0) problems.push('My Round does not read "' + exp8.line + '"');
        await j.evaluate(`(() => { const m=document.getElementById('action-center-mount'); if (m) m.scrollIntoView({block:'start'}); })()`);
        await wait(200);
        await shot('016-scorecard-my-round-hilo.png');

        await j.goto(fileUrl('skins.html', 'game=' + CODE + '&group=1'), 3500);
        report.betsTab = await j.text('#bets-matches');
        if ((report.betsTab || '').indexOf(exp8.line) < 0) problems.push('the Bets tab does not read "' + exp8.line + '"');
        if (/\$/.test((report.betsTab || '').replace(/\$5\/point/, '').replace(/\$0(?!\d)/g, '')))
            problems.push('the Bets tab shows dollars mid-round: ' + report.betsTab);
        await j.evaluate(`(() => { const m=document.getElementById('bets-matches'); if (m) m.scrollIntoView({block:'center'}); })()`);
        await wait(200);
        await shot('016-bets-hilo-line.png');

        // ---- THE REST OF THE ROUND -------------------------------------------
        await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 3500);
        await j.click('button', '/without GPS|Skip|scorecard/i', { settleMs: 800 });
        // the card opens on the first hole not posted
        await typeHoles(9, 18);
        await j.harvest();
        report.scoresAfter18 = Object.keys(j.db.events[CODE].scores || {}).length;
        if (report.scoresAfter18 !== 72) problems.push('after 18 holes ' + report.scoresAfter18 + ' of 72 scores stored');
        const exp18 = expected(18);
        report.expected18 = { line: exp18.line, toSideA: exp18.toSideA, low: [exp18.r.lowA, exp18.r.lowB], high: [exp18.r.highA, exp18.r.highB] };

        // ---- FINAL RESULTS & RECEIPT -----------------------------------------
        await j.goto(fileUrl('settlement.html', 'game=' + CODE), 4000);
        const pageText = (await j.screenText()) || '';
        report.final = await j.text('#combined-settlement-summary');
        const sideCard = JSON.parse(await j.evaluate(`(() => {
            // innerText is the RENDERED text, and the header is text-transform: uppercase
            const card = Array.from(document.querySelectorAll('.settle-card')).find(c => /side matches/i.test(c.innerText||''));
            if (card) card.scrollIntoView({block:'start'});
            return JSON.stringify(card ? (card.innerText||'').replace(/\\s+/g,' ').trim() : null); })()`));
        report.receipt = sideCard;
        await wait(200);
        await shot('016-receipt-hilo.png');
        // NET +/- is a collapsed <details>: opened with a real tap on its summary, then read.
        await j.tap('details.net-view > summary', null, { settleMs: 300 });
        report.netView = await j.text('details.net-view');
        report.payOut = await j.evaluate(`(() => { const c = Array.from(document.querySelectorAll('.settle-card')).find(x => /pay out/i.test(x.innerText||'')); return c ? (c.innerText||'').replace(/\\s+/g,' ').trim() : null; })()`);
        await j.evaluate(`window.scrollTo(0, 0)`);
        await wait(200);
        await shot('016-final-results-hilo.png');
        await j.evaluate(`(() => { const e=document.querySelector('details.net-view'); if (e) e.scrollIntoView({block:'center'}); })()`);
        await wait(200);
        await shot('016-final-net-hilo.png');

        const half = Math.abs(exp18.toSideA) / 2;
        if (!/Hi-Lo/.test(sideCard || '')) problems.push('the receipt has no Hi-Lo wager');
        if (!/Low Ball/.test(sideCard || '') || !/High Ball/.test(sideCard || '')) problems.push('the receipt does not show Low Ball and High Ball');
        if (exp18.toSideA !== 0 && (sideCard || '').indexOf('$' + Math.abs(exp18.toSideA)) < 0)
            problems.push('the receipt does not show the $' + Math.abs(exp18.toSideA) + ' Hi-Lo net');
        // zero-sum, read off the page: every golfer's signed final figure
        const nets = [];
        PLAYERS.forEach(p => {
            const m = new RegExp(p.name + '\\s*([+-])\\$([\\d,.]+) NET').exec(report.netView || '');
            if (m) nets.push((m[1] === '+' ? 1 : -1) * parseFloat(m[2].replace(/,/g, '')));
            else if (new RegExp(p.name + '\\s*\\$0 NET').test(report.netView || '')) nets.push(0);
        });
        report.finalNets = nets;
        // PAY OUT agrees with NET to within the whole-dollar rounding (no Hi-Lo money
        // counted twice - the money line AND its Low/High notes - which is what an
        // earlier build of this branch did: $15.50 for an $8 NET). The half-dollar
        // rows are the Pay out card's own long-standing rounding display: a 2v2 Match
        // Play at $5 shows the same "$2.50" and "$0.50" rows, measured on this branch.
        PLAYERS.forEach((p, i) => {
            const m = new RegExp(p.name + ' \\$([\\d,.]+)').exec(report.payOut || '');
            if (nets[i] > 0 && (!m || Math.abs(parseFloat(m[1]) - nets[i]) > 1.001))
                problems.push('Pay out shows ' + (m ? '$' + m[1] : 'nothing') + ' for ' + p.name + ', NET says +$' + nets[i]);
        });
        if (nets.length !== 4) problems.push('could not read four Final Results figures');
        else if (Math.abs(nets.reduce((a, b) => a + b, 0)) > 0.001) problems.push('Final Results is not zero-sum: ' + nets.join(', '));
        else if (Math.abs(Math.abs(nets[0] + nets[1]) - Math.abs(exp18.toSideA)) > 1.001)
            problems.push('Final Results moves ' + (nets[0] + nets[1]) + ' to Bob + Manny, expected ' + exp18.toSideA);
        report.halfShare = half;
        report.consoleErrors = j.consoleErrors.filter(e => !/favicon|ERR_FILE_NOT_FOUND|net::/.test(e.text)).slice(0, 10);

        report.problems = problems;
        report.verdict = problems.length ? 'FAIL' : 'PASS';
        console.log(JSON.stringify(report, null, 2));
        await j.close();
        process.exit(problems.length ? 1 : 0);
    } catch (e) {
        try { await j.close(); } catch (e2) {}
        bail(String(e && e.stack || e));
    }
})();
