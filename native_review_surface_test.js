// ============================================================================
// THREE NATIVE-BUNDLE BEHAVIOURS THAT CONTRADICT THE APP STORE REPLY.
//
// The reply to Apple's Guideline 2.1 (Information Needed) request states that
// the iOS app has no hidden features, no content visible to strangers, and one
// external service (Firebase). admin.html ships in CONSUMER_SHELL, so the iOS
// bundle carries all three of the following, byte-identical to the web page
// (measured: sha256 of admin.html and ios/App/App/public/admin.html match):
//
//   1  A HIDDEN FEATURE. Five taps on the logo opens #secret-master-panel,
//      which offers "Push to Global Database" (a mass write to global_courses),
//      a settlement-mode switch, and "Distribute Beta App".
//   2  CONTENT VISIBLE TO STRANGERS, WRITTEN FROM THE APP. The course picker
//      lists community-mapped courses (comm_ keys) written by other users, and
//      two paths write permanently into that shared node.
//   3  A SECOND EXTERNAL SERVICE, ADVERTISED. The picker offers "Search online
//      for X" and fetches /api/course-search and /api/course/<id>.
//
// The web product must behave exactly as today. Every assertion below therefore
// comes in a pair: the native arm proves the surface is gone, and the WEB arm
// proves it is still there. A guard that broke both would pass a native-only
// test file forever.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE DRIVES A REAL BROWSER INSTEAD OF mini-dom
// ---------------------------------------------------------------------------
//
// Every other UI test in this repo runs the page under helpers/mini-dom.js.
// That harness CANNOT reach any of these entry points, and the reasons are the
// ones CLAUDE.md already records:
//
//   - The logo is `<div class="lobby-logo" onclick="handleSecretTap()">`. Static
//     attributes are not parsed by mini-dom, so the handler does not exist and
//     the only way to "tap" it would be to call handleSecretTap() by name -
//     which tests the function, not the tap.
//   - Visibility is the whole claim here, and mini-dom's getBoundingClientRect
//     is a hard-coded zero rect with no getClientRects at all. "The panel stays
//     hidden" cannot be measured against a harness with no layout.
//   - html.is-native is added by pwa-boot.js on window load. There is no load
//     event to wait for under the sandbox.
//
// So this file uses tools/lib/cold-arrival.js: real Chrome, real listeners, the
// firebase bundles blocked and a stand-in injected before any page script. The
// native context is created the way pwa-boot detects it and no other way - see
// NATIVE_PRESCRIPT below - and nothing in this file calls a function admin.html
// defines. Every action is a click, a focus, a keystroke or a value change.
//
// COST, STATED PLAINLY: this adds six Chrome launches to `npm test`, roughly
// 100 seconds. Every other test in the suite is milliseconds. That is the price
// of proving a tap instead of a function call, and for an App Store claim it is
// worth paying.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');

// NRS_PAGE points the whole file at a temp copy of admin.html. That is how the
// negative controls run: a copy with one guard deleted, and the matching native
// assertion must go red. Unset in normal use.
const PAGE = process.env.NRS_PAGE || 'admin.html';
const CODE = 'NRSX';

// ---------------------------------------------------------------------------
// THE NATIVE CONTEXT, BUILT THE WAY pwa-boot.js DETECTS IT AND NO OTHER WAY.
//
// pwa-boot.js:39 isNativeShell():
//     if (typeof window.Capacitor !== 'undefined') {
//         if (typeof window.Capacitor.isNativePlatform === 'function') {
//             return window.Capacitor.isNativePlatform();
//         }
//         return true;
//     }
//     return window.location.protocol === 'capacitor:';
//
// and pwa-boot.js:292 adds html.is-native when that is true. This prescript
// supplies exactly the first branch - the one a real Capacitor shell takes.
// It does NOT set the class itself: the page's own boot must do that, or the
// guards would be measured against a condition this test invented.
// ---------------------------------------------------------------------------
const NATIVE_PRESCRIPT = `
    window.Capacitor = { isNativePlatform: function () { return true; } };`;

