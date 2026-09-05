// ============================================================================
// NATIVE EXPORT — Print / Save must work on a phone
//
// Every "Print / Save PDF" and "Print / Save Receipt" control called
// window.print(). Mobile Safari implements it; an embedded WKWebView does not
// wire up a print controller, so the call returned silently - no dialog, no
// error, no exception. On TestFlight Build 3 the Receipt rendered perfectly and
// the button did nothing whatsoever.
//
// WHAT IS BEING PROTECTED HERE:
//
//   1. The browser keeps window.print(). It works, it has print CSS behind it,
//      and nothing about the PWA path should move.
//   2. Native must NOT reach window.print(), because that is the bug.
//   3. The PDF must be a real PDF - a structurally valid file, not HTML wearing
//      a .pdf extension.
//   4. The export reads the ALREADY-RENDERED DOM. It must never grow its own
//      settlement or scoring maths; if the Receipt is wrong the PDF must be
//      wrong identically.
//   5. Native failure must be visible. A dead button that reports nothing is
//      precisely what is being fixed, so silently falling back to window.print()
//      on iOS would recreate the bug while looking like a safety net.
//
// NEGATIVE CONTROLS live at the bottom: they are the ones that fail if somebody
// later reverts a button to a browser-only implementation.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
// Values built inside the sandbox carry its prototypes, which strict deepEqual
// treats as a difference. Normalise before comparing shapes.
const plain = (v) => JSON.parse(JSON.stringify(v));
// Only executable lines count: this file's own explanations mention window.print().
const codeOnly = (src) => src
    .replace(/<!--[\s\S]*?-->/g, '')          // whole HTML comment blocks
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

// A minimal realm: no Capacitor, no GolfNet unless a test installs them.
function realm(opts) {
    const o = opts || {};
    const printed = [];
    const alerts = [];
    const listeners = {};
    const sandbox = {
        console,
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        setTimeout: (fn) => { if (o.runTimers) fn(); return 0; },
        document: {
            title: 'Rattle Golf',
            getElementById: () => null
        }
    };
    sandbox.window = sandbox;
    sandbox.window.print = () => printed.push(true);
    sandbox.window.alert = (m) => alerts.push(String(m));
    sandbox.window.addEventListener = (ev, fn) => { listeners[ev] = fn; };
    if (o.native) sandbox.window.GolfNet = { isNative: () => true };
    // TWO RUNTIMES, AND THE DEVICE ONLY EVER SEES ONE.
    //
    //   'native'  what iOS actually injects: JSExport.swift writes a WKUserScript
    //             building Capacitor.Plugins['Filesystem'] at documentStart, and
    //             registerPlugin DOES NOT EXIST. Build 5 refused to export on this
    //             exact shape, so it is the harness default.
    //   'bundler' the npm/@capacitor/core runtime: registerPlugin exists, the
    //             Plugins bag starts empty. Supported for future compatibility.
    if (o.bridge) {
        const shape = o.bridge === true ? 'native' : o.bridge;
        const cap = { isNativePlatform: () => true };
        if (shape === 'native') {
            cap.Plugins = Object.assign({}, o.plugins || {});
            // deliberately NO registerPlugin - the injected bridge has none
        } else {
            cap.Plugins = {};
            cap.registerPlugin = (name) => {
                if (o.registerThrows) throw new Error('no such plugin ' + name);
                return (o.plugins || {})[name];
            };
        }
        sandbox.window.Capacitor = cap;
    }
    vm.createContext(sandbox);
    vm.runInContext(read('native-export.js'), sandbox);
    return { sandbox, printed, alerts, listeners, api: sandbox.window.RattleExport };
}

// A stand-in for a rendered receipt node.
function node(text) {
    const el = {
        innerText: text,
        cloneNode: () => el,
        querySelectorAll: () => []
    };
    return el;
}

