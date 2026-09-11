// ============================================================================
// THE ANDROID SHELL HANDS OUT LINKS TO ITSELF
//
// Capacitor on Android serves the page from https://localhost - not from
// capacitor://localhost as iOS does. shareBaseUrl() decided "is this an address
// another phone can reach?" from the origin alone, and https://localhost passes
// that test on its face: it is https, it has a host. So every link the Android
// build could produce came out as
//
//     https://localhost/index.html?game=L6Y38G&group=1
//
// which opens nothing on the phone that receives it. The invite link, the QR,
// every group scorekeeper link, the organizer link, the follow link and the
// trip link - the same set the iOS wrapper broke once already, broken again by
// a different origin that the first fix could not see.
//
// THE RULE NOW HAS TWO HALVES. A native shell hands out the canonical web
// origin whatever it is served from, because a shell is never an address; a web
// page keeps handing out its own. The shell is recognised by asking Capacitor
// directly - window.Capacitor.isNativePlatform() - and NOT by html.is-native or
// GolfNet.isNative, because leaderboard.html does not load pwa-boot.js and the
// class only lands after load.
//
// A web developer serving the repo from https://localhost is deliberately left
// alone: with no Capacitor object present, that page shares links to itself, as
// every http/https page does.
//
// EVERY TEST HERE ARRIVES THE WAY A GOLFER DOES. The page is opened on ?game=,
// its own value listener is fired with the round, and the control a golfer taps
// is found in the markup the page rendered and pressed through its own onclick.
// shareBaseUrl, renderGroupLinksPanel, shareResults and shareRecap are never
// named in a test body; the link asserted is the one the clipboard or the SMS
// body actually received.
//
// WHAT MINI-DOM CANNOT PROVE: geometry, and that the onclick attribute is wired
// to a real button element. The markup is a string here. tools/share-url-check.js
// covers the non-web origin in Chrome; nothing in this file asserts layout.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadHtmlInlineScript, REPO_ROOT } = require('./helpers/load-script.js');

const read = f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const WEB = 'https://golf-app-5a5.pages.dev';
const CODE = 'ANDR01';
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const roster = n => Array.from({ length: n }, (_, i) =>
    ({ id: 101 + i, name: 'Golfer ' + String.fromCharCode(65 + i), hcp: '10' }));

// The four addresses a page can be served from, as window.location reports them.
const ORIGINS = {
    android:   { protocol: 'https:',     origin: 'https://localhost',      host: 'localhost' },
    ios:       { protocol: 'capacitor:', origin: 'capacitor://localhost',  host: 'localhost' },
    devServer: { protocol: 'http:',      origin: 'http://localhost:8080',  host: 'localhost:8080' },
    web:       { protocol: 'https:',     origin: WEB,                      host: 'golf-app-5a5.pages.dev' },
};

// Places the page at an origin and, optionally, inside a Capacitor shell. Set
// BEFORE the round arrives, so nothing the page does on arrival can have read
// the harness default. `capacitor` is what window.Capacitor holds: undefined
// (a plain web page), or an object whose isNativePlatform() answers.
function situate(sb, page, originKey, capacitor) {
    const o = ORIGINS[originKey];
    const loc = { protocol: o.protocol, origin: o.origin, host: o.host, hostname: 'localhost',
                  pathname: '/' + page, search: '?game=' + CODE,
                  href: o.origin + '/' + page + '?game=' + CODE };
    vm.runInContext('location = ' + JSON.stringify(loc) + '; window.location = location;', sb);
    if (capacitor !== undefined) {
        vm.runInContext('window.Capacitor = ' + capacitor + ';', sb);
    }
}

// The round the page's own listener receives. Eight golfers, so the scorecard
// has two groups and therefore something to hand out.
function arrive(sb, data) {
    const handlers = sb.__dbHandlers.filter(h => h.event === 'value');
    assert.ok(handlers.length > 0, 'the page registered no value handler on arrival');
    handlers.forEach(h => h.cb({ val: () => data, exists: () => true }));
}

