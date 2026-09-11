#!/usr/bin/env node
// ============================================================================
// PUBLISHING A COURSE CARD MUST NOT DELETE THE REST OF THE COURSE RECORD.
//
// admin.html publishes the edited card to the shared course database:
//
//     if (preview.isEditing) {
//         db.ref(`global_courses/${courseKey}`).set({ name, data });
//     }
//
// A `.set()` REPLACES THE WHOLE NODE. Today that is harmless, because a course
// record holds exactly `name` and `data` and nothing else. The moment a record
// carries anything more - imported tee sets, a street address, the provider id
// it came from - the next golfer who ticks the custom-course box and saves
// silently deletes all of it. Nothing warns, and per the deployed rules
// (global_courses/$courseId ".write": "newData.exists()") no client can put it
// back: a deletion is refused, so recovery means importing the course again.
//
// This check drives a real save on a record that HAS something to lose and
// reports what survived.
//
// ---------------------------------------------------------------------------
// WHAT THIS HARNESS CAN AND CANNOT PROVE - STATED PLAINLY
// ---------------------------------------------------------------------------
//
// cold-arrival's stub answers set() with Promise.resolve() and does not store
// anything, so there is no database here to read a merged record back out of.
// This check therefore installs ITS OWN instrumented db in the page, one that
// applies the documented Firebase semantics:
//
//     .set(v)     replaces the node wholesale
//     .update(v)  merges v's top-level keys into the node
//
// That is a simulation, and simulations are how a check ends up asserting its
// own mock. Two things keep it honest:
//
//   1  The behaviour UNDER TEST is the page's - which method it calls, and with
//      what payload. The merge semantics are Firebase's, not admin.html's, and
//      are not the thing being measured.
//   2  The simulation is SELF-TESTED before any assertion runs. If applying
//      set() to a seeded record does not wipe its siblings, and update() does
//      not preserve them, the simulation cannot tell the two apart and the whole
//      check is inert. That gate exits 2 rather than reporting a pass.
//
// NOTHING HERE CALLS A PAGE FUNCTION. Not saveSettings, not previewCourseData.
// The wizard is driven the way an organizer drives it - tick the box, type into
// the 36 cells, press Next, press Save - reusing the driver proven by
// tools/course-publish-failure-check.js.
//
// ---------------------------------------------------------------------------
// THE VACUITY GATE, WHICH IS THE POINT OF THE WHOLE FILE
// ---------------------------------------------------------------------------
//
// "The siblings survived" is TRIVIALLY TRUE of a record that had no siblings.
// A fixture seeded with only name and data would pass requirement 1 against
// `.set()` - the exact bug this exists to catch - and the run would look green.
//
// So before grading, this check asserts that the seeded record actually carried
// the extra children, that the page actually wrote to THAT key, and that a
// publish was actually attempted. Any of those missing is exit 2.
//
//   node tools/course-publish-merge-check.js
//
//   exit 0   name and data are updated and every other child survives
//   exit 1   publishing a card destroys the rest of the record
//   exit 2   could not run, the publish never happened, the fixture had nothing
//            to lose, or the set/update simulation cannot tell the two apart.
//            NOTHING PROVEN.
// ============================================================================

const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CODE = 'MRGCHK';
const KEY = 'caledonia';

const CD = [];
for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });

// The card the organizer types. Valid: par 3-6, hcpIndex a clean permutation of
// 1-18. validateCourseGrid() refuses anything else BEFORE a write is attempted,
// so an invalid card here would never reach the publish under test.
const PARS = [4, 5, 3, 4, 4, 3, 4, 5, 3, 5, 3, 4, 4, 4, 4, 4, 3, 4];
const HCPS = [12, 8, 14, 6, 2, 16, 4, 10, 18, 15, 13, 9, 5, 7, 3, 1, 17, 11];

