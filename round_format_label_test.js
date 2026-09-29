// ============================================================================
// THE HEADER AND THE PLAYING WITH CARD GIVE ONE ANSWER (Wave 27b)
//
// THE DISAGREEMENT, found in the Wave 28 recon on Manny's round GFLBAM: the header
// read "Single Round • STROKE (NET)" while the Playing With card three lines below it
// read "SCORING Match Play · Net". Both were describing the same round.
//
// THEY WERE ANSWERING DIFFERENT QUESTIONS FROM DIFFERENT SOURCES. The header printed
// the STORED gameFormat and scoringType straight off the record. The card deliberately
// relabels: a stroke round carrying a Nassau side match is scored hole-by-hole as
// match play, whatever the stored key says, and its own comment explains that telling
// the golfer "Stroke Play" described the storage rather than the game.
//
// AND THE HEADER'S "(NET)" WAS A DEFAULT, NOT A READING - which is the sharper half.
// scoringType only consults a wager when gameFormat === 'nassau'. On a STROKE round
// with a GROSS Nassau side match the format is 'stroke', so scoringType stayed at its
// "net" default and the header printed NET while the card correctly printed Gross.
// That is the case pinned below, because it is the one where the two surfaces
// disagreed about the MONEY-BEARING word rather than just the format name.
//
// ONE BUILDER: roundScoringBasis() in index.html. Both surfaces ask it; each formats
// the answer its own way - the header uppercase in parentheses, the card with a middot
// and only when the answer came from a wager. Only the formatting differs now.
//
// DISPLAY ONLY, AND ASSERTED AS SUCH. scoringType and window.__scScoringType are
// UNTOUCHED - they are the main format's gross/net setting, which
// round_scoring_parity_test.js holds every surface to, and which is a different
// question from "what is this group playing". No engine reads either label; the money
// reads the stored gameFormat and the wagers exactly as before.
//
// THE BASELINE, MEASURED against this branch before the change (index.html as it stood
// at 7f87a76), all 5 tests:  1 PASS / 4 FAIL.
// The single green is the fixture check - both surfaces rendered. Everything else is
// red, INCLUDING the engine-cleanliness case, which fails on the missing
// roundScoringBasis rather than passing vacuously, and the plain-stroke case, because
// the header said STROKE PLAY only after this change (it said STROKE before).
//
// I FIRST WROTE "2 PASS / 3 FAIL" HERE FROM A GUESS, before measuring. Wrong on both
// numbers. That is the CLAUDE.md count rule's exact subject and the second time in two
// waves; the figures above are the ones the run printed.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const PL = ['Ann', 'Ben', 'Cal', 'Dee'].map((n, i) => ({ id: 101 + i, name: n, hcp: '0', playingForMoney: true }));
const sm = o => Object.assign({ id: 'sm1', pressRule: 'none', createdAt: 1, teamAIds: [101], teamBIds: [102] }, o);

function round(extra) {
    return Object.assign({ eventName: 'Single Round', courseName: 'Test', players: PL,
        courseData: CD, gameFormat: 'stroke', scores: {}, settlementMode: 'whole-dollar' }, extra || {});
}
// A STROKE round with a GROSS Nassau: the case where the two surfaces disagreed about
// gross-vs-net, not merely about the format's name.
const GROSS_NASSAU = round({ sideMatches: { sm1: sm({ format: 'nassau', scoring: 'gross', stake: 20 }) } });
const NET_NASSAU = round({ sideMatches: { sm1: sm({ format: 'nassau', scoring: 'net', stake: 20 }) } });
const PLAIN = round({});

const LOOK = `(function () {
  var t = function (id) { var e = document.getElementById(id);
    return e ? (e.textContent || '').replace(/\\s+/g, ' ').trim() : 'no ' + id; };
  return JSON.stringify({
    header: t('format-subtitle'),
    card: t('landing-scoring'),
    scoringType: String(window.__scScoringType || '')
  });
})()`;

async function look(data) {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=FMT'),
        db: { events: { FMT: data }, global_courses: {}, trips: {}, tournaments: {} },
        settleMs: 3000, viewport: { width: 390, height: 844 }, steps: [{ expression: LOOK }] });
    return r.ok ? JSON.parse((r.value || []).filter(v => typeof v === 'string' && v.startsWith('{')).pop())
                : { error: r.reason };
}

const S = {};
before(async () => {
    S.gross = await look(GROSS_NASSAU);
    S.net = await look(NET_NASSAU);
    S.plain = await look(PLAIN);
});

describe('ONE ANSWER ON BOTH SURFACES', () => {
    test('the fixtures rendered both surfaces', () => {
        Object.keys(S).forEach(k => {
            assert.ok(S[k] && !S[k].error, k + ': ' + (S[k] && S[k].error));
            assert.ok(!/^no /.test(S[k].header), k + ': the header did not render');
            assert.ok(!/^no /.test(S[k].card), k + ': the Playing With card did not render');
        });
    });

    test('A GROSS NASSAU on a stroke round: both say Match Play and both say GROSS', () => {
        // The reported shape, with the scoring flipped to the case that used to
        // disagree about the word that decides who pays.
        const v = S.gross;
        assert.match(v.card, /^Match Play · Gross$/, 'the card changed: ' + v.card);
        assert.match(v.header, /MATCH PLAY \(GROSS\)/,
            'the header still prints the stored format and a default scoring: ' + v.header);
        assert.ok(!/STROKE/.test(v.header), 'the header still says STROKE: ' + v.header);
        assert.ok(!/\(NET\)/.test(v.header), 'the header still says NET on a GROSS wager: ' + v.header);
    });

    test('A NET NASSAU: both say Match Play and both say Net', () => {
        const v = S.net;
        assert.match(v.card, /^Match Play · Net$/);
        assert.match(v.header, /MATCH PLAY \(NET\)/, 'the header disagrees: ' + v.header);
    });

    test('A PLAIN STROKE ROUND is unchanged - the card still names the format alone', () => {
        // No wager, so nothing is relabelled and the card keeps its old output exactly:
        // the format's name and no scoring word.
        const v = S.plain;
        assert.equal(v.card, 'Stroke Play', 'the card gained or lost something: ' + v.card);
        assert.match(v.header, /STROKE PLAY \(NET\)/, 'the header is wrong on a plain round: ' + v.header);
        assert.match(v.header, /^Single Round • /, 'the round name left the header');
    });

    test('scoringType is UNTOUCHED, and no engine reads either label', () => {
        // The parity guard's value is the MAIN format's setting. On a stroke round it
        // is "net" whatever a side match says - that is correct and must not move,
        // because it is a different question from what the group is playing.
        assert.equal(S.gross.scoringType, 'net',
            'the wager leaked into the parity value: ' + S.gross.scoringType);
        ['pool-engine.js', 'money-engine.js', 'settlement-engine.js', 'action-model.js'].forEach(f => {
            const src = read(f);
            assert.ok(!/landing-scoring|format-subtitle|roundScoringBasis/.test(src),
                f + ' now reads a display label');
        });
        const IDX = read('index.html');
        assert.match(IDX, /function roundScoringBasis\(/, 'the one builder is gone');
        const basis = IDX.slice(IDX.indexOf('function roundScoringBasis('),
                                IDX.indexOf('\n    }', IDX.indexOf('function roundScoringBasis(')));
        assert.ok(!/db\.ref|\.update\(|\.set\(/.test(basis), 'the label builder writes to the round');
    });
});
