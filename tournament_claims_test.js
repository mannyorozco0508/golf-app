// ============================================================================
// THE ORGANIZER'S SCREEN MUST NOT PROMISE A PROTECTION THAT DOES NOT EXIST.
//
// tournament.html tells a head pro, in normal type, beside the team links:
//
//     "Send each team ONLY their own link. They can only enter their own
//      team's scores."
//
// The first sentence is advice and is true. THE SECOND IS FALSE. Measured
// cold: ?tourney=X&team=1 gives 18 of 18 editable inputs on Team 1's card, and
// ?team=7 gives 18 of 18 on Team 7's. The team number is a URL parameter and
// nothing checks who is holding it. database.rules.json grants
// tournaments/$tourneyCode ".write": true, so the server enforces nothing
// either.
//
// This is the same class as the QR "always read-only" line in
// instructions.html: a sentence describing a protection the app does not have.
// It is worse here, because it is addressed to the person DECIDING HOW
// CAREFULLY TO SEND THE LINKS. An organizer who reads it stops being careful.
//
// ============================================================================
// HOW A "PROTECTION CLAIM" IS DRAWN, AND WHY THE REPLACEMENT SURVIVES IT
// ============================================================================
//
// THE LOCATION TRICK DOES NOT TRANSFER. On trip.html the true sentence is
// BUILT AT RUNTIME from TRIP_TOTAL_INCLUDES, so markup could be banned
// wholesale and the true one was exempt by construction. Here the true
// sentence is static too - there is no list to build it from and no runtime
// worth adding for one line. So this has to be drawn on WORDING, and the
// wording has to separate two sentences that both contain the word "only":
//
//   FALSE  "They can only enter their own team's scores."
//   TRUE   "Each link opens that team's card and nothing else.
//           Send each team only their own."
//
// THE LINE IS THE SUBJECT AND THE VERB, NOT THE WORD "ONLY".
//
//   A PROTECTION CLAIM is a statement about what a PERSON is or is not ABLE
//   to do: a person-subject (they, anyone, nobody, players, teams...) within
//   a short window of a capability verb (can, cannot, able, allowed,
//   prevented, restricted...).
//
//   "They can only enter..."      person + capability   -> CLAIM
//   "Each link opens that card"   subject is the LINK, verb is what it DOES
//                                 -> not a claim
//   "Send each team only their own"  an imperative to the organizer; "only"
//                                 modifies what to SEND -> not a claim
//
// BOTH HALVES ARE REQUIRED, and that is what keeps it off real copy. This page
// really contains "this course has no real stroke index, so net strokes can't
// be allocated" - a capability verb with no person-subject, and a true
// sentence. Requiring a person as well leaves it alone. It also contains "the
// leaderboard can be viewed..." - same shape, same reason.
//
// A SECOND, SEPARATE LIST catches artifact-protection words that need no
// person at all - read-only, locked, private, secure, protected. "This link is
// read-only" has no person in it and is exactly the sentence that already cost
// this project once.
//
// THE RULE IS TESTED BELOW against sentences that must be caught and
// sentences from this page that must not be. A vocabulary nobody checked is a
// vocabulary that gets widened wrongly later.
//
// AND IT CATCHES A SECOND LIE I DID NOT GO LOOKING FOR. Designing this rule
// meant testing every capability sentence on the page, which turned up:
//
//     "Setup means nobody can enter scores yet"
//
// Measured: on a multi-round TEAM event, a round in SETUP status accepted a
// score and wrote it - `set tournaments/<code>/scores/team1_h1`. The lock
// exists (roundLocked, tournament-scorecard.html:275) and is applied in
// renderGroup, the individual path. renderAll, the TEAM path, mentions
// roundLocked ZERO times. So that sentence is true for individual events and
// false for team events, and the rule flags it correctly rather than by
// accident.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const PAGE = 'tournament.html';

// Who a claim can be ABOUT. A protection sentence names a person or a group of
// people; a description names an object.
// NOMINATIVE ONLY. "them", "him", "her" are OBJECT pronouns and can never be
// the subject of a capability - "them can" is not English. Including "them"
// flagged this page's honest flights line, because "whatever you call THEM -
// and the leaderboard CAN be viewed" put an object pronoun 28 characters
// before a capability that belongs to the leaderboard. Caught by this file's
// own must-not-catch list, once that list quoted the page verbatim.
const PERSON = /\b(they|he|she|you|anyone|everyone|somebody|someone|nobody|no one|players?|golfers?|teams?|volunteers?|scorekeepers?|spectators?|partners?|organizers?)\b/i;

