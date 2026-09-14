# Rattle Golf Consumer — v1.1 Monetization Spec

Rewritten 2026-09-14. Supersedes the 2026-09-09 version entirely.
Nothing in here is built. This is the plan, not a record.

**No pricing work ships until iOS build 24 clears review.** See "Sequencing
against App Review" at the bottom — it is not optional ordering, it is an
App Store Connect constraint.

---

## What changed, and why

The 2026-09-09 spec said: one round is free forever, a trip costs $19.99.

That was inverted. The user who gets the most value paid nothing and the user
who got the least paid once. Marty's group runs roughly forty Mondays a year
and never hits a paywall. The Bandon organizer uses the app three days and pays
twenty dollars. The weekly money game is the core use case, not the free
sample.

The demand signal that forced the rethink: after a Monday round, Lance — the
one who handles the money and reads every scorecard — asked for the app
specifically because settlement was easier. That is a buyer. The old model
never charged him.

---

## The decision, in one line

**Joining is free forever. Organizing is paid.**

---

## The structural fact everything rests on

**Only one person per group ever pays.**

Lance sets up the round. Eleven other golfers open a link. Those eleven were
never buyers at any price, so giving them the app for nothing costs nothing and
buys distribution. The pricing question is not "what will twelve golfers pay,"
it is "what will one organizer pay," and the answer is a great deal more than
$9.99.

---

## What is free, permanently

- **Joining any round via a group or spectator link.** Unlimited. No account,
  no purchase, no limit, ever.
- Every format, every bet type, presses, side matches, the Money Pool,
  Dots/Junk, live leaderboards, full per-round settlement — all visible and
  fully functional to a joiner.
- Course search and the shared course database.

A joiner never sees a paywall of any kind. Not a nag, not a banner, not a
"create your own round" interstitial after the eighteenth hole.

## What is free to try

- **Three round creations, ever.** Not three per week, not three per month.
  Three, then the pass is required.

Three is deliberate: one round is not enough to trust a settlement engine with
real money between friends. Three Mondays is. The ask lands after the value is
proven, not before.

---

## The products

### Season Pass — $29.99 / year

Unlimited round creation. Everything the organizer does, all season.

Auto-renewable subscription. This is the primary product and the one most
buyers should end up on.

**Why $29.99.** Marty's group plays roughly forty Mondays a year, so this is
about seventy-five cents a round for the person already counting a two-hundred
dollar pot by hand in the parking lot. It is also consistent with the rest of
the portfolio: the planned GPS app is $39.99/year against the ~$70/year Manny
already pays for a competitor. A ten dollar price on the betting and
settlement engine — the harder product — undercuts both.

### Trip Pass — $19.99

Thirty days of unlimited round creation, plus everything trip-shaped:
multi-round trips, cumulative standings, trip-wide money settlement, the trip
archive, awards and superlatives, the shareable recap, multi-day Ryder Cup once
it exists.

Consumable. Bought per trip.

**Why it still exists alongside the Season Pass.** The Bandon organizer plays
one trip a year and will never buy a season. Against $1,500–$3,000 a head in
green fees and flights, twenty dollars split across four players is five bucks
each. Different buyer, different shape, worth keeping.

### Pricing principles carried over from the previous spec

These were right and still are:

- **No launch promo.** Introductory pricing anchors the product low and makes
  the later increase feel like a penalty.
- **Start high, discount later.** Raising a price is much harder than lowering
  one.
- **Under $10 reads as a toy.** For a product whose job is tracking real money
  between friends, cheap undercuts trust.

---

## Grandfathering the beta groups

Marty's Talking Stick group and the Myrtle Beach crew get **permanent free
access via App Store promo codes.** They do not pay, and they are not asked to.

The previous spec argued that group should never hit a paywall because they are
the beta, the word of mouth, and the reason the app is any good. That argument
is still correct — it just does not require giving the weekly use case away to
everyone on earth. Promo codes were already the proposed mechanism for early
groups. Use them.

This is a standing decision, not a launch promotion. Do not revisit it when
revenue looks thin.

---

## The honest weakness — and it is worse than last time

**`golf-app-5a5.pages.dev` is public, ungated, and can create rounds.**

Under the old model the web leak cost you the Trip Pass. Under this model the
web leak costs you *everything*, because round creation is now the entire
gate. Lance can bookmark the browser and never pay a cent.

