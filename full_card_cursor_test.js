// ============================================================================
// v194 — THE FULL CARD READS A CARD OFF, AND FOUR SMALL FIXES (2026-09-22)
//
// 1. FULL CARD CURSOR. The Full Card's rows are holes, so the advance walked
//    hole 1's four golfers first. Reading a paper card off ("Marty's eighteen")
//    wants the SAME golfer's next hole. fullCardEntryOrder(inputs) orders the
//    Full Card's boxes by (golfer in filteredPlayers order, hole in courseData
//    order); advanceToNextScoreInput uses it when the root is
//    #full-card-container. Same "1" rule, same synchronous identity focus,
//    disabled boxes already excluded, blur after the last. Hole View untouched.
//    mini-dom cannot focus a box drawn from innerHTML, so the ORDER is proven
//    here on the identities the page would see, and the keystrokes themselves in
//    Chrome (score_entry_advance_test.js, the Full Card case).
// 2. INITIALS. The page's own first-token cuts (a golfer named by id in the
//    ticker, the landing summary, Ryder pairings, the who-am-I buttons, the group
//    picker, the Group Links rows, Finish Round's missing rows, the Wolf pills)
//    go through golferLabel / golferLabelFor -> getSmartDisplayName against the
//    round's roster. The Full Card's column initials (getInitials) stay.
// 3. "NO BETS". isNoBetRound is false when the Weekly Game is on, and the
//    landing summary lists it.
// 4. THE STALE $0. admin.html calls mpRecalc() after the roster is rebuilt on
//    an edit, so the Weekly Game step opens on the real pot.
// 5. TRAILING DOTS. The roster paste strips trailing periods ("Anthony." ->
//    "Anthony"). Only trailing, only periods; stored names are never rewritten.
// ============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const run = (sb, e) => vm.runInContext(e, sb);
const J = v => JSON.parse(JSON.stringify(v));
const CD = makeCourseData(18);

// ---------------------------------------------------------------------------
// 1. THE ORDER. Fake boxes in the DOM order the Full Card draws (hole-major),
// with the identities the real boxes carry; the page's own function orders them.
function orderOf(sb, players, holes, disabledKeys) {
    sb.__P = players; sb.__H = holes; sb.__D = disabledKeys || [];
    return J(run(sb, `(function () {
        window.__scFilteredPlayers = __P; currentData = { players: __P, courseData: __H };
        var boxes = [];
        __H.forEach(function (h) { __P.forEach(function (p) { var k = p.id + '_' + h.hole; if (__D.indexOf(k) >= 0) return;
            boxes.push({ getAttribute: function (a) { return a === 'data-player-id' ? String(p.id) : String(h.hole); }, k: k }); }); });
        return fullCardEntryOrder(boxes).map(function (b) { return b.k; });
    })()`));
}
const seq = (ids, holes) => [].concat(...ids.map(id => holes.map(h => id + '_' + h)));

