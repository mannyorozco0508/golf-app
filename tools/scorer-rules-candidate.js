#!/usr/bin/env node
// ============================================================================
// ONE SCORER PER GROUP, A - THE JOIN RECORD RULES (ADVISOR-20261114-1527)
// A CANDIDATE, NOT PUBLISHED.
//
//   node tools/scorer-rules-candidate.js <live.json> <candidate.json>
//
// Built ON WHATEVER IT IS GIVEN (a fresh live read). Touches only its own
// path, tournaments/$tourneyCode/joins; refuses (exit 1) if that already
// exists or the node it hangs on changed shape. Publishing needs Manny's own
// OK; this file never deploys anything.
//
// WHY A RULES CHANGE AT ALL. tournaments/$tourneyCode is written by its owner
// (and co-organizers) only, so the watch card's "That's me" - a golfer with
// the event code and no sign-in - is refused live. This adds ONE grant:
//
//   ADD  tournaments/$tourneyCode/joins/$entry/$slot = { name, at }
//        .write  anyone (no auth needed: the watch card signs nobody in), on an
//                owned event, CREATE OR UPDATE only (newData.exists()). A
//                delete falls to the event's own .write: the owner (and
//                co-organizers) clear a wrong tap; a golfer cannot.
//        .validate, for everyone:
//          $entry  team<N> that exists on the event | <gid> a group on the
//                  event | <rid>_<gid> a group in a round that exists
//          $slot   p<i> (a team card's place) | <pid> (an individual event)
//          name    exactly the roster's name for that slot: teams/<entry>/
//                  players/<i> on a team event, players/<pid>/name otherwise
//                  (so a join cannot put any other text on the scorer's card)
//          at      a number, not in the future (the page sends server time)
//          nothing else ($other false) - no email, phone or uid.
//
// NOTHING ELSE OPENS. Scores, proofs, keys and registrations keep the rules
// they have; a joiner reaches none of them through this.
//
// SWITCH SCORER NEEDS NO RULE. The organizer's write of a new key to
// tournamentKeys/<code>/... is the owner grant already live (".write": the
// event's ownerUid; only "on" is validated), and scorers/<entry> sits under
// the owner's tournaments/<code> grant (no closed schema there). Both are
// proven against the live read-back in tournament_scorer_rules_test.js.
// ============================================================================
'use strict';
const fs = require('fs');

const OWNED = "root.child('tournaments/' + $tourneyCode + '/ownerUid').exists()";
const JOIN = {
    '$entry': {
        '$slot': {
            '.write': 'newData.exists() && ' + OWNED,
            '.validate': "newData.hasChildren(['name', 'at']) && $slot.matches(/^p[a-z0-9]{1,40}$/) && ("
                + "($entry.matches(/^team[0-9]{1,4}$/) && root.child('tournaments/' + $tourneyCode + '/teams/' + $entry).exists())"
                + " || ($entry.matches(/^g[a-z0-9]{1,40}$/) && root.child('tournaments/' + $tourneyCode + '/scoringGroups/' + $entry).exists())"
                + " || ($entry.matches(/^r[a-z0-9]{1,40}_g[a-z0-9]{1,40}$/) && root.child('tournaments/' + $tourneyCode + '/rounds').exists()))",
            'name': {
                '.validate': "newData.isString() && newData.val().length >= 1 && newData.val().length <= 120 && ("
                    + "($entry.beginsWith('team') && $slot.matches(/^p[0-9]{1,2}$/) && newData.val() === root.child('tournaments/' + $tourneyCode + '/teams/' + $entry + '/players/' + $slot.replace('p', '')).val())"
                    + " || (!$entry.beginsWith('team') && newData.val() === root.child('tournaments/' + $tourneyCode + '/players/' + $slot + '/name').val()))"
            },
            'at': { '.validate': 'newData.isNumber() && newData.val() > 0 && newData.val() <= now' },
            '$other': { '.validate': false }
        }
    }
};
const PATHS = ['/rules/tournaments/$tourneyCode/joins'];

const clone = (o) => JSON.parse(JSON.stringify(o));
function build(live) {
    const out = clone(live);
    const fail = (why) => { throw new Error('SCORER: LIVE HAS MOVED, refusing: ' + why); };
    const t = out.rules && out.rules.tournaments && out.rules.tournaments.$tourneyCode;
    if (!t) fail('no /tournaments/$tourneyCode');
    if (typeof t['.write'] !== 'string' || t['.write'].indexOf('ownerUid') === -1) fail('$tourneyCode .write is not the owner grant a delete falls back to');
    if (t['.read'] !== true) fail('$tourneyCode is no longer public to read (the watch card and the Desk read joins there)');
    if ('joins' in t) fail('$tourneyCode already has joins');
    if (t.$other && t.$other['.validate'] === false) fail('$tourneyCode became a closed schema; re-read before adding a child');
    t.joins = clone(JOIN);
    return out;
}

module.exports = { build, PATHS, JOIN };

if (require.main === module) {
    const [src, dst] = process.argv.slice(2);
    if (!src || !dst) { console.error('usage: node tools/scorer-rules-candidate.js <live.json> <candidate.json>'); process.exit(2); }
    try {
        fs.writeFileSync(dst, JSON.stringify(build(JSON.parse(fs.readFileSync(src, 'utf8'))), null, 2) + '\n');
        console.log('wrote ' + dst);
    } catch (err) { console.error(err.message); process.exit(1); }
}
