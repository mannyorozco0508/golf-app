# tournaments-stripe (Stripe Phase 1, TEST MODE)

Firebase Functions codebase `tournaments-stripe`, 2nd gen, nodejs22, us-central1.
Entry fees only. Contract: `~/Desktop/claude-mailbox-shared/tournaments/STRIPE-CONTRACT.md`.

**Nothing here has been deployed. No Stripe account or keys exist yet.** Every step
below is Manny's (or the iOS lane's on Manny's typed OK). Never deploy any other codebase
from this branch, and never `firebase deploy` without `--only`.

| File | What |
|---|---|
| `stripe-core.js` | Pure rules, no SDK: fee check, origin allow-list, metadata parse, checkout/refund planners, event -> update mapping, attempt count |
| `handlers.js` | The three handlers with db + stripe injected (what the tests drive) |
| `index.js` | Thin firebase-functions wrappers: `createEntryCheckout`, `refundEntry` (onCall), `stripeWebhook` (onRequest) |

Server-only path not named in the contract: `payments/checkoutAttempts/<code>/<entryId>`
(integer, max 5 sessions per entry). Clients cannot read or write `payments/`.
Contract Addendum 2026-11-08: the webhook also writes `registrationStatus/<code>/<entryId> =
{paid, paidVia: 'stripe', at}` in the same multi-path update (paid; and paid:false on a full
refund). Public read by exact id only, no list, no client write - for the signed-out M2c page.

## Prerequisites (Manny)
1. Blaze plan on `golfapp-9fb21` (Cloud Functions need it).
2. A Stripe account for Rattle Golf LLC, **test mode**. Restricted key with: Checkout
   Sessions write, PaymentIntents read, Refunds write, Webhook endpoints read.
3. The rules block published first (`~/Desktop/claude-mailbox/inbox/TOURNAMENTS-STRIPE-RULES-BLOCK.md`).
   Without it the page cannot write `fees` with types checked or `paidVia: 'cash'`, and the
   Stripe-paid lock does not exist.
4. Manny's uid on the allow-list, by hand in the console:
   `payments/allowedOwners/<uid> = true` (Admin/console only; rules refuse clients).

## Local tests (no network, no keys)
```
npm --prefix stripe-functions ci
node --test stripe_core_test.js stripe_webhook_test.js stripe_rules_emulator_test.js
```
The webhook and rules tests need Java (`~/jdks`) and the cached DB emulator jar
(`~/.cache/firebase/emulators`); without them, or without `stripe-functions/node_modules`,
they SKIP (a skip proves nothing).

## Secrets (test keys first; live keys are a separate, later, typed OK)
```
npx firebase-tools functions:secrets:set STRIPE_SECRET_KEY --project golfapp-9fb21
npx firebase-tools functions:secrets:set STRIPE_WEBHOOK_SECRET --project golfapp-9fb21
```
Paste the value at the prompt. Never in the repo, a mailbox file, a commit or a log.
`STRIPE_WEBHOOK_SECRET` is the `whsec_...` signing secret of the endpoint below (create the
endpoint first, then set this secret, then deploy again so the function picks it up).

## Deploy (Manny's typed OK only)
```
npm --prefix stripe-functions ci
npx firebase-tools deploy --only functions:tournaments-stripe --project golfapp-9fb21
```
**firebase.json on main carries only this codebase.** Release branches carry a `gps-live`
functions entry; when this merges onto one, the `functions` array must hold BOTH entries
(each with its own `codebase`), or a deploy from that branch would offer to delete the
other codebase's functions. `--only functions:tournaments-stripe` never touches `gps-live`.

## Stripe dashboard (test mode): webhook endpoint
URL (2nd gen, after deploy; confirm the exact URL the deploy prints):
```
https://us-central1-golfapp-9fb21.cloudfunctions.net/stripeWebhook
```
Events to send (exactly these five):
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`

## Local round trip (test keys, Functions emulator + Stripe CLI)
```
npx firebase-tools emulators:start --only functions,database --project golfapp-9fb21
stripe login
stripe listen --forward-to http://127.0.0.1:5001/golfapp-9fb21/us-central1/stripeWebhook \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired,charge.refunded,charge.dispute.created
```
`stripe listen` prints a `whsec_...` for the local session; put it in
`stripe-functions/.secret.local` as `STRIPE_WEBHOOK_SECRET=whsec_...` with
`STRIPE_SECRET_KEY=sk_test_...`. The repo `.gitignore` refuses `.secret.local`; check
`git status` shows nothing before any commit anyway.
Test cards: `4242 4242 4242 4242` paid; `4000 0000 0000 9995` declined (stays Unpaid);
`4000 0025 0000 3155` 3-D Secure. `stripe trigger` can resend events; a re-delivery must
answer `duplicate`.

## What is proven, and what is not
Proven locally (see the test headers): signature refusal writes nothing; amount/currency
mismatch writes nothing; duplicate events applied once (sequential and concurrent); the
amount is never read from the client; owner-only refunds; the origin allow-list;
already-paid / not-allowed-owner / not-collecting / bad-fee / too-many-attempts refusals;
the rules block in the DB emulator against LIVE rules.
**Not proven: any call to Stripe's real API** (session creation, refunds, the PaymentIntent
lookup, the real webhook payload shapes for this API version). That needs test keys and the
round trip above.