// ---------------------------------------------------------------------------
// INSTRUMENTATION, shared by both contexts so neither is measured differently.
//
// It records and it never fakes an outcome the page can read as success:
//   - fetch is recorded and REJECTED. On file:// a request to /api/... would
//     fail anyway; rejecting makes that deterministic instead of depending on
//     how Chrome treats a file-scheme path.
//   - global_courses writes are recorded and resolved, so a round that does
//     publish still completes and "the round saved" stays measurable.
// ---------------------------------------------------------------------------
const INSTRUMENT = `
    window.__fetches = [];
    window.__origFetch = window.fetch;
    window.fetch = function (u) {
        window.__fetches.push(String(u));
        return Promise.reject(new Error('blocked by native_review_surface_test'));
    };
    window.__gcWrites = [];
    window.__alerts = [];
    window.alert = function (m) { window.__alerts.push(String(m)); };
    window.confirm = function () { return true; };
    (function () {
        var iv = setInterval(function () {
            if (!window.firebase || !window.firebase.database) return;
            clearInterval(iv);
            var orig = window.firebase.database;
            window.firebase.database = function () {
                var real = orig();
                return { ref: function (p) {
                    var r = real.ref(p);
                    var path = String(p);
                    if (/^global_courses(\\/|$)/.test(path)) {
                        ['set', 'update', 'remove', 'push'].forEach(function (meth) {
                            var o = r[meth];
                            r[meth] = function (value) {
                                window.__gcWrites.push({ path: path, method: meth,
                                    keys: value ? Object.keys(value).sort() : [] });
                                return o ? o.apply(r, arguments) : Promise.resolve();
                            };
                        });
                    }
                    return r;
                } };
            };
        }, 5);
    })();`;

// A community course and a round, so the picker has something of each kind to
// list. comm_ is the key shape admin.html:3914 filters on.
// THE ROUND HAS TO EXIST. The first fixture here passed `events: {}`, and both
// the picker driver and the save driver timed out at their first step because
// ?game=CODE with no such round never reaches a usable wizard. The shape below
// is the one tools/course-picker-search-check.js and
// tools/course-publish-merge-check.js both use, for exactly that reason.
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const DB = {
    events: { [CODE]: {
        eventName: 'Saturday', courseName: 'Caledonia Golf & Fish Club',
        activeCourseKey: 'caledonia', gameFormat: 'stroke', courseData: CD,
        players: [{ id: 101, name: 'Dale Whitmore', hcp: '3', playingForMoney: true }],
        settlementMode: 'whole-dollar'
    } },
    trips: {}, tournaments: {},
    global_courses: {
        // A course another user mapped. This is the "content visible to
        // strangers" the App Store reply is about, and it is also the positive
        // control: if the stub never delivers it, "not listed natively" would be
        // true of a picker that lists nothing.
        comm_stranger_links: { name: 'Pine Stranger Links', data: CD }
    }
};

// ---------------------------------------------------------------------------
// DRIVER 1a - THE LOBBY. Tap the logo five times.
//
// THIS IS A SEPARATE ARRIVAL FOR A MEASURED REASON. The first version of this
// file did the taps and the typing in one journey, and every native assertion
// passed while the page had done nothing at all. Arriving with ?game=CODE shows
// #admin-screen and HIDES #lobby-screen - measured: lobby-screen visible false,
// admin-screen visible true, wizard on step 3 - so the logo is not on screen to
// tap. The absence assertions were true because the gesture never happened.
//
// The logo is a lobby element, so the lobby is where it gets tapped: no query
// string, which is what a golfer opening the app sees.
// ---------------------------------------------------------------------------
const LOBBY_DRIVER = `
    (function () {
      window.__trace = [];
      var tries = 0;
      var iv = setInterval(function () {
        if (++tries > 200) { window.__trace.push('TIMEOUT waiting for the lobby'); clearInterval(iv); return; }
        try {
          var logo = document.querySelector('.lobby-logo');
          var vis = !!(logo && (logo.offsetParent !== null ||
                     (logo.getClientRects && logo.getClientRects().length > 0)));
          if (!vis) return;
          for (var t = 0; t < 5; t++) { logo.click(); }
          window.__trace.push('tapped the logo 5 times');
          clearInterval(iv);
        } catch (e) { window.__trace.push('threw: ' + (e && e.message)); clearInterval(iv); }
      }, 60);
    })();`;

