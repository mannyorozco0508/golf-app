// ============================================================================
// URGENT-010 (Manny): NO QUICK-START TILES. "$2 a skin" and the other quick-start
// game tiles (Add a game's QUICK START grid, the GPS screen's fallback sheet, Round
// Setup's "Quick start:" chips) are gone - Manny never uses them. Every game is
// still added from Add a game > ALL GAMES, which opens that game's normal setup.
// HardPan only (front-door.js / gps-view.js are GPS files).
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const skip = fs.existsSync(path.join(__dirname, 'gps-view.js')) ? false : 'Consumer tree: no Add a game sheet';
const code = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

test('Add a game (front-door.js) has no quick-start tiles, no $ / golfers sheet for them', { skip }, () => {
    const fd = code(read('front-door.js'));
    ['QUICK_STARTS', 'QUICK START', 'data-ag-q', 'ag-tile', 'fd-ag-cta', 'data-ag-amt', 'AG_AMTS', 'AG_DEF', 'agQuick', 'agConfig', 'agAdd', "'&agq='", 'hpfill', 'a skin'].forEach((x) =>
        assert.ok(!fd.includes(x), 'front-door.js still has ' + x));
    assert.match(fd, /'<div class="ag-h">PASTE<\/div>'/);
    assert.match(fd, /'<div class="ag-h">ALL GAMES<\/div>'/);
});

test('ALL GAMES still opens every game type the sheet had (Skins / Vegas / BBB / Wolf via ?tpl=)', { skip }, () => {
    const fd = read('front-door.js');
    const ids = [...fd.matchAll(/\{ id: '([a-z]+)', ico:/g)].map((m) => m[1]);
    ['points', 'nassau', 'match', 'strokebet', 'skins', 'vegas', 'bbb', 'wolf', 'dots', 'nines', 'kp', 'presses', 'side', 'bestball', 'stableford', 'scramble', 'hilo', 'ryder', 'cup'].forEach((id) =>
        assert.ok(ids.includes(id), 'ALL GAMES has ' + id));
    assert.match(fd, /if \(g\.go === 'tpl'\) return 'admin\.html' \+ base \+ '&tpl=' \+ g\.tpl;/);
    assert.match(fd, /if \(tpl && typeof W\.gpsApplyTemplate === 'function'\) \{\n\s*W\.gpsApplyTemplate\(tpl\);/);
    assert.match(read('admin.html'), /function gpsApplyTemplate\(id\) \{/, 'Round Setup keeps the template it opens');
    // Players first still goes on to the game picked (its url), never a quick-start sheet.
    assert.match(fd, /W\.location\.href = nx\.next && nx\.next\.url \? nx\.next\.url : 'index\.html\?game=' \+ encodeURIComponent\(code\);/);
});

test('the GPS screen’s own Add a game sheet and Round Setup have no quick-start tiles either', { skip }, () => {
    const gv = code(read('gps-view.js'));
    ['QUICK_STARTS', 'QUICK START', 'gps-ag-grid', 'data-ag-tpl'].forEach((x) => assert.ok(!gv.includes(x), 'gps-view.js still has ' + x));
    assert.match(gv, /data-ag-go="paste"/);
    assert.match(gv, /data-ag-go="full"/);
    const a = code(read('admin.html'));
    assert.ok(!/gps-bet-templates|class="gps-tpl"|\$2 Skins<\/button>/.test(a), 'Round Setup still has Quick start chips');
    assert.ok(!/hpfill/.test(code(read('sidematches.html'))), 'Side Matches no longer reads the Nassau quick start’s hpfill');
});
