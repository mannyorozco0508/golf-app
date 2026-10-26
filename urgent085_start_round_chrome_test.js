// ============================================================================
// URGENT-085 - "START ROUND" JUMPS STRAIGHT INTO HOLE 1 (Manny, Oct 26 1:28 PM, the 077 logo build) - IN REAL CHROME.
// His case: Home at The Arizona Country Club ("You're at ... · 0.2 mi"), IN PROGRESS "The Arizona Country Club ·
// Not started · Resume"; the GPS card's "Start round ›" skipped "Where are you playing?" and landed on hole 1.
//   1  Manny's case: a round in progress -> Start round asks ONCE "Resume your round at The Arizona Country Club,
//      or start a new round?" [Resume] [New round]. New round -> "Where are you playing?" with the PLAYING card
//      (You're here), TEES and Start Round - and it stays there (no round started, no hole 1).
//   2  Resume -> exactly Home's Resume (the in-progress round's own page, the same code; nothing new started).
//   3  No round in progress, at a course: "Where are you playing?" with the PLAYING card + TEES + Start Round,
//      and it stays there; Start Round there starts the round on the picked course (as before).
//   4  A game chip at a course (no round in progress): the same screen first; its game still opens once the round
//      is up (Start Round).
//   5  Away from every course / no location: Course & Tees as before (nearest picked / nothing picked).
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

