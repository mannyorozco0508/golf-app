// ============================================================================
// WHAT A QR CODE IS ALLOWED TO CONTAIN (2026-10-07, Wave 1)
//
// Manny's brief: a QR per scorekeeper group link plus one Watch QR, generated
// on the phone, and "no organizer link ever in a QR".
//
// WHY THAT LAST LINE IS THE WHOLE POINT. The organizer link carries
// organizerToken, which grants the whole-field override in Finish Round - it
// can correct any score in the round. index.html already warns when it is
// COPIED ("keep it to yourself"). A QR has no such warning and is worse in
// kind: it is pointed at a phone across a table, photographed by anyone
// standing behind, and printed on paper that gets left in a cart. A copied
// link at least needs a deliberate paste.
//
// SO THE BUILDER NEVER SEES THE TOKEN. qrRoundTargets() is handed the round's
// code, roster and base URL - not the round record - and there is a control
// below proving the safety predicate actually fires on a list that does carry
// one, rather than being true because nothing ever tests it.
//
// ONE BUILDER, TWO ENTRY POINTS. index.html (Round Menu) and admin.html (the
// organizer's share screen) both show these codes. This repo has already paid
// for a hand-written copy in each - a per-press stake that reached the engine
// and not the pages - so the list lives in qr-codes.js and both pages call it.
// The tests below hold the builder's URLs against the TEMPLATES THE TWO PAGES'
// OWN COPY BUTTONS USE, so a QR cannot drift from the link beside it.
//
// WHAT THIS FILE CANNOT PROVE. That a camera reads the thing. mini-dom has no
// layout and no pixels, and a QR is a picture. tools/qr-decode-check.js is the
// other half: it renders the real overlay in Chrome, screenshots each code and
// decodes it with Apple's Vision framework - an INDEPENDENT decoder, not our
// own encoder read back - then compares the decoded string to these URLs.
//
// BASELINES, both measured against the FINISHED file (12 tests):
//
//   against main before this wave, all 12 tests: 0 PASS / 12 FAIL. qr-codes.js does not
//     exist, so every test fails on the same ENOENT. That is red, and it
//     proves NOTHING per assertion - so the useful baseline is the next one.
//   with the builder present, pages not yet wired, all 12 tests: 11 PASS / 1 FAIL. The one
//     red is "the pages render QRs only from the builder", which is exactly
//     the work the wiring does. Each of the other eleven was also watched
//     going red while it was being built - the organizer control below is the
//     one that matters, and it fails on a list carrying a token.
//
// The rendered half's baseline is in its own header: 9 faults against the
// pre-wave pages, 0 after.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadJsFile } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
// CODE, NOT PROSE. Every claim below about what a file DOES is matched against
// the source with comments removed. Both of these assertions failed first time
// on correct files, because qr-encode.js's vendoring header says "no fetch, no
// XMLHttpRequest" and qr-codes.js's header explains why it never receives
// organizerToken - so the guard was reading the documentation of the rule as a
// breach of it.
//
// LINE COMMENTS FIRST, THEN BLOCK COMMENTS, and that order is not arbitrary:
// bundle_manifest_test.js did it the other way round and a LINE comment
// containing the characters "/*" swallowed the code under test up to the next
// "*/", so the assertion failed on code that was there.
const code = (f) => read(f).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const BASE = 'https://golf-app-5a5.pages.dev/';
const roster = (n) => Array.from({ length: n }, (_, i) =>
    ({ id: 101 + i, name: 'Golfer' + (i + 1) + ' Lastname', hcp: '0' }));

function box() {
    return loadJsFile('qr-codes.js', ['grouping.js']);
}
function targets(opts) {
    const sb = box();
    sb.OPTS = opts;
    return JSON.parse(vm.runInContext('JSON.stringify(qrRoundTargets(OPTS))', sb));
}
function safePredicate(list) {
    const sb = box();
    sb.LIST = list;
    return vm.runInContext('qrTargetsAreSafe(LIST)', sb);
}

