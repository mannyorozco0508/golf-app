#!/usr/bin/env node
// ============================================================================
// SCORECARD LOCK: THE RULES, IN THE FIREBASE DATABASE EMULATOR
// (Tournaments scorecard-lock wave, 2026-10-06)
//
// A team or group link carries a per-team key (&k=). On a LOCKED event
// (tournamentKeys/<code>/on === true) a golfer's score is accepted only when the
// same multi-path update writes a proof at scoreProofs/<code>/[r/<rid>/]<key>
// = { who, k, t: ServerValue.TIMESTAMP } whose k is that team's (or that
// player's group's) key and whose t is the server's `now`. Scores themselves
// keep their path and shape; no reader changes.
//
// THE MECHANISM'S ONE ASSUMPTION is that `now` is the same for every path of one
// multi-path update - including an update the SDK queued offline and replayed.
// Arm 0 proves that with the real rules and the compat SDK the scorecard ships,
// in headless Chrome: three writes queued with the connection down, replayed on
// reconnect, all accepted; a score sent alone afterwards refused.
//
// Starts the cached emulator jar itself (~/.cache/firebase/emulators, Java on
// PATH or ~/jdks). Reads database.rules.json, or the file given as argv[2] -
// so the PUBLISH file on the Desktop can be checked byte for byte.
//
//   node tools/tournament-scorecard-lock-emulator-check.js [rules.json]
//
//   exit 0   every arm as expected   exit 1   an arm diverged
//   exit 2   could not run (no Java / jar / Chrome). NOTHING PROVEN.
// ============================================================================

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RULES = path.resolve(process.argv[2] || path.join(ROOT, 'database.rules.json'));
const PORT = 9471;
const NS = 'lockcheck';
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
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

// An unsigned ID token: the emulator accepts alg "none".
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (uid, provider) => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
    sub: uid, user_id: uid, aud: 'golfapp-9fb21', iss: 'https://securetoken.google.com/golfapp-9fb21',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    firebase: { sign_in_provider: provider || 'password' } }) + '.';
const AS = { owner: token('u-org'), stranger: token('u-who'), anon: token('u-anon', 'anonymous'), nobody: null };

