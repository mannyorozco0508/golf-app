# Rattle Golf Consumer — v1.1 Monetization Spec

Written 2026-09-09, the day v1.0 (build 21) went to review.
Nothing in here is built. This is the plan, not a record.

---

## The decision, in one line

**One round is free. A trip is paid. The organizer buys once and the whole
group is covered.**

---

## What is free, permanently

Everything a Monday game needs:

- Single rounds, every format — Stroke, Match, Nassau, Best Ball, Scramble,
  Wolf, Stableford, Skins, Hi-Lo, Dots, **single-round Ryder Cup**
- All betting: presses, side matches, the Money Pool, Dots/Junk
- Settlement for a single round
- Group-locked scorekeeper links, spectator links
- Course search, the scanner, the shared course database

This is not a crippled tier. Marty's group at Talking Stick should never hit
a paywall on a Monday, forever. That group is the beta, the word of mouth, and
the reason the app is any good.

**The temptation to resist:** when the paid tier looks thin, the instinct is
to move existing free features behind it. That makes the free product worse
without making the paid one more compelling. Build new value instead.

---

## What the Trip Pass unlocks — $19.99

Bought per trip. Everything inside that trip is included.

- Multi-round trips (linking rounds into one event)
- Cumulative gross/net standings across every round
- **Trip-wide money settlement** — every round's bets netted into one final
  "who owes who for the week"
- End-of-trip awards and superlatives — Most Birdies, Biggest Blow-Up Hole,
  Best Comeback, Sandbagger of the Week
- The trip archive — a permanent record after the trip ends
- One-tap shareable trip recap for the group chat
- **Multi-day Ryder Cup** (see "Not yet built" below)

### Why $19.99

The buyer is organizing a trip where each player is spending $1,500–$3,000.
Against green fees alone this is a rounding error, and it is split zero ways —
one person pays for the group. At four players that is $5 a head.

$14.99 and $19.99 land the same psychologically. Both are "twenty bucks."

Under $10 reads as a toy. For a product whose job is tracking real money
between friends, cheap undercuts trust.

Raising prices later is much harder than lowering them. Start high, discount
if needed.

**No launch promo.** Introductory pricing anchors the product low and makes
the later increase feel like a penalty. Give early groups free promo codes
from App Store Connect instead — better than discounting publicly.

### The annual tier is parked

$49.99/year with unlimited passes was considered and deliberately deferred.
It only earns its place at three-plus trips a year, and there is no data yet
on how many organizers buy two. Revisit when purchase counts exist.

Building a subscription for customers who do not exist yet is how three months
disappear.

---

## The honest weakness

**Nothing stops a group from running four free single rounds and settling by
hand at the bar.**

That is true and it is fine. The free version is genuinely useful; the pass
removes a specific annoyance. People who do not mind the arithmetic will not
pay, and they were never going to.

But it means the pass cannot rest on convenience alone. Four clean per-round
settlements is not a painful workaround — this app is already good at
settlement.

**The awards and the shareable recap matter more than they look.** Those are
not calculations someone can do at the bar. They are the thing that gets
screenshotted into the group chat. Convenience is a weak paywall; a social
artifact is a stronger one. Build those properly or the pass is thin.

---

## The entitlement model — and why it is the hard part

### The problem

StoreKit ties purchases to an **Apple ID**. Marty buys the pass; StoreKit tells
Marty's devices he owns it. Lance opens the same trip and StoreKit tells Lance
he owns nothing.

If the gate asks StoreKit, Lance hits a paywall on a trip that is already paid
for. That breaks the entire model.

### The answer

**The entitlement lives on the trip, not the device.**

    trips/<tripCode>/entitlement/paid            true
    trips/<tripCode>/entitlement/transactionId   <Apple transaction id>
    trips/<tripCode>/entitlement/grantedAt       <server timestamp>

Marty's purchase writes it. Everyone in the trip reads it.

### The problem that creates

**Right now, anyone can write that.** `database.rules.json` has no meaningful
rules, the repo is public, and a trip code is six characters. Unlocking every
paid feature would be one Firebase write away, and the code showing exactly
how is on GitHub.

This is why the rules work comes first and why nothing can be sold until it
is done.

### The Trip Pass is a CONSUMABLE, not a non-consumable

This matters and it is easy to get wrong.

- **Non-consumable** — bought once, owned forever, restorable (e.g. "remove ads")
- **Consumable** — bought, used up, buyable again (e.g. "100 coins")

A Trip Pass is bought per trip. Marty buys one for Myrtle and another for
Bandon. That is a consumable.

**Consequence: Apple does not restore consumables.** If Marty deletes the app
and reinstalls, StoreKit will not tell him he bought anything.

**That is fine, because the entitlement is not on his device — it is on the
trip.** The trip stays paid regardless of what happens to Marty's phone. This
is a point in favour of the trip-scoped model, not against it.

Still needs handling in the UI: a purchase that completes but fails to reach
the server must be recoverable. See "Open questions."

---

## Receipt validation — the piece that does not exist yet

Without server-side validation the paywall is decorative.

### Flow

