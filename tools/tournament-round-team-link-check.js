#!/usr/bin/env node
// ============================================================================
// A MULTI-ROUND TEAM EVENT CAN BE SCORED FROM THE LINKS THE ORGANIZER HANDS OUT
// (Tournaments Wave 1, A2).
//
// The "more than one round" toggle is offered for every format, and team events
// carry it. But team links never named a round, and the card refuses any
// multi-round link without one ("this link doesn't say which one"). So every
// team link on a multi-round scramble opened a refusal: the event existed and
// could not be scored.
//
// THIS CHECK TOUCHES NOTHING IT IS CHECKING. The organizer arrives cold, signed
// in as the owner, and the links are READ OFF THE SCREEN: the Share buttons'
// urls on the Leaderboard tab, and the urls printed under each tee-sheet QR
// after the page's own Print Tee Sheet button is pressed (window.print is
// stubbed so no dialog opens - a browser API, not a page function). Every link
// found is then opened cold as a golfer, a score is typed into the first hole
// box the way a scorekeeper does, and the write the page sends is read back.
//
// THREE ARMS.
//   1. Every round has a link for every team, on the board and on the sheet.
//   2. Each of those links opens a card that SAVES, and the score lands under
//      THAT round (rounds/<rid>/scores/team<N>_h1) - not the event root, not
//      the other round.
//   3. THE NEGATIVE ARM: an old link with no round still shows the refusal.
//      Without it, a card that ignored the round entirely would pass arm 2.
//
//   node tools/tournament-round-team-link-check.js
//
//   exit 0   every round's team links score into their own round
//   exit 1   a link is missing, refuses, or writes to the wrong place
//   exit 2   could not run, or the organizer screen rendered no links. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const PARS = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];
const COURSE = PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 }));
const round = (name, at) => ({ name, status: 'open', format: 'scramble', courseName: 'Tidewater',
    activeCourseKey: 'tidewater', courseData: COURSE, createdAt: at, scores: {} });
const db = {
    tournaments: {
        MRT1: {
            name: 'Two Day Scramble', format: 'scramble', eventModel: 'round-v1', courseName: 'Tidewater',
            entryFee: 0, createdAt: 1, ownerUid: OWNER.uid,
            teams: {
                team1: { num: 1, name: 'Eagles', players: ['Ann', 'Bo'], handicap: 0 },
                team2: { num: 2, name: 'Hawks', players: ['Cal', 'Dee'], handicap: 0 }
            },
            rounds: { rSat: round('Saturday', 10), rSun: round('Sunday', 20) }
        }
    },
    trips: {}, global_courses: {}
};

const PRE_PRINT = `window.print = function () {
  window.__teeUrls = Array.prototype.slice.call(document.querySelectorAll('#tournament-print-view .tee-url')).map(function (e) { return e.textContent; });
};`;
const BOARD_PROBE = `(() => JSON.stringify({
  shareUrls: Array.prototype.slice.call(document.querySelectorAll('#team-links-list button[data-share-url]')).map(b => b.getAttribute('data-share-url')),
  roundLabels: Array.prototype.slice.call(document.querySelectorAll('#team-links-list .team-links-round')).map(e => e.innerText.trim())
}))()`;
const PRESS_TEE = `(() => { const b = Array.prototype.slice.call(document.querySelectorAll('button')).find(x => /Print Tee Sheet/.test(x.innerText || '')); if (!b) return 'no button'; b.click(); return 'pressed'; })()`;
const TEE_PROBE = `(() => JSON.stringify({ teeUrls: window.__teeUrls || null }))()`;

const TYPE = `setTimeout(function () {
  var i = document.querySelector('#holes-list input');
  window.__foundInput = !!i;
  if (i) { i.value = '3'; i.dispatchEvent(new Event('change', { bubbles: true })); }
}, 3500);`;
const CARD_PROBE = `(() => JSON.stringify({
  foundInput: !!window.__foundInput,
  refused: /more than one round|doesn't say which one/i.test(document.body.innerText || ''),
  writes: (window.__coldWrites || []).filter(w => /scores/.test(w.path)).map(w => w.path)
}))()`;

