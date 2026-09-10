#!/usr/bin/env node
// ============================================================================
// THE TRIP LEADERBOARD REWARDS NOT SHOWING UP, AND THE RECAP CARD PUBLISHES IT.
//
// The cumulative leaderboard is a RAW STROKE SUM with no normalisation, so
// fewer holes is a lower number and a lower number wins. Measured cold: a
// golfer who played ONE round of four ranks FIRST, ahead of everyone who
// played all four.
//
// RANKING ON NET DOES NOT FIX IT. trip.html sorts `a.net - b.net` in net mode
// and net is the same raw sum - the one-round golfer is first on net too. That
// is not an opinion, it is what the recap card already prints today under the
// heading "STANDINGS - NET".
//
// ONE DEFECT, SORTED THREE TIMES:
//   trip.html  leaderboard   sorts by lbMode (gross or net)
//   trip.html  recap card    .sort((a,b) => a.net - b.net), ignores lbMode
//   trip.html  share text    .sort((a,b) => a.net - b.net), ignores lbMode
// Three hand-written sorts over one cachedPlayerTotals, no shared ranker. A
// fix applied to the leaderboard alone leaves the group chat wrong, and the
// group chat is the half that travels. The card's own comment claims the two
// "can never tell different stories about one trip"; nothing enforces it.
//
// THE SHAREABLE SURFACES ARE STRICTLY WORSE THAN THE SCREEN. The screen prints
// "1 round played" in small grey type under the name. The card and the text
// print a name and a number. The one mitigating signal is absent from exactly
// the two places the number gets believed.
//
// WHAT THIS CHECK REQUIRES, and deliberately no more:
//
//   1  NOBODY WHO PLAYED FEWER ROUNDS OUTRANKS SOMEBODY WHO PLAYED MORE, on
//      all three surfaces. Expressed as an ordering property, not as markup,
//      so the fix is free to render the second tier however it likes - a
//      divider, a heading, a class - without this check dictating it.
//   2  THE TOTALS DO NOT MOVE. Every gross and net figure is frozen against a
//      hand-computed table below. This is the guard that stops "fix the
//      ranking" turning into "change every number a group has seen".
//   3  THE CARD AND THE TEXT AGREE EXACTLY. Both are net-sorted, both go to
//      the same group chat, and today nothing holds them together.
//   4  ALL THREE AGREE ON WHO IS IN WHICH TIER. Within a tier the leaderboard
//      may legitimately differ from the card, because one is showing gross and
//      the other net - that is a column, not a disagreement. Tier membership
//      is the ranker's answer and must be identical.
//
// THE FIXTURE IS HAND-COMPUTED. hcpIndex is the hole number, so getStrokes
// returns exactly `hcp` strokes over 18 holes (verified: 0/5/10/20 -> 0/5/10/20)
// and NET = GROSS - HCP per round, with no engine call needed to predict it.
// Par 4 on all 18, par 72.
//
//   golfer  hcp  per-round gross          net   rounds  TOTAL gross  TOTAL net
//   Ace      0   18x4                = 72  72     4         288         288
//   Mid     10   12x5 + 6x4          = 84  74     4         336         296
//   Bogey   20    5x6 + 13x5         = 95  75     4         380         300
//   Steady  10   14x5 + 4x4          = 86  76     4         344         304
//   Nolan    5    2x5 + 16x4         = 74  69     1          74          69
//
// Gross and net deliberately DISAGREE among the four who played everything -
// gross ranks Ace, Mid, Steady, Bogey; net ranks Ace, Mid, Bogey, Steady - so
// requirement 4 is a real test and not satisfied by coincidence. It was
// coincidence in the fixture that first found this bug, which is why the
// numbers here were chosen to separate.
//
// None of the five names trips isPlaceholderPlayerName, so the identity gate
// stays out of the way. A separate fixture must cover the gate; this one is
// about ranking.
//
// NOTHING HERE CALLS A PAGE FUNCTION. Not renderCumulativeLeaderboard, not
// renderTripRecapCard, not buildShareRecapText, not shareRecap. The sections
// are opened by clicking their <summary>, the card by pressing its button, the
// text by pressing Share - the way an organizer does it.
//
//   node tools/trip-ranking-check.js
//
//   exit 0   nobody outranks a fuller schedule, totals unmoved, all three agree
//   exit 1   at least one surface still rewards playing less, or numbers moved
//   exit 2   could not run, or a surface rendered nothing. NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const PAR = 4;
const course = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: PAR, hcpIndex: i + 1 }));