// What a claim ASSERTS about them.
const CAPABILITY = /\b(can|cannot|can't|could|able|unable|allowed|permitted|prevented|blocked|restricted|may not|must not)\b/i;

// Words that assert a protection with no person in the sentence at all.
const ARTIFACT_PROTECTION = /\b(read-only|read only|locked|private|secure|protected|tamper|encrypted)\b/i;

// PROXIMITY, NOT CO-OCCURRENCE, AND THAT DISTINCTION IS LOAD-BEARING.
//
// A first draft asked only whether a person-word and a capability word both
// appeared. It flagged this real and honest line:
//
//   "Split the field into divisions ... and the leaderboard CAN be viewed by
//    flight as well as overall. TEAMS you don't assign still appear in Overall."
//
// Two different sentences: a capability about the LEADERBOARD, and a noun about
// teams. Nothing is promised. The draft passed only because MUST_NOT_CATCH
// below held a PARAPHRASE of that line rather than the line itself - my own
// fixture hid my own false positive, which is why the list now quotes the page
// verbatim.
//
// So: split into sentences, and require the person to be the SUBJECT OF the
// capability - within a short window before it, the way "they can", "nobody
// can", "teams cannot" and "players are prevented" all are.
const NEAR = 28;

function sentencesOf(line) {
    return String(line).split(/(?<=[.;!?])\s+/).filter(Boolean);
}

function sentenceIsClaim(sentence) {
    if (ARTIFACT_PROTECTION.test(sentence)) return true;
    const cap = CAPABILITY.exec(sentence);
    if (!cap) return false;
    const before = sentence.slice(Math.max(0, cap.index - NEAR), cap.index);
    return PERSON.test(before);
}

const isProtectionClaim = (line) => sentencesOf(line).some(sentenceIsClaim);

// ============================================================================
// PROVEN PROTECTIONS - THE ONLY WAY A CLAIM MAY STAND
// ============================================================================
//
// The rule above reads WORDING. It cannot read truth, and it was built that way
// on purpose: whether the app really prevents something is a question for a
// browser, not a regex over markup. So once a protection becomes REAL, its
// sentence is still flagged, and there are only two honest ways out - delete the
// sentence, or point at the thing that measures it.
//
// An entry here is not permission to keep a sentence. It is a claim that a named
// check proves the protection, plus the exact string that check prints when the
// protection is gone. The test below reads that check and looks for that string.
// DELETE THE GUARD FROM THE CHECK AND THIS SENTENCE GOES RED AGAIN - which is
// the whole point, because the alternative is an allowlist that outlives the
// thing it was granted for.
//
// THIS LIST STAYS SHORT ENOUGH TO READ IN ONE SITTING. "Add it to the allowlist"
// is NOT the reflex for a flagged sentence. The reflex is: is the sentence true?
// If it is not, fix the sentence. If it is not MEASURED, it does not go here -
// write the check first. An entry requires a measurement, and the count is
// pinned below so a growing list has to be argued for rather than accumulated.
//
// Every one of these was flagged by the rule and then earned its way out.
const PROVEN_PROTECTIONS = [
    {
        // Verbatim, as it appears in tournament.html's round-status legend.
        sentence: 'Setup means nobody can enter scores yet',
        provenBy: 'tools/tournament-round-scoring-check.js',
        // MEASURED on the fixed page: a SETUP round shows 0 of 18 editable boxes
        // (0 of 36 on best ball), accepts no write, and the card reads "This
        // round is not open for scoring yet". Before the fix it was 18 of 18
        // editable, wrote tournaments/T/scores/team1_h1, and told the team to
        // "Enter your team's score below to get started".
        measurement: 'setup round: 0 editable inputs, writes [], both team formats',
        // The exact strings that check emits when the protection is missing. Both
        // halves matter and each is a separate guard in that file: one refuses the
        // WRITE, one refuses a live box that would silently discard it. Removing
        // either takes this sentence red.
        emits: [
            'ACCEPTED a team score on a ',
            'score boxes enabled, and the card says '
        ]
    }
];

function normalize(s) {
    return String(s).replace(/\s+/g, ' ').replace(/[.;!?]+$/, '').trim().toLowerCase();
}

// An entry only exempts while its proof is still standing.
function proofIntact(entry) {
    const file = path.join(__dirname, entry.provenBy);
    if (!fs.existsSync(file)) return false;
    const src = fs.readFileSync(file, 'utf8');
    return entry.emits.every((frag) => src.includes(frag));
}

function isProven(sentence) {
    const n = normalize(sentence);
    return PROVEN_PROTECTIONS.some((e) => normalize(e.sentence) === n && proofIntact(e));
}

// What the page sweep actually asks: not "does this line make a claim" but "does
// it make one nothing measures". Scoped to the SENTENCE, not the line - a line
// that earns an exemption for one sentence must not smuggle a second one in
// beside it.
function unprovenClaims(line) {
    return sentencesOf(line).filter(sentenceIsClaim).filter((s) => !isProven(s));
}

function markupLines() {
    const raw = decodeEscapes(fs.readFileSync(path.join(__dirname, PAGE), 'utf8'));
    return raw
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/\son\w+="[^"]*"/gi, ' ')
        .replace(/<[^>]+>/g, '\n')
        .split('\n').map((s) => s.trim()).filter((s) => s.length > 12);
}