const queryOf = (u) => String(u).split('?')[1] || '';

(async () => {
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };
    const failures = [];

    const org = await arriveCold({ url: fileUrl('tournament.html', 'tourney=MRT1'), db, auth: OWNER, preScript: PRE_PRINT, settleMs: 4500,
        steps: [{ tap: '#tab-btn-leaderboard' }, { sleep: 400 }, { expression: BOARD_PROBE },
                { expression: PRESS_TEE }, { sleep: 400 }, { expression: TEE_PROBE }] });
    if (!org.ok) bail('organizer screen did not run: ' + org.reason);
    let board, tee;
    // Steps push a line for every tap and sleep too; the probes are found by shape.
    const parsed = org.value.map((v) => { try { return JSON.parse(v); } catch (e) { return null; } }).filter(Boolean);
    board = parsed.find((x) => x.shareUrls); tee = parsed.find((x) => 'teeUrls' in x);
    if (!board || !tee) bail('a probe did not parse', org.value);
    if (!org.value.includes('pressed')) bail('the Print Tee Sheet button was not on the owner screen', org.value);
    if (!board.shareUrls.length) bail('the owner screen rendered no team links', board);

    // ---- ARM 1: every round, every team, on both surfaces ----
    const want = [];
    ['rSat', 'rSun'].forEach((rid) => [1, 2].forEach((n) => want.push(`team=${n}&round=${rid}`)));
    want.forEach((w) => {
        if (!board.shareUrls.some((u) => u.endsWith(w))) failures.push('board has no link ending ' + w);
        if (!(tee.teeUrls || []).some((u) => u.endsWith(w))) failures.push('tee sheet has no QR url ending ' + w);
    });
    if (board.shareUrls.length !== 4) failures.push('board links: ' + board.shareUrls.length + ', wanted 4 (2 teams x 2 rounds)');
    if (JSON.stringify(board.roundLabels) !== JSON.stringify(['Saturday', 'Sunday'])) failures.push('round labels: ' + JSON.stringify(board.roundLabels));

    // ---- ARM 2: each link found on screen opens a card that saves into its round ----
    const scored = {};
    const links = [...new Set(board.shareUrls.concat(tee.teeUrls || []))];
    for (const u of links) {
        const q = queryOf(u);
        const m = /team=(\d+)&round=(\w+)/.exec(q);
        if (!m) { failures.push('a link names no round: ' + u); continue; }
        const r = await arriveCold({ url: fileUrl('tournament-scorecard.html', q), db, preScript: TYPE, expression: CARD_PROBE, settleMs: 6000 });
        if (!r.ok) bail('card did not run: ' + r.reason);
        const c = JSON.parse(r.value);
        const want1 = `tournaments/MRT1/rounds/${m[2]}/scores/team${m[1]}_h1`;
        scored[q] = c;
        if (c.refused) failures.push(q + ' opened the refusal');
        else if (!c.foundInput) failures.push(q + ' opened a card with no hole box');
        else if (JSON.stringify(c.writes) !== JSON.stringify([want1])) failures.push(q + ' wrote ' + JSON.stringify(c.writes) + ', wanted [' + want1 + ']');
    }

    // ---- ARM 3: an old link with no round is still refused ----
    const old = await arriveCold({ url: fileUrl('tournament-scorecard.html', 'tourney=MRT1&team=1'), db, preScript: TYPE, expression: CARD_PROBE, settleMs: 6000 });
    if (!old.ok) bail('old-link card did not run: ' + old.reason);
    const oldC = JSON.parse(old.value);
    if (!oldC.refused) failures.push('a link with no round was NOT refused: ' + JSON.stringify(oldC));
    if (oldC.writes.length) failures.push('a link with no round wrote ' + JSON.stringify(oldC.writes));

    console.log(JSON.stringify({ verdict: failures.length ? 'FAIL' : 'PASS', failures,
        measured: { boardLinks: board.shareUrls.length, teeUrls: (tee.teeUrls || []).length, roundLabels: board.roundLabels,
                    cards: Object.keys(scored).length, oldLinkRefused: oldC.refused } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2)); process.exit(2); });
