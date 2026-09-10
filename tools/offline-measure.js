// MEASUREMENT ONLY - does a Firebase RTDB write REJECT or stay PENDING when offline?
//
//   node tools/offline-measure.js
//
// Not a pass/fail check and not part of npm test: it TALKS TO THE LIVE DATABASE
// and takes about a minute. It exists because this question decided the design of
// the score-failure fix, and the answer had to be measured rather than assumed.
// Re-run it if the Firebase SDK is ever upgraded - the whole design rests on
// "offline stays pending, only a refusal rejects", and that is an SDK behaviour.
//
// This is not a stub. It loads the repo's real vendored firebase-database-compat.js
// and talks to the real golfapp-9fb21 database, because the question is about the
// SDK's actual promise semantics and a stand-in would only return my own assumption.
//
// SAFETY. Two of the three probes write nothing to the server:
//   A  writes to a path the DEPLOYED RULES DENY -> rejects, creates nothing
//   B  writes while the socket is offline        -> never reaches the server
// C does land data, so it uses one clearly-marked scratch code and deletes it.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const path_ = require('path');
const REPO_ROOT = path_.join(__dirname, '..');   // was hard-coded to one machine
const CHROME = process.env.CHROME_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCRATCH_CODE = 'ZZWFCHK';

function rpc(ws, id, method, params) {
    return new Promise((resolve, reject) => {
        const onMsg = ev => {
            let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.id !== id) return;
            ws.removeEventListener('message', onMsg);
            if (m.error) return reject(new Error(method + ': ' + JSON.stringify(m.error)));
            resolve(m);
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

function readPort(profileDir, timeoutMs) {
    const file = path.join(profileDir, 'DevToolsActivePort');
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        (function poll() {
            try {
                const raw = fs.readFileSync(file, 'utf8').split('\n')[0].trim();
                if (raw && /^[0-9]+$/.test(raw)) return resolve(Number(raw));
            } catch (e) { /* not yet */ }
            if (Date.now() > deadline) return reject(new Error('no DevToolsActivePort'));
            setTimeout(poll, 100);
        })();
    });
}

const PAGE = `<!doctype html><meta charset="utf-8"><title>rtdb probe</title>
<script src="file://${REPO_ROOT}/firebase-app-compat.js"></script>
<script src="file://${REPO_ROOT}/firebase-database-compat.js"></script>
<script>
window.__ready = false;
firebase.initializeApp({
  apiKey: "AIzaSyB5sBBd-pdnrdp-nu60lHTMBUUd5Kwjfyk",
  authDomain: "golfapp-9fb21.firebaseapp.com",
  databaseURL: "https://golfapp-9fb21-default-rtdb.firebaseio.com",
  projectId: "golfapp-9fb21",
  storageBucket: "golfapp-9fb21.firebasestorage.app",
  messagingSenderId: "761739328763",
  appId: "1:761739328763:web:08ac41351578565c94045e"
});
window.db = firebase.database();
window.__conn = null;
db.ref('.info/connected').on('value', s => { window.__conn = s.val(); window.__ready = true; });

// Settle-or-timeout: reports which of the three actually happened.
window.probe = function (path, value, waitMs) {
  return new Promise(resolve => {
    let done = false;
    const t0 = Date.now();
    const finish = o => { if (!done) { done = true; resolve(Object.assign({ ms: Date.now() - t0 }, o)); } };
    setTimeout(() => finish({ outcome: 'PENDING (never settled)' }), waitMs);
    try {
      db.ref(path).set(value)
        .then(() => finish({ outcome: 'RESOLVED' }))
        .catch(e => finish({ outcome: 'REJECTED', name: e && e.name,
                             message: String(e && e.message || e),
                             code: e && e.code }));
    } catch (e) {
      finish({ outcome: 'THREW SYNCHRONOUSLY', message: String(e && e.message || e) });
    }
  });
};
</script>`;

async function main() {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rtdb-measure-'));
    const pageFile = path.join(profile, 'probe.html');
    fs.writeFileSync(pageFile, PAGE);
    if (!fs.existsSync(CHROME)) { console.log('Chrome not found at ' + CHROME); process.exit(2); }

    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-debugging-port=0', '--user-data-dir=' + profile,
        '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });

    let ws = null;
    const out = {};
    try {
        const port = await readPort(profile, 20000);
        let targets = null;
        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 250));
            try {
                const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
                targets = list.filter(t => t.type === 'page');
                if (targets.length) break;
            } catch (e) { /* not up */ }
        }
        if (!targets || !targets.length) throw new Error('no page target');
        ws = new WebSocket(targets[0].webSocketDebuggerUrl);
        await new Promise((res, rej) => {
            ws.addEventListener('open', res, { once: true });
            ws.addEventListener('error', () => rej(new Error('CDP socket error')), { once: true });
        });

        let id = 1;
        const ev = async (expr, awaitP) => {
            const m = await rpc(ws, id++, 'Runtime.evaluate',
                { expression: expr, returnByValue: true, awaitPromise: !!awaitP });
            if (m.result && m.result.exceptionDetails) {
                const x = m.result.exceptionDetails.exception;
                return { __threw: (x && x.description) || 'unknown' };
            }
            return m.result.result.value;
        };
        const net = async offline => rpc(ws, id++, 'Network.emulateNetworkConditions', {
            offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1
        });

        await rpc(ws, id++, 'Page.enable', {});
        await rpc(ws, id++, 'Network.enable', {});
        await rpc(ws, id++, 'Runtime.enable', {});
        await rpc(ws, id++, 'Page.navigate', { url: 'file://' + pageFile });

        // Wait for a REAL connection. Without this every result would be "offline"
        // and the measurement would prove nothing.
        let connected = false;
        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (await ev('window.__conn === true')) { connected = true; break; }
        }
        out.baseline = { connectedToLiveDatabase: connected };
        if (!connected) { out.baseline.note = 'never reached .info/connected === true'; }

        // ---- A: ONLINE write to a path the DEPLOYED RULES DENY -------------
        // Establishes what a real rejection looks like, and creates no data.
        out.A_denied_online = await ev(
            `probe('hacked_data/probe_${Date.now()}', { x: 1 }, 15000)`, true);

        // ---- B: OFFLINE AT THE MOMENT OF THE WRITE -------------------------
        await net(true);
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            if ((await ev('window.__conn')) === false) break;
        }
        out.B_offline_at_write = {
            connectedFlagBeforeWrite: await ev('window.__conn'),
            result: await ev(
                `probe('events/${SCRATCH_CODE}/scores/p1_h1', 4, 15000)`, true)
        };

        // ---- C: ONLINE AT ISSUE, CONNECTION LOST MID-FLIGHT ----------------
        // Cut the socket, then RESTORE it, so the outcome distinguishes
        // "rejected because the connection died" from "recovered and landed".
        // Without the restore, C is indistinguishable from B.
        await net(false);
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (await ev('window.__conn === true')) break;
        }
        const reconn = await ev('window.__conn');
        await ev(`window.__c = probe('events/${SCRATCH_CODE}/scores/p1_h2', 5, 30000)`);
        await new Promise(r => setTimeout(r, 40));
        await net(true);                       // kill it mid-flight
        const duringOutage = await ev('window.__conn');
        await new Promise(r => setTimeout(r, 3000));
        await net(false);                      // give it back
        out.C_lost_midflight = {
            connectedFlagAtIssue: reconn,
            connectedFlagDuringOutage: duringOutage,
            outageMs: 3000,
            result: await ev('window.__c', true)
        };

        // ---- cleanup -------------------------------------------------------
        await net(false);
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (await ev('window.__conn === true')) break;
        }
        out.cleanup = await ev(
            `db.ref('events/${SCRATCH_CODE}').remove()
                .then(() => 'removed events/${SCRATCH_CODE}')
                .catch(e => 'CLEANUP FAILED: ' + e.message)`, true);
        out.cleanup_verify = await ev(
            `db.ref('events/${SCRATCH_CODE}').once('value')
                .then(s => s.exists() ? 'STILL PRESENT' : 'gone')
                .catch(e => 'verify failed: ' + e.message)`, true);
    } catch (e) {
        out.error = String(e && e.message || e);
    } finally {
        try { if (ws) ws.close(); } catch (e) {}
        chrome.kill();
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    }
    console.log(JSON.stringify(out, null, 2));
}

main();
