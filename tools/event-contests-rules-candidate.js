#!/usr/bin/env node
// ============================================================================
// E2 CONTEST HOLES RULES BLOCK: LIVE rules -> CANDIDATE (2026-11-09)
//
//   node tools/event-contests-rules-candidate.js <live.json> <candidate.json>
//
// Reads a copy of the LIVE rules (read-only `database:get /.settings/rules`),
// checks every node it touches is exactly what it was when this block was
// written, and writes the candidate. If LIVE has moved under a touched path it
// refuses (exit 1) instead of half-applying. Publish order (plan): Stripe, E1,
// E2, E3, E4 - build() also applies cleanly on top of the Stripe candidate,
// and stripe_rules_emulator-style tests prove both orders.
//
// Changes, by path (nothing else in the file moves):
//   ADD   /tournaments/$tourneyCode/contests/$hole   typing only. WHO writes it
//         is unchanged: tournaments/<code> is already the owner's (and a
//         co-organizer's) on LIVE, and a golfer's link cannot write there, so
//         "only the owner changes winner" is LIVE's rule, kept.
//   ADD   /contestEntries/$code/$hole/$entryKey      public read; written by the
//         owner, or by a golfer's card with a proof in the SAME update, exactly
//         like a score (t === now; on a locked event k is that team's key).
//         Refused once the hole has a confirmed winner (lockedAt). Bounded:
//         inches 0..1200, yards 50..450. $other: false - so no field can carry
//         a latitude or a longitude.
//   ADD   /contestProofs/$code/$hole/$entryKey       the scoreProofs shape; no read.
// The Admin SDK bypasses all of it.
// ============================================================================
'use strict';
const fs = require('fs');

// Owner or co-organizer of tournaments/<c> - the same two LIVE already lets
// write tournaments/<c> (its .write and $coField).
const OWNER = (c) => "auth != null && (auth.uid === root.child('tournaments/' + " + c + " + '/ownerUid').val() || (auth.token.email != null && root.child('tournaments/' + " + c + " + '/coOrganizers/' + auth.token.email.toLowerCase().replace('.', ',')).val() === true))";
const HOLE_RE = '/^h([1-9]|1[0-8])$/';
const ENTRY_RE = '/^(team[0-9]+_p[0-9]+|p[a-z0-9]+)$/';
const WHO_RE = '/^(team[0-9]+|p[a-z0-9]+)$/';
const INT = (lo, hi) => 'newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= ' + lo + ' && newData.val() <= ' + hi;
const C = "'tournaments/' + $code + '/contests/' + $hole";

const CONTESTS = {
    $hole: {
        '.validate': '$hole.matches(' + HOLE_RE + ") && newData.hasChildren(['kind', 'allowGps'])",
        kind: { '.validate': "newData.isString() && (newData.val() === 'kp' || newData.val() === 'ld')" },
        fairwayOnly: { '.validate': 'newData.isBoolean()' },
        allowGps: { '.validate': 'newData.isBoolean()' },
        // A winner is an entry that exists, set with its lock (Make winner).
        winner: { '.validate': "newData.isString() && newData.parent().hasChild('lockedAt') && root.child('contestEntries/' + $tourneyCode + '/' + $hole + '/' + newData.val()).exists()" },
        lockedAt: { '.validate': 'newData.isNumber()' },
        $other: { '.validate': false }
    }
};

const ENTRY_WRITE = OWNER('$code') + ' || (root.child(' + C + " + '/kind').exists() && !root.child(" + C + " + '/lockedAt').exists() && "
    + "(root.child('tournamentKeys/' + $code + '/on').val() !== true || newData.parent().parent().parent().parent().child('contestProofs/' + $code + '/' + $hole + '/' + $entryKey + '/t').val() === now))";
const ENTRY_VALIDATE = '$hole.matches(' + HOLE_RE + ') && $entryKey.matches(' + ENTRY_RE + ") && newData.hasChildren(['name', 'team', 'kind', 'by', 'at'])"
    + ' && newData.child(\'kind\').val() === root.child(' + C + " + '/kind').val()"
    + " && ((newData.child('kind').val() === 'kp' && newData.hasChild('inches') && !newData.hasChild('yards')) || (newData.child('kind').val() === 'ld' && newData.hasChild('yards') && !newData.hasChild('inches')))"
    + " && (newData.child('by').val() === 'typed' || root.child(" + C + " + '/allowGps').val() === true)"
    + " && (!$entryKey.beginsWith('team') || $entryKey.beginsWith(newData.child('team').val() + '_'))";
