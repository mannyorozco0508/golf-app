// ============================================================================
// URGENT-038 #27 + #28 - GAME DAY, NASSAU PICKED, IN REAL CHROME (393x852).
//
// The way a golfer does it (tools/nassau-stake-check.js's walk): Home › Game Day -> step 1
// "Nassau" -> Caledonia -> Test A (12), Test B (5) -> Money. Nothing typed into the Nassau:
//   #27  the boxes start at $5 / $5 / $5 with "No Press" (Manny's one default, as + Bet), the
//        auto-press option priced "Same as each bet ($5)"; Save writes a $5 / $5 / $5 Nassau,
//        pressRule 'none'.
//   #28  Round Ready's Scoring line reads "Nassau (side bet) · scores kept as stroke play",
//        not "Stroke Play". The round is still stored as stroke (gameFormat untouched).
// Stub db only (tools/lib/journey.js): nothing leaves. Shots into SHOTS_038 when set.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');

const SHOTS = process.env.SHOTS_038 || '';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const P = [['Test A', '12'], ['Test B', '5']];
const tap = (j, re, i) => j.evaluate(`(() => { const s = Array.from(document.querySelectorAll('.wizard-step')).filter(e=>e.classList.contains('active'))[0];
  if (!s) return 'no active step'; const hits = Array.from(s.querySelectorAll('button')).filter(b => ${re}.test(b.innerText||'') || ${re}.test(b.getAttribute('onclick')||''));
  const b = hits[${i || 0}]; if (!b) return 'NO MATCH'; b.click(); return 'ok'; })()`);
const active = (j) => j.evaluate(`(() => { const s = Array.from(document.querySelectorAll('.wizard-step')).filter(e=>e.classList.contains('active'))[0]; return s ? s.id : 'NONE'; })()`);

let j;
after(async () => { if (j) await j.close(); });

test('#27 + #28: Game Day Nassau starts at $5 / $5 / $5, presses off; Round Ready says "Nassau (side bet)"', { timeout: 180000 }, async () => {
    j = await openJourney({ viewport: { width: 393, height: 852 } });
    await j.goto(fileUrl('admin.html'));
    await j.click('.home-widget', '/Game Day/', { settleMs: 1200 });
    const url = await j.evaluate('document.URL');
    const code = (/game=([A-Z0-9]+)/.exec(url) || [])[1];
    assert.ok(code, 'the Game Day tile made a round');
    await j.goto(url, 2400);
    // step 1: "What are you playing today?" -> Nassau
    assert.equal(await j.evaluate("(()=>{ const b = document.getElementById('fmt-card-nassau-modern'); if (!b) return 'none'; b.click(); return 'ok'; })()"), 'ok');
    await wait(700);
    await j.setValue('#course-search-input', 'Caledonia', { settleMs: 500 });
    assert.equal(await j.evaluate("(() => { const o = document.querySelector('#course-dropdown .custom-select-option'); if (o) o.click(); return !!o; })()"), true);
    await wait(500);
    for (let i = 0; i < 6; i++) { if (/step-5/.test(await active(j))) break; await tap(j, '/wizardNext/'); await wait(650); }
    const rows0 = await j.evaluate("document.querySelectorAll('.player-row').length");
    for (let i = rows0; i < P.length; i++) { await tap(j, '/addNewPlayerAndRefresh/'); await wait(260); }
    for (let i = 0; i < P.length; i++) {
        await j.setValue('.p-name-input', P[i][0], { index: i, settleMs: 50 });
        await j.setValue('.p-hcp-input', P[i][1], { index: i, settleMs: 40 });
    }
    await tap(j, '/wizardNext/'); await wait(900);
    // MONEY: the Nassau as it arrives - nothing typed.
    const m = JSON.parse(await j.evaluate(`JSON.stringify({ on: document.getElementById('setup-nassau-enabled').checked,
        f: document.getElementById('setup-nassau-front').value, b: document.getElementById('setup-nassau-back').value, o: document.getElementById('setup-nassau-overall').value,
        press: document.getElementById('setup-nassau-press').value, pressText: document.getElementById('setup-nassau-press').selectedOptions[0].text,
        auto: document.getElementById('setup-nassau-autopress-mode').selectedOptions[0].text })`));
    assert.deepEqual(m, { on: true, f: '5', b: '5', o: '5', press: 'none', pressText: 'No Press', auto: 'Same as each bet ($5)' },
        'Game Day\'s Nassau starts where + Bet does: $5 / $5 / $5, presses off');
    if (SHOTS) {
        await j.evaluate("document.getElementById('setup-nassau-box').scrollIntoView({ block: 'start' }); window.scrollBy(0, -140)");
        await wait(200);
        await j.shot(path.join(SHOTS, '27-gameday-money-after.png'));
    }
    await tap(j, '/wizardNext/'); await wait(800);
    await tap(j, '/saveSettings/'); await wait(2000);
    await j.harvest();
    const ev = (j.db.events || {})[code] || {};
    const sm = Object.values(ev.sideMatches || {});
    assert.equal(sm.length, 1, 'one Nassau saved');
    assert.deepEqual([sm[0].format, sm[0].frontStake, sm[0].backStake, sm[0].overallStake, sm[0].pressRule], ['nassau', 5, 5, 5, 'none']);
    assert.equal(ev.gameFormat, 'stroke', 'the round is still stored as stroke - words only');
    // ROUND READY
    const rr = JSON.parse(await j.evaluate("JSON.stringify({ shown: getComputedStyle(document.getElementById('round-ready-screen')).display, scoring: document.getElementById('rr-scoring-text').textContent, action: document.getElementById('rr-action-text').innerText.trim() })"));
    assert.notEqual(rr.shown, 'none', 'Round Ready is up');
    assert.equal(rr.scoring, 'Nassau (side bet) · scores kept as stroke play');
    assert.equal(rr.action, '1 Side Bet');
    if (SHOTS) {
        await j.evaluate('window.scrollTo(0, 0)');
        await wait(200);
        await j.shot(path.join(SHOTS, '28-round-ready-after.png'));
    }
});
