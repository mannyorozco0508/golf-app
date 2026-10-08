#!/usr/bin/env node
// ============================================================================
// AN UNPLAYED ROUND'S OWN RESULTS PAGE OWES NOBODY ANYTHING (2026-10-07)
//
// MANNY'S RULE, the same one the trip page now follows: until a round has
// STARTED, its Results page shows $0 for everyone - no charge and no refund.
//
// THE DEFECT, measured on his real Day 3 (3MKUCF, Pine Lakes, 0 scores, $20
// buy-in, KP $20 / Net $40 / Skins remainder - saved as
// unstarted_round.fixture.json so this needs no network):
//
//   each golfer paid        $20
//   the card refunded      "$60 / 4"  = $15 each
//   the KP bucket held     "$5 in the pot" on each of four blank holes
//   so the page said       every golfer is $5 down on a round nobody played
//
// computeCombinedNetTotals agrees - it returns net -5 for all four - which is
// what the trip page was reading before it was fixed.
//
// WHY IT IS NOT A KP CHANGE. pool-engine.js carries Manny's own rule from
// 2026-09-22: KP money NEVER goes back to the field. That rule is not in
// question here and the engine is not touched. The point is that a round
// NOBODY HAS STARTED has no KP to resolve and no buy-in to account for yet -
// so the page must not present the pot's accounting at all, exactly as the
// trip ledger now skips an unplayed round instead of charging it.
//
// IT CALLS NOTHING THE PAGE DEFINES: it serves the repo, opens the Results URL
// a golfer taps, and reads what rendered.
//
// EXIT: 0 both arms right; 2 anything else.
// ============================================================================

const { arriveCold } = require('./lib/cold-arrival.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CODE = 'NOSTART';
const BASE = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'unstarted_round.fixture.json'), 'utf8'));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serveRepo(root) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const u = req.url.split('?')[0];
            const f = path.join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
            if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
                res.writeHead(404); return res.end('no');
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

// String.raw, NOT a plain template literal. A template literal EATS a single
// backslash: "\$" became "$" (an end-of-string anchor), "\s" became "s" and
// "\b" became a backspace character - so three of the regexes below were
// silently different from what they read as, and two of them reported a clean
// page as broken and a broken page as clean. String.raw passes the source
// through untouched, so what is written here is what the browser compiles.
//
// innerText, never textContent: settlement.html keeps its whole application in
// an inline script, so textContent matches these very sentences in SOURCE on a
// page that rendered nothing at all.
const READ = String.raw`(function () {
  var t = String(document.body.innerText || '').replace(/[ \t]+/g, ' ');
  var pool = document.getElementById('money-pool-section');
  return JSON.stringify({
    chars: t.length,
    poolText: pool ? String(pool.innerText || '').replace(/\s+/g, ' ').trim() : null,
    // THE FIGURES THAT MUST NOT BE THERE BEFORE A ROUND STARTS.
    // The held KP figure, not the bare phrase: the fix's own sentence says
    // "nothing is in the pot", so /in the pot/ on its own matched the cure as
    // well as the disease. The defect is a DOLLAR AMOUNT held: "$5 in the pot".
    inThePot: /\$\s?[0-9][0-9.,]*\s+in the pot/i.test(t),
    refundedToField: /Refunded to the field/i.test(t),
    splitRefund: /÷\s?[0-9]/.test(t),
    // AND THE SENTENCE THAT MUST BE.
    saysNotStarted: /owes nobody anything|not started|Not played yet/i.test(t),
    isResults: /Settle/i.test(t),
    names: ['Manny', 'Reese', 'Marty', 'Tim'].filter(function (n) { return t.indexOf(n) !== -1; }).length,
    // MANNY'S WORDS WERE "$0 FOR EVERYONE", so the figure is read per golfer
    // off the rendered rows rather than inferred from the absence of a charge.
    zeroPerGolfer: (function () {
      if (!pool) return 0;
      return Array.prototype.slice.call(pool.querySelectorAll('.ledger-row'))
        .filter(function (row) {
          var txt = String(row.innerText || '');
          return txt.indexOf('$0') !== -1
            && ['Manny', 'Reese', 'Marty', 'Tim'].some(function (n) { return txt.indexOf(n) !== -1; });
        }).length;
    })()
  });
})()`;

