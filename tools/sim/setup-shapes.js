#!/usr/bin/env node
// ============================================================================
// SETUP SHAPES, PLAYED LIKE A PHONE (mailbox 013, group 3 of 3)
//
//   node tools/sim/setup-shapes.js [--only D-paste20,E-kill] [--out <dir>]
//   exit 0 = no BLOCKER/HIGH finding, 1 = at least one, 2 = could not run
//
// iPhone 15 size (393x852), the HardPan app (window.__hardpanDoors), layout D (the
// default) with a spot-check of layout C, a stand-in server (tools/sim/lib/phone.js:
// nothing reaches the live database). Every step is a REAL tap on what the screen
// shows, a screenshot into <out>/<path>/NN-<step>.png, and a count: taps and screens
// from launch to the first score entered.
//
// PATH D - the organizer pastes 20 pairings (URGENT-004, Manny's exact text) and
// runs a weekly game at Dobson Ranch (gca_zgkynkan; the merged duplicate
// gapi_0121324924309988 must not be offered):
//   D-paste20        brand-new phone, Games -> Start a round -> Stroke Play -> Dobson
//                    -> tees -> Paste Player List -> flights A/B -> Weekly Game ->
//                    Review -> Save & Start -> Group 1 -> first score; then GPS
//                    (layout D on Dobson hole 1), Card, kill + reopen mid-round
//                    (Resume keeps the round, the group, the hole), two more phones
//                    join by code, and the organizer's board sees their scores
//   D-space          the same text in the "Skeens 2.0 A" space form (returning organizer)
//   D-wholeround     the same text through "Paste the whole round"
//   D-1golfer        one golfer
//   D-2groups        8 golfers, two groups
//   D-shotgun        20 golfers, groups 4 and 5 off the 10th (the two-tee start the
//                    app offers - there is no 1..18 shotgun)
//   D-back9          start on hole 10
//   D-thistle        a two-nines course: Thistle MacKay / Stewart
// PATH E - moving around:
//   E-switch         GPS <-> Games mid-setup and mid-round, both directions
//   E-back           Back at every step: nothing lost, nothing asked twice
//   E-kill           kill + reopen at every setup step and mid-round
//   E-airplane       airplane mode mid-setup: Save with no signal, signal back
//
// A FINDING is { sev: BLOCKER|HIGH|MEDIUM|LOW, id, path, title, repro, shot, cause }.
// The JSON summary goes to stdout and to <out>/setup-shapes-summary.json.
// ============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const HERE = path.join(__dirname, '..', '..');
const { Phone, Server, fileUrl, sleep } = require('./lib/phone.js');
const F = require('./lib/fixtures.js');
const { iapStub } = require(path.join(HERE, 'tools/lib/iap-stub.js'));
const registry = require(path.join(HERE, 'tools/lib/browser-registry.js'));

const argv = process.argv.slice(2);
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const OUT = path.resolve(argOf('--out') || process.env.SIM_OUT || path.join(os.homedir(), 'Desktop/claude-code-reports/013'));
const ONLY = (argOf('--only') || '').split(',').filter(Boolean);
const VIEW = { width: 393, height: 852 };

// THE APP, ON A PHONE AT DOBSON'S FIRST TEE. A subscriber (the GPS map is paid), the
// doors on, a stand-in position sensor. Esri/USGS tiles are blocked by the phone
// harness, so the map draws on its fallback; what is measured is where the app goes.
const GEO = (p) => "(function(){ var cur={lat:" + p[0] + ",lng:" + p[1] + "}; window.__simGeo=cur; try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){var f=function(){ok({coords:{latitude:cur.lat,longitude:cur.lng,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); setInterval(f,2000); return 1;},getCurrentPosition:function(ok){setTimeout(function(){ok({coords:{latitude:cur.lat,longitude:cur.lng,accuracy:5},timestamp:Date.now()});},20);},clearWatch:function(){}}}); } catch(e){} try { var q0 = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = function (d) { return d && d.name === 'geolocation' ? Promise.resolve({ state: 'granted' }) : q0(d); }; } catch (e) {} })();";
const APP = 'window.__hardpanDoors = true; window.__freshPhone = true;';
// THE MAP DATA. The app build (GPS LIVE) reads GolfAPI's file and our Cloud Functions,
// neither of which a desktop Chrome has; the bundled OpenStreetMap holes (osm: true,
// live: false - the build-10 shape) draw the same layout D screen from data on disk.
// The GPS LIVE lookup of Dobson's greens is measured separately (D-gpslive).
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false});}});})();";
const PRE = APP + CFG + GEO(F.DOBSON_TEE1) + iapStub({ active: true });

const findings = [];
// OPEN AND RANKED (013): found by this simulation, reported, deliberately NOT fixed (not on
// tomorrow's exact path). They stay in the summary with known: true and do not fail the run;
// a NEW BLOCKER/HIGH does. Remove an id here when its fix lands.
const KNOWN = {
    // 'airplane-kill-loses-round' fixed by URGENT-009 (013-1): Save keeps the round in the durable queue first.
};
const paths = {};
let current = null;
function startPath(name) { current = name; paths[name] = { name, taps: 0, screens: 0, toFirstScore: null, steps: [], shots: [], errors: [], notes: [] }; fs.mkdirSync(path.join(OUT, name), { recursive: true }); return paths[name]; }
function finding(sev, id, title, o) { findings.push(Object.assign({ sev, id, path: current, title }, o || {}, KNOWN[id] ? { known: true } : {})); }
function check(cond, sev, id, title, o) { if (!cond) finding(sev, id, title, o); return !!cond; }
function note(t) { paths[current].notes.push(t); }

async function newPhone(name, o) {
    const p = await Phone.launch(Object.assign({ name, server: o.server, preScript: PRE + (o.pre || ''), shotDir: path.join(OUT, current), viewport: VIEW, webgl: o.webgl !== false, url: o.url || fileUrl('index.html'), settleMs: o.settleMs || 3500, profileDir: o.profileDir, auth: o.auth }, {}));
    return p;
}
// THE APP KILLED AND OPENED AGAIN FROM ITS ICON: the same phone (profile), a new process.
async function relaunch(ph, url, settleMs) {
    await ph.kill();
    const p2 = await Phone.launch({ name: ph.name, server: ph.server, preScript: ph.o.preScript, shotDir: ph.shotDir, viewport: VIEW, webgl: ph.o.webgl !== false, profileDir: ph.profile, shotN: ph.shotN, taps: ph.taps, screens: ph.screens, auth: ph.o.auth });
    await p2.reopen(url || fileUrl('index.html'), settleMs || 4000);
    return p2;
}
// GPS's "Who are you? Group N" sheet: the organizer is Manny.
async function whoAmI(ph, name) {
    if (!(await visible(ph, '#gps-overlay .gps-who-sheet, #gps-overlay [data-who-id]'))) return false;
    const t = await ph.tap({ sel: '#gps-overlay [data-who-id]', text: new RegExp('^' + (name || 'Manny') + '$') }, { settle: 900 });
    if (!t) await ph.tap('#gps-overlay .gps-who-skip', { settle: 900 });
    return true;
}
async function shot(ph, name) { const f = await ph.shot((ph.name === 'manny' ? '' : ph.name + '-') + name); paths[current].shots.push(f); paths[current].steps.push(name); return f; }
// URGENT-009 (013-9): Start a round with an unsaved setup waiting asks "Resume your unsaved round
// setup?" first. A path that means a NEW round answers "Start a new one".
async function newSetupPlease(ph) {
    const asked = await ph.eval("!!(document.querySelector('#ui-sheet-no') && /unsaved round setup/.test((document.querySelector('.ui-sheet-card')||{}).innerText||''))");
    if (asked) await ph.tap('#ui-sheet-no', { settle: 4500 });
    return asked;
}
const visible = (ph, sel) => ph.eval("(function(){ var e = document.querySelector(" + JSON.stringify(sel) + "); if (!e) return false; var r = e.getBoundingClientRect(); var s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; })()");
const step = (ph) => ph.eval("typeof currentWizardStep !== 'undefined' ? currentWizardStep : null");
const STEP_NAME = { 1: 'Course', 3: 'Games', 5: 'Players', 6: 'Money', 7: 'Review' };
const rows = (ph) => ph.json("Array.prototype.map.call(document.querySelectorAll('#player-list .player-row'), function (r) { var f = r.querySelector('.p-flight-input'); return [(r.querySelector('.p-name-input') || {}).value, (r.querySelector('.p-hcp-input') || {}).value, f ? f.getAttribute('data-flight') : null]; })");
const groupSizes = (ph) => ph.json("Array.prototype.map.call(document.querySelectorAll('#player-list .group-size-num, #player-list .gs-count'), function (e) { return e.textContent; })");
const code = (ph) => ph.eval("(function(){ var m = /[?&]game=([A-Z0-9]+)/i.exec(document.URL); return m ? m[1].toUpperCase() : null; })()");