// Each golfer's card as a per-hole rule, so the gross in the table above is
// reproducible by hand rather than asserted.
const CARDS = {
    Ace:    { hcp: 0,  score: () => 4 },
    Mid:    { hcp: 10, score: (h) => (h <= 12 ? 5 : 4) },
    Bogey:  { hcp: 20, score: (h) => (h <= 5 ? 6 : 5) },
    Steady: { hcp: 10, score: (h) => (h <= 14 ? 5 : 4) },
    Nolan:  { hcp: 5,  score: (h) => (h <= 2 ? 5 : 4) }
};
const IDS = { Ace: 101, Mid: 102, Bogey: 103, Steady: 104, Nolan: 105 };

// THE FROZEN TABLE. Hand-computed from the rules above; nothing here is read
// back from the page. If a fix moves any of these, requirement 2 fails.
const EXPECTED_TOTALS = {
    Ace:    { gross: 288, net: 288, rounds: 4 },
    Mid:    { gross: 336, net: 296, rounds: 4 },
    Bogey:  { gross: 380, net: 300, rounds: 4 },
    Steady: { gross: 344, net: 304, rounds: 4 },
    Nolan:  { gross: 74,  net: 69,  rounds: 1 }
};
const MAX_ROUNDS = 4;

function playersFor(names) {
    return names.map((n) => ({ id: IDS[n], name: n, hcp: String(CARDS[n].hcp), playingForMoney: true }));
}
function scoresFor(names) {
    const s = {};
    names.forEach((n) => { for (let h = 1; h <= 18; h++) s['p' + IDS[n] + '_h' + h] = CARDS[n].score(h); });
    return s;
}
function round(label, names) {
    return {
        eventName: label, roundDay: label, eventCategory: 'weekend', categoryIcon: '⛳',
        activeCourseKey: 'c', courseName: 'Course', gameFormat: 'stroke',
        courseData: course, players: playersFor(names), scores: scoresFor(names)
    };
}

const FULL = ['Ace', 'Mid', 'Bogey', 'Steady'];
const db = {
    trips: {
        RANK: {
            name: 'Ranking Fixture', createdAt: 1, rounds: {
                R1: { label: 'Day 1', addedAt: 1 }, R2: { label: 'Day 2', addedAt: 2 },
                R3: { label: 'Day 3', addedAt: 3 }, R4: { label: 'Day 4', addedAt: 4 }
            }
        }
    },
    events: {
        R1: round('Day 1', FULL.concat(['Nolan'])),   // Nolan plays ONLY day one
        R2: round('Day 2', FULL),
        R3: round('Day 3', FULL),
        R4: round('Day 4', FULL)
    },
    global_courses: {}
};

const PRE = `
 window.__alerts = [];
 window.alert = function (m) { window.__alerts.push(String(m)); };
 window.__shared = null;
 // Captured, not called: shareRecap picks navigator.share first.
 navigator.share = function (o) { window.__shared = (o && o.text) || ''; return Promise.resolve(); };

 setTimeout(function () {
   Array.prototype.forEach.call(document.querySelectorAll('details.trip-section'), function (d) {
     if (!d.open) d.querySelector('summary').click();
   });
 }, 3000);
 setTimeout(function () {
   var b = Array.prototype.slice.call(document.querySelectorAll('button'))
     .filter(function (e) { return /Trip Recap Card/i.test(e.innerText || ''); })[0];
   if (b) b.click();
 }, 4000);
 setTimeout(function () {
   var b = Array.prototype.slice.call(document.querySelectorAll('button'))
     .filter(function (e) { return /Share as Text|Share Trip Recap/i.test(e.innerText || ''); })[0];
   if (b) b.click();
 }, 4800);
`;

