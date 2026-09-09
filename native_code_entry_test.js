// ============================================================================
// TYPING A CODE INSIDE THE APP MUST NOT THROW THE GOLFER INTO SAFARI.
//
// admin.html:3188, openRoundByCode(), the handler on the Open button:
//
//     let dest = playerPageUrl('index.html') + '?game=' + code;
//     window.location.href = dest;
//
// playerPageUrl() is shareBaseUrl() + page. shareBaseUrl() exists for LINKS THAT
// LEAVE THE DEVICE - the QR, the group scorekeeper links, the invite text - and its
// rule is deliberate:
//
//     http/https origin -> this page's own origin, so a preview deploy hands out
//                          links to itself rather than to production
//     anything else     -> the canonical origin, because capacitor:// and file://
//                          are not addresses another phone can reach
//
// Inside the iOS wrapper the page is served from capacitor://localhost, so
// shareBaseUrl() correctly returns https://golf-app-5a5.pages.dev/. Correct for a
// link you SEND. Wrong for a link you NAVIGATE TO - and openRoundByCode navigates
// to it.
//
// WHAT THE WRAPPER THEN DOES, from Capacitor's own source rather than from memory,
// node_modules/@capacitor/ios/.../WebViewDelegationHandler.swift:102-121:
//
//     if let host = navURL.host, bridge.config.shouldAllowNavigation(to: host) { ... }
//     let isApplicationNavigation = navURL.absoluteString.starts(with: serverURL)
//                                || navURL.absoluteString.starts(with: localURL)
//     if !isApplicationNavigation, toplevelNavigation {
//         UIApplication.shared.open(navURL, options: [:], completionHandler: nil)
//         decisionHandler(.cancel)
//     }
//
// capacitor.config declares no server block and no allowNavigation, so the allowlist
// is empty and pages.dev is not the app's own origin. The navigation is cancelled
// and handed to the system browser. Observed on an iPad Pro 13-inch simulator: the
// app opened a new Safari tab and the status bar read "< Rattle Golf".
//
// WHY THIS FILE EXISTS SEPARATELY FROM share_url_test.js. That file already drives
// shareBaseUrl under capacitor:// and asserts it returns the canonical origin - and
// that is RIGHT, because it tests the SHARE builder. Nothing tested it as a
// NAVIGATION TARGET. This file is that missing half, and it must never be "fixed"
// by weakening the share behaviour: both assertions are kept side by side below so
// a change that satisfies one by breaking the other goes red immediately.
//
// THIS IS THE PRIMARY PATH FOR THREE GOLFERS IN EVERY FOURSOME. The organizer sets
// the round up; everybody else types the code or pastes the link.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

// The wrapper's real origin. Capacitor serves the bundle from here on iOS; there is
// no http(s) anywhere in the app's own address.
const APP_ORIGIN = 'capacitor://localhost';
const APP_HREF = APP_ORIGIN + '/admin.html';
const WEB_HREF = 'https://golf-app-5a5.pages.dev/admin.html';

// The lobby, at whichever origin the caller names. `href` is the thing under test:
// where openRoundByCode() actually sends the golfer.
//
// SETTING location.href ALONE IS NOT ENOUGH, and getting that wrong cost me a false
// failure that looked exactly like an app defect. The sandbox's location is a stub:
// assigning .href leaves .origin undefined and .pathname at its default '/index.html'.
// shareBaseUrl() reads origin FIRST and pathname SECOND, so a subdirectory fixture
// that only set href had its directory read from the stale default and came back
// stripped - the app was right and the fixture was wrong. Every field the function
// actually reads is set here, the same way share_url_test.js does it.
function lobbyAt(href) {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
    const isWeb = /^https?:/i.test(href);
    const u = isWeb ? new URL(href) : null;
    const loc = {
        href: href,
        // capacitor://localhost IS the origin the wrapper reports. It is not http(s),
        // which is the whole point - shareBaseUrl's rule turns on exactly that.
        origin: isWeb ? u.origin : APP_ORIGIN,
        pathname: isWeb ? u.pathname : '/admin.html',
    };
    vm.runInContext("alert = function (m) { window.__said = m; };"
        + ' location = ' + JSON.stringify(loc) + '; window.location = location;', sb);
    return {
        sb,
        type: v => vm.runInContext(
            `document.getElementById('join-code-input').value = ${JSON.stringify(v)};`, sb),
        go: () => vm.runInContext('openRoundByCode();', sb),
        // RESOLVED, THE WAY A BROWSER RESOLVES IT.
        //
        // window.location.href = 'index.html?game=X' does not leave the golfer on a
        // relative string - the browser resolves it against the page's own URL and
        // navigates to the absolute result. The vm's location is a stub and does no
        // such thing, so asserting on the raw assigned value would test the stub.
        //
        // This models the browser: whatever openRoundByCode assigns is resolved
        // against the origin the page was served from, and the assertions are about
        // WHERE THE GOLFER LANDS. An absolute destination resolves to itself, so this
        // changes nothing about what the current code produces - it is still the
        // off-origin https URL, and the app assertions still fail on it.
        href: () => {
            const raw = String(vm.runInContext('location.href', sb));
            try { return new URL(raw, href).href; }
            catch (e) { return raw; }
        },
        said: () => vm.runInContext('window.__said || null', sb),
    };
}

// A destination that leaves the app. Anything that is not the app's own origin gets
// cancelled and opened in Safari, so this is the exact predicate the wrapper applies.
const leavesTheApp = dest => /^https?:\/\//i.test(String(dest));

