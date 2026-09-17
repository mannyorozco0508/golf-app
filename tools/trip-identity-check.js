#!/usr/bin/env node
// ============================================================================
// TRIP IDENTITY, IN CHROME: the question is on the page, the button writes the
// map, the ledger follows.
//
// trip_identity_test.js drives everything behind the tap. This check opens
// trip.html?trip=TRIP1 cold (tools/lib/cold-arrival.js) on a two-round trip
// where "Mike" played Day 1 and "Mike H" played Day 2 (and "Matt B" / "Matt B."
// likewise), and reads what a golfer sees:
//
//   - the roster lines are on screen, above the question cards, with
//     "in 1 of 2 rounds" beside Mike and Mike H
//   - two "Same golfer?" cards are on screen, in the drafted wording
//   - the money ledger shows Mike and Mike H as two lines
//   - a REAL press of "One golfer" on the Mike card writes
//     trips/TRIP1/identity { R0/101: g1, R1/101: g1 } (the stand-in's update is
//     wrapped to record it; nothing is written anywhere real)
//   - when the trip listener hears the record back (the preScript keeps the
//     page's own value callback and delivers the trip with the identity node),
//     the ledger shows ONE line for the merged golfer, the roster says
//     "in 2 of 2 rounds", the Mike card is gone and a "Change" line is there,
//     and the Matt card is still asked
//
// EXIT 0 PASS, 1 FAIL, 2 could not run.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');
const { trips } = require('../helpers/trip-identity-rounds.js');

const T = trips().mikes;
const trip = { name: 'Myrtle Beach 2026', createdAt: 1, rounds: {} };
T.forEach((r, i) => { trip.rounds[r.code] = { label: r.label, addedAt: i + 1 }; });
const db = { trips: { TRIP1: trip }, events: {} };
T.forEach(r => { db.events[r.code] = r.data; });

const PRESCRIPT = `
(function () {
  window.__writes = [];
  var database = window.firebase.database;
  window.firebase.database = function () {
    var real = database.apply(this, arguments);
    var ref = real.ref;
    real.ref = function (p) {
      var r = ref.call(this, p);
      var on = r.on, update = r.update;
      r.on = function (ev, cb) { if (ev === 'value' && /trips\\/TRIP1$/.test(String(p))) window.__tripCb = cb; return on.call(this, ev, cb); };
      r.update = function (v) { window.__writes.push({ path: String(p), value: JSON.parse(JSON.stringify(v)) }); return update.call(this, v); };
      return r;
    };
    return real;
  };
  window.__deliverTrip = function (val) { if (!window.__tripCb) return 'no callback'; window.__tripCb({ val: function () { return val; }, exists: function () { return true; } }); return 'delivered'; };
})();`;

const PROBE = `
(() => {
  const txt = id => { const e = document.getElementById(id); return e ? e.innerText.replace(/\\s+/g, ' ').trim() : null; };
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
  const cards = Array.from(document.querySelectorAll('.trip-identity-card')).map(c => c.innerText.replace(/\\s+/g, ' ').trim());
  const rosterEl = document.getElementById('trip-roster'), qEl = document.getElementById('trip-identity-questions');
  return JSON.stringify({ roster: txt('trip-roster'), cards, answered: Array.from(document.querySelectorAll('.trip-identity-answered')).map(a => a.innerText.replace(/\\s+/g, ' ').trim()),
    money: txt('trip-money-settlement'), board: txt('trip-leaderboard'), rosterRect: r(rosterEl), questionsRect: r(qEl), writes: window.__writes });
})()`;
const OPEN_MONEY = `(() => { const d = document.getElementById('trip-money-settlement').closest('details'); if (!d) return 'no details'; if (!d.open) d.querySelector('summary').click(); return d.open ? 'open' : 'closed'; })()`;
const PRESS_ONE = `(() => { const card = Array.from(document.querySelectorAll('.trip-identity-card')).find(c => /Mike H/.test(c.innerText)); if (!card) return 'no Mike card'; const b = Array.from(card.querySelectorAll('button')).find(x => /One golfer/.test(x.innerText)); if (!b) return 'no button'; b.click(); return 'pressed'; })()`;
const withIdentity = Object.assign({}, trip, { identity: { R0: { '101': 'g1' }, R1: { '101': 'g1' } } });

