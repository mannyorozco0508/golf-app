// ============================================================================
// POLISH #21 (URGENT-040) - ROUND SETTINGS, SIMPLER, IN REAL CHROME (iPhone 15, 393x852). Stub db.
//
// The 039 proposal, in a GPS round (the map up, simpleFlow, the organizer, two groups of two):
//   1  On top: Golfers, Tee, Start (Hole 1 / 10 / Shotgun), Add a game, Change course, then
//      "More" with the game code under it. Nothing else of the sheet shows.
//   2  More open: THIS ROUND, THIS PHONE, GO TO - each with its rows - then Save & exit and Delete.
//   3  EVERY row, on top and inside More, clicks TODAY'S control (the very element the sheet had,
//      by its handler / href) - and every control the sheet shows today has a row.
//   4  A few, all the way: Golfers -> the Players sheet, Tee -> the tee sheet, Start "10" -> the
//      Start sheet with 10 picked, Dark Mode -> the theme, Change course, GPS tools, ✕ closes.
//   5  A scorekeeper's phone (group link): the Scorekeeper line in THIS PHONE.
//   6  Non-GPS Round settings (simpleFlow off - Consumer / Game Day): exactly today's controls,
//      no new look.
//   7  URGENT-040 9:23 PM: the Golfers row has its own "+ Add golfer" on the right; it and More's
//      Add golfer click the same quick edit and open the same sheet (HardPanAddGolfer.open).
//   8  A SOLO GPS round, on hole 4 (holes 1-3 scored): Menu > Round settings > + Add golfer ->
//      name / HCP / tee -> Add. The new golfer is on the Card and the score sheet at hole 4, holes
//      1-3 blank; nothing but the players / groups is written (games, money, scores untouched).
//
// SHOTS=1 saves the screens to ~/Desktop/claude-code-reports/040/.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(path.join(__dirname, 'gps-round.js'))) { console.log('Consumer tree: no simple-flow round - skipped.'); process.exit(0); }
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { openJourney, fileUrl } = require('./tools/lib/journey.js');
const { wizardSavedRound } = require('./helpers/wizard-saved-round.js');
const { iapStub } = require('./tools/lib/iap-stub.js');

const round = (code) => {
    const r = wizardSavedRound({ code, golfers: 4, ownerUid: 'anon-cold', thru: 0, flights: false, names: ['Test A', 'Test B', 'Test C', 'Test D'],
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club (Caledonia)', groupSizeOverrides: { 0: 2, 1: 2 } } });
    delete r.moneyPool; r.scores = {};
    return r;
};
const CFG = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,devPro:true});}});})();";
const GEO = "(function(){ try { Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:function(ok){ var f=function(){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}; setTimeout(f,50); return setInterval(f,1000);}, getCurrentPosition:function(ok){ok({coords:{latitude:33.4528,longitude:-79.1547,accuracy:5},timestamp:Date.now()});}, clearWatch:function(t){clearInterval(t);}}}); } catch(e){} })();";
const SHOT_DIR = path.join(require('os').homedir(), 'Desktop', 'claude-code-reports', '040');
async function shot(j, name) { if (!process.env.SHOTS) return; try { fs.mkdirSync(SHOT_DIR, { recursive: true }); await j.shot(path.join(SHOT_DIR, name + '.png')); } catch (e) {} }
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await j.evaluate(expr)) return true; } catch (e) {} await sleep(200); } return false; }
const J = async (j, expr) => JSON.parse(await j.evaluate('JSON.stringify(' + expr + ')'));

async function gpsRound(code, query, ev, courses) {
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO
        + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');"
        + "localStorage.setItem('hardpan_round_side','gps|" + code + "');}catch(e){}";
    const j = await openJourney({ db: { events: { [code]: ev || round(code) }, global_courses: courses || {}, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 393, height: 852 }, webgl: true, preScript: pre });
    journeys.push(j);
    await j.goto(fileUrl('index.html', 'game=' + code + (query || '&me=101')), 300);
    assert.ok(await until(j, "!!window.HardPanGps && HardPanGps.side() === 'gps' && HardPanGps.isMounted()", 30000), 'the map is up');
    await sleep(1200);
    return j;
}
async function openSettings(j) {
    await j.evaluate('HardPanRound.openSettings()');
    assert.ok(await until(j, "document.getElementById('round-sheet').classList.contains('open') && !!document.querySelector('#hp-rs [data-rs=\"q-players\"]') && !!document.querySelector('#hp-rs [data-rs=\"fdm-add\"]')", 8000), 'Round settings opened with its rows');
    await sleep(400);
}

const VIS = "function vis(e){var r=e.getBoundingClientRect(); if(!(r.width>0&&r.height>0)) return false; for(var x=e;x&&x!==document.documentElement;x=x.parentElement){var c=getComputedStyle(x); if(c.display==='none'||c.visibility==='hidden') return false;} return true;}";
// What the golfer sees in the sheet: the visible buttons / links, their words, and whose they are.
const SEEN = "(function(){" + VIS + " return Array.prototype.filter.call(document.querySelectorAll('#round-sheet-body button, #round-sheet-body a[href], #round-sheet-body .rs-plain'), vis).map(function(e){ return { mine: !!e.closest('#hp-rs, #hp-rs-end'), rs: e.getAttribute('data-rs'), text: (e.textContent||'').replace(/\\s+/g,' ').trim() }; }); })()";