// ---- the organizer's setup, step by step ----------------------------------------------
// o: { course: 'Dobson'|'Thistle', nines: ['MacKay','Stewart'], start: 1|10, text, via: 'list'|'round',
//      oneGolfer, weekly, returning }
async function setup(ph, o) {
    const P = paths[current];
    if (!o.skipHome) {
        await shot(ph, 'home');
        const v0 = await ph.eval("(document.querySelector('.hp-view.on')||{}).id || ''");
        check(/home\.html/.test(await ph.url()) && v0 === 'v-main', 'HIGH', 'launch-main', 'The app did not open on Home (Main)', { repro: 'Launch the app', shot: P.shots[P.shots.length - 1], cause: 'url ' + (await ph.url()) + ' view ' + v0 });
        await ph.tap('#v-main .hp-door.games');
    }
    await shot(ph, 'games');
    const started = await ph.tap({ sel: '#v-games [data-hp-act="start"]' }, { settle: 4500 });
    await newSetupPlease(ph);
    check(started, 'BLOCKER', 'start-round', 'No "Start a round" on the Games door', { shot: P.shots[P.shots.length - 1] });
    await ph.waitFor("typeof currentWizardStep !== 'undefined' && !!document.querySelector('#fmt-card-stroke')", 8000);
    await shot(ph, 'step1-games');
    check(await step(ph) === 3, 'HIGH', 'first-step', 'Start a round did not open on the Games step', { cause: 'step ' + await step(ph) });
    await ph.tap('#fmt-card-stroke', { settle: 1200 });
    check(await step(ph) === 1, 'HIGH', 'format-advance', 'Picking Stroke Play did not move on to Course', { cause: 'step ' + await step(ph) });
    // COURSE: search, exactly one Dobson row, never the merged duplicate.
    await ph.type('#course-search-input', o.course === 'Thistle' ? 'Thistle' : 'Dobson', { settle: 1500 });
    await shot(ph, 'step2-course-search');
    const opts = await ph.json("Array.prototype.map.call(document.querySelectorAll('#course-dropdown > *'), function (e) { return [e.getAttribute('data-key') || e.getAttribute('data-id') || '', (e.innerText || '').replace(/\\s+/g, ' ').trim()]; })");
    const html = await ph.eval("document.getElementById('course-dropdown').innerHTML");
    if (o.course !== 'Thistle') {
        const dob = opts.filter((x) => /Dobson Ranch/.test(x[1]));
        check(dob.length === 1, 'HIGH', 'dobson-dup', 'Course search offers ' + dob.length + ' Dobson Ranch rows (want exactly one, the merged duplicate hidden)', { repro: 'Course step, type Dobson', shot: P.shots[P.shots.length - 1], cause: JSON.stringify(opts) });
        check(!/gapi_0121324924309988/.test(html), 'HIGH', 'dobson-merged-offered', 'The merged Dobson record (gapi_0121324924309988) is offered in search', { shot: P.shots[P.shots.length - 1] });
        await ph.tap({ sel: '#course-dropdown > *', text: /^Dobson Ranch Golf Course/ }, { settle: 2500 });
    } else {
        await ph.tap({ sel: '#course-dropdown > *', text: /Thistle/ }, { settle: 2500 });
    }
    await shot(ph, 'step2-course-picked');
    const course = await ph.json("{ key: (document.getElementById('course-key-hidden')||document.getElementById('selected-course-key')||{}).value || (typeof currentCourseKey !== 'undefined' ? currentCourseKey : null), name: document.getElementById('course-search-input').value, tees: Array.prototype.map.call(document.querySelectorAll('#tee-rating-select option'), function (x) { return x.textContent; }), tee: (document.getElementById('tee-rating-select')||{}).value, gps: ((document.querySelector('.gps-setup-badge, #gps-course-badge, [id*=gps][id*=badge]')||{}).innerText||''), start: (document.getElementById('tee-start-select')||{}).value, front: (document.getElementById('front-nine-select')||{}).value, back: (document.getElementById('back-nine-select')||{}).value, nineBox: (function(){ var n = document.getElementById('nine-loop-selector'); return n ? getComputedStyle(n).display : null; })() }");
    P.course = course;
    if (o.course !== 'Thistle') {
        const names = course.tees.join(' | ');
        check(/Back/.test(names) && /DRGA Tournament Tee/.test(names) && /White/.test(names) && /Red/.test(names), 'HIGH', 'dobson-tees', 'Dobson\'s tee list is not Back / DRGA Tournament Tee / White / Red', { repro: 'Pick Dobson Ranch, open Tee', shot: P.shots[P.shots.length - 1], cause: names });
        check(!/&|\*|Gold|Blue/.test(names), 'HIGH', 'dobson-wrong-record', 'The tee list has the duplicate record\'s tees (&, *, Blue, Gold)', { cause: names });
    } else {
        check(course.nineBox && course.nineBox !== 'none', 'HIGH', 'thistle-nines', 'Thistle (27 holes) shows no nine picker', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(course) });
        if (o.nines) {
            const fr = await ph.json("Array.prototype.map.call(document.querySelectorAll('#front-nine-select option'), function (x) { return [x.value, x.textContent]; })");
            const pick = (list, name) => (list.find((x) => new RegExp(name, 'i').test(x[1])) || [])[0];
            await ph.select('#front-nine-select', pick(fr, o.nines[0]));
            const bk = await ph.json("Array.prototype.map.call(document.querySelectorAll('#back-nine-select option'), function (x) { return [x.value, x.textContent]; })");
            await ph.select('#back-nine-select', pick(bk, o.nines[1]));
            await sleep(800);
            await shot(ph, 'step2-nines-picked');
            P.nines = await ph.json("{ front: document.getElementById('front-nine-select').value, back: document.getElementById('back-nine-select').value, name: document.getElementById('course-search-input').value, opts: " + JSON.stringify(fr) + " }");
        }
    }
    if (o.start === 10) { await ph.select('#tee-start-select', '10'); await sleep(400); await shot(ph, 'step2-start-10'); }
    await ph.tap({ sel: 'button', text: /^Next: Players/ }, { settle: 1500 });
    check(await step(ph) === 5, 'HIGH', 'to-players', 'Next: Players did not open Players', { cause: 'step ' + await step(ph) });
    await shot(ph, 'step3-players');
    // PLAYERS
    if (o.oneGolfer) {
        await ph.type('#player-list .p-name-input', 'Manny');
        await ph.type('#player-list .p-hcp-input', '+2.0');
    } else if (o.via === 'round') {
        await ph.tap('#sp-round-btn', { settle: 800 });
        await ph.type('#sp-round-box', o.text, { settle: 600 });
        await shot(ph, 'step3-paste-round-box');
        await ph.tap({ sel: '#sp-round-modal button', text: /^Read it/ }, { settle: 1200 });
        await shot(ph, 'step3-paste-round-review');
        P.roundReview = await ph.text('#sp-round-review');
        const ok = await ph.tap('.sp-confirm', { settle: 1500 });
        check(ok, 'HIGH', 'paste-round-confirm', '"Paste the whole round" offered no Confirm for the 20 pairings', { shot: P.shots[P.shots.length - 1], cause: (P.roundReview || '').slice(0, 300) });
        await shot(ph, 'step3-paste-round-confirmed');
        P.afterConfirmStep = await step(ph);
    } else {
        await ph.tap({ sel: 'button', text: /Paste Player List/ }, { settle: 700 });
        await ph.type('#paste-players-textarea', o.text, { settle: 900 });
        await shot(ph, 'step3-paste-preview');
        P.preview = await ph.text('#paste-preview-summary');
        await ph.tap('#paste-players-commit-btn', { settle: 1500 });
    }
    await shot(ph, 'step3-players-filled');
    P.rows = await rows(ph);
    P.flightsCount = await ph.text('#flights-count');
    P.groupsShown = await ph.json("Array.prototype.map.call(document.querySelectorAll('#player-list .group-header, #player-list [class*=group-head]'), function (e) { return (e.innerText||'').replace(/\\s+/g,' ').trim(); })");
    P.fixNote = await ph.text('#roster-fix-note');
    // "Paste the whole round" goes straight to Review & Save (its own design).
    if (await step(ph) === 7) { P.review = await ph.text('#wizard-review-summary'); return P; }
    // MONEY
    await ph.tap({ sel: 'button', text: /^Next: Money/ }, { settle: 1500 });
    check(await step(ph) === 6, 'HIGH', 'to-money', 'Next: Money did not open Money', { cause: 'step ' + await step(ph) });
    await shot(ph, 'step4-money');
    if (o.weekly) {
        await ph.tap('#mp-enabled', { settle: 1200 });
        await shot(ph, 'step4-weekly-game');
    }
    await ph.tap('#wizard-next-6', { settle: 1500 });
    check(await step(ph) === 7, 'HIGH', 'to-review', 'Review & Save did not open Review', { cause: 'step ' + await step(ph) });
    await shot(ph, 'step5-review');
    P.review = await ph.text('#wizard-review-summary');
    return P;
}
async function save(ph) {
    const P = paths[current];
    await ph.tap('#main-save-btn', { settle: 4000 });
    await ph.waitFor("(function(){ var r = document.getElementById('round-ready-screen'); return r && r.style.display === 'block'; })()", 10000);
    await shot(ph, 'round-ready');
    P.ready = await ph.visibleText();
    P.code = await code(ph);
    await ph.sync();
    P.saved = ph.server.read('events/' + P.code);
    return P.saved;
}
// START SCORING -> the group -> the first score (Manny's when he is in the group).
async function firstScore(ph, group, opts) {
    const P = paths[current];
    await ph.tap({ sel: 'button', text: /START SCORING/ }, { settle: 5000 });
    await shot(ph, 'card-arrive');
    const picker = await visible(ph, '#group-pick-modal, .group-pick-modal');
    const pick = await ph.tap({ sel: 'button, [role=button], div[onclick], .gp-row', text: new RegExp('Keep score for Group ' + group + '\\b') }, { settle: 2500 });
    if (pick) await shot(ph, 'card-group-' + group);
    const hole = await ph.eval("(function(){ var t = (document.querySelector('.hole-view-title, #hole-view-title, .hv-hole, .hole-view-nav-title') || {}).innerText || ''; var m = /Hole (\\d+)/.exec(t || document.body.innerText); return m ? Number(m[1]) : null; })()");
    P.cardHole = hole;
    const inputs = await ph.json("Array.prototype.filter.call(document.querySelectorAll('.score-input'), function (i) { var r = i.getBoundingClientRect(); return r.width > 0 && !i.disabled; }).map(function (i) { return [i.getAttribute('data-player-id'), i.getAttribute('data-hole')]; })");
    P.cardInputs = inputs;
    const target = (opts && opts.playerId) ? inputs.find((x) => x[0] === String(opts.playerId)) : inputs[0];
    if (!target) { finding('BLOCKER', 'no-score-box', 'No score box to type into after picking Group ' + group, { shot: P.shots[P.shots.length - 1] }); return null; }
    await ph.type('.score-input[data-player-id="' + target[0] + '"][data-hole="' + target[1] + '"]', '4', { settle: 300 });
    // The phone's Done: focus leaves the box.
    await ph.eval("(function(){ var a = document.activeElement; if (a && a.blur) a.blur(); return 1; })()");
    await sleep(1200);
    P.toFirstScore = { taps: ph.taps, screens: ph.screens, picker: picker || !!pick, tapLog: (ph.tapLog || []).slice() };
    await shot(ph, 'card-first-score');
    await ph.sync();
    const c = await code(ph);
    const saved = ph.server.read('events/' + c + '/scores/p' + target[0] + '_h' + target[1]);
    check(String(saved) === '4', 'BLOCKER', 'first-score-not-saved', 'The first score did not reach the server (p' + target[0] + '_h' + target[1] + ')', { shot: P.shots[P.shots.length - 1], cause: 'server has ' + JSON.stringify(saved) });
    return { hole: Number(target[1]), pid: target[0], code: c };
}
async function openGps(ph) {
    const ok = await ph.tap('#fd-gps-btn', { settle: 3500 });
    await ph.waitFor("document.body.classList.contains('gps-side-gps') || !!document.querySelector('#gps-overlay.on, #gps-overlay[style*=block]')", 8000);
    await sleep(1500);
    return ok;
}
const gpsState = (ph) => ph.json("{ side: window.HardPanGps && HardPanGps.side ? HardPanGps.side() : null, ld: !!document.querySelector('#gps-overlay.gps-ld'), lc: !!document.querySelector('#gps-overlay.gps-lc'), hole: (function(){ var t = (document.querySelector('#gps-overlay .gps-hole-num, #gps-overlay .gps-hole, #gps-overlay [class*=hole-pick]')||{}).innerText || ''; var m = /(\\d+)/.exec(t); return m ? Number(m[1]) : null; })(), text: ((document.getElementById('gps-overlay')||{}).innerText||'').replace(/\\s+/g,' ').slice(0, 400), connecting: /Connecting/.test(document.body.innerText) }");

