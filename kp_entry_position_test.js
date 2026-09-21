// ============================================================================
// THE KP ENTRY SITS UNDER THE PREV/NEXT ROW (2026-09-19).
//
// Measured by Manny on a phone: on hole 8 the "Set KP Leader" block was inside
// the Weekly Game panel of the Action Center - past the recap banner, the skins
// panel, the My Round toggle (a tap), the panel's label, summary, Net Finish and
// per-hole list. The block reads page state and one participant list; nothing
// in it needs the panel. Now: a #kp-entry-mount directly after the nav row,
// before the Dots block, filled by renderKpEntryMount(); saveKpLeader and
// toggleKpEntry re-render that one div (renderHoleView rebuilds every score box
// and is called only by the navigations - it does not re-land the scroll
// itself, but it would wipe a half-typed score; the mount is the right size).
// The block's three gates travel with buildPoolKpEntry (a KP pot, a KP hole, a
// link that may write) and the pool guard buildMoneyPoolBanner had comes with
// it. It shows on every KP hole whether or not My Round is open - the point.
// The head reads "Hole 8 Weekly Game KP", so on a round that also plays the
// Dots "KP · $N each" line under the same nav row the two games are told apart;
// on a Weekly-Game-only round it reads the same, which names the game the money
// belongs to. The Weekly Game panel keeps its label, summary, Net Finish and the
// per-hole list; nothing replaces the block there.
//
// HARNESS. mini-dom: the hole view's markup is a string (the mount's position is
// asserted from the string); the mount is registered, so renderKpEntryMount can
// fill it. The 390-px rects - where the block sits, what moved down, the hole
// landing unchanged - are Chrome's: tools/kp-entry-position-check.js.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const SRC = read('index.html');
const CD = makeCourseData(18);   // par 3s at holes 3, 7, 12, 16
const DEPS = ['handicap.js', 'money-engine.js', 'action-model.js', 'settlement-engine.js', 'live-skins.js', 'pool-engine.js', 'bet-strip.js', 'hole-events.js', 'grouping.js'];

function round(kpHoles) {
    const players = makePlayers(['Ann', 'Ben', 'Cal', 'Dee'], [0, 4, 9, 13]);
    const scores = {};
    players.forEach((p) => { for (let h = 1; h <= 6; h++) scores[`p${p.id}_h${h}`] = 5; });
    return { eventName: 'KP Day', gameFormat: 'stroke', courseData: CD, players, scores, settlementMode: 'whole-dollar',
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 100, holes: kpHoles === undefined ? [3, 7, 12, 16] : kpHoles }, net: { amount: 0 }, skins: { mode: 'remainder', scoring: 'net', carryOver: false } } };
}
function boot(data, hole, group) {
    const sb = loadHtmlInlineScript('index.html', DEPS, { search: '?game=KPP1' + (group ? '&group=' + group : '') });
    vm.runInContext(`
        window.__writes = []; window.__alerts = []; alert = m => window.__alerts.push(String(m));
        db.ref = function (p) { return { set: function (v) { window.__writes.push({ path: p, value: v }); return Promise.resolve(); },
            update: function (v) { window.__writes.push({ path: p, value: v }); return Promise.resolve(); }, remove: function () { return Promise.resolve(); },
            on: function () {}, push: function () { return { key: 'k' }; } }; };
        currentMode = 'KPP1'; currentData = ${JSON.stringify(data)};
        window.__scFilteredPlayers = currentData.players;
        hasGroupLock = ${group ? 'true' : 'false'}; lockedGroup = ${group || 'null'};
        currentViewedHole = ${hole}; navigator.onLine = true;
        document.__mount(document.getElementById('kp-entry-mount'));
        renderKpEntryMount();
    `, sb);
    return sb;
}
const mount = (sb) => String(sb.document.getElementById('kp-entry-mount').innerHTML || '');
const run = (sb, c) => vm.runInContext(c, sb);