// Each row -> today's control: how that control is known (its handler or its href).
const CODE = 'PRS21A';
const EXPECT = {
    'q-players': { hq: 'players' }, 'q-tee': { hq: 'tee' }, 'q-start': { hq: 'start' }, 'fdm-add': { fdm: 'add' }, 'q-course': { hq: 'course' },
    'q-addgolfer': { hq: 'addgolfer' }, 'q-groups': { hq: 'groups' }, 'q-weekly': { hq: 'weekly' }, 'fdm-paste': { fdm: 'paste' }, 'fdm-trip': { fdm: 'trip' },
    fullsetup: { href: /^admin\.html\?game=PRS21A/, full: true },
    gps: { id: 'hp-gps-tools' }, dark: { onclick: /^toggleTheme\(\)$/ },
    'nav-index.html': { href: /^index\.html\?game=PRS21A$/ }, full: { onclick: /^setViewMode\('full'\)$/ }, holeview: { onclick: /^setViewMode\('hole'\)$/ },
    'nav-leaderboard.html': { href: /^leaderboard\.html\?game=PRS21A$/ }, 'nav-skins.html': { href: /^skins\.html\?game=PRS21A$/ },
    'nav-settlement.html': { href: /^settlement\.html\?game=PRS21A$/ }, 'nav-sidematches.html': { href: /^sidematches\.html\?game=PRS21A$/ },
    'nav-game.html': { href: /^game\.html\?game=PRS21A$/ }, 'nav-trip.html': { href: /^trip\.html/ },
    grouplinks: { onclick: /^toggleGroupLinksPanel\(\)$/ }, players: { onclick: /^openPlayersSheet\(\)$/ },
    'f-all': { onclick: /^filterGroup\('all'\)$/ }, 'f-1': { onclick: /^filterGroup\(1\)$/ }, 'f-2': { onclick: /^filterGroup\(2\)$/ },
    history: { onclick: /^openHistoryModal\(\)$/ }, mystats: { id: 'qs-menu-mystats' }, share: { inside: 'qr-share-mount' },
    'nav-instructions.html': { href: /^instructions\.html\?from=index\.html&game=PRS21A/ }, 'nav-admin.html': { href: /^admin\.html$/ },
    save: { id: 'sc-foot-save', onclick: /admin\.html/ }, 'delete': { onclick: /^endAndClearRound\(\)$/ }
};
const TOP = ['q-players', 'q-tee', 'q-start', 'fdm-add', 'q-course'];
const THIS_ROUND = ['q-addgolfer', 'q-groups', 'q-weekly', 'fdm-paste', 'fdm-trip', 'fullsetup'];
const THIS_PHONE = ['gps', 'dark'];
const GO_TO = ['nav-index.html', 'full', 'holeview', 'nav-leaderboard.html', 'nav-skins.html', 'nav-settlement.html', 'nav-sidematches.html', 'nav-game.html', 'nav-trip.html',
    'grouplinks', 'players', 'f-all', 'f-1', 'f-2', 'history', 'mystats', 'share', 'nav-instructions.html', 'nav-admin.html'];

let J1;
test('1 on top: Golfers, Tee, Start (Hole 1 / 10 / Shotgun), Add a game, Change course, More and the code - nothing else', { timeout: 120000 }, async () => {
    J1 = await gpsRound(CODE);
    await openSettings(J1);
    const s = await J(J1, "{ cls: document.getElementById('round-sheet').className, title: document.querySelector('#hp-rs .rs-t').textContent, sub: document.querySelector('#hp-rs .rs-sub').textContent,"
        + " rows: Array.prototype.map.call(document.querySelectorAll('#hp-rs > .rs-row, #hp-rs > .rs-addg, #hp-rs > .rs-more'), function(e){ var b=e.matches('[data-rs]')?e:e.querySelector('[data-rs]'); return [b.getAttribute('data-rs'), (e.querySelector('.rs-tt')||e).textContent.replace(/\\s+/g,' ').trim()]; }),"
        + " chips: Array.prototype.map.call(document.querySelectorAll('#hp-rs .rs-chips button'), function(b){ return b.textContent + (b.classList.contains('on') ? '*' : ''); }),"
        + " code: document.querySelector('#hp-rs .rs-code').textContent, open: getComputedStyle(document.querySelector('#hp-rs .rs-open')).display, end: getComputedStyle(document.getElementById('hp-rs-end')).display }");
    assert.match(s.cls, /\bhp-rs\b/);
    assert.equal(s.title, 'Round settings');
    assert.match(s.sub, /^Caledonia Golf & Fish Club · Test A, Test B/, 'the course (POLISH #22 tidy) and the golfers: ' + s.sub);
    assert.deepEqual(s.rows.map((r) => r[0]), ['q-players', 'q-tee', 'q-start', 'fdm-add', 'q-course', 'more'], JSON.stringify(s.rows));
    assert.deepEqual(s.rows.map((r) => r[1]).map((t) => t.replace(/^＋/, '')), ['Golfers', 'Tee', 'Start', 'Add a game', 'Change course', 'More']);
    assert.deepEqual(s.chips, ['Hole 1*', '10', 'Shotgun']);
    assert.equal(s.code, 'GAME · ' + CODE);
    assert.equal(s.open, 'none', 'More starts closed');
    assert.equal(s.end, 'none', 'Save & exit / Delete are inside More');
    const seen = await J(J1, SEEN);
    assert.deepEqual(seen.filter((x) => !x.mine), [], 'only the new rows show: ' + JSON.stringify(seen.filter((x) => !x.mine)));
});