function errorsFinding(ph, label) {
    const errs = ph.errs.filter((e) => !/favicon|ERR_|net::|Failed to load resource|maplibre|WebGL|tile/i.test(e));
    paths[current].errors.push(...errs.map((e) => (ph.name || '') + ': ' + e));
    if (errs.length) finding('MEDIUM', 'console-error', 'Console error(s) on ' + label, { cause: errs.slice(0, 5).join(' || ') });
    const dl = ph.dialogs.filter(Boolean);
    if (dl.length) finding('MEDIUM', 'native-dialog', 'A native dialog opened on ' + label, { cause: dl.slice(0, 3).join(' || ') });
    ph.errs.length = 0; ph.dialogs.length = 0;
}

// ============================================================================
// THE PATHS
// ============================================================================
const PATHS = {};

PATHS['D-paste20'] = async function () {
    const P = startPath('D-paste20');
    const server = new Server(F.server());
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-manny-'));
    let ph = await newPhone('manny', { server, profileDir: profile });
    await setup(ph, { course: 'Dobson', text: F.PAIRINGS_SLASH, via: 'list', weekly: true });
    // THE PASTE, as URGENT-004 promised.
    check(P.rows.length === 20, 'BLOCKER', 'paste-count', 'The paste gave ' + P.rows.length + ' golfers, not 20', { repro: 'Players > Paste Player List > the 20 pairings > Add Players', cause: JSON.stringify(P.rows.slice(0, 4)) });
    check(JSON.stringify(P.rows.map((r) => r[0])) === JSON.stringify(F.NAMES), 'BLOCKER', 'paste-names', 'Pasted names are not the 20 names', { cause: JSON.stringify(P.rows.map((r) => r[0])) });
    check(JSON.stringify(P.rows.map((r) => r[1])) === JSON.stringify(F.HCP), 'BLOCKER', 'paste-hcp', 'Pasted handicaps are not as typed', { cause: JSON.stringify(P.rows.map((r) => r[1])) });
    check(JSON.stringify(P.rows.map((r) => r[2])) === JSON.stringify(F.FLIGHT), 'BLOCKER', 'paste-flights', 'Pasted flights are not A/B as typed', { cause: JSON.stringify(P.rows.map((r) => r[2])) });
    check(/A: 10 · B: 10/.test(P.flightsCount || ''), 'BLOCKER', 'flight-count', 'Flights count is not A: 10 · B: 10', { cause: P.flightsCount });
    check(/20 players ready to add in 5 groups \(4, 4, 4, 4, 4\)/.test(P.preview || ''), 'HIGH', 'paste-preview', 'The paste preview does not say 20 players in 5 groups of 4', { cause: P.preview });
    const ev = await save(ph);
    check(ev && (ev.players || []).length === 20, 'BLOCKER', 'saved-20', 'Save & Start did not write 20 golfers', { cause: ev ? (ev.players || []).length : 'nothing written' });
    if (ev) {
        check(JSON.stringify(Object.values(ev.groupSizeOverrides || {})) === '[4,4,4,4,4]', 'BLOCKER', 'saved-groups', 'Saved groups are not 5 groups of 4', { cause: JSON.stringify(ev.groupSizeOverrides) });
        check(ev.flights && ev.flights.enabled === true, 'BLOCKER', 'saved-flights-on', 'Flights not on in the saved round', { cause: JSON.stringify(ev.flights) });
        check(ev.players.filter((p) => p.flight === 'A').length === 10 && ev.players.filter((p) => p.flight === 'B').length === 10, 'BLOCKER', 'saved-flights', 'Saved flights are not A 10 / B 10', { cause: ev.players.map((p) => p.flight).join('') });
        check(ev.activeCourseKey === 'gca_zgkynkan', 'BLOCKER', 'saved-course', 'The round is not on Dobson gca_zgkynkan', { cause: ev.activeCourseKey });
        check((ev.courseData || []).length === 18, 'BLOCKER', 'saved-card', 'The round has no 18-hole card', { cause: (ev.courseData || []).length });
        check(ev.moneyPool && ev.moneyPool.enabled, 'HIGH', 'saved-weekly', 'The Weekly Game was not saved', { cause: JSON.stringify(ev.moneyPool) });
        check(String((ev.players.find((p) => p.name === 'Manny') || {}).hcp) === '+2.0', 'BLOCKER', 'saved-plus', 'Manny\'s +2.0 was not saved as a plus handicap', { cause: JSON.stringify(ev.players.find((p) => p.name === 'Manny')) });
        P.savedSummary = { code: P.code, players: ev.players.length, groups: ev.groupSizeOverrides, flights: ev.flights, course: ev.activeCourseKey, tee: ev.teeRating && ev.teeRating.teeName, start: ev.startingHole, pool: ev.moneyPool && { buyIn: ev.moneyPool.buyIn, kp: ev.moneyPool.kp, net: ev.moneyPool.net } };
    }
    // Round Ready: what it says about the money.
    check(!/Just keeping score — no side games/.test(P.ready || '') || !(ev && ev.moneyPool && ev.moneyPool.enabled), 'MEDIUM', 'ready-says-no-games', 'Round Ready says "Just keeping score — no side games" on a round with an $800 Weekly Game', { repro: 'Turn on Weekly Game on Money, Save & Start', shot: P.shots[P.shots.length - 1], cause: 'the Action line on Round Ready does not count the money pool (moneyPool)' });
    errorsFinding(ph, 'setup');
    const first = await firstScore(ph, 1, { playerId: (ev.players.find((p) => p.name === 'Manny') || {}).id });
    errorsFinding(ph, 'first score');
    P.code = first && first.code;
    // GPS FROM THE CARD (Games -> GPS mid-round): layout D, Dobson hole 1.
    await openGps(ph);
    await shot(ph, 'gps-from-card');
    const g1 = await gpsState(ph);
    P.gps = g1;
    check(g1.side === 'gps', 'HIGH', 'gps-open', 'The card\'s GPS button did not open GPS', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(g1) });
    check(g1.ld, 'HIGH', 'gps-layout-d', 'GPS did not open in layout D (the default)', { cause: JSON.stringify(g1) });
    check(!g1.connecting, 'HIGH', 'gps-connecting', 'GPS shows a "Connecting…"', { shot: P.shots[P.shots.length - 1] });
    check(!/No green mapped/.test(g1.text), 'HIGH', 'gps-no-green', 'GPS on Dobson hole 1 says "No green mapped"', { shot: P.shots[P.shots.length - 1], cause: g1.text.slice(0, 200) });
    if (/Who are you\?/.test(g1.text)) {
        finding('LOW', 'gps-who-again', 'Opening GPS from the card asks "Who are you? Group 1" right after the card asked which group this phone keeps score for', { repro: 'START SCORING > Keep score for Group 1 > score > 📍 GPS', shot: P.shots[P.shots.length - 1], cause: 'two pickers (card: group; GPS: golfer) - could be one question' });
        await whoAmI(ph, 'Manny');
        await shot(ph, 'gps-who-manny');
    }
    // Back to the card from GPS (GPS -> Games).
    const back = await ph.tap({ sel: '#gps-overlay button, #gps-overlay [role=button]', text: /^Card$|Card/ }, { settle: 1500 });
    await shot(ph, 'gps-back-to-card');
    const cardAgain = await ph.json("{ side: window.HardPanGps && HardPanGps.side ? HardPanGps.side() : null, url: document.URL }");
    check(back && cardAgain.side !== 'gps', 'HIGH', 'gps-to-card', 'GPS has no way back to the card ("Card")', { cause: JSON.stringify(cardAgain) });
    // KILL + REOPEN mid-round.
    ph = await relaunch(ph);
    await shot(ph, 'reopen-mid-round');
    const resume = await ph.text('#hp-resume');
    P.resume = resume;
    check(/Resume Dobson Ranch Golf Course/.test(resume || ''), 'BLOCKER', 'resume-offered', 'Reopening mid-round offers no "Resume Dobson Ranch"', { repro: 'Enter a score, kill the app, open it', shot: P.shots[P.shots.length - 1], cause: 'hp-resume: ' + JSON.stringify(resume) });
    await ph.tap('#hp-resume .hp-resume', { settle: 5000 });
    await shot(ph, 'resumed');
    const after = await ph.json("{ url: document.URL, picker: (function(){ var m = document.getElementById('group-pick-modal'); return !!(m && m.offsetParent); })(), side: window.HardPanGps && HardPanGps.side ? HardPanGps.side() : null, owner: (function(){ try { return !!(window.isOrganizer && isOrganizer()); } catch (e) { return null; } })(), menu: !!document.querySelector('[onclick*=openRoundMenu], #round-menu-btn'), text: document.body.innerText.slice(0, 300).replace(/\\s+/g, ' ') }");
    P.resumed = after;
    check(/group=1/.test(after.url) && !after.picker, 'BLOCKER', 'resume-group', 'Resume did not reopen Group 1 (asked again or another group)', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(after) });
    const sc = await ph.eval("(function(){ var i = document.querySelector('.score-input[data-player-id=\"" + (first && first.pid) + "\"][data-hole=\"1\"]'); return i ? i.value : null; })()");
    check(sc === '4' || sc === null, 'BLOCKER', 'resume-score', 'After reopen, Manny\'s hole-1 score is not shown', { cause: JSON.stringify(sc) });
    // Still the organizer after the reopen? The Round Menu keeps the setup.
    await ph.tap({ sel: 'button, div[onclick]', text: /Round Menu/ }, { settle: 1200 });
    await shot(ph, 'resumed-round-menu');
    P.menuAfterReopen = await ph.visibleText();
    check(/Edit Round Setup|Round Setup|Edit setup|Setup/i.test(P.menuAfterReopen), 'HIGH', 'resume-organizer', 'After the reopen the Round Menu no longer offers the round\'s setup (organizer role lost?)', { shot: P.shots[P.shots.length - 1], cause: P.menuAfterReopen.slice(0, 300) });
    // The Round Menu is a toggle: the same tap closes it.
    await ph.tap({ sel: 'button, div[onclick]', text: /Round Menu/ }, { settle: 900 });
    errorsFinding(ph, 'reopen');
    // OTHER PHONES JOIN (Games door, the code), Groups 2 and 5.
    const joined = [];
    for (const [nm, grp] of [['glenn', 2], ['crone', 5]]) {
        await ph.sync();
        const other = await newPhone(nm, { server, url: fileUrl('index.html'), webgl: false });
        await shot(other, 'home');
        await other.tap('#v-main .hp-door.games');
        await other.type('#hp-code', P.code.toLowerCase());
        await other.tap('#v-games [data-hp-act="join"]', { settle: 4500 });
        await shot(other, 'joined');
        const pickG = await other.tap({ sel: 'button, [role=button], div[onclick], .gp-row', text: new RegExp('Keep score for Group ' + grp + '\\b') }, { settle: 2500 });
        await shot(other, 'group-' + grp);
        const inputs = await other.json("Array.prototype.filter.call(document.querySelectorAll('.score-input'), function (i) { var r = i.getBoundingClientRect(); return r.width > 0 && !i.disabled; }).map(function (i) { return [i.getAttribute('data-player-id'), i.getAttribute('data-hole')]; })");
        check(pickG && inputs.length === 4, 'BLOCKER', 'join-' + nm, 'A joining phone (' + nm + ') could not keep score for Group ' + grp, { repro: 'Second phone: Games > code > Join > Keep score for Group ' + grp, shot: other.shots[other.shots.length - 1], cause: JSON.stringify({ pickG, inputs }) });
        if (inputs[0]) {
            await other.type('.score-input[data-player-id="' + inputs[0][0] + '"][data-hole="' + inputs[0][1] + '"]', '5', { settle: 300 });
            await other.eval("document.activeElement && document.activeElement.blur && document.activeElement.blur(), 1");
            await sleep(1000);
            await other.sync();
            const v = server.read('events/' + P.code + '/scores/p' + inputs[0][0] + '_h' + inputs[0][1]);
            check(String(v) === '5', 'BLOCKER', 'join-score-' + nm, nm + '\'s score did not reach the server', { cause: JSON.stringify(v) });
            joined.push({ nm, grp, pid: inputs[0][0], hole: inputs[0][1], taps: other.taps, screens: other.screens });
        }
        errorsFinding(other, nm + '\'s phone');
        if (nm === 'glenn') {
            // A GOLFER'S PHONE KILLED MID-ROUND: Resume keeps the group (the scorekeeper role) and the score.
            const g2 = await relaunch(other);
            await shot(g2, 'reopen');
            const res = ((await g2.text('#hp-resume')) || '');
            await g2.tap('#hp-resume .hp-resume', { settle: 5000 });
            await shot(g2, 'resumed');
            const st = await g2.json("{ url: document.URL, picker: (function(){ var m = document.getElementById('group-pick-modal'); return !!(m && m.offsetParent); })(), boxes: Array.prototype.filter.call(document.querySelectorAll('.score-input'), function (i) { var r = i.getBoundingClientRect(); return r.width > 0 && !i.disabled; }).length, mine: (function(){ var i = document.querySelector('.score-input[data-player-id=\"" + (inputs[0] && inputs[0][0]) + "\"][data-hole=\"1\"]'); return i ? i.value : null; })() }");
            P.glennReopen = { res, st };
            check(/Resume/.test(res) && /group=2/.test(st.url) && !st.picker && st.boxes === 4, 'BLOCKER', 'join-resume', 'A golfer\'s phone (Group 2) killed mid-round does not Resume as Group 2\'s scorekeeper', { repro: 'Second phone: join by code, Group 2, score, kill, reopen, Resume', shot: g2.shots[g2.shots.length - 1], cause: JSON.stringify(P.glennReopen) });
            errorsFinding(g2, 'glenn reopen');
            await g2.close();
        } else await other.close();
    }
    P.joined = joined;
    // The organizer's phone sees them (the round's scores delivered as the SDK would).
    await ph.deliver('events/' + P.code + '/scores');
    await sleep(1500);
    P.deliveredScores = Object.keys(server.read('events/' + P.code + '/scores') || {});
    P.pageScores = await ph.json("(function(){ try { var d = (typeof currentData !== 'undefined' && currentData) || null; return d && d.scores ? Object.keys(d.scores) : 'no handle'; } catch (e) { return String(e); } })()");
    const boardTap = await ph.tap('.hl-row.hl-board', { settle: 2500 });
    P.boardTap = boardTap;
    await shot(ph, 'organizer-board');
    const board = await ph.visibleText();
    P.board = board.slice(0, 600);
    check(/Glenn/.test(board) && /Crone/.test(board), 'HIGH', 'board-others', 'The organizer\'s full board does not list the other groups\' golfers after they scored', { shot: P.shots[P.shots.length - 1], cause: board.slice(0, 300) });
    errorsFinding(ph, 'board');
    await ph.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
};