describe('1. THE MOUNT IS UNDER THE NAV ROW, BEFORE THE DOTS BLOCK (source)', () => {
    test('renderHoleView appends navRowHtml, then #kp-entry-mount, then the Dots block, then the recap/skins/action mounts', () => {
        const at = SRC.indexOf('function renderHoleView()');
        const fn = SRC.slice(at, SRC.indexOf('\n    function ', at + 30));
        assert.ok(fn.length > 2000, 'the hole view renderer exists');
        const nav = fn.indexOf('html += navRowHtml;');
        const kp = fn.indexOf("html += '<div id=\"kp-entry-mount\"></div>';");
        const dots = fn.indexOf('if (dotsGame) {');
        const recap = fn.indexOf("html += '<div id=\"hole-recap-mount\"></div>';");
        const action = fn.indexOf("html += '<div id=\"action-center-mount\"></div>';");
        assert.ok(nav > 0 && kp > 0 && dots > 0 && recap > 0 && action > 0, 'every mount exists');
        assert.ok(nav < kp && kp < dots && dots < recap && recap < action, 'order: nav row, KP entry, Dots, recap, …, action center');
        // Filled from renderCardWidgets - the one list both the open and the closed
        // hole-view paths call after container.innerHTML, so the two cannot drift.
        const w = SRC.indexOf('function renderCardWidgets()');
        const widgets = SRC.slice(w, SRC.indexOf('\n    }', w));
        assert.match(widgets, /renderHoleRecap\(\);/, 'the widget list exists');
        assert.match(widgets, /renderKpEntryMount\(\);/, 'the mount is filled with the other widgets');
    });
    test('the Weekly Game panel no longer appends the entry block; renderKpEntryMount owns it with all three gates and the pool guard', () => {
        const b = SRC.indexOf('function buildMoneyPoolBanner()');
        const banner = SRC.slice(b, SRC.indexOf('\n    }', b));
        assert.doesNotMatch(banner, /buildPoolKpEntry/, 'the panel still carries the entry block');
        assert.match(banner, /buildLiveKpStatus\(r\)/, 'the per-hole list stays in the panel');
        const m = SRC.indexOf('function renderKpEntryMount()');
        assert.ok(m > 0, 'renderKpEntryMount exists');
        const fn = SRC.slice(m, SRC.indexOf('\n    }', m));
        assert.match(fn, /moneyPool\.enabled === false/, 'the pool guard travelled with it');
        assert.match(fn, /typeof computeMoneyPool !== 'function'/);
        assert.match(fn, /buildPoolKpEntry\(r\)/);
        ['toggleKpEntry', 'saveKpLeader'].forEach((name) => {
            const f = SRC.indexOf('function ' + name + '(');
            const body = SRC.slice(f, SRC.indexOf('\n    }', f));
            assert.match(body, /renderKpEntryMount\(\)/, name + ' re-renders the mount');
        });
        const t = SRC.indexOf('function toggleKpEntry(');
        assert.doesNotMatch(SRC.slice(t, SRC.indexOf('\n    }', t)), /renderActionCenter\(\)/, 'toggleKpEntry no longer rebuilds the Action Center');
    });
    test('the head: "⛳ Hole N — Closest to the Pin" (v193: the block is the question; the Weekly Game is named by the pot line above it)', () => {
        assert.match(SRC, /'<div class="kp-head">\\u26F3 Hole ' \+ h \+ ' \\u2014 Closest to the Pin<\/div>'/);
    });
});

