#!/usr/bin/env node
// ============================================================================
// SEND RESULTS, MEASURED COLD IN CHROME.
//
// receipt_send_button_test.js proves the pill renders into #receipt-actions on
// a finished round, not on a live one, with the right label, and that the press
// reaches the exporter. It cannot measure a rect or a font. This check opens
// settlement.html?game=SEND1 the way a golfer does (tools/lib/cold-arrival.js:
// bundles blocked, a stand-in injected, the page runs its own init) and reads:
//
//   finished round, 390px and 768px:
//     - the title's font-size and the pill's font-size (the pill is half)
//     - the title ONE line and CENTRED at both widths, with the pill on screen
//     - 768: the pill on the title's row (vertical centres within a few px)
//       390: the pill BELOW the title (option 3, 2026-09-16) - its top at or
//       under the title's bottom; at both, its right edge at the content edge
//       and narrower than a third of the row
//     - the breakpoint is where it was measured to be: at 488px the pill is on
//       the row and the title still centred; at 487px it has dropped below
//     - exactly one export button on the page, class receipt-send, not btn-primary
//     - the page does not scroll sideways
//   then, pressing the page's own pill with the exporter stubbed:
//     - exportOrPrint is reached; the roots carry every dollar on screen and
//       no root contains the pill
//   live round (9 holes), 390px:
//     - no export button anywhere; the title's rect is what it was on the
//       finished round (the row itself does not move the title)
//
// EXIT 0 PASS, 1 FAIL, 2 could not run.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = []; for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const NAMES = ['Marty Sharp', 'Scott Bell', 'Carp Dean', 'Randy Poe'];
function roundOf(thru) {
    const players = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: String((i % 4) * 3), playingForMoney: true }));
    const scores = {};
    players.forEach(p => CD.forEach(h => { if (h.hole <= thru) scores['p' + p.id + '_h' + h.hole] = 4; }));
    scores['p101_h1'] = 3;
    return { eventName: 'Weekend Round', roundDay: 'Monday', courseName: 'Camas Meadows', activeCourseKey: 'swwa_camasmeadows',
        gameFormat: 'stroke', courseData: CD, players, scores, settlementMode: 'whole-dollar',
        kpWinners: { h3: '101' }, kpConfirmed: { confirmed: true },
        moneyPool: { enabled: true, buyIn: 40, kp: { amount: 40, holes: [3] }, net: { amount: 70, places: [100] },
                     skins: { mode: 'remainder', scoring: 'net', carryOver: true } } };
}

const PROBE = `
(() => {
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height), cx: Math.round((b.left + b.right) / 2), cy: Math.round((b.top + b.bottom) / 2) }; };
  const t = document.getElementById('main-title');
  const c = document.querySelector('.container');
  const cs = c ? getComputedStyle(c) : null;
  const content = c ? { left: Math.round(c.getBoundingClientRect().left + parseFloat(cs.paddingLeft)), right: Math.round(c.getBoundingClientRect().right - parseFloat(cs.paddingRight)) } : null;
  const btns = Array.from(document.querySelectorAll('button')).filter(b => /printReceipt/.test(b.getAttribute('onclick') || ''));
  const btn = btns[0];
  const rg = document.createRange(); if (t) rg.selectNodeContents(t);
  const text = t ? r({ getBoundingClientRect: () => rg.getBoundingClientRect() }) : null;
  const money = s => (String(s || '').match(/\\$[0-9][0-9,]*(?:\\.[0-9][0-9])?/g) || []);
  return JSON.stringify({
    innerWidth, scrollWidth: document.documentElement.scrollWidth,
    row: r(document.getElementById('title-row')),
    content, title: r(t), titleText: t && t.innerText, titleFont: t && getComputedStyle(t).fontSize,
    titleLines: text ? Math.max(1, Math.round(text.height / (parseFloat(getComputedStyle(t).fontSize) * 1.15))) : null,
    titleCenterOffset: (t && content) ? Math.round((t.getBoundingClientRect().left + t.getBoundingClientRect().right) / 2 - (content.left + content.right) / 2) : null,
    buttons: btns.length, button: r(btn), buttonText: btn && btn.innerText, buttonFont: btn && getComputedStyle(btn).fontSize,
    buttonClass: btn && btn.className, buttonVisible: !!(btn && btn.getClientRects().length),
    screenMoney: money((c || document.body).innerText)
  });
})()`;

