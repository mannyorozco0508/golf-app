#!/usr/bin/env node
// ============================================================================
// HARDPAN GPS - MY CLUB DISTANCES + THE SUGGESTION, PLAYED (008, switch clubs)
//
//   node tools/gps-clubs-check.js     exit 0 = passed, 1 = broke, 2 = could not run
//
// Cold Chrome, the app, a subscriber (tools/lib/iap-stub.js), Caledonia's bundled
// holes, and a stand-in GPS (window.__moveTo walks the golfer down hole 1's line).
//   1  Mark shot from the tee, walk 150 m, Mark shot: "Which club?" (164 yds) -> 7i;
//      walk 130 m back, Mark shot: 142 yds -> 8i. Kept on the phone, yards only.
//   2  The suggestion from the center distance: 153 yds out -> "Suggested: 7-iron (your
//      164)"; 137 out -> "Suggested: 8-iron (your 142)".
//   3  My bag (Tools): both clubs with their shots; 7-iron typed as 158 -> "your number"
//      and the suggestion says 158; Reset all -> no suggestion.
//   4  Tournament mode (this phone's switch) with a full bag: no suggestion, no question.
//   5  The 008 switch off: no question, no suggestion, no My bag in the page.
//   6  009 FIRST-TIME SETUP: an empty bag opens My bag on "Enter your carry for each club",
//      filled for the golfer's handicap (9); 7-iron changed to 158, lob wedge cleared, Save:
//      the list says "entered"; a club with 3 marked shots of its own says "learned".
//   7  bagSetup off: no setup in the page; My bag opens on the plain list.
//   8  ACCOUNT SYNC (clubsSync on, a signed-in golfer who is "me"): the account's bag loads
//      (the suggestion uses it) and a club pick writes player_clubs/<uid>/me - and with the
//      switch as it ships (off), not one write under player_clubs.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
if (!fs.existsSync(path.join(HERE, 'gps-view.js'))) { console.error('Consumer tree (GPS_ENABLED=0): no GPS.'); process.exit(2); }
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const { iapStub } = require(path.join(HERE, 'tools/lib/iap-stub.js'));
const table = require(path.join(HERE, 'gps-courses.js'));

const CODE = 'MYBAG';
const R = 6371008.8, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const hav = (a, b) => { const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const brg = (a, b) => { const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (deg(Math.atan2(y, x)) + 360) % 360; };
const dest = (p, b, m) => { const d = m / R, t = rad(b), la = rad(p[0]), lo = rad(p[1]); const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(t)); return [deg(la2), deg(lo + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)))]; };
const yd = (m) => Math.round(m / 0.9144);
const H1 = table.caledonia.holes['1'].osm, T1 = H1.tee, G1 = H1.mid, B1 = brg(T1, G1), L1 = hav(T1, G1);
const along = (m) => dest(T1, B1, m);
// Where the golfer stands: the tee, 150 m on, back to 20 m; then 153 and 137 yds from the center.
const P150 = along(150), P20 = along(20), OUT153 = along(L1 - 153 * 0.9144), OUT137 = along(L1 - 137 * 0.9144);
const SHOT1 = yd(hav(T1, P150)), SHOT2 = yd(hav(P150, P20));

const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});";
const APP = 'window.__hardpanDoors = true;';
const CFG = (features, more) => "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false,esriKey:''" + (features ? ',features:' + JSON.stringify(Object.assign({}, features)) : '') + "}" + (more ? ',' + JSON.stringify(more) : '') + ");}});})();";
const GEO = (p) => "(function(){ var cur = { lat: " + p[0] + ", lng: " + p[1] + " }, live = {}, n = 1;"
    + " window.__moveTo = function (la, ln) { cur = { lat: la, lng: ln }; Object.keys(live).forEach(function (id) { live[id](); }); return 'moved'; };"
    + " try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { var id = n++; var f = function () { ok({ coords: { latitude: cur.lat, longitude: cur.lng, accuracy: 5 }, timestamp: Date.now() }); };"
    + " live[id] = f; var t = setInterval(function () { if (live[id]) f(); else clearInterval(t); }, 1000); setTimeout(f, 50); return id; }, getCurrentPosition: function () {}, clearWatch: function (id) { delete live[id]; } } }); } catch (e) {} })();";
