#!/usr/bin/env node
// ============================================================================
// 013 SETUP-FLOW SIMULATIONS, GROUP 2: GAMES FIRST + JOIN BY CODE
//
//   node tools/sim/setup-games-first.js            (all paths, ~6 min)
//   node tools/sim/setup-games-first.js B C-code   (only paths whose name starts so)
//   SIM_SHOTS=/some/dir node tools/sim/setup-games-first.js
//
// One headless Chrome at a time, the journey stand-in database (writes carry from page
// to page; nothing reaches the live Firebase - the REST host and Cloud Functions are
// blocked too), iPhone 15 size (393x852), the app's front door on, a GPS subscriber.
// Every step is a REAL tap at the element's centre (CDP Input.dispatchMouseEvent) or
// typing into a real field; nothing the page defines is called. Test rounds only:
// the round the B path creates gets a fresh code from the app; Dobson Ranch is a
// stand-in course record under the key the bundle uses (gca_zgkynkan).
//
//   B-weekly-new        a brand-new phone: Home > Games > + Start a round > Stroke Play >
//                       Dobson Ranch > paste 20 golfers > Flights A/B (10/10) > Weekly
//                       Game (KP on the par 3s) + Nassau + Skins > Review > Save & Start >
//                       START SCORING > Keep score for Group 1 > GPS (layout D) > Who are
//                       you? Manny > Enter score > Par > Save. The saved round is checked
//                       (players, flights, pool, Nassau, skins, course, start hole, groups).
//   B-weekly-returning  the same phone the next week (last round 20 h old): Main > Games >
//                       Your round / + Start a round > the same setup again (nothing
//                       carried over or doubled) > GPS switched to layout C (Tools >
//                       Screen layout > Bottom panel) > Enter score > Save.
//   C-*                 a golfer's phone joins the B round: the code from Games-first, the
//                       code / a pasted link from GPS-first (the GPS | Games switch),
//                       "CODE 2", CODE-G-KEY; each as a scorekeeper: the group, the name
//                       (Who are you?), the first score on the GPS screen. A returning
//                       golfer (Resume). Wrong code / wrong group / wrong key are said on
//                       Home; a dead round link says so within ~10 s (never a frozen
//                       "Connecting...").
//
// Prints a JSON summary: per path taps / screens to the first score, the findings
// (ranked, with the screenshot), and the checks. Exit 1 when a BLOCKER or HIGH check
// fails (a regression); known findings that are not fixed are listed, not failed.
// ============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const HERE = path.join(__dirname, '..', '..');
const { openJourney, fileUrl } = require(path.join(HERE, 'tools/lib/journey.js'));
const { iapStub } = require(path.join(HERE, 'tools/lib/iap-stub.js'));

const SHOTS = process.env.SIM_SHOTS || '/Users/manny/Desktop/claude-code-reports/013';
const ONLY = process.argv.slice(2);
const VIEW = { width: 393, height: 852 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

// Dobson Ranch's first tee (the bundle's OSM tee) - where every phone stands.
const TEE = [33.37585, -111.877757];
const GEO = "window.__geo = 0; try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { window.__geo++; setTimeout(function () { ok({ coords: { latitude: " + TEE[0] + ", longitude: " + TEE[1] + ", accuracy: 5 }, timestamp: Date.now() }); }, 20); return 1; }, getCurrentPosition: function (ok) { window.__geo++; setTimeout(function () { ok({ coords: { latitude: " + TEE[0] + ", longitude: " + TEE[1] + ", accuracy: 5 }, timestamp: Date.now() }); }, 10); }, clearWatch: function () {} } }); } catch (e) {} try { var q0 = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = function (d) { return d && d.name === 'geolocation' ? Promise.resolve({ state: 'granted' }) : q0(d); }; } catch (e) {}";
// Page errors, unhandled rejections AND console.error - a console error is a finding.
const ERR = "window.__e = []; addEventListener('error', function (e) { window.__e.push(String(e.message) + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno); }); addEventListener('unhandledrejection', function (e) { window.__e.push('rej ' + String(e.reason && e.reason.message || e.reason)); }); (function () { var ce = console.error; console.error = function () { try { window.__e.push('console.error ' + Array.prototype.map.call(arguments, function (a) { return String(a && a.message || a); }).join(' ').slice(0, 200)); } catch (x) {} return ce.apply(console, arguments); }; })();";
const PRE = 'window.__hardpanDoors = true; window.__freshPhone = true;' + ERR + GEO + iapStub({ active: true });
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: [4, 4, 3, 5, 4, 4, 3, 5, 4][i % 9], hcpIndex: [1, 11, 15, 5, 9, 3, 17, 7, 13, 2, 12, 16, 6, 10, 4, 18, 8, 14][i] }));
const PAR3 = CD.filter((h) => h.par === 3).map((h) => h.hole);
const SEED = () => ({ events: {}, trips: {}, organizers: {}, tournaments: {},
    global_courses: { gca_zgkynkan: { name: 'Dobson Ranch Golf Course', data: CD, location: { city: 'Mesa', state: 'AZ' } } } });
