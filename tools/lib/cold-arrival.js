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

// STEPS (the `steps` array of arriveCold): { expression } evaluates and pushes
// the value; { cdp: { method, params } } a raw DevTools command; { tap: selector,
// nth } a real tap at the element's centre; { sleep: ms }; { media } emulated
// media (pushes nothing); { deliver: { path, value } } a SECOND SNAPSHOT to every
// value listener on that path (2026-09-18) - pushes { path, listeners, threw }.
// One snapshot proves the first paint, not the page: a check on a live page
// delivers at least two on the listener it measures, and bails when the
// delivery reached none.
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

// The `auth` option of a cold arrival / a journey, resolved to what the stand-in
// injects. Default: an anonymous user, as auth-boot leaves every consumer page.
function authSpec(auth) {
    if (auth === undefined || auth === 'anonymous') return { mode: 'anonymous', user: { uid: 'anon-cold', isAnonymous: true, email: null } };
    if (auth === null || auth === 'signed-out') return { mode: 'signed-out', user: null };
    if (auth && typeof auth === 'object' && auth.uid) return { mode: 'user', user: Object.assign({ isAnonymous: false, email: null }, auth) };
    throw new Error('auth option must be omitted, "anonymous", "signed-out", null, or { uid, email, isAnonymous }');
}

