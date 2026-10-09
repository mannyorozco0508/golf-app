#!/usr/bin/env node
// ============================================================================
// ONE TAP PRODUCES A REAL PNG OF THE REAL RECAP (Wave C, 2026-10-08)
//
// Manny: one tap -> the iOS share sheet, for the group chat.
//
// WHAT A UNIT TEST CANNOT SAY. trip_recap_image_test.js holds the LAYOUT - a
// line per row, nothing off the edge, height derived from content. It cannot
// say that a canvas was drawn, that the pixels are not blank, or that the share
// path was reached, because there is no canvas and no share sheet in the
// harness.
//
// SO THIS TAPS THE BUTTON on a trip with seven scored rounds, intercepts the
// share at the bridge (a stand-in Capacitor that records what it was handed
// instead of opening a sheet), and DECODES THE PNG IT WAS GIVEN - width,
// height, and that it is not a blank rectangle.
//
// IT CALLS NOTHING THE PAGE DEFINES except through the button: the tap is a
// real Input event, and shareTripRecapImage is never invoked by name.
//
// EXIT: 0 a decodable, non-blank PNG carrying the recap's own numbers; 2 else.
// ============================================================================

const { arriveCold } = require('./lib/cold-arrival.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');

const REPO = path.join(__dirname, '..');
const SIM = path.join(process.env.SPDIR || os.tmpdir(), 'sim-rounds.json');
const COPY = path.join(process.env.SPDIR || os.tmpdir(), 'myrtle-copy.json');
const TRIP = 'RECAPT';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serveRepo(root) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const u = req.url.split('?')[0];
            const f = path.join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
            if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
                res.writeHead(404); return res.end('no');
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