PATHS['D-space'] = async function () {
    const P = startPath('D-space');
    const server = new Server(F.server());
    // A RETURNING ORGANIZER: the Games door remembered.
    const ph = await newPhone('manny', { server, pre: "try{ if(!localStorage.getItem('__simSeeded')){ localStorage.setItem('__simSeeded','1'); localStorage.setItem('hardpan_front_door','games'); } }catch(e){}" });
    await setup(ph, { course: 'Dobson', text: F.PAIRINGS_SPACE, via: 'list', weekly: true });
    check(JSON.stringify(P.rows.map((r) => r[1])) === JSON.stringify(F.HCP) && JSON.stringify(P.rows.map((r) => r[2])) === JSON.stringify(F.FLIGHT) && JSON.stringify(P.rows.map((r) => r[0])) === JSON.stringify(F.NAMES), 'BLOCKER', 'space-form', '"Skeens 2.0 A" (space form) did not read as name / HCP / flight', { cause: JSON.stringify(P.rows.slice(0, 5)) });
    check(/A: 10 · B: 10/.test(P.flightsCount || ''), 'BLOCKER', 'space-flight-count', 'Space form: flights count is not A: 10 · B: 10', { cause: P.flightsCount });
    const ev = await save(ph);
    check(ev && ev.players.length === 20 && JSON.stringify(Object.values(ev.groupSizeOverrides || {})) === '[4,4,4,4,4]', 'BLOCKER', 'space-saved', 'Space form: not saved as 20 golfers in 5 groups', { cause: ev && JSON.stringify(ev.groupSizeOverrides) });
    await firstScore(ph, 1);
    errorsFinding(ph, 'space-form path');
    await ph.close();
};

