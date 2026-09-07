#!/usr/bin/env node
// ============================================================================
// THE AWARDS SCREEN PUTS A NAME IN A GROUP CHAT
//
// The trip recap exists to be screenshotted and pasted. A wrong name on it is not
// a rounding error - it is an accusation or a credit, published to twelve people
// who were there. So this arrives cold on trip.html, touches nothing, and reads
// what the page renders for itself.
//
// THREE THINGS, all of which shipped:
//
//   1. NO RENDERED TEXT MAY CONTAIN A LITERAL \\uXXXX. The recap bar rendered
//      "Screenshot this \\u2014 or use Share below" and its share button read
//      "\\uD83D\\uDCE4 Share as Text". A fourth was found on admin.html once the
//      unit scan existed. This is the rendered half of that guard: the source scan
//      in trip_awards_identity_test.js covers hidden markup, and this covers what
//      a golfer's eye actually lands on - INCLUDING inside the recap overlay,
//      which is opened here by pressing the button that opens it.
//
//   2. AWARDS MUST REFUSE TWO GOLFERS THEY CANNOT TELL APART. Two Mikes produced
//      "Most Birdies: Mike Dunne - 5", which is 3 + 2. The money already refuses
//      this; the awards did not.
//
//   3. A PAR IS NOT A BLOW-UP. With nobody over par it crowned "Hole 2 (Par 4,
//      shot 4)" as the biggest blow-up of the trip.
//
// NOTHING HERE CALLS A PAGE FUNCTION. renderTripAwards, computeTripAwards and
// openTripRecap are never named: the page loads its own data and renders, and the
// recap is opened by clicking its button.
//
//   node tools/trip-awards-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON names the case
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

function roundOf(label, names, tweak) {
    const players = names.map((n, i) => ({ id: 101 + i, name: n, hcp: '0' }));
    const scores = {};
    players.forEach(p => CD.forEach(h => { scores['p' + p.id + '_h' + h.hole] = 4; }));
    if (tweak) tweak(scores);
    return { eventName: label, roundDay: label, courseName: 'Caledonia',
             activeCourseKey: 'awards-check', gameFormat: 'stroke',
             courseData: CD, players: players, scores: scores };
}
const db = (r1, r2) => ({
    trips: { TRIP1: { name: 'Myrtle Beach 2026', createdAt: 1,
        rounds: { RA: { label: 'Day 1', addedAt: 1 }, RB: { label: 'Day 2', addedAt: 2 } } } },
    events: { RA: r1, RB: r2 }
});

const FOUR = ['Marty Sharp', 'Carp Dean', 'Lance Webb', 'Zach Hill'];

// navigator.share and the clipboard are replaced so the recap can be captured
// without anything leaving the machine. Neither is a page function.
const STUB_SHARE = `
(function () {
  window.__shared = null;
  navigator.share = function (o) { window.__shared = o; return Promise.resolve(); };
  try {
    Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { writeText: function (t) { window.__shared = { text: t }; return Promise.resolve(); } } });
  } catch (e) {}
  window.__alerts = [];
  window.alert = function (m) { window.__alerts.push(String(m)); };
})();`;

// Everything on screen, plus the recap opened the way a golfer opens it.
const PROBE = `
(() => {
  const out = {};
  const t = el => el ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : null;
  const on = el => !!(el && el.getClientRects().length > 0);

  const box = document.getElementById('trip-awards');
  out.awardsOnScreen = on(box);
  out.awards = t(box);

  // Press the control that opens the recap, so the overlay's own text is rendered
  // and therefore visible to innerText. Two of the escapes that shipped were in
  // there, behind a tap - a body scan with the overlay closed walks past them.
  const rb = Array.from(document.querySelectorAll('button'))
      .filter(b => /openTripRecap/.test(b.getAttribute('onclick') || ''))[0];
  out.recapButton = !!rb;
  if (rb) rb.click();
  out.recapOnScreen = on(document.getElementById('trip-recap-overlay'));
  out.recapCard = t(document.getElementById('trip-recap-card'));
  out.recapChrome = [t(document.querySelector('.recap-hint')),
                     t(document.querySelector('.recap-share'))].filter(Boolean).join(' | ');

  // EVERY RENDERED CHARACTER ON THE PAGE, with the overlay open. innerText, never
  // textContent: this page keeps its whole application in an inline <script>, and
  // textContent would match \\uXXXX in that source on any page at all.
  out.rendered = (document.body.innerText || '').replace(/\\s+/g, ' ').trim();
  out.renderedChars = out.rendered.length;

  // THE CLIPBOARD STRING, by pressing the button a golfer presses. This is the one
  // surface that leaves the app: it used to print money the screen was refusing.
  const sb = Array.from(document.querySelectorAll('button'))
      .filter(b => /shareRecap/.test(b.getAttribute('onclick') || ''))[0];
  out.shareButton = !!sb;
  if (sb) sb.click();
  out.clipboard = (window.__shared || {}).text || null;
  out.board = t(document.getElementById('trip-leaderboard'));
  out.points = t(document.getElementById('trip-points-race'));
  return JSON.stringify(out);
})()`;

