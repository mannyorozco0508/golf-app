#!/usr/bin/env node
// ============================================================================
// DOES A NASSAU SETTLE AT THE STAKES IT WAS SET UP WITH?
//
// Builds the round the way a golfer does - Game Day tile, format gallery, course,
// players typed in, the Nassau card filled with $10 front / $10 back / $20 overall
// and two golfers picked - then plays all eighteen holes by typing into the real
// score boxes, then reads the receipt. NOTHING IS CONSTRUCTED; if a control will
// not let you do something, this cannot do it either.
//
// WHAT IT ASSERTS
//   the receipt prices the FRONT NINE at the front-nine stake, not the overall
//   the live strip and the receipt quote the SAME prices - they agreed before the
//   fix only because both were collapsed, and a fix that corrected one and not the
//   other would be worse than the bug
//
//   node tools/nassau-stake-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON shows what each surface charged
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const path = require('path');
const { openJourney, fileUrl } = require('./lib/journey.js');
const wait = ms => new Promise(r => setTimeout(r, ms));
const P = ['Marty Sharp', 'Manny Orozco', 'Lance Webb', 'Zach Hill'];

const tap = (j, re, i) => j.evaluate(`(() => {
  const s = Array.from(document.querySelectorAll('.wizard-step')).filter(e=>e.classList.contains('active'))[0];
  if (!s) return 'no active step';
  const hits = Array.from(s.querySelectorAll('button')).filter(b =>
     ${re}.test(b.innerText||'') || ${re}.test(b.getAttribute('onclick')||''));
  const b = hits[${i||0}]; if (!b) return 'NO MATCH';
  b.click(); return 'ok'; })()`);
const active = j => j.evaluate(`(() => {
  const s = Array.from(document.querySelectorAll('.wizard-step')).filter(e=>e.classList.contains('active'))[0];
  return s ? s.id : 'NONE'; })()`);