PATHS['D-wholeround'] = async function () {
    const P = startPath('D-wholeround');
    const server = new Server(F.server());
    const ph = await newPhone('manny', { server });
    await setup(ph, { course: 'Dobson', text: F.PAIRINGS_SLASH, via: 'round', weekly: false });
    P.rowsCount = P.rows.length;
    check(!/Read: 1 day, (?!20 )\d+ golfers/.test(P.roundReview || ''), 'MEDIUM', 'wholeround-count', '"Paste the whole round" says "Read: 1 day, 18 golfers" for 20 golfers (the two Matts and two Mikes counted once) and calls them "in two groups on the same day" / "two handicaps"', { repro: 'Players > Paste the whole round > the 20 pairings > Read it', shot: P.shots.find((x) => /paste-round-review/.test(x)), cause: 'the review counts plan.players (names de-duplicated) and the same-name checks treat two golfers as one' });
    check(P.rows.length === 20 && JSON.stringify(P.rows.map((r) => r[2])) === JSON.stringify(F.FLIGHT) && JSON.stringify(P.rows.map((r) => r[1])) === JSON.stringify(F.HCP), 'HIGH', 'wholeround-flights', '"Paste the whole round" with the same 20 pairings does not give the same golfers / handicaps / flights as Paste Player List', { repro: 'Players > Paste the whole round > paste > Read it > Confirm', shot: P.shots[P.shots.length - 1], cause: JSON.stringify(P.rows.slice(0, 6)) + ' flights ' + P.flightsCount });
    const ev = await save(ph);
    check(ev && ev.flights && ev.flights.enabled, 'HIGH', 'wholeround-saved-flights', '"Paste the whole round": flights not on in the saved round', { cause: ev && JSON.stringify(ev.flights) });
    await firstScore(ph, 1);
    errorsFinding(ph, 'paste-the-whole-round path');
    await ph.close();
};

PATHS['D-1golfer'] = async function () {
    const P = startPath('D-1golfer');
    const server = new Server(F.server());
    const ph = await newPhone('manny', { server });
    await setup(ph, { course: 'Dobson', oneGolfer: true });
    const ev = await save(ph);
    check(ev && ev.players.length === 1 && ev.players[0].name === 'Manny', 'BLOCKER', 'one-saved', 'A one-golfer round did not save Manny alone', { cause: ev && JSON.stringify(ev.players) });
    await ph.tap({ sel: 'button', text: /START SCORING/ }, { settle: 5000 });
    await shot(ph, 'card');
    const picker = await ph.eval("(function(){ var m = document.getElementById('group-pick-modal'); return !!(m && m.offsetParent); })()");
    check(!picker, 'MEDIUM', 'one-picker', 'A one-golfer round still asks "How are you joining this round?"', { shot: P.shots[P.shots.length - 1] });
    if (picker) await ph.tap({ sel: 'button, [role=button], div[onclick], .gp-row', text: /Keep score for Group 1/ }, { settle: 2500 });
    await ph.type('.score-input[data-hole="1"]:not([disabled])', '4', { settle: 300 });
    await ph.eval("document.activeElement && document.activeElement.blur && document.activeElement.blur(), 1");
    await sleep(1000);
    P.toFirstScore = { taps: ph.taps, screens: ph.screens, tapLog: (ph.tapLog || []).slice() };
    await shot(ph, 'first-score');
    await ph.sync();
    check(String(server.read('events/' + P.code + '/scores/p' + ev.players[0].id + '_h1')) === '4', 'BLOCKER', 'one-score', 'One-golfer round: the score did not save', {});
    errorsFinding(ph, 'one-golfer path');
    await ph.close();
};

PATHS['D-2groups'] = async function () {
    const P = startPath('D-2groups');
    const server = new Server(F.server());
    const ph = await newPhone('manny', { server });
    const text = F.PAIRINGS_SLASH.split('\n\n').slice(0, 2).join('\n\n');
    await setup(ph, { course: 'Dobson', text, via: 'list' });
    const ev = await save(ph);
    check(ev && ev.players.length === 8 && JSON.stringify(Object.values(ev.groupSizeOverrides || {})) === '[4,4]', 'BLOCKER', 'two-groups', 'Two pasted groups did not save as 2 groups of 4', { cause: ev && JSON.stringify(ev.groupSizeOverrides) });
    await firstScore(ph, 2);
    errorsFinding(ph, 'two-group path');
    await ph.close();
};

PATHS['D-shotgun'] = async function () {
    const P = startPath('D-shotgun');
    const server = new Server(F.server());
    const ph = await newPhone('manny', { server });
    await setup(ph, { course: 'Dobson', text: F.PAIRINGS_SLASH, via: 'list' });
    await save(ph);
    // The two-tee start: groups 4 and 5 off the 10th, on Round Ready.
    note('The app offers each group Hole 1 or Hole 10 only (Round Ready "Starts on"); a true shotgun (groups on holes 1..18) is not available.');
    for (const g of [4, 5]) { await ph.select('#group-tee-' + g, '10'); await sleep(900); }
    await shot(ph, 'ready-groups-4-5-on-10');
    await ph.sync();
    const ev = server.read('events/' + P.code);
    check(ev && ev.groupStartingHoles && Number(ev.groupStartingHoles['4']) === 10 && Number(ev.groupStartingHoles['5']) === 10, 'HIGH', 'shotgun-saved', 'Groups 4 and 5 "Starts on Hole 10" was not saved', { cause: ev && JSON.stringify(ev.groupStartingHoles) });
    const fs1 = await firstScore(ph, 4);
    check(fs1 && fs1.hole === 10, 'HIGH', 'shotgun-hole', 'Group 4 (off the 10th) opened on hole ' + (fs1 && fs1.hole) + ', not 10', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(P.cardInputs) });
    await openGps(ph);
    await shot(ph, 'gps-group-4');
    const g = await gpsState(ph);
    check(/\b10\b/.test(g.text) || g.hole === 10, 'HIGH', 'shotgun-gps-hole', 'GPS for Group 4 (off the 10th) did not open on hole 10', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(g).slice(0, 300) });
    errorsFinding(ph, 'two-tee start path');
    await ph.close();
};

PATHS['D-back9'] = async function () {
    const P = startPath('D-back9');
    const server = new Server(F.server());
    const ph = await newPhone('manny', { server });
    await setup(ph, { course: 'Dobson', text: F.PAIRINGS_SLASH.split('\n\n')[0], via: 'list', start: 10 });
    const ev = await save(ph);
    check(ev && Number(ev.startingHole) === 10, 'BLOCKER', 'back9-saved', 'Start on Hole 10 was not saved', { cause: ev && ev.startingHole });
    const fs1 = await firstScore(ph, 1);
    check(fs1 && fs1.hole === 10, 'BLOCKER', 'back9-card-hole', 'A round starting on 10 opened the card on hole ' + (fs1 && fs1.hole), { shot: P.shots[P.shots.length - 1] });
    await openGps(ph);
    await shot(ph, 'gps-back9');
    const g = await gpsState(ph);
    check(/\b10\b/.test(g.text) || g.hole === 10, 'HIGH', 'back9-gps-hole', 'GPS on a round starting on 10 did not open on hole 10', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(g).slice(0, 300) });
    errorsFinding(ph, 'back-nine path');
    await ph.close();
};

PATHS['D-thistle'] = async function () {
    const P = startPath('D-thistle');
    const server = new Server(F.server());
    const ph = await newPhone('manny', { server, pre: GEO([33.904046, -78.545205]) });
    await setup(ph, { course: 'Thistle', nines: ['MacKay', 'Stewart'], text: F.PAIRINGS_SLASH.split('\n\n')[0], via: 'list' });
    const ev = await save(ph);
    P.thistleSaved = ev && { key: ev.activeCourseKey, name: ev.courseName, holes: (ev.courseData || []).length };
    check(ev && /MacKay/i.test(ev.courseName || '') && /Stewart/i.test(ev.courseName || ''), 'HIGH', 'thistle-name', 'The Thistle round is not saved as MacKay / Stewart', { cause: JSON.stringify(P.thistleSaved) });
    await firstScore(ph, 1);
    await openGps(ph);
    await shot(ph, 'gps-thistle');
    const g = await gpsState(ph);
    P.thistleGps = g;
    check(g.side === 'gps' && !/not mapped|No GPS/i.test(g.text), 'HIGH', 'thistle-gps', 'GPS on Thistle MacKay / Stewart did not open on a mapped hole 1', { shot: P.shots[P.shots.length - 1], cause: g.text.slice(0, 200) });
    errorsFinding(ph, 'two-nines path');
    await ph.close();
};

