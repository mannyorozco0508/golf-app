// ============================================================================
// UI FINISHING BATCH
//
// FOUR THINGS, ALL PRESENTATION.
//
// 1. --text-secondary was REFERENCED BUT NEVER DEFINED. Every "readable net" row
//    added earlier silently ran on its hard-coded #4a5568 fallback, which meant
//    those rows ignored dark mode entirely. Defined now in both palettes.
//
// 2. DARK MODE REACHED PAPER. The theme is a class on <html> and survived into
//    print; the block forced a white background but never reset the text colours.
//    A golfer printing in dark mode got --text-main #e8ecec - near-white ink on
//    white paper - and nothing warned them before they shared the PDF.
//
// 3. PRINT WAS AT THE BOTTOM. printReceipt()/window.print() already existed, but
//    every button sat past the entire document. One at the top, same function.
//
// 4. LIVE SKINS ON THE LEADERBOARD. Who won which hole - never how much. Until
//    the round ends the number of winning skins can still change, so any dollar
//    figure shown now is a guess that gets contradicted later. Results answers
//    "how much"; this answers "who", which is what people ask on the course.
//
// NO NEW RESOLVER. computeSkinsHoleLedger() in settlement-engine.js is the same
// canonical helper the scorecard uses - it decides low scores, ties, carries and
// crucially whether a hole is OFFICIAL. leaderboard.html reads its rows and
// writes sentences.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const LB_DEPS = ['money-engine.js','action-model.js','settlement-engine.js'];
const ST_DEPS = ['money-engine.js','action-model.js','pool-engine.js','settlement-engine.js','score-marks.js'];

// Brace-matched, so a nested rule cannot truncate the capture.
function printBlock(src) {
    const at = src.indexOf('@media print');
    if (at === -1) return '';
    let depth = 0;
    for (let j = src.indexOf('{', at); j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(at, j + 1); }
    }
    return src.slice(at);
}

const NAMES = ['Marty','Scott','Carp','Randy','Manny','Matt B','Lance','Kopp',
               'Marcus','Rocco','Matt H','Jeremy'];

// thru = holes posted by [group1, group2, group3]. tweak lets a test bend scores.
function board({ thru = [6,5,4], skins = true, tweak = null, scoring = 'net' } = {}) {
    const sb = loadHtmlInlineScript('leaderboard.html', LB_DEPS);
    const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
    const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:'0' }));
    const sc = {};
    ps.forEach((p,pi)=>{
        const g = Math.floor(pi/4);
        cd.forEach(h => { if (h.hole <= thru[g]) sc['p'+p.id+'_h'+h.hole] = 4; });
    });
    sc['p103_h1'] = 3;                       // Carp takes hole 1
    sc['p102_h2'] = 3;                       // Scott takes hole 2
    sc['p103_h3'] = 3; sc['p101_h3'] = 3;    // hole 3 ties
    if (tweak) tweak(sc);
    const d = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
                skinsCarryOver:false };
    if (skins) { d.skinsBuyIn = 5; d.additionalGames = { skins: true }; }
    vm.runInContext(`
        currentBoardData = ${JSON.stringify(d)};
        activeView = 'individual'; groupViewMode = 'flat'; activeScoring = '${scoring}';
        renderBoard();
    `, sb);
    return {
        sb, run: c => vm.runInContext(c, sb),
        skins: () => sb.document.getElementById('live-skins-mount').innerHTML,
        text:  () => strip(sb.document.getElementById('live-skins-mount').innerHTML),
        stand: () => sb.document.getElementById('board-content').innerHTML,
    };
}

// ============================================================================

