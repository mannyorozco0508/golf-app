// v196 (2026-09-22, THE RESULTS PAYOUT REDESIGN): the transforms that turn a
// settlement.html capture taken before the redesign into the text the same
// round renders now, so every text-for-text golden keeps proving that NO
// FIGURE MOVED - only where and how it is said. results_payout_test.js proves
// the new surfaces; the callers prove that the old text, with exactly these
// edits, is today's text. Each function throws when an edit it must make finds
// nothing, so an inert transform cannot pass for a proof.
//
// THE POOL SECTION (#money-pool-section), tag-stripped:
//   1. the leading "|Not final — …" line is gone (one mount above everything now);
//   2. the wrapper head "🏆 Weekly Game — $460" and the per-game PAYOUTS block
//      after it ("Skins|…|Net Finish|…|KP|…") are one label, "🏆 Weekly Game";
//   3. each game head splits into title | pot: "📍 KP — $40" -> "📍 KP|$40",
//      "🥇 Net Finish — $200" -> "🥇 Net Finish|$200";
//   4. the skins head "🥩 Skins Pot — $220 (Gross skins, no carry)" becomes a
//      card per pot - "🥩 Skins — Flight A|$110 · 12 golfers" with the basis
//      "Gross skins, no carry" as its own note (before the carry-rule and split
//      notes, which keep their words); a field-wide bucket is "🥩 Skins|$220";
//      the per-flight sub-heads "Flight B — $110" become "🥩 Skins — Flight B|
//      $110 · 11 golfers" (the golfer counts are read off the split sentence);
//   5. the "Skins Summary( — Flight X)" name-and-total lists are gone (a
//      golfer's total prints once, in Pay out); "No skins were won." stays.
// Everything else - every hole row, every KP and net line, the tie prose, the
// unwon and refund rows - is untouched, and that is what the callers prove.
function poolV196(t) {
    if (t === '') return '';   // a round without the Weekly Game renders no pool section, before or after
    let out = t;
    const must = (re, what) => { if (!re.test(out)) throw new Error('poolV196: no ' + what + ' to edit'); };
    // 1. the gap line
    out = out.replace(/^\|Not final — [^|]*\| \|/, '| |');
    // 2. the wrapper head + the payouts block (up to the first game head)
    must(/\|🏆 Weekly Game — \$[\d.]+\|/, 'Weekly Game head');
    out = out.replace(/\|🏆 Weekly Game — \$[\d.]+\|(?:(?!📍 KP|🥇 Net Finish|🥩 Skins Pot)[^|]*\|)*(?=📍 KP|🥇 Net Finish|🥩 Skins Pot)/, '|🏆 Weekly Game|');
    out = out.replace(/^\| \|🏆 Weekly Game\|/, '|🏆 Weekly Game|');
    // 3. KP and net heads
    out = out.replace(/\|📍 KP — (\$[\d.]+|Cancelled)\|/, '|📍 KP|$1|').replace(/\|🥇 Net Finish — (\$[\d.]+)\|/, '|🥇 Net Finish|$1|');
    // 4. the skins head(s)
    const m = out.match(/\|🥩 Skins Pot — (\$[\d.]+) \(([^)]*)\)\|/);
    if (m) {
        const split = out.match(/\|Split by flight, [^|]*\|/);
        if (split) {
            const counts = {}; [...split[0].matchAll(/Flight ([A-Z]) \$[\d.]+ \((\d+) golfers?\)/g)].forEach(x => { counts[x[1]] = x[2]; });
            const golfers = f => counts[f] + ' golfer' + (counts[f] === '1' ? '' : 's');
            // the head, then whatever notes sit between it and the first "Flight A — $" sub-head
            out = out.replace(/\|🥩 Skins Pot — \$[\d.]+ \([^)]*\)\|((?:(?!Flight [A-Z] — \$)[^|]*\|)*)Flight ([A-Z]) — (\$[\d.]+)\|/,
                (all, notes, f, pot) => '|🥩 Skins — Flight ' + f + '|' + pot + ' · ' + golfers(f) + '|' + m[2] + '|' + notes);
            out = out.replace(/\|Flight ([A-Z]) — (\$[\d.]+)\|/g, (all, f, pot) => '|🥩 Skins — Flight ' + f + '|' + pot + ' · ' + golfers(f) + '|');
        } else {
            out = out.replace(m[0], '|🥩 Skins|' + m[1] + '|' + m[2] + '|');
        }
    }
    // 5. the summaries
    out = out.replace(/\|Skins Summary(?: — Flight [A-Z])?\|(?:[^|]+ — \d+ skins?\|\$[\d.]+\|)+/g, '|');
    return out;
}

