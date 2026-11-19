// ============================================================================
// FULL-EVENT SIMULATION: THE EVENT (Manny 2026-11-19 2:45 AM, "Tournament readiness"). Test data only: it is written
// to a local RTDB emulator, never to the live database. The code is SIM-only (SIMX72 never collides with a real event;
// R7SK48 and the four protected codes are never touched).
//
// 72 golfers in 18 groups of four on a shotgun (group N starts on hole N), one round, net, four flights (A, B, C by
// handicap and Ladies), skins (gross, carryover on), closest to the pin on the two par 3s, long drive on 9 (the side
// game), place prizes per flight. 71 golfers at the start: one golfer is added late into group 5.
//
// THE SCORES are deterministic (a seeded generator), then shaped so the chaos the brief asks for has something to bite:
//   - Ladies: two golfers tie for 1st on net (the place money is split);
//   - B flight: two golfers tie for 2nd on net;
//   - skins: low scores placed so some holes are won outright, some tied (carried), one won after a carry;
//   - KP on 7: two golfers enter the same distance (a tie: the earlier entry keeps it).
// GROUPS 17 and 18 keep score on paper: 17 is scanned at the Desk, 18 is turned in from a golfer's phone.
// ============================================================================
'use strict';

const CODE = 'SIMX72';
const OWNER = { uid: 'u-sim-org', email: 'organizer@sim.example', isAnonymous: false };
const PAR = [4, 5, 3, 4, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const SI = [7, 1, 15, 5, 11, 3, 17, 9, 13, 8, 2, 16, 6, 12, 4, 18, 10, 14];
const COURSE = PAR.map((par, i) => ({ hole: i + 1, par, hcpIndex: SI[i] }));
const PAYOUT_SPOTS = [100, 60, 40];
const PER_SKIN = 20, PER_CONTEST = 25;

// A small seeded generator: the same event every run.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const FIRST = ['Alex', 'Blake', 'Casey', 'Drew', 'Eli', 'Finn', 'Gabe', 'Hank', 'Ian', 'Jack', 'Kyle', 'Luke', 'Max', 'Nate', 'Owen', 'Pete', 'Quinn', 'Reid', 'Sam', 'Ty', 'Vic', 'Wade', 'Xavi', 'Zane'];
const LAST = ['Archer', 'Brooks', 'Cole', 'Dunn', 'Ellis', 'Ford', 'Grant', 'Hayes', 'Irwin', 'Jett', 'Knox', 'Lane', 'Moss', 'Nash', 'Oakes', 'Park', 'Quade', 'Reese', 'Stone', 'Tate', 'Upton', 'Vance', 'Wells', 'York'];
const LADY = ['Ava', 'Bea', 'Cora', 'Dana', 'Eve', 'Faye', 'Gwen', 'Hope', 'Iris', 'June', 'Kate', 'Lena'];

function flightFor(p) { if (p.lady) return 'fL'; const h = Number(p.handicap); return h <= 9 ? 'fA' : (h <= 17 ? 'fB' : 'fC'); }

// THE FIELD. p01..p72; p72 is the late add (Lou Late, 20, into group 5 which starts with three).
function field() {
    const r = rng(20261119);
    const out = [];
    let men = 0, lady = 0;
    for (let i = 1; i <= 72; i++) {
        const id = 'p' + String(i).padStart(2, '0');
        const isLady = i % 6 === 0;   // 12 ladies
        let name, handicap;
        if (i === 72) { name = 'Lou Late'; handicap = '20'; }
        else if (isLady) { name = LADY[lady % LADY.length] + ' ' + LAST[(lady * 5 + 3) % LAST.length]; lady++; handicap = String(8 + Math.floor(r() * 24)); }
        else { name = FIRST[men % FIRST.length] + ' ' + LAST[(men * 7 + 1) % LAST.length]; men++; handicap = String(Math.floor(r() * 30)); }
        out.push({ id, name, handicap, lady: isLady && i !== 72 });
    }
    // two plus handicaps among the men: the engine gives a stroke BACK on the easiest holes
    out[0].handicap = '+2'; out[6].handicap = '+1';
    out.forEach((p) => { p.flightId = flightFor(p); });
    return out;
}

// 18 groups: group N starts on hole N; p72 (late) belongs to group 5 but is added after the round starts.
function groups(players) {
    const g = {};
    for (let n = 1; n <= 18; n++) {
        const gid = 'g' + String(n).padStart(2, '0');
        const ids = players.slice((n - 1) * 4, n * 4).map((p) => p.id);
        g[gid] = { name: 'Group ' + n, startingHole: String(n), playerIds: ids, createdAt: n };
    }
    // group 5 starts with three: its fourth (p20) moves to... no: the late add is p72, so group 18 lends its p72 slot.
    g.g18.playerIds = g.g18.playerIds.filter((id) => id !== 'p72').concat(['p20']);
    g.g05.playerIds = g.g05.playerIds.filter((id) => id !== 'p20');   // 3 golfers until Lou Late joins
    return g;
}

// THE CARDS: what every golfer actually shoots (the truth the paper and the phones both hold).
function cards(players) {
    const r = rng(77);
    const s = {};
    players.forEach((p) => {
        const h = Math.max(0, Number(String(p.handicap).replace('+', '-')));
        s[p.id] = PAR.map((par) => {
            const x = r();
            let over = Math.floor(h / 18 * 1.1 + x * 2.6) - 1;   // most holes par..double, some birdies
            if (h <= 5 && x < 0.18) over = -1;
            return Math.max(par - 1, Math.min(par + 4, par + over));
        });
    });
    // SKINS SHAPING. Hole 2 (par 5): one eagle (p03) - won outright. Hole 7 (par 3): two birdies (p13, p25) - tied,
    // carries. Hole 8 (par 4): one birdie (p31) - takes 8 plus the carry from 7. Every other birdie on 2, 7, 8 is
    // lifted to par so the shaped holes read exactly as written.
    const lift = (hole, keep) => players.forEach((p) => { if (keep.indexOf(p.id) === -1 && s[p.id][hole - 1] < PAR[hole - 1]) s[p.id][hole - 1] = PAR[hole - 1]; });
    s.p03[1] = 3; lift(2, ['p03']);
    s.p13[6] = 2; s.p25[6] = 2; lift(7, ['p13', 'p25']);
    s.p31[7] = 3; lift(8, ['p31']);
    return s;
}

// Strokes on one hole, the stated rule (USGA allocation by stroke index; a plus handicap gives back on the easiest).
function strokes(handicap, si) {
    const t = String(handicap).trim();
    const n = t.startsWith('+') ? -Math.abs(parseFloat(t.slice(1))) : (parseFloat(t) || 0);
    if (n >= 0) return Math.floor(n / 18) + (si <= n % 18 ? 1 : 0);
    return si > 18 - Math.abs(n) ? -1 : 0;
}
const netToPar = (p, card) => card.reduce((a, g, i) => a + g - strokes(p.handicap, SI[i]) - PAR[i], 0);

// THE TIES: Ladies T1, B flight T2. Each is made by adding strokes to one golfer on a hole where they are not the low
// score (so no skin moves), until their net equals the target's.
function shapeTies(players, s) {
    const byFlight = (f) => players.filter((p) => p.flightId === f && p.id !== 'p72');
    const order = (list) => list.slice().sort((a, b) => netToPar(a, s[a.id]) - netToPar(b, s[b.id]));
    const meet = (target, mover) => {
        const goal = netToPar(target, s[target.id]);
        let guard = 0;
        while (netToPar(mover, s[mover.id]) < goal && guard++ < 40) {
            const i = [10, 14, 3, 17, 11, 5, 15, 9].find((k) => s[mover.id][k] < PAR[k] + 4);
            s[mover.id][i]++;
        }
        while (netToPar(mover, s[mover.id]) > goal && guard++ < 80) {
            const i = [10, 14, 3, 17, 11, 5, 15, 9].find((k) => s[mover.id][k] > PAR[k]);
            s[mover.id][i]--;
        }
    };
    const L = order(byFlight('fL')); meet(L[0], L[1]);
    const B = order(byFlight('fB')); meet(B[1], B[2]);
    return { ladiesT1: [L[0].id, L[1].id], bT2: [B[1].id, B[2].id] };
}

// KP and long-drive entries the golfers will type on their cards, each on the step their group plays that hole
// (group N starts on hole N, so it plays hole H at step ((H - N + 18) % 18) + 1). p25 (group 7, hole 7 at step 1) and
// p13 (group 4, hole 7 at step 4) both put it 6 ft 2 in on 7: p25 entered first and keeps the tie. p02 (group 1, hole 3
// at step 3) is closest on 3 but withdraws after their 9th hole, so their KP must fall away. LD on 9: yards.
const CONTEST_ENTRIES = {
    3: [['p02', 0, 9], ['p11', 4, 1], ['p57', 7, 3], ['p38', 12, 0]],
    7: [['p25', 6, 2], ['p13', 6, 2], ['p46', 9, 5], ['p62', 15, 0]],
    9: [['p05', 285], ['p29', 301], ['p49', 279], ['p61', 296]]
};
const WITHDRAW = { pid: 'p02', afterHoles: 9 };   // group 1 (p01-p04), starts on 1: withdrawn after step 9
const LATE = { pid: 'p72', group: 'g05', name: 'Lou Late', handicap: '20', flightId: 'fC', addAtStep: 4 };
const WRONG = { pid: 'p06', hole: 4, wrong: 9 };     // group 2's phone types 9 for p06 on hole 4, fixes it at the next step
const OFFLINE = { group: 'g03', from: 6, to: 10 };   // group 3's phone is offline for steps 6..10
const PAPER = { desk: 'g17', turnIn: 'g18' };

function build() {
    const players = field();
    const s = cards(players);
    const ties = shapeTies(players, s);
    const g = groups(players);
    const rec = {
        name: 'Sim Club Invitational', scoringModel: 'player-v1', format: 'individual', scoringMode: 'net',
        ownerUid: OWNER.uid, eventDate: new Date().toISOString().slice(0, 10), startTime: '08:00', startType: 'shotgun',
        courseName: 'Sim National', courseData: COURSE, courseIndexSynthetic: false, createdAt: 1,
        flights: { fA: { id: 'fA', name: 'A Flight', createdAt: 1 }, fB: { id: 'fB', name: 'B Flight', createdAt: 2 }, fC: { id: 'fC', name: 'C Flight', createdAt: 3 }, fL: { id: 'fL', name: 'Ladies', createdAt: 4 } },
        payoutSpots: PAYOUT_SPOTS, prizeType: 'credit', prizeSettings: { perSkin: PER_SKIN, carryover: true, perContest: PER_CONTEST },
        contests: { h3: { kind: 'kp', allowGps: false }, h7: { kind: 'kp', allowGps: false }, h9: { kind: 'ld', allowGps: false } },
        cardTurnIn: true,
        players: {}, scoringGroups: g
    };
    players.filter((p) => p.id !== LATE.pid).forEach((p, i) => { rec.players[p.id] = { id: p.id, name: p.name, handicap: p.handicap, flightId: p.flightId, addedAt: 1000 + i }; });
    return { code: CODE, owner: OWNER, record: rec, players, cards: s, ties, course: COURSE };
}

module.exports = { build, CODE, OWNER, PAR, SI, COURSE, PAYOUT_SPOTS, PER_SKIN, PER_CONTEST, CONTEST_ENTRIES, WITHDRAW, LATE, WRONG, OFFLINE, PAPER, strokes };
