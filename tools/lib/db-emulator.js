// ============================================================================
// A FIREBASE DATABASE EMULATOR RUNNING THE REAL RULES (scorecard-lock wave).
//
// Starts the cached emulator jar (~/.cache/firebase/emulators, Java on PATH or
// ~/jdks), loads a rules file, and hands back admin helpers. Used by checks
// that must see the RULES refuse a write - the cold-arrival stand-in accepts
// everything, so a refusal can only be measured here.
//
// EMULATOR-ONLY TRANSFORM: the live registrations email regex uses \s inside a
// character class, which production accepts and emulator 4.11.2 refuses to
// load. It is swapped for a literal space in what is SENT to the emulator; the
// file on disk is never changed. Callers print `transformed`.
//
// AUTH: a user is passed as ?auth=<unsigned token>. Measured on 4.11.2: any
// Authorization: Bearer header is treated as ADMIN.
// ============================================================================
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function findJar() {
    const dir = path.join(os.homedir(), '.cache', 'firebase', 'emulators');
    const f = fs.existsSync(dir) && fs.readdirSync(dir).filter((x) => /^firebase-database-emulator-v[\d.]+\.jar$/.test(x)).sort().pop();
    return f ? path.join(dir, f) : null;
}
function findJava() {
    try { execSync('java -version', { stdio: 'ignore' }); return 'java'; } catch (e) { /* not on PATH */ }
    const jdks = path.join(os.homedir(), 'jdks');
    const d = fs.existsSync(jdks) && fs.readdirSync(jdks).sort().pop();
    const j = d && path.join(jdks, d, 'Contents', 'Home', 'bin', 'java');
    return j && fs.existsSync(j) ? j : null;
}

async function startEmulator({ rulesPath, port, ns }) {
    const jar = findJar(), java = findJava();
    if (!jar) throw new Error('no cached database emulator jar under ~/.cache/firebase/emulators');
    if (!java) throw new Error('no Java');
    const base = `http://127.0.0.1:${port}`;
    const proc = spawn(java, ['-jar', jar, '--host', '127.0.0.1', '--port', String(port)], { stdio: 'ignore' });
    const stop = () => { try { proc.kill(); } catch (e) { /* gone */ } };
    process.on('exit', stop);
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { await fetch(`${base}/.json?ns=${ns}`); up = true; } catch (e) { await new Promise((r) => setTimeout(r, 500)); } }
    if (!up) { stop(); throw new Error('the emulator did not start on ' + port); }
    const raw = fs.readFileSync(rulesPath, 'utf8');
    const sent = raw.split('[^@\\\\s]').join('[^@ ]');
    const transformed = (raw.match(/\[\^@\\\\s\]/g) || []).length;
    const r = await fetch(`${base}/.settings/rules.json?ns=${ns}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: sent });
    if (r.status !== 200) { stop(); throw new Error('the emulator refused the rules: ' + (await r.text()).slice(0, 300)); }
    const admin = async (method, p, body) => {
        const res = await fetch(`${base}/${p}.json?ns=${ns}`, { method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body) });
        return res.json();
    };
    return { base, ns, url: `${base}?ns=${ns}`, stop, admin, transformed };
}

module.exports = { startEmulator };
