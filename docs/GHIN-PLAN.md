# Posting scores to GHIN — a plan only (nothing built)

Status: **plan only.** Nothing in the app talks to GHIN or the USGA. The HardPan Index
(unofficial) — `hp-index.js`, mailbox 008 feature 8 — is worked out on the phone from
the golfer's own finished 18-hole rounds and is posted nowhere. In the app it is always
labelled "HardPan Index (unofficial)", and the words USGA and GHIN never appear on it
(`hp_index_test.js` enforces this).

## Why it is not built
- Posting a score to a golfer's GHIN record, or reading their official Handicap Index,
  requires a **license from the USGA**: either as a licensed technology provider, or
  through an **authorized partner** that already has one. No self-serve public API
  exists, and scraping ghin.com or using a private API is off the table (terms of use,
  and the golfer's credentials would pass through us).
- An official index also needs the golfer to be a member of an authorized golf club.
  An app cannot issue one.

## What it would take
1. **Apply to the USGA** for golfer-app access (the "Golfer Product Access" route that
   golfer apps use for index lookup, course ratings and score posting). This means a
   license agreement, review and approval. Fees and timeline are not published and are
   likely months. (The club-side "VASP" program needs at least 10 clubs / 1,400
   golfers — not a fit.) See `docs/gps-features.md` §6 for the earlier research.
2. **Or partner** with an app or service that is already licensed, and post through it.
3. **Once licensed:**
   - Golfer links their GHIN number in Account (explicit opt-in, unlinkable).
   - A finished 18 (or 9) is posted with the golfer's say-so on the Finish Round screen:
     course, tee, date, hole-by-hole or adjusted gross — in the format the license specifies.
   - Course ratings / slopes come from the licensed course data, not our own copy.
   - The official index can be read back and offered in Round Setup next to (or instead
     of) the HardPan Index (unofficial).
   - Privacy policy, terms and App Store privacy labels updated for the new data flow
     (a GHIN number and scores leave the phone — today nothing does).
4. **Until then**: keep manual entry of an index ("self-reported"), keep the HardPan
   Index clearly unofficial, and optionally add a plain link that opens the official
   GHIN app / site — no data exchanged.

## Decision needed (Manny)
Whether verified indexes matter enough to start the license application. Nothing in
the codebase depends on it.
