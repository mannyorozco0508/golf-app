#!/usr/bin/env node
// ============================================================================
// WHERE DOES THE KP ENTRY SIT, AND WHAT DID IT PUSH DOWN?
//
// THIS CHECK ARRIVES COLD, at 390 px. It opens the scorecard a golfer opens,
// with a round whose Weekly Game has a $100 KP pot on the par 3s and whose
// first six holes are scored, so the page lands itself on hole 7 - a KP hole.
// It TOUCHES NOTHING to get there. Then it presses Next, the way a thumb does,
// to reach hole 8 - not a KP hole - and Prev to come back. Every number below
// is a rect the browser laid out; the page's own functions are never called.
//
// WHAT IT MEASURES, per hole
//   - the hole heading: where it sits in the document and, after a navigation,
//     in the viewport (the LANDING - landOnHole scrolls the heading to a fixed
//     offset; the block is below the heading, so the landing must not move)
//   - the Prev/Next row's rect
//   - #kp-entry-mount: the element directly after the nav row, its rect, the
//     head it shows, and the gap from the row's bottom edge
//   - the Dots KP line and Dots button, when the round plays Dots (the second
//     arm) - the two KP lines now share the nav row's shadow, and the report
//     says how they read together
//   - the recap banner, the skins panel, the Action Center and the bet strip:
//     what the block pushed down, by how much
//
// A/B. Run it twice - once against index.html, once against a copy of HEAD's
// index.html placed at the repo root - and the difference in the recap's top
// is the block's height; the difference in the landing must be 0.
//
//   node tools/kp-entry-position-check.js [page] [arm]
//     page   index.html (default) or another file at the repo root
//     arm    pool (default) | dots | picker  - the Weekly Game alone, with a Dots
//            game, or with the picker OPEN (a real tap on Set KP Leader) so the
//            select, the ft/in boxes and Save KP are measured - computed font
//            sizes and rects - and the block's open height is on record
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON lists which guarantee broke
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const PAGE = process.argv[2] || 'index.html';
const ARM = process.argv[3] || 'pool';

const PAR3 = [3, 7, 12, 16];
const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: PAR3.indexOf(i) >= 0 ? 3 : 4, hcpIndex: i });
const PLAYERS = [
    { id: 101, name: 'Ann Adams', hcp: '2', playingForMoney: true }, { id: 102, name: 'Bob Brown', hcp: '6', playingForMoney: true },
    { id: 103, name: 'Cal Clark', hcp: '9', playingForMoney: true }, { id: 104, name: 'Dee Dunn', hcp: '14', playingForMoney: true }];
// Six holes scored: the page lands on hole 7, the first unscored one, on its own.
const scores = {};
PLAYERS.forEach(p => { for (let h = 1; h <= 6; h++) scores['p' + p.id + '_h' + h] = h === 3 ? 3 : 5; });

const ROUND = {
    eventName: 'KP Position Check', gameFormat: ARM === 'dots' ? 'dots' : 'stroke',
    players: PLAYERS, courseData: CD, scores: scores, settlementMode: 'whole-dollar',
    moneyPool: { enabled: true, buyIn: 40,
        kp: { amount: 100, holes: PAR3 }, net: { amount: 0 },
        skins: { mode: 'remainder', scoring: 'net', carryOver: false } },
};
if (ARM === 'dots') { ROUND.dotPointVal = 2; ROUND.startHole = 1; }
const ROUNDS = { KPCHECK: ROUND };

