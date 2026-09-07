// ============================================================================
// A SHARE LINK IS A LINK SOMEBODY ELSE CAN OPEN
//
// Inside the iOS wrapper the page is served from capacitor://localhost, so every
// URL built from the page's own location came out as
//
//     capacitor://localhost/index.html?game=L6Y38G
//
// which is meaningless the moment it leaves the phone. On the native build that
// broke the invite link, the QR, every group scorekeeper link, the private
// organizer link, the read-only follow link, the trip link and the tournament
// team link - all of them at once, because every one of them derived from
// location.origin or location.href.
//
// THE RULE. A share URL is https:// wherever the app is running.
//   on http/https  -> this page's own origin, so preview deploys and local dev
//                     keep sharing links to THEMSELVES, which is what you want
//                     when you are testing a deploy
//   anything else  -> the canonical web origin, because capacitor:// and file://
//                     are not addresses anyone else can reach
//
// ONE DEFINITION. product-links.js already describes itself as "the one place
// that knows the two products may not live at the same origin", so the canonical
// origin and the rule live there and every builder calls it. Five builders across
// four pages had five copies of "read my own location"; that is how they were all
// wrong together and how they would drift apart if fixed separately.
//
// WHAT THIS FILE CANNOT PROVE, and why tools/share-url-check.js exists: that the
// pages actually USE the helper when they run. This asserts the rule and the
// wiring; the cold check arrives on each page over file:// - a non-web origin,
// exactly as capacitor:// is - and fails if any URL it can produce is not https.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const PL = loadJsFile('product-links.js', []);
const shareBaseUrl = () => vm.runInContext('shareBaseUrl()', PL);
const setLocation = loc => { vm.runInContext('location = ' + JSON.stringify(loc)
    + '; window.location = location;', PL); };

const WEB = 'https://golf-app-5a5.pages.dev';

describe('THE RULE', () => {

    test('the canonical web origin is declared, once, and is https', () => {
        const src = read('product-links.js');
        const m = /GOLF_WEB_ORIGIN\s*=\s*'([^']+)'/.exec(src);
        assert.ok(m, 'product-links.js declares no canonical web origin');
        assert.match(m[1], /^https:\/\//, 'the canonical origin is not https');
        assert.equal((src.match(/GOLF_WEB_ORIGIN\s*=/g) || []).length, 1,
            'the canonical origin is declared more than once');
    });

    test('on a real web deploy it uses THIS page’s origin', () => {
        setLocation({ protocol: 'https:', origin: 'https://preview-7.pages.dev',
                      pathname: '/admin.html', href: 'https://preview-7.pages.dev/admin.html' });
        assert.equal(shareBaseUrl(), 'https://preview-7.pages.dev/',
            'a preview deploy would hand out links to production');
    });

    test('and keeps a subdirectory', () => {
        setLocation({ protocol: 'https:', origin: 'https://example.com',
                      pathname: '/golf/admin.html', href: 'https://example.com/golf/admin.html' });
        assert.equal(shareBaseUrl(), 'https://example.com/golf/');
    });

    test('a clean URL with no .html still resolves to its directory', () => {
        setLocation({ protocol: 'https:', origin: 'https://example.com',
                      pathname: '/admin', href: 'https://example.com/admin' });
        assert.equal(shareBaseUrl(), 'https://example.com/',
            'Cloudflare serves /admin, not /admin.html - the directory must survive that');
    });

    test('INSIDE THE APP it uses the canonical web origin', () => {
        setLocation({ protocol: 'capacitor:', origin: 'capacitor://localhost',
                      pathname: '/index.html', href: 'capacitor://localhost/index.html' });
        assert.equal(shareBaseUrl(), WEB + '/',
            'the native build would keep handing out capacitor:// links');
    });

    test('and from a file:// page too — the same class of non-web origin', () => {
        setLocation({ protocol: 'file:', origin: 'file://',
                      pathname: '/Users/x/golf-app/admin.html', href: 'file:///Users/x/golf-app/admin.html' });
        assert.equal(shareBaseUrl(), WEB + '/');
    });

    test('http counts as the web — a local server is a real address', () => {
        setLocation({ protocol: 'http:', origin: 'http://localhost:8080',
                      pathname: '/admin.html', href: 'http://localhost:8080/admin.html' });
        assert.equal(shareBaseUrl(), 'http://localhost:8080/');
    });

    test('it never returns a bare origin without a trailing slash', () => {
        ['https:', 'capacitor:', 'file:'].forEach(protocol => {
            setLocation({ protocol, origin: protocol + '//h', pathname: '/a.html',
                          href: protocol + '//h/a.html' });
            assert.match(shareBaseUrl(), /\/$/, protocol + ' produced ' + shareBaseUrl());
        });
    });
});

describe('EVERY BUILDER USES IT', () => {

    // Comments are stripped: this file's own prose quotes the broken pattern at
    // length, and counting that would fail for the wrong reason.
    const code = f => read(f).replace(/\/\/.*$/gm, '');
    const BUILDERS = [
        ['admin.html', 'playerPageUrl'],
        ['admin.html', 'shareMainApp'],
        ['index.html', 'renderGroupLinksPanel'],
        ['leaderboard.html', 'shareResults'],
        ['trip.html', 'tripShareUrl'],
        ['tournament.html', 'scorecardBaseUrl']
    ];

    BUILDERS.forEach(([file, fn]) => {
        test(file + ' ' + fn + '() builds from shareBaseUrl, not its own location', () => {
            const src = code(file);
            const at = src.indexOf('function ' + fn);
            assert.ok(at > -1, fn + ' is gone from ' + file);
            const body = src.slice(at, at + 700);
            assert.ok(!/location\.origin|location\.href\.split/.test(body),
                fn + ' still derives a share URL from the page it is running on');
            assert.match(body, /shareBaseUrl\(\)/, fn + ' does not use the shared base');
        });
    });

    test('the pages that build share links all load product-links.js', () => {
        ['admin.html', 'index.html', 'leaderboard.html', 'trip.html', 'tournament.html']
            .forEach(f => assert.match(read(f), /<script src="\.?\/?product-links\.js"><\/script>/,
                f + ' builds share links without loading the file that defines the rule'));
    });

    test('and it ships in the native bundle', () => {
        assert.match(read('sync-mobile-web.js'), /'product-links\.js'/,
            'the one file that knows the canonical origin is not in the bundle');
    });
});

describe('THE COPY SAYS WHAT THE LINK DOES', () => {

    // The setup screen's alert said "Copied friend spectator/scorecard link!" - two
    // names at once, unconditionally - while the note above it was conditional and
    // measured. Both are gone with the card: sharing moved to the Round Ready screen
    // and the Cup handoff. What had to survive the move is the RULE, in one place,
    // so two surfaces cannot start describing different things.
    test('the two-names-at-once alert is gone', () => {
        assert.ok(!/friend spectator\/scorecard link/.test(read('admin.html')),
            'the alert still gives the link two names in one sentence');
    });

    test('the rule has one definition and both surfaces call it', () => {
        assert.equal((read('grouping.js').match(/function groupLinkNoteText/g) || []).length, 1);
        ['admin.html', 'sidematches.html'].forEach(f => {
            const src = read(f).replace(/\/\/.*$/gm, '');
            assert.match(src, /groupLinkNoteText\(/,
                f + ' hands out group links without saying what they permit');
            assert.ok(!/function groupLinkNoteText/.test(src),
                f + ' carries its own copy of the rule, so the two can drift apart');
        });
    });
});
