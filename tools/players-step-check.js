#!/usr/bin/env node
// ============================================================================
// THE TWO THINGS AN ORGANIZER DOES ON THE PLAYERS STEP, ON A REAL FIELD
// (2026-10-08)
//
//   1. A TEE PER GOLFER - one <select class="p-tee-input"> on every player row,
//      carrying the course's rated tee sets.
//   2. GROUPS - one divider per foursome with working - and + controls.
//   3. SETTING THE FOURSOMES - up/down and "Move to Group N" on every row, and
//      the ROSTER ORDER THE SAVE WOULD CAPTURE actually changing as a result.
//      That last part is the claim: a control that moves a node but leaves
//      captureCurrentPlayerInputs() reading the old order would change nothing
//      about the tee sheet, and would look perfect on screen.
//
// WHY THIS CHECK EXISTS, AND IT IS MY OWN FAULT. I reported the per-golfer tee
// picker as missing from the app - "nothing writes a per-golfer tee". It was
// never missing: it shipped on 2026-10-05 (2c251b3, merged a2a28ec), Manny
// tested it on Tri-Mountain, and it is byte-for-byte present on main. What was
// missing was in MY harness: the stand-in database passed global_courses: {},
// so globalCourses[activeCourseKey] was undefined, courseTeeChoices() returned
// an empty list, the round-level tee panel stayed hidden, and
// appendTeeControl() had no options to copy onto each row. An empty fixture and
// a deleted feature look identical from the outside.
//
// SO THE CHECK LOADS THE REAL COURSE RECORD, and asserts the OPTION TEXTS - not
// just that a select exists. A select with no options is the failure this is
// really guarding against, and it is the one a count alone would miss.
//
// IT CALLS NOTHING THE PAGE DEFINES: it opens the organizer link, taps "Next:
// Players", and reads what rendered.
//
// A UNIT TEST CANNOT DO THIS. mini-dom does not parse static attributes, has no
// layout, and the per-row select is built by DOM calls from a round-level
// select that must itself have been filled first - three things the harness
// cannot reproduce. per_golfer_tees_test.js holds the arithmetic; this holds
// the screen.
//
// EXIT: 0 both controls present and populated; 2 anything else.
// ============================================================================