describe('1. THE LIST IS THE GROUP LINKS PLUS WATCH, AND NOTHING ELSE', () => {

    test('two groups: Group 1, Group 2, Watch - in that order', () => {
        const t = targets({ code: 'AB12CD', players: roster(8), baseUrl: BASE });
        assert.deepEqual(t.map(x => x.key), ['group-1', 'group-2', 'watch']);
        assert.deepEqual(t.map(x => x.url), [
            BASE + 'index.html?game=AB12CD&group=1',
            BASE + 'index.html?game=AB12CD&group=2',
            BASE + 'leaderboard.html?game=AB12CD'
        ]);
    });

    test('a single foursome still gets Group 1 and Watch', () => {
        // Not a special case in the UI and not one here: one group is a group.
        const t = targets({ code: 'AB12CD', players: roster(4), baseUrl: BASE });
        assert.deepEqual(t.map(x => x.key), ['group-1', 'watch']);
        assert.equal(t[0].url, BASE + 'index.html?game=AB12CD&group=1');
    });

    test('twenty golfers: five groups, each labelled with its own four', () => {
        const t = targets({ code: 'AB12CD', players: roster(20), baseUrl: BASE });
        assert.equal(t.length, 6);
        assert.deepEqual(t.slice(0, 5).map(x => x.label),
            ['Group 1', 'Group 2', 'Group 3', 'Group 4', 'Group 5']);
        // The names under each code are that group's, so an organizer holding the
        // phone up knows which four to call over.
        assert.match(t[0].sub, /Golfer1/);
        assert.match(t[4].sub, /Golfer17/);
        assert.doesNotMatch(t[0].sub, /Golfer5/, 'group 1 is showing group 2’s golfers');
    });

    test('every group QR is the SAME STRING the group’s Copy button hands out', () => {
        // The two pages build that link from templates; if either changes shape,
        // the QR beside it must change with it or they are two different links
        // wearing one label.
        assert.match(read('admin.html'),
            /let url = playerPageUrl\('index\.html'\) \+ '\?game=' \+ gameCode;[\s\S]{0,200}url \+= '&group=' \+ groupNum;/,
            'admin.html’s scorecardUrlFor no longer builds ?game=CODE&group=N');
        assert.match(read('index.html'),
            /\$\{base\}\?game=\$\{currentMode\}&group=\$\{b\.group\}/,
            'index.html’s group link no longer builds ?game=CODE&group=N');
        const t = targets({ code: 'ZZ99ZZ', players: roster(8), baseUrl: BASE });
        assert.equal(t[1].url, BASE + 'index.html?game=ZZ99ZZ&group=2');
    });
});

