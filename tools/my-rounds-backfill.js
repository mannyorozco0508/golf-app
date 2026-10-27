#!/usr/bin/env node
// ============================================================================
// 084 BACKFILL - "Rounds I'm running" pointers for rounds saved BEFORE 084.
//
//   node tools/my-rounds-backfill.js plan  <outdir>     READ-ONLY. Lists every live round with an
//        ownerUid (and every trip round whose TRIP has an owner) and writes <outdir>/plan.json +
//        plan.txt: uid -> code, day, name. Nothing is written to the database.
//   node tools/my-rounds-backfill.js write <outdir> --i-have-mannys-typed-ok
//        THE LIVE WRITE. Needs Manny's typed OK in Claude Code AND the 084 rules already published
//        (it checks). For each uid: backup organizers/<uid>/rounds -> <outdir>/backup/<uid>.json,
//        then ONE update of organizers/<uid>/rounds with only the planned codes, then a read-back
//        that must contain every planned pointer byte-for-byte. Writes nothing else, anywhere.
//        Also writes <outdir>/undo.sh (removes exactly the codes this run added; needs Manny's OK).
//
// Reads: the firebase CLI (admin) for /events?shallow and /trips (trips need auth); the public
// REST endpoint for five small fields per round (events/<code> is world-readable) - never scores,
// never the organizer token. Pointers are built by my-rounds.js pointerFor, the app's own builder.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const M = require(path.join(__dirname, '..', 'my-rounds.js'));

const PROJECT = 'golfapp-9fb21';
const DB = 'https://golfapp-9fb21-default-rtdb.firebaseio.com';
const FIELDS = ['ownerUid', 'eventName', 'courseName', 'createdAt', 'tripCode'];
const [mode, outdir, flag] = process.argv.slice(2);
if (!/^(plan|write)$/.test(mode || '') || !outdir) { console.error('usage: plan|write <outdir> [--i-have-mannys-typed-ok]'); process.exit(2); }
fs.mkdirSync(outdir, { recursive: true });