// ---------------------------------------------------------------------------
// DRIVER 1b - THE PICKER. Type a course name, then tap the online row if one is
// there. Reached with ?game=CODE and the Back buttons, which is how an
// organizer returns to the course step to correct a choice mid-setup.
// ---------------------------------------------------------------------------
function pickerDriver(query) {
    return `
    (function () {
      window.__trace = [];
      var step = 0, tries = 0;
      var visible = function (el) {
          return !!(el && (el.offsetParent !== null ||
                   (el.getClientRects && el.getClientRects().length > 0)));
      };
      var iv = setInterval(function () {
        if (++tries > 180) { window.__trace.push('TIMEOUT at step ' + step); clearInterval(iv); return; }
        try {
          if (step === 0) {
            // The picker lives on wizard step 1. Arriving with ?game=CODE lands
            // on the Review step, so the way back is the Back buttons - which is
            // how an organizer reaches it to correct a course mid-setup.
            var input = document.getElementById('course-search-input');
            if (visible(input)) { window.__trace.push('picker visible'); step = 1; return; }
            for (var b = 7; b >= 2; b--) {
              var back = document.getElementById('wizard-back-' + b);
              if (visible(back) && !back.disabled) { back.click(); return; }
            }
            return;
          }
          if (step === 1) {
            var input2 = document.getElementById('course-search-input');
            input2.focus();
            input2.dispatchEvent(new Event('focus', { bubbles: true }));
            input2.value = ${JSON.stringify(query)};
            input2.dispatchEvent(new Event('input', { bubbles: true }));
            window.__trace.push('typed ' + JSON.stringify(input2.value));
            step = 2; return;
          }
          if (step === 2) {
            // SNAPSHOT FIRST. Everything about the row is recorded here, before
            // anything is tapped, because the tap destroys what is being
            // measured.
            var dd0 = document.getElementById('course-dropdown');
            var rows0 = dd0 ? Array.prototype.slice.call(dd0.querySelectorAll('.custom-select-option')) : [];
            window.__atType = {
              atType: window.__atType || null,
    onlineRowExists: !!document.getElementById('course-online-search-row'),
              rowText: rows0.map(function (r) { return ((r.innerText || '') + '').trim(); })
            };
            // IF an online row is on screen, tap it. In the native arm there
            // should be none to tap; in the web arm this is what proves the
            // /api call still happens. Tapping is also what makes the FETCH
            // guard measurable on its own - see the defence-in-depth control.
            var online = document.getElementById('course-online-search-row');
            if (online) { online.click(); window.__trace.push('tapped the online row'); }
            else { window.__trace.push('no online row to tap'); }
            step = 3; clearInterval(iv);
            return;
          }
        } catch (e) { window.__trace.push('threw: ' + (e && e.message)); clearInterval(iv); }
      }, 60);
    })();`;
}

const LANDING_PROBE = `
(() => {
  const panel = document.getElementById('secret-master-panel');
  const dd = document.getElementById('course-dropdown');
  const rows = dd ? Array.prototype.slice.call(dd.querySelectorAll('.custom-select-option')) : [];
  // innerText, not textContent: a panel that never opened has plenty of
  // textContent. innerText is the rendered text and excludes hidden elements.
  const text = (el) => ((el && (el.innerText || '')) || '').trim();
  return JSON.stringify({
    trace: window.__trace || [],
    isNativeClass: document.documentElement.classList.contains('is-native'),
    panelExists: !!panel,
    panelInlineDisplay: panel ? (panel.style.display || '') : null,
    panelVisible: !!(panel && (panel.offsetParent !== null ||
        (panel.getClientRects && panel.getClientRects().length > 0))),
    panelText: text(panel).slice(0, 120),
    rowCount: rows.length,
    rowText: rows.map(text),
    // THE SNAPSHOT TAKEN AT TYPE TIME, BEFORE ANY TAP. Tapping the online row
    // runs the search and re-renders the dropdown, so the row is gone by the
    // time this probe runs - reading it here reported "no online row" on a page
    // that plainly had one.
    atType: window.__atType || null,
    onlineRowExists: !!document.getElementById('course-online-search-row'),
    fetches: window.__fetches || [],
    alerts: window.__alerts || []
  });
})()`;

// ---------------------------------------------------------------------------
// DRIVER 2 - the Save & Start Round path with the edit-card box ticked. Lifted
// from tools/course-publish-merge-check.js, which is the proven driver for this
// journey: tick the box, fill the 36 cells, press Next through the wizard,
// press Save.
// ---------------------------------------------------------------------------
const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const HCPS = [7, 1, 17, 3, 9, 13, 15, 5, 11, 8, 2, 18, 4, 10, 14, 16, 6, 12];

