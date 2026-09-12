// ============================================================================
// A WHOLE ROUND, NOT A SINGLE ARRIVAL.
//
// arriveCold answers "what does this page render when handed data". That is the
// right question for one screen and the wrong one for a Monday: creating a round,
// scoring eighteen holes and reading the receipt spans four pages, and every page
// after the first depends on what the previous one WROTE.
//
// The existing stub answers every write with Promise.resolve() and forgets it, so
// a journey through it would score a round into a void and then read an empty
// receipt - and report that as a bug in the receipt.
//
// SO THIS ONE REMEMBERS. Writes mutate an in-memory database, listeners re-fire on
// change like the real thing, and the database is carried in NODE between page
// loads and re-injected on each navigation. One browser, many pages, state that
// survives them.
//
// WHAT IT STILL REFUSES TO DO. It does not construct app state. Every round is
// created by filling the real controls and pressing the real buttons; every score
// is typed into the real input. If a page will not let you do something, the
// simulation cannot do it either, which is the entire point - seven dead wires
// survived a green suite precisely because their tests built the state by hand.
//
//   const j = await openJourney();
//   await j.goto(fileUrl('admin.html'));
//   await j.click('button', /Game Day/);
//   ...
//   await j.close();
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
        const timer = setTimeout(() => rej(new Error('CDP timeout on ' + method)), 40000);
        const h = ev => {
            const m = JSON.parse(ev.data);
            if (m.id === id) { clearTimeout(timer); ws.removeEventListener('message', h); res(m); }
        };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

// A Firebase stand-in with a memory. Small on purpose: it implements what these
// pages actually use, so it cannot drift into being a second Firebase.
function statefulStub(dbJson) {
    return `
    (function () {
      // STATE MUST SURVIVE A NAVIGATION THE PAGE STARTS ITSELF.
      //
      // Several real flows write and then immediately go somewhere:
      // createTripBlank() sets trips/<CODE> and sets location.href to it. The new
      // document re-injects whatever Node last harvested, which PREDATES that
      // write - so the trip vanished, loadTrip found nothing, and the page
      // redirected home with "Trip not found". That is a fault in this harness
      // that looks exactly like a broken Create Trip button.
      //
      // sessionStorage is per-tab and survives same-tab navigation, so the
      // database rides along with the golfer. The injected copy is the seed for a
      // fresh tab; after that the tab's own copy wins.
      var SEED = ${dbJson};
      var KEY = '__journey_db';
      try {
        var carried = sessionStorage.getItem(KEY);
        window.__DB = carried ? JSON.parse(carried) : SEED;
      } catch (e) { window.__DB = SEED; }
      function persist() {
        try { sessionStorage.setItem(KEY, JSON.stringify(window.__DB)); } catch (e) {}
      }
      window.__journeyPersist = persist;
      window.__WRITES = [];
      var listeners = [];
      var pushN = 0;

      function nodeAt(parts, create) {
        var node = window.__DB;
        for (var i = 0; i < parts.length; i++) {
          if (node == null || typeof node !== 'object') return undefined;
          if (node[parts[i]] === undefined) { if (!create) return undefined; node[parts[i]] = {}; }
          node = node[parts[i]];
        }
        return node;
      }
      function readAt(pathStr) {
        var parts = String(pathStr).split('/').filter(Boolean);
        var v = nodeAt(parts, false);
        return v === undefined ? null : v;
      }
      function writeAt(pathStr, value, merge) {
        var parts = String(pathStr).split('/').filter(Boolean);
        window.__WRITES.push({ path: pathStr, merge: !!merge });
        if (parts.length === 0) { window.__DB = value; return; }
        var parent = nodeAt(parts.slice(0, -1), true);
        var key = parts[parts.length - 1];
        if (value === null) { delete parent[key]; persist(); return notify(); }
        if (merge && value && typeof value === 'object' && !Array.isArray(value)) {
          // update() is a shallow merge, AND a key containing "/" addresses a
          // DESCENDANT - real Firebase does that whether or not the parent exists
          // yet. Requiring an existing parent stored "sideMatches/K0001" as a
          // literal key, which made a correctly saved Nassau look like it had
          // vanished. That was a fault in this stub reported as a fault in the app;
          // the round had saved perfectly.
          if (parent[key] === undefined || parent[key] === null
              || typeof parent[key] !== 'object') parent[key] = {};
          Object.keys(value).forEach(function (k) {
            if (k.indexOf('/') !== -1) { writeAt(pathStr + '/' + k, value[k], false); }
            else if (value[k] === null) { delete parent[key][k]; }
            else { parent[key][k] = JSON.parse(JSON.stringify(value[k])); }
          });
        } else { parent[key] = JSON.parse(JSON.stringify(value)); }
        persist();
        notify();
      }
      function snapshotFor(p) {
        return { val: function () { var v = readAt(p);
                   return v === undefined ? null : JSON.parse(JSON.stringify(v)); },
                 exists: function () { return readAt(p) != null; },
                 key: String(p).split('/').filter(Boolean).pop() || null };
      }
      function notify() {
        listeners.slice().forEach(function (l) {
          try { l.cb(snapshotFor(l.path)); } catch (e) { /* a listener that throws is the page's problem */ }
        });
      }
      function refFor(pathStr) {
        var api = {
          key: String(pathStr).split('/').filter(Boolean).pop() || null,
          on: function (ev, cb) {
            if (ev === 'value' && typeof cb === 'function') {
              listeners.push({ path: pathStr, cb: cb });
              setTimeout(function () { cb(snapshotFor(pathStr)); }, 0);
            }
            return cb;
          },
          off: function () { listeners = listeners.filter(function (l) { return l.path !== pathStr; }); },
          once: function () { return Promise.resolve(snapshotFor(pathStr)); },
          set: function (v) { writeAt(pathStr, v, false); return Promise.resolve(); },
          update: function (v) { writeAt(pathStr, v, true); return Promise.resolve(); },
          remove: function () { writeAt(pathStr, null, false); return Promise.resolve(); },
          child: function (c) { return refFor(pathStr + '/' + c); },
          push: function (v) {
            pushN++;
            var key = 'K' + String(pushN).padStart(4, '0');
            var child = refFor(pathStr + '/' + key);
            if (v !== undefined) child.set(v);
            return child;
          }
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

      // MODAL DIALOGS ARE RECORDED, NOT SHOWN. alert() and confirm() block the
      // renderer in headless Chrome, and a blocked renderer makes the NEXT
      // Runtime.evaluate time out - which looks exactly like the page crashing.
      // A simulation that could not press a button because a dialog was open would
      // report a bug that does not exist. Kept as a log so a simulation can assert
      // on what the page TOLD the golfer, which is often the thing under test.
      window.__DIALOGS = [];
      window.alert = function (m) { window.__DIALOGS.push({ type: 'alert', message: String(m) }); };
      window.confirm = function (m) { window.__DIALOGS.push({ type: 'confirm', message: String(m) }); return true; };
      window.prompt = function (m) { window.__DIALOGS.push({ type: 'prompt', message: String(m) }); return null; };
    })();`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));


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

