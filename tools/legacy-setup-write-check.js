#!/usr/bin/env node
// ============================================================================
// WHAT THE ORGANIZER SEES WHEN THEY EDIT SETUP ON A LEGACY ROUND (v203).
//
// The v203 rules rehearsal proved the WRITE is refused. It did not show the
// SCREEN, and a refused write and a refused screen are not the same report.
// This drives the real admin.html in real Chrome, against a REAL RTDB emulator
// loading the repo's REAL database.rules.json, on a round with no ownerUid -
// and taps the wizard through to Save the way a golfer does.
//
// IT CALLS NOTHING THE PAGE DEFINES. The only things sent are Input events:
// mouse clicks on the wizard's own Next buttons and on #main-save-btn. The page
// loads its own scripts, runs its own init, restores its own settings, builds
// its own payload and does its own write. If the page does not do a thing on
// its own, this check cannot make it.
//
// WHAT IS REPLACED, AND ONLY THIS - the DATA SOURCE:
//   * firebase.initializeApp's databaseURL is rewritten to the emulator. The
//     page's own bytes are untouched; a property hook on window.firebase wraps
//     initializeApp before any page script runs.
//   * auth-boot.js's `auth = fb.auth()` line gets a useEmulator call appended,
//     served through CDP Fetch interception, so the anonymous sign-in goes to
//     the AUTH EMULATOR. Nothing reaches production, and no production account
//     is created. The patch is printed in the output.
//   * ONE declared edit to the rules copy: /registrations/$code/$entryId/email
//     .validate's regex uses \s, which the RTDB emulator's parser rejects and
//     production's accepts (pre-existing, commit 21b20b9 - the emulator cannot
//     load production's live ruleset either). Replaced with contains('@') in the
//     TEMP copy only. No case here touches /registrations.
//
// RUN IT: node tools/legacy-setup-write-check.js [--variant=wave|head|both]
//   head  serves organizer-gate.js and admin.html from a saved pre-v203 copy,
//         so the defect can be SEEN rather than described. Those copies are
//         built by git show, so `head` means HEAD, not the working tree.
// Exit 0 = every variant behaved as this file says it should; 1 = it did not;
// 2 = the harness could not run (no Chrome, no firebase-tools, port in use).
// ============================================================================

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const registry = require('./lib/browser-registry.js');

const REPO_ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HTTP_PORT = Number(process.env.V203_HTTP_PORT || 8203);
const DB_PORT = Number(process.env.V203_DB_PORT || 9021);
const AUTH_PORT = Number(process.env.V203_AUTH_PORT || 9099);
const PROJECT = 'demo-v203';
const NS = PROJECT + '-default-rtdb';
const CODE = 'LGCY01';
const DB_URL = 'http://127.0.0.1:' + DB_PORT + '/?ns=' + NS;
const AUTH_URL = 'http://127.0.0.1:' + AUTH_PORT;

const args = process.argv.slice(2);
const variantArg = (args.find((a) => a.startsWith('--variant=')) || '--variant=both').split('=')[1];
const VARIANTS = variantArg === 'both' ? ['head', 'wave'] : [variantArg];
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'v203-check-'));
const log = (...a) => console.log(...a);

// ---- the rules the emulator will enforce ------------------------------------
function writeRules() {
    const src = path.join(REPO_ROOT, 'database.rules.json');
    const doc = JSON.parse(fs.readFileSync(src, 'utf8'));
    let edits = 0;
    (function walk(node) {
        Object.keys(node).forEach((k) => {
            const v = node[k];
            if (v && typeof v === 'object') walk(v);
            else if (k === '.validate' && typeof v === 'string' && v.indexOf('[^@\\s]') >= 0) {
                node[k] = v.replace(".matches(/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/)", ".contains('@')");
                edits++;
            }
        });
    })(doc.rules);
    const out = path.join(TMP, 'rules.json');
    fs.writeFileSync(out, JSON.stringify(doc, null, 2));
    fs.writeFileSync(path.join(TMP, 'firebase.json'), JSON.stringify({
        database: { rules: 'rules.json' },
        emulators: {
            database: { host: '127.0.0.1', port: DB_PORT },
            auth: { host: '127.0.0.1', port: AUTH_PORT },
            ui: { enabled: false }
        }
    }, null, 2));
    return { out, edits, sha: require('crypto').createHash('sha256').update(fs.readFileSync(src)).digest('hex').slice(0, 16) };
}