describe('1. THE FULL CARD WALKS GOLFER-MAJOR', () => {
    const sb = loadHtmlInlineScript('index.html', [], { search: '?game=FC1&group=1' });
    const P4 = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 0, 0, 0]);
    test('4 golfers, 18 holes: p1 h1 -> h18, then p2 h1 (CONTROL: the DOM order is hole-major and differs)', () => {
        const got = orderOf(sb, P4, CD);
        assert.deepEqual(got, seq(P4.map(p => p.id), CD.map(h => h.hole)));
        const dom = [].concat(...CD.map(h => P4.map(p => p.id + '_' + h.hole)));
        assert.notDeepEqual(got, dom, 'the walk is not DOM order');
        assert.equal(got[1], P4[0].id + '_2', "Ann's second box is her hole 2, not Ben's hole 1");
        assert.equal(got[18], P4[1].id + '_1');
    });
    test('a front 9 and a back 9: nine boxes per golfer, in courseData order', () => {
        assert.deepEqual(orderOf(sb, P4, CD.slice(0, 9)), seq(P4.map(p => p.id), [1, 2, 3, 4, 5, 6, 7, 8, 9]));
        assert.deepEqual(orderOf(sb, P4, CD.slice(9)), seq(P4.map(p => p.id), [10, 11, 12, 13, 14, 15, 16, 17, 18]));
    });
    test('a five-golfer group', () => {
        const P5 = makePlayers(['Ann', 'Ben', 'Cal', 'Dee', 'Eli'], [0, 0, 0, 0, 0]);
        const got = orderOf(sb, P5, CD);
        assert.equal(got.length, 90); assert.equal(got[17], P5[0].id + '_18'); assert.equal(got[18], P5[1].id + '_1'); assert.equal(got[89], P5[4].id + '_18');
    });
    test('courseData out of hole order is walked AS GIVEN (CONTROL: a sort by hole number would put 1 before 3)', () => {
        const odd = [CD[2], CD[0], CD[1], CD[3]];   // 3, 1, 2, 4
        assert.deepEqual(orderOf(sb, P4.slice(0, 2), odd), seq(P4.slice(0, 2).map(p => p.id), [3, 1, 2, 4]));
    });
    test('disabled boxes are simply absent from the walk (another group\'s golfers on the bare link)', () => {
        const got = orderOf(sb, P4, CD.slice(0, 3), [P4[1].id + '_2']);
        assert.deepEqual(got, [P4[0].id + '_1', P4[0].id + '_2', P4[0].id + '_3', P4[1].id + '_1', P4[1].id + '_3', P4[2].id + '_1', P4[2].id + '_2', P4[2].id + '_3', P4[3].id + '_1', P4[3].id + '_2', P4[3].id + '_3']);
    });
    test('the advance uses it only for the Full Card; Hole View keeps DOM order; the "1" rule and the identity focus are untouched (source)', () => {
        const src = read('index.html');
        const fn = src.slice(src.indexOf('function advanceToNextScoreInput('), src.indexOf('function fullCardEntryOrder('));
        assert.match(fn, /if \(root\.id === 'full-card-container'\) inputs = fullCardEntryOrder\(inputs\);/);
        assert.match(fn, /pendingScoreFocus = scoreBoxIdentity\(next\);/);
        assert.match(fn, /currentInputEl\.blur\(\);/);
        const rule = src.slice(src.indexOf('function handleScoreInput('), src.indexOf('function advanceToNextScoreInput('));
        assert.match(rule, /if \(val\.length >= 2\) \{\s*advanceToNextScoreInput\(inputEl\);\s*\} else if \(val !== '1'\) \{/);
        assert.doesNotMatch(src.slice(src.indexOf('function fullCardEntryOrder('), src.indexOf('// ---- Focus across a rebuild')), /setTimeout|Promise/);
    });
});

