// ============================================================================
// A FRESH SKINS GAME DOES NOT CARRY - ON THE SCREEN, IN CHROME.
//
// skins_carry_wizard_default_test.js proves the state and the save under
// mini-dom, which cannot dispatch a click or paint a button. This check does
// the one thing a golfer does: opens a NEW round code, walks the wizard's own
// Next buttons to Games & Money, ticks "Skins" under Also Playing, and reads
// which of the two Ties buttons is filled in - by computed background colour,
// not by reading the markup back.
//
// THE RULE (CLAUDE.md): a device check may not call a function the page
// defines. Every step here is a click on the page's own control; the probe
// only reads.
//
//   node tools/skins-carry-wizard-check.js
//
//   exit 0   No Carry is the filled button on an untouched stacked skins game,
//            and the Step 6 card was actually on screen when it was read
//   exit 1   Carry Over is filled, or neither is, or the card was not visible
//   exit 2   could not run
// ============================================================================
const path = require('path');
const { arriveCold, fileUrl } = require(path.join(__dirname, 'lib/cold-arrival.js'));

const MUTE = { expression: "window.__alerts = []; window.alert = function (m) { window.__alerts.push(String(m)); }; window.confirm = function () { return true; }; 'muted'" };
const NEXT = (n) => ({ expression: "(function(){ var b = document.getElementById('wizard-next-" + n + "'); if (b) b.click(); return 'next-" + n + "'; })()" });
const TICK_SKINS = { expression: "(function(){ var cb = [...document.querySelectorAll('#stacked-games-list input[type=checkbox]')].find(c => /toggleStackedGame\\('skins'/.test(c.getAttribute('onchange') || '')); if (!cb) return 'no skins checkbox'; cb.click(); return 'ticked:' + cb.checked; })()" };
const PROBE = `(function(){
  var step6 = document.getElementById('wizard-step-6');
  var list = document.getElementById('stacked-games-list');
  var btns = [...list.querySelectorAll('button')].filter(b => /setSkinsCarry\\((true|false)\\)/.test(b.getAttribute('onclick') || ''));
  var green = getComputedStyle(document.documentElement).getPropertyValue('--brand-green').trim();
  return JSON.stringify({
    step6Display: step6 ? getComputedStyle(step6).display : 'no el',
    listRect: list ? (function(r){ return { w: Math.round(r.width), h: Math.round(r.height) }; })(list.getBoundingClientRect()) : null,
    buttons: btns.map(function (b) { var r = b.getBoundingClientRect(); return { onclick: b.getAttribute('onclick'), text: b.innerText.trim(), bg: getComputedStyle(b).backgroundColor, w: Math.round(r.width), h: Math.round(r.height) }; }),
    brandGreen: green,
    alerts: window.__alerts || []
  });
})()`;

function bail(msg, extra) { console.log('EXIT 2: ' + msg); if (extra) console.log(JSON.stringify(extra, null, 2)); process.exit(2); }

(async () => {
    const r = await arriveCold({ url: fileUrl('admin.html', 'game=CARRYCHK'), db: {}, settleMs: 5000,
        steps: [MUTE, NEXT(3), NEXT(4), NEXT(5), TICK_SKINS, { expression: PROBE }] });
    if (!r.ok) bail('admin.html did not run: ' + r.reason);
    let p; try { p = JSON.parse(r.value[5]); } catch (e) { bail('non-JSON probe', r.value); }
    const failures = [];
    console.log('arrival: fresh code CARRYCHK; steps: ' + r.value.slice(1, 5).join(', '));
    console.log('step 6 display: ' + p.step6Display + '; list ' + JSON.stringify(p.listRect));
    console.log('alerts on the way: ' + JSON.stringify(p.alerts));
    p.buttons.forEach(b => console.log('  ' + b.text.padEnd(12) + ' bg ' + b.bg + '  ' + b.w + 'x' + b.h + '  ' + b.onclick));
    if (p.step6Display !== 'block') failures.push('Games & Money is not on screen (display ' + p.step6Display + ') - the buttons below were read off-screen');
    if (p.buttons.length !== 2) failures.push('expected the two Ties buttons, found ' + p.buttons.length);
    const carry = p.buttons.find(b => /true/.test(b.onclick)), noCarry = p.buttons.find(b => /false/.test(b.onclick));
    const filled = (b) => b && b.bg !== 'rgba(0, 0, 0, 0)' && b.bg !== 'transparent';
    if (carry && filled(carry)) failures.push('Carry Over is the filled button on an untouched game (' + carry.bg + ')');
    if (noCarry && !filled(noCarry)) failures.push('No Carry is not filled on an untouched game (' + noCarry.bg + ')');
    if (p.buttons.some(b => b.h === 0)) failures.push('a Ties button has no height');
    if (failures.length) { console.log('EXIT 1'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
    console.log('EXIT 0: an untouched stacked skins game shows No Carry filled (' + (noCarry && noCarry.bg) + '), Carry Over empty (' + (carry && carry.bg) + ')');
    process.exit(0);
})().catch(e => bail(e && e.stack || String(e)));