const MUST_CATCH = [
    "They can only enter their own team's scores.",
    'Setup means nobody can enter scores yet.',
    'Other teams cannot change your scores.',
    'Only the organizer is able to edit the field.',
    'Players are prevented from opening another card.',
    'Nobody else can see this link.',
    'This link is read-only.',
    'Each team\'s card is locked to their own link.'
];

const MUST_NOT_CATCH = [
    // The replacement, and the half of the original that was always true.
    'Each link opens that team\'s card and nothing else.',
    'Send each team only their own.',
    // Real sentences from this page.
    'This course has no real stroke index, so net strokes can\'t be allocated. The round will score Gross.',
    // VERBATIM from the page, not paraphrased - the paraphrase is what hid the
    // false positive this list exists to prevent.
    "Optional. Split the field into divisions — Championship, A, B, Senior, whatever you call "
        + "them — and the leaderboard can be viewed by flight as well as overall. Teams you "
        + "don't assign still appear in Overall.",
    'This tournament will link itself back to the trip automatically once you save it.',
    'No scores yet — payouts will show once teams start posting.',
    'Leave this on Tee Time for a normal round where everyone starts on hole 1.'
];

describe('THE RULE KNOWS A PROTECTION CLAIM FROM A DESCRIPTION', () => {

    test('every protection claim is caught', () => {
        MUST_CATCH.forEach((l) => assert.ok(isProtectionClaim(l),
            'a sentence promising a protection walked past the rule: ' + l));
    });

    test('no honest sentence on this page is caught', () => {
        MUST_NOT_CATCH.forEach((l) => assert.ok(!isProtectionClaim(l),
            'the rule flagged copy that promises nothing: ' + l));
    });

    test('CO-OCCURRENCE IS NOT ENOUGH - the person must be the subject', () => {
        // The real flights line: a capability about the leaderboard in one
        // sentence, the word "Teams" in the next. Not a promise.
        assert.ok(!isProtectionClaim(
            'and the leaderboard can be viewed by flight as well as overall. '
            + "Teams you don't assign still appear in Overall."),
            'a capability in one sentence and a person-word in another is not a claim');
        assert.ok(isProtectionClaim('Other teams cannot change your scores.'),
            'but a person immediately before the capability still is');
    });

    test('BOTH halves are load-bearing, and "only" is not the test', () => {
        // If a capability verb alone were enough, the true stroke-index sentence
        // would fail. If "only" were the test, the replacement would fail.
        assert.ok(!isProtectionClaim("net strokes can't be allocated"),
            'a capability verb with no person must not be a claim');
        assert.ok(!isProtectionClaim('Send each team only their own.'),
            'the word "only" alone must not be a claim - the replacement uses it');
        assert.ok(isProtectionClaim('They can only enter their own scores.'),
            'person plus capability must be a claim');
        assert.ok(isProtectionClaim('This link is read-only.'),
            'an artifact-protection word needs no person');
    });
});

describe('tournament.html PROMISES NO PROTECTION IT DOES NOT HAVE', () => {

    test('the stripped markup is substantial, so this cannot pass vacuously', () => {
        const lines = markupLines();
        assert.ok(lines.length > 30,
            `only ${lines.length} markup lines survived stripping - the guard below would be `
            + 'asserting against almost nothing');
        assert.ok(lines.some((l) => /Team Scorecard Links/i.test(l)),
            'the team-links section is not in the stripped markup, so the strip removed the '
            + 'very region this guard exists to police');
    });

    test('no markup sentence claims a protection nothing measures', () => {
        const offenders = markupLines().filter((l) => unprovenClaims(l).length > 0);
        assert.deepEqual(offenders, [],
            'the page tells an organizer the app prevents something, and no check measures '
            + 'that it does. Measured on the team links: ?team=1 and ?team=7 each give 18 of '
            + '18 editable inputs, and tournaments/$tourneyCode is ".write": true. Either '
            + 'make the sentence true and add it to PROVEN_PROTECTIONS with the check that '
            + 'proves it, or change the sentence.\n  ' + offenders.join('\n  '));
    });
});