const CONTEST_ENTRIES = {
    $code: {
        '.read': true,
        $hole: {
            $entryKey: {
                '.write': ENTRY_WRITE,
                '.validate': ENTRY_VALIDATE,
                name: { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 60' },
                team: { '.validate': "newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{1,40}$/)" },
                kind: { '.validate': "newData.isString() && (newData.val() === 'kp' || newData.val() === 'ld')" },
                inches: { '.validate': INT(0, 1200) },
                yards: { '.validate': INT(50, 450) },
                by: { '.validate': "newData.isString() && (newData.val() === 'typed' || newData.val() === 'gps')" },
                accFt: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 300' },
                at: { '.validate': 'newData.isNumber()' },
                $other: { '.validate': false }
            }
        }
    }
};
// The scoreProofs rule, keyed by hole and entry. On a locked event k must be
// the key of the team (t/<team>) or golfer (p/<pid>) named by who, and the
// entry must be that team's or that golfer's.
const PROOF_WRITE = "root.child('tournaments/' + $code).exists() && (root.child('tournamentKeys/' + $code + '/on').val() !== true || (newData.child('t').val() === now"
    + " && ($entryKey === newData.child('who').val() || $entryKey.beginsWith(newData.child('who').val() + '_'))"
    + " && (newData.child('k').val() === root.child('tournamentKeys/' + $code + '/t/' + newData.child('who').val()).val() || newData.child('k').val() === root.child('tournamentKeys/' + $code + '/p/' + newData.child('who').val()).val())))";
const PROOF_VALIDATE = "newData.hasChildren(['who', 'k', 't']) && newData.child('who').isString() && newData.child('who').val().matches(" + WHO_RE + ") && newData.child('k').isString() && newData.child('k').val().length >= 16 && newData.child('k').val().length <= 64 && newData.child('t').isNumber()";
const CONTEST_PROOFS = {
    $code: { $hole: { $entryKey: {
        '.write': PROOF_WRITE,
        '.validate': PROOF_VALIDATE,
        who: { '.validate': true }, k: { '.validate': true }, t: { '.validate': true },
        $other: { '.validate': false }
    } } }
};

function build(live) {
    const out = JSON.parse(JSON.stringify(live));
    const r = out.rules;
    const fail = (why) => { throw new Error('LIVE HAS MOVED, refusing: ' + why); };
    const t = r.tournaments && r.tournaments.$tourneyCode;
    if (!t) fail('no /tournaments/$tourneyCode');
    if (typeof t['.write'] !== 'string' || t['.write'].indexOf("data.child('ownerUid').val() === auth.uid") === -1) fail('tournaments/$tourneyCode/.write is no longer owner-only');
    if ('contests' in t) fail('tournaments already has contests');
    if ('contestEntries' in r) fail('contestEntries already exists');
    if ('contestProofs' in r) fail('contestProofs already exists');
    if (!r.tournamentKeys || !r.tournamentKeys.$code) fail('no /tournamentKeys/$code (the scorecard lock)');
    if (!r.$other || r.$other['.read'] !== false || r.$other['.write'] !== false) fail('root $other is not closed');
    t.contests = JSON.parse(JSON.stringify(CONTESTS));
    r.contestEntries = JSON.parse(JSON.stringify(CONTEST_ENTRIES));
    r.contestProofs = JSON.parse(JSON.stringify(CONTEST_PROOFS));
    return out;
}

module.exports = { build, CONTESTS, CONTEST_ENTRIES, CONTEST_PROOFS, OWNER };

if (require.main === module) {
    const [src, dst] = process.argv.slice(2);
    if (!src || !dst) { console.error('usage: node tools/event-contests-rules-candidate.js <live.json> <candidate.json>'); process.exit(2); }
    try {
        const cand = build(JSON.parse(fs.readFileSync(src, 'utf8')));
        fs.writeFileSync(dst, JSON.stringify(cand, null, 2) + '\n');
        console.log('wrote ' + dst);
    } catch (e) { console.error(e.message); process.exit(1); }
}
