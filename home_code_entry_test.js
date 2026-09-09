// ============================================================================
// TYPING A CODE TAKES YOU TO THE ROUND, NOT INTO THE ORGANIZER'S WIZARD
//
// v68 removed the home screen's code field on the evidence that golfers arrive on
// a link. That is still true, and the field is smaller than it was. What is NOT
// being restored is where it used to go.
//
// joinRoom() sent you to admin.html?game=CODE. Measured at four golfers and at
// nine, that lands on WIZARD STEP 7 - the organizer's Review - with a visible
// "Save & Start Round" button. A golfer who types the code their mate read out
// arrived holding the control that rewrites the round. Restoring joinRoom
// verbatim would restore that, so this is a new function with a different name
// and a different destination.
//
// WHAT A BARE CODE ACTUALLY GETS YOU, measured on the same rounds:
//
//   4 golfers   index.html?game=CODE   76 of 76 score inputs editable
//   9 golfers   index.html?game=CODE   171 inputs, 0 editable, spectator badge
//
// So above four golfers a typed code is READ-ONLY, and it cannot be otherwise: a
// group lives in the URL as &group=N and a code carries none. Inventing one would
// hand scorekeeper rights over somebody else's foursome to anyone who knows the
// code. The field therefore ALSO ACCEPTS A PASTED LINK and keeps the group that
// link carries - which is the real case, because what an organizer sends is a URL.
//
// The note saying so is copy that describes behaviour, so it is behaviour:
// tools/code-entry-check.js types a code on a four-golfer round and on a
// nine-golfer round and counts what each one can actually edit.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const ADM = read('admin.html');

// THE TWO ORIGINS THIS PAGE IS ACTUALLY SERVED FROM.
//
// THIS FIXTURE IS WHY A REAL DEFECT WENT UNCAUGHT. It hardcoded the https origin -
// the one origin where the bug cannot happen - so every assertion below passed while
// the app shipped a version that threw the golfer into Safari. openRoundByCode()
// builds its destination through shareBaseUrl(), whose whole job is to return the
// CANONICAL web origin when the page is not itself on http(s). On https it returns
// this page's own origin and the destination is same-origin. On capacitor://localhost
// it returns https://golf-app-5a5.pages.dev/ - a different origin, which Capacitor
// cancels and hands to the system browser.
//
// Every journey below now runs under BOTH, so the failing branch is reachable.
const ORIGINS = [
    { name: 'the web', href: 'https://golf-app-5a5.pages.dev/admin.html' },
    { name: 'the iOS app', href: 'capacitor://localhost/admin.html' },
];

// The lobby, with nothing typed - the state a golfer arrives in.
//
// EVERY FIELD shareBaseUrl() READS IS SET, not just href. The sandbox's location is
// a stub: assigning .href leaves .origin undefined and .pathname at its default, and
// shareBaseUrl reads origin first and pathname second. A fixture that sets only href
// silently tests the stub's defaults instead of the origin it named.
function lobby(href) {
    const at = href || ORIGINS[0].href;
    const isWeb = /^https?:/i.test(at);
    const u = isWeb ? new URL(at) : null;
    const loc = {
        href: at,
        origin: isWeb ? u.origin : 'capacitor://localhost',
        pathname: isWeb ? u.pathname : '/admin.html',
    };
    const sb = loadHtmlInlineScript('admin.html', ['course-data.js', 'action-model.js']);
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
            try { return new URL(raw, at).href; }
            catch (e) { return raw; }
        },
        said: () => vm.runInContext('window.__said || null', sb),
    };
}

