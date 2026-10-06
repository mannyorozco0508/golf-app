#!/usr/bin/env node
// ============================================================================
// THE DESK, ON A PHONE, WITH REAL TAPS (2026-10-06)
//
// Rattle Golf Tournaments. mini-dom proves the payloads; it has no layout and
// dispatches no events, so it cannot say whether an organizer standing at the
// first tee can actually reach Correct, Remove and Export on a 390px screen.
// This arrives cold on tournament.html as the event's owner, taps the Desk tab,
// and then taps the three new controls the way a thumb does.
//
// IT CALLS NOTHING THE PAGE DEFINES (CLAUDE.md). Every move is a mouse press at
// the element's own centre. confirm() is answered by a stub installed BEFORE the
// page scripts run - that is the browser's dialog, not the page's logic.
//
// WHAT IT CANNOT PROVE. The write itself goes to a stand-in database, so this
// says the control fires and what it sends - not that the live rules accept it.
// The remove is refused by PRODUCTION until the one-line rules change is
// published; targaryen is where that claim lives.
//
// EXIT: 0 all three controls reachable and firing; 2 anything else.
// ============================================================================
const { arriveCold, fileUrl } = require('./lib/cold-arrival.js');

const CODE = 'DESKQ';
const CD = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, hcpIndex: i + 1 }));
const EVENT = {
    name: 'Cameron Charity Classic', format: 'scramble', courseName: 'Cameron Park',
    activeCourseKey: 'cameron', courseData: CD, entryFee: 125, eventDate: '2026-10-24',
    startTime: '08:30', createdAt: 1, ownerUid: 'u-org',
    teams: { team1: { num: 1, name: 'Eagles', players: ['Ann Alpha'], handicap: 0 } }
};
const REGS = {
    e1: { fullName: 'Ann Alhpa', email: 'ann@example.com', phone: '555-0001', createdAt: 10 },
    e2: { fullName: 'Bo Bravo', email: 'bo@example.com', phone: '555-0002', createdAt: 20, paid: true, paidAt: 21 },
    e3: { fullName: 'Dee "Deets" Delta, Jr', email: 'dee@example.com', phone: '555-0003', createdAt: 30 }
};
// RECORDED, NOT STUBBED: what the desk sends is the claim. confirm answers yes.
// RECORDED, NOT STUBBED: what the desk sends is the claim. confirm answers yes.
//
// WRAPPED IMMEDIATELY, NOT ON A TIMER. The first version polled for
// window.firebase and wrapped it when it appeared - and measured zero writes,
// because the stand-in SDK is injected BEFORE this script and the page captures
// `db = firebase.database()` at parse time. By the time a 10ms interval fired,
// the page was holding the unwrapped handle. preScript already runs before any
// page script, so the wrap belongs here, inline.
const PRE = `
  window.__sent = []; window.__confirms = [];
  window.confirm = function (m) { window.__confirms.push(String(m)); return true; };
  (function () {
    function wrap() {
      if (!window.firebase || !window.firebase.database || window.__wrapped) return false;
      window.__wrapped = true;
      var orig = window.firebase.database;
      window.firebase.database = function () {
        var real = orig.apply(window.firebase, arguments);
        var out = Object.create(real);
        out.ref = function (p) {
          var r = real.ref(p);
          var proxy = Object.create(r);
          ['update', 'set', 'remove'].forEach(function (m) {
            proxy[m] = function (v) {
              window.__sent.push({ path: String(p), method: m,
                value: (v === undefined ? null : JSON.parse(JSON.stringify(v === null ? null : v))) });
              return r[m] ? r[m].apply(r, arguments) : Promise.resolve();
            };
          });
          proxy.on = function () { return r.on.apply(r, arguments); };
          proxy.once = function () { return r.once.apply(r, arguments); };
          proxy.off = function () { return r.off ? r.off.apply(r, arguments) : undefined; };
          proxy.push = function () { return r.push.apply(r, arguments); };
          proxy.child = function () { return r.child.apply(r, arguments); };
          return proxy;
        };
        return out;
      };
      return true;
    }
    if (!wrap()) { var iv = setInterval(function () { if (wrap()) clearInterval(iv); }, 5); }
  })();`