// THE SIBLINGS. Shaped like the import record this project is heading towards -
// arrays for tees, because Firebase keys cannot contain '/' and real tee names
// include "White/Purple".
const TEES = {
    male: [
        { name: 'Copper', rating: 72.1, slope: 128, totalYards: 6768, parTotal: 71,
          holes: CD.map((h) => ({ par: h.par, yardage: 400, hcpIndex: h.hcpIndex })) },
        { name: 'White/Purple', rating: 66.6, slope: 113, totalYards: 5664, parTotal: 71,
          holes: CD.map((h) => ({ par: h.par, yardage: 350, hcpIndex: h.hcpIndex })) }
    ],
    female: [
        { name: 'Purple', rating: 70.5, slope: 118, totalYards: 5402, parTotal: 71,
          holes: CD.map((h) => ({ par: h.par, yardage: 320, hcpIndex: h.hcpIndex })) }
    ]
};
const LOCATION = { address: '369 Caledonia Dr, Pawleys Island, SC 29585, USA',
                   city: 'Pawleys Island', state: 'SC', country: 'United States' };
const SOURCE = { provider: 'golfcourseapi', providerCourseId: 'bwcdmzcy',
                 importedAt: 1757000000000, siFrom: 'male/Copper' };

// SIBLINGS is what must survive. Named once so the probe, the gate and the
// failure message cannot drift apart.
const SIBLINGS = ['tees', 'location', 'source'];

function dbFixture(withSiblings) {
    const course = { name: 'Caledonia Golf & Fish Club', data: CD };
    if (withSiblings) { course.tees = TEES; course.location = LOCATION; course.source = SOURCE; }
    return {
        events: { [CODE]: {
            eventName: 'Saturday', courseName: 'Caledonia Golf & Fish Club',
            activeCourseKey: KEY, gameFormat: 'stroke', courseData: CD,
            players: [{ id: 101, name: 'Dale Whitmore', hcp: '3', playingForMoney: true }],
            settlementMode: 'whole-dollar'
        } },
        global_courses: { [KEY]: course },
        trips: {}
    };
}

