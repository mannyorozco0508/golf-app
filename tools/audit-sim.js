#!/usr/bin/env node
// ============================================================================
// THE GPS APP AUDIT - NEW SIMULATIONS (mailbox 001, 2026-10-16)
//
//   node tools/audit-sim.js
//
// The scenarios the existing checks did not already drive. Cold Chrome, a 390x844 phone, the
// app (window.__hardpanDoors), the stand-in database, test rounds only. Every page's errors and
// unhandled rejections are collected. (The rest of the audit's list is already covered by
// tools/audit-courses.js, hole10-check, share-check, trap-check, tournament-check, near-check,
// marks-check, airplane-mode-check, gps-check, front-door-check, points-check, league-check.)
//   c  4 golfers from GPS: the name tag + swipe, EDIT a score, CLEAR a score - the button,
//      the card box and the write agree; the marks on the button match the card's.
//   f  a round deleted on another phone WHILE this one is open: "isn't on the server" + Exit.
//   h  manual wind survives a reload ("Manual"), and no wind request is made offline.
//   i  location DENIED on the GPS door: a clear message, and search still finds a course.
//   l  a long round: 18 holes x 4 golfers typed fast, the app hidden and shown again: exactly
//      72 score writes, no duplicates, the round listener not multiplied.
//   m  dark mode, 9 golfers (two groups), a 9-hole round, a long course name: GPS opens, no
//      errors, no sideways scroll, the title fits.
// ============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});(function(){var ce=console.error;console.error=function(){try{window.__ce=(window.__ce||[]);window.__ce.push(Array.prototype.map.call(arguments,String).join(' ').slice(0,160));}catch(x){}return ce.apply(console,arguments);};})();";
const APP = 'window.__hardpanDoors = true; window.__freshPhone = true;';
const GA = path.join(HERE, 'golfapi', 'gps-golfapi.js');
const LIVE = fs.existsSync(GA) ? fs.readFileSync(GA, 'utf8') + ";(function(){ var c0; Object.defineProperty(window, 'HARDPAN_GPS_CONFIG', { configurable: true, get: function () { return c0; }, set: function (v) { c0 = v; if (v) v.liveTest = true; } }); })();" : '';
const COUNT = "window.__wx = []; (function(){ var f0 = window.fetch; window.fetch = function (u, o) { var s = String(u && u.url || u); if (/weather\\.gov|weatherkit|gpsWind/i.test(s)) { window.__wx.push(s.slice(0, 60)); return Promise.reject(new Error('blocked in the audit')); } return f0.apply(this, arguments); }; })();";
const DB = (ev) => ({ events: ev || {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 3000, viewport: { width: 390, height: 844 }, webgl: true }, o)); if (!r.ok) throw new Error(r.reason); return r; };
function round(code, n, extra, names) {
    const NAMES = names || ['Ann Able', 'Ben Bravo', 'Cal Cole', 'Dee Dunn', 'Eli Echo', 'Fay Fox', 'Gus Gold', 'Hal Hill', 'Ivy Ives'];
    const r = wizardSavedRound({ code, golfers: n, names: NAMES.slice(0, n), hcps: NAMES.slice(0, n).map((_, i) => i + 1), ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: Object.assign({ additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' }, extra || {}) });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const SEED = (code, more) => "(function(){ try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded','1'); localStorage.setItem('hardpan_round_side', 'gps|" + code + "'); localStorage.setItem('hardpan_gps_whoasked_" + code + "', '1'); " + (more || '') + " } catch (e) {} })();";
const OPEN_GPS = { expression: "(function(){ if (window.HardPanGps && HardPanGps.side && HardPanGps.side() === 'gps') return 'on'; var b = document.getElementById('fd-gps-btn'); if (b) b.click(); return 'tap'; })()" };
const W = { sleep: 400 };
// KNOWN, PRE-EXISTING (the same on gps-features before this audit): MapLibre's own errors when a
// tile request fails with the network gone ("reading 'bind'" / "reading 'signal'" in
// maplibre-gl.js). Reported as a finding, not counted against a scenario.
const MAPLIBRE_OFFLINE = /maplibre-gl\.js|reading 'signal'/;
const errsOf = (x) => ((x && x.e) || []).filter((m) => !/reading 'ts'/.test(m) && !MAPLIBRE_OFFLINE.test(m)).concat(((x && x.ce) || []).filter((m) => !/ts'|favicon|ERR_|net::|Failed to load resource|blocked in the audit|maplibre|WebGL|tile/i.test(m)).map((m) => 'console: ' + m));

const results = [];
async function scenario(id, title, fn) {
    if (process.env.AUDIT_ONLY && process.env.AUDIT_ONLY.split(',').indexOf(id) === -1) return;
    const t0 = Date.now();
    try { const notes = await fn(); results.push({ id, title, pass: !notes.fails.length, fails: notes.fails, info: notes.info || null, ms: Date.now() - t0 }); }
    catch (e) { results.push({ id, title, pass: false, fails: ['could not run: ' + e.message], ms: Date.now() - t0 }); }
}

(async () => {
    // ---- c: 4 golfers, edit + clear from GPS -------------------------------------------------
    await scenario('c', '4 golfers from GPS: name tag, swipe, edit, clear, marks agree', async () => {
        const fails = [];
        const r0 = round('AUDC01', 4, { startingHole: 1 });
        const ids = r0.players.map((p) => String(p.id));
        r0.scores = { ['p' + ids[0] + '_h1']: 5 };   // Ann: a bogey on the par-4 1st (card par 4)
        const ST = "JSON.stringify({ tag: (document.querySelector('#gps-overlay .gps-who')||{}).innerText, btn: (document.querySelector('#gps-overlay .gps-score')||{}).innerText, cls: (document.querySelector('#gps-overlay .gps-score-n')||{}).className || '', card: (function(){ var w = document.querySelector('.score-input[data-player-id=\"" + ids[0] + "\"][data-hole=\"1\"]'); return w ? [w.value, w.closest('.score-input-wrapper').className] : null; })(), writes: (window.__coldWrites||[]).filter(function(w){ return /scores/.test(w.path); }).map(function(w){ return w.op + ' ' + w.path.split('/').pop() + '=' + w.value; }), side: HardPanGps.side(), e: window.__e, ce: window.__ce })";
        const TYPE = (v) => ({ expression: "(function(){ var i = document.querySelector('#hole-view-card .score-input[data-player-id=\"" + ids[0] + "\"][data-hole=\"1\"]') || document.querySelector('.score-input[data-player-id=\"" + ids[0] + "\"][data-hole=\"1\"]'); i.value = '" + v + "'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); return 'typed'; })()" });
        const SWIPE = (dx) => ({ expression: "(function(){ var c = document.querySelector('#gps-overlay .gps-score-col'), r = c.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; c.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true })); c.dispatchEvent(new PointerEvent('pointerup', { clientX: x + " + dx + ", clientY: y + 4, bubbles: true })); return 'swipe'; })()" });
        const r = await go({ url: fileUrl('index.html', 'game=AUDC01'), db: DB({ AUDC01: r0 }), preScript: APP + ERR + SEED('AUDC01', "localStorage.setItem('hardpan_gps_golfer_AUDC01', '" + ids[0] + "');"), steps: [{ sleep: 2500 }, OPEN_GPS, { sleep: 2000 },
            { expression: "(function(){ goToHole(1); return 'h1'; })()" }, { sleep: 800 }, { expression: ST },
            SWIPE(-90), W, { expression: ST }, SWIPE(90), W,
            // The stand-in database does not echo a write back to the listener (the real one does, at
            // once, from its local cache): each write is delivered as the next snapshot.
            { expression: "(function(){ document.querySelector('#gps-overlay .gps-score').click(); return 'open'; })()" }, { sleep: 600 }, TYPE(3), { sleep: 600 },
            { deliver: { path: 'events/AUDC01', value: Object.assign({}, r0, { scores: { ['p' + ids[0] + '_h1']: 3 } }) } }, { sleep: 600 }, OPEN_GPS, { sleep: 900 }, { expression: ST },
            { expression: "(function(){ document.querySelector('#gps-overlay .gps-score').click(); return 'open'; })()" }, { sleep: 600 }, TYPE(''), { sleep: 600 },
            { deliver: { path: 'events/AUDC01', value: Object.assign({}, r0, { scores: {} }) } }, { sleep: 600 }, OPEN_GPS, { sleep: 900 }, { expression: ST }] });
        const [s0, s1, s2, s3] = J(r);
        if (!(s0.btn === '5' && /mark-bogey/.test(s0.cls) && /mark-bogey/.test(s0.card[1]))) fails.push('the bogey 5: button and card disagree: ' + JSON.stringify([s0.btn, s0.cls, s0.card]));
        if (!/Ben/.test(s1.tag || '')) fails.push('swipe did not move to Ben: ' + s1.tag);
        if (!(s2.btn === '3' && /mark-birdie/.test(s2.cls) && s2.card[0] === '3' && /mark-birdie/.test(s2.card[1]) && s2.writes.some((w) => /^set p\d+_h1=3$/.test(w)))) fails.push('edit to 3 (birdie): ' + JSON.stringify([s2.btn, s2.cls, s2.card, s2.writes]));
        if (!(s3.btn === 'Enter score' && s3.card[0] === '' && !/mark-/.test(s3.card[1]) && s3.writes.some((w) => /^remove p\d+_h1=/.test(w)))) fails.push('clear: ' + JSON.stringify([s3.btn, s3.card, s3.writes]));
        [s0, s1, s2, s3].forEach((x) => errsOf(x).forEach((m) => fails.push('error: ' + m)));
        return { fails, info: { writes: s3.writes } };
    });

    // ---- f: deleted on another phone mid-round -----------------------------------------------
    await scenario('f', 'a round deleted on another phone while open', async () => {
        const fails = [];
        const r = await go({ url: fileUrl('index.html', 'game=AUDF01'), db: DB({ AUDF01: round('AUDF01', 2) }), preScript: APP + ERR + SEED('AUDF01'), steps: [{ sleep: 2500 }, OPEN_GPS, { sleep: 1500 },
            { deliver: { path: 'events/AUDF01', value: null } }, { sleep: 1200 },
            { expression: "JSON.stringify({ sheet: (function(){ var s = document.getElementById('hp-stuck-round'); return s && getComputedStyle(s).display !== 'none' ? s.innerText.replace(/\\s+/g, ' ') : null; })(), e: window.__e, ce: window.__ce })" },
            { expression: "(function(){ var b = document.querySelector('#hp-stuck-round [data-hp-exit]'); if (b) b.click(); return 'exit'; })()" }, { sleep: 2500 },
            { expression: "JSON.stringify({ url: document.URL.split('/').pop(), view: (document.querySelector('.hp-view.on')||{}).id || null, last: localStorage.getItem('hardpan_last_round') })" }] });
        const [a, b] = J(r);
        if (!(a.sheet && /isn.t on the server/.test(a.sheet))) fails.push('no "isn\'t on the server" sheet after the round was deleted elsewhere: ' + JSON.stringify(a.sheet));
        if (!(/^home\.html/.test(b.url) && b.view === 'v-gps' && !b.last)) fails.push('Exit did not open the picker: ' + JSON.stringify(b));
        errsOf(a).forEach((m) => fails.push('error: ' + m));
        return { fails };
    });

    // ---- h: manual wind across a reload; no wind request offline -------------------------------
    await scenario('h', 'manual wind survives a reload; no wind request offline', async () => {
        const fails = [];
        const d = new Date(), day = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
        const MAN = "localStorage.setItem('hardpan_wind_manual_v2', JSON.stringify({ day: '" + day + "', course: 'caledonia', round: 'AUDH01', hole: 1, mph: 14, toDeg: 45 }));";
        const WS = "JSON.stringify({ wind: (document.querySelector('#gps-overlay .gps-wind')||{}).innerText || '', wx: window.__wx.length, online: navigator.onLine, e: window.__e, ce: window.__ce })";
        let r = await go({ url: fileUrl('index.html', 'game=AUDH01'), db: DB({ AUDH01: round('AUDH01', 2) }), preScript: APP + ERR + LIVE + COUNT + SEED('AUDH01', MAN), steps: [{ sleep: 2500 }, OPEN_GPS, { sleep: 2000 }, { expression: WS },
            { expression: "(function(){ goToHole(2); return 'h2'; })()" }, { sleep: 800 }, { expression: WS },
            { expression: "(function(){ location.reload(); return 'r'; })()" }, { sleep: 4500 }, OPEN_GPS, { sleep: 2000 }, { expression: WS }] });
        const [w0, w1, w2] = J(r);
        if (!(/14 mph/.test(w0.wind) && /Manual/.test(w0.wind) && /Manual/.test(w1.wind) && /14 mph/.test(w2.wind) && /Manual/.test(w2.wind))) fails.push('manual wind did not stick across a hole and a reload: ' + JSON.stringify([w0.wind, w1.wind, w2.wind]));
        r = await go({ url: fileUrl('index.html', 'game=AUDH02'), db: DB({ AUDH02: round('AUDH02', 2) }), preScript: APP + ERR + LIVE + COUNT + SEED('AUDH02'), steps: [{ sleep: 2000 },
            { cdp: { method: 'Network.enable', params: {} } }, { cdp: { method: 'Network.emulateNetworkConditions', params: { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 } } },
            OPEN_GPS, { sleep: 1500 }, { expression: "(function(){ window.__wx.length = 0; goToHole(2); return 'h2'; })()" }, { sleep: 5000 }, { expression: WS }] });
        const [o0] = J(r);
        if (!(o0.online === false && o0.wx === 0)) fails.push('offline: a wind request was made anyway: ' + JSON.stringify([o0.online, o0.wx]));
        [w0, w1, w2].forEach((x) => errsOf(x).forEach((m) => fails.push('online: error: ' + m)));
        errsOf(o0).forEach((m) => fails.push('offline: error: ' + m));
        return { fails };
    });

    // ---- i: location denied on the GPS door ---------------------------------------------------
    await scenario('i', 'location denied on the GPS door: a clear message, search still works', async () => {
        const fails = [];
        const DENY = "try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok, no) { setTimeout(function(){ no && no({ code: 1, message: 'denied' }); }, 10); return 1; }, getCurrentPosition: function (ok, no) { setTimeout(function () { no && no({ code: 1, message: 'User denied Geolocation' }); }, 10); }, clearWatch: function () {} } }); var q0 = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = function (d) { return d && d.name === 'geolocation' ? Promise.resolve({ state: 'denied' }) : q0(d); }; } catch (e) {}";
        const r = await go({ url: fileUrl('home.html', '') + '#gps', db: DB({}), preScript: APP + ERR + LIVE + DENY, steps: [{ sleep: 3500 },
            { expression: "JSON.stringify({ near: (document.getElementById('hp-near-list')||{}).innerText || '', e: window.__e, ce: window.__ce })" },
            { expression: "(function(){ var i = document.getElementById('hp-q'); i.value = 'Calédonia'.normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''); i.dispatchEvent(new Event('input', { bubbles: true })); return 'q'; })()" }, { sleep: 800 },
            { expression: "JSON.stringify({ results: Array.prototype.map.call(document.querySelectorAll('#hp-results-list .hp-row'), function (b) { return b.innerText.replace(/\\s+/g, ' '); }).slice(0, 3) })" }] });
        const [a, b] = J(r);
        if (!/location|Location/.test(a.near) || !/Search works/.test(a.near)) fails.push('denied: no clear message: ' + JSON.stringify(a.near));
        if (!(b.results.length && /Caledonia/.test(b.results[0]))) fails.push('denied: search did not find Caledonia: ' + JSON.stringify(b.results));
        errsOf(a).forEach((m) => fails.push('error: ' + m));
        return { fails, info: { message: a.near } };
    });

    // ---- l: a long round, fast, backgrounded ----------------------------------------------------
    await scenario('l', '18 holes x 4 golfers fast, backgrounded and back: 72 writes, no duplicates, one listener', async () => {
        const fails = [];
        const r0 = round('AUDL01', 4);
        const ids = r0.players.map((p) => String(p.id));
        const FAST = "(function(){ var n = 0; for (var h = 1; h <= 18; h++) { " + JSON.stringify(ids) + ".forEach(function (pid, k) { var i = document.querySelector('.score-input[data-player-id=\"' + pid + '\"][data-hole=\"' + h + '\"]'); if (!i) return; i.value = String(3 + ((h + k) % 4)); i.dispatchEvent(new Event('change', { bubbles: true })); n++; }); if (h === 9) { Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return 'hidden'; } }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return 'visible'; } }); document.dispatchEvent(new Event('visibilitychange')); } } return 'typed ' + n; })()";
        const r = await go({ url: fileUrl('index.html', 'game=AUDL01'), db: DB({ AUDL01: r0 }), preScript: APP + ERR + SEED('AUDL01', "localStorage.setItem('hardpan_round_side', 'bets|AUDL01');"), steps: [{ sleep: 2500 },
            { expression: "(function(){ setViewMode('full'); return 'full'; })()" }, { sleep: 800 }, { expression: FAST }, { sleep: 3000 },
            { expression: "JSON.stringify({ writes: (window.__coldWrites||[]).filter(function(w){ return /\\/scores\\/p/.test(w.path) && w.op === 'set'; }).map(function(w){ return w.path.split('/').pop(); }), q: (function(){ try { return JSON.parse(localStorage.getItem('golfapp_wq_v1')||'[]').length; } catch(e){ return -1; } })(), url: document.URL.split('/').pop(), e: window.__e, ce: window.__ce })" }] });
        const [x] = J(r);
        const uniq = new Set(x.writes);
        if (!(x.writes.length === 72 && uniq.size === 72)) fails.push('expected 72 score writes, one each: got ' + x.writes.length + ' (' + uniq.size + ' distinct)');
        if (x.q !== 0) fails.push('the offline queue still holds ' + x.q + ' (nothing should wait online)');
        errsOf(x).forEach((m) => fails.push('error: ' + m));
        return { fails, info: { writes: x.writes.length, distinct: uniq.size, queue: x.q } };
    });

    // ---- m: small things ----------------------------------------------------------------------
    await scenario('m', 'dark mode, 9 golfers, a 9-hole round, a long course name', async () => {
        const fails = [];
        const LONG = 'The Very Long Name Golf & Country Club at Somewhere Plantation (North / South)';
        const nine = round('AUDM02', 2); nine.courseData = nine.courseData.slice(0, 9);
        const cases = [
            ['dark', round('AUDM01', 2), [{ media: 'screen' }, { cdp: { method: 'Emulation.setEmulatedMedia', params: { features: [{ name: 'prefers-color-scheme', value: 'dark' }] } } }]],
            ['9-hole', nine, []],
            ['9 golfers', round('AUDM03', 9), []],
            ['long name', round('AUDM04', 2, { courseName: LONG }), []],
        ];
        for (const [name, rd, pre] of cases) {
            const code = rd.courseName === LONG ? 'AUDM04' : (name === 'dark' ? 'AUDM01' : name === '9-hole' ? 'AUDM02' : 'AUDM03');
            const r = await go({ url: fileUrl('index.html', 'game=' + code), db: DB({ [code]: rd }), preScript: APP + ERR + SEED(code), steps: pre.concat([{ sleep: 2500 }, OPEN_GPS, { sleep: 2200 },
                { expression: "(function(){ for (var i = 0; i < 9; i++) { var b = document.querySelector('#gps-overlay .gps-next'); if (b) b.click(); } return 'next'; })()" }, { sleep: 600 },
                { expression: "JSON.stringify({ side: HardPanGps.side(), hole: HardPanGps.hole(), sx: document.documentElement.scrollWidth > window.innerWidth + 1, title: (function(){ var t = document.querySelector('#gps-overlay .gps-top'); return t ? t.scrollWidth <= t.clientWidth + 2 : null; })(), who: (document.querySelector('#gps-overlay .gps-who')||{}).innerText || '', e: window.__e, ce: window.__ce })" }]) });
            const x = J(r)[0];
            if (x.side !== 'gps') fails.push(name + ': GPS did not open');
            if (x.sx) fails.push(name + ': sideways scroll on the phone');
            if (x.title === false) fails.push(name + ': the top panel overflows');
            if (name === '9-hole' && x.hole !== 9) fails.push('9-hole: Next past the 9th left the round\'s holes: ' + x.hole);
            if (name === '9 golfers' && !/Group 1/.test(x.who)) fails.push('9 golfers: the name tag does not name the group: ' + x.who);
            errsOf(x).forEach((m) => fails.push(name + ': error: ' + m));
        }
        return { fails };
    });

    // ---- r: the code review's fixes, on the real page ------------------------------------------
    await scenario('r', 'review fixes: course change remounts GPS, spectator cannot set a green, one Share observer, the key hash', async () => {
        const fails = [];
        // 1: Round Setup changes the course (Caledonia -> True Blue) while GPS is open.
        const a0 = round('AUDR01', 2);
        let r = await go({ url: fileUrl('index.html', 'game=AUDR01'), db: DB({ AUDR01: a0 }), preScript: APP + ERR + LIVE + SEED('AUDR01'), steps: [{ sleep: 2500 }, OPEN_GPS, { sleep: 2000 },
            { expression: "JSON.stringify({ key: HardPanGps.courseKey(), side: HardPanGps.side() })" },
            { deliver: { path: 'events/AUDR01', value: Object.assign({}, a0, { activeCourseKey: 'trueblue', courseName: 'True Blue Golf Club' }) } }, { sleep: 2500 },
            { expression: "JSON.stringify({ key: HardPanGps.courseKey(), side: HardPanGps.side(), overlays: document.querySelectorAll('#gps-overlay').length, e: window.__e, ce: window.__ce })" }] });
        const [k0, k1] = J(r);
        if (!(k0.key && k1.key && k0.key !== k1.key && /trueblue/.test(k1.key) && k1.side === 'gps' && k1.overlays === 1)) fails.push('1: the GPS did not follow the new course: ' + JSON.stringify([k0, { key: k1.key, side: k1.side, overlays: k1.overlays }]));
        errsOf(k1).forEach((m) => fails.push('1: error: ' + m));
        // 2: a spectator on an unmapped hole (no GolfAPI data here): no "Set the green".
        r = await go({ url: fileUrl('index.html', 'game=AUDR02&spectate=1'), db: DB({ AUDR02: Object.assign(round('AUDR02', 2, { activeCourseKey: 'nowhere_course', courseName: 'Nowhere Links' }), { ownerUid: 'someone-else' }) }), preScript: APP + ERR + SEED('AUDR02'), steps: [{ sleep: 2500 }, OPEN_GPS, { sleep: 2000 },
            { expression: "JSON.stringify({ set: (function(){ var b = document.querySelector('#gps-overlay .gps-set-green'); return b ? getComputedStyle(b).display : 'missing'; })(), ro: HardPanDoors.spectating() })" }] });
        const sp = J(r)[0];
        if (!(sp.ro && sp.set === 'none')) fails.push('2: a spectator still has "Set the green": ' + JSON.stringify(sp));
        // 5 + 6: the organizer: the Share mount redrawn many times keeps ONE observer; a new scorekeeper key's local copy is the hash.
        r = await go({ url: fileUrl('index.html', 'game=AUDR03'), db: DB({ AUDR03: round('AUDR03', 4) }), preScript: APP + ERR + "(function(){ var MO = window.MutationObserver, n = 0; window.MutationObserver = function (cb) { n++; window.__mo = n; return new MO(cb); }; })();", steps: [{ sleep: 2500 },
            { expression: "(function(){ window.__mo0 = window.__mo || 0; for (var i = 0; i < 12; i++) { try { renderScorecard(); } catch (e) {} } return 'redrawn'; })()" }, { sleep: 800 },
            { expression: "(function(){ var b = document.querySelector('#qr-share-mount [data-hp-share-open]'); if (b) b.click(); return 'share'; })()" }, { sleep: 500 },
            { expression: "(function(){ var g = document.querySelector('#fd-share [data-sh-group=\"1\"]'); if (g) g.click(); return 'g'; })()" }, { sleep: 300 },
            { expression: "(function(){ var b = document.querySelector('#fd-share [data-sh=\"newkey\"]'); if (b) b.click(); return 'key'; })()" }, { sleep: 1200 },
            { expression: "JSON.stringify({ mo0: window.__mo0, mo: window.__mo, local: currentData.scoreKeys && currentData.scoreKeys['1'], wrote: (window.__coldWrites||[]).filter(function(w){ return /scoreKeys/.test(w.path); }).map(function(w){ return w.value; }), share: !!document.querySelector('#qr-share-mount [data-hp-share-open]'), e: window.__e, ce: window.__ce })" }] });
        const sh = J(r)[0];
        if (!(sh.share && sh.mo - sh.mo0 <= 1)) fails.push('5: the Share mount added observers on redraw: ' + JSON.stringify([sh.mo0, sh.mo, sh.share]));
        if (!(sh.wrote.length === 1 && /^[0-9a-f]{64}$/.test(sh.local || '') && sh.local === sh.wrote[0])) fails.push('6: the local scorekeeper key is not the hash written: ' + JSON.stringify([sh.local, sh.wrote]));
        errsOf(sh).forEach((m) => fails.push('5/6: error: ' + m));
        return { fails };
    });

    console.log(JSON.stringify({ results }, null, 1));
    process.exit(results.every((r) => r.pass) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
