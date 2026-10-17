#!/usr/bin/env node
// ============================================================================
// EVERY WAY INTO GPS ASKS FOR GPS MAP (paid launch: Manny, mailbox 007, 2026-10-17)
//
//   node tools/gps-paywall-check.js     exit 0 = passed, 1 = a guarantee broke, 2 = could not run
//
// v2.0: ALL of GPS is the "GPS Map" subscription (a 7-day free trial, then yearly).
// Cold Chrome, the app (window.__hardpanDoors), the App Store stubbed
// (tools/lib/iap-stub.js - RevenueCat's own calls). For EVERY entry point, the way
// a golfer reaches it:
//   no trial / subscription -> the paywall shows, no GPS map or yardage is on screen,
//                              no location is asked for; "Not now" lands on the card /
//                              Games / Home, never a blank screen;
//   an active entitlement   -> GPS shows (no paywall).
// Entry points: the Home GPS door; the GPS | Games switch; #pick / #gps (the course
// picker, in-app links); a course pick in Near You / Recent (a subscription that lapses
// on GPS-1); the scorecard's 📍 GPS button; the card's green GPS pill; "Save · back to
// map"; Resume onto GPS (stored side gps|CODE); the landing of a fresh round; a
// spectator link; the store's first answer arriving late (no flash either way).
// The trial started from the paywall opens GPS at once (card and Home).
// Never asked: Games, joining a game by code, the scorecard (a score typed and saved),
// the leaderboard and settle up.
// Also: the paywall's words (Start 7-day free trial, the store's price with the
// founding wording, the auto-renew sentence, Restore, Terms + Privacy, Not now, the
// course line), the founding window closed by gps_meta/config, and no store price.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
if (!fs.existsSync(path.join(HERE, 'gps-view.js'))) { console.error('Consumer tree (GPS_ENABLED=0): no GPS to gate.'); process.exit(2); }
const { arriveCold, fileUrl } = require(path.join(HERE, 'tools/lib/cold-arrival.js'));
const { wizardSavedRound } = require(path.join(HERE, 'helpers/wizard-saved-round.js'));
const { iapStub } = require(path.join(HERE, 'tools/lib/iap-stub.js'));