const NAMES = ['Manny Orozco', 'Ann Able', 'Ben Bravo', 'Cal Cole', 'Dee Dunn', 'Eli Echo', 'Fay Fox', 'Gus Gold', 'Hal Hart', 'Ivy Ives',
    'Jon Jett', 'Kim Kole', 'Lou Lane', 'Moe Mars', 'Ned Nash', 'Oli Oates', 'Pat Page', 'Quin Quay', 'Ron Ross', 'Sue Sato'];
const KEY4 = 'K4SIM9';   // a scorekeeper key the organizer made for Group 4 (its hash is what the round stores)

const out = { paths: {}, findings: [], checks: [] };
// sev: BLOCKER | HIGH | MEDIUM | LOW. A failed check is a regression; exit 1 on BLOCKER/HIGH.
function check(pathName, sev, ok, what, shot) {
    out.checks.push({ path: pathName, sev, ok: !!ok, what, shot: shot || null });
    if (!ok) console.error('  FAIL [' + sev + '] ' + pathName + ': ' + what);
    return !!ok;
}

async function phone(opts) {
    const j = await openJourney({ db: opts.db, auth: opts.uid ? { uid: opts.uid, isAnonymous: true } : undefined, preScript: PRE + (opts.pre || ''), webgl: true, viewport: VIEW });
    // NOTHING LEAVES FOR THE LIVE PROJECT: the firebase bundles (the journey's own), the
    // course index's REST probe and the Cloud Functions.
    await j.cdp('Network.setBlockedURLs', { urls: ['*firebase-app-compat.js', '*firebase-database-compat.js', '*firebase-auth-compat.js', '*firebaseio.com*', '*cloudfunctions.net*', '*googleapis.com*'] });
    return j;
}

// A driven path: real taps, typing, viewport screenshots, tap and screen counts.
function driver(j, name) {
    const dir = path.join(SHOTS, name);
    // this path's shots only: last run's are cleared, so a numbered step is this run's step
    try { for (const f of fs.readdirSync(dir)) if (/^\d\d-.*\.png$/.test(f)) fs.rmSync(path.join(dir, f)); } catch (e) { /* first run */ }
    fs.mkdirSync(dir, { recursive: true });
    const P = { taps: 0, typed: 0, screens: [], shots: [], errors: [] };
    out.paths[name] = P;
    let n = 0;
    const visible = "function vis(e){ if (!e) return false; var r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false; for (var x = e; x && x !== document.body; x = x.parentElement) { var c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden') return false; } return true; }";
    const find = (sel, text, nth, act) => `(function(){ ${visible} var re = ${text ? 'new RegExp(' + JSON.stringify(text) + ')' : 'null'}; var el = Array.prototype.filter.call(document.querySelectorAll(${JSON.stringify(sel)}), function (e) { return vis(e) && (!re || re.test((e.innerText || e.value || '').trim())); })[${nth || 0}]; if (!el) return null; ${act} })()`;
    const api = {
        name, dir, P,
        async eval(x) { return j.evaluate(x); },
        async has(sel, text) { return !!(await j.evaluate(find(sel, text, 0, 'return 1;'))); },
        async tap(sel, text, o) {
            o = o || {};
            const ok = await j.evaluate(find(sel, text, o.nth, "el.scrollIntoView({ block: 'center' }); return 1;"));
            if (!ok) { P.errors.push('no element ' + sel + (text ? ' /' + text + '/' : '')); return false; }
            await sleep(150);
            const pt = await j.evaluate(find(sel, text, o.nth, 'var r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };'));
            for (const type of ['mousePressed', 'mouseReleased']) await j.cdp('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
            P.taps++;
            await sleep(o.ms || 900);
            return true;
        },
        // A tap at a point of the screen (CSS px), e.g. the map above a sheet to close it.
        async tapAt(x, y, ms) {
            for (const type of ['mousePressed', 'mouseReleased']) await j.cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
            P.taps++;
            await sleep(ms || 700);
        },
        // A value typed / pasted / picked into a field (one action, like a paste or a picker).
        async type(sel, value, o) {
            o = o || {};
            const r = await j.evaluate(`(function(){ var el = document.querySelectorAll(${JSON.stringify(sel)})[${o.nth || 0}]; if (!el) return 'no el'; el.focus(); var p = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : (el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype); Object.getOwnPropertyDescriptor(p, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 'ok'; })()`);
            if (r !== 'ok') P.errors.push('no field ' + sel);
            P.typed++;
            if (o.countTap !== false && /select/i.test(o.kind || '')) P.taps++;
            await sleep(o.ms || 400);
            return r === 'ok';
        },
        async shot(label) {
            n++;
            const file = path.join(dir, String(n).padStart(2, '0') + '-' + label + '.png');
            try { const s = await j.cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(s.result.data, 'base64')); } catch (e) { /* a shot is evidence, not a step */ }
            P.shots.push(file);
            return file;
        },
        // A NEW SCREEN the golfer is looking at (counted), with its shot.
        async screen(label) { P.screens.push(label); return api.shot(label); },
        async url() { return j.evaluate('document.URL.split("/").pop()'); },
        async errs() { return JSON.parse(await j.evaluate('JSON.stringify(window.__e || [])')); },
        async waitFor(expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 15000)) { try { if (await j.evaluate(expr)) return true; } catch (e) { /* navigating */ } await sleep(300); } return false; }
    };
    return api;
}
const errsOK = async (d, tag) => { const e = (await d.errs()).filter((m) => !/reading 'ts'/.test(m)); d.P.errors.push(...e.map((m) => tag + ': ' + m)); return e; };

