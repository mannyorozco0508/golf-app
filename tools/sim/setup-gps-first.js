#!/usr/bin/env node
// ============================================================================
// SETUP-FLOW SIMULATIONS, GPS FIRST (mailbox 013, group 1 of 3)
//
//   node tools/sim/setup-gps-first.js [--only A-skins-new,F-new] [--shots <dir>] [--layout c]
//   exit 0 = no BLOCKER/HIGH regression, 1 = one or more, 2 = could not run
//
// EVERY PATH STARTS ON THE FIRST SCREEN (home.html, the app's front door) and ends when the
// first score is saved - every step a REAL tap or a real keystroke (tools/lib/journey.js: one
// Chrome, a stand-in database with a memory that rides from page to page; nothing in the page
// is called by name). iPhone 15 size (393x852), layout D (the default) unless --layout c.
//
//   A-<game>-new / A-<game>-ret   Start with GPS (GPS door -> course -> Start round), then from
//                                 INSIDE the GPS screen (the Games pill) set up a game: skins,
//                                 dots, kp, weekly, side, nassau, flights. A fresh phone ("new":
//                                 empty localStorage) and a returning organizer ("ret": a past
//                                 round of his on this phone, his recent courses).
//   W-dobson                      TOMORROW'S ROUND: Manny (returning), Dobson Ranch from his
//                                 Recent list, GPS first, the Weekly Game for 20 golfers in 5
//                                 groups with flights A/B (one pasted list), first score on GPS.
//   F-new / F-ret                 Location DENIED (the browser's geolocation answers
//                                 PERMISSION_DENIED and permissions.query says 'denied' - the
//                                 iOS-native permission sheet cannot be driven here), then GPS
//                                 first: a clear message, and games + score entry still work.
//
// Per path: taps and screens from launch to the first score, every step's screenshot
// (default ~/Desktop/claude-code-reports/013/<path>/NN-step.png), and findings, ranked:
//   BLOCKER  a dead end / loop / lost state that stops the round
//   HIGH     wrong hole/course/side, state lost or duplicated, a frozen "Connecting...", GPS before
//            the course is confirmed, a step skipped
//   MEDIUM   a screen asking again for something given, two buttons doing one thing, a console
//            error, wording that does not say what happens next
//   LOW      could be skipped / merged / defaulted
// A JSON summary goes to stdout. Exit 1 when any BLOCKER or HIGH is found that is not in
// KNOWN (the ranked list handed back to Manny, 2026-10-18) - a NEW regression fails the run.
//
// Never the live Firebase: the real SDK is blocked by the harness and every network map / weather
// / Cloud Function URL is blocked too. Codes are invented by the app itself in the stand-in.
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const HERE = path.join(__dirname, '..', '..');
const { openJourney, fileUrl } = require(path.join(HERE, 'tools/lib/journey.js'));
const { iapStub } = require(path.join(HERE, 'tools/lib/iap-stub.js'));
const grouping = (function () { const vm = require('vm'); const sb = {}; vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(HERE, 'grouping.js'), 'utf8') + ';this.computeGroupSizes = computeGroupSizes;', sb); return sb; })();

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ONLY = arg('--only') ? arg('--only').split(',') : null;
const SHOTS = path.resolve(arg('--shots') || path.join(os.homedir(), 'Desktop/claude-code-reports/013'));
const LAYOUT = arg('--layout') === 'c' ? 'c' : 'd';
const VP = { width: 393, height: 852 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- THE PHONE --------------------------------------------------------------------------------
const CAL = [33.450384, -79.153438];                 // Caledonia, hole 1 tee (bundled, GPS READY)
const DOB = [33.3717, -111.8726];                    // Dobson Ranch, Mesa AZ (bundled gca_zgkynkan)
// The bundled OpenStreetMap holes, no GolfAPI/Cloud Functions (headless is not native, so GPS LIVE
// is off either way); no Esri key.
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,esriKey:''});c.features=Object.assign({},v.features);}});})();";
const GEO_OK = (p) => "(function(){ try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var f = function () { ok({ coords: { latitude: " + p[0] + ", longitude: " + p[1] + ", accuracy: 5 }, timestamp: Date.now() }); }; setTimeout(f, 50); setInterval(f, 1500); return 1; }, getCurrentPosition: function (ok) { setTimeout(function () { ok({ coords: { latitude: " + p[0] + ", longitude: " + p[1] + ", accuracy: 5 }, timestamp: Date.now() }); }, 10); }, clearWatch: function () {} } }); } catch (e) {}"
    + " try { var q0 = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = function (d) { return d && d.name === 'geolocation' ? Promise.resolve({ state: 'granted' }) : q0(d); }; } catch (e) {} })();";
// DENIED: what a browser / WKWebView reports after "Don't Allow" - every request fails with code 1.
const GEO_DENIED = "(function(){ var err = { code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }; window.__geoAsks = 0;"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok, no) { window.__geoAsks++; setTimeout(function () { if (no) no(err); }, 30); return 1; }, getCurrentPosition: function (ok, no) { window.__geoAsks++; setTimeout(function () { if (no) no(err); }, 30); }, clearWatch: function () {} } }); } catch (e) {}"
    + " try { var q0 = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = function (d) { return d && d.name === 'geolocation' ? Promise.resolve({ state: 'denied' }) : q0(d); }; } catch (e) {} })();";
const BLOCK = ['*cloudfunctions.net*', '*arcgis*', '*weather.gov*', '*nationalmap.gov*', '*epqs*', '*overpass*', '*openstreetmap*', '*googleapis.com/identitytoolkit*'];

