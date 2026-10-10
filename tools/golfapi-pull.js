#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - GOLFAPI.IO PULLER (build 9, 2026-10-10)
//
// Runs on a Mac by hand. PHONES NEVER CALL GOLFAPI, and the key never goes into
// the app, the repo or the web build: it is read from GOLFAPI_KEY in the
// environment or in a .env file at the repo root (gitignored), and it is never
// printed or logged.
//
//   node tools/golfapi-pull.js --search "Talking Stick" --state AZ   (0.1 call)
//   node tools/golfapi-pull.js --pull <courseID> [--key <ourCourseKey>]  (2 calls)
//   node tools/golfapi-pull.js --link <courseID> <ourCourseKey>      (no call)
//   node tools/golfapi-pull.js --build                               (no call)
//   node tools/golfapi-pull.js --list                                (no call)
//   flags: --dry-run (say what would be called, call nothing)
//          --floor N (stop before a call when apiRequestsLeft < N; default 2)
//          --refresh (re-pull a course already stored - never otherwise)
//
// WHERE THINGS GO - all under golfapi/, which is GITIGNORED (the repo is public,
// and GolfAPI's terms forbid redistributing the data):
//   golfapi/raw/<courseID>.course.json, .coordinates.json   the API answers
//   golfapi/calls.log      one JSON line per call: when, endpoint, cost, apiRequestsLeft
//   golfapi/links.json     { ourCourseKey: courseID } (--key / --link)
//   golfapi/gps-golfapi.js the STRIPPED file the iOS app ships (--build): pars,
//                          handicaps, tee yards, green front/center/back, hazards,
//                          tees, dogleg. tools/build-gps-app.js copies it into
//                          gps-beta/www ONLY; the public pages.dev build never has it.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'golfapi');
const RAW = path.join(DIR, 'raw');
const LOG = path.join(DIR, 'calls.log');
const LINKS = path.join(DIR, 'links.json');
const OUT = path.join(DIR, 'gps-golfapi.js');
const BASE = 'https://www.golfapi.io/api/v2.3';

function apiKey() {
    if (process.env.GOLFAPI_KEY) return process.env.GOLFAPI_KEY.trim();
    const env = path.join(ROOT, '.env');
    if (fs.existsSync(env)) {
        const m = fs.readFileSync(env, 'utf8').match(/^\s*GOLFAPI_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/m);
        if (m) return m[1].trim();
    }
    return null;
}
function logLines() {
    if (!fs.existsSync(LOG)) return [];
    return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}
function lastLeft() {
    const l = logLines().map((x) => leftOf(x.apiRequestsLeft)).filter((x) => x != null);
    return l.length ? l[l.length - 1] : null;
}
// ONE CALL. The endpoint (never the key) and what is left go to the log.
async function call(endpoint, cost, opts) {
    const left = lastLeft();
    if (left != null && left - cost < opts.floor) throw new Error(`floor: ${left} calls left, this needs ${cost}, floor is ${opts.floor} - not called`);
    if (opts.dryRun) { console.log(`[dry-run] would call ${endpoint} (${cost} call${cost === 1 ? '' : 's'}; ${left == null ? '?' : left} left)`); return null; }
    const key = apiKey();
    if (!key) throw new Error('no GOLFAPI_KEY (set it in the environment or in .env at the repo root)');
    const res = await fetch(BASE + endpoint, { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch (e) { body = null; }
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), endpoint, cost, status: res.status,
        apiRequestsLeft: body ? leftOf(body.apiRequestsLeft) : null }) + '\n');
    if (!res.ok || !body) throw new Error(`GolfAPI ${res.status} for ${endpoint}`);
    return body;
}

// ---- WHAT THE APP NEEDS, AND NOTHING ELSE ------------------------------------
// stripCourse / leftOf: ONE copy, shared with the Cloud Functions (gps-live).
const { stripCourse, leftOf } = require(path.join(ROOT, 'firebase-functions', 'golfapi-strip.js'));
// golfapi/held/: courses pulled before (e.g. on another machine) and handed over -
// built like raw/, never re-pulled.
const HELD = path.join(DIR, 'held');
function buildFile() {
    const dirs = [RAW, HELD].filter((d) => fs.existsSync(d));
    if (!dirs.length) throw new Error('nothing pulled yet (golfapi/raw/ is empty)');
    const courses = {};
    dirs.forEach((dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.course.json')).forEach((f) => {
        const id = f.replace(/\.course\.json$/, '');
        const course = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        const cf = path.join(dir, id + '.coordinates.json');
        if (!fs.existsSync(cf)) { console.warn('skipped ' + id + ': no coordinates'); return; }
        const coords = JSON.parse(fs.readFileSync(cf, 'utf8'));
        coords.__fetched = coords.__fetched || new Date(fs.statSync(cf).mtime).toISOString();
        courses[id] = stripCourse(course.course || course, coords);
    }));
    const links = fs.existsSync(LINKS) ? JSON.parse(fs.readFileSync(LINKS, 'utf8')) : {};
    const head = '// GENERATED by tools/golfapi-pull.js --build - do not edit, do not commit.\n'
        + '// GolfAPI.io data for HardPan GPS, stripped to what the GPS screen uses. Licensed\n'
        + '// for use INSIDE THE APP only: not for redistribution. Ships in the iOS build\n'
        + '// (tools/build-gps-app.js), never in the public web build.\n';
    const body = '(function () {\n    var data = ' + JSON.stringify({ v: 1, built: new Date().toISOString(), courses, links })
        + ';\n    if (typeof module !== \'undefined\' && module.exports) module.exports = data;\n    if (typeof window !== \'undefined\') window.HardPanGolfApi = data;\n})();\n';
    fs.writeFileSync(OUT, head + body);
    return { file: OUT, courses: Object.keys(courses).length, bytes: fs.statSync(OUT).size };
}