// ---- E ------------------------------------------------------------------------
PATHS['E-back'] = async function () {
    const P = startPath('E-back');
    const server = new Server(F.server());
    const ph = await newPhone('manny', { server });
    await setup(ph, { course: 'Dobson', text: F.PAIRINGS_SLASH, via: 'list', weekly: true });
    const seen = [];
    for (let i = 0; i < 6; i++) {
        const s0 = await step(ph);
        const back = await ph.tap({ sel: '.wizard-step.active .wizard-btn-back' }, { settle: 900 });
        const s1 = await step(ph);
        await shot(ph, 'back-from-' + (STEP_NAME[s0] || s0));
        seen.push([s0, s1, !!back]);
        if (!back || s1 === s0) break;
    }
    P.backSeen = seen;
    const order = seen.map((x) => x[1]).join('>');
    check(/^6>5>1>3/.test(order), 'HIGH', 'back-order', 'Back from Review does not walk Money > Players > Course > Games', { cause: order });
    // Everything still there?
    const st = await ph.json("{ course: document.getElementById('course-search-input').value, tee: (document.getElementById('tee-rating-select')||{}).value, rows: document.querySelectorAll('#player-list .player-row').length, flights: (document.getElementById('flights-count')||{}).textContent, weekly: document.getElementById('mp-enabled').checked, fmt: document.getElementById('game-format-select').value }");
    P.afterBack = st;
    check(st.course === 'Dobson Ranch Golf Course' && st.rows === 20 && /A: 10 · B: 10/.test(st.flights) && st.weekly && st.fmt === 'stroke', 'HIGH', 'back-lost-state', 'Back to the first step lost something (course / 20 golfers / flights / Weekly Game)', { cause: JSON.stringify(st) });
    // Forward again: does anything ask twice? Games -> a card tap moves on.
    await ph.tap('#fmt-card-stroke', { settle: 1200 });
    const s = await step(ph);
    check(s === 1, 'MEDIUM', 'back-forward', 'Going forward again from Games did not move on to Course', { cause: 'step ' + s });
    await ph.tap({ sel: 'button', text: /^Next: Players/ }, { settle: 1200 });
    const r2 = await rows(ph);
    check(r2.length === 20, 'HIGH', 'back-forward-players', 'After Back and forward, Players no longer has 20 golfers', { cause: r2.length });
    await shot(ph, 'forward-players');
    // The phone's own back (Android / the in-app Back): the hardware back on step 1 goes nowhere.
    // The top-left "← Back" link on the setup page: where does it go mid-setup?
    const topBack = await ph.json("(function(){ var a = Array.prototype.filter.call(document.querySelectorAll('a, button'), function (e) { return /^\\s*←\\s*Back\\s*$/.test(e.innerText || '') && e.getBoundingClientRect().width > 0; })[0]; return a ? { text: a.innerText, href: a.getAttribute('href'), onclick: a.getAttribute('onclick') } : null; })()");
    P.topBack = topBack;
    if (topBack) {
        await ph.tap({ sel: 'a, button', text: /^←\s*Back$/ }, { settle: 3000 });
        await shot(ph, 'top-back-link');
        const where = await ph.json("{ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id || null }");
        P.topBackWent = where;
        // URGENT-009 (013-9): asked first ("Leave round setup?"), and the setup is kept as a draft.
        const asked = await ph.json("{ open: !!document.querySelector('#ui-sheet-yes'), text: ((document.querySelector('.ui-sheet-card')||{}).innerText||'').replace(/\\s+/g,' ') }");
        P.topBackAsked = asked;
        check(!/home\.html/.test(where.url) && asked.open && /Leave round setup/.test(asked.text), 'MEDIUM', 'top-back-loses-setup', 'The setup page\'s top "← Back" leaves an unsaved setup (20 pasted golfers) with no warning', { repro: 'Mid-setup, tap "← Back" at the top', shot: P.shots[P.shots.length - 1], cause: JSON.stringify({ where, asked }) });
        if (asked.open) {
            await ph.tap('#ui-sheet-yes', { settle: 3000 });
            await shot(ph, 'top-back-left');
            const after = await ph.json("{ url: document.URL, draft: ((document.getElementById('hp-resume')||{}).innerText||'').replace(/\\s+/g,' ') }");
            P.topBackLeft = after;
            check(/Resume your unsaved round setup/.test(after.draft) || !/home\.html/.test(after.url), 'MEDIUM', 'top-back-no-draft', 'After "Leave", Home does not offer "Resume your unsaved round setup?"', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(after) });
        }
    }
    errorsFinding(ph, 'Back path');
    await ph.close();
};

PATHS['E-kill'] = async function () {
    const P = startPath('E-kill');
    const server = new Server(F.server());
    const results = [];
    // Kill at each setup step: Games, Course (picked), Players (pasted), Money, Review.
    const stops = process.env.SIM_KILL_STOPS ? process.env.SIM_KILL_STOPS.split(',') : ['games', 'course', 'players', 'money', 'review', 'ready'];
    for (const stop of stops) {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-kill-'));
        let ph = await newPhone('manny', { server: new Server(F.server()), profileDir: profile });
        await ph.tap('#v-main .hp-door.games');
        await ph.tap({ sel: '#v-games [data-hp-act="start"]' }, { settle: 4500 });
        const c0 = await code(ph);
        if (stop !== 'games') {
            await ph.tap('#fmt-card-stroke', { settle: 1200 });
            await ph.type('#course-search-input', 'Dobson', { settle: 1500 });
            await ph.tap({ sel: '#course-dropdown > *', text: /^Dobson Ranch Golf Course/ }, { settle: 2500 });
        }
        if (['players', 'money', 'review', 'ready'].indexOf(stop) !== -1) {
            await ph.tap({ sel: 'button', text: /^Next: Players/ }, { settle: 1500 });
            await ph.tap({ sel: 'button', text: /Paste Player List/ }, { settle: 700 });
            await ph.type('#paste-players-textarea', F.PAIRINGS_SLASH, { settle: 900 });
            await ph.tap('#paste-players-commit-btn', { settle: 1500 });
        }
        if (['money', 'review', 'ready'].indexOf(stop) !== -1) { await ph.tap({ sel: 'button', text: /^Next: Money/ }, { settle: 1500 }); await ph.tap('#mp-enabled', { settle: 1000 }); }
        if (stop === 'review' || stop === 'ready') await ph.tap('#wizard-next-6', { settle: 1500 });
        if (stop === 'ready') { await ph.tap('#main-save-btn', { settle: 4000 }); await ph.waitFor("(function(){ var r = document.getElementById('round-ready-screen'); return r && r.style.display === 'block'; })()", 8000); }
        await shot(ph, 'before-kill-' + stop);
        ph = await relaunch(ph);
        await shot(ph, 'reopen-after-' + stop);
        const home = await ph.json("{ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id || null, resume: ((document.getElementById('hp-resume')||{}).innerText||'').trim(), text: document.body.innerText.slice(0, 200).replace(/\\s+/g,' ') }");
        // Is the setup anywhere? The Games door's YOUR ROUND, then Start a round again.
        await ph.tap('#v-main .hp-door.games', { settle: 2500 });
        home.yourRound = ((await ph.text('#hp-today')) || '').slice(0, 160);
        await shot(ph, 'games-after-' + stop);
        // The draft itself (URGENT-009): Resume it brings back the course and the 20 golfers.
        if (stop === 'money' && /Resume your unsaved round setup/.test(home.resume)) {
            await ph.tap('#v-games [data-hp-draft]', { settle: 5000 });
            await shot(ph, 'draft-resumed-' + stop);
            P.draftResume = await ph.json("{ url: document.URL, step: typeof currentWizardStep !== 'undefined' ? currentWizardStep : null, course: (document.getElementById('course-search-input')||{}).value || '', rows: Array.prototype.filter.call(document.querySelectorAll('#player-list .p-name-input'), function (i) { return i.value; }).length, weekly: !!(document.getElementById('mp-enabled')||{}).checked }");
            check(P.draftResume.rows === 20 && /Dobson/.test(P.draftResume.course) && P.draftResume.weekly, 'MEDIUM', 'draft-resume', 'Resume your unsaved round setup did not bring back the course, the 20 golfers and the Weekly Game', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(P.draftResume) });
            await ph.eval("location.href = 'home.html#games'");
            await sleep(3000);
        }
        await ph.tap({ sel: '#v-games [data-hp-act="start"]' }, { settle: 4500 });
        await newSetupPlease(ph);
        const c1 = await code(ph);
        await ph.waitFor("!!document.querySelector('#fmt-card-stroke')", 6000);
        const again = await ph.json("{ step: typeof currentWizardStep !== 'undefined' ? currentWizardStep : null, course: (document.getElementById('course-search-input')||{}).value || '', rows: Array.prototype.filter.call(document.querySelectorAll('#player-list .p-name-input'), function (i) { return i.value; }).length }");
        await shot(ph, 'start-again-after-' + stop);
        results.push({ stop, before: c0, home, after: c1, again });
        errorsFinding(ph, 'reopen after kill at ' + stop);
        await ph.close();
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    }
    P.kills = results;
    const lost = results.filter((r) => r.stop !== 'games' && r.stop !== 'ready' && r.again.rows === 0 && !r.again.course && !/Resume/.test(r.home.resume));
    const rdy = results.find((r) => r.stop === 'ready');
    if (rdy) check(/Resume/.test(rdy.home.resume), /YOUR ROUND/.test(rdy.home.yourRound || '') ? 'LOW' : 'HIGH', 'kill-after-save-no-resume', 'Saved the round, killed the app on Round Ready (before START SCORING): Home offers no "Resume"' + (/YOUR ROUND/.test(rdy.home.yourRound || '') ? ' (Games > YOUR ROUND has it, one tap more)' : ' and Games has no YOUR ROUND - the organizer needs the code'), { repro: 'Save & Start Round, then swipe the app away on Round Ready, reopen', shot: path.join(OUT, current), cause: 'hardpan_last_round is written only when the scorecard opens; Save on Round Setup does not set it (home: ' + JSON.stringify(rdy.home).slice(0, 160) + ')' });
    check(!lost.length, 'MEDIUM', 'kill-mid-setup-loses', 'Killing the app mid-setup loses the whole unsaved setup (course, 20 pasted golfers, flights, Weekly Game): the reopen offers no Resume and Start a round starts from scratch with a new code', { repro: 'Setup to Players (pasted) / Money / Review, kill, reopen', shot: path.join(OUT, current), cause: 'Round Setup keeps nothing until Save & Start (no draft); lost at: ' + lost.map((r) => r.stop).join(', ') });
    check(results.every((r) => r.home.view === 'v-main' && /home\.html/.test(r.home.url)), 'HIGH', 'kill-reopen-home', 'A reopen after a mid-setup kill did not land on Home', { cause: JSON.stringify(results.map((r) => r.home)) });
};

