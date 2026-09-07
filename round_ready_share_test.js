// ============================================================================
// YOU SHARE A ROUND AFTER IT EXISTS, NOT BEFORE
//
// The share card sat on the SETUP screen, visible at step one - before a format,
// a course or a single player existed. There was nothing to share yet, and nobody
// sends a link to a round that has not been built. It also carried a QR nobody
// scans standing next to the man they are texting, and that QR pulled a
// third-party script from a CDN at runtime, on the most-used screen, inside a
// native bundle - the same shape as the Tesseract problem HANDOFF already flags:
// it fails offline, exactly where the app is used.
//
// SHARING BELONGS ON THE READY SCREEN, which already existed. saveSettings() ends
// with showRoundReadyScreen(), and the round is real there: the groups are known,
// so a link can be addressed to the person keeping that group's card.
//
// ONE GROUP MEANS ONE LINK. This is the part that was actually broken. With a
// single group the links panel rendered a sentence and nothing else - "the round
// code itself works as the scorecard link for everyone" - so a four-ball organizer
// was told to read a code aloud. That sentence was the bug, not a fallback. Every
// roster size now gets a real, labelled, copyable link.
//
// AND THE NOTE KEEPS ITS BINDING - which is why its words change. v72 measured the
// scorekeeper/read-only sentence against what the link actually PERMITS: the bare
// ?game=CODE link the setup card handed out gave a foursome 76 of 76 editable score
// inputs and eight golfers 152 of which none were editable. That card is gone and
// that bare link is no longer offered anywhere. Every link the app hands out now
// carries ?group=N, and re-measuring showed those behave differently again:
//
//     8 golfers, ?group=1     76 inputs, 76 editable - Golfers 1-4 and nobody else
//     9 golfers, ?group=3     19 inputs, 19 editable - the one golfer in that group
//
// A group link is ALWAYS writable. What changes above four golfers is not what it
// permits but WHO IT COVERS - the other groups are not locked on that card, they
// are not on it. Carrying "read-only link" across unexamined would have replaced a
// measured sentence with an unmeasured lie. The rule survived the move by being
// measured again; tools/round-share-check.js opens all thirteen links and checks
// that they cover the field exactly once.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADMIN = read('admin.html');
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
// Two-word names, because a row shows first names only - a list of surnames
// would not tell an organizer which link is which.
const roster = n => Array.from({ length: n }, (_, i) =>
    ({ id: 101 + i, name: 'Golfer' + (i + 1) + ' Lastname', hcp: '0' }));

// The ready screen, rendered from a saved round the way the page renders it.
function ready(n) {
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js'],
        { search: '?game=RRDY' });
    vm.runInContext('alert = function () {}; currentMode = "RRDY";', sb);
    vm.runInContext('renderRoundReady(' + JSON.stringify({
        eventName: 'Weekend Round', courseName: 'Caledonia', gameFormat: 'stroke',
        players: roster(n), courseData: CD, scores: {} }) + ');', sb);
    return sb;
}
const linksHtml = sb => vm.runInContext(
    '(function(){var e=document.getElementById("rr-links-box");'
    + 'return e ? (e.innerHTML || "") : null;})()', sb);

describe('THE SETUP SCREEN NO LONGER OFFERS A LINK', () => {

    test('the share card is gone', () => {
        assert.ok(!/class="share-box"[^>]*>\s*<h3>📲/.test(ADMIN),
            'the invite card is still on the setup screen');
        assert.ok(!/id="qrcode"/.test(ADMIN), 'the QR mount survives');
        assert.ok(!/function generateQRCode/.test(ADMIN), 'the QR builder survives');
        assert.ok(!/function copyAppUrl/.test(ADMIN), 'the invite handler survives');
    });

    test('and the CDN script it needed is gone with it', () => {
        assert.ok(!/cdnjs\.cloudflare\.com/.test(ADMIN),
            'admin.html still fetches a third-party script at runtime');
    });

    test('tournament.html keeps its own QR — out of scope, deliberately', () => {
        assert.match(read('tournament.html'), /cdnjs\.cloudflare\.com.*qrcode/,
            'the Tournament QR was removed too; that was not this change');
    });

    test('the group scorekeeper box left the setup screen as well', () => {
        assert.ok(!/id="group-links-box"/.test(ADMIN),
            'the setup screen still lists links for a round that may not be saved');
    });
});

