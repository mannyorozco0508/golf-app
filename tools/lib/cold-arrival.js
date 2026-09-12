// ============================================================================
// ARRIVE COLD.
//
// WHY THIS EXISTS. Every device check written for the Ryder feature invoked the
// thing it was checking: the layout probe called renderRyderCupSetup(), the
// Foursomes check called rcOpenClassic(), the pointer check drove rcSave(). They
// proved "this works when invoked" and said nothing about "a user can reach it".
// Four separate dead wires shipped underneath that gap - a render call, a session
// pointer, a format, and a Cup surface nothing ever rendered.
//
// So this harness navigates to the URL a user lands on and TOUCHES NOTHING. The
// page loads its own scripts, runs its own init, registers its own listener, and
// renders whatever it renders. The only thing replaced is the DATA SOURCE.
//
// HOW. Firebase cannot reach the network from file://, so a cold load would never
// receive a snapshot and every page would look broken for the wrong reason. Two
// CDP capabilities solve that without touching a single page code path:
//
//   Network.setBlockedURLs        stops the real firebase vendor bundles loading
//   Page.addScriptToEvaluateOnNewDocument
//                                 installs a tiny firebase stand-in BEFORE any
//                                 page script runs, which hands the page its
//                                 fixture the moment the page asks for it
//
// The page's own `firebase.initializeApp(...)`, `firebase.database()`, and
// `db.ref(path).on('value', cb)` all run unmodified. Nothing is called from
// outside. If the page does not render something on its own, it does not render.
//
// A check built on this fails for the RIGHT reason: not "the renderer is broken"
// but "nothing invokes the renderer".
// ============================================================================

const { spawn } = require('child_process');
const registry = require('./browser-registry.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const CHROME = process.env.CHROME_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function rpc(ws, id, method, params) {
    return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error('CDP timeout on ' + method)), 30000);
        const h = ev => {
            const m = JSON.parse(ev.data);
            if (m.id === id) { clearTimeout(timer); ws.removeEventListener('message', h); res(m); }
        };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

// The stand-in. Small on purpose: it implements only what the pages actually use,
// so it cannot quietly diverge into a second Firebase.
function firebaseStub(dbJson) {
    return `
    (function () {
      var DB = ${dbJson};
      function refFor(pathStr) {
        var parts = String(pathStr).split('/').filter(Boolean);
        function resolve() {
          // ANY path, walked against the fixture. This resolved only events/<CODE>
          // before, which was enough while every check was about a single round.
          // A trip reads trips/<CODE>/rounds first and THEN the events it names, so
          // a stub that answered null for trips/ made the page look broken for a
          // reason that had nothing to do with the page.
          var node = DB;
          for (var i = 0; i < parts.length && node != null; i++) node = node[parts[i]];
          return node === undefined ? null : node;
        }
        var api = {
          key: 'STUB',
          on: function (ev, cb) {
            if (ev === 'value' && typeof cb === 'function') {
              // Asynchronous, like the real thing, so the page's own ordering holds.
              setTimeout(function () { cb({ val: function () { return resolve(); },
                                            exists: function () { return resolve() != null; } }); }, 0);
            }
            return cb;
          },
          off: function () {},
          once: function () {
            return Promise.resolve({ val: function () { return resolve(); },
                                     exists: function () { return resolve() != null; } });
          },
          set: function () { return Promise.resolve(); },
          update: function () { return Promise.resolve(); },
          remove: function () { return Promise.resolve(); },
          push: function () { return api; }
        };
        return api;
      }
      window.firebase = {
        initializeApp: function () { return {}; },
        database: function () { return { ref: refFor }; },
        // auth(): the real SDK is blocked above, so a page that asks for it must
        // find something. Signed out, always; a check that needs a signed-in
        // organizer stubs onAuthStateChanged itself.
        auth: function () {
          return {
            currentUser: null,
            onAuthStateChanged: function (cb) { setTimeout(function () { cb(null); }, 0); return function () {}; },
            signInWithEmailAndPassword: function () { return Promise.reject(new Error('stub: no auth in a cold check')); },
            signOut: function () { return Promise.resolve(); }
          };
        },
        apps: []
      };
    })();`;
}