describe('AN EXEMPTION IS ONLY AS GOOD AS THE CHECK BEHIND IT', () => {

    // WITHOUT THESE, PROVEN_PROTECTIONS IS JUST AN ALLOWLIST. The entries would
    // silence the rule whether or not anything still measured them, which is the
    // failure mode this whole mechanism exists to avoid.

    test('the list is short enough to read, and every entry is fully formed', () => {
        assert.ok(PROVEN_PROTECTIONS.length <= 3,
            `PROVEN_PROTECTIONS has grown to ${PROVEN_PROTECTIONS.length} entries. This list is `
            + 'meant to be read in one sitting. A longer one is an allowlist, and an allowlist '
            + 'is how a false sentence survives - argue for the entry or fix the sentence.');
        PROVEN_PROTECTIONS.forEach((e) => {
            assert.ok(e.sentence && e.provenBy && e.measurement,
                'an entry is missing its sentence, its check, or its measurement');
            assert.ok(Array.isArray(e.emits) && e.emits.length > 0,
                `${e.provenBy} entry names no failure string, so nothing binds it to the check`);
            // An entry that does not name a real claim is exempting nothing and
            // hiding that it is dead weight.
            assert.ok(sentenceIsClaim(e.sentence),
                `"${e.sentence}" is not something the rule would have flagged, so it does not `
                + 'need an exemption. A pointless entry teaches that entries are free.');
        });
    });

    test('the exempted sentence is actually on the page, so no entry outlives its copy', () => {
        const markup = markupLines().join(' ');
        PROVEN_PROTECTIONS.forEach((e) => {
            assert.ok(normalize(markup).includes(normalize(e.sentence)),
                `PROVEN_PROTECTIONS exempts "${e.sentence}" but that sentence is not in `
                + `${PAGE} any more. A dead exemption is a standing permission nobody is `
                + 'watching - delete it.');
        });
    });

    test('the named check exists and still contains the guard it is credited with', () => {
        PROVEN_PROTECTIONS.forEach((e) => {
            const file = path.join(__dirname, e.provenBy);
            assert.ok(fs.existsSync(file),
                `${e.provenBy} does not exist, so "${e.sentence}" is exempted by nothing`);
            const src = fs.readFileSync(file, 'utf8');
            e.emits.forEach((frag) => assert.ok(src.includes(frag),
                `${e.provenBy} no longer emits "${frag}". The guard that proved "${e.sentence}" `
                + 'is gone, and the sentence is now an unmeasured claim.'));
        });
    });

    test('DELETE THE GUARD AND THE SENTENCE GOES RED - proved, not asserted', () => {
        // The mechanism, exercised. A real entry whose proof string is absent
        // must stop exempting, or "delete the guard and it goes red" is a comment
        // rather than a behaviour.
        const live = PROVEN_PROTECTIONS[0];
        assert.ok(proofIntact(live), 'the live entry should be intact right now');
        assert.ok(!proofIntact({ ...live, emits: ['a string that check does not contain'] }),
            'an entry whose failure string is missing from the check STILL exempted its '
            + 'sentence. The binding is decorative and the allowlist is unconditional.');
        assert.ok(!proofIntact({ ...live, provenBy: 'tools/no-such-check.js' }),
            'an entry naming a check that does not exist still exempted its sentence');
    });

    test('and the exemption is scoped to the sentence, not the line it sits on', () => {
        const line = 'Setup means nobody can enter scores yet; Other teams cannot change '
            + 'your scores.';
        const left = unprovenClaims(line);
        assert.equal(left.length, 1,
            'a line carrying one proven claim and one unproven claim must still report the '
            + 'unproven one. Exempting the whole line lets a false sentence ride in beside a '
            + `true one. Got: ${JSON.stringify(left)}`);
        assert.match(left[0], /Other teams cannot change/);
    });

    test('an unproven claim is still caught, so the mechanism did not disarm the rule', () => {
        // The original defect. If this ever passes, the exemption has swallowed
        // everything and the guard is gone.
        assert.ok(unprovenClaims("They can only enter their own team's scores.").length === 1,
            'the sentence this whole file was written for is no longer caught');
        assert.ok(unprovenClaims('This link is read-only.').length === 1,
            'an artifact-protection claim is no longer caught');
    });
});