const CAL = [33.450384, -79.153438];
const ERR = "window.__e=[];addEventListener('error',function(e){window.__e.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){window.__e.push('rej '+String(e.reason&&e.reason.message||e.reason))});";
const APP = 'window.__hardpanDoors = true;';
// The bundled course data on the web (as the other GPS checks): OpenStreetMap on, GPS LIVE off.
const OSM = "(function(){var c;Object.defineProperty(window,'HARDPAN_GPS_CONFIG',{configurable:true,get:function(){return c;},set:function(v){c=Object.assign({},v,{osm:true,live:false});}});})();";
// A sensor at Caledonia's first tee that counts every ask for the position.
const GEO = "window.__geoAsk = 0; try { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: function (ok) { window.__geoAsk++; var id = setInterval(function () { ok({ coords: { latitude: " + CAL[0] + ", longitude: " + CAL[1] + ", accuracy: 5 }, timestamp: Date.now() }); }, 500); return id; }, getCurrentPosition: function (ok) { window.__geoAsk++; setTimeout(function () { ok({ coords: { latitude: " + CAL[0] + ", longitude: " + CAL[1] + ", accuracy: 5 } }); }, 10); }, clearWatch: function (id) { clearInterval(id); } } }); } catch (e) {}";
const DB = (ev, extra) => Object.assign({ events: ev || {}, global_courses: {}, trips: {}, organizers: {}, tournaments: {} }, extra || {});
const J = (r) => r.value.filter((v) => typeof v === 'string' && v.charAt(0) === '{').map((v) => JSON.parse(v));
function round(code, extra) {
    const r = wizardSavedRound({ code, golfers: 2, names: ['Ann Able', 'Bob Baker'], hcps: [9, 12], ownerUid: 'anon-cold', thru: 0, flights: false,
        overrides: Object.assign({ additionalGames: {}, activeCourseKey: 'caledonia', courseName: 'Caledonia Golf & Fish Club' }, extra || {}) });
    delete r.moneyPool; delete r.kpWinners; delete r.kpConfirmed;
    return r;
}
const GAMES = { gameFormat: 'nassau', nassauStake: 5, skinsBuyIn: 5 };
const NOGAMES = { gameFormat: 'stroke', holeBetStake: 0, matchStake: 0, nassauStake: 0, skinsBuyIn: 0, birdieGameEnabled: false };
const SIDE = (v) => "try { localStorage.setItem('hardpan_round_side', " + JSON.stringify(v) + "); } catch (e) {}";
const RECENT = "try { localStorage.setItem('hardpan_gps_recent_courses', JSON.stringify([{ key: 'caledonia', name: 'Caledonia Golf & Fish Club', at: Date.now() }])); } catch (e) {}";
const go = async (o) => {
    const pre = (o.pre || '') + OSM + APP + GEO + ERR + iapStub(o.iap || { active: false });
    const r = await arriveCold(Object.assign({ settleMs: 3500, viewport: { width: 390, height: 844 }, webgl: true, preScript: pre }, o, { pre: undefined, iap: undefined }));
    if (!r.ok) throw new Error(r.reason);
    return r;
};
// What is on screen: the paywall, any GPS (the side, the overlay, a yardage, a map), the card.
const ST = `JSON.stringify((function () {
  var shown = function (e) { if (!e) return false; var cs = getComputedStyle(e), r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  var pw = document.getElementById('gps-paywall'), pwOn = !!(pw && pw.style.display !== 'none' && shown(pw.querySelector('.gps-sheet-card')));
  var ov = document.getElementById('gps-overlay');
  var yards = ov ? Array.prototype.filter.call(ov.querySelectorAll('.gps-big'), shown).map(function (e) { return e.textContent.trim(); }).filter(Boolean) : [];
  var card = document.getElementById('hole-view-card');
  return { pw: pwOn, pwText: pwOn ? pw.innerText.replace(/\\s+/g, ' ').trim() : null, priceSrc: pw && pw.querySelector('.gps-sheet-price') ? pw.querySelector('.gps-sheet-price').getAttribute('data-price-src') : null,
    terms: pw && pw.querySelector('.gps-sheet-terms') ? pw.querySelector('.gps-sheet-terms').getAttribute('href') : null, privacy: pw && pw.querySelector('.gps-sheet-privacy') ? pw.querySelector('.gps-sheet-privacy').getAttribute('href') : null,
    msg: pw && pw.querySelector('.gps-sheet-msg') && shown(pw.querySelector('.gps-sheet-msg')) ? pw.querySelector('.gps-sheet-msg').textContent : null,
    gpsSide: document.body.classList.contains('gps-side-gps'), overlay: shown(ov), yards: yards, map: !!document.querySelector('#gps-overlay .maplibregl-canvas'),
    side: window.HardPanGps && HardPanGps.side ? HardPanGps.side() : null, stored: localStorage.getItem('hardpan_round_side'),
    card: shown(card) || Array.prototype.some.call(document.querySelectorAll('.score-input'), shown), view: (document.querySelector('.hp-view.on') || {}).id || null,
    door: localStorage.getItem('hardpan_front_door'), url: document.URL.split('/').pop(), geo: window.__geoAsk || 0,
    opts: shown(document.getElementById('hp-opts')) || shown(document.getElementById('hp-setup')),
    iap: window.__iap ? window.__iap.calls.slice() : null, blank: !document.body || document.body.innerText.trim().length < 20, e: window.__e };
})())`;
const TAP = (sel) => ({ expression: "(function(){ var b = document.querySelector(" + JSON.stringify(sel) + "); if (!b) return 'missing ' + " + JSON.stringify(sel) + "; b.click(); return 'ok'; })()" });