// ---- the emulators ----------------------------------------------------------
async function startEmulators() {
    const emu = spawn('npx', ['-y', 'firebase-tools@14', 'emulators:start', '--only', 'database,auth',
        '--project', PROJECT, '--config', path.join(TMP, 'firebase.json')],
        { cwd: TMP, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    emu.stdout.on('data', (d) => { out += d; });
    emu.stderr.on('data', (d) => { out += d; });
    for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (/All emulators ready/.test(out)) return { emu, out };
        if (/Error|error:/.test(out) && /rules/i.test(out) && !/All emulators ready/.test(out) && i > 8) break;
    }
    try { emu.kill('SIGTERM'); } catch (e) { }
    throw new Error('the emulators did not come up:\n' + out.slice(-1500));
}
const adminHeaders = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const dbUrl = (p) => 'http://127.0.0.1:' + DB_PORT + '/' + p + '.json?ns=' + NS;
async function seed(p, v) {
    const r = await fetch(dbUrl(p), { method: 'PUT', headers: adminHeaders, body: JSON.stringify(v) });
    if (!r.ok) throw new Error('seed ' + p + ' failed ' + r.status + ' ' + (await r.text()));
}
const readBack = async (p) => JSON.parse(await (await fetch(dbUrl(p), { headers: adminHeaders })).text());

// A LEGACY round: exists, has scores, and carries NO ownerUid. 96 of the 105
// rounds in production look like this; 65 of them have no organizerToken either,
// which is the shape whose wizard opens for a code-holder with no extra link.
function legacyRound() {
    const players = [
        { id: 101, name: 'Ann', hcp: '6', playingForMoney: true, teeColor: 'white' },
        { id: 102, name: 'Ben', hcp: '9', playingForMoney: true, teeColor: 'white' },
        { id: 103, name: 'Cal', hcp: '0', playingForMoney: true, teeColor: 'white' },
        { id: 104, name: 'Dee', hcp: '12', playingForMoney: true, teeColor: 'white' }
    ];
    const courseData = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
    const scores = {};
    players.forEach((p) => { for (let h = 1; h <= 9; h++) scores['p' + p.id + '_h' + h] = 5; });
    return {
        eventName: 'monday', roundDay: 'monday', eventCategory: 'weekend', categoryIcon: '⛳',
        activeCourseKey: 'v203_course', courseName: 'Rehearsal Links',
        gameFormat: 'stroke', courseData, players, scores,
        groupSizeOverrides: { 0: 4 }, settlementMode: 'whole-dollar', skinsRounding: 'odd-dollar'
    };
}

// ---- the static server, with the two files swappable ------------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function startServer(overrides) {
    const server = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/') p = '/index.html';
        const file = overrides[p] || path.join(REPO_ROOT, p.replace(/^\/+/, ''));
        fs.readFile(file, (err, body) => {
            if (err) { res.writeHead(404); res.end('no'); return; }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(body);
        });
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(HTTP_PORT, '127.0.0.1', () => resolve(server));
    });
}

// ---- CDP -------------------------------------------------------------------
function rpc(ws, id, method, params) {
    return new Promise((resolve, reject) => {
        const onMsg = (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.id !== id) return;
            ws.removeEventListener('message', onMsg);
            m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result);
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method, params }));
    });
}
async function readDevToolsPort(profile, ms) {
    const f = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < ms / 200; i++) {
        await new Promise((r) => setTimeout(r, 200));
        try { const t = fs.readFileSync(f, 'utf8').split('\n'); if (t[0]) return Number(t[0]); } catch (e) { }
    }
    throw new Error('Chrome never wrote DevToolsActivePort');
}

// The ONE line of auth-boot.js this check rewrites, so the anonymous sign-in
// goes to the auth emulator instead of production. Printed in the output.
const AUTH_BOOT_FROM = "try { auth = fb.auth(); } catch (e) { return fail('auth-unavailable', e); }";
const AUTH_BOOT_TO = "try { auth = fb.auth(); try { auth.useEmulator('" + AUTH_URL + "', { disableWarnings: true }); window.__EMU_AUTH = 1; } catch (ee) { window.__EMU_AUTH_ERR = String((ee && ee.message) || ee); } } catch (e) { return fail('auth-unavailable', e); }";

const PRE_SCRIPT = `(function () {
    var _fb;
    Object.defineProperty(window, 'firebase', {
        configurable: true,
        get: function () { return _fb; },
        set: function (v) {
            _fb = v;
            if (v && typeof v.initializeApp === 'function' && !v.__emuWrapped) {
                var orig = v.initializeApp;
                v.initializeApp = function (cfg) {
                    var c = {}; for (var k in cfg) c[k] = cfg[k];
                    c.databaseURL = ${JSON.stringify(DB_URL)};
                    window.__EMU_DB = c.databaseURL;
                    return orig.call(this, c);
                };
                v.__emuWrapped = true;
            }
        }
    });
})();`;

