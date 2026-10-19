#!/usr/bin/env node
// ============================================================================
// npm run sim:setup - THE THREE SETUP-FLOW SIMULATIONS OF MAILBOX 013, IN SEQUENCE
//
//   tools/sim/setup-gps-first.js    group 1: GPS first, location denied
//   tools/sim/setup-games-first.js  group 2: Games first, Join
//   tools/sim/setup-shapes.js       group 3: the round's shapes (20 pairings, 1 golfer,
//                                   2 groups, two-tee start, back nine, two nines),
//                                   switching, Back, kill + reopen, airplane mode
//
// One at a time (each drives headless Chrome; two at once starve each other). A file
// that is not in this tree (the other two are written on their own branches) is
// skipped with a note, not failed. Exit 1 if any simulation exits non-zero.
// Arguments after -- go to every simulation (e.g. --out <dir>).
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const SIMS = ['setup-gps-first.js', 'setup-games-first.js', 'setup-shapes.js'];
const args = process.argv.slice(2);
const results = [];
for (const f of SIMS) {
    const file = path.join(__dirname, f);
    if (!fs.existsSync(file)) { console.log('[sim:setup] SKIP ' + f + ' - not in this tree (written on its own branch)'); results.push({ sim: f, skipped: true }); continue; }
    console.log('[sim:setup] RUN  ' + f);
    const t = Date.now();
    const r = spawnSync(process.execPath, [file].concat(args), { stdio: 'inherit' });
    results.push({ sim: f, exit: r.status, seconds: Math.round((Date.now() - t) / 1000) });
}
console.log('[sim:setup] ' + JSON.stringify(results));
process.exit(results.some((r) => !r.skipped && r.exit !== 0) ? 1 : 0);
