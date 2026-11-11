#!/usr/bin/env node
// ============================================================================
// MY EVENTS BY ACCOUNT (P2-6; Advisor 2026-11-11 16:19): the rules block that
// lets an organizer's page list the tournaments that organizer owns, on any
// device. A CANDIDATE: it is never published from this lane (the iOS lane
// publishes rules, after Manny's OK).
//
//   ADD   /organizers/$uid/tournaments/$code = { at, name, course? }
//
// It mirrors the block the live rules already hold for the round app,
// organizers/$uid/rounds/$code (written by my-rounds.js), with one change:
// the pointer must name a tournament the uid OWNS (tournaments/$code/ownerUid),
// where the rounds block checks events/ and trips/. Only the uid writes under
// its own node; organizers/$uid already reads only for that uid, so the list is
// private to its owner. A pointer may be removed (null). Nothing else moves.
//
//   node tools/my-events-rules-candidate.js LIVE.json OUT.json
//   build(live) -> the candidate object; it refuses a live file that already
//   holds the block or lacks the organizers node it extends.
// ============================================================================
'use strict';
const fs = require('fs');

const CODE_RE = '/^[A-Z0-9]{4,10}$/';
const TOURNAMENTS = {
    $code: {
        '.write': 'auth != null && auth.uid === $uid',
        '.validate': 'newData.val() === null || ($code.matches(' + CODE_RE + ") && newData.hasChildren(['at', 'name']) && root.child('tournaments/' + $code + '/ownerUid').val() === $uid)",
        at: { '.validate': 'newData.isNumber() && newData.val() <= now' },
        name: { '.validate': 'newData.isString() && newData.val().length > 0 && newData.val().length <= 80' },
        course: { '.validate': 'newData.isString() && newData.val().length <= 80' },
        $other: { '.validate': false }
    }
};

function build(live) {
    const out = JSON.parse(JSON.stringify(live));
    const rules = out.rules || out;
    const org = rules.organizers && rules.organizers.$uid;
    if (!org) throw new Error('live rules have no organizers/$uid block to extend');
    if (!org.rounds) throw new Error('live organizers/$uid has no rounds block: this candidate mirrors it, so look again before adding');
    if ('tournaments' in org) throw new Error('live organizers/$uid already has a tournaments block');
    org.tournaments = JSON.parse(JSON.stringify(TOURNAMENTS));
    return out;
}

module.exports = { build, TOURNAMENTS };

if (require.main === module) {
    const [, , liveFile, outFile] = process.argv;
    if (!liveFile || !outFile) { console.error('usage: my-events-rules-candidate.js LIVE.json OUT.json'); process.exit(2); }
    const live = JSON.parse(fs.readFileSync(liveFile, 'utf8'));
    const cand = build(live);
    fs.writeFileSync(outFile, JSON.stringify(cand, null, 2) + '\n');
    console.log('candidate written: ' + outFile);
}