// The stand-in. Small on purpose: it implements only what the pages actually use,
// so it cannot quietly diverge into a second Firebase.
function firebaseStub(dbJson, auth) {
    const spec = authSpec(auth);
    const authMode = JSON.stringify(spec.mode), authUser = JSON.stringify(spec.user);
    return `
    (function () {
      var DB = ${dbJson};
      var AUTH_MODE = ${authMode};   // 'anonymous' | 'signed-out' | 'user'
      var AUTH_USER = ${authUser};   // the user onAuthStateChanged first emits, or null
      var AUTH_LISTENERS = [];
      // EVERY value listener, by path, so a check can deliver a SECOND snapshot
      // (2026-09-18). Until then this stub fired each listener once and never
      // again, and set()/update() re-fired nothing - so every check built on it
      // measured the FIRST PAINT and nothing after. That is how a non-owner's
      // leaderboard froze after one snapshot for 78 commits under 27 green
      // tools. Delivery is OPT-IN, a step: writes still re-fire nothing, because
      // a behaviour change on every write is every tool's business at once.
      var VALUE_LISTENERS = [];
      window.__coldDeliver = function (pathStr, value) {
        var key = String(pathStr).split('/').filter(Boolean).join('/');
        // the fixture follows, so a later once()/resolve() agrees with what was delivered
        var parts = key.split('/'); var node = DB;
        for (var i = 0; i < parts.length - 1; i++) { if (node[parts[i]] == null || typeof node[parts[i]] !== 'object') node[parts[i]] = {}; node = node[parts[i]]; }
        if (parts.length) node[parts[parts.length - 1]] = value;
        var hits = VALUE_LISTENERS.filter(function (l) { return l.path === key; });
        var threw = [];
        hits.forEach(function (l) {
          try { l.cb({ val: function () { return JSON.parse(JSON.stringify(value)); }, exists: function () { return value != null; } }); }
          catch (e) { threw.push(String(e && e.message)); }
        });
        return { path: key, listeners: hits.length, threw: threw };
      };
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
              VALUE_LISTENERS.push({ path: parts.join('/'), cb: cb });
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
        // find something - and since anonymous sign-in went live, what it finds
        // in production is a USER. By default this is an anonymous one, the way
        // auth-boot.js leaves every consumer page: currentUser set, isAnonymous
        // true, onAuthStateChanged emitting it, signInAnonymously resolving it.
        // The 'auth' option names the other two states: 'signed-out' (no user,
        // and signInAnonymously REJECTS with the SDK's offline code, so the state
        // is stable - a device with no session and no signal), or an email
        // organizer { uid, email, isAnonymous: false } for tournament.html.
        // Until 2026-09-15 this was signed out with no signInAnonymously at all,
        // so authReady rejected on every cold arrival - a state no visitor is in.
        auth: function () {
          // ONE listener list across every firebase.auth() call, as the SDK has
          // one auth instance: a sign-in emitted here reaches every subscriber.
          var listeners = AUTH_LISTENERS;
          function emit(u) { listeners.slice().forEach(function (cb) { try { cb(u); } catch (e) {} }); }
          // The stub's door for "the owner signed in AFTER the record arrived" -
          // the second of the two orders the manage gate must handle. A check
          // arrives signed out, then calls window.__signInAs({ uid, email }) and
          // reads what the page put back. Nothing the page defines is invoked.
          window.__signInAs = function (u) { AUTH_USER = u || null; emit(AUTH_USER); return AUTH_USER ? 'signed in' : 'signed out'; };
          return {
            get currentUser() { return AUTH_USER; },
            onAuthStateChanged: function (cb) {
              if (typeof cb === 'function') { listeners.push(cb); setTimeout(function () { cb(AUTH_USER); }, 0); }
              return function () { listeners = listeners.filter(function (x) { return x !== cb; }); };
            },
            signInAnonymously: function () {
              if (AUTH_USER) return Promise.resolve({ user: AUTH_USER });
              if (AUTH_MODE === 'signed-out') {
                var err = new Error('stub: signed out and staying so'); err.code = 'auth/network-request-failed';
                return Promise.reject(err);
              }
              AUTH_USER = { uid: 'anon-cold', isAnonymous: true, email: null };
              emit(AUTH_USER);
              return Promise.resolve({ user: AUTH_USER });
            },
            signInWithEmailAndPassword: function () { return Promise.reject(new Error('stub: no email sign-in in a cold check')); },
            signOut: function () { AUTH_USER = null; emit(null); return Promise.resolve(); }
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
// { expression } (evaluated, its value collected), { media: 'print' | 'screen'
// | '' } (Emulation.setEmulatedMedia, nothing collected), { cdp: { method,
// params } } (a raw DevTools command - a real tap or keystroke through Input.*;
// 'ok' collected) or { sleep: ms }. The result's `value`
// is then the ARRAY of collected values, in order. The rule about a device
// check not calling a page function still holds: an expression here may click
// the page's own button, and nothing else. Introduced for the pairings sheet,
// whose @media print rules can only be measured with print media emulated
// AFTER the button that builds the sheet has been pressed.
async function arriveCold({ url, rounds, db, expression, steps, viewport, settleMs, preScript, blockUrls, auth }) {
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
            { source: firebaseStub(JSON.stringify(db || { events: rounds || {} }), auth) });
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
                // A REAL INPUT, not a synthetic event. { cdp: { method, params } } sends a
                // raw DevTools command - Input.dispatchMouseEvent / Input.dispatchKeyEvent -
                // so a tap is a tap and a keystroke is a keystroke, with the browser's own
                // focus, change and blur sequencing. A dispatched DOM event cannot do that:
                // a programmatic value change never fires `change` on blur, which is the
                // step that reproduces the score-entry focus loss. The rule still holds -
                // this presses keys and buttons; it calls nothing the page defines.
                // { sleep: ms } waits, for a keyboard-driven change to settle.
                if (step.cdp) {
                    const r = await rpc(ws, id++, step.cdp.method, step.cdp.params || {});
                    value.push(r && r.error ? 'cdp error: ' + JSON.stringify(r.error) : 'ok');
                    continue;
                }
                if (step.sleep !== undefined) {
                    await new Promise(r => setTimeout(r, step.sleep));
                    value.push('slept ' + step.sleep);
                    continue;
                }
                // { deliver: { path, value } } - a SECOND SNAPSHOT to every value
                // listener on that path, the way the SDK delivers the next one.
                // Pushes { path, listeners, threw }: a check must bail when
                // listeners is 0 (nothing was listening - the step proved
                // nothing) and fail when threw is not empty (the page's callback
                // died on it - the real SDK rethrows and the paint never happens).
                // One snapshot proves the first paint, not the page.
                if (step.deliver) {
                    const d = await rpc(ws, id++, 'Runtime.evaluate', { expression: `window.__coldDeliver(${JSON.stringify(step.deliver.path)}, ${JSON.stringify(step.deliver.value)})`, returnByValue: true });
                    value.push((d.result && d.result.result && d.result.result.value) || { path: step.deliver.path, listeners: 0, threw: ['__coldDeliver is not on the page'] });
                    continue;
                }
                // { tap: selector, nth } - a REAL tap at the element's centre, the
                // rect read at tap time so a step need not know coordinates in
                // advance (a list rebuilt by a snapshot moves its rows). It scrolls
                // the element into view first, as a thumb does, then sends the same
                // Input.dispatchMouseEvent pair a { cdp } step would. querySelectorAll
                // and getBoundingClientRect are the DOM's, not the page's: this still
                // calls nothing the page defines. Pushes the point tapped, or a
                // 'no element' line so a missed selector fails loudly downstream.
                if (step.tap) {
                    const find = `(function () { var el = document.querySelectorAll(${JSON.stringify(step.tap)})[${step.nth || 0}]; if (!el) return null; el.scrollIntoView({ block: 'center' }); var r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }; })()`;
                    const f = await rpc(ws, id++, 'Runtime.evaluate', { expression: find, returnByValue: true });
                    const pt = f.result && f.result.result && f.result.result.value;
                    if (!pt || !(pt.w > 0 && pt.h > 0)) { value.push('no element: ' + step.tap + '[' + (step.nth || 0) + ']'); continue; }
                    await new Promise(r => setTimeout(r, 60));
                    for (const type of ['mousePressed', 'mouseReleased']) {
                        await rpc(ws, id++, 'Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
                    }
                    value.push('tapped ' + step.tap + '[' + (step.nth || 0) + '] at ' + pt.x + ',' + pt.y);
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
