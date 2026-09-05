// ============================================================================
// NO DEAD PRINT BUTTON IN THE NATIVE APP
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

    test('RECEIPT_HAS_NO_DEAD_BUTTON: the rule targets every injected copy', () => {
        const src = read('settlement.html');
        assert.match(src, /html\.is-native \[onclick\*="printReceipt"\] \{ display: none !important; \}/,
            'Matching the handler covers all eleven injected copies of the button; '
            + 'a class would have to be added to each one and could be missed.');
    });

    test('TRIP_HAS_NO_DEAD_BUTTON', () => {
        assert.match(read('trip.html'),
            /html\.is-native \[onclick\*="printItinerary"\] \{ display: none !important; \}/);
    });

    test('the rule is scoped to native - the browser still prints', () => {
        ['settlement.html', 'trip.html'].forEach(f => {
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
        assert.ok(read('settlement.html').includes('Print / Save PDF'));
        assert.ok(read('settlement.html').includes('Print / Save Receipt'));
        assert.ok(read('trip.html').includes('printItinerary()'));
    });

    test('the export plumbing is left dormant, not ripped out', () => {
        assert.ok(fs.existsSync(path.join(REPO_ROOT, 'native-export.js')),
            'kept for a future attempt; unreachable from the native UI is enough for 1.0');
        ['settlement.html', 'trip.html'].forEach(f => {
            assert.match(read(f), /<script src="pwa-boot\.js"/,
                f + ' still needs the detector - it is what sets is-native');
        });
    });
});
