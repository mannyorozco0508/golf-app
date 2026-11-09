#!/usr/bin/env node
// ============================================================================
// E4 PHOTO WALL RULES BLOCK (Realtime Database): LIVE -> CANDIDATE (2026-11-09)
//
//   node tools/event-photos-rules-candidate.js <live.json> <candidate.json>
//
// Same shape as tools/event-contests-rules-candidate.js: reads a copy of LIVE
// (read-only `database:get /.settings/rules`), refuses if LIVE has moved under
// anything it touches, writes the candidate. Applies on LIVE, on LIVE + Stripe
// and on LIVE + Stripe + E2 (the publish order is Stripe, E1, E2, E3, E4).
//
// THE DESIGN (one sentence): a golfer's card uploads the JPEG to Storage
// pending/ and, in ONE database update, writes its pending meta with a key
// proof; nothing is public until the organizer taps Show, which runs the
// approvePhoto callable (Admin SDK) that moves the file to shown/ and the meta
// to shown/. Storage rules cannot read this database, so the key is checked
// HERE (the meta) and again by the callable (the meta must exist).
//
// Changes, by path (nothing else in the file moves):
//   ADD /tournamentPhotoMeta/$code/pending/$photoId   create-only, with a proof
//        in the same update; read by the owner / co-organizer only
//   ADD /tournamentPhotoMeta/$code/shown              public read; no client write
//   ADD /tournamentPhotoMeta/$code/hidden             owner read; no client write
//   ADD /tournamentPhotoMeta/$code/reports            owner read; no client write
//   ADD /photoProofs/$code/$photoId                   the score-proof shape, create-only, no read
// The callables (Admin SDK) bypass all of it.
// ============================================================================
'use strict';
const fs = require('fs');
const { OWNER } = require('./event-contests-rules-candidate.js');

const WHO_RE = '/^(team[0-9]+|p[a-z0-9]+)$/';
const ROOT_FROM_PHOTO = 'newData.parent().parent().parent().parent()';
const PROOF = (field) => ROOT_FROM_PHOTO + ".child('photoProofs/' + $code + '/' + $photoId + '/" + field + "')";

const PHOTO_META = {
    $code: {
        pending: {
            '.read': OWNER('$code'),
            $photoId: {
                // Create only, on a LOCKED event, with a proof written in the same update.
                '.write': "!data.exists() && newData.exists() && root.child('tournamentKeys/' + $code + '/on').val() === true && " + PROOF('t') + '.val() === now',
                '.validate': "$photoId.matches(/^-?[A-Za-z0-9_-]{1,40}$/) && newData.hasChildren(['team', 'at', 'w', 'h']) && newData.child('team').val() === " + PROOF('who') + '.val()',
                team: { '.validate': 'newData.isString() && newData.val().matches(' + WHO_RE + ')' },
                caption: { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 120' },
                at: { '.validate': 'newData.isNumber()' },
                w: { '.validate': 'newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 1 && newData.val() <= 1600' },
                h: { '.validate': 'newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 1 && newData.val() <= 1600' },
                $other: { '.validate': false }
            }
        },
        shown: { '.read': true },
        hidden: { '.read': OWNER('$code') },
        reports: { '.read': OWNER('$code') }
    }
};
const PHOTO_PROOFS = {
    $code: {
        $photoId: {
            '.write': "!data.exists() && root.child('tournamentKeys/' + $code + '/on').val() === true && newData.child('t').val() === now"
                + " && (newData.child('k').val() === root.child('tournamentKeys/' + $code + '/t/' + newData.child('who').val()).val() || newData.child('k').val() === root.child('tournamentKeys/' + $code + '/p/' + newData.child('who').val()).val())",
            '.validate': "newData.hasChildren(['who', 'k', 't']) && newData.child('who').isString() && newData.child('who').val().matches(" + WHO_RE + ") && newData.child('k').isString() && newData.child('k').val().length >= 16 && newData.child('k').val().length <= 64 && newData.child('t').isNumber()",
            who: { '.validate': true }, k: { '.validate': true }, t: { '.validate': true },
            $other: { '.validate': false }
        }
    }
};

function build(live) {
    const out = JSON.parse(JSON.stringify(live));
    const r = out.rules;
    const fail = (why) => { throw new Error('LIVE HAS MOVED, refusing: ' + why); };
    if ('tournamentPhotoMeta' in r) fail('tournamentPhotoMeta already exists');
    if ('photoProofs' in r) fail('photoProofs already exists');
    if (!r.tournamentKeys || !r.tournamentKeys.$code) fail('no /tournamentKeys/$code (the scorecard lock)');
    if (!r.tournaments || !r.tournaments.$tourneyCode) fail('no /tournaments/$tourneyCode');
    if (!r.$other || r.$other['.read'] !== false || r.$other['.write'] !== false) fail('root $other is not closed');
    r.tournamentPhotoMeta = JSON.parse(JSON.stringify(PHOTO_META));
    r.photoProofs = JSON.parse(JSON.stringify(PHOTO_PROOFS));
    return out;
}

module.exports = { build, PHOTO_META, PHOTO_PROOFS };

if (require.main === module) {
    const [src, dst] = process.argv.slice(2);
    if (!src || !dst) { console.error('usage: node tools/event-photos-rules-candidate.js <live.json> <candidate.json>'); process.exit(2); }
    try {
        fs.writeFileSync(dst, JSON.stringify(build(JSON.parse(fs.readFileSync(src, 'utf8'))), null, 2) + '\n');
        console.log('wrote ' + dst);
    } catch (e) { console.error(e.message); process.exit(1); }
}
