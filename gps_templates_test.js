// ============================================================================
// HARDPAN - BET TEMPLATES (gps-features): ONLY a shortcut into the existing setup
//
// "$5 Nassau", "$2 Skins", "$1 Wolf" pick an existing game card and type amounts
// into existing fields - no new game type, no money engine, settlement or
// side-bet change. HardPan only (a GPS block). Vegas does not exist as a game in
// this app, so there is no Vegas template (it would need a new engine).
// ============================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const ON = fs.existsSync(path.join(__dirname, 'gps-view.js'));
const skip = ON ? false : 'Consumer tree: no HardPan templates';

test('the templates call only what the setup screens already do; Vegas / BBB only as their own instances', { skip }, () => {
    const a = read('admin.html');
    const block = a.slice(a.indexOf('const GPS_TEMPLATES'), a.indexOf('// NOTHING FROM THE PREVIOUS FORMAT MAY FOLLOW'));
    assert.ok(block.length > 500, 'positive: the template block was found');
    assert.deepEqual([...block.matchAll(/format: '([a-z-]+)'/g)].map((m) => m[1]), ['nassau-modern', 'stroke', 'wolf'], 'existing format tokens only');
    ['selectFormatCard(', 'addSkinsInstance()', 'setInstanceField(', "gpsSetField('setup-nassau-front'", "gpsSetField('wolf-point-value'"].forEach((x) => assert.ok(block.includes(x), x));
    assert.ok(!/db\.ref|calculate|settle|engine|payout/i.test(block), 'no database writes, no engine / settlement call');
    // Vegas / Bingo Bango Bongo (gps-games) are NOT format cards: their templates add an
    // instance through extra-games-ui.js (its own engines), never a game-format token.
    assert.ok(!/data-format="(vegas|bbb)"|value="(vegas|bbb)"/i.test(a), 'no Vegas / BBB format card or option');
    // GPS-4's Quick start may pass its $ and golfers (window.__hpTplOpts); without them, $1 and everyone.
    assert.ok(/HardPanExtraGames\.addGame\(foreignGameInstances, id, picked \|\| all, o && o\.amt \? o\.amt : 1\)/.test(block) && /const all = collectWizardPlayers\(\);/.test(block), 'the BBB / Vegas templates add their own instance');
    const consumer = require('./tools/gps-flag.js').applyFlag(a, false);
    assert.ok(!/gpsApplyTemplate|gps-bet-templates|gpsTemplateArrive/.test(consumer), 'HardPan only');
});

test('no money engine, settlement or side-bet file differs from gps-live (acfe6c6)', { skip }, () => {
    let changed;
    try { changed = cp.execSync('git diff --name-only acfe6c6 -- money-engine.js settlement-engine.js match-engine.js pool-engine.js payouts.js live-skins.js side-match-lines.js aloha-bet.js action-model.js trip-pots.js', { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch (e) { return; }   // not a git checkout (a copied tree): nothing to compare
    // URGENT-011 (approved, 2026-10-19): the skins carry follows the order played.
    // settlement-engine.js and pool-engine.js moved for that fix ONLY - accepted
    // at exactly these contents, so any other edit still fails here.
    // 2026-10-19 Manny OK: gameHoles play order - action-model.js accepted at exactly these contents.
    // 2026-10-19 Manny OK: "side matches use play order (sideMatchHoles), hole-1 rounds unchanged" -
    // action-model.js, settlement-engine.js, money-engine.js and side-match-lines.js accepted at exactly these contents.
    const APPROVED = { 'settlement-engine.js': '50ca7e5c', 'pool-engine.js': '1530a0b9', 'action-model.js': '39d4a40c',   // 2026-10-29 Manny typed OK (100c): settlement-engine.js Vegas/BBB in Settle up for inSettle games + match-mode receipt lines, was 07cea71d; action-model.js Wolf side game in the catalog (sideGameOnly), was bb89aa4c
        'money-engine.js': 'cfd3f365', 'side-match-lines.js': 'b555fbf5' };   // 2026-10-29 Manny typed OK (100c): money-engine.js Wolf side-game pick-order rotation + 2b press line, was ae0bfcd9
    const sha8 = (f) => require('crypto').createHash('sha256').update(read(f)).digest('hex').slice(0, 8);
    changed = changed.split('\n').filter(f => f && !(APPROVED[f] && sha8(f) === APPROVED[f])).join('\n');
    assert.equal(changed, '', 'engine files untouched');
});