// ---------------------------------------------------------------------------
// 2. INITIALS. Two Randys and three Matts in a 12-golfer round, three groups.
const NAMES = ['Randy T', 'Randy C', 'Marty', 'Matt M', 'Matt B', 'Matt H', 'Ann', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay'];
const P12 = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: '9' }));
function round12(extra) {
    return Object.assign({ eventName: 'Names', courseName: 'Test', players: P12, gameFormat: 'stroke', skinsBuyIn: 0, skinsCarryOver: false, courseData: CD, scores: {}, settlementMode: 'whole-dollar', groupSizeOverrides: { 0: 4, 1: 4, 2: 4 } }, extra || {});
}
function arrive(data, search, mounts) {
    const sb = loadHtmlInlineScript('index.html', [], { search });
    sb.__m = mounts; run(sb, "__m.forEach(function (id) { document.__mount(document.getElementById(id)); })");
    const h = sb.__dbHandlers.find(x => x.event === 'value' && /^events\//.test(x.path));
    h.cb({ val: () => J(data), exists: () => true });
    return sb;
}
const html = (sb, id) => String(run(sb, "document.getElementById('" + id + "').innerHTML") || '');

describe('2. INITIALS: Randy T. / Randy C. / Matt M. / Matt B. / Matt H. on every surface, Marty bare', () => {
    test('the landing summary ("Playing with") on group 1\'s link', () => {
        const sb = arrive(round12(), '?game=nm1&group=1', ['landing-group-names']);
        run(sb, "window.__scGroupMissing = false; renderLandingSummary(currentData.players.slice(0, 4), currentData.players)");
        const h = html(sb, 'landing-group-names');
        assert.match(h, /Randy T\., Randy C\., Marty, Matt M\./);
        assert.doesNotMatch(h, /Randy,|Matt,/, 'CONTROL: no bare Randy or Matt');
    });
    test('the group picker rows, the Group Links panel rows', () => {
        const sb = arrive(round12(), '?game=nm1', ['group-pick-body', 'group-links-panel']);
        assert.match(html(sb, 'group-pick-body'), /Group 1 · Randy T\., Randy C\., Marty, Matt M\./);
        assert.match(html(sb, 'group-pick-body'), /Group 2 · Matt B\., Matt H\., Ann, Ben/);
        run(sb, "window.authBootState.uid = currentData.ownerUid = 'anon-stub'; groupLinksPanelOpen = true; renderGroupLinksPanel()");
        assert.match(html(sb, 'group-links-panel'), /Randy T\., Randy C\., Marty, Matt M\./);
    });
    test('the who-am-I buttons and Finish Round\'s missing rows', () => {
        const d = round12(); d.players.forEach((p, i) => { for (let h = 1; h <= 3; h++) d.scores['p' + p.id + '_h' + h] = 4; }); delete d.scores['p101_h2']; delete d.scores['p104_h3'];
        const sb = arrive(d, '?game=nm1&group=1', ['whoami-mount', 'fr-incomplete-warning']);
        run(sb, "whoAmIDismissed = false; meId = null; renderWhoAmI()");
        const w = html(sb, 'whoami-mount');
        assert.match(w, /whoami-btn" onclick="setMe\('101'\)">Randy T\.<\/button>/);
        assert.match(w, /setMe\('104'\)">Matt M\.<\/button>/);
        run(sb, 'renderIncompleteWarning()');
        const f = html(sb, 'fr-incomplete-warning');
        assert.match(f, /Hole 2 · Randy T\. <a/); assert.match(f, /Hole 3 · Matt M\. <a/);
    });
    test('a golfer named by id in the round ticker / Ryder pairings, and the Wolf name', () => {
        const sb = arrive(round12(), '?game=nm1&group=1', ['whoami-mount']);
        assert.equal(run(sb, "golferLabel(102)"), 'Randy C.');
        assert.equal(run(sb, "golferLabel(currentData.players[2])"), 'Marty');
        assert.equal(run(sb, "golferLabelFor('Matt H')"), 'Matt H.');
        assert.equal(run(sb, "golferLabelFor('Somebody Else')"), 'Somebody Else', 'a name not on the roster prints whole (the formatter has nothing to shorten against)');
        assert.deepEqual(J(run(sb, 'shortPlayerLabels(currentData.players.slice(0, 4))')), ['Randy T.', 'Randy C.', 'Marty', 'Matt M.']);
    });
    test('CONTROL: no first-token cut is left at the swept sites; the Full Card column initials (getInitials) remain', () => {
        const src = read('index.html');
        const cuts = (src.match(/\.name\.split\(' '\)\[0\]|String\(p\.name\)\.split\(' '\)\[0\]|wolfName\.split\(' '\)\[0\]/g) || []).length;
        // The Wolf modal's own lines and two match-status lines (:7756-7797, :8417, :8542, :8573 in v193) were not on the list and remain - counted so a regression at a swept site is seen.
        assert.ok(cuts <= 12, 'first-token cuts left: ' + cuts);
        assert.match(src, /function getInitials\(name\)/);
        assert.match(src, /\$\{initials\}/, 'the column initials are drawn as before');
        ["return p ? getSmartDisplayName(p, d.players || []) : null;", "escapeHtml(golferLabel(p))).join(', ')", "golferLabelFor(log.wolfName)"].forEach(s => assert.ok(src.includes(s), 'missing: ' + s.slice(0, 40)));
        assert.doesNotMatch(src, /function shortName\(/, 'bet-strip.js (protected) owns the global shortName; the page must not shadow it');
    });
});

// ---------------------------------------------------------------------------
describe('3. "NO BETS" IS NOT SAID OF A WEEKLY GAME ROUND', () => {
    test('a stroke round with the Weekly Game on: the landing lists it and never says no bets (CONTROL: pool off says no bets)', () => {
        const pool = { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7, 12, 16] }, net: { amount: 100, places: [50, 30, 20] }, skins: { mode: 'remainder', scoring: 'gross', carryOver: false } };
        const sb = arrive(round12({ moneyPool: pool }), '?game=nm1&group=1', ['landing-active-games']);
        run(sb, "window.__scGroupMissing = false; renderLandingSummary(currentData.players.slice(0, 4), currentData.players)");
        const h = html(sb, 'landing-active-games');
        assert.doesNotMatch(h, /no bets this round/);
        assert.match(h, /🏆 Weekly Game · \$40 each/);
        const off = arrive(round12(), '?game=nm1&group=1', ['landing-active-games']);
        run(off, "window.__scGroupMissing = false; renderLandingSummary(currentData.players.slice(0, 4), currentData.players)");
        assert.match(html(off, 'landing-active-games'), /Just for score — no bets this round/);
        const disabled = arrive(round12({ moneyPool: Object.assign({}, pool, { enabled: false }) }), '?game=nm1&group=1', ['landing-active-games']);
        run(disabled, "window.__scGroupMissing = false; renderLandingSummary(currentData.players.slice(0, 4), currentData.players)");
        assert.match(html(disabled, 'landing-active-games'), /no bets this round/, 'a disabled pool is no bet');
    });
});

// ---------------------------------------------------------------------------
describe('4. THE WEEKLY GAME STEP SHOWS THE POT ON AN EDIT, FIRST VIEW', () => {
    test('an existing 12-golfer $40 round opened in the wizard: "$480 total pool" without touching anything (CONTROL: the recalc after the rebuild is what does it)', async () => {
        const stored = round12({ moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: [3, 7] }, net: { amount: 100, places: [100] }, skins: { mode: 'remainder', scoring: 'gross', carryOver: false } }, activeCourseKey: 'comm_links', courseName: 'Test Links', ownerUid: 'anon-stub' });
        const sb = loadHtmlInlineScript('admin.html', [], { search: '?game=nm1', beforeRun(sandbox) {
            const realDatabase = sandbox.firebase.database;
            sandbox.firebase.database = Object.assign(function () { const dbi = realDatabase(); const o = dbi.ref.bind(dbi); dbi.ref = (p) => { const r = o(p); if (p === 'events/NM1') r.once = () => Promise.resolve({ val: () => J(stored), exists: () => true }); return r; }; return dbi; }, realDatabase);
        } });
        sb.crypto = require('crypto').webcrypto;
        run(sb, 'globalCourses = ' + JSON.stringify({ comm_links: { name: 'Test Links', data: CD } }) + '; document.__mount(document.getElementById("player-list")); document.__mount(document.getElementById("mp-math"));');
        await new Promise(r => setTimeout(r, 120));
        assert.equal(run(sb, 'loadedExistingRound'), true);
        const math = String(run(sb, "document.getElementById('mp-math').innerHTML") || '');
        assert.match(math, /<span>Total pool<\/span><span>\$480<\/span>/);
        assert.doesNotMatch(math, /<span>\$0<\/span>|Add players in Step 5/);
        assert.match(read('admin.html'), /handleFormatChange\(true\);\s*\/\/ v194[\s\S]{0,400}if \(typeof mpRecalc === 'function'\) mpRecalc\(\);/);
    });
});