PATHS['E-switch'] = async function () {
    const P = startPath('E-switch');
    const server = new Server(F.server());
    const ph = await newPhone('manny', { server });
    // MID-SETUP, Games -> GPS: on the Players step with 20 pasted, tap Home, then GPS.
    await ph.tap('#v-main .hp-door.games');
    await ph.tap({ sel: '#v-games [data-hp-act="start"]' }, { settle: 4500 });
    const c0 = await code(ph);
    await ph.tap('#fmt-card-stroke', { settle: 1200 });
    await ph.type('#course-search-input', 'Dobson', { settle: 1500 });
    await ph.tap({ sel: '#course-dropdown > *', text: /^Dobson Ranch Golf Course/ }, { settle: 2500 });
    await ph.tap({ sel: 'button', text: /^Next: Players/ }, { settle: 1500 });
    await ph.tap({ sel: 'button', text: /Paste Player List/ }, { settle: 700 });
    await ph.type('#paste-players-textarea', F.PAIRINGS_SLASH, { settle: 900 });
    await ph.tap('#paste-players-commit-btn', { settle: 1500 });
    await shot(ph, 'setup-players-pasted');
    // Is there a GPS | Games switch on the setup screen at all?
    const sw = await ph.json("Array.prototype.filter.call(document.querySelectorAll('button, a, [role=tab]'), function (e) { var r = e.getBoundingClientRect(); return r.width > 0 && /^\\s*(📍\\s*)?GPS\\s*$/.test(e.innerText || ''); }).length");
    P.setupHasGpsSwitch = sw;
    await ph.tap({ sel: 'button, a, div[onclick]', text: /^🏠\s*Home$|^Home$/ }, { settle: 1200 });
    // URGENT-009 (013-9): "Leave round setup?" - the setup is kept on this phone; Leave.
    P.leaveAsked = !!(await ph.eval("!!document.querySelector('#ui-sheet-yes')"));
    if (P.leaveAsked) await ph.tap('#ui-sheet-yes', { settle: 3000 });
    await shot(ph, 'setup-tap-home');
    const h = await ph.json("{ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id || null, dialogs: (window.__DIALOGS||[]).length }");
    P.homeFromSetup = h;
    await ph.tap('#v-main .hp-door.gps', { settle: 3500 });
    await shot(ph, 'gps-door-mid-setup');
    const gv = await ph.json("{ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id || null, text: ((document.querySelector('.hp-view.on')||document.body).innerText||'').slice(0, 300).replace(/\\s+/g,' ') }");
    P.gpsMidSetup = gv;
    // ...and back to Games: is the setup still there?
    await ph.tap({ sel: 'button, a, [role=tab]', text: /^Games$/ }, { settle: 1200 });
    await shot(ph, 'back-to-games');
    const gamesText = await ph.text('.hp-view.on');
    P.gamesAfterSwitch = (gamesText || '').slice(0, 300);
    check(new RegExp(c0).test(gamesText || '') || /Resume|Continue|setup/i.test(gamesText || ''), 'MEDIUM', 'switch-mid-setup-loses', 'Switching to GPS mid-setup (Home > GPS > Games) leaves no way back to the half-built round (20 pasted golfers): Games offers only "+ Start a round" (a new code)', { repro: 'Round Setup Players step (pasted) > 🏠 Home > GPS > Games', shot: P.shots[P.shots.length - 1], cause: 'an unsaved setup exists only in the admin page; Home/Games keep no pointer to it (code ' + c0 + ')' });
    // The GPS door's own course search (GPS-1) at Dobson: one row, never the merged record.
    await ph.tap({ sel: 'button, a, [role=tab]', text: /^GPS$/ }, { settle: 3000 });
    await ph.type('#hp-q', 'Dobson', { settle: 800 });
    await shot(ph, 'gps-search-dobson');
    const gpsRows = await ph.json("Array.prototype.map.call(document.querySelectorAll('#hp-results-list .hp-row'), function (b) { var k = b.getAttribute('data-hp-course') || (b.querySelector('[data-hp-course]') || {getAttribute:function(){return '';}}).getAttribute('data-hp-course'); return [k || '', b.innerText.replace(/\\s+/g,' ')]; })");
    P.gpsSearch = gpsRows;
    const dobRows = gpsRows.filter((r) => /Dobson Ranch/.test(r[1]) && !/Search online/.test(r[1]));
    check(dobRows.length === 1 && !gpsRows.some((r) => r[0] === 'gapi_0121324924309988'), 'HIGH', 'gps-dobson-dup', 'The GPS door\'s course search offers the merged Dobson duplicate (or two Dobson rows)', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(gpsRows) });
    // MID-ROUND, both directions: a one-group round from the Games door, the card, GPS,
    // GPS's own "Games", back to the Card - and the hole and the group survive each hop.
    await ph.tap({ sel: 'button, a, [role=tab]', text: /^Games$/ }, { settle: 1200 });
    await setup(ph, { course: 'Dobson', text: F.PAIRINGS_SLASH.split('\n\n')[0], via: 'list', skipHome: true });
    await save(ph);
    const fsr = await firstScore(ph, 1, { playerId: null });
    // Next hole on the card, then GPS: GPS must open on the card's hole (2).
    await ph.tap({ sel: '.hole-view-nav-btn', text: /Next/ }, { settle: 1200 });
    const cardHole = await ph.eval("typeof currentViewedHole !== 'undefined' ? currentViewedHole : null");
    await openGps(ph);
    await whoAmI(ph, 'Manny');
    await shot(ph, 'round-gps-hole-' + cardHole);
    const g2 = await gpsState(ph);
    P.midRoundGps = { cardHole, g2 };
    check(g2.side === 'gps' && (g2.hole === Number(cardHole) || new RegExp('Hole ' + cardHole + ' ').test(g2.text)), 'HIGH', 'switch-hole-to-gps', 'Card -> GPS mid-round did not keep the hole (card on ' + cardHole + ')', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(g2).slice(0, 300) });
    // GPS -> Games: layout D's "Games".
    const gm = await ph.tap({ sel: '#gps-overlay button, #gps-overlay [role=button]', text: /^Games/ }, { settle: 1500 });
    await shot(ph, 'round-gps-games');
    P.gpsGames = (await ph.visibleText()).slice(0, 500);
    check(gm, 'MEDIUM', 'gps-games-btn', 'Layout D shows no "Games" control', {});
    const closed = await ph.tap('#fd-addgame button[aria-label="Back"]', { settle: 900 });
    check(closed && !(await visible(ph, '#fd-addgame')), 'MEDIUM', 'addgame-close', 'The Add a game sheet (from GPS\'s Games) does not close with its "‹"', { shot: P.shots[P.shots.length - 1] });
    // GPS -> Card.
    await ph.tap({ sel: '#gps-overlay button, #gps-overlay [role=button]', text: /Card/ }, { settle: 1500 });
    await shot(ph, 'round-back-to-card');
    const back = await ph.json("{ side: window.HardPanGps && HardPanGps.side ? HardPanGps.side() : null, hole: typeof currentViewedHole !== 'undefined' ? currentViewedHole : null, url: document.URL }");
    P.midRoundCard = back;
    check(back.side !== 'gps' && Number(back.hole) === Number(cardHole), 'HIGH', 'switch-gps-to-card', 'GPS -> Card mid-round lost the hole or the group', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(back) });
    // Layout C spot-check: Tools > Screen layout > Bottom panel.
    await openGps(ph);
    await ph.tap({ sel: '#gps-overlay button', text: /Tools/ }, { settle: 1000 });
    await shot(ph, 'round-tools-sheet');
    const lc = await ph.tap('[data-ts-seg="layout"] [data-v="c"]', { settle: 1500 });
    await shot(ph, 'round-tools-bottom-panel');
    P.sideBeforeKill = await ph.eval("localStorage.getItem('hardpan_round_side')");
    await shot(ph, 'round-layout-c');
    const gc = await gpsState(ph);
    P.layoutC = { tapped: !!lc, lc: gc.lc, ld: gc.ld, text: gc.text.slice(0, 200) };
    check(lc && gc.lc, 'MEDIUM', 'layout-c', 'Tools > Screen layout > Bottom panel did not switch to layout C', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(P.layoutC) });
    errorsFinding(ph, 'GPS/Games switching');
    // Kill on the GPS side, reopen, Resume: back on GPS, same hole.
    const ph2 = await relaunch(ph);
    await ph2.tap('#hp-resume .hp-resume', { settle: 5000 });
    await sleep(1500);
    await shot(ph2, 'round-resumed-on-gps');
    const r2 = await gpsState(ph2);
    P.resumeOnGps = r2;
    P.sideAfterReopen = await ph2.eval("localStorage.getItem('hardpan_round_side')");
    check(r2.side === 'gps' && (r2.hole === Number(cardHole) || new RegExp('Hole ' + cardHole + ' ').test(r2.text)), 'HIGH', 'resume-gps-side', 'Killed on GPS (hole ' + cardHole + '), Resume did not come back to GPS on that hole', { shot: P.shots[P.shots.length - 1], cause: JSON.stringify(r2).slice(0, 300) });
    check(r2.lc, 'LOW', 'layout-c-kept', 'Layout C (Bottom panel) was not remembered after the app was killed', { cause: JSON.stringify(r2).slice(0, 120) });
    errorsFinding(ph2, 'GPS/Games switching (after reopen)');
    await ph2.close();
};