const PRESS = `
(() => {
  let captured = null; const real = window.RattleExport;
  window.RattleExport = { exportOrPrint: o => { captured = o; return true; } };
  const btn = Array.from(document.querySelectorAll('button')).find(b => /printReceipt/.test(b.getAttribute('onclick') || ''));
  if (btn) btn.click();
  window.RattleExport = real;
  const money = s => (String(s || '').match(/\\$[0-9][0-9,]*(?:\\.[0-9][0-9])?/g) || []);
  const roots = captured ? captured.roots : [];
  return JSON.stringify({ called: !!captured, title: captured && captured.title, rootCount: roots.length,
    rootIds: roots.map(x => x.id || x.className || x.tagName),
    exportMoney: money(roots.map(x => x.innerText).join(' ')),
    pillInRoots: roots.some(x => x.id === 'receipt-actions' || /printReceipt/.test(x.innerHTML || '')) });
})()`;

async function look(width, thru, press) {
    const db = { events: { SEND1: roundOf(thru) } };
    const r = await arriveCold({ url: fileUrl('settlement.html', 'game=SEND1'), db, viewport: { width, height: 844 },
        steps: press ? [{ expression: PROBE }, { expression: PRESS }] : [{ expression: PROBE }], settleMs: 3500 });
    if (!r.ok) return { ran: false, reason: r.reason };
    const v = r.value.map(x => JSON.parse(x));
    return { ran: true, probe: v[0], press: v[1] || null };
}