describe('THE MISSING THEME VARIABLE', () => {

    ['settlement.html','leaderboard.html','trip.html'].forEach(f => {
        test(`${f} defines --text-secondary in BOTH palettes`, () => {
            const src = read(f);
            assert.ok(/--text-secondary:\s*#[0-9a-f]{6}/i.test(src), 'light palette');
            const dark = src.slice(src.indexOf('html.dark-mode'));
            assert.ok(/--text-secondary:\s*#[0-9a-f]{6}/i.test(dark),
                'dark palette - without this the row ignores the theme entirely');
        });

        test(`${f} no longer depends on the hard-coded fallback`, () => {
            const src = read(f);
            const light = /--text-secondary:\s*(#[0-9a-f]{6})/i.exec(src)[1].toLowerCase();
            const dark = /--text-secondary:\s*(#[0-9a-f]{6})/i.exec(src.slice(src.indexOf('html.dark-mode')))[1].toLowerCase();
            assert.notEqual(light, dark, 'the two themes must differ or nothing was gained');
        });
    });

    test('the dark value is genuinely light, for a dark background', () => {
        const src = read('settlement.html');
        const dark = /--text-secondary:\s*#([0-9a-f]{6})/i.exec(src.slice(src.indexOf('html.dark-mode')))[1];
        const lum = parseInt(dark.slice(0,2),16) + parseInt(dark.slice(2,4),16) + parseInt(dark.slice(4,6),16);
        assert.ok(lum > 380, 'dark-mode secondary text must be legible on a dark card');
    });
});

describe('DARK MODE MUST NOT REACH PAPER', () => {

    const PB = () => printBlock(read('settlement.html'));

    test('the print block resets the dark theme', () => {
        assert.match(PB(), /html\.dark-mode/,
            'the theme is a class on <html> and survives into print unless reset');
    });

    test('it restores readable ink', () => {
        const b = PB();
        assert.match(b, /--text-main:\s*#1a1a1a/);
        assert.match(b, /--text-secondary:\s*#4a5568/);
        assert.match(b, /color:\s*#1a1a1a\s*!important/);
    });

    test('and a white page under it', () => {
        assert.match(PB(), /background:\s*#fff\s*!important/);
    });

    test('EXISTING PRINT PROTECTIONS SURVIVE', () => {
        const b = PB();
        assert.match(b, /\.top-nav-bar, \.btn-primary/, 'nav and buttons still hidden');
        assert.match(b, /\.settle-card \{ break-inside: avoid/);
        assert.match(b, /\.receipt-match \{ break-inside: avoid/);
        assert.match(b, /mark-birdie/, 'the rings still print');
        assert.match(b, /print-color-adjust: exact/);
    });

    test('one golfer\u2019s payout block will not split across pages', () => {
        assert.match(PB(), /\.pl-block \{ break-inside: avoid/);
    });

    test('the +/- money colours survive PDF export', () => {
        const b = PB();
        const at = b.indexOf('.val-pos');
        assert.notEqual(at, -1, 'the money colours must be listed');
        assert.match(b.slice(at, at + 200), /print-color-adjust: exact/);
    });
});

describe('PRINT / SAVE PDF IS FINDABLE', () => {

    test('there is an action at the TOP of the Receipt', () => {
        // Checked in the RENDERED document. Source order is meaningless here: the
        // words "Final Results" appear in comments long before the button's markup.
        const sb = loadHtmlInlineScript('settlement.html', ST_DEPS);
        const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
        const ps = NAMES.slice(0,4).map((n,i)=>({ id:101+i, name:n, hcp:'9', playingForMoney:true }));
        const sc = {};
        ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = 4 + ((pi+hi)%3) - 1; }));
        vm.runInContext(`currentMode='A'; currentData=${JSON.stringify({
            players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
            settlementMode:'whole-dollar',
            sideMatches:{ m1:{ format:'match', scoring:'net', stake:50, startHole:1,
                               createdAt:1, teamAIds:['101'], teamBIds:['103'] } } })};
            renderCombinedSummary(currentData, currentData.courseData, currentData.scores);`, sb);
        const html = sb.document.getElementById('combined-settlement-summary').innerHTML;
        const btn = html.indexOf('Print / Save PDF');
        const results = html.indexOf('Final Results');
        assert.notEqual(btn, -1, 'the action must render');
        assert.ok(btn < results, 'it must come before the document, not after it');
    });

    test('it uses the system print flow, not a second PDF renderer', () => {
        const src = read('settlement.html');
        assert.match(src, /onclick="printReceipt\(\)"/);
        // The function names the PDF before printing, so window.print() sits further
        // down than a 400-character window reached.
        const at = src.indexOf('function printReceipt');
        assert.match(src.slice(at, at + 900), /window\.print\(\)/);
    });

    test('the button is hidden in the printed output', () => {
        assert.match(printBlock(read('settlement.html')), /\.btn-primary/,
            'a print button inside the PDF is a bug');
    });

    test('printing consumes the same canonical Receipt DOM', () => {
        // No separate print-only rendering path exists to drift from the screen.
        const src = read('settlement.html');
        assert.ok(!/buildPrintOnly|renderForPrint|printDom/.test(src),
            'there must be one document, not two');
    });
});

describe('LIVE SKINS — WHO WON WHAT HOLE', () => {

    test('the section renders when a skins game is on', () => {
        assert.match(board().text(), /LIVE SKINS/);
    });

    test('it stays away when there is no skins game', () => {
        assert.equal(board({ skins:false }).skins(), '',
            'a round with no skins money must not grow a skins card');
    });

    test('a won hole names the golfer, the hole and the score', () => {
        assert.match(board().text(), /Hole 1 — Carp · Net 3/);
        assert.match(board().text(), /Hole 2 — Scott · Net 3/);
    });

    test('FULL hole names, never H1', () => {
        const t = board().text();
        assert.match(t, /Hole 1 /);
        assert.ok(!/\bH1\b|\bH14\b/.test(t), 'this is read beside a paper card');
    });

    test('a tie says No Skin and names the score', () => {
        assert.match(board().text(), /Hole 3 — No Skin · Tie at Net 3/);
    });

    test('a waiting hole names who it is waiting for', () => {
        assert.match(board().text(), /Hole 5 — Waiting for Group 3/);
    });

    test('a summary counts the skins won', () => {
        assert.match(board().text(), /Scott 1 · Carp 1/);
    });

    test('NO DOLLAR VALUE APPEARS ANYWHERE', () => {
        const html = board().skins();
        assert.ok(!/\$/.test(html),
            'the number of winning skins can still change, so any figure now is a guess');
        assert.ok(!/pot|value|payout|worth/i.test(strip(html)));
    });
});

describe('THE OFFICIAL-HOLE RULE IS CANONICAL', () => {

    test('a hole only two groups have posted is NOT awarded', () => {
        const t = board({ thru:[6,5,4] }).text();
        assert.match(t, /Hole 5 — Waiting/);
        assert.ok(!/Hole 5 — \w+ · Net/.test(t), 'partial holes must not resolve');
    });

    test('the last group posting resolves it immediately', () => {
        const before = board({ thru:[6,5,4] }).text();
        const after = board({ thru:[6,5,5], tweak: sc => { sc['p109_h5'] = 3; } }).text();
        assert.match(before, /Hole 5 — Waiting for Group 3/);
        assert.match(after, /Hole 5 — Marcus · Net 3/);
    });

    test('earlier holes are untouched when a later one resolves', () => {
        const after = board({ thru:[6,5,5], tweak: sc => { sc['p109_h5'] = 3; } }).text();
        assert.match(after, /Hole 1 — Carp · Net 3/);
        assert.match(after, /Hole 3 — No Skin · Tie at Net 3/);
    });

    test('only the FIRST waiting hole is listed', () => {
        // Fourteen identical "Waiting for Groups 1, 2, 3" rows would push the real
        // results off a phone screen.
        const t = board({ thru:[6,5,4] }).text();
        assert.equal((t.match(/Waiting for/g) || []).length, 1);
    });

    test('but every RESOLVED hole is always shown', () => {
        const t = board({ thru:[6,5,4] }).text();
        [1,2,3,4].forEach(h => assert.match(t, new RegExp('Hole ' + h + ' —')));
    });
});

describe('SCORE CORRECTIONS LEAVE NO STALE WINNER', () => {

    test('winner becomes a tie', () => {
        const won = board().text();
        assert.match(won, /Hole 1 — Carp · Net 3/);
        const tied = board({ tweak: sc => { sc['p101_h1'] = 3; } }).text();
        assert.match(tied, /Hole 1 — No Skin · Tie at Net 3/);
        assert.ok(!/Hole 1 — Carp · Net 3/.test(tied), 'the old winner must be gone');
    });

    test('tie becomes a winner', () => {
        const tied = board().text();
        assert.match(tied, /Hole 3 — No Skin/);
        const won = board({ tweak: sc => { sc['p101_h3'] = 4; } }).text();
        assert.match(won, /Hole 3 — Carp · Net 3/);
        assert.ok(!/Hole 3 — No Skin/.test(won));
    });

    test('winner A becomes winner B', () => {
        const a = board().text();
        assert.match(a, /Hole 2 — Scott · Net 3/);
        const b = board({ tweak: sc => { sc['p102_h2'] = 4; sc['p104_h2'] = 2; } }).text();
        assert.match(b, /Hole 2 — Randy · Net 2/);
        assert.ok(!/Hole 2 — Scott/.test(b), 'no stale winner may survive');
    });

    test('the summary follows the correction too', () => {
        const b = board({ tweak: sc => { sc['p102_h2'] = 4; sc['p104_h2'] = 2; } }).text();
        assert.match(b, /Randy 1/);
        assert.ok(!/Scott 1/.test(b));
    });
});

describe('SKINS BASIS IS INDEPENDENT OF THE RANKING TOGGLE', () => {

    test('the ranking toggle does not change the skins basis', () => {
        const net = board({ scoring:'net' }).text();
        const gross = board({ scoring:'gross' }).text();
        const basisOf = t => (/· (Net|Gross) \d/.exec(t) || [])[1];
        assert.equal(basisOf(net), basisOf(gross),
            'ranking is about standings; skins basis comes from the skins game');
    });

    test('the standings still render alongside', () => {
        const b = board();
        assert.match(b.stand(), /score-gross/, 'the Gross+Net Score cell must survive');
        assert.match(b.stand(), /score-net/);
    });

    test('the renderer reads the basis from the ledger, not the toggle', () => {
        const src = read('leaderboard.html');
        const at = src.indexOf('function renderLiveSkinsBoard');
        const fn = src.slice(at, src.indexOf('\n    function ', at + 10));
        assert.match(fn, /bundle\.net \? 'Net' : 'Gross'/);
        assert.ok(!/activeScoring/.test(fn), 'the ranking toggle must not leak in here');
    });
});

describe('NO SECOND RESOLVER, NO DUPLICATE MATHS', () => {

    const fn = () => {
        const src = read('leaderboard.html');
        const at = src.indexOf('function renderLiveSkinsBoard');
        return src.slice(at, src.indexOf('\n    function ', at + 10));
    };

    test('it consumes the canonical ledger', () => {
        assert.match(fn(), /computeSkinsHoleLedger\(data, courseData, savedScores/);
    });

    test('it resolves nothing itself', () => {
        const f = fn();
        // .sort() is deliberately allowed: ordering the summary chips by skin count
        // is presentation. What must not appear is anything that DECIDES a skin.
        ['getStrokes(','parseHcp(','Math.min(','carryOver ?','officialThru =','.low =']
            .forEach(t => assert.ok(!f.includes(t), `the presenter must not resolve skins; found ${t}`));
        assert.match(f, /r\.state === 'tie'/, 'it reads the ledger\u2019s verdict');
        assert.match(f, /r\.official/, 'including whether the hole is official');
    });

    test('leaderboard.html no longer carries duplicate handicap helpers', () => {
        const src = read('leaderboard.html');
        const inline = src.replace(/<script src=[^>]*><\/script>/g, '');
        assert.ok(!/function parseHcp\s*\(/.test(inline));
        assert.ok(!/function getStrokes\s*\(/.test(inline));
    });

    test('and declares the engines it now depends on', () => {
        const src = read('leaderboard.html');
        ['money-engine.js','action-model.js','settlement-engine.js']
            .forEach(f => assert.match(src, new RegExp('<script src="' + f + '"'),
                `leaderboard.html must ship with ${f}`));
    });

    test('the standings still allocate strokes canonically', () => {
        const src = read('leaderboard.html');
        // Three sites exist, all pre-existing, and they name the hole variable either
        // `h` or `hole`. What matters is the SHAPE: index plus parsed handicap, never
        // a hand-rolled variant.
        const calls = src.match(/getStrokes\([^)]*\)/g) || [];
        assert.ok(calls.length > 0);
        calls.forEach(c => assert.match(c, /^getStrokes\((h|hole)\.hcpIndex, parseHcp\(p\.hcp\)$/,
            'an allocation site deviating from the canonical shape: ' + c));
    });
});

describe('THE WHO PAYS WHO RULE STILL HOLDS', () => {

    function receipt({ pool = true, side = false } = {}) {
        const sb = loadHtmlInlineScript('settlement.html', ST_DEPS);
        const cd = Array.from({length:18},(_,i)=>({hole:i+1,par:4,hcpIndex:i+1}));
        const ps = NAMES.map((n,i)=>({ id:101+i, name:n, hcp:'9', playingForMoney:true }));
        const sc = {};
        ps.forEach((p,pi)=>cd.forEach((h,hi)=>{ sc['p'+p.id+'_h'+h.hole] = 4 + ((pi+hi)%3) - 1; }));
        const d = { players: ps, courseData: cd, scores: sc, gameFormat:'stroke',
                    settlementMode:'whole-dollar' };
        if (pool) {
            d.moneyPool = { enabled:true, buyIn:40, kp:{ amount:100, holes:[3,7,12,16] },
                net:{ amount:70, places:[57.142857,42.857143] },
                skins:{ mode:'remainder', scoring:'net', carryOver:false } };
            d.kpWinners = { h3:'101', h7:'105', h12:'109', h16:'102' };
            d.kpConfirmed = { confirmed: true };
        }
        if (side) d.sideMatches = { m1:{ format:'match', scoring:'net', stake:50,
            startHole:1, createdAt:1, teamAIds:['101'], teamBIds:['103'] } };
        vm.runInContext(`currentMode='A'; currentData=${JSON.stringify(d)};
            renderCombinedSummary(currentData, currentData.courseData, currentData.scores);`, sb);
        return strip(sb.document.getElementById('combined-settlement-summary').innerHTML);
    }

    test('pool only still suppresses Who Pays Who', () => {
        assert.ok(!/Who Pays Who/.test(receipt({ pool:true, side:false })));
    });

    test('pool plus a side match still shows it', () => {
        assert.match(receipt({ pool:true, side:true }), /Who Pays Who/);
    });

    test('and no buy-in wording returned to the printable Receipt', () => {
        assert.ok(!/buy-in/i.test(receipt({ pool:true, side:false })));
        assert.ok(!/\(\d+ × \$\d+\)/.test(receipt({ pool:true, side:false })));
    });
});
