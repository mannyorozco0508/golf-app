// ============================================================================
// FIXTURES AND READERS FOR THE APP CARD GUARDS (P1-c T1A, P1-d T2C)
//
// Shared by tournament_app_card_test.js, tournament_app_board_test.js and
// tools/tournament-app-card-check.js, so the three read the screen the same
// way. Every reader is an EXPRESSION evaluated in the page: it reads the DOM
// (innerText, never textContent - CLAUDE.md) and calls nothing the page
// defines. Every tap is a real CDP tap through cold-arrival's { tap } step.
// ============================================================================
'use strict';

const PARS = [4, 4, 4, 4, 5, 4, 4, 3, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4];   // the mockup's: 7 par 4, 8 par 3
const COURSE = PARS.map((par, i) => ({ hole: i + 1, par, hcpIndex: i + 1 }));
const KEY4 = 'k4-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// THE MOCKUP'S SCRAMBLE: Team 4 started on 4, holes 4-6 done (-3 at the
// course's pars 4,5,4 = 13, scores 4,3,3 = 10), seventeen other teams.
// Ranked by to-par: 9 -9, 12 -8, 2 -7, 7 -6, then 4 and 15 both -3 (tied
// 5th), 1 -2, 11 -1, the rest not started.
function scrambleDb(extra) {
    const teams = {};
    const scores = {};
    const put = (num) => { teams['team' + num] = { num, name: 'Team ' + num, players: ['P' + num] }; };
    [9, 12, 2, 7, 15, 1, 11, 3, 5, 6, 8, 10, 13, 14, 16, 17, 18].forEach(put);
    // holes 1-3 are par 4: strokes against 4 per hole played
    scores.team9_h1 = 1; scores.team9_h2 = 1; scores.team9_h3 = 1;         // 3 vs 12 = -9
    scores.team12_h1 = 1; scores.team12_h2 = 2; scores.team12_h3 = 1;      // 4 vs 12 = -8
    scores.team2_h1 = 1; scores.team2_h2 = 2; scores.team2_h3 = 2;         // 5 vs 12 = -7
    scores.team7_h1 = 1; scores.team7_h2 = 1;                              // 2 vs 8 = -6
    scores.team15_h1 = 1;                                                  // 1 vs 4 = -3
    scores.team1_h1 = 2;                                                   // -2
    scores.team11_h1 = 3;                                                  // -1
    teams.team4 = { num: 4, name: 'Team 4', players: ['Al Lopez', 'Jo Kim', 'Ed Ruiz', 'Bo Diaz'], startingHole: '4' };
    Object.assign(scores, { team4_h4: 4, team4_h5: 3, team4_h6: 3 });   // 10 vs 13 = -3
    const rec = Object.assign({ name: 'Saturday Scramble', format: 'scramble', courseName: 'Papago', startType: 'shotgun',
        startTime: '08:00', courseData: COURSE, teams, scores, payoutSpots: [600, 250] }, extra || {});
    return { '.info': { connected: true }, tournaments: { SCR: rec } };
}

// BEST BALL: Team 3 of three golfers, no tee (hole 1 first), nothing scored.
function bestBallDb() {
    return { '.info': { connected: true }, tournaments: { BBL: { name: 'Club Best Ball', format: 'bestball', courseName: 'Tidewater',
        courseData: COURSE, teams: {
            team3: { num: 3, name: 'Team 3', players: ['Ann Lee', 'Bo Park', 'Cy Diaz'] },
            team5: { num: 5, name: 'Team 5', players: ['Dee Fox', 'Eli Moss'] } },
        scores: { team5_p0_h1: 4, team5_p1_h1: 5 } } } };
}

// A GROUP LINK on a two-round individual event, round 2 (scores live under
// rounds/r2). Group 3 is Dana Ruiz and Lee Park, both B Flight.
const CD = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
function groupDb() {
    const thru = (pid, v, n) => { const s = {}; for (let h = 1; h <= n; h++) s[`${pid}_h${h}`] = v; return s; };
    const GROUPS = { g1: { name: 'Group 1', playerIds: ['pA', 'pB'] }, g3: { name: 'Group 3', playerIds: ['pD', 'pE'] } };
    const rnd = (name, at, scores) => ({ name, status: 'open', format: 'individual', scoringMode: 'gross', courseName: 'Tidewater',
        courseData: CD, createdAt: at, scoringGroups: GROUPS, scores });
    return { '.info': { connected: true }, tournaments: { FLT: { name: 'Club Champs', eventModel: 'round-v1', scoringModel: 'player-v1',
        format: 'individual',
        flights: { fA: { id: 'fA', name: 'A Flight', createdAt: 1 }, fB: { id: 'fB', name: 'B Flight', createdAt: 2 } },
        players: { pA: { id: 'pA', name: 'Ana Diaz', handicap: '4', flightId: 'fA' }, pB: { id: 'pB', name: 'Joe Fox', handicap: '6', flightId: 'fA' },
            pD: { id: 'pD', name: 'Dana Ruiz', handicap: '15', flightId: 'fB' }, pE: { id: 'pE', name: 'Lee Park', handicap: '14', flightId: 'fB' } },
        rounds: { r1: rnd('Saturday', 10, {}), r2: rnd('Sunday', 20, Object.assign({}, thru('pA', 4, 3), thru('pD', 4, 2), thru('pE', 5, 2))) } } } };
}

// THE APP SCREEN, read. Visible means rendered with a size (offsetParent and
// a non-zero rect), so a 0x0 element does not count as shown.
const READ_APP = { expression: `JSON.stringify((function () {
  var $ = function (s) { return document.querySelector(s); };
  var t = function (s) { var e = $(s); return e ? (e.innerText || '').replace(/\\s+/g, ' ').trim() : null; };
  var shown = function (e) { if (!e || e.offsetParent === null) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var rect = function (s) { var e = $(s); if (!e) return null; var r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  var all = function (s) { return Array.prototype.map.call(document.querySelectorAll(s), function (e) { return (e.innerText || '').replace(/\\s+/g, ' ').trim(); }); };
  var chip = $('#ap-chip');
  return {
    appMode: document.body.classList.contains('app-mode'), screen: document.body.getAttribute('data-app-screen'),
    appShown: shown($('#app-view')), webCardShown: shown($('#tab-scorecard')), webNavShown: shown($('.top-nav-bar')),
    title: t('#ap-title'), sub: t('#ap-sub'), live: shown($('#ap-sub .ap-live')),
    next: t('#ap-next-hole'), topar: t('#ap-topar'), place: t('#ap-place'), dark: t('#ap-hole .ap-dk'),
    steppers: all('#ap-score .ap-n'), golfers: all('#ap-score .ap-gname'), score: t('#ap-score'),
    chip: chip ? (chip.innerText || '').trim() : null, chipClass: chip ? chip.className : null, chipShown: shown(chip),
    save: t('#ap-save'), saveShown: shown($('#ap-save')), saveRect: rect('#ap-save'), plusRect: rect('#ap-score .ap-plus'), minusRect: rect('#ap-score .ap-minus'),
    note: t('#ap-hole .ap-note'), boardLine: t('#ap-board-line'), wholeCard: t('#ap-whole-card'),
    placeCard: t('#ap-place-card'), placeBig: t('#ap-place-big'), placeLine: t('#ap-place-line'), placeFlight: t('#ap-place-flight'), tie: t('#ap-tie'),
    around: all('#ap-around .ap-lb'), aroundMe: all('#ap-around .ap-lb.ap-me'), updated: t('#ap-updated'), seeAll: t('#ap-see-all'), allRows: all('#ap-all .ap-lb'),
    appText: t('#app-view') || '', webStatus: t('#status-main'),
    vh: innerHeight, vw: innerWidth
  };
})())` };

const WRITES = { expression: 'JSON.stringify(window.__coldWrites || [])' };
const QUEUE = { expression: `JSON.stringify((function () { try { return JSON.parse(localStorage.getItem('rattle_tournament_scores_wq_v1') || '[]'); } catch (e) { return 'unreadable'; } })())` };
const OFFLINE = { expression: '(window.__coldSetOffline(true), "offline")' };

module.exports = { PARS, COURSE, KEY4, scrambleDb, bestBallDb, groupDb, READ_APP, WRITES, QUEUE, OFFLINE };
