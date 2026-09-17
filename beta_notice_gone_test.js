// ============================================================================
// THE BETA NOTICE IS GONE. The app is released (App Store 1.0.1, 2026-09-15).
//
// WHAT WAS THERE. index.html carried BETA_END_DATE = 2026-09-01 and a
// renderBetaNotice() that returned early while the date had NOT passed - so the
// "You're on a beta build" bar appeared only AFTER the date, and from then on
// permanently, on a public release. The copy described an app that no longer
// existed. The whole block is removed: the const, betaPeriodEnded, the renderer
// and its DOMContentLoaded listener. There is no native-only gate in its place.
// The betaNoticeDismissed localStorage key is left alone; nothing reads it now.
//
// WHY CHROME FOR THE ARRIVAL. helpers/mini-dom.js's document.addEventListener is
// a deliberate no-op, so DOMContentLoaded never fires there and the harness could
// not have shown the bar even when it existed - a mini-dom test of this would be
// green on both sides. The arrival below is a cold load of index.html on a round
// through tools/lib/cold-arrival.js, with the CLOCK FAKED to a date after
// 2026-09-01 by a preScript that runs before any page script - the state in which
// the old block rendered its bar. Nothing the page defines is invoked; the page
// runs its own init, listeners and render, and the probe only reads.
//
// The source half reads every file sync-mobile-web.js ships in the Consumer
// bundle (SHARED_SHELL + CONSUMER_SHELL), decoded through helpers/decode-escapes.js
// so a "beta build" written as \u escapes cannot hide.
//
// batch1_safety_test.js keeps the guard against the OLD kill switch (the wipe
// and throw past the date); this file guards that the notice did not come back.
// ============================================================================

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
const { makeCourseData, makePlayers } = require('./helpers/fixtures.js');
const { decodeEscapes } = require('./helpers/decode-escapes.js');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

// The five names of the removed block, and the sentence it rendered.
const IDENTIFIERS = ['BETA_END_DATE', 'betaPeriodEnded', 'renderBetaNotice', 'beta-notice-bar', 'betaNoticeDismissed'];
const COPY = /beta build/i;

// Every file the Consumer bundle ships, from the declarations themselves, the way
// privacy_accuracy_test.js reads them. Vendored Firebase bundles and binaries are
// not app copy.
function shippedFiles() {
    const S = read('sync-mobile-web.js');
    const d = name => {
        const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(S);
        assert.ok(m, name + ' must be declared in sync-mobile-web.js');
        return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    };
    return d('SHARED_SHELL').concat(d('CONSUMER_SHELL'))
        .filter(f => !/^firebase-/.test(f) && !/\.(png|json)$/.test(f));
}

describe('THE SHIPPED CONSUMER BUNDLE CARRIES NO BETA NOTICE', () => {
    const files = shippedFiles();

    test('POSITIVE: the list is real - index.html is in it and still initialises Firebase', () => {
        assert.ok(files.length >= 20, 'expected the Consumer bundle list, got ' + files.length + ' files');
        assert.ok(files.includes('index.html'));
        // The line that sat right under the removed block. If this is gone the
        // absence checks below are reading the wrong file, not a clean one.
        assert.ok(read('index.html').includes('const firebaseConfig = {'));
    });

    test('the five identifiers of the removed block are in no shipped file', () => {
        const hits = [];
        files.forEach(f => {
            const src = read(f);
            IDENTIFIERS.forEach(id => { if (src.includes(id)) hits.push(f + ': ' + id); });
        });
        assert.deepEqual(hits, []);
    });

    test('"beta build" is in no shipped file, escapes decoded first', () => {
        const hits = files.filter(f => COPY.test(decodeEscapes(read(f))));
        assert.deepEqual(hits, []);
    });
});

// A four-golfer stroke round, the way a golfer arrives at it.
const CD = makeCourseData(18);
const P = makePlayers(['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta'], [2, 9, 15, 4], 101);
const DB = { events: { BETA1: { eventName: 'Released', courseName: 'Test', players: P, gameFormat: 'stroke', skinsBuyIn: 0, skinsCarryOver: false, courseData: CD, scores: {}, settlementMode: 'whole-dollar' } },
    global_courses: {}, trips: {}, tournaments: {} };

// THE CLOCK, FAKED. 2026-12-25 is after the old BETA_END_DATE (2026-09-01), the
// state in which the removed block rendered its bar. Installed before any page
// script so `new Date()` at parse time already reads the faked instant.
const FAKE_NOW = Date.UTC(2026, 11, 25, 12, 0, 0);
const CLOCK = `(function () {
  var RealDate = Date, NOW = ${FAKE_NOW};
  function FakeDate() {
    if (!(this instanceof FakeDate)) return RealDate();
    return arguments.length ? new (Function.prototype.bind.apply(RealDate, [null].concat(Array.prototype.slice.call(arguments))))() : new RealDate(NOW);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function () { return NOW; };
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  window.Date = FakeDate;
})();`;

const PROBE = `(function () {
  var bar = document.getElementById('beta-notice-bar');
  var main = document.getElementById('main-content');
  var card = document.getElementById('hole-view-card');
  var boxes = card ? card.querySelectorAll('.score-input') : [];
  var hd = card && card.querySelector('.hole-view-header');
  return JSON.stringify({
    clockYear: new Date().getFullYear(), clockMonth: new Date().getMonth() + 1,
    afterOldDate: new Date() > new Date('2026-09-01T00:00:00'),
    bar: bar ? { display: getComputedStyle(bar).display, text: bar.innerText.replace(/\\s+/g, ' ').trim() } : null,
    betaInText: /beta build/i.test(document.body.innerText),
    mainDisplay: main ? getComputedStyle(main).display : null,
    firstChildId: main && main.firstElementChild ? (main.firstElementChild.id || main.firstElementChild.tagName) : null,
    boxes: boxes.length, heading: hd ? hd.innerText.replace(/\\s+/g, ' ').trim() : null
  });
})()`;

describe('A GOLFER ARRIVING AFTER 2026-09-01 SEES NO BETA BAR AND A NORMAL SCORECARD', () => {
    let r, s;
    before(async () => {
        r = await arriveCold({ url: fileUrl('index.html', 'game=BETA1'), db: DB, viewport: { width: 390, height: 844 },
            preScript: CLOCK, expression: PROBE, settleMs: 3500 });
        if (!r.ok) throw new Error('cold arrival could not run: ' + r.reason);
        s = JSON.parse(r.value);
    });

    test('POSITIVE: the page really ran on the faked clock, past the old date', () => {
        assert.equal(s.clockYear, 2026);
        assert.equal(s.clockMonth, 12);
        assert.equal(s.afterOldDate, true);
    });

    test('POSITIVE: the scorecard rendered - main content shown, four score boxes, a hole heading', () => {
        assert.equal(s.mainDisplay, 'block');
        assert.equal(s.boxes, 4, 'one score box per golfer in Hole View');
        assert.match(String(s.heading), /Hole 1/);
    });

    test('no #beta-notice-bar exists, and nothing on screen says "beta build"', () => {
        assert.equal(s.bar, null, 'a beta bar is on the page: ' + JSON.stringify(s.bar));
        assert.equal(s.betaInText, false);
        assert.notEqual(s.firstChildId, 'beta-notice-bar', 'the bar used to be inserted as .container\'s first child');
    });
});
