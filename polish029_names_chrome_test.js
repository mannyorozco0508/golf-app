// ============================================================================
// POLISH 029 #2 / #16 / #33 - IN REAL CHROME (393x852).
//
// A finished round of "Test A" (12) and "Test B" (5) with a $5 Nassau side bet:
//   #2  the hole sheet's board line, MATCH HCP, the Nassau line, LIVE MATCHES,
//       CURRENT GROUP SCORES, the Bets page, Round Complete, Results (the
//       Receipt), the Leaderboard and Matches each name "Test A" / "Test B" -
//       never a bare "Test" for one of them.
//   #16 no "Test A." anywhere.
//   #33 Settle up: "One payment settles everything".
// After-shots go to SHOTS_029 when it is set (…/029/fixed/).
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CODE = 'NAM029';
const SHOTS = process.env.SHOTS_029 || '';
const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 18, flights: false, names: ['Test A', 'Test B'], hcps: [12, 5] });
delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed; r.additionalGames = {};
r.scores.p101_h12 -= 1;
r.sideMatches = { N1: { format: 'nassau', scoring: 'net', teamAIds: ['101'], teamBIds: ['102'], startHole: 1, createdAt: 111, stake: 5,
    frontStake: 5, backStake: 5, overallStake: 5, pressRule: 'none' } };
// The Games & Bets door's shape: the Nassau IS the round format (no side match).
const CODE2 = 'NAM02B';
const r2 = wizardSavedRound({ code: CODE2, golfers: 2, ownerUid: 'anon-cold', thru: 18, flights: false, names: ['Test A', 'Test B'], hcps: [12, 5],
    overrides: { gameFormat: 'nassau', nassauStake: 10, nassauPressRule: 'none' } });
delete r2.moneyPool; delete r2.kpWinners; delete r2.kpConfirmed; r2.additionalGames = {};
r2.scores.p101_h12 -= 1;
r2.players.forEach((p, i) => { p.team = 'Team ' + (i + 1); });
const DB = { events: { [CODE]: r, [CODE2]: r2 }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} };
const PRE = 'window.__hardpanDoors = true;' + iapStub({ active: true })
    + "try{localStorage.setItem('golfapp_me_" + CODE + "','101');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');"
    + "localStorage.setItem('golfapp_me_" + CODE2 + "','101');sessionStorage.setItem('groupPickDismissed:" + CODE2 + "','1');}catch(e){}";
const Q = 'game=' + CODE + '&group=1';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
let j;
const ev = (x) => j.evaluate(x);
const shot = async (name) => { if (SHOTS) await j.shot(path.join(SHOTS, name + '.png')); };

// Every line that names a Test, with no-break spaces read as spaces.
const linesOf = (txt) => String(txt || '').replace(/ /g, ' ').split('\n').filter(l => /Test/.test(l));
// A bare "Test": not followed by " A" / " B".
// (innerText runs a name into the next cell: "Test BFINAL", "Test AHCP 12".)
const bare = (lines) => lines.filter(l => /\bTest\b(?! [AB](?![a-z]))/.test(l));
function distinct(where, txt) {
    const lines = linesOf(txt);
    assert.ok(lines.some(l => /Test A(?![a-z])/.test(l)) && lines.some(l => /Test B(?![a-z])/.test(l)), where + ': both golfers named\n' + lines.join('\n'));
    assert.deepEqual(bare(lines), [], where + ': a bare "Test"');
    assert.deepEqual(lines.filter(l => /Test [AB]\./.test(l)), [], where + ': "Test A." (#16)');
}