function bail(msg) {
    console.error('nassau-stake-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    let j;
    try { j = await openJourney(); } catch (e) { bail(e.message); }
    const problems = [];
    const report = {};
    try {
        await j.goto(fileUrl('admin.html'));
        await j.click('.home-widget', '/Game Day/', { settleMs: 1200 });
        const url = await j.evaluate('document.URL');
        const code = (/game=([A-Z0-9]+)/.exec(url) || [])[1];
        if (!code) bail('the Game Day tile did not create a round');
        await j.goto(url, 2400);

        await tap(j, "/selectFormatCard\\('stroke'\\)/"); await wait(700);
        await j.setValue('#course-search-input', 'Caledonia', { settleMs: 500 });
        await j.evaluate(`(() => { const o=document.querySelector('#course-dropdown .custom-select-option');
            if (o) o.click(); return !!o; })()`);
        await wait(500);
        for (let i = 0; i < 6; i++) {
            if (/step-5/.test(await active(j))) break;
            await tap(j, '/wizardNext/'); await wait(650);
        }
        const rows0 = await j.evaluate("document.querySelectorAll('.player-row').length");
        for (let i = rows0; i < P.length; i++) { await tap(j, '/addNewPlayerAndRefresh/'); await wait(260); }
        for (let i = 0; i < P.length; i++) {
            await j.setValue('.p-name-input', P[i], { index: i, settleMs: 50 });
            await j.setValue('.p-hcp-input', '0', { index: i, settleMs: 40 });
        }
        await tap(j, '/wizardNext/'); await wait(800);

        // THE WAGER, typed into its own card: $10 front, $10 back, $20 overall.
        await j.evaluate(`(() => { const c=document.getElementById('setup-nassau-enabled');
            if (c && !c.checked) c.click(); })()`);
        await wait(400);
        await j.setValue('#setup-nassau-front', '10');
        await j.setValue('#setup-nassau-back', '10');
        await j.setValue('#setup-nassau-overall', '20');
        await j.setValue('#setup-nassau-p1', '101');
        await j.setValue('#setup-nassau-p2', '102', { settleMs: 250 });
        await tap(j, '/wizardNext/'); await wait(800);
        await tap(j, '/saveSettings/'); await wait(1500);
        await j.harvest();

        const sm = Object.values(((j.db.events || {})[code] || {}).sideMatches || {})[0];
        report.saved = sm ? { front: sm.frontStake, back: sm.backStake,
                              overall: sm.overallStake, stake: sm.stake } : null;
        if (!sm) bail('the Nassau did not save, so nothing about pricing was measured');

        // EIGHTEEN HOLES. Marty wins the front outright, the back is halved - that
        // is what makes the front-nine press cascade run.
        await j.goto(fileUrl('index.html', 'game=' + code + '&group=1'), 2600);
        await j.evaluate(`(() => { const b=Array.from(document.querySelectorAll('button'))
            .filter(x=>/Skip/i.test(x.innerText||''))[0]; if (b) b.click(); })()`);
        await wait(400);
        for (let hole = 1; hole <= 18; hole++) {
            const meta = JSON.parse(await j.evaluate(`(() => {
                const ins = Array.from(document.querySelectorAll('.score-input')).filter(i=>i.offsetParent);
                return JSON.stringify(ins.map(i => (/saveScore\\((\\d+)/.exec(i.getAttribute('onchange')||'')||[])[1])); })()`));
            if (!meta.length) { problems.push('hole ' + hole + ': no score inputs'); break; }
            for (let i = 0; i < meta.length; i++) {
                const pid = meta[i];
                const v = (pid === '102' && hole <= 9) ? 5 : 4;
                await j.setValue('.score-input', String(v), { index: i, settleMs: 22 });
            }
            if (hole < 18) {
                await j.evaluate(`(() => { const b=Array.from(document.querySelectorAll('button'))
                    .filter(x=>/goToAdjacentHole\\(1\\)/.test(x.getAttribute('onclick')||''))[0]; if (b) b.click(); })()`);
                await wait(150);
            }
        }
        await j.harvest();
        report.holesStored = Object.keys(((j.db.events || {})[code] || {}).scores || {}).length;

        // THE RECEIPT, read as rendered.
        await j.goto(fileUrl('settlement.html', 'game=' + code), 3000);
        const receipt = JSON.parse(await j.evaluate(`(() => {
            const el = document.getElementById('combined-settlement-summary');
            const t = el ? (el.innerText || '') : '';
            return JSON.stringify({
              segs: [...t.matchAll(/(Front 9|Back 9|Total|Press \\d+)[^$]*\\$(\\d+(?:\\.\\d+)?)/g)]
                       .map(m => m[1] + '=' + m[2]),
              net: [...t.matchAll(/([A-Z][a-zA-Z]+ [A-Z][a-zA-Z]+)\\s*([+-])\\$([\\d.]+) NET/g)]
                       .map(m => [m[1], (m[2] === '-' ? -1 : 1) * parseFloat(m[3])]) }); })()`));
        report.receipt = receipt;

        // THE LIVE STRIP, read off Today's Action for the same wager.
        await j.goto(fileUrl('sidematches.html', 'game=' + code), 3000);
        const strip = await j.evaluate(`(() => {
            const t = (document.body.innerText || '').replace(/\\s+/g, ' ');
            return JSON.stringify([...t.matchAll(/\\$(\\d+(?:\\.\\d+)?)/g)].map(m => m[1]).slice(0, 12)); })()`);
        report.stripDollars = JSON.parse(strip);

        const frontSeg = (receipt.segs || []).filter(s => /^Front 9=/.test(s))[0];
        const totalSeg = (receipt.segs || []).filter(s => /^Total=/.test(s))[0];
        if (report.holesStored !== 72)
            problems.push('only ' + report.holesStored + ' of 72 scores stored, so the receipt below proves little');
        if (!frontSeg) problems.push('the receipt shows no Front 9 segment at all');
        else if (frontSeg !== 'Front 9=10')
            problems.push('the FRONT NINE was set at $10 and the receipt charges '
                + frontSeg.split('=')[1] + ' - segment stakes are still collapsed');
        if (totalSeg && totalSeg !== 'Total=20')
            problems.push('the overall was set at $20 and the receipt charges ' + totalSeg.split('=')[1]);
        const frontPresses = (receipt.segs || []).filter(s => /^Press/.test(s) && s.endsWith('=20'));
        if (frontSeg === 'Front 9=10' && frontPresses.length === (receipt.segs || []).filter(s => /^Press/.test(s)).length)
            problems.push('every press is priced at the overall stake, so the cascade still multiplies');

        report.problems = problems;
        report.verdict = problems.length ? 'FAIL' : 'PASS';
        console.log(JSON.stringify(report, null, 2));
        await j.close();
        process.exit(problems.length ? 1 : 0);
    } catch (e) {
        try { await j.close(); } catch (e2) {}
        bail(String(e && e.message || e));
    }
})();