(async () => {
    const failures = [];
    const bail = why => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why }, null, 2)); process.exit(2); };
    const phone = await look(390, 18, true);
    const tablet = await look(768, 18, true);
    const live = await look(390, 9, false);
    const liveTablet = await look(768, 9, false);
    const edgeOn = await look(488, 18, false);
    const edgeOff = await look(487, 18, false);
    if (!phone.ran) bail('phone: ' + phone.reason);
    if (!tablet.ran) bail('tablet: ' + tablet.reason);
    if (!live.ran) bail('live: ' + live.reason);
    if (!liveTablet.ran) bail('live tablet: ' + liveTablet.reason);
    if (!edgeOn.ran || !edgeOff.ran) bail('edge: ' + (edgeOn.reason || edgeOff.reason));

    const finished = (label, m) => {
        const p = m.probe;
        if (p.buttons !== 1) { failures.push(`${label}: ${p.buttons} export buttons, wanted 1`); return; }
        if (!p.buttonVisible) failures.push(`${label}: the pill is not on screen`);
        if (p.buttonText !== '📤 Send') failures.push(`${label}: label is ${JSON.stringify(p.buttonText)}`);
        if (!/\breceipt-send\b/.test(p.buttonClass) || /btn-primary/.test(p.buttonClass)) failures.push(`${label}: class is ${p.buttonClass}`);
        const tf = parseFloat(p.titleFont), bf = parseFloat(p.buttonFont);
        if (Math.abs(bf - tf / 2) > 0.6) failures.push(`${label}: pill font ${bf}px is not half the title's ${tf}px`);
        if (label.startsWith('tablet') || label.startsWith('edge-on')) {
            if (Math.abs(p.button.cy - p.title.cy) > 4) failures.push(`${label}: pill centre ${p.button.cy} is not level with the title's ${p.title.cy}`);
        } else {
            if (p.button.top < p.title.bottom) failures.push(`${label}: the pill (top ${p.button.top}) is not below the title (bottom ${p.title.bottom})`);
        }
        if (Math.abs(p.button.right - p.content.right) > 2) failures.push(`${label}: pill right edge ${p.button.right} is not at the content edge ${p.content.right}`);
        if (p.button.width > (p.content.right - p.content.left) / 3) failures.push(`${label}: pill ${p.button.width}px wide is more than a third of the row`);
        if (p.scrollWidth > p.innerWidth) failures.push(`${label}: page scrolls sideways`);
        // The title keeps its line and its centre at EVERY width now: beside the
        // pill where the row has room (>= 488px), alone on its line with the pill
        // beneath where it does not (option 3).
        if (p.titleLines !== 1) failures.push(`${label}: the title wraps to ${p.titleLines} lines`);
        if (Math.abs(p.titleCenterOffset) > 1) failures.push(`${label}: the title's centre is ${p.titleCenterOffset}px off the container's`);
        if (!m.press.called) failures.push(`${label}: pressing the pill did not reach the exporter`);
        else {
            if (m.press.rootCount < 3) failures.push(`${label}: only ${m.press.rootCount} roots exported`);
            if (m.press.pillInRoots) failures.push(`${label}: the pill rode into the export`);
            const missing = p.screenMoney.filter(x => !m.press.exportMoney.includes(x));
            if (missing.length) failures.push(`${label}: dollars on screen missing from the export: ${JSON.stringify(missing)}`);
        }
    };
    finished('phone 390', phone);
    finished('tablet 768', tablet);
    // THE BREAKPOINT, measured on both sides of it.
    const on = edgeOn.probe, off = edgeOff.probe;
    if (!on.button || Math.abs(on.button.cy - on.title.cy) > 4) failures.push(`edge 488: the pill should be ON the row (title centre ${on.title && on.title.cy}, pill ${on.button && on.button.cy})`);
    if (on.titleLines !== 1 || Math.abs(on.titleCenterOffset) > 1) failures.push(`edge 488: title ${on.titleLines} lines, centre offset ${on.titleCenterOffset} - the row has room here and the title must be centred`);
    if (!off.button || off.button.top < off.title.bottom) failures.push(`edge 487: the pill should have dropped BELOW the title (title bottom ${off.title && off.title.bottom}, pill top ${off.button && off.button.top})`);
    if (off.titleLines !== 1 || Math.abs(off.titleCenterOffset) > 1) failures.push(`edge 487: title ${off.titleLines} lines, centre offset ${off.titleCenterOffset}`);
    [['live 390', live, phone], ['live 768', liveTablet, tablet]].forEach(([label, lv, fin]) => {
        const l = lv.probe;
        if (l.buttons !== 0) failures.push(`${label}: ${l.buttons} export buttons on a live round`);
        if (l.title.top !== fin.probe.title.top) failures.push(`${label}: the title's top moved between live and finished (${l.title.top} vs ${fin.probe.title.top})`);
        if (l.titleLines !== 1 || l.titleCenterOffset !== 0) failures.push(`${label}: title ${l.titleLines} lines, centre offset ${l.titleCenterOffset} with no pill`);
        if (l.row && l.row.height !== l.title.height) failures.push(`${label}: with no pill the row (${l.row.height}) is taller than the title (${l.title.height}) - an empty mount is taking space`);
    });

    const verdict = failures.length ? 'FAIL' : 'PASS';
    const geo = m => ({ row: m.probe.row, title: m.probe.title, titleTextLines: m.probe.titleLines, titleCenterOffset: m.probe.titleCenterOffset, pill: m.probe.button, content: m.probe.content });
    console.log(JSON.stringify({ verdict, failures, breakpoint: 'pill on the row from 488px, below the title to 487px', measured: {
        phone390: Object.assign({ titleFont: phone.probe.titleFont, pillFont: phone.probe.buttonFont, label: phone.probe.buttonText, class: phone.probe.buttonClass }, geo(phone), { export: phone.press }),
        tablet768: Object.assign(geo(tablet), { export: { rootCount: tablet.press.rootCount, rootIds: tablet.press.rootIds } }),
        edge488: geo(edgeOn), edge487: geo(edgeOff),
        live390: geo(live), live768: geo(liveTablet)
    } }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch(e => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String(e && e.message || e) }, null, 2)); process.exit(2); });