const SAVE_DRIVER = `
    (function () {
      window.__trace = [];
      var step = 0, tries = 0;
      var iv = setInterval(function () {
        if (++tries > 300) { window.__trace.push('TIMEOUT at phase ' + step); clearInterval(iv); return; }
        try {
          if (step === 0) {
            var box = document.getElementById('enable-custom-course');
            if (!box || (box.offsetParent === null &&
                (!box.getClientRects || box.getClientRects().length === 0))) {
              var n1 = document.getElementById('wizard-next-1');
              if (n1 && !n1.disabled) { n1.click(); }
              return;
            }
            if (!box.checked) {
              box.checked = true;
              box.dispatchEvent(new Event('change', { bubbles: true }));
              window.__trace.push('ticked enable-custom-course');
            }
            step = 1; return;
          }
          if (step === 1) {
            for (var i = 1; i <= 18; i++) {
              var pe = document.getElementById('c-par-' + i);
              var he = document.getElementById('c-hcp-' + i);
              if (!pe || !he) return;
              pe.value = String(${JSON.stringify(PARS)}[i - 1]);
              pe.dispatchEvent(new Event('input', { bubbles: true }));
              he.value = String(${JSON.stringify(HCPS)}[i - 1]);
              he.dispatchEvent(new Event('input', { bubbles: true }));
            }
            window.__trace.push('filled 18 par/hcp pairs');
            step = 2; return;
          }
          if (step >= 2 && step <= 7) {
            var btn = document.getElementById('wizard-next-' + step);
            if (btn && btn.offsetParent !== null && !btn.disabled) {
              btn.click(); window.__trace.push('clicked wizard-next-' + step);
            }
            step++; return;
          }
          if (step === 8) {
            var save = document.getElementById('main-save-btn');
            if (save && !save.disabled) {
              save.click(); window.__trace.push('clicked main-save-btn');
              step = 9; clearInterval(iv);
            }
            return;
          }
        } catch (e) { window.__trace.push('threw: ' + (e && e.message)); clearInterval(iv); }
      }, 60);
    })();`;

const SAVE_PROBE = `
(() => {
  const text = (el) => ((el && (el.innerText || '')) || '').trim();
  return JSON.stringify({
    trace: window.__trace || [],
    isNativeClass: document.documentElement.classList.contains('is-native'),
    gcWrites: window.__gcWrites || [],
    // THE ROUND MUST STILL SAVE. Round Ready is the organizer-visible proof.
    bodyText: (document.body.innerText || '').slice(0, 4000),
    alerts: window.__alerts || []
  });
})()`;

async function arrive(native, driver, probe, settleMs, query) {
    const r = await arriveCold({
        url: query === null ? fileUrl(PAGE) : fileUrl(PAGE, 'game=' + CODE),
        db: DB,
        preScript: (native ? NATIVE_PRESCRIPT : '') + INSTRUMENT + driver,
        expression: probe,
        settleMs: settleMs
    });
    if (!r.ok) return { ran: false, reason: r.reason, requests: r.requests || [] };
    try { return { ran: true, requests: r.requests || [], ...JSON.parse(r.value) }; }
    catch (e) { return { ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 200) }; }
}

// Four arrivals, shared by every assertion below, so `npm test` launches Chrome
// four times rather than once per test.
const S = {};
before(async () => {
    // SIX ARRIVALS, SEQUENTIAL. Three journeys - lobby, picker, save - each run
    // twice, native and web. They are not run in parallel: concurrent Chrome
    // instances driving the same profile directory is what corrupted three
    // earlier measurement runs in this repo.
    S.nativeLobby = await arrive(true, LOBBY_DRIVER, LANDING_PROBE, 6000, null);
    S.webLobby = await arrive(false, LOBBY_DRIVER, LANDING_PROBE, 6000, null);
    S.nativePicker = await arrive(true, pickerDriver('Pine'), LANDING_PROBE, 15000);
    S.webPicker = await arrive(false, pickerDriver('Pine'), LANDING_PROBE, 15000);
    S.nativeSave = await arrive(true, SAVE_DRIVER, SAVE_PROBE, 22000);
    S.webSave = await arrive(false, SAVE_DRIVER, SAVE_PROBE, 22000);
});

const ran = (s, name) => {
    assert.ok(s && s.ran, name + ' did not run: ' + (s && s.reason));
    return s;
};

