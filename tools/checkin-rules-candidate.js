#!/usr/bin/env node
// ============================================================================
// CHECK-IN RULES BLOCK (CI-FINAL, 2026-11-14) - A CANDIDATE, NOT PUBLISHED
//
//   node tools/checkin-rules-candidate.js <live.json> <candidate.json>
//
// Built ON WHATEVER IT IS GIVEN (a fresh live read). Touches only its own
// paths under registrations/$code/$entryId; refuses (exit 1) if one already
// exists or the node it hangs on changed shape. Publishing needs Manny's own
// OK; this file never deploys anything.
//
// WHY A RULES CHANGE AT ALL. registrations/$code/$entryId is a CLOSED schema
// ("$other": { ".validate": false }), so a key the rules do not name is refused
// for EVERYONE - the owner's "Mark arrived" on the Desk as well as the golfer's
// "I'm here" at the table. And the node is owner-only to read (it holds email
// and phone), so the table page and the TV cannot see who has arrived.
//
//   ADD  .../$entryId/arrivedAt   typed (a positive number).
//        .write (golfer arm): only when it does not exist yet, only in the
//        same write as arrivedBy 'golfer'. .validate: only on an approved
//        entry (approvedAt present) - for everyone, so a public signup create
//        cannot carry an arrival in. Never changed or cleared by the golfer. The owner
//        (and co-organizers) keep the entry-level grant: set and clear.
//        .read true: an arrival time, readable one entry at a time by anyone
//        holding the entry id (the table page and the TV list the ids from
//        tournaments/<code>/checkin). Nothing else on the entry opens.
//   ADD  .../$entryId/arrivedBy   'golfer' | 'organizer'.
//        .write (golfer arm): 'golfer' only, only together with the first
//        arrivedAt (whose .validate needs the approved entry).
//   ADD  .../$entryId/paid/.read  true: the golfer's own "Your $85 entry shows
//        unpaid" line reads it. THIS MAKES PAID / UNPAID READABLE BY ANYONE
//        WITH THE EVENT CODE AND AN ENTRY ID (the ids are public in the check-in
//        list) - Manny's call; drop this one leaf and the amber line simply
//        never shows (the page treats a refused read as "unknown").
//
// NO AUTH IS REQUIRED FOR THE GOLFER ARM: tournament.html does not sign a
// golfer in. Anyone holding the code can mark any approved golfer arrived -
// that is what self check-in at a table is; the Desk's Undo arrival fixes a
// wrong tap.
// ============================================================================
'use strict';
const fs = require('fs');

const ARRIVED_AT = {
    '.read': true,
    '.write': "!data.exists() && newData.exists() && newData.parent().child('arrivedBy').val() === 'golfer'",
    // An arrival needs an approved entry for everyone, the owner included: a
    // public signup create cannot carry one in (the entry-level create grant
    // would otherwise let it ride along).
    '.validate': "newData.isNumber() && newData.val() > 0 && newData.parent().child('approvedAt').exists()"
};
const ARRIVED_BY = {
    '.write': "!data.exists() && newData.val() === 'golfer' && newData.parent().child('arrivedAt').exists() && !data.parent().child('arrivedAt').exists()",
    '.validate': "newData.isString() && (newData.val() === 'golfer' || newData.val() === 'organizer') && newData.parent().child('arrivedAt').exists()"
};
const PATHS = [
    '/rules/registrations/$code/$entryId/arrivedAt',
    '/rules/registrations/$code/$entryId/arrivedBy',
    '/rules/registrations/$code/$entryId/paid/.read'
];

const clone = (o) => JSON.parse(JSON.stringify(o));
function build(live) {
    const out = clone(live);
    const fail = (why) => { throw new Error('CHECK-IN: LIVE HAS MOVED, refusing: ' + why); };
    const reg = out.rules && out.rules.registrations && out.rules.registrations.$code;
    if (!reg) fail('no /registrations/$code');
    const e = reg.$entryId;
    if (!e) fail('no /registrations/$code/$entryId');
    if (!e.$other || e.$other['.validate'] !== false) fail('$entryId is no longer a closed schema ($other .validate false)');
    if (typeof e['.write'] !== 'string' || e['.write'].indexOf("auth.uid === root.child('tournaments/' + $code + '/ownerUid').val()") === -1) fail('$entryId .write is not the owner grant this block relies on for set and clear');
    if (!e.approvedAt) fail('$entryId has no approvedAt (the golfer arm hangs on it)');
    if (!e.paid || e.paid['.validate'] !== 'newData.isBoolean()') fail('$entryId/paid is not the typed boolean');
    if ('.read' in e.paid) fail('$entryId/paid already has a .read');
    if ('arrivedAt' in e) fail('$entryId already has arrivedAt');
    if ('arrivedBy' in e) fail('$entryId already has arrivedBy');
    e.paid = Object.assign({ '.read': true }, e.paid);
    // Inserted before $other so the file reads in the order a human checks it.
    const next = {};
    Object.keys(e).forEach((k) => {
        if (k === '$other') { next.arrivedAt = clone(ARRIVED_AT); next.arrivedBy = clone(ARRIVED_BY); }
        next[k] = e[k];
    });
    reg.$entryId = next;
    return out;
}

module.exports = { build, PATHS, ARRIVED_AT, ARRIVED_BY };

if (require.main === module) {
    const [src, dst] = process.argv.slice(2);
    if (!src || !dst) { console.error('usage: node tools/checkin-rules-candidate.js <live.json> <candidate.json>'); process.exit(2); }
    try {
        fs.writeFileSync(dst, JSON.stringify(build(JSON.parse(fs.readFileSync(src, 'utf8'))), null, 2) + '\n');
        console.log('wrote ' + dst);
    } catch (err) { console.error(err.message); process.exit(1); }
}