const { arriveCold } = require('./lib/cold-arrival.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO = path.join(__dirname, '..');
const CODE = 'TEEFLD';
// 24 GOLFERS, which is the field this was reported broken on - six foursomes,
// so the group dividers have something to divide.
const NAMES = ['Ann Alpha', 'Ben Bravo', 'Cal Charlie', 'Dee Delta', 'Eve Echo', 'Fay Foxtrot',
               'Gus Golf', 'Hal Hotel', 'Ivy India', 'Jon Juliett', 'Kim Kilo', 'Lou Lima',
               'Moe Mike', 'Ned Nov', 'Oli Oscar', 'Pat Papa', 'Quin Quebec', 'Ron Romeo',
               'Sue Sierra', 'Tom Tango', 'Uma Uni', 'Vic Victor', 'Wes Whiskey', 'Xan Xray'];
const PLAYERS = NAMES.map((n, i) => ({ id: 101 + i, name: n, hcp: String(2 + (i % 20)), playingForMoney: true }));
const CD = []; for (let i = 1; i <= 18; i++) CD.push({ hole: i, par: 4, hcpIndex: i });
// A COURSE WITH RATED TEES, in the shape the app stores and reads: rating and
// slope under the SHORT names, which is how an imported course is held and
// which courseTeeChoices() accepts alongside the provider's long ones.
const holes = CD.map(h => ({ par: h.par, hcpIndex: h.hcpIndex, yardage: 380 }));
const TEE = (name, rating, slope) => ({ name, rating, slope, parTotal: 72, totalYards: 6500, holes });
const COURSE = {
    name: 'Rated Pines', data: CD,
    tees: { male: [TEE('Black', 73.1, 140), TEE('Blue', 71.2, 132), TEE('White', 68.8, 125)],
            female: [TEE('White', 72.4, 131), TEE('Red', 67.9, 118)] }
};
const ROUND = {
    eventName: 'Tee Field', courseName: 'Rated Pines', activeCourseKey: 'ratedpines',
    gameFormat: 'stroke', players: PLAYERS, courseData: CD, scores: {},
    ownerUid: 'me-uid', organizerToken: 'tok-players-step'
};
const DB = { events: { [CODE]: ROUND }, trips: {}, global_courses: { ratedpines: COURSE }, tournaments: {} };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serveRepo(root) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const u = req.url.split('?')[0];
            const f = path.join(root, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
            if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
                res.writeHead(404); return res.end('no');
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
            res.end(fs.readFileSync(f));
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

// String.raw: a template literal eats a single backslash, which has already
// turned /\s+/ into /s+/ in this repo's checks more than once.
const READ = String.raw`(function () {
  var rows = document.querySelectorAll('.player-row');
  var perRow = document.querySelectorAll('.p-tee-input');
  var divs = Array.prototype.slice.call(document.querySelectorAll('.group-divider'));
  var plus = 0, minus = 0;
  divs.forEach(function (d) {
    var b = d.querySelectorAll('button');
    for (var i = 0; i < b.length; i++) {
      var t = String(b[i].innerText || '');
      if (t.indexOf('+') !== -1) plus++;
      if (t.indexOf('−') !== -1 || t.indexOf('-') !== -1) minus++;
    }
  });
  var optionTexts = perRow.length
    ? Array.prototype.slice.call(perRow[0].options).map(function (o) { return String(o.text || '').trim(); })
    : [];
  // EVERY ROW, not just the first: a loop that stopped early would leave the
  // last golfers with no tee to pick.
  var allPopulated = true;
  for (var k = 0; k < perRow.length; k++) if (perRow[k].options.length < 2) allPopulated = false;
  // THE ORDER AS THE SAVE WOULD READ IT: rows in DOM order, by the id each row
  // carries - which is exactly what captureCurrentPlayerInputs() does.
  var order = Array.prototype.slice.call(rows).map(function (r) {
    var n = r.querySelector('.p-name-input');
    return n ? String(n.value || '').split(' ')[0] : '?';
  });
  return JSON.stringify({
    order: order,
    orderBtns: document.querySelectorAll('.p-order-btn').length,
    groupSelects: document.querySelectorAll('.p-group-input').length,
    groupSelectOptions: (function () {
      var g = document.querySelector('.p-group-input');
      return g ? Array.prototype.slice.call(g.options).map(function (o) { return o.text; }) : [];
    })(),
    rows: rows.length, perRowTeeSelects: perRow.length, allPopulated: allPopulated,
    optionTexts: optionTexts,
    dividers: divs.length, plus: plus, minus: minus,
    dividerText: divs.slice(0, 2).map(function (d) { return String(d.innerText || '').replace(/\s+/g, ' ').trim(); }),
    errs: (window.__errs || []).slice(0, 3)
  });
})()`;

(async () => {
    const out = { what: 'a tee per golfer and the group controls, on a 24-golfer field' };
    const served = await serveRepo(REPO);
    try {
        const r = await arriveCold({
            url: 'http://127.0.0.1:' + served.port + '/admin.html?game=' + CODE
                 + '&organizer=' + ROUND.organizerToken,
            db: DB, auth: { uid: 'me-uid' }, viewport: { width: 390, height: 844 }, settleMs: 4200,
            preScript: "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message));});",
            steps: [{ sleep: 1600 },
                    // THE ORGANIZER'S OWN ROUTE to the roster, by tapping the
                    // page's own control rather than calling a renderer.
                    { expression: "(function(){var b=Array.prototype.slice.call(document.querySelectorAll('button,.wizard-edit-link,a')).filter(function(e){return /players/i.test(String(e.innerText||''));});return b.length?(b[0].click(),'tapped '+b[0].innerText.trim()):'no Players control';})()" },
                    { sleep: 1500 }, { expression: READ },
                    // A REAL TAP ON THE SECOND ARROW OF THE FIRST ROW (down).
                    { expression: "(function(){var r=document.querySelectorAll('.player-row')[0];var b=r.querySelectorAll('.p-order-btn');if(b.length<2)return 'no order buttons';b[1].click();return 'tapped down on row 1';})()" },
                    { sleep: 350 }, { expression: READ },
                    // AND MOVE THE LAST GOLFER TO GROUP 1 through the select,
                    // dispatching change the way a picker does.
                    { expression: "(function(){var rs=document.querySelectorAll('.player-row');var r=rs[rs.length-1];var s=r.querySelector('.p-group-input');if(!s)return 'no group select';s.value='1';s.dispatchEvent(new Event('change',{bubbles:true}));return 'moved the last golfer to group 1';})()" },
                    { sleep: 400 }, { expression: READ }]
        });
        if (!r.ok) throw new Error('arrival: ' + r.reason);
        out.taps = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) !== '{');
        const reads = (r.value || []).filter(v => typeof v === 'string' && v.charAt(0) === '{').map(v => JSON.parse(v));
        if (reads.length < 3) throw new Error('expected three reads, got ' + reads.length);
        out.before = reads[0]; out.afterDown = reads[1]; out.afterGroupMove = reads[2];
        Object.assign(out, reads[0]);
    } catch (e) {
        out.error = String(e && e.message || e);
    } finally {
        try { served.server.close(); } catch (e) {}
    }

    const faults = [];
    if (out.error) faults.push('error: ' + out.error);
    if ((out.errs || []).length) faults.push('the page threw: ' + JSON.stringify(out.errs));
    // POSITIVE CONTROL FIRST: the roster really rendered, or every assertion
    // below is true of an empty step.
    if (out.rows !== 24) faults.push('the Players step shows ' + out.rows + ' rows, expected 24 - this is not the roster');
    // 1. A TEE PER GOLFER.
    if (out.perRowTeeSelects !== 24) faults.push('only ' + out.perRowTeeSelects + ' of 24 golfers have a tee picker');
    if (!out.allPopulated) faults.push('a per-golfer tee picker rendered with no tees in it');
    if ((out.optionTexts || []).length !== 5) faults.push('the tee picker offers ' + (out.optionTexts || []).length + ' tees, expected the course’s 5: ' + JSON.stringify(out.optionTexts));
    ['Black', 'Blue', 'White', 'Red'].forEach((n) => {
        if (!(out.optionTexts || []).some(t => t.indexOf(n) !== -1)) faults.push('the tee picker does not offer ' + n);
    });
    // 2. THE GROUPS.
    if (out.dividers !== 6) faults.push('24 golfers produced ' + out.dividers + ' group dividers, expected 6');
    if (out.plus !== 6 || out.minus !== 6) faults.push('the group resize controls are incomplete: ' + out.minus + ' minus, ' + out.plus + ' plus');
    // 3. SETTING THE FOURSOMES.
    const b = out.before || {}, d = out.afterDown || {}, g = out.afterGroupMove || {};
    if (b.orderBtns !== 48) faults.push('expected 48 order arrows (two per golfer), found ' + b.orderBtns);
    if (b.groupSelects !== 24) faults.push('expected a group picker on all 24 rows, found ' + b.groupSelects);
    if ((b.groupSelectOptions || []).length !== 6) faults.push('the group picker offers ' + (b.groupSelectOptions || []).length + ' groups, expected 6: ' + JSON.stringify(b.groupSelectOptions));
    // THE DOWN ARROW ACTUALLY MOVED THE ROSTER the save would read.
    if (!(b.order && d.order)) faults.push('could not read the roster order');
    else {
        if (d.order[0] !== b.order[1] || d.order[1] !== b.order[0]) {
            faults.push('tapping down did not swap the first two golfers: ' + JSON.stringify(b.order.slice(0, 3)) + ' -> ' + JSON.stringify(d.order.slice(0, 3)));
        }
        if (d.order.length !== 24) faults.push('the roster changed size on a move: ' + d.order.length);
        if (d.order.slice().sort().join() !== b.order.slice().sort().join()) faults.push('a move lost or duplicated a golfer');
    }
    // AND "MOVE TO GROUP 1" PUT THEM IN GROUP 1 - index 3 on default sizes.
    if (g.order) {
        const last = b.order[b.order.length - 1];
        const at = g.order.indexOf(last);
        if (!(at >= 0 && at <= 3)) faults.push('"Move to Group 1" left ' + last + ' at index ' + at + ', not in the first foursome');
        if (g.order.length !== 24) faults.push('the roster changed size on a group move: ' + g.order.length);
        if (g.order.slice().sort().join() !== b.order.slice().sort().join()) faults.push('a group move lost or duplicated a golfer');
    }
    out.faults = faults;
    out.ok = faults.length === 0;
    console.log(JSON.stringify(out, null, 1));
    process.exit(out.ok ? 0 : 2);
})();
