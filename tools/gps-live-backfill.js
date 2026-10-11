#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS LIVE - BACKFILL A PULLED COURSE'S RATED TEES (build 13, 2026-10-11)
//
//   node tools/gps-live-backfill.js <courseId> [<courseId> ...] [--allow-call] [--dry-run]
//
// Courses pulled before build 13 were written with tees that carry no course
// rating or slope, so round setup offered no tee for them (courseTeeChoices keeps
// a rated tee only). This rewrites ONLY the tees - global_courses/gapi_<id>/tees
// and gps_courses/<id>/tees - from GolfAPI's /courses answer:
//   1. the raw answer kept in gps_meta/raw/<id> (pulls from build 13 on): 0 calls;
//   2. else, ONLY with --allow-call: ONE GolfAPI call (/courses/<id>, 1 call), the
//      key from GOLFAPI_KEY or .env (never printed), and the answer is kept in
//      gps_meta/raw/<id> so it is never needed again.
// Pars, handicaps, the card's name and the greens are not touched. Reads and
// writes go through the Firebase CLI (the signed-in account), nothing else.
// ============================================================================
'use strict';
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { stripCourse, leftOf } = require(path.join(ROOT, 'firebase-functions', 'golfapi-strip.js'));
const { cardRecord } = require(path.join(ROOT, 'firebase-functions', 'gps-live-core.js'));
const PROJECT = 'golfapp-9fb21';

const args = process.argv.slice(2);
const ids = args.filter((a) => /^\d{6,30}$/.test(a));
const allowCall = args.includes('--allow-call'), dryRun = args.includes('--dry-run');
if (!ids.length) { console.log('usage: node tools/gps-live-backfill.js <courseId> ... [--allow-call] [--dry-run]'); process.exit(1); }

function get(p) {
    const out = cp.execFileSync('firebase', ['database:get', p, '--project', PROJECT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim() ? JSON.parse(out) : null;
}
function set(p, v) {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gpsbf-')), 'v.json');
    fs.writeFileSync(f, JSON.stringify(v));
    cp.execFileSync('firebase', ['database:set', p, f, '--project', PROJECT, '--force'], { stdio: ['ignore', 'ignore', 'inherit'] });
}
function push(p, v) {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gpsbf-')), 'v.json');
    fs.writeFileSync(f, JSON.stringify(v));
    cp.execFileSync('firebase', ['database:push', p, f, '--project', PROJECT], { stdio: ['ignore', 'ignore', 'inherit'] });
}
function apiKey() {
    if (process.env.GOLFAPI_KEY) return process.env.GOLFAPI_KEY.trim();
    for (const f of [path.join(ROOT, '.env'), path.join(os.homedir(), 'golf-app-gps-flow', '.env')]) {
        if (!fs.existsSync(f)) continue;
        const m = fs.readFileSync(f, 'utf8').match(/^\s*GOLFAPI_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/m);
        if (m) return m[1].trim();
    }
    return null;
}
// Firebase hands holes "1".."18" back as an array: one shape, keyed 1..18.
function normal(c) {
    if (!c || !c.h) return c;
    const h = {};
    Object.keys(c.h).forEach((k) => { const x = c.h[k]; if (x && typeof x === 'object' && Number(k) >= 1) h[String(Number(k))] = x; });
    return Object.assign({}, c, { h });
}

(async () => {
    for (const id of ids) {
        const card = get('/global_courses/gapi_' + id);
        const cached = normal(get('/gps_courses/' + id));
        if (!card || !cached) { console.log(`${id}: no card or no cached course - skipped`); continue; }
        let raw = get('/gps_meta/raw/' + id + '/course'), source = 'kept raw answer (0 calls)';
        if (!raw) {
            if (!allowCall) { console.log(`${id} (${card.name}): no kept raw answer - needs ONE GolfAPI call; re-run with --allow-call`); continue; }
            if (dryRun) { console.log(`${id} (${card.name}): would call /courses/${id} (1 call)`); continue; }
            const key = apiKey();
            if (!key) throw new Error('no GOLFAPI_KEY (environment or .env)');
            const res = await fetch('https://www.golfapi.io/api/v2.3/courses/' + id, { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } });
            const body = await res.json().catch(() => null);
            const left = body ? leftOf(body.apiRequestsLeft) : null;
            push('/gps_log', { at: Date.now(), uid: 'backfill-tool', act: 'call', endpoint: '/courses', cost: 1, status: res.status, left });
            if (left != null) set('/gps_meta/left', left);
            if (!res.ok || !body) { console.log(`${id}: GolfAPI ${res.status} - nothing changed`); continue; }
            raw = body.course || body;
            set('/gps_meta/raw/' + id, { course: raw, at: Date.now() });
            source = `GolfAPI /courses (1 call; ${left} left)`;
        }
        // The tees from the raw answer, on the pars / handicaps already on the card
        // and in the cached course (they are not changed here).
        const s = stripCourse(raw, { coordinates: [] });
        const merged = Object.assign({}, cached, { tees: s.tees, parsW: s.parsW, hcpW: s.hcpW });
        const fresh = cardRecord(Object.assign({}, merged, { id, pars: cached.pars, hcp: cached.hcp }), Date.now());
        if (!fresh) { console.log(`${id}: the card does not validate - nothing changed`); continue; }
        const say = (t) => t.map((x) => `${x.name} ${x.rating || '-'}/${x.slope || '-'}`).join(', ');
        console.log(`${id} (${card.name}) from ${source}\n   male:   ${say(fresh.tees.male)}\n   female: ${say(fresh.tees.female) || '(none rated)'}`);
        if (dryRun) continue;
        set('/gps_courses/' + id + '/tees', s.tees);
        set('/global_courses/gapi_' + id + '/tees', fresh.tees);
        push('/gps_log', { at: Date.now(), uid: 'backfill-tool', act: 'backfill-tees', id, cost: source.startsWith('GolfAPI') ? 1 : 0, result: 'tees rewritten' });
        console.log('   written: global_courses/gapi_' + id + '/tees and gps_courses/' + id + '/tees');
    }
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
