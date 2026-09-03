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
        assert.match(read('privacy.html'), /<title>Privacy Policy — Rattle Golf<\/title>/);
        assert.match(read('terms.html'), /<title>Terms of Use — Rattle Golf<\/title>/);
        assert.match(read('support.html'), /<title>Support — Rattle Golf<\/title>/);
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
        const src = read('privacy.html');
        assert.match(src, /does not accept wagers, hold funds, process payments, or pay winnings/i);
        assert.match(src, /takes no share of it/i);
    });

    test('the terms say the same thing, in the terms', () => {
        const src = read('terms.html');
        assert.match(src, /not a gambling service, a sportsbook, a payment processor/i);
        assert.match(src, /does not accept wagers, hold funds, process payments, or pay out winnings/i);
    });

    test('the support page describes settlement as arithmetic, not a transaction', () => {
        assert.match(read('support.html'), /never takes payment and never takes a cut/i);
    });

    test('no page promises in-app purchases that do not exist', () => {
        // The app ships with no IAP. Claiming otherwise in the terms would be a
        // straightforward rejection.
        assert.match(read('terms.html'), /currently offers no in-app purchases or subscriptions/i);
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
        assert.match(P, /Firebase Realtime Database/);
    });

    test('it is explicit about what is NOT collected', () => {
        [/no account|No account/, /email address/, /location|GPS/,
         /analytics or tracking/].forEach(re =>
            assert.match(P, re, 'the policy must state this is not collected'));
    });

    test('it tells a user how to delete their data', () => {
        assert.match(P, /End &amp; Wipe Round/, 'the in-app route');
        assert.match(P, /clearing your browser's site data/i, 'the on-device route');
    });

    test('it is honest that a round link grants access', () => {
        // The access model is the round code. A policy that implied stronger
        // protection than the product provides would be the wrong kind of wrong.
        assert.match(P, /Anyone holding a round link can view that round/i);
    });
});

// ---------------------------------------------------------------------------
describe('THEY STAY OUT OF THE APP BUNDLES', () => {

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

    test('each page names the product', () => {
        PAGES.forEach(p => assert.match(read(p), /<div class="brand">Rattle Golf<\/div>/));
    });

    test('they are self-contained — no external stylesheet or font to fail', () => {
        // A reviewer may open these on a throttled connection. A remote font that
        // does not load is a blank page.
        PAGES.forEach(p => {
            const src = read(p);
            assert.ok(!/<link[^>]*stylesheet/i.test(src), `${p} must inline its CSS`);
            assert.ok(!/fonts\.googleapis|cdn\./i.test(src), `${p} must load nothing remote`);
        });
    });
});