test('2 More open: THIS ROUND, THIS PHONE, GO TO, then Save & exit and Delete', { timeout: 60000 }, async () => {
    await J1.evaluate("document.querySelector('#hp-rs [data-rs=\"more\"]').click()"); await sleep(400);
    const s = await J(J1, "{ heads: Array.prototype.map.call(document.querySelectorAll('#hp-rs .rs-h'), function(e){ return e.textContent; }),"
        + " lists: Array.prototype.map.call(document.querySelectorAll('#hp-rs .rs-open .rs-list'), function(l){ return Array.prototype.map.call(l.children, function(e){ return e.getAttribute('data-rs') || e.textContent.replace(/\\s+/g,' ').trim(); }); }),"
        + " go: Array.prototype.map.call(document.querySelectorAll('#hp-rs .rs-grid button'), function(e){ return e.getAttribute('data-rs'); }),"
        + " end: Array.prototype.map.call(document.querySelectorAll('#hp-rs-end [data-rs]'), function(e){ return e.getAttribute('data-rs'); }),"
        + " dark: !!document.querySelector('#hp-rs [data-rs=\"dark\"] .rs-tog'), more: document.querySelector('#hp-rs [data-rs=\"more\"]').getAttribute('aria-expanded'),"
        + " topStill: !!document.querySelector('#hp-rs > [data-rs=\"q-players\"], #hp-rs > .rs-golf > [data-rs=\"q-players\"]'), endShown: getComputedStyle(document.getElementById('hp-rs-end')).display }");
    assert.deepEqual(s.heads.map((h) => h.toUpperCase()), ['THIS ROUND', 'THIS PHONE', 'GO TO']);
    assert.deepEqual(s.lists[0], THIS_ROUND);
    assert.deepEqual(s.lists[1], THIS_PHONE);
    assert.deepEqual(s.go, GO_TO);
    assert.deepEqual(s.end, ['save', 'delete']);
    assert.equal(s.dark, true, 'Dark Mode is a switch');
    assert.equal(s.more, 'true');
    assert.equal(s.topStill, true, 'the five stay above');
    assert.notEqual(s.endShown, 'none');
});