async function driveOnce(variant, overrides) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'v203-prof-'));
    if (!fs.existsSync(CHROME)) return { ok: false, reason: 'Chrome not found at ' + CHROME };
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
    const tracked = registry.track(chrome, profile);
    let ws = null;
    try {
        const port = await readDevToolsPort(profile, 20000);
        let targets = null;
        for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 250));
            try {
                const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
                targets = list.filter((t) => t.type === 'page');
                if (targets.length) break;
            } catch (e) { }
        }
        if (!targets || !targets.length) return { ok: false, reason: 'no page target' };
        ws = new WebSocket(targets[0].webSocketDebuggerUrl);
        await new Promise((res, rej) => {
            ws.addEventListener('open', res, { once: true });
            ws.addEventListener('error', () => rej(new Error('CDP socket error')), { once: true });
        });

        const dialogs = [], consoleErrs = [];
        let id = 1;
        ws.addEventListener('message', (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.method === 'Page.javascriptDialogOpening') {
                dialogs.push({ type: m.params.type, message: m.params.message });
                ws.send(JSON.stringify({ id: 100000 + dialogs.length, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
            }
            if (m.method === 'Runtime.exceptionThrown') {
                const d = m.params.exceptionDetails || {};
                consoleErrs.push(String((d.exception && d.exception.description) || d.text || '').split('\n')[0]);
            }
            if (m.method === 'Fetch.requestPaused') {
                const p = m.params;
                if (/auth-boot\.js/.test(p.request.url)) {
                    let body = fs.readFileSync(path.join(REPO_ROOT, 'auth-boot.js'), 'utf8');
                    if (body.indexOf(AUTH_BOOT_FROM) < 0) {
                        ws.send(JSON.stringify({ id: 200000 + Math.floor(Math.random() * 9999), method: 'Fetch.failRequest', params: { requestId: p.requestId, errorReason: 'Failed' } }));
                        consoleErrs.push('HARNESS: the auth-boot line to patch was not found');
                        return;
                    }
                    body = body.replace(AUTH_BOOT_FROM, AUTH_BOOT_TO);
                    ws.send(JSON.stringify({
                        id: 200000 + Math.floor(Math.random() * 9999), method: 'Fetch.fulfillRequest',
                        params: { requestId: p.requestId, responseCode: 200, body: Buffer.from(body).toString('base64'),
                            responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }] }
                    }));
                    return;
                }
                ws.send(JSON.stringify({ id: 300000 + Math.floor(Math.random() * 9999), method: 'Fetch.continueRequest', params: { requestId: p.requestId } }));
            }
        });

        await rpc(ws, id++, 'Page.enable', {});
        await rpc(ws, id++, 'Runtime.enable', {});
        await rpc(ws, id++, 'Network.enable', {});
        await rpc(ws, id++, 'Fetch.enable', { patterns: [{ urlPattern: '*auth-boot.js*' }] });
        await rpc(ws, id++, 'Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
        await rpc(ws, id++, 'Page.addScriptToEvaluateOnNewDocument', { source: PRE_SCRIPT });

        const ev = async (expr) => (await rpc(ws, id++, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
        const tap = async (sel) => {
            const box = await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});
                if(!e) return null; var r=e.getBoundingClientRect();
                if (r.width===0||r.height===0) return null;
                return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), w:Math.round(r.width), h:Math.round(r.height)};})()`);
            if (!box) return null;
            await rpc(ws, id++, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
            await rpc(ws, id++, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
            await new Promise((r) => setTimeout(r, 350));
            return box;
        };

        await rpc(ws, id++, 'Page.navigate', { url: 'http://127.0.0.1:' + HTTP_PORT + '/admin.html?game=' + CODE });
        await new Promise((r) => setTimeout(r, 4000));

        const arrival = {
            dbUrl: await ev('window.__EMU_DB || null'),
            authPatched: await ev('window.__EMU_AUTH || window.__EMU_AUTH_ERR || null'),
            uid: await ev('(window.authBootState && window.authBootState.uid) || null'),
            authStatus: await ev('(window.authBootState && window.authBootState.status) || null'),
            refusedScreen: await ev("(function(){var e=document.getElementById('setup-refused-screen'); return e ? getComputedStyle(e).display : 'absent';})()"),
            wizardVisible: await ev("(function(){var e=document.getElementById('admin-screen'); return e ? getComputedStyle(e).display : 'absent';})()"),
            loadedName: await ev("(function(){var e=document.getElementById('course-search-input'); return e ? e.value : null;})()"),
            roster: await ev("document.querySelectorAll('#player-list .player-row').length"),
            step: await ev("(function(){var s=[...document.querySelectorAll('.wizard-step')].filter(e=>getComputedStyle(e).display!=='none'); return s.length ? s[0].id : null;})()")
        };

        // WALK THE WIZARD the way a golfer does: tap the visible step's own Next
        // button until the Save button is on screen. No page function is called.
        const walk = [];
        for (let i = 0; i < 12; i++) {
            const saveBox = await ev(`(function(){var e=document.getElementById('main-save-btn'); if(!e) return null;
                var r=e.getBoundingClientRect(); return (r.width>0&&r.height>0)?{w:Math.round(r.width),h:Math.round(r.height)}:null;})()`);
            if (saveBox) { walk.push('save visible ' + saveBox.w + 'x' + saveBox.h); break; }
            const next = await ev("(function(){var s=[...document.querySelectorAll('.wizard-step')].filter(e=>getComputedStyle(e).display!=='none')[0];\n                if(!s) return null; var b=s.querySelector('.wizard-btn-next'); return b ? '#'+s.id+' .wizard-btn-next' : null;})()");
            if (!next) { walk.push('no Next on the visible step'); break; }
            const stepBefore = await ev("(function(){var s=[...document.querySelectorAll('.wizard-step')].filter(e=>getComputedStyle(e).display!=='none'); return s.length?s[0].id:null;})()");
            const box = await tap(next);
            const stepAfter = await ev("(function(){var s=[...document.querySelectorAll('.wizard-step')].filter(e=>getComputedStyle(e).display!=='none'); return s.length?s[0].id:null;})()");
            walk.push(stepBefore + ' -> ' + stepAfter + (box ? ' (tap ' + box.w + 'x' + box.h + ')' : ' (no box)'));
            if (stepBefore === stepAfter) break;
        }

        const beforeSave = {
            saveLabel: await ev("(function(){var e=document.getElementById('main-save-btn'); return e ? e.innerText : null;})()"),
            tapTarget: await ev("(function(){var e=document.getElementById('main-save-btn'); if(!e) return null; var r=e.getBoundingClientRect(); return Math.round(r.height);})()")
        };
        const savedTap = await tap('#main-save-btn');
        await new Promise((r) => setTimeout(r, 4000));

        const after = {
            tapped: !!savedTap,
            dialogs: dialogs.slice(),
            saveLabel: await ev("(function(){var e=document.getElementById('main-save-btn'); return e ? e.innerText : null;})()"),
            saveDisabled: await ev("(function(){var e=document.getElementById('main-save-btn'); return e ? !!e.disabled : null;})()"),
            roundReady: await ev("(function(){var e=document.getElementById('round-ready-screen'); return e ? getComputedStyle(e).display : 'absent';})()"),
            roundReadyText: await ev("(function(){var e=document.getElementById('round-ready-screen'); return (e && getComputedStyle(e).display !== 'none') ? e.innerText.split('\\n').slice(0,4).join(' | ') : null;})()"),
            exceptions: consoleErrs.slice(0, 6)
        };
        return { ok: true, arrival, walk, beforeSave, after };
    } finally {
        try { if (ws) ws.close(); } catch (e) { }
        registry.release(tracked);
        try { chrome.kill('SIGTERM'); } catch (e) { }
    }
}

// ---- the run ----------------------------------------------------------------
(async () => {
    const rules = writeRules();
    log('RULES      database.rules.json sha256 ' + rules.sha + ', with ' + rules.edits + ' declared emulator-only edit(s)');
    log('AUTH-BOOT  one line rewritten in flight, so sign-in goes to the auth emulator:');
    log('           ' + AUTH_BOOT_FROM);
    log('        -> ' + AUTH_BOOT_TO.replace(/^try \{ auth = fb\.auth\(\); /, 'try { auth = fb.auth(); ').slice(0, 150) + ' ...');
    log('DATA       databaseURL -> ' + DB_URL + '   (page bytes untouched)');

    // The pre-v203 copies, from HEAD itself rather than the working tree.
    const heads = {};
    ['organizer-gate.js', 'admin.html'].forEach((f) => {
        const p = path.join(TMP, 'head-' + f);
        fs.writeFileSync(p, execFileSync('git', ['show', 'HEAD:' + f], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 }));
        heads['/' + f] = p;
    });

    let emu = null, server = null, failures = 0;
    try {
        const started = await startEmulators();
        emu = started.emu;
        log('EMULATORS  database 127.0.0.1:' + DB_PORT + ' · auth 127.0.0.1:' + AUTH_PORT + ' · project ' + PROJECT + ' (demo- = never production)');

        for (const variant of VARIANTS) {
            log('\n' + '='.repeat(78) + '\nVARIANT: ' + variant.toUpperCase()
                + (variant === 'head' ? '  (organizer-gate.js + admin.html from HEAD - before this wave)' : '  (the working tree - this wave)'));
            log('='.repeat(78));
            await fetch('http://127.0.0.1:' + DB_PORT + '/.json?ns=' + NS, { method: 'DELETE', headers: adminHeaders });
            await seed('global_courses/v203_course', { name: 'Rehearsal Links', data: legacyRound().courseData });
            await seed('events/' + CODE, legacyRound());
            const seeded = await readBack('events/' + CODE + '/ownerUid');
            log('SEEDED     events/' + CODE + '  ownerUid=' + JSON.stringify(seeded) + '  (a LEGACY round), 36 scores posted');

            server = await startServer(variant === 'head' ? heads : {});
            let r;
            try { r = await driveOnce(variant, variant === 'head' ? heads : {}); }
            finally { await new Promise((res) => server.close(res)); server = null; }
            if (!r.ok) { log('HARNESS FAULT: ' + r.reason); process.exitCode = 2; return; }

            log('\nARRIVAL');
            Object.entries(r.arrival).forEach(([k, v]) => log('  ' + k.padEnd(15) + JSON.stringify(v)));
            log('\nWALKING THE WIZARD (taps on its own Next buttons)');
            r.walk.forEach((w) => log('  ' + w));
            log('\nTHE SAVE BUTTON BEFORE THE TAP');
            log('  label ' + JSON.stringify(r.beforeSave.saveLabel) + '  height ' + r.beforeSave.tapTarget + 'px');
            log('\nWHAT THE ORGANIZER SEES AFTER TAPPING SAVE');
            log('  tap landed            ' + r.after.tapped);
            log('  alert(s)              ' + (r.after.dialogs.length ? JSON.stringify(r.after.dialogs) : 'none'));
            log('  save button label     ' + JSON.stringify(r.after.saveLabel) + (r.after.saveDisabled ? ' (disabled)' : ''));
            log('  Round Ready screen    ' + r.after.roundReady + (r.after.roundReadyText ? '  ' + JSON.stringify(r.after.roundReadyText) : ''));
            if (r.after.exceptions.length) log('  page exceptions       ' + JSON.stringify(r.after.exceptions));

            const rec = await readBack('events/' + CODE);
            const landed = {
                ownerUid: rec && rec.ownerUid !== undefined ? rec.ownerUid : null,
                eventName: rec && rec.eventName,
                players: rec && rec.players ? rec.players.length : 0,
                scoresKept: rec && rec.scores ? Object.keys(rec.scores).length : 0,
                organizerToken: !!(rec && rec.organizerToken)
            };
            log('\nTHE RECORD AFTERWARDS (read back from the emulator)');
            Object.entries(landed).forEach(([k, v]) => log('  ' + k.padEnd(15) + JSON.stringify(v)));

            const savedOk = r.after.roundReady !== 'none' && r.after.roundReady !== 'absent' && r.after.dialogs.length === 0;
            const refused = r.after.dialogs.some((d) => /PERMISSION_DENIED|Permission denied|Save error/i.test(d.message));
            const expect = variant === 'head' ? 'refused' : 'saved';
            const got = savedOk ? 'saved' : (refused ? 'refused' : 'neither');
            log('\nVERDICT    expected ' + expect + ', got ' + got);
            if (got !== expect) { failures++; log('           *** NOT AS EXPECTED ***'); }
            if (variant === 'wave' && landed.organizerToken !== true) { failures++; log('           *** the round lost its organizerToken ***'); }
            if (variant === 'wave' && landed.scoresKept !== 36) { failures++; log('           *** the 36 posted scores did not survive the save: ' + landed.scoresKept + ' ***'); }
            if (variant === 'wave' && landed.ownerUid !== null) { failures++; log('           *** the save stamped an ownerUid onto a legacy round ***'); }
        }
    } catch (e) {
        log('HARNESS FAULT: ' + (e && e.message || e));
        process.exitCode = 2;
        return;
    } finally {
        if (server) try { server.close(); } catch (e) { }
        if (emu) try { emu.kill('SIGTERM'); } catch (e) { }
    }
    log('\n' + (failures ? failures + ' variant(s) did not behave as this file says' : 'every variant behaved as this file says'));
    process.exitCode = failures ? 1 : 0;
})();
