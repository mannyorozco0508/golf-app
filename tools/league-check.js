#!/usr/bin/env node
// ============================================================================
// POINTS LEAGUE ON THE TRIP PAGE, THE WAY THE ORGANIZER AND A GOLFER USE IT
//
//   node tools/league-check.js [<old tree> ...]
//
// Cold Chrome, a stand-in database: a 24-golfer trip with two rounds ALREADY PLAYED
// (six 2 v 2 Nassaus each, partners changed), and no league yet.
//   1  The organizer: "Set up the Points League" -> the form ($20, everyone, 1/1/1,
//      50/30/20) -> Save writes ONE node, trips/<code>/league -> the standings: 24
//      golfers, "Pot $480", 1st $240 / 2nd $144 / 3rd $96, W-L-H; the played rounds count.
//   2  Tap a golfer: each match (partner, opponents, front / back / 18, points).
//   3  Match results: set a segment by hand (one write under league/overrides); Auto
//      puts it back; a match entered by hand for a group with no Nassau (the 2v2 picker).
//   4  "Who gets paid": its own card under Trip Money Settlement, settled separately;
//      the trip's own money settlement is the same text as before the league.
//   5  A golfer (no organizer link): the standings, no setup or results buttons.
//   6  Places that don't add to 100%: Save refuses.
//   7  Every <old tree> (build 12, the web app) opens both rounds and the trip with
//      the league node in it: 0 errors.
// The rounds are never written to.
// ============================================================================
'use strict';
const path = require('path');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const HOLES = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const NAMES = ['Manny Orozco', 'Joe Russo', 'Mike Dunn', 'Dave Kirk', 'Tom Hale', 'Rick Pace', 'Steve Cole', 'Paul Webb', 'Al Burke', 'Bo Grant', 'Cy Young', 'Dan Fox',
    'Ed Nash', 'Fred Lowe', 'Gus Reed', 'Hal Moss', 'Ike Shaw', 'Jim Cook', 'Ken Park', 'Lou Gray', 'Max Bell', 'Ned Ross', 'Oz Kane', 'Pete Lang'];