const SHOTS = path.join(process.env.HOME || '', 'Desktop', 'claude-code-reports', '085', 'chrome');
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) { }
const CD = makeCourseData(18);
const TEE = (name, y, r, sl) => ({ name, rating: r, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
const AZ_ID = '012141520640060450343', AZ_KEY = 'gapi_' + AZ_ID;
const AZ_NAME = 'The Arizona Country Club (The Arizona)';
const AZ_REC = { name: AZ_NAME, data: CD, tees: { male: [TEE('Blue', 6720, 72.4, 131), TEE('White', 6397, 70.9, 127), TEE('Green', 5930, 68.8, 120)] },
    location: { city: 'Phoenix', state: 'AZ', latitude: 33.4806, longitude: -111.9599 }, source: { provider: 'golfapi', providerCourseId: AZ_ID } };
const hole = (i) => ({ t: { b: [33.4814 + i * 0.0004, -111.9580 + i * 0.0003] }, g: { c: [33.4836 + i * 0.0004, -111.9537 + i * 0.0003], f: [33.4835 + i * 0.0004, -111.9538 + i * 0.0003], b: [33.4837 + i * 0.0004, -111.9536 + i * 0.0003] } });
const AZ_GPS = { id: AZ_ID, club: 'The Arizona Country Club', course: 'The Arizona', city: 'Phoenix', state: 'AZ', lat: 33.4806, lng: -111.9599, holes: 18, h: {} };
for (let i = 1; i <= 18; i++) AZ_GPS.h[i] = hole(i - 1);
const AT_AZ = [33.4814, -111.9580];       // on hole 1's tee of the (synthetic) Arizona CC points
const AWAY = [33.4300, -112.5800];         // no course within miles
const OLD = 'T85AZC';                      // the IN PROGRESS round ("Not started")
const PLAYERS = [{ id: 1, name: 'Test Golfer', hcp: '' }];
const OLD_ROUND = { courseName: AZ_NAME, activeCourseKey: AZ_KEY, courseData: CD, players: PLAYERS };
const DB = (extra) => Object.assign({ events: {}, global_courses: { [AZ_KEY]: AZ_REC }, gps_courses: { [AZ_ID]: AZ_GPS }, gps_links: {}, trips: {}, tournaments: {}, organizers: {} }, extra || {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = (seed) => 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true })
    + "try{ if (!sessionStorage.getItem('u85_seeded')) { sessionStorage.setItem('u85_seeded','1'); var s=" + JSON.stringify(seed || {}) + "; Object.keys(s).forEach(function(k){ localStorage.setItem(k, typeof s[k]==='string'?s[k]:JSON.stringify(s[k])); }); } }catch(e){}";
const INPROG = () => ({ db: { events: { [OLD]: OLD_ROUND } }, seed: { hardpan_last_round: { code: OLD, at: Date.now(), course: AZ_NAME } } });

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
// Where the phone is: the page, the round code in the URL, the course screen and its PLAYING card / tees / Start Round.
const WHERE = "JSON.stringify((function(){ var sf=document.getElementById('sf'), on=!!sf && getComputedStyle(sf).display !== 'none', card=document.querySelector('#sf [data-sf-playing]');"
    + " var start=Array.prototype.filter.call(document.querySelectorAll('#sf [data-sf=start], #sf [data-sf=gpsgo], #sf .sf-cta'), function(b){ return b.offsetParent !== null && /Start Round|Start GPS|Start round/i.test(b.textContent); }).map(function(b){ return b.textContent.trim(); });"
    + " return { path: location.pathname.split('/').pop(), q: location.search, game: (location.search.match(/game=([A-Z0-9]+)/)||[])[1] || '', sf: on, title: on ? ((sf.querySelector('h1,.sf-title,.sf-top')||{}).textContent||'').trim() : '',"
    + "  where: on && /Where are you playing\\?/.test(sf.innerText), card: card ? { text: card.innerText.replace(/\\n+/g,' | '), here: card.getAttribute('data-sf-playing-here') === '1' } : null,"
    + "  tees: on ? sf.querySelectorAll('[data-sf-tee]').length : 0, teesH: on && /\\bTEES\\b/.test(sf.innerText), start: start,"
    + "  map: typeof currentData !== 'undefined' && !!currentData && /index\\.html$/.test(location.pathname), ask: (function(){ var a=document.getElementById('hs-ask85'); return a && a.style.display !== 'none' ? a.innerText.replace(/\\n+/g,' | ') : null; })(),"
    + "  key: (document.getElementById('course-select')||{}).value || '' }; })())";
const ASK_UP = "(function(){ var a=document.getElementById('hs-ask85'); return !!a && a.style.display !== 'none'; })()";
const ON_WHERE = "/game=/.test(location.search) && !!document.querySelector('#sf [data-sf-playing]') && document.querySelectorAll('#sf [data-sf-tee]').length > 0";
const IN_ROUND = "/index\\.html$/.test(location.pathname) && typeof currentData !== 'undefined' && !!currentData && (currentData.courseData||[]).length === 18";

async function stays(j, ms) {
    // No jump: for `ms` the phone stays on the course screen (never the round page).
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        const w = JSON.parse(await ev(j, WHERE).catch(() => '{}'));
        if (w.path === 'index.html' || w.map) return w;
        await sleep(300);
    }
    return null;
}

test('1 Manny\'s case: in progress at Arizona CC -> Start round asks once (Resume / New round); New round -> Where are you playing? and it stays there', { timeout: 200000 }, async () => {
    const j = await home(Object.assign({ at: AT_AZ }, INPROG()));
    assert.ok(await until(j, "document.getElementById('hs-where').getAttribute('data-hs-state') === 'at'", 30000), 'the card says You\'re at');
    assert.match(await ev(j, "document.getElementById('hs-where').innerText"), /^You’re at The Arizona Country Club · 0\.\d mi$/);
    assert.ok(await until(j, "document.querySelectorAll('#hs-progress .hs-prog').length === 1", 12000), 'IN PROGRESS is on Home');
    assert.match(await ev(j, "document.querySelector('#hs-progress .hs-prog').innerText.replace(/\\n+/g,' | ')"), /IN PROGRESS \| The Arizona Country Club · Not started \| Resume ›/);
    await j.shot(path.join(SHOTS, '1-home.png'));
    assert.ok(await j.tap('#hs-gps [data-hp-act="sgpsdoor"]'), 'Start round');
    const asked = await until(j, ASK_UP, 4000);
    const w0 = JSON.parse(await ev(j, WHERE).catch(() => '{}'));
    assert.ok(asked, 'the Resume-or-new ask (instead: ' + JSON.stringify(await (async () => { await sleep(8000); return ev(j, WHERE).catch(() => 'navigated'); })()) + ')');
    await j.shot(path.join(SHOTS, '1-ask.png'));
    assert.equal(w0.path, 'home.html', 'still on Home while asking');
    assert.match(w0.ask, /^Resume your round at The Arizona Country Club, or start a new round\?/);
    const btns = JSON.parse(await ev(j, "JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#hs-ask85 button'), function(b){ return b.textContent.trim(); }))"));
    assert.deepEqual(btns, ['Resume', 'New round']);
    assert.ok(await j.tap('#hs-ask85 [data-ask85="new"]'), 'New round');
    assert.ok(await until(j, ON_WHERE, 40000), 'Where are you playing? with the PLAYING card + TEES: ' + await ev(j, WHERE).catch(() => ''));
    const jumped = await stays(j, 9000);
    assert.equal(jumped, null, 'never jumps to hole 1 by itself: ' + JSON.stringify(jumped));
    const w = JSON.parse(await ev(j, WHERE));
    await j.shot(path.join(SHOTS, '1-new-round-where.png'));
    assert.equal(w.where, true, JSON.stringify(w));
    assert.equal(w.card.here, true, 'PLAYING card says You\'re here: ' + JSON.stringify(w));
    assert.match(w.card.text, /PLAYING/);
    assert.match(w.card.text, /The Arizona Country Club/);
    assert.ok(w.tees >= 3, 'TEES: ' + JSON.stringify(w));
    assert.ok(w.start.some((s) => /Start Round/i.test(s)), 'Start Round: ' + JSON.stringify(w));
    assert.equal(w.key, AZ_KEY);
    assert.notEqual(w.game, OLD, 'a NEW round\'s screen, not the old round');
    // Asked once: nothing else pops up on the way (the 028 "End your ... round" ask is for a round with scores).
    assert.equal(await ev(j, "!!document.getElementById('sf-ask')"), false);
});

test('2 Resume: exactly Home\'s Resume - the in-progress round, the same code, nothing new started', { timeout: 150000 }, async () => {
    const j = await home(Object.assign({ at: AT_AZ }, INPROG()));
    assert.ok(await until(j, "document.getElementById('hs-where').getAttribute('data-hs-state') === 'at'", 30000));
    assert.ok(await until(j, "document.querySelectorAll('#hs-progress .hs-prog').length === 1", 12000));
    const href = await ev(j, "(function(){ var b=document.querySelector('#hs-progress .hs-prog'); var h=null; var o=window.location; return b.getAttribute('data-hp-open'); })()");
    assert.equal(href, OLD);
    assert.ok(await j.tap('#hs-gps [data-hp-act="sgpsdoor"]'));
    assert.ok(await until(j, ASK_UP, 4000), 'the ask');
    assert.ok(await j.tap('#hs-ask85 [data-ask85="resume"]'), 'Resume');
    assert.ok(await until(j, "/index\\.html$/.test(location.pathname)", 20000), 'the round page');
    const q = await ev(j, 'location.search');
    assert.match(q, new RegExp('game=' + OLD), 'the in-progress round: ' + q);
    const ev2 = JSON.parse(await ev(j, "JSON.stringify(Object.keys((window.__journeyDb && window.__journeyDb.events) || {}))").catch(() => '[]'));
    assert.ok(!ev2.length || ev2.every((c) => c === OLD), 'no new round: ' + JSON.stringify(ev2));
});

test('3 No round in progress, at a course: Where are you playing? (PLAYING You\'re here + TEES + Start Round) and it stays; Start Round starts it there', { timeout: 200000 }, async () => {
    const j = await home({ at: AT_AZ });
    assert.ok(await until(j, "document.getElementById('hs-where').getAttribute('data-hs-state') === 'at'", 30000));
    assert.equal(await ev(j, "document.querySelectorAll('#hs-progress .hs-prog').length"), 0);
    assert.ok(await j.tap('#hs-gps [data-hp-act="sgpsdoor"]'));
    await sleep(600);
    assert.equal(await ev(j, ASK_UP), false, 'no ask without a round in progress');
    assert.ok(await until(j, ON_WHERE, 40000), 'Where are you playing?: ' + await ev(j, WHERE).catch(() => ''));
    const jumped = await stays(j, 9000);
    assert.equal(jumped, null, 'never jumps to hole 1 by itself: ' + JSON.stringify(jumped));
    const w = JSON.parse(await ev(j, WHERE));
    await j.shot(path.join(SHOTS, '3-where.png'));
    assert.equal(w.where, true);
    assert.equal(w.card.here, true, JSON.stringify(w));
    assert.ok(w.tees >= 3);
    assert.ok(w.start.some((s) => /Start Round/i.test(s)), JSON.stringify(w));
    // Start Round: the round on the picked course (today's Start Round, unchanged).
    assert.ok(await ev(j, "(function(){ var b=Array.prototype.filter.call(document.querySelectorAll('#sf button'), function(x){ return x.offsetParent !== null && /Start Round/i.test(x.textContent); })[0]; if (b) b.click(); return !!b; })()"), 'tap Start Round');
    assert.ok(await until(j, IN_ROUND, 60000), 'the round is open: ' + await ev(j, WHERE).catch(() => ''));
    assert.equal(await ev(j, 'currentData.activeCourseKey'), AZ_KEY);
});

test('4 a game chip at a course: Where are you playing? first (no jump); its game opens once the round is up', { timeout: 200000 }, async () => {
    const j = await home({ at: AT_AZ, webgl: true });
    assert.ok(await until(j, "document.getElementById('hs-where').getAttribute('data-hs-state') === 'at'", 30000));
    assert.ok(await j.tap('#hs-gps [data-hs-game="more"]'), '+ more');
    assert.ok(await until(j, ON_WHERE, 40000), 'Where are you playing?: ' + await ev(j, WHERE).catch(() => ''));
    const jumped = await stays(j, 8000);
    assert.equal(jumped, null, 'no jump: ' + JSON.stringify(jumped));
    assert.match(await ev(j, "sessionStorage.getItem('hardpan_home_game') || ''"), /"id":"more"/, 'the game waits for the round');
    assert.ok(await ev(j, "(function(){ var b=Array.prototype.filter.call(document.querySelectorAll('#sf button'), function(x){ return x.offsetParent !== null && /Start Round/i.test(x.textContent); })[0]; if (b) b.click(); return !!b; })()"));
    assert.ok(await until(j, IN_ROUND, 60000), 'the round');
    assert.ok(await until(j, "!!document.getElementById('fd-addgame') && getComputedStyle(document.getElementById('fd-addgame')).display !== 'none' && /ALL GAMES/.test(document.getElementById('fd-addgame').innerText)", 30000), '+ more: Add a game\'s list');
});

test('5 away / no location: Course & Tees as before (nearest picked / nothing picked), no ask', { timeout: 200000 }, async () => {
    const k = await home({ at: AWAY });
    assert.ok(await until(k, "document.getElementById('hs-where').getAttribute('data-hs-state') === 'near'", 30000));
    assert.ok(await k.tap('#hs-gps [data-hp-act="sgpsdoor"]'));
    assert.ok(await until(k, "/game=/.test(location.search) && !!document.getElementById('course-select') && !!document.getElementById('course-select').value", 40000), 'Course & Tees, a course picked');
    assert.equal(await stays(k, 4000), null);
    const n = await home({ at: 'denied' });
    assert.ok(await until(n, "document.getElementById('hs-where').getAttribute('data-hs-state') === 'none'", 30000));
    assert.ok(await n.tap('#hs-gps [data-hp-act="sgpsdoor"]'));
    assert.ok(await until(n, "/game=/.test(location.search) && /Where are you playing/.test((document.getElementById('sf')||{}).innerText||'')", 40000));
    await sleep(2000);
    assert.equal(JSON.parse(await ev(n, WHERE)).key, '', 'nothing picked with no location');
});

test('6 asked ONCE: a round WITH scores at another course -> New round -> Start Round starts the new round with no second ask; the old round keeps its scores', { timeout: 200000 }, async () => {
    const OTHER = 'T85PAP', other = { courseName: 'Papago Golf Club', activeCourseKey: 'az_papago', courseData: CD, players: PLAYERS, scores: { p1_h1: 5, p1_h2: 4 } };
    const j = await home({ at: AT_AZ, db: { events: { [OTHER]: other } }, seed: { hardpan_last_round: { code: OTHER, at: Date.now(), course: 'Papago Golf Club' } } });
    assert.ok(await until(j, "document.getElementById('hs-where').getAttribute('data-hs-state') === 'at'", 30000));
    assert.ok(await until(j, "document.querySelectorAll('#hs-progress .hs-prog').length === 1", 12000), 'IN PROGRESS Papago');
    assert.ok(await j.tap('#hs-gps [data-hp-act="sgpsdoor"]'));
    assert.ok(await until(j, ASK_UP, 4000), 'the ask');
    assert.match(JSON.parse(await ev(j, WHERE)).ask, /^Resume your round at Papago Golf Club, or start a new round\?/);
    assert.ok(await j.tap('#hs-ask85 [data-ask85="new"]'));
    assert.ok(await until(j, ON_WHERE, 40000), 'Where are you playing?');
    assert.equal(await stays(j, 5000), null, 'no jump');
    assert.ok(await ev(j, "(function(){ var b=Array.prototype.filter.call(document.querySelectorAll('#sf button'), function(x){ return x.offsetParent !== null && /Start Round/i.test(x.textContent); })[0]; if (b) b.click(); return !!b; })()"));
    let asked2 = false; const t0 = Date.now();
    while (Date.now() - t0 < 30000) { if (await ev(j, "!!document.getElementById('sf-ask')").catch(() => false)) { asked2 = true; break; } if (await ev(j, IN_ROUND).catch(() => false)) break; await sleep(200); }
    assert.equal(asked2, false, 'no second ask ("End your Papago round ...")');
    assert.ok(await until(j, IN_ROUND, 30000), 'the new round');
    assert.equal(await ev(j, 'currentData.activeCourseKey'), AZ_KEY);
    assert.notEqual(await ev(j, "(location.search.match(/game=([A-Z0-9]+)/)||[])[1]"), OTHER);
    const db = await j.harvest();
    assert.ok(db.events[OTHER] && Object.keys(db.events[OTHER].scores || {}).length === 2, 'the Papago round keeps its scores (History)');
});