1. Marty creates the trip (free). Gets a trip code.
2. Marty taps "Unlock this trip."
3. StoreKit completes the purchase and returns a signed transaction.
4. App sends `{ signedTransaction, tripCode }` to the Worker.
5. **Worker validates the transaction with Apple.**
6. **Worker checks the transaction ID has not already been used on another
   trip.** Without this check, one purchase could unlock unlimited trips —
   replay the same receipt against every trip code.
7. Worker writes the entitlement, including the transaction ID.
8. Every client in that trip reads `paid` and unlocks.

Clients never write the entitlement. Only the Worker holds credentials that
can.

### Where it runs

Cloudflare Worker. You are already on Cloudflare for Pages and DNS, so it is
one less vendor. A Firebase Cloud Function is the alternative and would sit
closer to the database.

It is one endpoint with one job. Not a service to maintain.

### Verify the Apple side against current docs before building

`verifyReceipt` is deprecated. The current path is StoreKit 2's signed
transaction JWS, verified server-side against Apple's public keys, or the App
Store Server API. **Check Apple's current documentation when you start** —
this area changes and anything written here today may be stale by then.

---

## Native IAP plugin

- A Capacitor IAP plugin, wired to StoreKit
- Purchase flow with proper states: idle, purchasing, validating, unlocked, failed
- Error handling for: user cancels, payment fails, network drops mid-validation,
  Worker unreachable after a successful charge
- **Apple requires a restore path.** Consumables are not restorable through
  StoreKit, so this needs a different answer — likely "contact support" plus a
  manual grant tool. Decide before submitting.

This is a new build, new native code, and Apple reviews IAP products
separately. **Your first in-app purchase must be submitted alongside an app
version** — so this ships as 1.1, never as a metadata-only update.

---

## Not yet built: multi-day Ryder Cup

**This does not exist.** Do not assume it does.

What ships today is single-round Ryder Cup, and the Myrtle 2026 plan is five
separate single-round Cups precisely because the wired multi-day version was
never built.

Multi-day Ryder Cup — points accumulating across every round of a trip, with a
running Cup score over several days — is a **build item**, not a feature being
gated. It belongs in the Trip Pass because it is genuinely trip-shaped and
cannot be faked with five separate rounds.

Note the existing namespace trap from HANDOFF.md: `gameFormat:'ryder'` is a
legacy field-wide best-ball money match with no points system, unrelated to the
Ryder Cup competition type.

---

## Build order

Each step depends on the one before. Do not reorder.

**1. `database.rules.json`** — PROTECTED FILE, needs explicit per-file approval.
Lock writes so no client can grant itself an entitlement. Everything else
depends on this being right. A mistake here breaks live rounds mid-game for
real groups.

**2. The Worker** — receipt validation, transaction-ID replay protection, the
only writer of the entitlement node.

**3. App Store Connect product** — create the Trip Pass, consumable, $19.99.
Cheap and quick; deliberately after the infrastructure so it cannot be sold
before the gate works.

**4. Native IAP plugin and purchase flow** — new build.

**5. Gating in the app** — read `trips/<code>/entitlement/paid`, show or hide.
The easiest part, and the last.

**6. Awards, recap, archive** — the things that make the pass worth buying
rather than merely functional.

**7. Multi-day Ryder Cup** — the largest feature. Can ship after 1.1.

### Testing standards apply throughout

Tests first. Negative controls that actually fire. Full suite green before any
commit. The native bundle synced by hand as part of finishing a wave, not
releasing.

**A specific warning for this work:** a test that mocks the entitlement as
already granted will pass while the device fails. This project has shipped
three broken device builds behind three green suites. Prove the gate from the
entry point a real user arrives through.

---

## Open questions — decide before building, not after

**Refunds.** Apple refunds the organizer. Does the trip go back to locked?
Mid-trip? That is a group of eight losing their standings on day three because
one person charged back. Probably: leave it unlocked and eat it. Decide
explicitly.

**Wrong trip.** Marty buys a pass, then abandons the trip and starts a new one
with a corrected date. Is that a second purchase? Probably needs a grace
window or a manual move. This will generate support email.

**Charged but not granted.** Purchase succeeds, the Worker is unreachable, the
entitlement never gets written. Marty is out $19.99 with nothing to show. Needs
a retry path and a manual grant tool — this is the failure that produces angry
email, and consumables cannot be restored through StoreKit.

**The web version is free.** `golf-app-5a5.pages.dev` is public and ungated.
Whatever is paywalled in the iOS app, the browser does for nothing. Not fatal —
plenty of products live with it — but choose it deliberately rather than
discovering it after launch.

**Tournaments is a separate app.** Nothing here applies to it. It has a
different buyer (a club or charity event with a budget) and probably different
economics. Per HANDOFF.md it needs its own Capacitor project at a separate
`ios.path` — not a second Xcode target, because Capacitor's CLI rewrites every
`PRODUCT_BUNDLE_IDENTIFIER` with a global regex.

---

## One strategic note

Tournaments is the more likely money maker: a real buyer with a budget and a
line item, paying once for an event rather than $20 from a consumer. That is a
better economic shape than consumer IAP.

Which is an argument for keeping the Trip Pass **simple**. One product, one
price, ship it, learn from it — and put the real effort where the buyer already
has money set aside.
