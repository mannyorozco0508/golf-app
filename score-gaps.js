// ============================================================================
// GolfApp — Score Gaps (SHARED, v192, 2026-09-22)
//
// ONE BUILDER FOR "A HOLE INSIDE A CARD IS BLANK". On 2026-09-21 a golfer had
// no score on hole 1; his total read four strokes better than he shot and
// nobody knew why until the card was read hole by hole. The Board summed the
// holes he had (money-engine.js computeNetToParStandings, deliberately) and
// said "thru 17"; nothing on any surface said a hole INSIDE the card was
// empty. Every surface now draws the same answer from here: the scorecard
// outlines the box and names it, the Board flags the total, the money pages
// say "Not final".
//
// A GAP is a blank hole BEFORE a golfer's last scored hole, walked in the
// order the group plays. THE COURSE IS CIRCULAR: a group that starts on 10
// (a back nine, a shotgun start) plays 10..18 then 1..9, and holes 1-9 blank
// while it is on 14 are not gaps. So, per GROUP:
//   start hole = the hole in courseData order after the LONGEST run of holes
//     on which NO golfer in the group has a score (where the group's scoring
//     begins). Ties for the longest run, or a group with no scores at all,
//     or a course with no blank hole: start = courseData[0].
//   then per golfer, walk courseData circularly from that start; every blank
//     before the golfer's last scored hole IN THAT WALK is a gap. The hole
//     being played is never a gap (nothing after it is scored yet). A golfer
//     who has not started has none.
// KNOWN LIMIT (HANDOFF.md): a group that skips a hole together - every golfer
// blank on hole 1, all scored 2-17 - reads as having started on 2, and the
// missed hole is not a gap. Finish Round's "still missing" list, which counts
// every blank in the field, is what catches that at the end.
//
// courseData is walked IN ITS OWN ORDER, never sorted: a back nine is 10..18,
// a course entered out of order stays as entered.
//
// NO ENGINE HERE. Nothing in this file changes a total, a position or a
// dollar; the surfaces DRAW from it. It reads scores the way every engine
// does: scores['p<id>_h<hole>'] > 0 is a score.
// ============================================================================

// The group's start index into courseData (see above).
function groupStartIndex(groupPlayers, courseData, scores) {
    const holes = courseData || [];
    const n = holes.length;
    if (n === 0) return 0;
    const s = scores || {};
    const scored = holes.map(h => (groupPlayers || []).some(p => p && s['p' + p.id + '_h' + h.hole] > 0));
    if (!scored.some(Boolean)) return 0;          // nothing scored: courseData[0]
    if (scored.every(Boolean)) return 0;          // no blank hole: courseData[0]
    // Runs of blank holes, circularly: start each run at a blank whose
    // predecessor (circular) is scored, then extend.
    const runs = [];
    for (let i = 0; i < n; i++) {
        if (scored[i]) continue;
        const prev = (i - 1 + n) % n;
        if (!scored[prev]) continue;              // inside a run, not its head
        let len = 0, j = i;
        while (!scored[j] && len < n) { len++; j = (j + 1) % n; }
        runs.push({ head: i, len: len, after: j });
    }
    let best = null, tie = false;
    runs.forEach(r => {
        if (!best || r.len > best.len) { best = r; tie = false; }
        else if (r.len === best.len) tie = true;
    });
    if (!best || tie) return 0;
    return best.after;
}

