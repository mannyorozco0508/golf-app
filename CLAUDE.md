# Working notes for Claude

Read `HANDOFF.md` first — it describes the project, the stack, and how Manny works.
This file holds rules learned the hard way, from defects that actually shipped.

## Test the entry point a user arrives through, not the function

**A test that calls the function under test directly proves the function works. It
proves nothing about whether anything calls it.** That gap has now shipped a broken
default three times in this repo, and every time the suite was green.

1. **The match-handicap line in Hole View.** The tests all called `setDotContext('w1')`
   first, so they only ever exercised an explicitly chosen wager. `selectedDotMatchId`
   defaults to `'auto'`, and on that branch the note rendered a pairing list with no
   handicap numbers in it. Green suite, and the state nearly every real round sits in
   was the broken one.

2. **The priced Auto Press label.** 37 tests called `syncSetupNassauAutoPressLabel()`
   themselves and asserted the output. The builder was correct, the rendering was
   correct, and nothing called it on render — so a golfer who opened the wizard saw the
   bare "Same as Segment" fallback forever. The stake boxes ship at 10/10/20, which is
   already what most groups want, so most golfers never fired the `oninput` that was
   the only trigger.

Both were found on a real device, after the tests said the work was finished.

**The rule.** For anything a user sees, at least one test must reach it the way a user
does: navigate to the step, tick the box, choose the format, load the page, accept the
defaults. Do not call the render or sync function by name in that test. If the only way
to reach an assertion is to call the function yourself, you have tested the function,
not the feature — write the other test too.

**Watch the default state specifically.** Every one of these defects lived in the state
a user gets *without doing anything*: the default dot context, the default stakes, the
freshly opened panel. Tests naturally drive explicit choices, because that is what is
easy to write, so the default path is the one that goes uncovered. Ask of each feature:
what does someone see who touches nothing? Then test exactly that.

## Do not let the harness prove the thing you are assuming

`helpers/mini-dom.js` is a hand-rolled DOM, not a browser. It has real limits, and
each one has already hidden a real defect:

- **No layout.** `getBoundingClientRect()` returns a hard-coded all-zero rect and
  `getClientRects` does not exist. An element can be `display:block` and 0×0 at the
  same time — that is exactly how the Hole View note shipped invisible while its test
  asserted `display`. **Never teach mini-dom to return a fake rect**; that asserts the
  mock instead of the runtime. Measure geometry in headless Chrome instead.
- **`innerHTML` is a string.** No child nodes are parsed from it, so anything that
  walks rendered markup cannot run.
- **Static attributes are not parsed.** `value="10"` on an `<input>` is invisible;
  `getElementById(...).value` reads `''` unless a test sets it. A reveal-path test that
  seeds nothing sees an unpriced label and cannot tell a missing call from an empty
  input.
- **A `<select>` keeps its `value` when `innerHTML` is rewritten.** A real browser
  resets it. A control that deleted the restore line passed the harness cleanly.

When a behaviour depends on any of these, verify it in headless Chrome. Chrome is
installed and can be driven over CDP from plain Node with no npm dependency — see the
measurement scripts written for the Hole View and Auto Press work. Say plainly in the
test file what the harness can and cannot prove.

`tools/id-binding-check.js` is the standing example, and the only check in the repo that
can prove a player's id still belongs to the same golfer. `player_id_stability_test.js`
proves the id *sequence* is stable; only a real browser can prove the *binding*, because
the name inputs are not real elements under mini-dom. `HANDOFF.md` documents how to run
it and what its exit codes mean. Run it by hand after touching the player list, the
wizard's roster handling, or the id issuer in `admin.html`.

## Prove every test is live before trusting it

For each assertion, deliberately break the thing it guards and confirm the test fails.
A test that passes against a reverted fix is inert and must be fixed, not accepted.
This has caught genuinely tautological tests more than once — a helper that forced the
value the test then asserted, and a comparison that read the same unchanged string
twice because the view switch it relied on never rebuilt anything.

A control that mutates something genuinely harmless *should* be inert. Say so, rather
than inventing an assertion to make it look caught.

## Two entry points means one builder

`admin.html` and `sidematches.html` both render the Nassau controls. Anything they
share belongs in `action-model.js` as a pure function, called by both. This project has
already paid for a hand-written copy in each: a per-press stake reached the engine but
not the pages, and a $10 Nassau with a $25 press showed $30 live while the Receipt
correctly paid $45.

## Bump the service worker when a cached file changes

`sw.js` lists the shell files. If a change touches one — `index.html`, `admin.html`,
`sidematches.html`, `action-model.js` and the rest — move `CACHE_VERSION` and add a
"Moved to vNN" line saying what an installed device would otherwise keep serving.
Roughly seven tests pin the version string; re-pinning them is the deliberate
confirmation those guards ask for, not a workaround.

Without the bump, the users most likely to have the app installed are the only ones who
never see the fix.

## Check which branch actually deploys

Cloudflare Pages builds from `main`. Work has repeatedly accumulated on a feature
branch while `main` sat still, so a verified, committed, pushed fix was simply not on
the live site. Before debugging "the fix isn't working", fetch the deployed file and
grep it for the change. `sw.js`'s `CACHE_VERSION` is the fastest tell of what is
actually live.

## Frozen-hash guards are scoped to their wave

`format_first_wizard_test.js` freezes the engine files by sha256. Its own header scopes
that to proving one *navigation* wave touched no arithmetic — it was never meant to make
those files permanently unwritable. If a later change legitimately edits one with
Manny's explicit per-file approval, re-pin the hash and record why, and assert the
behaviour that actually matters rather than trusting a hash to notice. The protected
list in `HANDOFF.md` still governs: money, settlement, handicap and Ryder points are
off-limits by default.
