// ============================================================================
// 020 - MY STATS: START FRESH, REMOVE ONE ROUND, PRACTICE ROUND, IN REAL CHROME (iPhone 15 size).
// Stub db only. Everything here is THIS PHONE's stats stores (localStorage); the round records
// (events/<code>) are read before and after and must be identical.
//
//   1  My stats lists the rounds behind the numbers; "Remove" on one -> [Cancel] keeps it,
//      [Remove] drops it from every stats store (scorecard stats, the GPS sheet's, the HardPan
//      Index) and it never comes back; the others stay.
//   2  "Start fresh" -> [Clear]: every stats store on this phone is empty, the Index too; the
//      round copies, My bag and the round records are untouched.
//   3  A round with the Tools sheet's "Practice round" ON: what was saved for it is dropped and
//      nothing more is saved (putts, the round sync, the Index); OFF again: it records again.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-stats.js')) || !fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no My stats - skipped.'); process.exit(0); }
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { openJourney } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const CD = makeCourseData(18);
const X = (e) => ({ expression: e });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// A stats record as the scorecard keeps it (gps-stats.js quick store), 18 holes scored.
function qrec(code, pid, course, at, me) {
    const holes = {}, snap = {};
    CD.forEach((h) => { snap[String(h.hole)] = { s: h.par + 1, par: h.par }; holes[String(h.hole)] = { putts: 2, fw: h.par >= 4 ? 'hit' : undefined }; });
    Object.keys(holes).forEach((n) => { if (holes[n].fw === undefined) delete holes[n].fw; });
    return { v: 1, code, pid: String(pid), course, at, holes, snap, me: !!me };
}
function irec(code, course, at) {
    return { code, course, name: 'Manny', pid: '101', at, tee: { name: 'White', slope: 120, rating: 70, par: 72 }, holes: CD.map((h) => ({ n: h.hole, par: h.par, si: h.hcpIndex, gross: h.par + 1 })) };
}
const now = Date.now();
const SEED = {
    hardpan_qstats_v1_RND1_p101: qrec('RND1', 101, 'Dobson Ranch Golf Course', now - 3 * 864e5, true),
    hardpan_qstats_v1_RND2_p101: qrec('RND2', 101, 'Papago Golf Club', now - 2 * 864e5, true),
    hardpan_qstats_v1_RND2_p102: qrec('RND2', 102, 'Papago Golf Club', now - 2 * 864e5, false),
    hardpan_stats_v1_RND2: { v: 1, code: 'RND2', course: 'Papago Golf Club', at: now - 2 * 864e5, player: '101', holes: { 1: { putts: 2 } }, snap: { 1: { strokes: 5, par: 4 } } },
    hardpan_hp_index_v1: { v: 1, rounds: [irec('RND1', 'Dobson Ranch Golf Course', now - 3 * 864e5), irec('RND4', 'Legacy Golf Resort', now - 864e5)] },
    // NOT stats: must survive everything.
    golfapp_snap_v1_RND1: { at: now, data: { players: [{ id: 101, name: 'Manny', hcp: '+2.0' }] } },
    hardpan_bag_v1: { v: 1, clubs: { D: 260 } },
    golfapp_me_RND1: '101',
};
const SEED_JS = 'try{' + Object.keys(SEED).map((k) => 'localStorage.setItem(' + JSON.stringify(k) + ',' + JSON.stringify(typeof SEED[k] === 'string' ? SEED[k] : JSON.stringify(SEED[k])) + ');').join('') + '}catch(e){}';
const EVENTS = { RND1: wizardSavedRound({ code: 'RND1', golfers: 2, ownerUid: 'anon-cold', thru: 18, courseData: CD, names: ['Manny', 'Bob'] }) };
const BASE = 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true });
const STORE = "JSON.stringify({ keys: Object.keys(localStorage).filter(function (k) { return /^hardpan_(q?stats_v1|hp_index_v1|nostats_)|^golfapp_snap_v1_|^hardpan_bag_v1/.test(k); }).sort(),"
    + " index: (JSON.parse(localStorage.getItem('hardpan_hp_index_v1') || 'null') || { rounds: [] }).rounds.map(function (r) { return r.code; }),"
    + " rows: Array.prototype.map.call(document.querySelectorAll('#hp-my-stats [data-ms-round]'), function (r) { return r.getAttribute('data-ms-round'); }),"
    + " ask: !!document.querySelector('#hp-my-stats .ms-ask'), note: ((document.querySelector('#hp-my-stats .ms-note') || {}).textContent || '') })";
