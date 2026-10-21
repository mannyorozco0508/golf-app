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
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const journeys = [];
after(async () => { for (const j of journeys) { try { await j.close(); } catch (e) {} } });
async function until(j, expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { try { if (await j.evaluate(expr)) return true; } catch (e) {} await sleep(200); } return false; }
const J = async (j, expr) => JSON.parse(await j.evaluate('JSON.stringify(' + expr + ')'));

async function gpsRound(code, query) {
    const pre = 'window.__hardpanDoors = true; window.__simpleFlow = true;' + iapStub({ active: true }) + CFG + GEO
        + "try{localStorage.setItem('golfapp_me_" + code + "','101');sessionStorage.setItem('groupPickDismissed:" + code + "','1');"
        + "localStorage.setItem('hardpan_round_side','gps|" + code + "');}catch(e){}";
    const j = await openJourney({ db: { events: { [code]: round(code) }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, viewport: { width: 393, height: 852 }, webgl: true, preScript: pre });
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
        + " topStill: !!document.querySelector('#hp-rs > [data-rs=\"q-players\"]'), endShown: getComputedStyle(document.getElementById('hp-rs-end')).display }");
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
