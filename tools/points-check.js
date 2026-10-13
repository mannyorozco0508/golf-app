#!/usr/bin/env node
// ============================================================================
// THE POINTS GAME (points.html), THE WAY THE ORGANIZER SETS IT UP FROM A ROUND
//
//   node tools/points-check.js [<old tree> ...]
//
// Cold Chrome, a stand-in database: two played rounds (8 golfers) and a trip holding them.
//   A  From a round (Add a game > Points game: points.html?game=..&setup=1), no trip: the setup
//      opens by itself. This round only, everyone, singles as an 18-hole match (win 2 / halve 1)
//      -> Save writes ONE node, events/<round>/pointsGame -> standings from the round's 1 v 1 bets.
//   B  Several rounds without a trip: "+ Add round" by code; the 2nd round its own format
//      (four-ball, Nassau-style) -> rounds [R1, R2] and perRound saved; both rounds count.
//   C  From a round of a trip (this phone opened the trip): Several rounds = the trip's, same
//      teams every round (one pairing) -> trips/<trip>/league; individual standings.
//   D  Results (settlement.html) of a round with a Points game: "who gets paid", its own card.
//   F  League pairings (6 of 8 -> the default): Make pairings = a 2 v 2 + singles; pointers in the
//      rounds; LIVE: a score written while the page is open moves the matches (no reload).
//   G  The round's own "Points game" card on the scorecard and on Action, live.
//   E  Every <old tree> (build 12, the web app) opens a round carrying a Points game: 0 errors.
// The rounds' own data is never written (only the pointsGame / league node).
// ============================================================================
'use strict';
const path = require('path');
const HERE = path.join(__dirname, '..');
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const HOLES = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const NAMES = ['Manny Orozco', 'Joe Russo', 'Mike Dunn', 'Dave Kirk', 'Tom Hale', 'Rick Pace', 'Steve Cole', 'Paul Webb'];
// Every golfer's score on every hole: the lower index, the better (Manny 3s ... Paul 5s).
const SC = [3, 4, 4, 5, 3, 5, 4, 5];
function round(code) {
    const players = NAMES.map((name, i) => ({ id: 101 + i, name, hcp: '0' }));
    const scores = {};
    for (let h = 1; h <= 18; h++) players.forEach((p, i) => { scores['p' + p.id + '_h' + h] = SC[i]; });
    // 1 v 1 match bets (singles) and 2 v 2 Nassaus.
    const sideMatches = {
        s1: { format: 'match', teamAIds: ['101'], teamBIds: ['103'], scoring: 'net', createdAt: 1 },   // Manny 3 v Mike 4: Manny
        s2: { format: 'match', teamAIds: ['102'], teamBIds: ['104'], scoring: 'net', createdAt: 2 },   // Joe 4 v Dave 5: Joe
        s3: { format: 'match', teamAIds: ['105'], teamBIds: ['107'], scoring: 'net', createdAt: 3 },   // Tom 3 v Steve 4: Tom
        s4: { format: 'match', teamAIds: ['106'], teamBIds: ['108'], scoring: 'net', createdAt: 4 },   // Rick 5 v Paul 5: halved
        n1: { format: 'nassau', teamAIds: ['101', '102'], teamBIds: ['103', '104'], scoring: 'net', createdAt: 5 },
        n2: { format: 'nassau', teamAIds: ['105', '106'], teamBIds: ['107', '108'], scoring: 'net', createdAt: 6 }
    };
    return { roomCode: code, courseName: 'Caledonia Golf & Fish Club', activeCourseKey: 'caledonia', courseData: HOLES, players, scores, sideMatches, gameFormat: 'stroke', groupSizeOverrides: { 0: 4, 1: 4 }, ownerUid: 'anon-cold', createdAt: 1 };
}
const DB = (extra) => {
    const d = { events: { PGRD01: round('PGRD01'), PGRD02: round('PGRD02') }, global_courses: {}, organizers: {}, tournaments: {},
        trips: { TRPG01: { name: 'Points Test', createdAt: 1, organizerToken: 'tok', rounds: { PGRD01: { label: 'Day 1', addedAt: 1 }, PGRD02: { label: 'Day 2', addedAt: 2 } } } } };
    if (extra) extra(d);
    return d;
};
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
const go = async (o) => { const r = await arriveCold(Object.assign({ settleMs: 4500, viewport: { width: 390, height: 844 } }, o)); if (!r.ok) throw new Error(r.reason); return r; };
const READ = "JSON.stringify({ card: (document.getElementById('league-card')||{}).innerText || '', settle: (document.getElementById('league-settle')||{}).textContent || '', rows: document.querySelectorAll('#league-card .lg-row').length, live: (document.querySelector('#league-card .lg-live')||{}).textContent || '', writes: (window.__coldWrites||[]).filter(function(w){ return /^trips\\//.test(w.path) || /^events\\//.test(w.path); }), e: window.__e })";
const TAP = (sel) => ({ expression: "(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return 'missing'; b.click(); return 'tap'; })()" });
const SEL = (sel, v) => ({ expression: "(function(){ var s = document.querySelector(" + JSON.stringify(sel) + "); s.value = " + JSON.stringify(v) + "; s.dispatchEvent(new Event('change', { bubbles: true })); return 'sel'; })()" });
const TYPE = (sel, v) => ({ expression: "(function(){ var s = document.querySelector(" + JSON.stringify(sel) + "); s.value = " + JSON.stringify(v) + "; s.dispatchEvent(new Event('input', { bubbles: true })); return 'typed'; })()" });

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };

    // A: this round only, singles 18-hole match (win 2 / halve 1).
    let r = await go({ url: fileUrl('points.html', 'game=PGRD01&setup=1'), db: DB(), preScript: ERR, steps: [
        { sleep: 1500 }, { expression: READ },                                                                                      // 0 the setup, open by itself
        TAP('#league-card [data-lg="all"]'), SEL('#league-card [data-lg-rcs="def|format"]', 'singles'), SEL('#league-card [data-lg-rcs="def|mode"]', 'match'), { sleep: 200 }, { expression: READ },   // 1
        TAP('#league-card [data-lg="save"]'), { sleep: 2000 }, { expression: READ }] });                                         // 2 saved
    const a = J(r);
    report.A = { form: a[0].card.slice(0, 300), live: a[1].live, table: a[2].card.slice(0, 500), writes: a[2].writes.map((w) => w.op + ' ' + w.path) };
    f(/Points game setup/.test(a[0].card) && /This round only/.test(a[0].card) && /Several rounds/.test(a[0].card) && /Golfers in the game \(0 of 8\)/.test(a[0].card) && /Four-ball \/ best ball \(2v2\)/.test(a[0].card), 'A: the setup did not open with its defaults: ' + a[0].card.slice(0, 500));
    f(a[1].live === '8 golfers · pot $160 · 1st $80 / 2nd $48 / 3rd $32', 'A: live line: ' + a[1].live);
    const wa = a[2].writes;
    f(wa.length === 1 && wa[0].path === 'events/PGRD01/pointsGame' && JSON.stringify(wa[0].value.rounds) === '["PGRD01"]' && wa[0].value.def.format === 'singles' && wa[0].value.def.mode === 'match' && wa[0].value.def.win === 2 && wa[0].value.def.halve === 1, 'A: Save: ' + JSON.stringify(wa));
    // Singles: Manny, Joe, Tom win (2 each); Rick & Paul halve (1 each); Mike, Dave, Steve 0.
    f(a[2].rows === 8 && /Manny Orozco ▸\s*2\s*1-0-0/.test(a[2].card) && /Rick Pace ▸\s*1\s*0-0-1/.test(a[2].card) && /Mike Dunn ▸\s*0\s*0-1-0/.test(a[2].card) && /4 matches so far/.test(a[2].card) && /Singles|1 round/.test(a[2].card), 'A: singles standings: ' + a[2].card.slice(0, 700));
    f(!a[2].e.length, 'A: errors ' + a[2].e.join(' | '));

    // B: several rounds by code, round 2 its own format (four-ball Nassau 1/1/1).
    r = await go({ url: fileUrl('points.html', 'game=PGRD01&setup=1'), db: DB(), preScript: ERR, steps: [
        { sleep: 1500 }, TAP('#league-card [data-lg-rm="several"]'), { sleep: 100 }, TYPE('#league-card [data-lg-code]', 'pgrd02'), TAP('#league-card [data-lg="addround"]'), { sleep: 1200 },
        TAP('#league-card [data-lg="all"]'), SEL('#league-card [data-lg-rcs="def|format"]', 'singles'), SEL('#league-card [data-lg-rcs="def|mode"]', 'match'), { sleep: 100 },
        TAP('#league-card [data-lg-rco="PGRD02"]'), { sleep: 100 }, SEL('#league-card [data-lg-rcs="r:PGRD02|format"]', 'fourball'), SEL('#league-card [data-lg-rcs="r:PGRD02|mode"]', 'nassau'), { sleep: 100 }, { expression: READ },
        TAP('#league-card [data-lg="save"]'), { sleep: 2000 }, { expression: READ }] });
    const b = J(r);
    report.B = { form: (b[0].card.match(/A round of its own[\s\S]{0,300}/) || [''])[0], table: b[1].card.slice(0, 400), writes: b[1].writes.map((w) => JSON.stringify(w.value).slice(0, 300)) };
    const wb = b[1].writes.find((w) => w.path === 'events/PGRD01/pointsGame') || { value: {} };
    f(b[1].writes.filter((w) => !/pointsGameRef$/.test(w.path)).length === 1 && b[1].writes.some((w) => w.path === 'events/PGRD02/pointsGameRef' && w.value.round === 'PGRD01') && wb.path === 'events/PGRD01/pointsGame' && JSON.stringify(wb.value.rounds) === '["PGRD01","PGRD02"]' && wb.value.perRound && wb.value.perRound.PGRD02 && wb.value.perRound.PGRD02.format === 'fourball' && wb.value.perRound.PGRD02.mode === 'nassau', 'B: several rounds + a round of its own: ' + JSON.stringify(wb));
    // Round 2 four-ball Nassau: Manny & Joe (3) beat Mike & Dave (4) -> +3; Tom & Rick (3) v Steve & Paul (4) -> +3. Manny: 2 + 3 = 5.
    f(/Manny Orozco ▸\s*5\s*2-0-0/.test(b[1].card) && /Tom Hale ▸\s*5\s*2-0-0/.test(b[1].card) && /Rick Pace ▸\s*4\s*1-0-1/.test(b[1].card) && /6 matches so far/.test(b[1].card), 'B: both rounds count, each its own format: ' + b[1].card.slice(0, 700));

    // C: a round of a trip this phone opened: the trip's rounds, same teams every round.
    r = await go({ url: fileUrl('points.html', 'game=PGRD01&setup=1'), db: DB(), preScript: ERR + "try{localStorage.setItem('lastTripCode','TRPG01')}catch(e){}", steps: [
        { sleep: 1500 }, { expression: READ },
        TAP('#league-card [data-lg-rm="several"]'), TAP('#league-card [data-lg="all"]'), TAP('#league-card [data-lg-tm="same"]'), { sleep: 100 },
        { expression: "(function(){ ['Paul Webb','Steve Cole','Manny Orozco','Joe Russo'].forEach(function(n){ var c = document.querySelector('#league-card [data-lg-tp=\"' + n + '\"]'); if (c) c.click(); }); return 'picked'; })()" }, TAP('#league-card [data-lg="tadd"]'), { sleep: 100 }, { expression: READ },
        TAP('#league-card [data-lg="save"]'), { sleep: 2000 }, { expression: READ }] });
    const c = J(r);
    report.C = { form: c[1].card.slice(0, 200), table: c[2].card.slice(0, 500), writes: c[2].writes.map((w) => w.op + ' ' + w.path) };
    f(/Every round of this trip, and rounds added to it later/.test(c[1].card) && /Paul Webb & Steve Cole/.test(c[1].card), 'C: the trip rounds / the pairing in the form: ' + c[1].card.slice(0, 600));
    const wc = c[2].writes.find((w) => w.path === 'trips/TRPG01/league') || { value: {} };
    f(c[2].writes.filter((w) => !/pointsGameRef$/.test(w.path)).length === 1 && wc.path === 'trips/TRPG01/league' && wc.value.rounds == null && wc.value.teamsMode === 'same' && JSON.stringify(wc.value.teams) === '[{"a":["Paul Webb","Steve Cole"],"b":["Manny Orozco","Joe Russo"]}]', 'C: the trip game: ' + JSON.stringify(wc));
    // Same teams, both rounds, four-ball Nassau: Manny & Joe (3) beat Paul & Steve (4) twice -> 6 each; everyone else 0, individually ranked.
    f(/Joe Russo ▸\s*6\s*2-0-0/.test(c[2].card) && /Manny Orozco ▸\s*6\s*2-0-0/.test(c[2].card) && /Paul Webb ▸\s*0\s*0-2-0/.test(c[2].card) && /2 matches so far/.test(c[2].card) && /same teams every round/.test(c[2].card), 'C: same-teams standings: ' + c[2].card.slice(0, 700));

    // D: Results of a round with a Points game: its own "who gets paid" card.
    const withGame = DB((d) => { d.events.PGRD01.pointsGame = { on: true, buyIn: 20, players: NAMES, rounds: ['PGRD01'], def: { format: 'singles', mode: 'match', win: 2, halve: 1 }, places: [50, 30, 20] }; });
    r = await go({ url: fileUrl('settlement.html', 'game=PGRD01'), db: withGame, preScript: ERR, settleMs: 6000, steps: [{ sleep: 1500 }, { expression: "JSON.stringify({ pg: (document.getElementById('pg-settle')||{}).textContent || '', who: (document.body.innerText.match(/Who Pays Who[\\s\\S]{0,40}/) || [''])[0], e: window.__e })" }] });
    const d = J(r)[0];
    report.D = d.pg.slice(0, 300);
    f(/Points game — who gets paid/.test(d.pg) && /Settle this separately/.test(d.pg) && /\$160/.test(d.pg) && !d.e.length, 'D: Results card: ' + JSON.stringify(d));
    r = await go({ url: fileUrl('settlement.html', 'game=PGRD01'), db: DB(), preScript: ERR, settleMs: 6000, steps: [{ sleep: 1500 }, { expression: "JSON.stringify({ pg: (document.getElementById('pg-settle')||{}).textContent || '', n: document.body.innerText.length, e: window.__e })" }] });
    const d0 = J(r)[0];
    f(!d0.pg && !d0.e.length, 'D: Results with no Points game shows a card / errors: ' + JSON.stringify(d0));

    // F: LEAGUE PAIRINGS (a league smaller than the field defaults to them): 6 of the 8 -> Pairings ->
    // "Make pairings" = one 2 v 2 + "2 left -> singles" (1 v 1); written under the league, and each
    // round gets its pointer (events/<round>/pointsGameRef) for its scorecard card.
    const THRU8 = (() => { const r3 = round('PGRD03'); Object.keys(r3.scores).forEach((k) => { if (Number(/_h(\d+)$/.exec(k)[1]) > 8) delete r3.scores[k]; }); return r3.scores; })();
    const SIX = ['Manny Orozco', 'Joe Russo', 'Mike Dunn', 'Tom Hale', 'Steve Cole', 'Paul Webb'];
    const partial = (d) => { const r3 = round('PGRD03'); Object.keys(r3.scores).forEach((k) => { if (Number(/_h(\d+)$/.exec(k)[1]) > 7) delete r3.scores[k]; }); r3.sideMatches = {}; d.events.PGRD03 = r3; d.trips.TRPG01.rounds.PGRD03 = { label: 'Day 3', addedAt: 3, date: '2026-10-15' }; };
    r = await go({ url: fileUrl('points.html', 'game=PGRD01&setup=1'), db: DB(partial), preScript: ERR + "try{localStorage.setItem('lastTripCode','TRPG01')}catch(e){}", steps: [
        { sleep: 1500 }, TAP('#league-card [data-lg-rm="several"]'),
        { expression: "(function(){ " + JSON.stringify(SIX) + ".forEach(function(n){ var c = document.querySelector('#league-card [data-lg-pl=\"' + n + '\"]'); if (c) c.click(); }); return 'six'; })()" }, { sleep: 200 }, { expression: READ },
        TAP('#league-card [data-lg="save"]'), { sleep: 1500 }, TAP('#league-card [data-lg="pairings"]'), { sleep: 300 }, { expression: READ },
        TAP('#league-card [data-lg-pr="PGRD03"]'), { sleep: 200 }, TAP('#league-card [data-lg="autopair"]'), { sleep: 1500 }, { expression: READ },
        // LIVE: Manny makes a score on the 8th while the page is open.
        { deliver: { path: 'events/PGRD03/scores', value: THRU8 } }, { sleep: 1500 }, { expression: READ }] });
    const fl = J(r);
    report.F = { teams: (fl[0].card.match(/2\. Teams[\s\S]{0,160}/) || [''])[0], pairings: fl[2].card.slice(0, 600), live: fl[3].card.slice(0, 600), writes: fl[3].writes.map((w) => w.op + ' ' + w.path) };
    f(/League pairings/.test(fl[0].card) && /The game’s own matches, set round by round from the league golfers only/.test(fl[0].card), 'F: league pairings is not the default for 6 of 8: ' + fl[0].card.slice(0, 600));
    const wsave = fl[3].writes.find((w) => w.path === 'trips/TRPG01/league');
    f(wsave && wsave.value.teamsMode === 'league', 'F: setup did not save teamsMode league: ' + JSON.stringify(wsave && wsave.value));
    f(/Pairings/.test(fl[1].card) && /Make pairings/.test(fl[1].card), 'F: the Pairings screen: ' + fl[1].card.slice(0, 400));
    const pw = fl[3].writes.filter((w) => w.path === 'trips/TRPG01/league/pairings/PGRD03');
    const pv = pw.length ? pw[0].value : [];
    f(pv.length === 2 && pv[0].a.length === 2 && pv[1].a.length === 1 && new Set(pv.flatMap((t) => t.a.concat(t.b))).size === 6, 'F: Make pairings (one 2 v 2 + singles from the six): ' + JSON.stringify(pv));
    f(fl[3].writes.some((w) => w.path === 'events/PGRD03/pointsGameRef' && w.value.trip === 'TRPG01'), 'F: no pointer in the round for its scorecard: ' + JSON.stringify(fl[3].writes.map((w) => w.path)));
    f(/UP thru 7|All square thru 7/.test(fl[2].card) && /\(singles\)/.test(fl[2].card), 'F: pairings with live lines thru 7: ' + fl[2].card.slice(0, 600));
    f(/thru 8/.test(fl[3].card) && !/thru 7/.test(fl[3].card), 'F: LIVE - a score on the 8th did not move the matches to thru 8 without a reload: ' + fl[3].card.slice(0, 600));
    f(!fl[3].e.length, 'F: errors ' + fl[3].e.join(' | '));

    // G: the round's own card on the scorecard and on Action ("Points game: ..."), live.
    const withPairs = DB((d) => { partial(d); d.events.PGRD03.pointsGameRef = { trip: 'TRPG01' };
        d.trips.TRPG01.league = { on: true, players: SIX, teamsMode: 'league', pairings: { PGRD03: [{ a: ['Manny Orozco', 'Tom Hale'], b: ['Joe Russo', 'Paul Webb'] }, { a: ['Mike Dunn'], b: ['Steve Cole'] }] } }; });
    r = await go({ url: fileUrl('index.html', 'game=PGRD03&group=1'), db: withPairs, preScript: ERR + "window.__hardpanDoors = true;", settleMs: 5000, steps: [{ sleep: 1500 },
        { expression: "JSON.stringify({ card: (document.getElementById('pg-round-mount')||{}).innerText || '', e: window.__e })" },
        { deliver: { path: 'events/PGRD03', value: Object.assign({}, withPairs.events.PGRD03, { scores: THRU8 }) } }, { sleep: 1500 },
        { expression: "JSON.stringify({ card: (document.getElementById('pg-round-mount')||{}).innerText || '', e: window.__e })" }] });
    const g = J(r);
    report.G = { scorecard: g[0].card, after: g[1].card };
    // Manny 3 & Tom 3 v Joe 4 & Paul 5: 7 UP thru 7. Mike 4 v Steve 4: all square.
    f(/Points game/.test(g[0].card) && /Manny Orozco & Tom Hale v Joe Russo & Paul Webb/.test(g[0].card) && /Manny & Tom 7 UP thru 7/.test(g[0].card) && /Mike Dunn v Steve Cole \(singles\)/.test(g[0].card) && /All square thru 7/.test(g[0].card) && /Standings ›/.test(g[0].card), 'G: the scorecard card: ' + JSON.stringify(g[0]));
    f(/Manny & Tom 8 UP thru 8/.test(g[1].card), 'G: the scorecard card did not move live: ' + g[1].card);
    f(!g[1].e.length, 'G: scorecard errors ' + g[1].e.join(' | '));
    r = await go({ url: fileUrl('sidematches.html', 'game=PGRD03'), db: withPairs, preScript: ERR, settleMs: 5000, steps: [{ sleep: 1500 }, { expression: "JSON.stringify({ card: (document.getElementById('pg-round-mount')||{}).innerText || '', e: window.__e })" }] });
    const ga = J(r)[0];
    report.Gaction = ga.card;
    f(/Points game/.test(ga.card) && /Manny & Tom 7 UP thru 7/.test(ga.card) && !ga.e.length, 'G: the Action card: ' + JSON.stringify(ga));
    r = await go({ url: fileUrl('index.html', 'game=PGRD02&group=1'), db: DB(), preScript: ERR + "window.__hardpanDoors = true;", settleMs: 4000, steps: [{ sleep: 1000 }, { expression: "JSON.stringify({ card: (document.getElementById('pg-round-mount')||{}).innerText || '', e: window.__e })" }] });
    const g0 = J(r)[0];
    f(!g0.card && !g0.e.length, 'G: a round with no Points game shows a card / errors: ' + JSON.stringify(g0));

    // E: older apps open a round carrying a Points game.
    for (const tree of process.argv.slice(2).map((t) => path.resolve(t))) {
        const old = require(path.join(tree, 'tools/lib/cold-arrival.js'));
        for (const [page, q] of [['index.html', 'game=PGRD01'], ['settlement.html', 'game=PGRD01'], ['admin.html', 'game=PGRD01'], ['trip.html', 'trip=TRPG01']]) {
            const db = DB((x) => { x.events.PGRD01.pointsGame = withGame.events.PGRD01.pointsGame; x.trips.TRPG01.league = { on: true, players: NAMES, teamsMode: 'league', pairings: { PGRD01: [{ a: ['Manny Orozco', 'Tom Hale'], b: ['Joe Russo', 'Paul Webb'] }, { a: ['Mike Dunn'], b: ['Steve Cole'] }] } }; x.events.PGRD02.pointsGameRef = { trip: 'TRPG01' }; });
            const o = await old.arriveCold({ url: old.fileUrl(page, q), db, settleMs: 4000, viewport: { width: 390, height: 844 }, preScript: ERR, steps: [{ expression: "JSON.stringify({ e: window.__e, n: document.body.innerText.length })" }] });
            const x = o.ok ? JSON.parse(o.value[0]) : { e: ['did not load: ' + o.reason], n: 0 };
            report[path.basename(tree) + ' ' + page] = x;
            if (x.e.length) fails.push('E: ' + path.basename(tree) + ' ' + page + ': ' + x.e.join(' | '));
            if (x.n < 200) fails.push('E: ' + path.basename(tree) + ' ' + page + ': rendered almost nothing');
        }
    }
    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