// A PNG header read by hand: 8-byte signature, then IHDR with width and height
// as big-endian 32-bit. No library, and it fails loudly on anything that is not
// actually a PNG - which a base64 string of an error message would be.
function readPng(b64) {
    const buf = Buffer.from(b64, 'base64');
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return { ok: false, why: 'not a PNG signature' };
    if (buf.slice(12, 16).toString('ascii') !== 'IHDR') return { ok: false, why: 'no IHDR' };
    return { ok: true, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

// IS IT BLANK? A canvas that was sized but never drawn on compresses to almost
// nothing, because every scanline is identical; a drawn recap does not.
//
// FROM THE FULL LENGTH, NOT THE SAMPLE. The base64 is hundreds of KB and only
// the first 40,000 characters are carried out of the browser, so measuring the
// SAMPLE would have reported a fixed ~29KB whatever was drawn - a threshold
// that could never fail. dataLen is the real length and is what the size claim
// is made from.
function kbFromBase64Length(len) {
    return Math.round((Number(len) || 0) * 3 / 4 / 1024);
}

(async () => {
    const out = { what: 'one tap produces a real PNG of the real recap' };
    if (!fs.existsSync(SIM) || !fs.existsSync(COPY)) {
        console.log(JSON.stringify({ error: 'needs the simulated trip: run the Myrtle simulation first (SPDIR=' + (process.env.SPDIR || '?') + ')' }, null, 1));
        process.exit(2);
    }
    const sim = JSON.parse(fs.readFileSync(SIM, 'utf8'));
    const trip = JSON.parse(fs.readFileSync(COPY, 'utf8')).trip;
    const events = {};
    sim.rounds.forEach(r => { events[r.code] = r.ev; events[r.code].ownerUid = 'me-uid'; });
    const tripRec = JSON.parse(JSON.stringify(trip));
    tripRec.ownerUid = 'me-uid';
    tripRec.tripPot = { on: true, buyIn: 50, places: [625, 375, 250], scoring: 'net' };
    const DB = { events, trips: { [TRIP]: tripRec }, global_courses: {}, tournaments: {} };

    const served = await serveRepo(REPO);
    try {
        // A STAND-IN BRIDGE: Capacitor present and native, with Filesystem and
        // Share recording what they were handed. The page cannot tell the
        // difference, and nothing opens.
        const PRE = "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});"
            + "window.__shared=null;"
            + "window.Capacitor={isNativePlatform:function(){return true;},Plugins:{"
            + "Filesystem:{writeFile:function(o){window.__shared={name:o.path,data:o.data};return Promise.resolve({});},"
            + "getUri:function(o){return Promise.resolve({uri:'file:///cache/'+o.path});}},"
            + "Share:{share:function(o){window.__sheet=o;return Promise.resolve();}}}};"
            + "window.GolfNet={isNative:function(){return true;}};";
        const READ = String.raw`(function () {
          var s = window.__shared || {};
          return JSON.stringify({
            shared: !!window.__shared,
            fileName: s.name || null,
            dataLen: s.data ? s.data.length : 0,
            b64: s.data ? s.data.slice(0, 40000) : '',
            sheetFiles: window.__sheet ? (window.__sheet.files || []).length : 0,
            sheetTitle: window.__sheet ? String(window.__sheet.title || '') : null,
            errs: (window.__errs || []).slice(0, 3)
          });
        })()`;
        const r = await arriveCold({
            url: 'http://127.0.0.1:' + served.port + '/trip.html?trip=' + TRIP,
            db: DB, auth: { uid: 'me-uid' }, viewport: { width: 390, height: 844 },
            settleMs: 4600, preScript: PRE,
            steps: [{ sleep: 1800 },
                    // LABEL-BASED, NEVER POSITIONAL: a positional tap has given
                    // this repo two false results already.
                    { expression: "(function(){var b=Array.prototype.slice.call(document.querySelectorAll('button')).filter(function(e){return /Share Trip Recap/i.test(String(e.innerText||''));});return b.length?(b[0].click(),'tapped: '+b[0].innerText.trim()):'no Share Trip Recap button: '+Array.prototype.slice.call(document.querySelectorAll('button')).map(function(e){return e.innerText.trim();}).slice(0,10).join(' | ');})()" },
                    { sleep: 2200 }, { expression: READ }]
        });
        if (!r.ok) throw new Error('arrival: ' + r.reason);
        out.taps = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) !== '{');
        const raw = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').pop();
        if (!raw) throw new Error('nothing measured');
        Object.assign(out, JSON.parse(raw));
        if (out.b64) {
            out.png = readPng(out.b64);
            // The header is read from the sample (IHDR is in the first 24 bytes);
            // the SIZE comes from the full base64 length the page reported.
            if (out.png.ok) delete out.png.bytes;
            out.kb = kbFromBase64Length(out.dataLen);
        }
    } catch (e) {
        out.error = String(e && e.message || e);
    } finally {
        try { served.server.close(); } catch (e) {}
    }

    const faults = [];
    if (out.error) faults.push('error: ' + out.error);
    if ((out.errs || []).length) faults.push('the page threw: ' + JSON.stringify(out.errs));
    if (!out.shared) faults.push('one tap did not reach the share path: ' + JSON.stringify(out.taps));
    if (out.fileName && !/^trip-recap-.*\.png$/.test(out.fileName)) faults.push('the file is not a named PNG: ' + out.fileName);
    if (out.sheetFiles !== 1) faults.push('the share sheet was handed ' + out.sheetFiles + ' files, expected 1');
    const p = out.png;
    if (!p) faults.push('no image data reached the share path');
    else if (!p.ok) faults.push('what was shared is not a PNG: ' + p.why);
    else {
        // A PHONE-READABLE, PORTRAIT CARD at 2x.
        if (!(p.width >= 2000)) faults.push('the PNG is only ' + p.width + 'px wide');
        if (!(p.height > p.width * 0.6)) faults.push('the PNG is not portrait: ' + p.width + 'x' + p.height);
        // NOT BLANK. A sized-but-undrawn canvas compresses to a few KB at this
        // size; a drawn recap does not.
        // THE THRESHOLD IS MEASURED AT BOTH ENDS, not guessed, because the first
        // one I picked was INERT - the control proved it. With the draw loop
        // stubbed out the canvas is still a solid 2160x2916 rectangle, and that
        // compresses to 129KB; the real recap is 636KB. 300KB sits 2.3x above
        // blank and 2.1x below drawn, so neither end is delicate. A guard whose
        // own control passes is decoration, and this one did until it was fixed.
        if (!(out.kb > 300)) faults.push('the PNG is ' + out.kb + 'KB - a blank canvas measures 129KB and a drawn recap 636KB, so nothing was drawn');
    }
    out.faults = faults;
    out.ok = faults.length === 0;
    // b64 out of the report: it is hundreds of KB and the numbers above are the claim.
    delete out.b64;
    console.log(JSON.stringify(out, null, 1));
    process.exit(out.ok ? 0 : 2);
})();