async function main() {
    const a = process.argv.slice(2);
    const flag = (f) => a.includes(f);
    const val = (f) => { const i = a.indexOf(f); return i !== -1 ? a[i + 1] : null; };
    const opts = { dryRun: flag('--dry-run'), floor: val('--floor') != null ? Number(val('--floor')) : 2, refresh: flag('--refresh') };
    fs.mkdirSync(RAW, { recursive: true });
    if (flag('--search')) {
        const q = new URLSearchParams({ name: val('--search') || '', country: 'usa' });
        if (val('--state')) q.set('state', val('--state'));
        if (val('--city')) q.set('city', val('--city'));
        const body = await call('/clubs?' + q.toString(), 0.1, opts);
        if (!body) return;
        (body.clubs || []).forEach((c) => {
            console.log(`${c.clubName} - ${c.city || ''}, ${c.state || ''}`);
            (c.courses || []).forEach((k) => console.log(`   ${k.courseID}  ${k.courseName}  holes ${k.numHoles}  GPS ${k.hasGPS ? 'yes' : 'no'}  points ${k.numCoordinates}`));
        });
        console.log('apiRequestsLeft:', body.apiRequestsLeft);
        return;
    }
    if (flag('--pull')) {
        const id = val('--pull');
        if (!/^\w+$/.test(id || '')) throw new Error('--pull needs a courseID');
        const cf = path.join(RAW, id + '.course.json'), kf = path.join(RAW, id + '.coordinates.json');
        const held = fs.existsSync(path.join(HELD, id + '.course.json')) && fs.existsSync(path.join(HELD, id + '.coordinates.json'));
        if (((fs.existsSync(cf) && fs.existsSync(kf)) || held) && !opts.refresh) { console.log(`${id} is already stored${held ? ' (golfapi/held/)' : ''} - not re-pulled (use --refresh to pull it again)`); }
        else {
            const course = await call('/courses/' + id, 1, opts);
            if (course) fs.writeFileSync(cf, JSON.stringify(course));
            const coords = await call('/coordinates/' + id, 1, opts);
            if (coords) fs.writeFileSync(kf, JSON.stringify(Object.assign({}, coords, { __fetched: new Date().toISOString() })));
            if (course && coords) {
                const s = stripCourse(course.course || course, coords);
                const g = Object.keys(s.h).filter((n) => s.h[n].g && s.h[n].g.c).length;
                console.log(`${id}: ${s.club} / ${s.course} - ${s.holes} holes, ${g} with a green center; apiRequestsLeft ${lastLeft()}`);
            }
        }
        if (val('--key') && !opts.dryRun) linkCourse(id, val('--key'));
        return;
    }
    if (flag('--link')) { const i = a.indexOf('--link'); linkCourse(a[i + 1], a[i + 2]); return; }
    if (flag('--list')) {
        fs.readdirSync(RAW).filter((f) => f.endsWith('.course.json')).forEach((f) => {
            const c = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
            const k = c.course || c;
            console.log(`${f.replace('.course.json', '')}  ${k.clubName} / ${k.courseName}  holes ${k.numHoles}`);
        });
        console.log('calls left (last seen):', lastLeft());
        return;
    }
    if (flag('--build')) { const r = buildFile(); console.log(`wrote ${path.relative(ROOT, r.file)}: ${r.courses} courses, ${(r.bytes / 1024).toFixed(1)} KB`); return; }
    console.log('usage: see the header of tools/golfapi-pull.js');
}
function linkCourse(id, key) {
    if (!/^\w+$/.test(id || '') || !/^[\w-]+$/.test(key || '')) throw new Error('--link <courseID> <ourCourseKey>');
    const links = fs.existsSync(LINKS) ? JSON.parse(fs.readFileSync(LINKS, 'utf8')) : {};
    links[key] = id;
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(LINKS, JSON.stringify(links, null, 1) + '\n');
    console.log(`linked ${key} -> ${id}`);
}

if (require.main === module) main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
module.exports = { stripCourse, buildFile, leftOf };
