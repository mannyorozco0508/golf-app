// ============================================================================
// P1-c: THE WEBSITE CARD WITHOUT APP MODE IS UNCHANGED (2026-11-10)
//
// App mode is a second view of the same page. A golfer who opens a team link
// in a browser - no Capacitor, no ?app=1 - must get exactly the card they got
// before this wave. "Exactly" is measured, not described: the page as it stood
// at p1-base 48121bea and the page as it stands now are opened cold, side by
// side, in real headless Chrome, with the SAME database, and what a golfer
// SEES (body innerText - rendered text only, CLAUDE.md) is compared whole,
// on the untouched card and again after a real tap on the Leaderboard tab.
// Three cards: a shotgun scramble, a best ball, and a two-round group link
// with flights. The existing scorecard suites (wired, lock, offline queue,
// next hole, golfer board ...) stay green on top of this.
//
// The p1-base page is read with `git show 48121bea:tournament-scorecard.html`
// into a temp folder beside copies of the scripts it loads (they are the same
// bytes - this wave changes none of them), so both pages run the same engine.
//
// WHAT IT CANNOT SEE: styling that changes no text (a colour or a size). The
// app rules are all scoped to body.app-mode, which the website never sets -
// the second test holds that and that the hidden #app-view takes no space.
//
// TESTS: 4. Needs Chrome and the p1-base commit in this clone; without either
// the tests are skipped and prove nothing.
//
// BASELINE against p1-base 48121bea (that page swapped in by cp, restored by
// cp, sha be5e9e7e... RESTORED-OK): all 4 tests: 3 PASS / 1 FAIL.   3 + 1 = 4.
// The three text comparisons are green by design (the page against its own
// past); test 2 fails there because #app-view did not exist yet. The proof
// is the controls:
//   C9  app mode forced on for every visitor (APP_MODE = true)   4 fail CAUGHT
//   C10 the website hole list hidden by an unscoped app rule
//       (`#main-content > :not(#app-view)` without body.app-mode)  - measured 4 fail CAUGHT
// ============================================================================
'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { arriveCold, fileUrl, REPO_ROOT } = require('./tools/lib/cold-arrival.js');
const F = require('./helpers/app-card-fixtures.js');

const BASE = '48121bea';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let baseHtml = null;
try { baseHtml = execFileSync('git', ['show', BASE + ':tournament-scorecard.html'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { baseHtml = null; }
const SKIP = !fs.existsSync(CHROME) ? 'Chrome not found - proves nothing'
    : (!baseHtml ? 'p1-base ' + BASE + ' is not in this clone - proves nothing' : false);

let dir = null;
before(() => {
    if (SKIP) return;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p1-website-base-'));
    fs.writeFileSync(path.join(dir, 'tournament-scorecard.html'), baseHtml);
    ['handicap.js', 'payouts.js', 'text-safe.js', 'tournament-engine.js', 'offline-queue.js', 'tournament-manifest.json', 'tournament-icon-192.png', 'tournament-icon-180.png']
        .forEach((f) => fs.copyFileSync(path.join(REPO_ROOT, f), path.join(dir, f)));
});
after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

// RE-PINNED 2026-11-12 (Get HardPan A + B, Manny): the banner under the pills
// and the two reasons cards are the website card's deliberate additions. They
// are hidden for the measurement (text and height), so everything else on the
// card is still held identical to p1-base; `getapp` says they exist on today's
// page and not on the base page, which is the positive control for the mask.
const SEEN = { expression: `JSON.stringify((function () {
  var ids = ['getapp-bar', 'getapp-card-card', 'getapp-card-board'];
  var els = ids.map(function (i) { return document.getElementById(i); }).filter(Boolean);
  var saved = els.map(function (e) { var d = e.style.display; e.style.display = 'none'; return d; });
  var out = { getapp: els.length, text: document.body.innerText, appMode: document.body.classList.contains('app-mode'),
  appView: (function () { var e = document.getElementById('app-view'); if (!e) return 'absent'; var r = e.getBoundingClientRect(); return getComputedStyle(e).display + ' ' + r.width + 'x' + r.height; })(),
  boxes: document.querySelectorAll('#holes-list input').length, mainH: Math.round(document.getElementById('main-content').getBoundingClientRect().height) };
  els.forEach(function (e, i) { e.style.display = saved[i]; });
  return out; })())` };
const STEPS = [{ sleep: 300 }, SEEN, { tap: '#tab-btn-leaderboard' }, { sleep: 300 }, SEEN];

async function both(query, db) {
    const now = await arriveCold({ url: fileUrl('tournament-scorecard.html', query), db, settleMs: 1500, steps: STEPS });
    const was = await arriveCold({ url: 'file://' + path.join(dir, 'tournament-scorecard.html') + '?' + query, db, settleMs: 1500, steps: STEPS });
    assert.ok(now.ok && was.ok, 'a cold arrival did not run: ' + (now.reason || was.reason));
    // The board's "last update" clock is the only text that may differ (two
    // loads a few seconds apart can straddle a minute), so it is masked.
    const clock = (o) => Object.assign(o, { text: o.text.replace(/\d{1,2}:\d{2}(\s?[AP]M)?/g, 'HH:MM') });
    const p = (r) => [clock(JSON.parse(r.value[1])), clock(JSON.parse(r.value[4]))];
    return { now: p(now), was: p(was) };
}

describe('the website card, no app mode: what a golfer sees is what p1-base showed', { skip: SKIP }, () => {
    test('shotgun scramble (team link, keyed): card and leaderboard text identical', async () => {
        const r = await both('tourney=SCR&team=4&k=' + F.KEY4, F.scrambleDb());
        assert.equal(r.now[0].getapp, 3, 'positive: today\'s page has the Get HardPan banner and two cards (masked below)');
        assert.equal(r.was[0].getapp, 0, 'p1-base had none');
        assert.ok(r.now[0].boxes === 18 && /Next: Hole 7/.test(r.now[0].text), 'positive control: the card rendered');
        assert.equal(r.now[0].text, r.was[0].text);
        assert.equal(r.now[1].text, r.was[1].text);
    });

    test('no app-mode class, #app-view display:none and 0x0, the card the same height as before', async () => {
        const r = await both('tourney=SCR&team=4', F.scrambleDb());
        assert.equal(r.now[0].appMode, false);
        assert.equal(r.now[0].appView, 'none 0x0');
        assert.equal(r.was[0].appView, 'absent');
        assert.ok(r.now[0].mainH > 500, 'positive control: the card has height');
        assert.equal(r.now[0].mainH, r.was[0].mainH);
    });

    test('best ball (one box per golfer): identical', async () => {
        const r = await both('tourney=BBL&team=3', F.bestBallDb());
        assert.ok(r.now[0].boxes === 54, 'positive control: 18 holes x 3 golfers, got ' + r.now[0].boxes);
        assert.equal(r.now[0].text, r.was[0].text);
        assert.equal(r.now[1].text, r.was[1].text);
    });

    test('two-round group link with flights: identical', async () => {
        const r = await both('tourney=FLT&group=g3&round=r2', F.groupDb());
        assert.ok(r.now[0].boxes === 36, 'positive control: 18 holes x 2 golfers, got ' + r.now[0].boxes);
        assert.equal(r.now[0].text, r.was[0].text);
        assert.equal(r.now[1].text, r.was[1].text);
    });
});
