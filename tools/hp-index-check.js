#!/usr/bin/env node
// ============================================================================
// THE HARDPAN INDEX (unofficial), REACHED AS A GOLFER (008, feature 8)
//
//   node tools/hp-index-check.js     exit 0 = passed, 1 = a guarantee broke, 2 = could not run
//
// Cold Chrome, the App Store stubbed (tools/lib/iap-stub.js), 5 finished 18s kept on
// the phone (hardpan_hp_index_v1, as the scorecard keeps them):
//   0. The scorecard (index.html) keeps a finished 18 for this phone's golfer.
//   1. Account (admin.html?account=1) shows "HardPan Index (unofficial)", the number,
//      "based on 5 rounds" and "How it's worked out".
//   2. Round Setup (a saved round with this phone's golfer on it): the chip
//      "Use my HardPan Index (unofficial): ..." is on that golfer's row only, and a tap
//      fills the handicap box (the golfer can still type over it).
//   3. The switch off (features.hpIndex = false): no card, no chip.
//   4. Not entitled (no GPS Map): no card, no chip, and no paywall pop-up.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
if (!fs.existsSync(path.join(HERE, 'hp-index.js'))) { console.error('Consumer tree (GPS_ENABLED=0): no HardPan Index.'); process.exit(2); }
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { iapStub } = require(path.join(HERE, 'tools/lib/iap-stub.js'));
const H = require(path.join(HERE, 'hp-index.js'));

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const OVER = [10, 14, 12, 18, 16];   // strokes over par in the 5 rounds
const SEED = { v: 1, rounds: OVER.map((o, k) => ({ code: 'R' + k, at: 1760000000000 + k * 86400000, course: 'Caledonia Golf & Fish Club', name: 'Manny Orozco', pid: '1',
    tee: { name: 'Blue', slope: 128, rating: 70.9, par: 72 },
    holes: PARS.map((p, i) => ({ n: i + 1, par: p, si: i + 1, gross: p + (i < o % 18 ? 1 : 0) + (o >= 18 ? 1 : 0) })) })) };
const WANT = H.compute(SEED.rounds);
const SEED_JS = 'try { localStorage.setItem(' + JSON.stringify(H.KEY) + ', ' + JSON.stringify(JSON.stringify(SEED)) + '); } catch (e) {}';
const SWITCH_OFF = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{features:Object.assign({},(v&&v.features)||{},{hpIndex:false})});}});})();";
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";

const CD = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 }));
const ROUND = { eventName: 'Index Check', gameFormat: 'stroke', courseName: 'Caledonia Golf & Fish Club', courseData: CD, scores: {},
    teeRating: { teeKey: 'blue', teeName: 'Men · Blue', slope: 128, courseRating: 70.9, par: 72, allowance: 100 },
    players: [{ id: 101, name: 'Bob Baker', hcp: '9' }, { id: 102, name: 'Manny Orozco', hcp: '' }, { id: 103, name: 'Cal Cole', hcp: '20' }] };

const ACCOUNT = `JSON.stringify((function () {
  var c = document.getElementById('hp-index-card');
  var pw = document.getElementById('gps-paywall');
  return { card: !!c, text: c ? c.innerText.replace(/\\s+/g, ' ').trim() : null, open: !!(document.getElementById('account-modal') || {}).classList && document.getElementById('account-modal').classList.contains('open'),
    paywall: !!(pw && pw.style.display !== 'none'), e: window.__e };
})())`;
const SETUP = `JSON.stringify((function () {
  var rows = Array.prototype.slice.call(document.querySelectorAll('#player-list .player-row'));
  return { rows: rows.map(function (r) { var n = r.querySelector('.p-name-input'), b = r.querySelector('.p-hcp-input'), c = r.querySelector('.hp-index-chip');
      return { name: n ? n.value : null, hcp: b ? b.value : null, chip: c ? c.textContent : null }; }),
    paywall: !!(document.getElementById('gps-paywall') && document.getElementById('gps-paywall').style.display !== 'none'), e: window.__e };
})())`;

