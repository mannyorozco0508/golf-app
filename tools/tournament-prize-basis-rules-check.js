#!/usr/bin/env node
// ============================================================================
// PRIZE BASIS: WHO MAY SAVE tournaments/<code>/payoutBasis (audit #1, A1)
//
// The organizer's "Results are paid on" control writes one string:
// tournaments/<code>/payoutBasis = 'event' | <round id>. This asks the Firebase
// Database EMULATOR, loaded with a rules file, whether the owner may write it
// and whether a signed-in stranger, an anonymous user and a signed-out caller
// are refused. Nothing is deployed; the rules file is read, never changed.
//
//   node tools/tournament-prize-basis-rules-check.js [rules.json]
//
// Pass the LIVE rules (npx firebase-tools database:get "/.settings/rules" ...,
// READ ONLY) to prove the shipped save works on production rules.
// Harness pattern (jar, Java, alg-none token with an email claim, ?auth=) is
// tools/tournament-scorecard-lock-emulator-check.js - see its notes on why the
// token goes in ?auth= and why the registrations \s regex is transformed.
//
// MEASURED 2026-11-08 on the LIVE rules (read with database:get, tournaments
// subtree identical to TOURNAMENTS-RULES-CANDIDATE-live-plus-lock.json): PASS,
// owner 200 / 200, stranger, anonymous and signed-out 401. Controls on copies:
// $tourneyCode .write = "true" -> 3 refusal arms + the stored value fail;
// payoutBasis .validate = false -> both owner arms fail.
//
//   exit 0 every arm as expected   exit 1 an arm diverged   exit 2 could not run
// ============================================================================
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RULES = path.resolve(process.argv[2] || path.join(ROOT, 'database.rules.json'));
const PORT = 9473;
const NS = 'prizebasis';
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bail = (why) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why }, null, 2)); process.exit(2); };

function findJar() {
    const dir = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
    const f = fs.existsSync(dir) && fs.readdirSync(dir).filter((x) => /^firebase-database-emulator-v[\d.]+\.jar$/.test(x)).sort().pop();
    return f ? path.join(dir, f) : null;
}
function findJava() {
    try { execSync('java -version', { stdio: 'ignore' }); return 'java'; } catch (e) { /* not on PATH */ }
    const jdks = path.join(os.homedir(), 'jdks');
    const d = fs.existsSync(jdks) && fs.readdirSync(jdks).sort().pop();
    const j = d && path.join(jdks, d, 'Contents', 'Home', 'bin', 'java');
    return j && fs.existsSync(j) ? j : null;
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (uid, provider) => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
    sub: uid, user_id: uid, aud: 'golfapp-9fb21', iss: 'https://securetoken.google.com/golfapp-9fb21',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    ...(provider === 'anonymous' ? {} : { email: uid + '@example.test', email_verified: true }),
    firebase: { sign_in_provider: provider || 'password' } }) + '.';
const AS = { owner: token('u-org'), stranger: token('u-who'), anon: token('u-anon', 'anonymous'), nobody: null };

async function req(method, p, body, who) {
    const headers = { 'Content-Type': 'application/json' };
    if (who === 'admin') headers.Authorization = 'Bearer owner';
    const q = (who && who !== 'admin' && AS[who]) ? '&auth=' + AS[who] : '';
    const r = await fetch(`${BASE}/${p}.json?ns=${NS}${q}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return r.status;
}
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const SEED = { tournaments: {
    MR1: { name: 'Two-day', format: 'individual', scoringModel: 'player-v1', ownerUid: 'u-org', createdAt: 1, eventModel: 'round-v1',
        players: { pa: { id: 'pa', name: 'Ann' } },
        rounds: { r1: { name: 'Sat', status: 'open', createdAt: 1, format: 'individual', courseData: COURSE },
                  r2: { name: 'Sun', status: 'open', createdAt: 2, format: 'individual', courseData: COURSE } } } } };

(async () => {
    const jar = findJar(), java = findJava();
    if (!jar) bail('no cached database emulator jar under ~/.cache/firebase/emulators');
    if (!java) bail('no Java');
    if (!fs.existsSync(RULES)) bail('no rules file ' + RULES);
    const emu = spawn(java, ['-jar', jar, '--host', '127.0.0.1', '--port', String(PORT)], { stdio: 'ignore' });
    const stop = () => { try { emu.kill(); } catch (e) { /* gone */ } };
    process.on('exit', stop);
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { await fetch(`${BASE}/.json?ns=${NS}`); up = true; } catch (e) { await sleep(500); } }
    if (!up) bail('the emulator did not start on ' + PORT);
    const raw = fs.readFileSync(RULES, 'utf8');
    const rulesText = raw.split('[^@\\\\s]').join('[^@ ]');
    const rs = await fetch(`${BASE}/.settings/rules.json?ns=${NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rulesText });
    if (rs.status !== 200) bail('the emulator refused the rules: ' + rs.status + ' ' + (await rs.text()).slice(0, 300));
    const results = [], failures = [];
    const arm = async (name, want, status) => {
        const ok = want === 'OK' ? status === 200 : status !== 200;
        results.push(`${ok ? 'pass' : 'FAIL'}  ${name}: ${status} (want ${want})`);
        if (!ok) failures.push(name);
    };
    const B = 'tournaments/MR1/payoutBasis';
    await req('PUT', '', SEED, 'admin');
    await arm('owner saves Event total', 'OK', await req('PUT', B, 'event', 'owner'));
    await arm('owner saves a round id', 'OK', await req('PUT', B, 'r2', 'owner'));
    await arm('signed-in stranger', 'REFUSED', await req('PUT', B, 'r1', 'stranger'));
    await arm('anonymous', 'REFUSED', await req('PUT', B, 'r1', 'anon'));
    await arm('signed out', 'REFUSED', await req('PUT', B, 'r1', 'nobody'));
    const r = await fetch(`${BASE}/${B}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } });
    const stored = await r.json();
    // POSITIVE: the owner's last write is what the server holds; the refused ones changed nothing.
    if (stored !== 'r2') failures.push('server holds ' + JSON.stringify(stored) + ', wanted "r2"');
    results.push('      server payoutBasis after all arms: ' + JSON.stringify(stored));
    console.log(JSON.stringify({ verdict: failures.length ? 'FAIL' : 'PASS', rules: RULES, failures, arms: results }, null, 2));
    stop();
    process.exit(failures.length ? 1 : 0);
})().catch((e) => bail(String((e && e.stack) || e)));