// ---------------------------------------------------------------- B: Games first
async function setupWeeklyGame(d, j, tag, returning) {
    // Home (the app opens index.html with no round -> home.html Main).
    await j.goto(fileUrl('index.html', ''), 3500);
    check(tag, 'BLOCKER', /^home\.html/.test(await d.url()), 'launch opens Home', await d.screen('home'));
    if (returning) {
        const main = JSON.parse(await d.eval("JSON.stringify({ last: !!document.querySelector('#v-main .hp-door.games.last'), resume: (document.getElementById('hp-resume') || {}).innerText || '' })"));
        d.P.returningMain = main;
        check(tag, 'LOW', main.last, 'Main remembers Games as the last door');
    }
    await d.tap('#v-main .hp-door.games');
    check(tag, 'BLOCKER', await d.has('#v-games [data-hp-act=start]'), 'Games-1 has + Start a round', await d.screen('games'));
    if (returning) {
        const g = JSON.parse(await d.eval("JSON.stringify({ today: (document.getElementById('hp-today') || {}).innerText || '' })"));
        d.P.returningGames = g.today.replace(/\s+/g, ' ').slice(0, 160);
    }
    await d.tap('#v-games [data-hp-act=start]', null, { ms: 5000 });
    const u1 = await d.url();
    const code = (/game=([A-Z0-9]+)/.exec(u1) || [])[1];
    check(tag, 'BLOCKER', /^admin\.html\?game=[A-Z0-9]+&eventType=quick$/.test(u1), 'Start a round opens Round Setup with a fresh code: ' + u1, await d.screen('step1-games'));
    const s1 = JSON.parse(await d.eval("JSON.stringify({ stroke: !!(document.getElementById('fmt-card-stroke') || {}).classList && document.getElementById('fmt-card-stroke').classList.contains('selected'), salw: !!(document.getElementById('same-as-last-week') && document.getElementById('same-as-last-week').offsetParent) })"));
    d.P.step1 = s1;
    check(tag, 'HIGH', s1.stroke, 'Step 1 (Games) opens with Stroke Play picked');
    if (returning) d.P.sameAsLastWeekReachable = s1.salw;
    await d.tap('button', '^Next: Course');
    check(tag, 'HIGH', await d.has('#course-search-input'), 'Step 2 is the course', await d.screen('step2-course'));
    await d.tap('#course-search-input');
    await d.type('#course-search-input', 'dobson', { ms: 1500 });
    await d.shot('course-search');
    await d.tap('.custom-select-option', 'Dobson Ranch', { ms: 2000 });
    const crs = await d.eval("(document.getElementById('course-search-input') || {}).value || ''");
    check(tag, 'BLOCKER', /Dobson Ranch/.test(crs), 'Dobson Ranch picked: ' + crs, await d.shot('course-picked'));
    await d.tap('#wizard-next-1', null, { ms: 1500 });
    check(tag, 'HIGH', await d.has('#paste-players-textarea, .p-name-input'), 'Step 3 is Players', await d.screen('step3-players'));
    await d.tap('button', 'Paste Player List');
    await d.type('#paste-players-textarea', NAMES.map((x, i) => x + ' ' + (3 + i)).join('\n'));
    await d.shot('paste-typed');
    await d.tap('#paste-players-commit-btn', null, { ms: 1500 });
    const rows = await d.eval("Array.prototype.filter.call(document.querySelectorAll('.p-name-input'), function (i) { return i.value.trim(); }).length");
    const blanks = await d.eval("Array.prototype.filter.call(document.querySelectorAll('.p-name-input'), function (i) { return !i.value.trim(); }).length");
    check(tag, 'BLOCKER', rows === 20 && blanks === 0, 'the paste made 20 golfers (no blank row, nothing doubled): ' + rows + ' named, ' + blanks + ' blank', await d.shot('players-added'));
    await d.tap('#flights-label-on');
    await d.shot('flights-on');
    const allA = await d.eval("Array.prototype.map.call(document.querySelectorAll('.p-flight-input'), function (b) { return b.innerText.trim(); }).join('')");
    d.P.flightsDefault = allA;
    for (let i = 10; i < 20; i++) await d.tap('.p-flight-input', null, { nth: i, ms: 250 });
    const split = await d.eval("Array.prototype.map.call(document.querySelectorAll('.p-flight-input'), function (b) { return b.innerText.trim(); }).join('')");
    check(tag, 'HIGH', split === 'A'.repeat(10) + 'B'.repeat(10), 'flights A 10 / B 10: ' + split, await d.shot('flights-split'));
    await d.tap('#wizard-next-5', null, { ms: 1500 });
    check(tag, 'HIGH', await d.has('#mp-enabled'), 'Step 4 is Money (Weekly Game there)', await d.screen('step4-money'));
    await d.tap('#mp-enabled', null, { ms: 1000 });
    const pool = JSON.parse(await d.eval("JSON.stringify({ buyin: document.getElementById('mp-buyin').value, kp: document.getElementById('mp-kp-holes').value, kpAmt: document.getElementById('mp-kp-amount').value })"));
    d.P.weeklyDefaults = pool;
    check(tag, 'HIGH', pool.kp.replace(/\s/g, '') === PAR3.join(','), 'KP holes default to the course par 3s (' + PAR3.join(',') + '): ' + pool.kp, await d.shot('weekly-on'));
    await d.tap('#setup-nassau-enabled', null, { ms: 1200 });
    const ids = JSON.parse(await d.eval("JSON.stringify(Array.prototype.slice.call(document.getElementById('setup-nassau-p1').options, 1, 3).map(function (o) { return o.value; }))"));
    await d.type('#setup-nassau-p1', ids[0], { kind: 'select' });
    await d.type('#setup-nassau-p2', ids[1], { kind: 'select' });
    await d.shot('nassau-on');
    await d.eval("(function(){ var s = Array.prototype.filter.call(document.querySelectorAll('input[type=checkbox]'), function (i) { return /toggleStackedGame\\('skins'/.test(i.getAttribute('onchange') || ''); }); s.forEach(function (i) { i.setAttribute('data-sim', 'skins'); }); return s.length; })()");
    await d.tap('[data-sim=skins]', null, { ms: 1200 });
    const skinsCopy = await d.eval("(function(){ var b = document.querySelector('[data-sim=skins]') || Array.prototype.filter.call(document.querySelectorAll('input[type=checkbox]'), function (i) { return /toggleStackedGame\\('skins'/.test(i.getAttribute('onchange') || ''); })[0]; var p = b; for (var k = 0; k < 4 && p; k++) p = p.parentElement; return p ? p.innerText.replace(/\\s+/g, ' ').slice(0, 400) : ''; })()");
    d.P.skinsCopy = skinsCopy.slice(0, 160);
    await d.shot('skins-on');
    await d.tap('#wizard-next-6', null, { ms: 1500 });
    const review = (await d.eval("(document.getElementById('wizard-step-7') || document.body).innerText.replace(/\\s+/g, ' ')")).slice(0, 900);
    d.P.review = review.slice(0, 400);
    check(tag, 'HIGH', /Dobson Ranch/.test(review) && /Weekly Game/.test(review) && /Nassau/.test(review) && /Skins/.test(review) && /20 added/.test(review), 'Review lists the course, 20 golfers, Weekly Game, Nassau, Skins', await d.screen('step5-review'));
    await d.tap('#main-save-btn', null, { ms: 5000 });
    const ready = (await d.eval("document.body.innerText.replace(/\\s+/g, ' ')")).slice(0, 2400);
    check(tag, 'BLOCKER', /Round Ready/.test(ready) && /START SCORING/.test(ready), 'Save & Start Round shows Round Ready', await d.screen('round-ready'));
    d.P.roundReadyJoinWords = (/One link for the whole round[^.]*\.[^.]*\.[^.]*\./.exec(ready) || [''])[0];
    // The saved round, as the database now has it.
    await j.harvest();
    const r = (j.db.events || {})[code] || {};
    const ps = (r.players || []).filter((p) => p && p.name);
    const sm = Object.values(r.sideMatches || {});
    const saved = { code, players: ps.length, flights: ps.map((p) => p.flight || '-').join(''), flightsOn: !!(r.flights && r.flights.enabled), pool: !!(r.moneyPool && r.moneyPool.enabled), kp: r.moneyPool && r.moneyPool.kp && r.moneyPool.kp.holes, nassau: sm.filter((m) => m.format === 'nassau').length, skins: !!(r.additionalGames && r.additionalGames.skins && r.additionalGames.skins.enabled), course: r.activeCourseKey, holes: (r.courseData || []).length, start: r.startingHole, groups: null };
    saved.dupNames = ps.length - new Set(ps.map((p) => p.name)).size;
    d.P.saved = saved;
    check(tag, 'BLOCKER', saved.players === 20 && saved.dupNames === 0, 'saved 20 golfers, none twice: ' + saved.players + ' / dup ' + saved.dupNames);
    check(tag, 'BLOCKER', saved.flightsOn && saved.flights === 'A'.repeat(10) + 'B'.repeat(10), 'saved flights A/B 10/10: ' + saved.flights);
    check(tag, 'BLOCKER', saved.pool && JSON.stringify(saved.kp) === JSON.stringify(PAR3), 'saved the Weekly Game with KP on ' + PAR3.join(','));
    check(tag, 'HIGH', saved.nassau === 1 && saved.skins, 'saved the Nassau and the Skins game');
    check(tag, 'BLOCKER', saved.course === 'gca_zgkynkan' && saved.holes === 18 && Number(saved.start || 1) === 1, 'saved Dobson Ranch, 18 holes, off the 1st: ' + [saved.course, saved.holes, saved.start].join(' '));
    await d.tap('button', 'START SCORING', { ms: 5000 });
    const u2 = await d.url();
    check(tag, 'BLOCKER', new RegExp('^index\\.html\\?game=' + code + '$').test(u2), 'START SCORING opens the scorecard: ' + u2);
    const sheet = await d.eval("Array.prototype.filter.call(document.querySelectorAll('.group-pick-btn'), function (b) { return b.offsetParent; }).map(function (b) { return b.innerText.split('\\n')[0]; })");
    d.P.organizerSheet = sheet;
    check(tag, 'HIGH', sheet.length === 7 && /Group 5/.test(sheet[4] || ''), 'the organizer is asked which group (5 groups + playing + watching): ' + sheet.length, await d.screen('card-how-joining'));
    await d.tap('.group-pick-btn', '^Keep score for Group 1', { ms: 4000 });
    const u3 = await d.url();
    check(tag, 'BLOCKER', new RegExp('game=' + code + '&group=1$').test(u3), 'Group 1 card: ' + u3, await d.screen('card-group1'));
    const boxes = await d.eval("Array.prototype.filter.call(document.querySelectorAll('.score-input'), function (i) { return i.offsetParent && !i.disabled; }).length");
    check(tag, 'BLOCKER', boxes === 4, 'Group 1 card has its 4 score boxes: ' + boxes);
    // GPS from the scorecard, after the course and the nines were confirmed in setup.
    await d.tap('#fd-gps-btn', null, { ms: 6000 });
    const g = JSON.parse(await d.eval("JSON.stringify({ side: HardPanGps.side(), hole: HardPanGps.hole(), sheetUp: (function(){ var e = document.querySelector('#gps-overlay .gps-who-sheet'); return !!(e && e.style.display !== 'none' && e.getBoundingClientRect().height > 0); })(), tag: (document.querySelector('#gps-overlay .gps-who') || {}).innerText || null, who: (document.querySelector('#gps-overlay .gps-who-title') || {}).innerText || null, whoBtns: Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-who-list button'), function (b) { return b.offsetParent; }).map(function (b) { return b.innerText + (b.classList.contains('on') ? '*' : ''); }) })"));
    d.P.gps = g;
    check(tag, 'BLOCKER', g.side === 'gps' && g.hole === 1, 'GPS opens on hole 1: ' + JSON.stringify([g.side, g.hole]), await d.screen('gps-who'));
    // URGENT-009 (013-17): the organizer's own phone (it created the round, he is golfer 1 and
    // picked Group 1) is not asked "Who are you?" - GPS shows him already.
    check(tag, 'HIGH', !g.sheetUp && /Manny/.test(g.tag || ''), 'the organizer is not asked "Who are you?"; GPS shows Manny: ' + JSON.stringify(g));
    return { code, gpsWho: g };
}
async function scoreOnGps(d, j, tag, code, who, score, wantKey) {
    if (who && await d.eval("(function(){ var e = document.querySelector('#gps-overlay .gps-who-sheet'); return !!(e && e.style.display !== 'none' && e.getBoundingClientRect().height > 0); })()")) await d.tap('#gps-overlay .gps-who-list button', '^' + who + '$', { ms: 2500 });
    await d.shot('gps-map');
    await d.tap('#gps-overlay .gps-score', null, { ms: 1500 });
    const chip = await d.eval("(function(){ var c = document.querySelector('.hp-ss-chip.on'); return c ? c.innerText : null; })()");
    check(tag, 'HIGH', who ? new RegExp('^' + who.split(' ')[0]).test(chip || '') : !!chip, 'the score sheet opens on ' + (who || 'a golfer') + ': ' + chip, await d.screen('score-sheet'));
    const t = String(score) === '4' ? ['.hp-ss-b.hp-ss-par', null] : ['.hp-ss-b', '^' + score + '$'];
    await d.tap(t[0], t[1]);
    await d.tap('button', 'Save · Next hole', { ms: 2000 });
    await d.shot('score-saved');
    await j.harvest();
    const sc = ((j.db.events || {})[code] || {}).scores || {};
    const ok = Number(sc[wantKey]) === Number(score);
    check(tag, 'BLOCKER', ok, 'the first score saved from the GPS screen: ' + wantKey + '=' + sc[wantKey]);
    const hole = await d.eval('HardPanGps.hole()');
    d.P.after = { hole, scores: Object.keys(sc).length };
    d.P.firstScore = ok;
    return ok;
}