describe('THE CONTROL IS BACK, AND IT IS ONE ROW', () => {

    test('there is an input and a button', () => {
        assert.match(ADM, /id="join-code-input"/, 'no code field on the home screen');
        assert.match(ADM, /onclick="openRoundByCode\(\)"/, 'no button to open it with');
    });

    test('it is NOT the full-width pair that was removed', () => {
        const at = ADM.indexOf('id="join-code-row"');
        assert.ok(at > -1, 'the row wrapper is missing');
        const row = ADM.slice(at - 200, at + 700);
        assert.match(row, /display:\s*flex/, 'the field and button are not on one row');
        assert.ok(!/class="btn-outline"[^>]*style="[^"]*width:\s*100%/.test(row),
            'the button is full width again');
    });

    test('but both are still a real touch target', () => {
        const rule = sel => {
            const at = ADM.indexOf(sel + ' {');
            return at === -1 ? '' : ADM.slice(at, ADM.indexOf('}', at));
        };
        // ID-SCOPED, because input[type="text"] { width:100% } and .btn-outline both
        // outrank a bare class from further down the sheet. With plain classes the
        // button took the row and the field rendered 22px wide - invisible to this
        // suite, which has no layout, and caught by tools/home-screen-check.js.
        ['#join-code-row .join-code-input', '#join-code-row .join-code-btn'].forEach(sel => {
            const m = /min-height:\s*(\d+)px/.exec(rule(sel));
            assert.ok(m && Number(m[1]) >= 44, sel + ' is below a 44px touch target');
        });
    });

    test('it sits below Resume, not between the two tiles', () => {
        const tiles = ADM.indexOf('class="home-widgets"');
        const resume = ADM.indexOf('id="resume-container"');
        const row = ADM.indexOf('id="join-code-row"');
        assert.ok(tiles > -1 && resume > -1 && row > -1);
        assert.ok(row > tiles, 'the code row splits the two tiles');
        assert.ok(row > resume, 'the code row is above Resume');
    });
});

ORIGINS.forEach(O => describe('IT OPENS THE ROUND, NOT THE WIZARD — on ' + O.name, () => {

    // THE DEFECT THAT IS NOT BEING RESTORED.
    test('a typed code goes to the scorecard', () => {
        const l = lobby(O.href);
        l.type('AB12CD'); l.go();
        assert.match(l.href(), /index\.html\?game=AB12CD/,
            'a golfer who types a code lands somewhere else: ' + l.href());
    });

    test('and never to admin.html, which opens the organizer’s Review', () => {
        const l = lobby(O.href);
        l.type('AB12CD'); l.go();
        assert.ok(!/admin\.html\?game=/.test(l.href()),
            'this is where joinRoom() used to go, holding Save & Start Round');
    });

    test('the old function is not back under its old name', () => {
        assert.ok(!/function joinRoom/.test(ADM),
            'joinRoom is back, and it still points at the wizard');
    });

    test('a lower-case code still opens', () => {
        const l = lobby(O.href);
        l.type('ab12cd'); l.go();
        assert.match(l.href(), /game=AB12CD/, 'codes are shown upper-case everywhere');
    });

    test('stray spaces do not stop it', () => {
        const l = lobby(O.href);
        l.type('  ab12cd  '); l.go();
        assert.match(l.href(), /game=AB12CD/);
    });

    // Legacy 4-character codes still exist on saved rounds.
    test('a legacy four-character code still opens', () => {
        const l = lobby(O.href);
        l.type('R4HH'); l.go();
        assert.match(l.href(), /game=R4HH/);
    });

    // THE ASSERTION THIS FILE WAS MISSING. A destination that leaves the app's own
    // origin is cancelled by Capacitor and opened in Safari - so on the wrapper this
    // is not a cosmetic difference, it is the golfer being ejected from the app on
    // the commonest way into a round.
    test('the destination never leaves the origin the page is served from', () => {
        const l = lobby(O.href);
        l.type('AB12CD'); l.go();
        const dest = l.href();
        if (/^https?:/i.test(O.href)) {
            assert.ok(dest.startsWith(new URL(O.href).origin),
                'a web deploy sent the golfer to another origin: ' + dest);
        } else {
            assert.ok(!/^https?:\/\//i.test(dest),
                '\ninside the app the destination left capacitor://localhost:\n    '
                + dest + '\n  Capacitor cancels that and hands it to Safari.');
        }
    });
}));

