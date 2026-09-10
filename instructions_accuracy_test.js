// ============================================================================
// THE GUIDE MUST NOT SEND A GOLFER LOOKING FOR A BUTTON THAT IS NOT THERE.
//
// instructions.html is the one page that describes every other page. It is
// STATIC MARKUP - its only <script> is a theme toggle and goBack() - so it
// cannot go stale loudly. It goes stale in silence, while the pages it
// describes move underneath it.
//
// Measured today, it tells a golfer to tap three controls that do not exist,
// describes a QR code Consumer removed, and states a code length that has been
// wrong since codes went from four characters to six.
//
// ============================================================================
// WHAT THIS FILE CAN AND CANNOT DO - READ BEFORE ADDING TO IT
// ============================================================================
//
// MOST OF THIS PAGE CANNOT BE GUARDED AT ALL, and pretending otherwise would
// be worse than leaving it alone. "Lowest total wins", "the format most rounds
// start from", "Points awarded per hole based on your score vs. par" - these
// are prose with no machine-checkable referent. No test can know whether they
// are true. This file therefore guards exactly two things that ARE checkable:
//
//   A. NAMED THINGS MUST EXIST. Every UI string the guide quotes must appear
//      in a real page. A guide that names a button is making a checkable
//      claim; a guide that describes a feeling is not.
//   B. STATED NUMBERS MUST MATCH THE CODE. A number in prose is exactly the
//      kind of fact that goes stale in silence, and the code that owns it can
//      be read.
//
// DELIBERATELY NOT GUARDED: THE SETTLE SCOPE SENTENCE.
//
// Line 209 describes the Settle page as "the round's main format and side
// games", omitting Side Matches - on a page that renders a SIDE MATCHES card
// and a payout line. It is false and it gets FIXED, not guarded, and that is a
// decision rather than an oversight.
//
// The trip.html guard for the same defect class works by a LOCATION exemption:
// the true sentence is built at runtime inside <script>, the guard reads markup
// only, so the true sentence is exempt by construction while any hand-written
// one is caught. THAT TRICK CANNOT TRANSFER HERE. This page has no runtime to
// hide a true sentence in; everything in it is markup by definition, so there
// is no "inside" for the exemption to point at.
//
// The only way to make that one sentence structurally impossible would be to
// give a static document a script dependency and render the description from
// TRIP_TOTAL_INCLUDES - a runtime, a load-order concern and a new coupling, for
// ONE SENTENCE. Not worth it. So it is corrected by hand and it can go stale
// again, and this comment is the honest record of that trade rather than a
// vocabulary heuristic dressed up as the same protection.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const GUIDE = 'instructions.html';

// Where a named thing may legitimately live. Comments are stripped: a control
// mentioned only in a comment does not exist for a golfer, and admin.html has a
// comment about the QR precisely BECAUSE the QR was removed.
const REAL_PAGES = ['index.html', 'admin.html', 'settlement.html', 'sidematches.html',
    'leaderboard.html', 'skins.html', 'stats.html', 'trip.html', 'shared.html'];

const read = (f) => (fs.existsSync(path.join(__dirname, f))
    ? decodeEscapes(fs.readFileSync(path.join(__dirname, f), 'utf8')) : '');

// LINE COMMENTS ARE STRIPPED BEFORE BLOCK COMMENTS, and the order is not
// cosmetic. trip.html:1028 contains the LINE comment "...writes nothing to
// tournaments/* and nothing to trips/*/tournaments/*...". Stripping block
// comments first, that `/*` opens a comment which closes 49,036 characters
// later at a real `*/`, swallowing a third of the file - and every control
// defined in that stretch then reports as MISSING.
//
// That is the dangerous direction for this guard: a false "missing" reads as
// "the guide names something that does not exist", and the obvious response is
// to delete a correct reference from the guide. Caught by checking two strings
// known to be real ("Counts toward trip", "Played fewer rounds") against the
// stripped text - which is what the sanity test below now pins.
function withoutComments(src) {
    return src.replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/^[ \t]*\/\/[^\n]*$/gm, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\s+/g, ' ');
}

const HAYSTACK = REAL_PAGES.map((p) => ({ page: p, src: withoutComments(read(p)) }));
const existsSomewhere = (s) => HAYSTACK.filter((h) => h.src.includes(s)).map((h) => h.page);

// The guide's markup, with its own script and comments gone.
function guideMarkup() {
    return read(GUIDE)
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ');
}

