// ============================================================================
// URGENT-047 C: CADDIE NOTES PER HOLE, IN REAL CHROME (phone GPS mode, layouts D and C, stub db only,
// synthetic "Test 047" rounds - nothing real is read or written).
//   1  Papago, round TC047A, hole 3: Enter score › Notes › "don't go left" - saved on the phone
//      (hardpan_caddie_v1: papago / 3), not a round note, no database write, no location in it;
//   2  a NEW round at Papago (TC047B): hole 3's GPS bar carries ONE small line "✎ don't go left" under
//      the course line; hole 2 has none; the Notes box on hole 3 holds the note;
//   3  Dobson Ranch (TC047D), hole 3: no line;
//   4  the line: inside the bar, one line, ~12px, nothing over it, the yardages whole, the rail below the
//      bar - at iPhone SE / 15 / Pro Max, layouts D and C. No note: the bar's children are URGENT-030's.
// SHOTS=dir saves the screens.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no GPS - skipped.'); process.exit(0); }
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const SHOTS = process.env.SHOTS || '';
const NOTE = "don't go left";
const mk = (code, key, name, day) => {
    const r = wizardSavedRound({ code, golfers: 1, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Manny Test'],
        overrides: { activeCourseKey: key, courseName: name, eventName: 'Test 047 caddie notes', roundDay: 'Test 047 ' + day, groupSizeOverrides: { 0: 1 } } });
    delete r.moneyPool; r.additionalGames = {}; r.additionalGameInstances = {}; r.sideMatches = {}; r.scores = {};
    return r;
};
const EVENTS = { TC047A: mk('TC047A', 'papago', 'Papago Golf Club', 'Papago 1'), TC047B: mk('TC047B', 'papago', 'Papago Golf Club', 'Papago 2'), TC047D: mk('TC047D', 'dobson_ranch', 'Dobson Ranch Golf Course', 'Dobson') };
const AT = { TC047A: [33.4560, -111.9480], TC047B: [33.4560, -111.9480], TC047D: [33.3753, -111.8793] };
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";
// Each round: this phone is its golfer, the GPS side, and the phone near that course.
const PER = "(function(){ var m=/game=(\\w+)/.exec(location.search); if(!m) return; var c=m[1], at=" + JSON.stringify(AT) + "[c]||[33.456,-111.948];"
    + " try{localStorage.setItem('golfapp_me_'+c,'101');sessionStorage.setItem('groupPickDismissed:'+c,'1');localStorage.setItem('hardpan_round_side','gps|'+c);}catch(e){}"
    + " try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:at[0],longitude:at[1],accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); var t=setInterval(f,1000); return t; }, clearWatch:function(t){clearInterval(t);}, getCurrentPosition:function(ok){ok({coords:{latitude:at[0],longitude:at[1],accuracy:5},timestamp:Date.now()});}}}); } catch(e){} })();";
const PRE = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + PER;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const SIZES = { SE: [375, 667], '15': [393, 852], ProMax: [430, 932] };