// Opens `url` cold with a database fixture, waits for the page to settle, then
// evaluates `expression` and returns its value. Nothing else is run.
//
// `rounds` is the common case and stays: it is the events/ subtree, so
// `rounds: { ABC: {...} }` serves events/ABC. `db` is the whole database when a
// page reads more than one top-level node - a trip reads trips/<CODE>/rounds and
// then the events it names, so it needs both. Passing `db` wins; passing `rounds`
// is exactly `db: { events: rounds }`.
//
// `preScript` is injected before any page script too, for instrumenting a cold
// load - a MutationObserver, a wrapped function - without touching the page.
// `blockUrls` adds patterns to the block list. A check that measures WHERE a
// control sends the browser must block the real destination: otherwise Chrome
// follows it onto the network and document.URL reports where the SERVER put you.
// Cloudflare serves clean URLs, so /index.html?game=X 308s to /?game=X - and the
// check then reads a redirect target as though the page had built it. Blocked, the
// navigation fails and document.URL is exactly the URL the app asked for.

// THE PORT IS CHOSEN BY CHROME, NOT GUESSED.
//
// Both harnesses used to pick a random port out of a fixed range - 9800..9979
// here, 9400..9799 in cold-arrival - which is fine one session at a time and
// collides when tools run back to back. Wave 10 saw exactly that: one exit 1 and
// one exit 2 in a batch run, neither reproducible alone. A suite that is only
// green when run slowly is worse than a red one, because the failure looks like
// the app.
//
// --remote-debugging-port=0 makes Chrome bind an ephemeral port and write it to
// DevToolsActivePort inside the profile directory. Each session already gets its
// own mkdtemp profile, so the port is unique BY CONSTRUCTION - no range, no
// retry, and no chance of attaching to another session's browser, which a retry
// loop on a fixed range cannot rule out.
function readDevToolsPort(profileDir, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 20000);
    const file = path.join(profileDir, 'DevToolsActivePort');
    return new Promise((resolve, reject) => {
        (function poll() {
            try {
                const raw = fs.readFileSync(file, 'utf8').split('\n')[0].trim();
                if (raw && /^[0-9]+$/.test(raw)) return resolve(Number(raw));
            } catch (e) { /* not written yet */ }
            if (Date.now() > deadline) {
                return reject(new Error('Chrome never wrote DevToolsActivePort in '
                    + profileDir + ' - it may have failed to start'));
            }
            setTimeout(poll, 100);
        })();
    });
}

