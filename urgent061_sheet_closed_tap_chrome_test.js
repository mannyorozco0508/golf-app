// ============================================================================
// int-061 - THE SCORE SHEET, TAPPED AS IT CLOSES (real Chrome). The score tap saves at once (the card's
// own save); in the app that save can move the round to another hole, and the sheet closes under the tap
// (gpsSheetPlace). Before int-061 the rest of the tap then read the closed sheet and threw
// "TypeError: ... 'own' in c" (gps-stats.js; seen on the iPhone 17 Simulator). Now it returns quietly.
//   1  a score tap whose save closes the sheet: no error, the sheet stays closed, the score was saved
//   2  a putts tap whose quick-stats save closes it: the same
//   3  a tap on a sheet already closed (a fast double tap): nothing happens, no error
// Made-up golfer ("Test 061"); nothing is written anywhere (the save is a stub).
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-stats.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message))});";

test('the score sheet closed under a tap: no error', { timeout: 120000 }, async () => {
    const j = await openJourney({ db: { events: {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 402, height: 874 }, preScript: ERR });
    const ev = (x) => j.evaluate(x);
    try {
        await j.goto(fileUrl('home.html'), 1500);
        if (!(await ev('!!(window.HardPanGpsStats && HardPanGpsStats.sheet)'))) {
            await ev("new Promise(function(ok){ var s=document.createElement('script'); s.src='gps-stats.js'; s.onload=function(){ok(1)}; s.onerror=function(){ok(0)}; document.head.appendChild(s); })");
        }
        assert.ok(await ev('!!(window.HardPanGpsStats && HardPanGpsStats.sheet)'), 'gps-stats.js');
        // A one-golfer sheet whose save closes it (as a hole change does in the app), like index.html's ctx.
        const OPEN = (closeOn) => "(function(){ window.__saved = []; var S = HardPanGpsStats.sheet; S.close();"
            + " return S.open({ code: 'T061SC', hole: 18, home: 18, last: true, par: 4, stats: true, own: '101', pick: '101',"
            + " golfers: [{ id: '101', name: 'Test 061' }], score: function(){ return 0; },"
            + " save: function(pid, n){ window.__saved.push(pid + ':' + n); " + (closeOn === 'save' ? 'S.close();' : '') + " } }); })()";
        const tap = (sel) => ev("(function(){ var b=document.querySelector('#hp-score-sheet " + sel + "'); if(!b) return 'none'; b.click(); return 'tapped'; })()");
        // 1 - the score tap closes the sheet through its own save.
        assert.ok(await ev(OPEN('save')), 'open');
        assert.equal(await tap('[data-ss-score="4"]'), 'tapped');
        await sleep(300);
        assert.deepEqual(JSON.parse(await ev('JSON.stringify(window.__e)')), [], 'no error after the score tap');
        assert.equal(await ev('HardPanGpsStats.sheet.isOpen()'), false, 'closed; saved ' + await ev('window.__saved.join()') + ' disp ' + await ev("document.getElementById('hp-score-sheet').style.display"));
        assert.equal(await ev("window.__saved.join()"), '101:4', 'the score was saved');
        // 2 - putts, then first putt, each on a sheet that closes as it saves (qSet then close).
        assert.ok(await ev(OPEN('none')), 'open again');
        await tap('[data-ss-score="4"]');
        // The putts tap keeps quick stats (localStorage) - close the sheet right as it does.
        await ev("(function(){ var S = HardPanGpsStats.sheet, f = Storage.prototype.setItem; Storage.prototype.setItem = function(k){ var r = f.apply(this, arguments); if (/^hardpan_qstats_/.test(k) && S.isOpen()) S.close(); return r; }; window.__qs = function(){ Storage.prototype.setItem = f; }; return 1; })()");
        await tap('[data-ss-k="putts"][data-ss-v="2"]');
        await sleep(300);
        assert.equal(await ev('HardPanGpsStats.sheet.isOpen()'), false, 'closed by the putts save');
        assert.deepEqual(JSON.parse(await ev('JSON.stringify(window.__e)')), [], 'no error after putts');
        // 3 - a tap on the closed sheet (a fast double tap): nothing, no error.
        await ev("(function(){ var b=document.querySelectorAll('#hp-score-sheet [data-ss-k], #hp-score-sheet [data-ss-score], #hp-score-sheet [data-ss-save]'); Array.prototype.forEach.call(b, function(x){ x.click(); }); return b.length; })()");
        await sleep(300);
        assert.deepEqual(JSON.parse(await ev('JSON.stringify(window.__e)')), [], 'no error on a closed sheet');
        await ev('window.__qs && window.__qs()');
    } finally { await j.close(); }
});
