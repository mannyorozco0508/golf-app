// ============================================================================
// EVERY BROWSER THIS PROCESS STARTED, CLOSED ON EVERY WAY OUT.
//
// WHY THIS EXISTS. Both harnesses killed their Chrome in a `finally`, which is
// correct for a normal return and useless for the way these tools actually
// stop: bail() calls process.exit() the moment something cannot be proven, and
// process.exit DOES NOT RUN `finally`. Every bail therefore left a headless
// Chrome alive. Wave 13 found eleven of them, and the eleventh made a fresh run
// die with "Chrome never wrote DevToolsActivePort" - a resource failure that
// reads exactly like a broken app.
//
// THE MECHANISM: a registry plus process.on('exit'). That listener is the one
// hook that fires for ALL THREE exits - a normal return, an explicit
// process.exit(), and an uncaught throw (which terminates the process, and
// 'exit' runs on the way down). Signals get their own handlers because they
// bypass 'exit' unless something calls process.exit for them.
//
// Deliberately NOT an uncaughtException handler: installing one REPLACES Node's
// default reporting, and a harness that swallowed the stack trace of a genuine
// crash would cost more than the browser it saved. The default already
// terminates, so 'exit' already covers it.
//
// Only synchronous work is possible in an 'exit' listener, which is why kill()
// and rmSync() are used and nothing is awaited.
// ============================================================================

const fs = require('fs');

const live = new Set();
let installed = false;

function shutdownAll() {
    for (const entry of live) {
        try { entry.child.kill('SIGKILL'); } catch (e) { /* already gone */ }
        if (entry.profileDir) {
            try { fs.rmSync(entry.profileDir, { recursive: true, force: true }); } catch (e) {}
        }
    }
    live.clear();
}

function install() {
    if (installed) return;
    installed = true;
    process.on('exit', shutdownAll);
    ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(sig => {
        process.on(sig, () => {
            shutdownAll();
            // 128 + signal number is the shell convention, and re-raising would
            // need the default handler back; an explicit exit is enough here.
            process.exit(sig === 'SIGINT' ? 130 : 143);
        });
    });
}

// Call as soon as the child exists, BEFORE anything that can throw or bail.
function track(child, profileDir) {
    install();
    const entry = { child: child, profileDir: profileDir };
    live.add(entry);
    return entry;
}

// The harness closed it in the ordinary way; stop tracking so the exit handler
// has nothing to do.
function release(entry) {
    if (entry) live.delete(entry);
}

// For the check that proves this works.
function liveCount() { return live.size; }

module.exports = { track, release, shutdownAll, liveCount };
