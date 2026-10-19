'use strict';
// URGENT-009, group C (mailbox 013 findings). Source-level guards for each fix; the journeys
// themselves are driven in Chrome by tools/games-button-check.js (013-4),
// tools/sim/setup-gps-first.js (013-4/-5/-13/-14/-15/-17/-19) and tools/front-door-check.js.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, 'missing: ' + a); const j = s.indexOf(b, i + a.length); return s.slice(i, j < 0 ? undefined : j); };

describe('013-4: a game added from the GPS Games pill comes back to the GPS', () => {
    test('the Games pill shows the card without remembering "bets" as the side this round left on', () => {
        const h = between(read('gps-view.js'), "on(el, '.gps-door-games'", "on(el, '.gps-ag-back'");
        assert.match(h, /showSide\('bets', \{ remember: false \}\)/);
        assert.doesNotMatch(h, /showSide\('bets'\);/);
    });
    test('a remember:false visit leaves the stored side alone (showSide)', () => {
        const f = between(read('gps-view.js'), 'function showSide(side, opts)', '\n    }\n');
        assert.match(f, /if \(!opts \|\| opts\.remember !== false\) rememberSide\(side\);/);
    });
});

describe('013-5 / 013-12: Side Matches Save goes back to the round', () => {
    const fd = read('front-door.js'), sm = read('sidematches.html');
    test('Add a game hands Side Matches &hpback=1 (All games rows and the Nassau quick start)', () => {
        assert.match(fd, /'sidematches\.html' \+ base \+ '&add=1' \+ \(g\.fmt \? '&fmt=' \+ g\.fmt : ''\) \+ '&hpback=1'/);
        assert.match(fd, /'sidematches\.html' \+ base \+ '&hpfill=1&hpback=1'/);
        // the Presses list is a list, not a Save: no hpback
        assert.match(fd, /if \(g\.go === 'smlist'\) return 'sidematches\.html' \+ base;/);
    });
    test('hpBackToRound goes to the scorecard of this round (keeping ?group=), only when asked', () => {
        const f = between(sm, 'function hpBackWanted()', '// BETS FROM A PASTED ROUND');
        assert.match(f, /urlParams\.get\('hpback'\) === '1'/);
        assert.match(f, /'index\.html\?game=' \+ encodeURIComponent\(currentMode\) \+ \(g \? '&group=' \+ encodeURIComponent\(g\) : ''\)/);
        assert.ok(sm.indexOf('function hpBackWanted()') > sm.lastIndexOf('// GPS:BEGIN', sm.indexOf('function hpBackWanted()')), 'inside a GPS block');
    });
    test('the side match Save: one group -> straight back; several groups -> the links sheet, whose Got It goes back', () => {
        const save = between(sm, "db.ref(`events/${currentMode}/sideMatches/${pushKey}`).set(payload)", '.catch(');
        assert.match(save, /if \(hpBackWanted\(\) && !\(\(currentData\.players \|\| \[\]\)\.length > 4\)\) \{[^}]*hpBackToRound\(\); return; \}/);
        assert.match(save, /openSideMatchLinksModal\(teamAIds, teamBIds\);/);
        assert.match(between(sm, 'function closeSideMatchLinksModal()', '\n    }\n'), /if \(hpBackToRound\(\)\) return;/);
    });
    test('Dots / Skins / 9 Points (field games) go back after their Save too', () => {
        const save = between(sm, 'db.ref(`events/${currentMode}/additionalGameInstances/${key}`).set(entry)', '.catch(');
        assert.match(save, /closeSideMatchModal\(\);[\s\S]*if \(hpBackWanted\(\)\) \{[^}]*hpBackToRound\(\); \}/);
    });
    test('the "send each player their own group\'s link" line is shown only on a round of several groups', () => {
        assert.match(sm, /<p id="sm-links-intro"[^>]*>Send each player their own group's scorecard link/);
        assert.match(between(sm, 'function openSideMatchLinksModal(', 'function copySideMatchLink'), /intro\.style\.display = isMultiGroup \? '' : 'none';/);
    });
});