// STEPS, for a check that must act between arrival and measurement. Each step is
// { expression } (evaluated, its value collected) or { media: 'print' | 'screen'
// | '' } (Emulation.setEmulatedMedia, nothing collected). The result's `value`
// is then the ARRAY of collected values, in order. The rule about a device
// check not calling a page function still holds: an expression here may click
// the page's own button, and nothing else. Introduced for the pairings sheet,
// whose @media print rules can only be measured with print media emulated
// AFTER the button that builds the sheet has been pressed.
async function arriveCold({ url, rounds, db, expression, steps, viewport, settleMs, preScript, blockUrls }) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cold-arrival-'));
    if (!fs.existsSync(CHROME)) {
        return { ok: false, reason: 'Chrome not found at ' + CHROME + ' (set CHROME_PATH)' };
    }
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-debugging-port=0', '--user-data-dir=' + profile,
        '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
    // TRACKED BEFORE ANYTHING THAT CAN THROW OR BAIL. A caller that gives up
    // between here and the finally below exits through process.exit, which does
    // not run finally - the registry is what closes the browser then.
    const tracked = registry.track(chrome, profile);

    let ws = null;
    try {
        let port;
        try { port = await readDevToolsPort(profile, 20000); }
        catch (e) { return { ok: false, reason: String(e.message || e) }; }

        let targets = null;
        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 250));
            try {
                const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
                targets = list.filter(t => t.type === 'page');
                if (targets.length) break;
            } catch (e) { /* not up yet */ }
        }
        if (!targets || !targets.length) return { ok: false, reason: 'Chrome exposed no page target' };

        ws = new WebSocket(targets[0].webSocketDebuggerUrl);
        // EVERY URL THE PAGE ASKS FOR, in order, and the FIRST one is the URL the
        // app built. A check that measures WHERE a control sends the browser cannot
        // read document.URL afterwards: the navigation completes, so Cloudflare's
        // clean-URL redirect rewrites /index.html?game=X to /?game=X and the check
        // grades the redirect. Blocking is not the answer either - Chrome's URL
        // patterns do not match a main-frame navigation at all here (only '*' does,
        // and that stops the request before this event fires, leaving nothing to
        // read). So a check using this makes one real outbound GET; what it asserts
        // on is the request the PAGE issued, which no server can rewrite.
        const requests = [];
        await new Promise((res, rej) => {
            ws.addEventListener('open', res, { once: true });
            ws.addEventListener('error', () => rej(new Error('CDP socket error')), { once: true });
        });

        ws.addEventListener('message', ev => {
            let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.method === 'Network.requestWillBeSent' && m.params && m.params.request) {
                requests.push(m.params.request.url);
            }
        });

        let id = 1;
        await rpc(ws, id++, 'Page.enable', {});
        await rpc(ws, id++, 'Network.enable', {});
        await rpc(ws, id++, 'Runtime.enable', {});
        const v = viewport || { width: 390, height: 844 };
        await rpc(ws, id++, 'Emulation.setDeviceMetricsOverride',
            { width: v.width, height: v.height, deviceScaleFactor: 3, mobile: true });

        // The real bundles must not load, or they would replace the stand-in.
        await rpc(ws, id++, 'Network.setBlockedURLs',
            { urls: ['*firebase-app-compat.js', '*firebase-database-compat.js', '*firebase-auth-compat.js']
                .concat(blockUrls || []) });
        await rpc(ws, id++, 'Page.addScriptToEvaluateOnNewDocument',
            { source: firebaseStub(JSON.stringify(db || { events: rounds || {} })) });
        if (preScript) {
            await rpc(ws, id++, 'Page.addScriptToEvaluateOnNewDocument', { source: preScript });
        }

        await rpc(ws, id++, 'Page.navigate', { url: url });
        await new Promise(r => setTimeout(r, settleMs || 3000));

        let value;
        if (Array.isArray(steps)) {
            value = [];
            for (const step of steps) {
                if (step.media !== undefined) {
                    await rpc(ws, id++, 'Emulation.setEmulatedMedia', { media: step.media });
                    continue;
                }
                const r = await rpc(ws, id++, 'Runtime.evaluate',
                    { expression: step.expression, returnByValue: true });
                if (r.result && r.result.exceptionDetails) {
                    const ex = r.result.exceptionDetails.exception;
                    return { ok: false, reason: 'page threw: ' + (ex && ex.description) };
                }
                value.push(r.result.result.value);
            }
        } else {
            const m = await rpc(ws, id++, 'Runtime.evaluate',
                { expression: expression, returnByValue: true });
            if (m.result && m.result.exceptionDetails) {
                const ex = m.result.exceptionDetails.exception;
                return { ok: false, reason: 'page threw: ' + (ex && ex.description) };
            }
            value = m.result.result.value;
        }
        return { ok: true, value: value,
                 requests: requests.slice(),
                 finalUrl: (await rpc(ws, id++, 'Runtime.evaluate',
                     { expression: 'document.URL', returnByValue: true })).result.result.value };
    } catch (e) {
        return { ok: false, reason: String(e && e.message || e) };
    } finally {
        try { if (ws) ws.close(); } catch (e) {}
        registry.release(tracked);
        chrome.kill();
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    }
}

const fileUrl = (page, query) =>
    'file://' + path.join(REPO_ROOT, page) + (query ? '?' + query : '');

module.exports = { arriveCold, fileUrl, REPO_ROOT };