describe('the PDF is a real PDF', () => {

    const { api } = realm({});

    test('it has the structure a reader requires', () => {
        const pdf = api._buildPdf('Chambers-Bay-Receipt', ['Chris -> Zach $20', 'MATCH NET (Zach) +$20']);
        assert.ok(pdf.startsWith('%PDF-'), 'must begin with the PDF header');
        assert.ok(pdf.trimEnd().endsWith('%%EOF'), 'must end with %%EOF');
        assert.match(pdf, /\nxref\n/, 'must carry a cross-reference table');
        assert.match(pdf, /trailer/, 'must carry a trailer');
        assert.match(pdf, /\/Type \/Catalog/);
        assert.match(pdf, /startxref\n\d+/, 'startxref must point somewhere');
    });

    test('PDF string delimiters in real course names cannot corrupt the file', () => {
        // "Thistle (Cameron / MacKay)" is a real mapped course. An unescaped
        // bracket ends the PDF string early and the file stops being readable.
        const pdf = api._buildPdf('Thistle', ['Thistle (Cameron / MacKay) \\ back']);
        assert.match(pdf, /\\\(Cameron/, 'open bracket must be escaped');
        assert.match(pdf, /MacKay\\\)/, 'close bracket must be escaped');
        assert.match(pdf, /\\\\ back/, 'backslash must be escaped');
    });

    test('characters Helvetica cannot encode are removed, not written blind', () => {
        // Emoji are all over this UI. WinAnsi cannot express them, and writing
        // them raw produces a file some readers reject outright.
        const clean = api._pdfSafe('Zach \u{1F3CC} +$20 \u2192 Chris \u00B7 \u2713');
        assert.ok(!/[^\x20-\x7E\xA0-\xFF]/.test(clean), 'nothing outside Latin-1 may survive');
        assert.match(clean, /->/, 'an arrow should degrade to something readable');
    });

    test('a long round pages rather than running off the sheet', () => {
        const many = [];
        for (let i = 1; i <= 200; i++) many.push('Hole ' + i + ' detail line');
        const pdf = api._buildPdf('Long', many);
        const pages = (pdf.match(/\/Type \/Page[^s]/g) || []).length;
        assert.ok(pages > 1, 'a 200-line receipt must produce more than one page');
        assert.match(pdf, new RegExp('/Count ' + pages));
    });
});

describe('the browser path is untouched', () => {

    test('BROWSER_STILL_PRINTS: no Capacitor means window.print()', () => {
        const r = realm({});
        r.api.exportOrPrint({ title: 'Round', roots: [node('x')] });
        assert.equal(r.printed.length, 1, 'the browser must still call window.print()');
    });

    test('the document title is set for the filename, then restored', () => {
        const r = realm({});
        r.sandbox.window.onafterprint = null; // property present = browser supports the event
        r.api.exportOrPrint({ title: 'Chambers Bay Receipt', roots: [node('x')] });
        assert.equal(r.sandbox.document.title, 'Chambers-Bay-Receipt',
            'the title is what the browser uses as the default filename');
        r.listeners['afterprint'] && r.listeners['afterprint']();
        assert.equal(r.sandbox.document.title, 'Rattle Golf', 'and it must be put back');
    });

    test('afterprint drives the restore where the browser supports it', () => {
        // Trip Mode keeps a print-only class on <body> and needs it to survive
        // until the dialog closes; a timer would strip it mid-preview.
        const r = realm({});
        let after = 0;
        r.sandbox.window.onafterprint = null; // presence of the property = supported
        r.api.exportOrPrint({ title: 'T', roots: [node('x')], onAfter: () => { after++; } });
        assert.equal(after, 0, 'must not fire before the print dialog closes');
        r.listeners['afterprint']();
        assert.equal(after, 1);
    });
});