// Structure, not innerText lines: a second tier may render with no position
// number at all, and a line-counting parser would silently mis-pair names with
// scores the moment that happened.
const PROBE = `
(() => {
  const txt = (el) => (el ? (el.innerText || '') : '').trim();
  const lb = Array.prototype.slice.call(document.querySelectorAll('#trip-leaderboard .lb-row'))
    .filter(r => r.querySelector('.lb-team'))
    .map(r => ({
      pos: txt(r.querySelector('.lb-pos')),
      name: txt(r.querySelector('.lb-team')).split('\\n')[0].trim(),
      sub: txt(r.querySelector('.lb-sub')),
      gross: txt(r.querySelector('.score-gross')),
      net: txt(r.querySelector('.score-net'))
    }))
    .filter(r => r.name && !/^player$/i.test(r.name));
  // SCOPED TO THE STANDINGS BLOCK BY ITS OWN HEADING. .rc-row is shared by the
  // standings, the money list, the points race and the awards, so "the first
  // five rc-rows" is only the standings while the standings happen to have five
  // of them. The moment a fix renders four, that slice starts silently reading
  // points-race rows as standings.
  const blocks = Array.prototype.slice.call(document.querySelectorAll('#trip-recap-card .rc-block'));
  const stBlock = blocks.filter(b => /STANDINGS/i.test(txt(b.querySelector('.rc-head'))))[0] || null;
  const card = stBlock
    ? Array.prototype.slice.call(stBlock.querySelectorAll('.rc-row'))
        .map(r => ({ pos: txt(r.querySelector('.rc-pos')), name: txt(r.querySelector('.rc-name')),
                     val: txt(r.querySelector('.rc-val')) }))
    : [];
  const blockHeads = blocks.map(b => txt(b.querySelector('.rc-head')));
  return JSON.stringify({
    leaderboard: lb,
    cardRows: card,
    cardText: txt(document.getElementById('trip-recap-card')),
    blockHeads: blockHeads,
    shared: window.__shared,
    alerts: window.__alerts,
    lbSectionText: txt(document.getElementById('trip-leaderboard'))
  });
})()`;

// READS TO THE BLANK LINE, NOT TO THE FIRST NON-NUMBERED LINE.
//
// APPARATUS, NOT AN ASSERTION - this only decides what the check can SEE, and
// every requirement is applied to what it returns.
//
// The first version stopped at `\n[^\d]`, the first line not beginning with a
// digit. That was right for a block where every line is "1. Name - 123" and it
// truncates the instant a second tier exists, because an unranked line carries
// no position. Run against the finished page it read four golfers where five
// were printed - and the GATE caught it, bailing with "could not read a
// five-golfer STANDINGS block" instead of reporting a tier disagreement that
// was the parser's and not the page's.
//
// So: read to the blank line before the next block, and accept BOTH shapes,
// numbered and not. A line that is neither - the tier heading - parses to null
// and is dropped, which is what keeps the heading's wording free of this file.
//
// This widening cannot be what makes the check pass: NC-X (share text sorted
// against the card) and NC-M (one caller left on old logic) are both re-run
// against the finished page with this parser in place, and both still fire.
function standingsFromShareText(text) {
    if (!text) return null;
    const m = text.match(/STANDINGS[^\n]*\n([\s\S]*?)(?:\n\s*\n|$)/);
    if (!m) return null;
    return m[1].split('\n').map((l) => l.trim()).filter(Boolean)
        .map((l) => {
            const mm = l.match(/^(?:(\d+)\.\s*)?(.+?)\s+[—-]\s+(-?\d+)$/);
            return mm ? { pos: mm[1] || '', name: mm[2].trim(), val: mm[3] } : null;
        }).filter(Boolean);
}

