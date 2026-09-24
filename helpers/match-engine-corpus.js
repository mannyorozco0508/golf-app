// ============================================================================
// THE calculateMatchEngine FIXTURE CORPUS — one definition, two readers.
//
// match_engine_parity_test.js asserts against it; tools/match-engine-golden.js
// records it. They must describe the SAME rounds or the goldens guard nothing,
// so the corpus lives here rather than being typed out twice.
//
// WHY THE NAMES CARRY PUNCTUATION. finalResult interpolates the winning team's
// FIRST TOKEN. The first version of this corpus used "Mike & Dave", whose first
// token is "Mike" - nothing to escape - and it reported the engine copies as
// identical when they were not. O'Brien, Ben&Jerry, A<b>C and Dee"Q each carry a
// character that HTML-escaping changes, so a difference in escaping cannot hide.
// ============================================================================

// A REAL layout where stroke index 1 is HOLE 7, so nothing here can pass by
// confusing hole number with stroke index.
const SI = { 7:1, 3:2, 12:3, 16:4, 1:5, 9:6, 5:7, 14:8, 18:9,
             2:10, 11:11, 8:12, 15:13, 4:14, 17:15, 6:16, 13:17, 10:18 };

const holes = (n, from = 1) => Array.from({ length: n }, (_, i) => ({
    hole: from + i,
    par: [4, 3, 5, 4, 4, 4, 3, 4, 5][(from + i - 1) % 9],
    hcpIndex: SI[from + i] || (from + i)
}));

const N = ["O'Brien", 'Ben&Jerry', 'A<b>C', 'Dee"Q'];

function team(names, hcps, teams, startId = 101) {
    return names.map((n, i) => ({ id: startId + i, name: n, hcp: String(hcps[i]), team: teams[i] }));
}

// A deterministic card: player i birdies a hole when (i + hole) % 3 === 0. Not a
// blowout, so halves, carries and live segments all appear on the same round.
//
// NOTE ON THE GROSS FIXTURES. With two scratch players this pattern alternates
// birdies, so a gross 1v1 ends ALL SQUARE at $0 with no finalResult. That is a
// case worth having - a closed-match assertion that only ever sees closed
// matches never proves the halved branch - but it is not a "closed early" round,
// and the labels below say which is which. `mutate` exists for the fixtures that
// need a decided result instead.
function card(players, thru, from = 1, mutate) {
    const s = {};
    players.forEach((p, i) => {
        for (let h = from; h < from + thru; h++) {
            s['p' + p.id + '_h' + h] = 4 + ((i + h) % 3 === 0 ? -1 : 0);
        }
    });
    if (mutate) mutate(s, players);
    return s;
}

const FIXTURES = [
    { label: '1v1 Match Play, gross, ends ALL SQUARE at $0',
      players: team([N[0], N[1]], [0, 0], ['Team 1', 'Team 2']),
      holes: holes(18), thru: 18, scoring: 'gross', format: 'match',
      pressRule: 'none', stake: 20, holeBet: 0, presses: [] },

    { label: '1v1 Match Play, gross, CLOSED EARLY - 10&8',
      // The closed branch in GROSS. Every net fixture below closes, but a
      // gross round reaches finalResult down a path where no stroke is given,
      // and that path had no fixture until v218.
      players: team([N[0], N[1]], [0, 0], ['Team 1', 'Team 2']),
      holes: holes(18), thru: 18, scoring: 'gross', format: 'match',
      pressRule: 'none', stake: 20, holeBet: 0, presses: [],
      mutate: (s, ps) => { for (let h = 1; h <= 18; h++) { s['p' + ps[0].id + '_h' + h] = 3; s['p' + ps[1].id + '_h' + h] = 5; } } },

    { label: '1v1 Match Play, NET - relative handicap, 18 vs 0',
      players: team([N[0], N[1]], [18, 0], ['Team 1', 'Team 2']),
      holes: holes(18), thru: 18, scoring: 'net', format: 'match',
      pressRule: 'none', stake: 20, holeBet: 0, presses: [] },

    { label: '2v2 Nassau, net, auto-press at 2 down',
      players: team(N, [0, 5, 12, 18], ['Team 1', 'Team 1', 'Team 2', 'Team 2']),
      holes: holes(18), thru: 18, scoring: 'net', format: 'nassau',
      pressRule: '2down', stake: 10, holeBet: 0, presses: [] },

    { label: '2v2 Best Ball, net, per-hole bet',
      players: team(N, [2, 7, 11, 20], ['Team 1', 'Team 1', 'Team 2', 'Team 2']),
      holes: holes(18), thru: 18, scoring: 'net', format: 'bestball',
      pressRule: 'none', stake: 0, holeBet: 5, presses: [] },

    { label: 'Nassau with a MANUAL press from hole 5',
      players: team([N[0], N[1]], [3, 9], ['Team 1', 'Team 2']),
      holes: holes(18), thru: 18, scoring: 'net', format: 'nassau',
      pressRule: 'none', stake: 10, holeBet: 0,
      presses: [{ baseId: '18', startHole: 5, stake: 40 }] },

    { label: 'NASSAU where SIDE A WINS every segment - money POSITIVE',
      // FOUND BY A CONTROL, NOT BY DESIGN. Mutating the Nassau branch of the
      // t1TotalMoney accumulation (match-engine.js:290, `if (m.status > 0)
      // t1TotalMoney += segStake(m)`) changed NOTHING in this corpus: every other
      // Nassau fixture has side A losing every segment, so the positive arm of that
      // branch was never executed. Half of the Nassau money path was untested.
      players: team([N[0], N[1]], [0, 0], ['Team 1', 'Team 2']),
      holes: holes(18), thru: 18, scoring: 'gross', format: 'nassau',
      pressRule: 'none', stake: 10, holeBet: 0, presses: [],
      mutate: (s, ps) => { for (let h = 1; h <= 18; h++) { s['p' + ps[0].id + '_h' + h] = 3; s['p' + ps[1].id + '_h' + h] = 5; } } },

    { label: 'Ryder Cup singles, gross - also ALL SQUARE, $0',
      players: team([N[0], N[1]], [0, 0], ['Team 1', 'Team 2']),
      holes: holes(18), thru: 18, scoring: 'gross', format: 'ryder',
      pressRule: 'none', stake: 25, holeBet: 0, presses: [] },

    // --- the cases v218's recon named as untested by the six-fixture run ---
    { label: 'NINE-HOLE round, net match - the match ends on 9',
      players: team([N[0], N[1]], [6, 14], ['Team 1', 'Team 2']),
      holes: holes(9), thru: 9, scoring: 'net', format: 'match',
      pressRule: 'none', stake: 20, holeBet: 0, presses: [] },

    { label: 'BACK NINE only, holes 10-18, net Nassau',
      players: team([N[0], N[1]], [4, 11], ['Team 1', 'Team 2']),
      holes: holes(9, 10), thru: 9, from: 10, scoring: 'net', format: 'nassau',
      pressRule: 'none', stake: 10, holeBet: 0, presses: [] },

    { label: 'PART-PLAYED: net Nassau thru 7 of 18, auto-press live',
      players: team(N, [1, 8, 15, 22], ['Team 1', 'Team 1', 'Team 2', 'Team 2']),
      holes: holes(18), thru: 7, scoring: 'net', format: 'nassau',
      pressRule: '2down', stake: 10, holeBet: 0, presses: [] },

    { label: 'RELATIVE HANDICAP 2v2 bestball - baseline off a non-zero low',
      players: team(N, [9, 13, 17, 24], ['Team 1', 'Team 1', 'Team 2', 'Team 2']),
      holes: holes(18), thru: 18, scoring: 'net', format: 'bestball',
      pressRule: 'none', stake: 20, holeBet: 0, presses: [] },

    { label: 'RELATIVE HANDICAP ryder 1v1, 24 vs 9 - strokes on 15 holes',
      players: team([N[0], N[1]], [24, 9], ['Team 1', 'Team 2']),
      holes: holes(18), thru: 18, scoring: 'net', format: 'ryder',
      pressRule: 'none', stake: 25, holeBet: 0, presses: [] },

    { label: 'GROSS Nassau - the relative branch must NOT engage',
      players: team([N[0], N[1]], [18, 0], ['Team 1', 'Team 2']),
      holes: holes(18), thru: 18, scoring: 'gross', format: 'nassau',
      pressRule: 'none', stake: 10, holeBet: 0, presses: [] },
];