// Every rect in DOCUMENT coordinates (top + scrollY), so two holes and two
// pages compare. viewportTop is the heading's position on screen - the landing.
const MEASURE = `
(() => {
  const sy = window.scrollY || window.pageYOffset || 0;
  const doc = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + sy), bottom: Math.round(r.bottom + sy), height: Math.round(r.height), width: Math.round(r.width), viewportTop: Math.round(r.top) }; };
  const host = document.getElementById('hole-view-card');
  const q = (s) => host ? host.querySelector(s) : null;
  const heading = q('.hole-view-header');
  const nav = q('.hole-view-nav-row');
  const mount = document.getElementById('kp-entry-mount');
  const block = mount ? mount.querySelector('.kp-block') : null;
  const out = {
    hole: heading ? (heading.querySelector('.hv-hole-num') || heading).innerText.trim() : null,
    scrollY: Math.round(sy),
    docHeight: Math.round(document.documentElement.scrollHeight),
    heading: doc(heading),
    navRow: doc(nav),
    mount: doc(mount),
    mountIsNextAfterNav: !!(nav && mount && nav.nextElementSibling === mount),
    mountChildren: mount ? mount.children.length : null,
    block: doc(block),
    blockHead: block ? (block.querySelector('.kp-head') || {}).innerText || null : null,
    blockText: block ? block.innerText.replace(/\\s+/g, ' ').trim() : null,
    gapNavToBlock: (nav && block) ? Math.round(block.getBoundingClientRect().top - nav.getBoundingClientRect().bottom) : null,
    dotsKpLine: q('.kp-live') ? { text: q('.kp-live').innerText.replace(/\\s+/g, ' ').trim(), rect: doc(q('.kp-live')) } : null,
    dotsButton: q('.hv-dots-btn') ? { text: q('.hv-dots-btn').innerText.trim(), rect: doc(q('.hv-dots-btn')) } : null,
    recap: doc(document.querySelector('#hole-recap-mount > *')),
    liveSkins: doc(document.querySelector('#live-skins-mount > *')),
    actionCenter: doc(document.querySelector('#action-center-mount > *')),
    betStrip: doc(document.querySelector('#bet-strip-mount > *')),
    setKpButton: block ? !!block.querySelector('.kp-btn') : false,
    // THE PICKER'S CONTROLS, when open: computed type size and box of each, so a
    // legibility change is a number before and after, not an adjective.
    picker: (() => {
      if (!block || !block.querySelector('.kp-select')) return null;
      const one = (sel) => { const el = block.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        return { fontPx: parseFloat(cs.fontSize), h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top + sy), pad: cs.paddingLeft + '/' + cs.paddingTop, border: cs.borderTopWidth + ' ' + cs.borderTopColor, radius: cs.borderTopLeftRadius, weight: cs.fontWeight, text: (el.innerText || el.value || el.placeholder || '').split(/\\s+/).join(' ').trim().slice(0, 40) }; };
      const n = ((heading && heading.querySelector('.hv-hole-num')) ? heading.querySelector('.hv-hole-num').innerText : '').replace('Hole', '').trim();
      return { select: one('.kp-select'), ft: one('#kp-ft-' + n), inch: one('#kp-in-' + n), distLabel: one('.kp-dist-label'), save: one('.kp-btn'), cancel: one('.kp-cancel'), head: one('.kp-head'), current: one('.kp-current'), options: block.querySelector('.kp-select').options.length };
    })(),
    // THE STACK under the nav row: every element child of the hole card from the
    // row down, and the first child of each mount, so "what moved down" is read
    // off one list rather than guessed from the named panels above.
    stack: (() => {
      if (!host || !nav) return null;
      const rows = []; let el = nav;
      while (el) {
        const r = el.getBoundingClientRect();
        const name = (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : '') || el.tagName.toLowerCase();
        const inner = el.id && /-mount$/.test(el.id) && el.firstElementChild ? ' > .' + String(el.firstElementChild.className).split(' ')[0] : '';
        rows.push({ el: name + inner, top: Math.round(r.top + sy), height: Math.round(r.height) });
        el = el.nextElementSibling;
      }
      return rows;
    })(),
  };
  return out;
})()`;