describe('INSIDE THE APP, OPENING A CODE STAYS INSIDE THE APP', () => {

    test('the fixture really is at the wrapper origin', () => {
        // POSITIVE FIRST. Every assertion below is about what happens AT
        // capacitor://localhost. If the fixture silently sat on https - which is
        // exactly how this defect went unnoticed - they would all pass while
        // testing nothing.
        const l = lobbyAt(APP_HREF);
        assert.equal(l.href(), APP_HREF,
            'the sandbox did not take the capacitor:// origin, so nothing below is '
            + 'testing the wrapper');
        assert.ok(!/^https?:/i.test(l.href()));
    });

    test('a typed code does not leave capacitor://localhost', () => {
        const l = lobbyAt(APP_HREF);
        l.type('AB12CD'); l.go();
        assert.ok(!leavesTheApp(l.href()),
            '\nTyping a code inside the app navigates OFF the app origin:\n'
            + '    ' + l.href() + '\n'
            + '  Capacitor cancels that and hands it to Safari, so the golfer is\n'
            + '  ejected from the app on the commonest way into a round.');
    });

    test('and it still reaches the scorecard with the code intact', () => {
        // The fix must not be "go nowhere". Refusing to navigate would satisfy the
        // assertion above and break the feature.
        const l = lobbyAt(APP_HREF);
        l.type('AB12CD'); l.go();
        assert.match(l.href(), /index\.html\?game=AB12CD/,
            'the destination lost the scorecard or the code: ' + l.href());
    });

    // ---- THE PASTED LINK, WHICH IS WHAT AN ORGANIZER ACTUALLY SENDS -------
    //
    // The fromUrl branch only EXTRACTS the code out of the pasted text and then
    // rebuilds the destination through playerPageUrl, so it lands in the same place.
    // It matters more than the typed code, because the note under that very field
    // tells golfers above four to "paste the link your organizer sent".
    test('a pasted organizer link does not leave the app either', () => {
        const l = lobbyAt(APP_HREF);
        l.type('https://golf-app-5a5.pages.dev/index.html?game=JLRL4H&group=2');
        l.go();
        assert.ok(!leavesTheApp(l.href()),
            '\nPasting the organizer link inside the app navigates OFF the app origin:\n'
            + '    ' + l.href());
    });

    test('and the pasted link keeps its group', () => {
        const l = lobbyAt(APP_HREF);
        l.type('https://golf-app-5a5.pages.dev/index.html?game=JLRL4H&group=2');
        l.go();
        assert.match(l.href(), /game=JLRL4H/);
        assert.match(l.href(), /group=2/,
            'the group the link carried was dropped, which costs the scorekeeper '
            + 'their write access');
    });

    test('a pasted link with no group still does not gain one', () => {
        const l = lobbyAt(APP_HREF);
        l.type('https://golf-app-5a5.pages.dev/index.html?game=JLRL4H');
        l.go();
        assert.ok(!/group=/.test(l.href()),
            'a group was invented, handing over somebody else’s card');
    });
});

describe('ON THE WEB NOTHING CHANGES', () => {

    // The control that stops the fix becoming a regression. On an https origin the
    // current behaviour is correct and must stay byte-for-byte the same, including
    // the preview-deploy rule: a preview must hand out links to ITSELF.
    test('a typed code on the web still opens the scorecard', () => {
        const l = lobbyAt(WEB_HREF);
        l.type('AB12CD'); l.go();
        assert.match(l.href(), /index\.html\?game=AB12CD/);
    });

    test('the web destination stays on the origin the page was served from', () => {
        const l = lobbyAt('https://preview-7.pages.dev/admin.html');
        l.type('AB12CD'); l.go();
        assert.match(l.href(), /^https:\/\/preview-7\.pages\.dev\//,
            'a preview deploy sent the golfer to production: ' + l.href());
    });

    test('a subdirectory deployment keeps its directory', () => {
        const l = lobbyAt('https://example.com/golf/admin.html');
        l.type('AB12CD'); l.go();
        assert.match(l.href(), /^https:\/\/example\.com\/golf\/index\.html/,
            'the subdirectory was dropped: ' + l.href());
    });
});

describe('THE SHARE BUILDER IS NOT WHAT IS WRONG, AND MUST NOT BE CHANGED', () => {

    // Kept HERE, beside the navigation assertions, deliberately. The cheapest way to
    // make the tests above pass is to stop shareBaseUrl() returning the canonical
    // origin under capacitor:// - which would silently re-break every share surface
    // in the app: the QR, the invite text, all thirteen group links. That regression
    // has already shipped once and is recorded in product-links.js's own header.
    const PL = loadJsFile('product-links.js');
    const shareBaseAt = href => {
        vm.runInContext('location = { origin: ' + JSON.stringify(
            /^https?:/i.test(href) ? new URL(href).origin : APP_ORIGIN)
            + ', href: ' + JSON.stringify(href)
            + ', pathname: ' + JSON.stringify(
                /^https?:/i.test(href) ? new URL(href).pathname : '/admin.html') + ' };', PL);
        return String(vm.runInContext('shareBaseUrl()', PL));
    };

    test('under capacitor:// a SHARED link still points at the canonical web origin', () => {
        assert.equal(shareBaseAt(APP_HREF), 'https://golf-app-5a5.pages.dev/',
            'a link sent from inside the app must be one another phone can open. '
            + 'capacitor://localhost/index.html?game=CODE is meaningless in a text.');
    });

    test('on the web a SHARED link still points at this page’s own origin', () => {
        assert.equal(shareBaseAt('https://preview-7.pages.dev/admin.html'),
            'https://preview-7.pages.dev/',
            'a preview deploy must hand out links to itself');
    });
});