// The round record, read through the page's own database (the harness does not wait on a promise: kick, then read).
const EV_KICK = "(function(){ window.__ev = null; firebase.database().ref('events/RND1').once('value').then(function (s) { window.__ev = JSON.stringify({ ev: JSON.stringify(s.val()) }); }); return 'kick'; })()";
const EV = [X(EV_KICK), { waitFor: '!!window.__ev', timeout: 8000 }, X('window.__ev')];

describe('020 My stats: remove one round, start fresh', () => {
    test('Remove one round (Cancel keeps it; Remove drops it from every stats store and it stays gone); Start fresh clears the rest; round records, round copies and My bag untouched', { timeout: 90000 }, async () => {
        const r = await arriveCold({ url: fileUrl('home.html', ''), db: { events: EVENTS, global_courses: {}, trips: {}, tournaments: {}, organizers: {} }, settleMs: 2000, viewport: { width: 393, height: 852 },
            preScript: BASE + SEED_JS, steps: [
                ...EV,
                X('HardPanGpsStats.openMy(); "open"'), { sleep: 300 }, X(STORE),
                // Remove RND2 -> Cancel
                X("document.querySelector('#hp-my-stats [data-ms-remove=\"RND2\"]').click(); 'x'"), { sleep: 150 }, X(STORE),
                X("document.querySelector('#hp-my-stats [data-ms-ask=\"cancel\"]').click(); 'c'"), { sleep: 150 }, X(STORE),
                // Remove RND2 -> Remove
                X("document.querySelector('#hp-my-stats [data-ms-remove=\"RND2\"]').click(); 'x'"), { sleep: 150 },
                X("document.querySelector('#hp-my-stats [data-ms-ask=\"ok\"]').click(); 'ok'"), { sleep: 200 }, X(STORE),
                // A later sync of RND2 (the round reopened) keeps nothing.
                X("HardPanGpsStats.quick.sync({ code: 'RND2', course: 'Papago', round: { players: [{ id: 101 }], scores: { p101_h1: 5 } }, holes: [{ n: 1, par: 4 }] }, '101'); HardPanGpsStats.quick.set({ code: 'RND2' }, 101, 1, { putts: 2 }, 5, 4); 's'"),
                X(STORE),
                // Start fresh -> Clear
                X("document.querySelector('#hp-my-stats [data-ms-fresh]').click(); 'f'"), { sleep: 150 }, X(STORE),
                X("document.querySelector('#hp-my-stats [data-ms-ask=\"ok\"]').click(); 'ok'"), { sleep: 200 }, X(STORE),
                ...EV] });
        assert.equal(r.ok, true, r.reason);
        const [ev0, s0, sAsk, sCancel, sRemoved, sAfterSync, sFreshAsk, sFresh, ev1] = J(r);
        assert.deepEqual(s0.rows, ['RND4', 'RND2', 'RND1'], 'every round, newest first');
        assert.deepEqual(s0.index, ['RND1', 'RND4']);
        assert.equal(sAsk.ask, true, 'Remove asks first');
        assert.deepEqual(sCancel.rows, s0.rows, 'Cancel keeps it');
        assert.deepEqual(sCancel.keys, s0.keys);
        assert.deepEqual(sRemoved.rows, ['RND4', 'RND1'], 'RND2 is gone, the others stay');
        assert.ok(!sRemoved.keys.some((k) => /RND2/.test(k) && !/^hardpan_nostats_/.test(k)), 'every RND2 stats key is gone: ' + JSON.stringify(sRemoved.keys));
        assert.ok(sRemoved.keys.includes('hardpan_nostats_RND2'));
        assert.ok(sRemoved.keys.includes('hardpan_qstats_v1_RND1_p101'), 'RND1 kept');
        assert.deepEqual(sAfterSync.keys, sRemoved.keys, 'a removed round does not come back');
        assert.equal(sFreshAsk.ask, true, 'Start fresh asks first');
        assert.deepEqual(sFresh.rows, [], 'no rounds left');
        assert.deepEqual(sFresh.index, [], 'the HardPan Index rounds are cleared');
        assert.match(sFresh.note, /No rounds on this phone yet/);
        assert.ok(!sFresh.keys.some((k) => /^hardpan_(q?stats_v1_|hp_index_v1)/.test(k)), 'no stats store left: ' + JSON.stringify(sFresh.keys));
        assert.ok(sFresh.keys.includes('golfapp_snap_v1_RND1') && sFresh.keys.includes('hardpan_bag_v1'), 'the round copy and My bag stay');
        assert.ok(ev0.ev && ev0.ev !== 'null');
        assert.equal(ev1.ev, ev0.ev, 'the round record is identical');
    });
});

