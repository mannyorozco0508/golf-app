// 2026-09-22 (KP MONEY NEVER GOES BACK TO THE FIELD): the transform that turns
// a pool receipt captured under the 2026-09-19 "recording pays" rule into the
// text the same round renders now. Applied to the OLD capture, character for
// character - kp_never_refunds_test.js proves the behaviour, the callers prove
// nothing else in the text moved. The captured round has hole 3 recorded (Ann
// Alpha) and holes 7/12/16 blank, 23 golfers, $10 a hole. Four differences, all
// this rule's:
//   1. "Hole 7: nobody recorded it | $10 back to the field" (finished) and
//      "Hole 7: not recorded yet | $10 in the pot" (live) both read
//      "Hole 7: not recorded | $10 in the pot" - one state, held.
//   2. The "↩️ Refunded to the field (Unclaimed KP money refunded to the field.
//      …) | $N ÷ 23" row loses the KP reason and its $30; a row that carried
//      only the KP refund goes altogether.
//   3. The head gains the Not-final line naming the held holes - every held
//      hole once the cards are in, only the PLAYED ones while live
//      (score-gaps.js holePlayedByField): "|Not final — KP on holes 7, 12, 16
//      not recorded" before the capture's leading "| |"; thru 10 that is
//      "KP on hole 7 not recorded".
//   4. On the live-head surface (buildLiveResultsHtml) a finished round with a
//      held KP has its own head again: "🏆 RESULTS — NOT FINAL | Every card is
//      in. A KP is not recorded — its share stays in the pot, and final money
//      appears once the winner is recorded." in place of "🏆 LIVE RESULTS —
//      THRU 18 | The round is still in play. Final money appears once every
//      card is in." (kp_settlement_test.js, receipt_final_test.js).
// `opts.live` says the capture is mid-round (thru 10); `opts.heldHoles` names
// the holes the Not-final line carries (default [7, 12, 16]; [7] thru 10);
// `opts.gapLine: false` for a surface that has no head (the live-results
// build carries its own, see 4). Throws when a substitution it must make finds
// nothing, so an inert transform cannot pass for a proof.
function kpNeverRefunds(t, opts) {
    const o = opts || {};
    const held = o.heldHoles || (o.live ? [7] : [7, 12, 16]);
    const phrase = 'KP on ' + (held.length === 1 ? 'hole ' : 'holes ') + held.join(', ') + ' not recorded';
    let out = t;
    const lineRe = o.live ? /\|Hole (7|12|16): not recorded yet\|\$10 in the pot(?=\|)/g
                          : /\|Hole (7|12|16): nobody recorded it\|\$10 back to the field(?=\|)/g;
    if (o.kpLines !== false) {
        if (!lineRe.test(out)) throw new Error('kpNeverRefunds: no KP lines to hold');
        out = out.replace(lineRe, (m, h) => '|Hole ' + h + ': not recorded|$10 in the pot');
    }
    if (!o.live) {
        const m = out.match(/\|↩️ Refunded to the field \(Unclaimed KP money refunded to the field\.( [^)]*)?\)\|\$(\d+) ÷ 23\|/);
        if (!m) throw new Error('kpNeverRefunds: no KP refund row to remove');
        const rest = (m[1] || '').trim();
        out = out.replace(m[0], rest ? '|↩️ Refunded to the field (' + rest + ')|$' + (Number(m[2]) - 30) + ' ÷ 23|' : '|');
    }
    if (o.gapLine !== false) {
        if (out.indexOf('| |') !== 0) throw new Error('kpNeverRefunds: the capture does not open with the head cell');
        out = '|Not final — ' + phrase + out;   // '|Not final — …| |🏆 Weekly Game …'
    }
    if (o.liveHead) {
        const a = '|🏆 LIVE RESULTS — THRU 18|The round is still in play. Final money appears once every card is in.|';
        if (out.indexOf(a) < 0) throw new Error('kpNeverRefunds: no finished live head to replace');
        out = out.replace(a, '|🏆 RESULTS — NOT FINAL|Every card is in. A KP is not recorded — its share stays in the pot, and final money appears once the winner is recorded.|');
    }
    return out;
}
module.exports = { kpNeverRefunds };