describe('THE HARNESS REACHED THE PAGE, AND THE TWO CONTEXTS DIFFER', () => {

    // POSITIVE FIRST, because every native assertion in this file is an absence
    // and every absence is true of a page that failed to load.
    test('all four arrivals ran and rendered admin.html', () => {
        ['nativeLobby', 'webLobby', 'nativePicker', 'webPicker', 'nativeSave', 'webSave'].forEach((k) => {
            ran(S[k], k);
        });
        assert.ok(S.nativeLobby.panelExists,
            'the secret panel element is not in the page at all - the driver reached something '
            + 'that is not admin.html, and every "it is hidden" assertion below would be '
            + 'trivially true');
    });

    test('the native context is the one pwa-boot detects, not one this test invented', () => {
        assert.equal(S.nativeLobby.isNativeClass, true,
            'html.is-native was not set. This test supplies window.Capacitor.isNativePlatform() '
            + 'and lets pwa-boot.js decide; if the class is absent the page never ran its own '
            + 'detection and the guards are being measured against nothing.');
        assert.equal(S.webLobby.isNativeClass, false,
            'html.is-native is set in the WEB context. Every native guard would fire on the web '
            + 'product, which is the one thing this work must not do.');
    });

    test('the drivers actually performed the gestures', () => {
        assert.ok(S.nativeLobby.trace.join(' ').includes('tapped the logo 5 times'),
            'the logo was never tapped natively: ' + JSON.stringify(S.nativeLobby.trace));
        assert.ok(S.webLobby.trace.join(' ').includes('tapped the logo 5 times'),
            'the logo was never tapped on the web: ' + JSON.stringify(S.webLobby.trace));
        assert.ok(S.nativePicker.trace.join(' ').includes('typed "Pine"'),
            'nothing was typed into the native picker: ' + JSON.stringify(S.nativePicker.trace));
        assert.ok(S.webPicker.trace.join(' ').includes('typed "Pine"'),
            'nothing was typed into the web picker: ' + JSON.stringify(S.webPicker.trace));
        assert.ok(S.nativeSave.trace.join(' ').includes('clicked main-save-btn'),
            'Save was never pressed in the native arm: ' + JSON.stringify(S.nativeSave.trace));
        assert.ok(S.webSave.trace.join(' ').includes('clicked main-save-btn'),
            'Save was never pressed in the web arm: ' + JSON.stringify(S.webSave.trace));
    });
});

describe('1 - NO HIDDEN FEATURE: FIVE TAPS OPEN NOTHING IN THE NATIVE SHELL', () => {

    test('NATIVE: five taps on the logo leave the panel hidden', () => {
        const s = ran(S.nativeLobby, 'nativeLobby');
        assert.equal(s.panelVisible, false,
            'five taps opened #secret-master-panel in the native shell. It offers Push to '
            + 'Global Database, a settlement switch and Distribute Beta App - which is exactly '
            + 'the hidden feature the App Store reply says the app does not have.\n  panel text: '
            + JSON.stringify(s.panelText));
        assert.notEqual(s.panelInlineDisplay, 'block',
            'the panel was set to display:block by the taps');
    });

    test('WEB: five taps still open it, exactly as today', () => {
        const s = ran(S.webLobby, 'webLobby');
        assert.equal(s.panelVisible, true,
            'the panel no longer opens on the web either. The native guard was written so that '
            + 'it fires everywhere, which breaks the organizer tool this panel exists for.');
        assert.equal(s.panelInlineDisplay, 'block');
    });
});

describe('2 - NO PERMANENT WRITE TO THE SHARED COURSE LIST FROM THE NATIVE SHELL', () => {

    test('NATIVE: saving with the edit-card box ticked writes NOTHING to global_courses', () => {
        const s = ran(S.nativeSave, 'nativeSave');
        assert.deepEqual(s.gcWrites, [],
            'the native app wrote to global_courses - a node whose deployed rules are '
            + '".write": "newData.exists()", so nothing can ever delete what it puts there, and '
            + 'what it puts there is visible to every other user.\n  writes: '
            + JSON.stringify(s.gcWrites));
    });

    test('NATIVE: and the round still saves, with the edited card', () => {
        // THE ARM THAT MATTERS. "Zero writes" is also what a broken Save button
        // produces. admin.html:5695 already records that the round is never
        // blocked by the publish - finalCourseData is taken from preview.data
        // locally - so suppressing the publish must cost the round nothing.
        const s = ran(S.nativeSave, 'nativeSave');
        assert.match(s.bodyText, /Round Ready|Share|Start Round/i,
            'the round did not reach Round Ready in the native shell, so "no writes" here may '
            + 'simply mean the save broke.\n  trace: ' + JSON.stringify(s.trace)
            + '\n  alerts: ' + JSON.stringify(s.alerts));
    });

    test('WEB: the same save still publishes the card, exactly as today', () => {
        const s = ran(S.webSave, 'webSave');
        const publishes = s.gcWrites.filter((w) => w.method === 'update');
        assert.ok(publishes.length >= 1,
            'the web product no longer publishes an edited card to the shared course list. That '
            + 'is the community-mapping feature, and the native guard must not have touched it.'
            + '\n  writes: ' + JSON.stringify(s.gcWrites));
        assert.deepEqual(publishes[0].keys, ['data', 'name'],
            'the publish payload changed shape: ' + JSON.stringify(publishes[0]));
    });
});