This is the strongest argument against the new pricing and it has to be
answered, not noted.

**The answer: the gate is server-side, so it covers both surfaces.** Creation
entitlement is enforced in Firebase rules and the Worker, not in client
JavaScript. Purchase happens on iOS through StoreKit. A web organizer who runs
out of free creations is told to get the app. The web stays fully usable for
joining, spectating, and reading — forever, unchanged.

A client-side gate would be decorative here in a way it was not before: the
repo is public and the code showing exactly how to bypass it is on GitHub.

---

## The entitlement model

### What changed from the old spec

The old model put entitlement on the **trip**, because Lance had to be able to
read Marty's purchase. That was a real problem and a good solution to it.

**It no longer applies.** Under this model, the only person who needs an
entitlement check is the person creating the round, on their own device, where
StoreKit is already authoritative. Joiners are never checked. The entire
cross-device entitlement problem dissolves.

### What replaces it

**A durable organizer identity**, because "three free creations, ever" is
meaningless if deleting and reinstalling the app resets the counter.

    organizers/<uid>/createdCount      integer, Worker-incremented
    organizers/<uid>/pass/type         "season" | "trip" | "promo"
    organizers/<uid>/pass/expiresAt    server timestamp
    organizers/<uid>/pass/transactionId

**The identity question is the first real decision and it is not obvious.**

- **Firebase Anonymous Auth** — no friction, no sign-in screen, and the uid
  survives app updates. It does *not* survive a delete-and-reinstall, so the
  free-creation counter is farmable by anyone who notices. Probably acceptable:
  someone willing to reinstall the app every three rounds to dodge $29.99 was
  never going to pay.
- **Sign in with Apple** — genuinely durable, restores across devices, and
  makes the Season Pass work properly when Marty gets a new phone. Costs a
  sign-in screen on first launch, which is real friction for an app whose whole
  pitch is "tap a link and start scoring."

**Recommendation: Anonymous Auth for the counter, StoreKit for the pass.** The
pass itself restores through Apple on a new device because auto-renewable
subscriptions are restorable — unlike the old consumable Trip Pass, which was
not. The counter only gates the free trial, so farming it costs you a trial,
not a sale. Revisit if abuse ever shows up in the numbers, which it probably
will not.

### The consumable/subscription split matters

- **Season Pass — auto-renewable subscription.** Restorable through StoreKit.
  Apple's restore-purchases requirement is satisfied natively. This solves a
  problem the old spec had to hand-wave.
- **Trip Pass — consumable.** Not restorable. If a purchase completes but never
  reaches the Worker, the buyer is out $19.99 with nothing. Needs a retry path
  and a manual grant tool. Unchanged from the old spec, still true, still the
  failure that generates angry email.

### Auto-renewable subscriptions carry extra App Store requirements

A subscription is not just a different price, it is a different compliance
surface. Before submitting:

- A subscription group in App Store Connect, with localized display name and
  description per product.
- Functional links to **both** a Privacy Policy and Terms of Use (EULA) inside
  the app and in the App Store metadata. The Privacy Policy URL field is
  already outstanding from the v1 submission — this makes it mandatory rather
  than merely missing.
- Price, duration, and renewal terms disclosed in the purchase UI itself, not
  only on the App Store page.
- Restore Purchases must be reachable without buying anything.

Check Apple's current requirements when building. This area changes.

---

## Receipt validation

Unchanged in shape from the old spec, different in what it writes.

1. Organizer taps "Unlock."
2. StoreKit completes the purchase and returns a signed transaction.
3. App sends `{ signedTransaction, uid }` to the Worker.
4. Worker validates the transaction with Apple.
5. Worker checks the transaction ID has not already been used on another uid.
   Without this, one purchase unlocks unlimited organizers by replay.
6. Worker writes `organizers/<uid>/pass`.
7. Client reads the pass and unlocks creation.

Clients never write the pass or the counter. Only the Worker holds credentials
that can.

Runs as a Cloudflare Worker — already on Cloudflare for Pages and DNS, one
fewer vendor. `verifyReceipt` is deprecated; the current path is StoreKit 2
signed transaction JWS verified against Apple's public keys, or the App Store
Server API. **Verify against current Apple docs before building.**

---

## Build order

Each step depends on the one before. Do not reorder.