// The saved round opens on its Review: the organizer taps "Edit" on the Players line (a real tap).
const PLAYERS_MARK = { expression: "(function(){var l=[].filter.call(document.querySelectorAll('.wizard-review-row'),function(r){var t=r.querySelector('.wr-label');return t&&/player|golfer/i.test(t.textContent)&&r.offsetParent;}).map(function(r){return r.querySelector('.wizard-edit-link');})[0]; if(!l) return 'no Players Edit'; l.setAttribute('data-hpx-players','1'); return 'found Players Edit';})()" };
const PLAYERS = [PLAYERS_MARK, { tap: '[data-hpx-players]' }];
const run = async (o) => {
    const r = await arriveCold(Object.assign({ settleMs: 3500, viewport: { width: 390, height: 844 } }, o));
    if (!r.ok) throw new Error(r.reason);
    const out = r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
    out.taps = r.value.filter((v) => typeof v === 'string' && v.charAt(0) !== '{');
    return out;
};

(async () => {
    const fails = [], report = { want: { index: WANT.text, rounds: WANT.rounds } };
    const f = (c, m) => { if (!c) fails.push(m); };
    try {
        // 0. THE SCORECARD KEEPS IT: a finished 18 for this phone's golfer ("This is me") is kept.
        const sc = {}; PARS.forEach((p, i) => { sc['p102_h' + (i + 1)] = p + 1; });
        const r0 = await arriveCold({ url: fileUrl('index.html', 'game=HPSC'), db: { events: { HPSC: Object.assign({}, ROUND, { scores: sc }) } }, settleMs: 4000, viewport: { width: 390, height: 844 },
            preScript: ERR + "try { localStorage.setItem('golfapp_me_HPSC', '102'); } catch (e) {}" + iapStub({ active: true }),
            steps: [{ sleep: 1000 }, { expression: 'localStorage.getItem(' + JSON.stringify(H.KEY) + ')' }] });
        if (!r0.ok) throw new Error(r0.reason);
        const kept = JSON.parse(r0.value[1] || 'null');
        const k0 = kept && kept.rounds && kept.rounds[0];
        report.kept = k0 ? { code: k0.code, name: k0.name, tee: k0.tee, holes: k0.holes.length } : null;
        f(k0 && k0.code === 'HPSC' && k0.name === 'Manny Orozco' && k0.holes.length === 18 && k0.tee.slope === 128 && k0.tee.rating === 70.9, 'Scorecard: the finished 18 was not kept: ' + JSON.stringify(report.kept));

        // 1. ACCOUNT, entitled.
        const [a] = await run({ url: fileUrl('admin.html', 'account=1'), preScript: ERR + SEED_JS + iapStub({ active: true }), steps: [{ sleep: 1500 }, { expression: ACCOUNT }] });
        report.account = a;
        f(a.card, 'Account: no HardPan Index card');
        f(a.text && a.text.indexOf('HardPan Index (unofficial)') === 0, 'Account: not labelled "HardPan Index (unofficial)": ' + a.text);
        f(a.text && a.text.indexOf(WANT.text) > 0 && WANT.text, 'Account: the index ' + WANT.text + ' is not shown: ' + a.text);
        f(a.text && a.text.indexOf('based on 5 rounds') > 0, 'Account: no "based on 5 rounds": ' + a.text);
        f(a.text && a.text.indexOf('How it’s worked out') > 0, 'Account: no "How it\'s worked out"');
        f(!/USGA|GHIN/i.test(a.text || ''), 'Account: USGA / GHIN on screen');

        // 2. ROUND SETUP, entitled: the chip on this phone's golfer, a tap fills the box.
        const db = { events: { HPIX: ROUND } };
        const s = await run({ url: fileUrl('admin.html', 'game=HPIX'), db, preScript: ERR + SEED_JS + iapStub({ active: true }),
            steps: [{ sleep: 1500 },
                ...PLAYERS, { sleep: 1200 }, { expression: SETUP },
                // A REAL TAP on the chip.
                { tap: '#player-list .hp-index-chip' }, { sleep: 300 }, { expression: SETUP }] });
        report.setup = s;
        report.taps = s.taps;
        const before = s[0], after = s[1];
        const chips = (before ? before.rows : []).filter((r) => r.chip);
        f(before && before.rows.length === 3, 'Setup: the 3 golfers did not load: ' + JSON.stringify(before));
        f(chips.length === 1 && chips[0].name === 'Manny Orozco', 'Setup: the chip is not on (only) this phone\'s golfer: ' + JSON.stringify(before && before.rows));
        f(chips[0] && chips[0].chip.indexOf('Use my HardPan Index (unofficial): ' + WANT.text) === 0, 'Setup: chip words: ' + (chips[0] && chips[0].chip));
        const m = after && after.rows.filter((r) => r.name === 'Manny Orozco')[0];
        const filled = m && m.hcp;
        // Strokes mode (the default): the course handicap from the round's tee; Index mode: the index.
        const ch = String(H.courseHandicap(WANT.index, 128, 70.9, 72));
        f(filled === ch || filled === WANT.text, 'Setup: the tap did not fill the box (' + filled + ', want ' + ch + ' or ' + WANT.text + ')');
        f(after && after.rows.filter((r) => r.name === 'Bob Baker')[0].hcp === '9', 'Setup: another golfer\'s box changed');
        f(!/USGA|GHIN/i.test(chips[0] ? chips[0].chip : ''), 'Setup: USGA / GHIN on the chip');

        // 3. THE SWITCH OFF: nothing at all.
        const [a3] = await run({ url: fileUrl('admin.html', 'account=1'), preScript: ERR + SEED_JS + SWITCH_OFF + iapStub({ active: true }), steps: [{ sleep: 1500 }, { expression: ACCOUNT }] });
        const [s3] = await run({ url: fileUrl('admin.html', 'game=HPIX'), db, preScript: ERR + SEED_JS + SWITCH_OFF + iapStub({ active: true }), steps: [{ sleep: 1500 }, ...PLAYERS, { sleep: 1200 }, { expression: SETUP }] });
        report.switchOff = { account: a3.card, chips: s3.rows.filter((r) => r.chip).length };
        f(!a3.card, 'Switch off: the Account card is there');
        f(s3.rows.length === 3 && !s3.rows.some((r) => r.chip), 'Switch off: a chip is there (or the round did not load)');

        // 4. NOT ENTITLED: nothing, and no pop-up.
        const [a4] = await run({ url: fileUrl('admin.html', 'account=1'), preScript: ERR + SEED_JS + iapStub({ active: false }), steps: [{ sleep: 1500 }, { expression: ACCOUNT }] });
        const [s4] = await run({ url: fileUrl('admin.html', 'game=HPIX'), db, preScript: ERR + SEED_JS + iapStub({ active: false }), steps: [{ sleep: 1500 }, ...PLAYERS, { sleep: 1200 }, { expression: SETUP }] });
        report.notEntitled = { account: a4.card, chips: s4.rows.filter((r) => r.chip).length, paywall: a4.paywall || s4.paywall };
        f(!a4.card, 'Not entitled: the Account card is there');
        f(s4.rows.length === 3 && !s4.rows.some((r) => r.chip), 'Not entitled: a chip is there (or the round did not load)');
        f(!a4.paywall && !s4.paywall, 'Not entitled: a paywall popped up');
        [a, before, after, a3, s3, a4, s4].forEach((x, i) => f(!(x && x.e && x.e.some((m2) => /hp-index/.test(m2))), 'hp-index.js threw (' + i + '): ' + JSON.stringify(x && x.e)));
    } catch (e) {
        console.error('hp-index-check: could not run: ' + (e && e.message || e));
        process.exit(2);
    }
    report.fails = fails;
    report.verdict = fails.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(fails.length ? 1 : 0);
})();
