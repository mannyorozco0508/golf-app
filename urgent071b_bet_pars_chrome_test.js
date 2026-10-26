// ============================================================================
// 071b (Manny, URGENT-075 answer 2): "+ Bet" ON A GPS-ONLY ROUND ON A STAND-IN CARD ASKS FOR THE PARS FIRST.
// A GPS-only round on an OpenStreetMap course (activeCourseKey osm_w1540940976) runs on the par-4 stand-in
// card (071). The + Bet sheet now asks before the bet is written - the same screen as Start Round's:
//   1  Match NET, Glenn 12 vs Marty 4 (strokes): asks for the pars AND the stroke indexes; "Not now": NO bet.
//   2  ...the same, filled in: the round's card is the typed pars + indexes, THEN the bet is written.
//   3  Match GROSS: pars only (no index boxes).
//   4  A round whose card has real pars: no ask, the bet is written at once.
// Stub database only (tools/lib/journey.js): nothing leaves the machine.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-bet.js'))) { console.log('Consumer tree: no + Bet sheet - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CODE = 'PARS71';
const STAND_IN = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const REAL = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4].map((par, i) => ({ hole: i + 1, par, hcpIndex: [7, 1, 17, 5, 11, 3, 15, 9, 13, 8, 18, 2, 10, 6, 16, 4, 12, 14][i] }));
function round(card) {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Glenn Green', 'Marty Moss'], hcps: [12, 4], courseData: JSON.parse(JSON.stringify(card)),
        overrides: { activeCourseKey: 'osm_w1540940976', courseName: 'Shortys' } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; delete r.sideMatches;
    return r;
}
const PRE = 'window.__hardpanDoors = true;' + iapStub({ active: true }) + "try{localStorage.setItem('golfapp_me_" + CODE + "','101');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VP = process.env.VIEW071B ? { width: Number(process.env.VIEW071B.split('x')[0]), height: Number(process.env.VIEW071B.split('x')[1]) } : { width: 393, height: 852 };
const SNAP = "JSON.stringify({ pars: !!(document.getElementById('hp-pars') && document.getElementById('hp-pars').style.display !== 'none' && document.getElementById('hp-pars-t')), title: (document.getElementById('hp-pars-t')||{}).textContent||'', nPar: document.querySelectorAll('#hp-pars [data-pa-par]').length, nSi: document.querySelectorAll('#hp-pars [data-pa-si]').length, err: (document.getElementById('hp-pars-err')||{}).textContent||'', sheet: !!(document.getElementById('hp-bet') && document.getElementById('hp-bet').classList.contains('open')), side: Object.keys((window.__DB.events['" + CODE + "'] || {}).sideMatches || {}).length, card: (window.__DB.events['" + CODE + "'].courseData || []).map(function(h){ return h.par + '/' + h.hcpIndex; }).join(' ') })";

async function bet(card, scoring, after) {
    const j = await openJourney({ db: { events: { [CODE]: round(card) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: VP, webgl: true, preScript: PRE });
    const ev = (x) => j.evaluate(x);
    const tap = async (sel) => { const ok = await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) return false; e.click(); return true;})()'); assert.ok(ok, 'no ' + sel); };
    try {
        await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 4500);
        await ev("HardPanBet.open('match', { mode: '1v1' })"); await sleep(400);
        await tap('#hp-bet [data-hb-pick="101"]'); await tap('#hp-bet [data-hb-pick="102"]');
        await tap('#hp-bet [data-hb="next"]'); await sleep(300);
        await tap('#hp-bet [data-hb-stake="10"]');
        await tap('#hp-bet [data-hb-scoring="' + scoring + '"]'); await sleep(200);
        await tap('#hp-bet [data-hb="start"]'); await sleep(900);
        const first = JSON.parse(await ev(SNAP));
        if (process.env.SHOTS071B && after === 'shot') await j.shot(path.join(process.env.SHOTS071B, 'bet-' + scoring + '-' + VP.width + 'x' + VP.height + '.png'));
        let second = null;
        if (after === 'cancel') { await tap('#hp-pars [data-pa="cancel"]'); await sleep(600); second = JSON.parse(await ev(SNAP)); }
        if (after === 'fill') {
            const fill = (dup) => ev("(function(){ var P=" + JSON.stringify(REAL.map((h) => h.par)) + ", S=" + JSON.stringify(REAL.map((h) => h.hcpIndex)) + "; Array.prototype.forEach.call(document.querySelectorAll('#hp-pars [data-pa-par]'), function(i,n){ i.value=P[n]; i.dispatchEvent(new Event('input',{bubbles:true})); }); Array.prototype.forEach.call(document.querySelectorAll('#hp-pars [data-pa-si]'), function(i,n){ i.value=" + (dup ? "(n===1?7:S[n])" : "S[n]") + "; i.dispatchEvent(new Event('input',{bubbles:true})); }); return 1; })()");
            await fill(true); await tap('#hp-pars [data-pa="save"]'); await sleep(400);
            const dupSnap = JSON.parse(await ev(SNAP));
            await fill(false); await tap('#hp-pars [data-pa="save"]'); await sleep(1500);
            second = Object.assign(JSON.parse(await ev(SNAP)), { dupErr: dupSnap.err });
        }
        return { first, second };
    } finally { await j.close(); }
}

test('+ Bet, Match NET with strokes on a stand-in card: asks for the pars AND stroke indexes; "Not now" adds NO bet', { timeout: 150000 }, async () => {
    const { first, second } = await bet(STAND_IN, 'net', 'cancel');
    assert.equal(first.pars, true, 'asked: ' + JSON.stringify(first));
    assert.equal(first.title, 'Pars and stroke indexes for Shortys');
    assert.equal(first.nPar, 18); assert.equal(first.nSi, 18);
    assert.equal(first.side, 0, 'nothing written yet');
    assert.equal(second.pars, false); assert.equal(second.side, 0, 'Not now: no bet'); assert.equal(second.sheet, false, 'the sheet closed');
    assert.equal(second.card.split(' ').map((x) => x.split('/')[0]).join(''), '4'.repeat(18), 'the card is untouched');
});

test('+ Bet NET, filled in: the round\'s card becomes the typed pars + indexes (a duplicate index refused), then the bet is written', { timeout: 150000 }, async () => {
    const { second } = await bet(STAND_IN, 'net', 'fill');
    assert.match(second.dupErr, /stroke index from 1 to 18, each used once/);
    assert.equal(second.card, REAL.map((h) => h.par + '/' + h.hcpIndex).join(' '), 'the round\'s card');
    assert.equal(second.side, 1, 'the bet was written after the card');
    assert.equal(second.pars, false);
});

test('+ Bet, Match GROSS on a stand-in card: pars only (no index boxes)', { timeout: 150000 }, async () => {
    const { first } = await bet(STAND_IN, 'gross', 'shot');
    assert.equal(first.pars, true);
    assert.equal(first.title, 'Pars for Shortys');
    assert.equal(first.nSi, 0);
    assert.equal(first.side, 0);
});

test('+ Bet on a round whose card already has real pars: no ask, the bet is written at once', { timeout: 150000 }, async () => {
    const { first } = await bet(REAL, 'net', null);
    assert.equal(first.pars, false, 'no ask');
    assert.equal(first.side, 1, 'the bet is in');
});