**1. `database.rules.json`** — PROTECTED FILE, needs explicit per-file
approval. The current rules are better than the old spec claimed: they validate
score ranges, stake ceilings, course schema, and tournament `ownerUid`
ownership. What they do not do is *authorize*. `trips/$tripCode` and
`events/$eventCode` are writable by any client, so `organizers/<uid>` must be
locked to Worker-only writes from the start. A mistake here breaks live rounds
mid-game for real groups.

**2. Anonymous Auth + the creation counter** — organizer identity, Worker-
incremented count, enforced server-side so the web and the app share one gate.
Ship this *before* any purchase exists and watch the numbers: it tells you how
many organizers actually exist and how many rounds they run, which is the data
the old spec correctly said you did not have when it parked the annual tier.

**3. The Worker** — receipt validation, transaction-ID replay protection, sole
writer of the pass node.

**4. App Store Connect products** — Season Pass subscription group first, then
the Trip Pass consumable. Deliberately after the infrastructure so nothing can
be sold before the gate works.

**5. Native IAP plugin and purchase flow** — new build. States: idle,
purchasing, validating, unlocked, failed. Handle user cancel, payment failure,
network drop mid-validation, Worker unreachable after a successful charge.

**6. Gating at round creation** — read the pass, show or hide. The easiest part
and the last.

**7. Trip Pass feature payload** — awards, recap, archive, multi-day Ryder Cup.

### Where the paywall goes

**At round creation. Never at settlement.**

If someone finishes eighteen holes with $240 on the table and hits a wall
before seeing who owes who, you have made an enemy of your best user. The gate
must fire before anyone tees off, or not at all.

### Testing standards apply throughout

Tests first. Negative controls that actually fire. Full suite green before any
commit. Native bundle synced by hand as part of finishing a wave.

**A specific warning for this work:** a test that mocks the pass as already
granted will pass while the device fails. This project has shipped three broken
device builds behind three green suites. Prove the gate from the entry point a
real user arrives through, on a physical device, with a real StoreKit sandbox
transaction.

---

## Sequencing against App Review

**Do not create the IAP products while build 24 is unapproved.** In-app
purchases attached to an app version that has not been approved cannot be
submitted for changes until that version clears. Getting stuck there has
historically required contacting Apple support to unwind.

**Metadata is editable now, the binary is not.** While a version sits in
Waiting for Review, text fields can still be edited; changing screenshots or
the build requires removing the version from review and restarting the queue.
Scrub any free-tier promises from the description and promotional text now.
Leave the screenshots alone.

**Manual release was the right call.** Once approved and pending developer
release, metadata, pricing, and availability can still change. The binary
cannot.

**The first in-app purchase must be submitted alongside an app version.** This
ships as 1.1. It is never a metadata-only update.

---

## Open questions — decide before building, not after

**Refunds.** Apple refunds the organizer mid-season. Does creation re-lock?
Probably: let the current round finish, block the next one. Decide explicitly.

**Season boundaries.** A "year" from purchase date, or a golf season? Calendar
year is simpler and auto-renewable subscriptions are date-based anyway. Going
with purchase date unless there is a reason not to.

**Charged but not granted.** Purchase succeeds, Worker unreachable, pass never
written. Needs a retry path and a manual grant tool. The subscription case
recovers via StoreKit restore; the Trip Pass consumable does not.

**What a web organizer sees at the wall.** They cannot buy on the web. The
message has to be genuinely useful rather than a dead end — probably a deep
link to the App Store and a note that their existing rounds stay accessible.

**Do the three free creations reset, ever?** Currently no. Consider whether a
dormant organizer returning after a year should get another look.

**Tournaments is a separate app.** Nothing here applies. Different buyer — a
club or charity event with a budget — and probably better economics than
consumer IAP. Per HANDOFF.md it needs its own Capacitor project at a separate
`ios.path`, not a second Xcode target, because Capacitor's CLI rewrites every
`PRODUCT_BUNDLE_IDENTIFIER` with a global regex.

---

## One strategic note, unchanged

Tournaments remains the more likely money maker: a real buyer with a budget and
a line item, paying once for an event rather than $30 from a consumer. That is
a better economic shape.

Which is still an argument for keeping consumer pricing **simple**. Two
products, two prices, ship them, learn from them — and put the real effort
where the buyer already has money set aside.
