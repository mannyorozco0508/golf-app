// ============================================================================
// URGENT-065 - THE NEW HOME (Manny, 10:46 AM: look B with look C's green GPS card), IN REAL CHROME.
//
//   1  The green GPS card: "Golf GPS", "Yardages, plays-like and your clubs", where you are -
//      "You're at <course> · 0.0 mi" on a course (URGENT-060's rule), "Nearest: <course> · N mi" away
//      from every course, a plain line with no location - the chips Nassau · Skins · KP by GPS ·
//      Long Drive · + more, and the lime "Start round ›".
//   (URGENT-085, Manny Oct 26: Start round / a chip never jumps to hole 1 - "Where are you playing?" first, with the
//    course you're at in the PLAYING card; Start Round there starts it. Tests 2 and 3 tap Start Round on that screen.)
//   2  Start round on a course: Where are you playing?, then Start Round - the round starts there on the golfer's default tees (Profile's
//      "Back" here - the middle tee would be White) and opens the round; away: Course & Tees with the nearest course picked, nothing
//      started; no location: Course & Tees as before (nothing picked).
//   3  Each chip starts the round the same way with that game's setup open: Nassau / Skins = the + Bet
//      "New bet" sheet with that game picked, KP by GPS = the Weekly Game (KP) sheet, Long Drive = that
//      sheet on its Long Drive hole, + more = Add a game's full list.
//   4  The tiles: Games & Bets (the original setup door), Range, My stats, History. Resume only with an
//      open round. "Join with a code · Trip" at the bottom, the build line under it.
//   5  "HardPan Golf" fits beside the profile spot at 375 / 393 / 430; no sideways scroll.
// The in-memory database of tools/lib/journey.js only - nothing is written anywhere real.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path');
if (!fs.existsSync(path.join(__dirname, 'simple-flow.js'))) { console.log('Consumer tree - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { iapStub } = require('./tools/lib/iap-stub.js');
const { makeCourseData } = require('./helpers/fixtures.js');

const SHOTS = path.join(process.env.HOME || '', 'Desktop', 'claude-code-reports', '065', 'chrome');
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) { }
const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const TEES = { male: [TEE('Back', 6586, 71.1, 123), TEE('White', 6187, 69.0, 118), TEE('Red', 5645, 66.9, 112)], female: [TEE('Red', 5645, 71.4, 120)] };
const DOBSON = [33.3759, -111.8778];      // on Dobson Ranch (urgent016's spot)
const AWAY = [33.4300, -112.5800];        // open desert west of Buckeye: > 0.5 mi from every course
const DB = (extra) => Object.assign({ events: {}, global_courses: { gca_zgkynkan: { name: 'Dobson Ranch Golf Course', data: CD, tees: TEES } }, trips: {}, tournaments: {}, organizers: {} }, extra || {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = (seed) => 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true })
    + "try{ if (!sessionStorage.getItem('u65_seeded')) { sessionStorage.setItem('u65_seeded','1'); var s=" + JSON.stringify(seed || {}) + "; Object.keys(s).forEach(function(k){ localStorage.setItem(k, typeof s[k]==='string'?s[k]:JSON.stringify(s[k])); }); } }catch(e){}";

const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) { } } });
async function home(o) {
    const j = await openJourney({ db: DB(o.db), viewport: o.vp || { width: 393, height: 852 }, webgl: !!o.webgl, preScript: BASE(o.seed) });
    journeys.push(j);
    if (o.at === 'denied') await j.cdp('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'denied' });
    else if (o.at) {
        await j.cdp('Emulation.setGeolocationOverride', { latitude: o.at[0], longitude: o.at[1], accuracy: 10 });
        await j.cdp('Browser.grantPermissions', { permissions: ['geolocation'] });
    }
    await j.goto(fileUrl('home.html'), 2000);
    return j;
}
const ev = (j, x) => j.evaluate(x);
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await ev(j, expr)) return true; } catch (e) { } await sleep(150); } return false; }
const CARD = "JSON.stringify((function(){ var c=document.getElementById('hs-gps'), w=document.getElementById('hs-where'); return { text: c.innerText.replace(/\\n+/g,' | '), where: w.innerText, state: w.getAttribute('data-hs-state'), chips: Array.prototype.map.call(c.querySelectorAll('.hs-chips button'), function(b){ return b.textContent; }), go: c.querySelector('.hs-go').textContent }; })())";
const READY = "(function(){ var w=document.getElementById('hs-where'); return !!w && /^(at|near|none)$/.test(w.getAttribute('data-hs-state')||''); })()";
const SF = "JSON.stringify({ path: location.pathname.split('/').pop(), q: location.search, sf: !!document.getElementById('sf') && getComputedStyle(document.getElementById('sf')).display !== 'none', key: (document.getElementById('course-select')||{}).value || '', text: ((document.getElementById('sf')||{}).innerText||'').slice(0, 400) })";