// roundLength: '' leaves the default 18; 'back' selects the back nine, which is
// requirement 3 - the published card must stay 18 holes and keep its plain name.
function preScript(opts) {
    const o = opts || {};
    return `
    (function () {
      window.__alerts = [];
      window.alert = function (m) { window.__alerts.push(String(m)); };
      window.confirm = function () { return true; };
      window.print = function () {};

      // ---- the instrumented store ----------------------------------------
      // Real Firebase semantics, applied locally so the resulting record can be
      // read back. Seeded from the same fixture the page was given.
      window.__store = ${JSON.stringify(dbFixture(o.withSiblings !== false).global_courses)};
      // WHAT THE RECORD HELD BEFORE THE PAGE TOUCHED IT. Read after the save,
      // "the siblings survived" cannot be told apart from "there were none".
      // This is the only snapshot that can distinguish them.
      window.__seedKeys = Object.keys((window.__store || {})[${JSON.stringify('caledonia')}] || {}).sort();
      window.__calls = [];
      window.__unhandled = [];
      window.addEventListener('unhandledrejection', function (e) {
        window.__unhandled.push(String((e && e.reason && e.reason.message) || e.reason || '?'));
      });

      // ---- SELF-TEST OF THE SIMULATION ------------------------------------
      // If set() does not wipe and update() does not preserve, this check cannot
      // tell the defect from the fix and must not grade. Run before anything
      // else touches the store.
      (function () {
        var probe = { name: 'n', data: [1], extra: { keep: 1 } };
        var afterSet = {}; applyOp(afterSet, 'k', 'set', { name: 'n2', data: [2] }, probe);
        var afterUpd = {}; applyOp(afterUpd, 'k', 'update', { name: 'n2', data: [2] }, probe);
        window.__simCheck = {
          setWipes:      afterSet.k && afterSet.k.extra === undefined,
          updateKeeps:   afterUpd.k && afterUpd.k.extra !== undefined,
          setWrites:     afterSet.k && afterSet.k.name === 'n2',
          updateWrites:  afterUpd.k && afterUpd.k.name === 'n2'
        };
      })();

      function applyOp(store, key, method, value, seed) {
        if (seed) store[key] = JSON.parse(JSON.stringify(seed));
        if (method === 'set') {
          store[key] = JSON.parse(JSON.stringify(value));
        } else if (method === 'update') {
          store[key] = store[key] || {};
          Object.keys(value).forEach(function (k) {
            store[key][k] = JSON.parse(JSON.stringify(value[k]));
          });
        } else if (method === 'remove') {
          delete store[key];
        }
      }
      window.__applyOp = applyOp;

      var origDatabase = window.firebase.database;
      window.firebase.database = function () {
        var real = origDatabase();
        return { ref: function (p) {
          var r = real.ref(p);
          var path = String(p);
          var m = /^global_courses\\/(.+)$/.exec(path);
          ['set', 'update', 'remove'].forEach(function (meth) {
            var orig = r[meth];
            r[meth] = function (value) {
              if (m) {
                window.__calls.push({ key: m[1], method: meth,
                                      payloadKeys: value ? Object.keys(value).sort() : [] });
                // A REFUSED WRITE MUST NOT MUTATE THE STORE. The server rejected
                // it; applying it locally anyway would model a database that
                // keeps what it just refused, and requirement 4's arm would be
                // reading a record that cannot exist.
                if (!${o.reject ? 'true' : 'false'}) applyOp(window.__store, m[1], meth, value, null);
                return ${o.reject ? 'Promise.reject(Object.assign(new Error("PERMISSION_DENIED: Permission denied"),{code:"PERMISSION_DENIED"}))' : 'Promise.resolve()'};
              }
              // events/* resolve, so the round saves and Round Ready appears.
              return Promise.resolve(orig ? orig.apply(r, arguments) : undefined);
            };
          });
          return r;
        } };
      };

      // ---- drive the wizard the way an organizer does ----------------------
      window.__trace = [];
      var step = 0, tries = 0;
      var iv = setInterval(function () {
        if (++tries > 300) { window.__trace.push('TIMEOUT at phase ' + step); clearInterval(iv); return; }
        try {
          if (step === 0) {
            var box = document.getElementById('enable-custom-course');
            if (!box || (box.offsetParent === null && box.getClientRects().length === 0)) {
              var n1 = document.getElementById('wizard-next-1');
              if (n1 && !n1.disabled) { n1.click(); window.__trace.push('clicked wizard-next-1'); }
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
            ${o.roundLength ? `
            var rl = document.getElementById('round-length-select');
            if (rl) {
              rl.value = ${JSON.stringify(o.roundLength)};
              rl.dispatchEvent(new Event('change', { bubbles: true }));
              window.__trace.push('set round-length to ' + rl.value);
            } else { window.__trace.push('NO round-length-select'); }` : ''}
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
}

// The refusal note, same two facts course-publish-failure-check.js pins.
const ROUND_IS_FINE = /(not affected|card you entered)/i;
const LIST_NOT_UPDATED = /(shared course list|did not update|won.?t get your version)/i;

const PROBE = `
(() => {
  const out = {};
  out.trace = window.__trace || [];
  out.alerts = (window.__alerts || []).slice();
  out.calls = window.__calls || [];
  out.simCheck = window.__simCheck || null;
  out.seedKeys = window.__seedKeys || [];
  out.unhandled = (window.__unhandled || []).slice();
  const rec = (window.__store || {})[${JSON.stringify(KEY)}];
  out.recordExists = !!rec;
  out.recordKeys = rec ? Object.keys(rec).sort() : [];
  out.name = rec ? rec.name : null;
  out.dataLen = (rec && rec.data) ? rec.data.length : 0;
  out.dataHoles = (rec && rec.data) ? rec.data.map(h => h.hole) : [];
  out.dataPars = (rec && rec.data) ? rec.data.map(h => h.par) : [];
  out.dataHcps = (rec && rec.data) ? rec.data.map(h => h.hcpIndex) : [];
  out.teeNames = (rec && rec.tees && rec.tees.male) ? rec.tees.male.map(t => t.name) : null;
  out.city = (rec && rec.location) ? rec.location.city : null;
  out.providerId = (rec && rec.source) ? rec.source.providerCourseId : null;
  // The refusal note, read as RENDERED text - textContent would include the
  // page's own script source, which contains these very phrases.
  const rr = document.getElementById('round-ready-screen');
  const vis = rr && (rr.offsetParent !== null || rr.getClientRects().length > 0);
  out.roundReadyVisible = !!vis;
  out.noteText = (function () {
    // rr-course-publish-note, verified in admin.html:1619. A guessed id would
    // have returned null here and silently fallen through to the whole Round
    // Ready screen, where the assertion might pass on unrelated copy.
    const n = document.getElementById('rr-course-publish-note');
    if (n) return (n.innerText || '').replace(/\\s+/g, ' ').trim();
    return vis ? (rr.innerText || '').replace(/\\s+/g, ' ').trim() : '';
  })();
  return JSON.stringify(out);
})()`;

async function run(opts) {
    const r = await arriveCold({
        // 'game=', not 'edit='. admin.html reads urlParams.get('game') at :2111 and
        // knows no 'edit' param at all, so the wrong one loaded a blank wizard and
        // the driver sat clicking wizard-next-1 three hundred times. The gate
        // caught it as "no publish attempted" rather than reporting a pass.
        url: fileUrl('admin.html', 'game=' + CODE),
        db: dbFixture(opts.withSiblings !== false),
        preScript: preScript(opts),
        expression: PROBE,
        settleMs: 26000
    });
    if (!r.ok) return { ran: false, reason: r.reason };
    try { return { ran: true, ...JSON.parse(r.value) }; }
    catch (e) { return { ran: false, reason: 'non-JSON: ' + String(r.value).slice(0, 300) }; }
}

(async () => {
    const bail = (why, extra) => {
        console.log(JSON.stringify({ verdict: 'COULD NOT RUN', why, extra }, null, 2));
        process.exit(2);
    };
    const failures = [];
    const observed = {};

    // ================= 1. THE RECORD WITH SOMETHING TO LOSE =================
    const rich = await run({ withSiblings: true });
    if (!rich.ran) bail('the rich-record arm did not run: ' + rich.reason);
    observed.richRecord = {
        keys: rich.recordKeys, calls: rich.calls, name: rich.name,
        dataLen: rich.dataLen, teeNames: rich.teeNames, city: rich.city,
        providerId: rich.providerId, trace: rich.trace
    };

    // ---- GATE A: the simulation can tell set from update ----
    const sc = rich.simCheck;
    if (!sc || !sc.setWipes || !sc.updateKeeps || !sc.setWrites || !sc.updateWrites) {
        bail('the set/update simulation cannot distinguish the defect from the fix, so every '
           + 'assertion below would be meaningless', { simCheck: sc });
    }

    // ---- GATE B: a publish was actually attempted, to the seeded key ----
    const courseCalls = (rich.calls || []).filter((c) => c.key === KEY);
    if (courseCalls.length === 0) {
        bail('no write to global_courses/' + KEY + ' was attempted, so nothing was published '
           + 'and "the siblings survived" would be true of a save that never happened',
            { calls: rich.calls, trace: rich.trace });
    }

    // ---- GATE C: THE VACUITY GATE, AND IT IS THE POINT OF THE FILE ----
    // Requirement 1 asks whether the siblings survived. On a record that never
    // had any, that is TRUE OF A .set() - the very defect - and the run reports
    // a clean pass. So the fixture is checked at the moment it was SEEDED, before
    // the page could touch it. Reading only the post-save record cannot tell
    // "nothing was destroyed" from "there was nothing to destroy".
    const seeded = rich.seedKeys || [];
    const missingFromSeed = SIBLINGS.filter((k) => !seeded.includes(k));
    if (missingFromSeed.length > 0) {
        bail('THE FIXTURE HAD NOTHING TO LOSE. The record was seeded as '
           + JSON.stringify(seeded) + ', missing ' + JSON.stringify(missingFromSeed)
           + '. Requirement 1 would pass against a .set() that destroys everything, because '
           + 'there would be nothing for it to destroy. Refusing to grade.',
            { seedKeys: seeded, expected: SIBLINGS });
    }

    const bare = await run({ withSiblings: false });
    if (!bare.ran) bail('the bare-record control did not run: ' + bare.reason);
    observed.bareRecord = { keys: bare.recordKeys, calls: bare.calls, dataLen: bare.dataLen };
    const bareHadSiblings = SIBLINGS.some((k) => bare.recordKeys.includes(k));
    if (bareHadSiblings) {
        bail('the bare-record control came back carrying ' + JSON.stringify(bare.recordKeys)
           + ' - the two fixtures are not actually different, so requirement 1 cannot '
           + 'distinguish a merge from an overwrite', { bare: bare.recordKeys });
    }

    // ================= REQUIREMENT 1 =================
    const lost = SIBLINGS.filter((k) => !rich.recordKeys.includes(k));
    if (lost.length > 0) {
        failures.push('R1 PUBLISHING THE CARD DESTROYED ' + JSON.stringify(lost) + '. The record '
            + 'went in carrying ' + JSON.stringify(SIBLINGS.concat(['name', 'data']).sort())
            + ' and came out as ' + JSON.stringify(rich.recordKeys) + '. The write was '
            + JSON.stringify(courseCalls) + '. A .set() replaces the whole node; per the '
            + 'deployed rules no client can restore what it removed.');
    }
    if (rich.teeNames && rich.teeNames.indexOf('White/Purple') === -1) {
        failures.push('R1 the tee named "White/Purple" did not survive intact: got '
            + JSON.stringify(rich.teeNames));
    }
    // and the half that must ALSO be true - the card really was updated
    const expectPars = JSON.stringify(PARS);
    if (JSON.stringify(rich.dataPars) !== expectPars) {
        failures.push('R1 name/data were not updated by the save: pars came back '
            + JSON.stringify(rich.dataPars) + ', expected ' + expectPars + '. A "merge" that '
            + 'preserves siblings by not writing anything is not a fix.');
    }

    // ================= REQUIREMENT 2 - THE REGRESSION GUARD =================
    // A record with no extra fields must come out as exactly {name, data}: no key
    // added, none dropped, and the card the organizer typed.
    const bareKeys = JSON.stringify(bare.recordKeys);
    if (bareKeys !== JSON.stringify(['data', 'name'])) {
        failures.push('R2 a course with no extra fields came out with keys ' + bareKeys
            + ', expected ["data","name"]. Today\'s behaviour must survive the change exactly.');
    }
    if (JSON.stringify(bare.dataPars) !== expectPars) {
        failures.push('R2 the bare record\'s card is wrong: ' + JSON.stringify(bare.dataPars));
    }
    if (bare.dataLen !== 18) {
        failures.push('R2 the bare record published ' + bare.dataLen + ' holes, expected 18.');
    }

    // ================= REQUIREMENT 3 - THE UNTRIMMED SEAM =================
    const back = await run({ withSiblings: true, roundLength: 'back' });
    if (!back.ran) bail('the back-nine arm did not run: ' + back.reason);
    observed.backNine = { dataLen: back.dataLen, holes: back.dataHoles, name: back.name,
                          trace: back.trace };
    if (!/set round-length to back/.test((back.trace || []).join(' '))) {
        bail('the back-nine arm never set the round length, so "the course was not shortened" '
           + 'would be true of a round that was never nine holes', { trace: back.trace });
    }
    if (back.dataLen !== 18) {
        failures.push('R3 a BACK NINE round published ' + back.dataLen + ' holes to the shared '
            + 'record (' + JSON.stringify(back.dataHoles) + '). A group playing nine holes must '
            + 'not shorten the course for everyone else.');
    }
    if (back.name && /Back 9|Front 9/i.test(back.name)) {
        failures.push('R3 the shared record was renamed to ' + JSON.stringify(back.name)
            + ' - the round-length suffix must not reach global_courses.');
    }

    // ================= REQUIREMENT 4 - A REFUSAL STILL SPEAKS =================
    const refused = await run({ withSiblings: true, reject: true });
    if (!refused.ran) bail('the refusal arm did not run: ' + refused.reason);
    observed.refused = { note: refused.noteText.slice(0, 300),
                         roundReady: refused.roundReadyVisible,
                         calls: refused.calls, unhandled: refused.unhandled };
    if (!refused.roundReadyVisible) {
        bail('the refusal arm never reached Round Ready, so there is no screen on which a note '
           + 'could appear and "the refusal is silent" cannot be told from "the round broke"',
            { trace: refused.trace });
    }
    if (!ROUND_IS_FINE.test(refused.noteText)) {
        failures.push('R4 a refused publish does not tell the organizer their round is '
            + 'unaffected. Note read: ' + JSON.stringify(refused.noteText.slice(0, 200)));
    }
    if (!LIST_NOT_UPDATED.test(refused.noteText)) {
        failures.push('R4 a refused publish does not say the shared course list did not update. '
            + 'Note read: ' + JSON.stringify(refused.noteText.slice(0, 200)));
    }

    const verdict = failures.length ? 'FAIL' : 'PASS';
    console.log(JSON.stringify({ verdict, failures, observed }, null, 2));
    process.exit(failures.length ? 1 : 0);
})().catch((e) => {
    console.log(JSON.stringify({ verdict: 'COULD NOT RUN', reason: String((e && e.message) || e) }, null, 2));
    process.exit(2);
});
