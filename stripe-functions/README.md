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


## Stripe Connect (Phase 2, 2026-11-12, TEST MODE) - setup steps, in order
1. Stripe Dashboard (test mode) -> Settings -> Connect: enable Express; brand name `HardPan Tournaments`; let Stripe issue 1099-Ks (Manny's dashboard step).
2. Stripe Dashboard -> Developers -> Webhooks -> Add endpoint -> **"Listen to events on Connected accounts"**:
   URL `https://us-central1-golfapp-9fb21.cloudfunctions.net/stripeConnectWebhook`, events exactly `account.updated` and `account.application.deauthorized`. Copy its signing secret.
3. `firebase functions:secrets:set STRIPE_CONNECT_WEBHOOK_SECRET --project golfapp-9fb21` (paste the whsec value at the prompt; never in the repo, a mailbox file or a log). The deploy refuses in non-interactive mode until this secret exists.
4. Rules: the Connect block (STRIPE-CONNECT-RULES-CANDIDATE.md in the shared mailbox), published by the iOS lane on Manny's typed OK.
5. Deploy (Manny's typed OK): `npx firebase-tools deploy --only functions:tournaments-stripe --project golfapp-9fb21`.
6. Service fee setting (Manny only, Firebase console): `platform/connect/serviceFeeCents` (absent = 400 = $4); per event `platform/connect/eventOverrides/<code>/serviceFeeCents`.
7a. ACCOUNTS V2 (2026-11-13). Stripe refused `POST /v1/accounts` for new Connect integrations on our key ("Stripe no longer recommends Accounts v1 ... use POST /v2/core/accounts"; the Dashboard policy "Accounts v1 support" was enabled in test mode and the call still failed, Grok 10:04). Accounts are now created with `POST /v2/core/accounts` (`dashboard: express`, `defaults.responsibilities` fees + losses = `application`, `configuration.merchant.capabilities.card_payments` + `configuration.recipient.capabilities.stripe_balance.stripe_transfers` requested, `identity.country us`, `defaults.currency usd`, `display_name` = beneficiary or organizer, `contact_email` = the owner's sign-in email from the verified token (Stripe: "If configuration.recipient is supplied, the Account must have a contact email", live log 2026-11-13 18:07 UTC; a sign-in without an email is refused `no-email` before any Stripe call), `metadata.uid`) and the onboarding link with `POST /v2/core/account_links` (`use_case.account_onboarding` with return/refresh). Everything else stays v1, which Stripe documents as working with v2 account ids: `GET /v1/accounts/{id}` (v1 shape: charges_enabled / payouts_enabled / requirements.currently_due), login links, the `account.updated` event (v2 accounts keep sending it), so the webhook endpoint of step 2 is unchanged. The 7-day payout delay has no v2 create field: it is applied as the v1 update right after creation; a refusal is logged `ALERT payout schedule not applied` and kept at `stripeAccounts/<uid>/payoutScheduleError` (server-only), the onboarding still proceeds. Unverified until the first live test run: that v1 login links and the v1 schedule update accept a v2 account id (both documented generally, not field by field).
7. Test path: on a preview as an allow-listed owner, Setup -> Entry fees -> Set up payouts with Stripe (test SSN 000-00-0000, routing 000123456, account 000123456789); `Payouts on` arrives with account.updated; a golfer pays entry + $4 with 4242 4242 4242 4242; the connected account shows the entry fee, the platform the $4; Refund from the Desk reverses both.
