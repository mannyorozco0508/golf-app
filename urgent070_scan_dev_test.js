// 070 (Manny, Oct 25): the scorecard scan is ON in the DEV app only. GPS_DEV_PRO=1 node tools/build-gps-app.js
// writes features.scanServer = true into the built gps-config.js; a plain (release) build leaves it absent (off),
// and the repo's gps-config.js never has it.
'use strict';
const test0 = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const { execFileSync } = require('child_process');
const ON = fs.existsSync(path.join(__dirname, 'gps-scan-client.js'));
const test = (n, f) => test0(n, { skip: ON ? false : 'Consumer tree: no GPS files' }, f);
function cfgOf(file) {
    const sb = {}; sb.window = sb; vm.createContext(sb); vm.runInContext(fs.readFileSync(file, 'utf8'), sb);
    return sb.HARDPAN_GPS_CONFIG;
}
test('the repo config has no scanServer (absent = off)', () => {
    assert.ok(!/scanServer/.test(fs.readFileSync(path.join(__dirname, 'gps-config.js'), 'utf8')));
    assert.notStrictEqual((cfgOf(path.join(__dirname, 'gps-config.js')).features || {}).scanServer, true);
});
test('dev build (GPS_DEV_PRO=1): scanServer true; release build: absent', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'gpsbuild-scan-')), dev = fs.mkdtempSync(path.join(os.tmpdir(), 'gpsbuild-scan-dev-'));
    try {
        execFileSync(process.execPath, [path.join(__dirname, 'tools/build-gps-app.js')], { env: Object.assign({}, process.env, { GPS_APP_DEST: plain, GPS_DEV_PRO: '', GPS_PAYWALL: '' }), stdio: 'ignore' });
        execFileSync(process.execPath, [path.join(__dirname, 'tools/build-gps-app.js')], { env: Object.assign({}, process.env, { GPS_APP_DEST: dev, GPS_DEV_PRO: '1', GPS_PAYWALL: '' }), stdio: 'ignore' });
        const rel = cfgOf(path.join(plain, 'gps-config.js')), d = cfgOf(path.join(dev, 'gps-config.js'));
        assert.ok(!/scanServer/.test(fs.readFileSync(path.join(plain, 'gps-config.js'), 'utf8')), 'release: not written');
        assert.notStrictEqual((rel.features || {}).scanServer, true, 'release: off');
        assert.strictEqual(d.features.scanServer, true, 'dev: on');
        assert.strictEqual(d.devPro, true);
        // The other feature switches are untouched by it.
        assert.deepStrictEqual(Object.keys(d.features).filter((k) => k !== 'scanServer').sort(), Object.keys(rel.features).sort());
    } finally { fs.rmSync(plain, { recursive: true, force: true }); fs.rmSync(dev, { recursive: true, force: true }); }
});
