#!/usr/bin/env node
// ============================================================================
// E3 PACE OF PLAY RULES BLOCK (2026-11-09, plan section 3)
//
//   node tools/e3-rules-candidate.js <live.json> <candidate.json>
//
// Built ON WHATEVER IT IS GIVEN: live, or live + the blocks before it (publish
// order: Stripe, E1, E2, E3, E4). Touches only its own paths; refuses (exit 1)
// if one already exists or a node it hangs on changed shape.
//
//   ADD  /tournaments/$tourneyCode/pace           {on, targetMin 120..360},
//        owner (the parent's .write; no grant here), typed, nothing else
//   ADD  /tournaments/$tourneyCode/nudges/$team   {at, tpl:'pace1', thru 0..18},
//        owner, typed. Public to read like the board: a template id and a hole
//        count, nothing personal. $team is a team key (team4) or group id (g...).
//        `thru` is the one field the plan's {at, tpl} lacks: it is what lets a
//        card know the nudge is over ("until the team scores the next hole") -
//        a golfer's card cannot read score times.
//   ADD  /scoreProofs/$code/.read                 the event's OWNER reads the
//        proofs. Their t is the server's own time of each score - the only
//        score times that exist, and what pace is computed from (scores only,
//        no location ever). A proof's k is the team key, which the owner can
//        already read at tournamentKeys/<code>. Nothing else on scoreProofs moves.
//
// CO-ORGANIZERS: naming pace / nudges takes them out of live's $coField, so
// only the owner writes them (the plan's wording). Manny's call to widen.
// ============================================================================
'use strict';
const fs = require('fs');

const OWNER = (codeVar) => "auth != null && auth.uid === root.child('tournaments/' + " + codeVar + " + '/ownerUid').val()";
const INT = (lo, hi) => 'newData.isNumber() && newData.val() % 1 === 0 && newData.val() >= ' + lo + ' && newData.val() <= ' + hi;

const PACE = {
    '.validate': "newData.hasChildren(['on', 'targetMin'])",
    on: { '.validate': 'newData.isBoolean()' },
    targetMin: { '.validate': INT(120, 360) },
    $other: { '.validate': false }
};
const NUDGES = {
    $team: {
        '.validate': "$team.matches(/^(team[0-9]+|g[a-z0-9]+)$/) && newData.hasChildren(['at', 'tpl', 'thru'])",
        at: { '.validate': 'newData.isNumber() && newData.val() <= now' },
        tpl: { '.validate': "newData.val() === 'pace1'" },
        thru: { '.validate': INT(0, 18) },
        $other: { '.validate': false }
    }
};
const PROOFS_READ = OWNER('$code');
const PATHS = ['/rules/tournaments/$tourneyCode/pace', '/rules/tournaments/$tourneyCode/nudges', '/rules/scoreProofs/$code/.read'];

const clone = (o) => JSON.parse(JSON.stringify(o));
function build(live) {
    const out = clone(live);
    const r = out.rules;
    const fail = (why) => { throw new Error('E3: LIVE HAS MOVED, refusing: ' + why); };
    const t = r.tournaments && r.tournaments.$tourneyCode;
    if (!t) fail('no /tournaments/$tourneyCode');
    if (t['.read'] !== true) fail('/tournaments/$tourneyCode/.read is not true (the board is no longer public)');
    if (typeof t['.write'] !== 'string' || t['.write'].indexOf("data.child('ownerUid').val() === auth.uid") === -1) fail('/tournaments/$tourneyCode/.write is not the owner grant this block hangs on');
    if ('pace' in t) fail('tournaments already has pace');
    if ('nudges' in t) fail('tournaments already has nudges');
    const sp = r.scoreProofs && r.scoreProofs.$code;
    if (!sp || !sp.$scoreKey || !sp.r) fail('/scoreProofs/$code is not the scorecard-lock shape');
    if ('.read' in sp) fail('/scoreProofs/$code already has a .read');
    if ('.read' in r.scoreProofs) fail('/scoreProofs already has a .read');
    t.pace = clone(PACE);
    t.nudges = clone(NUDGES);
    r.scoreProofs.$code = Object.assign({ '.read': PROOFS_READ }, sp);
    return out;
}

module.exports = { build, PATHS, PACE, NUDGES, PROOFS_READ };

if (require.main === module) {
    const [src, dst] = process.argv.slice(2);
    if (!src || !dst) { console.error('usage: node tools/e3-rules-candidate.js <live.json> <candidate.json>'); process.exit(2); }
    try {
        fs.writeFileSync(dst, JSON.stringify(build(JSON.parse(fs.readFileSync(src, 'utf8'))), null, 2) + '\n');
        console.log('wrote ' + dst);
    } catch (e) { console.error(e.message); process.exit(1); }
}