function bail(msg) {
    console.error('kp-entry-position-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const r = await arriveCold({
        url: fileUrl(PAGE, 'game=KPCHECK'),
        rounds: ROUNDS, settleMs: 3500,
        viewport: { width: 390, height: 844 },
        steps: [
            ...(ARM === 'picker' ? [{ tap: '.kp-btn' }, { sleep: 300 }] : []),   // picker arm: open it with a real tap
            { expression: MEASURE },                                  // arrival: hole 7, a KP hole (picker arm: open)
            { tap: '.hole-view-nav-btn', nth: 1 }, { sleep: 400 },   // Next -> hole 8, not a KP hole; landOnHole scrolls
            { expression: MEASURE },
            { tap: '.hole-view-nav-btn', nth: 0 }, { sleep: 400 },   // Prev -> hole 7 again, through the same landing
            { expression: MEASURE },
        ],
    });
    if (!r.ok) bail(r.reason);
    // Each sleep step pushes its own line; the entries are read by position (the
    // picker arm's two opening lines first).
    const vals = ARM === 'picker' ? r.value.slice(2) : r.value;
    if (ARM === 'picker' && !/^tapped/.test(String(r.value[0]))) bail('Set KP Leader was not pressed: ' + r.value[0]);
    const [arrive, tapNext, , h8, tapPrev, , h7] = vals;
    if (typeof tapNext !== 'string' || !/^tapped/.test(tapNext)) bail('Next was not pressed: ' + tapNext);
    if (typeof tapPrev !== 'string' || !/^tapped/.test(tapPrev)) bail('Prev was not pressed: ' + tapPrev);
    if (!arrive || !arrive.heading) bail('no hole card rendered on arrival');

    const problems = [];
    if (arrive.hole !== 'Hole 7') problems.push('the page did not land on hole 7 on its own: ' + arrive.hole);
    if (h8.hole !== 'Hole 8') problems.push('Next did not reach hole 8: ' + h8.hole);
    if (h7.hole !== 'Hole 7') problems.push('Prev did not return to hole 7: ' + h7.hole);
    // THE BLOCK, on the KP hole: present, laid out, directly under the nav row.
    for (const [label, m] of [['arrival', arrive], ['hole 7 again', h7]]) {
        if (!m.mount) { problems.push(label + ': no #kp-entry-mount on the page'); continue; }
        if (!m.mountIsNextAfterNav) problems.push(label + ': the mount is not the element directly after the Prev/Next row');
        if (!m.block || !(m.block.height > 0 && m.block.width > 0)) problems.push(label + ': the KP block has no geometry on a KP hole');
        else {
            if (m.block.top < m.navRow.bottom) problems.push(label + ': the block is above the nav row');
            if (m.gapNavToBlock > 24) problems.push(label + ': ' + m.gapNavToBlock + 'px between the nav row and the block - something sits between them');
            if (m.recap && m.recap.top < m.block.bottom) problems.push(label + ': the recap is above the block');
        }
        if (m.blockHead !== 'Hole 7 Weekly Game KP') problems.push(label + ': the head reads ' + JSON.stringify(m.blockHead));
        if (!m.setKpButton) problems.push(label + ': no Set KP Leader button for a four-ball link');
    }
    // NOTHING on the non-KP hole.
    if (!h8.mount) problems.push('hole 8: no #kp-entry-mount on the page');
    else if (h8.mountChildren !== 0 || (h8.mount.height !== 0)) problems.push('hole 8: the mount is not empty (' + h8.mountChildren + ' children, ' + h8.mount.height + 'px)');
    // THE LANDING: both navigations put the heading at the same place on screen.
    if (h8.heading.viewportTop !== h7.heading.viewportTop)
        problems.push('the landing differs between hole 8 (' + h8.heading.viewportTop + ') and hole 7 (' + h7.heading.viewportTop + ')');
    if (ARM === 'picker') {
        if (!arrive.picker || !arrive.picker.select) problems.push('picker arm: the tap did not open the select');
        else if (arrive.picker.options !== 5) problems.push('picker arm: expected 5 options (prompt + four golfers), got ' + arrive.picker.options);
    }
    if (ARM === 'dots') {
        if (!arrive.dotsKpLine) problems.push('dots arm: no Dots KP line on the par 3');
        else if (arrive.block && arrive.dotsKpLine.rect.top < arrive.block.bottom) problems.push('dots arm: the Dots KP line is above the Weekly Game block');
    }

    const out = { page: PAGE, arm: ARM, viewport: '390x844', arrival: arrive, next: tapNext, hole8: h8, prev: tapPrev, hole7: h7,
        problems, verdict: problems.length ? 'FAIL' : 'PASS' };
    console.log(JSON.stringify(out, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