async function arm(port, label, round) {
    const r = await arriveCold({
        url: 'http://127.0.0.1:' + port + '/settlement.html?game=' + CODE,
        db: { events: { [CODE]: round }, trips: {}, global_courses: {}, tournaments: {} },
        auth: { uid: 'me-uid' }, viewport: { width: 390, height: 844 },
        settleMs: 3800, steps: [{ sleep: 1000 }, { expression: READ }]
    });
    if (!r.ok) return { label, error: r.reason };
    const raw = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').pop();
    return raw ? Object.assign({ label }, JSON.parse(raw)) : { label, error: 'nothing measured' };
}

(async () => {
    const out = { what: 'an unplayed round owes nobody anything on its own Results page' };
    const served = await serveRepo(path.join(__dirname, '..'));
    try {
        const unstarted = JSON.parse(JSON.stringify(BASE));
        unstarted.ownerUid = 'me-uid';
        unstarted.scores = {};

        // THE POSITIVE CONTROL: the same round, PLAYED. One golfer with one hole
        // is enough to start it, but a fully scored round is what proves the pool
        // card still works - a gate that simply blanked the card would pass every
        // "must not contain" assertion above forever.
        const played = JSON.parse(JSON.stringify(BASE));
        played.ownerUid = 'me-uid';
        played.scores = {};
        played.players.forEach((p, pi) => {
            for (let h = 1; h <= 18; h++) played.scores['p' + p.id + '_h' + h] = 4 + ((h + pi) % 3);
        });
        played.kpWinners = { h2: String(played.players[0].id), h8: String(played.players[1].id),
                             h11: String(played.players[2].id), h16: String(played.players[3].id) };

        out.unstarted = await arm(served.port, 'unstarted', unstarted);
        out.played = await arm(served.port, 'played', played);
    } catch (e) {
        out.error = String(e && e.message || e);
    } finally {
        try { served.server.close(); } catch (e) {}
    }

    const faults = [];
    const u = out.unstarted || {}, p = out.played || {};
    if (out.error) faults.push('error: ' + out.error);
    if (u.error) faults.push('unstarted arm: ' + u.error);
    if (p.error) faults.push('played arm: ' + p.error);

    // THE PLAYED ARM FIRST: if the pool card does not render on a round that WAS
    // played, every absence asserted on the unstarted arm is worthless.
    if (!p.error) {
        if (!p.poolText) faults.push('POSITIVE CONTROL: the played round has no pool card at all');
        else if (!/KP/i.test(p.poolText)) faults.push('POSITIVE CONTROL: the played round’s pool card shows no KP: ' + String(p.poolText).slice(0, 120));
        if (p.names < 4) faults.push('POSITIVE CONTROL: the played round names only ' + p.names + ' of 4 golfers');
    }
    // THE UNSTARTED ARM: no accounting, and it says so.
    if (!u.error) {
        if (u.names < 4) faults.push('the unstarted Results page names only ' + u.names + ' of 4 golfers, so it may not have rendered');
        if (u.inThePot) faults.push('the unstarted round still holds KP money on screen ("in the pot")');
        if (u.refundedToField) faults.push('the unstarted round still shows a refund ("Refunded to the field")');
        if (u.splitRefund) faults.push('the unstarted round still splits a refund across the field');
        if (!u.saysNotStarted) faults.push('nothing on the unstarted Results page says the round has not started: '
            + String(u.poolText || '').slice(0, 160));
        if (u.zeroPerGolfer !== 4) faults.push('only ' + u.zeroPerGolfer + ' of 4 golfers are shown at $0 on the unstarted round');
    }
    out.faults = faults;
    out.ok = faults.length === 0;
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 2);
})();
