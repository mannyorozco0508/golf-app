#!/usr/bin/env node
// ============================================================================
// VENMO A RULES BLOCK (2026-11-15) - A CANDIDATE, NOT PUBLISHED
//
//   node tools/venmo-rules-candidate.js <base.json> <candidate.json>
//
// Built ON WHATEVER IT IS GIVEN (a fresh live read, or the newest candidate the
// iOS lane is about to publish). Touches one path; refuses (exit 1) if it exists
// or the node it hangs on changed shape. Publishing is the iOS lane's, on
// Manny's own OK; this file never deploys anything.
//
// WHY A RULES CHANGE AT ALL. registrations/$code/$entryId is a CLOSED schema
// ("$other": { ".validate": false }): a key the rules do not name is refused for
// everyone, and it refuses the WHOLE sign-up write. Venmo A's one golfer-written
// field is the golfer's own Venmo / PayPal handle, typed on the sign-up page so
// the organizer can pay a prize back to it. Until this block is live the page
// keeps that box hidden (tournament.html: PAYHANDLE_LIVE = false) and never sends
// the key; everything else in Venmo A is an owner write under rules already live
// (tournaments/<code>/payTo, /prizePaidOut; registrations paidVia 'venmo'|'paypal'
// through the owner's existing update grant - paidVia is already typed as a string).
//
//   ADD    .../$entryId/payHandle   a string of 1..60 letters, digits, dots,
//          dashes and underscores (the page strips a leading @). No .read of its
//          own: the entry is owner-only to read, as email and phone are; no
//          .write of its own: the public create grant and the owner's update
//          grant on the entry carry it, as they carry teamPreference.
//   WIDEN  .../$entryId/paidVia/.validate   'cash' | 'stripe' -> 'cash' | 'stripe' | 'venmo' | 'paypal'.
//          The Stripe lock in the entry's .write (nobody but the server moves
//          paid / paidAt / paidVia on an entry that is or would be Stripe-paid)
//          is untouched: it reads paidVia === 'stripe' and still does.
//
// BASE. The newest live read-back on this machine is
// ~/Desktop/claude-mailbox/outbox/rules-publish-20261113-55a/readback.json
// (2026-11-13; it holds the Stripe and Connect keys). NOTE for whoever
// publishes: tournaments/RULES-CANDIDATE-combined-20261115.json (check-in +
// hide/archive + scorer joins) was built on a 2026-11-12 read-back and has NO
// paidVia / ref / amountCents / acct on the entry - published as-is it would
// drop the Stripe keys. Rebuild that chain on the 55a read-back first, then
// this block on top.
// ============================================================================
'use strict';
const fs = require('fs');

const PAY_HANDLE = {
    '.validate': "newData.isString() && newData.val().length > 0 && newData.val().length <= 60 && newData.val().matches(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/)"
};
const PAID_VIA_BEFORE = "newData.isString() && (newData.val() === 'cash' || newData.val() === 'stripe')";
const PAID_VIA_AFTER = "newData.isString() && (newData.val() === 'cash' || newData.val() === 'stripe' || newData.val() === 'venmo' || newData.val() === 'paypal')";
const PATHS = ['/rules/registrations/$code/$entryId/payHandle', '/rules/registrations/$code/$entryId/paidVia/.validate'];

const clone = (o) => JSON.parse(JSON.stringify(o));
function build(base) {
    const out = clone(base);
    const fail = (why) => { throw new Error('VENMO A: BASE HAS MOVED, refusing: ' + why); };
    const reg = out.rules && out.rules.registrations && out.rules.registrations.$code;
    if (!reg) fail('no /registrations/$code');
    const e = reg.$entryId;
    if (!e) fail('no /registrations/$code/$entryId');
    if (!e.$other || e.$other['.validate'] !== false) fail('$entryId is no longer a closed schema ($other .validate false)');
    if (typeof e['.write'] !== 'string' || e['.write'].indexOf('(!data.exists() && newData.exists())') === -1) fail('$entryId .write no longer has the public create arm the sign-up relies on');
    if (!e.teamPreference || !/isString\(\)/.test(String(e.teamPreference['.validate']))) fail('$entryId/teamPreference is not the typed optional string this block mirrors');
    if (!e.paidVia) fail('$entryId has no paidVia (the Desk writes venmo | paypal into it): this base predates the Stripe block');
    if (e.paidVia['.validate'] !== PAID_VIA_BEFORE) fail('$entryId/paidVia .validate is not the cash | stripe pair this block widens (' + JSON.stringify(e.paidVia['.validate']) + ')');
    if ('payHandle' in e) fail('$entryId already has payHandle');
    e.paidVia = Object.assign({}, e.paidVia, { '.validate': PAID_VIA_AFTER });
    const next = {};
    Object.keys(e).forEach((k) => {
        if (k === 'paid') next.payHandle = clone(PAY_HANDLE);   // beside the other sign-up fields, before the desk's keys
        next[k] = e[k];
    });
    if (!next.payHandle) next.payHandle = clone(PAY_HANDLE);
    reg.$entryId = next;
    return out;
}

module.exports = { build, PATHS, PAY_HANDLE, PAID_VIA_BEFORE, PAID_VIA_AFTER };

if (require.main === module) {
    const [src, dst] = process.argv.slice(2);
    if (!src || !dst) { console.error('usage: node tools/venmo-rules-candidate.js <base.json> <candidate.json>'); process.exit(2); }
    try {
        fs.writeFileSync(dst, JSON.stringify(build(JSON.parse(fs.readFileSync(src, 'utf8'))), null, 2) + '\n');
        console.log('wrote ' + dst);
    } catch (err) { console.error(err.message); process.exit(1); }
}