PATHS['E-airplane'] = () => airplane(false);
PATHS['E-airplane-kill'] = () => airplane(true);
async function airplane(killIt) {
    const P = startPath(killIt ? 'E-airplane-kill' : 'E-airplane');
    const server = new Server(F.server());
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-air-'));
    let ph = await newPhone('manny', { server, profileDir: profile });
    await ph.tap('#v-main .hp-door.games');
    await ph.tap({ sel: '#v-games [data-hp-act="start"]' }, { settle: 4500 });
    await ph.tap('#fmt-card-stroke', { settle: 1200 });
    await ph.type('#course-search-input', 'Dobson', { settle: 1500 });
    await ph.tap({ sel: '#course-dropdown > *', text: /^Dobson Ranch Golf Course/ }, { settle: 2500 });
    await ph.tap({ sel: 'button', text: /^Next: Players/ }, { settle: 1500 });
    // AIRPLANE MODE ON, mid-setup.
    await ph.offline(true);
    await shot(ph, 'airplane-on-players');
    await ph.tap({ sel: 'button', text: /Paste Player List/ }, { settle: 700 });
    await ph.type('#paste-players-textarea', F.PAIRINGS_SLASH, { settle: 900 });
    await ph.tap('#paste-players-commit-btn', { settle: 1500 });
    await ph.tap({ sel: 'button', text: /^Next: Money/ }, { settle: 1500 });
    await ph.tap('#mp-enabled', { settle: 1000 });
    await ph.tap('#wizard-next-6', { settle: 1500 });
    await shot(ph, 'airplane-review');
    await ph.tap('#main-save-btn', { settle: 5000 });
    await shot(ph, 'airplane-save-tapped');
    const s1 = await ph.json("{ ready: (function(){ var r = document.getElementById('round-ready-screen'); return !!(r && r.style.display === 'block'); })(), btn: (document.getElementById('main-save-btn')||{}).innerText, disabled: (document.getElementById('main-save-btn')||{}).disabled, text: document.body.innerText.replace(/\\s+/g,' ').slice(0, 400), pending: window.__simPendingCount ? __simPendingCount() : null, q: (function(){ try { return JSON.parse(localStorage.getItem('golfapp_wq_v1')||'[]').length; } catch (e) { return null; } })() }");
    await sleep(8000);
    await shot(ph, 'airplane-save-13s');
    const s2 = await ph.json("{ ready: (function(){ var r = document.getElementById('round-ready-screen'); return !!(r && r.style.display === 'block'); })(), btn: (document.getElementById('main-save-btn')||{}).innerText, disabled: (document.getElementById('main-save-btn')||{}).disabled, said: Array.prototype.map.call(document.querySelectorAll('.ui-toast, .toast, [role=alert], [role=status]'), function (e) { return e.innerText; }).filter(Boolean).join(' | ').slice(0, 300), connecting: /Connecting/.test(document.body.innerText) }");
    P.offlineSave = { s1, s2 };
    check(s2.ready || /offline|no signal|no connection|saved on this phone|when you have signal/i.test(s2.said + ' ' + s2.btn), 'HIGH', 'airplane-save-silent', 'Save & Start with no signal: after 13 s nothing says what is happening (no Round Ready, no "no signal" message)', { repro: 'Mid-setup turn on airplane mode, finish, Save & Start Round', shot: P.shots[P.shots.length - 1], cause: JSON.stringify(s2) });
    check(!s2.connecting, 'HIGH', 'airplane-connecting', 'A frozen "Connecting…" after Save with no signal', { shot: P.shots[P.shots.length - 1] });
    // THE APP KILLED WHILE THE SAVE WAITS FOR SIGNAL, then opened again (still no signal),
    // then the signal comes back: is the round (20 golfers) anywhere?
    if (killIt) {
        ph = await relaunch(ph, fileUrl('index.html'), 4500);
        await shot(ph, 'airplane-killed-reopened');
        const k1 = await ph.json("{ url: document.URL, view: (document.querySelector('.hp-view.on')||{}).id || null, resume: ((document.getElementById('hp-resume')||{}).innerText||'').trim(), q: (function(){ try { return JSON.parse(localStorage.getItem('golfapp_wq_v1')||'[]').length; } catch (e) { return null; } })(), text: document.body.innerText.replace(/\\s+/g,' ').slice(0, 300) }");
        await ph.offline(false);
        await sleep(5000);
        await ph.sync();
        await shot(ph, 'airplane-killed-signal-back');
        const c1 = Object.keys(server.db.events || {});
        P.killWhileSaving = { k1, codes: c1, players: c1.map((c) => ((server.db.events[c] || {}).players || []).length) };
        check(c1.some((c) => ((server.db.events[c] || {}).players || []).length === 20), 'HIGH', 'airplane-kill-loses-round', 'Save & Start with no signal, then the app killed: the round (20 golfers, course, Weekly Game) is lost - nothing is kept on the phone to send when the signal returns', { repro: 'Airplane mode, finish setup, Save & Start Round ("Still saving - keep this page open"), swipe the app away, reopen, signal back', shot: P.shots[P.shots.length - 1], cause: 'the setup save is one Firebase update held only in memory (not in the durable queue golfapp_wq_v1); after the kill: ' + JSON.stringify(k1).slice(0, 200) });
        errorsFinding(ph, 'airplane kill during save');
        await ph.close();
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
        return;
    }
    // Signal back.
    await ph.offline(false);
    await sleep(4000);
    await shot(ph, 'signal-back');
    await ph.sync();
    const c = await code(ph);
    const ev = server.read('events/' + c);
    const s3 = await ph.json("{ ready: (function(){ var r = document.getElementById('round-ready-screen'); return !!(r && r.style.display === 'block'); })(), btn: (document.getElementById('main-save-btn')||{}).innerText }");
    P.offlineAfter = { s3, saved: !!(ev && ev.players), players: ev && ev.players && ev.players.length };
    check(ev && ev.players && ev.players.length === 20, 'HIGH', 'airplane-save-lands', 'After the signal came back the round (20 golfers) was not on the server', { cause: JSON.stringify(P.offlineAfter) });
    check(s3.ready || (ev && ev.players), 'MEDIUM', 'airplane-ready', 'After the signal came back the setup screen did not move on to Round Ready', { cause: JSON.stringify(s3) });
    errorsFinding(ph, 'airplane mode');
    // ...and the code issue itself with no signal (Start a round in airplane mode).
    await ph.kill();
    ph = await Phone.launch({ name: 'manny', server, preScript: PRE, shotDir: path.join(OUT, current), viewport: VIEW, webgl: true, profileDir: profile });
    ph._offline = true;
    await ph.reopen(fileUrl('home.html', '#games'), 3500);
    await ph.eval("window.__simSetOffline && __simSetOffline(true)");
    await ph.tap({ sel: '#v-games [data-hp-act="start"]' }, { settle: 9000 });
    await shot(ph, 'airplane-start-a-round');
    const st = await ph.json("{ url: document.URL, text: document.body.innerText.replace(/\\s+/g,' ').slice(0, 300), connecting: /Connecting/.test(document.body.innerText) }");
    P.offlineStart = st;
    check(!st.connecting, 'HIGH', 'airplane-start-connecting', '"Start a round" with no signal sits on "Connecting…"', { shot: P.shots[P.shots.length - 1], cause: st.text });
    errorsFinding(ph, 'airplane Start a round');
    await ph.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}

// ============================================================================
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const names = Object.keys(PATHS).filter((n) => !ONLY.length || ONLY.indexOf(n) !== -1);
    const t0 = Date.now();
    for (const n of names) {
        const t = Date.now();
        try { await PATHS[n](); }
        catch (e) { current = n; finding('HIGH', 'sim-crash', 'The simulation of ' + n + ' could not finish: ' + String(e && e.message || e).slice(0, 200), { cause: String(e && e.stack || e).split('\n').slice(0, 3).join(' | ') }); }
        if (paths[n]) paths[n].seconds = Math.round((Date.now() - t) / 1000);
        registry.shutdownAll && registry.shutdownAll();
    }
    const rank = { BLOCKER: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    findings.sort((a, b) => rank[a.sev] - rank[b.sev]);
    const summary = {
        ran: names, seconds: Math.round((Date.now() - t0) / 1000), out: OUT,
        counts: Object.fromEntries(Object.values(paths).map((p) => [p.name, p.toFirstScore])),
        findings,
        paths: Object.fromEntries(Object.values(paths).map((p) => [p.name, Object.assign({}, p, { shots: p.shots.map((s) => path.basename(s)) })]))
    };
    fs.writeFileSync(path.join(OUT, 'setup-shapes-summary.json'), JSON.stringify(summary, null, 1));
    const bad = findings.filter((f) => (f.sev === 'BLOCKER' || f.sev === 'HIGH') && !f.known);
    console.log(JSON.stringify({ ran: names, seconds: summary.seconds, counts: summary.counts, findings: findings.map((f) => f.sev + (f.known ? ' (known, open)' : '') + ' ' + f.path + ' ' + f.id + ': ' + f.title + (f.cause ? ' [' + String(f.cause).slice(0, 240) + ']' : '')) }, null, 1));
    process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