// ---------------------------------------------------------------- C: join by code
async function joinFrom(d, j, tag, start, typed) {
    await j.goto(fileUrl('index.html', ''), 3500);
    await d.screen('home');
    if (start === 'gps') {
        await d.tap('#v-main .hp-door.gps', null, { ms: 3000 });
        const t = await d.eval("(document.getElementById('v-gps') || {}).innerText || ''");
        d.P.gps1HasCode = /game code/i.test(t);
        d.P.gps1YouAre = (/YOU.RE AT\s+([^\n]+)/.exec(t) || [])[1] || null;
        await d.screen('gps1');
        await d.tap('#v-gps .hp-switch .games');
    } else {
        await d.tap('#v-main .hp-door.games');
    }
    await d.screen('games');
    await d.tap('#hp-code');
    await d.type('#hp-code', typed);
    await d.shot('typed');
    await d.tap('#v-games [data-hp-act=join]', null, { ms: 4000 });
}
async function pickGroupSheet(d, tag, code, g) {
    const u = await d.url();
    const sheet = await d.eval("Array.prototype.filter.call(document.querySelectorAll('.group-pick-btn'), function (b) { return b.offsetParent; }).length");
    check(tag, 'BLOCKER', new RegExp('^index\\.html\\?game=' + code + '$').test(u) && sheet === 7, 'the code opens "How are you joining this round?" (not a read-only spectator): ' + u + ' rows ' + sheet, await d.screen('how-joining'));
    await d.tap('.group-pick-btn', '^Keep score for Group ' + g, { ms: 4000 });
}
async function onGroupCard(d, tag, code, g, sk) {
    const u = await d.url();
    const boxes = await d.eval("Array.prototype.filter.call(document.querySelectorAll('.score-input'), function (i) { return i.offsetParent && !i.disabled; }).length");
    const connecting = await d.eval("/Connecting to game/.test(document.body.innerText)");
    check(tag, 'BLOCKER', new RegExp('game=' + code + '&group=' + g + (sk ? '&sk=' + sk : '') + '$').test(u) && boxes === 4 && !connecting, 'Group ' + g + ' card, 4 score boxes, no "Connecting": ' + [u, boxes, connecting].join(' '), await d.screen('card-group' + g));
    await d.tap('#fd-gps-btn', null, { ms: 6000 });
    const gp = JSON.parse(await d.eval("JSON.stringify({ side: HardPanGps.side(), hole: HardPanGps.hole(), who: (document.querySelector('#gps-overlay .gps-who-title') || {}).innerText || null, n: Array.prototype.filter.call(document.querySelectorAll('#gps-overlay .gps-who-list button'), function (b) { return b.offsetParent; }).length })"));
    d.P.gps = gp;
    check(tag, 'BLOCKER', gp.side === 'gps' && gp.hole === 1 && new RegExp('Who are you\\? Group ' + g).test(gp.who || '') && gp.n === 4, 'GPS hole 1, "Who are you? Group ' + g + '" with its 4 golfers: ' + JSON.stringify(gp), await d.screen('gps-who'));
}