// The gaps of one group: [{ id, name, holes: [hole numbers in walk order], last: hole }].
function findScoreGaps(groupPlayers, courseData, scores) {
    const holes = courseData || [];
    const n = holes.length;
    const s = scores || {};
    if (n === 0) return [];
    const start = groupStartIndex(groupPlayers, holes, s);
    const out = [];
    (groupPlayers || []).forEach(p => {
        if (!p) return;
        const walk = [];
        for (let k = 0; k < n; k++) walk.push(holes[(start + k) % n]);
        let lastK = -1;
        walk.forEach((h, k) => { if (s['p' + p.id + '_h' + h.hole] > 0) lastK = k; });
        if (lastK <= 0) return;                   // not started, or only the first hole of the walk
        const gaps = [];
        for (let k = 0; k < lastK; k++) { if (!(s['p' + p.id + '_h' + walk[k].hole] > 0)) gaps.push(walk[k].hole); }
        if (gaps.length) out.push({ id: p.id, name: p.name, holes: gaps, last: walk[lastK].hole });
    });
    return out;
}

// The whole field, group by group. `boundaries` is computeGroupBoundaries()'s
// array ({ startIdx, size }); absent, the field is one group.
function findScoreGapsByGroup(players, courseData, scores, boundaries) {
    const all = players || [];
    const bs = (Array.isArray(boundaries) && boundaries.length) ? boundaries : [{ startIdx: 0, size: all.length }];
    let out = [];
    bs.forEach(b => { out = out.concat(findScoreGaps(all.slice(b.startIdx, b.startIdx + b.size), courseData, scores)); });
    return out;
}

// "hole 1" / "holes 2, 5"
function holesPhrase(holes) {
    const h = holes || [];
    return (h.length === 1 ? 'hole ' : 'holes ') + h.join(', ');
}
// "Marty: hole 1 has no score"   (shownName: the caller's display name)
function gapLine(gap, shownName) {
    const h = gap.holes || [];
    return shownName + ': ' + holesPhrase(h) + (h.length === 1 ? ' has' : ' have') + ' no score';
}
// "Not final — Marty is missing hole 1; Kopp is missing holes 2, 5"
// `extras` (2026-09-22): more phrases for the same line - the KP hold, below.
function notFinalLine(gaps, shownNameOf, extras) {
    const parts = (gaps || []).map(g => shownNameOf(g) + ' is missing ' + holesPhrase(g.holes)).concat(extras || []);
    if (parts.length === 0) return '';
    return 'Not final — ' + parts.join('; ');
}
// THE KP HOLD (2026-09-22, KP money never refunds). A KP hole with no
// recorded winner - blank, a winner who is out of the round, or "nobody" on a
// round with no skins pot - holds the round open until it is recorded. From
// pool-engine's result: the unresolved lines' holes, as a phrase for the
// Not-final line: "KP on hole 15 not recorded" / "KP on holes 7, 12 not recorded".
// ON A LIVE ROUND only a hole the field has PLAYED is "not recorded": a KP
// hole nobody has reached yet is not late, it is not yet. `played(hole)` is the
// caller's predicate (holePlayedByField below); without one every held hole is
// named, which is right once the cards are in.
function kpHeldHoles(kp, played) {
    return ((kp && kp.lines) || []).filter(l => l.state === 'unresolved' && (!played || played(l.hole))).map(l => l.hole);
}
function kpHoldPhrase(kp, played) {
    const holes = kpHeldHoles(kp, played);
    return holes.length ? 'KP on ' + holesPhrase(holes) + ' not recorded' : '';
}
// Every golfer who has teed off (any score at all) has a score on this hole.
// A roster name with no score never teed off and is not waited for - the same
// reading settlement-engine's computeRoundFinish gives a finished round.
function holePlayedByField(players, scores, hole) {
    const sc = scores || {};
    const started = (players || []).filter(p => Object.keys(sc).some(k => k.indexOf('p' + p.id + '_h') === 0));
    return started.length > 0 && started.every(p => sc['p' + p.id + '_h' + hole] !== undefined && sc['p' + p.id + '_h' + hole] !== null && sc['p' + p.id + '_h' + hole] !== '');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { groupStartIndex, findScoreGaps, findScoreGapsByGroup, holesPhrase, gapLine, notFinalLine, kpHeldHoles, kpHoldPhrase, holePlayedByField };
}
