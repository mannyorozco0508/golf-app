// ============================================================================
// E4a IN CHROME: A PHONE PHOTO WITH GPS IN ITS EXIF GOES IN; WHAT THE PAGE
// UPLOADS CARRIES NO EXIF, NO GPS, AND IS AT MOST 1600 PX (2026-11-09)
//
// Cold arrival (tools/lib/cold-arrival.js): the golfer's keyed team link, the
// page's own scripts and listeners. Nothing the page defines is called. The
// golfer's actions are reproduced as the browser delivers them:
//   - tapping the Photos tab and Post is a real tap (Input events);
//   - CHOOSING A FILE is the browser setting input.files and firing `change`
//     on #photo-file - done here with a DataTransfer holding the fixture, which
//     is exactly what the file picker hands the page;
//   - typing the caption is Input.insertText.
// Only two things are stand-ins, installed before any page script: the
// database (cold-arrival's) and the network call to Storage (window.fetch for
// firebasestorage.googleapis.com is recorded - URL, headers, the BYTES - and
// answered 200). The anonymous session's getIdToken answers 'test-token'.
//
// THE FIXTURE: icon-1024.png resized by macOS `sips` to 3000x2250 JPEG, then
// tools/lib/exif-jpeg.js inserts an EXIF APP1 with GPSInfo (Papago, 33.4500 N
// 111.9500 W). The scanner is checked against it first: it MUST find the EXIF
// and the GPS tag there, or a clean upload proves nothing.
//
// WHAT THIS CANNOT PROVE: the real Storage upload (storage.rules is proven on
// the Storage emulator in tournament_photo_storage_rules_test.js), a real iOS
// Safari canvas encoder (Chrome's is measured here), and HEIC input.
//
// Skipped when Chrome or `sips` is not on this machine.
// BASELINE (final file): against the E2 commit 77a216c2 (no Photos tab):
//   all 2 tests: 1 PASS / 1 FAIL - test 1 (the fixture really carries GPS EXIF)
//   passes, it tests the fixture; test 2 fails (nothing to tap, nothing uploaded).
//   against the build: all 2 tests: 2 PASS / 0 FAIL.
// NEGATIVE CONTROLS (restored by copying a saved file back, sha printed with
// RESTORED-OK): the page uploads the ORIGINAL file instead of the re-encoded
// blob -> test 2 fails; the meta written BEFORE the upload -> test 2 fails.
// ============================================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { withGpsExif, scanJpeg } = require('./tools/lib/exif-jpeg.js');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SIPS = '/usr/bin/sips';
const SKIP = !fs.existsSync(CHROME) ? { skip: 'no Chrome' } : !fs.existsSync(SIPS) ? { skip: 'no sips (macOS)' } : {};
const K4 = '4'.repeat(32);
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 5];

let fixture = null;
function makeFixture() {
    if (fixture) return fixture;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-exif-'));
    const out = path.join(dir, 'base.jpg');
    execFileSync(SIPS, ['-s', 'format', 'jpeg', '-z', '2250', '3000', path.join(__dirname, 'icon-1024.png'), '--out', out], { stdio: 'ignore' });
    fixture = withGpsExif(fs.readFileSync(out), 33.45, -111.95);
    fs.rmSync(dir, { recursive: true, force: true });
    return fixture;
}

// Installed before any page script: record the Storage upload, give the
// anonymous session a token.
const PRE = `(function () {
  window.__uploads = [];
  var realAuth = window.firebase && window.firebase.auth;
  if (realAuth) window.firebase.auth = function () { var a = realAuth.apply(this, arguments);
    if (a.currentUser && !a.currentUser.getIdToken) a.currentUser.getIdToken = function () { return Promise.resolve('test-token'); }; return a; };
  var realFetch = window.fetch;
  window.fetch = function (url, opts) {
    if (String(url).indexOf('firebasestorage.googleapis.com') === -1) return realFetch.apply(this, arguments);
    var body = opts && opts.body;
    var writesBefore = (window.__coldWrites || []).length;
    return (body && body.arrayBuffer ? body.arrayBuffer() : Promise.resolve(new ArrayBuffer(0))).then(function (ab) {
      var u8 = new Uint8Array(ab), s = '';
      for (var i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
      window.__uploads.push({ url: String(url), method: opts.method, headers: opts.headers, size: u8.length, type: body && body.type, b64: btoa(s), writesBefore: writesBefore });
      return new Response('{"name":"ok"}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  };
})();`;

test('1. the fixture is a real phone-style photo: 3000x2250 JPEG whose EXIF carries GPS (the scanner finds both)', SKIP, () => {
    const s = scanJpeg(makeFixture());
    assert.equal(s.jpeg, true);
    assert.equal(s.exif, true, 'EXIF APP1 found');
    assert.equal(s.gps, true, 'GPSInfo tag found');
    assert.equal(s.exifAnywhere, true);
    assert.deepEqual([s.width, s.height], [3000, 2250]);
});

