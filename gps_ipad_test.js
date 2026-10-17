// ============================================================================
// GPS ON AN iPAD (mailbox 004, 2026-10-17)
//   The merged app ships on com.rattlegolf.app, whose listing supports iPad. A Wi-Fi iPad has no
//   GPS chip: no fix, or a Wi-Fi fix hundreds of metres wide. The GPS screen says so in one
//   sentence (scores and games still work) instead of wild yardages; a cellular iPad (a real
//   fix) and every iPhone never see it, and "location is off" keeps its own words.
// ============================================================================
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ON = fs.existsSync(path.join(__dirname, 'gps-view.js'));
const test = (n, f) => test0(n, { skip: ON ? false : 'Consumer tree: no gps-view.js' }, f);
function view(nav) {
    const sb = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, JSON, Object, Math, Number, String, Date, Promise, RegExp, isFinite, setTimeout, clearTimeout, navigator: nav };
    sb.window = sb;
    sb.HARDPAN_GPS_CONFIG = {};
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8'), sb);
    return sb.HardPanGps;
}
const IPAD = { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15', maxTouchPoints: 5 };
const IPAD_DESKTOP = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 5 };
const MAC = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 0 };
const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', maxTouchPoints: 5 };

test('a Wi-Fi iPad (no fix, or a fix worse than 100 m) gets the one sentence', () => {
    for (const nav of [IPAD, IPAD_DESKTOP]) {
        const V = view(nav);
        for (const e of ['unavailable', 'timeout', 'unsupported']) assert.match(V.ipadNoGps(e, null), /GPS needs a phone \(or a cellular iPad\) with location/);
        assert.match(V.ipadNoGps(null, { acc: 450 }), /this iPad can.t place you on the course\. Scores, games and the card all work here\./);
    }
});
test('a cellular iPad (a real fix), an iPhone, a Mac, and "location is off" never get it', () => {
    assert.equal(view(IPAD).ipadNoGps(null, { acc: 8 }), '', 'a cellular iPad');
    assert.equal(view(IPAD).ipadNoGps(null, null), '', 'still finding you');
    assert.equal(view(IPAD).ipadNoGps('denied', null), '', 'location off keeps its own words');
    assert.equal(view(IPHONE).ipadNoGps('unavailable', { acc: 900 }), '', 'an iPhone');
    assert.equal(view(MAC).ipadNoGps('unavailable', null), '', 'a Mac');
});
test('the screen shows it in place of the generic "Cannot find you" line', () => {
    const v = fs.readFileSync(path.join(__dirname, 'gps-view.js'), 'utf8');
    assert.match(v, /var ipadMsg = ipadNoGps\(S\.geoError, fix\);\n\s*if \(ipadMsg\) msg = ipadMsg;\n\s*txt\('\.gps-msg', msg\);/);
});

// THE LOCATION POLICY (mailbox 005, Manny 2026-10-17: keep "set the green by GPS"; save no uid or
// name with the pin, and say so in the privacy policy).
test('a saved green carries no uid and no name - the spot, the time, how it was set', () => {
    const G = require('./gps-geo.js');
    const pin = G.makePin([33.45, -79.15], [33.4499, -79.15], [33.4501, -79.15], { mid: { lat: 33.44, lng: -79.14 }, at: 1 }, 1000, 'gps');
    const keys = JSON.stringify(pin);
    assert.deepEqual(Object.keys(pin).sort(), ['at', 'back', 'by', 'front', 'mid', 'prev']);
    assert.ok(!/uid|name|email|owner/i.test(keys), keys);
    assert.match(fs.readFileSync(path.join(__dirname, 'privacy.html'), 'utf8'), /A saved green carries no name and no account id/);
});