ORIGINS.forEach(O => describe('IT ACCEPTS THE LINK AN ORGANIZER ACTUALLY SENDS — on ' + O.name, () => {

    test('a pasted group link keeps its group', () => {
        const l = lobby(O.href);
        l.type('https://golf-app-5a5.pages.dev/index.html?game=JLRL4H&group=2');
        l.go();
        assert.match(l.href(), /game=JLRL4H/);
        assert.match(l.href(), /group=2/,
            'pasting the link the organizer sent drops the group it carried');
    });

    test('a pasted link with no group does not gain one', () => {
        const l = lobby(O.href);
        l.type('https://golf-app-5a5.pages.dev/index.html?game=JLRL4H');
        l.go();
        assert.ok(!/group=/.test(l.href()),
            'a group was invented, handing over somebody else’s card');
    });

    // THE PERMISSION LINE. A code carries no group, so none may be added to it.
    test('a bare code never acquires a group', () => {
        const l = lobby(O.href);
        l.type('JLRL4H'); l.go();
        assert.ok(!/group=/.test(l.href()),
            'typing a code granted scorekeeper rights over a foursome');
    });

    // The pasted link is the case the note under the field actually recommends, so
    // it gets the same origin assertion as the typed code.
    test('a pasted link does not leave the origin either', () => {
        const l = lobby(O.href);
        l.type('https://golf-app-5a5.pages.dev/index.html?game=JLRL4H&group=2');
        l.go();
        const dest = l.href();
        if (/^https?:/i.test(O.href)) {
            assert.ok(dest.startsWith(new URL(O.href).origin), dest);
        } else {
            assert.ok(!/^https?:\/\//i.test(dest),
                'pasting the organizer link inside the app ejected the golfer: ' + dest);
        }
    });
}));

describe('IT REFUSES WHAT IT CANNOT OPEN', () => {

    test('an empty field says so and goes nowhere', () => {
        const l = lobby();
        const before = l.href();
        l.type('   '); l.go();
        assert.equal(l.href(), before, 'an empty code navigated somewhere');
        assert.match(String(l.said() || ''), /code/i, 'it failed silently');
    });

    test('one character is not a code', () => {
        const l = lobby();
        const before = l.href();
        l.type('A'); l.go();
        assert.equal(l.href(), before);
    });
});

describe('THE NOTE SAYS WHAT A TYPED CODE ACTUALLY GIVES YOU', () => {

    // Read off the note ELEMENT, not a window of characters around the row: a slice
    // wide enough to catch the sentence also catches the comments explaining it, so
    // it would pass on a page that rendered no note at all.
    const note = () => {
        const at = ADM.indexOf('id="join-code-note"');
        assert.ok(at > -1, 'there is no note beside the field');
        return ADM.slice(ADM.indexOf('>', at) + 1, ADM.indexOf('</p>', at));
    };

    test('it warns that a bare code is read-only on a bigger round', () => {
        assert.match(note(), /read-only/i,
            'nothing tells a golfer a typed code will not let them score');
        assert.match(note(), /link/i,
            'it does not point them at the link that would');
    });

    // The repo has shipped this once already: a \\uXXXX escape resolves inside a JS
    // string and prints literally in raw HTML markup.
    test('no unresolved escapes in the markup a golfer reads', () => {
        const at = ADM.indexOf('id="join-code-row"');
        const block = ADM.slice(at, ADM.indexOf('</p>', at));
        assert.ok(!/\\u[0-9A-Fa-f]{4}/.test(block),
            'an escape sequence will print literally on screen: '
            + (/\\u[0-9A-Fa-f]{4}/.exec(block) || [''])[0]);
    });

    // Bound to index.html's own gate, the same way the share note is.
    test('and it describes the gate index.html actually uses', () => {
        assert.match(read('index.html'), /const isMultiGroupRound = players\.length > 4;/,
            'index.html moved the gate; this note now describes the wrong rule');
        assert.match(note(), /four/i,
            'the note does not name the count the gate uses');
    });
});