let j;
const ev = async (x) => j.evaluate(x);
const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(500); await j.shot(path.join(SHOTS, name + '.png')); } };
async function size(w, h) { await j.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }); await sleep(1000); }
async function openRound(code) {
    await j.goto(fileUrl('index.html', 'game=' + code + '&group=1&me=101'), 3000);
    for (let i = 0; i < 40 && (await ev("!!(window.HardPanGps && HardPanGps.side && HardPanGps.side() === 'gps' && document.querySelector('#gps-overlay .gps-ld-course'))")) !== true; i++) await sleep(300);
    await sleep(800);
}
async function hole(n) {
    await ev('gpsGotoHole(' + n + ')');
    for (let i = 0; i < 20 && (await ev('HardPanGps.hole()')) !== n; i++) await sleep(250);
    await sleep(500);
    // A fresh round with no game shows the card over the map ("Save · back to map"): back to the map.
    await ev("(function(){ var b=document.querySelector('.fd-gps3-map'); if (b && b.offsetParent) b.click(); try { HardPanGps.showSide('gps', { remember: false }); } catch(e){} })()");
    await sleep(700);
}
const LINE = "(function(){ var o=document.getElementById('gps-overlay'), e=o.querySelector('.gps-caddie'), cl=o.querySelector('.gps-ld-course, .gps-lc-course'); var bar=cl&&cl.parentNode;"
    + " var kids = bar ? Array.prototype.map.call(bar.children, function(k){ return String(k.className).split(' ')[0]; }) : [];"
    + " if(!e) return JSON.stringify({ none:true, kids:kids });"
    + " var cs=getComputedStyle(e), b=e.getBoundingClientRect(), br=bar.getBoundingClientRect(), hits=[];"
    + " Array.prototype.forEach.call(o.querySelectorAll('button, .gps-num, .gps-ld-par, .gps-ld-fb, .gps-ld-row2 > *, .gps-ld-rail > *, .gps-lc-plays, .gps-lc-acts, .gps-banner, .gps-ld-course, .gps-lc-course'), function(x){ if (x===e || x.contains(e) || !x.offsetParent) return; var q=x.getBoundingClientRect(); if (q.width<2||q.height<2) return;"
    + "   var w=Math.min(b.right,q.right)-Math.max(b.left,q.left), h=Math.min(b.bottom,q.bottom)-Math.max(b.top,q.top); if (w>1&&h>1) hits.push(String(x.className).slice(0,40)); });"
    + " var cut=[]; Array.prototype.forEach.call(o.querySelectorAll('.gps-num .gps-big, .gps-ld-par span, .gps-hole-num'), function(x){ if (!x.offsetParent) return; var q=x.getBoundingClientRect(); if (q.right > br.right + 1 || q.left < br.left - 1) cut.push(x.className + ' outside the bar'); });"
    + " var rail=o.querySelector('.gps-ld-rail'), rr = rail && rail.offsetParent ? rail.getBoundingClientRect() : null;"
    + " return JSON.stringify({ text: e.textContent, size: parseFloat(cs.fontSize), h: b.height, ws: cs.whiteSpace, inBar: b.left>=br.left-1 && b.right<=br.right+1 && b.top>=br.top-1 && b.bottom<=br.bottom+1, below: b.top >= cl.getBoundingClientRect().bottom - 1,"
    + "   kids: kids, hits: hits, cut: cut, barBottom: br.bottom, railTop: rr ? rr.top : null }); })()";

before(async () => {
    j = await openJourney({ db: { events: EVENTS, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 393, height: 852 }, webgl: true, preScript: PRE });
});
after(async () => { if (j) await j.close(); });