test('1 card states: on a course "You\'re at", away "Nearest:", no location a plain line', { timeout: 150000 }, async () => {
    const at = await home({ at: DOBSON });
    assert.ok(await until(at, READY, 30000), 'the card worked out where he is');
    const a = JSON.parse(await ev(at, CARD));
    await at.shot(path.join(SHOTS, '1-at-dobson.png'));
    assert.equal(a.state, 'at', JSON.stringify(a));
    assert.match(a.where, /^You’re at Dobson Ranch Golf Course · 0\.\d mi$/);
    assert.match(a.text, /^📍 \| Golf GPS \| Yardages, plays-like and your clubs \| You’re at .* \| PLAYING FOR SOMETHING\? ADD IT ANYTIME \| Nassau/);
    assert.deepEqual(a.chips, ['Nassau', 'Skins', 'KP by GPS', 'Long Drive', '+ more']);
    assert.equal(a.go, 'Start round ›');
    const away = await home({ at: AWAY });
    assert.ok(await until(away, READY, 30000));
    const b = JSON.parse(await ev(away, CARD));
    await away.shot(path.join(SHOTS, '1-away.png'));
    assert.equal(b.state, 'near', JSON.stringify(b));
    assert.match(b.where, /^Nearest: .+ · \d+(\.\d)? mi$/);
    const none = await home({ at: 'denied' });
    assert.ok(await until(none, READY, 30000));
    const c = JSON.parse(await ev(none, CARD));
    assert.equal(c.state, 'none', JSON.stringify(c));
    assert.equal(c.where, 'Pick your course when you start');
});

test('2 Start round: on a course Where are you playing? then Start Round starts it on the default tees; away = Course & Tees with the nearest picked; no location = Course & Tees as before', { timeout: 200000 }, async () => {
    const j = await home({ at: DOBSON, seed: { hardpan_default_tees: 'Back' } });
    assert.ok(await until(j, "document.getElementById('hs-where').getAttribute('data-hs-state') === 'at'", 30000));
    assert.ok(await j.tap('#hs-gps [data-hp-act="sgpsdoor"]'), 'Start round');
    assert.ok(await until(j, "/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-playing]') && document.querySelectorAll('#sf [data-sf-tee]').length > 0", 40000), 'URGENT-085: Where are you playing? first (PLAYING card + TEES): ' + await ev(j, SF));
    await sleep(1500);
    assert.equal(await ev(j, "/admin\\.html$/.test(location.pathname)"), true, 'URGENT-085: no jump to hole 1 - the golfer taps Start Round');
    assert.ok(await ev(j, "(function(){ var b=Array.prototype.filter.call(document.querySelectorAll('#sf button'), function(x){ return x.offsetParent !== null && /Start Round/i.test(x.textContent); })[0]; if (b) b.click(); return !!b; })()"), 'Start Round');
    assert.ok(await until(j, "/index\\.html$/.test(location.pathname) && typeof currentData !== 'undefined' && !!currentData && (currentData.courseData||[]).length === 18", 60000), 'the round is open after Start Round: ' + await ev(j, SF));
    const r = JSON.parse(await ev(j, "JSON.stringify({ course: currentData.courseName, key: currentData.activeCourseKey, tee: currentData.teeRating && currentData.teeRating.teeName, slope: currentData.teeRating && currentData.teeRating.slope, players: (currentData.players||[]).length, side: localStorage.getItem('hardpan_round_side') })"));
    assert.equal(r.key, 'gca_zgkynkan', JSON.stringify(r));
    assert.match(r.tee || '', /\bBack\b/, 'the golfer\'s default tees: ' + JSON.stringify(r));
    assert.equal(r.players, 1);
    assert.equal(r.slope, 123, 'Back\'s slope (the middle tee would be White, 118): ' + JSON.stringify(r));

    const k = await home({ at: AWAY });
    assert.ok(await until(k, "document.getElementById('hs-where').getAttribute('data-hs-state') === 'near'", 30000));
    const nearName = await ev(k, "document.querySelector('#hs-where b').textContent");
    assert.ok(await k.tap('#hs-gps [data-hp-act="sgpsdoor"]'));
    assert.ok(await until(k, "/game=/.test(location.search) && !!document.getElementById('course-select') && !!document.getElementById('course-select').value", 40000), 'Course & Tees, a course picked: ' + await ev(k, SF));
    await sleep(3000);
    const s = JSON.parse(await ev(k, SF));
    assert.equal(s.path, 'admin.html', 'stays on Course & Tees - nothing started: ' + JSON.stringify(s));
    assert.equal(s.sf, true);
    assert.ok(s.text.indexOf(nearName.split(' (')[0]) > -1, 'the nearest course is the picked one: ' + nearName + ' / ' + s.text);

    const n = await home({ at: 'denied' });
    assert.ok(await until(n, "document.getElementById('hs-where').getAttribute('data-hs-state') === 'none'", 30000));
    assert.ok(await n.tap('#hs-gps [data-hp-act="sgpsdoor"]'));
    assert.ok(await until(n, "/game=/.test(location.search) && /Where are you playing/.test((document.getElementById('sf')||{}).innerText||'')", 40000));
    await sleep(2500);
    const s2 = JSON.parse(await ev(n, SF));
    assert.equal(s2.key, '', 'nothing picked with no location: ' + JSON.stringify(s2));
    assert.equal(await ev(n, "sessionStorage.getItem('hardpan_simple_flow') && JSON.parse(sessionStorage.getItem('hardpan_simple_flow')).pick || null"), null);
});