const pid = (name) => 102 + NAMES.indexOf(name);   // the paste replaces the blank first row (id 101)

async function main() {
    const want = (n) => !ONLY.length || ONLY.some((o) => n.indexOf(o) === 0 || o.indexOf(n) === 0);
    let dbAfterB = null, code = null;
    // B new + returning: the same phone, a week apart.
    if (want('B') || want('C')) {
        const j = await phone({ db: SEED() });
        try {
            const d = driver(j, 'B-weekly-new');
            const r = await setupWeeklyGame(d, j, 'B-weekly-new', false);
            code = r.code;
            await scoreOnGps(d, j, 'B-weekly-new', code, 'Manny Orozco', 4, 'p' + pid('Manny Orozco') + '_h1');
            await errsOK(d, 'B-new');
            check('B-weekly-new', 'HIGH', !d.P.errors.length, 'no console / page errors and every control was there: ' + d.P.errors.join(' | '));
            await j.harvest();
            dbAfterB = JSON.parse(JSON.stringify(j.db));
            if (want('B-weekly-returning')) {
                // A week later: the last round is 20 hours old (no Resume), the phone keeps the rest.
                await j.evaluate("(function(){ var lr = JSON.parse(localStorage.getItem('hardpan_last_round') || 'null'); if (lr) { lr.at = Date.now() - 20 * 3600e3; localStorage.setItem('hardpan_last_round', JSON.stringify(lr)); } return 1; })()");
                const d2 = driver(j, 'B-weekly-returning');
                const r2 = await setupWeeklyGame(d2, j, 'B-weekly-returning', true);
                check('B-weekly-returning', 'BLOCKER', r2.code && r2.code !== code, 'a NEW round code the second week: ' + r2.code);
                // Layout C spot-check: Tools > Screen layout > Bottom panel, then the score.
                if (await d2.eval("(function(){ var e = document.querySelector('#gps-overlay .gps-who-sheet'); return !!(e && e.style.display !== 'none' && e.getBoundingClientRect().height > 0); })()")) await d2.tap('#gps-overlay .gps-who-list button', '^Manny Orozco$', { ms: 2500 });
                await d2.tap('#gps-overlay .gps-tools', null, { ms: 800 });
                await d2.shot('tools-sheet');
                await d2.tap('#gps-overlay .gps-tsheet [data-ts-seg="layout"] button', '^Bottom panel$', { ms: 2000 });
                const lay = await j.evaluate("(function(){ try { return localStorage.getItem('hardpan_gps_layout'); } catch (e) { return null; } })()");
                check('B-weekly-returning', 'MEDIUM', lay === 'c', 'Tools > Screen layout > Bottom panel switches to layout C: ' + lay, await d2.screen('layout-c'));
                // close the Tools sheet if it is still up
                // a tap on the map above the sheet closes it (as a thumb does)
                if (await d2.has('#gps-overlay .gps-tsheet')) await d2.tapAt(196, 140);
                check('B-weekly-returning', 'MEDIUM', !(await d2.has('#gps-overlay .gps-tsheet')), 'a tap on the map closes Tools', await d2.shot('tools-closed'));
                await scoreOnGps(d2, j, 'B-weekly-returning', r2.code, null, 5, 'p' + pid('Manny Orozco') + '_h1');
                await j.harvest();
                const ps2 = (((j.db.events || {})[r2.code] || {}).players || []).length;
                const ps1 = (((j.db.events || {})[code] || {}).players || []).length;
                check('B-weekly-returning', 'BLOCKER', ps2 === 20 && ps1 === 20, 'each week has its own 20 golfers (nothing carried or doubled): ' + ps1 + ' / ' + ps2);
                await errsOK(d2, 'B-ret');
                check('B-weekly-returning', 'HIGH', !d2.P.errors.length, 'no console / page errors: ' + d2.P.errors.join(' | '));
            }
        } finally { await j.close(); }
    }
    if (!dbAfterB || !code) { finish(); return; }
    // Group 4's scorekeeper code, as Share > Scorekeeper writes it (the hash only).
    const dbC = () => { const x = JSON.parse(JSON.stringify(dbAfterB)); x.events[code].scoreKeys = { 4: sha(KEY4) }; return x; };

    const C = [
        // name, start, typed, then: sheet group | direct group, who, score
        ['C-code-games-new', 'games', () => code, { sheet: 3, who: 'Hal Hart', score: 5 }],
        ['C-code-gps-new', 'gps', () => code.toLowerCase(), { sheet: 2, who: 'Eli Echo', score: 4 }],
        ['C-code2-games-new', 'games', () => code + ' 2', { group: 2, who: 'Dee Dunn', score: 6 }],
        ['C-key-gps-new', 'gps', () => code + '-4-' + KEY4, { group: 4, sk: KEY4, who: 'Moe Mars', score: 4 }],
        ['C-link-games-new', 'games', () => 'https://golf-app-5a5.pages.dev/index.html?game=' + code, { sheet: 5, who: 'Ron Ross', score: 5 }],
        ['C-grouplink-gps-new', 'gps', () => 'https://golf-app-5a5.pages.dev/index.html?game=' + code + '&group=3', { group: 3, who: 'Ivy Ives', score: 3 }],
    ];
    for (const [name, start, typed, t] of C) {
        if (!want(name)) continue;
        const j = await phone({ db: dbC(), uid: 'golfer-' + name.toLowerCase() });
        try {
            const d = driver(j, name);
            await joinFrom(d, j, name, start, typed());
            if (t.sheet) await pickGroupSheet(d, name, code, t.sheet);
            const g = t.sheet || t.group;
            await onGroupCard(d, name, code, g, t.sk);
            await scoreOnGps(d, j, name, code, t.who, t.score, 'p' + pid(t.who) + '_h1');
            if (start === 'gps') d.P.note = 'GPS-1 offers no game-code field (' + (d.P.gps1HasCode ? 'has one' : 'none') + '); "You\'re at ' + d.P.gps1YouAre + '" starts a separate solo round';
            await errsOK(d, name);
            check(name, 'HIGH', !d.P.errors.length, 'no console / page errors: ' + d.P.errors.join(' | '));
        } finally { await j.close(); }
    }

    // C returning golfer: the same phone the next morning - Main > Resume > their group card.
    if (want('C-returning')) {
        const j = await phone({ db: dbC(), uid: 'golfer-ret' });
        try {
            const d = driver(j, 'C-returning');
            await joinFrom(d, j, 'C-returning', 'games', code + ' 5');
            await j.goto(fileUrl('index.html', ''), 4000);   // the app killed and opened again
            const resume = await d.eval("(document.getElementById('hp-resume') || {}).innerText || ''");
            check('C-returning', 'HIGH', /Resume Dobson Ranch/.test(resume), 'Main offers Resume Dobson Ranch: ' + resume, await d.screen('home-resume'));
            await d.tap('#hp-resume [data-hp-open]', null, { ms: 4000 });
            check('C-returning', 'HIGH', new RegExp('game=' + code + '&group=5$').test(await d.url()), 'Resume opens Group 5 again: ' + await d.url(), await d.screen('card-group5'));
            await errsOK(d, 'C-ret');
        } finally { await j.close(); }
    }

    // C wrong: each is said on Home; a dead link says so; nothing frozen on "Connecting...".
    if (want('C-wrong')) {
        const j = await phone({ db: dbC(), uid: 'golfer-wrong' });
        try {
            const d = driver(j, 'C-wrong');
            const cases = [
                ['ZZQQ77', /^No round with the code ZZQQ77\./, 'wrong code'],
                [code + ' 7', new RegExp('^Round ' + code + ' has no Group 7 \\(it has Groups 1.5\\)'), 'wrong group'],
                [code + '-4-BADKEY', new RegExp('scorekeeper key isn.t right for Group 4 of ' + code), 'wrong key'],
                ['https://golf-app-5a5.pages.dev/index.html?game=NOPE99&group=2', /^No round with the code NOPE99\./, 'a link to no round'],
            ];
            d.P.messages = {};
            await j.goto(fileUrl('home.html', '') + '#games', 3000);
            for (const [typed, re, what] of cases) {
                await d.type('#hp-code', typed);
                await d.tap('#v-games [data-hp-act=join]', null, { ms: 2500 });
                const s = JSON.parse(await d.eval("JSON.stringify({ url: document.URL.split('/').pop(), msg: (document.getElementById('hp-code-msg') || {}).textContent || '' })"));
                d.P.messages[what] = s.msg;
                check('C-wrong', 'BLOCKER', /^home\.html/.test(s.url) && re.test(s.msg), what + ' is said on Home: ' + JSON.stringify(s), await d.shot(what.replace(/\W+/g, '-')));
            }
            await j.goto(fileUrl('index.html', 'game=NOPE99&group=2'), 1500);
            await sleep(9000);
            const st = JSON.parse(await d.eval("JSON.stringify({ sheet: (function(){ var s = document.getElementById('hp-stuck-round'); return s && s.style.display !== 'none' ? s.innerText.replace(/\\s+/g, ' ') : null; })(), connecting: /Connecting to game/.test(document.body.innerText) })"));
            check('C-wrong', 'BLOCKER', st.sheet && /isn.t available/.test(st.sheet) && /Go Home/.test(st.sheet), 'a dead round link says so within ~10 s (no frozen Connecting): ' + JSON.stringify(st), await d.shot('dead-link'));
            await errsOK(d, 'C-wrong');
        } finally { await j.close(); }
    }
    finish();
}

