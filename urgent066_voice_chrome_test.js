// ============================================================================
// URGENT-066 #4 - VOICE SCORING IN A REAL ROUND PAGE (real Chrome, index.html, stub db, made-up
// golfers "Test Alpha" / "Test Bravo"). phone3: the REAL feature registry (feature-registry.js) is on
// the page - the voice def is registered with it, and ctx.proposeScores is HardPanFeatures.proposeScores,
// whose confirm sheet ([data-hpf-propose]) is pre-filled and saves through the card's own save.
//   1  gps-voice.js loads from its one script tag and brings in gps-voice-parse.js; ONE def queued
//   2  start() with a stubbed transcript proposes { pid, hole, strokes, putts } - and writes NOTHING
//   3  the confirm is customize's sheet, pre-filled: its Save is the card's own save
//   4  no mounted ctx: the 'hardpan:propose-scores' event with the same payload, and the registry
//      opens the same pre-filled confirm from it (even with no GPS screen mounted)
//   5  a question ("Which ...?") shows in the voice sheet, every button reachable, at 393x852,
//      375x667 and 430x932
// SHOTS=1 saves the screens to ~/Desktop/claude-code-reports/066/voice/.
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-voice.js'))) { console.log('Consumer tree: no voice scoring - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const SHOT_DIR = path.join(os.homedir(), 'Desktop', 'claude-code-reports', '066', 'voice');
async function shot(j, name) { if (!process.env.SHOTS) return; try { fs.mkdirSync(SHOT_DIR, { recursive: true }); await j.shot(path.join(SHOT_DIR, name + '.png')); } catch (e) {} }
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const round = (code) => {
    const r = wizardSavedRound({ code, golfers: 2, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test Alpha', 'Test Bravo'],
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', groupSizeOverrides: { 0: 2 } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.scores = {};
    return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";
// THE REAL REGISTRY (phone3): the voice def as feature-registry.js registered it, mounted with a ctx whose
// proposeScores is the registry's own (recorded on the way through).
const REG = "window.__proposed = []; window.__events = []; window.addEventListener('hardpan:propose-scores', function (e) { window.__events.push(e.detail); });"
    + "window.__voiceDef = function () { return (window.HardPanFeatures ? HardPanFeatures.list() : []).filter(function (x) { return x.id === 'voice'; })[0] || null; };"
    + "window.__mountVoice = function () { var d = window.__voiceDef(); if (!d) return 'no def';"
    + " var ctx = { round: { code: currentMode, players: currentData.players, scores: currentData.scores, courseData: currentData.courseData }, hole: Number(currentViewedHole) || 1, me: '101', role: 'playing', ent: { gps: true },"
    + "  proposeScores: function (list, o) { window.__proposed.push({ list: list, o: o }); return HardPanFeatures.proposeScores(list, o); }, yardage: function () { return { front: 140, middle: 152, back: 165, playsLike: 158, units: 'yd' }; } };"
    + " window.__voiceMount = d.mount(null, ctx); return 'mounted'; };";
const SHEET = "(function(){ var s = document.querySelector('[data-hpf-propose]'); return s ? JSON.stringify({ n: s.getAttribute('data-hpf-propose'), text: s.innerText }) : null; })()";

async function open(code, view) {
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + REG
        + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');localStorage.setItem('hardpan_round_side','bets|" + code + "');}catch(e){}"
        + "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message))});";
    const j = await openJourney({ db: { events: { [code]: round(code) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: view || { width: 393, height: 852 }, preScript: pre });
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1&me=101'), 300);
    const ev = (x) => j.evaluate(x);
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) { if (await ev("!!(window.HardPanVoice && window.HardPanVoiceParse && typeof currentData === 'object' && currentData.players && currentData.players.length)")) break; await sleep(250); }
    await sleep(600);
    return { j, ev };
}

test('voice -> the normal score sheet -> the card’s own save; nothing written before the golfer saves', { timeout: 120000 }, async () => {
    const { j, ev } = await open('TV0661');
    try {
        assert.equal(await ev('typeof HardPanVoice.start'), 'function', 'window.HardPanVoice.start');
        assert.equal(await ev('!!window.HardPanVoiceParse'), true, 'the parser came in beside it');
        assert.equal(await ev("!!window.HardPanFeatures"), true, 'the real registry is on the page');
        assert.equal(await ev("HardPanFeatures.list().filter(function(d){return d.id==='voice'}).length"), 1, 'one def registered with it');
        assert.equal(await ev("window.__voiceDef().available()"), false, 'Chrome has no plugin: hidden');
        const par1 = await ev("Number((currentData.courseData||[]).filter(function(h){return Number(h.hole)===1})[0].par)");
        // 4 first: no mounted ctx -> the event (read from the card) -> the registry's confirm, pre-filled
        const s0 = JSON.parse(await ev("HardPanVoice.start({ transcript: 'a 5, two putts' }).then(function(s){ return JSON.stringify(s); })"));
        assert.equal(s0.phase, 'proposed', JSON.stringify(s0));
        const evs = JSON.parse(await ev('JSON.stringify(window.__events)'));
        assert.equal(evs.length, 1);
        assert.equal(evs[0].source, 'voice');
        assert.equal(evs[0].scores[0].pid, 101); assert.equal(evs[0].scores[0].strokes, 5); assert.equal(evs[0].scores[0].putts, 2);
        await sleep(400);
        const sh0 = JSON.parse(await ev(SHEET) || 'null');
        assert.ok(sh0, 'the event opened customize\'s confirm sheet');
        assert.equal(sh0.n, '1'); assert.match(sh0.text, /Save this score\?/); assert.match(sh0.text, /From voice/); assert.match(sh0.text, /Test Alpha/); assert.match(sh0.text, /\b5\b/); assert.match(sh0.text, /2p/);
        assert.equal(await ev('JSON.stringify(currentData.scores || {})'), '{}', 'nothing written by voice');
        await shot(j, 'chrome-0-confirm-from-event');
        await ev("document.querySelector('[data-hpf-cancel]').click()"); await sleep(300);
        assert.equal(await ev(SHEET), null, 'Cancel closes it');
        assert.equal(await ev('JSON.stringify(currentData.scores || {})'), '{}', 'cancelled: nothing saved');
        // 2 + 3: mounted with the registry's ctx.proposeScores
        assert.equal(await ev('window.__mountVoice()'), 'mounted');
        const s1 = JSON.parse(await ev("HardPanVoice.start({ transcript: 'bogey for Bravo' }).then(function(s){ return JSON.stringify(s); })"));
        assert.equal(s1.phase, 'proposed', JSON.stringify(s1));
        const pr = JSON.parse(await ev('JSON.stringify(window.__proposed)'));
        assert.deepEqual(pr[0], { list: [{ pid: 102, hole: 1, strokes: par1 + 1 }], o: { source: 'voice' } });
        assert.equal(await ev('JSON.stringify(currentData.scores || {})'), '{}', 'proposed, not saved');
        await sleep(400);
        const sh1 = JSON.parse(await ev(SHEET) || 'null');
        assert.ok(sh1, 'customize\'s confirm sheet is open, pre-filled');
        assert.match(sh1.text, /Test Bravo/); assert.match(sh1.text, new RegExp('\\b' + (par1 + 1) + '\\b'));
        await shot(j, 'chrome-1-confirm-from-voice');
        // the golfer confirms: the card's own save
        await ev("document.querySelector('[data-hpf-save]').click()"); await sleep(700);
        assert.equal(await ev("String((currentData.scores||{}).p102_h1)"), String(par1 + 1), 'saved by the card’s save');
        // phone3: SIRI WITH NO GPS SCREEN (the card): the event still opens the confirm, and its Save is the card's save.
        await ev("HardPanVoice._reset(); window.__voiceMount && window.__voiceMount.unmount && window.__voiceMount.unmount(); if (window.HardPanGps && HardPanGps.unmount) HardPanGps.unmount();");
        await sleep(300);
        assert.equal(await ev("!!(window.HardPanGps && HardPanGps.isMounted())"), false, 'the GPS screen is closed');
        const s2 = JSON.parse(await ev("HardPanVoice.start({ transcript: 'a 4 for Alpha on 2' }).then(function(s){ return JSON.stringify(s); })"));
        assert.equal(s2.phase, 'proposed', JSON.stringify(s2));
        await sleep(400);
        const sh2 = JSON.parse(await ev(SHEET) || 'null');
        assert.ok(sh2, 'no GPS screen: the registry still opens its confirm (on the page)');
        assert.match(sh2.text, /Test Alpha/); assert.match(sh2.text, /From voice/);
        await shot(j, 'chrome-2-confirm-no-gps-screen');
        await ev("document.querySelector('[data-hpf-save]').click()"); await sleep(700);
        assert.equal(await ev("String((currentData.scores||{}).p101_h2)"), '4', 'saved by the card’s save (gpsSheetHole(2).save)');
        assert.deepEqual(JSON.parse(await ev('JSON.stringify(window.__e)')), [], 'no page errors');
    } finally { await j.close(); }
});

for (const view of [{ width: 393, height: 852 }, { width: 375, height: 667 }, { width: 430, height: 932 }]) {
    test('the voice sheet asks, and fits, at ' + view.width + 'x' + view.height, { timeout: 120000 }, async () => {
        const { j, ev } = await open('TV066' + String(view.width).slice(-1), view);
        try {
            await ev('window.__mountVoice()');
            const st = JSON.parse(await ev("HardPanVoice.start({ transcript: 'Charlie got a 5' }).then(function(s){ return JSON.stringify(s); })"));
            assert.equal(st.phase, 'ask'); assert.equal(st.result.reason, 'unknown-golfer');
            const geo = JSON.parse(await ev("JSON.stringify((function(){ var s=document.querySelector('#hp-voice-sheet .hpv'); var r=s.getBoundingClientRect(); var bs=Array.prototype.map.call(s.querySelectorAll('button'), function(b){ var q=b.getBoundingClientRect(); return { t: b.textContent, l: q.left, r: q.right, top: q.top, b: q.bottom, h: q.height }; }); return { box: { l: r.left, r: r.right, t: r.top, b: r.bottom }, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, bs: bs, text: s.innerText }; })())"));
            assert.match(geo.text, /I don.t have Charlie in this group/);
            assert.ok(geo.bs.length >= 4, 'Test Alpha, Test Bravo, Try again, Cancel: ' + JSON.stringify(geo.bs.map((b) => b.t)));
            geo.bs.forEach((b) => { assert.ok(b.l >= 0 && b.r <= geo.vw + 0.5 && b.top >= 0 && b.b <= geo.vh + 0.5, b.t + ' on screen ' + JSON.stringify(b)); assert.ok(b.h >= 44, b.t + ' 44pt tall'); });
            assert.ok(geo.box.t >= 0, 'the sheet fits the screen');
            assert.ok(geo.sw <= geo.vw, 'no sideways scroll');
            assert.equal(await ev('window.__proposed.length'), 0, 'nothing proposed while unsure');
            await shot(j, 'chrome-2-ask-' + view.width + 'x' + view.height);
            // the pick answers it
            assert.ok(await ev("(function(){ var b=document.querySelector('#hp-voice-sheet [data-hpv-choice=\"102\"]'); if(!b) return false; b.click(); return true; })()"));
            await sleep(300);
            const pr = JSON.parse(await ev('JSON.stringify(window.__proposed)'));
            assert.equal(pr.length, 1); assert.equal(pr[0].list[0].pid, 102); assert.equal(pr[0].list[0].strokes, 5);
            assert.equal(await ev("!!document.getElementById('hp-voice-sheet')"), false, 'the voice sheet closed');
        } finally { await j.close(); }
    });
}