const CHIPS = [
    { id: 'nassau', label: 'Nassau', open: "document.getElementById('hp-bet') && document.getElementById('hp-bet').classList.contains('open') && !!document.querySelector('#hp-bet [data-hb-game=\"nassau\"].on')" },
    { id: 'skins', label: 'Skins', open: "document.getElementById('hp-bet') && document.getElementById('hp-bet').classList.contains('open') && !!document.querySelector('#hp-bet [data-hb-game=\"skins\"].on')" },
    { id: 'kp', label: 'KP by GPS', open: "!!window.HardPanBet && HardPanBet.weeklyOpen() && !document.getElementById('wk-ld')" },
    { id: 'longdrive', label: 'Long Drive', open: "!!window.HardPanBet && HardPanBet.weeklyOpen() && !!document.getElementById('wk-ld')" },
    { id: 'more', label: '+ more', open: "!!document.getElementById('fd-addgame') && getComputedStyle(document.getElementById('fd-addgame')).display !== 'none' && /ALL GAMES/.test(document.getElementById('fd-addgame').innerText)" }
];
for (const c of CHIPS) {
    test('3 chip ' + c.label + ': starts the round (after Where are you playing?, on the course) with its setup open', { timeout: 150000 }, async () => {
        const j = await home({ at: DOBSON, webgl: true });
        assert.ok(await until(j, "document.getElementById('hs-where').getAttribute('data-hs-state') === 'at'", 30000));
        assert.ok(await j.tap('#hs-gps [data-hs-game="' + c.id + '"]'), c.label);
    assert.ok(await until(j, "/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-playing]') && document.querySelectorAll('#sf [data-sf-tee]').length > 0", 40000), 'URGENT-085: Where are you playing? first (PLAYING card + TEES): ' + await ev(j, SF));
    await sleep(1500);
    assert.equal(await ev(j, "/admin\\.html$/.test(location.pathname)"), true, 'URGENT-085: no jump to hole 1 - the golfer taps Start Round');
    assert.ok(await ev(j, "(function(){ var b=Array.prototype.filter.call(document.querySelectorAll('#sf button'), function(x){ return x.offsetParent !== null && /Start Round/i.test(x.textContent); })[0]; if (b) b.click(); return !!b; })()"), 'Start Round');
        assert.ok(await until(j, "/index\\.html$/.test(location.pathname) && typeof currentData !== 'undefined' && !!currentData && (currentData.courseData||[]).length === 18", 60000), 'the round: ' + await ev(j, SF));
        assert.ok(await until(j, c.open, 30000), c.label + '\'s setup is open');
        await sleep(500);
        await j.shot(path.join(SHOTS, '3-chip-' + c.id + '.png'));
        assert.equal(await ev(j, "sessionStorage.getItem('hardpan_home_game')"), null, 'asked once');
    });
}