test('2. Photos tab -> choose the photo -> caption -> Post: ONE upload of a re-encoded JPEG (no EXIF, no GPS, 1600 px), THEN one keyed meta update', SKIP, async () => {
    const { arriveCold, fileUrl } = require('./tools/lib/cold-arrival.js');
    const b64 = makeFixture().toString('base64');
    // EC4 C (2026-11-11): the block is on the card once every hole is scored.
    const scores = {}; for (let h = 1; h <= 18; h++) scores['team4_h' + h] = PARS[h - 1];
    const db = { tournaments: { PH1: { name: 'Rattle Classic', format: 'scramble', courseName: 'Papago', createdAt: 1, ownerUid: 'u-org',
        courseData: PARS.map((p, i) => ({ hole: i + 1, par: p, hcpIndex: i + 1 })), scores,
        teams: { team4: { num: 4, name: 'Team 4', players: ['Al Lopez', 'Jo Kim'], startingHole: 4 } } } }, events: {}, trips: {} };
    const choose = `(() => { const bin = atob(${JSON.stringify(b64)}); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const f = new File([u8], 'IMG_0412.JPG', { type: 'image/jpeg' }); const dt = new DataTransfer(); dt.items.add(f);
        const input = document.getElementById('photo-file'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return 'chosen ' + u8.length; })()`;
    const probe = `JSON.stringify({ msg: (document.getElementById('photo-msg') || {}).innerText || '', preview: (() => { const i = document.getElementById('photo-preview'); return i && i.style.display !== 'none' ? [i.naturalWidth, i.naturalHeight] : null; })(),
        uploads: window.__uploads || [], writes: (window.__coldWrites || []).map(w => ({ op: w.op, path: w.path, value: w.value })) })`;
    const r = await arriveCold({ url: fileUrl('tournament-scorecard.html', `tourney=PH1&team=4&k=${K4}`), db, preScript: PRE, settleMs: 4000,
        steps: [{ sleep: 200 }, { expression: choose }, { sleep: 2500 }, { expression: probe },
            { tap: '#photo-caption' }, { cdp: { method: 'Input.insertText', params: { text: 'Team 4 on the 7th tee' } } },
            { tap: '#photo-post' }, { sleep: 2500 }, { expression: probe }] });
    assert.ok(r.ok, 'could not run: ' + r.reason);
    const vals = r.value.filter((v) => typeof v === 'string' && v[0] === '{').map((v) => JSON.parse(v));
    const [chosen, posted] = vals;
    assert.deepEqual(chosen.preview, [1600, 1200], 'the preview is the resized photo');
    assert.equal(chosen.uploads.length, 0, 'choosing uploads nothing');
    assert.equal(posted.uploads.length, 1, 'one upload');
    const up = posted.uploads[0];
    assert.equal(up.url, 'https://firebasestorage.googleapis.com/v0/b/golfapp-9fb21.firebasestorage.app/o?uploadType=media&name=tournamentPhotos%2FPH1%2Fpending%2FSTUB.jpg');
    assert.equal(up.method, 'POST');
    assert.deepEqual(up.headers, { 'Content-Type': 'image/jpeg', Authorization: 'Firebase test-token' });
    assert.equal(up.writesBefore, 0, 'the file goes BEFORE the database write');
    const bytes = Buffer.from(up.b64, 'base64');
    assert.equal(bytes.length, up.size);
    const s = scanJpeg(bytes);
    assert.equal(s.jpeg, true, 'a whole JPEG');
    assert.equal(s.exif, false, 'no EXIF segment');
    assert.equal(s.exifAnywhere, false, 'no "Exif" signature anywhere in the file');
    assert.equal(s.gps, false, 'no GPS tag');
    assert.deepEqual([s.width, s.height], [1600, 1200], 'longest side 1600');
    assert.ok(bytes.length < makeFixture().length && bytes.length <= 5 * 1024 * 1024, 'smaller than the original, within 5 MB: ' + bytes.length);
    const w = posted.writes.filter((x) => x.op === 'update');
    assert.equal(w.length, 1, 'one database update: ' + JSON.stringify(posted.writes));
    assert.deepEqual(w[0].value, {
        'tournamentPhotoMeta/PH1/pending/STUB': { team: 'team4', at: { '.sv': 'timestamp' }, w: 1600, h: 1200, caption: 'Team 4 on the 7th tee' },
        'photoProofs/PH1/STUB': { who: 'team4', k: K4, t: { '.sv': 'timestamp' } } });
    assert.equal(posted.msg, '✓ Sent. It goes on the wall when the organizer approves it.');
});