describe('THE READY SCREEN OFFERS A LINK, ON ARRIVAL', () => {

    test('links render without pressing anything', () => {
        const h = linksHtml(ready(4));
        assert.ok(h && h.length > 0, 'the ready screen shows no links until something is tapped');
    });

    test('there is no separate button to reveal them', () => {
        assert.ok(!/onclick="showRoundReadyLinks\(\)"/.test(ADMIN),
            'the links are still behind a tap most organizers will never make');
    });

    // THE BUG. One group used to get a sentence telling you to read out a code.
    test('ONE GROUP GETS ONE REAL LINK, not a sentence about a code', () => {
        const h = linksHtml(ready(4));
        assert.ok(!/round code itself works/i.test(h),
            'a four-ball is still told to read the code aloud');
        assert.match(h, /https:\/\/[^"']+index\.html\?game=RRDY&group=1/,
            'no copyable group link for a single group: ' + h.slice(0, 200));
        assert.match(h, /copyGroupLink\(/, 'there is nothing to copy it with');
    });

    [1, 2, 3, 4, 5, 8, 9, 12].forEach(n => {
        test(n + ' golfer(s): every group gets its own labelled link', () => {
            const h = linksHtml(ready(n));
            const urls = (h.match(/index\.html\?game=RRDY&group=\d+/g) || []);
            const expected = Math.max(1, Math.ceil(n / 4));
            assert.equal(urls.length, expected,
                'expected ' + expected + ' links for ' + n + ' golfers, got ' + urls.length);
            assert.equal(new Set(urls).size, urls.length, 'two groups share a link');
        });
    });

    test('each row names the group and who is in it', () => {
        const h = linksHtml(ready(9));
        assert.match(h, /Group 1/);
        assert.match(h, /Group 3/, 'the third group is missing');
        assert.match(h, /Golfer1/, 'a row does not say who the link is for');
        assert.match(h, /Golfer9/, 'the last group does not name its golfer');
        assert.ok(!/Lastname/.test(h), 'the rows print full names instead of first names');
    });

    test('every link is an https link, not this page’s own address', () => {
        [1, 4, 9].forEach(n => {
            const urls = (linksHtml(ready(n)).match(/https?:\/\/[^"']+/g) || []);
            assert.ok(urls.length > 0, n + ' golfers produced no URL at all');
            urls.forEach(u => assert.match(u, /^https:\/\//,
                n + ' golfers produced a link nobody can open: ' + u));
        });
    });
});

describe('THE NOTE KEEPS ITS BINDING TO WHAT THE LINK PERMITS', () => {

    // THE SENTENCE CHANGED BECAUSE THE LINK CHANGED - see the file header. What is
    // preserved is the rule: say what the link permits, and let a browser check it.
    // Pulled out of the rendered markup as a string. mini-dom does not parse
    // innerHTML into child nodes, so getElementById cannot reach a node the page
    // just rendered - CLAUDE.md records that limit. The cold check reads the real
    // element in Chrome.
    const noteText = n => {
        const m = /id="rr-links-note"[^>]*>([^<]*)</.exec(linksHtml(ready(n)) || '');
        return m ? m[1] : '';
    };

    test('the rule lives in the shared file, once, and both surfaces call it', () => {
        assert.match(read('grouping.js'), /function groupLinkNoteText/,
            'the one measured piece of copy in the app was deleted with the card');
        assert.ok(!/function groupLinkNoteText/.test(ADMIN),
            'admin.html has its own copy of the rule, so the two can drift');
        assert.match(ADMIN, /groupLinkNoteText\(/, 'the ready screen does not use the rule');
        assert.match(read('sidematches.html'), /groupLinkNoteText\(/,
            'the Cup handoff does not use the rule');
    });

    [1, 2, 3, 4].forEach(n => {
        test(n + ' golfer(s): the link is writable, and it is called a scorekeeper link', () => {
            const t = noteText(n);
            assert.match(t, /scorekeeper/i, 'reads: ' + JSON.stringify(t));
            assert.ok(!/read-only link/i.test(t),
                'a fully writable link is described as read-only: ' + JSON.stringify(t));
        });
    });

    [5, 8, 9, 12].forEach(n => {
        test(n + ' golfers: it says a link is scoped to its own group', () => {
            const t = noteText(n);
            assert.match(t, /own link|their own/i, 'reads: ' + JSON.stringify(t));
            assert.match(t, /that group|nobody else/i,
                'nothing says the link covers only its own group: ' + JSON.stringify(t));
            // A group link is fully writable for the card it shows - 76 of 76 at
            // eight golfers, 19 of 19 for a single. Calling it read-only would be
            // the v72 wording carried across unexamined onto a different link.
            assert.ok(!/read-only/i.test(t),
                'a fully writable group link is described as read-only: ' + JSON.stringify(t));
        });
    });

    test('the switch is the same count index.html actually uses', () => {
        assert.match(read('index.html'), /const isMultiGroupRound = players\.length > 4;/,
            'index.html moved the gate; the note now describes the wrong rule');
        assert.notEqual(noteText(4), noteText(5),
            'four and five golfers get the same sentence, so the note is not measuring anything');
    });
});

describe('THE RYDER CUP HANDOFF GETS THE SAME SURFACE', () => {

    // A Cup round skips the ready screen entirely - saveSettings sends it straight
    // to sidematches.html?setup=ryder - so without this a Cup organizer never sees
    // a link at all. Same failure, one level over.
    const SM = read('sidematches.html');

    test('the Cup arrival can show group links', () => {
        assert.match(SM, /id="rc-group-links"/,
            'a Cup organizer lands on a screen with no way to share the round');
    });

    test('it builds them from the shared URL rule', () => {
        assert.match(SM, /shareBaseUrl\(\)/,
            'the Cup links are built from this page’s own location');
        assert.match(SM, /<script src="product-links\.js"><\/script>/,
            'sidematches.html builds links without loading the rule');
    });
});
