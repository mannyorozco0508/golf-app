#!/usr/bin/env node
// ============================================================================
// E1 ANNOUNCEMENTS RULES BLOCK (2026-11-09, plan section 1)
//
//   node tools/e1-rules-candidate.js <live.json> <candidate.json>
//
// Built ON WHATEVER IT IS GIVEN: live today, or live + the blocks published
// before it (publish order: Stripe, E1, E2, E3, E4). It touches only its own
// paths. It refuses (exit 1) if any of them already exists or the owner grant
// it hangs on has changed shape, instead of half-applying.
//
//   ADD /tournaments/$tourneyCode/announcements/$id   the owner writes it (the
//       parent's .write - no grant here, a child grant could only widen it);
//       typed; text 1..200; tpl one of five; by = the writer; pushed is the
//       server's (Admin SDK) and no client may create, change or delete it
//   ADD /tournamentFollowers/$code/$uid               that uid writes its own
//       {at, team} on an event that exists; only the event's owner reads
//   ADD /announcementSends                            server-only: the rate
//       limit's clock (sendAnnouncement, 1 per minute per event)
// Reads: announcements sit under tournaments/$tourneyCode, public to read
// today (the board), so a scorecard reads them with no new grant.
//
// CO-ORGANIZERS. Live grants a co-organizer write on any tournaments child
// with no rule of its own ($coField). Naming `announcements` takes it out of
// $coField, so on this block only the OWNER writes announcements - what the
// plan says. A decision for Manny if co-organizers should send them too.
// ============================================================================
'use strict';
const fs = require('fs');

const OWNER = (codeVar) => "auth != null && auth.uid === root.child('tournaments/' + " + codeVar + " + '/ownerUid').val()";
const TEAM_KEY = '/^(team[0-9]+|g[a-z0-9]+)$/';

const ANNOUNCEMENTS = {
    $id: {
        '.validate': "$id.matches(/^[A-Za-z0-9_-]{1,40}$/) && newData.hasChildren(['text', 'tpl', 'at', 'by']) && newData.child('pushed').val() === data.child('pushed').val()",
        text: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 200' },
        tpl: { '.validate': "newData.isString() && (newData.val() === 'start' || newData.val() === 'weather' || newData.val() === 'resume' || newData.val() === 'results' || newData.val() === 'custom')" },
        at: { '.validate': 'newData.isNumber() && newData.val() <= now' },
        by: { '.validate': 'newData.isString() && (newData.val() === data.val() || (auth != null && newData.val() === auth.uid))' },
        pushed: { '.validate': 'newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= 0' },
        $other: { '.validate': false }
    }
};
const FOLLOWERS = {
    $code: {
        '.read': OWNER('$code'),
        $uid: {
            '.write': "auth != null && auth.uid === $uid && root.child('tournaments/' + $code).exists()",
            '.validate': "newData.hasChildren(['at', 'team'])",
            at: { '.validate': 'newData.isNumber() && newData.val() <= now' },
            team: { '.validate': 'newData.isString() && newData.val().matches(' + TEAM_KEY + ')' },
            $other: { '.validate': false }
        }
    }
};
const SENDS = { '.read': false, '.write': false };
const PATHS = ['/rules/tournaments/$tourneyCode/announcements', '/rules/tournamentFollowers', '/rules/announcementSends'];

const clone = (o) => JSON.parse(JSON.stringify(o));
function build(live) {
    const out = clone(live);
    const r = out.rules;
    const fail = (why) => { throw new Error('E1: LIVE HAS MOVED, refusing: ' + why); };
    const t = r.tournaments && r.tournaments.$tourneyCode;
    if (!t) fail('no /tournaments/$tourneyCode');
    if (t['.read'] !== true) fail('/tournaments/$tourneyCode/.read is not true (the board is no longer public)');
    if (typeof t['.write'] !== 'string' || t['.write'].indexOf("data.child('ownerUid').val() === auth.uid") === -1) fail('/tournaments/$tourneyCode/.write is not the owner grant this block hangs on');
    if ('announcements' in t) fail('tournaments already has announcements');
    if ('tournamentFollowers' in r) fail('tournamentFollowers already exists');
    if ('announcementSends' in r) fail('announcementSends already exists');
    t.announcements = clone(ANNOUNCEMENTS);
    r.tournamentFollowers = clone(FOLLOWERS);
    r.announcementSends = clone(SENDS);
    return out;
}

module.exports = { build, PATHS, ANNOUNCEMENTS, FOLLOWERS, SENDS };

if (require.main === module) {
    const [src, dst] = process.argv.slice(2);
    if (!src || !dst) { console.error('usage: node tools/e1-rules-candidate.js <live.json> <candidate.json>'); process.exit(2); }
    try {
        fs.writeFileSync(dst, JSON.stringify(build(JSON.parse(fs.readFileSync(src, 'utf8'))), null, 2) + '\n');
        console.log('wrote ' + dst);
    } catch (e) { console.error(e.message); process.exit(1); }
}