describe('the native path does not touch window.print()', () => {

    function nativeRealm(behaviour) {
        const calls = { write: [], uri: 0, share: [] };
        const b = behaviour || {};
        const plugins = {
            Filesystem: {
                writeFile: (a) => { calls.write.push(a); return b.writeFails ? Promise.reject(new Error('disk')) : Promise.resolve({}); },
                getUri: () => { calls.uri++; return Promise.resolve({ uri: 'file:///cache/x.pdf' }); }
            },
            Share: {
                share: (a) => { calls.share.push(a); return b.shareFails ? Promise.reject(new Error(b.shareError || 'nope')) : Promise.resolve(); }
            }
        };
        const r = realm({ native: true, bridge: true, plugins: b.noPlugins ? {} : plugins });
        return { r, calls };
    }

    test('NATIVE_NEVER_PRINTS: window.print() is not called on iOS', async () => {
        const { r } = nativeRealm();
        await r.api.exportOrPrint({ title: 'Round', roots: [node('Chris -> Zach $20')] });
        assert.equal(r.printed.length, 0,
            'window.print() is a silent no-op in WKWebView - reaching it is the bug.');
    });

    test('it writes to CACHE, which needs no Info.plist usage description', async () => {
        const { r, calls } = nativeRealm();
        await r.api.exportOrPrint({ title: 'Chambers Bay', roots: [node('x')] });
        assert.equal(calls.write.length, 1);
        assert.equal(calls.write[0].directory, 'CACHE',
            'Documents-with-file-sharing would require a plist entry; CACHE does not.');
        assert.match(calls.write[0].path, /\.pdf$/);
        assert.ok(calls.write[0].data.length > 0, 'base64 payload must be written');
    });

    test('the written bytes decode back to a valid PDF', async () => {
        const { r, calls } = nativeRealm();
        await r.api.exportOrPrint({ title: 'R', roots: [node('MATCH NET (Zach) +$20')] });
        const decoded = Buffer.from(calls.write[0].data, 'base64').toString('binary');
        assert.ok(decoded.startsWith('%PDF-'));
        assert.ok(decoded.includes('MATCH NET'), 'the rendered line must reach the file');
    });

    test('the file URI is what gets shared', async () => {
        const { r, calls } = nativeRealm();
        await r.api.exportOrPrint({ title: 'R', roots: [node('x')] });
        assert.equal(calls.uri, 1, 'must resolve the native URI rather than guess a path');
        assert.deepEqual(plain(calls.share[0].files), ['file:///cache/x.pdf']);
    });
});

describe('native failure is visible, never silent', () => {

    test('a missing plugin tells the golfer instead of doing nothing', async () => {
        const r = realm({ native: true, bridge: true, plugins: {} });
        const out = await r.api.exportOrPrint({ title: 'R', roots: [node('x')] });
        assert.equal(out.path, 'native-unavailable');
        assert.equal(r.alerts.length, 1, 'a dead button that says nothing is the original bug');
        assert.equal(r.printed.length, 0);
    });

    test('a write failure is reported', async () => {
        const plugins = {
            Filesystem: { writeFile: () => Promise.reject(new Error('disk full')), getUri: () => Promise.resolve({}) },
            Share: { share: () => Promise.resolve() }
        };
        const r = realm({ native: true, bridge: true, plugins });
        const out = await r.api.exportOrPrint({ title: 'R', roots: [node('x')] });
        assert.equal(out.path, 'native-failed');
        assert.equal(r.alerts.length, 1);
    });

    test('CANCEL_IS_NOT_AN_ERROR: dismissing the share sheet raises no alarm', async () => {
        const plugins = {
            Filesystem: { writeFile: () => Promise.resolve({}), getUri: () => Promise.resolve({ uri: 'file:///x.pdf' }) },
            Share: { share: () => Promise.reject(new Error('Share canceled')) }
        };
        const r = realm({ native: true, bridge: true, plugins });
        const out = await r.api.exportOrPrint({ title: 'R', roots: [node('x')] });
        assert.equal(out.path, 'native-cancelled');
        assert.equal(r.alerts.length, 0, 'tapping Cancel is a choice, not a failure');
    });
});