const ESCAPE = /\\u[0-9A-Fa-f]{4}/g;

function bail(msg) {
    console.error('trip-awards-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

const CASES = [
    {
        name: 'clean trip',
        db: db(roundOf('Day 1', FOUR, s => {
                 [1, 3, 5].forEach(h => s['p101_h' + h] = 3);   // Marty: 3 birdies
                 s['p104_h12'] = 2;                              // Zach: an eagle
                 s['p102_h7'] = 11;                              // Carp: +7
             }),
             roundOf('Day 2', FOUR, s => { s['p101_h2'] = 3; })),
        expect: { awarded: true, blowUp: 'Carp Dean', refuses: false }
    },
    {
        name: 'two golfers with one name',
        db: db(roundOf('Day 1', ['Mike Dunne', 'Mike Dunne', 'Lance Webb', 'Zach Hill'], s => {
                 [1, 3, 5].forEach(h => s['p101_h' + h] = 3);
                 [2, 4].forEach(h => s['p102_h' + h] = 3);
             }),
             roundOf('Day 2', FOUR, s => { s['p101_h1'] = 3; })),
        expect: { awarded: false, refuses: true }
    },
    {
        name: 'nobody blew up',
        db: db(roundOf('Day 1', FOUR, s => { s['p101_h1'] = 3; }),
               roundOf('Day 2', FOUR, s => { s['p102_h2'] = 5; })),  // one bogey only
        expect: { awarded: true, blowUp: null, refuses: false }
    }
];

(async () => {
    const problems = [];
    const report = { cases: {} };
    let measured = 0;

    for (const c of CASES) {
        const r = await arriveCold({ url: fileUrl('trip.html', 'trip=TRIP1'), db: c.db,
            preScript: STUB_SHARE, expression: PROBE, settleMs: 5200 });
        if (!r.ok) bail(c.name + ': ' + r.reason);
        let g; try { g = JSON.parse(r.value); } catch (e) { bail(c.name + ': unreadable output'); }
        report.cases[c.name] = { awards: g.awards, recapChrome: g.recapChrome,
                                 recapOnScreen: g.recapOnScreen, chars: g.renderedChars,
                                 clipboard: g.clipboard };

        // A RUN THAT RENDERED NOTHING MEASURED NOTHING.
        if (!g.awardsOnScreen || !g.awards) {
            bail(c.name + ': the awards panel rendered nothing at all - the page did '
                + 'not load, so none of the assertions below mean anything');
        }
        if (g.renderedChars < 200) bail(c.name + ': the page rendered ' + g.renderedChars
            + ' characters - nothing was measured');
        measured++;

        // 1. LITERAL ESCAPES, anywhere a golfer can read them.
        const esc = g.rendered.match(ESCAPE) || [];
        if (esc.length) {
            problems.push(c.name + ': rendered text contains literal escape(s) '
                + JSON.stringify(esc.slice(0, 4)) + ' - a \\uXXXX sequence only '
                + 'resolves inside a JS string');
        }
        if (!g.recapButton) {
            problems.push(c.name + ': no control opens the recap, so its own text was '
                + 'never rendered and never scanned');
        } else if (!g.recapOnScreen) {
            problems.push(c.name + ': pressing the recap control opened nothing');
        }

        // 2. THE REFUSAL.
        if (c.expect.refuses) {
            if (/Most Birdies/i.test(g.awards)) {
                problems.push(c.name + ': awards were handed out to a name two golfers '
                    + 'share: ' + g.awards);
            }
            if (!/Mike Dunne/.test(g.awards) || !/rename/i.test(g.awards)) {
                problems.push(c.name + ': the refusal does not name the golfer and the '
                    + 'fix: ' + g.awards);
            }
            if (/Most Birdies|Blow-Up|Sandbagger/i.test(g.recapCard || '')) {
                problems.push(c.name + ': the RECAP CARD still carries awards built on a '
                    + 'merged name - that is the thing people paste into the chat');
            }
            // THE ONE THAT LEAVES THE APP.
            if (!g.shareButton) {
                problems.push(c.name + ': no share control, so the clipboard was never '
                    + 'measured - the assertions below prove nothing');
            } else if (!g.clipboard) {
                problems.push(c.name + ': pressing share produced no text at all');
            } else {
                const cb = g.clipboard;
                if (/owes/i.test(cb) || /\u{1F4B5}/u.test(cb)) {
                    problems.push(c.name + ': THE CLIPBOARD CARRIES MONEY the screen '
                        + 'refused to show: ' + cb);
                }
                if (/\u{1F3C6} STANDINGS/u.test(cb)) {
                    problems.push(c.name + ': the clipboard carries merged standings');
                }
                if (/POINTS RACE/.test(cb)) {
                    problems.push(c.name + ': the clipboard carries a merged points race');
                }
                if (/\u{1F3C5} AWARDS/u.test(cb)) {
                    problems.push(c.name + ': the clipboard carries awards');
                }
                if (!/Mike Dunne/.test(cb) || !/told apart|same name/i.test(cb)
                    || !/rename/i.test(cb)) {
                    problems.push(c.name + ': the clipboard does not say WHY it is empty - '
                        + 'a recap with no reason reads as a broken app: ' + cb);
                }
            }
            if (/Mike Dunne/.test(g.board || '') && /rounds played/i.test(g.board || '')) {
                problems.push(c.name + ': the cumulative board still merges two golfers');
            }
            if (/Pos\s+Player\s+Points/i.test(g.points || '')) {
                problems.push(c.name + ': the points race still ranks a merged name');
            }
        } else {
            if (!/Most Birdies/i.test(g.awards)) {
                problems.push(c.name + ': a clean trip was refused its awards: ' + g.awards);
            }
            // THE OTHER HALF: a gate that fires on a clean trip is a broken app.
            const cb = g.clipboard || '';
            ['\u{1F3C6} STANDINGS', 'SETTLEMENT', 'POINTS RACE', '\u{1F3C5} AWARDS']
                .forEach(block => {
                    if (!new RegExp(block, 'u').test(cb)) {
                        problems.push(c.name + ': a clean trip\'s recap is missing '
                            + block + ': ' + cb);
                    }
                });
            if (!/\d+ rounds?/.test(cb)) {
                problems.push(c.name + ': the recap does not say how much golf it covers');
            }
        }

        // 3. A PAR IS NOT A BLOW-UP.
        if (c.expect.blowUp === null) {
            if (/\(Par \d+, shot \d+\)/.test(g.awards)) {
                const m = /\(Par (\d+), shot (\d+)\)/.exec(g.awards);
                if (m && Number(m[2]) - Number(m[1]) < 2) {
                    problems.push(c.name + ': crowned a ' + (Number(m[2]) - Number(m[1]) === 0
                        ? 'PAR' : 'bogey') + ' as the biggest blow-up: ' + m[0]);
                }
            }
            if (!/no blow-up|nobody went over par/i.test(g.awards)) {
                problems.push(c.name + ': the blow-up award vanished with no explanation, '
                    + 'which reads as a bug rather than a fact about the golf');
            }
        } else if (c.expect.blowUp) {
            if (!new RegExp(c.expect.blowUp).test(g.awards)) {
                problems.push(c.name + ': the real blow-up was not named: ' + g.awards);
            }
        }
    }

    // ---- EVERY PAGE, not just this one --------------------------------------
    // The escape class has shipped four times across three files, so the rendered
    // scan sweeps the whole app rather than the screen it was last found on. Each
    // page is opened cold with a round and a trip in the fixture so it renders
    // something; a page that renders nothing is reported rather than passed.
    const PAGE_DB = db(roundOf('Day 1', FOUR, s2 => { s2['p101_h1'] = 3; s2['p102_h7'] = 11; }),
                       roundOf('Day 2', FOUR, s2 => { s2['p101_h2'] = 3; }));
    const SWEEP = `
    (() => {
      const t = (document.body.innerText || '').replace(/\\s+/g, ' ').trim();
      return JSON.stringify({ chars: t.length, hits: (t.match(/\\\\u[0-9A-Fa-f]{4}/g) || []).slice(0, 4) });
    })()`;
    const PAGES = require('fs').readdirSync(require('path').join(__dirname, '..'))
        .filter(f => f.endsWith('.html'));
    report.sweep = {};
    let swept = 0;
    for (const page of PAGES) {
        const q = page === 'trip.html' ? 'trip=TRIP1' : 'game=RA';
        const r = await arriveCold({ url: fileUrl(page, q), db: PAGE_DB,
            expression: SWEEP, settleMs: 3200 });
        if (!r.ok) { problems.push('sweep: ' + page + ' would not open: ' + r.reason); continue; }
        const g = JSON.parse(r.value);
        report.sweep[page] = g.chars + ' chars' + (g.hits.length ? ' ' + JSON.stringify(g.hits) : '');
        if (g.chars < 40) {
            problems.push('sweep: ' + page + ' rendered ' + g.chars + ' characters - it was '
                + 'not really scanned');
            continue;
        }
        swept++;
        if (g.hits.length) {
            problems.push('sweep: ' + page + ' renders literal escape(s) '
                + JSON.stringify(g.hits) + ' - a \\uXXXX sequence only resolves inside '
                + 'a JS string');
        }
    }
    report.pagesSwept = swept;
    if (swept < 5) bail('only ' + swept + ' pages rendered anything - the sweep proved little');

    if (measured === 0) bail('no case rendered anything - nothing was measured');
    report.casesMeasured = measured;
    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