describe('3 - ONE EXTERNAL SERVICE: NO ONLINE SEARCH ROW, AND NO /api CALL', () => {

    test('NATIVE: typing a course name renders no online-search row', () => {
        const s = ran(S.nativePicker, 'nativePicker');
        assert.ok(s.atType, 'the picker snapshot was never taken: ' + JSON.stringify(s.trace));
        assert.equal(s.atType.onlineRowExists, false,
            'the native app offers "Search online" - a second external service, advertised on '
            + 'screen.\n  rows: ' + JSON.stringify(s.atType.rowText));
        assert.ok(!s.atType.rowText.some((t) => /Search online for/.test(t)),
            'an online-search row is rendered under a different id: '
            + JSON.stringify(s.atType.rowText));
    });

    test('NATIVE: nothing reaches /api/ - including when a row is tapped', () => {
        const s = ran(S.nativePicker, 'nativePicker');
        const api = (s.fetches || []).filter((u) => /\/api\//.test(u));
        assert.deepEqual(api, [],
            'the native app called the course API proxy: ' + JSON.stringify(api));
        const netApi = (s.requests || []).filter((u) => /\/api\//.test(u));
        assert.deepEqual(netApi, [],
            'a request to /api/ was seen on the wire even though window.fetch recorded none: '
            + JSON.stringify(netApi));
    });

    test('NATIVE: the picker still finds courses - the guard removed a row, not the search', () => {
        const s = ran(S.nativePicker, 'nativePicker');
        assert.ok(s.atType.rowText.some((t) => /Pine Lakes|McCormick|Myrtlewood/i.test(t)),
            'typing "Pine" natively returns no courses at all. The guard broke the picker '
            + 'instead of removing one row.\n  rows: ' + JSON.stringify(s.rowText));
    });

    test('WEB: the online row is still offered and still calls /api/course-search', () => {
        const s = ran(S.webPicker, 'webPicker');
        assert.ok(s.atType, 'the picker snapshot was never taken: ' + JSON.stringify(s.trace));
        assert.equal(s.atType.onlineRowExists, true,
            'the web picker no longer offers the online search: '
            + JSON.stringify(s.atType.rowText));
        const api = (s.fetches || []).filter((u) => /\/api\/course-search/.test(u));
        assert.ok(api.length >= 1,
            'tapping the online row on the web issued no /api/course-search call. Either the '
            + 'native guard fired on the web, or the row stopped working.\n  fetches: '
            + JSON.stringify(s.fetches) + '\n  trace: ' + JSON.stringify(s.trace));
    });
});

describe('4 - NO STRANGER CONTENT: COMMUNITY COURSES ARE NOT LISTED NATIVELY', () => {

    test('NATIVE: a comm_ course written by another user is not offered', () => {
        const s = ran(S.nativePicker, 'nativePicker');
        assert.ok(!s.atType.rowText.some((t) => /Stranger Links/.test(t)),
            'the native picker lists a course another user wrote - user-generated content shown '
            + 'to strangers, with no report or block path.\n  rows: ' + JSON.stringify(s.rowText));
        assert.ok(!s.atType.rowText.some((t) => /Community Mapped/i.test(t)),
            'the Community Mapped Courses heading is still rendered natively');
    });

    test('WEB: it is still offered, exactly as today', () => {
        // The positive control for the assertion above, and it is not optional:
        // the stub database is what puts Stranger Links in front of the page at
        // all. If the stub never reached the picker, "not listed" would be true
        // of both contexts and the native assertion would be measuring nothing.
        const s = ran(S.webPicker, 'webPicker');
        assert.ok(s.atType.rowText.some((t) => /Stranger Links/.test(t)),
            'the community course is not listed on the WEB either, so the native assertion '
            + 'above is vacuous - it would pass against a picker that lists nothing.\n  rows: '
            + JSON.stringify(s.rowText));
    });
});
