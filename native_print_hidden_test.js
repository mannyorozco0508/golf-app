// ============================================================================
// NO DEAD PRINT BUTTON IN THE NATIVE APP
//
// ADDENDUM 2026-09-16: the receipt's rule is LIFTED (see the first test). The
// history below is why it existed; the trip itinerary's rule still stands.
//
// window.print() is not implemented in WKWebView. It does not throw, it does not
// warn - it returns having done nothing. Four TestFlight builds were spent trying
// to route around that with a generated PDF plus the Capacitor Filesystem and
// Share plugins, and the export never worked on a device.
//
// The decision for Consumer 1.0 is to stop offering the control where it cannot
// work. The Receipt is unchanged and still shows every figure on screen; a golfer
// who wants a copy screenshots it. Browser and PWA are untouched and still print.
//
// The export plumbing (native-export.js and its tests) is deliberately LEFT IN
// PLACE but unreachable from the native UI. Removing it would mean touching the
// native project and its plugins, which is the surface that has been unstable;
// hiding a control cannot break a build.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

describe('the native shell is marked from the one detection mechanism', () => {

    test('pwa-boot sets is-native on the document', () => {
        const src = read('pwa-boot.js');
        assert.match(src, /classList\.add\('is-native'\)/,
            'the class the pages style against must be set');
        assert.match(src, /if \(isNativeShell\(\)/,
            'and it must come from isNativeShell(), not a second detection route');
        const boot = src.slice(src.indexOf('function boot()'));
        assert.match(boot, /markNativeShell\(\);/, 'boot must apply it');
    });
});

describe('print controls are hidden natively, kept in the browser', () => {

    // RE-PINNED 2026-09-16 (Send Results, part B). The rule this test was written
    // for - html.is-native [onclick*="printReceipt"] { display: none !important; }
    // - hid the receipt's export control in the Capacitor shell from 98b4fc7
    // (2026-09-04), when window.print() was the only export and it did nothing
    // in WKWebView. Since then native-export.js turns the receipt into a real PDF
    // and opens the iOS share sheet (v151 readable lines, v152 header once, v153
    // the mark), so the App Store app was the one place a golfer could not send
    // a receipt. The rule is LIFTED for the receipt: this test now refuses its
    // return. The trip itinerary keeps its rule (below) - that path still ends in
    // window.print() through a clone and has not been given a native export.
    // Every proof of the native share path is still Chrome with a stand-in; the
    // first real-device run is recorded in HANDOFF when it happens.
    test('RECEIPT_SHOWS_ITS_SEND_BUTTON_NATIVELY: the hide rule is gone and stays gone', () => {
        // CSS comments stripped: the lifted rule is quoted in the comment that
        // replaced it, and a comment hides nothing.
        const src = read('settlement.html').replace(/\/\*[\s\S]*?\*\//g, '');
        assert.ok(!/html\.is-native\s*\[onclick\*="printReceipt"\]/.test(src),
            'the native hide rule for the receipt export is back; it was lifted on 2026-09-16 '
            + 'because the native PDF + share-sheet path exists. Do not restore it without a '
            + 'device-measured reason.');
        // And the rule is not hiding under another selector.
        const nativeRules = (src.match(/html\.is-native[^{]*\{[^}]*\}/g) || []);
        assert.ok(!nativeRules.some(r => /printReceipt|receipt-send|receipt-actions/.test(r)),
            'a native-scoped rule still targets the export control: ' + JSON.stringify(nativeRules));
    });

    test('TRIP_HAS_NO_DEAD_BUTTON', () => {
        assert.match(read('trip.html'),
            /html\.is-native \[onclick\*="printItinerary"\] \{ display: none !important; \}/);
    });

    test('the rule is scoped to native - the browser still prints', () => {
        // settlement.html no longer carries a rule at all (above); trip.html does.
        ['trip.html'].forEach(f => {
            const src = read(f);
            const rule = src.match(/html\.is-native \[onclick\*="print[A-Za-z]+"\] \{[^}]*\}/);
            assert.ok(rule, f + ' must carry the rule');
            assert.match(rule[0], /^html\.is-native /,
                'an unscoped rule would hide the control in Safari too, removing a path that works');
        });
    });

    test('the buttons still exist for the browser', () => {
        // Hidden natively by CSS, not deleted. Removing them would take away a
        // working browser/PWA feature to tidy up a native one.
        // RE-PINNED 2026-09-16 (Send Results): the button is "📤 Send"
        // now, written as a JS escape inside setReceiptAction. Still one control,
        // still onclick="printReceipt()" - and since part B, visible natively too.
        assert.ok(read('settlement.html').includes('\\uD83D\\uDCE4 Send</button>'));
        assert.ok(read('settlement.html').includes('onclick="printReceipt()"'));
        assert.ok(read('trip.html').includes('printItinerary()'));
    });

    test('the export plumbing is left dormant, not ripped out', () => {
        assert.ok(fs.existsSync(path.join(REPO_ROOT, 'native-export.js')),
            'the native export: reachable from the receipt since 2026-09-16, still the trip\'s future attempt');
        ['settlement.html', 'trip.html'].forEach(f => {
            assert.match(read(f), /<script src="pwa-boot\.js"/,
                f + ' still needs the detector - it is what sets is-native');
        });
    });
});