async function req(method, p, body, who) {
    // AUTH GOES IN ?auth=, NEVER A BEARER HEADER. Measured on emulator 4.11.2:
    // any Authorization: Bearer header is treated as ADMIN - an unsigned
    // stranger token in the header read an owner-only node (200), the same token
    // as ?auth= was refused (401). A first run of this check used the header and
    // reported eight rules failures that were the harness, not the rules.
    const headers = { 'Content-Type': 'application/json' };
    if (who === 'admin') headers.Authorization = 'Bearer owner';
    const q = (who && who !== 'admin' && AS[who]) ? '&auth=' + AS[who] : '';
    const r = await fetch(`${BASE}/${p}.json?ns=${NS}${q}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return r.status;
}
const TS = { '.sv': 'timestamp' };
const K1 = 'k1-aaaaaaaaaaaaaaaaaaaa', K2 = 'k2-bbbbbbbbbbbbbbbbbbbb', KG = 'kg-cccccccccccccccccccc', KH = 'kh-dddddddddddddddddddd';
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const SEED = {
    tournaments: {
        LOCK1: { name: 'Locked', format: 'scramble', ownerUid: 'u-org', createdAt: 1, courseData: COURSE,
            teams: { team1: { num: 1, name: 'A', players: ['a'], handicap: 0 }, team2: { num: 2, name: 'B', players: ['b'], handicap: 0 } },
            eventModel: 'round-v1', rounds: { r1: { name: 'Sat', status: 'open', createdAt: 1, format: 'scramble', courseData: COURSE } } },
        IND1: { name: 'Medal', format: 'individual', scoringModel: 'player-v1', ownerUid: 'u-org', createdAt: 1, courseData: COURSE,
            players: { pann: { id: 'pann', name: 'Ann' }, pbo: { id: 'pbo', name: 'Bo' } },
            scoringGroups: { g1: { id: 'g1', name: 'G1', playerIds: ['pann'] }, g2: { id: 'g2', name: 'G2', playerIds: ['pbo'] } } },
        OPEN1: { name: 'Owned, never locked', format: 'scramble', ownerUid: 'u-org', createdAt: 1, teams: { team1: { num: 1, name: 'A', players: ['a'], handicap: 0 } } },
        LEG1: { name: 'Legacy', format: 'scramble', createdAt: 1, teams: { team1: { num: 1, name: 'A', players: ['a'], handicap: 0 } } }
    },
    tournamentKeys: {
        LOCK1: { on: true, t: { team1: K1, team2: K2 } },
        IND1: { on: true, g: { g1: KG, g2: KH }, p: { pann: KG, pbo: KH } },
        OPEN1: { t: { team1: K1 } }   // keys kept, not locked
    }
};
const proof = (who, k, t) => ({ who, k, t: t === undefined ? TS : t });

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

    // EMULATOR-ONLY TRANSFORM, PRINTED IN THE RESULT. The live registrations
    // email .validate uses \s inside a character class; production accepts it,
    // emulator 4.11.2 refuses to load it ("whitespacechar not found"). It is
    // swapped for a literal space here and nowhere else - no arm below touches
    // registrations, and the file on disk is never changed.
    const raw = fs.readFileSync(RULES, 'utf8');
    const rulesText = raw.split('[^@\\\\s]').join('[^@ ]');
    const transformed = (raw.match(/\[\^@\\\\s\]/g) || []).length;
    const rs = await fetch(`${BASE}/.settings/rules.json?ns=${NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rulesText });
    if (rs.status !== 200) bail('the emulator refused the rules: ' + rs.status + ' ' + (await rs.text()).slice(0, 300));
    const results = [];
    const failures = [];
    const arm = async (name, want, status) => {
        const ok = want === 'OK' ? status === 200 : status !== 200;
        results.push(`${ok ? 'pass' : 'FAIL'}  ${name}: ${status} (want ${want})`);
        if (!ok) failures.push(name);
    };
    const reseed = () => req('PUT', '', SEED, 'admin');
    await reseed();

    // ---- team, single-path scores at the event root of a LOCKED event ----
    const S = 'tournaments/LOCK1/scores/', P = 'scoreProofs/LOCK1/';
    await arm('right key (team1, K1)', 'OK', await req('PATCH', '', { [S + 'team1_h1']: 4, [P + 'team1_h1']: proof('team1', K1) }, 'nobody'));
    await arm('missing key: score sent alone, stale proof on file', 'REFUSED', await req('PATCH', '', { [S + 'team1_h1']: 5 }, 'nobody'));
    await arm('wrong key (team2 key on team1)', 'REFUSED', await req('PATCH', '', { [S + 'team1_h2']: 4, [P + 'team1_h2']: proof('team1', K2) }, 'nobody'));
    await arm('own key, other team: who=team2/K2 on a team1 score', 'REFUSED', await req('PATCH', '', { [S + 'team1_h3']: 4, [P + 'team1_h3']: proof('team2', K2) }, 'nobody'));
    await arm('prefix trap: team1 key on team10_h1', 'REFUSED', await req('PATCH', '', { [S + 'team10_h1']: 4, [P + 'team10_h1']: proof('team1', K1) }, 'nobody'));
    await arm('client clock in the proof', 'REFUSED', await req('PATCH', '', { [S + 'team1_h4']: 4, [P + 'team1_h4']: proof('team1', K1, Date.now()) }, 'nobody'));
    await arm('best-ball key team1_p0_h5 with team1 key', 'OK', await req('PATCH', '', { [S + 'team1_p0_h5']: 4, [P + 'team1_p0_h5']: proof('team1', K1) }, 'nobody'));
    await arm('clear a hole (null) with proof', 'OK', await req('PATCH', '', { [S + 'team1_h1']: null, [P + 'team1_h1']: proof('team1', K1) }, 'nobody'));
    await arm('clear a hole (null) without proof', 'REFUSED', await req('PATCH', '', { [S + 'team1_p0_h5']: null }, 'nobody'));
    await arm('owner, no proof (score corrector)', 'OK', await req('PATCH', '', { [S + 'team2_h1']: 4 }, 'owner'));
    await arm('signed-in stranger, no proof', 'REFUSED', await req('PATCH', '', { [S + 'team2_h2']: 4 }, 'stranger'));
    await arm('signed-in stranger WITH the link key (a key is not an identity)', 'OK', await req('PATCH', '', { [S + 'team2_h3']: 4, [P + 'team2_h3']: proof('team2', K2) }, 'stranger'));
    await arm('the score validate still holds (31 strokes, right key)', 'REFUSED', await req('PATCH', '', { [S + 'team1_h6']: 31, [P + 'team1_h6']: proof('team1', K1) }, 'nobody'));

    // ---- rounds ----
    const SR = 'tournaments/LOCK1/rounds/r1/scores/', PR = 'scoreProofs/LOCK1/r/r1/';
    await arm('round score, right key', 'OK', await req('PATCH', '', { [SR + 'team1_h1']: 4, [PR + 'team1_h1']: proof('team1', K1) }, 'nobody'));
    await arm('round score, wrong key', 'REFUSED', await req('PATCH', '', { [SR + 'team1_h2']: 4, [PR + 'team1_h2']: proof('team1', K2) }, 'nobody'));
    await arm('round score, proof filed at the ROOT path instead', 'REFUSED', await req('PATCH', '', { [SR + 'team1_h3']: 4, [P + 'team1_h3']: proof('team1', K1) }, 'nobody'));
    await arm('round that does not exist, right key', 'REFUSED', await req('PATCH', '', { ['tournaments/LOCK1/rounds/rX/scores/team1_h1']: 4, ['scoreProofs/LOCK1/r/rX/team1_h1']: proof('team1', K1) }, 'nobody'));

    // ---- individual: a player is scored with their group's key ----
    const SI = 'tournaments/IND1/scores/', PI = 'scoreProofs/IND1/';
    await arm('player pann with group g1 key', 'OK', await req('PATCH', '', { [SI + 'pann_h1']: 4, [PI + 'pann_h1']: proof('pann', KG) }, 'nobody'));
    await arm('player pbo with group g1 key (other group)', 'REFUSED', await req('PATCH', '', { [SI + 'pbo_h1']: 4, [PI + 'pbo_h1']: proof('pbo', KG) }, 'nobody'));

    // ---- unlocked and legacy events are unchanged ----
    await arm('owned, keys kept, NOT locked: score alone', 'OK', await req('PATCH', '', { ['tournaments/OPEN1/scores/team1_h1']: 4 }, 'nobody'));
    await arm('owned, NOT locked: proof with a key still accepted', 'OK', await req('PATCH', '', { ['tournaments/OPEN1/scores/team1_h2']: 4, ['scoreProofs/OPEN1/team1_h2']: proof('team1', K1) }, 'nobody'));
    await arm('legacy (no ownerUid): score alone', 'OK', await req('PATCH', '', { ['tournaments/LEG1/scores/team1_h1']: 4 }, 'nobody'));
    await arm('score on an event that does not exist', 'REFUSED', await req('PATCH', '', { ['tournaments/NOPE/scores/team1_h1']: 4 }, 'nobody'));

    // ---- the keys are the owner's ----
    await arm('keys: owner reads', 'OK', await req('GET', 'tournamentKeys/LOCK1', undefined, 'owner'));
    await arm('keys: stranger reads', 'REFUSED', await req('GET', 'tournamentKeys/LOCK1', undefined, 'stranger'));
    await arm('keys: anonymous reads', 'REFUSED', await req('GET', 'tournamentKeys/LOCK1', undefined, 'anon'));
    await arm('keys: signed out reads', 'REFUSED', await req('GET', 'tournamentKeys/LOCK1', undefined, 'nobody'));
    await arm('keys: a public record read does not include them', 'OK', await req('GET', 'tournaments/LOCK1', undefined, 'nobody'));
    await arm('keys: stranger writes', 'REFUSED', await req('PATCH', 'tournamentKeys/LOCK1', { t: { team1: 'x'.repeat(20) } }, 'stranger'));
    await arm('keys: stranger turns the lock off', 'REFUSED', await req('PUT', 'tournamentKeys/LOCK1/on', false, 'stranger'));
    await arm('keys: owner writes', 'OK', await req('PATCH', 'tournamentKeys/LOCK1/t', { team3: 'k3-eeeeeeeeeeeeeeeeeeee' }, 'owner'));
    await arm('keys: nobody can key a legacy event', 'REFUSED', await req('PUT', 'tournamentKeys/LEG1', { on: true }, 'stranger'));
    await arm('proofs: nobody reads', 'REFUSED', await req('GET', 'scoreProofs/LOCK1/team1_h1', undefined, 'owner'));
    await arm('create: new event + its keys in ONE update by the owner', 'OK', await req('PATCH', '', {
        'tournaments/NEW1': { name: 'New', format: 'scramble', ownerUid: 'u-org', createdAt: 1, teams: { team1: { num: 1, name: 'A', players: ['a'], handicap: 0 } } },
        'tournamentKeys/NEW1': { on: true, t: { team1: K1 } } }, 'owner'));
    await arm('create: a stranger cannot key someone else\'s new event', 'REFUSED', await req('PATCH', '', { 'tournamentKeys/NEW1/t/team2': K2 }, 'stranger'));
    await arm('remove team: team node + its key in ONE update by the owner', 'OK', await req('PATCH', '', { 'tournaments/LOCK1/teams/team2': null, 'tournamentKeys/LOCK1/t/team2': null }, 'owner'));

    // ---- ARM 0: the compat SDK, writes queued offline and replayed, real rules ----
    await reseed();
    const sdk = await sdkArm();
    results.push(...sdk.lines.map((l) => '      sdk ' + l));
    if (!sdk.ok) failures.push('sdk offline replay: ' + sdk.why);
    const stored = await (await fetch(`${BASE}/tournaments/LOCK1/scores.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } })).json();
    const want = { team1_h7: 5, team1_h8: 3, team2_h7: 6 };
    if (JSON.stringify(stored) !== JSON.stringify(want)) failures.push('sdk: server holds ' + JSON.stringify(stored) + ', wanted ' + JSON.stringify(want));
    results.push('      server scores after replay: ' + JSON.stringify(stored));

    console.log(JSON.stringify({ verdict: failures.length ? 'FAIL' : 'PASS', rules: path.relative(process.cwd(), RULES), emulatorOnlyTransform: transformed + ' x [^@\\s] -> [^@ ] (registrations email regex)', failures, arms: results }, null, 2));
    stop();
    process.exit(failures.length ? 1 : 0);
})().catch((e) => bail(String((e && e.stack) || e)));

// The scorecard's SDK (firebase-*-compat.js from the repo) against the emulator,
// in real-time headless Chrome. Signed out, as a golfer is.
async function sdkArm() {
    if (!fs.existsSync(CHROME)) return { ok: false, why: 'no Chrome', lines: [] };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockcheck-'));
    const page = path.join(dir, 'sdk.html');
    fs.writeFileSync(page, `<!doctype html><pre id="out">running</pre>
<script src="file://${ROOT}/firebase-app-compat.js"></script>
<script src="file://${ROOT}/firebase-database-compat.js"></script>
<script>
const out = []; const log = (s) => { out.push(s); document.getElementById('out').textContent = out.join('\\n'); };
firebase.initializeApp({ databaseURL: '${BASE}?ns=${NS}', projectId: 'golfapp-9fb21' });
const db = firebase.database(); const TS = firebase.database.ServerValue.TIMESTAMP;
const w = (label, u) => db.ref().update(u).then(() => log(label + ': ALLOWED'), (e) => log(label + ': REFUSED ' + e.code));
const S = 'tournaments/LOCK1/scores/', P = 'scoreProofs/LOCK1/';
(async () => {
  db.goOffline();
  const q = [w('queued #1 team1_h7', { [S + 'team1_h7']: 4, [P + 'team1_h7']: { who: 'team1', k: '${K1}', t: TS } }),
             w('queued #2 team1_h8', { [S + 'team1_h8']: 3, [P + 'team1_h8']: { who: 'team1', k: '${K1}', t: TS } }),
             w('queued #3 team1_h7 again', { [S + 'team1_h7']: 5, [P + 'team1_h7']: { who: 'team1', k: '${K1}', t: TS } }),
             w('queued #4 team2_h7 own key', { [S + 'team2_h7']: 6, [P + 'team2_h7']: { who: 'team2', k: '${K2}', t: TS } })];
  await new Promise(r => setTimeout(r, 4000));
  db.goOnline();
  await Promise.all(q);
  await w('after replay, score alone (stale proof)', { [S + 'team1_h8']: 9 });
  log('DONE');
})();
</script>`);
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'lockcheck-chrome-'));
    const c = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + prof, '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
    try {
        let port; for (let i = 0; i < 100 && !port; i++) { try { port = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { await sleep(100); } }
        if (!port) return { ok: false, why: 'Chrome did not open a debugging port', lines: [] };
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
        await new Promise((r) => { ws.onopen = r; });
        let id = 0; const pend = {};
        ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
        const rpc = (method, params) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
        await rpc('Page.navigate', { url: 'file://' + page });
        let text = '';
        for (let i = 0; i < 80 && !/DONE/.test(text); i++) {
            await sleep(500);
            const r = await rpc('Runtime.evaluate', { expression: "document.getElementById('out').textContent", returnByValue: true });
            text = (r.result && r.result.result && r.result.result.value) || '';
        }
        ws.close();
        const lines = text.split('\n').filter((l) => l && l !== 'DONE');
        const okQueued = lines.filter((l) => /^queued/.test(l)).every((l) => /ALLOWED$/.test(l)) && lines.filter((l) => /^queued/.test(l)).length === 4;
        const okStale = lines.some((l) => /stale proof\): REFUSED PERMISSION_DENIED/.test(l));
        return { ok: /DONE/.test(text) && okQueued && okStale, why: text, lines };
    } finally { c.kill(); }
}