// ---------------------------------------------------------------------------
describe('5. THE PASTE DROPS A TRAILING PERIOD', () => {
    test('"Anthony." -> Anthony; "A · Marty. 9" keeps the flight and the handicap; "Jr." loses its dot (accepted); an inner dot stays; stored names are not touched', () => {
        const sb = loadHtmlInlineScript('admin.html', []);
        const p = t => J(run(sb, 'parsePlayerPasteText(' + JSON.stringify(t) + ')')).validPlayers.map(x => [x.name, x.hcp, x.flight || null]);
        assert.deepEqual(p('Anthony.\nGlenn..\nA · Marty. 9\nB, Tim K.\nBob Jones Jr.\nB.J. Smith\nMatt H. 12'), [
            ['Anthony', '', null], ['Glenn', '', null], ['Marty', '9', 'A'], ['Tim K', '', 'B'], ['Bob Jones Jr', '', null], ['B.J. Smith', '', null], ['Matt H', '12', null]]);
        // only trailing, only periods
        assert.deepEqual(p('Marty,\nMarty!'), [['Marty', '', null], ['Marty!', '', null]]);
        // CONTROL: the stored-name reader is untouched - a round loaded with "Anthony." keeps it (the paste is the only place)
        assert.doesNotMatch(read('admin.html').slice(read('admin.html').indexOf('function loadModeData('), read('admin.html').indexOf('function loadModeData(') + 6000), /replace\(\/\\\.\+\$\//);
    });
});
