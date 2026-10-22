// ============================================================================
// THE GPS COURSE CHECK (URGENT-020, Manny 2026-10-20: permanent - run before ANY "READY").
//
// For each course: (1) search + NEAR YOU find it once (no duplicates; URGENT-060: NEAR YOU = 3 rows, on
// the course a picked "You're here" row, off it the course may come from search only); (2) tees with real
// names / yards; (3) the hole card loads (pars + HCP for 18); (4) the GPS opens with a green
// middle yardage on hole 1; (5) + Bet opens. Real Chrome, iPhone size, THE PHONE'S GPS RULES
// (gps-config osm off, live on: GolfAPI only - the desktop default is OpenStreetMap and hides
// phone-only failures), the LIVE course data (read-only dumps, stubbed into the page - nothing
// is written anywhere).
//
//   node tools/gps-course-check.js <dir>      <dir> holds global_courses.json, gps_links.json,
//                                             gps_courses.json (firebase database:get dumps)
// Runs on the BUILT app folder (gps-beta/www, or WWW=...) - what Cmd+R installs. Prints a markdown
// table; exit 1 on any fail.
//
// (9, URGENT-026) THE TEE TARGET IN THE FAIRWAY: on every par 4 / 5 with fairway data, the default tee
// target (HardPanGps.teeTargets - the same gps-geo.teeShot the map uses, the golfer's driver) lies
// inside a fairway ring. Holes with NO path data are LISTED ("no fairway data"), not failed: their
// target stays at the pre-023c default on the straight line.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { openJourney, fileUrl } = require('./lib/journey.js');
const { iapStub } = require('./lib/iap-stub.js');

// THE BUILD BEING HANDED OVER: the Cmd+R web folder (gps-beta/www - GPS_DEV_PRO, the GolfAPI file), not the repo.
const WWW = process.env.WWW || path.join(__dirname, '..', 'gps-beta', 'www');
const wwwUrl = (page, q) => 'file://' + path.join(WWW, page) + (q ? '?' + q : '');
const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/gps-course-check.js <dumps dir>'); process.exit(2); }
const rd = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) || {};
const DB = { events: {}, global_courses: rd('global_courses.json'), gps_links: rd('gps_links.json'), gps_courses: rd('gps_courses.json'), course_gps: fs.existsSync(path.join(dir, 'course_gps.json')) ? rd('course_gps.json') : {}, trips: {}, tournaments: {}, organizers: {} };
if (!fs.existsSync(path.join(WWW, 'admin.html'))) { console.error('no build at ' + WWW + ' - run tools/build-gps-app.js first'); process.exit(2); }
if (!fs.existsSync(path.join(WWW, 'gps-golfapi.js'))) console.error('WARNING: the build has no gps-golfapi.js - the bundled GolfAPI courses are missing from this check');

// name: what the row must match; q: the search; at: [lat, lon] (on the course).
const COURSES = (process.env.ONLY ? null : null) || [
    { label: 'Dobson Ranch', name: /^Dobson Ranch/i, q: 'dobson', at: [33.3753, -111.8793] },
    { label: 'Talking Stick South (Piipaash)', name: /^Talking Stick.*Piipaash/i, q: 'talking stick', at: [33.5399, -111.8704] },
    { label: "Talking Stick O'odham", name: /^Talking Stick.*O.odham/i, q: 'talking stick', at: [33.5440, -111.8745] },
    { label: 'Papago', name: /^Papago/i, q: 'papago', at: [33.4560, -111.9480] },
    { label: 'Legacy', name: /Legacy Golf/i, q: 'legacy', at: [33.3850, -112.0197] },
    { label: 'Caledonia (Myrtle)', name: /^Caledonia/i, q: 'caledonia', at: [33.4528, -79.1547] },
    { label: 'Chambers Bay', name: /^Chambers Bay/i, q: 'chambers', at: [47.2008, -122.5715] },
    // A course with a card and NO greens anywhere: the map must show the COURSE AREA with "Tap the middle
    // of the green" - never the golfer's location (run with the golfer 2 km away).
    { label: 'No greens: Las Colinas', name: /^Las Colinas/i, q: 'las colinas', at: [33.2441784, -111.6180444], noGreens: true, golfer: [33.2620, -111.6180] },
    // (URGENT-060: the golfer ON the course - by MacKay hole 1's tee; the old spot was 1.1 mi south of every hole)
    { label: 'Thistle (MacKay/Cameron)', name: /^Thistle.*MacKay.*Cameron/i, q: 'thistle', at: [33.9051, -78.5447] }
].filter((c) => !process.env.ONLY || new RegExp(process.env.ONLY, 'i').test(c.label));