// A golfer's tap: the onclick attribute of the control, read out of the markup
// the page rendered, run as the browser would run it. `this` inside an inline
// handler is the button; the harness has no element, so it gets a plain object.
function tap(sb, markup, pattern) {
    const m = pattern.exec(markup);
    assert.ok(m, 'the control a golfer taps is not in the rendered markup: ' + pattern);
    vm.runInContext('(function () { ' + m[1] + ' }).call({ innerHTML: "" })', sb);
}

// ---- The scorecard: Group Links -> Copy -------------------------------------
// The Copy button's inline handler passes `this` (the button) as its third
// argument; the harness has no element, so a plain object stands in.
function copyGroupOne(sb, panel) {
    const m = /onclick="copyGroupLinkFromScorecard\('([^']*)', 1, this\)"/.exec(panel);
    assert.ok(m, 'Group 1 has no Copy control');
    vm.runInContext('(function () { copyGroupLinkFromScorecard(' + JSON.stringify(m[1])
        + ', 1, this); }).call({ innerHTML: "" })', sb);
    return m[1];
}

function scorecard(originKey, capacitor) {
    const sb = loadHtmlInlineScript('index.html', [], { search: '?game=' + CODE });
    situate(sb, 'index.html', originKey, capacitor);
    const copied = [];
    sb.navigator.clipboard.writeText = t => { copied.push(String(t)); return Promise.resolve(); };
    arrive(sb, { gameFormat: 'stroke', players: roster(8), courseData: CD, scores: {},
                 organizerToken: 'tok1' });
    tap(sb, sb.document.getElementById('group-filter-container').innerHTML,
        /onclick="(toggleGroupLinksPanel\(\))"/);
    const panel = sb.document.getElementById('group-links-panel').innerHTML;
    assert.match(panel, /Scorekeeper Links/, 'the links panel did not open');
    const onButton = copyGroupOne(sb, panel);
    assert.equal(copied.length, 1, 'the Copy tap put nothing on the clipboard');
    assert.equal(copied[0], onButton, 'the clipboard got something other than the button\'s link');
    // Every link on the panel - group links and the organizer link - so a fix
    // that reached one builder and not the other cannot pass.
    const all = [...panel.matchAll(/https?:\/\/[^'"&]+\?game=[^'"]*/g)].map(m => m[0]);
    return { copied: copied[0], all };
}

// ---- The leaderboard: Text Live Link ----------------------------------------
// With no navigator.share the page hands the link to the Messages app in an
// sms: URL. Returns the URL inside that body.
function leaderboardTextedLink(originKey, capacitor) {
    const sb = loadHtmlInlineScript('leaderboard.html', [], { search: '?game=' + CODE });
    situate(sb, 'leaderboard.html', originKey, capacitor);
    sb.navigator.share = undefined;
    arrive(sb, { gameFormat: 'stroke', players: roster(4), courseData: CD,
                 scores: { p101_h1: 4 }, courseName: 'Caledonia' });
    const rendered = [...sb.__elementRegistry.values()].map(e => e.innerHTML || '').join('\n');
    tap(sb, rendered, /onclick="(shareResults\(\))"/);
    const href = String(sb.location.href);
    assert.match(href, /^sms:/, 'the tap did not hand a text to Messages: ' + href);
    const body = decodeURIComponent(href.replace(/^sms:\?&body=/, ''));
    const m = /(https?:\/\/\S+)/.exec(body);
    assert.ok(m, 'the text carries no link: ' + body);
    return m[1];
}

const NATIVE = '{ isNativePlatform: function () { return true; } }';
const CAPACITOR_ON_WEB = '{ isNativePlatform: function () { return false; } }';

// ============================================================================
describe('THE ANDROID SHELL - https://localhost inside Capacitor', () => {

    test('the scorecard\'s Group Links copy a link to the web app, not to localhost', () => {
        const r = scorecard('android', NATIVE);
        assert.equal(r.copied, WEB + '/index.html?game=' + CODE + '&group=1');
    });

    test('and every link on that panel - all groups and the organizer\'s - is a web link', () => {
        const r = scorecard('android', NATIVE);
        assert.equal(r.all.length, 3, 'two group links and one organizer link expected');
        r.all.forEach(u => assert.ok(u.startsWith(WEB + '/'), 'a localhost link is on the panel: ' + u));
        assert.ok(r.all.some(u => /organizer=tok1/.test(u)), 'the organizer link is missing');
    });

    test('the leaderboard\'s Text Live Link texts a link to the web app', () => {
        assert.equal(leaderboardTextedLink('android', NATIVE), WEB + '/shared.html?game=' + CODE);
    });
});

describe('A WEB PAGE ON https://localhost IS STILL A WEB PAGE', () => {

    test('with no Capacitor at all, the scorecard shares links to itself', () => {
        const r = scorecard('android', undefined);
        assert.equal(r.copied, 'https://localhost/index.html?game=' + CODE + '&group=1');
    });

    test('and so does the leaderboard', () => {
        assert.equal(leaderboardTextedLink('android', undefined),
            'https://localhost/shared.html?game=' + CODE);
    });

    test('a Capacitor object that says it is NOT native is a web page too', () => {
        // @capacitor/core on the web defines window.Capacitor and answers false.
        const r = scorecard('android', CAPACITOR_ON_WEB);
        assert.equal(r.copied, 'https://localhost/index.html?game=' + CODE + '&group=1');
    });
});

describe('THE CASES THAT ALREADY WORKED STILL DO', () => {

    test('a local dev server on http://localhost:8080 shares links to itself', () => {
        assert.equal(scorecard('devServer', undefined).copied,
            'http://localhost:8080/index.html?game=' + CODE + '&group=1');
        assert.equal(leaderboardTextedLink('devServer', undefined),
            'http://localhost:8080/shared.html?game=' + CODE);
    });

    test('the iOS shell on capacitor://localhost shares the web app, with or without the flag', () => {
        assert.equal(scorecard('ios', NATIVE).copied, WEB + '/index.html?game=' + CODE + '&group=1');
        assert.equal(scorecard('ios', undefined).copied, WEB + '/index.html?game=' + CODE + '&group=1');
        assert.equal(leaderboardTextedLink('ios', NATIVE), WEB + '/shared.html?game=' + CODE);
    });

    test('the production site shares itself', () => {
        assert.equal(scorecard('web', undefined).copied, WEB + '/index.html?game=' + CODE + '&group=1');
    });
});

describe('HOW THE SHELL IS RECOGNISED', () => {

    // leaderboard.html loads no pwa-boot.js, so GolfNet and html.is-native do not
    // exist there; and the class lands on `load`, after a page may already have
    // built a link. Capacitor's own answer is the only one present on every page
    // from the first line of script.
    test('shareBaseUrl asks Capacitor directly, not pwa-boot', () => {
        const src = read('product-links.js').replace(/\/\/.*$/gm, '');
        const at = src.indexOf('function shareBaseUrl');
        assert.ok(at > -1, 'shareBaseUrl is gone');
        const end = src.indexOf('\nfunction ', at + 30);
        const body = src.slice(at, end > -1 ? end : undefined);
        assert.match(body, /Capacitor/, 'shareBaseUrl never asks Capacitor whether it is native');
        assert.match(body, /isNativePlatform/, 'shareBaseUrl does not call isNativePlatform');
        assert.ok(!/GolfNet|is-native|classList/.test(body),
            'shareBaseUrl leans on pwa-boot, which leaderboard.html does not load');
    });

    test('leaderboard.html really does not load pwa-boot.js - the reason the rule is shaped this way', () => {
        assert.ok(!/pwa-boot\.js/.test(read('leaderboard.html')),
            'leaderboard.html now loads pwa-boot.js; the rationale above should be revisited, not the rule');
    });
});

// ============================================================================
// THE TRIP RECAP: "Share as Text" on a phone with no share sheet
//
// Android's WebView has no navigator.share. The recap must still leave the
// phone, so it goes to the clipboard - the same thing admin.html's shareMainApp
// does. And when the share sheet DOES exist and the golfer closes it, that is a
// choice, not a failure: nothing may be copied behind their back.
// ============================================================================

const TRIP_DEPS = ['money-engine.js', 'action-model.js', 'settlement-engine.js', 'pool-engine.js', 'score-marks.js'];

function tripRound(seed) {
    const ps = roster(4).map(p => Object.assign({}, p, { playingForMoney: true }));
    const sc = {};
    ps.forEach((p, pi) => CD.forEach((h, hi) => { sc['p' + p.id + '_h' + h.hole] = 4 + ((pi + hi + seed) % 3) - 1; }));
    return { players: ps, courseData: CD, scores: sc, settlementMode: 'whole-dollar' };
}

// A trip with two linked rounds, arrived at the way a golfer does: the trip's
// own listener fires, the page renders, and the recap has something to say.
// `share` is the navigator.share the phone offers: null for none, or a function.
function tripRecap(share) {
    const sb = loadHtmlInlineScript('trip.html', TRIP_DEPS, { search: '?trip=MYR1' });
    vm.runInContext(`
        window.__copied = []; window.__alerts = [];
        alert = m => window.__alerts.push(String(m));
        navigator.clipboard.writeText = t => { window.__copied.push(String(t)); return Promise.resolve(); };
        currentTripCode = 'MYR1';
        tripData = { name: 'Myrtle Beach 2026' };
        cachedRoundResults = ${JSON.stringify([
            { label: 'Caledonia', countsTowardTrip: true, data: tripRound(0) },
            { label: 'True Blue', countsTowardTrip: true, data: tripRound(1) }])};
        cachedCountedResults = cachedRoundResults;
        renderCumulativeLeaderboard(); renderTripMoneySettlement(); renderTripAwards();
    `, sb);
    sb.navigator.share = share || undefined;
    // The golfer's tap: the recap sheet's own button, from the page markup.
    tap(sb, read('trip.html'), /class="btn-primary recap-share" onclick="(shareRecap\(\))"/);
    return {
        copied: () => JSON.parse(JSON.stringify(vm.runInContext('window.__copied', sb))),
        alerts: () => JSON.parse(JSON.stringify(vm.runInContext('window.__alerts', sb))),
    };
}
const settle = () => new Promise(r => setTimeout(r, 10));

describe('THE TRIP RECAP LEAVES A PHONE WITH NO SHARE SHEET', () => {

    test('with navigator.share undefined the recap goes to the clipboard', async () => {
        const t = tripRecap(null);
        await settle();
        assert.equal(t.copied().length, 1, 'nothing reached the clipboard');
        assert.match(t.copied()[0], /Myrtle Beach 2026/, 'the copied text is not the recap');
        assert.match(t.copied()[0], /Join: https:\/\//, 'the copied recap carries no join link');
        assert.ok(t.alerts().some(a => /copied to clipboard/i.test(a)), 'the golfer was not told');
    });

    test('a share sheet the golfer CANCELS copies nothing', async () => {
        const abort = () => Promise.reject(Object.assign(new Error('Share canceled'), { name: 'AbortError' }));
        const t = tripRecap(abort);
        await settle();
        assert.deepEqual(t.copied(), [], 'a cancelled share sheet copied the recap behind the golfer\'s back');
        assert.deepEqual(t.alerts(), []);
    });

    test('a share sheet that succeeds copies nothing either', async () => {
        const t = tripRecap(() => Promise.resolve());
        await settle();
        assert.deepEqual(t.copied(), []);
    });

    test('a share sheet that FAILS for any other reason falls back to the clipboard', async () => {
        // A WebView that exposes navigator.share and then cannot perform it must
        // not leave the golfer with a button that does nothing.
        const broken = () => Promise.reject(Object.assign(new Error('Share not supported'), { name: 'NotAllowedError' }));
        const t = tripRecap(broken);
        await settle();
        assert.equal(t.copied().length, 1, 'a failed share left the recap nowhere');
        assert.match(t.copied()[0], /Myrtle Beach 2026/);
    });

    test('the share sheet, when offered, receives the recap - not a link only', async () => {
        const calls = [];
        const t = tripRecap(payload => { calls.push(payload); return Promise.resolve(); });
        await settle();
        assert.equal(calls.length, 1);
        assert.match(String(calls[0].text), /Myrtle Beach 2026/);
        assert.deepEqual(t.copied(), []);
    });
});
