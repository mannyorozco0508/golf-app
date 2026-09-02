// ============================================================================
// SAFE TEXT — user-supplied names render as TEXT, on every page
//
// WHY THIS MATTERS, AND WHAT IT IS NOT
//
// The security framing is the weaker half. Injecting markup requires the round
// code, and script execution in another golfer's browser buys an attacker nothing
// they cannot already do with that code - there are no accounts, no sessions and
// no PII beyond names and scores.
//
// The stronger half is CORRECTNESS. A golfer legitimately called
//
//     Bob <the Hammer>       rendered as nothing at all - the browser read an
//                            unknown tag and swallowed the name
//     Mike & Dave's Trip     survived only by luck
//
// so an ordinary group with an ordinary name saw a broken screen. That is what a
// TestFlight tester actually hits, and it is why every one of these tests checks
// that legitimate punctuation SURVIVES as well as that markup stays inert.
//
// ESCAPED AT THE OUTPUT BOUNDARY, NEVER IN STORAGE. Firebase keeps names exactly
// as typed. Nothing here rewrites stored data and nothing double-encodes history.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadJsFile, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const { escapeHtml } = loadJsFile('text-safe.js');

const PAGES = ['admin.html', 'index.html', 'leaderboard.html', 'settlement.html',
    'sidematches.html', 'skins.html', 'stats.html', 'trip.html'];

// Names golfers actually have. Every one must survive intact.
const REAL = ["O'Brien", 'José', 'A&B', 'Bob <the Hammer>', "Mike & Dave's Trip",
    'Anne-Marie', 'J.R.', 'Ødegaard', '山田', 'Müller-Schmidt'];

// Strings that must never become markup.
const HOSTILE = ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>',
    '"><svg onload=alert(1)>', '\'";alert(1);//', '</td><td>injected'];

// ---------------------------------------------------------------------------
describe('THE ESCAPER ITSELF', () => {
    test('all five characters, ampersand first', () => {
        assert.equal(escapeHtml('&'), '&amp;');
        assert.equal(escapeHtml('<'), '&lt;');
        assert.equal(escapeHtml('>'), '&gt;');
        assert.equal(escapeHtml('"'), '&quot;');
        assert.equal(escapeHtml("'"), '&#39;');
    });

    test('NEGATIVE CONTROL — the ampersand is escaped first, or O\'Brien breaks', () => {
        // Escaping the apostrophe before the ampersand would produce O&amp;#39;Brien,
        // which renders the entity literally on screen.
        assert.equal(escapeHtml("O'Brien"), 'O&#39;Brien');
        assert.ok(!escapeHtml("O'Brien").includes('&amp;#39;'));
    });

    test('escaping is idempotent in effect — no double-encoding of history', () => {
        // A name stored before this existed may already contain an ampersand.
        // Escaping once produces &amp;; the browser renders that as a single &.
        assert.equal(escapeHtml('A&B'), 'A&amp;B');
        // And the RENDERED text is what matters, so decode and compare.
        assert.equal(decode(escapeHtml('A&B')), 'A&B');
    });

    test('null and undefined become empty, not the strings "null"/"undefined"', () => {
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
    });

    test('Unicode passes through untouched', () => {
        ['José', 'Ødegaard', '山田', 'Müller-Schmidt', '🏌️'].forEach(n => {
            assert.equal(escapeHtml(n), n, `${n} must not be mangled`);
        });
    });

    test('numbers and other types are stringified safely', () => {
        assert.equal(escapeHtml(5), '5');
        assert.equal(escapeHtml(0), '0');
    });
});

// What a browser would show for an escaped string.
function decode(s) {
    return String(s).replace(/&amp;/g, '\u0000AMP\u0000')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\u0000AMP\u0000/g, '&');
}

// ---------------------------------------------------------------------------
describe('LEGITIMATE NAMES RENDER CORRECTLY', () => {
    REAL.forEach(name => {
        test(`"${name}" survives escaping and reads back identically`, () => {
            const out = escapeHtml(name);
            assert.equal(decode(out), name, 'the visible text must be unchanged');
            assert.ok(!/<[a-z]/i.test(out), 'no live tag may remain');
        });
    });

    test('A&B does not display as A&amp;B', () => {
        assert.equal(decode(escapeHtml('A&B')), 'A&B');
    });

    test('<Bob> displays as <Bob> and does not disappear', () => {
        const out = escapeHtml('<Bob>');
        assert.equal(out, '&lt;Bob&gt;');
        assert.equal(decode(out), '<Bob>');
    });
});