describe('2. NO ORGANIZER LINK EVER, AND THE GUARD FIRES', () => {

    test('no target carries an organizer token, at any roster size', () => {
        [4, 8, 12, 20, 24].forEach((n) => {
            targets({ code: 'AB12CD', players: roster(n), baseUrl: BASE }).forEach((x) => {
                assert.doesNotMatch(x.url, /organizer/i,
                    n + ' golfers: ' + x.key + ' carries an organizer token');
                assert.doesNotMatch(x.url, /token/i, n + ' golfers: ' + x.key + ' carries a token');
            });
        });
    });

    test('the builder is not even GIVEN the token', () => {
        // Passing the whole round record would make "we never include it" a
        // promise about code rather than a property of the interface. The
        // organizer token is in the round record and the builder takes a roster.
        const src = code('qr-codes.js');
        assert.ok(src.indexOf('function qrRoundTargets') !== -1,
            'the comment strip ate the file - this test is guarding nothing');
        assert.doesNotMatch(src, /organizerToken/,
            'qr-codes.js reads organizerToken - the token must not reach this file at all');
        // AND THE INTERFACE SAYS SO: it takes a roster, not the round record.
        assert.match(src, /qrRoundTargets\(opts\)/, 'the builder no longer takes an options bag');
    });

    test('CONTROL: the safety predicate REFUSES a list that does carry one', () => {
        // Without this, "no organizer link" is true of a predicate that returns
        // true for everything. This is the assertion that proves the check works.
        assert.equal(safePredicate([
            { key: 'group-1', url: BASE + 'index.html?game=AB12CD&group=1' },
            { key: 'watch', url: BASE + 'leaderboard.html?game=AB12CD' }
        ]), true, 'a clean list is refused - the predicate blocks everything');
        assert.equal(safePredicate([
            { key: 'group-1', url: BASE + 'index.html?game=AB12CD&group=1' },
            { key: 'organizer', url: BASE + 'index.html?game=AB12CD&organizer=tok-abc' }
        ]), false, 'an organizer link passes the safety predicate');
        assert.equal(safePredicate([
            { key: 'x', url: BASE + 'index.html?game=AB12CD&ORGANIZER=tok' }
        ]), false, 'the predicate is case-sensitive, so a shout gets through');
    });

    test('and the pages render QRs only from the builder', () => {
        // A hand-rolled QR anywhere else is how the organizer link would get in.
        ['index.html', 'admin.html'].forEach((page) => {
            const src = code(page);
            // THROUGH qrOpenSheet(), which is the shared controller - the pages
            // do not even assemble the list. The first version of this asserted
            // qrRoundTargets( in the pages, which would have FORCED each page to
            // build its own list: the opposite of the rule it exists for.
            assert.match(src, /qrOpenSheet\(\{/, page + ' does not open the shared QR sheet');
            assert.doesNotMatch(src, /qrcode\(\s*[0-9]/,
                page + ' builds a QR of its own instead of going through qr-codes.js');
            assert.doesNotMatch(src, /qrSvgFor\(/,
                page + ' draws its own code instead of going through qr-codes.js');
        });
    });
});

describe('3. THE WATCH CODE IS A PAGE WITH NOTHING TO TYPE IN', () => {

    test('Watch points at the leaderboard, not a scorecard link', () => {
        // MEASURED, NOT ASSERTED - this repo has shipped the word "read-only"
        // about a link that was fully writable. The bare ?game=CODE link is
        // writable at four golfers and not at eight, so it is NOT a read-only
        // link and is not what Watch uses. leaderboard.html has no score input
        // at any roster size; tools/qr-decode-check.js opens the decoded Watch
        // URL and counts them.
        const t = targets({ code: 'AB12CD', players: roster(8), baseUrl: BASE });
        const watch = t[t.length - 1];
        assert.equal(watch.key, 'watch');
        assert.match(watch.url, /leaderboard\.html\?game=AB12CD$/);
        assert.doesNotMatch(watch.url, /group=/, 'the Watch code is scoped to a group');
    });

    test('the label says what it is in words a golfer reads', () => {
        const t = targets({ code: 'AB12CD', players: roster(8), baseUrl: BASE });
        const watch = t[t.length - 1];
        assert.equal(watch.label, 'Watch');
        assert.match(watch.sub, /follow|watch|scor/i, 'the Watch code explains nothing: ' + watch.sub);
    });
});

describe('4. IT WORKS WITH NO NETWORK', () => {

    test('the encoder is vendored and in both manifests', () => {
        assert.ok(fs.existsSync(path.join(__dirname, 'qr-encode.js')), 'qr-encode.js is not vendored');
        // SHELL_FILES entries carry a "./" prefix and FILES_TO_SYNC does not, so
        // the prefix is optional here rather than two different patterns that
        // would each pass against the wrong file.
        const sw = read('sw.js'), sync = read('sync-mobile-web.js');
        assert.match(sw, /'\.\/qr-encode\.js'/, 'qr-encode.js is not in the offline shell, so a QR needs signal');
        assert.match(sw, /'\.\/qr-codes\.js'/, 'qr-codes.js is not in the offline shell');
        assert.match(sync, /'qr-encode\.js'/, 'qr-encode.js does not travel with the native app');
        assert.match(sync, /'qr-codes\.js'/, 'qr-codes.js does not travel with the native app');
    });

    test('and nothing in either file reaches the network', () => {
        ['qr-encode.js', 'qr-codes.js'].forEach((who) => {
            const src = code(who);
            assert.ok(src.length > 400, who + ': the comment strip ate the file, so this proves nothing');
            assert.doesNotMatch(src, /XMLHttpRequest|fetch\s*\(|importScripts|new\s+Image\s*\(/,
                who + ' reaches the network or loads an image - the code must be drawn on the phone');
            assert.doesNotMatch(src, /\beval\s*\(/, who + ' calls eval');
        });
    });
});