(async () => {
    const r = await arriveCold({
        url: fileUrl('trip.html', 'trip=RANK'), db,
        preScript: PRE, expression: PROBE, settleMs: 9000
    });
    const bail = (why, extra) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };
    if (!r.ok) bail(r.reason);
    let o;
    try { o = JSON.parse(r.value); } catch (e) { bail('non-JSON probe: ' + String(r.value).slice(0, 300)); }

    // ---- GATE. Every assertion below is about an ORDER; an empty surface has
    // no order and would satisfy all of them.
    if (!o.leaderboard || o.leaderboard.length < 5) {
        bail('the leaderboard did not render five golfers, so nothing about ranking was tested',
            { got: o.leaderboard, sectionText: o.lbSectionText, alerts: o.alerts });
    }
    if (!o.cardRows || o.cardRows.length === 0) {
        bail('no STANDINGS block on the recap card - the button did not open it, the card '
           + 'refused, or the heading was renamed and this check is now looking for the '
           + 'wrong block. Block headings found are listed, so the third case is visible.',
            { blockHeads: o.blockHeads, cardText: (o.cardText || '').slice(0, 300), alerts: o.alerts });
    }
    if (!o.shared) {
        bail('Share as Text produced nothing, so the third surface was never read',
            { alerts: o.alerts });
    }
    const shareRows = standingsFromShareText(o.shared);
    if (!shareRows || shareRows.length < 5) {
        bail('could not read a five-golfer STANDINGS block out of the share text',
            { shared: (o.shared || '').slice(0, 400), parsed: shareRows });
    }
    // Already scoped to the STANDINGS block in the probe. No slice: if the card
    // ever renders a different number of standings rows, this must see that.
    const cardRows = o.cardRows;

    const failures = [];
    const rounds = (n) => (EXPECTED_TOTALS[n] || {}).rounds || 0;

    // ---- 1. NOBODY WITH FEWER ROUNDS OUTRANKS A FULLER SCHEDULE ----
    const orderCheck = (label, names) => {
        for (let i = 0; i < names.length; i++) {
            for (let j = i + 1; j < names.length; j++) {
                if (rounds(names[i]) < rounds(names[j])) {
                    failures.push(`${label}: ${names[i]} played ${rounds(names[i])} round(s) and is `
                        + `ranked ABOVE ${names[j]} who played ${rounds(names[j])}. Order was `
                        + `${JSON.stringify(names)}. Playing less cannot be how you win the trip.`);
                    return;
                }
            }
        }
    };
    const lbNames = o.leaderboard.map((x) => x.name);
    const cardNames = cardRows.map((x) => x.name);
    const shareNames = shareRows.map((x) => x.name);
    orderCheck('LEADERBOARD', lbNames);
    orderCheck('RECAP CARD', cardNames);
    orderCheck('SHARE TEXT', shareNames);

    // Positive control: the four who played everything must all be present and
    // ranked, so none of the above can pass by refusing people.
    FULL.forEach((n) => {
        if (!lbNames.includes(n)) failures.push(`LEADERBOARD: ${n} played all four rounds and is not on it at all.`);
        if (!cardNames.includes(n)) failures.push(`RECAP CARD: ${n} played all four rounds and is not on it at all.`);
        if (!shareNames.includes(n)) failures.push(`SHARE TEXT: ${n} played all four rounds and is not on it at all.`);
    });

    // ---- 2. THE TOTALS DO NOT MOVE ----
    o.leaderboard.forEach((row) => {
        const want = EXPECTED_TOTALS[row.name];
        if (!want) { failures.push(`LEADERBOARD: unexpected golfer "${row.name}"`); return; }
        const gotGross = parseInt(String(row.gross).replace(/[^0-9-]/g, ''), 10);
        const gotNet = parseInt(String(row.net).replace(/[^0-9-]/g, ''), 10);
        if (gotGross !== want.gross) {
            failures.push(`TOTALS MOVED: ${row.name} gross reads ${gotGross}, hand-computed ${want.gross}. `
                + `Fixing the ranking must not change a number a group has already seen.`);
        }
        if (gotNet !== want.net) {
            failures.push(`TOTALS MOVED: ${row.name} net reads ${gotNet}, hand-computed ${want.net}.`);
        }
        const gotRounds = parseInt(String(row.sub).replace(/[^0-9]/g, ''), 10);
        if (gotRounds !== want.rounds) {
            failures.push(`${row.name} shows ${gotRounds} rounds played, expected ${want.rounds}.`);
        }
    });
    // And the card's own numbers, which are net.
    cardRows.forEach((row) => {
        const want = EXPECTED_TOTALS[row.name];
        if (!want) return;
        const got = parseInt(String(row.val).replace(/[^0-9-]/g, ''), 10);
        if (got !== want.net) {
            failures.push(`TOTALS MOVED: recap card shows ${row.name} at ${got}, hand-computed net ${want.net}.`);
        }
    });

    // ---- 3. THE CARD AND THE TEXT AGREE EXACTLY ----
    if (JSON.stringify(cardNames) !== JSON.stringify(shareNames)) {
        failures.push(`CARD vs TEXT: the screenshot says ${JSON.stringify(cardNames)} and the pasted `
            + `text says ${JSON.stringify(shareNames)}. Both go to the same group chat.`);
    }

    // ---- 4. ALL THREE AGREE ON TIER MEMBERSHIP ----
    // Within a tier the leaderboard may differ from the card because one shows
    // gross and the other net. That is a column, not a disagreement. Who is in
    // which tier is the ranker's answer and must be identical.
    const tierOf = (names) => {
        const qualified = names.filter((n) => rounds(n) === MAX_ROUNDS);
        const rest = names.filter((n) => rounds(n) < MAX_ROUNDS);
        return { qualified: qualified.slice().sort(), rest: rest.slice().sort() };
    };
    const tLb = tierOf(lbNames), tCard = tierOf(cardNames), tShare = tierOf(shareNames);
    if (JSON.stringify(tLb) !== JSON.stringify(tCard) || JSON.stringify(tLb) !== JSON.stringify(tShare)) {
        failures.push(`TIERS DISAGREE across surfaces: leaderboard=${JSON.stringify(tLb)} `
            + `card=${JSON.stringify(tCard)} text=${JSON.stringify(tShare)}`);
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({
        verdict, failures,
        observed: { leaderboard: lbNames, card: cardNames, share: shareNames },
        rows: { leaderboard: o.leaderboard, card: cardRows, share: shareRows }
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