describe('native detection uses the one existing mechanism', () => {

    test('it defers to GolfNet.isNative rather than re-deriving it', () => {
        assert.match(read('native-export.js'), /window\.GolfNet\.isNative\(\)/,
            'pwa-boot.js already owns this decision; a second copy is a second way to be wrong.');
        const r = realm({});
        assert.equal(r.api.isNative(), false, 'no GolfNet means browser');
        const n = realm({ native: true });
        assert.equal(n.api.isNative(), true);
    });
});

describe('the export reads the screen; it does not recompute money', () => {

    test('no settlement or scoring engine is reachable from the exporter', () => {
        const src = read('native-export.js');
        [
            'settlement-engine', 'money-engine', 'pool-engine', 'action-model',
            'payouts', 'handicap', 'computeSettlement', 'allocateWholeDollars'
        ].forEach(name => {
            assert.ok(!src.includes(name),
                `native-export.js references ${name}. The PDF must be read from the rendered `
                + 'DOM, never calculated a second time.');
        });
    });

    test('both pages hand it rendered nodes, not round data', () => {
        const s = read('settlement.html');
        assert.match(s, /document\.getElementById\('settle-content'\)/);
        assert.match(s, /document\.getElementById\('receipt-scorecard'\)/);
        assert.match(s, /window\.RattleExport\.exportOrPrint\(/);
        const t = read('trip.html');
        assert.match(t, /trip-itinerary-print-view/);
        assert.match(t, /window\.RattleExport\.exportOrPrint\(/);
    });

    test('hidden content and buttons stay out of the export', () => {
        const r = realm({});
        const el = {
            innerText: 'Receipt line',
            cloneNode: () => el,
            querySelectorAll: () => [] // the real DOM strips buttons; innerText hides display:none
        };
        const lines = r.api._linesFrom([el]);
        assert.deepEqual(plain(lines), ['Receipt line']);
        assert.match(read('native-export.js'), /querySelectorAll\('button, \.nav-link/,
            'the print button must not appear inside the PDF');
    });
});

// ===========================================================================
// THE TWO BUILD 4 DEFECTS. Both shipped green; neither was covered.
// ===========================================================================
describe('Build 4 defect 1 — the page must supply native detection', () => {

    // native-export.js asks GolfNet.isNative(). settlement.html and trip.html did
    // not load pwa-boot.js, so GolfNet was undefined, the exporter concluded
    // "browser" and called window.print() - a silent no-op in WKWebView. Nothing
    // happened, and nothing could report it.
    //
    // The old tests injected GolfNet into the sandbox, so they proved the helper
    // behaves given a detector and never that the PAGES provide one. This is the
    // integration test that was missing.
    test('PAGES_SUPPLY_DETECTION: every page loading the exporter also loads pwa-boot.js', () => {
        const pages = fs.readdirSync(REPO_ROOT).filter(f => f.endsWith('.html'));
        const offenders = [];
        pages.forEach(f => {
            const src = read(f);
            if (!/<script src="native-export\.js"><\/script>/.test(src)) return;
            if (!/<script src="pwa-boot\.js"/.test(src)) offenders.push(f);
        });
        assert.deepEqual(offenders, [],
            'These pages call the exporter but never load pwa-boot.js, which owns '
            + 'GolfNet.isNative(). Without it the exporter silently takes the browser '
            + 'path and window.print() does nothing on iOS: ' + offenders.join(', '));
    });

    test('pwa-boot.js loads BEFORE native-export.js on both pages', () => {
        ['settlement.html', 'trip.html'].forEach(f => {
            const src = read(f);
            const boot = src.indexOf('src="pwa-boot.js"');
            const exp = src.indexOf('src="native-export.js"');
            assert.ok(boot > -1 && exp > -1, f + ' must load both');
            assert.ok(boot < exp, f + ': the detector must be declared before the exporter');
        });
    });
});

describe('Build 5 defect — the injected bridge is the production path', () => {

    const nativePlugins = () => ({
        Filesystem: { writeFile: () => Promise.resolve({}), getUri: () => Promise.resolve({ uri: 'file:///cache/x.pdf' }) },
        Share: { share: () => Promise.resolve() }
    });

    // THE REGRESSION THIS FILE EXISTS FOR.
    //
    // Build 5 hit "Saving is unavailable in this build" on a device where both
    // plugins were correctly registered by Swift and sitting on Capacitor.Plugins,
    // because the code demanded registerPlugin - which native-bridge.js never
    // defines. This is that exact runtime shape.
    test('INJECTED_BRIDGE_IS_NOT_UNAVAILABLE: Plugins populated, no registerPlugin', async () => {
        const r = realm({ native: true, bridge: 'native', plugins: nativePlugins() });
        assert.equal(typeof r.sandbox.window.Capacitor.registerPlugin, 'undefined',
            'the harness must reproduce the device: no registerPlugin');
        const out = await r.api.exportOrPrint({ title: 'R', roots: [node('Chris -> Zach $20')] });
        assert.equal(out.path, 'native-shared',
            'This shape MUST reach the share sheet. Anything else is Build 5 again.');
        assert.deepEqual(plain(r.alerts), [], 'and must not tell the golfer saving is unavailable');
        assert.equal(r.printed.length, 0);
    });

    test('it resolves through Capacitor.Plugins, not registerPlugin', () => {
        const r = realm({ native: true, bridge: 'native', plugins: nativePlugins() });
        return r.api.exportOrPrint({ title: 'R', roots: [node('x')] }).then(() => {
            assert.equal(r.api._plugins().via, 'Plugins');
        });
    });

    test('the bundler runtime still works, as a fallback', async () => {
        const r = realm({ native: true, bridge: 'bundler', plugins: nativePlugins() });
        assert.equal(typeof r.sandbox.window.Capacitor.registerPlugin, 'function');
        const out = await r.api.exportOrPrint({ title: 'R', roots: [node('x')] });
        assert.equal(out.path, 'native-shared');
        assert.equal(r.api._plugins().via, 'registerPlugin');
    });

    test('nothing in the exporter REQUIRES registerPlugin', () => {
        const src = codeOnly(read('native-export.js'));
        // Every use must be guarded/optional. A bare demand for it is the bug.
        assert.ok(!/if \(!cap \|\| typeof cap\.registerPlugin !== 'function'\)/.test(src),
            'Refusing to proceed without registerPlugin is exactly what Build 5 did.');
        assert.match(src, /cap\.Plugins/, 'the injected bridge must be consulted');
    });

    test('the plugins are resolved once, not on every tap', () => {
        let reads = 0;
        const r = realm({ native: true, bridge: 'native', plugins: nativePlugins() });
        const real = r.sandbox.window.Capacitor.Plugins;
        Object.defineProperty(r.sandbox.window.Capacitor, 'Plugins', { get() { reads++; return real; } });
        return r.api.exportOrPrint({ title: 'A', roots: [node('x')] })
            .then(() => r.api.exportOrPrint({ title: 'B', roots: [node('x')] }))
            .then(() => assert.equal(reads, 1, 'resolved once and memoised'));
    });

    test('a bridge with neither route reports it visibly', async () => {
        const r = realm({ native: true, bridge: 'native', plugins: {} });
        const out = await r.api.exportOrPrint({ title: 'R', roots: [node('x')] });
        assert.equal(out.path, 'native-unavailable');
        assert.equal(r.alerts.length, 1);
        assert.equal(r.printed.length, 0);
    });
});

describe('a native build never falls through to window.print()', () => {

    // State C: the bridge is there but detection says browser. That is precisely
    // Build 4. Printing would be a silent no-op that looks like a dead button, so
    // the exporter must refuse and say something.
    test('BRIDGE_WITHOUT_DETECTION_DOES_NOT_PRINT', async () => {
        const r = realm({ bridge: true, plugins: {} });   // no GolfNet at all
        const out = await r.api.exportOrPrint({ title: 'R', roots: [node('x')] });
        assert.equal(out.path, 'native-detection-inconsistent');
        assert.equal(r.printed.length, 0,
            'window.print() does nothing in WKWebView; reaching it recreates Build 4.');
        assert.equal(r.alerts.length, 1, 'and the golfer must be told');
    });

    test('a real browser - no bridge at all - still prints', () => {
        const r = realm({});
        r.api.exportOrPrint({ title: 'R', roots: [node('x')] });
        assert.equal(r.printed.length, 1);
        assert.equal(r.alerts.length, 0, 'the web path must stay silent and normal');
    });
});

describe('native-export.js is shipped in the mobile shell', () => {

    test('it is listed for the native bundle and precached', () => {
        assert.match(read('sync-mobile-web.js'), /'native-export\.js'/);
        assert.match(read('sw.js'), /'\.\/native-export\.js'/);
    });

    test('so is the detector it depends on', () => {
        assert.match(read('sync-mobile-web.js'), /'pwa-boot\.js'/);
        assert.match(read('sw.js'), /'\.\/pwa-boot\.js'/);
    });
});

// ---------------------------------------------------------------------------
// NEGATIVE CONTROLS. These are the tests that fail if a future change quietly
// puts a browser-only print back on the native path.
// ---------------------------------------------------------------------------
describe('regression guards against reverting to browser-only print', () => {

    test('NO_RAW_PRINT_ON_THE_RECEIPT_BUTTON', () => {
        const s = read('settlement.html');
        const at = s.indexOf('function printReceipt()');
        assert.notEqual(at, -1, 'printReceipt must still exist');
        const body = codeOnly(s.slice(at, s.indexOf('\n    }', at)));
        assert.ok(!/window\.print\(\)/.test(body),
            'printReceipt must go through RattleExport, which decides browser vs native. '
            + 'Calling window.print() here directly restores the dead iOS button.');
    });

    test('NO_RAW_PRINT_ON_THE_TRIP_BUTTON', () => {
        const t = read('trip.html');
        const at = t.indexOf('function printItinerary()');
        assert.notEqual(at, -1);
        const body = codeOnly(t.slice(at, t.indexOf('\n    }', at)));
        assert.ok(!/window\.print\(\)/.test(body),
            'printItinerary has the same native failure and the same fix.');
    });

    test('the exporter is the only place window.print() is reached', () => {
        // Tournament is deliberately excluded: it is gated out of the native
        // Consumer build, so its print path cannot be hit on a phone.
        ['settlement.html', 'trip.html'].forEach(f => {
            const src = codeOnly(read(f));
            assert.ok(!/window\.print\(\)/.test(src),
                `${f} still calls window.print() somewhere. Route it through RattleExport.`);
        });
        assert.match(read('native-export.js'), /window\.print\(\);/,
            'the browser path inside the exporter is where it belongs');
    });

    test('the helper is shipped and cached, or the button dies offline', () => {
        assert.match(read('sync-mobile-web.js'), /'native-export\.js'/,
            'must be in the native bundle');
        assert.match(read('sw.js'), /'\.\/native-export\.js'/,
            'must be precached, or a cached shell restores the dead button');
        ['settlement.html', 'trip.html'].forEach(f => {
            assert.match(read(f), /<script src="native-export\.js"><\/script>/,
                `${f} must load the helper`);
        });
    });

    test('the two official plugins are declared', () => {
        const pkg = JSON.parse(read('package.json'));
        assert.ok(pkg.dependencies['@capacitor/share'], '@capacitor/share is required for the share sheet');
        assert.ok(pkg.dependencies['@capacitor/filesystem'], '@capacitor/filesystem writes the PDF');
    });
});
