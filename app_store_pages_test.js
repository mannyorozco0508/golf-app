// ============================================================================
// APP STORE REQUIRED PAGES
//
// Apple will not accept a submission without a reachable Privacy Policy URL and
// a Support URL, and a Terms/EULA link is required on any paywall the app ever
// shows. These three pages exist to satisfy that, and they are pinned here
// because they are the kind of file that is easy to write once and then break
// silently: nothing in the app links to them, no user ever complains, and the
// failure surfaces only at submission.
//
// They are deliberately NOT part of either product shell:
//
//   - not in SHELL_FILES  -> not precached, because a golfer on a tee box with
//                            no signal does not need the privacy policy offline
//   - not in CONSUMER_SHELL -> not in dist/consumer, not in the native bundle,
//                            because they are web pages an App Store reviewer
//                            and a curious user open in a browser
//
// They are plain static HTML with no Firebase, no engines and no scripts, which
// is what keeps them out of the parity and boundary sweeps that walk every root
// .html file.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const exists = f => fs.existsSync(path.join(__dirname, f));

const PAGES = ['privacy.html', 'terms.html', 'support.html'];

// ---------------------------------------------------------------------------
describe('THE PAGES APPLE REQUIRES EXIST', () => {

    PAGES.forEach(p => {
        test(`${p} exists and is a complete HTML document`, () => {
            assert.ok(exists(p), `${p} is required for App Store submission`);
            const src = read(p);
            assert.match(src, /^<!DOCTYPE html>/, 'must be a full document, not a fragment');
            assert.match(src, /<html lang="en">/);
            assert.match(src, /<meta name="viewport"[^>]*width=device-width/,
                'a reviewer will open this on a phone');
            assert.match(src, /<\/html>\s*$/, 'must not be truncated');
        });
    });

    test('each page states what it is in its title', () => {
        assert.match(read('privacy.html'), /<title>Privacy Policy — HardPan<\/title>/);
        assert.match(read('terms.html'), /<title>Terms of Use — HardPan<\/title>/);
        assert.match(read('support.html'), /<title>Support — HardPan<\/title>/);
    });

    test('every page carries a working contact route', () => {
        // The Support URL is worthless if there is no way to make contact from it,
        // and Apple has rejected apps for exactly that.
        PAGES.forEach(p => assert.match(read(p), /mailto:[^"']+@[^"']+/,
            `${p} must offer a way to reach a human`));
    });

    test('the three pages link to each other', () => {
        PAGES.forEach(p => {
            const src = read(p);
            PAGES.forEach(other => assert.ok(src.includes(`href="${other}"`),
                `${p} must link to ${other}`));
        });
    });
});

// ---------------------------------------------------------------------------
describe('THE POSITIONING IS STATED, NOT IMPLIED', () => {

    // Guideline 5.3.3. The single most consequential paragraph in this repo is not
    // code - it is the sentence that tells a reviewer this app does not take bets.
    // If it is ever softened or edited out, the submission risk changes materially.

    test('the privacy policy says the app never handles money', () => {
        // store-legal (2026-10-17): the policy no longer uses the word "wagers"; it
        // says what the app does not do with money, which is the same fact.
        const src = read('privacy.html');
        assert.match(src, /does not hold funds, move money, process payments, or pay winnings/i);
        assert.match(src, /takes no share of it/i);
        assert.match(src, /works out who owes who/i);
    });

    test('the terms say the same thing, in the terms', () => {
        const src = read('terms.html');
        assert.match(src, /not a gambling service, a sportsbook, a payment processor/i);
        assert.match(src, /does not accept wagers, hold funds, process payments, or pay out winnings/i);
    });

    test('the support page describes settlement as arithmetic, not a transaction', () => {
        assert.match(read('support.html'), /never takes payment and never takes a cut/i);
    });

    test('the terms say what is free and what the GPS Map subscription is - and never promise free GPS', () => {
        // Mailbox 007 (Manny 2026-10-17): v2.0 sells GPS from day one - every GPS feature behind a
        // 7-day free trial, then the yearly GPS Map subscription; games stay free. The terms must say
        // exactly that (a page promising free GPS, or no subscription, would be a rejection now).
        const t = read('terms.html');
        assert.match(t, /Games, scoring, the scorecard, the leaderboard, joining a game and settling up are free/);
        assert.match(t, /GPS Map subscription: an auto-renewing yearly subscription with a 7-day free trial/);
        assert.ok(!/currently offers no in-app purchases/i.test(t), 'the subscription exists now');
        ['terms.html', 'privacy.html', 'support.html'].forEach((f) => assert.ok(!/free (gps|yardage)|gps (is |stays )?free|basic yardages/i.test(read(f)), f + ' promises free GPS'));
    });

    test('the terms carry the auto-renewing subscription terms for when one goes on sale', () => {
        // store-legal: Guideline 3.1.2 wants the renewal terms in the EULA the
        // paywall links to. They are written for "when a subscription is offered",
        // so they are true today and true the day HardPan GPS goes on sale.
        const t = read('terms.html');
        assert.match(t, /renews automatically/i);
        assert.match(t, /at least 24 hours before the current period ends/i);
        assert.match(t, /subscription settings/i);
        assert.match(t, /Standard End User License Agreement/);
        assert.match(t, /Apple and its subsidiaries are third-party beneficiaries/);
    });

    test('no store-facing page calls the app a money-games app or sends anybody to Venmo', () => {
        [...PAGES, 'acknowledgements.html'].forEach(p => {
            const prose = read(p).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
            assert.ok(read(p).length > 1000, p + ' was actually read');
            assert.doesNotMatch(prose, /money games?|venmo|listing may still say Rattle Golf/i, p);
        });
    });
});

// ---------------------------------------------------------------------------
describe('THE PRIVACY POLICY IS ACCURATE ABOUT THIS APP', () => {

    // A generated boilerplate policy that describes data the app does not collect
    // is worse than none: it is a false statement in a legal document, and the App
    // Privacy questionnaire has to agree with it.

    const P = read('privacy.html');

    test('it names what is actually stored', () => {
        ['Player names', 'scores', 'Round codes'].forEach(t =>
            assert.ok(new RegExp(t, 'i').test(P), `the policy should mention ${t}`));
    });

    test('it names Firebase as the processor, because that is where data goes', () => {
        assert.match(P, /Firebase<\/strong> \(Authentication, Realtime Database, Cloud Functions, Cloud Messaging\)/);
    });

    // store-legal (2026-10-17), App Review B3 5.1.1/5.1.2. The old policy said "No
    // account ... or email address" and "Your position is never stored" - both false
    // once Apple / Google / email sign-in shipped and Set green began saving the
    // spot a golfer stands on. These are the TRUE claims, each bound to the code
    // that makes it true.
    test('it says accounts and email exist - Apple, Google, email link and anonymous', () => {
        assert.match(P, /Sign in with Apple, Google, or an email link/);
        assert.match(P, /keeps your email address/);
        assert.match(P, /anonymous account/);
        assert.doesNotMatch(P, /No account, password, email address/i, 'the retired false claim');
        const oauth = read('oauth-signin.js');
        assert.match(oauth, /signInWithApple/); assert.match(oauth, /GoogleAuthProvider/);
        assert.ok(exists('email-link-auth.js'));
    });

    test('it says a green set by GPS saves the position the golfer stands on', () => {
        assert.match(P, /your phone's position at that moment is saved as that green's location/);
        assert.match(P, /saved to the round and to the shared course record/);
        assert.doesNotMatch(P, /never where that golfer was standing/i, 'the retired false claim');
        assert.doesNotMatch(P, /Your position is never stored/i, 'the retired false claim');
        if (exists('gps-view.js')) {
            const view = read('gps-view.js');
            assert.match(view, /S\.draft = \{ mid: here, gps: true \}/, 'Set by GPS uses the fix');
            assert.match(view, /course_gps\/' \+ S\.courseKey \+ '\/pins\//, 'and the shared course record is written');
        }
    });

    test('it names every service a request goes to', () => {
        ['GolfAPI', 'golfcourseapi.com', 'api.weather.gov', 'WeatherKit', 'Esri', 'USGS', 'Cloudflare',
         'Firebase Cloud Messaging', 'RevenueCat'].forEach(t => assert.ok(P.includes(t), 'the policy names ' + t));
        assert.match(P, /never your own position/, 'wind is the course point');
    });

    test('it is explicit about what is NOT collected', () => {
        [/No phone number/, /location/, /analytics or tracking/, /No contacts, photos, camera or microphone access/].forEach(re =>
            assert.match(P, re, 'the policy must state this'));
    });

    test('it tells a user how to delete their data - in the app first', () => {
        assert.match(P, /open Account and tap Delete account/, 'the in-app account route (5.1.1(v))');
        assert.match(P, /revoke the app's access to your Apple ID/);
        assert.match(P, /End &amp; Wipe Round/, 'the in-app round route');
        assert.match(P, /clearing your browser's site data/i, 'the on-device route');
        // and the app really has that button, and the server really revokes
        assert.match(read('admin.html'), /id="account-delete"/);
        assert.match(read('firebase-functions/account-delete-core.js'), /appleid\.apple\.com\/auth\/revoke/);
    });

    test('it is honest that a round link grants access', () => {
        // The access model is the round code. A policy that implied stronger
        // protection than the product provides would be the wrong kind of wrong.
        // events/$eventCode is world-readable, and once a round exists any client
        // may write its children. A group link keeps friends on their own card in
        // the app; database.rules.json does not enforce that. The retired sentence
        // claimed it did.
        assert.match(P, /Rounds are shared by link or code with the group/);
        assert.match(P, /Anyone holding a round link can view that round/i);
        assert.doesNotMatch(P, /Database rules restrict what each link can change/);
        assert.doesNotMatch(P, /plain round link is read-only/);
    });

    test('it discloses online course search to golfcourseapi', () => {
        // Consumer search (admin.html "Search online") sends the typed query
        // through functions/api/course-search.js to api.golfcourseapi.com.
        // The imported card is written onto the round and into global_courses.
        // Scores and names never go on that request.
        // store-legal: one "Who else is involved" section replaces "Third-party
        // directories", and it covers GPS search (GolfAPI) as well.
        assert.match(P, /Last updated: 17 October 2026/);
        assert.match(P, /Course search text/);
        assert.match(P, /golfcourseapi\.com/);
        assert.match(P, /Cloudflare Worker/);
        assert.match(P, /Imported course details/);
        assert.match(P, /Round scores and player names are not sent to golfcourseapi/);
        assert.match(P, /<h2>Who else is involved<\/h2>/);
    });
});

// ---------------------------------------------------------------------------
describe('THEY STAY OUT OF THE APP BUNDLES', () => {

    // acknowledgements.html (store-legal) is the same kind of page: a web page the
    // Account panel and the GPS credits open in Safari.
    const PAGES = ['privacy.html', 'terms.html', 'support.html', 'acknowledgements.html'];

    test('not precached — a policy page is not needed offline at a remote course', () => {
        const sw = read('sw.js');
        PAGES.forEach(p => assert.ok(!sw.includes(`'./${p}'`),
            `${p} must not be in SHELL_FILES`));
    });

    test('not in the native bundle', () => {
        const sync = read('sync-mobile-web.js');
        PAGES.forEach(p => assert.ok(!sync.includes(`'${p}'`),
            `${p} must not ship inside the iOS binary`));
    });

    test('not declared in either product shell', () => {
        const build = read('build-shell.js');
        PAGES.forEach(p => assert.ok(!build.includes(p),
            `${p} is a web page, not part of a product deployment`));
    });

    test('they carry no Firebase, no engines and no scripts', () => {
        // This is what keeps them invisible to the parity and boundary sweeps that
        // walk every root .html file, and it is worth pinning so nobody later adds
        // a analytics snippet to "see how many people read the policy".
        PAGES.forEach(p => {
            const src = read(p);
            // The WORD Firebase belongs in the privacy policy - that is where the
            // data goes and the policy has to say so. What must not appear is a
            // firebase SDK being LOADED, which is a different thing entirely.
            assert.ok(!/firebase-(app|database)-compat\.js|firebase\.initializeApp/i.test(src),
                `${p} must not load the Firebase SDK`);
            assert.ok(!/<script/i.test(src), `${p} must contain no script tag`);
            // Same trap as the Firebase check above: the policy has to be ABLE to say
            // "no third-party analytics or tracking SDK", so the word appears in prose.
            // What is banned is a tracker being fetched, which needs a URL.
            assert.ok(!/(src|href)=["'][^"']*(googletagmanager|google-analytics|gtag|connect\.facebook)/i.test(src),
                `${p} must not fetch a tracker - the policy says there is none`);
        });
    });
});

// ---------------------------------------------------------------------------
describe('THEY LOOK LIKE RATTLE GOLF', () => {

    test('each page uses the locked brand palette', () => {
        PAGES.forEach(p => {
            const src = read(p);
            assert.ok(src.includes('#0E2B1F'), `${p}: forest green`);
            assert.ok(src.includes('#93C01F'), `${p}: lime`);
            assert.ok(src.includes('#F6F4EC'), `${p}: cream`);
        });
    });

    test('each page names HardPan and still identifies the Rattle Golf listing', () => {
        // The files stay privacy.html, terms.html, support.html — those are the
        // URLs App Store Connect already has for 1.0.3. The product name on the
        // page is HardPan. Each page still says Rattle Golf so a reviewer opening
        // the listing's privacy URL can see it is the same app, and so Rattle
        // Golf Tournaments is named as out of scope rather than silently covered.
        PAGES.forEach(p => {
            const src = read(p);
            assert.match(src, /<img src="hardpan-icon\.svg" alt=""/);
            assert.match(src, /<span class="brand-word">HARDPAN<\/span>/);
            assert.ok(!/hardpan-lockup\.svg/.test(src), `${p} still shows the condensed lockup`);
            assert.match(src, /Rattle Golf/);
            assert.match(src, /support@rattlegolf\.com/);
        });
    });

    test('they are self-contained — no external stylesheet or font to fail', () => {
        // A reviewer may open these on a throttled connection. A remote font that
        // does not load is a blank page.
        [...PAGES, 'acknowledgements.html'].forEach(p => {
            const src = read(p);
            assert.ok(!/<link[^>]*stylesheet/i.test(src), `${p} must inline its CSS`);
            assert.ok(!/fonts\.googleapis|cdn\./i.test(src), `${p} must load nothing remote`);
        });
    });
});

// ---------------------------------------------------------------------------
// store-legal (2026-10-17): REACHABLE FROM INSIDE THE APP, and the credits page.
describe('THE APP LINKS TO THEM, AND THE ACKNOWLEDGEMENTS SAY WHAT THE LICENCES ASK', () => {

    const URL = p => 'https://golf-app-5a5.pages.dev/' + p;
    const ALL = ['privacy.html', 'terms.html', 'support.html', 'acknowledgements.html'];

    test('the Account panel links all four, and opening it points them at the web origin (they are not in the bundle)', () => {
        const a = read('admin.html');
        const modal = a.slice(a.indexOf('id="account-modal"'), a.indexOf('<!-- RESUME GAME BOX -->'));
        assert.ok(modal.length > 1000, 'the account modal slice is real');
        assert.match(modal, /<nav id="account-legal"/);
        ALL.forEach(p => assert.ok(modal.includes('id="legal-' + p.replace('.html', '') + '" href="' + p + '"'), 'Account links ' + p));
        // THE WAY A GOLFER ARRIVES: tap Account inside the iOS shell.
        const { loadHtmlInlineScript } = require('./helpers/load-script.js');
        const sb = loadHtmlInlineScript('admin.html', ['product-links.js', 'account-exit.js', 'my-groups.js']);
        sb.window.Capacitor = { isNativePlatform: () => true };
        sb.Capacitor = sb.window.Capacitor;
        sb.openAccountPanel();
        const hrefs = ['privacy', 'terms', 'support', 'acknowledgements'].map(n => sb.document.getElementById('legal-' + n).getAttribute('href'));
        assert.deepEqual(hrefs, ALL.map(URL), 'native: the canonical web origin, never capacitor://');
    });

    test('the HardPan front door links them too', { skip: exists('home.html') ? false : 'Consumer tree: no home.html' }, () => {
        const h = read('home.html');
        ALL.forEach(p => assert.ok(h.includes('href="' + URL(p) + '"'), 'home.html links ' + p));
    });

    test('the GPS map credits link the acknowledgements and carry Apple Weather\'s attribution', { skip: exists('gps-view.js') ? false : 'Consumer tree: no GPS' }, () => {
        const v = read('gps-view.js');
        const fn = v.slice(v.indexOf('function fillCredits'), v.indexOf('function toggleCredits'));
        assert.match(fn, /acknowledgements\.html|ackHref\(\)/);
        assert.match(v, /function ackHref\(\) \{[^\n]*shareBaseUrl\(\) \+ 'acknowledgements\.html'/);
        assert.match(fn, /weatherkit\.apple\.com\/legal-attribution\.html/);
        assert.match(fn, /\\uF8FF Weather/);
    });

    test('every page links the acknowledgements', () => {
        ALL.forEach(p => assert.ok(read(p).includes('href="acknowledgements.html"'), p));
    });

    test('acknowledgements: MapLibre BSD-3, OpenStreetMap ODbL with its credit line, Firebase Apache-2.0, Capacitor MIT, the QR library, USGS, Apple Weather', () => {
        const k = read('acknowledgements.html');
        assert.match(k, /<title>Acknowledgements — HardPan<\/title>/);
        assert.match(k, /MapLibre GL JS[\s\S]{0,40}BSD 3-Clause/);
        assert.ok(read('MAPLIBRE-LICENSE.txt').includes('Copyright (c) 2023, MapLibre contributors'));
        assert.match(k, /Copyright &copy; 2023, MapLibre contributors/);
        assert.match(k, /&copy; <a href="https:\/\/www\.openstreetmap\.org\/copyright">OpenStreetMap contributors<\/a>/);
        assert.match(k, /Open Database License \(ODbL\)/);
        assert.match(k, /Firebase JavaScript SDK[\s\S]{0,80}Apache License 2\.0/);
        assert.match(k, /Capacitor 8[\s\S]{0,120}MIT License/);
        assert.match(k, /qrcode-generator 2\.0\.4 - Kazuhiko Arase[\s\S]{0,40}MIT/);
        assert.match(read('qr-encode.js'), /qrcode-generator 2\.0\.4 by Kazuhiko Arase \(MIT\)/);
        assert.match(k, /USGS[\s\S]{0,120}public domain/);
        assert.match(k, /&#63743; Weather/);
        assert.match(k, /href="https:\/\/weatherkit\.apple\.com\/legal-attribution\.html"/);
        assert.match(k, /Powered by <a href="https:\/\/www\.esri\.com">Esri<\/a>/);
    });

    test('privacy, terms and acknowledgements are marked as drafts for Manny, in a comment, not on the page', () => {
        ['privacy.html', 'terms.html', 'acknowledgements.html'].forEach(p => {
            const src = read(p);
            assert.match(src, /^<!DOCTYPE html>\n<!-- DRAFT FOR MANNY'S REVIEW/, p);
            assert.doesNotMatch(src.replace(/<!--[\s\S]*?-->/g, ''), /DRAFT/, p + ': not visible text');
        });
    });
});
