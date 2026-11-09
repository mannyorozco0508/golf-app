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
| `index.js` | Thin firebase-functions wrappers: `createEntryCheckout`, `refundEntry` (onCall), `stripeWebhook` (onRequest), and E1 `sendAnnouncement` (onCall, no secret) |
| `announce-core.js` | E1 (2026-11-09) pure rules: owner check, 1/min/event, pushPrefs, token list, the notification |
| `handlers-announce.js` | E1 `sendAnnouncement` with db + messaging injected. Server-only path: `announcementSends/<code>` = `{lastAt}` |

E1 needs its rules block published first (`TOURNAMENTS-E1-RULES-BLOCK.md` in the inbox), and FCM
(already used by gps-live). It needs no secret. Tests: `node --test tournament_e1_announce_server_test.js`.

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

## Photo wall (E4, 2026-11-09): four more callables in this codebase
`photoLinks`, `approvePhoto`, `hidePhoto`, `reportPhoto` (photo-handlers.js; no Stripe, no secret,
no money). They move files in bucket `golfapp-9fb21.firebasestorage.app` under
`tournamentPhotos/<code>/{pending,shown,hidden}/` and the meta under `tournamentPhotoMeta/<code>/`.
A plain `--only functions:tournaments-stripe` deploy ships them WITH the Stripe functions. To ship one
feature alone, name the functions: `--only functions:tournaments-stripe:approvePhoto,functions:tournaments-stripe:hidePhoto,...`.
They need `storage.rules` (repo root; `--only storage`) and the E4 database block published first,
or a golfer's post is refused. `photoLinks` signs 10-minute v4 URLs: the default compute service
account already has Service Account Token Creator (granted 2026-11-03 for chat photos).

### Deleting hidden photos (Phase 1: BY HAND, 7 days after the event)
Hide moves a photo to `tournamentPhotos/<code>/hidden/<id>.jpg` and its meta to
`tournamentPhotoMeta/<code>/hidden/<id>` (with `hiddenAt`). Seven days after the event date:
```
gsutil -m rm "gs://golfapp-9fb21.firebasestorage.app/tournamentPhotos/<CODE>/hidden/**"
npx firebase-tools database:remove "/tournamentPhotoMeta/<CODE>/hidden" --project golfapp-9fb21 --instance golfapp-9fb21-default-rtdb
```
Only `hidden/` - never `shown/` (the recap) or `pending/` (not yet checked). No scheduled function yet.
Tests: `node --test tournament_photo_handlers_test.js tournament_photo_storage_rules_test.js`.
