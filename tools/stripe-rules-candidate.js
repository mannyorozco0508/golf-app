#!/usr/bin/env node
// ============================================================================
// STRIPE PHASE 1 RULES BLOCK: LIVE rules -> CANDIDATE (2026-11-08)
//
//   node tools/stripe-rules-candidate.js <live.json> <candidate.json>
//
// Reads a copy of the LIVE rules (fetched read-only with `database:get
// /.settings/rules`), checks every BEFORE value it touches is exactly what it
// was when this block was written, and writes the candidate. If live has moved
// under any touched path it refuses (exit 1) instead of half-applying.
//
// Changes, by path (nothing else in the file moves):
//   EDIT  /registrations/$code/$entryId/.validate   (public create may not carry
//         paidVia; server-only fields unchanged by any client; Stripe-paid lock)
//   ADD   /registrations/$code/$entryId/{paidVia, ref, amountCents, checkoutAt,
//         refundPendingAt, refundedAt, refundCents, refundRef, disputedAt}
//   ADD   /tournaments/$tourneyCode/fees
//   ADD   /payments
//   ADD   /stripeEvents
//   ADD   /registrationStatus/$code/$entryId   (Addendum 2026-11-08: the public,
//         server-written {paid, paidVia, at} the signed-out golfer's
//         ?checkout=done page reads BY EXACT ID; no list read at $code)
// The Admin SDK (the functions) bypasses all of it.
// ============================================================================
'use strict';
const fs = require('fs');

const SERVER_ONLY = ['ref', 'amountCents', 'checkoutAt', 'refundPendingAt', 'refundedAt', 'refundCents', 'refundRef', 'disputedAt'];

const ENTRY_VALIDATE_BEFORE = "newData.hasChildren(['createdAt']) && newData.child('createdAt').isNumber() && (data.exists() || (auth != null && auth.uid === root.child('tournaments/' + $code + '/ownerUid').val()) || (newData.hasChildren(['fullName', 'email', 'phone']) && !newData.hasChild('paid') && !newData.hasChild('paidAt') && !newData.hasChild('approvedAt') && !newData.hasChild('playerId') && !newData.hasChild('teamNum')))";
const PUBLIC_TAIL_BEFORE = "!newData.hasChild('teamNum')))";
const PUBLIC_TAIL_AFTER = "!newData.hasChild('teamNum') && !newData.hasChild('paidVia')))";
// No client may create, change or delete a server-only field (null === null on both sides when absent).
const SERVER_UNCHANGED = SERVER_ONLY.map((f) => "newData.child('" + f + "').val() === data.child('" + f + "').val()").join(' && ');
// Nobody but the server moves paid / paidAt / paidVia on an entry that is, or would become, Stripe-paid.
const STRIPE_LOCK = "((data.child('paidVia').val() !== 'stripe' && newData.child('paidVia').val() !== 'stripe') || (newData.child('paid').val() === data.child('paid').val() && newData.child('paidAt').val() === data.child('paidAt').val() && newData.child('paidVia').val() === data.child('paidVia').val()))";
const ENTRY_VALIDATE_AFTER = ENTRY_VALIDATE_BEFORE.replace(PUBLIC_TAIL_BEFORE, PUBLIC_TAIL_AFTER) + ' && ' + SERVER_UNCHANGED + ' && ' + STRIPE_LOCK;

const INT = (lo, hi) => "newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= " + lo + (hi === undefined ? '' : " && newData.val() <= " + hi);
const NEW_ENTRY_CHILDREN = {
    paidVia: { '.validate': "newData.isString() && (newData.val() === 'cash' || newData.val() === 'stripe')" },
    ref: { '.validate': "newData.isString() && newData.val().beginsWith('pi_') && newData.val().length <= 255" },
    amountCents: { '.validate': INT(0) },
    checkoutAt: { '.validate': 'newData.isNumber()' },
    refundPendingAt: { '.validate': 'newData.isNumber()' },
    refundedAt: { '.validate': 'newData.isNumber()' },
    refundCents: { '.validate': INT(0) },
    refundRef: { '.validate': "newData.isString() && newData.val().beginsWith('re_') && newData.val().length <= 255" },
    disputedAt: { '.validate': 'newData.isNumber()' }
};
// Written only through tournaments/$tourneyCode's own .write (the owner, or the
// creator of a new event, who becomes its owner). No .write here: a child grant
// could only widen that.
const FEES = {
    '.validate': 'newData.hasChildren()',
    entryFeeCents: { '.validate': INT(100, 100000) },
    collectByCard: { '.validate': 'newData.isBoolean()' },
    allowCash: { '.validate': 'newData.isBoolean()' },
    $other: { '.validate': false }
};
const PAYMENTS = {
    '.read': false,
    '.write': false,
    allowedOwners: { $uid: { '.read': 'auth != null && auth.uid === $uid', '.write': false } }
};
const STRIPE_EVENTS = { '.read': false, '.write': false };
// .read only at $entryId: a get of one exact id works, a list of $code does not.
const REGISTRATION_STATUS = { '.read': false, '.write': false, $code: { $entryId: { '.read': true, '.write': false } } };

function build(live) {
    const out = JSON.parse(JSON.stringify(live));
    const r = out.rules;
    const fail = (why) => { throw new Error('LIVE HAS MOVED, refusing: ' + why); };
    const entry = r.registrations && r.registrations.$code && r.registrations.$code.$entryId;
    if (!entry) fail('no /registrations/$code/$entryId');
    if (entry['.validate'] !== ENTRY_VALIDATE_BEFORE) fail('/registrations/$code/$entryId/.validate differs from BEFORE');
    if (!entry.$other || entry.$other['.validate'] !== false) fail('registrations $other is not .validate false');
    for (const k of Object.keys(NEW_ENTRY_CHILDREN)) if (k in entry) fail('registrations already has ' + k);
    const t = r.tournaments && r.tournaments.$tourneyCode;
    if (!t) fail('no /tournaments/$tourneyCode');
    if ('fees' in t) fail('tournaments already has fees');
    if ('payments' in r) fail('payments already exists');
    if ('stripeEvents' in r) fail('stripeEvents already exists');
    if ('registrationStatus' in r) fail('registrationStatus already exists');

    entry['.validate'] = ENTRY_VALIDATE_AFTER;
    // Keep $other last for a readable diff.
    const other = entry.$other; delete entry.$other;
    Object.assign(entry, JSON.parse(JSON.stringify(NEW_ENTRY_CHILDREN)));
    entry.$other = other;
    t.fees = JSON.parse(JSON.stringify(FEES));
    r.payments = JSON.parse(JSON.stringify(PAYMENTS));
    r.stripeEvents = JSON.parse(JSON.stringify(STRIPE_EVENTS));
    r.registrationStatus = JSON.parse(JSON.stringify(REGISTRATION_STATUS));
    return out;
}

module.exports = { build, SERVER_ONLY, ENTRY_VALIDATE_BEFORE, ENTRY_VALIDATE_AFTER, NEW_ENTRY_CHILDREN, FEES, PAYMENTS, STRIPE_EVENTS, REGISTRATION_STATUS };

if (require.main === module) {
    const [src, dst] = process.argv.slice(2);
    if (!src || !dst) { console.error('usage: node tools/stripe-rules-candidate.js <live.json> <candidate.json>'); process.exit(2); }
    try {
        const cand = build(JSON.parse(fs.readFileSync(src, 'utf8')));
        fs.writeFileSync(dst, JSON.stringify(cand, null, 2) + '\n');
        console.log('wrote ' + dst);
    } catch (e) { console.error(e.message); process.exit(1); }
}
