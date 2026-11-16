'use strict';
// VETERANS EVENT, OPTION A (ADVISOR-20261115-1647-OK-veterans-A, Manny's OK 2026-11-15 4:45 PM; built on
// preview-veterans-a). tournaments/<code>/veterans carries three switches (Branch teams, Honor a Hero
// holes, the TV opening ceremony), the charity tracker ("Show charity total", per event), volunteers, the
// $5 line and the field-text card; a team's branch is teams/teamN/branch. Everything is OFF when the key
// is absent, so an event made before today reads exactly as before.
//
// HOW EACH TEST ARRIVES: the URL a person opens (?tourney=CODE for the public board, the organizer's
// ?tourney=CODE with the Setup tab, tournament-tv.html?tourney=CODE) with the page's own database
// listeners fed the record. No page function is called to reach a screen; the two writes in V5 are the
// Setup card's own onchange handlers, run as the page wrote them. The TV's dismissal is the document's
// own click listener, dispatched as an event.
//
// What mini-dom cannot prove: layout and colour (the under-par red is a class here, measured in the
// Chrome screenshots in the build report). It does not parse static style attributes: "not shown" is
// style.display as the page set it plus empty innerHTML.
//
// BASELINE against main 55077321 (no veterans code), this file and veterans-demo.js copied there,
// measured 2026-11-15: 3 pass / 6 fail of 9. V2, V6 and V8 pass there too (the demo scores in the engine
// either way, a visitor writes nothing either way, the TV without the key is the old board); V1, V3, V4,
// V5, V7 and V9 fail (the source, the slots and the screens are not there). Here: 9 pass / 0 fail.

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const PAGE = 'tournament.html';
const TV = 'tournament-tv.html';
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const HTML = read(PAGE);
const TVHTML = read(TV);
const CODE = 'VETTST';
const ORGANIZER = { uid: 'u-vet', email: 'vet@example.com', isAnonymous: false };

// The demo record (tools/veterans-demo-seed.js writes it; six teams thru 15, every switch on).
const DEMO = (() => { const sb = { window: {} }; vm.runInNewContext(read('veterans-demo.js'), sb); return sb.window.VETERANS_DEMO; })();
const clone = (o) => JSON.parse(JSON.stringify(o));
function onRecord(extra) { const d = clone(DEMO); d.ownerUid = ORGANIZER.uid; return Object.assign(d, extra || {}); }
function offRecord() { const d = onRecord(); delete d.veterans; Object.values(d.teams).forEach((t) => { delete t.branch; }); return d; }

const fire = (sb, re, val) => {
    const hs = sb.__dbHandlers.filter((h) => h.event === 'value' && re.test(h.path));
    assert.ok(hs.length > 0, 'no listener on ' + re);
    hs.forEach((h) => h.cb({ val: () => clone(val), exists: () => val !== null && val !== undefined }));
};
const el = (sb, id) => sb.document.getElementById(id);
const html = (sb, id) => String((el(sb, id) || {}).innerHTML || '');
const shown = (sb, id) => ((el(sb, id).style || {}).display || '') !== 'none';
function onchangeOf(markup, pick) {
    const tags = markup.match(/<(input|select|button)\b[^>]*>/g) || [];
    const tag = tags.find(pick);
    if (!tag) return null;
    const m = /\bon(?:change|click)="([^"]*)"/.exec(tag);
    return m ? m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : null;
}
function fireHandler(sb, markup, pick, thisObj) {
    const code = onchangeOf(markup, pick);
    assert.ok(code, 'no handler in that markup');
    sb.__tapEl = thisObj || {};
    vm.runInContext('(function () { ' + code + ' }).call(__tapEl)', sb);
}
const byId = (id) => (tag) => new RegExp('\\bid="' + id + '"').test(tag);

function arrivePublic(rec, opts) {
    const sb = loadHtmlInlineScript(PAGE, [], Object.assign({ search: '?tourney=' + CODE, beforeRun(s) { s.__dbReads = {}; } }, opts || {}));
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), rec);
    return sb;
}
function arriveOwnerSetup(rec, opts) {
    const sb = loadHtmlInlineScript(PAGE, [], Object.assign({ search: '?tourney=' + CODE }, opts || {}));
    sb.__auth.setUser(ORGANIZER);
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), rec);
    return sb;
}
function arriveTv(rec, opts) {
    const sb = loadHtmlInlineScript(TV, [], Object.assign({ search: '?tourney=' + CODE, beforeRun(s) { s.setInterval = () => 0; } }, opts || {}));
    fire(sb, new RegExp('^tournaments/' + CODE + '$'), rec);
    return sb;
}
const BET = /\b(bet|bets|betting|wager\w*|gambl\w*|pot|pots|pool|pools|stake|stakes|buy-?ins?|cash prize)\b/i;