describe('2. WHEN IT SHOWS - the three gates and the pool guard, on the new mount', () => {
    test('a KP hole, a writing link: the block with the picker, whether or not My Round is open', () => {
        const sb = boot(round(), 7);
        assert.equal(run(sb, 'actionCenterOpen'), false, 'My Round is collapsed');
        const h = mount(sb);
        assert.match(h, /Hole 7 — Closest to the Pin/);   // re-pinned 2026-09-22 (v193): the block is the question - kp_prompt_test.js
        assert.match(h, /No KP yet\./);
        assert.match(h, /Yes — pick who/);
    });
    test('a non-KP hole: the mount is empty', () => {
        assert.equal(mount(boot(round(), 8)), '');
    });
    test('no KP pot / pool disabled / no moneyPool: the mount is empty', () => {
        assert.equal(mount(boot(round([]), 7)), '');
        const off = round(); off.moneyPool.enabled = false;
        assert.equal(mount(boot(off, 7)), '');
        const none = round(); delete none.moneyPool;
        assert.equal(mount(boot(none, 7)), '');
    });
    test('a spectator on a multi-group round sees the marker and no picker', () => {
        const data = round(); data.players = makePlayers(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], [0, 0, 0, 0, 0, 0, 0, 0]);
        data.kpLeaders = { h7: { playerId: '103', playerName: 'C', group: 1, distanceInches: 100, updatedAt: 1 } };
        data.kpWinners = { h7: '103' };
        const h = mount(boot(data, 7));
        assert.match(h, /Current KP: <strong>C<\/strong> \(Group 1\)/);   // re-pinned 2026-09-22 (v193): the block is the question - kp_prompt_test.js
        assert.match(h, /8' 4"/);
        assert.ok(!/Did anyone|Yes — pick who|No — leave it|Change KP|kp-select/.test(h), 'seeing is not claiming');
    });
});

describe('3. THE SAVE RE-RENDERS ONE DIV', () => {
    test('toggle opens the picker in the mount; saving writes the atomic update and the mount shows the new leader', async () => {
        const sb = boot(round(), 7);
        run(sb, 'toggleKpEntry(7)');
        assert.match(mount(sb), /kp-pick-7/);
        assert.match(mount(sb), /Save KP/);
        run(sb, "saveKpLeader(7, '102', '6', '2')");
        await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
        const w = run(sb, 'JSON.stringify(window.__writes)');
        assert.match(w, /"kpLeaders\/h7"/); assert.match(w, /"kpWinners\/h7":"102"/); assert.doesNotMatch(w, /kpConfirmed/);   // re-pinned 2026-09-19: recording pays, no confirmation to clear
        // the page's own snapshot would carry the leader back; simulate it landing
        run(sb, "currentData.kpLeaders = { h7: { playerId: '102', playerName: 'Ben', group: null, distanceInches: 74, updatedAt: 2 } }; currentData.kpWinners = { h7: '102' }; renderKpEntryMount();");
        assert.match(mount(sb), /Current KP: <strong>Ben<\/strong>/);   // re-pinned 2026-09-22 (v193): the block is the question - kp_prompt_test.js
        // saveKpLeader was called directly here (unchanged by v193); the ANSWER is
        // recorded by the button path (submitKpEntry), so the question still shows.
        assert.match(mount(sb), /Did anyone in your group get inside it\?/);
        assert.equal(run(sb, 'window.__alerts.length'), 0, 'no KP RECORDED dialog (2026-09-19) - the block is the confirmation');
    });
});

describe('4. THE SEAMS', () => {
    test('the Chrome check exists and measures both holes at 390', () => {
        const t = read('tools/kp-entry-position-check.js');
        assert.match(t, /width: 390/);
        assert.match(t, /kp-entry-mount/);
        assert.match(t, /hole-view-nav-row/);
        assert.match(t, /HOLE_LANDING|landing/);
    });
    test('sw.js moved for this wave (v180) and has not moved back', () => {
        assert.match(read('sw.js'), /Moved to v180:/);
        const c = /const CACHE_VERSION = 'golfapp-v(\d+)-/.exec(read('sw.js'));
        assert.ok(c && Number(c[1]) >= 180, 'consumer key at or past v180: ' + (c && c[0]));
    });
});