function round(code, names, plan) {
    const players = names.map((name, i) => ({ id: 101 + i, name, hcp: '0' }));
    const scores = {}, sideMatches = {};
    for (let g = 0; g < 6; g++) {
        const ids = [0, 1, 2, 3].map((k) => 101 + g * 4 + k);
        sideMatches['sm' + g] = { format: 'nassau', teamAIds: ids.slice(0, 2).map(String), teamBIds: ids.slice(2).map(String), scoring: 'net', frontStake: 5, backStake: 5, overallStake: 5, scope: 'group', ownerGroup: g + 1, createdAt: g + 1, startHole: 1 };
        for (let h = 1; h <= 18; h++) {
            const w = typeof plan[g] === 'function' ? plan[g](h) : plan[g];
            ids.forEach((id, k) => { scores['p' + id + '_h' + h] = (w === 'A' && k < 2) || (w === 'B' && k >= 2) ? 3 : 4; });
        }
    }
    return { roomCode: code, courseName: 'Caledonia Golf & Fish Club', activeCourseKey: 'caledonia', courseData: HOLES, players, scores, sideMatches, gameFormat: 'stroke', groupSizeOverrides: { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 }, ownerUid: 'anon-cold', tripCode: 'TRLG01', createdAt: 1 };
}
const order2 = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 16, 20, 17, 21, 18, 22, 19, 23].map((i) => NAMES[i]);
const R1 = round('LGRD01', NAMES, ['A', 'B', 'H', (h) => (h <= 9 ? 'A' : 'B'), 'A', (h) => (h <= 9 ? 'H' : 'A')]);
const R2 = round('LGRD02', order2, ['A', 'A', 'B', 'H', (h) => (h <= 9 ? 'B' : 'A'), 'B']);
delete R2.sideMatches.sm5;   // the last group of round 2 set up no Nassau
const TOKEN = 'tok-league';
const DB = (league) => ({ events: { LGRD01: R1, LGRD02: R2 }, global_courses: {}, organizers: {}, tournaments: {},
    trips: { TRLG01: Object.assign({ name: 'League Test', createdAt: 1, organizerToken: TOKEN, rounds: { LGRD01: { label: 'Day 1', addedAt: 1 }, LGRD02: { label: 'Day 2', addedAt: 2 } } }, league ? { league } : {}) } });
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 4500, viewport: { width: 390, height: 844 } }, o)); if (!r.ok) throw new Error(r.reason); return r; };
const READ = "JSON.stringify({ sec: (document.getElementById('league-section')||{}).style ? document.getElementById('league-section').style.display : 'none', card: (document.getElementById('league-card')||{}).innerText || '', settle: (document.getElementById('league-settle')||{}).textContent || '', rows: document.querySelectorAll('#league-card .lg-row').length, money: (document.getElementById('trip-money-settlement')||{}).textContent || '', writes: (window.__coldWrites||[]).filter(function(w){ return /^trips\\//.test(w.path) || /^events\\//.test(w.path); }), e: window.__e })";
const TAP = (sel) => ({ expression: "(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return 'missing'; b.click(); return 'tap'; })()" });

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const ORG = fileUrl('trip.html', 'trip=TRLG01&organizer=' + TOKEN);

    // 1-4: the organizer.
    let r = await go({ url: ORG, db: DB(null), preScript: ERR, steps: [
        { sleep: 1500 }, { expression: READ },                                                            // 0 not set up
        TAP('#league-card [data-lg="setup"]'), { sleep: 300 }, { expression: READ },                      // 1 the form
        TAP('#league-card [data-lg="save"]'), { sleep: 2500 }, { expression: READ },                      // 2 saved -> standings
        TAP('#league-card .lg-row'), { sleep: 300 }, { expression: READ },                                // 3 a golfer's matches
        TAP('#league-card [data-lg="results"]'), { sleep: 300 }, { expression: READ },                    // 4 match results
        { expression: "(function(){ var m = document.querySelector('#league-card [data-lg-match=\"LGRD01~sm0\"] [data-lg-set=\"back:B\"]'); m.click(); return 'set'; })()" }, { sleep: 2500 }, { expression: READ },   // 5 one segment by hand
        { expression: "(function(){ document.querySelector('#league-card [data-lg=\"results\"]') && document.querySelector('#league-card [data-lg=\"results\"]').click(); var b = document.querySelector('#league-card [data-lg-round=\"LGRD02\"]'); b.click(); return 'round'; })()" }, { sleep: 300 },
        { expression: "(function(){ ['Max Bell','Ned Ross','Oz Kane','Pete Lang'].forEach(function(n){ var c = document.querySelector('#league-card [data-lg-pick=\"' + n + '\"]'); if (c) c.click(); }); return 'picked'; })()" }, { sleep: 200 }, { expression: READ },   // 6 picker
        TAP('#league-card [data-lg="addmatch"]'), { sleep: 2500 }, { expression: READ }] });            // 7 added
    const s = J(r);
    report.organizer = { notSetUp: s[0].card.slice(0, 120), form: s[1].card.slice(0, 260), table: s[2].card.slice(0, 500), player: s[3].card.slice(0, 600), settle: s[2].settle, writes: s[7].writes.map((w) => w.op + ' ' + w.path) };
    f(s[0].sec !== 'none' && /Set up the Points League/.test(s[0].card), '1: the organizer has no "Set up the Points League": ' + JSON.stringify(s[0]));
    f(/Buy-in per golfer/.test(s[1].card) && /Golfers in the league \(24 of 24\)/.test(s[1].card) && /Adds up to 100%/.test(s[1].card), '1: the setup form defaults: ' + s[1].card.slice(0, 400));
    const w2 = s[2].writes;
    f(w2.length === 1 && w2[0].op === 'update' && w2[0].path === 'trips/TRLG01/league' && w2[0].value.buyIn === 20 && w2[0].value.players === null && JSON.stringify(w2[0].value.places) === '[50,30,20]' && w2[0].value.on === true, '1: Save did not write one league node: ' + JSON.stringify(w2));
    f(s[2].rows === 24 && /Pot \$480 \(24 × \$20\) · 1st \$240, 2nd \$144, 3rd \$96/.test(s[2].card) && /W-L-H/.test(s[2].card) && /11 matches so far/.test(s[2].card), '1: the standings: ' + s[2].card.slice(0, 600));
    f(/with .+ v .+ — Front 9 (won|lost|½), Back 9/.test(s[3].card) && /Day 1/.test(s[3].card) && /Day 2/.test(s[3].card), '2: tapping a golfer did not list their matches: ' + s[3].card.slice(0, 600));
    f(/Match results/.test(s[4].card) && /Day 2/.test(s[4].card) && /No Nassau|2 v 2 Nassau|A Manny Orozco & Joe Russo v B Mike Dunn & Dave Kirk/.test(s[4].card), '3: Match results screen: ' + s[4].card.slice(0, 400));
    const ov = s[5].writes.filter((w) => /overrides/.test(w.path));
    f(ov.length === 1 && ov[0].path === 'trips/TRLG01/league/overrides/LGRD01~sm0' && JSON.stringify(ov[0].value) === '{"back":"B"}', '3: setting a segment by hand: ' + JSON.stringify(ov));
    f(/Team A: Max Bell & Ned Ross/.test(s[6].card) && /Team B: Oz Kane & Pete Lang/.test(s[6].card), '3: the 2v2 picker for a hand-entered match: ' + s[6].card.slice(-500));
    const mw = s[7].writes.filter((w) => /league\/manual\//.test(w.path));
    f(mw.length === 1 && JSON.stringify(mw[0].value.a) === '["Max Bell","Ned Ross"]' && mw[0].value.round === 'LGRD02', '3: the hand-entered match: ' + JSON.stringify(mw));
    f(s[7].writes.every((w) => /^trips\/TRLG01\/league(\/|$)/.test(w.path)), '1-3: something other than the league node was written: ' + JSON.stringify(s[7].writes.map((w) => w.path)));
    f(/Points League — who gets paid/.test(s[2].settle) && /Settle this separately/.test(s[2].settle) && /\$480/.test(s[2].settle) && /not part of Who Pays Who/.test(s[2].settle), '4: the "who gets paid" card: ' + s[2].settle);
    f(!s[7].e.length, '1-3: page errors ' + s[7].e.join(' | '));

    // 4b: the trip money settlement reads the same with and without the league.
    r = await go({ url: ORG, db: DB(null), preScript: ERR, steps: [{ sleep: 1500 }, { expression: READ }] });
    const before = J(r)[0].money;
    r = await go({ url: ORG, db: DB({ on: true, buyIn: 20, places: [50, 30, 20] }), preScript: ERR, steps: [{ sleep: 1500 }, { expression: READ }] });
    f(J(r)[0].money === before && before.length > 20, '4: Trip Money Settlement changed with the league on');

    // 5: a golfer (no organizer link).
    r = await go({ url: fileUrl('trip.html', 'trip=TRLG01'), db: DB({ on: true, buyIn: 20, places: [50, 30, 20] }), preScript: ERR, steps: [{ sleep: 1500 }, { expression: READ }] });
    const g = J(r)[0];
    report.golfer = g.card.slice(0, 200);
    f(g.sec !== 'none' && g.rows === 24 && !/Match results|League setup|Set up the Points League/.test(g.card) && !g.e.length, '5: a golfer\'s view: ' + JSON.stringify([g.sec, g.rows, g.card.slice(-200), g.e]));
    // 5b: no league: a golfer sees nothing.
    r = await go({ url: fileUrl('trip.html', 'trip=TRLG01'), db: DB(null), preScript: ERR, steps: [{ sleep: 1500 }, { expression: READ }] });
    f(J(r)[0].sec === 'none', '5: with no league a golfer should see no league section');

    // 6: places that don't add to 100%.
    r = await go({ url: ORG, db: DB(null), preScript: ERR, steps: [{ sleep: 1500 }, TAP('#league-card [data-lg="setup"]'), { sleep: 200 },
        { expression: "(function(){ var i = document.querySelector('#league-card [data-lg-f=\"place.2\"]'); i.value = '10'; i.dispatchEvent(new Event('input', { bubbles: true })); return 'typed'; })()" },
        TAP('#league-card [data-lg="save"]'), { sleep: 800 }, { expression: READ }] });
    const b6 = J(r)[0];
    f(/must add up to 100%/.test(b6.card) && !b6.writes.length, '6: Save took places adding to 90%: ' + JSON.stringify([b6.card.slice(-200), b6.writes]));

    // 7: older apps open the rounds and the trip with a league in it.
    for (const tree of process.argv.slice(2).map((t) => path.resolve(t))) {
        const old = require(path.join(tree, 'tools/lib/cold-arrival.js'));
        const db = DB({ on: true, buyIn: 20, places: [50, 30, 20], overrides: { 'LGRD01~sm0': { back: 'B' } }, manual: { m1: { round: 'LGRD02', a: ['Max Bell', 'Ned Ross'], b: ['Oz Kane', 'Pete Lang'] } } });
        for (const [page, q] of [['index.html', 'game=LGRD01'], ['settlement.html', 'game=LGRD02'], ['trip.html', 'trip=TRLG01']]) {
            const o = await old.arriveCold({ url: old.fileUrl(page, q), db, settleMs: 4000, viewport: { width: 390, height: 844 }, preScript: ERR, steps: [{ expression: "JSON.stringify({ e: window.__e, n: document.body.innerText.length })" }] });
            const x = o.ok ? JSON.parse(o.value[0]) : { e: ['did not load: ' + o.reason], n: 0 };
            report[path.basename(tree) + ' ' + page] = x;
            if (x.e.length) fails.push('7: ' + path.basename(tree) + ' ' + page + ': ' + x.e.join(' | '));
            if (x.n < 200) fails.push('7: ' + path.basename(tree) + ' ' + page + ': rendered almost nothing');
        }
    }
    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