test('3 EVERY row clicks today\'s control - and every control today has a row', { timeout: 120000 }, async () => {
    // A catcher in front of everything: it records which of today's controls was clicked and stops it
    // there (no navigation, no sheet), so each row can be tapped in turn.
    await J1.evaluate("(function(){ window.__rsHits = []; document.addEventListener('click', function(ev){ var t = ev.target; if (!t || !t.closest || t.closest('#hp-rs, #hp-rs-end')) return;"
        + " var e = t.closest('#round-sheet-body button, #round-sheet-body a'); if (!e) return; var q = e.closest('#qr-share-mount');"
        + " window.__rsHits.push({ id: e.id, hq: e.getAttribute('data-hq'), fdm: e.getAttribute('data-fdm'), full: e.getAttribute('data-hp-full') === '1', onclick: e.getAttribute('onclick'), href: e.getAttribute('href'), inside: q ? 'qr-share-mount' : null, text: (e.textContent||'').trim() });"
        + " ev.preventDefault(); ev.stopImmediatePropagation(); }, true); return 1; })()");
    const keys = await J(J1, "Array.prototype.map.call(document.querySelectorAll('#hp-rs [data-rs], #hp-rs-end [data-rs]'), function(e){ return e.getAttribute('data-rs') + (e.getAttribute('data-rs-start') ? '@' + e.getAttribute('data-rs-start') : ''); })");
    const rows = keys.filter((k) => k !== 'close' && k !== 'more');
    for (const k of Object.keys(EXPECT)) assert.ok(rows.some((r) => r.split('@')[0] === k), 'no row for ' + k + ': ' + rows.join(', '));
    const bad = [];
    for (const r of rows) {
        const k = r.split('@')[0];
        const sel = '[data-rs="' + k + '"]' + (r.includes('@') ? '[data-rs-start="' + r.split('@')[1] + '"]' : '');
        const hit = await J(J1, "(function(){ window.__rsHits = []; var b = document.querySelector('#hp-rs " + sel.replace(/"/g, '\\"') + ", #hp-rs-end " + sel.replace(/"/g, '\\"') + "'); b.click(); return window.__rsHits.slice(); })()");
        const want = EXPECT[k];
        if (!want) { bad.push(r + ': no expectation'); continue; }
        if (hit.length !== 1) { bad.push(r + ': ' + hit.length + ' controls clicked'); continue; }
        const h = hit[0];
        for (const f of Object.keys(want)) {
            const v = want[f], got = h[f];
            if (v instanceof RegExp ? !v.test(String(got || '')) : got !== v) bad.push(r + ': ' + f + ' = ' + JSON.stringify(got) + ' (want ' + v + ')');
        }
    }
    assert.deepEqual(bad, [], bad.join('\n'));
    // Every control today's sheet shows has a row (measured with the new look off for a moment).
    const today = await J(J1, "(function(){ " + VIS + " var sh = document.getElementById('round-sheet'); sh.classList.remove('hp-rs');"
        + " try { return Array.prototype.filter.call(document.querySelectorAll('#round-sheet-body button, #round-sheet-body a[href]'), function(e){ return !e.closest('#hp-rs, #hp-rs-end, #group-links-panel, #dot-context-row') && vis(e); }).map(function(e){ return (e.textContent||'').replace(/\\s+/g,' ').trim(); }); } finally { sh.classList.add('hp-rs'); } })()");
    assert.ok(today.length >= 30, 'today\'s sheet: ' + JSON.stringify(today));
    const words = await J(J1, "Array.prototype.map.call(document.querySelectorAll('#hp-rs [data-rs], #hp-rs-end [data-rs]'), function(e){ return (e.textContent||'').replace(/\\s+/g,' ').trim(); }).join(' | ')");
    const name = (t) => t.replace(/^[^A-Za-z+]+/, '').replace(/^\+ /, '').split(/(?=[A-Z][a-z]+, )| ·|›|Name, |Rename|Who plays|Hole 1 \/|And the|Off -|A new/)[0].trim();
    const ALIAS = { 'Tee for everyone': 'Tee', 'Start': 'Hole 1', 'Golfers': 'Golfers', 'Full setup': 'Full setup', '': '' };
    const missing = today.map(name).filter((n) => n && !/^🧭$/.test(n)).filter((n) => !words.includes(ALIAS[n] || n));
    assert.deepEqual(missing, [], 'controls of today with no row: ' + missing.join(', ') + '\nrows: ' + words);
    await J1.close(); journeys.splice(journeys.indexOf(J1), 1);
});

test('4 all the way: Golfers, Tee, Start 10, Dark Mode, Change course, GPS tools, ✕', { timeout: 180000 }, async () => {
    const j = await gpsRound('PRS21B');
    // Spies on the functions today's handlers call (looked up at the time of the tap).
    await j.evaluate("(function(){ window.__calls = []; var w = function(o, k, n){ var f = o[k]; o[k] = function(){ window.__calls.push(n); return f.apply(this, arguments); }; };"
        + " w(window, 'openPlayersSheet', 'openPlayersSheet'); w(HardPanRound, 'changeCourse', 'changeCourse'); w(HardPanGps, 'openTools', 'openTools'); return 1; })()");
    await j.evaluate("HardPanRound.changeCourse = (function(f){ return function(){ window.__calls.push('changeCourse!'); }; })(HardPanRound.changeCourse)");
    const tap = async (sel, more) => {
        await openSettings(j);
        if (more) { await j.evaluate("document.querySelector('#hp-rs [data-rs=\"more\"]').click()"); await sleep(300); }
        assert.ok(await j.evaluate("(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return false; b.click(); return true; })()"), 'no ' + sel);
        await sleep(700);
    };
    await tap('#hp-rs [data-rs="q-players"]');
    assert.deepEqual(await J(j, 'window.__calls'), ['openPlayersSheet'], 'Golfers opens the Players sheet');
    assert.equal(await j.evaluate("document.getElementById('round-sheet').classList.contains('open')"), false, 'Round settings closes under it (not a sheet on a sheet)');
    await j.evaluate("typeof closePlayersSheet === 'function' ? closePlayersSheet() : (document.querySelector('.players-sheet .ps-close, #players-sheet [data-close]') || {click:function(){}}).click()"); await sleep(400);

    await tap('#hp-rs [data-rs="q-tee"]');
    assert.equal(await j.evaluate("document.querySelector('#hp-redit.open h2') && document.querySelector('#hp-redit.open h2').textContent"), 'Tee for everyone');
    await j.evaluate('HardPanRoundEdit.close()');

    await tap('#hp-rs [data-rs="q-start"][data-rs-start="10"]');
    const st = await J(j, "{ t: document.querySelector('#hp-redit.open h2') && document.querySelector('#hp-redit.open h2').textContent, on: Array.prototype.map.call(document.querySelectorAll('#hp-redit .re-chip.on'), function(b){ return b.textContent; }), save: !!document.querySelector('#hp-redit [data-re=\"save\"]:not([disabled])') }");
    assert.equal(st.t, 'Start');
    assert.deepEqual(st.on, ['Hole 10'], 'the Start sheet with 10 picked');
    assert.equal(st.save, true, 'its own Save writes it');
    await j.evaluate('HardPanRoundEdit.close()');

    await tap('#hp-rs [data-rs="q-start"][data-rs-start="shotgun"]');
    const sg = await J(j, "Array.prototype.map.call(document.querySelectorAll('#hp-redit select[data-re-ghole]'), function(s){ return s.value; })");
    assert.deepEqual(sg, ['1', '2'], 'Shotgun: Group 1 on 1, Group 2 on 2 - picked in the Start sheet');
    await j.evaluate('HardPanRoundEdit.close()');

    const dark0 = await j.evaluate("document.documentElement.classList.contains('dark-mode')");
    await tap('#hp-rs [data-rs="dark"]', true);
    const dk = await J(j, "{ dark: document.documentElement.classList.contains('dark-mode'), sw: document.querySelector('#hp-rs [data-rs=\"dark\"]').getAttribute('aria-checked'), open: document.getElementById('round-sheet').classList.contains('open') }");
    assert.equal(dk.dark, !dark0, 'Dark Mode switched');
    assert.equal(dk.sw, String(!dark0), 'the switch shows it');
    assert.equal(dk.open, true, 'the sheet stays, as today');
    await j.evaluate("document.querySelector('#hp-rs [data-rs=\"dark\"]').click()"); await sleep(300);
    await j.evaluate("window.toggleRoundSheet(false)"); await sleep(300);

    await tap('#hp-rs [data-rs="q-course"]');
    assert.ok((await J(j, 'window.__calls')).includes('changeCourse!'), 'Change course calls HardPanRound.changeCourse');

    await tap('#hp-rs [data-rs="gps"]', true);
    assert.ok((await J(j, 'window.__calls')).includes('openTools'), 'GPS tools opens the map\'s Tools');

    await openSettings(j);
    await j.evaluate("document.querySelector('#hp-rs [data-rs=\"close\"]').click()"); await sleep(400);
    assert.deepEqual(await J(j, "{ open: document.getElementById('round-sheet').classList.contains('open'), rs: document.getElementById('round-sheet').classList.contains('hp-rs') }"), { open: false, rs: false }, '✕ closes');
});

test('5 a scorekeeper\'s phone: THIS PHONE says which group it scores', { timeout: 120000 }, async () => {
    const j = await gpsRound('PRS21C', '&group=1&me=101');
    await j.evaluate('HardPanRound.openSettings()');
    assert.ok(await until(j, "!!document.querySelector('#hp-rs')", 8000));
    await sleep(500);
    await j.evaluate("document.querySelector('#hp-rs [data-rs=\"more\"]').click()"); await sleep(300);
    const t = await j.evaluate("(function(){ var e = document.querySelector('#hp-rs .rs-plain'); return e ? e.textContent.replace(/\\s+/g,' ').trim() : null; })()");
    assert.match(String(t), /^🔒Scorekeeper.*Group 1/i, 'the Scorekeeper line: ' + t);
    assert.equal(await j.evaluate("!!document.querySelector('#hp-rs .rs-plain[data-rs], #hp-rs .rs-plain button')"), false, 'a plain row');
});

// Today's Round Menu with simpleFlow off (the Consumer / Game Day sheet), as fc767cc shows it.
const CONSUMER_TODAY = ['➕ Add a game', '📋 Paste the whole round', '🗓️ Paste a multi-round match', '✏️ Edit Round Setup · Players, Tees, Groups', '🌙 Dark Mode', '🕘 History', '📝Scorecard', '🏆Leaderboard', '💰Bets', '🤝Results', '⚔️Matches', '📖Game', '🚐Trip', '🏠Home', '🧭How it works',
    'Hole View', '📋 Full Card', '👥 All Players', 'Group 1', 'Group 2', '🔗 Group Links', '✏️ Edit round setup', '👥 Players', '📤 Share', '⬅️ Save & exit', '🧭', '🗑️ Delete round for everyone'];
test('6 non-GPS Round settings (Consumer / Game Day): today\'s sheet exactly, no new look', { timeout: 120000 }, async () => {
    const code = 'PRS21D';
    const pre = "window.__hardpanDoors = true; try { sessionStorage.setItem('groupPickDismissed:" + code + "', '1'); localStorage.setItem('hardpan_simple_flow', 'off'); } catch (e) {}";
    const r = round(code); r.organizerToken = 'a'.repeat(32);
    const j = await openJourney({ db: { events: { [code]: r }, trips: {} }, viewport: { width: 390, height: 844 }, preScript: pre });
    journeys.push(j);
    await j.goto(fileUrl('index.html', 'game=' + code + '&organizer=' + 'a'.repeat(32)), 3200);
    await j.tap('#round-sheet-handle'); await sleep(700);
    const s = await J(j, "{ open: document.getElementById('round-sheet').classList.contains('open'), rs: document.getElementById('round-sheet').className, mine: !!document.getElementById('hp-rs') || !!document.getElementById('hp-rs-end'), label: document.getElementById('round-sheet-label').textContent }");
    assert.equal(s.open, true);
    assert.doesNotMatch(s.rs, /hp-rs/);
    assert.equal(s.mine, false, 'no new rows');
    const seen = (await J(j, SEEN)).map((x) => x.text);
    if (process.env.PRINT_CONSUMER) console.log(JSON.stringify(seen));
    assert.deepEqual(seen, CONSUMER_TODAY);
});

test('7 the Golfers row\'s "+ Add golfer" and More\'s Add golfer: the same quick edit, the same sheet', { timeout: 120000 }, async () => {
    const j = await gpsRound('PRS21F');
    await openSettings(j);
    const g = await J(j, "(function(){ var r = document.querySelector('#hp-rs > .rs-golf'), a = r && r.querySelector('[data-rs=\"q-addgolfer\"]'), m = r && r.querySelector('[data-rs=\"q-players\"]');"
        + " if (!a || !m) return null; var ra = a.getBoundingClientRect(), rr = r.getBoundingClientRect(), rm = m.getBoundingClientRect();"
        + " return { text: a.textContent.trim(), right: Math.round(rr.right - ra.right), leftOfIt: rm.right <= ra.left + 1, h: Math.round(ra.height), w: Math.round(rr.width), nested: !!a.closest('[data-rs=\"q-players\"]'), first: r === document.querySelector('#hp-rs > .rs-row') }; })()");
    assert.ok(g, 'the Golfers row has a "+ Add golfer" button');
    assert.equal(g.text, '＋ Add golfer');
    assert.equal(g.first, true, 'the Golfers row is the first row, on top');
    assert.ok(g.right <= 16 && g.leftOfIt, 'on the right of the row: ' + JSON.stringify(g));
    assert.ok(g.h >= 44, 'a 44pt tap target: ' + g.h);
    assert.equal(g.nested, false, 'its own button, not inside the Golfers button');
    await shot(j, 'round-settings-top');
    // Both buttons click the same control: the quick edit "addgolfer" (today's handler).
    await j.evaluate("(function(){ window.__hits = []; document.addEventListener('click', function(ev){ var t = ev.target; if (!t || !t.closest || t.closest('#hp-rs, #hp-rs-end')) return; var e = t.closest('#round-sheet-body button'); if (!e) return; window.__hits.push(e.getAttribute('data-hq')); ev.preventDefault(); ev.stopImmediatePropagation(); }, true); return 1; })()");
    const hits = await J(j, "(function(){ var out = []; document.querySelector('#hp-rs .rs-golf [data-rs=\"q-addgolfer\"]').click(); out.push(window.__hits.splice(0)); document.querySelector('#hp-rs [data-rs=\"more\"]').click(); return out; })()");
    await sleep(300);
    hits.push(await J(j, "(function(){ document.querySelector('#hp-rs .rs-open .rs-li[data-rs=\"q-addgolfer\"]').click(); return window.__hits.splice(0); })()"));
    assert.deepEqual(hits, [['addgolfer'], ['addgolfer']], 'top and More click the same quick edit');
    await J1_reload(j);
    // ... and, let through, both open today's Add golfer sheet by HardPanAddGolfer.open.
    await j.evaluate("(function(){ window.__opens = 0; var f = HardPanAddGolfer.open; HardPanAddGolfer.open = function(){ window.__opens++; return f.apply(this, arguments); }; return 1; })()");
    for (const more of [false, true]) {
        await openSettings(j);
        if (more) { await j.evaluate("document.querySelector('#hp-rs [data-rs=\"more\"]').click()"); await sleep(300); }
        await j.evaluate("document.querySelector(" + JSON.stringify(more ? '#hp-rs .rs-open .rs-li[data-rs="q-addgolfer"]' : '#hp-rs .rs-golf [data-rs="q-addgolfer"]') + ").click()");
        assert.ok(await until(j, "!!document.querySelector('#hp-addg.open #ag-name')", 5000), 'the Add golfer sheet opened (' + (more ? 'More' : 'top') + ')');
        assert.equal(await j.evaluate("document.getElementById('round-sheet').classList.contains('open')"), false, 'Round settings closed under it');
        // URGENT-044: Round settings keeps the FULL sheet (the score sheet's "+ Add" is the short form).
        assert.equal(await j.evaluate("!!document.querySelector('#hp-addg.open:not(.ag-short) [data-ag=\"another\"]') && !!document.querySelector('#hp-addg [data-ag=\"paste\"]') && !!document.querySelector('#hp-addg .ag-plus') && !document.querySelector('#hp-addg .ag-from')"), true, 'the full Add golfer sheet: + Add another, Paste several (' + (more ? 'More' : 'top') + ')');
        await j.evaluate('HardPanAddGolfer.close()'); await sleep(300);
    }
    assert.equal(await j.evaluate('window.__opens'), 2, 'HardPanAddGolfer.open, once each');
});
// The catcher of test 7 stays on the page; a fresh page for the real taps.
async function J1_reload(j) {
    await j.goto(fileUrl('index.html', 'game=PRS21F&me=101'), 300);
    assert.ok(await until(j, "!!window.HardPanGps && HardPanGps.side() === 'gps' && HardPanGps.isMounted()", 30000), 'the map is up again');
    await sleep(1200);
}

test('8 a SOLO GPS round on hole 4: Menu > Round settings > + Add golfer -> name / HCP / tee; on the Card and score sheet from hole 4, 1-3 blank; games and money untouched', { timeout: 180000 }, async () => {
    const code = 'PRS21S';
    const { makeCourseData } = require('./helpers/fixtures.js');
    const CD = makeCourseData(18);
    const TEE = (name, y, rt, sl) => ({ name, rating: rt, slope: sl, parTotal: 72, totalYards: y, holes: CD.map((h) => ({ par: h.par, yardage: Math.round(y / 18) })) });
    const TEES = { male: [TEE('Blue', 6500, 71.0, 125), TEE('White', 6187, 69.0, 118)], female: [TEE('Red', 5645, 71.4, 120)] };
    // Start GPS, one golfer: holes 1-3 scored; the round's skins game and pot left as the fixture
    // has them, so "untouched" means something.
    const ev0 = wizardSavedRound({ code, golfers: 1, ownerUid: 'anon-cold', thru: 3, flights: false, names: ['Test Solo'], courseData: CD,
        overrides: { activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club (Caledonia)', groupSizeOverrides: { 0: 1 },
            teeRating: { teeKey: 'male:1', teeName: 'White', slope: 118, courseRating: 69.0, par: 72 }, handicapBasis: 'as-entered' } });
    const j = await gpsRound(code, '&me=101', ev0, { caledonia: { tees: TEES } });
    for (let k = 0; k < 18 && Number(await j.evaluate('HardPanGps.hole()')) !== 4; k++) { await j.evaluate('gpsStepHole(' + (Number(await j.evaluate('HardPanGps.hole()')) < 4 ? 1 : -1) + ')'); await sleep(600); }
    assert.equal(await j.evaluate('HardPanGps.hole()'), 4, 'on hole 4');
    // What the page SHOWS for the money (read only - nothing here is computed by the test).
    const POT = "(function(){ var t = document.body.innerText, m = t.match(/WEEKLY GAME[^\\n]*\\$\\d+/i), e = t.match(/Weekly Game · \\$\\d+ each/); return [m ? m[0] : null, e ? e[0] : null]; })()";
    const pot0 = await J(j, POT);
    const before = await J(j, '(function(){ var d = Object.assign({}, currentData); delete d.players; delete d.groupSizeOverrides; return d; })()');
    // Every write the page makes from here.
    await j.evaluate("(function(){ window.__w = []; var real = db.ref; db.ref = function (p) { var r = real.apply(db, arguments); var u = r.update, s = r.set;"
        + " r.update = function (v) { window.__w.push(['update', String(p), Object.keys(v || {}).sort()]); return u.apply(r, arguments); };"
        + " r.set = function (v) { window.__w.push(['set', String(p)]); return s.apply(r, arguments); }; return r; }; return 1; })()");
    // The taps, from the GPS screen: ☰ Menu, Round settings, + Add golfer.
    await j.evaluate("document.querySelector('#gps-overlay .gps-door-games').click()"); await sleep(600);
    assert.ok(await until(j, "!!document.querySelector('[data-hs-tile=\"settings\"]')", 5000), '1 tap: the Round Menu');
    await shot(j, 'solo-1-menu');
    await j.evaluate("document.querySelector('[data-hs-tile=\"settings\"]').click()");
    assert.ok(await until(j, "!!document.querySelector('#hp-rs .rs-golf [data-rs=\"q-addgolfer\"]')", 8000), '2 taps: Round settings, "+ Add golfer" on the Golfers row');
    await sleep(400);
    await shot(j, 'solo-2-round-settings');
    await j.evaluate("document.querySelector('#hp-rs .rs-golf [data-rs=\"q-addgolfer\"]').click()");
    assert.ok(await until(j, "!!document.querySelector('#hp-addg.open #ag-name') && document.querySelectorAll('#hp-addg [data-ag-tee]').length >= 3", 8000), '3 taps: the Add golfer sheet, with the course\'s tees');
    const typeIn = (sel, v) => j.evaluate('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); e.value=' + JSON.stringify(v) + '; e.dispatchEvent(new Event("input",{bubbles:true})); return 1;})()');
    await typeIn('#ag-name', 'Test Friend');
    await typeIn('#ag-hcp', '12');
    await j.evaluate("document.querySelector('#hp-addg [data-ag-tee=\"male:0\"]').click()"); await sleep(200);
    await shot(j, 'solo-3-add-golfer');
    await j.evaluate("document.querySelector('#hp-addg [data-ag=\"save\"]').click()");
    assert.ok(await until(j, "!document.querySelector('#hp-addg.open') && currentData.players.length === 2", 8000), 'saved and closed');
    await sleep(800);
    const s = await J(j, "{ hole: HardPanGps.hole(), side: HardPanGps.side(), p: currentData.players.map(function(p){ return [p.id, p.name, p.hcp, p.tee ? p.tee.teeName : null, p.playingForMoney]; }), groups: currentData.groupSizeOverrides,"
        + " mine: Object.keys(currentData.scores || {}).filter(function(k){ return /^p102_/.test(k); }), w: window.__w }");
    assert.equal(s.hole, 4, 'still on hole 4');
    // Round settings opens over the Card (gps-round.js openSettings -> toCard, as before #21): the
    // add lands back on the Card, the same hole.
    assert.equal(s.side, 'bets', 'on the Card, over the map');
    await shot(j, 'solo-4-card-after-add');
    const hv = await J(j, "Array.prototype.map.call(document.querySelectorAll('.hv-player-row .hv-player-name'), function(e){ return e.firstChild ? String(e.firstChild.nodeValue || e.textContent).trim() : ''; })");
    assert.deepEqual(hv, ['Test S.', 'Test F.'], 'the Card\'s Hole 4 lists the new golfer: ' + JSON.stringify(hv));
    // Back to the map for the score sheet.
    await j.evaluate("HardPanGps.showSide('gps')"); await sleep(900);
    assert.equal(await j.evaluate('HardPanGps.hole()'), 4, 'the map on hole 4');
    assert.deepEqual(s.p.map((p) => p.slice(0, 2)), [[101, 'Test Solo'], [102, 'Test Friend']]);
    assert.equal(s.p[1][2], '12');
    assert.match(String(s.p[1][3]), /Blue/, 'their own tee: ' + JSON.stringify(s.p[1]));
    assert.deepEqual(s.groups, { 0: 2 }, 'in the solo golfer\'s group');
    assert.deepEqual(s.mine, [], 'no score is written for the new golfer - holes 1-3 stay blank');
    assert.deepEqual(s.w.filter((x) => x[0] === 'update' || x[0] === 'set'), [['update', 'events/' + code, ['groupSizeOverrides', 'players']]], 'one write: the players and the groups, nothing else: ' + JSON.stringify(s.w));
    const after_ = await J(j, '(function(){ var d = Object.assign({}, currentData); delete d.players; delete d.groupSizeOverrides; return d; })()');
    const pot1 = await J(j, POT);
    console.log('# solo add: Weekly Game pot as shown, before -> after (the pool config is not written):', JSON.stringify(pot0), '->', JSON.stringify(pot1), '| new golfer playingForMoney =', s.p[1][4]);
    for (const k of ['scores', 'additionalGames', 'additionalGameInstances', 'moneyPool', 'sideMatches', 'holeBetStake', 'gameFormat', 'skinsBuyIn', 'kpWinners', 'teeRating', 'startingHole'])
        assert.deepEqual(after_[k], before[k], k + ' untouched');
    // THE SCORE SHEET on hole 4: the new golfer is there.
    await j.evaluate("document.querySelector('#gps-overlay .gps-score').click()"); await sleep(600);
    const sh = await J(j, "(function(){ var w=document.getElementById('hp-score-sheet'); if(!w||w.style.display==='none') return null; return { chips: Array.prototype.map.call(w.querySelectorAll('.hp-ss-chip'), function(c){ return c.getAttribute('data-ss-golfer'); }), hole: HardPanGps.hole() }; })()");
    assert.ok(sh, 'the score sheet opened');
    assert.deepEqual(sh, { chips: ['101', '102'], hole: 4 }, 'the score sheet on hole 4 has both golfers');
    await j.evaluate("document.querySelector('#hp-score-sheet [data-ss-golfer=\"102\"]').click()"); await sleep(300);
    await shot(j, 'solo-4-score-sheet');
    await j.evaluate("document.querySelector('#hp-score-sheet [data-ss-score=\"5\"]').click()"); await sleep(500);
    assert.equal(await j.evaluate("String((currentData.scores||{}).p102_h4)"), '5', 'a score for the new golfer saves on hole 4');
    await j.evaluate('HardPanGpsStats.sheet.close()'); await sleep(500);
    assert.equal(await j.evaluate("(function(){ var w=document.getElementById('hp-score-sheet'); return !w || w.style.display==='none'; })()"), true, 'the score sheet closed');
    await sleep(500);
    // THE CARD (the compact card over the map): holes 1-3 blank for the new golfer, 5 on hole 4.
    await j.evaluate("document.querySelector('#gps-overlay .gps-side-bets').click()"); await sleep(800);
    const card = await J(j, "[1,2,3,4,5].map(function(h){ return ['101','102'].map(function(p){ var i = document.querySelector('#hp-compact-card [data-cc-hole=\"'+h+'\"][data-cc-player=\"'+p+'\"]'); return i ? i.textContent : null; }); })");
    assert.ok(card.slice(0, 3).every((r) => r[0] !== '' && r[0] !== null), 'Test Solo\'s holes 1-3 still there: ' + JSON.stringify(card));
    assert.deepEqual(card.map((r) => r[1]), ['', '', '', '5', ''], 'the new golfer: blank 1-3, 5 on hole 4');
    assert.equal(await j.evaluate("(function(){ var c = document.getElementById('hp-compact-card'); if (!c) return false; var r = c.getBoundingClientRect(); return r.height > 0 && getComputedStyle(c).display !== 'none'; })()"), true, 'the Card is showing');
    await shot(j, 'solo-5-card');
    const writes = (await J(j, 'window.__w')).filter((x) => !(x[0] === 'update' && x[1] === 'events/' + code && x[2].join() === 'groupSizeOverrides,players'));
    assert.ok(writes.every((x) => /\/scores(\/|$)|p102_h4/.test(x[1] + ' ' + (x[2] || []).join())), 'after the add, only the hole-4 score is written: ' + JSON.stringify(writes));
});