// The engine's ten positional arguments, built from a fixture.
const argsFor = (f) => [f.players, f.holes, card(f.players, f.thru, f.from || 1, f.mutate),
    f.scoring, f.format, f.pressRule, f.stake, f.holeBet, f.presses, undefined];

// The three divergences v218 removed, normalised away so a FOURTH one cannot be
// absorbed silently. &amp; is decoded LAST: decoding it first would turn a
// literal "&amp;lt;" into "<" and invent an agreement.
const ENTITIES = [[/&#39;/g, "'"], [/&quot;/g, '"'], [/&lt;/g, '<'], [/&gt;/g, '>'], [/&amp;/g, '&']];
const decode = (s) => ENTITIES.reduce((acc, [re, ch]) => acc.replace(re, ch), s);

// EVERY FIELD THE ESCAPING REACHED, measured rather than assumed. The first
// version of this list held only activeMatches[].finalResult, because the SOURCE
// of the holeLog block is byte-identical in all three copies. The source is - but
// the holeLog copies finalResult into three more fields, so the escaped value
// propagated into totRes, f9Res and b9Res as well, and a comparison that
// normalised only the first field reported a difference in the other three and
// looked like a fourth divergence. It is not: it is one divergence, four fields.
const ESCAPED_FIELDS = ['finalResult', 'totRes', 'f9Res', 'b9Res'];

function normalise(v) {
    const c = (v === undefined ? null : JSON.parse(JSON.stringify(v)));
    if (c === null) return null;
    delete c.pressesByHole;   // index.html's dead key
    delete c.t1Players;       // stats.html's return dropped these two
    delete c.t2Players;
    const scrub = (o) => ESCAPED_FIELDS.forEach(k => {
        if (typeof o[k] === 'string') o[k] = decode(o[k]);
    });
    (c.activeMatches || []).forEach(scrub);
    Object.keys(c.holeLog || {}).forEach(h => scrub(c.holeLog[h]));
    return c;
}

// Every field path on which a page copy was ALLOWED to differ from the canonical
// engine. match_engine_parity_test.js asserts nothing outside this set ever did,
// which is what makes a fourth divergence a failure rather than a silent absorb.
const KNOWN_DIVERGENCES = [
    'pressesByHole',                  // index.html only, and read by nothing
    'activeMatches.N.finalResult',    // the escaping, and its three copies below
    'holeLog.N.totRes',
    'holeLog.N.f9Res',
    'holeLog.N.b9Res',
    't1Players', 't2Players'          // stats.html's return dropped both
];

module.exports = { FIXTURES, argsFor, normalise, decode, card, holes, team,
                   N, SI, ESCAPED_FIELDS, KNOWN_DIVERGENCES };
