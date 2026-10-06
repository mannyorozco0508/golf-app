#!/usr/bin/env node
// ============================================================================
// WHAT A WATCHER SEES ON THE PUBLIC BOARD (Tournaments Wave 1, A3 + A4).
//
// The Leaderboard tab is what anyone with tournament.html?tourney=CODE lands
// on. It used to carry every team's scoring link and QR code, the print
// buttons and an editable payout calculator whose default split the pool
// evenly - so the page a parent opened to watch was also the page that handed
// out every card, and it showed prize money nobody had chosen.
//
// MEASURED, NOT INFERRED. mini-dom cannot say what is visible (no layout); this
// counts RENDERED elements - getClientRects().length > 0 - in a real browser,
// on a cold arrival, touching nothing but the Leaderboard tab pill.
//
// SIX ARRIVALS.
//   signed out          0 scorecard links, 0 QR codes, 0 print buttons, 0 payout
//                       inputs; the watch control and the board ARE there
//   signed-in stranger  the same - signed in as somebody else is signed out
//   owner               all of it is there (THE POSITIVE ARM: a page that
//                       rendered nothing would satisfy every zero above), and
//                       with nothing saved the amount boxes are BLANK, not the
//                       $300 / $300 / $300 even split of a $900 pool
//   watcher, saved      the saved amounts, read-only
//   watcher, unsaved    "Payouts not set yet." and no $300.00 anywhere
//   legacy, signed out  no ownerUid: links, QR codes and print ARE on screen
//                       (nobody owns it); no calculator inputs
//
//   node tools/tournament-spectator-check.js
//
//   exit 0   every arrival measured as above
//   exit 1   a watcher can see something that scores, or a payout nobody set
//   exit 2   could not run, or the owner arm rendered nothing. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const OWNER = { uid: 'u-org', email: 'org@example.com', isAnonymous: false };
const STRANGER = { uid: 'u-who', email: 'who@example.com', isAnonymous: false };
const COURSE = [...Array(18)].map((_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
function scores(t, s) { const o = {}; for (let h = 1; h <= 18; h++) o[`team${t}_h${h}`] = s; return o; }
function rec(extra) {
    return Object.assign({
        name: 'Watch Classic', format: 'scramble', courseName: 'Cameron Park', courseData: COURSE,
        entryFee: 300, createdAt: 1, ownerUid: OWNER.uid,
        teams: {
            team1: { num: 1, name: 'Eagles', players: ['Ann'], handicap: 0 },
            team2: { num: 2, name: 'Hawks', players: ['Bo'], handicap: 0 },
            team3: { num: 3, name: 'Owls', players: ['Cal'], handicap: 0 }
        },
        scores: Object.assign({}, scores(1, 3), scores(2, 4), scores(3, 5))
    }, extra || {});
}
const dbOf = (r) => ({ tournaments: { SPEC1: r }, trips: {}, global_courses: {} });

const PROBE = `(() => {
  const seen = (e) => !!e && e.getClientRects().length > 0;
  const all = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));
  const tab = document.getElementById('manage-tab-leaderboard');
  const inTab = (sel) => all('#manage-tab-leaderboard ' + sel).filter(seen);
  const pub = document.getElementById('payout-public-amounts');
  return JSON.stringify({
    boardRows: inTab('.lb-row').length,
    scorecardLinks: inTab('[data-share-url*="tournament-scorecard"], a[href*="tournament-scorecard"]').length,
    qrCodes: inTab('.team-qr, .team-qr img, .team-qr canvas').length,
    printButtons: inTab('button').filter(b => /Print/.test(b.innerText || '')).length,
    payoutInputs: inTab('input').length,
    amountBoxValues: all('input[id^="payout-spot-"]').filter(seen).map(i => i.value),
    watchButton: inTab('#lb-watch-share').length,
    publicPayouts: pub ? pub.innerText.trim() : null,
    tabText: tab ? tab.innerText : ''
  });
})()`;

async function look(r, auth) {
    const a = await arriveCold({ url: fileUrl('tournament.html', 'tourney=SPEC1'), db: dbOf(r), auth, settleMs: 4500,
        steps: [{ tap: '#tab-btn-leaderboard' }, { sleep: 500 }, { expression: PROBE }] });
    if (!a.ok) return { ran: false, reason: a.reason };
    const v = a.value.map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).find((x) => x && 'boardRows' in x);
    return v ? Object.assign({ ran: true }, v) : { ran: false, reason: 'probe did not parse: ' + JSON.stringify(a.value) };
}

(async () => {
    const bail = (why, extra) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2)); process.exit(2); };
    const failures = [];
    const out = {};
    out.signedOut = await look(rec(), 'signed-out');
    out.stranger = await look(rec(), STRANGER);
    out.owner = await look(rec(), OWNER);
    out.watcherSaved = await look(rec({ payoutSpots: [500, 300, 100] }), 'signed-out');
    out.watcherUnsaved = out.signedOut;
    // A LEGACY record (no ownerUid), signed out: nobody owns it, so the
    // handout stays on screen for everyone (follow-up to A3, 2026-10-06).
    const legacy = rec(); delete legacy.ownerUid;
    out.legacy = await look(legacy, 'signed-out');
    Object.keys(out).forEach((k) => { if (!out[k].ran) bail(k + ' did not run: ' + out[k].reason); });

    // ---- THE GATE: the owner arm must show everything, or the zeros mean nothing ----
    const o = out.owner;
    if (!(o.boardRows > 0 && o.scorecardLinks >= 3 && o.qrCodes >= 3 && o.printButtons >= 3 && o.payoutInputs >= 2)) {
        bail('the OWNER does not see the organizer half, so a watcher seeing none of it proves nothing', o);
    }

    ['signedOut', 'stranger'].forEach((k) => {
        const m = out[k];
        if (m.boardRows === 0) failures.push(k + ': the board itself did not render');
        if (m.scorecardLinks) failures.push(k + ': sees ' + m.scorecardLinks + ' scorecard link(s)');
        if (m.qrCodes) failures.push(k + ': sees ' + m.qrCodes + ' QR code element(s)');
        if (m.printButtons) failures.push(k + ': sees ' + m.printButtons + ' print button(s)');
        if (m.payoutInputs) failures.push(k + ': sees ' + m.payoutInputs + ' payout input(s)');
        if (m.watchButton !== 1) failures.push(k + ': no "Share live leaderboard" control');
    });
    if (o.watchButton !== 1) failures.push('owner: no "Share live leaderboard" control');
    const L = out.legacy;
    if (!(L.scorecardLinks >= 3 && L.qrCodes >= 3 && L.printButtons >= 3)) failures.push('legacy, signed out: the handout is not on screen: ' + JSON.stringify({ links: L.scorecardLinks, qr: L.qrCodes, print: L.printButtons }));
    if (L.payoutInputs) failures.push('legacy: ' + L.payoutInputs + ' payout input(s) on an event nobody can save amounts on');
    if (o.amountBoxValues.some((v) => v !== '')) failures.push('owner, nothing saved: amount boxes read ' + JSON.stringify(o.amountBoxValues) + ' - an amount nobody typed');
    if (!/1st \$500\.00 · 2nd \$300\.00 · 3rd \$100\.00/.test(out.watcherSaved.publicPayouts || '')) failures.push('watcher, saved: amounts read ' + JSON.stringify(out.watcherSaved.publicPayouts));
    if (!/Payouts not set yet\./.test(out.watcherUnsaved.publicPayouts || '')) failures.push('watcher, unsaved: reads ' + JSON.stringify(out.watcherUnsaved.publicPayouts));
    if (/\$300\.00/.test(out.watcherUnsaved.tabText)) failures.push('watcher, unsaved: an even-split $300.00 is on screen');

    const brief = (m) => ({ boardRows: m.boardRows, scorecardLinks: m.scorecardLinks, qrCodes: m.qrCodes, printButtons: m.printButtons,
        payoutInputs: m.payoutInputs, watchButton: m.watchButton, amountBoxValues: m.amountBoxValues, publicPayouts: m.publicPayouts });
    console.log(JSON.stringify({ verdict: failures.length ? 'FAIL' : 'PASS', failures,
        measured: { signedOut: brief(out.signedOut), stranger: brief(out.stranger), owner: brief(o), watcherSaved: brief(out.watcherSaved), legacySignedOut: brief(out.legacy) } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2)); process.exit(2); });