function cliGet(p, shallow) {
    const args = ['database:get', p, '--project', PROJECT];
    if (shallow) args.push('--shallow');
    // The CLI sometimes fails its project lookup once ("Failed to get details for project"): retry.
    for (let i = 0; ; i++) {
        try { return JSON.parse(execFileSync('firebase', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }) || 'null'); }
        catch (e) { if (i >= 3) throw e; execFileSync('sleep', [String(3 * (i + 1))]); }
    }
}
async function restGet(p, q) {
    for (let i = 0; i < 3; i++) {
        try { const r = await fetch(DB + '/' + p + '.json' + (q || '')); if (r.ok) return r.json(); } catch (e) {}
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
    throw new Error('read failed: ' + p);
}
async function pool(items, n, fn) {
    const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
    return out;
}

async function plan() {
    const codes = Object.keys(cliGet('/events', true) || {}).sort();
    const rounds = await pool(codes, 8, async (code) => {
        const d = {};
        const vals = await Promise.all(FIELDS.map((f) => restGet('events/' + code + '/' + f)));
        FIELDS.forEach((f, i) => { if (vals[i] != null) d[f] = vals[i]; });
        // The first score edit dates an undated round (push keys sort by time): one entry, not the log.
        if (!d.createdAt) {
            const first = await restGet('events/' + code + '/auditLog', '?orderBy=%22%24key%22&limitToFirst=1');
            if (first && typeof first === 'object') d.auditLog = first;
        }
        return { code, d };
    });
    const tripCodes = [...new Set(rounds.map((r) => r.d.tripCode).filter((t) => typeof t === 'string'))];
    const trips = {};
    tripCodes.forEach((t) => { trips[t] = { ownerUid: cliGet('/trips/' + t + '/ownerUid'), rounds: cliGet('/trips/' + t + '/rounds') || {} }; });
    const at = Date.now();
    const byUid = {}, rows = [];
    let undated = 0;
    const add = (uid, code, d, day, why) => {
        if (!uid || !/^[A-Z0-9]{4,10}$/.test(code)) return;
        const p = M.pointerFor(code, d, { at, day });
        // NO DAY ANYWHERE (no tee date, createdAt or score edit): no pointer. It could only ever show as
        // "today"; its next save writes one (the app's own path), dated that day.
        if (!p.day) { undated++; return; }
        (byUid[uid] = byUid[uid] || {})[code] = p;
        rows.push({ uid, code, why, day: p.day ? new Date(p.day).toISOString().slice(0, 10) : '', name: p.name });
    };
    let noOwner = 0;
    rounds.forEach(({ code, d }) => {
        const trip = d.tripCode && trips[d.tripCode];
        const day = trip && trip.rounds[code] && trip.rounds[code].date;
        if (d.ownerUid) add(d.ownerUid, code, d, day, 'round owner'); else noOwner++;
        if (trip && trip.ownerUid && trip.ownerUid !== d.ownerUid) add(trip.ownerUid, code, d, day, 'trip owner (' + d.tripCode + ')');
    });
    const plan = { builtAt: new Date(at).toISOString(), rounds: codes.length, roundsWithoutOwner: noOwner, undatedSkipped: undated, uids: Object.keys(byUid).length, pointers: rows.length, byUid };
    fs.writeFileSync(path.join(outdir, 'plan.json'), JSON.stringify(plan, null, 1));
    const uidShort = (u) => u.slice(0, 6) + '…';
    fs.writeFileSync(path.join(outdir, 'plan.txt'), rows.sort((a, b) => a.uid.localeCompare(b.uid) || b.day.localeCompare(a.day))
        .map((r) => [uidShort(r.uid), r.code, r.day, r.why, r.name].join('\t')).join('\n') + '\n');
    const recent = rows.filter((r) => r.day && (Date.now() - Date.parse(r.day)) <= 15 * 86400000).length;
    console.log(JSON.stringify({ rounds: plan.rounds, roundsWithoutOwner: noOwner, undatedSkipped: undated, owners: plan.uids, pointers: plan.pointers, inTheLast14Days: recent }));
    return plan;
}

function write() {
    if (flag !== '--i-have-mannys-typed-ok') { console.error('REFUSED: the live write needs Manny\'s typed OK (pass --i-have-mannys-typed-ok only after it).'); process.exit(3); }
    const plan = JSON.parse(fs.readFileSync(path.join(outdir, 'plan.json'), 'utf8'));
    const rules = cliGet('/.settings/rules');
    if (!rules || !rules.rules || !rules.rules.organizers || !rules.rules.organizers.$uid || !rules.rules.organizers.$uid.rounds) {
        console.error('REFUSED: the 084 rules (organizers/$uid/rounds) are not live yet - publish them first.'); process.exit(4);
    }
    fs.mkdirSync(path.join(outdir, 'backup'), { recursive: true });
    const undo = ['#!/bin/zsh', '# UNDO the 084 backfill: removes ONLY the pointers this run added (needs Manny\'s typed OK).'];
    let wrote = 0;
    for (const uid of Object.keys(plan.byUid)) {
        const before = cliGet('/organizers/' + uid + '/rounds') || {};
        fs.writeFileSync(path.join(outdir, 'backup', uid + '.json'), JSON.stringify(before));
        const add = {};
        for (const [code, p] of Object.entries(plan.byUid[uid])) if (!before[code]) add[code] = p;   // never overwrite a live pointer
        if (!Object.keys(add).length) continue;
        const f = path.join(outdir, 'backup', uid + '.add.json');
        fs.writeFileSync(f, JSON.stringify(add));
        execFileSync('firebase', ['database:update', '/organizers/' + uid + '/rounds', f, '--project', PROJECT, '--force'], { stdio: 'inherit' });
        const after = cliGet('/organizers/' + uid + '/rounds') || {};
        for (const code of Object.keys(add)) {
            if (JSON.stringify(after[code]) !== JSON.stringify(add[code])) { console.error('READ-BACK MISMATCH ' + uid.slice(0, 6) + '… ' + code); process.exit(5); }
            undo.push('firebase database:remove /organizers/' + uid + '/rounds/' + code + ' --project ' + PROJECT + ' --force');
        }
        for (const code of Object.keys(before)) if (JSON.stringify(after[code]) !== JSON.stringify(before[code])) { console.error('A PRE-EXISTING POINTER CHANGED ' + code); process.exit(6); }
        wrote += Object.keys(add).length;
    }
    fs.writeFileSync(path.join(outdir, 'undo.sh'), undo.join('\n') + '\n', { mode: 0o755 });
    console.log('wrote ' + wrote + ' pointers; read back OK; undo: ' + path.join(outdir, 'undo.sh'));
}

(mode === 'plan' ? plan() : Promise.resolve(write())).catch((e) => { console.error(e && e.message || e); process.exit(1); });
