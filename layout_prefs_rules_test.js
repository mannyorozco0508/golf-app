// ============================================================================
// layoutPrefs/<uid> - THE CUSTOMIZED ROUND SCREEN, SAVED TO THE GOLFER'S ACCOUNT
// (URGENT-066 #1). A PROPOSAL: NOT PUBLISHED. Publishing needs Manny's typed OK in
// Claude Code, with the CLAUDE.md steps (rollback copy of the live rules first,
// re-read live just before, read back after).
//
//   database.rules.layout-base.json  the live rules as last read back after a publish
//                                    (2026-10-20, claude-code-reports/026/rules-deploy/
//                                    live-after-2026-10-20.json), copied byte for byte.
//                                    It is also the ROLLBACK for this delta.
//   database.rules.layout.json       that, plus ONE new top-level node: layoutPrefs.
//
// Until it is published, feature-registry.js keeps the layout on the phone only:
// features.layoutSync stays off (gps-config.js has no such key = off), so the app
// never writes this path. Enforcement here is targaryen, the harness every rules
// suite in this repo uses (the RTDB emulator cannot load this ruleset).
// ============================================================================
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = __dirname;
const BASE = path.join(REPO, 'database.rules.layout-base.json');
const NEXT = path.join(REPO, 'database.rules.layout.json');
const TARGARYEN = path.join(REPO, 'node_modules', '.bin', 'targaryen');
const ME = 'u-me';
const NOW = Date.now();
const GOOD = { v: 1, order: ['ticker', 'leaderboard', 'stats'], on: { ticker: true }, at: NOW - 1000 };
const ROOT = {
    events: { ZZTEST: { eventName: 'Test round', ownerUid: ME, scores: { p101_h1: 4 } } },
    layoutPrefs: { [ME]: { v: 1, order: ['ticker'], at: 1 } }
};
const USERS = {
    nobody: null,
    me: { uid: ME, provider: 'password', token: { email: 'me@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    other: { uid: 'u-other', provider: 'password', token: { email: 'x@y.com', email_verified: true, firebase: { sign_in_provider: 'password' } } },
    anon: { uid: 'u-anon', provider: 'anonymous', token: { firebase: { sign_in_provider: 'anonymous' } } }
};
const with_ = (o) => Object.assign({}, GOOD, o);
const W = [
    { id: 'L1', what: 'I save my own layout', who: 'me', next: 'allow', live: 'refuse', path: 'layoutPrefs/' + ME, data: GOOD },
    { id: 'L2', what: 'I save a layout with nothing on (no `on` key - RTDB drops an empty object)', who: 'me', next: 'allow', live: 'refuse', path: 'layoutPrefs/' + ME, data: { v: 1, order: ['ticker'], at: 5 } },
    { id: 'L3', what: 'I delete my own layout (account exit, Back to simple)', who: 'me', next: 'allow', live: 'refuse', path: 'layoutPrefs/' + ME, data: null },
    { id: 'L4', what: 'an anonymous golfer saves their own (the rule allows it; the app only syncs signed-in golfers)', who: 'anon', next: 'allow', live: 'refuse', path: 'layoutPrefs/u-anon', data: GOOD },
    { id: 'L5', what: 'somebody else writes MY layout', who: 'other', next: 'refuse', live: 'refuse', path: 'layoutPrefs/' + ME, data: GOOD },
    { id: 'L6', what: 'an unauthenticated visitor writes a layout', who: 'nobody', next: 'refuse', live: 'refuse', path: 'layoutPrefs/' + ME, data: GOOD },
    { id: 'L7', what: 'somebody else deletes my layout', who: 'other', next: 'refuse', live: 'refuse', path: 'layoutPrefs/' + ME, data: null },
    { id: 'L8', what: 'a bad feature id in the order', who: 'me', next: 'refuse', live: 'refuse', path: 'layoutPrefs/' + ME, data: with_({ order: ['Ticker!'] }) },
    { id: 'L9', what: 'a 33rd entry in the order (32 max)', who: 'me', next: 'refuse', live: 'refuse', path: 'layoutPrefs/' + ME, data: with_({ order: Array.from({ length: 33 }, (_, i) => 'feat' + i) }) },
    { id: 'L10', what: 'exactly 32 entries', who: 'me', next: 'allow', live: 'refuse', path: 'layoutPrefs/' + ME, data: with_({ order: Array.from({ length: 32 }, (_, i) => 'feat' + i) }) },
    { id: 'L11', what: 'a non-boolean switch', who: 'me', next: 'refuse', live: 'refuse', path: 'layoutPrefs/' + ME, data: with_({ on: { ticker: 'yes' } }) },
    { id: 'L12', what: 'a stray key', who: 'me', next: 'refuse', live: 'refuse', path: 'layoutPrefs/' + ME, data: with_({ lat: 33.4 }) },
    { id: 'L13', what: 'a future version', who: 'me', next: 'refuse', live: 'refuse', path: 'layoutPrefs/' + ME, data: with_({ v: 2 }) },
    { id: 'L14', what: 'a stamp in the future', who: 'me', next: 'refuse', live: 'refuse', path: 'layoutPrefs/' + ME, data: with_({ at: 4102444800000 }) },
    { id: 'L15', what: 'no order', who: 'me', next: 'refuse', live: 'refuse', path: 'layoutPrefs/' + ME, data: { v: 1, at: 5 } },
    { id: 'L16', what: 'a bad id as a switch key', who: 'me', next: 'refuse', live: 'refuse', path: 'layoutPrefs/' + ME, data: with_({ on: { 'x y': true } }) },
    { id: 'X1', what: 'a score write is unchanged by this delta', who: 'anon', next: 'allow', live: 'allow', path: 'events/ZZTEST/scores/p101_h2', data: 4 }
];
const R = [
    { id: 'R1', what: 'I read my own layout', who: 'me', next: 'allow', path: 'layoutPrefs/' + ME },
    { id: 'R2', what: 'somebody else reads my layout', who: 'other', next: 'refuse', path: 'layoutPrefs/' + ME },
    { id: 'R3', what: 'an unauthenticated visitor reads my layout', who: 'nobody', next: 'refuse', path: 'layoutPrefs/' + ME },
    { id: 'R4', what: 'nobody lists everyone\'s layouts', who: 'me', next: 'refuse', path: 'layoutPrefs' }
];
function dataFile(which, rows) {
    const tests = {};
    rows.forEach((row) => {
        const want = which === 'live' ? row.live : row.next;
        const e = tests[row.path] || {};
        const bucket = want === 'allow' ? 'canWrite' : 'cannotWrite';
        e[bucket] = (e[bucket] || []).concat([{ auth: row.who, data: row.data }]);
        tests[row.path] = e;
    });
    if (which !== 'live') R.forEach((row) => {
        const e = tests[row.path] || {};
        const bucket = row.next === 'allow' ? 'canRead' : 'cannotRead';
        e[bucket] = (e[bucket] || []).concat([row.who]);
        tests[row.path] = e;
    });
    const f = path.join(os.tmpdir(), 'rules-layout-' + which + '-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(f, JSON.stringify({ root: ROOT, users: USERS, tests }, null, 1));
    return f;
}
function run(rulesPath, file) {
    try { return { code: 0, out: execFileSync(TARGARYEN, [rulesPath, file], { encoding: 'utf8' }) }; }
    catch (e) { return { code: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') + (e.message || '') }; }
}
function mutated(fn) {
    const d = JSON.parse(fs.readFileSync(NEXT, 'utf8')); fn(d);
    const f = path.join(os.tmpdir(), 'rules-layout-ctl-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.json');
    fs.writeFileSync(f, JSON.stringify(d, null, 1));
    return f;
}

describe('layoutPrefs/<uid>: owner-only, a proposal', () => {
    test('the harness is here and the table has both verdicts', () => {
        assert.ok(fs.existsSync(TARGARYEN), 'targaryen is the harness this repo uses for rules');
        assert.ok(W.filter((r) => r.next === 'allow').length >= 4);
        assert.ok(W.filter((r) => r.next === 'refuse').length >= 8);
    });

    test('THE DELTA IS EXACTLY ONE NEW TOP-LEVEL NODE; events and everything else unchanged', () => {
        const base = JSON.parse(fs.readFileSync(BASE, 'utf8')), next = JSON.parse(fs.readFileSync(NEXT, 'utf8'));
        const diffs = [];
        Object.keys(next.rules).forEach((k) => { if (!(k in base.rules)) diffs.push('ADDED ' + k); else if (JSON.stringify(base.rules[k]) !== JSON.stringify(next.rules[k])) diffs.push('CHANGED ' + k); });
        Object.keys(base.rules).forEach((k) => { if (!(k in next.rules)) diffs.push('REMOVED ' + k); });
        assert.deepEqual(diffs, ['ADDED layoutPrefs']);
        assert.equal(JSON.stringify(base.rules.events), JSON.stringify(next.rules.events), 'rounds, scores and money are untouched');
        assert.equal(JSON.stringify(base.rules.pushPrefs), JSON.stringify(next.rules.pushPrefs), 'notification settings rule unchanged');
    });

    test('the proposal does what the table says', () => {
        const r = run(NEXT, dataFile('next', W));
        assert.equal(r.code, 0, r.out);
    });

    test('under the base (live) rules every layout write is refused - the delta is what allows it', () => {
        const r = run(BASE, dataFile('live', W));
        assert.equal(r.code, 0, r.out);
    });

    test('CONTROL: an open write rule fails the table (the table can see a bad rule)', () => {
        const f = mutated((d) => { d.rules.layoutPrefs.$uid['.write'] = 'auth != null'; });
        assert.notEqual(run(f, dataFile('next', W)).code, 0);
    });
    test('CONTROL: an open read rule fails the table', () => {
        const f = mutated((d) => { d.rules.layoutPrefs.$uid['.read'] = true; });
        assert.notEqual(run(f, dataFile('next', W)).code, 0);
    });
    test('CONTROL: no $other refusal fails the table (stray keys would be kept)', () => {
        const f = mutated((d) => { delete d.rules.layoutPrefs.$uid.$other; });
        assert.notEqual(run(f, dataFile('next', W)).code, 0);
    });

    test('the app\'s own saved shape passes the rules (feature-registry.js forSave)', () => {
        global.window = { localStorage: { getItem() { return null; }, setItem() {} }, addEventListener() {} };
        global.document = {};
        delete require.cache[require.resolve('./feature-registry.js')];
        const F = require('./feature-registry.js');
        const saved = F.forSave({ order: ['ticker', 'leaderboard', 'stats', 'voice', 'scan'], on: { ticker: true, voice: true }, at: NOW - 5 });
        const rows = [{ id: 'A1', what: 'the app\'s shape', who: 'me', next: 'allow', path: 'layoutPrefs/' + ME, data: saved },
            { id: 'A2', what: 'the app\'s shape with nothing on', who: 'me', next: 'allow', path: 'layoutPrefs/' + ME, data: F.forSave({ order: ['ticker'], on: {}, at: NOW - 5 }) }];
        assert.equal(F.remotePath(ME), 'layoutPrefs/' + ME);
        const r = run(NEXT, dataFile('next', rows));
        assert.equal(r.code, 0, r.out);
        delete global.window; delete global.document;
    });
});
