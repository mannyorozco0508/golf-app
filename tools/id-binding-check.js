#!/usr/bin/env node
// ============================================================================
// DOES CAL STILL OWN CAL'S SCORES?
//
// THE ONLY CHECK IN THIS REPO THAT CAN PROVE ID-TO-NAME BINDING.
//
// A player's id is the primary key for money: scores live at p{id}_h{hole}, dots
// at dots/h{hole}/{id}, and side-match rosters and Cup membership are lists of
// ids. If a golfer's id changes, their scorecard changes hands. Nothing warns.
//
// player_id_stability_test.js proves the ID SEQUENCE is stable - that deleting
// the second of four leaves [101,103,104] rather than [101,102,103]. That is
// necessary but strictly weaker than the guarantee that matters: a sequence can
// be perfectly correct while the wrong golfer holds each number.
//
// WHY THE NODE SUITE CANNOT DO THIS. helpers/mini-dom.js stores innerHTML as a
// string and never parses it into child nodes. The name and handicap inputs are
// written into the row's innerHTML, so in that harness they are not real
// elements: row.querySelector('.p-name-input') returns null, and every name that
// captureCurrentPlayerInputs() reads back comes out ''. After any rebuild the
// harness has forgotten who is who. It can compare ids to ids and nothing more.
//
// A real browser has real inputs. So this types four names, clicks the real
// delete button on the middle row, and compares the NAME -> ID map of the
// survivors against what it was before. That is the actual guarantee.
//
// DELIBERATELY OUTSIDE `npm test`. It needs Chrome, and this project keeps a
// zero-extra-test-dependency rule. Run it by hand after any change to the player
// list, the wizard's roster handling, or the id issuer in admin.html.
//
//   node tools/id-binding-check.js
//
//   exit 0   PASS - every survivor kept the id it had
//   exit 1   FAIL - a golfer was repointed; the JSON names who and from what
//   exit 2   the check could not run (Chrome missing, page threw) - NOT a pass
//
// An exit of 2 means nothing was proven. Do not read it as green.
//
// Chrome is located at CHROME_PATH if set, else the standard macOS install.
// ============================================================================

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CDP_PORT || 9361);
const REPO_ROOT = path.join(__dirname, '..');
const PAGE = 'file://' + path.join(REPO_ROOT, 'admin.html');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'id-binding-'));

const SCRIPT = `
(() => {
  const out = {};
  const rows = () => Array.from(document.querySelectorAll('.player-row'));
  const NAMES = ['Ann', 'Bob', 'Cal', 'Dee'];

  // Four golfers, added and named the way a user does: tap Add, type a name.
  document.getElementById('player-list').innerHTML = '';
  NAMES.forEach(() => addNewPlayerAndRefresh());
  rows().forEach((r, i) => {
    r.querySelector('.p-name-input').value = NAMES[i];
    r.querySelector('.p-hcp-input').value = String(5 + i);
  });

  const mapOf = () => {
    const m = {};
    captureCurrentPlayerInputs().forEach(p => { m[p.name] = p.id; });
    return m;
  };

  out.before = mapOf();
  out.rowsBefore = rows().length;
  if (out.rowsBefore !== NAMES.length) {
    out.verdict = 'ERROR';
    out.error = 'expected ' + NAMES.length + ' rows, got ' + out.rowsBefore;
    return JSON.stringify(out, null, 2);
  }

  // The real delete control on the middle row - a genuine click, so the inline
  // onclick runs exactly as it does under a thumb.
  const victim = rows()[1];
  out.deletedName = victim.querySelector('.p-name-input').value;
  victim.querySelector('.btn-del').click();

  out.after = mapOf();
  out.rowsAfter = rows().length;

  // THE ASSERTION. Every survivor must still answer to the id it had.
  const moved = [];
  Object.keys(out.before).forEach(name => {
    if (name === out.deletedName) return;
    if (out.after[name] === undefined) { moved.push(name + ': vanished'); return; }
    if (out.after[name] !== out.before[name]) {
      moved.push(name + ': ' + out.before[name] + ' -> ' + out.after[name]);
    }
  });
  out.repointed = moved;

  // And nobody may inherit the id the deleted golfer left behind.
  out.inheritedDeletedId = Object.keys(out.after)
    .filter(n => out.after[n] === out.before[out.deletedName]);

  out.verdict = (moved.length === 0 && out.inheritedDeletedId.length === 0)
    ? 'PASS' : 'FAIL';
  return JSON.stringify(out, null, 2);
})()`;

function rpc(ws, id, method, params) {
    return new Promise(res => {
        const h = ev => {
            const m = JSON.parse(ev.data);
            if (m.id === id) { ws.removeEventListener('message', h); res(m); }
        };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

function bail(msg) {
    console.error('id-binding-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    if (!fs.existsSync(CHROME)) {
        bail('Chrome not found at ' + CHROME + ' (set CHROME_PATH to override)');
    }
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
        '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
        '--window-size=390,844', '--allow-file-access-from-files', PAGE],
        { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 250));
        try {
            const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
            targets = list.filter(t => t.type === 'page'
                && (t.url.startsWith('file://') || t.url.startsWith('http')));
            if (targets.length) break;
        } catch (e) { /* not up yet */ }
    }
    if (!targets || !targets.length) { chrome.kill(); bail('Chrome did not expose a page target'); }

    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    await new Promise(r => setTimeout(r, 2000));   // let admin.html settle

    const m = await rpc(ws, 1, 'Runtime.evaluate',
        { expression: SCRIPT, returnByValue: true });

    let code = 0;
    if (m.result && m.result.exceptionDetails) {
        const ex = m.result.exceptionDetails.exception;
        console.error('page threw: ' + JSON.stringify(ex && ex.description));
        code = 2;
    } else {
        const raw = m.result.result.value;
        console.log(raw);
        try {
            const v = JSON.parse(raw).verdict;
            code = v === 'PASS' ? 0 : (v === 'FAIL' ? 1 : 2);
        } catch (e) { code = 2; }
    }

    ws.close();
    chrome.kill();
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) { /* best effort */ }
    process.exit(code);
})();