const SEED = (more) => "(function(){ try { if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded','1'); localStorage.setItem('hardpan_round_side', 'gps|" + CODE + "'); localStorage.setItem('hardpan_last_hole_" + CODE + "', '1'); localStorage.setItem('hardpan_gps_whoasked_" + CODE + "', '1'); localStorage.setItem('hardpan_gps_autoadvance', '0'); " + (more || '') + " } catch (e) {} })();";
function round() {
    const r = wizardSavedRound({ code: CODE, golfers: 2, names: ['Manny Orozco', 'Joe Russo'], hcps: [9, 12], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: { additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club', startingHole: 1 } });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const BLOCK = ['*nationalmap.gov*', '*arcgis*', '*weather.gov*', '*epqs*', '*overpass*', '*cloudfunctions.net*'];
const go = async (o) => {
    const r = await arriveCold({ url: fileUrl('index.html', 'game=' + CODE), db: Object.assign({ events: { [CODE]: round() }, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, o.db || {}),
        settleMs: 3500, viewport: { width: 390, height: 844 }, webgl: true, blockUrls: BLOCK, auth: o.auth,
        preScript: CFG(o.features, o.cfg) + APP + ERR + GEO(T1) + SEED(o.seed) + iapStub({ active: true }), steps: o.steps });
    if (!r.ok) throw new Error(r.reason);
    return r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
};
const OPEN = { expression: "(function(){ if (window.HardPanGps && HardPanGps.side() === 'gps') return 'on'; var b = document.querySelector('#gps-side-toggle .gps-side-gps'); if (b) b.click(); return 'tap'; })()" };
const ST = { expression: "JSON.stringify({ hole: HardPanGps.hole(), side: HardPanGps.side(), m: (document.querySelector('#gps-overlay .gps-m') || {}).textContent,"
    + " sug: (function(){ var e = document.querySelector('#gps-overlay .gps-suggest'); return e ? (e.style.display === 'none' ? '' : e.textContent) : null; })(),"
    + " ask: (function(){ var e = document.querySelector('#gps-overlay .gps-bagask'); return e ? (e.style.display === 'none' ? '' : e.querySelector('.gps-bagask-head').textContent + ' | ' + [].map.call(e.querySelectorAll('[data-bag-club]'), function (b) { return b.textContent; }).join(' ')) : null; })(),"
    + " myBag: !!document.querySelector('#gps-overlay .gps-my-bag'),"
    + " bag: (function(){ var e = document.querySelector('#gps-overlay .gps-bag'); if (!e) return null; if (e.style.display === 'none') return ''; return { title: e.querySelector('.gps-bag-title').textContent, rows: [].filter.call(e.querySelectorAll('.gps-bag-row'), function (r) { return r.querySelector('input').value; }).map(function (r) { return [r.getAttribute('data-bag-row'), r.querySelector('input').value, r.querySelector('.gps-bag-meta').textContent]; }) }; })(),"
    + " setup: (function(){ var e = document.querySelector('#gps-overlay .gps-bag'); if (!e || e.style.display === 'none' || e.getAttribute('data-bag-view') !== 'setup') return null; return { sub: e.querySelector('.gps-bag-sub').textContent, rows: [].map.call(e.querySelectorAll('[data-bag-setup]'), function (i) { return [i.getAttribute('data-bag-setup'), i.value]; }) }; })(),"
    + " hasSetup: !!document.querySelector('#gps-overlay .gps-bag-setup'),"
    + " clubWrites: (window.__coldWrites || []).filter(function (w) { return /player_clubs/.test(w.path); }),"
    + " store: localStorage.getItem('hardpan_bag_v1'), e: window.__e })" };
const CLICK = (sel) => ({ expression: "(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return 'none'; b.click(); return 'ok'; })()" });
const MOVE = (p) => ({ expression: 'window.__moveTo(' + p[0] + ',' + p[1] + ')' });
const W = (ms) => ({ sleep: ms });
const MARK = [CLICK('#gps-overlay .gps-mark-shot'), W(400)];
const START = [W(2500), OPEN, W(3000)];

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    const errs = (list, tag) => list.forEach((x) => { if (x.e && x.e.length) fails.push(tag + ': page errors ' + x.e.join(' | ')); });

    // 1-3: mark, pick, suggest, My bag.
    let s = await go({ steps: START.concat([ST, ...MARK, MOVE(P150), W(1500), ...MARK, W(400), ST, CLICK('#gps-overlay [data-bag-club="7i"]'), W(400), ST,
        MOVE(P20), W(1500), ...MARK, W(400), CLICK('#gps-overlay [data-bag-club="8i"]'), W(400),
        MOVE(OUT153), W(1500), ST, MOVE(OUT137), W(1500), ST,
        CLICK('#gps-overlay .gps-tools'), W(300), CLICK('#gps-overlay .gps-my-bag'), W(600), ST,
        { expression: "(function(){ var i = document.querySelector('#gps-overlay [data-bag-edit=\"7i\"]'); i.value = '158'; i.dispatchEvent(new Event('change', { bubbles: true })); return 'typed'; })()" }, W(300),
        CLICK('#gps-overlay .gps-bag-done'), MOVE(OUT153), W(1500), ST,
        CLICK('#gps-overlay .gps-tools'), W(300), CLICK('#gps-overlay .gps-my-bag'), W(600), ST, CLICK('#gps-overlay .gps-bag-resetall'), W(300), ST, CLICK('#gps-overlay .gps-bag-done'), W(1200), ST]) });
    report.play = s.map((x) => ({ m: x.m, sug: x.sug, ask: x.ask, bag: x.bag }));
    const [fresh, asked, picked, at153, at137, bag1, typed158, bag2, reset, after] = s;
    f(fresh.side === 'gps' && fresh.hole === 1 && fresh.sug === '' && fresh.myBag, '0: GPS on 1, an empty bag shows no suggestion; My bag in Tools: ' + JSON.stringify(fresh));
    f(asked.ask === 'Shot ' + SHOT1 + ' yds · which club? | Dr 3w 5w Hy 4i 5i 6i 7i 8i 9i PW GW SW LW', '1: after the measured shot, "Which club?" (' + SHOT1 + ' yds) with the chips: ' + asked.ask);
    f(picked.ask === '' && picked.store && JSON.parse(picked.store).golfers['n:manny orozco'].shots['7i'][0] === SHOT1, '1: 7i did not save ' + SHOT1 + ' to the golfer\'s bag: ' + picked.store);
    f(!/\d+\.\d{4,}/.test(after.store || picked.store || ''), '1: a coordinate went into the bag record');
    f(at153.sug === 'Suggested: 7-iron (your ' + SHOT1 + ')', '2: 153 out (center ' + at153.m + '): ' + at153.sug);
    f(at137.sug === 'Suggested: 8-iron (your ' + SHOT2 + ')', '2: 137 out (center ' + at137.m + '): ' + at137.sug);
    f(bag1.bag && bag1.bag.title === 'My bag · Manny' && JSON.stringify(bag1.bag.rows) === JSON.stringify([['7i', String(SHOT1), 'learned · 1 shot'], ['8i', String(SHOT2), 'learned · 1 shot']]), '3: My bag: ' + JSON.stringify(bag1.bag));
    f(typed158.sug === 'Suggested: 7-iron (your 158)', '3: the typed 158 is not what the suggestion uses: ' + typed158.sug);
    f(bag2.bag && JSON.stringify(bag2.bag.rows[0]) === JSON.stringify(['7i', '158', 'entered']), '3: My bag after the edit: ' + JSON.stringify(bag2.bag));
    f(s.every((x) => !x.clubWrites.length), '3: a write under player_clubs with the sync switched off: ' + JSON.stringify(s.map((x) => x.clubWrites)));
    f(reset.bag && reset.bag.rows.length === 0 && after.sug === '', '3: Reset all left numbers / a suggestion: ' + JSON.stringify([reset.bag, after.sug]));
    errs(s, 'play');

    // 4: tournament mode, a full bag waiting.
    const full = JSON.stringify({ v: 1, golfers: { 'n:manny orozco': { shots: { '7i': [158], '8i': [146] }, set: {} } } });
    s = await go({ seed: "localStorage.setItem('hardpan_tournament_phone', '1'); localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(full) + ");",
        steps: START.concat([MOVE(OUT153), W(1500), ST, ...MARK, MOVE(P150), W(1500), ...MARK, W(500), ST]) });
    report.tournament = s.map((x) => [x.sug, x.ask]);
    f(s[0].sug === '' && s[1].sug === '', '4: a club suggestion in tournament mode: ' + JSON.stringify(report.tournament));
    f(s[1].ask === '', '4: "Which club?" in tournament mode: ' + s[1].ask);
    errs(s, 'tournament');

    // 5: the switch off.
    s = await go({ features: { clubs: false }, seed: "localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(full) + ");",
        steps: START.concat([MOVE(OUT153), W(1500), ...MARK, MOVE(P150), W(1500), ...MARK, W(500), ST]) });
    report.off = s.map((x) => [x.sug, x.ask, x.myBag, x.bag]);
    f(s[0].sug === null && s[0].ask === null && s[0].myBag === false && s[0].bag === null, '5: switch off, but a clubs element is in the page: ' + JSON.stringify(report.off));
    errs(s, 'off');

    // 6: first-time setup for the golfer's handicap (Manny: 9), then entered / learned.
    const EDIT = (sel, v) => ({ expression: "(function(){ var i = document.querySelector('#gps-overlay " + sel + "'); if (!i) return 'none'; i.value = " + JSON.stringify(v) + "; i.dispatchEvent(new Event('change', { bubbles: true })); return 'typed'; })()" });
    const MYBAG = [CLICK('#gps-overlay .gps-tools'), W(300), CLICK('#gps-overlay .gps-my-bag'), W(600)];
    s = await go({ steps: START.concat([...MYBAG, ST, EDIT('[data-bag-setup="7i"]', '158'), EDIT('[data-bag-setup="LW"]', ''), CLICK('#gps-overlay .gps-bag-setup-save'), W(400), ST,
        CLICK('#gps-overlay .gps-bag-done'), MOVE(OUT153), W(1500), ST]) });
    const [su, saved, sugAfter] = s;
    report.setup = { sub: su.setup && su.setup.sub, first: su.setup && su.setup.rows.slice(0, 8), saved: saved.bag && saved.bag.rows.slice(0, 8), sug: sugAfter.sug };
    const want9 = { Dr: 238, '3w': 214, '7i': 152, PW: 122 };   // the table, 9 of the way from scratch to 10
    f(su.setup && /^Enter your carry for each club\. Starting numbers for a 9 handicap/.test(su.setup.sub), '6: My bag did not open on the setup for a 9 handicap: ' + JSON.stringify(su.setup || su.bag));
    f(su.setup && Object.keys(want9).every((c) => su.setup.rows.some(([k, v]) => k === c && v === String(want9[c]))), '6: the starting carries for a 9: ' + JSON.stringify(su.setup && su.setup.rows));
    f(saved.bag && saved.bag.rows.length === 13 && saved.bag.rows.every((r) => r[2] === 'entered') && saved.bag.rows.some((r) => r[0] === '7i' && r[1] === '158') && !saved.bag.rows.some((r) => r[0] === 'LW'), '6: after Save: ' + JSON.stringify(saved.bag));
    f(sugAfter.sug === 'Suggested: 7-iron (your 158)', '6: the suggestion from the setup carries (153 out): ' + sugAfter.sug);
    errs(s, 'setup');
    const learned = JSON.stringify({ v: 1, golfers: { 'n:manny orozco': { shots: { '8i': [142, 144, 146] }, set: {}, base: { '7i': 150, '8i': 140 }, setupAt: 1 } } });
    s = await go({ seed: "localStorage.setItem('hardpan_bag_v1', " + JSON.stringify(learned) + ");", steps: START.concat([...MYBAG, ST]) });
    report.learned = s[0].bag;
    f(s[0].bag && JSON.stringify(s[0].bag.rows) === JSON.stringify([['7i', '150', 'entered'], ['8i', '144', 'learned · 3 shots']]), '6: entered vs learned: ' + JSON.stringify(s[0].bag));
    errs(s, 'learned');

    // 7: bagSetup off - an empty bag opens on the plain list; no setup in the page.
    s = await go({ features: { bagSetup: false }, steps: START.concat([...MYBAG, ST]) });
    report.setupOff = [s[0].hasSetup, s[0].setup, s[0].bag];
    f(s[0].hasSetup === false && s[0].setup === null && s[0].bag && s[0].bag.rows.length === 0, '7: bagSetup off: ' + JSON.stringify(report.setupOff));
    errs(s, 'setupOff');

    // 8: the account sync, switched ON for this arm only: a signed-in golfer who is "me".
    const ME_SEED = "localStorage.setItem('golfapp_me_" + CODE + "', '101');";
    const acct = { player_clubs: { uidManny: { me: { set: { '7i': 158 }, shots: { '8i': { 0: 146 } } } } } };
    s = await go({ cfg: { clubsSync: true }, auth: { uid: 'uidManny', email: 'manny@example.test' }, db: acct, seed: ME_SEED,
        steps: START.concat([MOVE(OUT153), W(1500), ST, ...MARK, MOVE(P150), W(1500), ...MARK, W(400), CLICK('#gps-overlay [data-bag-club="6i"]'), W(600), ST]) });
    report.sync = { sug: s[0].sug, writes: s[1].clubWrites };
    f(s[0].sug === 'Suggested: 7-iron (your 158)', '8: the account\'s bag did not load (153 out): ' + s[0].sug);
    const wr = s[1].clubWrites;
    f(wr.length >= 1 && wr.every((w) => w.op === 'set' && w.path === 'player_clubs/uidManny/me'), '8: writes: ' + JSON.stringify(wr));
    const last = wr.length ? wr[wr.length - 1].value : null;
    f(last && JSON.stringify(Object.keys(last).sort()) === JSON.stringify(['set', 'shots']) && last.set['7i'] === 158 && last.shots['6i'] && Math.abs(last.shots['6i'][0] - yd(hav(OUT153, P150))) <= 1 && last.shots['8i'][0] === 146, '8: the record written: ' + JSON.stringify(last));
    errs(s, 'sync');
    // ...and as it ships (off): the same golfer, signed in - nothing written under player_clubs.
    s = await go({ auth: { uid: 'uidManny', email: 'manny@example.test' }, db: acct, seed: ME_SEED,
        steps: START.concat([MOVE(OUT153), W(1500), ST, ...MARK, MOVE(P150), W(1500), ...MARK, W(400), CLICK('#gps-overlay [data-bag-club="6i"]'), W(600), ST]) });
    report.syncOff = { sug: s[0].sug, writes: s[1].clubWrites };
    f(s[0].sug === '' && s[1].clubWrites.length === 0, '8: clubsSync off still read / wrote the account: ' + JSON.stringify(report.syncOff));
    errs(s, 'syncOff');

    console.log(JSON.stringify({ report, fails }, null, 1));
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