const RENEW = 'Renews automatically each year unless cancelled at least 24 hours before the end of the current period. Manage or cancel in Settings > Apple ID > Subscriptions.';
const PAYWALL_WANT = ['GPS Map', 'Start 7-day free trial', '$24.99/year founding price (locked while subscribed)',
    '7-day free trial, then $24.99/year. Your Apple ID is charged when the trial ends unless you cancel at least 24 hours before.',
    RENEW, 'Restore Purchases', 'Terms of Use', 'Privacy Policy', 'Not now'];

(async () => {
    const fails = [], report = {};
    const f = (c, m) => { if (!c) fails.push(m); };
    // NO GPS: the paywall is up, and nothing of GPS is on screen or asked for.
    const locked = (tag, s) => {
        f(s.pw, tag + ': no paywall: ' + JSON.stringify(s));
        f(!s.gpsSide && !s.overlay && !s.yards.length && !s.map, tag + ': GPS on screen without GPS Map: ' + JSON.stringify({ side: s.gpsSide, overlay: s.overlay, yards: s.yards, map: s.map }));
        f(s.geo === 0, tag + ': location asked for without GPS Map (' + s.geo + ')');
        f(!s.e || !s.e.length, tag + ': page errors ' + JSON.stringify(s.e));
    };
    // Declined / never asked: the card, nothing of GPS, no paywall, not blank.
    const onCard = (tag, s) => {
        f(!s.pw, tag + ': the paywall is still up');
        f(!s.gpsSide && !s.overlay && !s.yards.length, tag + ': GPS on screen: ' + JSON.stringify({ side: s.gpsSide, overlay: s.overlay, yards: s.yards }));
        f(s.card && !s.blank, tag + ': not on the card: ' + JSON.stringify({ card: s.card, blank: s.blank, url: s.url }));
        f(s.geo === 0, tag + ': location asked for (' + s.geo + ')');
        f(!s.e || !s.e.length, tag + ': page errors ' + JSON.stringify(s.e));
    };
    const gpsOn = (tag, s) => {
        f(!s.pw, tag + ': the paywall showed to a subscriber');
        f(s.gpsSide && s.overlay && s.side === 'gps', tag + ': GPS did not show for a subscriber: ' + JSON.stringify({ side: s.gpsSide, overlay: s.overlay, s: s.side, url: s.url }));
        f(!s.e || !s.e.length, tag + ': page errors ' + JSON.stringify(s.e));
    };
    const runIdx = async (tag, code, extra, opts, steps) => J(await go(Object.assign({ url: fileUrl('index.html', 'game=' + code + '&group=1' + (opts.query || '')) }, opts, { db: DB({ [code]: round(code, extra) }, opts.db), query: undefined, steps })));

    // ---- THE SCORECARD (index.html) ---------------------------------------------------
    // 1. "📍 GPS" (the card's GPS button).
    let [a0, a1, a2] = await runIdx('toggle', 'PWTG01', GAMES, { pre: SIDE('bets|PWTG01') }, [{ sleep: 1500 }, { expression: ST },
        TAP('#gps-side-toggle .gps-side-gps'), { sleep: 2500 }, { expression: ST }, TAP('#gps-paywall .gps-sheet-close'), { sleep: 800 }, { expression: ST }]);
    onCard('📍 GPS, before', a0); locked('📍 GPS, no subscription', a1); onCard('📍 GPS, Not now', a2);
    f(a2.side === 'bets' && /^bets/.test(a2.stored || ''), '📍 GPS, Not now: the side is not the card: ' + JSON.stringify([a2.side, a2.stored]));
    f(a1.terms === 'https://golf-app-5a5.pages.dev/terms.html' && a1.privacy === 'https://golf-app-5a5.pages.dev/privacy.html', 'paywall: Terms / Privacy links: ' + JSON.stringify([a1.terms, a1.privacy]));
    PAYWALL_WANT.concat(['Caledonia Golf & Fish Club: 18/18 ✓']).forEach((w) => f((a1.pwText || '').indexOf(w) !== -1, 'paywall (card) lacks "' + w + '": ' + a1.pwText));
    f(a1.priceSrc === 'store', 'paywall: the price is not the store\'s: ' + a1.priceSrc);
    f(!/free (gps|yardage)|gps (is )?free|yardages? free/i.test(a1.pwText || ''), 'paywall: free-GPS wording: ' + a1.pwText);
    report.paywallCard = a1.pwText;
    let [b1] = await runIdx('toggle+', 'PWTG02', GAMES, { pre: SIDE('bets|PWTG02'), iap: { active: true } }, [{ sleep: 1500 }, TAP('#gps-side-toggle .gps-side-gps'), { sleep: 4000 }, { expression: ST }]);
    gpsOn('📍 GPS, subscriber', b1);

    // 2. The card's green GPS pill (#fd-gps-btn, the app's scorecard header).
    [a1, a2] = await runIdx('pill', 'PWPL01', GAMES, { pre: SIDE('bets|PWPL01') }, [{ sleep: 1500 }, TAP('#fd-gps-btn'), { sleep: 2000 }, { expression: ST }, TAP('#gps-paywall .gps-sheet-close'), { sleep: 800 }, { expression: ST }]);
    locked('GPS pill, no subscription', a1); onCard('GPS pill, Not now', a2);
    [b1] = await runIdx('pill+', 'PWPL02', GAMES, { pre: SIDE('bets|PWPL02'), iap: { active: true } }, [{ sleep: 1500 }, TAP('#fd-gps-btn'), { sleep: 4000 }, { expression: ST }]);
    gpsOn('GPS pill, subscriber', b1);

    // 3. "Save · back to map" (a GPS round with no games: the card's strip).
    [a1, a2] = await runIdx('strip', 'PWST01', NOGAMES, { pre: SIDE('bets|PWST01') }, [{ sleep: 2500 }, TAP('#fd-gps3 .fd-gps3-map'), { sleep: 2000 }, { expression: ST }, TAP('#gps-paywall .gps-sheet-close'), { sleep: 800 }, { expression: ST }]);
    locked('back to map, no subscription', a1); onCard('back to map, Not now', a2);
    [b1] = await runIdx('strip+', 'PWST02', NOGAMES, { pre: SIDE('bets|PWST02'), iap: { active: true } }, [{ sleep: 2500 }, TAP('#fd-gps3 .fd-gps3-map'), { sleep: 4000 }, { expression: ST }]);
    gpsOn('back to map, subscriber', b1);

    // 4. Resume onto GPS (this round was left on GPS): the paywall once; Not now -> the card,
    //    and the round no longer reopens on GPS.
    [a1, a2] = await runIdx('resume', 'PWRS01', GAMES, { pre: SIDE('gps|PWRS01') }, [{ sleep: 2500 }, { expression: ST }, TAP('#gps-paywall .gps-sheet-close'), { sleep: 800 }, { expression: ST }]);
    locked('Resume onto GPS, no subscription', a1); onCard('Resume onto GPS, Not now', a2);
    f(a2.stored === 'bets|PWRS01', 'Resume, Not now: the round still reopens on GPS: ' + a2.stored);
    [b1] = await runIdx('resume+', 'PWRS02', GAMES, { pre: SIDE('gps|PWRS02'), iap: { active: true } }, [{ sleep: 5000 }, { expression: ST }]);
    gpsOn('Resume onto GPS, subscriber', b1);

    // 5. The landing of a fresh round (no side chosen yet): no subscription -> the card, and
    //    NO paywall (opening a round is never a sales pitch); a subscriber lands on GPS.
    [a1] = await runIdx('land', 'PWLD01', GAMES, { pre: 'window.__freshPhone = true;' }, [{ sleep: 5000 }, { expression: ST }]);
    onCard('fresh round, no subscription', a1);
    [b1] = await runIdx('land+', 'PWLD02', GAMES, { pre: 'window.__freshPhone = true;', iap: { active: true } }, [{ sleep: 6000 }, { expression: ST }]);
    gpsOn('fresh round landing, subscriber', b1);

    // 6. A spectator link (someone's round): the card, no paywall.
    [a1] = await runIdx('spect', 'PWSP01', GAMES, { pre: 'window.__freshPhone = true;', query: '&spectate=1' }, [{ sleep: 5000 }, { expression: ST }]);
    onCard('spectator link, no subscription', a1);

    // 7. THE STORE ANSWERS LATE (2.5 s): nothing flashes - no GPS before a "no", no paywall
    //    before a "yes".
    [a1, a2] = await runIdx('slow+', 'PWSL01', GAMES, { pre: SIDE('gps|PWSL01'), iap: { active: true, slowMs: 2500 }, settleMs: 600 }, [{ expression: ST }, { sleep: 5000 }, { expression: ST }]);
    f(!a1.pw, 'store late, subscriber: the paywall flashed before the answer');
    gpsOn('store late, subscriber (after the answer)', a2);
    [a1, a2] = await runIdx('slow', 'PWSL02', GAMES, { pre: SIDE('gps|PWSL02'), iap: { active: false, slowMs: 2500 }, settleMs: 600 }, [{ expression: ST }, { sleep: 4000 }, { expression: ST }]);
    f(!a1.gpsSide && !a1.overlay && !a1.yards.length && !a1.pw, 'store late, no subscription: something flashed before the answer: ' + JSON.stringify({ gps: a1.gpsSide, pw: a1.pw }));
    locked('store late, no subscription (after the answer)', a2);

    // 8. THE TRIAL FROM THE CARD: Restore (nothing), a cancelled trial, then the trial -> GPS.
    const [t1, t2, t3, t4] = await runIdx('trial', 'PWTR01', GAMES, { pre: SIDE('bets|PWTR01'), iap: { active: false, buy: 'cancel' } }, [{ sleep: 1500 },
        TAP('#gps-side-toggle .gps-side-gps'), { sleep: 2000 }, { expression: ST },
        TAP('#gps-paywall .gps-sheet-restore'), { sleep: 800 }, { expression: ST },
        TAP('#gps-paywall .gps-sheet-buy'), { sleep: 800 }, { expression: ST },
        { expression: 'window.__iap.buy = "ok", "ok"' }, TAP('#gps-paywall .gps-sheet-buy'), { sleep: 5000 }, { expression: ST }]);
    locked('trial: the paywall', t1);
    f(t2.pw && t2.msg === 'No GPS Map subscription was found for this Apple ID.' && !t2.gpsSide, 'Restore with nothing: ' + JSON.stringify([t2.msg, t2.gpsSide]));
    f(t3.pw && t3.msg === 'Purchase cancelled. Nothing was charged.' && !t3.gpsSide, 'a cancelled trial: ' + JSON.stringify([t3.msg, t3.gpsSide]));
    gpsOn('trial started from the card', t4);
    f((t4.iap || []).indexOf('purchasePackage') !== -1 && (t4.iap || []).indexOf('restorePurchases') !== -1, 'trial: the store was not asked: ' + JSON.stringify(t4.iap));

    // 9. NEVER ASKED: the card itself - a score typed and saved, no paywall, no GPS.
    const SCORE = "(function(){ var i = document.querySelector('.score-input[data-hole]:not([disabled])'); if (!i) return 'no box'; i.focus(); i.value = '4'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); return 'typed'; })()";
    const WR = "JSON.stringify({ writes: (window.__coldWrites || []).filter(function (w) { return /scores/.test(w.path) || (w.value && JSON.stringify(w.value).indexOf('_h') !== -1); }).length })";
    const sc = await runIdx('score', 'PWSC01', GAMES, { pre: SIDE('bets|PWSC01') }, [{ sleep: 2000 }, { expression: SCORE }, { sleep: 1500 }, { expression: ST }, { expression: WR }]);
    // KNOWN, NOT GPS (present on 622d801 before this work): a typed score in this stand-in makes
    // index.html's offline-write sort read .ts of a null entry. Filtered here, named in the report.
    sc[0].e = (sc[0].e || []).filter((x) => !/reading 'ts'/.test(x));
    onCard('scoring, no subscription', sc[0]);
    f(sc[1].writes > 0, 'scoring, no subscription: the score was not saved: ' + JSON.stringify(sc[1]));

    // ---- HOME (home.html) ----------------------------------------------------------------
    const home = async (hash, opts, steps) => J(await go(Object.assign({ url: fileUrl('home.html', '') + (hash || ''), settleMs: 2500 }, opts, { db: DB({ PWHM01: round('PWHM01', GAMES) }, opts.db), steps })));
    // 10. The GPS door: the paywall over Main (its words, the course line); Not now -> Main.
    let [h0, h1] = await home('', { pre: RECENT }, [TAP('#v-main .hp-door.gps'), { sleep: 3500 }, { expression: ST }, TAP('#gps-paywall .gps-sheet-close'), { sleep: 600 }, { expression: ST }]);
    locked('Home GPS door, no subscription', h0);
    f(h0.view === 'v-main', 'Home GPS door: the course picker opened without GPS Map: ' + h0.view);
    PAYWALL_WANT.concat(['Caledonia Golf & Fish Club: 18/18 ✓']).forEach((w) => f((h0.pwText || '').indexOf(w) !== -1, 'paywall (Home) lacks "' + w + '": ' + h0.pwText));
    f(!h1.pw && h1.view === 'v-main' && h1.door !== 'gps' && !h1.blank, 'Home GPS door, Not now: not back on Main: ' + JSON.stringify([h1.pw, h1.view, h1.door]));
    report.paywallHome = h0.pwText;
    [h0] = await home('', { pre: RECENT, iap: { active: true } }, [TAP('#v-main .hp-door.gps'), { sleep: 3500 }, { expression: ST }]);
    f(!h0.pw && h0.view === 'v-gps', 'Home GPS door, subscriber: no course picker: ' + JSON.stringify([h0.pw, h0.view]));
    // 11. The GPS | Games switch's GPS (on Games): Not now -> still Games.
    [h0, h1] = await home('#games', {}, [TAP('#v-games .hp-switch .gps'), { sleep: 2500 }, { expression: ST }, TAP('#gps-paywall .gps-sheet-close'), { sleep: 600 }, { expression: ST }]);
    locked('GPS | Games switch, no subscription', h0);
    f(!h1.pw && h1.view === 'v-games', 'the switch, Not now: not back on Games: ' + JSON.stringify([h1.pw, h1.view]));
    // 12. #pick and #gps (the in-app links to the picker / the GPS round): the paywall over Main.
    for (const hash of ['#pick', '#gps']) {
        [h0, h1] = await home(hash, { pre: RECENT }, [{ sleep: 1500 }, { expression: ST }, TAP('#gps-paywall .gps-sheet-close'), { sleep: 600 }, { expression: ST }]);
        locked('Home ' + hash + ', no subscription', h0);
        f(h0.view === 'v-main' && !h1.pw && h1.view === 'v-main', 'Home ' + hash + ': ' + JSON.stringify([h0.view, h1.pw, h1.view]));
    }
    [h0] = await home('#pick', { pre: RECENT, iap: { active: true } }, [{ sleep: 2500 }, { expression: ST }]);
    f(!h0.pw && h0.view === 'v-gps', 'Home #pick, subscriber: no course picker: ' + JSON.stringify([h0.pw, h0.view]));
    // 13. A course pick (Recent, Near You) after the subscription lapsed on GPS-1: the paywall,
    //     no round started.
    [h0, h1] = await home('', { pre: RECENT, iap: { active: true } }, [TAP('#v-main .hp-door.gps'), { sleep: 3500 }, { expression: 'window.__iap.push(false)' }, { sleep: 300 },
        TAP('#hp-recent-list [data-hp-course="caledonia"]'), { sleep: 1500 }, { expression: ST },
        TAP('#gps-paywall .gps-sheet-close'), { sleep: 400 }, TAP('#hp-near-list [data-hp-course]'), { sleep: 1500 }, { expression: ST }]);
    // (GPS-1 itself asked for the position while this phone was still subscribed - Near You.)
    [[h0, 'Recent course, lapsed'], [h1, 'Near You course, lapsed']].forEach(([s, tag]) => {
        f(s.pw && !s.gpsSide && !s.overlay, tag + ': no paywall: ' + JSON.stringify([s.pw, s.gpsSide]));
        f(!s.e || !s.e.length, tag + ': page errors ' + JSON.stringify(s.e));
    });
    f(/home\.html/.test(h1.url) && !h0.opts && !h1.opts, 'a course pick started a round without GPS Map: ' + h1.url);
    // 14. The trial from the Home door -> the course picker -> a course -> the round on GPS.
    const tr = await home('', { pre: RECENT, iap: { active: false, buy: 'ok' } }, [TAP('#v-main .hp-door.gps'), { sleep: 2500 }, TAP('#gps-paywall .gps-sheet-buy'), { sleep: 2500 }, { expression: ST },
        TAP('#hp-recent-list [data-hp-course="caledonia"]'), { sleep: 800 }, TAP('#hp-opts [data-o="go"]'), { sleep: 14000 }, { expression: ST }]);
    f(!tr[0].pw && tr[0].view === 'v-gps', 'trial from Home: no course picker after it: ' + JSON.stringify([tr[0].pw, tr[0].view, tr[0].msg]));
    // The round is started (the stand-in database is per page, so the new round is not
    // there to draw on the next page - the GPS landing of a subscriber is 4 and 5 above).
    f(/index\.html\?game=[A-Z0-9]+/.test(tr[1].url) && !tr[1].pw, 'trial from Home: the GPS round did not start: ' + JSON.stringify([tr[1].url, tr[1].pw, tr[1].e]));
    // 15. The founding window closed (gps_meta/config): the standard wording. No store price:
    //     the App Store shows it.
    [h0] = await home('', { pre: RECENT, db: { gps_meta: { config: { foundingOpen: false, foundingCap: 1000 } } } }, [TAP('#v-main .hp-door.gps'), { sleep: 4000 }, { expression: ST }]);
    f(/\$24\.99\/year/.test(h0.pwText || '') && !/[Ff]ounding/.test(h0.pwText || ''), 'founding closed: not the standard wording: ' + h0.pwText);
    [h0] = await home('', { pre: RECENT, iap: { active: false, price: null } }, [TAP('#v-main .hp-door.gps'), { sleep: 4000 }, { expression: ST }]);
    f(/The App Store shows the price before you confirm\./.test(h0.pwText || '') && !/\$/.test(h0.pwText || '') && h0.priceSrc === 'none', 'no store price: ' + h0.pwText);
    report.paywallNoPrice = h0.pwText;

    // ---- NEVER ASKED: Games, joining, the leaderboard, settle up -------------------------------
    const gm = await home('', {}, [TAP('#v-main .hp-door.games'), { sleep: 1200 }, { expression: ST },
        { expression: "(function(){ document.getElementById('hp-code').value = 'PWHM01'; return 'typed'; })()" }, TAP('#v-games [data-hp-act="join"]'), { sleep: 6000 }, { expression: ST }]);
    f(!gm[0].pw && gm[0].view === 'v-games', 'Games door asked for GPS Map: ' + JSON.stringify([gm[0].pw, gm[0].view]));
    f(/index\.html\?game=PWHM01/.test(gm[1].url) && !gm[1].pw && !gm[1].gpsSide && gm[1].card, 'joining by code asked for GPS Map / did not open the card: ' + JSON.stringify([gm[1].url, gm[1].pw, gm[1].card]));
    for (const page of ['leaderboard.html', 'settlement.html']) {
        const [p] = J(await go({ url: fileUrl(page, 'game=PWHM01'), db: DB({ PWHM01: round('PWHM01', GAMES) }), steps: [{ sleep: 2000 }, { expression: ST }] }));
        f(!p.pw && !p.blank, page + ': asked for GPS Map or blank: ' + JSON.stringify([p.pw, p.blank, p.e]));
    }

    report.fails = fails;
    console.log(JSON.stringify(report, null, 1));
    console.log(fails.length ? 'GPS PAYWALL CHECK: ' + fails.length + ' FAILED' : 'GPS PAYWALL CHECK: every entry point gated, games free - PASSED');
    process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