before(async () => {
    j = await openJourney({ db: DB, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
});
after(async () => { if (j) await j.close(); });

test('#2/#16 the scorecard: board line, MATCH HCP, Nassau line, LIVE MATCHES, group scores', { timeout: 90000 }, async () => {
    await j.goto(fileUrl('index.html', Q), 5000);
    const txt = await ev('document.body.innerText');
    distinct('scorecard', txt);
    const l = linesOf(txt).join('\n');
    assert.match(l, /MATCH HCP · Low: Test B \(5\) · Playing: Test A 7 · Test B 0/);
    assert.match(l, /Nassau · Test A v Test B/);
    assert.match(l, /Test A v Test B/);
    assert.match(l, /Test A: -\d+/); assert.match(l, /Test B: -\d+/);
    await ev('(function(){var m=document.getElementById("hole-live-mount"); if(m) m.scrollIntoView(); return 1;})()');
    await shot('2-after-card');
});

test('#16 the GPS score bar and the + Bet sheet: "Test A", never "Test A."', { timeout: 90000 }, async () => {
    await ev('HardPanRound.toGps ? HardPanRound.toGps() : 0; 1'); await sleep(2500);
    const who = await ev("(document.querySelector('.gps-who')||{}).textContent||''");
    if (who) { assert.doesNotMatch(who, /Test [AB]\./); assert.match(who.replace(/\u00a0/g, ' '), /Test A/); }
    await shot('16-after-gps');
    await ev('HardPanRound.closeSheet && HardPanRound.closeSheet(true); HardPanBet.open(); 1'); await sleep(1200);
    await ev('(function(){ var g=document.querySelector("#hp-bet [data-hb-game=nassau]"); if(g) g.click(); ["101","102"].forEach(function(id){ var b=document.querySelector("#hp-bet [data-hb-pick=\\"" + id + "\\"]"); if(b) b.click(); }); return 1; })()'); await sleep(800);
    const sheet = await ev("(document.getElementById('hp-bet')||{}).innerText||''");
    assert.ok(/Test A/.test(sheet.replace(/\u00a0/g, ' ')) && /Test B/.test(sheet.replace(/\u00a0/g, ' ')), 'the + Bet sheet names both:\n' + sheet);
    assert.doesNotMatch(sheet, /Test [AB]\./);
    await shot('16-after-bet');
    await ev('try{HardPanBet.close()}catch(e){}; try{HardPanRound.toCard()}catch(e){}; 1'); await sleep(800);
});

test('#33 Settle up: "One payment settles everything"; names distinct', { timeout: 60000 }, async () => {
    await ev('HardPanRound.openFinish(); 1'); await sleep(1200);
    const txt = await ev("(document.getElementById('hp-sheet')||{}).innerText||''");
    assert.match(txt, /one payment settles everything/i);
    assert.match(txt.replace(/ /g, ' '), /Test B → Test A/);
    await shot('33-after-settle-up');
    await ev('HardPanRound.closeSheet(true); 1');
});

test('#2 Round Complete', { timeout: 60000 }, async () => {
    await ev("typeof openFinishRoundModal==='function' && openFinishRoundModal(); 1"); await sleep(1200);
    const txt = await ev("(document.getElementById('finish-round-modal-overlay')||{}).innerText||''");
    distinct('Round Complete', txt);
    await shot('2-after-round-complete');
});

for (const [pg, tag] of [['skins.html', 'bets'], ['settlement.html', 'results'], ['leaderboard.html', 'leaderboard'], ['sidematches.html', 'matches']]) {
    test('#2 ' + pg + ' (' + tag + ')', { timeout: 60000 }, async () => {
        await j.goto(fileUrl(pg, Q), 5000);
        const txt = await ev('document.body.innerText');
        distinct(pg, txt);
        if (tag === 'bets') assert.match(linesOf(txt).join('\n'), /Test A: \+\$15\.00 \| Test B: -\$15\.00/);
        if (tag === 'results') assert.match(linesOf(txt).join('\n'), /Test A vs Test B/);
        await shot('2-after-' + tag);
    });
}

for (const pg of ['index.html', 'skins.html', 'settlement.html']) {
    test('#2 a Nassau round format (Games & Bets door): ' + pg, { timeout: 60000 }, async () => {
        await j.goto(fileUrl(pg, 'game=' + CODE2 + '&group=1'), 5000);
        const txt = await ev('document.body.innerText');
        if (pg === 'skins.html') {
            // The Bets page names only the side that is up: "Test A 3&2" - never "Test 3&2".
            const lines = linesOf(txt);
            assert.ok(lines.some(l => /Test A 3&2/.test(l)), lines.join('\n'));
            assert.deepEqual(bare(lines), []);
        } else distinct(pg + ' (round-format Nassau)', txt);
    });
}