(async () => {
    const failures = [];
    const bail = why => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why }, null, 2)); process.exit(2); };
    const r = await arriveCold({ url: fileUrl('trip.html', 'trip=TRIP1'), db, viewport: { width: 390, height: 844 }, preScript: PRESCRIPT, settleMs: 4500,
        // The money section is a collapsed <details> on arrival; a golfer opens it
        // by tapping its summary, and so does this (innerText of a closed section is '').
        steps: [{ expression: OPEN_MONEY }, { expression: PROBE }, { expression: PRESS_ONE }, { sleep: 300 }, { expression: PROBE },
                { expression: `window.__deliverTrip(${JSON.stringify(withIdentity)})` }, { sleep: 1500 }, { expression: PROBE }] });
    if (!r.ok) bail(r.reason);
    const J = i => { try { return JSON.parse(r.value[i]); } catch (e) { return null; } };
    const opened = r.value[0], before = J(1), pressed = r.value[2], afterPress = J(4), delivered = r.value[5], after = J(7);
    if (opened !== 'open') failures.push('the money section did not open: ' + opened);
    if (!before || !after) bail('probe did not parse: ' + JSON.stringify(r.value.map(v => String(v).slice(0, 80))));

    if (!/Mike in 1 of 2 rounds/.test(before.roster) || !/Mike H in 1 of 2 rounds/.test(before.roster)) failures.push('before: roster does not read Mike / Mike H in 1 of 2 rounds: ' + before.roster);
    if (before.cards.length !== 2) failures.push('before: ' + before.cards.length + ' question cards, wanted 2');
    if (!before.cards.some(c => /^Same golfer\? Mike \(Day 1\) and Mike H \(Day 2\) — the trip adds up money and standings by name, so it needs to know whether that is one person typed two ways or two people\. One golfer Two people Nothing is merged or split until you answer\. You can change this later\.$/.test(c))) failures.push('before: the Mike card is not in the drafted wording: ' + JSON.stringify(before.cards));
    if (before.rosterRect && before.questionsRect && before.rosterRect.bottom > before.questionsRect.top + 1) failures.push('before: the question cards sit above the roster lines');
    if (!/Mike \+\$50/.test(before.money) || !/Mike H -\$50/.test(before.money)) failures.push('before: the ledger does not show Mike +$50 and Mike H -$50 as two lines: ' + before.money.slice(0, 200));
    if (pressed !== 'pressed') failures.push('press: ' + pressed);
    const w = (afterPress && afterPress.writes) || [];
    if (w.length !== 1 || !/trips\/TRIP1\/identity$/.test(w[0].path) || JSON.stringify(w[0].value) !== JSON.stringify({ 'R0/101': 'g1', 'R1/101': 'g1' })) failures.push('press: the write is not the one expected: ' + JSON.stringify(w));
    if (afterPress && afterPress.money !== before.money) failures.push('press: the ledger changed before the record came back - nothing may merge on its own');
    if (delivered !== 'delivered') failures.push('deliver: ' + delivered);
    if (!/Mike H in 2 of 2 rounds/.test(after.roster) || /\bMike in 1 of 2/.test(after.roster)) failures.push('after: roster is not one Mike H in 2 of 2 rounds: ' + after.roster);
    // innerText carries the section heading's CSS uppercase, so the cut is case-insensitive.
    const totalsOnly = t => t.slice(0, Math.max(0, t.search(/per-round breakdown/i)));
    if (!/Mike H \$0/.test(after.money) || /Mike \+\$50/.test(totalsOnly(after.money))) failures.push('after: the trip total is not one merged line: ' + after.money.slice(0, 220));
    if (after.cards.length !== 1 || !/Matt B/.test(after.cards[0])) failures.push('after: the Matt card should be the only one still asked: ' + JSON.stringify(after.cards));
    if (!after.answered.some(a => /Mike and Mike H are one golfer\. Change/.test(a))) failures.push('after: no "are one golfer. Change" line: ' + JSON.stringify(after.answered));
    if (!/Mike H 2 rounds played/.test(after.board)) failures.push('after: the cumulative board does not show Mike H over 2 rounds: ' + after.board.slice(0, 200));

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, measured: { before: { roster: before.roster, cards: before.cards.length, moneyHead: before.money.slice(0, 160) }, write: w[0], after: { roster: after.roster, cards: after.cards, answered: after.answered, moneyHead: after.money.slice(0, 160) } } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch(e => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.stack || e) }, null, 2)); process.exit(2); });
