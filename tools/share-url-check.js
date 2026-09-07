#!/usr/bin/env node
// ============================================================================
// EVERY SHARE LINK MUST BE A LINK SOMEBODY ELSE CAN OPEN
//
// Inside the iOS wrapper the page is served from capacitor://localhost, so every
// URL built from location.origin came out as
//     capacitor://localhost/index.html?game=CODE
// which is useless the moment it leaves the phone. On the native build that broke
// the invite link, the QR, every group scorekeeper link, the private organizer
// link, the read-only follow link and the trip link - all of them, because they
// all derived from the page's own location.
//
// THIS REPRODUCES IT WITHOUT AN IPHONE. The cold harness serves over file://,
// which is a non-web origin exactly as capacitor:// is. If a builder reads
// location.origin, it fails here for the same reason it fails on the phone.
//
// A share URL must be an https:// URL wherever the app is running. On a real web
// deploy that is this page's own origin, so preview deploys and local dev keep
// working; anywhere else it is the canonical web origin.
//
//   node tools/share-url-check.js
//
//   exit 0   PASS
//   exit 1   FAIL - the JSON names each builder and what it produced
//   exit 2   could not run. NOTHING WAS PROVEN - this is not a pass.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
const players = n => Array.from({ length: n }, (_, i) =>
    ({ id: 101 + i, name: 'Golfer ' + (i + 1), hcp: '0' }));
// Nine golfers, so the multi-group links exist and are checked too.
const ROUND = { eventName: 'Share Check', gameFormat: 'stroke', players: players(9),
                courseData: CD, scores: {}, organizerToken: 'TOK1' };
const DB = { events: { SHARE: ROUND },
             trips: { TRIP1: { name: 'Myrtle', createdAt: 1, rounds: { SHARE: { label: 'Day 1' } } } } };

const SURFACES = [
    { page: 'admin.html', query: 'game=SHARE', name: 'setup page', probe: `
        (() => {
          const out = {};
          if (typeof scorecardUrlFor === 'function') {
            out['invite link'] = scorecardUrlFor('SHARE');
            out['group scorekeeper link'] = scorecardUrlFor('SHARE', 2);
          }
          // The QR encodes whatever the invite link is, so it is covered by the
          // line above; recorded here so a reader can see it was considered.
          out['QR encodes'] = out['invite link'] || null;
          if (typeof shareBaseUrl === 'function') out['shareBaseUrl()'] = shareBaseUrl();
          const rendered = Array.from(document.querySelectorAll('#group-links-list button'))
              .map(b => (b.getAttribute('onclick') || '').match(/'(\\S+?:\\/\\/[^']*)'/))
              .filter(Boolean).map(m => m[1]);
          if (rendered.length) out['rendered group link'] = rendered[0];
          return JSON.stringify(out); })()` },
    // NO &group= here on purpose: isOrganizerView() is "not group-locked", so a
    // scorekeeper link cannot see the Group Links panel at all. This is the
    // organizer's own arrival.
    { page: 'index.html', query: 'game=SHARE', name: 'scorecard', probe: `
        (() => {
          const out = {};
          // The panel is organizer-only and opens on demand; press the control the
          // organizer presses rather than reading a variable.
          const btn = Array.from(document.querySelectorAll('button'))
              .filter(b => /toggleGroupLinksPanel\\(/.test(b.getAttribute('onclick') || ''))[0];
          if (btn) btn.click();
          else out['scorecard panel'] = 'no Group Links button on screen';
          const links = Array.from(document.querySelectorAll('#group-links-panel button'))
              .map(b => (b.getAttribute('onclick') || '').match(/'(\\S+?:\\/\\/[^']*)'/))
              .filter(Boolean).map(m => m[1]);
          links.forEach((u, i) => { out['scorecard link ' + (i + 1)] = u; });
          if (!links.length) out['scorecard links'] = 'panel not opened - not measured';
          return JSON.stringify(out); })()` },
    { page: 'leaderboard.html', query: 'game=SHARE', name: 'leaderboard', probe: `
        (() => {
          const out = {};
          const src = (typeof shareResults === 'function') ? shareResults.toString() : '';
          // Built inside the handler, so the handler is run with clipboard and share
          // stubbed - nothing leaves the page.
          let captured = null;
          const realClip = navigator.clipboard;
          try {
            Object.defineProperty(navigator, 'clipboard', { configurable: true,
              value: { writeText: u => { captured = u; return Promise.resolve(); } } });
            const realShare = navigator.share;
            navigator.share = u => { captured = (u && u.url) || captured; return Promise.resolve(); };
            if (typeof shareResults === 'function') shareResults();
            navigator.share = realShare;
          } catch (e) { out['leaderboard error'] = String(e.message); }
          if (captured) out['follow link'] = captured;
          else if (src) out['follow link'] = 'not captured';
          return JSON.stringify(out); })()` },
    { page: 'trip.html', query: 'trip=TRIP1', name: 'trip', probe: `
        (() => {
          const out = {};
          if (typeof tripShareUrl === 'function') out['trip link'] = tripShareUrl();
          return JSON.stringify(out); })()` },
    { page: 'tournament.html', query: '', name: 'tournament', probe: `
        (() => {
          const out = {};
          if (typeof scorecardBaseUrl === 'function') out['team scorecard base'] = scorecardBaseUrl();
          return JSON.stringify(out); })()` }
];

function bail(msg) {
    console.error('share-url-check: ' + msg);
    console.error('exit 2 means NOTHING WAS PROVEN - this is not a pass.');
    process.exit(2);
}

(async () => {
    const problems = [];
    const report = {};
    let measured = 0;

    for (const s of SURFACES) {
        const r = await arriveCold({ url: fileUrl(s.page, s.query), db: DB,
            expression: s.probe, settleMs: 3200 });
        if (!r.ok) bail(s.page + ': ' + r.reason);
        let got;
        try { got = JSON.parse(r.value); } catch (e) { bail(s.page + ': unreadable probe output'); }
        report[s.name] = got;
        // A SURFACE THAT PRODUCED NOTHING WAS NOT CHECKED. Removing product-links.js
        // from a page makes shareBaseUrl throw, the panel renders no links at all,
        // and "every URL here is https" is then trivially true of an empty list.
        // That control passed until this line existed.
        const urlsHere = Object.keys(got).filter(k => typeof got[k] === 'string'
            && /:\/\//.test(got[k]));
        if (urlsHere.length === 0) {
            problems.push(s.name + ' produced no share URL at all - it was not checked. '
                + 'Rendered: ' + JSON.stringify(got));
        }
        Object.keys(got).forEach(label => {
            const url = got[label];
            if (typeof url !== 'string' || !/:\/\//.test(url)) return;  // a note, not a URL
            measured++;
            if (!/^https:\/\//.test(url)) {
                problems.push(s.name + ' — ' + label + ' is not a web URL: ' + url);
            }
        });
    }

    // A check that measured nothing must not pass.
    if (measured === 0) bail('no share URL was produced by any page - nothing was measured');
    report.urlsMeasured = measured;
    report.problems = problems;
    report.verdict = problems.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify(report, null, 2));
    process.exit(problems.length ? 1 : 0);
})();
