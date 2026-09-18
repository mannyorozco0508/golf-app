// ============================================================================
// qrcode.min.js IS VENDORED, IN THE TOURNAMENT SHELL, AND NOTHING BLOCKS IT.
//
// Until 2026-09-18 tournament.html loaded qrcodejs 1.0.0 from cdnjs at runtime -
// the one third-party script left in the product after Consumer removed its own
// QR (round_ready_share_test.js). Measured in Chrome that day: with the CDN
// unreachable, a tap on a team's Share threw "QRCode is not defined" and the
// share modal NEVER OPENED - no QR, no link, no Copy button. No check had ever
// seen it: all fourteen tournament Chrome tools blocked '*qrcode.min.js'.
//
// Now the library is a repo file, listed the way the Firebase SDKs are
// (firebase_vendor_test.js is the pattern), in TOURNAMENT_SHELL and not SHARED
// - Consumer removed its QR deliberately and must not carry this natively -
// precached by sw.js, and no tool blocks it, so the QR is measured at last.
//
// qrcodejs: https://github.com/davidshimjs/qrcodejs, MIT licence. The minified
// build carries no header; the licence is recorded in HANDOFF.
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPO_ROOT } = require('./helpers/load-script.js');

const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
const FILE = 'qrcode.min.js';
const BYTES = 19927;
const SHA256 = 'c541ef06327885a8415bca8df6071e14189b4855336def4f36db54bde8484f36';   // cdnjs qrcodejs/1.0.0/qrcode.min.js, fetched 2026-09-18

function declaredList(name) {
    const S = read('sync-mobile-web.js');
    const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(S);
    assert.ok(m, name + ' must be declared in sync-mobile-web.js');
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('THE FILE', () => {
    test('exists at the repo root, is exactly the cdnjs build (bytes and sha256), and defines the global QRCode with CorrectLevel', () => {
        const p = path.join(REPO_ROOT, FILE);
        assert.ok(fs.existsSync(p), FILE + ' is missing');
        const buf = fs.readFileSync(p);
        assert.equal(buf.length, BYTES, 'not the byte-exact cdnjs build');
        assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), SHA256, 'the file was regenerated or edited - a vendored library is byte-exact or it is a fork');
        const src = buf.toString('utf8');
        assert.match(src, /^var QRCode;/, 'the global the page calls');
        assert.match(src, /CorrectLevel/, 'the error-correction table the tee sheet passes M from');
    });
});

describe('THE PAGE LOADS THE LOCAL COPY, NOT A CDN', () => {
    test('tournament.html: <script src="./qrcode.min.js"> before its inline script, and no cdnjs anywhere', () => {
        const t = read('tournament.html');
        assert.match(t, /<script src="\.\/qrcode\.min\.js"><\/script>/);
        assert.ok(t.indexOf('./qrcode.min.js') < t.indexOf('<script>\n'), 'loaded before the inline script');
        assert.doesNotMatch(t, /cdnjs\.cloudflare\.com/, 'a runtime CDN script is back');
    });
    test('no page but tournament.html loads it - Consumer stays QR-free', () => {
        ['index.html', 'admin.html', 'leaderboard.html', 'settlement.html', 'trip.html', 'tournament-scorecard.html']
            .forEach((p) => assert.doesNotMatch(read(p), /qrcode\.min\.js/, p + ' loads the QR library'));
    });
});

describe('THE LISTS - derived from the tree, the way the auth SDK was', () => {
    test('TOURNAMENT_SHELL carries it; SHARED_SHELL and CONSUMER_SHELL do not', () => {
        assert.ok(declaredList('TOURNAMENT_SHELL').includes(FILE), 'not in TOURNAMENT_SHELL');
        assert.ok(!declaredList('SHARED_SHELL').includes(FILE), 'SHARED would ship it natively; Consumer removed its QR deliberately');
        assert.ok(!declaredList('CONSUMER_SHELL').includes(FILE));
    });
    test('sw.js precaches it (the root worker serves tournament.html on the live host)', () => {
        const sw = read('sw.js');
        const raw = sw.slice(sw.indexOf('const SHELL_FILES'), sw.indexOf(']', sw.indexOf('const SHELL_FILES')));
        assert.match(raw, /'\.\/qrcode\.min\.js',/);
    });
    test('the built Tournament product gets it through the declared list (build-shell reads TOURNAMENT_SHELL)', () => {
        assert.match(read('build-shell.js'), /const TOURNAMENT = declaredList\('TOURNAMENT_SHELL'\)/);
    });
    test('NO Chrome tool blocks it any more - the QR is measured, not skipped', () => {
        const dir = path.join(REPO_ROOT, 'tools');
        // The one tool that MAY block it is this wave's own, whose second arrival
        // blocks it deliberately to prove the modal opens without it.
        const blockers = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'tournament-tee-qr-check.js')
            .filter((f) => /blockUrls:\s*\[[^\]]*qrcode/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
        assert.deepEqual(blockers, [], 'tools still blocking the (now local) QR library');
        assert.match(fs.readFileSync(path.join(dir, 'tournament-tee-qr-check.js'), 'utf8'), /blockUrls: \['\*qrcode\.min\.js'\]/, 'the no-library control arm exists');
    });
});
