// ============================================================================
// RESULTS WINNER LINE - A $0 2v2 MATCH NAMES THE SIDE THAT WON (Manny typed "OK fix results
// winner line", Nov 11 2026).
//
// THE DEFECT. The match engine names a team "Sam/Josh" (settlement-engine.js calc.t1Name, no
// spaces) and the receipt names the same team "Sam / Josh" (nameA, spaces). text-safe.js's
// sideMatchResultTally compared the two exactly, never matched, and credited SIDE B with every
// game side A won - so a stake-free 2v2 Best Ball read "Original Game · Sam/Josh 6&5" and then
// "Match · Bob / Paul · took 1 of 1 game". Display only: the line is used only on a $0 match,
// and the engine's own toSideA was always right. settlement-engine.js is NOT touched.
//
// THE FIX (text-safe.js only): compare names with spaces removed; a winner that matches neither
// side falls back to the engine's own toSideA.
//
// PURE HALF: the receipts are shaped exactly like the engine's (winner spelled "Sam/Josh",
// nameA "Sam / Josh"). CHROME HALF: the Results page (settlement.html) a golfer opens, cold
// arrival, nothing called - a $0 2v2 match Sam/Josh v Bob/Paul that Sam/Josh win.
//
// Negative controls: text-safe.js put back to release-206 c5bb7dc6 (copy + sha restore). See the
// RESULT line for counts.
// RESULT (2026-11-11): 7 tests, 7 pass / 0 fail on fix-206-winner (base release-206 c5bb7dc6) and on
//   web-winner (base origin/main 8d04e213). Old text-safe.js put back, either base: 7 tests, 3 pass /
//   4 fail (A wins, B wins [its spaced-name case], mixed Nassau, the Results page). Halved, 1v1 and
//   priced are unchanged by design and pass on both. The Results page reads either layout: the 2.0.6
//   card ("Match" / "Sam / Josh" / "took 1 of 1 game") or the web's one line ("MATCH NET · ...").
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const here = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

function load() {
    const ctx = vm.createContext({ console });
    vm.runInContext(here('side-match-lines.js') + '\n' + here('text-safe.js')
        + '\n;this.__x = { net: (r, o) => hpZeroStakeNetLine(r, sideMatchNetLine(r, o), o), raw: (r, o) => sideMatchNetLine(r, o) };', ctx);
    return ctx.__x;
}
const X = load();
const DONE = { complete: true };
const seg = (o) => Object.assign({ baseId: '18', pressNum: 0, startHole: 1, endHole: 18, label: 'Original' }, o);
// What the engine writes: winner from calc.t1Name ("Sam/Josh"), side names with spaces.
const team = (segments) => ({ nameA: 'Sam / Josh', nameB: 'Bob / Paul', format: 'Match Play', isTeam: true, segments });

test('A wins a $0 2v2 match: the line names Sam / Josh', () => {
    const line = X.net(team([seg({ stake: 0, money: 0, result: 'Sam/Josh 6&5', winner: 'Sam/Josh', toSideA: true })]), DONE);
    assert.match(line, /^Sam \/ Josh — took 1 of 1 game$/);
    assert.doesNotMatch(line, /Bob \/ Paul/);
});

test('B wins a $0 2v2 match: the line names Bob / Paul', () => {
    const line = X.net(team([seg({ stake: 0, money: 0, result: 'Bob/Paul 2&1', winner: 'Bob/Paul', toSideA: false })]), DONE);
    assert.match(line, /^Bob \/ Paul — took 1 of 1 game$/);
    // spelled with spaces on both sides too (the Nassau path) - still B
    const sp = X.net(team([seg({ stake: 0, money: 0, result: 'Bob / Paul 2 up', winner: 'Bob / Paul', toSideA: false })]), DONE);
    assert.match(sp, /^Bob \/ Paul — took 1 of 1 game$/);
    // a winner that matches neither spelling falls back to the engine's toSideA
    const odd = X.net(team([seg({ stake: 0, money: 0, result: 'x', winner: 'Somebody', toSideA: true })]), DONE);
    assert.match(odd, /^Sam \/ Josh — took 1 of 1 game$/);
});

test('halved $0 2v2 match: all square, nobody credited', () => {
    const line = X.net(team([seg({ stake: 0, money: 0, result: 'All square', winner: null, toSideA: false })]), DONE);
    assert.equal(line, 'All square — every game halved');
});

test('mixed $0 Nassau: A front, B back, A overall -> Sam / Josh took 2 of 3, Bob / Paul 1', () => {
    const r = team([
        seg({ baseId: 'F9', endHole: 9, label: 'Front 9', stake: 0, money: 0, result: 'Sam/Josh 2 up', winner: 'Sam/Josh', toSideA: true }),
        seg({ baseId: 'B9', startHole: 10, label: 'Back 9', stake: 0, money: 0, result: 'Bob/Paul 1 up', winner: 'Bob/Paul', toSideA: false }),
        seg({ baseId: '18', label: 'Total', stake: 0, money: 0, result: 'Sam/Josh 3&2', winner: 'Sam/Josh', toSideA: true })]);
    r.format = 'Nassau';
    assert.equal(X.net(r, DONE), 'Sam / Josh — took 2 of 3 games, Bob / Paul 1');
});