// ---------------------------------------------------------------------------
describe('HOSTILE MARKUP IS INERT', () => {
    HOSTILE.forEach(payload => {
        test(`${payload.slice(0, 28)}… cannot become markup`, () => {
            const out = escapeHtml(payload);
            assert.ok(!/<img|<script|<svg|<\/td/i.test(out), 'no live tag survives');
            assert.ok(!out.includes('"'), 'no bare quote can close an attribute');
            assert.ok(!out.includes("'"), 'no bare apostrophe can close a JS string');
            assert.equal(decode(out), payload, 'but it still READS as what was typed');
        });
    });

    test('an attribute-breaking payload stays inside its attribute', () => {
        const attr = `value="${escapeHtml('"><img src=x onerror=alert(1)>')}"`;
        assert.equal((attr.match(/"/g) || []).length, 2, 'exactly the two delimiters');
        assert.ok(!/<img/.test(attr));
    });
});

// ---------------------------------------------------------------------------
describe('EVERY PAGE LOADS THE ONE HELPER', () => {
    PAGES.forEach(p => {
        test(`${p} loads text-safe.js`, () => {
            assert.match(read(p), /<script src="text-safe\.js"><\/script>/,
                `${p} renders user names and must load the escaper`);
        });
    });

    test('there is exactly one implementation, and it is shared', () => {
        assert.equal((read('text-safe.js').match(/function escapeHtml/g) || []).length, 1);
        PAGES.forEach(p => {
            assert.ok(!/function escapeHtml/.test(read(p)),
                `${p} must not carry its own copy of the escaper`);
        });
    });

    test('it ships in both products and is precached', () => {
        assert.match(read('sync-mobile-web.js'), /'text-safe\.js',/, 'declared in SHARED_SHELL');
        assert.match(read('sw.js'), /'\.\/text-safe\.js',/, 'precached by the service worker');
    });
});

// ---------------------------------------------------------------------------
describe('NO RAW NAME REACHES MARKUP, PAGE BY PAGE', () => {
    // Sites that are NOT html: textContent assignments and the plain text handed to
    // navigator.share or the clipboard. Escaping those would corrupt what the golfer
    // copies - "Mike &amp; Dave's Trip" in a text message helps nobody.
    const TEXT_ONLY = {
        'admin.html': 1,        // addDiv.textContent
        'leaderboard.html': 2,  // share title + message
        'trip.html': 9,         // recap text block, share title, textContent header
    };

    PAGES.forEach(p => {
        test(`${p} has no unescaped name in HTML output`, () => {
            const raw = (read(p).match(/\$\{[a-zA-Z_.]*(?:name|Name)\}/g) || []).length;
            const allowed = TEXT_ONLY[p] || 0;
            assert.equal(raw, allowed,
                `${p}: ${raw} raw interpolations, ${allowed} of which are plain-text by design`);
        });
    });

    test('the plain-text exemptions really are plain text', () => {
        // If one of these ever becomes innerHTML, the count above stops being a
        // safe exemption - so the shape is pinned here too.
        const trip = read('trip.html');
        assert.match(trip, /let text = `\u{1F690} \$\{tripData\.name\}/u, 'recap builds a STRING');
        assert.match(trip, /navigator\.share\(\{ title: `\$\{tripData\.name\} Recap`/, 'share title');
        assert.match(trip, /manage-trip-name'\)\.textContent = `\u{1F690} \$\{tripData\.name\}`/u, 'textContent');
        assert.match(read('admin.html'), /addDiv\.textContent = /, 'textContent');
    });
});

// ---------------------------------------------------------------------------
describe('THE INLINE HANDLER CARRIES NO USER TEXT', () => {
    const trip = read('trip.html');

    test('the course picker passes an id, not a name', () => {
        assert.match(trip, /onclick="selectRoundCourseById\(\$\{i\}, '\$\{escapeHtml\(String\(item\.id\)/,
            'a name interpolated into JavaScript syntax is one apostrophe from broken');
        assert.ok(!/selectRoundCourse\(\$\{i\}, '\$\{item\.id\}', '\$\{safeName\}'\)/.test(trip),
            'the old hand-escaped name argument must not come back');
    });

    test('the hand-rolled safeName escape is gone', () => {
        assert.ok(!/const safeName = item\.name\.replace/.test(trip),
            'replacing quotes by hand is not JavaScript-context escaping');
    });

    test('the id is stripped to app-controlled characters', () => {
        assert.match(trip, /replace\(\/\[\^A-Za-z0-9_-\]\/g, ''\)/,
            'course ids are the app\'s own keys; anything else is not an id');
    });

    test('the lookup returns the real name, so selection still works', () => {
        assert.match(trip, /function selectRoundCourseById\(i, id\)/);
        assert.match(trip, /selectRoundCourse\(i, id, found \? found\.name : ''\)/);
    });
});

// ---------------------------------------------------------------------------
describe('THE ATTRIBUTE CONTEXT IS CLOSED', () => {
    test('the player-name input escapes its value', () => {
        assert.match(read('admin.html'), /value="\$\{escapeHtml\(name\)\}"/,
            'a bare quote in a name would otherwise end the attribute');
    });

    test('a quote in a name cannot escape the input', () => {
        const v = `value="${escapeHtml('" onfocus=alert(1) x="')}"`;
        assert.ok(!/onfocus=/.test(decode(v).replace(/^value="|"$/g, '')) || !/" onfocus/.test(v));
        assert.equal((v.match(/"/g) || []).length, 2);
    });
});

// ---------------------------------------------------------------------------
describe('NOTHING ELSE MOVED', () => {
    test('the scoring engines are untouched by this batch', () => {
        assert.match(read('money-engine.js'), /dotVal \* \(n \* units - totalUnits\)/);
        assert.match(read('index.html'), /withNavAnchor\(renderHoleView\)/, 'Prev/Next anchor');
        assert.match(read('index.html'), /function renderDotsWidgetHtml/, 'Live Dots');
        assert.match(read('index.html'), /const TICKER_MOUNTS = \['live-ticker-mount', 'fc-ticker-mount'\]/);
        assert.match(read('index.html'), /class="cell-dots"/, 'score-box geometry');
    });

    test('the security rules were not weakened to make this easier', () => {
        const rules = read('database.rules.json');
        assert.match(rules, /newData\.isNumber\(\) && newData\.val\(\) >= 0 && newData\.val\(\) <= 100000/);
        assert.match(rules, /\$scoreKey\.matches/);
    });
});// Names golfers actually have. Every one must survive intact.
const REAL = ["O'Brien", 'José', 'A&B', 'Bob <the Hammer>', "Mike & Dave's Trip",
    'Anne-Marie', 'J.R.', 'Ødegaard', '山田', 'Müller-Schmidt'];

// Strings that must never become markup.
const HOSTILE = ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>',
    '"><svg onload=alert(1)>', '\'";alert(1);//', '</td><td>injected'];

// ---------------------------------------------------------------------------
describe('THE ESCAPER ITSELF', () => {
    test('all five characters, ampersand first', () => {
        assert.equal(escapeHtml('&'), '&amp;');
        assert.equal(escapeHtml('<'), '&lt;');
        assert.equal(escapeHtml('>'), '&gt;');
        assert.equal(escapeHtml('"'), '&quot;');
        assert.equal(escapeHtml("'"), '&#39;');
    });

    test('NEGATIVE CONTROL — the ampersand is escaped first, or O\'Brien breaks', () => {
        // Escaping the apostrophe before the ampersand would produce O&amp;#39;Brien,
        // which renders the entity literally on screen.
        assert.equal(escapeHtml("O'Brien"), 'O&#39;Brien');
        assert.ok(!escapeHtml("O'Brien").includes('&amp;#39;'));
    });

    test('escaping is idempotent in effect — no double-encoding of history', () => {
        // A name stored before this existed may already contain an ampersand.
        // Escaping once produces &amp;; the browser renders that as a single &.
        assert.equal(escapeHtml('A&B'), 'A&amp;B');
        // And the RENDERED text is what matters, so decode and compare.
        assert.equal(decode(escapeHtml('A&B')), 'A&B');
    });

    test('null and undefined become empty, not the strings "null"/"undefined"', () => {
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
    });

    test('Unicode passes through untouched', () => {
        ['José', 'Ødegaard', '山田', 'Müller-Schmidt', '🏌️'].forEach(n => {
            assert.equal(escapeHtml(n), n, `${n} must not be mangled`);
        });
    });

    test('numbers and other types are stringified safely', () => {
        assert.equal(escapeHtml(5), '5');
        assert.equal(escapeHtml(0), '0');
    });
});

// What a browser would show for an escaped string.
function decode(s) {
    return String(s).replace(/&amp;/g, '\u0000AMP\u0000')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\u0000AMP\u0000/g, '&');
}

// ---------------------------------------------------------------------------
describe('LEGITIMATE NAMES RENDER CORRECTLY', () => {
    REAL.forEach(name => {
        test(`"${name}" survives escaping and reads back identically`, () => {
            const out = escapeHtml(name);
            assert.equal(decode(out), name, 'the visible text must be unchanged');
            assert.ok(!/<[a-z]/i.test(out), 'no live tag may remain');
        });
    });

    test('A&B does not display as A&amp;B', () => {
        assert.equal(decode(escapeHtml('A&B')), 'A&B');
    });

    test('<Bob> displays as <Bob> and does not disappear', () => {
        const out = escapeHtml('<Bob>');
        assert.equal(out, '&lt;Bob&gt;');
        assert.equal(decode(out), '<Bob>');
    });
});

// ---------------------------------------------------------------------------
describe('HOSTILE MARKUP IS INERT', () => {
    HOSTILE.forEach(payload => {
        test(`${payload.slice(0, 28)}… cannot become markup`, () => {
            const out = escapeHtml(payload);
            assert.ok(!/<img|<script|<svg|<\/td/i.test(out), 'no live tag survives');
            assert.ok(!out.includes('"'), 'no bare quote can close an attribute');
            assert.ok(!out.includes("'"), 'no bare apostrophe can close a JS string');
            assert.equal(decode(out), payload, 'but it still READS as what was typed');
        });
    });

    test('an attribute-breaking payload stays inside its attribute', () => {
        const attr = `value="${escapeHtml('"><img src=x onerror=alert(1)>')}"`;
        assert.equal((attr.match(/"/g) || []).length, 2, 'exactly the two delimiters');
        assert.ok(!/<img/.test(attr));
    });
});

// ---------------------------------------------------------------------------
describe('EVERY PAGE LOADS THE ONE HELPER', () => {
    PAGES.forEach(p => {
        test(`${p} loads text-safe.js`, () => {
            assert.match(read(p), /<script src="text-safe\.js"><\/script>/,
                `${p} renders user names and must load the escaper`);
        });
    });

    test('there is exactly one implementation, and it is shared', () => {
        assert.equal((read('text-safe.js').match(/function escapeHtml/g) || []).length, 1);
        PAGES.forEach(p => {
            assert.ok(!/function escapeHtml/.test(read(p)),
                `${p} must not carry its own copy of the escaper`);
        });
    });

    test('it ships in both products and is precached', () => {
        assert.match(read('sync-mobile-web.js'), /'text-safe\.js',/, 'declared in SHARED_SHELL');
        assert.match(read('sw.js'), /'\.\/text-safe\.js',/, 'precached by the service worker');
    });
});

// ---------------------------------------------------------------------------
describe('NO RAW NAME REACHES MARKUP, PAGE BY PAGE', () => {
    // Sites that are NOT html: textContent assignments and the plain text handed to
    // navigator.share or the clipboard. Escaping those would corrupt what the golfer
    // copies - "Mike &amp; Dave's Trip" in a text message helps nobody.
    const TEXT_ONLY = {
        'admin.html': 1,        // addDiv.textContent
        'leaderboard.html': 2,  // share title + message
        'trip.html': 9,         // recap text block, share title, textContent header
    };

    PAGES.forEach(p => {
        test(`${p} has no unescaped name in HTML output`, () => {
            const raw = (read(p).match(/\$\{[a-zA-Z_.]*(?:name|Name)\}/g) || []).length;
            const allowed = TEXT_ONLY[p] || 0;
            assert.equal(raw, allowed,
                `${p}: ${raw} raw interpolations, ${allowed} of which are plain-text by design`);
        });
    });

    test('the plain-text exemptions really are plain text', () => {
        // If one of these ever becomes innerHTML, the count above stops being a
        // safe exemption - so the shape is pinned here too.
        const trip = read('trip.html');
        assert.match(trip, /let text = `\u{1F9F3} \$\{tripData\.name\}/u, 'recap builds a STRING');
        assert.match(trip, /navigator\.share\(\{ title: `\$\{tripData\.name\} Recap`/, 'share title');
        assert.match(trip, /manage-trip-name'\)\.textContent = `\u{1F9F3} \$\{tripData\.name\}`/u, 'textContent');
        assert.match(read('admin.html'), /addDiv\.textContent = /, 'textContent');
    });
});

// ---------------------------------------------------------------------------
describe('THE INLINE HANDLER CARRIES NO USER TEXT', () => {
    const trip = read('trip.html');

    test('the course picker passes an id, not a name', () => {
        assert.match(trip, /onclick="selectRoundCourseById\(\$\{i\}, '\$\{escapeHtml\(String\(item\.id\)/,
            'a name interpolated into JavaScript syntax is one apostrophe from broken');
        assert.ok(!/selectRoundCourse\(\$\{i\}, '\$\{item\.id\}', '\$\{safeName\}'\)/.test(trip),
            'the old hand-escaped name argument must not come back');
    });

    test('the hand-rolled safeName escape is gone', () => {
        assert.ok(!/const safeName = item\.name\.replace/.test(trip),
            'replacing quotes by hand is not JavaScript-context escaping');
    });

    test('the id is stripped to app-controlled characters', () => {
        assert.match(trip, /replace\(\/\[\^A-Za-z0-9_-\]\/g, ''\)/,
            'course ids are the app\'s own keys; anything else is not an id');
    });

    test('the lookup returns the real name, so selection still works', () => {
        assert.match(trip, /function selectRoundCourseById\(i, id\)/);
        assert.match(trip, /selectRoundCourse\(i, id, found \? found\.name : ''\)/);
    });
});

// ---------------------------------------------------------------------------
describe('THE ATTRIBUTE CONTEXT IS CLOSED', () => {
    test('the player-name input escapes its value', () => {
        assert.match(read('admin.html'), /value="\$\{escapeHtml\(name\)\}"/,
            'a bare quote in a name would otherwise end the attribute');
    });

    test('a quote in a name cannot escape the input', () => {
        const v = `value="${escapeHtml('" onfocus=alert(1) x="')}"`;
        assert.ok(!/onfocus=/.test(decode(v).replace(/^value="|"$/g, '')) || !/" onfocus/.test(v));
        assert.equal((v.match(/"/g) || []).length, 2);
    });
});

// ---------------------------------------------------------------------------
describe('NOTHING ELSE MOVED', () => {
    test('the scoring engines are untouched by this batch', () => {
        assert.match(read('money-engine.js'), /dotVal \* \(n \* units - totalUnits\)/);
        assert.match(read('index.html'), /withNavAnchor\(renderHoleView\)/, 'Prev/Next anchor');
        assert.match(read('index.html'), /function renderDotsWidgetHtml/, 'Live Dots');
        assert.match(read('index.html'), /const TICKER_MOUNTS = \['live-ticker-mount', 'fc-ticker-mount'\]/);
        assert.match(read('index.html'), /class="cell-dots"/, 'score-box geometry');
    });

    test('the security rules were not weakened to make this easier', () => {
        const rules = read('database.rules.json');
        assert.match(rules, /newData\.isNumber\(\) && newData\.val\(\) >= 0 && newData\.val\(\) <= 100000/);
        assert.match(rules, /\$scoreKey\.matches/);
    });
});