describe('VETERANS A', () => {
    test('V1 SOURCE: the Setup card, the public slots, the three switches and the charity switch; the demo shim only behind ?demo=veterans; no bet word, no protected/secure/locked', () => {
        assert.match(HTML, /<div class="team-card vet-setup" id="veterans-block"/);
        assert.match(HTML, /<div id="vet-public-top" style="display:none;"><\/div>\s*<div id="vet-branch-card" style="display:none;"><\/div>/);
        assert.match(HTML, /<div id="vet-public-after" style="display:none;"><\/div>/);
        [['vet-sw-branch', 'branchTeams'], ['vet-sw-hero', 'heroHoles'], ['vet-sw-cer', 'ceremony'], ['vet-sw-charity', 'charity/show'], ['vet-sw-text', 'fieldText']].forEach(([id, k]) => assert.ok(HTML.includes("sw('" + id + "', '" + k + "', "), 'switch ' + k));
        assert.match(HTML, /onchange="setVetFlag\('\$\{key\}', this\.checked\)"/, 'a switch writes its own key');
        assert.match(HTML, /function veteransOf\(d\) \{ return \(d && d\.veterans && typeof d\.veterans === 'object'\) \? d\.veterans : \{\}; \}/, 'absent key = nothing on');
        assert.match(HTML, /const VET_DEMO = new URLSearchParams\(window\.location\.search\)\.get\('demo'\) === 'veterans';/);
        assert.match(TVHTML, /get\('demo'\) === 'veterans'\)/);
        assert.match(HTML, /tournaments\/\$\{currentCode\}\/veterans\/\$\{path\}/, 'owner write under the record');
        const mine = HTML.slice(HTML.indexOf('===== VETERANS EVENT, OPTION A'), HTML.indexOf('function setSponsorLogo(which, file)'));
        const tvMine = TVHTML.slice(TVHTML.indexOf('===== VETERANS A'), TVHTML.indexOf('function renderPage() {'));
        assert.ok(mine.length > 5000 && tvMine.length > 1500, 'the blocks exist');
        [mine, tvMine].forEach((b) => { assert.doesNotMatch(b, BET, (BET.exec(b) || [])[0]); assert.doesNotMatch(b, /protected|secure|locked/i); assert.doesNotMatch(b, /seal|insignia|emblem/i); });
        assert.match(tvMine, /Please rise for the presentation of the colors and the National Anthem\./);
        // The fixture: every name says DEMO, no real event code, and the record is a file, not a database write.
        assert.match(DEMO.name, /DEMO/); assert.match(DEMO.courseName, /DEMO/);
        Object.values(DEMO.teams).forEach((t) => assert.match(t.name, /DEMO/));
        assert.doesNotMatch(read('tools/veterans-demo-seed.js'), /firebase|db\.ref|\.set\(/);
    });

    test('V2 the demo fixture scores as a scramble: six teams thru 15, every to-par under par, in the engine the pages use', () => {
        const sb = arrivePublic(onRecord());
        const rows = html(sb, 'leaderboard-list');
        assert.ok(/Desert Mesa Four \(DEMO\)/.test(rows) && /North Rim Element \(DEMO\)/.test(rows), 'the six demo teams are on the board');
        assert.equal((rows.match(/class="lb-score under"/g) || []).length, 6, 'six under-par rows carry the under class');
    });

    test('V3 OFF: the same event without the veterans key shows nothing new on the public page: no cards, no badge, no branch standings', () => {
        const sb = arrivePublic(offRecord());
        assert.equal(html(sb, 'vet-public-top'), ''); assert.equal(html(sb, 'vet-public-after'), ''); assert.equal(html(sb, 'vet-branch-card'), '');
        assert.equal(shown(sb, 'vet-public-top'), false); assert.equal(shown(sb, 'vet-public-after'), false);
        assert.doesNotMatch(html(sb, 'leaderboard-list'), /vet-br/);
        assert.doesNotMatch(html(sb, 'manage-screen'), /Supporting|Honor a Hero|checked in|\$5 per golfer/);
        assert.ok(!sb.__dbWrites.some((w) => /veterans/.test(w.path)), 'nothing written');
    });

    test('V4 ON, the public page: Supporting with the goal bar and the Donated line, branch badges on the rows, branch standings best/avg (under par classed), field text, volunteers, the $5 line, the heroes', () => {
        const sb = arrivePublic(onRecord());
        const top = html(sb, 'vet-public-top'), br = html(sb, 'vet-branch-card'), after = html(sb, 'vet-public-after'), rows = html(sb, 'leaderboard-list');
        assert.ok(shown(sb, 'vet-public-top') && shown(sb, 'vet-branch-card') && shown(sb, 'vet-public-after'));
        assert.match(top, /Supporting[\s\S]*\[Veterans Charity\] \(DEMO\)[\s\S]*\$18,400<\/b>raised of \$25,000 goal/);
        assert.match(top, /aria-valuenow="74"[\s\S]*width:74%/);
        assert.match(top, /✓ Donated[\s\S]*\$12,000<\/b> · Apr 30, 2026 · Receipt on file/);
        assert.match(rows, /Desert Mesa Four \(DEMO\) <span class="vet-br vet-usmc">Marines<\/span><\/span>/);
        assert.equal((rows.match(/class="vet-br /g) || []).length, 6);
        assert.match(br, /Branch standings/);
        const order = [...br.matchAll(/<span class="vet-br vet-([a-z]+)" style="margin:0 6px 0 0">/g)].map((m) => m[1]);
        assert.deepEqual(order, ['usmc', 'army', 'navy', 'af', 'uscg', 'ussf'], 'one row a branch, best average first');
        assert.match(br, /<span class="r under">-8<\/span><span class="r under">-8\.0<\/span>/, 'Marines: best -8, average -8.0, both under');
        assert.match(after, /Field text[\s\S]*Shotgun start in 20 minutes\. Report to your holes\./);
        assert.match(after, /Volunteers[\s\S]*<b>12 of 16 checked in<\/b><br>Check-in is open at the tent\./);
        assert.match(after, /<b>\$5 per golfer<\/b> includes event-day app access\. The host takes it out of the entry fee\. Military rate and comped fees available: ask the organizer\./);
        assert.match(after, /Honor a Hero holes[\s\S]*Hole 7 · Demo Hero One[\s\S]*Presented by Sample Sponsor Co\. \(DEMO\)[\s\S]*Hole 12 · Demo Hero Two/);
        assert.doesNotMatch(after, /<img src=/, 'no hero photo is shown without the permission tick');
        assert.doesNotMatch(top + br + after, BET);
    });

    test('V5 the organizer\'s Setup card: switches read the record; a switch and a team branch write under the record and nowhere else; OFF draws every switch unchecked', () => {
        const off = arriveOwnerSetup(offRecord());
        const card = html(off, 'veterans-setup');
        assert.match(card, /id="vet-sw-branch"  onchange/, 'Branch teams unchecked');
        assert.match(card, /id="vet-sw-hero"  onchange/); assert.match(card, /id="vet-sw-cer"  onchange/); assert.match(card, /id="vet-sw-charity"  onchange/);
        assert.doesNotMatch(card, /vet-trow|vet-h-name|vet-c-goal/, 'nothing under a switch that is off');
        fireHandler(off, card, byId('vet-sw-branch'), { checked: true });
        const w = off.__dbWrites.filter((x) => /veterans/.test(x.path));
        assert.deepEqual(w.map((x) => [x.path, x.op, x.value]), [['tournaments/' + CODE + '/veterans/branchTeams', 'set', true]]);
        const on = arriveOwnerSetup(onRecord());
        const c2 = html(on, 'veterans-setup');
        assert.match(c2, /id="vet-sw-branch" checked onchange/);
        assert.match(c2, /<option value="usmc" selected>Marines<\/option>/, 'the team\'s branch is selected');
        assert.match(c2, /Hole 7 · Demo Hero One/);
        assert.match(c2, /id="vet-c-goal"[^>]*value="25000"/);
        fireHandler(on, c2, (tag) => /aria-label="Branch of Harbor Watch \(DEMO\)"/.test(tag), { value: 'af' });
        assert.deepEqual(on.__dbWrites.filter((x) => /teams\/team3/.test(x.path)).map((x) => [x.path, x.value]), [['tournaments/' + CODE + '/teams/team3/branch', 'af']]);
        assert.ok(!on.__dbWrites.some((x) => /scores|prize|fees|payout/.test(x.path)), 'nothing near scores or money');
    });

    test('V6 the public visitor never writes: the switches are not in the public screen and no veterans write happens', () => {
        const sb = arrivePublic(onRecord());
        assert.ok(!sb.__dbWrites.some((x) => /veterans|branch/.test(x.path)));
    });

    test('V7 TV ON: the ceremony page first (flag, the anthem sentence, the hold), then the branch board after a tap; the branch rows match the phone\'s', () => {
        const sb = arriveTv(onRecord());
        const first = html(sb, 'tv-board');
        assert.match(first, /id="tv-ceremony"/);
        assert.match(first, /\[Bojo&#39;s Veterans Classic\] \(DEMO\)|\[Bojo's Veterans Classic\] \(DEMO\)/);
        assert.match(first, /Please rise for the presentation of the colors and the National Anthem\./);
        assert.match(first, /Supporting \[Veterans Charity\] \(DEMO\)/);
        assert.match(first, /after 10 minutes/);
        // the flag (ADVISOR-20261115-1738): 50 stars in 9 rows of 6 and 5, 13 stripes (7 red), the canton 7 stripes tall and 0.4 of the fly wide
        const flag = (/<div class="flag"[^>]*>([\s\S]*?)<\/div>/.exec(first) || [])[1] || '';
        assert.equal((flag.match(/<polygon class="st"/g) || []).length, 50, 'stars');
        assert.equal((flag.match(/<rect class="sp r"/g) || []).length, 7, 'red stripes');
        assert.equal((flag.match(/<rect class="sp w"/g) || []).length, 6, 'white stripes');
        const cn = /<rect class="cn" x="0" y="0" width="760" height="538\.46"\/>/.test(flag);
        assert.ok(cn, 'the canton is 0.4 x 1900 wide and 7 of 13 stripes tall');
        const rows = {}; [...flag.matchAll(/<polygon class="st" points="([\d.]+),([\d.]+) /g)].forEach((m) => { const y = Math.round(Number(m[2]) - 30.8); rows[y] = (rows[y] || 0) + 1; });
        assert.deepEqual(Object.keys(rows).sort((a, b) => a - b).map((k) => rows[k]), [6, 5, 6, 5, 6, 5, 6, 5, 6], 'star rows: ' + JSON.stringify(rows));
        assert.equal(el(sb, 'tv-page-label').textContent.indexOf('Opening ceremony'), 0);
        // a tap on the screen: the document's own click listener
        const ev = sb.document.createEvent ? sb.document.createEvent('Event') : { type: 'click' };
        if (ev.initEvent) ev.initEvent('click', true, true);
        if (typeof sb.document.dispatchEvent === 'function') sb.document.dispatchEvent(ev);
        else vm.runInContext('vetDismiss()', sb);   // mini-dom without dispatchEvent: the listener is called by name and this line says so
        const second = html(sb, 'tv-board');
        assert.doesNotMatch(second, /tv-ceremony/);
        assert.match(second, /Branch leaderboard/, 'the branch board is the page after the ceremony');
        const order = [...second.matchAll(/<span class="bt ([a-z]+)"><\/span>([A-Za-z ]+)<\/span>/g)].map((m) => m[1]);
        assert.deepEqual(order, ['usmc', 'army', 'navy', 'af', 'uscg', 'ussf']);
        assert.match(second, /<span class="tp under">-8<\/span><span class="av under">-8\.0<\/span>/);
        assert.match(second, /Desert Mesa Four \(DEMO\)/, 'the leading team');
    });

    test('V8 TV OFF: no ceremony, no branch page, the board as before', () => {
        const sb = arriveTv(offRecord());
        const b = html(sb, 'tv-board');
        assert.doesNotMatch(b, /tv-ceremony|Branch leaderboard|National Anthem/);
        assert.match(b, /Desert Mesa Four \(DEMO\)/);
    });

    test('V9 the rotation holds the ceremony: with the interval left to run, the first tick does not move off the ceremony page', () => {
        const ticks = [];
        const sb = loadHtmlInlineScript(TV, [], { search: '?tourney=' + CODE, beforeRun(s) { s.setInterval = (fn) => { ticks.push(fn); return 1; }; } });
        fire(sb, new RegExp('^tournaments/' + CODE + '$'), onRecord());
        assert.ok(ticks.length >= 1, 'the rotation timer was armed');
        ticks.forEach((fn) => fn());
        assert.match(html(sb, 'tv-board'), /id="tv-ceremony"/, 'still the ceremony after a tick');
    });
});