// The phone's GPS rules: gps-live on (liveTest), loaded on Round Setup too (the app loads it there).
const PHONE = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{liveTest:true,golfapiFile:'gps-golfapi.js'});}});})();"
    + "if (/admin\\.html$/.test(location.pathname)) document.addEventListener('DOMContentLoaded', function () { if (!window.HardPanGpsLive) { var s = document.createElement('script'); s.src = 'gps-live.js'; document.head.appendChild(s); } });";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The stand-in GPS on the round page (as tools/gps-layout-c-check.js): a fix every second at the course.
const GEO = (p) => "if (/index\\.html$/.test(location.pathname)) (function(){ var cur = { lat: " + p[0] + ", lng: " + p[1] + " }, live = {}, n = 1;"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok, err) { var id = n++;"
    + " var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); }; live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; },"
    + " getCurrentPosition: function (ok) { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); }, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";

// SLOW=ms: the course's GPS data (gps_links / gps_courses) arrives late, as on a phone that just set it up.
const SLOWGPS = (ms) => !ms ? '' : "(function(){ var t = setInterval(function () { if (!window.firebase || !firebase.database || firebase.__slowed) return; firebase.__slowed = 1; clearInterval(t); var d0 = firebase.database; firebase.database = function () { var d = d0.apply(this, arguments); if (d.__slow) return d; d.__slow = 1; var r = d.ref; d.ref = function (p) { var x = r.call(d, p), o = x.once; if (/^gps_(courses|links)\\/|^global_courses\\/[^/]+\\/location/.test(String(p))) x.once = function () { var a = arguments; return new Promise(function (res, rej) { setTimeout(function () { o.apply(x, a).then(res, rej); }, " + Number(ms) + "); }); }; return x; }; return d; }; }, 5); })();";

// THE LIVE DATABASE RULES (URGENT-024: the phone failed where this passed - the stub applied none):
// gps_links / gps_courses / course_gps are readable ONE CHILD AT A TIME (auth != null), never whole.
const RULES = "(function(){ var t = setInterval(function () { if (!window.firebase || !firebase.database || firebase.__rules) return; firebase.__rules = 1; clearInterval(t); var d0 = firebase.database; firebase.database = function () { var d = d0.apply(this, arguments); if (d.__rules) return d; d.__rules = 1; var r = d.ref; d.ref = function (p) { var x = r.call(d, p); if (/^\\/?(gps_links|gps_courses|course_gps|gps_meta)\\/?$/.test(String(p))) { x.once = function () { window.__denied = (window.__denied || 0) + 1; return Promise.reject(new Error('PERMISSION_DENIED: Permission denied')); }; x.on = function (ev, ok, bad) { if (typeof bad === 'function') setTimeout(function () { bad(new Error('PERMISSION_DENIED')); }, 0); return ok; }; } return x; }; return d; }; }, 5); })();";

// THE PHONE'S OLD COURSE INDEX (URGENT-024): a name index saved before the Oct 19 hides (version 2,
// with the hidden "Talking Stick Golf Club (Piipaash Course)" etc.) - a phone that had it must not list them.
const OLDINDEX = () => { const names = {}; Object.keys(DB.global_courses).forEach((k) => { const r = DB.global_courses[k]; if (r && r.name) names[k] = r.name; });
    return "try{localStorage.setItem('golfapp-course-index-v1'," + JSON.stringify(JSON.stringify({ v: 2, at: Date.now() - 3600e3, names })) + ");}catch(e){}"; };

async function check(c) {
    const out = { label: c.label, once: '', tees: '', card: '', gps: '', map: '', bet: '', same: '', one: '', fw: '', noFw: [], badge: null, why: [] };
    const VIEW = (process.env.VIEW || '393x852').split('x').map(Number);
    const j = await openJourney({ db: DB, viewport: { width: VIEW[0], height: VIEW[1] }, webgl: true,
        preScript: 'window.__hardpanDoors = true; window.__freshPhone = true;' + iapStub({ active: true }) + PHONE + RULES + OLDINDEX() + SLOWGPS(process.env.SLOW) + GEO(c.golfer || (process.env.AWAY ? process.env.AWAY.split(',').map(Number) : c.at)) + "try{sessionStorage.setItem('hardpan_simple_flow','gps');}catch(e){}" });
    const ev = (x) => j.evaluate(x);
    const until = async (x, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(x)) return true; } catch (e) {} await sleep(250); } return false; };
    try {
        await j.goto(wwwUrl('admin.html', 'start=quick'), 3000);
        await ev("(function(){ try { navigator.geolocation; } catch(e){} return 1; })()");
        await j.cdp('Emulation.setGeolocationOverride', { latitude: c.at[0], longitude: c.at[1], accuracy: 10 });
        await j.cdp('Browser.grantPermissions', { permissions: ['geolocation'] });
        await ev("(function(){ var b=document.querySelector('[data-sf=relocate]'); if(b) b.click(); return 1; })()");
        await until("document.querySelectorAll('#sf [data-sf-course]').length > 0 || /No courses we know/.test((document.getElementById('sf')||{}).innerText||'')", 30000);
        await sleep(2500);
        const re = c.name.source, fl = c.name.flags;
        const near = JSON.parse(await ev("(function(){ var re=new RegExp(" + JSON.stringify(re) + "," + JSON.stringify(fl) + "); var head=(document.querySelector('#sf-course .n')||{}).textContent||''; var rows=Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-course]'), function(b){ return [b.getAttribute('data-sf-course'), (b.querySelector('.n')||{}).textContent||'', /✓ GPS/.test(b.textContent)]; }); var hr=document.querySelector('#sf [data-sf-here]'); return JSON.stringify({ head: head, headKey: document.getElementById('course-select').value, nRows: Array.prototype.filter.call(document.querySelectorAll('#sf .sf-h, #sf [data-sf-course]'), function(){ return 1; }).reduce(function(a,n){ if(n.classList.contains('sf-h')) a.sec=n.textContent; else if(a.sec==='NEAR YOU') a.n++; return a; }, {sec:'', n:0}).n, here: hr ? [hr.getAttribute('data-sf-course'), (hr.querySelector('.n')||{}).textContent||'', /You\u2019re here/.test(hr.textContent), hr.classList.contains('sf-sel'), hr.getAttribute('data-sf-course') === document.getElementById('course-select').value] : null, hits: rows.filter(function(r){return re.test(r[1]);}).concat(re.test(head) ? [[document.getElementById('course-select').value, head, /✓ GPS/.test((document.getElementById('sf-course')||{}).textContent||'')]] : []) }); })()"));
        // Search.
        await ev("(function(){ var i=document.getElementById('sf-q'); i.value=" + JSON.stringify(c.q) + "; i.dispatchEvent(new Event('input',{bubbles:true})); return 1; })()");
        await sleep(1200);
        const found = JSON.parse(await ev("(function(){ var re=new RegExp(" + JSON.stringify(re) + "," + JSON.stringify(fl) + "); return JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-course]'), function(b){ return [b.getAttribute('data-sf-course'), (b.querySelector('.n')||{}).textContent||'', /✓ GPS/.test(b.textContent)]; }).filter(function(r){return re.test(r[1]);})); })()"));
        const nearN = near.hits.length, searchN = found.length;
        out.badge = near.hits.concat(found).some((h) => h[2]);
        const badge = out.badge ? ', ✓ GPS' : ', no ✓ GPS';
        // URGENT-060: NEAR YOU is the 3 closest only (the rest from search). ON the course it must be in NEAR
        // YOU exactly once, with a "You're here" row first, picked; from off the course (the golfer elsewhere)
        // it may have dropped off NEAR YOU (never twice), and search must find it exactly once.
        const onCourse = !c.golfer && !process.env.AWAY;
        const hereOk = !onCourse || (near.here && near.here[2] && near.here[3] && near.here[4]);
        const nearOk = onCourse ? nearN === 1 : nearN <= 1;
        out.once = (nearOk && searchN === 1 && near.nRows <= 3 && hereOk ? 'PASS' : 'FAIL') + ` (near ${nearN}${onCourse ? '' : ' off-course'}, search ${searchN}${badge}${near.here ? ', here: ' + near.here[1] : ''})`;
        if (!nearOk) out.why.push('NEAR YOU lists it ' + nearN + 'x: ' + near.hits.map((h) => h[1]).join(' / '));
        if (near.nRows > 3) out.why.push('NEAR YOU shows ' + near.nRows + ' rows (3 max)');
        if (!hereOk) out.why.push('on the course but no picked "You\u2019re here" row: ' + JSON.stringify(near.here));
        if (searchN !== 1) out.why.push('search lists it ' + searchN + 'x: ' + found.map((h) => h[1] + ' (' + h[0] + ')').join(' / '));
        // Pick it (the GPS row when there are two).
        const pick = (found.filter((h) => h[2])[0] || found[0] || near.hits[0] || [])[0];
        if (!pick) { out.tees = out.card = out.gps = out.bet = 'FAIL'; out.why.push('not found'); return out; }
        await ev("(function(){ var b=document.querySelector('#sf [data-sf-course=\"" + pick + "\"]'); if(b) b.click(); return 1; })()");
        await until("document.querySelectorAll('#sf [data-sf-tee]').length > 0", 15000);
        if (c.nines) for (const [i, side] of [['0', 'front'], ['1', 'back']]) await ev("(function(){ var b=Array.prototype.filter.call(document.querySelectorAll('#sf [data-sf-nine=\"" + side + "\"]'), function(x){ return x.textContent.indexOf(" + JSON.stringify(c.nines[Number(i)]) + ") === 0; })[0]; if(b) b.click(); return 1; })()");
        await sleep(800);
        const tees = JSON.parse(await ev("JSON.stringify(Array.prototype.map.call(document.querySelectorAll('#sf [data-sf-tee]'), function(b){ var n=(b.querySelector('.n')||{}).textContent||''; var y=(/([\\d,]+) yds/.exec(b.textContent)||[])[1]||''; return [n, y]; }))"));
        const realTees = tees.filter((t) => t[0] && !/^[^A-Za-z]*$/.test(t[0]) && t[1]);
        out.tees = (realTees.length && realTees.length === tees.length ? 'PASS' : 'FAIL') + ' (' + tees.map((t) => t[0] + (t[1] ? ' ' + t[1] : '')).join(', ') + ')';
        if (!(realTees.length && realTees.length === tees.length)) out.why.push(tees.length ? 'a tee with no real name or no yards' : 'no tees');
        // 8 (one record everywhere): what Course & Tees holds - key, name, card pars.
        const cs = JSON.parse(await ev("(function(){ var k=document.getElementById('course-select').value, gcx=(typeof globalCourses!=='undefined'&&globalCourses)||{}, pr=(typeof coursePresets!=='undefined'&&coursePresets)||{}; var d=(gcx[k]&&gcx[k].data)||(pr[k]&&pr[k].data)||[]; if (!Array.isArray(d)) d=Object.keys(d).map(function(x){return d[x];}); return JSON.stringify({ key: k, name: (document.getElementById('course-search-input')||{}).value||'', pars: d.map(function(h){return Number(h&&h.par)||0;}).join(''), rv: window.HardPanCourse ? HardPanCourse.resolve(k).key : null }); })()"));
        // Start GPS.
        await ev("(function(){ var b=document.querySelector('[data-sf=\"startgps\"]'); if(b) b.click(); return 1; })()");
        const started = await until("/index\\.html/.test(location.pathname) && typeof currentData !== 'undefined' && currentData && (currentData.courseData||[]).length > 0", 40000);
        if (!started) {
            const why = await ev("((document.querySelector('#sf .sf-err')||{}).innerText||'') + ' ' + (document.querySelector('[data-sf=enterpars]') ? '[Enter the pars offered]' : '')");
            out.card = 'FAIL (' + (why.trim() || 'did not start') + ')'; out.gps = out.bet = 'FAIL'; out.why.push('no round: ' + why.trim()); return out;
        }
        const card = JSON.parse(await ev("JSON.stringify({ n: (currentData.courseData||[]).length, pars: (currentData.courseData||[]).filter(function(h){return Number(h.par)>=3;}).length, hcp: (currentData.courseData||[]).filter(function(h){return Number(h.hcpIndex)>=1;}).length, key: currentData.activeCourseKey, name: currentData.courseName })"));
        out.card = (card.n === 18 && card.pars === 18 && card.hcp === 18 ? 'PASS' : 'FAIL') + ` (${card.pars} pars, ${card.hcp} HCP; ${card.key})`;
        if (card.pars !== 18 || card.hcp !== 18) out.why.push('card: ' + card.pars + ' pars / ' + card.hcp + ' HCP');
        // The GPS, hole 1: the golfer on the course (the first tee area), MIDDLE in yards. The round page
        // is a new page: its location is set again - hole 1's tee when the course data has it.
        const tee1 = JSON.parse(await ev("(function(){ try { var k=currentData.activeCourseKey, L=window.HardPanGpsLive; return JSON.stringify(null); } catch(e) { return 'null'; } })()"));
        await j.cdp('Emulation.setGeolocationOverride', { latitude: c.at[0], longitude: c.at[1], accuracy: 10 });
        await j.cdp('Browser.grantPermissions', { permissions: ['geolocation'] });
        const TO_GPS = "(function(){ if (window.HardPanGps && HardPanGps.isMounted && HardPanGps.isMounted() && HardPanGps.side()==='gps') return true; var b=document.querySelector('#hp-card-bet [data-hp-bar=gps]') || document.getElementById('fd-gps-btn'); if (b) b.click(); return false; })()";
        for (let i = 0; i < 8 && !(await ev(TO_GPS)); i++) await sleep(2500);
        if (process.env.DEBUG) { await ev("(function(){ try { HardPanGps.showSide('gps'); } catch(e) { window.__ssErr = e.message; } return 1; })()"); await sleep(1500); console.error('DEBUG3', await ev("JSON.stringify({ side: HardPanGps.side(), err: window.__ssErr||null, bar: !!document.querySelector('#hp-card-bet [data-hp-bar=gps]'), pro: HardPanGps.hasGpsPro ? HardPanGps.hasGpsPro() : null, paywall: HardPanGps.paywallOpen ? HardPanGps.paywallOpen() : null, mounted: HardPanGps.isMounted() })")); }
        const note = await ev("(function(){ var t=document.body.innerText; var m=/(No GPS map[^\\n]*|not mapped[^\\n]*|No green[^\\n]*)/i.exec(t); return m ? m[1].slice(0,120) : ''; })()");
        if (note) out.why.push('note: \"' + note + '\"');
        await until("/\\d/.test(((document.querySelector('.gps-num-mid')||{}).textContent||''))", 25000);
        const g = JSON.parse(await ev("JSON.stringify({ up: !!(window.HardPanGps && HardPanGps.isMounted()), side: window.HardPanGps ? HardPanGps.side() : null, hole: window.HardPanGps ? HardPanGps.hole() : null, data: window.HardPanGps && HardPanGps.holeHasData ? HardPanGps.holeHasData(1) : null, mid: ((document.querySelector('.gps-num-mid')||{}).textContent||'').replace(/\\s+/g,' ').trim(), f: ((document.querySelector('.gps-num-f')||{}).textContent||'').replace(/\\s+/g,' ').trim(), b: ((document.querySelector('.gps-num-b')||{}).textContent||'').replace(/\\s+/g,' ').trim(), banner: ((document.querySelector('.gps-banner, .hv-gps-banner')||{}).textContent||'').trim().slice(0,80) })"));
        if (process.env.DEBUG) console.error('DEBUG2', await ev("(function(){ var out={}; try { out.watch = String(navigator.geolocation.watchPosition).slice(0,60); } catch(e){ out.watch='ERR '+e.message; } out.path = location.pathname.slice(-12); out.err = (window.__listenerErrs||[]).slice(0,3); out.denied=null; try { navigator.permissions.query({name:'geolocation'}).then(function(s){ window.__permst=s.state; }); } catch(e){} out.perm = window.__permst; out.side = HardPanGps.side(); return JSON.stringify(out); })()"));
        if (process.env.DEBUG) console.error('DEBUG', await ev("(function(){ var L=window.HardPanGpsLive; return JSON.stringify({ live: !!(L && L.on && L.on()), cfg: (window.HARDPAN_GPS_CONFIG||{}).liveTest, gapi: window.HardPanGolfApi ? Object.keys(HardPanGolfApi.courses||{}).length : null, key: HardPanGps.courseKey && HardPanGps.courseKey(), scripts: Array.prototype.map.call(document.querySelectorAll('script[src]'), function(s){return s.getAttribute('src');}).filter(function(x){return /gps|golf|maplibre/.test(x);}), body: (document.getElementById('gps-overlay')||{}).innerText ? document.getElementById('gps-overlay').innerText.slice(0,300) : '' }); })()"));
        const midY = (/(\d{2,3})/.exec(g.mid) || [])[1];
        out.gps = (g.up && g.data && midY ? 'PASS' : 'FAIL') + ` (hole ${g.hole}: ${g.f || '-'} / ${g.mid || '-'} / ${g.b || '-'})`;
        if (!(g.up && g.data && midY)) out.why.push('GPS: ' + (g.up ? (g.data ? 'no MIDDLE number' : 'no green on hole 1') : 'map did not open') + (g.banner ? ' - "' + g.banner + '"' : ''));
        // 6 (URGENT-022): the map frames hole 1 - its tee and green in view - and the green is within 2 km
        // of the course (data in the wrong place, or a map on the golfer's street, fails here).
        const hc = JSON.parse(await ev("JSON.stringify(window.HardPanGps && HardPanGps.holeCheck ? HardPanGps.holeCheck() : null)"));
        const km = (a, b) => { if (!a || !b) return null; const R = 6371, d = (x) => x * Math.PI / 180; const dl = d(b[0] - a[0]), dn = d(b[1] - a[1]); const q = Math.sin(dl / 2) ** 2 + Math.cos(d(a[0])) * Math.cos(d(b[0])) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(q)); };
        const gkm = hc ? km(hc.green, hc.course) : null;
        const mapOk = !!(hc && hc.teeIn && hc.greenIn && gkm != null && gkm <= 2);
        out.map = (mapOk ? 'PASS' : 'FAIL') + (hc ? ` (tee ${hc.teeIn ? 'in view' : 'NOT in view'}, green ${hc.greenIn ? 'in view' : 'NOT in view'}, green ${gkm == null ? '?' : gkm.toFixed(2) + ' km'} from the course; framed: ${hc.framed})` : ' (no hole data)');
        if (!mapOk) out.why.push('map: ' + out.map.replace(/^FAIL /, ''));
        if (process.env.SHOTS) { await until("(function(){ var m=document.querySelector('.gps-map'); return !!(m && m.getAttribute('data-ready')); })()", 10000); await sleep(8000); try { await j.shot(path.join(process.env.SHOTS, c.label.replace(/[^A-Za-z0-9]+/g, '-') + '-hole1.png')); } catch (e) {} }
        if (c.noGreens) {
            // No greens: the map frames the COURSE AREA (near the course, far from the golfer) and says
            // "Tap the middle of the green"; never the golfer's location.
            const ng = JSON.parse(await ev("JSON.stringify({ banner: ((document.querySelector('.gps-banner')||{}).textContent||'').trim(), hc: window.HardPanGps && HardPanGps.holeCheck ? HardPanGps.holeCheck() : null, center: (function(){ try { var m = document.querySelector('.gps-map'); return null; } catch(e) { return null; } })() })"));
            const ctr = ng.hc && ng.hc.center ? [ng.hc.center.lat, ng.hc.center.lng] : null;
            const dCourse = km(ctr, c.at), dGolfer = km(ctr, c.golfer);
            const okNg = /Tap the middle of the green/.test(ng.banner) && dCourse != null && dCourse < 1 && dGolfer > dCourse;
            out.gps = (okNg ? 'PASS' : 'FAIL') + ` (no greens: "${ng.banner}")`;
            out.map = (okNg ? 'PASS' : 'FAIL') + ` (course area: map ${dCourse == null ? '?' : dCourse.toFixed(2)} km from the course, ${dGolfer == null ? '?' : dGolfer.toFixed(2)} km from the golfer)`;
            out.why = out.why.filter((w) => !/^GPS:|^map:|^note:/.test(w));
            if (!okNg) out.why.push('no-greens map: ' + out.map + ' ' + out.gps);
        }
        // 9 (URGENT-026): the default tee target inside a fairway ring on every par 4 / 5 with fairway data.
        if (c.noGreens) out.fw = 'n/a (no greens)';
        else {
            const tt = JSON.parse(await ev("JSON.stringify(window.HardPanGps && HardPanGps.teeTargets ? HardPanGps.teeTargets() : null)"));
            if (!Array.isArray(tt)) { out.fw = 'FAIL (' + JSON.stringify(tt) + ')'; out.why.push('tee targets: ' + out.fw); }
            else {
                const long = tt.filter((h) => !h.none && Number(h.par) !== 3);
                const withFw = long.filter((h) => h.fw > 0), bad = withFw.filter((h) => !h.inFw);
                out.noFw = long.filter((h) => !h.data).map((h) => h.n);
                const savedN = long.filter((h) => h.saved).length;
                out.fw = (bad.length ? 'FAIL' : 'PASS') + ` (${withFw.length - bad.length}/${withFw.length} in the fairway${savedN ? ', ' + savedN + ' saved lines' : ''}; no fairway data: ${out.noFw.length ? 'holes ' + out.noFw.join(', ') : 'none'})`;
                if (bad.length) out.why.push('tee target outside the fairway: ' + bad.map((h) => 'hole ' + h.n + ' (' + h.yd + ' yds, ' + h.src + ')').join(', '));
            }
        }
        // URGENT-023: nothing on the map covers the Plays-like pill (any visible control or pill overlapping it).
        const ov = JSON.parse(await ev("(function(){ var p=document.querySelector('#gps-overlay .gps-ld-plays'); if(!p || !p.offsetParent) return JSON.stringify({ pill: false, hits: [] }); var r=p.getBoundingClientRect(); var hits=[]; Array.prototype.forEach.call(document.querySelectorAll('#gps-overlay button, #gps-overlay .gps-banner, #hp-card-bet, .hp-money-chip'), function(e){ if (e===p || p.contains(e) || e.contains(p) || !e.offsetParent) return; var cs=getComputedStyle(e); if (cs.visibility==='hidden' || cs.opacity==='0') return; var q=e.getBoundingClientRect(); if (q.width<2||q.height<2) return; var x=Math.min(r.right,q.right)-Math.max(r.left,q.left), y=Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top); if (x>2 && y>2) hits.push((e.className||e.id||e.tagName).toString().slice(0,40) + ' ' + Math.round(x) + 'x' + Math.round(y)); }); return JSON.stringify({ pill: true, hits: hits }); })()"));
        out.plays = !ov.pill ? 'n/a (no pill)' : (ov.hits.length ? 'FAIL (' + ov.hits.join('; ') + ')' : 'PASS');
        if (/^FAIL/.test(out.plays)) out.why.push('Plays-like pill covered: ' + ov.hits.join('; '));
        // 7 (URGENT-022): the list's ✓ GPS says what the map does - one answer for both.
        const mapHasGps = c.noGreens ? false : /^PASS/.test(out.gps);
        out.same = (out.badge === mapHasGps ? 'PASS' : 'FAIL') + ` (list ${out.badge ? '✓ GPS' : 'no ✓'}, map ${mapHasGps ? 'GPS' : 'no GPS'})`;
        if (out.badge !== mapHasGps) out.why.push('badge and map disagree');
        // + Bet.
        await ev("(function(){ try { HardPanBet.open(); } catch (e) {} return 1; })()");
        await sleep(800);
        const bet = await ev("!!document.querySelector('#hp-bet.open')");
        out.bet = bet ? 'PASS' : 'FAIL';
        if (!bet) out.why.push('+ Bet did not open');
        await ev("(function(){ try { HardPanBet.close(); } catch (e) {} return 1; })()");
        // 8: ONE RECORD EVERYWHERE - Course & Tees == the round == the map == Resume (a reopen).
        const rd = JSON.parse(await ev("JSON.stringify({ key: currentData.activeCourseKey, name: currentData.courseName, pars: (currentData.courseData||[]).map(function(h){return Number(h&&h.par)||0;}).join(''), map: window.HardPanGps && HardPanGps.courseKey ? HardPanGps.courseKey() : null, green: (window.HardPanGps && HardPanGps.holeCheck && HardPanGps.holeCheck() || {}).green || null, rv: (function(){ try { var r = HardPanCourse.resolve({ key: currentData.activeCourseKey, name: currentData.courseName }); var g = HardPanCourse.gps(r.key, r.name, r.loc); var h = g && g.holes && (g.holes['1'] || g.holes[1]); var x = h && (h.osm || h); return { key: r.key, green: x ? (x.mid || null) : null }; } catch (e) { return { err: String(e) }; } })() })"));
        const url = await ev('location.href');
        await j.goto(url, 4500);
        await ev(TO_GPS); await until("window.HardPanGps && HardPanGps.isMounted && HardPanGps.isMounted() && HardPanGps.side() === 'gps'", 15000); await sleep(3000);
        const rs = JSON.parse(await ev("JSON.stringify({ key: currentData && currentData.activeCourseKey, map: window.HardPanGps && HardPanGps.courseKey ? HardPanGps.courseKey() : null, green: (window.HardPanGps && HardPanGps.holeCheck && HardPanGps.holeCheck() || {}).green || null })"));
        const closeTo = (a, b) => (!a && !b) || (a && b && km(a, b) < 0.05);
        const same = cs.key === rd.key && cs.key === rd.map && cs.key === rs.key && cs.key === rs.map && (!cs.rv || cs.rv === cs.key) && (!rd.rv || !rd.rv.key || rd.rv.key === cs.key)
            && cs.pars === rd.pars && closeTo(rd.green, rs.green) && (c.noGreens || closeTo(rd.green, rd.rv && rd.rv.green));
        out.one = (same ? 'PASS' : 'FAIL') + ` (${cs.key}: setup = round = map = resume${c.noGreens ? '' : '; greens = the resolver\u2019s'})`;
        if (!same) out.why.push('one record: ' + JSON.stringify({ cs, rd, rs }).slice(0, 400));
    } catch (e) {
        out.why.push('check error: ' + (e && e.message || e));
    } finally { try { await j.close(); } catch (e) {} }
    return out;
}