async function openJourney(opts) {
    const o = opts || {};
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'journey-'));
    if (!fs.existsSync(CHROME)) throw new Error('Chrome not found at ' + CHROME);
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-debugging-port=0', '--user-data-dir=' + profile,
        '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
    // TRACKED BEFORE ANYTHING THAT CAN THROW OR BAIL - openJourney throws in
    // three places below, and a tool that bail()s while a session is open exits
    // through process.exit, which does not run any finally the caller wrote.
    const tracked = registry.track(chrome, profile);

    let port;
    try { port = await readDevToolsPort(profile, 20000); }
    catch (e) { registry.release(tracked); chrome.kill(); throw e; }

    let targets = null;
    for (let i = 0; i < 80; i++) {
        await sleep(250);
        try {
            const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
            targets = list.filter(t => t.type === 'page');
            if (targets.length) break;
        } catch (e) { /* not up yet */ }
    }
    if (!targets || !targets.length) {
        registry.release(tracked); chrome.kill();
        throw new Error('Chrome exposed no page target');
    }

    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((res, rej) => {
        ws.addEventListener('open', res, { once: true });
        ws.addEventListener('error', () => rej(new Error('CDP socket error')), { once: true });
    });

    let id = 1;
    await rpc(ws, id++, 'Page.enable', {});
    await rpc(ws, id++, 'Network.enable', {});
    await rpc(ws, id++, 'Runtime.enable', {});
    const v = o.viewport || { width: 390, height: 844 };
    await rpc(ws, id++, 'Emulation.setDeviceMetricsOverride',
        { width: v.width, height: v.height, deviceScaleFactor: 2, mobile: true });
    await rpc(ws, id++, 'Network.setBlockedURLs',
        { urls: ['*firebase-app-compat.js', '*firebase-database-compat.js', '*firebase-auth-compat.js'] });

    let db = o.db || { events: {}, trips: {} };
    let injected = null;
    const log = [];

    async function evaluate(expression) {
        const m = await rpc(ws, id++, 'Runtime.evaluate',
            { expression: expression, returnByValue: true, awaitPromise: true });
        if (m.result && m.result.exceptionDetails) {
            const ex = m.result.exceptionDetails.exception;
            throw new Error('page threw: ' + (ex && (ex.description || ex.value)));
        }
        return m.result.result.value;
    }

    // Everything the page wrote comes back to Node, so the next page starts from it.
    async function harvest() {
        // ONLY IF THE PAGE ACTUALLY HAS ONE. `window.__DB || {}` returned an empty
        // object on about:blank and on any page the stub never reached, and this
        // assigned it - silently wiping a seeded database. Every round then
        // "vanished", and the trip page reported it could not find game codes that
        // existed a second earlier. A harness that can erase its own fixture will
        // always be read as a bug in the app.
        try {
            const raw = await evaluate(
                "(typeof window.__DB === 'undefined' || window.__DB === null) ? null : JSON.stringify(window.__DB)");
            if (raw) db = JSON.parse(raw);
        } catch (e) { /* a page that never booted wrote nothing */ }
        return db;
    }

    const api = {
        get db() { return db; },
        log,
        evaluate,
        harvest,
        async goto(url, settleMs) {
            await harvest();
            if (injected) {
                await rpc(ws, id++, 'Page.removeScriptToEvaluateOnNewDocument',
                    { identifier: injected });
            }
            // Node's copy is authoritative at the moment of an explicit goto, so the
            // tab's carried copy is cleared first - otherwise a deliberate reseed
            // would be silently ignored by the page.
            try { await evaluate("sessionStorage.removeItem('__journey_db')"); } catch (e) {}
            const r = await rpc(ws, id++, 'Page.addScriptToEvaluateOnNewDocument',
                { source: statefulStub(JSON.stringify(db)) });
            injected = r.result && r.result.identifier;
            await rpc(ws, id++, 'Page.navigate', { url: url });
            await sleep(settleMs || 2200);
            log.push('goto ' + url.replace(/^file:\/\/.*\//, ''));
            return api;
        },
        // Clicks the first element matching `selector` whose text or onclick matches
        // `pattern`. Returns false rather than throwing, so a simulation can report
        // "the button a golfer needs is not there" instead of crashing.
        async click(selector, pattern, opts2) {
            const p = pattern ? String(pattern) : '';
            const found = await evaluate(`
                (() => {
                  const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
                  const re = ${p ? p : 'null'};
                  const hit = els.filter(e => !re
                      || re.test(e.textContent || '') || re.test(e.getAttribute('onclick') || ''))
                      [${(opts2 && opts2.index) || 0}];
                  if (!hit) return false;
                  hit.scrollIntoView && hit.scrollIntoView();
                  hit.click();
                  return true;
                })()`);
            log.push('click ' + selector + (p ? ' ' + p : '') + ' -> ' + found);
            await sleep((opts2 && opts2.settleMs) || 350);
            return found;
        },
        async setValue(selector, value, opts2) {
            const ok = await evaluate(`
                (() => {
                  const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
                      [${(opts2 && opts2.index) || 0}];
                  if (!el) return false;
                  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
                      : (el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
                                                           : HTMLInputElement.prototype);
                  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                  setter.call(el, ${JSON.stringify(String(value))});
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                })()`);
            log.push('set ' + selector + ' = ' + value + ' -> ' + ok);
            await sleep((opts2 && opts2.settleMs) || 120);
            return ok;
        },
        // What the page said in a dialog since the last call, then cleared.
        async dialogs() {
            const d = await evaluate('JSON.stringify(window.__DIALOGS || [])');
            await evaluate('window.__DIALOGS = []');
            return JSON.parse(d);
        },
        async text(selector) {
            return evaluate(`
                (() => {
                  const el = document.querySelector(${JSON.stringify(selector)});
                  return el ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : null;
                })()`);
        },
        async screenText() {
            return evaluate("(document.body.innerText || '').replace(/\\s+/g, ' ').trim()");
        },
        async close() {
            await harvest();
            try { ws.close(); } catch (e) {}
            registry.release(tracked);
            chrome.kill();
            try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
            return db;
        }
    };
    return api;
}

const fileUrl = (page, query) =>
    'file://' + path.join(REPO_ROOT, page) + (query ? '?' + query : '');

module.exports = { openJourney, fileUrl, REPO_ROOT };