test('1  Papago hole 3: Notes on the score sheet saves a caddie note for the course hole - on the phone, no write, no location', { timeout: 120000 }, async () => {
    await openRound('TC047A');
    assert.equal(await ev('HardPanGps.courseKey()'), 'papago');
    await hole(3);
    assert.equal(await ev("!!document.querySelector('#gps-overlay .gps-caddie')"), false, 'no note yet: no line');
    const w0 = await ev('window.__WRITES.length');
    await ev("document.querySelector('#gps-overlay .gps-score').click()");
    await sleep(500);
    assert.equal(await ev("(function(){var w=document.getElementById('hp-score-sheet'); return !!w && w.style.display!=='none';})()"), true, 'the sheet opened');
    await ev("document.querySelector('#hp-score-sheet [data-ss-notes]').click()");
    await sleep(400);
    assert.equal(await ev("document.querySelector('#hp-score-sheet .hp-ss-notes').getAttribute('data-ss-caddie')"), 'papago');
    await ev("(function(){ var t=document.querySelector('#hp-score-sheet .hp-ss-notes'); t.value=" + JSON.stringify(NOTE) + "; t.dispatchEvent(new Event('input',{bubbles:true})); })()");
    await sleep(300);
    await ev("document.activeElement && document.activeElement.blur()");
    await shot('1-writing-note');
    const rec = JSON.parse(await ev("localStorage.getItem('hardpan_caddie_v1')"));
    assert.equal(rec.notes.papago['3'].t, NOTE);
    assert.deepEqual(Object.keys(rec.notes), ['papago']);
    assert.deepEqual(Object.keys(rec.notes.papago['3']).sort(), ['at', 't'], 'text + time only (signed in: + uid)');
    const raw = JSON.stringify(rec);
    assert.ok(!/lat|lng|lon|coord|accuracy|position/i.test(raw) && !/-?\d{1,3}\.\d{4,}/.test(raw), 'no location: ' + raw);
    const qs = await ev("localStorage.getItem('hardpan_qstats_v1_TC047A_p101')");
    assert.ok(!qs || !/don't go left/.test(qs), 'not a round note');
    const writes = JSON.parse(await ev('JSON.stringify(window.__WRITES.slice(' + w0 + '))'));
    assert.deepEqual(writes, [], 'no database write while the note was written');
    await ev('HardPanGpsStats.sheet.close()');
    await sleep(500);
    assert.match(await ev("(document.querySelector('#gps-overlay .gps-caddie')||{}).textContent || ''"), /don't go left/, 'the line is on hole 3 now');
});

test('2  a new round at Papago: hole 3 shows the note as one small line; hole 2 does not; the Notes box holds it', { timeout: 120000 }, async () => {
    await openRound('TC047B');
    await hole(3);
    const a = JSON.parse(await ev(LINE));
    assert.ok(!a.none, 'the line is there');
    assert.equal(a.text, '✎ ' + NOTE);
    assert.ok(a.below && a.inBar, 'under the course line, inside the bar: ' + JSON.stringify(a));
    await shot('2-next-round-hole3');
    await ev("document.querySelector('#gps-overlay .gps-score').click()"); await sleep(500);
    await ev("document.querySelector('#hp-score-sheet [data-ss-notes]').click()"); await sleep(400);
    assert.equal(await ev("document.querySelector('#hp-score-sheet .hp-ss-notes').value"), NOTE);
    await ev("document.activeElement && document.activeElement.blur()");
    await shot('2-next-round-sheet');
    await ev('HardPanGpsStats.sheet.close()'); await sleep(400);
    await hole(2);
    const b = JSON.parse(await ev(LINE));
    assert.ok(b.none, 'hole 2: no line');
    assert.deepEqual(b.kids, ['gps-back', 'gps-hole-btn', 'gps-ld-div', 'gps-num', 'gps-ld-fb', 'gps-ld-par', 'gps-ld-course'], 'no note: URGENT-030\'s bar exactly');
});

test('3  Dobson Ranch, hole 3: no line', { timeout: 120000 }, async () => {
    await openRound('TC047D');
    assert.equal(await ev('HardPanGps.courseKey()'), 'dobson_ranch');
    await hole(3);
    assert.ok(JSON.parse(await ev(LINE)).none, 'not at Dobson');
    await shot('3-dobson-hole3');
});

for (const lay of ['d', 'c']) {
    for (const [nm, [w, h]] of Object.entries(SIZES)) {
        test(`4  layout ${lay.toUpperCase()}, ${nm}: the line inside the bar, one line ~12px, nothing over it, yardages whole`, { timeout: 90000 }, async () => {
            if (await ev("String(new URLSearchParams(location.search).get('game'))") !== 'TC047B') { await openRound('TC047B'); }
            await size(w, h);
            await ev(`HardPanGps.setLayout('${lay}')`);
            await sleep(800);
            await hole(3);
            const a = JSON.parse(await ev(LINE));
            assert.ok(!a.none, 'the line is there');
            assert.ok(a.inBar && a.below, 'inside its bar, under the course line: ' + JSON.stringify(a));
            assert.ok(a.size >= 11.5 && a.size <= 12.5, '~12px: ' + a.size);
            assert.ok(a.h <= 17, 'one line: ' + a.h);
            assert.equal(a.ws, 'nowrap');
            assert.deepEqual(a.hits, [], 'nothing over it');
            assert.deepEqual(a.cut, [], 'yardages whole');
            if (lay === 'd') {
                assert.deepEqual(a.kids, ['gps-back', 'gps-hole-btn', 'gps-ld-div', 'gps-num', 'gps-ld-fb', 'gps-ld-par', 'gps-ld-course', 'gps-caddie']);
                if (a.railTop != null) assert.ok(a.railTop >= a.barBottom, 'the rail below the bar: ' + JSON.stringify(a));
            }
            await shot(`4-${lay}-${nm}`);
            await ev("HardPanGps.setLayout('d')");
        });
    }
}