(async () => {
    const rows = [];
    for (const c of COURSES) { const r = await check(c); rows.push(r); console.error(c.label, JSON.stringify(r)); }
    const ok = (s) => /^PASS/.test(s || '');
    console.log('| Course | 1 found once | 2 tees | 3 card (18) | 4 GPS hole 1 (F / MIDDLE / B) | 5 + Bet | 6 map frames hole 1 | 7 badge = map | 8 one record | 9 tee target in the fairway | Result |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|');
    let fails = 0;
    rows.forEach((r) => {
        const all = [r.once, r.tees, r.card, r.gps, r.bet, r.map, r.same, r.one].every(ok) && (ok(r.fw) || /^n\/a/.test(r.fw));
        if (!all) fails++;
        console.log(`| ${r.label} | ${r.once} | ${r.tees} | ${r.card} | ${r.gps} | ${r.bet} | ${r.map} | ${r.same} | ${r.one} | ${r.fw} | ${all ? 'PASS' : 'FAIL: ' + r.why.join('; ')} |`);
    });
    console.log('\nNo fairway data (par 4 / 5, straight line, target at the pre-023c default):');
    rows.forEach((r) => console.log(`- ${r.label}: ${r.noFw.length ? 'holes ' + r.noFw.join(', ') : (/^n\/a/.test(r.fw) ? 'no greens' : 'none')}`));
    console.log('\n' + (fails ? fails + ' of ' + rows.length + ' courses FAIL' : 'all ' + rows.length + ' courses PASS'));
    process.exit(fails ? 1 : 0);
})();