// KNOWN FINDINGS this group found and did not fix (not BLOCKERs for the weekly game) -
// listed every run so the counts and the ranking travel with the numbers. See the 013
// group-2 report for repro steps.
const KNOWN = [
    ['HIGH', 'B-weekly-returning', 'No "Same as last week" from the HardPan front door: Games > + Start a round goes straight to a blank Step 1; the lobby that has "Same as last week" / "Start from a previous round" is never shown in the app (Home -> home.html). A returning organizer re-pastes 20 golfers, re-splits flights, re-enters the Weekly Game (37 taps, the same as a first-timer).', 'B-weekly-returning/03-step1-games.png'],
    ['HIGH', 'B-weekly-new', 'Flights (A/B) puts all 20 in A; the organizer taps 10 golfers one by one to make B (no "split by handicap").', 'B-weekly-new/10-flights-on.png'],
    ['MEDIUM', 'C-code-gps-new', 'GPS-first: GPS-1 ("Where are you playing?") has no game-code field and puts "YOU\'RE AT Dobson Ranch - SET UP - 1 TAP" first; a golfer at the course who taps it makes his own solo round instead of joining the weekly game (joining needs the GPS | Games switch).', 'C-code-gps-new/02-gps1.png'],
    ['MEDIUM', 'C-code-games-new', 'A golfer who joins without a group (the sheet, Just watching, a spectator) sees "Are you the organizer? Paste your organizer link. Unlock setup" at the top of the card.', 'C-code-games-new/04-how-joining.png'],
    ['MEDIUM', 'B-weekly-new', 'Flights wording: Players says "Side matches and the Weekly Game never use flights", yet the card shows the Weekly Game\'s skins as "Main Pool Skins - Flight A / Flight B" (money rule question for Manny, not changed).', 'C-code2-games-new/04-card-group2.png'],
    // (URGENT-009 fixed "tap Open" -> "tap Join" on Round Ready.) Still open: in a one-group round the bare code is a read-only spectator.
    ['MEDIUM', 'B-weekly-new', 'In a one-group round the bare code is still a read-only spectator.', 'B-weekly-new/17-round-ready.png'],
    ['MEDIUM', 'B-weekly-new', 'The Skins card says "Ties carry over." while its default is No Carry.', 'B-weekly-new/15-skins-on.png'],
    ['LOW', 'B-weekly-new', 'Review shows "Players 20 added" with no groups / flights line. (URGENT-009 fixed the Players step naming the Weekly Game before one exists.)', 'B-weekly-new/07-step3-players.png'],
    ['LOW', 'B-weekly-new', 'The organizer who just put himself first in Group 1 is asked "How are you joining this round?" (could default: owner -> Group 1). (URGENT-009: "Who are you?" on GPS is no longer asked of the round\'s creator.)', 'B-weekly-new/18-card-how-joining.png'],
    ['LOW', 'B-weekly-new', 'The Weekly Game runs skins ("Skins takes the rest") and Also Playing has a separate $5 Skins game: two skins games on the card (Main Pool Skins + $5 Skins) - legitimate, but easy to double up by accident.', 'B-weekly-new/15-skins-on.png'],
    ['LOW', 'B-weekly-returning', 'Games-1 still shows last week\'s round under YOUR ROUND ("THRU 1") 20 h later, while Main\'s Resume has (rightly) gone.', 'B-weekly-returning/02-games.png'],
];
function finish() {
    for (const [sev, p, what, shot] of KNOWN) out.findings.push({ sev, path: p, what, shot: path.join(SHOTS, shot), known: true });
    for (const c of out.checks.filter((x) => !x.ok)) out.findings.push({ sev: c.sev, path: c.path, what: 'REGRESSION: ' + c.what, shot: c.shot });
    const per = {};
    for (const [k, P] of Object.entries(out.paths)) per[k] = { taps: P.taps, typed: P.typed, screens: P.screens.length, screenList: P.screens, firstScore: !!P.firstScore, errors: P.errors };
    const failedHard = out.checks.filter((c) => !c.ok && (c.sev === 'BLOCKER' || c.sev === 'HIGH'));
    const summary = { group: '013-2 games-first + join by code', viewport: VIEW, perPath: per, findings: out.findings, checks: { total: out.checks.length, failed: out.checks.filter((c) => !c.ok).length, failedBlockerHigh: failedHard.length }, details: Object.fromEntries(Object.entries(out.paths).map(([k, P]) => [k, Object.fromEntries(Object.entries(P).filter(([x]) => !['taps', 'typed', 'screens', 'shots', 'errors'].includes(x)))])) };
    console.log(JSON.stringify(summary, null, 1));
    process.exit(failedHard.length ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(2); });