// THE SUMMARY MOUNT (#combined-settlement-summary) of a settled round, tag-
// stripped, used to hold: the header (course, date, format), [the Send button
// on old captures], [🏁 Final Results on a pool-off round], 💰 Player Payouts,
// [🤝 Who Pays Who]. Now the header and 💰 PAY OUT render in #results-top, the
// summary keeps only Who Pays Who, and NET +/− (the Final Results list, every
// round) renders in #results-net. This splits an old capture into the pieces a
// caller holds against today's mounts:
//   header    the text up to the first card - must lead today's #results-top
//   payouts   [{name, total}] from Player Payouts' TOTAL PAYOUT rows, > 0,
//             largest first - must equal today's Pay out rows
//   none      the golfers whose TOTAL PAYOUT was $0 - today's "No payout:" names
//   wpw       the Who Pays Who card, or '' - must equal today's summary
//   net       [{name, net}] from Final Results when the capture had it
function splitOldSummary(t) {
    const s = String(t);
    const iFR = s.indexOf('|🏁 Final Results|'), iPP = s.indexOf('|💰 Player Payouts|'), iWPW = s.indexOf('|🤝 Who Pays Who|');
    if (iPP < 0) throw new Error('splitOldSummary: no Player Payouts in the capture');
    const firstCard = [iFR, iPP].filter(i => i >= 0).sort((a, b) => a - b)[0];
    const header = s.slice(0, firstCard).replace(/\|📄 Print \/ Save Receipt\| /, '');
    let pp = s.slice(iPP, iWPW >= 0 ? iWPW : s.length);
    const headRe = /^\|💰 Player Payouts\| \| What each golfer won from the pot\. \|/;
    if (!headRe.test(pp)) throw new Error('splitOldSummary: the Player Payouts head is not as captured: ' + pp.slice(0, 80));
    pp = pp.replace(headRe, '|');
    const payouts = [], none = [];
    [...pp.matchAll(/\|([^|]+)\|(?:(?!TOTAL PAYOUT)[^|]*\|)*TOTAL PAYOUT\|\+?\$([\d.]+)(?=\|)/g)].forEach(x => {
        const total = Number(x[2]);
        if (total > 0) payouts.push({ name: x[1], total }); else none.push(x[1]);
    });
    payouts.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    // the card's own leading whitespace cell ("| |🤝 Who Pays Who|") is the card's, and stays with it
    const wpw = iWPW >= 0 ? (s[iWPW - 1] === ' ' ? '| ' : '') + s.slice(iWPW) : '';
    const net = iFR >= 0 ? [...s.slice(iFR, iPP).matchAll(/\|([^|]+)\|([+-]?)\$([\d.]+) NET(?=\|)/g)].map(x => ({ name: x[1], net: (x[2] === '-' ? -1 : 1) * Number(x[3]) })) : null;
    return { header, payouts, none, wpw, net };
}

// Today's Pay out rows and No-payout names, from #results-top's MARKUP (the
// text form has no cell boundary a regex can trust between a row and its
// reasons), plus the tag-stripped text before the card - the header.
function payoutRowsFromHtml(html) {
    const h = String(html);
    const rows = [];
    const re = /<details class="po-row print-open"><summary><span class="po-name">([^<]*)<\/span><span class="po-amt">\$([\d.]+)<\/span><\/summary>([\s\S]*?)<\/details>/g;
    let m;
    while ((m = re.exec(h))) {
        const reasons = [...m[3].matchAll(/<div class="po-reason"><span>([^<]*)<\/span><span>\$([\d.]+)<\/span><\/div>/g)].map(x => ({ label: x[1], amount: Number(x[2]) }));
        rows.push({ name: m[1].replace(/&amp;/g, '&'), total: Number(m[2]), reasons });
    }
    const none = (h.match(/<div class="po-none">No payout: ([^<]*)<\/div>/) || [, ''])[1];
    const head = (h.match(/<span class="po-total">([^<]*)<\/span>/) || [, ''])[1];
    const i = h.indexOf('<div class="settle-card payout-card">');
    // the header's text as a capture had it: the cell boundary before the next
    // card was a single '|' followed by the card's own text, so the trailing
    // '|' here is dropped to match the slice a capture gives
    const header = (i >= 0 ? h.slice(0, i) : h).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').replace(/\|$/, '');
    return { rows, none: none ? none.split(', ').map(n => n.replace(/&amp;/g, '&')) : [], head, header };
}