test('4 tiles open their screens; Resume only with an open round', { timeout: 200000 }, async () => {
    const j = await home({});
    await until(j, "!!document.querySelector('#v-simple.on')", 10000);
    const t = JSON.parse(await ev(j, "JSON.stringify({ tiles: Array.prototype.map.call(document.querySelectorAll('#v-simple .hs-tile'), function(b){ return [b.getAttribute('data-hp-act'), b.innerText.replace(/\\n+/g,' | ')]; }), slim: document.querySelector('#v-simple .hs-slim').innerText.replace(/\\s+/g,' ').trim(), build: (document.getElementById('hs-build')||{}).textContent || '', order: (function(){ var s=document.querySelector('#v-simple .hs-slim'), b=document.getElementById('hs-build'); return !!(s.compareDocumentPosition(b) & 4); })(), prog: document.querySelectorAll('#hs-progress .hs-prog').length })"));
    assert.deepEqual(t.tiles.map((x) => x[0]), ['snew', 'srange', 'sstats', 'shistory']);
    assert.match(t.tiles[0][1], /Games \| group and games/);
    assert.match(t.tiles[1][1], /Range \| dial in your clubs/);
    assert.match(t.tiles[2][1], /My stats \| Strokes Gained/);
    assert.match(t.tiles[3][1], /History \| past rounds/);
    assert.equal(t.slim, 'Join with a code · Trip');
    assert.match(t.build, /^Build: /);
    assert.equal(t.order, true, 'the build line under Join · Trip');
    assert.equal(t.prog, 0, 'no Resume without an open round');
    // History
    assert.ok(await j.tap('[data-hp-act="shistory"]'));
    assert.ok(await until(j, "document.getElementById('v-history').classList.contains('on')", 5000), 'History');
    await ev(j, "document.querySelector('#v-history [data-hp-act=\"shome\"]').click()");
    // My stats
    await ev(j, "(function(){ var S=window.HardPanGpsStats; if (S && S.openMy) { var o=S.openMy; S.openMy=function(){ window.__my=1; return o.apply(this, arguments); }; } return 1; })()");
    assert.ok(await j.tap('[data-hp-act="sstats"]'));
    assert.ok(await until(j, "window.__my === 1", 8000), 'My stats');
    await j.goto(fileUrl('home.html'), 1800);
    // Range
    assert.ok(await j.tap('[data-hp-act="srange"]'));
    assert.ok(await until(j, "!!document.getElementById('hp-range') && document.getElementById('hp-range').style.display !== 'none'", 12000), 'Range');
    await j.goto(fileUrl('home.html'), 1800);
    // Games & Bets
    assert.ok(await j.tap('[data-hp-act="snew"]'));
    assert.ok(await until(j, "/admin\\.html$/.test(location.pathname) && /start=lobby/.test(location.search)", 10000), 'Games & Bets: the original setup door');
    // Join with a code
    await j.goto(fileUrl('home.html'), 1800);
    assert.ok(await j.tap('[data-hp-act="sjoinopen"]'));
    assert.equal(await ev(j, "getComputedStyle(document.getElementById('hs-join')).display !== 'none'"), true, 'Join with a code opens the code box');

    // An open round: Resume.
    const players = [{ id: 1, name: 'Me', hcp: '' }];
    const r = await home({ db: { events: { RES065: { courseName: 'Dobson Ranch Golf Course', courseData: CD, players, scores: { p1_h1: 4 } } } }, seed: { hardpan_last_round: { code: 'RES065', at: Date.now(), course: 'Dobson Ranch Golf Course' } } });
    assert.ok(await until(r, "document.querySelectorAll('#hs-progress .hs-prog').length === 1", 12000), 'Resume with a round open');
    assert.match(await ev(r, "document.querySelector('#hs-progress .hs-prog').innerText.replace(/\\n+/g,' | ')"), /IN PROGRESS \| Dobson Ranch Golf Course · Thru 1 \| Resume ›/);
    await r.shot(path.join(SHOTS, '4-resume.png'));
});

const FIT = "JSON.stringify((function(){ var h=document.getElementById('hs-hello'), b=document.getElementById('hpa-spot'); var hr=h.getBoundingClientRect(), br=b.getBoundingClientRect(), lh=parseFloat(getComputedStyle(h).lineHeight)||parseFloat(getComputedStyle(h).fontSize)*1.2; var wide=Array.prototype.filter.call(document.querySelectorAll('#v-simple *'), function(e){ var r=e.getBoundingClientRect(); return r.width>0 && (r.right>innerWidth+0.5 || r.left< -0.5); }).map(function(e){ return e.className || e.tagName; }); return { text:h.textContent.trim(), gap:Math.round(br.left-hr.right), lines:Math.round(hr.height/lh), clipped:h.scrollWidth>h.clientWidth+1, spotIn:br.right<=innerWidth && br.left>=0, sideScroll:document.documentElement.scrollWidth>innerWidth, wide: wide }; })())";
for (const vp of [{ width: 375, height: 667, tag: 'SE-375' }, { width: 393, height: 852, tag: '17-393' }, { width: 430, height: 932, tag: 'ProMax-430' }]) {
    test('5 ' + vp.tag + ': "HardPan Golf" fits beside the profile spot; nothing wider than the screen', { timeout: 90000 }, async () => {
        const j = await home({ vp, at: DOBSON });
        await until(j, READY, 30000);
        await sleep(400);
        const f = JSON.parse(await ev(j, FIT));
        await j.shot(path.join(SHOTS, '5-' + vp.tag + '.png'));
        assert.equal(f.text, 'HardPan Golf');
        assert.ok(f.gap >= 8, 'gap ' + JSON.stringify(f));
        assert.equal(f.lines, 1, JSON.stringify(f));
        assert.equal(f.clipped, false);
        assert.equal(f.spotIn, true);
        assert.equal(f.sideScroll, false, 'sideways scroll: ' + JSON.stringify(f));
        assert.deepEqual(f.wide, [], 'nothing past the screen edge');
    });
}