test('1v1 $0 match: unchanged ("Sam — took 1 of 1 game")', () => {
    const r = { nameA: 'Sam', nameB: 'Bob', format: 'Match Play', segments: [seg({ stake: 0, money: 0, result: 'Sam 3&2', winner: 'Sam', toSideA: true })] };
    assert.equal(X.net(r, DONE), 'Sam — took 1 of 1 game');
});

test('priced 2v2 match: the line is exactly what side-match-lines.js wrote (untouched)', () => {
    const r = team([seg({ stake: 10, money: 10, result: 'Sam/Josh 6&5', winner: 'Sam/Josh', toSideA: true })]);
    const raw = X.raw(r, DONE);
    assert.ok(/\$10/.test(raw), 'positive: the priced line carries its money');
    assert.equal(X.net(r, DONE), raw);
});

// ---------------------------------------------------------------- CHROME HALF
const HAS_CHROME = fs.existsSync(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
test('the Results page a golfer opens names Sam / Josh as the winner of the $0 2v2 match', { skip: !HAS_CHROME && 'no Chrome' }, async () => {
    const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
    const PAR = [5, 4, 4, 3, 4, 4, 4, 3, 5, 5, 3, 4, 4, 4, 5, 4, 3, 4];
    const HCP = [15, 17, 3, 13, 11, 1, 7, 9, 5, 18, 12, 16, 10, 8, 14, 4, 6, 2];
    const scores = {};
    // Sam/Josh: par, birdie on odd holes. Bob/Paul: bogey everywhere. Same handicaps.
    PAR.forEach((p, i) => {
        scores['p101_h' + (i + 1)] = i % 2 ? p : p - 1; scores['p102_h' + (i + 1)] = p;
        scores['p103_h' + (i + 1)] = p + 1; scores['p104_h' + (i + 1)] = p + 1;
    });
    const CODE = 'WLFIX1';
    const ev = { eventName: 'Saturday Round', courseName: 'Papago Golf Club', activeCourseKey: 'az_papago', gameFormat: 'stroke', settlementMode: 'whole-dollar',
        teeRating: { teeKey: 'male:4', teeName: 'Men · White', slope: 120, courseRating: 70.1, par: 72, allowance: 100 },
        courseData: PAR.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: HCP[i] })), scores,
        players: [['101', 'Sam Ortiz'], ['102', 'Josh Reed'], ['103', 'Bob Hale'], ['104', 'Paul Kim']]
            .map(([id, name]) => ({ id: Number(id), name, hcp: '10', team: 'Team 1', playingForMoney: true })),
        sideMatches: { '-WLbb': { format: 'match', scoring: 'net', stake: 0, pressRule: 'none', startHole: 1, createdAt: 1792000000000, teamAIds: ['101', '102'], teamBIds: ['103', '104'] } } };
    const db = { events: { [CODE]: ev }, global_courses: { az_papago: { name: 'Papago Golf Club', location: { city: 'Phoenix', state: 'AZ' } } } };
    const shot = process.env.WL_SHOT;
    const steps = [{ sleep: 3500 }, { expression: '(document.body.innerText || "")' }];
    if (shot) steps.push({ expression: '(() => { const el = Array.from(document.querySelectorAll("div,section")).reverse().find((e) => /took \\d+ of \\d+ game/.test(e.innerText || "") && (e.innerText || "").length < 600); if (el) el.scrollIntoView({ block: "center" }); return !!el; })()' }, { sleep: 400 }, { shot, viewportOnly: true });
    const res = await arriveCold({ url: fileUrl('settlement.html', 'game=' + CODE + '&me=101'), db, viewport: { width: 393, height: 852 }, steps, settleMs: 1500,
        preScript: 'window.__simpleFlow = true; try { localStorage.setItem("hardpan_simple_flow", "on"); localStorage.setItem("golfapp_me_' + CODE + '", "101"); } catch (e) {}' });
    assert.ok(res.ok, 'settlement.html: ' + res.reason);
    const text = res.value.find((v) => typeof v === 'string' && v.length > 200) || '';
    const lines = text.split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    assert.ok(lines.some((l) => /Sam\/Josh \d+&\d+|Sam\/Josh \d+ up/.test(l)), 'positive: the match result shows Sam/Josh won\n' + lines.join('\n'));
    // The card writes the match line as "Match" | answer | why, which innerText puts on three
    // lines ("Match" / "Sam / Josh" / "took 1 of 1 game") - read the answer with its why.
    // (The web build without the GPS card writes it on one line: "MATCH NET · Sam / Josh — took 1 of 1 game".)
    const took = lines.map((l, i) => /^took \d+ of \d+ game/.test(l) ? (lines[i - 2] + ' · ' + lines[i - 1] + ' · ' + l)
        : (/took \d+ of \d+ game/.test(l) ? l : null)).filter(Boolean);
    assert.ok(took.length > 0, 'positive: the winner line is on the page\n' + lines.join('\n'));
    took.forEach((l) => {
        assert.match(l, /Sam \/ Josh/, 'winner line names Sam / Josh: ' + l);
        assert.doesNotMatch(l, /Bob \/ Paul/, 'winner line does not name the losing side: ' + l);
    });
    assert.ok(!lines.some((l) => /\$/.test(l) && /Sam|Josh|Bob|Paul/.test(l)), 'no $ beside the $0 match');
});