describe('020 Practice round (Tools sheet)', () => {
    const CODE = 'PRAC20';
    const round = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 18, flights: false, names: ['Manny Orozco', 'Bob Baker'], courseData: CD,
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 2 } } });
    const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true })
        + "try{localStorage.setItem('golfapp_me_" + CODE + "','101');sessionStorage.setItem('groupPickDismissed:" + CODE + "','1');}catch(e){}";
    const KEYS = "JSON.stringify({ keys: Object.keys(localStorage).filter(function (k) { return k.indexOf('" + CODE + "') !== -1 && /^hardpan_(q?stats_v1|nostats)/.test(k); }).sort(),"
        + " index: (JSON.parse(localStorage.getItem('hardpan_hp_index_v1') || 'null') || { rounds: [] }).rounds.map(function (r) { return r.code; }),"
        + " sw: (function(){ var b=document.querySelector('#gps-overlay [data-ts-sw=\"practice\"]'), row=document.querySelector('#gps-overlay [data-ts-row=\"practice\"]'); return b ? { on: b.getAttribute('aria-checked'), shown: !!(row && row.style.display !== 'none'), text: row.innerText } : null; })() })";
    test('ON drops what was saved and saves nothing more (putts, the round sync, the Index); OFF records again; the round record is unchanged', { timeout: 90000 }, async () => {
        const j = await openJourney({ db: { events: { [CODE]: round }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
        try {
            await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 4500);
            const ev = (x) => j.evaluate(x);
            const before = await ev("new Promise(function (res) { db.ref('events/" + CODE + "').once('value').then(function (s) { res(JSON.stringify(s.val())); }); })");
            // The round as the card keeps it: a stats record for this phone's golfer and putts on hole 1; a finished 18 in the Index.
            await ev("HardPanGpsStats.quick.set({ code: '" + CODE + "', course: 'Caledonia' }, 101, 1, { putts: 2 }, 5, 4); HardPanIndex.noteRound('" + CODE + "', currentData, '101'); 1");
            const s0 = JSON.parse(await ev(KEYS));
            assert.ok(s0.keys.includes('hardpan_qstats_v1_' + CODE + '_p101'), JSON.stringify(s0));
            assert.ok(s0.index.includes(CODE), 'the Index has the round: ' + JSON.stringify(s0));
            // The map, then Tools -> Practice round ON.
            await ev("(function(){ var b=(document.querySelector('#hp-card-bet [data-hp-bar=gps]') || document.getElementById('fd-gps-btn')); if(b) b.click(); return 1; })()");
            await sleep(2500);
            assert.ok(await ev('HardPanGps.openTools()'));
            await sleep(300);
            const s1 = JSON.parse(await ev(KEYS));
            assert.ok(s1.sw && s1.sw.shown, 'the Practice round row is in the Tools sheet: ' + JSON.stringify(s1));
            assert.equal(s1.sw.on, 'false');
            assert.match(s1.sw.text, /Practice round\s*Nothing from this round goes into My stats/);
            await ev("document.querySelector('#gps-overlay [data-ts-sw=\"practice\"]').click(); 1");
            await sleep(200);
            const s2 = JSON.parse(await ev(KEYS));
            assert.equal(s2.sw.on, 'true');
            assert.deepEqual(s2.keys, ['hardpan_nostats_' + CODE], 'what was saved is dropped: ' + JSON.stringify(s2));
            assert.ok(!s2.index.includes(CODE), 'out of the Index');
            // Nothing more is saved: putts, the round sync, the Index.
            await ev("HardPanGpsStats.quick.set({ code: '" + CODE + "' }, 101, 2, { putts: 1 }, 4, 4); HardPanGpsStats.quick.sync({ code: '" + CODE + "', round: currentData, holes: [{ n: 1, par: 4 }] }, '101'); HardPanIndex.noteRound('" + CODE + "', currentData, '101'); 1");
            const s3 = JSON.parse(await ev(KEYS));
            assert.deepEqual(s3.keys, ['hardpan_nostats_' + CODE]);
            assert.ok(!s3.index.includes(CODE));
            // OFF: it records again.
            await ev("document.querySelector('#gps-overlay [data-ts-sw=\"practice\"]').click(); 1");
            await sleep(200);
            await ev("HardPanGpsStats.quick.set({ code: '" + CODE + "' }, 101, 2, { putts: 1 }, 4, 4); HardPanIndex.noteRound('" + CODE + "', currentData, '101'); 1");
            const s4 = JSON.parse(await ev(KEYS));
            assert.equal(s4.sw.on, 'false');
            assert.deepEqual(s4.keys, ['hardpan_qstats_v1_' + CODE + '_p101']);
            assert.ok(s4.index.includes(CODE));
            const after = await ev("new Promise(function (res) { db.ref('events/" + CODE + "').once('value').then(function (s) { res(JSON.stringify(s.val())); }); })");
            assert.equal(after, before, 'the round record is unchanged');
        } finally { await j.close(); }
    });
});
