#!/usr/bin/env node
// ============================================================================
// THE TOURNAMENT LANDING, MEASURED COLD IN CHROME.
//
// tournament_landing_polish_test.js proves the polish wave changed no id, no
// handler, no save payload and exactly three strings of text. What it cannot
// prove is anything with a size: mini-dom has no layout and parses no static
// class or style. So this check opens /tournament the way an organizer does -
// file URL, no query, the Firebase bundles blocked and a stand-in injected by
// tools/lib/cold-arrival.js - and MEASURES:
//
//   at 390px (a phone) and 768px (a tablet), signed out:
//     - the hero is a band: taller than 180px, as wide as its card, and the
//       page does not scroll sideways
//     - the wordmark and the one line are on screen, as innerText
//     - the imagery is a LOCAL file that actually decodes, and its layer has a
//       solid ground colour under it
//     - the sign-in card is visible and starts BELOW the hero's bottom edge
//     - the format picker has 1 column on the phone and 2 on the tablet
//     - exactly one card is active on arrival, and it is Scramble
//   then, through the page's own buttons (an expression may click a button;
//   it calls no page function):
//     - tapping 2-Man Best Ball leaves exactly one active card, Best Ball
//     - tapping the toggle sets html.dark-mode, flips the label, and the hero
//       type is still light on dark
//   and signed in as an email organizer, at 390px:
//     - the sign-in card is gone and "Signed in as" names them
//
// EXIT 0 PASS, 1 FAIL (the JSON says which measurement), 2 could not run.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const PROBE = `
(() => {
  const q = (s) => document.querySelector(s);
  const r = (el) => { const b = el ? el.getBoundingClientRect() : null; return b ? { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height) } : null; };
  const vis = (el) => !!(el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none');
  const hero = q('#tourney-hero'), art = q('.tourney-hero-art'), card = q('#setup-screen'), panel = q('#signin-panel-setup');
  const picker = q('#main-format-picker');
  const cols = picker ? getComputedStyle(picker).gridTemplateColumns.trim().split(/\\s+/).filter(Boolean).length : null;
  const active = Array.from(document.querySelectorAll('#main-format-picker .format-card.active')).map((c) => c.id);
  const mark = q('.wm-mark'), rattle = q('.wm-rattle'), product = q('.wm-product'), disc = q('.wm-disc');
  const bg = art ? getComputedStyle(art) : null;
  const rattleStyle = rattle ? getComputedStyle(rattle) : null;
  return JSON.stringify({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hero: r(hero), card: r(card),
    heroText: hero ? hero.innerText.replace(/\\s+/g, ' ').trim() : null,
    wordmarkColor: product ? getComputedStyle(product).color : null,
    markSrc: mark ? mark.getAttribute('src') : null,
    mark: r(mark), rattleBox: r(rattle), productBox: r(product), discBox: r(disc),
    rattleText: rattle ? rattle.innerText : null,
    rattleTransform: rattleStyle ? rattleStyle.textTransform : null,
    rattleSize: rattleStyle ? parseFloat(rattleStyle.fontSize) : null,
    productSize: product ? parseFloat(getComputedStyle(product).fontSize) : null,
    artImage: bg ? bg.backgroundImage : null,
    artGround: bg ? bg.backgroundColor : null,
    panelVisible: vis(panel), panel: r(panel),
    signedInAs: (q('#signed-in-as-setup') || {}).innerText || '',
    pickerColumns: cols,
    active: active,
    toggleLabel: (q('#tourney-hero .theme-toggle-btn') || {}).innerText || null,
    dark: document.documentElement.classList.contains('dark-mode'),
    firstFieldTop: r(q('#t-name')) ? r(q('#t-name')).top : null
  });
})()`;

// Does the hero image decode? Same URL the stylesheet uses, resolved by the page.
// Runtime.evaluate in the harness does not await a promise, so the load is
// started in one step and read after a sleep in a later one.
const IMAGE_START = `
(() => {
  const m = /url\\(["']?([^"')]+)["']?\\)/.exec(getComputedStyle(document.querySelector('.tourney-hero-art')).backgroundImage);
  window.__heroImg = { url: m ? m[1] : null, img: null };
  if (m) { const img = new Image(); img.src = m[1]; window.__heroImg.img = img; }
  return 'started';
})()`;
const IMAGE_READ = `
(() => {
  const h = window.__heroImg || {}; const img = h.img;
  return JSON.stringify({ url: h.url, decoded: !!(img && img.complete && img.naturalWidth > 0), w: img ? img.naturalWidth : 0, h: img ? img.naturalHeight : 0 });
})()`;

const MARK_START = `
(() => {
  const img = document.querySelector('.wm-mark');
  window.__markImg = { src: img ? img.getAttribute('src') : null, img: null, decoded: false };
  if (img) {
    const probe = new Image();
    probe.src = img.currentSrc || img.src;
    window.__markImg.img = probe;
  }
  return 'started';
})()`;
const MARK_READ = `
(() => {
  const h = window.__markImg || {}; const img = h.img;
  return JSON.stringify({ src: h.src, decoded: !!(img && img.complete && img.naturalWidth > 0), w: img ? img.naturalWidth : 0, h: img ? img.naturalHeight : 0 });
})()`;
const TAP_BESTBALL = `(() => { document.getElementById('fmt-bestball').click(); return 'tapped'; })()`;
const TAP_TOGGLE = `(() => { document.querySelector('#tourney-hero .theme-toggle-btn').click(); return 'tapped'; })()`;

const db = { tournaments: {}, global_courses: {} };

async function measure(width, auth) {
    const r = await arriveCold({
        url: fileUrl('tournament.html'), db, auth,
        viewport: { width, height: 844 },
        steps: [
            { expression: PROBE },
            { expression: IMAGE_START },
            { sleep: 600 },
            { expression: IMAGE_READ },
            { expression: MARK_START },
            { sleep: 600 },
            { expression: MARK_READ },
            { expression: TAP_BESTBALL },
            { expression: PROBE },
            { expression: TAP_TOGGLE },
            { expression: PROBE }
        ],
        settleMs: 2500
    });
    if (!r.ok) return { ran: false, reason: r.reason };
    const v = r.value.map((x) => { try { return JSON.parse(x); } catch (e) { return x; } });
    // A sleep step collects a value too ("slept N"), so the indices count it.
    // 0 probe, 1 IMAGE_START, 2 sleep, 3 IMAGE_READ, 4 MARK_START, 5 sleep, 6 MARK_READ,
    // 7 TAP_BESTBALL, 8 probe, 9 TAP_TOGGLE, 10 probe
    return { ran: true, arrival: v[0], image: v[3], mark: v[6], afterBestBall: v[8], afterToggle: v[10] };
}

(async () => {
    const failures = [];
    const bail = (why) => { console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why }, null, 2)); process.exit(2); };

    const phone = await measure(390, 'signed-out');
    const tablet = await measure(768, 'signed-out');
    const owner = await measure(390, { uid: 'u-org', email: 'org@example.com', isAnonymous: false });
    if (!phone.ran) bail('phone: ' + phone.reason);
    if (!tablet.ran) bail('tablet: ' + tablet.reason);
    if (!owner.ran) bail('owner: ' + owner.reason);

    const common = (label, m, wantCols) => {
        const a = m.arrival;
        if (!a.hero) { failures.push(`${label}: no #tourney-hero rendered`); return; }
        if (a.hero.height < 180) failures.push(`${label}: hero is ${a.hero.height}px tall - not a band`);
        if (Math.abs(a.hero.width - a.card.width) > 2) failures.push(`${label}: hero ${a.hero.width}px wide inside a ${a.card.width}px card - it should bleed to the card's edges`);
        if (a.scrollWidth > a.innerWidth) failures.push(`${label}: the page scrolls sideways (${a.scrollWidth} > ${a.innerWidth})`);
        // innerText is the quiet "Rattle" label plus "Tournaments", not the old slash wordmark.
        if (!/\bRattle\b/.test(a.heroText || '')) failures.push(`${label}: quiet Rattle label not on screen: ${JSON.stringify(a.heroText)}`);
        if (!/\bTournaments\b/.test(a.heroText || '')) failures.push(`${label}: Tournaments not on screen: ${JSON.stringify(a.heroText)}`);
        if (/Rattle\s*\/\s*Tournaments/i.test(a.heroText || '')) failures.push(`${label}: the slash wordmark came back: ${JSON.stringify(a.heroText)}`);
        if (a.rattleText !== 'Rattle') failures.push(`${label}: the quiet label is ${JSON.stringify(a.rattleText)}, wanted mixed-case Rattle`);
        if (a.rattleTransform && a.rattleTransform !== 'none' && a.rattleTransform !== 'inherit') failures.push(`${label}: the quiet label is transformed (${a.rattleTransform}) - that is the old uppercase RATTLE`);
        if (a.markSrc !== 'logo-mark.png') failures.push(`${label}: the mark src is ${JSON.stringify(a.markSrc)}, wanted logo-mark.png`);
        if (!m.mark || m.mark.decoded !== true) failures.push(`${label}: logo-mark.png did not decode: ${JSON.stringify(m.mark)}`);
        if (!a.discBox || !a.rattleBox || !a.productBox) {
            failures.push(`${label}: lockup boxes missing disc=${!!a.discBox} rattle=${!!a.rattleBox} product=${!!a.productBox}`);
        } else {
            if (a.discBox.left >= a.productBox.left) failures.push(`${label}: the mark is not left of Tournaments (mark left ${a.discBox.left}, product left ${a.productBox.left})`);
            if (a.rattleBox.top < a.discBox.bottom - 4) failures.push(`${label}: Rattle is not under the mark (rattle top ${a.rattleBox.top}, mark bottom ${a.discBox.bottom})`);
            const markMid = a.discBox.left + a.discBox.width / 2;
            const rattleMid = a.rattleBox.left + a.rattleBox.width / 2;
            if (Math.abs(markMid - rattleMid) > 12) failures.push(`${label}: Rattle is not centred under the mark (mark mid ${markMid}, rattle mid ${rattleMid})`);
            if (Math.abs(a.productBox.top + a.productBox.height / 2 - (a.discBox.top + a.discBox.height / 2)) > 20) failures.push(`${label}: Tournaments is not beside the mark (product mid-y ${a.productBox.top + a.productBox.height / 2}, mark mid-y ${a.discBox.top + a.discBox.height / 2})`);
            if (!(a.rattleSize > 0 && a.productSize > a.rattleSize * 1.8)) failures.push(`${label}: Tournaments (${a.productSize}px) is not clearly larger than the quiet Rattle label (${a.rattleSize}px)`);
        }
        if (!a.heroText.includes('Live scoring + registration for charity, member-guest, and club events.')) failures.push(`${label}: the hero line is not on screen`);
        if (!/tournament-hero/.test(a.artImage || '')) failures.push(`${label}: the art layer does not reference tournament-hero*: ${a.artImage}`);
        if (/https?:/.test(a.artImage || '')) failures.push(`${label}: the art layer hotlinks: ${a.artImage}`);
        if (!a.artGround || /rgba\(0, 0, 0, 0\)|transparent/.test(a.artGround)) failures.push(`${label}: the art layer has no solid ground colour (${a.artGround})`);
        if (!m.image || m.image.decoded !== true) failures.push(`${label}: the hero image did not decode: ${JSON.stringify(m.image)}`);
        if (!a.panelVisible) failures.push(`${label}: the sign-in card is not visible signed out`);
        else if (a.panel.top < a.hero.bottom) failures.push(`${label}: the sign-in card starts at ${a.panel.top}px, above the hero's bottom edge at ${a.hero.bottom}px`);
        if (a.firstFieldTop !== null && a.panel && a.firstFieldTop < a.panel.bottom) failures.push(`${label}: the first field sits above the sign-in card`);
        if (a.pickerColumns !== wantCols) failures.push(`${label}: format picker has ${a.pickerColumns} columns, wanted ${wantCols}`);
        if (JSON.stringify(a.active) !== JSON.stringify(['fmt-scramble'])) failures.push(`${label}: on arrival the active cards are ${JSON.stringify(a.active)}, wanted Scramble alone`);
        const b = m.afterBestBall;
        if (JSON.stringify(b.active) !== JSON.stringify(['fmt-bestball'])) failures.push(`${label}: after tapping Best Ball the active cards are ${JSON.stringify(b.active)}`);
        const t = m.afterToggle;
        if (!t.dark) failures.push(`${label}: tapping the toggle did not set html.dark-mode`);
        if (!/Light Mode/.test(t.toggleLabel || '')) failures.push(`${label}: the toggle label did not flip: ${t.toggleLabel}`);
        if (t.wordmarkColor !== 'rgb(255, 255, 255)') failures.push(`${label}: in dark mode the wordmark is ${t.wordmarkColor}, wanted white on the dark band`);
        if (a.wordmarkColor !== 'rgb(255, 255, 255)') failures.push(`${label}: in light mode the wordmark is ${a.wordmarkColor}, wanted white on the dark band`);
    };
    common('phone 390', phone, 1);
    common('tablet 768', tablet, 2);

    const o = owner.arrival;
    if (o.panelVisible) failures.push('owner: the sign-in card is still visible signed in');
    if (!/Signed in as org@example\.com/.test(o.signedInAs)) failures.push('owner: "Signed in as" does not name the organizer: ' + JSON.stringify(o.signedInAs));
    if (!o.hero || o.hero.height < 180) failures.push('owner: the hero is missing or flat when signed in');

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({
        verdict, failures,
        measured: {
            phone: { hero: phone.arrival.hero, panelTop: phone.arrival.panel && phone.arrival.panel.top, columns: phone.arrival.pickerColumns, active: phone.arrival.active, afterBestBall: phone.afterBestBall.active, dark: phone.afterToggle.dark, image: phone.image, mark: phone.mark, lockup: { disc: phone.arrival.discBox, rattle: phone.arrival.rattleBox, product: phone.arrival.productBox, rattleText: phone.arrival.rattleText }, scroll: [phone.arrival.scrollWidth, phone.arrival.innerWidth] },
            tablet: { hero: tablet.arrival.hero, panelTop: tablet.arrival.panel && tablet.arrival.panel.top, columns: tablet.arrival.pickerColumns, active: tablet.arrival.active, afterBestBall: tablet.afterBestBall.active, dark: tablet.afterToggle.dark, scroll: [tablet.arrival.scrollWidth, tablet.arrival.innerWidth] },
            owner: { panelVisible: o.panelVisible, signedInAs: o.signedInAs, hero: o.hero },
            heroText: phone.arrival.heroText
        }
    }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
