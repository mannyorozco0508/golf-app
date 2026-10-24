// URGENT-066 feature 2 (scorecard-scan-ai), THE APP PART - THE CONFIRM GRID ON THE REAL CARD, in Chrome.
// index.html with a 2-golfer test round (Ann Alpha has a 5 on hole 1 already). The camera is stubbed
// (a drawn card) and /api/scorecard-scan answers with a sample read: Ann's hole 3 read as an 8 at
// low confidence (her OUT then disagrees with the 36 written on the card), Ben clean.
//   1  HardPanScan.open -> Scan the card -> the grid: amber cells, Ann's OUT red, nothing written
//   2  tap Ann's hole 3, press 3 -> OUT matches, nothing amber, still nothing written
//   3  Use these scores -> "already has a different score" (Ann hole 1: 5 -> 4) -> Replace them
//   4  every score goes through window.saveScore (spied), the round's scores are the card's, and the
//      only database writes are the ones saveScore makes (events/<code>/scores + the audit trail)
//   5  through the feature registry (a stub of customize-screen's ctx): Use ends in
//      ctx.proposeScores([{pid, hole, strokes}], {source:'scan'}) - ZERO writes, saveScore not called;
//      one free use counted (ctx.useOne('scan'))
//   6  not_configured / needs_pass: one plain sentence, no grid, zero writes
// The request the page sent holds no coordinate. Screenshots into SHOTS_066 when set.
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-scan-grid.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const CODE = 'SCN066';
const CD = makeCourseData(18);
const PAR = CD.map((h) => h.par);
const SHOTS = process.env.SHOTS_066 || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VP = process.env.VIEW ? { width: Number(process.env.VIEW.split('x')[0]), height: Number(process.env.VIEW.split('x')[1]) } : { width: 393, height: 852 };

const round = () => {
    const r = wizardSavedRound({ code: CODE, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Ann Alpha', 'Ben Bravo'], courseData: CD,
        overrides: { courseName: 'Test Scan Golf Club', eventName: 'Test 066 scan grid', groupSizeOverrides: { 0: 2 } } });
    r.additionalGames = {}; r.additionalGameInstances = {};
    const ann = r.players[0].id;
    r.scores = { ['p' + ann + '_h1']: 5 };
    return r;
};
// The sample read (the schema of handoff section 6, as the server returns it in `result`).
const sum = (a) => a.reduce((x, y) => x + y, 0);
const annTrue = PAR.slice(), annRead = PAR.slice(); annTrue[0] = 4; annRead[0] = 4; annRead[2] = 8;
const benRead = PAR.map((p) => p + 1);
const RESULT = { notes: '', players: [
    { name: 'Ann Alpha', row_label_as_written: 'ANN', holes: annRead.map((s, i) => ({ hole: i + 1, score: s, confidence: i === 2 ? 0.55 : 0.97 })),
        written_out: sum(annTrue.slice(0, 9)), written_in: sum(annTrue.slice(9)), written_total: sum(annTrue) },
    { name: 'Ben Bravo', row_label_as_written: 'Ben', holes: benRead.map((s, i) => ({ hole: i + 1, score: s, confidence: 0.96 })),
        written_out: sum(benRead.slice(0, 9)), written_in: sum(benRead.slice(9)), written_total: sum(benRead) }] };

// The page's stubs: the capture (a drawn card - the Simulator and Chrome have no document camera)
// and the route (the answer named in window.__scanAnswer). Every request body is kept.
const PRE = "window.__scanSent = []; window.__scanAnswer = { status: 200, body: { status: 'ok', model: 'gemini-2.5-flash', retried: false, paid: false, freeScansLeft: 2, result: " + JSON.stringify(RESULT) + " } };"
    + "window.__hpScanCaptureStub = function () { var c = document.createElement('canvas'); c.width = 900; c.height = 300; var g = c.getContext('2d'); g.fillStyle = '#fbf8ef'; g.fillRect(0, 0, 900, 300); g.fillStyle = '#234'; g.font = '28px sans-serif'; g.fillText('TEST SCAN GOLF CLUB - scorecard', 20, 40); g.font = '22px sans-serif'; g.fillText('ANN  4 4 8 5 4 4 3 5 4  36', 20, 120); g.fillText('Ben  5 5 4 6 5 5 4 6 5  45', 20, 180); var d = c.toDataURL('image/jpeg', 0.8); return { image: d.slice(d.indexOf(',') + 1), width: 900, height: 300 }; };"
    + "(function () { var f0 = window.fetch; window.fetch = function (u, init) { if (String(u).indexOf('/api/scorecard-scan') !== -1) { window.__scanSent.push({ url: String(u), body: init && init.body, headers: init && init.headers }); var a = window.__scanAnswer; return Promise.resolve(new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } })); } return f0 ? f0.apply(this, arguments) : Promise.reject(new Error('no fetch')); }; })();"
    + "try { localStorage.setItem('golfapp_me_" + CODE + "', '101'); sessionStorage.setItem('groupPickDismissed:" + CODE + "', '1'); } catch (e) {}";

