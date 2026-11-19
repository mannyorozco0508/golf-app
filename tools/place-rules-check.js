#!/usr/bin/env node
// ============================================================================
// PLACE RULES IN A REAL BROWSER (Starkey settings 1-7, layout B, Manny 2026-11-19).
//
// Cold arrival (tools/lib/cold-arrival.js): the Firebase bundles blocked, the record handed in, the page's own init,
// listener and render. The only inputs are real taps (Input events on an element's centre) on the Leaderboard tab
// and a Change link. No page function is called. Text is innerText scoped to the element whose content is the claim.
// Headings (.pz-k) are uppercased by CSS, so innerText reads them in capitals: they are matched case-blind.
// What mini-dom cannot prove and this does: the card is laid out (non-zero box) and readable; the owner's place
// amounts come from the page's own boxes (filled from payoutSpots), not seeded; Change opens the choices.
//
// The record: helpers/prize-fixtures.js starkey() with handicaps (as tournament_place_rules_test.js), rules
// { on: both, scope: round, onePrize: gross, within: round } and one Adjust on B Flight gross Olympic.
//   node tools/place-rules-check.js [--shots <dir>]      exit 0 every check passed, 1 a check failed, 2 no browser
// ============================================================================
'use strict';
const path = require('path');
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const F = require('../helpers/prize-fixtures.js');

const HC = { pA: '8', pS: '0', pJ: '2', pM: '1', pL: '0', pD: '6', pK: '10', pR: '3' };
function rec() {
    const r = F.starkey();
    Object.keys(r.players).forEach((k) => { r.players[k].handicap = HC[k]; });
    r.prizeSettings = { places: { on: 'both', scope: 'round', onePrize: 'gross', within: 'round', edits: { 'fB|gross|r2': { pD: { amount: 60, note: 'committee call' } } } } };
    return r;
}
const dbOf = (r) => ({ '.info': { connected: true }, tournaments: { STK: r }, contestEntries: {}, events: {}, trips: {}, global_courses: {} });
const READ = (ids) => ({ expression: `JSON.stringify((function () { var o = {}; ${JSON.stringify(ids)}.forEach(function (id) { var e = document.getElementById(id);
  if (!e) { o[id] = null; return; } var b = e.getBoundingClientRect(); o[id] = { text: (e.innerText || '').replace(/\\s+/g, ' ').trim(), w: Math.round(b.width), h: Math.round(b.height) }; }); return o; })())` });
const ADJUSTS = { expression: `document.querySelectorAll('#payout-results .pz-adjust').length` };
const shotsAt = (() => { const i = process.argv.indexOf('--shots'); return i > -1 ? process.argv[i + 1] : null; })();

(async () => {
    const results = [];
    const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n     ' + String(detail || '').slice(0, 400))); };
    const owner = await arriveCold({ url: fileUrl('tournament.html', 'tourney=STK'), db: dbOf(rec()), auth: F.OWNER, settleMs: 2500, viewport: { width: 390, height: 844 },
        steps: [{ tap: '#tab-btn-leaderboard' }, { sleep: 500 }, READ(['prize-rules-card', 'payout-results']), ADJUSTS,
            { tap: '#place-rule-ties .pz-change' }, { sleep: 300 }, READ(['prize-rules-card'])]
            .concat(shotsAt ? [{ expression: `document.getElementById('prize-rules-card').scrollIntoView(); 1` }, { shot: path.join(shotsAt, 'places-B-owner-card.png'), viewportOnly: true },
                { expression: `document.getElementById('payout-results').scrollIntoView(); 1` }, { shot: path.join(shotsAt, 'places-B-owner-results.png'), viewportOnly: true }] : []) });
    if (!owner.ok) { console.log('NO BROWSER RUN: ' + owner.reason); process.exit(2); }
    const first = JSON.parse(owner.value[2]), nAdjust = owner.value[3], opened = JSON.parse(owner.value[6]);
    const card = first['prize-rules-card'], res = first['payout-results'];
    check('the "How places go" card is laid out on the organizer\'s screen (non-zero box)', card && card.w > 200 && card.h > 100, JSON.stringify(card && { w: card.w, h: card.h }));
    check('its sentences say the saved rule', /Places go by gross and net\./.test(card.text) && /Places are for each round\./.test(card.text) && /One prize per golfer: gross first, in each round\./.test(card.text), card.text);
    check('Change on Ties opens the two choices', /Split the tied places/.test(opened['prize-rules-card'].text) && /Each gets the full prize/.test(opened['prize-rules-card'].text), opened['prize-rules-card'].text);
    check('the tables are named flight · basis · round, from the page\'s own place boxes', /A Flight · Gross · Cascade/i.test(res.text) && /B Flight · Net · Olympic/i.test(res.text), res.text);
    check('one prize per golfer: Cascade\'s net table holds only Mia Chen', /A Flight · Net · Cascade 1st — Mia Chen \$100 pro shop credit Adjust A Flight · Gross · Olympic/i.test(res.text), res.text);
    check('the Adjust edit shows with its note', /Dana Ruiz · set by the organizer: committee call \$60 pro shop credit/.test(res.text), res.text);
    check('the organizer has an Adjust beside each amount', nAdjust > 10, 'Adjust buttons: ' + nAdjust);
    const golfer = await arriveCold({ url: fileUrl('tournament.html', 'tourney=STK'), db: dbOf(rec()), settleMs: 2500, viewport: { width: 390, height: 844 },
        steps: [{ tap: '#tab-btn-leaderboard' }, { sleep: 500 }, READ(['prize-rules-card', 'payout-results']), ADJUSTS]
            .concat(shotsAt ? [{ expression: `document.getElementById('payout-results').scrollIntoView(); 1` }, { shot: path.join(shotsAt, 'places-B-golfer.png'), viewportOnly: true }] : []) });
    if (!golfer.ok) { console.log('NO BROWSER RUN: ' + golfer.reason); process.exit(2); }
    const g = JSON.parse(golfer.value[2]);
    check('a golfer sees the same tables', /A Flight · Net · Cascade 1st — Mia Chen \$100 pro shop credit A Flight · Gross · Olympic/i.test(g['payout-results'].text), g['payout-results'].text);
    check('a golfer sees no card and no Adjust', (!g['prize-rules-card'] || g['prize-rules-card'].text === '') && golfer.value[3] === 0, JSON.stringify(g['prize-rules-card']) + ' adjust ' + golfer.value[3]);
    const fails = results.filter((x) => !x).length;
    console.log('\n' + (results.length - fails) + ' / ' + results.length + ' PASS');
    process.exit(fails ? 1 : 0);
})();
