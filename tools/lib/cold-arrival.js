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
async function arriveCold({ url, rounds, db, expression, viewport, settleMs, preScript }) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cold-arrival-'));
    const port = 9400 + Math.floor(Math.random() * 400);
    if (!fs.existsSync(CHROME)) {
        return { ok: false, reason: 'Chrome not found at ' + CHROME + ' (set CHROME_PATH)' };
    }
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
        '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });

    let ws = null;
    try {
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
        await new Promise((res, rej) => {
            ws.addEventListener('open', res, { once: true });
            ws.addEventListener('error', () => rej(new Error('CDP socket error')), { once: true });
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
            { urls: ['*firebase-app-compat.js', '*firebase-database-compat.js'] });
        await rpc(ws, id++, 'Page.addScriptToEvaluateOnNewDocument',
            { source: firebaseStub(JSON.stringify(db || { events: rounds || {} })) });
        if (preScript) {
            await rpc(ws, id++, 'Page.addScriptToEvaluateOnNewDocument', { source: preScript });
        }

        await rpc(ws, id++, 'Page.navigate', { url: url });
        await new Promise(r => setTimeout(r, settleMs || 3000));

        const m = await rpc(ws, id++, 'Runtime.evaluate',
            { expression: expression, returnByValue: true });
        if (m.result && m.result.exceptionDetails) {
            const ex = m.result.exceptionDetails.exception;
            return { ok: false, reason: 'page threw: ' + (ex && ex.description) };
        }
        return { ok: true, value: m.result.result.value,
                 finalUrl: (await rpc(ws, id++, 'Runtime.evaluate',
                     { expression: 'document.URL', returnByValue: true })).result.result.value };
    } catch (e) {
        return { ok: false, reason: String(e && e.message || e) };
    } finally {
        try { if (ws) ws.close(); } catch (e) {}
        chrome.kill();
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    }
}

const fileUrl = (page, query) =>
    'file://' + path.join(REPO_ROOT, page) + (query ? '?' + query : '');

module.exports = { arriveCold, fileUrl, REPO_ROOT };
