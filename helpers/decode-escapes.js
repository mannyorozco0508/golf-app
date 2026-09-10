// ============================================================================
// DECODE \uXXXX BEFORE MATCHING SOURCE FOR USER-FACING TEXT.
//
// WHY THIS EXISTS. A \uXXXX escape inside a <script> is legitimate JavaScript.
// It resolves at runtime, the golfer sees the glyph, and the page is correct.
// But a test that slices SOURCE and matches a regex containing the literal
// character sees six ASCII characters and no match:
//
//     raw source,     plain regex   true
//     ESCAPED source, plain regex   FALSE
//
// That gap hid the same defect twice in one week, in the same file, one wave
// apart - the bin glyph on the destructive control, then the Undo row's
// warning sign. Both times the RUNTIME was right and the cold check read the
// rendered glyph back. What failed was a source-level assertion that could not
// see through an escape.
//
// The fix is not a convention about which glyph form to type. This repo holds
// 673 escapes and 330 raw characters inside <script> blocks across 11 pages,
// written by every author over the project's life; a rule about all 1,003 of
// them, invented to protect one test, would be fixing the wrong thing. The fix
// is that a source-level assertion about user-facing text decodes first, so
// BOTH forms are equivalent to a test and neither can hide anything.
//
// NOT FOR THE OTHER DIRECTION. CLAUDE.md documents the real defect - an escape
// in raw HTML MARKUP prints literally to a golfer - and that is guarded
// elsewhere, by trip_awards_identity_test.js scanning source with scripts
// stripped and tools/trip-awards-check.js sweeping rendered innerText. Do not
// use this helper there: decoding would make a genuine defect invisible, which
// is the exact inversion of the bug it was written for.
//
// WHY IT LIVES IN helpers/. It is test infrastructure, used only by tests, and
// helpers/ already holds mini-dom.js, load-script.js and fixtures.js for
// exactly that. It ships in no page and is in no shell list.
// ============================================================================

// Handles the two forms the repo actually contains: \uXXXX surrogate pairs as
// written by hand, and \u{XXXXX} code-point form. Anything that is not a valid
// escape is left exactly as it was - this must never mangle source it does not
// understand, because a test asserting on the result would then be asserting on
// the mangling.
function decodeEscapes(src) {
    return String(src).replace(/\\u\{([0-9A-Fa-f]{1,6})\}|\\u([0-9A-Fa-f]{4})/g,
        (whole, braced, plain) => {
            const hex = braced || plain;
            const code = parseInt(hex, 16);
            if (!Number.isFinite(code) || code > 0x10FFFF) return whole;
            try { return String.fromCodePoint(code); } catch (e) { return whole; }
        });
}

module.exports = { decodeEscapes };