// THE WHOLE-PAGE PROOF a mount-capture golden runs (tie_shares, weekly_game,
// results_scope, receipt_final, receipt_send_button): today's mounts against a
// capture taken before v196. `now(id)` returns { text, html } for a mount;
// `old` carries the capture's tag-stripped texts - `pool` already run through
// that golden's earlier transforms, `summary` RAW (the header, the button cell,
// Final Results, Player Payouts and Who Pays Who as captured), and any other
// mount to hold equal as-is. What is proven:
//   money-pool-section          == poolV196(old.pool)                (text)
//   results-top                 leads with the old header; its Pay out rows are
//                               the old Player Payouts totals, > 0, largest
//                               first; "No payout:" names the $0 golfers
//   combined-settlement-summary == the old Who Pays Who card, or ''
//   results-net                 the old Final Results list, name for name and
//                               dollar for dollar, when the capture had one
//   every other mount           == the capture
// `opts.norm` is the golden's own text normaliser (a date token, say), applied
// to today's text where the capture was normalised.
function assertV196Mounts(assert, now, old, opts) {
    const o = opts || {};
    const norm = o.norm || (x => x);
    assert.equal(now('money-pool-section').text, poolV196(old.pool), 'money-pool-section');
    const split = splitOldSummary(old.summary);
    const top = payoutRowsFromHtml(now('results-top').html);
    assert.equal(norm(top.header), split.header, 'results-top: the header');
    assert.deepEqual(top.rows.map(r => [r.name, r.total]), split.payouts.map(r => [r.name, r.total]), 'results-top: the Pay out rows are the old TOTAL PAYOUT figures');
    assert.deepEqual(top.none.slice().sort(), split.none.slice().sort(), 'results-top: the No payout names');
    assert.ok(top.rows.length + top.none.length > 0, 'not vacuous');
    top.rows.forEach(r => assert.equal(Math.round(r.reasons.reduce((a, x) => a + x.amount, 0) * 100), Math.round(r.total * 100), r.name + ': the reasons sum to the row'));
    assert.equal(now('combined-settlement-summary').text, split.wpw, 'combined-settlement-summary: Who Pays Who or nothing');
    if (split.net) {
        const rows = [...now('results-net').html.matchAll(/<div class="ledger-row"><span>([^<]*)<\/span><span class="val-(?:pos|neg|even)">([+-]?)\$([\d.]+) NET<\/span><\/div>/g)]
            .map(m => ({ name: m[1].replace(/&amp;/g, '&'), net: (m[2] === '-' ? -1 : 1) * Number(m[3]) }));
        assert.deepEqual(rows, split.net, 'results-net: the old Final Results list');
    }
    // ENTITIES DECODED BEFORE COMPARING, the same way the results-net rows above
    // already decode &amp; out of a golfer's name (line 146). This capture exists
    // to prove a golfer READS the same receipt as at 8a02234, and `.text` returns
    // the raw innerHTML text, entities and all.
    //
    // v218 moved HTML-escaping out of the match engine and onto the sinks, so
    // settlement.html now escapes the Receipt's segment result. "Carp 2&0" - where
    // the & is the match-play separator, "2 up with 0 to play" - is stored as
    // "Carp 2&amp;0" and RENDERS as "Carp 2&0", unchanged on screen. Comparing raw
    // markup would fail that while the receipt is identical, and re-recording the
    // golden would have thrown away the proof that it is identical. Measured, not
    // assumed: with the decode, every finished-receipt capture matches 8a02234
    // byte for byte.
    const deEntity = (s) => String(s)
        .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    (o.equal || []).forEach(id => assert.equal(deEntity(now(id).text), old[id], id));
}

module.exports = { poolV196, splitOldSummary, payoutRowsFromHtml, assertV196Mounts };