describe('013-15: one "Starts on" on the Dots sheet', () => {
    const sm = read('sidematches.html');
    test('the match picker is hidden for a field game, which has its own', () => {
        assert.match(sm, /<div class="control-group" id="sm-start-hole-group"[^>]*>\s*<label>Starts on<\/label>\s*<select id="sm-start-hole"/);
        assert.match(between(sm, 'function onSideMatchFormatChange', 'const skinsOnly'), /startBox\.style\.display = fieldGame \? 'none' : 'block';/);
    });
    test('the Dots stake default is untouched ($10)', () => {
        assert.match(sm, /<input type="number" id="sm-field-stake" value="10"/);
    });
});

describe('013-14: one "+ Add a game" on the card', () => {
    test('Today\'s games adds "+ Add game" only when the round has games (else the GPS-3 strip has it)', () => {
        const f = between(read('front-door.js'), 'function todaysGamesAdd(mount)', 'function agList()');
        assert.match(f, /if \(card && !hasGames\(agRound\(\)\)\) \{[^}]*removeChild[^}]*\}/);
        assert.match(between(read('front-door.js'), 'function gpsRoundStrip(data)', '\n    }\n'), /if \(hasGames\(data\)\) return '';/);
    });
});

describe('013-13 / 013-19: Players first', () => {
    const f = between(read('front-door.js'), 'function agNeedBanner(nx)', 'function agOpenPool()');
    test('the banner stays on screen while golfers are typed below it (sticky)', () => {
        assert.match(f, /box\.style\.cssText = '[^']*position:sticky; top:0;/);
    });
    test('the banner is scrolled into view when the step opens', () => {
        assert.match(f, /box\.scrollIntoView\(\{ block: 'start' \}\)/);
        assert.match(f, /setTimeout\(show, 350\)/);
    });
    test('the Players step\'s own Next says and does "Save golfers · set up <game>"', () => {
        assert.match(f, /nextBtn\.textContent = 'Save golfers \\u00b7 set up ' \+ nx\.name/);
        assert.match(f, /nextBtn\.onclick = function \(ev\) \{ if \(ev\) ev\.preventDefault\(\); go\(\); \};/);
    });
});

describe('013-17: the round\'s creator is not asked "Who are you?"', () => {
    const g = read('gps-view.js');
    test('creatorHere is the uid that made the round, nothing else', () => {
        const f = between(g, 'function creatorHere(d)', '\n    }\n');
        assert.match(f, /d\.ownerUid && String\(d\.ownerUid\) === String\(uid\)/);
        assert.doesNotMatch(f, /organizer|token/i);
    });
    test('maybeAskWho skips the ask when golfer 1 is in this phone\'s group', () => {
        const f = between(g, 'function maybeAskWho()', 'function flipGolfer');
        assert.match(f, /if \(creatorHere\(d\)\) \{ var p0 = d\.players\[0\], lg = lockedG\(\); if \(p0 && \(!lg \|\| groupOf\(p0\.id\) === lg\)\) return; \}\s*openWho\(true\);/);
    });
});

describe('013-12 / 013-20: wording', () => {
    const a = read('admin.html');
    test('Round Ready names Home\'s button: Join', () => {
        assert.match(a, /in the app, type it in and tap Join, then pick your group\./);
        assert.doesNotMatch(a, /tap Open and pick your group/);
    });
    test('Save on a round that already exists says "Save changes"', () => {
        const f = between(a, 'function syncWizardNavLabels()', 'function syncFormatCards()');
        assert.match(f, /saved = loadedPlayerCount > 0/);
        assert.match(f, /saved \? '\\uD83D\\uDCBE Save changes' : '\\uD83D\\uDCBE Save \\u0026 Start Round'/);
        assert.match(a, /loadedPlayerCount = \(isThisRound[^\n]*\n\s*try \{ syncWizardNavLabels\(\); \}/);
    });
    test('no "Action tab" that does not exist; the Players note does not assume a Weekly Game', () => {
        assert.doesNotMatch(a, /Set up who's in on the Action tab/);
        assert.match(a, /every whole-field game \(the Weekly Game too, if you set one up\)\./);
    });
    test('URGENT-010: Players says the Weekly Game\'s skins are paid within each flight', () => {
        assert.match(a, /Side matches never use flights\. The Weekly Game&rsquo;s skins are paid within each flight\.<\/p>/);
        assert.doesNotMatch(a, /Weekly Game never uses? flights/);
    });
});