// THE RETURNING ORGANIZER: his past round (2 days ago, finished, his uid) and this phone's memory
// of it - the front door he used, the courses he played, the round he last left.
const PAST = 'PAST13';
const DOBSON_KEY = 'gca_zgkynkan';
function card(pars) { return pars.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: [7, 11, 17, 1, 13, 5, 15, 9, 3, 8, 16, 4, 2, 12, 6, 18, 10, 14][i] })); }
const CAL_PARS = [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const DOB_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];   // invented test card, par 72
function pastRound() {
    const names = ['Manny Orozco', 'Joe Russo', 'Randy Tate', 'Mike Lane'];
    const scores = {};
    names.forEach((_, i) => { for (let h = 1; h <= 18; h++) scores['p' + (101 + i) + '_h' + h] = String(4 + ((h + i) % 3) - 1); });
    return { eventName: 'Saturday Game', roundDay: 'Saturday', activeCourseKey: DOBSON_KEY, courseName: 'Dobson Ranch Golf Course', courseData: card(DOB_PARS), startingHole: 1,
        ownerUid: 'anon-cold', organizerToken: 'f'.repeat(32), gameFormat: 'stroke', players: names.map((n, i) => ({ id: 101 + i, name: n, hcp: String(8 + i * 3), team: 'Team 1', squad: 'red', playingForMoney: true })),
        scores, finishedAt: Date.now() - 2 * 86400000, createdAt: Date.now() - 2 * 86400000 - 5 * 3600000 };
}
function seedDb(returning) {
    const db = { events: {}, trips: {}, organizers: {}, tournaments: {},
        global_courses: { [DOBSON_KEY]: { name: 'Dobson Ranch Golf Course', data: card(DOB_PARS), location: { city: 'Mesa', state: 'AZ' } } } };
    if (returning) db.events[PAST] = pastRound();
    return db;
}
const RETURNING_LS = "(function(){ try { if (localStorage.getItem('__seeded13')) return; localStorage.setItem('__seeded13', '1');"
    + " localStorage.setItem('hardpan_front_door', 'gps');"
    + " localStorage.setItem('hardpan_gps_recent_courses', JSON.stringify([{ key: '" + DOBSON_KEY + "', name: 'Dobson Ranch Golf Course', at: Date.now() - 2 * 86400000 }, { key: 'caledonia', name: 'Caledonia Golf & Fish Club', at: Date.now() - 9 * 86400000 }]));"
    + " localStorage.setItem('hardpan_last_round', JSON.stringify({ code: '" + PAST + "', at: Date.now() - 2 * 86400000, course: 'Dobson Ranch Golf Course' }));"
    + " localStorage.setItem('lastRoomCode', '" + PAST + "'); localStorage.setItem('hardpan_round_side', 'gps|" + PAST + "');"
    + " localStorage.setItem('golfapp_saved_rounds', JSON.stringify([{ code: '" + PAST + "', at: Date.now() - 2 * 86400000 }]));"
    + " localStorage.setItem('hardpan_gps_whoasked_" + PAST + "', '1'); localStorage.setItem('hardpan_gps_golfer_" + PAST + "', '101');"
    + " } catch (e) {} })();";
const LAYOUT_C = "(function(){ try { if (!localStorage.getItem('__lay13')) { localStorage.setItem('__lay13','1'); localStorage.setItem('hardpan_gps_layout','c'); } } catch(e){} })();";

// ---- ONE SIMULATED PATH -------------------------------------------------------------------------
const SEV = ['BLOCKER', 'HIGH', 'MEDIUM', 'LOW'];
// What the page shows, as one string: a new value = a new screen.
const SIG = `(function () {
  var shown = function (e) { if (!e) return false; for (var x = e; x && x !== document.documentElement; x = x.parentElement) { var cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var u = new URL(document.URL), p = u.pathname.split('/').pop(), parts = [p];
  ['step', 'tpl', 'fmt', 'add', 'hpfill', 'paste', 'pool'].forEach(function (k) { if (u.searchParams.get(k)) parts.push(k + '=' + u.searchParams.get(k)); });
  var hv = document.querySelector('.hp-view.on'); if (hv && p === 'home.html') parts.push(hv.id);
  if (typeof currentWizardStep !== 'undefined' && p === 'admin.html') parts.push('wiz' + currentWizardStep);
  var ov = [['#hp-opts', 'start-options'], ['#hp-setup', 'setup-msg'], ['#fd-addgame', 'addgame'], ['#hp-score-sheet .hp-ss', 'score-sheet'], ['#gps-overlay .gps-who-sheet', 'who'], ['#gps-overlay .gps-tsheet', 'tools'], ['.hp-paywall, #gps-paywall', 'paywall'], ['#paste-modal, .paste-modal', 'paste'], ['#round-sheet.open, #round-sheet.expanded', 'round-menu']];
  ov.forEach(function (o) { var e = document.querySelector(o[0]); if (shown(e)) parts.push(o[1] + (o[1] === 'addgame' ? ':' + ((e.querySelector('.ag-body div div div') || {}).textContent || '') : '')); });
  if (window.HardPanGps && HardPanGps.side && p === 'index.html') parts.push('side=' + HardPanGps.side());
  return parts.join(' ');
})()`;
const STATE = `JSON.stringify((function () {
  var u = new URL(document.URL);
  return { url: u.pathname.split('/').pop() + u.search, code: u.searchParams.get('game'), side: window.HardPanGps && HardPanGps.side ? HardPanGps.side() : null,
    hole: window.HardPanGps && HardPanGps.hole ? HardPanGps.hole() : null, layout: window.HardPanGps && HardPanGps.layout ? HardPanGps.layout() : null,
    cardHole: typeof currentViewedHole !== 'undefined' ? currentViewedHole : null, ls: localStorage.getItem('hardpan_round_side'),
    connecting: /Connecting/.test(document.body ? document.body.innerText : ''), text: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 400) };
})())`;