test('scan grid on the real card (' + VP.width + 'x' + VP.height + '): edit -> the normal score path', { timeout: 240000 }, async () => {
    const r0 = round();
    const ANN = r0.players[0].id, BEN = r0.players[1].id;
    const j = await openJourney({ db: { events: { [CODE]: r0 }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: VP, preScript: PRE });
    const ev = (x) => j.evaluate(x);
    const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
    const shot = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(600); await j.shot(path.join(SHOTS, 'chrome-' + VP.width + 'x' + VP.height + '-' + n + '.png')); } };
    const writes = () => ev('JSON.stringify(window.__WRITES || [])').then(JSON.parse);
    const tap = (sel) => j.tap(sel);
    try {
        await j.goto(fileUrl('index.html', 'game=' + CODE + '&group=1'), 5000);
        assert.ok(await until("typeof window.saveScore === 'function' && !!window.HardPanScan && !!window.ScorecardValidate && typeof currentData === 'object' && (currentData.players || []).length === 2", 25000), 'the card and the scan loaded');
        await ev("window.__saves = []; (function () { var s = window.saveScore; window.saveScore = function (pid, h, v) { window.__saves.push([String(pid), h, v]); return s.apply(this, arguments); }; })(); 1");
        const w0 = (await writes()).length;

        // 1 open -> scan -> the grid
        assert.equal(await ev("HardPanScan.open('" + CODE + "')"), true);
        await shot('1-tips');
        await tap('#hp-scan [data-hs=shoot]');
        assert.ok(await until("!!document.querySelector('#hp-scan table')", 10000), 'the grid');
        await shot('2-grid');
        const g1 = await ev("JSON.stringify({ sus: document.querySelectorAll('#hp-scan .hs-c.hs-sus').length, red: Array.prototype.map.call(document.querySelectorAll('#hp-scan tr[data-hs-row=\"0\"] .hs-sum.hs-bad'), function (e) { return e.getAttribute('data-hs-sum'); }), key: document.querySelector('#hp-scan .hs-key').getAttribute('data-hs-count'), a3: document.querySelector('#hp-scan [data-hs-cell=\"0:3\"]').textContent })").then(JSON.parse);
        assert.ok(g1.sus >= 9, 'Ann\'s front nine is amber (check this nine): ' + g1.sus);
        assert.ok(g1.red.includes('out'), 'Ann\'s OUT is red: ' + g1.red);
        assert.equal(g1.a3, '8');
        assert.equal((await writes()).length, w0, 'nothing written by scanning');
        assert.equal(await ev('window.__saves.length'), 0);
        // the request: { image, round } - no coordinate, no location
        const sent = await ev('JSON.stringify(window.__scanSent)').then(JSON.parse);
        assert.equal(sent.length, 1);
        const body = JSON.parse(sent[0].body);
        assert.deepEqual(Object.keys(body).sort(), ['image', 'round']);
        assert.deepEqual(body.round.players.map((p) => p.name), ['Ann Alpha', 'Ben Bravo']);
        assert.ok(!/lat|lng|latitude|longitude|location|coords|accuracy|ownerUid|organizerToken|scores/i.test(JSON.stringify(body.round)), JSON.stringify(body.round));

        // 2 edit Ann's hole 3 through the number pad
        await tap('#hp-scan [data-hs-cell="0:3"]');
        assert.ok(await until("!!document.querySelector('#hp-scan [data-hs-pad]')", 3000), 'the number pad');
        await shot('3-pad');
        await tap('#hp-scan [data-hs-key="3"]');
        await sleep(300);
        const g2 = await ev("JSON.stringify({ sus: document.querySelectorAll('#hp-scan .hs-c.hs-sus').length, red: document.querySelectorAll('#hp-scan .hs-sum.hs-bad').length, a3: document.querySelector('#hp-scan [data-hs-cell=\"0:3\"]').textContent, out: document.querySelector('#hp-scan tr[data-hs-row=\"0\"] [data-hs-sum=out]').firstChild.textContent })").then(JSON.parse);
        assert.deepEqual(g2, { sus: 0, red: 0, a3: '3', out: String(sum(annTrue.slice(0, 9))) });
        assert.equal((await writes()).length, w0, 'an edit writes nothing');
        await shot('4-edited');

        // 3 Use these scores -> the diff -> Replace them
        await tap('#hp-scan [data-hs=use]');
        assert.ok(await until("!!document.querySelector('#hp-scan [data-hs-confirm]')", 3000), 'the diff');
        const diff = await ev("document.querySelector('#hp-scan [data-hs-confirm]').textContent");
        assert.match(diff, /Ann Alpha, hole 1: 5 → card 4/);
        assert.equal((await writes()).length, w0, 'nothing written before the answer');
        await shot('5-diff');
        await tap('#hp-scan [data-hs=use-replace]');
        assert.ok(await until("!!document.querySelector('#hp-scan [data-hs-saved]')", 5000), 'saved');
        await sleep(1500);
        await shot('6-saved');

        // 4 every score through saveScore; the round now holds the card
        const saves = await ev('JSON.stringify(window.__saves)').then(JSON.parse);
        assert.equal(saves.length, 36, '18 + 18 boxes, each through saveScore');
        assert.ok(saves.some((s) => s[0] === String(ANN) && s[1] === 3 && s[2] === '3'));
        const db = await ev("JSON.stringify(window.__DB.events['" + CODE + "'].scores)").then(JSON.parse);
        for (let h = 1; h <= 18; h++) {
            assert.equal(Number(db['p' + ANN + '_h' + h]), annTrue[h - 1], 'Ann hole ' + h);
            assert.equal(Number(db['p' + BEN + '_h' + h]), benRead[h - 1], 'Ben hole ' + h);
        }
        const after = (await writes()).slice(w0).map((w) => w.path);
        assert.ok(after.length >= 36);
        const odd = after.filter((p) => !(new RegExp('^/?events/' + CODE + '/(scores/p\\d+_h\\d+|auditLog(/.*)?|scoresVerified(/.*)?)$')).test(p));
        assert.deepEqual(odd, [], 'only the writes saveScore makes');
        assert.equal(await ev("document.querySelector('#hp-scan [data-hs-saved]').getAttribute('data-hs-saved')"), '36');
        await tap('#hp-scan [data-hs=cancel]');

        // 5 through the feature registry (a stub of its ctx): proposeScores, zero writes
        const w1 = (await writes()).length;
        await ev("window.__saves = []; window.__proposed = null; window.__used = 0; window.__ctx = { round: { code: '" + CODE + "' }, ent: { host: false }, usesLeft: function () { return 3 - window.__used; }, useOne: function () { window.__used++; }, toast: function () {}, proposeScores: function (list, o) { window.__proposed = { list: list, o: o }; } };"
            + " window.__scanAnswer.body.result.players[0].holes[2] = { hole: 3, score: 4, confidence: 0.99 }; window.__scanAnswer.body.result.players[0].written_out = " + (sum(annTrue.slice(0, 9)) + 1) + "; window.__scanAnswer.body.result.players[0].written_total = " + (sum(annTrue) + 1) + "; 1");
        assert.equal(await ev("HardPanScan.open('" + CODE + "', window.__ctx)"), true);
        await tap('#hp-scan [data-hs=shoot]');
        assert.ok(await until("!!document.querySelector('#hp-scan table')", 10000));
        assert.equal(await ev('window.__used'), 1, 'one free scan counted on the phone (not paid)');
        await tap('#hp-scan [data-hs=use]');
        assert.ok(await until("!!document.querySelector('#hp-scan [data-hs=use-replace]')", 3000), 'the round already holds the card, Ann hole 3 now differs');
        await tap('#hp-scan [data-hs=use-replace]');
        await sleep(500);
        const prop = await ev('JSON.stringify(window.__proposed)').then(JSON.parse);
        assert.ok(prop, 'proposeScores called');
        assert.deepEqual(prop.o, { source: 'scan' });
        assert.deepEqual(prop.list, [{ pid: ANN, hole: 3, strokes: 4 }], 'only what differs from the card');
        assert.equal(await ev('window.__saves.length'), 0, 'saveScore not called by the scan');
        assert.equal((await writes()).length, w1, 'ZERO database writes through the registry');
        assert.equal(await ev("!!document.getElementById('hp-scan')"), false, 'the grid closed for the score sheet');

        // 6 not_configured and a limit: plain words, no grid, no writes
        for (const [st, b, rx, again] of [[503, { status: 'not_configured' }, /isn’t switched on yet/, false], [402, { status: 'refused', reason: 'needs_pass', freeScansLeft: 0 }, /used your free scorecard scans/, false], [429, { status: 'refused', reason: 'rate_limited' }, /Wait a minute/, true]]) {
            await ev('window.__scanAnswer = ' + JSON.stringify({ status: st, body: b }) + '; 1');
            await ev("HardPanScan.open('" + CODE + "')");
            await tap('#hp-scan [data-hs=shoot]');
            assert.ok(await until("!!document.querySelector('#hp-scan [data-hs-msg]') && !/Reading/.test(document.querySelector('#hp-scan [data-hs-msg]').textContent)", 8000));
            assert.match(await ev("document.querySelector('#hp-scan [data-hs-msg]').textContent"), rx);
            assert.equal(await ev("!!document.querySelector('#hp-scan table')"), false);
            assert.equal(await ev("!!document.querySelector('#hp-scan [data-hs=shoot]')"), again, 'Try again only when it can help');
            await shot('7-' + (b.reason || b.status));
            await tap('#hp-scan [data-hs=cancel]');
        }
        assert.equal((await writes()).length, w1, 'no writes from a refused scan');
        assert.deepEqual(await ev('window.__listenerErrs || []'), []);
    } finally { await j.close(); }
});