// A QUOTED UI STRING is <strong> emphasis or a double-quoted phrase THAT BEGINS
// WITH A CAPITAL. The capital is what separates a control name from emphasis:
// this page really contains <strong>only</strong> ("Send only that link") and
// "garbage" (scare quotes on the Dot Game), and neither is a thing to go
// looking for. That filter is tested below rather than assumed.
function quotedUiStrings() {
    const markup = guideMarkup();
    const out = [];
    [...markup.matchAll(/<strong>([^<]{2,80})<\/strong>/g)].forEach((m) => out.push(m[1]));
    const prose = markup.replace(/<[^>]+>/g, ' ');
    [...prose.matchAll(/["“]([^"“”]{2,60})["”]/g)].forEach((m) => out.push(m[1]));
    // A run like "Scorecard, Leaderboard, Action, Matches, Stats," names five
    // separate tabs, so it is split rather than searched for whole.
    const split = [];
    out.forEach((s) => s.split(',').forEach((part) => split.push(part.trim())));
    return [...new Set(split
        .map((s) => s.replace(/[.,;:]+$/, '').trim())
        .filter((s) => s.length > 1 && /^[A-Z]/.test(s)))];
}

// NAMED IN PROSE RATHER THAN QUOTED. Some things the guide names carry no
// markup - it said "The QR code and ... button on Home" in running prose, which
// the extractor above cannot see. Declared here rather than widening the
// extractor into ordinary nouns, which would flag half the page.
//
// EACH ENTRY IS CHECKED ONLY WHEN THE GUIDE ACTUALLY CONTAINS IT, and that
// condition is the whole point. Unconditional, this list asserts about strings
// the guide may no longer have - and it did: the QR sentence was DELETED,
// because no QR exists in Consumer, and the guard went on demanding that "QR
// code" be found in a real page. The only ways to satisfy it were to edit the
// test or to PUT THE FALSE SENTENCE BACK IN THE GUIDE. That is how a guard ends
// up demanding a lie be restored, and it is a worse failure than the one it was
// written to catch, because it pushes in the direction of the defect.
//
// So the rule is: if the guide names it, it must exist. If the guide stopped
// naming it, there is nothing to check.
const NAMED_IN_PROSE = ['QR code'];

const namedInProseActuallyUsed = () => {
    const prose = guideMarkup().replace(/<[^>]+>/g, ' ');
    return NAMED_IN_PROSE.filter((s) => prose.includes(s));
};

// NUMBERS THE GUIDE STATES, and the code that owns each. One of these passes
// today and one does not, on purpose: a table where every row is expected to
// fail would be satisfied by a guard that simply refuses everything.
const NUMBER_CLAIMS = [
    {
        what: 'the game code length',
        pattern: /(\d+)-character/g,
        actual: () => {
            const m = /var LENGTH = (\d+);/.exec(read('code-issuer.js'));
            return m ? Number(m[1]) : null;
        },
        source: 'code-issuer.js  var LENGTH'
    },
    {
        what: 'the default group size',
        pattern: /(\d+) per group by default/g,
        actual: () => {
            const m = /Math\.min\((\d+), remaining\)/.exec(read('grouping.js'));
            return m ? Number(m[1]) : null;
        },
        source: 'grouping.js  computeGroupSizes defaultSize'
    }
];

describe('THE EXTRACTOR KNOWS A CONTROL NAME FROM EMPHASIS', () => {

    test('it finds the controls the guide names', () => {
        const found = quotedUiStrings();
        assert.ok(found.length >= 8,
            `only ${found.length} quoted strings extracted - the extractor is broken and every `
            + 'assertion below would be vacuous: ' + JSON.stringify(found));
        // Examples must be controls the guide CURRENTLY names. This pinned
        // 'Start New Game', which the guide dropped when that button turned out
        // not to exist - so the sanity check failed for the opposite of its
        // reason: the extractor was fine, the example was stale.
        ['Game Day', 'Settle', 'Scorecard'].forEach((s) => assert.ok(found.includes(s),
            `the extractor missed "${s}", which the guide plainly quotes`));
    });

    test('it does NOT treat emphasis or scare quotes as control names', () => {
        // Both of these are really in the page. A guard that demanded a button
        // called "only" would be deleted within a week, and rightly.
        const found = quotedUiStrings();
        assert.ok(!found.includes('only'), 'the emphasised "only" is not a control');
        assert.ok(!found.includes('garbage'), 'the scare-quoted "garbage" is not a control');
    });

    test('a comma run is split into the tabs it names', () => {
        const found = quotedUiStrings();
        ['Scorecard', 'Leaderboard', 'Action', 'Matches', 'Stats'].forEach((s) =>
            assert.ok(found.includes(s), `"${s}" was not split out of the nav run`));
    });
});

describe('A. EVERY NAMED THING THE GUIDE QUOTES EXISTS IN A REAL PAGE', () => {

    test('the haystack loaded, so "missing" means missing', () => {
        // If REAL_PAGES failed to read, everything would look absent and the
        // failure list below would be noise.
        const total = HAYSTACK.reduce((n, h) => n + h.src.length, 0);
        assert.ok(total > 200000, `only ${total} chars of real pages loaded`);
        assert.ok(existsSomewhere('Settle').length > 0,
            'a control that certainly exists was not found - the search is broken');
        // THE COMMENT STRIPPER MUST NOT EAT REAL CODE. Both of these are real
        // strings in trip.html, on the far side of the line comment that
        // contains `tournaments/*`. If the stripper regresses to block-first
        // they vanish and this guard starts accusing the guide of naming
        // things that do exist.
        ['Counts toward trip', 'Played fewer rounds'].forEach((s) =>
            assert.ok(existsSomewhere(s).length > 0,
                `the comment stripper swallowed real code - "${s}" is in trip.html but the `
                + 'search cannot see it'));
        // AND IT MUST STILL STRIP. "Resume Game" appears in admin.html ONLY
        // inside // comments; if it reports as found, the stripping stopped
        // working and a control named only in a comment would pass.
        assert.equal(existsSomewhere('Resume Game').length, 0,
            'comment stripping is not working - a string that exists only in an admin.html '
            + 'comment is being treated as a real control');
    });

    test('no control the guide names is missing from the app', () => {
        const missing = quotedUiStrings().concat(namedInProseActuallyUsed())
            .filter((s) => existsSomewhere(s).length === 0);
        assert.deepEqual(missing, [],
            'the guide tells a golfer to look for something that does not exist. Either the '
            + 'control was renamed or removed and the guide was not updated, or the guide '
            + 'invented it.\n  ' + missing.join('\n  '));
    });
});

describe('B. EVERY NUMBER THE GUIDE STATES MATCHES THE CODE', () => {

    test('each claim can actually be read out of its source', () => {
        // A regex that stopped matching would make the comparison silently
        // vacuous, which is the failure mode this whole file is about.
        NUMBER_CLAIMS.forEach((c) => assert.notEqual(c.actual(), null,
            `could not read ${c.what} from ${c.source} - the comparison below would be vacuous`));
    });

    test('no stated number contradicts the code that owns it', () => {
        const prose = guideMarkup().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const wrong = [];
        NUMBER_CLAIMS.forEach((c) => {
            const real = c.actual();
            const hits = [...prose.matchAll(c.pattern)];
            assert.ok(hits.length > 0,
                `the guide no longer states ${c.what} anywhere - this row now guards nothing `
                + 'and should be removed rather than left passing');
            hits.forEach((m) => {
                if (Number(m[1]) !== real) {
                    wrong.push(`${c.what}: the guide says ${m[1]}, ${c.source} says ${real} `
                        + `(in "...${prose.slice(Math.max(0, m.index - 40), m.index + 40).trim()}...")`);
                }
            });
        });
        assert.deepEqual(wrong, [], 'the guide states a number the code contradicts.\n  '
            + wrong.join('\n  '));
    });
});

describe('THE ONE COPY ASSERTION ELSEWHERE MUST SURVIVE A FIX', () => {

    // kp_terminology_test.js:90 pins this line, and that file also refuses
    // "Greenie" anywhere golfer-facing. Both are asserted HERE too, so anyone
    // rewriting this guide sees the constraint in the file they are editing
    // rather than discovering it from a suite failure two files away.
    test('the Dot Game line kp_terminology_test.js pins is intact', () => {
        assert.match(read(GUIDE), /dots for KPs, sandies, birdies/,
            'kp_terminology_test.js:90 pins this exact phrase - a rewrite must keep it');
    });

    test('the guide still says KPs and never Greenie', () => {
        const prose = guideMarkup().replace(/<[^>]+>/g, ' ');
        assert.ok(!/greenie/i.test(prose),
            'a golfer must never be shown the word Greenie');
        assert.match(prose, /\bKPs?\b/, 'the guide must still name KPs');
    });
});