const SEEN = `(function(){
  var list = document.getElementById('registration-list');
  var ex = document.getElementById('registration-export');
  var box = function (sel) { var e = document.querySelector(sel); if (!e) return null;
    var r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height),
      onScreen: r.top >= 0 && r.bottom <= window.innerHeight + 2000 }; };
  return JSON.stringify({
    rows: document.querySelectorAll('#registration-list .reg-row').length,
    // innerText: rendered text only. This page keeps its application in an
    // inline script, so textContent would match these words in SOURCE.
    listText: String(list && list.innerText || '').replace(/\\s+/g, ' ').slice(0, 120),
    correct: box('.reg-fix'), remove: box('.reg-remove'),
    exportShown: ex ? getComputedStyle(ex).display : 'missing',
    editorShown: getComputedStyle(document.getElementById('registration-edit')).display,
    editName: (document.getElementById('reg-edit-name') || {}).value || '',
    confirms: window.__confirms || [], sent: window.__sent || []
  });
})()`;

(async () => {
    const r = await arriveCold({
        url: fileUrl('tournament.html', 'tourney=' + CODE),
        db: { tournaments: { [CODE]: EVENT }, registrations: { [CODE]: REGS },
              events: {}, trips: {}, global_courses: {} },
        auth: { uid: 'u-org' }, viewport: { width: 390, height: 844 },
        preScript: PRE, settleMs: 3500,
        steps: [
            { tap: '[onclick*="desk"]' }, { sleep: 600 },
            { expression: SEEN },
            // CORRECT: open the editor on the misspelled row, fix it, save.
            { tap: '.reg-fix' }, { sleep: 500 },
            { expression: SEEN },
            { expression: "(function(){var i=document.getElementById('reg-edit-name');"
                + "i.value='Ann Alpha'; i.dispatchEvent(new Event('input',{bubbles:true})); return 'typed';})()" },
            { tap: '#registration-edit .btn-primary' }, { sleep: 500 },
            { expression: SEEN },
            // REMOVE: the third row, with the comma-and-quote name.
            { tap: '.reg-row:nth-of-type(3) .reg-remove' }, { sleep: 500 },
            { expression: SEEN },
            { tap: '#registration-export' }, { sleep: 400 },
            { expression: SEEN }
        ]
    });
    if (!r.ok) { console.log(JSON.stringify({ ok: false, reason: r.reason }, null, 2)); process.exit(2); }
    const s = r.value.filter(v => typeof v === 'string' && v.charAt(0) === '{').map(v => JSON.parse(v));
    const first = s[0], afterOpen = s[1], afterSave = s[2], afterRemove = s[3];
    const out = {
        rows: first.rows,
        correctButton: first.correct, removeButton: first.remove,
        exportShown: first.exportShown,
        editorOpened: afterOpen.editorShown, editorPrefilled: afterOpen.editName,
        sentAfterSave: afterSave.sent,
        confirmAsked: afterRemove.confirms,
        sentAfterRemove: afterRemove.sent.slice(afterSave.sent.length)
    };
    const tappable = (b) => !!b && b.w >= 44 && b.h >= 28;
    out.ok = first.rows === 3
        && tappable(first.correct) && tappable(first.remove)
        && first.exportShown !== 'none' && first.exportShown !== 'missing'
        && afterOpen.editorShown === 'block' && afterOpen.editName === 'Ann Alhpa'
        && out.sentAfterSave.length === 1
        && out.sentAfterSave[0].method === 'update'
        && Object.keys(out.sentAfterSave[0].value || {}).sort().join(',') === 'email,fullName,phone'
        && out.confirmAsked.length === 1 && /Dee/.test(out.confirmAsked[0])
        && out.sentAfterRemove.length === 1 && out.sentAfterRemove[0].method === 'remove';
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 2);
})();