class Sim {
    constructor(id, o) {
        this.id = id; this.o = o; this.taps = 0; this.typed = 0; this.screens = 0; this.lastSig = null; this.n = 0;
        this.findings = []; this.steps = []; this.dir = path.join(SHOTS, id); this.errAt = 0; this.dlgAt = 0; this.code = null;
        fs.mkdirSync(this.dir, { recursive: true });
        fs.readdirSync(this.dir).filter((f) => /\.png$/.test(f)).forEach((f) => fs.rmSync(path.join(this.dir, f)));
    }
    async start() {
        const pre = 'window.__hardpanDoors = true;' + CFG + (this.o.geo || GEO_OK(this.o.at || CAL)) + (this.o.returning ? RETURNING_LS : '') + (LAYOUT === 'c' ? LAYOUT_C : '') + iapStub({ active: true });
        this.j = await openJourney({ db: seedDb(this.o.returning), preScript: pre, webgl: true, viewport: VP, blockUrls: BLOCK });
        await this.j.goto(fileUrl('home.html'), 3000);
        await this.mark('home');
    }
    async close() { try { if (this.j) await this.j.close(); } catch (e) { /* closing */ } }
    find(sev, what, why, extra) {
        const shot = this.lastShot || null;
        this.findings.push(Object.assign({ sev, path: this.id, step: this.n, what, why: why || '', shot }, extra || {}));
    }
    async state() { try { return JSON.parse(await this.j.evaluate(STATE)); } catch (e) { return { url: '?', err: String(e.message) }; } }
    async sig() { try { return await this.j.evaluate(SIG); } catch (e) { return '?'; } }
    // After every step: the screenshot, a new screen counted, console errors and native dialogs read.
    async mark(label) {
        this.n++;
        const s = await this.sig();
        if (s !== this.lastSig) { this.screens++; this.lastSig = s; }
        const file = path.join(this.dir, String(this.n).padStart(2, '0') + '-' + label.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png');
        try { await this.j.shot(file); this.lastShot = file; } catch (e) { this.lastShot = null; }
        const errs = this.j.consoleErrors.slice(this.errAt); this.errAt = this.j.consoleErrors.length;
        errs.forEach((e) => this.find('MEDIUM', 'console error on ' + (e.url || '').split('/').pop().split('?')[0], e.text));
        let dl = []; try { dl = await this.j.dialogs(); } catch (e) { dl = []; }
        dl.forEach((d) => this.find('MEDIUM', 'native ' + d.type + '() dialog', d.message.slice(0, 160)));
        this.steps.push({ n: this.n, label, sig: s, taps: this.taps, screens: this.screens });
        return s;
    }
    // A real tap; a missing control is a DEAD END (the golfer cannot go on), reported and thrown.
    async tap(sel, re, label, o) {
        const pt = await this.j.tap(sel, re || null, { index: (o && o.index) || 0, settleMs: (o && o.settle) || 400 });
        if (!pt) {
            if (o && o.optional) return null;
            await this.mark('missing-' + label);
            this.find((o && o.sev) || 'BLOCKER', 'dead end: no "' + label + '" to tap', sel + (re ? ' ' + re : ''));
            throw new Error('dead end: ' + label);
        }
        this.taps++;
        if (o && o.wait) await this.waitNav(o.wait);
        await this.mark(label);
        return pt;
    }
    async type(sel, index, text, label) {
        const pt = await this.j.tap(sel, null, { index: index || 0, settleMs: 150 });
        if (!pt) { this.find('BLOCKER', 'dead end: no field "' + label + '"', sel); throw new Error('dead end: ' + label); }
        this.taps++; this.typed++;
        await this.j.evaluate("(function(){ var e = document.activeElement; if (e && e.select) e.select(); return 1; })()");
        await this.j.cdp('Input.insertText', { text: String(text) });
        await sleep(150);
    }
    // Waits for the page to settle on the test: { url: RegExp } / an expression / ms.
    async waitNav(w, ms) {
        const t0 = Date.now(), lim = ms || 20000;
        if (typeof w === 'number') { await sleep(w); return true; }
        while (Date.now() - t0 < lim) {
            try {
                if (w instanceof RegExp) { const u = await this.j.evaluate('document.URL'); if (w.test(u)) { await sleep(1800); return true; } }
                else if (await this.j.evaluate(w)) { await sleep(300); return true; }
            } catch (e) { /* navigating */ }
            await sleep(300);
        }
        return false;
    }
    async db() { await this.j.harvest(); return this.j.db; }
    async round() { const d = await this.db(); return this.code ? (d.events || {})[this.code] : null; }
    // A "Connecting..." still up after the page had its time: a frozen screen.
    async noFreeze(where) {
        const s = await this.state();
        if (s.connecting) {
            await sleep(6000);
            const s2 = await this.state();
            if (s2.connecting) this.find('HIGH', 'frozen "Connecting..." on ' + where, s2.text.slice(0, 160));
        }
        return s;
    }
    summary() {
        return { path: this.id, taps: this.taps, typedFields: this.typed, screens: this.screens, steps: this.steps.map((s) => s.label), findings: this.findings };
    }
}

// ---- THE SHARED PIECES OF EVERY PATH -------------------------------------------------------------
// Home -> GPS door -> a course -> Start options -> Start round -> the round on GPS.
async function startGpsRound(s, course) {
    const re = course === 'dobson' ? /Dobson/ : /Caledonia/;
    await s.tap('#v-main .hp-door.gps', null, 'gps-door', { wait: 2500 });
    let st = await s.state();
    // The returning organizer whose last round is over: the course list. (A round in progress
    // would go straight back into it - not this case.)
    if (!/home\.html/.test(st.url)) s.find('HIGH', 'the GPS door left Home before a course was picked', st.url);
    // Recent first (a returning organizer), else Near you, else search.
    let row = await s.j.tap('#hp-recent-list .hp-row', re, { settleMs: 1200 });
    if (!row) row = await s.j.tap('#hp-near-list .hp-row', re, { settleMs: 1200 });
    if (!row) {
        await s.type('#hp-q', 0, course === 'dobson' ? 'Dobson' : 'Caledonia', 'search');
        await sleep(500);
        row = await s.j.tap('#hp-results-list .hp-row', re, { settleMs: 1200 });
    }
    if (!row) { await s.mark('no-course'); s.find('BLOCKER', 'dead end: the course is not in Recent, Near you or search', String(re)); throw new Error('no course'); }
    s.taps++;
    await s.mark('course-picked');
    const optsUp = await s.j.evaluate("(function(){ var e = document.getElementById('hp-opts'); return !!(e && getComputedStyle(e).display !== 'none'); })()");
    if (!optsUp) s.find('HIGH', 'no Start options (nines / hole 1 or 10 / tee) before the round started', 'step skipped');
    const gpsEarly = await s.j.evaluate("/index\\.html/.test(document.URL)");
    if (gpsEarly && optsUp === false) s.find('HIGH', 'GPS opened before the course / start hole were confirmed', '');
    await s.tap('#hp-opts [data-o="go"]', null, 'start-round', { wait: /index\.html\?game=/ });
    await s.waitNav("!!(window.HardPanGps && HardPanGps.side && HardPanGps.side() === 'gps')", 12000);
    st = await s.noFreeze('the new round');
    s.code = st.code;
    await s.mark('round-open');
    if (!/^index\.html\?game=[A-Z0-9]+$/.test(st.url)) s.find('BLOCKER', 'Start round did not open the round', st.url);
    if (st.side !== 'gps') s.find(s.o.geo === GEO_DENIED ? 'LOW' : 'HIGH', 'a GPS-first round opened on the card, not GPS', JSON.stringify({ side: st.side, ls: st.ls }));
    if (st.side === 'gps' && st.layout !== LAYOUT) s.find('HIGH', 'not layout ' + LAYOUT.toUpperCase(), st.layout);
    if ((st.hole || st.cardHole) !== 1) s.find('HIGH', 'the round did not open on hole 1', JSON.stringify([st.hole, st.cardHole]));
    const r = await s.round();
    if (!r) s.find('BLOCKER', 'the round was not saved', s.code);
    else {
        if (course === 'dobson' && !/Dobson/.test(r.courseName || '')) s.find('BLOCKER', 'the wrong course opened', r.courseName);
        if (course !== 'dobson' && !/Caledonia/.test(r.courseName || '')) s.find('BLOCKER', 'the wrong course opened', r.courseName);
        const n = (s.o.returning && s.o.meName) ? s.o.meName : null;
        if (n && (r.players || [])[0] && !new RegExp(n.split(' ')[0]).test(r.players[0].name)) {
            s.find('LOW', 'a returning organizer is "' + r.players[0].name + '" again in a new round', 'his last round on this phone named him ' + n + '; the new round will show "' + r.players[0].name + '" on every card and receipt until he renames it');
        }
    }
    return st;
}
// The Games pill on the GPS screen -> the Add a game sheet (a round with no games: straight there).
async function openGames(s) {
    const st = await s.state();
    if (st.side !== 'gps') {
        // the card: its own "+ Add a game"
        await s.tap('.fd-gps3-add, .tg-add', null, 'card-add-game');
    } else {
        await s.tap('#gps-overlay .gps-door-games', null, 'games-pill', { settle: 1200 });
    }
    const up = await s.j.evaluate("(function(){ var a = document.getElementById('fd-addgame'); return !!(a && a.style.display !== 'none'); })()");
    if (!up) {
        // a round that already has games lands on Today's games: "+ Add game" at its top.
        const t = await s.j.tap('#todays-games-mount .tg-add', null, { settleMs: 700 });
        if (t) { s.taps++; await s.mark('todays-games-add'); }
    }
    const up2 = await s.j.evaluate("(function(){ var a = document.getElementById('fd-addgame'); return !!(a && a.style.display !== 'none'); })()");
    if (!up2) { s.find('BLOCKER', 'dead end: Games did not open Add a game', ''); throw new Error('no add game'); }
    const st2 = await s.state();
    const twins = await s.j.evaluate("(function(){ var v = function (e) { if (!e) return false; for (var x = e; x && x !== document.documentElement; x = x.parentElement) { var cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight; }; return [v(document.querySelector('.fd-gps3-add')), v(document.querySelector('#todays-games-mount .tg-add'))]; })()");
    if (twins[0] && twins[1]) s.find('MEDIUM', 'two buttons do the same thing on the card: "+ Add a game" and "+ Add game", one under the other', 'both open the one Add a game sheet (the GPS-3 strip and Today\'s games)');
    return st2;
}
// Round Setup's Players step after "Add your golfers first": add golfers by name (real taps and
// keystrokes), then the banner's "Save golfers · set up X".
async function addGolfers(s, names) {
    for (const n of names) {
        await s.tap('#players-section button.btn-add, button.btn-add', /Add New Player/, 'add-player', { settle: 350 });
        const k = await s.j.evaluate("document.querySelectorAll('#player-list .p-name-input').length");
        await s.type('#player-list .p-name-input', k - 1, n, 'golfer name');
    }
    await s.mark('golfers-typed');
}
async function playersFirst(s, names, gameName) {
    const ok = await s.waitNav("!!document.getElementById('fd-need')", 15000);
    const st = await s.state();
    if (!ok) { s.find('HIGH', 'a ' + gameName + ' with one golfer did not ask for golfers first', st.url); return false; }
    await s.mark('players-first');
    // The line that says why, in view when the step opens?
    const inView = await s.j.evaluate("(function(){ var b = document.querySelector('#fd-need'); if (!b) return null; var r = b.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })()");
    if (!inView) s.find('MEDIUM', 'Players first: the "Add your golfers first" line and its Save button are scrolled off the top', 'the step opens scrolled to the player list; the button that goes on is out of sight');
    await addGolfers(s, names);
    // URGENT-009 (013-19): the banner's button, or the Players step's own Next that now says and
    // does the same ("Save golfers · set up X", .fd-need-next).
    const goInView = await s.j.evaluate("(function(){ return Array.prototype.some.call(document.querySelectorAll('#fd-need .fd-need-go, .fd-need-next'), function (b) { var r = b.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < innerHeight; }); })()");
    if (!goInView) s.find('LOW', '"Save golfers · set up ' + gameName + '" is off screen after adding golfers; "Next: Money" is the button in view', 'two buttons go on from Players; the in-view one skips the game the golfer picked');
    await s.tap('#fd-need .fd-need-go', null, 'save-golfers', { settle: 1500 });
    await s.waitNav(5000);
    return true;
}
// Round Setup (admin.html): Review & Save, then Save. Back on the round.
async function saveRoundSetup(s) {
    await s.waitNav("typeof currentWizardStep !== 'undefined' && document.getElementById('main-save-btn')", 15000);
    const r1 = await s.j.tap('button', /Review & Save/, { settleMs: 1200 });
    if (r1) { s.taps++; await s.mark('review'); }
    await s.tap('#main-save-btn', null, 'save-setup', { wait: /index\.html\?game=/ });
}
// Back on the round after a game's Save: GPS? the same hole? Then "Who are you?" if asked.
async function backOnRound(s, hole) {
    await s.waitNav(/index\.html\?game=/, 20000);
    await s.waitNav("!!(window.HardPanGps && HardPanGps.isMounted && HardPanGps.isMounted())", 8000);
    await sleep(3500);
    const st = await s.noFreeze('the round after Save');
    await s.mark('back-on-round');
    if (st.code !== s.code) s.find('BLOCKER', 'Save opened a different round', JSON.stringify([s.code, st.code]));
    if (st.side !== 'gps' && s.o.geo !== GEO_DENIED) s.find('HIGH', 'after adding a game from the GPS screen the round reopened on the CARD, not GPS', 'the Games pill wrote "bets|' + s.code + '" as the side this phone left on (ls=' + st.ls + '); one more tap on 📍 GPS', { known: 'K-SIDE' });
    if ((st.hole || st.cardHole) !== (hole || 1)) s.find('HIGH', 'not back on hole ' + (hole || 1), JSON.stringify([st.hole, st.cardHole]));
    return st;
}
// The card's "How are you joining this round?" (a round of more than one group): the organizer
// keeps score for his own group.
async function joiningSheet(s, name) {
    const up = await s.j.evaluate("(function(){ var e = document.getElementById('group-pick-overlay'); return !!(e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0); })()");
    if (!up) return false;
    s.find('MEDIUM', 'the organizer is asked "How are you joining this round?" on the round he just set up', 'his own phone offers "Just watching" / "I\'m playing"; GPS then asks "Who are you?" again - two questions for one answer (which golfer / group this phone is)', { known: 'K-JOIN' });
    const re = new RegExp(name.split(' ')[0]);
    let t = await s.j.tap('#group-pick-body button, #group-pick-body a', re, { settleMs: 400 });
    if (!t) t = await s.j.tap('#group-pick-body button, #group-pick-body a', /Group 1/, { settleMs: 400 });
    if (t) { s.taps++; await s.waitNav(3500); await s.mark('joining-group'); }
    return true;
}
async function whoAreYou(s, name) {
    const up = await s.j.evaluate("(function(){ var e = document.querySelector('#gps-overlay .gps-who-sheet'); return !!(e && e.style.display !== 'none' && e.getBoundingClientRect().height > 0); })()");
    if (!up) return false;
    s.find('LOW', '"Who are you?" asked of the organizer who started this round on this phone', 'this phone created the round as golfer 1 ("' + name + '"); it could be preselected');
    const re = new RegExp('^' + name.split(' ')[0]);
    const t = await s.j.tap('#gps-overlay .gps-who-sheet [data-who-id]', re, { settleMs: 600 });
    if (t) { s.taps++; await s.mark('who-are-you'); return true; }
    const g = await s.j.tap('#gps-overlay .gps-who-sheet [data-who-group]', null, { settleMs: 600 });
    if (g) { s.taps++; await s.mark('who-group'); const t2 = await s.j.tap('#gps-overlay .gps-who-sheet [data-who-id]', re, { settleMs: 600 }); if (t2) { s.taps++; await s.mark('who-are-you'); } }
    return true;
}
// THE FIRST SCORE. On GPS: Enter score -> the score sheet -> a number -> Save. On the card: the box.
async function firstScore(s, me, opts) {
    let st = await s.state();
    const hole = st.hole || st.cardHole || 1;
    await joiningSheet(s, me);
    st = await s.state();
    // Back on the card after a game's Save (K-SIDE): a GPS-first golfer taps 📍 GPS to go on.
    if (st.side !== 'gps' && s.o.geo !== GEO_DENIED) {
        await s.tap('#fd-gps-btn, #gps-side-toggle .gps-side-gps', null, 'gps-button', { settle: 2500 });
        await s.waitNav("!!(window.HardPanGps && HardPanGps.side() === 'gps')", 8000);
        st = await s.state();
    }
    if (st.side === 'gps') {
        await whoAreYou(s, me);
        await s.tap('#gps-overlay .gps-score', null, 'enter-score', { settle: 800 });
        await whoAreYou(s, me);
        const sheet = await s.j.evaluate("(function(){ var w = document.getElementById('hp-score-sheet'); return !!(w && w.querySelector('.hp-ss') && w.getBoundingClientRect().height > 0); })()");
        if (!sheet) { s.find('HIGH', 'Enter score did not open the score sheet', ''); }
        else {
            await s.tap('#hp-score-sheet [data-ss-score="4"]', null, 'score-4', { settle: 300 });
            await s.tap('#hp-score-sheet [data-ss-save]', null, 'save-score', { settle: 1500 });
        }
    } else {
        await s.type('.score-input', 0, '4', 'score box');
        await s.tap('.hole-view-position, h1, body', null, 'blur', { settle: 1200, optional: true });
        await s.mark('score-typed');
    }
    await sleep(1200);
    const r = await s.round();
    const sc = (r && r.scores) || {};
    const keys = Object.keys(sc).filter((k) => new RegExp('_h' + hole + '$').test(k) && Number(sc[k]) > 0);
    if (!keys.length) s.find('BLOCKER', 'the first score was not saved', 'scores=' + JSON.stringify(sc).slice(0, 200), {});
    st = await s.state();
    return { hole, saved: keys };
}
// No duplicated / lost golfers.
async function checkPlayers(s, want) {
    const r = await s.round();
    const ps = ((r && r.players) || []).filter((p) => p && p.name).map((p) => p.name);
    const dup = ps.filter((n, i) => ps.indexOf(n) !== i);
    if (dup.length) s.find('HIGH', 'golfers duplicated', JSON.stringify(dup));
    if (want && ps.length !== want) s.find('HIGH', 'golfers lost or added: ' + ps.length + ' saved, ' + want + ' given', JSON.stringify(ps));
    return ps;
}

// ---- THE GAMES (path A) ----------------------------------------------------------------------------
const GOLFERS = ['Joe Russo', 'Randy Tate', 'Mike Lane'];
const GAMES = {
    // Quick start Skins: Players first -> back to the round with the Skins sheet -> Add Skins ->
    // Round Setup Money (filled in) -> Review -> Save.
    skins: async (s) => {
        await s.tap('#fd-addgame [data-ag-q="skins"]', null, 'skins', { settle: 1500 });
        if (await playersFirst(s, GOLFERS, 'Skins')) await s.waitNav(/index\.html\?game=/, 15000);
        await s.waitNav("!!document.getElementById('fd-ag-cta')", 12000);
        await s.mark('skins-config');
        const cta = await s.j.evaluate("(document.getElementById('fd-ag-cta') || {}).textContent || ''");
        await s.tap('#fd-ag-cta', null, 'add-skins', { wait: /admin\.html/ });
        await s.waitNav("typeof skinsInstances !== 'undefined' && skinsInstances.length > 0", 10000);
        const amt = await s.j.evaluate("(function(){ var i = document.querySelector('#skins-instances input[type=tel], .skins-buyin input, input[id*=skins][id*=buy]'); var t = document.body.innerText; var m = /Buy-in per golfer[^$]*?\\$?(\\d+)/.exec(t); var pot = /\\$(\\d+) total pot/.exec(t); return JSON.stringify({ buyin: m && m[1], pot: pot && pot[1] }); })()");
        const a = JSON.parse(amt);
        if (/\$2 a skin/.test(cta) && a.pot) s.find('HIGH', 'Skins quick start says "$2 a skin"; Round Setup makes it a $2-a-golfer pot ($' + a.pot + ' total)', 'the tile and its button promise a per-skin price; the saved game is a buy-in pot - a different bet', { known: 'K-SKIN$' });
        await saveRoundSetup(s);
        return 'skins';
    },
    dots: async (s) => {
        await s.tap('#fd-addgame [data-ag-all="dots"]', null, 'dots', { settle: 1500 });
        if (await playersFirst(s, GOLFERS, 'Dots / junk')) await s.waitNav(/sidematches\.html|index\.html/, 15000);
        await s.waitNav(/sidematches\.html/, 15000);
        await s.waitNav("!!document.getElementById('sm-save-btn')", 12000);
        await s.mark('dots-setup');
        const starts = await s.j.evaluate("Array.prototype.filter.call(document.querySelectorAll('#sm-modal label, .modal label, label, div'), function (e) { return e.children.length === 0 && /^Starts on$/.test(e.textContent.trim()) && e.getBoundingClientRect().height > 0; }).length");
        if (starts > 1) s.find('MEDIUM', 'Dots setup shows "Starts on" twice (two hole pickers)', starts + ' "Starts on" labels in the New Action sheet');
        await s.tap('#sm-save-btn', null, 'start-action', { settle: 2500 });
        await backFromMatches(s);
        return 'dots';
    },
    kp: async (s, o) => {
        await s.tap('#fd-addgame [data-ag-all="kp"]', null, 'kp-weekly', { settle: 1500 });
        await playersFirst(s, (o && o.golfers) || GOLFERS, 'KP pool / Weekly game');
        await s.waitNav(/step=money/, 15000);
        await s.waitNav("!!(document.getElementById('mp-enabled') || {}).checked", 8000);
        await s.mark('weekly-game-open');
        if (o && o.weekly) {
            // a 4-golfer weekly game: $40 each, $60 KPs, $60 net, skins the rest
            await s.type('#mp-kp-amount', 0, '60', 'KP $'); await s.type('#mp-net-amount', 0, '60', 'net $');
        } else {
            // KPs only: the whole $160 to the par-3 KPs
            await s.type('#mp-kp-amount', 0, '160', 'KP $'); await s.type('#mp-net-amount', 0, '0', 'net $');
        }
        await s.mark('pool-set');
        await saveRoundSetup(s);
        return o && o.weekly ? 'weekly' : 'kp';
    },
    weekly: async (s) => GAMES.kp(s, { weekly: true }),
    side: async (s) => {
        await s.tap('#fd-addgame [data-ag-all="side"]', null, 'side-bets', { settle: 1500 });
        if (await playersFirst(s, GOLFERS, 'Side bets')) await s.waitNav(/sidematches\.html|index\.html/, 15000);
        await s.waitNav(/sidematches\.html/, 15000);
        await s.waitNav("!!document.getElementById('sm-save-btn')", 12000);
        await s.mark('side-setup');
        await s.tap('#sm-player-picker-a button, #sm-player-picker-a .sm-chip, #sm-player-picker-a > *', null, 'pick-golfer-1', { index: 0, settle: 300 });
        await s.tap('#sm-player-picker-a button, #sm-player-picker-a .sm-chip, #sm-player-picker-a > *', null, 'pick-golfer-2', { index: 1, settle: 300 });
        await s.tap('#sm-save-btn', null, 'start-action', { settle: 2500 });
        await backFromMatches(s);
        return 'side';
    },
    nassau: async (s) => {
        await s.tap('#fd-addgame [data-ag-q="nassau"]', null, 'nassau', { settle: 1500 });
        if (await playersFirst(s, GOLFERS, 'Nassau')) await s.waitNav(/index\.html\?game=/, 15000);
        await s.waitNav("!!document.getElementById('fd-ag-cta')", 12000);
        await s.mark('nassau-config');
        await s.tap('#fd-ag-cta', null, 'add-nassau', { wait: /sidematches\.html/ });
        await s.waitNav("!!document.getElementById('sm-save-btn')", 12000);
        await s.mark('nassau-sidebets');
        await s.tap('#sm-save-btn', null, 'start-action', { settle: 2500 });
        await backFromMatches(s);
        return 'nassau';
    },
    // FLIGHTS: there is no "flights" game - the Players step's One field | Flights (A/B) switch.
    // From GPS: Games -> Add a game has no flights row; the golfer goes Card -> ≡ Round Menu ->
    // Edit round setup -> Players.
    flights: async (s) => {
        const rows = await s.j.evaluate("Array.prototype.map.call(document.querySelectorAll('#fd-addgame .ag-row, #fd-addgame .ag-tile'), function (b) { return b.textContent; }).join(' | ')");
        if (!/flight/i.test(rows)) s.find('MEDIUM', 'Flights cannot be found from the Games pill', 'Add a game lists no Flights (A/B); it lives on Round Setup > Players, reached only by Card > ≡ Round Menu > Edit round setup', { known: 'K-FLIGHT' });
        // KP pool / Weekly game is the game flights split; Players first is where the switch is.
        await s.tap('#fd-addgame [data-ag-all="kp"]', null, 'kp-weekly', { settle: 1500 });
        await s.waitNav("!!document.getElementById('fd-need')", 15000);
        await s.mark('players-first');
        await s.tap('#flights-label-on', null, 'flights-on', { settle: 600 });
        await addGolfers(s, GOLFERS);
        // Two in each flight: the 3rd and 4th golfer to B (each row's A/B button).
        for (const i of [2, 3]) await s.tap('#player-list .p-flight-input', null, 'flight-b', { index: i, settle: 300 });
        await s.mark('flights-set');
        await s.tap('#fd-need .fd-need-go', null, 'save-golfers', { settle: 1500 });
        await s.waitNav(/step=money/, 15000);
        await s.mark('weekly-game-open');
        await s.type('#mp-kp-amount', 0, '60', 'KP $'); await s.type('#mp-net-amount', 0, '60', 'net $');
        await saveRoundSetup(s);
        return 'flights';
    }
};
// Side Matches' Save ("Start Action") leaves the golfer on the Matches page; the round is a tap away.
async function backFromMatches(s) {
    await s.waitNav(3000);
    const u = await s.j.evaluate('document.URL');
    if (/sidematches\.html/.test(u)) {
        const got = await s.j.tap('button', /^Got It$/, { settleMs: 500 });
        if (got) {
            s.taps++; await s.mark('got-it');
            s.find('LOW', '"Side Match Created!" sheet to dismiss after every side game', 'one more tap; it says "Send each player their own group\'s scorecard link" and then "Only one group in this round" - the first sentence is not true here');
        }
        s.find('HIGH', 'a game saved on Side Matches stays on the Matches page instead of going back to the round', 'Round Setup\'s Save comes back to the round (and the hole); Side Matches\' "Start Action" does not - one more tap (Scorecard / Back) and a screen', { known: 'K-SMBACK' });
        await s.tap('a, button', /Scorecard/, 'scorecard-tab', { wait: /index\.html\?game=/ });
    }
}
// What a saved game looks like in the round.
function gameSaved(game, r) {
    if (!r) return false;
    const inst = r.additionalGameInstances || {}, sm = r.sideMatches || {};
    const smFmt = Object.keys(sm).map((k) => sm[k] && (sm[k].format || sm[k].type));
    switch (game) {
        case 'skins': return Number(r.skinsBuyIn) > 0 || Object.keys(inst).some((k) => inst[k] && inst[k].format === 'skins') || !!(r.additionalGames && r.additionalGames.skins);
        case 'kp': case 'weekly': return !!(r.moneyPool && (r.moneyPool.enabled || r.moneyPool.buyIn));
        case 'flights': return !!(r.moneyPool && (r.moneyPool.enabled || r.moneyPool.buyIn)) && (r.players || []).some((p) => p && p.flight === 'B');
        case 'nassau': return smFmt.some((f) => /nassau/i.test(String(f)));
        case 'dots': return smFmt.length > 0 || Number(r.dotPointVal) > 0 || Object.keys(inst).some((k) => inst[k] && /dot/.test(inst[k].format));
        case 'side': return smFmt.length > 0;
        default: return false;
    }
}

async function pathA(game, returning) {
    const s = new Sim('A-' + game + (returning ? '-ret' : '-new'), { returning, meName: returning ? 'Manny Orozco' : null });
    const out = { };
    try {
        await s.start();
        await startGpsRound(s, 'caledonia');
        await openGames(s);
        const g = await GAMES[game](s);
        await backOnRound(s, 1);
        const r = await s.round();
        if (!gameSaved(g, r)) s.find('BLOCKER', game + ' was not saved on the round', JSON.stringify({ skinsBuyIn: r && r.skinsBuyIn, moneyPool: r && r.moneyPool, sideMatches: r && Object.keys(r.sideMatches || {}), inst: r && Object.keys(r.additionalGameInstances || {}) }).slice(0, 300));
        await checkPlayers(s, 4);
        const me = returning ? 'Me' : 'Me';
        out.score = await firstScore(s, me);
    } catch (e) {
        if (!/^dead end|no course|no add game/.test(e.message)) s.find('BLOCKER', 'the simulation stopped', String(e.message).slice(0, 200));
    } finally { await s.close(); }
    return Object.assign(s.summary(), out);
}

// ---- W: TOMORROW'S ROUND ---------------------------------------------------------------------------
// 20 golfers, 5 groups (blank lines), flights A/B (the letter before each name), one paste.
const TWENTY = [
    ['A', 'Manny Orozco', 9], ['A', 'Joe Russo', 6], ['B', 'Randy Tate', 18], ['B', 'Mike Lane', 21],
    ['A', 'Tom Hill', 4], ['A', 'Sam Diaz', 8], ['B', 'Lou Park', 16], ['B', 'Vic Cruz', 24],
    ['A', 'Al Moss', 3], ['A', 'Ray Kim', 10], ['B', 'Ed Fox', 15], ['B', 'Gus Bell', 20],
    ['A', 'Hal Ruiz', 7], ['A', 'Ike Shaw', 5], ['B', 'Jim Ward', 17], ['B', 'Kip Lowe', 22],
    ['A', 'Len Ortiz', 2], ['A', 'Max Reed', 11], ['B', 'Ned Gray', 19], ['B', 'Otto Dunn', 14]];
const PASTE20 = TWENTY.map((g, i) => g[0] + ' · ' + g[1] + ' ' + g[2] + ((i % 4 === 3 && i < 19) ? '\n' : '')).join('\n');
async function pathW() {
    const s = new Sim('W-dobson', { returning: true, meName: 'Manny Orozco', at: DOB });
    const out = {};
    try {
        await s.start();
        await startGpsRound(s, 'dobson');
        await openGames(s);
        await s.tap('#fd-addgame [data-ag-all="kp"]', null, 'kp-weekly', { settle: 1500 });
        await s.waitNav("!!document.getElementById('fd-need')", 15000);
        await s.mark('players-first');
        // The organizer is golfer 1 ("Me", HCP 0): his own row is renamed by the paste? It is not -
        // the list replaces or adds; read what the app does.
        await s.tap('button', /Paste Player List/, 'paste-player-list', { settle: 800 });
        await s.type('textarea', 0, PASTE20, 'pasted list');
        await s.mark('pasted');
        const offer = await s.j.evaluate("(function(){ var c = document.getElementById('paste-replace-me'); return c ? (c.checked ? 'checked' : 'unchecked') : 'none'; })()");
        out.replaceMeOffer = offer;
        // the preview's add/replace button
        const go = await s.j.tap('button', /^(Add|Replace|Use|Import|Add all|Add \d+)/i, { settleMs: 1200 }) || await s.j.tap('#paste-modal button.btn-primary, .modal button.btn-primary', null, { settleMs: 1200 });
        if (go) { s.taps++; await s.mark('paste-commit'); } else { s.find('BLOCKER', 'dead end: the paste has no button to add the golfers', ''); throw new Error('dead end: paste'); }
        const rows = await s.j.evaluate("JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#player-list .p-name-input'), function (e) { return e.value; }))");
        const names = JSON.parse(rows);
        out.rowsAfterPaste = names.length;
        if (names.indexOf('Me') !== -1) s.find('HIGH', 'the organizer is in the field twice ("Me" and "Manny Orozco") after pasting the list', '21 golfers for a 20-golfer game; "Me" must be deleted by hand (✕) or the pot, flights and groups are wrong', { known: 'K-ME' });
        // delete "Me" the way a golfer would, if it is there
        const meIdx = names.indexOf('Me');
        if (meIdx !== -1) {
            await s.tap('#player-list .btn-del', null, 'delete-me', { index: meIdx, settle: 800 });
            const conf = await s.j.tap('button', /^(Remove|Delete|Yes)/, { settleMs: 600 });
            if (conf) { s.taps++; await s.mark('confirm-delete'); }
        }
        const fl = await s.j.evaluate("JSON.stringify({ on: !!(typeof flightsEnabled !== 'undefined' ? flightsEnabled : null), b: document.querySelectorAll('#player-list [data-flight=\"B\"].on, #player-list [data-flight=\"B\"][aria-pressed=\"true\"], #player-list .flight-b.on').length })");
        out.flightsUi = JSON.parse(fl);
        await s.tap('#fd-need .fd-need-go', null, 'save-golfers', { settle: 1500 });
        await s.waitNav(/step=money/, 15000);
        await s.waitNav("!!(document.getElementById('mp-enabled') || {}).checked", 8000);
        await s.mark('weekly-game-open');
        const math = await s.j.evaluate("(document.getElementById('mp-math') || document.getElementById('mp-pot-line') || {}).textContent || ''");
        out.poolLine = String(math).replace(/\s+/g, ' ').slice(0, 200);
        await saveRoundSetup(s);
        await backOnRound(s, 1);
        const r = await s.round();
        const ps = ((r && r.players) || []).filter((p) => p && p.name);
        const sizes = Array.from(grouping.computeGroupSizes(ps.length, (r && r.groupSizeOverrides) || {}));
        let at = 0; const cut = sizes.map((n) => { const g = ps.slice(at, at + n).map((p) => p.name.split(' ')[0]); at += n; return g; });
        const want = [0, 1, 2, 3, 4].map((g) => TWENTY.slice(g * 4, g * 4 + 4).map((x) => x[1].split(' ')[0]));
        out.groupsSaved = cut.map((g) => g.join('/'));
        if (JSON.stringify(cut) !== JSON.stringify(want)) s.find('BLOCKER', 'the 5 pasted foursomes were not saved as pasted', JSON.stringify(out.groupsSaved), { known: null });
        out.saved = { players: ps.length, flights: { A: ps.filter((p) => p.flight === 'A').length, B: ps.filter((p) => p.flight === 'B').length }, groups: sizes.length, pool: r && r.moneyPool ? { enabled: r.moneyPool.enabled, buyIn: r.moneyPool.buyIn } : null, course: r && r.courseName };
        if (ps.length !== 20) s.find('BLOCKER', 'the weekly game saved ' + ps.length + ' golfers, not 20', JSON.stringify(ps.map((p) => p.name)).slice(0, 300));
        if (out.saved.flights.A !== 10 || out.saved.flights.B !== 10) s.find('BLOCKER', 'flights A/B not 10/10', JSON.stringify(out.saved.flights));
        if (out.saved.groups !== 5) s.find('BLOCKER', 'not 5 groups', JSON.stringify(sizes));
        if (!gameSaved('kp', r)) s.find('BLOCKER', 'the weekly game was not saved', JSON.stringify(r && r.moneyPool));
        out.score = await firstScore(s, 'Manny');
    } catch (e) {
        if (!/^dead end|no course|no add game/.test(e.message)) s.find('BLOCKER', 'the simulation stopped', String(e.message).slice(0, 200));
    } finally { await s.close(); }
    return Object.assign(s.summary(), out);
}

// ---- F: LOCATION DENIED ------------------------------------------------------------------------------
async function pathF(returning) {
    const s = new Sim('F-' + (returning ? 'ret' : 'new'), { returning, geo: GEO_DENIED, meName: returning ? 'Manny Orozco' : null });
    const out = {};
    try {
        await s.start();
        await s.tap('#v-main .hp-door.gps', null, 'gps-door', { wait: 3000 });
        const t = await s.j.evaluate("(document.getElementById('v-gps') || document.body).innerText.replace(/\\s+/g, ' ').slice(0, 400)");
        out.gps1 = t;
        if (!/location|Location|Settings/.test(t)) s.find('HIGH', 'location denied: the course list says nothing about location', t.slice(0, 160), { known: 'K-DENY1' });
        // the golfer searches instead
        const rec = await s.j.tap('#hp-recent-list .hp-row', /Caledonia/, { settleMs: 1200 });
        if (rec) { s.taps++; await s.mark('course-picked'); }
        else {
            await s.type('#hp-q', 0, 'Caledonia', 'search'); await sleep(500);
            await s.tap('#hp-results-list .hp-row', /Caledonia/, 'course-picked', { settle: 1200 });
        }
        await s.tap('#hp-opts [data-o="go"]', null, 'start-round', { wait: /index\.html\?game=/ });
        await sleep(5000);
        let st = await s.noFreeze('the new round, location denied');
        s.code = st.code;
        await s.mark('round-open');
        const msg = await s.j.evaluate("(function(){ var t = document.body.innerText; var m = /[^\\n]*(location|Location)[^\\n]*/.exec(t); return m ? m[0].slice(0, 200) : null; })()");
        out.roundMessage = msg;
        if (st.side === 'gps') {
            const ov = await s.j.evaluate("(document.getElementById('gps-overlay') || {}).innerText || ''");
            if (!/location|Location|Settings/.test(ov)) s.find('HIGH', 'GPS screen with location denied: no message saying location is off and how to turn it on', String(ov).replace(/\s+/g, ' ').slice(0, 160));
        } else {
            // On the card: tapping 📍 GPS says why?
            await s.tap('.gps-side-gps, #fd-gps-btn, button', /GPS/, 'gps-button', { settle: 2500 });
            st = await s.state();
            const ov = await s.j.evaluate("(function(){ var t = (document.getElementById('gps-overlay') || {}).innerText || ''; var n = document.querySelector('.gps-side-note'); return (n && n.style.display !== 'none' ? n.textContent + ' || ' : '') + t; })()");
            out.afterGpsTap = { side: st.side, text: String(ov).replace(/\s+/g, ' ').slice(0, 300) };
            if (!/location|Location|Settings/.test(ov)) s.find('HIGH', 'location denied: 📍 GPS gives no clear message', String(ov).replace(/\s+/g, ' ').slice(0, 160), { known: 'K-DENY2' });
        }
        // Games still work: Skins with three more golfers.
        await openGames(s);
        await GAMES.skins(s);
        await backOnRound(s, 1);
        const r = await s.round();
        if (!gameSaved('skins', r)) s.find('BLOCKER', 'location denied: skins was not saved', '');
        await checkPlayers(s, 4);
        out.score = await firstScore(s, 'Me');
    } catch (e) {
        if (!/^dead end|no course|no add game/.test(e.message)) s.find('BLOCKER', 'the simulation stopped', String(e.message).slice(0, 200));
    } finally { await s.close(); }
    return Object.assign(s.summary(), out);
}

// ---- RUN ----------------------------------------------------------------------------------------------
// The ranked list handed back (2026-10-18): a finding with one of these keys is KNOWN, not a regression.
const KNOWN = new Set(['K-JOIN', 'K-SIDE', 'K-SKIN$', 'K-FLIGHT', 'K-DENY1', 'K-DENY2', 'K-SMBACK']);
(async () => {
    const plan = [];
    for (const g of ['skins', 'dots', 'kp', 'weekly', 'side', 'nassau', 'flights']) {
        plan.push(['A-' + g + '-new', () => pathA(g, false)]);
        plan.push(['A-' + g + '-ret', () => pathA(g, true)]);
    }
    plan.push(['W-dobson', pathW]);
    plan.push(['F-new', () => pathF(false)]);
    plan.push(['F-ret', () => pathF(true)]);
    const results = [];
    for (const [id, fn] of plan) {
        if (ONLY && !ONLY.includes(id)) continue;
        const t0 = Date.now();
        const r = await fn();
        r.seconds = Math.round((Date.now() - t0) / 1000);
        results.push(r);
        process.stderr.write(id + ': ' + r.taps + ' taps, ' + r.screens + ' screens, ' + r.findings.length + ' findings (' + r.seconds + 's)\n');
    }
    const all = [].concat(...results.map((r) => r.findings));
    all.sort((a, b) => SEV.indexOf(a.sev) - SEV.indexOf(b.sev));
    const regressions = all.filter((f) => (f.sev === 'BLOCKER' || f.sev === 'HIGH') && !(f.known && KNOWN.has(f.known)));
    const out = { layout: LAYOUT, viewport: VP, shots: SHOTS,
        paths: results.map((r) => ({ path: r.path, taps: r.taps, typedFields: r.typedFields, screens: r.screens, findings: r.findings.length, steps: r.steps, extra: Object.fromEntries(Object.entries(r).filter(([k]) => !['path', 'taps', 'typedFields', 'screens', 'steps', 'findings'].includes(k))) })),
        counts: SEV.reduce((m, k) => (m[k] = all.filter((f) => f.sev === k).length, m), {}),
        regressions: regressions.length, findings: all };
    console.log(JSON.stringify(out, null, 1));
    process.exit(regressions.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
